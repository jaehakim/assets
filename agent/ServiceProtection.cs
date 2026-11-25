using System.Diagnostics;
using System.Security.Principal;

namespace AssetFlow.Agent;

/// <summary>
/// 0.3.0 removal protection (AR-005, removal-protection plan stage A).
/// The service security descriptor gives full control to SYSTEM only. Administrators may query and start the service but
/// cannot stop, reconfigure, delete it or change its permissions, so "sc stop/delete", services.msc and the old uninstaller fail.
/// Removal goes through the approved flow, which runs inside this SYSTEM service. The install folder becomes read-only
/// for Administrators/Users; SYSTEM (updates, self-removal) keeps full control.
/// This raises the bar for local administrators; it is not a boundary against taking ownership or offline disk access.
/// </summary>
public static class ServiceProtection
{
    public const string ServiceName = "AssetFlowAgent";
    // SY: all rights (CC DC LC SW RP WP DT LO CR SD RC WD WO); BA: query config/status, enumerate, start, interrogate, user control, read;
    // IU/SU/AU: query only. No WP (stop), DT (pause), DC (change config), SD (delete), WD/WO for anyone but SYSTEM.
    public const string ProtectedSddl = "D:(A;;CCDCLCSWRPWPDTLOCRSDRCWDWO;;;SY)(A;;CCLCSWRPLOCRRC;;;BA)(A;;CCLCSWLOCRRC;;;IU)(A;;CCLCSWLOCRRC;;;SU)(A;;CCLCSWLOCRRC;;;AU)";

    /// <summary>Rights granted to a trustee in an SDDL DACL, e.g. Rights(ProtectedSddl, "BA") => "CCLCSWRPLOCRRC".</summary>
    public static string Rights(string sddl, string trustee) =>
        System.Text.RegularExpressions.Regex.Match(sddl, $@"\(A;;([A-Z]+);;;{trustee}\)").Groups[1].Value;

    /// <summary>Only protect a real installation (Program Files) when running as the SYSTEM service.</summary>
    public static bool ShouldApply(string installDir, bool isSystem, string programFiles) =>
        isSystem && !string.IsNullOrEmpty(programFiles)
        && Path.GetFullPath(installDir).StartsWith(Path.GetFullPath(programFiles), StringComparison.OrdinalIgnoreCase);

    public static List<string> Apply(string installDir)
    {
        var notes = new List<string>();
        if (!OperatingSystem.IsWindows()) return notes;
        var isSystem = WindowsIdentity.GetCurrent().IsSystem;
        if (!ShouldApply(installDir, isSystem, Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles)))
        {
            notes.Add($"Removal protection skipped (system={isSystem}, dir={installDir})");
            return notes;
        }
        var dir = installDir.TrimEnd('\\');
        notes.Add(Run("sc.exe", $"sdset {ServiceName} {ProtectedSddl}", "service DACL"));
        notes.Add(Run("icacls.exe", $"\"{dir}\" /setowner *S-1-5-18 /T /C /Q", "install folder owner"));
        notes.Add(Run("icacls.exe", $"\"{dir}\" /inheritance:r /grant:r *S-1-5-18:(OI)(CI)F *S-1-5-32-544:(OI)(CI)RX *S-1-5-32-545:(OI)(CI)RX /T /C /Q", "install folder ACL"));
        return notes;
    }

    static string Run(string file, string args, string what)
    {
        try
        {
            using var p = Process.Start(new ProcessStartInfo(file, args) { UseShellExecute = false, CreateNoWindow = true, RedirectStandardOutput = true, RedirectStandardError = true })!;
            var output = (p.StandardOutput.ReadToEnd() + " " + p.StandardError.ReadToEnd()).Trim();
            p.WaitForExit(30_000);
            return p.ExitCode == 0 ? $"Removal protection applied: {what}" : $"Removal protection FAILED: {what} (exit {p.ExitCode}) {output}";
        }
        catch (Exception e) { return $"Removal protection FAILED: {what} ({e.GetType().Name})"; }
    }

    /// <summary>Script run by the SYSTEM service after an approved removal: wait for the service process to exit, then delete everything.</summary>
    public static string RemovalScript(int pid, string installDir, string dataDir) => string.Join("\r\n",
        "@echo off", "setlocal", ":wait", "timeout /t 2 /nobreak >nul",
        $"tasklist /FI \"PID eq {pid}\" | find \"{pid}\" >nul && goto wait",
        $"sc.exe delete {ServiceName} >nul 2>&1",
        "reg.exe delete \"HKLM\\Software\\Microsoft\\Windows\\CurrentVersion\\Run\" /v AssetFlowAgentTray /f >nul 2>&1",
        "taskkill.exe /F /IM AssetFlow.Agent.exe >nul 2>&1",
        $"rmdir /s /q \"{installDir.TrimEnd('\\')}\"",
        $"rmdir /s /q \"{dataDir.TrimEnd('\\')}\"",
        "(goto) 2>nul & del \"%~f0\"", "");
}

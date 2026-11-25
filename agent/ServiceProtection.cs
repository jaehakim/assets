using System.ComponentModel;
using System.Runtime.InteropServices;
using System.Runtime.Versioning;
using System.Security.AccessControl;
using System.Security.Principal;

namespace AssetFlow.Agent;

/// <summary>
/// Removal protection (AR-005, removal-protection plan stage A).
/// The service security descriptor gives full control to SYSTEM only. Administrators may query and start the service but
/// cannot stop, reconfigure, delete it or change its permissions, so "sc stop/delete", services.msc and the old uninstaller fail.
/// Removal goes through the approved flow, which runs inside this SYSTEM service. The install folder becomes read-only
/// for Administrators/Users; SYSTEM (updates, self-removal) keeps full control.
/// 0.3.1: applied in-process through the Win32 security APIs (no sc.exe/icacls.exe command lines, which endpoint security
/// products flag as service tampering), only after the server answered a heartbeat with its protection policy, and
/// reverted when the server policy is off (AGENT_REMOVAL_PROTECTION=false).
/// This raises the bar for local administrators; it is not a boundary against taking ownership or offline disk access.
/// </summary>
public static class ServiceProtection
{
    public const string ServiceName = "AssetFlowAgent";
    // SY: all rights (CC DC LC SW RP WP DT LO CR SD RC WD WO); BA: query config/status, enumerate, start, interrogate, user control, read;
    // IU/SU/AU: query only. No WP (stop), DT (pause), DC (change config), SD (delete), WD/WO for anyone but SYSTEM.
    public const string ProtectedSddl = "D:(A;;CCDCLCSWRPWPDTLOCRSDRCWDWO;;;SY)(A;;CCLCSWRPLOCRRC;;;BA)(A;;CCLCSWLOCRRC;;;IU)(A;;CCLCSWLOCRRC;;;SU)(A;;CCLCSWLOCRRC;;;AU)";
    // Windows default DACL of a service created with "sc create" (restored when the server turns protection off).
    public const string DefaultSddl = "D:(A;;CCLCSWRPWPDTLOCRRC;;;SY)(A;;CCDCLCSWRPWPDTLOCRSDRCWDWO;;;BA)(A;;CCLCSWLOCRRC;;;IU)(A;;CCLCSWLOCRRC;;;SU)";

    /// <summary>Rights granted to a trustee in an SDDL DACL, e.g. Rights(ProtectedSddl, "BA") => "CCLCSWRPLOCRRC".</summary>
    public static string Rights(string sddl, string trustee) =>
        System.Text.RegularExpressions.Regex.Match(sddl, $@"\(A;;([A-Z]+);;;{trustee}\)").Groups[1].Value;

    /// <summary>Only touch a real installation (Program Files) when running as the SYSTEM service.</summary>
    public static bool ShouldApply(string installDir, bool isSystem, string programFiles) =>
        isSystem && !string.IsNullOrEmpty(programFiles)
        && Path.GetFullPath(installDir).StartsWith(Path.GetFullPath(programFiles), StringComparison.OrdinalIgnoreCase);

    /// <summary>Applies (protect=true) or reverts (protect=false) the service DACL and install-folder ACL. Never throws.</summary>
    public static List<string> Apply(string installDir, bool protect)
    {
        var notes = new List<string>();
        if (!OperatingSystem.IsWindows()) return notes;
        var isSystem = WindowsIdentity.GetCurrent().IsSystem;
        if (!ShouldApply(installDir, isSystem, Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles)))
        {
            notes.Add($"Removal protection skipped (system={isSystem}, dir={installDir})");
            return notes;
        }
        var what = protect ? "applied" : "reverted";
        notes.Add(Step($"service DACL {what}", () => SetServiceDacl(protect ? ProtectedSddl : DefaultSddl)));
        notes.Add(Step($"install folder ACL {what}", () => SetFolder(installDir.TrimEnd('\\'), protect)));
        return notes;
    }

    static string Step(string what, Func<bool> action)
    {
        try { return action() ? $"Removal protection: {what}" : $"Removal protection: {what} (already in place)"; }
        catch (Exception e) { return $"Removal protection FAILED: {what} ({e.GetType().Name}: {e.Message})"; }
    }

    // ---- service DACL (advapi32) ----
    const uint ScManagerConnect = 0x0001, ReadControl = 0x20000, WriteDac = 0x40000, DaclInformation = 4, SddlRevision1 = 1;

    [SupportedOSPlatform("windows")]
    static bool SetServiceDacl(string sddl)
    {
        var scm = OpenSCManagerW(null, null, ScManagerConnect);
        if (scm == IntPtr.Zero) throw new Win32Exception();
        try
        {
            var service = OpenServiceW(scm, ServiceName, ReadControl | WriteDac);
            if (service == IntPtr.Zero) throw new Win32Exception();
            try
            {
                if (string.Equals(CurrentDacl(service), Canonical(sddl), StringComparison.Ordinal)) return false;
                if (!ConvertStringSecurityDescriptorToSecurityDescriptorW(sddl, SddlRevision1, out var sd, out _)) throw new Win32Exception();
                try { if (!SetServiceObjectSecurity(service, DaclInformation, sd)) throw new Win32Exception(); }
                finally { LocalFree(sd); }
                return true;
            }
            finally { CloseServiceHandle(service); }
        }
        finally { CloseServiceHandle(scm); }
    }

    static string? CurrentDacl(IntPtr service)
    {
        QueryServiceObjectSecurity(service, DaclInformation, null, 0, out var needed);
        if (needed == 0) return null;
        var buffer = new byte[needed];
        if (!QueryServiceObjectSecurity(service, DaclInformation, buffer, needed, out _)) return null;
        var handle = GCHandle.Alloc(buffer, GCHandleType.Pinned);
        try { return ToSddl(handle.AddrOfPinnedObject()); }
        finally { handle.Free(); }
    }

    /// <summary>Windows' own canonical form of an SDDL DACL, so a re-apply is skipped when nothing changed.</summary>
    static string? Canonical(string sddl)
    {
        if (!ConvertStringSecurityDescriptorToSecurityDescriptorW(sddl, SddlRevision1, out var sd, out _)) return null;
        try { return ToSddl(sd); } finally { LocalFree(sd); }
    }

    static string? ToSddl(IntPtr sd)
    {
        if (!ConvertSecurityDescriptorToStringSecurityDescriptorW(sd, SddlRevision1, DaclInformation, out var text, out _)) return null;
        try { return Marshal.PtrToStringUni(text); } finally { LocalFree(text); }
    }

    [DllImport("advapi32.dll", SetLastError = true, CharSet = CharSet.Unicode)] static extern IntPtr OpenSCManagerW(string? machine, string? database, uint access);
    [DllImport("advapi32.dll", SetLastError = true, CharSet = CharSet.Unicode)] static extern IntPtr OpenServiceW(IntPtr scm, string name, uint access);
    [DllImport("advapi32.dll", SetLastError = true)] static extern bool CloseServiceHandle(IntPtr handle);
    [DllImport("advapi32.dll", SetLastError = true)] static extern bool QueryServiceObjectSecurity(IntPtr service, uint information, byte[]? descriptor, uint size, out uint needed);
    [DllImport("advapi32.dll", SetLastError = true)] static extern bool SetServiceObjectSecurity(IntPtr service, uint information, IntPtr descriptor);
    [DllImport("advapi32.dll", SetLastError = true, CharSet = CharSet.Unicode)] static extern bool ConvertStringSecurityDescriptorToSecurityDescriptorW(string sddl, uint revision, out IntPtr descriptor, out uint size);
    [DllImport("advapi32.dll", SetLastError = true, CharSet = CharSet.Unicode)] static extern bool ConvertSecurityDescriptorToStringSecurityDescriptorW(IntPtr descriptor, uint revision, uint information, out IntPtr sddl, out uint length);
    [DllImport("kernel32.dll")] static extern IntPtr LocalFree(IntPtr memory);

    // ---- install folder ACL (System.IO.FileSystem.AccessControl) ----

    /// <summary>
    /// protect: owner SYSTEM, inheritance cut, SYSTEM full / Administrators and Users read+execute.
    /// revert: owner Administrators, explicit rules removed, inherit Program Files again. Children always inherit from the folder.
    /// </summary>
    [SupportedOSPlatform("windows")]
    static bool SetFolder(string dir, bool protect)
    {
        var system = new SecurityIdentifier(WellKnownSidType.LocalSystemSid, null);
        var admins = new SecurityIdentifier(WellKnownSidType.BuiltinAdministratorsSid, null);
        var users = new SecurityIdentifier(WellKnownSidType.BuiltinUsersSid, null);
        var owner = protect ? system : admins;
        var info = new DirectoryInfo(dir);
        var security = info.GetAccessControl();
        const AccessControlSections sections = AccessControlSections.Owner | AccessControlSections.Access;
        var before = security.GetSecurityDescriptorSddlForm(sections);
        security.SetOwner(owner);
        security.SetAccessRuleProtection(protect, false);
        foreach (FileSystemAccessRule rule in security.GetAccessRules(true, false, typeof(SecurityIdentifier))) security.RemoveAccessRuleSpecific(rule);
        if (protect)
        {
            const InheritanceFlags all = InheritanceFlags.ContainerInherit | InheritanceFlags.ObjectInherit;
            security.AddAccessRule(new FileSystemAccessRule(system, FileSystemRights.FullControl, all, PropagationFlags.None, AccessControlType.Allow));
            security.AddAccessRule(new FileSystemAccessRule(admins, FileSystemRights.ReadAndExecute, all, PropagationFlags.None, AccessControlType.Allow));
            security.AddAccessRule(new FileSystemAccessRule(users, FileSystemRights.ReadAndExecute, all, PropagationFlags.None, AccessControlType.Allow));
        }
        if (security.GetSecurityDescriptorSddlForm(sections) == before) return false;
        info.SetAccessControl(security);
        foreach (var child in info.EnumerateFileSystemInfos("*", SearchOption.AllDirectories))
        {
            try
            {
                if (child is DirectoryInfo d) d.SetAccessControl(Inheriting(d.GetAccessControl(), owner));
                else if (child is FileInfo f) f.SetAccessControl(Inheriting(f.GetAccessControl(), owner));
            }
            catch (IOException) { } // a file in use (e.g. a running update helper) keeps its ACL until the next start
        }
        return true;
    }

    [SupportedOSPlatform("windows")]
    static T Inheriting<T>(T security, SecurityIdentifier owner) where T : FileSystemSecurity
    {
        security.SetOwner(owner);
        security.SetAccessRuleProtection(false, false);
        foreach (FileSystemAccessRule rule in security.GetAccessRules(true, false, typeof(SecurityIdentifier))) security.RemoveAccessRuleSpecific(rule);
        return security;
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

using System.Text;

namespace AssetFlow.Agent;

/// <summary>0.3.1: update helper script and rollback hold, kept free of service dependencies so they can be unit-tested.</summary>
public static class UpdatePlan
{
    public static readonly TimeSpan RollbackHold = TimeSpan.FromHours(24);
    public const int VerifySeconds = 180;

    /// <summary>True while a recently rolled-back version must not be installed again.</summary>
    public static bool IsHeldBack(string version, string? rollbackContent, DateTime? rollbackWrittenUtc, DateTime nowUtc) =>
        rollbackContent is not null && rollbackWrittenUtc is not null
        && rollbackContent.Trim() == version && nowUtc - rollbackWrittenUtc.Value < RollbackHold;

    /// <summary>
    /// Helper run as SYSTEM: stop this service, swap the exe (keeping a .bak), harden the data folder, start the new version and
    /// 0.3.1: wait up to <see cref="VerifySeconds"/>s for its startup marker; without it restore the .bak, start the old version
    /// and remember the failed version so it is not retried immediately.
    /// </summary>
    public static string ApplyScript(int pid, string target, string pending, string dataDir, string version)
    {
        // Windows-only cmd script: always backslashes (also when generated in cross-platform unit tests).
        string In(string name) => dataDir.TrimEnd('\\') + "\\" + name;
        var started = In("agent-started.txt");
        var rollback = In("update-rollback.txt");
        return new StringBuilder()
            .Append("@echo off\r\nsetlocal\r\n")
            .Append("sc stop AssetFlowAgent >nul 2>&1\r\n:wait\r\ntimeout /t 2 /nobreak >nul\r\n")
            .Append($"tasklist /FI \"PID eq {pid}\" | find \"{pid}\" >nul && goto wait\r\n")
            .Append("taskkill /F /IM AssetFlow.Agent.exe >nul 2>&1\r\n")
            .Append($"copy /Y \"{target}\" \"{target}.bak\" >nul\r\n")
            .Append($"move /Y \"{pending}\" \"{target}\" >nul\r\n")
            .Append($"if errorlevel 1 (copy /Y \"{target}.bak\" \"{target}\" >nul)\r\n")
            // CR-S01 ④: harden the data folder on every update so pre-0.2.12 installations are corrected too.
            .Append($"icacls \"{dataDir}\" /setowner \"*S-1-5-18\" >nul 2>&1\r\n")
            .Append($"icacls \"{dataDir}\" /inheritance:r /grant:r \"*S-1-5-18:(OI)(CI)F\" \"*S-1-5-32-544:(OI)(CI)F\" \"*S-1-5-32-545:(CI)RX\" >nul 2>&1\r\n")
            .Append($"if exist \"{In("agent.json")}\" icacls \"{In("agent.json")}\" /inheritance:r /grant:r \"*S-1-5-18:F\" \"*S-1-5-32-544:F\" >nul 2>&1\r\n")
            .Append($"if exist \"{In("logs")}\" icacls \"{In("logs")}\" /grant:r \"*S-1-5-32-545:(OI)(CI)RX\" >nul 2>&1\r\n")
            .Append($"del /f /q \"{started}\" >nul 2>&1\r\n")
            .Append("sc start AssetFlowAgent >nul 2>&1\r\n")
            // 0.3.1: health check — the new version writes its version to the startup marker once its host is up.
            .Append("set /a tries=0\r\n:verify\r\ntimeout /t 5 /nobreak >nul\r\n")
            .Append($"findstr /l /x /c:\"{version}\" \"{started}\" >nul 2>&1 && goto done\r\n")
            .Append($"set /a tries+=1\r\nif %tries% lss {VerifySeconds / 5} goto verify\r\n")
            .Append("sc stop AssetFlowAgent >nul 2>&1\r\ntimeout /t 5 /nobreak >nul\r\n")
            .Append("taskkill /F /IM AssetFlow.Agent.exe >nul 2>&1\r\n")
            .Append($"copy /Y \"{target}.bak\" \"{target}\" >nul\r\n")
            .Append($"> \"{rollback}\" echo {version}\r\n")
            .Append("sc start AssetFlowAgent >nul 2>&1\r\n")
            // CR-S04: remove the helper script after it ran.
            .Append(":done\r\n(goto) 2>nul & del \"%~f0\"\r\n")
            .ToString();
    }
}

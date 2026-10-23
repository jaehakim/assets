using System.Diagnostics;
using System.Security.Cryptography;
using System.Text;

namespace AssetFlow.Agent;

public sealed class UpdateService(AgentClient client, ILogger<UpdateService> log)
{
    public async Task CheckAndApply(CancellationToken ct)
    {
        var release = await client.LatestRelease(ct);
        if (release is null || !Version.TryParse(release.Version, out var latest) || latest <= Version.Parse(AgentClient.Version)) return;

        var root = AppContext.BaseDirectory;
        var updateDir = Path.Combine(root, "updates");
        Directory.CreateDirectory(updateDir);
        var pending = Path.Combine(updateDir, $"AssetFlow.Agent-{release.Version}.exe");
        await client.DownloadRelease(release.Version, pending, ct);
        await using (var stream = File.OpenRead(pending))
        {
            var actual = Convert.ToHexString(await SHA256.HashDataAsync(stream, ct));
            if (!actual.Equals(release.Sha256, StringComparison.OrdinalIgnoreCase))
            {
                File.Delete(pending);
                throw new InvalidDataException("Downloaded update SHA-256 does not match release metadata.");
            }
        }
        // CR-001 (코드서명·매니페스트 서명 검증)은 WP-7에서 이 지점에 추가한다.

        var target = Environment.ProcessPath ?? Path.Combine(root, "AssetFlow.Agent.exe");
        var script = Path.Combine(updateDir, "apply-update.cmd");
        var dataDir = AgentState.Dir;
        var body = new StringBuilder()
            .Append("@echo off\r\nsetlocal\r\n")
            .Append("sc stop AssetFlowAgent >nul 2>&1\r\n:wait\r\ntimeout /t 2 /nobreak >nul\r\n")
            .Append($"tasklist /FI \"PID eq {Environment.ProcessId}\" | find \"{Environment.ProcessId}\" >nul && goto wait\r\n")
            .Append("taskkill /F /IM AssetFlow.Agent.exe >nul 2>&1\r\n")
            .Append($"copy /Y \"{target}\" \"{target}.bak\" >nul\r\n")
            .Append($"move /Y \"{pending}\" \"{target}\" >nul\r\n")
            .Append($"if errorlevel 1 (copy /Y \"{target}.bak\" \"{target}\" >nul)\r\n")
            // CR-S01 ④: harden the data folder on every update so pre-0.2.12 installations are corrected too.
            .Append($"icacls \"{dataDir}\" /setowner \"*S-1-5-18\" >nul 2>&1\r\n")
            .Append($"icacls \"{dataDir}\" /inheritance:r /grant:r \"*S-1-5-18:(OI)(CI)F\" \"*S-1-5-32-544:(OI)(CI)F\" \"*S-1-5-32-545:(CI)RX\" >nul 2>&1\r\n")
            .Append($"if exist \"{Path.Combine(dataDir, "agent.json")}\" icacls \"{Path.Combine(dataDir, "agent.json")}\" /inheritance:r /grant:r \"*S-1-5-18:F\" \"*S-1-5-32-544:F\" >nul 2>&1\r\n")
            .Append($"if exist \"{Path.Combine(dataDir, "logs")}\" icacls \"{Path.Combine(dataDir, "logs")}\" /grant:r \"*S-1-5-32-545:(OI)(CI)RX\" >nul 2>&1\r\n")
            .Append("sc start AssetFlowAgent >nul 2>&1\r\n")
            // CR-S04: remove the helper script after it ran.
            .Append("(goto) 2>nul & del \"%~f0\"\r\n")
            .ToString();
        await File.WriteAllTextAsync(script, body, Encoding.ASCII, ct);
        log.LogInformation("Applying agent update {Current} -> {Latest}", AgentClient.Version, release.Version);
        Process.Start(new ProcessStartInfo("cmd.exe", $"/c \"{script}\"") { UseShellExecute = true, CreateNoWindow = true });
    }
}

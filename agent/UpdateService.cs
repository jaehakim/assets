using System.Diagnostics;
using System.Security.Cryptography;
using System.Security.Principal;
using System.Text;

namespace AssetFlow.Agent;

/// <summary>
/// Automatic update. 0.3.1: security pre-checks run before the old version is touched and are reported to the server
/// (a FAIL blocks the update and keeps the current version); the version that runs afterwards reports the post-install checks
/// (installed / rolled back / failed). The installer writes the same pending file, so clean installs and repairs are reported too.
/// </summary>
public sealed class UpdateService(AgentClient client, ILogger<UpdateService> log)
{
    /// <summary>0.3.1: written by a version that started successfully; the update helper waits for it before keeping the new exe.</summary>
    public static readonly string StartedPath = Path.Combine(AgentState.Dir, "agent-started.txt");
    /// <summary>0.3.1: a version that was rolled back or blocked by the pre-checks; it is not retried for <see cref="UpdatePlan.RollbackHold"/>.</summary>
    public static readonly string RollbackPath = Path.Combine(AgentState.Dir, "update-rollback.txt");
    /// <summary>0.3.1: install in progress (written by the updater or installer, removed once the post-install report reached the server).</summary>
    public static readonly string PendingPath = Path.Combine(AgentState.Dir, "install-pending.json");
    /// <summary>Seconds the downloaded file must survive untouched before it replaces the running version (antivirus quarantine/lock probe).</summary>
    public const int QuarantineProbeSeconds = 20;

    public static void MarkStarted(ILogger log)
    {
        try { File.WriteAllText(StartedPath, AgentClient.Version); }
        catch (Exception e) { log.LogWarning(e, "Could not write the startup marker {Path}", StartedPath); }
    }

    public async Task CheckAndApply(CancellationToken ct)
    {
        var release = await client.LatestRelease(ct);
        if (release is null || !Version.TryParse(release.Version, out var latest) || latest <= Version.Parse(AgentClient.Version)) return;
        if (File.Exists(RollbackPath) && UpdatePlan.IsHeldBack(release.Version, File.ReadAllText(RollbackPath), File.GetLastWriteTimeUtc(RollbackPath), DateTime.UtcNow))
        {
            log.LogWarning("Update {Version} is held back (rolled back or blocked by pre-checks); retrying after {Hold}", release.Version, UpdatePlan.RollbackHold);
            return;
        }

        var root = AppContext.BaseDirectory;
        var updateDir = Path.Combine(root, "updates");
        Directory.CreateDirectory(updateDir);
        var pending = Path.Combine(updateDir, $"AssetFlow.Agent-{release.Version}.exe");
        await client.DownloadRelease(release.Version, pending, ct);

        var checks = await PreChecks(release, pending, root, ct);
        var summary = InstallChecks.Summary(checks);
        if (InstallChecks.Blocks(checks))
        {
            log.LogWarning("Update {Version} blocked by pre-install checks: {Summary}", release.Version, summary);
            TryDelete(pending);
            await File.WriteAllTextAsync(RollbackPath, release.Version, ct); // do not download it again every 5 minutes
            await Report(new InstallReport("UPDATE", "PRECHECK", "BLOCKED", AgentClient.Version, release.Version, checks, summary, DateTimeOffset.Now), ct);
            return;
        }
        await Report(new InstallReport("UPDATE", "PRECHECK", "PASSED", AgentClient.Version, release.Version, checks, summary, DateTimeOffset.Now), ct);
        await File.WriteAllTextAsync(PendingPath, new PendingInstall("UPDATE", AgentClient.Version, release.Version, DateTimeOffset.Now).ToJson(), ct);

        var target = Environment.ProcessPath ?? Path.Combine(root, "AssetFlow.Agent.exe");
        var script = Path.Combine(updateDir, "apply-update.cmd");
        var body = UpdatePlan.ApplyScript(Environment.ProcessId, target, pending, AgentState.Dir, release.Version);
        await File.WriteAllTextAsync(script, body, Encoding.ASCII, ct);
        log.LogInformation("Applying agent update {Current} -> {Latest} ({Summary})", AgentClient.Version, release.Version, summary);
        Process.Start(new ProcessStartInfo("cmd.exe", $"/c \"{script}\"") { UseShellExecute = true, CreateNoWindow = true });
    }

    /// <summary>Security pre-checks on the downloaded file and this PC, before anything of the current version is replaced.</summary>
    async Task<List<InstallCheck>> PreChecks(AgentRelease release, string file, string root, CancellationToken ct)
    {
        var checks = new List<InstallCheck>();
        var info = new FileInfo(file);
        checks.Add(InstallCheck.Of("파일 크기", info.Exists && info.Length == release.Size, $"{(info.Exists ? info.Length : 0):N0} / {release.Size:N0} bytes"));
        var hash = info.Exists ? await Hash(file, ct) : null;
        checks.Add(InstallCheck.Of("SHA-256 무결성", hash is not null && hash.Equals(release.Sha256, StringComparison.OrdinalIgnoreCase), hash?[..12].ToLowerInvariant()));
        var head = new byte[2];
        if (info.Exists) { await using var s = File.OpenRead(file); _ = await s.ReadAsync(head, ct); }
        checks.Add(InstallCheck.Of("실행 파일 형식", InstallChecks.IsPortableExecutable(head), "Windows PE"));
        var fileVersion = info.Exists ? FileVersionInfo.GetVersionInfo(file).FileVersion : null;
        checks.Add(InstallCheck.Of("실행 파일 버전", InstallChecks.VersionMatches(fileVersion, release.Version), $"{fileVersion ?? "-"} (릴리스 {release.Version})"));
        // CR-001 (코드서명·매니페스트 서명 검증)은 WP-7에서 이 지점에 추가한다.
        checks.Add(InstallCheck.Of("코드 서명", false, "미적용 — SHA-256 무결성으로 대체(CR-001/WP-7)", warnOnly: true));

        // Antivirus/EDR probe: a quarantined or locked file would otherwise only fail after the running version was replaced.
        await Task.Delay(TimeSpan.FromSeconds(QuarantineProbeSeconds), ct);
        string? again = null; string? probeError = null;
        try { if (File.Exists(file)) { await using var s = new FileStream(file, FileMode.Open, FileAccess.Read, FileShare.Read); again = Convert.ToHexString(await SHA256.HashDataAsync(s, ct)); } }
        catch (Exception e) when (e is IOException or UnauthorizedAccessException) { probeError = e.GetType().Name; }
        checks.Add(InstallCheck.Of("백신 격리·차단 확인", again is not null && again == hash,
            again is null ? (probeError is null ? $"{QuarantineProbeSeconds}초 후 파일 없음(격리 의심)" : $"파일 접근 차단({probeError})") : $"{QuarantineProbeSeconds}초 후 파일 유지"));

        var drive = new DriveInfo(Path.GetPathRoot(root) ?? root);
        checks.Add(InstallCheck.Of("디스크 여유 공간", drive.AvailableFreeSpace > release.Size * 3, $"{drive.AvailableFreeSpace / 1048576:N0} MB"));
        var isSystem = OperatingSystem.IsWindows() && WindowsIdentity.GetCurrent().IsSystem;
        checks.Add(InstallCheck.Of("실행 계정", isSystem, isSystem ? "SYSTEM 서비스" : "SYSTEM 아님", warnOnly: true));
        checks.Add(Safe("데이터 폴더 보안", () => ConfigProtection.IsDataFolderSecure(AgentState.Dir), "소유자·상속 차단·쓰기 권한"));
        return checks;
    }

    /// <summary>
    /// Called after each successful heartbeat: when an install/update is pending, run the post-install checks and report them
    /// (and the installer's pre-checks). The pending file is removed only after the server accepted the report.
    /// </summary>
    public async Task ReportPendingInstall(bool? protectionPolicy, CancellationToken ct)
    {
        if (!File.Exists(PendingPath)) return;
        var pending = PendingInstall.Parse(await File.ReadAllTextAsync(PendingPath, ct));
        if (pending is null) { TryDelete(PendingPath); return; }
        if (pending.PreChecks is { Count: > 0 } pre)
        {
            await Report(new InstallReport(pending.Kind, "PRECHECK", InstallChecks.Blocks(pre) ? "BLOCKED" : "PASSED", pending.FromVersion, pending.ToVersion,
                pre, InstallChecks.Summary(pre), pending.StartedAt), ct, required: true);
            pending = pending with { PreChecks = null };
            await File.WriteAllTextAsync(PendingPath, pending.ToJson(), ct); // a failed post-check send must not repeat the pre-check report
        }

        var running = AgentClient.Version;
        var rolledBack = File.Exists(RollbackPath) ? File.ReadAllText(RollbackPath).Trim() : null;
        var checks = new List<InstallCheck>
        {
            InstallCheck.Of("실행 버전", running == pending.ToVersion, $"실행 {running} / 목표 {pending.ToVersion}"),
            InstallCheck.Of("새 버전 기동", rolledBack != pending.ToVersion, rolledBack == pending.ToVersion ? $"{UpdatePlan.VerifySeconds}초 안에 기동하지 않아 이전 버전으로 복원" : "기동 표식 확인"),
            InstallCheck.Of("서버 통신", true, "하트비트 성공"),
            InstallCheck.Of("실행 계정", OperatingSystem.IsWindows() && WindowsIdentity.GetCurrent().IsSystem, "SYSTEM 서비스", warnOnly: true),
            InstallCheck.Of("설치 경로", ServiceProtection.ShouldApply(AppContext.BaseDirectory, true, Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles)),
                AppContext.BaseDirectory, warnOnly: true),
            Safe("데이터 폴더 보안", () => ConfigProtection.IsDataFolderSecure(AgentState.Dir), "소유자·상속 차단·쓰기 권한"),
            InstallCheck.Of("제거 보호 정책", protectionPolicy is not null,
                protectionPolicy switch { true => "서버 정책: 보호 적용", false => "서버 정책: 보호 해제", null => "서버 정책 미수신" }, warnOnly: true),
        };
        if (pending.Kind == "UPDATE")
            checks.Add(InstallCheck.Of("이전 버전 백업", File.Exists((Environment.ProcessPath ?? "") + ".bak"), "AssetFlow.Agent.exe.bak", warnOnly: true));
        var result = InstallChecks.PostResult(running, pending, rolledBack, checks);
        var summary = InstallChecks.Summary(checks);
        await Report(new InstallReport(pending.Kind, "POSTCHECK", result, pending.FromVersion, pending.ToVersion, checks, summary, DateTimeOffset.Now), ct, required: true);
        TryDelete(PendingPath);
        log.LogInformation("Post-install report sent: {Kind} {From} -> {To} {Result} ({Summary})", pending.Kind, pending.FromVersion, pending.ToVersion, result, summary);
    }

    async Task Report(InstallReport report, CancellationToken ct, bool required = false)
    {
        try { await client.SendInstallReport(report, ct); }
        catch (Exception e) when (!required && e is not OperationCanceledException)
        {
            log.LogWarning(e, "Could not send the {Stage} report for {Version}", report.Stage, report.ToVersion);
        }
    }

    static InstallCheck Safe(string name, Func<bool> check, string detail)
    {
        try { return InstallCheck.Of(name, check(), detail); }
        catch (Exception e) { return new(name, "WARN", $"확인 불가({e.GetType().Name})"); }
    }

    static async Task<string> Hash(string file, CancellationToken ct)
    {
        await using var s = File.OpenRead(file);
        return Convert.ToHexString(await SHA256.HashDataAsync(s, ct));
    }

    static void TryDelete(string path) { try { File.Delete(path); } catch { } }
}

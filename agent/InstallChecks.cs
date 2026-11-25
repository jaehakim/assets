using System.Text.Json;

namespace AssetFlow.Agent;

/// <summary>0.3.1: one pre- or post-install check. Status PASS / WARN / FAIL (FAIL before installing blocks the install).</summary>
public sealed record InstallCheck(string Name, string Status, string? Detail = null)
{
    public static InstallCheck Of(string name, bool ok, string? detail = null, bool warnOnly = false) =>
        new(name, ok ? "PASS" : warnOnly ? "WARN" : "FAIL", detail);
}

/// <summary>Report sent to POST /api/v1/agents/install-report. Kind UPDATE / INSTALL / REPAIR, Stage PRECHECK / POSTCHECK.</summary>
public sealed record InstallReport(string Kind, string Stage, string Result, string? FromVersion, string ToVersion,
    List<InstallCheck> Checks, string? Summary, DateTimeOffset CheckedAt);

/// <summary>
/// Written before the old version is replaced (by the updater or the installer) and read by the Agent that runs afterwards,
/// which adds the post-install checks and reports both to the server. PreChecks are only present when the installer wrote it
/// (the updater reports its pre-checks itself before swapping).
/// </summary>
public sealed record PendingInstall(string Kind, string? FromVersion, string ToVersion, DateTimeOffset StartedAt, List<InstallCheck>? PreChecks = null)
{
    static readonly JsonSerializerOptions Web = new(JsonSerializerDefaults.Web);
    public static readonly string[] Kinds = { "UPDATE", "INSTALL", "REPAIR" };

    public string ToJson() => JsonSerializer.Serialize(this, Web);

    public static PendingInstall? Parse(string? json)
    {
        try
        {
            var p = JsonSerializer.Deserialize<PendingInstall>(json ?? "", Web);
            return p is not null && Kinds.Contains(p.Kind) && !string.IsNullOrWhiteSpace(p.ToVersion) ? p : null;
        }
        catch (JsonException) { return null; }
    }
}

public static class InstallChecks
{
    public static bool Blocks(IEnumerable<InstallCheck> checks) => checks.Any(c => c.Status == "FAIL");

    public static string Summary(IReadOnlyCollection<InstallCheck> checks)
    {
        var bad = checks.Where(c => c.Status != "PASS").Select(c => $"{c.Name}: {c.Detail ?? c.Status}").ToList();
        return $"{checks.Count(c => c.Status == "PASS")}/{checks.Count} 통과" + (bad.Count == 0 ? "" : " — " + string.Join(" | ", bad));
    }

    /// <summary>
    /// Post-install verdict. ROLLED_BACK when the update helper restored the old exe for this version, INSTALLED when the running
    /// version is the target and nothing failed, otherwise FAILED.
    /// </summary>
    public static string PostResult(string runningVersion, PendingInstall pending, string? rolledBackVersion, IEnumerable<InstallCheck> checks)
    {
        if (rolledBackVersion?.Trim() == pending.ToVersion && runningVersion != pending.ToVersion) return "ROLLED_BACK";
        return runningVersion == pending.ToVersion && !Blocks(checks) ? "INSTALLED" : "FAILED";
    }

    /// <summary>"MZ" header — the downloaded file is a Windows executable.</summary>
    public static bool IsPortableExecutable(ReadOnlySpan<byte> head) => head.Length >= 2 && head[0] == (byte)'M' && head[1] == (byte)'Z';

    /// <summary>FileVersion "0.3.1.0" belongs to release "0.3.1".</summary>
    public static bool VersionMatches(string? fileVersion, string release) =>
        fileVersion is not null && Version.TryParse(fileVersion, out var f) && Version.TryParse(release, out var r)
        && f.Major == r.Major && f.Minor == r.Minor && f.Build == Math.Max(r.Build, 0);
}

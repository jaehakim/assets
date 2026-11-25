using System.Diagnostics;
using System.Text.Json;

namespace AssetFlow.Agent;

/// <summary>
/// 0.3.0 approved removal. The Agent cannot be removed by users (ServiceProtection). It removes itself only when
/// (a) the server reports an approved removal in the heartbeat response, or
/// (b) the elevated uninstall tool drops a request file containing an offline code issued by an administrator for this PC.
/// A request file without a code is forwarded to the server as a removal request for an administrator to approve.
/// 0.3.1: protection is no longer applied on the startup path. It follows the server policy delivered in each heartbeat
/// (ApplyPolicy), so it only happens after this version has proven it can talk to the server, and it can be switched off remotely.
/// </summary>
public sealed class UninstallService(AgentClient client, AgentState state, IHostApplicationLifetime lifetime, ILogger<UninstallService> log) : BackgroundService
{
    public static readonly string RequestPath = Path.Combine(AgentState.Dir, "uninstall-request.json");
    public static readonly string ResultPath = Path.Combine(AgentState.Dir, "uninstall-result.json");
    int started;
    bool? appliedPolicy;

    /// <summary>Called with the heartbeat's "protection" value; applies or reverts protection once per change, off the heartbeat path.</summary>
    public void ApplyPolicy(bool? protect)
    {
        if (protect is null || appliedPolicy == protect) return; // older servers send no policy: leave the PC as it is
        appliedPolicy = protect;
        _ = Task.Run(() =>
        {
            try
            {
                foreach (var note in ServiceProtection.Apply(AppContext.BaseDirectory, protect.Value))
                    if (note.Contains("FAILED")) log.LogWarning("{Note}", note); else log.LogInformation("{Note}", note);
            }
            catch (Exception e) { log.LogWarning(e, "Removal protection policy could not be applied"); }
        });
    }

    protected override async Task ExecuteAsync(CancellationToken ct)
    {
        await Task.Yield(); // never hold up host startup
        while (!ct.IsCancellationRequested)
        {
            try { await CheckRequestFile(ct); }
            catch (OperationCanceledException) when (ct.IsCancellationRequested) { break; }
            catch (Exception e) { log.LogError(e, "Uninstall request handling failed"); WriteResult("ERROR", null, "요청 처리 실패 — 서비스 로그 확인"); }
            await Task.Delay(TimeSpan.FromSeconds(10), ct);
        }
    }

    async Task CheckRequestFile(CancellationToken ct)
    {
        if (!File.Exists(RequestPath)) return;
        var text = await File.ReadAllTextAsync(RequestPath, ct);
        File.Delete(RequestPath);
        var request = UninstallRequestFile.Parse(text);
        if (!string.IsNullOrWhiteSpace(request.Code))
        {
            var result = UninstallCode.Verify(request.Code, state.Options.DeviceToken, state.Options.AgentId, DateTimeOffset.UtcNow);
            log.LogWarning("Offline uninstall code submitted by {User}: {Result}", request.RequestedBy ?? "-", result);
            if (result != UninstallCode.Result.Valid) { WriteResult(result.ToString().ToUpperInvariant(), null, UninstallCode.Describe(result)); return; }
            WriteResult("UNINSTALLING", null, "제거 코드 확인 — 제거를 시작합니다");
            await Execute("CODE", null, ct);
            return;
        }
        var id = await client.RequestUninstall(request.Reason, request.RequestedBy, ct);
        log.LogWarning("Uninstall request #{Id} sent to the server by {User}: {Reason}", id, request.RequestedBy ?? "-", request.Reason ?? "-");
        WriteResult("REQUESTED", id, "관리자 승인 대기 — 승인되면 5분 이내 자동으로 제거됩니다");
    }


    public Task ExecuteApproved(long? requestId, CancellationToken ct) => Execute("APPROVED", requestId, ct);

    async Task Execute(string method, long? requestId, CancellationToken ct)
    {
        if (Interlocked.Exchange(ref started, 1) == 1) return;
        log.LogWarning("Approved Agent removal started ({Method}, request {Id})", method, requestId);
        try { await client.CompleteUninstall(requestId, method, ct); }
        catch (Exception e) { log.LogWarning(e, "Could not report removal to the server; continuing (offline removal)"); }
        if (!OperatingSystem.IsWindows()) return;
        var script = Path.Combine(Path.GetTempPath(), $"assetflow-remove-{Guid.NewGuid():N}.cmd");
        await File.WriteAllTextAsync(script, ServiceProtection.RemovalScript(Environment.ProcessId, AppContext.BaseDirectory, AgentState.Dir), System.Text.Encoding.ASCII, ct);
        Process.Start(new ProcessStartInfo("cmd.exe", $"/c \"{script}\"") { UseShellExecute = false, CreateNoWindow = true });
        lifetime.StopApplication(); // a clean stop does not trigger the service recovery (restart) actions
    }

    static void WriteResult(string status, long? requestId, string message)
    {
        try { File.WriteAllText(ResultPath, JsonSerializer.Serialize(new { status, requestId, message, at = DateTimeOffset.Now })); } catch { }
    }
}

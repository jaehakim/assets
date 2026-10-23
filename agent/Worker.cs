using System.Net;

namespace AssetFlow.Agent;

public sealed class Worker(AgentClient client, AgentState state, InventoryCollector collector,
    UpdateService updater, AgentHealth health, ILogger<Worker> log) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken ct)
    {
        foreach (var note in ConfigProtection.Notes) log.LogWarning("Startup: {Note}", note);
        while (string.IsNullOrEmpty(state.Options.DeviceToken) && !ct.IsCancellationRequested)
        {
            if (await RunOperation("등록", () => client.EnsureRegistered(ct), ct)) break;
            await Task.Delay(TimeSpan.FromMinutes(1), ct);
        }
        await Task.WhenAll(
            Loop("인벤토리", async () => await client.SendInventory(await collector.CollectAsync(), ct),
                TimeSpan.FromMinutes(Math.Max(5, state.Options.CollectionMinutes)), ct),
            Loop("하트비트", () => client.Heartbeat(ct), TimeSpan.FromMinutes(5), ct),
            Loop("업데이트", () => updater.CheckAndApply(ct),
                TimeSpan.FromMinutes(Math.Max(5, state.Options.UpdateCheckMinutes)), ct));
    }

    private async Task Loop(string operation, Func<Task> action, TimeSpan interval, CancellationToken ct)
    {
        while (!ct.IsCancellationRequested)
        {
            await RunOperation(operation, action, ct);
            await Task.Delay(interval, ct);
        }
    }

    private int unauthorized; // CR-A09: 연속 401 횟수
    private const int UnauthorizedThreshold = 3;

    private async Task<bool> RunOperation(string operation, Func<Task> action, CancellationToken ct)
    {
        try
        {
            await action();
            health.Success(operation, DateTimeOffset.UtcNow);
            if (operation != "등록") unauthorized = 0;
            log.LogInformation("Agent {Operation} completed", operation);
            return true;
        }
        catch (OperationCanceledException) when (ct.IsCancellationRequested) { throw; }
        catch (HttpRequestException error) when (error.StatusCode == HttpStatusCode.Unauthorized && operation != "등록")
        {
            // CR-A09: 장치 토큰이 서버에서 무효화(해지·DB 복구·복호 실패)된 경우 영구 오프라인을 막는다.
            unauthorized++;
            log.LogWarning("Agent {Operation} rejected with HTTP 401 ({Count}/{Threshold})", operation, unauthorized, UnauthorizedThreshold);
            if (unauthorized < UnauthorizedThreshold) { health.Failure(operation, "HTTP 401"); return false; }
            return await RecoverDeviceToken(operation, ct);
        }
        catch (Exception error)
        {
            // Do not copy raw exception messages, URLs or credentials to public status.
            var reason = error switch
            {
                HttpRequestException e when e.StatusCode is not null => $"HTTP {(int)e.StatusCode}",
                HttpRequestException => "서버 연결 실패",
                OperationCanceledException => "응답 시간 초과",
                _ => "작업 처리 실패 (서비스 로그 확인)"
            };
            health.Failure(operation, reason);
            log.LogError(error, "Agent {Operation} failed; retrying later", operation);
            return false;
        }
    }

    /// <summary>Re-registers when a registration token is available (agent.json or ASSETFLOW_REGISTRATION_TOKEN); otherwise reports a clear tray state.</summary>
    private async Task<bool> RecoverDeviceToken(string operation, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(state.Options.RegistrationToken) || state.Options.RegistrationToken == "change-me")
        {
            health.Failure(operation, "장치 토큰 무효 (재등록 필요: 설치 스크립트 재실행 또는 ASSETFLOW_REGISTRATION_TOKEN 설정)");
            log.LogError("Device token rejected {Count} times and no registration token is available; re-run the installer or set ASSETFLOW_REGISTRATION_TOKEN", unauthorized);
            return false;
        }
        log.LogWarning("Device token rejected {Count} times; re-registering with the stored registration token", unauthorized);
        state.Save(state.Options with { DeviceToken = null, AgentId = null });
        var registered = await RunOperation("등록", () => client.EnsureRegistered(ct), ct);
        if (registered) unauthorized = 0;
        return registered;
    }
}

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

    private async Task<bool> RunOperation(string operation, Func<Task> action, CancellationToken ct)
    {
        try
        {
            await action();
            health.Success(operation, DateTimeOffset.UtcNow);
            log.LogInformation("Agent {Operation} completed", operation);
            return true;
        }
        catch (OperationCanceledException) when (ct.IsCancellationRequested) { throw; }
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
}

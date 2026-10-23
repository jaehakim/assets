using System.Text.Json;

namespace AssetFlow.Agent;

public sealed class AgentHealthService(AgentHealth health, ILogger<AgentHealthService> log) : BackgroundService
{
    // Program Files inherits read/execute for Users and write for SYSTEM/Administrators.
    // This public status file does not expose agent.json to the tray status reader.
    public static string StatusPath => Path.Combine(AppContext.BaseDirectory, "agent-status.json");

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        AgentHealthDisplay? previous = null;
        while (!stoppingToken.IsCancellationRequested)
        {
            var temporary = StatusPath + ".tmp";
            try
            {
                var snapshot = health.Snapshot(DateTimeOffset.UtcNow);
                var display = AgentHealth.Evaluate(snapshot, DateTimeOffset.UtcNow);
                if (display != previous)
                {
                    log.LogInformation("TRAY_STATUS color={Color} state={State}", display.Color, display.Label);
                    previous = display;
                }
                await File.WriteAllTextAsync(temporary, JsonSerializer.Serialize(snapshot), stoppingToken);
                File.Move(temporary, StatusPath, true);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested) { break; }
            catch (Exception error) { log.LogWarning(error, "Unable to publish public tray status"); }
            await Task.Delay(TimeSpan.FromSeconds(10), stoppingToken);
        }
    }
}

namespace AssetFlow.Agent;

public enum AgentHealthColor { Waiting, Healthy, Warning, Error }
public sealed record OperationHealth(DateTimeOffset? LastSuccess, string? Error);
public sealed record AgentHealthSnapshot(DateTimeOffset WrittenAt, DateTimeOffset? LastContact,
    Dictionary<string, OperationHealth> Operations);
public sealed record AgentHealthDisplay(AgentHealthColor Color, string Label);

// Contains only public operational status, never credentials or inventory contents.
public sealed class AgentHealth
{
    private readonly object gate = new();
    private readonly Dictionary<string, OperationHealth> operations = new();
    private DateTimeOffset? lastContact;

    public void Success(string operation, DateTimeOffset now)
    {
        lock (gate)
        {
            operations[operation] = new(now, null);
            lastContact = now;
        }
    }

    public void Failure(string operation, string reason)
    {
        lock (gate)
        {
            operations.TryGetValue(operation, out var previous);
            operations[operation] = new(previous?.LastSuccess, reason);
        }
    }

    public AgentHealthSnapshot Snapshot(DateTimeOffset now)
    {
        lock (gate) return new(now, lastContact, new(operations));
    }

    public static AgentHealthDisplay Evaluate(AgentHealthSnapshot? snapshot, DateTimeOffset now)
    {
        if (snapshot is null) return new(AgentHealthColor.Waiting, "서비스 상태 확인 중");
        if (now - snapshot.WrittenAt > TimeSpan.FromSeconds(45) || snapshot.WrittenAt > now.AddMinutes(1))
            return new(AgentHealthColor.Waiting, "서비스 응답 없음");
        if (snapshot.Operations.Values.Any(x => x.Error is not null))
            return new(AgentHealthColor.Error, "통신 또는 작업 오류");
        if (snapshot.LastContact is null) return new(AgentHealthColor.Waiting, "첫 통신 대기 중");
        if (now - snapshot.LastContact > TimeSpan.FromMinutes(12) || snapshot.LastContact > now.AddMinutes(1))
            return new(AgentHealthColor.Warning, "통신 확인 지연");
        return new(AgentHealthColor.Healthy, "서버 통신 정상");
    }
}

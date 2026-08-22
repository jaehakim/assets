using System.Text.Json;

namespace AssetFlow.Agent;

public sealed record AgentOptions(string ApiUrl, string RegistrationToken, string? DeviceToken = null, string? AgentId = null, int CollectionMinutes = 60, int UpdateCheckMinutes = 5);

public sealed class AgentState
{
    private static readonly string Dir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData), "AssetFlow");
    private static readonly string PathName = Path.Combine(Dir, "agent.json");
    public AgentOptions Options { get; private set; }

    public AgentState()
    {
        Directory.CreateDirectory(Dir);
        var saved = File.Exists(PathName) ? JsonSerializer.Deserialize<AgentOptions>(File.ReadAllText(PathName)) : null;
        Options = ApplyEnvironmentOverrides(saved ?? Defaults());
    }

    public void Save(AgentOptions value)
    {
        Options = value;
        File.WriteAllText(PathName, JsonSerializer.Serialize(value, new JsonSerializerOptions { WriteIndented = true }));
    }

    private static AgentOptions ApplyEnvironmentOverrides(AgentOptions options)
    {
        var apiUrl = Environment.GetEnvironmentVariable("ASSETFLOW_API_URL");
        var registrationToken = Environment.GetEnvironmentVariable("ASSETFLOW_REGISTRATION_TOKEN");
        return options with
        {
            ApiUrl = string.IsNullOrWhiteSpace(apiUrl) ? options.ApiUrl : apiUrl.Trim(),
            RegistrationToken = string.IsNullOrWhiteSpace(registrationToken) ? options.RegistrationToken : registrationToken.Trim()
        };
    }

    private static AgentOptions Defaults() => new(
        Environment.GetEnvironmentVariable("ASSETFLOW_API_URL") ?? "https://assets.2734.store",
        Environment.GetEnvironmentVariable("ASSETFLOW_REGISTRATION_TOKEN") ?? "change-me");
}

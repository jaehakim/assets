using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Security.Cryptography;
using System.Text;

namespace AssetFlow.Agent;

public sealed class AgentClient
{
    public const string Version = "0.2.4";
    private readonly HttpClient http;
    private readonly AgentState state;

    public AgentClient(HttpClient http, AgentState state)
    {
        this.http = http;
        this.state = state;
        http.Timeout = TimeSpan.FromMinutes(5);
    }

    public async Task EnsureRegistered(CancellationToken ct)
    {
        if (!string.IsNullOrWhiteSpace(state.Options.DeviceToken)) return;
        var registrationToken = state.Options.RegistrationToken.Trim();
        if (string.IsNullOrWhiteSpace(registrationToken) || registrationToken == "change-me")
            throw new InvalidOperationException("Registration token is missing or is the placeholder. Update C:\\ProgramData\\AssetFlow\\agent.json or ASSETFLOW_REGISTRATION_TOKEN.");

        var key = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes($"{Environment.MachineName}|{GetMachineGuid()}")));
        using var req = new HttpRequestMessage(HttpMethod.Post, $"{state.Options.ApiUrl.Trim().TrimEnd('/')}/api/v1/agents/register");
        req.Headers.Add("X-Registration-Token", registrationToken);
        req.Content = JsonContent.Create(new { agentKey = key, hostname = Environment.MachineName, version = Version });
        using var res = await http.SendAsync(req, ct);
        if (res.StatusCode == HttpStatusCode.Unauthorized)
            throw new InvalidOperationException("Server rejected the registration token (HTTP 401). Set RegistrationToken in C:\\ProgramData\\AssetFlow\\agent.json to the server AGENT_REGISTRATION_TOKEN, then restart AssetFlowAgent.");
        res.EnsureSuccessStatusCode();
        var value = await res.Content.ReadFromJsonAsync<Registered>(cancellationToken: ct) ?? throw new InvalidOperationException("Empty registration response");
        state.Save(state.Options with { RegistrationToken = registrationToken, DeviceToken = value.DeviceToken, AgentId = value.AgentId });
    }

    public async Task SendInventory(Inventory data, CancellationToken ct) => await Send("inventory", data, ct);
    public async Task Heartbeat(CancellationToken ct) => await Send("heartbeat", new { version = Version }, ct);

    public async Task<AgentRelease?> LatestRelease(CancellationToken ct)
    {
        using var req = Authorized(HttpMethod.Get, "updates/latest");
        using var res = await http.SendAsync(req, ct);
        if (res.StatusCode == HttpStatusCode.NoContent) return null;
        res.EnsureSuccessStatusCode();
        return await res.Content.ReadFromJsonAsync<AgentRelease>(cancellationToken: ct);
    }

    public async Task DownloadRelease(string version, string target, CancellationToken ct)
    {
        using var req = Authorized(HttpMethod.Get, $"updates/{Uri.EscapeDataString(version)}/download");
        using var res = await http.SendAsync(req, HttpCompletionOption.ResponseHeadersRead, ct);
        res.EnsureSuccessStatusCode();
        await using var input = await res.Content.ReadAsStreamAsync(ct);
        await using var output = new FileStream(target, FileMode.Create, FileAccess.Write, FileShare.None);
        await input.CopyToAsync(output, ct);
    }

    private HttpRequestMessage Authorized(HttpMethod method, string path)
    {
        var req = new HttpRequestMessage(method, $"{state.Options.ApiUrl.Trim().TrimEnd('/')}/api/v1/agents/{path}");
        req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", state.Options.DeviceToken);
        return req;
    }

    private async Task Send(string path, object value, CancellationToken ct)
    {
        using var req = Authorized(HttpMethod.Post, path);
        req.Content = JsonContent.Create(value);
        using var res = await http.SendAsync(req, ct);
        res.EnsureSuccessStatusCode();
    }

    private static string GetMachineGuid()
    {
        using var key = Microsoft.Win32.Registry.LocalMachine.OpenSubKey(@"SOFTWARE\Microsoft\Cryptography");
        return key?.GetValue("MachineGuid")?.ToString() ?? Environment.MachineName;
    }

    private sealed record Registered(string AgentId, string DeviceToken);
}

public sealed record AgentRelease(string Version, string Sha256, long Size, string DownloadUrl);

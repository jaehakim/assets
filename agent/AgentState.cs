using System.Text.Json;
using System.Text.Json.Serialization;

namespace AssetFlow.Agent;

public sealed record AgentOptions(string ApiUrl, string? RegistrationToken, string? DeviceToken = null, string? AgentId = null, int CollectionMinutes = 60, int UpdateCheckMinutes = 5);

/// <summary>On-disk layout. CR-005: the device token is stored DPAPI(LocalMachine)-protected; a plaintext DeviceToken written by the installer is migrated on first start.</summary>
internal sealed record StoredOptions(
    string? ApiUrl, string? RegistrationToken, string? DeviceToken, string? DeviceTokenProtected,
    string? AgentId, int? CollectionMinutes, int? UpdateCheckMinutes);

public sealed class AgentState
{
    public static readonly string Dir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData), "AssetFlow");
    public static readonly string PathName = Path.Combine(Dir, "agent.json");
    /// <summary>CR-S01 ③: world-readable file with only the API URL so the user-session tray never opens agent.json.</summary>
    public static readonly string TrayPathName = Path.Combine(Dir, "tray.json");
    public AgentOptions Options { get; private set; }

    public AgentState()
    {
        Directory.CreateDirectory(Dir);
        // CR-S01 ②: refuse untrusted ownership, self-heal weak ACLs before touching the token file.
        ConfigProtection.EnsureProtected(Dir, PathName, TrayPathName);
        StoredOptions? stored = null;
        if (File.Exists(PathName))
        {
            try { stored = JsonSerializer.Deserialize<StoredOptions>(File.ReadAllText(PathName)); }
            catch (JsonException e) { ConfigProtection.Notes.Add($"agent.json is not valid JSON and will be ignored: {e.Message}"); }
        }
        Options = ApplyEnvironmentOverrides(stored is null ? Defaults() : FromStored(stored));
        if (stored?.DeviceToken is not null && OperatingSystem.IsWindows())
        {
            ConfigProtection.Notes.Add("Plaintext device token migrated to DPAPI protection (CR-005).");
            Save(Options);
        }
        else WriteTrayFile();
    }

    public void Save(AgentOptions value)
    {
        Options = value;
        string? plain = null, protectedToken = null;
        if (OperatingSystem.IsWindows()) protectedToken = string.IsNullOrEmpty(value.DeviceToken) ? null : ConfigProtection.Protect(value.DeviceToken);
        else plain = value.DeviceToken; // non-Windows only occurs in unit tests
        var stored = new StoredOptions(value.ApiUrl,
            string.IsNullOrWhiteSpace(value.RegistrationToken) ? null : value.RegistrationToken,
            plain, protectedToken, value.AgentId, value.CollectionMinutes, value.UpdateCheckMinutes);
        File.WriteAllText(PathName, JsonSerializer.Serialize(stored, new JsonSerializerOptions { WriteIndented = true, DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull }));
        ConfigProtection.HardenTokenFile(PathName);
        WriteTrayFile();
    }

    /// <summary>Read by the tray (user session). Returns null when the file is missing.</summary>
    public static string? ReadPublicApiUrl()
    {
        try
        {
            if (!File.Exists(TrayPathName)) return null;
            using var doc = JsonDocument.Parse(File.ReadAllText(TrayPathName));
            return doc.RootElement.TryGetProperty("ApiUrl", out var url) ? url.GetString() : null;
        }
        catch { return null; }
    }

    private void WriteTrayFile()
    {
        try
        {
            File.WriteAllText(TrayPathName, JsonSerializer.Serialize(new { Options.ApiUrl, Version = AgentClient.Version }));
            ConfigProtection.PublishReadable(TrayPathName);
        }
        catch (Exception e) when (e is IOException or UnauthorizedAccessException)
        { ConfigProtection.Notes.Add($"tray.json could not be written: {e.GetType().Name}"); }
    }

    private static AgentOptions FromStored(StoredOptions s)
    {
        string? token = s.DeviceToken;
        if (token is null && s.DeviceTokenProtected is not null)
        {
            token = ConfigProtection.Unprotect(s.DeviceTokenProtected);
            if (token is null) ConfigProtection.Notes.Add("Stored device token could not be decrypted on this machine; the device must be re-registered.");
        }
        return new AgentOptions(s.ApiUrl ?? Defaults().ApiUrl, s.RegistrationToken, token, s.AgentId, s.CollectionMinutes ?? 60, s.UpdateCheckMinutes ?? 5);
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

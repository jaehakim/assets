namespace AssetFlow.Agent;

public record DiskInfo(string Name, string? Filesystem, long TotalBytes, long FreeBytes);
public record SoftwareInfo(string Name, string? Version, string? Publisher, string? InstallDate);
/// <summary>Type is MONITOR, KEYBOARD or MOUSE. Model is the EDID product code (monitor) or VID/PID (input devices).</summary>
public record PeripheralInfo(string Type, string Name, string? Manufacturer, string? Model, string? SerialNo, string? Connection,
    string? VendorId, string? ProductId, int? ManufactureYear, decimal? SizeInches, string? DeviceId);
/// <summary>0.2.14: a device recorded under the USB enumerator. Present=false means previously connected.</summary>
public record UsbDeviceInfo(string DeviceId, string Category, string Name, string? Manufacturer, string? VendorId, string? ProductId,
    string? SerialNo, string? DeviceClass, string? Service, bool? Present,
    DateTimeOffset? FirstInstallAt, DateTimeOffset? LastArrivalAt, DateTimeOffset? LastRemovalAt);
public record Inventory(
    string Hostname, string? SerialNo, string? Manufacturer, string? Model,
    string? DeviceUuid, string? DomainName, bool? DomainJoined,
    string? Username, string? Department,
    string OsName, string OsVersion, string? OsBuild, string? OsArchitecture,
    DateTimeOffset? OsInstalledAt, DateTimeOffset? LastBootAt,
    string? CpuName, int? CpuCores, int? CpuLogicalProcessors, long? MemoryBytes, // CR-022: null when WMI fails
    string? BiosVersion, string? IpAddress, string? MacAddress,
    bool? BitlockerEnabled, bool? FirewallEnabled, string AntivirusStatus,
    bool? TpmPresent, bool? TpmEnabled, string? TpmVersion, bool? SecureBootEnabled,
    List<DiskInfo> Disks, List<SoftwareInfo> Software,
    List<PeripheralInfo>? Peripherals, // 0.2.13: null = collection failed (server keeps the previous list)
    List<UsbDeviceInfo>? UsbDevices, // 0.2.14: present and previously connected USB devices; null = collection failed
    List<string>? CollectionErrors); // 0.2.14: short failure notes for remote diagnosis
/// <summary>Heartbeat response: approved removal (0.3.0) and the server's removal-protection policy (0.3.1; null = not sent).</summary>
public sealed record HeartbeatResult(bool UninstallApproved, long? UninstallRequestId, bool? Protection = null)
{
    public static HeartbeatResult Parse(string json)
    {
        try
        {
            using var doc = System.Text.Json.JsonDocument.Parse(json);
            var root = doc.RootElement;
            if (root.ValueKind != System.Text.Json.JsonValueKind.Object) return new(false, null);
            bool? protection = root.TryGetProperty("protection", out var p) && p.ValueKind is System.Text.Json.JsonValueKind.True or System.Text.Json.JsonValueKind.False
                ? p.GetBoolean() : null;
            if (root.TryGetProperty("uninstall", out var u)
                && u.ValueKind == System.Text.Json.JsonValueKind.Object && u.TryGetProperty("approved", out var a) && a.ValueKind == System.Text.Json.JsonValueKind.True)
                return new(true, u.TryGetProperty("requestId", out var id) && id.TryGetInt64(out var v) ? v : null, protection);
            return new(false, null, protection);
        }
        catch (System.Text.Json.JsonException) { }
        return new(false, null);
    }
}

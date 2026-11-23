namespace AssetFlow.Agent;

public record DiskInfo(string Name, string? Filesystem, long TotalBytes, long FreeBytes);
public record SoftwareInfo(string Name, string? Version, string? Publisher, string? InstallDate);
/// <summary>Type is MONITOR, KEYBOARD or MOUSE. Model is the EDID product code (monitor) or VID/PID (input devices).</summary>
public record PeripheralInfo(string Type, string Name, string? Manufacturer, string? Model, string? SerialNo, string? Connection,
    string? VendorId, string? ProductId, int? ManufactureYear, decimal? SizeInches, string? DeviceId);
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
    List<PeripheralInfo>? Peripherals); // 0.2.13: null = collection failed (server keeps the previous list)

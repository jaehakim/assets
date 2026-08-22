namespace AssetFlow.Agent;

public record DiskInfo(string Name, string? Filesystem, long TotalBytes, long FreeBytes);
public record SoftwareInfo(string Name, string? Version, string? Publisher, string? InstallDate);
public record Inventory(
    string Hostname, string? SerialNo, string? Manufacturer, string? Model,
    string? DeviceUuid, string? DomainName, bool? DomainJoined,
    string Username, string? Department,
    string OsName, string OsVersion, string? OsBuild, string? OsArchitecture,
    DateTimeOffset? OsInstalledAt, DateTimeOffset? LastBootAt,
    string? CpuName, int? CpuCores, int? CpuLogicalProcessors, long MemoryBytes,
    string? BiosVersion, string? IpAddress, string? MacAddress,
    bool? BitlockerEnabled, bool? FirewallEnabled, string AntivirusStatus,
    bool? TpmPresent, bool? TpmEnabled, string? TpmVersion, bool? SecureBootEnabled,
    List<DiskInfo> Disks, List<SoftwareInfo> Software);

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

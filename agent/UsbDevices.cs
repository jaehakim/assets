using System.Text;

namespace AssetFlow.Agent;

/// <summary>
/// 0.2.14: rules for USB devices enumerated through SetupAPI (present and previously connected).
/// Pure functions so agent-tests can run them on Linux. Only device metadata — never file names or contents.
/// </summary>
public static class UsbDevices
{
    public const int Limit = 300; // server limit
    // Category priority when a composite device exposes several interfaces (e.g. webcam = camera + audio).
    static readonly string[] Priority = { "STORAGE", "MOBILE", "CAMERA", "PRINTER", "NETWORK", "SMARTCARD", "AUDIO", "SERIAL", "BLUETOOTH", "INPUT", "OTHER" };

    /// <summary>One raw SetupAPI entry under the USB enumerator.</summary>
    public sealed record Raw(string InstanceId, string? DeviceDesc, string? FriendlyName, string? BusReportedName, string? Manufacturer,
        string? Class, string? Service, bool? Present, DateTimeOffset? FirstInstall, DateTimeOffset? LastArrival, DateTimeOffset? LastRemoval);

    /// <summary>INF descriptions look like "@usb.inf,%usb.composite.devicedesc%;USB Composite Device".</summary>
    public static string? CleanDescription(string? value)
    {
        if (string.IsNullOrWhiteSpace(value)) return null;
        var text = value.Contains(';') && value.TrimStart().StartsWith('@') ? value[(value.LastIndexOf(';') + 1)..] : value;
        text = text.Trim();
        return text.Length == 0 ? null : text;
    }

    /// <summary>DEVPROP_TYPE_STRING: UTF-16LE, NUL terminated.</summary>
    public static string? DecodeString(byte[]? data, int length)
    {
        if (data is null || length < 2) return null;
        var text = Encoding.Unicode.GetString(data, 0, Math.Min(length, data.Length) & ~1).TrimEnd('\0').Trim();
        return text.Length == 0 ? null : text;
    }

    /// <summary>DEVPROP_TYPE_FILETIME (UTC). 0 and absurd values are null.</summary>
    public static DateTimeOffset? DecodeFileTime(byte[]? data, int length)
    {
        if (data is null || length < 8) return null;
        var ticks = BitConverter.ToInt64(data, 0);
        if (ticks <= 0) return null;
        try
        {
            var value = new DateTimeOffset(DateTime.FromFileTimeUtc(ticks));
            return value.Year is >= 1995 and <= 2100 ? value : null;
        }
        catch (ArgumentOutOfRangeException) { return null; }
    }

    /// <summary>USB\VID_0781&amp;PID_5581\4C530001 → (0781, 5581, serial 4C530001, interface null). Windows-generated instances ("6&amp;2a…&amp;0&amp;3") have no serial.</summary>
    public static (string? VendorId, string? ProductId, string? Serial, string? Interface) ParseInstanceId(string instanceId)
    {
        var parts = instanceId.Split('\\');
        var hardware = parts.Length > 1 ? parts[1].ToUpperInvariant() : "";
        string? Field(string key)
        {
            var i = hardware.IndexOf(key, StringComparison.Ordinal);
            if (i < 0) return null;
            var start = i + key.Length;
            var end = hardware.IndexOf('&', start);
            return (end < 0 ? hardware[start..] : hardware[start..end]) is { Length: > 0 } v ? v : null;
        }
        var instance = parts.Length > 2 ? parts[2] : null;
        var serial = instance is null || instance.Contains('&') ? null : Peripherals.NormalizeSerial(instance);
        return (Field("VID_"), Field("PID_"), serial, Field("MI_"));
    }

    public static bool IsHub(Raw d) =>
        d.InstanceId.StartsWith(@"USB\ROOT_HUB", StringComparison.OrdinalIgnoreCase)
        || (d.Service?.StartsWith("usbhub", StringComparison.OrdinalIgnoreCase) ?? false)
        || ((CleanDescription(d.DeviceDesc) ?? "").Contains("Hub", StringComparison.OrdinalIgnoreCase) && string.Equals(d.Class, "USB", StringComparison.OrdinalIgnoreCase));

    /// <summary>Category from the device setup class and driver service.</summary>
    public static string Category(string? cls, string? service)
    {
        string c = (cls ?? "").ToUpperInvariant(), s = (service ?? "").ToUpperInvariant();
        if (s is "USBSTOR" or "UASPSTOR" || c is "DISKDRIVE" or "CDROM") return "STORAGE";
        if (c is "WPD" or "ANDROIDUSBDEVICECLASS" || s is "WINUSB" && c == "ADB") return "MOBILE";
        if (c is "IMAGE" or "CAMERA") return "CAMERA";
        if (c == "PRINTER" || s == "USBPRINT") return "PRINTER";
        if (c == "NET") return "NETWORK";
        if (c is "SMARTCARDREADER" or "SMARTCARD" || s == "USBCCID") return "SMARTCARD";
        if (c is "MEDIA" or "AUDIOENDPOINT") return "AUDIO";
        if (c == "PORTS" || s is "USBSER" or "SERENUM") return "SERIAL";
        if (c == "BLUETOOTH") return "BLUETOOTH";
        if (c is "HIDCLASS" or "KEYBOARD" or "MOUSE") return "INPUT";
        return "OTHER";
    }

    static int Rank(string category) { var i = Array.IndexOf(Priority, category); return i < 0 ? Priority.Length : i; }

    /// <summary>
    /// Collapses interface entries (MI_xx) into their physical device, drops hubs, picks the best name and category,
    /// then orders present devices first and most recently connected next. storageNames maps a storage serial to the USBSTOR friendly name.
    /// </summary>
    public static List<UsbDeviceInfo> Build(IEnumerable<Raw> raw, IReadOnlyDictionary<string, string>? storageNames = null)
    {
        var all = raw.Where(d => !string.IsNullOrWhiteSpace(d.InstanceId) && !IsHub(d)).ToList();
        var interfaces = all.Where(d => ParseInstanceId(d.InstanceId).Interface is not null)
            .GroupBy(d => { var (v, p, _, _) = ParseInstanceId(d.InstanceId); return $"{v}|{p}"; }, StringComparer.OrdinalIgnoreCase)
            .ToDictionary(g => g.Key, g => g.ToList(), StringComparer.OrdinalIgnoreCase);
        var result = new List<UsbDeviceInfo>();
        foreach (var d in all)
        {
            var (vid, pid, serial, mi) = ParseInstanceId(d.InstanceId);
            if (mi is not null) continue; // reported through the parent device
            interfaces.TryGetValue($"{vid}|{pid}", out var children);
            var category = new[] { Category(d.Class, d.Service) }
                .Concat((children ?? []).Select(c => Category(c.Class, c.Service)))
                .OrderBy(Rank).First();
            string? storageName = null;
            if (serial is not null && storageNames is not null) storageNames.TryGetValue(serial, out storageName);
            var candidates = new[] { storageName, CleanDescription(d.FriendlyName), d.BusReportedName, CleanDescription(d.DeviceDesc) }
                .Concat((children ?? []).SelectMany(c => new[] { c.BusReportedName, CleanDescription(c.FriendlyName) }));
            var name = candidates.FirstOrDefault(n => !string.IsNullOrWhiteSpace(n) && !IsGenericUsbName(n))
                ?? candidates.FirstOrDefault(n => !string.IsNullOrWhiteSpace(n)) ?? $"USB {vid}:{pid}";
            var manufacturer = Peripherals.UsbVendor(vid) ?? CleanManufacturer(d.Manufacturer);
            bool? present = d.Present ?? children?.Select(c => c.Present).FirstOrDefault(p => p is not null);
            result.Add(new UsbDeviceInfo(Peripherals.Truncate(d.InstanceId, 500)!, category, Peripherals.Truncate(name.Trim(), 255)!,
                Peripherals.Truncate(manufacturer, 255), vid?[..Math.Min(vid.Length, 8)], pid?[..Math.Min(pid.Length, 8)], Peripherals.Truncate(serial, 255),
                Peripherals.Truncate(d.Class, 100), Peripherals.Truncate(d.Service, 100), present,
                d.FirstInstall, Max(d.LastArrival, children?.Max(c => c.LastArrival)), Max(d.LastRemoval, children?.Max(c => c.LastRemoval))));
        }
        return result
            .OrderByDescending(x => x.Present == true)
            .ThenByDescending(x => x.LastArrivalAt ?? x.FirstInstallAt ?? DateTimeOffset.MinValue)
            .Take(Limit)
            .ToList();
    }

    static readonly string[] GenericUsbNames = { "USB Composite Device", "USB Input Device", "USB Mass Storage Device", "USB-Massenspeichergerät", "USB 대용량 저장 장치", "USB 컴포지트 장치", "USB 입력 장치", "Unknown USB Device", "WinUsb Device", "USB Device" };
    public static bool IsGenericUsbName(string? name) =>
        string.IsNullOrWhiteSpace(name) || Peripherals.IsGenericName(name) || GenericUsbNames.Any(g => name.Trim().StartsWith(g, StringComparison.OrdinalIgnoreCase));

    static string? CleanManufacturer(string? value)
    {
        var text = CleanDescription(value);
        return text is null || text.StartsWith('(') || text.StartsWith("Standard", StringComparison.OrdinalIgnoreCase) || text.StartsWith("Generic", StringComparison.OrdinalIgnoreCase) || text.StartsWith("Compatible", StringComparison.OrdinalIgnoreCase)
            || text.StartsWith("Microsoft", StringComparison.OrdinalIgnoreCase) && text.Contains("Compatible", StringComparison.OrdinalIgnoreCase) ? null : text;
    }

    static DateTimeOffset? Max(DateTimeOffset? a, DateTimeOffset? b) => a is null ? b : b is null ? a : a > b ? a : b;

    /// <summary>USBSTOR\Disk&amp;Ven_SanDisk&amp;Prod_Ultra&amp;Rev_1.00\4C530001231122115172&amp;0 → serial "4C530001231122115172".</summary>
    public static string? StorageSerial(string usbstorInstanceId)
    {
        var parts = usbstorInstanceId.Split('\\');
        if (parts.Length < 3) return null;
        var instance = parts[2];
        var amp = instance.LastIndexOf('&');
        var serial = amp > 0 ? instance[..amp] : instance;
        return serial.Contains('&') ? null : Peripherals.NormalizeSerial(serial);
    }
}

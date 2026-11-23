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

    /// <summary>One raw SetupAPI entry under the USB enumerator. Parent is DEVPKEY_Device_Parent, or LastKnownParent for non-present devices.</summary>
    public sealed record Raw(string InstanceId, string? DeviceDesc, string? FriendlyName, string? BusReportedName, string? Manufacturer,
        string? Class, string? Service, bool? Present, DateTimeOffset? FirstInstall, DateTimeOffset? LastArrival, DateTimeOffset? LastRemoval,
        string? Parent = null);

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
        if (c is "NET" or "MODEM") return "NETWORK";
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
        // VID 0000 = "Device Descriptor Request Failed" (no real device information).
        var all = raw.Where(d => !string.IsNullOrWhiteSpace(d.InstanceId) && !IsHub(d) && ParseInstanceId(d.InstanceId).VendorId != "0000").ToList();
        var byId = all.GroupBy(d => d.InstanceId, StringComparer.OrdinalIgnoreCase).ToDictionary(g => g.Key, g => g.First(), StringComparer.OrdinalIgnoreCase);
        // 0.2.15: functions of a composite device (MI_xx, or vendor bus drivers such as Samsung dg_ssudbus) are children
        // of another USB entry in the device tree; fold them into the top-most USB ancestor. Devices behind hubs stay separate (hubs are not in byId).
        string Root(UsbDevices.Raw d)
        {
            var current = d;
            for (var depth = 0; depth < 8 && current.Parent is { } parent && byId.TryGetValue(parent, out var up); depth++) current = up;
            if (current == d && ParseInstanceId(d.InstanceId) is { Interface: not null, VendorId: var v, ProductId: var p })
            {
                // No parent recorded: fall back to the VID/PID of a non-interface entry.
                var owner = all.FirstOrDefault(x => ParseInstanceId(x.InstanceId) is { Interface: null } o && o.VendorId == v && o.ProductId == p);
                if (owner is not null) return owner.InstanceId;
            }
            return current.InstanceId;
        }
        var groups = all.GroupBy(Root, StringComparer.OrdinalIgnoreCase).ToDictionary(g => g.Key, g => g.ToList(), StringComparer.OrdinalIgnoreCase);
        var result = new List<UsbDeviceInfo>();
        foreach (var (rootId, members) in groups)
        {
            var d = byId[rootId];
            var (vid, pid, serial, _) = ParseInstanceId(d.InstanceId);
            var children = members.Where(m => !ReferenceEquals(m, d)).ToList();
            var category = new[] { Category(d.Class, d.Service) }
                .Concat(children.Select(c => Category(c.Class, c.Service)))
                .OrderBy(Rank).First();
            string? storageName = null;
            if (serial is not null && storageNames is not null) storageNames.TryGetValue(serial, out storageName);
            var candidates = new[] { storageName, CleanDescription(d.FriendlyName), d.BusReportedName, CleanDescription(d.DeviceDesc) }
                .Concat(children.SelectMany(c => new[] { c.BusReportedName, CleanDescription(c.FriendlyName) }));
            // Prefer a child function's specific name ("Galaxy Tab A11+") over a bus driver's ("SAMSUNG_Android") only when the parent name is generic.
            var name = candidates.Select(SanitizeName).FirstOrDefault(n => !string.IsNullOrWhiteSpace(n) && !IsGenericUsbName(n))
                ?? candidates.Select(SanitizeName).FirstOrDefault(n => !string.IsNullOrWhiteSpace(n)) ?? $"USB {vid}:{pid}";
            var mobileName = category == "MOBILE" ? children.Where(c => Category(c.Class, c.Service) == "MOBILE")
                .SelectMany(c => new[] { c.FriendlyName, c.BusReportedName, c.DeviceDesc }.Select(n => SanitizeName(CleanDescription(n))))
                .FirstOrDefault(n => n is not null && !IsGenericUsbName(n) && !n.Contains("Interface", StringComparison.OrdinalIgnoreCase)) : null;
            if (mobileName is not null) name = mobileName;
            var manufacturer = Peripherals.UsbVendor(vid) ?? CleanManufacturer(d.Manufacturer, vid);
            bool? present = d.Present ?? children.Select(c => c.Present).FirstOrDefault(p => p is not null);
            result.Add(new UsbDeviceInfo(Peripherals.Truncate(d.InstanceId, 500)!, category, Peripherals.Truncate(name.Trim(), 255)!,
                Peripherals.Truncate(manufacturer, 255), vid?[..Math.Min(vid.Length, 8)], pid?[..Math.Min(pid.Length, 8)], Peripherals.Truncate(serial, 255),
                Peripherals.Truncate(d.Class, 100), Peripherals.Truncate(d.Service, 100), present,
                d.FirstInstall, Max(d.LastArrival, children.Max(c => c.LastArrival)), Max(d.LastRemoval, children.Max(c => c.LastRemoval))));
        }
        return result
            .OrderByDescending(x => x.Present == true)
            .ThenByDescending(x => x.LastArrivalAt ?? x.FirstInstallAt ?? DateTimeOffset.MinValue)
            .Take(Limit)
            .ToList();
    }

    static readonly string[] GenericUsbNames = { "USB Composite Device", "USB Input Device", "USB Mass Storage Device", "USB-Massenspeichergerät", "USB 대용량 저장 장치", "USB 컴포지트 장치", "USB 입력 장치", "Unknown USB Device", "WinUsb Device", "USB Device",
        // 0.2.16: generic MTP function names (English / Korean Windows)
        "MTP USB Device", "MTP USB 장치", "USB MTP 장치", "Portable Device", "휴대용 장치" };
    public static bool IsGenericUsbName(string? name) =>
        string.IsNullOrWhiteSpace(name) || Peripherals.IsGenericName(name) || GenericUsbNames.Any(g => name.Trim().StartsWith(g, StringComparison.OrdinalIgnoreCase));

    /// <summary>
    /// 0.2.15: some devices report strings with a corrupted high byte ("Wired Keyboard ࠶00" = 0x0836 for '6').
    /// In an otherwise ASCII name, a U+0100–U+0FFF char whose low byte is printable ASCII is restored to that byte; control chars are dropped.
    /// </summary>
    public static string? SanitizeName(string? value)
    {
        if (string.IsNullOrWhiteSpace(value)) return null;
        var ascii = value.Count(c => c < 0x80);
        var chars = value.Where(c => !char.IsControl(c)).Select(c =>
            ascii >= value.Length - 2 && c is >= '\u0100' and <= '\u0FFF' && (c & 0xFF) is >= 0x20 and < 0x7F ? (char)(c & 0xFF) : c).ToArray();
        var text = new string(chars).Trim();
        return text.Length == 0 ? null : text;
    }

    static string? CleanManufacturer(string? value, string? vid = null)
    {
        var text = CleanDescription(value);
        // The INF provider of class drivers is "Microsoft" (e.g. generic printer, HID); only trust it for Microsoft hardware.
        if (text is not null && text.StartsWith("Microsoft", StringComparison.OrdinalIgnoreCase) && vid != "045E") return null;
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

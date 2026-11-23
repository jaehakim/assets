using System.Text.RegularExpressions;

namespace AssetFlow.Agent;

/// <summary>
/// Pure parsing rules for monitors, keyboards and mice (no WMI dependency so agent-tests can run them on Linux).
/// Only device metadata is collected — never key strokes, pointer movement or screen content.
/// </summary>
public static class Peripherals
{
    public const string Monitor = "MONITOR", Keyboard = "KEYBOARD", Mouse = "MOUSE";

    // PNP vendor IDs found in monitor EDID (3 letters). Unknown codes are reported as-is.
    static readonly Dictionary<string, string> MonitorVendors = new(StringComparer.OrdinalIgnoreCase)
    {
        ["ACR"] = "Acer", ["AOC"] = "AOC", ["APP"] = "Apple", ["AUO"] = "AU Optronics", ["AUS"] = "ASUS", ["BNQ"] = "BenQ",
        ["BOE"] = "BOE", ["CMN"] = "Innolux", ["CMO"] = "Chi Mei", ["DEL"] = "Dell", ["ENC"] = "EIZO", ["EIZ"] = "EIZO",
        ["GSM"] = "LG Electronics", ["HPN"] = "HP", ["HWP"] = "HP", ["IVO"] = "InfoVision", ["LEN"] = "Lenovo", ["LGD"] = "LG Display",
        ["MSI"] = "MSI", ["NEC"] = "NEC", ["PHL"] = "Philips", ["SAM"] = "Samsung", ["SDC"] = "Samsung Display", ["SEC"] = "Samsung",
        ["SHP"] = "Sharp", ["SNY"] = "Sony", ["VSC"] = "ViewSonic", ["HKC"] = "HKC", ["GBT"] = "Gigabyte", ["XMI"] = "Xiaomi",
    };

    // USB vendor IDs of common keyboard/mouse makers. Unknown IDs keep only the VID.
    static readonly Dictionary<string, string> UsbVendors = new(StringComparer.OrdinalIgnoreCase)
    {
        ["046D"] = "Logitech", ["045E"] = "Microsoft", ["413C"] = "Dell", ["17EF"] = "Lenovo", ["03F0"] = "HP", ["05AC"] = "Apple",
        ["1532"] = "Razer", ["04F2"] = "Chicony", ["093A"] = "PixArt", ["258A"] = "Sino Wealth", ["1A2C"] = "China Resource Semico",
        ["04D9"] = "Holtek", ["0461"] = "Primax", ["046A"] = "Cherry", ["1BCF"] = "Sunplus", ["04CA"] = "Lite-On", ["0458"] = "KYE (Genius)",
        ["1EA7"] = "SHARKOON", ["0B05"] = "ASUS", ["1038"] = "SteelSeries", ["1B1C"] = "Corsair", ["3434"] = "Keychron", ["04E8"] = "Samsung",
        ["24AE"] = "Rapoo", ["0951"] = "Kingston", ["0E8F"] = "GreenAsia", ["1C4F"] = "SiGma Micro", ["2EA8"] = "Abko",
        // 0.2.14: common USB storage, phone, camera, printer and adapter vendors
        ["0781"] = "SanDisk", ["090C"] = "Silicon Motion", ["13FE"] = "Phison", ["058F"] = "Alcor Micro", ["8564"] = "Transcend", ["0930"] = "Toshiba",
        ["1058"] = "Western Digital", ["0BC2"] = "Seagate", ["152D"] = "JMicron", ["174C"] = "ASMedia", ["18D1"] = "Google", ["22B8"] = "Motorola",
        ["2717"] = "Xiaomi", ["12D1"] = "Huawei", ["054C"] = "Sony", ["04A9"] = "Canon", ["04B8"] = "Epson", ["04F9"] = "Brother", ["0BDA"] = "Realtek",
        ["8087"] = "Intel", ["0A5C"] = "Broadcom", ["0CF3"] = "Qualcomm Atheros", ["0B95"] = "ASIX", ["2109"] = "VIA Labs", ["05E3"] = "Genesys Logic",
        ["1004"] = "LG Electronics", ["2A70"] = "OnePlus", ["0FCE"] = "Sony Mobile", ["0E8D"] = "MediaTek", ["067B"] = "Prolific", ["0403"] = "FTDI",
        ["10C4"] = "Silicon Labs", ["1A86"] = "QinHeng (CH340)", ["076B"] = "OmniKey", ["072F"] = "ACS", ["0BB4"] = "HTC",
        ["125F"] = "ADATA", ["08A6"] = "Toshiba TEC", ["0A12"] = "Cambridge Silicon Radio", ["1F75"] = "Innostor", ["048D"] = "ITE", ["0C45"] = "Sonix",
    };

    static readonly Regex Vid = new(@"VID[_&](?:0002)?([0-9A-F]{4,6})", RegexOptions.IgnoreCase | RegexOptions.Compiled);
    static readonly Regex Pid = new(@"PID[_&]([0-9A-F]{4})", RegexOptions.IgnoreCase | RegexOptions.Compiled);
    static readonly Regex DisplayProduct = new(@"^DISPLAY\\([A-Z]{3})([0-9A-F]{4})\\", RegexOptions.IgnoreCase | RegexOptions.Compiled);
    static readonly string[] GenericNames = { "HID Keyboard Device", "HID-compliant mouse", "USB Input Device", "HID-compliant device", "Standard PS/2 Keyboard", "PS/2 Compatible Mouse", "Generic PnP Monitor", "USB Receiver",
        // 0.2.15: Korean Windows display names (seen on production PCs)
        "HID 키보드 장치", "HID 규격 마우스", "HID 규격 장치", "USB 입력 장치", "표준 PS/2 키보드", "PS/2 호환 마우스", "일반 PnP 모니터", "알 수 없는 키보드", "알 수 없는 마우스" };

    /// <summary>WmiMonitorID string fields are uint16[] of characters padded with 0.</summary>
    public static string? DecodeWmiChars(object? value)
    {
        IEnumerable<int>? codes = value switch
        {
            ushort[] u => u.Select(c => (int)c),
            byte[] b => b.Select(c => (int)c),
            int[] i => i,
            _ => null,
        };
        if (codes is null) return null;
        var text = new string(codes.TakeWhile(c => c != 0).Where(c => c is >= 32 and < 0xFFFF).Select(c => (char)c).ToArray()).Trim();
        return text.Length == 0 ? null : text;
    }

    /// <summary>Serial strings such as "0" or all zeroes are EDID placeholders, not real serials.</summary>
    public static string? NormalizeSerial(string? value)
    {
        var s = value?.Trim();
        // 0.2.15: "16843009" is 0x01010101 (EDID placeholder seen on LG monitors); "____________" on label printers.
        if (string.IsNullOrEmpty(s) || s.All(c => c == s[0] && !char.IsLetter(c)) || !s.Any(char.IsLetterOrDigit)
            || s is "16843009" or "0x01010101" || s.Equals("Default string", StringComparison.OrdinalIgnoreCase)) return null;
        return s;
    }

    public static string? MonitorVendor(string? code) =>
        string.IsNullOrWhiteSpace(code) ? null : MonitorVendors.TryGetValue(code.Trim(), out var name) ? name : code.Trim().ToUpperInvariant();

    public static string? UsbVendor(string? vid) => vid is not null && UsbVendors.TryGetValue(vid, out var name) ? name : null;

    /// <summary>Diagonal in inches from WmiMonitorBasicDisplayParams (cm). TVs/projectors report 0 → null.</summary>
    public static decimal? DiagonalInches(int? horizontalCm, int? verticalCm)
    {
        if (horizontalCm is not > 0 || verticalCm is not > 0) return null;
        return Math.Round((decimal)(Math.Sqrt((double)(horizontalCm.Value * horizontalCm.Value + verticalCm.Value * verticalCm.Value)) / 2.54), 1);
    }

    /// <summary>D3DKMDT_VIDEO_OUTPUT_TECHNOLOGY from WmiMonitorConnectionParams.</summary>
    public static string? VideoOutput(long? technology) => technology switch
    {
        null => null,
        0 => "VGA",
        1 or 2 or 3 or 14 => "Analog TV",
        4 => "DVI",
        5 => "HDMI",
        6 or 11 or 13 or 0x80000000L => "Internal",
        10 => "DisplayPort",
        12 => "UDI",
        15 => "Miracast",
        16 => "Indirect",
        _ => "Other",
    };

    /// <summary>Remote desktop, Hyper-V and software devices are not physical peripherals.</summary>
    public static bool IsVirtual(string? pnpDeviceId)
    {
        if (string.IsNullOrWhiteSpace(pnpDeviceId)) return true;
        var id = pnpDeviceId.ToUpperInvariant();
        return id.StartsWith(@"ROOT\") || id.StartsWith(@"SWD\") || id.StartsWith(@"TERMINPUT_BUS\") || id.StartsWith(@"VMBUS\")
            || id.Contains("RDP_") || id.Contains("RDPDR") || id.Contains("VMWARE") || id.Contains("VBOX");
    }

    /// <summary>Extracts VID/PID and the physical connection from a keyboard/mouse PNPDeviceID. ACPI (i8042) devices are the built-in keyboard/touchpad on portables, PS/2 ports on desktops.</summary>
    public static (string? VendorId, string? ProductId, string Connection) ParseInputDeviceId(string pnpDeviceId, bool portable)
    {
        var id = pnpDeviceId.ToUpperInvariant();
        string? vid = null, pid = null;
        var v = Vid.Match(id);
        if (v.Success) vid = v.Groups[1].Value[^4..];
        var p = Pid.Match(id);
        if (p.Success) pid = p.Groups[1].Value;
        string connection =
            id.Contains("{00001124-") || id.Contains("{00001812-") || id.StartsWith(@"BTHENUM\") || id.StartsWith(@"BTHLEDEVICE\") || id.Contains("BTHLE") ? "Bluetooth"
            : id.StartsWith(@"ACPI\") ? (portable ? "Internal" : "PS/2")
            : id.StartsWith(@"HID\VEN_") || (id.StartsWith(@"HID\") && !v.Success && !id.StartsWith(@"HID\{")) ? "Internal"
            : id.StartsWith(@"HID\VID_") || id.StartsWith(@"USB\") ? "USB"
            : "Other";
        return (vid, pid, connection);
    }

    /// <summary>Win32_SystemEnclosure.ChassisTypes values for laptops, notebooks, tablets and convertibles.</summary>
    public static bool IsPortableChassis(IEnumerable<int>? chassisTypes) =>
        chassisTypes?.Any(t => t is 8 or 9 or 10 or 11 or 12 or 14 or 18 or 21 or 30 or 31 or 32) == true;

    public static bool IsGenericName(string? name) =>
        string.IsNullOrWhiteSpace(name) || GenericNames.Any(g => g.Equals(name.Trim(), StringComparison.OrdinalIgnoreCase));

    /// <summary>Builds a keyboard/mouse entry. busName is the HID product string (DEVPKEY_Device_BusReportedDeviceDesc) when available.</summary>
    public static PeripheralInfo? InputDevice(string type, string? pnpDeviceId, string? wmiName, string? wmiManufacturer, string? busName, bool portable)
    {
        if (IsVirtual(pnpDeviceId)) return null;
        var (vid, pid, connection) = ParseInputDeviceId(pnpDeviceId!, portable);
        var manufacturer = UsbVendor(vid)
            ?? (string.IsNullOrWhiteSpace(wmiManufacturer) || wmiManufacturer.StartsWith('(') ? null : wmiManufacturer.Trim());
        var name = !IsGenericName(busName) ? busName!.Trim() : !IsGenericName(wmiName) ? wmiName!.Trim()
            : busName?.Trim() ?? wmiName?.Trim() ?? (type == Keyboard ? "Keyboard" : "Mouse");
        if (connection == "Internal" && IsGenericName(name)) name = type == Keyboard ? "내장 키보드" : "내장 터치패드/포인팅 장치";
        var model = vid is not null && pid is not null ? $"VID_{vid}&PID_{pid}" : null;
        return new PeripheralInfo(type, Truncate(name, 255)!, Truncate(manufacturer, 255), model, null, connection, vid, pid, null, null, Truncate(pnpDeviceId, 500));
    }

    public static PeripheralInfo MonitorDevice(string? instanceName, string? manufacturerCode, string? productCode, string? serial, string? friendlyName,
        int? year, int? horizontalCm, int? verticalCm, long? videoOutput)
    {
        var m = instanceName is null ? Match.Empty : DisplayProduct.Match(instanceName);
        manufacturerCode ??= m.Success ? m.Groups[1].Value : null;
        productCode ??= m.Success ? m.Groups[2].Value : null;
        var manufacturer = MonitorVendor(manufacturerCode);
        var name = friendlyName ?? string.Join(' ', new[] { manufacturer, productCode }.Where(x => !string.IsNullOrWhiteSpace(x)));
        if (string.IsNullOrWhiteSpace(name)) name = "Monitor";
        var model = manufacturerCode is not null && productCode is not null ? $"{manufacturerCode.ToUpperInvariant()}{productCode.ToUpperInvariant()}" : productCode;
        return new PeripheralInfo(Monitor, Truncate(name, 255)!, Truncate(manufacturer, 255), Truncate(model, 100), Truncate(NormalizeSerial(serial), 100),
            VideoOutput(videoOutput), null, null, year is > 1990 and < 2100 ? year : null, DiagonalInches(horizontalCm, verticalCm), Truncate(instanceName, 500));
    }

    /// <summary>
    /// 0.2.15: HID names on Windows are usually generic and Win32_PointingDevice.Manufacturer is the INF provider ("Microsoft").
    /// Take the product name / maker from the USB device with the same VID/PID, and drop the keyboard collection that gaming mice expose.
    /// </summary>
    public static List<PeripheralInfo> Enrich(IEnumerable<PeripheralInfo> items, IReadOnlyCollection<UsbDeviceInfo>? usb)
    {
        var list = items.Select(p =>
        {
            if (p.Type == Monitor || p.VendorId is null || p.ProductId is null) return p;
            var match = usb?.Where(u => string.Equals(u.VendorId, p.VendorId, StringComparison.OrdinalIgnoreCase) && string.Equals(u.ProductId, p.ProductId, StringComparison.OrdinalIgnoreCase))
                .OrderByDescending(u => u.Present == true).FirstOrDefault();
            var name = IsGenericName(p.Name) && match is not null && !UsbDevices.IsGenericUsbName(match.Name) ? match.Name : p.Name;
            var manufacturer = UsbVendor(p.VendorId) ?? match?.Manufacturer
                ?? (p.Manufacturer is not null && p.Manufacturer.StartsWith("Microsoft", StringComparison.OrdinalIgnoreCase) && p.VendorId != "045E" ? null : p.Manufacturer);
            return p with { Name = name, Manufacturer = manufacturer };
        }).ToList();
        var mice = list.Where(p => p.Type == Mouse && p.VendorId is not null).Select(p => $"{p.VendorId}|{p.ProductId}").ToHashSet(StringComparer.OrdinalIgnoreCase);
        return list.Where(p => !(p.Type == Keyboard && p.VendorId is not null && mice.Contains($"{p.VendorId}|{p.ProductId}")
            && p.Name.Contains("mouse", StringComparison.OrdinalIgnoreCase))).ToList();
    }

    /// <summary>One physical keyboard exposes several HID collections; keep one entry per type+VID+PID (or per device ID when unknown).</summary>
    public static List<PeripheralInfo> Deduplicate(IEnumerable<PeripheralInfo> items) => items
        .GroupBy(x => x.VendorId is not null && x.ProductId is not null ? $"{x.Type}|{x.VendorId}|{x.ProductId}" : $"{x.Type}|{x.DeviceId}", StringComparer.OrdinalIgnoreCase)
        .Select(g => g.OrderBy(x => IsGenericName(x.Name) ? 1 : 0).First())
        .OrderBy(x => x.Type switch { Monitor => 0, Keyboard => 1, _ => 2 }).ThenBy(x => x.Name, StringComparer.OrdinalIgnoreCase)
        .Take(64) // server limit
        .ToList();

    /// <summary>Short, credential-free failure note for the server ("peripherals: ManagementException InvalidQuery").</summary>
    public static string ErrorNote(string area, Exception e)
    {
        var detail = e is System.Runtime.InteropServices.ExternalException x ? $"0x{x.ErrorCode:X8}" : "";
        var code = e.GetType().GetProperty("ErrorCode")?.GetValue(e)?.ToString();
        return Truncate($"{area}: {e.GetType().Name} {code ?? detail}".Trim(), 300)!;
    }

    internal static string? Truncate(string? value, int max) => value is null || value.Length <= max ? value : value[..max];
}

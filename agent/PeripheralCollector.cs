using System.Management;

namespace AssetFlow.Agent;

/// <summary>
/// 0.2.13: collects monitors (EDID via root\wmi) and keyboards/mice (Win32_Keyboard, Win32_PointingDevice).
/// Returns null when a query fails unexpectedly so the server keeps the previous list instead of logging false removals.
/// </summary>
public static class PeripheralCollector
{
    const string BusReportedName = "DEVPKEY_Device_BusReportedDeviceDesc", Parent = "DEVPKEY_Device_Parent";

    /// <summary>On failure the reason is appended to <paramref name="errors"/> (sent to the server for remote diagnosis).</summary>
    public static List<PeripheralInfo>? Collect(List<string> errors)
    {
        try
        {
            var portable = Peripherals.IsPortableChassis(Query(@"root\cimv2", "SELECT ChassisTypes FROM Win32_SystemEnclosure")
                .SelectMany(o => o["ChassisTypes"] is ushort[] t ? t.Select(x => (int)x) : Enumerable.Empty<int>()));
            var items = new List<PeripheralInfo>();
            items.AddRange(Monitors());
            // 0.2.14: Win32_Keyboard has no Manufacturer property — selecting it made the whole query fail in 0.2.13.
            foreach (var (type, wql) in new[] { (Peripherals.Keyboard, "SELECT Name,PNPDeviceID FROM Win32_Keyboard"), (Peripherals.Mouse, "SELECT Name,Manufacturer,PNPDeviceID FROM Win32_PointingDevice") })
                foreach (var o in Query(@"root\cimv2", wql).Take(32))
                {
                    var id = o["PNPDeviceID"]?.ToString();
                    if (Peripherals.IsVirtual(id)) continue;
                    var item = Peripherals.InputDevice(type, id, o["Name"]?.ToString(), Prop(o, "Manufacturer"), BusName(id!), portable);
                    if (item is not null) items.Add(item);
                }
            return Peripherals.Deduplicate(items);
        }
        catch (Exception e) { errors.Add(Peripherals.ErrorNote("peripherals", e)); return null; }
    }

    static IEnumerable<PeripheralInfo> Monitors()
    {
        // Monitor classes live in root\wmi and are missing on headless servers / some VMs: that means "no monitor", not a failure.
        var ids = QueryOptional(@"root\wmi", "SELECT * FROM WmiMonitorID");
        if (ids.Count == 0) return [];
        var sizes = QueryOptional(@"root\wmi", "SELECT InstanceName,MaxHorizontalImageSize,MaxVerticalImageSize FROM WmiMonitorBasicDisplayParams")
            .GroupBy(o => o["InstanceName"]?.ToString() ?? "").ToDictionary(g => g.Key, g => g.First());
        var outputs = QueryOptional(@"root\wmi", "SELECT InstanceName,VideoOutputTechnology FROM WmiMonitorConnectionParams")
            .GroupBy(o => o["InstanceName"]?.ToString() ?? "").ToDictionary(g => g.Key, g => g.First());
        return ids.Where(o => o["Active"] is not bool active || active).Select(o =>
        {
            var instance = o["InstanceName"]?.ToString() ?? "";
            sizes.TryGetValue(instance, out var size);
            outputs.TryGetValue(instance, out var output);
            return Peripherals.MonitorDevice(instance,
                Peripherals.DecodeWmiChars(o["ManufacturerName"]), Peripherals.DecodeWmiChars(o["ProductCodeID"]),
                Peripherals.DecodeWmiChars(o["SerialNumberID"]), Peripherals.DecodeWmiChars(o["UserFriendlyName"]),
                Int(o["YearOfManufacture"]), Int(size?["MaxHorizontalImageSize"]), Int(size?["MaxVerticalImageSize"]),
                output?["VideoOutputTechnology"] is { } v ? Convert.ToInt64(v) : null);
        }).ToList();
    }

    /// <summary>HID product string (e.g. "G502 HERO", "USB Receiver"); falls back to the parent USB/BT node.</summary>
    static string? BusName(string pnpDeviceId)
    {
        try
        {
            var props = DeviceProperties(pnpDeviceId, BusReportedName, Parent);
            if (props.TryGetValue(BusReportedName, out var name) && !string.IsNullOrWhiteSpace(name)) return name;
            return props.TryGetValue(Parent, out var parent) && !string.IsNullOrWhiteSpace(parent)
                && DeviceProperties(parent, BusReportedName).TryGetValue(BusReportedName, out var parentName) ? parentName : null;
        }
        catch { return null; }
    }

    static Dictionary<string, string?> DeviceProperties(string pnpDeviceId, params string[] keys)
    {
        var escaped = pnpDeviceId.Replace("\\", "\\\\").Replace("'", "\\'");
        using var entity = new ManagementObject($"Win32_PnPEntity.DeviceID='{escaped}'");
        using var input = entity.GetMethodParameters("GetDeviceProperties");
        input["devicePropertyKeys"] = keys;
        using var output = entity.InvokeMethod("GetDeviceProperties", input, null);
        return (output?["deviceProperties"] as ManagementBaseObject[] ?? [])
            .Where(p => p["KeyName"] is string)
            .GroupBy(p => (string)p["KeyName"])
            .ToDictionary(g => g.Key, g => g.First()["Data"]?.ToString()?.Trim());
    }

    static List<ManagementBaseObject> Query(string scope, string wql)
    {
        using var searcher = new ManagementObjectSearcher(scope, wql);
        return searcher.Get().Cast<ManagementBaseObject>().ToList();
    }

    static List<ManagementBaseObject> QueryOptional(string scope, string wql)
    {
        try { return Query(scope, wql); }
        catch (ManagementException e) when (e.ErrorCode is ManagementStatus.NotSupported or ManagementStatus.NotFound or ManagementStatus.InvalidClass) { return []; }
    }

    static string? Prop(ManagementBaseObject o, string name) { try { return o[name]?.ToString(); } catch (ManagementException) { return null; } }
    static int? Int(object? value) { try { return value is null ? null : Convert.ToInt32(value); } catch { return null; } }
}

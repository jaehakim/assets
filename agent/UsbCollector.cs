using System.Runtime.InteropServices;
using System.Text;

namespace AssetFlow.Agent;

/// <summary>
/// 0.2.14: enumerates every device Windows has recorded under the USB enumerator — currently connected and previously
/// connected (non-present) — through SetupAPI without DIGCF_PRESENT. Windows keeps non-present devices until the
/// "Plug and Play Cleanup" task removes them (typically after 30 days), so the server accumulates longer history.
/// </summary>
public static class UsbCollector
{
    public static List<UsbDeviceInfo>? Collect(List<string> errors)
    {
        try
        {
            var storageNames = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
            foreach (var d in Enumerate("USBSTOR"))
                if (UsbDevices.StorageSerial(d.InstanceId) is { } serial && UsbDevices.CleanDescription(d.FriendlyName) is { } name)
                    storageNames.TryAdd(serial, name);
            return UsbDevices.Build(Enumerate("USB"), storageNames);
        }
        catch (Exception e) { errors.Add(Peripherals.ErrorNote("usb", e)); return null; }
    }

    static List<UsbDevices.Raw> Enumerate(string enumerator)
    {
        var list = new List<UsbDevices.Raw>();
        var set = SetupDiGetClassDevsW(IntPtr.Zero, enumerator, IntPtr.Zero, DIGCF_ALLCLASSES);
        if (set == InvalidHandle)
        {
            var error = Marshal.GetLastWin32Error();
            if (error is ERROR_INVALID_DATA or ERROR_NOT_FOUND) return list; // enumerator never used on this PC
            throw new System.ComponentModel.Win32Exception(error);
        }
        try
        {
            var data = new SP_DEVINFO_DATA { cbSize = (uint)Marshal.SizeOf<SP_DEVINFO_DATA>() };
            var id = new StringBuilder(512);
            for (uint i = 0; i < 2000 && SetupDiEnumDeviceInfo(set, i, ref data); i++)
            {
                try
                {
                    id.Clear();
                    if (!SetupDiGetDeviceInstanceIdW(set, ref data, id, id.Capacity, out _)) continue;
                    list.Add(new UsbDevices.Raw(id.ToString(),
                        Text(set, ref data, DeviceDesc), Text(set, ref data, FriendlyName), Text(set, ref data, BusReportedDeviceDesc),
                        Text(set, ref data, Manufacturer), Text(set, ref data, Class), Text(set, ref data, Service),
                        Bool(set, ref data, IsPresent),
                        Time(set, ref data, FirstInstallDate), Time(set, ref data, LastArrivalDate), Time(set, ref data, LastRemovalDate),
                        Text(set, ref data, Parent) ?? Text(set, ref data, LastKnownParent)));
                }
                catch { /* one unreadable device must not hide the rest */ }
            }
        }
        finally { SetupDiDestroyDeviceInfoList(set); }
        return list;
    }

    static (byte[] Buffer, int Length, uint Type)? Read(IntPtr set, ref SP_DEVINFO_DATA data, DEVPROPKEY key)
    {
        var buffer = new byte[1024];
        return SetupDiGetDevicePropertyW(set, ref data, ref key, out var type, buffer, (uint)buffer.Length, out var size, 0)
            ? (buffer, (int)size, type) : null;
    }
    static string? Text(IntPtr set, ref SP_DEVINFO_DATA data, DEVPROPKEY key) =>
        Read(set, ref data, key) is { Type: DEVPROP_TYPE_STRING } v ? UsbDevices.DecodeString(v.Buffer, v.Length) : null;
    static DateTimeOffset? Time(IntPtr set, ref SP_DEVINFO_DATA data, DEVPROPKEY key) =>
        Read(set, ref data, key) is { Type: DEVPROP_TYPE_FILETIME } v ? UsbDevices.DecodeFileTime(v.Buffer, v.Length) : null;
    static bool? Bool(IntPtr set, ref SP_DEVINFO_DATA data, DEVPROPKEY key) =>
        Read(set, ref data, key) is { Type: DEVPROP_TYPE_BOOLEAN, Length: >= 1 } v ? v.Buffer[0] != 0 : null;

    const uint DIGCF_ALLCLASSES = 0x4, DEVPROP_TYPE_STRING = 0x12, DEVPROP_TYPE_FILETIME = 0x10, DEVPROP_TYPE_BOOLEAN = 0x11;
    const int ERROR_INVALID_DATA = 13, ERROR_NOT_FOUND = 1168;
    static readonly IntPtr InvalidHandle = new(-1);
    static readonly Guid General = new("a45c254e-df1c-4efd-8020-67d146a850e0"), Bus = new("540b947e-8b40-45bc-a8a2-6a0b894cbda2"),
        Install = new("83da6326-97a6-4088-9453-a1923f573b29");
    static readonly DEVPROPKEY DeviceDesc = new(General, 2), Service = new(General, 6), Class = new(General, 9), Manufacturer = new(General, 13),
        FriendlyName = new(General, 14), BusReportedDeviceDesc = new(Bus, 4), IsPresent = new(Bus, 5),
        FirstInstallDate = new(Install, 101), LastArrivalDate = new(Install, 102), LastRemovalDate = new(Install, 103),
        Parent = new(new Guid("4340a6c5-93fa-4706-972c-7b648008a5a7"), 8), LastKnownParent = new(Install, 10);

    [StructLayout(LayoutKind.Sequential)]
    struct SP_DEVINFO_DATA { public uint cbSize; public Guid ClassGuid; public uint DevInst; public IntPtr Reserved; }
    [StructLayout(LayoutKind.Sequential)]
    readonly struct DEVPROPKEY(Guid fmtid, uint pid) { readonly Guid fmtid = fmtid; readonly uint pid = pid; }

    [DllImport("setupapi.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    static extern IntPtr SetupDiGetClassDevsW(IntPtr classGuid, string enumerator, IntPtr hwndParent, uint flags);
    [DllImport("setupapi.dll", SetLastError = true)]
    static extern bool SetupDiEnumDeviceInfo(IntPtr deviceInfoSet, uint memberIndex, ref SP_DEVINFO_DATA deviceInfoData);
    [DllImport("setupapi.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    static extern bool SetupDiGetDeviceInstanceIdW(IntPtr deviceInfoSet, ref SP_DEVINFO_DATA deviceInfoData, StringBuilder deviceInstanceId, int deviceInstanceIdSize, out int requiredSize);
    [DllImport("setupapi.dll", SetLastError = true)]
    static extern bool SetupDiGetDevicePropertyW(IntPtr deviceInfoSet, ref SP_DEVINFO_DATA deviceInfoData, ref DEVPROPKEY propertyKey,
        out uint propertyType, byte[] propertyBuffer, uint propertyBufferSize, out uint requiredSize, uint flags);
    [DllImport("setupapi.dll", SetLastError = true)]
    static extern bool SetupDiDestroyDeviceInfoList(IntPtr deviceInfoSet);
}

using Microsoft.Win32;
using System.Management;
using System.Net.NetworkInformation;

namespace AssetFlow.Agent;

public sealed class InventoryCollector
{
    public Task<Inventory> CollectAsync() => Task.Run(() =>
    {
        var cs = Wmi("Win32_ComputerSystem", "Manufacturer", "Model", "TotalPhysicalMemory", "Domain", "PartOfDomain");
        var product = Wmi("Win32_ComputerSystemProduct", "UUID");
        var bios = Wmi("Win32_BIOS", "SerialNumber", "SMBIOSBIOSVersion");
        var os = Wmi("Win32_OperatingSystem", "Caption", "Version", "BuildNumber", "OSArchitecture", "InstallDate", "LastBootUpTime");
        var cpu = Wmi("Win32_Processor", "Name", "NumberOfCores", "NumberOfLogicalProcessors");
        var nic = NetworkInterface.GetAllNetworkInterfaces().FirstOrDefault(n =>
            n.OperationalStatus == OperationalStatus.Up && n.NetworkInterfaceType != NetworkInterfaceType.Loopback);
        var ip = nic?.GetIPProperties().UnicastAddresses.FirstOrDefault(x =>
            x.Address.AddressFamily == System.Net.Sockets.AddressFamily.InterNetwork)?.Address.ToString();
        var disks = DriveInfo.GetDrives().Where(d => d.IsReady && d.DriveType == DriveType.Fixed)
            .Select(d => new DiskInfo(d.Name, d.DriveFormat, d.TotalSize, d.AvailableFreeSpace)).ToList();
        var tpm = Tpm();
        return new Inventory(
            Environment.MachineName, S(bios, "SerialNumber"), S(cs, "Manufacturer"), S(cs, "Model"),
            S(product, "UUID"), S(cs, "Domain"), B(cs, "PartOfDomain"), Environment.UserName, null,
            S(os, "Caption") ?? Environment.OSVersion.VersionString, S(os, "Version") ?? "",
            S(os, "BuildNumber"), S(os, "OSArchitecture"), D(os, "InstallDate"), D(os, "LastBootUpTime"),
            S(cpu, "Name"), I(cpu, "NumberOfCores"), I(cpu, "NumberOfLogicalProcessors"), L(cs, "TotalPhysicalMemory"),
            S(bios, "SMBIOSBIOSVersion"), ip, nic?.GetPhysicalAddress().ToString(),
            BitLocker(), Firewall(), Defender(), tpm.Present, tpm.Enabled, tpm.Version, SecureBoot(), disks, Software());
    });

    private static ManagementBaseObject? Wmi(string name, params string[] fields)
    {
        try { using var s = new ManagementObjectSearcher($"SELECT {string.Join(',', fields)} FROM {name}"); return s.Get().Cast<ManagementBaseObject>().FirstOrDefault(); }
        catch { return null; }
    }
    private static string? S(ManagementBaseObject? o, string k) => o?[k]?.ToString()?.Trim();
    private static long L(ManagementBaseObject? o, string k) => long.TryParse(S(o, k), out var v) ? v : 0;
    private static int? I(ManagementBaseObject? o, string k) => int.TryParse(S(o, k), out var v) ? v : null;
    private static bool? B(ManagementBaseObject? o, string k) => o?[k] is null ? null : Convert.ToBoolean(o[k]);
    private static DateTimeOffset? D(ManagementBaseObject? o, string k)
    {
        try { var value = S(o, k); return value is null ? null : new DateTimeOffset(ManagementDateTimeConverter.ToDateTime(value).ToUniversalTime()); }
        catch { return null; }
    }

    private static List<SoftwareInfo> Software()
    {
        var list = new List<SoftwareInfo>();
        foreach (var view in new[] { RegistryView.Registry64, RegistryView.Registry32 })
        {
            using var root = RegistryKey.OpenBaseKey(RegistryHive.LocalMachine, view).OpenSubKey(@"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall");
            if (root == null) continue;
            foreach (var n in root.GetSubKeyNames())
            {
                using var k = root.OpenSubKey(n);
                var name = k?.GetValue("DisplayName")?.ToString();
                if (!string.IsNullOrWhiteSpace(name)) list.Add(new(name, k?.GetValue("DisplayVersion")?.ToString(), k?.GetValue("Publisher")?.ToString(), k?.GetValue("InstallDate")?.ToString()));
            }
        }
        return list.GroupBy(x => $"{x.Name}|{x.Version}").Select(x => x.First()).OrderBy(x => x.Name).ToList();
    }

    private static (bool? Present, bool? Enabled, string? Version) Tpm()
    {
        try
        {
            var scope = new ManagementScope(@"\\.\root\CIMV2\Security\MicrosoftTpm");
            scope.Connect();
            using var search = new ManagementObjectSearcher(scope, new ObjectQuery("SELECT IsEnabled_InitialValue,SpecVersion FROM Win32_Tpm"));
            var item = search.Get().Cast<ManagementBaseObject>().FirstOrDefault();
            return item is null ? (false, false, null) : (true, Convert.ToBoolean(item["IsEnabled_InitialValue"] ?? false), item["SpecVersion"]?.ToString());
        }
        catch { return (null, null, null); }
    }
    private static bool? SecureBoot()
    {
        try { using var k = Registry.LocalMachine.OpenSubKey(@"SYSTEM\CurrentControlSet\Control\SecureBoot\State"); return k?.GetValue("UEFISecureBootEnabled") is null ? null : Convert.ToInt32(k.GetValue("UEFISecureBootEnabled")) == 1; }
        catch { return null; }
    }
    private static bool? BitLocker()
    {
        try { using var s = new ManagementObjectSearcher(@"root\CIMV2\Security\MicrosoftVolumeEncryption", "SELECT ProtectionStatus FROM Win32_EncryptableVolume WHERE DriveLetter='C:'"); return Convert.ToUInt32(s.Get().Cast<ManagementBaseObject>().FirstOrDefault()?["ProtectionStatus"] ?? 0) == 1; }
        catch { return null; }
    }
    private static bool? Firewall()
    {
        try { using var k = Registry.LocalMachine.OpenSubKey(@"SYSTEM\CurrentControlSet\Services\SharedAccess\Parameters\FirewallPolicy\StandardProfile"); return Convert.ToInt32(k?.GetValue("EnableFirewall") ?? 0) == 1; }
        catch { return null; }
    }
    private static string Defender()
    {
        try { using var k = Registry.LocalMachine.OpenSubKey(@"SOFTWARE\Microsoft\Windows Defender\Real-Time Protection"); return Convert.ToInt32(k?.GetValue("DisableRealtimeMonitoring") ?? 0) == 0 ? "Healthy" : "Disabled"; }
        catch { return "Unknown"; }
    }
}

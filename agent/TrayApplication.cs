using System.Diagnostics;
using System.Drawing;
using System.Management;
using System.Net.NetworkInformation;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Windows.Forms;
using Microsoft.Win32;

namespace AssetFlow.Agent;

public static class TrayApplication
{
    public static void EnsureStartupRegistration()
    {
        try
        {
            var executable = Environment.ProcessPath ?? Path.Combine(AppContext.BaseDirectory, "AssetFlow.Agent.exe");
            using var run = Registry.LocalMachine.CreateSubKey(@"Software\Microsoft\Windows\CurrentVersion\Run");
            run?.SetValue("AssetFlowAgentTray", $"\"{executable}\" --tray", RegistryValueKind.String);
        }
        catch { /* The installer also registers startup; service operation must continue if policy blocks it. */ }
    }

    public static void Run()
    {
        using var mutex = new Mutex(true, "Local\\AssetFlowAgentTray", out var firstInstance);
        if (!firstInstance) return;

        using var menu = new ContextMenuStrip();
        using var trayIcon = LoadTrayIcon();
        using var icon = new NotifyIcon
        {
            Icon = trayIcon,
            Text = $"AssetFlow Agent v{AgentClient.Version}",
            Visible = true,
            ContextMenuStrip = menu
        };
        menu.Items.Add($"AssetFlow Agent v{AgentClient.Version}").Enabled = false;
        menu.Items.Add("PC 정보", null, (_, _) => ShowPcInformation());
        menu.Items.Add("관리 페이지 열기", null, (_, _) => OpenDashboard());
        menu.Items.Add(new ToolStripSeparator());
        menu.Items.Add("트레이 종료", null, (_, _) => System.Windows.Forms.Application.Exit());
        icon.DoubleClick += (_, _) => ShowPcInformation();
        System.Windows.Forms.Application.Run();
        icon.Visible = false;
    }

    private static Icon LoadTrayIcon()
    {
        using var stream = Assembly.GetExecutingAssembly().GetManifestResourceStream("AssetFlow.Agent.TrayIcon.png")
            ?? throw new InvalidOperationException("Tray icon resource was not found.");
        using var source = new Bitmap(stream);
        using var resized = new Bitmap(source, new Size(32, 32));
        var handle = resized.GetHicon();
        try { return (Icon)Icon.FromHandle(handle).Clone(); }
        finally { DestroyIcon(handle); }
    }

    [DllImport("user32.dll")]
    private static extern bool DestroyIcon(IntPtr handle);

    private static void ShowPcInformation()
    {
        static string Wmi(string type, string field)
        {
            try
            {
                using var searcher = new ManagementObjectSearcher($"SELECT {field} FROM {type}");
                return searcher.Get().Cast<ManagementBaseObject>().FirstOrDefault()?[field]?.ToString()?.Trim() ?? "-";
            }
            catch { return "-"; }
        }

        var nic = NetworkInterface.GetAllNetworkInterfaces().FirstOrDefault(x =>
            x.OperationalStatus == OperationalStatus.Up && x.NetworkInterfaceType != NetworkInterfaceType.Loopback);
        var ip = nic?.GetIPProperties().UnicastAddresses.FirstOrDefault(x =>
            x.Address.AddressFamily == System.Net.Sockets.AddressFamily.InterNetwork)?.Address.ToString() ?? "-";
        var memory = Wmi("Win32_ComputerSystem", "TotalPhysicalMemory");
        var memoryText = long.TryParse(memory, out var bytes) ? $"{bytes / 1024d / 1024d / 1024d:F1} GB" : "-";
        var text = $"Agent 버전: {AgentClient.Version}\nPC 이름: {Environment.MachineName}\n사용자: {Environment.UserName}\n" +
                   $"제조사 / 모델: {Wmi("Win32_ComputerSystem", "Manufacturer")} / {Wmi("Win32_ComputerSystem", "Model")}\n" +
                   $"운영체제: {Wmi("Win32_OperatingSystem", "Caption")}\nCPU: {Wmi("Win32_Processor", "Name")}\n메모리: {memoryText}\nIP 주소: {ip}";
        MessageBox.Show(text, "AssetFlow PC 정보", MessageBoxButtons.OK, MessageBoxIcon.Information);
    }

    private static void OpenDashboard()
    {
        try
        {
            var state = new AgentState();
            Process.Start(new ProcessStartInfo(state.Options.ApiUrl.Trim().TrimEnd('/')) { UseShellExecute = true });
        }
        catch (Exception error)
        {
            MessageBox.Show($"관리 페이지를 열 수 없습니다.\n{error.Message}", "AssetFlow", MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
    }
}

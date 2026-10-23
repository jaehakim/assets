using System.Diagnostics;
using System.Drawing;
using System.Management;
using System.Net.NetworkInformation;
using System.Reflection;
using System.Windows.Forms;
using System.Text.Json;
using Microsoft.Win32;

namespace AssetFlow.Agent;

public static class TrayApplication
{
    public static void LogError(Exception error)
    {
        try
        {
            var directory = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "AssetFlow", "logs");
            Directory.CreateDirectory(directory);
            File.AppendAllText(Path.Combine(directory, $"tray-{DateTime.Now:yyyyMMdd}.log"), $"{DateTimeOffset.Now:O} {error}{Environment.NewLine}");
        }
        catch { /* Logging must not crash the interactive session. */ }
    }

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
        var statusItem = menu.Items.Add("서비스 상태 확인 중");
        statusItem.Enabled = false;
        var contactItem = menu.Items.Add("마지막 통신: 없음");
        contactItem.Enabled = false;
        var errorItem = menu.Items.Add("오류 없음");
        errorItem.Enabled = false;
        menu.Items.Add(new ToolStripSeparator());
        menu.Items.Add("PC 정보", null, (_, _) => ShowPcInformation());
        menu.Items.Add("관리 페이지 열기", null, (_, _) => OpenDashboard());
        menu.Items.Add(new ToolStripSeparator());
        menu.Items.Add("서비스·통신 로그 열기", null, (_, _) =>
        {
            var directory = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData), "AssetFlow", "logs");
            if (Directory.Exists(directory)) Process.Start(new ProcessStartInfo(directory) { UseShellExecute = true });
            else MessageBox.Show("서비스 로그가 아직 생성되지 않았습니다.", "AssetFlow");
        });
        menu.Items.Add("트레이 로그 열기", null, (_, _) =>
        {
            var directory = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "AssetFlow", "logs");
            Directory.CreateDirectory(directory);
            Process.Start(new ProcessStartInfo(directory) { UseShellExecute = true });
        });
        menu.Items.Add("정보 수집은 Windows 서비스에서 실행됩니다").Enabled = false;
        icon.DoubleClick += (_, _) => ShowPcInformation();
        var colors = new Dictionary<AgentHealthColor, Icon>();
        using var timer = new System.Windows.Forms.Timer { Interval = 5000 };
        AgentHealthColor? currentColor = null;
        void RefreshStatus()
        {
            AgentHealthSnapshot? snapshot = null;
            try
            {
                using var file = new FileStream(AgentHealthService.StatusPath, FileMode.Open, FileAccess.Read,
                    FileShare.ReadWrite | FileShare.Delete);
                if (file.Length <= 16384) snapshot = JsonSerializer.Deserialize<AgentHealthSnapshot>(file);
                if (snapshot?.Operations is null || snapshot.Operations.Values.Any(x => x is null)) snapshot = null;
            }
            catch (Exception e) when (e is IOException or UnauthorizedAccessException or JsonException)
            { /* Missing, locked or invalid status must never retain a green icon. */ }
            var display = AgentHealth.Evaluate(snapshot, DateTimeOffset.UtcNow);
            if (currentColor != display.Color)
            {
                if (!colors.TryGetValue(display.Color, out var colored))
                {
                    try { colored = TrayStatusIcon.Create(display.Color); }
                    catch (Exception e) { LogError(e); colored = (Icon)trayIcon.Clone(); }
                    colors.Add(display.Color, colored);
                }
                icon.Icon = colored;
                currentColor = display.Color;
            }
            icon.Text = $"AssetFlow {AgentClient.Version} · {display.Label}";
            statusItem.Text = display.Label;
            contactItem.Text = "마지막 통신: " + (snapshot?.LastContact?.ToLocalTime().ToString("MM-dd HH:mm:ss") ?? "없음");
            var failures = snapshot?.Operations.Where(x => x.Value.Error is not null)
                .Select(x => $"{x.Key}: {x.Value.Error}").ToArray();
            errorItem.Text = failures is { Length: > 0 } ? string.Join(" / ", failures) : "기록된 작업 오류 없음";
        }
        try
        {
            RefreshStatus();
            timer.Tick += (_, _) => RefreshStatus();
            timer.Start();
            System.Windows.Forms.Application.Run();
        }
        finally
        {
            timer.Stop();
            icon.Visible = false;
            icon.Icon = null;
            foreach (var colored in colors.Values) colored.Dispose();
        }
    }

    private static Icon LoadTrayIcon()
    {
        try
        {
            using var stream = Assembly.GetExecutingAssembly().GetManifestResourceStream("AssetFlow.Agent.TrayIcon.ico")
                ?? throw new InvalidOperationException("Tray icon resource was not found.");
            using var source = new Icon(stream, SystemInformation.SmallIconSize);
            return (Icon)source.Clone();
        }
        catch (Exception error)
        {
            LogError(error);
            return (Icon)SystemIcons.Application.Clone();
        }
    }


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
            // CR-S01 ③: the user-session tray reads only the public tray.json (never agent.json).
            var url = AgentState.ReadPublicApiUrl() ?? throw new InvalidOperationException("tray.json이 없습니다. 서비스가 실행 중인지 확인하십시오.");
            Process.Start(new ProcessStartInfo(url.Trim().TrimEnd('/')) { UseShellExecute = true });
        }
        catch (Exception error)
        {
            MessageBox.Show($"관리 페이지를 열 수 없습니다.\n{error.Message}", "AssetFlow", MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
    }
}

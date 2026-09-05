using System.ComponentModel;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Security.Principal;
using System.Text;

namespace AssetFlow.Agent;

/// <summary>
/// Windows services run in session 0 and cannot display notification icons.
/// This service starts one --tray process in every active interactive session
/// and restores it after an Agent update or an unexpected tray exit.
/// </summary>
public sealed class TraySessionService(ILogger<TraySessionService> log) : BackgroundService
{
    private const uint TokenAllAccess = 0x000F01FF;
    private const uint CreateUnicodeEnvironment = 0x00000400;

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        if (!OperatingSystem.IsWindows() || !WindowsIdentity.GetCurrent().IsSystem) return;

        while (!stoppingToken.IsCancellationRequested)
        {
            try { EnsureTrayProcesses(); }
            catch (Exception error) { log.LogError(error, "Unable to inspect interactive sessions for the tray app"); }

            await Task.Delay(TimeSpan.FromSeconds(30), stoppingToken);
        }
    }

    private void EnsureTrayProcesses()
    {
        var existingSessions = Process.GetProcessesByName("AssetFlow.Agent")
            .Select(process =>
            {
                try { return process.SessionId; }
                catch { return -1; }
                finally { process.Dispose(); }
            })
            .Where(sessionId => sessionId > 0)
            .ToHashSet();

        var sessions = IntPtr.Zero;
        var count = 0;
        if (!WTSEnumerateSessions(IntPtr.Zero, 0, 1, out sessions, out count))
            throw new Win32Exception(Marshal.GetLastWin32Error());

        try
        {
            var itemSize = Marshal.SizeOf<WtsSessionInfo>();
            for (var index = 0; index < count; index++)
            {
                var item = Marshal.PtrToStructure<WtsSessionInfo>(sessions + index * itemSize);
                if (item.State != WtsConnectState.Active || item.SessionId == 0 || existingSessions.Contains(item.SessionId)) continue;

                try
                {
                    StartTrayInSession(item.SessionId);
                    log.LogInformation("Tray app started in Windows session {SessionId}", item.SessionId);
                }
                catch (Exception error)
                {
                    log.LogWarning(error, "Tray app could not be started in Windows session {SessionId}", item.SessionId);
                }
            }
        }
        finally { WTSFreeMemory(sessions); }
    }

    private static void StartTrayInSession(int sessionId)
    {
        if (!WTSQueryUserToken((uint)sessionId, out var userToken))
            throw new Win32Exception(Marshal.GetLastWin32Error());

        IntPtr primaryToken = IntPtr.Zero;
        IntPtr environment = IntPtr.Zero;
        try
        {
            if (!DuplicateTokenEx(userToken, TokenAllAccess, IntPtr.Zero, 2, 1, out primaryToken))
                throw new Win32Exception(Marshal.GetLastWin32Error());
            if (!CreateEnvironmentBlock(out environment, primaryToken, false))
                throw new Win32Exception(Marshal.GetLastWin32Error());

            var executable = Environment.ProcessPath ?? Path.Combine(AppContext.BaseDirectory, "AssetFlow.Agent.exe");
            var startup = new StartupInfo { Size = Marshal.SizeOf<StartupInfo>(), Desktop = @"winsta0\default" };
            var commandLine = new StringBuilder($"\"{executable}\" --tray");
            if (!CreateProcessAsUser(primaryToken, executable, commandLine, IntPtr.Zero, IntPtr.Zero, false,
                    CreateUnicodeEnvironment, environment, AppContext.BaseDirectory, ref startup, out var process))
                throw new Win32Exception(Marshal.GetLastWin32Error());

            CloseHandle(process.Thread);
            CloseHandle(process.Process);
        }
        finally
        {
            if (environment != IntPtr.Zero) DestroyEnvironmentBlock(environment);
            if (primaryToken != IntPtr.Zero) CloseHandle(primaryToken);
            CloseHandle(userToken);
        }
    }

    private enum WtsConnectState { Active, Connected, ConnectQuery, Shadow, Disconnected, Idle, Listen, Reset, Down, Init }

    [StructLayout(LayoutKind.Sequential)]
    private struct WtsSessionInfo
    {
        public int SessionId;
        public IntPtr WinStationName;
        public WtsConnectState State;
    }

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    private struct StartupInfo
    {
        public int Size;
        public string? Reserved;
        public string Desktop;
        public string? Title;
        public int X, Y, XSize, YSize, XCountChars, YCountChars, FillAttribute, Flags;
        public short ShowWindow, Reserved2;
        public IntPtr ReservedPointer, StdInput, StdOutput, StdError;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct ProcessInformation { public IntPtr Process, Thread; public int ProcessId, ThreadId; }

    [DllImport("wtsapi32.dll", SetLastError = true)]
    private static extern bool WTSEnumerateSessions(IntPtr server, int reserved, int version, out IntPtr sessions, out int count);
    [DllImport("wtsapi32.dll")]
    private static extern void WTSFreeMemory(IntPtr memory);
    [DllImport("wtsapi32.dll", SetLastError = true)]
    private static extern bool WTSQueryUserToken(uint sessionId, out IntPtr token);
    [DllImport("advapi32.dll", SetLastError = true)]
    private static extern bool DuplicateTokenEx(IntPtr existingToken, uint access, IntPtr attributes, int impersonationLevel, int tokenType, out IntPtr newToken);
    [DllImport("userenv.dll", SetLastError = true)]
    private static extern bool CreateEnvironmentBlock(out IntPtr environment, IntPtr token, bool inherit);
    [DllImport("userenv.dll")]
    private static extern bool DestroyEnvironmentBlock(IntPtr environment);
    [DllImport("advapi32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern bool CreateProcessAsUser(IntPtr token, string applicationName, StringBuilder commandLine,
        IntPtr processAttributes, IntPtr threadAttributes, bool inheritHandles, uint creationFlags,
        IntPtr environment, string currentDirectory, ref StartupInfo startupInfo, out ProcessInformation processInformation);
    [DllImport("kernel32.dll")]
    private static extern bool CloseHandle(IntPtr handle);
}

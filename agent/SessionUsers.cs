using System.Runtime.InteropServices;

namespace AssetFlow.Agent;

/// <summary>CR-018: the service runs as LocalSystem, so Environment.UserName is always SYSTEM. Resolve the interactive user instead.</summary>
public static class SessionUsers
{
    /// <summary>Prefers WMI Win32_ComputerSystem.UserName (console user); falls back to the first active WTS session; null when nobody is logged on.</summary>
    public static string? Resolve(string? wmiUserName, Func<string?> activeSessionUser)
    {
        var user = Normalize(wmiUserName);
        if (user is not null) return user;
        try { return Normalize(activeSessionUser()); } catch { return null; }
    }

    public static string? Normalize(string? value)
    {
        if (string.IsNullOrWhiteSpace(value)) return null;
        var trimmed = value.Trim();
        var account = trimmed.Contains('\\') ? trimmed[(trimmed.LastIndexOf('\\') + 1)..] : trimmed;
        // Service / virtual accounts are not people.
        if (account.Equals("SYSTEM", StringComparison.OrdinalIgnoreCase) || account.EndsWith("$", StringComparison.Ordinal)
            || trimmed.StartsWith("NT AUTHORITY\\", StringComparison.OrdinalIgnoreCase) || trimmed.StartsWith("NT SERVICE\\", StringComparison.OrdinalIgnoreCase)
            || trimmed.StartsWith("Window Manager\\", StringComparison.OrdinalIgnoreCase) || trimmed.StartsWith("Font Driver Host\\", StringComparison.OrdinalIgnoreCase))
            return null;
        return trimmed;
    }

    public static string? ActiveSessionUser()
    {
        if (!OperatingSystem.IsWindows()) return null;
        if (!WTSEnumerateSessions(IntPtr.Zero, 0, 1, out var sessions, out var count)) return null;
        try
        {
            var size = Marshal.SizeOf<WtsSessionInfo>();
            for (var i = 0; i < count; i++)
            {
                var item = Marshal.PtrToStructure<WtsSessionInfo>(sessions + i * size);
                if (item.State != 0 /* WTSActive */ || item.SessionId == 0) continue;
                var user = Query(item.SessionId, 5 /* WTSUserName */);
                if (string.IsNullOrEmpty(user)) continue;
                var domain = Query(item.SessionId, 7 /* WTSDomainName */);
                return string.IsNullOrEmpty(domain) ? user : $"{domain}\\{user}";
            }
            return null;
        }
        finally { WTSFreeMemory(sessions); }
    }

    static string? Query(int sessionId, int infoClass)
    {
        if (!WTSQuerySessionInformation(IntPtr.Zero, sessionId, infoClass, out var buffer, out _)) return null;
        try { return Marshal.PtrToStringUni(buffer); } finally { WTSFreeMemory(buffer); }
    }

    [StructLayout(LayoutKind.Sequential)]
    struct WtsSessionInfo { public int SessionId; public IntPtr WinStationName; public int State; }

    [DllImport("wtsapi32.dll", SetLastError = true)]
    static extern bool WTSEnumerateSessions(IntPtr server, int reserved, int version, out IntPtr sessions, out int count);
    [DllImport("wtsapi32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    static extern bool WTSQuerySessionInformation(IntPtr server, int sessionId, int infoClass, out IntPtr buffer, out int bytes);
    [DllImport("wtsapi32.dll")]
    static extern void WTSFreeMemory(IntPtr memory);
}

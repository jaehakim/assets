using System.Runtime.Versioning;
using System.Security.AccessControl;
using System.Security.Cryptography;
using System.Security.Principal;
using System.Text;

namespace AssetFlow.Agent;

/// <summary>
/// CR-005 / CR-S01: protects %ProgramData%\AssetFlow against the local-privilege-escalation path
/// (a standard user pre-creating the folder and swapping agent.json) and keeps the device token encrypted.
/// </summary>
public static class ConfigProtection
{
    /// <summary>Messages produced before the logger exists; Worker writes them to the service log at start.</summary>
    public static List<string> Notes => StartupNotes.Items;

    // SIDs are created lazily: constructing SecurityIdentifier throws on non-Windows (unit tests).
    const string SystemSid = "S-1-5-18", AdministratorsSid = "S-1-5-32-544";
    static SecurityIdentifier System => new(WellKnownSidType.LocalSystemSid, null);
    static SecurityIdentifier Administrators => new(WellKnownSidType.BuiltinAdministratorsSid, null);
    static SecurityIdentifier Users => new(WellKnownSidType.BuiltinUsersSid, null);
    static readonly string[] UntrustedSids = { "S-1-5-32-545", "S-1-5-11", "S-1-1-0", "S-1-5-4", "S-1-3-0" }; // Users, Authenticated Users, Everyone, Interactive, Creator Owner
    const FileSystemRights WriteRights = FileSystemRights.WriteData | FileSystemRights.AppendData | FileSystemRights.Delete
        | FileSystemRights.DeleteSubdirectoriesAndFiles | FileSystemRights.WriteAttributes | FileSystemRights.WriteExtendedAttributes
        | FileSystemRights.ChangePermissions | FileSystemRights.TakeOwnership;
    static readonly byte[] Entropy = Encoding.UTF8.GetBytes("AssetFlow.Agent.DeviceToken.v1");

    public static bool IsTrustedOwner(SecurityIdentifier? owner) => IsTrustedOwnerSid(owner?.Value);
    public static bool IsTrustedOwnerSid(string? sid) => sid == SystemSid || sid == AdministratorsSid;
    public static bool IsUntrustedPrincipal(string? sid) => sid is not null && UntrustedSids.Contains(sid);
    /// <summary>True when an ACE lets a non-administrator principal change the folder/file (the V-01 condition).</summary>
    public static bool GrantsWrite(bool allow, string? sid, FileSystemRights rights) => allow && IsUntrustedPrincipal(sid) && (rights & WriteRights) != 0;

    static bool GrantsWrite(FileSystemAccessRule rule) =>
        GrantsWrite(rule.AccessControlType == AccessControlType.Allow, (rule.IdentityReference as SecurityIdentifier)?.Value, rule.FileSystemRights);

    /// <summary>Verifies the data folder. Throws when the owner is untrusted and we run as the service (SYSTEM); otherwise self-heals the DACL.</summary>
    public static void EnsureProtected(string dir, string tokenFile, string trayFile)
    {
        if (!OperatingSystem.IsWindows()) return;
        EnsureProtectedWindows(dir, tokenFile, trayFile);
    }

    [SupportedOSPlatform("windows")]
    static void EnsureProtectedWindows(string dir, string tokenFile, string trayFile)
    {
        var info = new DirectoryInfo(dir);
        var security = info.GetAccessControl();
        var owner = security.GetOwner(typeof(SecurityIdentifier)) as SecurityIdentifier;
        bool runningAsService = WindowsIdentity.GetCurrent().IsSystem;
        if (!IsTrustedOwner(owner))
        {
            var message = $"{dir} is owned by {Describe(owner)} instead of SYSTEM/Administrators. The folder may have been pre-created by a standard user (V-01). Run scripts\\fix-acl.ps1 as administrator or reinstall.";
            if (runningAsService) throw new InvalidOperationException(message);
            Notes.Add("WARNING (not enforced outside the service): " + message);
        }
        bool weak = !security.AreAccessRulesProtected
            || security.GetAccessRules(true, true, typeof(SecurityIdentifier)).Cast<FileSystemAccessRule>().Any(GrantsWrite);
        if (weak)
        {
            HardenDirectory(dir, tokenFile, trayFile);
            Notes.Add($"Weak ACL on {dir} replaced with SYSTEM/Administrators full control, Users read-only (CR-S01).");
        }
        else if (File.Exists(tokenFile))
        {
            var fileSecurity = new FileInfo(tokenFile).GetAccessControl();
            if (!fileSecurity.AreAccessRulesProtected || fileSecurity.GetAccessRules(true, true, typeof(SecurityIdentifier)).Cast<FileSystemAccessRule>().Any(r =>
                    r.AccessControlType == AccessControlType.Allow && IsUntrustedPrincipal((r.IdentityReference as SecurityIdentifier)?.Value)))
            {
                HardenTokenFile(tokenFile);
                Notes.Add("agent.json ACL tightened: standard users can no longer read the token file (CR-005).");
            }
        }
    }

    [SupportedOSPlatform("windows")]
    static void HardenDirectory(string dir, string tokenFile, string trayFile)
    {
        var security = new DirectorySecurity();
        security.SetAccessRuleProtection(true, false);
        security.AddAccessRule(new FileSystemAccessRule(System, FileSystemRights.FullControl, InheritanceFlags.ContainerInherit | InheritanceFlags.ObjectInherit, PropagationFlags.None, AccessControlType.Allow));
        security.AddAccessRule(new FileSystemAccessRule(Administrators, FileSystemRights.FullControl, InheritanceFlags.ContainerInherit | InheritanceFlags.ObjectInherit, PropagationFlags.None, AccessControlType.Allow));
        // Users may list the folder and read sub-folders (logs); files do NOT inherit this ACE, so agent.json stays private.
        security.AddAccessRule(new FileSystemAccessRule(Users, FileSystemRights.ReadAndExecute, InheritanceFlags.ContainerInherit, PropagationFlags.None, AccessControlType.Allow));
        new DirectoryInfo(dir).SetAccessControl(security);
        if (File.Exists(tokenFile)) HardenTokenFile(tokenFile);
        if (File.Exists(trayFile)) PublishReadable(trayFile);
        var logs = Path.Combine(dir, "logs");
        if (Directory.Exists(logs))
        {
            var logSecurity = new DirectoryInfo(logs).GetAccessControl();
            logSecurity.AddAccessRule(new FileSystemAccessRule(Users, FileSystemRights.ReadAndExecute, InheritanceFlags.ContainerInherit | InheritanceFlags.ObjectInherit, PropagationFlags.None, AccessControlType.Allow));
            new DirectoryInfo(logs).SetAccessControl(logSecurity);
        }
    }

    /// <summary>agent.json: SYSTEM and Administrators only.</summary>
    public static void HardenTokenFile(string tokenFile)
    {
        if (!OperatingSystem.IsWindows()) return;
        try
        {
            var security = new FileSecurity();
            security.SetAccessRuleProtection(true, false);
            security.AddAccessRule(new FileSystemAccessRule(System, FileSystemRights.FullControl, AccessControlType.Allow));
            security.AddAccessRule(new FileSystemAccessRule(Administrators, FileSystemRights.FullControl, AccessControlType.Allow));
            new FileInfo(tokenFile).SetAccessControl(security);
        }
        catch (Exception e) when (e is UnauthorizedAccessException or IOException) { Notes.Add($"agent.json ACL could not be set: {e.GetType().Name}"); }
    }

    /// <summary>tray.json: additionally readable by Users.</summary>
    public static void PublishReadable(string file)
    {
        if (!OperatingSystem.IsWindows()) return;
        try
        {
            var security = new FileSecurity();
            security.SetAccessRuleProtection(true, false);
            security.AddAccessRule(new FileSystemAccessRule(System, FileSystemRights.FullControl, AccessControlType.Allow));
            security.AddAccessRule(new FileSystemAccessRule(Administrators, FileSystemRights.FullControl, AccessControlType.Allow));
            security.AddAccessRule(new FileSystemAccessRule(Users, FileSystemRights.Read, AccessControlType.Allow));
            new FileInfo(file).SetAccessControl(security);
        }
        catch (Exception e) when (e is UnauthorizedAccessException or IOException) { Notes.Add($"tray.json ACL could not be set: {e.GetType().Name}"); }
    }

    public static string Protect(string value)
    {
        if (!OperatingSystem.IsWindows()) return value;
        return Convert.ToBase64String(ProtectedData.Protect(Encoding.UTF8.GetBytes(value), Entropy, DataProtectionScope.LocalMachine));
    }

    public static string? Unprotect(string value)
    {
        try
        {
            if (!OperatingSystem.IsWindows()) return value;
            return Encoding.UTF8.GetString(ProtectedData.Unprotect(Convert.FromBase64String(value), Entropy, DataProtectionScope.LocalMachine));
        }
        catch (Exception e) when (e is CryptographicException or FormatException) { return null; }
    }

    static string Describe(SecurityIdentifier? sid)
    {
        if (sid is null) return "unknown";
        try { return sid.Translate(typeof(NTAccount)).Value + " (" + sid.Value + ")"; } catch { return sid.Value; }
    }
}

/// <summary>Kept separate so touching it never initializes Windows-only members.</summary>
public static class StartupNotes
{
    public static readonly List<string> Items = new();
}

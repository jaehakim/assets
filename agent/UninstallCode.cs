using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;

namespace AssetFlow.Agent;

/// <summary>
/// 0.3.0 offline uninstall code: "{expiry epoch-hour UTC}-{10 digits}".
/// digits = HMAC-SHA256(key = lowercase hex SHA-256 of the device token (= server token_hash),
///                      msg = "assetflow-uninstall|{agentId}|{expiryHour}"), first 8 bytes as unsigned big-endian mod 10^10.
/// Same algorithm as the server's UninstallCodes (shared test vector). Only this PC (holding the device token) can verify it.
/// </summary>
public static class UninstallCode
{
    public enum Result { Valid, Malformed, Expired, Mismatch, NotRegistered }
    public const int MaxHours = 72;
    static readonly Regex Format = new(@"^(\d{5,8})-(\d{10})$", RegexOptions.Compiled);

    public static string TokenHash(string deviceToken) => Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(deviceToken))).ToLowerInvariant();

    public static string Compute(string tokenHash, string agentId, long expiryHour)
    {
        using var mac = new HMACSHA256(Encoding.UTF8.GetBytes(tokenHash.ToLowerInvariant()));
        var h = mac.ComputeHash(Encoding.UTF8.GetBytes($"assetflow-uninstall|{agentId.ToLowerInvariant()}|{expiryHour}"));
        ulong v = 0;
        for (var i = 0; i < 8; i++) v = (v << 8) | h[i];
        return $"{expiryHour}-{v % 10_000_000_000UL:D10}";
    }

    /// <summary>Spaces and dashes typed by the user are tolerated ("493560 - 588 139 3028").</summary>
    public static string Normalize(string? code) => Regex.Replace(code ?? "", @"\s+", "");

    public static Result Verify(string? code, string? deviceToken, string? agentId, DateTimeOffset now)
    {
        if (string.IsNullOrWhiteSpace(deviceToken) || string.IsNullOrWhiteSpace(agentId)) return Result.NotRegistered;
        var m = Format.Match(Normalize(code));
        if (!m.Success || !long.TryParse(m.Groups[1].Value, out var expiryHour)) return Result.Malformed;
        var nowHour = now.ToUnixTimeSeconds() / 3600.0;
        if (expiryHour <= nowHour) return Result.Expired;
        if (expiryHour > nowHour + MaxHours + 1) return Result.Malformed; // the server never issues longer codes
        var expected = Compute(TokenHash(deviceToken), agentId, expiryHour);
        return CryptographicOperations.FixedTimeEquals(Encoding.ASCII.GetBytes(expected), Encoding.ASCII.GetBytes(m.Value))
            ? Result.Valid : Result.Mismatch;
    }

    public static string Describe(Result r) => r switch
    {
        Result.Valid => "유효한 제거 코드",
        Result.Expired => "제거 코드 유효기간이 지났습니다. 관리자에게 새 코드를 요청하세요.",
        Result.Mismatch => "이 PC용 제거 코드가 아닙니다.",
        Result.NotRegistered => "이 PC는 아직 서버에 등록되지 않았습니다.",
        _ => "제거 코드 형식이 올바르지 않습니다(예: 493560-5881393028).",
    };
}

/// <summary>Request dropped by the elevated uninstall tool into %ProgramData%\AssetFlow (SYSTEM/Administrators only).</summary>
public sealed record UninstallRequestFile(string? Code, string? Reason, string? RequestedBy)
{
    public static UninstallRequestFile Parse(string json)
    {
        try { return System.Text.Json.JsonSerializer.Deserialize<UninstallRequestFile>(json, new System.Text.Json.JsonSerializerOptions(System.Text.Json.JsonSerializerDefaults.Web)) ?? new(null, null, null); }
        catch (System.Text.Json.JsonException) { return new(null, null, null); }
    }
}

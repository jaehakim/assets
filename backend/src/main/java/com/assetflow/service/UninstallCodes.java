package com.assetflow.service;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.UUID;

/**
 * Agent 0.3.0 오프라인 제거 코드: "{만료 UTC 시각(epoch hour)}-{10자리}".
 * 10자리 = HMAC-SHA256(key = 장치 토큰의 SHA-256 16진수(서버 token_hash와 동일), msg = "assetflow-uninstall|{agentId}|{expiryHour}")
 * 앞 8바이트를 부호 없는 정수로 본 값 mod 10^10. 장치 토큰을 가진 그 PC의 Agent만 검증할 수 있고 다른 PC에서는 무효.
 * Agent의 UninstallCode.cs와 같은 알고리즘(시험 벡터 공유).
 */
public final class UninstallCodes {
  private UninstallCodes() {}
  public static final int MAX_HOURS = 72;

  public static String code(String tokenHash, UUID agentId, long expiryHour) {
    try {
      Mac mac = Mac.getInstance("HmacSHA256");
      mac.init(new SecretKeySpec(tokenHash.toLowerCase().getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
      byte[] h = mac.doFinal(("assetflow-uninstall|" + agentId.toString().toLowerCase() + "|" + expiryHour).getBytes(StandardCharsets.UTF_8));
      long v = 0; for (int i = 0; i < 8; i++) v = (v << 8) | (h[i] & 0xff);
      return expiryHour + "-" + String.format("%010d", Long.remainderUnsigned(v, 10_000_000_000L));
    } catch (Exception e) { throw new IllegalStateException(e); }
  }

  /** 지금부터 hours 시간 뒤(시 단위 올림)가 만료인 코드. */
  public static String issue(String tokenHash, UUID agentId, int hours, Instant now) {
    long expiryHour = now.getEpochSecond() / 3600 + Math.max(1, Math.min(hours, MAX_HOURS));
    return code(tokenHash, agentId, expiryHour);
  }

  public static Instant expiresAt(String code) { return Instant.ofEpochSecond(Long.parseLong(code.substring(0, code.indexOf('-'))) * 3600); }
}

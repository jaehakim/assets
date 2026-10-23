package com.assetflow.service;

import java.net.InetAddress;
import java.net.URI;
import java.net.UnknownHostException;
import java.util.Locale;
import java.util.Set;

/** CR-S09: outbound fetch policy for the software-policy source URL (SSRF guard). */
public final class UrlPolicy {
  private UrlPolicy() {}

  /** Validates scheme, host allow-list and resolved addresses. Returns the normalized URI or throws IllegalArgumentException. */
  public static URI validate(String url, Set<String> allowedHosts) {
    URI u;
    try { u = URI.create(url.trim()); } catch (Exception e) { throw new IllegalArgumentException("자료 URL 형식이 올바르지 않습니다."); }
    if (!"https".equalsIgnoreCase(u.getScheme())) throw new IllegalArgumentException("HTTPS 자료 URL만 허용됩니다.");
    if (u.getHost() == null || u.getUserInfo() != null) throw new IllegalArgumentException("호스트가 없거나 사용자 정보가 포함된 URL은 허용되지 않습니다.");
    String host = u.getHost().toLowerCase(Locale.ROOT);
    if (host.endsWith(".svc") || host.contains(".svc.") || host.endsWith(".cluster.local") || host.equals("localhost") || host.endsWith(".localhost") || host.endsWith(".internal"))
      throw new IllegalArgumentException("클러스터 내부 호스트는 허용되지 않습니다: " + host);
    if (allowedHosts != null && !allowedHosts.isEmpty() && allowedHosts.stream().noneMatch(a -> host.equals(a) || host.endsWith("." + a)))
      throw new IllegalArgumentException("허용 목록에 없는 호스트입니다: " + host);
    for (InetAddress address : resolve(host))
      if (isPrivate(address)) throw new IllegalArgumentException("사설·루프백·링크로컬 주소로 해석되는 호스트는 허용되지 않습니다: " + host);
    return u;
  }

  static InetAddress[] resolve(String host) {
    try { return InetAddress.getAllByName(host); }
    catch (UnknownHostException e) { throw new IllegalArgumentException("호스트를 해석할 수 없습니다: " + host); }
  }

  public static boolean isPrivate(InetAddress a) {
    if (a.isAnyLocalAddress() || a.isLoopbackAddress() || a.isLinkLocalAddress() || a.isSiteLocalAddress() || a.isMulticastAddress()) return true;
    byte[] b = a.getAddress();
    if (b.length == 4) {
      int first = b[0] & 0xFF, second = b[1] & 0xFF;
      if (first == 100 && second >= 64 && second <= 127) return true;   // 100.64/10 CGNAT
      if (first == 169 && second == 254) return true;                   // metadata / link-local
      if (first == 0) return true;
    } else if (b.length == 16) {
      if ((b[0] & 0xFE) == 0xFC) return true;                     // fc00::/7 ULA
      if (b[0] == 0 && b[1] == 0 && b[2] == 0 && b[3] == 0 && b[4] == 0 && b[5] == 0 && b[6] == 0 && b[7] == 0
          && b[8] == 0 && b[9] == 0 && (b[10] & 0xFF) == 0xFF && (b[11] & 0xFF) == 0xFF) {            // IPv4-mapped
        try { return isPrivate(InetAddress.getByAddress(new byte[] {b[12], b[13], b[14], b[15]})); } catch (UnknownHostException e) { return true; }
      }
    }
    return false;
  }
}

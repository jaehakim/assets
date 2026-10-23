package com.assetflow.service;

import org.junit.jupiter.api.Test;
import java.net.InetAddress;
import java.util.Set;
import static org.junit.jupiter.api.Assertions.*;

class UrlPolicyTest {
  @Test void rejectsHttpAndInternalHosts() {
    assertThrows(IllegalArgumentException.class, () -> UrlPolicy.validate("http://example.com/list.csv", Set.of()));
    assertThrows(IllegalArgumentException.class, () -> UrlPolicy.validate("https://10.0.0.1/", Set.of()));
    assertThrows(IllegalArgumentException.class, () -> UrlPolicy.validate("https://127.0.0.1/", Set.of()));
    assertThrows(IllegalArgumentException.class, () -> UrlPolicy.validate("https://169.254.169.254/latest/meta-data", Set.of()));
    assertThrows(IllegalArgumentException.class, () -> UrlPolicy.validate("https://kubernetes.default.svc/", Set.of()));
    assertThrows(IllegalArgumentException.class, () -> UrlPolicy.validate("https://postgres.assetflow.svc.cluster.local:5432/", Set.of()));
    assertThrows(IllegalArgumentException.class, () -> UrlPolicy.validate("https://user:pw@example.com/", Set.of()));
    assertThrows(IllegalArgumentException.class, () -> UrlPolicy.validate("https://[::1]/", Set.of()));
  }
  @Test void allowListRestrictsHosts() {
    assertThrows(IllegalArgumentException.class, () -> UrlPolicy.validate("https://1.1.1.1/list.csv", Set.of("data.go.kr")));
  }
  @Test void privateRangeDetection() throws Exception {
    assertTrue(UrlPolicy.isPrivate(InetAddress.getByName("192.168.1.10")));
    assertTrue(UrlPolicy.isPrivate(InetAddress.getByName("172.16.0.1")));
    assertTrue(UrlPolicy.isPrivate(InetAddress.getByName("100.64.0.1")));
    assertTrue(UrlPolicy.isPrivate(InetAddress.getByName("fd00::1")));
    assertTrue(UrlPolicy.isPrivate(InetAddress.getByName("::ffff:10.1.2.3")));
    assertFalse(UrlPolicy.isPrivate(InetAddress.getByName("1.1.1.1")));
    assertFalse(UrlPolicy.isPrivate(InetAddress.getByName("2606:4700:4700::1111")));
  }
}

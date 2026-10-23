package com.assetflow.api;

import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

class AuthControllerTest {
  // CR-A05
  @Test void controlCharactersAreNeutralisedInSecurityLog() {
    assertEquals("admin?LOGIN_SUCCESS user=x", AuthController.safeLog("admin\nLOGIN_SUCCESS user=x"));
    assertEquals("a?b?c", AuthController.safeLog("a\rb\tc"));
    assertEquals("-", AuthController.safeLog(null));
    assertEquals(65, AuthController.safeLog("x".repeat(100)).length());
  }
}

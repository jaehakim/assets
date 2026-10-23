package com.assetflow.service;

import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

class SecretsValidatorTest {
  private static final String STRONG = "x".repeat(40);
  @Test void placeholdersAndShortValuesAreRejected() {
    var v = new SecretsValidator(true, "change-me", "short", STRONG, "assetflow", "ops-admin");
    var problems = v.validate();
    assertEquals(3, problems.size(), problems.toString());
    assertThrows(IllegalStateException.class, v::afterPropertiesSet);
  }
  @Test void strongDistinctValuesPass() {
    var v = new SecretsValidator(true, STRONG + "a", STRONG + "b", STRONG + "c", STRONG + "d", "ops-admin");
    assertTrue(v.validate().isEmpty());
    assertDoesNotThrow(v::afterPropertiesSet);
  }
  @Test void identicalTokensAreRejectedEvenIfStrong() {
    var v = new SecretsValidator(true, STRONG, STRONG, STRONG + "c", STRONG + "d", "ops-admin");
    assertFalse(v.validate().isEmpty());
  }
  // CR-A06
  @Test void defaultAdminUsernameIsOnlyWarned() {
    assertTrue(SecretsValidator.isDefaultUsername("admin"));
    assertTrue(SecretsValidator.isDefaultUsername(" Administrator "));
    assertFalse(SecretsValidator.isDefaultUsername("ops-kim"));
    assertDoesNotThrow(new SecretsValidator(true, STRONG + "a", STRONG + "b", STRONG + "c", STRONG + "d", "admin")::afterPropertiesSet);
  }
  @Test void developmentModeOnlyWarns() {
    assertDoesNotThrow(new SecretsValidator(false, "change-me", "change-me-too", "change-me-now", "assetflow", "admin")::afterPropertiesSet);
  }
}

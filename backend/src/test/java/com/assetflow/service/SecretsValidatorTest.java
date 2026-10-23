package com.assetflow.service;

import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

class SecretsValidatorTest {
  private static final String STRONG = "x".repeat(40);
  @Test void placeholdersAndShortValuesAreRejected() {
    var v = new SecretsValidator(true, "change-me", "short", STRONG, "assetflow");
    var problems = v.validate();
    assertEquals(3, problems.size(), problems.toString());
    assertThrows(IllegalStateException.class, v::afterPropertiesSet);
  }
  @Test void strongDistinctValuesPass() {
    var v = new SecretsValidator(true, STRONG + "a", STRONG + "b", STRONG + "c", STRONG + "d");
    assertTrue(v.validate().isEmpty());
    assertDoesNotThrow(v::afterPropertiesSet);
  }
  @Test void identicalTokensAreRejectedEvenIfStrong() {
    var v = new SecretsValidator(true, STRONG, STRONG, STRONG + "c", STRONG + "d");
    assertFalse(v.validate().isEmpty());
  }
  @Test void developmentModeOnlyWarns() {
    assertDoesNotThrow(new SecretsValidator(false, "change-me", "change-me-too", "change-me-now", "assetflow")::afterPropertiesSet);
  }
}

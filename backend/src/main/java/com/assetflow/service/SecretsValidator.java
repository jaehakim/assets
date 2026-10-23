package com.assetflow.service;

import org.springframework.beans.factory.InitializingBean;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;

/** CR-007: 기본값·약한 비밀값으로는 기동하지 않는다. */
@Component
public class SecretsValidator implements InitializingBean {
  static final int MIN_LENGTH = 32;
  static final Set<String> PLACEHOLDERS = Set.of("change-me", "change-me-too", "change-me-now", "assetflow", "assetflow-local-only", "admin", "password");
  private final boolean required;
  private final String registration, update, adminPassword, dbPassword;

  public SecretsValidator(@Value("${assetflow.require-strong-secrets:true}") boolean required,
      @Value("${assetflow.registration-token}") String registration, @Value("${assetflow.update-token}") String update,
      @Value("${assetflow.admin-password}") String adminPassword, @Value("${spring.datasource.password}") String dbPassword) {
    this.required = required; this.registration = registration; this.update = update; this.adminPassword = adminPassword; this.dbPassword = dbPassword;
  }

  @Override
  public void afterPropertiesSet() {
    List<String> problems = validate();
    if (!problems.isEmpty() && required)
      throw new IllegalStateException("Refusing to start with weak secrets (CR-007): " + String.join(", ", problems)
          + ". Set values of at least " + MIN_LENGTH + " characters, or REQUIRE_STRONG_SECRETS=false for local development only.");
  }

  List<String> validate() {
    List<String> problems = new ArrayList<>();
    check(problems, "AGENT_REGISTRATION_TOKEN", registration);
    check(problems, "AGENT_UPDATE_TOKEN", update);
    check(problems, "ADMIN_PASSWORD", adminPassword);
    check(problems, "DB_PASSWORD", dbPassword);
    if (registration != null && registration.equals(update)) problems.add("AGENT_REGISTRATION_TOKEN equals AGENT_UPDATE_TOKEN");
    return problems;
  }

  private static void check(List<String> problems, String name, String value) {
    if (value == null || value.isBlank()) problems.add(name + " is empty");
    else if (PLACEHOLDERS.contains(value.trim().toLowerCase())) problems.add(name + " is a placeholder");
    else if (value.trim().length() < MIN_LENGTH) problems.add(name + " is shorter than " + MIN_LENGTH);
  }
}

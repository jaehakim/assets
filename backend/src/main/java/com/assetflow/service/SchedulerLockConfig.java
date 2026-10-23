package com.assetflow.service;

import net.javacrumbs.shedlock.core.LockProvider;
import net.javacrumbs.shedlock.provider.jdbctemplate.JdbcTemplateLockProvider;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.jdbc.core.JdbcTemplate;

/** CR-027: shedlock 테이블(schema.sql)로 2 Replica 중 하나만 스케줄을 실행한다. */
@Configuration
public class SchedulerLockConfig {
  @Bean
  LockProvider lockProvider(JdbcTemplate db) {
    return new JdbcTemplateLockProvider(JdbcTemplateLockProvider.Configuration.builder().withJdbcTemplate(db).usingDbTime().build());
  }
}

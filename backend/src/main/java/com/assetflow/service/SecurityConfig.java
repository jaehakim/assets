package com.assetflow.service;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpStatus;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.core.userdetails.User;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.crypto.factory.PasswordEncoderFactories;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.provisioning.InMemoryUserDetailsManager;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.HttpStatusEntryPoint;

@Configuration
public class SecurityConfig {
  @Bean
  PasswordEncoder passwordEncoder() { return PasswordEncoderFactories.createDelegatingPasswordEncoder(); }

  @Bean
  UserDetailsService users(@Value("${assetflow.admin-username}") String username,
      @Value("${assetflow.admin-password}") String password, PasswordEncoder encoder) {
    return new InMemoryUserDetailsManager(User.withUsername(username).password(encoder.encode(password)).roles("ADMIN").build());
  }

  @Bean
  SecurityFilterChain security(HttpSecurity http) throws Exception {
    // CR-010(CSRF)은 프런트 X-XSRF-TOKEN 전송과 함께 P1에서 적용한다.
    return http.csrf(c -> c.disable())
        .authorizeHttpRequests(a -> a
            .requestMatchers("/api/v1/auth/login", "/api/v1/health", "/api/v1/agents/**").permitAll()
            .requestMatchers("/actuator/health/**").permitAll()
            // CR-002: 릴리스 업로드는 관리자 세션 + X-Update-Token 동시 요구 (permitAll 제거)
            .anyRequest().authenticated())
        .exceptionHandling(e -> e.authenticationEntryPoint(new HttpStatusEntryPoint(HttpStatus.UNAUTHORIZED)))
        .build();
  }
}

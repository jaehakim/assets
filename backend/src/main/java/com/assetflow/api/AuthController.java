package com.assetflow.api;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import org.springframework.http.ResponseEntity;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.config.annotation.authentication.configuration.AuthenticationConfiguration;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.context.HttpSessionSecurityContextRepository;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import java.util.Map;

@RestController
@RequestMapping("/api/v1/auth")
public class AuthController {
  private static final Logger security = LoggerFactory.getLogger("assetflow.security");
  private final AuthenticationManager manager;

  public AuthController(AuthenticationConfiguration c) throws Exception { manager = c.getAuthenticationManager(); }

  // CR-S08: 입력 길이 제한
  public record Login(@NotBlank @Size(max = 64) String username, @NotBlank @Size(max = 128) String password) {}

  @PostMapping("/login")
  public ResponseEntity<?> login(@Valid @RequestBody Login x, HttpServletRequest req, HttpServletResponse res) {
    try {
      Authentication a = manager.authenticate(new UsernamePasswordAuthenticationToken(x.username(), x.password()));
      // CR-008: 인증 성공 직후 세션 ID 재발급 (세션 고정 방지)
      if (req.getSession(false) != null) req.changeSessionId();
      SecurityContext c = SecurityContextHolder.createEmptyContext();
      c.setAuthentication(a);
      SecurityContextHolder.setContext(c);
      new HttpSessionSecurityContextRepository().saveContext(c, req, res);
      security.info("LOGIN_SUCCESS user={} ip={}", a.getName(), req.getRemoteAddr());
      return ResponseEntity.ok(Map.of("username", a.getName()));
    } catch (AuthenticationException e) {
      // CR-S17: 로그인 실패 보안 이벤트 (비밀번호 미기록)
      security.warn("LOGIN_FAILED user={} ip={}", x.username(), req.getRemoteAddr());
      return ResponseEntity.status(401).body(Map.of("error", "아이디 또는 비밀번호가 올바르지 않습니다."));
    }
  }

  @GetMapping("/me")
  public ResponseEntity<?> me(Authentication a) {
    return a == null ? ResponseEntity.status(401).build() : ResponseEntity.ok(Map.of("username", a.getName()));
  }

  @PostMapping("/logout")
  public Map<String, String> logout(HttpServletRequest req, Authentication a) {
    var s = req.getSession(false);
    if (s != null) s.invalidate();
    SecurityContextHolder.clearContext();
    security.info("LOGOUT user={} ip={}", a == null ? "-" : a.getName(), req.getRemoteAddr());
    return Map.of("status", "ok");
  }
}

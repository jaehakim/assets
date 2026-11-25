package com.assetflow.api;

import com.assetflow.service.AgentAuth;
import com.assetflow.service.UninstallCodes;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.security.authentication.TestingAuthenticationToken;
import java.time.Instant;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/** Agent 0.3.0 승인된 제거·오프라인 제거 코드. */
class AgentUninstallTest {
  static final UUID AGENT = UUID.fromString("3f2b8c1e-4d5a-4b6c-9e7f-0a1b2c3d4e5f");
  static final TestingAuthenticationToken ADMIN = new TestingAuthenticationToken("admin", "x");

  // 시험 벡터는 Agent(UninstallCode.cs) 시험과 동일 — 서버 발급 코드를 Agent가 그대로 검증해야 한다.
  @Test void uninstallCodeMatchesSharedVector() {
    String tokenHash = AgentAuth.hash("test-device-token-0123456789");
    assertEquals("3a687cf072887bd7202df693adc926eb0ab393e3b58e2e64d60f55a6ec8e64b7", tokenHash);
    assertEquals("493560-5881393028", UninstallCodes.code(tokenHash, AGENT, 493560));
    assertNotEquals(UninstallCodes.code(tokenHash, AGENT, 493560), UninstallCodes.code(tokenHash, UUID.randomUUID(), 493560), "other device");
    assertNotEquals(UninstallCodes.code(tokenHash, AGENT, 493560), UninstallCodes.code(AgentAuth.hash("other"), AGENT, 493560), "other token");
  }

  @Test void issuedCodeExpiryIsClampedTo72Hours() {
    Instant now = Instant.parse("2026-11-25T10:20:00Z");
    String code = UninstallCodes.issue(AgentAuth.hash("t"), AGENT, 500, now);
    assertEquals(Instant.parse("2026-11-28T10:00:00Z"), UninstallCodes.expiresAt(code));
    assertEquals(Instant.parse("2026-11-25T11:00:00Z"), UninstallCodes.expiresAt(UninstallCodes.issue(AgentAuth.hash("t"), AGENT, 0, now)));
  }

  static AgentController agentController(JdbcTemplate db) {
    AgentAuth auth = mock(AgentAuth.class); when(auth.authenticate("Bearer t")).thenReturn(AGENT); return new AgentController(db, auth, 2000, true);
  }

  @Test void heartbeatTellsAgentAboutApprovedUninstall() {
    JdbcTemplate db = mock(JdbcTemplate.class);
    when(db.queryForList(contains("status='APPROVED'"), eq(AGENT))).thenReturn(List.of(Map.of("id", 7L)));
    var body = (Map<?, ?>) agentController(db).heartbeat("Bearer t", new Models.Heartbeat("0.3.0")).getBody();
    assertEquals(Map.of("approved", true, "requestId", 7L), body.get("uninstall"));
    JdbcTemplate none = mock(JdbcTemplate.class);
    assertFalse(((Map<?, ?>) agentController(none).heartbeat("Bearer t", new Models.Heartbeat("0.3.0")).getBody()).containsKey("uninstall"));
  }

  @Test void heartbeatCarriesProtectionPolicy() {
    JdbcTemplate db = mock(JdbcTemplate.class);
    AgentAuth auth = mock(AgentAuth.class); when(auth.authenticate("Bearer t")).thenReturn(AGENT);
    assertEquals(true, ((Map<?, ?>) agentController(db).heartbeat("Bearer t", new Models.Heartbeat("0.3.1")).getBody()).get("protection"));
    var off = new AgentController(db, auth, 2000, false);
    assertEquals(false, ((Map<?, ?>) off.heartbeat("Bearer t", new Models.Heartbeat("0.3.1")).getBody()).get("protection"));
  }

  @Test void deviceRequestIsNotDuplicated() {
    JdbcTemplate db = mock(JdbcTemplate.class);
    when(db.queryForList(contains("status IN ('REQUESTED','APPROVED')"), eq(AGENT))).thenReturn(List.of(Map.of("id", 3L, "status", "REQUESTED")));
    var res = agentController(db).uninstallRequest("Bearer t", new Models.UninstallRequest("퇴사", "CORP\\kim"));
    assertEquals(200, res.getStatusCode().value());
    verify(db, never()).queryForObject(contains("INSERT INTO agent_uninstall_request"), eq(Long.class), any(Object[].class));
  }

  @Test void completionRevokesDeviceToken() {
    JdbcTemplate db = mock(JdbcTemplate.class);
    when(db.update(contains("SET status='COMPLETED'"), eq(9L), eq(AGENT))).thenReturn(1);
    agentController(db).uninstallComplete("Bearer t", new Models.UninstallComplete(9L, "APPROVED"));
    verify(db).update(startsWith("UPDATE agent SET uninstalled_at=now(),token_hash=?"), argThat((Object v) -> v.toString().startsWith("uninstalled:")), eq(AGENT));
    verify(db).update(contains("'AGENT_UNINSTALLED'"), eq("Agent 제거 완료(관리자 승인)"), eq(AGENT));
  }

  @Test void codeIsRefusedWhenTokenIsNotActive() {
    JdbcTemplate db = mock(JdbcTemplate.class);
    when(db.queryForList(contains("SELECT token_hash,hostname"), eq(AGENT))).thenReturn(List.of(Map.of("token_hash", "uninstalled:x", "hostname", "PC")));
    assertEquals(409, new AgentUninstallController(db).code(AGENT, null, ADMIN).getStatusCode().value());
    verify(db, never()).update(contains("UNINSTALL_CODE_ISSUED"), any(Object[].class));
  }

  @Test void approveCreatesAdminApprovalWhenNoRequestAndRejectsDoubleApproval() {
    JdbcTemplate db = mock(JdbcTemplate.class);
    when(db.queryForList("SELECT 1 FROM agent WHERE id=?", AGENT)).thenReturn(List.of(Map.of("?column?", 1)));
    when(db.update(contains("SET status='APPROVED'"), any(Object[].class))).thenReturn(0);
    assertEquals(200, new AgentUninstallController(db).approve(AGENT, new AgentUninstallController.Decision("반납"), ADMIN).getStatusCode().value());
    verify(db).update(contains("VALUES(?,'APPROVED','ADMIN'"), any(Object[].class));
    when(db.queryForList(contains("status='APPROVED' AND expires_at>now()"), eq(AGENT))).thenReturn(List.of(Map.of("?column?", 1)));
    assertEquals(409, new AgentUninstallController(db).approve(AGENT, null, ADMIN).getStatusCode().value());
  }
}

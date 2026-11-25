package com.assetflow.api;

import com.assetflow.service.AgentAuth;
import jakarta.servlet.http.HttpServletRequest;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.security.authentication.TestingAuthenticationToken;
import java.math.BigDecimal;
import java.sql.Date;
import java.time.LocalDate;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/** FR-004·005·016, AR-002·003 및 주변기기·USB 현황. */
class AssetAuditControllerTest {
  static final UUID AGENT = UUID.randomUUID(), ASSET = UUID.randomUUID();
  static final TestingAuthenticationToken ADMIN = new TestingAuthenticationToken("admin", "x");

  @Test void blockRevokesTokenAndRecordsHistory() {
    JdbcTemplate db = mock(JdbcTemplate.class);
    when(db.update(startsWith("UPDATE agent SET blocked_at=now()"), eq("분실 신고"), eq("admin"), eq(AGENT))).thenReturn(1);
    var res = new AssetAuditController(db).block(AGENT, new AssetAuditController.BlockRequest(" 분실 신고 "), ADMIN);
    assertEquals(200, res.getStatusCode().value());
    verify(db).update(contains("INSERT INTO asset_management_history"), eq("AGENT_BLOCKED"), eq("admin"), eq("Agent 차단: 분실 신고"), eq(AGENT));
  }

  @Test void blockTwiceIsConflictAndUnknownIsNotFound() {
    JdbcTemplate db = mock(JdbcTemplate.class);
    when(db.update(startsWith("UPDATE agent SET blocked_at=now()"), any(Object[].class))).thenReturn(0);
    when(db.queryForList("SELECT 1 FROM agent WHERE id=?", AGENT)).thenReturn(List.of(Map.of("?column?", 1)));
    assertEquals(409, new AssetAuditController(db).block(AGENT, new AssetAuditController.BlockRequest("x"), ADMIN).getStatusCode().value());
    UUID other = UUID.randomUUID();
    when(db.queryForList("SELECT 1 FROM agent WHERE id=?", other)).thenReturn(List.of());
    assertEquals(404, new AssetAuditController(db).unblock(other, ADMIN).getStatusCode().value());
    verify(db, never()).update(contains("INSERT INTO asset_management_history"), any(Object[].class));
  }

  @Test void blockedAgentCannotReRegister() {
    JdbcTemplate db = mock(JdbcTemplate.class);
    AgentAuth auth = mock(AgentAuth.class);
    when(auth.registrationValid("reg")).thenReturn(true);
    var row = new HashMap<String, Object>(Map.of("id", AGENT, "version", "0.2.16", "blocked_at", new java.sql.Timestamp(0)));
    when(db.queryForList(startsWith("SELECT id,version,blocked_at FROM agent"), eq("KEY"))).thenReturn(List.of(row));
    var res = new AgentController(db, auth, 2000, true).register("reg", new Models.Register("KEY", "PC-01", "0.2.16"), mock(HttpServletRequest.class));
    assertEquals(403, res.getStatusCode().value());
    verify(db, never()).update(contains("token_hash"), any(Object[].class));
  }

  @Test void authenticationIgnoresBlockedAgents() {
    JdbcTemplate db = mock(JdbcTemplate.class);
    new AgentAuth(db, "reg").authenticate("Bearer abc");
    verify(db).query(contains("blocked_at IS NULL"), any(RowMapper.class), anyString());
  }

  static Models.AssetManagement mgmt(String tag, String status, String assigned, LocalDate nextAudit, BigDecimal cost, String notes) {
    return new Models.AssetManagement(tag, status, null, null, assigned, null, null, cost, null, null, null, nextAudit, notes);
  }

  @Test void fieldLevelChangesShowBeforeAndAfter() {
    var before = new HashMap<String, Object>();
    before.put("lifecycle_status", "IN_USE"); before.put("assigned_to", "김철수"); before.put("purchase_cost", new BigDecimal("1200000.00"));
    before.put("next_audit_at", Date.valueOf("2026-12-01")); before.put("management_notes", "old");
    String d = AssetController.changes(before, mgmt(" AF-0001 ", "LOST", "김철수", LocalDate.parse("2026-12-01"), new BigDecimal("1200000"), "new secret note"));
    assertEquals("자산태그: - → AF-0001; 상태: 사용 중 → 분실; 관리 메모 변경", d);
    assertNull(AssetController.changes(before, mgmt("", "IN_USE", " 김철수 ", LocalDate.parse("2026-12-01"), new BigDecimal("1200000"), "old")), "no change → no history");
  }

  @Test void reportParametersAreWhitelisted() {
    assertNull(PeripheralReportController.type(null), "no filter");
    assertNull(PeripheralReportController.category(null), "no filter");
    assertNull(PeripheralReportController.type("MONITOR'; DROP TABLE x"));
    assertEquals("MONITOR", PeripheralReportController.type("MONITOR"));
    assertNull(PeripheralReportController.category("weapon"));
    assertEquals("STORAGE", PeripheralReportController.category("STORAGE"));
    assertEquals(1, PeripheralReportController.days(-5));
    assertEquals(3650, PeripheralReportController.days(99999));
  }

  @Test void reportCsvUsesKoreanLabelsAndKst() {
    assertEquals("2026-11-13 17:21", PeripheralReportController.display("last_arrival_at", java.sql.Timestamp.from(java.time.Instant.parse("2026-11-13T08:21:01Z"))));
    assertEquals("예", PeripheralReportController.display("present", true));
    assertEquals("저장장치", PeripheralReportController.display("category", "STORAGE"));
    assertEquals("내장", PeripheralReportController.display("connection", "Internal"));
    assertEquals("STORAGE", PeripheralReportController.display("name", "STORAGE"));
  }

  @Test void reportCsvEscapesFormulas() {
    var res = PeripheralReportController.csv("x.csv", "a,b", List.of(Map.of("a", "=HYPERLINK(1)", "b", "PC")), List.of("a", "b"));
    assertTrue(res.getBody().contains("\"'=HYPERLINK(1)\",\"PC\""));
  }
}

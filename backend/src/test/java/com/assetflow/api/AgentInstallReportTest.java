package com.assetflow.api;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Validation;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import java.time.OffsetDateTime;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/** Agent 0.3.1 설치·업데이트 전/후 점검 보고. */
class AgentInstallReportTest {
  static final List<Models.InstallCheck> CHECKS = List.of(
      new Models.InstallCheck("SHA-256 무결성", "PASS", "e3381e72fe92"),
      new Models.InstallCheck("백신 격리·차단 확인", "FAIL", "20초 후 파일 없음(격리 의심)"));

  static Models.InstallReport report(String stage, String result) {
    return new Models.InstallReport("UPDATE", stage, result, "0.3.1", "0.3.2", CHECKS, "1/2 통과", OffsetDateTime.parse("2026-11-25T14:00:00+09:00"));
  }

  @Test void storesChecksAsJsonAndLogsBlockedUpdate() throws Exception {
    JdbcTemplate db = mock(JdbcTemplate.class);
    when(db.queryForObject(contains("INSERT INTO agent_install_report"), eq(Long.class), any(Object[].class))).thenReturn(11L);
    var res = AgentUninstallTest.agentController(db).installReport("Bearer t", report("PRECHECK", "BLOCKED"), mock(HttpServletRequest.class));
    assertEquals(201, res.getStatusCode().value());
    assertEquals(Map.of("id", 11L), res.getBody());
    verify(db).queryForObject(contains("?::jsonb"), eq(Long.class), eq(AgentUninstallTest.AGENT), eq("UPDATE"), eq("PRECHECK"), eq("BLOCKED"), eq("0.3.1"), eq("0.3.2"),
        argThat((String json) -> json.contains("\"status\":\"FAIL\"") && json.contains("백신 격리")), eq("1/2 통과"), any(), any());
    verify(db).update(contains("agent_update_history"), eq(AgentUninstallTest.AGENT), eq("0.3.1"), eq("0.3.2"), eq("UPDATE_BLOCKED"));
  }

  @Test void successfulInstallDoesNotAddFailureHistory() throws Exception {
    JdbcTemplate db = mock(JdbcTemplate.class);
    when(db.queryForObject(anyString(), eq(Long.class), any(Object[].class))).thenReturn(12L);
    assertEquals(201, AgentUninstallTest.agentController(db).installReport("Bearer t", report("POSTCHECK", "INSTALLED"), mock(HttpServletRequest.class)).getStatusCode().value());
    verify(db, never()).update(contains("agent_update_history"), any(Object[].class));
    when(db.queryForObject(anyString(), eq(Long.class), any(Object[].class))).thenReturn(13L);
    AgentUninstallTest.agentController(db).installReport("Bearer t", report("POSTCHECK", "ROLLED_BACK"), mock(HttpServletRequest.class));
    verify(db).update(contains("agent_update_history"), eq(AgentUninstallTest.AGENT), eq("0.3.1"), eq("0.3.2"), eq("UPDATE_ROLLED_BACK"));
  }

  @Test void rejectsStageResultMismatchAndUnknownDevice() throws Exception {
    JdbcTemplate db = mock(JdbcTemplate.class);
    assertEquals(422, AgentUninstallTest.agentController(db).installReport("Bearer t", report("PRECHECK", "INSTALLED"), mock(HttpServletRequest.class)).getStatusCode().value());
    assertEquals(401, AgentUninstallTest.agentController(db).installReport("Bearer other", report("PRECHECK", "PASSED"), mock(HttpServletRequest.class)).getStatusCode().value());
    verifyNoInteractions(db);
  }

  @Test void validatesReportShape() {
    var validator = Validation.buildDefaultValidatorFactory().getValidator();
    assertTrue(validator.validate(report("PRECHECK", "PASSED")).isEmpty());
    var bad = new Models.InstallReport("UPDATE", "PRECHECK", "PASSED", null, "0.3.2", List.of(new Models.InstallCheck("x", "OK", null)), null, null);
    assertFalse(validator.validate(bad).isEmpty(), "status must be PASS/WARN/FAIL");
    var many = new ArrayList<Models.InstallCheck>(); for (int i = 0; i < 41; i++) many.add(new Models.InstallCheck("c" + i, "PASS", null));
    assertFalse(validator.validate(new Models.InstallReport("UPDATE", "PRECHECK", "PASSED", null, "0.3.2", many, null, null)).isEmpty(), "at most 40 checks");
    assertFalse(validator.validate(new Models.InstallReport("DELETE", "PRECHECK", "PASSED", null, "0.3.2", List.of(), null, null)).isEmpty(), "kind");
  }
}

package com.assetflow.api;

import com.assetflow.service.UninstallCodes;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.Size;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.Authentication;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import java.time.Instant;
import java.util.*;

/**
 * Agent 0.3.0 승인된 제거(관리자). 승인 → Agent가 다음 하트비트(최대 5분)에 스스로 제거.
 * 오프라인 PC는 장치 전용·유효기간 제거 코드를 발급해 PC의 제거 도구에 입력한다.
 */
@RestController
@RequestMapping("/api/v1/admin")
public class AgentUninstallController {
  static final int APPROVAL_DAYS = 7;
  private final JdbcTemplate db;
  public AgentUninstallController(JdbcTemplate db) { this.db = db; }

  public record Decision(@Size(max = 500) String note) {}
  public record CodeRequest(@Min(1) @Max(UninstallCodes.MAX_HOURS) Integer hours, @Size(max = 500) String reason) {}

  @GetMapping("/agent-uninstalls")
  public List<Map<String, Object>> list() {
    // 승인 후 기한이 지난 요청은 조회 시점에 만료 처리
    db.update("UPDATE agent_uninstall_request SET status='EXPIRED' WHERE status='APPROVED' AND expires_at<now()");
    return db.queryForList("""
        SELECT r.id,r.agent_id,r.status,r.source,r.reason,r.requested_by,r.requested_at,r.decided_by,r.decided_at,r.decision_note,r.expires_at,r.completed_at,
               a.hostname,a.version agent_version,a.uninstalled_at,s.id asset_id,s.assigned_to,s.username
        FROM agent_uninstall_request r JOIN agent a ON a.id=r.agent_id LEFT JOIN asset s ON s.agent_id=a.id
        ORDER BY CASE r.status WHEN 'REQUESTED' THEN 0 WHEN 'APPROVED' THEN 1 ELSE 2 END,r.requested_at DESC LIMIT 200
        """);
  }

  /** 열린 요청을 승인하거나, 요청이 없으면 관리자 승인 제거를 새로 만든다. 7일 안에 Agent가 받지 않으면 만료. */
  @Transactional
  @PostMapping("/agents/{agentId}/uninstall/approve")
  public ResponseEntity<?> approve(@PathVariable UUID agentId, @Valid @RequestBody(required = false) Decision x, Authentication user) {
    if (db.queryForList("SELECT 1 FROM agent WHERE id=?", agentId).isEmpty()) return ResponseEntity.notFound().build();
    String note = x == null || x.note() == null || x.note().isBlank() ? null : x.note().trim();
    int n = db.update("UPDATE agent_uninstall_request SET status='APPROVED',decided_by=?,decided_at=now(),decision_note=?,expires_at=now()+make_interval(days=>?) WHERE agent_id=? AND status='REQUESTED'",
        user.getName(), note, APPROVAL_DAYS, agentId);
    if (n == 0) {
      if (!db.queryForList("SELECT 1 FROM agent_uninstall_request WHERE agent_id=? AND status='APPROVED' AND expires_at>now()", agentId).isEmpty())
        return ResponseEntity.status(409).body(Map.of("error", "already approved"));
      db.update("INSERT INTO agent_uninstall_request(agent_id,status,source,reason,requested_by,decided_by,decided_at,decision_note,expires_at) VALUES(?,'APPROVED','ADMIN',?,?,?,now(),?,now()+make_interval(days=>?))",
          agentId, note == null ? "관리자 직접 승인" : note, user.getName(), user.getName(), note, APPROVAL_DAYS);
    }
    history(agentId, "UNINSTALL_APPROVED", user.getName(), "Agent 제거 승인" + (note == null ? "" : ": " + note) + " — 다음 하트비트(최대 5분)에 제거");
    return ResponseEntity.ok(Map.of("status", "APPROVED"));
  }

  @Transactional
  @PostMapping("/agent-uninstalls/{requestId}/reject")
  public ResponseEntity<?> reject(@PathVariable long requestId, @Valid @RequestBody(required = false) Decision x, Authentication user) {
    String note = x == null || x.note() == null || x.note().isBlank() ? "거절" : x.note().trim();
    var rows = db.queryForList("UPDATE agent_uninstall_request SET status='REJECTED',decided_by=?,decided_at=now(),decision_note=? WHERE id=? AND status IN ('REQUESTED','APPROVED') RETURNING agent_id", user.getName(), note, requestId);
    if (rows.isEmpty()) return ResponseEntity.status(409).body(Map.of("error", "request is not open"));
    history((UUID) rows.getFirst().get("agent_id"), "UNINSTALL_REJECTED", user.getName(), "Agent 제거 요청 거절: " + note);
    return ResponseEntity.ok(Map.of("status", "REJECTED"));
  }

  /** 오프라인 PC용: 장치 전용·유효기간(기본 24시간, 최대 72시간) 제거 코드. 코드 자체는 저장하지 않고 발급 사실만 기록한다. */
  @PostMapping("/agents/{agentId}/uninstall/code")
  public ResponseEntity<?> code(@PathVariable UUID agentId, @Valid @RequestBody(required = false) CodeRequest x, Authentication user) {
    var rows = db.queryForList("SELECT token_hash,hostname FROM agent WHERE id=? AND uninstalled_at IS NULL", agentId);
    if (rows.isEmpty()) return ResponseEntity.notFound().build();
    String tokenHash = Objects.toString(rows.getFirst().get("token_hash"), "");
    if (!tokenHash.matches("[0-9a-f]{64}")) return ResponseEntity.status(409).body(Map.of("error", "device token is not active"));
    int hours = x == null || x.hours() == null ? 24 : x.hours();
    String code = UninstallCodes.issue(tokenHash, agentId, hours, Instant.now());
    Instant expires = UninstallCodes.expiresAt(code);
    String reason = x == null || x.reason() == null || x.reason().isBlank() ? null : x.reason().trim();
    history(agentId, "UNINSTALL_CODE_ISSUED", user.getName(), "오프라인 제거 코드 발급(만료 " + expires + ")" + (reason == null ? "" : ": " + reason));
    return ResponseEntity.ok(Map.of("code", code, "expiresAt", expires.toString(), "hostname", rows.getFirst().get("hostname")));
  }

  private void history(UUID agentId, String action, String by, String details) {
    db.update("INSERT INTO asset_management_history(asset_id,action,changed_by,details) SELECT id,?,?,? FROM asset WHERE agent_id=?", action, by, details, agentId);
  }
}

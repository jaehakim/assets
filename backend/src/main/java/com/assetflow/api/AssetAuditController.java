package com.assetflow.api;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.Authentication;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import java.util.*;

/**
 * ITAM 점검: FR-005 폐기·분실 자산 활동 경보, FR-004 중복 자산 탐지, AR-003 관리정보 누락, FR-016 Agent 차단.
 */
@RestController
@RequestMapping("/api/v1/admin")
public class AssetAuditController {
  /** 메인보드·BIOS 기본값으로 채워진 식별자는 중복 판단에서 제외하고 "식별자 미설정"으로 본다. */
  static final List<String> PLACEHOLDER_SERIALS = List.of("", "0", "DEFAULT STRING", "TO BE FILLED BY O.E.M.", "SYSTEM SERIAL NUMBER", "CHASSIS SERIAL NUMBER",
      "NONE", "NOT APPLICABLE", "N/A", "INVALID", "123456789", "0123456789", "SERIAL NUMBER", "OEM");
  static final List<String> PLACEHOLDER_UUIDS = List.of("00000000-0000-0000-0000-000000000000", "FFFFFFFF-FFFF-FFFF-FFFF-FFFFFFFFFFFF", "03000200-0400-0500-0006-000700080009");
  static final Set<String> INACTIVE_STATES = Set.of("LOST", "RETIRED", "DISPOSED");

  private final JdbcTemplate db;
  public AssetAuditController(JdbcTemplate db) { this.db = db; }

  static String inList(List<String> values) { return String.join(",", Collections.nCopies(values.size(), "?")); }

  @GetMapping("/asset-audit")
  public Map<String, Object> audit() {
    // FR-005: 폐기·분실·반납 처리했는데 최근 7일 안에 Agent가 통신한 자산
    var retiredActive = db.queryForList("""
        SELECT s.id,s.agent_id,s.hostname,s.lifecycle_status,s.asset_tag,s.assigned_to,s.location,s.username,s.ip_address,a.last_ip server_observed_ip,
               GREATEST(s.last_seen_at,a.last_seen_at) last_seen_at,a.blocked_at agent_blocked_at
        FROM asset s JOIN agent a ON a.id=s.agent_id
        WHERE s.lifecycle_status IN ('LOST','RETIRED','DISPOSED') AND GREATEST(s.last_seen_at,a.last_seen_at)>now()-interval '7 days'
        ORDER BY GREATEST(s.last_seen_at,a.last_seen_at) DESC
        """);
    // FR-004: 같은 하드웨어 식별자(시리얼·UUID·MAC)를 가진 자산 — PC 이름 변경·OS 재설치로 대장에 이중 등록된 경우
    List<Object> args = new ArrayList<>(PLACEHOLDER_SERIALS);
    args.addAll(PLACEHOLDER_UUIDS);
    var duplicates = db.queryForList("""
        WITH keys AS (
          SELECT id,'SERIAL' kind,upper(trim(serial_no)) k FROM asset WHERE serial_no IS NOT NULL AND upper(trim(serial_no)) NOT IN (%s)
          UNION ALL SELECT id,'UUID',upper(trim(device_uuid)) FROM asset WHERE device_uuid IS NOT NULL AND upper(trim(device_uuid)) NOT IN (%s)
          UNION ALL SELECT id,'MAC',upper(regexp_replace(mac_address,'[^0-9A-Fa-f]','','g')) FROM asset WHERE coalesce(mac_address,'')<>''),
        dup AS (SELECT kind,k FROM keys GROUP BY kind,k HAVING count(*)>1)
        SELECT d.kind match_type,d.k match_value,s.id,s.hostname,s.serial_no,s.lifecycle_status,s.asset_tag,s.assigned_to,
               GREATEST(s.last_seen_at,a.last_seen_at) last_seen_at,a.version agent_version,a.registered_at agent_registered_at
        FROM dup d JOIN keys k ON k.kind=d.kind AND k.k=d.k JOIN asset s ON s.id=k.id JOIN agent a ON a.id=s.agent_id
        ORDER BY d.kind,d.k,GREATEST(s.last_seen_at,a.last_seen_at) DESC
        """.formatted(inList(PLACEHOLDER_SERIALS), inList(PLACEHOLDER_UUIDS)), args.toArray());
    // AR-003: 사용 중 자산의 관리 기준정보 누락 + 하드웨어 식별자 미설정
    List<Object> serialArgs = new ArrayList<>(PLACEHOLDER_SERIALS);
    var incomplete = db.queryForList("""
        SELECT s.id,s.hostname,s.lifecycle_status,s.serial_no,s.assigned_to,s.location,s.asset_tag,s.username,
               array_to_string(array_remove(ARRAY[
                 CASE WHEN s.asset_tag IS NULL THEN '자산태그' END,
                 CASE WHEN s.assigned_to IS NULL THEN '담당자' END,
                 CASE WHEN s.location IS NULL THEN '위치' END,
                 CASE WHEN s.serial_no IS NULL OR upper(trim(s.serial_no)) IN (%s) THEN '시리얼(BIOS 기본값)' END,
                 CASE WHEN s.next_audit_at IS NULL THEN '다음 실사일' END],NULL),', ') missing
        FROM asset s
        WHERE s.lifecycle_status='IN_USE'
        ORDER BY s.hostname
        """.formatted(inList(PLACEHOLDER_SERIALS)), serialArgs.toArray());
    incomplete = incomplete.stream().filter(r -> !Objects.toString(r.get("missing"), "").isEmpty()).toList();
    long duplicateGroups = duplicates.stream().map(r -> r.get("match_type") + "|" + r.get("match_value")).distinct().count();
    var blocked = db.queryForList("""
        SELECT a.id agent_id,a.hostname,a.blocked_at,a.blocked_reason,a.blocked_by,s.id asset_id
        FROM agent a LEFT JOIN asset s ON s.agent_id=a.id WHERE a.blocked_at IS NOT NULL ORDER BY a.blocked_at DESC
        """);
    return Map.of("retiredActive", retiredActive, "duplicates", duplicates, "duplicateGroups", duplicateGroups,
        "incomplete", incomplete, "blockedAgents", blocked);
  }

  public record BlockRequest(@NotBlank @Size(max = 500) String reason) {}

  /** FR-016: 장치 토큰을 무효화하고 같은 PC의 재등록도 거부한다(분실·도난·유출 PC). */
  @Transactional
  @PostMapping("/agents/{agentId}/block")
  public ResponseEntity<?> block(@PathVariable UUID agentId, @Valid @RequestBody BlockRequest x, Authentication user) {
    int n = db.update("UPDATE agent SET blocked_at=now(),blocked_reason=?,blocked_by=? WHERE id=? AND blocked_at IS NULL", x.reason().trim(), user.getName(), agentId);
    if (n == 0) return db.queryForList("SELECT 1 FROM agent WHERE id=?", agentId).isEmpty() ? ResponseEntity.notFound().build()
        : ResponseEntity.status(409).body(Map.of("error", "already blocked"));
    history(agentId, "AGENT_BLOCKED", user.getName(), "Agent 차단: " + x.reason().trim());
    return ResponseEntity.ok(Map.of("status", "blocked"));
  }

  @Transactional
  @PostMapping("/agents/{agentId}/unblock")
  public ResponseEntity<?> unblock(@PathVariable UUID agentId, Authentication user) {
    int n = db.update("UPDATE agent SET blocked_at=NULL,blocked_reason=NULL,blocked_by=NULL WHERE id=? AND blocked_at IS NOT NULL", agentId);
    if (n == 0) return db.queryForList("SELECT 1 FROM agent WHERE id=?", agentId).isEmpty() ? ResponseEntity.notFound().build()
        : ResponseEntity.status(409).body(Map.of("error", "not blocked"));
    history(agentId, "AGENT_UNBLOCKED", user.getName(), "Agent 차단 해제");
    return ResponseEntity.ok(Map.of("status", "unblocked"));
  }

  private void history(UUID agentId, String action, String by, String details) {
    db.update("INSERT INTO asset_management_history(asset_id,action,changed_by,details) SELECT id,?,?,? FROM asset WHERE agent_id=?", action, by, details, agentId);
  }
}

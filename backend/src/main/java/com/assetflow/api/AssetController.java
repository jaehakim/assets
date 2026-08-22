package com.assetflow.api;

import org.springframework.http.ResponseEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.*;

@RestController
@RequestMapping("/api/v1")
public class AssetController {
  private final JdbcTemplate db;

  public AssetController(JdbcTemplate db) { this.db = db; }

  @GetMapping("/health")
  public Map<String, String> health() { return Map.of("status", "ok"); }

  @GetMapping("/dashboard")
  public Map<String, Object> dashboard() {
    int total = count("SELECT count(*) FROM asset");
    int online = count("SELECT count(*) FROM asset WHERE last_seen_at>now()-interval '15 minutes'");
    int stale = count("SELECT count(*) FROM asset WHERE last_seen_at<now()-interval '7 days'");
    int bitlocker = count("SELECT count(*) FROM asset WHERE bitlocker_enabled=false");
    int antivirus = count("SELECT count(*) FROM asset WHERE antivirus_status IS DISTINCT FROM 'Healthy'");
    int warranty = count("SELECT count(*) FROM asset WHERE warranty_expires_at BETWEEN current_date AND current_date+90");
    int overdueAudit = count("SELECT count(*) FROM asset WHERE next_audit_at<current_date");
    int assigned = count("SELECT count(*) FROM asset WHERE assigned_to IS NOT NULL");
    return Map.of("total", total, "online", online, "offline", total-online, "stale", stale,
        "security", Map.of("bitlocker", bitlocker, "antivirus", antivirus),
        "management", Map.of("warrantyExpiring",warranty,"overdueAudit",overdueAudit,"assigned",assigned));
  }

  @GetMapping("/assets")
  public List<Map<String, Object>> assets(@RequestParam(defaultValue="") String q) {
    return db.queryForList("""
        SELECT s.id,s.hostname,s.serial_no,s.manufacturer,s.model,s.username,s.department,s.asset_tag,
               s.lifecycle_status,s.category,s.location,s.assigned_to,s.warranty_expires_at,s.next_audit_at,
               s.os_name,s.os_version,s.ip_address,s.last_seen_at,a.version agent_version,
               (s.last_seen_at>now()-interval '15 minutes') online
        FROM asset s JOIN agent a ON a.id=s.agent_id
        WHERE s.hostname ILIKE ? OR coalesce(s.username,'') ILIKE ? OR coalesce(s.asset_tag,'') ILIKE ?
          OR coalesce(s.assigned_to,'') ILIKE ? OR coalesce(s.location,'') ILIKE ?
        ORDER BY s.last_seen_at DESC LIMIT 500
        """, "%"+q+"%", "%"+q+"%", "%"+q+"%", "%"+q+"%", "%"+q+"%");
  }

  @GetMapping("/assets/{id}")
  public ResponseEntity<?> asset(@PathVariable UUID id) {
    var rows = db.queryForList("""
        SELECT s.*,a.version agent_version,a.registered_at agent_registered_at,
               a.last_seen_at agent_last_seen_at,a.last_ip agent_last_ip
        FROM asset s JOIN agent a ON a.id=s.agent_id WHERE s.id=?
        """, id);
    if (rows.isEmpty()) return ResponseEntity.notFound().build();
    var out = new LinkedHashMap<>(rows.getFirst());
    out.put("disks", db.queryForList("SELECT name,filesystem,total_bytes,free_bytes FROM asset_disk WHERE asset_id=?", id));
    out.put("software", db.queryForList("SELECT name,version,publisher,install_date FROM asset_software WHERE asset_id=? ORDER BY name", id));
    out.put("managementHistory", db.queryForList("SELECT id,action,changed_by,details,created_at FROM asset_management_history WHERE asset_id=? ORDER BY created_at DESC LIMIT 30", id));
    return ResponseEntity.ok(out);
  }

  @PatchMapping("/assets/{id}/management")
  public ResponseEntity<?> management(@PathVariable UUID id,@RequestBody Models.AssetManagement x,Authentication user) {
    if(!Set.of("IN_STOCK","IN_USE","REPAIR","LOST","RETIRED","DISPOSED").contains(Objects.toString(x.lifecycleStatus(),"")))return ResponseEntity.badRequest().body(Map.of("error","invalid lifecycle status"));
    int updated=db.update("""
        UPDATE asset SET asset_tag=nullif(trim(?),''),lifecycle_status=?,category=nullif(trim(?),''),location=nullif(trim(?),''),
          assigned_to=nullif(trim(?),''),vendor=nullif(trim(?),''),purchase_date=?,purchase_cost=?,warranty_expires_at=?,eol_at=?,
          last_audit_at=?,next_audit_at=?,management_notes=nullif(trim(?),''),updated_at=now() WHERE id=?
        """,x.assetTag(),x.lifecycleStatus(),x.category(),x.location(),x.assignedTo(),x.vendor(),x.purchaseDate(),x.purchaseCost(),x.warrantyExpiresAt(),x.eolAt(),x.lastAuditAt(),x.nextAuditAt(),x.managementNotes(),id);
    if(updated==0)return ResponseEntity.notFound().build();
    String details=String.format("상태=%s, 담당=%s, 위치=%s, 다음 실사=%s",x.lifecycleStatus(),Objects.toString(x.assignedTo(),"-"),Objects.toString(x.location(),"-"),Objects.toString(x.nextAuditAt(),"-"));
    db.update("INSERT INTO asset_management_history(asset_id,action,changed_by,details) VALUES(?,'MANAGEMENT_UPDATED',?,?)",id,user.getName(),details);
    return ResponseEntity.ok(Map.of("status","updated"));
  }

  @GetMapping(value="/assets-export.csv",produces="text/csv;charset=UTF-8")
  public ResponseEntity<String> export(){
    var rows=db.queryForList("SELECT asset_tag,hostname,serial_no,manufacturer,model,lifecycle_status,category,assigned_to,location,department,os_name,agent_id,purchase_date,purchase_cost,warranty_expires_at,eol_at,last_audit_at,next_audit_at,last_seen_at FROM asset ORDER BY hostname");
    StringBuilder csv=new StringBuilder("자산태그,장비명,시리얼,제조사,모델,상태,분류,담당자,위치,부서,운영체제,Agent ID,구매일,구매금액,보증만료,EOL,최근실사,다음실사,최근보고\n");
    for(var row:rows){int i=0;for(Object value:row.values()){if(i++>0)csv.append(',');csv.append(csv(value));}csv.append('\n');}
    return ResponseEntity.ok().header(HttpHeaders.CONTENT_DISPOSITION,"attachment; filename=assetflow-assets.csv").contentType(new MediaType("text","csv",java.nio.charset.StandardCharsets.UTF_8)).body("\uFEFF"+csv);
  }
  private String csv(Object value){String s=Objects.toString(value,"");return "\""+s.replace("\"","\"\"")+"\"";}

  private int count(String sql) {
    Integer n = db.queryForObject(sql, Integer.class);
    return n == null ? 0 : n;
  }
}

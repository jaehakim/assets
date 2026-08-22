package com.assetflow.api;

import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
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
    return Map.of("total", total, "online", online, "offline", total-online, "stale", stale,
        "security", Map.of("bitlocker", bitlocker, "antivirus", antivirus));
  }

  @GetMapping("/assets")
  public List<Map<String, Object>> assets(@RequestParam(defaultValue="") String q) {
    return db.queryForList("""
        SELECT s.id,s.hostname,s.serial_no,s.manufacturer,s.model,s.username,s.department,
               s.os_name,s.os_version,s.ip_address,s.last_seen_at,a.version agent_version,
               (s.last_seen_at>now()-interval '15 minutes') online
        FROM asset s JOIN agent a ON a.id=s.agent_id
        WHERE s.hostname ILIKE ? OR coalesce(s.username,'') ILIKE ?
        ORDER BY s.last_seen_at DESC LIMIT 500
        """, "%"+q+"%", "%"+q+"%");
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
    return ResponseEntity.ok(out);
  }

  private int count(String sql) {
    Integer n = db.queryForObject(sql, Integer.class);
    return n == null ? 0 : n;
  }
}

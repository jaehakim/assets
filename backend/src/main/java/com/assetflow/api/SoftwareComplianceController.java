package com.assetflow.api;

import com.assetflow.service.SoftwarePolicySyncService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.*;
import java.util.*;

@RestController @RequestMapping("/api/v1/admin/software-compliance")
public class SoftwareComplianceController {
  private final JdbcTemplate db; private final SoftwarePolicySyncService sync;
  public SoftwareComplianceController(JdbcTemplate db,SoftwarePolicySyncService sync){this.db=db;this.sync=sync;}
  public record Policy(@NotBlank String softwareName,String publisher,String matchType,String classification,String sourceName,String sourceRef,String notes,Boolean enabled){}
  @GetMapping public Map<String,Object> overview(){
    var policies=db.queryForList("SELECT * FROM software_policy ORDER BY enabled DESC,software_name");
    var detections=db.queryForList("""
      SELECT a.id asset_id,a.hostname,a.asset_tag,a.assigned_to,a.department,a.last_seen_at,s.name software_name,s.version,s.publisher,p.id policy_id,p.classification,p.source_name,p.notes
      FROM asset_software s JOIN asset a ON a.id=s.asset_id JOIN software_policy p ON p.enabled
       AND (CASE p.match_type WHEN 'EXACT' THEN lower(s.name)=lower(p.software_name) WHEN 'PREFIX' THEN lower(s.name) LIKE lower(p.software_name)||'%' ELSE lower(s.name) LIKE '%'||lower(p.software_name)||'%' END)
       AND (p.publisher IS NULL OR trim(p.publisher)='' OR lower(coalesce(s.publisher,'')) LIKE '%'||lower(p.publisher)||'%')
      ORDER BY CASE p.classification WHEN 'PROHIBITED' THEN 1 WHEN 'LICENSE_REQUIRED' THEN 2 ELSE 3 END,a.hostname,s.name
      """);
    int affected=(int)detections.stream().map(x->x.get("asset_id")).distinct().count();
    return Map.of("policies",policies,"detections",detections,"affectedAssets",affected,"syncLogs",db.queryForList("SELECT * FROM software_policy_sync_log ORDER BY started_at DESC LIMIT 20"));
  }
  @PostMapping("/policies") public Map<String,Object> create(@Valid @RequestBody Policy p){Long id=db.queryForObject("INSERT INTO software_policy(software_name,publisher,match_type,classification,source_name,source_ref,notes,enabled) VALUES(trim(?),nullif(trim(?),''),?,?,coalesce(nullif(trim(?),''),'관리자 등록'),nullif(trim(?),''),nullif(trim(?),''),coalesce(?,true)) RETURNING id",Long.class,p.softwareName(),p.publisher(),match(p.matchType()),classification(p.classification()),p.sourceName(),p.sourceRef(),p.notes(),p.enabled());return Map.of("id",id);}
  @PutMapping("/policies/{id}") public ResponseEntity<?> update(@PathVariable long id,@Valid @RequestBody Policy p){int n=db.update("UPDATE software_policy SET software_name=trim(?),publisher=nullif(trim(?),''),match_type=?,classification=?,source_name=coalesce(nullif(trim(?),''),'관리자 등록'),source_ref=nullif(trim(?),''),notes=nullif(trim(?),''),enabled=coalesce(?,true),updated_at=now() WHERE id=?",p.softwareName(),p.publisher(),match(p.matchType()),classification(p.classification()),p.sourceName(),p.sourceRef(),p.notes(),p.enabled(),id);return n==0?ResponseEntity.notFound().build():ResponseEntity.ok(Map.of("status","updated"));}
  @DeleteMapping("/policies/{id}") public ResponseEntity<?> delete(@PathVariable long id){return db.update("DELETE FROM software_policy WHERE id=?",id)==0?ResponseEntity.notFound().build():ResponseEntity.noContent().build();}
  @PostMapping("/sync") public Map<String,Object> synchronize(){return sync.synchronize();}
  private String match(String x){x=Objects.toString(x,"CONTAINS").toUpperCase(Locale.ROOT);return Set.of("EXACT","PREFIX","CONTAINS").contains(x)?x:"CONTAINS";}
  private String classification(String x){x=Objects.toString(x,"REVIEW_REQUIRED").toUpperCase(Locale.ROOT);return Set.of("PROHIBITED","LICENSE_REQUIRED","REVIEW_REQUIRED").contains(x)?x:"REVIEW_REQUIRED";}
}

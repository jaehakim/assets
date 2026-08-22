package com.assetflow.api;

import com.assetflow.service.AgentAuth;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import org.springframework.http.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import java.security.SecureRandom;
import java.time.OffsetDateTime;
import java.util.*;

@RestController
@RequestMapping("/api/v1/agents")
public class AgentController {
  private final JdbcTemplate db;
  private final AgentAuth auth;
  public AgentController(JdbcTemplate db,AgentAuth auth){this.db=db;this.auth=auth;}

  @PostMapping("/register")
  public ResponseEntity<?> register(@RequestHeader(value="X-Registration-Token",required=false)String key,@Valid @RequestBody Models.Register x,HttpServletRequest req){
    if(!auth.registrationValid(key))return ResponseEntity.status(401).body(Map.of("error","invalid registration token"));
    byte[] b=new byte[32];new SecureRandom().nextBytes(b);String token=Base64.getUrlEncoder().withoutPadding().encodeToString(b);
    var found=db.queryForList("SELECT id,version FROM agent WHERE agent_key=?",x.agentKey());
    UUID id=found.isEmpty()?UUID.randomUUID():(UUID)found.getFirst().get("id");
    if(found.isEmpty()){
      db.update("INSERT INTO agent(id,agent_key,hostname,version,token_hash,last_ip)VALUES(?,?,?,?,?,?)",id,x.agentKey(),x.hostname(),x.version(),AgentAuth.hash(token),req.getRemoteAddr());
      db.update("INSERT INTO agent_update_history(agent_id,to_version,event_type) VALUES(?,?,'REGISTERED')",id,x.version());
    }else{
      String previous=Objects.toString(found.getFirst().get("version"),null);
      if(!Objects.equals(previous,x.version()))db.update("INSERT INTO agent_update_history(agent_id,from_version,to_version,event_type) VALUES(?,?,?,'VERSION_CHANGED')",id,previous,x.version());
      db.update("UPDATE agent SET hostname=?,version=?,token_hash=?,last_seen_at=now(),last_ip=? WHERE id=?",x.hostname(),x.version(),AgentAuth.hash(token),req.getRemoteAddr(),id);
    }
    return ResponseEntity.ok(new Models.Registered(id,token));
  }

  @PostMapping("/heartbeat")
  public ResponseEntity<?> heartbeat(@RequestHeader(value="Authorization",required=false)String h,@Valid @RequestBody Models.Heartbeat x){
    UUID id=auth.authenticate(h);if(id==null)return ResponseEntity.status(401).build();
    db.update("INSERT INTO agent_update_history(agent_id,from_version,to_version,event_type) SELECT id,version,?,'VERSION_CHANGED' FROM agent WHERE id=? AND version<>?",x.version(),id,x.version());
    db.update("UPDATE agent SET version=?,last_seen_at=now() WHERE id=?",x.version(),id);
    return ResponseEntity.ok(Map.of("serverTime",OffsetDateTime.now()));
  }

  @Transactional
  @PostMapping("/inventory")
  public ResponseEntity<?> inventory(@RequestHeader(value="Authorization",required=false)String h,@Valid @RequestBody Models.Inventory x){
    UUID agent=auth.authenticate(h);if(agent==null)return ResponseEntity.status(401).build();
    var ids=db.query("SELECT id FROM asset WHERE agent_id=?",(r,n)->r.getObject(1,UUID.class),agent);
    UUID id=ids.isEmpty()?UUID.randomUUID():ids.getFirst();
    db.update("""
        INSERT INTO asset(id,agent_id,hostname,serial_no,manufacturer,model,device_uuid,domain_name,domain_joined,
          username,department,os_name,os_version,os_build,os_architecture,os_installed_at,last_boot_at,
          cpu_name,cpu_cores,cpu_logical_processors,memory_bytes,bios_version,ip_address,mac_address,
          bitlocker_enabled,firewall_enabled,antivirus_status,tpm_present,tpm_enabled,tpm_version,secure_boot_enabled)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
        ON CONFLICT(agent_id) DO UPDATE SET hostname=excluded.hostname,serial_no=excluded.serial_no,
          manufacturer=excluded.manufacturer,model=excluded.model,device_uuid=excluded.device_uuid,
          domain_name=excluded.domain_name,domain_joined=excluded.domain_joined,username=excluded.username,
          department=excluded.department,os_name=excluded.os_name,os_version=excluded.os_version,
          os_build=excluded.os_build,os_architecture=excluded.os_architecture,os_installed_at=excluded.os_installed_at,
          last_boot_at=excluded.last_boot_at,cpu_name=excluded.cpu_name,cpu_cores=excluded.cpu_cores,
          cpu_logical_processors=excluded.cpu_logical_processors,memory_bytes=excluded.memory_bytes,
          bios_version=excluded.bios_version,ip_address=excluded.ip_address,mac_address=excluded.mac_address,
          bitlocker_enabled=excluded.bitlocker_enabled,firewall_enabled=excluded.firewall_enabled,
          antivirus_status=excluded.antivirus_status,tpm_present=excluded.tpm_present,tpm_enabled=excluded.tpm_enabled,
          tpm_version=excluded.tpm_version,secure_boot_enabled=excluded.secure_boot_enabled,last_seen_at=now(),updated_at=now()
        """,id,agent,x.hostname(),x.serialNo(),x.manufacturer(),x.model(),x.deviceUuid(),x.domainName(),x.domainJoined(),
        x.username(),x.department(),x.osName(),x.osVersion(),x.osBuild(),x.osArchitecture(),x.osInstalledAt(),x.lastBootAt(),
        x.cpuName(),x.cpuCores(),x.cpuLogicalProcessors(),x.memoryBytes(),x.biosVersion(),x.ipAddress(),x.macAddress(),
        x.bitlockerEnabled(),x.firewallEnabled(),x.antivirusStatus(),x.tpmPresent(),x.tpmEnabled(),x.tpmVersion(),x.secureBootEnabled());
    db.update("DELETE FROM asset_disk WHERE asset_id=?",id);
    if(x.disks()!=null)x.disks().forEach(d->db.update("INSERT INTO asset_disk(asset_id,name,filesystem,total_bytes,free_bytes)VALUES(?,?,?,?,?)",id,d.name(),d.filesystem(),d.totalBytes(),d.freeBytes()));
    db.update("DELETE FROM asset_software WHERE asset_id=?",id);
    if(x.software()!=null)x.software().stream().limit(2000).forEach(s->db.update("INSERT INTO asset_software(asset_id,name,version,publisher,install_date)VALUES(?,?,?,?,?)",id,s.name(),s.version(),s.publisher(),s.installDate()));
    db.update("UPDATE agent SET last_seen_at=now() WHERE id=?",agent);
    return ResponseEntity.accepted().body(Map.of("assetId",id));
  }
}

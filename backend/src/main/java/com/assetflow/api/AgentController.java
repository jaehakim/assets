package com.assetflow.api;

import com.assetflow.service.AgentAuth;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import org.springframework.beans.factory.annotation.Value;
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
  private final int softwareLimit; // CR-023
  public AgentController(JdbcTemplate db,AgentAuth auth,@Value("${assetflow.software-limit:2000}")int softwareLimit){this.db=db;this.auth=auth;this.softwareLimit=softwareLimit;}

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
    int softwareCount=x.software()==null?0:x.software().size();
    if(x.software()!=null)x.software().stream().limit(softwareLimit).forEach(s->db.update("INSERT INTO asset_software(asset_id,name,version,publisher,install_date)VALUES(?,?,?,?,?)",id,s.name(),s.version(),s.publisher(),s.installDate()));
    // CR-023: 상한 초과는 무경고 절삭 대신 수집 건수·절삭 여부를 저장한다.
    db.update("UPDATE asset SET software_count=?,software_truncated=? WHERE id=?",softwareCount,softwareCount>softwareLimit,id);
    if(x.peripherals()!=null)syncPeripherals(id,x.peripherals());
    if(x.usbDevices()!=null)syncUsbDevices(id,x.usbDevices());
    // 0.2.14: 수집 실패 사유(원격 진단). 정상 수집이면 지운다.
    db.update("UPDATE asset SET collection_errors=? WHERE id=?",x.collectionErrors()==null||x.collectionErrors().isEmpty()?null:truncate(String.join(" | ",x.collectionErrors()),2000),id);
    db.update("UPDATE agent SET last_seen_at=now() WHERE id=?",agent);
    return ResponseEntity.accepted().body(Map.of("assetId",id));
  }

  /** Agent 0.2.13: 주변기기 목록을 교체하되 계속 연결된 장치의 최초 확인 시각을 유지하고, 추가·제거를 관리 이력에 남긴다. */
  private void syncPeripherals(UUID assetId,List<Models.Peripheral> list){
    var previous=db.queryForList("SELECT device_type,name,manufacturer,model,serial_no,first_seen_at FROM asset_peripheral WHERE asset_id=?",assetId);
    boolean collectedBefore=Boolean.TRUE.equals(db.queryForObject("SELECT peripherals_collected_at IS NOT NULL FROM asset WHERE id=?",Boolean.class,assetId));
    Map<String,Object> firstSeen=new HashMap<>();Map<String,String> before=new LinkedHashMap<>();
    for(var r:previous){
      String k=peripheralKey((String)r.get("device_type"),(String)r.get("manufacturer"),(String)r.get("model"),(String)r.get("serial_no"),(String)r.get("name"));
      firstSeen.putIfAbsent(k,r.get("first_seen_at"));
      before.put(k,describe((String)r.get("device_type"),(String)r.get("name"),(String)r.get("serial_no")));
    }
    Map<String,String> after=new LinkedHashMap<>();
    db.update("DELETE FROM asset_peripheral WHERE asset_id=?",assetId);
    for(var p:list){
      String k=peripheralKey(p.type(),p.manufacturer(),p.model(),p.serialNo(),p.name());
      after.put(k,describe(p.type(),p.name(),p.serialNo()));
      db.update("""
          INSERT INTO asset_peripheral(asset_id,device_type,name,manufacturer,model,serial_no,connection,vendor_id,product_id,manufacture_year,size_inches,device_id,first_seen_at)
          VALUES(?,?,?,?,?,?,?,?,?,?,?,?,coalesce(?::timestamptz,now()))
          """,assetId,p.type(),p.name(),p.manufacturer(),p.model(),p.serialNo(),p.connection(),p.vendorId(),p.productId(),p.manufactureYear(),p.sizeInches(),p.deviceId(),firstSeen.get(k));
    }
    String details=changeDetails(before,after);
    if(collectedBefore&&details!=null)db.update("INSERT INTO asset_management_history(asset_id,action,changed_by,details) VALUES(?,'PERIPHERAL_CHANGED','agent',?)",assetId,details);
    db.update("UPDATE asset SET peripherals_collected_at=now() WHERE id=?",assetId);
  }

  /**
   * Agent 0.2.14: USB 장치를 (자산, 장치 인스턴스 ID) 기준으로 누적한다. 이번 보고에 없는 장치는 삭제하지 않고 present=false로 남겨
   * PC에서 과거 기록이 정리된 뒤에도 서버 이력이 유지된다. 이전에 USB를 보고한 자산에서 처음 보는 저장장치·휴대폰은 관리 이력에 남긴다.
   */
  private void syncUsbDevices(UUID assetId,List<Models.UsbDevice> list){
    boolean collectedBefore=Boolean.TRUE.equals(db.queryForObject("SELECT usb_collected_at IS NOT NULL FROM asset WHERE id=?",Boolean.class,assetId));
    db.update("UPDATE asset_usb_device SET present=false WHERE asset_id=?",assetId);
    var added=new ArrayList<String>();
    for(var u:list){
      Boolean inserted=db.queryForObject("""
          INSERT INTO asset_usb_device(asset_id,device_id,category,name,manufacturer,vendor_id,product_id,serial_no,device_class,service,present,first_install_at,last_arrival_at,last_removal_at)
          VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)
          ON CONFLICT(asset_id,device_id) DO UPDATE SET category=excluded.category,name=excluded.name,manufacturer=excluded.manufacturer,
            vendor_id=excluded.vendor_id,product_id=excluded.product_id,serial_no=excluded.serial_no,device_class=excluded.device_class,service=excluded.service,
            present=excluded.present,first_install_at=coalesce(asset_usb_device.first_install_at,excluded.first_install_at),
            last_arrival_at=coalesce(excluded.last_arrival_at,asset_usb_device.last_arrival_at),last_removal_at=coalesce(excluded.last_removal_at,asset_usb_device.last_removal_at),
            last_reported_at=now()
          RETURNING (xmax=0)
          """,Boolean.class,assetId,u.deviceId(),u.category(),u.name(),u.manufacturer(),u.vendorId(),u.productId(),u.serialNo(),u.deviceClass(),u.service(),
          Boolean.TRUE.equals(u.present()),u.firstInstallAt(),u.lastArrivalAt(),u.lastRemovalAt());
      if(collectedBefore&&Boolean.TRUE.equals(inserted)&&("STORAGE".equals(u.category())||"MOBILE".equals(u.category())))
        added.add(("STORAGE".equals(u.category())?"USB 저장장치 ":"휴대기기 ")+u.name()+(u.serialNo()==null?"":" (S/N "+u.serialNo()+")"));
    }
    if(!added.isEmpty())db.update("INSERT INTO asset_management_history(asset_id,action,changed_by,details) VALUES(?,'USB_DEVICE_FIRST_SEEN','agent',?)",assetId,truncate("새 USB 장치 연결 기록: "+String.join(", ",added),2000));
    db.update("UPDATE asset SET usb_collected_at=now() WHERE id=?",assetId);
  }

  static String truncate(String text,int max){return text.length()>max?text.substring(0,max-3)+"...":text;}

  /** 장치 식별: 모델(EDID 코드·VID/PID)+시리얼. 둘 다 없을 때만 이름을 쓴다 — Agent가 표시 이름을 개선해도 가짜 연결/분리 이력이 생기지 않도록(0.2.16). */
  static String peripheralKey(String type,String manufacturer,String model,String serial,String name){
    return String.join("|",type,Objects.toString(model,""),Objects.toString(serial,""),model==null&&serial==null?Objects.toString(name,""):"").toLowerCase(Locale.ROOT);
  }
  static String describe(String type,String name,String serial){
    String label=switch(Objects.toString(type,"")){case "MONITOR"->"모니터";case "KEYBOARD"->"키보드";case "MOUSE"->"마우스";default->"장치";};
    return label+" "+name+(serial==null?"":" (S/N "+serial+")");
  }
  /** 추가·제거된 장치 설명. 변경이 없으면 null. */
  static String changeDetails(Map<String,String> before,Map<String,String> after){
    var added=after.entrySet().stream().filter(e->!before.containsKey(e.getKey())).map(Map.Entry::getValue).toList();
    var removed=before.entrySet().stream().filter(e->!after.containsKey(e.getKey())).map(Map.Entry::getValue).toList();
    if(added.isEmpty()&&removed.isEmpty())return null;
    var parts=new ArrayList<String>();
    if(!added.isEmpty())parts.add("주변기기 연결: "+String.join(", ",added));
    if(!removed.isEmpty())parts.add("주변기기 분리: "+String.join(", ",removed));
    String text=String.join(" / ",parts);
    return truncate(text,2000);
  }
}

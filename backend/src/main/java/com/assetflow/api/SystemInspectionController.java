package com.assetflow.api;

import com.assetflow.service.K3sInspectionService;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.web.bind.annotation.*;
import java.util.*;

@RestController
@RequestMapping("/api/v1/admin/system-inspections")
public class SystemInspectionController {
  private final JdbcTemplate db;
  private final K3sInspectionService infrastructure;
  public SystemInspectionController(JdbcTemplate db,K3sInspectionService infrastructure){this.db=db;this.infrastructure=infrastructure;}

  @Scheduled(cron="${assetflow.system-inspection-cron:0 10 6 * * *}",zone="Asia/Seoul")
  public void scheduledInspection(){inspect(false);}

  @PostMapping
  public Map<String,Object> runNow(){inspect(true);return Map.of("status","completed");}

  @GetMapping
  public List<Map<String,Object>> list(){
    return db.queryForList("""
      SELECT id,period_start,status,db_status,total_assets,online_assets,stale_assets,security_alerts,platform,node_name,
        node_ready,k3s_version,cpu_usage,memory_usage,memory_capacity,storage_capacity,storage_allocatable,disk_pressure,
        pod_total,pod_ready,pod_restarts,backend_ready,frontend_ready,git_sha,notes,created_at
      FROM (SELECT DISTINCT ON ((period_start AT TIME ZONE 'Asia/Seoul')::date) * FROM system_inspection_log
        ORDER BY (period_start AT TIME ZONE 'Asia/Seoul')::date DESC,created_at DESC) daily
      ORDER BY created_at DESC LIMIT 500
      """);
  }

  @GetMapping("/live")
  public Map<String,Object> live(){
    var infra=infrastructure.inspect();var out=new LinkedHashMap<String,Object>();
    out.put("checkedAt",java.time.OffsetDateTime.now());out.put("platform",infra.platform());out.put("nodeName",infra.nodeName());out.put("nodeReady",infra.nodeReady());out.put("k3sVersion",infra.k3sVersion());out.put("cpuUsage",infra.cpuUsage());out.put("memoryUsage",infra.memoryUsage());out.put("memoryCapacity",infra.memoryCapacity());out.put("storageCapacity",infra.storageCapacity());out.put("storageAllocatable",infra.storageAllocatable());out.put("diskPressure",infra.diskPressure());out.put("podTotal",infra.podTotal());out.put("podReady",infra.podReady());out.put("podRestarts",infra.podRestarts());out.put("backendReady",infra.backendReady());out.put("frontendReady",infra.frontendReady());out.put("gitSha",infra.gitSha());out.put("error",infra.error());out.put("database","NORMAL");out.put("totalAssets",count("SELECT count(*) FROM asset"));out.put("onlineAssets",count("SELECT count(*) FROM asset s JOIN agent a ON a.id=s.agent_id WHERE GREATEST(s.last_seen_at,a.last_seen_at)>now()-interval '15 minutes'"));return out;
  }

  private void inspect(boolean manual){
    int total=count("SELECT count(*) FROM asset");
    int online=count("SELECT count(*) FROM asset s JOIN agent a ON a.id=s.agent_id WHERE GREATEST(s.last_seen_at,a.last_seen_at)>now()-interval '15 minutes'");
    int stale=count("SELECT count(*) FROM asset s JOIN agent a ON a.id=s.agent_id WHERE GREATEST(s.last_seen_at,a.last_seen_at)<now()-interval '7 days'");
    int security=count("SELECT count(*) FROM asset WHERE bitlocker_enabled IS DISTINCT FROM true OR firewall_enabled IS DISTINCT FROM true OR antivirus_status IS DISTINCT FROM 'Healthy' OR tpm_enabled IS DISTINCT FROM true OR secure_boot_enabled IS DISTINCT FROM true");
    var infra=infrastructure.inspect();
    String status=stale>0||security>0||!infra.nodeReady()||infra.diskPressure()||infra.podReady()<infra.podTotal()||infra.error()!=null?"ATTENTION":"NORMAL";
    String notes=(total==0?"등록 자산 없음":String.format("온라인 %d/%d, 장기 미접속 %d, 보안 확인 %d",online,total,stale,security))+String.format(" · Pod %d/%d, 재시작 %d",infra.podReady(),infra.podTotal(),infra.podRestarts());
    Object[] values={status,total,online,stale,security,infra.platform(),infra.nodeName(),infra.nodeReady(),infra.k3sVersion(),infra.cpuUsage(),infra.memoryUsage(),infra.memoryCapacity(),infra.storageCapacity(),infra.storageAllocatable(),infra.diskPressure(),infra.podTotal(),infra.podReady(),infra.podRestarts(),infra.backendReady(),infra.frontendReady(),infra.gitSha()};
    db.update("""
      INSERT INTO system_inspection_log(period_start,status,db_status,total_assets,online_assets,stale_assets,security_alerts,platform,node_name,node_ready,k3s_version,cpu_usage,memory_usage,memory_capacity,storage_capacity,storage_allocatable,disk_pressure,pod_total,pod_ready,pod_restarts,backend_ready,frontend_ready,git_sha,notes)
      VALUES(date_trunc('day',now() AT TIME ZONE 'Asia/Seoul') AT TIME ZONE 'Asia/Seoul',?,'NORMAL',?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(period_start) DO UPDATE SET status=excluded.status,db_status=excluded.db_status,total_assets=excluded.total_assets,
        online_assets=excluded.online_assets,stale_assets=excluded.stale_assets,security_alerts=excluded.security_alerts,
        platform=excluded.platform,node_name=excluded.node_name,node_ready=excluded.node_ready,k3s_version=excluded.k3s_version,
        cpu_usage=excluded.cpu_usage,memory_usage=excluded.memory_usage,memory_capacity=excluded.memory_capacity,
        storage_capacity=excluded.storage_capacity,storage_allocatable=excluded.storage_allocatable,disk_pressure=excluded.disk_pressure,
        pod_total=excluded.pod_total,pod_ready=excluded.pod_ready,pod_restarts=excluded.pod_restarts,
        backend_ready=excluded.backend_ready,frontend_ready=excluded.frontend_ready,git_sha=excluded.git_sha,
        notes=excluded.notes,created_at=now()
      """,append(values,(manual?"수동":"자동")+" 일일 점검 · "+notes));
  }
  private Object[] append(Object[] values,Object last){Object[] out=Arrays.copyOf(values,values.length+1);out[out.length-1]=last;return out;}
  private int count(String sql){Integer n=db.queryForObject(sql,Integer.class);return n==null?0:n;}
}

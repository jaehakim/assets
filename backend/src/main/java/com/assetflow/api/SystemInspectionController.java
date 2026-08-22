package com.assetflow.api;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.web.bind.annotation.*;
import java.util.*;

@RestController
@RequestMapping("/api/v1/admin/system-inspections")
public class SystemInspectionController {
  private final JdbcTemplate db;
  public SystemInspectionController(JdbcTemplate db){this.db=db;}

  @Scheduled(initialDelay=20000,fixedDelay=600000)
  public void scheduledInspection(){inspect(false);}

  @PostMapping
  public Map<String,Object> runNow(){inspect(true);return Map.of("status","completed");}

  @GetMapping
  public List<Map<String,Object>> list(){
    return db.queryForList("SELECT id,period_start,status,db_status,total_assets,online_assets,stale_assets,security_alerts,notes,created_at FROM system_inspection_log ORDER BY created_at DESC LIMIT 500");
  }

  private void inspect(boolean manual){
    int total=count("SELECT count(*) FROM asset");
    int online=count("SELECT count(*) FROM asset WHERE last_seen_at>now()-interval '15 minutes'");
    int stale=count("SELECT count(*) FROM asset WHERE last_seen_at<now()-interval '7 days'");
    int security=count("SELECT count(*) FROM asset WHERE bitlocker_enabled IS DISTINCT FROM true OR firewall_enabled IS DISTINCT FROM true OR antivirus_status IS DISTINCT FROM 'Healthy' OR tpm_enabled IS DISTINCT FROM true OR secure_boot_enabled IS DISTINCT FROM true");
    String status=stale>0||security>0?"ATTENTION":"NORMAL";
    String notes=total==0?"등록 자산 없음":String.format("온라인 %d/%d, 장기 미접속 %d, 보안 확인 %d",online,total,stale,security);
    if(manual){
      db.update("INSERT INTO system_inspection_log(period_start,status,db_status,total_assets,online_assets,stale_assets,security_alerts,notes) VALUES(now(),?,'NORMAL',?,?,?,?,?)",status,total,online,stale,security,"수동 점검 · "+notes);
    }else{
      db.update("INSERT INTO system_inspection_log(period_start,status,db_status,total_assets,online_assets,stale_assets,security_alerts,notes) VALUES(date_trunc('hour',now())+floor(date_part('minute',now())/10)*interval '10 minutes',?,'NORMAL',?,?,?,?,?) ON CONFLICT(period_start) DO NOTHING",status,total,online,stale,security,"자동 점검 · "+notes);
    }
  }
  private int count(String sql){Integer n=db.queryForObject(sql,Integer.class);return n==null?0:n;}
}

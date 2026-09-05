package com.assetflow.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;
import java.net.URI;
import java.util.*;

@Service public class SoftwarePolicySyncService {
  private final JdbcTemplate db;private final ObjectMapper json;private final RestClient http;
  @Value("${assetflow.software-policy-source-url:}") String sourceUrl;
  @Value("${assetflow.software-policy-source-name:공공기관 기초자료}") String sourceName;
  @Value("${assetflow.software-policy-api-key:}") String apiKey;
  public SoftwarePolicySyncService(JdbcTemplate db,ObjectMapper json,RestClient.Builder builder){this.db=db;this.json=json;this.http=builder.build();}
  @Scheduled(cron="${assetflow.software-policy-sync-cron:0 20 3 * * *}",zone="Asia/Seoul") public void scheduled(){if(!sourceUrl.isBlank())synchronize();}
  public synchronized Map<String,Object> synchronize(){
    if(sourceUrl.isBlank())return Map.of("status","NOT_CONFIGURED","message","SOFTWARE_POLICY_SOURCE_URL을 설정하세요.","importedCount",0);
    validateUrl();Long logId=db.queryForObject("INSERT INTO software_policy_sync_log(source_name,source_url,status) VALUES(?,?,'RUNNING') RETURNING id",Long.class,sourceName,sourceUrl);
    try{String body=http.get().uri(sourceUrl).headers(h->{h.setAccept(List.of(MediaType.APPLICATION_JSON,MediaType.TEXT_PLAIN));if(!apiKey.isBlank())h.set("X-API-Key",apiKey);}).retrieve().body(String.class);List<Row> rows=parse(Objects.requireNonNullElse(body,""));int count=0;
      for(Row r:rows){if(r.name()==null||r.name().isBlank())continue;String key=Objects.requireNonNullElse(r.id(),r.name()+"|"+Objects.toString(r.publisher(),""));db.update("""
        INSERT INTO software_policy(software_name,publisher,match_type,classification,source_name,source_ref,notes,enabled,external_key) VALUES(?,nullif(?,''),?,?,?,nullif(?,''),nullif(?,''),true,?)
        ON CONFLICT(source_name,external_key) WHERE external_key IS NOT NULL DO UPDATE SET software_name=excluded.software_name,publisher=excluded.publisher,match_type=excluded.match_type,classification=excluded.classification,source_ref=excluded.source_ref,notes=excluded.notes,enabled=true,updated_at=now()
        """,r.name().trim(),Objects.toString(r.publisher(),""),match(r.matchType()),classification(r.classification()),sourceName,Objects.toString(r.sourceRef(),sourceUrl),Objects.toString(r.notes(),""),key);count++;}
      db.update("UPDATE software_policy_sync_log SET status='SUCCESS',imported_count=?,message='기초자료 동기화 완료',completed_at=now() WHERE id=?",count,logId);return Map.of("status","SUCCESS","importedCount",count);
    }catch(Exception e){String m=Objects.toString(e.getMessage(),e.getClass().getSimpleName());db.update("UPDATE software_policy_sync_log SET status='FAILED',message=?,completed_at=now() WHERE id=?",m.substring(0,Math.min(1000,m.length())),logId);throw new IllegalStateException("기초자료 동기화 실패: "+m,e);}
  }
  private void validateUrl(){URI u=URI.create(sourceUrl);if(!Set.of("http","https").contains(u.getScheme())||u.getHost()==null)throw new IllegalArgumentException("HTTP(S) 자료 URL만 허용됩니다.");}
  private List<Row> parse(String body)throws Exception{String s=body.strip();if(s.startsWith("[")||s.startsWith("{")){Object root=json.readValue(s,Object.class);Object list=root instanceof Map<?,?> m?(m.containsKey("items")?m.get("items"):m.get("data")):root;return json.convertValue(list,new TypeReference<List<Row>>(){});}List<Row> out=new ArrayList<>();String[] lines=s.split("\\R");if(lines.length<2)return out;String[] head=csv(lines[0]);for(int i=1;i<lines.length;i++){if(lines[i].isBlank())continue;String[] v=csv(lines[i]);Map<String,String> m=new HashMap<>();for(int j=0;j<Math.min(head.length,v.length);j++)m.put(head[j].trim().toLowerCase(Locale.ROOT),v[j].trim());out.add(new Row(m.get("id"),first(m,"name","software_name","softwarename"),first(m,"publisher","vendor"),first(m,"match_type","matchtype"),first(m,"classification","status"),first(m,"source_ref","sourceref"),m.get("notes")));}return out;}
  private String[] csv(String line){List<String> out=new ArrayList<>();StringBuilder x=new StringBuilder();boolean q=false;for(int i=0;i<line.length();i++){char c=line.charAt(i);if(c=='\"'){if(q&&i+1<line.length()&&line.charAt(i+1)=='\"'){x.append(c);i++;}else q=!q;}else if(c==','&&!q){out.add(x.toString());x.setLength(0);}else x.append(c);}out.add(x.toString());return out.toArray(String[]::new);}
  private String first(Map<String,String> m,String... k){for(String x:k)if(m.get(x)!=null)return m.get(x);return null;}
  private String match(String x){x=Objects.toString(x,"CONTAINS").toUpperCase(Locale.ROOT);return Set.of("EXACT","PREFIX","CONTAINS").contains(x)?x:"CONTAINS";}
  private String classification(String x){x=Objects.toString(x,"REVIEW_REQUIRED").toUpperCase(Locale.ROOT);return Set.of("PROHIBITED","LICENSE_REQUIRED","REVIEW_REQUIRED").contains(x)?x:"REVIEW_REQUIRED";}
  public record Row(String id,String name,String publisher,String matchType,String classification,String sourceRef,String notes){}
}

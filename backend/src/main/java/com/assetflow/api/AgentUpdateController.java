package com.assetflow.api;

import com.assetflow.service.AgentAuth;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.FileSystemResource;
import org.springframework.http.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.io.InputStream;
import java.nio.file.*;
import java.security.MessageDigest;
import java.util.*;

@RestController
public class AgentUpdateController {
  private final JdbcTemplate db;
  private final AgentAuth auth;
  private final String updateToken;
  private final Path releases;

  public AgentUpdateController(JdbcTemplate db, AgentAuth auth,
      @Value("${assetflow.update-token}") String updateToken,
      @Value("${assetflow.release-directory}") String releaseDirectory) throws Exception {
    this.db = db;
    this.auth = auth;
    this.updateToken = updateToken;
    this.releases = Paths.get(releaseDirectory).toAbsolutePath().normalize();
    Files.createDirectories(this.releases);
  }

  @GetMapping("/api/v1/admin/agent-releases")
  public List<Map<String,Object>> list() {
    return db.queryForList("SELECT version,filename,sha256,size_bytes,created_at FROM agent_release ORDER BY string_to_array(version,'.')::int[] DESC,created_at DESC");
  }

  @GetMapping("/api/v1/admin/agent-update-history")
  public List<Map<String,Object>> history() {
    return db.queryForList("""
        SELECT h.id,a.hostname,h.from_version,h.to_version,h.event_type,h.created_at
        FROM agent_update_history h JOIN agent a ON a.id=h.agent_id
        ORDER BY h.created_at DESC,h.id DESC LIMIT 500
        """);
  }

  @PostMapping(value="/api/v1/admin/agent-releases", consumes=MediaType.MULTIPART_FORM_DATA_VALUE)
  public ResponseEntity<?> upload(@RequestHeader(value="X-Update-Token", required=false) String token,
      @RequestParam String version, @RequestPart MultipartFile file) throws Exception {
    if (!auth.secretValid(updateToken, token)) return ResponseEntity.status(401).body(Map.of("error", "invalid update token"));
    if (!version.matches("[0-9]+\\.[0-9]+\\.[0-9]+(?:\\.[0-9]+)?")) return ResponseEntity.badRequest().body(Map.of("error", "version must be numeric (for example 0.2.0)"));
    if (file.isEmpty()) return ResponseEntity.badRequest().body(Map.of("error", "empty executable"));
    Path temporary = Files.createTempFile(releases, "upload-", ".tmp");
    String sha;
    try {
      file.transferTo(temporary);
      MessageDigest digest=MessageDigest.getInstance("SHA-256");try(InputStream in=Files.newInputStream(temporary)){byte[] buffer=new byte[64*1024];for(int read;(read=in.read(buffer))!=-1;)digest.update(buffer,0,read);}sha=HexFormat.of().formatHex(digest.digest());
      Path destination = releases.resolve("AssetFlow.Agent-" + version + ".exe");
      Files.move(temporary, destination, StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE);
      db.update("INSERT INTO agent_release(version,filename,sha256,size_bytes) VALUES(?,?,?,?) ON CONFLICT(version) DO UPDATE SET filename=excluded.filename,sha256=excluded.sha256,size_bytes=excluded.size_bytes,created_at=now()", version, destination.getFileName().toString(), sha, Files.size(destination));
      return ResponseEntity.ok(Map.of("version", version, "sha256", sha, "size", Files.size(destination)));
    } finally { Files.deleteIfExists(temporary); }
  }

  @GetMapping("/api/v1/agents/updates/latest")
  public ResponseEntity<?> latest(@RequestHeader(value="Authorization", required=false) String authorization) {
    if (auth.authenticate(authorization) == null) return ResponseEntity.status(401).build();
    var rows = db.queryForList("SELECT version,sha256,size_bytes FROM agent_release ORDER BY string_to_array(version,'.')::int[] DESC,created_at DESC LIMIT 1");
    if (rows.isEmpty()) return ResponseEntity.noContent().build();
    var row = rows.getFirst();
    String version = row.get("version").toString();
    return ResponseEntity.ok(Map.of("version",version,"sha256",row.get("sha256"),"size",row.get("size_bytes"),"downloadUrl","/api/v1/agents/updates/"+version+"/download"));
  }

  @GetMapping("/api/v1/agents/updates/{version}/download")
  public ResponseEntity<?> download(@RequestHeader(value="Authorization", required=false) String authorization, @PathVariable String version) {
    if (auth.authenticate(authorization) == null) return ResponseEntity.status(401).build();
    var rows = db.queryForList("SELECT filename FROM agent_release WHERE version=?",version);
    if (rows.isEmpty()) return ResponseEntity.notFound().build();
    Path file = releases.resolve(rows.getFirst().get("filename").toString()).normalize();
    if (!file.startsWith(releases) || !Files.isRegularFile(file)) return ResponseEntity.notFound().build();
    return ResponseEntity.ok().contentType(MediaType.APPLICATION_OCTET_STREAM)
        .header(HttpHeaders.CONTENT_DISPOSITION,"attachment; filename=\"AssetFlow.Agent.exe\"")
        .contentLength(file.toFile().length()).body(new FileSystemResource(file));
  }
}

package com.assetflow.api;

import com.assetflow.service.AgentAuth;
import jakarta.servlet.http.HttpServletRequest;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.FileSystemResource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.StandardCopyOption;
import java.security.MessageDigest;
import java.util.Arrays;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
public class AgentUpdateController {
  private static final Logger security = LoggerFactory.getLogger("assetflow.security");
  static final long MAX_RELEASE_BYTES = 100L * 1024 * 1024; // CR-S05 ②
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
  public List<Map<String, Object>> list() {
    return db.queryForList("SELECT version,filename,sha256,size_bytes,release_notes,uploaded_by,created_at FROM agent_release ORDER BY string_to_array(version,'.')::int[] DESC,created_at DESC");
  }

  @GetMapping("/api/v1/admin/agent-update-history")
  public List<Map<String, Object>> history() {
    return db.queryForList("""
        SELECT h.id,a.hostname,h.from_version,h.to_version,h.event_type,h.created_at
        FROM agent_update_history h JOIN agent a ON a.id=h.agent_id
        ORDER BY h.created_at DESC,h.id DESC LIMIT 500
        """);
  }

  /** CR-002 + CR-S05: 관리자 세션(SecurityConfig) + 업데이트 토큰, 버전 불변, PE 헤더·크기·단조 증가 검사, 업로드 기록. */
  @PostMapping(value = "/api/v1/admin/agent-releases", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
  public ResponseEntity<?> upload(@RequestHeader(value = "X-Update-Token", required = false) String token,
      @RequestParam String version, @RequestParam String releaseNotes, @RequestPart MultipartFile file,
      Authentication user, HttpServletRequest req) throws Exception {
    if (!auth.secretValid(updateToken, token)) {
      security.warn("RELEASE_UPLOAD_DENIED user={} ip={} reason=token", user == null ? "-" : user.getName(), req.getRemoteAddr());
      return ResponseEntity.status(401).body(Map.of("error", "invalid update token"));
    }
    if (!version.matches("[0-9]+\\.[0-9]+\\.[0-9]+(?:\\.[0-9]+)?")) return ResponseEntity.badRequest().body(Map.of("error", "version must be numeric (for example 0.2.0)"));
    String notes = releaseNotes.trim();
    if (notes.isEmpty() || notes.length() > 2000) return ResponseEntity.badRequest().body(Map.of("error", "release notes must be between 1 and 2000 characters"));
    if (file.isEmpty()) return ResponseEntity.badRequest().body(Map.of("error", "empty executable"));
    if (file.getSize() > MAX_RELEASE_BYTES) return ResponseEntity.status(HttpStatus.PAYLOAD_TOO_LARGE).body(Map.of("error", "executable exceeds 100MB"));
    if (!db.queryForList("SELECT 1 FROM agent_release WHERE version=?", version).isEmpty())
      return ResponseEntity.status(HttpStatus.CONFLICT).body(Map.of("error", "version " + version + " already exists; releases are immutable"));
    var latest = db.queryForList("SELECT version FROM agent_release ORDER BY string_to_array(version,'.')::int[] DESC LIMIT 1");
    if (!latest.isEmpty() && compareVersions(version, latest.getFirst().get("version").toString()) <= 0)
      return ResponseEntity.badRequest().body(Map.of("error", "version must be greater than the current latest " + latest.getFirst().get("version")));
    Path temporary = Files.createTempFile(releases, "upload-" + UUID.randomUUID(), ".tmp");
    try {
      file.transferTo(temporary);
      if (!isWindowsExecutable(temporary)) return ResponseEntity.badRequest().body(Map.of("error", "file is not a Windows PE executable"));
      String sha = sha256(temporary);
      Path destination = releases.resolve("AssetFlow.Agent-" + version + ".exe");
      Files.move(temporary, destination, StandardCopyOption.ATOMIC_MOVE);
      db.update("INSERT INTO agent_release(version,filename,sha256,size_bytes,release_notes,uploaded_by,uploaded_ip) VALUES(?,?,?,?,?,?,?)",
          version, destination.getFileName().toString(), sha, Files.size(destination), notes, user == null ? null : user.getName(), req.getRemoteAddr());
      security.info("RELEASE_UPLOADED version={} sha256={} user={} ip={}", version, sha, user == null ? "-" : user.getName(), req.getRemoteAddr());
      return ResponseEntity.ok(Map.of("version", version, "sha256", sha, "size", Files.size(destination)));
    } finally { Files.deleteIfExists(temporary); }
  }

  @GetMapping("/api/v1/agents/updates/latest")
  public ResponseEntity<?> latest(@RequestHeader(value = "Authorization", required = false) String authorization) {
    UUID agentId = auth.authenticate(authorization);
    if (agentId == null) return ResponseEntity.status(401).build();
    db.update("UPDATE agent SET last_seen_at=now() WHERE id=?", agentId);
    var rows = db.queryForList("SELECT version,sha256,size_bytes FROM agent_release ORDER BY string_to_array(version,'.')::int[] DESC,created_at DESC LIMIT 1");
    if (rows.isEmpty()) return ResponseEntity.noContent().build();
    var row = rows.getFirst();
    String version = row.get("version").toString();
    return ResponseEntity.ok(Map.of("version", version, "sha256", row.get("sha256"), "size", row.get("size_bytes"), "downloadUrl", "/api/v1/agents/updates/" + version + "/download"));
  }

  @GetMapping("/api/v1/agents/updates/{version}/download")
  public ResponseEntity<?> download(@RequestHeader(value = "Authorization", required = false) String authorization, @PathVariable String version) {
    UUID agentId = auth.authenticate(authorization);
    if (agentId == null) return ResponseEntity.status(401).build();
    db.update("UPDATE agent SET last_seen_at=now() WHERE id=?", agentId);
    var rows = db.queryForList("SELECT filename FROM agent_release WHERE version=?", version);
    if (rows.isEmpty()) return ResponseEntity.notFound().build();
    Path file = releases.resolve(rows.getFirst().get("filename").toString()).normalize();
    if (!file.startsWith(releases) || !Files.isRegularFile(file)) return ResponseEntity.notFound().build();
    return ResponseEntity.ok().contentType(MediaType.APPLICATION_OCTET_STREAM)
        .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"AssetFlow.Agent.exe\"")
        .contentLength(file.toFile().length()).body(new FileSystemResource(file));
  }

  static int compareVersions(String a, String b) {
    int[] x = Arrays.stream(a.split("\\.")).mapToInt(Integer::parseInt).toArray();
    int[] y = Arrays.stream(b.split("\\.")).mapToInt(Integer::parseInt).toArray();
    for (int i = 0; i < Math.max(x.length, y.length); i++) {
      int c = Integer.compare(i < x.length ? x[i] : 0, i < y.length ? y[i] : 0);
      if (c != 0) return c;
    }
    return 0;
  }

  /** PE 파일은 'MZ'로 시작하고 0x3C 오프셋이 가리키는 위치에 'PE\0\0' 서명이 있다. */
  static boolean isWindowsExecutable(Path path) throws Exception {
    try (var raf = new java.io.RandomAccessFile(path.toFile(), "r")) {
      if (raf.length() < 64) return false;
      if (raf.read() != 'M' || raf.read() != 'Z') return false;
      raf.seek(0x3C);
      int b0 = raf.read(), b1 = raf.read(), b2 = raf.read(), b3 = raf.read();
      long offset = (b0 & 0xFFL) | ((b1 & 0xFFL) << 8) | ((b2 & 0xFFL) << 16) | ((b3 & 0xFFL) << 24);
      if (offset <= 0 || offset + 4 > raf.length()) return false;
      raf.seek(offset);
      return raf.read() == 'P' && raf.read() == 'E' && raf.read() == 0 && raf.read() == 0;
    }
  }

  private static String sha256(Path path) throws Exception {
    MessageDigest digest = MessageDigest.getInstance("SHA-256");
    try (InputStream in = Files.newInputStream(path)) {
      byte[] buffer = new byte[64 * 1024];
      for (int read; (read = in.read(buffer)) != -1;) digest.update(buffer, 0, read);
    }
    return HexFormat.of().formatHex(digest.digest());
  }
}

package com.assetflow.api;

import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.*;
import java.nio.charset.StandardCharsets;
import java.util.*;

/** 전사 주변기기·USB 현황: 모니터 대장(실사), USB 저장장치·휴대기기 사용 현황(보안 점검), CSV. */
@RestController
@RequestMapping("/api/v1")
public class PeripheralReportController {
  static final Set<String> USB_CATEGORIES = Set.of("STORAGE","MOBILE","CAMERA","PRINTER","NETWORK","SMARTCARD","AUDIO","SERIAL","BLUETOOTH","INPUT","OTHER");
  private final JdbcTemplate db;
  public PeripheralReportController(JdbcTemplate db) { this.db = db; }

  static final String PERIPHERALS = """
      SELECT p.device_type,p.name,p.manufacturer,p.model,p.serial_no,p.connection,p.size_inches,p.manufacture_year,p.first_seen_at,
             s.id asset_id,s.hostname,s.asset_tag,s.assigned_to,s.username,s.department,s.location,GREATEST(s.last_seen_at,a.last_seen_at) asset_last_seen_at
      FROM asset_peripheral p JOIN asset s ON s.id=p.asset_id JOIN agent a ON a.id=s.agent_id
      WHERE (?::text IS NULL OR p.device_type=?)
      ORDER BY CASE p.device_type WHEN 'MONITOR' THEN 0 WHEN 'KEYBOARD' THEN 1 ELSE 2 END,p.manufacturer NULLS LAST,p.name,s.hostname
      """;
  static final String USB = """
      SELECT u.category,u.name,u.manufacturer,u.vendor_id,u.product_id,u.serial_no,u.present,u.first_install_at,u.last_arrival_at,u.last_removal_at,
             s.id asset_id,s.hostname,s.asset_tag,s.assigned_to,s.username,s.department
      FROM asset_usb_device u JOIN asset s ON s.id=u.asset_id
      WHERE (?::text IS NULL OR u.category=?)
        AND (u.present OR coalesce(u.last_arrival_at,u.first_install_at,u.first_reported_at)>now()-make_interval(days=>?))
      ORDER BY u.present DESC,coalesce(u.last_arrival_at,u.first_install_at,u.first_reported_at) DESC NULLS LAST
      LIMIT 2000
      """;

  // Set.of(...).contains(null) throws NPE, so check null first (no filter = all).
  static String type(String t) { return t != null && Set.of("MONITOR","KEYBOARD","MOUSE").contains(t) ? t : null; }
  static String category(String c) { return c != null && USB_CATEGORIES.contains(c) ? c : null; }
  static int days(int d) { return Math.max(1, Math.min(d, 3650)); }

  @GetMapping("/peripherals")
  public Map<String, Object> peripherals(@RequestParam(required = false) String type) {
    String t = type(type);
    var rows = db.queryForList(PERIPHERALS, t, t);
    var summary = db.queryForMap("""
        SELECT count(*) FILTER (WHERE device_type='MONITOR') monitors,
               count(DISTINCT asset_id) FILTER (WHERE device_type='MONITOR') assets_with_monitor,
               count(*) FILTER (WHERE device_type='MONITOR' AND manufacture_year<=extract(year FROM now())-7) aged_monitors,
               count(*) FILTER (WHERE device_type='MONITOR' AND serial_no IS NULL AND connection IS DISTINCT FROM 'Internal') monitors_without_serial
        FROM asset_peripheral
        """);
    return Map.of("rows", rows, "summary", summary);
  }

  @GetMapping("/usb-devices")
  public Map<String, Object> usbDevices(@RequestParam(required = false) String category, @RequestParam(defaultValue = "30") int days) {
    String c = category(category);
    var rows = db.queryForList(USB, c, c, days(days));
    var summary = db.queryForMap("""
        SELECT count(DISTINCT asset_id) FILTER (WHERE category='STORAGE') storage_assets,
               count(*) FILTER (WHERE category='STORAGE') storage_devices,
               count(DISTINCT asset_id) FILTER (WHERE category='MOBILE') mobile_assets,
               count(*) FILTER (WHERE present) connected_now
        FROM asset_usb_device
        WHERE present OR coalesce(last_arrival_at,first_install_at,first_reported_at)>now()-make_interval(days=>?)
        """, days(days));
    return Map.of("rows", rows, "summary", summary, "days", days(days));
  }

  @GetMapping(value = "/peripherals-export.csv", produces = "text/csv;charset=UTF-8")
  public ResponseEntity<String> peripheralsCsv(@RequestParam(required = false) String type) {
    String t = type(type);
    return csv("assetflow-peripherals.csv", "구분,장치명,제조사,모델,시리얼,연결,크기(인치),제조연도,최초확인,장비명,자산태그,담당자,사용자,부서,위치",
        db.queryForList(PERIPHERALS, t, t), List.of("device_type","name","manufacturer","model","serial_no","connection","size_inches","manufacture_year","first_seen_at","hostname","asset_tag","assigned_to","username","department","location"));
  }

  @GetMapping(value = "/usb-devices-export.csv", produces = "text/csv;charset=UTF-8")
  public ResponseEntity<String> usbCsv(@RequestParam(required = false) String category, @RequestParam(defaultValue = "30") int days) {
    String c = category(category);
    return csv("assetflow-usb-devices.csv", "분류,장치명,제조사,VID,PID,시리얼,현재연결,최초설치,최근연결,최근분리,장비명,자산태그,담당자,사용자,부서",
        db.queryForList(USB, c, c, days(days)), List.of("category","name","manufacturer","vendor_id","product_id","serial_no","present","first_install_at","last_arrival_at","last_removal_at","hostname","asset_tag","assigned_to","username","department"));
  }

  static final Map<String, String> LABELS = Map.ofEntries(
      Map.entry("MONITOR", "모니터"), Map.entry("KEYBOARD", "키보드"), Map.entry("MOUSE", "마우스"),
      Map.entry("STORAGE", "저장장치"), Map.entry("MOBILE", "휴대기기"), Map.entry("CAMERA", "카메라"), Map.entry("PRINTER", "프린터"),
      Map.entry("NETWORK", "네트워크"), Map.entry("SMARTCARD", "스마트카드"), Map.entry("AUDIO", "오디오"), Map.entry("SERIAL", "시리얼"),
      Map.entry("BLUETOOTH", "블루투스"), Map.entry("INPUT", "입력장치"), Map.entry("OTHER", "기타"), Map.entry("Internal", "내장"));
  static final java.time.format.DateTimeFormatter KST = java.time.format.DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm").withZone(java.time.ZoneId.of("Asia/Seoul"));

  /** 엑셀에서 바로 읽히도록: 시각은 한국시간, 참/거짓은 예/아니오, 코드값은 한국어 라벨. */
  static Object display(String field, Object v) {
    if (v instanceof java.sql.Timestamp t) return KST.format(t.toInstant());
    if (v instanceof java.time.OffsetDateTime t) return KST.format(t.toInstant());
    if (v instanceof Boolean b) return b ? "예" : "아니오";
    if (v != null && Set.of("device_type", "category", "connection").contains(field)) return LABELS.getOrDefault(v.toString(), v.toString());
    return v;
  }

  static ResponseEntity<String> csv(String filename, String header, List<Map<String, Object>> rows, List<String> fields) {
    StringBuilder out = new StringBuilder(header).append('\n');
    for (var row : rows) {
      for (int i = 0; i < fields.size(); i++) { if (i > 0) out.append(','); String f = fields.get(i); out.append(AssetController.csv(display(f, row.get(f)))); }
      out.append('\n');
    }
    return ResponseEntity.ok().header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=" + filename)
        .contentType(new MediaType("text", "csv", StandardCharsets.UTF_8)).body("﻿" + out);
  }
}

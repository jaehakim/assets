package com.assetflow.api;

import com.assetflow.service.AgentAuth;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import java.math.BigDecimal;
import java.sql.Timestamp;
import java.time.OffsetDateTime;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.mockito.ArgumentMatchers.*;

/** Agent 0.2.13 주변기기(모니터·키보드·마우스) 수집 반영 규칙. */
class AgentControllerTest {
  static final UUID AGENT = UUID.randomUUID(), ASSET = UUID.randomUUID();
  static final Models.Peripheral MONITOR = new Models.Peripheral("MONITOR", "DELL P2419H", "Dell", "DEL4123", "CN0ABC123", "DisplayPort", null, null, 2021, new BigDecimal("24.0"), "DISPLAY\\DEL4123\\1");
  static final Models.Peripheral MOUSE = new Models.Peripheral("MOUSE", "G502 HERO", "Logitech", "VID_046D&PID_C08B", null, "USB", "046D", "C08B", null, null, "HID\\VID_046D&PID_C08B\\1");

  static Models.Inventory inventory(List<Models.Peripheral> peripherals) { return inventory(peripherals, null, null); }
  static Models.Inventory inventory(List<Models.Peripheral> peripherals, List<Models.UsbDevice> usb, List<String> errors) {
    return new Models.Inventory("PC-01", null, null, null, null, null, null, null, null, "Windows 11", "10.0", null, null, null, null,
        null, null, null, null, null, null, null, null, null, "Healthy", null, null, null, null, List.of(), List.of(), peripherals, usb, errors);
  }
  static final OffsetDateTime T = OffsetDateTime.parse("2026-11-20T09:00:00Z");
  static final Models.UsbDevice STICK = new Models.UsbDevice("USB\\VID_0781&PID_5581\\4C53", "STORAGE", "SanDisk Ultra Fit", "SanDisk", "0781", "5581", "4C53", "USB", "USBSTOR", false, T, T, T);
  static final Models.UsbDevice CAM = new Models.UsbDevice("USB\\VID_046D&PID_085B\\8B2D", "CAMERA", "Logitech C925e", "Logitech", "046D", "085B", "8B2D", "USB", "usbccgp", true, T, T, null);

  @SuppressWarnings("unchecked")
  static JdbcTemplate db(List<Map<String, Object>> previous, boolean collectedBefore) {
    JdbcTemplate db = mock(JdbcTemplate.class);
    when(db.query(startsWith("SELECT id FROM asset"), any(RowMapper.class), eq(AGENT))).thenReturn(List.of(ASSET));
    when(db.queryForList(startsWith("SELECT device_type,name"), eq(ASSET))).thenReturn(previous);
    when(db.queryForObject(contains("peripherals_collected_at IS NOT NULL"), eq(Boolean.class), eq(ASSET))).thenReturn(collectedBefore);
    return db;
  }

  static AgentController controller(JdbcTemplate db) {
    AgentAuth auth = mock(AgentAuth.class);
    when(auth.authenticate("Bearer t")).thenReturn(AGENT);
    return new AgentController(db, auth, 2000);
  }

  @Test void olderAgentWithoutPeripheralsKeepsExistingList() {
    JdbcTemplate db = db(List.of(), true);
    assertEquals(202, controller(db).inventory("Bearer t", inventory(null)).getStatusCode().value());
    verify(db, never()).update(contains("asset_peripheral"), any(Object[].class));
    verify(db, never()).update(contains("peripherals_collected_at=now()"), any(Object[].class));
  }

  @Test void firstReportStoresDevicesWithoutHistory() {
    JdbcTemplate db = db(List.of(), false);
    controller(db).inventory("Bearer t", inventory(List.of(MONITOR, MOUSE)));
    verify(db).update(eq("DELETE FROM asset_peripheral WHERE asset_id=?"), eq(ASSET));
    verify(db).update(contains("INSERT INTO asset_peripheral"), eq(ASSET), eq("MONITOR"), eq("DELL P2419H"), eq("Dell"), eq("DEL4123"), eq("CN0ABC123"),
        eq("DisplayPort"), isNull(), isNull(), eq(2021), eq(new BigDecimal("24.0")), eq("DISPLAY\\DEL4123\\1"), isNull());
    verify(db, times(2)).update(contains("INSERT INTO asset_peripheral"), any(Object[].class));
    verify(db, never()).update(contains("PERIPHERAL_CHANGED"), any(Object[].class));
    verify(db).update("UPDATE asset SET peripherals_collected_at=now() WHERE id=?", ASSET);
  }

  @Test void monitorSwapIsRecordedAndUnchangedDeviceKeepsFirstSeen() {
    Timestamp since = Timestamp.valueOf("2026-11-01 09:00:00");
    var oldMonitor = new HashMap<String, Object>(Map.of("device_type", "MONITOR", "name", "LG 24MK430H", "manufacturer", "LG Electronics", "model", "GSM5B7F", "serial_no", "OLD123", "first_seen_at", since));
    var mouse = new HashMap<String, Object>(Map.of("device_type", "MOUSE", "name", "G502 HERO", "manufacturer", "Logitech", "model", "VID_046D&PID_C08B", "first_seen_at", since));
    mouse.put("serial_no", null);
    JdbcTemplate db = db(List.of(oldMonitor, mouse), true);
    controller(db).inventory("Bearer t", inventory(List.of(MONITOR, MOUSE)));
    verify(db).update(contains("INSERT INTO asset_peripheral"), eq(ASSET), eq("MOUSE"), eq("G502 HERO"), any(), any(), isNull(), any(), any(), any(), isNull(), isNull(), any(), eq(since));
    verify(db).update(contains("PERIPHERAL_CHANGED"), eq(ASSET), eq("주변기기 연결: 모니터 DELL P2419H (S/N CN0ABC123) / 주변기기 분리: 모니터 LG 24MK430H (S/N OLD123)"));
  }

  @Test void usbDevicesAreUpsertedNeverDeletedAndNewStorageIsRecorded() {
    JdbcTemplate db = db(List.of(), true);
    when(db.queryForObject(contains("usb_collected_at IS NOT NULL"), eq(Boolean.class), eq(ASSET))).thenReturn(true);
    when(db.queryForObject(contains("INSERT INTO asset_usb_device"), eq(Boolean.class), any(Object[].class))).thenReturn(true, false);
    controller(db).inventory("Bearer t", inventory(null, List.of(STICK, CAM), null));
    verify(db).update("UPDATE asset_usb_device SET present=false WHERE asset_id=?", ASSET);
    verify(db, never()).update(startsWith("DELETE FROM asset_usb_device"), any(Object[].class));
    verify(db).queryForObject(contains("ON CONFLICT(asset_id,device_id)"), eq(Boolean.class), eq(ASSET), eq("USB\\VID_0781&PID_5581\\4C53"), eq("STORAGE"), eq("SanDisk Ultra Fit"),
        eq("SanDisk"), eq("0781"), eq("5581"), eq("4C53"), eq("USB"), eq("USBSTOR"), eq(false), eq(T), eq(T), eq(T));
    verify(db).update(contains("USB_DEVICE_FIRST_SEEN"), eq(ASSET), eq("새 USB 장치 연결 기록: USB 저장장치 SanDisk Ultra Fit (S/N 4C53)"));
    verify(db).update("UPDATE asset SET usb_collected_at=now() WHERE id=?", ASSET);
    verify(db).update("UPDATE asset SET collection_errors=? WHERE id=?", null, ASSET);
  }

  @Test void firstUsbReportDoesNotFloodHistoryAndOldAgentKeepsUsbRows() {
    JdbcTemplate db = db(List.of(), false);
    when(db.queryForObject(contains("usb_collected_at IS NOT NULL"), eq(Boolean.class), eq(ASSET))).thenReturn(false);
    when(db.queryForObject(contains("INSERT INTO asset_usb_device"), eq(Boolean.class), any(Object[].class))).thenReturn(true);
    controller(db).inventory("Bearer t", inventory(null, List.of(STICK), null));
    verify(db, never()).update(contains("USB_DEVICE_FIRST_SEEN"), any(Object[].class));
    JdbcTemplate old = db(List.of(), true);
    controller(old).inventory("Bearer t", inventory(null));
    verify(old, never()).update(contains("asset_usb_device"), any(Object[].class));
    verify(old, never()).queryForObject(contains("asset_usb_device"), eq(Boolean.class), any(Object[].class));
  }

  @Test void collectionErrorsAreStoredForRemoteDiagnosis() {
    JdbcTemplate db = db(List.of(), true);
    controller(db).inventory("Bearer t", inventory(null, null, List.of("peripherals: ManagementException InvalidQuery", "usb: Win32Exception 5")));
    verify(db).update("UPDATE asset SET collection_errors=? WHERE id=?", "peripherals: ManagementException InvalidQuery | usb: Win32Exception 5", ASSET);
  }

  @Test void changeDetailsIgnoresUnchangedAndTruncates() {
    assertNull(AgentController.changeDetails(Map.of("a", "x"), Map.of("a", "x")));
    assertEquals("주변기기 분리: 마우스 M", AgentController.changeDetails(Map.of("a", "마우스 M"), Map.of()));
    var many = new LinkedHashMap<String, String>();
    for (int i = 0; i < 64; i++) many.put("k" + i, "모니터 " + "N".repeat(60) + i);
    assertEquals(2000, AgentController.changeDetails(Map.of(), many).length());
  }

  @Test void serialIdentifiesMonitorEvenWhenNameChanges() {
    assertEquals(AgentController.peripheralKey("MONITOR", "Dell", "DEL4123", "SN1", "DELL P2419H"), AgentController.peripheralKey("MONITOR", "Dell", "DEL4123", "SN1", "Dell 4123"));
    assertNotEquals(AgentController.peripheralKey("MOUSE", "Logitech", "VID", null, "A"), AgentController.peripheralKey("MOUSE", "Logitech", "VID", null, "B"));
    assertEquals("모니터 DELL (S/N 1)", AgentController.describe("MONITOR", "DELL", "1"));
    assertEquals("키보드 K", AgentController.describe("KEYBOARD", "K", null));
  }
}

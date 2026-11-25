package com.assetflow.api;

import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

public final class Models {
  private Models() {}

  // CR-S07 ③: 모든 문자열 필드에 DB 컬럼 길이와 같은 상한을 둔다 (초과 시 422).
  public record Register(@NotBlank @Size(max = 100) String agentKey, @NotBlank @Size(max = 255) String hostname, @NotBlank @Size(max = 30) String version) {}
  public record Registered(UUID agentId, String deviceToken) {}
  public record Heartbeat(@NotBlank @Size(max = 30) String version) {}
  /** Agent 0.3.0: PC에서 보낸 제거 요청 / 제거 완료 보고. */
  public record UninstallRequest(@Size(max = 500) String reason, @Size(max = 255) String requestedBy) {}
  public record UninstallComplete(Long requestId, @NotBlank @Pattern(regexp = "APPROVED|CODE") String method) {}
  /** Agent 0.3.1: 설치·업데이트 전/후 점검 한 항목(PASS/WARN/FAIL). */
  public record InstallCheck(@NotBlank @Size(max = 60) String name, @NotBlank @Pattern(regexp = "PASS|WARN|FAIL") String status, @Size(max = 300) String detail) {}
  /** Agent 0.3.1: 설치·업데이트 점검 보고. PRECHECK는 PASSED/BLOCKED, POSTCHECK는 INSTALLED/ROLLED_BACK/FAILED. */
  public record InstallReport(
      @NotBlank @Pattern(regexp = "UPDATE|INSTALL|REPAIR") String kind,
      @NotBlank @Pattern(regexp = "PRECHECK|POSTCHECK") String stage,
      @NotBlank @Pattern(regexp = "PASSED|BLOCKED|INSTALLED|ROLLED_BACK|FAILED") String result,
      @Size(max = 30) String fromVersion,
      @NotBlank @Size(max = 30) String toVersion,
      @Size(max = 40) List<@Valid InstallCheck> checks,
      @Size(max = 1000) String summary,
      OffsetDateTime checkedAt) {}
  public record Disk(@Size(max = 100) String name, @Size(max = 50) String filesystem, long totalBytes, long freeBytes) {}
  public record Software(@NotBlank @Size(max = 500) String name, @Size(max = 100) String version, @Size(max = 255) String publisher, @Size(max = 20) String installDate) {}
  /** Agent 0.2.13: 모니터·키보드·마우스. model은 모니터 EDID 제품코드 또는 VID/PID. */
  public record Peripheral(
      @NotBlank @Pattern(regexp = "MONITOR|KEYBOARD|MOUSE") String type, @NotBlank @Size(max = 255) String name,
      @Size(max = 255) String manufacturer, @Size(max = 100) String model, @Size(max = 100) String serialNo, @Size(max = 50) String connection,
      @Size(max = 8) String vendorId, @Size(max = 8) String productId, @Min(1990) @Max(2100) Integer manufactureYear, @DecimalMin("0.0") @DecimalMax("999.9") BigDecimal sizeInches, @Size(max = 500) String deviceId) {}
  /** Agent 0.2.14: USB 열거자에 기록된 장치. present=false는 과거 연결. */
  public record UsbDevice(
      @NotBlank @Size(max = 500) String deviceId,
      @NotBlank @Pattern(regexp = "STORAGE|MOBILE|CAMERA|PRINTER|NETWORK|SMARTCARD|AUDIO|SERIAL|BLUETOOTH|INPUT|OTHER") String category,
      @NotBlank @Size(max = 255) String name, @Size(max = 255) String manufacturer, @Size(max = 8) String vendorId, @Size(max = 8) String productId,
      @Size(max = 255) String serialNo, @Size(max = 100) String deviceClass, @Size(max = 100) String service, Boolean present,
      OffsetDateTime firstInstallAt, OffsetDateTime lastArrivalAt, OffsetDateTime lastRemovalAt) {}
  public record Inventory(
      @NotBlank @Size(max = 255) String hostname, @Size(max = 255) String serialNo, @Size(max = 255) String manufacturer, @Size(max = 255) String model,
      @Size(max = 100) String deviceUuid, @Size(max = 255) String domainName, Boolean domainJoined,
      @Size(max = 255) String username, @Size(max = 255) String department,
      @Size(max = 255) String osName, @Size(max = 100) String osVersion, @Size(max = 100) String osBuild, @Size(max = 50) String osArchitecture,
      OffsetDateTime osInstalledAt, OffsetDateTime lastBootAt,
      @Size(max = 255) String cpuName, Integer cpuCores, Integer cpuLogicalProcessors,
      Long memoryBytes, // CR-022: 수집 실패 시 null
      @Size(max = 255) String biosVersion, @Size(max = 64) String ipAddress, @Size(max = 64) String macAddress,
      Boolean bitlockerEnabled, Boolean firewallEnabled, @Size(max = 50) String antivirusStatus,
      Boolean tpmPresent, Boolean tpmEnabled, @Size(max = 50) String tpmVersion, Boolean secureBootEnabled,
      @Size(max = 64) List<@Valid Disk> disks, // CR-S07: 디스크 64개 상한
      List<@Valid Software> software,
      @Size(max = 64) List<@Valid Peripheral> peripherals, // null = 구버전 Agent 또는 수집 실패 → 기존 목록 유지
      @Size(max = 300) List<@Valid UsbDevice> usbDevices, // null = 구버전 Agent 또는 수집 실패 → 기존 목록 유지
      @Size(max = 10) List<@Size(max = 300) String> collectionErrors) {}
  public record AssetManagement(
      @Size(max = 100) String assetTag, @Size(max = 30) String lifecycleStatus, @Size(max = 100) String category, @Size(max = 255) String location,
      @Size(max = 255) String assignedTo, @Size(max = 255) String vendor, LocalDate purchaseDate, BigDecimal purchaseCost,
      LocalDate warrantyExpiresAt, LocalDate eolAt, LocalDate lastAuditAt, LocalDate nextAuditAt, @Size(max = 4000) String managementNotes) {}
}

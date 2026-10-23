package com.assetflow.api;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
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
  public record Disk(@Size(max = 100) String name, @Size(max = 50) String filesystem, long totalBytes, long freeBytes) {}
  public record Software(@NotBlank @Size(max = 500) String name, @Size(max = 100) String version, @Size(max = 255) String publisher, @Size(max = 20) String installDate) {}
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
      List<@Valid Software> software) {}
  public record AssetManagement(
      @Size(max = 100) String assetTag, @Size(max = 30) String lifecycleStatus, @Size(max = 100) String category, @Size(max = 255) String location,
      @Size(max = 255) String assignedTo, @Size(max = 255) String vendor, LocalDate purchaseDate, BigDecimal purchaseCost,
      LocalDate warrantyExpiresAt, LocalDate eolAt, LocalDate lastAuditAt, LocalDate nextAuditAt, @Size(max = 4000) String managementNotes) {}
}

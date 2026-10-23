package com.assetflow.api;

import org.junit.jupiter.api.Test;
import java.nio.file.Files;
import java.nio.file.Path;
import static org.junit.jupiter.api.Assertions.*;

class AgentUpdateControllerTest {
  @Test void versionComparisonIsNumeric() {
    assertTrue(AgentUpdateController.compareVersions("0.2.10", "0.2.9") > 0);
    assertTrue(AgentUpdateController.compareVersions("0.3.0", "0.2.11") > 0);
    assertEquals(0, AgentUpdateController.compareVersions("1.0.0", "1.0.0.0"));
    assertTrue(AgentUpdateController.compareVersions("0.2.9", "0.2.10") < 0);
  }
  // CR-S05 ②
  @Test void rejectsNonPeFilesAndAcceptsMinimalPeHeader() throws Exception {
    Path text = Files.createTempFile("af", ".exe");
    Files.writeString(text, "this is not an executable, just text long enough to exceed sixty four bytes of content");
    assertFalse(AgentUpdateController.isWindowsExecutable(text));
    byte[] pe = new byte[128];
    pe[0] = 'M'; pe[1] = 'Z'; pe[0x3C] = 0x40; pe[0x40] = 'P'; pe[0x41] = 'E';
    Path exe = Files.createTempFile("af", ".exe");
    Files.write(exe, pe);
    assertTrue(AgentUpdateController.isWindowsExecutable(exe));
    Files.deleteIfExists(text); Files.deleteIfExists(exe);
  }
}

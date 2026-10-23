package com.assetflow.api;

import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import java.util.List;
import java.util.Map;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.mockito.ArgumentMatchers.*;

class AssetControllerTest {
  @Test void dashboardTreatsUnknownEncryptionAsRequiringReview() {
    JdbcTemplate db = mock(JdbcTemplate.class);
    when(db.queryForObject(anyString(), eq(Integer.class))).thenReturn(0);
    when(db.queryForObject("SELECT count(*) FROM asset WHERE bitlocker_enabled IS DISTINCT FROM true", Integer.class)).thenReturn(2);
    var result = new AssetController(db).dashboard();
    assertEquals(2, ((Map<?,?>)result.get("security")).get("bitlocker"));
  }
  @Test void inventoryIncludesSecurityFieldsForActionFilters() {
    JdbcTemplate db = mock(JdbcTemplate.class);
    var rows = List.<Map<String,Object>>of(Map.of("hostname","PC-01","bitlocker_enabled",false,"antivirus_status","Unknown"));
    when(db.queryForList(anyString(), any(Object[].class))).thenReturn(rows);
    assertEquals(rows, new AssetController(db).assets("PC"));
    verify(db).queryForList(contains("s.bitlocker_enabled,s.antivirus_status"), eq("%PC%"), eq("%PC%"), eq("%PC%"), eq("%PC%"), eq("%PC%"));
  }
  // CR-A10
  @Test void searchEscapesLikeWildcards() {
    assertEquals("%50\\%%", AssetController.like("50%"));
    assertEquals("%a\\_b%", AssetController.like("a_b"));
    assertEquals("%c:\\\\x%", AssetController.like("c:\\x"));
    assertEquals("%%", AssetController.like(null));
  }
  // CR-012
  @Test void csvEscapesFormulaTriggers() {
    assertEquals("\"'=1+1\"", AssetController.csv("=1+1"));
    assertEquals("\"'+SUM(A1)\"", AssetController.csv("+SUM(A1)"));
    assertEquals("\"'-1\"", AssetController.csv("-1"));
    assertEquals("\"'@cmd\"", AssetController.csv("@cmd"));
    assertEquals("\"'\tx\"", AssetController.csv("\tx"));
    assertEquals("\"PC-01\"", AssetController.csv("PC-01"));
    assertEquals("\"a\"\"b\"", AssetController.csv("a\"b"));
    assertEquals("\"\"", AssetController.csv(null));
  }
}

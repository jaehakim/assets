package com.assetflow;

import net.javacrumbs.shedlock.spring.annotation.EnableSchedulerLock;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableScheduling;

@EnableScheduling
@EnableSchedulerLock(defaultLockAtMostFor = "PT30M") // CR-027
@SpringBootApplication
public class AssetFlowApplication {
  public static void main(String[] args) { SpringApplication.run(AssetFlowApplication.class, args); }
}

package com.assetflow.service;

import com.fasterxml.jackson.databind.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import javax.net.ssl.*;
import java.io.*;
import java.net.URI;
import java.net.http.*;
import java.nio.file.*;
import java.security.KeyStore;
import java.security.cert.CertificateFactory;
import java.time.Duration;
import java.util.*;

@Service
public class K3sInspectionService {
  private static final Path TOKEN=Path.of("/var/run/secrets/kubernetes.io/serviceaccount/token");
  private static final Path CA=Path.of("/var/run/secrets/kubernetes.io/serviceaccount/ca.crt");
  private final ObjectMapper json;
  private final String namespace;
  private final String gitSha;

  public K3sInspectionService(ObjectMapper json,@Value("${KUBERNETES_NAMESPACE:assetflow}")String namespace,@Value("${DEPLOY_GIT_SHA:local}")String gitSha){this.json=json;this.namespace=namespace;this.gitSha=gitSha;}

  public Snapshot inspect(){
    if(!Files.isRegularFile(TOKEN))return standalone();
    try{
      HttpClient client=client();String token=Files.readString(TOKEN).trim();
      JsonNode nodes=get(client,token,"/api/v1/nodes").path("items");
      JsonNode node=nodes.isArray()&&nodes.size()>0?nodes.get(0):json.createObjectNode();
      String nodeName=node.path("metadata").path("name").asText("unknown");
      String version=node.path("status").path("nodeInfo").path("kubeletVersion").asText("unknown");
      boolean ready=false,diskPressure=false;
      for(JsonNode c:node.path("status").path("conditions")){if("Ready".equals(c.path("type").asText()))ready="True".equals(c.path("status").asText());if("DiskPressure".equals(c.path("type").asText()))diskPressure="True".equals(c.path("status").asText());}
      JsonNode capacity=node.path("status").path("capacity"),allocatable=node.path("status").path("allocatable");
      String memoryCapacity=capacity.path("memory").asText("unknown");
      String storageCapacity=capacity.path("ephemeral-storage").asText("unknown");
      String storageAllocatable=allocatable.path("ephemeral-storage").asText("unknown");
      String cpuUsage="unknown",memoryUsage="unknown";
      try{JsonNode metrics=get(client,token,"/apis/metrics.k8s.io/v1beta1/nodes/"+nodeName);cpuUsage=metrics.path("usage").path("cpu").asText("unknown");memoryUsage=metrics.path("usage").path("memory").asText("unknown");}catch(Exception ignored){}
      double usedCores=cpuCores(cpuUsage),totalCores=cpuCores(capacity.path("cpu").asText("0"));
      cpuUsage=usedCores>=0&&totalCores>0?String.format(Locale.US,"%.1f%% (%.2f cores)",usedCores/totalCores*100,usedCores):cpuUsage;
      long usedMemory=bytes(memoryUsage),totalMemory=bytes(memoryCapacity);
      memoryUsage=usedMemory>=0?formatBytes(usedMemory)+(totalMemory>0?String.format(Locale.US," (%.1f%%)",usedMemory*100d/totalMemory):""):memoryUsage;
      memoryCapacity=totalMemory>=0?formatBytes(totalMemory):memoryCapacity;
      long totalStorage=bytes(storageCapacity),freeStorage=bytes(storageAllocatable);
      storageCapacity=totalStorage>=0?formatBytes(totalStorage):storageCapacity;
      storageAllocatable=freeStorage>=0?formatBytes(freeStorage):storageAllocatable;
      JsonNode pods=get(client,token,"/api/v1/namespaces/"+namespace+"/pods").path("items");int podTotal=0,podReady=0,restarts=0;
      for(JsonNode pod:pods){if(!pod.path("metadata").path("deletionTimestamp").isMissingNode())continue;podTotal++;boolean allReady=true;JsonNode statuses=pod.path("status").path("containerStatuses");if(!statuses.isArray()||statuses.isEmpty())allReady=false;for(JsonNode s:statuses){allReady&=s.path("ready").asBoolean(false);restarts+=s.path("restartCount").asInt(0);}if(allReady)podReady++;}
      JsonNode deployments=get(client,token,"/apis/apps/v1/namespaces/"+namespace+"/deployments").path("items");int backendReady=0,frontendReady=0;
      for(JsonNode d:deployments){String name=d.path("metadata").path("name").asText();int available=d.path("status").path("availableReplicas").asInt(0);if("backend".equals(name))backendReady=available;if("frontend".equals(name))frontendReady=available;}
      return new Snapshot("k3s",nodeName,ready,version,cpuUsage,memoryUsage,memoryCapacity,storageCapacity,storageAllocatable,diskPressure,podTotal,podReady,restarts,backendReady,frontendReady,gitSha,null);
    }catch(Exception e){return new Snapshot("k3s","unknown",false,"unknown","unknown","unknown","unknown","unknown","unknown",false,0,0,0,0,0,gitSha,e.getClass().getSimpleName()+": "+e.getMessage());}
  }

  private Snapshot standalone(){long max=Runtime.getRuntime().maxMemory(),used=Runtime.getRuntime().totalMemory()-Runtime.getRuntime().freeMemory();return new Snapshot("standalone",System.getenv().getOrDefault("HOSTNAME","local"),true,"n/a","n/a",used+"B",max+"B","unknown","unknown",false,1,1,0,1,1,gitSha,"Kubernetes ServiceAccount 없음");}
  private JsonNode get(HttpClient client,String token,String path)throws Exception{HttpRequest req=HttpRequest.newBuilder(URI.create("https://kubernetes.default.svc"+path)).timeout(Duration.ofSeconds(5)).header("Authorization","Bearer "+token).build();HttpResponse<String> res=client.send(req,HttpResponse.BodyHandlers.ofString());if(res.statusCode()/100!=2)throw new IOException("Kubernetes API HTTP "+res.statusCode());return json.readTree(res.body());}
  private HttpClient client()throws Exception{CertificateFactory factory=CertificateFactory.getInstance("X.509");KeyStore store=KeyStore.getInstance(KeyStore.getDefaultType());store.load(null);try(InputStream in=Files.newInputStream(CA)){store.setCertificateEntry("kubernetes",factory.generateCertificate(in));}TrustManagerFactory tm=TrustManagerFactory.getInstance(TrustManagerFactory.getDefaultAlgorithm());tm.init(store);SSLContext ssl=SSLContext.getInstance("TLS");ssl.init(null,tm.getTrustManagers(),null);return HttpClient.newBuilder().sslContext(ssl).connectTimeout(Duration.ofSeconds(5)).build();}
  private static double cpuCores(String value){try{if(value.endsWith("n"))return Double.parseDouble(value.substring(0,value.length()-1))/1_000_000_000d;if(value.endsWith("m"))return Double.parseDouble(value.substring(0,value.length()-1))/1000d;return Double.parseDouble(value);}catch(Exception e){return-1;}}
  private static long bytes(String value){try{String[] units={"Ki","Mi","Gi","Ti"};for(int i=0;i<units.length;i++)if(value.endsWith(units[i]))return Math.round(Double.parseDouble(value.substring(0,value.length()-2))*Math.pow(1024,i+1));return Long.parseLong(value);}catch(Exception e){return-1;}}
  private static String formatBytes(long value){if(value<1024L*1024*1024)return String.format(Locale.US,"%.0f MB",value/1024d/1024);return String.format(Locale.US,"%.1f GB",value/1024d/1024/1024);}
  public record Snapshot(String platform,String nodeName,boolean nodeReady,String k3sVersion,String cpuUsage,String memoryUsage,String memoryCapacity,String storageCapacity,String storageAllocatable,boolean diskPressure,int podTotal,int podReady,int podRestarts,int backendReady,int frontendReady,String gitSha,String error){}
}

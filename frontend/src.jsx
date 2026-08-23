import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import mermaid from "mermaid";
import "./style.css";
import "./operations.css";
import "./asset-detail.css";
import "./admin-kit.css";
import "./lifecycle.css";
import "./login-pro.css";
import "./control-room.css";
import "./monitoring.css";
import "./console-kit.css";
const menuGroups = [
  {
    label: "OVERVIEW",
    items: [
      { name: "대시보드", icon: "⌂" },
      { name: "자산 관리", icon: "▣" },
    ],
  },
  {
    label: "AGENT MANAGEMENT",
    items: [
      { name: "Agent 배포", icon: "⇧" },
      { name: "업데이트 이력", icon: "↻" },
    ],
  },
  {
    label: "OPERATIONS",
    items: [
      { name: "시스템 가이드", icon: "◇" },
      { name: "서버 모니터링", icon: "▥" },
      { name: "점검 일지", icon: "✓" },
    ],
  },
];
async function api(url, options = {}) {
  const r = await fetch(url, {
    ...options,
    headers: {
      ...(options.body instanceof FormData
        ? {}
        : { "Content-Type": "application/json" }),
      ...options.headers,
    },
  });
  if (r.status === 401)
    throw Object.assign(new Error("unauthorized"), { status: 401 });
  if (!r.ok) throw new Error((await r.text()) || `HTTP ${r.status}`);
  return r.status === 204 ? null : r.json();
}
function Login({ onLogin }) {
  const [u, setU] = useState(""),
    [p, setP] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [showPassword, setShowPassword] = useState(false);
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      onLogin(
        await api("/api/v1/auth/login", {
          method: "POST",
          body: JSON.stringify({ username: u, password: p }),
        }),
      );
    } catch (e) {
      setError(
        e.status === 401
          ? "아이디 또는 비밀번호를 확인하세요."
          : "서버에 연결할 수 없습니다.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="login">
      <section className="login-visual">
        <div className="brand">
          <b>A</b> AssetFlow
        </div>
        <div>
          <span className="login-kicker">IT OPERATIONS CENTER</span>
          <h2>
            IT 자산 운영의 기준을
            <br />
            하나의 화면에.
          </h2>
          <p>
            수집부터 보안, 생애주기와 시스템 운영까지 신뢰할 수 있는 데이터로
            관리하세요.
          </p>
          <div className="ops-console" aria-label="AssetFlow 시스템 구성">
            <div className="console-head"><span><i/><i/><i/></span><b>assetflow / operations</b><em>LIVE</em></div>
            <div className="topology">
              <div className="topology-node endpoint"><i>PC</i><span><b>Endpoints</b><small>Windows Agent</small></span></div>
              <div className="topology-line"><i/></div>
              <div className="topology-node core"><i>AF</i><span><b>AssetFlow</b><small>Inventory API</small></span></div>
              <div className="topology-line"><i/></div>
              <div className="topology-node storage"><i>DB</i><span><b>PostgreSQL</b><small>Asset data</small></span></div>
            </div>
            <div className="console-metrics"><span><small>PLATFORM</small><b>k3s</b></span><span><small>WORKLOAD</small><b>2 + 2 Pods</b></span><span><small>SECURITY</small><b className="healthy">Protected</b></span></div>
            <code><span>$</span> assetflow status --watch <em>inventory synchronized</em></code>
          </div>
          <div className="login-capabilities">
            <div><i>01</i><span><b>Asset Intelligence</b><small>장비·사용자·소프트웨어 통합 인벤토리</small></span></div>
            <div><i>02</i><span><b>Security Posture</b><small>암호화·백신·보안 기준 상태 추적</small></span></div>
            <div><i>03</i><span><b>Lifecycle Control</b><small>도입부터 실사·보증·폐기까지 관리</small></span></div>
          </div>
          <div className="login-live"><span><i /> ALL SYSTEMS OPERATIONAL</span><small>Secure IT operations workspace</small></div>
        </div>
        <small>© 2026 AssetFlow · Enterprise Asset Intelligence</small>
      </section>
      <form onSubmit={submit}>
        <div className="access-terminal-bar"><span><i /> SECURE ACCESS NODE</span><b>AF-OPS / 01</b></div>
        <div className="brand">
          <b>A</b> AssetFlow
        </div>
        <span className="form-kicker">ASSETFLOW CONTROL PLANE</span>
        <h1>IT 운영 관리자 접속</h1>
        <p>자산 인벤토리와 시스템 운영 환경에 안전하게 접속합니다.</p>
        <div className="secure-notice"><i>✓</i><span><b>보호된 관리 환경</b><small>인증 정보는 암호화된 연결로 전송됩니다.</small></span></div>
        <label>
          <span>관리자 아이디</span>
          <input
            autoFocus
            autoComplete="username"
            value={u}
            onChange={(e) => setU(e.target.value)}
            placeholder="아이디를 입력하세요"
            required
          />
        </label>
        <label>
          <span>비밀번호</span>
          <div className="password-field"><input type={showPassword ? "text" : "password"} autoComplete="current-password" value={p} onChange={(e) => setP(e.target.value)} placeholder="비밀번호를 입력하세요" required /><button type="button" onClick={() => setShowPassword(x => !x)} aria-label={showPassword ? "비밀번호 숨기기" : "비밀번호 보기"}>{showPassword ? "숨김" : "보기"}</button></div>
        </label>
        {error && <div className="loginerror" role="alert"><b>!</b>{error}</div>}
        <button className="login-submit" disabled={busy}>{busy ? <><i className="login-spinner" /> 인증 확인 중…</> : <>관리자 로그인 <span>→</span></>}</button>
        <div className="access-meta"><span><small>PROTOCOL</small><b>TLS / HTTPS</b></span><span><small>AUTH SCOPE</small><b>ADMINISTRATOR</b></span><span><small>SESSION</small><b>AUDIT ENABLED</b></span></div>
        <div className="login-help"><span>로그인에 문제가 있나요?</span><small>시스템 담당자에게 계정 상태를 문의하세요.</small></div>
      </form>
    </div>
  );
}
function Diagram({ children }) {
  const ref = useRef();
  useEffect(() => {
    mermaid.initialize({
      startOnLoad: false,
      theme: "base",
      securityLevel: "strict",
      themeVariables: {
        primaryColor: "#eef0ff",
        primaryTextColor: "#182033",
        primaryBorderColor: "#5368e8",
        lineColor: "#718096",
        secondaryColor: "#e9f8f3",
        tertiaryColor: "#fff",
      },
    });
    mermaid
      .render("flow-" + Math.random().toString(36).slice(2), children)
      .then(({ svg }) => {
        if (ref.current) ref.current.innerHTML = svg;
      });
  }, [children]);
  return <div className="diagram" ref={ref} />;
}
function ReleaseList() {
  const [rows, setRows] = useState([]),
    [error, setError] = useState("");
  async function load() {
    try {
      setRows(await api("/api/v1/admin/agent-releases"));
      setError("");
    } catch (e) {
      setError(e.message);
    }
  }
  useEffect(() => {
    load();
    window.addEventListener("agent-release-updated", load);
    return () => window.removeEventListener("agent-release-updated", load);
  }, []);
  return (
    <div className="releaselist">
      <h3>등록된 Agent 버전</h3>
      {error ? (
        <p className="result">목록 조회 실패: {error}</p>
      ) : (
        <table className="settings">
          <thead>
            <tr>
              <th>버전</th>
              <th>파일</th>
              <th>크기</th>
              <th>주요 변경내역</th>
              <th>등록 시각</th>
            </tr>
          </thead>
          <tbody>
            {rows.length ? (
              rows.map((r) => (
                <tr key={r.version}>
                  <td>
                    <b>v{r.version}</b>
                  </td>
                  <td>{r.filename}</td>
                  <td>{(Number(r.size_bytes) / 1024 / 1024).toFixed(1)} MB</td>
                  <td className="release-notes">{r.release_notes || "-"}</td>
                  <td>{new Date(r.created_at).toLocaleString("ko-KR")}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan="5">등록된 버전이 없습니다.</td>
              </tr>
            )}
          </tbody>
        </table>
      )}
    </div>
  );
}
function UpdateHistory() {
  const [rows, setRows] = useState([]),
    [error, setError] = useState("");
  async function load() {
    try {
      setRows(await api("/api/v1/admin/agent-update-history"));
      setError("");
    } catch (e) {
      setError(e.message);
    }
  }
  useEffect(() => {
    load();
    const timer = setInterval(load, 30000);
    return () => clearInterval(timer);
  }, []);
  return (
    <div className="releaselist">
      <h3>장비 업데이트 이력</h3>
      <p>Agent가 등록되거나 하트비트에서 버전 변경이 확인된 시점입니다.</p>
      {error ? (
        <p className="result">이력 조회 실패: {error}</p>
      ) : (
        <table className="settings">
          <thead>
            <tr>
              <th>장비명</th>
              <th>이전 버전</th>
              <th>현재 버전</th>
              <th>구분</th>
              <th>확인 시각</th>
            </tr>
          </thead>
          <tbody>
            {rows.length ? (
              rows.map((r) => (
                <tr key={r.id}>
                  <td>
                    <b>{r.hostname}</b>
                  </td>
                  <td>{r.from_version ? `v${r.from_version}` : "-"}</td>
                  <td>
                    <b>v{r.to_version}</b>
                  </td>
                  <td>
                    {r.event_type === "REGISTERED" ? "최초 등록" : "업데이트"}
                  </td>
                  <td>{new Date(r.created_at).toLocaleString("ko-KR")}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan="5">확인된 업데이트 이력이 없습니다.</td>
              </tr>
            )}
          </tbody>
        </table>
      )}
    </div>
  );
}
function InspectionLog() {
  const [rows, setRows] = useState([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function load() {
    try {
      setRows(await api("/api/v1/admin/system-inspections"));
      setError("");
    } catch (e) {
      setError(e.message);
    }
  }
  async function run() {
    setBusy(true);
    try {
      await api("/api/v1/admin/system-inspections", { method: "POST" });
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    load();
    const timer = setInterval(load, 60000);
    return () => clearInterval(timer);
  }, []);
  return (
    <section>
      <div className="intro">
        <div>
          <h2>시스템 점검 일지</h2>
          <p>
            10분 주기로 자산 연결, 보안 기준과 데이터베이스 상태를 자동
            기록합니다.
          </p>
        </div>
        <button onClick={run} disabled={busy}>
          {busy ? "점검 중…" : "지금 점검"}
        </button>
      </div>
      <article className="panel table">
        <div className="inspection-summary">
          <b>{rows.length ? date(rows[0].created_at) : "-"}</b>
          <span>최근 점검</span>
          <em className={rows[0]?.status === "NORMAL" ? "normal" : "attention"}>
            {rows[0]?.status === "NORMAL" ? "정상" : "확인 필요"}
          </em>
        </div>
        {rows[0] && (
          <div className="infra-summary">
            <div>
              <span>k3s Node</span>
              <b>{rows[0].node_name || "-"}</b>
              <small>
                {rows[0].node_ready
                  ? `Ready · ${rows[0].k3s_version}`
                  : "Not Ready"}
              </small>
            </div>
            <div>
              <span>CPU 사용량</span>
              <b>{show(rows[0].cpu_usage)}</b>
              <small>Metrics API 기준</small>
            </div>
            <div>
              <span>RAM 사용 / 용량</span>
              <b>{show(rows[0].memory_usage)}</b>
              <small>{show(rows[0].memory_capacity)}</small>
            </div>
            <div>
              <span>HDD 할당 가능</span>
              <b>{show(rows[0].storage_allocatable)}</b>
              <small>
                전체 {show(rows[0].storage_capacity)}
                {rows[0].disk_pressure ? " · 압박 감지" : ""}
              </small>
            </div>
            <div>
              <span>Pod 운영</span>
              <b>
                {rows[0].pod_ready ?? 0} / {rows[0].pod_total ?? 0}
              </b>
              <small>누적 재시작 {rows[0].pod_restarts ?? 0}</small>
            </div>
            <div>
              <span>Git 배포 버전</span>
              <b className="git-sha">
                {rows[0].git_sha === "local"
                  ? "로컬 이미지"
                  : rows[0].git_sha?.slice(0, 12) || "-"}
              </b>
              <small>
                Backend {rows[0].backend_ready ?? 0} · Frontend{" "}
                {rows[0].frontend_ready ?? 0}
              </small>
            </div>
          </div>
        )}
        {error ? (
          <p className="result">점검 일지 조회 실패: {error}</p>
        ) : (
          <div className="tablewrap">
            <table>
              <thead>
                <tr>
                  <th>점검 시각</th>
                  <th>구분</th>
                  <th>DB</th>
                  <th>온라인 / 전체</th>
                  <th>장기 미접속</th>
                  <th>보안 확인</th>
                  <th>Node</th>
                  <th>Pod</th>
                  <th>CPU / RAM</th>
                  <th>HDD</th>
                  <th>Git SHA</th>
                  <th>점검 내용</th>
                </tr>
              </thead>
              <tbody>
                {rows.length ? (
                  rows.map((r) => (
                    <tr key={r.id}>
                      <td>{date(r.created_at)}</td>
                      <td>
                        <em
                          className={
                            r.status === "NORMAL" ? "online" : "inspection-warn"
                          }
                        >
                          {r.status === "NORMAL" ? "정상" : "확인 필요"}
                        </em>
                      </td>
                      <td>{r.db_status}</td>
                      <td>
                        {r.online_assets} / {r.total_assets}
                      </td>
                      <td>{r.stale_assets}</td>
                      <td>{r.security_alerts}</td>
                      <td>{r.node_ready ? "Ready" : "Not Ready"}</td>
                      <td>
                        {r.pod_ready ?? 0}/{r.pod_total ?? 0} · R
                        {r.pod_restarts ?? 0}
                      </td>
                      <td>
                        {show(r.cpu_usage)} / {show(r.memory_usage)}
                      </td>
                      <td>{show(r.storage_allocatable)}</td>
                      <td className="git-sha">
                        {r.git_sha === "local"
                          ? "local"
                          : r.git_sha?.slice(0, 8) || "-"}
                      </td>
                      <td className="inspection-notes">{r.notes}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan="12" className="none">
                      점검 기록을 생성하고 있습니다.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </article>
    </section>
  );
}
function monitorPercent(value) {
  const n = Number(String(value || "").match(/[\d.]+/)?.[0]);
  return Number.isFinite(n) ? Math.min(100, n) : 0;
}
function ServerMonitoring() {
  const [data, setData] = useState(null), [error, setError] = useState(""), [loading, setLoading] = useState(true);
  async function load() { try { setData(await api("/api/v1/admin/system-inspections/live")); setError(""); } catch (e) { setError(e.message); } finally { setLoading(false); } }
  useEffect(() => { load(); const timer = setInterval(load, 20000); return () => clearInterval(timer); }, []);
  const healthy = data?.nodeReady && !data?.diskPressure && data?.podReady === data?.podTotal && !data?.error;
  const memoryPct = monitorPercent(String(data?.memoryUsage).match(/\(([^)]+)/)?.[1]);
  return <section className="monitor-page"><div className="intro"><div><h2>서버 상태 모니터링</h2><p>k3s Control Plane과 AssetFlow 워크로드를 20초 간격으로 관제합니다.</p></div><div className="monitor-actions"><span><i className={healthy ? "pulse" : "pulse warn"} />{loading ? "CONNECTING" : healthy ? "ALL SYSTEMS NORMAL" : "ATTENTION REQUIRED"}</span><button onClick={load}>↻ 즉시 갱신</button></div></div>
    {error && <div className="monitor-alert">모니터링 API 연결 실패 · {error}</div>}
    {data && <><div className="monitor-strip"><div><span>CONTROL PLANE</span><b>{data.nodeReady ? "ONLINE" : "OFFLINE"}</b><small>{data.nodeName} · {data.k3sVersion}</small></div><div><span>DATABASE</span><b>{data.database}</b><small>PostgreSQL connection</small></div><div><span>DEPLOY REVISION</span><b>{data.gitSha?.slice(0, 12) || "LOCAL"}</b><small>Immutable image release</small></div><div><span>LAST POLL</span><b>{new Date(data.checkedAt).toLocaleTimeString("ko-KR")}</b><small>Auto refresh · 20 sec</small></div></div>
      <div className="resource-grid"><MonitorResource label="CPU UTILIZATION" value={data.cpuUsage} percent={monitorPercent(data.cpuUsage)} note="Node compute consumption"/><MonitorResource label="MEMORY UTILIZATION" value={data.memoryUsage} percent={memoryPct} note={`Capacity ${data.memoryCapacity}`}/><article className="panel resource-panel"><div className="resource-head"><span>EPHEMERAL STORAGE</span><b>{data.storageAllocatable}</b></div><div className={`storage-state ${data.diskPressure ? "danger" : ""}`}>{data.diskPressure ? "DISK PRESSURE" : "CAPACITY NORMAL"}</div><small>Total capacity {data.storageCapacity}</small></article></div>
      <div className="workload-grid"><article className="panel workload-panel"><div className="panel-heading"><div><h3>WORKLOAD STATUS</h3><p>AssetFlow namespace deployments</p></div><span>LIVE</span></div><div className="workload-list"><Workload name="Backend API" detail="Spring Boot · inventory/admin API" ready={data.backendReady} total={2}/><Workload name="Frontend Web" detail="Nginx · React admin console" ready={data.frontendReady} total={2}/><Workload name="Namespace Pods" detail={`Restart count ${data.podRestarts}`} ready={data.podReady} total={data.podTotal}/></div></article><article className="panel node-panel"><div className="panel-heading"><div><h3>NODE TELEMETRY</h3><p>Single-node k3s operating state</p></div><span>{data.platform?.toUpperCase()}</span></div><dl><div><dt>Node name</dt><dd>{data.nodeName}</dd></div><div><dt>Kubernetes</dt><dd>{data.k3sVersion}</dd></div><div><dt>Registered assets</dt><dd>{data.onlineAssets} online / {data.totalAssets}</dd></div><div><dt>Disk pressure</dt><dd className={data.diskPressure ? "bad-text" : "good-text"}>{data.diskPressure ? "DETECTED" : "FALSE"}</dd></div></dl></article></div></>}
  </section>;
}
function MonitorResource({ label, value, percent, note }) { return <article className="panel resource-panel"><div className="resource-head"><span>{label}</span><b>{value}</b></div><div className="meter"><i style={{ width: `${percent}%` }} /></div><small>{note}</small></article>; }
function Workload({ name, detail, ready, total }) { return <div><i className={ready >= total ? "ok" : "bad"}/><span><b>{name}</b><small>{detail}</small></span><strong>{ready} / {total}</strong></div>; }
const k3sManualSteps = [
  {
    id: "01", title: "Linux 서버 사전 점검", badge: "PRECHECK", tone: "info",
    summary: "Ubuntu/Debian 또는 RHEL 계열 서버에서 권한, 자원, 네트워크와 필수 포트를 먼저 확인합니다.",
    command: `sudo -v
uname -a
cat /etc/os-release
nproc && free -h && df -h /
ip -br addr
sudo ss -lntup | grep -E ':(6443|10250|30080)\\b' || true`,
    check: "권장 기준: 2 vCPU 이상, RAM 4 GiB 이상, 디스크 여유 20 GiB 이상. 6443·10250·30080 포트에 기존 LISTEN 프로세스가 없어야 합니다.",
    note: "방화벽 사용 시 관리망에서 TCP 6443, 노드 내부 TCP 10250, 외부 프록시에서 TCP 30080 접근을 허용합니다. 기존 Nginx Proxy Manager가 80/443을 사용하므로 k3s의 Traefik과 ServiceLB는 설치 시 제외합니다."
  },
  {
    id: "02", title: "필수 패키지와 커널 설정", badge: "HOST", tone: "info",
    summary: "설치 스크립트와 컨테이너 네트워크에 필요한 도구 및 커널 모듈을 준비합니다.",
    command: `sudo apt-get update
sudo apt-get install -y curl ca-certificates
sudo modprobe overlay
sudo modprobe br_netfilter
printf 'overlay\\nbr_netfilter\\n' | sudo tee /etc/modules-load.d/k3s.conf
printf 'net.ipv4.ip_forward=1\\nnet.bridge.bridge-nf-call-iptables=1\\nnet.bridge.bridge-nf-call-ip6tables=1\\n' | sudo tee /etc/sysctl.d/99-k3s.conf
sudo sysctl --system`,
    check: "sysctl net.ipv4.ip_forward 결과가 1이고, lsmod | grep -E 'overlay|br_netfilter'에서 두 모듈이 확인되면 정상입니다.",
    note: "RHEL/Rocky 계열은 apt 대신 dnf로 curl과 ca-certificates를 설치합니다. NetworkManager 사용 환경은 CNI 인터페이스를 관리 대상에서 제외해야 할 수 있습니다."
  },
  {
    id: "03", title: "k3s 서버 설치", badge: "INSTALL", tone: "action",
    summary: "공식 설치 스크립트로 단일 서버를 설치하고 호스트 리버스 프록시와 충돌하는 구성요소를 비활성화합니다.",
    command: `curl -sfL https://get.k3s.io | \\
  INSTALL_K3S_EXEC='server --disable traefik --disable servicelb --write-kubeconfig-mode 644' sh -
sudo systemctl enable --now k3s
sudo systemctl status k3s --no-pager`,
    check: "systemctl 상태가 active (running)이어야 합니다. 실패하면 sudo journalctl -u k3s -n 200 --no-pager로 원인을 확인합니다.",
    note: "운영 환경에서는 변경 통제를 위해 INSTALL_K3S_VERSION 환경변수로 검증한 버전을 고정하는 것을 권장합니다. 재실행하면 같은 설정으로 서비스 구성이 갱신됩니다."
  },
  {
    id: "04", title: "클러스터 준비 상태 확인", badge: "VERIFY", tone: "success",
    summary: "kubectl 연결, 노드 Ready 상태, 시스템 Pod와 스토리지 클래스를 확인합니다.",
    command: `kubectl version --client
kubectl get nodes -o wide
kubectl get pods -n kube-system
kubectl get storageclass
kubectl cluster-info`,
    check: "노드 STATUS가 Ready, kube-system 핵심 Pod가 Running, local-path StorageClass가 (default)로 표시되어야 합니다.",
    note: "일반 사용자에서 kubeconfig 오류가 나면 export KUBECONFIG=/etc/rancher/k3s/k3s.yaml을 적용합니다. 이 파일은 클러스터 관리자 권한이므로 외부 공유하거나 저장소에 커밋하지 않습니다."
  },
  {
    id: "05", title: "저장소 준비와 Secret 생성", badge: "SECRETS", tone: "warning",
    summary: "배포 디렉터리에서 네임스페이스를 만들고 애플리케이션 및 GHCR 인증정보를 안전하게 등록합니다.",
    command: `cd /opt/assetflow
kubectl apply -f deploy/k3s/namespace.yaml

read -rsp 'DB password: ' DB_PASSWORD; echo
read -rsp 'Agent registration token: ' REG_TOKEN; echo
read -rsp 'Agent update token: ' UPDATE_TOKEN; echo
read -rp 'Admin username: ' ADMIN_USER
read -rsp 'Admin password: ' ADMIN_PASSWORD; echo

kubectl -n assetflow create secret generic assetflow-secrets \\
  --from-literal=DB_PASSWORD="$DB_PASSWORD" \\
  --from-literal=POSTGRES_PASSWORD="$DB_PASSWORD" \\
  --from-literal=AGENT_REGISTRATION_TOKEN="$REG_TOKEN" \\
  --from-literal=AGENT_UPDATE_TOKEN="$UPDATE_TOKEN" \\
  --from-literal=ADMIN_USERNAME="$ADMIN_USER" \\
  --from-literal=ADMIN_PASSWORD="$ADMIN_PASSWORD"

read -rp 'GHCR username: ' GHCR_USER
read -rsp 'GHCR token: ' GHCR_TOKEN; echo
kubectl -n assetflow create secret docker-registry ghcr-pull \\
  --docker-server=ghcr.io --docker-username="$GHCR_USER" \\
  --docker-password="$GHCR_TOKEN"
unset DB_PASSWORD REG_TOKEN UPDATE_TOKEN ADMIN_PASSWORD GHCR_TOKEN`,
    check: "kubectl -n assetflow get secret assetflow-secrets ghcr-pull 실행 시 두 Secret이 표시되어야 합니다. 값 자체는 출력하거나 디코딩하지 않습니다.",
    note: "경로 /opt/assetflow는 실제 저장소 위치로 바꿉니다. secret.example.yaml은 키 설명용이므로 그대로 apply하지 않습니다. GHCR 토큰에는 private package read 권한이 필요합니다."
  },
  {
    id: "06", title: "AssetFlow 전체 배포", badge: "DEPLOY", tone: "action",
    summary: "Kustomize로 ConfigMap, PostgreSQL, Backend, Frontend, RBAC와 PDB를 한 번에 적용합니다.",
    command: `kubectl kustomize deploy/k3s | kubectl apply -f -
kubectl -n assetflow get all
kubectl -n assetflow get pvc,pdb,configmap
kubectl -n assetflow get events --sort-by=.lastTimestamp`,
    check: "postgres-0은 1/1 Running, backend와 frontend Deployment는 각각 READY 2/2, PVC는 Bound, 두 PDB의 ALLOWED DISRUPTIONS는 정상 배포 후 1이어야 합니다.",
    note: "최초 이미지가 private이면 ImagePullBackOff가 발생할 수 있습니다. 이 경우 ghcr-pull의 사용자·토큰 권한과 Pod 이벤트를 확인합니다. PostgreSQL PVC는 단일 노드 local-path에 저장됩니다."
  },
  {
    id: "07", title: "배포 완료 단계별 검증", badge: "HEALTH", tone: "success",
    summary: "DB → Backend → Frontend 순서로 rollout과 내부·노드 접근을 검증해 실패 구간을 분리합니다.",
    command: `kubectl -n assetflow rollout status statefulset/postgres --timeout=5m
kubectl -n assetflow rollout status deployment/backend --timeout=5m
kubectl -n assetflow rollout status deployment/frontend --timeout=5m

kubectl -n assetflow exec postgres-0 -- pg_isready -U assetflow -d assetflow
kubectl -n assetflow run curl-check --rm -i --restart=Never \\
  --image=curlimages/curl -- curl -fsS http://backend:8080/api/v1/health
curl -fsSI http://127.0.0.1:30080/`,
    check: "세 rollout 명령이 successfully rolled out, pg_isready가 accepting connections, API가 성공 응답, NodePort가 HTTP 200 계열을 반환하면 정상입니다.",
    note: "curl-check가 종료되며 삭제되는 것은 정상입니다. 문제가 있으면 kubectl -n assetflow describe pod <POD명>과 logs 명령으로 이벤트·애플리케이션 로그를 함께 확인합니다."
  },
  {
    id: "08", title: "외부 프록시와 HTTPS 연결", badge: "NETWORK", tone: "info",
    summary: "Nginx Proxy Manager에서 도메인을 k3s Frontend NodePort로 전달하고 최종 공개 URL을 점검합니다.",
    command: `ip -4 route get 1.1.1.1
curl -fsSI http://<K3S_NODE_IP>:30080/
curl -fsS https://assets.2734.store/api/v1/health
curl -fsSI https://assets.2734.store/`,
    check: "Proxy Host의 Forward Hostname/IP는 k3s 노드 IP(현재 구성 예: 172.17.0.1), Forward Port는 30080입니다. 외부 health와 웹 요청이 모두 성공해야 합니다.",
    note: "SSL 인증서를 연결하고 Force SSL을 활성화합니다. 프록시가 Docker 컨테이너라면 127.0.0.1이 아닌 컨테이너에서 접근 가능한 호스트 주소를 사용합니다."
  },
  {
    id: "09", title: "이미지 갱신과 무중단 배포", badge: "UPDATE", tone: "action",
    summary: "검증된 불변 sha 태그를 지정하고 Backend와 Frontend를 순차 롤링 업데이트합니다.",
    command: `export RELEASE_SHA=abcdef1
kubectl -n assetflow set image deployment/backend \\
  backend=ghcr.io/jaehakim/assets-backend:sha-$RELEASE_SHA
kubectl -n assetflow rollout status deployment/backend --timeout=5m

kubectl -n assetflow set image deployment/frontend \\
  frontend=ghcr.io/jaehakim/assets-frontend:sha-$RELEASE_SHA
kubectl -n assetflow rollout status deployment/frontend --timeout=5m

kubectl -n assetflow get pods -o wide
kubectl -n assetflow get deploy -o custom-columns=NAME:.metadata.name,IMAGE:.spec.template.spec.containers[*].image`,
    check: "새 Pod가 Ready 된 뒤 기존 Pod가 종료되고 각 Deployment가 2/2를 유지해야 합니다. 실제 7자리 Git SHA로 RELEASE_SHA를 바꿉니다.",
    note: "현재 Deployment는 maxUnavailable 0, maxSurge 1과 readiness probe를 사용합니다. GitHub Actions 운영 배포는 같은 절차를 자동 수행합니다."
  },
  {
    id: "10", title: "롤백과 긴급 복구", badge: "ROLLBACK", tone: "warning",
    summary: "신규 버전에 이상이 있으면 Deployment 이력을 확인하고 직전 ReplicaSet으로 즉시 복귀합니다.",
    command: `kubectl -n assetflow rollout history deployment/backend
kubectl -n assetflow rollout history deployment/frontend
kubectl -n assetflow rollout undo deployment/backend
kubectl -n assetflow rollout undo deployment/frontend
kubectl -n assetflow rollout status deployment/backend --timeout=5m
kubectl -n assetflow rollout status deployment/frontend --timeout=5m
curl -fsS https://assets.2734.store/api/v1/health`,
    check: "두 rollout이 완료되고 health endpoint가 정상 응답하면 복구 완료입니다. 특정 버전은 --to-revision=<번호>로 지정할 수 있습니다.",
    note: "Deployment 롤백은 애플리케이션 이미지만 되돌립니다. DB 스키마가 하위 호환되지 않는 릴리스는 별도 DB 복구 계획이 반드시 필요합니다."
  },
  {
    id: "11", title: "로그 확인과 장애 진단", badge: "TROUBLESHOOT", tone: "danger",
    summary: "서비스, 이벤트, Pod 상태와 컨테이너 로그 순서로 확인해 원인을 빠르게 좁힙니다.",
    command: `sudo systemctl status k3s --no-pager
sudo journalctl -u k3s --since '30 min ago' --no-pager
kubectl -n assetflow get pods -o wide
kubectl -n assetflow get events --sort-by=.lastTimestamp | tail -40
kubectl -n assetflow logs deployment/backend --all-pods=true --tail=200
kubectl -n assetflow logs deployment/frontend --all-pods=true --tail=200
kubectl -n assetflow logs postgres-0 --tail=200
kubectl -n assetflow describe pod <POD_NAME>`,
    check: "Pending은 PVC·자원, ImagePullBackOff는 registry 인증/태그, CrashLoopBackOff는 앱 설정·Secret·DB 연결, NotReady는 probe와 포트부터 확인합니다.",
    note: "재시작 전 반드시 events와 --previous 로그를 보존합니다: kubectl -n assetflow logs <POD_NAME> --previous. Secret 값은 장애 티켓이나 채팅에 붙여 넣지 않습니다."
  },
  {
    id: "12", title: "백업·재시작·제거", badge: "MAINTENANCE", tone: "warning",
    summary: "운영 전 DB 백업을 수행하고, 필요한 범위만 재시작하거나 k3s를 안전하게 중지·제거합니다.",
    command: `mkdir -p ./backup
kubectl -n assetflow exec postgres-0 -- \\
  pg_dump -U assetflow -d assetflow -Fc > ./backup/assetflow-$(date +%F).dump
test -s ./backup/assetflow-$(date +%F).dump && echo 'backup OK'

# 애플리케이션만 순차 재시작
kubectl -n assetflow rollout restart deployment/backend deployment/frontend

# 노드 유지보수 시
sudo systemctl stop k3s
sudo systemctl start k3s

# 완전 제거가 승인된 경우에만 실행
sudo /usr/local/bin/k3s-uninstall.sh`,
    check: "백업 파일 크기가 0보다 크고 별도 서버/스토리지로 복사되었는지 확인합니다. 재시작 후 07단계의 전체 검증을 반복합니다.",
    note: "k3s-uninstall.sh는 클러스터 데이터와 local-path 볼륨을 제거할 수 있는 파괴적 명령입니다. 백업·변경 승인·중단 공지를 완료한 경우에만 실행합니다."
  }
];
function CommandBlock({ children }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try { await navigator.clipboard.writeText(children); setCopied(true); setTimeout(() => setCopied(false), 1400); } catch (_) { setCopied(false); }
  }
  return <div className="manual-command"><div><span>TERMINAL · BASH</span><button type="button" onClick={copy}>{copied ? "복사됨 ✓" : "명령 복사"}</button></div><pre><code>{children}</code></pre></div>;
}
function K3sOperationsManual() {
  const [openStep, setOpenStep] = useState("01");
  return <article className="panel k3s-manual">
    <div className="panel-heading manual-heading"><div><small>OPERATIONS MANUAL / LINUX</small><h3>k3s 설치 및 AssetFlow 배포 전체 과정</h3><p>단일 Linux 서버 기준 설치부터 검증, 업데이트, 롤백과 장애 대응까지 순서대로 수행합니다.</p></div><span>LINUX · K3S</span></div>
    <div className="manual-cautions"><div><b>적용 환경</b><span>단일 k3s Server · host NPM · NodePort 30080</span></div><div><b>실행 권한</b><span>sudo 가능 계정 · GHCR package read 권한</span></div><div><b>완료 기준</b><span>Node Ready · App 2/2 · DB 1/1 · HTTPS health 정상</span></div></div>
    <div className="manual-warning"><b>!</b><p><strong>운영 전 확인</strong> 명령의 도메인, IP, 저장소 경로, 이미지 소유자와 SHA를 실제 환경 값으로 교체하십시오. 비밀번호와 토큰은 셸 기록·문서·Git에 저장하지 않습니다.</p></div>
    <nav className="manual-index" aria-label="k3s 운영 매뉴얼 단계">{k3sManualSteps.map(step => <button key={step.id} className={openStep === step.id ? "on" : ""} onClick={() => { setOpenStep(step.id); document.getElementById(`k3s-step-${step.id}`)?.scrollIntoView({ behavior: "smooth", block: "start" }); }}><i>{step.id}</i><span>{step.title}</span></button>)}</nav>
    <div className="manual-steps">{k3sManualSteps.map(step => <section id={`k3s-step-${step.id}`} className={`manual-step ${openStep === step.id ? "open" : ""}`} key={step.id}>
      <button className="manual-step-head" type="button" onClick={() => setOpenStep(openStep === step.id ? "" : step.id)} aria-expanded={openStep === step.id}><i>{step.id}</i><span><b>{step.title}</b><small>{step.summary}</small></span><em className={step.tone}>{step.badge}</em><strong>{openStep === step.id ? "−" : "+"}</strong></button>
      {openStep === step.id && <div className="manual-step-body"><CommandBlock>{step.command}</CommandBlock><div className="manual-result"><span><b>✓ 실행 후 확인</b>{step.check}</span><span><b>운영 참고</b>{step.note}</span></div></div>}
    </section>)}</div>
    <div className="manual-done"><span>최종 점검 명령</span><code>kubectl -n assetflow get deploy,sts,pod,svc,pvc,pdb &amp;&amp; curl -fsS https://assets.2734.store/api/v1/health</code></div>
  </article>;
}
function AgentOps({ view }) {
  const [token, setToken] = useState(""),
    [version, setVersion] = useState(""),
    [releaseNotes, setReleaseNotes] = useState(""),
    [file, setFile] = useState(),
    [message, setMessage] = useState("");
  async function upload(e) {
    e.preventDefault();
    const body = new FormData();
    body.append("version", version);
    body.append("releaseNotes", releaseNotes);
    body.append("file", file);
    setMessage("업로드 중…");
    try {
      const x = await api("/api/v1/admin/agent-releases", {
        method: "POST",
        headers: { "X-Update-Token": token },
        body,
      });
      setMessage(`등록 완료: v${x.version} / SHA-256 ${x.sha256}`);
      window.dispatchEvent(new Event("agent-release-updated"));
    } catch (e) {
      setMessage(`등록 실패: ${e.message}`);
    }
  }
  return (
    <section>
      <div className="intro">
        <div>
          <h2>
            {view === "guide"
              ? "시스템 가이드"
              : view === "history"
                ? "업데이트 이력"
                : "Agent 배포"}
          </h2>
          <p>
            {view === "guide"
              ? "Linux·k3s 설치 배포와 자료 수집, 자동 업데이트 운영 절차를 단계별로 확인합니다."
              : view === "history"
                ? "장비별 Agent 등록과 버전 변경 결과를 확인합니다."
                : "신규 Agent 실행파일과 주요 변경내역을 안전하게 배포합니다."}
          </p>
        </div>
      </div>
      {view === "guide" && (
        <>
          <K3sOperationsManual />
          <article className="panel console-kit">
            <div className="panel-heading">
              <div><h3>운영 콘솔 디자인 키트</h3><p>관리자가 많은 상태 정보를 빠르게 읽고 판단하기 위한 공통 화면 규칙</p></div>
              <span>DESIGN SYSTEM · ACTIVE</span>
            </div>
            <div className="kit-principles">
              <div><small>01 · DENSITY</small><b>중복 여백 제거</b><p>콘텐츠 영역 20px, 카드 간격 8~10px을 기준으로 한 화면에 더 많은 운영 정보를 표시합니다.</p></div>
              <div><small>02 · READABILITY</small><b>본문 11px 이상</b><p>축약 가능한 레이블만 9~10px로 사용하고 주요 값과 제목은 12~23px로 명확히 구분합니다.</p></div>
              <div><small>03 · STATUS FIRST</small><b>상태 우선 표현</b><p>정상·주의·오류 상태는 색상과 텍스트를 함께 사용해 색상만으로 의미를 전달하지 않습니다.</p></div>
              <div><small>04 · CONSISTENCY</small><b>3px 운영 컴포넌트</b><p>패널, 버튼, 입력창과 배지는 작은 모서리와 얇은 경계선을 공통으로 적용합니다.</p></div>
            </div>
            <div className="kit-reference">
              <section><h4>COLOR TOKENS</h4><div className="kit-colors"><span><i className="navy" />Console</span><span><i className="blue" />Action</span><span><i className="green" />Normal</span><span><i className="amber" />Attention</span><span><i className="line" />Divider</span></div></section>
              <section><h4>COMPONENT RULES</h4><dl><div><dt>사이드바</dt><dd>228px · 58px 접힘</dd></div><div><dt>워크스페이스</dt><dd>상단 탭 · 화면별 도구 하단 배치</dd></div><div><dt>데이터 그리드</dt><dd>회색 헤더 · 흰색/교차 데이터 행</dd></div><div><dt>반응형</dt><dd>650px 이하 단일 열 전환</dd></div></dl></section>
            </div>
          </article>
          <article className="panel ops">
            <div className="panel-heading">
              <div><h3>운영 화면 적용 기준</h3><p>현재 관리자 화면과 로그인 게이트웨이에 적용된 공통 UI 및 운용 규칙</p></div>
              <span>UI BASELINE · 2026</span>
            </div>
            <table className="settings guide-matrix"><tbody>
              <tr><th>운영 타이포그래피</th><td>제목·메뉴는 IBM Plex Sans Condensed, 본문은 IBM Plex Sans KR, 상태·수치·레이블은 IBM Plex Mono를 사용합니다.</td><td>전체 화면</td></tr>
              <tr><th>탭 워크스페이스</th><td>좌측 메뉴에서 연 화면을 상단 탭으로 유지하며, 검색과 화면별 도구는 활성 탭의 콘텐츠 영역에 배치합니다.</td><td>다중 화면 전환</td></tr>
              <tr><th>좌측 내비게이션</th><td>기본 228px, 접힘 58px 아이콘 레일로 동작하며 페이징 영역도 내비게이션 폭에 맞춰 자동 정렬됩니다.</td><td>접기·펴기</td></tr>
              <tr><th>데이터 그리드</th><td>회색 헤더와 흰색·교차 회색 데이터 행, 셀 경계선과 호버 강조를 모든 목록에 공통 적용합니다.</td><td>가독성 통일</td></tr>
              <tr><th>목록 탐색</th><td>헤더 정렬을 지원하고 페이지네이션은 화면 하단에 고정하여 긴 목록에서도 탐색 수단을 유지합니다.</td><td>정렬·고정 페이징</td></tr>
              <tr><th>로그인 게이트웨이</th><td>보안 접속 노드, TLS 프로토콜, 관리자 권한과 감사 세션 정보를 표시하는 IT 운영 콘솔 형태입니다.</td><td>보안 컨텍스트</td></tr>
            </tbody></table>
          </article>
          <article className="panel ops">
            <div className="panel-heading">
              <div><h3>Windows Agent 설치 및 제거</h3><p>배치 파일은 관리자 권한을 자동 요청하며 서비스와 트레이 프로세스를 함께 관리합니다.</p></div>
              <span>WINDOWS · ADMIN</span>
            </div>
            <table className="settings guide-matrix"><tbody>
              <tr><th>install-service.bat</th><td>등록 토큰 입력 후 최신 Agent를 내려받아 크기와 SHA-256을 검증하고 서비스·트레이 앱을 설치합니다.</td><td>신규 설치</td></tr>
              <tr><th>uninstall-service.bat</th><td>서비스, 트레이 자동 시작, 실행 프로세스와 설치 파일을 제거하며 재설치를 위해 장비 식별 정보는 보존합니다.</td><td>기본 제거</td></tr>
              <tr><th>uninstall-service.bat /purge</th><td>기본 제거에 더해 ProgramData의 설정, 장비 토큰과 로컬 로그까지 영구 삭제합니다.</td><td>완전 제거</td></tr>
            </tbody></table>
          </article>
          <article className="panel ops">
            <h3>자동 업데이트 흐름</h3>
            <Diagram>{`flowchart LR
A[관리자 EXE 등록] --> B[서버 SHA-256 계산·보관]
B --> C[Agent 5분 주기 최신 버전 조회]
C --> D{신규 버전?}
D -- 아니오 --> C
D -- 예 --> E[Bearer 인증 다운로드]
E --> F{SHA-256 일치?}
F -- 아니오 --> G[파일 폐기·오류 로그]
F -- 예 --> H[서비스 중지]
H --> I[서비스·트레이 종료 후 EXE 교체]
I --> J[서비스 재시작]
J --> K[하트비트로 버전 변경 확인]
K --> L[(장비 업데이트 이력 저장)]`}</Diagram>
          </article>
          <div className="opsgrid">
            <article className="panel ops">
              <h3>Agent 기능 및 자료 흐름</h3>
              <Diagram>{`flowchart TD
L[Windows 사용자 로그인] --> TRAY[시스템 트레이 Agent]
TRAY --> INFO[Agent 버전·PC 정보 확인]
TRAY --> WEB[관리 페이지 열기]
SVC[Windows Service] --> T[기본 60분 주기]
T --> H[하드웨어·OS]
T --> N[IP·MAC·디스크]
T --> S[설치 소프트웨어 최대 2000건]
T --> P[BitLocker·Firewall·Defender]
H & N & S & P --> API[Inventory API 전송]
API --> DB[(PostgreSQL)]`}</Diagram>
            </article>
            <article className="panel">
              <h3>주기 및 저장 위치</h3>
              <table className="settings">
                <tbody>
                  <tr>
                    <th>인벤토리 수집</th>
                    <td>CollectionMinutes</td>
                    <td>기본 60분 / 최소 5분</td>
                  </tr>
                  <tr>
                    <th>업데이트 확인</th>
                    <td>UpdateCheckMinutes</td>
                    <td>기본 5분 / 최소 5분</td>
                  </tr>
                  <tr>
                    <th>트레이 정보</th>
                    <td colSpan="2">버전·PC명·사용자·모델·OS·CPU·RAM·IP</td>
                  </tr>
                  <tr>
                    <th>Agent 설정</th>
                    <td colSpan="2">%ProgramData%\AssetFlow\agent.json</td>
                  </tr>
                  <tr>
                    <th>실행 로그</th>
                    <td colSpan="2">설치폴더\logs\agent-YYYYMMDD.log</td>
                  </tr>
                  <tr>
                    <th>실행파일</th>
                    <td colSpan="2">%ProgramFiles%\AssetFlow\Agent</td>
                  </tr>
                </tbody>
              </table>
            </article>
          </div>
          <article className="panel roadmap-panel">
            <div className="panel-heading"><div><h3>IT 자산관리 고도화 계획</h3><p>Snipe-IT·GLPI·Lansweeper 운영 기능을 기준으로 한 단계별 확장 계획</p></div><span>ROADMAP</span></div>
            <div className="roadmap-grid">
              <div className="done"><b>1단계 · 운영 기반</b><em>적용</em><p>Agent 자동 인벤토리, 보안 상태, 자산 태그, 담당자·위치, 생애주기, 구매·보증·EOL, 실사 일정과 변경 이력</p></div>
              <div><b>2단계 · 통제 자동화</b><em>계획</em><p>QR·바코드, 반출·반납 승인, 정기 실사 알림, 계약·공급업체·라이선스·비용 관리, 네트워크 탐색</p></div>
              <div><b>3단계 · 지능형 운영</b><em>계획</em><p>소프트웨어 정규화, EOL/EOS·취약점 인텔리전스, 라이선스 최적화, ITSM·CMDB·SSO·Webhook 연계</p></div>
            </div>
            <table className="settings guide-matrix"><tbody>
              <tr><th>책임성</th><td>고유 자산 태그, 할당 담당자, 위치, 변경 감사 이력</td><td>현재 적용</td></tr>
              <tr><th>생애주기</th><td>재고·사용·수리·분실·폐기 상태, 구매·보증·EOL 날짜</td><td>현재 적용</td></tr>
              <tr><th>물리 실사</th><td>최근·다음 실사일과 지연 자산 대시보드 경고</td><td>현재 적용</td></tr>
              <tr><th>확장 수집</th><td>모니터·프린터·네트워크·클라우드 자산과 관계 정보</td><td>2단계</td></tr>
              <tr><th>컴플라이언스</th><td>취약점, 라이선스 사용량, EOS 정책 및 감사 보고서</td><td>3단계</td></tr>
            </tbody></table>
          </article>
        </>
      )}
      {view === "release" && (
        <article className="panel release">
          <h3>신규 Agent 실행파일 등록</h3>
          <form onSubmit={upload}>
            <input
              type="password"
              placeholder="업데이트 등록 토큰"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              required
            />
            <input
              placeholder="버전 (예: 0.3.0)"
              pattern="[0-9]+\.[0-9]+\.[0-9]+(\.[0-9]+)?"
              value={version}
              onChange={(e) => setVersion(e.target.value)}
              required
            />
            <input
              type="file"
              accept=".exe"
              onChange={(e) => setFile(e.target.files[0])}
              required
            />
            <textarea
              className="release-notes-input"
              placeholder="주요 변경내역을 입력하세요. 예: 장치 등록 안정성 개선 및 보안 상태 수집 항목 추가"
              value={releaseNotes}
              onChange={(e) => setReleaseNotes(e.target.value)}
              maxLength="2000"
              required
            />
            <button>버전 등록</button>
          </form>
          {message && <p className="result">{message}</p>}
          <ReleaseList />
        </article>
      )}
      {view === "history" && (
        <article className="panel release">
          <UpdateHistory />
        </article>
      )}
    </section>
  );
}
const Icon = ({ name }) => {
  const paths = {
    info: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 11v6M12 7.5h.01" />
      </>
    ),
    close: <path d="m6 6 12 12M18 6 6 18" />,
    device: (
      <>
        <rect x="3" y="4" width="18" height="13" rx="2" />
        <path d="M8 21h8M12 17v4" />
      </>
    ),
    shield: (
      <>
        <path d="M12 3 4.5 6v5.5c0 4.7 3.2 8 7.5 9.5 4.3-1.5 7.5-4.8 7.5-9.5V6L12 3Z" />
        <path d="m8.5 12 2.2 2.2 4.8-5" />
      </>
    ),
    disk: (
      <>
        <ellipse cx="12" cy="5.5" rx="8" ry="3" />
        <path d="M4 5.5v12c0 1.7 3.6 3 8 3s8-1.3 8-3v-12M4 11.5c0 1.7 3.6 3 8 3s8-1.3 8-3" />
      </>
    ),
    apps: (
      <>
        <rect x="3" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" />
        <rect x="14" y="14" width="7" height="7" rx="1" />
      </>
    ),
  };
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      {paths[name]}
    </svg>
  );
};
const show = (v) => (v === null || v === undefined || v === "" ? "-" : v);
const date = (v) => (v ? new Date(v).toLocaleString("ko-KR") : "-");
const bytes = (v) => {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return "-";
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(0)} MB`;
  return n >= 1024 ** 4
    ? `${(n / 1024 ** 4).toFixed(1)} TB`
    : `${(n / 1024 ** 3).toFixed(1)} GB`;
};
function DetailItem({ label, value, wide = false }) {
  return (
    <div className={`detail-item${wide ? " wide" : ""}`}>
      <span>{label}</span>
      <b title={String(show(value))}>{show(value)}</b>
    </div>
  );
}
function SecurityItem({ label, value, antivirus = false }) {
  const unknown = value === null || value === undefined || value === "Unknown";
  const good = antivirus ? value === "Healthy" : value === true;
  return (
    <div
      className={`security-item ${unknown ? "unknown" : good ? "good" : "bad"}`}
    >
      <span>{unknown ? "?" : good ? "✓" : "!"}</span>
      <div>
        <b>{label}</b>
        <small>
          {unknown ? "확인 불가" : good ? "정상 적용" : "조치 필요"}
        </small>
      </div>
    </div>
  );
}
const lifecycleLabels = {IN_STOCK:"재고",IN_USE:"사용 중",REPAIR:"수리",LOST:"분실",RETIRED:"퇴역",DISPOSED:"폐기"};
function ManagementForm({ data, onSaved }) {
  const keys = ["asset_tag","lifecycle_status","category","location","assigned_to","vendor","purchase_date","purchase_cost","warranty_expires_at","eol_at","last_audit_at","next_audit_at","management_notes"];
  const [form,setForm] = useState(() => Object.fromEntries(keys.map(k => [k,data[k] ?? ""]))), [message,setMessage] = useState(""), [busy,setBusy] = useState(false);
  const set = (key,value) => setForm(x => ({...x,[key]:value}));
  async function save(e) {
    e.preventDefault(); setBusy(true); setMessage("");
    try {
      const body = Object.fromEntries(Object.entries(form).map(([k,v]) => [k.replace(/_([a-z])/g,(_,c)=>c.toUpperCase()),v === "" ? null : v]));
      await api(`/api/v1/assets/${data.id}/management`,{method:"PATCH",body:JSON.stringify(body)});
      setMessage("관리 정보가 저장되었습니다."); await onSaved();
    } catch (err) { setMessage(`저장 실패: ${err.message}`); } finally { setBusy(false); }
  }
  return <article className="detail-card management-card"><h3>자산 생애주기 <small>{lifecycleLabels[form.lifecycle_status] || form.lifecycle_status}</small></h3><form onSubmit={save} className="management-form">
    <label>자산 태그<input value={form.asset_tag} onChange={e=>set("asset_tag",e.target.value)} placeholder="예: PC-2026-001" /></label>
    <label>운영 상태<select value={form.lifecycle_status} onChange={e=>set("lifecycle_status",e.target.value)}>{Object.entries(lifecycleLabels).map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label>
    <label>자산 분류<input value={form.category} onChange={e=>set("category",e.target.value)} /></label><label>담당자<input value={form.assigned_to} onChange={e=>set("assigned_to",e.target.value)} /></label>
    <label>위치<input value={form.location} onChange={e=>set("location",e.target.value)} /></label><label>공급업체<input value={form.vendor} onChange={e=>set("vendor",e.target.value)} /></label>
    <label>구매일<input type="date" value={form.purchase_date} onChange={e=>set("purchase_date",e.target.value)} /></label><label>구매금액<input type="number" min="0" value={form.purchase_cost} onChange={e=>set("purchase_cost",e.target.value)} /></label>
    <label>보증 만료일<input type="date" value={form.warranty_expires_at} onChange={e=>set("warranty_expires_at",e.target.value)} /></label><label>EOL 예정일<input type="date" value={form.eol_at} onChange={e=>set("eol_at",e.target.value)} /></label>
    <label>최근 실사일<input type="date" value={form.last_audit_at} onChange={e=>set("last_audit_at",e.target.value)} /></label><label>다음 실사일<input type="date" value={form.next_audit_at} onChange={e=>set("next_audit_at",e.target.value)} /></label>
    <label className="wide">관리 메모<textarea value={form.management_notes} onChange={e=>set("management_notes",e.target.value)} /></label><div className="management-actions"><small>{message}</small><button disabled={busy}>{busy?"저장 중…":"관리 정보 저장"}</button></div>
  </form>{data.managementHistory?.length > 0 && <div className="audit-history"><b>최근 변경 이력</b>{data.managementHistory.slice(0,5).map(h=><p key={h.id}><span>{date(h.created_at)} · {h.changed_by}</span>{h.details}</p>)}</div>}</article>;
}
function AssetDetailModal({ assetId, onClose }) {
  const [data, setData] = useState(null),
    [error, setError] = useState(""),
    [softwareQ, setSoftwareQ] = useState("");
  const loadDetail = () => api(`/api/v1/assets/${assetId}`).then(setData);
  useEffect(() => {
    let live = true;
    api(`/api/v1/assets/${assetId}`)
      .then((x) => live && setData(x))
      .catch((e) => live && setError(e.message));
    const key = (e) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", key);
    document.body.classList.add("modal-open");
    return () => {
      live = false;
      document.removeEventListener("keydown", key);
      document.body.classList.remove("modal-open");
    };
  }, [assetId, onClose]);
  const software = useMemo(
    () =>
      data?.software?.filter((s) =>
        `${s.name} ${s.version || ""} ${s.publisher || ""}`
          .toLowerCase()
          .includes(softwareQ.toLowerCase()),
      ) || [],
    [data, softwareQ],
  );
  const online =
    data && Date.now() - new Date(data.last_seen_at).getTime() < 900000;
  const secure =
    data &&
    data.bitlocker_enabled === true &&
    data.firewall_enabled === true &&
    data.antivirus_status === "Healthy" &&
    data.tpm_enabled === true &&
    data.secure_boot_enabled === true;
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <section
        className="asset-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="asset-detail-title"
      >
        {!data && !error ? (
          <div className="modal-state">
            <i className="spinner" />
            <b>자산 정보를 불러오는 중입니다</b>
          </div>
        ) : error ? (
          <div className="modal-state error">
            <b>상세 정보를 불러오지 못했습니다.</b>
            <small>{error}</small>
            <button onClick={onClose}>닫기</button>
          </div>
        ) : (
          <>
            <div className="modal-head">
              <div className="device-mark">
                <Icon name="device" />
              </div>
              <div>
                <small>MANAGED WINDOWS DEVICE</small>
                <h2 id="asset-detail-title">{data.hostname}</h2>
                <p>
                  {show(data.manufacturer)} · {show(data.model)}{" "}
                  <span>자산 ID {data.id}</span>
                </p>
              </div>
              <div className="modal-status">
                <em className={online ? "online" : "offline"}>
                  ● {online ? "온라인" : "오프라인"}
                </em>
                <small>최근 보고 {date(data.last_seen_at)}</small>
              </div>
              <button
                className="modal-close"
                onClick={onClose}
                aria-label="상세정보 닫기"
              >
                <Icon name="close" />
              </button>
            </div>
            <div className="modal-body">
              <div className="asset-summary">
                <div>
                  <span>사용자</span>
                  <b>{show(data.username)}</b>
                  <small>{data.department || "부서 미지정"}</small>
                </div>
                <div>
                  <span>운영체제</span>
                  <b>{show(data.os_name)}</b>
                  <small>버전 {show(data.os_version)}</small>
                </div>
                <div>
                  <span>Agent</span>
                  <b>v{show(data.agent_version)}</b>
                  <small>등록 {date(data.agent_registered_at)}</small>
                </div>
                <div>
                  <span>보안 상태</span>
                  <b className={secure ? "ok-text" : "warn-text"}>
                    {secure ? "정상" : "확인 필요"}
                  </b>
                  <small>5개 필수 보안 항목 기준</small>
                </div>
              </div>
              <div className="detail-layout">
                <div className="detail-main">
                  <ManagementForm data={data} onSaved={loadDetail} />
                  <article className="detail-card">
                    <h3>
                      <Icon name="device" />
                      장비 및 시스템
                    </h3>
                    <div className="detail-grid">
                      <DetailItem label="제조사" value={data.manufacturer} />
                      <DetailItem label="모델" value={data.model} />
                      <DetailItem label="시리얼 번호" value={data.serial_no} />
                      <DetailItem label="장치 UUID" value={data.device_uuid} />
                      <DetailItem label="BIOS 버전" value={data.bios_version} />
                      <DetailItem label="CPU" value={data.cpu_name} wide />
                      <DetailItem
                        label="메모리"
                        value={bytes(data.memory_bytes)}
                      />
                      <DetailItem label="호스트명" value={data.hostname} />
                      <DetailItem
                        label="CPU 코어 / 논리 프로세서"
                        value={
                          data.cpu_cores || data.cpu_logical_processors
                            ? `${show(data.cpu_cores)} / ${show(data.cpu_logical_processors)}`
                            : "-"
                        }
                      />
                      <DetailItem
                        label="도메인 / 워크그룹"
                        value={`${show(data.domain_name)} (${data.domain_joined === true ? "도메인 가입" : data.domain_joined === false ? "워크그룹" : "확인 불가"})`}
                      />
                      <DetailItem
                        label="OS 빌드 / 아키텍처"
                        value={`${show(data.os_build)} / ${show(data.os_architecture)}`}
                      />
                      <DetailItem
                        label="OS 설치일"
                        value={date(data.os_installed_at)}
                      />
                      <DetailItem
                        label="최근 부팅"
                        value={date(data.last_boot_at)}
                      />
                    </div>
                  </article>
                  <article className="detail-card">
                    <h3>
                      <Icon name="disk" />
                      저장장치 <small>{data.disks?.length || 0}개 볼륨</small>
                    </h3>
                    <div className="disk-list">
                      {data.disks?.length ? (
                        data.disks.map((d, i) => {
                          const used = Math.max(
                              0,
                              Number(d.total_bytes) - Number(d.free_bytes),
                            ),
                            pct = Number(d.total_bytes)
                              ? Math.round((used / Number(d.total_bytes)) * 100)
                              : 0;
                          return (
                            <div className="disk-row" key={`${d.name}-${i}`}>
                              <div>
                                <b>{d.name}</b>
                                <small>{show(d.filesystem)}</small>
                              </div>
                              <div className="capacity">
                                <span>
                                  <i
                                    className={pct > 90 ? "danger" : ""}
                                    style={{ width: `${pct}%` }}
                                  />
                                </span>
                                <small>
                                  {bytes(used)} / {bytes(d.total_bytes)} 사용 ·{" "}
                                  {pct}%
                                </small>
                              </div>
                            </div>
                          );
                        })
                      ) : (
                        <p className="no-data">수집된 저장장치가 없습니다.</p>
                      )}
                    </div>
                  </article>
                  <article className="detail-card software-card">
                    <h3>
                      <Icon name="apps" />
                      설치 소프트웨어{" "}
                      <small>총 {data.software?.length || 0}개</small>
                    </h3>
                    <input
                      className="software-search"
                      value={softwareQ}
                      onChange={(e) => setSoftwareQ(e.target.value)}
                      placeholder="프로그램명, 버전, 게시자 검색"
                    />
                    <div className="software-table">
                      <table>
                        <thead>
                          <tr>
                            <th>프로그램</th>
                            <th>버전</th>
                            <th>게시자</th>
                            <th>설치일</th>
                          </tr>
                        </thead>
                        <tbody>
                          {software.length ? (
                            software.map((s, i) => (
                              <tr key={`${s.name}-${s.version}-${i}`}>
                                <td>
                                  <b>{s.name}</b>
                                </td>
                                <td>{show(s.version)}</td>
                                <td>{show(s.publisher)}</td>
                                <td>{show(s.install_date)}</td>
                              </tr>
                            ))
                          ) : (
                            <tr>
                              <td colSpan="4" className="none">
                                일치하는 소프트웨어가 없습니다.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </article>
                </div>
                <div className="detail-side">
                  <article className="detail-card security-card">
                    <h3>
                      <Icon name="shield" />
                      보안 기준
                    </h3>
                    <SecurityItem
                      label="BitLocker 암호화"
                      value={data.bitlocker_enabled}
                    />
                    <SecurityItem
                      label="Windows 방화벽"
                      value={data.firewall_enabled}
                    />
                    <SecurityItem
                      label="실시간 백신"
                      value={data.antivirus_status}
                      antivirus
                    />
                    <SecurityItem label="TPM 활성화" value={data.tpm_enabled} />
                    <SecurityItem
                      label="Secure Boot"
                      value={data.secure_boot_enabled}
                    />
                    <div className="security-meta">
                      TPM{" "}
                      {data.tpm_present === false
                        ? "미탑재"
                        : show(data.tpm_version)}
                    </div>
                  </article>
                  <article className="detail-card">
                    <h3>네트워크</h3>
                    <div className="side-items">
                      <DetailItem label="IP 주소" value={data.ip_address} />
                      <DetailItem label="MAC 주소" value={data.mac_address} />
                      <DetailItem
                        label="서버 확인 IP"
                        value={data.agent_last_ip}
                      />
                    </div>
                  </article>
                  <article className="detail-card">
                    <h3>관리 정보</h3>
                    <div className="side-items">
                      <DetailItem
                        label="데이터 갱신"
                        value={date(data.updated_at)}
                      />
                      <DetailItem
                        label="Agent 최종 통신"
                        value={date(data.agent_last_seen_at)}
                      />
                      <DetailItem label="Agent ID" value={data.agent_id} />
                    </div>
                  </article>
                </div>
              </div>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
const assetColumns = [
  { key: "hostname", label: "장비명 / 상세정보", value: (a) => `${a.hostname || ""} ${a.serial_no || ""}` },
  { key: "asset_tag", label: "자산 태그 / 생애주기", value: (a) => `${a.asset_tag || ""} ${a.lifecycle_status || ""}` },
  { key: "username", label: "사용자 / 부서", value: (a) => `${a.username || ""} ${a.department || ""}` },
  { key: "os_name", label: "운영체제", value: (a) => `${a.os_name || ""} ${a.os_version || ""}` },
  { key: "agent_version", label: "Agent 버전", value: (a) => a.agent_version || "" },
  { key: "ip_address", label: "네트워크 / 위치", value: (a) => `${a.ip_address || ""} ${a.location || ""}` },
  { key: "last_seen_at", label: "마지막 접속", value: (a) => a.last_seen_at ? new Date(a.last_seen_at).getTime() : 0 },
  { key: "online", label: "상태", value: (a) => Number(Boolean(a.online)) },
];
function AssetTable({ rows, loading, onDetail, paginate = false }) {
  const [sort, setSort] = useState({ key: "last_seen_at", direction: "desc" });
  const [page, setPage] = useState(1);
  const pageSize = 20;
  const column = assetColumns.find((item) => item.key === sort.key);
  const sortedRows = useMemo(() => [...rows].sort((a, b) => {
    const left = column.value(a), right = column.value(b);
    const compared = typeof left === "number"
      ? left - right
      : String(left).localeCompare(String(right), "ko", { numeric: true, sensitivity: "base" });
    return sort.direction === "asc" ? compared : -compared;
  }), [rows, column, sort.direction]);
  const pageCount = Math.max(1, Math.ceil(sortedRows.length / pageSize));
  const visibleRows = paginate ? sortedRows.slice((page - 1) * pageSize, page * pageSize) : sortedRows;
  useEffect(() => setPage(1), [rows, sort.key, sort.direction]);
  function changeSort(key) {
    setSort((current) => ({ key, direction: current.key === key && current.direction === "asc" ? "desc" : "asc" }));
  }
  return (
    <div className="tablewrap">
      <table>
        <thead>
          <tr>
            {assetColumns.map((item) => <th key={item.key} aria-sort={sort.key === item.key ? (sort.direction === "asc" ? "ascending" : "descending") : "none"}><button className={sort.key === item.key ? "sort-button active" : "sort-button"} onClick={() => changeSort(item.key)}>{item.label}<i>{sort.key === item.key ? (sort.direction === "asc" ? "▲" : "▼") : "↕"}</i></button></th>)}
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr>
              <td colSpan="8">불러오는 중…</td>
            </tr>
          ) : !rows.length ? (
            <tr>
              <td colSpan="8" className="none">
                등록된 자산이 없습니다.
              </td>
            </tr>
          ) : (
            visibleRows.map((a) => (
              <tr
                key={a.id}
                className="asset-row"
                onClick={() => onDetail(a.id)}
                tabIndex="0"
                onKeyDown={(e) =>
                  (e.key === "Enter" || e.key === " ") && onDetail(a.id)
                }
              >
                <td>
                  <div className="asset-name">
                    <div>
                      <b>{a.hostname}</b>
                      <small>{a.serial_no || "-"}</small>
                    </div>
                    <button
                      className="info-button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDetail(a.id);
                      }}
                      aria-label={`${a.hostname} 상세정보 보기`}
                      title="Agent 수집 상세정보 보기"
                    >
                      <Icon name="info" />
                    </button>
                  </div>
                </td>
                <td><b>{a.asset_tag || "미지정"}</b><br/><small>{lifecycleLabels[a.lifecycle_status] || a.lifecycle_status}</small></td>
                <td>
                  {a.username || "-"} / {a.department || "미지정"}
                </td>
                <td>
                  {a.os_name || "-"} {a.os_version || ""}
                </td>
                <td>
                  <b>v{a.agent_version || "-"}</b>
                </td>
                <td><div className="network-cell"><b>Local {a.ip_address || "-"}</b><small>Server {a.server_observed_ip || "-"}</small><small>위치 {a.location || "미지정"}</small></div></td>
                <td>{date(a.last_seen_at)}</td>
                <td>
                  <em className={a.online ? "online" : "offline"}>
                    ● {a.online ? "온라인" : "오프라인"}
                  </em>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
      {paginate && !loading && rows.length > 0 && <nav className="asset-pagination" aria-label="자산 목록 페이지">
        <span>전체 <b>{rows.length}</b>건 · {page}/{pageCount} 페이지</span>
        <div><button onClick={() => setPage(1)} disabled={page === 1} aria-label="첫 페이지">«</button><button onClick={() => setPage((value) => Math.max(1, value - 1))} disabled={page === 1} aria-label="이전 페이지">‹</button>{Array.from({ length: pageCount }, (_, index) => index + 1).filter((number) => number === 1 || number === pageCount || Math.abs(number - page) <= 2).map((number, index, pages) => <React.Fragment key={number}>{index > 0 && number - pages[index - 1] > 1 && <i>…</i>}<button className={number === page ? "on" : ""} onClick={() => setPage(number)} aria-current={number === page ? "page" : undefined}>{number}</button></React.Fragment>)}<button onClick={() => setPage((value) => Math.min(pageCount, value + 1))} disabled={page === pageCount} aria-label="다음 페이지">›</button><button onClick={() => setPage(pageCount)} disabled={page === pageCount} aria-label="마지막 페이지">»</button></div>
      </nav>}
    </div>
  );
}
function App() {
  const [user, setUser] = useState(undefined),
    [active, setActive] = useState("대시보드"),
    [openTabs, setOpenTabs] = useState(["대시보드"]),
    [sidebarCollapsed, setSidebarCollapsed] = useState(false),
    [q, setQ] = useState(""),
    [loading, setLoading] = useState(false),
    [assets, setAssets] = useState([]),
    [detailId, setDetailId] = useState(null),
    [stats, setStats] = useState({
      total: 0,
      online: 0,
      offline: 0,
      stale: 0,
      security: { bitlocker: 0, antivirus: 0 },
      management: { warrantyExpiring: 0, overdueAudit: 0, assigned: 0 },
    });
  useEffect(() => {
    api("/api/v1/auth/me")
      .then(setUser)
      .catch(() => setUser(null));
  }, []);
  async function load() {
    setLoading(true);
    try {
      const [s, a] = await Promise.all([
        api("/api/v1/dashboard"),
        api("/api/v1/assets"),
      ]);
      setStats(s);
      setAssets(a);
    } catch (e) {
      if (e.status === 401) setUser(null);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    if (user) load();
  }, [user]);
  const filtered = useMemo(
    () =>
      assets.filter((a) =>
        JSON.stringify(a).toLowerCase().includes(q.toLowerCase()),
      ),
    [assets, q],
  );
  if (user === undefined) return <div className="splash">AssetFlow</div>;
  if (!user) return <Login onLogin={setUser} />;
  async function logout() {
    await api("/api/v1/auth/logout", { method: "POST" });
    setUser(null);
  }
  function openWorkspace(name) {
    setOpenTabs((tabs) => tabs.includes(name) ? tabs : [...tabs, name]);
    setActive(name);
  }
  function closeWorkspace(event, name) {
    event.stopPropagation();
    if (openTabs.length === 1) return;
    const index = openTabs.indexOf(name);
    const next = openTabs.filter((tab) => tab !== name);
    setOpenTabs(next);
    if (active === name) setActive(next[Math.max(0, index - 1)]);
  }
  return (
    <>
      <aside className={sidebarCollapsed ? "sidebar-collapsed" : ""}>
        <div className="brand">
          <b>A</b><span>AssetFlow</span><button className="sidebar-toggle" onClick={() => setSidebarCollapsed((value) => !value)} aria-label={sidebarCollapsed ? "메뉴 펼치기" : "메뉴 접기"} title={sidebarCollapsed ? "메뉴 펼치기" : "메뉴 접기"}>{sidebarCollapsed ? "»" : "«"}</button>
        </div>
        <nav>
          {menuGroups.map((group) => (
            <div className="nav-group" key={group.label}>
              <small>{group.label}</small>
              {group.items.map((item) => (
                <button
                  key={item.name}
                  className={active === item.name ? "on" : ""}
                  onClick={() => openWorkspace(item.name)}
                >
                  <span>{item.icon}</span>
                  <b className="nav-label">{item.name}</b>
                  {active === item.name && <i />}
                </button>
              ))}
            </div>
          ))}
        </nav>
        <div className="nav-health">
          <div><span><i /> CONTROL PLANE</span><b>NORMAL</b></div>
          <small>NODE OSAKA · K3S</small>
        </div>
        <div className="profile">
          <i>{user.username[0].toUpperCase()}</i>
          <div className="profile-label">
            <b>{user.username}</b>
            <small>시스템 관리자</small>
          </div>
          <button onClick={logout}>로그아웃</button>
        </div>
      </aside>
      <main className={sidebarCollapsed ? "main-collapsed" : ""}>
        <nav className="workspace-tabs" aria-label="열린 관리자 화면">
          <div>
            {openTabs.map((tab) => <button key={tab} className={active === tab ? "on" : ""} onClick={() => setActive(tab)}><span>{menuGroups.flatMap((group) => group.items).find((item) => item.name === tab)?.icon}</span>{tab}{openTabs.length > 1 && <i role="button" tabIndex="0" aria-label={`${tab} 탭 닫기`} onClick={(event) => closeWorkspace(event, tab)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") closeWorkspace(event, tab); }}>×</i>}</button>)}
          </div>
          <small>{openTabs.length} OPEN VIEWS</small>
        </nav>
        {active === "Agent 배포" ? (
          <AgentOps view="release" />
        ) : active === "업데이트 이력" ? (
          <AgentOps view="history" />
        ) : active === "시스템 가이드" ? (
          <AgentOps view="guide" />
        ) : active === "점검 일지" ? (
          <InspectionLog />
        ) : active === "서버 모니터링" ? (
          <ServerMonitoring />
        ) : active === "자산 관리" ? (
          <section>
            <div className="intro">
              <div>
                <h2>자산 목록</h2>
                <p>Agent가 보고한 장비의 운영·보안 상태를 관리합니다.</p>
              </div>
              <div className="list-metrics">
                <input className="asset-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="자산, 사용자 검색" aria-label="자산 검색" />
                <span>
                  검색 결과 <b>{filtered.length}</b>
                </span>
                <span>
                  온라인{" "}
                  <b className="ok-text">
                    {filtered.filter((a) => a.online).length}
                  </b>
                </span>
                <button onClick={load}>↻ 새로고침</button>
                <a className="export-button" href="/api/v1/assets-export.csv">CSV 내보내기</a>
              </div>
            </div>
            <article className="panel table asset-list-panel">
              <AssetTable
                rows={filtered}
                loading={loading}
                onDetail={setDetailId}
                paginate
              />
            </article>
          </section>
        ) : (
          <Dashboard
            stats={stats}
            rows={filtered.slice(0, 6)}
            loading={loading}
            load={load}
            all={() => openWorkspace("자산 관리")}
            onDetail={setDetailId}
          />
        )}
      </main>
      {detailId && (
        <AssetDetailModal
          assetId={detailId}
          onClose={() => setDetailId(null)}
        />
      )}
    </>
  );
}
function Dashboard({ stats, rows, loading, load, all, onDetail }) {
  const securityChecks = stats.total * 2;
  const securityIssues = stats.security.bitlocker + stats.security.antivirus;
  const compliance = securityChecks
    ? Math.max(
        0,
        Math.round(((securityChecks - securityIssues) / securityChecks) * 100),
      )
    : 100;
  return (
    <>
      <section>
        <div className="intro">
          <div>
            <h2>자산 현황</h2>
            <p>전체 IT 자산의 상태를 확인하세요.</p>
          </div>
          <button onClick={load}>↻ 새로고침</button>
        </div>
        <div className="stats">
          <Stat label="전체 PC" value={stats.total} icon="▣" tone="blue" />
          <Stat label="온라인" value={stats.online} icon="✓" tone="green" />
          <Stat label="오프라인" value={stats.offline} icon="–" tone="gray" />
          <Stat
            label="장기 미접속"
            value={stats.stale}
            icon="!"
            tone="orange"
          />
        </div>
        <div className="dashboard-insights">
          <div>
            <span>BitLocker 조치 필요</span>
            <b>{stats.security.bitlocker}</b>
            <small>암호화 미적용 장비</small>
          </div>
          <div>
            <span>백신 상태 확인</span>
            <b>{stats.security.antivirus}</b>
            <small>정상 상태가 아닌 장비</small>
          </div>
          <div className="coverage">
            <span>Agent 연결률</span>
            <b>
              {stats.total ? Math.round((stats.online / stats.total) * 100) : 0}
              %
            </b>
            <small>최근 15분 보고 기준</small>
          </div>
          <div><span>보증 만료 예정</span><b>{stats.management?.warrantyExpiring || 0}</b><small>90일 이내 만료</small></div>
          <div><span>실사 지연</span><b>{stats.management?.overdueAudit || 0}</b><small>다음 실사일 경과</small></div>
        </div>
        <div className="operations-grid">
          <article className="panel compliance-panel">
            <div className="panel-heading">
              <div>
                <h3>보안 준수 현황</h3>
                <p>필수 보안 통제 적용률</p>
              </div>
              <span>LIVE</span>
            </div>
            <div className="compliance-content">
              <div className="donut" style={{ "--p": compliance }}>
                <b>{compliance}%</b>
              </div>
              <div className="compliance-legend">
                <p>
                  <span>
                    <i className="legend-dot good" />
                    정상 보안 항목
                  </span>
                  <b>{Math.max(0, securityChecks - securityIssues)}</b>
                </p>
                <p>
                  <span>
                    <i className="legend-dot warn" />
                    조치 필요 항목
                  </span>
                  <b>{securityIssues}</b>
                </p>
                <small>
                  BitLocker 및 실시간 백신 상태를 기준으로 산정합니다.
                </small>
              </div>
            </div>
          </article>
          <article className="panel action-panel">
            <div className="panel-heading">
              <div>
                <h3>운영 조치 센터</h3>
                <p>우선 확인이 필요한 항목</p>
              </div>
              <button onClick={all}>자산 관리 →</button>
            </div>
            <div className="action-list">
              <div>
                <i className="shield-action">!</i>
                <span>
                  <b>디스크 암호화</b>
                  <small>BitLocker 미적용 또는 확인 불가</small>
                </span>
                <strong>{stats.security.bitlocker}</strong>
              </div>
              <div>
                <i className="virus-action">+</i>
                <span>
                  <b>Endpoint 보안</b>
                  <small>백신 상태가 Healthy가 아닌 장비</small>
                </span>
                <strong>{stats.security.antivirus}</strong>
              </div>
              <div>
                <i className="stale-action">⌁</i>
                <span>
                  <b>장기 미접속</b>
                  <small>7일 이상 Agent 보고가 없는 장비</small>
                </span>
                <strong>{stats.stale}</strong>
              </div>
            </div>
          </article>
        </div>
      </section>
      <section className="panel table">
        <div className="title">
          <div>
            <h3>최근 접속 자산</h3>
            <p>에이전트가 최근 보고한 장비입니다.</p>
          </div>
          <button onClick={all}>전체 보기 →</button>
        </div>
        <AssetTable rows={rows} loading={loading} onDetail={onDetail} />
      </section>
    </>
  );
}
function Stat({ label, value, icon, tone }) {
  return (
    <article>
      <i className={tone}>{icon}</i>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>Agent 보고 기준</small>
    </article>
  );
}
createRoot(document.getElementById("root")).render(<App />);

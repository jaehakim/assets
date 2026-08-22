import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import mermaid from "mermaid";
import "./style.css";
import "./operations.css";
import "./asset-detail.css";
import "./admin-kit.css";
const menus = [
  "대시보드",
  "자산 관리",
  "Agent 배포",
  "업데이트 이력",
  "시스템 가이드",
  "점검 일지",
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
    [busy, setBusy] = useState(false);
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
            조직의 모든 IT 자산을
            <br />
            한눈에 관리하세요.
          </h2>
          <p>
            장비 현황, 보안 기준, 소프트웨어와 Agent 상태를 하나의 운영 화면에서
            확인합니다.
          </p>
          <ul>
            <li>실시간 자산 인벤토리</li>
            <li>보안 규정 준수 현황</li>
            <li>안전한 Agent 자동 업데이트</li>
          </ul>
        </div>
        <small>AssetFlow · Enterprise Asset Intelligence</small>
      </section>
      <form onSubmit={submit}>
        <div className="brand">
          <b>A</b> AssetFlow
        </div>
        <h1>관리자 로그인</h1>
        <p>IT 자산 정보는 인증된 관리자만 확인할 수 있습니다.</p>
        <label>
          아이디
          <input
            autoFocus
            value={u}
            onChange={(e) => setU(e.target.value)}
            required
          />
        </label>
        <label>
          비밀번호
          <input
            type="password"
            value={p}
            onChange={(e) => setP(e.target.value)}
            required
          />
        </label>
        {error && <div className="loginerror">{error}</div>}
        <button disabled={busy}>{busy ? "로그인 중…" : "로그인"}</button>
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
                      <td className="inspection-notes">{r.notes}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan="7" className="none">
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
              ? "자료 수집과 자동 업데이트 구조를 독립된 운영 문서로 확인합니다."
              : view === "history"
                ? "장비별 Agent 등록과 버전 변경 결과를 확인합니다."
                : "신규 Agent 실행파일과 주요 변경내역을 안전하게 배포합니다."}
          </p>
        </div>
      </div>
      {view === "guide" && (
        <>
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
function AssetDetailModal({ assetId, onClose }) {
  const [data, setData] = useState(null),
    [error, setError] = useState(""),
    [softwareQ, setSoftwareQ] = useState("");
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
function AssetTable({ rows, loading, onDetail }) {
  return (
    <div className="tablewrap">
      <table>
        <thead>
          <tr>
            <th>장비명 / 상세정보</th>
            <th>사용자 / 부서</th>
            <th>운영체제</th>
            <th>Agent 버전</th>
            <th>IP 주소</th>
            <th>마지막 접속</th>
            <th>상태</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr>
              <td colSpan="7">불러오는 중…</td>
            </tr>
          ) : !rows.length ? (
            <tr>
              <td colSpan="7" className="none">
                등록된 자산이 없습니다.
              </td>
            </tr>
          ) : (
            rows.map((a) => (
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
                <td>
                  {a.username || "-"} / {a.department || "미지정"}
                </td>
                <td>
                  {a.os_name || "-"} {a.os_version || ""}
                </td>
                <td>
                  <b>v{a.agent_version || "-"}</b>
                </td>
                <td>{a.ip_address || "-"}</td>
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
    </div>
  );
}
function App() {
  const [user, setUser] = useState(undefined),
    [active, setActive] = useState("대시보드"),
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
  return (
    <>
      <aside>
        <div className="brand">
          <b>A</b> AssetFlow
        </div>
        <nav>
          {menus.map((n) => (
            <button
              key={n}
              className={active === n ? "on" : ""}
              onClick={() => setActive(n)}
            >
              <span>{n === "대시보드" ? "⌂" : "▣"}</span>
              {n}
            </button>
          ))}
        </nav>
        <div className="profile">
          <i>{user.username[0].toUpperCase()}</i>
          <div>
            <b>{user.username}</b>
            <small>시스템 관리자</small>
          </div>
          <button onClick={logout}>로그아웃</button>
        </div>
      </aside>
      <main>
        <header>
          <div>
            <small>IT ASSET MANAGEMENT</small>
            <h1>{active}</h1>
          </div>
          {["대시보드", "자산 관리"].includes(active) && (
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="자산, 사용자 검색"
            />
          )}
        </header>
        {active === "Agent 배포" ? (
          <AgentOps view="release" />
        ) : active === "업데이트 이력" ? (
          <AgentOps view="history" />
        ) : active === "시스템 가이드" ? (
          <AgentOps view="guide" />
        ) : active === "점검 일지" ? (
          <InspectionLog />
        ) : active === "자산 관리" ? (
          <section>
            <div className="intro">
              <div>
                <h2>자산 목록</h2>
                <p>장비를 검색하고 상태를 확인하세요.</p>
              </div>
            </div>
            <article className="panel table">
              <AssetTable
                rows={filtered}
                loading={loading}
                onDetail={setDetailId}
              />
            </article>
          </section>
        ) : (
          <Dashboard
            stats={stats}
            rows={filtered.slice(0, 6)}
            loading={loading}
            load={load}
            all={() => setActive("자산 관리")}
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

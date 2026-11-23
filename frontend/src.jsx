import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { createRoot } from "react-dom/client";
import { AgGridReact } from "ag-grid-react";
import { AllCommunityModule, ModuleRegistry, themeBalham } from "ag-grid-community";
import mermaid from "mermaid";
import "./styles/tokens.css";
import "./styles/app.css";
ModuleRegistry.registerModules([AllCommunityModule]);
const assetGridTheme = themeBalham.withParams({
  accentColor: "#2f5f9f",
  backgroundColor: "#ffffff",
  borderColor: "#b7c1ce",
  borderRadius: 0,
  fontFamily: "'Pretendard Variable',Pretendard,sans-serif",
  fontSize: 13,
  foregroundColor: "#25354d",
  headerBackgroundColor: "#dce6f2",
  headerFontWeight: 600,
  rowHoverColor: "#dfeaf7",
  selectedRowBackgroundColor: "#c8ddf3",
  spacing: 4,
});

function ExtColumnHeader({ displayName, column, api, enableSorting, progressSort, setSort }) {
  const triggerRef = useRef(null);
  const menuRef = useRef(null);
  const menuId = useId();
  const [, refresh] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState({ top: 0, left: 0 });
  useEffect(() => {
    const update = () => refresh((value) => value + 1);
    column.addEventListener("sortChanged", update);
    api.addEventListener("columnPinned", update);
    api.addEventListener("columnVisible", update);
    return () => {
      column.removeEventListener("sortChanged", update);
      api.removeEventListener("columnPinned", update);
      api.removeEventListener("columnVisible", update);
    };
  }, [api, column]);
  useEffect(() => {
    if (!menuOpen) return undefined;
    const close = (event) => {
      if (event.type === "keydown" && event.key !== "Escape") return;
      if (event.type === "pointerdown" && (event.target.closest?.(".x-header-menu") || triggerRef.current?.contains(event.target))) return;
      if (event.type === "scroll" && event.target.closest?.(".x-header-menu")) return;
      if (event.type === "keydown") { event.stopPropagation(); triggerRef.current?.focus(); }
      setMenuOpen(false);
    };
    window.addEventListener("pointerdown", close);
    window.addEventListener("keydown", close, true);
    window.addEventListener("resize", close);
    window.addEventListener("scroll", close, true);
    return () => {
      window.removeEventListener("pointerdown", close);
      window.removeEventListener("keydown", close, true);
      window.removeEventListener("resize", close);
      window.removeEventListener("scroll", close, true);
    };
  }, [menuOpen]);
  useEffect(() => {
    if (!menuOpen) return;
    menuRef.current?.querySelector('[role="menuitem"]:not(:disabled)')?.focus();
  }, [menuOpen]);
  const menuItems = () => [...(menuRef.current?.querySelectorAll('[role="menuitem"]:not(:disabled), [role="menuitemcheckbox"]:not(:disabled)') || [])];
  const onMenuKeyDown = (event) => {
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    const items = menuItems();
    if (!items.length) return;
    event.preventDefault();
    event.stopPropagation();
    const index = items.indexOf(document.activeElement);
    const next = event.key === "Home" ? 0 : event.key === "End" ? items.length - 1 : event.key === "ArrowDown" ? (index + 1) % items.length : (index - 1 + items.length) % items.length;
    items[next].focus();
  };
  const sort = column.getSort();
  const allColumns = api.getAllGridColumns();
  const visibleCount = allColumns.filter((item) => item.isVisible()).length;
  const run = (action) => { action(); setMenuOpen(false); };
  return <div className={`x-column-header${sort ? ` is-sorted is-${sort}` : ""}`}>
    <button className="x-column-title" type="button" onClick={(event) => enableSorting && progressSort(event.shiftKey)} title={enableSorting ? `${displayName} 정렬` : displayName}>
      <span>{displayName}</span>
    </button>
    <button ref={triggerRef} className={`x-column-trigger${menuOpen ? " is-open" : ""}`} type="button" aria-label={`${displayName} 열 메뉴`} aria-haspopup="menu" aria-expanded={menuOpen} aria-controls={menuOpen ? menuId : undefined} onClick={(event) => {
      event.stopPropagation();
      const rect = triggerRef.current.getBoundingClientRect();
      setMenuPosition({ top: Math.max(4, Math.min(rect.bottom + 2, window.innerHeight - 440)), left: Math.max(4, Math.min(rect.right - 218, window.innerWidth - 224)) });
      setMenuOpen((value) => !value);
    }}><span/></button>
    {menuOpen && createPortal(<div ref={menuRef} id={menuId} className="x-header-menu" style={menuPosition} role="menu" aria-label={`${displayName} 컬럼 메뉴`} onPointerDown={(event) => event.stopPropagation()} onKeyDown={onMenuKeyDown}>
      <button role="menuitem" disabled={!enableSorting || sort === "asc"} onClick={() => run(() => setSort("asc"))}><i>↑</i>오름차순 정렬</button>
      <button role="menuitem" disabled={!enableSorting || sort === "desc"} onClick={() => run(() => setSort("desc"))}><i>↓</i>내림차순 정렬</button>
      <button role="menuitem" disabled={!sort} onClick={() => run(() => setSort(null))}><i>×</i>정렬 해제</button>
      <hr/>
      <button role="menuitem" disabled={!column.isFilterAllowed()} onClick={() => run(() => api.showColumnFilter(column))}><i>⌕</i>컬럼 필터</button>
      <hr/>
      <button role="menuitem" onClick={() => run(() => api.setColumnsPinned([column], "left"))}><i>◧</i>왼쪽에 고정</button>
      <button role="menuitem" onClick={() => run(() => api.setColumnsPinned([column], "right"))}><i>◨</i>오른쪽에 고정</button>
      <button role="menuitem" disabled={!column.isPinned()} onClick={() => run(() => api.setColumnsPinned([column], null))}><i>◇</i>고정 해제</button>
      <hr/>
      <button role="menuitem" onClick={() => run(() => api.autoSizeColumns([column]))}><i>↔</i>현재 컬럼 자동 맞춤</button>
      <button role="menuitem" onClick={() => run(() => api.autoSizeAllColumns())}><i>⇔</i>전체 컬럼 자동 맞춤</button>
      <hr/>
      <div className="x-header-menu-label" id={`${menuId}-columns-label`}>표시할 컬럼</div>
      <div className="x-header-columns" role="group" aria-labelledby={`${menuId}-columns-label`}>{allColumns.map((item) => {
        const definition = item.getColDef();
        const name = definition.headerName || definition.field || "컬럼";
        const visible = item.isVisible();
        return <label key={item.getColId()}><input type="checkbox" role="menuitemcheckbox" aria-checked={visible} checked={visible} disabled={visible && visibleCount === 1} onChange={(event) => api.setColumnsVisible([item], event.target.checked)}/><span>{name}</span></label>;
      })}</div>
    </div>, document.body)}
  </div>;
}

function DataGrid({ rows = [], columns, loading = false, empty = "조회된 데이터가 없습니다.", pageSize = 20, onRowClicked, className = "", label = "데이터 목록", autoHeight = false, searchValue, onSearchChange, onReset, searchLabel }) {
  const defaultColDef = useMemo(() => ({ sortable: true, filter: true, resizable: true, minWidth: 90, headerComponent: ExtColumnHeader, suppressHeaderMenuButton: true, tooltipValueGetter: ({ value }) => value == null ? "" : String(value), getQuickFilterText: (params) => typeof params.colDef.valueFormatter === "function" ? `${params.value ?? ""} ${params.colDef.valueFormatter(params)}` : String(params.value ?? "") }), []);
  const gridRef = useRef();
  const [localSearch, setLocalSearch] = useState("");
  const quickFilter = searchValue ?? localSearch;
  const setQuickFilter = onSearchChange ?? setLocalSearch;
  const [displayed, setDisplayed] = useState(rows.length);
  const [selected, setSelected] = useState(0);
  // 디자인 가이드 §6: 표 기본 행 간격은 조밀(38px). 보통(48px)은 화면에서 전환.
  const [compact, setCompact] = useState(true);

  const localeText = useMemo(() => ({
    pageSizeSelectorLabel: "페이지당", page: "페이지", to: "–", of: "/", more: "더보기", next: "다음", last: "마지막",
    first: "처음", previous: "이전", loadingOoo: "데이터를 불러오는 중…", noRowsToShow: empty,
    searchOoo: "검색…", selectAll: "전체 선택", blanks: "빈 값", filterOoo: "필터…",
  }), [empty]);
  function clearGrid(){setQuickFilter("");gridRef.current?.api.setFilterModel(null);onReset?.();}
  function updateCounts({ api }) { setDisplayed(api.getDisplayedRowCount()); setSelected(api.getSelectedRows().length); }
  const pageSizes = useMemo(() => [...new Set([10, 20, 50, 100, pageSize])].sort((a, b) => a - b), [pageSize]);
  // 디자인 가이드 §6: 데이터가 0건이면 검색·페이지 도구 없이 한 줄 안내만 보인다(큰 빈 표 금지).
  if (!loading && rows.length === 0 && !quickFilter) return <section className={`x-grid-panel x-grid-empty ${className}`} aria-label={label}>
    <p className="grid-empty-state" role="status"><Core16Icon name="table" /><span>{empty}</span></p>
  </section>;
  return <section className={`x-grid-panel ${autoHeight ? "content-grid" : ""} ${className}`} aria-label={label}>
    <div className="x-grid-toolbar">
      <label><Core16Icon name="search"/><input value={quickFilter} onChange={(e)=>setQuickFilter(e.target.value)} placeholder={searchLabel || "현재 목록 검색"} aria-label={searchLabel || `${label} 검색`}/></label>
      <span role="status" aria-live="polite"><b>{displayed}</b> / {rows.length}건</span>
      {selected>0&&<span>선택 <b>{selected}</b>건</span>}
      <div className="x-grid-toolbar-actions">
        <button type="button" onClick={()=>setCompact((value)=>!value)} title={compact ? "행 높이 48px로 넓히기" : "행 높이 38px로 좁히기"}><Core16Icon name="table"/>{compact?"보통 간격으로":"조밀 간격으로"}</button>
        <button type="button" onClick={clearGrid}><Core16Icon name="refresh"/>필터 초기화</button>
      </div>
    </div>
    <div className="enterprise-grid">
      <AgGridReact
        ref={gridRef}
        theme={assetGridTheme}
        rowData={rows}
        columnDefs={columns}
        defaultColDef={defaultColDef}
        loading={loading}
        quickFilterText={quickFilter}
        pagination
        paginationPageSize={pageSize}
        paginationPageSizeSelector={pageSizes}
        domLayout={autoHeight ? "autoHeight" : "normal"}
        localeText={localeText}
        popupParent={document.body}
        noRowsOverlayComponent={() => <span className="grid-empty">{empty}</span>}
        onRowClicked={onRowClicked}
        onModelUpdated={updateCounts}
        onFilterChanged={updateCounts}
        onSelectionChanged={({api})=>setSelected(api.getSelectedRows().length)}
        rowSelection={{mode:"singleRow",checkboxes:false,enableClickSelection:true}}
        rowHeight={compact?38:48}
        headerHeight={36}
        animateRows={false}
      />
    </div>
  </section>;
}
function ReferenceGrid({ label, rows, headers = ["항목", "내용", "적용 / 구분"] }) {
  const data = useMemo(() => rows.map(([item, description, scope]) => ({ item, description, scope: scope || "—" })), [rows]);
  const columns = useMemo(() => [
    { field: "item", headerName: headers[0], minWidth: 160, width: 185, wrapText: true, autoHeight: true },
    { field: "description", headerName: headers[1], minWidth: 240, flex: 1, wrapText: true, autoHeight: true },
    { field: "scope", headerName: headers[2], minWidth: 135, width: 155, wrapText: true, autoHeight: true },
  ], [headers]);
  return <DataGrid label={label} rows={data} columns={columns} pageSize={10} autoHeight className="reference-grid" />;
}

const menuGroups = [
  {
    label: "OVERVIEW",
    items: [
      { name: "대시보드", icon: "dashboard" },
      { name: "자산 관리", icon: "table" },
      { name: "SW 컴플라이언스", icon: "shield" },
      { name: "주변기기·USB", icon: "monitor" },
      { name: "자산 점검", icon: "audit" },
    ],
  },
  {
    label: "AGENT MANAGEMENT",
    items: [
      { name: "Agent 배포", icon: "upload" },
      { name: "업데이트 이력", icon: "history" },
    ],
  },
  {
    label: "OPERATIONS",
    items: [
      { name: "시스템 가이드", icon: "book" },
      { name: "서버 모니터링", icon: "chart-line" },
      { name: "점검 일지", icon: "checklist" },
    ],
  },
];
const iconPaths = {
  dashboard:"M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z",
  table:"M3 4h18v16H3z M3 9h18 M9 9v11", shield:"M12 2l8 4v6c0 5-8 10-8 10S4 17 4 12V6z M8 12l3 3 5-6",
  upload:"M12 16V3 M7 8l5-5 5 5 M4 15v6h16v-6", history:"M3 11a9 9 0 1 1 2 7 M3 4v7h7 M12 7v6l4 2",
  book:"M3 4h7l2 2 2-2h7v16h-7l-2 2-2-2H3z M12 6v16", "chart-line":"M3 3v18h18 M6 16l5-6 4 3 6-8",
  checklist:"M9 5h12 M9 12h12 M9 19h12 M2 4l2 2 3-3 M2 11l2 2 3-3 M2 18l2 2 3-3",
  search:"M10 3a7 7 0 1 0 0 14 7 7 0 0 0 0-14 M15 15l6 6", refresh:"M20 10a8 8 0 1 0-2 8 M20 3v7h-7",
  // 버튼·상태 아이콘 (디자인 가이드 §4) — 같은 의미에는 항상 같은 아이콘
  download:"M12 3v12 M7 10l5 5 5-5 M4 20h16", save:"M5 3h11l3 3v15H5z M8 3v5h7V3 M8 21v-7h8v7", plus:"M12 5v14 M5 12h14",
  trash:"M4 7h16 M9 7V4h6v3 M6 7l1 14h10l1-14 M10 11v6 M14 11v6", ban:"M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18 M5.6 5.6l12.8 12.8",
  unlock:"M5 11h14v10H5z M8 11V7a4 4 0 0 1 7.6-1.8", lock:"M5 11h14v10H5z M8 11V7a4 4 0 0 1 8 0v4 M12 15v2",
  sync:"M4 12a8 8 0 0 1 14-5.3 M18 3v4h-4 M20 12a8 8 0 0 1-14 5.3 M6 21v-4h4", "arrow-right":"M5 12h14 M13 6l6 6-6 6",
  logout:"M10 4H4v16h6 M15 8l4 4-4 4 M19 12H9", close:"M6 6l12 12 M18 6L6 18", check:"M5 12l5 5 9-10",
  alert:"M12 3l10 18H2z M12 10v5 M12 18h.01", clock:"M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18 M12 7v5l3 2",
  offline:"M3 3l18 18 M8.5 16a5 5 0 0 1 7 0 M5 12.5a10 10 0 0 1 4-2.4 M12 20h.01", menu:"M4 6h16 M4 12h16 M4 18h16",
  copy:"M8 8h12v12H8z M4 16V4h12", play:"M7 4l13 8-13 8z",
  monitor:"M3 4h18v12H3z M8 20h8 M12 16v4", audit:"M5 3h14v18H5z M9 8l2 2 4-4 M9 15h6",
};
function Core16Icon({name}){return <svg className="core16-icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d={iconPaths[name] || iconPaths.dashboard}/></svg>}
/** 상태 배지(디자인 가이드 §7): ok 정상·온라인 / warn 확인 필요 / danger 차단·금지 / neutral 오프라인·없음 / info 검토. */
function StatusBadge({ tone = "neutral", dot = false, icon, children }) {
  return <em className={`status-badge status-${tone}`}>{dot && <i aria-hidden="true" />}{icon && <Core16Icon name={icon} />}{children}</em>;
}
/** 버튼 라벨 = 아이콘 + 글자(디자인 가이드 §4). 아이콘만으로 의미를 전달하지 않는다. trailing은 이동 버튼의 →. */
function BtnLabel({ icon, children, trailing = false }) {
  return trailing ? <><span>{children}</span><Core16Icon name={icon} /></> : <><Core16Icon name={icon} /><span>{children}</span></>;
}
/** 결과 메시지 앞 이모지(장식, 스크린리더 제외): 성공 ✅ · 주의 ⚠️ · 실패 ⛔ (디자인 가이드 §5). */
const feedbackTone = (text = "") => /실패|오류|거부|불가/.test(text) ? "error" : /않았|미설정|필요|주의/.test(text) ? "warn" : "ok";
function Feedback({ text, as: Tag = "p", className = "" }) {
  if (!text) return null;
  const tone = feedbackTone(String(text));
  return <Tag className={`feedback feedback-${tone} ${className}`} role="status"><span className="feedback-emoji" aria-hidden="true">{{ ok: "✅", warn: "⚠️", error: "⛔" }[tone]}</span><span>{text}</span></Tag>;
}
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
          <span className="login-kicker">IT 자산관리</span>
          <div className="login-hero-title">
            IT 자산 운영의 기준을
            <br />
            하나의 화면에.
          </div>
          <p>
            수집부터 보안, 생애주기와 시스템 운영까지 신뢰할 수 있는 데이터로
            관리하세요.
          </p>
          <div className="login-capabilities">
            <div><i>01</i><span><b>Asset Intelligence</b><small>장비·사용자·소프트웨어 통합 인벤토리</small></span></div>
            <div><i>02</i><span><b>Security Posture</b><small>암호화·백신·보안 기준 상태 추적</small></span></div>
            <div><i>03</i><span><b>Lifecycle Control</b><small>도입부터 실사·보증·폐기까지 관리</small></span></div>
          </div>
          <div className="login-live"><span>자산 · 보안 · 운영 이력</span><small>관리자 전용 업무 공간</small></div>
        </div>
        <small>© 2026 AssetFlow · Enterprise Asset Intelligence</small>
      </section>
      <form onSubmit={submit}>
        <div className="access-terminal-bar"><span><i /> 관리자 로그인</span><b>AF-OPS / 01</b></div>
        <div className="brand">
          <b>A</b> AssetFlow
        </div>
        <span className="form-kicker">ASSETFLOW 관리자</span>
        <h1>IT 운영 관리자 접속</h1>
        <p>자산 인벤토리와 시스템 운영 환경에 안전하게 접속합니다.</p>
        <div className="secure-notice"><i>✓</i><span><b>관리자 인증</b><small>{location.protocol === "https:" ? "HTTPS 암호화 연결을 사용 중입니다." : "현재 HTTP 연결입니다. 운영 시 HTTPS 주소를 이용하세요."}</small></span></div>
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
        <button className="login-submit" disabled={busy}>{busy ? <><i className="login-spinner" /> 인증 확인 중…</> : <BtnLabel icon="arrow-right" trailing>관리자 로그인</BtnLabel>}</button>

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
        fontFamily: "'Pretendard Variable', Pretendard, 'Malgun Gothic', sans-serif",
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
    [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  const columns = useMemo(() => [
    { field: "version", headerName: "버전", width: 105, pinned: "left", valueFormatter: ({ value }) => `v${value}` },
    { field: "filename", headerName: "파일", minWidth: 220 },
    { field: "size_bytes", headerName: "크기", width: 110, valueFormatter: ({ value }) => `${(Number(value) / 1024 / 1024).toFixed(1)} MB` },
    { field: "release_notes", headerName: "주요 변경내역", minWidth: 360, flex: 1 },
    { field: "created_at", headerName: "등록 시각", minWidth: 180, valueFormatter: ({ value }) => date(value) },
    { field: "uploaded_by", headerName: "등록자", width: 120, valueFormatter: ({ value }) => value || "-" },
  ], []);
  async function load() {
    setLoading(true);
    try {
      setRows(await api("/api/v1/admin/agent-releases"));
      setError("");
    } catch (e) {
      setError(e.message);
    } finally { setLoading(false); }
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
        <DataGrid label="등록된 Agent 버전" rows={rows} columns={columns} loading={loading} empty="등록된 버전이 없습니다." className="menu-grid" />
      )}
    </div>
  );
}
function UpdateHistory() {
  const [rows, setRows] = useState([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  const columns = useMemo(() => [
    { field: "hostname", headerName: "장비명", minWidth: 170, pinned: "left" },
    { field: "from_version", headerName: "이전 버전", width: 120, valueFormatter: ({ value }) => value ? `v${value}` : "-" },
    { field: "to_version", headerName: "현재 버전", width: 120, valueFormatter: ({ value }) => `v${value}` },
    { field: "event_type", headerName: "구분", width: 120, valueFormatter: ({ value }) => value === "REGISTERED" ? "최초 등록" : "업데이트" },
    { field: "created_at", headerName: "확인 시각", minWidth: 180, flex: 1, sort: "desc", valueFormatter: ({ value }) => date(value) },
  ], []);
  async function load() {
    setLoading(true);
    try {
      setRows(await api("/api/v1/admin/agent-update-history"));
      setError("");
    } catch (e) {
      setError(e.message);
    } finally { setLoading(false); }
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
        <DataGrid label="장비 업데이트 이력" rows={rows} columns={columns} loading={loading} empty="확인된 업데이트 이력이 없습니다." className="menu-grid" />
      )}
    </div>
  );
}
function InspectionLog() {
  const [rows, setRows] = useState([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const columns = useMemo(() => [
    { field: "created_at", headerName: "점검 시각", minWidth: 165, pinned: "left", sort: "desc", valueFormatter: ({ value }) => date(value) },
    { field: "status", headerName: "구분", width: 115, cellRenderer: ({ value }) => <StatusBadge tone={value === "NORMAL" ? "ok" : "warn"}>{value === "NORMAL" ? "정상" : "확인 필요"}</StatusBadge> },
    { field: "db_status", headerName: "DB", width: 100 },
    { headerName: "온라인 / 전체", width: 130, valueGetter: ({ data }) => `${data.online_assets} / ${data.total_assets}` },
    { field: "stale_assets", headerName: "장기 미접속", width: 120 },
    { field: "security_alerts", headerName: "보안 확인", width: 110 },
    // 참/거짓 값은 AG Grid가 체크박스로 그리므로 글자 값으로 내보낸다(디자인 가이드 §6).
    { colId: "node_ready", headerName: "Node", width: 110, valueGetter: ({ data }) => data.node_ready ? "Ready" : "Not Ready", cellClass: ({ data }) => data?.node_ready ? "ok-text" : "bad-text" },
    { headerName: "Pod", width: 130, valueGetter: ({ data }) => `${data.pod_ready ?? 0}/${data.pod_total ?? 0} · R${data.pod_restarts ?? 0}` },
    { headerName: "CPU / RAM", minWidth: 170, valueGetter: ({ data }) => `${show(data.cpu_usage)} / ${show(data.memory_usage)}` },
    { field: "storage_allocatable", headerName: "HDD", width: 120, valueFormatter: ({ value }) => show(value) },
    { field: "git_sha", headerName: "Git SHA", width: 110, valueFormatter: ({ value }) => value === "local" ? "local" : value?.slice(0, 8) || "-" },
    { field: "notes", headerName: "점검 내용", minWidth: 320, flex: 1 },
  ], []);
  async function load() {
    setLoading(true);
    try {
      setRows(await api("/api/v1/admin/system-inspections"));
      setError("");
    } catch (e) {
      setError(e.message);
    } finally { setLoading(false); }
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
          <h1>시스템 점검 일지</h1>
          <p>
            매일 06:10에 자산 연결, 보안 기준과 데이터베이스 상태를 1회
            기록합니다. 수동 점검은 오늘 기록을 갱신합니다.
          </p>
        </div>
        <button className="btn-primary" onClick={run} disabled={busy}>
          <BtnLabel icon="play">{busy ? "점검 중…" : "지금 점검"}</BtnLabel>
        </button>
      </div>
      <article className="panel table">
        <div className="inspection-summary">
          <b>{rows.length ? date(rows[0].created_at) : "-"}</b>
          <span>최근 점검</span>
          <StatusBadge tone={!rows.length ? "neutral" : rows[0]?.status === "NORMAL" ? "ok" : "warn"}>
            {!rows.length ? "점검 이력 없음" : rows[0]?.status === "NORMAL" ? "정상" : "확인 필요"}
          </StatusBadge>
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
          <DataGrid label="시스템 점검 일지" rows={rows} columns={columns} loading={loading} empty="저장된 점검 기록이 없습니다." className="inspection-grid" pageSize={20} />
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
  const workloadColumns = useMemo(() => [
    { field: "name", headerName: "워크로드", minWidth: 150 },
    { field: "detail", headerName: "설명", minWidth: 220, flex: 1 },
    { field: "ready", headerName: "준비", width: 90 },
    { field: "total", headerName: "전체", width: 90 },
    { colId: "state", headerName: "상태", width: 110,
      valueGetter: ({ data }) => data.ready >= data.total ? "정상" : "확인 필요",
      cellRenderer: ({ value }) => <StatusBadge tone={value === "정상" ? "ok" : "warn"}>{value}</StatusBadge> },
  ], []);
  const workloads = useMemo(() => data ? [
    { name: "Backend API", detail: "Spring Boot · inventory/admin API", ready: data.backendReady, total: 2 },
    { name: "Frontend Web", detail: "Nginx · React admin console", ready: data.frontendReady, total: 2 },
    { name: "Namespace Pods", detail: `Restart count ${data.podRestarts}`, ready: data.podReady, total: data.podTotal },
  ] : [], [data]);
  async function load() { setLoading(true); try { setData(await api("/api/v1/admin/system-inspections/live")); setError(""); } catch (e) { setError(e.message); } finally { setLoading(false); } }
  useEffect(() => { load(); const timer = setInterval(load, 20000); return () => clearInterval(timer); }, []);
  const healthy = !error && data?.nodeReady && !data?.diskPressure && data?.podReady === data?.podTotal && !data?.error;
  const memoryPct = monitorPercent(String(data?.memoryUsage).match(/\(([^)]+)/)?.[1]);
  return <section className="monitor-page"><div className="intro"><div><h1>서버 상태 모니터링</h1><p>k3s Control Plane과 AssetFlow 워크로드를 20초 간격으로 관제합니다.</p></div><div className="monitor-actions"><span><i className={healthy ? "pulse" : "pulse warn"} />{loading ? "갱신 중" : error ? "갱신 실패 · 상태 미확인" : healthy ? "정상" : "확인 필요"}</span><button onClick={load}><BtnLabel icon="refresh">새로고침</BtnLabel></button></div></div>
    {error && <div className="monitor-alert" role="alert">모니터링 API 연결 실패 · {error}{data && " · 아래는 마지막 성공 시점의 데이터입니다."}</div>}
    {data && <><div className="monitor-strip"><div><span>CONTROL PLANE</span><b>{data.nodeReady ? "ONLINE" : "OFFLINE"}</b><small>{data.nodeName} · {data.k3sVersion}</small></div><div><span>DATABASE</span><b>{data.database}</b><small>PostgreSQL connection</small></div><div><span>DEPLOY REVISION</span><b>{data.gitSha?.slice(0, 12) || "LOCAL"}</b><small>Immutable image release</small></div><div><span>LAST POLL</span><b>{new Date(data.checkedAt).toLocaleTimeString("ko-KR")}</b><small>Auto refresh · 20 sec</small></div></div>
      <div className="resource-grid"><MonitorResource label="CPU UTILIZATION" value={data.cpuUsage} percent={monitorPercent(data.cpuUsage)} note="Node compute consumption"/><MonitorResource label="MEMORY UTILIZATION" value={data.memoryUsage} percent={memoryPct} note={`Capacity ${data.memoryCapacity}`}/><article className="panel resource-panel"><div className="resource-head"><span>EPHEMERAL STORAGE</span><b>{data.storageAllocatable}</b></div><div className={`storage-state ${data.diskPressure ? "danger" : ""}`}>{data.diskPressure ? "DISK PRESSURE" : "CAPACITY NORMAL"}</div><small>Total capacity {data.storageCapacity}</small></article></div>
      <div className="workload-grid"><article className="panel workload-panel"><div className="panel-heading"><div><h3>WORKLOAD STATUS</h3><p>AssetFlow namespace deployments</p></div><span>{error ? "이전 데이터" : "최근 조회 기준"}</span></div><DataGrid label="워크로드 상태" rows={workloads} columns={workloadColumns} loading={loading} pageSize={10} autoHeight /></article><article className="panel node-panel"><div className="panel-heading"><div><h3>NODE TELEMETRY</h3><p>Single-node k3s operating state</p></div><span>{data.platform?.toUpperCase()}</span></div><dl><div><dt>Node name</dt><dd>{data.nodeName}</dd></div><div><dt>Kubernetes</dt><dd>{data.k3sVersion}</dd></div><div><dt>Registered assets</dt><dd>{data.onlineAssets} online / {data.totalAssets}</dd></div><div><dt>Disk pressure</dt><dd className={data.diskPressure ? "bad-text" : "good-text"}>{data.diskPressure ? "DETECTED" : "FALSE"}</dd></div></dl></article></div></>}
  </section>;
}
function MonitorResource({ label, value, percent, note }) { return <article className="panel resource-panel"><div className="resource-head"><span>{label}</span><b>{value}</b></div><div className="meter"><i style={{ width: `${percent}%` }} /></div><small>{note}</small></article>; }
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
  INSTALL_K3S_EXEC='server --disable traefik --disable servicelb --write-kubeconfig-mode 600' sh -
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
    id: "05", title: "배포 저장소와 Secret 준비", badge: "SECRETS", tone: "warning",
    summary: "운영 서버에 배포 저장소를 준비하고 애플리케이션 및 GHCR 인증정보를 안전하게 등록합니다.",
    command: `sudo install -d -o "$USER" -g "$USER" /opt/assetflow
git clone https://github.com/jaehakim/assets.git /opt/assetflow
cd /opt/assetflow
git fetch --prune origin
git checkout main
git pull --ff-only origin main

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
    note: "이미 저장소가 있으면 clone은 생략합니다. secret.example.yaml은 키 설명용이므로 그대로 apply하지 않습니다. 배포용 GHCR 토큰에는 private package read 권한이 필요합니다. Secret 재생성 시 각 create 명령 끝에 --dry-run=client -o yaml | kubectl apply -f -를 사용합니다."
  },
  {
    id: "06", title: "GHCR 이미지 빌드와 게시", badge: "PUBLISH", tone: "action",
    summary: "Backend와 Frontend 이미지를 대상 CPU 아키텍처로 빌드하고 불변 Git SHA 태그로 GHCR에 게시합니다.",
    command: `cd /opt/assetflow
sudo apt-get update && sudo apt-get install -y docker.io
sudo systemctl enable --now docker
sudo docker buildx create --name assetflow-builder --use 2>/dev/null || \
  sudo docker buildx use assetflow-builder
sudo docker buildx inspect --bootstrap

export GHCR_OWNER=jaehakim
export RELEASE_SHA="$(git rev-parse --short=7 HEAD)"
export TARGET_PLATFORM=linux/arm64
read -rp 'GHCR username: ' GHCR_USER
read -rsp 'GHCR token (write:packages): ' GHCR_TOKEN; echo
printf '%s' "$GHCR_TOKEN" | sudo docker login ghcr.io \
  --username "$GHCR_USER" --password-stdin

sudo docker buildx build --platform "$TARGET_PLATFORM" \
  --tag "ghcr.io/$GHCR_OWNER/assets-backend:sha-$RELEASE_SHA" \
  --tag "ghcr.io/$GHCR_OWNER/assets-backend:latest" \
  --push ./backend
sudo docker buildx build --platform "$TARGET_PLATFORM" \
  --tag "ghcr.io/$GHCR_OWNER/assets-frontend:sha-$RELEASE_SHA" \
  --tag "ghcr.io/$GHCR_OWNER/assets-frontend:latest" \
  --push ./frontend

sudo docker buildx imagetools inspect \
  "ghcr.io/$GHCR_OWNER/assets-backend:sha-$RELEASE_SHA"
sudo docker buildx imagetools inspect \
  "ghcr.io/$GHCR_OWNER/assets-frontend:sha-$RELEASE_SHA"
sudo docker logout ghcr.io
unset GHCR_TOKEN`,
    check: "두 inspect 결과에 요청한 Platform(linux/arm64)과 sha-<7자리> 태그의 digest가 표시되어야 합니다. GitHub Packages 화면에서도 두 컨테이너 버전을 확인합니다.",
    note: "현재 운영 워크플로는 linux/arm64로 빌드합니다. 노드가 x86_64이면 TARGET_PLATFORM=linux/amd64로 변경하십시오. 게시 토큰은 write:packages가 필요하며 private 저장소는 repo 권한도 필요할 수 있습니다. 일상 배포는 main push 시 GitHub Actions가 이 과정을 자동 수행합니다."
  },
  {
    id: "07", title: "GHCR 이미지로 전체 배포", badge: "DEPLOY", tone: "action",
    summary: "Kustomize로 ConfigMap, PostgreSQL, Backend, Frontend, RBAC와 PDB를 한 번에 적용합니다.",
    command: `cd /opt/assetflow
export GHCR_OWNER=jaehakim
export RELEASE_SHA="$(git rev-parse --short=7 HEAD)"

kubectl kustomize deploy/k3s | kubectl apply -f -
kubectl -n assetflow set image deployment/backend \
  backend="ghcr.io/$GHCR_OWNER/assets-backend:sha-$RELEASE_SHA"
kubectl -n assetflow set image deployment/frontend \
  frontend="ghcr.io/$GHCR_OWNER/assets-frontend:sha-$RELEASE_SHA"
kubectl -n assetflow set env deployment/backend deployment/frontend \
  DEPLOY_GIT_SHA="$(git rev-parse HEAD)"
kubectl -n assetflow get all
kubectl -n assetflow get pvc,pdb,configmap
kubectl -n assetflow get events --sort-by=.lastTimestamp`,
    check: "postgres-0은 1/1 Running, backend와 frontend Deployment는 각각 READY 2/2, PVC는 Bound, 두 PDB의 ALLOWED DISRUPTIONS는 정상 배포 후 1이어야 합니다.",
    note: "최초 이미지가 private이면 ImagePullBackOff가 발생할 수 있습니다. 이 경우 ghcr-pull의 사용자·토큰 권한과 Pod 이벤트를 확인합니다. PostgreSQL PVC는 단일 노드 local-path에 저장됩니다."
  },
  {
    id: "08", title: "배포 완료 단계별 검증", badge: "HEALTH", tone: "success",
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
    id: "09", title: "외부 프록시와 HTTPS 연결", badge: "NETWORK", tone: "info",
    summary: "Nginx Proxy Manager에서 도메인을 k3s Frontend NodePort로 전달하고 최종 공개 URL을 점검합니다.",
    command: `ip -4 route get 1.1.1.1
curl -fsSI http://<K3S_NODE_IP>:30080/
curl -fsS https://assets.2734.store/api/v1/health
curl -fsSI https://assets.2734.store/`,
    check: "Proxy Host의 Forward Hostname/IP는 k3s 노드 IP(현재 구성 예: 172.17.0.1), Forward Port는 30080입니다. 외부 health와 웹 요청이 모두 성공해야 합니다.",
    note: "SSL 인증서를 연결하고 Force SSL을 활성화합니다. 프록시가 Docker 컨테이너라면 127.0.0.1이 아닌 컨테이너에서 접근 가능한 호스트 주소를 사용합니다."
  },
  {
    id: "10", title: "이미지 갱신과 무중단 배포", badge: "UPDATE", tone: "action",
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
    id: "11", title: "롤백과 긴급 복구", badge: "ROLLBACK", tone: "warning",
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
    id: "12", title: "로그 확인과 장애 진단", badge: "TROUBLESHOOT", tone: "danger",
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
    id: "13", title: "백업·재시작·제거", badge: "MAINTENANCE", tone: "warning",
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
    check: "백업 파일 크기가 0보다 크고 별도 서버/스토리지로 복사되었는지 확인합니다. 재시작 후 08단계의 전체 검증을 반복합니다.",
    note: "k3s-uninstall.sh는 클러스터 데이터와 local-path 볼륨을 제거할 수 있는 파괴적 명령입니다. 백업·변경 승인·중단 공지를 완료한 경우에만 실행합니다."
  }
];
function CommandBlock({ children }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try { await navigator.clipboard.writeText(children); setCopied(true); setTimeout(() => setCopied(false), 1400); } catch (_) { setCopied(false); }
  }
  return <div className="manual-command"><div><span>TERMINAL · BASH</span><button type="button" onClick={copy}><BtnLabel icon={copied ? "check" : "copy"}>{copied ? "복사됨" : "명령 복사"}</BtnLabel></button></div><pre><code>{children}</code></pre></div>;
}
function K3sOperationsManual() {
  const [openStep, setOpenStep] = useState("01");
  return <article className="panel k3s-manual">
    <div className="panel-heading manual-heading"><div><small>OPERATIONS MANUAL / LINUX</small><h3>Linux → k3s → GHCR 이미지 배포 운영 절차</h3><p>단일 Linux 서버 준비부터 이미지 게시, 운영 배포, 검증, 롤백과 장애 대응까지 순서대로 수행합니다.</p></div><span>LINUX · K3S · GHCR</span></div>
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
    [uploading, setUploading] = useState(false),
    [message, setMessage] = useState("");
  async function upload(e) {
    e.preventDefault();
    const body = new FormData();
    body.append("version", version);
    body.append("releaseNotes", releaseNotes);
    body.append("file", file);
    setUploading(true);
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
    } finally { setUploading(false); }
  }
  return (
    <section>
      <div className="intro">
        <div>
          <h1>
            {view === "guide"
              ? "시스템 가이드"
              : view === "history"
                ? "업데이트 이력"
                : "Agent 배포"}
          </h1>
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
          <details className="guide-admin"><summary>서버 설치·배포 운영 매뉴얼</summary><K3sOperationsManual /></details>
          <details className="guide-admin design-guide"><summary>디자인 가이드 — 버튼·아이콘·색상·메시지</summary><DesignGuide /></details>
          <article className="panel ops">
            <div className="panel-heading">
              <div><h3>Windows Agent 설치 및 제거</h3><p>배치 파일은 관리자 권한을 자동 요청하며 서비스와 트레이 프로세스를 함께 관리합니다.</p></div>
              <span>WINDOWS · ADMIN</span>
            </div>
            <ReferenceGrid label="Windows Agent 설치 및 제거" rows={[["install-service.bat", "등록 토큰 입력 후 최신 Agent를 내려받아 크기와 SHA-256을 검증하고 서비스·트레이 앱을 설치합니다.", "신규 설치"], ["uninstall-service.bat", "서비스, 트레이 자동 시작, 실행 프로세스와 설치 파일을 제거하며 재설치를 위해 장비 식별 정보는 보존합니다.", "기본 제거"], ["uninstall-service.bat /purge", "기본 제거에 더해 ProgramData의 설정, 장비 토큰과 로컬 로그까지 영구 삭제합니다.", "완전 제거"]]} />
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
              <ReferenceGrid label="주기 및 저장 위치" rows={[["인벤토리 수집", "CollectionMinutes", "기본 60분 / 최소 5분"], ["업데이트 확인", "UpdateCheckMinutes", "기본 5분 / 최소 5분"], ["트레이 정보", "버전·PC명·사용자·모델·OS·CPU·RAM·IP"], ["Agent 설정", "%ProgramData%\\AssetFlow\\agent.json"], ["실행 로그", "%ProgramData%\\AssetFlow\\logs\\agent-YYYYMMDD.log"], ["실행파일", "%ProgramFiles%\\AssetFlow\\Agent"], ["통신 로그", "%ProgramData%\\AssetFlow\\logs\\communication-YYYYMMDD.log", "0.2.11 이상"]]} />
            </article>
          </div>

        </>
      )}
      {view === "release" && (
        <article className="panel release">
          <h3>신규 Agent 실행파일 등록</h3>
          <form onSubmit={upload}>
            <label>업데이트 등록 토큰 *<input
              type="password"
              placeholder="업데이트 등록 토큰"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              required
            /></label>
            <label>버전 * (예: 0.3.0)<input
              placeholder="버전 (예: 0.3.0)"
              pattern="[0-9]+\.[0-9]+\.[0-9]+(\.[0-9]+)?"
              value={version}
              onChange={(e) => setVersion(e.target.value)}
              required
            /></label>
            <label>Agent 실행파일 * (.exe)<input
              type="file"
              accept=".exe"
              onChange={(e) => setFile(e.target.files[0])}
              required
            /></label>
            <label>변경내역 *<textarea
              className="release-notes-input"
              placeholder="주요 변경내역을 입력하세요. 예: 장치 등록 안정성 개선 및 보안 상태 수집 항목 추가"
              value={releaseNotes}
              onChange={(e) => setReleaseNotes(e.target.value)}
              maxLength="2000"
              required
            /></label>
            <p className="upload-summary">{file ? `${file.name} · ${(file.size/1024/1024).toFixed(1)} MB · 버전 ${version || "미입력"}` : "실행파일을 선택한 뒤 버전과 변경내역을 확인하세요."}</p><button className="btn-primary" disabled={uploading}><BtnLabel icon="upload">{uploading ? "등록 중…" : "버전 등록"}</BtnLabel></button>
          </form>
          <Feedback className="result" text={message} />
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
const peripheralTypes = { MONITOR: "모니터", KEYBOARD: "키보드", MOUSE: "마우스" };
const usbCategories = { STORAGE: "저장장치", MOBILE: "휴대기기", CAMERA: "카메라", PRINTER: "프린터", NETWORK: "네트워크", SMARTCARD: "스마트카드", AUDIO: "오디오", SERIAL: "시리얼", BLUETOOTH: "블루투스", INPUT: "입력장치", OTHER: "기타" };
const connectionLabels = { Internal: "내장", USB: "USB", Bluetooth: "블루투스", "PS/2": "PS/2", HDMI: "HDMI", DisplayPort: "DisplayPort", DVI: "DVI", VGA: "VGA", Miracast: "무선(Miracast)", Other: "기타" };
const UNIDENTIFIED_USER = "미식별";
// CR-A04: Agent 0.2.11 이하는 LocalSystem의 컴퓨터 계정(예: DESKTOP-KJH$)을 보내므로 `$` 계정·NT AUTHORITY 계정도 미식별로 본다.
const isUnidentifiedUser = (name) => { if (name == null) return true; const n = String(name).trim(); const account = n.includes("\\") ? n.slice(n.lastIndexOf("\\") + 1) : n; return n === "" || account.toUpperCase() === "SYSTEM" || account.endsWith("$") || /^NT (AUTHORITY|SERVICE)\\/i.test(n); };
const userLabel = (name) => (isUnidentifiedUser(name) ? UNIDENTIFIED_USER : name);
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
function ManagementForm({ data, onSaved, onDirtyChange }) {
  const keys = ["asset_tag","lifecycle_status","category","location","assigned_to","vendor","purchase_date","purchase_cost","warranty_expires_at","eol_at","last_audit_at","next_audit_at","management_notes"];
  const [form,setForm] = useState(() => Object.fromEntries(keys.map(k => [k,data[k] ?? ""]))), [message,setMessage] = useState(""), [busy,setBusy] = useState(false);
  const historyColumns = useMemo(() => [
    { field: "created_at", headerName: "변경 시각", minWidth: 160, sort: "desc", valueFormatter: ({ value }) => date(value) },
    { field: "changed_by", headerName: "변경자", minWidth: 100 },
    { field: "details", headerName: "변경 내용", minWidth: 270, flex: 1, wrapText: true, autoHeight: true },
  ], []);
  const set = (key,value) => { onDirtyChange(true); setForm(x => ({...x,[key]:value})); };
  async function save(e) {
    e.preventDefault(); setBusy(true); setMessage("");
    try {
      const body = Object.fromEntries(Object.entries(form).map(([k,v]) => [k.replace(/_([a-z])/g,(_,c)=>c.toUpperCase()),v === "" ? null : v]));
      await api(`/api/v1/assets/${data.id}/management`,{method:"PATCH",body:JSON.stringify(body)});
      onDirtyChange(false); setMessage("관리 정보가 저장되었습니다."); await onSaved();
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
    <label className="wide">관리 메모<textarea value={form.management_notes} onChange={e=>set("management_notes",e.target.value)} /></label><div className="management-actions"><Feedback as="small" text={message} /><button className="btn-primary" disabled={busy}><BtnLabel icon="save">{busy?"저장 중…":"관리 정보 저장"}</BtnLabel></button></div>
  </form><div className="audit-history"><h4>최근 변경 이력</h4><DataGrid label="자산 변경 이력" rows={data.managementHistory || []} columns={historyColumns} pageSize={10} autoHeight empty="변경 이력이 없습니다." /></div></article>;
}
function AssetDetailModal({ assetId, onClose: closeModal }) {
  const [dirty, setDirty] = useState(false);
  const [detailSection, setDetailSection] = useState("overview");
  const dialogRef = useRef(null);
  const closeRef = useRef();
  const onClose = () => { if (!dirty || window.confirm("저장하지 않은 변경사항이 있습니다. 닫으시겠습니까?")) closeModal(); };
  closeRef.current = onClose;
  useEffect(() => {
    const previous = document.activeElement;
    const background = [...document.querySelectorAll("#root > aside, #root > main, #root > .mobile-header")];
    background.forEach(el => el.inert = true);
    dialogRef.current?.focus();
    const key = event => {
      if (event.key === "Escape") { event.preventDefault(); closeRef.current(); }
      if (event.key !== "Tab") return;
      const items = [...dialogRef.current.querySelectorAll('button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex="0"]')].filter(el => el.getClientRects().length);
      const first = items[0], last = items.at(-1);
      if (!first) { event.preventDefault(); dialogRef.current.focus(); }
      else if (event.shiftKey && (document.activeElement === first || document.activeElement === dialogRef.current)) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || document.activeElement === dialogRef.current)) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", key);
    return () => { document.removeEventListener("keydown", key); background.forEach(el => el.inert = false); if (previous?.isConnected) previous.focus(); };
  }, []);

  const [data, setData] = useState(null),
    [error, setError] = useState("");
  const loadDetail = () => api(`/api/v1/assets/${assetId}`).then(setData);
  useEffect(() => {
    let live = true;
    api(`/api/v1/assets/${assetId}`)
      .then((x) => live && setData(x))
      .catch((e) => live && setError(e.message));
    document.body.classList.add("modal-open");
    return () => {
      live = false;
      document.body.classList.remove("modal-open");
    };
  }, [assetId]);
  const softwareColumns = useMemo(() => [
    { field: "name", headerName: "프로그램", minWidth: 220, flex: 1 },
    { field: "version", headerName: "버전", minWidth: 130 },
    { field: "publisher", headerName: "게시자", minWidth: 180 },
    { field: "install_date", headerName: "설치일", minWidth: 120 },
  ], []);
  const peripheralColumns = useMemo(() => [
    { field: "device_type", headerName: "구분", width: 90, valueFormatter: ({ value }) => peripheralTypes[value] || value },
    { field: "name", headerName: "장치명", minWidth: 170, flex: 1 },
    { field: "manufacturer", headerName: "제조사", minWidth: 120, valueFormatter: ({ value }) => show(value) },
    { field: "model", headerName: "모델 코드", minWidth: 150, valueFormatter: ({ value }) => show(value) },
    { field: "serial_no", headerName: "시리얼 번호", minWidth: 140, valueFormatter: ({ value }) => show(value) },
    { field: "connection", headerName: "연결", width: 110, valueFormatter: ({ value }) => value ? connectionLabels[value] || value : "-" },
    { colId: "spec", headerName: "크기 / 제조연도", minWidth: 130,
      valueGetter: ({ data }) => [data.size_inches ? `${data.size_inches}"` : null, data.manufacture_year].filter(Boolean).join(" / ") || "-" },
    { field: "first_seen_at", headerName: "최초 확인", minWidth: 150, valueFormatter: ({ value }) => date(value) },
  ], []);
  const usbColumns = useMemo(() => [
    { colId: "present", headerName: "상태", width: 100, valueGetter: ({ data }) => data.present ? "연결됨" : "과거 연결",
      cellClass: ({ data }) => data?.present ? "ok-text" : undefined },
    { field: "category", headerName: "분류", width: 100, valueFormatter: ({ value }) => usbCategories[value] || value },
    { field: "name", headerName: "장치명", minWidth: 190, flex: 1 },
    { field: "last_arrival_at", headerName: "최근 연결", minWidth: 150, valueFormatter: ({ value }) => date(value) },
    { field: "last_removal_at", headerName: "최근 분리", minWidth: 150, valueFormatter: ({ value }) => date(value) },
    { field: "manufacturer", headerName: "제조사", minWidth: 120, valueFormatter: ({ value }) => show(value) },
    { field: "serial_no", headerName: "시리얼 번호", minWidth: 150, valueFormatter: ({ value }) => show(value) },
    { colId: "vidpid", headerName: "VID:PID", width: 115, valueGetter: ({ data }) => data.vendor_id && data.product_id ? `${data.vendor_id}:${data.product_id}` : "-" },
    { field: "first_install_at", headerName: "최초 설치", minWidth: 150, valueFormatter: ({ value }) => date(value) },
  ], []);
  const diskColumns = useMemo(() => [
    { field: "name", headerName: "볼륨", width: 105 },
    { field: "filesystem", headerName: "파일시스템", width: 120 },
    { field: "total_bytes", headerName: "전체 용량", minWidth: 120, valueFormatter: ({ value }) => bytes(value) },
    { field: "free_bytes", headerName: "여유 용량", minWidth: 120, valueFormatter: ({ value }) => bytes(value) },
    { colId: "usage", headerName: "사용률", minWidth: 180, flex: 1,
      valueGetter: ({ data }) => data.total_bytes > 0 ? Math.max(0, Math.min(100, Math.round((data.total_bytes - data.free_bytes) / data.total_bytes * 100))) : 0,
      cellRenderer: ({ value }) => <div className="grid-capacity"><span><i className={value > 90 ? "danger" : ""} style={{ width: `${value}%` }} /></span><b>{value}%</b></div> },
  ], []);
  const lastContact = data?.effective_last_seen_at || data?.last_seen_at;
  const online =
    data && Date.now() - new Date(lastContact).getTime() < 900000;
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
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={data ? `${data.hostname} 자산 상세` : "자산 상세"}
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
            <button onClick={onClose}><BtnLabel icon="close">닫기</BtnLabel></button>
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
                <StatusBadge tone={online ? "ok" : "neutral"} dot>{online ? "온라인" : "오프라인"}</StatusBadge>
                {data.agent_blocked_at && <StatusBadge tone="danger" icon="ban">Agent 차단됨</StatusBadge>}
                <small>최근 통신 {date(lastContact)}</small>
              </div>
              <button
                className="modal-close"
                onClick={onClose}
                aria-label="상세정보 닫기"
              >
                <Icon name="close" />
              </button>
            </div>
            <nav className="detail-sections" aria-label="자산 상세 항목">{Object.entries({overview:"요약",hardware:"하드웨어",software:"소프트웨어",security:"보안",management:"관리·이력"}).map(([key,label])=><button key={key} aria-pressed={detailSection===key} onClick={()=>setDetailSection(key)}>{label}</button>)}</nav>
            <div className={`modal-body detail-section-${detailSection}`}>
              <div className="asset-summary">
                <div>
                  <span>사용자</span>
                  <b className={isUnidentifiedUser(data.username) ? "user-unidentified" : undefined} title={isUnidentifiedUser(data.username) ? `사용자 미식별 (수집값: ${data.username || "없음"})` : undefined}>{userLabel(data.username)}</b>
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
                  <ManagementForm data={data} onSaved={loadDetail} onDirtyChange={setDirty} />
                  <AgentAccessCard data={data} onChanged={loadDetail} />
                  <article className="detail-card hardware-card">
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
                  <article className="detail-card hardware-card">
                    <h3>
                      <Icon name="disk" />
                      저장장치 <small>{data.disks?.length || 0}개 볼륨</small>
                    </h3>
                    <DataGrid label="저장장치" rows={data.disks || []} columns={diskColumns} empty="수집된 저장장치가 없습니다." pageSize={10} autoHeight />
                  </article>
                  <article className="detail-card hardware-card peripheral-card">
                    <h3>
                      <Icon name="device" />
                      주변기기{" "}
                      <small>{["MONITOR", "KEYBOARD", "MOUSE"].map(t => `${peripheralTypes[t]} ${(data.peripherals || []).filter(p => p.device_type === t).length}`).join(" · ")}</small>
                    </h3>
                    {data.collection_errors && <p className="sw-truncated-notice" role="alert">최근 수집 일부 실패 — 이전 값을 유지합니다: {data.collection_errors}</p>}
                    {!data.peripherals_collected_at && !data.collection_errors && <p className="sw-truncated-notice" role="note">Agent 0.2.13 이상으로 업데이트되면 모니터·키보드·마우스 정보가 수집됩니다.</p>}
                    <DataGrid label="주변기기" rows={data.peripherals || []} columns={peripheralColumns} empty={data.peripherals_collected_at ? "연결된 모니터·키보드·마우스가 없습니다." : "아직 수집되지 않았습니다."} pageSize={10} autoHeight />
                  </article>
                  <article className="detail-card hardware-card usb-card">
                    <h3>
                      <Icon name="disk" />
                      USB 장치{" "}
                      <small>연결됨 {(data.usbDevices || []).filter(u => u.present).length} · 과거 연결 {(data.usbDevices || []).filter(u => !u.present).length}</small>
                    </h3>
                    {!data.usb_collected_at && <p className="sw-truncated-notice" role="note">Agent 0.2.14 이상으로 업데이트되면 현재·과거 USB 연결 기록이 수집됩니다.</p>}
                    {data.usb_collected_at && <p className="usb-history-note">PC에 남아 있는 연결 기록(일반적으로 최근 30일 내 분리 장치까지)과 서버에 누적된 기록을 함께 표시합니다. 허브는 제외합니다.</p>}
                    <DataGrid label="USB 장치" rows={data.usbDevices || []} columns={usbColumns} empty={data.usb_collected_at ? "기록된 USB 장치가 없습니다." : "아직 수집되지 않았습니다."} pageSize={10} autoHeight />
                  </article>
                  <article className="detail-card software-card">
                    <h3>
                      <Icon name="apps" />
                      설치 소프트웨어{" "}
                      <small>총 {data.software?.length || 0}개</small>
                    </h3>
                    {data.software_truncated && <p className="sw-truncated-notice" role="note">설치 소프트웨어 {data.software_count ?? data.software?.length ?? 0}건 중 상한까지만 저장됨</p>}
                    <DataGrid label="설치 소프트웨어" rows={data.software || []} columns={softwareColumns} empty="수집된 소프트웨어가 없습니다." className="detail-data-grid" />
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
                  <article className="detail-card network-card">
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
                  <article className="detail-card identity-card">
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
function AssetTable({ rows, loading, onDetail, paginate = false, query, onQueryChange, onReset }) {
  const columns = useMemo(() => [
    { field: "hostname", headerName: "장비명", pinned: "left", minWidth: 170, getQuickFilterText: ({ data }) => `${data.hostname} ${data.serial_no || ""}`, cellRenderer: ({ data }) => <div className="grid-primary"><button className="asset-detail-link" onClick={(event)=>{event.stopPropagation();onDetail(data.id);}} aria-label={`${data.hostname} 상세 보기`}>{data.hostname}</button>{data.software_truncated && <small className="sw-truncated" title="설치 소프트웨어가 상한을 초과해 일부만 저장되었습니다">SW 목록 절삭</small>}<small>{data.serial_no || "-"}</small></div> },
    { field: "asset_tag", headerName: "자산 태그 / 생애주기", minWidth: 160, getQuickFilterText: ({ data }) => `${data.asset_tag || ""} ${lifecycleLabels[data.lifecycle_status] || data.lifecycle_status}`, cellRenderer: ({ data }) => <div className="grid-primary"><b>{data.asset_tag || "미지정"}</b><small>{lifecycleLabels[data.lifecycle_status] || data.lifecycle_status}</small></div> },
    { field: "username", headerName: "사용자 / 부서", minWidth: 150, valueGetter: ({ data }) => `${userLabel(data.username)} / ${data.department || "미지정"}`, getQuickFilterText: ({ data }) => `${userLabel(data.username)} ${data.username || ""} ${data.department || "미지정"}`, cellRenderer: ({ data }) => isUnidentifiedUser(data.username) ? <span><span className="user-unidentified" title={`사용자 미식별 (수집값: ${data.username || "없음"})`}>{UNIDENTIFIED_USER}</span> / {data.department || "미지정"}</span> : `${data.username} / ${data.department || "미지정"}` },
    { field: "os_name", headerName: "운영체제", minWidth: 190, valueGetter: ({ data }) => `${data.os_name || "-"} ${data.os_version || ""}` },
    { field: "agent_version", headerName: "Agent", width: 105, valueFormatter: ({ value }) => `v${value || "-"}` },
    { field: "ip_address", headerName: "네트워크 / 위치", minWidth: 190, getQuickFilterText: ({ data }) => `${data.ip_address || ""} ${data.server_observed_ip || ""} ${data.location || ""}`, cellRenderer: ({ data }) => <div className="grid-primary"><b>Local {data.ip_address || "-"}</b><small>Server {data.server_observed_ip || "-"} · {data.location || "미지정"}</small></div> },
    { field: "last_seen_at", headerName: "마지막 통신", minWidth: 165, sort: "desc", valueFormatter: ({ value }) => date(value), comparator: (a, b) => new Date(a) - new Date(b) },
    { field: "online", headerName: "상태", pinned: "right", width: 105, filter: false, cellRenderer: ({ value }) => <StatusBadge tone={value ? "ok" : "neutral"} dot>{value ? "온라인" : "오프라인"}</StatusBadge> },
  ], [onDetail]);
  return <DataGrid label={paginate ? "자산 관리" : "최근 보고 자산"} rows={rows} columns={columns} loading={loading} empty="등록된 자산이 없습니다." pageSize={paginate ? 20 : 10} className={paginate ? "asset-grid full-grid" : "asset-grid compact-grid"} searchValue={query} onSearchChange={onQueryChange} onReset={onReset} searchLabel="장비·사용자·부서 검색" />;
}
const complianceLabels={PROHIBITED:"사용 금지",LICENSE_REQUIRED:"라이선스 확인",REVIEW_REQUIRED:"검토 필요"};
/** 디자인 가이드(docs/23_디자인_가이드.md)의 살아 있는 견본 — 실제 컴포넌트·CSS로 그려 문서와 화면이 어긋나지 않게 한다. */
const BUTTON_RULES = [
  ["btn-primary", "save", "주요", "관리 정보 저장", "화면의 핵심 실행 1개(저장·등록·동기화·점검 실행). 한 영역에 하나만."],
  ["", "refresh", "보조", "새로고침", "새로고침·다시 시도·닫기 등 일반 동작. 흰 바탕·회색 테두리."],
  ["danger-button", "ban", "위험", "Agent 차단", "삭제·차단처럼 되돌리기 어려운 동작. 반드시 확인 대화상자."],
  ["btn-success", "unlock", "복구", "차단 해제", "차단 해제 등 원래 상태로 되돌리는 동작."],
  ["btn-link", "arrow-right", "이동", "자산 관리", "다른 화면으로 이동. 화살표는 글자 뒤."],
];
const ICON_RULES = [["refresh","새로고침·다시 시도·다시 점검"],["save","저장"],["plus","등록·추가"],["upload","업로드·버전 등록"],["download","CSV·파일 내려받기"],["sync","외부 자료 동기화"],["play","점검 실행"],["trash","삭제"],["ban","차단·폐기 토큰"],["unlock","차단 해제"],["close","닫기"],["arrow-right","화면 이동"],["copy","복사"],["logout","로그아웃"],["menu","전체 메뉴"],["lock","암호화·보안 잠금"],["shield","보안 상태"],["clock","장기 미접속·시간"],["alert","경보·주의"],["check","정상·완료"],["offline","오프라인"],["monitor","PC·모니터"]];
function DesignGuide() {
  return <div className="design-guide-body">
    <h4>1. 원칙</h4>
    <ul>
      <li><b>버튼 = 아이콘 + 글자.</b> 아이콘만 있는 버튼은 만들지 않는다(닫기 ×처럼 관례가 확실한 경우만 예외, 그때도 aria-label 필수).</li>
      <li><b>같은 의미 = 같은 아이콘·같은 단어.</b> "새로고침"을 "즉시 갱신"·"↻ 새로고침"처럼 바꿔 쓰지 않는다.</li>
      <li><b>색은 의미로만.</b> 파랑=실행·이동, 빨강=위험, 초록=정상·복구, 주황=주의. 장식용 색을 쓰지 않는다.</li>
      <li><b>이모지는 버튼에 쓰지 않는다.</b> OS마다 모양이 다르고 화면낭독기가 읽는다. 결과 메시지 앞(✅ ⚠️ ⛔)과 빈 상태 안내에만, 장식으로(aria-hidden) 쓴다.</li>
    </ul>
    <h4>2. 버튼 종류</h4>
    <div className="dg-table" role="table" aria-label="버튼 종류">
      {BUTTON_RULES.map(([cls, icon, kind, label, use]) => <div role="row" key={kind}>
        <span role="cell"><b>{kind}</b><code>{cls || "기본 button"}</code></span>
        <span role="cell"><button type="button" className={cls} tabIndex={-1} onClick={e => e.preventDefault()}><BtnLabel icon={icon} trailing={icon === "arrow-right"}>{label}</BtnLabel></button></span>
        <span role="cell">{use}</span>
      </div>)}
      <div role="row"><span role="cell"><b>내려받기</b><code>a.export-button</code></span><span role="cell"><a className="export-button" href="#" onClick={e => e.preventDefault()} tabIndex={-1}><BtnLabel icon="download">전체 자산 CSV</BtnLabel></a></span><span role="cell">CSV 등 파일 내려받기 링크. 범위를 글자로 명시(전체/모니터/USB).</span></div>
    </div>
    <h4>3. 아이콘 사전</h4>
    <div className="dg-icons">{ICON_RULES.map(([name, use]) => <span key={name}><Core16Icon name={name} /><b>{name}</b><small>{use}</small></span>)}</div>
    <h4>4. 결과 메시지</h4>
    <div className="dg-feedback">
      <Feedback text="관리 정보가 저장되었습니다." /><Feedback text="외부 기초자료 주소가 설정되지 않았습니다." /><Feedback text="차단 실패: HTTP 409" />
    </div>
    <p className="dg-note">성공 ✅(초록) · 주의 ⚠️(주황) · 실패 ⛔(빨강). 이모지는 장식이며 의미는 글자로 전달한다.</p>
    <h4>5. 색상 토큰</h4>
    <div className="dg-colors">{[["--c-primary","#315ca8","실행·이동·선택"],["--c-danger","#b42323","위험·실패"],["--c-success","#1f7a4d","정상·복구·성공"],["--c-warn","#8a5a00","주의"],["--text-primary","#203049","본문"],["--text-secondary","#536277","보조 문구"],["--line","#d4dce6","구분선"]].map(([k, v, use]) =>
      <span key={k}><i style={{ background: v }} /><b>{k}</b><small>{v} · {use}</small></span>)}</div>
    <h4>6. 글자·모서리·표</h4>
    <ul>
      <li><b>글꼴</b>: 화면 전체 Pretendard 1종, 명령어·코드만 고정폭 글꼴.</li>
      <li><b>글자 크기</b>: 11px(배지·보조) · 12px(표 머리·라벨) · 13px(표 본문) · 14px(본문) · 16px(카드 제목) · 18~20px(수치) · 24~30px(화면 제목). <b>11px 미만 금지.</b></li>
      <li><b>모서리</b>: 버튼·입력 4px, 카드·패널 8px, 상태 점·아바타만 원형.</li>
      <li><b>명도 대비</b>: 본문·보조 문구 4.5:1 이상(회색 보조 문구는 #5f6b7c 이상 진하게).</li>
      <li><b>표 행 간격</b>: 기본 <b>조밀 38px</b>(머리 36px) — 한 화면에 더 많은 행. 필요하면 표 도구의 "보통 간격으로"(48px)로 넓힌다.</li>
      <li><b>표</b>: 장치·장비 이름을 첫 열로 고정, 판단에 필요한 열(상태·시각)을 앞에. 참/거짓은 체크박스 대신 "연결됨/과거 연결"처럼 글자로. 결과 0건이면 "✓ … 없습니다" 한 줄.</li>
      <li><b>터치 영역</b>: 모바일에서 버튼·링크 24px 이상.</li>
      <li><b>CSS 위치</b>: 색·글자·모서리 값은 <code>styles/tokens.css</code>에만 둔다. 화면 CSS(<code>styles/app.css</code>)는 <code>var(--토큰)</code>만 쓴다.</li>
      <li><b>상태 배지</b>: <StatusBadge tone="ok" dot>온라인</StatusBadge> <StatusBadge tone="warn">확인 필요</StatusBadge> <StatusBadge tone="danger" icon="ban">차단됨</StatusBadge> <StatusBadge tone="neutral" dot>오프라인</StatusBadge> <StatusBadge tone="info">검토 필요</StatusBadge> — <code>StatusBadge</code> 컴포넌트만 쓴다.</li>
    </ul>
  </div>;
}

/** FR-016: 분실·유출 PC의 Agent 장치 토큰을 폐기하고 재등록을 막는다. */
function AgentAccessCard({ data, onChanged }) {
  const [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  async function block() {
    const reason = prompt(`${data.hostname} Agent를 차단합니다. 차단 사유를 입력하세요 (예: 분실 신고, 퇴사자 미반납).`);
    if (!reason || !reason.trim()) return;
    setBusy(true);
    try { await api(`/api/v1/admin/agents/${data.agent_id}/block`, { method: "POST", body: JSON.stringify({ reason: reason.trim() }) }); setMessage("Agent를 차단했습니다."); await onChanged(); }
    catch (e) { setMessage(`차단 실패: ${e.message}`); } finally { setBusy(false); }
  }
  async function unblock() {
    if (!confirm(`${data.hostname} Agent 차단을 해제하시겠습니까? 기존 장치 토큰으로 다시 통신합니다.`)) return;
    setBusy(true);
    try { await api(`/api/v1/admin/agents/${data.agent_id}/unblock`, { method: "POST" }); setMessage("차단을 해제했습니다."); await onChanged(); }
    catch (e) { setMessage(`해제 실패: ${e.message}`); } finally { setBusy(false); }
  }
  return <article className="detail-card management-card agent-access-card">
    <h3><Icon name="shield" />Agent 접속 제어</h3>
    {data.agent_blocked_at
      ? <p className="sw-truncated-notice" role="note">차단됨 · {date(data.agent_blocked_at)} · {show(data.agent_blocked_by)} · 사유: {show(data.agent_blocked_reason)}</p>
      : <p className="usb-history-note">분실·도난·미반납 PC는 Agent를 차단하면 서버 통신과 재등록이 거부됩니다. 수집된 자산 정보와 이력은 유지됩니다.</p>}
    <div className="management-actions"><Feedback as="small" text={message} />
      {data.agent_blocked_at
        ? <button type="button" className="btn-success" disabled={busy} onClick={unblock}><BtnLabel icon="unlock">차단 해제</BtnLabel></button>
        : <button type="button" className="danger-button" disabled={busy || !data.agent_id} onClick={block}><BtnLabel icon="ban">Agent 차단</BtnLabel></button>}
    </div>
  </article>;
}

const hostColumn = (onDetail, extra = {}) => ({ field: "hostname", headerName: "장비", minWidth: 140, pinned: "left", ...extra,
  cellRenderer: ({ data }) => <button className="asset-detail-link" onClick={() => onDetail(data.asset_id || data.id)} aria-label={`${data.hostname} 상세 보기`}>{data.hostname}</button> });
const personColumn = { colId: "person", headerName: "담당·사용자", minWidth: 140, valueGetter: ({ data }) => data.assigned_to || userLabel(data.username) };

/** 전사 주변기기·USB 현황: 모니터 대장(실사)과 USB 저장장치·휴대기기 사용 현황(보안 점검). */
function PeripheralInventory({ onDetail }) {
  const [tab, setTab] = useState("MONITOR"), [days, setDays] = useState(30), [category, setCategory] = useState("STORAGE");
  const [peripherals, setPeripherals] = useState({ rows: [], summary: {} }), [usb, setUsb] = useState({ rows: [], summary: {} });
  const [loading, setLoading] = useState(true), [loadError, setLoadError] = useState("");
  const usbQuery = `days=${days}${category ? `&category=${category}` : ""}`;
  async function load() {
    setLoading(true);
    try {
      const [p, u] = await Promise.all([api("/api/v1/peripherals"), api(`/api/v1/usb-devices?${usbQuery}`)]);
      setPeripherals({ rows: [], summary: {}, ...p }); setUsb({ rows: [], summary: {}, ...u }); setLoadError("");
    } catch (e) { setLoadError(`조회 실패: ${e.message}`); } finally { setLoading(false); }
  }
  useEffect(() => { load(); }, [usbQuery]);
  const year = new Date().getFullYear();
  const monitorColumns = useMemo(() => [
    { field: "name", headerName: "모니터", minWidth: 160, pinned: "left" },
    { field: "size_inches", headerName: "크기", width: 82, valueFormatter: ({ value }) => value ? `${value}"` : "-" },
    { field: "manufacture_year", headerName: "제조연도", width: 118, cellClass: ({ value }) => value && year - value >= 7 ? "warn-text" : undefined,
      valueFormatter: ({ value }) => value ? `${value}${year - value >= 7 ? " (노후)" : ""}` : "-" },
    { field: "serial_no", headerName: "시리얼 번호", minWidth: 140, valueFormatter: ({ value }) => show(value) },
    hostColumn(onDetail, { pinned: undefined }), personColumn,
    { field: "manufacturer", headerName: "제조사", minWidth: 120, valueFormatter: ({ value }) => show(value) },
    { field: "connection", headerName: "연결", width: 100, valueFormatter: ({ value }) => value ? connectionLabels[value] || value : "-" },
    { field: "model", headerName: "모델 코드", minWidth: 100, valueFormatter: ({ value }) => show(value) },
    { field: "first_seen_at", headerName: "최초 확인", minWidth: 150, flex: 1, valueFormatter: ({ value }) => date(value) },
  ], [onDetail, year]);
  const inputColumns = useMemo(() => [
    { field: "name", headerName: "장치명", minWidth: 170, pinned: "left" },
    { field: "device_type", headerName: "구분", width: 82, valueFormatter: ({ value }) => peripheralTypes[value] || value },
    hostColumn(onDetail, { pinned: undefined }), personColumn,
    { field: "manufacturer", headerName: "제조사", minWidth: 120, valueFormatter: ({ value }) => show(value) },
    { field: "connection", headerName: "연결", width: 100, valueFormatter: ({ value }) => value ? connectionLabels[value] || value : "-" },
    { field: "model", headerName: "모델 코드", minWidth: 160, flex: 1, valueFormatter: ({ value }) => show(value) },
  ], [onDetail]);
  const usbColumns = useMemo(() => [
    { field: "name", headerName: "장치명", minWidth: 190, pinned: "left" },
    { colId: "present", headerName: "상태", width: 96, valueGetter: ({ data }) => data.present ? "연결됨" : "과거 연결", cellClass: ({ data }) => data?.present ? "ok-text" : undefined },
    { field: "last_arrival_at", headerName: "최근 연결", minWidth: 150, valueFormatter: ({ value }) => date(value) },
    { field: "last_removal_at", headerName: "최근 분리", minWidth: 150, valueFormatter: ({ value }) => date(value) },
    hostColumn(onDetail, { pinned: undefined }), personColumn,
    { field: "category", headerName: "분류", width: 96, valueFormatter: ({ value }) => usbCategories[value] || value },
    { field: "serial_no", headerName: "시리얼 번호", minWidth: 150, valueFormatter: ({ value }) => show(value) },
    { field: "manufacturer", headerName: "제조사", minWidth: 120, flex: 1, valueFormatter: ({ value }) => show(value) },
  ], [onDetail]);
  const ps = peripherals.summary || {}, us = usb.summary || {};
  const monitors = peripherals.rows.filter(r => r.device_type === "MONITOR"), inputs = peripherals.rows.filter(r => r.device_type !== "MONITOR");
  return <section className="compliance-page peripheral-page">
    <div className="intro"><div><h1>주변기기·USB 현황</h1><p>Agent 0.2.13+가 수집한 모니터·키보드·마우스와 USB 연결 기록을 전체 PC 기준으로 봅니다.</p></div><button onClick={load} disabled={loading}><BtnLabel icon="refresh">새로고침</BtnLabel></button></div>
    {loadError && <div role="alert" className="notice error">{loadError}<button onClick={load}><BtnLabel icon="refresh">다시 시도</BtnLabel></button></div>}
    <div className="compliance-summary">
      <article><small>모니터</small><b>{ps.monitors ?? 0}</b><span>{ps.assets_with_monitor ?? 0}개 PC에 연결 · 시리얼 미확인 {ps.monitors_without_serial ?? 0}</span></article>
      <article className={ps.aged_monitors ? "danger" : undefined}><small>노후 모니터</small><b>{ps.aged_monitors ?? 0}</b><span>제조 7년 이상 — 교체 계획 대상</span></article>
      <article className={us.storage_assets ? "danger" : undefined}><small>USB 저장장치 사용 PC (최근 {days}일)</small><b>{us.storage_assets ?? 0}</b><span>저장장치 {us.storage_devices ?? 0}개 · 휴대기기 연결 PC {us.mobile_assets ?? 0}</span></article>
    </div>
    <nav className="detail-sections" aria-label="주변기기 구분">{Object.entries({ MONITOR: `모니터 대장 (${monitors.length})`, INPUT: `키보드·마우스 (${inputs.length})`, USB: `USB 연결 기록 (${usb.rows.length})` }).map(([key, label]) =>
      <button key={key} aria-pressed={tab === key} onClick={() => setTab(key)}>{label}</button>)}</nav>
    {tab === "MONITOR" && <article className="panel table"><div className="panel-heading"><div><h3>모니터 대장</h3><p>모니터 시리얼로 연결 PC를 찾고 실사·교체 대상을 확인합니다. 노트북 내장 패널 포함.</p></div><a className="export-button" href="/api/v1/peripherals-export.csv?type=MONITOR"><BtnLabel icon="download">모니터 CSV</BtnLabel></a></div>
      <DataGrid label="모니터 대장" autoHeight loading={loading} rows={monitors} columns={monitorColumns} empty="수집된 모니터가 없습니다. Agent 0.2.13 이상으로 업데이트된 PC부터 표시됩니다." className="menu-grid" /></article>}
    {tab === "INPUT" && <article className="panel table"><div className="panel-heading"><div><h3>키보드·마우스</h3><p>무선 수신기·블루투스·내장 장치 포함.</p></div><a className="export-button" href="/api/v1/peripherals-export.csv"><BtnLabel icon="download">주변기기 CSV</BtnLabel></a></div>
      <DataGrid label="키보드·마우스" autoHeight loading={loading} rows={inputs} columns={inputColumns} empty="수집된 키보드·마우스가 없습니다." className="menu-grid" /></article>}
    {tab === "USB" && <article className="panel table"><div className="panel-heading"><div><h3>USB 연결 기록</h3><p>현재 연결 장치와 기간 내 연결 기록입니다. 저장장치 사용 자체가 위반은 아니므로 기관 매체 통제 정책과 대조하세요.</p></div>
      <div className="list-metrics"><label>분류<select aria-label="USB 분류" value={category} onChange={e => setCategory(e.target.value)}><option value="">전체</option>{Object.entries(usbCategories).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
        <label>기간<select aria-label="USB 기간" value={days} onChange={e => setDays(Number(e.target.value))}>{[7, 30, 90, 365].map(d => <option key={d} value={d}>최근 {d}일</option>)}</select></label>
        <a className="export-button" href={`/api/v1/usb-devices-export.csv?${usbQuery}`}><BtnLabel icon="download">USB CSV</BtnLabel></a></div></div>
      <DataGrid label="USB 연결 기록" autoHeight loading={loading} rows={usb.rows} columns={usbColumns} empty="조건에 맞는 USB 연결 기록이 없습니다." className="menu-grid" /></article>}
  </section>;
}

const matchLabels = { SERIAL: "시리얼", UUID: "장치 UUID", MAC: "MAC 주소" };

/** 점검 결과가 없으면 큰 빈 표 대신 한 줄로 "이상 없음"을 보여 준다. */
function AuditGrid({ loading, rows, okText, ...props }) {
  if (!loading && rows.length === 0) return <p className="audit-ok" role="status">✓ {okText}</p>;
  return <DataGrid loading={loading} rows={rows} className="menu-grid" autoHeight {...props} />;
}

/** ITAM 점검: FR-005 폐기·분실 자산 활동, FR-004 중복 자산, AR-003 기준정보 누락, FR-016 차단된 Agent. */
function AssetAudit({ onDetail, onChanged }) {
  const [data, setData] = useState({ retiredActive: [], duplicates: [], duplicateGroups: 0, incomplete: [], blockedAgents: [] });
  const [loading, setLoading] = useState(true), [loadError, setLoadError] = useState(""), [message, setMessage] = useState("");
  async function load() {
    setLoading(true);
    try { const d = await api("/api/v1/admin/asset-audit"); setData({ retiredActive: [], duplicates: [], duplicateGroups: 0, incomplete: [], blockedAgents: [], ...d }); setLoadError(""); }
    catch (e) { setLoadError(`조회 실패: ${e.message}`); } finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);
  async function block(row) {
    const reason = prompt(`${row.hostname} Agent를 차단합니다. 차단 사유를 입력하세요.`, `${lifecycleLabels[row.lifecycle_status] || ""} 처리 자산의 통신`);
    if (!reason || !reason.trim()) return;
    try { await api(`/api/v1/admin/agents/${row.agent_id}/block`, { method: "POST", body: JSON.stringify({ reason: reason.trim() }) }); setMessage(`${row.hostname} Agent를 차단했습니다.`); await load(); onChanged?.(); }
    catch (e) { setMessage(`차단 실패: ${e.message}`); }
  }
  async function unblock(row) {
    if (!confirm(`${row.hostname} Agent 차단을 해제하시겠습니까?`)) return;
    try { await api(`/api/v1/admin/agents/${row.agent_id}/unblock`, { method: "POST" }); setMessage(`${row.hostname} 차단을 해제했습니다.`); await load(); onChanged?.(); }
    catch (e) { setMessage(`해제 실패: ${e.message}`); }
  }
  const retiredColumns = useMemo(() => [
    hostColumn(onDetail),
    { field: "lifecycle_status", headerName: "관리 상태", width: 130, valueFormatter: ({ value }) => lifecycleLabels[value] || value, cellClass: "warn-text" },
    personColumn,
    { field: "location", headerName: "위치", minWidth: 120, valueFormatter: ({ value }) => show(value) },
    { field: "server_observed_ip", headerName: "접속 IP", minWidth: 130, valueFormatter: ({ value }) => show(value) },
    { field: "last_seen_at", headerName: "최근 통신", minWidth: 150, valueFormatter: ({ value }) => date(value) },
    { headerName: "조치", width: 120, filter: false, sortable: false, cellRenderer: ({ data }) => data.agent_blocked_at ? <span>차단됨</span>
      : <button className="danger-button grid-action" onClick={() => block(data)}><BtnLabel icon="ban">Agent 차단</BtnLabel></button> },
  ], [onDetail]);
  const duplicateColumns = useMemo(() => [
    { field: "match_type", headerName: "일치 항목", width: 110, pinned: "left", valueFormatter: ({ value }) => matchLabels[value] || value },
    { field: "match_value", headerName: "값", minWidth: 170 },
    hostColumn(onDetail, { pinned: undefined }),
    { field: "lifecycle_status", headerName: "관리 상태", width: 120, valueFormatter: ({ value }) => lifecycleLabels[value] || value },
    { field: "asset_tag", headerName: "자산태그", minWidth: 110, valueFormatter: ({ value }) => show(value) },
    { field: "agent_registered_at", headerName: "Agent 등록", minWidth: 150, valueFormatter: ({ value }) => date(value) },
    { field: "last_seen_at", headerName: "최근 통신", minWidth: 150, valueFormatter: ({ value }) => date(value) },
  ], [onDetail]);
  const incompleteColumns = useMemo(() => [
    hostColumn(onDetail),
    { field: "missing", headerName: "누락 항목", minWidth: 260, flex: 1, cellClass: "warn-text", wrapText: true, autoHeight: true },
    personColumn,
    { field: "serial_no", headerName: "수집 시리얼", minWidth: 140, valueFormatter: ({ value }) => show(value) },
  ], [onDetail]);
  const blockedColumns = useMemo(() => [
    { field: "hostname", headerName: "장비", minWidth: 140, pinned: "left", cellRenderer: ({ data }) => data.asset_id
      ? <button className="asset-detail-link" onClick={() => onDetail(data.asset_id)} aria-label={`${data.hostname} 상세 보기`}>{data.hostname}</button> : data.hostname },
    { field: "blocked_reason", headerName: "사유", minWidth: 200, flex: 1 },
    { field: "blocked_by", headerName: "차단자", width: 110 },
    { field: "blocked_at", headerName: "차단 시각", minWidth: 150, valueFormatter: ({ value }) => date(value) },
    { headerName: "조치", width: 110, filter: false, sortable: false, cellRenderer: ({ data }) => <button className="btn-success grid-action" onClick={() => unblock(data)}><BtnLabel icon="unlock">차단 해제</BtnLabel></button> },
  ], [onDetail]);
  return <section className="compliance-page audit-page">
    <div className="intro"><div><h1>자산 점검</h1><p>대장과 실제 통신 상태가 어긋나는 자산, 중복 등록 의심, 관리 기준정보 누락을 한곳에서 확인합니다.</p></div><button onClick={load} disabled={loading}><BtnLabel icon="refresh">다시 점검</BtnLabel></button></div>
    {loadError && <div role="alert" className="notice error">{loadError}<button onClick={load}><BtnLabel icon="refresh">다시 시도</BtnLabel></button></div>}<Feedback className="notice" text={message} />
    <div className="compliance-summary audit-summary">
      <article className={data.retiredActive.length ? "danger" : undefined}><small>폐기·분실 자산 통신</small><b>{data.retiredActive.length}</b><span>최근 7일 Agent 보고</span></article>
      <article className={data.duplicateGroups ? "danger" : undefined}><small>중복 의심</small><b>{data.duplicateGroups}</b><span>같은 시리얼·UUID·MAC 그룹</span></article>
      <article><small>기준정보 누락</small><b>{data.incomplete.length}</b><span>사용 중 자산 기준</span></article>
      <article><small>차단된 Agent</small><b>{data.blockedAgents.length}</b><span>통신·재등록 거부</span></article>
    </div>
    <article className="panel table"><div className="panel-heading"><div><h3>폐기·분실 처리 후 통신 중인 자산</h3><p>실제 분실·유출이면 Agent를 차단하고, 처리 오류면 관리 상태를 바로잡으세요.</p></div></div>
      <AuditGrid label="폐기·분실 자산 통신" loading={loading} rows={data.retiredActive} columns={retiredColumns} okText="폐기·분실 처리 후 통신한 자산이 없습니다." /></article>
    <article className="panel table"><div className="panel-heading"><div><h3>중복 등록 의심</h3><p>PC 이름 변경·OS 재설치로 같은 장비가 두 번 등록된 경우입니다. BIOS 기본값(예: "Default string")은 제외합니다.</p></div></div>
      <AuditGrid label="중복 등록 의심" loading={loading} rows={data.duplicates} columns={duplicateColumns} okText="중복 의심 자산이 없습니다." /></article>
    <article className="panel table"><div className="panel-heading"><div><h3>관리 기준정보 누락</h3><p>사용 중 자산의 자산태그·담당자·위치·다음 실사일과 BIOS 시리얼 상태입니다. 자산 상세의 관리 정보에서 보완하세요.</p></div></div>
      <AuditGrid label="관리 기준정보 누락" loading={loading} rows={data.incomplete} columns={incompleteColumns} okText="누락된 기준정보가 없습니다." /></article>
    <article className="panel table"><div className="panel-heading"><div><h3>차단된 Agent</h3><p>차단을 해제하면 기존 장치 토큰으로 다시 통신합니다.</p></div></div>
      <AuditGrid label="차단된 Agent" loading={loading} rows={data.blockedAgents} columns={blockedColumns} okText="차단된 Agent가 없습니다." /></article>
  </section>;
}

function SoftwareCompliance(){
  const empty={softwareName:"",publisher:"",matchType:"CONTAINS",classification:"REVIEW_REQUIRED",sourceName:"관리자 등록",sourceRef:"",notes:"",enabled:true};
  const [data,setData]=useState({policies:[],detections:[],syncLogs:[],affectedAssets:0}),[form,setForm]=useState(empty),[message,setMessage]=useState(""),[busy,setBusy]=useState(false),[loading,setLoading]=useState(true),[loadError,setLoadError]=useState("");
  async function load(){setLoading(true);try{setData(await api("/api/v1/admin/software-compliance"));setLoadError("");}catch(e){setLoadError(`조회 실패: ${e.message}`);}finally{setLoading(false);}}
  useEffect(()=>{load()},[]);
  async function add(e){e.preventDefault();setBusy(true);try{await api("/api/v1/admin/software-compliance/policies",{method:"POST",body:JSON.stringify(form)});setForm(empty);await load();setMessage("판정 기준을 등록했습니다.");}catch(e){setMessage(`등록 실패: ${e.message}`);}finally{setBusy(false)}}
  async function remove(id){if(!confirm("이 판정 기준을 삭제하시겠습니까?"))return;setBusy(true);try{await api(`/api/v1/admin/software-compliance/policies/${id}`,{method:"DELETE"});await load();setMessage("판정 기준을 삭제했습니다.");}catch(e){setMessage(`삭제 실패: ${e.message}`);}finally{setBusy(false)}}
  async function sync(){setBusy(true);try{const x=await api("/api/v1/admin/software-compliance/sync",{method:"POST"});setMessage(x.status==="NOT_CONFIGURED"?x.message:`${x.importedCount}건을 동기화했습니다.`);await load();}catch(e){setMessage(`동기화 실패: ${e.message}`);}finally{setBusy(false)}}
  const set=(k,v)=>setForm(x=>({...x,[k]:v}));
  const detectionColumns=useMemo(()=>[
    {field:"classification",headerName:"판정",width:130,pinned:"left",cellRenderer:({value})=><StatusBadge tone={{ PROHIBITED: "danger", LICENSE_REQUIRED: "warn" }[value] || "info"}>{complianceLabels[value]}</StatusBadge>},
    {field:"hostname",headerName:"장비",minWidth:150},
    {headerName:"담당자/부서",minWidth:150,valueGetter:({data})=>data.assigned_to||data.department||"-"},
    {field:"software_name",headerName:"설치 프로그램",minWidth:220,flex:1},
    {field:"version",headerName:"버전",width:120},
    {field:"publisher",headerName:"게시자",minWidth:160},
    {field:"source_name",headerName:"근거",minWidth:150},
  ],[]);
  const policyColumns=useMemo(()=>[
    {field:"software_name",headerName:"프로그램명",minWidth:220,pinned:"left"},
    {field:"publisher",headerName:"게시자",minWidth:160,valueFormatter:({value})=>value||"전체"},
    {field:"match_type",headerName:"일치 방식",width:120},
    {field:"classification",headerName:"분류",minWidth:140,valueFormatter:({value})=>complianceLabels[value]},
    {field:"source_name",headerName:"출처",minWidth:180,flex:1},
    {headerName:"관리",width:100,filter:false,sortable:false,cellRenderer:({data})=><button className="danger-button grid-action" onClick={()=>remove(data.id)}><BtnLabel icon="trash">삭제</BtnLabel></button>},
  ],[]);
  return <section className="compliance-page"><div className="intro"><div><h1>소프트웨어 컴플라이언스</h1><p>판정 목록과 Agent 설치목록을 대조해 확인이 필요한 장비를 표시합니다.</p></div><button className="btn-primary" onClick={sync} disabled={busy}><BtnLabel icon="sync">공공 기초자료 동기화</BtnLabel></button></div>
    {loadError && <div role="alert" className="notice error">{loadError}<button onClick={load}><BtnLabel icon="refresh">다시 시도</BtnLabel></button></div>}<Feedback className="notice" text={message} /><div className="compliance-summary"><article><small>판정 기준</small><b>{data.policies.length}</b><span>활성 목록</span></article><article className="danger"><small>탐지 장비</small><b>{data.affectedAssets}</b><span>관리자 확인 필요</span></article><article><small>탐지 프로그램</small><b>{data.detections.length}</b><span>중복 설치 포함</span></article></div>
    <article className="panel compliance-form"><div className="panel-heading"><div><h3>판정 목록 등록</h3><p>제품명과 게시자를 기준으로 설치 프로그램을 대조합니다.</p></div></div><form onSubmit={add}><label>프로그램명 *<input required value={form.softwareName} onChange={e=>set("softwareName",e.target.value)} placeholder="프로그램명"/></label><label>게시자 (선택)<input value={form.publisher} onChange={e=>set("publisher",e.target.value)} placeholder="게시자(선택)"/></label><label>일치 방식<select value={form.matchType} onChange={e=>set("matchType",e.target.value)}><option value="CONTAINS">이름 포함</option><option value="EXACT">이름 정확히</option><option value="PREFIX">이름 시작</option></select></label><label>판정 분류<select value={form.classification} onChange={e=>set("classification",e.target.value)}><option value="REVIEW_REQUIRED">검토 필요</option><option value="LICENSE_REQUIRED">라이선스 확인</option><option value="PROHIBITED">사용 금지</option></select></label><label>근거 URL/문서<input value={form.sourceRef} onChange={e=>set("sourceRef",e.target.value)} placeholder="근거 URL/문서"/></label><label>판정 메모<input value={form.notes} onChange={e=>set("notes",e.target.value)} placeholder="판정 메모"/></label><button className="btn-primary" disabled={busy}><BtnLabel icon="plus">기준 등록</BtnLabel></button></form></article>
    <article className="panel table"><div className="panel-heading"><div><h3>탐지 장비</h3><p>설치만으로 불법 사용이 확정되지는 않으며 보유 라이선스와 사용권을 확인해야 합니다.</p></div></div><DataGrid label="탐지 장비" loading={loading} rows={data.detections} columns={detectionColumns} empty="현재 판정 목록과 일치하는 설치 프로그램이 없습니다." className="menu-grid" /></article>
    <article className="panel table"><div className="panel-heading"><div><h3>관리 판정 목록</h3><p>공공 기초자료와 기관 자체 기준을 함께 관리합니다.</p></div></div><DataGrid label="관리 판정 목록" loading={loading} rows={data.policies} columns={policyColumns} empty="등록된 판정 기준이 없습니다." className="menu-grid" /></article>
  </section>;
}
const assetFilters = { all: "전체", bitlocker: "BitLocker 조치 필요", antivirus: "백신 상태 확인", stale: "장기 미접속" };
function readWorkspace() {
  const params = new URLSearchParams(location.hash.slice(1));
  const view = params.get("view");
  return { view: menuGroups.some(group=>group.items.some(item=>item.name===view)) ? view : "대시보드", query: params.get("q") || "", filter: Object.hasOwn(assetFilters,params.get("filter")) ? params.get("filter") : "all", asset: /^[\da-f-]{36}$/i.test(params.get("asset") || "") ? params.get("asset") : null };
}
function App() {
  const [user, setUser] = useState(undefined);
  const [route, setRoute] = useState(readWorkspace);
  const {view: active, query: q, filter: assetFilter, asset: detailId} = route;
  const [openTabs, setOpenTabs] = useState(()=>[readWorkspace().view]);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileMenu, setMobileMenu] = useState(false);
  const [loading, setLoading] = useState(false);
  const [assets, setAssets] = useState([]);
  const [loadError, setLoadError] = useState("");
  const [lastLoaded, setLastLoaded] = useState(null);
  const [stats, setStats] = useState({total:0,online:0,offline:0,stale:0,security:{bitlocker:0,antivirus:0},management:{}});
  const menuTrigger = useRef(null);
  const navRef = useRef(null);
  const navigate = useCallback((patch, replace=false) => {
    const next = {...readWorkspace(), ...patch};
    const params = new URLSearchParams({view:next.view});
    if (next.query) params.set("q",next.query);
    if (next.filter !== "all") params.set("filter",next.filter);
    if (next.asset) params.set("asset",next.asset);
    history[replace ? "replaceState" : "pushState"](null,"",`#${params}`);
    setRoute(next);
  }, []);
  const showDetail = useCallback(id=>navigate({asset:id}), [navigate]);
  const closeDetail = useCallback(()=>navigate({asset:null},true), [navigate]);
  useEffect(()=>{const restore=()=>setRoute(readWorkspace());window.addEventListener("popstate",restore);return()=>window.removeEventListener("popstate",restore);},[]);
  useEffect(()=>{setOpenTabs(tabs=>tabs.includes(active)?tabs:[...tabs,active]);},[active]);
  useEffect(()=>{document.querySelector('.workspace-tab.on')?.scrollIntoView({block:"nearest",inline:"nearest"});},[active,openTabs]);
  useEffect(()=>{
    if (!mobileMenu) return;
    const main = document.querySelector("#root > main");
    if(main) main.inert=true;
    navRef.current?.querySelector("button")?.focus();
    const key=e=>{
      if(e.key==="Escape"){setMobileMenu(false);return;}
      if(e.key!=="Tab")return;
      const buttons=[...navRef.current.querySelectorAll("button")].filter(el=>el.getClientRects().length);
      if(e.shiftKey&&document.activeElement===buttons[0]){e.preventDefault();buttons.at(-1)?.focus();}
      else if(!e.shiftKey&&document.activeElement===buttons.at(-1)){e.preventDefault();buttons[0]?.focus();}
    };
    document.addEventListener("keydown",key);
    return()=>{document.removeEventListener("keydown",key);if(main)main.inert=false;menuTrigger.current?.focus();};
  },[mobileMenu]);
  useEffect(()=>{api("/api/v1/auth/me").then(setUser).catch(()=>setUser(null));},[]);
  async function load() {
    setLoading(true);
    try {
      const [s,a] = await Promise.all([api("/api/v1/dashboard"),api("/api/v1/assets")]);
      setStats(s);setAssets(a);setLoadError("");setLastLoaded(new Date());
    } catch(e) { if(e.status===401)setUser(null);else setLoadError("자산 데이터를 불러오지 못했습니다. 연결을 확인하고 다시 시도하세요."); }
    finally {setLoading(false);}
  }
  useEffect(()=>{if(user)load();},[user]);
  const filtered=useMemo(()=>assets.filter(a=>{
    if(assetFilter==="bitlocker")return a.bitlocker_enabled !== true;
    if(assetFilter==="antivirus")return a.antivirus_status !== "Healthy";
    if(assetFilter==="stale")return Date.now()-new Date(a.last_seen_at).getTime()>7*86400000;
    return true;
  }),[assets,assetFilter]);
  if(user===undefined)return <div className="splash" role="status">AssetFlow · 접속 확인 중</div>;
  if(!user)return <Login onLogin={setUser}/>;
  async function logout(){try{await api("/api/v1/auth/logout",{method:"POST"});setUser(null);}catch{setLoadError("로그아웃에 실패했습니다. 다시 시도하세요.");}}
  function openWorkspace(name){navigate({view:name,asset:null});setMobileMenu(false);}
  function closeWorkspace(name){if(openTabs.length===1)return;const index=openTabs.indexOf(name);const next=openTabs.filter(tab=>tab!==name);setOpenTabs(next);if(active===name)navigate({view:next[Math.max(0,index-1)],asset:null});}
  function openAssets(filter="all"){navigate({view:"자산 관리",filter,query:"",asset:null});}
  return <>
    <div className="mobile-header"><b>AssetFlow</b><button ref={menuTrigger} aria-expanded={mobileMenu} aria-controls="primary-navigation" onClick={()=>setMobileMenu(v=>!v)}><BtnLabel icon="menu">전체 메뉴</BtnLabel></button></div>
    {mobileMenu&&<div className="nav-backdrop" onClick={()=>setMobileMenu(false)}/>}
    <aside id="primary-navigation" ref={navRef} className={`${sidebarCollapsed?"sidebar-collapsed":""} ${mobileMenu?"mobile-open":""}`} aria-label="주 메뉴">
      <div className="brand"><b>A</b><span>AssetFlow</span><button className="sidebar-toggle" onClick={()=>{if(window.innerWidth<=900)setMobileMenu(false);else setSidebarCollapsed(v=>!v);}} aria-label={mobileMenu?"메뉴 닫기":sidebarCollapsed?"메뉴 펼치기":"메뉴 접기"}>{mobileMenu?"×":sidebarCollapsed?"»":"«"}</button></div>
      <div className="nav-pictogram"><Core16Icon name="shield"/><span><b>IT 자산관리</b><small>자산 · 보안 · 운영</small></span></div>
      <nav aria-label="업무 메뉴">{menuGroups.map(group=><div className="nav-group" key={group.label}><small>{({OVERVIEW:"자산 운영","AGENT MANAGEMENT":"Agent 관리",OPERATIONS:"시스템 운영"})[group.label]}</small>{group.items.map(item=><button key={item.name} title={item.name} aria-current={active===item.name?"page":undefined} aria-label={item.name} className={active===item.name?"on":""} onClick={()=>openWorkspace(item.name)}><span><Core16Icon name={item.icon}/></span><b className="nav-label">{item.name}</b>{active===item.name&&<i/>}</button>)}</div>)}</nav>
      <div className="nav-health"><span>자산 데이터 조회</span><b>{loading?"갱신 중":loadError?"갱신 실패":lastLoaded?"조회 완료":"미확인"}</b><small>{lastLoaded?lastLoaded.toLocaleTimeString("ko-KR"):"아직 조회하지 않았습니다"}</small></div>
      <div className="profile"><i>{user.username[0].toUpperCase()}</i><div className="profile-label"><b>{user.username}</b><small>시스템 관리자</small></div><button onClick={logout} title="로그아웃" aria-label="로그아웃"><BtnLabel icon="logout">로그아웃</BtnLabel></button></div>
    </aside>
    <main className={sidebarCollapsed?"main-collapsed":""}>
      <nav className="workspace-tabs" aria-label="열린 관리자 화면"><div>{openTabs.map(tab=><div className={`workspace-tab ${active===tab?"on":""}`} key={tab}><button aria-current={active===tab?"page":undefined} onClick={()=>openWorkspace(tab)}>{tab}</button>{openTabs.length>1&&<button className="tab-close" aria-label={`${tab} 탭 닫기`} onClick={()=>closeWorkspace(tab)}>×</button>}</div>)}</div></nav>
      {loadError&&<div className="notice error" role="alert">{loadError}{lastLoaded&&" 마지막 성공 시점의 데이터를 표시합니다."}<button onClick={load} disabled={loading}><BtnLabel icon="refresh">다시 시도</BtnLabel></button></div>}
      {(active==="대시보드"||active==="자산 관리")&&<div className="data-freshness" role="status">{loading?"데이터 갱신 중…":lastLoaded?`마지막 성공 조회: ${lastLoaded.toLocaleString("ko-KR")}`:"데이터 조회 대기"}{assets.length>=500&&" · 목록은 최근 500개 자산입니다. 전체 자료는 CSV로 확인하세요."}</div>}
      {active==="Agent 배포"?<AgentOps view="release"/>:active==="업데이트 이력"?<AgentOps view="history"/>:active==="시스템 가이드"?<AgentOps view="guide"/>:active==="점검 일지"?<InspectionLog/>:active==="서버 모니터링"?<ServerMonitoring/>:active==="SW 컴플라이언스"?<SoftwareCompliance/>:active==="주변기기·USB"?<PeripheralInventory onDetail={showDetail}/>:active==="자산 점검"?<AssetAudit onDetail={showDetail} onChanged={load}/>:active==="자산 관리"?<section>
        <div className="intro"><div><h1>자산 목록</h1><p>장비명을 선택하면 상세 정보와 관리 이력을 확인할 수 있습니다.</p></div><div className="list-metrics"><button onClick={load} disabled={loading}><BtnLabel icon="refresh">새로고침</BtnLabel></button><a className="export-button" href="/api/v1/assets-export.csv"><BtnLabel icon="download">전체 자산 CSV</BtnLabel></a></div></div>
        <div className="filter-bar"><label>조치 상태<select aria-label="조치 상태" value={assetFilter} onChange={e=>navigate({filter:e.target.value},true)}>{Object.entries(assetFilters).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label>{(q||assetFilter!=="all")&&<span className="filter-chip">{assetFilters[assetFilter]}{q&&` · 검색: ${q}`}</span>}</div>
        <article className="panel table asset-list-panel"><AssetTable rows={filtered} loading={loading} onDetail={showDetail} paginate query={q} onQueryChange={query=>navigate({query},true)} onReset={()=>navigate({query:"",filter:"all"},true)}/></article>
      </section>:<><Dashboard stats={stats} rows={assets.slice(0,6)} loading={loading} load={load} all={openAssets} onDetail={showDetail} hasData={!!lastLoaded} openView={openWorkspace}/>{lastLoaded&&stats.total===0&&<div className="notice empty-guide">등록된 자산이 없습니다. Agent 설치 후 장비 정보가 표시됩니다.<button onClick={()=>openWorkspace("시스템 가이드")}>설치 안내 보기</button></div>}</>}
    </main>
    {detailId&&<AssetDetailModal assetId={detailId} onClose={closeDetail}/>}
  </>;
}
function Dashboard({ stats, rows, loading, load, all, onDetail, hasData, openView }) {
  const securityChecks = stats.total * 2;
  const securityIssues = stats.security.bitlocker + stats.security.antivirus;
  const compliance = securityChecks
    ? Math.max(
        0,
        Math.round(((securityChecks - securityIssues) / securityChecks) * 100),
      )
    : null;
  return (
    <>
      <section>
        <div className="intro">
          <div>
            <h1>자산 현황</h1>
            <p>전체 IT 자산의 상태를 확인하세요.</p>
          </div>
          <button onClick={load}><BtnLabel icon="refresh">새로고침</BtnLabel></button>
        </div>
        <div className="stats">
          <Stat label="전체 PC" value={hasData ? stats.total : "—"} icon="monitor" tone="blue" />
          <Stat label="온라인" value={hasData ? stats.online : "—"} icon="check" tone="green" />
          <Stat label="오프라인" value={hasData ? stats.offline : "—"} icon="offline" tone="gray" />
          <Stat
            label="장기 미접속"
            value={hasData ? stats.stale : "—"}
            icon="clock"
            tone="orange"
          />
        </div>
        <div className="dashboard-insights">
          <div>
            <span>BitLocker 조치 필요</span>
            <b>{hasData ? (stats.security.bitlocker) : "—"}</b>
            <small>암호화 미적용 장비</small>
          </div>
          <div>
            <span>백신 상태 확인</span>
            <b>{hasData ? (stats.security.antivirus) : "—"}</b>
            <small>정상 상태가 아닌 장비</small>
          </div>
          <div className={`coverage ${hasData && stats.total && stats.online / stats.total < 0.8 ? "coverage-low" : ""}`} title="업무 시간 외에는 PC 전원이 꺼져 낮게 보일 수 있습니다">
            <span>Agent 연결률</span>
            <b>
              {hasData && stats.total ? `${Math.round((stats.online / stats.total) * 100)}%` : "—"}
            </b>
            <small>최근 15분 보고 기준</small>
          </div>
          <div><span>보증 만료 예정</span><b>{hasData ? (stats.management?.warrantyExpiring || 0) : "—"}</b><small>90일 이내 만료</small></div>
          <div><span>실사 지연</span><b>{hasData ? (stats.management?.overdueAudit || 0) : "—"}</b><small>다음 실사일 경과</small></div>
        </div>
        <div className="operations-grid">
          <article className="panel compliance-panel">
            <div className="panel-heading">
              <div>
                <h3>보안 준수 현황</h3>
                <p>필수 보안 통제 적용률</p>
              </div>
              <span>{hasData ? "최근 조회 기준" : "조회 대기"}</span>
            </div>
            <div className="compliance-content">
              <div className={`donut ${!hasData || compliance === null ? "unmeasured" : ""}`} style={{ "--p": compliance ?? 0 }}>
                <b>{!hasData ? "—" : compliance === null ? "측정 대상 없음" : `${compliance}%`}</b>
              </div>
              <div className="compliance-legend">
                <p>
                  <span>
                    <i className="legend-dot good" />
                    정상 보안 항목
                  </span>
                  <b>{hasData ? (Math.max(0, securityChecks - securityIssues)) : "—"}</b>
                </p>
                <p>
                  <span>
                    <i className="legend-dot warn" />
                    조치 필요 항목
                  </span>
                  <b>{hasData ? (securityIssues) : "—"}</b>
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
              <button className="btn-link" onClick={() => all()}><BtnLabel icon="arrow-right" trailing>자산 관리</BtnLabel></button>
            </div>
            <div className="action-list">
              <button className="action-row" onClick={()=>all("bitlocker")}>
                <i className="shield-action"><Core16Icon name="lock" /></i>
                <span>
                  <b>디스크 암호화</b>
                  <small>BitLocker 미적용 또는 확인 불가</small>
                </span>
                <strong>{hasData ? (stats.security.bitlocker) : "—"}</strong>
              </button>
              <button className="action-row" onClick={()=>all("antivirus")}>
                <i className="virus-action"><Core16Icon name="shield" /></i>
                <span>
                  <b>Endpoint 보안</b>
                  <small>백신 상태가 Healthy가 아닌 장비</small>
                </span>
                <strong>{hasData ? (stats.security.antivirus) : "—"}</strong>
              </button>
              <button className="action-row" onClick={()=>all("stale")}>
                <i className="stale-action"><Core16Icon name="clock" /></i>
                <span>
                  <b>장기 미접속</b>
                  <small>7일 이상 Agent 보고가 없는 장비</small>
                </span>
                <strong>{hasData ? (stats.stale) : "—"}</strong>
              </button>
              <button className="action-row" onClick={()=>openView?.("자산 점검")}>
                <i className="shield-action"><Core16Icon name="alert" /></i>
                <span>
                  <b>폐기·분실 자산 통신</b>
                  <small>폐기·분실 처리 후 7일 내 Agent가 보고한 장비</small>
                </span>
                <strong>{hasData ? (stats.audit?.retiredActive ?? 0) : "—"}</strong>
              </button>
              <button className="action-row" onClick={()=>openView?.("자산 점검")}>
                <i className="stale-action"><Core16Icon name="ban" /></i>
                <span>
                  <b>차단된 Agent</b>
                  <small>장치 토큰이 폐기된 PC</small>
                </span>
                <strong>{hasData ? (stats.audit?.blockedAgents ?? 0) : "—"}</strong>
              </button>
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
          <button className="btn-link" onClick={() => all()}><BtnLabel icon="arrow-right" trailing>전체 보기</BtnLabel></button>
        </div>
        <AssetTable rows={rows} loading={loading} onDetail={onDetail} />
      </section>
    </>
  );
}
function Stat({ label, value, icon, tone }) {
  return (
    <article>
      <i className={tone}><Core16Icon name={icon} /></i>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>Agent 보고 기준</small>
    </article>
  );
}
createRoot(document.getElementById("root")).render(<App />);

/**
 * Memento MCP Admin Console -- Single-file Application
 *
 * 작성자: 최진호
 * 작성일: 2026-03-26
 *
 * 보안 참고: 모든 동적 콘텐츠는 esc() 함수를 통해 HTML 이스케이프 처리됨.
 * 이 콘솔은 마스터 키 인증 후에만 접근 가능한 내부 관리 도구임.
 */

/* ================================================================
   1. State Management
   ================================================================ */

const state = {
  masterKey:   sessionStorage.getItem("adminKey") || "",
  currentView: "overview",
  stats:       null,
  keys:        [],
  groups:      [],
  memoryData:  null,
  loading:     false,
  lastUpdated: null,

  selectedKeyId:   null,
  selectedGroupId: null,

  memoryFilter: { topic: "", type: "", key_id: "" },
  memoryPage:   1,
  memoryPages:  1,
  fragments:    [],
  selectedFragment: null,
  anomalies:    null,
  searchEvents: null
};

/* ================================================================
   2. API Client
   ================================================================ */

const API_BASE = "/v1/internal/model/nothing";

async function api(path, options = {}) {
  const url     = `${API_BASE}${path}`;
  const headers = { "Authorization": `Bearer ${state.masterKey}` };

  if (options.body && typeof options.body === "object") {
    headers["Content-Type"] = "application/json";
    options.body = JSON.stringify(options.body);
  }

  try {
    const resp = await fetch(url, { ...options, headers: { ...headers, ...options.headers } });
    let data   = null;
    const ct   = resp.headers.get("content-type") || "";
    if (ct.includes("json") && resp.status !== 204) {
      data = await resp.json();
    }
    return { ok: resp.ok, status: resp.status, data };
  } catch (err) {
    return { ok: false, status: 0, error: err.message };
  }
}

/* ================================================================
   3. Router
   ================================================================ */

function navigate(view) {
  state.currentView = view;
  renderSidebar();
  renderCommandBar();
  renderView();
}

function renderView() {
  const container = document.getElementById("view-container");
  if (!container) return;

  switch (state.currentView) {
    case "overview":  renderOverview(container);  break;
    case "keys":      renderKeys(container);      break;
    case "groups":    renderGroups(container);     break;
    case "memory":    renderMemory(container);     break;
    case "sessions":  renderScaffold(container, "sessions"); break;
    case "logs":      renderScaffold(container, "logs"); break;
    default:          renderOverview(container);
  }
}

function renderScaffold(container, viewId) {
  container.textContent = "";
  const wrap = document.createElement("div");
  wrap.className = "scaffold-view";

  const scaffolds = {
    sessions: {
      title: "세션 관리",
      note:  "API 연동 대기 -- 현재 세션 수는 개요에서 확인 가능",
      sections: ["활성 세션 목록", "세션 상세", "만료된 세션 정리"]
    },
    logs: {
      title: "시스템 로그",
      note:  "API 연동 대기 -- Winston 로그 스트림 연동 예정",
      sections: ["로그 레벨 필터", "로그 목록", "로그 상세"]
    }
  };

  const cfg = scaffolds[viewId] ?? { title: viewId, note: "후속 구현 예정", sections: [] };

  const h = document.createElement("h2");
  h.textContent = cfg.title;
  wrap.appendChild(h);

  const note = document.createElement("p");
  note.className = "scaffold-note";
  note.textContent = cfg.note;
  wrap.appendChild(note);

  for (const label of cfg.sections) {
    const sec = document.createElement("div");
    sec.className = "scaffold-section";
    const sh = document.createElement("h3");
    sh.textContent = label;
    sec.appendChild(sh);
    const ph = document.createElement("div");
    ph.className = "scaffold-placeholder";
    ph.textContent = "-- " + label + " 영역 --";
    sec.appendChild(ph);
    wrap.appendChild(sec);
  }

  container.appendChild(wrap);
}

/* ================================================================
   4. Toast System
   ================================================================ */

function showToast(message, type = "info") {
  const root = document.getElementById("toast-root");
  if (!root) return;

  const el = document.createElement("div");
  el.className = "toast " + type;
  el.textContent = message;
  root.appendChild(el);

  setTimeout(() => {
    el.classList.add("fade-out");
    el.addEventListener("animationend", () => el.remove());
  }, 3000);
}

/* ================================================================
   5. Modal System
   ================================================================ */

function showModal(title, bodyEl, actions) {
  const root = document.getElementById("modal-root");
  if (!root) return;

  root.textContent = "";

  const card = document.createElement("div");
  card.className = "modal-card";

  const titleEl = document.createElement("div");
  titleEl.className = "modal-title";
  titleEl.textContent = title;
  card.appendChild(titleEl);

  const bodyWrap = document.createElement("div");
  bodyWrap.className = "modal-body";
  if (typeof bodyEl === "string") {
    bodyWrap.appendChild(buildSafeHtml(bodyEl));
  } else if (bodyEl instanceof Node) {
    bodyWrap.appendChild(bodyEl);
  }
  card.appendChild(bodyWrap);

  const actionsWrap = document.createElement("div");
  actionsWrap.className = "modal-actions";

  const cancelBtn = document.createElement("button");
  cancelBtn.className = "btn";
  cancelBtn.textContent = "취소";
  cancelBtn.addEventListener("click", closeModal);
  actionsWrap.appendChild(cancelBtn);

  if (actions && actions.length) {
    actions.forEach(a => {
      const btn = document.createElement("button");
      btn.className = "btn " + (a.cls || "");
      btn.textContent = a.label;
      if (a.handler) btn.addEventListener("click", a.handler);
      actionsWrap.appendChild(btn);
    });
  }

  card.appendChild(actionsWrap);
  root.appendChild(card);
  root.classList.add("visible");
}

function closeModal() {
  const root = document.getElementById("modal-root");
  if (root) {
    root.classList.remove("visible");
    root.textContent = "";
  }
}

/**
 * 안전한 DOM 빌더: 문자열을 받아 텍스트 노드로 변환 (마크업 허용 안 함)
 */
function buildSafeHtml(text) {
  const span = document.createElement("span");
  span.textContent = text;
  return span;
}

/* ================================================================
   6. Login Screen
   ================================================================ */

function renderLogin() {
  const root = document.getElementById("login-root");
  if (!root) return;

  root.classList.remove("hidden");
  const app = document.getElementById("app");
  if (app) app.classList.remove("visible");

  root.textContent = "";
  const card = document.createElement("div");
  card.className = "login-card";

  const titleEl = document.createElement("div");
  titleEl.className = "login-title";
  titleEl.textContent = "Memento MCP Console";
  card.appendChild(titleEl);

  const sub = document.createElement("div");
  sub.className = "login-sub";
  sub.textContent = "관리자 인증이 필요합니다";
  card.appendChild(sub);

  const input = document.createElement("input");
  input.type = "password";
  input.className = "login-input";
  input.id = "login-key";
  input.placeholder = "Access Key";
  input.autocomplete = "off";
  card.appendChild(input);

  const errEl = document.createElement("div");
  errEl.className = "login-error";
  errEl.id = "login-error";
  errEl.textContent = "인증 실패";
  card.appendChild(errEl);

  const btn = document.createElement("button");
  btn.className = "login-btn";
  btn.id = "login-btn";
  btn.textContent = "로그인";
  card.appendChild(btn);

  root.appendChild(card);

  async function attemptLogin() {
    const key = input.value.trim();
    if (!key) return;

    btn.disabled = true;
    state.masterKey = key;

    const res = await api("/auth", { method: "POST", body: { key } });
    if (res.ok) {
      sessionStorage.setItem("adminKey", key);
      root.classList.add("hidden");
      const appEl = document.getElementById("app");
      if (appEl) appEl.classList.add("visible");
      navigate("overview");
    } else {
      errEl.classList.add("visible");
      state.masterKey = "";
      sessionStorage.removeItem("adminKey");
      btn.disabled = false;
    }
  }

  btn.addEventListener("click", attemptLogin);
  input.addEventListener("keydown", (e) => { if (e.key === "Enter") attemptLogin(); });
}

function logout() {
  state.masterKey = "";
  sessionStorage.removeItem("adminKey");
  renderLogin();
}

/* ================================================================
   7. Sidebar
   ================================================================ */

const NAV_ITEMS = [
  { id: "overview", label: "개요",       icon: "~" },
  { id: "keys",     label: "API 키",     icon: "#" },
  { id: "groups",   label: "그룹",       icon: "%" },
  { id: "memory",   label: "메모리",     icon: ":" },
  { id: "sessions", label: "세션",       icon: "=", scaffold: true },
  { id: "logs",     label: "로그",       icon: ">" , scaffold: true }
];

function renderSidebar() {
  const el = document.getElementById("sidebar");
  if (!el) return;

  el.textContent = "";

  /* Brand */
  const brand = document.createElement("div");
  brand.className = "sidebar-brand";
  const brandTitle = document.createElement("div");
  brandTitle.className = "sidebar-brand-title";
  brandTitle.textContent = "Memento MCP";
  brand.appendChild(brandTitle);
  const brandSub = document.createElement("div");
  brandSub.className = "sidebar-brand-sub";
  brandSub.textContent = "Admin Console";
  brand.appendChild(brandSub);
  el.appendChild(brand);

  /* Nav */
  const nav = document.createElement("div");
  nav.className = "sidebar-nav";
  NAV_ITEMS.forEach(n => {
    const item = document.createElement("div");
    item.className = "sidebar-item" + (n.id === state.currentView ? " active" : "") + (n.scaffold ? " scaffold" : "");
    item.dataset.view = n.id;

    const icon = document.createElement("span");
    icon.className = "icon";
    icon.textContent = n.icon;
    item.appendChild(icon);
    item.appendChild(document.createTextNode(n.label));

    if (!n.scaffold) {
      item.addEventListener("click", () => navigate(n.id));
    }
    nav.appendChild(item);
  });
  el.appendChild(nav);

  /* Footer */
  const footer = document.createElement("div");
  footer.className = "sidebar-footer";
  const logoutBtn = document.createElement("div");
  logoutBtn.className = "sidebar-logout";
  logoutBtn.textContent = "로그아웃";
  logoutBtn.addEventListener("click", logout);
  footer.appendChild(logoutBtn);
  el.appendChild(footer);
}

/* ================================================================
   8. Command Bar
   ================================================================ */

const VIEW_TITLES = {
  overview: "운영 콘솔",
  keys:     "API 키 관리",
  groups:   "그룹 관리",
  memory:   "메모리 운영",
  sessions: "세션 관리",
  logs:     "로그 뷰어"
};

function renderCommandBar() {
  const el = document.getElementById("command-bar");
  if (!el) return;

  el.textContent = "";

  const titleEl = document.createElement("div");
  titleEl.className = "cmd-title";
  titleEl.textContent = VIEW_TITLES[state.currentView] || "";
  el.appendChild(titleEl);

  const right = document.createElement("div");
  right.className = "cmd-right";

  const ts = document.createElement("span");
  ts.className = "cmd-timestamp";
  ts.textContent = "갱신: " + (state.lastUpdated ? new Date(state.lastUpdated).toLocaleTimeString("ko-KR") : "--");
  right.appendChild(ts);

  const refreshBtn = document.createElement("button");
  refreshBtn.className = "cmd-btn";
  refreshBtn.textContent = "새로고침";
  refreshBtn.addEventListener("click", () => renderView());
  right.appendChild(refreshBtn);

  el.appendChild(right);
}

/* ================================================================
   9. Overview Dashboard
   ================================================================ */

function renderOverviewCards(stats) {
  if (!stats) return loadingHtml();

  const queues = stats.queues || {};
  const cards  = [
    { label: "총 파편 수",    value: fmt(stats.fragments),                color: "blue" },
    { label: "활성 세션",     value: fmt(stats.sessions),                 color: "green" },
    { label: "오늘 API 호출", value: fmt(stats.apiCallsToday),            color: "purple" },
    { label: "활성 키",       value: fmt(stats.activeKeys),               color: "cyan" },
    { label: "임베딩 대기열", value: fmt(queues.embeddingBacklog ?? 0),    color: "yellow" },
    { label: "품질 미검증",   value: fmt(queues.qualityPending ?? 0),     color: "red" }
  ];

  const grid = document.createElement("div");
  grid.className = "kpi-grid";
  cards.forEach(c => {
    const card = document.createElement("div");
    card.className = "kpi-card";
    card.dataset.kpi = c.label;

    const label = document.createElement("div");
    label.className = "kpi-label";
    label.textContent = c.label;
    card.appendChild(label);

    const val = document.createElement("div");
    val.className = "kpi-value " + c.color;
    val.textContent = c.value;
    card.appendChild(val);

    grid.appendChild(card);
  });
  return grid;
}

function renderHealthPanel(stats) {
  if (!stats) return null;
  const sys = stats.system || {};

  function barColor(pct) {
    if (pct > 85) return "red";
    if (pct > 60) return "yellow";
    return "green";
  }

  const panel = document.createElement("div");
  panel.className = "panel";

  const title = document.createElement("div");
  title.className = "panel-title";
  title.textContent = "시스템 리소스";
  panel.appendChild(title);

  [
    { label: "CPU",    pct: sys.cpu ?? 0 },
    { label: "Memory", pct: sys.memory ?? 0 },
    { label: "Disk",   pct: sys.disk ?? 0 }
  ].forEach(b => {
    const row = document.createElement("div");
    row.className = "bar-row";

    const lbl = document.createElement("span");
    lbl.className = "bar-label";
    lbl.textContent = b.label;
    row.appendChild(lbl);

    const track = document.createElement("div");
    track.className = "bar-track";
    const fill = document.createElement("div");
    fill.className = "bar-fill " + barColor(b.pct);
    fill.style.width = b.pct + "%";
    track.appendChild(fill);
    row.appendChild(track);

    const pctSpan = document.createElement("span");
    pctSpan.className = "bar-pct";
    pctSpan.textContent = b.pct + "%";
    row.appendChild(pctSpan);

    panel.appendChild(row);
  });

  /* Connection status */
  const connDiv = document.createElement("div");
  connDiv.style.marginTop = "12px";

  [
    { label: "PostgreSQL", status: stats.db === "connected" ? "ok" : "fail", text: stats.db || "unknown" },
    { label: "Redis",      status: stats.redis === "connected" ? "ok" : "fail", text: stats.redis || "unknown" }
  ].forEach(c => {
    const row = document.createElement("div");
    row.className = "conn-row";
    const dot = document.createElement("span");
    dot.className = "conn-dot " + c.status;
    row.appendChild(dot);
    const txt = document.createElement("span");
    txt.textContent = c.label + ": " + c.text;
    row.appendChild(txt);
    connDiv.appendChild(row);
  });
  panel.appendChild(connDiv);

  return panel;
}

function renderHealthFlags(flags) {
  if (!flags || !Object.keys(flags).length) return null;

  const panel = document.createElement("div");
  panel.className = "panel";

  const title = document.createElement("div");
  title.className = "panel-title";
  title.textContent = "Health Flags";
  panel.appendChild(title);

  Object.entries(flags).forEach(([key, val]) => {
    const row = document.createElement("div");
    row.className = "flag-row";

    const severity = val === true ? "ok" : "warn";
    const icon = document.createElement("span");
    icon.className = "flag-icon " + severity;
    icon.textContent = severity === "ok" ? "[OK]" : "[!]";
    row.appendChild(icon);

    const text = document.createElement("span");
    text.textContent = key + ": " + String(val);
    row.appendChild(text);

    panel.appendChild(row);
  });

  return panel;
}

function renderSearchMetrics(stats) {
  const sm = stats.searchMetrics;
  const ob = stats.observability;
  if (!sm && !ob) return null;

  const frag = document.createDocumentFragment();

  if (sm) {
    ["l1", "l2", "l3"].forEach(l => {
      const data = sm[l];
      if (!data) return;

      const panel = document.createElement("div");
      panel.className = "panel";

      const title = document.createElement("div");
      title.className = "panel-title";
      title.textContent = l.toUpperCase() + " Latency";
      panel.appendChild(title);

      [
        { label: "P50", value: fmtMs(data.p50) },
        { label: "P90", value: fmtMs(data.p90) },
        { label: "P99", value: fmtMs(data.p99) }
      ].forEach(m => {
        const row = document.createElement("div");
        row.className = "metric-row";
        const lbl = document.createElement("span");
        lbl.className = "metric-label";
        lbl.textContent = m.label;
        row.appendChild(lbl);
        const val = document.createElement("span");
        val.className = "metric-value";
        val.textContent = m.value;
        row.appendChild(val);
        panel.appendChild(row);
      });

      frag.appendChild(panel);
    });
  }

  if (ob) {
    const panel = document.createElement("div");
    panel.className = "panel";

    const title = document.createElement("div");
    title.className = "panel-title";
    title.textContent = "Observability";
    panel.appendChild(title);

    [
      { label: "검색 총수",   value: fmt(ob.total_searches ?? 0) },
      { label: "L1 미스율",   value: fmtPct(ob.l1_miss_rate) },
      { label: "RRF 사용률",  value: fmtPct(ob.rrf_usage_rate) }
    ].forEach(m => {
      const row = document.createElement("div");
      row.className = "metric-row";
      const lbl = document.createElement("span");
      lbl.className = "metric-label";
      lbl.textContent = m.label;
      row.appendChild(lbl);
      const val = document.createElement("span");
      val.className = "metric-value";
      val.textContent = m.value;
      row.appendChild(val);
      panel.appendChild(row);
    });

    frag.appendChild(panel);
  }

  return frag;
}

function renderTimeline(activities) {
  const panel = document.createElement("div");
  panel.className = "panel";

  const title = document.createElement("div");
  title.className = "panel-title";
  title.textContent = "최근 활동";
  panel.appendChild(title);

  if (!activities || !activities.length) {
    const empty = document.createElement("div");
    empty.style.cssText = "color:var(--text-muted);font-size:12px;";
    empty.textContent = "활동 없음";
    panel.appendChild(empty);
    return panel;
  }

  const timeline = document.createElement("div");
  timeline.className = "timeline";

  activities.forEach(a => {
    const item = document.createElement("div");
    item.className = "timeline-item";

    const badge = document.createElement("span");
    badge.className = "timeline-badge badge-" + (a.type || "fact");
    badge.textContent = a.type || "?";
    item.appendChild(badge);

    const body = document.createElement("div");
    body.className = "timeline-body";
    const topic = document.createElement("div");
    topic.className = "timeline-topic";
    topic.textContent = a.topic || "(무제)";
    body.appendChild(topic);
    const preview = document.createElement("div");
    preview.className = "timeline-preview";
    preview.textContent = a.preview || "";
    body.appendChild(preview);
    item.appendChild(body);

    const time = document.createElement("div");
    time.className = "timeline-time";
    time.textContent = a.created_at ? relativeTime(a.created_at) : "";
    item.appendChild(time);

    timeline.appendChild(item);
  });

  panel.appendChild(timeline);
  return panel;
}

async function renderOverview(container) {
  container.textContent = "";
  container.appendChild(loadingHtml());

  const [statsRes, activityRes] = await Promise.all([
    api("/stats"),
    api("/activity")
  ]);

  if (statsRes.ok) {
    state.stats = statsRes.data;
    state.lastUpdated = Date.now();
    renderCommandBar();
  }

  const activities = activityRes.ok ? activityRes.data : [];

  container.textContent = "";
  container.appendChild(renderOverviewCards(state.stats));

  const healthGrid = document.createElement("div");
  healthGrid.className = "health-grid";
  const hp = renderHealthPanel(state.stats);
  if (hp) healthGrid.appendChild(hp);
  const hf = renderHealthFlags(state.stats?.healthFlags);
  if (hf) healthGrid.appendChild(hf);
  container.appendChild(healthGrid);

  const metricsGrid = document.createElement("div");
  metricsGrid.className = "metrics-grid";
  const sm = renderSearchMetrics(state.stats || {});
  if (sm) metricsGrid.appendChild(sm);
  container.appendChild(metricsGrid);

  container.appendChild(renderTimeline(activities));
}

/* ================================================================
   10. API Keys View
   ================================================================ */

function renderKeyKpiRow(keys) {
  const total    = keys.length;
  const active   = keys.filter(k => k.status === "active").length;
  const inactive = total - active;
  const todaySum = keys.reduce((s, k) => s + (k.today_calls || 0), 0);

  const cards = [
    { label: "총 키",       value: total,    color: "blue" },
    { label: "활성",        value: active,   color: "green" },
    { label: "비활성",      value: inactive, color: "red" },
    { label: "오늘 호출",   value: todaySum, color: "purple" }
  ];

  const grid = document.createElement("div");
  grid.className = "kpi-grid";
  grid.style.marginBottom = "20px";

  cards.forEach(c => {
    const card = document.createElement("div");
    card.className = "kpi-card";

    const label = document.createElement("div");
    label.className = "kpi-label";
    label.textContent = c.label;
    card.appendChild(label);

    const val = document.createElement("div");
    val.className = "kpi-value " + c.color;
    val.textContent = fmt(c.value);
    card.appendChild(val);

    grid.appendChild(card);
  });

  return grid;
}

function renderKeyTable(keys) {
  const wrap = document.createElement("div");
  wrap.className = "data-table-wrap";

  const table = document.createElement("table");
  table.className = "data-table";
  table.id = "keys-table";

  const thead = document.createElement("thead");
  const hRow = document.createElement("tr");
  ["이름", "상태", "접두사", "일일 한도", "오늘 사용", "생성일"].forEach(h => {
    const th = document.createElement("th");
    th.textContent = h;
    hRow.appendChild(th);
  });
  thead.appendChild(hRow);
  table.appendChild(thead);

  const tbody = document.createElement("tbody");
  keys.forEach(k => {
    const tr = document.createElement("tr");
    if (k.id === state.selectedKeyId) tr.classList.add("selected");
    tr.dataset.keyId = k.id;

    const cells = [
      k.name || "",
      null, /* status badge handled separately */
      k.key_prefix || "",
      fmt(k.daily_limit ?? 0),
      fmt(k.today_calls ?? 0),
      fmtDate(k.created_at)
    ];

    cells.forEach((val, i) => {
      const td = document.createElement("td");
      if (i === 1) {
        const badge = document.createElement("span");
        badge.className = "status-badge " + (k.status === "active" ? "status-active" : "status-inactive");
        badge.textContent = k.status || "";
        td.appendChild(badge);
      } else if (i === 2) {
        td.style.fontFamily = "var(--font-mono)";
        td.textContent = val;
      } else {
        td.textContent = val;
      }
      tr.appendChild(td);
    });

    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
  wrap.appendChild(table);
  return wrap;
}

function renderKeyInspector(key) {
  const panel = document.createElement("div");
  panel.className = "split-inspector";
  panel.id = "key-inspector";

  if (!key) {
    const empty = document.createElement("div");
    empty.style.cssText = "color:var(--text-muted);font-size:12px;text-align:center;padding:40px 0;";
    empty.textContent = "키를 선택하세요";
    panel.appendChild(empty);
    return panel;
  }

  const titleEl = document.createElement("div");
  titleEl.className = "inspector-title";
  titleEl.textContent = key.name || "";
  panel.appendChild(titleEl);

  const fields = [
    { label: "ID", value: key.id, mono: true },
    { label: "접두사", value: key.key_prefix || "", mono: true },
    { label: "상태", value: key.status },
    { label: "권한", value: JSON.stringify(key.permissions || []) },
    { label: "일일 한도", value: fmt(key.daily_limit ?? 0) },
    { label: "생성일", value: fmtDate(key.created_at) }
  ];

  fields.forEach(f => {
    const field = document.createElement("div");
    field.className = "inspector-field";
    const lbl = document.createElement("div");
    lbl.className = "inspector-label";
    lbl.textContent = f.label;
    field.appendChild(lbl);
    const val = document.createElement("div");
    val.className = "inspector-value";
    if (f.mono) val.style.fontFamily = "var(--font-mono)";
    val.textContent = f.value;
    field.appendChild(val);
    panel.appendChild(field);
  });

  const actions = document.createElement("div");
  actions.className = "inspector-actions";

  const isActive     = key.status === "active";
  const toggleLabel  = isActive ? "비활성화" : "활성화";
  const toggleStatus = isActive ? "inactive" : "active";

  const toggleBtn = document.createElement("button");
  toggleBtn.className = "btn btn-sm";
  toggleBtn.textContent = toggleLabel;
  toggleBtn.dataset.keyAction = "toggle";
  toggleBtn.dataset.keyId     = key.id;
  toggleBtn.dataset.status    = toggleStatus;
  actions.appendChild(toggleBtn);

  const delBtn = document.createElement("button");
  delBtn.className = "btn btn-sm btn-danger";
  delBtn.textContent = "삭제";
  delBtn.dataset.keyAction = "delete";
  delBtn.dataset.keyId     = key.id;
  actions.appendChild(delBtn);

  panel.appendChild(actions);
  return panel;
}

async function renderKeys(container) {
  container.textContent = "";
  container.appendChild(loadingHtml());

  const res = await api("/keys");
  if (res.ok) state.keys = res.data || [];

  const selectedKey = state.keys.find(k => k.id === state.selectedKeyId) || null;

  container.textContent = "";

  /* Header */
  const header = document.createElement("div");
  header.className = "section-header";
  const sTitle = document.createElement("div");
  sTitle.className = "section-title";
  sTitle.textContent = "API 키 목록";
  header.appendChild(sTitle);
  const createBtn = document.createElement("button");
  createBtn.className = "btn btn-primary btn-sm";
  createBtn.id = "create-key-btn";
  createBtn.textContent = "키 생성";
  header.appendChild(createBtn);
  container.appendChild(header);

  container.appendChild(renderKeyKpiRow(state.keys));

  /* Split layout */
  const split = document.createElement("div");
  split.className = "split-layout";
  const mainDiv = document.createElement("div");
  mainDiv.className = "split-main";
  mainDiv.appendChild(renderKeyTable(state.keys));
  split.appendChild(mainDiv);
  split.appendChild(renderKeyInspector(selectedKey));
  container.appendChild(split);

  /* Event: table row click */
  container.querySelectorAll("#keys-table tbody tr").forEach(tr => {
    tr.addEventListener("click", () => {
      state.selectedKeyId = tr.dataset.keyId;
      renderKeys(container);
    });
  });

  /* Event: create key */
  createBtn.addEventListener("click", () => {
    const form = document.createElement("div");

    const g1 = document.createElement("div");
    g1.className = "form-group";
    const l1 = document.createElement("label");
    l1.className = "form-label";
    l1.textContent = "이름";
    g1.appendChild(l1);
    const nameInput = document.createElement("input");
    nameInput.className = "form-input";
    nameInput.id = "modal-key-name";
    nameInput.placeholder = "예: prod-service-a";
    g1.appendChild(nameInput);
    form.appendChild(g1);

    const g2 = document.createElement("div");
    g2.className = "form-group";
    const l2 = document.createElement("label");
    l2.className = "form-label";
    l2.textContent = "일일 한도";
    g2.appendChild(l2);
    const limitInput = document.createElement("input");
    limitInput.className = "form-input";
    limitInput.id = "modal-key-limit";
    limitInput.type = "number";
    limitInput.value = "10000";
    g2.appendChild(limitInput);
    form.appendChild(g2);

    showModal("API 키 생성", form, [
      { id: "create", label: "생성", cls: "btn-primary", handler: async () => {
        const name        = document.getElementById("modal-key-name")?.value.trim();
        const daily_limit = parseInt(document.getElementById("modal-key-limit")?.value) || 10000;
        if (!name) { showToast("이름을 입력하세요", "warning"); return; }
        const res = await api("/keys", { method: "POST", body: { name, daily_limit } });
        closeModal();
        if (res.ok && res.data?.raw_key) {
          const keyDisplay = document.createElement("div");
          const note = document.createElement("p");
          note.style.cssText = "font-size:13px;color:var(--text-secondary);margin-bottom:12px;";
          note.textContent = "이 키는 다시 표시되지 않습니다. 안전하게 보관하세요.";
          keyDisplay.appendChild(note);

          const copyWrap = document.createElement("div");
          copyWrap.className = "copy-wrap";
          const copyVal = document.createElement("span");
          copyVal.className = "copy-value";
          copyVal.textContent = res.data.raw_key;
          copyWrap.appendChild(copyVal);
          const copyBtn = document.createElement("button");
          copyBtn.className = "copy-btn";
          copyBtn.textContent = "복사";
          copyBtn.addEventListener("click", () => {
            navigator.clipboard.writeText(res.data.raw_key).then(() => showToast("복사됨", "success"));
          });
          copyWrap.appendChild(copyBtn);
          keyDisplay.appendChild(copyWrap);

          showModal("키 생성 완료", keyDisplay, [
            { id: "done", label: "완료", cls: "btn-primary", handler: () => { closeModal(); renderKeys(container); } }
          ]);
        } else {
          showToast(res.data?.error || "생성 실패", "error");
          renderKeys(container);
        }
      }}
    ]);
  });

  /* Event: inspector actions */
  container.querySelectorAll("[data-key-action]").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const action = btn.dataset.keyAction;
      const keyId  = btn.dataset.keyId;

      if (action === "toggle") {
        const newStatus = btn.dataset.status;
        const msg = document.createElement("span");
        msg.textContent = "이 키를 " + newStatus + " 상태로 변경하시겠습니까?";
        showModal("상태 변경 확인", msg, [
          { id: "confirm", label: "변경", cls: "btn-primary", handler: async () => {
            await api("/keys/" + keyId, { method: "PUT", body: { status: newStatus } });
            closeModal();
            showToast("상태 변경 완료", "success");
            renderKeys(container);
          }}
        ]);
      }

      if (action === "delete") {
        const msg = document.createElement("span");
        msg.style.color = "var(--accent-red)";
        msg.textContent = "이 작업은 되돌릴 수 없습니다. 삭제하시겠습니까?";
        showModal("키 삭제 확인", msg, [
          { id: "confirm", label: "삭제", cls: "btn-danger", handler: async () => {
            await api("/keys/" + keyId, { method: "DELETE" });
            closeModal();
            state.selectedKeyId = null;
            showToast("키 삭제 완료", "success");
            renderKeys(container);
          }}
        ]);
      }
    });
  });
}

/* ================================================================
   11. Groups View
   ================================================================ */

function renderGroupCards(groups) {
  if (!groups.length) {
    const empty = document.createElement("div");
    empty.style.cssText = "color:var(--text-muted);font-size:12px;";
    empty.textContent = "그룹이 없습니다";
    return empty;
  }

  const grid = document.createElement("div");
  grid.className = "group-grid";

  groups.forEach(g => {
    const card = document.createElement("div");
    card.className = "group-card" + (g.id === state.selectedGroupId ? " selected" : "");
    card.dataset.groupId = g.id;

    const name = document.createElement("div");
    name.className = "group-name";
    name.textContent = g.name;
    card.appendChild(name);

    const desc = document.createElement("div");
    desc.className = "group-desc";
    desc.textContent = g.description || "";
    card.appendChild(desc);

    const count = document.createElement("div");
    count.className = "group-count";
    count.textContent = "멤버: " + fmt(g.member_count ?? 0);
    card.appendChild(count);

    grid.appendChild(card);
  });

  return grid;
}

async function renderGroups(container) {
  container.textContent = "";
  container.appendChild(loadingHtml());

  const [gRes, kRes] = await Promise.all([
    api("/groups"),
    api("/keys")
  ]);
  if (gRes.ok) state.groups = gRes.data || [];
  if (kRes.ok) state.keys   = kRes.data || [];

  const selected = state.groups.find(g => g.id === state.selectedGroupId) || null;
  let members = [];
  if (selected) {
    const mRes = await api("/groups/" + selected.id + "/members");
    if (mRes.ok) members = mRes.data || [];
  }

  container.textContent = "";

  /* Header */
  const header = document.createElement("div");
  header.className = "section-header";
  const sTitle = document.createElement("div");
  sTitle.className = "section-title";
  sTitle.textContent = "그룹 목록";
  header.appendChild(sTitle);
  const createBtn = document.createElement("button");
  createBtn.className = "btn btn-primary btn-sm";
  createBtn.textContent = "그룹 생성";
  header.appendChild(createBtn);
  container.appendChild(header);

  container.appendChild(renderGroupCards(state.groups));

  /* Group detail */
  if (selected) {
    const detail = document.createElement("div");
    detail.className = "panel";
    detail.style.marginTop = "20px";
    detail.id = "group-detail";

    const dHeader = document.createElement("div");
    dHeader.className = "section-header";
    const dTitle = document.createElement("div");
    dTitle.className = "panel-title";
    dTitle.textContent = selected.name + " -- 멤버";
    dHeader.appendChild(dTitle);

    const dBtns = document.createElement("div");
    dBtns.style.cssText = "display:flex;gap:8px;";

    const addBtn = document.createElement("button");
    addBtn.className = "btn btn-sm";
    addBtn.id = "add-member-btn";
    addBtn.textContent = "멤버 추가";
    dBtns.appendChild(addBtn);

    const delGrpBtn = document.createElement("button");
    delGrpBtn.className = "btn btn-sm btn-danger";
    delGrpBtn.id = "delete-group-btn";
    delGrpBtn.textContent = "그룹 삭제";
    dBtns.appendChild(delGrpBtn);

    dHeader.appendChild(dBtns);
    detail.appendChild(dHeader);

    const tWrap = document.createElement("div");
    tWrap.className = "data-table-wrap";
    const table = document.createElement("table");
    table.className = "data-table";
    const thead = document.createElement("thead");
    const hRow = document.createElement("tr");
    ["이름", "접두사", "작업"].forEach(h => {
      const th = document.createElement("th");
      th.textContent = h;
      hRow.appendChild(th);
    });
    thead.appendChild(hRow);
    table.appendChild(thead);

    const tbody = document.createElement("tbody");
    if (members.length) {
      members.forEach(m => {
        const tr = document.createElement("tr");
        const td1 = document.createElement("td");
        td1.textContent = m.name || "";
        tr.appendChild(td1);
        const td2 = document.createElement("td");
        td2.style.fontFamily = "var(--font-mono)";
        td2.textContent = m.key_prefix || "";
        tr.appendChild(td2);
        const td3 = document.createElement("td");
        const rmBtn = document.createElement("button");
        rmBtn.className = "btn btn-sm btn-danger";
        rmBtn.textContent = "제거";
        rmBtn.dataset.removeMember = m.id;
        td3.appendChild(rmBtn);
        tr.appendChild(td3);
        tbody.appendChild(tr);
      });
    } else {
      const tr = document.createElement("tr");
      const td = document.createElement("td");
      td.colSpan = 3;
      td.style.color = "var(--text-muted)";
      td.textContent = "멤버 없음";
      tr.appendChild(td);
      tbody.appendChild(tr);
    }
    table.appendChild(tbody);
    tWrap.appendChild(table);
    detail.appendChild(tWrap);
    container.appendChild(detail);

    /* Event: add member */
    addBtn.addEventListener("click", () => {
      const form = document.createElement("div");
      const g1 = document.createElement("div");
      g1.className = "form-group";
      const l1 = document.createElement("label");
      l1.className = "form-label";
      l1.textContent = "API 키 선택";
      g1.appendChild(l1);
      const sel = document.createElement("select");
      sel.className = "form-select";
      sel.id = "modal-member-key";
      state.keys.forEach(k => {
        const opt = document.createElement("option");
        opt.value = k.id;
        opt.textContent = k.name + " (" + (k.key_prefix || "") + ")";
        sel.appendChild(opt);
      });
      g1.appendChild(sel);
      form.appendChild(g1);

      showModal("멤버 추가", form, [
        { id: "add", label: "추가", cls: "btn-primary", handler: async () => {
          const keyId = document.getElementById("modal-member-key")?.value;
          if (!keyId) return;
          await api("/groups/" + state.selectedGroupId + "/members", { method: "POST", body: { key_id: keyId } });
          closeModal();
          showToast("멤버 추가 완료", "success");
          renderGroups(container);
        }}
      ]);
    });

    /* Event: remove member */
    container.querySelectorAll("[data-remove-member]").forEach(btn => {
      btn.addEventListener("click", async (e) => {
        e.stopPropagation();
        const keyId = btn.dataset.removeMember;
        await api("/groups/" + state.selectedGroupId + "/members/" + keyId, { method: "DELETE" });
        showToast("멤버 제거 완료", "success");
        renderGroups(container);
      });
    });

    /* Event: delete group */
    delGrpBtn.addEventListener("click", () => {
      const msg = document.createElement("span");
      msg.style.color = "var(--accent-red)";
      msg.textContent = "이 그룹을 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.";
      showModal("그룹 삭제 확인", msg, [
        { id: "confirm", label: "삭제", cls: "btn-danger", handler: async () => {
          await api("/groups/" + state.selectedGroupId, { method: "DELETE" });
          closeModal();
          state.selectedGroupId = null;
          showToast("그룹 삭제 완료", "success");
          renderGroups(container);
        }}
      ]);
    });
  }

  /* Event: group card click */
  container.querySelectorAll(".group-card").forEach(card => {
    card.addEventListener("click", () => {
      state.selectedGroupId = card.dataset.groupId;
      renderGroups(container);
    });
  });

  /* Event: create group */
  createBtn.addEventListener("click", () => {
    const form = document.createElement("div");

    const g1 = document.createElement("div");
    g1.className = "form-group";
    const l1 = document.createElement("label");
    l1.className = "form-label";
    l1.textContent = "이름";
    g1.appendChild(l1);
    const nameInput = document.createElement("input");
    nameInput.className = "form-input";
    nameInput.id = "modal-group-name";
    nameInput.placeholder = "예: team-alpha";
    g1.appendChild(nameInput);
    form.appendChild(g1);

    const g2 = document.createElement("div");
    g2.className = "form-group";
    const l2 = document.createElement("label");
    l2.className = "form-label";
    l2.textContent = "설명";
    g2.appendChild(l2);
    const descInput = document.createElement("input");
    descInput.className = "form-input";
    descInput.id = "modal-group-desc";
    descInput.placeholder = "(선택)";
    g2.appendChild(descInput);
    form.appendChild(g2);

    showModal("그룹 생성", form, [
      { id: "create", label: "생성", cls: "btn-primary", handler: async () => {
        const name = document.getElementById("modal-group-name")?.value.trim();
        const description = document.getElementById("modal-group-desc")?.value.trim() || null;
        if (!name) { showToast("이름을 입력하세요", "warning"); return; }
        const res = await api("/groups", { method: "POST", body: { name, description } });
        closeModal();
        if (res.ok) { showToast("그룹 생성 완료", "success"); renderGroups(container); }
        else showToast(res.data?.error || "생성 실패", "error");
      }}
    ]);
  });
}

/* ================================================================
   12. Memory Operations View
   ================================================================ */

function renderMemoryFilters() {
  const types = ["", "fact", "error", "decision", "procedure", "preference"];

  const bar = document.createElement("div");
  bar.className = "filter-bar";
  bar.id = "memory-filters";

  const topicInput = document.createElement("input");
  topicInput.className = "form-input";
  topicInput.id = "filter-topic";
  topicInput.placeholder = "토픽 검색...";
  topicInput.value = state.memoryFilter.topic;
  bar.appendChild(topicInput);

  const typeSelect = document.createElement("select");
  typeSelect.className = "form-select";
  typeSelect.id = "filter-type";
  types.forEach(t => {
    const opt = document.createElement("option");
    opt.value = t;
    opt.textContent = t || "전체 타입";
    if (state.memoryFilter.type === t) opt.selected = true;
    typeSelect.appendChild(opt);
  });
  bar.appendChild(typeSelect);

  const keyInput = document.createElement("input");
  keyInput.className = "form-input";
  keyInput.id = "filter-key-id";
  keyInput.placeholder = "key_id";
  keyInput.value = state.memoryFilter.key_id;
  keyInput.style.minWidth = "120px";
  bar.appendChild(keyInput);

  const searchBtn = document.createElement("button");
  searchBtn.className = "btn btn-sm";
  searchBtn.id = "filter-search";
  searchBtn.textContent = "검색";
  bar.appendChild(searchBtn);

  return bar;
}

function renderFragmentList(fragments) {
  if (!fragments || !fragments.length) {
    const empty = document.createElement("div");
    empty.style.cssText = "color:var(--text-muted);font-size:12px;padding:20px 0;";
    empty.textContent = "결과 없음";
    return empty;
  }

  const wrap = document.createElement("div");
  wrap.className = "data-table-wrap";

  const table = document.createElement("table");
  table.className = "data-table";
  table.id = "fragment-table";

  const thead = document.createElement("thead");
  const hRow = document.createElement("tr");
  ["타입", "토픽", "내용", "생성일"].forEach(h => {
    const th = document.createElement("th");
    th.textContent = h;
    hRow.appendChild(th);
  });
  thead.appendChild(hRow);
  table.appendChild(thead);

  const tbody = document.createElement("tbody");
  fragments.forEach(f => {
    const tr = document.createElement("tr");
    if (f.id === state.selectedFragment?.id) tr.classList.add("selected");
    tr.dataset.fragId = f.id;

    const td1 = document.createElement("td");
    const badge = document.createElement("span");
    badge.className = "timeline-badge badge-" + (f.type || "fact");
    badge.style.fontSize = "9px";
    badge.textContent = f.type || "?";
    td1.appendChild(badge);
    tr.appendChild(td1);

    const td2 = document.createElement("td");
    td2.textContent = f.topic || "(무제)";
    tr.appendChild(td2);

    const td3 = document.createElement("td");
    td3.style.cssText = "max-width:300px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap";
    td3.textContent = truncate(f.content || "", 80);
    tr.appendChild(td3);

    const td4 = document.createElement("td");
    td4.textContent = fmtDate(f.created_at);
    tr.appendChild(td4);

    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
  wrap.appendChild(table);
  return wrap;
}

function renderFragmentInspector(fragment) {
  if (!fragment) return document.createDocumentFragment();

  const panel = document.createElement("div");
  panel.className = "split-inspector";
  panel.id = "fragment-inspector";

  const titleEl = document.createElement("div");
  titleEl.className = "inspector-title";
  titleEl.textContent = fragment.topic || "(무제)";
  panel.appendChild(titleEl);

  const content = document.createElement("div");
  content.className = "fragment-content";
  content.textContent = fragment.content || "";
  panel.appendChild(content);

  const meta = document.createElement("dl");
  meta.className = "fragment-meta";

  [
    { label: "ID",        value: fragment.id },
    { label: "타입",      value: fragment.type || "" },
    { label: "중요도",    value: String(fragment.importance ?? "-") },
    { label: "agent_id",  value: fragment.agent_id || "-" },
    { label: "key_id",    value: fragment.key_id || "master" },
    { label: "생성일",    value: fmtDate(fragment.created_at) },
    { label: "키워드",    value: JSON.stringify(fragment.keywords || []) }
  ].forEach(f => {
    const dt = document.createElement("dt");
    dt.textContent = f.label;
    meta.appendChild(dt);
    const dd = document.createElement("dd");
    dd.textContent = f.value;
    meta.appendChild(dd);
  });

  panel.appendChild(meta);
  return panel;
}

function renderAnomalyCards(anomalies) {
  if (!anomalies) return document.createDocumentFragment();

  const cards = [
    { label: "품질 미검증",   key: "qualityUnverified", cls: "warn" },
    { label: "오래된 파편",   key: "staleFragments",    cls: "warn" },
    { label: "검색 실패",     key: "failedSearches",    cls: "error" }
  ];

  const grid = document.createElement("div");
  grid.className = "anomaly-grid";

  cards.forEach(c => {
    const card = document.createElement("div");
    card.className = "anomaly-card " + c.cls;
    card.dataset.anomaly = c.key;

    const title = document.createElement("div");
    title.className = "anomaly-title";
    title.textContent = c.label;
    card.appendChild(title);

    const count = document.createElement("div");
    count.className = "anomaly-count";
    count.textContent = fmt(anomalies[c.key] ?? 0);
    card.appendChild(count);

    grid.appendChild(card);
  });

  return grid;
}

function renderPagination() {
  if (state.memoryPages <= 1) return document.createDocumentFragment();

  const wrap = document.createElement("div");
  wrap.className = "pagination";

  for (let i = 1; i <= state.memoryPages; i++) {
    const btn = document.createElement("button");
    btn.className = "btn btn-sm" + (i === state.memoryPage ? " active" : "");
    btn.dataset.page = i;
    btn.textContent = i;
    wrap.appendChild(btn);
  }

  return wrap;
}

async function renderMemory(container) {
  container.textContent = "";
  container.appendChild(loadingHtml());

  const params = new URLSearchParams();
  if (state.memoryFilter.topic)  params.set("topic", state.memoryFilter.topic);
  if (state.memoryFilter.type)   params.set("type", state.memoryFilter.type);
  if (state.memoryFilter.key_id) params.set("key_id", state.memoryFilter.key_id);
  params.set("page", state.memoryPage);

  const [fragRes, anomalyRes] = await Promise.all([
    api("/memory/fragments?" + params),
    api("/memory/anomalies")
  ]);

  if (fragRes.ok) {
    const data       = fragRes.data || {};
    if (Array.isArray(fragRes.data)) {
      state.fragments   = fragRes.data;
      state.memoryPages = 1;
    } else {
      state.fragments   = data.fragments || [];
      state.memoryPages = data.pages || 1;
    }
  } else {
    state.fragments = [];
  }

  state.anomalies = anomalyRes.ok ? anomalyRes.data : null;

  container.textContent = "";

  container.appendChild(renderMemoryFilters());
  container.appendChild(renderAnomalyCards(state.anomalies));

  const split = document.createElement("div");
  split.className = "split-layout";
  const mainDiv = document.createElement("div");
  mainDiv.className = "split-main";
  mainDiv.appendChild(renderFragmentList(state.fragments));
  mainDiv.appendChild(renderPagination());
  split.appendChild(mainDiv);
  split.appendChild(renderFragmentInspector(state.selectedFragment));
  container.appendChild(split);

  /* Event: search */
  document.getElementById("filter-search")?.addEventListener("click", () => {
    state.memoryFilter.topic  = document.getElementById("filter-topic")?.value || "";
    state.memoryFilter.type   = document.getElementById("filter-type")?.value || "";
    state.memoryFilter.key_id = document.getElementById("filter-key-id")?.value || "";
    state.memoryPage = 1;
    renderMemory(container);
  });

  /* Event: pagination */
  container.querySelectorAll("[data-page]").forEach(btn => {
    btn.addEventListener("click", () => {
      state.memoryPage = parseInt(btn.dataset.page);
      renderMemory(container);
    });
  });

  /* Event: fragment click */
  container.querySelectorAll("#fragment-table tbody tr").forEach(tr => {
    tr.addEventListener("click", () => {
      state.selectedFragment = state.fragments.find(f => f.id === tr.dataset.fragId) || null;
      renderMemory(container);
    });
  });
}

/* ================================================================
   13. Utilities
   ================================================================ */

function esc(str) {
  if (str == null) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function fmt(n) {
  if (n == null) return "0";
  return Number(n).toLocaleString("ko-KR");
}

function fmtMs(ms) {
  if (ms == null) return "-";
  return Number(ms).toFixed(1) + "ms";
}

function fmtPct(val) {
  if (val == null) return "-";
  return (Number(val) * 100).toFixed(1) + "%";
}

function fmtDate(iso) {
  if (!iso) return "-";
  const d = new Date(iso);
  return d.toLocaleDateString("ko-KR") + " " + d.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" });
}

function truncate(str, len) {
  if (!str) return "";
  return str.length > len ? str.slice(0, len) + "..." : str;
}

function relativeTime(iso) {
  const diff = Date.now() - new Date(iso).getTime();
  const min  = Math.floor(diff / 60000);
  if (min < 1) return "방금";
  if (min < 60) return min + "분 전";
  const hr = Math.floor(min / 60);
  if (hr < 24) return hr + "시간 전";
  const day = Math.floor(hr / 24);
  return day + "일 전";
}

function loadingHtml() {
  const div = document.createElement("div");
  div.className = "loading-spinner";
  for (let i = 0; i < 3; i++) {
    const dot = document.createElement("span");
    dot.className = "spinner-dot";
    div.appendChild(dot);
  }
  return div;
}

/* ================================================================
   14. Init
   ================================================================ */

function init() {
  if (state.masterKey) {
    document.getElementById("login-root")?.classList.add("hidden");
    document.getElementById("app")?.classList.add("visible");
    navigate("overview");
  } else {
    renderLogin();
  }
}

if (typeof document !== "undefined") {
  document.addEventListener("DOMContentLoaded", init);
}

/* ================================================================
   15. Exports for testing (Node.js environment detection)
   ================================================================ */

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    renderOverviewCards,
    renderHealthFlags,
    renderKeyTable,
    renderGroupCards,
    renderMemoryFilters,
    renderFragmentList,
    renderAnomalyCards,
    renderFragmentInspector,
    renderPagination,
    esc,
    fmt,
    fmtMs,
    fmtPct,
    fmtDate,
    truncate,
    relativeTime,
    state
  };
}

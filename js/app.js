(function () {
  "use strict";

  const params = new URLSearchParams(location.search);
  const useSample = params.has("sample") || window.FORCE_SAMPLE === true;
  const DATA = useSample ? window.makeSampleData(window.MEDIA_KIT) : window.MEDIA_KIT;
  const ORDER = ["tiktok", "instagram", "youtube"];
  const DAY = 864e5;

  // ---------- Dates (all in UTC, as YYYY-MM-DD) ----------

  const today = (() => {
    const n = new Date();
    return Date.UTC(n.getFullYear(), n.getMonth(), n.getDate());
  })();
  const iso = (t) => new Date(t).toISOString().slice(0, 10);
  const parse = (s) => Date.parse(s + "T00:00:00Z");
  const fmtDay = (t, year) =>
    new Date(t).toLocaleDateString("en-GB", { day: "numeric", month: "short", ...(year ? { year: "numeric" } : {}), timeZone: "UTC" });
  const fmtRange = (r) => (r.start === r.end ? fmtDay(r.start, true) : `${fmtDay(r.start)} – ${fmtDay(r.end, true)}`);

  const PRESETS = [
    { id: "today", label: "Today", range: () => ({ start: today, end: today }) },
    { id: "yesterday", label: "Yesterday", range: () => ({ start: today - DAY, end: today - DAY }) },
    { id: "7d", label: "Last 7 days", range: () => ({ start: today - 6 * DAY, end: today }) },
    { id: "30d", label: "Last 30 days", range: () => ({ start: today - 29 * DAY, end: today }) },
    { id: "90d", label: "Last 90 days", range: () => ({ start: today - 89 * DAY, end: today }) },
    {
      id: "mtd",
      label: "Month to date",
      range: () => {
        const d = new Date(today);
        return { start: Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1), end: today };
      },
    },
  ];

  // ---------- State ----------

  const state = {
    platform: ORDER.includes(location.hash.slice(1)) ? location.hash.slice(1) : "tiktok",
    range: { ...PRESETS[3].range(), preset: "30d" },
    show: {}, // per list: "count" or "share"
  };

  // ---------- Formatting ----------

  function format(v, kind) {
    if (typeof v === "string") return v; // snapshot figures like "7k+" are shown exactly as written
    if (v == null || !isFinite(v)) return null;
    switch (kind) {
      case "percent":
        return `${v.toFixed(v < 10 ? 1 : 0)}%`;
      case "hours":
        return `${Math.round(v).toLocaleString("en-GB")} h`;
      case "duration": {
        const s = Math.round(v);
        return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
      }
      default:
        return compact(v);
    }
  }
  function compact(v) {
    const a = Math.abs(v);
    if (a >= 1e6) return `${trim(v / 1e6)}M`;
    if (a >= 1e4) return `${trim(v / 1e3)}K`;
    return Math.round(v).toLocaleString("en-GB");
  }
  const trim = (n) => (n >= 100 ? Math.round(n).toString() : n.toFixed(1).replace(/\.0$/, ""));

  // ---------- Data access ----------

  function daysIn(p, r) {
    const days = (DATA.platforms[p] && DATA.platforms[p].days) || [];
    const a = iso(r.start);
    const b = iso(r.end);
    return days.filter((d) => d.date >= a && d.date <= b);
  }
  function previousRange(r) {
    const len = r.end - r.start + DAY;
    return { start: r.start - len, end: r.end - len };
  }
  function sumList(days, key) {
    const out = new Map();
    let seen = false;
    for (const d of days) {
      const l = d.l && d.l[key];
      if (!l) continue;
      seen = true;
      for (const [k, v] of Object.entries(l)) out.set(k, (out.get(k) || 0) + v);
    }
    return seen ? [...out.entries()].sort((a, b) => b[1] - a[1]) : null;
  }
  // Chart points: hourly for a single day, daily otherwise.
  function series(p, r, key) {
    const days = daysIn(p, r);
    if (!days.length) return null;
    if (r.start === r.end) {
      const h = days[0].hours;
      if (!h) return null;
      return h.map((v, i) => ({ t: r.start + i * 3600e3, v, hourly: true }));
    }
    const byDate = new Map(days.map((d) => [d.date, d.m && d.m[key]]));
    const pts = [];
    for (let t = r.start; t <= r.end; t += DAY) {
      const v = byDate.get(iso(t));
      pts.push({ t, v: typeof v === "number" ? v : null });
    }
    return pts.some((x) => x.v != null) ? pts : null;
  }

  // ---------- Icons ----------

  const ICONS = {
    tiktok:
      '<svg viewBox="0 0 24 24" class="mono" fill="currentColor" aria-hidden="true"><path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z"/></svg>',
    instagram:
      '<svg viewBox="0 0 24 24" fill="#E4405F" aria-hidden="true"><path d="M12 2.16c3.2 0 3.58.01 4.85.07 3.25.15 4.77 1.69 4.92 4.92.06 1.27.07 1.65.07 4.85s-.01 3.58-.07 4.85c-.15 3.23-1.66 4.77-4.92 4.92-1.27.06-1.65.07-4.85.07s-3.58-.01-4.85-.07c-3.26-.15-4.77-1.7-4.92-4.92C2.17 15.58 2.16 15.2 2.16 12s.01-3.58.07-4.85C2.38 3.92 3.9 2.38 7.15 2.23 8.42 2.17 8.8 2.16 12 2.16zM12 0C8.74 0 8.33.01 7.05.07 2.7.27.27 2.69.07 7.05.01 8.33 0 8.74 0 12s.01 3.67.07 4.95c.2 4.36 2.62 6.78 6.98 6.98C8.33 23.99 8.74 24 12 24s3.67-.01 4.95-.07c4.35-.2 6.78-2.62 6.98-6.98.06-1.28.07-1.69.07-4.95s-.01-3.67-.07-4.95c-.2-4.35-2.62-6.78-6.98-6.98C15.67.01 15.26 0 12 0zm0 5.84a6.16 6.16 0 100 12.32 6.16 6.16 0 000-12.32zM12 16a4 4 0 110-8 4 4 0 010 8zm6.41-11.85a1.44 1.44 0 100 2.88 1.44 1.44 0 000-2.88z"/></svg>',
    youtube:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#FF0000" d="M23.5 6.19a3.02 3.02 0 00-2.12-2.14C19.5 3.55 12 3.55 12 3.55s-7.5 0-9.38.5A3.02 3.02 0 00.5 6.19C0 8.07 0 12 0 12s0 3.93.5 5.81a3.02 3.02 0 002.12 2.14c1.88.5 9.38.5 9.38.5s7.5 0 9.38-.5a3.02 3.02 0 002.12-2.14C24 15.93 24 12 24 12s0-3.93-.5-5.81z"/><path fill="#fff" d="M9.55 15.57V8.43L15.82 12z"/></svg>',
    video: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="3" width="12" height="18" rx="2"/><path d="M10.5 9.5l4 2.5-4 2.5z"/></svg>',
    source: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
    person: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="3.5"/><path d="M5 20c1-3.5 3.8-5 7-5s6 1.5 7 5"/></svg>',
    layers: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l9 5-9 5-9-5z"/><path d="M3 13l9 5 9-5"/></svg>',
    device: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="12" rx="2"/><path d="M9 20h6"/></svg>',
    external: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M7 17L17 7M9 7h8v8"/></svg>',
    chevron: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>',
  };

  const COUNTRY_CODES = {
    "United Kingdom": "GB", "United States": "US", Germany: "DE", Canada: "CA", Australia: "AU", Netherlands: "NL",
    France: "FR", Ireland: "IE", India: "IN", Poland: "PL", Spain: "ES", Italy: "IT", Sweden: "SE", Brazil: "BR",
    "Türkiye": "TR", Austria: "AT", Belgium: "BE", Norway: "NO", Denmark: "DK", "New Zealand": "NZ",
  };

  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

  // ---------- Platform pills ----------

  const tabs = document.getElementById("platform-tabs");
  function renderTabs() {
    tabs.innerHTML = ORDER.map((p) => {
      const on = p === state.platform;
      return `<button type="button" class="pill" role="tab" id="tab-${p}" aria-controls="analytics" aria-selected="${on}" tabindex="${on ? 0 : -1}" data-p="${p}">${ICONS[p]}${PLATFORMS[p].name}</button>`;
    }).join("");
  }
  tabs.addEventListener("click", (e) => {
    const b = e.target.closest("[data-p]");
    if (b) choosePlatform(b.dataset.p, true);
  });
  tabs.addEventListener("keydown", (e) => {
    const i = ORDER.indexOf(state.platform);
    let next = null;
    if (e.key === "ArrowRight") next = ORDER[(i + 1) % ORDER.length];
    else if (e.key === "ArrowLeft") next = ORDER[(i + ORDER.length - 1) % ORDER.length];
    else if (e.key === "Home") next = ORDER[0];
    else if (e.key === "End") next = ORDER[ORDER.length - 1];
    if (!next) return;
    e.preventDefault();
    choosePlatform(next, true);
  });
  function choosePlatform(p, focus) {
    state.platform = p;
    try {
      history.replaceState(null, "", "#" + p);
    } catch (_) {}
    renderTabs();
    renderAnalytics();
    if (focus) document.getElementById("tab-" + p).focus();
  }

  // ---------- Analytics container ----------

  const root = document.getElementById("analytics");

  function renderAnalytics() {
    const p = state.platform;
    const def = PLATFORMS[p];
    const pdata = DATA.platforms[p] || {};
    const r = state.range;
    const days = daysIn(p, r);
    root.setAttribute("aria-labelledby", "tab-" + p);

    const updated = DATA.updated ? `Updated ${fmtDay(parse(DATA.updated), true)}` : "";
    const head = `<div class="a-head">
      <span class="updated"><span class="live-dot" aria-hidden="true"></span>${esc(updated)}</span>
      ${pdata.url ? `<a href="${esc(pdata.url)}" target="_blank" rel="noopener noreferrer">${esc(pdata.handle || def.name)} on ${def.name}${ICONS.external}</a>` : ""}
    </div>`;

    // KPIs: only the ones with data. A snapshot figure (e.g. "7k+") is a total, not tied to the range.
    const kpis = def.kpis
      .map((k) => {
        let v = k.value(days, null);
        let note = "";
        if (v == null) {
          const snapKey = Object.keys(pdata.snapshot || {}).find((s) => s.toLowerCase() === k.label.toLowerCase());
          if (snapKey) {
            v = pdata.snapshot[snapKey];
            note = DATA.updated ? `as of ${fmtDay(parse(DATA.updated), true)}` : "";
          }
        }
        const text = format(v, k.format);
        return text == null ? "" : `<div class="kpi"><dt>${esc(k.label)}</dt><dd>${esc(text)}${note ? `<span class="note">${esc(note)}</span>` : ""}</dd></div>`;
      })
      .filter(Boolean);

    const chart = renderChart(p, def, r);
    const lists = def.lists
      .map((pair) => {
        const cols = pair.map((l) => renderList(p, l, days)).filter(Boolean);
        if (!cols.length) return "";
        return `<div class="list-pair${cols.length === 1 ? " single" : ""}">${cols.join(cols.length === 2 ? '<div class="vrule" aria-hidden="true"></div>' : "")}</div>`;
      })
      .filter(Boolean);

    const anything = kpis.length || chart || lists.length;
    root.innerHTML =
      head +
      (kpis.length ? `<dl class="kpis" style="--kpi-cols:${Math.min(kpis.length, 6)}">${kpis.join("")}</dl>` : "") +
      (chart || "") +
      lists.join("") +
      (anything ? "" : `<p class="empty">No ${def.name} figures for ${esc(fmtRange(r))}.</p>`);

    if (chart) bindChart(p, def, r);
    root.querySelectorAll("select[data-list]").forEach((s) =>
      s.addEventListener("change", () => {
        state.show[s.dataset.list] = s.value;
        renderAnalytics();
        root.querySelector(`select[data-list="${s.dataset.list}"]`).focus();
      })
    );
  }

  // ---------- Lists with proportional bars ----------

  const MAX_ROWS = 7;

  function renderList(p, l, days) {
    const rows = sumList(days, l.key);
    if (!rows || !rows.length) return "";
    const id = `${p}.${l.key}`;
    const mode = state.show[id] || (l.share ? "share" : "count");
    const total = rows.reduce((a, [, v]) => a + v, 0);
    const top = rows[0][1] || 1;
    const shown = rows.slice(0, MAX_ROWS);
    const items = shown
      .map(([label, v], i) => {
        const pct = (v / top) * 100;
        const value = mode === "share" ? `${((v / total) * 100).toFixed(1)}%` : compact(v);
        const fade = i === MAX_ROWS - 1 && rows.length >= MAX_ROWS;
        return `<li class="row${fade ? " fade" : ""}" data-value="${v}">
          <div class="track"><span class="bar" style="width:${pct.toFixed(2)}%"></span>
            <span class="label">${icon(l.icon, label)}<span>${esc(label)}</span></span></div>
          <span class="value">${value}</span></li>`;
      })
      .join("");
    return `<div class="list">
      <div class="list-head"><h3>${esc(l.title)}</h3>
        <label class="select"><span class="sr-only">Show ${esc(l.title.toLowerCase())} as</span>
          <select data-list="${id}">
            <option value="count"${mode === "count" ? " selected" : ""}>${esc(l.unit)}</option>
            <option value="share"${mode === "share" ? " selected" : ""}>Share</option>
          </select>${ICONS.chevron}</label></div>
      <ul class="rows">${items}</ul></div>`;
  }

  function icon(kind, label) {
    if (kind === "country") {
      const code = COUNTRY_CODES[label] || label.replace(/[^A-Za-z]/g, "").slice(0, 2).toUpperCase();
      return `<span class="ico" aria-hidden="true">${esc(code)}</span>`;
    }
    return `<span class="ico" aria-hidden="true">${ICONS[kind] || ICONS.source}</span>`;
  }

  // ---------- Chart ----------

  const W = 1000;
  const H = 300;

  function renderChart(p, def, r) {
    const cur = series(p, r, def.chart.key);
    if (!cur) return "";
    const prevR = previousRange(r);
    const prev = series(p, prevR, def.chart.key);
    const vals = cur.concat(prev || []).map((x) => x.v).filter((v) => v != null);
    const max = niceMax(Math.max(...vals, 1));
    const n = cur.length;
    const x = (i) => (n === 1 ? W / 2 : (i / (n - 1)) * W);
    const y = (v) => H - (v / max) * H;
    const line = (pts) => {
      let d = "";
      let pen = false;
      pts.forEach((pt, i) => {
        if (i >= n || pt.v == null) return (pen = false);
        d += `${pen ? "L" : "M"}${x(i).toFixed(1)} ${y(pt.v).toFixed(1)} `;
        pen = true;
      });
      return d;
    };
    const curD = line(cur);
    const first = cur.findIndex((pt) => pt.v != null);
    let last = n - 1;
    while (cur[last].v == null) last--;
    const area = `${curD}L${x(last)} ${H} L${x(first)} ${H} Z`;
    const hourly = cur[0].hourly;
    const prevLabel = r.start === r.end ? "Previous day" : `Previous ${Math.round((r.end - r.start) / DAY) + 1} days`;

    // X axis: both ends plus a couple of points between
    const ticks = [0, Math.round((n - 1) / 3), Math.round(((n - 1) * 2) / 3), n - 1].filter((v, i, a) => a.indexOf(v) === i);
    const axis = ticks
      .map((i) => `<span style="left:${n === 1 ? 50 : (i / (n - 1)) * 100}%">${esc(hourly ? hourLabel(cur[i].t) : fmtDay(cur[i].t))}</span>`)
      .join("");

    state.chart = { cur, prev, max, n, hourly, label: def.chart.label, prevLabel };

    return `<figure class="chart" style="margin:0">
      <span class="chart-max" aria-hidden="true">${compact(max)}</span>
      <div class="plot" tabindex="0" role="img" aria-label="${esc(
        `${def.chart.label}, ${fmtRange(r)}: total ${compact(vals.length ? cur.reduce((a, b) => a + (b.v || 0), 0) : 0)}, highest ${compact(Math.max(...cur.map((c) => c.v || 0)))}. Dotted line: ${prevLabel.toLowerCase()}. Use the arrow keys to read each point.`
      )}">
        <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true">
          <defs><linearGradient id="fill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stop-color="#fff" stop-opacity="0.06"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient></defs>
          <path d="${area}" fill="url(#fill)"/>
          ${prev ? `<path class="s-previous" vector-effect="non-scaling-stroke" d="${line(prev)}"/>` : ""}
          <path class="s-current" vector-effect="non-scaling-stroke" d="${curD}"/>
          <line class="s-rule" id="rule" x1="0" x2="0" y1="0" y2="${H}" vector-effect="non-scaling-stroke" visibility="hidden"/>
        </svg>
      </div>
      <div class="axis" aria-hidden="true">${axis}</div>
      <figcaption class="chart-legend"><span><i></i>${esc(def.chart.label)}</span>${prev ? `<span><i class="dotted"></i>${esc(prevLabel)}</span>` : ""}</figcaption>
    </figure>`;
  }

  function bindChart() {
    const plot = root.querySelector(".plot");
    const rule = root.querySelector("#rule");
    const c = state.chart;
    let active = null;
    let nodes = [];

    function clear() {
      nodes.forEach((el) => el.remove());
      nodes = [];
      rule.setAttribute("visibility", "hidden");
      active = null;
    }
    function show(i) {
      clear();
      active = i;
      const left = c.n === 1 ? 50 : (i / (c.n - 1)) * 100;
      rule.setAttribute("x1", (left / 100) * W);
      rule.setAttribute("x2", (left / 100) * W);
      rule.setAttribute("visibility", "visible");
      const pts = [c.cur[i], c.prev && c.prev[i]];
      pts.forEach((pt) => {
        if (!pt || pt.v == null) return;
        const d = document.createElement("span");
        d.className = "dot";
        d.style.left = left + "%";
        d.style.top = (1 - pt.v / c.max) * 100 + "%";
        plot.appendChild(d);
        nodes.push(d);
      });
      const t = c.cur[i].t;
      const when = c.hourly ? `${fmtDay(t, true)} · ${hourLabel(t)}` : new Date(t).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
      const tip = document.createElement("div");
      tip.className = "tip";
      const row = (cls, label, pt) =>
        `<div><span class="marker${cls}"></span><dt>${esc(label)}</dt><dd>${pt && pt.v != null ? pt.v.toLocaleString("en-GB") : "–"}</dd></div>`;
      tip.innerHTML = `<h3>${esc(when)}</h3><dl>${row("", c.label, c.cur[i])}${c.prev ? row(" dotted", c.prevLabel, c.prev[i]) : ""}</dl>`;
      if (left > 55) tip.style.right = `calc(${100 - left}% + 12px)`;
      else tip.style.left = `calc(${left}% + 12px)`;
      plot.appendChild(tip);
      nodes.push(tip);
    }
    function pick(e) {
      const r = plot.getBoundingClientRect();
      show(Math.min(c.n - 1, Math.max(0, Math.round(((e.clientX - r.left) / r.width) * (c.n - 1)))));
    }
    plot.addEventListener("pointermove", pick);
    plot.addEventListener("pointerdown", pick);
    plot.addEventListener("pointerleave", clear);
    plot.addEventListener("blur", clear);
    plot.addEventListener("keydown", (e) => {
      if (e.key === "ArrowRight") show(Math.min(c.n - 1, active == null ? 0 : active + 1));
      else if (e.key === "ArrowLeft") show(Math.max(0, active == null ? c.n - 1 : active - 1));
      else if (e.key === "Escape") clear();
      else return;
      e.preventDefault();
    });
  }

  const hourLabel = (t) => {
    const h = new Date(t).getUTCHours();
    return `${h % 12 || 12} ${h < 12 ? "AM" : "PM"}`;
  };
  function niceMax(v) {
    const step = Math.pow(10, Math.floor(Math.log10(v)));
    for (const m of [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) if (v <= m * step) return m * step;
    return 10 * step;
  }

  // ---------- Date picker ----------

  const chip = document.getElementById("date-chip");
  const chipLabel = document.getElementById("date-label");
  const dialog = document.getElementById("picker");
  const monthsEl = document.getElementById("months");
  const presetsEl = document.getElementById("presets");
  const rangeEl = document.getElementById("picker-range");
  let draft = null; // { start, end|null, preset }
  let view = 0; // first month shown (UTC ms, 1st of month)
  let focusDay = today;

  function updateChip() {
    const p = PRESETS.find((x) => x.id === state.range.preset);
    chipLabel.textContent = p ? p.label : fmtRange(state.range);
    chip.setAttribute("aria-label", `Date range: ${fmtRange(state.range)}. Change`);
  }

  presetsEl.innerHTML = PRESETS.map((p) => `<li><button type="button" data-preset="${p.id}" aria-pressed="false">${p.label}</button></li>`).join("");

  chip.addEventListener("click", () => {
    draft = { ...state.range };
    const e = new Date(draft.end);
    view = Date.UTC(e.getUTCFullYear(), e.getUTCMonth() - 1, 1);
    focusDay = draft.end;
    renderPicker();
    if (dialog.showModal) dialog.showModal();
    else dialog.setAttribute("open", "");
    const f = monthsEl.querySelector(`[data-t="${focusDay}"]`);
    if (f) f.focus();
  });
  presetsEl.addEventListener("click", (e) => {
    const b = e.target.closest("[data-preset]");
    if (!b) return;
    const p = PRESETS.find((x) => x.id === b.dataset.preset);
    draft = { ...p.range(), preset: p.id };
    const end = new Date(draft.end);
    view = Date.UTC(end.getUTCFullYear(), end.getUTCMonth() - 1, 1);
    renderPicker();
  });
  document.getElementById("cal-prev").addEventListener("click", () => shiftView(-1));
  document.getElementById("cal-next").addEventListener("click", () => shiftView(1));
  function shiftView(m) {
    const v = new Date(view);
    view = Date.UTC(v.getUTCFullYear(), v.getUTCMonth() + m, 1);
    renderPicker();
  }
  monthsEl.addEventListener("click", (e) => {
    const b = e.target.closest("[data-t]");
    if (b) pickDay(+b.dataset.t);
  });
  monthsEl.addEventListener("keydown", (e) => {
    const b = e.target.closest("[data-t]");
    if (!b) return;
    const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[e.key];
    if (!step) return;
    e.preventDefault();
    let t = +b.dataset.t + step * DAY;
    if (t > today) t = today;
    focusDay = t;
    const first = new Date(view);
    const lastShown = Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 2, 0);
    if (t < view) shiftView(-1);
    else if (t > lastShown) shiftView(1);
    else renderPicker();
    const f = monthsEl.querySelector(`[data-t="${t}"]`);
    if (f) f.focus();
  });
  function pickDay(t) {
    focusDay = t;
    if (!draft || draft.end != null) draft = { start: t, end: null };
    else if (t < draft.start) draft = { start: t, end: draft.start };
    else draft = { start: draft.start, end: t };
    renderPicker();
    const f = monthsEl.querySelector(`[data-t="${t}"]`);
    if (f) f.focus();
  }
  document.getElementById("picker-cancel").addEventListener("click", () => dialog.close());
  document.getElementById("picker-apply").addEventListener("click", () => {
    if (!draft) return dialog.close();
    const end = draft.end == null ? draft.start : draft.end;
    state.range = { start: draft.start, end, preset: draft.preset };
    dialog.close();
    updateChip();
    renderAnalytics();
  });
  dialog.addEventListener("close", () => chip.focus());

  function renderPicker() {
    presetsEl.querySelectorAll("[data-preset]").forEach((b) => b.setAttribute("aria-pressed", String(draft && draft.preset === b.dataset.preset)));
    const v = new Date(view);
    monthsEl.innerHTML = [0, 1].map((k) => month(Date.UTC(v.getUTCFullYear(), v.getUTCMonth() + k, 1))).join("");
    const end = draft.end == null ? null : draft.end;
    rangeEl.textContent = end == null ? `${fmtDay(draft.start, true)} – pick an end date` : fmtRange({ start: draft.start, end });
    const nextFirst = Date.UTC(v.getUTCFullYear(), v.getUTCMonth() + 2, 1);
    document.getElementById("cal-next").disabled = nextFirst > today;
  }
  function month(first) {
    const d = new Date(first);
    const y = d.getUTCFullYear();
    const m = d.getUTCMonth();
    const len = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
    const lead = (d.getUTCDay() + 6) % 7; // weeks start on Monday
    const cells = [];
    for (let i = 0; i < lead; i++) cells.push("<td></td>");
    for (let day = 1; day <= len; day++) {
      const t = Date.UTC(y, m, day);
      const a = draft.start;
      const b = draft.end == null ? draft.start : draft.end;
      const cls = ["day"];
      if (t > a && t < b) cls.push("in-range");
      if (t === a || t === b) cls.push("edge");
      if (t === today) cls.push("today");
      const label = new Date(t).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
      cells.push(
        `<td><button type="button" class="${cls.join(" ")}" data-t="${t}" tabindex="${t === focusDay ? 0 : -1}" aria-label="${label}"${t === a || t === b ? ' aria-pressed="true"' : ""}${t > today ? " disabled" : ""}>${day}</button></td>`
      );
    }
    while (cells.length % 7) cells.push("<td></td>");
    const rows = [];
    for (let i = 0; i < cells.length; i += 7) rows.push(`<tr>${cells.slice(i, i + 7).join("")}</tr>`);
    const title = d.toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
    const head = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"].map((w) => `<th scope="col">${w}</th>`).join("");
    return `<div class="month"><h3>${title}</h3><table role="grid" aria-label="${title}"><thead><tr>${head}</tr></thead><tbody>${rows.join("")}</tbody></table></div>`;
  }

  // ---------- Deliverables scroller ----------

  const scroller = document.getElementById("deliverables");
  function renderDeliverables() {
    const list = DATA.deliverables || [];
    // Nothing to show yet: hide the whole section rather than show brands an empty state.
    scroller.closest(".block").hidden = !list.length;
    const cards = list.map(card);
    scroller.innerHTML = cards.join("");
    sizeCards();
  }
  function card(d) {
    const plat = d.platform && ICONS[d.platform] ? `<span class="plat" aria-hidden="true">${ICONS[d.platform]}</span>` : "";
    const img = d.thumb ? `<img src="${esc(d.thumb)}" alt="${esc(d.alt || `${d.brand}: ${d.title || "sponsored video"}`)}" loading="lazy" decoding="async" draggable="false" />` : "";
    const meta = `<div class="meta"><span class="brand">${esc(d.brand)}</span>${d.title ? `<span class="sub">${esc(d.title)}</span>` : ""}</div>`;
    const name = `${d.brand}${d.title ? `: ${d.title}` : ""}${d.platform ? ` (${PLATFORMS[d.platform] ? PLATFORMS[d.platform].name : d.platform})` : ""}`;
    return d.url
      ? `<a class="deliverable" href="${esc(d.url)}" target="_blank" rel="noopener noreferrer" aria-label="${esc(name)}" draggable="false">${img}${plat}${meta}</a>`
      : `<div class="deliverable" role="img" aria-label="${esc(name)}">${img}${plat}${meta}</div>`;
  }
  // Size cards so a fraction of one is always cut off at the right edge.
  function sizeCards() {
    const w = scroller.clientWidth;
    const visible = w < 520 ? 1.6 : w < 820 ? 2.6 : 4.4;
    const gap = 12;
    scroller.style.setProperty("--card-w", `${(w - Math.floor(visible) * gap) / visible}px`);
  }
  window.addEventListener("resize", sizeCards);

  // Drag with a mouse (touch already swipes natively)
  let drag = null;
  scroller.addEventListener("pointerdown", (e) => {
    if (e.pointerType !== "mouse" || e.button !== 0) return;
    drag = { x: e.clientX, left: scroller.scrollLeft, moved: false };
  });
  window.addEventListener("pointermove", (e) => {
    if (!drag) return;
    const dx = e.clientX - drag.x;
    if (Math.abs(dx) > 4) {
      drag.moved = true;
      scroller.classList.add("dragging");
    }
    scroller.scrollLeft = drag.left - dx;
  });
  window.addEventListener("pointerup", () => {
    if (!drag) return;
    const moved = drag.moved;
    drag = null;
    // keep the class for one tick so the click that ends a drag doesn't open a card
    setTimeout(() => scroller.classList.remove("dragging"), moved ? 0 : 0);
  });
  scroller.addEventListener("click", (e) => {
    if (scroller.classList.contains("dragging")) e.preventDefault();
  }, true);
  // Vertical wheel scrolls sideways, until the row reaches an end
  scroller.addEventListener(
    "wheel",
    (e) => {
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
      const max = scroller.scrollWidth - scroller.clientWidth;
      if ((e.deltaY < 0 && scroller.scrollLeft <= 0) || (e.deltaY > 0 && scroller.scrollLeft >= max - 1)) return;
      e.preventDefault();
      scroller.scrollLeft += e.deltaY;
    },
    { passive: false }
  );
  // Arrow keys scroll by one card
  scroller.addEventListener("keydown", (e) => {
    const step = { ArrowRight: 1, ArrowLeft: -1 }[e.key];
    if (!step || e.target !== scroller) return;
    e.preventDefault();
    const w = parseFloat(getComputedStyle(scroller).getPropertyValue("--card-w")) + 12;
    scroller.scrollBy({ left: step * w, behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  });

  // ---------- Partners and footer ----------

  function renderPartners() {
    const list = DATA.partners || [];
    document.getElementById("partners").innerHTML = list
      .map((p) => `<li class="partner"><img src="${esc(p.logo)}" alt="${esc(p.name)} logo" width="56" height="56" loading="lazy" decoding="async" /><span>${esc(p.name)}</span></li>`)
      .join("");
  }
  function renderFooter() {
    document.getElementById("footer").innerHTML = `<span>byalyxx · tech and desk setup creator, UK</span>${
      DATA.email ? `<span>Work with me: <a href="mailto:${esc(DATA.email)}">${esc(DATA.email)}</a></span>` : ""
    }`;
  }

  // ---------- Start ----------

  if (DATA.sample) document.getElementById("sample-banner").hidden = false;
  window.addEventListener("hashchange", () => {
    const h = location.hash.slice(1);
    if (ORDER.includes(h) && h !== state.platform) choosePlatform(h, false);
  });
  renderTabs();
  updateChip();
  renderAnalytics();
  renderDeliverables();
  renderPartners();
  renderFooter();
})();

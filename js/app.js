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

  const TABS = ["all", ...ORDER];
  const state = {
    platform: TABS.includes(location.hash.slice(1)) ? location.hash.slice(1) : "all",
    range: { ...PRESETS[3].range(), preset: "30d" },
    show: {}, // per list: "count" or "share"
    chartMode: "stacked", // All tab: "stacked" or "indexed"
  };
  const NAMES = { all: "All", tiktok: "TikTok", instagram: "Instagram", youtube: "YouTube" };

  // ---------- Formatting ----------

  // KPI row: thousands separators, abbreviated above 10,000. Everywhere else shows the exact figure.
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
    return exact(v);
  }
  const trim = (n) => (n >= 100 ? Math.round(n).toString() : n.toFixed(1).replace(/\.0$/, ""));
  const exact = (v) => Math.round(v).toLocaleString("en-GB");
  const signed = (n, digits, unit) => {
    const r = Number(n.toFixed(digits)); // so -0.04 reads "0.0", not "−0.0"
    return `${r > 0 ? "+" : r < 0 ? "−" : ""}${Math.abs(r).toFixed(digits)}${unit}`;
  };
  // Period-over-period change. Monochrome: the sign carries the direction.
  const change = (cur, prev) => (cur == null || prev == null || !prev ? null : signed(((cur - prev) / prev) * 100, 1, "%"));
  const isNum = (v) => typeof v === "number" && isFinite(v);
  const dayLong = (t) => new Date(t).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
  const when = (t, hourly) => (hourly ? `${dayLong(t)}, ${hourLabel(t)}` : dayLong(t));
  const periodName = (r) => (r.start === r.end ? "previous day" : `previous ${Math.round((r.end - r.start) / DAY) + 1} days`);

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

  // The All tab: one entry per date with each platform's comparable figures (see `combined` in
  // js/platforms.js), plus anything the `all` block in js/data.js adds.
  let allMap = null;
  function allByDate() {
    if (allMap) return allMap;
    allMap = new Map();
    const get = (date) => {
      if (!allMap.has(date)) allMap.set(date, { date, views: {}, audience: {}, eng: {}, hours: null, l: {} });
      return allMap.get(date);
    };
    for (const p of ORDER) {
      const c = PLATFORMS[p].combined;
      for (const d of (DATA.platforms[p] && DATA.platforms[p].days) || []) {
        const m = d.m || {};
        const e = get(d.date);
        if (isNum(m[c.views])) e.views[p] = m[c.views];
        if (isNum(m[c.audience])) e.audience[p] = m[c.audience];
        const parts = ENGAGEMENT_KEYS.map((k) => m[k]);
        if (parts.every(isNum)) e.eng[p] = parts.reduce((a, b) => a + b, 0);
      }
    }
    for (const d of (DATA.all && DATA.all.days) || []) {
      const e = get(d.date);
      if (d.views) Object.assign(e.views, d.views);
      if (d.hours) e.hours = d.hours;
      if (d.l) Object.assign(e.l, d.l);
    }
    return allMap;
  }
  function allIn(r) {
    const a = iso(r.start);
    const b = iso(r.end);
    return [...allByDate().values()].filter((d) => d.date >= a && d.date <= b).sort((x, y) => (x.date < y.date ? -1 : 1));
  }
  // A combined figure only exists when all three platforms report it: a total missing one isn't a total.
  function totalOf(days, field) {
    const per = {};
    for (const p of ORDER) {
      let s = 0;
      let seen = false;
      for (const d of days) if (isNum(d[field][p])) (s += d[field][p]), (seen = true);
      if (!seen) return null;
      per[p] = s;
    }
    return { per, total: ORDER.reduce((a, p) => a + per[p], 0) };
  }
  function latestAudience(days) {
    const per = {};
    for (const p of ORDER) {
      for (let i = days.length - 1; i >= 0; i--) if (isNum(days[i].audience[p])) { per[p] = days[i].audience[p]; break; }
    }
    return per;
  }

  // ---------- Icons ----------

  const ICONS = {
    tiktok:
      '<svg viewBox="0 0 24 24" class="mono" aria-hidden="true"><path fill="currentColor" d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z"/></svg>',
    instagram:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#E4405F" d="M12 2.16c3.2 0 3.58.01 4.85.07 3.25.15 4.77 1.69 4.92 4.92.06 1.27.07 1.65.07 4.85s-.01 3.58-.07 4.85c-.15 3.23-1.66 4.77-4.92 4.92-1.27.06-1.65.07-4.85.07s-3.58-.01-4.85-.07c-3.26-.15-4.77-1.7-4.92-4.92C2.17 15.58 2.16 15.2 2.16 12s.01-3.58.07-4.85C2.38 3.92 3.9 2.38 7.15 2.23 8.42 2.17 8.8 2.16 12 2.16zM12 0C8.74 0 8.33.01 7.05.07 2.7.27.27 2.69.07 7.05.01 8.33 0 8.74 0 12s.01 3.67.07 4.95c.2 4.36 2.62 6.78 6.98 6.98C8.33 23.99 8.74 24 12 24s3.67-.01 4.95-.07c4.35-.2 6.78-2.62 6.98-6.98.06-1.28.07-1.69.07-4.95s-.01-3.67-.07-4.95c-.2-4.35-2.62-6.78-6.98-6.98C15.67.01 15.26 0 12 0zm0 5.84a6.16 6.16 0 100 12.32 6.16 6.16 0 000-12.32zM12 16a4 4 0 110-8 4 4 0 010 8zm6.41-11.85a1.44 1.44 0 100 2.88 1.44 1.44 0 000-2.88z"/></svg>',
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
  ICONS.all = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>';

  // ---------- Platform pills (shared PillTabs) ----------

  const tabsEl = document.getElementById("platform-tabs");
  function renderTabs() {
    tabsEl.innerHTML = UI.PillTabs({
      label: "Platform",
      value: state.platform,
      controls: "analytics",
      items: TABS.map((p) => ({ value: p, id: "tab-" + p, label: NAMES[p], icon: p === "all" ? "" : ICONS[p] })),
    });
  }
  UI.bindPillTabs(tabsEl, (p, focus) => choosePlatform(p, focus));
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
  root.addEventListener("change", (e) => {
    const s = e.target.closest("select[data-select]");
    if (!s) return;
    state.show[s.dataset.select] = s.value;
    renderAnalytics();
    document.querySelector(`select[data-select="${CSS.escape(s.dataset.select)}"]`).focus();
  });

  function kpiHtml(label, text, extra) {
    return `<div class="kpi"><dt>${esc(label)}</dt><dd>${esc(text)}${extra || ""}</dd></div>`;
  }
  function deltaHtml(d, r) {
    return d ? `<span class="delta">${esc(d)}<span class="sr-only"> compared with the ${esc(periodName(r))}</span></span>` : "";
  }
  function pairsHtml(pairs) {
    return pairs
      .map((cols) => {
        cols = cols.filter(Boolean);
        if (!cols.length) return "";
        return `<div class="list-pair${cols.length === 1 ? " single" : ""}">${cols.join(cols.length === 2 ? '<div class="vrule" aria-hidden="true"></div>' : "")}</div>`;
      })
      .join("");
  }
  function headHtml(link) {
    const updated = DATA.updated ? `Updated ${fmtDay(parse(DATA.updated), true)}` : "";
    return `<div class="a-head"><span class="updated"><span class="live-dot" aria-hidden="true"></span>${esc(updated)}</span>${link || ""}</div>`;
  }

  function renderAnalytics() {
    root.setAttribute("aria-labelledby", "tab-" + state.platform);
    const parts = state.platform === "all" ? allParts() : platformParts(state.platform);
    const { head, kpis, chart, lists, name } = parts;
    const anything = kpis.length || chart || lists;
    root.innerHTML =
      head +
      (kpis.length ? `<dl class="kpis" style="--kpi-cols:${Math.min(kpis.length, 6)}">${kpis.join("")}</dl>` : "") +
      (chart ? chartHtml(chart) : "") +
      lists +
      (anything ? "" : `<p class="empty">No ${esc(name)} figures for ${esc(fmtRange(state.range))}.</p>`);
    if (chart) bindChart(chart);
    const toggle = root.querySelector("#chart-mode");
    if (toggle)
      UI.bindPillTabs(toggle, (v, focus) => {
        state.chartMode = v;
        renderAnalytics();
        if (focus) root.querySelector(`#chart-mode [data-value="${v}"]`).focus();
      });
  }

  function platformParts(p) {
    const def = PLATFORMS[p];
    const pdata = DATA.platforms[p] || {};
    const r = state.range;
    const days = daysIn(p, r);
    const link = pdata.url ? `<a href="${esc(pdata.url)}" target="_blank" rel="noopener noreferrer">${esc(pdata.handle || def.name)} on ${def.name}${ICONS.external}</a>` : "";

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
        return text == null ? "" : kpiHtml(k.label, text, note ? `<span class="note">${esc(note)}</span>` : "");
      })
      .filter(Boolean);

    const lists = pairsHtml(
      def.lists.map((pair) =>
        pair.map((l) => {
          const rows = sumList(days, l.key);
          return rows && listHtml({ id: `${p}.${l.key}`, title: l.title, unit: l.unit, share: l.share, rows: rows.map(([label, value]) => ({ label, value, icon: icon(l.icon, label) })) });
        })
      )
    );
    return { name: def.name, head: headHtml(link), kpis, chart: singleChart(p, def, r), lists };
  }

  function allParts() {
    const r = state.range;
    const pr = previousRange(r);
    const days = allIn(r);
    const prevDays = allIn(pr);
    const kpis = [];

    // Followers and subscribers are added only under a label that says so.
    const aud = latestAudience(days);
    const audPrev = latestAudience(prevDays);
    const sum = (o) => (ORDER.every((p) => isNum(o[p])) ? ORDER.reduce((a, p) => a + o[p], 0) : null);
    const audTotal = sum(aud);
    if (audTotal != null) kpis.push(kpiHtml("Followers + subscribers", format(audTotal), deltaHtml(change(audTotal, sum(audPrev)), r)));

    const views = totalOf(days, "views");
    const viewsPrev = totalOf(prevDays, "views");
    if (views) kpis.push(kpiHtml("Views", format(views.total), deltaHtml(change(views.total, viewsPrev && viewsPrev.total), r)));

    const eng = totalOf(days, "eng");
    const engPrev = totalOf(prevDays, "eng");
    if (eng) kpis.push(kpiHtml("Engagements", format(eng.total), deltaHtml(change(eng.total, engPrev && engPrev.total), r)));

    // Engagements ÷ views across all three, so each platform counts by its size. Change in points.
    if (eng && views && views.total) {
      const rate = (eng.total / views.total) * 100;
      const prevRate = engPrev && viewsPrev && viewsPrev.total ? (engPrev.total / viewsPrev.total) * 100 : null;
      kpis.push(kpiHtml("Engagement rate", format(rate, "percent"), deltaHtml(prevRate == null ? null : signed(rate - prevRate, 1, " pts"), r)));
    }

    // Lists
    const audRows = ORDER.map((p) => {
      const c = PLATFORMS[p].combined;
      const label = `${NAMES[p]} ${c.audienceLabel}`;
      if (isNum(aud[p])) return { label, value: aud[p], icon: platformIcon(p) };
      // Only a snapshot like "7k+": shown as written, the bar uses the number it starts from.
      const snap = DATA.platforms[p] && DATA.platforms[p].snapshot && DATA.platforms[p].snapshot[c.audience];
      const n = typeof snap === "string" ? parseSnap(snap) : null;
      return n ? { label, value: n, display: snap, icon: platformIcon(p) } : null;
    });
    const followersList = audRows.every(Boolean)
      ? listHtml({ id: "all.audience", title: "Followers by platform", unit: "Followers", rows: audRows.sort((a, b) => b.value - a.value), snapshot: audRows.some((x) => x.display) })
      : "";
    const viewsList = views
      ? listHtml({
          id: "all.views",
          title: "Views by platform",
          unit: "Views",
          rows: ORDER.map((p) => ({ label: `${NAMES[p]} ${PLATFORMS[p].combined.viewsLabel}`, value: views.per[p], icon: platformIcon(p) })).sort((a, b) => b.value - a.value),
        })
      : "";
    const countries = sumList(days, "countries");
    const countriesList = countries
      ? listHtml({ id: "all.countries", title: "Top countries", unit: "Views", rows: countries.map(([label, value]) => ({ label, value, icon: icon("country", label) })) })
      : "";
    const delivs = (DATA.deliverables || []).filter((d) => isNum(d.views)).sort((a, b) => b.views - a.views);
    const delivList = delivs.length
      ? listHtml({
          id: "all.deliverables",
          title: "Top deliverables",
          unit: "All-time views",
          rows: delivs.map((d) => ({ label: d.title ? `${d.brand} · ${d.title}` : d.brand, value: d.views, icon: d.platform ? platformIcon(d.platform) : icon("video") })),
        })
      : "";

    return {
      name: "combined",
      head: headHtml(""),
      kpis,
      chart: state.chartMode === "indexed" && r.start !== r.end ? indexedChart(r) : stackedChart(r),
      lists: pairsHtml([[followersList, viewsList], [countriesList, delivList]]),
    };
  }

  const parseSnap = (s) => {
    const m = /^([\d.,]+)\s*([kKmM]?)/.exec(s);
    if (!m) return null;
    const n = parseFloat(m[1].replace(/,/g, ""));
    return n * ({ k: 1e3, m: 1e6 }[m[2].toLowerCase()] || 1);
  };

  // ---------- Lists with proportional bars ----------

  const MAX_ROWS = 7;

  function listHtml({ id, title, unit, share, rows, snapshot }) {
    if (!rows || !rows.length) return "";
    const mode = state.show[id] || (share ? "share" : "count");
    const total = rows.reduce((a, x) => a + x.value, 0);
    const top = rows[0].value || 1;
    const items = rows
      .slice(0, MAX_ROWS)
      .map((row, i) => {
        const pct = (row.value / top) * 100;
        const value = mode === "share" && !snapshot ? `${((row.value / total) * 100).toFixed(1)}%` : row.display || exact(row.value);
        const fade = i === MAX_ROWS - 1 && rows.length >= MAX_ROWS;
        return `<li class="row${fade ? " fade" : ""}" data-value="${row.value}">
          <div class="track"><span class="bar" style="width:${pct.toFixed(2)}%"></span>
            <span class="label">${row.icon}<span>${esc(row.label)}</span></span></div>
          <span class="value">${esc(value)}</span></li>`;
      })
      .join("");
    // A list of "7k+" style figures has no exact total to share out, so it gets no dropdown.
    const control = snapshot
      ? `<span class="list-note">As of ${esc(fmtDay(parse(DATA.updated), true))}</span>`
      : UI.Select({
          id: `list:${id}`,
          label: `Show ${title.toLowerCase()} as`,
          value: mode,
          options: [
            { value: "count", label: unit },
            { value: "share", label: "Share" },
          ],
        });
    return `<div class="list"><div class="list-head"><h3>${esc(title)}</h3>${control}</div><ul class="rows">${items}</ul></div>`;
  }

  function icon(kind, label) {
    if (kind === "country") {
      const code = COUNTRY_CODES[label] || label.replace(/[^A-Za-z]/g, "").slice(0, 2).toUpperCase();
      return `<span class="ico" aria-hidden="true">${esc(code)}</span>`;
    }
    return `<span class="ico" aria-hidden="true">${ICONS[kind] || ICONS.source}</span>`;
  }
  const platformIcon = (p) => `<span class="ico brand" aria-hidden="true">${ICONS[p]}</span>`;

  // ---------- Chart models ----------
  // Every chart is a model: points in time (ts), a y maximum, and series to draw. The same renderer,
  // crosshair and tooltip serve all three kinds: "single", "stacked" and "indexed".

  const COLORS = { tiktok: "var(--tiktok)", instagram: "var(--instagram)", youtube: "var(--youtube)" };

  function singleChart(p, def, r) {
    const cur = series(p, r, def.chart.key);
    if (!cur) return null;
    const prev = series(p, previousRange(r), def.chart.key);
    const vals = cur.concat(prev || []).map((x) => x.v).filter((v) => v != null);
    const label = def.chart.label;
    return {
      kind: "single",
      ts: cur.map((x) => x.t),
      prevTs: prev ? prev.map((x) => x.t) : null,
      hourly: !!cur[0].hourly,
      max: niceMax(Math.max(...vals, 1)),
      cur: cur.map((x) => x.v),
      prev: prev ? prev.map((x) => x.v) : null,
      label,
      prevLabel: periodName(r).replace(/^p/, "P"),
      aria: `${label}, ${fmtRange(r)}: total ${exact(cur.reduce((a, b) => a + (b.v || 0), 0))}.`,
    };
  }

  // Views per platform for every point in the range: hourly for a single day, daily otherwise.
  // Null when any platform has nothing, because a stack missing a platform would misstate the total.
  function viewsGrid(r) {
    const days = allIn(r);
    if (r.start === r.end) {
      const d = days[0];
      if (!d || !d.hours || !ORDER.every((p) => Array.isArray(d.hours[p]))) return null;
      return { hourly: true, ts: d.hours.tiktok.map((_, i) => r.start + i * 3600e3), by: Object.fromEntries(ORDER.map((p) => [p, d.hours[p].slice()])) };
    }
    const byDate = new Map(days.map((d) => [d.date, d]));
    const ts = [];
    const by = { tiktok: [], instagram: [], youtube: [] };
    for (let t = r.start; t <= r.end; t += DAY) {
      ts.push(t);
      const d = byDate.get(iso(t));
      for (const p of ORDER) by[p].push(d && isNum(d.views[p]) ? d.views[p] : null);
    }
    if (!ORDER.every((p) => by[p].some((v) => v != null))) return null;
    return { hourly: false, ts, by };
  }

  function stackedChart(r) {
    const g = viewsGrid(r);
    if (!g) return null;
    const pr = previousRange(r);
    const pg = viewsGrid(pr);
    const n = g.ts.length;
    const totalAt = (grid, i) => (ORDER.some((p) => grid.by[p][i] != null) ? ORDER.reduce((a, p) => a + (grid.by[p][i] || 0), 0) : null);
    const totals = g.ts.map((_, i) => totalAt(g, i));
    const prevTotals = pg ? pg.ts.map((_, i) => totalAt(pg, i)) : null;
    const max = niceMax(Math.max(1, ...totals.filter(isNum), ...(prevTotals || []).filter(isNum)));
    const sum = totals.reduce((a, b) => a + (b || 0), 0);
    return {
      kind: "stacked",
      ts: g.ts,
      prevTs: pg ? pg.ts : null,
      hourly: g.hourly,
      max,
      bands: ORDER.map((p) => ({ p, name: NAMES[p], values: g.by[p] })), // bottom to top
      totals,
      prev: prevTotals,
      prevLabel: `${periodName(r).replace(/^p/, "P")}, total`,
      toggle: !g.hourly,
      n,
      aria: `Views on all three platforms, stacked, ${fmtRange(r)}: total ${exact(sum)}. ${ORDER.map((p) => `${NAMES[p]} ${exact(g.by[p].reduce((a, b) => a + (b || 0), 0))}`).join(", ")}.`,
    };
  }

  // Each platform's views as a 7-day average, rebased to 100 on the first day of the range, so growth
  // can be compared regardless of size. The average stops a single big day setting the baseline.
  function indexedChart(r) {
    const g = viewsGrid({ start: r.start - 6 * DAY, end: r.end });
    if (!g) return null;
    const lines = [];
    for (const p of ORDER) {
      const raw = g.by[p];
      const avg = raw.map((_, i) => {
        if (i < 6) return null;
        const win = raw.slice(i - 6, i + 1).filter(isNum);
        return win.length ? win.reduce((a, b) => a + b, 0) / win.length : null;
      });
      const inRange = avg.slice(6);
      const base = inRange.find((v) => v);
      if (!base) continue;
      lines.push({ p, name: NAMES[p], values: inRange.map((v) => (v == null ? null : (v / base) * 100)) });
    }
    if (lines.length !== ORDER.length) return null;
    const vals = lines.flatMap((l) => l.values).filter(isNum);
    return {
      kind: "indexed",
      ts: g.ts.slice(6),
      hourly: false,
      max: niceMax(Math.max(...vals, 100)),
      lines,
      baseT: r.start,
      toggle: true,
      aria: `Views growth by platform, ${fmtRange(r)}, 7-day average indexed to 100 on ${fmtDay(r.start, true)}. ${lines
        .map((l) => `${l.name} ends at ${l.values[l.values.length - 1].toFixed(0)}`)
        .join(", ")}.`,
    };
  }

  // ---------- Chart rendering ----------

  const W = 1000;
  const H = 300;

  function chartHtml(m) {
    const n = m.ts.length;
    const x = (i) => (n === 1 ? W / 2 : (i / (n - 1)) * W);
    const y = (v) => H - (v / m.max) * H;
    const path = (vals) => {
      let d = "";
      let pen = false;
      vals.forEach((v, i) => {
        if (i >= n || v == null) return (pen = false);
        d += `${pen ? "L" : "M"}${x(i).toFixed(1)} ${y(v).toFixed(1)} `;
        pen = true;
      });
      return d;
    };
    const dotted = (vals) => `<path class="s-previous" vector-effect="non-scaling-stroke" d="${path(vals)}"/>`;

    let body = "";
    let legend = "";
    if (m.kind === "single") {
      const d = path(m.cur);
      const first = m.cur.findIndex((v) => v != null);
      let last = n - 1;
      while (m.cur[last] == null) last--;
      body = `<defs><linearGradient id="fill" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity="0.06"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient></defs>
        <path d="${d}L${x(last)} ${H} L${x(first)} ${H} Z" fill="url(#fill)"/>
        ${m.prev ? dotted(m.prev) : ""}<path class="s-current" vector-effect="non-scaling-stroke" d="${d}"/>`;
      legend = `<span><i class="line"></i>${esc(m.label)}</span>${m.prev ? `<span><i class="line dotted"></i>${esc(m.prevLabel)}</span>` : ""}`;
    } else if (m.kind === "stacked") {
      // Cumulative edges: band k fills between edge k and edge k+1
      const edges = [m.ts.map(() => 0)];
      m.bands.forEach((b, k) => edges.push(edges[k].map((v, i) => v + (b.values[i] || 0))));
      m.bands.forEach((b, k) => {
        const up = edges[k + 1].map((v, i) => `${x(i).toFixed(1)} ${y(v).toFixed(1)}`);
        const down = edges[k].map((v, i) => `${x(i).toFixed(1)} ${y(v).toFixed(1)}`).reverse();
        body += `<path class="band" style="--c:${COLORS[b.p]}" d="M${up.join(" L")} L${down.join(" L")} Z"/>`;
      });
      m.bands.forEach((b, k) => (body += `<path class="band-edge" style="--c:${COLORS[b.p]}" vector-effect="non-scaling-stroke" d="${path(edges[k + 1])}"/>`));
      if (m.prev) body += dotted(m.prev);
      legend =
        m.bands
          .slice()
          .reverse()
          .map((b) => `<span><i class="swatch" style="--c:${COLORS[b.p]}"></i>${esc(b.name)}</span>`)
          .join("") + (m.prev ? `<span><i class="line dotted"></i>${esc(m.prevLabel)}</span>` : "");
    } else {
      m.lines.forEach((l) => (body += `<path class="s-index" style="--c:${COLORS[l.p]}" vector-effect="non-scaling-stroke" d="${path(l.values)}"/>`));
      legend =
        m.lines.map((l) => `<span><i class="line" style="--c:${COLORS[l.p]}"></i>${esc(l.name)}</span>`).join("") +
        `<span>7-day average views, ${esc(fmtDay(m.baseT))} = 100</span>`;
    }

    const ticks = [0, Math.round((n - 1) / 3), Math.round(((n - 1) * 2) / 3), n - 1].filter((v, i, a) => a.indexOf(v) === i);
    const axis = ticks
      .map((i) => `<span style="left:${n === 1 ? 50 : (i / (n - 1)) * 100}%">${esc(m.hourly ? hourLabel(m.ts[i]) : fmtDay(m.ts[i]))}</span>`)
      .join("");
    const toggle = m.toggle
      ? UI.PillTabs({
          id: "chart-mode",
          label: "Chart",
          value: m.kind,
          items: [
            { value: "stacked", label: "Stacked" },
            { value: "indexed", label: "Indexed" },
          ],
        })
      : "";

    return `<figure class="chart" style="margin:0">
      <div class="chart-head"><span class="chart-max" aria-hidden="true">${m.kind === "indexed" ? exact(m.max) : compact(m.max)}</span>${toggle}</div>
      <div class="plot" tabindex="0" role="img" aria-label="${esc(m.aria + " Use the arrow keys to read each point.")}">
        <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true">${body}
          <line class="s-rule" x1="0" x2="0" y1="0" y2="${H}" vector-effect="non-scaling-stroke" visibility="hidden"/>
        </svg>
      </div>
      <div class="axis" aria-hidden="true">${axis}</div>
      <figcaption class="chart-legend">${legend}</figcaption>
    </figure>`;
  }

  // ---------- Tooltip ----------
  // One component for every chart. A row is { marker: "dot" | "ring" | null, color, label, value, extra }.

  function Tooltip({ heading, compare, total, rows }) {
    const row = (r, cls) =>
      `<div class="tip-row${cls ? " " + cls : ""}"><span class="marker${r.marker ? " m-" + r.marker : ""}"${r.color ? ` style="--c:${r.color}"` : ""}></span><dt>${esc(r.label)}</dt><dd>${esc(
        r.value
      )}</dd><dd class="extra">${esc(r.extra || "")}</dd></div>`;
    return `<p class="tip-heading">${esc(heading)}</p>${compare ? `<p class="tip-compare">${esc(compare)}</p>` : ""}<dl>${total ? row(total, "total") + '<hr class="tip-rule" />' : ""}${rows
      .map((r) => row(r))
      .join("")}</dl>`;
  }

  // Whole-number shares that add up to exactly 100 (largest remainder).
  function shares(values) {
    const sum = values.reduce((a, b) => a + b, 0);
    if (!sum) return values.map(() => 0);
    const raw = values.map((v) => (v / sum) * 100);
    const out = raw.map(Math.floor);
    let left = 100 - out.reduce((a, b) => a + b, 0);
    raw
      .map((v, i) => [v - Math.floor(v), i])
      .sort((a, b) => b[0] - a[0])
      .forEach(([, i]) => left-- > 0 && out[i]++);
    return out;
  }

  function tooltipFor(m, i) {
    const t = m.ts[i];
    const pt = m.prevTs && m.prevTs[i];
    const compare = pt != null ? `vs ${when(pt, m.hourly)}` : null;
    if (m.kind === "single") {
      const v = m.cur[i];
      const pv = m.prev && m.prev[i];
      return Tooltip({
        heading: when(t, m.hourly),
        compare,
        rows: [
          { marker: "dot", color: "var(--stroke)", label: m.label, value: v == null ? "No data" : exact(v) },
          ...(m.prev ? [{ marker: "ring", color: "var(--stroke)", label: "Previous period", value: pv == null ? "No data" : exact(pv), extra: change(v, pv) || "" }] : []),
        ],
      });
    }
    if (m.kind === "stacked") {
      const vals = m.bands.map((b) => b.values[i] || 0);
      const pct = shares(vals);
      const rows = m.bands
        .map((b, k) => ({ marker: "dot", color: COLORS[b.p], label: b.name, value: exact(vals[k]), extra: `${pct[k]}%`, v: vals[k] }))
        .sort((a, b) => b.v - a.v);
      const tot = m.totals[i];
      const pv = m.prev && m.prev[i];
      return Tooltip({ heading: when(t, m.hourly), compare, total: { label: "Total", value: tot == null ? "No data" : exact(tot), extra: change(tot, pv) || "" }, rows });
    }
    const rows = m.lines
      .map((l) => ({ marker: "dot", color: COLORS[l.p], label: l.name, value: l.values[i] == null ? "No data" : l.values[i].toFixed(1), v: l.values[i] || 0 }))
      .sort((a, b) => b.v - a.v);
    return Tooltip({ heading: dayLong(t), compare: `vs ${dayLong(m.baseT)} = 100`, rows });
  }

  // Points to mark at index i, as { v, color, ring }
  function marksFor(m, i) {
    if (m.kind === "single") return [{ v: m.cur[i], color: "var(--stroke)" }, ...(m.prev ? [{ v: m.prev[i], color: "var(--stroke)", ring: true }] : [])];
    if (m.kind === "stacked") {
      let acc = 0;
      const out = m.bands.map((b) => ({ v: (acc += b.values[i] || 0), color: COLORS[b.p] }));
      if (m.prev) out.push({ v: m.prev[i], color: "var(--stroke)", ring: true });
      return out;
    }
    return m.lines.map((l) => ({ v: l.values[i], color: COLORS[l.p] }));
  }

  // A tap anywhere else puts a touch tooltip away. One listener, pointed at the chart on screen.
  let outsideTap = null;
  document.addEventListener("pointerdown", (e) => outsideTap && outsideTap(e), { capture: true });

  function bindChart(m) {
    const fig = root.querySelector(".chart");
    const plot = fig.querySelector(".plot");
    const rule = plot.querySelector(".s-rule");
    const n = m.ts.length;
    const tip = document.createElement("div");
    tip.className = "tip";
    tip.hidden = true;
    fig.appendChild(tip);
    let marks = [];
    let active = null;
    let touch = false;
    let dragging = false;

    function clear() {
      marks.forEach((el) => el.remove());
      marks = [];
      rule.setAttribute("visibility", "hidden");
      tip.hidden = true;
      active = null;
    }
    function show(i) {
      if (i === active && !tip.hidden) return position(i);
      marks.forEach((el) => el.remove());
      marks = [];
      active = i;
      const left = n === 1 ? 50 : (i / (n - 1)) * 100;
      rule.setAttribute("x1", (left / 100) * W);
      rule.setAttribute("x2", (left / 100) * W);
      rule.setAttribute("visibility", "visible");
      for (const mk of marksFor(m, i)) {
        if (mk.v == null) continue;
        const d = document.createElement("span");
        d.className = mk.ring ? "dot ring" : "dot";
        d.style.setProperty("--c", mk.color);
        d.style.left = left + "%";
        d.style.top = (1 - mk.v / m.max) * 100 + "%";
        plot.appendChild(d);
        marks.push(d);
      }
      tip.innerHTML = tooltipFor(m, i);
      tip.hidden = false;
      position(i);
    }
    // Tracks x; never moves vertically. Mouse: beside the crosshair, flipping left near the right edge.
    // Touch: pinned above the chart, so the finger never covers it.
    function position(i) {
      const fr = fig.getBoundingClientRect();
      const pr = plot.getBoundingClientRect();
      const xPx = pr.left - fr.left + (n === 1 ? 0.5 : i / (n - 1)) * pr.width;
      const w = tip.offsetWidth;
      let left;
      if (touch) {
        left = Math.min(Math.max(xPx - w / 2, 0), fr.width - w);
        tip.style.top = "auto";
        tip.style.bottom = `calc(100% + 8px)`;
      } else {
        left = xPx + 14 + w > fr.width ? xPx - 14 - w : xPx + 14;
        left = Math.max(0, left);
        tip.style.bottom = "auto";
        tip.style.top = `${pr.top - fr.top + 4}px`;
      }
      tip.classList.toggle("flipped", !touch && left < xPx);
      tip.classList.toggle("pinned", touch);
      tip.style.left = `${left}px`;
    }
    const indexAt = (clientX) => {
      const r = plot.getBoundingClientRect();
      return Math.min(n - 1, Math.max(0, Math.round(((clientX - r.left) / r.width) * (n - 1))));
    };
    plot.addEventListener("pointerdown", (e) => {
      touch = e.pointerType !== "mouse";
      if (touch) dragging = true;
      show(indexAt(e.clientX));
    });
    plot.addEventListener("pointermove", (e) => {
      if (e.pointerType === "mouse") {
        touch = false;
        show(indexAt(e.clientX));
      } else if (dragging) show(indexAt(e.clientX));
    });
    plot.addEventListener("pointerup", () => (dragging = false));
    plot.addEventListener("pointercancel", () => (dragging = false));
    plot.addEventListener("pointerleave", (e) => {
      if (e.pointerType === "mouse") clear();
    });
    outsideTap = (e) => {
      if (touch && !plot.contains(e.target)) clear();
    };
    plot.addEventListener("blur", clear);
    plot.addEventListener("keydown", (e) => {
      touch = false;
      if (e.key === "ArrowRight") show(Math.min(n - 1, active == null ? 0 : active + 1));
      else if (e.key === "ArrowLeft") show(Math.max(0, active == null ? n - 1 : active - 1));
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
    if (TABS.includes(h) && h !== state.platform) choosePlatform(h, false);
  });
  renderTabs();
  updateChip();
  renderAnalytics();
  renderDeliverables();
  renderPartners();
  renderFooter();
})();

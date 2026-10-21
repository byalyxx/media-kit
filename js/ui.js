// Control primitives shared with the main site (byalyxx/site-). The class names and props mirror the
// source components so the two can be merged later; the styles are in ui.css.

(function () {
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

  // components/home/hero.tsx
  const buttonClass = "site-button";
  // components/home/site-nav.tsx
  const itemClass = "site-nav-item";
  // components/home/forms.tsx, the ContactForm submit button
  const submitClass = "site-submit";

  // New, built from the main site's tokens: the SiteNav pill group holding text items, as a tablist.
  // Props follow the shadcn Tabs used on the main site (value, items with value + label).
  function PillTabs({ id, label, value, items, controls }) {
    return `<div class="site-nav" role="tablist" aria-label="${esc(label)}"${id ? ` id="${esc(id)}"` : ""}>${items
      .map((it) => {
        const on = it.value === value;
        return `<button type="button" class="site-tab" role="tab" id="${esc(it.id || "")}" data-value="${esc(it.value)}" aria-selected="${on}" tabindex="${on ? 0 : -1}"${controls ? ` aria-controls="${esc(controls)}"` : ""}>${it.icon || ""}<span>${esc(it.label)}</span></button>`;
      })
      .join("")}</div>`;
  }

  // Arrow keys, Home and End move between tabs (the same keys Radix Tabs uses on the main site).
  function bindPillTabs(el, onChange) {
    const values = () => [...el.querySelectorAll("[role=tab]")].map((b) => b.dataset.value);
    el.addEventListener("click", (e) => {
      const b = e.target.closest("[role=tab]");
      if (b) onChange(b.dataset.value, false);
    });
    el.addEventListener("keydown", (e) => {
      const v = values();
      const cur = el.querySelector('[aria-selected="true"]');
      const i = v.indexOf(cur && cur.dataset.value);
      const next = { ArrowRight: v[(i + 1) % v.length], ArrowLeft: v[(i + v.length - 1) % v.length], Home: v[0], End: v[v.length - 1] }[e.key];
      if (next == null) return;
      e.preventDefault();
      onChange(next, true);
    });
  }

  // New, built from the main site's tokens: a native <select> wearing buttonClass.
  function Select({ id, label, value, options }) {
    return `<label class="site-select"><span class="sr-only">${esc(label)}</span>
      <select class="${buttonClass}" id="${esc(id)}" data-select="${esc(id)}">${options
        .map((o) => `<option value="${esc(o.value)}"${o.value === value ? " selected" : ""}>${esc(o.label)}</option>`)
        .join("")}</select><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg></label>`;
  }

  window.UI = { buttonClass, itemClass, submitClass, PillTabs, bindPillTabs, Select, esc };
})();

// Neuron interpretations: the "(+) …; (−) …" line with a confidence, and the readouts people attach, drawn the way
// the neuron explorer draws them: line after line of + and − rows. Field blocks (see AGENTS.md, "Interpretations"):
//   tokens   {type, name, note?, rows: {"+": [tok | [tok, value]], "-": [...]}}
//   contexts {type, name, note?, tags?: {"+": [[label, score]]}, rows: {"+": [{text, tag?, value?} | "text"]}}
//            text marks hot tokens with ⟦…⟧ (or ⟦…|0.4⟧ for a heat from 0 to 1)
//   units    {type, name, note?, groups: [{label, sign?: "+"|"-", note?, items: [[label, count?, href?]]}]}
//   heads    {type, name, note?, rows: {q: [[label, score?, href?]], k, v, o}}
//   stats    {type, name, items: [[label, value]]}
//   text     {type, name, text}
// Anything else is shown as JSON, so nothing a submitter sends is lost.
import { esc } from "./format.js?v=20261031210000";

export const QUESTIONABLE = 0.3;

export function confHtml(v, cls = "") {
  if (v == null || !Number.isFinite(+v)) return "";
  v = +v;
  const pips = Math.max(0, Math.min(5, Math.round(v * 5)));
  return `<span class="aconf${v < QUESTIONABLE ? " q" : ""} ${cls}" title="confidence ${v.toFixed(2)}${v < QUESTIONABLE ? ": questionable" : ""}"><span class="pips">${
    Array.from({ length: 5 }, (_, i) => `<i${i < pips ? ' class="on"' : ""}></i>`).join("")}</span><span class="cv">${v.toFixed(2)}</span></span>`;
}

const POLES = [["+", "u"], ["-", "d"]];
const rowsOf = (rows, k) => (rows && (rows[k] ?? rows[k === "-" ? "−" : k])) || [];
const sign = (k, c) => `<span class="xs ${c}">${k === "-" ? "−" : "+"}</span>`;
const num = (v) => (typeof v === "number" ? +v.toFixed(3) : v);

function chip(item, c, link) {
  const [label, val, href] = Array.isArray(item) ? item : [item];
  const inner = `${esc(label)}${val != null && val !== "" ? `<span class="cnt">${esc(num(val))}</span>` : ""}`;
  // links in readouts are submitter data: only http(s) or site-relative, never javascript:/data: etc.
  const safe = (u) => typeof u === "string" && (/^https?:\/\//i.test(u) || /^\/(?!\/)/.test(u)) ? u : null;
  const h = safe(href) || safe(link);
  return h ? `<a class="xc ${c}" href="${esc(h)}">${inner}</a>` : `<span class="xc ${c}">${inner}</span>`;
}

function ctxText(t, c) {
  // ⟦tok⟧ = hottest; ⟦tok|0.4⟧ = heat 0-1. Like the explorer, the line is pinned on the hottest token: the text before
  // it is right-aligned and clipped on the left, so the firing token sits ~40% across however long the window is.
  t = String(t).replace(/\n/g, "⏎");
  const marks = [...t.matchAll(/⟦(.*?)(?:\|([\d.]+))?⟧/g)];
  const hottest = marks.reduce((best, m) => (best == null || (m[2] == null ? 1 : +m[2]) > (best[2] == null ? 1 : +best[2]) ? m : best), null);
  const paint = (s) => esc(s).replace(/⟦(.*?)(?:\|([\d.]+))?⟧/g, (_, tok, h) => {
    const heat = h == null ? 1 : Math.max(0, Math.min(1, +h));
    return `<span class="hot${c}" style="--heat:${heat}">${tok}</span>`;
  });
  if (!hottest) return `<span class="xpost">${paint(t)}</span>`;
  // split before the run of marks that holds the hottest one, so a multi-token highlight stays together
  let cut = hottest.index;
  for (const m of marks.slice().reverse()) if (m.index < cut && m.index + m[0].length >= cut - 1) cut = m.index;
  return `<span class="xpre"><span>${paint(t.slice(0, cut))}</span></span><span class="xpost">${paint(t.slice(cut))}</span>`;
}

function head(f) {
  return `<div class="xh">${esc(f.name || f.type)}${f.note ? ` <span class="faint">${esc(f.note)}</span>` : ""}</div>`;
}

const RENDER = {
  tokens(f) {
    return head(f) + POLES.map(([k, c]) => {
      const r = rowsOf(f.rows, k);
      return r.length ? `<div class="xrow">${sign(k, c)}<div class="xr">${r.map((t) => chip(t, c)).join("")}</div></div>` : "";
    }).join("");
  },
  contexts(f) {
    return head(f) + POLES.map(([k, c]) => {
      const tags = rowsOf(f.tags, k), lines = rowsOf(f.rows, k);
      if (!tags.length && !lines.length) return "";
      return `<div class="xrow">${sign(k, c)}<div class="xr">${tags.length ? tags.map((t) => chip(t, c)).join("") : '<span class="faint xnone">top firings</span>'}</div></div>`
        + lines.map((l) => {
          const o = typeof l === "string" ? { text: l } : l || {};
          return `<div class="xl"><span class="xt">${ctxText(o.text || "", c)}</span><span class="xdom">${esc(o.tag || "")}</span><span class="xv">${o.value != null ? esc(num(o.value)) : ""}</span></div>`;
        }).join("");
    }).join("");
  },
  units(f) {
    return head(f) + (f.groups || []).map((g) => {
      const c = g.sign === "-" || g.sign === "−" ? "d" : g.sign === "+" ? "u" : "";
      return `<div class="xnh">${c ? `<i class="dot ${c}"></i>` : ""}${esc(g.label || "")}${g.note ? ` <span class="faint">· ${esc(g.note)}</span>` : ""}</div>`
        + `<div class="xr">${(g.items || []).map((t) => chip(t, "n")).join("")}</div>`;
    }).join("");
  },
  heads(f) {
    return head(f) + ["q", "k", "v", "o"].map((k) => {
      const r = rowsOf(f.rows, k);
      // a head chip links to a search for it until heads have pages of their own
      return r.length ? `<div class="xrow"><span class="xs q">${k}</span><div class="xr">${r.map((t) => {
        const [label] = Array.isArray(t) ? t : [t];
        return chip(t, "hd", `/?q=${encodeURIComponent(label)}`);
      }).join("")}</div></div>` : "";
    }).join("");
  },
  stats(f) {
    return head(f) + `<div class="xstats">${(f.items || []).map(([k, v]) => `<span><span class="faint">${esc(k)}</span> <span class="mono">${esc(num(v))}</span></span>`).join("")}</div>`;
  },
  text(f) {
    return head(f) + `<div class="xtext">${esc(f.text || "")}</div>`;
  },
};

export function fieldsHtml(fields) {
  return (fields || []).map((f) => {
    const r = f && RENDER[f.type];
    let body;
    try { body = r ? r(f) : head(f || {}) + `<pre class="xraw">${esc(JSON.stringify(f, null, 2))}</pre>`; }
    catch { body = head(f || {}) + `<pre class="xraw">${esc(JSON.stringify(f, null, 2))}</pre>`; }
    return `<div class="xsec">${body}</div>`;
  }).join("");
}

// one interpretation: the line, its confidence, who, then its readouts folded (fade + "show all fields")
export function interpHtml(it, { mine = false, admin = false } = {}) {
  return `<div class="interp${it.confidence != null && it.confidence < QUESTIONABLE ? " q" : ""}" data-interp="${it.id}">
    <div class="itext">${esc(it.text)} ${confHtml(it.confidence)}</div>
    <div class="iby"><span class="unv" title="nobody has checked this interpretation by steering yet">unverified</span>
      <span class="faint">@${esc(it.author_handle)}${it.source ? ` · ${/^https?:/.test(it.source) ? `<a href="${esc(it.source)}" target="_blank" rel="noopener">source</a>` : esc(it.source)}` : ""}${it.method ? ` · ${esc(it.method)}` : ""}</span>
      ${it.hidden ? `<span class="faint">· hidden</span>` : ""}
      ${mine || admin ? `<button class="linkbtn dim" data-idel="${it.id}">delete</button>` : ""}</div>
  </div>`;
}

// the neuron's readouts, once: folded (fade + "show all readouts"); who sent them in a faint line under the fold
export function readoutsHtml(rows) {
  if (!rows || !rows.length) return "";
  const by = [...new Set(rows.map((r) => r.author_handle + (r.source ? ` · ${r.source}` : "")))];
  return `<div class="xfold"><div class="xbody">${fieldsHtml(rows.map((r) => r.block))}</div>
    <button class="xmore" data-xmore><span>show all readouts</span><svg width="12" height="12" viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 6l4.5 4.5L12.5 6" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg></button>
    <div class="xby faint">readouts from ${by.map((b) => "@" + esc(b)).join(", ")}</div></div>`;
}

// after inserting: folds that don't overflow lose their button; the button toggles
export function wireFolds(root) {
  root.querySelectorAll(".xfold").forEach((f) => {
    const body = f.querySelector(".xbody"), b = f.querySelector("[data-xmore]");
    if (body.scrollHeight <= body.clientHeight + 4) { f.classList.add("open", "short"); return; }
    b.onclick = () => {
      const open = f.classList.toggle("open");
      b.querySelector("span").textContent = open ? "show less" : "show all readouts";
    };
  });
}

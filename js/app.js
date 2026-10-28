import { ABOUT_HTML } from "./about.js?v=20261028152117";
import { createStore } from "./store.js?v=20261028152117";
import { randomPrompt } from "./prompts.js?v=20261028152117";
import {
  esc, doseStr, neuronKey, neuronStr, sortNeurons, recipeStr, recipeHtml, neuronHtml, edgeMark, setKey, parseRecipeStr, parseNeuronQuery,
  methodOf, DEFAULT_METHOD, samplingText, md, recipeFile, recipeJson, pythonSnippet, studioFile, fromStudio, slugify, ago, avatarHtml, copyText, download,
} from "./format.js?v=20261028152117";

const CFG = window.NEURONARY || {};
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const main = $("#main");
const overlay = $("#overlay");
let store;
let RECIPES = [];

// ------------------------------------------------------------------ icons
// share links (/r/<id>, /n/<neuron>) land on a static page; the app itself routes by hash
{
  // the site routes by path (/about, /r/<id>); links from before used #/about, #/r/<id>
  if (location.hash.startsWith("#/")) history.replaceState(null, "", location.hash.slice(1) || "/");
}

const I = {
  rpart: '<svg width="13" height="13" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="5.6" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M8 2.4a5.6 5.6 0 0 1 0 11.2z" fill="currentColor"/></svg>',
  rno: '<svg width="13" height="13" viewBox="0 0 16 16" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
  share: '<svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 10V2.5M5 5.2 8 2.2l3 3M3.5 8.5v5h9v-5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  repro: '<svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><path d="M2.5 8.5 5.5 11.5 10.5 5M7.5 11.5 8.5 12.5 13.5 5.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  star: '<svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1.8l1.9 3.9 4.3.6-3.1 3 .7 4.3L8 11.6l-3.8 2 .7-4.3-3.1-3 4.3-.6z" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/></svg>',
  starOn: '<svg class="staron" width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1.8l1.9 3.9 4.3.6-3.1 3 .7 4.3L8 11.6l-3.8 2 .7-4.3-3.1-3 4.3-.6z" fill="var(--warn)" stroke="var(--warn)" stroke-width="1.4" stroke-linejoin="round"/></svg>',
  dice: '<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><rect x="2" y="2" width="12" height="12" rx="2.5" fill="none" stroke="currentColor" stroke-width="1.5"/><circle cx="5.5" cy="5.5" r="1.1" fill="currentColor"/><circle cx="10.5" cy="10.5" r="1.1" fill="currentColor"/><circle cx="8" cy="8" r="1.1" fill="currentColor"/></svg>',
  fork: '<svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><circle cx="4.5" cy="3.5" r="1.6" fill="none" stroke="currentColor" stroke-width="1.5"/><circle cx="11.5" cy="3.5" r="1.6" fill="none" stroke="currentColor" stroke-width="1.5"/><circle cx="8" cy="12.5" r="1.6" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M4.5 5.1v1.4c0 1.4 1 2.2 2.3 2.4L8 9.1l1.2-.2c1.3-.2 2.3-1 2.3-2.4V5.1M8 9.1v1.8" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>',
  up: '<svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M1.5 8.5L6 3l4.5 5.5z" fill="currentColor"/></svg>',
  down: '<svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M1.5 3.5L6 9l4.5-5.5z" fill="currentColor"/></svg>',
  bubble: '<svg width="15" height="14" viewBox="0 0 15 14" aria-hidden="true"><path d="M2.5 1.5h10a1.5 1.5 0 0 1 1.5 1.5v5.5a1.5 1.5 0 0 1-1.5 1.5H7l-3 2.5V10H2.5A1.5 1.5 0 0 1 1 8.5V3a1.5 1.5 0 0 1 1.5-1.5z" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>',
  chev: '<svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><path d="M2 3.5l3 3 3-3" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>',
  grid: '<svg width="13" height="13" viewBox="0 0 13 13" aria-hidden="true"><rect x="0" y="0" width="5.5" height="5.5" rx="1" fill="currentColor"/><rect x="7.5" y="0" width="5.5" height="5.5" rx="1" fill="currentColor"/><rect x="0" y="7.5" width="5.5" height="5.5" rx="1" fill="currentColor"/><rect x="7.5" y="7.5" width="5.5" height="5.5" rx="1" fill="currentColor"/></svg>',
  rows: '<svg width="14" height="12" viewBox="0 0 14 12" aria-hidden="true"><rect y="0" width="14" height="2" rx="1" fill="currentColor"/><rect y="5" width="14" height="2" rx="1" fill="currentColor"/><rect y="10" width="14" height="2" rx="1" fill="currentColor"/></svg>',
  filter: '<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M2 3h12l-4.6 5.4V13l-2.8 1.2V8.4z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>',
  plus: '<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 2.5v11M2.5 8h11" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  x: '<svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M18.9 2H22l-6.8 7.8L23.2 22h-6.3l-4.9-6.4L6.4 22H3.3l7.3-8.3L2.9 2h6.4l4.4 5.9zm-1.1 18.1h1.7L8.3 3.8H6.5z"/></svg>',
  copy: '<svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><rect x="5" y="5" width="9" height="9" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M11 5V3.5A1.5 1.5 0 0 0 9.5 2h-6A1.5 1.5 0 0 0 2 3.5v6A1.5 1.5 0 0 0 3.5 11H5" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>',
  download: '<svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 2v8M4.5 6.8 8 10.3l3.5-3.5M2.5 13.5h11" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  check: '<svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8.5 6.5 12 13 4.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  edit: '<svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><path d="M10.5 2.5l3 3L5.5 13.5H2.5v-3z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>',
  trash: '<svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><path d="M2.5 4h11M6 4V2.5h4V4M4 4l.7 9.5h6.6L12 4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>',
  eyeoff: '<svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><path d="M1.5 8s2.4-4.5 6.5-4.5S14.5 8 14.5 8s-2.4 4.5-6.5 4.5S1.5 8 1.5 8z" fill="none" stroke="currentColor" stroke-width="1.5"/><circle cx="8" cy="8" r="2" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M2.5 13.5l11-11" stroke="currentColor" stroke-width="1.5"/></svg>',
  flag: '<svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 14V2.5M3.5 3h8.5l-2 3 2 3H3.5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>',
  theme: '<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M8 2a6 6 0 0 1 0 12z" fill="currentColor"/></svg>',
};

// ------------------------------------------------------------------ routing
function parseRoute() {
  if (/(^|#)(access_token|error|refresh_token)=/.test(location.hash.slice(1))) { history.replaceState(null, "", "/"); }
  return parseHash(here());
}
// the current route as a path: "/r/abc", "/?q=x"
const here = () => location.pathname + location.search;
function parseHash(hash) {
  const h = hash.replace(/^#?\/?/, "");
  const [path, qs] = h.split("?");
  const parts = path.split("/").filter(Boolean).map(decodeURIComponent);
  const p = new URLSearchParams(qs || "");
  if (!parts.length) return { view: "browse", p };
  if (parts[0] === "browse") return { view: "browse", p };
  if (parts[0] === "c" && parts[1]) {
    p.set("tags", parts[1]);
    return { view: "browse", p };
  }
  if (parts[0] === "r" && parts[1]) return { view: "recipe", id: parts[1], p };
  if (parts[0] === "submit") return { view: "submit-legacy", p };
  if (parts[0] === "n" && parts[1]) return { view: "neuron", key: parts[1], p };
  if (parts[0] === "u" && parts[1]) return { view: "user", handle: parts[1], p };
  if (parts[0] === "about") return { view: "about", p };
  return { view: "notfound", p };
}

const browseHref = (p) => {
  const s = new URLSearchParams();
  for (const [k, v] of Object.entries(p)) if (v != null && v !== "" && !(Array.isArray(v) && !v.length)) s.set(k, Array.isArray(v) ? v.join(",") : v);
  const q = s.toString();
  return "/" + (q ? "?" + q : "");
};

let listShown = false; // the main area holds home/browse, so a recipe can open as a modal over it
let modalPushed = false;
let lastListHash = "/";

async function route() {
  editorOpen = false;
  const r = parseRoute();
  if (typeof closePops === "function") closePops();
  syncSearchBox(r);
  if (r.view === "recipe") {
    // a recipe always opens as a sheet; on a fresh load (or from about) the home list goes underneath,
    // so refreshing looks the same and closing lands on home
    if (!listShown) {
      document.body.className = "";
      renderBrowse(new URLSearchParams());
      listShown = true; modalPushed = false; lastListHash = "/";
    }
    return openModal(r.id);
  }
  document.title = "neuronary";
  const wasModal = !!overlay.innerHTML;
  closeModal(true);
  modalPushed = false;
  if (wasModal && listShown && here() === lastListHash) return; // back to the list underneath, untouched
  if (r.view === "browse") { listShown = true; lastListHash = here(); return renderBrowse(r.p); }
  listShown = false;
  if (r.view === "submit-legacy") { history.replaceState(null, "", "/"); route(); return openEditor(); }
  if (r.view === "about") { document.body.className = "page"; document.title = "About · neuronary"; main.innerHTML = ABOUT_HTML; scrollTo(0, 0); return; }
  if (r.view === "neuron") { document.body.className = ""; listShown = true; lastListHash = here(); return renderNeuron(r.key); }
  if (r.view === "user") { document.body.className = ""; listShown = true; lastListHash = here(); return renderUser(r.handle, r.p); }
  document.body.className = "page";
  main.innerHTML = `<div class="empty">Nothing here. <a href="/">neuronary</a></div>`;
}

// navigate within the app (a history entry, no page load)
function go(path) {
  if (here() === path) return route();
  history.pushState(null, "", path);
  route();
}
const nav = go;

// ------------------------------------------------------------------ common bits
// escape, then turn bare http(s) URLs into links
const linkify = (t) => esc(t).replace(/https?:\/\/[^\s<]+[^\s<.,;:!?)\]'"]/g, (u) => `<a href="${u}" target="_blank" rel="noopener nofollow">${u}</a>`);
function votesHtml(r, cls = "") {
  return `<span class="votes v${r.myVote} ${cls}" data-vote="${esc(r.id)}">
    <button class="upv" data-v="1" aria-label="upvote">${I.up}</button><span class="n">${r.score}</span><button class="downv" data-v="-1" aria-label="downvote">${I.down}</button></span>`;
}

const tagHref = (t) => browseHref({ tags: [t] });
const tagsHtml = (tags, on = []) => tags.map((t) => `<a class="tag ${on.includes(t) ? "on" : ""}" href="${tagHref(t)}">${esc(t)}</a>`).join("");
const shortModel = (m) => m.split("/").pop();
// reproduction results: worked / partly / didn't, each only when non-zero
function reproHtml(r, long = false) {
  const parts = [[r.reproductions, "yes", I.repro, "reproduced"], [r.repro_partial, "partial", I.rpart, "partly reproduced"], [r.repro_failed, "no", I.rno, "didn't reproduce"]]
    .filter(([n]) => n > 0)
    .map(([n, k, ic, label]) => `<span class="rres ${k}" title="${n} ${label}">${ic}${long ? ` ${n} ${label}` : n}</span>`);
  return parts.length ? `<span class="rtally">${parts.join("")}</span>` : "";
}
const isTrusted = (h) => !!(store.trusted && store.trusted.has(h));
const userHref = (h) => `/u/${encodeURIComponent(h)}`;
const whoHtml = (h) => `<a class="who${isTrusted(h) ? " trusted" : ""}" href="${userHref(h)}"${isTrusted(h) ? ' title="trusted publisher"' : ""}>@${esc(h)}</a>`;

function cardHtml(r, on) {
  return `<article class="card" data-open="${esc(r.id)}">
    ${edgeMark(r.neurons, r.model)}
    <h3 class="name"><a class="cardlink" href="/r/${esc(r.id)}">${r.draft ? `<span class="draftbadge">draft</span>` : ""}${esc(r.name)}</a></h3>
    <div class="rid">${recipeHtml(r.neurons, 8)}</div>
    <div class="desc">${esc(r.description)}</div>
    <div class="tags">${r.tags.slice(0, 5).map((t) => `<span class="tag ${on.includes(t) ? "on" : ""}">${esc(t)}</span>`).join("")}</div>
    <div class="foot">${votesHtml(r)}${[r.reproductions, r.repro_partial, r.repro_failed].every((n) => n > 0) ? "" /* all three tallies showing: the comment count makes room */ : `<span class="cmt">${I.bubble}${r.comments}</span>`}${reproHtml(r)}${whoHtml(r.author.handle)}</div>
  </article>`;
}

async function doVote(id, v) {
  const r = RECIPES.find((x) => x.id === id);
  if (!r) return;
  if (!signedIn()) return signInPrompt("vote");
  if (!store.user().verified) return verifyPrompt("vote");
  const next = r.myVote === v ? 0 : v;
  const prev = r.myVote;
  r.score += next - prev;
  r.myVote = next;
  paintVotes(r);
  try {
    await store.vote(id, next);
  } catch (e) {
    r.score -= next - prev;
    r.myVote = prev;
    paintVotes(r);
    flashError(e);
  }
}

function paintVotes(r) {
  for (const el of $$(`[data-vote="${CSS.escape(r.id)}"]`)) {
    el.classList.remove("v1", "v-1", "v0");
    el.classList.add("v" + r.myVote);
    $(".n", el).textContent = r.score;
  }
}

document.addEventListener("click", (e) => {
  const brand = e.target.closest("a.brand");
  if (brand) { qInput.value = ""; qState.tags = []; }
  const same = e.target.closest('a[href^="/"]');
  if (same && !e.metaKey && !e.ctrlKey && !e.shiftKey && same.getAttribute("href") === here() && !same.closest("[data-open]")) {
    // a link to where we already are: re-route anyway, so it leaves views without a URL (API & agents, editor, moderation)
    e.preventDefault();
    if (overlay.innerHTML) closeModal(true);
    if (history.state && history.state.editor) history.replaceState(null, "", location.href);
    editorOpen = false; listShown = false;
    route();
    return;
  }
  const sb = e.target.closest("[data-submit]");
  if (sb) {
    e.preventDefault();
    if (overlay.innerHTML) closeModal(true);
    if (store.mode === "supabase" && !signedIn()) { // sign in first; the form opens once you're in
      sessionStorage.setItem("nr.reopenSubmit", "1"); // survives the Twitter round trip
      e.stopPropagation();
      return signInPrompt("submit a recipe", () => { sessionStorage.removeItem("nr.reopenSubmit"); openEditor(); });
    }
    openEditor();
    return;
  }
  const vb = e.target.closest("[data-vote] button[data-v]");
  if (vb) {
    e.preventDefault();
    e.stopPropagation();
    doVote(vb.closest("[data-vote]").dataset.vote, +vb.dataset.v);
    return;
  }
  const op = !e.target.closest("a:not(.cardlink):not(.rowlink)") && e.target.closest("[data-open]"); // other links in a card (the author) go where they point
  if (op && listShown && !e.metaKey && !e.ctrlKey && !e.shiftKey && e.button === 0) {
    e.preventDefault();
    modalPushed = true;
    go("/r/" + op.dataset.open);
    return;
  }
  const cp = e.target.closest("button[data-copy]");
  if (cp) {
    e.preventDefault();
    copyText(cp.dataset.copy).then((ok) => ok && flashCopied(cp));
    return;
  }
  // links to app pages (/about, /r/x, /u/x, /?q=...) navigate in place; files (/llms.txt, /privacy.html) load normally
  const a = e.target.closest("a[href]");
  const href = a && a.getAttribute("href");
  if (href && !e.defaultPrevented && /^\/(?!\/)/.test(href) && !/\.[a-z0-9]+(\?|$)/i.test(href.split("#")[0])
      && !a.target && !a.hasAttribute("download") && e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey) {
    e.preventDefault();
    closePops();
    go(href);
  }
});

// copy icon -> green check for a moment
function flashCopied(btn) {
  btn.classList.add("done");
  btn.innerHTML = I.check;
  clearTimeout(btn._t);
  btn._t = setTimeout(() => { btn.classList.remove("done"); btn.innerHTML = I.copy; }, 1200);
}
const copyBtn = (text, label) => `<button class="cbtn" data-copy="${esc(text)}" aria-label="${esc(label)}" title="${esc(label)}">${I.copy}</button>`;

// Turns database errors into something a person can act on.
function errText(e) {
  const m = String((e && e.message) || e);
  const rl = m.match(/rate limit: (\d+) recipes a day(?:; next one at (\S+))?/);
  if (rl) {
    let when = "";
    if (rl[2]) {
      const t = new Date(rl[2]);
      const time = t.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }).toLowerCase();
      when = t.toDateString() === new Date().toDateString() ? ` Try again at ${time}.`
        : ` Try again ${t.toLocaleDateString([], { weekday: "short" })} at ${time}.`;
    }
    return `Daily limit reached (${rl[1]} recipes a day).${when} Your draft is saved.`;
  }
  const cl = m.match(/rate limit: (\d+) comments an hour/);
  if (cl) return `Comment limit reached (${cl[1]} an hour). Try again in a bit.`;
  return m;
}

// Hover tooltip for [data-tip] (the early/late-layer warnings). One floating element, so cards can't clip it.
// On touch, tapping the icon shows it instead of opening the card.
const tipEl = document.createElement("div");
tipEl.className = "tip"; tipEl.hidden = true; tipEl.setAttribute("role", "tooltip");
document.body.appendChild(tipEl);
function showTip(t) {
  tipEl.textContent = t.dataset.tip; tipEl.hidden = false;
  const r = t.getBoundingClientRect(), w = tipEl.offsetWidth, h = tipEl.offsetHeight;
  const x = Math.min(Math.max(8, r.left + r.width / 2 - w / 2), innerWidth - w - 8);
  const y = r.top - h - 6 >= 8 ? r.top - h - 6 : r.bottom + 6;
  tipEl.style.left = x + "px"; tipEl.style.top = y + "px";
}
const hideTip = () => { tipEl.hidden = true; };
document.addEventListener("mouseover", (e) => { const t = e.target.closest?.("[data-tip]"); if (t) showTip(t); else hideTip(); });
document.addEventListener("click", (e) => {
  const t = e.target.closest?.("[data-tip]");
  if (t) { e.preventDefault(); e.stopPropagation(); showTip(t); } else hideTip();
}, true);
addEventListener("scroll", hideTip, { passive: true });

function flashError(e) {
  console.error(e);
  const m = document.createElement("div");
  m.className = "err";
  m.setAttribute("role", "alert");
  m.style.cssText = "position:fixed;bottom:16px;left:50%;transform:translateX(-50%);background:var(--bg);padding:8px 14px;border-radius:4px;box-shadow:var(--shadow);z-index:60";
  m.textContent = errText(e);
  document.body.appendChild(m);
  setTimeout(() => m.remove(), 6000);
}

// ------------------------------------------------------------------ search box
const qInput = $("#q");
const qTags = $("#qtags");
const suggest = $("#suggest");
let qState = { tags: [] };
let sugIdx = 0;
let sugNav = false; // true once the user arrows into the suggestions; Enter then picks one

function syncSearchBox(r) {
  const p = r.view === "browse" ? r.p : new URLSearchParams();
  qState.tags = (p.get("tags") || "").split(",").filter(Boolean);
  if (document.activeElement !== qInput) qInput.value = p.get("q") || "";
  qTags.innerHTML = qState.tags.map((t) => `<span class="chip">${esc(t)}<button data-untag="${esc(t)}" aria-label="remove ${esc(t)}">×</button></span>`).join("");
  qInput.placeholder = qState.tags.length ? "" : "search names, tags, L14N8949";
}

function currentBrowseParams() {
  const r = parseRoute();
  return r.view === "browse" ? Object.fromEntries(r.p.entries()) : {};
}

function searchTo(q, tags) {
  const p = currentBrowseParams();
  p.q = q;
  p.tags = tags;
  go(browseHref(p));
}

qTags.addEventListener("click", (e) => {
  const b = e.target.closest("[data-untag]");
  if (!b) return;
  searchTo(qInput.value, qState.tags.filter((t) => t !== b.dataset.untag));
});

// what the public sees: aggregates (tag counts, "in N others", combinations) never count hidden recipes or drafts
const visible = () => RECIPES.filter((r) => !r.hidden && !r.draft);
function tagCounts(rs = visible()) {
  const c = {};
  for (const r of rs) for (const t of r.tags) c[t] = (c[t] || 0) + 1;
  return c;
}

function suggestions(text) {
  const s = text.trim().toLowerCase();
  if (!s) return [];
  const out = [];
  const nq = parseNeuronQuery(s);
  if (nq) {
    const k = neuronKey(nq);
    const n = RECIPES.filter((r) => r.neurons.some((x) => neuronKey(x) === k)).length;
    out.push({ kind: "neuron", label: k, n, act: () => searchTo(k, qState.tags) });
  }
  const tc = tagCounts();
  Object.keys(tc).filter((t) => t.includes(s.replace(/^#/, "")) && !qState.tags.includes(t))
    .sort((a, b) => (b.startsWith(s) - a.startsWith(s)) || tc[b] - tc[a]).slice(0, 5)
    .forEach((t) => out.push({ kind: "tag", label: t, n: tc[t], act: () => { qInput.value = ""; searchTo("", [...qState.tags, t]); } }));
  RECIPES.filter((r) => r.name.toLowerCase().includes(s)).slice(0, 5)
    .forEach((r) => out.push({ kind: "recipe", label: r.name, act: () => { modalPushed = listShown; go("/r/" + r.id); } }));
  const models = [...new Set(RECIPES.map((r) => r.model))].filter((m) => m.toLowerCase().includes(s)).slice(0, 2);
  models.forEach((m) => out.push({ kind: "model", label: m, act: () => { const p = currentBrowseParams(); p.model = m; p.q = ""; qInput.value = ""; go(browseHref(p)); } }));
  return out;
}

function renderSuggest() {
  const items = suggestions(qInput.value);
  suggest.hidden = !items.length;
  sugIdx = Math.min(sugIdx, items.length - 1);
  qInput.setAttribute("aria-expanded", String(!!items.length));
  if (sugNav && items[sugIdx]) qInput.setAttribute("aria-activedescendant", "sug-" + sugIdx); else qInput.removeAttribute("aria-activedescendant");
  suggest.innerHTML = items.map((it, i) => `<div class="row ${sugNav && i === sugIdx ? "on" : ""}" data-i="${i}" id="sug-${i}" role="option" aria-selected="${sugNav && i === sugIdx}">
    <span class="kind">${it.kind}</span>
    <span>${it.kind === "tag" ? `<span class="tag ${sugNav && i === sugIdx ? "on" : ""}">${esc(it.label)}</span>` : it.kind === "neuron" || it.kind === "model" ? `<span class="mono">${esc(it.label)}</span>` : esc(it.label)}</span>
    <span class="n">${it.n ?? ""}</span></div>`).join("");
  suggest._items = items;
}

let liveT = null;
qInput.addEventListener("input", () => {
  sugIdx = 0; sugNav = false; renderSuggest();
  // results update as you type when the list is showing (no history entry per keystroke)
  clearTimeout(liveT);
  liveT = setTimeout(() => {
    const r = parseRoute();
    if (r.view !== "browse" || overlay.innerHTML || editorOpen) return;
    const p = currentBrowseParams();
    p.q = qInput.value.trim(); p.tags = qState.tags;
    const h = browseHref(p);
    if (h === here()) return;
    history.replaceState(null, "", h);
    lastListHash = h;
    renderBrowse(new URLSearchParams(Object.entries(Object.fromEntries(Object.entries(p).filter(([, v]) => v && v.length)))));
  }, 220);
});
qInput.addEventListener("focus", renderSuggest);
qInput.addEventListener("blur", () => setTimeout(() => (suggest.hidden = true), 150));
qInput.addEventListener("keydown", (e) => {
  const items = suggest._items || [];
  if (e.key === "ArrowDown" && items.length) { sugIdx = sugNav ? (sugIdx + 1) % items.length : 0; sugNav = true; renderSuggest(); e.preventDefault(); }
  else if (e.key === "ArrowUp" && items.length) { sugIdx = (sugIdx - 1 + items.length) % items.length; sugNav = true; renderSuggest(); e.preventDefault(); }
  else if (e.key === "Enter") {
    e.preventDefault();
    const it = !suggest.hidden && sugNav && items[sugIdx];
    suggest.hidden = true;
    if (it) it.act();
    else searchTo(qInput.value.trim(), qState.tags);
  } else if (e.key === "Backspace" && !qInput.value && qState.tags.length) {
    searchTo("", qState.tags.slice(0, -1));
  } else if (e.key === "Escape") { suggest.hidden = true; qInput.blur(); }
});
suggest.addEventListener("mousedown", (e) => {
  const row = e.target.closest(".row");
  if (!row) return;
  e.preventDefault();
  suggest.hidden = true;
  suggest._items[+row.dataset.i].act();
});

// ------------------------------------------------------------------ filtering
// rollouts: also search the example prompts and outputs (the "outputs" toggle, ?ex=1)
function matchesQuery(r, q, rollouts = false) {
  if (!q) return true;
  const ns = parseRecipeStr(q);
  if (ns.length) {
    const keys = new Set(r.neurons.map(neuronKey));
    if (!ns.every((n) => keys.has(neuronKey(n)))) return false;
    q = q.replace(/L\s*\d+\s*(?:E\s*\d+\s*)?N\s*\d+\s*(?:[+-]\s*\d*\.?\d+)?/gi, " ");
  }
  const { hay, words } = hayOf(r, rollouts);
  return q.toLowerCase().split(/\s+/).filter(Boolean).every((w) => {
    w = w.replace(/^[#@]/, "");
    if (hay.includes(w)) return true;
    // typo tolerance: one edit for words of 4+ letters, two for 8+
    const k = w.length >= 8 ? 2 : w.length >= 4 ? 1 : 0;
    return k > 0 && words.some((x) => Math.abs(x.length - w.length) <= k && editDist(x, w, k) <= k);
  });
}

// searchable text per recipe (name, description, tags, author, model, neurons; plus example prompts and outputs when
// rollouts are on), cached
const hayCache = [new WeakMap(), new WeakMap()];
function hayOf(r, rollouts) {
  const cache = hayCache[rollouts ? 1 : 0];
  let h = cache.get(r);
  if (!h) {
    const hay = [r.name, r.description, r.tags.join(" "), r.author.handle, r.model, recipeStr(r.neurons), (r.aliases || []).join(" "), rollouts ? r.search_text || "" : ""].join(" ").toLowerCase();
    h = { hay, words: [...new Set(hay.split(/[^a-z0-9]+/).filter((x) => x.length >= 3))] };
    cache.set(r, h);
  }
  return h;
}
// Levenshtein distance, giving up early past max
function editDist(a, b, max) {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      best = Math.min(best, cur[j]);
    }
    if (best > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
}

function filterRecipes(p) {
  const tags = (p.tags || "").split(",").filter(Boolean);
  const models = (p.model || "").split(",").filter(Boolean);
  const authors = (p.author || "").split(",").filter(Boolean);
  const [lo, hi] = (p.layers || "").split("-").map((x) => (x === "" || x == null ? null : +x));
  return RECIPES.filter((r) => {
    if (!matchesQuery(r, p.q, p.ex === "1")) return false;
    if (tags.length && !tags.every((t) => r.tags.includes(t))) return false;
    if (models.length && !models.includes(r.model)) return false;
    if (authors.length && !authors.includes(r.author.handle)) return false;
    const n = r.neurons.length;
    if (p.n === "1" && n !== 1) return false;
    if (p.n === "2" && n !== 2) return false;
    if (p.n === "3" && n < 3) return false;
    if (p.sign === "up" && !r.neurons.every((x) => x.dose > 0)) return false;
    if (p.sign === "down" && !r.neurons.every((x) => x.dose < 0)) return false;
    if (p.sign === "mixed" && !(r.neurons.some((x) => x.dose > 0) && r.neurons.some((x) => x.dose < 0))) return false;
    if (lo != null || hi != null) {
      if (!r.neurons.some((x) => (lo == null || x.layer >= lo) && (hi == null || x.layer <= hi))) return false;
    }
    return true;
  });
}

const ageH = (r) => Math.max(0, (Date.now() - (Date.parse(r.date) || Date.now())) / 3.6e6);
function sortRecipes(rs, sort) {
  const a = [...rs];
  if (sort === "top") a.sort((x, y) => y.score - x.score || (y.date > x.date ? 1 : -1));
  else if (sort === "layer") {
    // shallowest neuron first, then the next one, so recipes sharing early layers sit together
    const ks = new Map(a.map((r) => [r, sortNeurons(r.neurons).map((n) => [n.layer, n.expert ?? -1, n.neuron])]));
    a.sort((x, y) => {
      const p = ks.get(x), q = ks.get(y);
      for (let i = 0; i < Math.min(p.length, q.length); i++)
        for (let j = 0; j < 3; j++) if (p[i][j] !== q[i][j]) return p[i][j] - q[i][j];
      return p.length - q.length || y.score - x.score;
    });
  }
  else if (sort === "new") a.sort((x, y) => (y.date > x.date ? 1 : y.date < x.date ? -1 : y.score - x.score));
  else a.sort((x, y) => (y.score + 1) / Math.pow(ageH(y) + 2, 1.5) - (x.score + 1) / Math.pow(ageH(x) + 2, 1.5));
  return a;
}

// ------------------------------------------------------------------ home
// ------------------------------------------------------------------ moderation (admins; opened from the menu, no URL)
async function renderMod() {
  if (overlay.innerHTML) closeModal(true);
  editorOpen = true; // any navigation leaves this view
  document.body.className = "page";
  main.innerHTML = `<div class="pagewrap"><div class="dim">…</div></div>`;
  let q;
  let aliases = [];
  try { [q, aliases] = await Promise.all([store.modQueue(), store.tagAliases()]); } catch (e) { main.innerHTML = `<div class="pagewrap err">${esc(e.message)}</div>`; return; }
  const target = (kind, id) => {
    if (kind === "comment") {
      const c = q.comments[String(id)];
      if (!c) return `<span class="faint">comment ${esc(id)} (deleted)</span>`;
      return `<div class="mtext">${esc(c.body)}</div><div class="mmeta">@${esc(c.author_handle)} on <a href="/r/${esc(c.recipe_id)}">${esc(c.recipe_id)}</a>
        <button class="btn sbtn" data-mhide="comment:${c.id}:${c.hidden ? 0 : 1}">${c.hidden ? I.eyeoff + "<span>Unhide</span>" : I.eyeoff + "<span>Hide</span>"}</button>${c.hidden ? ` <span class="err">hidden</span>` : ""}</div>`;
    }
    if (kind === "profile") {
      const x = q.profiles[String(id)];
      if (!x) return `<span class="faint">account ${esc(id)} (deleted)</span>`;
      return `<div class="mtext">username <b>@${esc(x.handle)}</b>${x.name_status ? ` <span class="faint">(${esc(x.name_status === "renamed" ? "renamed by moderation" : "flagged; the owner can see it and pick another")})</span>` : ""}</div>
        <div class="mmeta"><a href="/u/${encodeURIComponent(x.handle)}">profile</a>
        <button class="btn sbtn" data-mname="${esc(x.id)}:rename">Rename to user_xxxxxx</button></div>`;
    }
    if (kind === "reproduction") {
      const x = q.reproductions[String(id)];
      if (!x) return `<span class="faint">reproduction ${esc(id)} (deleted)</span>`;
      return `<div class="mtext">${esc(x.output)}</div><div class="mmeta">reproduction by @${esc(x.author_handle)} on <a href="/r/${esc(x.recipe_id)}">${esc(x.recipe_id)}</a>
        <button class="btn sbtn" data-mhide="reproduction:${x.id}:${x.hidden ? 0 : 1}">${I.eyeoff}<span>${x.hidden ? "Unhide" : "Hide"}</span></button>${x.hidden ? ` <span class="err">hidden</span>` : ""}</div>`;
    }
    const r = q.recipes[id];
    if (!r) return `<span class="faint">recipe ${esc(id)} (deleted)</span>`;
    return `<div class="mtext"><a href="/r/${esc(r.id)}">${esc(r.name)}</a>: ${esc(r.description)}</div><div class="mmeta">@${esc(r.author_handle)}
      <button class="btn sbtn" data-mhide="recipe:${r.id}:${r.hidden ? 0 : 1}">${I.eyeoff}<span>${r.hidden ? "Unhide" : "Hide"}</span></button>${r.hidden ? ` <span class="err">hidden</span>` : ""}</div>`;
  };
  const pending = q.log.filter((l) => l.verdict === "review" && !l.resolved_at);
  const review = pending.map((l) => `<li><div class="mhead"><span class="tag warn">review</span> ${esc(l.reason || "")}
      <span class="faint mono">${esc((l.model || "").split("/").pop())} · ${esc(ago(l.created_at))}</span>
      <button class="btn sbtn" data-mapprove="${l.id}:${l.kind}:${esc(l.target_id)}">${I.check}<span>Approve</span></button>
      <button class="btn sbtn quiet" data-mkeep="${l.id}">Keep hidden</button></div>${target(l.kind, l.target_id)}</li>`).join("");
  const reports = q.reports.map((rp) => `<li><div class="mhead"><span class="tag">report</span> ${esc(rp.reason)} <span class="faint">${esc(ago(rp.created_at))}</span>
      <button class="btn sbtn quiet" data-mclear="${rp.id}">dismiss</button></div>${rp.comment_id ? target("comment", rp.comment_id) : rp.reproduction_id ? target("reproduction", rp.reproduction_id) : target("recipe", rp.recipe_id)}</li>`).join("");
  const log = q.log.map((l) => `<li><div class="mhead"><span class="tag ${l.verdict === "remove" ? "danger" : ""}">${l.verdict === "remove" ? "removed" : "allowed"}</span>
      ${esc(l.reason || l.error || "")} <span class="faint mono">${esc((l.model || "").split("/").pop())} · ${esc(ago(l.created_at))}</span></div>${target(l.kind, l.target_id)}</li>`).join("");
  main.innerHTML = `<div class="pagewrap mod">
    <h1>Moderation</h1>
    <h2>Waiting for review <span class="faint mono">${pending.length}</span></h2>
    ${review ? `<ul class="mlist">${review}</ul>` : `<div class="faint">—</div>`}
    <h2>Reports <span class="faint mono">${q.reports.length}</span></h2>
    ${reports ? `<ul class="mlist">${reports}</ul>` : `<div class="faint">—</div>`}
    <h2>Tags</h2>
    <p class="dim">Merging folds a tag into another on every recipe and remembers it, so future posts with the old tag get the new one.</p>
    <form class="tagmerge" data-tagmerge><input data-tfrom placeholder="from, e.g. mashup" list="alltags" spellcheck="false"> <span class="dim">into</span>
      <input data-tto placeholder="into, e.g. combination" list="alltags" spellcheck="false"> <button class="btn sbtn" type="submit">Merge</button>
      <datalist id="alltags">${Object.keys(tagCounts()).sort().map((t) => `<option value="${esc(t)}">`).join("")}</datalist></form>
    <div class="tagcloud">${Object.entries(tagCounts()).sort((a, b) => b[1] - a[1]).map(([t, n]) => `<span class="tag">${esc(t)} <span class="faint">${n}</span></span>`).join(" ")}</div>
    ${aliases.length ? `<div class="dim small" style="margin-top:10px">merged: ${aliases.map((a) => `${esc(a.alias)} → ${esc(a.tag)}`).join(" · ")}</div>` : ""}
    <h2>jev's decisions <span class="faint mono">${q.log.length}</span></h2>
    ${log ? `<ul class="mlist">${log}</ul>` : `<div class="faint">—</div>`}
  </div>`;
  $("[data-tagmerge]", main).onsubmit = async (e) => {
    e.preventDefault();
    const src = $("[data-tfrom]", main).value.trim(), dst = $("[data-tto]", main).value.trim();
    if (!src || !dst) return;
    if (!confirm(`Merge “${src}” into “${dst}” on every recipe?`)) return;
    try { const n = await store.mergeTag(src, dst); RECIPES = await store.list(); flashOk(`Merged: ${n} recipe${n === 1 ? "" : "s"} updated.`); renderMod(); } catch (err) { flashError(err); }
  };
  $$("[data-mhide]", main).forEach((b) => (b.onclick = async () => {
    const [kind, id, h] = b.dataset.mhide.split(":");
    try {
      if (kind === "comment") await store.hideComment(+id, h === "1");
      else if (kind === "reproduction") await store.hideReproduction(+id, h === "1");
      else await store.setHidden(id, h === "1");
      RECIPES = await store.list();
      renderMod();
    } catch (e) { flashError(e); }
  }));
  $$("[data-mapprove]", main).forEach((b) => (b.onclick = async () => {
    const [logId, kind, id] = b.dataset.mapprove.split(":");
    try {
      if (kind === "profile") { await store.resolveName(id, "approve"); RECIPES = await store.list(); return renderMod(); }
      if (kind === "comment") await store.hideComment(+id, false);
      else if (kind === "reproduction") await store.hideReproduction(+id, false);
      else await store.setHidden(id, false);
      await store.resolveReview(+logId);
      RECIPES = await store.list();
      renderMod();
    } catch (e) { flashError(e); }
  }));
  $$("[data-mname]", main).forEach((b) => (b.onclick = async () => {
    const [uid, action] = b.dataset.mname.split(":");
    if (!confirm("Rename this account to user_xxxxxx? They'll be asked to pick a new name.")) return;
    try { const h = await store.resolveName(uid, action); flashOk(`Renamed to @${h}.`); RECIPES = await store.list(); renderMod(); } catch (e) { flashError(e); }
  }));
  $$("[data-mkeep]", main).forEach((b) => (b.onclick = async () => {
    try { await store.resolveReview(+b.dataset.mkeep); renderMod(); } catch (e) { flashError(e); }
  }));
  $$("[data-mclear]", main).forEach((b) => (b.onclick = async () => {
    try { await store.clearReport(+b.dataset.mclear); renderMod(); } catch (e) { flashError(e); }
  }));
}

// ------------------------------------------------------------------ API & agents (opened from the menu, no URL)
async function renderAgents(fresh = null) {
  if (overlay.innerHTML) closeModal(true);
  document.body.className = "page";
  const u = store.user();
  const base = store.apiBase();
  const mcpUrl = base + "/mcp";
  const tok = fresh || "nry_YOUR_TOKEN";
  let tokens = [];
  try { tokens = await store.listTokens(); } catch (e) { flashError(e); }
  const block = (title, text) => `<div class="cblock"><div class="cbhead"><span>${esc(title)}</span>${copyBtn(text, "copy")}</div><pre>${esc(text)}</pre></div>`;
  const claudeCode = `claude mcp add --transport http neuronary ${mcpUrl} --header "Authorization: Bearer ${tok}"`;
  const desktop = JSON.stringify({ mcpServers: { neuronary: { command: "npx", args: ["-y", "mcp-remote", mcpUrl, "--header", `Authorization:Bearer ${tok}`] } } }, null, 2);
  const curl = `# search (no token needed)\ncurl "${base}/recipes?q=evil"\n\n# publish\ncurl -X POST "${base}/recipes" \\\n  -H "Authorization: Bearer ${tok}" -H "Content-Type: application/json" \\\n  -d '{"name": "...", "description": "...", "model": "Qwen/Qwen3.5-4B", "recipe": "L13N7956-1.0 L14N8949+1.0",\n       "tags": ["persona"], "examples": [{"prompt": "...", "output": "..."}]}'`;
  const py = `# no dependencies (standard library only): download clients/neuronary.py from the neuronary repo\nfrom neuronary import Neuronary\nnr = Neuronary(token="${tok}")\nnr.search("evil")\nnr.publish(name="...", description="...", model="Qwen/Qwen3.5-4B",\n           recipe="L13N7956-1.0 L14N8949+1.0", tags=["persona"],\n           examples=[{"prompt": "...", "output": "..."}])`;
  const shellLine = `mkdir -p ~/.neuronary && printf '%s' '${tok}' > ~/.neuronary/token && chmod 600 ~/.neuronary/token`;
  const agentLine = `Set up neuronary for me: read https://neuronary.org/agents.md`;
  const anon = u && u.anonymous;
  main.innerHTML = `<div class="pagewrap about agents">
    <h1>API & agents</h1>
    <p class="lead">Let Claude, the neuron explorer, or your own scripts search, download and publish recipes as you.
      Everything they post goes through the same checks and moderation as the site.</p>
    ${block("easiest: paste this to your agent; it walks you through the rest", agentLine)}

    <h2>Tokens</h2>
    ${anon ? `<p class="hidbanner">Tokens need a verified account. Sign in with Twitter, or link it from the account menu; your name and posts carry over.</p>` : `
    ${fresh ? `<div class="newtok"><div class="lab">your new token (shown once)</div><div class="idrow"><code class="mono">${esc(fresh)}</code>${copyBtn(fresh, "copy token")}</div></div>` : ""}
    <div class="tokform"><input data-tokname placeholder="name, e.g. claude code" maxlength="60"><button class="btn primary" data-tokmake>Create token</button></div>
    <ul class="toklist">${tokens.map((t) => `<li><b>${esc(t.name)}</b> <span class="mono dim">${esc(t.prefix)}…</span>
      <span class="faint">created ${esc(ago(t.created_at))}${t.last_used_at ? ` · used ${esc(ago(t.last_used_at))}` : " · never used"}</span>
      <button class="btn sbtn danger" data-tokrevoke="${t.id}">${I.trash}<span>Revoke</span></button></li>`).join("") || `<li class="faint">no tokens yet</li>`}</ul>`}

    <h2>Claude Code</h2>
    ${block("terminal", claudeCode)}
    <h2>Claude Desktop</h2>
    <p>Add this to <code>claude_desktop_config.json</code> (Settings → Developer → Edit config), then restart Claude.</p>
    ${block("claude_desktop_config.json", desktop)}
    <h2>Skill</h2>
    <p>The <a href="skill/neuronary/SKILL.md" target="_blank" rel="noopener">neuronary skill</a> teaches Claude the recipe format,
      dose units and the tools. Drop the <code>neuronary</code> folder into your skills directory (<code>~/.claude/skills/</code>).</p>
    <h2>Neuron explorer</h2>
    <p>The explorer's agent has neuronary tools (search, download, publish) once
      <a href="https://github.com/lyramakesmusic/neuron-explorer" target="_blank" rel="noopener">neuron-explorer</a> is up to date.
      Give it a token one of two ways; it reads the file on every call, so no restart needed:</p>
    ${block("terminal", shellLine)}
    <h2>Python</h2>
    ${block("python", py)}
    <h2>Bulk upload</h2>
    <p>There's no batch endpoint: publish one recipe per request (the API, the MCP tool, or the Python client's
      <code>publish_many</code>, which checks every recipe first and stops cleanly at your daily limit). Pass
      <code>"draft": true</code> to stage a batch privately, look it over on the site, then publish each with
      <code>PATCH /recipes/:id {"draft": false}</code>. Limits are generous backstops (1000 recipes a day with a Twitter-verified account), so imports of a few hundred just work. Without
      code, the submit page's <b>Import JSON</b> takes an array of recipes, checks them, and publishes or drafts them all.</p>
    ${block("python: bulk", `import json\nfrom neuronary import Neuronary\nnr = Neuronary(token="${tok}")\nrecipes = json.load(open("my_recipes.json"))  # a list of recipe objects\nprint(nr.publish_many(recipes, dry_run=True))   # check first\nfor r in nr.publish_many(recipes, draft=True):  # then upload as drafts\n    print(r)`)}
    <h2>HTTP</h2>
    ${block("curl", curl)}
    <p class="dim">Endpoints: <code>GET /recipes</code> (q, tag, model, neuron, author, sort, limit) · <code>GET /recipes/:id</code> ·
      <code>POST /recipes</code> · <code>PATCH /recipes/:id</code> · <code>POST /recipes/:id/comments</code> · <code>POST /recipes/:id/vote</code> · <code>GET /me</code></p>
  </div>`;
  const mk = $("[data-tokmake]", main);
  if (mk) mk.onclick = async () => {
    const name = $("[data-tokname]", main).value.trim() || "agent";
    mk.disabled = true;
    try { renderAgents(await store.createToken(name)); } catch (e) { flashError(e); mk.disabled = false; }
  };
  $$("[data-tokrevoke]", main).forEach((b) => (b.onclick = async () => {
    if (!confirm("Revoke this token? Agents using it stop working.")) return;
    try { await store.revokeToken(+b.dataset.tokrevoke); renderAgents(); } catch (e) { flashError(e); }
  }));
}

// ------------------------------------------------------------------ neuron page
function renderNeuron(key) {
  const q = parseNeuronQuery(key);
  if (!q) { main.innerHTML = `<div class="empty">Not a neuron id.</div>`; return; }
  const k = neuronKey(q);
  const uses = sortRecipes(RECIPES.filter((r) => r.neurons.some((n) => neuronKey(n) === k)), "top");
  const doses = uses.map((r) => r.neurons.find((n) => neuronKey(n) === k).dose);
  const models = [...new Set(uses.map((r) => r.model))];
  const range = doses.length ? (Math.min(...doses) === Math.max(...doses) ? doseStr(doses[0]) : `${doseStr(Math.min(...doses))} … ${doseStr(Math.max(...doses))}`) : "";
  document.title = `${k} · neuronary`;
  main.innerHTML = `<div class="nhead">
      <div class="idrow"><h1 class="rid">${k}</h1>${copyBtn(k, "copy neuron")}</div>
      <div class="meta">${uses.length} recipe${uses.length === 1 ? "" : "s"}${range ? ` &nbsp;·&nbsp; doses <span class="mono">${range}</span>` : ""}${models.length ? ` &nbsp;·&nbsp; <span class="mono">${models.map(esc).join(", ")}</span>` : ""}</div>
    </div>
    ${uses.length ? `<div class="grid">${uses.map((r) => cardHtml(r, [])).join("")}</div>` : `<div class="empty">No recipes use ${k} yet.</div>`}`;
}

// ------------------------------------------------------------------ profile (/u/<handle>)
async function renderUser(handle, params) {
  const p = Object.fromEntries(params.entries());
  const sort = ["hot", "top", "new"].includes(p.sort) ? p.sort : "top";
  const lc = handle.toLowerCase();
  const u = store.user();
  const mine = u && u.handle && u.handle.toLowerCase() === lc;
  const all = RECIPES.filter((r) => r.author.handle.toLowerCase() === lc && (mine || (!r.hidden && !r.draft)));
  const rs = sortRecipes(all, sort);
  const pub = all.filter((r) => !r.hidden && !r.draft);
  const shown = (all[0] && all[0].author.handle) || handle;
  document.title = `@${shown} · neuronary`;
  const draw = (prof, reported) => {
    const xh = prof && prof.x_handle;
    // recipes added on someone's behalf carry their X link on the recipe itself
    const xurl = xh ? `https://x.com/${xh}` : (all.find((r) => /^https:\/\/(x|twitter)\.com\/[A-Za-z0-9_]+\/?$/.test(r.author.url || "")) || {}).author?.url;
    const score = pub.reduce((a, r) => a + r.score, 0), repro = pub.reduce((a, r) => a + (r.reproductions || 0), 0);
    const stat = (n, label) => `<div class="ustat"><b>${n}</b><span>${label}</span></div>`;
    main.innerHTML = `<div class="uhead">
        ${avatarHtml(shown, prof && prof.avatar_url, "big")}
        <div class="uid">
          <h1>@${esc(shown)}${prof && prof.is_admin ? ` <span class="ubadge">admin</span>` : isTrusted(shown) ? ` <span class="ubadge" title="trusted publisher: higher daily limit">trusted</span>` : ""}</h1>
          <div class="ulinks">${xurl ? `<a class="btn sbtn" href="${esc(xurl)}" target="_blank" rel="noopener">${I.x}<span>@${esc(xurl.split("/").pop())} on X</span></a>` : ""}
            <a class="dim" href="${browseHref({ author: shown })}">filter the main list by @${esc(shown)}</a>
            ${!prof && !all.length ? `<span class="dim">no account or recipes under this name</span>` : ""}
            ${prof && prof.created_at ? `<span class="faint">joined ${esc(new Date(prof.created_at).toLocaleDateString([], { month: "short", year: "numeric" }))}</span>` : ""}</div>
        </div>
        <div class="ustats">${stat(pub.length, pub.length === 1 ? "recipe" : "recipes")}${stat(score, "total score")}${stat(repro, "reproduced by others")}${stat(reported, "reproductions reported")}</div>
      </div>
      <div class="toolbar"><span class="seg" id="usort">${["top", "hot", "new"].map((s) => `<button data-usort="${s}" class="${s === sort ? "on" : ""}">${s}</button>`).join("")}</span></div>
      ${rs.length ? `<div class="grid">${rs.map((r) => cardHtml(r, [])).join("")}</div>` : `<div class="empty">No recipes yet.</div>`}`;
    $$("[data-usort]").forEach((b) => (b.onclick = () => go(`${userHref(shown)}${b.dataset.usort === "top" ? "" : "?sort=" + b.dataset.usort}`)));
  };
  draw(null, 0);
  if (store.profile_) {
    try { const { profile, reproductionsReported } = await store.profile_(handle); if (parseRoute().view === "user") draw(profile, reproductionsReported); } catch (e) { console.error(e); }
  }
}

// ------------------------------------------------------------------ browse
let openDd = null;
let filtersOpen = false; // mobile: filter dropdowns collapsed behind the funnel icon

function ddHtml(key, label, value, body) {
  return `<div class="dd ${value ? "active" : ""}" data-dd="${key}"><button type="button">${esc(value ? `${label}: ${value}` : label)}${I.chev}</button>
    ${openDd === key ? `<div class="pop">${body}</div>` : ""}</div>`;
}

function checklist(key, items, selected, find) {
  return `${find ? `<input type="text" data-find="${key}" placeholder="find" autocomplete="off">` : ""}
    <div data-list="${key}">${items.map(([v, n, label]) => `<label data-v="${esc(v)}"><input type="checkbox" data-key="${key}" value="${esc(v)}" ${selected.includes(v) ? "checked" : ""}>
    <span class="${key === "model" ? "mono" : ""}">${esc(label || v)}</span><span class="n">${n}</span></label>`).join("") || `<div class="lab">none</div>`}</div>
    ${selected.length ? `<div class="foot"><a href="#" data-clear="${key}">clear</a></div>` : ""}`;
}

function radios(key, opts, cur) {
  return opts.map(([v, label]) => `<label><input type="radio" name="${key}" data-key="${key}" value="${v}" ${String(cur || "") === v ? "checked" : ""}> ${esc(label)}</label>`).join("");
}

function renderBrowse(params) {
  const p = Object.fromEntries(params.entries());
  const view = p.view === "list" ? "list" : "cards";
  const sort = ["hot", "top", "new", "layer"].includes(p.sort) ? p.sort : "hot";
  document.body.className = view === "list" ? "list-mode" : "";
  const rs = sortRecipes(filterRecipes(p), sort);
  const tags = (p.tags || "").split(",").filter(Boolean);

  // facet counts come from the recipes matching everything except that facet
  const without = (k) => filterRecipes({ ...p, [k]: "" });
  const count = (rs2, f) => { const c = {}; for (const r of rs2) for (const v of f(r)) c[v] = (c[v] || 0) + 1; return c; };
  const mc = count(without("model"), (r) => [r.model]);
  const tcs = count(without("tags").filter((r) => tags.every((t) => r.tags.includes(t))), (r) => r.tags);
  const ac = count(without("author"), (r) => [r.author.handle]);
  const sel = (k) => (p[k] || "").split(",").filter(Boolean);
  const nLabel = { 1: "1", 2: "2", 3: "3+" }[p.n];
  const signLabel = { up: "only +", down: "only −", mixed: "mixed" }[p.sign];
  const models = sel("model");
  const authors = sel("author");
  const [lo, hi] = (p.layers || "").split("-");

  const nActive = ["model", "tags", "n", "sign", "layers", "author"].filter((k) => p[k]).length;
  const bar = `<div class="toolbar ${filtersOpen ? "open" : ""}">
    <span class="seg" id="sort">${["hot", "top", "new", "layer"].map((s) => `<button data-sort="${s}" class="${s === sort ? "on" : ""}">${s}</button>`).join("")}</span>
    <button class="ficon dice" data-random aria-label="random recipe" title="random recipe">${I.dice}</button>
    <button class="ficon ${nActive ? "active" : ""}" data-ftoggle aria-label="filters" aria-expanded="${filtersOpen}">${I.filter}${nActive ? `<span class="badge">${nActive}</span>` : ""}</button>
    ${ddHtml("model", "model", models.length === 1 ? shortModel(models[0]) : models.length ? models.length : "",
      checklist("model", Object.entries(mc).sort((a, b) => b[1] - a[1]).map(([m, n]) => [m, n]), models, true))}
    ${ddHtml("tags", "tags", tags.length === 1 ? tags[0] : tags.length || "",
      checklist("tags", Object.entries(tcs).sort((a, b) => b[1] - a[1]).map(([t, n]) => [t, n]), tags, true))}
    ${ddHtml("n", "neurons", nLabel, radios("n", [["", "any"], ["1", "1"], ["2", "2"], ["3", "3 or more"]], p.n))}
    ${ddHtml("sign", "sign", signLabel, radios("sign", [["", "any"], ["up", "only +"], ["down", "only −"], ["mixed", "mixed"]], p.sign))}
    ${ddHtml("layers", "layers", p.layers ? `${lo || 0}–${hi || "∞"}` : "",
      `<div class="lab">any neuron in layers</div><div class="range"><input type="text" inputmode="numeric" data-lo value="${esc(lo || "")}" placeholder="0">
       <span class="dim">to</span><input type="text" inputmode="numeric" data-hi value="${esc(hi || "")}" placeholder="∞"></div>
       <div class="foot"><a href="#" data-clear="layers">clear</a><a href="#" data-apply-layers>apply</a></div>`)}
    ${ddHtml("author", "author", authors.length === 1 ? "@" + authors[0] : authors.length || "",
      checklist("author", Object.entries(ac).sort((a, b) => b[1] - a[1]).map(([a, n]) => [a, n, "@" + a]), authors, true))}
    <button class="extoggle ${p.ex === "1" ? "on" : ""}" data-extoggle aria-pressed="${p.ex === "1"}" title="also search example prompts and outputs">search outputs</button>
    <span class="count">${rs.length} ${rs.length === 1 ? "recipe" : "recipes"}</span>
    <span class="seg viewtoggle">${[["cards", I.grid], ["list", I.rows]].map(([v, ic]) => `<button data-view="${v}" class="${v === view ? "on" : ""}" aria-label="${v}">${ic}</button>`).join("")}</span>
  </div>`;

  let body;
  if (!rs.length) {
    const tips = [];
    if (p.q) {
      // closest recipe names and tags to what was typed
      const q = p.q.toLowerCase();
      const cands = [...RECIPES.filter((r) => !r.draft).map((r) => ({ label: r.name, href: `/r/${r.id}` })),
        ...Object.keys(tagCounts()).map((t) => ({ label: t, href: browseHref({ tags: [t] }) }))]
        .map((c) => ({ ...c, d: editDist(c.label.toLowerCase(), q, 6) })).filter((c) => c.d <= Math.max(2, Math.floor(q.length / 3)))
        .sort((a, b) => a.d - b.d).slice(0, 4);
      if (cands.length) tips.push(`Did you mean ${cands.map((c) => `<a href="${c.href}">${esc(c.label)}</a>`).join(", ")}?`);
    }
    const nf = ["tags", "model", "n", "sign", "layers", "author"].filter((k) => p[k]).length;
    if (nf) tips.push(`${nf} filter${nf > 1 ? "s are" : " is"} on. <a href="${browseHref({ q: p.q })}">Clear filters</a>`);
    if (p.q && p.ex !== "1") tips.push(`Search covers names, descriptions, tags, authors and neuron ids like L14N8949. <a href="${browseHref({ ...p, ex: "1" })}">Also search outputs</a>`);
    else if (p.q) tips.push(`Searched names, descriptions, tags, authors, neuron ids, and example prompts and outputs.`);
    body = `<div class="empty">No recipes match.${tips.map((t) => `<p class="dim">${t}</p>`).join("")}</div>`;
  }
  else if (view === "cards") {
    // featured row: only on the plain home view (hot, no search or filters)
    const plain = sort === "hot" && !p.q && !["model", "tags", "n", "sign", "layers", "author"].some((k) => p[k]);
    const feat = plain ? rs.filter((r) => r.featured) : [];
    const rest = feat.length ? rs.filter((r) => !r.featured) : rs;
    body = (feat.length ? `<div class="sechead feathead"><h2>Featured</h2></div><div class="grid featured">${feat.map((r) => cardHtml(r, tags)).join("")}</div>
      <div class="sechead feathead"><h2>Everything</h2></div>` : "") + `<div class="grid">${rest.map((r) => cardHtml(r, tags)).join("")}</div>`;
  }
  else body = `<div class="list"><table><thead><tr><th></th><th>name</th><th>neurons</th><th class="hide-s">tags</th><th class="hide-s">model</th><th></th></tr></thead><tbody>
    ${rs.map((r) => `<tr class="row" data-open="${esc(r.id)}" data-href="/r/${esc(r.id)}">
      <td class="vcol">${votesHtml(r)}</td>
      <td><div class="nm">${r.draft ? `<span class="draftbadge">draft</span>` : ""}<a class="rowlink" href="/r/${esc(r.id)}">${esc(r.name)}</a>${whoHtml(r.author.handle)}</div><div class="ds">${esc(r.description)}</div></td>
      <td><span class="rid">${recipeHtml(r.neurons, 8)}</span>${edgeMark(r.neurons, r.model)}</td>
      <td class="hide-s"><div class="tags">${r.tags.slice(0, 4).map((t) => `<span class="tag ${tags.includes(t) ? "on" : ""}">${esc(t)}</span>`).join("")}</div></td>
      <td class="hide-s model">${esc(shortModel(r.model))}</td>
      <td><span class="cmt">${I.bubble}${r.comments}</span></td></tr>`).join("")}</tbody></table></div>`;

  main.innerHTML = bar + body;
  wireBrowse(p);
}

function wireBrowse(p) {
  const set = (k, v) => { const q = { ...p, [k]: v }; go(browseHref(q)); };
  $$("[data-sort]").forEach((b) => (b.onclick = () => set("sort", b.dataset.sort)));
  $("[data-extoggle]").onclick = () => set("ex", p.ex === "1" ? "" : "1");
  $("[data-random]").onclick = () => {
    const shown = filterRecipes(p).filter((r) => !r.draft);
    const pool = shown.length ? shown : RECIPES.filter((r) => !r.draft && !r.hidden);
    if (!pool.length) return;
    modalPushed = true;
    go("/r/" + pool[Math.floor(Math.random() * pool.length)].id);
  };
  const ft = $("[data-ftoggle]");
  if (ft) ft.onclick = (e) => { e.stopPropagation(); filtersOpen = !filtersOpen; openDd = null; renderBrowse(new URLSearchParams(Object.entries(p))); };
  $$("[data-view]").forEach((b) => (b.onclick = () => set("view", b.dataset.view === "cards" ? "" : b.dataset.view)));
  $$(".dd > button").forEach((b) => (b.onclick = (e) => {
    e.stopPropagation();
    const k = b.parentElement.dataset.dd;
    openDd = openDd === k ? null : k;
    renderBrowse(new URLSearchParams(Object.entries(p)));
    const f = $(`.pop [data-find]`) || $(".pop input");
    if (f) f.focus();
  }));
  $$(".pop").forEach((pop) => pop.addEventListener("click", (e) => e.stopPropagation()));
  $$('.pop input[type=checkbox]').forEach((c) => (c.onchange = () => {
    const k = c.dataset.key;
    const vals = $$(`.pop input[data-key="${k}"]:checked`).map((x) => x.value);
    set(k, vals.join(","));
  }));
  $$('.pop input[type=radio]').forEach((c) => (c.onchange = () => { openDd = null; set(c.dataset.key, c.value); }));
  $$("[data-clear]").forEach((a) => (a.onclick = (e) => { e.preventDefault(); openDd = null; set(a.dataset.clear, ""); }));
  const applyLayers = () => {
    const lo = $("[data-lo]").value.trim(), hi = $("[data-hi]").value.trim();
    openDd = null;
    set("layers", lo || hi ? `${lo}-${hi}` : "");
  };
  const al = $("[data-apply-layers]");
  if (al) {
    al.onclick = (e) => { e.preventDefault(); applyLayers(); };
    $$(".range input").forEach((i) => (i.onkeydown = (e) => e.key === "Enter" && applyLayers()));
  }
  $$("[data-find]").forEach((f) => (f.oninput = () => {
    const s = f.value.toLowerCase();
    $$(`[data-list="${f.dataset.find}"] label`).forEach((l) => (l.hidden = !l.dataset.v.toLowerCase().includes(s)));
  }));
  $$("tr.row").forEach((tr) => tr.addEventListener("auxclick", (e) => e.button === 1 && window.open(tr.dataset.href)));
}

document.addEventListener("click", () => {
  if (openDd) {
    openDd = null;
    const r = parseRoute();
    if (r.view === "browse") renderBrowse(r.p);
  }
});

// ------------------------------------------------------------------ recipe
function neuronUses(n) {
  const k = neuronKey(n);
  return visible().filter((r) => r.neurons.some((x) => neuronKey(x) === k)).length;
}

function recipeHtmlBlock(r, { modal }) {
  const cat = (CFG.categories || []).find((c) => r.tags.includes(c.tag));
  const m = methodOf(r);
  const sk = setKey(r.neurons);
  const aka = RECIPES.filter((x) => x.id !== r.id && setKey(x.neurons) === sk).sort((a, b) => b.score - a.score);
  const keys = new Set(r.neurons.map(neuronKey));
  const kset = (x) => x.neurons.map(neuronKey);
  // ingredients: posted recipes whose neurons are a strict subset of this one's (best-scored per neuron set)
  const bestPer = (xs) => { const m = new Map(); for (const x of xs) { const k = kset(x).sort().join(" "); if (!m.has(k) || m.get(k).score < x.score) m.set(k, x); } return [...m.values()]; };
  const pool = visible();
  const cands = r.neurons.length > 1 ? bestPer(pool.filter((x) => x.id !== r.id && x.neurons.length < r.neurons.length && kset(x).every((k) => keys.has(k))))
    .sort((a, b) => b.neurons.length - a.neurons.length || b.score - a.score) : [];
  // a non-overlapping breakdown: biggest posted parts first, each neuron counted once; leftovers listed as bare neurons
  const ingredients = [], covered = new Set();
  for (const x of cands) if (kset(x).every((k) => !covered.has(k))) { ingredients.push(x); kset(x).forEach((k) => covered.add(k)); }
  const leftover = sortNeurons(r.neurons).filter((n) => !covered.has(neuronKey(n)));
  const doseHere = Object.fromEntries(r.neurons.map((n) => [neuronKey(n), n.dose]));
  const doseDiffs = ingredients.flatMap((x) => x.neurons.filter((n) => doseHere[neuronKey(n)] !== n.dose)
    .map((n) => `${neuronKey(n)} ${doseStr(doseHere[neuronKey(n)])} here, ${doseStr(n.dose)} in ${x.name}`));
  // used in: combinations that contain all of this recipe's neurons
  const usedIn = pool.filter((x) => x.id !== r.id && x.neurons.length > r.neurons.length && [...keys].every((k) => x.neurons.some((n) => neuronKey(n) === k)))
    .sort((a, b) => b.score - a.score).slice(0, 8);
  const shown = new Set([...ingredients, ...usedIn].map((x) => x.id));
  const related = pool.filter((x) => x.id !== r.id && !shown.has(x.id) && setKey(x.neurons) !== sk && x.neurons.some((n) => keys.has(neuronKey(n))))
    .sort((a, b) => b.score - a.score).slice(0, 6);
  const hasBase = (r.examples || []).some((e) => e.base_output);
  const studio = studioFile(r);
  const units = m.normalization === "raw" ? " · raw units" : m.normalization === DEFAULT_METHOD.normalization ? " · ×median resid" : ` · ${m.normalization.replace(/_/g, " ")} units`;
  const methodTxt = `${m.op}${m.apply_to !== "all_tokens" ? " · " + m.apply_to.replace(/_/g, " ") + " only" : " · all tokens"}${m.op === "add" ? units : ""}`;

  const examples = (r.examples || []).map((e, i) => `<div class="ex" data-ex="${i}">
      <div class="p">${esc(e.prompt)}</div>
      <div class="single"><div class="o md">${md(e.output)}</div></div>
      ${e.base_output ? `<div class="pair" hidden><div><div class="lab s">steered${typeof e.scale === "number" && e.scale !== 1 ? " ×" + esc(+e.scale.toFixed(2)) : ""}</div><div class="o md">${md(e.output)}</div></div>
        <div><div class="lab b">base</div><div class="o b-o md">${md(e.base_output)}</div></div></div>` : ""}
      ${typeof e.scale === "number" && e.scale !== 1 ? `<div class="gen">doses ×${esc(+e.scale.toFixed(2))}</div>` : ""}
    </div>`).join("");

  return `<div class="rec">
    <div class="rhead">
      ${cat ? `<div class="crumb"><a href="/c/${esc(cat.tag)}">${esc(cat.name)}</a> &nbsp;›&nbsp; ${esc(r.name)}</div>` : ""}
      ${r.hidden ? `<div class="hidbanner">${store.user() && store.user().admin ? "Hidden: only you and admins can see this recipe." : "Waiting for review: only you can see this recipe until a moderator approves it."}${store.user() && store.user().admin ? ` <button class="btn sbtn" data-ract="hide">${I.eyeoff}<span>Unhide</span></button>` : ""}</div>` : ""}
      ${r.draft ? `<div class="hidbanner">Draft: only you can see this. <button class="btn sbtn primary" data-ract="publishdraft">Publish</button></div>` : ""}
      <h1>${esc(r.name)}</h1>
      <div class="idrow"><span class="rid idline">${recipeHtml(r.neurons)}</span>${copyBtn(recipeStr(r.neurons), "copy recipe")}${edgeMark(r.neurons, r.model)}</div>
      ${ingredients.length ? `<div class="combo"><span class="dim">combines</span> ${[...ingredients.map((x) => `<a href="/r/${esc(x.id)}">${esc(x.name)}</a>`),
        ...leftover.map((n) => `<a href="/n/${neuronKey(n)}" class="mono" title="no recipe posted for this neuron alone">${neuronKey(n)}</a>`)].join(` <span class="dim">+</span> `)}
        ${doseDiffs.length ? `<div class="dim combonote">different doses: ${esc(doseDiffs.join("; "))}</div>` : ""}</div>` : ""}
      <div class="meta"><a href="${userHref(r.author.handle)}"${isTrusted(r.author.handle) ? ' class="trusted" title="trusted publisher"' : ""}>@${esc(r.author.handle)}</a>${r.reproductions || r.repro_partial || r.repro_failed ? ` &nbsp;·&nbsp; ${reproHtml(r, true)}` : ""}
        &nbsp;·&nbsp; <a href="${browseHref({ model: r.model })}" class="mono">${esc(r.model)}</a>${r.date ? ` &nbsp;·&nbsp; ${esc(r.date.slice(0, 10))}` : ""}
        ${r.source ? ` &nbsp;·&nbsp; <a href="${esc(r.source)}" target="_blank" rel="noopener">source</a>` : ""}${r.origin === "local" ? ` &nbsp;·&nbsp; <span class="faint">only in this browser</span>` : ""}${r.origin === "demo" ? ` &nbsp;·&nbsp; <span class="faint">demo fixture</span>` : ""}
</div>
      ${recipeActions(r)}
      <div class="mobacts">
        <div class="vote v${r.myVote}" data-vote="${esc(r.id)}"><button class="upv" data-v="1" aria-label="upvote">${I.up}</button>
          <span class="n">${r.score}</span><button class="downv" data-v="-1" aria-label="downvote">${I.down}</button></div>
        <div class="copies">
          <button class="btn ibtn" data-act="json" title="copy the recipe as JSON">${I.copy}<span>JSON</span></button>
          <button class="btn ibtn" data-act="py" title="copy a Python script that runs it">${I.copy}<span>Python</span></button>
          ${studio ? `<button class="btn ibtn" data-act="studio" title="download a file Neuron Studio can import">${I.download}<span>Studio</span></button>` : ""}
        </div>
      </div>
      <div class="desc">${esc(r.description)}</div>
      <div class="tags">${tagsHtml(r.tags)}</div>
    </div>
    <div class="rbody">
      <section>
        <div class="sechead"><h2>Examples</h2><span class="faint mono">${(r.examples || []).length}</span>
          ${hasBase ? `<span class="seg" data-exmode><button class="on" data-m="s">steered</button><button data-m="b">vs base</button></span>` : ""}</div>
        ${examples || `<div class="faint">—</div>`}
      </section>
      <section>
        <div class="sechead"><h2>Reproductions</h2><span data-rcount>${reproHtml(r) || `<span class="faint mono">0</span>`}</span></div>
        <div data-repros><div class="dim">…</div></div>
      </section>
      <section>
        <div class="sechead"><h2>Comments</h2><span class="faint mono" data-ccount>${r.comments}</span></div>
        <div data-comments><div class="dim">…</div></div>
      </section>
    </div>
    <aside class="rail">
      <div class="railacts">
      <div class="vote v${r.myVote}" data-vote="${esc(r.id)}"><button class="upv" data-v="1" aria-label="upvote">${I.up}</button>
        <span class="n">${r.score}</span><button class="downv" data-v="-1" aria-label="downvote">${I.down}</button></div>
      <div class="copies">
        <button class="btn ibtn" data-act="json" title="copy the recipe as JSON">${I.copy}<span>JSON</span></button>
        <button class="btn ibtn" data-act="py" title="copy a Python script that runs it">${I.copy}<span>Python</span></button>
        ${studio ? `<button class="btn ibtn" data-act="studio" title="download a file Neuron Studio can import">${I.download}<span>Studio</span></button>` : ""}
      </div>
      </div>
      <div class="blk"><div class="lab">neurons</div>
        ${sortNeurons(r.neurons).map((n, i) => { const u = neuronUses(n) - 1; return `<div class="nrow"${i >= 12 ? " data-fold hidden" : ""}><span class="rid">${neuronHtml(n)}</span>${copyBtn(neuronStr(n), "copy neuron")}
          ${u > 0 ? `<a class="in" href="/n/${neuronKey(n)}">in ${u} other${u === 1 ? "" : "s"}</a>` : ""}</div>`; }).join("")}
        ${r.neurons.length > 12 ? `<button class="linkbtn dim" data-unfold>show all ${r.neurons.length}</button>` : ""}
      </div>
      ${r.dose_curve ? `<div class="blk"><div class="lab">dose curve</div>${curveSvg(r.dose_curve)}</div>` : ""}
      <div class="blk"><div class="lab">method <span class="unitq" data-tip="${esc(m.op === "add" && m.normalization !== "raw"
        ? "Dose units: at the input of the layer's mlp.down_proj, every token gets act[n] += dose × median(‖residual leaving the layer‖) / ‖W_down[:, n]‖. So +1.0 adds one median residual norm along the neuron's output direction. Single neurons are usually coherent around 0.5–1.0, and doses add across neurons."
        : m.op === "mul" ? "Multiply: the neuron's activation at mlp.down_proj's input is scaled by the dose." : "Raw units: the dose is added directly to the activation at mlp.down_proj's input.")}">units?</span></div><div class="mono">${esc(methodTxt)}</div></div>
      ${samplingText(r) ? `<div class="blk"><div class="lab">recommended sampling</div><div class="mono">${esc(samplingText(r))}</div></div>` : ""}
      ${aka.length || (r.aliases || []).length ? `<div class="blk"><div class="lab">also known as</div>
        ${(r.aliases || []).map((a) => `<div class="alias"><span>${esc(a)}</span></div>`).join("")}
        ${aka.map((x) => `<div class="alias"><a href="/r/${esc(x.id)}">${esc(x.name)}</a><span class="s">${x.score}</span></div>`).join("")}</div>` : ""}
      ${usedIn.length ? `<div class="blk"><div class="lab">used in</div>
        ${usedIn.map((x) => `<a class="rel" href="/r/${esc(x.id)}"><span class="t">${esc(x.name)}</span><span class="rid">${recipeHtml(x.neurons)}</span></a>`).join("")}</div>` : ""}
      ${related.length ? `<div class="blk"><div class="lab">shares neurons with</div>
        ${related.map((x) => `<a class="rel" href="/r/${esc(x.id)}"><span class="t">${esc(x.name)}</span><span class="rid">${recipeHtml(x.neurons)}</span></a>`).join("")}</div>` : ""}
      ${r.notes ? `<div class="blk"><div class="lab">notes</div><div class="notes">${linkify(r.notes)}</div></div>` : ""}
      ${r.conditional ? `<div class="blk"><div class="lab">conditional</div><pre>${esc(JSON.stringify(r.conditional, null, 2))}</pre></div>` : ""}
    </aside>
  </div>`;
}

async function loadRecipe(id) {
  const r = await store.get(id);
  if (!r) return null;
  const i = RECIPES.findIndex((x) => x.id === id);
  if (i >= 0) RECIPES[i] = { ...RECIPES[i], ...r };
  return r;
}

function recipeActions(r) {
  const out = [];
  const b = (act, icon, label, cls = "") => `<button class="btn sbtn ${cls}" data-ract="${act}">${icon}<span>${label}</span></button>`;
  if (!r.draft && !r.hidden) out.push(b("share", I.share, "Share"));
  out.push(b("remix", I.fork, "Remix"));
  if (store.canEdit && store.canEdit(r)) {
    out.push(`<button class="btn sbtn" data-ract="edit">${I.edit}<span>Edit</span></button>`);
  }
  const u = store.user();
  if (u && u.admin && store.mode === "supabase") out.push(b("hide", I.eyeoff, r.hidden ? "Unhide" : "Hide"));
  if (u && u.admin && store.mode === "supabase" && !r.draft) out.push(b("feature", r.featured ? I.starOn : I.star, r.featured ? "Featured" : "Feature"));
  if (store.canEdit && store.canEdit(r) && r.origin !== "repo") out.push(b("delete", I.trash, "Delete", "danger")); // repo recipes would sync back
  if (store.mode === "supabase" && !(store.canEdit && store.canEdit(r))) out.push(b("report", I.flag, "Report", "quiet"));
  return out.length ? `<div class="ractions">${out.join("")}</div>` : "";
}

function wireRecipe(root, r) {
  $$("[data-ract]", root).forEach((b) => (b.onclick = async () => {
    const a = b.dataset.ract;
    try {
      if (a === "edit") {
        if (overlay.innerHTML) { closeModal(true); }
        return openEditor(r.id);
      }
      if (a === "publishdraft") {
        await store.publishDraft(r.id);
        RECIPES = await store.list();
        flashOk(`Published “${r.name}”.`);
        return route();
      }
      if (a === "feature") {
        await store.setFeatured(r.id, !r.featured);
        r.featured = !r.featured;
        RECIPES = await store.list();
        b.querySelector("span").textContent = r.featured ? "Featured" : "Feature";
        b.querySelector("svg").outerHTML = r.featured ? I.starOn : I.star;
        b.title = r.featured ? "featured on the home page; click to unfeature" : "";
        return;
      }
      if (a === "share") {
        // the /r/<id> link unfurls with this recipe's own card on X and Discord
        const url = `https://neuronary.org/r/${r.id}`;
        if (navigator.share && matchMedia("(pointer: coarse)").matches) { try { await navigator.share({ title: r.name, url }); } catch { /* cancelled */ } return; }
        if (await copyText(url)) { const sp = b.querySelector("span"); sp.textContent = "Link copied"; setTimeout(() => (sp.textContent = "Share"), 1500); }
        return;
      }
      if (a === "remix") {
        if (store.mode === "supabase" && !signedIn()) return signInPrompt("remix this recipe", () => remix(r));
        return remix(r);
      }
      if (a === "delete") {
        if (!confirm(`Delete “${r.name}”? Votes and comments go with it.`)) return;
        await store.remove(r.id);
        RECIPES = RECIPES.filter((x) => x.id !== r.id);
        if (overlay.innerHTML) { closeModal(true); listShown = false; }
        go("/");
      } else if (a === "hide") {
        await store.setHidden(r.id, !r.hidden);
        RECIPES = await store.list();
        b.querySelector("span").textContent = r.hidden ? "Hide" : "Unhide";
        r.hidden = !r.hidden;
      } else if (a === "report") {
        if (!signedIn()) return signInPrompt("report");
        const reason = prompt("What's wrong with this recipe?");
        if (!reason || !reason.trim()) return;
        await store.report({ recipeId: r.id, reason: reason.trim() });
        b.querySelector("span").textContent = "Reported";
        b.disabled = true;
      }
    } catch (e) { flashError(e); }
  }));
  const uf = $("[data-unfold]", root);
  if (uf) uf.onclick = () => { $$("[data-fold]", root).forEach((x) => (x.hidden = false)); uf.remove(); };
  const seg = $("[data-exmode]", root);
  if (seg) seg.onclick = (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    $$("button", seg).forEach((x) => x.classList.toggle("on", x === b));
    const vs = b.dataset.m === "b";
    $$(".ex", root).forEach((ex) => {
      const pair = $(".pair", ex);
      if (!pair) return;
      pair.hidden = !vs;
      $(".single", ex).hidden = vs;
    });
  };
  $$("[data-act]", root).forEach((b) => (b.onclick = async () => {
    const a = b.dataset.act;
    if (a === "json") { if (await copyText(recipeJson(r))) flashBtn(b); }
    if (a === "py") { if (await copyText(pythonSnippet(r))) flashBtn(b); }
    if (a === "studio") { download(`${r.id}.neuron-studio.json`, JSON.stringify(studioFile(r), null, 2)); flashBtn(b); }
  }));
  renderComments(root, r);
  renderRepros(root, r);
}

function flashBtn(b) {
  const lab = b.querySelector("span") || b;
  if (!b.dataset.t) b.dataset.t = lab.textContent;
  b.classList.add("flash-ok");
  lab.textContent = b.dataset.act === "studio" ? "Saved" : "Copied";
  clearTimeout(b._t);
  b._t = setTimeout(() => { b.classList.remove("flash-ok"); lab.textContent = b.dataset.t; }, 1100);
}

async function openModal(id) {
  document.body.classList.add("modal-open");
  modalOpener = document.activeElement;
  overlay.innerHTML = `<div class="modal"><div class="sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-title" tabindex="-1"><div class="dim">…</div></div></div>`;
  $(".sheet", overlay).focus({ preventScroll: true });
  // closes with back, Escape, or a tap on the scrim around the sheet (no close button)
  const modal = $(".modal", overlay);
  modal.onclick = (e) => { if (e.target === modal) closeModalNav(); };
  swipeToClose(modal);
  let r;
  try { r = await loadRecipe(id); } catch (e) { flashError(e); }
  if (parseRoute().id !== id) return;
  const sheet = $(".sheet", overlay);
  if (!r) { sheet.innerHTML = `<div class="empty">No recipe called “${esc(id)}”.</div>`; return; }
  document.title = `${r.name} · neuronary`;
  sheet.innerHTML = `${recipeHtmlBlock(r, { modal: true })}`;
  const h1 = $(".rec h1", sheet); if (h1) h1.id = "sheet-title";
  sheet.focus({ preventScroll: true });
  wireRecipe(sheet, r);
}

// Touch: dragging the sheet down while it's scrolled to the top follows the finger, and past a threshold closes it.
// Also keeps Chrome's pull-to-refresh from firing on that drag.
function swipeToClose(modal) {
  let y0 = null, dy = 0;
  const sheet = () => $(".sheet", modal);
  modal.addEventListener("touchstart", (e) => {
    y0 = modal.scrollTop <= 0 && e.touches.length === 1 ? e.touches[0].clientY : null; dy = 0;
  }, { passive: true });
  modal.addEventListener("touchmove", (e) => {
    if (y0 == null) return;
    dy = e.touches[0].clientY - y0;
    if (dy <= 0) { y0 = modal.scrollTop <= 0 ? e.touches[0].clientY : null; dy = 0; sheet().style.translate = ""; return; }
    e.preventDefault();
    const s = sheet(); s.style.transition = "none"; s.style.translate = `0 ${dy}px`;
  }, { passive: false });
  modal.addEventListener("touchend", () => {
    if (y0 == null) return;
    const s = sheet(); s.style.transition = "";
    if (dy > 90) { s.style.translate = "0 100vh"; setTimeout(closeModalNav, 140); }
    else s.style.translate = "";
    y0 = null; dy = 0;
  });
}

// opens the submit form pre-filled from a recipe: same neurons, model, method, tags, sampling; new name and examples
function remix(r) {
  const cur = loadDraftFor(DRAFT_KEY);
  if ((cur.name.trim() || cur.description.trim()) && !confirm("Replace your unfinished draft with this remix?")) return;
  const d = recipeToDraft(r);
  delete d._orig;
  Object.assign(d, { name: "", description: "", examples: [{ prompt: "", output: "", base_output: "" }], source: `https://neuronary.org/r/${r.id}`, notes: `Remix of “${r.name}” by @${r.author.handle}.` });
  localStorage.setItem(DRAFT_KEY, JSON.stringify(d));
  if (overlay.innerHTML) closeModal(true);
  editing = null;
  openEditor();
}

function closeModalNav() {
  if (modalPushed) history.back();
  else go(lastListHash);
}

let modalOpener = null;
function closeModal(silent) {
  if (!overlay.innerHTML) return;
  overlay.innerHTML = "";
  if (modalOpener && modalOpener.isConnected) modalOpener.focus({ preventScroll: true });
  modalOpener = null;
  document.body.classList.remove("modal-open");
  document.title = "neuronary";
  if (!silent) closeModalNav();
}

document.addEventListener("keydown", (e) => {
  if (!overlay.innerHTML) return;
  if (e.key === "Escape") {
    if (document.querySelector(".pop")) return; // a popover closes first
    const a = document.activeElement;
    if (a && a.matches("input, textarea") && a.value.trim()) { a.blur(); return; } // don't throw away typed text
    closeModalNav();
  } else if (e.key === "Tab") {
    // keep focus inside the sheet
    const sheet = $(".sheet", overlay);
    const f = $$("a[href], button:not([disabled]), input, textarea, select, [tabindex]:not([tabindex='-1'])", sheet).filter((x) => x.offsetParent !== null);
    if (!f.length) return;
    if (e.shiftKey && (document.activeElement === f[0] || document.activeElement === sheet)) { e.preventDefault(); f[f.length - 1].focus(); }
    else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
  }
});

// comments
// dose curve: measured effect at a few doses, as a small line chart
function curveSvg(c) {
  const pts = [...c.points].sort((a, b) => a.dose - b.dose);
  const W = 240, H = 120, L = 30, R = 8, T = 10, B = 24;
  const xs = pts.map((p) => p.dose), ys = pts.map((p) => p.value);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(0, ...ys), y1 = Math.max(...ys) || 1;
  const X = (v) => L + ((v - x0) / (x1 - x0 || 1)) * (W - L - R), Y = (v) => H - B - ((v - y0) / (y1 - y0 || 1)) * (H - T - B);
  const fmt = (v) => String(+v.toFixed(3));
  return `<svg class="curve" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(c.metric)} by dose: ${pts.map((p) => `${fmt(p.dose)} gives ${fmt(p.value)}`).join(", ")}">
    <line x1="${L}" y1="${H - B}" x2="${W - R}" y2="${H - B}" class="ax"/><line x1="${L}" y1="${T}" x2="${L}" y2="${H - B}" class="ax"/>
    <polyline points="${pts.map((p) => `${X(p.dose)},${Y(p.value)}`).join(" ")}" class="ln"/>
    ${pts.map((p) => `<circle cx="${X(p.dose)}" cy="${Y(p.value)}" r="3" class="pt"><title>dose ${fmt(p.dose)}: ${fmt(p.value)}</title></circle>`).join("")}
    ${pts.map((p) => `<text x="${X(p.dose)}" y="${H - B + 14}" text-anchor="middle">${fmt(p.dose)}</text>`).join("")}
    <text x="${L - 5}" y="${Y(y1) + 4}" text-anchor="end">${fmt(y1)}</text><text x="${L - 5}" y="${Y(y0) + 4}" text-anchor="end">${fmt(y0)}</text>
  </svg><div class="dim curvelab">${esc(c.metric)} by dose</div>`;
}

// "Reproduced": other people's own runs of the recipe, each with a sample. Stronger evidence than votes.
async function renderRepros(root, r) {
  const box = $("[data-repros]", root);
  if (!box || store.mode !== "supabase") { if (box) box.closest("section").hidden = true; return; }
  let list = [];
  try { list = await store.reproductions(r.id); } catch (e) { box.innerHTML = `<div class="err">${esc(e.message)}</div>`; return; }
  const u = store.user();
  const mine = u && list.find((x) => x.user_id === u.id);
  const own = u && r.user_id === u.id;
  const items = list.map((x) => `<div class="repro-item${x.hidden ? " hiddenc" : ""}">
      <div class="rh"><span class="rres ${esc(x.result || "yes")}">${x.result === "no" ? "didn't reproduce" : x.result === "partial" ? "partly" : `${I.repro} reproduced`}</span>${whoHtml(x.author_handle)}<span class="faint">${esc(ago(x.created_at))}</span>${x.setup ? `<span class="dim rnote">${esc(x.setup)}</span>` : ""}
        ${u && (x.user_id === u.id || u.admin) ? `<button class="dim linkbtn" data-rdel="${x.id}">delete</button>` : ""}
        ${u && u.admin ? `<button class="dim linkbtn" data-rhide="${x.id}:${x.hidden ? 0 : 1}">${x.hidden ? "unhide" : "hide"}</button>` : ""}</div>
      ${x.note ? `<div class="rnotes">${linkify(x.note)}</div>` : ""}
      <div class="rrun">${x.prompt ? `<div class="rlab">prompt</div><div class="rprompt">${esc(x.prompt)}</div>` : ""}<div class="rlab">output</div><div class="o md">${md(x.output)}</div></div></div>`).join("");
  const canAdd = !own && !mine;
  box.innerHTML = `${items || `<div class="faint">Nobody has reported running this yet.</div>`}
    ${canAdd ? `<button class="btn sbtn" data-rshow>${I.repro}<span>I ran this</span></button>
    <form class="rform" data-rform hidden>
      <div class="f"><span id="rp-lab">prompt <span class="faint">a random everyday one, so the run isn't the author's own example; use any</span></span>
        <div class="rprow"><input data-rp aria-labelledby="rp-lab" value="${esc(randomPrompt())}"><button type="button" class="btn sbtn" data-rshuffle title="another prompt" aria-label="another prompt">${I.dice}</button></div></div>
      <div class="f"><span id="rres-lab">did it reproduce?</span><span class="seg" role="radiogroup" aria-labelledby="rres-lab" data-rres>
        <button type="button" class="on" data-res="yes" role="radio" aria-checked="true">yes</button><button type="button" data-res="partial" role="radio" aria-checked="false">partly</button><button type="button" data-res="no" role="radio" aria-checked="false">no</button></span></div>
      <label class="f"><span>what the steered model said for you</span><textarea data-ro required></textarea></label>
      <label class="f"><span>setup</span><input data-rsetup placeholder="bf16 transformers, Q4_K_M llama.cpp, MLX 4-bit…" maxlength="200"></label>
      <label class="f"><span>notes <span class="faint">optional</span></span><input data-rn placeholder="dose changes, sampling, what differed"></label>
      <div class="pub"><button class="btn primary" type="submit">Post</button><button class="btn" type="button" data-rcancel>Cancel</button></div>
    </form>` : own ? `<div class="faint small">Others can mark this reproduced with their own sample.</div>` : ""}`;
  const show = $("[data-rshow]", box), form = $("[data-rform]", box);
  if (show) show.onclick = () => {
    if (!signedIn()) return signInPrompt("report a reproduction", () => renderRepros(root, r));
    if (!store.user().verified) return verifyPrompt("report a reproduction");
    show.hidden = true; form.hidden = false; $("[data-ro]", form).focus();
  };
  if (form) {
    $("[data-rcancel]", form).onclick = () => { form.hidden = true; show.hidden = false; };
    $("[data-rshuffle]", form).onclick = () => { const i = $("[data-rp]", form); i.value = randomPrompt(i.value); };
    $$("[data-res]", form).forEach((b) => (b.onclick = () => $$("[data-res]", form).forEach((x) => { x.classList.toggle("on", x === b); x.setAttribute("aria-checked", String(x === b)); })));
    form.onsubmit = async (e) => {
      e.preventDefault();
      const output = $("[data-ro]", form).value;
      if (!output.trim()) return;
      const btn = $("button[type=submit]", form); btn.disabled = true;
      try {
        const result = $("[data-rres] .on", form).dataset.res;
        await store.reproduce(r.id, { prompt: $("[data-rp]", form).value, output, note: $("[data-rn]", form).value.trim(), setup: $("[data-rsetup]", form).value.trim(), result });
        const key = { yes: "reproductions", partial: "repro_partial", no: "repro_failed" }[result];
        r[key] = (r[key] || 0) + 1;
        const rc = $("[data-rcount]", root); if (rc) rc.innerHTML = reproHtml(r);
        const i = RECIPES.findIndex((x) => x.id === r.id); if (i >= 0) Object.assign(RECIPES[i], { reproductions: r.reproductions, repro_partial: r.repro_partial, repro_failed: r.repro_failed });
        renderRepros(root, r);
      } catch (err) { btn.disabled = false; flashError(err); }
    };
  }
  $$("[data-rdel]", box).forEach((b) => (b.onclick = async () => {
    if (!confirm("Delete this reproduction?")) return;
    try { await store.deleteReproduction(+b.dataset.rdel); r.reproductions = Math.max(0, (r.reproductions || 1) - 1); renderRepros(root, r); } catch (e) { flashError(e); }
  }));
  $$("[data-rhide]", box).forEach((b) => (b.onclick = async () => {
    const [id, h] = b.dataset.rhide.split(":");
    try { await store.hideReproduction(+id, h === "1"); renderRepros(root, r); } catch (e) { flashError(e); }
  }));
}

async function renderComments(root, r) {
  const box = $("[data-comments]", root);
  let list = [];
  try { list = await store.comments(r.id); } catch (e) { box.innerHTML = `<div class="err">${esc(e.message)}</div>`; return; }
  const u = store.user();
  const top = list.filter((c) => !c.parent_id);
  const kids = (id) => list.filter((c) => c.parent_id === id);
  const one = (c) => `<li data-cid="${c.id}"${c.hidden ? ' style="opacity:.45"' : ""}>${avatarHtml(c.handle, c.avatar_url)}<div>
      <div class="h"><a class="cauthor" href="${userHref(c.handle)}"><b>${esc(c.handle)}</b></a><span>${esc(ago(c.created_at))}</span></div>
      <div class="b">${esc(c.body)}</div>
      <div class="act">${!c.parent_id ? `<button data-reply="${c.id}">reply</button>` : ""}${(u && u.handle === c.handle) || (u && u.admin) ? `<button data-del="${c.id}">delete</button>` : ""}${u && u.admin && store.mode === "supabase" ? `<button data-hide="${c.id}" data-h="${c.hidden ? 0 : 1}">${c.hidden ? "unhide" : "hide"}</button>` : ""}${store.mode === "supabase" && !(u && u.handle === c.handle) ? `<button data-rep="${c.id}">report</button>` : ""}</div>
      ${!c.parent_id ? `<ul>${kids(c.id).map(one).join("")}</ul><div data-replybox="${c.id}"></div>` : ""}</div></li>`;
  box.innerHTML = `<div class="cbox"><textarea placeholder="${u ? "add a comment" : "sign in to comment"}" data-new></textarea>
      <button class="btn" data-post hidden>Post</button></div>
    ${store.mode === "supabase" ? `<div class="modnote">moderated by <a href="https://typesafe.ai" target="_blank" rel="noopener">jev</a></div>` : ""}
    <ul class="cmts">${top.map(one).join("")}</ul>`;
  const cc = $("[data-ccount]", root);
  if (cc) cc.textContent = list.length;
  const ta = $("[data-new]", box);
  const post = $("[data-post]", box);
  ta.onfocus = () => { if (!signedIn()) { ta.blur(); signInPrompt("comment"); } };
  ta.oninput = () => (post.hidden = !ta.value.trim());
  const send = async (body, parent, btn) => {
    btn.disabled = true;
    try {
      await store.comment(r.id, body, parent);
      const rr = RECIPES.find((x) => x.id === r.id);
      if (rr) rr.comments += 1;
      renderComments(root, r);
    } catch (e) { flashError(e); btn.disabled = false; }
  };
  post.onclick = () => send(ta.value.trim(), null, post);
  ta.onkeydown = (e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && ta.value.trim()) send(ta.value.trim(), null, post); };
  $$("[data-reply]", box).forEach((b) => (b.onclick = () => {
    if (!signedIn()) return signInPrompt("comment");
    const slot = $(`[data-replybox="${b.dataset.reply}"]`, box);
    slot.innerHTML = `<div class="cbox" style="margin:10px 0 0"><textarea placeholder="reply"></textarea><button class="btn">Reply</button></div>`;
    const t = $("textarea", slot);
    t.focus();
    $("button", slot).onclick = (e) => t.value.trim() && send(t.value.trim(), +b.dataset.reply, e.currentTarget);
  }));
  $$("[data-hide]", box).forEach((b) => (b.onclick = async () => {
    try { await store.hideComment(+b.dataset.hide, b.dataset.h === "1"); renderComments(root, r); } catch (e) { flashError(e); }
  }));
  $$("[data-rep]", box).forEach((b) => (b.onclick = async () => {
    if (!signedIn()) return signInPrompt("report");
    const reason = prompt("What's wrong with this comment?");
    if (!reason || !reason.trim()) return;
    try { await store.report({ commentId: +b.dataset.rep, reason: reason.trim() }); b.textContent = "reported"; b.disabled = true; } catch (e) { flashError(e); }
  }));
  $$("[data-del]", box).forEach((b) => (b.onclick = async () => {
    if (!confirm("Delete this comment?")) return;
    try { await store.deleteComment(r.id, +b.dataset.del); renderComments(root, r); } catch (e) { flashError(e); }
  }));
}

// ------------------------------------------------------------------ auth
// Supabase has two X providers: "x" (OAuth 2.0) and the older "twitter" (OAuth 1.0a); use whichever is configured
const xProvider = () => (store.providers ? store.providers() : []).find((p) => p === "x" || p === "twitter");

function signedIn() {
  const u = store.user();
  return !!u && !u.needsHandle;
}

let popJustOpened = false; // a pop opened by a click must survive that same click reaching document
function closePops() { $$(".signin-pop, .me-pop").forEach((x) => x.remove()); }
document.addEventListener("click", () => { if (!popJustOpened) closePops(); });

function renderMe() {
  const u = store.user();
  const me = $("#me");
  if (u && !u.needsHandle) {
    me.innerHTML = `<button id="mebtn" aria-label="account${u.nameStatus ? " (your name needs attention)" : ""}">${avatarHtml(u.handle, u.avatar)}${u.nameStatus ? `<span class="medot"></span>` : ""}</button>`;
    $("#mebtn").onclick = (e) => { e.stopPropagation(); meMenu(u); };
  } else {
    me.innerHTML = `<button id="signin">${u ? "pick a name" : "sign in"}</button>`;
    $("#signin").onclick = (e) => { e.stopPropagation(); signInPrompt(); };
  }
}

function popAt(cls) {
  closePops();
  popJustOpened = true;
  setTimeout(() => (popJustOpened = false), 0);
  const pop = document.createElement("div");
  pop.className = "pop " + cls;
  pop.style.cssText = "position:fixed;top:60px;right:20px;left:auto;width:280px;z-index:70";
  pop.addEventListener("click", (e) => e.stopPropagation());
  document.body.appendChild(pop);
  return pop;
}

function meMenu(u) {
  const pop = popAt("me-pop");
  const canLinkX = store.mode === "supabase" && u.anonymous && !!xProvider();
  pop.innerHTML = `${u.nameStatus ? `<div class="namenote" role="status">${u.nameStatus === "renamed"
      ? "Your name was removed by moderation and replaced with this one. Pick a new name:"
      : `Your name <b>@${esc(u.handle)}</b> is waiting for a moderator's review. You can keep it, or pick another now:`}
      <div class="namerow"><input data-newname placeholder="new name" maxlength="24" autocomplete="off" spellcheck="false" aria-label="new name"><button class="btn sbtn" data-rename>Change</button></div>
      <div class="err" data-nameerr></div></div>` : ""}
    <div class="lab">signed in as <b style="color:var(--ink)">@${esc(u.handle)}</b>${u.admin ? " · admin" : ""}${store.mode === "local" ? " (this browser only)" : ""}</div>
    <a class="menu-i" href="${userHref(u.handle)}">your profile</a>
    ${store.listTokens ? `<button class="menu-i" data-agents>API & agents</button>` : ""}
    ${u.admin && store.modQueue ? `<button class="menu-i" data-mod>moderation</button>` : ""}
    ${canLinkX ? `<button class="menu-i" data-link>link your X account</button>` : ""}
    <button class="menu-i danger" data-out>sign out</button>
    ${u.anonymous ? `<div class="lab" style="font-size:11.5px">This name lives in this browser's session. Signing out loses it${canLinkX ? " unless you link X first" : ""}.</div>` : ""}`;
  $$("a.menu-i", pop).forEach((x) => (x.onclick = closePops));
  const mb = $("[data-mod]", pop);
  if (mb) mb.onclick = () => { closePops(); renderMod(); };
  const ab = $("[data-agents]", pop);
  if (ab) ab.onclick = () => { closePops(); renderAgents(); };
  const l = $("[data-link]", pop);
  if (l) l.onclick = () => store.linkWith(xProvider()).catch(flashError);
  const rn = $("[data-rename]", pop);
  if (rn) {
    const inp = $("[data-newname]", pop), err = $("[data-nameerr]", pop);
    const go = async () => {
      const h = inp.value.trim().replace(/^@/, "");
      if (!/^[A-Za-z0-9_]{2,24}$/.test(h)) { err.textContent = "2–24 letters, digits or _"; return; }
      rn.disabled = true; err.textContent = "";
      try { await store.changeHandle(h); closePops(); flashOk(`You're @${h} now.`); RECIPES = await store.list(); route(); }
      catch (e) { rn.disabled = false; err.textContent = /taken/.test(e.message) ? "that name is taken" : e.message; }
    };
    rn.onclick = go;
    inp.onkeydown = (e) => { if (e.key === "Enter") go(); };
  }
  $("[data-out]", pop).onclick = async () => {
    if (u.anonymous && !confirm("Sign out? This anonymous name can't be recovered.")) return;
    closePops();
    await store.signOut();
  };
}

function signInPrompt(why, then = null) {
  const pop = popAt("signin-pop");
  const u = store.user();
  const x = store.mode === "supabase" && !u && xProvider();
  pop.innerHTML = `${why ? `<div class="lab">sign in to ${esc(why)}</div>` : ""}
    ${x ? `<button class="xbtn" data-x>${I.x}Sign in with Twitter</button><div class="lab">or pick a name</div>` : `<div class="lab">pick a name${store.mode === "local" ? " (kept in this browser)" : ""}</div>`}
    <input type="text" placeholder="name" autocomplete="off" maxlength="24" spellcheck="false">
    <div class="err" data-err></div>
    <div class="foot"><a href="#" data-cancel>cancel</a><a href="#" data-ok>continue</a></div>`;
  const inp = $("input", pop);
  if (!x) inp.focus();
  const err = $("[data-err]", pop);
  const ok = async () => {
    const h = inp.value.trim().replace(/^@/, "");
    if (!/^[A-Za-z0-9_]{2,24}$/.test(h)) { err.textContent = "2–24 letters, digits or _"; return; }
    err.textContent = "";
    try {
      if (u && u.needsHandle) await store.claimHandle(h); else await store.signIn(h);
      closePops();
      if (then) then();
    } catch (e) {
      err.textContent = /taken|duplicate|unique/i.test(e.message) ? "that name is taken" : e.message;
    }
  };
  const xb = $("[data-x]", pop);
  if (xb) xb.onclick = () => {
    if (editorOpen && !editing) sessionStorage.setItem("nr.reopenSubmit", "1");
    store.signInWith(xProvider()).catch(flashError);
  };
  $("[data-ok]", pop).onclick = (e) => { e.preventDefault(); ok(); };
  $("[data-cancel]", pop).onclick = (e) => { e.preventDefault(); sessionStorage.removeItem("nr.reopenSubmit"); closePops(); };
  inp.onkeydown = (e) => { if (e.key === "Enter") ok(); if (e.key === "Escape") closePops(); };
}

// picked-name (anonymous) accounts can comment but not vote or report reproductions: one click links X instead
function verifyPrompt(why) {
  const pop = popAt("signin-pop");
  const x = xProvider();
  pop.innerHTML = `<div class="lab">To ${esc(why)}, link a Twitter account. Votes and reproductions count only from real accounts, so throwaway names can't stuff them.</div>
    ${x ? `<button class="xbtn" data-x>${I.x}Link Twitter</button>` : ""}
    <div class="foot"><a href="#" data-cancel>cancel</a></div>`;
  const xb = $("[data-x]", pop);
  if (xb) xb.onclick = () => store.linkWith(x).catch(flashError);
  $("[data-cancel]", pop).onclick = (e) => { e.preventDefault(); closePops(); };
}

// ------------------------------------------------------------------ theme
$("#theme").innerHTML = I.theme;
$("#theme").onclick = () => {
  const t = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  document.documentElement.dataset.theme = t;
  localStorage.setItem("nr.theme", t);
};

// ------------------------------------------------------------------ submit
const DRAFT_KEY = "nr.draft";
const emptyDraft = () => ({ name: "", description: "", model: "Qwen/Qwen3.5-4B", tags: [], neurons: [{ layer: "", neuron: "", dose: "" }],
  op: "add", rep: "", temp: "", examples: [{ prompt: "", output: "", base_output: "" }], source: "", notes: "", curve_metric: "", curve: "" });

// "0:0, 0.5:13, 0.8:20" -> [{dose, value}]; null if anything doesn't parse
function parseCurve(text) {
  const parts = String(text).split(/[,;\n]+/).map((x) => x.trim()).filter(Boolean);
  const pts = parts.map((x) => { const m = x.match(/^([+-]?\d*\.?\d+)\s*(?::|=|→|->)\s*([+-]?\d*\.?\d+)$/); return m ? { dose: +m[1], value: +m[2] } : null; });
  return pts.every(Boolean) ? pts : null;
}

let editing = null; // recipe id while editing an existing recipe
const draftKey = () => (editing ? `nr.draft.edit.${editing}` : DRAFT_KEY);

function loadDraftFor(key) {
  try { return { ...emptyDraft(), ...JSON.parse(localStorage.getItem(key)) }; } catch { return emptyDraft(); }
}
function loadDraft() {
  try { return { ...emptyDraft(), ...JSON.parse(localStorage.getItem(draftKey())) }; } catch { return emptyDraft(); }
}

function recipeToDraft(r) {
  const s = r.sampling || {};
  return {
    name: r.name, description: r.description, model: r.model, tags: [...r.tags],
    neurons: sortNeurons(r.neurons).map((n) => ({ layer: String(n.layer), neuron: String(n.neuron), dose: String(n.dose), ...(n.expert != null ? { expert: String(n.expert) } : {}) })),
    op: (r.method && r.method.op) || "add", rep: s.repetition_penalty ?? "", temp: s.temperature ?? "",
    examples: (r.examples && r.examples.length ? r.examples : [{ prompt: "", output: "" }]).map((e) => ({ prompt: e.prompt || "", output: e.output || "", base_output: e.base_output || "" })),
    source: r.source || "", notes: r.notes || "",
    curve_metric: (r.dose_curve && r.dose_curve.metric) || "", curve: r.dose_curve ? r.dose_curve.points.map((p) => `${p.dose}:${p.value}`).join(", ") : "",
    _orig: { method: r.method || null, sampling: r.sampling || null, conditional: r.conditional || null, aliases: r.aliases || [], examples: r.examples || [] },
  };
}

let editorOpen = false;
let editorReturn = null; // scroll position of the page underneath

// submit / edit live in the main area without changing the URL; any navigation closes them
function openEditor(id = null) {
  closePops();
  if (!editorOpen) history.pushState({ editor: true }, "", location.href); // Back closes the form (no URL of its own)
  editorOpen = true;
  listShown = false; // the form replaces the list in main
  editorReturn = scrollY;
  document.body.className = "page-submit";
  scrollTo(0, 0);
  if (id) return startEdit(id);
  editing = null;
  renderSubmit();
}

// back/forward: every history entry is a path (plus the editor's same-URL entry), so route on each one
window.addEventListener("popstate", (e) => {
  if (e.state && e.state.editor && editorOpen) return;
  editorOpen = false; editing = null;
  route();
});

function closeEditor() {
  if (history.state && history.state.editor) { history.back(); return; } // popstate re-routes
  editorOpen = false;
  editing = null;
  route().then(() => editorReturn != null && scrollTo(0, editorReturn));
}

async function startEdit(id) {
  main.innerHTML = `<div class="empty">…</div>`;
  let r = null;
  try { r = await loadRecipe(id); } catch (e) { flashError(e); }
  if (!r || !(store.canEdit && store.canEdit(r))) { main.innerHTML = `<div class="empty">You can't edit this recipe.</div>`; return; }
  editing = id;
  if (!localStorage.getItem(draftKey())) localStorage.setItem(draftKey(), JSON.stringify(recipeToDraft(r)));
  renderSubmit();
}

function draftToRecipe(d, id) {
  const neurons = d.neurons.filter((n) => n.layer !== "" || n.neuron !== "" || n.dose !== "").map((n) => {
    const x = { layer: Number(n.layer), neuron: Number(n.neuron), dose: Number(n.dose) };
    if (n.expert !== undefined && n.expert !== "") x.expert = Number(n.expert);
    return x;
  });
  const u = store.user();
  const r = {
    id, name: d.name.trim(), description: d.description.trim(), model: d.model.trim(), neurons,
    tags: d.tags, examples: d.examples.filter((e) => e.prompt.trim() || e.output.trim()).map((e) => {
      // examples are stored exactly as written (whitespace included): they're the evidence
      const o = { prompt: e.prompt, output: e.output };
      if (e.base_output && e.base_output.trim()) o.base_output = e.base_output;
      return o;
    }),
    author: { handle: u ? u.handle : "anonymous", ...(u && u.url ? { url: u.url } : {}) },
    date: new Date().toISOString().slice(0, 10),
  };
  if (d.op === "mul") r.method = { op: "mul" };
  const sampling = {};
  if (String(d.rep).trim() !== "" && Number(d.rep) !== 1) sampling.repetition_penalty = Number(d.rep);
  if (String(d.temp).trim() !== "") sampling.temperature = Number(d.temp);
  if (Object.keys(sampling).length) r.sampling = sampling;
  if (d.source.trim()) r.source = d.source.trim();
  if (d.notes.trim()) r.notes = d.notes.trim();
  const pts = (d.curve || "").trim() ? parseCurve(d.curve) : null;
  if (pts && (d.curve_metric || "").trim()) r.dose_curve = { metric: d.curve_metric.trim(), points: pts };
  return r;
}

function validate(d) {
  const errs = {};
  if (!d.name.trim()) errs.name = "required";
  else if (d.name.length > 80) errs.name = "80 characters max";
  if (!d.description.trim()) errs.description = "required";
  else if (d.description.length > 600) errs.description = "600 characters max";
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(d.model.trim())) errs.model = "a Hugging Face id like Qwen/Qwen3.5-4B";
  if (!d.tags.length) errs.tags = "at least one";
  const rows = d.neurons.filter((n) => n.layer !== "" || n.neuron !== "" || n.dose !== "");
  if (!rows.length) errs.neurons = "at least one neuron";
  else if (rows.some((n) => !/^\d+$/.test(String(n.layer)) || !/^\d+$/.test(String(n.neuron)) || !Number.isFinite(Number(n.dose)) || String(n.dose).trim() === ""))
    errs.neurons = "layer and neuron are whole numbers, dose a number";
  else {
    const keys = rows.map((n) => `${n.layer}:${n.expert ?? ""}:${n.neuron}`);
    if (new Set(keys).size !== keys.length) errs.neurons = "a neuron appears twice";
  }
  if (String(d.rep).trim() !== "" && !(Number(d.rep) >= 1 && Number(d.rep) <= 3)) errs.sampling = "rep pen between 1 and 3";
  if (String(d.temp).trim() !== "" && !(Number(d.temp) >= 0 && Number(d.temp) <= 5)) errs.sampling = "temperature between 0 and 5";
  const ex = d.examples.filter((e) => e.prompt.trim() || e.output.trim());
  if ((d.curve || "").trim() || (d.curve_metric || "").trim()) {
    const pts = parseCurve(d.curve || "");
    if (!(d.curve_metric || "").trim()) errs.curve = "name what you measured, e.g. meows per answer";
    else if (!pts || pts.length < 2) errs.curve = "at least two dose:value pairs, like 0:0, 0.5:13, 0.8:20";
    else if (pts.length > 24) errs.curve = "24 points max";
  }
  if (!ex.length) errs.examples = "at least one example";
  else if (ex.some((e) => !e.prompt.trim() || !e.output.trim())) errs.examples = "each example needs a prompt and the steered output";
  return errs;
}

// Publishes an array of recipes one by one, showing each one's result. Invalid ones are skipped with the reason.
async function renderBatch(list) {
  const gen = ++submitGen;
  const items = list.map((o, i) => {
    const d = { ...emptyDraft(), ...(o && Array.isArray(o.neurons) ? recipeToDraft({ name: "", description: "", tags: [], examples: [], model: "Qwen/Qwen3.5-4B", ...o }) : {}) };
    const errs = o && Array.isArray(o.neurons) ? validate(d) : { file: "not a recipe" };
    return { i, name: (o && o.name) || `#${i + 1}`, d, errs: Object.entries(errs).map(([k, v]) => `${k}: ${v}`) };
  });
  const ok = items.filter((x) => !x.errs.length);
  main.innerHTML = `<div class="submit"><div class="panel batch">
    <h1>Import ${items.length} recipe${items.length === 1 ? "" : "s"}</h1>
    <p class="dim">${ok.length} ready${items.length - ok.length ? `, ${items.length - ok.length} with problems (skipped)` : ""}. Each one is published under your name and goes through moderation like any other.</p>
    <ol class="blist">${items.map((x) => `<li data-bi="${x.i}"><span class="bn">${esc(x.name)}</span><span class="bs ${x.errs.length ? "err" : "dim"}">${x.errs.length ? esc(x.errs.join("; ")) : "ready"}</span></li>`).join("")}</ol>
    ${store.mode === "supabase" ? `<label class="chk"><input type="checkbox" data-bdraft> save as drafts (only you see them; publish each when you've checked it)</label>` : ""}
    <div class="pub"><button class="btn primary" data-bgo ${ok.length ? "" : "disabled"}>Publish ${ok.length}</button><button class="btn" data-bcancel>Back to the form</button></div>
    <p class="dim quota" data-bsum role="status"></p>
  </div></div>`;
  $("[data-bcancel]").onclick = () => renderSubmit();
  const bd = $("[data-bdraft]");
  if (bd) bd.onchange = () => { $("[data-bgo]").textContent = `${bd.checked ? "Save" : "Publish"} ${ok.length}${bd.checked ? " as drafts" : ""}`; };
  $("[data-bgo]").onclick = async (e) => {
    if (!signedIn() && store.mode === "supabase") return signInPrompt("publish");
    const go = e.currentTarget; go.disabled = true;
    $("[data-bcancel]").disabled = true;
    let done = 0, failed = 0;
    for (const x of ok) {
      if (gen !== submitGen) return;
      const st = $(`[data-bi="${x.i}"] .bs`);
      st.className = "bs dim"; st.textContent = "publishing…";
      try {
        const id = await store.submit(draftToRecipe(x.d, "new"), { draft: !!$("[data-bdraft]")?.checked });
        st.innerHTML = `<a href="/r/${esc(id)}">published</a>`; done++;
      } catch (err) {
        st.className = "bs err"; st.textContent = errText(err); failed++;
        if (/rate limit/.test(String(err.message || err))) break;
      }
      go.textContent = `Published ${done} of ${ok.length}`;
    }
    RECIPES = await store.list();
    $("[data-bsum]").textContent = `Done: ${done} published${failed ? `, ${failed} failed` : ""}.`;
    $("[data-bcancel]").disabled = false;
    $("[data-bcancel]").textContent = "Back to the form";
  };
}

function flashOk(text) {
  const m = document.createElement("div");
  m.className = "okflash"; m.setAttribute("role", "status"); m.textContent = text;
  document.body.appendChild(m);
  setTimeout(() => m.remove(), 4000);
}

let submitGen = 0;
function renderSubmit() {
  const gen = ++submitGen;
  const live = () => gen === submitGen; // handlers on a replaced form (blur during re-render) must do nothing
  const d = loadDraft();
  const u = store.user();
  const tc = tagCounts();
  const models = [...new Set(["Qwen/Qwen3.5-4B", ...RECIPES.map((r) => r.model)])];

  main.innerHTML = `<div class="submit">
    <div class="panel">
      <div class="subhead"><h1>${editing ? "Edit recipe" : "New recipe"}</h1>${editing ? "" : `<label class="btn sbtn importbtn"><span>Import JSON</span><input type="file" accept=".json,application/json" data-importfile hidden></label>`}</div>
      ${editing ? "" : `<p class="dim importnote">Import a recipe file, a Neuron Studio export, or a JSON array of recipes to publish as a batch.</p>`}
      ${!editing && store.mode === "supabase" && !signedIn() ? `<div class="signnote"><span>Sign in to publish. Your draft is kept while you do.</span><button class="btn sbtn" data-signin-top>Sign in</button></div>` : ""}
      <label class="f" data-f="name"><span>name</span><input data-k="name" value="${esc(d.name)}" maxlength="80"></label>
      <label class="f" data-f="description"><span>description</span><textarea data-k="description" maxlength="600">${esc(d.description)}</textarea></label>
      <div class="f" data-f="tags"><span id="lab-tags">tags</span><div class="tagin" data-tagin><span class="chips" data-chips></span>
        <input data-tagtext aria-labelledby="lab-tags" placeholder="persona, style, …" autocomplete="off"><div class="suggest" data-tagsug hidden></div></div></div>
      <label class="f" data-f="model"><span>model</span><input data-k="model" value="${esc(d.model)}" list="models" spellcheck="false" class="mono">
        <datalist id="models">${models.map((m) => `<option value="${esc(m)}">`).join("")}</datalist></label>
      <div class="f" data-f="neurons"><span>neurons</span>
        <input data-paste aria-label="paste a recipe string" aria-describedby="pastehint" placeholder="paste: L13N7956-1.0 L14N8949+1.0, then Enter" class="mono" spellcheck="false" style="width:100%">
        <div class="dim pastehint" id="pastehint" data-pastehint aria-live="polite"></div>
        <div class="nrows" data-nrows></div>
        <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap"><button class="addlink" data-addn>+ neuron</button>
        <span class="seg" data-op role="group" aria-label="method"><button class="${d.op !== "mul" ? "on" : ""}" data-op-v="add">add</button><button class="${d.op === "mul" ? "on" : ""}" data-op-v="mul">multiply</button></span></div>
      </div>
      <div class="f" data-f="sampling"><span>recommended sampling <span class="faint">optional</span></span>
        <div style="display:flex;gap:8px">
          <input data-k="rep" aria-label="repetition penalty" value="${esc(d.rep)}" placeholder="rep pen, e.g. 1.1" inputmode="decimal" class="mono" style="flex:1">
          <input data-k="temp" aria-label="temperature" value="${esc(d.temp)}" placeholder="temperature (0 = greedy)" inputmode="decimal" class="mono" style="flex:1">
        </div></div>
      <label class="f"><span>source link</span><input data-k="source" value="${esc(d.source)}" placeholder="https://x.com/…" spellcheck="false"></label>
      <label class="f"><span>notes</span><textarea data-k="notes" placeholder="how you found it, what breaks it, doses that also work">${esc(d.notes)}</textarea></label>
      <div class="f" data-f="curve"><span>dose curve <span class="faint">optional: what you measured at a few doses</span></span>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <input data-k="curve_metric" aria-label="dose curve: what was measured" value="${esc(d.curve_metric || "")}" placeholder="meows per answer" style="flex:1 1 160px">
          <input data-k="curve" aria-label="dose curve: dose:value pairs" value="${esc(d.curve || "")}" placeholder="0:0, 0.5:13, 0.8:20, 1.0:24" class="mono" spellcheck="false" style="flex:2 1 220px">
        </div></div>
    </div>
    <div class="panel">
      <h2>Examples<span class="faint">at least one</span></h2>
      <div class="exs">${d.examples.map((e, i) => `<div class="exf" data-ei="${i}">
        <div class="h"><span>${i + 1}</span>${d.examples.length > 1 ? `<button class="dim" data-rmex="${i}">remove</button>` : ""}</div>
        <label class="f"><span>prompt</span><input data-e="prompt" value="${esc(e.prompt)}"></label>
        <label class="f"><span>steered output</span><textarea class="o" data-e="output">${esc(e.output)}</textarea></label>
        <label class="f"><span>base output <span class="faint">optional, the unsteered reply</span></span><textarea data-e="base_output">${esc(e.base_output || "")}</textarea></label>
      </div>`).join("")}</div>
      <button class="addlink" data-addex>+ example</button>
      <div class="preview"><div class="dim" style="font-size:12px;margin-bottom:6px">recipe</div><div class="rid" data-preview></div><p class="dupe" data-dupe role="status"></p></div>
      <div data-errsum class="err"></div>
      <div class="pub" data-pub></div>
      <p class="dim quota" data-quota hidden></p>
    </div>
  </div>`;

  const save = () => localStorage.setItem(draftKey(), JSON.stringify(d));
  const refreshPreview = () => {
    const ns = d.neurons.filter((n) => n.layer !== "" && n.neuron !== "" && n.dose !== "" && Number.isFinite(Number(n.dose)))
      .map((n) => ({ layer: +n.layer, neuron: +n.neuron, dose: +n.dose }));
    $("[data-preview]").innerHTML = ns.length ? recipeHtml(ns) + edgeMark(ns, d.model) : `<span class="faint">—</span>`;
    // same neurons (any doses) already posted?
    const k = ns.map(neuronKey).sort().join(" ");
    const same = k ? RECIPES.filter((x) => x.id !== editing && x.model === d.model.trim() && x.neurons.map(neuronKey).sort().join(" ") === k) : [];
    $("[data-dupe]").innerHTML = same.length ? `Already posted with these neurons: ${same.slice(0, 3).map((x) => `<a href="/r/${esc(x.id)}" target="_blank">${esc(x.name)}</a> by @${esc(x.author.handle)}`).join(", ")}${same.length > 3 ? ` and ${same.length - 3} more` : ""}. Post anyway if yours differs (doses, effect), or add an example there.` : "";
  };
  const showErrs = (errs, all) => {
    $$(".f[data-f]").forEach((f) => {
      const k = f.dataset.f;
      f.classList.toggle("bad", !!(all && errs[k]));
      let e = $(":scope > .err", f);
      if (all && errs[k]) { if (!e) { e = document.createElement("div"); e.className = "err"; e.setAttribute("role", "alert"); f.appendChild(e); } e.textContent = errs[k]; }
      else if (e) e.remove();
      $$("input, textarea", f).forEach((x) => x.toggleAttribute("aria-invalid", !!(all && errs[k])));
    });
    $("[data-errsum]").textContent = all && errs.examples ? errs.examples : "";
  };

  $$("[data-k]").forEach((el) => (el.oninput = () => { d[el.dataset.k] = el.value; save(); }));
  // Neuron rows and tag chips re-render on their own; the rest of the form (and any input you hold) stays put.
  const nrows = $("[data-nrows]");
  const renderNeurons = () => {
    nrows.innerHTML = d.neurons.map((n, i) => `<div class="nr" data-i="${i}">
      <input data-n="layer" aria-label="neuron ${i + 1} layer" value="${esc(n.layer)}" placeholder="layer" inputmode="numeric">
      <input data-n="neuron" aria-label="neuron ${i + 1} index" value="${esc(n.neuron)}" placeholder="neuron" inputmode="numeric">
      <input data-n="dose" aria-label="neuron ${i + 1} dose" value="${esc(n.dose)}" placeholder="dose" inputmode="decimal" class="${Number(n.dose) > 0 ? "up" : Number(n.dose) < 0 ? "down" : ""}">
      <button class="x" data-rmn="${i}" aria-label="remove neuron ${i + 1}">×</button></div>`).join("");
    $$(".nr", nrows).forEach((row) => $$("[data-n]", row).forEach((el) => (el.oninput = () => {
      d.neurons[+row.dataset.i][el.dataset.n] = el.value.trim();
      if (el.dataset.n === "dose") el.className = Number(el.value) > 0 ? "up" : Number(el.value) < 0 ? "down" : "";
      save(); refreshPreview();
    })));
    $$("[data-rmn]", nrows).forEach((b) => (b.onclick = () => { d.neurons.splice(+b.dataset.rmn, 1); if (!d.neurons.length) d.neurons.push({ layer: "", neuron: "", dose: "" }); save(); renderNeurons(); }));
    refreshPreview();
  };
  renderNeurons();
  $("[data-addn]").onclick = () => { d.neurons.push({ layer: "", neuron: "", dose: "" }); save(); renderNeurons(); $$(".nr input", nrows)[d.neurons.length * 3 - 3].focus(); };
  $$("[data-op-v]").forEach((b) => (b.onclick = () => { d.op = b.dataset.opV; save(); $$("[data-op-v]").forEach((x) => x.classList.toggle("on", x === b)); }));
  const pasteIn = $("[data-paste]");
  const takePaste = (text) => {
    if (!live()) return;
    const ns = parseRecipeStr(text).filter((n) => Number.isFinite(n.dose));
    if (!ns.length) return;
    d.neurons = ns.map((n) => ({ layer: String(n.layer), neuron: String(n.neuron), dose: String(n.dose), ...(n.expert != null ? { expert: String(n.expert) } : {}) }));
    pasteIn.value = ""; if (pasteHint) pasteHint.textContent = "";
    save(); renderNeurons();
  };
  pasteIn.onpaste = (e) => { e.preventDefault(); takePaste(e.clipboardData.getData("text")); };
  const pasteHint = $("[data-pastehint]");
  pasteIn.oninput = () => {
    const ns = parseRecipeStr(pasteIn.value).filter((n) => Number.isFinite(n.dose));
    pasteHint.textContent = !pasteIn.value.trim() ? "" : ns.length
      ? `${ns.length} neuron${ns.length > 1 ? "s" : ""} (${ns.map(neuronStr).join(" ")}). Press Enter to use ${ns.length > 1 ? "them" : "it"}; this replaces the rows below.`
      : "Keep typing: like L13N7956-1.0 (layer, neuron, signed dose).";
  };
  pasteIn.onchange = () => takePaste(pasteIn.value);
  pasteIn.onkeydown = (e) => { if (e.key === "Enter") { e.preventDefault(); takePaste(pasteIn.value); } };
  $$(".exf").forEach((f) => $$("[data-e]", f).forEach((el) => (el.oninput = () => { d.examples[+f.dataset.ei][el.dataset.e] = el.value; save(); })));
  $$("[data-rmex]").forEach((b) => (b.onclick = () => { d.examples.splice(+b.dataset.rmex, 1); save(); renderSubmit(); }));
  $("[data-addex]").onclick = () => { d.examples.push({ prompt: "", output: "", base_output: "" }); save(); renderSubmit(); };

  // tags
  const tin = $("[data-tagtext]");
  const tsug = $("[data-tagsug]");
  const chips = $("[data-chips]");
  const renderChips = () => {
    chips.innerHTML = d.tags.map((t) => `<span class="tag">${esc(t)}<button data-rmtag="${esc(t)}" aria-label="remove tag ${esc(t)}">×</button></span>`).join("");
    $$("[data-rmtag]", chips).forEach((b) => (b.onclick = (e) => { e.preventDefault(); d.tags = d.tags.filter((t) => t !== b.dataset.rmtag); save(); renderChips(); }));
    tin.placeholder = d.tags.length ? "" : "persona, style, …";
  };
  // "a, b, c" adds three tags
  const addTag = (text, refocus = true) => {
    if (!live()) return;
    for (let t of String(text).split(",")) {
      t = slugify(t).slice(0, 32);
      if (t && !d.tags.includes(t) && d.tags.length < 12) d.tags.push(t);
    }
    tin.value = ""; tsug.hidden = true;
    save(); renderChips(); if (refocus) tin.focus();
  };
  renderChips();
  tin.oninput = () => {
    if (tin.value.includes(",")) { const parts = tin.value.split(","); const rest = parts.pop(); addTag(parts.join(",")); tin.value = rest.trimStart(); }
    const s = slugify(tin.value);
    const opts = Object.keys(tc).filter((t) => t.includes(s) && !d.tags.includes(t)).sort((a, b) => tc[b] - tc[a]).slice(0, 6);
    tsug.hidden = !tin.value.trim() || !opts.length;
    tsug.innerHTML = opts.map((t) => `<div class="row" data-t="${esc(t)}"><span class="kind">tag</span><span>${esc(t)}</span><span class="n">${tc[t]}</span></div>`).join("");
  };
  tin.onkeydown = (e) => {
    if ((e.key === "Enter" || e.key === ",") && tin.value.trim()) { e.preventDefault(); addTag(tin.value); }
    if (e.key === "Backspace" && !tin.value && d.tags.length) { d.tags.pop(); save(); renderChips(); }
  };
  tin.onblur = () => setTimeout(() => { tsug.hidden = true; if (tin.value.trim()) addTag(tin.value, false); }, 150);
  tsug.onmousedown = (e) => { const row = e.target.closest("[data-t]"); if (row) { e.preventDefault(); tin.value = ""; addTag(row.dataset.t); } };

  // import: one recipe (or a Neuron Studio export) fills the form; an array publishes as a batch
  const importText = (text) => {
    let o;
    try { o = JSON.parse(text); } catch { return flashError(new Error("That file isn't JSON.")); }
    const list = Array.isArray(o) ? o : Array.isArray(o && o.recipes) ? o.recipes : null;
    if (list) return renderBatch(list);
    const st = fromStudio(o);
    const src = st || (Array.isArray(o.neurons) ? o : null);
    if (!src) return flashError(new Error("Not a recipe, a recipe array, or a Neuron Studio file."));
    d.neurons = src.neurons.map((n) => ({ layer: String(n.layer), neuron: String(n.neuron), dose: String(n.dose), ...(n.expert != null ? { expert: String(n.expert) } : {}) }));
    if (src.model) d.model = src.model;
    d.op = src.method && src.method.op === "mul" ? "mul" : "add";
    if (!st) {
      for (const k of ["name", "description", "source", "notes"]) if (o[k]) d[k] = o[k];
      if (o.sampling) { d.rep = o.sampling.repetition_penalty ?? ""; d.temp = o.sampling.temperature ?? ""; }
      if (Array.isArray(o.tags)) d.tags = o.tags;
      if (Array.isArray(o.examples) && o.examples.length) d.examples = o.examples.map((e) => ({ prompt: e.prompt || "", output: e.output || "", base_output: e.base_output || "" }));
    }
    save(); renderSubmit();
  };
  const fileIn = $("[data-importfile]");
  if (fileIn) fileIn.onchange = () => { const f = fileIn.files[0]; fileIn.value = ""; if (f) f.text().then(importText); };

  // how many recipes are left today
  const quotaEl = $("[data-quota]");
  if (!editing && store.quota && signedIn()) store.quota().then((q) => {
    if (!live() || !q || q.limit == null) return;
    const left = Math.max(0, q.limit - q.used);
    quotaEl.textContent = left ? `${left} of ${q.limit} left today.` : errText(new Error(`rate limit: ${q.limit} recipes a day${q.next_at ? "; next one at " + q.next_at : ""}`)).replace(" Your draft is saved.", "");
    quotaEl.hidden = false;
  });

  // publish slot
  const pub = $("[data-pub]");
  const ghNew = (r) => `https://github.com/${CFG.repo}/new/${CFG.branch || "main"}?filename=${encodeURIComponent(`recipes/${r.id}.json`)}&value=${encodeURIComponent(recipeJson(r))}`;
  const ghIssue = (r) => `https://github.com/${CFG.repo}/issues/new?template=recipe.yml&title=${encodeURIComponent("recipe: " + r.name)}&recipe=${encodeURIComponent(recipeJson(r))}`;
  const draftId = () => "new"; // the store assigns the real id
  const ready = async () => {
    const errs = validate(d);
    showErrs(errs, true);
    if (Object.keys(errs).length) { const f = $(".f.bad input, .f.bad textarea"); if (f) f.focus(); return null; }
    if (editing) {
      const r = draftToRecipe(d, editing);
      const o = d._orig || {};
      // keep fields the form doesn't show (method details, conditional, aliases, per-example metadata)
      if (o.method && r.method === undefined && (!o.method.op || o.method.op === "add")) r.method = o.method;
      if (o.method && r.method) r.method = { ...o.method, op: r.method.op };
      if (o.conditional) r.conditional = o.conditional;
      if (o.aliases && o.aliases.length) r.aliases = o.aliases;
      if (o.sampling) r.sampling = { ...o.sampling, ...(r.sampling || {}) };
      if (o.sampling && !d.rep && o.sampling.repetition_penalty) delete r.sampling.repetition_penalty;
      if (o.sampling && d.temp === "" && o.sampling.temperature != null) delete r.sampling.temperature;
      if (r.sampling && !Object.keys(r.sampling).length) delete r.sampling;
      r.examples = r.examples.map((e) => ({ ...((o.examples || []).find((x) => x.prompt === e.prompt && x.output === e.output) || {}), ...e }));
      return r;
    }
    return draftToRecipe(d, draftId());
  };

  if (editing) {
    pub.innerHTML = `<button class="btn primary" data-save>Save changes</button><button class="btn" data-discard>Cancel</button>`;
  } else if (store.mode === "supabase") {
    pub.innerHTML = signedIn() ? `<button class="btn primary" data-publish>Publish</button><button class="btn" data-savedraft title="only you can see it until you publish">Save as draft</button><span class="dim">as @${esc(u.handle)}</span>`
      : `<button class="btn primary" data-signin>Sign in to publish</button>`;
  } else {
    pub.innerHTML = `${CFG.repo ? `<button class="btn primary" data-pr>Open pull request</button><button class="btn" data-issue>Open issue</button>` : ""}
      <button class="btn ${CFG.repo ? "" : "primary"}" data-publish>Publish in this browser</button><button class="btn" data-dl>Download JSON</button>`;
  }
  const bind = (sel, f) => { const b = $(sel, pub); if (b) b.onclick = f; };
  // errors stay next to the button until the next attempt
  const pubErr = (t) => {
    let el = $("[data-puberr]", pub.parentNode);
    if (!el) { el = document.createElement("p"); el.className = "err puberr"; el.dataset.puberr = ""; el.setAttribute("role", "alert"); pub.after(el); }
    el.textContent = t; el.hidden = !t;
  };
  bind("[data-signin]", () => signInPrompt("publish"));
  const st = $("[data-signin-top]");
  if (st) st.onclick = (e) => { e.stopPropagation(); signInPrompt("publish"); };
  bind("[data-savedraft]", async (e) => {
    const b = e.currentTarget;
    const r = await ready();
    if (!r) return;
    b.disabled = true; b.textContent = "Saving…";
    pubErr("");
    try {
      const id = await store.submit(r, { draft: true });
      localStorage.removeItem(DRAFT_KEY);
      RECIPES = await store.list();
      editorOpen = false;
      go("/r/" + id);
      flashOk(`Saved “${r.name}” as a draft. Only you can see it.`);
    } catch (err) { console.error(err); b.disabled = false; b.textContent = "Save as draft"; pubErr(errText(err)); }
  });
  bind("[data-publish]", async (e) => {
    const b = e.currentTarget;
    if (!signedIn()) return signInPrompt("publish");
    const r = await ready();
    if (!r) return;
    b.disabled = true; b.textContent = "Publishing…";
    pubErr("");
    try {
      const id = await store.submit(r);
      localStorage.removeItem(DRAFT_KEY);
      RECIPES = await store.list();
      editorOpen = false;
      go("/r/" + id);
      flashOk(`Published “${r.name}”.`);
    } catch (err) {
      console.error(err);
      b.disabled = false; b.textContent = "Publish";
      pubErr(errText(err));
    }
  });
  bind("[data-save]", async (e) => {
    const b = e.currentTarget;
    const r = await ready();
    if (!r) return;
    b.disabled = true; b.textContent = "Saving…";
    pubErr("");
    try {
      await store.update(editing, r);
      localStorage.removeItem(draftKey());
      const id = editing;
      editing = null;
      editorOpen = false;
      RECIPES = await store.list();
      go("/r/" + id);
    } catch (err) { console.error(err); b.disabled = false; b.textContent = "Save changes"; pubErr(errText(err)); }
  });
  bind("[data-discard]", () => { localStorage.removeItem(draftKey()); editing = null; closeEditor(); });
  bind("[data-pr]", async () => { const r = await ready(); if (r) window.open(ghNew(r), "_blank", "noopener"); });
  bind("[data-issue]", async () => { const r = await ready(); if (r) window.open(ghIssue(r), "_blank", "noopener"); });
  bind("[data-dl]", async () => { const r = await ready(); if (r) download(`${r.id}.json`, recipeJson(r)); });
  refreshPreview();
}

// ------------------------------------------------------------------ boot
async function boot() {
  // first paint from the last list this browser saw, then swap in the fresh one
  let fresh = null, fromCache = false;
  try {
    store = await createStore(CFG);
    const cached = store.cached ? store.cached() : null;
    fresh = store.list();
    if (cached && cached.length) { RECIPES = cached; fromCache = true; fresh.catch((e) => console.error(e)); }
    else RECIPES = await fresh;
  } catch (e) {
    main.innerHTML = `<div class="empty err" role="alert">Couldn't load recipes: ${esc(e.message)}</div>`;
    return;
  }
  renderMe();
  store.onAuth(async () => {
    renderMe();
    RECIPES = await store.list();
    if (editorOpen) renderSubmit(); else route(); // signing in mid-form keeps you in the form
  });
  // an old-style #/ link followed inside the page
  window.addEventListener("hashchange", () => { if (location.hash.startsWith("#/")) { history.replaceState(null, "", location.hash.slice(1) || "/"); route(); } });
  await route();
  if (fromCache) fresh.then((rs) => {
    RECIPES = rs;
    // redraw the list underneath unless someone's mid-form
    const lr = parseHash(lastListHash);
    if (editorOpen || !listShown || lr.view !== "browse") return;
    renderBrowse(lr.p);
  }).catch(() => {});
  // back from an X sign-in started in the submit form: reopen it (the draft is in localStorage)
  const reopen = sessionStorage.getItem("nr.reopenSubmit");
  sessionStorage.removeItem("nr.reopenSubmit");
  if (reopen && store.returnedFromOAuth && signedIn()) openEditor();
}
boot();

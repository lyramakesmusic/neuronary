// Recipe id strings, snippets, small DOM helpers.

export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

// full precision as stored (0.525 stays 0.525), at least one decimal (1 -> +1.0); the copied string is the tested recipe
export function doseStr(d) {
  let s = (d >= 0 ? "+" : "-") + String(Math.abs(d));
  if (!s.includes(".") && !s.includes("e")) s += ".0";
  return s;
}


// L13N7956 / L9N302 / L11E11N1234 (no zero padding; parsing accepts padded ids too)
export const neuronKey = (n) => `L${n.layer}${n.expert != null ? "E" + n.expert : ""}N${n.neuron}`;
export const neuronStr = (n) => neuronKey(n) + doseStr(n.dose);
export const sortNeurons = (ns) => [...ns].sort((a, b) => a.layer - b.layer || (a.expert ?? -1) - (b.expert ?? -1) || a.neuron - b.neuron);
export const recipeStr = (ns) => sortNeurons(ns).map(neuronStr).join(" ");
// identity of a neuron set regardless of doses' order: used to group "also known as"
export const setKey = (ns) => sortNeurons(ns).map(neuronStr).join(" ");

// Layer counts for the models on the site, so neurons near either end can carry a warning.
export const MODEL_LAYERS = { "Qwen/Qwen3.5-4B": 32 };
const EDGE = 5;
// "early" / "late" / null: neurons in the first or last EDGE layers tend to act on literal words, not concepts
export function edgeLayer(n, model) {
  if (n.layer < EDGE) return "early";
  const L = MODEL_LAYERS[String(model || "").trim()];
  return L && n.layer >= L - EDGE ? "late" : null;
}
const EDGE_WHY = {
  early: "the first ~5 layers often act on surface text, so pushes can come out word-literal (a token, a spelling) " +
    "rather than a persona or concept. Plenty don't: check the examples. The residual is small there too, so doses hit harder.",
  late: "the last ~5 layers sit close to the output and often push specific words, so effects can be word-literal " +
    "rather than a persona or concept. Plenty don't: check the examples.",
};
// one warning per kind (early, late), however many neurons fall in it
export function edgeTips(ns, model) {
  const by = { early: [], late: [] };
  for (const n of sortNeurons(ns)) { const e = edgeLayer(n, model); if (e) by[e].push(neuronKey(n)); }
  return ["early", "late"].filter((k) => by[k].length).map((k) =>
    `${k === "early" ? "Early" : "Late"} layer${by[k].length > 1 ? "s" : ""} (${by[k].join(", ")}). Neurons in ${EDGE_WHY[k]}`);
}
export const INFO_ICON = `<svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="7" fill="currentColor"/><path d="M8 7.3v4.2" stroke="var(--bg)" stroke-width="1.8" stroke-linecap="round"/><circle cx="8" cy="4.6" r="1.05" fill="var(--bg)"/></svg>`;
// yellow info marks with the warning on hover: one for early layers, one for late; empty when neither
export function edgeMark(ns, model) {
  const ts = edgeTips(ns, model);
  return ts.length ? `<span class="edges">${ts.map((t) => `<span class="edge" data-tip="${esc(t)}" aria-label="${esc(t)}" role="img">${INFO_ICON}</span>`).join("")}</span>` : "";
}

export function neuronHtml(n) {
  const d = n.dose;
  // one unbreakable unit per neuron, so a long recipe wraps between neurons, never inside one
  return `<span class="nk"><span class="k"><span class="ly">L${n.layer}</span>${n.expert != null ? "E" + n.expert : ""}N${n.neuron}</span><span class="d ${d >= 0 ? "up" : "down"}">${doseStr(d)}</span></span>`;
}
// max: show that many, then "+N more" (cards); the full list lives on the recipe page
export const recipeHtml = (ns, max = Infinity) => {
  const all = sortNeurons(ns);
  const shown = all.length > max ? all.slice(0, max - 1) : all;
  return shown.map(neuronHtml).join(" ") + (shown.length < all.length ? ` <span class="nmore">+${all.length - shown.length} more</span>` : "");
};

// Parses "L13N7956-1.0 L14N8949+1" and the looser "L13 N7956 -1", "l14n8949 +0.5", "L11E11N1234+0.6".
export function parseRecipeStr(s) {
  const out = [];
  const re = /L\s*(\d+)\s*(?:E\s*(\d+)\s*)?N\s*(\d+)\s*([+-]\s*\d*\.?\d+)?/gi;
  let m;
  while ((m = re.exec(s))) {
    const n = { layer: +m[1], neuron: +m[3], dose: m[4] != null ? parseFloat(m[4].replace(/\s+/g, "")) : NaN };
    if (m[2] != null) n.expert = +m[2];
    out.push(n);
  }
  return out;
}

// "L14N8949", "L14 N8949", "l14n8949" -> {layer, neuron}; used by search
export function parseNeuronQuery(s) {
  const m = /^\s*L\s*(\d+)\s*(?:E\s*(\d+)\s*)?N\s*(\d+)\s*$/i.exec(s);
  return m ? { layer: +m[1], expert: m[2] != null ? +m[2] : null, neuron: +m[3] } : null;
}

export const DEFAULT_METHOD = { op: "add", site: "mlp.down_proj.input", normalization: "layer_residual_median_over_down_column_l2", apply_to: "all_tokens" };
export const methodOf = (r) => ({ ...DEFAULT_METHOD, ...(r.method || {}) });

// The canonical file contents for recipes/<id>.json: drops site-only fields.
export function recipeFile(r) {
  const keep = ["id", "name", "description", "model", "neurons", "method", "sampling", "conditional", "tags", "examples", "aliases", "author", "source", "date", "notes"];
  const o = {};
  for (const k of keep) if (r[k] != null && !(Array.isArray(r[k]) && !r[k].length && k === "aliases")) o[k] = r[k];
  o.neurons = sortNeurons(o.neurons).map((n) => {
    const x = { layer: n.layer };
    if (n.expert != null) x.expert = n.expert;
    x.neuron = n.neuron;
    x.dose = n.dose;
    return x;
  });
  return o;
}
export const recipeJson = (r) => JSON.stringify(recipeFile(r), null, 2) + "\n";

export function samplingText(r) {
  const s = r.sampling || {};
  const parts = [];
  if (s.repetition_penalty) parts.push(`rep pen ${s.repetition_penalty}`);
  if (s.temperature != null) parts.push(s.temperature ? `temp ${s.temperature}` : "greedy");
  if (s.top_p) parts.push(`top-p ${s.top_p}`);
  if (s.top_k) parts.push(`top-k ${s.top_k}`);
  if (s.thinking) parts.push("thinking on");
  return parts.join(" · ");
}

// Everything recipe-controlled that goes into the Python script is a validated number or a JSON-quoted string, so a
// crafted recipe can't put code into a script people run on their machines.
const pyNum = (x) => (typeof x === "number" && Number.isFinite(x) ? String(x) : null);
const pyInt = (x) => (Number.isInteger(x) && x >= 0 ? String(x) : null);
const oneLine = (s) => String(s ?? "").replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]+/g, " ").slice(0, 200);
function genArgs(r) {
  const s = r.sampling || {};
  const a = [];
  const t = pyNum(s.temperature), tp = pyNum(s.top_p), tk = pyInt(s.top_k), rp = pyNum(s.repetition_penalty);
  if (t && +t > 0) a.push("do_sample=True", `temperature=${t}`);
  else a.push("do_sample=False");
  if (t && +t > 0 && tp) a.push(`top_p=${tp}`);
  if (t && +t > 0 && tk) a.push(`top_k=${tk}`);
  if (rp) a.push(`repetition_penalty=${rp}`);
  return a.join(", ") + ", ";
}

// Published per-layer median residual norms (norms/*.json, measured once by scripts/norms.py): the snippet uses these
// instead of measuring at run time, so a dose means the same thing everywhere.
export const NORMS = { "Qwen/Qwen3.5-4B": [2.3158, 2.9803, 2.9597, 4.3864, 5.0908, 6.1972, 7.1642, 7.2929, 7.8355, 8.3318, 9.2452, 9.1403, 9.267, 9.7441, 10.3534, 10.6444, 10.9506, 11.8499, 13.8992, 16.2707, 18.0496, 20.4401, 24.8439, 26.1223, 29.2717, 31.9403, 35.2483, 36.898, 42.789, 46.8283, 52.7007, 66.7154] };

export function pythonSnippet(r) {
  const m = methodOf(r);
  // the script implements add/mul on all tokens with neuronary's units; say so when a recipe uses something else
  const off = [m.apply_to !== "all_tokens" ? `applied to ${m.apply_to.replace(/_/g, " ")} only` : "",
    m.op === "add" && m.normalization !== DEFAULT_METHOD.normalization && m.normalization !== "raw" ? `doses in "${m.normalization}" units` : ""].filter(Boolean);
  const caveat = off.length ? `# NOTE: this recipe is ${off.join(", ")}; this script steers every token in neuronary units, so it only approximates it.\n` : "";
  const ns = sortNeurons(r.neurons).filter((n) => pyInt(n.layer) && pyInt(n.neuron) && pyNum(n.dose))
    .map((n) => `    (${pyInt(n.layer)}, ${pyInt(n.neuron)}, ${pyNum(n.dose)}),`).join("\n");
  const prompt = (r.examples && r.examples[0] && r.examples[0].prompt) || "Tell me about yourself.";
  const model = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(r.model) ? r.model : "Qwen/Qwen3.5-4B";
  const think = r.sampling && r.sampling.thinking === true ? "True" : "False";
  const table = NORMS[model] && r.neurons.every((n) => NORMS[model][n.layer] != null) ? NORMS[model] : null;
  const head = `# ${oneLine(r.name)}: ${recipeStr(r.neurons.filter((n) => pyInt(n.layer) && pyInt(n.neuron) && pyNum(n.dose)))}`;
  if (m.op === "mul") {
    return `${head}
${caveat}import torch
from transformers import AutoTokenizer, AutoModelForImageTextToText

MODEL = "${model}"
NEURONS = [  # (layer, neuron, factor): activation *= factor at the input of mlp.down_proj, every token
${ns}
]
tok = AutoTokenizer.from_pretrained(MODEL)
model = AutoModelForImageTextToText.from_pretrained(MODEL, dtype=torch.bfloat16, device_map="auto").eval()
layers = model.model.language_model.layers

for l, n, f in NEURONS:
    def hook(mod, inp, n=n, f=f):
        h = inp[0].clone(); h[..., n] *= f; return (h,)
    layers[l].mlp.down_proj.register_forward_pre_hook(hook)

msgs = [{"role": "user", "content": ${JSON.stringify(prompt)}}]
enc = tok.apply_chat_template(msgs, add_generation_prompt=True, enable_thinking=${think}, return_tensors="pt", return_dict=True).to(model.device)
out = model.generate(**enc, ${genArgs(r)}max_new_tokens=512)
print(tok.decode(out[0, enc["input_ids"].shape[1]:], skip_special_tokens=True))
`;
  }
  return `${head}
${caveat}# dose units: act[n] += dose * median(||resid leaving layer L||) / ||W_down[:, n]||, at the input of mlp.down_proj, every token
import torch
from transformers import AutoTokenizer, AutoModelForImageTextToText

MODEL = "${model}"
NEURONS = [  # (layer, neuron, dose)
${ns}
]
${table ? `# median ||residual leaving layer L|| from the published table (neuronary.org/norms/${model.replace("/", "__")}.json)
MEDIAN = {${[...new Set(sortNeurons(r.neurons).map((n) => n.layer))].filter((l) => table[l] != null).map((l) => `${l}: ${table[l]}`).join(", ")}}
tok = AutoTokenizer.from_pretrained(MODEL)
model = AutoModelForImageTextToText.from_pretrained(MODEL, dtype=torch.bfloat16, device_map="auto").eval()
layers = model.model.language_model.layers
med = MEDIAN
` : `CALIBRATION = (
    "The history of the region is long and varied. Farmers settled the river valley first, then traders arrived, "
    "and by the twelfth century the town had a market, a bridge, and a quarrel with its neighbours over tolls. "
    "def merge(a, b):\\n    out = []\\n    while a and b:\\n        out.append(a.pop(0) if a[0] < b[0] else b.pop(0))\\n"
    "    return out + a + b\\nShe asked me what I thought of the plan, and I told her honestly that it seemed rushed. "
)
tok = AutoTokenizer.from_pretrained(MODEL)
model = AutoModelForImageTextToText.from_pretrained(MODEL, dtype=torch.bfloat16, device_map="auto").eval()
layers = model.model.language_model.layers

# median residual norm leaving each steered layer, measured on the calibration text (tokens 1:)
med, hooks = {}, []
for l in {l for l, _, _ in NEURONS}:
    def grab(mod, inp, out, l=l):
        h = out[0] if isinstance(out, tuple) else out
        med[l] = h[0, 1:].float().norm(dim=-1).median().item()
    hooks.append(layers[l].register_forward_hook(grab))
with torch.inference_mode():
    model(**tok(CALIBRATION, return_tensors="pt").to(model.device), use_cache=False)
for h in hooks:
    h.remove()
`}
for l, n, dose in NEURONS:
    push = dose * med[l] / layers[l].mlp.down_proj.weight[:, n].float().norm().item()
    def hook(mod, inp, n=n, push=push):
        h = inp[0].clone(); h[..., n] += push; return (h,)
    layers[l].mlp.down_proj.register_forward_pre_hook(hook)

msgs = [{"role": "user", "content": ${JSON.stringify(prompt)}}]
enc = tok.apply_chat_template(msgs, add_generation_prompt=True, enable_thinking=${think}, return_tensors="pt", return_dict=True).to(model.device)
out = model.generate(**enc, ${genArgs(r)}max_new_tokens=512)
print(tok.decode(out[0, enc["input_ids"].shape[1]:], skip_special_tokens=True))
`;
}

// Neuron Studio (huggingface.co/spaces/webml-community/neuron-studio) import file. Null when the recipe can't be expressed.
export function studioFile(r) {
  const m = methodOf(r);
  if (r.model !== "Qwen/Qwen3.5-4B" || m.apply_to !== "all_tokens" || m.normalization !== DEFAULT_METHOD.normalization && m.op === "add") return null;
  if (r.neurons.length > 32 || r.neurons.some((n) => n.expert != null || n.layer > 31 || n.neuron > 9215)) return null;
  if (m.op === "add" && r.neurons.some((n) => Math.abs(n.dose) > 3)) return null;
  return {
    schemaVersion: 1,
    modelId: "Qwen/Qwen3.5-4B",
    quantization: "UD-Q4_K_XL",
    intervention: {
      site: "mlp.down_proj.input",
      normalization: "layer_residual_median_over_down_column_l2",
      applyTo: "all_tokens",
      neurons: sortNeurons(r.neurons).map((n) => ({ layer: n.layer, neuron: n.neuron, dose: n.dose, mode: m.op, enabled: true })),
    },
  };
}

// Neuron Studio export -> partial recipe
export function fromStudio(o) {
  const iv = o && o.intervention;
  if (!iv || !Array.isArray(iv.neurons)) return null;
  const neurons = iv.neurons.filter((n) => n.enabled !== false).map((n) => ({ layer: n.layer, neuron: n.neuron, dose: n.dose }));
  const op = iv.neurons.some((n) => n.mode === "mul") ? "mul" : "add";
  return { model: o.modelId || "Qwen/Qwen3.5-4B", neurons, method: op === "mul" ? { op: "mul" } : undefined };
}

export function slugify(s) {
  return String(s).toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 64) || "recipe";
}

export function ago(iso) {
  const t = Date.parse(iso);
  if (!t) return "";
  const s = (Date.now() - t) / 1000;
  if (s < 60) return "now";
  if (s < 3600) return Math.floor(s / 60) + "m";
  if (s < 86400) return Math.floor(s / 3600) + "h";
  if (s < 86400 * 30) return Math.floor(s / 86400) + "d";
  return iso.slice(0, 10);
}

export function avatarHtml(handle, url = null, cls = "") {
  const hd = String(handle || "?");
  if (url && /^https:\/\//.test(url)) {
    return `<img class="avatar ${cls}" src="${esc(url)}" alt="" loading="lazy" referrerpolicy="no-referrer">`;
  }
  const h = [...hd].reduce((a, c) => a + c.charCodeAt(0), 0) * 37 % 360;
  const letter = (hd.match(/[A-Za-z0-9]/) || ["?"])[0].toUpperCase();
  return `<span class="avatar ${cls}" style="background:hsl(${h} 30% var(--av-l,88%));color:hsl(${h} 30% var(--av-d,35%))">${esc(letter)}</span>`;
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const t = document.createElement("textarea");
    t.value = text;
    document.body.appendChild(t);
    t.select();
    const ok = document.execCommand("copy");
    t.remove();
    return ok;
  }
}

export function download(name, text) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// Minimal markdown for model outputs. Everything is HTML-escaped first, so nothing in the text can become markup
// beyond what's produced here: paragraphs and line breaks, headings, lists, quotes, fenced and inline code,
// bold/italic/strikethrough, and http(s) links.
function mdInline(s) {
  const codes = [];
  s = s.replace(/`([^`\n]+)`/g, (_, c) => `\u0000${codes.push(c) - 1}\u0000`);
  s = s
    .replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g, (_, t, u) => `<a href="${u}" target="_blank" rel="noopener nofollow">${t}</a>`)
    .replace(/\*\*([^*\n]+?)\*\*|__([^_\n]+?)__/g, (_, a, b) => `<strong>${a ?? b}</strong>`)
    .replace(/(^|[^\w*])\*([^*\n]+?)\*(?!\w)/g, "$1<em>$2</em>")
    .replace(/(^|[^\w_])_([^_\n]+?)_(?!\w)/g, "$1<em>$2</em>")
    .replace(/~~([^~\n]+?)~~/g, "<del>$1</del>");
  return s.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${codes[+i]}</code>`);
}

export function md(text) {
  const src = esc(String(text ?? "")).replace(/\r\n?/g, "\n");
  const out = [];
  const parts = src.split(/^```[^\n]*\n?/m); // alternating prose / code
  parts.forEach((part, k) => {
    if (k % 2 === 1) { out.push(`<pre><code>${part.replace(/\n$/, "")}</code></pre>`); return; }
    for (const block of part.split(/(\n{2,})/)) {
      if (/^\n+$/.test(block)) { if (block.length > 2) out.push(`<div class="mdgap" style="height:${(block.length - 2) * 1.5}em"></div>`); continue; }
      if (!block.trim()) continue;
      const lines = block.split("\n");
      const h = /^(#{1,6})\s+(.*)$/.exec(block);
      if (h && lines.length === 1) { out.push(`<p class="mdh">${mdInline(h[2])}</p>`); continue; }
      if (lines.every((l) => /^\s*[-*+]\s+/.test(l))) {
        out.push(`<ul>${lines.map((l) => `<li>${mdInline(l.replace(/^\s*[-*+]\s+/, ""))}</li>`).join("")}</ul>`); continue;
      }
      if (lines.every((l) => /^\s*\d+[.)]\s+/.test(l))) {
        out.push(`<ol>${lines.map((l) => `<li>${mdInline(l.replace(/^\s*\d+[.)]\s+/, ""))}</li>`).join("")}</ol>`); continue;
      }
      if (lines.every((l) => /^&gt;\s?/.test(l))) {
        out.push(`<blockquote>${lines.map((l) => mdInline(l.replace(/^&gt;\s?/, ""))).join("<br>")}</blockquote>`); continue;
      }
      out.push(`<p>${lines.map((l) => { const hh = /^(#{1,6})\s+(.*)$/.exec(l); return hh ? `<span class="mdh">${mdInline(hh[2])}</span>` : mdInline(l); }).join("<br>")}</p>`);
    }
  });
  return out.join("");
}

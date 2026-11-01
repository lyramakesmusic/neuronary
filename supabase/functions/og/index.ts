// Social preview card for one recipe: GET /og?id=<recipe id>  ->  1200x630 PNG
// Name, neuron chips (layer bold, dose colored) and a base -> steered line from the first example that has both.
// Hidden recipes and drafts get the generic site card. Used by the share-link Worker (cloudflare/share-worker.js).
import { ImageResponse } from "https://deno.land/x/og_edge@0.0.6/mod.ts";
import React from "https://esm.sh/react@18.2.0";
import { createClient } from "jsr:@supabase/supabase-js@2";

const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const h = React.createElement;

const FONT = "https://cdn.jsdelivr.net/fontsource/fonts";
const fonts = Promise.all([
  fetch(`${FONT}/inter@latest/latin-400-normal.ttf`).then((r) => r.arrayBuffer()),
  fetch(`${FONT}/inter@latest/latin-600-normal.ttf`).then((r) => r.arrayBuffer()),
  fetch(`${FONT}/overpass-mono@latest/latin-400-normal.ttf`).then((r) => r.arrayBuffer()),
  fetch(`${FONT}/overpass-mono@latest/latin-700-normal.ttf`).then((r) => r.arrayBuffer()),
]).then(([i4, i6, m4, m7]) => [
  { name: "Inter", data: i4, weight: 400, style: "normal" },
  { name: "Inter", data: i6, weight: 600, style: "normal" },
  { name: "Mono", data: m4, weight: 400, style: "normal" },
  { name: "Mono", data: m7, weight: 700, style: "normal" },
]);

type Neuron = { layer: number; neuron: number; dose: number; expert?: number };
const C = { bg: "#121315", ink: "#f4f4f5", dim: "#a1a1aa", faint: "#71717a", up: "#ffb547", down: "#ff4f9a", panel: "#1c1d21", line: "#2a2b30" };
const dose = (d: number) => { let s = (d >= 0 ? "+" : "-") + String(Math.abs(d)); if (!s.includes(".")) s += ".0"; return s; };
// plain text: markdown markers out, whitespace collapsed
const clip = (s: string, n: number) => { const t = String(s ?? "").replace(/(\*\*|__|`|^#+\s*)/gm, "").replace(/\s+/g, " ").trim(); return t.length > n ? t.slice(0, n - 1).trimEnd() + "…" : t; };

function mark(size: number) {
  return h("svg", { width: size, height: size * 44 / 48, viewBox: "8 8 48 44" },
    h("rect", { x: 8, y: 28, width: 48, height: 4, rx: 1, fill: C.ink }),
    h("path", { d: "M12 28V12a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4v16z", fill: C.up }),
    h("path", { d: "M34 32v16a4 4 0 0 0 4 4h10a4 4 0 0 0 4-4V32z", fill: C.down }));
}

function chip(n: Neuron) {
  return h("div", { style: { display: "flex", alignItems: "baseline", padding: "8px 16px", borderRadius: 10, background: C.panel, border: `1px solid ${C.line}`, fontFamily: "Mono", fontSize: 30, color: C.ink } },
    h("span", { style: { fontWeight: 700 } }, `L${n.layer}`),
    h("span", {}, `${n.expert != null ? "E" + n.expert : ""}N${n.neuron}`),
    h("span", { style: { color: n.dose >= 0 ? C.up : C.down } }, dose(n.dose)));
}

function panel(label: string, text: string, color: string) {
  return h("div", { style: { display: "flex", flexDirection: "column", flex: 1, padding: "18px 22px", borderRadius: 14, background: C.panel, border: `1px solid ${C.line}` } },
    h("div", { style: { fontSize: 20, color, fontWeight: 600, marginBottom: 8 } }, label),
    h("div", { style: { fontSize: 25, color: C.ink, lineHeight: 1.35 } }, text));
}

function card(r: Record<string, any> | null) {
  const head = h("div", { style: { display: "flex", alignItems: "center", gap: 14, fontSize: 30, fontWeight: 600, color: C.ink } }, mark(44), "neuronary");
  if (!r) {
    return h("div", { style: { display: "flex", flexDirection: "column", justifyContent: "center", width: "100%", height: "100%", padding: "0 90px", background: C.bg, fontFamily: "Inter" } },
      head, h("div", { style: { marginTop: 24, fontSize: 36, color: C.dim } }, "a dictionary of neuron steering recipes for language models"));
  }
  // header: logo on the left, the model it runs on, prominent, on the right
  const top = h("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between" } }, head,
    h("div", { style: { display: "flex", padding: "8px 18px", borderRadius: 10, border: `1px solid ${C.line}`, fontFamily: "Mono", fontSize: 26, color: C.dim } }, r.model));
  const ns: Neuron[] = [...r.neurons].sort((a: Neuron, b: Neuron) => a.layer - b.layer || a.neuron - b.neuron);
  // chips on one row: as many as fit in the card's width (mono 30px ~ 18px per character), the rest as "+N more"
  const chipW = (n: Neuron) => (`L${n.layer}${n.expert != null ? "E" + n.expert : ""}N${n.neuron}` + dose(n.dose)).length * 18 + 34;
  const fit: Neuron[] = [];
  let used = 0;
  for (const n of ns) {
    const w = chipW(n) + (fit.length ? 12 : 0);
    const room = 1060 - (fit.length + 1 < ns.length ? 190 : 0); // leave space for "+N more" unless this is the last one
    if (used + w > room) break;
    fit.push(n); used += w;
  }
  if (!fit.length) fit.push(ns[0]);
  const ex = (r.examples ?? []).find((e: any) => e.base_output) ?? (r.examples ?? [])[0];
  // placeholder prompts like "(prompt not shown in the source tweet)" aren't worth a line
  const prompt = ex && !/^\(.*\)$/.test(String(ex.prompt).trim()) ? clip(ex.prompt, 90) : "";
  const body = !ex ? null : ex.base_output
    ? h("div", { style: { display: "flex", gap: 18, marginTop: 26 } }, panel("base", clip(ex.base_output, 120), C.faint), panel("steered", clip(ex.output, 120), C.up))
    : h("div", { style: { display: "flex", marginTop: 26 } }, panel("steered", clip(ex.output, 220), C.up));
  // bottom padding clears the title caption X lays over the lower-left of link cards
  return h("div", { style: { display: "flex", flexDirection: "column", width: "100%", height: "100%", padding: "48px 70px 92px", background: C.bg, fontFamily: "Inter", color: C.ink } },
    top,
    h("div", { style: { marginTop: 30, fontSize: r.name.length > 34 ? 52 : 64, fontWeight: 600, lineHeight: 1.1, flexShrink: 0 } }, clip(r.name, 70)),
    h("div", { style: { display: "flex", flexWrap: "nowrap", gap: 12, marginTop: 22, flexShrink: 0 } }, ...fit.map(chip),
      ...(fit.length < ns.length ? [h("div", { style: { fontSize: 28, color: C.dim, alignSelf: "center", whiteSpace: "nowrap" } }, `+${ns.length - fit.length} more`)] : [])),
    prompt ? h("div", { style: { marginTop: 24, fontSize: 22, color: C.dim } }, `“${prompt}”`) : null,
    body,
    h("div", { style: { display: "flex", marginTop: 22, fontSize: 22, color: C.faint } }, `@${r.author_handle}`));
}

// Rendering is the expensive part, so: one render per recipe id per 10 minutes (extra query params don't matter, only
// id), unknown ids get a 404 instead of a render, and each IP gets a bucket of fresh renders per minute.
const CACHE = new Map<string, { png: Uint8Array; at: number }>();
const TTL = 10 * 60e3;
const BUCKET = new Map<string, { n: number; at: number }>();
const PER_MIN = 30;

function limited(ip: string): boolean {
  const now = Date.now(), b = BUCKET.get(ip);
  if (!b || now - b.at > 60e3) { BUCKET.set(ip, { n: 1, at: now }); if (BUCKET.size > 5000) BUCKET.clear(); return false; }
  return ++b.n > PER_MIN;
}

const png = (bytes: Uint8Array) => new Response(bytes, { headers: {
  "Content-Type": "image/png", "Cache-Control": "public, max-age=3600, s-maxage=86400", "Access-Control-Allow-Origin": "*" } });

Deno.serve(async (req) => {
  const id = new URL(req.url).searchParams.get("id") ?? "";
  if (!/^[a-z0-9-]{1,64}$/.test(id)) return new Response("not found", { status: 404 });
  const hit = CACHE.get(id);
  if (hit && Date.now() - hit.at < TTL) return png(hit.png);
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "?";
  if (limited(ip)) return new Response("slow down", { status: 429, headers: { "Retry-After": "60" } });
  const { data } = await sb.from("recipes").select("name,neurons,examples,author_handle,model,hidden,draft").eq("id", id).maybeSingle();
  if (!data) return new Response("not found", { status: 404 });
  const r = !data.hidden && !data.draft ? data : null; // hidden and drafts: the generic site card
  const img = new ImageResponse(card(r), { width: 1200, height: 630, fonts: await fonts, emoji: "twemoji" });
  const bytes = new Uint8Array(await img.arrayBuffer());
  CACHE.set(id, { png: bytes, at: Date.now() });
  if (CACHE.size > 300) CACHE.delete(CACHE.keys().next().value!);
  return png(bytes); // our own headers only: ImageResponse's "immutable, max-age=31536000" no longer rides along
});

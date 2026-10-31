// neuronary API for agents and scripts.
//
//   REST  (base: https://<project>.supabase.co/functions/v1/api)
//     GET    /recipes?q=&tag=&model=&neuron=&author=&sort=top|new|hot&limit=     search (public)
//     GET    /recipes/:id                                                         one recipe, with examples (public)
//     POST   /recipes                                                             publish (token)
//     PATCH  /recipes/:id                                                         edit your own recipe (token)
//     POST   /recipes/:id/comments   {body, parent_id?}                           comment (token)
//     POST   /recipes/:id/reproductions {output, prompt?, note?}                  "reproduced it" with your sample (token)
//     POST   /recipes/:id/vote       {value: -1|0|1}                              vote (token)
//     GET    /me                                                                  who the token belongs to (token)
//     GET    /neurons/:id?model=      interpretations of one neuron (L17N6555) and the recipes using it (public)
//     POST   /interpretations         {model, unit|layer+neuron, text, confidence?, source?, method?} or {items: [...]} (token)
//     POST   /readouts                {model, unit|layer+neuron, source?, fields: [{type, name, ...}]} or {items: [...]} (token)
//     DELETE /interpretations/:id     delete your own (token)
//   MCP   POST /mcp   (Streamable HTTP, JSON responses; same operations as tools)
//
// Auth: "Authorization: Bearer nry_..." (a personal token from the site's "API & agents" page).
// Writes go through the same table constraints and jev moderation as the site; ownership is set here from the token.
import { createClient } from "jsr:@supabase/supabase-js@2";

const SITE = Deno.env.get("SITE_URL") ?? "https://neuronary.org";
const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, mcp-session-id, mcp-protocol-version",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
};

class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

type User = { id: string; handle: string; url: string | null } | null;

async function auth(req: Request): Promise<User> {
  const h = req.headers.get("authorization") ?? "";
  const m = h.match(/^Bearer\s+(nry_[0-9a-f]{48})$/i);
  if (!m) return null;
  const { data: uid, error } = await sb.rpc("resolve_api_token", { raw: m[1] });
  if (error || !uid) throw new HttpError(401, "invalid or revoked token");
  const { data: p } = await sb.from("profiles").select("handle,x_handle").eq("id", uid).maybeSingle();
  if (!p) throw new HttpError(403, "this account has no handle yet; pick one on the site");
  return { id: uid as string, handle: p.handle, url: p.x_handle ? `https://x.com/${p.x_handle}` : null };
}
const need = (u: User) => { if (!u) throw new HttpError(401, "this needs a token: Authorization: Bearer nry_..."); return u!; };

// ---------------------------------------------------------------- ids and formatting
type Neuron = { layer: number; neuron: number; dose: number; expert?: number };
const nkey = (n: Neuron) => `L${n.layer}${n.expert != null ? "E" + n.expert : ""}N${n.neuron}`; // no zero padding
// full precision as stored (-0.525 stays -0.525), at least one decimal
const dose = (d: number) => { let s = (d >= 0 ? "+" : "-") + String(Math.abs(d)); if (!s.includes(".") && !s.includes("e")) s += ".0"; return s; };
const sorted = (ns: Neuron[]) => [...ns].sort((a, b) => a.layer - b.layer || (a.expert ?? -1) - (b.expert ?? -1) || a.neuron - b.neuron);
const recipeStr = (ns: Neuron[]) => sorted(ns).map((n) => nkey(n) + dose(n.dose)).join(" ");
function parseNeurons(s: string): Neuron[] {
  const out: Neuron[] = [];
  const re = /L\s*(\d+)\s*(?:E\s*(\d+)\s*)?N\s*(\d+)\s*([+-]\s*\d*\.?\d+)?/gi;
  let m;
  while ((m = re.exec(s))) {
    const n: Neuron = { layer: +m[1], neuron: +m[3], dose: m[4] ? parseFloat(m[4].replace(/\s+/g, "")) : NaN };
    if (m[2] != null) n.expert = +m[2];
    out.push(n);
  }
  return out;
}

const SUMMARY = "id,name,description,model,neurons,method,sampling,tags,author_handle,author_url,source,date,created_at,origin,dose_curve,featured,confidence";
function shape(r: Record<string, any>, stats: Record<string, any> | undefined, full = false) {
  const o: Record<string, unknown> = {
    id: r.id, url: `${SITE}/r/${r.id}`, name: r.name, recipe: recipeStr(r.neurons), description: r.description,
    model: r.model, neurons: sorted(r.neurons), tags: r.tags, author: r.author_handle, date: r.date,
    score: stats?.score ?? 0, comments: stats?.comments ?? 0, reproductions: stats?.reproductions ?? 0,
    reproductions_partial: stats?.repro_partial ?? 0, reproductions_failed: stats?.repro_failed ?? 0,
  };
  if (r.featured) o.featured = true;
  if (r.confidence != null) o.confidence = r.confidence;
  if (r.dose_curve) o.dose_curve = r.dose_curve;
  if (r.method) o.method = r.method;
  if (r.sampling) o.sampling = r.sampling;
  if (r.source) o.source = r.source;
  if (full) {
    o.examples = r.examples ?? [];
    if (r.notes) o.notes = r.notes;
    if (r.conditional) o.conditional = r.conditional;
    if (r.aliases?.length) o.aliases = r.aliases;
  }
  return o;
}

// ---------------------------------------------------------------- operations (shared by REST and MCP)
// every row, 1000 at a time (a single response is capped at 1000)
async function all(q: () => any) {
  const out: any[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await q().range(from, from + 999);
    if (error) throw new HttpError(500, error.message);
    out.push(...data);
    if (data.length < 1000) return out;
  }
}

const SORTS = ["top", "new", "hot"];
async function search(p: { q?: string; tag?: string; model?: string; neuron?: string; author?: string; sort?: string; limit?: number | string; offset?: number | string; page?: number | string }) {
  if (p.sort !== undefined && p.sort !== "" && !SORTS.includes(p.sort)) throw new HttpError(400, `sort must be one of ${SORTS.join(", ")}`);
  const limit = Math.max(1, Math.min(100, Math.floor(Number(p.limit)) || 20));
  const offset = p.offset !== undefined && p.offset !== "" ? Math.floor(Number(p.offset))
    : p.page !== undefined && p.page !== "" ? (Math.floor(Number(p.page)) - 1) * limit : 0;
  if (!Number.isFinite(offset) || offset < 0) throw new HttpError(400, "offset must be 0 or more (page starts at 1)");
  const [rows, stats] = await Promise.all([
    all(() => sb.from("recipes").select(SUMMARY + ",search_text").eq("hidden", false).eq("draft", false).order("id")),
    all(() => sb.from("recipe_stats").select("recipe_id,score,comments,reproductions,repro_partial,repro_failed").order("recipe_id")),
  ]);
  const st = Object.fromEntries((stats ?? []).map((s) => [s.recipe_id, s]));
  let rs = rows ?? [];
  const tags = (p.tag ?? "").split(",").map((t) => t.trim().toLowerCase()).filter(Boolean);
  if (tags.length) rs = rs.filter((r) => tags.every((t) => r.tags.includes(t)));
  if (p.model) rs = rs.filter((r) => r.model.toLowerCase() === p.model!.toLowerCase() || r.model.toLowerCase().endsWith("/" + p.model!.toLowerCase()));
  if (p.author) rs = rs.filter((r) => r.author_handle.toLowerCase() === p.author!.replace(/^@/, "").toLowerCase());
  const want = parseNeurons(p.neuron ?? "").concat(parseNeurons(p.q ?? "")).map(nkey);
  if (want.length) rs = rs.filter((r) => { const ks = new Set(r.neurons.map(nkey)); return want.every((k) => ks.has(k)); });
  const words = (p.q ?? "").replace(/L\s*\d+\s*(?:E\s*\d+\s*)?N\s*\d+\s*(?:[+-]\s*\d*\.?\d+)?/gi, " ").toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length) rs = rs.filter((r) => {
    const hay = [r.name, r.description, r.tags.join(" "), r.author_handle, r.model, r.search_text ?? ""].join(" ").toLowerCase();
    return words.every((w) => hay.includes(w));
  });
  const score = (r: any) => st[r.id]?.score ?? 0;
  const age = (r: any) => Math.max(0, (Date.now() - Date.parse(r.created_at)) / 3.6e6);
  if (p.sort === "new") rs.sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
  else if (p.sort === "hot") rs.sort((a, b) => (score(b) + 1) / (age(b) + 2) ** 1.5 - (score(a) + 1) / (age(a) + 2) ** 1.5);
  else rs.sort((a, b) => score(b) - score(a));
  return { count: rs.length, offset, limit, recipes: rs.slice(offset, offset + limit).map((r) => shape(r, st[r.id])) };
}

async function getRecipe(id: string) {
  const { data: r, error } = await sb.from("recipes").select("*").eq("id", id).eq("hidden", false).eq("draft", false).maybeSingle();
  if (error) throw new HttpError(500, error.message);
  if (!r) throw new HttpError(404, `no recipe ${id}`);
  const { data: st } = await sb.from("recipe_stats").select("score,comments,reproductions,repro_partial,repro_failed").eq("recipe_id", id).maybeSingle();
  return shape(r, st ?? undefined, true);
}

const FIELDS = ["name", "description", "model", "neurons", "method", "sampling", "conditional", "tags", "examples", "aliases", "source", "notes", "dose_curve", "confidence"];
function pick(body: Record<string, any>, partial: boolean) {
  const o: Record<string, unknown> = {};
  for (const k of FIELDS) if (body[k] !== undefined) o[k] = body[k];
  if (typeof body.recipe === "string" && !o.neurons) o.neurons = parseNeurons(body.recipe); // "L13N7956-1.0 L14N8949+1.0"
  if (Array.isArray(o.tags)) o.tags = (o.tags as string[]).map((t) => String(t).toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""));
  if (!partial) {
    for (const k of ["name", "description", "model", "neurons", "tags", "examples"]) {
      if (o[k] === undefined) throw new HttpError(400, `missing ${k}`);
    }
    if (!Array.isArray(o.examples) || !(o.examples as unknown[]).length) throw new HttpError(400, "add at least one example: {prompt, output}");
  }
  if (o.neurons && (o.neurons as Neuron[]).some((n) => !Number.isFinite(n.dose))) throw new HttpError(400, "every neuron needs a dose, e.g. L14N8949+1.0");
  if (o.confidence !== undefined && o.confidence !== null && !(typeof o.confidence === "number" && o.confidence >= 0 && o.confidence <= 1)) throw new HttpError(400, "confidence is a number from 0 to 1 (or null)");
  // drafts: {"draft": true} on publish keeps it private to you; PATCH {"draft": false} publishes it
  if (body.draft !== undefined) {
    if (typeof body.draft !== "boolean") throw new HttpError(400, "draft is true or false");
    if (partial && body.draft) throw new HttpError(400, "a recipe can't go back to draft");
    o.draft = body.draft;
  }
  return o;
}

const friendly = (msg: string) => msg.replace(/new row for relation "recipes" violates check constraint "(\w+)"/, (_, c) => ({
  recipes_neurons_check: "neurons must be [{layer, neuron, dose}] with whole-number layer/neuron, |dose| <= 100, no duplicates",
  examples_ok: "examples must be 1-12 objects with non-empty prompt and output",
  recipes_tags_check: "tags: 1-12 lowercase words or-dashes",
  recipes_model_check: "model must be a Hugging Face id like Qwen/Qwen3.5-4B",
} as Record<string, string>)[c] ?? `invalid recipe (${c})`);

async function publish(u: User, body: Record<string, any>) {
  const me = need(u);
  // same per-user limit as the site (backstops: 200 a day for picked names, 1000 for X-verified accounts, 10000 for trusted publishers, none for admins)
  const { data: q } = await sb.rpc("recipe_quota_for", { uid: me.id });
  if (q && q.limit != null && q.used >= q.limit) {
    throw new HttpError(429, `rate limit: ${q.limit} recipes a day${q.next_at ? `; next one at ${new Date(q.next_at).toISOString()}` : ""}`);
  }
  const row = { ...pick(body, false), user_id: me.id, author_handle: me.handle, author_url: me.url, origin: "site", hidden: false };
  const { data, error } = await sb.from("recipes").insert(row).select("id").single();
  if (error) throw new HttpError(/^rate limit/.test(error.message) ? 429 : 400, friendly(error.message));
  return { id: data.id, url: `${SITE}/r/${data.id}` };
}

async function edit(u: User, id: string, body: Record<string, any>) {
  const me = need(u);
  const { data: r } = await sb.from("recipes").select("id,user_id").eq("id", id).maybeSingle();
  if (!r) throw new HttpError(404, `no recipe ${id}`);
  const { data: p } = await sb.from("profiles").select("is_admin").eq("id", me.id).maybeSingle();
  if (r.user_id !== me.id && !p?.is_admin) throw new HttpError(403, "you can only edit your own recipes");
  const patch = pick(body, true);
  if (patch.examples !== undefined && !(patch.examples as unknown[]).length) throw new HttpError(400, "keep at least one example");
  const { error } = await sb.from("recipes").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) throw new HttpError(400, friendly(error.message));
  return { id, url: `${SITE}/r/${id}` };
}

async function comment(u: User, id: string, body: { body?: string; parent_id?: number }) {
  const me = need(u);
  if (!body.body || !String(body.body).trim()) throw new HttpError(400, "empty comment");
  // same as the site: each comment costs a moderation call, and nobody comments in bulk
  const since = (ms: number) => sb.from("comments").select("id", { count: "exact", head: true }).eq("user_id", me.id)
    .gt("created_at", new Date(Date.now() - ms).toISOString());
  const [{ count: hour }, { count: day }] = await Promise.all([since(3600e3), since(86400e3)]);
  if ((hour ?? 0) >= 60) throw new HttpError(429, "rate limit: 60 comments an hour");
  if ((day ?? 0) >= 300) throw new HttpError(429, "rate limit: 300 comments a day");
  if (body.parent_id) {
    const { data: p } = await sb.from("comments").select("recipe_id,parent_id").eq("id", body.parent_id).maybeSingle();
    if (!p || p.recipe_id !== id || p.parent_id) throw new HttpError(400, "replies go one level deep, on the same recipe");
  }
  const { data, error } = await sb.from("comments").insert({ recipe_id: id, body: String(body.body), parent_id: body.parent_id ?? null,
    user_id: me.id, author_handle: me.handle }).select("id").single();
  if (error) throw new HttpError(400, error.message);
  return { id: data.id, url: `${SITE}/r/${id}` };
}

// "I ran it and it worked": the reproducer's own output, counted on the recipe
async function reproduce(u: User, id: string, body: { output?: string; prompt?: string; note?: string; setup?: string; result?: string }) {
  const me = need(u);
  if (!body.output || !String(body.output).trim()) throw new HttpError(400, "output: paste what the steered model said for you");
  const { data: r } = await sb.from("recipes").select("user_id").eq("id", id).eq("hidden", false).eq("draft", false).maybeSingle();
  if (!r) throw new HttpError(404, `no recipe ${id}`);
  if (r.user_id === me.id) throw new HttpError(400, "reproductions are for other people's recipes; add an example to your own instead");
  const { count } = await sb.from("reproductions").select("id", { count: "exact", head: true }).eq("user_id", me.id)
    .gt("created_at", new Date(Date.now() - 3600e3).toISOString());
  if ((count ?? 0) >= 500) throw new HttpError(429, "rate limit: 500 reproductions an hour");
  const result = body.result ?? "yes";
  if (!["yes", "partial", "no"].includes(result)) throw new HttpError(400, "result: yes, partial or no");
  const row = { recipe_id: id, user_id: me.id, author_handle: me.handle, output: String(body.output), result,
    prompt: body.prompt ? String(body.prompt) : null, note: body.note ? String(body.note) : null, setup: body.setup ? String(body.setup).slice(0, 200) : null };
  const { data, error } = await sb.from("reproductions").upsert(row, { onConflict: "recipe_id,user_id" }).select("id").single();
  if (error) throw new HttpError(400, error.message);
  return { id: data.id, url: `${SITE}/r/${id}` };
}

async function vote(u: User, id: string, value: number) {
  const me = need(u);
  if (![-1, 0, 1].includes(value)) throw new HttpError(400, "value must be -1, 0 or 1");
  const q = value ? sb.from("votes").upsert({ recipe_id: id, user_id: me.id, value })
    : sb.from("votes").delete().eq("recipe_id", id).eq("user_id", me.id);
  const { error } = await q;
  if (error) throw new HttpError(400, error.message);
  const { data: st } = await sb.from("recipe_stats").select("score").eq("recipe_id", id).maybeSingle();
  return { id, your_vote: value, score: st?.score ?? 0 };
}

// ---------------------------------------------------------------- neuron interpretations (the atlas)
// what someone thinks one neuron does, with a confidence and typed readout blocks (see AGENTS.md: "Interpretations")
const FIELD_TYPES = ["tokens", "contexts", "units", "heads", "stats", "text"];
function interpItem(x: Record<string, any>) {
  let { model, layer, neuron, expert } = x;
  if (typeof x.unit === "string" || (typeof neuron === "string" && /L/i.test(neuron))) { // "L17N6555" / "L12E3N44"
    const [n] = parseNeurons(String(x.unit ?? neuron));
    if (!n) throw new HttpError(400, `can't read neuron id ${x.unit ?? neuron}`);
    ({ layer, neuron } = n); if (n.expert != null) expert = n.expert;
  }
  if (typeof model !== "string" || !model.includes("/")) throw new HttpError(400, "model must be a Hugging Face id like Qwen/Qwen3.5-4B");
  if (!Number.isInteger(layer) || !Number.isInteger(neuron)) throw new HttpError(400, "layer and neuron must be whole numbers (or give unit: 'L17N6555')");
  if (typeof x.text !== "string" || !x.text.trim()) throw new HttpError(400, "text: the interpretation, e.g. '(+) ascribes a measured attribute; (−) copula predication'");
  if (x.confidence != null && !(typeof x.confidence === "number" && x.confidence >= 0 && x.confidence <= 1)) throw new HttpError(400, "confidence is a number from 0 to 1");
  if (x.fields !== undefined) throw new HttpError(400, "readouts are not part of an interpretation: send them once with publish_readouts / POST /readouts");
  return { model, layer, neuron, expert: expert ?? null, text: x.text, confidence: x.confidence ?? null, source: x.source ?? null, method: x.method ?? null };
}

// the unit part of an item: model + "L17N6555" (unit) or layer + neuron (+ expert)
function unitOf(x: Record<string, any>) {
  let { model, layer, neuron, expert } = x;
  if (typeof x.unit === "string" || (typeof neuron === "string" && /L/i.test(neuron))) {
    const [n] = parseNeurons(String(x.unit ?? neuron));
    if (!n) throw new HttpError(400, `can't read neuron id ${x.unit ?? neuron}`);
    ({ layer, neuron } = n); if (n.expert != null) expert = n.expert;
  }
  if (typeof model !== "string" || !model.includes("/")) throw new HttpError(400, "model must be a Hugging Face id like Qwen/Qwen3.5-4B");
  if (!Number.isInteger(layer) || !Number.isInteger(neuron)) throw new HttpError(400, "layer and neuron must be whole numbers (or give unit: 'L17N6555')");
  return { model, layer, neuron, expert: expert ?? null };
}

function readoutItem(x: Record<string, any>) {
  const fields = x.fields;
  if (!Array.isArray(fields) || !fields.length) throw new HttpError(400, "fields: a list of readout blocks, each {type, name, ...}");
  for (const f of fields) {
    if (!f || typeof f !== "object" || typeof f.name !== "string" || !f.name.trim()) throw new HttpError(400, "every readout block needs a name (it is what a later upload replaces)");
    if (!FIELD_TYPES.includes(f.type)) throw new HttpError(400, `unknown block type ${f.type}; use one of ${FIELD_TYPES.join(", ")}`);
  }
  return { ...unitOf(x), source: x.source ?? null, fields };
}

async function postReadouts(u: User, body: Record<string, any>) {
  const me = need(u);
  const items = (Array.isArray(body.items) ? body.items : [body]).map(readoutItem);
  const { data, error } = await sb.rpc("post_readouts", { items, as_user: me.id });
  if (error) throw new HttpError(/^rate limit/.test(error.message) ? 429 : 400, error.message);
  return data;
}

async function postInterpretations(u: User, body: Record<string, any>) {
  const me = need(u);
  const items = (Array.isArray(body.items) ? body.items : [body]).map(interpItem);
  if (items.length > 1000) throw new HttpError(400, "at most 1000 per call");
  const { data, error } = await sb.rpc("post_interpretations", { items, as_user: me.id });
  if (error) throw new HttpError(/^rate limit/.test(error.message) ? 429 : 400, error.message);
  return data;
}

const ICOLS = "id,model,layer,neuron,expert,text,confidence,source,method,author_handle,created_at,updated_at";
const RCOLS = "id,model,layer,neuron,expert,name,block,source,author_handle,created_at,updated_at";
async function getNeuron(key: string, model?: string) {
  const [n] = parseNeurons(key);
  if (!n) throw new HttpError(400, `not a neuron id: ${key} (like L17N6555)`);
  let q = sb.from("interpretations").select(ICOLS).eq("layer", n.layer).eq("neuron", n.neuron).eq("hidden", false);
  q = n.expert != null ? q.eq("expert", n.expert) : q.is("expert", null);
  if (model) q = q.ilike("model", model.includes("/") ? model : `%/${model}`);
  let rq = sb.from("neuron_readouts").select(RCOLS).eq("layer", n.layer).eq("neuron", n.neuron).eq("hidden", false);
  rq = n.expert != null ? rq.eq("expert", n.expert) : rq.is("expert", null);
  if (model) rq = rq.ilike("model", model.includes("/") ? model : `%/${model}`);
  const [{ data, error }, { data: ro, error: e2 }, recipes] = await Promise.all([
    q.order("confidence", { ascending: false, nullsFirst: false }).limit(200), rq.order("id").limit(200), search({ neuron: key, model, limit: 100 })]);
  if (error || e2) throw new HttpError(500, (error || e2)!.message);
  return { neuron: nkey(n as Neuron), interpretations: data ?? [],
    readouts: (ro ?? []).map((r) => ({ ...r.block, model: r.model, source: r.source, by: r.author_handle, updated_at: r.updated_at })), recipes: recipes.recipes };
}

async function deleteInterpretation(u: User, id: string) {
  const me = need(u);
  const { data: r } = await sb.from("interpretations").select("id,user_id").eq("id", id).maybeSingle();
  if (!r) throw new HttpError(404, `no interpretation ${id}`);
  const { data: p } = await sb.from("profiles").select("is_admin").eq("id", me.id).maybeSingle();
  if (r.user_id !== me.id && !p?.is_admin) throw new HttpError(403, "you can only delete your own");
  const { error } = await sb.from("interpretations").delete().eq("id", id);
  if (error) throw new HttpError(400, error.message);
  return { id: Number(id), deleted: true };
}

// ---------------------------------------------------------------- MCP
const TOOLS = [
  { name: "get_neuron", description: "Everything neuronary has on one neuron: interpretations (text, confidence, who), readouts (lens reads, top firings, net, heads) and the recipes that use it.",
    inputSchema: { type: "object", properties: { neuron: { type: "string", description: "e.g. L17N6555" }, model: { type: "string", description: "e.g. Qwen/Qwen3.5-4B; omit for every model" } }, required: ["neuron"] } },
  { name: "publish_interpretation", description: "Post your interpretation of one neuron, as the token's owner: text in the form '(+) ...; (−) ...' covering both poles, and an honest confidence 0-1 (under 0.3 shows as questionable). Like a reproduction: everyone can post one per neuron per model; posting again replaces yours. For many neurons pass items (up to 1000). Readouts (lens reads, firings, net, heads) are separate: publish_readouts.",
    inputSchema: { type: "object", properties: {
      model: { type: "string" }, unit: { type: "string", description: "neuron id, e.g. L17N6555 (or give layer + neuron)" },
      layer: { type: "integer" }, neuron: { type: "integer" }, expert: { type: "integer" },
      text: { type: "string" }, confidence: { type: "number", minimum: 0, maximum: 1 }, source: { type: "string" }, method: { type: "string" },
      items: { type: "array", items: { type: "object" }, description: "batch: a list of the same objects" } } } },
  { name: "publish_readouts", description: "Attach readouts to a neuron: named blocks, pushed once with the original upload and added to later (a new lens is a new block; sending a block with an existing name replaces it if it is yours). Block types: tokens {type, name, rows: {'+': [tok or [tok, value]], '-': [...]}}; contexts {type, name, note?, tags?: {'+': [[domain, score]]}, rows: {'+': [{text with ⟦hot tokens⟧ (or ⟦tok|0.4⟧), tag?, value?}]}}; units {type, name, note?, groups: [{label, sign: '+'|'-', note?, items: [[label, count]]}]}; heads {type, name, rows: {q|k|v|o: [[label, score]]}}; stats {type, name, items: [[label, value]]}; text {type, name, text}. Needs an X-verified account; whole-model imports need trusted-publisher status. Batch: items (up to 1000 neurons).",
    inputSchema: { type: "object", properties: {
      model: { type: "string" }, unit: { type: "string" }, layer: { type: "integer" }, neuron: { type: "integer" }, expert: { type: "integer" },
      fields: { type: "array", items: { type: "object" } }, source: { type: "string" },
      items: { type: "array", items: { type: "object" } } } } },
  { name: "search_recipes", description: "Search neuronary for neuron steering recipes. Free text matches names, descriptions, tags, authors and models; neuron ids like L14N8949 match recipes using that neuron.",
    inputSchema: { type: "object", properties: {
      q: { type: "string", description: "free text and/or neuron ids, e.g. 'evil' or 'L14N8949'" },
      tag: { type: "string", description: "comma-separated tags, all required" },
      model: { type: "string", description: "Hugging Face model id, e.g. Qwen/Qwen3.5-4B" },
      author: { type: "string" }, sort: { type: "string", enum: ["top", "new", "hot"] },
      limit: { type: "integer", minimum: 1, maximum: 100 } } } },
  { name: "get_recipe", description: "Get one recipe with its neurons, doses, method, recommended sampling and example outputs.",
    inputSchema: { type: "object", properties: { id: { type: "string" } }, required: ["id"] } },
  { name: "publish_recipe", description: "Publish a recipe as the token's owner. Dose units: act[n] += dose * median(||resid leaving layer L||) / ||W_down[:, n]|| at the input of mlp.down_proj, every token. Give neurons either as a list or as a recipe string like 'L13N7956-1.0 L14N8949+1.0'. At least one example (prompt + steered output) is required. For a batch, call once per recipe with draft: true, let the user review, then publish each with update_recipe {id, draft: false}.",
    inputSchema: { type: "object", properties: {
      name: { type: "string" }, description: { type: "string" }, model: { type: "string" },
      recipe: { type: "string", description: "e.g. L13N7956-1.0 L14N8949+1.0" },
      neurons: { type: "array", items: { type: "object", properties: { layer: { type: "integer" }, neuron: { type: "integer" }, dose: { type: "number" }, expert: { type: "integer" } }, required: ["layer", "neuron", "dose"] } },
      tags: { type: "array", items: { type: "string" } },
      examples: { type: "array", items: { type: "object", properties: { prompt: { type: "string" }, output: { type: "string" }, base_output: { type: "string" } }, required: ["prompt", "output"] } },
      sampling: { type: "object", description: "recommended settings, e.g. {repetition_penalty: 1.1, temperature: 0.7}" },
      method: { type: "object", description: "omit for the default (add, all tokens)" },
      source: { type: "string" }, notes: { type: "string" },
      dose_curve: { type: "object", description: "optional measured dose response: {metric: 'meows per answer', points: [{dose: 0, value: 0}, {dose: 0.5, value: 13}, ...]}" },
      confidence: { type: "number", minimum: 0, maximum: 1, description: "how sure you are it does what the description says (0-1); under 0.3 shows as questionable" },
      draft: { type: "boolean", description: "true: save privately (only you see it); publish later with update_recipe {draft: false}" } },
      required: ["name", "description", "model", "tags", "examples"] } },
  { name: "update_recipe", description: "Edit one of your own recipes, e.g. to add examples. Only the fields you pass change; examples replaces the whole list.",
    inputSchema: { type: "object", properties: { id: { type: "string" }, name: { type: "string" }, description: { type: "string" },
      tags: { type: "array", items: { type: "string" } }, examples: { type: "array", items: { type: "object" } }, sampling: { type: "object" }, notes: { type: "string" },
      dose_curve: { type: "object" }, confidence: { type: "number", minimum: 0, maximum: 1 }, draft: { type: "boolean", description: "false publishes a draft" } }, required: ["id"] } },
  { name: "comment", description: "Comment on a recipe (optionally replying to a top-level comment).",
    inputSchema: { type: "object", properties: { id: { type: "string" }, body: { type: "string" }, parent_id: { type: "integer" } }, required: ["id", "body"] } },
  { name: "report_reproduction", description: "Report your own run of someone else's recipe: whether it reproduced (yes / partial / no), the steered output you got, the prompt and your setup. Shown on the recipe and counted. One per recipe per user; sending again replaces yours.",
    inputSchema: { type: "object", properties: { id: { type: "string" }, output: { type: "string" }, prompt: { type: "string" },
      result: { type: "string", enum: ["yes", "partial", "no"], description: "default yes" },
      setup: { type: "string", description: "precision and backend, e.g. bf16 transformers, Q4_K_M llama.cpp" }, note: { type: "string" } }, required: ["id", "output"] } },
  { name: "vote", description: "Vote on a recipe: 1 up, -1 down, 0 to clear.",
    inputSchema: { type: "object", properties: { id: { type: "string" }, value: { type: "integer", enum: [-1, 0, 1] } }, required: ["id", "value"] } },
];

async function callTool(u: User, name: string, a: Record<string, any>) {
  switch (name) {
    case "search_recipes": return search(a);
    case "get_recipe": return getRecipe(String(a.id));
    case "publish_recipe": return publish(u, a);
    case "update_recipe": { const { id, ...rest } = a; return edit(u, String(id), rest); }
    case "comment": return comment(u, String(a.id), a);
    case "vote": return vote(u, String(a.id), Number(a.value));
    case "report_reproduction": return reproduce(u, String(a.id), a);
    case "get_neuron": return getNeuron(String(a.neuron), a.model);
    case "publish_interpretation": return postInterpretations(u, a);
    case "publish_readouts": return postReadouts(u, a);
    default: throw new HttpError(404, `unknown tool ${name}`);
  }
}

async function mcp(req: Request, u: User) {
  const msg = await req.json();
  const batch = Array.isArray(msg) ? msg : [msg];
  const out = [];
  for (const m of batch) {
    if (m.id === undefined) continue; // notifications (e.g. notifications/initialized) get no reply
    const reply = (result: unknown) => out.push({ jsonrpc: "2.0", id: m.id, result });
    const fail = (code: number, message: string) => out.push({ jsonrpc: "2.0", id: m.id, error: { code, message } });
    try {
      if (m.method === "initialize") {
        reply({ protocolVersion: m.params?.protocolVersion ?? "2025-06-18", capabilities: { tools: {} },
          serverInfo: { name: "neuronary", version: "1.0.0" },
          instructions: "neuronary.org is a dictionary of neuron steering recipes. Search before publishing; recipe strings look like L13N7956-1.0 L14N8949+1.0 (layer, neuron, dose)." });
      } else if (m.method === "tools/list") reply({ tools: TOOLS });
      else if (m.method === "ping") reply({});
      else if (m.method === "tools/call") {
        try {
          const r = await callTool(u, m.params?.name, m.params?.arguments ?? {});
          reply({ content: [{ type: "text", text: JSON.stringify(r, null, 2) }], structuredContent: r });
        } catch (e) {
          reply({ content: [{ type: "text", text: String((e as Error).message) }], isError: true });
        }
      } else fail(-32601, `method not found: ${m.method}`);
    } catch (e) { fail(-32603, String((e as Error).message)); }
  }
  if (!out.length) return new Response(null, { status: 202, headers: CORS });
  return Response.json(Array.isArray(msg) ? out : out[0], { headers: CORS });
}

// ---------------------------------------------------------------- router
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  const url = new URL(req.url);
  const path = url.pathname.replace(/^.*?\/api(?=\/|$)/, "") || "/";
  try {
    const u = await auth(req);
    if (path === "/mcp") {
      if (req.method === "POST") return await mcp(req, u);
      return new Response("MCP endpoint: POST JSON-RPC here", { status: 405, headers: CORS });
    }
    const body = ["POST", "PATCH"].includes(req.method) ? await req.json().catch(() => ({})) : {};
    let m;
    let result: unknown;
    // public reads can be cached briefly; anything with a token can't
    const cache = req.method === "GET" && !u && path !== "/me" ? { "Cache-Control": "public, max-age=30, s-maxage=30" } : { "Cache-Control": "no-store" };
    if (req.method === "GET" && (path === "/" || path === "/recipes")) result = await search(Object.fromEntries(url.searchParams));
    else if (req.method === "GET" && path === "/me") { const me = need(u); result = { handle: me.handle, url: me.url }; }
    else if (req.method === "POST" && path === "/recipes") result = await publish(u, body);
    else if ((m = path.match(/^\/recipes\/([a-z0-9-]+)$/))) {
      if (req.method === "GET") result = await getRecipe(m[1]);
      else if (req.method === "PATCH") result = await edit(u, m[1], body);
      else throw new HttpError(405, "method not allowed");
    } else if ((m = path.match(/^\/recipes\/([a-z0-9-]+)\/comments$/)) && req.method === "POST") result = await comment(u, m[1], body);
    else if ((m = path.match(/^\/recipes\/([a-z0-9-]+)\/reproductions$/)) && req.method === "POST") result = await reproduce(u, m[1], body);
    else if ((m = path.match(/^\/recipes\/([a-z0-9-]+)\/vote$/)) && req.method === "POST") result = await vote(u, m[1], Number(body.value));
    else if ((m = path.match(/^\/neurons\/([A-Za-z0-9]+)$/)) && req.method === "GET") result = await getNeuron(m[1], url.searchParams.get("model") ?? undefined);
    else if (path === "/interpretations" && req.method === "POST") result = await postInterpretations(u, body);
    else if (path === "/readouts" && req.method === "POST") result = await postReadouts(u, body);
    else if ((m = path.match(/^\/interpretations\/(\d+)$/)) && req.method === "DELETE") result = await deleteInterpretation(u, m[1]);
    else throw new HttpError(404, "not found; see https://neuronary.org/about");
    return Response.json(result, { headers: { ...CORS, ...cache } });
  } catch (e) {
    const status = e instanceof HttpError ? e.status : 500;
    return Response.json({ error: (e as Error).message }, { status, headers: CORS });
  }
});

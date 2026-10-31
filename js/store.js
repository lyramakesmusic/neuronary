// Data layer. Two backends behind one interface:
//   LocalStore    - recipes from recipes/*.json, votes/comments/submissions in this browser's localStorage. Zero setup.
//   SupabaseStore - same repo recipes, plus submissions, votes, comments and sign-in in Supabase (see supabase/schema.sql).
// Both merge the repo's recipes (added by pull request) with user submissions, keyed by recipe id.

const LS = {
  get(k, d) {
    try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; }
  },
  set(k, v) { localStorage.setItem(k, JSON.stringify(v)); },
};

async function fetchJson(url) {
  const r = await fetch(url, { cache: "no-cache" });
  if (!r.ok) throw new Error(`${url}: ${r.status}`);
  return r.json();
}

function normalize(r, origin) {
  return {
    ...r,
    author: typeof r.author === "string" ? { handle: r.author } : r.author || { handle: "anonymous" },
    date: r.date || r.created_at || "",
    tags: r.tags || [],
    origin,
    score: r.score ?? 0,
    comments: r.comments ?? r.comment_count ?? 0,
    myVote: 0,
  };
}

async function loadRepo(demo) {
  const idx = await fetchJson("recipes/index.json");
  const out = idx.recipes.map((r) => normalize(r, "repo"));
  if (demo) {
    try {
      const fx = await fetchJson("dev/fixtures.json");
      for (const r of fx.recipes) out.push(normalize(r, "demo"));
    } catch { /* no fixtures */ }
  }
  return out;
}

async function loadFull(r) {
  if (r.examples) return r;
  const full = await fetchJson(`recipes/${r.id}.json`);
  return { ...r, ...full, author: r.author, origin: r.origin, score: r.score, comments: r.comments, myVote: r.myVote };
}

// ---------------------------------------------------------------- local
class LocalStore {
  mode = "local";
  constructor(cfg) { this.cfg = cfg; this.listeners = []; }

  async init() {
    this.demo = new URLSearchParams(location.search).has("demo") || LS.get("nr.demo", false);
    this.repo = await loadRepo(this.demo);
  }

  user() {
    const h = LS.get("nr.handle", null);
    return h ? { handle: h, needsHandle: false, anonymous: false, admin: false, verified: true } : null;
  }
  providers() { return []; }
  async claimHandle(h) { return this.signIn(h); }
  canEdit(r) { const u = this.user(); return !!u && r.origin === "local" && r.author.handle === u.handle; }
  async update(id, recipe) {
    const mine = LS.get("nr.local.recipes", []);
    const i = mine.findIndex((r) => r.id === id);
    if (i < 0) throw new Error("not allowed to edit this recipe");
    mine[i] = { ...mine[i], ...recipe, id, author: mine[i].author, created_at: mine[i].created_at };
    LS.set("nr.local.recipes", mine);
  }
  async remove(id) {
    LS.set("nr.local.recipes", LS.get("nr.local.recipes", []).filter((r) => r.id !== id));
  }
  async signIn(handle) {
    LS.set("nr.handle", String(handle).replace(/^@/, "").trim());
    this.listeners.forEach((f) => f(this.user()));
  }
  async signOut() {
    localStorage.removeItem("nr.handle");
    this.listeners.forEach((f) => f(null));
  }
  onAuth(f) { this.listeners.push(f); }

  _decorate(r) {
    const votes = LS.get("nr.votes", {});
    const cm = LS.get("nr.comments", {});
    const v = votes[r.id] || 0;
    return { ...r, score: (r.score || 0) + v, myVote: v, comments: (r.comments || 0) + (cm[r.id] || []).length };
  }

  async list() {
    const mine = LS.get("nr.local.recipes", []).map((r) => normalize(r, "local"));
    return [...this.repo, ...mine].map((r) => this._decorate(r));
  }

  async get(id) {
    const all = await this.list();
    const r = all.find((x) => x.id === id);
    if (!r) return null;
    return r.origin === "repo" ? loadFull(r) : r;
  }

  async vote(id, v) {
    const votes = LS.get("nr.votes", {});
    if (v) votes[id] = v; else delete votes[id];
    LS.set("nr.votes", votes);
  }

  async comments(id) { return LS.get("nr.comments", {})[id] || []; }

  async interpretations() { return []; }

  async comment(id, body, parentId = null) {
    const u = this.user();
    if (!u) throw new Error("sign in to comment");
    const cm = LS.get("nr.comments", {});
    const c = { id: Date.now(), parent_id: parentId, handle: u.handle, body, created_at: new Date().toISOString() };
    (cm[id] = cm[id] || []).push(c);
    LS.set("nr.comments", cm);
    return c;
  }

  async deleteComment(id, cid) {
    const cm = LS.get("nr.comments", {});
    cm[id] = (cm[id] || []).filter((c) => c.id !== cid && c.parent_id !== cid);
    LS.set("nr.comments", cm);
  }

  async submit(recipe) {
    const mine = LS.get("nr.local.recipes", []);
    const a = "abcdefghjkmnpqrstuvwxyz23456789";
    const id = Array.from(crypto.getRandomValues(new Uint8Array(8)), (x) => a[x % a.length]).join("");
    mine.push({ ...recipe, id, created_at: new Date().toISOString() });
    LS.set("nr.local.recipes", mine);
    return id;
  }

  async idTaken(id) { return (await this.list()).some((r) => r.id === id); }
}

// ---------------------------------------------------------------- supabase
// ---------------------------------------------------------------- supabase
// The database holds every recipe (repo ones are synced in by scripts/sync_repo.py). Sign-in is X (OAuth) or an
// anonymous session plus a handle; anonymous users can link X later and keep everything.
const SUMMARY = "id,name,description,model,neurons,method,sampling,tags,aliases,author_handle,author_url,source,date,created_at,user_id,origin,hidden,dose_curve,featured,draft,search_text,confidence";

class SupabaseStore {
  mode = "supabase";
  constructor(cfg) { this.cfg = cfg; this.listeners = []; this.session = null; this.profile = null; }

  async init() {
    // Only the two parts of Supabase the site uses (auth + the REST client), not the full bundle with realtime,
    // storage and functions. Same versions supabase-js 2.49.4 ships; same storage key, so sessions carry over.
    const [{ AuthClient }, { PostgrestClient }] = await Promise.all([
      import("https://esm.sh/@supabase/auth-js@2.69.1"),
      import("https://esm.sh/@supabase/postgrest-js@1.19.4"),
    ]);
    const base = this.cfg.supabaseUrl.replace(/\/$/, ""), key = this.cfg.supabaseAnonKey;
    // PKCE: OAuth comes back as ?code=... (not #access_token=..., which the hash router would read as a page)
    const auth = new AuthClient({
      url: base + "/auth/v1", headers: { apikey: key, Authorization: `Bearer ${key}` },
      storageKey: `sb-${new URL(base).hostname.split(".")[0]}-auth-token`,
      persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: "pkce",
    });
    // REST calls carry the signed-in user's token (or the anon key)
    const authedFetch = async (input, init = {}) => {
      const { data } = await auth.getSession();
      const h = new Headers(init.headers);
      h.set("apikey", key);
      h.set("Authorization", `Bearer ${(data.session && data.session.access_token) || key}`);
      return fetch(input, { ...init, headers: h });
    };
    const rest = new PostgrestClient(base + "/rest/v1", { headers: { apikey: key }, fetch: authedFetch });
    this.sb = { auth, from: (t) => rest.from(t), rpc: (fn, args, opts) => rest.rpc(fn, args, opts) };
    // Tokens in the address bar (#access_token=...) are never accepted: a link could sign you into someone else's
    // account. PKCE codes only work in the browser that started the sign-in. app.js strips any leftovers.
    const { data, error } = await this.sb.auth.getSession();
    if (error) throw error;
    // clean the OAuth leftovers out of the address bar and go back to the page sign-in started from
    const qs = new URLSearchParams(location.search);
    if (qs.has("code") || qs.has("error") || qs.has("error_description")) {
      this.returnedFromOAuth = !qs.has("error");
      if (qs.get("error_description")) console.error("sign-in failed:", qs.get("error_description"));
      const back = sessionStorage.getItem("nr.returnTo") || "/";
      sessionStorage.removeItem("nr.returnTo");
      history.replaceState(null, "", back);
    }
    this.session = data.session;
    await this._loadProfile();
    this.sb.auth.onAuthStateChange(async (_e, s) => {
      const before = this.session && this.session.user && this.session.user.id;
      const after = s && s.user && s.user.id;
      this.session = s;
      if (before !== after) {
        await this._loadProfile();
        this.listeners.forEach((f) => f(this.user()));
      }
    });
  }

  async _loadProfile() {
    const u = this.session && this.session.user;
    this.profile = null;
    if (!u) return;
    const { data } = await this.sb.from("profiles").select("handle,x_handle,is_admin,avatar_url,trusted,name_status").eq("id", u.id).maybeSingle();
    this.profile = data || null;
  }

  // null when signed out. needsHandle: signed in but no handle picked yet.
  user() {
    const u = this.session && this.session.user;
    if (!u) return null;
    const p = this.profile;
    return {
      id: u.id, handle: p ? p.handle : null, needsHandle: !p, admin: !!(p && p.is_admin),
      anonymous: !!u.is_anonymous, url: p && p.x_handle ? `https://x.com/${p.x_handle}` : undefined,
      avatar: p ? p.avatar_url : null,
      // matches the database's is_verified(): a linked X account, or a trusted publisher / admin
      nameStatus: p ? p.name_status || null : null, // "review" or "renamed": moderation flagged the name
      verified: !!((u.identities || []).some((i) => i.provider === "x" || i.provider === "twitter") || (p && (p.trusted || p.is_admin))),
    };
  }
  providers() { return this.cfg.authProviders || []; }
  // return to the bare site URL (a #route there would collide with the OAuth response); remember the route ourselves
  _returnUrl() {
    sessionStorage.setItem("nr.returnTo", location.pathname + location.search);
    return location.origin + "/";
  }
  async signInWith(provider) {
    const { error } = await this.sb.auth.signInWithOAuth({ provider, options: { redirectTo: this._returnUrl() } });
    if (error) throw error;
  }
  async linkWith(provider) {
    const { error } = await this.sb.auth.linkIdentity({ provider, options: { redirectTo: this._returnUrl() } });
    if (error) throw error;
  }
  // anonymous session + handle
  async signIn(handle) {
    if (!this.session) {
      const { data, error } = await this.sb.auth.signInAnonymously();
      if (error) throw error;
      this.session = data.session;
    }
    await this.claimHandle(handle);
  }
  async claimHandle(handle) {
    const { error } = await this.sb.rpc("claim_handle", { h: String(handle).replace(/^@/, "").trim() });
    if (error) throw new Error(error.message);
    await this._loadProfile();
    this.listeners.forEach((f) => f(this.user()));
  }
  async signOut() {
    await this.sb.auth.signOut();
    this.session = null;
    this.profile = null;
    this.listeners.forEach((f) => f(null));
  }
  onAuth(f) { this.listeners.push(f); }

  // every row of a query, 1000 at a time (the API caps a single response at 1000)
  async _all(q) {
    const out = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await q().range(from, from + 999);
      if (error) return { data: null, error };
      out.push(...data);
      if (data.length < 1000) return { data: out, error: null };
    }
  }

  // the last list this browser saw, for an instant first paint; null if none
  cached() {
    try {
      const c = JSON.parse(localStorage.getItem("nr.cache"));
      if (!c || !Array.isArray(c.recipes)) return null;
      this.trusted = new Set(c.trusted || []);
      return c.recipes;
    } catch { return null; }
  }

  _row(r) {
    return normalize({ ...r, author: { handle: r.author_handle, url: r.author_url || undefined }, date: r.date || r.created_at },
      r.origin === "repo" ? "repo" : "db");
  }

  async list() {
    const u = this.user();
    const [{ data: rows, error: e1 }, { data: stats, error: e2 }, mine, { data: tr }] = await Promise.all([
      this._all(() => this.sb.from("recipes").select(SUMMARY).order("id")),
      this._all(() => this.sb.from("recipe_stats").select("recipe_id,score,comments,reproductions,repro_partial,repro_failed").order("recipe_id")),
      u ? this._all(() => this.sb.from("votes").select("recipe_id,value").eq("user_id", u.id).order("recipe_id")) : Promise.resolve({ data: [] }),
      this.sb.from("profiles").select("handle").or("trusted.eq.true,is_admin.eq.true"), // marked names: trusted publishers and admins
    ]);
    if (e1 || e2) throw e1 || e2;
    this.trusted = new Set((tr || []).map((p) => p.handle));
    const st = Object.fromEntries((stats || []).map((s) => [s.recipe_id, s]));
    const mv = Object.fromEntries((mine.data || []).map((v) => [v.recipe_id, v.value]));
    const out = (rows || []).map((r) => ({ ...this._row(r), score: st[r.id]?.score ?? 0, comments: st[r.id]?.comments ?? 0,
      reproductions: st[r.id]?.reproductions ?? 0, repro_partial: st[r.id]?.repro_partial ?? 0, repro_failed: st[r.id]?.repro_failed ?? 0, myVote: mv[r.id] || 0 }));
    try { localStorage.setItem("nr.cache", JSON.stringify({ at: Date.now(), trusted: [...this.trusted], recipes: out })); } catch { /* full */ }
    return out;
  }

  async get(id) {
    const { data, error } = await this.sb.from("recipes").select("*").eq("id", id).maybeSingle();
    if (error) throw error;
    if (!data) return null;
    const u = this.user();
    const [{ data: st }, mine] = await Promise.all([
      this.sb.from("recipe_stats").select("score,comments,reproductions,repro_partial,repro_failed").eq("recipe_id", id).maybeSingle(),
      u ? this.sb.from("votes").select("value").eq("recipe_id", id).eq("user_id", u.id).maybeSingle() : Promise.resolve({ data: null }),
    ]);
    return { ...this._row(data), score: st?.score ?? 0, comments: st?.comments ?? 0, reproductions: st?.reproductions ?? 0,
      repro_partial: st?.repro_partial ?? 0, repro_failed: st?.repro_failed ?? 0, myVote: mine.data?.value || 0 };
  }

  _need() {
    const u = this.user();
    if (!u || u.needsHandle) throw Object.assign(new Error("sign in first"), { needSignIn: true });
    return u;
  }

  async vote(id, v) {
    const u = this._need();
    const q = v ? this.sb.from("votes").upsert({ recipe_id: id, user_id: u.id, value: v })
      : this.sb.from("votes").delete().eq("recipe_id", id).eq("user_id", u.id);
    const { error } = await q;
    if (error) throw error;
  }

  async comments(id) {
    const { data, error } = await this.sb.from("comments").select("id,parent_id,author_handle,body,created_at,user_id,hidden")
      .eq("recipe_id", id).order("created_at");
    if (error) throw error;
    const ids = [...new Set((data || []).map((c) => c.user_id).filter(Boolean))];
    let av = {};
    if (ids.length) {
      const { data: ps } = await this.sb.from("profiles").select("id,avatar_url").in("id", ids);
      av = Object.fromEntries((ps || []).map((p) => [p.id, p.avatar_url]));
    }
    return (data || []).map((c) => ({ ...c, handle: c.author_handle, avatar_url: av[c.user_id] || null }));
  }

  async comment(id, body, parentId = null) {
    this._need();
    const { data, error } = await this.sb.from("comments").insert({ recipe_id: id, body, parent_id: parentId }).select().single();
    if (error) throw new Error(error.message);
    return { ...data, handle: data.author_handle };
  }

  async deleteComment(_id, cid) {
    const { error } = await this.sb.from("comments").delete().eq("id", cid);
    if (error) throw error;
  }

  async hideComment(cid, hidden = true) {
    const { error } = await this.sb.from("comments").update({ hidden }).eq("id", cid);
    if (error) throw error;
  }

  async report({ recipeId = null, commentId = null, reason }) {
    this._need();
    const { error } = await this.sb.from("reports").insert({ recipe_id: recipeId, comment_id: commentId, reason });
    if (error) throw error;
  }

  _fields(recipe) {
    return {
      name: recipe.name, description: recipe.description, model: recipe.model, neurons: recipe.neurons,
      method: recipe.method || null, sampling: recipe.sampling || null, conditional: recipe.conditional || null,
      tags: recipe.tags, examples: recipe.examples, aliases: recipe.aliases || [], source: recipe.source || null,
      notes: recipe.notes || null, dose_curve: recipe.dose_curve || null,
      confidence: recipe.confidence == null || recipe.confidence === "" ? null : Number(recipe.confidence),
    };
  }

  async submit(recipe, { draft = false } = {}) {
    this._need();
    // the database assigns the id
    const { data, error } = await this.sb.from("recipes").insert({ ...this._fields(recipe), author_handle: "", draft }).select("id").single();
    if (error) throw new Error(error.message);
    return data.id;
  }

  async update(id, recipe) {
    const { data, error } = await this.sb.from("recipes").update(this._fields(recipe)).eq("id", id).select("id");
    if (error) throw new Error(error.message);
    if (!data || !data.length) throw new Error("not allowed to edit this recipe");
  }

  async remove(id) {
    const { data, error } = await this.sb.from("recipes").delete().eq("id", id).select("id");
    if (error) throw error;
    if (!data || !data.length) throw new Error("not allowed to delete this recipe");
  }

  // {limit, used, next_at} for today's publishing; limit null = no limit
  async quota() {
    if (!this.session) return null;
    const { data, error } = await this.sb.rpc("my_recipe_quota");
    if (error) return null;
    return data;
  }

  async publishDraft(id) {
    const { error } = await this.sb.from("recipes").update({ draft: false }).eq("id", id);
    if (error) throw new Error(error.message);
  }

  async setFeatured(id, featured) {
    const { error } = await this.sb.from("recipes").update({ featured }).eq("id", id);
    if (error) throw new Error(error.message);
  }

  // interpretations: what people think one neuron does (text, confidence, readout fields); newest-confident first
  async interpretations({ model, layer, neuron, expert = null }) {
    let q = this.sb.from("interpretations").select("id,model,layer,neuron,expert,text,confidence,fields,source,method,author_handle,user_id,created_at,updated_at,hidden")
      .eq("layer", layer).eq("neuron", neuron);
    q = expert == null ? q.is("expert", null) : q.eq("expert", expert);
    if (model) q = q.eq("model", model);
    const { data, error } = await q.order("confidence", { ascending: false, nullsFirst: false }).limit(200);
    if (error) throw error;
    return data || [];
  }

  async postInterpretation(item) {
    this._need();
    const { data, error } = await this.sb.rpc("post_interpretations", { items: [item] });
    if (error) throw new Error(error.message);
    return data;
  }

  async deleteInterpretation(id) {
    const { error } = await this.sb.from("interpretations").delete().eq("id", id);
    if (error) throw new Error(error.message);
  }

  // reproductions: other people's runs of a recipe, with their own sample
  async reproductions(id) {
    const { data, error } = await this.sb.from("reproductions").select("id,author_handle,prompt,output,note,setup,result,created_at,user_id,hidden")
      .eq("recipe_id", id).order("created_at");
    if (error) throw error;
    return data || [];
  }

  async reproduce(id, { prompt, output, note, setup, result = "yes" }) {
    this._need();
    const { error } = await this.sb.from("reproductions").insert({ recipe_id: id, prompt: prompt || null, output, note: note || null,
      setup: setup || null, result, author_handle: "" });
    if (error) throw new Error(/duplicate key/.test(error.message) ? "you already reported a reproduction of this recipe" : error.message);
  }

  async deleteReproduction(rid) {
    const { error } = await this.sb.from("reproductions").delete().eq("id", rid);
    if (error) throw error;
  }

  async hideReproduction(rid, hidden = true) {
    const { error } = await this.sb.from("reproductions").update({ hidden }).eq("id", rid);
    if (error) throw error;
  }

  async mergeTag(src, dst) {
    const { data, error } = await this.sb.rpc("merge_tag", { src, dst });
    if (error) throw new Error(error.message);
    return data;
  }

  async tagAliases() {
    const { data } = await this.sb.from("tag_aliases").select("alias,tag").order("tag");
    return data || [];
  }

  // public profile by handle (avatar, X link, trusted) plus how many reproductions they've reported; null if no account
  async profile_(handle) {
    const [{ data: p }, { count }] = await Promise.all([
      this.sb.from("profiles").select("handle,x_handle,avatar_url,trusted,is_admin,created_at").ilike("handle", handle.replace(/[\\%_]/g, (c) => "\\" + c)).maybeSingle(),
      this.sb.from("reproductions").select("id", { count: "exact", head: true }).ilike("author_handle", handle.replace(/[\\%_]/g, (c) => "\\" + c)),
    ]);
    return { profile: p || null, reproductionsReported: count || 0 };
  }

  async setHidden(id, hidden) {
    const { error } = await this.sb.from("recipes").update({ hidden }).eq("id", id);
    if (error) throw error;
  }

  canEdit(r) {
    const u = this.user();
    return !!u && !u.needsHandle && (u.admin || (!!r.user_id && r.user_id === u.id));
  }

  // admin: recent moderation decisions and user reports, with the posts they're about
  async modQueue() {
    const [{ data: log, error: e1 }, { data: reports, error: e2 }] = await Promise.all([
      this.sb.from("moderation_log").select("*").order("created_at", { ascending: false }).limit(100),
      this.sb.from("reports").select("*").order("created_at", { ascending: false }).limit(100),
    ]);
    if (e1 || e2) throw e1 || e2;
    const cids = [...new Set([...log.filter((l) => l.kind === "comment").map((l) => +l.target_id), ...reports.filter((r) => r.comment_id).map((r) => r.comment_id)])];
    const rids = [...new Set([...log.filter((l) => l.kind === "recipe").map((l) => l.target_id), ...reports.filter((r) => r.recipe_id).map((r) => r.recipe_id)])];
    const pids = [...new Set(log.filter((l) => l.kind === "reproduction").map((l) => +l.target_id))];
    const uids = [...new Set(log.filter((l) => l.kind === "profile").map((l) => l.target_id))];
    const [{ data: cs }, { data: rs }, { data: ps }, { data: us }] = await Promise.all([
      cids.length ? this.sb.from("comments").select("id,recipe_id,author_handle,body,hidden").in("id", cids) : Promise.resolve({ data: [] }),
      rids.length ? this.sb.from("recipes").select("id,name,author_handle,description,hidden").in("id", rids) : Promise.resolve({ data: [] }),
      pids.length ? this.sb.from("reproductions").select("id,recipe_id,author_handle,output,note,hidden").in("id", pids) : Promise.resolve({ data: [] }),
      uids.length ? this.sb.from("profiles").select("id,handle,name_status").in("id", uids) : Promise.resolve({ data: [] }),
    ]);
    return { log, reports, comments: Object.fromEntries((cs || []).map((c) => [String(c.id), c])), recipes: Object.fromEntries((rs || []).map((r) => [r.id, r])),
      reproductions: Object.fromEntries((ps || []).map((x) => [String(x.id), x])), profiles: Object.fromEntries((us || []).map((x) => [x.id, x])) };
  }

  // the owner of a flagged name picks a new one
  async changeHandle(h) {
    const { error } = await this.sb.rpc("change_handle", { h });
    if (error) throw new Error(error.message);
    await this._loadProfile();
    this.listeners.forEach((f) => f(this.user()));
  }

  // admin: "approve" or "rename" a flagged name
  async resolveName(uid, action) {
    const { data, error } = await this.sb.rpc("resolve_name", { uid, action });
    if (error) throw new Error(error.message);
    return data;
  }

  async clearReport(id) {
    const { error } = await this.sb.from("reports").delete().eq("id", id);
    if (error) throw error;
  }

  async resolveReview(logId) {
    const { error } = await this.sb.from("moderation_log").update({ resolved_at: new Date().toISOString() }).eq("id", logId);
    if (error) throw error;
  }

  // ---- API tokens (for agents)
  apiBase() { return `${this.cfg.supabaseUrl}/functions/v1/api`; }
  async listTokens() {
    const { data, error } = await this.sb.from("api_tokens").select("id,name,prefix,created_at,last_used_at,revoked_at")
      .is("revoked_at", null).order("created_at", { ascending: false });
    if (error) throw error;
    return data || [];
  }
  async createToken(name) {
    const { data, error } = await this.sb.rpc("create_api_token", { token_name: name });
    if (error) throw new Error(error.message);
    return data;
  }
  async revokeToken(id) {
    const { error } = await this.sb.rpc("revoke_api_token", { token_id: id });
    if (error) throw error;
  }

  async idTaken(id) {
    const { data } = await this.sb.from("recipes").select("id").eq("id", id).maybeSingle();
    return !!data;
  }
}

export async function createStore(cfg) {
  if (cfg.supabaseUrl && cfg.supabaseAnonKey) {
    const s = new SupabaseStore(cfg);
    try {
      await s.init();
      return s;
    } catch (e) {
      console.error("supabase unavailable, falling back to local mode", e);
    }
  }
  const s = new LocalStore(cfg);
  await s.init();
  return s;
}

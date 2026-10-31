// jev moderation. The database calls this (pg_net, from a trigger) after every new comment or site recipe.
// It asks jev (OpenRouter typesafe/jev-router) whether the post breaks the policy in prompt.ts; "remove" hides the post,
// "review" hides it until an admin approves it. Every decision is written to moderation_log. Errors fail open: the post stays up and the error is logged.
import { createClient } from "jsr:@supabase/supabase-js@2";
import { MODERATION_PROMPT } from "./prompt.ts";

const MODEL = Deno.env.get("MODERATION_MODEL") ?? "typesafe/jev-router";
const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

function describe(kind: string, row: Record<string, unknown>): string {
  if (kind === "comment") return `New comment:\n\n${row.body}`;
  if (kind === "profile") return `New username (picked by an account without a linked X profile):\n\n${row.handle}`;
  if (kind === "interpretation") return `New neuron interpretation (what someone thinks one neuron of ${row.model} does):\n\n${row.text}\nsource: ${row.source ?? ""}\nmethod: ${row.method ?? ""}`;
  if (kind === "reproduction") return `New reproduction report (someone's own run of a recipe):\n\nresult: ${row.result ?? ""}\nsetup: ${row.setup ?? ""}\nprompt: ${row.prompt ?? ""}\noutput: ${row.output}\nnote: ${row.note ?? ""}`;
  const ex = ((row.examples as Array<Record<string, string>>) ?? [])
    .map((e, i) => `example ${i + 1} prompt: ${e.prompt}\nexample ${i + 1} output: ${e.output}` + (e.base_output ? `\nexample ${i + 1} unsteered output: ${e.base_output}` : "")).join("\n");
  return `New recipe:\n\nname: ${row.name}\ndescription: ${row.description}\ntags: ${(row.tags as string[] ?? []).join(", ")}\n` +
    `source: ${row.source ?? ""}\nnotes: ${row.notes ?? ""}\naliases: ${((row.aliases as string[]) ?? []).join(", ")}\n` +
    `dose curve measures: ${(row.dose_curve as { metric?: string } | null)?.metric ?? ""}\n${ex}`;
}

async function ask(text: string): Promise<{ verdict: string; reason: string; model: string }> {
  const r = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${Deno.env.get("OPENROUTER_API_KEY")}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://neuronary.org",
      "X-Title": "neuronary moderation",
    },
    body: JSON.stringify({ model: MODEL, messages: [{ role: "system", content: MODERATION_PROMPT }, { role: "user", content: text }] }),
  });
  if (!r.ok) throw new Error(`openrouter ${r.status}: ${(await r.text()).slice(0, 300)}`);
  const d = await r.json();
  const out: string = d.choices?.[0]?.message?.content ?? "";
  const m = out.match(/\{[\s\S]*\}/);
  const v = m ? JSON.parse(m[0]) : {};
  if (!["allow", "review", "remove"].includes(v.verdict)) throw new Error(`unparseable verdict: ${out.slice(0, 200)}`);
  return { verdict: v.verdict, reason: String(v.reason ?? "").slice(0, 300), model: d.model ?? MODEL };
}

Deno.serve(async (req) => {
  if (req.headers.get("x-moderation-secret") !== Deno.env.get("MODERATION_SECRET")) {
    return new Response("forbidden", { status: 403 });
  }
  const { kind, id } = await req.json();
  const table = ({ comment: "comments", reproduction: "reproductions", profile: "profiles", interpretation: "interpretations" } as Record<string, string>)[kind] ?? "recipes";
  const { data: row, error } = await sb.from(table).select("*").eq("id", id).maybeSingle();
  if (error || !row) return new Response("gone", { status: 200 });

  let verdict = "allow", reason = "", model = MODEL, err: string | null = null;
  try {
    ({ verdict, reason, model } = await ask(describe(kind, row)));
  } catch (e) {
    err = String(e).slice(0, 500);
  }
  if (kind === "profile") {
    // usernames can't be hidden: a removed one is renamed to user_xxxxxx; review goes to the admin queue
    if (verdict === "remove") {
      const { data: h } = await sb.rpc("rename_flagged_handle", { uid: id });
      reason = `${reason} (was "${row.handle}", renamed to ${h})`;
    } else if (verdict === "review") {
      await sb.rpc("flag_handle", { uid: id }); // the owner sees it in their account menu and can pick another
    }
  } else if (verdict === "remove" || verdict === "review") { // review: hidden until an admin approves it
    await sb.from(table).update({ hidden: true }).eq("id", id);
  }
  // a removal is a strike against the author; at 3 their posting is paused (no more moderation spend on them)
  if (verdict === "remove") {
    const uid = kind === "profile" ? id : row.user_id;
    if (uid) await sb.rpc("add_strike", { uid });
  }
  await sb.from("moderation_log").insert({ kind, target_id: String(id), verdict, reason, model, error: err });
  return Response.json({ verdict, reason });
});

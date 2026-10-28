# neuronary

A dictionary of neuron steering recipes. Each recipe is a set of MLP neurons and doses, e.g.

    L13N7956-1.0 L14N8949+1.0

which reads: in `Qwen/Qwen3.5-4B`, push layer 13 neuron 7956 by −1 and layer 14 neuron 8949 by +1.

The site is static (plain HTML/CSS/JS, no build step). Recipes live in `recipes/*.json`. Votes, comments and
on-site submissions go through `js/store.js`, which uses Supabase when `config.js` has keys and the visitor's
localStorage otherwise.

## Dose units

For `method.op = "add"` (the default), at the input of layer L's `mlp.down_proj`, where neuron activations
`silu(gate) * up` live, every token gets

    act[n] += dose * median(||resid leaving layer L||, tokens 1:) / ||W_down[:, n]||

so dose 1 moves the residual stream by one median residual norm along neuron n's output direction. The median is
measured on a fixed calibration text (in `scripts/run.py`), the same text the neuron explorer uses. On Qwen3.5-4B it
gives 24.8 at L22, against 25.4 over 2M tokens of the sweep corpus. This is the same unit Neuron Studio calls
`layer_residual_median_over_down_column_l2`, so recipes import into it directly.

`"op": "mul"` multiplies the activation by the dose instead. MoE expert neurons are written `L11E11N1234+0.6`
(`"expert"` in the JSON); the schema accepts them, `run.py` doesn't apply them yet.

## Run a recipe

    pip install torch "transformers>=5"
    python scripts/run.py recipes/evil.json --compare
    python scripts/run.py https://neuronary.org/recipes/evil.json --prompt "Tell me about yourself." --scale 0.5

Runs on CPU, CUDA or MPS. `--compare` also prints the unsteered reply; `--json out.json` writes the results in the
recipe `examples` format.

## Add a recipe

- On the site: **submit** (sign in with X or pick a name). It publishes immediately.
- By pull request: add `recipes/<id>.json` (format: `schema/recipe.schema.json`), then run
  `python scripts/build_index.py` to validate and refresh `recipes/index.json`. CI runs the same check.
- By issue: the "Recipe" issue form takes the JSON; a workflow validates it and opens the pull request.

## Files

| path | |
|---|---|
| `index.html`, `css/`, `js/`, `config.js` | the site |
| `recipes/` | one JSON file per recipe, plus the generated `index.json` |
| `schema/recipe.schema.json` | recipe format |
| `scripts/run.py` | local runner (transformers) |
| `scripts/build_index.py` | validates recipes, writes `recipes/index.json` |
| `scripts/issue_to_recipe.py` | used by the issue → pull request workflow |
| `supabase/migrations/` | database schema, row-level security, triggers |
| `scripts/sync_repo.py` | upserts repo recipes into the database |
| `dev/rls_test.py`, `dev/e2e_supabase.mjs` | backend security test, browser end-to-end test |
| `dev/fixtures.json` | demo data, loaded with `?demo` |
| `dev/shots.mjs` | headless-Chrome walkthrough: screenshots every screen, fails on console errors |
| `sketches/` | design sketches (local only, not committed) |

## Local development

    python -m http.server 8765
    open http://127.0.0.1:8765/?demo

## Agents and API

Signed-in (Twitter-verified) users create personal tokens under **API & agents** in the account menu. With a token:

- **MCP** (Claude Code, Claude Desktop, any MCP client): `https://mcczbdcymyhzfputyqcr.supabase.co/functions/v1/api/mcp`,
  header `Authorization: Bearer nry_...`. Tools: `search_recipes`, `get_recipe`, `publish_recipe`, `update_recipe`,
  `comment`, `vote`.
- **HTTP**: same base without `/mcp`: `GET /recipes`, `GET /recipes/:id`, `POST /recipes`, `PATCH /recipes/:id`,
  `POST /recipes/:id/comments`, `POST /recipes/:id/vote`, `GET /me`. Reads need no token.
- **Python**: `clients/neuronary.py` (stdlib only) wraps the API and exports `TOOLS` (JSON-schema tool definitions) plus
  `Neuronary.call(name, args)`, for giving an agent such as the neuron explorer's search/download/upload tools.
- **Skill**: `skill/neuronary/SKILL.md` teaches Claude the recipe format, dose units and tools.

Everything posted through the API goes through the same constraints, rate limits and jev moderation as the site.
Tests: `dev/api_test.py` (tokens, REST, MCP) and `dev/mcp_claude_test.sh` (a real Claude Code against the MCP server).

## Moderation

New comments and site recipes are sent to `supabase/functions/moderate` (jev, `typesafe/jev-router` on OpenRouter) with
the policy in `supabase/functions/moderate/prompt.ts`: allow, review (hidden until an admin approves) or remove.
`dev/moderation_eval.py` runs the policy over labeled examples.

## Backend (Supabase)

Votes, comments, accounts and on-site publishing live in Supabase (project `mcczbdcymyhzfputyqcr`). The database
is the source of truth for recipes; `recipes/*.json` in this repo are synced in by `scripts/sync_repo.py`
(GitHub Action `sync.yml`, on every push that touches `recipes/`). A synced recipe is only rewritten when its
file changes, so examples added on the site survive.

- Schema, rules and triggers: `supabase/migrations/`. Apply new migrations with `supabase db push` or the SQL editor.
- Sign-in: X, or an anonymous session with a picked name (anonymous users can link X later).
- Everyone reads; signed-in users write only their own rows. Handles, authorship and ownership are set by the
  database, not the client. Admins (`profiles.is_admin`; the `_lyraaaa_` X account automatically) can edit, hide
  or delete anything and read reports.
- Limits are backstops, not quotas: 1000 recipes a day for X-verified accounts, 200 for picked names, 10000 for trusted publishers, 500 reproductions an hour; comments 60 an hour and 300 a day (each one is a moderation call); picked-name sign-ups 10 an hour per IP; Supabase limits anonymous sign-ins per IP.
- `config.js` holds the project URL and anon key. Both are public by design.

Tests against a live project (they create and delete their own users and rows):

    SUPABASE_URL=... SUPABASE_ANON_KEY=... SUPABASE_SERVICE_ROLE_KEY=... python dev/rls_test.py
    SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node dev/e2e_supabase.mjs http://127.0.0.1:8765/

With `supabaseUrl` empty in `config.js` the site runs without a backend (votes and comments in localStorage,
publishing via GitHub pull request or issue).

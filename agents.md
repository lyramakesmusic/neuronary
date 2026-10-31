# neuronary for agents

You're reading this because your human wants you connected to neuronary.org, a public dictionary of neuron steering
recipes: small sets of MLP neurons in a specific model, each with a dose, plus example outputs. This page tells you how
to help them set you up. Don't ask them for their token in chat; the steps below keep it out of your conversation.

## What you'll be able to do

- `search_recipes` (text, tags, author, or neuron ids like `L14N8949`), `get_recipe`: no account needed.
- `get_neuron`: one neuron's interpretations, readouts, and the recipes using it. No account needed.
- `publish_recipe` (optionally as a private draft, with a dose curve and a confidence), `publish_interpretation`, `publish_readouts`, `update_recipe`, `report_reproduction` (you ran
  someone's recipe and it worked: attach your output), `comment`, `vote`: act publicly as your human. Only when they ask or agree, and
  show them what you'll post first.

## Setup

Pick the case that matches you, and walk your human through it.

**1. Reading only.** Nothing to set up. Use the HTTP API directly:
`GET https://mcczbdcymyhzfputyqcr.supabase.co/functions/v1/api/recipes?q=...` and `.../api/recipes/<id>`.

**2. To publish, your human needs a token.** Ask them to:
1. open https://neuronary.org, sign in with Twitter (anonymous picked names can't make tokens);
2. open the account menu (their avatar, top right) → **API & agents** → name it after you (e.g. "claude code") →
   **Create token**. The page then shows ready-made commands with the token filled in.

**3. Then, depending on what you are:**

- **Claude Code**: ask your human to run the "Claude Code" command from that page in their terminal
  (`claude mcp add --transport http neuronary https://mcczbdcymyhzfputyqcr.supabase.co/functions/v1/api/mcp --header "Authorization: Bearer nry_..."`),
  then restart you. Your tools appear as `mcp__neuronary__*`.
- **Claude Desktop**: ask them to paste the "Claude Desktop" JSON from that page into `claude_desktop_config.json`
  (Settings → Developer → Edit config) and restart Claude.
- **The neuron explorer's agent** (github.com/lyramakesmusic/neuron-explorer): your `neuronary_*` tools read the token from
  `~/.neuronary/token`. Ask your human to run the "terminal" line from the page's Neuron explorer section. It writes that
  file. No restart needed. If you don't have `neuronary_*` tools, they need to update the explorer first.
- **Anything else with HTTP**: send `Authorization: Bearer <token>` to the API. Ask your human to put the token where you
  can read it (an environment variable such as `NEURONARY_TOKEN`) rather than pasting it to you.

Confirm the setup by searching (e.g. `search_recipes` with `q: "persona"`) and, if you have a token, `GET /me`.

## Recipe format and units

`L13N7956-1.0 L14N8949+1.0` means: in layer 13 push neuron 7956 by −1, in layer 14 push neuron 8949 by +1 (0-indexed;
MoE: name the expert too, `L12E12N1234+0.6`; expert neurons only fire on tokens routed to them, so dose units there are untested). At the input of layer L's `mlp.down_proj`, every token:

    act[n] += dose * median(||residual leaving layer L||) / ||W_down[:, n]||

Dose 1 = one median residual norm along the neuron's output direction. One neuron is usually coherent around 0.5–1.0;
doses add across neurons. Avoid the first and last ~5 layers. For loops, use a mild repetition penalty (1.05–1.15), a
lower dose, or sampling. A negative dose is not the opposite behavior: many neurons act as gates.

## Bulk upload

No batch endpoint: one `publish_recipe` per recipe. For a batch, check every recipe has a name, description, model,
tags, neurons and at least one real example before sending any; send them with `draft: true`, then show your human the
list and publish each with `update_recipe {id, draft: false}` once they've looked. The Python client's
`publish_many(recipes, draft=True, dry_run=False)` does this. Limits are generous backstops (1000 recipes a day for X-verified accounts, 200 for picked-name ones, 10000 for trusted
publishers); a `429 rate limit` error says when the next slot opens, so stop there.

## Confidence

Recipes take an optional `confidence` (0–1): how sure the author is that it does what the description says. Under 0.3
shows as questionable (red). Pass it in `publish_recipe` / `update_recipe`.

## Neurons: interpretations and readouts (the atlas)

Two separate things, both shown on the neuron's page and on single-neuron recipes; read them with `get_neuron` /
`GET /neurons/L17N6555?model=Qwen/Qwen3.5-4B`.

**Interpretations** are like reproductions: anyone's read of what the neuron does. `publish_interpretation` /
`POST /interpretations` (token):

    {"model": "Qwen/Qwen3.5-4B", "unit": "L17N6555",
     "text": "(+) ascribes a measured attribute (of density, has a thickness); (−) copula predication (flow is turbulent)",
     "confidence": 0.7, "method": "optional, how you got it"}

`text` covers both poles. One per neuron per model per author; posting again replaces yours. Batches: `{"items": [...]}`
(up to 1000). Daily backstops: 200 (picked name), 1000 (X-verified); none for trusted publishers, who also skip moderation.

**Readouts** belong to the neuron: named blocks pushed once with the original upload and added to later when a new lens
comes out. A block with a new name is added; one with an existing name replaces it (if it's yours). `publish_readouts` /
`POST /readouts` (token; an X-verified account, and trusted-publisher status for a whole model):

    {"model": "Qwen/Qwen3.5-4B", "unit": "L17N6555", "source": "neuron explorer", "fields": [ ...blocks... ]}

Blocks, drawn like the neuron explorer (a + row and a − row each):

- `tokens`: `{"type": "tokens", "name": "R lens", "rows": {"+": ["tok", ["tok", 0.4]], "-": [...]}}` (lens reads, drivers)
- `contexts`: `{"type": "contexts", "name": "activations", "note": "FineFineWeb", "tags": {"+": [["chemistry", 1.4]]},
  "rows": {"+": [{"text": "flow of brine ⟦of⟧ density", "tag": "hydraulic engineering", "value": 2.05}], "-": [...]}}`;
  mark hot tokens with `⟦…⟧`, or `⟦…|0.4⟧` for a heat from 0 to 1
- `units`: `{"type": "units", "name": "net", "groups": [{"label": "fed by", "sign": "+", "note": "323 upstream neurons",
  "items": [["title", 2], ["these", 10]]}]}`
- `heads`: `{"type": "heads", "name": "heads", "rows": {"q": [["L20 h2-3", 5]], "k": [...], "v": [...], "o": [...]}}`
- `stats`: `{"type": "stats", "name": "stats", "items": [["typical high", 6.2]]}`
- `text`: `{"type": "text", "name": "note", "text": "..."}`

## Publishing well

- Real examples only: the prompt and the steered output verbatim, ideally with the unsteered reply as `base_output`.
- If it needs a repetition penalty or sampling, put it in `sampling`.
- Moderation (jev): dark, hostile and explicit adult personas are fine. Hate-figure or extremist personas, anything
  sexual involving minors, harassment, doxxing and spam are removed; some posts are held for human review.

More: https://neuronary.org/about · source: https://github.com/lyramakesmusic/neuronary

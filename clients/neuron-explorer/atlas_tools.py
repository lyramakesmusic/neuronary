"""neuronary atlas tools for the neuron explorer's agent (explorer/agent_mcp.py). Paste this whole file into agent_mcp.py
(after TOOLS and the neuronary() helper; it uses get(), neuronary() and MODEL from there), then:

1. Append ATLAS_TOOLS to TOOLS:            TOOLS += ATLAS_TOOLS
2. At the top of call(name, a):            if name in ATLAS_HANDLERS: return ATLAS_HANDLERS[name](a)
3. In agent_prompt.md, a line like:        "To record what a neuron does on neuronary, use neuronary_interpret: text as
   '(+) …; (−) …' covering both poles, an honest confidence, readouts attached automatically. Only when the person asks."

Uses agent_mcp.py's own get(), neuronary() and MODEL. Readouts come from the explorer's endpoints (lens, steer lens, web
summary, heads); anything else the agent has (J++ lens, FineFineWeb firings) goes in extra_fields as neuronary blocks.
Field format: https://neuronary.org/agents.md ("Interpretations").
"""

LN_ = {"layer": {"type": "integer"}, "n": {"type": "integer"}}

ATLAS_TOOLS = [
    {"name": "neuronary_neuron", "description": "What neuronary.org has on one neuron of this model: everyone's "
     "interpretations (text, confidence, readouts) and the recipes that use it.",
     "inputSchema": {"type": "object", "properties": LN_, "required": ["layer", "n"]}},
    {"name": "neuronary_interpret", "description": "Post (or replace) the person's interpretation of one neuron on "
     "neuronary.org. text covers both poles: '(+) ascribes a measured attribute (of density, has a thickness); (−) copula "
     "predication (flow is turbulent)'. confidence 0-1 is how sure you are, honestly: under 0.3 shows as questionable. "
     "The explorer's readouts (lens, steer lens, web, heads) are attached unless readouts is false; add anything else as "
     "extra_fields (neuronary field blocks, e.g. {type: 'contexts', name: 'activations', note: 'FineFineWeb', tags: {...}, "
     "rows: {'+': [{text: 'flow of brine ⟦of⟧ density', tag: 'hydraulic engineering', value: 2.05}], '-': [...]}}). "
     "Only when the person asks or agrees; show them the text and confidence first.",
     "inputSchema": {"type": "object", "properties": {
         **LN_, "text": {"type": "string"}, "confidence": {"type": "number", "minimum": 0, "maximum": 1},
         "method": {"type": "string", "description": "how you got it, e.g. 'lens + 12 steered rollouts at ±0.8'"},
         "readouts": {"type": "boolean", "default": True},
         "extra_fields": {"type": "array", "items": {"type": "object"}}},
                     "required": ["layer", "n", "text", "confidence"]}},
]


def _toks(xs, top=12):
    """lens lists come as strings, [tok, value] pairs or {tok|token, ...} dicts; neuronary takes tok or [tok, value]"""
    out = []
    for x in (xs or [])[:top]:
        if isinstance(x, str):
            out.append(x)
        elif isinstance(x, (list, tuple)) and x:
            out.append([str(x[0]), round(float(x[1]), 3)] if len(x) > 1 and isinstance(x[1], (int, float)) else str(x[0]))
        elif isinstance(x, dict):
            t = x.get("tok", x.get("token", x.get("t")))
            v = x.get("w", x.get("n", x.get("z", x.get("p"))))
            if t is not None:
                out.append([str(t), round(float(v), 3)] if isinstance(v, (int, float)) else str(t))
    return out


def _head_label(h):
    if isinstance(h, str):
        return h
    if isinstance(h, dict):
        lab = h.get("label") or f"L{h.get('layer')} h{h.get('head', h.get('heads'))}"
        v = h.get("z", h.get("score", h.get("w")))
        return [lab, round(float(v), 2)] if isinstance(v, (int, float)) else lab
    if isinstance(h, (list, tuple)) and h:
        return [str(h[0]), round(float(h[1]), 2)] if len(h) > 1 and isinstance(h[1], (int, float)) else str(h[0])
    return str(h)


def _readouts(layer, n):
    fields = []
    try:
        d = get("/api/agent/neuron", layer=layer, n=n)
        if d.get("lens_up") or d.get("lens_down"):
            fields.append({"type": "tokens", "name": "logit lens", "rows": {"+": _toks(d.get("lens_up")), "-": _toks(d.get("lens_down"))}})
        if d.get("steer_up") or d.get("steer_down"):
            fields.append({"type": "tokens", "name": "steer lens", "rows": {"+": _toks(d.get("steer_up")), "-": _toks(d.get("steer_down"))}})
        act = d.get("activation")
        if act:
            fields.append({"type": "stats", "name": "activation range", "items": [["max", act.get("act_max")], ["min", act.get("act_min")],
                                                                                 ["over tokens", act.get("over_tokens")], ["source", act.get("source")]]})
    except Exception:
        pass
    try:
        w = get("/api/web/summary", layer=layer, n=n)
        up, down = w.get("up", {}), w.get("down", {})
        groups = [g for g in [
            {"label": "fed by", "sign": "+", "note": f"{up.get('neurons', 0)} upstream neurons", "items": [[x["tok"], x.get("n")] for x in up.get("fed_by", [])[:24]]},
            {"label": "held back by", "sign": "-", "items": [[x["tok"], x.get("n")] for x in up.get("held_by", [])[:24]]},
            {"label": "feeds → pushes toward", "sign": "+", "note": f"{down.get('neurons', 0)} downstream neurons", "items": [[x["tok"], x.get("n")] for x in down.get("toward", [])[:24]]},
            {"label": "feeds → pushes away from", "sign": "-", "items": [[x["tok"], x.get("n")] for x in down.get("away", [])[:24]]},
        ] if g["items"]]
        if groups:
            fields.append({"type": "units", "name": "net", "note": f"{w.get('links', 0)} links · {w.get('src', 'steer')} lens, ranked by lift over each layer", "groups": groups})
    except Exception:
        pass
    try:
        h = get("/api/neuron/heads", layer=layer, n=n).get("roles") or {}
        rows = {k: [_head_label(x) for x in (h.get(k) or [])[:8]] for k in ("q", "k", "v", "o")}
        if any(rows.values()):
            fields.append({"type": "heads", "name": "heads", "rows": rows})
    except Exception:
        pass
    return fields


def _neuron(a):
    return neuronary("GET", f"/neurons/L{int(a['layer'])}N{int(a['n'])}", params={"model": MODEL})  # noqa: F821 (agent_mcp.py)


def _interpret(a):
    layer, n = int(a["layer"]), int(a["n"])
    fields = (_readouts(layer, n) if a.get("readouts", True) else []) + list(a.get("extra_fields") or [])
    body = {"model": MODEL, "layer": layer, "neuron": n, "text": a["text"], "confidence": float(a["confidence"]),  # noqa: F821
            "fields": fields, "source": "neuron explorer"}
    if a.get("method"):
        body["method"] = a["method"]
    r = neuronary("POST", "/interpretations", body)  # noqa: F821
    r["url"] = f"https://neuronary.org/n/L{layer}N{n}"
    r["fields_attached"] = [f.get("name") for f in fields]
    return r


ATLAS_HANDLERS = {"neuronary_neuron": _neuron, "neuronary_interpret": _interpret}

"""neuronary.org client: search, download, publish, comment, vote. Standard library only.

    from neuronary import Neuronary
    nr = Neuronary(token="nry_...")          # token from neuronary.org -> account menu -> API & agents
    nr.search("L14N8949")
    r = nr.get("<recipe id>")
    nr.publish(name="...", description="...", model="Qwen/Qwen3.5-4B", recipe="L13N7956-1.0 L14N8949+1.0",
               tags=["persona"], examples=[{"prompt": "...", "output": "..."}])

For agent frameworks, TOOLS has JSON-schema tool definitions and `nr.call(name, args)` dispatches them, e.g. to give the
neuron explorer's agent search/download/upload tools. CLI: python neuronary.py search evil | get <id> | publish file.json
"""
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request

API = os.environ.get("NEURONARY_API", "https://mcczbdcymyhzfputyqcr.supabase.co/functions/v1/api")


class NeuronaryError(Exception):
    pass


class Neuronary:
    def __init__(self, token=None, api=API):
        self.token = token or os.environ.get("NEURONARY_TOKEN")
        self.api = api.rstrip("/")

    def _req(self, method, path, body=None, params=None):
        url = self.api + path + ("?" + urllib.parse.urlencode({k: v for k, v in (params or {}).items() if v is not None}) if params else "")
        req = urllib.request.Request(url, method=method, data=None if body is None else json.dumps(body).encode())
        req.add_header("Content-Type", "application/json")
        if self.token:
            req.add_header("Authorization", f"Bearer {self.token}")
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                return json.load(r)
        except urllib.error.HTTPError as e:
            try:
                msg = json.load(e).get("error")
            except Exception:
                msg = str(e)
            raise NeuronaryError(f"{e.code}: {msg}") from None

    def search(self, q=None, tag=None, model=None, author=None, sort="top", limit=20):
        return self._req("GET", "/recipes", params=dict(q=q, tag=tag, model=model, author=author, sort=sort, limit=limit))

    def get(self, recipe_id):
        return self._req("GET", f"/recipes/{recipe_id}")

    def publish(self, **recipe):
        """name, description, model, recipe="L13N7956-1.0 ..." (or neurons=[...]), tags, examples, sampling?, source?, notes?"""
        return self._req("POST", "/recipes", recipe)

    def publish_many(self, recipes, draft=False, dry_run=False):
        """Publish a list of recipe dicts one at a time. Returns [{"name", "ok", "id"/"error"}] in order.
        dry_run: only check each has the required fields. draft=True saves them privately (publish later with
        update(id, draft=False)). Stops at the daily limit and reports when the next slot opens."""
        need = ["name", "description", "model", "tags", "examples"]
        out = []
        for r in recipes:
            missing = [k for k in need if not r.get(k)] + ([] if r.get("recipe") or r.get("neurons") else ["recipe or neurons"])
            if missing:
                out.append({"name": r.get("name"), "ok": False, "error": "missing " + ", ".join(missing)})
                continue
            if dry_run:
                out.append({"name": r["name"], "ok": True})
                continue
            try:
                res = self.publish(**r, **({"draft": True} if draft else {}))
                out.append({"name": r["name"], "ok": True, "id": res["id"], "url": res.get("url")})
            except NeuronaryError as e:
                out.append({"name": r["name"], "ok": False, "error": str(e)})
                if "rate limit" in str(e):
                    break
        return out

    def update(self, recipe_id, **fields):
        return self._req("PATCH", f"/recipes/{recipe_id}", fields)

    def comment(self, recipe_id, body, parent_id=None):
        return self._req("POST", f"/recipes/{recipe_id}/comments", {"body": body, "parent_id": parent_id})

    def vote(self, recipe_id, value):
        return self._req("POST", f"/recipes/{recipe_id}/vote", {"value": value})

    def report_reproduction(self, recipe_id, output, prompt=None, note=None):
        """say you reproduced someone else's recipe, with the steered output you got"""
        return self._req("POST", f"/recipes/{recipe_id}/reproductions", {"output": output, "prompt": prompt, "note": note})

    def neuron(self, neuron, model=None):
        """one neuron's interpretations, readouts and recipes; neuron like 'L17N6555'"""
        return self._req("GET", f"/neurons/{neuron}", params={"model": model} if model else None)

    def interpret(self, model, unit, text, confidence=None, method=None):
        """your read of a neuron, like a reproduction: text '(+) ...; (-) ...', confidence 0-1"""
        return self._req("POST", "/interpretations", {"model": model, "unit": unit, "text": text, "confidence": confidence, "method": method})

    def readouts(self, model, unit, fields, source=None):
        """attach readout blocks to a neuron (same name replaces yours, new names add); formats in agents.md"""
        return self._req("POST", "/readouts", {"model": model, "unit": unit, "fields": fields, "source": source})

    def me(self):
        return self._req("GET", "/me")

    def call(self, name, args):
        """dispatch a TOOLS call by name"""
        args = dict(args or {})
        if name == "search_recipes":
            return self.search(**args)
        if name == "get_recipe":
            return self.get(args["id"])
        if name == "publish_recipe":
            return self.publish(**args)
        if name == "update_recipe":
            rid = args.pop("id")
            return self.update(rid, **args)
        if name == "comment":
            return self.comment(args["id"], args["body"], args.get("parent_id"))
        if name == "vote":
            return self.vote(args["id"], args["value"])
        if name == "report_reproduction":
            return self.report_reproduction(args["id"], args["output"], args.get("prompt"), args.get("note"))
        if name == "get_neuron":
            return self.neuron(args["neuron"], args.get("model"))
        if name == "publish_interpretation":
            return self.interpret(args["model"], args["unit"], args["text"], args.get("confidence"), args.get("method"))
        if name == "publish_readouts":
            return self.readouts(args["model"], args["unit"], args["fields"], args.get("source"))
        raise NeuronaryError(f"unknown tool {name}")


_NEURONS = {"type": "array", "items": {"type": "object", "properties": {"layer": {"type": "integer"}, "neuron": {"type": "integer"},
                                                                         "dose": {"type": "number"}}, "required": ["layer", "neuron", "dose"]}}
_EXAMPLES = {"type": "array", "items": {"type": "object", "properties": {"prompt": {"type": "string"}, "output": {"type": "string"},
                                                                          "base_output": {"type": "string"}}, "required": ["prompt", "output"]}}
TOOLS = [
    {"name": "search_recipes", "description": "Search neuronary.org steering recipes by text, tag, model, author or neuron id (e.g. L14N8949).",
     "input_schema": {"type": "object", "properties": {"q": {"type": "string"}, "tag": {"type": "string"}, "model": {"type": "string"},
                                                       "author": {"type": "string"}, "sort": {"type": "string", "enum": ["top", "new", "hot"]},
                                                       "limit": {"type": "integer"}}}},
    {"name": "get_recipe", "description": "Download one recipe: neurons, doses, method, recommended sampling, examples.",
     "input_schema": {"type": "object", "properties": {"id": {"type": "string"}}, "required": ["id"]}},
    {"name": "publish_recipe", "description": "Publish a recipe to neuronary.org as the token's owner. Needs at least one real example (prompt + verbatim steered output). Ask the user first.",
     "input_schema": {"type": "object", "properties": {"name": {"type": "string"}, "description": {"type": "string"}, "model": {"type": "string"},
                                                       "recipe": {"type": "string", "description": "e.g. L13N7956-1.0 L14N8949+1.0"},
                                                       "neurons": _NEURONS, "tags": {"type": "array", "items": {"type": "string"}},
                                                       "examples": _EXAMPLES, "sampling": {"type": "object"}, "source": {"type": "string"},
                                                       "notes": {"type": "string"},
                                                       "dose_curve": {"type": "object", "description": "{metric: 'meows per answer', points: [{dose, value}, ...]}"},
                                                       "draft": {"type": "boolean", "description": "true: private until update_recipe {draft: false}"}},
                      "required": ["name", "description", "model", "tags", "examples"]}},
    {"name": "update_recipe", "description": "Edit one of your own recipes (e.g. add examples; examples replaces the list).",
     "input_schema": {"type": "object", "properties": {"id": {"type": "string"}, "name": {"type": "string"}, "description": {"type": "string"},
                                                       "tags": {"type": "array", "items": {"type": "string"}}, "examples": _EXAMPLES,
                                                       "sampling": {"type": "object"}, "notes": {"type": "string"},
                                                       "dose_curve": {"type": "object"}, "draft": {"type": "boolean", "description": "false publishes a draft"}},
                      "required": ["id"]}},
    {"name": "comment", "description": "Comment on a recipe.",
     "input_schema": {"type": "object", "properties": {"id": {"type": "string"}, "body": {"type": "string"}, "parent_id": {"type": "integer"}},
                      "required": ["id", "body"]}},
    {"name": "report_reproduction", "description": "Say you reproduced someone else's recipe, with the steered output you got. One per recipe; sending again replaces yours.",
     "input_schema": {"type": "object", "properties": {"id": {"type": "string"}, "output": {"type": "string"}, "prompt": {"type": "string"},
                                                       "note": {"type": "string", "description": "setup, e.g. bf16, greedy, transformers"}},
                      "required": ["id", "output"]}},
    {"name": "get_neuron", "description": "One neuron's interpretations, readouts and the recipes that use it.",
     "input_schema": {"type": "object", "properties": {"neuron": {"type": "string", "description": "e.g. L17N6555"}, "model": {"type": "string"}},
                      "required": ["neuron"]}},
    {"name": "publish_interpretation", "description": "Your read of what a neuron does, like a reproduction: text '(+) ...; (-) ...' covering both poles and an honest confidence 0-1. One per neuron per model; sending again replaces yours. Ask the user first.",
     "input_schema": {"type": "object", "properties": {"model": {"type": "string"}, "unit": {"type": "string", "description": "e.g. L17N6555"},
                                                       "text": {"type": "string"}, "confidence": {"type": "number"}, "method": {"type": "string"}},
                      "required": ["model", "unit", "text"]}},
    {"name": "publish_readouts", "description": "Attach measurements to a neuron as named blocks (tokens, contexts, units, heads, stats, text; see neuronary.org/agents.md). Send once; new names add, same names replace yours.",
     "input_schema": {"type": "object", "properties": {"model": {"type": "string"}, "unit": {"type": "string"}, "fields": {"type": "array", "items": {"type": "object"}},
                                                       "source": {"type": "string"}}, "required": ["model", "unit", "fields"]}},
    {"name": "vote", "description": "Vote on a recipe: 1, -1, or 0 to clear.",
     "input_schema": {"type": "object", "properties": {"id": {"type": "string"}, "value": {"type": "integer", "enum": [-1, 0, 1]}},
                      "required": ["id", "value"]}},
]


def _main(argv):
    nr = Neuronary()
    if len(argv) >= 2 and argv[0] == "search":
        out = nr.search(" ".join(argv[1:]))
    elif len(argv) == 2 and argv[0] == "get":
        out = nr.get(argv[1])
    elif len(argv) == 2 and argv[0] == "publish":
        out = nr.publish(**json.load(open(argv[1], encoding="utf-8")))
    else:
        print(__doc__)
        return 1
    print(json.dumps(out, indent=2, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(_main(sys.argv[1:]))

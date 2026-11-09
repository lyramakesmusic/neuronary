"""Send neuronary's single-neuron recipes to Neuronpedia (type `neuronary`), per Johnny Lin's instructions: each shows
on the neuron's page, credited to its author, linking back to neuronary.org.

    python scripts/to_neuronpedia.py                 # dry run: writes work/neuronpedia_items.json, sends nothing
    python scripts/to_neuronpedia.py --check         # access check only (writes nothing on Neuronpedia)
    python scripts/to_neuronpedia.py --send          # one item, verify its page, then the rest in batches of 500

The key comes from NEURONPEDIA_API_KEY or ~/.neuronary/neuronpedia_key; it is never printed.
Skipped, with a count each: multi-neuron recipes, models Neuronpedia doesn't have, MoE expert neurons, and recipes
whose method isn't the default add x median-residual units (steerStrength would mean something else).
Retries are safe: Neuronpedia skips items that are already there.
"""
import json
import os
import sys
import time
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor

API = "https://mcczbdcymyhzfputyqcr.supabase.co/functions/v1/api"
NP = "https://www.neuronpedia.org"
SITE = "https://neuronary.org"
MODELS = {"Qwen/Qwen3.5-4B": "qwen3.5-4b", "Qwen/Qwen3-8B": "qwen3-8b"}  # neuronary model -> Neuronpedia modelId
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def key():
    k = os.environ.get("NEURONPEDIA_API_KEY")
    if not k:
        p = os.path.expanduser("~/.neuronary/neuronpedia_key")
        k = open(p).read().strip() if os.path.exists(p) else None
    if not k:
        sys.exit("no key: set NEURONPEDIA_API_KEY or put it in ~/.neuronary/neuronpedia_key")
    return k


def req(method, url, body=None, headers=None, timeout=120):
    r = urllib.request.Request(url, method=method, data=json.dumps(body).encode() if body is not None else None,
                               headers={"Content-Type": "application/json", "User-Agent": "neuronary-sync", **(headers or {})})
    try:
        with urllib.request.urlopen(r, timeout=timeout) as x:
            return x.status, json.load(x)
    except urllib.error.HTTPError as e:
        t = e.read().decode()
        try:
            return e.code, json.loads(t)
        except Exception:
            return e.code, t[:500]


def all_recipes():
    out, off = [], 0
    while True:
        _, d = req("GET", f"{API}/recipes?sort=new&limit=100&offset={off}")
        out += d["recipes"]
        off += 100
        if off >= d["count"]:
            return out


def clip(s, n):
    s = str(s or "")
    return s if len(s) <= n else s[: n - 1] + "…"


def item(r):
    n = r["neurons"][0]
    ex = [{k: clip(e.get(k), 2500) for k in ("prompt", "output", "base_output") if e.get(k)} for e in (r.get("examples") or [])[:2]]
    meta = {"description": r["description"], "recipe": r["recipe"], "tags": r["tags"], "examples": ex}
    if r.get("sampling"):
        meta["sampling"] = r["sampling"]
    while len(json.dumps(meta, ensure_ascii=False).encode()) > 16000 and meta["examples"]:  # 16 KB cap
        meta["examples"] = meta["examples"][:-1]
    return {"modelId": MODELS[r["model"]], "layer": str(n["layer"]), "index": str(n["neuron"]),
            "description": clip(r["name"], 2000), "typeName": "neuronary",
            "pole": "POSITIVE" if n["dose"] > 0 else "NEGATIVE", "aspect": "STEERING", "steerStrength": n["dose"],
            "sourceUrl": f"{SITE}/r/{r['id']}", "contributorName": r["author"], "contributorUrl": f"{SITE}/u/{r['author']}",
            "metadata": meta}


def build():
    rs = all_recipes()
    skip = {"multi-neuron": 0, "model not on Neuronpedia": 0, "expert neuron": 0, "non-default method": 0, "zero dose": 0}
    keep = []
    for r in rs:
        m = r.get("method") or {}
        if len(r["neurons"]) != 1: skip["multi-neuron"] += 1
        elif r["model"] not in MODELS: skip["model not on Neuronpedia"] += 1
        elif r["neurons"][0].get("expert") is not None: skip["expert neuron"] += 1
        elif m.get("op", "add") != "add" or m.get("normalization", "layer_residual_median_over_down_column_l2") != "layer_residual_median_over_down_column_l2" or m.get("apply_to", "all_tokens") != "all_tokens":
            skip["non-default method"] += 1
        elif not r["neurons"][0]["dose"]: skip["zero dose"] += 1
        else: keep.append(r["id"])
    with ThreadPoolExecutor(8) as ex:  # the list has no examples: fetch each recipe
        full = list(ex.map(lambda i: req("GET", f"{API}/recipes/{i}")[1], keep))
    items = [item(r) for r in full]
    return rs, skip, items


def page_has(it, k):
    """the neuron's page lists our explanation"""
    s, d = req("GET", f"{NP}/api/feature/{it['modelId']}/{it['layer']}/{it['index']}", headers={"x-api-key": k})
    return s == 200 and any(e.get("typeName") == "neuronary" and e.get("description") == it["description"] for e in (d.get("explanations") or []))


def main():
    send, check = "--send" in sys.argv, "--check" in sys.argv
    if check or send:
        k = key()
        s, d = req("POST", f"{NP}/api/explanation/new", {"explanations": [{"modelId": "access-check", "layer": "0", "index": "0",
                                                                          "description": "access check", "typeName": "neuronary"}]}, {"x-api-key": k})
        msg = json.dumps(d)[:200]
        if s == 404 and "access-check" in msg:
            print("access: ok")
        else:
            sys.exit(f"access: {s} {msg}\n(401: key missing/wrong. 403 or 'Unknown explanation type': not approved yet, "
                     "email johnny@neuronpedia.org with the Neuronpedia username and ask to upload to `neuronary`)")
        if check:
            return
    rs, skip, items = build()
    os.makedirs(os.path.join(ROOT, "work"), exist_ok=True)
    out = os.path.join(ROOT, "work", "neuronpedia_items.json")
    json.dump(items, open(out, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    by = {}
    for it in items:
        by[it["modelId"]] = by.get(it["modelId"], 0) + 1
    print(f"{len(rs)} public recipes -> {len(items)} items {by}; skipped {skip}\nwrote {out}")
    if not send:
        print("dry run: nothing sent (--send to upload)")
        return
    first, rest = items[:1], items[1:]
    s, d = req("POST", f"{NP}/api/explanation/new", {"explanations": first}, {"x-api-key": k})
    print("first item:", s, json.dumps(d)[:300])
    if s >= 300:
        sys.exit("stopping: fix the first item")
    time.sleep(2)
    if not page_has(first[0], k):
        sys.exit(f"stopping: {NP}/{first[0]['modelId']}/{first[0]['layer']}/{first[0]['index']} doesn't show it yet; check by hand")
    print(f"first item is on {NP}/{first[0]['modelId']}/{first[0]['layer']}/{first[0]['index']}")
    created = skipped = 0
    for i in range(0, len(rest), 500):
        b = rest[i:i + 500]
        s, d = req("POST", f"{NP}/api/explanation/new", {"explanations": b}, {"x-api-key": k}, timeout=300)
        if s >= 300:
            sys.exit(f"batch {i // 500 + 1}: {s} {json.dumps(d)[:500]}")
        created += len(d.get("created", []))
        skipped += d.get("skipped", 0)
        print(f"batch {i // 500 + 1}: created {len(d.get('created', []))}, skipped {d.get('skipped', 0)}")
    print(f"done: {created + len(first)} created, {skipped} already there")


if __name__ == "__main__":
    main()

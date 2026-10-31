"""Checks the interpretation (atlas) rules and recipe confidence against the real project, then deletes what it made.

    source ~/.neuronary/env.sh && python dev/atlas_test.py
"""
import json
import os
import secrets
import sys
import urllib.error
import urllib.request

URL = os.environ["SUPABASE_URL"].rstrip("/")
ANON = os.environ["SUPABASE_ANON_KEY"]
SERVICE = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
API = URL + "/functions/v1/api"
fails = []


def call(method, url, token=None, body=None, key=ANON, prefer=None):
    req = urllib.request.Request(url if url.startswith("http") else URL + url, method=method, data=json.dumps(body).encode() if body is not None else None)
    req.add_header("apikey", key)
    req.add_header("Authorization", "Bearer " + (token or key))
    req.add_header("Content-Type", "application/json")
    if prefer: req.add_header("Prefer", prefer)
    try:
        with urllib.request.urlopen(req) as r:
            t = r.read().decode()
            return r.status, json.loads(t) if t else None
    except urllib.error.HTTPError as e:
        t = e.read().decode()
        try: return e.code, json.loads(t)
        except Exception: return e.code, t


def check(name, ok, detail=""):
    print(("ok   " if ok else "FAIL ") + name + ("" if ok else f"  {str(detail)[:300]}"))
    if not ok: fails.append(name)


users = []
try:
    s, d = call("POST", "/auth/v1/signup", body={"data": {}}); ta, ua = d["access_token"], d["user"]["id"]; users.append(ua)
    s, d = call("POST", "/auth/v1/signup", body={"data": {}}); tb, ub = d["access_token"], d["user"]["id"]; users.append(ub)
    tag = secrets.token_hex(3)
    call("POST", "/rest/v1/rpc/claim_handle", ta, {"h": f"atla{tag}"})
    call("POST", "/rest/v1/rpc/claim_handle", tb, {"h": f"atlb{tag}"})
    L, N = 3, 900000 + int(tag, 16) % 90000  # a neuron nobody uses
    item = {"model": "Qwen/Qwen3.5-4B", "layer": L, "neuron": N, "text": "(+) test pole; (−) other test pole", "confidence": 0.4}
    ro = {"model": "Qwen/Qwen3.5-4B", "layer": L, "neuron": N, "fields": [{"type": "tokens", "name": "R lens", "rows": {"+": ["a", ["b", 0.5]], "-": ["c"]}}]}

    s, d = call("POST", "/rest/v1/rpc/post_interpretations", None, {"items": [item]})
    check("signed-out users can't post", s >= 400, d)
    s, d = call("POST", "/rest/v1/rpc/post_interpretations", ta, {"items": [item]})
    check("a signed-in user posts an interpretation", s == 200 and d["count"] == 1, d)
    s, d = call("POST", "/rest/v1/rpc/post_interpretations", ta, {"items": [{**item, "text": "(+) revised; (−) revised", "confidence": 0.6}]})
    s2, rows = call("GET", f"/rest/v1/interpretations?layer=eq.{L}&neuron=eq.{N}&select=id,text,confidence,author_handle,user_id")
    check("posting again replaces your own (one per neuron per author)", s == 200 and len(rows) == 1 and rows[0]["text"].startswith("(+) revised"), rows)
    iid = rows[0]["id"] if rows else None
    check("handle is set from the account, not the payload", rows and rows[0]["author_handle"] == f"atla{tag}", rows)
    s, d = call("PATCH", f"/rest/v1/interpretations?id=eq.{iid}", tb, {"text": "hijack"}, prefer="return=representation")
    check("someone else can't edit it", s >= 400 or d == [], d)
    s, d = call("DELETE", f"/rest/v1/interpretations?id=eq.{iid}", tb, prefer="return=representation")
    check("someone else can't delete it", s >= 400 or d == [], d)
    s, d = call("POST", "/rest/v1/rpc/post_interpretations", tb, {"items": [item]})
    check("a second author gets their own row", s == 200, d)
    s, d = call("POST", "/rest/v1/rpc/post_interpretations", tb, {"items": [{**item, "confidence": 3}]})
    check("confidence must be 0-1", s >= 400, d)
    s, d = call("POST", "/rest/v1/rpc/post_readouts", tb, {"items": [ro]})
    check("picked-name accounts can't post readouts", s >= 400 and "X" in str(d), d)
    s, d = call("POST", "/rest/v1/neuron_readouts", tb, {**ro, "name": "x", "block": {}})
    check("readouts can't be inserted directly", s >= 400, d)
    s, d = call("POST", f"{API}/interpretations", None, {**item, "fields": []})
    check("API refuses readouts inside an interpretation (needs a token first)", s in (400, 401), d)
    s, d = call("POST", "/rest/v1/interpretations", tb, {**item, "user_id": ua, "author_handle": "someone"}, prefer="return=representation")
    check("direct insert can't impersonate", s >= 400 or (d and d[0]["user_id"] == ub), d)
    s, d = call("GET", f"{API}/neurons/L{L}N{N}?model=Qwen/Qwen3.5-4B")
    check("API GET /neurons returns both, plus a readouts list", s == 200 and len(d["interpretations"]) == 2 and d["readouts"] == [], d)
    s, d = call("POST", f"{API}/interpretations", None, {**item})
    check("API POST needs a token", s == 401, d)
    s, d = call("POST", "/rest/v1/rpc/post_interpretations", tb, {"items": [item] * 1001})
    check("batches over 1000 are refused", s >= 400, str(d)[:120])
    s, d = call("DELETE", f"/rest/v1/interpretations?id=eq.{iid}", ta, prefer="return=representation")
    check("the author can delete theirs", s == 200 and d, d)
finally:
    call("DELETE", f"/rest/v1/interpretations?layer=eq.{L}&neuron=eq.{N}", key=SERVICE, token=SERVICE)
    call("DELETE", f"/rest/v1/neuron_readouts?layer=eq.{L}&neuron=eq.{N}", key=SERVICE, token=SERVICE)
    for u in users:
        call("DELETE", f"/auth/v1/admin/users/{u}", key=SERVICE, token=SERVICE)
    print(f"cleaned up {len(users)} users")

print(f"\n{len(fails)} failure(s)" + (": " + ", ".join(fails) if fails else ""))
sys.exit(1 if fails else 0)

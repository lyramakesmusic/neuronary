"""Static share pages: r/<id>/index.html for every public recipe, so neuronary.org/r/<id> unfurls on X and Discord
with that recipe's own title, description and preview image (rendered by the Supabase `og` function).

Each page is index.html with the recipe's meta tags; the app routes by path, so it opens that recipe. The recipe itself
(and the About text on /about) is also written into <main> as plain HTML in place of "Loading recipes…", so agents and
fetchers that don't run JavaScript can read it; the app replaces it on load.
Run by .github/workflows/share-pages.yml (every 15 min and on push). Recipes newer than the last run fall back to
404.html, a copy of the app (with the generic card).
"""
import glob
import html
import json
import os
import re
import shutil
import urllib.request
from concurrent.futures import ThreadPoolExecutor

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FN = "https://mcczbdcymyhzfputyqcr.supabase.co/functions/v1"
SITE = "https://neuronary.org"


def fetch_all():
    out, offset = [], 0
    while True:
        with urllib.request.urlopen(f"{FN}/api/recipes?sort=new&limit=100&offset={offset}", timeout=30) as r:
            d = json.load(r)
        out += d["recipes"]
        offset += 100
        if offset >= d["count"]:
            return out


def fetch_full(rid):
    with urllib.request.urlopen(f"{FN}/api/recipes/{rid}", timeout=30) as r:
        return json.load(r)


BOOT = re.compile(r'<div class="empty dim boot"[^>]*>Loading recipes…</div>')


def with_main(base, body):
    out, n = BOOT.subn(lambda _m: f'<div class="prerender">{body}</div>', base, count=1)
    assert n == 1, "boot loader not found in index.html"
    return out


def recipe_body(r):
    e = lambda s: html.escape(str(s or ""))
    para = lambda s: "".join(f"<p>{e(x)}</p>" for x in re.split(r"\n\s*\n", str(s or "")) if x.strip())
    exs = []
    for x in r.get("examples") or []:
        ex = f"<h3>Prompt</h3><pre>{e(x.get('prompt'))}</pre><h3>Steered output</h3><pre>{e(x.get('output'))}</pre>"
        if x.get("base_output"):
            ex += f"<h3>Unsteered output</h3><pre>{e(x['base_output'])}</pre>"
        exs.append(ex)
    samp = r.get("sampling")
    return (f'<div class="pagewrap"><h1>{e(r["name"])}</h1>'
            f'<p><code>{e(r["recipe"])}</code> on {e(r["model"])}, by {e(r.get("author") or "anonymous")}, {e(r.get("date"))}</p>'
            f'{para(r.get("description"))}'
            f'<p>Tags: {e(", ".join(r.get("tags") or []))}</p>'
            + (f"<p>Sampling: <code>{e(json.dumps(samp))}</code></p>" if samp else "")
            + (f"<h2>Notes</h2>{para(r.get('notes'))}" if r.get("notes") else "")
            + ("<h2>Examples</h2>" + "".join(exs) if exs else "")
            + f'<p>JSON: <a href="{FN}/api/recipes/{e(r["id"])}">{FN}/api/recipes/{e(r["id"])}</a>. '
            'Dose units and the recipe format: <a href="/about">about</a>, <a href="/agents.md">agents.md</a>.</p></div>')


def about_body():
    js = open(os.path.join(ROOT, "js", "about.js"), encoding="utf-8").read()
    m = re.search(r"export const ABOUT_HTML = `(.*?)`;", js, re.S)
    assert m and "${" not in m.group(1), "ABOUT_HTML must be a plain template string"
    return m.group(1)


def clip(s, n):
    t = re.sub(r"\s+", " ", str(s or "")).strip()
    return t if len(t) <= n else t[: n - 1] + "…"


def page(base, r):
    e = lambda s: html.escape(str(s), quote=True)
    title = f"{r['name']} · neuronary"
    desc = clip(f"{r['recipe']} on {r['model'].split('/')[-1]}. {r['description']}", 280)
    img = f"{FN}/og?id={r['id']}"
    link = f"{SITE}/r/{r['id']}"
    reps = [
        (r"<title>[^<]*</title>", f"<title>{e(title)}</title>"),
        (r'<meta name="description"[^>]*>', f'<meta name="description" content="{e(desc)}">'),
        (r'<meta property="og:url"[^>]*>', f'<meta property="og:url" content="{e(link)}">'),
        (r'<meta property="og:title"[^>]*>', f'<meta property="og:title" content="{e(title)}">'),
        (r'<meta property="og:description"[^>]*>', f'<meta property="og:description" content="{e(desc)}">'),
        (r'<meta property="og:image" [^>]*>', f'<meta property="og:image" content="{e(img)}">'),
        (r'<meta name="twitter:image"[^>]*>', f'<meta name="twitter:image" content="{e(img)}">'),
    ]
    out = base
    for pat, rep in reps:
        out, n = re.subn(pat, lambda _m, rep=rep: rep, out, count=1)
        assert n == 1, pat
    out = with_main(out, recipe_body(r))
    return out.replace("<head>", f'<head>\n<link rel="canonical" href="{e(link)}">', 1)


def main():
    base = open(os.path.join(ROOT, "index.html"), encoding="utf-8").read()
    # the app routes by path: /about gets a real copy (200 for crawlers); anything else (/u/x, /n/x, a recipe newer than
    # this run) falls back to 404.html, which is the same app
    os.makedirs(os.path.join(ROOT, "about"), exist_ok=True)
    with open(os.path.join(ROOT, "404.html"), "w", encoding="utf-8", newline="\n") as f:
        f.write(base)
    with open(os.path.join(ROOT, "about", "index.html"), "w", encoding="utf-8", newline="\n") as f:
        f.write(with_main(base.replace("<title>neuronary</title>", "<title>About · neuronary</title>", 1), about_body()))
    recipes = fetch_all()
    ok = [r for r in recipes if re.fullmatch(r"[a-z0-9-]{1,64}", r["id"])]
    with ThreadPoolExecutor(8) as ex:
        full = dict(zip([r["id"] for r in ok], ex.map(fetch_full, [r["id"] for r in ok])))
    keep = set()
    for r in recipes:
        if not re.fullmatch(r"[a-z0-9-]{1,64}", r["id"]):
            continue
        d = os.path.join(ROOT, "r", r["id"])
        os.makedirs(d, exist_ok=True)
        with open(os.path.join(d, "index.html"), "w", encoding="utf-8", newline="\n") as f:
            f.write(page(base, full[r["id"]]))
        keep.add(r["id"])
    for d in glob.glob(os.path.join(ROOT, "r", "*")):  # deleted or hidden since
        if os.path.basename(d) not in keep:
            shutil.rmtree(d)
    print(f"{len(keep)} share pages")


if __name__ == "__main__":
    main()

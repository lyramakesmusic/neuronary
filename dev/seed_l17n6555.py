"""Builds the interpretation payload for Qwen3.5-4B L17N6555 from lyra's neuron-explorer readouts (transcribed from her
screenshots), in the site's format. Used to test the atlas renderer: prints {interpretations, readouts} JSON."""
import json

T = lambda s: s.split("|")
PAIRS = lambda s: [[t.rsplit(" ", 1)[0], float(t.rsplit(" ", 1)[1])] for t in s.split("|")]
fields = [
    {"type": "tokens", "name": "J++ lens", "rows": {
        "+": T("average|Average|thickness|平均|Average|proportional|的平均|rates|overall|calculates|average|ratios"),
        "-": T("unde|ټ|sét|mist|vicious|明显的|sym|inoc|bucks|部门联合|白雪|.white")}},
    {"type": "tokens", "name": "R lens", "rows": {
        "+": T("average|Average|平均|ratios|ratio|overall|thickness|的平均|rates|Average|proportions|Overall"),
        "-": T("fak|unde|明显的|unfortunate|部门联合|vicious|sét|白雪|<|im_end|>|repl|remnants|ټ")}},
    {"type": "contexts", "name": "activations", "note": "FineFineWeb",
     "tags": {"+": [["chemistry", 1.4], ["hydraulic engineering", 1.36], ["physics", 1.27], ["optical engineering", 1.25]],
              "-": [["drama and film", 1.48], ["movie", 1.36], ["entertainment", 1.25]]},
     "rows": {"+": [
         {"text": "g the flow of brine ⟦of⟧ density⏎1080 kg", "tag": "hydraulic engineering", "value": 2.05},
         {"text": "pass through ⟦with|0.3⟧⟦ a⟧⟦ certain|0.3⟧ flow rate a", "tag": "hydraulic engineering", "value": 1.95},
         {"text": "r of droplets ⟦of|0.3⟧⟦ different⟧ sizes, how high", "tag": "mechanical engineering", "value": 1.78},
         {"text": "orities, who ⟦varied|0.3⟧⟦ in⟧ age. The research", "tag": "literature", "value": 1.76},
         {"text": "ures array ⟦with|0.3⟧⟦ different⟧ orientations ha", "tag": "optical engineering", "value": 1.70},
         {"text": "ed into the blade ⟦with⟧⟦ high|0.3⟧ pressure so", "tag": "hydraulic engineering", "value": 1.56},
         {"text": "orcycle ⟦with|0.3⟧⟦ unprecedented⟧ power, the", "tag": "history", "value": 1.49},
         {"text": "ind ⟦and|0.3⟧⟦ have|0.4⟧ the same color leaves and", "tag": "agronomy", "value": 1.44}],
      "-": [
         {"text": "elief valve to make ⟦it⟧⟦ reach|0.3⟧ the desired", "tag": "hydraulic engineering", "value": -1.78},
         {"text": "ate.⏎Assume flow ⟦is⟧ turbulent.⏎7. Usi", "tag": "hydraulic engineering", "value": -1.40},
         {"text": "-life is known and ⟦one⟧ can measure the", "tag": "nuclear science", "value": -1.24},
         {"text": "e a hydraulic hose ⟦is⟧⟦ labeled|0.3⟧ as 1/2\" ID", "tag": "hydraulic engineering", "value": -1.12},
         {"text": "ries, and making ⟦them⟧ lighter and more", "tag": "physics", "value": -1.12}]}},
    {"type": "units", "name": "net", "note": "474 links · steer lens, ranked by lift over each layer", "groups": [
        {"label": "fed by", "sign": "+", "note": "323 upstream neurons", "items": PAIRS("title 2|these 10|Which 4|. 37|do 3|爲 3|are 14|哪些 18|has 10|now 11|what 4|will 13|no 6|logo 1|Salute 1|this 14|Depth 2|x 6|business 2|create 3")},
        {"label": "held back by", "sign": "-", "items": PAIRS("width 4|( 60|which 5|this 16|place 3|with 3|.With 1|spiritual 1|此外 1|depends 2|是否会 1|maintenant 2|business 3|what 5|什么 37|takes 1|clear 3|动感 1|analysis 2|他的 2")},
        {"label": "feeds → pushes toward", "sign": "+", "note": "77 downstream neurons", "items": PAIRS("Score 5|sk 4|estimated 2|Pil 2|距离 2|skill 4|such 4|Average 3|禅 1|velocities 1|_distances 1|velocidades 1|Scores 2|Hang 1|$ 5|intensity 1|密度 1|asia 1|累计 1|百分比 1")},
        {"label": "feeds → pushes away from", "sign": "-", "items": PAIRS("Sc 7|score 4|scores 2|_sc 2|Tau 2|Status 3|Composition 3|Sign 3|scoring 1|_score 1|( 7|lluv 1|一如 1|盛典 1|kent 1|做什么 2|_zone 1|now 4|Appearance 2|noop 1")}]},
    {"type": "heads", "name": "heads", "rows": {
        "q": PAIRS("L20 h2-3 5|L18 h12-13 4.1|L19 h3 3.9|L19 h10 3.5|L18 h26-27 3|L18 h2-3 2.8|L18 h24-25 2.6|L18 h16-17 2.3"),
        "k": PAIRS("L28 h24-25 3.4|L30 h24-25 3.2|L30 h20-21 2.7|L24 h0-1 2.4|L29 h2-3 2.1"),
        "v": PAIRS("L18 h30 5|L22 h3 3.5|L18 h31 3.4|L28 h26 3.1|L22 h10 3|L18 h21 2.7|L25 h21 2.4|L21 h4 2.3"),
        "o": PAIRS("L16 h28 5.6|L17 h24-25 4.1|L16 h24 3.6")}},
]
interp = {"model": "Qwen/Qwen3.5-4B", "layer": 17, "neuron": 6555,
          "text": "(+) ascribes a measured attribute (of density, with a flow rate, has a thickness); (−) copula predication (flow is turbulent)",
          "confidence": 0.7, "source": "neuron explorer"}
readouts = {"model": "Qwen/Qwen3.5-4B", "layer": 17, "neuron": 6555, "source": "neuron explorer", "fields": fields}
print(json.dumps({"interpretations": [interp], "readouts": [readouts]}, ensure_ascii=False))

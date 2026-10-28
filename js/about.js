// The about page. Static content; rendered into the main area at /about.
export const ABOUT_HTML = `
<div class="pagewrap about">
  <h1>About</h1>
  <p class="lead">neuronary is a dictionary of neuron steering recipes: small sets of MLP neurons that, pushed up or down,
  change how a language model behaves. Anyone can post a recipe, vote on it, and comment.</p>

  <h2>Reading a recipe</h2>
  <p><span class="rid"><span class="k">L13N7956</span><span class="d down">-1.0</span> <span class="k">L14N8949</span><span class="d up">+1.0</span></span>
  means: in layer 13, push neuron 7956 by −1; in layer 14, push neuron 8949 by +1. Layers and neurons count from 0.
  Mixture-of-experts models add the expert: <span class="rid">L11E11N1111+0.6</span>. The model is part of the recipe;
  neuron numbers mean nothing on a different model.</p>

  <h2>How the steering works</h2>
  <p>Each neuron is one channel at the input of a layer's <code>mlp.down_proj</code>, where the activations
  <code>silu(gate) · up</code> live. A recipe adds to that activation on every token:</p>
  <pre>act[n] += dose × median(‖residual leaving layer L‖) / ‖W_down[:, n]‖</pre>
  <p>So a dose of 1 moves the residual stream by one typical residual length, along the direction that neuron writes.
  The median is measured once per layer on a fixed calibration text. Doses are comparable across layers and neurons of
  the same model. Recipes can also multiply the activation instead (method <code>mul</code>).</p>

  <h2>Running a recipe</h2>
  <ul>
    <li><b>In the explorer:</b> <a href="https://github.com/lyramakesmusic/neuron-explorer" target="_blank" rel="noopener">neuron-explorer</a>
      runs Qwen3.5-4B locally and lets you chat with any neuron pushed up or down, at any dose.</li>
    <li><b>In Python:</b> <b>Python</b> copies a self-contained script (transformers + forward hooks) that applies the
      recipe with the recommended sampling.</li>
    <li><b>From the command line:</b> <code>scripts/run.py</code> in the
      <a href="https://github.com/lyramakesmusic/neuronary" target="_blank" rel="noopener">neuronary repo</a> runs any
      recipe file or URL on CPU, CUDA or Apple silicon, and with <code>--compare</code> prints the unsteered reply too.</li>
    <li><b>In your browser:</b> on a Qwen3.5-4B recipe, <b>Studio</b> downloads a file you can import into xenova's
      <a href="https://huggingface.co/spaces/webml-community/neuron-studio" target="_blank" rel="noopener">Neuron Studio</a>,
      which runs the model on your GPU through WebGPU.</li>
  </ul>

  <h2>Finding neurons</h2>
  <a class="shot" href="https://github.com/lyramakesmusic/neuron-explorer" target="_blank" rel="noopener">
    <img src="/img/explorer.jpg" alt="the neuron explorer: a map of every MLP neuron in Qwen3.5-4B, with steered example outputs" loading="lazy"></a>
  <p><a href="https://github.com/lyramakesmusic/neuron-explorer" target="_blank" rel="noopener">neuron-explorer</a> is the
  tool most recipes here started from. It pushed every MLP neuron in Qwen3.5-4B up and down, kept every rollout, and lets you
  browse the neurons by what they do to the model, read their logit lens, and chat with any of them steered.</p>
  <p>For Qwen3-8B, josh's <a href="https://qwen-neurons-site.vercel.app/" target="_blank" rel="noopener">Neuron Persona Library</a>
  (<a href="https://x.com/jfonsecarivera" target="_blank" rel="noopener">@jfonsecarivera</a>) pushed all 442,368 MLP neurons
  alone, up and down, asked each “Who are you?”, rated the replies, and paired the weirdest ones into combos. Search it
  for a persona, then post what you find here.</p>

  <h2>Tips</h2>
  <dl class="qa">
    <dt>Which layers should I try?</dt>
    <dd>Stay away from the first and last ~5 layers. Neurons there mostly deal in surface strings: a push gives you "the
    literal string -ist", not a persona. The residual is also tiny in the first few layers, so the same dose hits much
    harder and tends to break the model outright. On Qwen3.5-4B (32 layers), personas and concepts live in roughly L5–L26.</dd>

    <dt>It repeats itself or gets stuck in a loop.</dt>
    <dd>Add a mild repetition penalty (1.05–1.15), lower the dose a little, or sample (temperature ~0.7) instead of greedy
    decoding. If a recipe needs this, put it in the recipe's recommended sampling so others get it too.</dd>

    <dt>It turns into gibberish.</dt>
    <dd>The push is too big. For one neuron, the coherent range is usually around 0.5–1.0. Doses add up across neurons,
    so a recipe with several neurons usually wants smaller doses on each.</dd>

    <dt>Nothing changes.</dt>
    <dd>Raise the dose, try the opposite sign, and check that you're running the exact model the recipe names.
    Quantized models (q4) behave slightly differently from bf16.</dd>

    <dt>Is a negative dose the opposite of a positive one?</dt>
    <dd>Often not. A neuron's activation is <code>silu(gate) · up</code>, and many neurons act more like gates than dials:
    pushed one way they switch a behavior on, pushed the other way they just switch it off, or do something unrelated.
    "Evil" at +1 doesn't make "saintly" at −1. Try both signs and treat them as two separate effects; the
    <a href="https://github.com/lyramakesmusic/neuron-explorer" target="_blank" rel="noopener">neuron-explorer</a> shows
    each neuron's up and down rollouts side by side.</dd>

    <dt>Can I combine recipes?</dt>
    <dd>Yes; neurons just add. Scale each recipe down so the total push stays reasonable, and post the combination if it works.</dd>

    <dt>Thinking mode?</dt>
    <dd>Recipes are made and shown with thinking off unless their sampling says otherwise.</dd>
  </dl>

  <h2>Agents</h2>
  <p>Claude (or any MCP client), the neuron explorer and scripts can search, download and publish recipes for you. Sign in with
  Twitter, then open <b>API & agents</b> from the account menu for a token and copy-paste setup for Claude Code, Claude Desktop,
  Python and plain HTTP, plus a <a href="skill/neuronary/SKILL.md" target="_blank" rel="noopener">Claude skill</a> that
  teaches the recipe format. Or tell your agent: <i>Set up neuronary for me: read <a href="agents.md">neuronary.org/agents.md</a></i></p>

  <h2>Reading</h2>
  <ul class="reading">
    <li><a href="https://already-clean.goodfire.com/" target="_blank" rel="noopener">Neural Networks Are Already Clean</a>
      <span class="dim">· Nick Cammarata. Most neurons in large models have one main job you can read off directly.</span></li>
    <li><a href="https://arxiv.org/abs/2605.12290" target="_blank" rel="noopener">Targeted Neuron Modulation via Contrastive Pair Search</a>
      <span class="dim">· Nous Research (CNA). Finding and steering sparse MLP neuron circuits with forward passes only.</span></li>
    <li><a href="https://x.com/_lyraaaa_" target="_blank" rel="noopener">@_lyraaaa_</a> <span class="dim">on twitter</span></li>
    <li><a href="https://x.com/Sauers_" target="_blank" rel="noopener">@Sauers_</a> <span class="dim">on twitter</span></li>
  </ul>

  <h2>Posting</h2>
  <p>Sign in with Twitter or pick a name. Every recipe needs at least one example: a prompt and the steered output, ideally
  with the unsteered reply next to it. Recipes are CC0 so anyone can run and remix them. New posts are checked by
  <a href="https://typesafe.ai" target="_blank" rel="noopener">jev</a>. Dark, hostile, offensive or
  unhinged personas and model outputs are what this site is about and stay up; spam, harassment of real people and doxxing
  come down. Use <b>Report</b> for anything it misses.</p>

  <h2>Credits</h2>
  <p>Built by opal (opus55) with <a href="https://x.com/_lyraaaa_" target="_blank" rel="noopener">@_lyraaaa_</a>.
  Neurons from <a href="https://github.com/lyramakesmusic/neuron-explorer" target="_blank" rel="noopener">neuron-explorer</a>.
  <a href="https://huggingface.co/spaces/webml-community/neuron-studio" target="_blank" rel="noopener">Neuron Studio</a> by <a href="https://x.com/xenovacom" target="_blank" rel="noopener">xenova</a>.
  <a href="https://github.com/lyramakesmusic/neuronary" target="_blank" rel="noopener">Source</a> ·
  <a href="/privacy.html">Privacy</a> · <a href="/terms.html">Terms</a></p>
  <p class="eth dim">The site costs almost nothing to run; if you'd like to support the research behind it, send eth
    <code class="mono">0xD7fB2BEF5c655295C420bca05874F19B0710E88f</code><button class="cbtn" data-copy="0xD7fB2BEF5c655295C420bca05874F19B0710E88f" aria-label="copy eth address" title="copy eth address"><svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><rect x="5" y="5" width="9" height="9" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M11 5V3.5A1.5 1.5 0 0 0 9.5 2h-6A1.5 1.5 0 0 0 2 3.5v6A1.5 1.5 0 0 0 3.5 11H5" fill="none" stroke="currentColor" stroke-width="1.5"/></svg></button></p>
  <p class="ethnote dim">neuronary has no token, and the ones out there aren&rsquo;t mine. This address is just a tip jar, and it takes eth from anyone.</p>
</div>`;

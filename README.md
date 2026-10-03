<p align="center">
  <img alt="LocalNodeAI" src="docs/icon.svg" width="110" />
</p>
<h1 align="center">
  LocalNodeAI
</h1>
<h3 align="center">
  Because your AI workflow should never need a server.
</h3>
<p align="center">
  LocalNodeAI is a zero-setup AI workflow builder that runs entirely in your browser on
  your own GPU. Drag nodes onto a canvas, wire them together, and press Run — then export
  the whole thing as a single offline <code>.html</code> file you can open anywhere.
</p>
<br>

<p align="center">
  <a href="#install">
    <img alt="Get started" src="https://img.shields.io/badge/Get_Started-Install_Now-38bdf8">
  </a>
  <a href="https://caniuse.com/webgpu" target="_blank" rel="noopener noreferrer">
    <img alt="WebGPU Support" src="https://img.shields.io/badge/WebGPU-Chrome_%2F_Edge_113+-4285F4?logo=googlechrome&logoColor=white">
  </a>
  <a href="https://github.com/Kikubay/LocalNodeAI?tab=MIT-1-ov-file" target="_blank" rel="noopener noreferrer">
    <img alt="License: MIT" src="https://img.shields.io/badge/License-MIT-yellow">
  </a>
</p>
<br />

> *Note: LocalNodeAI needs WebGPU, which requires a secure context (`https` or `localhost`) and a Chromium-based browser. The first run of each model downloads its weights (roughly 0.4–2.3 GB) from the Hugging Face CDN; after that it runs from your browser's cache, offline.*

___

## 📑 Summary

- [Features](#features)
- [Install](#install)
- [Configure](#configure)
- [Node reference](#node-reference)
- [Update](#update)
- [Troubleshooting](#troubleshooting)
- [Privacy and security](#privacy-and-security)
- [Issues and feedback](#issues-and-feedback)
- [License](#license)

___

## Features

- 🧩 **Seven node types**: `Start`, `LLM`, `Cache`, `Transform`, `Branch`, `Merge` and `End`. Drag them from the palette, click to add, or right-click for duplicate / disconnect / delete.
- 📦 **One-file distribution**: `npm run build` emits a single `dist/index.html` with the editor, the execution engine and the model runtime inlined. No assets, no CDN, no second request.
- 🧠 **Real local inference** via WebLLM on WebGPU. The curated default list runs from Qwen2.5 0.5B (~0.4 GB) up to Llama 3.2 3B (~2.3 GB), and any WebLLM prebuilt model id can be pasted in.
- 💾 **Cache nodes that skip work**: cache gates remember what the nodes after them produced and replay it on later runs, so the model is not invoked twice for the same input. Keys can auto-invalidate when the model, prompt or generation settings change.
- ✂️ **Transform nodes** for regex extraction, JSON field reads, splitting, slicing and case changes — chain a model's output into the next prompt without paying for another inference.
- 🔀 **Branch and Merge** together give real routing and fan-in: ask several models the same question, merge the answers, and let a fourth model judge them.
- 🎛️ **Generation controls** on every LLM node — temperature, max tokens, seed and stop sequences — and **truncation is never silent**: a run that hits the token limit says so instead of returning a cut-off answer.
- 💾 **Autosave and undo/redo**: your graph is persisted to this browser as you edit, with `Ctrl+Z` / `Ctrl+Shift+Z` history that covers structure and configuration but not run artefacts.
- 🔒 **Nothing leaves the machine.** No backend, no API keys, no telemetry, no accounts.

___

## Install

### Requirements

- **Node.js** `^20.19.0` or `>=22.12.0`
- Browser with ***WebGPU*** enabled *(e.g: **Chrome**, **Brave** or **Edge 113+**)*

### Option 1: Build once and use the single file (Recommended)

1. Install dependencies:
   ```bash
   npm install
   ```
2. Build:
   ```bash
   npm run build
   ```
3. Open the result:
   ```text
   dist/index.html
   ```

That one file is the entire application. Copy it to a USB stick, mail it to someone,
or serve it from anywhere — it needs nothing else. **Export** inside the app produces
the same file with your current workflow embedded.

### Option 2: Development server

```bash
npm run dev
```

Then open the printed `http://localhost:5173` URL. Use `localhost` rather than a LAN IP:
WebGPU is unavailable on insecure origins, and the Run button stays disabled.

### Scripts

| Script | What it does |
| --- | --- |
| `npm run dev` | Development server with hot reload |
| `npm run build` | Typecheck, then emit a single `dist/index.html` |
| `npm run preview` | Serve the production build |
| `npm test` | Headless logic tests (graph traversal, execution, export, history) |
| `npm run test:menu` | Context-menu rendering and dismissal tests |
| `npm run lint` | Oxlint |

___

## Configure

<details>
<summary>Browser requirements and WebGPU</summary>

- WebGPU needs a **secure context**: `https://`, or `http://localhost`. Opening
  `dist/index.html` directly from `file://` may or may not expose `navigator.gpu`
  depending on the browser; if the header shows **No WebGPU**, run it from
  `npm run preview` or any local web server instead.
- The header chip reports the detected adapter (vendor and architecture) and can be
  clicked to re-probe. Hardware acceleration must be enabled in browser settings.
- Without WebGPU the app still works as an editor — you can build, import, export and
  undo graphs. Only running a model is blocked.

</details>

<details>
<summary>Models and downloads</summary>

- Pick a model from any `LLM` node's dropdown. The bundled list covers small instruct
  models that are practical on consumer GPUs.
- The first run of a model downloads its weights from the Hugging Face CDN, with a
  progress bar on the LLM node. Expect tens of seconds to several minutes depending on
  your connection.
- After the first download the weights live in the browser's Cache Storage. The LLM
  node shows a `cached` badge when they are already present, and repeat runs work with
  the network off.
- To clear them, clear site data for the origin in your browser settings.
- You can paste any WebLLM prebuilt model id into the dropdown; if it is not in the
  prebuilt list the node warns you before you run.

</details>

<details>
<summary>Where your data lives</summary>

| Data | Location |
| --- | --- |
| Current graph | Browser memory, mirrored to `localStorage` under `localnodeai.autosave` |
| Model weights | Browser Cache Storage (managed by WebLLM) |
| Cache-node results | Browser Cache Storage, capped at 40 entries, oldest dropped |
| Exported workflows | Wherever you save the downloaded file |

Nothing is sent anywhere except the one-time model download. If storage is unavailable
(private browsing, or a `file://` origin that refuses it) the header says
`autosave unavailable` and the app keeps working in memory.

Opening an **exported** HTML file deliberately turns autosave off for that session, so
a workflow someone sent you can never overwrite the draft in your own tab.

</details>

___

## Node reference

| Node | Purpose |
| --- | --- |
| **Start** | The text that enters the workflow. |
| **Cache** | Skip work that has already been done. |
| **Transform** | Reshape text without invoking a model. |
| **LLM** | Run a model on WebGPU. |
| **Branch** | Take one of two paths based on a condition. |
| **Merge** | Join several inputs into one. |
| **End** | Read-only view of whatever arrived from upstream. |

### Cache

Place it **upstream** of the work you want to reuse, typically between `Start` and
`LLM`. The first run is a miss: the input passes straight through and the outputs of
every node after the gate are stored. Later runs with the same key restore those
outputs and the downstream nodes are skipped entirely, so the model never runs again.

- **Cache key** — a template using `{{input}}`, so you can cache one answer per
  question rather than a single shared answer.
- **Invalidate when the downstream model or prompt changes** (on by default) mixes the
  governed nodes' identity into the key, so switching model, system prompt, temperature,
  max tokens, seed or stop sequences cannot replay a stale answer.
- Nothing is cached from a run that failed or was cancelled, so a truncated answer is
  never stored as final.

### Transform

Eight operations, no model, no download, no latency:

| Operation | What it does |
| --- | --- |
| Template | Wrap the input in fixed text; `{{input}}` marks where it lands |
| Find & replace | Regex replace, with flags (`g`, `i`, `m`, `s`, `u`) |
| Extract match | First regex match, or a specific capture group |
| JSON field | Pull a field out of a JSON response, e.g. `choices.0.message.content` |
| Split | Split on a delimiter and take one part (`\n` is understood) |
| Slice | Cut a substring by start and optional length |
| Case | lowercase, UPPERCASE, Title Case, Sentence case |
| Trim | Trim edges and collapse runs of whitespace |

**JSON field** is what unlocks chaining: point it at a model response and feed a single
extracted value into the next prompt instead of sending the whole response through
another inference call. A malformed regular expression fails the run and is reported on
the node rather than silently passing an empty string downstream; regex matching is
capped at 100k characters so a pathological pattern cannot lock up the tab.

### Branch

Drag from the **green** handle for the matched path and the **grey** handle for the
other. Everything only reachable from the untaken edge is skipped, while a shared tail
still runs. Conditions: always, contains, does not contain, equals, not equals, starts
with, ends with, matches regex, is empty, is not empty, number greater/less than, and
length greater/less than.

Skipped nodes are reported in the run log and have their previous output cleared, so a
stale answer is never left on screen.

### Merge

The only node that reads more than one input. Joins upstream outputs into one string,
with a configurable separator, optional `source node id` labels for readability, an
option to skip empty inputs, and a whitelist that both filters and reorders (anything
not listed is still appended, so a stale id can never silently drop a real input). The
node lists its connected inputs as chips so you can see the ids to whitelist.

### Generation settings

| Setting | Default | Notes |
| --- | --- | --- |
| Temperature | 0.7 | 0–2. Use 0 for deterministic output |
| Max tokens | 512 | 1–8192. The hard cap on answer length |
| Seed | random | Pin it to reproduce a response |
| Stop sequences | none | One per line; `\n` escapes understood |

Out-of-range or half-typed values are clamped rather than passed to the engine. When
generation stops because it hit Max tokens, the node shows a warning naming the limit
and the run log says `TRUNCATED` — the default of 512 tokens is roughly 380 words, so
raise it when you need more.

### Keyboard

| Shortcut | Action |
| --- | --- |
| `Ctrl+Z` | Undo |
| `Ctrl+Shift+Z` / `Ctrl+Y` | Redo |
| `Delete` or `Backspace` | Remove the selected node or edge |

___

## Update

LocalNodeAI has no update mechanism; it is a static app you host or carry yourself.

1. Pull the newer source.
2. `npm install`
3. `npm run build`
4. Replace `dist/index.html`.

Your workflow is not affected by an update — it lives in your browser's
`localStorage`. Exported files are self-contained and keep working regardless.

---

## Troubleshooting

<details>
<summary>The Run button is greyed out, or the header says “No WebGPU”</summary>

  - Open the app on `https://` or `http://localhost`. A LAN IP or `file://` is not a secure context.
  - Use Chrome or Edge 113+, or another browser with WebGPU enabled.
  - Confirm hardware acceleration is on in the browser's settings.
  - Click the GPU chip in the header to re-probe after changing anything.

</details>

<details>
<summary>“No WebGPU adapter available”</summary>

  - No adapter was returned. Check that the GPU is not blocklisted by the browser or driver.
  - Closing other GPU-heavy tabs can help if VRAM is exhausted.
  - The app still works as an editor; only running models is blocked.

</details>

<details>
<summary>The model download fails or stalls</summary>

  - Weights come from the Hugging Face CDN. A failed download is reported on the LLM node with a Retry path — just run again.
  - Very large models can exceed available VRAM. Pick a smaller one from the dropdown.
  - A cancelled or failed run is never cached, so retrying is always safe.

</details>

<details>
<summary>Export says it needs a self-contained build</summary>

  - Export writes the app's own HTML, so it only works from a real build.
  - Run `npm run build` and open `dist/index.html`, then click **Export** again.
  - In dev mode the button explains this rather than emitting a file that would not work offline.

</details>

<details>
<summary>An exported file shows “autosave off”</summary>

  - Expected. Opening an exported workflow disables autosave for that session so it cannot overwrite the draft in your own tab.
  - Edits still work in that window; they just are not persisted. Use **Export JSON** to keep a copy.

</details>

<details>
<summary>My workflow disappeared after a reload</summary>

  - Autosave is disabled in exported-file sessions by design — open the app on its usual origin to get your draft back.
  - Check the header chip for `autosave unavailable`, which means storage is blocked (private browsing or a restrictive origin).
  - Import a previously exported JSON file if you have one.

</details>

<details>
<summary>Answers are cut off mid-sentence</summary>

  - The node shows an amber warning naming the limit and the run log says `TRUNCATED`.
  - Raise **Max tokens** on that LLM node and run again.

</details>

<details>
<summary>A second run finished instantly</summary>

  - That is a Cache node doing its job: it restored the stored result and skipped the model.
  - Open the Cache node and press **Clear** to force a fresh run.

</details>

<details>
<summary>A Cache node returned an old answer</summary>

  - Keep **Invalidate when the downstream model or prompt changes** enabled. It is on by default and covers model, system prompt and generation settings.
  - A different branch decision is not part of the key, so verify the input feeding the gate is what you expect.
  - Press **Clear** on the Cache node to drop everything and re-run.

</details>

<details>
<summary>Ctrl+Z does not undo my typing</summary

  - By design: inside a text field `Ctrl+Z` belongs to the browser.
  - Click the canvas (or press `Escape`) first, then `Ctrl+Z` to undo the edit to the node.

</details>

<details>
<summary>The context menu stays open when I click elsewhere</summary>

  - Should not happen in a current build. Dismissal is registered in the **capture** phase because React Flow's pan and drag handlers stop propagation; if a future upgrade reintroduces the symptom, check that the dismissal listeners still pass `true` as the capture flag in `src/lib/contextMenuModel.ts`.

</details>

<details>
<summary>Import says the file is not a LocalNodeAI workflow</summary>

  - **Import JSON** expects a workflow JSON file, not an exported `.html` file — open the HTML directly instead.
  - The file must contain `version: 1` and a `nodes` array. Unknown node types, duplicate ids and dangling connections are dropped automatically and the toast reports how many issues were fixed.

</details>

___

## Privacy and security

- **No backend.** LocalNodeAI is static files; there is no server component to talk to.
- **No API keys, no accounts, no telemetry.** Nothing is measured or reported anywhere.
- **Your prompts never leave the browser.** Inference runs on your GPU through WebGPU.
- **The only network request** is the one-time model download from the Hugging Face CDN, performed by WebLLM.
- **Local storage only.** Your graph, cached results and model weights live in this
  browser's `localStorage` and Cache Storage. Clearing site data erases them.
- **One network call for one model.** After the weights are cached, LocalNodeAI works
  with the network off.
- **The exported file contains everything** — editor, engine and runtime. Treat it as
  you would any other HTML file you were sent, and open it in a browser profile you trust.

___

## Issues & feedback

Found a bug or have an idea? Open an issue on the project's repository. When reporting a
problem, include your browser and GPU, the model you selected, and the run log shown in
the right-hand panel — it names the failing node and the reason.
___

## Support

If LocalNodeAI is useful to you, consider starring the repository. It helps other
developers discover the project.

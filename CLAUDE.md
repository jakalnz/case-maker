# Case-maker — notes for Claude

Instructor tool that builds one audiology teaching case and publishes it to every `jakalnz` simulator, in clinical
order: history → otoscopy → PTA/play → speech → immittance → DPOAE → ABR. Static vanilla HTML/CSS/ES modules, no
build step, no dependencies. Live at https://jakalnz.github.io/case-maker/ (repo `jakalnz/case-maker`, Pages from
`main` / root). Admin PIN `1234` (same convention as the other simulators' admin pages).

## Run / test
- Serve the **parent `Coding` folder**, not this one: `python -m http.server 8765` in `Coding`, then open
  http://127.0.0.1:8765/case-maker/ (app) and http://127.0.0.1:8765/case-maker/tests.html (tests). The tests load
  the sibling simulators' own source (`../ABR/js/codec.js`, `../immittance%20simulator/caseCodec.js`,
  `../pta-simulator/js/...`, `../play-simulator/js/...`, speech/DPOAE decoders pulled out of their app files).
- `tests.html` round-trips every encoder through its simulator's own decoder, checks derive rules, the AI schema,
  normalise/apply of AI replies, renders every step, and flags drift between `vendor/` and the originals.
  Expect **64 passed, 0 failed**. Headless run: Chrome `--headless=new --screenshot=... --virtual-time-budget=15000`.
- Print sheets: check them with headless Chrome `--print-to-pdf=<file> --no-pdf-header-footer` on a throwaway page
  (outside any repo, e.g. `Coding/.cm-test/`) that builds an example and calls `buildPrintSheet()`, then sets
  `document.body.dataset.print = 'student' | 'instructor'`. Delete the throwaway page afterwards. Don't click the
  print buttons through the browser extension — the print dialog blocks it.
- The Output step has a "Links point to: this server (local testing)" switch so generated links open the local
  simulators (`js/config.js` `local` paths) instead of GitHub Pages.
- Chrome caches changed simulator files hard: if a link "doesn't load", `fetch(file, {cache: 'reload'})` the
  changed files before judging it broken.

## Layout
| File | Role |
|---|---|
| `index.html`, `css/styles.css` | Shell: PIN gate, step rail, top bar (title, Cases ▾ menu, theme). Light/dark via CSS variables |
| `js/main.js` | App shell (`window.caseMaker`): step routing, autosave (`localStorage` `casemaker-current` / `casemaker-projects`), open/download `.casemaker.json` |
| `js/model.js` | The case project, audiogram interpretation (`earThresholds`), `derive*()` per simulator, overrides (`resolve`, `setOverride`) |
| `js/ui.js` | DOM helper `h()`, `bound()` (plain fields), `simInput()` (derived field that records an override when edited) |
| `js/steps/*.js` | One module per step, each `render(app)` → DOM node |
| `js/encoders/*.js` | One per simulator, `build(case, target)` → `{ url, files, warnings, note }`; `index.js` `buildAll()` |
| `js/ai.js`, `js/apply-extraction.js` | Auto-fill with Claude (see below) |
| `js/otoscopy-api.js` | Otoscopy library read + worker writes (see below) |
| `js/config.js` | Simulator URLs (deployed / local), worker URLs |
| `js/print-sheet.js` | Printable student / instructor case sheet (see below) |
| `js/examples.js` | Two fictional example cases (adult sudden left loss; 4-year-old glue ear) |
| `vendor/` | Verbatim copies of simulator code — see `vendor/README.md`; never edit here, re-copy from the simulator |

## Case model (js/model.js)
One project object (`schema: 'casemaker/1'`): `meta` (title, notes, `include` per simulator), `sources` (guidance
text, file names only), `history` (exactly the history simulator's case schema — every sub-object must exist because
its `buildSystemPrompt` has no null checks), `otoscopy` (text + `leftImageId`/`rightImageId`/`caseId`), `audiogram`
(the single source of truth: per ear `ac` 250–8k and `bc` 250–4k, dB HL or null), and `sims.{pta,play,speech,
immittance,dpoae,abr}.overrides` (dotted path → value).

`resolve(c, key)` = `derive(c, key)` with overrides applied. Derive rules (agreed with the user; clinical sign-off):
cochlear = BC, air–bone gap carried from 4 kHz to 6/8 kHz; PTA cochlear/ipsiConductive; play true = BC + gap at
0.5–4k; speech bestAC = best single-frequency AC, piMax falls with cochlear PTA, score90 = piMax when the fitted
curve peaks below 90 dB HL, otherwise the curve's own value at 90 dB HL (`autoScore90`; see Speech below); ABR thresholds clamped ≥ −5
(codec floor); DPOAE present when AC ≤ 30 and gap < 10; immittance As (adult) / B (child, < 6 y) when probe-ear gap
≥ 15, reflexes absent for probe-ear conductive loss or stimulus-ear gap ≥ 30, rising above 50 dB HL cochlear, absent
above 75. Case ids used in links are short and stable: `cm-` + first 8 hex of the project id (DPOAE seeds its
generated values from it).

## Encoders and link formats
All links must stay **under 255 characters** (MS Word hyperlinks / LMS fields).
| Simulator | Output | Notes |
|---|---|---|
| History | `<name>-case.json` (primary) + `student.html?case=<id>` | Link only works after the JSON is imported or committed to `cases/` + `cases/index.json` |
| Otoscopy | `index.html?case=<caseId>` | Case must exist in the otoscopy repo (created on the Otoscopy step) |
| PTA | `index.html#c=<compact>` + v2 session `.json` | Vendored `share-codec.js`; locked = exam mode (XOR); `#c=` drops patientInfo |
| Play | `index.html#case=~<compact>` + raw case `.json` | Vendored `play/case-codec.js`; falls back to base64url JSON wrapper when `canEncode` is false (clip restrictions, off-grid) |
| Speech | `index.html?case=<b64url [id,name,R,L]>` | Query param, not hash |
| Immittance | `index.html#case=<compact>` | Port of `caseCodec.js`; `REFLEX_SHAPES` has `biphasic` appended after `other` (index 4); lossless legacy JSON link as fallback |
| DPOAE | `index.html#case=z<b64url deflate-raw JSON>` | `CompressionStream('deflate-raw')` |
| ABR | `index.html#case=<ABRCodec>` | Vendored `abr/codec.js` (v4) |

When a simulator's codec changes: change the simulator, push it, wait for Pages, re-copy into `vendor/`, update the
encoder — and push the simulator **before** case-maker, or live links break.

## Speech curve (vendor/speech/pi-curve.js, js/steps/speech.js)
- `fitLogistic` and `buildPICurve` are copied verbatim out of `speech-testing-simulator/index.html` (with a header
  and an `export`); `tests.html` extracts the same two functions from the simulator and fails on any drift. The
  Speech step's preview (`speechSvg`) draws this exact curve, the data points, and a square fixed at 90 dB HL.
- In the simulator, "score at 90 dB HL" is used **only** for rollover: `buildPICurve` applies it when it is below
  PI max **and** the fitted curve peaks below 90 dB HL (peak = L50 + ln(99)/k). Otherwise it is ignored and students
  get the curve value. So case-maker's auto value (`autoScore90` in model.js) is PI max when the curve peaks below
  90, else the curve's value at 90 dB HL; `deriveSpeech` uses any hand-edited dataPoints/piMax/bestAC for this.
  The field's hint says "Not used by the simulator for this ear" when it is ignored. A test proves the simulator's
  curve is identical at every level with either value.

## Print sheets (js/print-sheet.js, Links & files step)
- "🖨 Student sheet" / "🖨 Instructor sheet" call `printSheet(c, built, mode)`: it appends a `.print-sheet` element to
  `<body>`, sets `body[data-print]`, sets `document.title` (the default PDF file name), calls `window.print()`, and
  removes it all on `afterprint`. `@media print` hides everything else and forces the light palette; the student
  copy hides `.ps-instructor-only`.
- Content: header (title, patient, date); numbered steps per included simulator with a task line and a short
  `<a>` "Open … ›" (the full URL is never shown); instructor copy adds the answer key on a new page — audiogram
  chart (`audiogramSvg`, exported from steps/audiogram.js) + table + PTA/ABG/type summary, speech chart
  (`speechSvg`) + table, immittance / DPOAE / ABR tables, instructor notes.
- Printed sheets always use the **deployed** links (`buildAll(c, 'deployed')`), even when the page is set to local
  testing. "Save as PDF" in Chrome keeps the links clickable (verified: `/URI` annotations in the PDF).

## Auto-fill with Claude (js/ai.js, js/apply-extraction.js, Start step)
- Sends guidance + PDFs/images (base64 `document`/`image` blocks, ≤ 20 MB) to the history simulator's worker
  `https://audiology-sim.mpsanders.workers.dev` (`X-Session-Token` = the simulator access code, stored in
  `sessionStorage` key `audiology-sim-session-token`). The worker forwards the body unchanged to the Messages API
  and passes Anthropic's JSON back; it accepts requests from localhost too. It does **not** forward headers, so beta
  features (e.g. refusal fallbacks) can't be used.
- Model `claude-opus-5` by default (`claude-sonnet-5` selectable), `output_config.effort: 'medium'`, adaptive thinking
  (Opus 5 default), `max_tokens` 16000, non-streaming. About 1 minute and ~$0.16 for a one-page report.
- **Structured outputs are not used**: the API rejected this schema (union limit 16, then "compiled grammar too
  large"). The schema (`EXTRACT_SCHEMA`) is sent in the system prompt and the reply is plain JSON; `parseReply()`
  tolerates fences/prose and `normalise()` enforces the schema (fixed choices matched case-insensitively,
  defaults for missing fields, list entries missing a number dropped). Keep `normalise()` robust — it is the only
  guard. Test results are lists of what was measured (no nullable grids).
- The prompt forbids copying identifiers and asks for `possibleIdentifiers` (type + location only). Test results are
  never invented; history details only if the "invent" box is ticked.
- `applyExtraction()` merges per section chosen in the review panel; audiogram rows (ear × AC/BC) are replaced only
  when the reply has values for that row.
- 401 handling: plain `Unauthorised` = wrong access code; JSON 401 = the worker's Anthropic key was rejected.

## Otoscopy (js/otoscopy-api.js, Otoscopy step)
- Library read from `https://jakalnz.github.io/otoscopy/data/library/index.json` (per-ear thumbnails, tag search).
- Writes go through `https://otoscopy-admin.mpsanders.workers.dev` (`X-Admin-Password`, stored in `sessionStorage`
  key `casemaker-otoscopy-password`): `POST /api/image`, `POST /api/case`, `PUT /api/case/:id`, `DELETE` for both.
  Every write is a **real commit to `jakalnz/otoscopy` main**; new files go live on Pages after ~40–60 s.
- Uploads are re-encoded to JPEG ≤ ~900 KB, ≤ 1600 px (the worker/GitHub path fails around 1 MB).

## Rules when working on this project
- Never read or echo the access code / otoscopy password (password fields, `sessionStorage`); run live calls via JS
  that returns only results or error text. Each AI call bills the user's Anthropic key — say so and keep calls few.
- Test documents must be fictional (e.g. print an HTML report to PDF in the scratchpad). Never use files found in
  `Coding/` — `ABR/ABR Images/` holds real patient names and `ABR/Protocols and Norms/` is copyrighted.
- Live otoscopy tests: confirm with the user first, name test items clearly, delete them via the worker afterwards,
  and verify with the GitHub API (`api.github.com/repos/jakalnz/otoscopy/contents/...`) — `raw.githubusercontent.com`
  is CDN-cached for minutes.
- The browser tool times out at ~45 s: start long calls un-awaited, store the result on `window`, and poll.
- The speech simulator asks a `confirm()` before showing graphs — don't click Show Graphs in automation.
- Push order: simulators first, then case-maker. Ask before pushing.

## Loose ends (as of 2026-09-29)
- Stray remote branches `case-maker-fixes` on `immittance-simulator` and `speech-testing-simulator` (harmless).
- A fictional "AI test (fictional)" case may remain in one browser profile's case list.
- Undecided idea: publishing history cases straight into `history-taking-simulator/cases/` (+ `cases/index.json`),
  restricted to the site owner. Options discussed: (1) a separate `history-admin` Cloudflare worker with a repo-scoped
  GitHub token and an owner-only publish password, called from a case-maker button (mirrors the otoscopy worker; the
  student-facing `audiology-sim` worker must never hold a GitHub token); (2) a local script / Claude Code task that
  copies the downloaded JSON into the local repo, updates the index, commits and pushes. Node isn't installed on this
  machine, so deploying a worker needs Node or another machine. Published cases are public — they must be fictional.

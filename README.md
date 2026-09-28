# Case-maker

Build one audiology teaching case and get it out to every simulator: history,
otoscopy, pure-tone / play audiometry, speech, immittance, DPOAEs and ABR.

The audiogram is entered once and drives the defaults for every test; anything
can be overridden. The output is a link per simulator (plus `.json` files for the
history simulator and PTA).

Status: **stage 2** – the step-by-step editor (history, otoscopy text, audiogram,
PTA/play, speech, immittance, DPOAE, ABR), the links & files page, and saving /
opening cases. PDF auto-fill with Claude and otoscopy image upload come next.

Open `index.html` (PIN `1234`). Cases autosave in the browser; use **Cases ▾** to
start a new one, open or download a `.casemaker.json` file, or duplicate a case.

## Development

No build step. Serve the parent `Coding` folder so the tests can reach the
simulators' own source:

```
cd Coding
python -m http.server 8765
```

Then open http://127.0.0.1:8765/case-maker/tests.html. Every encoder is
round-tripped through its simulator's own decoder; see `vendor/README.md` for the
copied simulator files.

## Layout

- `index.html`, `js/main.js` – app shell, step rail, case storage, PIN gate
- `js/steps/` – one module per step, each `render(app)` → DOM node
- `js/ui.js` – DOM helpers; `simInput()` binds a field to a simulator value and records an override when edited

- `js/model.js` – the case project, audiogram interpretation, `derive*()` rules, overrides
- `js/encoders/` – one module per simulator, each `build(case, target)` → `{ url, files, warnings, note }`
- `js/config.js` – simulator URLs (deployed on GitHub Pages, or local)
- `vendor/` – verbatim copies of simulator codecs
- `tests.html` – round-trip and derive-rule tests

# Case-maker

Build one audiology teaching case and get it out to every simulator: history,
otoscopy, pure-tone / play audiometry, speech, immittance, DPOAEs and ABR.

The audiogram is entered once and drives the defaults for every test; anything
can be overridden. The output is a link per simulator (plus `.json` files for the
history simulator and PTA).

Status: **stage 1** – case model, per-simulator encoders and round-trip tests.
The wizard UI, PDF auto-fill and otoscopy upload come next.

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

- `js/model.js` – the case project, audiogram interpretation, `derive*()` rules, overrides
- `js/encoders/` – one module per simulator, each `build(case, target)` → `{ url, files, warnings, note }`
- `js/config.js` – simulator URLs (deployed on GitHub Pages, or local)
- `vendor/` – verbatim copies of simulator codecs
- `tests.html` – round-trip and derive-rule tests

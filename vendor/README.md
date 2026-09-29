# Vendored simulator code

These files are **verbatim copies** from the simulator repos, so case-maker produces
exactly what each simulator expects. Do not edit them here — edit the simulator,
then re-copy. `tests.html` fails with a "drift" error if a copy no longer matches
its original (when served from the `Coding` root).

| File | Source |
|---|---|
| `pta/share-codec.js`, `pta/utils.js`, `pta/obfuscate.js` | `jakalnz/pta-simulator` `js/` |
| `abr/codec.js` | `jakalnz/abr-simulator` `js/codec.js` |
| `play/case-codec.js` | `jakalnz/play-simulator` `js/case-codec.js` |
| `history/cases.js` | `jakalnz/history-taking-simulator` `js/cases.js` |
| `speech/pi-curve.js` | `jakalnz/speech-testing-simulator` `index.html` (`fitLogistic`, `buildPICurve`, copied out with a header and an `export`) |

Encoders for immittance, speech and DPOAE (and play's long JSON fallback) live in `js/encoders/` as small ports,
because those simulators keep their codecs inside app files or as non-module scripts.
`tests.html` round-trips each port through the simulator's own decoder.

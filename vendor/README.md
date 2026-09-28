# Vendored simulator code

These files are **verbatim copies** from the simulator repos, so case-maker produces
exactly what each simulator expects. Do not edit them here — edit the simulator,
then re-copy. `tests.html` fails with a "drift" error if a copy no longer matches
its original (when served from the `Coding` root).

| File | Source |
|---|---|
| `pta/share-codec.js`, `pta/utils.js`, `pta/obfuscate.js` | `jakalnz/pta-simulator` `js/` |
| `abr/codec.js` | `jakalnz/abr-simulator` `js/codec.js` |
| `history/cases.js` | `jakalnz/history-taking-simulator` `js/cases.js` |

Encoders for immittance, speech, play and DPOAE live in `js/encoders/` as small ports,
because those simulators keep their codecs inside app files or as non-module scripts.
`tests.html` round-trips each port through the simulator's own decoder.

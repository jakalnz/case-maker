'use strict';

// Compact case share links (#case=~<base64url>), so a shared case fits under
// the ~255-character limit of MS Word hyperlinks and LMS link fields. The
// original format (base64url of the case-serializer.js JSON wrapper) is still
// read and is still used for cases this codec can't represent exactly (e.g. a
// clipEligibility restriction, or off-grid values).
//
// Layout (MSB first): version 4 | locked 1 | testing phase 1 | videoSet 3 |
// startingFatigue 7 | responseBudget 10 | engagementDecayRate x100 9 |
// falsePositiveSusceptibility x100 9 | per game (cars, horses, marbles):
// baseResponseLevel 8, conditioningGainRate x100 8, startingConditioning 7 |
// pad to byte. Then the threshold block: right then left, 500/1k/2k/4k,
// trueThreshold and conductiveLoss as (level+10)/5 in 5 bits each, padded
// (10 bytes; XORed with the obfuscation key when locked). Then a name-length
// byte, the UTF-8 name, and the UTF-8 vignette to the end.

(function () {
  const VERSION = 1;
  const PREFIX = '~';
  const KEY = 'play-sim-case-obfuscation-v1';
  const VIDEO_SETS = [null, 'benji'];
  const GAMES = ['cars', 'horses', 'marbles'];
  const FREQS = ['500', '1000', '2000', '4000'];
  const EARS = ['right', 'left'];

  class BitWriter {
    constructor() { this.bits = []; }
    write(v, n) { for (let i = n - 1; i >= 0; i--) this.bits.push((v >>> i) & 1); }
    bytes() {
      const out = new Uint8Array(Math.ceil(this.bits.length / 8));
      this.bits.forEach((b, i) => { if (b) out[i >> 3] |= 0x80 >> (i & 7); });
      return out;
    }
  }

  class BitReader {
    constructor(bytes) { this.b = bytes; this.pos = 0; }
    read(n) {
      let v = 0;
      for (let i = 0; i < n; i++, this.pos++) v = (v << 1) | ((this.b[this.pos >> 3] >> (7 - (this.pos & 7))) & 1);
      return v >>> 0;
    }
  }

  function toB64(bytes) {
    let s = '';
    bytes.forEach((b) => { s += String.fromCharCode(b); });
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  function fromB64(str) {
    let s = str.replace(/-/g, '+').replace(/_/g, '/');
    while (s.length % 4) s += '=';
    return Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
  }

  function xor(bytes) {
    for (let i = 0; i < bytes.length; i++) bytes[i] ^= KEY.charCodeAt(i % KEY.length);
  }

  const isInt = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;
  const isHundredths = (v, hi) => typeof v === 'number' && isInt(Math.round(v * 100), 0, hi) && Math.abs(v * 100 - Math.round(v * 100)) < 1e-6;
  const isLevel = (v) => isInt(v, -10, 120) && (v + 10) % 5 === 0;

  // True when encode() -> decode() reproduces this case config exactly.
  function canEncode(cfg) {
    if (!cfg || cfg.clipEligibility && Object.keys(cfg.clipEligibility).length) return false;
    if (!VIDEO_SETS.includes(cfg.videoSet == null ? null : cfg.videoSet)) return false;
    if (!['conditioning', 'testing'].includes(cfg.startingPhase)) return false;
    if (!isInt(cfg.startingFatigue, 0, 127) || !isInt(cfg.responseBudget, 0, 1023)) return false;
    if (!isHundredths(cfg.engagementDecayRate, 511) || !isHundredths(cfg.falsePositiveSusceptibility, 511)) return false;
    if (!cfg.games || !GAMES.every((g) => cfg.games[g]
      && isInt(cfg.games[g].baseResponseLevel, 0, 255)
      && isHundredths(cfg.games[g].conditioningGainRate, 255)
      && isInt(cfg.games[g].startingConditioning, 0, 127))) return false;
    const levels = (obj) => obj && EARS.every((e) => obj[e] && FREQS.every((f) => isLevel(obj[e][f])));
    if (!levels(cfg.trueThreshold) || !levels(cfg.conductiveLoss)) return false;
    if (new TextEncoder().encode(cfg.name || '').length > 255) return false;
    return true;
  }

  // cfg: a plain case config (cases/*.json shape). Returns '~<base64url>'.
  function encode(cfg, { locked } = {}) {
    if (!canEncode(cfg)) throw new Error('This case needs the long share-link format.');
    const w = new BitWriter();
    w.write(VERSION, 4);
    w.write(locked ? 1 : 0, 1);
    w.write(cfg.startingPhase === 'testing' ? 1 : 0, 1);
    w.write(VIDEO_SETS.indexOf(cfg.videoSet == null ? null : cfg.videoSet), 3);
    w.write(cfg.startingFatigue, 7);
    w.write(cfg.responseBudget, 10);
    w.write(Math.round(cfg.engagementDecayRate * 100), 9);
    w.write(Math.round(cfg.falsePositiveSusceptibility * 100), 9);
    GAMES.forEach((g) => {
      w.write(cfg.games[g].baseResponseLevel, 8);
      w.write(Math.round(cfg.games[g].conditioningGainRate * 100), 8);
      w.write(cfg.games[g].startingConditioning, 7);
    });
    const head = w.bytes();

    const t = new BitWriter();
    EARS.forEach((e) => FREQS.forEach((f) => {
      t.write((cfg.trueThreshold[e][f] + 10) / 5, 5);
      t.write((cfg.conductiveLoss[e][f] + 10) / 5, 5);
    }));
    const thresholds = t.bytes();
    if (locked) xor(thresholds);

    const name = new TextEncoder().encode(cfg.name || '');
    const vignette = new TextEncoder().encode(cfg.vignette || '');
    const out = new Uint8Array(head.length + thresholds.length + 1 + name.length + vignette.length);
    let o = 0;
    out.set(head, o); o += head.length;
    out.set(thresholds, o); o += thresholds.length;
    out[o++] = name.length;
    out.set(name, o); o += name.length;
    out.set(vignette, o);
    return PREFIX + toB64(out);
  }

  // Returns the same shape as CaseSerializer.serializeCase() output, with the
  // thresholds in the clear (locked is carried as a flag).
  function decode(str) {
    if (str[0] !== PREFIX) throw new Error('Not a compact case link.');
    const bytes = fromB64(str.slice(1));
    const r = new BitReader(bytes);
    const version = r.read(4);
    if (version !== VERSION) throw new Error(`Unsupported compact case version ${version}`);
    const locked = r.read(1) === 1;
    const startingPhase = r.read(1) ? 'testing' : 'conditioning';
    const videoSet = VIDEO_SETS[r.read(3)] || null;
    const startingFatigue = r.read(7);
    const responseBudget = r.read(10);
    const engagementDecayRate = r.read(9) / 100;
    const falsePositiveSusceptibility = r.read(9) / 100;
    const games = {};
    GAMES.forEach((g) => {
      games[g] = { baseResponseLevel: r.read(8), conditioningGainRate: r.read(8) / 100, startingConditioning: r.read(7) };
    });
    let o = Math.ceil(r.pos / 8);

    const thresholds = bytes.slice(o, o + 10);
    o += 10;
    if (locked) xor(thresholds);
    const t = new BitReader(thresholds);
    const trueThreshold = {};
    const conductiveLoss = {};
    EARS.forEach((e) => {
      trueThreshold[e] = {};
      conductiveLoss[e] = {};
      FREQS.forEach((f) => {
        trueThreshold[e][f] = t.read(5) * 5 - 10;
        conductiveLoss[e][f] = t.read(5) * 5 - 10;
      });
    });

    const nameLen = bytes[o++];
    const name = new TextDecoder().decode(bytes.slice(o, o + nameLen));
    const vignette = new TextDecoder().decode(bytes.slice(o + nameLen));
    return {
      schemaVersion: 1,
      createdAt: null,
      locked,
      name,
      vignette,
      trueThreshold,
      conductiveLoss,
      startingFatigue,
      startingPhase,
      responseBudget,
      engagementDecayRate,
      falsePositiveSusceptibility,
      games,
      clipEligibility: {},
      videoSet,
    };
  }

  const CaseCodec = { PREFIX, canEncode, encode, decode };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = CaseCodec;
  }
  if (typeof window !== 'undefined') {
    window.CaseCodec = CaseCodec;
  }
})();

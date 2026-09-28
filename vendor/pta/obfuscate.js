/**
 * Casual-snooping deterrent only — NOT real security. The app must read the
 * actual threshold values in-browser to run the simulation, so anyone who
 * inspects the app's own source (this file included) can reverse this. The
 * point is to stop a student who opens the .json in a text editor, or
 * decodes the share-link's base64 hash, from just reading the answer key
 * off the screen — not to withstand a determined attacker with devtools.
 */
const KEY = 'pta-sim-exam-obfuscation-v1';

function xorString(str, key) {
  let out = '';
  for (let i = 0; i < str.length; i++) {
    out += String.fromCharCode(str.charCodeAt(i) ^ key.charCodeAt(i % key.length));
  }
  return out;
}

export function obfuscate(obj) {
  const json = JSON.stringify(obj);
  const xored = xorString(json, KEY);
  return btoa(unescape(encodeURIComponent(xored)));
}

export function deobfuscate(encoded) {
  const xored = decodeURIComponent(escape(atob(encoded)));
  const json = xorString(xored, KEY);
  return JSON.parse(json);
}

// Same deterrent, applied in place to raw bytes (compact share-link format,
// js/share-codec.js) instead of a separate JSON+base64 pass — keeps the
// patient block's packed size fixed and symmetric (XOR is its own inverse).
export function xorBytes(bytes) {
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] ^= KEY.charCodeAt(i % KEY.length);
  }
}

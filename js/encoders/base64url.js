// base64url helpers shared by the encoders (URL-safe alphabet, no padding),
// matching the helpers each simulator uses.

export function bytesToBase64Url(bytes) {
  let binary = '';
  bytes.forEach((b) => { binary += String.fromCharCode(b); });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function base64UrlToBytes(str) {
  let b64 = str.replace(/-/g, '+').replace(/_/g, '/');
  while (b64.length % 4) b64 += '=';
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

// UTF-8 string -> base64url, the same as btoa(unescape(encodeURIComponent(s))) + URL-safe.
export function stringToBase64Url(str) {
  return bytesToBase64Url(new TextEncoder().encode(str));
}

export function base64UrlToString(str) {
  return new TextDecoder().decode(base64UrlToBytes(str));
}

// Standard (not URL-safe) base64 of a UTF-8 string, as btoa(unescape(encodeURIComponent(s))).
export function stringToBase64(str) {
  let binary = '';
  new TextEncoder().encode(str).forEach((b) => { binary += String.fromCharCode(b); });
  return btoa(binary);
}

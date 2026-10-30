// Secret key detector: known vendor key/token prefixes and PEM private
// key headers. Returns true/false only.
import type { Detector } from "./types";

// FALSIFIED 2026-09-20: sk_live_/sk_test_ (Stripe,
// underscore not hyphen), github_pat_ (GitHub fine-grained PAT), and raw
// JWTs all missed. Added below.
const PATTERNS: RegExp[] = [
  /\bsk-[A-Za-z0-9_-]{10,}/, // sk-prefixed secret key, including sk-proj- and sk-ant- shapes
  /\bsk_(live|test)_[A-Za-z0-9]{20,}\b/, // Stripe secret key
  /\bAKIA[0-9A-Z]{16}\b/, // AWS access key id
  /\bghp_[A-Za-z0-9]{20,}\b/, // GitHub personal access token (classic)
  /\bgithub_pat_[A-Za-z0-9_]{20,}\b/, // GitHub fine-grained PAT
  /\bxox[abp]-[A-Za-z0-9-]{10,}\b/, // Slack token
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/, // PEM private key header
  /\bAIza[0-9A-Za-z_-]{20,}\b/, // AIza-prefixed API key
];

// Raw JWT: three base64url runs joined by dots, header starting eyJ (the
// base64url of `{"`). F1: the unanchored regex took 8 s on
// 40k units of "ab-", and an eyJ-anchored regex was still quadratic on
// "eyJ-" repeated (9.5 s at 200K, measured), because every eyJ start rescans
// the same dash run. This is the same shape done in one linear pass: run
// ends are precomputed, so each eyJ candidate is O(1).
const isB64 = (c: number): boolean =>
  (c >= 48 && c <= 57) || (c >= 65 && c <= 90) || (c >= 97 && c <= 122) || c === 95 || c === 45;
const isWord = (c: number): boolean => c !== 45 && isB64(c);

export function detectJwt(text: string): boolean {
  const n = text.length;
  if (n < 30 || text.indexOf("eyJ") === -1) return false;
  // runEnd[i]: index of the first non-base64url char at or after i.
  const runEnd = new Int32Array(n + 1);
  runEnd[n] = n;
  for (let i = n - 1; i >= 0; i--) {
    runEnd[i] = isB64(text.charCodeAt(i)) ? runEnd[i + 1]! : i;
  }
  let from = 0;
  for (;;) {
    const i = text.indexOf("eyJ", from);
    if (i === -1) return false;
    from = i + 1;
    if (i > 0 && isWord(text.charCodeAt(i - 1))) continue; // \b before
    const h = runEnd[i]!;
    if (h - i < 10 || text.charCodeAt(h) !== 46) continue;
    const p = runEnd[h + 1]!;
    if (p - (h + 1) < 10 || text.charCodeAt(p) !== 46) continue;
    let e = runEnd[p + 1]!;
    while (e > p + 1 && text.charCodeAt(e - 1) === 45) e--; // \b after
    if (e - (p + 1) >= 10) return true;
  }
}

export function detectSecret(text: string): boolean {
  return PATTERNS.some((p) => p.test(text)) || detectJwt(text);
}

export const secretDetector: Detector = { category: "secret", test: detectSecret };

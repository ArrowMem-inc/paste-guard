#!/usr/bin/env node
// Greps the BUILT bundle for forbidden network APIs and for console
// output that could carry content. Run in `npm test`. Exits non-zero on
// any hit (see tests/unit/check-no-network.test.ts for the falsification:
// a throwaway dist with a fetch( call must make this exit non-zero).
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Network APIs forbidden anywhere in the built output.
const FORBIDDEN_NETWORK_TOKENS = [
  "fetch(",
  "XMLHttpRequest",
  "WebSocket",
  "sendBeacon",
  "EventSource",
  "importScripts",
  // Beacon shapes that need no fetch(): an image, iframe, link or script
  // element with a remote src, or a navigation.
  "new Image",
  'createElement("img"',
  'createElement("iframe"',
  'createElement("link"',
  'createElement("script"',
  ".src =",
  ".src=",
  'setAttribute("src"',
  "setAttribute('src'",
  'setAttribute("href"',
  "setAttribute('href'",
  "window.open(",
  "location.href =",
  "location.href=",
  "location.assign(",
  "location.replace(",
  // Handing pasted content to the host page's own JS context is a leak
  // even though it is not a "network call" in the narrowest sense -- the
  // page can fetch() with it, and this checker has no way to inspect the
  // page's own code (a demonstrated gap, Attack B -- see Attack A below).
  "postMessage(",
  // WebRTC ICE/STUN/TURN is a documented covert channel; no fetch()/XHR
  // is needed for it to leak data off-device.
  "RTCPeerConnection",
  "createDataChannel",
];

// ponytail: this is still a literal-token/string grep, not an AST walk. It
// cannot and will not catch a computed-property-access, string-concatenated
// bypass -- e.g. `window["f"+"e"+"t"+"c"+"h"](url)` -- because no forbidden
// token or URL literal ever appears verbatim in the bundle (a
// demonstrated gap, Attack A). Closing that class for real
// needs an AST-based check (walk CallExpression callees and computed
// MemberExpressions on window/self/globalThis with the TypeScript compiler
// API, already a devDependency here) rather than a wider token list, which
// is a real gap, not a false sense of coverage: it is not attempted here.

// No console output that could carry pasted content. Forbid all of
// it, not just log/info/debug -- "allow nothing".
const FORBIDDEN_CONSOLE_TOKENS = [
  "console.log(",
  "console.info(",
  "console.debug(",
  "console.warn(",
  "console.error(",
];

const REMOTE_SCRIPT_SRC = /<script\b[^>]*\bsrc\s*=\s*["']https?:/i;
const URL_PATTERN = /(?:https?|wss?|ftp|stun|turn):\/\/[^\s"'`)<>]+/g;

// Deliberate, reviewed, static outbound links: a plain <a href> a human
// clicks, never fetched or navigated to by this extension's own code. Not
// a network call (this check is about what the extension DOES, not what a
// user may choose to click), but still named explicitly here rather than
// silently widening the URL check -- an unreviewed URL should still fail.

const ALLOWED_STATIC_LINK_URLS = new Set(["https://arrowmem.ca"]);

const ALLOWED_PERMISSIONS = new Set(["storage"]);
const EXPLICITLY_FORBIDDEN_PERMISSIONS = ["webRequest", "alarms", "identity", "tabs"];

function listFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      out.push(...listFiles(full));
    } else {
      out.push(full);
    }
  }
  return out;
}

function checkManifest(dir, errors) {
  const manifestPath = path.join(dir, "manifest.json");
  if (!existsSync(manifestPath)) {
    errors.push(`manifest.json missing from ${dir}`);
    return [];
  }
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));

  const hostPermissions = manifest.host_permissions ?? [];
  if (hostPermissions.length > 0) {
    errors.push(`manifest.json host_permissions is non-empty: ${JSON.stringify(hostPermissions)}`);
  }

  const permissions = manifest.permissions ?? [];
  for (const p of permissions) {
    if (!ALLOWED_PERMISSIONS.has(p)) {
      errors.push(`manifest.json permissions contains disallowed entry: ${p}`);
    }
    if (EXPLICITLY_FORBIDDEN_PERMISSIONS.includes(p)) {
      errors.push(`manifest.json permissions contains forbidden entry: ${p}`);
    }
  }

  const allowedUrls = new Set();
  for (const cs of manifest.content_scripts ?? []) {
    for (const m of cs.matches ?? []) {
      allowedUrls.add(m);
    }
  }
  return [...allowedUrls];
}

export function runCheck(dir) {
  const errors = [];
  if (!existsSync(dir)) {
    return { ok: false, errors: [`${dir} does not exist -- run "npm run build" first`] };
  }

  const allowedUrls = checkManifest(dir, errors);

  const files = listFiles(dir);
  for (const file of files) {
    const text = readFileSync(file, "utf8");
    const rel = path.relative(dir, file);

    for (const token of FORBIDDEN_NETWORK_TOKENS) {
      if (text.includes(token)) {
        errors.push(`${rel}: forbidden network token "${token}"`);
      }
    }
    for (const token of FORBIDDEN_CONSOLE_TOKENS) {
      if (text.includes(token)) {
        errors.push(`${rel}: forbidden console token "${token}"`);
      }
    }
    if (REMOTE_SCRIPT_SRC.test(text)) {
      errors.push(`${rel}: remote <script src=...> found`);
    }

    const matches = text.match(URL_PATTERN) ?? [];
    for (const url of matches) {
      const allowed =
        allowedUrls.some((pattern) => url === pattern || pattern.startsWith(url)) ||
        ALLOWED_STATIC_LINK_URLS.has(url);
      if (!allowed) {
        errors.push(`${rel}: unexplained URL literal "${url}"`);
      }
    }
  }

  return { ok: errors.length === 0, errors };
}

function main() {
  const dir = process.argv[2] ?? "dist";
  const { ok, errors } = runCheck(dir);
  if (!ok) {
    console.error(`check-no-network: FAIL (${errors.length} issue(s)) in ${dir}`);
    for (const e of errors) console.error(`  - ${e}`);
    process.exit(1);
  }
  console.log(`check-no-network: PASS (${dir})`);
  process.exit(0);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main();
}

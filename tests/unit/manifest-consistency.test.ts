// The manifest's content_scripts.matches must inject on exactly
// the sites in src/sites.ts -- an unknown site gets nothing injected, and a
// site in the table that the manifest forgot would silently watch nothing.
//
// FALSIFIED 2026-09-07: deleted the grok.com match pattern from the real
// manifest.json's content_scripts, ran this test -> "covers every
// hostname in SITES" failed with "expected [ 'grok.com' ] to deeply equal
// []". Restored the pattern immediately after (verified against the
// restored file's diff before moving on).
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { SITES } from "../../src/sites";

const ROOT = path.resolve(__dirname, "../..");

function hostnameCovered(hostname: string, matches: string[]): boolean {
  return matches.some((pattern) => {
    // Strip scheme and path wildcard to compare hosts loosely.
    const hostPart = pattern.replace(/^https?:\/\//, "").split("/")[0]!;
    return hostPart === hostname;
  });
}

function loadManifest(file: string): { content_scripts: { matches: string[] }[] } {
  return JSON.parse(readFileSync(path.join(ROOT, file), "utf8"));
}

describe("manifest content_scripts matches SITES (Chrome/Edge manifest.json)", () => {
  const manifest = loadManifest("manifest.json");
  const matches = manifest.content_scripts.flatMap((cs) => cs.matches);

  it("covers every hostname in SITES", () => {
    const uncovered: string[] = [];
    for (const site of SITES) {
      for (const host of site.hostnames) {
        if (!hostnameCovered(host, matches)) uncovered.push(host);
      }
    }
    expect(uncovered).toEqual([]);
  });

  it("restricts the x.com match to the Grok path, not the whole site", () => {
    const xMatch = matches.find((m) => m.includes("x.com"));
    expect(xMatch).toBe("https://x.com/i/grok*");
  });
});

describe("manifest content_scripts matches SITES (Firefox manifest.firefox.json)", () => {
  const manifest = loadManifest("manifest.firefox.json");
  const matches = manifest.content_scripts.flatMap((cs) => cs.matches);

  it("covers every hostname in SITES", () => {
    const uncovered: string[] = [];
    for (const site of SITES) {
      for (const host of site.hostnames) {
        if (!hostnameCovered(host, matches)) uncovered.push(host);
      }
    }
    expect(uncovered).toEqual([]);
  });
});

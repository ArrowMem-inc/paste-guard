// Findings F1 and F8. Probe strings are built with escapes so this file
// stays ASCII (tests/unit/ascii-only.test.ts).
//
// FALSIFIED 2026-10-29: F1 restored the unanchored JWT regex -> the 200K
// dash-heavy test exceeded its budget; F8 removed one separator char at a
// time and removed the NFKC line -> the matching probe went red each time.
import { describe, expect, it } from "vitest";
import { detectCategories } from "../../../src/detectors/index";
import { detectSecret } from "../../../src/detectors/secret";
import { join, rep } from "../../support/fixtures";

const CARD = ["4242", "4242", "4242", "4242"];
const SIN = ["046", "454", "286"];

describe("F1 JWT regex", () => {
  it("still flags a real-shaped JWT", () => {
    const jwt = join("ey", "J", rep("a", 16), ".", "ey", "J", rep("b", 20), ".", rep("c", 26));
    expect(detectSecret(jwt)).toBe(true);
  });
  it("does not flag a hostname with long labels (was a false positive)", () => {
    expect(detectSecret("see averylonglabel.anotherlonglabel.somethinglong")).toBe(false);
  });
  it("decides in under 50ms on a 200,000 character dash-heavy input", () => {
    for (const unit of ["ab-", "1-", "-", "eyJ-", "eyJ.", "eyJaaaaaaaaaa.", "AIza-", "ghp_a", "xoxb-"]) {
      const text = unit.repeat(Math.ceil(200000 / unit.length)).slice(0, 200000);
      const start = performance.now();
      detectCategories(text);
      const elapsed = performance.now() - start;
      expect(elapsed, `unit ${unit}`).toBeLessThan(50);
    }
  });
});

describe("F8 separators and normalisation", () => {
  for (const [name, ch] of [
    ["U+200B", "\u200B"],
    ["U+200C", "\u200C"],
    ["U+200D", "\u200D"],
    ["U+2060", "\u2060"],
    ["U+FEFF", "\uFEFF"],
  ] as const) {
    it(`card separated by ${name} is detected`, () => {
      expect(detectCategories(CARD.join(ch))).toContain("card");
    });
    it(`SIN separated by ${name} is detected`, () => {
      expect(detectCategories(SIN.join(ch))).toContain("sin");
    });
  }
  it("fullwidth digits card is detected (NFKC)", () => {
    const fw = CARD.join(" ").replace(/\d/g, (d) => String.fromCharCode(0xff10 + Number(d)));
    expect(detectCategories(fw)).toContain("card");
  });
  it("fullwidth hyphen in a labeled SSN is detected (NFKC)", () => {
    expect(detectCategories("my ssn is 123\uFF0D45\uFF0D6789")).toContain("ssn");
  });
  it("fullwidth hyphen after sk is detected (NFKC)", () => {
    expect(detectCategories("sk\uFF0Dabcdefghijklmnop")).toContain("secret");
  });
  it("plain text is not flagged", () => {
    expect(detectCategories("hello there, nothing here")).toEqual([]);
  });
});

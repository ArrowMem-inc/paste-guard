// FALSIFIED 2026-09-07: broke detectHealth by changing `.includes(word)` to
// `.startsWith(word)` on the whole lowercased text -> three tests failed
// ("detects diagnosis mid-sentence", "detects a case-insensitive label",
// "detects prescribed"), each with "expected false to be true" (the label
// word was no longer found unless it opened the message). Restored the
// substring check.
//
// FALSIFIED 2026-09-07: put the plain substring check back
// (`lower.includes(word)`) -> "archive is not HIV" failed with "expected
// true to be false" and "matches a two-word label across ordinary spacing"
// failed with "expected false to be true". Restored the whole-word patterns.
//
// This detector is label-based ONLY, never a symptom guess, and
// is OFF BY DEFAULT in v1 (see src/detectors/health.ts, src/storage.ts,
// README) -- wired and tested here, not enabled unless it is explicitly
// turned on in chrome.storage.local.
import { describe, expect, it } from "vitest";
import { detectHealth, HEALTH_WORDS } from "../../../src/detectors/health";

describe("detectHealth", () => {
  it("detects diagnosis mid-sentence", () => {
    expect(detectHealth("here is my diagnosis from last week")).toBe(true);
  });

  it("detects a case-insensitive label", () => {
    expect(detectHealth("I am HIV positive")).toBe(true);
  });

  it("detects prescribed", () => {
    expect(detectHealth("the doctor prescribed something new")).toBe(true);
  });

  it("does not treat a word that merely contains a label as a hit (archive is not HIV)", () => {
    expect(detectHealth("please archive this thread")).toBe(false);
  });

  it("matches a two-word label across ordinary spacing", () => {
    expect(detectHealth("my test  result came back")).toBe(true);
  });

  it("ignores prose with no listed label", () => {
    expect(detectHealth("I have a headache today")).toBe(false);
  });

  it("keeps the word list short and published", () => {
    expect(HEALTH_WORDS.length).toBeLessThanOrEqual(10);
  });
});

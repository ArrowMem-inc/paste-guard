// FALSIFIED 2026-09-07: broke detectSin by changing the required digit
// count from `digits.length === 9` to `digits.length === 8` -> three
// tests failed ("detects a bare valid SIN", "detects a dashed valid SIN",
// "detects a spaced valid SIN"), each with "expected false to be true"
// (a 9-digit Luhn-valid run no longer matched the broken 8-digit check).
// Restored the 9-digit requirement.
import { describe, expect, it } from "vitest";
import { detectSin } from "../../../src/detectors/sin";

// 046454286 is Luhn-valid and used here only as a synthetic fixture value.
describe("detectSin", () => {
  it("detects a bare valid SIN", () => {
    expect(detectSin("my sin is 046454286")).toBe(true);
  });

  it("detects a dashed valid SIN", () => {
    expect(detectSin("046-454-286")).toBe(true);
  });

  it("detects a spaced valid SIN", () => {
    expect(detectSin("046 454 286")).toBe(true);
  });

  it("ignores a 9 digit run that fails Luhn", () => {
    expect(detectSin("123456789")).toBe(false);
  });

  it("ignores an 8 digit run", () => {
    expect(detectSin("12345678")).toBe(false);
  });

  it("detects a SIN separated by non-breaking spaces", () => {
    expect(detectSin("046\u00A0454\u00A0286")).toBe(true);
  });
});

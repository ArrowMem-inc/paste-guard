// FALSIFIED 2026-09-07: broke detectSsn by replacing the
// `LABELS.some(...)` check with a bare `true` (made it return true on
// shape alone) -> two tests failed: "ignores the 3-2-4 shape with no
// label nearby" and "ignores a label far outside the window", both with
// "expected true to be false" (a bare invoice-style 3-2-4 number, and one
// with the label pushed outside the window, both started matching).
// Restored the label requirement.
//
// FALSIFIED 2026-09-20: a real SSN shape with
// "social security" 44 characters away in an ordinary sentence missed the
// old 40-char window. Widened to 60; the "far outside" padding test below
// was widened past the new window so it still proves a bound exists.
import { describe, expect, it } from "vitest";
import { detectSsn } from "../../../src/detectors/ssn";

describe("detectSsn", () => {
  it("detects the shape when labeled ssn", () => {
    expect(detectSsn("my ssn is 123-45-6789")).toBe(true);
  });

  it("detects the shape when labeled social security", () => {
    expect(detectSsn("social security number: 123-45-6789")).toBe(true);
  });

  it("detects the shape when the label follows", () => {
    expect(detectSsn("123-45-6789 is my SSN")).toBe(true);
  });

  it("ignores the 3-2-4 shape with no label nearby", () => {
    expect(detectSsn("invoice 123-45-6789 was paid last week")).toBe(false);
  });

  it("ignores a label far outside the window", () => {
    const padding = "x".repeat(90);
    expect(detectSsn(`ssn ${padding} 123-45-6789`)).toBe(false);
  });

  it("catches a label 44 characters from the shape in an ordinary sentence", () => {
    const text =
      "For the loan application they need my social security " +
      "number which I believe is 123-45-6789 for the file.";
    expect(detectSsn(text)).toBe(true);
  });
});

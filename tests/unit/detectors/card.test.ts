// FALSIFIED 2026-09-07: broke detectCard by changing the length bound from
// `digits.length <= 19` to `digits.length <= 12` (so no 16-digit candidate
// could ever qualify) -> three tests failed: "detects a bare Stripe test
// card", "detects a spaced Stripe test card" and "detects a dashed Stripe
// test card" all failed with "expected false to be true". Restored the
// 13-19 bound.
import { describe, expect, it } from "vitest";
import { detectCard } from "../../../src/detectors/card";

describe("detectCard", () => {
  it("detects a bare Stripe test card", () => {
    expect(detectCard("my card is 4242424242424242 thanks")).toBe(true);
  });

  it("detects a spaced Stripe test card", () => {
    expect(detectCard("4242 4242 4242 4242")).toBe(true);
  });

  it("detects a dashed Stripe test card", () => {
    expect(detectCard("4242-4242-4242-4242")).toBe(true);
  });

  it("ignores a 16 digit run that fails Luhn", () => {
    expect(detectCard("1234567890123456")).toBe(false);
  });

  it("ignores ordinary prose with short numbers", () => {
    expect(detectCard("call me at 555-1234 around 3pm")).toBe(false);
  });

  it("ignores a too-short digit run even when Luhn-valid", () => {
    // 424242424242 (12 digits) passes Luhn but is below the 13-digit floor.
    expect(detectCard("424242424242")).toBe(false);
  });

  it("detects a card separated by non-breaking spaces", () => {
    expect(detectCard("4242\u00A04242\u00A04242\u00A04242")).toBe(true);
  });

  it("detects a card broken across newlines", () => {
    expect(detectCard("4242\n4242\n4242\n4242")).toBe(true);
  });

  it("detects a card separated by en dashes", () => {
    expect(detectCard("4242\u20134242\u20134242\u20134242")).toBe(true);
  });

  it("still ignores a Luhn-invalid run with non-breaking-space separators (no new false positive)", () => {
    expect(detectCard("1234\u00A05678\u00A09012\u00A03456")).toBe(false);
  });
});

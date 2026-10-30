// FALSIFIED 2026-09-07: broke detectPassport by widening WINDOW from 40 to
// 4000 -> test "ignores a run when passport is far outside the window"
// failed with "expected true to be false" (a passport mention on the other
// side of a long message started matching an unrelated alphanumeric run).
// Restored WINDOW = 40.
//
// FALSIFIED 2026-09-20: the old letters-only
// RUN pattern matched ordinary English words with no digit in them at all
// ("before", "updating"), so any sentence mentioning "passport" nearly
// always misfired. Requiring at least one digit in the run (real passport
// numbers always have one) fixes it; the "far outside the window" padding
// below was widened past the new WINDOW=100 so it still proves the window
// bound, not just the digit requirement.
import { describe, expect, it } from "vitest";
import { detectPassport } from "../../../src/detectors/passport";

describe("detectPassport", () => {
  it("detects a run near the word passport", () => {
    expect(detectPassport("my passport number is AB123456")).toBe(true);
  });

  it("detects when the run comes before the label", () => {
    expect(detectPassport("AB123456 is on my passport")).toBe(true);
  });

  it("ignores a run with no passport label anywhere", () => {
    expect(detectPassport("the tracking code is AB123456")).toBe(false);
  });

  it("ignores a run when passport is far outside the window", () => {
    const padding = "x ".repeat(60);
    expect(detectPassport(`passport ${padding} AB123456`)).toBe(false);
  });

  it("ignores a run shorter than 6 characters", () => {
    expect(detectPassport("my passport is AB123")).toBe(false);
  });

  it("does not fire on 'please renew my passport before June'", () => {
    expect(detectPassport("please renew my passport before June")).toBe(false);
  });

  it("does not fire on 'my passport photo needs updating'", () => {
    expect(detectPassport("my passport photo needs updating")).toBe(false);
  });

  it("still catches a real passport line separated from the label by 91 chars", () => {
    const text =
      "AB123456 is on the inside cover. It is for my trip next year and I need it " +
      "soon so pls check on my passport when you can, ok?";
    expect(detectPassport(text)).toBe(true);
  });
});

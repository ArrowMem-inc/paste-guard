// Passport detector: the word "passport" within 100 characters of a
// 6-9 character alphanumeric run that contains at least one digit (real
// passport numbers always mix letters and digits, or are all-digit; a bare
// English word never has a digit in it, which is what made the original
// letters-only pattern fire on "before"/"updating" etc). Returns true/false
// only.
//
// FALSIFIED 2026-09-20: "please renew my passport before
// June" and "my passport photo needs updating" both matched the old
// digit-free pattern. See tests/unit/detectors/passport.test.ts.
import type { Detector } from "./types";

const RUN = /\b(?=[A-Za-z0-9]*\d)[A-Za-z0-9]{6,9}\b/g;
const LABEL = "passport";
const WINDOW = 100;

export function detectPassport(text: string): boolean {
  const lower = text.toLowerCase();
  let m: RegExpExecArray | null;
  RUN.lastIndex = 0;
  while ((m = RUN.exec(text)) !== null) {
    // Skip a run that IS the label word itself.
    if (m[0].toLowerCase() === LABEL) continue;
    const start = Math.max(0, m.index - WINDOW);
    const end = Math.min(text.length, m.index + m[0].length + WINDOW);
    const context = lower.slice(start, end);
    if (context.includes(LABEL)) {
      return true;
    }
  }
  return false;
}

export const passportDetector: Detector = { category: "passport", test: detectPassport };

// US SSN detector: the 3-2-4 shape (NNN-NN-NNNN) with a label nearby.
// Shape alone is too common a false positive (phone extensions, invoice
// numbers), so this requires a label word within 60 characters of the shape.
// Returns true/false only.
//
// FALSIFIED 2026-09-20: a real SSN shape with "social
// security" 44 characters away in an ordinary sentence missed at the old
// 40-char window. Widened to 60.
import type { Detector } from "./types";

const SHAPE = /\b\d{3}-\d{2}-\d{4}\b/g;
const LABELS = ["ssn", "social security"];
const WINDOW = 60;

export function detectSsn(text: string): boolean {
  const lower = text.toLowerCase();
  let m: RegExpExecArray | null;
  SHAPE.lastIndex = 0;
  while ((m = SHAPE.exec(text)) !== null) {
    const start = Math.max(0, m.index - WINDOW);
    const end = Math.min(text.length, m.index + m[0].length + WINDOW);
    const context = lower.slice(start, end);
    if (LABELS.some((label) => context.includes(label))) {
      return true;
    }
  }
  return false;
}

export const ssnDetector: Detector = { category: "ssn", test: detectSsn };

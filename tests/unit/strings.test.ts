// Every fr value is exactly the placeholder for now (real French has not
// been delivered yet -- French is never invented here). When real strings
// are delivered this test flips from `toBe(FR_PLACEHOLDER)` to asserting
// non-empty, non-placeholder values.
//
// FALSIFIED 2026-09-07: broke it by editing the real
// STRINGS.categoryCard.fr in src/strings.ts to "Ceci ressemble a un
// numero de carte." (invented French) -> the "every fr value is exactly
// FR-PENDING" assertion failed with "categoryCard.fr must be the
// untranslated placeholder: expected 'Ceci ressemble a un numero de
// carte.' to be 'FR-PENDING'". Reverted; real French must be supplied
// from the render, never invented here.
//
// 2026-09-09: popupBlocked, popupBlockedDetail and popupCheckError
// now carry real French, accents written as \uXXXX escapes
// (same convention src/strings.ts's own CORNER_STRINGS already uses, so
// this repo's ascii-only.test.ts stays green while the runtime string still
// carries the real accent). Those three keys are excluded from the "still
// the placeholder" loop below and checked instead for non-empty,
// non-placeholder values. Every other key is still FR-PENDING and
// stays in that loop.
import { describe, expect, it } from "vitest";
import { STRINGS, FR_PLACEHOLDER, pickString } from "../../src/strings";

// 2026-09-12: sixteen strings landed on main (paste-guard PR #5) in the escape convention
// PR #3 set, so they join the translated list.
//
// 2026-09-20: the last two, popupWatchingDetail and popupLoading, now carry real French in that
// same escape convention, so the table is complete and this list is every key. The old "the
// untranslated ones are still the placeholder" assertion has nothing left to guard, so it flips
// to the stronger claim it was always heading for: no value anywhere is the placeholder. The
// fallback in pickString is still real code and still tested below, now by forcing the condition
// rather than by relying on a key that is genuinely untranslated, because none are.
const TRANSLATED_KEYS = [
  "popupBlocked", "popupBlockedDetail", "popupCheckError",
  "categoryCard", "categorySin", "categorySsn", "categoryPassport", "categorySecret", "categoryHealth",
  "removeIt", "sendAnyway", "pasteAnyway", "dropAnyway",
  "badgeWatching", "badgeOff", "popupWatching", "popupNotFoundPrefix", "popupNotFoundSuffix", "popupNotOnList",
  "popupWatchingDetail", "popupLoading",
];

describe("STRINGS table", () => {
  it("has an en value for every entry", () => {
    for (const [key, entry] of Object.entries(STRINGS)) {
      expect(entry.en.length, `${key}.en should be non-empty`).toBeGreaterThan(0);
    }
  });

  it("no fr value is left as the placeholder", () => {
    for (const [key, entry] of Object.entries(STRINGS)) {
      expect(entry.fr, `${key}.fr must not be the untranslated placeholder`).not.toBe(FR_PLACEHOLDER);
      expect(entry.fr.length, `${key}.fr should be non-empty`).toBeGreaterThan(0);
    }
  });

  it("every key is accounted for in TRANSLATED_KEYS", () => {
    // Guards the pair above: a new key added without French would otherwise be checked for
    // emptiness but never for repeating the English or carrying its accents.
    for (const key of Object.keys(STRINGS)) {
      expect(TRANSLATED_KEYS, `${key} must be listed in TRANSLATED_KEYS`).toContain(key);
    }
  });

  it("popupBlocked, popupBlockedDetail and popupCheckError carry real French", () => {
    // badgeWatching and badgeOff are deliberately "ON"/"OFF" in both languages (a four-character
    // badge; the reasoning is in src/strings.ts), so they are translated but not different.
    const SAME_IN_BOTH = ["badgeWatching", "badgeOff"];
    for (const key of TRANSLATED_KEYS) {
      if (SAME_IN_BOTH.includes(key)) continue;
      const entry = STRINGS[key]!;
      expect(entry.fr.length, `${key}.fr should be non-empty`).toBeGreaterThan(0);
      expect(entry.fr, `${key}.fr must not still be the placeholder`).not.toBe(FR_PLACEHOLDER);
      expect(entry.fr, `${key}.fr must not repeat the English`).not.toBe(entry.en);
    }
  });

  it("pickString returns the French value for a french locale", () => {
    expect(pickString("popupLoading", "fr-CA")).toBe(STRINGS.popupLoading!.fr);
  });

  it("pickString still falls back to en if a value is ever left as the placeholder", () => {
    // No key is untranslated any more, so the condition is forced rather than borrowed from a
    // real gap. The fallback stays covered because the code path is still there for the next key
    // somebody adds ahead of its French.
    const entry = STRINGS.popupLoading!;
    const real = entry.fr;
    entry.fr = FR_PLACEHOLDER;
    try {
      expect(pickString("popupLoading", "fr-CA")).toBe(entry.en);
    } finally {
      entry.fr = real;
    }
  });

  it("pickString returns en for an english locale", () => {
    expect(pickString("popupLoading", "en-US")).toBe(STRINGS.popupLoading!.en);
  });
});

// Every user-facing string lives in this one table. `fr` is the
// literal placeholder "FR-PENDING" until real French with accents is
// supplied. French is never invented (house rule: paste render words
// verbatim, never author copy -- the same rule applies to translation:
// never author French).
//
// tests/unit/strings.test.ts asserts every `fr` value is exactly the
// placeholder for now. Once real strings are delivered, that test flips
// to asserting non-empty, non-placeholder values.

export const FR_PLACEHOLDER = "FR-PENDING";

export interface StringEntry {
  en: string;
  fr: string;
}

export const STRINGS: Record<string, StringEntry> = {
  categoryCard: {
    en: "This looks like a card number.",
    fr: "Ceci ressemble \u00e0 un num\u00e9ro de carte.",
  },
  categorySin: {
    en: "This looks like a Social Insurance Number.",
    fr: "Ceci ressemble \u00e0 un num\u00e9ro d'assurance sociale.",
  },
  categorySsn: {
    en: "This looks like a Social Security Number.",
    fr: "Ceci ressemble \u00e0 un num\u00e9ro de s\u00e9curit\u00e9 sociale.",
  },
  categoryPassport: {
    en: "This looks like a passport number.",
    fr: "Ceci ressemble \u00e0 un num\u00e9ro de passeport.",
  },
  categorySecret: {
    en: "This looks like a secret key.",
    fr: "Ceci ressemble \u00e0 une cl\u00e9 secr\u00e8te.",
  },
  categoryHealth: {
    en: "This looks like a health detail.",
    fr: "Ceci ressemble \u00e0 un renseignement de sant\u00e9.",
  },

  removeIt: { en: "Remove it", fr: "Le retirer" },
  sendAnyway: { en: "Send anyway", fr: "Envoyer quand m\u00eame" },
  pasteAnyway: { en: "Paste anyway", fr: "Coller quand m\u00eame" },
  dropAnyway: { en: "Drop anyway", fr: "D\u00e9poser quand m\u00eame" },

  // (5f606b4): the badge pair stays "ON"/"OFF" in French deliberately,
  // and that is not a missing translation. chrome.action.setBadgeText shows
  // about four characters before truncating, and every real French
  // rendering of the state is longer (ACTIF/INACTIF, MARCHE/ARRET). A badge
  // truncated to "ACTI" tells a French reader less than ON/OFF does, and
  // ON/OFF is already the convention on French toggles for that reason.
  badgeWatching: { en: "ON", fr: "ON" },
  badgeOff: { en: "OFF", fr: "OFF" },

  // Design render 2 (Claude Design export),
  // "The popup -- live SVG mark, status first": words pasted verbatim from
  // the "Active" card. popupWatchingDetail is the secondary line shown
  // only under this state (see src/popup.ts). The render's "Flagged" and
  // "Error" cards have no corresponding data anywhere in this codebase
  // (no per-tab last-block-event and no check-failure signal exist) and
  // are NOT built -- see the report, not invented here.
  popupWatching: {
    en: "Paste Guard is on.",
    fr: "Surveillance de ce champ de saisie.",
  },
  popupWatchingDetail: {
    en: "Scanning clipboard pastes into AI tools for anything that looks like a key or a secret.",
    fr: "Analyse des collages vers les outils d'intelligence artificielle, \u00e0 la recherche de ce qui ressemble \u00e0 une cl\u00e9 ou \u00e0 un secret.",
  },
  // (5f606b4): popupNotFoundPrefix/Suffix are concatenated around two
  // runtime values in popup.ts (`${prefix} ${displayName} ${suffix}
  // ${captured}).`); the French keeps the same slot order so the assembled
  // sentence reads correctly rather than two fragments in English word
  // order, e.g. "Aucune surveillance ici : le champ de saisie de ChatGPT
  // est introuvable (selecteur date du 2026-09-07)."
  popupNotFoundPrefix: {
    en: "Not watching here: the composer for",
    fr: "Aucune surveillance ici : le champ de saisie de",
  },
  popupNotFoundSuffix: {
    en: "was not found (selector dated",
    fr: "est introuvable (s\u00e9lecteur dat\u00e9 du",
  },
  // Render's "No page" card, verbatim.
  popupNotOnList: {
    en: "Nothing to scan on this page.",
    fr: "Ce site ne figure pas dans la liste.",
  },
  // Render's "Loading" card, verbatim -- already matched the hardcoded
  // popup.html text; moved into this table so it goes through pickString
  // like every other user-facing string.
  popupLoading: { en: "Loading...", fr: "Chargement..." },

  // 2026-09-09: the render's "Flagged" and "Error" cards, now built.
  // Words pasted verbatim from the render's "Flagged - Light" and
  // "Error - Dark" cards. popupBlockedDetail is the fixed sentence the
  // render shows under every blocked outcome regardless of which detector
  // category fired -- the category itself (src/detectors/types.ts) is
  // tracked in src/content.ts's in-memory LastOutcome but never surfaces in
  // this text, matching the render exactly. The Error card has no detail
  // line in the render, so popupCheckError has no matching *Detail entry.
  // FR bytes are \uXXXX escapes, not literal accented characters -- this
  // repo's tests/unit/ascii-only.test.ts walks the whole tree and fails on
  // any byte above 0x7F, so the accents below are written as JS string
  // escapes; they still render as real French to a viewer.
  popupBlocked: { en: "A paste was blocked.", fr: "Un collage a \u00e9t\u00e9 bloqu\u00e9." },
  popupBlockedDetail: {
    en: "Something in that paste looked like a key or a secret, so it was not sent.",
    fr: "Quelque chose dans ce collage ressemblait \u00e0 une cl\u00e9 ou \u00e0 un secret, alors il n'a pas \u00e9t\u00e9 envoy\u00e9.",
  },
  popupCheckError: {
    en: "Paste Guard couldn't check this paste.",
    fr: "Paste Guard n'a pas pu v\u00e9rifier ce collage.",
  },
};

export type StringKey =
  | "categoryCard"
  | "categorySin"
  | "categorySsn"
  | "categoryPassport"
  | "categorySecret"
  | "categoryHealth"
  | "removeIt"
  | "sendAnyway"
  | "pasteAnyway"
  | "dropAnyway"
  | "badgeWatching"
  | "badgeOff"
  | "popupWatching"
  | "popupWatchingDetail"
  | "popupNotFoundPrefix"
  | "popupNotFoundSuffix"
  | "popupNotOnList"
  | "popupLoading"
  | "popupBlocked"
  | "popupBlockedDetail"
  | "popupCheckError";

// Picks EN or FR from navigator.language, falling back to EN whenever the FR
// value is still the un-translated placeholder so no user ever sees it.
export function pickString(key: StringKey, language: string): string {
  const entry = STRINGS[key];
  if (!entry) return "";
  const isFrench = language.toLowerCase().startsWith("fr");
  if (isFrench && entry.fr !== FR_PLACEHOLDER && entry.fr.length > 0) {
    return entry.fr;
  }
  return entry.en;
}

// 2026-09-09: the popup's corner control (theme toggle + language
// pill). These three words are NOT a translation done for this file and
// are NOT governed by the FR_PLACEHOLDER gate above -- they are
// already-cleared chrome strings, approved on the parent product's own
// theme/language picker, copied verbatim, not authored here. Kept out of
// STRINGS/StringKey so strings.test.ts's "every fr value is exactly
// FR_PLACEHOLDER" assertion (which is specifically about this popup's own
// untranslated content) keeps meaning what it says.
//
// Accented characters are written as \uXXXX escapes so this file's own
// bytes stay ASCII (tests/unit/ascii-only.test.ts) while the string value
// at runtime carries the real accent -- never write French without its
// accents, and never print non-ASCII are both satisfied by the same line.
export const CORNER_STRINGS = {
  theme: { en: "Theme", fr: "Th\u00e8me" },
  langEn: { en: "EN", fr: "EN" },
  langFr: { en: "Fran\u00e7ais", fr: "Fran\u00e7ais" },
} as const;

export type CornerStringKey = keyof typeof CORNER_STRINGS;

export function pickCorner(key: CornerStringKey, language: string): string {
  const entry = CORNER_STRINGS[key];
  return language.toLowerCase().startsWith("fr") ? entry.fr : entry.en;
}

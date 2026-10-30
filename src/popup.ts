// The popup text. Reads status for the active tab from the
// background worker (never re-reads the page itself -- no content, no
// extra permission needed).
//
// Render mapping (design render 2,
// "The popup -- live SVG mark, status first"):
//   - render's "Active" card  -> status.found === true, outcome.kind==="none"
//     (popupWatching + popupWatchingDetail)
//   - render's "No page" card -> status === null || siteId === null
//     (popupNotOnList)
//   - render's "Loading" card -> the initial paint before get-status
//     resolves (popupLoading, set directly in popup.html/here, not a new
//     state this file has to detect)
//   - render's "Flagged" card -> status.found === true, outcome.kind===
//     "blocked" (popupBlocked + popupBlockedDetail) -- added 2026-09-09
//   - render's "Error" card -> status.found === true, outcome.kind==="error"
//     (popupCheckError, no detail line) -- added 2026-09-09
// The render's "Disabled" card ("Paste Guard is off for this site.") is
// NOT used for the found === false / siteId-present case: that case keeps
// its existing copy, which names the site and the selector's capture date
// (README "Toolbar icon and popup") -- diagnostic detail a live-site walk
// would rely on to catch a stale selector after a vendor redesign. The
// render's shorter line has no room for that detail and doesn't address
// it, so this is not a like-for-like copy swap; left as a flagged
// question in the build report, not decided here.
import { pickString, pickCorner } from "./strings";
import type { GetStatusMessage, SiteStatus, GetLastOutcomeMessage, LastOutcome } from "./messages";
import {
  getThemePreference,
  setThemePreference,
  getLangPreference,
  setLangPreference,
  type ThemePreference,
} from "./storage";

const defaultLanguage = typeof navigator !== "undefined" ? navigator.language : "en";

export function render(
  status: SiteStatus | null,
  el: { textContent: string } | null,
  detailEl: { textContent: string } | null = null,
  language: string = defaultLanguage,
  outcome: LastOutcome | null = null
): void {
  if (!el) return;
  if (!status || status.siteId === null) {
    el.textContent = pickString("popupNotOnList", language);
    if (detailEl) detailEl.textContent = "";
    return;
  }
  if (status.found) {
    if (outcome && outcome.kind === "blocked") {
      el.textContent = pickString("popupBlocked", language);
      if (detailEl) detailEl.textContent = pickString("popupBlockedDetail", language);
      return;
    }
    if (outcome && outcome.kind === "error") {
      el.textContent = pickString("popupCheckError", language);
      if (detailEl) detailEl.textContent = "";
      return;
    }
    el.textContent = pickString("popupWatching", language);
    if (detailEl) detailEl.textContent = pickString("popupWatchingDetail", language);
    return;
  }
  const prefix = pickString("popupNotFoundPrefix", language);
  const suffix = pickString("popupNotFoundSuffix", language);
  el.textContent = `${prefix} ${status.displayName} ${suffix} ${status.captured}).`;
  if (detailEl) detailEl.textContent = "";
}

// The export is the authority where it and the guard picker differ
// (2026-09-09): the pill's VISIBLE text is the render's
// own two-letter "EN"/"FR", verbatim, at the render's own size. The
// accessible name stays the guard picker's full word (pickCorner) so a
// screen reader still hears the language name, not an abbreviation.
const LANG_PILL_TEXT = { en: "EN", fr: "FR" } as const;

// The corner control's own words and pressed-state, independent of
// the status/detail render above. Re-run on init and on every theme or
// language click so the control reflects its own current state immediately
// (no reload, matching the render's live SVG mark).
export function renderCorner(language: string, themeMode: "light" | "dark"): void {
  const themeBtn = document.getElementById("theme-toggle");
  const enBtn = document.getElementById("lang-en");
  const frBtn = document.getElementById("lang-fr");
  const isFrench = language.toLowerCase().startsWith("fr");

  if (themeBtn) {
    themeBtn.setAttribute("aria-label", pickCorner("theme", language));
    themeBtn.setAttribute("aria-pressed", String(themeMode === "dark"));
  }
  if (enBtn) {
    enBtn.textContent = LANG_PILL_TEXT.en;
    enBtn.setAttribute("aria-label", pickCorner("langEn", language));
    enBtn.setAttribute("aria-pressed", String(!isFrench));
  }
  if (frBtn) {
    frBtn.textContent = LANG_PILL_TEXT.fr;
    frBtn.setAttribute("aria-label", pickCorner("langFr", language));
    frBtn.setAttribute("aria-pressed", String(isFrench));
  }
}

// "system" (or no explicit choice yet) resolves against prefers-color-scheme
// at read time; matchMedia may be absent under a test harness, in which case
// light is the fallback (same fallback popup.html's own base :root uses).
export function effectiveThemeMode(pref: ThemePreference): "light" | "dark" {
  if (pref === "light" || pref === "dark") return pref;
  try {
    if (typeof window !== "undefined" && window.matchMedia) {
      return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    }
  } catch {
    // matchMedia unavailable; fall through to the default.
  }
  return "light";
}

// Only an explicit light/dark preference ever sets the override attribute;
// "system" removes it so the base :root / prefers-color-scheme rules in
// popup.html decide, exactly as they did before this control existed.
export function applyThemeAttribute(pref: ThemePreference): void {
  const root = typeof document !== "undefined" ? document.documentElement : null;
  if (!root) return;
  if (pref === "light" || pref === "dark") {
    root.setAttribute("data-force-theme", pref);
  } else {
    root.removeAttribute("data-force-theme");
  }
}

function requestLastOutcome(tabId: number, timeoutMs = 800): Promise<LastOutcome> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value: LastOutcome): void => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    // "a message timing out" is one of the two real failure paths the
    // Error card is wired to (the other, a detector throwing, is handled in
    // content.ts). A page whose content script cannot answer in time is
    // treated the same as a check failure -- never silently shown as "on".
    const timer = setTimeout(() => finish({ kind: "error", category: null }), timeoutMs);
    try {
      const message: GetLastOutcomeMessage = { type: "get-last-outcome" };
      chrome.tabs.sendMessage(tabId, message, (response: LastOutcome | undefined) => {
        clearTimeout(timer);
        if (chrome.runtime.lastError || !response) {
          finish({ kind: "error", category: null });
          return;
        }
        finish(response);
      });
    } catch {
      clearTimeout(timer);
      finish({ kind: "error", category: null });
    }
  });
}

async function main(): Promise<void> {
  const el = document.getElementById("status");
  const detailEl = document.getElementById("detail");

  const [themePref, langPref] = await Promise.all([getThemePreference(), getLangPreference()]);
  let currentLanguage = langPref ?? defaultLanguage;
  let currentThemeMode = effectiveThemeMode(themePref);
  applyThemeAttribute(themePref);

  let lastStatus: SiteStatus | null = null;
  let lastOutcome: LastOutcome | null = null;

  const rerender = (): void => {
    render(lastStatus, el, detailEl, currentLanguage, lastOutcome);
    renderCorner(currentLanguage, currentThemeMode);
  };

  renderCorner(currentLanguage, currentThemeMode);
  if (el) el.textContent = pickString("popupLoading", currentLanguage);

  document.getElementById("theme-toggle")?.addEventListener("click", () => {
    const next: ThemePreference = currentThemeMode === "dark" ? "light" : "dark";
    currentThemeMode = next;
    applyThemeAttribute(next);
    setThemePreference(next);
    renderCorner(currentLanguage, currentThemeMode);
  });
  document.getElementById("lang-en")?.addEventListener("click", () => {
    currentLanguage = "en";
    setLangPreference("en");
    rerender();
  });
  document.getElementById("lang-fr")?.addEventListener("click", () => {
    currentLanguage = "fr";
    setLangPreference("fr");
    rerender();
  });

  // Only tab.id is read below; Chrome returns id on every tabs.query result
  // regardless of permission (only url/title/favIconUrl are permission-
  // gated), and chrome.tabs.sendMessage needs no permission beyond the
  // content script already being registered via content_scripts.matches.
  // activeTab was declared but unused for this -- removed from manifest.json
  // (found during a security review).
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const tab = tabs[0];
  if (!tab || typeof tab.id !== "number") {
    lastStatus = null;
    rerender();
    return;
  }
  const tabId = tab.id;
  const message: GetStatusMessage = { type: "get-status", tabId };
  chrome.runtime.sendMessage(message, (status: SiteStatus | null) => {
    lastStatus = status ?? null;
    if (lastStatus && lastStatus.found) {
      requestLastOutcome(tabId).then((outcome) => {
        lastOutcome = outcome;
        rerender();
      });
      return;
    }
    rerender();
  });
}

if (typeof document !== "undefined" && typeof chrome !== "undefined") {
  main();
}

export { main as __mainForTests };

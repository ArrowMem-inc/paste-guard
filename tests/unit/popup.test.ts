// The popup's three states -- watching, not-found-with-reason, and
// not-on-the-list -- exercised against the REAL render() from src/popup.ts
// (exported for testing; popup.ts's own main() is guarded so importing
// this module has no side effect under vitest).
//
// FALSIFIED 2026-09-07: broke render() by changing `if (status.found)` to
// `if (!status.found)` -> the "shows Watching this composer when found"
// test failed expecting STRINGS.popupWatching.en but getting the
// not-found sentence instead, and "shows the not-found reason..." failed
// the other way. Restored the condition.
//
// 2026-09-09: popupWatching/popupNotOnList text now matches the approved render
// verbatim ("Paste Guard is on." / "Nothing to scan on this page."), and
// the found === true state also fills a second element (detailEl) with
// popupWatchingDetail, cleared for every other state.
//
// FALSIFIED 2026-09-09: broke render() by removing the `if (detailEl)
// detailEl.textContent = ""` line from the not-found branch -> "clears
// the detail line for every state but watching" failed, still showing
// the previous state's detail text. Restored the clear.
import { describe, expect, it, afterEach } from "vitest";
import { render, renderCorner, effectiveThemeMode, applyThemeAttribute } from "../../src/popup";
import { STRINGS, CORNER_STRINGS } from "../../src/strings";
import type { SiteStatus, LastOutcome } from "../../src/messages";

function fakeEl(): { textContent: string } {
  return { textContent: "" };
}

describe("popup render()", () => {
  it("shows 'not on the list' for a null status", () => {
    const el = fakeEl();
    render(null, el);
    expect(el.textContent).toBe(STRINGS.popupNotOnList!.en);
  });

  it("shows 'not on the list' when siteId is null even if a status object exists", () => {
    const el = fakeEl();
    const status: SiteStatus = { found: false, siteId: null, displayName: null, captured: null };
    render(status, el);
    expect(el.textContent).toBe(STRINGS.popupNotOnList!.en);
  });

  it("shows Watching this composer when found", () => {
    const el = fakeEl();
    const status: SiteStatus = {
      found: true,
      siteId: "chatgpt",
      displayName: "ChatGPT",
      captured: "2026-09-07",
    };
    render(status, el);
    expect(el.textContent).toBe(STRINGS.popupWatching!.en);
  });

  it("fills the detail line with popupWatchingDetail when found", () => {
    const el = fakeEl();
    const detailEl = fakeEl();
    const status: SiteStatus = {
      found: true,
      siteId: "chatgpt",
      displayName: "ChatGPT",
      captured: "2026-09-07",
    };
    render(status, el, detailEl);
    expect(detailEl.textContent).toBe(STRINGS.popupWatchingDetail!.en);
  });

  it("clears the detail line for every state but watching", () => {
    const detailEl = fakeEl();
    detailEl.textContent = "leftover from a previous render";
    render(null, fakeEl(), detailEl);
    expect(detailEl.textContent).toBe("");
  });

  it("shows the not-found reason with the site name and date", () => {
    const el = fakeEl();
    const status: SiteStatus = {
      found: false,
      siteId: "chatgpt",
      displayName: "ChatGPT",
      captured: "2026-09-07",
    };
    render(status, el);
    expect(el.textContent).toContain("ChatGPT");
    expect(el.textContent).toContain("2026-09-07");
    expect(el.textContent).toContain(STRINGS.popupNotFoundPrefix!.en);
  });

  it("does nothing when the element is missing", () => {
    expect(() => render(null, null)).not.toThrow();
  });
});

// 2026-09-09: the render's "Flagged" and "Error" cards, now wired to
// a live LastOutcome from the content script.
describe("popup render() with a live outcome", () => {
  const watching: SiteStatus = {
    found: true,
    siteId: "chatgpt",
    displayName: "ChatGPT",
    captured: "2026-09-07",
  };

  it("shows the blocked card verbatim when the outcome is blocked, regardless of category", () => {
    const el = fakeEl();
    const detailEl = fakeEl();
    const outcome: LastOutcome = { kind: "blocked", category: "secret" };
    render(watching, el, detailEl, "en", outcome);
    expect(el.textContent).toBe(STRINGS.popupBlocked!.en);
    expect(detailEl.textContent).toBe(STRINGS.popupBlockedDetail!.en);
  });

  it("shows the error card verbatim when the outcome is an error, with no detail line", () => {
    const el = fakeEl();
    const detailEl = fakeEl();
    detailEl.textContent = "leftover";
    const outcome: LastOutcome = { kind: "error", category: null };
    render(watching, el, detailEl, "en", outcome);
    expect(el.textContent).toBe(STRINGS.popupCheckError!.en);
    expect(detailEl.textContent).toBe("");
  });

  it("falls back to the normal watching card when the outcome is none", () => {
    const el = fakeEl();
    const detailEl = fakeEl();
    const outcome: LastOutcome = { kind: "none", category: null };
    render(watching, el, detailEl, "en", outcome);
    expect(el.textContent).toBe(STRINGS.popupWatching!.en);
  });

  it("falls back to the normal watching card when no outcome is supplied at all", () => {
    const el = fakeEl();
    render(watching, el);
    expect(el.textContent).toBe(STRINGS.popupWatching!.en);
  });

  it("FALSIFIED: an outcome is ignored for a site not being watched -- no bar-shaped state leaks into 'not found'", () => {
    const el = fakeEl();
    const notFound: SiteStatus = {
      found: false,
      siteId: "chatgpt",
      displayName: "ChatGPT",
      captured: "2026-09-07",
    };
    const outcome: LastOutcome = { kind: "blocked", category: "card" };
    render(notFound, el, undefined, "en", outcome);
    expect(el.textContent).not.toBe(STRINGS.popupBlocked!.en);
    expect(el.textContent).toContain(STRINGS.popupNotFoundPrefix!.en);
  });
});

describe("popup corner control", () => {
  function setUpCornerDom(): void {
    document.body.innerHTML = `
      <button id="theme-toggle" aria-pressed="false"></button>
      <button id="lang-en" aria-pressed="false"></button>
      <button id="lang-fr" aria-pressed="false"></button>
    `;
  }

  it("shows the export's own EN/FR pill text, with the picker's full word as the accessible name", () => {
    setUpCornerDom();
    renderCorner("en-US", "light");
    // Visible text: the render's own two-letter words, verbatim (the export
    // is the authority where it and the guard picker differ, 2026-09-09).
    expect(document.getElementById("lang-en")!.textContent).toBe("EN");
    expect(document.getElementById("lang-fr")!.textContent).toBe("FR");
    // Accessible name: still the guard picker's full word, so a screen
    // reader hears the language name, not an abbreviation.
    expect(document.getElementById("lang-en")!.getAttribute("aria-label")).toBe(CORNER_STRINGS.langEn.en);
    expect(document.getElementById("lang-fr")!.getAttribute("aria-label")).toBe(CORNER_STRINGS.langFr.en);
    expect(document.getElementById("theme-toggle")!.getAttribute("aria-label")).toBe(CORNER_STRINGS.theme.en);
  });

  it("keeps the pill's visible EN/FR text unchanged even when the active language is French", () => {
    setUpCornerDom();
    renderCorner("fr-CA", "light");
    expect(document.getElementById("lang-en")!.textContent).toBe("EN");
    expect(document.getElementById("lang-fr")!.textContent).toBe("FR");
    expect(document.getElementById("lang-fr")!.getAttribute("aria-label")).toBe(CORNER_STRINGS.langFr.fr);
  });

  it("marks EN pressed and FR unpressed for an english-active popup", () => {
    setUpCornerDom();
    renderCorner("en-US", "light");
    expect(document.getElementById("lang-en")!.getAttribute("aria-pressed")).toBe("true");
    expect(document.getElementById("lang-fr")!.getAttribute("aria-pressed")).toBe("false");
  });

  it("marks FR pressed and EN unpressed for a french-active popup, using the guard picker's fr word", () => {
    setUpCornerDom();
    renderCorner("fr-CA", "light");
    expect(document.getElementById("lang-fr")!.getAttribute("aria-pressed")).toBe("true");
    expect(document.getElementById("lang-en")!.getAttribute("aria-pressed")).toBe("false");
    expect(document.getElementById("theme-toggle")!.getAttribute("aria-label")).toBe(CORNER_STRINGS.theme.fr);
  });

  it("FALSIFIED: aria-pressed on the theme button reflects dark mode, true only when dark", () => {
    setUpCornerDom();
    renderCorner("en-US", "dark");
    expect(document.getElementById("theme-toggle")!.getAttribute("aria-pressed")).toBe("true");
    renderCorner("en-US", "light");
    expect(document.getElementById("theme-toggle")!.getAttribute("aria-pressed")).toBe("false");
  });

  it("does nothing (no throw) when the corner elements are missing from the DOM", () => {
    document.body.innerHTML = "";
    expect(() => renderCorner("en-US", "light")).not.toThrow();
  });
});

describe("popup theme preference resolution", () => {
  afterEach(() => {
    document.documentElement.removeAttribute("data-force-theme");
  });

  it("an explicit light/dark preference is its own effective mode", () => {
    expect(effectiveThemeMode("light")).toBe("light");
    expect(effectiveThemeMode("dark")).toBe("dark");
  });

  it("system with no matchMedia available falls back to light", () => {
    expect(effectiveThemeMode("system")).toBe("light");
  });

  it("applyThemeAttribute sets data-force-theme for an explicit choice", () => {
    applyThemeAttribute("dark");
    expect(document.documentElement.getAttribute("data-force-theme")).toBe("dark");
    applyThemeAttribute("light");
    expect(document.documentElement.getAttribute("data-force-theme")).toBe("light");
  });

  it("applyThemeAttribute removes the override for system (follow prefers-color-scheme)", () => {
    applyThemeAttribute("dark");
    applyThemeAttribute("system");
    expect(document.documentElement.hasAttribute("data-force-theme")).toBe(false);
  });
});

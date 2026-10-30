// Messages passed between content script and background service worker via
// chrome.runtime.sendMessage. This is NOT a network call: it never leaves
// the browser, never leaves the extension, and carries no message content
// -- only a site id, a display name and a capture date.
import type { Category } from "./detectors/types";

export interface SiteStatusMessage {
  type: "site-status";
  found: boolean;
  siteId: string | null;
  displayName: string | null;
  captured: string | null;
}

export interface GetStatusMessage {
  type: "get-status";
  tabId: number;
}

// 2026-09-09: the popup asks the ACTIVE TAB'S CONTENT SCRIPT directly
// (chrome.tabs.sendMessage), never the background worker -- the background
// worker holds nothing about this and must not. No payload: the content
// script already knows which tab it is (there is only ever one per page).
export interface GetLastOutcomeMessage {
  type: "get-last-outcome";
}

export type ExtensionMessage = SiteStatusMessage | GetStatusMessage | GetLastOutcomeMessage;

export interface SiteStatus {
  found: boolean;
  siteId: string | null;
  displayName: string | null;
  captured: string | null;
}

// The content script's answer to GetLastOutcomeMessage. `kind` is one
// of exactly three values; `category` is one of the six fixed detector
// category strings (src/detectors/types.ts) or null -- never the matched
// text, never an offset, never a timestamp. This is the ONLY state this
// feature (added 2026-09-09) carries, held in the content script's memory
// for the life of the page and nowhere else -- not chrome.storage, not the
// background worker, not a message field of its own.
export interface LastOutcome {
  kind: "blocked" | "error" | "none";
  category: Category | null;
}

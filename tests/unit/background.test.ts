// Badge state per tab, driven by messages from the content script.
// Never a green/watching badge without a found composer; a navigation
// start always clears the badge until the content script (if any) reports
// back fresh.
//
// FALSIFIED 2026-09-07: broke setBadge by swapping the `if (!status.found)`
// guard to `if (status.found)` (so a found composer set the red "OFF"
// badge and a missing one set the green "ON" badge) -> three tests failed:
// "sets the ON badge..." got {text:"OFF",color:"#c0392b"}, "sets the OFF
// badge..." got {text:"ON",color:"#2e7d32"}, and the navigation-clear test
// failed its first assertion expecting "ON" but got "OFF". Restored the
// guard.
import { describe, expect, it, vi, beforeEach } from "vitest";
import type { SiteStatusMessage, GetStatusMessage } from "../../src/messages";

interface FakeAction {
  badges: Map<number, { text: string; color?: string }>;
  setBadgeText: (opts: { tabId: number; text: string }) => void;
  setBadgeBackgroundColor: (opts: { tabId: number; color: string }) => void;
}

function fakeAction(): FakeAction {
  const badges = new Map<number, { text: string; color?: string }>();
  return {
    badges,
    setBadgeText: ({ tabId, text }) => {
      const existing = badges.get(tabId) ?? { text: "" };
      badges.set(tabId, { ...existing, text });
    },
    setBadgeBackgroundColor: ({ tabId, color }) => {
      const existing = badges.get(tabId) ?? { text: "" };
      badges.set(tabId, { ...existing, color });
    },
  };
}

type MessageListener = (
  message: SiteStatusMessage | GetStatusMessage,
  sender: { tab?: { id: number } },
  sendResponse: (response: unknown) => void
) => boolean | void;

type UpdatedListener = (tabId: number, changeInfo: { status?: string }) => void;
type RemovedListener = (tabId: number) => void;

let messageListeners: MessageListener[];
let updatedListeners: UpdatedListener[];
let removedListeners: RemovedListener[];
let action: FakeAction;

beforeEach(() => {
  vi.resetModules();
  messageListeners = [];
  updatedListeners = [];
  removedListeners = [];
  action = fakeAction();
  vi.stubGlobal("chrome", {
    action,
    runtime: {
      onMessage: {
        addListener: (fn: MessageListener) => messageListeners.push(fn),
      },
    },
    tabs: {
      onUpdated: { addListener: (fn: UpdatedListener) => updatedListeners.push(fn) },
      onRemoved: { addListener: (fn: RemovedListener) => removedListeners.push(fn) },
    },
  });
  vi.stubGlobal("navigator", { language: "en-US" });
});

async function loadBackground() {
  return import("../../src/background");
}

describe("background badge state", () => {
  it("sets the ON badge and green color when a composer is found", async () => {
    await loadBackground();
    const msg: SiteStatusMessage = {
      type: "site-status",
      found: true,
      siteId: "chatgpt",
      displayName: "ChatGPT",
      captured: "2026-09-07",
    };
    messageListeners[0]!(msg, { tab: { id: 7 } }, () => {});
    expect(action.badges.get(7)).toEqual({ text: "ON", color: "#2e7d32" });
  });

  it("sets the OFF badge and red color when the composer is not found", async () => {
    await loadBackground();
    const msg: SiteStatusMessage = {
      type: "site-status",
      found: false,
      siteId: "chatgpt",
      displayName: "ChatGPT",
      captured: "2026-09-07",
    };
    messageListeners[0]!(msg, { tab: { id: 7 } }, () => {});
    expect(action.badges.get(7)).toEqual({ text: "OFF", color: "#c0392b" });
  });

  it("clears the badge (no watching state) when the site id is null", async () => {
    await loadBackground();
    const msg: SiteStatusMessage = {
      type: "site-status",
      found: false,
      siteId: null,
      displayName: null,
      captured: null,
    };
    messageListeners[0]!(msg, { tab: { id: 7 } }, () => {});
    expect(action.badges.get(7)?.text).toBe("");
  });

  it("clears the badge on navigation start, before the content script re-reports", async () => {
    await loadBackground();
    messageListeners[0]!(
      { type: "site-status", found: true, siteId: "chatgpt", displayName: "ChatGPT", captured: "2026-09-07" },
      { tab: { id: 7 } },
      () => {}
    );
    expect(action.badges.get(7)?.text).toBe("ON");

    // Navigating away starts loading a new page -- clear immediately so a
    // stale "watching" badge never survives.
    updatedListeners[0]!(7, { status: "loading" });
    expect(action.badges.get(7)?.text).toBe("");
  });

  it("answers get-status with the last known status for that tab", async () => {
    await loadBackground();
    const msg: SiteStatusMessage = {
      type: "site-status",
      found: true,
      siteId: "chatgpt",
      displayName: "ChatGPT",
      captured: "2026-09-07",
    };
    messageListeners[0]!(msg, { tab: { id: 7 } }, () => {});

    let response: unknown;
    const getStatus: GetStatusMessage = { type: "get-status", tabId: 7 };
    messageListeners[0]!(getStatus, { tab: undefined }, (r) => {
      response = r;
    });
    expect(response).toEqual({
      found: true,
      siteId: "chatgpt",
      displayName: "ChatGPT",
      captured: "2026-09-07",
    });
  });

  it("answers get-status with null for a tab it never heard from", async () => {
    await loadBackground();
    let response: unknown = "not-called";
    messageListeners[0]!({ type: "get-status", tabId: 999 }, { tab: undefined }, (r) => {
      response = r;
    });
    expect(response).toBeNull();
  });

  it("forgets a tab's status when the tab closes", async () => {
    const { __statusByTabForTests } = await loadBackground();
    messageListeners[0]!(
      { type: "site-status", found: true, siteId: "chatgpt", displayName: "ChatGPT", captured: "2026-09-07" },
      { tab: { id: 7 } },
      () => {}
    );
    expect(__statusByTabForTests.has(7)).toBe(true);
    removedListeners[0]!(7);
    expect(__statusByTabForTests.has(7)).toBe(false);
  });
});

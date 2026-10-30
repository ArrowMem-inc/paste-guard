// Badge state per tab. No content ever passes through here, only
// {found, siteId, displayName, captured} from src/messages.ts. No console
// output. Uses only chrome.storage / chrome.action / chrome.tabs /
// chrome.runtime -- chrome.runtime.sendMessage to our OWN worker is not a
// network call (see README, "Not a network call").
import type { ExtensionMessage, SiteStatus } from "./messages";
import { pickString } from "./strings";

const statusByTab = new Map<number, SiteStatus>();

function setBadge(tabId: number, status: SiteStatus): void {
  const language =
    typeof globalThis !== "undefined" &&
    "navigator" in globalThis &&
    (globalThis as { navigator?: { language?: string } }).navigator?.language
      ? (globalThis as unknown as { navigator: { language: string } }).navigator.language
      : "en";

  if (!status.found) {
    chrome.action.setBadgeText({ tabId, text: pickString("badgeOff", language) });
    chrome.action.setBadgeBackgroundColor({ tabId, color: "#c0392b" });
    return;
  }
  chrome.action.setBadgeText({ tabId, text: pickString("badgeWatching", language) });
  chrome.action.setBadgeBackgroundColor({ tabId, color: "#2e7d32" });
}

function clearBadge(tabId: number): void {
  chrome.action.setBadgeText({ tabId, text: "" });
}

chrome.runtime.onMessage.addListener((message: ExtensionMessage, sender, sendResponse) => {
  if (message.type === "site-status") {
    const tabId = sender.tab?.id;
    if (typeof tabId !== "number") return;
    const status: SiteStatus = {
      found: message.found,
      siteId: message.siteId,
      displayName: message.displayName,
      captured: message.captured,
    };
    statusByTab.set(tabId, status);
    if (status.siteId === null) {
      clearBadge(tabId);
    } else {
      setBadge(tabId, status);
    }
    return;
  }
  if (message.type === "get-status") {
    const status = statusByTab.get(message.tabId) ?? null;
    sendResponse(status);
    return true;
  }
  return undefined;
});

// A navigation starting is the only signal available without the "tabs"
// permission (changeInfo.status is not permission-gated; changeInfo.url
// is). Clear the badge on every navigation start so a stale "watching"
// badge never survives a jump to a page the content script cannot see
// ("never a green icon over a page it cannot see"). The content
// script re-reports fresh state once (if) it loads on the new page.
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === "loading") {
    statusByTab.delete(tabId);
    clearBadge(tabId);
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  statusByTab.delete(tabId);
});

export { statusByTab as __statusByTabForTests };

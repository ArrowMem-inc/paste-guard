// The content script. Wires paste and drop interception on the composer
// matched by this site's selector table (src/sites.ts); send interception
// (Enter / mod+Enter, and a click on the send button) is registered on
// `document` instead, once per page -- see the LISTENER DEPTH note above
// onDocumentKeydown below. No console output, no content ever written to
// chrome.storage.local (only site id + expiry timestamp for the snooze, in
// src/storage.ts).
//
// The six sites are single-page apps that replace the composer element on
// navigation (new chat, switch conversation). The MutationObserver below
// therefore stays connected for the life of the page: when the wired
// composer leaves the document the status goes to "not found" (badge
// OFF) until a new composer is found and wired. A guard that wired once and
// stopped looking would show a green badge over an unwatched field -- the
// fail-open class this bar exists to prevent.
import { findSite, findComposer, findSendButton, type SiteConfig } from "./sites";
import { detectCategories } from "./detectors/index";
import type { Category } from "./detectors/types";
import { createBar, insertBar, removeBar, findExistingBar, BAR_ATTR, type BarMode } from "./ui";
import { getSnoozeUntil, startSnooze, isHealthDetectorEnabled } from "./storage";
import type { SiteStatusMessage, ExtensionMessage, LastOutcome } from "./messages";

const language = typeof navigator !== "undefined" ? navigator.language : "en";

// Synchronous local cache of async storage state. paste/drop/keydown
// handlers must call preventDefault() synchronously within the same event
// dispatch, so the snooze expiry and the health-detector flag are read from
// this cache (loaded at init, kept current via chrome.storage.onChanged),
// never fetched fresh mid-handler.
let snoozeUntilCache = 0;
let healthEnabledCache = false;
let bypassSend = false;

// 2026-09-09: the last outcome for THIS PAGE, in memory only. Never
// written to chrome.storage, never sent unasked, never anything but this
// module-level variable -- it dies the moment this page (and this content
// script instance) does, on navigation or reload. `category` is one of the
// six fixed detector categories or null; the matched text itself never
// touches this variable or anything reachable from it.
let lastOutcome: LastOutcome = { kind: "none", category: null };

function sendStatus(site: SiteConfig | null, found: boolean): void {
  const message: SiteStatusMessage = {
    type: "site-status",
    found,
    siteId: site ? site.id : null,
    displayName: site ? site.displayName : null,
    captured: site ? site.captured : null,
  };
  try {
    chrome.runtime.sendMessage(message);
  } catch {
    // Extension context can be invalidated mid-navigation; nothing to do.
  }
}

// The ONLY read of page content. `.value` for a textarea,
// `.textContent` for a contenteditable, of the one matched element.
function getComposerText(composer: Element): string {
  if (composer instanceof HTMLTextAreaElement) {
    return composer.value;
  }
  return composer.textContent ?? "";
}

function clearComposer(composer: Element): void {
  if (composer instanceof HTMLTextAreaElement) {
    composer.value = "";
    composer.dispatchEvent(new Event("input", { bubbles: true }));
    return;
  }
  composer.textContent = "";
  composer.dispatchEvent(new Event("input", { bubbles: true }));
}

function insertTextAtCaret(composer: Element, text: string): void {
  if (composer instanceof HTMLTextAreaElement) {
    const start = composer.selectionStart ?? composer.value.length;
    const end = composer.selectionEnd ?? composer.value.length;
    const before = composer.value.slice(0, start);
    const after = composer.value.slice(end);
    composer.value = before + text + after;
    const caret = start + text.length;
    composer.selectionStart = caret;
    composer.selectionEnd = caret;
    composer.dispatchEvent(new Event("input", { bubbles: true }));
    return;
  }
  (composer as HTMLElement).focus();
  const inserted = document.execCommand && document.execCommand("insertText", false, text);
  if (!inserted) {
    composer.textContent = (composer.textContent ?? "") + text;
  }
  composer.dispatchEvent(new Event("input", { bubbles: true }));
}

function categoryForMode(text: string): Category | null {
  const hits = detectCategories(text, { includeHealth: healthEnabledCache });
  return hits.length > 0 ? hits[0]! : null;
}

// The ONLY place lastOutcome is set to "blocked" or "error". A
// detector throwing is the real failure path the popup's Error card is
// wired to (the other is a message timeout, handled in popup.ts) -- caught
// here so one bad detector cannot break paste/drop/send handling for every
// other category. On a throw the event is NOT intercepted (there is no
// category to show in a bar, and no safe generic "something went wrong"
// bar exists in ui.ts) -- the popup still surfaces the failure on next open.
function detectAndTrack(text: string): Category | null {
  try {
    const category = categoryForMode(text);
    if (category) {
      lastOutcome = { kind: "blocked", category };
    }
    return category;
  } catch {
    lastOutcome = { kind: "error", category: null };
    return null;
  }
}

function currentlySnoozed(): boolean {
  return Date.now() < snoozeUntilCache;
}

function showBar(
  composer: Element,
  category: Category,
  mode: BarMode,
  onRemove: () => void,
  onProceed: () => void
): void {
  const existing = findExistingBar(document);
  if (existing) removeBar(existing);
  const bar = createBar(category, mode, language, {
    onRemove: () => {
      removeBar(bar);
      onRemove();
    },
    onProceed: () => {
      removeBar(bar);
      onProceed();
    },
  });
  insertBar(composer, bar);
}

function handleSendHit(site: SiteConfig, composer: Element, category: Category): void {
  showBar(
    composer,
    category,
    "send",
    () => {
      clearComposer(composer);
      (composer as HTMLElement).focus();
    },
    () => {
      // "Send anyway" is the only path that starts the one-hour snooze.
      const until = Date.now() + 60 * 60 * 1000;
      snoozeUntilCache = until;
      startSnooze(site.id).then(() => {
        // storage.onChanged re-syncs the cache with the stored value.
      });
      lastOutcome = { kind: "none", category: null };
      proceedSend(site, composer);
    }
  );
}

// Shared tail for both send paths (Enter/mod+Enter keydown and a click on
// the send button): detect on the composer's current text and, if it
// matches a category, block this event and show the send bar. The caller
// has already decided this event is a real send attempt (right key, right
// button); this only does the detect-and-block part they share.
function attemptBlockSend(event: Event, site: SiteConfig, composer: Element): void {
  if (currentlySnoozed()) return;
  const text = getComposerText(composer);
  const category = detectAndTrack(text);
  if (!category) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  handleSendHit(site, composer, category);
}

function proceedSend(site: SiteConfig, composer: Element): void {
  const sendButton = findSendButton(site, document, composer);
  bypassSend = true;
  if (sendButton) {
    (sendButton as HTMLElement).click();
    return;
  }
  // No send button matched: dispatch a synthetic Enter on the composer.
  // bypassSend makes our own capture-phase keydown listener pass it
  // straight through instead of intercepting it again.
  const enterEvent = new KeyboardEvent("keydown", {
    key: "Enter",
    code: "Enter",
    bubbles: true,
    cancelable: true,
  });
  composer.dispatchEvent(enterEvent);
}

// Attaches the composer-level listeners (paste, drop) to one composer
// element. Called again for each replacement composer; listeners on a
// detached element die with it. Send interception (keydown, click) lives at
// document level instead -- see onDocumentKeydown / onDocumentClick in
// init() -- because it has to run before the host page's own handling of
// the same event, and a listener on the composer itself is too deep in the
// capture chain for that. Paste and drop are safe at this depth: both read
// their payload directly off the event (clipboardData / dataTransfer), so
// neither depends on the composer's DOM state still matching what the user
// typed or dropped, unlike send, which reads the composer's live text.
function wireComposer(composer: Element): void {
  // --- Paste ---
  composer.addEventListener(
    "paste",
    (event: Event) => {
      const clipboardEvent = event as ClipboardEvent;
      if (currentlySnoozed()) return;
      const text = clipboardEvent.clipboardData?.getData("text/plain") ?? "";
      if (!text) return;
      const category = detectAndTrack(text);
      if (!category) return;
      clipboardEvent.preventDefault();
      clipboardEvent.stopImmediatePropagation();
      showBar(
        composer,
        category,
        "paste",
        () => {
          // Remove it: insertion already cancelled by preventDefault.
        },
        () => {
          lastOutcome = { kind: "none", category: null };
          insertTextAtCaret(composer, text);
        }
      );
    },
    true
  );

  // --- Drop ---
  composer.addEventListener(
    "drop",
    (event: Event) => {
      const dragEvent = event as DragEvent;
      if (currentlySnoozed()) return;
      // Text only, never files (drop spec).
      const text = dragEvent.dataTransfer?.getData("text/plain") ?? "";
      if (!text) return;
      const category = detectAndTrack(text);
      if (!category) return;
      dragEvent.preventDefault();
      dragEvent.stopImmediatePropagation();
      showBar(
        composer,
        category,
        "drop",
        () => {
          // Remove it: insertion already cancelled by preventDefault.
        },
        () => {
          lastOutcome = { kind: "none", category: null };
          insertTextAtCaret(composer, text);
        }
      );
    },
    true
  );
}

// `overrides` exists only so tests/unit/content.test.ts can point init() at
// a chatgpt.com/claude.ai/etc URL without touching the real `location`
// global. Production always calls init() with no arguments.
// Returns a teardown (disconnect the observer, drop the document click
// listener) that only tests call; a real page keeps both for its lifetime.
function init(overrides?: { hostname: string; pathname: string }): () => void {
  const hostname = overrides?.hostname ?? location.hostname;
  const pathname = overrides?.pathname ?? location.pathname;
  const site = findSite(hostname, pathname);
  if (!site) {
    sendStatus(null, false);
    return () => {};
  }

  // The composer currently wired, or null while none is found (badge OFF).
  let wiredComposer: Element | null = null;

  getSnoozeUntil(site.id).then((until) => {
    snoozeUntilCache = until;
  });
  isHealthDetectorEnabled().then((enabled) => {
    healthEnabledCache = enabled;
  });

  try {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== "local") return;
      if (changes[`snooze:${site.id}`]) {
        const val = changes[`snooze:${site.id}`]!.newValue;
        snoozeUntilCache = typeof val === "number" ? val : 0;
      }
      if (changes["option:healthDetectorEnabled"]) {
        healthEnabledCache = changes["option:healthDetectorEnabled"]!.newValue === true;
      }
    });
  } catch {
    // storage.onChanged unavailable in some test harnesses; the cache keeps
    // the values loaded above.
  }

  // Answers the popup's live "what happened on this page" question.
  // Reached only via chrome.tabs.sendMessage(tabId, ...) from the popup --
  // never from the background worker, which never asks and is never told.
  // Synchronous response (no `return true`): lastOutcome is already in
  // memory, there is nothing to await.
  try {
    chrome.runtime.onMessage.addListener((message: ExtensionMessage, _sender, sendResponse) => {
      if (message.type === "get-last-outcome") {
        sendResponse(lastOutcome);
      }
      return undefined;
    });
  } catch {
    // chrome.runtime.onMessage unavailable in some test harnesses.
  }

  // --- Send: click on the send button. Registered ONCE on the
  // document; it always reads the composer wired right now. ---
  const onDocumentClick = (event: Event): void => {
      const composer = wiredComposer;
      if (!composer) return;
      const target = event.target as Element | null;
      if (!target) return;
      const sendButton = findSendButton(site, document, composer);
      if (!sendButton) return;
      if (!sendButton.contains(target)) return;
      if (bypassSend) {
        bypassSend = false;
        return;
      }
      attemptBlockSend(event, site, composer);
  };
  document.addEventListener("click", onDocumentClick, true);

  // --- Send: Enter / Cmd|Ctrl+Enter. Registered on `document`, not the
  // composer -- LISTENER DEPTH. Capture runs window-down-to-target, so a
  // capture listener on an ANCESTOR of the composer fires before one
  // attached to the composer itself. Measured live on claude.ai
  // (2026-09-21): a listener on the composer with capture:true fired AFTER
  // the host page's own Enter handling had already read the composer,
  // cleared it and sent the message -- our handler saw an empty string and
  // the send went through anyway. The identical listener on `document`
  // fired FIRST, saw the real typed text, and its
  // preventDefault()/stopImmediatePropagation() actually stopped the send,
  // because `document` sits above every ancestor the host page could have
  // wired a handler on.
  //
  // Gated on the wired composer existing, deliberately NOT on
  // event.target being inside it: at document-capture time on the page
  // that showed the bug, the target was measured NOT inside the composer
  // (the click handler above can trust `sendButton.contains(target)`
  // because a real click's target genuinely is the button; a keydown's
  // target here is not reliable in the same way). Copying the click
  // handler's containment check here would silently reintroduce the bug.
  const onDocumentKeydown = (event: Event): void => {
    const composer = wiredComposer;
    if (!composer) return;
    const keyEvent = event as KeyboardEvent;
    // F5: keys pressed inside the bar (Enter on a bar button, Escape) belong
    // to the bar, never to the send path.
    const keyTarget = event.target as Element | null;
    if (
      keyTarget &&
      typeof keyTarget.closest === "function" &&
      keyTarget.closest(`[${BAR_ATTR}="true"]`)
    ) {
      return;
    }
    // F7: an Enter that confirms an IME composition is not a send.
    if (keyEvent.isComposing || keyEvent.keyCode === 229) return;
    if (bypassSend) {
      bypassSend = false;
      return;
    }
    const isBareEnter = keyEvent.key === "Enter" && !keyEvent.shiftKey;
    const isModEnter = keyEvent.key === "Enter" && (keyEvent.metaKey || keyEvent.ctrlKey);
    if (!isBareEnter && !isModEnter) return;
    attemptBlockSend(keyEvent, site, composer);
  };
  document.addEventListener("keydown", onDocumentKeydown, true);

  function attempt(): void {
    if (wiredComposer) {
      if (document.contains(wiredComposer)) return;
      // The site replaced or removed the composer: stop claiming to watch.
      wiredComposer = null;
      reportedNotFound = false;
    }
    const composer = findComposer(site!, document);
    if (!composer) {
      if (!reportedNotFound) {
        reportedNotFound = true;
        sendStatus(site, false);
      }
      return;
    }
    reportedNotFound = false;
    wiredComposer = composer;
    sendStatus(site, true);
    wireComposer(composer);
  }

  // Collapses the "not found" report so a busy page does not send one
  // message per DOM mutation while the composer is absent.
  let reportedNotFound = false;

  const observer = new MutationObserver(() => attempt());
  attempt();
  observer.observe(document.documentElement, { childList: true, subtree: true });

  return () => {
    observer.disconnect();
    document.removeEventListener("click", onDocumentClick, true);
    document.removeEventListener("keydown", onDocumentKeydown, true);
  };
}

// Guard so this file can be imported by tests without requiring a live
// `document`/`chrome` global unless the caller wants side effects.
if (typeof document !== "undefined" && typeof chrome !== "undefined") {
  init();
}

// __lastOutcomeForTests is a live ES module binding: reading it after an
// event handler runs reflects the current value of `lastOutcome`, not a
// snapshot taken at import time.
export {
  getComposerText,
  clearComposer,
  insertTextAtCaret,
  categoryForMode,
  init as __initForTests,
  lastOutcome as __lastOutcomeForTests,
};

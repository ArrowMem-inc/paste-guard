// ONE table, selectors dated. An unknown site gets nothing injected.
//
// Vendor names appear here and ONLY here plus the README's <!-- site-list
// --> section. Selector capture method is stated honestly: these are
// hand-written stand-ins as of the capture date
// below, not a live DOM capture (no vendor network request was made to
// build them). Whether they still match production markup is NOT verified in
// this build; the walk in tests/e2e runs against fixtures, never a vendor site.
export interface SiteConfig {
  id: string;
  vendor: string;
  displayName: string;
  // Hostnames this site's content script runs on.
  hostnames: string[];
  // Optional path prefix restricting the match further (x.com hosts many
  // things besides the Grok composer).
  pathPrefix?: string;
  // Ordered list, first match wins ("a small ordered list per site so
  // a live-site mismatch is one table edit").
  composerSelectors: string[];
  sendButtonSelectors: string[];
  captured: string;
  captureMethod: string;
}

const CAPTURE_METHOD = "hand-written stand-in, not a live capture";
const CAPTURED = "2026-09-07";

export const SITES: SiteConfig[] = [
  {
    id: "chatgpt",
    vendor: "OpenAI",
    displayName: "ChatGPT",
    hostnames: ["chatgpt.com", "chat.openai.com"],
    composerSelectors: ["#prompt-textarea"],
    sendButtonSelectors: [
      '[data-testid="send-button"]',
      'button[aria-label="Send prompt"]',
    ],
    captured: CAPTURED,
    captureMethod: CAPTURE_METHOD,
  },
  {
    id: "claude",
    vendor: "Anthropic",
    displayName: "Claude",
    hostnames: ["claude.ai"],
    composerSelectors: [
      'div[contenteditable="true"].ProseMirror',
      '[data-testid="chat-input"]',
    ],
    sendButtonSelectors: [
      '[aria-label="Send message"]',
      'button[data-testid="send-button"]',
    ],
    captured: CAPTURED,
    captureMethod: CAPTURE_METHOD,
  },
  {
    id: "gemini",
    vendor: "Google",
    displayName: "Gemini",
    hostnames: ["gemini.google.com"],
    composerSelectors: ['rich-textarea .ql-editor[contenteditable="true"]'],
    sendButtonSelectors: ['button[aria-label="Send message"]'],
    captured: CAPTURED,
    captureMethod: CAPTURE_METHOD,
  },
  {
    id: "grok",
    vendor: "xAI",
    displayName: "Grok",
    hostnames: ["grok.com"],
    composerSelectors: ['[data-testid="grok-query-bar"] textarea', "form textarea"],
    sendButtonSelectors: ['button[aria-label="Submit"]', 'button[type="submit"]'],
    captured: CAPTURED,
    captureMethod: CAPTURE_METHOD,
  },
  {
    id: "x-grok",
    vendor: "xAI",
    displayName: "Grok on X",
    hostnames: ["x.com"],
    pathPrefix: "/i/grok",
    composerSelectors: ['[data-testid="grok-composer"] textarea', "form textarea"],
    sendButtonSelectors: ['[data-testid="grokSendButton"]', 'button[type="submit"]'],
    captured: CAPTURED,
    captureMethod: CAPTURE_METHOD,
  },
];

// Finds the SITES entry (if any) for a hostname + pathname pair. Used by the
// content script and the background worker -- never by anything that
// reads more than the URL that's already visible to a content script.
export function findSite(hostname: string, pathname: string): SiteConfig | null {
  for (const site of SITES) {
    if (!site.hostnames.includes(hostname)) continue;
    if (site.pathPrefix && !pathname.startsWith(site.pathPrefix)) continue;
    return site;
  }
  return null;
}

// Finds the first element in `root` matching one of the site's ordered
// composer selectors. Returns null if none match ("fails loud").
//
// 2026-09-12: when none of a site's own selectors match, a generic
// fallback runs before giving up -- manual testing on real, signed-in
// pages found chatgpt.com and grok.com both badge OFF, pages this
// automated harness cannot reach (Cloudflare blocks headless there),
// meaning the dated selectors in
// this table no longer match production markup. The site's own selectors
// still win whenever they match; the fallback only fires on a total miss,
// and "not found" still means nothing at all was found.
export function findComposer(site: SiteConfig, root: ParentNode): Element | null {
  for (const selector of site.composerSelectors) {
    const el = root.querySelector(selector);
    if (el) return el;
  }
  return findComposerFallback(root);
}

const SEND_LOOKING_PATTERN = /send|submit/i;

function isVisible(el: Element): boolean {
  if (el.getAttribute("aria-hidden") === "true") return false;
  if (el.closest('[data-paste-guard-bar="true"]')) return false;
  if (!(el instanceof HTMLElement)) return true;
  const rect = el.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

function looksLikeSendButton(el: Element): boolean {
  const ariaLabel = el.getAttribute("aria-label") ?? "";
  const testId = el.getAttribute("data-testid") ?? "";
  const type = el.getAttribute("type") ?? "";
  return (
    SEND_LOOKING_PATTERN.test(ariaLabel) ||
    SEND_LOOKING_PATTERN.test(testId) ||
    SEND_LOOKING_PATTERN.test(type)
  );
}

function elementArea(el: Element): number {
  const rect = el.getBoundingClientRect();
  return rect.width * rect.height;
}

function distance(a: DOMRect, b: DOMRect): number {
  const ax = a.left + a.width / 2;
  const ay = a.top + a.height / 2;
  const bx = b.left + b.width / 2;
  const by = b.top + b.height / 2;
  return Math.hypot(ax - bx, ay - by);
}

// Generic, site-agnostic composer guess: a visible textarea or
// contenteditable, preferring the one geometrically nearest a send-looking
// button, else the largest visible candidate. Runs only after the site's
// own ordered selectors have all missed.
export function findComposerFallback(root: ParentNode): Element | null {
  const candidates = Array.from(
    root.querySelectorAll('textarea, [contenteditable="true"]')
  ).filter(isVisible);
  if (candidates.length === 0) return null;

  const sendButtons = Array.from(root.querySelectorAll('button, [role="button"]')).filter(
    (el) => isVisible(el) && looksLikeSendButton(el)
  );

  if (sendButtons.length > 0) {
    let best: Element | null = null;
    let bestDistance = Infinity;
    for (const candidate of candidates) {
      const candidateRect = candidate.getBoundingClientRect();
      for (const button of sendButtons) {
        const d = distance(candidateRect, button.getBoundingClientRect());
        if (d < bestDistance) {
          bestDistance = d;
          best = candidate;
        }
      }
    }
    if (best) return best;
  }

  let largest: Element | null = null;
  let largestArea = -1;
  for (const candidate of candidates) {
    const area = elementArea(candidate);
    if (area > largestArea) {
      largestArea = area;
      largest = candidate;
    }
  }
  return largest;
}

// F4: when none of the site's own selectors match, fall back
// to the same send-looking test the composer fallback uses, so a renamed
// button does not silently turn click-to-send interception off. Among the
// matches the one nearest the composer wins when a composer is given.
export function findSendButton(
  site: SiteConfig,
  root: ParentNode,
  composer?: Element | null
): Element | null {
  for (const selector of site.sendButtonSelectors) {
    const el = root.querySelector(selector);
    if (el) return el;
  }
  const found = Array.from(root.querySelectorAll('button, [role="button"]')).filter(
    (el) => isVisible(el) && looksLikeSendButton(el)
  );
  if (found.length === 0) return null;
  if (!composer || found.length === 1) return found[0]!;
  const c = composer.getBoundingClientRect();
  let best = found[0]!;
  let bestD = Infinity;
  for (const el of found) {
    const d = distance(c, el.getBoundingClientRect());
    if (d < bestD) {
      bestD = d;
      best = el;
    }
  }
  return best;
}

// 2026-09-12: manual testing found chatgpt.com and grok.com badge OFF
// on real, signed-in pages ("the composer was not found") this harness
// cannot reach (Cloudflare blocks headless there, and they are signed-in
// pages). The dated selectors in src/sites.ts's SITES table no longer
// match production markup on those two sites. findComposerFallback is the
// generic, site-agnostic guess that runs only after a site's own ordered
// selectors have all missed; jsdom's real DOM lets this be exercised
// directly without those two real sites.
import { describe, expect, it } from "vitest";
import { findComposer, findComposerFallback, type SiteConfig } from "../../src/sites";

function setRect(
  el: Element,
  rect: { top: number; left: number; width: number; height: number }
): void {
  (el as HTMLElement).getBoundingClientRect = () =>
    ({
      top: rect.top,
      left: rect.left,
      width: rect.width,
      height: rect.height,
      right: rect.left + rect.width,
      bottom: rect.top + rect.height,
      x: rect.left,
      y: rect.top,
      toJSON: () => "",
    }) as DOMRect;
}

const STUB_SITE: SiteConfig = {
  id: "stub",
  vendor: "Stub",
  displayName: "Stub",
  hostnames: ["stub.example"],
  composerSelectors: ["#does-not-exist"],
  sendButtonSelectors: [],
  captured: "2026-09-12",
  captureMethod: "test stub",
};

describe("findComposerFallback", () => {
  it("returns null when nothing at all is found", () => {
    document.body.innerHTML = "<div></div>";
    expect(findComposerFallback(document)).toBeNull();
  });

  it("does not choose a hidden textarea", () => {
    document.body.innerHTML = '<textarea id="hidden"></textarea>';
    const hidden = document.getElementById("hidden")!;
    setRect(hidden, { top: 0, left: 0, width: 0, height: 0 });
    expect(findComposerFallback(document)).toBeNull();
  });

  it("prefers a contenteditable near a send-looking button", () => {
    document.body.innerHTML =
      '<div id="far" contenteditable="true"></div>' +
      '<div id="near" contenteditable="true"></div>' +
      '<button id="btn" aria-label="Send message">Go</button>';
    const far = document.getElementById("far")!;
    const near = document.getElementById("near")!;
    const btn = document.getElementById("btn")!;
    setRect(far, { top: 0, left: 0, width: 100, height: 40 });
    setRect(near, { top: 500, left: 500, width: 100, height: 40 });
    setRect(btn, { top: 510, left: 610, width: 30, height: 20 });

    expect(findComposerFallback(document)).toBe(near);
  });

  it("falls back to the largest visible candidate when no send button matches", () => {
    document.body.innerHTML =
      '<textarea id="small"></textarea>' + '<textarea id="big"></textarea>';
    const small = document.getElementById("small")!;
    const big = document.getElementById("big")!;
    setRect(small, { top: 0, left: 0, width: 50, height: 20 });
    setRect(big, { top: 100, left: 0, width: 400, height: 200 });

    expect(findComposerFallback(document)).toBe(big);
  });

  it("findComposer uses the fallback only after the site's own selectors miss", () => {
    document.body.innerHTML = '<textarea id="composer"></textarea>';
    const composer = document.getElementById("composer")!;
    setRect(composer, { top: 0, left: 0, width: 300, height: 100 });

    expect(findComposer(STUB_SITE, document)).toBe(composer);
  });

  it("findComposer still prefers the site's own selector when it matches", () => {
    document.body.innerHTML =
      '<textarea id="fallback-candidate"></textarea>' + '<textarea id="does-not-exist"></textarea>';
    const own = document.getElementById("does-not-exist")!;
    const other = document.getElementById("fallback-candidate")!;
    setRect(own, { top: 0, left: 0, width: 100, height: 40 });
    setRect(other, { top: 0, left: 0, width: 900, height: 900 });

    expect(findComposer(STUB_SITE, document)).toBe(own);
  });
});

// One selector table, dated. An unknown site gets nothing injected.
// findComposer reads only the element the selector matches.
//
// FALSIFIED 2026-09-07: broke findSite by removing the pathPrefix check
// (so any x.com page matched the Grok site) -> test "does not match x.com
// outside the grok path" failed with "expected not null". Restored the
// pathPrefix guard.
import { describe, expect, it } from "vitest";
import { SITES, findSite, findComposer, findSendButton } from "../../src/sites";

describe("SITES table", () => {
  it("lists all six required sites", () => {
    const hostnames = SITES.flatMap((s) => s.hostnames);
    for (const host of [
      "chatgpt.com",
      "chat.openai.com",
      "claude.ai",
      "grok.com",
      "x.com",
      "gemini.google.com",
    ]) {
      expect(hostnames).toContain(host);
    }
  });

  it("dates every selector's capture", () => {
    for (const site of SITES) {
      expect(site.captured).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(site.captureMethod.length).toBeGreaterThan(0);
    }
  });

  it("gives every site at least one composer selector", () => {
    for (const site of SITES) {
      expect(site.composerSelectors.length).toBeGreaterThan(0);
    }
  });
});

describe("findSite", () => {
  it("matches chatgpt.com", () => {
    expect(findSite("chatgpt.com", "/")?.id).toBe("chatgpt");
  });

  it("matches chat.openai.com to the same chatgpt entry", () => {
    expect(findSite("chat.openai.com", "/")?.id).toBe("chatgpt");
  });

  it("matches x.com only under /i/grok", () => {
    expect(findSite("x.com", "/i/grok")?.id).toBe("x-grok");
  });

  it("does not match x.com outside the grok path", () => {
    expect(findSite("x.com", "/home")).toBeNull();
  });

  it("returns null for an unknown site", () => {
    expect(findSite("example.com", "/")).toBeNull();
  });
});

describe("findComposer / findSendButton (only the matched element)", () => {
  it("finds the first matching selector in an ordered list", () => {
    document.body.innerHTML = '<div><textarea id="prompt-textarea"></textarea></div>';
    const site = findSite("chatgpt.com", "/")!;
    const composer = findComposer(site, document);
    expect(composer?.id).toBe("prompt-textarea");
  });

  it("returns null when no selector matches (fails loud)", () => {
    document.body.innerHTML = "<div>nothing here</div>";
    const site = findSite("chatgpt.com", "/")!;
    expect(findComposer(site, document)).toBeNull();
  });

  it("falls through the ordered list to a later selector", () => {
    document.body.innerHTML = '<div data-testid="chat-input"></div>';
    const site = findSite("claude.ai", "/")!;
    const composer = findComposer(site, document);
    expect(composer?.getAttribute("data-testid")).toBe("chat-input");
  });

  it("finds the send button by its selector", () => {
    document.body.innerHTML = '<button data-testid="send-button">Send</button>';
    const site = findSite("chatgpt.com", "/")!;
    expect(findSendButton(site, document)).not.toBeNull();
  });
});

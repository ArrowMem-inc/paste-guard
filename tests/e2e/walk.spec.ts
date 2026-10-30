// Rehearsal for a stranger's walk against a live site: loads the built
// dist/ extension into a real persistent Chromium context and walks paste,
// drop and send against each site's FIXTURE page (intercept the real
// hostname's requests and
// fulfill them from the local fixture file on disk, so the manifest's
// content_scripts.matches do the real matching work). No vendor site is
// ever actually requested: every route for the six hosts is fulfilled
// from disk, and everything else is aborted.
//
// FALSIFIED 2026-09-07: on the chatgpt.com walk, removed the
// `context.route(...)` call that maps the real URL to the fixture file
// (page.goto would then try the real network, which this sandbox has no
// path to) -> the walk failed at "expect(composer).toHaveCount(1)" with
// "locator resolved to 0 elements" (no fixture HTML ever arrived, so
// #prompt-textarea never existed). Restored the route.
//
// FALSIFIED 2026-09-07 (second): removed the chatgpt.com and
// chat.openai.com match patterns from manifest.json's content_scripts,
// rebuilt dist/, and reran the chatgpt.com walk -> it failed at
// "expect(bar).toHaveCount(1)" with "0 received" after the paste (no
// content script means no interception at all, even though the fixture's
// composer element itself still rendered). Restored the patterns and
// rebuilt.
//
// (An earlier attempt tried falsifying by removing --load-extension from
// the launch args instead of touching the manifest. On this machine's
// Chrome-for-Testing build the extension still loaded from
// --disable-extensions-except alone, so that variant did not actually
// falsify anything -- it is not claimed as evidence anywhere in this
// report.)
import { test, expect, chromium, type BrowserContext } from "@playwright/test";
import { readFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");
const DIST = path.join(ROOT, "dist");

const STRIPE_TEST_CARD = "4242 4242 4242 4242";
const TEST_SIN = "046-454-286";

interface WalkSite {
  label: string;
  url: string;
  fixture: string;
  composerSelector: string;
}

const SITES: WalkSite[] = [
  {
    label: "chatgpt.com",
    url: "https://chatgpt.com/",
    fixture: "fixtures/chatgpt/composer.html",
    composerSelector: "#prompt-textarea",
  },
  {
    label: "chat.openai.com",
    url: "https://chat.openai.com/",
    fixture: "fixtures/chatgpt/composer.html",
    composerSelector: "#prompt-textarea",
  },
  {
    label: "claude.ai",
    url: "https://claude.ai/",
    fixture: "fixtures/claude/composer.html",
    composerSelector: 'div[contenteditable="true"].ProseMirror',
  },
  {
    label: "gemini.google.com",
    url: "https://gemini.google.com/",
    fixture: "fixtures/gemini/composer.html",
    composerSelector: 'rich-textarea .ql-editor[contenteditable="true"]',
  },
  {
    label: "grok.com",
    url: "https://grok.com/",
    fixture: "fixtures/grok/composer.html",
    composerSelector: '[data-testid="grok-query-bar"] textarea',
  },
  {
    label: "x.com/i/grok",
    url: "https://x.com/i/grok",
    fixture: "fixtures/x-grok/composer.html",
    composerSelector: '[data-testid="grok-composer"] textarea',
  },
];

async function launchWithExtension(userDataDir: string): Promise<BrowserContext> {
  return chromium.launchPersistentContext(userDataDir, {
    headless: false,
    args: [`--disable-extensions-except=${DIST}`, `--load-extension=${DIST}`],
  });
}

async function getComposerText(
  context: BrowserContext,
  selector: string
): Promise<string> {
  const page = context.pages()[0]!;
  return page.evaluate((sel) => {
    const el = document.querySelector(sel) as HTMLTextAreaElement | HTMLElement | null;
    if (!el) return "__MISSING__";
    if (el instanceof HTMLTextAreaElement) return el.value;
    return el.textContent ?? "";
  }, selector);
}

for (const site of SITES) {
  test(`${site.label}: paste, drop and send are caught; Remove empties the field`, async () => {
    const userDataDir = mkdtempSync(path.join(tmpdir(), "pg-e2e-"));
    const context = await launchWithExtension(userDataDir);
    try {
      const origin = new URL(site.url).origin;
      await context.route("**/*", async (route) => {
        const url = route.request().url();
        if (url.startsWith(origin)) {
          const html = readFileSync(path.join(ROOT, site.fixture), "utf8");
          await route.fulfill({ contentType: "text/html; charset=utf-8", body: html });
        } else {
          await route.abort();
        }
      });

      const page = context.pages()[0] ?? (await context.newPage());
      await page.goto(site.url);

      const composer = page.locator(site.composerSelector);
      await expect(composer).toHaveCount(1);
      const bar = page.locator("[data-paste-guard-bar]");

      // --- PASTE: caught, Remove keeps the field empty ---
      await composer.click();
      await page.evaluate(
        ({ selector, text }) => {
          const el = document.querySelector(selector)!;
          const dt = new DataTransfer();
          dt.setData("text/plain", text);
          const evt = new ClipboardEvent("paste", {
            bubbles: true,
            cancelable: true,
            clipboardData: dt,
          });
          el.dispatchEvent(evt);
        },
        { selector: site.composerSelector, text: STRIPE_TEST_CARD }
      );
      await expect(bar).toHaveCount(1);
      await expect(bar).toContainText("card number");
      await bar.locator("button").first().click();
      await expect(bar).toHaveCount(0);
      expect(await getComposerText(context, site.composerSelector)).toBe("");

      // --- DROP: caught, Remove keeps the field empty ---
      await page.evaluate(
        ({ selector, text }) => {
          const el = document.querySelector(selector)!;
          const dt = new DataTransfer();
          dt.setData("text/plain", text);
          const evt = new DragEvent("drop", {
            bubbles: true,
            cancelable: true,
            dataTransfer: dt,
          });
          el.dispatchEvent(evt);
        },
        { selector: site.composerSelector, text: STRIPE_TEST_CARD }
      );
      await expect(bar).toHaveCount(1);
      await bar.locator("button").first().click();
      await expect(bar).toHaveCount(0);
      expect(await getComposerText(context, site.composerSelector)).toBe("");

      // --- SEND (typed by hand, not pasted): caught on Enter, Remove empties ---
      await page.evaluate(
        ({ selector, text }) => {
          const el = document.querySelector(selector) as HTMLTextAreaElement | HTMLElement;
          if (el instanceof HTMLTextAreaElement) {
            el.value = text;
          } else {
            el.textContent = text;
          }
          el.dispatchEvent(new Event("input", { bubbles: true }));
        },
        { selector: site.composerSelector, text: TEST_SIN }
      );
      await composer.click();
      await page.keyboard.press("Enter");
      await expect(bar).toHaveCount(1);
      await expect(bar).toContainText("Social Insurance Number");
      await bar.locator("button").first().click();
      await expect(bar).toHaveCount(0);
      expect(await getComposerText(context, site.composerSelector)).toBe("");
    } finally {
      await context.close();
      rmSync(userDataDir, { recursive: true, force: true });
    }
  });
}

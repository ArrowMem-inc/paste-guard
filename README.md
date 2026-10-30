# Paste Guard

Notices when a paste, drop or send to an AI chat composer looks like a card number, a Social
Insurance Number, a labeled Social Security Number, a labeled passport line, a secret key, or
(optionally, off by default) a health detail -- and asks first. Runs entirely in your browser. It
makes no network calls in the code shipped today, and a build check enforces that (see the limits
below).

Working name: "ArrowMem Paste Guard".

## Install unpacked in two minutes

**From the zip (no tools needed).** This repository ships no CI pipeline, so nothing builds the
zip for you automatically. Download `paste-guard-<version>.zip` and its `SHA256SUMS` file from a
GitHub release once one is cut (built locally with the commands in "From source" below, then
uploaded by hand). Download both, then check the hash before you unzip:

```
shasum -a 256 paste-guard-<version>.zip     # macOS / Linux
certutil -hashfile paste-guard-<version>.zip SHA256   # Windows
```

The printed hash must equal the line for that file in `SHA256SUMS`. If it does not, stop: do not
install it. If it does, unzip it into a folder you will keep (Chrome loads the extension from that
folder, so do not delete it afterwards).

**From source (needs Node 20 or newer).**

```
npm ci
npm run build
npm run zip
```

`npm run build` produces `dist/` (Chrome / Edge). `npm run zip` zips `dist/` into
`release/paste-guard-<version>.zip` and writes its SHA-256 to `release/SHA256SUMS`. The hash is
never written into this README by hand -- read it from `release/SHA256SUMS` after you build, or
run `shasum -a 256 release/paste-guard-<version>.zip` yourself to check it.

Then, in Chrome or Edge:

1. Go to `chrome://extensions` (or `edge://extensions`).
2. Turn on **Developer mode** (top right).
3. Click **Load unpacked**.
4. Pick the unzipped folder (or the `dist/` folder produced above).

The toolbar icon shows a badge once you're on a supported site (see "Sites watched" below).

## What it does

- Watches the message composer on six AI chat surfaces (see the site list below).
- On **paste**, **drop**, or pressing **Enter** / **Cmd+Enter** / **Ctrl+Enter** / the site's own
  send button, it checks the text for a card number, a SIN, a labeled SSN, a labeled passport
  number, or a known secret-key/token shape.
- If it finds one, it shows a one-line inline bar directly above the composer -- never a modal,
  never a page overlay -- naming the category and offering **Remove it** / **Send anyway** (or
  **Paste anyway** / **Drop anyway** for the paste and drop paths). Escape means Remove. The bar
  is `role="alert"` and both buttons are keyboard reachable.
- Choosing **Send anyway** starts a one-hour per-site snooze, stored as a site id and an expiry
  timestamp in `chrome.storage.local` -- never the content itself. The snooze survives a reload
  for its full hour. Paste anyway / Drop anyway insert that one text and start no snooze: the send
  check still runs.
- The six sites re-render their composer on navigation (new chat, switch conversation). The
  content script keeps watching for that: when the wired composer leaves the page the badge goes
  OFF until a replacement is found and wired, never ON over a field it is not watching.

## What it does NOT do (the controls, not just the claim)

- **No network calls of any kind, anywhere, in the code shipped today.** Manually read: `src/`
  has zero calls to `fetch`, `XMLHttpRequest`, `WebSocket`, `sendBeacon`, `EventSource`,
  `RTCPeerConnection`, `postMessage`, or any beacon-shaped DOM write. `scripts/check-no-network.mjs`
  greps the *built* bundle for those same literal tokens plus remote `<script src=...>`, `.src =`
  assignments, `window.open`, `location.href` / `assign` / `replace`, and any `http(s)://` URL
  literal that isn't one of the manifest's own content-script match patterns, and fails the build
  if any appear. It also parses `dist/manifest.json` and fails if `host_permissions` is non-empty,
  or `permissions` holds anything beyond exactly `storage`, or if `webRequest`, `alarms`,
  `identity` or `tabs` appear anywhere. This script runs as part of `npm test`.
  `chrome.runtime.sendMessage` between the content script and this extension's own background
  worker is explicitly allowed by the checker -- it never leaves the browser, let alone the
  extension, so it is not a network call. `window.postMessage` (all receiver forms) and
  `RTCPeerConnection`/`createDataChannel` are forbidden tokens too, closing two concrete bypasses
  a break report demonstrated against an earlier version of this checker. **What this check is,
  honestly:** a literal-token grep over the built text, not a parse of what the code does. A
  future change that reaches the network through any sink or URL shape this token list does not
  name -- for example a hidden `<form>` POST or a CSS `background-image: url(...)` pointed at a
  scheme-omitted `//host/...` address -- would still not be caught by this script, whether or
  not the code is deliberately obfuscated: nothing needs to be fragmented or built from a
  computed property access for a gap like this to pass. Closing that for real needs an
  AST-based check, not a wider token list. Today's shipped code does none of that (confirmed by
  the manual read above, not
  just the grep), but the grep alone is not proof against a future regression; see "What this does
  not protect against" below.
- **No console output that could carry content.** The same script forbids `console.log(`,
  `console.info(`, `console.debug(`, `console.warn(`, and `console.error(` anywhere in the built
  bundle -- not just the ones that seem risky. Allow nothing.
- **The content script reads exactly one element: the composer matched by that site's selector.**
  `findComposer` in `src/sites.ts` walks that site's ordered `composerSelectors` list and
  returns the first match or `null`. `getComposerText` in `src/content.ts` reads only that
  element's `.value` (textarea) or `.textContent` (contenteditable) -- never `document.title`,
  never cookies, never the surrounding conversation history, never any other element. The paste
  path additionally reads the incoming `clipboardData`/`dataTransfer` text (never files) as the
  thing about to be inserted.
- **Nothing is retained.** No content is ever written to `chrome.storage.local`. The only things
  ever stored there are: a site id and a snooze expiry timestamp per site, the health-detector
  on/off flag, and (2026-09-09) two popup preferences -- a theme choice (`light`, `dark`, or
  absent for "follow the system") and a language choice (`en` or `fr`, or absent for "detect from
  the browser") -- see `src/storage.ts`. That is the complete list; nothing else is ever written,
  and `tests/unit/guards/storage-keys.test.ts` proves it by exercising every storage-writing
  export and asserting the exact key set produced. See `tests/unit/content.test.ts` for the
  zero-retention proof on the scanning path itself: it plants Stripe's test card
  `4242 4242 4242 4242` in a fixture composer, triggers paste, drop and send, and then greps
  `chrome.storage.local`, captured console output, and the DOM outside the composer for it --
  zero hits in every path, including the ones where the user chooses "anyway" (the text lands in
  the composer, same as if they had typed it, but nowhere else). The one thing the extension knows
  about a blocked or failed check -- a category enum, kept in the content script's own memory for
  the life of the page -- is never written to storage at all; see "Live status in the popup" below.
- **What is NOT covered by "nothing is retained":** the inline warning bar is inserted directly
  into the real page DOM on the AI chat site (not a shadow root, not an isolated overlay), so the
  site's own page scripts -- first-party, or third-party if that page were ever compromised --
  can watch for it with an ordinary `MutationObserver` and learn that a paste was flagged and
  which of the fixed categories fired. They never see the matched text, only that one of six
  category names appeared. This is not a network call and not a storage write by this extension,
  which is why it is called out here rather than in the storage/network claims above.

## What this does not protect against

Read this before deciding what to trust the badge for.

- **It matches shapes in text, not meaning.** Every detector is a pattern (a regex, a checksum
  like Luhn, or a nearby label word) run against the raw characters about to be sent. Nothing
  here reads or understands the sentence the way a person would.
- **It can miss things that are really there.** A number split across lines, separated by an
  unusual character, or simply not near the label word a detector looks for, can pass through
  unflagged. A shape a detector was never written to recognize passes through unflagged too.
- **It can fire on ordinary text that is not actually sensitive.** A pattern-based check has no
  way to be certain; a word or number that merely resembles what it is looking for can trip it.
- **It only watches six named sites, and only the one composer element on each.** Nothing you
  type anywhere else, or anywhere else on those same pages, is looked at.
- **It protects against your own mistakes, not against a page that is working to defeat it.** A
  page whose own script is determined to defeat it (for example by swallowing key or paste events
  before this extension sees them) can switch the guard off. The ask bar's buttons ignore clicks
  that the page's own script generated, so a page cannot press them for you, but that narrows the
  hole; it does not close it.
- **It is a second look before you send, not a filter you can rely on to be complete.** Treat the
  bar the way you would a seatbelt: worth having, catches real mistakes, and no substitute for
  reading what you are about to paste yourself.

## Live status in the popup (2026-09-09)

Opening the popup on a watched, found composer now shows one of three states, matching the
approved design's "Active", "Flagged" and "Error" cards word for word:

- **Nothing has been blocked and no check has failed:** "Paste Guard is on." (the existing state).
- **The last paste/drop/send on this page was intercepted:** "A paste was blocked." plus "Something
  in that paste looked like a key or a secret, so it was not sent." The specific category (card,
  SIN, SSN, passport, secret, health) is not shown -- the render's text is the same regardless of
  which one fired.
- **A detector threw, or the content script did not answer in time:** "Paste Guard couldn't check
  this paste."

This is answered live, not stored: the popup asks the active tab's content script directly
(`chrome.tabs.sendMessage`, a `get-last-outcome` request), the same way it already asks the
background worker for site status. The content script keeps the answer -- a category enum and
nothing else, never the matched text, never a hash, never a timestamp -- in a plain module-level
variable that exists only for the life of that page; the background worker is never told and holds
nothing about it. Navigating or reloading the page destroys the content script instance and the
variable with it. `tests/unit/guards/storage-keys.test.ts` and
`tests/unit/guards/message-shape.test.ts` are the automated proofs that neither the outcome nor its
message shape can carry content.

## Health detail detector: off by default in v1

The health-detail detector (`src/detectors/health.ts`) is built, wired, and unit tested exactly
like the others, but it ships **disabled by default** (`chrome.storage.local`, see
`src/storage.ts`). It is label-based only -- diagnosis, prescription, prescribed, test result,
positive for, HIV, cancer, therapy notes -- and never guesses from a symptom. There is no toggle
for it anywhere in this build's UI: `setHealthDetectorEnabled()` exists in `src/storage.ts` but
nothing in the shipped extension calls it, so turning it on today means changing code, not
flipping a setting. Card, SIN, SSN, passport and secret keys ship active in v1; the health
detector is meant to ship active only once its false-positive rate on ordinary chat has been
measured.

## Sites watched

<!-- site-list -->
| Site | Composer selector (first match wins) | Vendor | Captured |
|---|---|---|---|
| chatgpt.com, chat.openai.com | `#prompt-textarea` | OpenAI | 2026-09-07 |
| claude.ai | `div[contenteditable="true"].ProseMirror`, `[data-testid="chat-input"]` | Anthropic | 2026-09-07 |
| gemini.google.com | `rich-textarea .ql-editor[contenteditable="true"]` | Google | 2026-09-07 |
| grok.com | `[data-testid="grok-query-bar"] textarea`, `form textarea` | xAI | 2026-09-07 |
| x.com (the `/i/grok` path only) | `[data-testid="grok-composer"] textarea`, `form textarea` | xAI | 2026-09-07 |
<!-- /site-list -->

An unknown site gets nothing injected: the manifest's `content_scripts.matches` only lists these
hostnames (see `manifest.json`), so the extension cannot run anywhere else. `chatgpt.com` and
`chat.openai.com` share one table row because they are the same product surface with identical
composer markup.

**Honesty about how these selectors were captured:** the fixtures under `fixtures/<site>/` and
the selector table in `src/sites.ts` are **hand-written stand-ins as of 2026-09-07**, not a live
DOM capture -- no request was made to any vendor site to build them (see
`captureMethod` in `src/sites.ts`). This is exactly what `tests/e2e/walk.spec.ts` proves against:
it loads the built extension into a real browser and walks paste/drop/send against these fixture
pages by routing the real hostname's traffic to the local fixture file, which also proves the
manifest's `content_scripts.matches` patterns actually match. **Not verified in this build:
whether these selectors still match each site's live production markup.** The fixture walk above
proves this extension's own wiring, not that a vendor has changed its DOM since the capture date
above; checking that against the real sites is a manual step nothing in this repository automates
or records yet. If a vendor ships a redesign, the fix is a one-table edit in `src/sites.ts`.

## Toolbar icon and popup

The toolbar badge reflects state per tab (`src/background.ts`), driven by messages from the
content script (`src/content.ts`) -- never inferred, never assumed:

- **On a listed site where the composer selector finds nothing:** badge text "OFF", red
  background. The popup says "Not watching here: the composer for &lt;site&gt; was not found
  (selector dated &lt;date&gt;)."
- **On a listed site where the composer IS found:** badge text "ON", green background. The popup
  says "Paste Guard is on." (see "Live status in the popup" above for the full three-state text).
- **On any other site:** no badge at all. The popup says "Nothing to scan on this page."
- **On every navigation start**, the badge is cleared immediately, before the content script (if
  any) has a chance to report back on the new page -- so a stale "watching" badge never survives a
  jump to a page the extension cannot see.

The badge update is a `chrome.runtime.sendMessage` call from the content script to this
extension's own background service worker. That is not a network call (see "What it does NOT do"
above) -- `check-no-network.mjs` allows `chrome.runtime` explicitly while forbidding every network
API by name.

## Accessibility and language

The bar is `role="alert"` (announced by a screen reader), and both buttons have accessible names
(`aria-label`, matching their visible text). Every user-facing string lives in one table,
`src/strings.ts`, and both `en` and `fr` are filled in for every entry: `tests/unit/strings.test.ts`
asserts that no `fr` value is left as the untranslated placeholder (`FR_PLACEHOLDER`) any more.
That placeholder, and the runtime fallback in `pickString()` that falls back to English whenever a
`fr` value still equals it, both remain in the code as a safety net for the next string someone
adds ahead of its French, not because anything ships untranslated today.

**Corner control (2026-09-09):** every popup card carries a small theme toggle and an EN/FR
language pill in its top-right corner, matching the approved design's layout, sizes and colours
exactly (`src/popup.html`, `.corner*` rules) -- **114px wide, matching the render's own computed style
with zero difference**, re-measured with `document.fonts.ready` settled before reading either box.
The theme button is a two-way light/dark toggle -- before it is ever clicked, the popup follows
the OS's `prefers-color-scheme`; a click sets an explicit choice that always wins, in both
directions, over the OS setting. The language pill switches the popup's own text live, no reload.
The pill's VISIBLE text is the render's own two-letter "EN"/"FR" -- the export is the authority
over the parent product's theme/language picker where the two differ. Its accessible name
(`aria-label`) is still that picker's full word ("EN"/"Français"), so a screen reader hears the
language name, not the abbreviation. All three of this control's words (Theme, EN, Français) were
not translated for this extension: they are copied verbatim from the parent product's own
theme/language picker, kept in a separate `CORNER_STRINGS` table in `src/strings.ts`. The one CSS
difference from the render worth naming even though the result now matches exactly:
`.corner-lang-btn` sets `box-sizing: content-box`, because these pills are
real `<button>` elements (Chromium defaults buttons to `border-box`) where the render's are
illustrative `<span>`s (`content-box` by default) -- without that override the same `min-width`
value means two different box sizes and the pill renders about 8px narrower per chip.

## Browser support

- **Chrome and Edge:** `manifest.json`, Manifest V3, a real background service worker
  (`"background": {"service_worker": "background.js"}`).
- **Firefox:** same TypeScript source, a separate `manifest.firefox.json`. Build it with
  `npm run build -- --firefox` (outputs `dist-firefox/`) and zip it with
  `npm run zip -- --firefox`.

  **Firefox differences**, everything else is identical:
  - `background.service_worker` becomes `background.scripts: ["background.js"]` -- Firefox's
    MV3 implementation runs background code as a persistent-ish event page script, not a true
    service worker.
  - `browser_specific_settings.gecko.id` is set (`paste-guard@arrowmem.ca`) and
    `strict_min_version` is `140.0`, both required by Firefox's Manifest V3 support and its
    add-on signing process; Chrome ignores this key entirely.
  - Everything else -- `content_scripts`, `permissions`, `host_permissions`, `action` -- is
    byte-identical between the two manifests.
- **Firefox, live check:** 2026-10-28, Firefox 158.0.1 on Linux, loaded as a Temporary Extension
  from `dist-firefox/`. The ask bar showed on a pasted Luhn-valid test card on chatgpt.com
  (signed out), grok.com, claude.ai and gemini.google.com (signed in). "Remove it" and "Send anyway" were clicked and
  responded on all four sites (clicked by hand). Not yet run in Firefox: x.com/i/grok.
- **Release 1.0.3** (changes since 1.0.2): the JWT detector now scans in linear time, so long dash-heavy input no longer slows it down; the ask bar's buttons ignore clicks that the page's own script generated; when the site's own send-button selectors find nothing, a fallback picks a button labelled send or submit, the nearest to the composer; the build writes the copied manifest and popup page with LF line endings.
- **Safari: not supported.** No Safari build, no Safari manifest, no claim of Safari support
  anywhere in this repository or its store listing copy.

## Testing

```
npm ci
npm run build              # dist/ (Chrome/Edge)
npm run test:unit          # vitest: detectors, storage, ui, sites, content wiring, guards
npm run check-no-network   # scripts/check-no-network.mjs against dist/
npm run test:e2e           # Playwright walk against dist/ + fixtures (needs a real/headed
                            # Chromium; see "Running the Playwright walk" below)
npm test                   # build + vitest + check-no-network (no Playwright; run
                            # `npm run test:e2e` separately, see below)
```

### Running the Playwright walk

`tests/e2e/walk.spec.ts` loads the built `dist/` extension into a real, persistent Chromium
context (`--load-extension` requires either a headed browser or Chromium's newer headless mode
that supports extensions; this repo's Playwright config launches headed, `headless: false`,
which needs a display -- on a desktop machine this pops a real (fast, invisible-if-you-blink)
Chrome window; on a headless machine, wrap it with a virtual display, e.g. `xvfb-run`). It walks all six sites'
fixture pages using Playwright route interception to map each real hostname to the local fixture
file on disk (see the top-of-file comment in `tests/e2e/walk.spec.ts` for why: it is the only way
that also proves the manifest's `content_scripts.matches` patterns actually match). No vendor
site is ever requested for real: every route for the six hosts is fulfilled from disk, and
anything else is aborted.

```
npx playwright install chromium   # once, if the browser build isn't already cached
npm run test:e2e
```

### Falsification

Every detector test, the storage test, the UI test, the background/popup tests, the
check-no-network falsification, and the Playwright walk each carry a `FALSIFIED <date>: broke
X -> test Y failed with Z` comment at the top of their file recording what was deliberately broken
and how the test caught it, before the break was reverted. This is not a claim -- every one of
these was actually run broken, observed red, then restored and re-verified green as part of
building this extension.

## Uninstall

**Chrome:**

1. Go to `chrome://extensions`.
2. Find the "ArrowMem Paste Guard" card.
3. Click **Remove**, then confirm **Remove** in the dialog that follows. (Right-clicking the
   toolbar icon and choosing **Remove from Chrome...** opens the same dialog.)

**Edge:**

1. Go to `edge://extensions`.
2. Find the "ArrowMem Paste Guard" card.
3. Click **Remove**, then confirm **Remove** in the dialog that follows.

**Firefox** (loaded as a Temporary Extension, per "Browser support" above):

1. Go to `about:debugging#/runtime/this-firefox`.
2. Find "ArrowMem Paste Guard" under Temporary Extensions.
3. Click **Remove**.

A temporary extension is also removed automatically the next time Firefox restarts -- this is how
Firefox's temporary-loading mechanism works, not something this extension does. There is no
persistent Firefox install path in this build (no signed `.xpi`), so this is the only removal
route Firefox offers for it today.

**What happens to stored data on removal:** Chrome's and Firefox's own `storage.local` API
documentation states that data an extension writes with `chrome.storage.local` /
`browser.storage.local` is deleted when the extension is uninstalled. This extension stores only a
site id, a one-hour snooze expiry timestamp, the health-detector on/off flag, and the two popup
preferences (theme, language) there (see "What it does NOT do" above and `src/storage.ts`) --
never message content, so there was never anything
more sensitive than that to remove. **Not verified in this build:** whether Chrome's and Firefox's
storage-clear-on-uninstall behavior is identical for an unpacked/temporary developer load versus a
store install; both vendors document the behavior for "uninstall" generally without calling out
the unpacked case separately, and this has not been independently confirmed end to end for this
extension. In every case, **the unpacked folder on disk (wherever you unzipped or checked it out)
is never deleted by "Remove" -- only Chrome's, Edge's or Firefox's own reference to it is.** Delete
that folder yourself if you want the files gone too.

## Credits

Built by ArrowMem Inc. with Claude as the coding collaborator. Broken on purpose several
times by adversarial model sessions that did not write it, and the findings from those
reviews are what shaped the limits sections above. Issues and pull requests welcome.

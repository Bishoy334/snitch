# Popup — product flow & UI scope

Working scope for the popup rebuild. Invariant unchanged: everything local.

## A. Site identity (replaces tab screenshot)

1. Favicon, not screenshot: Chrome's local favicon cache via the `favicon`
   permission and `_favicon/?pageUrl=<url>&size=64`. No network, works for any
   site Chrome has visited. 32px rendered in a 40px rounded tile.
2. Fallback chain: favicon → colored monogram tile (hashed hue, site initial).
   Detect the blank-globe default (Chrome returns it for unknown sites) is not
   possible cheaply; monogram only when the URL is missing/restricted.
3. Hero row: [favicon tile] [domain + one-line stat] ......... [score dial].

## B. Flow / information architecture

Three reading levels, strictly ordered:

- Level 0 — glance (no reading): dial number + word, favicon, domain.
- Level 1 — story: max 4 finding rows, icon + bold headline, note lines only
  on red items. Order: fingerprinting, trackers, device access, cookies, then
  one earned green line.
- Level 2 — receipts: "Full technical list" disclosure, rebuilt per the
  element grammar in section E (company cards, not hostname rows).

States (each designed, none accidental):
- Loading: skeleton hero for the ~100ms of queries; no layout shift.
- Not inspected yet: monogram + dashed dial + a real "Reload page" button
  (chrome.tabs.reload) instead of telling the user to do it.
- Restricted page (chrome://, Web Store): "Chrome doesn't let extensions see
  this page." Muted, no dial.
- Clean site: green dial + positive verdict; never looks empty or broken.

Actions row (bottom, appears when relevant):
- Free: "Full technical list" toggle (exists).
- Pro (next milestone): per-tracker Block toggle inside Level 2 rows +
  "Block all N trackers" button. UI slots reserved now, shipped with DNR work.

## C. Visual system cleanup

Tokens
- Spacing on a 4px grid; single horizontal inset (16px) everywhere.
- Type scale: 11 (labels/caps), 13 (body), 15 (verdict), 22 (dial). Weights
  400/650 only.
- Color discipline: red = confirmed surveillance only. One colored element
  per row (the icon tile). Chips/labels go neutral; category shown as a small
  colored dot + neutral text, not red text.

Chrome-default scrubbing
- `:focus-visible` custom ring (2px accent, offset), default outline removed
  only where replaced; keyboard nav stays visible.
- Styled scrollbar: `::-webkit-scrollbar` 8px, pill thumb var(--hair),
  transparent track; also `scrollbar-width: thin`.
- `::selection` tinted; `user-select: none` on chrome (labels, dial), text
  stays selectable in lists.
- No native `<details>` marker artifacts; summary styled as a hover row with
  rotating chevron.

Calm-down pass
- Row hover states (subtle bg, 4px radius) instead of hairline-separated rows.
- Fewer full-width dividers: one above story, one above details. Sections
  inside the list separated by spacing + label only.
- Counts right-aligned tabular; long hosts ellipsize (already do).
- Motion: dial fill 600ms once; everything else ≤150ms; honors
  prefers-reduced-motion.

## E. Element grammar — how each feature is shown

One rule above all: a number never appears without a unit or a sentence
around it. A hostname never appears without a reason to care.

1. Score dial — the only fully saturated element. Number + word. Severity
   color comes from one 3-step scale (red / amber / green) shared app-wide.
2. Verdict — one sentence, 15px, bold only on names and counts, max 2 lines.
3. Company pills — monogram + name, max 4 + "+N more". They are the same
   companies that head the Level-2 cards; pills are the summary, cards the
   detail.
4. Finding rows (story) — icon tile carries the only color. Bold headline
   under 9 words. Note line on red items only. Max 4 rows + 1 green.
5. Severity scale, exactly three: red = active surveillance (fingerprinting,
   device access, ad/analytics/social trackers). Amber = persistence
   (long-lived cookies). Green = earned reassurance. All else neutral.
   Never two colored elements adjacent.
6. Technical list = company cards, not hostname rows:
   - One card per company: monogram, name, neutral category text with a
     small colored dot, "N requests" right-aligned (with the unit).
   - Card expands to its hostnames (muted, indented, per-host counts).
   - Unknown third parties grouped into one "Unrecognized domains" card.
   - Site-own domains into "<site>'s own services" card (neutral).
   - CDN/content into "Content delivery" card, collapsed, explicitly
     labeled "not tracking".
   - Pro slot: block toggle lives on the company card header (later).
7. Fingerprinting / device rows in Level 2 — icon + plain label +
   neutral "by host" chip. Deduped. Same wording as Level 1, never new terms.
8. Cookies & storage — labeled sentences, not stat rows:
   "reddit.com set 11 cookies — 9 stay after you leave."
   "Trackers holding cookies: doubleclick.net (3), facebook.net (1)."
   "Local storage: 41 items." Three lines max.
9. Section headers — "TRACKERS · 5" label + count together, so sections are
   scannable without reading rows.
10. Every element ships in both themes from the same tokens; no per-element
    dark-mode overrides.

## D. Data nits while in there

- Dedupe fingerprinting rows by kind+host in background (belt and braces).
- Popup body max-height 600 total; only the technical list scrolls.

Out of scope for this pass: blocking (next milestone), history, ExtensionPay.

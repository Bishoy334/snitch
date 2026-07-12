# Chrome Web Store listing — copy-paste sheet

## Name
Snitch

## Summary (132 chars max)
Catch who's tracking you online. Nothing ever leaves your browser.

## Category
Privacy & Security

## Description
Snitch is a privacy report card for every site you visit. Click the icon
and get a plain-English answer to one question: what is this page doing
with your data?

• Who got your visit — every tracking company on the page, named and
  scored, with real logos. Google, Meta, comScore and thousands more,
  identified from a bundled database.
• Fingerprinting alerts — Snitch catches pages reading hidden canvas
  pixels, your GPU model, your audio hardware or your installed fonts:
  the techniques that identify you even in private mode.
• What's saved in your browser — cookies and storage classified by what
  they mean: tracking IDs, "recognizes you when you return"
  identifiers, and the harmless housekeeping.
• Following you across sites — Snitch remembers (locally) which
  companies it has seen on which sites, so it can tell you "Google has
  seen you on 14 other sites this month."
• A privacy score — one dial, one word, for every site.
• Forget this site — flip a switch and Snitch wipes a site's cookies
  and storage every time you leave it.
• Device access alerts — know when a page asks for your camera,
  microphone, location or clipboard.

100% local. Snitch has no server, no account, no analytics, and makes no
network requests. Everything is computed on your device against a
bundled tracker database. The permission list is broad because the job
is broad — inspecting any page you're on — but nothing ever leaves your
browser. That's the whole point.

## Single-purpose statement (privacy tab)
Snitch shows the user, for the site they are currently visiting, which
companies are tracking them (third-party trackers, fingerprinting
attempts, stored identifiers) and lets them clear that site's stored
data.

## Permission justifications (privacy tab)

- webRequest — Observes the current page's network requests locally to
  list which third-party tracker domains the page contacts. Read-only;
  nothing is blocked, modified, or transmitted.
- storage — Keeps per-tab inspection reports (session storage), the
  local cross-site ledger, and user settings (local storage). All data
  stays on the device.
- cookies — Reads cookie names and lifetimes for the current site and
  its detected trackers, to explain which stored identifiers exist and
  how long they last.
- browsingData — Powers the user-facing "Forget this site when I close
  it" switch, which clears the flagged site's cookies and storage.
- favicon — Shows the current site's icon in the popup, served from
  Chrome's local favicon cache.
- Host permissions (<all_urls>) — The report must work on whatever site
  the user is visiting; trackers and fingerprinting can only be observed
  on the page where they happen. Content scripts only observe
  fingerprinting-related API calls and report them to the popup. No
  remote code, no data transmission.

## Data usage disclosures
Does NOT collect any data. Check "No" / leave every data-type box
unchecked, and certify the three disclosures (no sale, no unrelated use,
no creditworthiness use).

## Assets
- Store icon: public/icons/icon-128.png
- Screenshot 1280×800: store/screenshot-1.png

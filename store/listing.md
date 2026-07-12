# Chrome Web Store listing — copy-paste sheet

## Name
Snitch

## Summary (132 chars max)
Catch who's tracking you online. Nothing ever leaves your browser.

## Category
Privacy & Security

## Description
Snitch tells you what a website is doing behind your back. Click the
icon and you get a score, the companies that saw your visit, and a
plain explanation of what got stored in your browser.

It catches the sneaky stuff too. If a page reads a hidden canvas, asks
for your GPU model or scans your installed fonts, that's fingerprinting,
and Snitch flags it as it happens. Same if a page wants your camera,
microphone, location or clipboard.

Snitch also remembers which trackers it has seen on which sites (only
on your device), so it can tell you things like "Google has seen you on
14 other sites this month". That's the part that made me want to build
this.

What you get for every site:

- a privacy score with a one line verdict
- every tracking company on the page, with names and logos
- fingerprinting attempts, caught in the act
- which cookies are tracking IDs and which are just logins and settings
- a "forget this site" switch that wipes a site's data whenever you
  leave it

Everything runs in your browser. Snitch has no server, no account, no
analytics, and it makes zero network requests. Your data would be a
strange thing for a privacy extension to collect.

It's free. If it's useful to you, there's a Buy me a coffee link in the
popup.

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

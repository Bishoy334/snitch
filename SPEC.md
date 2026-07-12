# Privacy Inspector — Spec

Chrome extension (MV3): a per-site privacy report card. Shows who's tracking you in plain English, scores the site, lets you one-click block trackers it surfaced. An X-ray, not an adblocker.

## The invariant (never violate)

100% local. No backend, no accounts, no telemetry. Nothing leaves the browser. Any feature that needs a server, uptime, login, or hosted state is rejected — no exceptions.

## MVP (free tier)

- Live inventory of third-party requests/trackers per page (webRequest read-only)
- Fingerprinting detection: canvas / WebGL / audio API / font-list probes
- Cookie + storage audit: first- vs third-party, who set what
- Sensitive-API alerts: mic / camera / geolocation / clipboard access
- Per-site privacy score with plain-English "why"

## Pro tier (still 100% local, via ExtensionPay)

- Local history dashboard ("who tracked you this week")
- Alerts/rules ("notify me when a site fingerprints me")
- Tracker-ownership labels ("owned by Meta") from a bundled DB, refreshed only via extension updates
- One-click block-this-tracker via dynamic declarativeNetRequest rules
- Exportable report

Pricing: free = inspector + score. Pro ≈ $2.99–4.99/mo or ~$30/yr.

## Explicitly OUT

- ❌ VPN
- ❌ General adblocker / big filter lists (blocking only acts on trackers the inspector found)
- ❌ Hosted anything: no server, no login, no cloud sync

## Hard constraints

- MV3 declarativeNetRequest rule caps: design blocking around a small user-driven dynamic rule set, never a giant list
- Static rules can't change without Web Store review

## Feature accept/reject test

Needs a server, an account, or ongoing per-user support? → reject.
Runs locally with zero maintenance? → OK.

# Snitch

Catch who's tracking you online. Nothing ever leaves your browser.

Snitch is a Chrome extension (Manifest V3) that shows you, for the site
you're on: which companies got your visit, fingerprinting attempts as
they happen, what got stored in your browser and what it means, and
which trackers have followed you across sites. Everything is computed
locally against a bundled tracker database. No server, no account, no
analytics, zero network requests.

[Privacy policy](PRIVACY.md)

## Development

```sh
bun install
bun run dev        # rebuilds dist/ on save
bun run build      # production build
bun run trackers   # refresh the bundled Disconnect tracker DB
```

Load `dist/` via chrome://extensions → Load unpacked.

Tracker data comes from [Disconnect's tracking protection
lists](https://github.com/disconnectme/disconnect-tracking-protection)
(MPL-2.0), flattened at build time.

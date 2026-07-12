import { defineManifest } from '@crxjs/vite-plugin'

export default defineManifest({
  manifest_version: 3,
  name: "Snitch — see who's tracking you",
  version: '0.1.0',
  description:
    "See who's tracking you on any site — trackers, fingerprinting, cookies, in plain English. 100% local. Nothing leaves your browser.",
  icons: {
    16: 'icons/icon-16.png',
    32: 'icons/icon-32.png',
    48: 'icons/icon-48.png',
    128: 'icons/icon-128.png',
  },
  action: {
    default_popup: 'src/popup/index.html',
    default_icon: {
      16: 'icons/icon-16.png',
      32: 'icons/icon-32.png',
      48: 'icons/icon-48.png',
      128: 'icons/icon-128.png',
    },
  },
  background: { service_worker: 'src/background.ts', type: 'module' },
  content_scripts: [
    { js: ['src/content.ts'], matches: ['<all_urls>'], run_at: 'document_start', all_frames: true },
    { js: ['src/page-probe.ts'], matches: ['<all_urls>'], run_at: 'document_start', all_frames: true, world: 'MAIN' },
  ],
  permissions: ['webRequest', 'storage', 'cookies', 'favicon', 'browsingData'],
  host_permissions: ['<all_urls>'],
})

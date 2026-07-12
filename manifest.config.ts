import { defineManifest } from '@crxjs/vite-plugin'

export default defineManifest({
  manifest_version: 3,
  name: 'Privacy Inspector',
  version: '0.1.0',
  description: "Per-site privacy report card: see who's tracking you, in plain English.",
  action: { default_popup: 'src/popup/index.html' },
  background: { service_worker: 'src/background.ts', type: 'module' },
  permissions: ['webRequest', 'storage'],
  host_permissions: ['<all_urls>'],
})

// Isolated-world relay: forwards fingerprinting signals from page-probe.ts
// (MAIN world) to the background service worker.
window.addEventListener('message', (e) => {
  const kind = (e.data as { __privacy_inspector?: unknown })?.__privacy_inspector
  if (e.source !== window || typeof kind !== 'string') return
  chrome.runtime.sendMessage({ fp: kind, host: location.hostname }).catch(() => {})
})

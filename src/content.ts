// Isolated-world relay: forwards fingerprinting signals from page-probe.ts
// (MAIN world) to the background service worker.
chrome.runtime.onMessage.addListener((msg: { audit?: boolean }, _sender, sendResponse) => {
  if (!msg?.audit) return
  let local = 0
  let session = 0
  try {
    local = localStorage.length
    session = sessionStorage.length
  } catch {}
  sendResponse({ local, session })
})

window.addEventListener('message', (e) => {
  const kind = (e.data as { __privacy_inspector?: unknown })?.__privacy_inspector
  if (e.source !== window || typeof kind !== 'string') return
  chrome.runtime.sendMessage({ fp: kind, host: location.hostname }).catch(() => {})
})

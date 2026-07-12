// Isolated-world relay: forwards fingerprinting signals from page-probe.ts
// (MAIN world) to the background service worker.
// long, random-looking, no spaces: probably an identifier, said with a hedge
function looksId(v: string): boolean {
  return v.length >= 16 && v.length <= 200 && /^[\w.:%+/=-]+$/.test(v) && /\d/.test(v) && /[a-zA-Z]/.test(v)
}

chrome.runtime.onMessage.addListener((msg: { audit?: boolean }, _sender, sendResponse) => {
  if (!msg?.audit) return
  let local = 0
  let session = 0
  let ids = 0
  try {
    local = localStorage.length
    session = sessionStorage.length
    for (let i = 0; i < Math.min(local, 200); i++) {
      const key = localStorage.key(i)
      if (key && looksId(localStorage.getItem(key) ?? '')) ids++
    }
  } catch {}
  sendResponse({ local, session, ids })
})

window.addEventListener('message', (e) => {
  const kind = (e.data as { __privacy_inspector?: unknown })?.__privacy_inspector
  if (e.source !== window || typeof kind !== 'string') return
  chrome.runtime.sendMessage({ fp: kind, host: location.hostname }).catch(() => {})
})

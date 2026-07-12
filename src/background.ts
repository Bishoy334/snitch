import { getDomain } from 'tldts'
import trackerDb from './data/trackers.json'

type Tracker = { company: string; category: string }
type TabReport = {
  site: string
  requests: Record<string, { count: number; tracker: Tracker | null }>
}

const db = trackerDb as Record<string, Tracker>

// In-memory per-tab inventory, mirrored to storage.session for the popup.
// ponytail: a service-worker restart drops the current page's in-flight
// requests until the next navigation; rehydrate from session if that bites.
const reports = new Map<number, TabReport>()

function lookupTracker(host: string): Tracker | null {
  let d = host
  while (d.includes('.')) {
    const hit = db[d]
    if (hit) return hit
    d = d.slice(d.indexOf('.') + 1)
  }
  return null
}

function save(tabId: number) {
  chrome.storage.session.set({ [`tab-${tabId}`]: reports.get(tabId) })
}

chrome.webRequest.onBeforeRequest.addListener(
  ({ tabId, url, type }) => {
    if (tabId < 0) return
    const host = new URL(url).hostname
    if (type === 'main_frame') {
      reports.set(tabId, { site: host, requests: {} })
      save(tabId)
      return
    }
    const report = reports.get(tabId)
    if (!report || getDomain(host) === getDomain(report.site)) return
    const entry = (report.requests[host] ??= { count: 0, tracker: lookupTracker(host) })
    entry.count++
    save(tabId)
  },
  { urls: ['<all_urls>'] },
)

chrome.tabs.onRemoved.addListener((tabId) => {
  reports.delete(tabId)
  chrome.storage.session.remove(`tab-${tabId}`)
})

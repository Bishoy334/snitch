import { getDomain } from 'tldts'
import trackerDb from './data/trackers.json'

type Tracker = { company: string; category: string }
type TabReport = {
  site: string
  siteCompany: string | null
  requests: Record<string, { count: number; tracker: Tracker | null }>
  fingerprinting: { kind: string; host: string }[]
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

function newReport(site: string): TabReport {
  return { site, siteCompany: lookupTracker(site)?.company ?? null, requests: {}, fingerprinting: [] }
}

function save(tabId: number) {
  chrome.storage.session.set({ [`tab-${tabId}`]: reports.get(tabId) })
}

chrome.webRequest.onBeforeRequest.addListener(
  ({ tabId, url, type }) => {
    if (tabId < 0) return
    const host = new URL(url).hostname
    if (type === 'main_frame') {
      reports.set(tabId, newReport(host))
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

chrome.runtime.onMessage.addListener((msg: { fp?: string; host?: string }, sender) => {
  const tabId = sender.tab?.id
  if (!msg?.fp || tabId === undefined || tabId < 0) return
  let report = reports.get(tabId)
  if (!report) {
    // tab predates the extension (or SW restarted): start a report from the tab's URL
    let site = ''
    try {
      site = new URL(sender.tab!.url ?? '').hostname
    } catch {}
    report = newReport(site)
    reports.set(tabId, report)
  }
  const host = msg.host ?? ''
  if (!report.fingerprinting.some((f) => f.kind === msg.fp && f.host === host)) {
    report.fingerprinting.push({ kind: msg.fp, host })
    save(tabId)
  }
})

chrome.tabs.onRemoved.addListener((tabId) => {
  reports.delete(tabId)
  chrome.storage.session.remove(`tab-${tabId}`)
})

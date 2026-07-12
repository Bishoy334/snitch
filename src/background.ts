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

chrome.action.setBadgeBackgroundColor({ color: '#c03535' })

// cross-site ledger: which tracking companies appeared on which sites.
// Local only (storage.local), entries expire after 30 days.
const ledgerP: Promise<Record<string, Record<string, number>>> = chrome.storage.local
  .get('ledger')
  .then((r) => (r.ledger ?? {}) as Record<string, Record<string, number>>)

async function recordSighting(company: string, site: string) {
  const domain = getDomain(site)
  if (!domain) return
  const ledger = await ledgerP
  const sites = (ledger[company] ??= {})
  const t = Date.now()
  if (sites[domain] && t - sites[domain] < 3600_000) return
  sites[domain] = t
  for (const [d, ts] of Object.entries(sites)) if (t - ts > 30 * 86400_000) delete sites[d]
  chrome.storage.local.set({ ledger })
}

function save(tabId: number) {
  const report = reports.get(tabId)
  chrome.storage.session.set({ [`tab-${tabId}`]: report })
  const trackers = report
    ? Object.values(report.requests).filter(
        (r) => r.tracker && r.tracker.category !== 'Content' && r.tracker.company !== report.siteCompany,
      ).length
    : 0
  chrome.action.setBadgeText({ tabId, text: trackers ? String(Math.min(trackers, 99)) : '' })
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
    let entry = report.requests[host]
    if (!entry) {
      entry = report.requests[host] = { count: 0, tracker: lookupTracker(host) }
      if (entry.tracker && entry.tracker.category !== 'Content' && entry.tracker.company !== report.siteCompany)
        recordSighting(entry.tracker.company, report.site)
    }
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

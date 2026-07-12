export {}

type Tracker = { company: string; category: string }
type TabReport = {
  site: string
  requests: Record<string, { count: number; tracker: Tracker | null }>
}

const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
const key = `tab-${tab.id}`
const report = (await chrome.storage.session.get(key))[key] as TabReport | undefined

const site = document.getElementById('site')!
const list = document.getElementById('list')!

if (!report) {
  site.textContent = tab.url ?? ''
  list.innerHTML = '<div class="empty">No data yet — reload the page.</div>'
} else {
  site.textContent = report.site
  const entries = Object.entries(report.requests).sort(
    ([, a], [, b]) => Number(!!b.tracker) - Number(!!a.tracker) || b.count - a.count,
  )
  if (!entries.length) list.innerHTML = '<div class="empty">No third-party requests. Nice site.</div>'
  for (const [host, { count, tracker }] of entries) {
    const row = document.createElement('div')
    row.className = 'row'
    const label = tracker ? ` <span class="tag">${tracker.company} · ${tracker.category}</span>` : ''
    row.innerHTML = `<span class="host">${host}${label}</span><span class="count">${count}</span>`
    list.append(row)
  }
}

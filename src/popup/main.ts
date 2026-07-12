export {}

type Tracker = { company: string; category: string }
type Entry = { host: string; count: number; tracker: Tracker | null }
type TabReport = {
  site: string
  siteCompany: string | null
  requests: Record<string, { count: number; tracker: Tracker | null }>
}

// ponytail: v1 score = flat per-domain penalty by category; tune when real-site
// grades feel wrong. Content and same-company domains never count.
const WEIGHTS: Record<string, number> = {
  Advertising: 8,
  Analytics: 6,
  Social: 6,
  Email: 8,
  FingerprintingGeneral: 10,
  FingerprintingInvasive: 20,
  Cryptomining: 30,
}
const NICE: Record<string, string> = {
  FingerprintingGeneral: 'fingerprinting',
  FingerprintingInvasive: 'invasive fingerprinting',
  Cryptomining: 'cryptomining',
}
const niceCat = (c: string) => NICE[c] ?? c.toLowerCase()

const $ = (id: string) => document.getElementById(id)!

function gradeOf(score: number): string {
  return score >= 90 ? 'A' : score >= 75 ? 'B' : score >= 55 ? 'C' : score >= 35 ? 'D' : 'F'
}

function row(e: Entry, hot: boolean): HTMLElement {
  const div = document.createElement('div')
  div.className = 'row'
  const host = document.createElement('span')
  host.className = 'host'
  host.textContent = e.host
  div.append(host)
  if (e.tracker) {
    const chip = document.createElement('span')
    chip.className = hot ? 'chip hot' : 'chip'
    chip.textContent = `${e.tracker.company} · ${niceCat(e.tracker.category)}`
    div.append(chip)
  }
  const count = document.createElement('span')
  count.className = 'count'
  count.textContent = String(e.count)
  div.append(count)
  return div
}

function section(title: string, entries: Entry[], hot: boolean) {
  if (!entries.length) return
  const sec = document.createElement('div')
  sec.className = 'sec'
  sec.textContent = title
  $('list').append(sec, ...entries.map((e) => row(e, hot)))
}

const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
const key = `tab-${tab.id}`
const report = (await chrome.storage.session.get(key))[key] as TabReport | undefined

if (!report) {
  $('site').textContent = tab.url ? new URL(tab.url).hostname || tab.url : ''
  $('sub').textContent = 'Not inspected yet'
  $('why').textContent = 'Reload the page to start inspecting it.'
} else {
  const entries: Entry[] = Object.entries(report.requests)
    .map(([host, r]) => ({ host, ...r }))
    .sort((a, b) => b.count - a.count)

  const tracking = entries.filter(
    (e) => e.tracker && e.tracker.category !== 'Content' && e.tracker.company !== report.siteCompany,
  )
  const own = entries.filter((e) => e.tracker && e.tracker.company === report.siteCompany)
  const other = entries.filter((e) => !tracking.includes(e) && !own.includes(e))

  const penalty =
    tracking.reduce((sum, e) => sum + (WEIGHTS[e.tracker!.category] ?? 5), 0) +
    Math.min(other.length, 10)
  const score = Math.max(0, 100 - penalty)
  const grade = gradeOf(score)

  const seal = $('seal')
  seal.textContent = grade
  seal.className = `seal g-${grade}`

  $('site').textContent = report.site
  const companies = new Set(tracking.map((e) => e.tracker!.company))
  $('sub').textContent = tracking.length
    ? `${tracking.length} tracker${tracking.length > 1 ? 's' : ''} from ${companies.size} compan${companies.size > 1 ? 'ies' : 'y'}`
    : 'No known trackers'

  if (!tracking.length) {
    $('why').textContent = entries.length
      ? 'No known trackers on this page load — its third-party requests are content, not surveillance.'
      : 'This page loads everything itself. As private as it gets.'
  } else {
    const cats = [...new Set(tracking.map((e) => niceCat(e.tracker!.category)))]
    const names = [...companies].slice(0, 3).join(', ')
    let text = `${names}${companies.size > 3 ? ` and ${companies.size - 3} more` : ''} can watch you here (${cats.join(', ')}).`
    if (tracking.some((e) => e.tracker!.category.startsWith('Fingerprinting')))
      text += ' Includes a known fingerprinter.'
    $('why').textContent = text
  }

  section('Trackers', tracking, true)
  if (report.siteCompany) section(`Same company · ${report.siteCompany}`, own, false)
  section('Other third parties', other, false)

  if (!entries.length) {
    const empty = document.createElement('div')
    empty.className = 'empty'
    empty.textContent = 'No third-party requests on this page.'
    $('list').append(empty)
  }
}

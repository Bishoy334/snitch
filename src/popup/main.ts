import { getDomain } from 'tldts'

type Tracker = { company: string; category: string }
type Entry = { host: string; count: number; tracker: Tracker | null }
type TabReport = {
  site: string
  siteCompany: string | null
  requests: Record<string, { count: number; tracker: Tracker | null }>
  fingerprinting?: { kind: string; host: string }[]
}

const FP_LABELS: Record<string, string> = {
  canvas: 'Read pixels from a hidden canvas',
  webgl: 'Asked WebGL for your GPU model',
  audio: 'Probed your audio stack',
  fonts: 'Scanned your installed fonts',
}
const API_LABELS: Record<string, string> = {
  mic: 'Asked for your microphone',
  camera: 'Asked for your camera',
  geolocation: 'Asked for your location',
  clipboard: 'Read your clipboard',
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

function makeRow(label: string, chipText: string, hot: boolean, count?: number): HTMLElement {
  const div = document.createElement('div')
  div.className = 'row'
  const host = document.createElement('span')
  host.className = 'host'
  host.textContent = label
  div.append(host)
  if (chipText) {
    const chip = document.createElement('span')
    chip.className = hot ? 'chip hot' : 'chip'
    chip.textContent = chipText
    div.append(chip)
  }
  if (count !== undefined) {
    const c = document.createElement('span')
    c.className = 'count'
    c.textContent = String(count)
    div.append(c)
  }
  return div
}

function row(e: Entry, hot: boolean): HTMLElement {
  const chip = e.tracker ? `${e.tracker.company} · ${niceCat(e.tracker.category)}` : ''
  return makeRow(e.host, chip, hot, e.count)
}

function sectionTitle(title: string): HTMLElement {
  const sec = document.createElement('div')
  sec.className = 'sec'
  sec.textContent = title
  return sec
}

function section(title: string, entries: Entry[], hot: boolean) {
  if (!entries.length) return
  $('list').append(sectionTitle(title), ...entries.map((e) => row(e, hot)))
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

  const signals = report.fingerprinting ?? []
  const fp = signals.filter((f) => f.kind in FP_LABELS)
  const device = signals.filter((f) => f.kind in API_LABELS)
  const fpKinds = new Set(fp.map((f) => f.kind)).size
  const penalty =
    tracking.reduce((sum, e) => sum + (WEIGHTS[e.tracker!.category] ?? 5), 0) +
    Math.min(other.length, 10) +
    Math.min(fpKinds * 20, 40)
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
  if (fp.length) $('why').textContent += ' It also tried to fingerprint your device.'

  for (const [title, list, labels] of [
    ['Fingerprinting', fp, FP_LABELS],
    ['Device access', device, API_LABELS],
  ] as const) {
    if (!list.length) continue
    $('list').append(
      sectionTitle(title),
      ...list.map((f) =>
        makeRow(labels[f.kind] ?? f.kind, f.host && f.host !== report.site ? `by ${f.host}` : '', true),
      ),
    )
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

  // cookies & storage, queried live when the popup opens
  const siteDomain = getDomain(report.site)
  if (siteDomain) {
    const trackedDomains = [...new Set(tracking.map((e) => getDomain(e.host)))].filter(
      (d): d is string => !!d,
    )
    const [siteCookies, storage, ...trackerCookies] = await Promise.all([
      chrome.cookies.getAll({ domain: siteDomain }),
      chrome.tabs
        .sendMessage(tab.id!, { audit: true }, { frameId: 0 })
        .catch(() => null) as Promise<{ local: number; session: number } | null>,
      ...trackedDomains.map((d) => chrome.cookies.getAll({ domain: d })),
    ])

    const persistent = siteCookies.filter((c) => c.expirationDate).length
    const rows = [makeRow(`Set by ${siteDomain}`, `${persistent} persistent`, false, siteCookies.length)]
    trackedDomains
      .map((d, i) => [d, trackerCookies[i].length] as const)
      .filter(([, n]) => n > 0)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .forEach(([d, n]) => rows.push(makeRow(d, 'cookies on you', true, n)))
    if (storage) rows.push(makeRow('Local storage', `${storage.session} session`, false, storage.local))
    $('list').append(sectionTitle('Cookies & storage'), ...rows)
  }
}

import { getDomain } from 'tldts'

type Tracker = { company: string; category: string }
type Entry = { host: string; count: number; tracker: Tracker | null }
type TabReport = {
  site: string
  siteCompany: string | null
  requests: Record<string, { count: number; tracker: Tracker | null }>
  fingerprinting?: { kind: string; host: string }[]
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

const FP_LABELS: Record<string, string> = {
  canvas: 'Read pixels from a hidden canvas',
  webgl: 'Asked WebGL for your GPU model',
  audio: 'Probed your audio stack',
  fonts: 'Scanned your installed fonts',
}
const FP_PHRASES: Record<string, string> = {
  canvas: 'hidden canvas pixels',
  webgl: 'your GPU model',
  audio: 'your audio hardware',
  fonts: 'the fonts on your machine',
}
const API_LABELS: Record<string, string> = {
  mic: 'Asked for your microphone',
  camera: 'Asked for your camera',
  geolocation: 'Asked for your location',
  clipboard: 'Read your clipboard',
}
const API_PHRASES: Record<string, string> = {
  mic: 'your microphone',
  camera: 'your camera',
  geolocation: 'your location',
}

const ICONS: Record<string, string> = {
  eye: '<path d="M1.5 8s2.6-4.8 6.5-4.8S14.5 8 14.5 8s-2.6 4.8-6.5 4.8S1.5 8 1.5 8z"/><circle cx="8" cy="8" r="2.1"/>',
  fp: '<path d="M8 3.2a5 5 0 0 1 5 5c0 1.6-.2 3-.6 4.2"/><path d="M8 5.8A2.4 2.4 0 0 1 10.4 8.2c0 1.7-.3 3.2-.9 4.6"/><path d="M5.4 4.4A5 5 0 0 0 3 8.2c0 1.5.2 2.8.6 3.9"/><path d="M7.9 8.3c0 1.9-.4 3.5-1 4.7"/>',
  cookie: '<circle cx="8" cy="8" r="5.8"/><circle cx="6" cy="6.3" r="0.4"/><circle cx="9.6" cy="5.9" r="0.4"/><circle cx="10" cy="9.6" r="0.4"/><circle cx="6.4" cy="9.9" r="0.4"/>',
  radar: '<circle cx="8" cy="9.8" r="1.5"/><path d="M4.8 6.6a4.6 4.6 0 0 1 6.4 0"/><path d="M2.8 4.4a7.4 7.4 0 0 1 10.4 0"/>',
  shield: '<path d="M8 1.8l5 1.9v4.1c0 3.4-2.1 5.4-5 6.4-2.9-1-5-3-5-6.4V3.7z"/><path d="M5.8 8l1.6 1.6 2.8-3"/>',
}

const BRAND: Record<string, string> = {
  Google: '#4285f4',
  Meta: '#0866ff',
  Facebook: '#0866ff',
  Amazon: '#ff9900',
  'Amazon.com': '#ff9900',
  Microsoft: '#00a4ef',
  Twitter: '#1d9bf0',
  Adobe: '#eb1000',
  Oracle: '#c74634',
  Yandex: '#fc3f1d',
  comScore: '#7b6cd9',
}
function brandColor(name: string): string {
  if (BRAND[name]) return BRAND[name]
  let h = 0
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) % 360
  return `hsl(${h} 50% 42%)`
}

// Disconnect names some companies by domain ("Amazon.com"); trim for prose
const displayName = (company: string) => company.replace(/\.(com|net|org|co)$/i, '')

const $ = (id: string) => document.getElementById(id)!

function el(tag: string, cls: string, text?: string): HTMLElement {
  const e = document.createElement(tag)
  if (cls) e.className = cls
  if (text !== undefined) e.textContent = text
  return e
}

function joinHuman(parts: string[]): string {
  if (parts.length <= 1) return parts[0] ?? ''
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`
}

function span(seconds: number): string {
  const days = seconds / 86400
  if (days >= 548) return `${Math.round(days / 365)} years`
  if (days >= 300) return 'a year'
  if (days >= 45) return `${Math.round(days / 30)} months`
  if (days >= 25) return 'a month'
  if (days >= 2) return `${Math.round(days)} days`
  return 'a day'
}

function verdictLine(...parts: (string | HTMLElement)[]) {
  $('verdict').append(...parts)
}
const bold = (t: string) => el('b', '', t)

function story(sev: 'b' | 'w' | 'g', icon: string, head: string, note?: string) {
  const item = el('div', 'item')
  const ico = el('span', `ico ico-${sev}`)
  ico.innerHTML = `<svg viewBox="0 0 16 16">${ICONS[icon]}</svg>`
  item.append(ico)
  const txt = el('div', 'txt')
  txt.append(el('b', '', head))
  if (note) txt.append(el('div', 'note', note))
  item.append(txt)
  $('story').append(item)
}

function makeRow(label: string, chipText: string, hot: boolean, count?: number): HTMLElement {
  const div = el('div', 'row')
  div.append(el('span', 'host', label))
  if (chipText) div.append(el('span', hot ? 'chip hot' : 'chip', chipText))
  if (count !== undefined) div.append(el('span', 'count', String(count)))
  return div
}

function section(title: string, rows: HTMLElement[]) {
  if (!rows.length) return
  $('list').append(el('div', 'sec', title), ...rows)
}

function sitePhoto(site: string) {
  chrome.tabs
    .captureVisibleTab({ format: 'jpeg', quality: 60 })
    .then((url) => {
      const img = document.createElement('img')
      img.src = url
      img.alt = ''
      $('shot').append(img)
    })
    .catch(() => {
      const letter = el('div', 'letter', (site[0] ?? '?').toUpperCase())
      letter.style.background = `linear-gradient(135deg, ${brandColor(site)}, color-mix(in srgb, ${brandColor(site)} 55%, #000))`
      $('shot').append(letter)
    })
}

function setDial(score: number | null) {
  const gauge = $('gauge')
  if (score === null) {
    $('score').textContent = '·'
    $('gword').textContent = 'Not inspected'
    return
  }
  const grade = score >= 90 ? 'A' : score >= 75 ? 'B' : score >= 55 ? 'C' : score >= 35 ? 'D' : 'F'
  const words: Record<string, string> = { A: 'Excellent', B: 'Good', C: 'Okay', D: 'Poor', F: 'Awful' }
  gauge.className = `gauge g-${grade}`
  $('score').textContent = String(score)
  $('gword').textContent = words[grade]
  const CIRC = 201
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      ;($('prog') as unknown as SVGCircleElement).style.strokeDashoffset = String(CIRC * (1 - score / 100))
    }),
  )
}

const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
const key = `tab-${tab.id}`
const report = (await chrome.storage.session.get(key))[key] as TabReport | undefined
const tabHost = tab.url ? new URL(tab.url).hostname : ''

sitePhoto(report?.site || tabHost)

if (!report) {
  setDial(null)
  $('siteline').append(bold(tabHost || tab.url || ''))
  verdictLine('Reload the page and this report fills in.')
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
  const fpKinds = [...new Set(fp.map((f) => f.kind))]

  // cookies & storage, queried live so the story can use real lifetimes
  const siteDomain = getDomain(report.site)
  const trackedDomains = siteDomain
    ? [...new Set(tracking.map((e) => getDomain(e.host)))].filter((d): d is string => !!d)
    : []
  const [siteCookies, storage, ...trackerCookies] = siteDomain
    ? await Promise.all([
        chrome.cookies.getAll({ domain: siteDomain }),
        chrome.tabs
          .sendMessage(tab.id!, { audit: true }, { frameId: 0 })
          .catch(() => null) as Promise<{ local: number; session: number } | null>,
        ...trackedDomains.map((d) => chrome.cookies.getAll({ domain: d })),
      ])
    : [[] as chrome.cookies.Cookie[], null]

  const cookieHolders = trackedDomains
    .map((d, i) => ({ domain: d, cookies: trackerCookies[i] ?? [] }))
    .filter((h) => h.cookies.length > 0)
    .sort((a, b) => b.cookies.length - a.cookies.length)
  const now = Date.now() / 1000
  const longestLife = Math.max(
    0,
    ...cookieHolders.flatMap((h) => h.cookies.map((c) => (c.expirationDate ?? now) - now)),
  )

  // score
  const penalty =
    tracking.reduce((sum, e) => sum + (WEIGHTS[e.tracker!.category] ?? 5), 0) +
    Math.min(other.length, 10) +
    Math.min(fpKinds.length * 20, 40)
  const score = Math.max(0, 100 - penalty)
  setDial(score)

  // site line
  const byCompany = new Map<string, number>()
  for (const e of tracking)
    byCompany.set(e.tracker!.company, (byCompany.get(e.tracker!.company) ?? 0) + e.count)
  const companies = [...byCompany.entries()].sort((a, b) => b[1] - a[1]).map(([name]) => displayName(name))
  $('siteline').append(
    bold(report.site),
    tracking.length
      ? ` · ${tracking.length} tracker${tracking.length > 1 ? 's' : ''} from ${companies.length} compan${companies.length > 1 ? 'ies' : 'y'}`
      : ' · no known trackers',
  )

  // verdict
  if (tracking.length && fpKinds.length) {
    verdictLine(
      'This page shared your visit with ',
      bold(companies.length === 1 ? companies[0] : `${companies.length} companies`),
      ' and tried to ',
      bold('fingerprint your device'),
      '.',
    )
  } else if (tracking.length) {
    verdictLine(
      'This page shared your visit with ',
      bold(companies.length === 1 ? companies[0] : `${companies.length} companies`),
      '.',
    )
  } else if (fpKinds.length) {
    verdictLine('This page tried to ', bold('fingerprint your device'), '.')
  } else if (entries.length) {
    verdictLine('No tracking spotted. The other sites this page talks to look harmless.')
  } else {
    verdictLine('This page kept everything to itself.')
  }

  // company pills
  for (const name of companies.slice(0, 4)) {
    const pill = el('span', 'pill')
    const mono = el('span', 'mono', name[0]?.toUpperCase() ?? '?')
    mono.style.background = brandColor(name)
    pill.append(mono, name)
    $('who').append(pill)
  }
  if (companies.length > 4) $('who').append(el('span', 'more', `+${companies.length - 4} more`))

  // story
  if (tracking.length) {
    const head =
      companies.length <= 2
        ? `${joinHuman(companies)} saw you on this page.`
        : `${companies[0]}, ${companies[1]} and ${companies.length - 2} other compan${companies.length - 2 > 1 ? 'ies' : 'y'} saw you on this page.`
    const cats = new Set(tracking.map((e) => e.tracker!.category))
    const note = cats.has('Advertising')
      ? 'This feeds the profiles they use to pick ads for you.'
      : cats.has('Social')
        ? 'Their embeds report your visit whether or not you touch them.'
        : 'They log what you do here and report it back.'
    story('b', 'eye', head, note)
  }

  if (fpKinds.length) {
    story(
      'b',
      'fp',
      'Tried to fingerprint your device.',
      `Checked ${joinHuman(fpKinds.map((k) => FP_PHRASES[k]))}. That works even in private mode.`,
    )
  }

  if (cookieHolders.length && longestLife > 86400) {
    const head =
      cookieHolders.length === 1
        ? `${cookieHolders[0].domain} left cookies that last ${span(longestLife)}.`
        : `${cookieHolders.length} trackers left cookies that last up to ${span(longestLife)}.`
    story('w', 'cookie', head)
  }

  const asked = [...new Set(device.map((d) => d.kind))].filter((k) => k in API_PHRASES)
  if (asked.length) story('b', 'radar', `Asked for ${joinHuman(asked.map((k) => API_PHRASES[k]))}.`)
  if (device.some((d) => d.kind === 'clipboard')) story('b', 'radar', 'Read your clipboard.')

  // one true reassurance line
  if (!tracking.length && !fpKinds.length && !device.length && !entries.length) {
    story('g', 'shield', 'No third parties, no trackers, no snooping.')
  } else if (!fpKinds.length && !device.length) {
    story('g', 'shield', 'No fingerprinting, and it never asked for your camera, mic or location.')
  } else if (!device.length) {
    story('g', 'shield', 'Never asked for your camera, mic or location.')
  } else if (!fpKinds.length) {
    story('g', 'shield', 'No device fingerprinting detected.')
  }

  // full technical list
  $('details').hidden = false
  section(
    'Fingerprinting',
    fp.map((f) =>
      makeRow(FP_LABELS[f.kind] ?? f.kind, f.host && f.host !== report.site ? `by ${f.host}` : '', true),
    ),
  )
  section(
    'Device access',
    device.map((f) =>
      makeRow(API_LABELS[f.kind] ?? f.kind, f.host && f.host !== report.site ? `by ${f.host}` : '', true),
    ),
  )
  const entryRow = (e: Entry, hot: boolean) =>
    makeRow(e.host, e.tracker ? `${e.tracker.company} · ${niceCat(e.tracker.category)}` : '', hot, e.count)
  section('Trackers', tracking.map((e) => entryRow(e, true)))
  if (report.siteCompany) section(`Same company · ${report.siteCompany}`, own.map((e) => entryRow(e, false)))
  section('Other third parties', other.map((e) => entryRow(e, false)))
  if (siteDomain) {
    const rows = [makeRow(`Set by ${siteDomain}`, `${siteCookies.filter((c) => c.expirationDate).length} persistent`, false, siteCookies.length)]
    cookieHolders.slice(0, 6).forEach((h) => rows.push(makeRow(h.domain, 'cookies on you', true, h.cookies.length)))
    if (storage) rows.push(makeRow('Local storage', `${storage.session} session`, false, storage.local))
    section('Cookies & storage', rows)
  }
  if (!entries.length) $('list').append(el('div', 'empty', 'No third-party requests on this page.'))
}

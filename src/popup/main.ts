import { getDomain, getDomainWithoutSuffix } from 'tldts'

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
  canvas: 'Read a hidden canvas',
  webgl: 'Asked for your GPU model',
  audio: 'Probed your audio stack',
  fonts: 'Scanned your fonts',
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

// famous tracking-cookie names -> plain meaning (prefix match, bundled, local)
const KNOWN_COOKIES: [string, string][] = [
  ['_ga', 'Google Analytics ID'],
  ['_gid', 'Google Analytics session ID'],
  ['_gcl_', 'Google ad-click ID'],
  ['_fbp', 'Meta pixel ID'],
  ['_fbc', 'Meta ad-click ID'],
  ['IDE', 'Google ad ID'],
  ['MUID', 'Microsoft ID'],
  ['_uet', 'Microsoft Ads ID'],
  ['_ttp', 'TikTok pixel ID'],
  ['personalization_id', 'X (Twitter) ID'],
  ['li_sugr', 'LinkedIn ID'],
  ['ajs_anonymous_id', 'Segment ID'],
  ['amplitude_id', 'Amplitude ID'],
  ['_hj', 'Hotjar ID'],
  ['_pin_unauth', 'Pinterest ID'],
  ['_scid', 'Snapchat ID'],
]

// long, random-looking, no spaces: probably an identifier, said with a hedge
function looksId(v: string): boolean {
  return v.length >= 16 && v.length <= 200 && /^[\w.:%+/=-]+$/.test(v) && /\d/.test(v) && /[a-zA-Z]/.test(v)
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

function monogram(cls: string, name: string): HTMLElement {
  const m = el('span', cls, (name[0] ?? '?').toUpperCase())
  m.style.background = brandColor(name)
  return m
}

function favicon(url: string | undefined, site: string) {
  if (url && /^https?:/.test(url)) {
    const img = document.createElement('img')
    img.alt = ''
    img.src = chrome.runtime.getURL(`/_favicon/?pageUrl=${encodeURIComponent(url)}&size=64`)
    img.onerror = () => {
      img.remove()
      $('fav').append(monogram('letter', site))
    }
    $('fav').append(img)
  } else {
    $('fav').append(monogram('letter', site || '?'))
  }
}

function story(sev: 'b' | 'w' | 'g', icon: string, head: string, note?: string, tip?: string) {
  const item = el('div', 'item')
  const ico = el('span', `ico ico-${sev}`)
  ico.innerHTML = `<svg viewBox="0 0 16 16">${ICONS[icon]}</svg>`
  item.append(ico)
  const txt = el('div', 'txt')
  const head_ = el('span', '')
  head_.append(el('b', '', head))
  if (tip) {
    const btn = el('button', 'info', 'i') as HTMLButtonElement
    btn.setAttribute('aria-label', 'More about this')
    const tipEl = el('div', 'note', tip)
    tipEl.hidden = true
    btn.addEventListener('click', () => {
      tipEl.hidden = !tipEl.hidden
      btn.classList.toggle('on', !tipEl.hidden)
    })
    head_.append(btn)
    txt.append(head_)
    if (note) txt.append(el('div', 'note', note))
    txt.append(tipEl)
  } else {
    txt.append(head_)
    if (note) txt.append(el('div', 'note', note))
  }
  item.append(txt)
  $('story').append(item)
}

function makeRow(label: string, chipText: string, count?: number): HTMLElement {
  const div = el('div', 'row')
  div.append(el('span', 'host', label))
  if (chipText) div.append(el('span', 'chip', chipText))
  if (count !== undefined) div.append(el('span', 'count', String(count)))
  return div
}

// actor card: header + always-visible meaning lines, hostnames on expand
function card(opts: {
  name: string
  mono?: string
  catText?: string
  requests?: number
  subs?: string[]
  hosts: { label: string; count?: number }[]
}): HTMLElement {
  const d = document.createElement('details')
  d.className = 'card'
  const s = document.createElement('summary')
  const head = el('div', 'chead')
  if (opts.mono !== undefined) head.append(monogram('mono', opts.mono || opts.name))
  head.append(el('span', 'cname', opts.name))
  if (opts.catText) head.append(el('span', 'ccat', opts.catText))
  if (opts.requests !== undefined)
    head.append(el('span', 'creq', `${opts.requests} request${opts.requests === 1 ? '' : 's'}`))
  s.append(head)
  for (const sub of opts.subs ?? []) s.append(el('div', 'csub', sub))
  d.append(s)
  const hosts = el('div', 'hosts')
  for (const h of opts.hosts) hosts.append(makeRow(h.label, '', h.count))
  d.append(hosts)
  return d
}

function setDial(score: number | null) {
  if (score === null) {
    $('score').textContent = '·'
    $('gword').textContent = 'Not inspected'
    return
  }
  const grade = score >= 90 ? 'A' : score >= 75 ? 'B' : score >= 55 ? 'C' : score >= 35 ? 'D' : 'F'
  const words: Record<string, string> = { A: 'Excellent', B: 'Good', C: 'Okay', D: 'Poor', F: 'Awful' }
  $('gauge').className = `gauge g-${grade}`
  $('score').textContent = String(score)
  $('gword').textContent = words[grade]
  const CIRC = 170
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      ;($('prog') as unknown as SVGCircleElement).style.strokeDashoffset = String(CIRC * (1 - score / 100))
    }),
  )
}

const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
const key = `tab-${tab.id}`
const report = (await chrome.storage.session.get(key))[key] as TabReport | undefined
const tabUrl = tab.url ?? ''
const tabHost = /^https?:/.test(tabUrl) ? new URL(tabUrl).hostname : ''
const restricted = !tabHost

favicon(tabUrl, report?.site || tabHost)

if (restricted) {
  $('site').textContent = 'This page is off limits'
  $('gauge').hidden = true
  verdictLine("Chrome doesn't let extensions see its own pages, so there's nothing to inspect here.")
} else if (!report) {
  setDial(null)
  $('site').textContent = tabHost
  $('stat').textContent = 'Not inspected yet'
  verdictLine('This tab was open before the inspector arrived.')
  const btn = el('button', '', 'Reload page') as HTMLButtonElement
  btn.addEventListener('click', () => {
    chrome.tabs.reload(tab.id!)
    window.close()
  })
  $('cta').append(btn)
} else {
  const entries: Entry[] = Object.entries(report.requests)
    .map(([host, r]) => ({ host, ...r }))
    .sort((a, b) => b.count - a.count)

  // same brand on another TLD (dailymail.com -> dailymail.co.uk) is the site itself
  const brand = getDomainWithoutSuffix(report.site)
  const sameBrand = (host: string) => !!brand && getDomainWithoutSuffix(host) === brand
  const own = entries.filter(
    (e) => (e.tracker && e.tracker.company === report.siteCompany) || sameBrand(e.host),
  )
  const tracking = entries.filter(
    (e) => e.tracker && e.tracker.category !== 'Content' && !own.includes(e),
  )
  const content = entries.filter((e) => e.tracker?.category === 'Content' && !own.includes(e))
  const unknown = entries.filter((e) => !e.tracker && !own.includes(e))

  const signals = report.fingerprinting ?? []
  const seen = new Set<string>()
  const deduped = signals.filter((f) => !seen.has(`${f.kind}|${f.host}`) && seen.add(`${f.kind}|${f.host}`))
  const fp = deduped.filter((f) => f.kind in FP_LABELS)
  const device = deduped.filter((f) => f.kind in API_LABELS)
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
          .catch(() => null) as Promise<{ local: number; session: number; ids?: number } | null>,
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
    Math.min(content.length + unknown.length, 10) +
    Math.min(fpKinds.length * 20, 40)
  const score = Math.max(0, 100 - penalty)
  setDial(score)

  // hero text
  const byCompany = new Map<string, { total: number; cats: Set<string>; hosts: Entry[] }>()
  const rawOf = new Map<string, string>()
  for (const e of tracking) {
    const name = displayName(e.tracker!.company)
    rawOf.set(name, e.tracker!.company)
    const g = byCompany.get(name) ?? { total: 0, cats: new Set<string>(), hosts: [] }
    g.total += e.count
    g.cats.add(niceCat(e.tracker!.category))
    g.hosts.push(e)
    byCompany.set(name, g)
  }
  const companies = [...byCompany.entries()].sort((a, b) => b[1].total - a[1].total)
  $('site').textContent = report.site
  $('stat').textContent = tracking.length
    ? `${tracking.length} tracker${tracking.length > 1 ? 's' : ''} · ${companies.length} compan${companies.length > 1 ? 'ies' : 'y'}`
    : 'No known trackers'

  // verdict
  const names = companies.map(([n]) => n)
  if (tracking.length && fpKinds.length) {
    verdictLine(
      'This page shared your visit with ',
      bold(names.length === 1 ? names[0] : `${names.length} companies`),
      ' and tried to ',
      bold('fingerprint your device'),
      '.',
    )
  } else if (tracking.length) {
    verdictLine(
      'This page shared your visit with ',
      bold(names.length === 1 ? names[0] : `${names.length} companies`),
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
  for (const name of names.slice(0, 4)) {
    const pill = el('span', 'pill')
    pill.append(monogram('mono', name), name)
    $('who').append(pill)
  }
  if (names.length > 4) $('who').append(el('span', 'more', `+${names.length - 4} more`))

  // story: fingerprinting, trackers, device, cookies, one green line
  if (fpKinds.length) {
    story(
      'b',
      'fp',
      'Tried to fingerprint your device.',
      `Checked ${joinHuman(fpKinds.map((k) => FP_PHRASES[k]))}.`,
      "A fingerprint identifies your device without cookies, even in private mode. Clearing cookies won't stop it.",
    )
  }

  if (tracking.length) {
    const head =
      names.length <= 2
        ? `${joinHuman(names)} saw you on this page.`
        : `${names[0]}, ${names[1]} and ${names.length - 2} other compan${names.length - 2 > 1 ? 'ies' : 'y'} saw you on this page.`
    const cats = new Set(tracking.map((e) => e.tracker!.category))
    const note = cats.has('Advertising')
      ? 'This feeds the profiles they use to pick ads for you.'
      : cats.has('Social')
        ? 'Their embeds report your visit whether or not you touch them.'
        : 'They log what you do here and report it back.'
    story('b', 'eye', head, note)
  }

  const asked = [...new Set(device.map((d) => d.kind))].filter((k) => k in API_PHRASES)
  if (asked.length) story('b', 'radar', `Asked for ${joinHuman(asked.map((k) => API_PHRASES[k]))}.`)
  if (device.some((d) => d.kind === 'clipboard')) story('b', 'radar', 'Read your clipboard.')

  if (cookieHolders.length && longestLife > 86400) {
    const head =
      cookieHolders.length === 1
        ? `${cookieHolders[0].domain} left cookies that last ${span(longestLife)}.`
        : `${cookieHolders.length} trackers left cookies that last up to ${span(longestLife)}.`
    story('w', 'cookie', head)
  }

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

  // the one control: wipe this site's data whenever you leave it
  if (siteDomain) {
    const forget = ((await chrome.storage.local.get('forget')).forget ?? {}) as Record<string, boolean>
    const row = el('label', 'switchrow')
    const input = document.createElement('input')
    input.type = 'checkbox'
    input.checked = !!forget[siteDomain]
    input.addEventListener('change', () => {
      if (input.checked) forget[siteDomain] = true
      else delete forget[siteDomain]
      chrome.storage.local.set({ forget })
    })
    row.append(input, el('span', '', 'Forget this site when I close it'))
    $('cta').append(row)
  }

  // Level 2: one card per actor, everything we know about each in one place
  $('details').hidden = false
  const list = $('list')

  const ledger = ((await chrome.storage.local.get('ledger')).ledger ?? {}) as Record<
    string,
    Record<string, number>
  >
  const holderCompany = new Map<string, { domain: string; life: number }>()
  for (const h of cookieHolders) {
    const e = tracking.find((t) => getDomain(t.host) === h.domain)
    if (!e) continue
    const name = displayName(e.tracker!.company)
    if (holderCompany.has(name)) continue
    holderCompany.set(name, {
      domain: h.domain,
      life: Math.max(0, ...h.cookies.map((c) => (c.expirationDate ?? now) - now)),
    })
  }

  if (!companies.length) list.append(el('div', 'fact good', 'No one on this page tracks you across sites.'))

  for (const [name, g] of companies) {
    const others = Object.keys(ledger[rawOf.get(name) ?? name] ?? {}).filter((d) => d !== siteDomain).length
    const holder = holderCompany.get(name)
    const subs: string[] = []
    if (others) {
      subs.push(
        `Seen you on ${others} other site${others > 1 ? 's' : ''} recently${holder ? ' · its cookie connects them' : ''}`,
      )
    } else {
      subs.push('Only seen you here so far')
    }
    if (holder && holder.life > 86400 && !others) subs.push(`Left a cookie that lasts ${span(holder.life)}`)
    list.append(
      card({
        name,
        mono: name,
        catText: [...g.cats].join(', '),
        requests: g.total,
        subs,
        hosts: g.hosts.map((e) => ({ label: e.host, count: e.count })),
      }),
    )
  }

  // the site itself
  const siteName = displayName(report.siteCompany ?? brand ?? report.site)
  let lookalikes = 0
  let ordinary = 0
  const knownNames: string[] = []
  for (const c of siteCookies) {
    const known = KNOWN_COOKIES.find(([prefix]) => c.name.startsWith(prefix))
    const life = (c.expirationDate ?? now) - now
    if (known) knownNames.push(known[1])
    else if (life > 30 * 86400 && looksId(c.value)) lookalikes++
    else ordinary++
  }
  const idCount = lookalikes + (storage?.ids ?? 0)
  const boringStore = storage ? Math.max(0, storage.local - (storage.ids ?? 0)) : 0
  const siteSubs: string[] = []
  if (idCount) siteSubs.push(`Can recognize you when you return · ${idCount} saved identifier${idCount > 1 ? 's' : ''}`)
  if (knownNames.length) siteSubs.push(`Includes a ${[...new Set(knownNames)].slice(0, 2).join(' and a ')}`)
  if (ordinary || boringStore) siteSubs.push(`${ordinary} cookies · ${boringStore} storage items · housekeeping`)
  const ownTotal = own.reduce((s, e) => s + e.count, 0)
  if (siteSubs.length || own.length) {
    list.append(
      card({
        name: `${siteName} · this site`,
        mono: siteName,
        requests: ownTotal || undefined,
        subs: siteSubs,
        hosts: own.map((e) => ({ label: e.host, count: e.count })),
      }),
    )
  }

  // everything that is neither tracking nor the site
  const rest = [...content, ...unknown]
  if (rest.length) {
    list.append(
      card({
        name: 'Everything else',
        catText: 'fonts, CDNs, embeds',
        requests: rest.reduce((s, e) => s + e.count, 0),
        hosts: rest
          .sort((a, b) => b.count - a.count)
          .map((e) => ({
            label: e.tracker ? `${e.host} (${displayName(e.tracker.company)})` : e.host,
            count: e.count,
          })),
      }),
    )
  }

  if (!entries.length && !siteCookies.length) list.append(el('div', 'empty', 'No third-party requests on this page.'))
}

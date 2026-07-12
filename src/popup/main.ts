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

// two-line row for "saved in your browser": what it is, then what it means
function savedRow(label: string, sub: string, dot?: 'b' | 'w'): HTMLElement {
  const div = el('div', 'saved')
  if (dot) div.append(el('span', `rdot rdot-${dot}`))
  const txt = el('div', '')
  txt.append(el('div', 'slabel', label))
  if (sub) txt.append(el('div', 'ssub', sub))
  div.append(txt)
  return div
}

function makeRow(label: string, chipText: string, count?: number, dot?: 'b' | 'w'): HTMLElement {
  const div = el('div', 'row')
  if (dot) div.append(el('span', `rdot rdot-${dot}`))
  div.append(el('span', 'host', label))
  if (chipText) div.append(el('span', 'chip', chipText))
  if (count !== undefined) div.append(el('span', 'count', String(count)))
  return div
}

function sec(title: string, badge?: string): HTMLElement {
  return el('div', 'sec', badge ? `${title} · ${badge}` : title)
}

// company card: header row, hostnames on expand
function card(opts: {
  name: string
  mono?: string
  catText?: string
  redDot?: boolean
  requests: number
  hosts: { label: string; count?: number }[]
}): HTMLElement {
  const d = document.createElement('details')
  d.className = 'card'
  const s = document.createElement('summary')
  if (opts.mono !== undefined) s.append(monogram('mono', opts.mono || opts.name))
  s.append(el('span', 'cname', opts.name))
  if (opts.catText) {
    const cat = el('span', 'ccat')
    cat.append(el('span', `dot${opts.redDot ? '' : ' neutral'}`), opts.catText)
    s.append(cat)
  }
  s.append(el('span', 'creq', `${opts.requests} request${opts.requests === 1 ? '' : 's'}`))
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
  for (const e of tracking) {
    const name = displayName(e.tracker!.company)
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
      `Checked ${joinHuman(fpKinds.map((k) => FP_PHRASES[k]))}. That works even in private mode.`,
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

  // the one action: wipe what this page (and its trackers) stored
  if (siteCookies.length || cookieHolders.length || (storage?.local ?? 0) > 0) {
    const btn = el('button', '', 'Forget this site') as HTMLButtonElement
    let cleared = false
    btn.addEventListener('click', async () => {
      if (cleared) {
        chrome.tabs.reload(tab.id!)
        window.close()
        return
      }
      btn.disabled = true
      btn.textContent = 'Clearing…'
      const origins: [string, ...string[]] = [
        new URL(tabUrl).origin,
        ...cookieHolders.map((h) => `https://${h.domain}`),
      ]
      await chrome.browsingData.remove(
        { origins },
        { cookies: true, localStorage: true, indexedDB: true, cacheStorage: true },
      )
      cleared = true
      btn.disabled = false
      btn.textContent = 'Forgotten. Reload page'
    })
    $('cta').append(btn)
  }

  // Level 2: where your data goes
  $('details').hidden = false
  const list = $('list')

  // 1. who got your visit
  if (companies.length) {
    list.append(sec('Who got your visit', `${companies.length} compan${companies.length > 1 ? 'ies' : 'y'}`))
    for (const [name, g] of companies) {
      list.append(
        card({
          name,
          mono: name,
          catText: [...g.cats].join(', '),
          redDot: true,
          requests: g.total,
          hosts: g.hosts.map((e) => ({ label: e.host, count: e.count })),
        }),
      )
    }
  }

  const quietCards: HTMLElement[] = []
  if (own.length) {
    quietCards.push(
      card({
        name: `${displayName(report.siteCompany ?? brand ?? report.site)}'s own services`,
        catText: 'same owner as this site',
        requests: own.reduce((s, e) => s + e.count, 0),
        hosts: own.map((e) => ({ label: e.host, count: e.count })),
      }),
    )
  }
  if (content.length) {
    quietCards.push(
      card({
        name: 'Content delivery',
        catText: 'not tracking',
        requests: content.reduce((s, e) => s + e.count, 0),
        hosts: content.map((e) => ({
          label: e.tracker ? `${e.host} (${displayName(e.tracker.company)})` : e.host,
          count: e.count,
        })),
      }),
    )
  }
  if (unknown.length) {
    quietCards.push(
      card({
        name: 'Unrecognized domains',
        catText: 'not classified',
        requests: unknown.reduce((s, e) => s + e.count, 0),
        hosts: unknown.map((e) => ({ label: e.host, count: e.count })),
      }),
    )
  }
  // 2. what's saved in your browser, by meaning
  const domainInfo = new Map<string, { company: string; cats: Set<string> }>()
  for (const e of tracking) {
    const d = getDomain(e.host)
    if (!d) continue
    const info = domainInfo.get(d) ?? { company: displayName(e.tracker!.company), cats: new Set<string>() }
    info.cats.add(e.tracker!.category)
    domainInfo.set(d, info)
  }

  const siteName = displayName(report.siteCompany ?? brand ?? report.site)
  const savedRows: HTMLElement[] = []
  for (const h of cookieHolders.slice(0, 5)) {
    const who = domainInfo.get(h.domain)?.company ?? h.domain
    const life = Math.max(0, ...h.cookies.map((c) => (c.expirationDate ?? now) - now))
    savedRows.push(
      savedRow(
        `${who} can spot you on other sites`,
        `its cookie here rides along wherever it runs${life > 86400 ? ` · lasts ${span(life)}` : ''}`,
        'b',
      ),
    )
  }
  let lookalikes = 0
  let ordinary = 0
  for (const c of siteCookies) {
    const known = KNOWN_COOKIES.find(([prefix]) => c.name.startsWith(prefix))
    const life = (c.expirationDate ?? now) - now
    if (known && savedRows.length < 10) {
      savedRows.push(savedRow(known[1], life > 86400 ? `cookie ${c.name} · lasts ${span(life)}` : `cookie ${c.name}`, 'w'))
    } else if (!known && life > 30 * 86400 && looksId(c.value)) {
      lookalikes++
    } else if (!known) {
      ordinary++
    }
  }
  const idCount = lookalikes + (storage?.ids ?? 0)
  if (idCount) {
    const where = [
      lookalikes ? `${lookalikes} cookie${lookalikes > 1 ? 's' : ''}` : '',
      storage?.ids ? `${storage.ids} in local storage` : '',
    ]
      .filter(Boolean)
      .join(', ')
    savedRows.push(
      savedRow(
        `${siteName} can recognize you when you come back`,
        `${idCount} saved identifier${idCount > 1 ? 's' : ''} (${where}), even if you log out`,
        'w',
      ),
    )
  }
  const boringStore = storage ? Math.max(0, storage.local - (storage.ids ?? 0)) : 0
  if (ordinary || boringStore) {
    const parts = []
    if (ordinary) parts.push(`${ordinary} cookie${ordinary > 1 ? 's' : ''}`)
    if (boringStore) parts.push(`${boringStore} storage item${boringStore > 1 ? 's' : ''}`)
    savedRows.push(savedRow('The rest is housekeeping', `${parts.join(' and ')} for logins, settings, cache`))
  }
  if (savedRows.length) list.append(sec('Saved in your browser'), ...savedRows)

  // 3. how you're followed across sites, answered from the local ledger:
  // which of this page's trackers has this browser seen on other sites?
  const ledger = ((await chrome.storage.local.get('ledger')).ledger ?? {}) as Record<
    string,
    Record<string, number>
  >
  const rawTotals = new Map<string, number>()
  for (const e of tracking) rawTotals.set(e.tracker!.company, (rawTotals.get(e.tracker!.company) ?? 0) + e.count)
  const hasIdCookie = new Set(cookieHolders.map((h) => domainInfo.get(h.domain)?.company).filter(Boolean))
  const follow: HTMLElement[] = []
  for (const [raw] of [...rawTotals.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3)) {
    const name = displayName(raw)
    const others = Object.keys(ledger[raw] ?? {}).filter((d) => d !== siteDomain).length
    const f = el('div', 'fact')
    if (others) {
      f.append(
        bold(name),
        ` has seen you on ${others} other site${others > 1 ? 's' : ''} recently`,
        hasIdCookie.has(name) ? ', and holds an ID cookie that connects those visits.' : '.',
      )
    } else {
      f.append(bold(name), ' has only seen you here so far. If it appears on other sites you visit, it can connect them.')
    }
    follow.push(f)
  }
  if (fpKinds.length)
    follow.push(
      el('div', 'fact', "A fingerprint identifies your device without cookies. Clearing them won't stop it."),
    )
  if (!follow.length) follow.push(el('div', 'fact good', 'No one on this page tracks you across sites.'))
  list.append(sec('Following you across sites'))
  const wrap = el('div', 'facts')
  wrap.append(...follow)
  list.append(wrap)

  // leftovers last: meaning above, inventory below
  if (quietCards.length) {
    list.append(sec('Everything else'), ...quietCards)
  }

  if (!entries.length && !siteCookies.length) list.append(el('div', 'empty', 'No third-party requests on this page.'))
}

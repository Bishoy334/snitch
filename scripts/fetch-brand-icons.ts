// Build-time only: bundle favicons for the tracker companies users will
// actually see, so the popup can show real logos with zero runtime network.
// Run with: bun scripts/fetch-brand-icons.ts   (commit the output)
const BRANDS: Record<string, string> = {
  Google: 'google.com',
  Facebook: 'facebook.com',
  Meta: 'facebook.com',
  'Amazon.com': 'amazon.com',
  Microsoft: 'microsoft.com',
  Adobe: 'adobe.com',
  Oracle: 'oracle.com',
  comScore: 'comscore.com',
  Criteo: 'criteo.com',
  ZetaGlobal: 'zetaglobal.com',
  OneTrust: 'onetrust.com',
  Twitter: 'x.com',
  TikTok: 'tiktok.com',
  Yandex: 'yandex.com',
  Hotjar: 'hotjar.com',
  LinkedIn: 'linkedin.com',
  Pinterest: 'pinterest.com',
  'Snap Inc.': 'snap.com',
  Cloudflare: 'cloudflare.com',
  'Vox Media': 'voxmedia.com',
  Chartbeat: 'chartbeat.com',
  Nielsen: 'nielsen.com',
  Quantcast: 'quantcast.com',
  PubMatic: 'pubmatic.com',
  Taboola: 'taboola.com',
  Outbrain: 'outbrain.com',
  'The Trade Desk': 'thetradedesk.com',
  Index_Exchange: 'indexexchange.com',
  Hearst: 'hearst.com',
  reddit: 'reddit.com',
  Automattic: 'wordpress.com',
  Wingify: 'vwo.com',
  Cxense: 'piano.io',
  Salesforce: 'salesforce.com',
}

const map: Record<string, string> = {}
for (const [company, domain] of Object.entries(BRANDS)) {
  const slug = company.toLowerCase().replace(/[^a-z0-9]+/g, '-')
  const res = await fetch(`https://www.google.com/s2/favicons?domain=${domain}&sz=64`)
  if (!res.ok) {
    console.warn(`skip ${company}: ${res.status}`)
    continue
  }
  await Bun.write(`src/icons/brands/${slug}.png`, await res.arrayBuffer())
  map[company] = `${slug}.png`
}
await Bun.write('src/icons/brands.json', JSON.stringify(map, null, 1))
console.log(`${Object.keys(map).length} brand icons bundled`)

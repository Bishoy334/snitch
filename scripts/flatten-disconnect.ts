// Flattens Disconnect's services.json into { domain: { company, category } }.
// Run with: bun run trackers  (commit the output; refreshed manually before releases)
const res = await fetch(
  'https://raw.githubusercontent.com/disconnectme/disconnect-tracking-protection/master/services.json',
)
const data = (await res.json()) as { categories: Record<string, unknown[]> }

const out: Record<string, { company: string; category: string; url?: string }> = {}
for (const [category, entries] of Object.entries(data.categories)) {
  for (const entry of entries) {
    for (const [company, info] of Object.entries(entry as Record<string, unknown>)) {
      for (const [url, domains] of Object.entries(info as Record<string, unknown>)) {
        if (!Array.isArray(domains)) continue
        const site = url.startsWith('http') ? url : undefined
        for (const d of domains) if (typeof d === 'string') out[d] = { company, category, url: site }
      }
    }
  }
}
await Bun.write('src/data/trackers.json', JSON.stringify(out))
console.log(`${Object.keys(out).length} tracker domains written`)

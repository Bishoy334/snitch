// Self-check for page-probe.ts: run(page, builtProbeCode) on a fresh Playwright page.
// Expects { afterNegative: 0 } and one hit per vector: canvas, webgl, audio, fonts,
// plus mic, camera, geolocation, clipboard when run on a secure-context page (https).
export default async function run(page, probeCode) {
  return await page.evaluate(async (code) => {
    const hits = []
    window.addEventListener('message', (e) => {
      if (e.data?.__privacy_inspector) hits.push(e.data.__privacy_inspector)
    })
    new Function(code)()

    // negative: attached canvas readout should NOT report
    const attached = document.createElement('canvas')
    document.body.appendChild(attached)
    attached.getContext('2d')
    attached.toDataURL()
    await new Promise((r) => setTimeout(r, 30))
    const afterNegative = hits.length

    // positive: detached canvas
    const detached = document.createElement('canvas')
    detached.toDataURL()

    // webgl GPU probe
    const gl = detached.getContext('webgl')
    let glOk = false
    if (gl) { gl.getParameter(0x9246); glOk = true }

    // audio
    new OfflineAudioContext(1, 44100, 44100)

    // fonts
    const ctx = attached.getContext('2d')
    for (let i = 0; i < 25; i++) { ctx.font = `12px font${i}`; ctx.measureText('x') }

    // sensitive APIs: hooks fire even when the underlying call is denied
    if (navigator.mediaDevices) navigator.mediaDevices.getUserMedia({ audio: true, video: true }).catch(() => {})
    navigator.geolocation.getCurrentPosition(() => {}, () => {})
    if (navigator.clipboard?.readText) navigator.clipboard.readText().catch(() => {})

    // dedupe: second detached readout should add nothing
    detached.toDataURL()

    await new Promise((r) => setTimeout(r, 50))
    return { afterNegative, glOk, hits }
  }, probeCode)
}

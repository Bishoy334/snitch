// Runs in the page's MAIN world at document_start, before any page script.
// Hooks the classic fingerprinting vectors and posts a message per distinct
// signal; content.ts relays it to the background. Low-false-positive rules:
// canvas only counts when the canvas isn't in the DOM, WebGL only for the
// UNMASKED vendor/renderer params, fonts only after 20+ distinct font strings.
export {}

const seen = new Set<string>()
function report(kind: string) {
  if (seen.has(kind)) return
  seen.add(kind)
  window.postMessage({ __privacy_inspector: kind }, '*')
}

// canvas readout of an off-DOM canvas
const toDataURL = HTMLCanvasElement.prototype.toDataURL
HTMLCanvasElement.prototype.toDataURL = function (...args) {
  if (!this.isConnected) report('canvas')
  return toDataURL.apply(this, args as [])
}
const toBlob = HTMLCanvasElement.prototype.toBlob
HTMLCanvasElement.prototype.toBlob = function (...args) {
  if (!this.isConnected) report('canvas')
  return toBlob.apply(this, args as [BlobCallback])
}
const getImageData = CanvasRenderingContext2D.prototype.getImageData
CanvasRenderingContext2D.prototype.getImageData = function (...args) {
  if (!this.canvas.isConnected) report('canvas')
  return getImageData.apply(this, args as unknown as [number, number, number, number])
}

// WebGL GPU-model probe (UNMASKED_VENDOR_WEBGL / UNMASKED_RENDERER_WEBGL)
for (const proto of [WebGLRenderingContext.prototype, window.WebGL2RenderingContext?.prototype]) {
  if (!proto) continue
  const getParameter = proto.getParameter
  proto.getParameter = function (p: number) {
    if (p === 0x9245 || p === 0x9246) report('webgl')
    return getParameter.call(this, p)
  }
}

// audio-stack probe: OfflineAudioContext is the standard audio-FP tool
for (const name of ['OfflineAudioContext', 'webkitOfflineAudioContext'] as const) {
  const Orig = (window as any)[name]
  if (!Orig) continue
  ;(window as any)[name] = class extends Orig {
    constructor(...args: unknown[]) {
      super(...args)
      report('audio')
    }
  }
}

// installed-font scan: many distinct fonts measured or checked
const fonts = new Set<string>()
function fontProbe(font: string) {
  fonts.add(font)
  if (fonts.size > 20) report('fonts')
}
const measureText = CanvasRenderingContext2D.prototype.measureText
CanvasRenderingContext2D.prototype.measureText = function (text: string) {
  fontProbe(this.font)
  return measureText.call(this, text)
}
if (window.FontFaceSet) {
  const check = FontFaceSet.prototype.check
  FontFaceSet.prototype.check = function (font: string, text?: string) {
    fontProbe(font)
    return check.call(this, font, text)
  }
}

// sensitive-API access: mic/camera/location/clipboard-read attempts
if (window.MediaDevices) {
  const getUserMedia = MediaDevices.prototype.getUserMedia
  MediaDevices.prototype.getUserMedia = function (c?: MediaStreamConstraints) {
    if (c?.audio) report('mic')
    if (c?.video) report('camera')
    return getUserMedia.call(this, c)
  }
}
if (window.Geolocation) {
  for (const m of ['getCurrentPosition', 'watchPosition'] as const) {
    const orig = Geolocation.prototype[m] as (...a: unknown[]) => unknown
    ;(Geolocation.prototype as any)[m] = function (...args: unknown[]) {
      report('geolocation')
      return orig.apply(this, args)
    }
  }
}
if (window.Clipboard) {
  for (const m of ['read', 'readText'] as const) {
    const orig = (Clipboard.prototype as any)[m]
    if (!orig) continue
    ;(Clipboard.prototype as any)[m] = function (...args: unknown[]) {
      report('clipboard')
      return orig.apply(this, args)
    }
  }
}

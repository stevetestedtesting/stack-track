// Text recognition: OCR engine, card text parser, frame stabiliser, guide geometry. No game state, no network lookups.
const debris = t => t.length <= 2 ? !['of', 'to', 'ii'].includes(t.toLowerCase()) : !/\p{L}/u.test(t);

export function cleanName(raw) {
  if (/[•©™]/.test(raw)) return null;
  const tokens = raw.trim().split(/\s+/);
  while (tokens.length > 1 && debris(tokens[tokens.length - 1])) tokens.pop();
  const r = tokens.join(' ').replace(/^[^\p{L}]+|[^\p{L}]+$/gu, '');
  const letters = (r.match(/\p{L}/gu) || []).length;
  return letters >= 3 && letters / Math.max(r.length, 1) >= 0.7 ? r : null;
}
const capture = (re, s) => s.match(re)?.[1] ?? null;
function collectorNumber(l) {
  for (const re of [/\b(\d{1,4})\s*\/\s*\d{1,4}\b/, /\b[CURMLPTS]\s+(\d{1,4})\b/, /^\s*(\d{3,4})\s+[CURMLPTS]\b/]) {
    const m = capture(re, l); if (m) return m.replace(/^0+/, '') || '0';
  }
  return null;
}
const setCode = l => capture(/\b([A-Z0-9]{3,5})\s*[•·*.\-+]\s*[A-Z]{2}\b/, l)?.toLowerCase() ?? null;

export class NameStabilizer {
  recent = [];
  add(name) {
    const k = name.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
    this.recent.push(k); if (this.recent.length > 5) this.recent.shift();
    return this.recent.filter(x => x === k).length >= 2 ? name : null;
  }
  reset() { this.recent = []; }
}

export function guideRect(w, h, frac = 0.8, maxFrac = 0.7) {
  let gw = w * frac, gh = gw / (63 / 88);
  if (gh > h * maxFrac) { gh = h * maxFrac; gw = gh * (63 / 88); }
  return { x: (w - gw) / 2, y: (h - gh) / 2, w: gw, h: gh };
}

const ENGINE = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';
let workerPromise;
function worker() {
  return workerPromise ??= new Promise((ok, no) => {
    const s = document.createElement('script');
    s.src = ENGINE; s.onload = ok; s.onerror = () => no(new Error('The text reader could not load. Check the connection.'));
    document.head.append(s);
  }).then(() => window.Tesseract.createWorker('eng')).catch(e => { workerPromise = null; throw e; });
}
// Tesseract reads a whole card badly because of the artwork, so it only sees the title bar and the collector line.
function band(src, x0, y0, x1, y1, width = 1100) {
  const sw = (x1 - x0) * src.width, sh = (y1 - y0) * src.height;
  const c = document.createElement('canvas'); c.width = width; c.height = Math.max(1, Math.round(width * sh / sw));
  const x = c.getContext('2d', { willReadFrequently: true });
  x.drawImage(src, x0 * src.width, y0 * src.height, sw, sh, 0, 0, c.width, c.height);
  const img = x.getImageData(0, 0, c.width, c.height), d = img.data;
  let min = 255, max = 0, sum = 0;
  const lum = new Float32Array(d.length / 4);
  for (let i = 0; i < lum.length; i++) { const l = d[i * 4] * .3 + d[i * 4 + 1] * .59 + d[i * 4 + 2] * .11; lum[i] = l; sum += l; if (l < min) min = l; if (l > max) max = l; }
  const invert = sum / lum.length < 110, range = Math.max(1, max - min); // Black-frame footers and dark title bars carry light text.
  for (let i = 0; i < lum.length; i++) { let v = (lum[i] - min) / range * 255; if (invert) v = 255 - v; d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = v; }
  x.putImageData(img, 0, 0);
  return c;
}
async function ocr(canvas, psm) {
  const w = await worker();
  await w.setParameters({ tessedit_pageseg_mode: psm });
  const { data } = await w.recognize(canvas);
  return (data.lines || []).map(l => l.text.trim()).filter(Boolean);
}
function rotated(c) {
  const r = document.createElement('canvas'); r.width = c.height; r.height = c.width;
  const x = r.getContext('2d'); x.translate(r.width, 0); x.rotate(Math.PI / 2); x.drawImage(c, 0, 0);
  return r;
}
const uniqueNames = lines => [...new Set(lines.map(cleanName).filter(Boolean))];
/** Reads one card-shaped canvas: the title bar first, a wider band if the card sits off-centre, then a quarter turn for split cards. */
export async function readCard(canvas) {
  let names = uniqueNames(await ocr(band(canvas, .04, .025, .84, .125), '7'));
  if (!names.length) names = uniqueNames(await ocr(band(canvas, .02, .005, .9, .2), '6'));
  if (!names.length) {
    names = uniqueNames(await ocr(band(rotated(canvas), .02, .005, .9, .2), '6'));
    return names.length ? { names: names.slice(0, 3), setCode: null, collectorNumber: null } : null;
  }
  // Only worth reading once there is a name. Most of a printing's identity is in this line.
  const foot = await ocr(band(canvas, .03, .895, .6, .99), '6');
  const first = fn => { for (const f of foot) { const v = fn(f); if (v) return v; } return null; };
  return { names: names.slice(0, 3), setCode: first(setCode), collectorNumber: first(collectorNumber) };
}
/** Draws a source rectangle to a canvas at a size the OCR reads well. */
export function toCanvas(src, sx, sy, sw, sh, width = 900) {
  const c = document.createElement('canvas'); c.width = width; c.height = Math.round(width * sh / sw);
  c.getContext('2d').drawImage(src, sx, sy, sw, sh, 0, 0, c.width, c.height);
  return c;
}

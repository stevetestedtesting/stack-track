// Text recognition: OCR engine, card text parser, frame stabiliser, guide geometry. No game state, no network lookups.
const debris = t => t.length <= 2 ? !['of', 'to', 'ii'].includes(t.toLowerCase()) : !/\p{L}/u.test(t);

export function cleanName(raw) {
  if (/[•©™]/.test(raw)) return null;
  const tokens = raw.trim().split(/\s+/);
  while (tokens.length > 1 && debris(tokens[tokens.length - 1])) tokens.pop();
  // At the front only marks count as debris: "Y)" is the frame's edge, but "Ob" starts a real card name.
  while (tokens.length > 1 && debris(tokens[0]) && /[^\p{L}]/u.test(tokens[0])) tokens.shift();
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
// The small, quick language data: phones spend far less time on each read. It caches under its own name.
const LANG_DATA = { langPath: 'https://tessdata.projectnaptha.com/4.0.0_fast', cachePath: 'fast' };
let workerPromise, workerReady = false;
export const isReady = () => workerReady;
/** Starts loading the reader ahead of time, so the first scan doesn't have to wait for it. */
export const warmUp = () => worker().catch(() => {});
function worker() {
  return workerPromise ??= new Promise((ok, no) => {
    const s = document.createElement('script');
    s.src = ENGINE; s.onload = ok; s.onerror = () => no(new Error('The text reader could not load. Check the connection.'));
    document.head.append(s);
  }).then(() => window.Tesseract.createWorker('eng', 1, LANG_DATA)).then(w => { workerReady = true; return w; }).catch(e => { workerPromise = null; throw e; });
}
// Tesseract reads a whole card badly because of the artwork, so it only sees the title bar and the collector line.
function band(src, x0, y0, x1, y1, width = 1100, pad = 0) {
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
  if (!pad) return c;
  // The reader needs a clear margin around text.
  const o = document.createElement('canvas'); o.width = c.width + pad * 2; o.height = c.height + pad * 2;
  const ox = o.getContext('2d'); ox.fillStyle = '#fff'; ox.fillRect(0, 0, o.width, o.height); ox.drawImage(c, pad, pad);
  return o;
}
// One reader, so reads take turns: the batch queue and the live camera can't change each other's settings mid-read.
let turn = Promise.resolve();
function ocr(canvas, psm) {
  const read = turn.then(async () => {
    const w = await worker();
    await w.setParameters({ tessedit_pageseg_mode: psm });
    const { data } = await w.recognize(canvas);
    return (data.text || '').split('\n').map(l => l.trim()).filter(Boolean);
  });
  turn = read.catch(() => {});
  return read;
}
function rotated(c) {
  const r = document.createElement('canvas'); r.width = c.height; r.height = c.width;
  const x = r.getContext('2d'); x.translate(r.width, 0); x.rotate(Math.PI / 2); x.drawImage(c, 0, 0);
  return r;
}
const uniqueNames = lines => [...new Set(lines.map(cleanName).filter(Boolean))];
/** Cheap check that the title bar has anything in it, so an empty frame costs no reading time. */
function hasDetail(canvas) {
  const c = document.createElement('canvas'); c.width = 120; c.height = 16;
  const x = c.getContext('2d', { willReadFrequently: true });
  x.drawImage(canvas, .04 * canvas.width, .025 * canvas.height, .8 * canvas.width, .1 * canvas.height, 0, 0, 120, 16);
  const d = x.getImageData(0, 0, 120, 16).data;
  let sum = 0, sq = 0;
  for (let i = 0; i < d.length; i += 4) { const l = d[i] * .3 + d[i + 1] * .59 + d[i + 2] * .11; sum += l; sq += l * l; }
  const n = d.length / 4;
  return Math.sqrt(Math.max(0, sq / n - (sum / n) ** 2)) > 8;
}
/** How crisp the title bar is. Only meaningful compared with other frames, since cameras differ. */
export function sharpness(canvas) {
  const w = 360, h = 40, c = document.createElement('canvas'); c.width = w; c.height = h;
  const x = c.getContext('2d', { willReadFrequently: true });
  x.drawImage(canvas, .04 * canvas.width, .025 * canvas.height, .8 * canvas.width, .1 * canvas.height, 0, 0, w, h);
  const d = x.getImageData(0, 0, w, h).data, g = new Float32Array(w * h);
  for (let i = 0; i < g.length; i++) g[i] = d[i * 4] * .3 + d[i * 4 + 1] * .59 + d[i * 4 + 2] * .11;
  let sum = 0, sq = 0, n = 0;
  for (let y = 1; y < h - 1; y++) for (let i = y * w + 1, end = y * w + w - 1; i < end; i++) {
    const l = 4 * g[i] - g[i - 1] - g[i + 1] - g[i - w] - g[i + w];
    sum += l; sq += l * l; n++;
  }
  return sq / n - (sum / n) ** 2;
}
// Ways to read a title, best first. In tests on 40 cards the frame's edges ruined most reads, so the first crops inside
// them. It is small on purpose: it read as well at 450 wide as at 800, in half the time. It needs the card well placed, which the others don't.
const readInside = async c => uniqueNames(await ocr(band(c, .05, .04, .82, .105, 450, 15), '7'));
const readBar = async c => uniqueNames(await ocr(band(c, .04, .025, .84, .125, 800, 20), '6'));
const readWideBand = async c => uniqueNames(await ocr(band(c, .02, .005, .9, .2, 800), '6'));
export const TITLE_READS = [readInside, readBar, readWideBand, c => readWideBand(rotated(c))]; // The last is for split cards.
/** The live camera's read: one pass per frame so it can retry often, mostly the quick one. */
let liveFrame = 0;
export async function readTitle(canvas) {
  if (workerReady && !hasDetail(canvas)) return null;
  const frame = liveFrame++ % 6; // Now and then a wider look, in case the card is off-centre in the frame.
  let names = await (frame === 5 ? readWideBand : frame === 2 ? readBar : readInside)(canvas);
  if (!names.length) names = await readBar(canvas); // The quick read can miss very short names outright.
  return names.length ? names.slice(0, 3) : null;
}
/** Reads one card-shaped canvas: the title, then its printing. */
export async function readCard(canvas) {
  let names = [];
  for (const read of TITLE_READS) { names = await read(canvas); if (names.length) break; }
  if (!names.length) return null;
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

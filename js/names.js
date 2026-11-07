// The list of every card name, kept on the phone so a read can be matched instantly and without a connection.
import { norm, edit } from './lookup.js?v=2.8';

const URL_NAMES = 'https://api.scryfall.com/catalog/card-names';
const CACHE = 'stack-track-names', STALE = 7 * 24 * 3600 * 1000; // New sets arrive every few weeks.
let exact = null, keys = [], loading = null;

function index(names) {
  exact = new Map(); keys = [];
  const put = (key, full) => { if (key.length >= 3 && !exact.has(key)) { exact.set(key, full); keys.push(key); } };
  for (const full of names) put(norm(full), full);
  // Two-faced and split cards are also found by either face alone, after the rest so they can't take a real card's name.
  for (const full of names) if (full.includes(' // ')) for (const face of full.split(' // ')) put(norm(face), full);
}
async function download(cache) {
  const res = await fetch(URL_NAMES, { headers: { Accept: 'application/json;q=0.9,*/*;q=0.8' } });
  if (!res.ok) throw new Error(`Card names: ${res.status}`);
  const names = (await res.json()).data;
  index(names);
  await cache?.put(URL_NAMES, new Response(JSON.stringify({ at: Date.now(), names })));
}
/** Loads the list once. A failure is quiet: scanning falls back to asking Scryfall, and the next scan tries again. */
export function load() {
  return loading ??= (async () => {
    const cache = await globalThis.caches?.open(CACHE).catch(() => null);
    const hit = await cache?.match(URL_NAMES);
    if (!hit) return download(cache);
    const { at, names } = await hit.json();
    index(names);
    if (Date.now() - at > STALE) download(cache).catch(() => {});
  })().catch(() => { loading = null; });
}
export const isLoaded = () => !!exact;

/** The card a read most likely names, or null if nothing is close or two cards are equally close. */
export function match(read) {
  if (!exact) return null;
  const k = norm(read);
  if (k.length < 3) return null;
  const hit = exact.get(k);
  if (hit) return hit;
  if (k.length < 5) return null; // Too little to go on: "Sai" is not "Said".
  const slack = Math.max(2, Math.floor(k.length / 4)); // Beyond this a score can't reach the bar below.
  let best = null, bestScore = 0, tied = false;
  for (const key of keys) {
    if (Math.abs(key.length - k.length) > slack) continue;
    const score = 1 - edit(k, key) / Math.max(k.length, key.length);
    if (score > bestScore) { best = key; bestScore = score; tied = false; }
    else if (score === bestScore && exact.get(key) !== exact.get(best)) tied = true;
  }
  return bestScore >= 0.75 && !tied ? exact.get(best) : null;
}
/** The first of several reads that names a card. */
export function matchAny(reads) {
  for (const read of reads) { const name = match(read); if (name) return { name, read }; }
  return null;
}

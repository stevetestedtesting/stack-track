// Card lookup: the Scryfall client and the identification strategy. No DOM, no camera.
const API = 'https://api.scryfall.com';
let last = 0;
async function get(path) {
  const wait = last + 100 - Date.now(); last = Date.now() + Math.max(0, wait); // Stays under 10 requests a second.
  if (wait > 0) await new Promise(r => setTimeout(r, wait));
  let res;
  try { res = await fetch(API + path, { headers: { Accept: 'application/json;q=0.9,*/*;q=0.8' } }); }
  catch { throw new LookupError('offline', 'Can’t reach Scryfall. Check the connection, or add the card as typed.'); }
  if (res.status === 404) throw new LookupError('notFound', 'No card found.');
  if (res.status === 429) throw new LookupError('rateLimited', 'Scryfall asked us to slow down. Try again in a moment.');
  if (!res.ok) throw new LookupError('server', `Scryfall returned an error (${res.status}).`);
  return res.json();
}
export class LookupError extends Error { constructor(code, msg) { super(msg); this.code = code; } }

function toRecord(c) {
  const img = o => o?.image_uris || null;
  const face = f => {
    const i = img(f) || img(c);
    return {
      name: f.name, manaCost: f.mana_cost || '', typeLine: f.type_line || '', oracleText: f.oracle_text || '',
      artist: f.artist || c.artist || null, small: i?.small || null, normal: i?.normal || null,
    };
  };
  return {
    id: c.id, name: c.name, faces: c.card_faces?.length ? c.card_faces.map(face) : [face(c)],
    setCode: c.set, setName: c.set_name, collectorNumber: c.collector_number, sourceUrl: c.scryfall_uri,
  };
}
const q = s => encodeURIComponent(s);
export const cardExact = async n => toRecord(await get(`/cards/named?exact=${q(n)}`));
export const cardFuzzy = async n => toRecord(await get(`/cards/named?fuzzy=${q(n)}`));
export const cardPrinting = async (s, n) => toRecord(await get(`/cards/${q(s)}/${q(n)}`));
export const suggestions = async t => (await get(`/cards/autocomplete?q=${q(t)}`)).data;

/** Many cards in one request, by name. Two-faced cards are keyed by their front face as well as their full name. */
export async function cardsByName(names) {
  const out = {};
  for (let i = 0; i < names.length; i += 75) {
    let res;
    try { res = await fetch(`${API}/cards/collection`, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify({ identifiers: names.slice(i, i + 75).map(name => ({ name })) }) }); }
    catch { throw new LookupError('offline', 'Can’t reach Scryfall.'); }
    if (!res.ok) throw new LookupError('server', `Scryfall returned an error (${res.status}).`);
    for (const c of (await res.json()).data) { const r = toRecord(c); out[r.name] = r; out[r.faces[0].name] = r; }
  }
  return out;
}

export const norm = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^\p{L}\p{N} ]/gu, '');
export function edit(a, b) {
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 0; i < a.length; i++) {
    const cur = [i + 1];
    for (let j = 0; j < b.length; j++) cur.push(Math.min(prev[j + 1] + 1, cur[j] + 1, prev[j] + (a[i] === b[j] ? 0 : 1)));
    prev = cur;
  }
  return prev[b.length];
}
export function similarity(a, b) {
  const x = norm(a), y = norm(b);
  return !x.length && !y.length ? 1 : 1 - edit(x, y) / Math.max(x.length, y.length);
}
export const cardSimilarity = (read, card) => Math.max(...[card.name, ...card.faces.map(f => f.name)].map(n => similarity(read, n)));

const attempt = async fn => { try { return await fn(); } catch (e) { if (e.code === 'notFound') return null; throw e; } };
/** A fuzzy match close enough to the words read to show straight away. Players confirm every card anyway. */
export async function quickMatch(name) {
  const card = await attempt(() => cardFuzzy(name));
  return card && cardSimilarity(name, card) >= 0.75 ? card : null;
}
/** Exact printing (only if the name agrees), then fuzzy name, then suggestions. */
export async function identify(names, setCode, collectorNumber) {
  const primary = names[0];
  if (!primary) return { type: 'notFound' };
  if (setCode && collectorNumber) {
    const card = await attempt(() => cardPrinting(setCode, collectorNumber));
    if (card && cardSimilarity(primary, card) >= 0.6) return { type: 'match', card };
  }
  for (const n of names) {
    const card = await attempt(() => cardFuzzy(n));
    if (card) return { type: 'match', card };
  }
  let found = await suggestions(primary);
  const first = primary.split(' ')[0];
  if (!found.length && first.length >= 3 && first !== primary) found = await suggestions(first);
  return found.length ? { type: 'suggestions', names: found.slice(0, 8) } : { type: 'notFound' };
}

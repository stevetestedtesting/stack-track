// Batch scanning: a queue of card pictures, read one at a time while the rest of the app carries on. No DOM.
import * as R from './recognition.js?v=2.7';
import * as L from './lookup.js?v=2.7';

export const items = [];
let onChange = () => {}, running = false, nextId = 1;
export const listen = fn => { onChange = fn; };

const faceFor = (card, read) => {
  if (!read || card.faces.length < 2) return 0;
  const scores = card.faces.map(f => L.similarity(read, f.name));
  return scores.indexOf(Math.max(...scores));
};
const setCard = (it, card) => Object.assign(it, { state: 'ready', card, faceIndex: faceFor(card, it.readName), names: null, message: null });
const isOpen = it => it.state === 'waiting' || it.state === 'reading';

export const counts = () => ({
  total: items.length,
  open: items.filter(isOpen).length,
  ready: items.filter(i => i.state === 'ready').length,
});

async function readOne(it) {
  const bmp = await createImageBitmap(it.blob).catch(() => { throw new Error('This file could not be opened as a picture.'); });
  const c = R.toCanvas(bmp, 0, 0, bmp.width, bmp.height, Math.min(1400, Math.max(900, bmp.width)));
  bmp.close?.();
  const parsed = await R.readCard(c);
  if (!parsed) return { state: 'failed', message: 'No card name could be read.' };
  const read = parsed.names[0];
  it.readName = read;
  const r = await L.identify(parsed.names, parsed.setCode, parsed.collectorNumber);
  // Scryfall's fuzzy search will match almost anything, so a read that barely resembles the card counts as no match.
  if (r.type === 'match' && L.cardSimilarity(read, r.card) >= 0.6) return { card: r.card };
  // The live camera gets many tries at a card, but a picture gets one, so give it a second look before asking the player.
  for (const name of (await R.readWide(c)) ?? []) {
    const card = await L.quickMatch(name);
    if (card) { it.readName = name; return { card }; }
  }
  if (r.type === 'suggestions') return { state: 'choose', names: r.names };
  return { state: 'failed', message: `Read “${read}” but found no card.` };
}
async function run() {
  if (running) return;
  running = true;
  for (let it; (it = items.find(i => i.state === 'waiting'));) {
    it.state = 'reading'; onChange();
    try {
      const out = await readOne(it);
      if (out.card) setCard(it, out.card); else Object.assign(it, out);
    } catch (e) { Object.assign(it, { state: 'failed', message: e.message || 'This picture could not be read.' }); }
    onChange();
  }
  running = false;
}
/** Adds pictures to the queue and starts reading if it isn't already. */
export function add(blobs) {
  for (const blob of blobs) items.push({ id: `b${Date.now()}-${nextId++}`, state: 'waiting', blob, url: URL.createObjectURL(blob), faceIndex: 0 });
  onChange(); run();
}
const find = id => items.find(i => i.id === id);
export function remove(id) {
  const i = items.findIndex(x => x.id === id); if (i < 0) return;
  // A picture being read may still be in use. Its result lands on a row nobody sees, and the picture goes with the page.
  if (items[i].url && items[i].state !== 'reading') URL.revokeObjectURL(items[i].url);
  items.splice(i, 1); onChange();
}
export function retry(id) { const it = find(id); if (!it?.blob) return; Object.assign(it, { state: 'waiting', message: null, names: null }); onChange(); run(); }
/** The player named the card themselves. */
export async function choose(id, name) {
  const it = find(id); if (!it) return;
  Object.assign(it, { state: 'reading', message: null }); onChange();
  try { setCard(it, await L.cardExact(name)); }
  catch (e) { Object.assign(it, { state: 'failed', message: e.message }); }
  onChange();
}
export function setChosen(id, card) { const it = find(id); if (it) { setCard(it, card); onChange(); } }
/** Takes every matched card off the list and returns them, oldest first. */
export function takeReady() {
  const ready = items.filter(i => i.state === 'ready');
  for (const it of ready) { items.splice(items.indexOf(it), 1); if (it.url) URL.revokeObjectURL(it.url); }
  onChange();
  return ready;
}
// Results survive the page closing. Pictures are too big to keep, so anything unread comes back as a row to fill in by hand.
export const saved = () => items.map(({ id, state, card, faceIndex, readName, names, message }) => ({ id, state, card, faceIndex, readName, names, message }));
export function restore(list) {
  for (const it of list ?? []) items.push(isOpen(it) ? { ...it, state: 'failed', message: 'The page closed before this picture was read.' } : it);
}

// Game state and rules-free logic. No DOM, no network. Ported from the GameCore Swift package.
export const STARTING_LIFE = 40, COMMANDER_THRESHOLD = 21, POISON_THRESHOLD = 10, HISTORY_LIMIT = 50, MAX_PLAYERS = 6;
export const COLORS = ['crimson', 'sky', 'amber', 'forest', 'violet', 'rose'];
export const KIND_LABEL = { spell: 'Spell', copy: 'Copy', activated: 'Activated ability', triggered: 'Triggered ability' };

const uid = () => (crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2) + Date.now());

export const makeDraft = () => ({
  seats: COLORS.map(color => ({ name: '', color })), playerCount: 4, timerMinutes: 50, startingSeat: null,
});
export const seatName = (draft, i) => draft.seats[i].name.trim() || `Player ${i + 1}`;
export function setPlayerCount(draft, count) {
  draft.playerCount = Math.min(Math.max(count, 2), MAX_PLAYERS);
  if (draft.startingSeat != null && draft.startingSeat >= draft.playerCount) draft.startingSeat = null;
}
/** Choosing a colour someone else has swaps the two, so colours stay unique. */
export function setSeatColor(draft, i, color) {
  const other = draft.seats.find(s => s.color === color);
  if (other) other.color = draft.seats[i].color;
  draft.seats[i].color = color;
}
export const randomIndex = n => {
  const limit = Math.floor(0x100000000 / n) * n, buf = new Uint32Array(1);
  do crypto.getRandomValues(buf); while (buf[0] >= limit); // Rejects the remainder, so every seat is equally likely.
  return buf[0] % n;
};

export function makeGame(draft) {
  const players = Array.from({ length: draft.playerCount }, (_, i) => ({
    id: uid(), name: seatName(draft, i), color: draft.seats[i].color, life: STARTING_LIFE, poison: 0, commander: {},
  }));
  return {
    players, startingPlayerId: draft.startingSeat != null ? players[draft.startingSeat].id : null,
    timer: { duration: draft.timerMinutes * 60, phase: 'idle', endsAt: null, remaining: null },
    stack: { items: [], history: [] }, commanderChangesLife: true,
  };
}
export const player = (g, id) => g.players.find(p => p.id === id);
export const commanderTotal = p => Object.values(p.commander).reduce((a, b) => a + b, 0);
export function adjustPoison(g, id, d) { const p = player(g, id); p.poison = Math.max(0, p.poison + d); }
/** Damage can't go below zero, and life moves only by the amount the damage really changed. */
export function adjustCommander(g, target, source, d) {
  const p = player(g, target); if (!p || target === source) return;
  const old = p.commander[source] || 0, now = Math.max(0, old + d);
  p.commander[source] = now;
  if (g.commanderChangesLife) p.life -= now - old;
}

// Timer stores an end time rather than ticking, so it stays right if the page sleeps.
export const remaining = (t, now = Date.now()) =>
  t.phase === 'idle' ? t.duration : t.phase === 'running' ? Math.max(0, (t.endsAt - now) / 1000) : t.remaining;
export const isExpired = (t, now = Date.now()) => t.phase !== 'idle' && remaining(t, now) <= 0;
export function timerToggle(t, now = Date.now()) {
  if (isExpired(t, now)) { t.phase = 'idle'; return; }
  if (t.phase === 'running') { t.remaining = remaining(t, now); t.phase = 'paused'; return; }
  t.endsAt = now + remaining(t, now) * 1000; t.phase = 'running';
}
export function timerReset(t) { t.phase = 'idle'; t.endsAt = null; t.remaining = null; }
/** Adding time to an expired timer leaves it paused, so nobody is surprised by it restarting. */
export function timerAdjust(t, delta, now = Date.now()) {
  const expired = isExpired(t, now), left = Math.max(0, remaining(t, now) + delta);
  if (t.phase === 'idle') t.duration = left;
  else if (t.phase === 'running' && !expired) t.endsAt = now + left * 1000;
  else { t.phase = 'paused'; t.remaining = left; }
}
export const clock = secs => {
  const s = Math.ceil(secs), h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), r = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${r}` : `${m}:${r}`;
};

// Stack: items[0] is the top. The app records order only; players apply the effects.
export const stackItem = (kind, title, detail = '', controllerId = null, card = null, faceIndex = 0, copiedFrom = null) =>
  ({ id: uid(), kind, title, detail, controllerId, card, faceIndex, copiedFrom });
export const spellItem = (card, faceIndex, controllerId) => {
  const f = card.faces[faceIndex] || {};
  return stackItem('spell', f.name || card.name, f.oracleText || '', controllerId, card, faceIndex);
};
export const push = (s, item) => s.items.unshift(item);
function record(s, item) { s.history.unshift(item); if (s.history.length > HISTORY_LIMIT) s.history.pop(); }
export function resolveTop(s) { const it = s.items.shift(); if (it) record(s, it); return it; }
export function removeItem(s, id) {
  const i = s.items.findIndex(x => x.id === id); if (i < 0) return;
  record(s, s.items.splice(i, 1)[0]);
}
export function copyItem(s, id, controllerId = null) {
  const o = s.items.find(x => x.id === id); if (!o) return;
  push(s, stackItem('copy', o.title, o.detail, controllerId ?? o.controllerId, o.card, o.faceIndex, o.title));
}
export function moveItem(s, id, delta) {
  const i = s.items.findIndex(x => x.id === id), j = i + delta;
  if (i < 0 || j < 0 || j >= s.items.length) return;
  const [it] = s.items.splice(i, 1); s.items.splice(j, 0, it);
}
export function restoreLast(s) { const it = s.history.shift(); if (it) s.items.unshift(it); }

// Seats: rows from the top of the screen down. Every player appears exactly once.
// Sideways phones: players sit along the long edges, so one row faces the other.
export function tableRows(n, landscape = false) {
  let next = 0; const take = o => ({ index: next++, orientation: o }), sides = () => [take('left'), take('right')];
  if (landscape) {
    const row = (count, o) => Array.from({ length: count }, () => take(o));
    if (n === 2) return [[take('top'), take('bottom')]];
    const across = Math.floor(n / 2);
    return [row(across, 'top'), row(n - across, 'bottom')];
  }
  if (n === 2) return [[take('top')], [take('bottom')]];
  if (n === 3) return [[take('top')], sides()];
  if (n === 4) return [sides(), sides()];
  if (n === 5) return [[take('top')], sides(), sides()];
  return [sides(), sides(), sides()];
}
export const seatOf = (g, id, landscape = false) => tableRows(g.players.length, landscape).flat().find(s => g.players[s.index].id === id);

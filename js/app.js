// Presentation: screens, gestures and wiring. Game rules live in core.js, cards in lookup.js, OCR in recognition.js.
import * as G from './core.js?v=2.3';
import * as L from './lookup.js?v=2.3';
import * as R from './recognition.js?v=2.3';
import { DECKS, deckById } from './decks.js?v=2.3';
import { createChance } from './dice.js?v=2.3';

const APP_VERSION = '2.3';
const APP_NAME = 'Stack Track';
const VER = `v${APP_VERSION}`;
const load = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
// Every skin supplies the same art files. `dir` is where they live under assets/.
const SKINS = [
  { id: 'moonspire', name: 'Moonspire', blurb: 'Moonlit castle, dark glass and brushed silver.', dir: 'moonspire' },
  { id: 'fernhollow', name: 'Fernhollow', blurb: 'Storybook forest, parchment and antique gold.', dir: '' },
];
const DEFAULT_SKIN = 'moonspire';
const S = {
  land: false,
  draft: { ...G.makeDraft(), ...load('stackside.draft', {}), startingSeat: null },
  game: load('stackside.game', null),
  screen: load('stackside.game', null) ? 'table' : 'setup',
  lastController: null,
  colorSeat: null,
  layers: [],
  playerbase: load('stackside.playerbase', []),
  cards: load('stackside.cards', []),
  tableDecks: load('stackside.tabledecks', []), // Decks in use: { id, by: player id or null }.
  deckCache: load('stackside.deckcache', {}), // Card records by name, so deck pages open instantly and survive a lost connection.
  cardsTab: 'decks',
  settings: { skin: DEFAULT_SKIN, scanCamera: 'user', keepAwake: true, vibrate: true, reduceMotion: matchMedia('(prefers-reduced-motion: reduce)').matches, ...load('stackside.settings', {}) },
};
const skin = () => SKINS.find(k => k.id === S.settings.skin) ?? SKINS.find(k => k.id === DEFAULT_SKIN);
const art = n => `assets/${skin().dir ? skin().dir + '/' : ''}${n}`;
// A player counts towards the playerbase when their name matches a saved entry, ignoring case and spaces at the ends.
const pbKey = name => String(name ?? '').trim().toLowerCase();
const pbFind = name => S.playerbase.find(e => pbKey(e.name) === pbKey(name));
const winPct = e => (e?.games ? `${Math.round(e.wins / e.games * 100)}%` : '–');
const winLine = e => (e.games ? `${e.wins} ${e.wins === 1 ? 'win' : 'wins'} in ${e.games} ${e.games === 1 ? 'game' : 'games'}` : 'No games yet');
const applySkin = () => { document.documentElement.dataset.skin = skin().id; };
applySkin();
function save() {
  try {
    localStorage.setItem('stackside.draft', JSON.stringify({ seats: S.draft.seats, playerCount: S.draft.playerCount, timerMinutes: S.draft.timerMinutes }));
    localStorage.setItem('stackside.settings', JSON.stringify(S.settings));
    localStorage.setItem('stackside.playerbase', JSON.stringify(S.playerbase));
    localStorage.setItem('stackside.cards', JSON.stringify(S.cards));
    localStorage.setItem('stackside.tabledecks', JSON.stringify(S.tableDecks));
    if (S.game) localStorage.setItem('stackside.game', JSON.stringify(S.game)); else localStorage.removeItem('stackside.game');
  } catch { /* A private window can refuse storage. The game still works until the page closes. */ }
}

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const app = document.getElementById('app'), stage = document.getElementById('stage');
const top = () => S.layers[S.layers.length - 1];
const buzz = ms => { if (!S.settings.vibrate) return; try { navigator.vibrate?.(ms); } catch { /* optional */ } };

// ---------- Icons (drawn for this app) ----------
const ic = {
  plus: '<path d="M12 5v14M5 12h14"/>', minus: '<path d="M5 12h14"/>', x: '<path d="M6 6l12 12M18 6L6 18"/>',
  drop: '<path class="f" d="M12 3c3.6 4.6 6 7.6 6 11a6 6 0 0 1-12 0c0-3.4 2.4-6.4 6-11z"/>',
  shield: '<path class="f" d="M12 3l7.5 2.6v6c0 4.4-3 7.6-7.5 9.4-4.5-1.8-7.5-5-7.5-9.4v-6z"/>',
  dice: '<rect x="3.5" y="3.5" width="17" height="17" rx="3.5"/><g class="f"><circle cx="8" cy="8" r="1.5"/><circle cx="16" cy="8" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="8" cy="16" r="1.5"/><circle cx="16" cy="16" r="1.5"/></g>',
  layers: '<path class="f" d="M12 3l9 5-9 5-9-5z"/><path d="M3.5 12.5L12 17l8.5-4.5M3.5 16.5L12 21l8.5-4.5"/>',
  dots: '<g class="f"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></g>',
  play: '<path class="f" d="M7 4.5l13 7.5-13 7.5z"/>', pause: '<g class="f"><rect x="6" y="4.5" width="4.5" height="15" rx="1"/><rect x="13.5" y="4.5" width="4.5" height="15" rx="1"/></g>',
  bell: '<path class="f" d="M12 3a6 6 0 0 0-6 6c0 5-2.5 6.5-2.5 8h17c0-1.500-2.500-3-2.500-8a6 6 0 0 0-6-6zM9.500 19a2.500 2.500 0 0 0 5 0z"/>',
  search: '<circle cx="10.500" cy="10.500" r="6.500"/><path d="M15.500 15.500L21 21"/>',
  camera: '<path d="M3 8V5a2 2 0 0 1 2-2h3M16 3h3a2 2 0 0 1 2 2v3M21 16v3a2 2 0 0 1-2 2h-3M8 21H5a2 2 0 0 1-2-2v-3"/><rect x="6.500" y="8.500" width="11" height="8" rx="1.500"/><circle cx="12" cy="12.500" r="2"/>',
  bolt: '<path d="M13.500 2.500L5 14h6l-1 7.500L19 10h-6.500z"/>', pencil: '<path d="M4 20l1-4L16 5l3 3L8 19z"/>',
  reset: '<path d="M4 12a8 8 0 1 0 2.500-5.800M4 4v4.500h4.500"/>', info: '<circle class="f" cx="12" cy="6.500" r="1.700"/><path d="M12 11v8"/>',
  sliders: '<path d="M4 7h9M18 7h2M4 17h2M11 17h9"/><circle cx="15.500" cy="7" r="2.500"/><circle cx="8.500" cy="17" r="2.500"/>',
  up: '<path d="M6 15l6-6 6 6"/>', down: '<path d="M6 9l6 6 6-6"/>', undo: '<path d="M9 7L4 12l5 5M4 12h10a6 6 0 0 1 6 6"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>',
  trash: '<path d="M4 7h16M9 7V4h6v3M6.500 7l1 13h9l1-13"/>', image: '<rect x="3" y="5" width="18" height="14" rx="2"/><path class="f" d="M5 17l5-6 4 4 2.500-2.500L19 17z"/><circle class="f" cx="16" cy="9" r="1.500"/>',
  flag: '<path d="M6 21V4"/><path class="f" d="M6 4h12l-3 4 3 4H6z"/>', warn: '<path d="M12 4l9.500 16h-19zM12 10v4.500"/><circle class="f" cx="12" cy="17.500" r=".8"/>',
  users: '<circle cx="9" cy="8" r="3.500"/><path d="M2.500 20c.5-4 3-6 6.500-6s6 2 6.500 6M16 4.800a3.500 3.500 0 0 1 0 6.400M18 14.500c2 .8 3.200 2.700 3.500 5.500"/>',
  menu: '<path d="M4 6.500h16M4 12h16M4 17.500h16"/>', help: '<path d="M8.500 9a3.500 3.500 0 1 1 5.300 3c-1.200.7-1.800 1.400-1.800 2.700"/><circle class="f" cx="12" cy="18.500" r="1.300"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.600 5.600l2.100 2.100M16.300 16.300l2.100 2.100M18.400 5.600l-2.100 2.100M7.700 16.300l-2.100 2.100"/>',
  check: '<path d="M5 12.500l4.500 4.500L19 7"/>', door: '<path d="M14 4H6v16h8M10 12h10M16.500 8.500L20 12l-3.500 3.500"/>',
  heart: '<path class="f" d="M12 20.500C5.500 16 3 12.700 3 9.200 3 6.400 5.100 4.500 7.600 4.500c1.800 0 3.400 1 4.400 2.700 1-1.700 2.600-2.700 4.400-2.700C18.900 4.500 21 6.400 21 9.200c0 3.500-2.500 6.800-9 11.300z"/>',
  cards: '<rect x="9" y="4" width="11" height="16" rx="2"/><path d="M9 7L5.200 6c-1-.3-2 .3-2.300 1.300L.9 15c-.3 1 .3 2 1.300 2.300L9 19" transform="translate(1.500 0)"/>',
  chevron: '<path d="M9 6l6 6-6 6"/>',
  star: '<path fill="currentColor" stroke="none" d="M12 0l1.700 9.300L24 12l-10.300 2.700L12 24l-1.700-9.300L0 12l10.300-2.700z"/>',
};
const icon = (n, cls = '') => `<svg class="i ${cls}" viewBox="0 0 24 24" aria-hidden="true">${ic[n]}</svg>`;
document.head.insertAdjacentHTML('beforeend', '<style>svg.i .f{fill:currentColor;stroke:none}</style>');
const gem = (c, cls = '') => `<img class="gem ${cls}" src="${art(`gem-${c}.png`)}" alt="">`;
const divider = `<div class="divider">${icon('star')}</div>`;
const head = t => `<div class="head"><h2>${esc(t)}</h2>${divider}</div>`;
const flourish = '<svg class="flourish" viewBox="0 0 150 22" aria-hidden="true"><path d="M0 11h62M88 11h62" stroke="currentColor" stroke-width="1.200"/><path fill="currentColor" d="M75 0l1.800 9.200L86 11l-9.200 1.800L75 22l-1.800-9.200L64 11l9.200-1.800z"/></svg>';
const hero = ({ title = APP_NAME, small, compact, left = '', right = '' }) => `<header class="hero ${small ? 'small' : ''} ${compact ? 'compact' : ''}">
  <h1 class="${title.length > 9 ? 'long' : ''} ${right && !left ? 'clear-left' : ''}">${esc(title)}</h1>${flourish}${title === APP_NAME && !small ? `<span class="ver">${VER}</span>` : ''}
  ${left ? `<div class="nav l">${left}</div>` : ''}${right ? `<div class="nav r">${right}</div>` : ''}</header>`;
const navBtn = (label, act, attrs = '') => `<button class="btn teal" data-act="${act}" ${attrs}>${esc(label)}</button>`;
const foot = '<div class="foot"></div>';
const footTall = '<div class="foot tall"></div>';
const frame = '<div class="frame"></div>';

const manaHtml = cost => {
  const syms = (cost || '').match(/\{[^}]+\}/g); if (!syms) return '';
  return `<span class="mana" aria-label="Mana cost ${esc(cost)}">${syms.slice(0, 12).map(s => { const v = s.slice(1, -1); return `<i class="${/^[WUBRG]$/.test(v) ? v : ''}">${esc(v.length > 2 ? v[0] : v)}</i>`; }).join('')}</span>`;
};
const chipsHtml = (selected, act = 'pickController') => `<div class="chips">${S.game.players.map(p =>
  `<button class="chip c-${p.color} ${selected === p.id ? 'on' : ''}" data-act="${act}" data-id="${p.id}" aria-pressed="${selected === p.id}">${gem(p.color)}<span>${esc(p.name)}</span></button>`).join('')}</div>`;

// ---------- Screens ----------
const seatPct = name => { const e = pbFind(name); return e?.games ? `${winPct(e)} wins` : ''; };
function setupScreen() {
  const d = S.draft, g = S.game;
  const seats = Array.from({ length: d.playerCount }, (_, i) => {
    const s = d.seats[i];
    const row = `<div class="seat-row"><button class="gem-btn" data-act="pickColorSeat" data-i="${i}" aria-label="Change ${esc(G.seatName(d, i))}'s colour">${gem(s.color)}</button>
      <input id="seat${i}" data-bind="seat" data-i="${i}" value="${esc(s.name)}" placeholder="Player ${i + 1}" maxlength="24" autocomplete="off" aria-label="Player ${i + 1} name"><span class="pb-pct" data-pct="${i}">${seatPct(s.name)}</span></div>`;
    return S.colorSeat === i ? row + `<div class="seat-colors">${G.COLORS.map(c => `<button class="${c === s.color ? 'on' : ''}" data-act="setColor" data-i="${i}" data-c="${c}" aria-label="${c}">${gem(c)}</button>`).join('')}</div>` : row;
  }).join('');
  const starter = d.startingSeat != null ? G.seatName(d, d.startingSeat) : 'Not chosen';
  return `<section class="sheet setup">${hero({})}
    <div class="scroll">
      ${g ? `<div class="progress"><div><b>Game in progress</b><small>${esc(g.players.map(p => p.name).join(', '))}</small></div><button class="btn ember" data-act="resume">Resume</button></div>` : ''}
      <div class="sect"><div class="group">${head('Players')}<div class="seg" role="radiogroup" aria-label="Number of players">${[2, 3, 4, 5, 6].map(n => `<button class="${n === d.playerCount ? 'on' : ''}" data-act="setCount" data-n="${n}" role="radio" aria-checked="${n === d.playerCount}">${n}</button>`).join('')}</div></div>
      <div class="seats ${d.playerCount > 4 ? 'dense' : ''}">${seats}</div><button class="btn teal wide" data-act="openPlayerbaseLoad">${icon('users')} Load saved players</button></div>
      <div class="sect-side"><div class="sect"><div class="group">${head('Shared timer')}
        <div class="presets">${[25, 50, 75, 100].map(m => `<button class="btn ${m === d.timerMinutes ? 'ember' : 'plain'}" data-act="setMinutes" data-m="${m}">${m}m</button>`).join('')}</div>
        <div class="row"><span class="label" id="minutesLabel">${d.timerMinutes} minutes</span><div class="stepper"><button data-act="stepMinutes" data-d="-1" aria-label="One minute less">${icon('minus')}</button><button data-act="stepMinutes" data-d="1" aria-label="One minute more">${icon('plus')}</button></div></div>
      </div></div>
      <div class="sect"><div class="group">${head('Starting player')}
        <div class="row"><span class="label">${esc(starter)}</span><button class="btn teal" data-act="pickDraftStarter">${icon('dice')} ${d.startingSeat != null ? 'Pick again' : 'Pick randomly'}</button></div>
      </div></div></div>
    </div>
    <div class="actions"><button class="cta" data-act="start"><span>Start game at ${G.STARTING_LIFE} life</span></button></div></section>`;
}

function panelHtml(seat) {
  const g = S.game, p = g.players[seat.index], total = G.commanderTotal(p);
  const flag = g.startingPlayerId === p.id ? icon('flag') : '';
  const long = String(p.life).length > 2 ? 'long' : '';
  return `<div class="panel c-${p.color}">${frame}<img class="pgem" src="${art(`gem-${p.color}.png`)}" alt="">
    <div class="seat ${seat.orientation}">
      <button class="press minus" data-press="-1" data-id="${p.id}" aria-label="Decrease ${esc(p.name)}'s life" style="color:var(--ink-${p.color})"><span class="glyph">${icon('minus')}</span></button>
      <button class="press plus" data-press="1" data-id="${p.id}" aria-label="Increase ${esc(p.name)}'s life" style="color:var(--ink-${p.color})"><span class="glyph">${icon('plus')}</span></button>
      <div class="seat-in" style="--pink:var(--ink-${p.color})">
        <div class="pname">${flag}<span>${esc(p.name)}</span>${pbFind(p.name)?.games ? `<small class="pb-win">${winPct(pbFind(p.name))}</small>` : ''}</div>
        <div class="life ${long}" data-life="${p.id}">${p.life}</div>
        <button class="pill" data-act="openCounters" data-id="${p.id}" aria-label="${esc(p.name)}'s counters: ${p.poison} poison, ${total} commander damage"><span>${icon('drop')}<em>Poison</em> ${p.poison}</span><span>${icon('shield')}<em>Cmdr</em> ${total}</span></button>
      </div>
    </div></div>`;
}
function stripHtml() {
  return `<div class="strip" id="strip">
    <button class="tbtn timer" id="timerBtn" data-timer aria-label="Shared timer. Tap to start or pause."><span id="timerIcon" style="display:contents"></span><span id="timerLabel"></span></button>
    <button class="tbtn lab" data-act="openTimerMenu" aria-label="Change the timer">${icon('sliders')}<small>Timer</small></button>
    <button class="tbtn lab" data-act="pickStarter" aria-label="Pick who goes first">${icon('dice')}<small>Who's first</small></button></div>`;
}
function tableScreen() {
  const n = S.game.players.length, rows = G.tableRows(n, S.land), mid = Math.floor(rows.length / 2);
  if (S.land) return `<div class="table n${n}"><div class="rows">${rows.map(row => `<div class="trow">${row.map(panelHtml).join('')}</div>`).join('')}</div><div class="rail">${stripHtml()}</div></div>`;
  return `<div class="table n${n}"><div class="table-top"></div><div class="rows">${rows.map((row, i) =>
    (i === mid ? stripHtml() : '') + `<div class="trow">${row.map(panelHtml).join('')}</div>`).join('')}</div></div>`;
}

// ---------- Navigation: the same five places, always one tap away ----------
const ROOTS = { stack: 'stack', cards: 'cards', dice: 'dice', more: 'more' };
const isRoot = (l, i) => i === 0 && !!ROOTS[l.type];
const activeTab = () => ROOTS[S.layers[0]?.type] ?? 'game';
function tabBar() {
  const on = activeTab(), n = S.game?.stack.items.length ?? 0;
  const tab = (id, ic_, label, badge = '') => `<button class="tab ${on === id ? 'on' : ''}" data-act="goTab" data-t="${id}" ${on === id ? 'aria-current="page"' : ''}>${icon(ic_)}<span>${label}</span>${badge}</button>`;
  const covered = S.layers.some((l, i) => !isRoot(l, i));
  return `<nav class="tabbar" aria-label="Main" ${covered ? 'inert' : ''}>${tab('game', 'heart', 'Game')}${tab('stack', 'layers', 'Stack', n ? `<b class="badge" aria-label="${n} on the stack">${n}</b>` : '')}${tab('cards', 'cards', 'Cards')}${tab('dice', 'dice', 'Dice')}${tab('more', 'dots', 'More')}</nav>`;
}
function moreLayer() {
  const row = (act, c, ic_, title, sub, cls = '') => `<button class="navrow ${cls}" data-act="${act}"><span class="ic ${c}">${icon(ic_)}</span><span class="pb-text"><b>${title}</b><small>${sub}</small></span>${icon('chevron')}</button>`;
  return `<section class="sheet">${hero({ title: 'More', small: true })}<div class="scroll">
    ${S.game ? `<div class="group">${head('This game')}${row('backToSetup', 'o', 'sliders', 'New game or players', 'Change players, colours and the timer')}${row('askEndGame', 'r', 'x', 'End game', 'Pick the winner and clear the table', 'danger')}</div>` : ''}
    <div class="group">${head('App')}
      ${row('openPlayerbase', 't', 'users', 'Players', 'Saved players and win records')}
      ${row('openGuide', 't', 'help', 'How to use', 'A short guide to every feature')}
      ${row('openSettings', 't', 'gear', 'Settings', 'Skins, vibration and keeping the screen on')}
      ${row('openAbout', 'b', 'info', 'About', 'Card data, privacy and legal')}</div>
    <p class="note center">${APP_NAME} ${VER}</p></div></section>`;
}

const counterRow = (title, color, value, flagged, flagText, act, id) => `<div class="card-box counter">
  ${color ? gem(color) : ''}<div class="name"><div>${esc(title)}</div>${flagged ? `<small>${flagText}</small>` : ''}</div>
  <div class="stepper"><button data-act="${act}" data-id="${id}" data-d="-1" ${value === 0 ? 'disabled' : ''} aria-label="Decrease ${esc(title)}">${icon('minus')}</button><output class="${flagged ? 'flag' : ''}">${value}</output><button data-act="${act}" data-id="${id}" data-d="1" aria-label="Increase ${esc(title)}">${icon('plus')}</button></div></div>`;
function countersLayer(l) {
  const g = S.game, p = G.player(g, l.id); if (!p) return '';
  const others = g.players.filter(o => o.id !== l.id);
  const poison = counterRow('Poison', null, p.poison, p.poison >= G.POISON_THRESHOLD, `${G.POISON_THRESHOLD}+ poison`, 'adjPoison', p.id);
  const toggle = `<div class="switchrow"><span>Commander damage also changes life</span><button class="toggle" role="switch" aria-checked="${g.commanderChangesLife}" data-act="toggleCommander" aria-label="Commander damage also changes life"></button></div>`;
  const rows = others.map(o => { const v = p.commander[o.id] || 0; return counterRow(o.name, o.color, v, v >= G.COMMANDER_THRESHOLD, `${G.COMMANDER_THRESHOLD}+ damage`, 'adjCommander', o.id); }).join('');
  const headBits = `<button class="rename" data-act="openRename" aria-label="Rename ${esc(p.name)}"><span>${esc(p.name)}</span>${icon('pencil')}</button><span class="lifelabel">${p.life} life</span>`;
  // Worked out on each draw, because turning the phone moves the seats.
  const rot = G.seatOf(g, p.id, S.land)?.orientation ?? 'bottom', sideways = rot === 'left' || rot === 'right';
  const rename = l.renaming ? `<div class="dim" data-act="closeRename"><form class="modal" data-stop data-form="rename">${frame}${gem(p.color, 'top')}<h2>Rename player</h2><div class="divider">${icon('star')}</div>
      <input class="field" id="renameInput" value="${esc(l.draftName)}" maxlength="24" autocomplete="off" aria-label="Name">
      <div class="btns"><button type="button" class="btn teal" data-act="closeRename">Cancel</button><button class="btn ruby" type="submit">Save</button></div></form></div>` : '';
  const turned = rot !== 'bottom' ? `turned ${rot}` : '';
  const style = sideways ? '--turned-w:var(--sh);--turned-h:var(--sw)' : '--turned-w:var(--sw);--turned-h:var(--sh)';
  if (sideways || S.land) {
    return `<section class="sheet ${turned}" style="${style}"><div class="bar">${headBits}<button class="btn ember" data-act="pop">Done</button></div>
      <div class="scroll" style="padding-top:12px"><div class="wide-layout"><div>${poison}${toggle}</div><div><h2 style="font:700 17px/1.2 var(--text)">Commander damage received</h2>${rows}</div></div></div>${rename}</section>`;
  }
  return `<section class="sheet ${turned}" style="${style}">${hero({ small: true })}<div class="scroll"><div class="chead">${headBits}<button class="btn teal" data-act="pop">Done</button></div>
    ${poison}${toggle}${divider}<h2 style="font:700 20px/1.2 var(--text)">Commander damage received</h2><div class="group">${rows}</div></div>${foot}${rename}</section>`;
}

function stackRow(item, i, editing) {
  const f = item.card?.faces[item.faceIndex], c = item.controllerId && G.player(S.game, item.controllerId);
  const blankIcon = item.kind === 'activated' || item.kind === 'triggered' ? 'bolt' : 'copy';
  const thumb = f?.small ? `<div class="thumb"><img src="${esc(f.small)}" alt="" loading="lazy"></div>` : `<div class="thumb blank">${icon(blankIcon)}</div>`;
  const body = `<div class="item" data-item="${item.id}" tabindex="0" role="button" aria-label="${esc(item.title)}. Open details.">${thumb}
    <div class="info"><div class="title">${esc(item.title)} ${manaHtml(f?.manaCost)}</div>
      <div class="meta">${i === 0 ? '<b>Next to resolve</b>' : `#${i + 1}`} · ${G.KIND_LABEL[item.kind]}</div>
      ${item.detail ? `<div class="oracle">${esc(item.detail)}</div>` : ''}
      ${c ? `<div class="who">${gem(c.color)}${esc(c.name)}</div>` : ''}</div>
    ${editing ? '' : `<button class="row-more" data-act="openRowMenu" data-id="${item.id}" aria-label="More for ${esc(item.title)}">${icon('dots')}</button>`}${editing ? `<div class="edit-arrows"><button data-act="moveItem" data-id="${item.id}" data-d="-1" ${i === 0 ? 'disabled' : ''} aria-label="Move up">${icon('up')}</button><button data-act="moveItem" data-id="${item.id}" data-d="1" ${i === S.game.stack.items.length - 1 ? 'disabled' : ''} aria-label="Move down">${icon('down')}</button></div>` : ''}</div>`;
  return `<div class="stack-row"><div class="under"></div>${body}</div>`;
}
// Life stays in reach on the stack page, because a player can die while it resolves. The name opens their counters.
function miniLifeHtml(seat) {
  const p = S.game.players[seat.index];
  return `<div class="panel mini c-${p.color}">${frame}<div class="seat ${seat.orientation}">
    <button class="press minus" data-press="-1" data-id="${p.id}" aria-label="Decrease ${esc(p.name)}'s life" style="color:var(--ink-${p.color})"><span class="glyph">${icon('minus')}</span></button>
    <button class="press plus" data-press="1" data-id="${p.id}" aria-label="Increase ${esc(p.name)}'s life" style="color:var(--ink-${p.color})"><span class="glyph">${icon('plus')}</span></button>
    <div class="seat-in" style="--pink:var(--ink-${p.color})"><button class="mini-name" data-act="openCounters" data-id="${p.id}" aria-label="${esc(p.name)}'s counters">${esc(p.name)}</button><div class="life ${String(p.life).length > 2 ? 'long' : ''}" data-life="${p.id}">${p.life}</div></div>
  </div></div>`;
}
/** Sideways, players keep their corners with the stack between them. Upright, one group sits above it and one below. */
function lifeSides() {
  const n = S.game.players.length, rows = G.tableRows(n, true);
  const a = [], b = [];
  if (!S.land) rows.flat().forEach((seat, i) => { const flipped = i < Math.floor(n / 2); (flipped ? a : b).push({ index: seat.index, orientation: flipped ? 'top' : 'bottom' }); });
  else rows.forEach((row, r) => row.forEach((seat, x) => {
    const middle = x === (row.length - 1) / 2, left = middle ? r === 0 : x < row.length / 2;
    (left ? a : b).push(seat);
  }));
  return [a, b].map(side => `<div class="lifeside">${side.map(miniLifeHtml).join('')}</div>`);
}
function stackLayer(l) {
  if (!S.game) return `<section class="sheet">${hero({ title: 'Stack', small: true })}<div class="scroll"><div class="empty"><img src="${art('illo-stack.webp')}" alt="">${divider}<h2>No game yet</h2><p>The stack belongs to a game. Start one, and everything you cast is tracked here.</p><button class="btn ruby" data-act="goTab" data-t="game">Set up a game</button></div></div></section>`;
  const s = S.game.stack, topItem = s.items[0];
  const undo = s.history.length ? `<button class="undo" data-act="undo">${icon('undo')}<span>Put back ${esc(s.history[0].title)}</span></button>` : '';
  const main = s.items.length
    ? `<div class="scroll">${s.items.map((it, i) => stackRow(it, i, l.editing)).join('')}<p class="note">Tap a card for details. Use ⋯ to copy or remove it.</p></div>`
    : `<div class="scroll"><div class="empty"><img src="${art('illo-stack.webp')}" alt="">${divider}<h2>The stack is empty</h2><p>Pick from a deck, scan a card, search for one, or add an ability. The newest item goes on top.</p>${divider}${undo}</div></div>`;
  const [before, after] = lifeSides();
  return `<section class="sheet stack-life">${before}<div class="stack-mid">${hero({ title: 'Stack', small: true, compact: true, right: s.items.length > 1 ? navBtn(l.editing ? 'Finish' : 'Reorder', 'toggleEdit') : '' })}${main}
    <div class="actions">${topItem ? `${undo}<button class="cta" data-act="resolve" style="font-size:${topItem.title.length > 20 ? 18 : topItem.title.length > 12 ? 21 : 25}px"><span>Resolve ${esc(topItem.title)}</span></button>` : ''}
      <div class="addbar four"><button class="btn teal" data-act="openDeckPick">${icon('cards')}Deck</button><button class="btn teal" data-act="openScan">${icon('camera')}Scan</button><button class="btn teal" data-act="openSearch">${icon('search')}Search</button><button class="btn teal" data-act="openAbility">${icon('bolt')}Ability</button></div></div></div>${after}</section>`;
}
const factsHtml = (card, f, short) => `${f.normal ? `<div class="cardimg ${short ? 'short' : ''}"><img src="${esc(f.normal)}" alt="${esc(f.name)} card"></div>` : ''}
  <div class="facts"><div class="row"><h2>${esc(f.name)}</h2>${manaHtml(f.manaCost)}</div>${f.typeLine ? `<div>${esc(f.typeLine)}</div>` : ''}</div>
  ${f.oracleText ? `<div class="card-box" style="white-space:pre-line">${esc(f.oracleText)}</div>` : ''}
  <div class="credits">${f.artist ? `<span>Illustrated by ${esc(f.artist)}</span>` : ''}<span>${esc(card.setName)} #${esc(card.collectorNumber)}</span>${card.sourceUrl ? `<a href="${esc(card.sourceUrl)}" target="_blank" rel="noopener">Data and image from Scryfall</a>` : ''}</div>`;
const isSaved = card => S.cards.some(c => c.id === card.id);
const saveBtn = card => `<button class="btn ${isSaved(card) ? 'plain' : 'teal'} save-card" data-act="toggleSaved" aria-pressed="${isSaved(card)}">${icon(isSaved(card) ? 'check' : 'plus')} ${isSaved(card) ? 'Saved to My cards' : 'Save to My cards'}</button>`;
/** True when scan or search was opened from My cards, so the card goes to the collection and not the stack. */
const savingCards = () => S.layers.some(l => l.type === 'cards');
const savedRows = l => {
  const t = (l.filter ?? '').trim().toLowerCase();
  const found = S.cards.filter(c => c.name.toLowerCase().includes(t));
  if (!S.cards.length) return '<p class="note center">No saved cards yet. Scan a card or search for one to start.</p>';
  if (!found.length) return '<p class="note center">No saved card has that name.</p>';
  return `<div class="cards-list">${found.map(c => { const f = c.faces[0]; return `<div class="pb-row card-row">
    <button class="card-open" data-act="openSavedCard" data-id="${esc(c.id)}">${f.small ? `<span class="thumb"><img src="${esc(f.small)}" alt="" loading="lazy"></span>` : `<span class="thumb blank">${icon('image')}</span>`}<span class="pb-text"><b>${esc(c.name)}</b><small>${esc(f.typeLine)}</small></span></button>
    <button class="pb-del" data-act="askRemoveCard" data-id="${esc(c.id)}" aria-label="Remove ${esc(c.name)}">${icon('trash')}</button></div>`; }).join('')}</div>`;
};
const tableDeck = id => S.tableDecks.find(t => t.id === id);
const playerOf = id => (S.game && id ? G.player(S.game, id) : null);
const deckStatus = d => { const t = tableDeck(d.id); if (!t) return ''; const p = playerOf(t.by); return `<div class="deck-on">${icon('check')} In use${p ? ` by ${esc(p.name)}` : ''}</div>`; };
const deckCount = d => d.cards.reduce((n, [c]) => n + c, 0);
const deckHtml = d => `<article class="card-box deck">
  <button class="deck-open" data-act="openDeck" data-id="${d.id}"><span class="head">${gem(d.color)}<h3>${esc(d.name)}</h3>${icon('chevron')}</span>
  <span class="deck-meta">${esc(d.format)}${d.winRate ? ` · ${esc(d.winRate)}` : ''}</span><span class="deck-blurb">${esc(d.blurb)}</span></button>
  ${deckStatus(d)}
  <div class="deck-btns"><button class="btn ${tableDeck(d.id) ? 'plain' : 'ruby'}" data-act="toggleDeck" data-id="${d.id}">${tableDeck(d.id) ? 'Stop using' : 'Use this deck'}</button><button class="btn teal" data-act="openDeck" data-id="${d.id}">See ${d.cards.length} cards</button></div></article>`;
function cardsLayer(l) {
  const saved = S.cardsTab === 'saved';
  const body = saved
    ? `<div class="addbar two"><button class="btn teal" data-act="openScan">${icon('camera')}Scan</button><button class="btn teal" data-act="openSearch">${icon('search')}Search</button></div>
      ${S.cards.length ? `<div class="searchbar"><div class="box">${icon('search')}<input id="cardFilter" data-bind="cardFilter" value="${esc(l.filter ?? '')}" placeholder="Find a saved card" autocomplete="off" aria-label="Find a saved card"></div></div>` : ''}
      <div id="savedCards">${savedRows(l)}</div>`
    : `<p class="note center">Pick a deck and its cards are ready on the Stack page, with no scanning.</p><div class="decks">${DECKS.map(deckHtml).join('')}</div><p class="note center">Win rates come from the linked sources and change often.</p>`;
  return `<section class="sheet">${hero({ title: 'Cards', small: true })}<div class="scroll">
    <div class="seg" role="radiogroup" aria-label="Section"><button class="${saved ? '' : 'on'}" role="radio" aria-checked="${!saved}" data-act="cardsTab" data-t="decks">Popular decks</button><button class="${saved ? 'on' : ''}" role="radio" aria-checked="${saved}" data-act="cardsTab" data-t="saved">My cards</button></div>
    ${body}</div></section>`;
}
/** Card facts for every card in a list. Missing ones show by name, so a lost connection never blocks play. */
const cached = name => S.deckCache[name];
async function loadDeckCards(names, l) {
  const missing = names.filter(n => !cached(n)); if (!missing.length) return;
  l.offline = false;
  try { Object.assign(S.deckCache, await L.cardsByName(missing)); try { localStorage.setItem('stackside.deckcache', JSON.stringify(S.deckCache)); } catch { /* Only a cache. */ } }
  catch { l.offline = true; }
  if (S.layers.includes(l)) draw();
}
const listRow = (count, name, act) => { const c = cached(name) ?? S.cards.find(x => x.name === name), f = c?.faces[0]; return `<div class="pb-row card-row">
  <button class="card-open" data-act="${act}" data-name="${esc(name)}">${f?.small ? `<span class="thumb"><img src="${esc(f.small)}" alt="" loading="lazy"></span>` : `<span class="thumb blank">${icon('image')}</span>`}<span class="pb-text"><b class="wrap">${esc(name)}</b><span class="costline">${manaHtml(f?.manaCost)}${count ? `<small>×${count}</small>` : ''}</span></span></button>
  ${act === 'addDeckCard' ? `<button class="pb-del" data-act="viewDeckCard" data-name="${esc(name)}" aria-label="Read ${esc(name)}">${icon('info')}</button>` : ''}</div>`; };
const offlineNote = l => (l.offline ? '<p class="warn">No connection, so pictures and rules text are missing. You can still add cards by name.</p>' : '');
function deckLayer(l) {
  const d = deckById(l.id), t = tableDeck(d.id);
  const lands = d.lands.map(([c, n]) => `${c} ${n}`).join(', ');
  return `<section class="sheet">${hero({ small: true, right: navBtn('Back', 'pop') })}<div class="scroll">
    <div class="deck-title">${gem(d.color)}<h2>${esc(d.name)}</h2></div>
    <p class="deck-blurb">${esc(d.blurb)}</p>
    <button class="btn ${t ? 'plain' : 'ruby'} wide" data-act="toggleDeck" data-id="${d.id}">${t ? `${icon('check')} In use. Tap to stop` : 'Use this deck'}</button>
    ${t && S.game ? `<div class="group">${head('Who plays it?')}${chipsHtml(t.by, 'deckPlayer')}</div>` : ''}
    ${offlineNote(l)}
    <div class="cards-list">${d.cards.map(([c, n]) => listRow(c, n, 'viewDeckCard')).join('')}</div>
    <p class="note">Lands don't use the stack, so they aren't listed above: ${esc(lands)}.</p>
    ${d.note ? `<p class="note">${esc(d.note)}</p>` : ''}
    <div class="deck-src">List from <a href="${esc(d.list.url)}" target="_blank" rel="noopener">${esc(d.list.label)}</a>, ${esc(d.list.date)}. Deck info: ${d.sources.map(x => `<a href="${esc(x.url)}" target="_blank" rel="noopener">${esc(x.label)}</a>`).join(', ')}.</div>
  </div></section>`;
}
/** What Add from deck offers: decks in use, then saved cards. */
const pickSources = () => [...S.tableDecks.map(t => ({ key: t.id, label: deckById(t.id)?.short ?? t.id })), ...(S.cards.length ? [{ key: 'saved', label: 'My cards' }] : [])];
function deckPickLayer(l) {
  const sources = pickSources(), back = navBtn('Back', 'pop');
  if (!sources.length || l.choosing) return `<section class="sheet">${hero({ title: 'Pick a deck', small: true, right: back })}<div class="scroll">
    <p class="note center">Choose the decks at this table. Their cards stay ready here for the whole game.</p>
    <div class="decks">${DECKS.map(d => `<button class="navrow ${tableDeck(d.id) ? 'picked' : ''}" data-act="pickDeckNow" data-id="${d.id}">${gem(d.color)}<span class="pb-text"><b>${esc(d.name)}</b><small>${deckCount(d)} spells and creatures</small></span>${icon(tableDeck(d.id) ? 'check' : 'chevron')}</button>`).join('')}</div></div></section>`;
  const src = sources.find(x => x.key === l.source) ?? sources[0]; l.source = src.key;
  const t = tableDeck(src.key), d = deckById(src.key);
  const by = t ? t.by : l.controller;
  const q = (l.filter ?? '').trim().toLowerCase();
  const list = d ? d.cards : S.cards.map(c => [0, c.name]);
  const rows = list.filter(([, n]) => n.toLowerCase().includes(q)).map(([c, n]) => listRow(c, n, 'addDeckCard')).join('') || '<p class="note center">No card here has that name.</p>';
  return `<section class="sheet">${hero({ title: 'Add a card', small: true, right: back })}<div class="scroll">
    <div class="srcs">${sources.map(x => `<button class="srcchip ${x.key === src.key ? 'on' : ''}" data-act="pickSource" data-k="${esc(x.key)}">${esc(x.label)}</button>`).join('')}<button class="srcchip add" data-act="chooseDecks">${icon('plus')} Decks</button></div>
    <div class="group">${head(d ? 'Who plays it?' : 'Controller')}${chipsHtml(by, 'deckPlayer')}</div>
    <div class="searchbar"><div class="box">${icon('search')}<input id="pickFilter" data-bind="pickFilter" value="${esc(l.filter ?? '')}" placeholder="Find in this list" autocomplete="off" aria-label="Find in this list"></div></div>
    ${offlineNote(l)}
    <p class="note">Tap a card to put it on the stack.</p>
    <div class="cards-list" id="pickRows">${rows}</div></div></section>`;
}
function cardViewLayer(l) {
  const c = l.card, f = c.faces[l.faceIndex];
  return `<section class="sheet">${hero({ small: true, right: navBtn('Back', 'pop') })}<div class="scroll cardview">
    ${c.faces.length > 1 ? `<div class="seg">${c.faces.map((x, i) => `<button class="${i === l.faceIndex ? 'on' : ''}" data-act="setFace" data-i="${i}" style="font-size:14px">${esc(x.name)}</button>`).join('')}</div>` : ''}
    ${saveBtn(c)}${factsHtml(c, f)}</div>
    ${S.game ? `<div class="actions"><div class="group">${head('Controller')}${chipsHtml(l.controller)}</div><button class="btn ruby" style="min-height:54px;font-size:19px" data-act="acceptCard">Add to stack</button></div>` : ''}${foot}</section>`;
}
function detailLayer(l) {
  const it = l.item, f = it.card?.faces[it.faceIndex];
  return `<section class="sheet">${hero({ small: true, right: navBtn('Back', 'pop') })}<div class="scroll cardview">
    ${it.card ? saveBtn(it.card) : ''}${f ? factsHtml(it.card, f) : `<div class="facts"><h2 style="font:700 24px/1.15 var(--text)">${esc(it.title)}</h2><div>${G.KIND_LABEL[it.kind]}</div></div>${it.detail ? `<div class="card-box">${esc(it.detail)}</div>` : ''}`}
    ${it.copiedFrom ? `<p class="note">Copy of ${esc(it.copiedFrom)}</p>` : ''}</div>${foot}</section>`;
}
function abilityLayer(l) {
  const can = l.source.trim() || l.effect.trim();
  return `<section class="sheet">${hero({ small: true })}<div class="scroll">
    <div class="formhead"><button class="btn plain" data-act="pop">Cancel</button><h2>Add ability</h2><button class="btn ruby" id="abilityAdd" data-act="addAbility" ${can ? '' : 'disabled'}>Add</button></div>${divider}
    <div class="seg" role="radiogroup" aria-label="Ability type"><button class="${l.kind === 'triggered' ? 'on' : ''}" data-act="abilityKind" data-k="triggered">Triggered</button><button class="${l.kind === 'activated' ? 'on' : ''}" data-act="abilityKind" data-k="activated">Activated</button></div>
    <div class="group">${head('Source')}<input class="field" id="abilitySource" data-bind="abilitySource" value="${esc(l.source)}" placeholder="Card or permanent" autocomplete="off"></div>
    <div class="group">${head('Effect')}<textarea class="field" id="abilityEffect" data-bind="abilityEffect" placeholder="What it does">${esc(l.effect)}</textarea></div>
    <div class="group">${head('Controller')}${chipsHtml(l.controller)}</div></div>${foot}</section>`;
}
function searchResults(l) {
  const t = l.query.trim();
  return `${l.message ? `<p class="note">${esc(l.message)}</p>` : ''}
    ${l.results.length ? `<div class="card-box results">${l.results.map(n => `<button data-act="loadCard" data-name="${esc(n)}"><span>${esc(n)}</span>${l.loading === n ? '<i class="spin"></i>' : ''}</button>`).join('')}</div>` : ''}
    ${savingCards() ? (t ? '' : '<p class="note">Type at least two letters of a card name.</p>') : t ? `<div class="group"><h2 style="font:700 19px/1.2 var(--text)">Not listed?</h2>${head('Controller')}${chipsHtml(l.controller)}<button class="typed" data-act="addTyped">Add “${esc(t)}” as typed</button></div>` : '<p class="note">Type at least two letters of a card name.</p>'}`;
}
function searchLayer(l) {
  return `<section class="sheet">${hero({ small: true })}<div class="scroll">
    <div class="searchbar"><div class="box">${icon('search')}<input id="searchInput" data-bind="search" value="${esc(l.query)}" placeholder="Card name" autocomplete="off" autocapitalize="off" spellcheck="false" aria-label="Card name"></div>
    <button class="btn ruby round" data-act="pop" aria-label="Cancel search" style="display:grid;place-items:center">${icon('x')}</button></div>
    <div class="group" id="searchResults" style="gap:12px">${searchResults(l)}</div></div>${foot}</section>`;
}
function confirmLayer(l) {
  const c = l.card, f = c.faces[l.faceIndex], weak = l.readName && L.cardSimilarity(l.readName, c) < 0.7;
  return `<section class="sheet">${hero({ small: true })}<div class="scroll cardview">
    <div class="divider" style="color:var(--ink)"><h2 style="font:700 24px/1.1 var(--text)">Is this the card?</h2></div>
    ${weak ? `<div class="warn">${icon('warn')}<span>The scan read “${esc(l.readName)}”. Check this is your card.</span></div>` : ''}
    ${c.faces.length > 1 ? `<div class="seg">${c.faces.map((x, i) => `<button class="${i === l.faceIndex ? 'on' : ''}" data-act="setFace" data-i="${i}" style="font-size:14px">${esc(x.name)}</button>`).join('')}</div>` : ''}
    ${factsHtml(c, f, true)}
    ${l.readName ? '<p class="note">The printing shown may differ from the card in your hand.</p>' : ''}
    </div>
    <div class="actions">${savingCards()
      ? `<div style="display:grid;grid-template-columns:1fr 1.2fr;gap:10px"><button class="btn plain" style="min-height:54px" data-act="rejectCard">Not this card</button><button class="btn ruby" style="min-height:54px;font-size:19px" data-act="saveAndContinue">Save card</button></div>`
      : `<div class="group">${head('Controller')}${chipsHtml(l.controller)}</div>${saveBtn(c)}<div style="display:grid;grid-template-columns:1fr 1.2fr;gap:10px"><button class="btn plain" style="min-height:54px" data-act="rejectCard">Not this card</button><button class="btn ruby" style="min-height:54px;font-size:19px" data-act="acceptCard">Add to stack</button></div>`}</div>${foot}</section>`;
}
function scanLayer(l) {
  const status = `<div class="scan-status" id="scanStatus" ${l.status ? '' : 'hidden'}>${scanStatusHtml(l)}</div>`;
  if (l.state === 'live') {
    return `<section class="sheet">${hero({ title: 'Scan a card', small: true, left: navBtn('Close', 'pop') })}
      <div class="scan-live" id="scanLive"><video id="scanVideo" class="${S.settings.scanCamera === 'user' ? 'mirror' : ''}" playsinline muted autoplay></video><div class="scan-guide" id="scanGuide"></div>${status}</div>
      <div class="actions" style="padding-top:10px"><button class="btn teal" data-act="flipCamera">${icon('reset')} Use ${S.settings.scanCamera === 'user' ? 'back' : 'front'} camera</button><button class="btn teal" data-act="openSearch">${icon('search')} Search by name instead</button></div>${foot}</section>`;
  }
  const denied = l.state === 'denied', starting = l.state === 'starting';
  return `<section class="sheet">${hero({ title: 'Scan a card', small: true, left: navBtn('Close', 'pop') })}<div class="scroll">
    <img class="lens" src="${art('illo-lens.webp')}" alt="">
    <div class="center"><h2>${starting ? 'Opening the camera…' : denied ? 'Camera access is off' : 'No camera available'}</h2></div>${divider}
    <p class="center">${denied ? 'Allow the camera for this page in your browser settings, or search by name.' : 'Scanning needs a phone or laptop camera. You can search by name instead.'}</p>
    ${status.replace('scan-status', 'card-box center')}
    <button class="cta mid" data-act="scanSample" ${l.busy ? 'disabled' : ''}>${icon('image')}<span style="margin-left:10px">Scan a sample image</span></button>
    <label class="filelabel">${icon('camera')} Read a photo of a card<input type="file" accept="image/*" id="scanFile"></label>
    <button class="btn teal" data-act="openSearch">${icon('search')} Search by name instead</button></div>${foot}</section>`;
}
function scanStatusHtml(l) {
  const st = l.status; if (!st) return '';
  if (st.suggestions) return `<b>Which card is it?</b><div class="sug">${st.suggestions.map(n => `<button data-act="chooseSuggestion" data-name="${esc(n)}">${esc(n)}</button>`).join('')}</div>`;
  return `${st.busy ? '<i class="spin" style="display:inline-block;vertical-align:-3px;margin-right:6px"></i>' : ''}${esc(st.text)}`;
}
function aboutLayer() {
  const sect = (c, t, body) => `<div class="group"><div class="head">${gem(c)}<h3>${t}</h3>${divider}</div><div class="card-box">${body}</div></div>`;
  return `<section class="sheet">${hero({ title: 'About', small: true, right: navBtn('Back', 'pop') })}<div class="scroll about twocol">
    ${sect('crimson', 'What this app does', '<p>Stack Track tracks numbers and order for you. Players remain responsible for the rules, priority, targets and applying effects.</p>')}
    ${sect('sky', 'Card data', '<p>Card data and images are provided by Scryfall. Stack Track is free to use and is not produced by or endorsed by Scryfall.</p><a class="btn teal" href="https://scryfall.com" target="_blank" rel="noopener">Visit Scryfall</a>')}
    ${sect('amber', 'Legal', '<p>Stack Track is unofficial Fan Content permitted under the Wizards of the Coast Fan Content Policy. Not approved or endorsed by Wizards. Portions of the materials used are property of Wizards of the Coast. ©Wizards of the Coast LLC.</p>')}
    ${sect('forest', 'Privacy', '<p>Scanning reads text on this device; camera images aren’t uploaded. Card names you look up are sent to Scryfall. Your players, win records, saved cards and chosen decks stay in this browser.</p>')}<p class="note center">${APP_NAME} ${VER}</p></div>${foot}</section>`;
}
function starterLayer(l) {
  const e = l.entries[l.cycling ?? l.selected];
  return `<div class="dim"><div class="starter" data-stop>${gem(e.color)}
    <div class="who"><b id="starterName" class="${e.name.length > 10 ? 'long' : ''}">${esc(e.name)}</b><i id="starterSub">${l.cycling == null ? 'goes first' : ''}</i></div>
    <button class="hot reroll" data-act="reroll" aria-label="Reroll"><em>${icon('dice')} Reroll</em></button><button class="hot done" data-act="pop" aria-label="Done"><em>Done</em></button></div></div>`;
}
function modal(title, body, buttons, stack) {
  return `<div class="dim" data-act="pop"><div class="modal" data-stop role="dialog" aria-label="${esc(title)}">${frame}${gem('crimson', 'top')}<h2>${esc(title)}</h2>${divider}<p>${esc(body)}</p><div class="btns ${stack ? 'stack' : ''}">${buttons}</div></div></div>`;
}
function stripBottom() {
  const el = document.getElementById('strip'); if (!el) return 400;
  return stage.clientHeight - el.offsetTop - el.offsetParent.offsetTop + 8;
}
function settingsLayer() {
  const st = S.settings;
  const sw = (key, label, note) => `<div class="switchrow"><span>${label}${note ? `<small>${note}</small>` : ''}</span><button class="toggle" role="switch" aria-checked="${st[key]}" data-act="toggleSetting" data-k="${key}" aria-label="${label}"></button></div>`;
  return `<section class="sheet">${hero({ title: 'Settings', small: true, right: navBtn('Back', 'pop') })}<div class="scroll twocol">
    <div class="group">${head('Skins')}<div class="skins" role="radiogroup" aria-label="Skin">${SKINS.map(k => `<button class="skin ${k.id === skin().id ? 'on' : ''}" role="radio" aria-checked="${k.id === skin().id}" data-act="setSkin" data-id="${k.id}">
      <span class="thumb" style="background-image:url('assets/${k.dir ? k.dir + '/' : ''}${k.id === 'moonspire' ? 'table-top' : 'hero'}.jpg')"></span><span class="txt"><b>${esc(k.name)}</b><small>${esc(k.blurb)}</small></span><span class="tick">${k.id === skin().id ? icon('check') : ''}</span></button>`).join('')}</div></div>
    <div class="group">${head('At the table')}<div class="card-box settings-box">
      ${sw('keepAwake', 'Keep screen awake', 'During a game')}
      ${sw('reduceMotion', 'Reduce motion', 'Dice and coin land without tumbling')}
      ${'vibrate' in navigator ? sw('vibrate', 'Vibration', 'On life changes and when the stack resolves') : ''}
    </div></div><p class="note center">${APP_NAME} ${VER}</p></div>${foot}</section>`;
}
function guideLayer() {
  const sect = (c, t, items) => `<div class="group"><div class="head">${gem(c)}<h3>${t}</h3>${divider}</div><div class="card-box"><ul>${items.map(i => `<li>${i}</li>`).join('')}</ul></div></div>`;
  return `<section class="sheet">${hero({ title: 'How to use', small: true, right: navBtn('Back', 'pop') })}<div class="scroll about guide twocol">
    ${sect('crimson', 'Finding things', ['The bar along the edge of the screen is always there: Game, Stack, Cards, Dice and More.', 'On a page that opens on top of those, Back returns you.'])}
    ${sect('crimson', 'Life', ['Tap + or − to change life by 1.', 'Hold to keep counting, and slide off to cancel.'])}
    ${sect('sky', 'Poison and commander damage', ['Tap the small button on a player\'s panel for both counters.', 'You can rename a player from the same page.'])}
    ${sect('amber', 'Timer', ['Tap the clock to start or pause it.', 'Tap Timer beside it to add or remove a minute, or to reset.'])}
    ${sect('forest', 'The stack', ['Open Stack and add a card with Deck, Scan, Search or Ability. The newest goes on top.', 'Resolve from the top down. Life totals stay on the page while you do.', 'Tap ⋯ on a row to copy or remove it, or swipe it right or left. Reorder appears with two or more.'])}
    ${sect('sky', 'Decks', ['In Cards, choose a popular deck and tap Use this deck.', 'On the Stack page, tap Deck, choose who plays it once, then tap any card to cast it.', 'Lands are left out because they don\'t use the stack.'])}
    ${sect('sky', 'My cards', ['In Cards, open My cards to scan or search for cards to keep.', 'Saved cards also appear when you tap Deck on the Stack page.'])}
    ${sect('rose', 'Win tracking', ['Save names in More, under Players, then load them when setting up a game.', 'When you end a game from More, pick the winner to record it for everyone saved.'])}
    ${sect('violet', 'Scanning', ['Hold the card flat in the frame with its name at the top.', 'You confirm every match before it joins the stack.', 'If a scan struggles, use Search instead.'])}
    </div>${foot}</section>`;
}
const pbAddable = name => { const n = String(name ?? '').trim(); return n && !pbFind(n); };
function playerbaseLayer(l) {
  const loading = !!l.select;
  const rows = S.playerbase.length ? [...S.playerbase].sort((a, b) => (b.wins / (b.games || 1)) - (a.wins / (a.games || 1)) || a.name.localeCompare(b.name)).map(e => {
    const on = loading && l.select.includes(e.id);
    const body = `<span class="pb-text"><b>${esc(e.name)}</b><small>${winLine(e)}</small></span><span class="pb-big">${winPct(e)}</span>`;
    return loading
      ? `<button class="pb-row pick ${on ? 'on' : ''}" role="checkbox" aria-checked="${on}" data-act="pbToggle" data-id="${e.id}"><span class="pb-tick">${on ? icon('check') : ''}</span>${body}</button>`
      : `<div class="pb-row">${body}<button class="pb-del" data-act="pbAskDelete" data-id="${e.id}" aria-label="Remove ${esc(e.name)}">${icon('trash')}</button></div>`;
  }).join('') : '<p class="note center">No players saved yet. Add one to start tracking wins.</p>';
  return `<section class="sheet">${hero({ title: 'Players', small: true, right: navBtn('Back', 'pop') })}<div class="scroll">
    ${loading ? `<p class="note center">Choose 2 to ${G.MAX_PLAYERS} players for this game.</p>` : ''}
    <div class="searchbar"><div class="box"><input id="pbName" data-bind="pbName" value="${esc(l.draftName ?? '')}" placeholder="Add a player" maxlength="24" autocomplete="off" aria-label="New player's name"></div><button class="btn teal" id="pbAdd" data-act="pbAdd" ${pbAddable(l.draftName) ? '' : 'disabled'}>Add</button></div>
    <div class="group">${rows}</div>
    </div>${loading ? `<div class="actions"><button class="cta mid" data-act="pbLoad" ${l.select.length >= 2 ? '' : 'disabled'}><span>${l.select.length >= 2 ? `Load ${l.select.length} players` : 'Choose at least 2'}</span></button></div>` : ''}${foot}</section>`;
}
function endGameLayer(l) {
  const saved = S.game.players.filter(p => pbFind(p.name));
  if (!saved.length) return modal('End this game?', 'Life totals, counters and the stack will be cleared.', `<button class="btn teal" data-act="pop">Keep playing</button><button class="btn ruby" data-act="endGame">End game</button>`);
  return `<div class="dim" data-act="pop"><div class="modal" data-stop role="dialog" aria-label="End this game?">${frame}${gem('crimson', 'top')}<h2>Who won?</h2>${divider}
    <p>Pick the winner to record it for ${saved.length === 1 ? esc(saved[0].name) : `${saved.length} saved players`}. Life totals, counters and the stack will be cleared.</p>
    ${chipsHtml(l.winner, 'pickWinner')}
    <div class="btns"><button class="btn teal" data-act="pop">Keep playing</button><button class="btn ruby" data-act="endGame">${l.winner ? 'End &amp; record' : 'End, no record'}</button></div></div></div>`;
}
const CHANCE = {
  d6: { name: 'D6', tag: 'The classic', go: 'Cast the D6', again: 'Cast again', moving: 'Rolling', done: 'You rolled', settle: 'Let the dice settle', hint: 'Touch the die to cast', hintAgain: 'Tap the die to roll again', range: '1–6' },
  d20: { name: 'D20', tag: 'The arcane', go: 'Cast the D20', again: 'Cast again', moving: 'Rolling', done: 'You rolled', settle: 'Let the dice settle', hint: 'Touch the die to cast', hintAgain: 'Tap the die to roll again', range: '1–20' },
  coin: { name: 'Coin', tag: 'The omen', go: 'Flip the coin', again: 'Toss again', moving: 'In the air', done: 'The coin lands', settle: 'A little fate in motion', hint: 'Touch the coin to flip', hintAgain: 'Tap the coin to toss again', range: 'Heads / Tails' },
};
function diceLayer(l) {
  const c = CHANCE[l.kind], off = l.busy ? 'disabled' : '', landed = l.result != null && !l.busy;
  return `<section class="sheet chance-sheet" role="dialog" aria-label="Dice and coin">
    <header class="chance-top"><div class="chance-brand">✧ ${APP_NAME}</div>${navBtn("Who's first?", 'pickStarter')}</header>
    <div class="chance-body">
      <p class="chance-eyebrow">The ritual of chance</p>
      <h2 class="chance-title">Fortune <em>takes shape.</em></h2>
      <p class="chance-line">Silver edges. Obsidian hearts.<br>Cast a die, or let the moon decide.</p>
      <div class="chance-kinds" role="radiogroup" aria-label="Choose what to roll">${Object.keys(CHANCE).map(k => `<button role="radio" aria-checked="${k === l.kind}" data-act="chanceKind" data-k="${k}" ${off}>${CHANCE[k].name}<span>${CHANCE[k].tag}</span></button>`).join('')}</div>
      <div class="chance-stage"><canvas id="chanceCanvas" aria-hidden="true"></canvas><button class="chance-surface" data-act="chanceRoll" aria-label="${c.go}" ${off}></button></div>
      <p class="chance-hint">${l.busy ? c.settle : l.result != null ? c.hintAgain : c.hint}</p>
      <div class="chance-out" role="status" aria-live="polite" aria-atomic="true"><small>${esc(l.busy ? c.moving : l.result != null ? c.done : 'Awaiting your hand')}</small><b class="${landed ? 'reveal' : ''}">${esc(l.busy ? '…' : l.result ?? '—')}</b></div>
      <button class="cta mid chance-go" data-act="chanceRoll" ${off}><span>${l.result != null || l.busy ? c.again : c.go}</span></button>
      <div class="chance-foot"><span>Equal chance · ${c.range}</span><label><input type="checkbox" data-act="toggleSetting" data-k="reduceMotion" ${S.settings.reduceMotion ? 'checked' : ''} ${off}>Reduce motion</label></div>
    </div></section>`;
}
function timerMenuLayer() {
  const d = G.clock(S.game.timer.duration);
  return `<div class="dim" style="background:rgba(4,20,22,.35)" data-act="pop"><div class="pop timerpop" data-stop style="bottom:${stripBottom()}px" role="menu">${frame}<img src="${art('illo-hourglass.png')}" alt="">
    <div class="list"><button class="btn plain" data-act="timerAdjust" data-d="-60">${icon('minus')}Remove 1 minute</button><button class="btn plain" data-act="timerAdjust" data-d="60">${icon('plus')}Add 1 minute</button><button class="btn plain" data-act="timerReset">${icon('reset')}Reset to ${d}</button></div><img src="${art('illo-hourglass.png')}" alt=""></div></div>`;
}
function rowMenuLayer(l) {
  const item = S.game.stack.items.find(i => i.id === l.id); if (!item) return '';
  return `<div class="dim" data-act="pop"><div class="modal" data-stop style="gap:8px">${frame}${gem('crimson', 'top')}<h2>${esc(item.title)}</h2>${divider}
    <div class="note" style="text-align:center">Copy, controlled by…</div>${chipsHtml(null, 'copyFor')}
    <button class="btn teal" data-act="abilityFrom">${icon('bolt')} Add ability from this</button><button class="btn ruby" data-act="removeFromMenu">${icon('trash')} Remove from stack</button><button class="btn plain" data-act="pop">Cancel</button></div></div>`;
}
function pbDeleteLayer(l) {
  const e = S.playerbase.find(x => x.id === l.id);
  return modal(`Remove ${e?.name ?? 'player'}?`, 'Their win record will be deleted.', `<button class="btn teal" data-act="pop">Keep</button><button class="btn ruby" data-act="pbDelete">Remove</button>`);
}
const LAYERS = {
  counters: countersLayer, stack: stackLayer, detail: detailLayer, ability: abilityLayer, search: searchLayer, confirm: confirmLayer,
  scan: scanLayer, about: aboutLayer, starter: starterLayer, more: moreLayer, deck: deckLayer, deckPick: deckPickLayer, settings: settingsLayer, guide: guideLayer, dice: diceLayer, playerbase: playerbaseLayer, pbDelete: pbDeleteLayer, cards: cardsLayer, cardView: cardViewLayer,
  cardRemove: l => { const c = S.cards.find(x => x.id === l.id); return modal(`Remove ${c?.name ?? 'card'}?`, 'It will leave My cards. You can always save it again.', `<button class="btn teal" data-act="pop">Keep</button><button class="btn ruby" data-act="removeCard">Remove</button>`); },
  timerMenu: timerMenuLayer, rowMenu: rowMenuLayer,
  replace: () => modal('Replace the game in progress?', 'Its life totals, counters and stack will be lost.', `<button class="cta mid" data-act="startForced"><span>Start new game</span></button><button class="btn teal" data-act="pop">Cancel</button>`, true),
  endGame: endGameLayer,
};

// ---------- Rendering ----------
function draw() {
  const scrolls = S.layers.map((_, i) => app.querySelector(`.layer[data-i="${i}"] .scroll`)?.scrollTop ?? 0);
  const baseScroll = app.querySelector('.base .scroll')?.scrollTop ?? 0;
  app.innerHTML = `<div class="layer base root" ${S.layers.some(l => !['starter', 'pbDelete', 'timerMenu', 'replace', 'endGame', 'rowMenu'].includes(l.type)) ? 'inert' : ''}>${S.screen === 'table' && S.game ? tableScreen() : setupScreen()}</div>` +
    S.layers.map((l, i) => (i === 0 && !isRoot(l, 0) ? tabBar() : '') + `<div class="layer ${isRoot(l, i) ? 'root' : ''}" data-i="${i}" ${i < S.layers.length - 1 ? 'inert' : ''}>${LAYERS[l.type](l)}</div>` + (isRoot(l, i) ? tabBar() : '')).join('') + (S.layers.length ? '' : tabBar());
  S.layers.forEach((_, i) => { const el = app.querySelector(`.layer[data-i="${i}"] .scroll`); if (el) el.scrollTop = scrolls[i]; });
  const b = app.querySelector('.base .scroll'); if (b) b.scrollTop = baseScroll;
  tick(true);
  attachScan();
  attachChance();
  const t = top();
  if (t?.autofocus) { app.querySelector('#' + t.autofocus)?.focus(); delete t.autofocus; }
  if (t?.renaming && t.focusRename) { const i = app.querySelector('#renameInput'); i?.focus(); i?.select(); t.focusRename = false; }
  save();
}
let chance = null;
function attachChance() {
  const l = top(), canvas = document.getElementById('chanceCanvas');
  if (l?.type !== 'dice' || !canvas) { chance?.destroy(); chance = null; return; }
  if (!chance) {
    chance = createChance({
      reduced: () => S.settings.reduceMotion,
      onSettled: value => { l.result = String(value); l.busy = false; buzz(15); if (top() === l) draw(); },
    });
    chance.attach(canvas);
    chance.choose(l.kind);
  } else chance.attach(canvas);
}
function push(layer) { S.layers.push(layer); draw(); }
function pop() { const l = S.layers.pop(); if (l?.type === 'scan') stopScan(); draw(); resumeScanIfTop(); }

let timerKey = '';
function tick(force) {
  const btn = document.getElementById('timerBtn'); if (!S.game) return;
  const t = S.game.timer, expired = G.isExpired(t);
  if (expired && t.phase === 'running' && !t.notified) { t.notified = true; buzz([200, 100, 200]); save(); }
  if (!btn) return;
  const key = expired ? 'expired' : t.phase === 'running' ? 'run' : 'idle';
  if (force || key !== timerKey) {
    timerKey = key;
    document.getElementById('timerIcon').innerHTML = icon(expired ? 'bell' : t.phase === 'running' ? 'pause' : 'play');
    btn.classList.toggle('expired', expired);
  }
  const label = expired ? 'Time expired' : G.clock(G.remaining(t));
  const el = document.getElementById('timerLabel'); if (el.textContent !== label) el.textContent = label;
}
setInterval(() => tick(false), 250);

// ---------- Actions ----------
const recent = {};
function stepLife(id, d) {
  const p = G.player(S.game, id); if (!p) return;
  p.life += d; buzz(6);
  // The table sits underneath the stack page, so a player's total can be on screen twice.
  const totals = () => document.querySelectorAll(`[data-life="${id}"]`);
  const r = recent[id] ??= { n: 0 };
  r.n += d; clearTimeout(r.t);
  totals().forEach(el => {
    el.innerHTML = `${p.life}${r.n ? `<span class="delta">${r.n > 0 ? '+' : ''}${r.n}</span>` : ''}`;
    el.classList.toggle('long', String(p.life).length > 2);
  });
  r.t = setTimeout(() => { r.n = 0; totals().forEach(e => { e.textContent = G.player(S.game, id)?.life ?? ''; }); }, 1800);
  save();
}
function roll(l) {
  const n = l.entries.length, pick = G.randomIndex(n);
  l.selected = pick;
  if (l.source === 'draft') S.draft.startingSeat = pick; else S.game.startingPlayerId = S.game.players[pick].id;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const show = i => {
    const e = l.entries[i], name = document.getElementById('starterName'), gemEl = app.querySelector('.starter .gem');
    if (!name) return;
    name.textContent = e.name; name.classList.toggle('long', e.name.length > 10); gemEl.src = art(`gem-${e.color}.png`);
    document.getElementById('starterSub').textContent = i === pick && !l.spinning ? 'goes first' : '';
  };
  if (reduce || n < 2) { show(pick); return; }
  let step = 0; l.spinning = true; l.cycling = 0;
  // The result is already chosen. The name cycling is decoration and never affects it.
  const run = () => {
    if (top() !== l) { l.spinning = false; return; }
    if (step < 14) { l.cycling = step % n; show(l.cycling); step++; setTimeout(run, 55 + step * 7); }
    else { l.cycling = null; l.spinning = false; buzz(30); show(pick); }
  };
  run();
}
function startGame() { S.draft.startingSeat = S.draft.startingSeat ?? null; S.game = G.makeGame(S.draft); S.draft.startingSeat = null; S.screen = 'table'; S.layers = []; draw(); wake(); }
let lock; const wake = async () => { if (!S.settings.keepAwake) return; try { lock = await navigator.wakeLock?.request('screen'); } catch { /* Optional: not every browser allows it. */ } };
const randomBelow = n => { const buf = new Uint32Array(1), limit = 2 ** 32 - 2 ** 32 % n; do crypto.getRandomValues(buf); while (buf[0] >= limit); return buf[0] % n; };

const A = {
  pop,
  resume() { S.screen = 'table'; S.colorSeat = null; draw(); wake(); },
  setCount(d) { G.setPlayerCount(S.draft, +d.n); if (S.colorSeat >= S.draft.playerCount) S.colorSeat = null; draw(); },
  pickColorSeat(d) { S.colorSeat = S.colorSeat === +d.i ? null : +d.i; draw(); },
  setColor(d) { G.setSeatColor(S.draft, +d.i, d.c); S.colorSeat = null; draw(); },
  setMinutes(d) { S.draft.timerMinutes = +d.m; draw(); },
  stepMinutes(d) { S.draft.timerMinutes = Math.min(300, Math.max(1, S.draft.timerMinutes + +d.d)); draw(); },
  pickDraftStarter() {
    const entries = Array.from({ length: S.draft.playerCount }, (_, i) => ({ name: G.seatName(S.draft, i), color: S.draft.seats[i].color }));
    const l = { type: 'starter', source: 'draft', entries, selected: 0 }; push(l); roll(l);
  },
  pickGameStarter() {
    const entries = S.game.players.map(p => ({ name: p.name, color: p.color }));
    const l = { type: 'starter', source: 'game', entries, selected: 0 }; push(l); roll(l);
  },
  reroll() { const l = top(); if (!l.spinning) roll(l); },
  start() { if (S.game) push({ type: 'replace' }); else startGame(); },
  startForced: startGame,
  goTab(d) {
    if (S.layers.some(l => l.type === 'scan')) stopScan();
    if (d.t === 'game') {
      if (activeTab() === 'game' && S.game && S.screen === 'setup') S.screen = 'table'; // Tapping Game again returns to the table.
      S.layers = []; draw(); return;
    }
    if (activeTab() === d.t) { S.layers = S.layers.slice(0, 1); draw(); return; }
    S.layers = [d.t === 'dice' ? { type: 'dice', kind: 'd6' } : d.t === 'cards' ? { type: 'cards', filter: '' } : { type: d.t }];
    draw();
    if (d.t === 'stack' && S.game) R.warmUp();
  },
  openAbout() { push({ type: 'about' }); },
  openSettings() { push({ type: 'settings' }); },
  openGuide() { push({ type: 'guide' }); },
  pickStarter() { if (S.game) A.pickGameStarter(); else A.pickDraftStarter(); },
  openTimerMenu() { push({ type: 'timerMenu' }); },
  openRowMenu(d) { push({ type: 'rowMenu', id: d.id }); },
  chanceKind(d) { const l = top(); if (l.busy || !chance) return; l.kind = d.k; l.result = null; chance.choose(d.k); draw(); },
  chanceRoll() {
    const l = top(); if (l.busy || !chance) return;
    const result = l.kind === 'coin' ? (randomBelow(2) ? 'Heads' : 'Tails') : randomBelow(l.kind === 'd6' ? 6 : 20) + 1;
    l.busy = true; draw(); chance.roll(result);
  },
  setSkin(d) { S.settings.skin = d.id; applySkin(); preloadArt(); draw(); },
  toggleSetting(d) {
    S.settings[d.k] = !S.settings[d.k];
    if (d.k === 'keepAwake') { if (S.settings.keepAwake) { if (S.screen === 'table') wake(); } else { lock?.release?.(); lock = null; } }
    draw();
  },
  askEndGame() { push({ type: 'endGame' }); },
  pickWinner(d) { const l = top(); l.winner = l.winner === d.id ? null : d.id; draw(); },
  endGame() {
    const winner = top()?.winner;
    if (winner) {
      const counted = new Set(); // Two seats with one name still count once.
      for (const p of S.game.players) {
        const e = pbFind(p.name); if (!e || counted.has(e.id)) continue;
        counted.add(e.id); e.games++; if (p.id === winner) e.wins++;
      }
    }
    S.game = null; S.screen = 'setup'; S.layers = []; draw();
  },
  openPlayerbase() { push({ type: 'playerbase', autofocus: 'pbName' }); },
  cardsTab(d) { S.cardsTab = d.t; draw(); },
  openSavedCard(d) { const card = S.cards.find(c => c.id === d.id); if (card) push({ type: 'cardView', card, faceIndex: 0, controller: S.lastController }); },
  openDeck(d) { const l = { type: 'deck', id: d.id }; push(l); loadDeckCards(deckById(d.id).cards.map(([, n]) => n), l); },
  toggleDeck(d) {
    if (tableDeck(d.id)) S.tableDecks = S.tableDecks.filter(t => t.id !== d.id); else S.tableDecks.push({ id: d.id, by: null });
    buzz(10); draw();
    if (tableDeck(d.id)) loadDeckCards(deckById(d.id).cards.map(([, n]) => n), top());
  },
  deckPlayer(d) {
    const l = top(), key = l.type === 'deck' ? l.id : l.source, t = tableDeck(key);
    if (t) t.by = t.by === d.id ? null : d.id; else l.controller = l.controller === d.id ? null : d.id;
    draw();
  },
  openDeckPick() { const l = { type: 'deckPick', controller: S.lastController, filter: '' }; push(l); pickLoad(l); },
  pickSource(d) { const l = top(); l.source = d.k; l.filter = ''; draw(); pickLoad(l); },
  chooseDecks() { top().choosing = true; draw(); },
  pickDeckNow(d) {
    const l = top();
    if (!tableDeck(d.id)) S.tableDecks.push({ id: d.id, by: null });
    l.choosing = false; l.source = d.id; l.filter = ''; buzz(10); draw(); pickLoad(l);
  },
  addDeckCard(d) {
    const l = top(), t = tableDeck(l.source), by = t ? t.by : l.controller, controller = playerOf(by) ? by : null;
    const card = l.source === 'saved' ? S.cards.find(c => c.name === d.name) : cached(d.name);
    G.push(S.game.stack, card ? G.spellItem(card, 0, controller) : G.stackItem('spell', d.name, '', controller));
    S.lastController = controller; buzz(15); returnToStack();
  },
  viewDeckCard(d) {
    const l = top(), t = tableDeck(l.source ?? l.id), card = l.source === 'saved' ? S.cards.find(c => c.name === d.name) : cached(d.name);
    if (card) { push({ type: 'cardView', card, faceIndex: 0, controller: t?.by ?? l.controller ?? S.lastController }); return; }
    L.cardExact(d.name).then(c => { S.deckCache[d.name] = c; if (top() === l) push({ type: 'cardView', card: c, faceIndex: 0, controller: t?.by ?? S.lastController }); }).catch(() => { l.offline = true; if (top() === l) draw(); });
  },
  toggleSaved() {
    const l = top(), card = l.card ?? l.item?.card; if (!card) return;
    if (isSaved(card)) S.cards = S.cards.filter(c => c.id !== card.id); else S.cards.unshift(card);
    buzz(10); draw();
  },
  saveAndContinue() {
    const l = top(); if (!isSaved(l.card)) S.cards.unshift(l.card);
    buzz(15); pop();
    if (top()?.type === 'scan') {
      scanModel.resume();
      // The same card is probably still in view, so don't offer it again straight away.
      if (l.readName) { scanModel.tried.add(l.readName); scanModel.lastFailed = l.readName; }
      setStatus(top(), { text: `Saved ${l.card.name}. Hold up the next card, or tap Close.` });
    } else { while (top()?.type !== 'cards') S.layers.pop(); draw(); }
  },
  askRemoveCard(d) { push({ type: 'cardRemove', id: d.id }); },
  removeCard() { const l = top(); S.cards = S.cards.filter(c => c.id !== l.id); pop(); },
  openPlayerbaseLoad() {
    const seated = S.draft.seats.slice(0, S.draft.playerCount).map(s => pbFind(s.name)?.id).filter(Boolean);
    push({ type: 'playerbase', select: [...new Set(seated)] });
  },
  pbAdd() {
    const l = top(), name = String(l.draftName ?? '').trim(); if (!pbAddable(name)) return;
    const e = { id: crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2) + Date.now(), name, wins: 0, games: 0 };
    S.playerbase.push(e); l.draftName = '';
    if (l.select && l.select.length < G.MAX_PLAYERS) l.select.push(e.id);
    l.autofocus = 'pbName'; draw();
  },
  pbToggle(d) {
    const l = top(), i = l.select.indexOf(d.id);
    if (i >= 0) l.select.splice(i, 1); else if (l.select.length < G.MAX_PLAYERS) l.select.push(d.id); else return;
    draw();
  },
  pbLoad() {
    const l = top(); if (l.select.length < 2) return;
    G.setPlayerCount(S.draft, l.select.length);
    l.select.forEach((id, i) => { S.draft.seats[i].name = S.playerbase.find(e => e.id === id).name; });
    S.draft.startingSeat = null; S.colorSeat = null; S.layers.pop(); draw();
  },
  pbAskDelete(d) { push({ type: 'pbDelete', id: d.id }); },
  pbDelete() { const l = top(); S.playerbase = S.playerbase.filter(e => e.id !== l.id); S.layers.pop(); draw(); },
  backToSetup() { S.layers = []; S.screen = 'setup'; draw(); },
  timerAdjust(d) { G.timerAdjust(S.game.timer, +d.d); S.game.timer.notified = false; tick(true); save(); },
  timerReset() { G.timerReset(S.game.timer); S.game.timer.notified = false; S.layers.pop(); draw(); },
  openCounters(d) { push({ type: 'counters', id: d.id }); },
  adjPoison(d) { G.adjustPoison(S.game, d.id, +d.d); draw(); },
  adjCommander(d) { G.adjustCommander(S.game, top().id, d.id, +d.d); draw(); },
  toggleCommander() { S.game.commanderChangesLife = !S.game.commanderChangesLife; draw(); },
  openRename() { const l = top(); l.renaming = true; l.focusRename = true; l.draftName = G.player(S.game, l.id).name; draw(); },
  closeRename() { top().renaming = false; draw(); },
  toggleEdit() { top().editing = !top().editing; draw(); },
  moveItem(d) { G.moveItem(S.game.stack, d.id, +d.d); draw(); },
  resolve() { G.resolveTop(S.game.stack); buzz(15); draw(); },
  undo() { G.restoreLast(S.game.stack); draw(); },
  openAbility(d, source = '') { push({ type: 'ability', source, effect: '', kind: 'triggered', controller: S.lastController, autofocus: source ? 'abilityEffect' : 'abilitySource' }); },
  abilityKind(d) { top().kind = d.k; draw(); },
  pickController(d) { const l = top(); l.controller = l.controller === d.id ? null : d.id; if (l.type === 'search') { renderSearch(l); return; } draw(); },
  addAbility() {
    const l = top(), s = l.source.trim(), e = l.effect.trim(); if (!s && !e) return;
    G.push(S.game.stack, G.stackItem(l.kind, s || G.KIND_LABEL[l.kind], e, l.controller));
    S.lastController = l.controller; pop();
  },
  openSearch() { if (top()?.type === 'scan') S.scanResume = true; push({ type: 'search', query: '', results: [], message: null, loading: null, controller: S.lastController, autofocus: 'searchInput' }); },
  async loadCard(d) {
    const l = top(); l.loading = d.name; renderSearch(l);
    try { const card = await L.cardExact(d.name); l.loading = null; if (top() === l) openConfirm(card, null); }
    catch (e) { l.loading = null; l.message = e.message; if (top() === l) renderSearch(l); }
  },
  addTyped() {
    const l = top(); G.push(S.game.stack, G.stackItem('spell', l.query.trim(), '', l.controller)); S.lastController = l.controller; returnToStack();
  },
  setFace(d) { top().faceIndex = +d.i; draw(); },
  acceptCard() {
    const l = top(); G.push(S.game.stack, G.spellItem(l.card, l.faceIndex, l.controller)); S.lastController = l.controller; buzz(15);
    if (S.layers[0]?.type !== 'stack') { S.layers = [{ type: 'stack' }]; draw(); return; }
    returnToStack();
  },
  rejectCard() { pop(); if (top()?.type === 'scan') scanModel.resume(); },
  openScan() { const l = { type: 'scan', state: 'starting', status: null }; push(l); startScan(l); },
  flipCamera() { const l = top(); S.settings.scanCamera = S.settings.scanCamera === 'user' ? 'environment' : 'user'; stopScan(); l.state = 'starting'; l.status = null; draw(); startScan(l); },
  scanSample() { runSample(top()); },
  async chooseSuggestion(d) {
    const l = top(); setStatus(l, { text: `Looking up “${d.name}”…`, busy: true });
    try { openConfirm(await L.cardExact(d.name), d.name); setStatus(l, null); }
    catch (e) { setStatus(l, { text: e.message }); }
  },
  abilityFrom() { const id = top().id, it = S.game.stack.items.find(i => i.id === id); S.layers.pop(); A.openAbility({}, it?.title ?? ''); },
  copyFor(d) { const id = top().id; S.layers.pop(); G.copyItem(S.game.stack, id, d.id); draw(); },
  removeFromMenu() { const id = top().id; S.layers.pop(); G.removeItem(S.game.stack, id); draw(); },
};
function pickLoad(l) {
  const d = deckById(l.source ?? pickSources()[0]?.key);
  if (d) loadDeckCards(d.cards.map(([, n]) => n), l);
}
function returnToStack() {
  while (S.layers.length && top().type !== 'stack') { const l = S.layers.pop(); if (l.type === 'scan') stopScan(); }
  draw();
}
function openConfirm(card, readName) {
  let faceIndex = 0;
  if (readName && card.faces.length > 1) {
    const scores = card.faces.map(f => L.similarity(readName, f.name)); faceIndex = scores.indexOf(Math.max(...scores));
  }
  push({ type: 'confirm', card, readName, faceIndex, controller: S.lastController });
}
function renderSearch(l) { const el = document.getElementById('searchResults'); if (el) el.innerHTML = searchResults(l); }

// ---------- Scan wiring: camera frames in, OCR, then lookup ----------
const scanModel = {
  stabilizer: new R.NameStabilizer(), tried: new Set(), pausedUntil: 0, busy: false, lastFailed: null, found: false, suggesting: false,
  reset() { this.stabilizer.reset(); this.tried.clear(); this.lastFailed = null; this.found = false; this.suggesting = false; this.busy = false; this.pausedUntil = 0; },
  resume() { this.found = false; this.suggesting = false; this.lastFailed = null; this.stabilizer.reset(); this.tried.clear(); this.pausedUntil = Date.now() + 1500; const l = top(); if (l?.type === 'scan') setStatus(l, null); },
};
let scanStream = null, scanTimer = null;
function setStatus(l, st) {
  l.status = st;
  const el = document.getElementById('scanStatus');
  if (el) { el.hidden = !st; el.innerHTML = scanStatusHtml(l); }
}
async function startScan(l) {
  scanModel.reset();
  if (!navigator.mediaDevices?.getUserMedia) { l.state = 'none'; if (top() === l) draw(); return; }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: S.settings.scanCamera }, width: { ideal: 1920 } } });
    if (!S.layers.includes(l)) { stream.getTracks().forEach(t => t.stop()); return; }
    scanStream = stream; l.state = 'live'; draw();
    scanTimer = setInterval(() => scanFrame(l), 250);
  } catch (e) {
    l.state = e.name === 'NotAllowedError' || e.name === 'SecurityError' ? 'denied' : 'none';
    if (S.layers.includes(l)) draw();
  }
}
function stopScan() { clearInterval(scanTimer); scanTimer = null; scanStream?.getTracks().forEach(t => t.stop()); scanStream = null; }
function attachScan() {
  const v = document.getElementById('scanVideo'), box = document.getElementById('scanLive'), g = document.getElementById('scanGuide');
  if (!v || !scanStream) return;
  v.srcObject = scanStream; v.play?.().catch(() => {});
  const r = R.guideRect(box.clientWidth, box.clientHeight, 0.8, 0.82);
  Object.assign(g.style, { left: r.x + 'px', top: r.y + 'px', width: r.w + 'px', height: r.h + 'px' });
}
function resumeScanIfTop() { if (top()?.type === 'scan' && S.scanResume) { S.scanResume = false; scanModel.pausedUntil = Date.now() + 1000; } }
async function scanFrame(l) {
  const m = scanModel, v = document.getElementById('scanVideo'), box = document.getElementById('scanLive');
  if (top() !== l || !v || !box || m.busy || m.found || m.suggesting || Date.now() < m.pausedUntil || v.readyState < 2) return;
  m.busy = true;
  try {
    const pw = box.clientWidth, ph = box.clientHeight, g = R.guideRect(pw, ph, 0.8, 0.82);
    const s = Math.max(pw / v.videoWidth, ph / v.videoHeight), ox = (v.videoWidth * s - pw) / 2, oy = (v.videoHeight * s - ph) / 2;
    const c = R.toCanvas(v, (g.x + ox) / s, (g.y + oy) / s, g.w / s, g.h / s);
    if (!R.isReady()) setStatus(l, { text: 'Preparing the text reader…', busy: true });
    else if (!l.status) setStatus(l, { text: 'Hold a card inside the frame.' });
    const names = await R.readTitle(c);
    if (top() !== l) return;
    if (!names) { if (!l.status?.suggestions) setStatus(l, { text: 'Hold a card inside the frame.' }); return; }
    const primary = names[0];
    setStatus(l, { text: `Reading “${primary}”…`, busy: true });
    const stable = m.stabilizer.add(primary);
    if (stable === m.lastFailed) return;
    // One clear read is enough when it closely matches a real card. Anything vaguer waits for a second read.
    if (!stable) {
      for (const name of names.filter(x => !m.tried.has(x))) {
        m.tried.add(name);
        const card = await L.quickMatch(name);
        if (top() !== l) return;
        if (card) { m.found = true; setStatus(l, null); openConfirm(card, name); m.stabilizer.reset(); return; }
      }
      return;
    }
    setStatus(l, { text: `Looking up “${stable}”…`, busy: true });
    await identifyAndShow(l, { names, setCode: null, collectorNumber: null }, stable);
    m.stabilizer.reset();
  } catch (e) {
    m.pausedUntil = Date.now() + 3000; setStatus(l, { text: e.message });
  } finally { m.busy = false; }
}
async function identifyAndShow(l, parsed, name) {
  const r = await L.identify([name, ...parsed.names.slice(1)], parsed.setCode, parsed.collectorNumber);
  // Scryfall's fuzzy search will match almost anything, so a read that barely resembles the card counts as no match.
  if (r.type === 'match' && L.cardSimilarity(name, r.card) < 0.6) { scanModel.lastFailed = name; setStatus(l, { text: `Read “${name}” but found no card. Adjust the card or search by name.` }); return; }
  if (r.type === 'match') { scanModel.found = true; setStatus(l, null); if (top() === l) openConfirm(r.card, name); }
  else if (r.type === 'suggestions') { scanModel.suggesting = true; setStatus(l, { suggestions: r.names }); }
  else { scanModel.lastFailed = name; setStatus(l, { text: `Read “${name}” but found no card. Adjust the card or search by name.` }); }
}
async function readStill(l, makeCanvas) {
  if (l.busy) return;
  l.busy = true; setStatus(l, { text: 'Preparing the text reader…', busy: true });
  try {
    const c = await makeCanvas();
    setStatus(l, { text: 'Reading the card…', busy: true });
    const parsed = await R.readCard(c);
    if (!parsed) { setStatus(l, { text: 'No card name could be read. Try a sharper, straight-on photo, or search by name.' }); return; }
    setStatus(l, { text: `Looking up “${parsed.names[0]}”…`, busy: true });
    await identifyAndShow(l, parsed, parsed.names[0]);
  } catch (e) { setStatus(l, { text: e.message }); }
  finally { l.busy = false; scanModel.found = false; scanModel.suggesting = false; }
}
const SAMPLES = ['Lightning Bolt', 'Sol Ring', 'Counterspell', 'Swords to Plowshares', 'Birds of Paradise'];
let sampleIndex = 0;
function runSample(l) {
  const name = SAMPLES[sampleIndex++ % SAMPLES.length];
  readStill(l, async () => {
    const f = (await L.cardExact(name)).faces[0];
    const res = await fetch(f.normal); if (!res.ok) throw new Error('The sample image could not load.');
    const bmp = await createImageBitmap(await res.blob());
    return R.toCanvas(bmp, 0, 0, bmp.width, bmp.height);
  });
}

// ---------- Events ----------
document.addEventListener('click', e => {
  if (suppressClick && e.detail !== 0) { suppressClick = false; e.preventDefault(); e.stopPropagation(); return; }
  const el = e.target.closest('[data-act],[data-stop]');
  if (el?.dataset.act) { if (el.classList.contains('dim') && e.target !== el) return; A[el.dataset.act]?.(el.dataset); return; }
  const timer = e.target.closest('[data-timer]');
  if (timer) { G.timerToggle(S.game.timer); S.game.timer.notified = false; tick(true); save(); return; }
  const press = e.target.closest('[data-press]');
  if (press && e.detail === 0) { stepLife(press.dataset.id, +press.dataset.press); return; } // Keyboard and assistive tech.
  const item = e.target.closest('[data-item]');
  if (item && !e.target.closest('button')) openDetail(item.dataset.item);
}, true);
function openDetail(id) { const it = S.game.stack.items.find(i => i.id === id); if (it) push({ type: 'detail', item: it }); }
document.addEventListener('keydown', e => {
  if ((e.key === 'Enter' || e.key === ' ') && e.target.matches?.('[data-item]')) { e.preventDefault(); openDetail(e.target.dataset.item); }
  if (e.key === 'Escape' && S.layers.length && top().type !== 'starter') { if (top().renaming) A.closeRename(); else pop(); }
});
document.addEventListener('submit', e => {
  e.preventDefault();
  if (e.target.dataset.form === 'rename') {
    const l = top(), v = e.target.querySelector('input').value.trim(); if (v) G.player(S.game, l.id).name = v;
    l.renaming = false; draw();
  }
});
let searchTimer;
document.addEventListener('input', e => {
  const b = e.target.dataset.bind; const l = top();
  if (b === 'seat') {
    S.draft.seats[+e.target.dataset.i].name = e.target.value; save();
    const tag = document.querySelector(`[data-pct="${e.target.dataset.i}"]`); if (tag) tag.textContent = seatPct(e.target.value);
    return;
  }
  if (b === 'pbName') { l.draftName = e.target.value; const add = document.getElementById('pbAdd'); if (add) add.disabled = !pbAddable(l.draftName); return; }
  if (b === 'abilitySource' || b === 'abilityEffect') {
    l[b === 'abilitySource' ? 'source' : 'effect'] = e.target.value;
    document.getElementById('abilityAdd').disabled = !(l.source.trim() || l.effect.trim()); return;
  }
  if (b === 'pickFilter') { l.filter = e.target.value; draw(); const i = document.getElementById('pickFilter'); i?.focus(); i?.setSelectionRange(l.filter.length, l.filter.length); return; }
  if (b === 'cardFilter') { l.filter = e.target.value; document.getElementById('savedCards').innerHTML = savedRows(l); return; }
  if (b === 'search') {
    l.query = e.target.value; clearTimeout(searchTimer);
    const t = l.query.trim(); l.seq = (l.seq || 0) + 1; const seq = l.seq;
    if (t.length < 2) { l.results = []; l.message = null; renderSearch(l); return; }
    renderSearch(l);
    searchTimer = setTimeout(async () => {
      try {
        const found = await L.suggestions(t); if (seq !== l.seq) return;
        l.results = found; l.message = found.length ? null : `No cards match “${t}”.`;
      } catch (err) { if (seq !== l.seq) return; l.results = []; l.message = err.message; }
      if (top() === l) renderSearch(l);
    }, 300);
  }
});
document.addEventListener('change', e => {
  if (e.target.id !== 'scanFile' || !e.target.files[0]) return;
  const file = e.target.files[0], l = top();
  readStill(l, async () => { const bmp = await createImageBitmap(file); return R.toCanvas(bmp, 0, 0, bmp.width, bmp.height, Math.min(1400, Math.max(900, bmp.width))); });
});
document.addEventListener('contextmenu', e => {
  if (e.target.closest('[data-timer]')) { e.preventDefault(); clearHold(); push({ type: 'timerMenu' }); return; }
  const it = e.target.closest('[data-item]');
  if (it) { e.preventDefault(); clearHold(); push({ type: 'rowMenu', id: it.dataset.item }); return; }
  if (e.target.closest('[data-press]')) e.preventDefault();
});

// Press-and-hold: tap steps once, hold repeats, sliding off cancels. One tracker per pointer, so players can press at once.
let suppressClick = false, holdTimer = null;
const clearHold = () => { clearTimeout(holdTimer); holdTimer = null; };
const presses = new Map();
document.addEventListener('pointerdown', e => {
  suppressClick = false;
  if (e.button > 0) return;
  const press = e.target.closest('[data-press]');
  if (press) {
    e.preventDefault(); press.setPointerCapture?.(e.pointerId);
    const st = { el: press, repeated: false, cancelled: false, steps: 0 };
    press.classList.add('down');
    const again = () => { st.repeated = true; st.steps++; stepLife(press.dataset.id, +press.dataset.press); st.t = setTimeout(again, st.steps > 10 ? 60 : 120); };
    st.t = setTimeout(again, 450);
    presses.set(e.pointerId, st);
    return;
  }
  const timer = e.target.closest('[data-timer]');
  if (timer) { holdTimer = setTimeout(() => { holdTimer = null; suppressClick = true; push({ type: 'timerMenu' }); }, 500); return; }
  const item = e.target.closest('[data-item]');
  if (item && !e.target.closest('button')) startRowDrag(e, item);
});
document.addEventListener('pointermove', e => {
  const st = presses.get(e.pointerId);
  if (st && !st.cancelled) {
    const r = st.el.getBoundingClientRect();
    if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) cancelPress(st);
  }
});
function cancelPress(st) { clearTimeout(st.t); st.cancelled = true; st.el.classList.remove('down'); }
const endPress = e => {
  const st = presses.get(e.pointerId); if (!st) { if (holdTimer) clearHold(); return; }
  presses.delete(e.pointerId); clearTimeout(st.t); st.el.classList.remove('down');
  if (e.type === 'pointerup' && !st.cancelled && !st.repeated) stepLife(st.el.dataset.id, +st.el.dataset.press);
};
document.addEventListener('pointerup', endPress);
document.addEventListener('pointercancel', endPress);

// Stack rows: swipe right copies, swipe left removes, a hold opens the menu.
function startRowDrag(e, el) {
  const id = el.dataset.item, x0 = e.clientX, y0 = e.clientY, under = el.previousElementSibling;
  let dx = 0, active = false, held = false, scale = stage.getBoundingClientRect().width / stage.offsetWidth || 1;
  const hold = setTimeout(() => { held = true; suppressClick = true; cleanup(); push({ type: 'rowMenu', id }); }, 550);
  const move = ev => {
    if (ev.pointerId !== e.pointerId) return;
    dx = (ev.clientX - x0) / scale;
    if (!active && Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(ev.clientY - y0)) { active = true; el.classList.add('dragging'); el.setPointerCapture?.(ev.pointerId); }
    if (Math.abs(dx) > 8 || Math.abs(ev.clientY - y0) > 8) clearTimeout(hold);
    if (active) {
      el.style.transform = `translateX(${dx}px)`;
      under.className = `under ${dx > 0 ? 'copy' : 'rm'}`;
      under.innerHTML = dx > 0 ? `<span>${icon('copy')} Copy</span><span></span>` : `<span></span><span>Remove ${icon('trash')}</span>`;
    }
  };
  const up = ev => {
    if (ev.pointerId !== e.pointerId) return;
    cleanup();
    if (held || !active) return;
    suppressClick = true; // Cleared by the next press, so a click that never fires can't swallow a later tap.
    el.classList.remove('dragging');
    if (dx > 80) { G.copyItem(S.game.stack, id); buzz(15); draw(); }
    else if (dx < -80) { G.removeItem(S.game.stack, id); buzz(15); draw(); }
    else el.style.transform = '';
  };
  function cleanup() { clearTimeout(hold); document.removeEventListener('pointermove', move); document.removeEventListener('pointerup', up); document.removeEventListener('pointercancel', up); }
  document.addEventListener('pointermove', move); document.addEventListener('pointerup', up); document.addEventListener('pointercancel', up);
}

// ---------- Stage fit ----------
function fit() {
  const vw = innerWidth, vh = innerHeight;
  // Width has to pass 560 as well: a keyboard can leave an upright phone wider than it is tall.
  const land = vw > vh && vh <= 500 && vw >= 560, phone = vw <= 500 || land;
  const w = phone ? vw : 402, h = phone ? vh : 874, s = phone ? 1 : Math.min(vw / 402, vh / 874, 1.3);
  Object.assign(stage.style, { width: w + 'px', height: h + 'px', position: 'absolute', left: '50%', top: '50%', transform: `translate(-50%,-50%) scale(${s})` });
  stage.style.setProperty('--sw', w + 'px'); stage.style.setProperty('--sh', h + 'px');
  document.documentElement.toggleAttribute('data-land', land);
  if (land === S.land) return;
  S.land = land;
  if (!app.firstChild) return;
  // The table's markup differs between the two, so redraw, and keep the cursor where it was.
  const focused = document.activeElement?.id;
  draw();
  if (focused) document.getElementById(focused)?.focus();
}
addEventListener('resize', fit);
// Some phones report the old size during the rotation itself.
addEventListener('orientationchange', () => setTimeout(fit, 250));
// Fetch the art up front so screens don't paint in pieces.
const preloadArt = () => ['parchment.jpg', 'teal.jpg', 'table-top.jpg', 'table-bottom.jpg', 'illo-lens.webp', 'illo-stack.webp', 'starter-card.jpg', 'frame-parchment.png', 'illo-hourglass.png', ...G.COLORS.map(c => `gem-${c}.png`)].forEach(n => { new Image().src = art(n); });
preloadArt();
if (skin().dir === 'moonspire') new Image().src = art('altar.jpg');
fit(); draw();
document.addEventListener('visibilitychange', () => { if (document.hidden) return; if (S.screen === 'table') wake(); checkForUpdate(); });
// Browsers can hold old copies of this site, and GitHub Pages lets them. Games are saved, so reloading loses nothing.
async function checkForUpdate() {
  if (S.layers.length) return;
  try {
    const res = await fetch(`version.json?t=${Date.now()}`, { cache: 'no-store' });
    const latest = res.ok ? (await res.json()).version : null;
    if (!latest || latest === APP_VERSION || sessionStorage.getItem('stackside.updateTried') === latest) return;
    sessionStorage.setItem('stackside.updateTried', latest);
    save();
    location.replace(`./?v=${latest}`);
  } catch { /* Offline, or storage is blocked: carry on with this copy. */ }
}
checkForUpdate();

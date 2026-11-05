// Presentation: screens, gestures and wiring. Game rules live in core.js, cards in lookup.js, OCR in recognition.js.
import * as G from './core.js';
import * as L from './lookup.js';
import * as R from './recognition.js';

const load = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
const S = {
  draft: { ...G.makeDraft(), ...load('stackside.draft', {}), startingSeat: null },
  game: load('stackside.game', null),
  screen: load('stackside.game', null) ? 'table' : 'setup',
  lastController: null,
  colorSeat: null,
  layers: [],
};
function save() {
  try {
    localStorage.setItem('stackside.draft', JSON.stringify({ seats: S.draft.seats, playerCount: S.draft.playerCount, timerMinutes: S.draft.timerMinutes }));
    if (S.game) localStorage.setItem('stackside.game', JSON.stringify(S.game)); else localStorage.removeItem('stackside.game');
  } catch { /* A private window can refuse storage. The game still works until the page closes. */ }
}

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const app = document.getElementById('app'), stage = document.getElementById('stage');
const top = () => S.layers[S.layers.length - 1];
const buzz = ms => { try { navigator.vibrate?.(ms); } catch { /* optional */ } };

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
  star: '<path fill="currentColor" stroke="none" d="M12 0l1.700 9.300L24 12l-10.300 2.700L12 24l-1.700-9.300L0 12l10.300-2.700z"/>',
};
const icon = (n, cls = '') => `<svg class="i ${cls}" viewBox="0 0 24 24" aria-hidden="true">${ic[n]}</svg>`;
document.head.insertAdjacentHTML('beforeend', '<style>svg.i .f{fill:currentColor;stroke:none}</style>');
const gem = (c, cls = '') => `<img class="gem ${cls}" src="assets/gem-${c}.png" alt="">`;
const divider = `<div class="divider">${icon('star')}</div>`;
const head = t => `<div class="head"><h2>${esc(t)}</h2>${divider}</div>`;
const flourish = '<svg class="flourish" viewBox="0 0 150 22" aria-hidden="true"><path d="M0 11h62M88 11h62" stroke="currentColor" stroke-width="1.200"/><path fill="currentColor" d="M75 0l1.800 9.200L86 11l-9.200 1.800L75 22l-1.800-9.200L64 11l9.200-1.800z"/></svg>';
const hero = ({ title = 'Stackside', small, left = '', right = '' }) => `<header class="hero ${small ? 'small' : ''}">
  <h1 class="${title.length > 9 ? 'long' : ''}">${esc(title)}</h1>${flourish}
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
function setupScreen() {
  const d = S.draft, g = S.game;
  const seats = Array.from({ length: d.playerCount }, (_, i) => {
    const s = d.seats[i];
    const row = `<div class="seat-row"><button class="gem-btn" data-act="pickColorSeat" data-i="${i}" aria-label="Change ${esc(G.seatName(d, i))}'s colour">${gem(s.color)}</button>
      <input id="seat${i}" data-bind="seat" data-i="${i}" value="${esc(s.name)}" placeholder="Player ${i + 1}" maxlength="24" autocomplete="off" aria-label="Player ${i + 1} name"></div>`;
    return S.colorSeat === i ? row + `<div class="seat-colors">${G.COLORS.map(c => `<button class="${c === s.color ? 'on' : ''}" data-act="setColor" data-i="${i}" data-c="${c}" aria-label="${c}">${gem(c)}</button>`).join('')}</div>` : row;
  }).join('');
  const starter = d.startingSeat != null ? G.seatName(d, d.startingSeat) : 'Not chosen';
  return `<section class="sheet">${hero({ right: `<button class="btn round info" data-act="openAbout" aria-label="About Stackside">i</button>` })}
    <div class="scroll">
      ${g ? `<div class="progress"><div><b>Game in progress</b><small>${esc(g.players.map(p => p.name).join(', '))}</small></div><button class="btn ember" data-act="resume">Resume</button></div>` : ''}
      <div class="group">${head('Players')}<div class="seg" role="radiogroup" aria-label="Number of players">${[2, 3, 4, 5, 6].map(n => `<button class="${n === d.playerCount ? 'on' : ''}" data-act="setCount" data-n="${n}" role="radio" aria-checked="${n === d.playerCount}">${n}</button>`).join('')}</div></div>
      <div class="seats ${d.playerCount > 4 ? 'dense' : ''}">${seats}</div>
      <div class="group">${head('Shared timer')}
        <div class="presets">${[25, 50, 75, 100].map(m => `<button class="btn ${m === d.timerMinutes ? 'ember' : 'plain'}" data-act="setMinutes" data-m="${m}">${m}m</button>`).join('')}</div>
        <div class="row"><span class="label" id="minutesLabel">${d.timerMinutes} minutes</span><div class="stepper"><button data-act="stepMinutes" data-d="-1" aria-label="One minute less">${icon('minus')}</button><button data-act="stepMinutes" data-d="1" aria-label="One minute more">${icon('plus')}</button></div></div>
      </div>
      <div class="group">${head('Starting player')}
        <div class="row"><span class="label">${esc(starter)}</span><button class="btn teal" data-act="pickDraftStarter">${icon('dice')} ${d.startingSeat != null ? 'Pick again' : 'Pick randomly'}</button></div>
      </div>
    </div>
    <div class="actions"><button class="cta" data-act="start"><span>Start game at ${G.STARTING_LIFE} life</span></button></div>${foot}</section>`;
}

function panelHtml(seat) {
  const g = S.game, p = g.players[seat.index], total = G.commanderTotal(p);
  const flag = g.startingPlayerId === p.id ? icon('flag') : '';
  const long = String(p.life).length > 2 ? 'long' : '';
  return `<div class="panel c-${p.color}">${frame}<img class="pgem" src="assets/gem-${p.color}.png" alt="">
    <div class="seat ${seat.orientation}">
      <button class="press minus" data-press="-1" data-id="${p.id}" aria-label="Decrease ${esc(p.name)}'s life" style="color:var(--ink-${p.color})"><span class="glyph">${icon('minus')}</span></button>
      <button class="press plus" data-press="1" data-id="${p.id}" aria-label="Increase ${esc(p.name)}'s life" style="color:var(--ink-${p.color})"><span class="glyph">${icon('plus')}</span></button>
      <div class="seat-in" style="--pink:var(--ink-${p.color})">
        <div class="pname">${flag}<span>${esc(p.name)}</span></div>
        <div class="life ${long}" data-life="${p.id}">${p.life}</div>
        <button class="pill" data-act="openCounters" data-id="${p.id}" aria-label="${esc(p.name)}'s counters: ${p.poison} poison, ${total} commander damage"><span>${icon('drop')}${p.poison}</span><span>${icon('shield')}${total}</span></button>
      </div>
    </div></div>`;
}
function stripHtml() {
  const n = S.game.stack.items.length;
  return `<div class="strip" id="strip">
    <button class="tbtn timer" id="timerBtn" data-timer aria-label="Shared timer. Tap to start or pause, hold for more."><span id="timerIcon" style="display:contents"></span><span id="timerLabel"></span></button>
    <button class="tbtn" data-act="pickGameStarter" aria-label="Pick a starting player">${icon('dice')}</button>
    <button class="tbtn ${n ? 'has' : ''}" data-act="openStack" aria-label="Stack, ${n} items">${icon('layers')}${n}</button>
    <button class="tbtn" data-act="openGameMenu" aria-label="Game menu">${icon('dots')}</button></div>`;
}
function tableScreen() {
  const n = S.game.players.length, rows = G.tableRows(n), mid = Math.floor(rows.length / 2);
  return `<div class="table n${n}"><div class="table-top"></div><div class="rows">${rows.map((row, i) =>
    (i === mid ? stripHtml() : '') + `<div class="trow">${row.map(panelHtml).join('')}</div>`).join('')}</div><div class="table-bottom"></div></div>`;
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
  const sideways = l.rot === 'left' || l.rot === 'right';
  const rename = l.renaming ? `<div class="dim" data-act="closeRename"><form class="modal" data-stop data-form="rename">${frame}${gem(p.color, 'top')}<h2>Rename player</h2><div class="divider">${icon('star')}</div>
      <input class="field" id="renameInput" value="${esc(l.draftName)}" maxlength="24" autocomplete="off" aria-label="Name">
      <div class="btns"><button type="button" class="btn teal" data-act="closeRename">Cancel</button><button class="btn ruby" type="submit">Save</button></div></form></div>` : '';
  const turned = l.rot !== 'bottom' ? `turned ${l.rot}` : '';
  const style = sideways ? '--turned-w:var(--sh);--turned-h:var(--sw)' : '--turned-w:var(--sw);--turned-h:var(--sh)';
  if (sideways) {
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
    ${editing ? `<div class="edit-arrows"><button data-act="moveItem" data-id="${item.id}" data-d="-1" ${i === 0 ? 'disabled' : ''} aria-label="Move up">${icon('up')}</button><button data-act="moveItem" data-id="${item.id}" data-d="1" ${i === S.game.stack.items.length - 1 ? 'disabled' : ''} aria-label="Move down">${icon('down')}</button></div>` : ''}</div>`;
  return `<div class="stack-row"><div class="under"></div>${body}</div>`;
}
function stackLayer(l) {
  const s = S.game.stack, topItem = s.items[0];
  const undo = s.history.length ? `<button class="undo" data-act="undo">${icon('undo')}<span>Put back ${esc(s.history[0].title)}</span></button>` : '';
  const main = s.items.length
    ? `<div class="scroll">${s.items.map((it, i) => stackRow(it, i, l.editing)).join('')}<p class="note">Swipe right to copy, left to remove. Tap for details, hold for more.</p></div>`
    : `<div class="scroll"><div class="empty"><img src="assets/illo-stack.webp" alt="">${divider}<h2>The stack is empty</h2><p>Scan a card, search for one, or add an ability. The newest item goes on top.</p>${divider}${undo}</div></div>`;
  return `<section class="sheet">${hero({ title: 'Stack', left: navBtn('Done', 'pop'), right: s.items.length > 1 ? navBtn(l.editing ? 'Finish' : 'Edit', 'toggleEdit') : '' })}${main}
    <div class="actions">${topItem ? `${undo}<button class="cta" data-act="resolve" style="font-size:${topItem.title.length > 20 ? 18 : topItem.title.length > 12 ? 21 : 25}px"><span>Resolve ${esc(topItem.title)}</span></button>` : ''}
      <div class="addbar"><button class="btn teal" data-act="openScan">${icon('camera')}Scan</button><button class="btn teal" data-act="openSearch">${icon('search')}Search</button><button class="btn teal" data-act="openAbility">${icon('bolt')}Ability</button></div></div>${foot}</section>`;
}
const factsHtml = (card, f, short) => `${f.normal ? `<div class="cardimg ${short ? 'short' : ''}"><img src="${esc(f.normal)}" alt="${esc(f.name)} card"></div>` : ''}
  <div class="facts"><div class="row"><h2>${esc(f.name)}</h2>${manaHtml(f.manaCost)}</div>${f.typeLine ? `<div>${esc(f.typeLine)}</div>` : ''}</div>
  ${f.oracleText ? `<div class="card-box" style="white-space:pre-line">${esc(f.oracleText)}</div>` : ''}
  <div class="credits">${f.artist ? `<span>Illustrated by ${esc(f.artist)}</span>` : ''}<span>${esc(card.setName)} #${esc(card.collectorNumber)}</span>${card.sourceUrl ? `<a href="${esc(card.sourceUrl)}" target="_blank" rel="noopener">Data and image from Scryfall</a>` : ''}</div>`;
function detailLayer(l) {
  const it = l.item, f = it.card?.faces[it.faceIndex];
  return `<section class="sheet">${hero({ small: true, right: navBtn('Done', 'pop') })}<div class="scroll">
    ${f ? factsHtml(it.card, f) : `<div class="facts"><h2 style="font:700 24px/1.15 var(--text)">${esc(it.title)}</h2><div>${G.KIND_LABEL[it.kind]}</div></div>${it.detail ? `<div class="card-box">${esc(it.detail)}</div>` : ''}`}
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
    ${t ? `<div class="group"><h2 style="font:700 19px/1.2 var(--text)">Not listed?</h2>${head('Controller')}${chipsHtml(l.controller)}<button class="typed" data-act="addTyped">Add “${esc(t)}” as typed</button></div>` : '<p class="note">Type at least two letters of a card name.</p>'}`;
}
function searchLayer(l) {
  return `<section class="sheet">${hero({ small: true })}<div class="scroll">
    <div class="searchbar"><div class="box">${icon('search')}<input id="searchInput" data-bind="search" value="${esc(l.query)}" placeholder="Card name" autocomplete="off" autocapitalize="off" spellcheck="false" aria-label="Card name"></div>
    <button class="btn ruby round" data-act="pop" aria-label="Cancel search" style="display:grid;place-items:center">${icon('x')}</button></div>
    <div class="group" id="searchResults" style="gap:12px">${searchResults(l)}</div></div>${foot}</section>`;
}
function confirmLayer(l) {
  const c = l.card, f = c.faces[l.faceIndex], weak = l.readName && L.cardSimilarity(l.readName, c) < 0.7;
  return `<section class="sheet">${hero({ small: true })}<div class="scroll">
    <div class="divider" style="color:var(--ink)"><h2 style="font:700 24px/1.1 var(--text)">Is this the card?</h2></div>
    ${weak ? `<div class="warn">${icon('warn')}<span>The scan read “${esc(l.readName)}”. Check this is your card.</span></div>` : ''}
    ${c.faces.length > 1 ? `<div class="seg">${c.faces.map((x, i) => `<button class="${i === l.faceIndex ? 'on' : ''}" data-act="setFace" data-i="${i}" style="font-size:14px">${esc(x.name)}</button>`).join('')}</div>` : ''}
    ${factsHtml(c, f, true)}
    ${l.readName ? '<p class="note">The printing shown may differ from the card in your hand.</p>' : ''}
    </div>
    <div class="actions"><div class="group">${head('Controller')}${chipsHtml(l.controller)}</div><div style="display:grid;grid-template-columns:1fr 1.2fr;gap:10px"><button class="btn plain" style="min-height:54px" data-act="rejectCard">Not this card</button><button class="btn ruby" style="min-height:54px;font-size:19px" data-act="acceptCard">Add to stack</button></div></div>${foot}</section>`;
}
function scanLayer(l) {
  const status = `<div class="scan-status" id="scanStatus" ${l.status ? '' : 'hidden'}>${scanStatusHtml(l)}</div>`;
  if (l.state === 'live') {
    return `<section class="sheet">${hero({ title: 'Scan a card', small: true, left: navBtn('Close', 'pop') })}
      <div class="scan-live" id="scanLive"><video id="scanVideo" playsinline muted autoplay></video><div class="scan-guide" id="scanGuide"></div>${status}</div>
      <div class="actions" style="padding-top:10px"><button class="btn teal" data-act="openSearch">${icon('search')} Search by name instead</button></div>${foot}</section>`;
  }
  const denied = l.state === 'denied', starting = l.state === 'starting';
  return `<section class="sheet">${hero({ title: 'Scan a card', small: true, left: navBtn('Close', 'pop') })}<div class="scroll">
    <img class="lens" src="assets/illo-lens.webp" alt="">
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
  return `<section class="sheet">${hero({ title: 'About', small: true, right: navBtn('Done', 'pop') })}<div class="scroll about">
    ${sect('crimson', 'What this app does', '<p>Stackside tracks numbers and order for you. Players remain responsible for the rules, priority, targets and applying effects.</p>')}
    ${sect('sky', 'Card data', '<p>Card data and images are provided by Scryfall. Stackside is free to use and is not produced by or endorsed by Scryfall.</p><a class="btn teal" href="https://scryfall.com" target="_blank" rel="noopener">Visit Scryfall</a>')}
    ${sect('amber', 'Legal', '<p>Stackside is unofficial Fan Content permitted under the Wizards of the Coast Fan Content Policy. Not approved or endorsed by Wizards. Portions of the materials used are property of Wizards of the Coast. ©Wizards of the Coast LLC.</p>')}
    ${sect('forest', 'Privacy', '<p>Scanning reads text on this device; camera images aren’t uploaded. Card names you look up are sent to Scryfall.</p>')}</div>${foot}</section>`;
}
function starterLayer(l) {
  const e = l.entries[l.cycling ?? l.selected];
  return `<div class="dim"><div class="starter" data-stop>${gem(e.color)}
    <div class="who"><b id="starterName" class="${e.name.length > 10 ? 'long' : ''}">${esc(e.name)}</b><i id="starterSub">${l.cycling == null ? 'goes first' : ''}</i></div>
    <button class="hot reroll" data-act="reroll" aria-label="Reroll"></button><button class="hot done" data-act="pop" aria-label="Done"></button></div></div>`;
}
function modal(title, body, buttons, stack) {
  return `<div class="dim" data-act="pop"><div class="modal" data-stop role="dialog" aria-label="${esc(title)}">${frame}${gem('crimson', 'top')}<h2>${esc(title)}</h2>${divider}<p>${esc(body)}</p><div class="btns ${stack ? 'stack' : ''}">${buttons}</div></div></div>`;
}
function stripBottom() {
  const el = document.getElementById('strip'); if (!el) return 400;
  return stage.clientHeight - el.offsetTop - el.offsetParent.offsetTop + 8;
}
function gameMenuLayer() {
  return `<div class="dim" style="background:rgba(4,20,22,.35)" data-act="pop"><div class="pop" data-stop style="right:10px;width:270px;bottom:${stripBottom()}px" role="menu">${frame}
    <button class="mitem danger" data-act="askEndGame"><span class="ic r">${icon('x')}</span>End game</button>
    <button class="mitem" data-act="openAbout"><span class="ic b">${icon('info')}</span>About</button>
    <button class="mitem" data-act="backToSetup"><span class="ic o">${icon('sliders')}</span>Back to setup</button>
</div></div>`;
}
function timerMenuLayer() {
  const d = G.clock(S.game.timer.duration);
  return `<div class="dim" style="background:rgba(4,20,22,.35)" data-act="pop"><div class="pop timerpop" data-stop style="bottom:${stripBottom()}px" role="menu">${frame}<img src="assets/illo-hourglass.png" alt="">
    <div class="list"><button class="btn plain" data-act="timerAdjust" data-d="-60">${icon('minus')}Remove 1 minute</button><button class="btn plain" data-act="timerAdjust" data-d="60">${icon('plus')}Add 1 minute</button><button class="btn plain" data-act="timerReset">${icon('reset')}Reset to ${d}</button></div><img src="assets/illo-hourglass.png" alt=""></div></div>`;
}
function rowMenuLayer(l) {
  const item = S.game.stack.items.find(i => i.id === l.id); if (!item) return '';
  return `<div class="dim" data-act="pop"><div class="modal" data-stop style="gap:8px">${frame}${gem('crimson', 'top')}<h2>${esc(item.title)}</h2>${divider}
    <div class="note" style="text-align:center">Copy, controlled by…</div>${chipsHtml(null, 'copyFor')}
    <button class="btn teal" data-act="abilityFrom">${icon('bolt')} Add ability from this</button><button class="btn ruby" data-act="removeFromMenu">${icon('trash')} Remove from stack</button><button class="btn plain" data-act="pop">Cancel</button></div></div>`;
}
const LAYERS = {
  counters: countersLayer, stack: stackLayer, detail: detailLayer, ability: abilityLayer, search: searchLayer, confirm: confirmLayer,
  scan: scanLayer, about: aboutLayer, starter: starterLayer, gameMenu: gameMenuLayer, timerMenu: timerMenuLayer, rowMenu: rowMenuLayer,
  replace: () => modal('Replace the game in progress?', 'Its life totals, counters and stack will be lost.', `<button class="cta mid" data-act="startForced"><span>Start new game</span></button><button class="btn teal" data-act="pop">Cancel</button>`, true),
  endGame: () => modal('End this game?', 'Life totals, counters and the stack will be cleared.', `<button class="btn teal" data-act="pop">Keep playing</button><button class="btn ruby" data-act="endGame">End game</button>`),
};

// ---------- Rendering ----------
function draw() {
  const scrolls = S.layers.map((_, i) => app.querySelector(`.layer[data-i="${i}"] .scroll`)?.scrollTop ?? 0);
  const baseScroll = app.querySelector('.base .scroll')?.scrollTop ?? 0;
  app.innerHTML = `<div class="layer base" ${S.layers.some(l => !['starter', 'gameMenu', 'timerMenu', 'replace', 'endGame', 'rowMenu'].includes(l.type)) ? 'inert' : ''}>${S.screen === 'table' && S.game ? tableScreen() : setupScreen()}</div>` +
    S.layers.map((l, i) => `<div class="layer" data-i="${i}" ${i < S.layers.length - 1 ? 'inert' : ''}>${LAYERS[l.type](l)}</div>`).join('');
  S.layers.forEach((_, i) => { const el = app.querySelector(`.layer[data-i="${i}"] .scroll`); if (el) el.scrollTop = scrolls[i]; });
  const b = app.querySelector('.base .scroll'); if (b) b.scrollTop = baseScroll;
  tick(true);
  attachScan();
  const t = top();
  if (t?.autofocus) { app.querySelector('#' + t.autofocus)?.focus(); delete t.autofocus; }
  if (t?.renaming && t.focusRename) { const i = app.querySelector('#renameInput'); i?.focus(); i?.select(); t.focusRename = false; }
  save();
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
  const el = document.querySelector(`[data-life="${id}"]`);
  if (el) {
    const r = recent[id] ??= { n: 0 };
    r.n += d; clearTimeout(r.t);
    el.innerHTML = `${p.life}${r.n ? `<span class="delta">${r.n > 0 ? '+' : ''}${r.n}</span>` : ''}`;
    el.classList.toggle('long', String(p.life).length > 2);
    r.t = setTimeout(() => { r.n = 0; const e = document.querySelector(`[data-life="${id}"]`); if (e) e.textContent = G.player(S.game, id)?.life ?? ''; }, 1800);
  }
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
    name.textContent = e.name; name.classList.toggle('long', e.name.length > 10); gemEl.src = `assets/gem-${e.color}.png`;
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
let lock; const wake = async () => { try { lock = await navigator.wakeLock?.request('screen'); } catch { /* Optional: not every browser allows it. */ } };

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
  openAbout() { if (top()?.type === 'gameMenu') S.layers.pop(); push({ type: 'about' }); },
  openGameMenu() { push({ type: 'gameMenu' }); },
  askEndGame() { S.layers.pop(); push({ type: 'endGame' }); },
  endGame() { S.game = null; S.screen = 'setup'; S.layers = []; draw(); },
  backToSetup() { S.layers = []; S.screen = 'setup'; draw(); },
  timerAdjust(d) { G.timerAdjust(S.game.timer, +d.d); S.game.timer.notified = false; tick(true); save(); },
  timerReset() { G.timerReset(S.game.timer); S.game.timer.notified = false; S.layers.pop(); draw(); },
  openCounters(d) { push({ type: 'counters', id: d.id, rot: G.seatOf(S.game, d.id)?.orientation ?? 'bottom' }); },
  adjPoison(d) { G.adjustPoison(S.game, d.id, +d.d); draw(); },
  adjCommander(d) { G.adjustCommander(S.game, top().id, d.id, +d.d); draw(); },
  toggleCommander() { S.game.commanderChangesLife = !S.game.commanderChangesLife; draw(); },
  openRename() { const l = top(); l.renaming = true; l.focusRename = true; l.draftName = G.player(S.game, l.id).name; draw(); },
  closeRename() { top().renaming = false; draw(); },
  openStack() { push({ type: 'stack' }); },
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
  acceptCard() { const l = top(); G.push(S.game.stack, G.spellItem(l.card, l.faceIndex, l.controller)); S.lastController = l.controller; buzz(15); returnToStack(); },
  rejectCard() { pop(); if (top()?.type === 'scan') scanModel.resume(); },
  openScan() { const l = { type: 'scan', state: 'starting', status: null }; push(l); startScan(l); },
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
  stabilizer: new R.NameStabilizer(), pausedUntil: 0, busy: false, lastFailed: null, found: false, suggesting: false,
  reset() { this.stabilizer.reset(); this.lastFailed = null; this.found = false; this.suggesting = false; this.busy = false; this.pausedUntil = 0; },
  resume() { this.found = false; this.suggesting = false; this.lastFailed = null; this.stabilizer.reset(); this.pausedUntil = Date.now() + 1500; const l = top(); if (l?.type === 'scan') setStatus(l, null); },
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
    const stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 } } });
    if (!S.layers.includes(l)) { stream.getTracks().forEach(t => t.stop()); return; }
    scanStream = stream; l.state = 'live'; draw();
    scanTimer = setInterval(() => scanFrame(l), 700);
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
    if (!l.status) setStatus(l, { text: 'Hold a card inside the frame.' });
    const parsed = await R.readCard(c);
    if (top() !== l) return;
    if (!parsed) { if (!l.status?.suggestions) setStatus(l, { text: 'Hold a card inside the frame.' }); return; }
    const primary = parsed.names[0];
    setStatus(l, { text: `Reading “${primary}”…`, busy: true });
    const stable = m.stabilizer.add(primary);
    if (!stable || stable === m.lastFailed) return;
    setStatus(l, { text: `Looking up “${stable}”…`, busy: true });
    await identifyAndShow(l, parsed, stable);
    m.stabilizer.reset();
  } catch (e) {
    m.pausedUntil = Date.now() + 3000; setStatus(l, { text: e.message });
  } finally { m.busy = false; }
}
async function identifyAndShow(l, parsed, name) {
  const r = await L.identify([name, ...parsed.names.slice(1)], parsed.setCode, parsed.collectorNumber);
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
  if (b === 'seat') { S.draft.seats[+e.target.dataset.i].name = e.target.value; save(); return; }
  if (b === 'abilitySource' || b === 'abilityEffect') {
    l[b === 'abilitySource' ? 'source' : 'effect'] = e.target.value;
    document.getElementById('abilityAdd').disabled = !(l.source.trim() || l.effect.trim()); return;
  }
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
  const vw = innerWidth, vh = innerHeight, phone = vw <= 500;
  const w = phone ? vw : 402, h = phone ? vh : 874, s = phone ? 1 : Math.min(vw / 402, vh / 874, 1.3);
  Object.assign(stage.style, { width: w + 'px', height: h + 'px', position: 'absolute', left: '50%', top: '50%', transform: `translate(-50%,-50%) scale(${s})` });
  stage.style.setProperty('--sw', w + 'px'); stage.style.setProperty('--sh', h + 'px');
}
addEventListener('resize', fit);
// Fetch the art up front so screens don't paint in pieces.
['illo-lens.webp', 'illo-stack.webp', 'starter-card.jpg', 'frame-parchment.png', 'illo-hourglass.png', ...G.COLORS.map(c => `gem-${c}.png`)]
  .forEach(n => { new Image().src = 'assets/' + n; });
fit(); draw();
document.addEventListener('visibilitychange', () => { if (!document.hidden && S.screen === 'table') wake(); });

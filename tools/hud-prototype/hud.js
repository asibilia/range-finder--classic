/*
 * PROTOTYPE — throwaway HUD mockup for wayfinder ticket 'HUD look and layout' (#18). Not production.
 *
 * Plain JS, no dependencies. Layout of this file:
 *   1. constants
 *   2. state (S) + actions (act) — the Scenario panel and the auto demo both drive these
 *   3. tick() advances the simulation, derive() builds the per-frame view model
 *   4. paint atoms (icon, swing bar, mana bar, pips) — visuals only, no layout
 *   5. one mount function per variant (A, B, C, D) — each owns its own layout completely
 *   6. scene, switcher, scenario panel wiring, requestAnimationFrame loop
 *
 * All HUD coordinates are in a fixed 1600x900 "game screen" that is scaled to fit the window.
 */

// ============================================================ 1. constants

const STAGE_W = 1600;
const STAGE_H = 900;

const SWING_DUR = 3.4; // main hand, seconds
const SAFE_FRAC = 0.15; // safe window = first 15% of the swing
const LB_CAST = 2.5;
const SHOCK_CD = 6;
const SS_CD = 8;
const SHOCK_MANA = 15; // % of max mana
const SS_MANA = 10; // prototype guess
const LB_MANA = 10; // prototype guess
const LOW_MANA = 20;
const TOTEM_PULSE = 5; // pulse during the last 5 s
const KILL_FLASH = 0.6;
const LAND_FLASH = 0.15;

const ELEMENTS = ['earth', 'fire', 'water', 'air'];
const TOTEM_DUR = { earth: 120, fire: 35, water: 300, air: 120 };
const IMBUE_LEFT = { active: 58 * 60, expiring: 4 * 60, missing: 0 };

const ICONS = {
  earth: { glyph: '🪨', color: '#8a6a3a', label: 'Earth' },
  fire: { glyph: '🔥', color: '#b8401c', label: 'Fire' },
  water: { glyph: '💧', color: '#2463a8', label: 'Water' },
  air: { glyph: '🌪️', color: '#5f8fa3', label: 'Air' },
  ls: { glyph: '⚡', color: '#4b52c8', label: 'Lightning Shield' },
  shock: { glyph: '🌍', color: '#5f7424', label: 'Earth Shock' },
  ss: { glyph: '🌩️', color: '#34438f', label: 'Stormstrike' },
  imbue: { glyph: '🗡️', color: '#8d6e24', label: 'Weapon imbue' },
  mw: { glyph: '🌀', color: '#1f7896', label: 'Maelstrom Weapon' },
};

const BANDS = {
  melee: { label: 'Melee', yd: '' },
  shock: { label: 'Shock range', yd: '20 yd' },
  bolt: { label: 'Bolt range', yd: '30 yd' },
  out: { label: 'Out of range', yd: '' },
  none: { label: '', yd: '' },
};

// where the enemy silhouette stands for each range band (feet x/y + scale).
// Camera matches the user's screenshot: big character in the foreground, target ahead in the upper middle.
const ENEMY_POS = {
  melee: { x: 895, y: 452, s: 1 },
  shock: { x: 915, y: 356, s: 0.55 },
  bolt: { x: 935, y: 318, s: 0.4 },
  out: { x: 955, y: 290, s: 0.28 },
};

const VARIANTS = [
  { key: 'A', name: 'Compact block', mount: mountA },
  { key: 'B', name: 'Halo around the character', mount: mountB },
  { key: 'C', name: 'Spread by job', mount: mountC },
  { key: 'D', name: 'Thin strip', mount: mountD },
];

// ============================================================ 2. state + actions

const clock = () => performance.now() / 1000;
const params = new URLSearchParams(location.search);

function initialState(t0) {
  return {
    variant: 'A',
    engaged: true,
    autoAttack: true,
    range: 'melee',
    swingStart: t0,
    swingWasActive: true,
    lastLand: -99,
    cast: null,
    castFrozen: 0,
    shockCdStart: -99,
    ssLearned: true,
    ssCdStart: -99,
    shocksClip: false,
    totems: {
      earth: { start: t0 - 36, dur: TOTEM_DUR.earth },
      fire: { start: t0 - 13, dur: TOTEM_DUR.fire },
      water: { start: t0 - 110, dur: TOTEM_DUR.water },
      air: { start: t0 - 75, dur: TOTEM_DUR.air },
    },
    killedAt: { earth: -99, fire: -99, water: -99, air: -99 },
    lsCharges: 3,
    imbue: 'active',
    imbueExpiresAt: t0 + IMBUE_LEFT.active,
    mana: 70,
    maelstrom: 2,
    resting: false,
    blizzSwing: true,
    autoDemo: true,
    lastEvent: 'Loaded default scenario',
  };
}

const S = initialState(clock());
const urlVariant = (params.get('variant') || '').toUpperCase();
S.variant = VARIANTS.some((v) => v.key === urlVariant) ? urlVariant : 'A';
S.autoDemo = params.get('demo') !== '0'; // ?demo=0 starts paused (handy for screenshots)

let dirty = true;
let demoStart = clock();
let demoIdx = 0;

function note(msg) {
  S.lastEvent = msg;
  dirty = true;
}

const swingActive = () => S.autoAttack && S.range !== 'none';
const swingProgress = (now) => (swingActive() ? clamp01((now - S.swingStart) / SWING_DUR) : 0);

const act = {
  setEngaged(on) {
    S.engaged = on;
    if (!on) {
      S.range = 'none';
      S.autoAttack = false;
    }
    note(on ? 'Engaged' : 'Disengaged — target cleared, auto-attack off');
  },
  setAutoAttack(on) {
    S.autoAttack = on;
    note(on ? 'Auto-attack on' : 'Auto-attack off');
  },
  setRange(band) {
    S.range = band;
    if (band !== 'none') S.engaged = true;
    note(band === 'none' ? 'Target cleared' : `Range band: ${BANDS[band].label}`);
  },
  hardCast() {
    const now = clock();
    if (S.cast) return note('Already casting');
    if (S.mana < LB_MANA) return note('Not enough mana for Lightning Bolt');
    S.castFrozen = swingProgress(now);
    S.cast = { start: now, dur: LB_CAST };
    S.mana -= LB_MANA;
    note('Hard casting Lightning Bolt (2.5 s) — swing greyed out');
  },
  castShock() {
    const now = clock();
    if (S.cast) return note('Busy casting');
    if (now < S.shockCdStart + SHOCK_CD) return note('Shock is on cooldown');
    if (S.mana < SHOCK_MANA) return note('Not enough mana for Earth Shock');
    S.shockCdStart = now;
    S.mana -= SHOCK_MANA;
    if (S.shocksClip && swingActive()) {
      S.swingStart = now;
      return note('Earth Shock — clipped the swing (shocks clip is on)');
    }
    note('Earth Shock — 6 s shared shock cooldown');
  },
  castSS() {
    const now = clock();
    if (!S.ssLearned) return note('Stormstrike not learned');
    if (S.cast) return note('Busy casting');
    if (now < S.ssCdStart + SS_CD) return note('Stormstrike is on cooldown');
    if (S.mana < SS_MANA) return note('Not enough mana for Stormstrike');
    S.ssCdStart = now;
    S.mana -= SS_MANA;
    note('Stormstrike — 8 s cooldown');
  },
  dropTotem(el) {
    S.totems[el] = { start: clock(), dur: TOTEM_DUR[el] };
    note(`Dropped ${ICONS[el].label} totem (${TOTEM_DUR[el]} s)`);
  },
  killFire() {
    if (!S.totems.fire) return note('No Fire totem to kill');
    S.totems.fire = null;
    S.killedAt.fire = clock();
    note('Fire totem killed early');
  },
  waterTo7() {
    S.totems.water = { start: clock() - (TOTEM_DUR.water - 7), dur: TOTEM_DUR.water };
    note('Water totem set to 7 s left');
  },
  castLS() {
    S.lsCharges = 3;
    note('Lightning Shield — 3 charges');
  },
  popLS() {
    if (S.lsCharges === 0) return note('Lightning Shield is already down');
    S.lsCharges -= 1;
    note(`Lightning Shield charge used — ${S.lsCharges} left`);
  },
  setImbue(mode) {
    S.imbue = mode;
    S.imbueExpiresAt = clock() + IMBUE_LEFT[mode];
    note(`Weapon imbue: ${mode}`);
  },
  setMana(pct) {
    S.mana = pct;
    note(`Mana ${pct}%`);
  },
  setMaelstrom(n) {
    S.maelstrom = n;
    note(`Maelstrom Weapon ${n}/5`);
  },
  setShocksClip(on) {
    S.shocksClip = on;
    note(`Shocks clip: ${on ? 'on' : 'off'}`);
  },
  setSSLearned(on) {
    S.ssLearned = on;
    note(`Stormstrike learned: ${on ? 'yes' : 'no'}`);
  },
  setBlizzSwing(on) {
    S.blizzSwing = on;
    note(`Blizzard swing bar: ${on ? 'shown' : 'hidden (player turned it off)'}`);
  },
  setResting(on) {
    S.resting = on;
    note(`Resting / mounted: ${on ? 'on (reminders suppressed)' : 'off'}`);
  },
  setAutoDemo(on) {
    S.autoDemo = on;
    if (on) {
      demoStart = clock();
      demoIdx = 0;
    }
    note(`Auto demo ${on ? 'on' : 'off'}`);
  },
};

// Scripted fight. Starts from the default (mid-fight) state and loops:
// shock → Stormstrike → hard cast → step out of range → back → LS charges pop → disengage
// (HUD fades, reminders stay) → refresh buffs → engage → drop totems → …
const DEMO = [
  [1.5, () => act.setMaelstrom(3)],
  [3.0, () => act.castShock()],
  [4.5, () => act.setMaelstrom(4)],
  [6.0, () => act.castSS()],
  [8.5, () => act.hardCast()],
  [11.8, () => act.dropTotem('fire')],
  [12.8, () => act.setMaelstrom(5)],
  [15.0, () => act.setMaelstrom(0)],
  [16.0, () => act.setRange('bolt')],
  [17.5, () => act.setRange('shock')],
  [19.0, () => act.setRange('melee')],
  [20.5, () => act.popLS()],
  [22.0, () => act.popLS()],
  [23.5, () => act.popLS()],
  [24.5, () => act.killFire()],
  [25.5, () => act.waterTo7()],
  [26.5, () => act.setMana(12)],
  [28.0, () => act.setEngaged(false)],
  [28.6, () => act.setImbue('expiring')],
  [31.0, () => act.castLS()],
  [32.5, () => act.setImbue('active')],
  [33.0, () => act.setMana(70)],
  [34.0, () => act.setRange('bolt')],
  [35.0, () => act.setRange('shock')],
  [35.5, () => act.dropTotem('earth')],
  [36.5, () => { act.setRange('melee'); act.setAutoAttack(true); }],
  [37.0, () => act.dropTotem('fire')],
  [37.8, () => act.dropTotem('water')],
  [38.6, () => act.dropTotem('air')],
  [39.2, () => act.setMaelstrom(2)],
];
const DEMO_LEN = 41;

function runDemo(now) {
  if (now - demoStart >= DEMO_LEN) {
    demoStart = now;
    demoIdx = 0;
  }
  const dt = now - demoStart;
  while (demoIdx < DEMO.length && DEMO[demoIdx][0] <= dt) {
    DEMO[demoIdx][1]();
    demoIdx += 1;
  }
}

// ============================================================ 3. simulation + view model

function tick(now) {
  const active = swingActive();
  if (active && !S.swingWasActive) S.swingStart = now;
  S.swingWasActive = active;

  if (S.cast && now >= S.cast.start + S.cast.dur) {
    S.swingStart = S.cast.start + S.cast.dur; // restart from empty when the cast ends
    S.cast = null;
    note('Lightning Bolt finished — swing restarts from empty');
  }
  if (active && !S.cast) {
    while (now - S.swingStart >= SWING_DUR) {
      S.swingStart += SWING_DUR;
      S.lastLand = S.swingStart;
    }
  }
  for (const el of ELEMENTS) {
    const t = S.totems[el];
    if (t && now >= t.start + t.dur) {
      S.totems[el] = null;
      note(`${ICONS[el].label} totem expired`);
    }
  }
  if (S.autoDemo) runDemo(now);
}

const clamp01 = (x) => Math.min(1, Math.max(0, x));
const cdText = (s) => (s <= 0 ? '' : String(Math.ceil(s)));
const totemText = (s) => (s >= 90 ? `${Math.round(s / 60)}m` : String(Math.ceil(s)));
const minutesText = (s) => (s >= 60 ? `${Math.ceil(s / 60)}m` : `${Math.ceil(s)}s`);

function cooldownView(start, dur, manaCost, now) {
  const left = Math.max(0, start + dur - now);
  return { ready: left === 0, left, leftFrac: left / dur, text: cdText(left), oom: S.mana < manaCost, clip: false };
}

function derive(now) {
  const swinging = swingActive();
  const casting = !!S.cast;
  const progress = casting ? S.castFrozen : swinging ? clamp01((now - S.swingStart) / SWING_DUR) : 0;
  const swing = {
    visible: swinging,
    progress,
    remaining: SWING_DUR * (1 - progress),
    inSafe: progress <= SAFE_FRAC,
    casting,
    castLeft: casting ? Math.max(0, S.cast.start + S.cast.dur - now) : 0,
    outOfRange: S.range !== 'melee',
    landed: swinging && now - S.lastLand < LAND_FLASH,
  };

  const shock = cooldownView(S.shockCdStart, SHOCK_CD, SHOCK_MANA, now);
  shock.clip = S.shocksClip && shock.ready && swinging && !casting && !swing.inSafe;
  const ss = cooldownView(S.ssCdStart, SS_CD, SS_MANA, now);
  ss.learned = S.ssLearned;

  const totems = ELEMENTS.map((el) => {
    const t = S.totems[el];
    const left = t ? Math.max(0, t.start + t.dur - now) : 0;
    return {
      el,
      active: !!t,
      left,
      elapsedFrac: t ? 1 - left / t.dur : 0,
      text: t ? totemText(left) : '',
      pulse: !!t && left <= TOTEM_PULSE,
      killed: now - S.killedAt[el] < KILL_FLASH,
    };
  });

  const imbueLeft = S.imbue === 'missing' ? 0 : Math.max(0, S.imbueExpiresAt - now);
  const imbue = {
    mode: S.imbue,
    left: imbueLeft,
    text: S.imbue === 'missing' ? '' : minutesText(imbueLeft),
    missing: S.imbue === 'missing',
    expiring: S.imbue === 'expiring',
  };
  const ls = { charges: S.lsCharges, down: S.lsCharges === 0 };
  const mana = { pct: S.mana, low: S.mana < LOW_MANA };
  const mw = { stacks: S.maelstrom, full: S.maelstrom >= 5 };

  // Reminders: silent, shown even when the HUD is hidden, suppressed while resting/mounted.
  // "Expiring" only nags out of combat (Engaged stands in for "in combat" here).
  const reminders = [];
  if (!S.resting) {
    if (imbue.missing || (imbue.expiring && !S.engaged)) reminders.push('imbue');
    if (ls.down) reminders.push('ls');
  }

  return { hudVisible: S.engaged, range: S.range, swing, shock, ss, totems, imbue, ls, mana, mw, reminders };
}

// ============================================================ 4. paint atoms (no layout here)

function h(tag, cls, parent, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  if (parent) parent.appendChild(n);
  return n;
}

function place(n, x, y, w, hh) {
  n.style.left = `${x}px`;
  n.style.top = `${y}px`;
  if (w != null) n.style.width = `${w}px`;
  if (hh != null) n.style.height = `${hh}px`;
  return n;
}

function anchor(parent, x, y) {
  return place(h('div', 'anchor', parent), x, y);
}

function setText(n, s) {
  if (n._t !== s) {
    n._t = s;
    n.textContent = s;
  }
}

function makeIcon(kind, size, extra) {
  const n = h('div', `icon${extra ? ` ${extra}` : ''}`);
  n.style.setProperty('--size', `${size}px`);
  n.style.setProperty('--c', ICONS[kind].color);
  n.title = ICONS[kind].label;
  h('span', 'icon-glyph', n, ICONS[kind].glyph);
  n._swirl = h('span', 'icon-swirl', n);
  n._num = h('span', 'icon-num', n);
  n._badge = h('span', 'icon-badge', n);
  n._dark = -1;
  return n;
}

const ICON_STATES = ['is-empty', 'is-active', 'is-cd', 'is-ready', 'is-oom', 'is-clip', 'is-pulse', 'is-killed', 'is-reminder', 'is-warn'];

function paintIcon(n, o) {
  for (const c of ICON_STATES) n.classList.toggle(c, !!o[c]);
  const d = Math.round((o.dark || 0) * 1000) / 1000;
  if (d !== n._dark) {
    n._dark = d;
    n.style.setProperty('--dark', d);
  }
  setText(n._num, o.num || '');
  setText(n._badge, o.badge || '');
}

function paintTotem(n, t) {
  paintIcon(n, {
    'is-empty': !t.active,
    'is-active': t.active,
    'is-pulse': t.pulse,
    'is-killed': t.killed,
    dark: t.elapsedFrac,
    num: t.text,
  });
}

function paintCooldown(n, c) {
  paintIcon(n, {
    'is-ready': c.ready && !c.oom,
    'is-cd': !c.ready,
    'is-oom': c.oom,
    'is-clip': c.clip,
    dark: c.leftFrac,
    num: c.text,
  });
}

function paintImbue(n, im, showText) {
  paintIcon(n, { 'is-empty': im.missing, 'is-reminder': im.missing, 'is-warn': im.expiring, num: showText ? im.text : '' });
}

function paintLS(n, ls) {
  paintIcon(n, { 'is-empty': ls.down, 'is-reminder': ls.down, badge: ls.down ? '' : String(ls.charges) });
}

function paintReminders(icons, list) {
  for (const key of Object.keys(icons)) {
    const on = list.includes(key);
    const target = icons[key]._item || icons[key];
    target.style.display = on ? '' : 'none';
    paintIcon(icons[key], { 'is-reminder': on });
  }
}

function makeSwing(extra) {
  const r = h('div', `swing ${extra}`);
  r._fill = h('div', 'swing-fill', r);
  h('div', 'swing-safe', r);
  r._spark = h('div', 'swing-spark', r);
  r._text = h('div', 'swing-text', r);
  return r;
}

function swingLabel(s) {
  if (!s.visible) return '';
  if (s.casting) return `casting · ${s.castLeft.toFixed(1)}s`;
  if (s.outOfRange) return 'out of range';
  return s.remaining.toFixed(1);
}

function paintSwing(r, s) {
  r.classList.toggle('is-off', !s.visible);
  r.classList.toggle('is-casting', s.casting);
  r.classList.toggle('is-oor', s.outOfRange && !s.casting && s.visible);
  r.classList.toggle('in-safe', s.inSafe && !s.casting && s.visible);
  r.classList.toggle('is-landed', s.landed && !s.outOfRange);
  const p = s.progress.toFixed(4);
  r._fill.style.transform = `scaleX(${p})`;
  r._spark.style.left = `${p * 100}%`;
  setText(r._text, swingLabel(s));
}

function makeMana(extra, vertical) {
  const r = h('div', `mana ${extra}${vertical ? ' is-vertical' : ''}`);
  r._fill = h('div', 'mana-fill', r);
  r._text = h('div', 'mana-text', r);
  r._vertical = vertical;
  return r;
}

function paintMana(r, m) {
  r.classList.toggle('is-low', m.low);
  const f = (m.pct / 100).toFixed(3);
  if (r._f !== f) {
    r._f = f;
    r._fill.style.transform = r._vertical ? `scaleY(${f})` : `scaleX(${f})`;
  }
  setText(r._text, `${Math.round(m.pct)}%`);
}

function makePips(extra) {
  const r = h('div', `pips ${extra}`);
  r.title = ICONS.mw.label;
  r._pips = [0, 1, 2, 3, 4].map(() => h('span', 'pip', r));
  return r;
}

function paintPips(r, mw) {
  r._pips.forEach((p, i) => p.classList.toggle('is-on', i < mw.stacks));
  r.classList.toggle('is-full', mw.full);
}

function paintBand(n, band, textNode, ydNode) {
  if (n.dataset.band !== band) n.dataset.band = band;
  setText(textNode, BANDS[band].label);
  if (ydNode) setText(ydNode, BANDS[band].yd);
}

// ============================================================ 5. variants (one layout each)

// ---- A: Compact block — one tight movable card, sitting just above Blizzard's swing bar
// (centred on it, over the character's lower back).
function mountA(root) {
  const rem = place(h('div', 'reminders a-reminders', root), 668, 534);
  const remIcons = { imbue: makeIcon('imbue', 32), ls: makeIcon('ls', 32) };
  rem.append(remIcons.imbue, remIcons.ls);

  const card = place(h('div', 'hud-layer a-card', root), 668, 572, 260);
  h('div', 'a-grip', card, '⠿⠿').title = 'Drag to move (not wired in the prototype)';
  const band = h('div', 'a-range', card);
  const bandText = h('span', '', band);
  const bandYd = h('span', 'a-range-yd', band);
  const swing = makeSwing('a-swing');
  card.append(swing);
  const totemRow = h('div', 'a-totems', card);
  const totems = ELEMENTS.map((el) => totemRow.appendChild(makeIcon(el, 44, 'is-duration')));
  const iconRow = h('div', 'a-icons', card);
  const imbue = iconRow.appendChild(makeIcon('imbue', 34));
  const ls = iconRow.appendChild(makeIcon('ls', 34));
  h('span', 'a-sep', iconRow);
  const shock = iconRow.appendChild(makeIcon('shock', 34));
  const ss = iconRow.appendChild(makeIcon('ss', 34));
  const mwBox = h('div', 'a-mw', iconRow);
  h('span', 'a-mw-glyph', mwBox, ICONS.mw.glyph);
  const mw = mwBox.appendChild(makePips(''));
  const mana = makeMana('a-mana');
  card.append(mana);

  return function updateA(v) {
    card.classList.toggle('is-hidden', !v.hudVisible);
    paintBand(band, v.range, bandText, bandYd);
    paintSwing(swing, v.swing);
    v.totems.forEach((t, i) => paintTotem(totems[i], t));
    paintImbue(imbue, v.imbue, true);
    paintLS(ls, v.ls);
    paintCooldown(shock, v.shock);
    ss.style.display = v.ss.learned ? '' : 'none';
    paintCooldown(ss, v.ss);
    paintPips(mw, v.mw);
    paintMana(mana, v.mana);
    paintReminders(remIcons, v.reminders);
  };
}

// ---- B: Halo — pieces orbit the character and work with the unit frames that already flank it:
// range above the head (above Blizzard's floating name), swing under the chest, totems curving
// under the player frame, cooldowns + self-buffs curving under the target frame (mirror image).
function mountB(root) {
  const CX = 806; // character centre line

  const rem = h('div', 'reminders', anchor(root, CX, 274));
  const remIcons = { imbue: makeIcon('imbue', 34), ls: makeIcon('ls', 34) };
  rem.append(remIcons.imbue, remIcons.ls);

  const hud = h('div', 'hud-layer b-halo', root);
  const band = h('div', 'b-range', anchor(hud, CX, 313));
  const bandText = h('span', '', band);
  const bandYd = h('span', 'b-range-yd', band);

  const swing = anchor(hud, CX, 584).appendChild(makeSwing('b-swing'));
  const mw = anchor(hud, CX, 602).appendChild(makePips(''));

  // totems: curve under the player frame, bending down toward the character (Earth outermost)
  const TOTEM_AT = [[465, 478], [507, 484], [549, 492], [591, 502]];
  const totems = ELEMENTS.map((el, i) => anchor(hud, TOTEM_AT[i][0], TOTEM_AT[i][1]).appendChild(makeIcon(el, 40, 'is-duration')));

  // mirror curve under the target frame: key cooldowns nearest the character, self-buffs outside
  const shock = anchor(hud, 1021, 502).appendChild(makeIcon('shock', 40));
  const ss = anchor(hud, 1063, 492).appendChild(makeIcon('ss', 40));
  const imbue = anchor(hud, 1105, 484).appendChild(makeIcon('imbue', 34));
  const ls = anchor(hud, 1147, 478).appendChild(makeIcon('ls', 34));

  // mana: vertical bar beside the character, in the gap between the player frame and the shoulder
  const manaWrap = place(h('div', 'b-mana-wrap', hud), 622, 396);
  const mana = manaWrap.appendChild(makeMana('b-mana', true));
  const manaNum = h('div', 'b-mana-num', manaWrap);

  return function updateB(v) {
    hud.classList.toggle('is-hidden', !v.hudVisible);
    paintBand(band, v.range, bandText, bandYd);
    paintSwing(swing, v.swing);
    paintPips(mw, v.mw);
    v.totems.forEach((t, i) => paintTotem(totems[i], t));
    paintCooldown(shock, v.shock);
    ss.style.visibility = v.ss.learned ? '' : 'hidden';
    paintCooldown(ss, v.ss);
    paintImbue(imbue, v.imbue, true);
    paintLS(ls, v.ls);
    paintMana(mana, v.mana);
    setText(manaNum, String(Math.round(v.mana.pct)));
    manaNum.classList.toggle('is-low', v.mana.low);
    paintReminders(remIcons, v.reminders);
  };
}

// ---- C: Spread by job — each piece sits next to the Blizzard UI it relates to.
function mountC(root) {
  const remRow = h('div', 'c-reminders', anchor(root, 800, 94));
  const remIcons = {};
  for (const [key, caption] of [['imbue', 'Weapon imbue'], ['ls', 'Lightning Shield']]) {
    const item = h('div', 'c-rem-item', remRow);
    remIcons[key] = item.appendChild(makeIcon(key, 46));
    remIcons[key]._item = item;
    h('span', '', item, caption);
  }

  const hud = h('div', 'hud-layer c-spread', root);

  // target frame (centre-right) → range band hangs right underneath it
  const band = place(h('div', 'c-range', hud), 982, 456, 178);
  const bandText = h('span', '', band);
  const bandYd = h('span', 'c-range-yd', band);

  // player frame (centre-left) → swing, mana, self-buffs (Maelstrom, imbue, Lightning Shield)
  const col = place(h('div', 'c-player-col', hud), 446, 456, 170);
  const swing = col.appendChild(makeSwing('c-swing'));
  const mana = col.appendChild(makeMana('c-mana'));
  const self = h('div', 'c-self', col);
  h('span', 'c-mw-glyph', self, ICONS.mw.glyph);
  const mw = self.appendChild(makePips(''));
  const imbue = self.appendChild(makeIcon('imbue', 30));
  const ls = self.appendChild(makeIcon('ls', 30));

  // above the action bars, in the same line as Blizzard's buff row + swing bar → totems
  // (the spot right next to the buff row is taken by Blizzard's swing bar, so they sit just past it)
  const totemRow = place(h('div', 'c-totems', hud), 996, 742);
  const totems = ELEMENTS.map((el) => totemRow.appendChild(makeIcon(el, 34, 'is-duration')));
  // next to the action bars: key cooldowns just past the right gryphon, under the side bars
  const cds = place(h('div', 'c-cds', hud), 1434, 818);
  const shock = cds.appendChild(makeIcon('shock', 48));
  const ss = cds.appendChild(makeIcon('ss', 48));

  return function updateC(v) {
    hud.classList.toggle('is-hidden', !v.hudVisible);
    paintBand(band, v.range, bandText, bandYd);
    paintSwing(swing, v.swing);
    paintMana(mana, v.mana);
    paintPips(mw, v.mw);
    paintImbue(imbue, v.imbue, true);
    paintLS(ls, v.ls);
    v.totems.forEach((t, i) => paintTotem(totems[i], t));
    paintCooldown(shock, v.shock);
    ss.style.display = v.ss.learned ? '' : 'none';
    paintCooldown(ss, v.ss);
    paintReminders(remIcons, v.reminders);
  };
}

// ---- D: Thin strip — one slim strip directly above Blizzard's swing bar; the strip is the swing bar.
// Its swing track spans exactly x 610–986 so it lines up with Blizzard's bar underneath it.
function mountD(root) {
  const rem = place(h('div', 'reminders d-reminders', root), 522, 676);
  const remIcons = { imbue: makeIcon('imbue', 22), ls: makeIcon('ls', 22) };
  rem.append(remIcons.imbue, remIcons.ls);

  const wrap = place(h('div', 'hud-layer d-wrap', root), 522, 706);
  const strip = h('div', 'd-strip', wrap);
  const rangeLabel = h('div', 'd-range', strip);
  const track = strip.appendChild(makeSwing('d-track'));
  const chips = h('div', 'd-chips', strip);
  const totems = ELEMENTS.map((el) => chips.appendChild(makeIcon(el, 20, 'is-duration')));
  h('span', 'd-sep', chips);
  const imbue = chips.appendChild(makeIcon('imbue', 20));
  const imbueText = h('span', 'd-imbue-text', chips);
  const ls = chips.appendChild(makeIcon('ls', 20));
  h('span', 'd-sep', chips);
  const shock = chips.appendChild(makeIcon('shock', 20));
  const ss = chips.appendChild(makeIcon('ss', 20));
  const mw = chips.appendChild(makePips('d-pips'));

  const manaRow = h('div', 'd-mana-row', wrap);
  const mana = manaRow.appendChild(makeMana('d-mana'));
  const manaNum = h('span', 'd-mana-num', manaRow);

  return function updateD(v) {
    wrap.classList.toggle('is-hidden', !v.hudVisible);
    paintBand(strip, v.range, rangeLabel, null);
    paintSwing(track, v.swing);
    v.totems.forEach((t, i) => paintTotem(totems[i], t));
    paintImbue(imbue, v.imbue, false);
    setText(imbueText, v.imbue.text);
    imbueText.classList.toggle('is-warn', v.imbue.expiring);
    paintLS(ls, v.ls);
    paintCooldown(shock, v.shock);
    ss.style.display = v.ss.learned ? '' : 'none';
    paintCooldown(ss, v.ss);
    paintPips(mw, v.mw);
    paintMana(mana, v.mana);
    setText(manaNum, `${Math.round(v.mana.pct)}%`);
    manaNum.classList.toggle('is-low', v.mana.low);
    paintReminders(remIcons, v.reminders);
  };
}

// ============================================================ 6. scene, tooling, loop

const $ = (sel) => document.querySelector(sel);
const stageWrap = $('#stage-wrap');
const stage = $('#stage');
const hudRoot = $('#hud-root');
const enemy = $('#enemy');
const enemyPlate = $('#enemy-plate');
const bzSwing = $('#bz-swing');
const bzSwingFill = $('#bz-swing-fill');
const bzSwingTime = $('#bz-swing-time');
const bzTarget = $('#bz-target');
const panel = $('#scenario');
const pill = $('#switcher');
const readoutEl = $('#readout');

const addSlots = (sel, n) => {
  for (let i = 0; i < n; i += 1) h('div', 'bz-slot', $(sel));
};
addSlots('#bz-row1a', 12);
addSlots('#bz-row1b', 12);
addSlots('#bz-row2', 12);
addSlots('#bz-micro', 11);
addSlots('#bz-bags', 6);
addSlots('#bz-sidebars', 24);

let lastEnemyBand = 'melee';
let sceneBand = null;
function updateScene(v) {
  // Blizzard's own "Main Hand" bar mirrors the real swing (grey on purpose; Turbo never touches it)
  bzSwing.classList.toggle('is-off', !S.blizzSwing);
  if (S.blizzSwing) {
    bzSwingFill.style.transform = `scaleX(${(v.swing.visible ? v.swing.progress : 0).toFixed(4)})`;
    setText(bzSwingTime, v.swing.visible ? v.swing.remaining.toFixed(1) : '0.0');
  }

  if (sceneBand === v.range) return;
  sceneBand = v.range;
  if (v.range !== 'none') lastEnemyBand = v.range;
  const p = ENEMY_POS[lastEnemyBand];
  enemy.style.left = `${p.x - 60}px`;
  enemy.style.top = `${p.y - 170}px`;
  enemy.style.transform = `scale(${p.s})`;
  enemy.classList.toggle('is-targeted', v.range !== 'none');
  enemyPlate.style.left = `${p.x - 50}px`;
  enemyPlate.style.top = `${Math.round(p.y - 170 * p.s - 20)}px`;
  enemyPlate.classList.toggle('is-untargeted', v.range === 'none');
  bzTarget.classList.toggle('is-gone', v.range === 'none');
}

function fitStage() {
  const open = !panel.classList.contains('is-collapsed');
  const reserveRight = open ? 300 + 40 : 44;
  const aw = window.innerWidth - reserveRight - 16;
  const ah = window.innerHeight - 70;
  const s = Math.max(0.2, Math.min(aw / STAGE_W, ah / STAGE_H));
  const w = STAGE_W * s;
  const hh = STAGE_H * s;
  const left = 8 + (aw - w) / 2;
  const top = 8 + (ah - hh) / 2;
  stage.style.transform = `scale(${s})`;
  Object.assign(stageWrap.style, { width: `${w}px`, height: `${hh}px`, left: `${left}px`, top: `${top}px` });
  pill.style.left = `${left + w / 2}px`;
  pill.style.top = `${Math.min(window.innerHeight - 56, top + hh + 10)}px`;
}

let updateHud = () => {};
function mountVariant(key) {
  const variant = VARIANTS.find((v) => v.key === key);
  S.variant = key;
  hudRoot.replaceChildren();
  hudRoot.dataset.variant = key;
  updateHud = variant.mount(hudRoot);
  updateHud(derive(clock())); // paint before first style pass so nothing flashes in
  $('#sw-label').textContent = `${key} (${variant.name})`;
  const p = new URLSearchParams(location.search);
  p.set('variant', key);
  history.replaceState(null, '', `${location.pathname}?${p}`);
  dirty = true;
}

function cycle(dir) {
  const i = VARIANTS.findIndex((v) => v.key === S.variant);
  mountVariant(VARIANTS[(i + dir + VARIANTS.length) % VARIANTS.length].key);
}

$('#sw-prev').addEventListener('click', () => cycle(-1));
$('#sw-next').addEventListener('click', () => cycle(1));
window.addEventListener('keydown', (e) => {
  if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
  if (e.altKey || e.ctrlKey || e.metaKey) return;
  const a = document.activeElement;
  const typing =
    a &&
    (a.tagName === 'SELECT' ||
      a.tagName === 'TEXTAREA' ||
      a.isContentEditable ||
      (a.tagName === 'INPUT' && a.type !== 'checkbox' && a.type !== 'button'));
  if (typing) return;
  e.preventDefault();
  cycle(e.key === 'ArrowLeft' ? -1 : 1);
});

// Scenario controls. Anything the demo also drives pauses the demo; pure settings don't.
function userAct(fn) {
  if (S.autoDemo) S.autoDemo = false;
  fn();
  dirty = true;
}
const onChange = (sel, fn) => $(sel).addEventListener('change', (e) => fn(e.target));
const onInput = (sel, fn) => $(sel).addEventListener('input', (e) => fn(e.target));

onChange('#c-engaged', (t) => userAct(() => act.setEngaged(t.checked)));
onChange('#c-auto', (t) => userAct(() => act.setAutoAttack(t.checked)));
onChange('#c-range', (t) => userAct(() => act.setRange(t.value)));
onChange('#c-imbue', (t) => userAct(() => act.setImbue(t.value)));
onInput('#c-mana', (t) => userAct(() => act.setMana(Number(t.value))));
onInput('#c-mw', (t) => userAct(() => act.setMaelstrom(Number(t.value))));
onChange('#c-clip', (t) => act.setShocksClip(t.checked));
onChange('#c-ss-learned', (t) => act.setSSLearned(t.checked));
onChange('#c-resting', (t) => act.setResting(t.checked));
onChange('#c-bzswing', (t) => act.setBlizzSwing(t.checked));
onChange('#c-demo', (t) => act.setAutoDemo(t.checked));
document.querySelectorAll('[data-act]').forEach((b) => {
  b.addEventListener('click', () => userAct(() => act[b.dataset.act](b.dataset.arg)));
});
$('#scenario-tab').addEventListener('click', () => {
  panel.classList.toggle('is-collapsed');
  $('#scenario-tab').setAttribute('aria-expanded', String(!panel.classList.contains('is-collapsed')));
  fitStage();
});
window.addEventListener('resize', fitStage);

function syncControls() {
  $('#c-engaged').checked = S.engaged;
  $('#c-auto').checked = S.autoAttack;
  $('#c-range').value = S.range;
  $('#c-ss-learned').checked = S.ssLearned;
  $('#b-ss').disabled = !S.ssLearned;
  $('#c-clip').checked = S.shocksClip;
  $('#c-imbue').value = S.imbue;
  $('#c-mana').value = String(S.mana);
  $('#o-mana').textContent = `${S.mana}%${S.mana < LOW_MANA ? ' (low)' : ''}`;
  $('#c-mw').value = String(S.maelstrom);
  $('#o-mw').textContent = `${S.maelstrom}/5`;
  $('#c-resting').checked = S.resting;
  $('#c-bzswing').checked = S.blizzSwing;
  $('#c-demo').checked = S.autoDemo;
}

function readout(v, now) {
  const r1 = (x) => Math.round(x * 10) / 10;
  const variant = VARIANTS.find((x) => x.key === S.variant);
  return {
    variant: `${variant.key} (${variant.name})`,
    engaged: S.engaged,
    hudVisible: v.hudVisible,
    rangeBand: S.range === 'none' ? 'no target' : BANDS[S.range].label,
    autoAttack: S.autoAttack,
    swing: {
      visible: v.swing.visible,
      progress: Math.round(v.swing.progress * 100) / 100,
      secondsLeft: v.swing.visible ? r1(v.swing.remaining) : null,
      inSafeWindow: v.swing.visible && v.swing.inSafe && !v.swing.casting,
      hardCastLeft: v.swing.casting ? r1(v.swing.castLeft) : null,
      dimmedOutOfRange: v.swing.visible && v.swing.outOfRange,
    },
    earthShock: { ready: v.shock.ready, cooldownLeft: r1(v.shock.left), notEnoughMana: v.shock.oom, clipWarning: v.shock.clip },
    stormstrike: { learned: S.ssLearned, ready: v.ss.ready, cooldownLeft: r1(v.ss.left), notEnoughMana: v.ss.oom },
    shocksClip: S.shocksClip,
    totems: Object.fromEntries(v.totems.map((t) => [t.el, t.active ? `${r1(t.left)} s${t.pulse ? ' (pulsing)' : ''}` : null])),
    lightningShieldCharges: S.lsCharges,
    weaponImbue: { mode: S.imbue, left: v.imbue.text || null },
    manaPct: S.mana,
    manaLow: v.mana.low,
    maelstromStacks: S.maelstrom,
    restingOrMounted: S.resting,
    blizzardSwingBar: S.blizzSwing ? 'shown' : 'hidden',
    reminders: v.reminders,
    autoDemo: S.autoDemo ? `on (t = ${r1(now - demoStart)} s of ${DEMO_LEN})` : 'off',
    lastEvent: S.lastEvent,
  };
}

let lastReadout = 0;
function frame() {
  const now = clock();
  tick(now);
  const v = derive(now);
  updateHud(v);
  updateScene(v);
  if (dirty) syncControls();
  if (dirty || now - lastReadout > 0.25) {
    readoutEl.textContent = JSON.stringify(readout(v, now), null, 2);
    lastReadout = now;
  }
  dirty = false;
  requestAnimationFrame(frame);
}

fitStage();
mountVariant(S.variant);
requestAnimationFrame(frame);

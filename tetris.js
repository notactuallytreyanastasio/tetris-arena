'use strict';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const W = 10;          // columns
const HIDDEN = 2;      // rows above the visible field, where pieces spawn
const VISIBLE = 20;    // rows the player sees
const H = VISIBLE + HIDDEN;
const CELL = 30;       // css pixels per cell on the board canvas

// Piece ids double as board cell values. 0 is empty.
const I = 1, O = 2, T = 3, S = 4, Z = 5, J = 6, L = 7;
const NAMES = [null, 'I', 'O', 'T', 'S', 'Z', 'J', 'L'];
const COLORS = [
  null,
  '#3cc7e8', // I
  '#f5c542', // O
  '#b56ee0', // T
  '#5ad36b', // S
  '#ef5350', // Z
  '#4f7be8', // J
  '#f0913a', // L
];

// SRS: each piece is a square matrix, state 0 as spawned. The other three
// states come from rotating that matrix clockwise inside its box, which is
// exactly what SRS defines for JLSTZ (3x3) and I (4x4). O is a 2x2 so
// rotation is the identity, which is also what SRS wants.
const BASE = {
  [I]: [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]],
  [O]: [[1,1],[1,1]],
  [T]: [[0,1,0],[1,1,1],[0,0,0]],
  [S]: [[0,1,1],[1,1,0],[0,0,0]],
  [Z]: [[1,1,0],[0,1,1],[0,0,0]],
  [J]: [[1,0,0],[1,1,1],[0,0,0]],
  [L]: [[0,0,1],[1,1,1],[0,0,0]],
};

function rotateCW(m) {
  const n = m.length;
  const out = [];
  for (let y = 0; y < n; y++) {
    out.push([]);
    for (let x = 0; x < n; x++) out[y].push(m[n - 1 - x][y]);
  }
  return out;
}

// SHAPES[id][state] = list of [x, y] cells relative to the piece origin.
const SHAPES = {};
for (const id of [I, O, T, S, Z, J, L]) {
  const states = [];
  let m = BASE[id];
  for (let r = 0; r < 4; r++) {
    const cells = [];
    for (let y = 0; y < m.length; y++)
      for (let x = 0; x < m.length; x++)
        if (m[y][x]) cells.push([x, y]);
    states.push(cells);
    m = rotateCW(m);
  }
  SHAPES[id] = states;
}

// Where each piece appears. Guideline: JLSTZ and I fill columns 3..5 / 3..6,
// O sits in 4..5. y = 0 is the top hidden row.
const SPAWN_X = { [I]: 3, [O]: 4, [T]: 3, [S]: 3, [Z]: 3, [J]: 3, [L]: 3 };

// SRS wall kicks, written exactly as the guideline tables give them, with
// +y meaning UP. Our board has +y down, so tryRotate negates y on use.
// Keeping the table in the wiki's convention means it can be checked
// against the wiki by eye instead of by re-deriving signs.
// Index: KICKS[from][to] for the four 90-degree transitions each way.
const KICKS_JLSTZ = {
  '0>1': [[0,0],[-1,0],[-1,+1],[0,-2],[-1,-2]],
  '1>0': [[0,0],[+1,0],[+1,-1],[0,+2],[+1,+2]],
  '1>2': [[0,0],[+1,0],[+1,-1],[0,+2],[+1,+2]],
  '2>1': [[0,0],[-1,0],[-1,+1],[0,-2],[-1,-2]],
  '2>3': [[0,0],[+1,0],[+1,+1],[0,-2],[+1,-2]],
  '3>2': [[0,0],[-1,0],[-1,-1],[0,+2],[-1,+2]],
  '3>0': [[0,0],[-1,0],[-1,-1],[0,+2],[-1,+2]],
  '0>3': [[0,0],[+1,0],[+1,+1],[0,-2],[+1,-2]],
};
const KICKS_I = {
  '0>1': [[0,0],[-2,0],[+1,0],[-2,-1],[+1,+2]],
  '1>0': [[0,0],[+2,0],[-1,0],[+2,+1],[-1,-2]],
  '1>2': [[0,0],[-1,0],[+2,0],[-1,+2],[+2,-1]],
  '2>1': [[0,0],[+1,0],[-2,0],[+1,-2],[-2,+1]],
  '2>3': [[0,0],[+2,0],[-1,0],[+2,+1],[-1,-2]],
  '3>2': [[0,0],[-2,0],[+1,0],[-2,-1],[+1,+2]],
  '3>0': [[0,0],[+1,0],[-2,0],[+1,-2],[-2,+1]],
  '0>3': [[0,0],[-1,0],[+2,0],[-1,+2],[+2,-1]],
};

// ---------------------------------------------------------------------------
// Board
// ---------------------------------------------------------------------------

const board = new Uint8Array(W * H);

function cell(x, y) { return board[y * W + x]; }

// True if the piece fits at (px, py) in rotation state r.
function fits(id, r, px, py) {
  for (const [cx, cy] of SHAPES[id][r]) {
    const x = px + cx, y = py + cy;
    if (x < 0 || x >= W || y >= H) return false;
    if (y < 0) continue;              // above the board is fine
    if (board[y * W + x]) return false;
  }
  return true;
}

function lockPiece(p) {
  for (const [cx, cy] of SHAPES[p.id][p.r]) {
    const x = p.x + cx, y = p.y + cy;
    if (y >= 0) board[y * W + x] = p.id;
  }
}

// ---------------------------------------------------------------------------
// Randomizer: 7-bag. Every piece appears once per seven, so droughts are
// bounded. Cheap enough to have from milestone 1.
// ---------------------------------------------------------------------------

let bag = [];
function nextFromBag() {
  if (bag.length === 0) {
    bag = [I, O, T, S, Z, J, L];
    for (let i = bag.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [bag[i], bag[j]] = [bag[j], bag[i]];
    }
  }
  return bag.pop();
}

// ---------------------------------------------------------------------------
// Game state
// ---------------------------------------------------------------------------

// Timing, all in ms. DAS = delay before auto-shift, ARR = auto-repeat rate.
const DAS = 170;
const ARR = 40;
const LOCK_DELAY = 500;
const LOCK_RESETS = 15;      // guideline move-reset cap
const SOFT_DROP_FACTOR = 20; // soft drop is 20x gravity

const CLEAR_FLASH = 120;     // ms the full rows flash before they vanish
const LINES_PER_LEVEL = 10;

// Guideline scoring, indexed by lines cleared. Multiplied by level.
const SCORE = {
  normal:  [0, 100, 300, 500, 800],
  tspin:   [400, 800, 1200, 1600],
  mini:    [100, 200, 400],
  perfect: [0, 800, 1200, 1800, 2000],   // board empty after the clear (from agent-8)
};

// Guideline gravity curve, ms per row. Level 1 = 1000ms, level 10 ~ 63ms.
function gravityFor(level) {
  const l = Math.min(level, 20) - 1;
  return Math.pow(0.8 - l * 0.007, l) * 1000;
}

const NEXT_COUNT = 3;

const state = {
  piece: null,       // { id, r, x, y, lowestY, resets, spun, kick }
  queue: [],         // upcoming piece ids, NEXT_COUNT long
  hold: 0,           // parked piece id, 0 = none
  holdUsed: false,   // hold allowed once per piece
  fallAcc: 0,        // ms accumulated toward the next gravity step
  lockAcc: 0,        // ms the piece has been resting on something
  clearing: null,    // { rows: [y...], t } while full rows flash
  score: 0,
  lines: 0,
  level: 1,
  b2b: false,        // last line clear was a tetris or T-spin
  combo: -1,         // consecutive locks that cleared lines; -1 = none
  paused: false,
  over: false,
};

function gravityMs() { return gravityFor(state.level); }

function reset() {
  board.fill(0);
  bag = [];
  state.piece = null;
  state.queue = [];
  state.hold = 0;
  state.holdUsed = false;
  state.fallAcc = 0;
  state.lockAcc = 0;
  state.clearing = null;
  state.score = 0;
  state.lines = 0;
  state.level = 1;
  state.b2b = false;
  state.combo = -1;
  state.paused = false;
  state.over = false;
  spawn();
}

function setPaused(on) {
  if (state.over || state.paused === on) return;
  state.paused = on;
  if (on) { input.dir = 0; input.soft = false; }  // keyups will be missed
}

// Held keys. dir is -1/0/+1 for the direction currently auto-shifting.
const input = { dir: 0, dasAcc: 0, dasCharged: false, soft: false };

function takeNext() {
  while (state.queue.length <= NEXT_COUNT) state.queue.push(nextFromBag());
  return state.queue.shift();
}

// Spawn the next queued piece, or a specific one when coming out of hold.
function spawn(forcedId) {
  const id = forcedId || takeNext();
  if (!forcedId) state.holdUsed = false;
  const p = { id, r: 0, x: SPAWN_X[id], y: 0, lowestY: 0, resets: 0, spun: false, kick: 0 };
  if (!fits(id, 0, p.x, p.y)) { state.over = true; return; }
  // Guideline: drop one row immediately if the way is clear, so the piece
  // is visible right away rather than hanging in the hidden rows.
  if (fits(id, 0, p.x, p.y + 1)) p.y += 1;
  p.lowestY = p.y;
  state.piece = p;
  state.fallAcc = 0;
  state.lockAcc = 0;
}

function grounded(p) { return !fits(p.id, p.r, p.x, p.y + 1); }

// A successful move or rotation while resting on something restarts the
// lock delay, but only LOCK_RESETS times per lowest row reached, so a
// piece cannot be stalled forever by wiggling it.
function afterMove(p) {
  if (grounded(p) && p.resets < LOCK_RESETS) {
    p.resets += 1;
    state.lockAcc = 0;
  }
}

function tryMove(dx) {
  const p = state.piece;
  if (!p || !fits(p.id, p.r, p.x + dx, p.y)) return false;
  p.x += dx;
  p.spun = false;
  afterMove(p);
  return true;
}

function tryRotate(dr) {
  const p = state.piece;
  if (!p || p.id === O) return false;
  const to = (p.r + dr + 4) % 4;
  const table = p.id === I ? KICKS_I : KICKS_JLSTZ;
  const kicks = table[p.r + '>' + to];
  for (let i = 0; i < kicks.length; i++) {
    const [kx, ky] = kicks[i];
    const nx = p.x + kx, ny = p.y - ky; // table is +y up, board is +y down
    if (fits(p.id, to, nx, ny)) {
      p.r = to; p.x = nx; p.y = ny;
      p.spun = true;   // last successful action was a rotation
      p.kick = i;
      afterMove(p);
      return true;
    }
  }
  return false;
}

// 3-corner rule: a T whose last action was a rotation, with at least 3 of the
// 4 diagonals around its centre solid, was spun in. 'full' if both corners on
// the pointing side are solid, or the piece got there via kick test 5; else
// 'mini'. Returns null, 'mini' or 'full'.
function tspinKind(p) {
  if (p.id !== T || !p.spun) return null;
  const solid = (x, y) => x < 0 || x >= W || y >= H || (y >= 0 && board[y * W + x] !== 0);
  const cx = p.x + 1, cy = p.y + 1;
  const tl = solid(cx - 1, cy - 1), tr = solid(cx + 1, cy - 1);
  const bl = solid(cx - 1, cy + 1), br = solid(cx + 1, cy + 1);
  if (tl + tr + bl + br < 3) return null;
  const front = [[tl, tr], [tr, br], [bl, br], [tl, bl]][p.r]; // corners the T points at
  return (front[0] && front[1]) || p.kick === 4 ? 'full' : 'mini';
}

function fullRows() {
  const rows = [];
  for (let y = 0; y < H; y++) {
    let full = true;
    for (let x = 0; x < W; x++) if (!board[y * W + x]) { full = false; break; }
    if (full) rows.push(y);
  }
  return rows;
}

// Remove the given rows (ascending) by sliding everything above them down.
// copyWithin on the flat array: no allocation, and rows above the gap keep
// their order.
function removeRows(rows) {
  for (const y of rows) {
    board.copyWithin(W, 0, y * W);
    board.fill(0, 0, W);
  }
}

function award(n, spin) {
  let pts;
  if (spin === 'full') pts = SCORE.tspin[n];
  else if (spin === 'mini') pts = SCORE.mini[Math.min(n, 2)];
  else pts = SCORE.normal[n];
  pts *= state.level;
  if (n > 0) {
    const hard = n === 4 || spin !== null;
    if (hard && state.b2b) pts = Math.floor(pts * 1.5);
    state.b2b = hard;
    state.combo += 1;
    if (state.combo > 0) pts += 50 * state.combo * state.level;   // from agent-2
    state.lines += n;
    state.level = 1 + Math.floor(state.lines / LINES_PER_LEVEL);
  } else {
    state.combo = -1;
  }
  state.score += pts;
}

function lockNow() {
  const p = state.piece;
  const spin = tspinKind(p);
  lockPiece(p);
  state.piece = null;

  // Lock-out: the whole piece came to rest above the visible field.
  let visible = false;
  for (const [, cy] of SHAPES[p.id][p.r]) if (p.y + cy >= HIDDEN) visible = true;
  if (!visible) { state.over = true; return; }

  const rows = fullRows();
  award(rows.length, spin);
  if (rows.length) {
    state.clearing = { rows, t: 0 };   // spawn happens after the flash
  } else {
    spawn();
  }
}

// One row of gravity or soft drop. Returns true if the piece moved.
function stepDown() {
  const p = state.piece;
  if (!fits(p.id, p.r, p.x, p.y + 1)) return false;
  p.y += 1;
  p.spun = false;   // falling after the rotation means it was not spun in
  if (p.y > p.lowestY) { p.lowestY = p.y; p.resets = 0; }
  state.lockAcc = 0;
  return true;
}

function hardDrop() {
  const p = state.piece;
  if (!p) return;
  while (stepDown()) state.score += 2;
  lockNow();
}

function hold() {
  const p = state.piece;
  if (!p || state.holdUsed) return false;
  const parked = state.hold;
  state.hold = p.id;
  state.holdUsed = true;
  if (parked) spawn(parked); else spawn(takeNext());
  return true;
}

// Row the piece would land on if hard-dropped. Used for the ghost.
function ghostY(p) {
  let y = p.y;
  while (fits(p.id, p.r, p.x, y + 1)) y++;
  return y;
}

function update(dt) {
  if (state.over || state.paused) return;

  if (state.clearing) {
    state.clearing.t += dt;
    if (state.clearing.t >= CLEAR_FLASH) {
      const n = state.clearing.rows.length;
      removeRows(state.clearing.rows);
      state.clearing = null;
      // Perfect clear: checked after the collapse, on the whole array,
      // so hidden rows count too.
      if (board.every((v) => v === 0)) state.score += SCORE.perfect[n] * state.level;
      spawn();
    }
    return;
  }

  // Delayed auto shift
  if (input.dir !== 0) {
    input.dasAcc += dt;
    if (!input.dasCharged && input.dasAcc >= DAS) {
      input.dasCharged = true;
      input.dasAcc -= DAS;
      tryMove(input.dir);
    }
    if (input.dasCharged) {
      while (input.dasAcc >= ARR) {
        input.dasAcc -= ARR;
        if (!tryMove(input.dir)) { input.dasAcc = 0; break; }
      }
    }
  }

  // Gravity / soft drop
  const p = state.piece;
  if (grounded(p)) {
    state.fallAcc = 0;
    state.lockAcc += dt;
    if (state.lockAcc >= LOCK_DELAY) lockNow();
  } else {
    const rowMs = input.soft ? gravityMs() / SOFT_DROP_FACTOR : gravityMs();
    state.fallAcc += dt;
    while (state.fallAcc >= rowMs) {
      state.fallAcc -= rowMs;
      if (!stepDown()) break;
      if (input.soft) state.score += 1;
    }
  }
}

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------

function pressDir(d) {
  // Last pressed direction wins; DAS restarts from zero.
  input.dir = d;
  input.dasAcc = 0;
  input.dasCharged = false;
  tryMove(d);
}

function releaseDir(d) {
  if (input.dir === d) { input.dir = 0; input.dasAcc = 0; input.dasCharged = false; }
}

document.addEventListener('keydown', (e) => {
  if (e.repeat) return;
  if (e.code === 'KeyR') { reset(); e.preventDefault(); return; }
  if (e.code === 'KeyP' || e.code === 'Escape') { setPaused(!state.paused); e.preventDefault(); return; }
  if (state.over || state.paused) return;
  switch (e.code) {
    case 'ArrowLeft':  pressDir(-1); break;
    case 'ArrowRight': pressDir(+1); break;
    case 'ArrowDown':  input.soft = true; break;
    case 'ArrowUp': case 'KeyX': tryRotate(+1); break;
    case 'KeyZ': case 'ControlLeft': case 'ControlRight': tryRotate(-1); break;
    case 'Space': hardDrop(); break;
    case 'KeyC': case 'ShiftLeft': case 'ShiftRight': hold(); break;
    default: return;
  }
  e.preventDefault();
});

document.addEventListener('keyup', (e) => {
  switch (e.code) {
    case 'ArrowLeft':  releaseDir(-1); break;
    case 'ArrowRight': releaseDir(+1); break;
    case 'ArrowDown':  input.soft = false; break;
  }
});

// Losing focus loses the keyup for any held key, and a piece should not
// keep falling in a tab nobody is looking at: both cases pause.
window.addEventListener('blur', () => setPaused(true));
document.addEventListener('visibilitychange', () => { if (document.hidden) setPaused(true); });

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

const MINI = 24;   // cell size in the hold / next panels
const SLOT = 120;  // each panel slot is SLOT x SLOT css px

const ctx = setupCanvas(document.getElementById('board'), W * CELL, VISIBLE * CELL);
const holdCtx = setupCanvas(document.getElementById('hold'), SLOT, SLOT);
const nextCtx = setupCanvas(document.getElementById('next'), SLOT, SLOT * NEXT_COUNT);

function setupCanvas(canvas, cssW, cssH) {
  const dpr = window.devicePixelRatio || 1;
  canvas.style.width = cssW + 'px';
  canvas.style.height = cssH + 'px';
  canvas.width = Math.round(cssW * dpr);
  canvas.height = Math.round(cssH * dpr);
  const c = canvas.getContext('2d');
  c.scale(dpr, dpr);
  return c;
}

function drawCell(c, x, y, color, size) {
  const px = x * size, py = y * size;
  c.fillStyle = color;
  c.fillRect(px, py, size, size);
  // bevel: lighter top-left, darker bottom-right
  c.fillStyle = 'rgba(255,255,255,0.22)';
  c.fillRect(px, py, size, 2);
  c.fillRect(px, py, 2, size);
  c.fillStyle = 'rgba(0,0,0,0.28)';
  c.fillRect(px, py + size - 2, size, 2);
  c.fillRect(px + size - 2, py, 2, size);
}

function drawGhostCell(c, x, y, color, size) {
  c.strokeStyle = color;
  c.lineWidth = 2;
  c.strokeRect(x * size + 2, y * size + 2, size - 4, size - 4);
}

// Mix a hex colour toward white by t in [0,1].
function lighten(hex, t) {
  const n = parseInt(hex.slice(1), 16);
  const r = n >> 16, g = (n >> 8) & 255, b = n & 255;
  const f = (v) => Math.round(v + (255 - v) * t);
  return `rgb(${f(r)},${f(g)},${f(b)})`;
}

// Draw a piece in state 0 centred in a SLOT x SLOT box at slot index i.
function drawMini(c, id, i, dim) {
  const cells = SHAPES[id][0];
  let minX = 9, maxX = -1, minY = 9, maxY = -1;
  for (const [x, y] of cells) {
    minX = Math.min(minX, x); maxX = Math.max(maxX, x);
    minY = Math.min(minY, y); maxY = Math.max(maxY, y);
  }
  const w = (maxX - minX + 1) * MINI, h = (maxY - minY + 1) * MINI;
  const ox = (SLOT - w) / 2, oy = i * SLOT + (SLOT - h) / 2;
  c.save();
  c.translate(ox - minX * MINI, oy - minY * MINI);
  if (dim) c.globalAlpha = 0.35;
  for (const [x, y] of cells) drawCell(c, x, y, COLORS[id], MINI);
  c.restore();
}

function drawPanels() {
  holdCtx.clearRect(0, 0, SLOT, SLOT);
  if (state.hold) drawMini(holdCtx, state.hold, 0, state.holdUsed);
  nextCtx.clearRect(0, 0, SLOT, SLOT * NEXT_COUNT);
  for (let i = 0; i < NEXT_COUNT && i < state.queue.length; i++) drawMini(nextCtx, state.queue[i], i, false);
}

function draw() {
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, W * CELL, VISIBLE * CELL);

  // grid
  ctx.strokeStyle = 'rgba(255,255,255,0.05)';
  ctx.lineWidth = 1;
  for (let x = 1; x < W; x++) {
    ctx.beginPath(); ctx.moveTo(x * CELL + .5, 0); ctx.lineTo(x * CELL + .5, VISIBLE * CELL); ctx.stroke();
  }
  for (let y = 1; y < VISIBLE; y++) {
    ctx.beginPath(); ctx.moveTo(0, y * CELL + .5); ctx.lineTo(W * CELL, y * CELL + .5); ctx.stroke();
  }

  // settled cells; rows being cleared flash white
  const flashing = state.clearing ? state.clearing.rows : null;
  for (let y = HIDDEN; y < H; y++) {
    const flash = flashing && flashing.includes(y);
    for (let x = 0; x < W; x++) {
      const v = cell(x, y);
      if (v) drawCell(ctx, x, y - HIDDEN, flash ? '#ffffff' : COLORS[v], CELL);
    }
  }

  // ghost, then the active piece on top. While the piece rests on the
  // stack it brightens as the lock delay runs out, so the lock is not a
  // surprise.
  const p = state.piece;
  if (p) {
    const gy = ghostY(p);
    if (gy !== p.y) {
      for (const [cx, cy] of SHAPES[p.id][p.r]) {
        const y = gy + cy - HIDDEN;
        if (y >= 0) drawGhostCell(ctx, p.x + cx, y, COLORS[p.id], CELL);
      }
    }
    const t = gy === p.y ? Math.min(state.lockAcc / LOCK_DELAY, 1) : 0;
    const color = t > 0 ? lighten(COLORS[p.id], t * 0.6) : COLORS[p.id];
    for (const [cx, cy] of SHAPES[p.id][p.r]) {
      const y = p.y + cy - HIDDEN;
      if (y >= 0) drawCell(ctx, p.x + cx, y, color, CELL);
    }
  }
  drawPanels();
}

// HUD. Writing textContent every frame forces layout for nothing, so each
// field remembers what it last showed and only writes on change. (Pattern
// from agent-3.)
const hud = {
  score: document.getElementById('score'),
  level: document.getElementById('level'),
  lines: document.getElementById('lines'),
  overlay: document.getElementById('overlay'),
  overlayTitle: document.getElementById('overlay-title'),
  overlaySub: document.getElementById('overlay-sub'),
};
const shown = { score: -1, level: -1, lines: -1, overlay: '' };

function setText(key, value) {
  if (shown[key] === value) return;
  shown[key] = value;
  hud[key].textContent = value;
}

function drawHud() {
  setText('score', state.score);
  setText('level', state.level);
  setText('lines', state.lines);
  const mode = state.over ? 'over' : state.paused ? 'paused' : '';
  if (shown.overlay !== mode) {
    shown.overlay = mode;
    hud.overlay.classList.toggle('hidden', mode === '');
    if (mode === 'over') {
      hud.overlayTitle.textContent = 'Game over';
      hud.overlaySub.textContent = 'press R to restart';
    } else if (mode === 'paused') {
      hud.overlayTitle.textContent = 'Paused';
      hud.overlaySub.textContent = 'press P to resume';
    }
  }
}

// ---------------------------------------------------------------------------
// Loop
// ---------------------------------------------------------------------------

let last = 0;
function frame(now) {
  const dt = Math.min(now - last, 100); // clamp so a background tab does not dump a second of gravity at once
  last = now;
  update(dt);
  draw();
  drawHud();
  requestAnimationFrame(frame);
}

reset();
requestAnimationFrame((t) => { last = t; requestAnimationFrame(frame); });

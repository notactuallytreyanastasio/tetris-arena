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

const state = {
  piece: null,       // { id, r, x, y, lowestY, resets }
  gravityMs: 800,    // ms per row at level 1
  fallAcc: 0,        // ms accumulated toward the next gravity step
  lockAcc: 0,        // ms the piece has been resting on something
  over: false,
};

// Held keys. dir is -1/0/+1 for the direction currently auto-shifting.
const input = { dir: 0, dasAcc: 0, dasCharged: false, soft: false };

function spawn() {
  const id = nextFromBag();
  const p = { id, r: 0, x: SPAWN_X[id], y: 0, lowestY: 0, resets: 0 };
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
  afterMove(p);
  return true;
}

function tryRotate(dr) {
  const p = state.piece;
  if (!p || p.id === O) return false;
  const to = (p.r + dr + 4) % 4;
  const table = p.id === I ? KICKS_I : KICKS_JLSTZ;
  for (const [kx, ky] of table[p.r + '>' + to]) {
    const nx = p.x + kx, ny = p.y - ky; // table is +y up, board is +y down
    if (fits(p.id, to, nx, ny)) {
      p.r = to; p.x = nx; p.y = ny;
      afterMove(p);
      return true;
    }
  }
  return false;
}

function lockNow() {
  lockPiece(state.piece);
  spawn();
}

// One row of gravity or soft drop. Returns true if the piece moved.
function stepDown() {
  const p = state.piece;
  if (!fits(p.id, p.r, p.x, p.y + 1)) return false;
  p.y += 1;
  if (p.y > p.lowestY) { p.lowestY = p.y; p.resets = 0; }
  state.lockAcc = 0;
  return true;
}

function hardDrop() {
  const p = state.piece;
  if (!p) return;
  while (stepDown()) {}
  lockNow();
}

function update(dt) {
  if (state.over) return;

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
    const rowMs = input.soft ? state.gravityMs / SOFT_DROP_FACTOR : state.gravityMs;
    state.fallAcc += dt;
    while (state.fallAcc >= rowMs) {
      state.fallAcc -= rowMs;
      if (!stepDown()) break;
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
  switch (e.code) {
    case 'ArrowLeft':  pressDir(-1); break;
    case 'ArrowRight': pressDir(+1); break;
    case 'ArrowDown':  input.soft = true; break;
    case 'ArrowUp': case 'KeyX': tryRotate(+1); break;
    case 'KeyZ': case 'ControlLeft': case 'ControlRight': tryRotate(-1); break;
    case 'Space': hardDrop(); break;
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

// If the window loses focus mid-keypress we never get the keyup.
window.addEventListener('blur', () => { input.dir = 0; input.soft = false; });

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

const boardCanvas = document.getElementById('board');
const ctx = setupCanvas(boardCanvas, W * CELL, VISIBLE * CELL);

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

  // settled cells
  for (let y = HIDDEN; y < H; y++)
    for (let x = 0; x < W; x++) {
      const v = cell(x, y);
      if (v) drawCell(ctx, x, y - HIDDEN, COLORS[v], CELL);
    }

  // active piece
  const p = state.piece;
  if (p) {
    for (const [cx, cy] of SHAPES[p.id][p.r]) {
      const y = p.y + cy - HIDDEN;
      if (y >= 0) drawCell(ctx, p.x + cx, y, COLORS[p.id], CELL);
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
  requestAnimationFrame(frame);
}

spawn();
requestAnimationFrame((t) => { last = t; requestAnimationFrame(frame); });

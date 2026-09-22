'use strict';

// ---------------------------------------------------------------------------
// Geometry. The board is COLS wide and TOTAL tall; the top BUFFER rows are
// hidden and exist so pieces can spawn above the visible field. Four rather
// than two so an SRS kick that lifts a piece two rows at the very top is
// never refused by the bounds check (agent-1 solved the same problem with a
// 40-row board; four hidden rows is the cheapest version of that idea).
// ---------------------------------------------------------------------------
const COLS = 10;
const ROWS = 20;
const BUFFER = 4;
const TOTAL = ROWS + BUFFER;
const CELL = 30;

// ---------------------------------------------------------------------------
// Tetrominoes in SRS form. Each piece has four rotation states (0, R, 2, L);
// each state lists its four cells as [x, y] inside a bounding box, y down.
// These match the guideline diagrams exactly so the kick tables below apply.
// ---------------------------------------------------------------------------
const PIECES = {
  I: {
    id: 1, color: '#4cc9f0', box: 4,
    states: [
      [[0, 1], [1, 1], [2, 1], [3, 1]],
      [[2, 0], [2, 1], [2, 2], [2, 3]],
      [[0, 2], [1, 2], [2, 2], [3, 2]],
      [[1, 0], [1, 1], [1, 2], [1, 3]],
    ],
  },
  O: {
    id: 2, color: '#ffd166', box: 3,
    states: [
      [[1, 0], [2, 0], [1, 1], [2, 1]],
      [[1, 0], [2, 0], [1, 1], [2, 1]],
      [[1, 0], [2, 0], [1, 1], [2, 1]],
      [[1, 0], [2, 0], [1, 1], [2, 1]],
    ],
  },
  T: {
    id: 3, color: '#b388eb', box: 3,
    states: [
      [[1, 0], [0, 1], [1, 1], [2, 1]],
      [[1, 0], [1, 1], [2, 1], [1, 2]],
      [[0, 1], [1, 1], [2, 1], [1, 2]],
      [[1, 0], [0, 1], [1, 1], [1, 2]],
    ],
  },
  S: {
    id: 4, color: '#6ee7b7', box: 3,
    states: [
      [[1, 0], [2, 0], [0, 1], [1, 1]],
      [[1, 0], [1, 1], [2, 1], [2, 2]],
      [[1, 1], [2, 1], [0, 2], [1, 2]],
      [[0, 0], [0, 1], [1, 1], [1, 2]],
    ],
  },
  Z: {
    id: 5, color: '#f25f5c', box: 3,
    states: [
      [[0, 0], [1, 0], [1, 1], [2, 1]],
      [[2, 0], [1, 1], [2, 1], [1, 2]],
      [[0, 1], [1, 1], [1, 2], [2, 2]],
      [[1, 0], [0, 1], [1, 1], [0, 2]],
    ],
  },
  J: {
    id: 6, color: '#4361ee', box: 3,
    states: [
      [[0, 0], [0, 1], [1, 1], [2, 1]],
      [[1, 0], [2, 0], [1, 1], [1, 2]],
      [[0, 1], [1, 1], [2, 1], [2, 2]],
      [[1, 0], [1, 1], [0, 2], [1, 2]],
    ],
  },
  L: {
    id: 7, color: '#f7a072', box: 3,
    states: [
      [[2, 0], [0, 1], [1, 1], [2, 1]],
      [[1, 0], [1, 1], [1, 2], [2, 2]],
      [[0, 1], [1, 1], [2, 1], [0, 2]],
      [[0, 0], [1, 0], [1, 1], [1, 2]],
    ],
  },
};

const NAMES = Object.keys(PIECES);
const COLOR_BY_ID = [null];
for (const n of NAMES) COLOR_BY_ID[PIECES[n].id] = PIECES[n].color;

// ---------------------------------------------------------------------------
// SRS wall kicks. Keyed by "fromTo" rotation state. The guideline tables are
// written with y up; these are already flipped to y down so they can be added
// straight to the piece origin. Five offsets per transition, tried in order.
// ---------------------------------------------------------------------------
const KICKS_JLSTZ = {
  '01': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
  '10': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
  '12': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
  '21': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
  '23': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
  '32': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
  '30': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
  '03': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
};
const KICKS_I = {
  '01': [[0, 0], [-2, 0], [1, 0], [-2, 1], [1, -2]],
  '10': [[0, 0], [2, 0], [-1, 0], [2, -1], [-1, 2]],
  '12': [[0, 0], [-1, 0], [2, 0], [-1, -2], [2, 1]],
  '21': [[0, 0], [1, 0], [-2, 0], [1, 2], [-2, -1]],
  '23': [[0, 0], [2, 0], [-1, 0], [2, -1], [-1, 2]],
  '32': [[0, 0], [-2, 0], [1, 0], [-2, 1], [1, -2]],
  '30': [[0, 0], [1, 0], [-2, 0], [1, 2], [-2, -1]],
  '03': [[0, 0], [-1, 0], [2, 0], [-1, -2], [2, 1]],
};
const NO_KICK = [[0, 0]];

function kicksFor(name, from, to) {
  if (name === 'O') return NO_KICK;
  return (name === 'I' ? KICKS_I : KICKS_JLSTZ)[String(from) + String(to)];
}

// ---------------------------------------------------------------------------
// Board: flat Uint8Array, 0 = empty, otherwise the piece id. Index is y*COLS+x.
// ---------------------------------------------------------------------------
function makeBoard() {
  return new Uint8Array(COLS * TOTAL);
}

// Does this piece, in this rotation, at this box origin, sit entirely on empty
// in-bounds cells? Walls, floor and settled blocks all fail the same test.
function fits(board, name, rot, x, y) {
  const cells = PIECES[name].states[rot];
  for (let i = 0; i < 4; i++) {
    const cx = x + cells[i][0];
    const cy = y + cells[i][1];
    if (cx < 0 || cx >= COLS || cy < 0 || cy >= TOTAL) return false;
    if (board[cy * COLS + cx]) return false;
  }
  return true;
}

function stamp(board, name, rot, x, y) {
  const id = PIECES[name].id;
  const cells = PIECES[name].states[rot];
  for (let i = 0; i < 4; i++) {
    board[(y + cells[i][1]) * COLS + (x + cells[i][0])] = id;
  }
}

// ---------------------------------------------------------------------------
// 7-bag randomizer: shuffle all seven, deal them out, refill. Guarantees you
// never wait more than 12 pieces for an I.
// ---------------------------------------------------------------------------
function makeBag() {
  let bag = [];
  return function next() {
    if (bag.length === 0) {
      bag = NAMES.slice();
      for (let i = bag.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [bag[i], bag[j]] = [bag[j], bag[i]];
      }
    }
    return bag.pop();
  };
}

// Guideline gravity curve: seconds per row at a given level.
function gravityMs(level) {
  const l = Math.min(level, 20) - 1;
  return Math.pow(0.8 - l * 0.007, l) * 1000;
}

// ---------------------------------------------------------------------------
// Timing, all in ms. Everything is advanced by the frame delta.
// ---------------------------------------------------------------------------
const LOCK_DELAY = 500;     // grounded piece locks after this long
const LOCK_RESETS = 15;     // ...unless moved/rotated, up to this many times
const DAS = 170;            // held left/right: delay before auto-shift
const ARR = 40;             // ...then this long between shifts
const SOFT_DROP_MULT = 20;  // soft drop is this many times gravity

// ---------------------------------------------------------------------------
// Game state
// ---------------------------------------------------------------------------
const game = {
  board: makeBoard(),
  nextPiece: makeBag(),
  cur: null,          // { name, rot, x, y }
  level: 1,
  gravityAcc: 0,      // ms accumulated toward the next gravity step
  lockAcc: 0,         // ms the piece has been resting on something
  lockResets: 0,      // move-resets used for the current piece
  over: false,
};

const input = {
  left: false, right: false, down: false,
  dasDir: 0,          // -1, 0, +1: direction currently auto-shifting
  dasAcc: 0,          // ms held toward DAS, then toward the next ARR shift
  charged: false,     // DAS elapsed, now in ARR
};

function spawn() {
  const name = game.nextPiece();
  const x = 3;
  // Prefer the row that leaves the piece's bottom in the first visible row;
  // fall back one row higher if that is blocked; if both fail, top out.
  for (const y of [BUFFER - 1, BUFFER - 2]) {
    if (fits(game.board, name, 0, x, y)) {
      game.cur = { name, rot: 0, x, y };
      game.gravityAcc = 0;
      game.lockAcc = 0;
      game.lockResets = 0;
      return true;
    }
  }
  game.cur = { name, rot: 0, x, y: BUFFER - 2 };
  game.over = true;
  return false;
}

function lockPiece() {
  const c = game.cur;
  stamp(game.board, c.name, c.rot, c.x, c.y);
  spawn();
}

function grounded() {
  const c = game.cur;
  return !fits(game.board, c.name, c.rot, c.x, c.y + 1);
}

// A successful move or rotate while resting on something restarts the lock
// timer, but only LOCK_RESETS times, so you cannot stall a piece forever.
function noteMoved() {
  if (grounded() && game.lockResets < LOCK_RESETS) {
    game.lockAcc = 0;
    game.lockResets += 1;
  }
}

function tryMove(dx, dy) {
  const c = game.cur;
  if (!fits(game.board, c.name, c.rot, c.x + dx, c.y + dy)) return false;
  c.x += dx;
  c.y += dy;
  return true;
}

function move(dx) {
  if (game.over) return;
  if (tryMove(dx, 0)) noteMoved();
}

// dir is +1 for clockwise, -1 for counter-clockwise. Try each kick offset for
// the (from, to) pair; first fit wins.
function rotate(dir) {
  if (game.over) return;
  const c = game.cur;
  const to = (c.rot + dir + 4) % 4;
  const kicks = kicksFor(c.name, c.rot, to);
  for (let i = 0; i < kicks.length; i++) {
    const nx = c.x + kicks[i][0];
    const ny = c.y + kicks[i][1];
    if (fits(game.board, c.name, to, nx, ny)) {
      c.rot = to;
      c.x = nx;
      c.y = ny;
      noteMoved();
      return true;
    }
  }
  return false;
}

function hardDrop() {
  if (game.over) return;
  while (tryMove(0, 1)) { /* fall */ }
  lockPiece();
}

function stepGravity() {
  if (!tryMove(0, 1)) {
    // resting: lock delay is handled in update()
    return;
  }
  game.lockAcc = 0;
}

function updateInput(dt) {
  // Horizontal auto-shift. dasDir is set on keydown so the first shift is
  // immediate; holding then waits DAS and repeats every ARR.
  if (input.dasDir !== 0) {
    input.dasAcc += dt;
    const threshold = input.charged ? ARR : DAS;
    while (input.dasAcc >= threshold) {
      input.dasAcc -= threshold;
      input.charged = true;
      move(input.dasDir);
    }
  }
}

function update(dt) {
  if (game.over) return;
  updateInput(dt);

  const interval = input.down ? gravityMs(game.level) / SOFT_DROP_MULT : gravityMs(game.level);
  game.gravityAcc += dt;
  while (game.gravityAcc >= interval && !game.over) {
    game.gravityAcc -= interval;
    stepGravity();
  }

  if (grounded()) {
    game.lockAcc += dt;
    if (game.lockAcc >= LOCK_DELAY) lockPiece();
  } else {
    game.lockAcc = 0;
  }
}

// ---------------------------------------------------------------------------
// Input. keydown/keyup feed a held-key model so left/right can auto-repeat on
// our own DAS/ARR clock instead of the OS key-repeat rate.
// ---------------------------------------------------------------------------
function startShift(dir) {
  input.dasDir = dir;
  input.dasAcc = 0;
  input.charged = false;
  move(dir);
}

function onKeyDown(e) {
  if (e.repeat) return;
  switch (e.code) {
    case 'ArrowLeft':  input.left = true;  startShift(-1); break;
    case 'ArrowRight': input.right = true; startShift(1);  break;
    case 'ArrowDown':  input.down = true; break;
    case 'ArrowUp': case 'KeyX': rotate(1); break;
    case 'KeyZ': case 'ControlLeft': rotate(-1); break;
    case 'Space': hardDrop(); break;
    default: return;
  }
  e.preventDefault();
}

function onKeyUp(e) {
  switch (e.code) {
    case 'ArrowLeft':
      input.left = false;
      // releasing one direction while the other is held resumes the other
      if (input.right) startShift(1); else input.dasDir = 0;
      break;
    case 'ArrowRight':
      input.right = false;
      if (input.left) startShift(-1); else input.dasDir = 0;
      break;
    case 'ArrowDown': input.down = false; break;
    default: return;
  }
  e.preventDefault();
}

// ---------------------------------------------------------------------------
// Rendering: full redraw from the board array every frame.
// ---------------------------------------------------------------------------
const boardCanvas = document.getElementById('board');
const ctx = boardCanvas.getContext('2d');

function drawCell(c, x, y, color, size) {
  const px = x * size;
  const py = y * size;
  c.fillStyle = color;
  c.fillRect(px, py, size, size);
  // bevel: light top-left, dark bottom-right
  c.fillStyle = 'rgba(255,255,255,0.22)';
  c.fillRect(px, py, size, 2);
  c.fillRect(px, py, 2, size);
  c.fillStyle = 'rgba(0,0,0,0.28)';
  c.fillRect(px, py + size - 2, size, 2);
  c.fillRect(px + size - 2, py, 2, size);
}

function drawPiece(c, name, rot, x, y, color, size) {
  const cells = PIECES[name].states[rot];
  for (let i = 0; i < 4; i++) {
    const cy = y + cells[i][1] - BUFFER;
    if (cy < 0) continue;
    drawCell(c, x + cells[i][0], cy, color, size);
  }
}

function render() {
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, boardCanvas.width, boardCanvas.height);

  // faint grid
  ctx.strokeStyle = 'rgba(255,255,255,0.05)';
  ctx.lineWidth = 1;
  for (let x = 1; x < COLS; x++) {
    ctx.beginPath(); ctx.moveTo(x * CELL + .5, 0); ctx.lineTo(x * CELL + .5, ROWS * CELL); ctx.stroke();
  }
  for (let y = 1; y < ROWS; y++) {
    ctx.beginPath(); ctx.moveTo(0, y * CELL + .5); ctx.lineTo(COLS * CELL, y * CELL + .5); ctx.stroke();
  }

  // settled blocks
  const b = game.board;
  for (let y = BUFFER; y < TOTAL; y++) {
    for (let x = 0; x < COLS; x++) {
      const id = b[y * COLS + x];
      if (id) drawCell(ctx, x, y - BUFFER, COLOR_BY_ID[id], CELL);
    }
  }

  // active piece
  if (game.cur) {
    const c = game.cur;
    drawPiece(ctx, c.name, c.rot, c.x, c.y, PIECES[c.name].color, CELL);
  }
}

// ---------------------------------------------------------------------------
// Loop: one requestAnimationFrame, delta time in ms, clamped so a background
// tab does not dump seconds of gravity on you when it comes back.
// ---------------------------------------------------------------------------
let last = performance.now();
function frame(now) {
  const dt = Math.min(now - last, 100);
  last = now;
  update(dt);
  render();
  requestAnimationFrame(frame);
}

window.addEventListener('keydown', onKeyDown);
window.addEventListener('keyup', onKeyUp);

spawn();
requestAnimationFrame(frame);

// Exposed for headless testing; not used by the game itself.
window.__tetris = { game, input, PIECES, fits, move, rotate, hardDrop, update, spawn, COLS, ROWS, BUFFER };

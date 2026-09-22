'use strict';

// ---------------------------------------------------------------------------
// Geometry. The board is COLS wide and TOTAL tall; the top BUFFER rows are
// hidden and exist so pieces can spawn above the visible field.
// ---------------------------------------------------------------------------
const COLS = 10;
const ROWS = 20;
const BUFFER = 2;
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
// Game state
// ---------------------------------------------------------------------------
const game = {
  board: makeBoard(),
  nextPiece: makeBag(),
  cur: null,          // { name, rot, x, y }
  level: 1,
  gravityAcc: 0,      // ms accumulated toward the next gravity step
  over: false,
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

function stepGravity() {
  const c = game.cur;
  if (fits(game.board, c.name, c.rot, c.x, c.y + 1)) {
    c.y += 1;
  } else {
    lockPiece();
  }
}

function update(dt) {
  if (game.over) return;
  game.gravityAcc += dt;
  const interval = gravityMs(game.level);
  while (game.gravityAcc >= interval && !game.over) {
    game.gravityAcc -= interval;
    stepGravity();
  }
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

spawn();
requestAnimationFrame(frame);

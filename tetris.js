'use strict';
// Tetris, agent-6. Plain JS, one file, no dependencies.
//
// Layout of this file:
//   1. constants: board size, piece shapes, colors, gravity curve
//   2. board: a flat Uint8Array, 0 = empty, 1..7 = piece id
//   3. game state and rules: spawn, gravity, lock
//   4. rendering: canvas, full redraw each frame
//   5. the loop: requestAnimationFrame with a ms accumulator

// ---------------------------------------------------------------- constants

const COLS = 10;
const VISIBLE_ROWS = 20;
const HIDDEN_ROWS = 2;            // spawn zone above the skyline
const ROWS = VISIBLE_ROWS + HIDDEN_ROWS;
const CELL = 30;                  // px; the board canvas is COLS*CELL x VISIBLE_ROWS*CELL

// Each piece is four explicit orientations (spawn, R, 2, L), written as
// strings so the shapes are readable in the source. Boxes are 3x3 except I,
// which is 4x4, exactly as SRS defines them. Rotation at runtime is just
// picking the next orientation; no matrix math.
const SHAPE_STRINGS = {
  I: ['....XXXX........', '..X...X...X...X.', '........XXXX....', '.X...X...X...X..'],
  O: ['.XX.XX....', '.XX.XX....', '.XX.XX....', '.XX.XX....'],
  T: ['.X.XXX...', '.X..XX.X.', '...XXX.X.', '.X.XX..X.'],
  S: ['.XXXX....', '.X..XX..X', '....XXXX.', 'X..XX..X.'],
  Z: ['XX..XX...', '..X.XX.X.', '...XX..XX', '.X.XX.X..'],
  J: ['X..XXX...', '.XX.X..X.', '...XXXX..', '.X..X.XX.'],
  L: ['..XXXX...', '.X..X..XX', '...XXXX..', 'XX..X..X.'],
};
const PIECE_NAMES = Object.keys(SHAPE_STRINGS); // id = index + 1
const COLORS = [null, '#3ec6ec', '#f2d43c', '#b56ce8', '#5ad35a', '#ee4f4f', '#4c6ef5', '#f29a3c'];

// Parse the strings once into arrays of [x, y] cell offsets per orientation.
const SHAPES = PIECE_NAMES.map(name => {
  const orients = SHAPE_STRINGS[name];
  const size = Math.sqrt(orients[0].length);
  return {
    name,
    size,
    cells: orients.map(s => {
      const out = [];
      for (let i = 0; i < s.length; i++) if (s[i] === 'X') out.push([i % size, Math.floor(i / size)]);
      return out;
    }),
  };
});

// Seconds per row at each level, the guideline curve. Level 1 is 1s a row,
// level 10 is 0.1s, level 20 is effectively instant.
function gravityMs(level) {
  const n = Math.min(level, 20) - 1;
  return Math.pow(0.8 - n * 0.007, n) * 1000;
}

// -------------------------------------------------------------------- board

// Row 0 is the top hidden row. Index = y * COLS + x.
const board = new Uint8Array(COLS * ROWS);

function cellAt(x, y) {
  if (x < 0 || x >= COLS || y >= ROWS) return 1; // walls and floor are solid
  if (y < 0) return 0;                            // above the board is open air
  return board[y * COLS + x];
}

// True if the piece's cells at (px, py, orientation) are all on empty cells.
function fits(shape, px, py, o) {
  for (const [cx, cy] of shape.cells[o]) if (cellAt(px + cx, py + cy)) return false;
  return true;
}

// ------------------------------------------------------------- game state

const game = {
  piece: null,        // { id, shape, x, y, o }
  gravityAcc: 0,      // ms accumulated toward the next gravity step
  over: false,
};

function randomPieceId() {
  return 1 + Math.floor(Math.random() * SHAPES.length);
}

function spawn() {
  const id = randomPieceId();
  const shape = SHAPES[id - 1];
  // Center the bounding box. 3-wide boxes sit at x=3 (cells 3..5), the I's
  // 4-wide box also at x=3 (cells 3..6). Box top starts at the top hidden row.
  const piece = { id, shape, x: 3, y: 0, o: 0 };
  if (!fits(shape, piece.x, piece.y, piece.o)) {
    game.over = true;
    game.piece = null;
    return;
  }
  // Guideline: a freshly spawned piece drops one row immediately if it can,
  // so its bottom row is visible the frame it appears.
  if (fits(shape, piece.x, piece.y + 1, piece.o)) piece.y++;
  game.piece = piece;
  game.gravityAcc = 0;
}

function lock() {
  const p = game.piece;
  for (const [cx, cy] of p.shape.cells[p.o]) {
    const y = p.y + cy;
    if (y >= 0) board[y * COLS + p.x + cx] = p.id;
  }
  game.piece = null;
  spawn();
}

// One gravity step. Returns false if the piece could not move.
function stepDown() {
  const p = game.piece;
  if (fits(p.shape, p.x, p.y + 1, p.o)) { p.y++; return true; }
  return false;
}

function update(dt) {
  if (game.over || !game.piece) return;
  game.gravityAcc += dt;
  const step = gravityMs(1);
  while (game.gravityAcc >= step) {
    game.gravityAcc -= step;
    if (!stepDown()) { lock(); return; }
  }
}

// ---------------------------------------------------------------- rendering

const boardCanvas = document.getElementById('board');
const ctx = boardCanvas.getContext('2d');

function drawCell(c, x, y, color, size = CELL) {
  // Flat fill with a lighter top-left bevel; the inset keeps a 1px grid line.
  c.fillStyle = color;
  c.fillRect(x + 1, y + 1, size - 2, size - 2);
  c.fillStyle = 'rgba(255,255,255,0.22)';
  c.fillRect(x + 1, y + 1, size - 2, 3);
  c.fillRect(x + 1, y + 1, 3, size - 2);
  c.fillStyle = 'rgba(0,0,0,0.25)';
  c.fillRect(x + 1, y + size - 4, size - 2, 3);
  c.fillRect(x + size - 4, y + 1, 3, size - 2);
}

function render() {
  const w = boardCanvas.width, h = boardCanvas.height;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, w, h);

  // faint grid
  ctx.strokeStyle = '#15171f';
  ctx.lineWidth = 1;
  for (let x = 1; x < COLS; x++) { ctx.beginPath(); ctx.moveTo(x * CELL + 0.5, 0); ctx.lineTo(x * CELL + 0.5, h); ctx.stroke(); }
  for (let y = 1; y < VISIBLE_ROWS; y++) { ctx.beginPath(); ctx.moveTo(0, y * CELL + 0.5); ctx.lineTo(w, y * CELL + 0.5); ctx.stroke(); }

  // settled cells; only the visible rows are drawn
  for (let y = HIDDEN_ROWS; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      const id = board[y * COLS + x];
      if (id) drawCell(ctx, x * CELL, (y - HIDDEN_ROWS) * CELL, COLORS[id]);
    }
  }

  // falling piece
  const p = game.piece;
  if (p) {
    for (const [cx, cy] of p.shape.cells[p.o]) {
      const y = p.y + cy - HIDDEN_ROWS;
      if (y >= 0) drawCell(ctx, (p.x + cx) * CELL, y * CELL, COLORS[p.id]);
    }
  }
}

// --------------------------------------------------------------------- loop

let last = performance.now();
function frame(now) {
  // Clamp dt so a backgrounded tab does not dump seconds of gravity at once.
  const dt = Math.min(now - last, 100);
  last = now;
  update(dt);
  render();
  requestAnimationFrame(frame);
}

spawn();
requestAnimationFrame(frame);

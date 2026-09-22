'use strict';
// Tetris, agent-6. Plain JS, one file, no dependencies.
//
// The file is two halves. The first half is the game core: constants, board,
// rules, input timing. It never touches the DOM, so `require('./tetris.js')`
// works in node and the rules can be tested headlessly. The second half,
// mount(), wires a canvas and the keyboard to a core instance, and only runs
// when a document exists.

// ---------------------------------------------------------------- constants

const COLS = 10;
const VISIBLE_ROWS = 20;
const HIDDEN_ROWS = 4;            // spawn zone above the skyline; 4 not 2 because
                                  // SRS kicks can lift a piece two rows (taken from agent-3)
const ROWS = VISIBLE_ROWS + HIDDEN_ROWS;
const CELL = 30;                  // px; the board canvas is COLS*CELL x VISIBLE_ROWS*CELL

// Input feel, all in ms. DAS: how long a held direction waits before it
// auto-repeats. ARR: the repeat period after that. LOCK_DELAY: how long a
// grounded piece waits before it locks; each successful move or rotate on the
// ground restarts it, at most LOCK_RESETS times, so a piece cannot be kept
// alive forever by wiggling.
const DAS = 170;
const ARR = 40;
const LOCK_DELAY = 500;
const LOCK_RESETS = 15;
const SOFT_DROP_FACTOR = 20;      // soft drop is this many times faster than gravity
const CLEAR_FLASH = 140;          // ms the cleared rows stay lit before collapsing
const TRAIL_MS = 120;             // ms the hard-drop trail lingers (idea from agent-7)
const LINES_PER_LEVEL = 10;

// Guideline scoring: base per clear count, times level. A tetris directly
// after another tetris (no non-tetris clear between) pays 1.5x.
const CLEAR_SCORE = [0, 100, 300, 500, 800];
const TSPIN_SCORE = [400, 800, 1200, 1600];   // by lines cleared, 0..3
const TSPIN_MINI_SCORE = [100, 200, 400];     // 0..2
const COMBO_SCORE = 50;                       // x combo count x level, per consecutive clearing lock
const PERFECT_CLEAR_SCORE = [0, 800, 1200, 1800, 2000]; // board empty after the clear (taken from agent-8)
const BACK_TO_BACK = 1.5;                     // tetris or T-spin clear after another such clear
const NEXT_COUNT = 5;                         // pieces shown in the preview
const SOFT_DROP_POINTS = 1;       // per row
const HARD_DROP_POINTS = 2;       // per row

// Each piece is four explicit orientations (spawn, R, 2, L), written as
// strings so the shapes are readable in the source. Boxes are 3x3 except I,
// which is 4x4, exactly as SRS defines them. Rotation at runtime is just
// picking the next orientation; no matrix math. The orientation index is
// also the key into the kick tables, which is why they must be explicit.
const SHAPE_STRINGS = {
  I: ['....XXXX........', '..X...X...X...X.', '........XXXX....', '.X...X...X...X..'],
  O: ['.XX.XX...', '.XX.XX...', '.XX.XX...', '.XX.XX...'],
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
  if (!Number.isInteger(size) || orients.some(o => o.length !== size * size || (o.match(/X/g) || []).length !== 4)) {
    throw new Error('bad shape table for ' + name);
  }
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

// SRS wall kicks. Key is "from>to" orientation. The published tables use
// y-up; these are already flipped to y-down board coordinates, so a kick of
// [0, 2] here moves the piece two rows DOWN the screen. Offsets are tried in
// order and the first that fits wins; if none fit the rotation is refused.
const KICKS_JLSTZ = {
  '0>1': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
  '1>0': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
  '1>2': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
  '2>1': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
  '2>3': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
  '3>2': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
  '3>0': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
  '0>3': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
};
const KICKS_I = {
  '0>1': [[0, 0], [-2, 0], [1, 0], [-2, 1], [1, -2]],
  '1>0': [[0, 0], [2, 0], [-1, 0], [2, -1], [-1, 2]],
  '1>2': [[0, 0], [-1, 0], [2, 0], [-1, -2], [2, 1]],
  '2>1': [[0, 0], [1, 0], [-2, 0], [1, 2], [-2, -1]],
  '2>3': [[0, 0], [2, 0], [-1, 0], [2, -1], [-1, 2]],
  '3>2': [[0, 0], [-2, 0], [1, 0], [-2, 1], [1, -2]],
  '3>0': [[0, 0], [1, 0], [-2, 0], [1, 2], [-2, -1]],
  '0>3': [[0, 0], [-1, 0], [2, 0], [-1, -2], [2, 1]],
};
// 180-degree rotation. Guideline SRS has no 180 table; this is TETR.IO's
// SRS+ table, six tests, the same for every piece (taken from agent-8, who
// stores it y-up and negates at rotate time; here it is flipped to y-down at
// the source like the tables above, so the file has one convention).
const KICKS_180 = {
  '0>2': [[0, 0], [0, -1], [1, -1], [-1, -1], [1, 0], [-1, 0]],
  '2>0': [[0, 0], [0, 1], [-1, 1], [1, 1], [-1, 0], [1, 0]],
  '1>3': [[0, 0], [1, 0], [1, -2], [1, -1], [0, -2], [0, -1]],
  '3>1': [[0, 0], [-1, 0], [-1, -2], [-1, -1], [0, -2], [0, -1]],
};
const NO_KICK = [[0, 0]];

function kicksFor(shape, from, to) {
  if (shape.name === 'O') return NO_KICK;
  if ((to - from + 4) % 4 === 2) return KICKS_180[from + '>' + to];
  return (shape.name === 'I' ? KICKS_I : KICKS_JLSTZ)[from + '>' + to];
}

// Seconds per row at each level, the guideline curve. Level 1 is 1s a row,
// level 10 is 0.06s, level 20 is effectively instant.
function gravityMs(level) {
  const n = Math.min(level, 20) - 1;
  return Math.pow(0.8 - n * 0.007, n) * 1000;
}

// mulberry32: a small seeded PRNG so a game is replayable from its seed
// (taken from agent-1). The seed lives in the URL hash in the browser and is
// a plain number in tests.
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function freshSeed() {
  return (Date.now() ^ (Math.random() * 0xffffffff)) >>> 0;
}

// 7-bag randomizer: deal all seven pieces in a random order, then refill.
// The longest possible wait for any piece is 12. Taken from agent-9; the
// random source is injected so tests can be deterministic.
function makeBag(random) {
  let bag = [];
  return function next() {
    if (bag.length === 0) {
      bag = PIECE_NAMES.map((_, i) => i + 1);
      for (let i = bag.length - 1; i > 0; i--) {
        const j = Math.floor(random() * (i + 1));
        [bag[i], bag[j]] = [bag[j], bag[i]];
      }
    }
    return bag.pop();
  };
}

// -------------------------------------------------------------------- board

// Row 0 is the top hidden row. Index = y * COLS + x.
// Everything outside the array is solid, including above row 0, so a piece
// can never occupy a cell that lock() could not store. The hidden rows are
// tall enough that this never refuses a legal SRS kick.
function cellAt(board, x, y) {
  if (x < 0 || x >= COLS || y < 0 || y >= ROWS) return 1;
  return board[y * COLS + x];
}

// Collapse every full row. Scans bottom-up; after a copyWithin the same
// index holds the row that was above it, so it is examined again. Returns
// the number of rows cleared. (Shape of this loop taken from agent-3.)
function clearFullRows(board) {
  let cleared = 0;
  for (let y = ROWS - 1; y >= 0; y--) {
    if (!rowFull(board, y)) continue;
    board.copyWithin(COLS, 0, y * COLS);
    board.fill(0, 0, COLS);
    cleared++;
    y++;
  }
  return cleared;
}

function rowFull(board, y) {
  for (let x = 0; x < COLS; x++) if (!board[y * COLS + x]) return false;
  return true;
}

// True if every cell outside the given (full) rows is empty: the board will
// be empty once those rows collapse. Used for the perfect-clear bonus.
function boardEmptyExcept(board, rows) {
  for (let y = 0; y < ROWS; y++) {
    if (rows.includes(y)) continue;
    for (let x = 0; x < COLS; x++) if (board[y * COLS + x]) return false;
  }
  return true;
}

function fullRows(board) {
  const rows = [];
  for (let y = 0; y < ROWS; y++) if (rowFull(board, y)) rows.push(y);
  return rows;
}

// True if the piece's cells at (px, py, orientation) are all on empty cells.
function fits(board, shape, px, py, o) {
  for (const [cx, cy] of shape.cells[o]) if (cellAt(board, px + cx, py + cy)) return false;
  return true;
}

// ------------------------------------------------------------------- game

function newGame(seed = freshSeed()) {
  const g = {
    seed: seed >>> 0,
    board: new Uint8Array(COLS * ROWS),
    bag: makeBag(mulberry32(seed)),
    queue: [],            // the next NEXT_COUNT piece ids, front is next
    hold: 0,              // piece id in the hold slot, 0 = empty
    holdUsed: false,      // hold already used for the current piece
    piece: null,          // { id, shape, x, y, o, lowestY, spun, kick }
    over: false,
    paused: false,

    score: 0,
    lines: 0,
    level: 1,
    backToBack: false,    // last clear was a tetris or a T-spin
    combo: -1,            // consecutive locks that cleared lines; -1 = none
    lastEvent: null,      // { label, points } of the last scoring clear, for the HUD
    clearing: null,       // { rows: [y...], timer: ms } while rows flash before collapsing
    trail: null,          // { cells, x, y0, y1, timer } after a hard drop, for the renderer

    gravityAcc: 0,        // ms toward the next gravity step
    lockTimer: 0,         // ms the piece has been grounded
    lockResets: 0,        // moves/rotates that restarted lockTimer this piece
    grounded: false,      // piece cannot move down right now

    // Input state; the DOM layer calls press()/release(), update() reads it.
    // heldDirs is a stack of -1/1, oldest first: the newest press wins and
    // releasing it falls back to whatever is still held (shape from agent-1).
    heldDirs: [],
    softDrop: false,
    dasTimer: 0,          // ms since the active direction was pressed (or since the last ARR step)
    dasCharged: false,    // past the DAS threshold, now repeating every ARR
  };
  while (g.queue.length < NEXT_COUNT) g.queue.push(g.bag());
  spawn(g);
  return g;
}

// Put a specific piece id into play at the spawn position. Returns false on
// block-out (and sets g.over).
function spawn(g, id = null) {
  if (id === null) {
    id = g.queue.shift();
    g.queue.push(g.bag());
  }
  const shape = SHAPES[id - 1];
  // Center the bounding box: 3-wide boxes at x=3 (cells 3..5), the I's 4-wide
  // box also at x=3 (cells 3..6). The box top sits two rows above the
  // skyline so the piece's lowest row is the last hidden row.
  const piece = { id, shape, x: 3, y: HIDDEN_ROWS - 2, o: 0, lowestY: 0, spun: false, kick: 0 };
  if (!fits(g.board, shape, piece.x, piece.y, piece.o)) {
    // Block-out. Try one row higher first so a nearly-full board gets one
    // more piece (agent-3 does this too).
    piece.y--;
    if (!fits(g.board, shape, piece.x, piece.y, piece.o)) {
      g.over = true;
      g.piece = null;
      return false;
    }
  }
  // Guideline: a fresh piece drops one row immediately if it can, so its
  // bottom row is visible the frame it appears.
  if (fits(g.board, shape, piece.x, piece.y + 1, piece.o)) piece.y++;
  piece.lowestY = piece.y;
  g.piece = piece;
  g.holdUsed = false;
  g.gravityAcc = 0;
  g.lockTimer = 0;
  g.lockResets = 0;
  g.grounded = false;
  return true;
}

// Swap the falling piece with the hold slot, once per piece. The held piece
// comes back in its spawn orientation at the spawn position.
function holdPiece(g) {
  if (!g.piece || g.holdUsed || g.over) return false;
  const swapOut = g.piece.id;
  const swapIn = g.hold;
  g.hold = swapOut;
  if (swapIn) spawn(g, swapIn); else spawn(g);
  g.holdUsed = true;
  return true;
}

// Row the piece would land on if dropped straight down. The ghost is drawn there.
function activeDir(g) {
  return g.heldDirs.length ? g.heldDirs[g.heldDirs.length - 1] : 0;
}

// Drop every held key. Called on window blur so nothing auto-repeats into a
// wall while the tab is not focused (agent-1 does this too).
function releaseAll(g) {
  g.heldDirs.length = 0;
  g.softDrop = false;
  g.dasTimer = 0;
  g.dasCharged = false;
}

function ghostY(g) {
  const p = g.piece;
  let y = p.y;
  while (fits(g.board, p.shape, p.x, y + 1, p.o)) y++;
  return y;
}

// T-spin test, the 3-corner rule (taken from agent-5). The last maneuver
// must have been a rotation, and at least three of the four diagonal corners
// of the T's 3x3 box must be solid. It is a full T-spin if both corners on
// the side the T points to are solid, or the rotation used the fifth kick;
// otherwise it is a mini. Returns null, 'mini' or 'full'.
function tspinKind(g, p) {
  if (p.shape.name !== 'T' || !p.spun) return null;
  const cx = p.x + 1, cy = p.y + 1;
  const tl = !!cellAt(g.board, cx - 1, cy - 1), tr = !!cellAt(g.board, cx + 1, cy - 1);
  const bl = !!cellAt(g.board, cx - 1, cy + 1), br = !!cellAt(g.board, cx + 1, cy + 1);
  if (tl + tr + bl + br < 3) return null;
  const front = [[tl, tr], [tr, br], [bl, br], [tl, bl]][p.o];
  return (front[0] && front[1]) || p.kick === 4 ? 'full' : 'mini';
}

function lock(g) {
  const p = g.piece;
  const spin = tspinKind(g, p);
  let anyVisible = false;
  for (const [cx, cy] of p.shape.cells[p.o]) {
    const y = p.y + cy;
    g.board[y * COLS + p.x + cx] = p.id;
    if (y >= HIDDEN_ROWS) anyVisible = true;
  }
  g.piece = null;
  // Lock-out: a piece that settles entirely above the skyline ends the game
  // (taken from agent-1). Block-out is handled in spawn().
  if (!anyVisible) { g.over = true; return; }

  const rows = fullRows(g.board);
  // Scoring happens now, at lock, because a T-spin with zero lines still
  // pays and the spin state is only known here.
  award(g, rows.length, spin);
  if (rows.length === 0) { spawn(g); return; }
  // Rows flash for CLEAR_FLASH ms before they collapse; update() finishes it.
  g.clearing = { rows, timer: 0 };
}

function award(g, n, spin) {
  let points, label;
  if (spin === 'full') { points = TSPIN_SCORE[n]; label = 'T-spin ' + ['', 'single', 'double', 'triple'][n]; }
  else if (spin === 'mini') { points = TSPIN_MINI_SCORE[Math.min(n, 2)]; label = 'Mini T-spin ' + ['', 'single', 'double'][Math.min(n, 2)]; }
  else { points = CLEAR_SCORE[n]; label = ['', 'Single', 'Double', 'Triple', 'Tetris'][n]; }
  points *= g.level;
  if (n > 0) {
    const difficult = n === 4 || spin !== null;
    if (difficult && g.backToBack) { points = Math.floor(points * BACK_TO_BACK); label = 'B2B ' + label; }
    g.backToBack = difficult;
    g.combo++;
    if (g.combo > 0) { points += COMBO_SCORE * g.combo * g.level; label += ' x' + (g.combo + 1); }
    if (boardEmptyExcept(g.board, fullRows(g.board))) { points += PERFECT_CLEAR_SCORE[n] * g.level; label = 'Perfect clear ' + label; }
    g.lines += n;
    g.level = 1 + Math.floor(g.lines / LINES_PER_LEVEL);
  } else {
    g.combo = -1;
  }
  if (points > 0) { g.score += points; g.lastEvent = { label: label.trim(), points }; }
}

function finishClear(g) {
  clearFullRows(g.board);
  g.clearing = null;
  spawn(g);
}

// Try to move the piece by (dx, dy). Returns true on success. A successful
// move while grounded restarts the lock delay (bounded by LOCK_RESETS).
function tryMove(g, dx, dy) {
  const p = g.piece;
  if (!p || !fits(g.board, p.shape, p.x + dx, p.y + dy, p.o)) return false;
  p.x += dx; p.y += dy;
  p.spun = false;                 // a T-spin needs the rotation to be the last maneuver
  if (dx !== 0) noteLockReset(g);
  if (p.y > p.lowestY) {
    // Guideline: reaching a new lowest row refreshes the reset budget, so
    // a piece that falls further after wiggling is not stuck with none.
    p.lowestY = p.y;
    g.lockResets = 0;
  }
  return true;
}

function noteLockReset(g) {
  if (g.grounded && g.lockResets < LOCK_RESETS) {
    g.lockTimer = 0;
    g.lockResets++;
  }
}

// Rotate by dir (+1 cw, -1 ccw, 2 for a 180) using the kick tables. Returns
// true on success.
function tryRotate(g, dir) {
  const p = g.piece;
  if (!p) return false;
  const to = (p.o + dir + 4) % 4;
  const kicks = kicksFor(p.shape, p.o, to);
  for (let i = 0; i < kicks.length; i++) {
    const [kx, ky] = kicks[i];
    if (fits(g.board, p.shape, p.x + kx, p.y + ky, to)) {
      p.x += kx; p.y += ky; p.o = to;
      p.spun = true;
      // The fifth-kick T-spin upgrade is defined for the 90-degree tables;
      // a 180 leaves it to the corner rule alone.
      p.kick = dir === 2 ? 0 : i;
      noteLockReset(g);
      if (p.y > p.lowestY) { p.lowestY = p.y; g.lockResets = 0; }
      return true;
    }
  }
  return false;
}

function hardDrop(g) {
  if (!g.piece || g.over) return;
  const p = g.piece;
  const y0 = p.y;
  let rows = 0;
  while (tryMove(g, 0, 1)) rows++;
  g.score += rows * HARD_DROP_POINTS;
  if (rows > 0) g.trail = { cells: p.shape.cells[p.o], x: p.x, y0, y1: p.y, timer: 0 };
  lock(g);
}

// --- input entry points. `key` is one of left, right, down, cw, ccw, hard.
function press(g, key) {
  if (key === 'pause') { if (!g.over) g.paused = !g.paused; return; }
  if (g.over || g.paused) return;
  switch (key) {
    case 'left':
    case 'right': {
      const dir = key === 'left' ? -1 : 1;
      g.heldDirs = g.heldDirs.filter(d => d !== dir);
      g.heldDirs.push(dir);
      // The first step is immediate, then DAS, then ARR.
      tryMove(g, dir, 0);
      g.dasTimer = 0;
      g.dasCharged = false;
      break;
    }
    case 'down': g.softDrop = true; break;
    case 'cw': tryRotate(g, 1); break;
    case 'ccw': tryRotate(g, -1); break;
    case 'r180': tryRotate(g, 2); break;
    case 'hard': hardDrop(g); break;
    case 'hold': holdPiece(g); break;
  }
}

function release(g, key) {
  if (key === 'left' || key === 'right') {
    const dir = key === 'left' ? -1 : 1;
    const wasActive = activeDir(g) === dir;
    g.heldDirs = g.heldDirs.filter(d => d !== dir);
    if (wasActive) {
      // Hand DAS to the older direction already charged: it has been held
      // longer than DAS by definition, so restarting it would stutter.
      g.dasTimer = 0;
      g.dasCharged = g.heldDirs.length > 0;
    }
  } else if (key === 'down') {
    g.softDrop = false;
  }
}

// Advance the game by dt ms.
function update(g, dt) {
  if (g.over || g.paused) return;

  if (g.trail) {
    g.trail.timer += dt;
    if (g.trail.timer >= TRAIL_MS) g.trail = null;
  }

  // Horizontal auto-repeat. The accumulator runs even while rows flash and
  // no piece exists, so a direction held through a line clear is already
  // charged when the next piece appears (agent-10 found every arena game
  // restarted DAS from zero here). Only the move itself needs a piece.
  const dir = activeDir(g);
  if (dir !== 0) {
    g.dasTimer += dt;
    if (!g.dasCharged && g.dasTimer >= DAS) {
      g.dasCharged = true;
      g.dasTimer -= DAS;
      if (g.piece) tryMove(g, dir, 0);
    }
    if (g.dasCharged && g.piece) {
      while (g.dasTimer >= ARR) {
        g.dasTimer -= ARR;
        if (!tryMove(g, dir, 0)) { g.dasTimer = 0; break; }
      }
    }
    // Stay charged without banking repeats for the next piece.
    if (g.dasCharged && !g.piece) g.dasTimer = Math.min(g.dasTimer, ARR);
  }

  if (g.clearing) {
    g.clearing.timer += dt;
    if (g.clearing.timer >= CLEAR_FLASH) finishClear(g);
    return;
  }
  if (!g.piece) return;

  // Gravity, or soft drop when down is held.
  let step = gravityMs(g.level);
  if (g.softDrop) step = Math.max(step / SOFT_DROP_FACTOR, 1);
  g.gravityAcc += dt;
  while (g.gravityAcc >= step) {
    g.gravityAcc -= step;
    if (!tryMove(g, 0, 1)) { g.gravityAcc = 0; break; }
    if (g.softDrop) g.score += SOFT_DROP_POINTS;
  }

  // Lock delay: only counts while the piece cannot fall.
  const p = g.piece;
  g.grounded = !fits(g.board, p.shape, p.x, p.y + 1, p.o);
  if (g.grounded) {
    g.lockTimer += dt;
    if (g.lockTimer >= LOCK_DELAY) lock(g);
  } else {
    g.lockTimer = 0;
  }
}

if (typeof module !== 'undefined') {
  module.exports = {
    COLS, ROWS, HIDDEN_ROWS, VISIBLE_ROWS, DAS, ARR, LOCK_DELAY, LOCK_RESETS,
    CLEAR_FLASH, TRAIL_MS, CLEAR_SCORE, LINES_PER_LEVEL, mulberry32,
    SHAPES, COLORS, KICKS_JLSTZ, KICKS_I, KICKS_180, gravityMs, makeBag, cellAt, fits,
    clearFullRows, fullRows,
    NEXT_COUNT, TSPIN_SCORE, TSPIN_MINI_SCORE, COMBO_SCORE, PERFECT_CLEAR_SCORE,
    newGame, spawn, lock, finishClear, tryMove, tryRotate, hardDrop, holdPiece, ghostY, tspinKind,
    activeDir, releaseAll, press, release, update,
  };
}

// ---------------------------------------------------------------- DOM layer

function mount(doc, win) {
  // Backing store scaled by devicePixelRatio so cell edges are crisp on
  // high-density screens; drawing code stays in CSS pixels (from agent-1).
  function fitCanvas(c) {
    const dpr = win.devicePixelRatio || 1;
    const cssW = c.width, cssH = c.height;
    c.width = Math.round(cssW * dpr);
    c.height = Math.round(cssH * dpr);
    c.style.width = cssW + 'px';
    c.style.height = cssH + 'px';
    c.getContext('2d').setTransform(dpr, 0, 0, dpr, 0, 0);
    return { w: cssW, h: cssH };
  }
  const boardCanvas = doc.getElementById('board');
  const boardSize = fitCanvas(boardCanvas);
  const ctx = boardCanvas.getContext('2d');
  const nextCanvas = doc.getElementById('next');
  const nextSize = fitCanvas(nextCanvas);
  const nextCtx = nextCanvas.getContext('2d');
  const holdCanvas = doc.getElementById('hold');
  const holdSize = fitCanvas(holdCanvas);
  const holdCtx = holdCanvas.getContext('2d');
  const eventEl = doc.getElementById('event');
  const holdPanel = doc.getElementById('hold-panel');
  const hud = {
    score: doc.getElementById('score'),
    lines: doc.getElementById('lines'),
    level: doc.getElementById('level'),
    best: doc.getElementById('best'),
    seed: doc.getElementById('seed'),
  };
  const overlay = doc.getElementById('overlay');
  const overlayTitle = doc.getElementById('overlay-title');
  const overlayHint = doc.getElementById('overlay-hint');
  // The seed lives in the URL hash so a game can be replayed or sent to
  // someone: index.html#seed=2024 always deals the same pieces (agent-1).
  function seedFromHash() {
    const m = /seed=(\d+)/.exec(win.location.hash);
    return m ? Number(m[1]) >>> 0 : undefined;
  }
  function start(seed) {
    const game = newGame(seed);
    if (win.location.hash !== '#seed=' + game.seed) {
      try { win.history.replaceState(null, '', '#seed=' + game.seed); } catch (e) { /* file:// may refuse */ }
    }
    return game;
  }
  let g = start(seedFromHash());

  // Best score lives in localStorage, which file:// and private windows may
  // refuse; the game must not care (same guard as agent-1, 9 and 10).
  const BEST_KEY = 'tetris-agent-6-best';
  function loadBest() { try { return Number(win.localStorage.getItem(BEST_KEY)) || 0; } catch (e) { return 0; } }
  function saveBest(n) { try { win.localStorage.setItem(BEST_KEY, String(n)); } catch (e) { /* ignore */ } }
  let best = loadBest();

  // Only touch the DOM when a number changes; text writes are the one thing
  // here that costs layout.
  const shown = { score: -1, lines: -1, level: -1, best: -1, seed: -1, overlay: null, event: null, queue: '', hold: -1, spent: null };
  function syncHud() {
    for (const k of ['score', 'lines', 'level', 'seed']) {
      if (shown[k] !== g[k]) { shown[k] = g[k]; hud[k].textContent = String(g[k]); }
    }
    if (g.score > best) { best = g.score; saveBest(best); }
    if (shown.best !== best) { shown.best = best; hud.best.textContent = String(best); }
    if (shown.spent !== g.holdUsed) { shown.spent = g.holdUsed; holdPanel.classList.toggle('spent', g.holdUsed); }
    if (shown.event !== g.lastEvent) {
      shown.event = g.lastEvent;
      eventEl.textContent = g.lastEvent ? `${g.lastEvent.label}  +${g.lastEvent.points}` : '';
    }
    const q = g.queue.join(',');
    if (shown.queue !== q) { shown.queue = q; drawPreview(nextCtx, nextSize, g.queue); }
    if (shown.hold !== g.hold) { shown.hold = g.hold; drawPreview(holdCtx, holdSize, g.hold ? [g.hold] : []); }
    const state = g.over ? 'over' : g.paused ? 'paused' : 'playing';
    if (shown.overlay !== state) {
      shown.overlay = state;
      overlay.classList.toggle('hidden', state === 'playing');
      if (state === 'over') { overlayTitle.textContent = 'Game over'; overlayHint.textContent = 'Press R to restart'; }
      if (state === 'paused') { overlayTitle.textContent = 'Paused'; overlayHint.textContent = 'Press P to resume'; }
    }
  }

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

  // Draw an outlined cell for the ghost: the same footprint, no fill, so it
  // never reads as a settled block.
  function drawGhostCell(c, x, y, color) {
    c.strokeStyle = color;
    c.lineWidth = 2;
    c.globalAlpha = 0.45;
    c.strokeRect(x + 2, y + 2, CELL - 4, CELL - 4);
    c.globalAlpha = 1;
  }

  // Preview canvases: each piece in a 4x4 box, centered on its bounding box,
  // at a smaller cell size so five fit in the next column.
  function drawPreview(c, canvas, ids) {
    const size = 24;
    const slot = canvas.h / NEXT_COUNT;
    c.fillStyle = '#0e0f13';
    c.fillRect(0, 0, canvas.w, canvas.h);
    ids.forEach((id, i) => {
      const shape = SHAPES[id - 1];
      const cells = shape.cells[0];
      let minX = 9, maxX = -1, minY = 9, maxY = -1;
      for (const [cx, cy] of cells) { minX = Math.min(minX, cx); maxX = Math.max(maxX, cx); minY = Math.min(minY, cy); maxY = Math.max(maxY, cy); }
      const pw = (maxX - minX + 1) * size, ph = (maxY - minY + 1) * size;
      const ox = (canvas.w - pw) / 2;
      const oy = (ids.length === 1 ? (canvas.h - ph) / 2 : i * slot + (slot - ph) / 2);
      for (const [cx, cy] of cells) drawCell(c, ox + (cx - minX) * size, oy + (cy - minY) * size, COLORS[id], size);
    });
  }

  // Blend a hex color toward white by t in [0, 1], for the lock-delay pulse.
  function lighten(hex, t) {
    const n = parseInt(hex.slice(1), 16);
    const ch = sh => Math.round(((n >> sh) & 255) + (255 - ((n >> sh) & 255)) * t);
    return `rgb(${ch(16)},${ch(8)},${ch(0)})`;
  }

  function render() {
    const w = boardSize.w, h = boardSize.h;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, w, h);

    ctx.strokeStyle = '#15171f';
    ctx.lineWidth = 1;
    for (let x = 1; x < COLS; x++) { ctx.beginPath(); ctx.moveTo(x * CELL + 0.5, 0); ctx.lineTo(x * CELL + 0.5, h); ctx.stroke(); }
    for (let y = 1; y < VISIBLE_ROWS; y++) { ctx.beginPath(); ctx.moveTo(0, y * CELL + 0.5); ctx.lineTo(w, y * CELL + 0.5); ctx.stroke(); }

    for (let y = HIDDEN_ROWS; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        const id = g.board[y * COLS + x];
        if (id) drawCell(ctx, x * CELL, (y - HIDDEN_ROWS) * CELL, COLORS[id]);
      }
    }

    const p = g.piece;
    if (p) {
      const gy = ghostY(g);
      if (gy !== p.y) {
        for (const [cx, cy] of p.shape.cells[p.o]) {
          const y = gy + cy - HIDDEN_ROWS;
          if (y >= 0) drawGhostCell(ctx, (p.x + cx) * CELL, y * CELL, COLORS[p.id]);
        }
      }
      // While grounded the piece brightens as the lock delay runs out, so
      // the lock is something you watched coming (idea from agent-5).
      const t = g.grounded ? Math.min(g.lockTimer / LOCK_DELAY, 1) : 0;
      const color = t > 0 ? lighten(COLORS[p.id], t * 0.55) : COLORS[p.id];
      for (const [cx, cy] of p.shape.cells[p.o]) {
        const y = p.y + cy - HIDDEN_ROWS;
        if (y >= 0) drawCell(ctx, (p.x + cx) * CELL, y * CELL, color);
      }
    }

    // Hard-drop trail: a streak fading in down each column the piece fell
    // through, gone after TRAIL_MS (agent-7's idea).
    const tr = g.trail;
    if (tr) {
      const alpha = 0.35 * (1 - tr.timer / TRAIL_MS);
      const cols = new Map();
      for (const [cx, cy] of tr.cells) {
        const c = cols.get(cx);
        cols.set(cx, c ? [Math.min(c[0], cy), Math.max(c[1], cy)] : [cy, cy]);
      }
      ctx.globalAlpha = alpha;
      for (const [cx, [top, bottom]] of cols) {
        const yStart = (tr.y0 + top - HIDDEN_ROWS) * CELL;
        const yEnd = (tr.y1 + bottom - HIDDEN_ROWS) * CELL;
        if (yEnd <= 0) continue;
        const grad = ctx.createLinearGradient(0, Math.max(yStart, 0), 0, yEnd);
        grad.addColorStop(0, 'rgba(255,255,255,0)');
        grad.addColorStop(1, '#ffffff');
        ctx.fillStyle = grad;
        ctx.fillRect((tr.x + cx) * CELL + 1, Math.max(yStart, 0), CELL - 2, yEnd - Math.max(yStart, 0));
      }
      ctx.globalAlpha = 1;
    }

    // Rows about to collapse flash white, fading over CLEAR_FLASH.
    if (g.clearing) {
      const a = 1 - g.clearing.timer / CLEAR_FLASH;
      ctx.fillStyle = `rgba(255,255,255,${(0.35 + 0.65 * a).toFixed(3)})`;
      for (const y of g.clearing.rows) {
        if (y >= HIDDEN_ROWS) ctx.fillRect(0, (y - HIDDEN_ROWS) * CELL, w, CELL);
      }
    }
    syncHud();
  }

  // Keyboard. keydown auto-repeat from the OS is ignored; DAS is ours.
  const KEYMAP = {
    ArrowLeft: 'left', ArrowRight: 'right', ArrowDown: 'down',
    ArrowUp: 'cw', KeyX: 'cw', KeyZ: 'ccw', KeyA: 'r180', Space: 'hard',
    KeyC: 'hold', ShiftLeft: 'hold', ShiftRight: 'hold',
    KeyP: 'pause', Escape: 'pause',
  };
  doc.addEventListener('keydown', e => {
    // R deals a new seed; Shift+R replays the current one (agent-1).
    if (e.code === 'KeyR') { g = start(e.shiftKey ? g.seed : undefined); return; }
    const key = KEYMAP[e.code];
    if (!key) return;
    e.preventDefault();
    if (e.repeat) return;
    press(g, key);
  });
  doc.addEventListener('keyup', e => {
    const key = KEYMAP[e.code];
    if (key) release(g, key);
  });
  // Losing the tab or the window pauses the game and drops every held key,
  // so nothing auto-repeats into a wall when focus comes back.
  function pauseFromOutside() {
    releaseAll(g);
    if (!g.over && !g.paused) g.paused = true;
  }
  doc.addEventListener('visibilitychange', () => { if (doc.hidden) pauseFromOutside(); });
  win.addEventListener('blur', pauseFromOutside);

  let last = win.performance.now();
  function frame(now) {
    // Clamp dt so a stalled frame does not dump seconds of gravity at once.
    const dt = Math.min(now - last, 100);
    last = now;
    update(g, dt);
    render();
    win.requestAnimationFrame(frame);
  }
  win.requestAnimationFrame(frame);
  return () => g;
}

if (typeof document !== 'undefined') mount(document, window);

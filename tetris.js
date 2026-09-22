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
const HIDDEN_ROWS = 2;            // spawn zone above the skyline
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
const NO_KICK = [[0, 0]];

function kicksFor(shape, from, to) {
  if (shape.name === 'O') return NO_KICK;
  return (shape.name === 'I' ? KICKS_I : KICKS_JLSTZ)[from + '>' + to];
}

// Seconds per row at each level, the guideline curve. Level 1 is 1s a row,
// level 10 is 0.06s, level 20 is effectively instant.
function gravityMs(level) {
  const n = Math.min(level, 20) - 1;
  return Math.pow(0.8 - n * 0.007, n) * 1000;
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
function cellAt(board, x, y) {
  if (x < 0 || x >= COLS || y >= ROWS) return 1; // walls and floor are solid
  if (y < 0) return 0;                            // above the board is open air
  return board[y * COLS + x];
}

// True if the piece's cells at (px, py, orientation) are all on empty cells.
function fits(board, shape, px, py, o) {
  for (const [cx, cy] of shape.cells[o]) if (cellAt(board, px + cx, py + cy)) return false;
  return true;
}

// ------------------------------------------------------------------- game

function newGame(random = Math.random) {
  const g = {
    board: new Uint8Array(COLS * ROWS),
    nextId: makeBag(random),
    piece: null,          // { id, shape, x, y, o }
    level: 1,
    over: false,

    gravityAcc: 0,        // ms toward the next gravity step
    lockTimer: 0,         // ms the piece has been grounded
    lockResets: 0,        // moves/rotates that restarted lockTimer this piece
    grounded: false,      // piece cannot move down right now

    // input state; the DOM layer calls press()/release(), the loop reads these
    held: { left: false, right: false, down: false },
    dasDir: 0,            // -1, 0, 1: the direction currently auto-repeating
    dasTimer: 0,          // ms since dasDir was pressed (or since last ARR step)
    dasCharged: false,    // past the DAS threshold, now in ARR
  };
  spawn(g);
  return g;
}

function spawn(g) {
  const id = g.nextId();
  const shape = SHAPES[id - 1];
  // Center the bounding box: 3-wide boxes at x=3 (cells 3..5), the I's 4-wide
  // box also at x=3 (cells 3..6). The box top starts on the top hidden row.
  const piece = { id, shape, x: 3, y: 0, o: 0 };
  if (!fits(g.board, shape, piece.x, piece.y, piece.o)) {
    g.over = true;
    g.piece = null;
    return;
  }
  // Guideline: a fresh piece drops one row immediately if it can, so its
  // bottom row is visible the frame it appears.
  if (fits(g.board, shape, piece.x, piece.y + 1, piece.o)) piece.y++;
  g.piece = piece;
  g.gravityAcc = 0;
  g.lockTimer = 0;
  g.lockResets = 0;
  g.grounded = false;
}

function lock(g) {
  const p = g.piece;
  for (const [cx, cy] of p.shape.cells[p.o]) {
    const y = p.y + cy;
    if (y >= 0) g.board[y * COLS + p.x + cx] = p.id;
  }
  g.piece = null;
  spawn(g);
}

// Try to move the piece by (dx, dy). Returns true on success. A successful
// move while grounded restarts the lock delay (bounded by LOCK_RESETS).
function tryMove(g, dx, dy) {
  const p = g.piece;
  if (!p || !fits(g.board, p.shape, p.x + dx, p.y + dy, p.o)) return false;
  p.x += dx; p.y += dy;
  if (dx !== 0) noteLockReset(g);
  return true;
}

function noteLockReset(g) {
  if (g.grounded && g.lockResets < LOCK_RESETS) {
    g.lockTimer = 0;
    g.lockResets++;
  }
}

// Rotate by dir (+1 cw, -1 ccw) using the SRS kicks. Returns true on success.
function tryRotate(g, dir) {
  const p = g.piece;
  if (!p) return false;
  const to = (p.o + dir + 4) % 4;
  for (const [kx, ky] of kicksFor(p.shape, p.o, to)) {
    if (fits(g.board, p.shape, p.x + kx, p.y + ky, to)) {
      p.x += kx; p.y += ky; p.o = to;
      noteLockReset(g);
      return true;
    }
  }
  return false;
}

function hardDrop(g) {
  if (!g.piece || g.over) return;
  while (tryMove(g, 0, 1)) { /* fall */ }
  lock(g);
}

// --- input entry points. `key` is one of left, right, down, cw, ccw, hard.
function press(g, key) {
  if (g.over) return;
  switch (key) {
    case 'left':
    case 'right': {
      const dir = key === 'left' ? -1 : 1;
      g.held[key] = true;
      // Last pressed direction wins; the first step is immediate, then DAS.
      tryMove(g, dir, 0);
      g.dasDir = dir;
      g.dasTimer = 0;
      g.dasCharged = false;
      break;
    }
    case 'down': g.held.down = true; break;
    case 'cw': tryRotate(g, 1); break;
    case 'ccw': tryRotate(g, -1); break;
    case 'hard': hardDrop(g); break;
  }
}

function release(g, key) {
  if (key === 'left' || key === 'right') {
    g.held[key] = false;
    const dir = key === 'left' ? -1 : 1;
    if (g.dasDir === dir) {
      // If the other direction is still held, hand DAS to it, fully charged:
      // releasing one key of a pair should not make the other stutter.
      const other = dir === -1 ? g.held.right : g.held.left;
      g.dasDir = other ? -dir : 0;
      g.dasTimer = 0;
      g.dasCharged = other;
    }
  } else if (key === 'down') {
    g.held.down = false;
  }
}

// Advance the game by dt ms.
function update(g, dt) {
  if (g.over || !g.piece) return;

  // Horizontal auto-repeat.
  if (g.dasDir !== 0) {
    g.dasTimer += dt;
    if (!g.dasCharged && g.dasTimer >= DAS) {
      g.dasCharged = true;
      g.dasTimer -= DAS;
      tryMove(g, g.dasDir, 0);
    }
    if (g.dasCharged) {
      while (g.dasTimer >= ARR) {
        g.dasTimer -= ARR;
        if (!tryMove(g, g.dasDir, 0)) { g.dasTimer = 0; break; }
      }
    }
  }

  // Gravity, or soft drop when down is held.
  let step = gravityMs(g.level);
  if (g.held.down) step = Math.max(step / SOFT_DROP_FACTOR, 1);
  g.gravityAcc += dt;
  while (g.gravityAcc >= step) {
    g.gravityAcc -= step;
    if (!tryMove(g, 0, 1)) { g.gravityAcc = 0; break; }
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
    SHAPES, COLORS, KICKS_JLSTZ, KICKS_I, gravityMs, makeBag, cellAt, fits,
    newGame, spawn, lock, tryMove, tryRotate, hardDrop, press, release, update,
  };
}

// ---------------------------------------------------------------- DOM layer

function mount(doc) {
  const boardCanvas = doc.getElementById('board');
  const ctx = boardCanvas.getContext('2d');
  const g = newGame();

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
      for (const [cx, cy] of p.shape.cells[p.o]) {
        const y = p.y + cy - HIDDEN_ROWS;
        if (y >= 0) drawCell(ctx, (p.x + cx) * CELL, y * CELL, COLORS[p.id]);
      }
    }
  }

  // Keyboard. keydown auto-repeat from the OS is ignored; DAS is ours.
  const KEYMAP = {
    ArrowLeft: 'left', ArrowRight: 'right', ArrowDown: 'down',
    ArrowUp: 'cw', KeyX: 'cw', KeyZ: 'ccw', Space: 'hard',
  };
  doc.addEventListener('keydown', e => {
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

  let last = performance.now();
  function frame(now) {
    // Clamp dt so a backgrounded tab does not dump seconds of gravity at once.
    const dt = Math.min(now - last, 100);
    last = now;
    update(g, dt);
    render();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  return g;
}

if (typeof document !== 'undefined') mount(document);

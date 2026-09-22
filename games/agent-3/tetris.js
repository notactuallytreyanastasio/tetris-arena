'use strict';

// ===========================================================================
// CORE. Nothing above the DOM LAYER marker touches document or window, so the
// whole engine loads in node for test.js. (Shape taken from agent-6, who took
// it from agent-9.)
// ===========================================================================

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
const NEXT_COUNT = 3;

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
// 180-degree rotation. Guideline SRS has no 180 table; this is TETR.IO's
// SRS+ table, six tests, the same for every piece. From agent-6, who took it
// from agent-8; flipped to y-down here like the tables above.
const KICKS_180 = {
  '02': [[0, 0], [0, -1], [1, -1], [-1, -1], [1, 0], [-1, 0]],
  '20': [[0, 0], [0, 1], [-1, 1], [1, 1], [-1, 0], [1, 0]],
  '13': [[0, 0], [1, 0], [1, -2], [1, -1], [0, -2], [0, -1]],
  '31': [[0, 0], [-1, 0], [-1, -2], [-1, -1], [0, -2], [0, -1]],
};
const NO_KICK = [[0, 0]];

function kicksFor(name, from, to) {
  if (name === 'O') return NO_KICK;
  const key = String(from) + String(to);
  if ((to - from + 4) % 4 === 2) return KICKS_180[key];
  return (name === 'I' ? KICKS_I : KICKS_JLSTZ)[key];
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

// Out-of-bounds counts as filled here: that is the T-spin corner rule.
function filledOrWall(board, x, y) {
  if (x < 0 || x >= COLS || y >= TOTAL) return true;
  if (y < 0) return false;
  return board[y * COLS + x] !== 0;
}

// Indices of every full row, top to bottom.
function fullRows(board) {
  const rows = [];
  for (let y = 0; y < TOTAL; y++) {
    let full = true;
    for (let x = 0; x < COLS; x++) {
      if (!board[y * COLS + x]) { full = false; break; }
    }
    if (full) rows.push(y);
  }
  return rows;
}

// Remove the given rows (ascending order). For each, shift everything above
// it down one row with copyWithin and zero the top row. Rows above the one
// removed shift down, so later indices in the list are unaffected.
function collapse(board, rows) {
  for (const y of rows) {
    board.copyWithin(COLS, 0, y * COLS);
    board.fill(0, 0, COLS);
  }
  return rows.length;
}

function clearLines(board) {
  return collapse(board, fullRows(board));
}

// Would removing these rows leave the board empty? (Perfect clear.)
function emptyExcept(board, rows) {
  for (let y = 0; y < TOTAL; y++) {
    if (rows.includes(y)) continue;
    for (let x = 0; x < COLS; x++) if (board[y * COLS + x]) return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// 7-bag randomizer: shuffle all seven, deal them out, refill. Guarantees you
// never wait more than 12 pieces for an I. rng is injectable for tests.
// ---------------------------------------------------------------------------
function makeBag(rng) {
  let bag = [];
  return function next() {
    if (bag.length === 0) {
      bag = NAMES.slice();
      for (let i = bag.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [bag[i], bag[j]] = [bag[j], bag[i]];
      }
    }
    return bag.pop();
  };
}

// mulberry32: small seeded PRNG so a game is replayable from its seed
// (from agent-1). Returns a function in [0, 1) like Math.random.
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
const LINES_PER_LEVEL = 10;
const CLEAR_SCORE = [0, 100, 300, 500, 800];        // guideline, x level
const TSPIN_SCORE = [400, 800, 1200, 1600];         // T-spin with 0..3 lines
const MINI_SCORE = [100, 200, 400];                 // mini T-spin with 0..2 lines
const PERFECT_SCORE = [0, 800, 1200, 1800, 2000];   // perfect clear, x level
const COMBO_SCORE = 50;                             // x combo x level
const CLEAR_FLASH = 120;    // ms full rows stay lit before collapsing
const TRAIL = 120;          // ms a hard-drop streak stays visible
const LOCK_FLASH = 80;      // ms a just-locked piece is highlighted
const CLEAR_NAMES = ['', 'SINGLE', 'DOUBLE', 'TRIPLE', 'TETRIS'];

// ---------------------------------------------------------------------------
// Game. newGame() returns a self-contained state object plus the functions
// that act on it, so tests can run several games side by side. The argument
// is an rng function (tests), a seed number (replay), or nothing.
// ---------------------------------------------------------------------------
function newGame(arg) {
  let seed = null;
  let rng;
  if (typeof arg === 'function') rng = arg;
  else {
    seed = typeof arg === 'number' ? arg >>> 0 : freshSeed();
    rng = mulberry32(seed);
  }
  const g = {
    seed,
    board: makeBoard(),
    bag: makeBag(rng),
    trail: null,        // { cols: [[x, fromY, toY]], acc, color } after a hard drop
    queue: [],          // upcoming piece names, NEXT_COUNT long
    cur: null,          // { name, rot, x, y }
    hold: null,         // piece name parked by the player
    holdUsed: false,    // hold allowed once per piece
    lastWasRotate: false, // for T-spin detection
    score: 0,
    lines: 0,
    level: 1,
    b2b: false,         // last clear was a tetris or T-spin (back-to-back)
    combo: -1,          // consecutive clears; -1 when idle
    lastClear: null,    // { lines, tspin } of the most recent lock, for the HUD
    clearing: null,     // { rows, acc } while full rows flash; no piece then
    buffered: null,     // { rot, hold } presses made during the flash, applied at spawn
    lockFlash: null,    // { cells: [[x,y]...], acc } just-locked highlight
    toast: null,        // { text, id } scoring event for the HUD
    toastId: 0,
    clock: 0,           // ms since newGame, unpaused
    gravityAcc: 0,      // ms accumulated toward the next gravity step
    lockAcc: 0,         // ms the piece has been resting on something
    lockResets: 0,      // move-resets used for the current piece
    over: false,
    paused: false,
    input: {
      down: false,
      left: false, right: false,
      dasDir: 0,        // -1, 0, +1: direction currently auto-shifting
      dasAcc: 0,        // ms held toward DAS, then toward the next ARR shift
      charged: false,   // DAS elapsed, now in ARR
    },
  };

  while (g.queue.length < NEXT_COUNT) g.queue.push(g.bag());

  function takeNext() {
    const name = g.queue.shift();
    g.queue.push(g.bag());
    return name;
  }

  // Place a named piece at the spawn point. Prefer the row that leaves the
  // piece's bottom in the first visible row; fall back one row higher if that
  // is blocked; if both fail, top out.
  function place(name) {
    const x = 3;
    for (const y of [BUFFER - 1, BUFFER - 2]) {
      if (fits(g.board, name, 0, x, y)) {
        g.cur = { name, rot: 0, x, y, lowestY: y, kick: 0 };
        g.gravityAcc = 0;
        g.lockAcc = 0;
        g.lockResets = 0;
        g.lastWasRotate = false;
        return true;
      }
    }
    g.cur = { name, rot: 0, x, y: BUFFER - 2, lowestY: BUFFER - 2, kick: 0 };
    g.over = true;
    return false;
  }

  function spawn() {
    g.holdUsed = false;
    return place(takeNext());
  }

  function grounded() {
    const c = g.cur;
    if (!c) return false;
    return !fits(g.board, c.name, c.rot, c.x, c.y + 1);
  }

  // Row the current piece would land on if hard-dropped. Used for the ghost.
  function ghostY() {
    const c = g.cur;
    let y = c.y;
    while (fits(g.board, c.name, c.rot, c.x, y + 1)) y++;
    return y;
  }

  // A successful move or rotate while resting on something restarts the lock
  // timer, but only LOCK_RESETS times, so you cannot stall a piece forever.
  function noteMoved() {
    if (grounded() && g.lockResets < LOCK_RESETS) {
      g.lockAcc = 0;
      g.lockResets += 1;
    }
  }

  function tryMove(dx, dy) {
    const c = g.cur;
    if (!c) return false;
    if (!fits(g.board, c.name, c.rot, c.x + dx, c.y + dy)) return false;
    c.x += dx;
    c.y += dy;
    if (c.y > c.lowestY) {
      // Guideline: reaching a new lowest row refreshes the move-reset budget
      // (agent-6), so a piece that falls further after wiggling is not stuck.
      c.lowestY = c.y;
      g.lockResets = 0;
    }
    return true;
  }

  function move(dx) {
    if (g.over || g.paused) return false;
    if (!tryMove(dx, 0)) return false;
    g.lastWasRotate = false;
    noteMoved();
    return true;
  }

  // dir is +1 for clockwise, -1 for counter-clockwise, 2 for a 180. Try
  // each kick offset for the (from, to) pair; first fit wins.
  function rotate(dir) {
    if (g.over || g.paused || !g.cur) return false;
    const c = g.cur;
    const to = (c.rot + dir + 4) % 4;
    const kicks = kicksFor(c.name, c.rot, to);
    for (let i = 0; i < kicks.length; i++) {
      const nx = c.x + kicks[i][0];
      const ny = c.y + kicks[i][1];
      if (fits(g.board, c.name, to, nx, ny)) {
        c.rot = to;
        c.x = nx;
        c.y = ny;
        // The fifth-kick T-spin upgrade is defined for the 90-degree tables;
        // a 180 leaves it to the corner rule alone.
        c.kick = dir === 2 ? 0 : i;
        g.lastWasRotate = true;
        noteMoved();
        return true;
      }
    }
    return false;
  }

  function holdPiece() {
    if (g.over || g.paused || g.holdUsed || !g.cur) return false;
    const parked = g.hold;
    g.hold = g.cur.name;
    g.holdUsed = true;
    if (parked) place(parked); else place(takeNext());
    return true;
  }

  // Three-corner rule: the T's centre is box cell (1,1); if at least three
  // of the four diagonal neighbours are filled (walls count) and the piece
  // arrived by rotation, the lock is a T-spin. It is 'full' when both corners
  // on the side the T points at are filled, or when it got there via the
  // fifth kick; otherwise 'mini'. (Grading from agent-5.) Returns
  // null, 'mini' or 'full'.
  function tspinKind() {
    const c = g.cur;
    if (!c || c.name !== 'T' || !g.lastWasRotate) return null;
    const cx = c.x + 1, cy = c.y + 1;
    const tl = filledOrWall(g.board, cx - 1, cy - 1);
    const tr = filledOrWall(g.board, cx + 1, cy - 1);
    const bl = filledOrWall(g.board, cx - 1, cy + 1);
    const br = filledOrWall(g.board, cx + 1, cy + 1);
    if (tl + tr + bl + br < 3) return null;
    const front = [[tl, tr], [tr, br], [bl, br], [tl, bl]][c.rot];
    return (front[0] && front[1]) || c.kick === 4 ? 'full' : 'mini';
  }

  function isTSpin() {
    return tspinKind() !== null;
  }

  function addScore(points) {
    g.score += points;
  }

  function toast(text) {
    g.toast = { text, id: ++g.toastId };
  }

  // Score a lock that cleared n rows. Called before the rows collapse.
  function scoreLock(n, spin, perfect) {
    g.lastClear = { lines: n, spin };
    let points = 0;
    const parts = [];
    if (spin === 'full') {
      points = TSPIN_SCORE[n] * g.level;
      parts.push(n ? 'T-SPIN ' + CLEAR_NAMES[n] : 'T-SPIN');
    } else if (spin === 'mini') {
      points = MINI_SCORE[Math.min(n, 2)] * g.level;
      parts.push(n ? 'T-SPIN MINI ' + CLEAR_NAMES[n] : 'T-SPIN MINI');
    } else if (n > 0) {
      points = CLEAR_SCORE[n] * g.level;
      parts.push(CLEAR_NAMES[n]);
    }
    // back-to-back: consecutive "difficult" clears (tetris or T-spin with lines)
    const difficult = n > 0 && (n === 4 || spin !== null);
    if (difficult) {
      if (g.b2b) { points = Math.floor(points * 1.5); parts.unshift('B2B'); }
      g.b2b = true;
    } else if (n > 0) {
      g.b2b = false;
    }
    // combo: every consecutive lock that clears something
    if (n > 0) {
      g.combo += 1;
      if (g.combo > 0) {
        points += COMBO_SCORE * g.combo * g.level;
        parts.push('COMBO x' + g.combo);
      }
    } else {
      g.combo = -1;
    }
    if (perfect) {
      points += PERFECT_SCORE[n] * g.level;
      parts.push('PERFECT CLEAR');
    }
    addScore(points);
    g.lines += n;
    g.level = 1 + Math.floor(g.lines / LINES_PER_LEVEL);
    if (parts.length) toast(parts.join(' ') + '  +' + points);
  }

  function lockPiece() {
    const c = g.cur;
    const spin = tspinKind();
    stamp(g.board, c.name, c.rot, c.x, c.y);
    const cells = PIECES[c.name].states[c.rot];
    // Lock-out: every cell of the piece ended up in the hidden buffer.
    let visible = false;
    for (let i = 0; i < 4; i++) if (c.y + cells[i][1] >= BUFFER) visible = true;
    if (!visible) {
      g.over = true;
      return;
    }
    g.lockFlash = { cells: cells.map(([dx, dy]) => [c.x + dx, c.y + dy]), acc: 0 };
    const rows = fullRows(g.board);
    scoreLock(rows.length, spin, rows.length > 0 && emptyExcept(g.board, rows));
    if (rows.length > 0) {
      // Rows stay lit for CLEAR_FLASH ms; the collapse and next spawn wait.
      g.clearing = { rows, acc: 0 };
      g.cur = null;
      return;
    }
    spawn();
  }

  function finishClear() {
    collapse(g.board, g.clearing.rows);
    g.clearing = null;
    spawn();
    // Initial hold / rotation: presses made during the flash apply to the
    // piece that just spawned. Hold first so the rotation lands on the
    // piece you actually get. (Idea from agent-10.)
    const buf = g.buffered;
    g.buffered = null;
    if (buf && !g.over) {
      if (buf.hold) holdPiece();
      if (buf.rot) rotate(buf.rot);
    }
  }

  function hardDrop() {
    if (g.over || g.paused || !g.cur) return;
    const c = g.cur;
    const fromY = c.y;
    let rows = 0;
    while (tryMove(0, 1)) rows++;
    if (rows > 0) {
      g.lastWasRotate = false;
      // one streak per occupied column, from its topmost cell before the
      // drop to where that cell landed (shape from agent-4)
      const cells = PIECES[c.name].states[c.rot];
      const top = new Map();
      for (const [dx, dy] of cells) {
        if (!top.has(dx) || dy < top.get(dx)) top.set(dx, dy);
      }
      const cols = [];
      for (const [dx, dy] of top) cols.push([c.x + dx, fromY + dy, c.y + dy]);
      g.trail = { cols, acc: 0, color: PIECES[c.name].color };
    }
    addScore(rows * 2);
    lockPiece();
  }

  function stepGravity(soft) {
    if (!tryMove(0, 1)) return; // resting: lock delay is handled in update()
    g.lastWasRotate = false;
    if (soft) addScore(1);
    g.lockAcc = 0;
  }

  // Horizontal auto-shift. dasDir is set on press so the first shift is
  // immediate; holding then waits DAS and repeats every ARR.
  function updateInput(dt) {
    const inp = g.input;
    if (inp.dasDir === 0) return;
    inp.dasAcc += dt;
    const threshold = inp.charged ? ARR : DAS;
    while (inp.dasAcc >= threshold) {
      inp.dasAcc -= threshold;
      inp.charged = true;
      move(inp.dasDir);
    }
  }

  function update(dt) {
    if (g.over || g.paused) return;
    g.clock += dt;
    if (g.lockFlash) {
      g.lockFlash.acc += dt;
      if (g.lockFlash.acc >= LOCK_FLASH) g.lockFlash = null;
    }
    if (g.trail) {
      g.trail.acc += dt;
      if (g.trail.acc >= TRAIL) g.trail = null;
    }
    if (g.clearing) {
      // A held direction keeps charging so it carries into the next piece,
      // but the accumulator is clamped to the current threshold: otherwise
      // 120 ms of flash banks three ARR periods and the next piece jumps
      // three cells on its first frame (pinned by agent-5, -6 and -10).
      const inp = g.input;
      if (inp.dasDir !== 0) inp.dasAcc = Math.min(inp.dasAcc + dt, inp.charged ? ARR : DAS);
      g.clearing.acc += dt;
      if (g.clearing.acc >= CLEAR_FLASH) finishClear();
      return;
    }
    updateInput(dt);

    const soft = g.input.down;
    const interval = soft ? gravityMs(g.level) / SOFT_DROP_MULT : gravityMs(g.level);
    g.gravityAcc += dt;
    while (g.gravityAcc >= interval && !g.over) {
      g.gravityAcc -= interval;
      stepGravity(soft);
    }

    if (grounded()) {
      g.lockAcc += dt;
      if (g.lockAcc >= LOCK_DELAY) lockPiece();
    } else {
      g.lockAcc = 0;
    }
  }

  function startShift(dir) {
    const inp = g.input;
    inp.dasDir = dir;
    inp.dasAcc = 0;
    inp.charged = false;
    move(dir);
  }

  function setPaused(v) {
    if (!g.over) g.paused = v;
  }

  // Abstract input: the DOM layer maps key codes to these names.
  function press(action) {
    const inp = g.input;
    if (g.clearing && !g.over && !g.paused) {
      const buf = g.buffered || (g.buffered = { rot: 0, hold: false });
      if (action === 'cw') { buf.rot = 1; return true; }
      if (action === 'ccw') { buf.rot = -1; return true; }
      if (action === 'flip') { buf.rot = 2; return true; }
      if (action === 'hold') { buf.hold = true; return true; }
    }
    switch (action) {
      case 'left':  inp.left = true;  startShift(-1); break;
      case 'right': inp.right = true; startShift(1);  break;
      case 'down':  inp.down = true; break;
      case 'cw':    rotate(1); break;
      case 'ccw':   rotate(-1); break;
      case 'flip':  rotate(2); break;
      case 'hard':  hardDrop(); break;
      case 'hold':  holdPiece(); break;
      case 'pause': if (!g.over) g.paused = !g.paused; break;
      default: return false;
    }
    return true;
  }

  function release(action) {
    const inp = g.input;
    switch (action) {
      case 'left':
        inp.left = false;
        // releasing one direction while the other is held resumes the other
        if (inp.right) startShift(1); else inp.dasDir = 0;
        break;
      case 'right':
        inp.right = false;
        if (inp.left) startShift(-1); else inp.dasDir = 0;
        break;
      case 'down': inp.down = false; break;
      default: return false;
    }
    return true;
  }

  spawn();

  return {
    state: g,
    spawn, place, move, rotate, hardDrop, holdPiece, update, press, release,
    ghostY, grounded, lockPiece, finishClear, tryMove, isTSpin, tspinKind, setPaused,
  };
}

if (typeof module !== 'undefined') {
  module.exports = {
    COLS, ROWS, BUFFER, TOTAL, NEXT_COUNT, PIECES, KICKS_JLSTZ, KICKS_I,
    LOCK_DELAY, LOCK_RESETS, DAS, ARR,
    makeBoard, fits, stamp, fullRows, collapse, clearLines, emptyExcept,
    makeBag, gravityMs, newGame, mulberry32, KICKS_180, CLEAR_FLASH, LOCK_FLASH, TRAIL,
  };
}

// ===========================================================================
// DOM LAYER. Runs only in a browser.
// ===========================================================================
function mount(doc) {
  const boardCanvas = doc.getElementById('board');
  const nextCanvas = doc.getElementById('next');
  const holdCanvas = doc.getElementById('hold');
  const ctx = boardCanvas.getContext('2d');
  const nctx = nextCanvas.getContext('2d');
  const hctx = holdCanvas.getContext('2d');
  const hud = {
    score: doc.getElementById('score'),
    level: doc.getElementById('level'),
    lines: doc.getElementById('lines'),
    overlay: doc.getElementById('overlay'),
    overlayTitle: doc.getElementById('overlay-title'),
    overlayHint: doc.getElementById('overlay-hint'),
    toast: doc.getElementById('toast'),
    seed: doc.getElementById('seed'),
    best: doc.getElementById('best'),
  };
  const BEST_KEY = 'tetris-agent-3-best';
  let best = 0;
  try { best = Number(localStorage.getItem(BEST_KEY)) || 0; } catch (e) { /* file:// may refuse */ }

  function seedFromHash() {
    const m = /seed=(\d+)/.exec(window.location.hash);
    return m ? Number(m[1]) >>> 0 : undefined;
  }
  function publishSeed(seed) {
    try { history.replaceState(null, '', '#seed=' + seed); } catch (e) { /* file:// may refuse */ }
  }
  const PREVIEW_CELL = 20;
  const PREVIEW_W = 4 * PREVIEW_CELL + 16;
  const PREVIEW_H = 3 * PREVIEW_CELL;

  // Backing store scaled by devicePixelRatio so cell edges are crisp on
  // retina; drawing code stays in CSS pixels. (From agent-1.)
  function fitCanvas(c, cssW, cssH) {
    const dpr = window.devicePixelRatio || 1;
    c.width = Math.round(cssW * dpr);
    c.height = Math.round(cssH * dpr);
    c.style.width = cssW + 'px';
    c.style.height = cssH + 'px';
    c.getContext('2d').setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  fitCanvas(boardCanvas, COLS * CELL, ROWS * CELL);
  fitCanvas(nextCanvas, PREVIEW_W, PREVIEW_H * NEXT_COUNT);
  fitCanvas(holdCanvas, PREVIEW_W, PREVIEW_H);

  let game = newGame(seedFromHash());
  publishSeed(game.state.seed);

  function drawCell(c, px, py, color, size, alpha = 1) {
    c.globalAlpha = alpha;
    c.fillStyle = color;
    c.fillRect(px, py, size, size);
    // bevel: light top-left, dark bottom-right
    c.fillStyle = 'rgba(255,255,255,0.22)';
    c.fillRect(px, py, size, 2);
    c.fillRect(px, py, 2, size);
    c.fillStyle = 'rgba(0,0,0,0.28)';
    c.fillRect(px, py + size - 2, size, 2);
    c.fillRect(px + size - 2, py, 2, size);
    c.globalAlpha = 1;
  }

  function drawGhostCell(c, px, py, color, size) {
    c.globalAlpha = 0.35;
    c.strokeStyle = color;
    c.lineWidth = 2;
    c.strokeRect(px + 2, py + 2, size - 4, size - 4);
    c.globalAlpha = 1;
  }

  // Draw a piece on the board canvas at board coordinates (hidden rows skip).
  function drawPieceOnBoard(name, rot, x, y, drawer) {
    const cells = PIECES[name].states[rot];
    for (let i = 0; i < 4; i++) {
      const cy = y + cells[i][1] - BUFFER;
      if (cy < 0) continue;
      drawer(ctx, (x + cells[i][0]) * CELL, cy * CELL, PIECES[name].color, CELL);
    }
  }

  // Draw a piece centred in a preview slot.
  function drawPreview(c, name, slot) {
    const p = PIECES[name];
    const cells = p.states[0];
    let minX = 9, maxX = -9, minY = 9, maxY = -9;
    for (const [cx, cy] of cells) {
      minX = Math.min(minX, cx); maxX = Math.max(maxX, cx);
      minY = Math.min(minY, cy); maxY = Math.max(maxY, cy);
    }
    const w = (maxX - minX + 1) * PREVIEW_CELL;
    const h = (maxY - minY + 1) * PREVIEW_CELL;
    const ox = (PREVIEW_W - w) / 2 - minX * PREVIEW_CELL;
    const oy = slot * PREVIEW_H + (PREVIEW_H - h) / 2 - minY * PREVIEW_CELL;
    for (const [cx, cy] of cells) {
      drawCell(c, ox + cx * PREVIEW_CELL, oy + cy * PREVIEW_CELL, p.color, PREVIEW_CELL);
    }
  }

  const shown = { score: -1, level: -1, lines: -1, overlay: null, queue: '', hold: '', toast: 0, seed: null, best: -1 };

  // DOM writes only when a value changes; textContent every frame is wasteful.
  function renderHud() {
    const g = game.state;
    if (shown.score !== g.score) hud.score.textContent = shown.score = g.score;
    if (shown.level !== g.level) hud.level.textContent = shown.level = g.level;
    if (shown.lines !== g.lines) hud.lines.textContent = shown.lines = g.lines;
    if (shown.seed !== g.seed) hud.seed.textContent = shown.seed = g.seed;
    if (g.over && g.score > best) {
      best = g.score;
      try { localStorage.setItem(BEST_KEY, String(best)); } catch (e) { /* ignore */ }
    }
    if (shown.best !== best) hud.best.textContent = shown.best = best;

    const state = g.over ? 'over' : g.paused ? 'paused' : null;
    if (shown.overlay !== state) {
      shown.overlay = state;
      hud.overlay.classList.toggle('hidden', state === null);
      if (state === 'over') {
        hud.overlayTitle.textContent = 'Game over';
        hud.overlayHint.textContent = g.score + ' points, ' + g.lines + ' lines. Press R to restart';
      } else if (state === 'paused') {
        hud.overlayTitle.textContent = 'Paused';
        hud.overlayHint.textContent = 'press P to resume';
      }
    }

    if (g.toast && shown.toast !== g.toast.id) {
      shown.toast = g.toast.id;
      hud.toast.textContent = g.toast.text;
      // restart the CSS fade even if the text is identical
      hud.toast.classList.remove('show');
      void hud.toast.offsetWidth;
      hud.toast.classList.add('show');
    }

    const q = g.queue.join('');
    if (shown.queue !== q) {
      shown.queue = q;
      nctx.clearRect(0, 0, PREVIEW_W, PREVIEW_H * NEXT_COUNT);
      g.queue.forEach((name, i) => drawPreview(nctx, name, i));
    }
    const h = g.hold || '';
    if (shown.hold !== h) {
      shown.hold = h;
      hctx.clearRect(0, 0, PREVIEW_W, PREVIEW_H);
      if (h) drawPreview(hctx, h, 0);
    }
  }

  function render() {
    const g = game.state;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, COLS * CELL, ROWS * CELL);

    // faint grid
    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    ctx.lineWidth = 1;
    for (let x = 1; x < COLS; x++) {
      ctx.beginPath(); ctx.moveTo(x * CELL + .5, 0); ctx.lineTo(x * CELL + .5, ROWS * CELL); ctx.stroke();
    }
    for (let y = 1; y < ROWS; y++) {
      ctx.beginPath(); ctx.moveTo(0, y * CELL + .5); ctx.lineTo(COLS * CELL, y * CELL + .5); ctx.stroke();
    }

    // settled blocks; rows being cleared are drawn white and fade out
    const b = g.board;
    const clearing = g.clearing;
    for (let y = BUFFER; y < TOTAL; y++) {
      const lit = clearing && clearing.rows.includes(y);
      for (let x = 0; x < COLS; x++) {
        const id = b[y * COLS + x];
        if (!id) continue;
        if (lit) {
          const t = clearing.acc / CLEAR_FLASH;
          drawCell(ctx, x * CELL, (y - BUFFER) * CELL, '#ffffff', CELL, 1 - t * 0.8);
        } else {
          drawCell(ctx, x * CELL, (y - BUFFER) * CELL, COLOR_BY_ID[id], CELL);
        }
      }
    }

    // hard-drop streaks: a gradient in the piece colour fading over TRAIL ms
    if (g.trail) {
      const a = 0.45 * (1 - g.trail.acc / TRAIL);
      ctx.globalAlpha = a;
      for (const [x, fromY, toY] of g.trail.cols) {
        const y0 = Math.max(fromY, BUFFER) - BUFFER;
        const y1 = toY - BUFFER;
        if (y1 <= y0) continue;
        const grad = ctx.createLinearGradient(0, y0 * CELL, 0, y1 * CELL);
        grad.addColorStop(0, 'rgba(0,0,0,0)');
        grad.addColorStop(1, g.trail.color);
        ctx.fillStyle = grad;
        ctx.fillRect(x * CELL + 4, y0 * CELL, CELL - 8, (y1 - y0) * CELL);
      }
      ctx.globalAlpha = 1;
    }

    // just-locked piece: brief white highlight so hard drops read
    if (g.lockFlash) {
      const a = 0.6 * (1 - g.lockFlash.acc / LOCK_FLASH);
      for (const [x, y] of g.lockFlash.cells) {
        if (y < BUFFER) continue;
        ctx.globalAlpha = a;
        ctx.fillStyle = '#fff';
        ctx.fillRect(x * CELL, (y - BUFFER) * CELL, CELL, CELL);
      }
      ctx.globalAlpha = 1;
    }

    // ghost, then the active piece on top of it
    if (g.cur && !g.over) {
      const c = g.cur;
      const gy = game.ghostY();
      if (gy !== c.y) drawPieceOnBoard(c.name, c.rot, c.x, gy, drawGhostCell);
      drawPieceOnBoard(c.name, c.rot, c.x, c.y, drawCell);
      // lock pulse: a resting piece brightens toward white as the lock
      // timer runs out, so the player can see it about to settle (agent-5)
      if (game.grounded() && g.lockAcc > 0) {
        const a = 0.35 * Math.min(1, g.lockAcc / LOCK_DELAY);
        drawPieceOnBoard(c.name, c.rot, c.x, c.y, (cc, px, py, _color, size) => {
          cc.globalAlpha = a;
          cc.fillStyle = '#fff';
          cc.fillRect(px, py, size, size);
          cc.globalAlpha = 1;
        });
      }
    }

    renderHud();
  }

  // -------------------------------------------------------------------------
  // Input. keydown/keyup feed the held-key model so left/right auto-repeat
  // on our own DAS/ARR clock instead of the OS key-repeat rate.
  // -------------------------------------------------------------------------
  const KEYS = {
    ArrowLeft: 'left', ArrowRight: 'right', ArrowDown: 'down',
    ArrowUp: 'cw', KeyX: 'cw', KeyZ: 'ccw', ControlLeft: 'ccw', KeyA: 'flip',
    Space: 'hard', KeyC: 'hold', ShiftLeft: 'hold', ShiftRight: 'hold',
    KeyP: 'pause', Escape: 'pause',
  };

  function onKeyDown(e) {
    if (e.repeat) return;
    if (e.code === 'KeyR') {
      game = newGame();
      publishSeed(game.state.seed);
      e.preventDefault();
      return;
    }
    const action = KEYS[e.code];
    if (!action) return;
    game.press(action);
    e.preventDefault();
  }

  function onKeyUp(e) {
    const action = KEYS[e.code];
    if (!action) return;
    game.release(action);
    e.preventDefault();
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  // Losing focus (alt-tab) must not leave a direction stuck down, and a game
  // nobody is looking at should not keep falling (agent-1, agent-5).
  function releaseAll() {
    game.release('left'); game.release('right'); game.release('down');
  }
  window.addEventListener('blur', () => { releaseAll(); game.setPaused(true); });
  doc.addEventListener('visibilitychange', () => {
    if (doc.hidden) { releaseAll(); game.setPaused(true); }
  });

  // -------------------------------------------------------------------------
  // Loop: one requestAnimationFrame, delta time in ms, clamped so a background
  // tab does not dump seconds of gravity on you when it comes back.
  // -------------------------------------------------------------------------
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(now - last, 100);
    last = now;
    game.update(dt);
    render();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  return () => game;
}

if (typeof document !== 'undefined') {
  window.__tetris = mount(document);
}

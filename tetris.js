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

// Out-of-bounds counts as filled here: that is the T-spin corner rule.
function filledOrWall(board, x, y) {
  if (x < 0 || x >= COLS || y >= TOTAL) return true;
  if (y < 0) return false;
  return board[y * COLS + x] !== 0;
}

// Clear every full row. Scan bottom-up; when a row is full, shift everything
// above it down one row with copyWithin and zero the top row. Returns count.
function clearLines(board) {
  let cleared = 0;
  for (let y = TOTAL - 1; y >= 0; y--) {
    let full = true;
    for (let x = 0; x < COLS; x++) {
      if (!board[y * COLS + x]) { full = false; break; }
    }
    if (!full) continue;
    board.copyWithin(COLS, 0, y * COLS);
    board.fill(0, 0, COLS);
    cleared++;
    y++; // re-examine this row: it now holds what was above it
  }
  return cleared;
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

// ---------------------------------------------------------------------------
// Game. newGame() returns a self-contained state object plus the functions
// that act on it, so tests can run several games side by side.
// ---------------------------------------------------------------------------
function newGame(rng = Math.random) {
  const g = {
    board: makeBoard(),
    bag: makeBag(rng),
    queue: [],          // upcoming piece names, NEXT_COUNT long
    cur: null,          // { name, rot, x, y }
    hold: null,         // piece name parked by the player
    holdUsed: false,    // hold allowed once per piece
    lastWasRotate: false, // for T-spin detection
    score: 0,
    lines: 0,
    level: 1,
    b2b: false,         // last clear was a tetris or T-spin (back-to-back)
    lastClear: null,    // { lines, tspin } of the most recent lock, for the HUD
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
        g.cur = { name, rot: 0, x, y };
        g.gravityAcc = 0;
        g.lockAcc = 0;
        g.lockResets = 0;
        g.lastWasRotate = false;
        return true;
      }
    }
    g.cur = { name, rot: 0, x, y: BUFFER - 2 };
    g.over = true;
    return false;
  }

  function spawn() {
    g.holdUsed = false;
    return place(takeNext());
  }

  function grounded() {
    const c = g.cur;
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
    if (!fits(g.board, c.name, c.rot, c.x + dx, c.y + dy)) return false;
    c.x += dx;
    c.y += dy;
    return true;
  }

  function move(dx) {
    if (g.over || g.paused) return false;
    if (!tryMove(dx, 0)) return false;
    g.lastWasRotate = false;
    noteMoved();
    return true;
  }

  // dir is +1 for clockwise, -1 for counter-clockwise. Try each kick offset
  // for the (from, to) pair; first fit wins.
  function rotate(dir) {
    if (g.over || g.paused) return false;
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
        g.lastWasRotate = true;
        noteMoved();
        return true;
      }
    }
    return false;
  }

  function holdPiece() {
    if (g.over || g.paused || g.holdUsed) return false;
    const parked = g.hold;
    g.hold = g.cur.name;
    g.holdUsed = true;
    if (parked) place(parked); else place(takeNext());
    return true;
  }

  // Three-corner rule: the T's centre is box cell (1,1); if at least three
  // of the four diagonal neighbours are filled (walls count) and the piece
  // arrived by rotation, the lock is a T-spin. Mini T-spins are not split out.
  function isTSpin() {
    const c = g.cur;
    if (c.name !== 'T' || !g.lastWasRotate) return false;
    const cx = c.x + 1, cy = c.y + 1;
    let corners = 0;
    if (filledOrWall(g.board, cx - 1, cy - 1)) corners++;
    if (filledOrWall(g.board, cx + 1, cy - 1)) corners++;
    if (filledOrWall(g.board, cx - 1, cy + 1)) corners++;
    if (filledOrWall(g.board, cx + 1, cy + 1)) corners++;
    return corners >= 3;
  }

  function addScore(points) {
    g.score += points;
  }

  function scoreLock(n, tspin) {
    g.lastClear = { lines: n, tspin };
    let points = 0;
    if (tspin) {
      points = TSPIN_SCORE[n] * g.level;
    } else if (n > 0) {
      points = CLEAR_SCORE[n] * g.level;
    }
    // back-to-back: consecutive "difficult" clears (tetris or T-spin with lines)
    const difficult = n > 0 && (n === 4 || tspin);
    if (difficult) {
      if (g.b2b) points = Math.floor(points * 1.5);
      g.b2b = true;
    } else if (n > 0) {
      g.b2b = false;
    }
    addScore(points);
    g.lines += n;
    g.level = 1 + Math.floor(g.lines / LINES_PER_LEVEL);
  }

  function lockPiece() {
    const c = g.cur;
    const tspin = isTSpin();
    stamp(g.board, c.name, c.rot, c.x, c.y);
    // Lock-out: every cell of the piece ended up in the hidden buffer.
    const cells = PIECES[c.name].states[c.rot];
    let visible = false;
    for (let i = 0; i < 4; i++) if (c.y + cells[i][1] >= BUFFER) visible = true;
    if (!visible) {
      g.over = true;
      return;
    }
    scoreLock(clearLines(g.board), tspin);
    spawn();
  }

  function hardDrop() {
    if (g.over || g.paused) return;
    let rows = 0;
    while (tryMove(0, 1)) rows++;
    if (rows > 0) g.lastWasRotate = false;
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

  // Abstract input: the DOM layer maps key codes to these names.
  function press(action) {
    const inp = g.input;
    switch (action) {
      case 'left':  inp.left = true;  startShift(-1); break;
      case 'right': inp.right = true; startShift(1);  break;
      case 'down':  inp.down = true; break;
      case 'cw':    rotate(1); break;
      case 'ccw':   rotate(-1); break;
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
    ghostY, grounded, lockPiece, tryMove, isTSpin,
  };
}

if (typeof module !== 'undefined') {
  module.exports = {
    COLS, ROWS, BUFFER, TOTAL, NEXT_COUNT, PIECES, KICKS_JLSTZ, KICKS_I,
    LOCK_DELAY, LOCK_RESETS, DAS, ARR,
    makeBoard, fits, stamp, clearLines, makeBag, gravityMs, newGame,
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
  };
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

  let game = newGame();

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

  const shown = { score: -1, level: -1, lines: -1, overlay: null, queue: '', hold: '' };

  // DOM writes only when a value changes; textContent every frame is wasteful.
  function renderHud() {
    const g = game.state;
    if (shown.score !== g.score) hud.score.textContent = shown.score = g.score;
    if (shown.level !== g.level) hud.level.textContent = shown.level = g.level;
    if (shown.lines !== g.lines) hud.lines.textContent = shown.lines = g.lines;

    const state = g.over ? 'over' : g.paused ? 'paused' : null;
    if (shown.overlay !== state) {
      shown.overlay = state;
      hud.overlay.classList.toggle('hidden', state === null);
      if (state === 'over') {
        hud.overlayTitle.textContent = 'Game over';
        hud.overlayHint.textContent = 'press R to restart';
      } else if (state === 'paused') {
        hud.overlayTitle.textContent = 'Paused';
        hud.overlayHint.textContent = 'press P to resume';
      }
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

    // settled blocks
    const b = g.board;
    for (let y = BUFFER; y < TOTAL; y++) {
      for (let x = 0; x < COLS; x++) {
        const id = b[y * COLS + x];
        if (id) drawCell(ctx, x * CELL, (y - BUFFER) * CELL, COLOR_BY_ID[id], CELL);
      }
    }

    // ghost, then the active piece on top of it
    if (g.cur && !g.over) {
      const c = g.cur;
      const gy = game.ghostY();
      if (gy !== c.y) drawPieceOnBoard(c.name, c.rot, c.x, gy, drawGhostCell);
      drawPieceOnBoard(c.name, c.rot, c.x, c.y, drawCell);
    }

    renderHud();
  }

  // -------------------------------------------------------------------------
  // Input. keydown/keyup feed the held-key model so left/right auto-repeat
  // on our own DAS/ARR clock instead of the OS key-repeat rate.
  // -------------------------------------------------------------------------
  const KEYS = {
    ArrowLeft: 'left', ArrowRight: 'right', ArrowDown: 'down',
    ArrowUp: 'cw', KeyX: 'cw', KeyZ: 'ccw', ControlLeft: 'ccw',
    Space: 'hard', KeyC: 'hold', ShiftLeft: 'hold', ShiftRight: 'hold',
    KeyP: 'pause', Escape: 'pause',
  };

  function onKeyDown(e) {
    if (e.repeat) return;
    if (e.code === 'KeyR') {
      game = newGame();
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
  // Losing focus (alt-tab) must not leave a direction stuck down.
  window.addEventListener('blur', () => {
    game.release('left'); game.release('right'); game.release('down');
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

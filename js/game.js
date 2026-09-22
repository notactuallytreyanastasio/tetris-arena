// Game state and the simulation step. No DOM, no canvas: everything here is
// plain data so it can be driven by the rAF loop in main.js, or by a test.

// Guideline gravity: seconds per row at a given level.
function gravityMs(level) {
  const l = Math.min(level, 20) - 1;
  return Math.pow(0.8 - l * 0.007, l) * 1000;
}

const SOFT_DROP_MULT = 20; // soft drop is this many times gravity
const LOCK_DELAY = 500;    // ms a grounded piece waits before locking
const LOCK_RESETS = 15;    // moves/rotates that may restart that wait...
                           // ...until the piece reaches a new lowest row
const LINES_PER_LEVEL = 10;
const NEXT_COUNT = 5;      // pieces shown in the preview
const CLEAR_FLASH_MS = 120; // full rows stay white this long before collapsing

// Guideline scoring, all multiplied by level at award time.
const SCORE = {
  lines: [0, 100, 300, 500, 800],
  tspin: [400, 800, 1200, 1600],
  mini:  [100, 200, 400],
  perfect: [0, 800, 1200, 1800, 2000],
  combo: 50,
  b2b: 1.5,
};

const TRAIL_MS = 120;      // hard-drop streak lifetime
const BEST_KEY = 'tetris-agent-8-best';

// Seeded PRNG (mulberry32, from agent-1) so a game is replayable: the seed
// is shown in the HUD and kept in the URL hash, Shift+R replays it, and the
// node tests can pin one.
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

// Best score lives in localStorage, which file:// and private windows may
// refuse, so both directions are guarded (agent-1, agent-10).
function loadBest() {
  try { return Number(localStorage.getItem(BEST_KEY)) || 0; } catch (e) { return 0; }
}
function saveBest(n) {
  try { localStorage.setItem(BEST_KEY, String(n)); } catch (e) { /* ignore */ }
}

// 7-bag randomiser: every piece exactly once per 7, so droughts are bounded.
class Bag {
  constructor(rng) {
    this.rng = rng;
    this.queue = [];
  }
  next() {
    if (this.queue.length === 0) {
      const names = PIECE_NAMES.slice();
      for (let i = names.length - 1; i > 0; i--) {
        const j = Math.floor(this.rng() * (i + 1));
        [names[i], names[j]] = [names[j], names[i]];
      }
      this.queue = names;
    }
    return PIECES[this.queue.shift()];
  }
}

class Game {
  // seed: a number to replay, or undefined for a fresh game.
  constructor(seed) {
    this.board = new Board();
    this.best = loadBest();
    this.onReset = null; // main.js hooks this to mirror the seed into the URL
    this.reset(seed);
  }

  reset(seed) {
    if (seed === undefined) seed = (Date.now() ^ (Math.random() * 0xffffffff)) >>> 0;
    this.seed = seed;
    this.board.reset();
    this.bag = new Bag(mulberry32(seed));
    this.trail = null;  // { cols: [[x, fromY, toY]], color, ms } after a hard drop
    this.level = 1;
    this.lines = 0;
    this.score = 0;
    this.over = false;
    this.paused = false;
    this.soft = false;
    this.b2b = false;   // last line clear was a tetris or T-spin
    this.combo = -1;    // consecutive locks that cleared lines, -1 = none
    this.lastClear = null; // { label, points } of the most recent scoring lock
    this.gravityAcc = 0;
    this.clock = 0;     // ms since reset; timestamps lastClear for the HUD
    this.queue = [];    // upcoming pieces, front is next
    this.hold = null;   // parked piece, or null
    this.holdUsed = false; // hold is allowed once per piece
    this.clearing = null;  // { rows, spin, acc } while full rows flash; no active piece
    this.active = null;
    this.spawn();
    if (this.onReset) this.onReset(seed);
  }

  endGame() {
    this.over = true;
    if (this.score > this.best) {
      this.best = this.score;
      saveBest(this.best);
    }
  }

  // Pause is just 'do not advance the clock': every timer is an accumulator
  // fed by update(dt), so nothing else needs to know.
  setPaused(on) {
    if (this.over) return;
    this.paused = on;
  }

  takeNext() {
    while (this.queue.length <= NEXT_COUNT) this.queue.push(this.bag.next());
    return this.queue.shift();
  }

  // Spawn the next queued piece, or the given one when coming out of hold.
  spawn(forced) {
    const piece = forced || this.takeNext();
    if (!forced) this.holdUsed = false;
    // SRS spawn: box top-left at column 3 (4 for O), two rows above the
    // skyline, then an immediate step down if that is free. That leaves two
    // more hidden rows above for kicks to use.
    const x = piece.name === 'O' ? 4 : 3;
    const y = HIDDEN_ROWS - 2;
    const p = {
      piece, rot: 0, x, y,
      lockAcc: 0, lockResets: 0, lowestY: y,
      spun: false, // last successful action was a rotation (T-spin rule)
      kick: 0,     // index of the kick test that landed that rotation
    };
    this.active = p;
    if (!this.board.fits(piece, 0, x, y)) {
      this.endGame(); // block out
      return;
    }
    if (this.board.fits(piece, 0, x, y + 1)) p.y = p.lowestY = y + 1;
    this.gravityAcc = 0;
  }

  // Swap the active piece with the hold slot, once per piece. The piece
  // coming out of hold spawns fresh: rotation 0 at the spawn position.
  swapHold() {
    if (this.over || this.paused || !this.active || this.holdUsed) return false;
    const parked = this.hold;
    this.hold = this.active.piece;
    this.spawn(parked || this.takeNext());
    this.holdUsed = true;
    return true;
  }

  grounded() {
    const a = this.active;
    return !this.board.fits(a.piece, a.rot, a.x, a.y + 1);
  }

  // Row the active piece would land on if hard-dropped. Drawn as the ghost.
  ghostY() {
    const a = this.active;
    let y = a.y;
    while (this.board.fits(a.piece, a.rot, a.x, y + 1)) y++;
    return y;
  }

  // Try to move the active piece by (dx, dy). Returns true on success.
  tryMove(dx, dy) {
    const a = this.active;
    if (!this.board.fits(a.piece, a.rot, a.x + dx, a.y + dy)) return false;
    a.x += dx;
    a.y += dy;
    return true;
  }

  // Bookkeeping after any successful player move or rotate.
  // Move reset: a grounded piece gets its lock timer back, up to LOCK_RESETS
  // times. Step reset: reaching a new lowest row restores the full budget,
  // so sliding off a ledge never leaves you with zero resets at the bottom.
  noteMoved() {
    const a = this.active;
    if (a.y > a.lowestY) {
      a.lowestY = a.y;
      a.lockResets = 0;
      a.lockAcc = 0;
    } else if (this.grounded() && a.lockResets < LOCK_RESETS) {
      a.lockAcc = 0;
      a.lockResets++;
    }
  }

  move(dx) {
    if (this.over || this.paused || !this.active) return false;
    const ok = this.tryMove(dx, 0);
    if (ok) {
      this.active.spun = false;
      this.noteMoved();
    }
    return ok;
  }

  // dir is +1 clockwise, -1 counter-clockwise, 2 for a 180. Walk the kick
  // list for this (from, to) pair; the first offset that fits wins. Kick dy
  // is negated because the tables are written with +y up.
  rotate(dir) {
    if (this.over || this.paused || !this.active) return false;
    const a = this.active;
    const to = (a.rot + dir + 4) % 4;
    const kicks = kicksFor(a.piece, a.rot, to);
    for (let i = 0; i < kicks.length; i++) {
      const nx = a.x + kicks[i][0];
      const ny = a.y - kicks[i][1];
      if (this.board.fits(a.piece, to, nx, ny)) {
        a.rot = to;
        a.x = nx;
        a.y = ny;
        a.spun = true;
        a.kick = i;
        this.noteMoved();
        return true;
      }
    }
    return false;
  }

  softDrop(on) {
    this.soft = on;
  }

  hardDrop() {
    if (this.over || this.paused || !this.active) return;
    const a = this.active;
    const fromY = a.y;
    let rows = 0;
    while (this.tryMove(0, 1)) rows++;
    if (rows > 0) {
      a.spun = false;
      // One streak per column, from the column's old top cell to its new
      // one, so the drop reads as motion rather than a teleport (agent-4).
      const top = {};
      for (const [cx, cy] of a.piece.states[a.rot]) {
        if (top[cx] === undefined || cy < top[cx]) top[cx] = cy;
      }
      const cols = Object.keys(top).map((cx) => [a.x + Number(cx), fromY + top[cx], a.y + top[cx]]);
      this.trail = { cols, color: a.piece.color, ms: TRAIL_MS };
    }
    this.score += rows * 2;
    this.lock();
  }

  // 3-corner rule (shape taken from agent-5): a T whose last action was a
  // rotation and has 3+ solid diagonals around its centre was spun in.
  // 'full' if both corners on the side the T points to are solid, or the
  // rotation landed on kick test 5; otherwise 'mini'. null if not a T-spin.
  tspinKind() {
    const a = this.active;
    if (a.piece.name !== 'T' || !a.spun) return null;
    const b = this.board;
    const cx = a.x + 1, cy = a.y + 1; // the T's centre is box cell (1,1)
    const tl = b.solidOrWall(cx - 1, cy - 1), tr = b.solidOrWall(cx + 1, cy - 1);
    const bl = b.solidOrWall(cx - 1, cy + 1), br = b.solidOrWall(cx + 1, cy + 1);
    if (tl + tr + bl + br < 3) return null;
    const front = [[tl, tr], [tr, br], [bl, br], [tl, bl]][a.rot];
    return (front[0] && front[1]) || a.kick === 4 ? 'full' : 'mini';
  }

  // Award points for a lock that cleared n rows with the given spin kind.
  scoreLock(n, spin) {
    const level = this.level;
    let points;
    let label;
    const names = ['', 'SINGLE', 'DOUBLE', 'TRIPLE', 'TETRIS'];
    if (spin === 'full') {
      points = SCORE.tspin[n];
      label = 'T-SPIN ' + (n ? names[n] : '');
    } else if (spin === 'mini') {
      points = SCORE.mini[Math.min(n, 2)];
      label = 'MINI T-SPIN ' + (n ? names[n] : '');
    } else {
      points = SCORE.lines[n];
      label = names[n];
    }
    points *= level;

    if (n > 0) {
      const difficult = n === 4 || spin !== null;
      if (difficult && this.b2b) {
        points = Math.floor(points * SCORE.b2b);
        label = 'B2B ' + label;
      }
      this.b2b = difficult;

      this.combo++;
      if (this.combo > 0) {
        points += SCORE.combo * this.combo * level;
        label += ' COMBO ' + this.combo;
      }

      if (this.board.isEmpty()) {
        points += SCORE.perfect[n] * level;
        label = 'PERFECT CLEAR ' + label;
      }

      this.lines += n;
      this.level = 1 + Math.floor(this.lines / LINES_PER_LEVEL);
    } else {
      this.combo = -1;
    }

    this.score += points;
    if (points > 0) this.lastClear = { label: label.trim(), points, at: this.clock };
  }

  // Full rows are not removed here. They are handed to the flash timer
  // (shape from agent-2) and collapse in finishClear() once it expires;
  // until then there is no active piece.
  lock() {
    const a = this.active;
    const spin = this.tspinKind();
    const visible = this.board.merge(a.piece, a.rot, a.x, a.y);
    if (!visible) {
      this.endGame(); // lock out
      return;
    }
    const rows = this.board.fullRows();
    if (rows.length === 0) {
      this.scoreLock(0, spin); // a lineless T-spin still scores
      this.spawn();
      return;
    }
    this.active = null;
    this.clearing = { rows, spin, acc: 0 };
  }

  finishClear() {
    const { rows, spin } = this.clearing;
    this.clearing = null;
    this.board.clearRows(rows);
    this.scoreLock(rows.length, spin);
    this.spawn();
  }

  // Advance the simulation by dt milliseconds.
  update(dt) {
    if (this.over || this.paused) return;
    this.clock += dt;
    if (this.trail && (this.trail.ms -= dt) <= 0) this.trail = null;

    if (this.clearing) {
      this.clearing.acc += dt;
      if (this.clearing.acc >= CLEAR_FLASH_MS) this.finishClear();
      return;
    }
    const a = this.active;

    let interval = gravityMs(this.level);
    if (this.soft) interval /= SOFT_DROP_MULT;
    this.gravityAcc += dt;
    while (this.gravityAcc >= interval) {
      this.gravityAcc -= interval;
      if (!this.tryMove(0, 1)) break; // resting: lock delay below handles it
      a.spun = false;
      if (this.soft) this.score += 1;
      if (a.y > a.lowestY) {
        a.lowestY = a.y;
        a.lockResets = 0;
      }
      a.lockAcc = 0;
    }

    if (this.grounded()) {
      a.lockAcc += dt;
      if (a.lockAcc >= LOCK_DELAY) this.lock();
    } else {
      a.lockAcc = 0;
    }
  }
}

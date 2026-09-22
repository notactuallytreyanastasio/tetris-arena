// Game state and rules. No DOM, no canvas, no timers of its own: main.js
// calls update(dt) every frame with elapsed milliseconds and the game
// advances its own accumulators. That keeps everything testable in node.

const LOCK_DELAY = 500;   // ms a grounded piece waits before locking
const LOCK_RESETS = 15;   // move/rotate resets allowed per lowest row reached
const SOFT_DROP_MS = 40;  // ms per row while soft dropping (floor; never slower than gravity)
const CLEAR_FLASH = 150;  // ms full rows stay lit before they collapse
const TRAIL_MS = 120;     // ms the hard-drop trail lingers
const TOAST_MS = 900;     // ms a scoring label floats over the board
const QUEUE_DEPTH = 5;    // a 7-bag makes about five pieces plannable
const LINES_PER_LEVEL = 10;

// mulberry32: a tiny seeded PRNG so a game can be replayed from its seed.
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

const SCORE = {
  clear:   [0, 100, 300, 500, 800],   // x level
  tspin:   [400, 800, 1200, 1600],    // T-spin with 0..3 lines, x level
  mini:    [100, 200, 400],           // mini T-spin with 0..2 lines, x level
  perfect: [0, 800, 1200, 1800, 2000],
  combo:   50,                        // x combo x level
  b2b:     1.5,
  soft:    1,                         // per row
  hard:    2,                         // per row
};

const CLEAR_NAMES = ['', 'SINGLE', 'DOUBLE', 'TRIPLE', 'TETRIS'];

class Game {
  constructor(seed) { this.reset(seed); }

  reset(seed = Game.randomSeed()) {
    this.seed = seed >>> 0;
    this.rng = mulberry32(this.seed);
    this.board = new Board();
    this.bag = [];
    this.queue = [];          // upcoming piece types, QUEUE_DEPTH long
    this.hold = null;         // parked piece type
    this.holdUsed = false;    // hold is allowed once per piece
    this.active = null;       // { type, rot, x, y, spin, kick }
    this.dropTrail = null;    // { type, cells, x, y0, y1, t } after a hard drop
    this.score = 0;
    this.lines = 0;
    this.level = 1;
    this.over = false;
    this.paused = false;
    this.combo = -1;          // consecutive line-clearing locks; -1 = none yet
    this.b2b = false;         // last clear was a tetris or T-spin
    this.lastClear = null;    // { label, points } of the latest scoring lock
    this.toasts = [];         // [{ text, t }] scoring labels drawn on the board
    this.locks = 0;           // pieces locked this game; main.js saves the best score when it changes
    this.best = this.best || 0; // best score, loaded by main.js from storage
    this.clearing = null;     // { rows, t } while full rows flash
    this.gravityAcc = 0;      // ms since the last gravity step
    this.softAcc = 0;         // ms since the last soft-drop step
    this.softDrop = false;    // set by input while Down is held
    this.lockAcc = 0;         // ms the piece has been grounded
    this.lockResets = 0;      // resets used since the last new lowest row
    this.lowestY = 0;         // lowest row this piece has reached
    this.spawn();
  }

  static randomSeed() { return (Math.random() * 0x100000000) >>> 0; }

  // Guideline gravity: seconds per row = (0.8 - (level-1)*0.007)^(level-1).
  // Level 1 is one row per second; level 10 is about ten rows per second.
  gravityMs() {
    const l = Math.min(this.level, 20) - 1;
    return Math.max(1000 * Math.pow(0.8 - l * 0.007, l), 16);
  }

  // 7-bag randomiser: every piece once per bag, so droughts are bounded.
  fromBag() {
    if (this.bag.length === 0) {
      this.bag = PIECES.TYPES.slice();
      for (let i = this.bag.length - 1; i > 0; i--) {
        const j = Math.floor(this.rng() * (i + 1));
        [this.bag[i], this.bag[j]] = [this.bag[j], this.bag[i]];
      }
    }
    return this.bag.pop();
  }

  // Head of the preview queue; the queue is refilled from the bag.
  nextType() {
    while (this.queue.length <= QUEUE_DEPTH) this.queue.push(this.fromBag());
    return this.queue.shift();
  }

  spawn(type = this.nextType()) {
    // Box top-left two rows above the visible area, so the piece's bottom
    // row is the last hidden row; one free step down puts it in view.
    const p = { type, rot: 0, x: 3, y: Board.HIDDEN - 2, spin: false, kick: -1 };
    if (this.board.collides(PIECES.cells(type, 0), p.x, p.y)) {
      this.over = true;       // block out: no room to spawn
      this.active = null;
      return;
    }
    if (!this.board.collides(PIECES.cells(type, 0), p.x, p.y + 1)) p.y += 1;
    this.active = p;
    this.gravityAcc = 0;
    this.softAcc = 0;
    this.lockAcc = 0;
    this.lockResets = 0;
    this.lowestY = p.y;
  }

  // Park the active piece and bring out the parked one (or the next piece
  // if nothing is parked). Once per piece: holdUsed clears at the next lock.
  holdPiece() {
    if (!this.accepting || this.holdUsed) return false;
    const parked = this.hold;
    this.hold = this.active.type;
    this.holdUsed = true;
    this.spawn(parked || undefined);
    return true;
  }

  // Row the active piece would land on if hard-dropped.
  ghostY() {
    const p = this.active;
    let y = p.y;
    while (this.fits(p, 0, y - p.y + 1)) y++;
    return y;
  }

  cells(p = this.active) { return PIECES.cells(p.type, p.rot); }

  fits(p, dx = 0, dy = 0, rot = p.rot) {
    return !this.board.collides(PIECES.cells(p.type, rot), p.x + dx, p.y + dy);
  }

  grounded() { return !this.fits(this.active, 0, 1); }

  // Input is accepted only while a piece is live and nothing is animating.
  get accepting() { return !this.over && !this.paused && this.active && !this.clearing; }

  setPaused(on) {
    if (this.over) return;
    this.paused = on;
  }

  // A successful move or rotate while grounded restarts the lock timer, up
  // to LOCK_RESETS times. The budget refills in descend() on a new lowest row.
  noteMoved() {
    if (this.grounded() && this.lockResets < LOCK_RESETS) {
      this.lockAcc = 0;
      this.lockResets += 1;
    }
  }

  move(dx) {
    if (!this.accepting) return false;
    if (!this.fits(this.active, dx, 0)) return false;
    this.active.x += dx;
    this.active.spin = false;
    this.noteMoved();
    return true;
  }

  // dir = +1 clockwise, -1 counter-clockwise, 2 for a 180. Try the base
  // position and then each kick offset in order; the first that fits wins.
  rotate(dir) {
    if (!this.accepting) return false;
    const p = this.active;
    const from = p.rot, to = (p.rot + dir + 4) & 3;
    const kicks = PIECES.kicks(p.type, from, to);
    for (let i = 0; i < kicks.length; i++) {
      const [kx, ky] = kicks[i];
      if (this.fits(p, kx, ky, to)) {
        p.x += kx; p.y += ky; p.rot = to;
        // The fifth-kick T-spin upgrade belongs to the 90-degree tables; a
        // 180 leaves the full/mini call to the corner rule alone (agent-6).
        p.spin = true; p.kick = dir === 2 ? 0 : i;
        this.noteMoved();
        return true;
      }
    }
    return false;
  }

  // Move down one row if possible. Returns true if it moved.
  descend() {
    const p = this.active;
    if (!this.fits(p, 0, 1)) return false;
    p.y += 1;
    p.spin = false;
    if (p.y > this.lowestY) {   // step reset: new lowest row refills the budget
      this.lowestY = p.y;
      this.lockResets = 0;
      this.lockAcc = 0;
    }
    return true;
  }

  hardDrop() {
    if (!this.accepting) return;
    const p = this.active;
    const y0 = p.y;
    let rows = 0;
    while (this.descend()) rows++;
    this.score += rows * SCORE.hard;
    if (rows > 0) this.dropTrail = { type: p.type, cells: this.cells(p), x: p.x, y0, y1: p.y, t: 0 };
    this.lock();
  }

  // Three-corner rule. The T's centre is box cell (1,1). If the piece is a
  // T that arrived by rotation and at least 3 of its 4 diagonal neighbours
  // are filled (walls and floor count), it is a T-spin. It is a full T-spin
  // if both corners on the side the T points to are filled, or if the
  // rotation needed the last kick; otherwise a mini.
  tspinKind() {
    const p = this.active;
    if (p.type !== 'T' || !p.spin) return null;
    const cx = p.x + 1, cy = p.y + 1;
    const b = this.board;
    const tl = b.filled(cx - 1, cy - 1), tr = b.filled(cx + 1, cy - 1);
    const bl = b.filled(cx - 1, cy + 1), br = b.filled(cx + 1, cy + 1);
    if (tl + tr + bl + br < 3) return null;
    const front = [[tl, tr], [tr, br], [bl, br], [tl, bl]][p.rot];
    return (front[0] && front[1]) || p.kick === 4 ? 'full' : 'mini';
  }

  lock() {
    const p = this.active;
    const spin = this.tspinKind();
    this.board.merge(this.cells(p), p.x, p.y, p.type);
    // Lock out: every cell of the piece is still in the hidden rows.
    if (this.cells(p).every(([, dy]) => p.y + dy < Board.HIDDEN)) {
      this.over = true;
      this.active = null;
      this.locks += 1;
      return;
    }
    const rows = this.board.fullRows();
    this.scoreLock(rows.length, spin);
    this.active = null;
    this.holdUsed = false;
    this.locks += 1;
    if (this.score > this.best) this.best = this.score;
    if (rows.length) {
      this.clearing = { rows, t: 0 };   // update() collapses after the flash
    } else {
      this.spawn();
    }
  }

  scoreLock(n, spin) {
    let points, label;
    if (spin === 'full') {
      points = SCORE.tspin[n]; label = 'T-SPIN ' + CLEAR_NAMES[n];
    } else if (spin === 'mini') {
      points = SCORE.mini[Math.min(n, 2)]; label = 'MINI T-SPIN ' + CLEAR_NAMES[n];
    } else {
      points = SCORE.clear[n]; label = CLEAR_NAMES[n];
    }
    points *= this.level;

    if (n > 0) {
      const difficult = n === 4 || spin !== null;
      if (difficult && this.b2b) { points = Math.floor(points * SCORE.b2b); label = 'B2B ' + label; }
      this.b2b = difficult;
      this.combo += 1;
      if (this.combo > 0) { points += SCORE.combo * this.combo * this.level; label += ' COMBO ' + this.combo; }
    } else {
      this.combo = -1;
    }

    if (points > 0) {
      this.score += points;
      this.lastClear = { label: label.trim(), points };
      this.toast(`${label.trim()} +${points}`);
    }
    this.lines += n;
    this.level = 1 + Math.floor(this.lines / LINES_PER_LEVEL);
  }

  toast(text) { this.toasts.push({ text, t: 0 }); }

  finishClear() {
    const n = this.clearing.rows.length;
    this.board.removeRows(this.clearing.rows);
    this.clearing = null;
    if (this.board.isEmpty()) {
      const bonus = SCORE.perfect[n] * this.level;
      this.score += bonus;
      this.lastClear = { label: 'PERFECT CLEAR', points: bonus };
      this.toast(`PERFECT CLEAR +${bonus}`);
      if (this.score > this.best) this.best = this.score;
    }
    this.spawn();
  }

  update(dt) {
    if (this.over || this.paused) return;   // paused freezes every accumulator, the flash included

    if (this.dropTrail) {
      this.dropTrail.t += dt;
      if (this.dropTrail.t >= TRAIL_MS) this.dropTrail = null;
    }
    for (const t of this.toasts) t.t += dt;
    this.toasts = this.toasts.filter(t => t.t < TOAST_MS);

    if (this.clearing) {
      this.clearing.t += dt;
      if (this.clearing.t >= CLEAR_FLASH) this.finishClear();
      return;
    }

    // Gravity and soft drop are separate accumulators so soft drop has a
    // fixed floor speed and never ends up slower than gravity itself.
    this.gravityAcc += dt;
    const g = this.gravityMs();
    while (this.gravityAcc >= g) { this.gravityAcc -= g; this.descend(); }

    if (this.softDrop) {
      this.softAcc += dt;
      const s = Math.min(SOFT_DROP_MS, g);
      while (this.softAcc >= s) { this.softAcc -= s; if (this.descend()) this.score += SCORE.soft; }
    } else {
      this.softAcc = 0;
    }

    if (this.grounded()) {
      this.lockAcc += dt;
      if (this.lockAcc >= LOCK_DELAY) this.lock();
    } else {
      this.lockAcc = 0;
    }
  }
}

if (typeof module !== 'undefined') module.exports = Game;

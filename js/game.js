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

// 7-bag randomiser: every piece exactly once per 7, so droughts are bounded.
class Bag {
  constructor() {
    this.queue = [];
  }
  next() {
    if (this.queue.length === 0) {
      const names = PIECE_NAMES.slice();
      for (let i = names.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [names[i], names[j]] = [names[j], names[i]];
      }
      this.queue = names;
    }
    return PIECES[this.queue.shift()];
  }
}

class Game {
  constructor() {
    this.board = new Board();
    this.reset();
  }

  reset() {
    this.board.reset();
    this.bag = new Bag();
    this.level = 1;
    this.lines = 0;
    this.score = 0;
    this.over = false;
    this.soft = false;
    this.gravityAcc = 0;
    this.active = null; // { piece, rot, x, y, lockAcc, lockResets, lowestY }
    this.spawn();
  }

  spawn() {
    const piece = this.bag.next();
    // SRS spawn: box top-left at column 3 (4 for O), on the top hidden row,
    // then an immediate step down if that is free.
    const x = piece.name === 'O' ? 4 : 3;
    const p = { piece, rot: 0, x, y: 0, lockAcc: 0, lockResets: 0, lowestY: 0 };
    this.active = p;
    if (!this.board.fits(piece, 0, x, 0)) {
      this.over = true; // block out
      return;
    }
    if (this.board.fits(piece, 0, x, 1)) p.y = p.lowestY = 1;
    this.gravityAcc = 0;
  }

  grounded() {
    const a = this.active;
    return !this.board.fits(a.piece, a.rot, a.x, a.y + 1);
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
    if (this.over) return false;
    const ok = this.tryMove(dx, 0);
    if (ok) this.noteMoved();
    return ok;
  }

  // dir is +1 clockwise, -1 counter-clockwise. Walk the SRS kick list for
  // this (from, to) pair; the first offset that fits wins. Kick dy is
  // negated because the tables are written with +y up.
  rotate(dir) {
    if (this.over) return false;
    const a = this.active;
    const to = (a.rot + dir + 4) % 4;
    for (const [kx, ky] of kicksFor(a.piece, a.rot, to)) {
      const nx = a.x + kx;
      const ny = a.y - ky;
      if (this.board.fits(a.piece, to, nx, ny)) {
        a.rot = to;
        a.x = nx;
        a.y = ny;
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
    if (this.over) return;
    let rows = 0;
    while (this.tryMove(0, 1)) rows++;
    this.score += rows * 2;
    this.lock();
  }

  lock() {
    const a = this.active;
    const visible = this.board.merge(a.piece, a.rot, a.x, a.y);
    if (!visible) {
      this.over = true; // lock out
      return;
    }
    const rows = this.board.fullRows();
    this.board.clearRows(rows);
    this.lines += rows.length;
    this.spawn();
  }

  // Advance the simulation by dt milliseconds.
  update(dt) {
    if (this.over) return;
    const a = this.active;

    let interval = gravityMs(this.level);
    if (this.soft) interval /= SOFT_DROP_MULT;
    this.gravityAcc += dt;
    while (this.gravityAcc >= interval) {
      this.gravityAcc -= interval;
      if (!this.tryMove(0, 1)) break; // resting: lock delay below handles it
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

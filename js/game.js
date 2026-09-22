// Game state and the simulation step. No DOM, no canvas: everything here is
// plain data so it can be driven by the rAF loop in main.js, or by a test.

// Guideline gravity: seconds per row at a given level.
function gravityMs(level) {
  const l = Math.min(level, 20) - 1;
  return Math.pow(0.8 - l * 0.007, l) * 1000;
}

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
    this.gravityAcc = 0;
    this.active = null; // { piece, rot, x, y }
    this.spawn();
  }

  spawn() {
    const piece = this.bag.next();
    // SRS spawn: box top-left at column 3 (4 for O), on the top hidden row,
    // then an immediate step down if that is free.
    const x = piece.name === 'O' ? 4 : 3;
    const p = { piece, rot: 0, x, y: 0 };
    if (!this.board.fits(piece, 0, x, 0)) {
      this.active = p;
      this.over = true; // block out
      return;
    }
    if (this.board.fits(piece, 0, x, 1)) p.y = 1;
    this.active = p;
    this.gravityAcc = 0;
  }

  // Try to move the active piece by (dx, dy). Returns true on success.
  tryMove(dx, dy) {
    const a = this.active;
    if (!this.board.fits(a.piece, a.rot, a.x + dx, a.y + dy)) return false;
    a.x += dx;
    a.y += dy;
    return true;
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
    this.gravityAcc += dt;
    const interval = gravityMs(this.level);
    while (this.gravityAcc >= interval) {
      this.gravityAcc -= interval;
      if (!this.tryMove(0, 1)) {
        this.lock();
        break;
      }
    }
  }
}

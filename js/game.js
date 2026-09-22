// Game state and rules. No DOM, no canvas, no timers of its own: main.js
// calls update(dt) every frame with elapsed milliseconds and the game
// advances its own accumulators. That keeps everything testable in node.

const LOCK_DELAY = 500;   // ms a grounded piece waits before locking
const LOCK_RESETS = 15;   // move/rotate resets allowed per lowest row reached
const SOFT_DROP_MS = 40;  // ms per row while soft dropping (floor; never slower than gravity)

class Game {
  constructor() { this.reset(); }

  reset() {
    this.board = new Board();
    this.bag = [];
    this.active = null;       // { type, rot, x, y }
    this.score = 0;
    this.lines = 0;
    this.level = 1;
    this.over = false;
    this.gravityAcc = 0;      // ms since the last gravity step
    this.softAcc = 0;         // ms since the last soft-drop step
    this.softDrop = false;    // set by input while Down is held
    this.lockAcc = 0;         // ms the piece has been grounded
    this.lockResets = 0;      // resets used since the last new lowest row
    this.lowestY = 0;         // lowest row this piece has reached
    this.spawn();
  }

  // Guideline gravity: seconds per row = (0.8 - (level-1)*0.007)^(level-1).
  // Level 1 is one row per second; level 10 is about ten rows per second.
  gravityMs() {
    const l = Math.min(this.level, 20) - 1;
    return Math.max(1000 * Math.pow(0.8 - l * 0.007, l), 16);
  }

  // 7-bag randomiser: every piece once per bag, so droughts are bounded.
  nextType() {
    if (this.bag.length === 0) {
      this.bag = PIECES.TYPES.slice();
      for (let i = this.bag.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [this.bag[i], this.bag[j]] = [this.bag[j], this.bag[i]];
      }
    }
    return this.bag.pop();
  }

  spawn() {
    const type = this.nextType();
    const p = { type, rot: 0, x: 3, y: 0 };
    if (this.board.collides(PIECES.cells(type, 0), p.x, p.y)) {
      this.over = true;       // block out: no room to spawn
      this.active = null;
      return;
    }
    // Step down once if free so the piece is in view on its first frame.
    if (!this.board.collides(PIECES.cells(type, 0), p.x, p.y + 1)) p.y = 1;
    this.active = p;
    this.gravityAcc = 0;
    this.softAcc = 0;
    this.lockAcc = 0;
    this.lockResets = 0;
    this.lowestY = p.y;
  }

  cells(p = this.active) { return PIECES.cells(p.type, p.rot); }

  fits(p, dx = 0, dy = 0, rot = p.rot) {
    return !this.board.collides(PIECES.cells(p.type, rot), p.x + dx, p.y + dy);
  }

  grounded() { return !this.fits(this.active, 0, 1); }

  // A successful move or rotate while grounded restarts the lock timer, up
  // to LOCK_RESETS times. The budget refills in descend() on a new lowest row.
  noteMoved() {
    if (this.grounded() && this.lockResets < LOCK_RESETS) {
      this.lockAcc = 0;
      this.lockResets += 1;
    }
  }

  move(dx) {
    if (this.over || !this.active) return false;
    if (!this.fits(this.active, dx, 0)) return false;
    this.active.x += dx;
    this.noteMoved();
    return true;
  }

  // dir = +1 clockwise, -1 counter-clockwise. Try the base position and
  // then each SRS kick offset in order; the first that fits wins.
  rotate(dir) {
    if (this.over || !this.active) return false;
    const p = this.active;
    const from = p.rot, to = (p.rot + dir + 4) & 3;
    for (const [kx, ky] of PIECES.kicks(p.type, from, to)) {
      if (this.fits(p, kx, ky, to)) {
        p.x += kx; p.y += ky; p.rot = to;
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
    if (p.y > this.lowestY) {   // step reset: new lowest row refills the budget
      this.lowestY = p.y;
      this.lockResets = 0;
      this.lockAcc = 0;
    }
    return true;
  }

  hardDrop() {
    if (this.over || !this.active) return;
    while (this.descend()) { /* fall */ }
    this.lock();
  }

  lock() {
    const p = this.active;
    this.board.merge(this.cells(p), p.x, p.y, p.type);
    // Lock out: every cell of the piece is still in the hidden rows.
    if (this.cells(p).every(([, dy]) => p.y + dy < Board.HIDDEN)) {
      this.over = true;
      this.active = null;
      return;
    }
    const cleared = this.board.clearLines();
    this.lines += cleared;
    this.spawn();
  }

  update(dt) {
    if (this.over || !this.active) return;

    // Gravity and soft drop are separate accumulators so soft drop has a
    // fixed floor speed and never ends up slower than gravity itself.
    this.gravityAcc += dt;
    const g = this.gravityMs();
    while (this.gravityAcc >= g) { this.gravityAcc -= g; this.descend(); }

    if (this.softDrop) {
      this.softAcc += dt;
      const s = Math.min(SOFT_DROP_MS, g);
      while (this.softAcc >= s) { this.softAcc -= s; this.descend(); }
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

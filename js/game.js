// Game state and rules. No DOM, no canvas, no timers of its own: main.js
// calls update(dt) every frame with elapsed milliseconds and the game
// advances its own accumulators. That keeps everything testable in node.

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
    this.active = p;
    this.gravityAcc = 0;
  }

  cells(p = this.active) { return PIECES.cells(p.type, p.rot); }

  fits(p, dx = 0, dy = 0, rot = p.rot) {
    return !this.board.collides(PIECES.cells(p.type, rot), p.x + dx, p.y + dy);
  }

  lock() {
    const p = this.active;
    this.board.merge(this.cells(p), p.x, p.y, p.type);
    const cleared = this.board.clearLines();
    this.lines += cleared;
    this.spawn();
  }

  // One gravity step: move down or lock.
  step() {
    const p = this.active;
    if (this.fits(p, 0, 1)) p.y += 1;
    else this.lock();
  }

  update(dt) {
    if (this.over || !this.active) return;
    this.gravityAcc += dt;
    const g = this.gravityMs();
    while (this.gravityAcc >= g && this.active) {
      this.gravityAcc -= g;
      this.step();
    }
  }
}

if (typeof module !== 'undefined') module.exports = Game;

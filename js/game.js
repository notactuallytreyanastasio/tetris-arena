// Game state and rules. No DOM, no canvas: everything here is testable from
// node by concatenating pieces.js + board.js + game.js.
//
// Time is a single accumulator model: tick(dt) adds elapsed milliseconds to
// whichever timer is live (gravity, lock delay) and fires when it overflows.

const LOCK_DELAY_MS = 500;

// Guideline gravity: seconds per row = (0.8 - (level-1)*0.007)^(level-1).
function gravityMsForLevel(level) {
  const l = Math.min(level, 20) - 1;
  return Math.pow(0.8 - l * 0.007, l) * 1000;
}

class Game {
  constructor(rng = Math.random) {
    this.rng = rng;
    this.reset();
  }

  reset() {
    this.grid = createGrid();
    this.nextPiece = makeBag(this.rng);
    this.piece = null;          // { id, rot, x, y }
    this.score = 0;
    this.lines = 0;
    this.level = 1;
    this.status = 'playing';    // 'playing' | 'paused' | 'over'
    this.gravityAcc = 0;
    this.lockAcc = 0;
    this.spawn();
  }

  shape() { return ROTATIONS[this.piece.id][this.piece.rot]; }

  spawn() {
    const id = this.nextPiece();
    const shape = ROTATIONS[id][0];
    // Centre horizontally; sit in the hidden buffer so the piece's lowest
    // filled row is the last hidden row and it enters view on the first step.
    const x = Math.floor((COLS - shape[0].length) / 2);
    let bottom = 0;
    for (let r = 0; r < shape.length; r++) if (shape[r].some(Boolean)) bottom = r;
    const y = HIDDEN - 1 - bottom;
    this.piece = { id, rot: 0, x, y };
    this.gravityAcc = 0;
    this.lockAcc = 0;
    if (collides(this.grid, shape, x, y)) {
      this.status = 'over';
    }
  }

  fits(rot, x, y) {
    return !collides(this.grid, ROTATIONS[this.piece.id][rot], x, y);
  }

  grounded() {
    return !this.fits(this.piece.rot, this.piece.x, this.piece.y + 1);
  }

  lock() {
    merge(this.grid, this.shape(), this.piece.x, this.piece.y, this.piece.id);
    this.spawn();
  }

  // Advance the piece one row by gravity. Returns true if it moved.
  step() {
    if (this.fits(this.piece.rot, this.piece.x, this.piece.y + 1)) {
      this.piece.y += 1;
      return true;
    }
    return false;
  }

  tick(dt) {
    if (this.status !== 'playing') return;

    if (this.grounded()) {
      this.lockAcc += dt;
      if (this.lockAcc >= LOCK_DELAY_MS) this.lock();
      return;
    }

    this.lockAcc = 0;
    this.gravityAcc += dt;
    const interval = gravityMsForLevel(this.level);
    while (this.gravityAcc >= interval) {
      this.gravityAcc -= interval;
      if (!this.step()) break;
    }
  }
}

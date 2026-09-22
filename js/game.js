// Game state and rules. No DOM, no canvas: everything here is testable from
// node by concatenating pieces.js + board.js + game.js.
//
// Time is a single accumulator model: tick(dt) adds elapsed milliseconds to
// whichever timer is live (gravity, lock delay) and fires when it overflows.

const LOCK_DELAY_MS = 500;
const MAX_LOCK_RESETS = 15;   // guideline "move reset": a piece cannot be stalled forever
const SOFT_DROP_FACTOR = 20;  // soft drop is 20x gravity
const CLEAR_FLASH_MS = 180;   // full rows stay lit this long before they vanish
const LINES_PER_LEVEL = 10;
const CLEAR_SCORE = [0, 100, 300, 500, 800];  // guideline, x level
const COMBO_SCORE = 50;                       // x combo x level

// Guideline gravity: seconds per row = (0.8 - (level-1)*0.007)^(level-1).
// Level 1 = 1000ms, 5 = 355ms, 10 = 64ms, 15 = 7ms. Clamped at level 20.
function gravityMsForLevel(level) {
  const l = Math.min(Math.max(level, 1), 20) - 1;
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
    this.softDrop = false;
    this.gravityAcc = 0;
    this.lockAcc = 0;
    this.lockResets = 0;
    this.b2b = false;           // last clear was a tetris
    this.combo = -1;            // consecutive locks that cleared lines
    this.clearing = null;       // { rows, ms } while full rows flash
    this.spawn();
  }

  // The player can act only while a piece is live and not mid-clear.
  active() { return this.status === 'playing' && this.piece !== null; }

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
    this.lockResets = 0;
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

  // A successful move or rotate while resting on the stack restarts the lock
  // delay, up to MAX_LOCK_RESETS times per piece.
  touched() {
    if (this.grounded() && this.lockResets < MAX_LOCK_RESETS) {
      this.lockAcc = 0;
      this.lockResets++;
    }
  }

  // ---- player actions ------------------------------------------------------

  move(dx) {
    if (!this.active()) return false;
    if (!this.fits(this.piece.rot, this.piece.x + dx, this.piece.y)) return false;
    this.piece.x += dx;
    this.touched();
    return true;
  }

  // dir = +1 clockwise, -1 counter-clockwise. Walks the SRS kick table for
  // the (from, to) pair; the first offset that fits wins.
  rotate(dir) {
    if (!this.active()) return false;
    const from = this.piece.rot;
    const to = (from + dir + 4) % 4;
    for (const [dx, dy] of kicksFor(this.piece.id, from, to)) {
      const x = this.piece.x + dx, y = this.piece.y - dy; // table dy is "up"
      if (this.fits(to, x, y)) {
        this.piece.rot = to;
        this.piece.x = x;
        this.piece.y = y;
        this.touched();
        return true;
      }
    }
    return false;
  }

  hardDrop() {
    if (!this.active()) return;
    while (this.step()) this.score += 2;
    this.lock();
  }

  setSoftDrop(on) { this.softDrop = on; }

  // ---- rules ---------------------------------------------------------------

  lock() {
    const shape = this.shape();
    merge(this.grid, shape, this.piece.x, this.piece.y, this.piece.id);
    if (entirelyHidden(shape, this.piece.y)) {
      this.status = 'over';   // lock-out
      return;
    }
    const rows = fullRows(this.grid);
    if (rows.length === 0) {
      this.combo = -1;
      this.spawn();
      return;
    }
    // Flash first; finishClear() removes the rows and spawns when it ends.
    this.piece = null;
    this.clearing = { rows, ms: CLEAR_FLASH_MS };
  }

  finishClear() {
    const n = this.clearing.rows.length;
    removeRows(this.grid, this.clearing.rows);
    this.clearing = null;

    let points = CLEAR_SCORE[n] * this.level;
    if (n === 4) {
      if (this.b2b) points = Math.floor(points * 1.5);
      this.b2b = true;
    } else {
      this.b2b = false;
    }
    this.combo += 1;
    points += COMBO_SCORE * this.combo * this.level;
    this.score += points;
    this.lines += n;
    this.level = 1 + Math.floor(this.lines / LINES_PER_LEVEL);
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

    if (this.clearing) {
      this.clearing.ms -= dt;
      if (this.clearing.ms <= 0) this.finishClear();
      return;
    }

    if (this.grounded()) {
      this.lockAcc += dt;
      if (this.lockAcc >= LOCK_DELAY_MS) this.lock();
      return;
    }

    this.gravityAcc += dt;
    let interval = gravityMsForLevel(this.level);
    if (this.softDrop) interval /= SOFT_DROP_FACTOR;
    while (this.gravityAcc >= interval) {
      this.gravityAcc -= interval;
      if (!this.step()) break;
      if (this.softDrop) this.score += 1;
    }
  }
}

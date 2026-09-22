// Game state and rules. Nothing here touches the DOM or the canvas; main.js
// drives update(dt) from requestAnimationFrame and render.js draws whatever
// state it finds. All timing is in milliseconds accumulated from dt so the
// game behaves the same at 30, 60 or 144 fps.

const LOCK_DELAY_MS = 500;
// Guideline "move reset": a move or rotate while resting restarts the lock
// delay, but only this many times, so a piece cannot be kept alive forever.
const MAX_LOCK_RESETS = 15;
// Soft drop is 20x gravity, but never slower than the level's gravity.
const SOFT_DROP_FACTOR = 20;

// Guideline gravity: seconds per row = (0.8 - (level-1)*0.007)^(level-1).
function gravityMs(level) {
  const l = Math.min(level, 20) - 1;
  return Math.pow(0.8 - l * 0.007, l) * 1000;
}

// 7-bag randomiser: every piece appears once per bag, so droughts are bounded.
function makeBag() {
  const bag = PIECE_TYPES.slice();
  for (let i = bag.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [bag[i], bag[j]] = [bag[j], bag[i]];
  }
  return bag;
}

class Game {
  constructor() {
    this.reset();
  }

  reset() {
    this.board = makeBoard();
    this.queue = [];
    this.piece = null;
    this.level = 1;
    this.score = 0;
    this.lines = 0;
    this.over = false;
    this.softDropping = false;
    this.gravityAcc = 0;
    this.lockAcc = 0;
    this.lockResets = 0;
    this.lowestY = 0;
    this.spawn();
  }

  nextType() {
    if (this.queue.length < 7) this.queue.push(...makeBag());
    return this.queue.shift();
  }

  // Spawn horizontally centred with the piece's lowest row on the first
  // visible row, so it appears the instant it exists instead of sitting in
  // the hidden rows for a full gravity interval. If it does not fit, the
  // stack has reached the top and the game is over (block out).
  spawn() {
    const type = this.nextType();
    const size = PIECES[type].size;
    this.piece = { type, rot: 0, x: Math.floor((COLS - size) / 2), y: HIDDEN_ROWS - 1 };
    this.gravityAcc = 0;
    this.lockAcc = 0;
    this.lockResets = 0;
    this.lowestY = this.piece.y;
    if (!fits(this.board, this.piece)) {
      this.over = true;
      this.piece = null;
    }
  }

  // Try a displaced/rotated copy of the piece; commit it if it fits.
  tryMove(dx, dy, drot = 0) {
    const cand = { ...this.piece, x: this.piece.x + dx, y: this.piece.y + dy, rot: (this.piece.rot + drot + 4) % 4 };
    if (!fits(this.board, cand)) return false;
    this.piece = cand;
    return true;
  }

  grounded() {
    return !fits(this.board, { ...this.piece, y: this.piece.y + 1 });
  }

  // A successful player move while resting earns another lock delay, up to
  // the cap. Falling to a new lowest row replenishes the cap, which is what
  // lets a piece slide under an overhang without locking early.
  playerMoved() {
    if (this.piece.y > this.lowestY) {
      this.lowestY = this.piece.y;
      this.lockResets = 0;
    }
    if (this.grounded() && this.lockResets < MAX_LOCK_RESETS) {
      this.lockAcc = 0;
      this.lockResets++;
    }
  }

  move(dx) {
    if (!this.piece || this.over) return false;
    const ok = this.tryMove(dx, 0);
    if (ok) this.playerMoved();
    return ok;
  }

  // dir = +1 clockwise, -1 counter-clockwise. No wall kicks yet.
  rotate(dir) {
    if (!this.piece || this.over) return false;
    const ok = this.tryMove(0, 0, dir);
    if (ok) this.playerMoved();
    return ok;
  }

  hardDrop() {
    if (!this.piece || this.over) return;
    while (this.tryMove(0, 1)) { /* fall */ }
    this.lock();
  }

  // Lock out (from agent-1): a piece that settles entirely inside the hidden
  // rows never becomes visible, and the guideline calls that game over too.
  lock() {
    const cells = pieceCells(this.piece);
    lockPiece(this.board, this.piece);
    if (cells.every(([, y]) => y < HIDDEN_ROWS)) {
      this.over = true;
      this.piece = null;
      return;
    }
    const cleared = clearLines(this.board);
    this.lines += cleared;
    this.spawn();
  }

  update(dt) {
    if (this.over || !this.piece) return;

    this.gravityAcc += dt;
    const base = gravityMs(this.level);
    const interval = this.softDropping ? Math.min(base, base / SOFT_DROP_FACTOR) : base;
    while (this.gravityAcc >= interval) {
      this.gravityAcc -= interval;
      if (this.tryMove(0, 1) && this.piece.y > this.lowestY) {
        this.lowestY = this.piece.y;
        this.lockResets = 0;
      }
    }

    // Lock delay: once the piece is resting, give it a moment before it
    // settles. The accumulator resets whenever the piece is airborne again.
    if (this.grounded()) {
      this.lockAcc += dt;
      if (this.lockAcc >= LOCK_DELAY_MS) this.lock();
    } else {
      this.lockAcc = 0;
    }
  }
}

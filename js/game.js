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
const TSPIN_SCORE = [400, 800, 1200, 1600];   // full T-spin, by lines cleared
const MINI_SCORE = [100, 200, 400];           // mini T-spin, by lines cleared
const COMBO_SCORE = 50;                       // x combo x level
const QUEUE_DEPTH = 3;
const TOAST_MS = 900;

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
    this.queue = [];            // upcoming piece ids, QUEUE_DEPTH long
    this.hold = 0;              // held piece id, 0 = none
    this.holdUsed = false;      // hold is once per piece
    this.toasts = [];           // [{ text, ms }] scoring feedback on the board
    this.piece = null;          // { id, rot, x, y, lowestY, spun, kick }
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

  // Pull the next id through the preview queue so what the panel shows is
  // exactly what the bag will deal.
  dequeue() {
    while (this.queue.length < QUEUE_DEPTH + 1) this.queue.push(this.nextPiece());
    return this.queue.shift();
  }

  spawn(id = this.dequeue()) {
    this.holdUsed = false;
    this.place(id);
  }

  // Put a piece of this id at the spawn position as the active piece.
  place(id) {
    const shape = ROTATIONS[id][0];
    // Centre horizontally; sit in the hidden buffer so the piece's lowest
    // filled row is the last hidden row and it enters view on the first step.
    const x = Math.floor((COLS - shape[0].length) / 2);
    let bottom = 0;
    for (let r = 0; r < shape.length; r++) if (shape[r].some(Boolean)) bottom = r;
    const y = HIDDEN - 1 - bottom;
    this.piece = { id, rot: 0, x, y, lowestY: y, spun: false, kick: 0 };
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
  // delay, up to MAX_LOCK_RESETS times since the piece last reached a new
  // lowest row (guideline rule, via agent-6).
  touched() {
    if (this.piece.y > this.piece.lowestY) {
      this.piece.lowestY = this.piece.y;
      this.lockResets = 0;
    }
    if (this.grounded() && this.lockResets < MAX_LOCK_RESETS) {
      this.lockAcc = 0;
      this.lockResets++;
    }
  }

  // Row the active piece would land on if dropped now.
  ghostY() {
    let y = this.piece.y;
    while (this.fits(this.piece.rot, this.piece.x, y + 1)) y++;
    return y;
  }

  // 3-corner rule (via agent-5): a T whose last action was a rotation with at
  // least 3 of the 4 diagonals around its centre solid was spun in. Full if
  // both corners on the side the T points to are solid, or it arrived via
  // kick test 5; otherwise mini. Returns null, 'mini' or 'full'.
  tspinKind() {
    const p = this.piece;
    if (p.id !== PIECES.T.id || !p.spun) return null;
    const solid = (x, y) => x < 0 || x >= COLS || y < 0 || y >= ROWS || this.grid[y][x] !== 0;
    const cx = p.x + 1, cy = p.y + 1;
    const tl = solid(cx - 1, cy - 1), tr = solid(cx + 1, cy - 1);
    const bl = solid(cx - 1, cy + 1), br = solid(cx + 1, cy + 1);
    if (tl + tr + bl + br < 3) return null;
    const front = [[tl, tr], [tr, br], [bl, br], [tl, bl]][p.rot];
    return (front[0] && front[1]) || p.kick === 4 ? 'full' : 'mini';
  }

  toast(text) { this.toasts.push({ text, ms: TOAST_MS }); }

  // ---- player actions ------------------------------------------------------

  move(dx) {
    if (!this.active()) return false;
    if (!this.fits(this.piece.rot, this.piece.x + dx, this.piece.y)) return false;
    this.piece.x += dx;
    this.piece.spun = false;
    this.touched();
    return true;
  }

  // dir = +1 clockwise, -1 counter-clockwise. Walks the SRS kick table for
  // the (from, to) pair; the first offset that fits wins.
  rotate(dir) {
    if (!this.active()) return false;
    const from = this.piece.rot;
    const to = (from + dir + 4) % 4;
    const kicks = kicksFor(this.piece.id, from, to);
    for (let i = 0; i < kicks.length; i++) {
      const [dx, dy] = kicks[i];
      const x = this.piece.x + dx, y = this.piece.y - dy; // table dy is "up"
      if (this.fits(to, x, y)) {
        this.piece.rot = to;
        this.piece.x = x;
        this.piece.y = y;
        this.piece.spun = true;
        this.piece.kick = i;
        this.touched();
        return true;
      }
    }
    return false;
  }

  // Swap the active piece with the held one (or stash it and spawn the next
  // if nothing is held). Once per piece; the flag clears on lock.
  swapHold() {
    if (!this.active() || this.holdUsed) return false;
    const id = this.piece.id;
    if (this.hold) {
      this.place(this.hold);
    } else {
      this.spawn();
    }
    this.hold = id;
    this.holdUsed = true;
    return true;
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
    const spin = this.tspinKind();
    const rows = fullRows(this.grid);
    if (rows.length === 0) {
      this.combo = -1;
      // A T-spin with no lines still scores (400 / mini 100) and keeps b2b.
      if (spin) {
        const pts = (spin === 'full' ? TSPIN_SCORE[0] : MINI_SCORE[0]) * this.level;
        this.score += pts;
        this.toast(`${spin === 'mini' ? 'MINI ' : ''}T-SPIN +${pts}`);
      }
      this.spawn();
      return;
    }
    // Flash first; finishClear() removes the rows and spawns when it ends.
    this.piece = null;
    this.clearing = { rows, ms: CLEAR_FLASH_MS, spin };
  }

  finishClear() {
    const n = this.clearing.rows.length;
    const spin = this.clearing.spin;
    removeRows(this.grid, this.clearing.rows);
    this.clearing = null;

    let points;
    if (spin === 'full') points = TSPIN_SCORE[n];
    else if (spin === 'mini') points = MINI_SCORE[Math.min(n, 2)];
    else points = CLEAR_SCORE[n];
    points *= this.level;

    const hard = n === 4 || spin !== null;   // tetrises and T-spins chain b2b
    const chained = hard && this.b2b;
    if (chained) points = Math.floor(points * 1.5);
    this.b2b = hard;

    this.combo += 1;
    points += COMBO_SCORE * this.combo * this.level;
    this.score += points;
    this.lines += n;
    this.level = 1 + Math.floor(this.lines / LINES_PER_LEVEL);

    const name = ['', 'SINGLE', 'DOUBLE', 'TRIPLE', 'TETRIS'][n];
    const label = spin ? `${spin === 'mini' ? 'MINI ' : ''}T-SPIN ${name}` : name;
    this.toast(`${chained ? 'B2B ' : ''}${label} +${points}`);
    if (this.combo > 0) this.toast(`COMBO x${this.combo}`);
    this.spawn();
  }

  // Advance the piece one row by gravity. Returns true if it moved.
  step() {
    if (this.fits(this.piece.rot, this.piece.x, this.piece.y + 1)) {
      this.piece.y += 1;
      this.piece.spun = false;
      if (this.piece.y > this.piece.lowestY) {
        this.piece.lowestY = this.piece.y;
        this.lockResets = 0;
      }
      return true;
    }
    return false;
  }

  tick(dt) {
    for (const t of this.toasts) t.ms -= dt;
    this.toasts = this.toasts.filter(t => t.ms > 0);
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

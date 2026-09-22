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
const LINES_PER_LEVEL = 10;
// Guideline line-clear scores, indexed by lines cleared, multiplied by level.
const CLEAR_SCORE = [0, 100, 300, 500, 800];
const COMBO_SCORE = 50;
// T-spin scores by lines cleared (0..3). Mini T-spins clear at most 2.
const TSPIN_SCORE = [400, 800, 1200, 1600];
const TSPIN_MINI_SCORE = [100, 200, 400];
const NEXT_PREVIEW = 5;
// Full rows stay on screen this long, drawn bright, before they collapse.
const CLEAR_FLASH_MS = 120;

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
    this.hold = null;        // piece type parked by the player
    this.holdUsed = false;   // one hold per piece
    // Set by a successful rotation, cleared by any successful move or fall.
    // Holds the index of the kick that succeeded; T-spin detection needs it.
    this.lastRotation = null;
    this.level = 1;
    this.score = 0;
    this.lines = 0;
    this.over = false;
    this.softDropping = false;
    this.gravityAcc = 0;
    this.lockAcc = 0;
    this.lockResets = 0;
    this.lowestY = 0;
    // Combo counts consecutive piece locks that cleared lines; -1 = none.
    this.combo = -1;
    // Back-to-back: the previous clear was a tetris, so another pays 1.5x.
    this.b2b = false;
    // While rows are flashing: { rows: [y...], acc: ms }. No piece exists.
    this.clearing = null;
    // Last scoring event, for the HUD: { label, points, at: ms clock }.
    this.lastClear = null;
    this.clock = 0;
    this.spawn();
  }

  nextType() {
    if (this.queue.length < NEXT_PREVIEW + 1) this.queue.push(...makeBag());
    return this.queue.shift();
  }

  preview() {
    while (this.queue.length < NEXT_PREVIEW) this.queue.push(...makeBag());
    return this.queue.slice(0, NEXT_PREVIEW);
  }

  // Spawn horizontally centred with the piece's lowest row on the first
  // visible row, so it appears the instant it exists instead of sitting in
  // the hidden rows for a full gravity interval. If that row is blocked,
  // try one row higher (from agent-3) before calling it a block out: the
  // stack can reach the top visible row and the game is still playable.
  spawn(type = this.nextType()) {
    const size = PIECES[type].size;
    const x = Math.floor((COLS - size) / 2);
    this.gravityAcc = 0;
    this.lockAcc = 0;
    this.lockResets = 0;
    this.lastRotation = null;
    this.holdUsed = false;
    for (const y of [HIDDEN_ROWS - 1, HIDDEN_ROWS - 2]) {
      const cand = { type, rot: 0, x, y };
      if (fits(this.board, cand)) {
        this.piece = cand;
        this.lowestY = y;
        return;
      }
    }
    this.over = true;
    this.piece = null;
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
    if (ok) {
      this.lastRotation = null;
      this.playerMoved();
    }
    return ok;
  }

  // dir = +1 clockwise, -1 counter-clockwise. Walk the SRS kick list for
  // this transition; the first offset that fits is the rotation.
  rotate(dir) {
    if (!this.piece || this.over) return false;
    const from = this.piece.rot;
    const to = (from + dir + 4) % 4;
    const kicks = kicksFor(this.piece.type, from, to);
    for (let i = 0; i < kicks.length; i++) {
      const [kx, ky] = kicks[i];
      if (this.tryMove(kx, ky, dir)) {
        this.lastRotation = { kick: i };
        this.playerMoved();
        return true;
      }
    }
    return false;
  }

  // Park the current piece and bring out the parked one (or the next piece
  // if nothing is parked). Once per piece: holdUsed is cleared by spawn().
  holdPiece() {
    if (!this.piece || this.over || this.holdUsed) return false;
    const parked = this.hold;
    this.hold = this.piece.type;
    this.piece = null;
    this.spawn(parked || undefined);
    this.holdUsed = true;
    return true;
  }

  // Row the piece would come to rest on if hard-dropped now. For the ghost.
  ghostY() {
    let y = this.piece.y;
    while (fits(this.board, { ...this.piece, y: y + 1 })) y++;
    return y;
  }

  hardDrop() {
    if (!this.piece || this.over) return;
    let rows = 0;
    while (this.tryMove(0, 1)) rows++;
    if (rows > 0) this.lastRotation = null;
    this.score += rows * 2;
    this.lock();
  }

  // Three-corner rule (agent-5's version, which also grades mini vs full):
  // a T whose last successful action was a rotation, with at least three of
  // the four diagonals around its centre solid, was spun in. It is a full
  // T-spin if both corners on the side the T points to are solid, or if it
  // arrived by the last (index 4) kick; otherwise a mini. Walls count as
  // solid. Returns null, 'mini' or 'full'.
  tspinKind() {
    const p = this.piece;
    if (p.type !== 'T' || !this.lastRotation) return null;
    const solid = (x, y) => x < 0 || x >= COLS || y < 0 || y >= TOTAL_ROWS || this.board[y][x] !== 0;
    const cx = p.x + 1, cy = p.y + 1;
    const tl = solid(cx - 1, cy - 1), tr = solid(cx + 1, cy - 1);
    const bl = solid(cx - 1, cy + 1), br = solid(cx + 1, cy + 1);
    if (tl + tr + bl + br < 3) return null;
    const front = [[tl, tr], [tr, br], [bl, br], [tl, bl]][p.rot];
    return (front[0] && front[1]) || this.lastRotation.kick === 4 ? 'full' : 'mini';
  }

  // Lock out (from agent-1): a piece that settles entirely inside the hidden
  // rows never becomes visible, and the guideline calls that game over too.
  // Full rows are not removed here: they are handed to the flash timer and
  // collapse in finishClear() once it expires.
  lock() {
    const spin = this.tspinKind();
    const cells = pieceCells(this.piece);
    lockPiece(this.board, this.piece);
    this.piece = null;
    if (cells.every(([, y]) => y < HIDDEN_ROWS)) {
      this.over = true;
      return;
    }
    const rows = fullRows(this.board);
    if (rows.length === 0) {
      this.combo = -1;
      // A T-spin that clears nothing still scores, and does not break b2b.
      if (spin) this.award(0, spin);
      this.spawn();
      return;
    }
    this.clearing = { rows, spin, acc: 0 };
  }

  // Guideline scoring: base per line count x level; T-spins use their own
  // table; a "difficult" clear (tetris or T-spin with lines) after another
  // pays 1.5x; every consecutive clearing lock adds 50 x combo x level.
  award(n, spin) {
    let points, label;
    if (spin === 'full') {
      points = TSPIN_SCORE[n];
      label = 'T-spin ' + ['', 'Single', 'Double', 'Triple'][n];
    } else if (spin === 'mini') {
      points = TSPIN_MINI_SCORE[Math.min(n, 2)];
      label = 'Mini T-spin ' + ['', 'Single', 'Double'][Math.min(n, 2)];
    } else {
      points = CLEAR_SCORE[n];
      label = ['', 'Single', 'Double', 'Triple', 'Tetris'][n];
    }
    points *= this.level;
    if (n > 0) {
      const difficult = n === 4 || spin !== null;
      if (difficult && this.b2b) { points = Math.floor(points * 1.5); label = 'B2B ' + label; }
      this.b2b = difficult;
      this.combo++;
      if (this.combo > 0) {
        points += COMBO_SCORE * this.combo * this.level;
        label += ' x' + (this.combo + 1);
      }
      this.lines += n;
      this.level = 1 + Math.floor(this.lines / LINES_PER_LEVEL);
    }
    this.score += points;
    this.lastClear = { label: label.trim(), points, at: this.clock };
  }

  finishClear() {
    const { rows, spin } = this.clearing;
    removeRows(this.board, rows);
    this.clearing = null;
    this.award(rows.length, spin);
    this.spawn();
  }

  update(dt) {
    if (this.over) return;
    this.clock += dt;

    if (this.clearing) {
      this.clearing.acc += dt;
      if (this.clearing.acc >= CLEAR_FLASH_MS) this.finishClear();
      return;
    }
    if (!this.piece) return;

    this.gravityAcc += dt;
    const base = gravityMs(this.level);
    const interval = this.softDropping ? Math.min(base, base / SOFT_DROP_FACTOR) : base;
    while (this.gravityAcc >= interval && this.piece) {
      this.gravityAcc -= interval;
      if (this.tryMove(0, 1)) {
        this.lastRotation = null;
        if (this.softDropping) this.score += 1;
        if (this.piece.y > this.lowestY) {
          this.lowestY = this.piece.y;
          this.lockResets = 0;
        }
      }
    }

    // Lock delay: once the piece is resting, give it a moment before it
    // settles. The accumulator resets whenever the piece is airborne again.
    if (this.piece && this.grounded()) {
      this.lockAcc += dt;
      if (this.lockAcc >= LOCK_DELAY_MS) this.lock();
    } else {
      this.lockAcc = 0;
    }
  }
}

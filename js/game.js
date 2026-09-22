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
const LINES_PER_LEVEL = 10;

// Guideline scoring, all multiplied by level at award time.
const SCORE = {
  lines: [0, 100, 300, 500, 800],
  tspin: [400, 800, 1200, 1600],
  mini:  [100, 200, 400],
  perfect: [0, 800, 1200, 1800, 2000],
  combo: 50,
  b2b: 1.5,
};

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
    this.b2b = false;   // last line clear was a tetris or T-spin
    this.combo = -1;    // consecutive locks that cleared lines, -1 = none
    this.lastClear = null; // { label, points } of the most recent scoring lock
    this.gravityAcc = 0;
    this.clock = 0;     // ms since reset; timestamps lastClear for the HUD
    this.active = null;
    this.spawn();
  }

  spawn() {
    const piece = this.bag.next();
    // SRS spawn: box top-left at column 3 (4 for O), two rows above the
    // skyline, then an immediate step down if that is free. That leaves two
    // more hidden rows above for kicks to use.
    const x = piece.name === 'O' ? 4 : 3;
    const y = HIDDEN_ROWS - 2;
    const p = {
      piece, rot: 0, x, y,
      lockAcc: 0, lockResets: 0, lowestY: y,
      spun: false, // last successful action was a rotation (T-spin rule)
      kick: 0,     // index of the kick test that landed that rotation
    };
    this.active = p;
    if (!this.board.fits(piece, 0, x, y)) {
      this.over = true; // block out
      return;
    }
    if (this.board.fits(piece, 0, x, y + 1)) p.y = p.lowestY = y + 1;
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
    if (ok) {
      this.active.spun = false;
      this.noteMoved();
    }
    return ok;
  }

  // dir is +1 clockwise, -1 counter-clockwise. Walk the SRS kick list for
  // this (from, to) pair; the first offset that fits wins. Kick dy is
  // negated because the tables are written with +y up.
  rotate(dir) {
    if (this.over) return false;
    const a = this.active;
    const to = (a.rot + dir + 4) % 4;
    const kicks = kicksFor(a.piece, a.rot, to);
    for (let i = 0; i < kicks.length; i++) {
      const nx = a.x + kicks[i][0];
      const ny = a.y - kicks[i][1];
      if (this.board.fits(a.piece, to, nx, ny)) {
        a.rot = to;
        a.x = nx;
        a.y = ny;
        a.spun = true;
        a.kick = i;
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
    if (rows > 0) this.active.spun = false;
    this.score += rows * 2;
    this.lock();
  }

  // 3-corner rule (shape taken from agent-5): a T whose last action was a
  // rotation and has 3+ solid diagonals around its centre was spun in.
  // 'full' if both corners on the side the T points to are solid, or the
  // rotation landed on kick test 5; otherwise 'mini'. null if not a T-spin.
  tspinKind() {
    const a = this.active;
    if (a.piece.name !== 'T' || !a.spun) return null;
    const b = this.board;
    const cx = a.x + 1, cy = a.y + 1; // the T's centre is box cell (1,1)
    const tl = b.solidOrWall(cx - 1, cy - 1), tr = b.solidOrWall(cx + 1, cy - 1);
    const bl = b.solidOrWall(cx - 1, cy + 1), br = b.solidOrWall(cx + 1, cy + 1);
    if (tl + tr + bl + br < 3) return null;
    const front = [[tl, tr], [tr, br], [bl, br], [tl, bl]][a.rot];
    return (front[0] && front[1]) || a.kick === 4 ? 'full' : 'mini';
  }

  // Award points for a lock that cleared n rows with the given spin kind.
  scoreLock(n, spin) {
    const level = this.level;
    let points;
    let label;
    const names = ['', 'SINGLE', 'DOUBLE', 'TRIPLE', 'TETRIS'];
    if (spin === 'full') {
      points = SCORE.tspin[n];
      label = 'T-SPIN ' + (n ? names[n] : '');
    } else if (spin === 'mini') {
      points = SCORE.mini[Math.min(n, 2)];
      label = 'MINI T-SPIN ' + (n ? names[n] : '');
    } else {
      points = SCORE.lines[n];
      label = names[n];
    }
    points *= level;

    if (n > 0) {
      const difficult = n === 4 || spin !== null;
      if (difficult && this.b2b) {
        points = Math.floor(points * SCORE.b2b);
        label = 'B2B ' + label;
      }
      this.b2b = difficult;

      this.combo++;
      if (this.combo > 0) {
        points += SCORE.combo * this.combo * level;
        label += ' COMBO ' + this.combo;
      }

      if (this.board.isEmpty()) {
        points += SCORE.perfect[n] * level;
        label = 'PERFECT CLEAR ' + label;
      }

      this.lines += n;
      this.level = 1 + Math.floor(this.lines / LINES_PER_LEVEL);
    } else {
      this.combo = -1;
    }

    this.score += points;
    if (points > 0) this.lastClear = { label: label.trim(), points, at: this.clock };
  }

  lock() {
    const a = this.active;
    const spin = this.tspinKind();
    const visible = this.board.merge(a.piece, a.rot, a.x, a.y);
    if (!visible) {
      this.over = true; // lock out
      return;
    }
    const rows = this.board.fullRows();
    this.board.clearRows(rows);
    this.scoreLock(rows.length, spin);
    this.spawn();
  }

  // Advance the simulation by dt milliseconds.
  update(dt) {
    if (this.over) return;
    this.clock += dt;
    const a = this.active;

    let interval = gravityMs(this.level);
    if (this.soft) interval /= SOFT_DROP_MULT;
    this.gravityAcc += dt;
    while (this.gravityAcc >= interval) {
      this.gravityAcc -= interval;
      if (!this.tryMove(0, 1)) break; // resting: lock delay below handles it
      a.spun = false;
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

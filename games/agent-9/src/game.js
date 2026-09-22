// Game state and rules. No DOM, no canvas: render.js reads this, input.js
// drives it. All timing is in milliseconds accumulated from the caller's dt,
// so gravity, lock delay and clear animation share one clock.
(function (root) {
  'use strict';

  const P = root.Pieces || require('./pieces.js').Pieces;
  const B = root.BoardModule || require('./board.js').BoardModule;
  const { COLS, HIDDEN, TOTAL } = B;

  const LOCK_DELAY_MS = 500;
  const LOCK_RESET_CAP = 15;   // guideline "move reset" limit per piece
  const CLEAR_ANIM_MS = 220;
  const SOFT_DROP_FACTOR = 20; // soft drop = 20x gravity
  const LINES_PER_LEVEL = 10;
  const TOAST_MS = 1400;
  const QUEUE_LEN = 5;
  const TRAIL_MS = 120;        // hard-drop streak lifetime

  // Guideline scoring, all multiplied by level.
  const SCORE = {
    clear:   [0, 100, 300, 500, 800],
    tspin:   [400, 800, 1200, 1600],
    mini:    [100, 200, 400],
    perfect: [0, 800, 1200, 1800, 2000],
    combo: 50,
    softDrop: 1,
    hardDrop: 2,
    b2b: 1.5,
  };
  const CLEAR_NAMES = ['', 'SINGLE', 'DOUBLE', 'TRIPLE', 'TETRIS'];

  // Guideline gravity curve: seconds per row at a given level.
  // Measured: level 1 = 1000ms, 5 = 355ms, 10 = 64ms, 15 = 7ms, 20 = 0.5ms.
  // It is steep on purpose; past level 15 it is effectively 20G and the
  // game is played on lock delay alone.
  function gravityMsForLevel(level) {
    const l = Math.max(1, level) - 1;
    return Math.pow(0.8 - l * 0.007, l) * 1000;
  }

  class Game {
    // opts.seed replays a bag sequence; opts.bag (seed -> bag) swaps the
    // randomizer entirely, which the tests use to deal fixed pieces.
    constructor(opts) {
      opts = opts || {};
      this.board = new B.Board();
      this.makeBag = opts.bag || (seed => P.Bag(P.mulberry32(seed)));
      this.reset(opts.seed);
    }

    // New game. `seed` replays a specific bag sequence; omitted, a fresh
    // seed is drawn and exposed as this.seed for the HUD and URL.
    reset(seed) {
      if (seed === undefined) seed = (Date.now() ^ (Math.random() * 0xffffffff)) >>> 0;
      this.seed = seed >>> 0;
      this.bag = this.makeBag(this.seed);
      this.board.reset();
      this.piece = null;        // { type, rot, x, y }
      this.score = 0;
      this.lines = 0;
      this.level = 1;
      this.queue = [];          // upcoming piece types, QUEUE_LEN long
      this.hold = null;         // parked piece type
      this.holdUsed = false;    // hold is once per piece
      this.combo = -1;          // consecutive line-clearing locks; -1 = none
      this.b2b = false;         // last clear was a tetris or T-spin
      this.toast = null;        // { text, t } naming the last clear
      this.trail = null;        // { cols: [[x, fromY, toY]], t } after a hard drop
      this.gravityAcc = 0;
      this.lockTimer = 0;
      this.lockResets = 0;
      this.lowestY = 0;
      this.grounded = false;
      this.softDropping = false;
      this.spun = false;        // last successful action was a rotation
      this.kickIndex = 0;       // which kick test placed it (4 = the 5th)
      this.clearing = null;     // { rows, t } while the clear animation runs
      this.over = false;
      this.paused = false;
      this.spawn();
    }

    setPaused(on) {
      if (this.over) return;
      this.paused = !!on;
      if (this.paused) this.softDropping = false;
    }

    // ---- pieces ---------------------------------------------------------

    shape() {
      return P.PIECES[this.piece.type].states[this.piece.rot];
    }

    takeNext() {
      while (this.queue.length <= QUEUE_LEN) this.queue.push(this.bag.next());
      return this.queue.shift();
    }

    // Spawn the next queued piece (or `type` if given, for hold) fully
    // inside the hidden rows, centred, then apply one immediate drop so the
    // piece is visible on its first frame (guideline spawn). If even the
    // hidden position collides, that is a block out: game over.
    spawn(type) {
      if (!type) {
        type = this.takeNext();
        this.holdUsed = false;
      }
      const def = P.PIECES[type];
      const maxDy = Math.max(...def.states[0].map(c => c[1]));
      const piece = {
        type,
        rot: 0,
        x: Math.floor((COLS - def.size) / 2),
        y: HIDDEN - 1 - maxDy,
      };
      this.piece = piece;
      if (!this.board.fits(def.states[0], piece.x, piece.y)) {
        this.over = true;
        return;
      }
      if (this.board.fits(def.states[0], piece.x, piece.y + 1)) piece.y++;
      this.gravityAcc = 0;
      this.lockTimer = 0;
      this.lockResets = 0;
      this.lowestY = piece.y;
      this.grounded = false;
      this.spun = false;
    }

    gravityMs() {
      return gravityMsForLevel(this.level);
    }

    isGrounded() {
      const p = this.piece;
      return !this.board.fits(this.shape(), p.x, p.y + 1);
    }

    // A successful move or rotation while resting restarts the lock delay,
    // but only LOCK_RESET_CAP times per piece so it cannot hover forever.
    // The cap is refilled whenever the piece reaches a new lowest row.
    touched() {
      const p = this.piece;
      if (p.y > this.lowestY) {
        this.lowestY = p.y;
        this.lockResets = 0;
      }
      if (this.isGrounded() && this.lockResets < LOCK_RESET_CAP) {
        this.lockTimer = 0;
        this.lockResets++;
      }
    }

    // ---- player actions -----------------------------------------------

    // True while the player may act on a piece: not paused, not over, not
    // mid line-clear. Every player action checks this one function.
    active() {
      return !!this.piece && !this.over && !this.paused && !this.clearing;
    }

    move(dx) {
      if (!this.active()) return false;
      const p = this.piece;
      if (!this.board.fits(this.shape(), p.x + dx, p.y)) return false;
      p.x += dx;
      this.spun = false;
      this.touched();
      return true;
    }

    // dir = +1 clockwise, -1 counter-clockwise. Walks the SRS kick list for
    // this (from, to) pair and takes the first offset that fits.
    rotate(dir) {
      if (!this.active()) return false;
      const p = this.piece;
      const from = p.rot;
      const to = (from + dir + 4) % 4;
      const shape = P.PIECES[p.type].states[to];
      const kicks = P.kicksFor(p.type, from, to);
      for (let i = 0; i < kicks.length; i++) {
        const nx = p.x + kicks[i][0];
        const ny = p.y + kicks[i][1];
        if (this.board.fits(shape, nx, ny)) {
          p.x = nx;
          p.y = ny;
          p.rot = to;
          this.spun = true;
          // The fifth-kick T-spin upgrade is defined for the 90-degree
          // tables; a 180 leaves grading to the corner rule (agent-6).
          this.kickIndex = dir === 2 ? 0 : i;
          this.touched();
          return true;
        }
      }
      return false;
    }

    softDrop(on) {
      this.softDropping = !!on;
    }

    // Park the active piece and bring out the held one (or the next piece
    // if nothing is held). Once per piece: allowed again after a lock.
    holdPiece() {
      if (!this.active() || this.holdUsed) return false;
      const parked = this.hold;
      this.hold = this.piece.type;
      this.spawn(parked || this.takeNext());
      this.holdUsed = true;
      return true;
    }

    // 0..1 fraction of the lock delay used up, 0 while the piece can fall.
    lockProgress() {
      if (!this.active() || !this.isGrounded()) return 0;
      return Math.min(this.lockTimer / LOCK_DELAY_MS, 1);
    }

    // Drop to the ghost position and lock immediately. Returns rows dropped.
    hardDrop() {
      if (!this.active()) return 0;
      const rows = this.ghostY() - this.piece.y;
      if (rows > 0) {
        // One streak per column, from the piece's topmost cell there down
        // to where that cell lands.
        const top = {};
        for (const [dx, dy] of this.shape()) {
          const x = this.piece.x + dx;
          if (top[x] === undefined || dy < top[x]) top[x] = dy;
        }
        const cols = Object.keys(top).map(x => [Number(x), this.piece.y + top[x], this.piece.y + rows + top[x]]);
        this.trail = { cols, t: 0 };
        this.spun = false;
      }
      this.piece.y += rows;
      this.score += rows * SCORE.hardDrop;
      this.lockPiece();   // replaces this.piece with the next spawn
      return rows;
    }

    // Row the active piece would land on if dropped now.
    ghostY() {
      const p = this.piece;
      const shape = this.shape();
      let y = p.y;
      while (this.board.fits(shape, p.x, y + 1)) y++;
      return y;
    }

    // Try to move the active piece by one row down. Returns false if it is
    // resting on something.
    fall() {
      const p = this.piece;
      if (this.board.fits(this.shape(), p.x, p.y + 1)) {
        p.y++;
        this.spun = false;
        if (p.y > this.lowestY) { this.lowestY = p.y; this.lockResets = 0; }
        return true;
      }
      return false;
    }

    // ---- T-spins --------------------------------------------------------

    // Three-corner rule (taken from agent-5): a T whose last successful
    // action was a rotation and has at least three of the four diagonals
    // around its centre solid was spun in. It is a full T-spin if both
    // corners on the side the T points to are solid, or it arrived via the
    // fifth kick test; otherwise a mini. Returns null, 'mini' or 'full'.
    // Walls, floor and the ceiling all count as solid, matching fits().
    tspinKind() {
      const p = this.piece;
      if (p.type !== 'T' || !this.spun) return null;
      const solid = (x, y) =>
        x < 0 || x >= COLS || y < 0 || y >= TOTAL || this.board.get(x, y) !== 0;
      const cx = p.x + 1, cy = p.y + 1;
      const tl = solid(cx - 1, cy - 1), tr = solid(cx + 1, cy - 1);
      const bl = solid(cx - 1, cy + 1), br = solid(cx + 1, cy + 1);
      if (tl + tr + bl + br < 3) return null;
      const front = [[tl, tr], [tr, br], [bl, br], [tl, bl]][p.rot];
      return (front[0] && front[1]) || this.kickIndex === 4 ? 'full' : 'mini';
    }

    // ---- locking, scoring, clearing -----------------------------------

    lockPiece() {
      const p = this.piece;
      const tspin = this.tspinKind();
      this.board.lock(this.shape(), p.x, p.y, P.PIECES[p.type].id);
      if (this.board.anyHiddenOccupied() && !this.anyVisible()) {
        // Lock out: the piece settled entirely above the visible field.
        this.over = true;
        return;
      }
      const rows = this.board.fullRows();
      this.award(rows.length, tspin, rows.length > 0 && this.isPerfectClear(rows));
      if (rows.length) {
        this.clearing = { rows, t: 0 };
        this.piece = null;
      } else {
        this.spawn();
      }
    }

    anyVisible() {
      const p = this.piece;
      return this.shape().some(c => p.y + c[1] >= HIDDEN);
    }

    // Perfect clear: once `rows` are gone nothing is left on the board.
    isPerfectClear(rows) {
      for (let y = 0; y < TOTAL; y++) {
        if (rows.includes(y)) continue;
        for (let x = 0; x < COLS; x++) if (this.board.get(x, y)) return false;
      }
      return true;
    }

    award(n, tspin, perfect) {
      let points;
      if (tspin === 'full') points = SCORE.tspin[n];
      else if (tspin === 'mini') points = SCORE.mini[Math.min(n, 2)];
      else points = SCORE.clear[n];
      points *= this.level;

      const parts = [];
      if (tspin) parts.push(tspin === 'mini' ? 'T-SPIN MINI' : 'T-SPIN');
      if (n) parts.push(CLEAR_NAMES[n]);

      if (n > 0) {
        const difficult = n === 4 || tspin !== null;
        if (difficult && this.b2b) {
          points = Math.floor(points * SCORE.b2b);
          parts.unshift('B2B');
        }
        this.b2b = difficult;
        this.combo++;
        if (this.combo > 0) {
          points += SCORE.combo * this.combo * this.level;
          parts.push('COMBO x' + this.combo);
        }
        if (perfect) {
          points += SCORE.perfect[n] * this.level;
          parts.push('PERFECT CLEAR');
        }
        this.lines += n;
        this.level = 1 + Math.floor(this.lines / LINES_PER_LEVEL);
      } else {
        this.combo = -1;
      }

      this.score += points;
      if (parts.length) this.toast = { text: parts.join('  '), t: 0 };
    }

    finishClear() {
      this.board.clearRows(this.clearing.rows);
      this.clearing = null;
      this.spawn();
    }

    // ---- the tick -----------------------------------------------------

    update(dt) {
      if (this.toast) {
        this.toast.t += dt;
        if (this.toast.t >= TOAST_MS) this.toast = null;
      }
      if (this.trail) {
        this.trail.t += dt;
        if (this.trail.t >= TRAIL_MS) this.trail = null;
      }
      if (this.over || this.paused) return;

      if (this.clearing) {
        this.clearing.t += dt;
        if (this.clearing.t >= CLEAR_ANIM_MS) this.finishClear();
        return;
      }

      this.gravityAcc += dt;
      let step = this.gravityMs();
      if (this.softDropping) step /= SOFT_DROP_FACTOR;
      while (this.gravityAcc >= step) {
        this.gravityAcc -= step;
        if (!this.fall()) { this.gravityAcc = 0; break; }
        if (this.softDropping) this.score += SCORE.softDrop;
      }

      // Lock delay: once the piece cannot fall, it has LOCK_DELAY_MS before
      // it settles. A move or rotate while grounded resets it via touched().
      if (this.isGrounded()) {
        this.grounded = true;
        this.lockTimer += dt;
        if (this.lockTimer >= LOCK_DELAY_MS) this.lockPiece();
      } else {
        this.grounded = false;
        this.lockTimer = 0;
      }
    }
  }

  root.GameModule = {
    Game, gravityMsForLevel, SCORE,
    LOCK_DELAY_MS, LOCK_RESET_CAP, CLEAR_ANIM_MS, TOAST_MS, TRAIL_MS, LINES_PER_LEVEL, QUEUE_LEN,
  };
})(typeof module !== 'undefined' ? module.exports : window);

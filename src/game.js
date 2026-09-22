// Game state and rules. No DOM, no canvas: render.js reads this, input.js
// drives it. All timing is in milliseconds accumulated from the caller's dt,
// so gravity, lock delay and clear animation share one clock.
(function (root) {
  'use strict';

  const P = root.Pieces || require('./pieces.js').Pieces;
  const B = root.BoardModule || require('./board.js').BoardModule;
  const { COLS, HIDDEN } = B;

  const LOCK_DELAY_MS = 500;
  const LOCK_RESET_CAP = 15;   // guideline "move reset" limit per piece
  const CLEAR_ANIM_MS = 220;
  const SOFT_DROP_FACTOR = 20; // soft drop = 20x gravity

  // Guideline gravity curve: seconds per row at a given level.
  // Measured: level 1 = 1000ms, 5 = 355ms, 10 = 64ms, 15 = 7ms, 20 = 0.5ms.
  // It is steep on purpose; past level 15 it is effectively 20G and the
  // game is played on lock delay alone.
  function gravityMsForLevel(level) {
    const l = Math.max(1, level) - 1;
    return Math.pow(0.8 - l * 0.007, l) * 1000;
  }

  class Game {
    constructor(opts) {
      opts = opts || {};
      this.board = new B.Board();
      this.bag = P.Bag(opts.random);
      this.reset();
    }

    reset() {
      this.board.reset();
      this.piece = null;        // { type, rot, x, y }
      this.level = 1;
      this.gravityAcc = 0;
      this.lockTimer = 0;
      this.lockResets = 0;
      this.lowestY = 0;
      this.grounded = false;
      this.softDropping = false;
      this.clearing = null;     // { rows, t } while the clear animation runs
      this.over = false;
      this.spawn();
    }

    // ---- pieces ---------------------------------------------------------

    shape() {
      return P.PIECES[this.piece.type].states[this.piece.rot];
    }

    // Spawn fully inside the hidden rows, centred, then apply one immediate
    // drop so the piece is visible on its first frame (guideline spawn).
    // If even the hidden position collides, that is a block out: game over.
    spawn() {
      const type = this.bag.next();
      const def = P.PIECES[type];
      const maxDy = Math.max(...def.states[0].map(c => c[1]));
      const piece = {
        type,
        rot: 0,
        x: Math.floor((COLS - def.size) / 2),
        y: HIDDEN - 1 - maxDy,
      };
      if (!this.board.fits(def.states[0], piece.x, piece.y)) {
        this.piece = piece;
        this.over = true;
        return;
      }
      this.piece = piece;
      if (this.board.fits(def.states[0], piece.x, piece.y + 1)) piece.y++;
      this.gravityAcc = 0;
      this.lockTimer = 0;
      this.lockResets = 0;
      this.lowestY = piece.y;
      this.grounded = false;
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

    move(dx) {
      if (!this.piece || this.over || this.clearing) return false;
      const p = this.piece;
      if (!this.board.fits(this.shape(), p.x + dx, p.y)) return false;
      p.x += dx;
      this.touched();
      return true;
    }

    // dir = +1 clockwise, -1 counter-clockwise. Walks the SRS kick list for
    // this (from, to) pair and takes the first offset that fits.
    rotate(dir) {
      if (!this.piece || this.over || this.clearing) return false;
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
          this.touched();
          return true;
        }
      }
      return false;
    }

    softDrop(on) {
      this.softDropping = !!on;
    }

    // Drop to the ghost position and lock immediately. Returns rows dropped.
    hardDrop() {
      if (!this.piece || this.over || this.clearing) return 0;
      const rows = this.ghostY() - this.piece.y;
      this.piece.y += rows;
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
        return true;
      }
      return false;
    }

    // ---- locking and clearing -----------------------------------------

    lockPiece() {
      const p = this.piece;
      this.board.lock(this.shape(), p.x, p.y, P.PIECES[p.type].id);
      if (this.board.anyHiddenOccupied()) {
        // Lock out: the piece settled entirely above the visible field.
        this.over = true;
        return;
      }
      const rows = this.board.fullRows();
      if (rows.length) {
        this.clearing = { rows, t: 0 };
        this.piece = null;
      } else {
        this.spawn();
      }
    }

    finishClear() {
      this.board.clearRows(this.clearing.rows);
      this.clearing = null;
      this.spawn();
    }

    // ---- the tick -----------------------------------------------------

    update(dt) {
      if (this.over) return;

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
        if (this.piece.y > this.lowestY) { this.lowestY = this.piece.y; this.lockResets = 0; }
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

  root.GameModule = { Game, gravityMsForLevel, LOCK_DELAY_MS, LOCK_RESET_CAP, CLEAR_ANIM_MS };
})(typeof module !== 'undefined' ? module.exports : window);

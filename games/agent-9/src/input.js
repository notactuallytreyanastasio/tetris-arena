// Keyboard input with DAS/ARR.
//
// Movement keys are polled from update(dt), not acted on in keydown, so key
// repeat is ours: DAS (delayed auto shift) is the wait before repeating,
// ARR (auto repeat rate) the interval after that, both in ms accumulated
// from the same dt as gravity, so the feel is identical at 60 and 120 Hz.
// Browser key repeat (e.repeat) is ignored entirely.
//
// Rotation, hard drop, hold, pause and restart are one-shot on keydown.
//
// Touch: pointer events on the field. Drag sideways moves one cell per
// cell-width dragged, drag down soft-drops, a quick flick down hard-drops,
// a tap rotates clockwise. Tapping the hold panel holds.
(function (root) {
  'use strict';

  const DAS_MS = 170;
  const ARR_MS = 30;
  const TAP_MS = 250;       // shorter than this with little movement = tap
  const FLICK_PX_MS = 0.6;  // downward speed that counts as a hard drop

  const BINDINGS = {
    ArrowLeft: 'left',
    ArrowRight: 'right',
    ArrowDown: 'soft',
    ArrowUp: 'cw',
    KeyX: 'cw',
    KeyZ: 'ccw',
    ControlLeft: 'ccw',
    KeyA: 'flip',
    Space: 'hard',
    KeyC: 'hold',
    ShiftLeft: 'hold',
    ShiftRight: 'hold',
    KeyP: 'pause',
    Escape: 'pause',
    KeyR: 'restart',
    Enter: 'restart',
  };

  class Input {
    constructor(game, hooks, opts) {
      this.game = game;
      this.hooks = hooks || {};
      opts = opts || {};
      this.das = opts.das != null ? opts.das : DAS_MS;
      this.arr = opts.arr != null ? opts.arr : ARR_MS;
      this.held = new Set();
      this.dir = 0;        // horizontal direction currently repeating
      this.dasTimer = 0;
      this.arrTimer = 0;
      this.onKeyDown = this.onKeyDown.bind(this);
      this.onKeyUp = this.onKeyUp.bind(this);
    }

    attach(target) {
      target.addEventListener('keydown', this.onKeyDown);
      target.addEventListener('keyup', this.onKeyUp);
      window.addEventListener('blur', () => this.releaseAll());
    }

    releaseAll() {
      this.held.clear();
      this.dir = 0;
      this.game.softDrop(false);
    }

    onKeyDown(e) {
      const action = BINDINGS[e.code];
      if (!action) return;
      e.preventDefault();
      if (e.repeat) return;
      this.held.add(action);

      switch (action) {
        case 'left':
        case 'right':
          this.startShift(action === 'left' ? -1 : 1);
          break;
        case 'soft':
          this.game.softDrop(true);
          break;
        case 'cw':
          this.game.rotate(1);
          break;
        case 'ccw':
          this.game.rotate(-1);
          break;
        case 'flip':
          this.game.rotate(2);
          break;
        case 'hold':
          this.game.holdPiece();
          break;
        case 'hard':
          this.game.hardDrop();
          break;
        default:
          if (this.hooks[action]) this.hooks[action](e);
      }
    }

    onKeyUp(e) {
      const action = BINDINGS[e.code];
      if (!action) return;
      e.preventDefault();
      this.held.delete(action);
      if (action === 'soft') this.game.softDrop(false);
      if (action === 'left' || action === 'right') {
        const released = action === 'left' ? -1 : 1;
        if (this.dir === released) {
          // Fall back to the other direction if it is still held; its DAS
          // restarts, which is what most guideline games do.
          const other = this.held.has('left') ? -1 : this.held.has('right') ? 1 : 0;
          if (other) this.startShift(other); else this.dir = 0;
        }
      }
    }

    startShift(dir) {
      this.dir = dir;
      this.dasTimer = 0;
      this.arrTimer = 0;
      this.game.move(dir);
    }

    update(dt) {
      if (!this.dir) return;
      this.dasTimer += dt;
      if (this.dasTimer < this.das) return;
      if (this.arr === 0) {
        // ARR 0 (taken from agent-8): once DAS elapses, go to the wall.
        while (this.game.move(this.dir)) { /* until blocked */ }
        return;
      }
      this.arrTimer += dt;
      while (this.arrTimer >= this.arr) {
        this.arrTimer -= this.arr;
        if (!this.game.move(this.dir)) { this.arrTimer = 0; break; }
      }
    }

    // ---- touch ---------------------------------------------------------

    attachTouch(field, cellPx, holdPanel) {
      const game = this.game;
      let t = null;   // active gesture
      field.style.touchAction = 'none';
      field.addEventListener('pointerdown', e => {
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        field.setPointerCapture(e.pointerId);
        t = { id: e.pointerId, x0: e.clientX, y0: e.clientY, t0: performance.now(),
              lastX: e.clientX, lastY: e.clientY, movedX: 0, movedY: 0, soft: false };
        e.preventDefault();
      });
      field.addEventListener('pointermove', e => {
        if (!t || e.pointerId !== t.id) return;
        // one cell per cell-width dragged, in either direction
        const dx = e.clientX - t.x0;
        const cells = Math.trunc(dx / cellPx);
        while (t.movedX < cells) { game.move(1); t.movedX++; }
        while (t.movedX > cells) { game.move(-1); t.movedX--; }
        // dragging down a cell or more turns soft drop on for the gesture
        const dy = e.clientY - t.y0;
        if (!t.soft && dy > cellPx && Math.abs(dy) > Math.abs(dx)) { t.soft = true; game.softDrop(true); }
        t.lastX = e.clientX; t.lastY = e.clientY;
      });
      const end = e => {
        if (!t || e.pointerId !== t.id) return;
        const dt = performance.now() - t.t0;
        const dx = e.clientX - t.x0, dy = e.clientY - t.y0;
        if (t.soft) game.softDrop(false);
        if (dt < TAP_MS && Math.abs(dx) < cellPx / 2 && Math.abs(dy) < cellPx / 2) {
          if (game.over || game.paused) { if (this.hooks.tap) this.hooks.tap(); }
          else game.rotate(1);
        } else if (dy > cellPx * 2 && dy / dt > FLICK_PX_MS && Math.abs(dy) > Math.abs(dx)) {
          game.hardDrop();
        }
        t = null;
      };
      field.addEventListener('pointerup', end);
      field.addEventListener('pointercancel', end);
      if (holdPanel) {
        holdPanel.addEventListener('pointerdown', e => { e.preventDefault(); game.holdPiece(); });
      }
    }
  }

  root.Input = { Input, DAS_MS, ARR_MS, BINDINGS };
})(window);

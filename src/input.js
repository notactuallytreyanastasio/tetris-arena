// Keyboard input with DAS/ARR.
//
// Movement keys are polled from update(dt), not acted on in keydown, so key
// repeat is ours: DAS (delayed auto shift) is the wait before repeating,
// ARR (auto repeat rate) the interval after that, both in ms accumulated
// from the same dt as gravity, so the feel is identical at 60 and 120 Hz.
// Browser key repeat (e.repeat) is ignored entirely.
//
// Rotation, hard drop, hold, pause and restart are one-shot on keydown.
(function (root) {
  'use strict';

  const DAS_MS = 170;
  const ARR_MS = 30;

  const BINDINGS = {
    ArrowLeft: 'left',
    ArrowRight: 'right',
    ArrowDown: 'soft',
    ArrowUp: 'cw',
    KeyX: 'cw',
    KeyZ: 'ccw',
    ControlLeft: 'ccw',
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
    constructor(game, hooks) {
      this.game = game;
      this.hooks = hooks || {};
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
        case 'hard':
          this.game.hardDrop();
          break;
        default:
          if (this.hooks[action]) this.hooks[action]();
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
      if (this.dasTimer < DAS_MS) return;
      this.arrTimer += dt;
      while (this.arrTimer >= ARR_MS) {
        this.arrTimer -= ARR_MS;
        if (!this.game.move(this.dir)) { this.arrTimer = 0; break; }
      }
    }
  }

  root.Input = { Input, DAS_MS, ARR_MS, BINDINGS };
})(window);

// Keyboard input. Keeps held-key state and runs auto-shift (DAS/ARR) on the
// game clock, so left/right repeat feels identical on every machine instead
// of following the OS key-repeat setting. Only calls into Game methods, so
// game.js stays free of DOM.
//
// Pattern taken from agent-3's held-key model (tetris.js): keydown/keyup feed
// state, an accumulator waits DAS then repeats every ARR, and releasing one
// direction while the other is still held resumes the other.

const DAS = 160; // ms a direction is held before it starts auto-repeating
const ARR = 30;  // ms between auto-repeat shifts once DAS has elapsed; 0 = to the wall

class Input {
  constructor(game) {
    this.game = game;
    this.left = false;
    this.right = false;
    this.down = false;
    this.dir = 0;        // -1, 0, +1: direction currently auto-shifting
    this.acc = 0;        // ms towards the next shift
    this.charged = false; // DAS elapsed; now repeating at ARR
    window.addEventListener('keydown', (e) => this.onKeyDown(e));
    window.addEventListener('keyup', (e) => this.onKeyUp(e));
    // A keyup that happens while the window is not focused is never
    // delivered, so a held direction would auto-repeat forever on return.
    // Pause and drop every held key instead (agent-5, agent-6).
    window.addEventListener('blur', () => this.pause(true));
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.pause(true);
    });
  }

  releaseAll() {
    this.left = this.right = this.down = false;
    this.dir = 0;
    this.game.softDrop(false);
  }

  pause(on) {
    if (this.game.over || this.game.paused === on) return;
    this.game.setPaused(on);
    if (on) this.releaseAll();
  }

  startShift(dir) {
    this.dir = dir;
    this.acc = 0;
    this.charged = false;
    this.game.move(dir); // first shift is immediate
  }

  onKeyDown(e) {
    if (e.repeat) return;
    const g = this.game;
    switch (e.code) {
      case 'KeyP': case 'Escape': this.pause(!g.paused); break;
      case 'ArrowLeft':  this.left = true;  this.startShift(-1); break;
      case 'ArrowRight': this.right = true; this.startShift(1); break;
      case 'ArrowDown':  this.down = true; g.softDrop(true); break;
      case 'ArrowUp': case 'KeyX': g.rotate(1); break;
      case 'KeyZ': case 'ControlLeft': g.rotate(-1); break;
      case 'KeyA': g.rotate(2); break;
      case 'KeyC': case 'ShiftLeft': case 'ShiftRight': g.swapHold(); break;
      case 'Space': g.hardDrop(); break;
      // R restarts on a new seed; Shift+R replays the same one (agent-1).
      case 'KeyR': this.releaseAll(); g.reset(e.shiftKey ? g.seed : undefined); break;
      default: return;
    }
    e.preventDefault();
  }

  onKeyUp(e) {
    switch (e.code) {
      case 'ArrowLeft':
        this.left = false;
        if (this.right) this.startShift(1); else this.dir = 0;
        break;
      case 'ArrowRight':
        this.right = false;
        if (this.left) this.startShift(-1); else this.dir = 0;
        break;
      case 'ArrowDown':
        this.down = false;
        this.game.softDrop(false);
        break;
      default: return;
    }
    e.preventDefault();
  }

  // Advance auto-shift by dt ms. Called once per frame before game.update.
  // Runs while rows flash too, so a direction held through a clear is
  // charged when the next piece appears (agent-10 found every game lost
  // that). While there is no piece the accumulator is clamped to one ARR:
  // stay charged, do not bank repeats, or the new piece would jump four
  // cells on its first frame.
  update(dt) {
    if (this.dir === 0) return;
    this.acc += dt;
    const active = !!this.game.active;
    for (;;) {
      const threshold = this.charged ? ARR : DAS;
      if (this.acc < threshold) break;
      if (!active) {
        this.charged = true;
        this.acc = Math.min(this.acc, ARR);
        break;
      }
      this.acc -= threshold;
      this.charged = true;
      if (ARR === 0) {
        while (this.game.move(this.dir)) {}
        this.acc = 0;
        break;
      }
      if (!this.game.move(this.dir)) {
        this.acc = 0;
        break;
      }
    }
  }
}

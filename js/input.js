// Keyboard input. Keeps held-key state and runs auto-shift (DAS/ARR) on the
// game clock, so left/right repeat feels identical on every machine instead
// of following the OS key-repeat setting. Only calls into Game methods, so
// game.js stays free of DOM.
//
// Pattern taken from agent-3's held-key model (tetris.js): keydown/keyup feed
// state, an accumulator waits DAS then repeats every ARR, and releasing one
// direction while the other is still held resumes the other.

const DAS = 160; // ms a direction is held before it starts auto-repeating
const ARR = 30;  // ms between auto-repeat shifts once DAS has elapsed

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
      case 'ArrowLeft':  this.left = true;  this.startShift(-1); break;
      case 'ArrowRight': this.right = true; this.startShift(1); break;
      case 'ArrowDown':  this.down = true; g.softDrop(true); break;
      case 'ArrowUp': case 'KeyX': g.rotate(1); break;
      case 'KeyZ': case 'ControlLeft': g.rotate(-1); break;
      case 'Space': g.hardDrop(); break;
      case 'KeyR': g.reset(); break;
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
  update(dt) {
    if (this.dir === 0) return;
    this.acc += dt;
    const threshold = this.charged ? ARR : DAS;
    while (this.acc >= threshold) {
      this.acc -= threshold;
      this.charged = true;
      this.game.move(this.dir);
    }
  }
}

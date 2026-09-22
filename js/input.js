// Keyboard input with a held-key model. keydown/keyup set flags; the
// horizontal auto-shift (DAS then ARR) is advanced from the game clock by
// tick(dt), so it feels identical on every machine and can charge while a
// piece is locking.

const DAS = 150;   // ms a direction is held before auto-shift begins
const ARR = 33;    // ms between shifts once auto-shifting

class Input {
  constructor(game) {
    this.game = game;
    this.left = false;
    this.right = false;
    this.dasDir = 0;        // -1, 0, +1: direction currently auto-shifting
    this.dasAcc = 0;        // ms toward the DAS threshold, then toward next ARR
    this.charged = false;   // DAS elapsed, now repeating at ARR
    this.onKeyDown = this.onKeyDown.bind(this);
    this.onKeyUp = this.onKeyUp.bind(this);
  }

  attach(target = window) {
    target.addEventListener('keydown', this.onKeyDown);
    target.addEventListener('keyup', this.onKeyUp);
  }

  startShift(dir) {
    this.dasDir = dir;
    this.dasAcc = 0;
    this.charged = false;
    this.game.move(dir);    // first shift is immediate
  }

  stopShift() {
    // Releasing one direction while the other is still held resumes the other.
    if (this.left) this.startShift(-1);
    else if (this.right) this.startShift(1);
    else this.dasDir = 0;
  }

  tick(dt) {
    if (this.dasDir === 0) return;
    this.dasAcc += dt;
    const threshold = this.charged ? ARR : DAS;
    while (this.dasAcc >= threshold) {
      this.dasAcc -= threshold;
      this.charged = true;
      this.game.move(this.dasDir);
    }
  }

  onKeyDown(e) {
    if (e.repeat) { if (this.handles(e.code)) e.preventDefault(); return; }
    const g = this.game;
    switch (e.code) {
      case 'ArrowLeft':  this.left = true;  this.startShift(-1); break;
      case 'ArrowRight': this.right = true; this.startShift(1);  break;
      case 'ArrowDown':  g.softDrop = true; break;
      case 'ArrowUp': case 'KeyX': g.rotate(1); break;
      case 'KeyZ': g.rotate(-1); break;
      case 'Space': g.hardDrop(); break;
      case 'KeyC': case 'ShiftLeft': case 'ShiftRight': g.holdPiece(); break;
      case 'KeyR': g.reset(e.shiftKey ? g.seed : undefined); break;   // Shift+R replays the same seed
      default: return;
    }
    e.preventDefault();
  }

  onKeyUp(e) {
    switch (e.code) {
      case 'ArrowLeft':  this.left = false;  if (this.dasDir === -1) this.stopShift(); break;
      case 'ArrowRight': this.right = false; if (this.dasDir === 1) this.stopShift(); break;
      case 'ArrowDown':  this.game.softDrop = false; break;
      default: return;
    }
    e.preventDefault();
  }

  handles(code) {
    return ['ArrowLeft', 'ArrowRight', 'ArrowDown', 'ArrowUp', 'KeyX', 'KeyZ', 'Space', 'KeyR', 'KeyC', 'ShiftLeft', 'ShiftRight'].includes(code);
  }
}

if (typeof module !== 'undefined') module.exports = Input;

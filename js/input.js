// Keyboard input with a held-key model. keydown/keyup set flags; the
// horizontal auto-shift (DAS then ARR) is advanced from the game clock by
// tick(dt), so it feels identical on every machine and can charge while a
// piece is locking.

const DAS = 150;   // ms a direction is held before auto-shift begins
const ARR = 33;    // ms between shifts once auto-shifting

class Input {
  constructor(game) {
    this.game = game;
    this.held = [];         // directions currently held, oldest first; the newest wins
    this.dasDir = 0;        // -1, 0, +1: direction currently auto-shifting
    this.dasAcc = 0;        // ms toward the DAS threshold, then toward next ARR
    this.charged = false;   // DAS elapsed, now repeating at ARR
    this.onKeyDown = this.onKeyDown.bind(this);
    this.onKeyUp = this.onKeyUp.bind(this);
  }

  attach(target = window, doc = document) {
    target.addEventListener('keydown', this.onKeyDown);
    target.addEventListener('keyup', this.onKeyUp);
    // Losing focus drops every held key and pauses, so a direction held when
    // focus left does not auto-repeat into the wall when it comes back.
    const lost = () => { this.releaseAll(); this.game.setPaused(true); };
    target.addEventListener('blur', lost);
    doc.addEventListener('visibilitychange', () => { if (doc.hidden) lost(); });
  }

  press(dir) {
    this.held = this.held.filter(d => d !== dir);
    this.held.push(dir);
    this.dasDir = dir;
    this.dasAcc = 0;
    this.charged = false;
    this.game.move(dir);    // first shift is immediate
  }

  release(dir) {
    this.held = this.held.filter(d => d !== dir);
    if (this.dasDir !== dir) return;
    const older = this.held[this.held.length - 1];
    if (older === undefined) { this.dasDir = 0; return; }
    // The older key has been held longer than DAS by definition, so it
    // resumes already charged: one shift now, then ARR.
    this.dasDir = older;
    this.dasAcc = 0;
    this.charged = true;
    this.game.move(older);
  }

  releaseAll() {
    this.held = [];
    this.dasDir = 0;
    this.dasAcc = 0;
    this.charged = false;
    this.game.softDrop = false;
  }

  togglePause() {
    const g = this.game;
    if (g.over) return;
    if (!g.paused) this.releaseAll();
    g.setPaused(!g.paused);
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
      case 'ArrowLeft':  this.press(-1); break;
      case 'ArrowRight': this.press(1);  break;
      case 'ArrowDown':  if (g.accepting) g.softDrop = true; break;
      case 'KeyP': case 'Escape': this.togglePause(); break;
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
      case 'ArrowLeft':  this.release(-1); break;
      case 'ArrowRight': this.release(1);  break;
      case 'ArrowDown':  this.game.softDrop = false; break;
      default: return;
    }
    e.preventDefault();
  }

  handles(code) {
    return ['ArrowLeft', 'ArrowRight', 'ArrowDown', 'ArrowUp', 'KeyX', 'KeyZ', 'Space', 'KeyR', 'KeyC', 'ShiftLeft', 'ShiftRight', 'KeyP', 'Escape'].includes(code);
  }
}

if (typeof module !== 'undefined') module.exports = Input;

// Keyboard input with its own DAS/ARR clock, so left/right auto-shift feels
// the same on every machine instead of following the OS key-repeat setting.
//
// Held directions are a stack: the newest press wins and releasing it falls
// back to the older one (data-structure idea from agent-1, rule from
// agent-3). The hand-off keeps DAS charged (agent-6). update(dt) runs every
// frame whether or not a piece is live, so a direction held through the
// line-clear flash is already charged when the next piece appears
// (agent-10 found that every game restarted the wait there).
//
// press()/release()/update() are pure over the Game so test/run.js can drive
// them under node; attach() is the only part that touches the DOM.

const DAS = 150;  // ms a direction is held before it starts auto-repeating
const ARR = 30;   // ms between auto-repeat shifts once DAS has elapsed

class Input {
  constructor(game) {
    this.game = game;
    this.held = [];        // directions currently held, newest last
    this.acc = 0;          // ms toward the next auto-shift
    this.charged = false;  // DAS elapsed; repeating at ARR
  }

  dir() { return this.held.length ? this.held[this.held.length - 1] : 0; }

  startShift(dir, keepCharge) {
    if (!this.held.includes(dir)) this.held.push(dir);
    this.acc = 0;
    if (!keepCharge) this.charged = false;
    this.game.move(dir);   // first shift is immediate
  }

  // Returns true if the key was handled (caller should preventDefault).
  // mods.shift: Shift+R replays the current seed instead of drawing a new one.
  press(code, mods = {}) {
    const g = this.game;
    switch (code) {
      case 'ArrowLeft':  this.startShift(-1, false); return true;
      case 'ArrowRight': this.startShift(1, false); return true;
      case 'ArrowDown':  g.setSoftDrop(true); return true;
      case 'ArrowUp': case 'KeyX': g.rotate(1); return true;
      case 'KeyZ': case 'ControlLeft': case 'ControlRight': g.rotate(-1); return true;
      case 'KeyA': g.rotate(2); return true;
      case 'Space': g.hardDrop(); return true;
      case 'KeyC': case 'ShiftLeft': case 'ShiftRight': g.swapHold(); return true;
      case 'KeyP': case 'Escape': g.togglePause(); return true;
      case 'KeyR': g.reset(mods.shift ? g.seed : undefined); this.releaseAll(); return true;
      default: return false;
    }
  }

  release(code) {
    switch (code) {
      case 'ArrowLeft': this.drop(-1); return true;
      case 'ArrowRight': this.drop(1); return true;
      case 'ArrowDown': this.game.setSoftDrop(false); return true;
      default: return false;
    }
  }

  drop(dir) {
    const i = this.held.indexOf(dir);
    if (i < 0) return;
    const wasActive = dir === this.dir();
    this.held.splice(i, 1);
    if (wasActive && this.held.length) this.startShift(this.dir(), true);
  }

  // Focus loss eats keyup events; treat it as everything released.
  releaseAll() {
    this.held = [];
    this.charged = false;
    this.acc = 0;
    this.game.setSoftDrop(false);
  }

  // Advance auto-shift by dt ms. Runs every frame, even mid-clear.
  update(dt) {
    const dir = this.dir();
    if (dir === 0) return;
    this.acc += dt;
    const threshold = this.charged ? ARR : DAS;
    while (this.acc >= threshold) {
      this.acc -= threshold;
      this.charged = true;
      this.game.move(dir);
      if (threshold <= 0) break;
    }
  }

  attach(win, doc) {
    win.addEventListener('keydown', e => {
      if (e.repeat) { if (this.isGameKey(e.code)) e.preventDefault(); return; }
      if (this.press(e.code, { shift: e.shiftKey })) e.preventDefault();
    });
    win.addEventListener('keyup', e => { if (this.release(e.code)) e.preventDefault(); });
    win.addEventListener('blur', () => this.releaseAll());
    doc.addEventListener('visibilitychange', () => {
      if (doc.hidden) { this.releaseAll(); this.game.pause(); }
    });
  }

  isGameKey(code) {
    return /^(Arrow(Left|Right|Up|Down)|Space|Key[XZACPR]|Shift(Left|Right)|Control(Left|Right)|Escape)$/.test(code);
  }
}

// Score / level / lines panel in plain DOM. Only writes textContent when a
// value actually changes (pattern from agent-3 via agent-4): the panel is
// updated every frame, and a DOM write per frame would force layout for
// nothing.

const CLEAR_LABEL_MS = 1500;

class Hud {
  constructor(game) {
    this.game = game;
    this.el = {
      score: document.getElementById('score'),
      level: document.getElementById('level'),
      lines: document.getElementById('lines'),
      clear: document.getElementById('clear'),
      best: document.getElementById('best'),
      seed: document.getElementById('seed'),
    };
    this.shown = { score: null, level: null, lines: null, clear: null, best: null, seed: null };
  }

  set(key, value) {
    if (this.shown[key] === value) return;
    this.shown[key] = value;
    this.el[key].textContent = value;
  }

  update() {
    const g = this.game;
    this.set('score', String(g.score));
    this.set('level', String(g.level));
    this.set('lines', String(g.lines));
    this.set('best', String(Math.max(g.best, g.score)));
    this.set('seed', 'seed ' + g.seed);
    const lc = g.lastClear;
    const fresh = lc && g.clock - lc.at < CLEAR_LABEL_MS;
    // key on the timestamp too, so two identical clears in a row both pop
    this.set('clear', fresh ? lc.label + '  +' + lc.points : '');
    if (fresh && this.shownAt !== lc.at) {
      this.shownAt = lc.at;
      this.el.clear.classList.remove('pop');
      void this.el.clear.offsetWidth;
      this.el.clear.classList.add('pop');
    }
  }
}

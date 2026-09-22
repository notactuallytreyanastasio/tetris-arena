// Entry point: build the game, hook input, run the frame loop, keep the DOM
// HUD in step with the game.

(function main() {
  // A seed in the URL hash replays that game (agent-1's idea). The hash is
  // kept in step so the address bar is always a link to the current game.
  const hashSeed = /seed=(\d+)/.exec(location.hash);
  const game = new Game(hashSeed ? Number(hashSeed[1]) >>> 0 : undefined);

  // Best score in this browser (agent-10). localStorage can throw in
  // private windows or when blocked, so every touch is guarded.
  const BEST_KEY = 'tetris-agent-2-best';
  let best = 0;
  try { best = Number(localStorage.getItem(BEST_KEY)) || 0; } catch (e) { /* unavailable */ }
  function saveBest() {
    try { localStorage.setItem(BEST_KEY, String(best)); } catch (e) { /* unavailable */ }
  }
  window.addEventListener('beforeunload', saveBest);
  const renderer = makeRenderer({
    well: document.getElementById('well'),
    hold: document.getElementById('hold'),
    next: document.getElementById('next'),
  });
  const input = attachInput(game);

  const hud = {
    score: document.getElementById('score'),
    level: document.getElementById('level'),
    lines: document.getElementById('lines'),
    best: document.getElementById('best'),
    seed: document.getElementById('seed'),
    event: document.getElementById('event'),
    overlay: document.getElementById('overlay'),
    overlayTitle: document.getElementById('overlay-title'),
    overlayHint: document.getElementById('overlay-hint'),
  };
  // Write to the DOM only when a value changes (pattern from agent-3);
  // setting textContent every frame forces layout for nothing.
  const shown = { score: -1, level: -1, lines: -1, best: -1, seed: -1, event: null, overlay: null };

  function overlayState() {
    if (game.over) return 'over';
    if (game.paused) return 'paused';
    return null;
  }

  function drawHud() {
    if (shown.score !== game.score) hud.score.textContent = shown.score = game.score;
    if (shown.level !== game.level) hud.level.textContent = shown.level = game.level;
    if (shown.lines !== game.lines) hud.lines.textContent = shown.lines = game.lines;
    if (game.score > best) best = game.score;
    if (shown.best !== best) hud.best.textContent = shown.best = best;
    if (shown.seed !== game.seed) {
      hud.seed.textContent = shown.seed = game.seed;
      try { history.replaceState(null, '', '#seed=' + game.seed); } catch (e) { /* file:// may refuse */ }
    }

    const ev = game.lastClear;
    if (ev !== shown.event) {
      shown.event = ev;
      hud.event.textContent = ev ? `${ev.label} +${ev.points}` : '';
      // Restart the fade: force the .show class on, then let CSS fade it.
      hud.event.classList.add('show');
      void hud.event.offsetWidth;
      hud.event.classList.remove('show');
    }

    const state = overlayState();
    if (state !== shown.overlay) {
      shown.overlay = state;
      hud.overlay.classList.toggle('hidden', state === null);
      if (state === 'over') {
        saveBest();
        hud.overlayTitle.textContent = 'Game over';
        hud.overlayHint.textContent = 'R for a new game, Shift+R to replay this seed';
      } else if (state === 'paused') {
        hud.overlayTitle.textContent = 'Paused';
        hud.overlayHint.textContent = 'P to resume';
      }
    }
  }

  let last = performance.now();
  function frame(now) {
    // Clamp dt so a backgrounded tab does not dump seconds of gravity at once.
    const dt = Math.min(now - last, 100);
    last = now;
    input.update(dt);
    game.update(dt);
    renderer.draw(game);
    drawHud();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  window.game = game; // for poking at from the console
})();

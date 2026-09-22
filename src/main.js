// Entry point: build the game, hook input, run the frame loop, keep the DOM
// HUD in step with the game.

(function main() {
  const game = new Game();
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
    event: document.getElementById('event'),
    overlay: document.getElementById('overlay'),
    overlayTitle: document.getElementById('overlay-title'),
    overlayHint: document.getElementById('overlay-hint'),
  };
  // Write to the DOM only when a value changes (pattern from agent-3);
  // setting textContent every frame forces layout for nothing.
  const shown = { score: -1, level: -1, lines: -1, event: null, overlay: null };

  function overlayState() {
    if (game.over) return 'over';
    return null;
  }

  function drawHud() {
    if (shown.score !== game.score) hud.score.textContent = shown.score = game.score;
    if (shown.level !== game.level) hud.level.textContent = shown.level = game.level;
    if (shown.lines !== game.lines) hud.lines.textContent = shown.lines = game.lines;

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
        hud.overlayTitle.textContent = 'Game over';
        hud.overlayHint.textContent = 'R to restart';
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

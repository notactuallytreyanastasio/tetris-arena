// Wire-up: one requestAnimationFrame loop feeding update(dt) and draw().

(() => {
  const game = new Game();
  const input = new Input(game);
  input.attach(window);
  const boardCtx = document.getElementById('board').getContext('2d');
  const overlay = document.getElementById('overlay');
  const overlayTitle = document.getElementById('overlay-title');
  const overlayHint = document.getElementById('overlay-hint');
  const clearEl = document.getElementById('clear');

  // HUD text is written only when it changes: DOM writes every frame cost
  // layout even when the text is the same.
  const hud = {};
  for (const id of ['score', 'level', 'lines']) hud[id] = { el: document.getElementById(id), value: null };
  function setText(slot, value) {
    if (slot.value === value) return;
    slot.value = value;
    slot.el.textContent = value;
  }

  let shownClear = null;
  function draw() {
    Render.board(boardCtx, game);
    setText(hud.score, game.score);
    setText(hud.level, game.level);
    setText(hud.lines, game.lines);
    if (game.lastClear !== shownClear) {
      shownClear = game.lastClear;
      clearEl.textContent = shownClear ? `${shownClear.label} +${shownClear.points}` : '';
      clearEl.classList.remove('pop'); void clearEl.offsetWidth; clearEl.classList.add('pop');
    }
    const showOverlay = game.over;
    overlay.classList.toggle('hidden', !showOverlay);
    if (game.over) { overlayTitle.textContent = 'GAME OVER'; overlayHint.textContent = 'R to restart'; }
  }

  let last = performance.now();
  function frame(now) {
    // Clamp so a backgrounded tab does not dump seconds of gravity at once.
    const dt = Math.min(now - last, 100);
    last = now;
    input.tick(dt);
    game.update(dt);
    draw();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  window.game = game; // handy in the console
})();

// Wire-up: one requestAnimationFrame loop feeding update(dt) and draw().

(() => {
  // Seed from the URL hash so a game can be shared and replayed.
  const hashSeed = parseInt(location.hash.slice(1), 10);
  const game = new Game(Number.isFinite(hashSeed) ? hashSeed : undefined);
  const input = new Input(game);
  input.attach(window);
  const boardCtx = document.getElementById('board').getContext('2d');
  const holdCtx = document.getElementById('hold').getContext('2d');
  const nextCtx = document.getElementById('next').getContext('2d');
  const holdBox = document.getElementById('hold-box');
  const seedEl = document.getElementById('seed');
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
  let shownHold = '', shownQueue = '', shownSeed = null;
  function draw() {
    Render.board(boardCtx, game);
    // Previews are redrawn only when their contents change.
    const holdKey = (game.hold || '') + (game.holdUsed ? '!' : '');
    if (holdKey !== shownHold) {
      shownHold = holdKey;
      Render.preview(holdCtx, [game.hold], 120, 24, game.holdUsed);
      holdBox.classList.toggle('spent', game.holdUsed);
    }
    const queueKey = game.queue.slice(0, 5).join('');
    if (queueKey !== shownQueue) {
      shownQueue = queueKey;
      Render.preview(nextCtx, game.queue.slice(0, 5), 72, 20);
    }
    if (game.seed !== shownSeed) {
      shownSeed = game.seed;
      seedEl.textContent = game.seed;
      history.replaceState(null, '', '#' + game.seed);
    }
    setText(hud.score, game.score);
    setText(hud.level, game.level);
    setText(hud.lines, game.lines);
    if (game.lastClear !== shownClear) {
      shownClear = game.lastClear;
      clearEl.textContent = shownClear ? `${shownClear.label} +${shownClear.points}` : '';
      clearEl.classList.remove('pop'); void clearEl.offsetWidth; clearEl.classList.add('pop');
    }
    overlay.classList.toggle('hidden', !(game.over || game.paused));
    if (game.over) { overlayTitle.textContent = 'GAME OVER'; overlayHint.textContent = 'R to restart'; }
    else if (game.paused) { overlayTitle.textContent = 'PAUSED'; overlayHint.textContent = 'P to resume'; }
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

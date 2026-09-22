// Wire the game to the page and run the frame loop.

(function () {
  let storage = null;
  try { storage = window.localStorage; } catch (e) { /* blocked storage: no best score */ }
  const game = new Game({ storage });
  const renderer = makeRenderer(document.getElementById('board'));
  const $ = id => document.getElementById(id);
  const overlay = $('overlay');
  const nextView = makePreview($('next'), QUEUE_DEPTH);
  const holdView = makePreview($('hold'), 1);

  const input = new Input(game);
  input.attach(window, document);

  // DOM writes only when a value changes (taken from agent-3): textContent
  // every frame forces layout work for nothing.
  const shown = { score: -1, best: -1, seed: -1, lines: -1, level: -1, status: null };
  function syncHud() {
    if (shown.score !== game.score) $('score').textContent = shown.score = game.score;
    if (shown.best !== game.best) $('best').textContent = shown.best = game.best;
    if (shown.seed !== game.seed) $('seed').textContent = shown.seed = game.seed;
    if (shown.lines !== game.lines) $('lines').textContent = shown.lines = game.lines;
    if (shown.level !== game.level) $('level').textContent = shown.level = game.level;
    if (shown.status === game.status) return;
    shown.status = game.status;
    if (game.status === 'over') {
      $('overlay-title').textContent = 'GAME OVER';
      $('overlay-hint').textContent = 'R restarts, Shift+R replays this seed';
      overlay.classList.remove('hidden');
    } else if (game.status === 'paused') {
      $('overlay-title').textContent = 'PAUSED';
      $('overlay-hint').textContent = 'press P to resume';
      overlay.classList.remove('hidden');
    } else {
      overlay.classList.add('hidden');
    }
  }

  let last = performance.now();
  function frame(now) {
    // Clamp dt so a backgrounded tab does not dump seconds of gravity at once.
    const dt = Math.min(now - last, 100);
    last = now;
    if (game.status !== 'paused') input.update(dt);
    game.tick(dt);
    renderer.draw(game);
    nextView.draw(game.queue.slice(0, QUEUE_DEPTH));
    holdView.draw([game.hold], game.holdUsed);
    syncHud();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  window.game = game; // handy in devtools
})();

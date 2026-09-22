// Wire the game to the page and run the frame loop.

(function () {
  const game = new Game();
  const renderer = makeRenderer(document.getElementById('board'));
  const $ = id => document.getElementById(id);
  const overlay = $('overlay');

  attachInput(game);

  function syncHud() {
    $('score').textContent = game.score;
    $('lines').textContent = game.lines;
    $('level').textContent = game.level;
    if (game.status === 'over') {
      $('overlay-title').textContent = 'GAME OVER';
      $('overlay-hint').textContent = 'press R to restart';
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
    game.tick(dt);
    renderer.draw(game);
    syncHud();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  window.game = game; // handy in devtools
})();

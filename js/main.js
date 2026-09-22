// Wire-up: one requestAnimationFrame loop feeding update(dt) and draw().

(() => {
  const game = new Game();
  const input = new Input(game);
  input.attach(window);
  const boardCtx = document.getElementById('board').getContext('2d');
  const scoreEl = document.getElementById('score');
  const levelEl = document.getElementById('level');
  const linesEl = document.getElementById('lines');

  function draw() {
    Render.board(boardCtx, game);
    scoreEl.textContent = game.score;
    levelEl.textContent = game.level;
    linesEl.textContent = game.lines;
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

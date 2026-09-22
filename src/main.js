// Wiring: one requestAnimationFrame loop feeds dt to the game and then
// redraws. dt is clamped so a backgrounded tab does not dump seconds of
// gravity into one frame when it wakes.
(function () {
  'use strict';

  const game = new window.GameModule.Game();
  const renderer = new window.Renderer(document.getElementById('board'));
  const input = new window.Input.Input(game, {});
  input.attach(window);

  let last = performance.now();
  function frame(now) {
    const dt = Math.min(now - last, 100);
    last = now;
    input.update(dt);
    game.update(dt);
    renderer.drawBoard(game);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  window.tetris = game; // handy in the console
})();

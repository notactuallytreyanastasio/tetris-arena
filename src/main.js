// Wiring: one requestAnimationFrame loop feeds dt to the game and then
// redraws. dt is clamped so a backgrounded tab does not dump seconds of
// gravity into one frame when it wakes.
(function () {
  'use strict';

  const $ = id => document.getElementById(id);
  const game = new window.GameModule.Game();
  const renderer = new window.Renderer({
    board: $('board'), score: $('score'), level: $('level'), lines: $('lines'),
    toast: $('toast'), overlay: $('overlay'),
    overlayTitle: $('overlay-title'), overlayHint: $('overlay-hint'),
  });
  const input = new window.Input.Input(game, {
    restart() { game.reset(); },
  });
  input.attach(window);

  let last = performance.now();
  function frame(now) {
    const dt = Math.min(now - last, 100);
    last = now;
    input.update(dt);
    game.update(dt);
    renderer.draw(game, false);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  window.tetris = game; // handy in the console
})();

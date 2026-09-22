// Wiring: one requestAnimationFrame loop feeds dt to the game and then
// redraws. dt is clamped so a backgrounded tab does not dump seconds of
// gravity into one frame when it wakes.
(function () {
  'use strict';

  const $ = id => document.getElementById(id);
  const game = new window.GameModule.Game();
  const renderer = new window.Renderer({
    board: $('board'), next: $('next'), hold: $('hold'),
    score: $('score'), best: $('best'), level: $('level'), lines: $('lines'),
    toast: $('toast'), overlay: $('overlay'),
    overlayTitle: $('overlay-title'), overlayHint: $('overlay-hint'),
  });
  const BEST_KEY = 'tetris-agent-9-best';
  const best = {
    get() { try { return Number(localStorage.getItem(BEST_KEY)) || 0; } catch (e) { return 0; } },
    set(v) { try { localStorage.setItem(BEST_KEY, String(v)); } catch (e) { /* private window, file:// */ }
    },
  };
  let bestScore = best.get();
  let wasOver = false;

  const input = new window.Input.Input(game, {
    restart() { game.reset(); wasOver = false; },
    pause() { game.setPaused(!game.paused); },
  });
  input.attach(window);

  // Losing focus pauses and drops every held key, so DAS does not fire into
  // the first frame after the tab comes back.
  const autoPause = () => { input.releaseAll(); game.setPaused(true); };
  window.addEventListener('blur', autoPause);
  document.addEventListener('visibilitychange', () => { if (document.hidden) autoPause(); });

  let last = performance.now();
  function frame(now) {
    const dt = Math.min(now - last, 100);
    last = now;
    input.update(dt);
    game.update(dt);
    if (game.over && !wasOver) {
      wasOver = true;
      if (game.score > bestScore) { bestScore = game.score; best.set(bestScore); }
    }
    renderer.draw(game, bestScore);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  window.tetris = game; // handy in the console
})();

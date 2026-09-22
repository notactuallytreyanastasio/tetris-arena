// Wiring: one requestAnimationFrame loop feeds dt to the game and then
// redraws. dt is clamped so a backgrounded tab does not dump seconds of
// gravity into one frame when it wakes.
(function () {
  'use strict';

  const $ = id => document.getElementById(id);

  // The bag seed lives in the URL hash: reload replays the same game and
  // the link can be sent to someone (taken from agent-1).
  const seedFromHash = () => { const m = /seed=(\d+)/.exec(location.hash); return m ? Number(m[1]) >>> 0 : undefined; };
  const game = new window.GameModule.Game({ seed: seedFromHash() });
  const publishSeed = () => {
    try { if (location.hash !== '#seed=' + game.seed) history.replaceState(null, '', '#seed=' + game.seed); } catch (e) { /* file:// may refuse */ }
  };
  publishSeed();
  const renderer = new window.Renderer({
    board: $('board'), next: $('next'), hold: $('hold'),
    score: $('score'), best: $('best'), level: $('level'), lines: $('lines'), seed: $('seed'),
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
    // R starts a fresh seed; Shift+R replays the current one.
    restart(e) { game.reset(e && e.shiftKey ? game.seed : undefined); publishSeed(); wasOver = false; },
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

// Entry point: build the game, hook input, run the frame loop.

(function main() {
  const canvas = document.getElementById('well');
  const game = new Game();
  const renderer = makeRenderer(canvas);
  attachInput(game);

  let last = performance.now();
  function frame(now) {
    // Clamp dt so a backgrounded tab does not dump seconds of gravity at once.
    const dt = Math.min(now - last, 100);
    last = now;
    game.update(dt);
    renderer.draw(game);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();

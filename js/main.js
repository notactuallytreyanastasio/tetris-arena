// Wires the pieces together and runs the requestAnimationFrame loop.

const game = new Game();
const renderer = new Renderer(document.getElementById('board'));

let last = performance.now();
function frame(now) {
  // Clamp dt so a tab that was in the background does not replay seconds of
  // gravity in one frame when it comes back.
  const dt = Math.min(now - last, 100);
  last = now;
  game.update(dt);
  renderer.draw(game);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

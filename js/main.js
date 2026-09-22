// Wires the pieces together and runs the requestAnimationFrame loop.

const game = new Game();
const renderer = new Renderer(document.getElementById('board'));
const input = new Input(game);
const hud = new Hud(game);

let last = performance.now();
function frame(now) {
  // Clamp dt so a tab that was in the background does not replay seconds of
  // gravity in one frame when it comes back.
  const dt = Math.min(now - last, 100);
  last = now;
  input.update(dt);
  game.update(dt);
  renderer.draw(game);
  hud.update();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

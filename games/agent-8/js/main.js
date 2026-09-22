// Wires the pieces together and runs the requestAnimationFrame loop.

// The seed rides in the URL hash so a reload, or a shared link, replays the
// same bag (agent-1).
const m = /seed=(\d+)/.exec(location.hash);
const game = new Game(m ? Number(m[1]) >>> 0 : undefined);
game.onReset = (seed) => {
  try { history.replaceState(null, '', '#seed=' + seed); } catch (e) { /* file:// may refuse */ }
};
game.onReset(game.seed);
const renderer = new Renderer(
  document.getElementById('board'),
  document.getElementById('next'),
  document.getElementById('hold')
);
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

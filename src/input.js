// Keyboard input. Milestone 1 has no controls yet; this file exists so the
// wiring in index.html is final from the start.

function attachInput(game) {
  window.addEventListener('keydown', (e) => {
    if (e.key === 'r' || e.key === 'R') game.reset();
  });
}

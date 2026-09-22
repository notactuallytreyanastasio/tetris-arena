// Keyboard input. keydown fires one action; soft drop is held.
// Browser key auto-repeat is ignored (e.repeat) so a held Left does not
// machine-gun the piece: DAS/ARR are handled deliberately in milestone 5.

const KEYS = {
  ArrowLeft:  g => g.move(-1),
  ArrowRight: g => g.move(1),
  ArrowUp:    g => g.rotate(1),
  KeyX:       g => g.rotate(1),
  KeyZ:       g => g.rotate(-1),
  ControlLeft: g => g.rotate(-1),
  Space:      g => g.hardDrop(),
};

function attachInput(game) {
  window.addEventListener('keydown', e => {
    if (e.code === 'ArrowDown') { game.setSoftDrop(true); e.preventDefault(); return; }
    const action = KEYS[e.code];
    if (!action) return;
    e.preventDefault();
    if (e.repeat) return;
    action(game);
  });
  window.addEventListener('keyup', e => {
    if (e.code === 'ArrowDown') game.setSoftDrop(false);
  });
  window.addEventListener('blur', () => game.setSoftDrop(false));
}

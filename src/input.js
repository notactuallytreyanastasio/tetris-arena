// Keyboard input with DAS/ARR. A horizontal key moves once on press, waits
// DAS_MS, then repeats every ARR_MS while held. The timers advance from the
// frame loop's dt, not from the browser's key-repeat, so the feel does not
// depend on OS settings and pausing the loop pauses the repeat too.

const DAS_MS = 167;
const ARR_MS = 33;

const KEYS = {
  ArrowLeft: 'left', ArrowRight: 'right', ArrowDown: 'soft',
  ArrowUp: 'cw', x: 'cw', X: 'cw',
  z: 'ccw', Z: 'ccw',
  ' ': 'hard',
  c: 'hold', C: 'hold', Shift: 'hold',
  r: 'reset', R: 'reset',
};

function attachInput(game) {
  // Horizontal autorepeat state. Only the most recently pressed direction
  // repeats, so tapping the other arrow mid-DAS changes direction cleanly.
  const held = { dir: 0, acc: 0, repeating: false };

  window.addEventListener('keydown', (e) => {
    const action = KEYS[e.key];
    if (!action) return;
    e.preventDefault();
    if (e.repeat) return; // we do our own repeat

    switch (action) {
      case 'left':
      case 'right': {
        held.dir = action === 'left' ? -1 : 1;
        held.acc = 0;
        held.repeating = false;
        game.move(held.dir);
        break;
      }
      case 'soft': game.softDropping = true; break;
      case 'cw': game.rotate(1); break;
      case 'ccw': game.rotate(-1); break;
      case 'hard': game.hardDrop(); break;
      case 'hold': game.holdPiece(); break;
      case 'reset': game.reset(); break;
    }
  });

  window.addEventListener('keyup', (e) => {
    const action = KEYS[e.key];
    if (action === 'left' && held.dir === -1) held.dir = 0;
    if (action === 'right' && held.dir === 1) held.dir = 0;
    if (action === 'soft') game.softDropping = false;
  });

  // Losing focus drops every key: otherwise a piece keeps sliding after
  // alt-tab because the keyup never arrives.
  window.addEventListener('blur', () => { held.dir = 0; game.softDropping = false; });

  function update(dt) {
    if (!held.dir) return;
    held.acc += dt;
    if (!held.repeating) {
      if (held.acc >= DAS_MS) { held.repeating = true; held.acc -= DAS_MS; game.move(held.dir); }
      return;
    }
    while (held.acc >= ARR_MS) { held.acc -= ARR_MS; game.move(held.dir); }
  }

  return { update };
}

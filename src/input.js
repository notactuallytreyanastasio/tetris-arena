// Keyboard input with DAS/ARR. A horizontal key moves once on press, waits
// DAS_MS, then repeats every ARR_MS while held. The timers advance from the
// frame loop's dt, not from the browser's key-repeat, so the feel does not
// depend on OS settings and pausing the loop pauses the repeat too.
//
// `win` and `doc` are injectable so test.js can drive this with fake
// event targets; in the page they default to window and document.

const DAS_MS = 167;
const ARR_MS = 33;

const KEYS = {
  ArrowLeft: 'left', ArrowRight: 'right', ArrowDown: 'soft',
  ArrowUp: 'cw', x: 'cw', X: 'cw',
  z: 'ccw', Z: 'ccw',
  ' ': 'hard',
  c: 'hold', C: 'hold', Shift: 'hold',
  p: 'pause', P: 'pause', Escape: 'pause',
  r: 'reset', R: 'reset',
};

function attachInput(game, win = window, doc = document) {
  // Held horizontal directions, oldest first. The newest press is the one
  // that repeats; releasing it falls back to whatever is still held. The
  // stack idea is agent-1's (who took the fallback from agent-3). Changed:
  // the fallback direction moves immediately and inherits the charged DAS,
  // so tapping left-right-left at speed never stalls for a fresh DAS.
  const held = { dirs: [], acc: 0, repeating: false };
  const activeDir = () => (held.dirs.length ? held.dirs[held.dirs.length - 1] : 0);

  function press(dir) {
    held.dirs = held.dirs.filter((d) => d !== dir);
    held.dirs.push(dir);
    held.acc = 0;
    held.repeating = false;
    game.move(dir);
  }

  function release(dir) {
    const wasActive = activeDir() === dir;
    held.dirs = held.dirs.filter((d) => d !== dir);
    if (wasActive && held.dirs.length) {
      held.acc = 0;
      game.move(activeDir());
    }
  }

  function releaseAll() {
    held.dirs = [];
    held.repeating = false;
    game.softDropping = false;
  }

  win.addEventListener('keydown', (e) => {
    const action = KEYS[e.key];
    if (!action) return;
    e.preventDefault();
    if (e.repeat) return; // we do our own repeat

    if (action === 'pause') { game.setPaused(!game.paused); return; }
    if (action === 'reset') { game.reset(); return; }
    if (game.paused) return;

    switch (action) {
      case 'left': press(-1); break;
      case 'right': press(1); break;
      case 'soft': game.softDropping = true; break;
      case 'cw': game.rotate(1); break;
      case 'ccw': game.rotate(-1); break;
      case 'hard': game.hardDrop(); break;
      case 'hold': game.holdPiece(); break;
    }
  });

  win.addEventListener('keyup', (e) => {
    const action = KEYS[e.key];
    if (action === 'left') release(-1);
    if (action === 'right') release(1);
    if (action === 'soft') game.softDropping = false;
  });

  // Losing focus drops every key (the keyup never arrives after alt-tab, so
  // a piece would keep sliding) and pauses: a game nobody is watching
  // should not top out on its own. The pause-on-hide is agent-5's.
  win.addEventListener('blur', () => { releaseAll(); game.setPaused(true); });
  doc.addEventListener('visibilitychange', () => {
    if (doc.hidden) { releaseAll(); game.setPaused(true); }
  });

  function update(dt) {
    const dir = activeDir();
    if (!dir) return;
    held.acc += dt;
    if (!held.repeating) {
      if (held.acc >= DAS_MS) { held.repeating = true; held.acc -= DAS_MS; game.move(dir); }
      return;
    }
    while (held.acc >= ARR_MS) { held.acc -= ARR_MS; game.move(dir); }
  }

  return { update, press, release };
}

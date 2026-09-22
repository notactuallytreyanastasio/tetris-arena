// Round 2: seeded bag, best score, hard-drop trail, DAS through the flash, ARR 0.
module.exports = (t) => {
  const { Game, Input, PIECES, ROWS, TRAIL_MS, DAS, ARR, CLEAR_FLASH_MS } = t;
  const names = (g) => [g.active.piece.name].concat(g.queue.map((p) => p.name)).join('');
  const key = (code, shift) => ({ code, repeat: false, shiftKey: !!shift, preventDefault() {} });

  let a = new Game(42), b = new Game(42), c = new Game(43);
  t.check(names(a) === names(b), 'same seed, same bag: ' + names(a));
  t.check(names(a) !== names(c), 'different seed, different bag: ' + names(c));
  t.check(a.seed === 42, 'seed is kept on the game');
  a.hardDrop(); a.reset(a.seed);
  t.check(names(a) === names(b), 'reset with the same seed replays the bag');
  a.reset(); t.check(a.seed !== 42, 'reset without a seed picks a new one');

  let g = new Game(7); const inp = new Input(g);
  inp.onKeyDown(key('KeyR', true)); t.check(g.seed === 7, 'Shift+R keeps the seed');
  inp.onKeyDown(key('KeyR', false)); t.check(g.seed !== 7, 'R takes a new seed');

  // A vertical I flush against the left wall (rot 1 at x=-2 puts its column
  // at board x=0). Rot 3 would be column -1, so the 180 must take kick
  // test 2, (1, 0). Case from agent-2, who first wrote it the wrong way round.
  g = new Game(5); t.force(g, 'I'); g.rotate(1); while (g.move(-1)) {}
  t.check(g.active.x === -2, 'vertical I reaches column 0 at box x=-2');
  t.check(g.rotate(2) && g.active.rot === 3 && g.active.x === -1 && g.active.kick === 1, 'I 180 at the left wall kicks right via test 2');

  g = new Game(1); t.force(g, 'O'); const fromY = g.active.y; g.hardDrop();
  t.check(g.trail && g.trail.cols.length === 2 && g.trail.cols[0][1] === fromY && g.trail.cols[0][2] === ROWS - 2, 'hard drop leaves a two-column trail from spawn row to floor');
  g.update(TRAIL_MS - 10); t.check(g.trail !== null, 'trail alive just before ' + TRAIL_MS + 'ms');
  g.update(20); t.check(g.trail === null, 'trail gone after ' + TRAIL_MS + 'ms');

  g = new Game(1); g.score = 500; g.endGame();
  t.check(g.best === 500, 'game over records the best score (localStorage absent here, so in memory)');

  // DAS/ARR timing: immediate shift, wait DAS, then one per ARR
  g = new Game(3); t.force(g, 'T'); const in2 = new Input(g); const x0 = g.active.x;
  in2.onKeyDown(key('ArrowRight')); t.check(g.active.x === x0 + 1, 'keydown shifts once immediately');
  in2.update(DAS - 1); t.check(g.active.x === x0 + 1, 'no repeat before DAS');
  in2.update(1); t.check(g.active.x === x0 + 2, 'first repeat exactly at DAS');
  in2.update(ARR); t.check(g.active.x === x0 + 3, 'next repeat one ARR later');

  // held through a flash: stays charged, does not bank repeats
  g = new Game(3); t.force(g, 'T'); const in3 = new Input(g);
  in3.onKeyDown(key('ArrowRight')); in3.update(DAS);
  g.active = null; g.clearing = { rows: [], spin: null, acc: 0 };
  in3.update(CLEAR_FLASH_MS); t.check(in3.charged && in3.acc <= ARR, 'charged through the flash, accumulator clamped to one ARR');
  g.clearing = null; g.spawn(); const sx = g.active.x;
  in3.update(16); t.check(g.active.x === sx + 1, 'new piece shifts exactly one cell on its first frame, not four');
};

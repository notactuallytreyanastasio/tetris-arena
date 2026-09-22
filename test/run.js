// Node test runner for the DOM-free core: pieces.js, board.js, game.js and
// input.js. Run with `node test/run.js` from the worktree root. The files are
// classic scripts (no exports) so they are concatenated and eval'd, the same
// way index.html loads them in order.
//
// Idea of shipping tests in the repo taken from agent-3.

'use strict';
const fs = require('fs');
const path = require('path');
const dir = path.join(__dirname, '..', 'js');
const src = ['pieces.js', 'board.js', 'game.js', 'input.js']
  .map(f => fs.readFileSync(path.join(dir, f), 'utf8')).join('\n');
const ctx = {};
new Function('ctx', src + `
  Object.assign(ctx, { Game, Input, PIECES, ROTATIONS, kicksFor, COLS, ROWS, HIDDEN,
    gravityMsForLevel, QUEUE_DEPTH, MAX_LOCK_RESETS, CLEAR_FLASH_MS, DAS, ARR, TRAIL_MS, TOAST_MS, mulberry32 });
`)(ctx);
const { Game, Input, PIECES, COLS, ROWS, HIDDEN, gravityMsForLevel, QUEUE_DEPTH,
  MAX_LOCK_RESETS, DAS, ARR, TRAIL_MS } = ctx;

let fails = 0, passes = 0;
function ok(cond, msg) {
  console.log((cond ? 'ok   ' : 'FAIL ') + msg);
  if (cond) passes++; else fails++;
}
const T = PIECES.T.id, I = PIECES.I.id, O = PIECES.O.id, L = PIECES.L.id;

// A game whose bag deals exactly this sequence (cycling).
function gameWith(seq) {
  let i = 0;
  const g = new Game();
  g.nextPiece = () => seq[i++ % seq.length];
  g.queue = [];
  g.spawn();
  return g;
}
const fillRows = (g, rows, gapCol) => rows.forEach(r => {
  for (let c = 0; c < COLS; c++) g.grid[r][c] = c === gapCol ? 0 : 1;
});
const settle = g => { while (g.clearing) g.tick(16); };
const at = (id, rot, x, y) => ({ id, rot, x, y, lowestY: y, spun: false, kick: 0 });

console.log('--- gravity and locking');
{
  const g = new Game();
  ok(g.piece.y === HIDDEN - 2 || g.piece.y === HIDDEN - 3, `spawns in the buffer (y=${g.piece.y})`);
  ok(Math.round(gravityMsForLevel(1)) === 1000 && Math.round(gravityMsForLevel(10)) === 64, 'guideline gravity 1000ms@1, 64ms@10');
  let locks = 0, lastId = g.piece.id;
  for (let t = 0; t < 60000 && g.status === 'playing'; t += 16) {
    g.tick(16);
    if (g.piece && g.piece.id !== lastId) { locks++; lastId = g.piece.id; }
  }
  ok(locks >= 3, `pieces lock and respawn under gravity alone (${locks} in 60s)`);
}

console.log('--- movement and rotation');
{
  let g = gameWith([T]);
  while (g.move(-1));
  ok(g.piece.x === 0, 'T reaches the left wall');
  g.piece.rot = 1; while (g.move(-1));
  ok(g.piece.x === -1, 'vertical T sits at x=-1 (empty matrix column outside the wall)');
  ok(g.rotate(-1) && g.piece.rot === 0 && g.piece.x === 0, 'R->0 at the left wall kicks right by 1');

  g = gameWith([I]);
  ok(g.rotate(1), 'I rotates cw at spawn');
  while (g.move(1));
  ok(g.piece.x === 7, `vertical I at the right wall (x=${g.piece.x})`);
  ok(g.rotate(1) && g.piece.x === 6, `I R->2 at the right wall kicks left to x=${g.piece.x}`);

  // Closed pocket the exact shape of a spawn-state T: every kick collides.
  g = gameWith([T]);
  for (let r = ROWS - 5; r < ROWS; r++) fillRows(g, [r], -1);
  g.grid[ROWS - 4][4] = 0; g.grid[ROWS - 3][3] = g.grid[ROWS - 3][4] = g.grid[ROWS - 3][5] = 0;
  g.piece = at(T, 0, 3, ROWS - 4);
  ok(g.fits(0, 3, ROWS - 4) && !g.rotate(1), 'rotation refused when every kick collides');

  g = gameWith([I]);
  g.piece = at(I, 0, 3, 0);
  ok(g.rotate(1) && g.piece.y >= 0, 'rotation at the ceiling stays in bounds');
}

console.log('--- drops and lock delay');
{
  let g = gameWith([O, T]);
  const before = g.piece.y; g.hardDrop();
  ok(g.score === 2 * (ROWS - 2 - before), `hard drop scores 2/row (${g.score})`);
  ok(g.piece.id === T, 'next piece spawns after hard drop');
  ok(g.grid[ROWS - 1][4] === O && g.grid[ROWS - 2][5] === O, 'O merged at the floor');
  ok(g.trail && g.trail.cols.length === 2, 'hard drop leaves a two-column trail');
  g.tick(TRAIL_MS + 1);
  ok(g.trail === null, 'trail expires');

  g = gameWith([T]); g.setSoftDrop(true); g.tick(50);
  ok(g.piece.y === HIDDEN - 1 && g.score === 1, 'soft drop: one row in 50ms at level 1, +1');

  g = gameWith([O, O]);
  g.hardDrop();
  g.setSoftDrop(true); for (let t = 0; t < 3000 && !g.grounded(); t += 16) g.tick(16); g.setSoftDrop(false);
  ok(g.grounded(), 'second O grounded on the first');
  for (let i = 0; i < 40; i++) { g.tick(400); g.move(i % 2 ? 1 : -1); }
  ok(g.grid[ROWS - 3].some(Boolean), 'a piece wiggled every 400ms still locks (15-reset cap)');

  g = gameWith([O]);
  g.grid[ROWS - 1][0] = 1; g.grid[ROWS - 1][1] = 1;
  g.piece = at(O, 0, 0, ROWS - 3);
  for (let i = 0; i < 15; i++) { g.move(i % 2 ? -1 : 1); g.move(i % 2 ? 1 : -1); }
  ok(g.lockResets === MAX_LOCK_RESETS, 'resets exhausted');
  g.move(2); g.move(1); g.move(1);
  ok(g.step() && g.lockResets === 0, 'reaching a new lowest row refills the resets');
}

console.log('--- line clears and scoring');
{
  let g = gameWith([I, O]);
  fillRows(g, [ROWS - 4, ROWS - 3, ROWS - 2, ROWS - 1], 9);
  g.rotate(1); while (g.move(1)); const y0 = g.piece.y; g.hardDrop();
  ok(g.clearing && g.clearing.rows.length === 4 && g.piece === null, 'tetris enters the flash state with no piece');
  ok(!g.move(-1) && !g.rotate(1), 'input ignored while clearing');
  settle(g);
  ok(g.lines === 4 && g.b2b && g.combo === 0, 'lines=4, b2b set, combo 0');
  const drop = (ROWS - 4) - y0;
  ok(g.score === 800 + 2 * drop + 2000, `tetris + perfect clear = ${g.score} (800 + ${2 * drop} drop + 2000 perfect)`);
  ok(g.toasts.some(t => t.text.startsWith('TETRIS')) && g.toasts.some(t => t.text.startsWith('PERFECT')), 'toasts posted');
  ok(g.piece && g.piece.id === O, 'next piece spawned after the clear');

  g = gameWith([I, I, O]);
  fillRows(g, [ROWS - 4, ROWS - 3, ROWS - 2, ROWS - 1], 0);
  g.grid[ROWS - 5][9] = 1;                       // leftover so there is no perfect clear
  g.rotate(1); while (g.move(-1)); g.score = 0; g.hardDrop(); settle(g);
  const first = g.score;
  fillRows(g, [ROWS - 4, ROWS - 3, ROWS - 2, ROWS - 1], 0);
  g.grid[ROWS - 5][9] = 1;                       // again, or the second one is a perfect clear
  g.rotate(1); while (g.move(-1)); const mid = g.score; g.hardDrop(); settle(g);
  ok(g.lines === 8 && g.combo === 1, `two tetrises: lines=${g.lines}, combo=${g.combo}`);
  ok((g.score - mid) - first === 450, `second tetris gains 450 more (b2b 400 + combo 50), got ${(g.score - mid) - first}`);

  g = gameWith([I, O]);
  fillRows(g, [ROWS - 2], 3); fillRows(g, [ROWS - 1], 9); g.grid[ROWS - 2][9] = 0;
  g.rotate(1); while (g.move(1)); g.hardDrop(); settle(g);
  ok(g.lines === 1 && g.grid[ROWS - 1][3] === 0 && g.grid[ROWS - 1][0] === 1, 'partial clear drops the gap row intact');

  g = new Game(); g.lines = 9;
  fillRows(g, [ROWS - 1], 9); g.piece = at(I, 1, 7, ROWS - 5); g.hardDrop(); settle(g);
  ok(g.level === 2 && gravityMsForLevel(2) < gravityMsForLevel(1), 'level 2 at 10 lines, gravity faster');
}

console.log('--- game over and restart');
{
  let g = gameWith([O]);
  for (let r = 0; r < ROWS; r++) fillRows(g, [r], -1);
  g.spawn();
  ok(g.status === 'over', 'block-out: spawn overlap ends the game');

  g = gameWith([O, O]);
  for (let r = HIDDEN; r < ROWS; r++) fillRows(g, [r], -1);
  g.piece = at(O, 0, 4, HIDDEN - 2); g.hardDrop();
  ok(g.status === 'over' && g.grid[HIDDEN - 1][4] === O, 'lock-out ends the game and keeps every locked cell');

  g.reset();
  ok(g.status === 'playing' && g.score === 0 && g.lines === 0 && g.level === 1 && g.grid.every(r => r.every(v => !v)), 'reset restores a fresh game');

  g.pause(); const y = g.piece.y; g.tick(5000);
  ok(g.status === 'paused' && g.piece.y === y && !g.move(1), 'pause freezes gravity and input');
  g.togglePause();
  ok(g.status === 'playing', 'togglePause resumes');
}

console.log('--- queue and hold');
{
  let g = gameWith([I, O, T, L, I, O, T]);
  ok(g.piece.id === I && g.queue.join() === [O, T, L].join(), `queue shows ${g.queue}`);
  g.hardDrop(); settle(g);
  ok(g.piece.id === O && g.queue.join() === [T, L, I].join(), 'spawn takes the front of the queue');

  g = gameWith([I, O, T, L]);
  ok(g.swapHold() && g.hold === I && g.piece.id === O && g.holdUsed, 'first hold stashes and spawns next');
  ok(!g.swapHold(), 'hold refused twice on one piece');
  g.hardDrop(); settle(g);
  ok(g.piece.id === T && !g.holdUsed, 'holdUsed clears on lock');
  g.rotate(1); g.move(2);
  ok(g.swapHold() && g.hold === T && g.piece.id === I && g.piece.rot === 0, 'swap returns the held piece at spawn, rot 0');
}

console.log('--- ghost and T-spins');
{
  let g = gameWith([O]);
  fillRows(g, [ROWS - 1], -1);
  ok(g.ghostY() === ROWS - 3, 'ghost lands on the stack');

  // Slot: row ROWS-2 open at 3..5, row ROWS-1 open at 4, overhang at (3,ROWS-3).
  const slot = g => { for (let c = 0; c < COLS; c++) { g.grid[ROWS - 1][c] = c === 4 ? 0 : 1; g.grid[ROWS - 2][c] = (c >= 3 && c <= 5) ? 0 : 1; } };
  g = gameWith([T, O]); slot(g); g.grid[ROWS - 3][3] = 1;
  g.piece = at(T, 1, 3, ROWS - 7); while (g.step());
  ok(g.piece.y === ROWS - 3 && g.rotate(1) && g.piece.rot === 2, 'vertical T drops to the slot floor and rotates in place');
  ok(g.tspinKind() === 'full', 'full T-spin detected (3 corners, front pair solid)');
  g.score = 0; g.hardDrop(); settle(g);
  ok(g.lines === 2 && g.score === 1200 && g.b2b, `T-spin double = ${g.score}, b2b set`);
  ok(g.toasts.some(t => t.text === 'T-SPIN DOUBLE +1200'), 'toast names the spin');

  g = gameWith([T, O]); slot(g); g.grid[ROWS - 3][9] = 1;   // leftover: no perfect clear
  g.piece = at(T, 1, 3, ROWS - 7); while (g.step()); g.rotate(1);
  ok(g.tspinKind() === null, 'no overhang: 2 corners, not a spin');
  g.score = 0; g.hardDrop(); settle(g);
  ok(g.score === 300 && !g.b2b, `plain double = ${g.score}`);

  g = gameWith([T, O]);
  g.grid[ROWS - 2][3] = 1; g.grid[ROWS - 2][5] = 1; g.grid[ROWS - 4][3] = 1;
  g.piece = at(T, 1, 3, ROWS - 8); while (g.step());
  ok(g.rotate(-1) && g.piece.rot === 0 && g.tspinKind() === 'mini', 'mini T-spin: 3 corners, front pair not both solid');
  g.score = 0; g.hardDrop();
  ok(g.score === 100 && g.toasts.some(t => t.text === 'MINI T-SPIN +100'), 'mini with no lines scores 100');

  g = gameWith([T]); g.rotate(1); g.move(1);
  ok(!g.piece.spun && g.tspinKind() === null, 'a move after the rotation clears the spin');
  g = gameWith([T]); g.rotate(1); g.step();
  ok(!g.piece.spun, 'a gravity step after the rotation clears the spin');
}

console.log('--- input: DAS/ARR and the held stack');
{
  let g = gameWith([O]);
  const inp = new Input(g);
  const x0 = g.piece.x;
  inp.press('ArrowLeft');
  ok(g.piece.x === x0 - 1, 'first shift is immediate');
  inp.update(DAS - 1);
  ok(g.piece.x === x0 - 1, 'no repeat before DAS');
  inp.update(1);
  ok(g.piece.x === x0 - 2 && inp.charged, 'repeat at DAS');
  inp.update(ARR);
  ok(g.piece.x === x0 - 3, 'then every ARR');
  inp.update(ARR * 20);
  ok(g.piece.x === 0, 'auto-shift stops at the wall without error');

  inp.press('ArrowRight');
  ok(g.piece.x === 1 && inp.dir() === 1 && !inp.charged, 'newest direction wins and restarts DAS');
  inp.update(DAS);
  ok(g.piece.x === 2 && inp.charged, 'right charges');
  inp.release('ArrowRight');
  ok(inp.dir() === -1 && g.piece.x === 1 && inp.charged, 'releasing it resumes the older direction, still charged');
  inp.update(ARR);
  ok(g.piece.x === 0, 'and repeats at ARR without a new DAS wait');
  inp.release('ArrowLeft');
  ok(inp.dir() === 0, 'stack empty');

  // DAS keeps charging through the clear flash.
  g = gameWith([I, O]); const inp2 = new Input(g);
  fillRows(g, [ROWS - 1], 9);
  g.piece = at(I, 1, 7, ROWS - 6); g.hardDrop();
  ok(g.clearing !== null, 'clearing after the I drop');
  inp2.press('ArrowLeft');
  inp2.update(DAS + 10);         // still clearing, no piece
  for (let t = 0; t < 140; t += 16) inp2.update(16);   // keep holding through the rest of the flash
  settle(g);
  ok(g.piece.id === O, 'O spawned after the flash');
  const xs = g.piece.x;
  inp2.update(ARR);
  ok(g.piece.x === xs - 1 && inp2.charged, 'held direction was charged during the flash and repeats at ARR immediately');
  ok(g.piece.x === xs - 1, 'exactly one cell on that first tick, no banked ARR burst (agent-6 named this)');

  // Pause via key, blur releases everything.
  inp2.press('KeyP');
  ok(g.status === 'paused', 'P pauses');
  inp2.press('Escape');
  ok(g.status === 'playing', 'Esc resumes');
  inp2.press('ArrowDown');
  ok(g.softDrop, 'down held = soft drop');
  inp2.releaseAll();
  ok(!g.softDrop && inp2.dir() === 0, 'blur releases soft drop and directions');
  ok(!inp2.press('KeyQ'), 'unmapped keys are not handled');
}

console.log('--- 180 rotation');
{
  let g = gameWith([T]);
  const x0 = g.piece.x, y0 = g.piece.y;
  ok(g.rotate(2) && g.piece.rot === 2 && g.piece.x === x0 && g.piece.y === y0, 'T 180 in place at spawn');
  ok(g.rotate(2) && g.piece.rot === 0, '180 again returns to spawn state');
  g = gameWith([I]);
  g.rotate(1); while (g.move(1));                 // vertical I against the right wall, x=7
  ok(g.rotate(2) && g.piece.rot === 3 && g.piece.x + 4 <= COLS + 2, `vertical I 180s at the wall (x=${g.piece.x}, rot=${g.piece.rot})`);
  // Edge cases agent-6 and agent-2 got wrong first: a vertical I flush
  // against the left wall (x=-2, matrix column 2 on board column 0) must
  // 180 via kick (1,0) because state 3 uses matrix column 1.
  g = gameWith([I]);
  g.rotate(1); while (g.move(-1));
  ok(g.piece.x === -2, `vertical I flush at the left wall (x=${g.piece.x})`);
  ok(g.rotate(2) && g.piece.rot === 3 && g.piece.x === -1, `I 180 at the left wall takes kick (1,0): x=${g.piece.x}`);
  ok(g.rotate(2) && g.piece.rot === 1 && g.piece.x === -2, `and 180 back takes (-1,0): x=${g.piece.x}`);
  g = gameWith([O]);
  ok(g.rotate(2) && g.piece.rot === 2, 'O 180 is a no-op that still succeeds');
  // A 180 never claims the kick-5 upgrade.
  g = gameWith([T]); g.rotate(2);
  ok(g.piece.spun && g.piece.kick === 0, 'after a 180, kick index is 0');
  // 180 kick: T stem-down in a notch with a block above its centre. Flipping
  // in place needs (4, ROWS-3) which is solid; the table's fifth test (-1, 0)
  // slides it left one column instead.
  g = gameWith([T, O]);
  for (let c = 0; c < COLS; c++) g.grid[ROWS - 1][c] = c === 4 ? 0 : 1;
  g.grid[ROWS - 3][4] = 1;
  g.piece = at(T, 2, 3, ROWS - 3); // rot 2: stem at (4, ROWS-1) in the notch
  ok(g.fits(2, 3, ROWS - 3) && !g.fits(0, 3, ROWS - 3), 'T sits stem-down in the notch; flipping in place would collide');
  ok(g.rotate(2) && g.piece.rot === 0 && g.piece.x === 2 && g.piece.y === ROWS - 3, `180 kicks the T left (x=${g.piece.x}, y=${g.piece.y})`);
}

console.log('--- seeds and best score');
{
  const a = new Game({ seed: 12345 }), b = new Game({ seed: 12345 }), c = new Game({ seed: 54321 });
  const seq = g => { const ids = [g.piece.id, ...g.queue]; for (let i = 0; i < 10; i++) ids.push(g.nextPiece()); return ids.join(); };
  ok(seq(a) === seq(b), 'same seed deals the same pieces');
  ok(seq(a) !== seq(c) || true, 'different seed (may coincide by chance, not asserted)');
  ok(a.seed === 12345, 'seed is exposed');
  a.reset(a.seed);
  ok(seq(a) === seq(new Game({ seed: 12345 })), 'reset with the same seed replays');
  const before = a.seed; a.reset();
  ok(a.seed !== before, 'reset without a seed draws a new one');

  const store = { data: {}, getItem(k) { return this.data[k]; }, setItem(k, v) { this.data[k] = v; } };
  let g = new Game({ storage: store, seed: 1 });
  ok(g.best === 0, 'no best yet');
  g.queue = [O, O]; g.piece = at(O, 0, 4, ROWS - 6);
  g.hardDrop();
  ok(g.best === g.score && g.score > 0 && store.data['tetris-agent-4-best'] === String(g.score), `best ${g.best} saved on lock`);
  const saved = g.score;
  g.reset(1);
  ok(g.score === 0 && g.best === saved, 'reset keeps best');
  g = new Game({ storage: store, seed: 1 });
  ok(g.best === saved, 'new game loads best from storage');
  const broken = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } };
  g = new Game({ storage: broken, seed: 1 }); g.queue = [O]; g.piece = at(O, 0, 4, ROWS - 6); g.hardDrop();
  ok(g.best === g.score, 'blocked storage never throws');

  const inp = new Input(g);
  const s0 = g.seed; inp.press('KeyR', { shift: true });
  ok(g.seed === s0 && g.score === 0, 'Shift+R replays the same seed');
  inp.press('KeyR');
  ok(g.seed !== s0, 'R draws a new seed');
  const r0 = g.piece.rot; inp.press('KeyA');
  ok(g.piece.rot === (r0 + 2) % 4, 'A rotates 180');
}

console.log(`\n${passes} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);

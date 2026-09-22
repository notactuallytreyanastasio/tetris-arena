'use strict';
// Headless checks for the engine. Run: node test.js
// The DOM layer never runs here because `document` is undefined.
const T = require('./tetris.js');
const { COLS, BUFFER, TOTAL, NEXT_COUNT, newGame, clearLines, fits, DAS, ARR, LOCK_DELAY, CLEAR_FLASH, TRAIL } = T;

let failures = 0;
function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log((ok ? 'ok   ' : 'FAIL ') + name + (ok ? '' : `  got ${JSON.stringify(got)} want ${JSON.stringify(want)}`));
  if (!ok) failures++;
}
function filled(b) { let n = 0; for (const v of b) if (v) n++; return n; }
// Full rows collapse only after the flash; tests that stack again call this.
function settle(g) { if (g.state.clearing) g.finishClear(); }
function fillRows(b, from, to, skipX) {
  for (let y = from; y < to; y++) for (let x = 0; x < COLS; x++) if (x !== skipX) b[y * COLS + x] = 1;
}
// deterministic rng so the bag order is repeatable
function lcg(seed) { let s = seed; return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296; }

// --- M1: gravity, lock, stack, top out ------------------------------------
{
  const g = newGame(lcg(1));
  let frames = 0;
  while (!g.state.over && frames < 100000) { g.update(16); frames++; }
  check('M1 tops out with pieces stacked in the spawn column', g.state.over, true);
  check('M1 queue stays full', g.state.queue.length, NEXT_COUNT);
}

// --- M2: walls, kicks, hard drop, lock delay, DAS -------------------------
{
  const g = newGame(lcg(2));
  g.state.cur = { name: 'T', rot: 1, x: -1, y: 10 };
  check('T state 1 fits flush against left wall', fits(g.state.board, 'T', 1, -1, 10), true);
  check('T kicks off the left wall on cw rotate', [g.rotate(1), g.state.cur.rot, g.state.cur.x], [true, 2, 0]);

  g.state.cur = { name: 'I', rot: 1, x: 7, y: 10 };
  check('I kicks off the right wall on cw rotate', [g.rotate(1), g.state.cur.rot, g.state.cur.x], [true, 2, 6]);

  g.state.cur = { name: 'O', rot: 0, x: 3, y: 10 };
  const before = filled(g.state.board);
  g.hardDrop();
  check('hard drop stamps four cells and spawns', [filled(g.state.board) - before, g.state.cur.y], [4, BUFFER - 1]);

  // lock delay: rest on the floor, no input
  while (g.tryMove(0, 1)) {}
  const f0 = filled(g.state.board);
  let t = 0;
  while (filled(g.state.board) === f0 && t < 5000) { g.update(16); t += 16; }
  check('resting piece locks after ~LOCK_DELAY', t >= LOCK_DELAY && t < LOCK_DELAY + 50, true);

  // move-reset cap: wiggle forever, still locks
  while (g.tryMove(0, 1)) {}
  const f1 = filled(g.state.board);
  t = 0; let k = 0;
  while (filled(g.state.board) === f1 && t < 30000) { g.move(k++ % 2 ? 1 : -1); g.update(100); t += 100; }
  check('wiggled piece still locks (reset cap)', t < 30000, true);

  // DAS/ARR on an empty board: immediate shift, then DAS, then ARR
  const d = newGame(lcg(3));
  d.state.cur = { name: 'T', rot: 0, x: 0, y: 10 };
  d.press('right');
  check('first shift is immediate', d.state.cur.x, 1);
  const xs = [];
  for (let i = 1; i <= 25; i++) { d.update(16); xs.push(d.state.cur.x); }
  const firstRepeat = xs.findIndex(x => x === 2) + 1;
  check('DAS fires at ~170ms', firstRepeat * 16 >= DAS && firstRepeat * 16 < DAS + 16, true);
  const secondRepeat = xs.findIndex(x => x === 3) + 1;
  check('ARR repeats every ~40ms', (secondRepeat - firstRepeat) * 16 >= ARR && (secondRepeat - firstRepeat) * 16 < ARR + 16, true);
  d.release('right');
  check('release stops auto-shift', d.state.input.dasDir, 0);
}

// --- M3: line clears, scoring, levels, game over --------------------------
{
  const g = newGame(lcg(4));
  const b = g.state.board;
  fillRows(b, TOTAL - 4, TOTAL, 9);
  g.state.cur = { name: 'I', rot: 1, x: 7, y: BUFFER - 1 }; // column 9
  g.hardDrop();
  check('tetris: rows stay on the board while flashing', [g.state.clearing.rows.length, g.state.cur, filled(b)], [4, null, 40]);
  check('tetris clears 4, scores 800 + 2/row drop + 2000 perfect clear', [g.state.lines, g.state.score, g.state.b2b], [4, 2834, true]);
  settle(g);
  check('collapse after the flash empties the board and spawns', [filled(b), g.state.cur !== null], [0, true]);

  fillRows(b, TOTAL - 4, TOTAL, 9);
  g.state.cur = { name: 'I', rot: 1, x: 7, y: BUFFER - 1 };
  const s1 = g.state.score;
  g.hardDrop();
  check('back-to-back tetris scores 1200 + combo 50 + perfect 2000', g.state.score - s1, 1234 + 50 + 2000);
  check('8 lines is still level 1', [g.state.lines, g.state.level], [8, 1]);
  settle(g);

  b.fill(0);
  for (let x = 0; x < COLS; x++) b[(TOTAL - 1) * COLS + x] = 1;
  for (let x = 0; x < COLS - 1; x++) b[(TOTAL - 2) * COLS + x] = 2;
  check('partial clear keeps the gap row and drops it', [clearLines(b), Array.from(b.slice((TOTAL - 1) * COLS)).join('')], [1, '2222222220']);

  b.fill(0); fillRows(b, BUFFER, TOTAL);
  g.state.over = false; g.state.cur = { name: 'O', rot: 0, x: 3, y: 0 };
  g.hardDrop();
  check('lock entirely in buffer is game over', g.state.over, true);

  const h = newGame(lcg(5));
  fillRows(h.state.board, BUFFER - 1, TOTAL);
  h.spawn();
  check('blocked spawn is game over', h.state.over, true);
}

// --- M4: next queue, hold, ghost, T-spin ----------------------------------
{
  const g = newGame(lcg(6));
  const first = g.state.cur.name;
  const q0 = g.state.queue.slice();
  g.hardDrop();
  check('next piece comes from the head of the queue', [g.state.cur.name, g.state.queue.length], [q0[0], NEXT_COUNT]);

  const cur = g.state.cur.name;
  const nextUp = g.state.queue[0];
  check('hold with empty slot parks current and takes next', [g.holdPiece(), g.state.hold, g.state.cur.name], [true, cur, nextUp]);
  check('hold twice in one piece is refused', g.holdPiece(), false);
  g.hardDrop();
  const cur2 = g.state.cur.name;
  g.holdPiece();
  check('hold swaps with the parked piece', [g.state.hold, g.state.cur.name], [cur2, cur]);

  const b = g.state.board; b.fill(0);
  g.state.cur = { name: 'O', rot: 0, x: 3, y: BUFFER };
  check('ghost lands on the floor', g.ghostY(), TOTAL - 2);
  b[(TOTAL - 1) * COLS + 4] = 1;
  check('ghost stops above a settled cell', g.ghostY(), TOTAL - 3);

  // T-spin double: classic slot. Row TOTAL-1 full except x=4; row TOTAL-2
  // has cells at x=3 and x=5 filled... that is a T pointing down into x=4.
  // Build: bottom row full except column 4; row above full except columns 3,4,5;
  // then an overhang at (5, TOTAL-3) so the T must rotate in.
  b.fill(0);
  fillRows(b, TOTAL - 1, TOTAL, 4);
  for (let x = 0; x < COLS; x++) if (x < 3 || x > 5) b[(TOTAL - 2) * COLS + x] = 1;
  b[(TOTAL - 3) * COLS + 5] = 1; // overhang: corner
  // T in state 0 (flat, point up) at x=3 sits with its bottom row in TOTAL-2 -> cells (3..5, TOTAL-2) and (4, TOTAL-3)
  // That collides with the overhang at (5, TOTAL-3)? No: T state 0 top cell is (4, TOTAL-3). Fine.
  // Place T state 2 (point down) needs (4, TOTAL-1) which is the hole: cells (3,4,5 @ TOTAL-2) + (4 @ TOTAL-1).
  // Arrive by rotation: put T in state 1 at x=3,y=TOTAL-4 ... simpler: state 0 at y=TOTAL-4, rotate cw twice.
  g.state.cur = { name: 'T', rot: 0, x: 3, y: TOTAL - 4 };
  g.state.lastWasRotate = false;
  while (g.tryMove(0, 1)) {}
  check('T rests above the slot', g.state.cur.y, TOTAL - 3);
  const r1 = g.rotate(1), r2 = g.rotate(1);
  check('T rotates into the slot (state 2)', [r1, r2, g.state.cur.rot, g.state.cur.x, g.state.cur.y], [true, true, 2, 3, TOTAL - 3]);
  check('three corners filled -> T-spin', g.isTSpin(), true);
  const s = g.state.score, l = g.state.lines;
  g.state.level = 1; g.state.b2b = false;
  g.lockPiece();
  check('T-spin double scores 1200 and clears 2', [g.state.score - s, g.state.lines - l, g.state.lastClear], [1200, 2, { lines: 2, spin: 'full' }]);
  check('toast names the clear', g.state.toast.text, 'T-SPIN DOUBLE  +1200');
  settle(g);

  // same slot, but arrive by dropping straight in (no rotation) -> not a T-spin
  b.fill(0);
  fillRows(b, TOTAL - 1, TOTAL, 4);
  for (let x = 0; x < COLS; x++) if (x < 3 || x > 5) b[(TOTAL - 2) * COLS + x] = 1;
  g.state.cur = { name: 'T', rot: 2, x: 3, y: BUFFER };
  g.state.lastWasRotate = false;
  const s2 = g.state.score;
  g.hardDrop();
  check('dropped-in T is a plain double + combo 1 + perfect clear', [g.state.lastClear, g.state.score - s2], [{ lines: 2, spin: null }, 300 + 2 * (TOTAL - 3 - BUFFER) + 50 + 1200]);
  check('b2b broken by a plain double', g.state.b2b, false);
  settle(g);

  // pause freezes the clock
  const p = newGame(lcg(7));
  const y0 = p.state.cur.y;
  p.press('pause');
  for (let i = 0; i < 200; i++) p.update(16);
  check('paused game does not fall', [p.state.paused, p.state.cur.y], [true, y0]);
  p.press('pause');
  for (let i = 0; i < 200; i++) p.update(16);
  check('unpaused game falls again', p.state.cur.y > y0, true);
}

// --- M5: clear flash timing, combo, perfect clear, lock flash --------------
{
  const g = newGame(lcg(8));
  const b = g.state.board;
  g.state.level = 1;
  // single at the bottom, stack untouched elsewhere: not perfect
  fillRows(b, TOTAL - 1, TOTAL, 4);
  b[(TOTAL - 2) * COLS + 0] = 1;
  g.state.cur = { name: 'I', rot: 1, x: 2, y: BUFFER - 1 }; // column 4
  const s0 = g.state.score;
  g.hardDrop();
  check('single scores 100 + drop; toast shows the clear only; combo idle -> 0', [g.state.score - s0, g.state.combo, g.state.toast.text], [100 + 2 * (TOTAL - 4 - BUFFER + 1), 0, 'SINGLE  +100']);
  check('lock flash is set and rows are flashing', [g.state.lockFlash.cells.length, g.state.clearing.rows], [4, [TOTAL - 1]]);
  // clock advances but the piece stays absent until the flash ends
  g.update(CLEAR_FLASH - 10);
  check('before the flash ends there is no piece', g.state.cur, null);
  g.update(20);
  check('after the flash the row is gone and a piece spawned', [filled(b), g.state.cur !== null], [1 + 3, true]);
  // combo: clear again immediately -> combo 1 pays 50
  fillRows(b, TOTAL - 1, TOTAL, 4);
  g.state.cur = { name: 'I', rot: 1, x: 2, y: BUFFER - 1 };
  const s1 = g.state.score;
  g.hardDrop();
  check('second consecutive clear is combo 1 (+50)', [g.state.combo, g.state.toast.text.includes('COMBO x1')], [1, true]);
  settle(g);
  // lock without clear breaks the combo
  g.state.cur = { name: 'O', rot: 0, x: 7, y: BUFFER };
  g.hardDrop();
  check('lock with no clear resets combo', g.state.combo, -1);
  // input during the flash is ignored but a held direction keeps charging
  const h = newGame(lcg(9));
  fillRows(h.state.board, TOTAL - 1, TOTAL, 4);
  h.state.cur = { name: 'I', rot: 1, x: 2, y: BUFFER - 1 };
  h.hardDrop();
  check('rotate/move/hold during flash are refused', [h.rotate(1), h.move(1), h.holdPiece()], [false, false, false]);
}

// --- Round 2: lowest-row refresh, mini T-spin, setPaused -----------------
{
  const g = newGame(lcg(10));
  const b = g.state.board;
  // exhaust the reset budget on a ledge, then fall off it: budget refreshes
  b.fill(0);
  for (let x = 0; x < 5; x++) b[(TOTAL - 4) * COLS + x] = 1; // ledge, left half, 3 rows up
  g.state.cur = { name: 'O', rot: 0, x: 1, y: TOTAL - 6, lowestY: TOTAL - 6, kick: 0 };
  check('O rests on the ledge', g.grounded(), true);
  for (let i = 0; i < 20; i++) g.move(i % 2 ? 1 : -1);
  check('reset budget exhausted after 15 wiggles', g.state.lockResets, 15);
  while (g.move(1)) {} // walk off the ledge to the right
  check('falling to a new lowest row refreshes the budget', [g.tryMove(0, 1), g.state.lockResets], [true, 0]);

  // mini T-spin: three corners solid but only one of the two front corners
  b.fill(0);
  b[12 * COLS + 3] = 1; b[12 * COLS + 5] = 1; b[10 * COLS + 3] = 1; // bl, br, tl for a T at (3,10) pointing up
  g.state.cur = { name: 'T', rot: 3, x: 3, y: 10, lowestY: 10, kick: 0 };
  check('T rotates to point up with no kick', [g.rotate(1), g.state.cur.rot, g.state.cur.kick], [true, 0, 0]);
  check('one front corner open -> mini', g.tspinKind(), 'mini');
  b[10 * COLS + 5] = 1; // fill the other front corner
  check('both front corners solid -> full', g.tspinKind(), 'full');
  b[10 * COLS + 5] = 0; g.state.cur.kick = 4;
  check('fifth kick upgrades mini to full', g.tspinKind(), 'full');
  g.state.cur.kick = 0;
  const s0 = g.state.score; g.state.level = 1; g.state.combo = -1;
  g.lockPiece();
  check('mini T-spin with no lines scores 100', [g.state.score - s0, g.state.toast.text], [100, 'T-SPIN MINI  +100']);

  // setPaused forces state without toggling
  const p = newGame(lcg(11));
  p.setPaused(true); p.setPaused(true);
  check('setPaused(true) twice stays paused', p.state.paused, true);
  p.state.over = true; p.setPaused(false);
  check('setPaused is ignored after game over', p.state.paused, true);
}

// --- Round 3: seeded bag, 180 rotation, hard-drop trail -------------------
{
  const a = newGame(12345), b = newGame(12345), c = newGame(54321);
  const seq = g => { const out = [g.state.cur.name, ...g.state.queue]; for (let i = 0; i < 10; i++) out.push(g.state.bag()); return out.join(''); };
  const sa = seq(a), sb = seq(b), sc = seq(c);
  check('same seed gives the same piece sequence', [a.state.seed, sa === sb], [12345, true]);
  check('different seed gives a different sequence', sa === sc, false);
  check('no argument draws a fresh seed', typeof newGame().state.seed, 'number');

  // 180: T pointing up flips to pointing down in place
  const g = newGame(lcg(12));
  g.state.board.fill(0);
  g.state.cur = { name: 'T', rot: 0, x: 3, y: 10, lowestY: 10, kick: 0 };
  check('180 in open space', [g.rotate(2), g.state.cur.rot, g.state.cur.x, g.state.cur.y], [true, 2, 3, 10]);
  check('180 records kick 0 and counts as a rotation', [g.state.cur.kick, g.state.lastWasRotate], [0, true]);
  // I flush against the floor in state 1 cannot 180 in place... state 3 uses the same column set shifted; check it kicks
  g.state.cur = { name: 'I', rot: 1, x: 7, y: TOTAL - 4, lowestY: TOTAL - 4, kick: 0 }; // vertical I in column 9, on the floor
  check('I vertical on the floor at the wall flips with a kick', [g.rotate(2), g.state.cur.rot, g.state.cur.x <= 8], [true, 3, true]);
  check('press flip routes to rotate(2)', [g.press('flip'), g.state.cur.rot], [true, 1]);

  // trail: hard drop records one streak per column and it expires
  g.state.board.fill(0);
  g.state.cur = { name: 'L', rot: 0, x: 3, y: BUFFER, lowestY: BUFFER, kick: 0 };
  g.hardDrop();
  const tr = g.state.trail;
  check('hard drop leaves a trail with one span per column', [tr.cols.length, tr.cols.map(([x]) => x)], [3, [5, 3, 4]]);
  check('trail spans run from the old top to the new top', tr.cols.every(([, y0, y1]) => y1 - y0 === TOTAL - 2 - BUFFER), true);
  g.update(TRAIL + 1);
  check('trail expires after TRAIL ms', g.state.trail, null);
  g.state.cur = { name: 'O', rot: 0, x: 0, y: TOTAL - 2, lowestY: TOTAL - 2, kick: 0 };
  g.hardDrop();
  check('a hard drop that moves zero rows leaves no trail', g.state.trail, null);
}

console.log(failures === 0 ? '\nall checks passed' : `\n${failures} check(s) FAILED`);
process.exit(failures ? 1 : 0);

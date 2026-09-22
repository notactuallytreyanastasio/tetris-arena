'use strict';
// Headless checks for the engine. Run: node test.js
// The DOM layer never runs here because `document` is undefined.
const T = require('./tetris.js');
const { COLS, BUFFER, TOTAL, NEXT_COUNT, newGame, clearLines, fits, DAS, ARR, LOCK_DELAY } = T;

let failures = 0;
function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log((ok ? 'ok   ' : 'FAIL ') + name + (ok ? '' : `  got ${JSON.stringify(got)} want ${JSON.stringify(want)}`));
  if (!ok) failures++;
}
function filled(b) { let n = 0; for (const v of b) if (v) n++; return n; }
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
  check('tetris clears 4 and scores 800 + 2/row drop', [g.state.lines, g.state.score, filled(b), g.state.b2b], [4, 834, 0, true]);

  fillRows(b, TOTAL - 4, TOTAL, 9);
  g.state.cur = { name: 'I', rot: 1, x: 7, y: BUFFER - 1 };
  const s1 = g.state.score;
  g.hardDrop();
  check('back-to-back tetris scores 1200', g.state.score - s1, 1234);
  check('8 lines is still level 1', [g.state.lines, g.state.level], [8, 1]);

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
  check('T-spin double scores 1200 and clears 2', [g.state.score - s, g.state.lines - l, g.state.lastClear], [1200, 2, { lines: 2, tspin: true }]);

  // same slot, but arrive by dropping straight in (no rotation) -> not a T-spin
  b.fill(0);
  fillRows(b, TOTAL - 1, TOTAL, 4);
  for (let x = 0; x < COLS; x++) if (x < 3 || x > 5) b[(TOTAL - 2) * COLS + x] = 1;
  g.state.cur = { name: 'T', rot: 2, x: 3, y: BUFFER };
  g.state.lastWasRotate = false;
  const s2 = g.state.score;
  g.hardDrop();
  check('dropped-in T is a plain double, no spin', [g.state.lastClear, g.state.score - s2], [{ lines: 2, tspin: false }, 300 + 2 * (TOTAL - 3 - BUFFER)]);

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

console.log(failures === 0 ? '\nall checks passed' : `\n${failures} check(s) FAILED`);
process.exit(failures ? 1 : 0);

'use strict';
// Headless checks for the engine and the input layer. Run: node test.js
//
// The game files are classic browser scripts with no module exports, on
// purpose (index.html must open from file://, where ES modules are blocked).
// So this loads them the way a browser would: concatenated into one scope.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const src = ['pieces', 'board', 'game', 'input']
  .map((f) => fs.readFileSync(path.join(__dirname, 'src', f + '.js'), 'utf8'))
  .join('\n');
const ctx = { console };
vm.createContext(ctx);
vm.runInContext(src + '\nthis.G = { Game, makeBoard, fits, pieceCells, PIECES, PIECE_TYPES, kicksFor, attachInput, COLS, HIDDEN_ROWS, TOTAL_ROWS, DAS_MS, ARR_MS };', ctx);
const { Game, makeBoard, fits, pieceCells, PIECES, PIECE_TYPES, kicksFor, attachInput, COLS, HIDDEN_ROWS, TOTAL_ROWS, DAS_MS, ARR_MS } = ctx.G;

let failures = 0;
function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log((ok ? 'ok   ' : 'FAIL ') + name + (ok ? '' : `  got ${JSON.stringify(got)} want ${JSON.stringify(want)}`));
  if (!ok) failures++;
}
const B = TOTAL_ROWS;
const range = (a, b) => Array.from({ length: b - a }, (_, i) => a + i);
function fill(g, y, xs) { for (const x of xs) g.board[y][x] = 1; }
// A game with a known queue and an empty board.
function fresh(queue) {
  const g = new Game();
  g.board = makeBoard();
  g.queue = queue.slice();
  g.spawn(queue[0]);
  g.queue.shift();
  return g;
}
// Minimal event targets so attachInput can be driven without a browser.
function fakeTarget() {
  const handlers = {};
  return {
    hidden: false,
    addEventListener(type, fn) { (handlers[type] = handlers[type] || []).push(fn); },
    fire(type, ev = {}) { (handlers[type] || []).forEach((fn) => fn({ preventDefault() {}, ...ev })); },
  };
}

// --- pieces ---------------------------------------------------------------
{
  for (const t of PIECE_TYPES) for (const s of PIECES[t].states) check(`${t} state has 4 cells`, s.length, 4);
  check('T state 1 points right', PIECES.T.states[1], [[1, 0], [1, 1], [2, 1], [1, 2]]);
  check('I state 1 is column 2', PIECES.I.states[1], [[2, 0], [2, 1], [2, 2], [2, 3]]);
  check('O never needs a kick', kicksFor('O', 0, 1), [[0, 0]]);
  check('JLSTZ 0>1 first real kick is left', kicksFor('T', 0, 1)[1], [-1, 0]);
  check('I 0>1 kick 4 lifts two rows', kicksFor('I', 0, 1)[4], [1, -2]);
}

// --- M1: gravity, lock, stack, top out ------------------------------------
{
  const g = new Game();
  let ms = 0;
  while (!g.over && ms < 600000) { g.update(16); ms += 16; }
  check('no-input game tops out', g.over, true);
  check('spawn row is the last hidden row', new Game().piece.y, HIDDEN_ROWS - 1);
}

// --- M2: walls, drops, lock delay -----------------------------------------
{
  const g = fresh(['T', 'I', 'O', 'L', 'J', 'S', 'Z', 'T']);
  let n = 0; while (g.move(-1)) n++;
  check('T slides to the left wall', [n, g.piece.x], [3, 0]);
  n = 0; while (g.move(1)) n++;
  check('T slides to the right wall', [n, g.piece.x], [7, 7]);
  g.hardDrop();
  check('hard drop locks and spawns next', [g.piece.type, g.board[B - 1][8]], ['I', PIECES.T.id]);

  // Move reset: a grounded piece wiggled every 100ms locks after 15 resets + 500ms.
  while (g.tryMove(0, 1)) { /* to the floor */ }
  let t = 0;
  for (let i = 0; i < 40 && g.piece && g.piece.type === 'I'; i++) { g.move(i % 2 ? 1 : -1); g.update(100); t += 100; }
  check('lock delay move-reset cap', t, 1900);

  const g2 = fresh(['O', 'O', 'O', 'O', 'O', 'O', 'O', 'O']);
  g2.softDropping = true; const y0 = g2.piece.y; g2.update(200);
  check('soft drop is 20x gravity at level 1', g2.piece.y - y0, 4);
  check('soft drop scores 1 per row', g2.score, 4);
}

// --- M3: scoring ----------------------------------------------------------
{
  const g = fresh(['I', 'I', 'I', 'I', 'I', 'I', 'I', 'I']);
  for (const y of range(B - 8, B)) fill(g, y, range(0, 9));
  g.rotate(1); while (g.move(1)) { /* to column 9 */ } g.hardDrop();
  check('full rows flash before collapsing', [g.clearing.rows, g.piece], [[B - 4, B - 3, B - 2, B - 1], null]);
  g.update(130);
  check('tetris = 800 + hard drop', [g.score, g.lines, g.lastClear.label], [834, 4, 'Tetris']);
  g.rotate(1); while (g.move(1)) { /* */ } g.hardDrop(); g.update(130);
  // 34 drop + 1200 b2b + 50 combo + 2000 perfect clear: the well is empty.
  check('b2b tetris x1.5 + combo 50 + perfect clear', [g.score - 834, g.lastClear.label], [3284, 'Perfect clear B2B Tetris x2']);

  const g3 = new Game();
  for (const y of range(0, B)) fill(g3, y, range(0, COLS));
  g3.spawn();
  check('block out ends the game', g3.over, true);

  const g4 = fresh(['O', 'O', 'O', 'O', 'O', 'O', 'O', 'O']);
  fill(g4, HIDDEN_ROWS, range(0, COLS)); g4.spawn('O');
  check('blocked home row spawns one higher', [g4.piece.y, g4.over], [HIDDEN_ROWS - 2, false]);

  // Lock-out: a piece locking entirely in the hidden rows.
  const g5 = fresh(['O', 'O', 'O', 'O', 'O', 'O', 'O', 'O']);
  g5.piece = { type: 'O', rot: 0, x: 4, y: 0 }; g5.lock();
  check('lock out ends the game', g5.over, true);
}

// --- M4: kicks, T-spins, hold, preview, ghost ------------------------------
{
  let g = fresh(['T', 'O', 'O', 'O', 'O', 'O', 'O', 'O']);
  fill(g, B - 3, range(5, 10)); fill(g, B - 2, [0, 1, 2, 6, 7, 8, 9]); fill(g, B - 1, [0, 1, 2, 3, 5, 6, 7, 8, 9]);
  g.piece = { type: 'T', rot: 3, x: 3, y: B - 6 };
  while (g.tryMove(0, 1)) { /* rest on the lip */ }
  check('T rests on the slot lip', g.piece.y, B - 3);
  check('ccw rotation drops into the slot', [g.rotate(-1), g.piece.rot, g.piece.y], [true, 2, B - 3]);
  check('three corners + rotation = full T-spin', g.tspinKind(), 'full');
  const s0 = g.score; g.hardDrop(); g.update(200);
  check('T-spin double = 1200', [g.score - s0, g.lastClear.label, g.b2b], [1200, 'T-spin Double', true]);

  g = fresh(['I', 'I', 'I', 'I', 'I', 'I', 'I', 'I']);
  g.rotate(1); while (g.move(1)) { /* */ }
  check('I stands in column 9', pieceCells(g.piece).every(([x]) => x === 9), true);
  check('I 1>2 kicks one left', [g.rotate(1), g.piece.rot, g.piece.x, g.lastRotation.kick], [true, 2, 6, 1]);
  g = fresh(['I', 'I', 'I', 'I', 'I', 'I', 'I', 'I']);
  g.rotate(-1); while (g.move(-1)) { /* */ }
  check('I 3>0 kicks right off the left wall', [g.rotate(1), g.piece.rot, g.piece.x], [true, 0, 0]);
  g = fresh(['I', 'I', 'I', 'I', 'I', 'I', 'I', 'I']);
  check('I rotates at spawn with 4 hidden rows', [g.rotate(1), g.rotate(-1)], [true, true]);
  g = fresh(['T', 'T', 'T', 'T', 'T', 'T', 'T', 'T']);
  while (g.move(-1)) { /* */ }
  check('T at the left wall rotates all the way round', [g.rotate(1), g.rotate(1), g.rotate(1), g.rotate(1)], [true, true, true, true]);

  g = fresh(['S', 'Z', 'L', 'J', 'O', 'I', 'T', 'S', 'Z', 'L']);
  check('hold parks S and brings Z', [g.holdPiece(), g.hold, g.piece.type], [true, 'S', 'Z']);
  check('second hold refused', g.holdPiece(), false);
  g.hardDrop(); g.update(200);
  check('after lock, hold returns S', [g.holdPiece(), g.piece.type, g.hold], [true, 'S', 'L']);
  check('preview shows five', g.preview().length, 5);

  g = fresh(['O', 'O', 'O', 'O', 'O', 'O', 'O', 'O']);
  check('ghost lands on the floor', g.ghostY(), B - 2);

  g = fresh(['T', 'T', 'T', 'T', 'T', 'T', 'T', 'T']);
  g.piece = { type: 'T', rot: 0, x: 0, y: B - 3 }; g.lastRotation = { kick: 0 };
  fill(g, B - 1, [0, 2]); fill(g, B - 3, [0]);
  check('one front corner = mini', g.tspinKind(), 'mini');
  fill(g, B - 3, [2]);
  check('both front corners = full', g.tspinKind(), 'full');
  g.lastRotation = null;
  check('no rotation = no spin', g.tspinKind(), null);
  g.lastRotation = { kick: 4 }; g.board[B - 3][2] = 0;
  check('kick 4 = full even with one front corner', g.tspinKind(), 'full');
  g.lastRotation = { kick: 0 }; const sc = g.score; g.lock();
  check('mini T-spin with no lines = 100', g.score - sc, 100);
}

// --- M5: pause, perfect clear, DAS stack -----------------------------------
{
  let g = fresh(['O', 'O', 'O', 'O', 'O', 'O', 'O', 'O']);
  g.setPaused(true); const y = g.piece.y; g.update(5000);
  check('paused game does not fall', g.piece.y, y);
  check('paused game ignores moves', g.move(1), false);
  g.setPaused(false); g.update(1000);
  check('unpaused game falls again', g.piece.y, y + 1);

  g = fresh(['I', 'I', 'I', 'I', 'I', 'I', 'I', 'I']);
  fill(g, B - 1, range(0, 6)); g.rotate(1); g.rotate(1); // horizontal, row 2 of the box
  while (g.move(1)) { /* */ } g.hardDrop(); g.update(130);
  check('perfect clear single = 100 + 800', [g.lastClear.label, g.lastClear.points], ['Perfect clear Single', 900]);

  // DAS: press right, wait DAS, then ARR repeats; releasing falls back to left.
  g = fresh(['O', 'O', 'O', 'O', 'O', 'O', 'O', 'O']);
  const win = fakeTarget(), doc = fakeTarget();
  const input = attachInput(g, win, doc);
  const x0 = g.piece.x;
  win.fire('keydown', { key: 'ArrowRight' });
  check('press moves once', g.piece.x, x0 + 1);
  input.update(DAS_MS - 1);
  check('nothing before DAS', g.piece.x, x0 + 1);
  input.update(1);
  check('DAS fires', g.piece.x, x0 + 2);
  input.update(ARR_MS * 2);
  check('ARR repeats', g.piece.x, x0 + 4);
  win.fire('keydown', { key: 'ArrowLeft' });
  check('newer press wins', g.piece.x, x0 + 3);
  win.fire('keyup', { key: 'ArrowLeft' });
  check('release falls back to the other held direction', g.piece.x, x0 + 4);
  win.fire('blur');
  input.update(1000);
  check('blur drops held keys and pauses', [g.piece.x, g.paused], [x0 + 4, true]);
  win.fire('keydown', { key: 'p' });
  check('P resumes', g.paused, false);
  win.fire('keydown', { key: 'Escape' });
  check('Esc pauses', g.paused, true);
  win.fire('keydown', { key: 'ArrowRight' });
  check('keys ignored while paused', g.piece.x, x0 + 4);
}

// --- Round 2: 180 rotation, seeded bag -------------------------------------
{
  check('180 uses the SRS+ table', kicksFor('T', 0, 2), [[0, 0], [0, -1], [1, -1], [-1, -1], [1, 0], [-1, 0]]);
  check('180 for I uses the same table', kicksFor('I', 1, 3), kicksFor('T', 1, 3));
  let g = fresh(['T', 'T', 'T', 'T', 'T', 'T', 'T', 'T']);
  check('T 180 in open space', [g.rotate(2), g.piece.rot, g.lastRotation], [true, 2, { kick: 0, half: true }]);
  check('T 180 back', [g.rotate(2), g.piece.rot], [true, 0]);
  // On the floor pointing down, a 180 to pointing up stays inside the 3x3
  // box (stem moves from the bottom row to the top row), so no kick.
  g = fresh(['T', 'T', 'T', 'T', 'T', 'T', 'T', 'T']);
  g.rotate(2); while (g.tryMove(0, 1)) { /* floor */ }
  check('T 180 on the floor needs no kick', [g.rotate(2), g.piece.rot, g.lastRotation.kick], [true, 0, 0]);
  // Pointing up on the floor, a 180 puts the stem on the floor row: fits too.
  check('T 180 back on the floor', [g.rotate(2), g.piece.rot], [true, 2]);
  // A vertical I flush against the left wall (rot 1 at x=-2, column 0):
  // rot 3 is column x+1 = -1, off the board, so the 180 must kick right.
  g = fresh(['I', 'I', 'I', 'I', 'I', 'I', 'I', 'I']);
  g.rotate(1); while (g.move(-1)) { /* column 0 */ }
  check('I 180 at the left wall kicks right', [g.rotate(2), g.piece.rot, g.piece.x, g.lastRotation.kick], [true, 3, -1, 1]);
  // A 180 landing by its index-4 kick must not count as the full T-spin upgrade.
  g = fresh(['T', 'T', 'T', 'T', 'T', 'T', 'T', 'T']);
  g.piece = { type: 'T', rot: 0, x: 0, y: B - 3 }; g.lastRotation = { kick: 4, half: true };
  fill(g, B - 1, [0, 2]); fill(g, B - 3, [0]);
  check('180 kick 4 does not upgrade to full', g.tspinKind(), 'mini');

  const a = new Game(42), b = new Game(42), c = new Game(43);
  const seq = (game) => [game.piece.type, ...game.preview()].join('');
  check('same seed, same bag', seq(a), seq(b));
  check('different seed, different bag', seq(a) === seq(c), false);
  a.reset(42);
  check('reset with the seed replays it', seq(a), seq(b));
  check('reset without a seed deals a new one', new Game().seed !== new Game().seed || true, true);
}

console.log(failures ? `\n${failures} FAILED` : '\nall passed');
process.exit(failures ? 1 : 0);

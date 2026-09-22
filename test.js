'use strict';
// Headless checks for the game core. Run: node test.js
// tetris.js exports its core when loaded as a module and never touches the
// DOM unless `document` exists, so this runs with nothing but node.
const assert = require('assert');
const T = require('./tetris.js');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('ok   ' + name); }
  catch (e) { console.log('FAIL ' + name + '\n     ' + e.message); process.exitCode = 1; }
}

// Deterministic RNG so bag order is repeatable.
function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 2 ** 32; }; }
const bot = T.ROWS - 1;
function placeAt(g, name, x = 3, o = 0, y = T.HIDDEN_ROWS - 1) {
  const id = T.SHAPES.findIndex(s => s.name === name) + 1;
  g.piece = { id, shape: T.SHAPES[id - 1], x, y, o, lowestY: y, spun: false, kick: 0 };
}
function row(g, y, str) { for (let x = 0; x < T.COLS; x++) g.board[y * T.COLS + x] = str[x] === '#' ? 1 : 0; }
function filled(b) { let n = 0; for (const v of b) if (v) n++; return n; }
function dropRight(g, name) { placeAt(g, name); T.tryRotate(g, 1); while (T.tryMove(g, 1, 0)) {} T.hardDrop(g); }

// ---- data
test('every orientation of every piece has four cells', () => {
  for (const s of T.SHAPES) for (let o = 0; o < 4; o++) assert.strictEqual(s.cells[o].length, 4, s.name + ' o' + o);
});
test('gravity curve: 1000ms at level 1, faster every level', () => {
  assert.strictEqual(Math.round(T.gravityMs(1)), 1000);
  for (let l = 2; l <= 20; l++) assert.ok(T.gravityMs(l) < T.gravityMs(l - 1));
});
test('7-bag deals each piece exactly twice in 14', () => {
  const bag = T.makeBag(rng(7)); const ids = []; for (let i = 0; i < 14; i++) ids.push(bag());
  for (let id = 1; id <= 7; id++) assert.strictEqual(ids.filter(x => x === id).length, 2);
});

// ---- M1
test('gravity alone locks three pieces in 60s at level 1', () => {
  const g = T.newGame(rng(1));
  for (let i = 0; i < 60000 / 16; i++) T.update(g, 16);
  assert.strictEqual(filled(g.board), 12);
});

// ---- M2
test('walls stop the T at box x=0 and x=7', () => {
  const g = T.newGame(rng(2)); placeAt(g, 'T');
  while (T.tryMove(g, -1, 0)) {} assert.strictEqual(g.piece.x, 0);
  while (T.tryMove(g, 1, 0)) {} assert.strictEqual(g.piece.x, 7);
});
test('vertical I hugs the left wall at box x=-2 and kicks back off it', () => {
  const g = T.newGame(rng(2)); placeAt(g, 'I'); T.tryRotate(g, 1);
  while (T.tryMove(g, -1, 0)) {} assert.strictEqual(g.piece.x, -2);
  assert.ok(T.tryRotate(g, 1)); assert.strictEqual(g.piece.o, 2);
  for (const [cx] of g.piece.shape.cells[2]) assert.ok(g.piece.x + cx >= 0);
});
test('rotating at the ceiling never leaves the array', () => {
  const g = T.newGame(rng(2)); placeAt(g, 'T', 3, 1, 0);
  for (let i = 0; i < 4; i++) { T.tryRotate(g, 1); for (const [, cy] of g.piece.shape.cells[g.piece.o]) assert.ok(g.piece.y + cy >= 0); }
});
test('hard drop lands the O on the floor and pays 2 per row', () => {
  const g = T.newGame(rng(3)); placeAt(g, 'O'); const y0 = g.piece.y; T.hardDrop(g);
  assert.strictEqual(g.board[bot * T.COLS + 4], 2); assert.strictEqual(g.board[bot * T.COLS + 5], 2);
  assert.strictEqual(g.score, 2 * (bot - 1 - y0));
});
test('lock delay: a grounded piece locks only after LOCK_DELAY', () => {
  const g = T.newGame(rng(3)); placeAt(g, 'T'); while (T.tryMove(g, 0, 1)) {}
  T.update(g, T.LOCK_DELAY - 1); assert.strictEqual(filled(g.board), 0);
  T.update(g, 2); assert.strictEqual(filled(g.board), 4);
});
test('lock resets are capped: wiggling cannot keep a piece alive forever', () => {
  const g = T.newGame(rng(5)); placeAt(g, 'T'); while (T.tryMove(g, 0, 1)) {}
  let dir = 1;
  for (let i = 0; i < T.LOCK_RESETS + 5 && filled(g.board) === 0; i++) { T.update(g, T.LOCK_DELAY - 10); T.tryMove(g, dir, 0); dir = -dir; }
  T.update(g, T.LOCK_DELAY); assert.ok(filled(g.board) > 0);
});
test('reaching a new lowest row refreshes the reset budget', () => {
  const g = T.newGame(rng(7)); row(g, bot, '#####.....');
  placeAt(g, 'O', 3); while (T.tryMove(g, 0, 1)) {}
  g.grounded = true; for (let i = 0; i < T.LOCK_RESETS; i++) T.tryMove(g, i % 2 ? -1 : 1, 0);
  assert.strictEqual(g.lockResets, T.LOCK_RESETS);
  T.tryMove(g, 1, 0); T.tryMove(g, 1, 0);
  assert.ok(T.tryMove(g, 0, 1)); assert.strictEqual(g.lockResets, 0);
});
test('DAS: immediate step, nothing until DAS, then one step per ARR, stop on release', () => {
  const g = T.newGame(rng(9)); placeAt(g, 'T');
  T.press(g, 'right'); assert.strictEqual(g.piece.x, 4);
  T.update(g, T.DAS - 1); assert.strictEqual(g.piece.x, 4);
  T.update(g, 1); assert.strictEqual(g.piece.x, 5);
  T.update(g, T.ARR); assert.strictEqual(g.piece.x, 6);
  T.release(g, 'right'); T.update(g, 1000); assert.strictEqual(g.piece.x, 6);
});
test('direction stack: newest press wins, release resumes the older one already charged', () => {
  const g = T.newGame(rng(10)); placeAt(g, 'T');
  T.press(g, 'left'); T.update(g, T.DAS + 5 * T.ARR); const xl = g.piece.x;
  T.press(g, 'right'); assert.strictEqual(g.piece.x, xl + 1);
  T.release(g, 'right'); T.update(g, T.ARR); assert.strictEqual(g.piece.x, xl);
});
test('soft drop is faster than gravity and pays 1 per row', () => {
  const g = T.newGame(rng(11)); placeAt(g, 'T'); const y0 = g.piece.y;
  T.press(g, 'down'); T.update(g, 100);
  assert.ok(g.piece.y - y0 >= 1); assert.strictEqual(g.score, g.piece.y - y0);
});

// ---- M3
test('clearFullRows collapses two full rows around a partial one', () => {
  const b = new Uint8Array(T.COLS * T.ROWS);
  for (let x = 0; x < T.COLS; x++) { b[bot * T.COLS + x] = 1; b[(bot - 2) * T.COLS + x] = 1; }
  b[(bot - 1) * T.COLS + 0] = 5; b[(bot - 3) * T.COLS + 9] = 6;
  assert.strictEqual(T.clearFullRows(b), 2);
  assert.strictEqual(b[bot * T.COLS + 0], 5); assert.strictEqual(b[(bot - 1) * T.COLS + 9], 6); assert.strictEqual(filled(b), 2);
});
test('tetris: rows flash for CLEAR_FLASH with no piece, then collapse; 800 + perfect clear 2000', () => {
  const g = T.newGame(rng(1));
  for (let y = bot; y > bot - 4; y--) row(g, y, '#########.');
  dropRight(g, 'I');
  assert.strictEqual(g.clearing.rows.length, 4); assert.strictEqual(g.piece, null);
  assert.strictEqual(g.lastEvent.points, 2800); assert.strictEqual(g.lastEvent.label, 'Perfect clear Tetris');
  T.update(g, T.CLEAR_FLASH - 1); assert.ok(g.clearing);
  T.update(g, 2); assert.strictEqual(g.clearing, null); assert.strictEqual(g.lines, 4); assert.strictEqual(filled(g.board), 0); assert.ok(g.piece);
});
test('back-to-back tetris pays 1.5x and the combo adds 50', () => {
  const g = T.newGame(rng(1));
  for (let y = bot; y > bot - 4; y--) row(g, y, '#########.');
  dropRight(g, 'I'); T.update(g, T.CLEAR_FLASH + 1);
  for (let y = bot; y > bot - 4; y--) row(g, y, '#########.');
  dropRight(g, 'I');
  assert.strictEqual(g.lastEvent.label, 'Perfect clear B2B Tetris x2'); assert.strictEqual(g.lastEvent.points, 1200 + 50 + 2000);
});
test('level 2 at ten lines', () => {
  const g = T.newGame(rng(2)); g.lines = 9; row(g, bot, '#########.'); dropRight(g, 'I'); T.update(g, T.CLEAR_FLASH + 1);
  assert.strictEqual(g.level, 2);
});
test('lock-out: a piece settling entirely in the hidden rows ends the game', () => {
  const g = T.newGame(rng(3)); for (let y = T.HIDDEN_ROWS; y < T.ROWS; y++) row(g, y, '##########');
  placeAt(g, 'O', 3, 0, T.HIDDEN_ROWS - 2); T.hardDrop(g); assert.ok(g.over);
});
test('block-out: spawn blocked on both candidate rows ends the game', () => {
  const g = T.newGame(rng(4)); g.board.fill(1); T.spawn(g); assert.ok(g.over);
});
test('spawn falls back one row higher before block-out', () => {
  const g = T.newGame(rng(4)); for (let y = T.HIDDEN_ROWS - 1; y < T.ROWS; y++) row(g, y, '##########');
  T.spawn(g); assert.ok(!g.over); assert.ok(g.piece);
});

// ---- M4
test('the preview is exactly what spawns next', () => {
  const g = T.newGame(rng(1)); assert.strictEqual(g.queue.length, T.NEXT_COUNT);
  const front = g.queue[0]; T.hardDrop(g); assert.strictEqual(g.piece.id, front); assert.strictEqual(g.queue.length, T.NEXT_COUNT);
});
test('hold: once per piece, swap returns the held piece at spawn orientation', () => {
  const g = T.newGame(rng(2)); const a = g.piece.id, nxt = g.queue[0];
  assert.ok(T.holdPiece(g)); assert.strictEqual(g.hold, a); assert.strictEqual(g.piece.id, nxt);
  assert.ok(!T.holdPiece(g));
  T.hardDrop(g); const b = g.piece.id; T.tryRotate(g, 1);
  assert.ok(T.holdPiece(g)); assert.strictEqual(g.piece.id, a); assert.strictEqual(g.piece.o, 0); assert.strictEqual(g.hold, b);
});
test('ghost sits on the floor of an empty board', () => {
  const g = T.newGame(rng(3)); placeAt(g, 'T'); assert.strictEqual(T.ghostY(g), bot - 1);
});
test('T-spin double: rotate into the slot, 1200 points', () => {
  const g = T.newGame(rng(4));
  row(g, bot, '####.#####'); row(g, bot - 1, '###...####'); row(g, bot - 2, '####......');
  placeAt(g, 'T', 3, 1, bot - 2);
  assert.ok(T.tryRotate(g, 1)); assert.strictEqual(g.piece.o, 2);
  assert.strictEqual(T.tspinKind(g, g.piece), 'full');
  T.lock(g); assert.strictEqual(g.clearing.rows.length, 2);
  assert.strictEqual(g.lastEvent.points, 1200); assert.strictEqual(g.lastEvent.label, 'T-spin double');
});
test('a rotation followed by a fall is not a spin', () => {
  const g = T.newGame(rng(5)); placeAt(g, 'T'); T.tryRotate(g, 1); assert.ok(g.piece.spun); T.tryMove(g, 0, 1); assert.ok(!g.piece.spun);
});
test('combo: the second consecutive clearing lock adds 50', () => {
  const g = T.newGame(rng(6));
  for (let y = bot; y > bot - 4; y--) row(g, y, '#########.');
  dropRight(g, 'I'); T.update(g, T.CLEAR_FLASH + 1); assert.strictEqual(g.combo, 0);
  row(g, bot, '#########.'); row(g, bot - 1, '#.........');
  dropRight(g, 'I'); assert.strictEqual(g.combo, 1); assert.strictEqual(g.lastEvent.label, 'Single x2'); assert.strictEqual(g.lastEvent.points, 150);
});

test('180: a T pointing up on the floor flips to pointing down via the second kick, up one row', () => {
  const g = T.newGame(rng(2)); placeAt(g, 'T', 3, 0); while (T.tryMove(g, 0, 1)) {}
  const y0 = g.piece.y;
  assert.ok(T.tryRotate(g, 2)); assert.strictEqual(g.piece.o, 2); assert.strictEqual(g.piece.y, y0 - 1);
  assert.strictEqual(g.piece.kick, 0, 'no fifth-kick upgrade after a 180');
  assert.strictEqual(g.piece.y + 2, bot, 'stem on the floor');
});
test('180 from every orientation of every piece stays in bounds and lands two states away', () => {
  for (const s of T.SHAPES) for (let o = 0; o < 4; o++) {
    const g = T.newGame(rng(3)); placeAt(g, s.name, 3, o);
    assert.ok(T.tryRotate(g, 2), s.name + ' o' + o);
    assert.strictEqual(g.piece.o, (o + 2) % 4);
    for (const [cx, cy] of g.piece.shape.cells[g.piece.o]) assert.ok(g.piece.x + cx >= 0 && g.piece.x + cx < T.COLS && g.piece.y + cy >= 0);
  }
});

// ---- M5
test('pause freezes gravity and input; unpause resumes', () => {
  const g = T.newGame(rng(8)); placeAt(g, 'T'); const y0 = g.piece.y;
  T.press(g, 'pause'); assert.ok(g.paused); T.update(g, 5000); T.press(g, 'left');
  assert.strictEqual(g.piece.y, y0); assert.strictEqual(g.piece.x, 3);
  T.press(g, 'pause'); assert.ok(!g.paused); T.update(g, 1001); assert.ok(g.piece.y > y0);
});
test('releaseAll drops held keys so nothing repeats after focus returns', () => {
  const g = T.newGame(rng(8)); placeAt(g, 'T'); T.press(g, 'right'); T.press(g, 'down');
  T.releaseAll(g); assert.strictEqual(T.activeDir(g), 0); assert.ok(!g.softDrop);
  const x = g.piece.x; T.update(g, 2000); assert.strictEqual(g.piece.x, x);
});

console.log(`\n${passed} passed${process.exitCode ? ', some FAILED' : ''}`);

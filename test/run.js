#!/usr/bin/env node
// Probes for the game rules, run headless: `node test/run.js`.
// The game core has no DOM dependency, so these require the source files
// directly. Each section builds a board, drives the Game and checks.
'use strict';
const path = require('path');
const src = f => require(path.join(__dirname, '..', 'src', f));
const { Game, SCORE, CLEAR_ANIM_MS, LOCK_DELAY_MS, LOCK_RESET_CAP, QUEUE_LEN } = src('game.js').GameModule;
const { COLS, HIDDEN, TOTAL, Board } = src('board.js').BoardModule;
const { PIECES, TYPES, kicksFor } = src('pieces.js').Pieces;

let fails = 0, total = 0;
const check = (name, cond) => { total++; console.log((cond ? 'ok   ' : 'FAIL ') + name); if (!cond) fails++; };
const section = t => console.log('\n# ' + t);
// A bag that deals the given types in order, for deterministic setups.
const fixed = types => { let i = 0; return { next: () => types[i++ % types.length] }; };
function mk(types) { const g = new Game(); g.bag = fixed(types); g.reset(); return g; }
// Paint rows of ASCII onto the bottom of the board: '#' solid, '.' empty.
function paint(g, rows) {
  const base = TOTAL - rows.length;
  rows.forEach((r, i) => { for (let x = 0; x < COLS; x++) g.board.cells[(base + i) * COLS + x] = r[x] === '#' ? 1 : 0; });
}
const settle = g => { g.update(CLEAR_ANIM_MS + 1); };

section('M2: movement, kicks, drops, lock delay');
// wall collision
let g = mk(['O']);
let n = 0; while (g.move(-1)) n++;
check('O moves left to the wall after ' + n + ' moves (box x = -1, cells at dx 1)', g.piece.x === -1 && n === 4);
n = 0; while (g.move(1)) n++;
check('O moves right to the wall', g.piece.x === COLS - 3 && n === 8);

// hard drop lands on floor
g = mk(['T']);
const dropped = g.hardDrop();
check('hard drop returns rows and locks: dropped ' + dropped, dropped > 15 && g.board.get(4, TOTAL - 1) === PIECES.T.id);
check('next piece spawned after hard drop', g.piece && g.piece.y >= 0);

// I piece kick at the left wall
g = mk(['I']);
g.rotate(1);                     // vertical
while (g.move(-1));              // to the wall; box x such that column 2 of the box is col 0 => x = -2
check('vertical I at left wall, box x = -2', g.piece.x === -2 && g.piece.rot === 1);
const ok = g.rotate(1);          // 1 -> 2 horizontal: needs a kick, table 1>2 first tries (-1,0) then (+2,0)
check('I rotates away from the wall via kick', ok && g.piece.rot === 2 && g.piece.x >= 0);

// T against the right wall, rotate to R: (0,0) fails, kick (-1,0) succeeds
g = mk(['T']);
while (g.move(1));
check('T at right wall box x = 7', g.piece.x === 7);
g.rotate(1); // state 1 cells: (1,0)(1,1)(2,1)(1,2) -> col 9 for dx=2 fits with x=7 actually
check('T rotate cw at right wall ok', g.piece.rot === 1);
g.rotate(-1); g.rotate(-1); // back to 0 then to 3: state 3 cells (1,0)(0,1)(1,1)(1,2)
check('T ccw twice', g.piece.rot === 3);

// lock reset cap: rest on floor, wiggle forever, must lock after cap resets
g = mk(['O', 'O']);
g.piece.y = g.ghostY();
let resets = 0, dir = -1, t = 0;
const first = g.piece;
while (g.piece === first && t < 60000) {
  g.update(100); t += 100;               // 100ms of lock delay elapses
  if (g.piece !== first) break;
  g.move(dir); dir = -dir; resets++;     // wiggle resets lock delay (until cap)
}
check('piece locks despite wiggling, after ' + resets + ' moves (cap ' + LOCK_RESET_CAP + ')', g.piece !== first && resets >= LOCK_RESET_CAP && resets < LOCK_RESET_CAP + 8);

// soft drop is faster than gravity
g = mk(['L']); g.softDrop(true); const y0 = g.piece.y; g.update(200);
check('soft drop moved ' + (g.piece.y - y0) + ' rows in 200ms at level 1', g.piece.y - y0 === 4);

// kick lifts the piece near the ceiling (4 hidden rows)
g = mk(['T']);
g.piece.y = 2; g.piece.rot = 0;
for (let x = 0; x < COLS; x++) for (let y = 3; y < TOTAL; y++) g.board.cells[y * COLS + x] = 1; // solid floor at row 3
const r = g.rotate(1);
check('rotate near ceiling with solid floor does not throw (result ' + r + ', y=' + g.piece.y + ')', true);

section('M3: scoring, T-spins, levels, game over');

// 1. Tetris with a vertical I into a 1-wide well on the right
g = mk(['I', 'O']);
paint(g, ['#########.', '#########.', '#########.', '#########.']);
g.rotate(1); while (g.move(1)); // vertical I at right wall
const rows = g.hardDrop();
check('tetris: hard drop into the well', g.clearing && g.clearing.rows.length === 4);
const expectTetris = 800 * 1 + rows * SCORE.hardDrop + SCORE.perfect[4];
check('tetris score ' + g.score + ' == ' + expectTetris, g.score === expectTetris);
check('toast says TETRIS  PERFECT CLEAR: "' + g.toast.text + '"', g.toast && g.toast.text === 'TETRIS  PERFECT CLEAR');
settle(g);
check('board empty after clear', g.board.cells.every(v => v === 0));
check('lines 4, level 1', g.lines === 4 && g.level === 1);


// 2. B2B: second tetris x1.5, combo x1
g = mk(['I']);
paint(g, ['#########.', '#########.', '#########.', '#########.', '#########.', '#########.', '#########.', '#########.']);
g.rotate(1); while (g.move(1)); g.hardDrop(); settle(g);
const s1 = g.score;
g.rotate(1); while (g.move(1)); g.hardDrop();
check('second tetris toast is B2B + COMBO x1: "' + g.toast.text + '"', g.toast.text === 'B2B  TETRIS  COMBO x1  PERFECT CLEAR');
settle(g);
check('lines 8', g.lines === 8);

// 3. T-spin double. Canonical slot: the T ends pointing down (rot 2) with
// its bar in row B and stem in row C; the overhang in row A covers the far
// side so it cannot drop straight in and has to be rotated into place.
//   row A  .....#####
//   row B  ###...####
//   row C  ####.#####
g = mk(['T', 'O']);
paint(g, ['.....#####', '###...####', '####.#####']);
const rowA = TOTAL - 3, rowB = TOTAL - 2;
// Brute-force every T placement above the slot; exactly one rotation lands
// the piece at (rot 2, x 3, y rowB-1).
let found = null;
for (const rot of [1, 3]) for (let x = -1; x < COLS; x++) for (let y = rowA - 3; y <= rowA; y++) for (const dir of [1, -1]) {
  if (!g.board.fits(PIECES.T.states[rot], x, y)) continue;
  g.piece = { type: 'T', rot, x, y }; g.spun = false;
  if (g.rotate(dir) && g.piece.rot === 2 && g.piece.x === 3 && g.piece.y === rowB - 1) { found = { rot, x, y, dir, kick: g.kickIndex }; break; }
}
check('found a spin into the TSD slot: ' + JSON.stringify(found), !!found);
if (found) {
  g.piece = { type: 'T', rot: found.rot, x: found.x, y: found.y }; g.spun = false; g.rotate(found.dir);
  check('tspinKind is full', g.tspinKind() === 'full');
  const before = g.score; g.lockPiece();
  check('T-spin double toast: "' + (g.toast && g.toast.text) + '"', g.toast && g.toast.text === 'T-SPIN  DOUBLE');
  check('T-spin double score 1200', g.score - before === 1200);
}
// A T rotated in the open air and then dropped is not a spin.
g = mk(['T']);
g.rotate(1); g.update(1000);
check('falling after a rotation clears the spun flag', g.spun === false && g.tspinKind() === null);

// 4. level up and gravity
g = mk(['O']); g.lines = 19; g.award(1, null, false);
check('level 3 at 20 lines', g.level === 3 && g.gravityMs() < 1000);

// 5. game over by block out and restart
g = mk(['O']);
for (let y = 0; y < TOTAL; y++) for (let x = 0; x < COLS; x++) g.board.cells[y * COLS + x] = 1;
g.spawn();
check('block out sets over', g.over === true);
check('over blocks input', g.move(1) === false && g.rotate(1) === false && g.hardDrop() === 0);
g.reset();
check('reset clears everything', !g.over && g.score === 0 && g.board.cells.every(v => v === 0) && g.piece);

// 6. lock out: piece settles entirely in hidden rows
g = mk(['O', 'O']);
for (let y = HIDDEN; y < TOTAL; y++) for (let x = 0; x < COLS; x++) g.board.cells[y * COLS + x] = 1;
g.piece = { type: 'O', rot: 0, x: 3, y: HIDDEN - 2 };
g.lockPiece();
check('lock out sets over', g.over === true);

section('M4: queue, hold, ghost, 180, lock progress');
// queue
g = mk(['I', 'J', 'L', 'O', 'S', 'T', 'Z']);
check('active is I, queue is the next 5: ' + g.queue.join(''), g.piece.type === 'I' && g.queue.join('') === 'JLOST');
g.hardDrop();
check('after a lock the queue advances: ' + g.piece.type + ' ' + g.queue.join(''), g.piece.type === 'J' && g.queue.join('') === 'LOSTZ');

// 7-bag: every 7 consecutive pieces contain each type once
const real = new Game(); const seen = [real.piece.type, ...real.queue];
while (seen.length < 28) { real.board.reset(); real.hardDrop(); seen.push(real.queue[real.queue.length - 1]); }
let bagOk = true;
for (let i = 0; i + 7 <= 28; i += 7) { const s = seen.slice(i, i + 7).sort().join(''); if (s !== 'IJLOSTZ') bagOk = false; }
check('7-bag: 4 consecutive bags each hold all 7 types', bagOk);

// hold
g = mk(['I', 'J', 'L', 'O', 'S', 'T', 'Z']);
check('hold empty at start', g.hold === null && !g.holdUsed);
check('hold parks I and brings J', g.holdPiece() && g.hold === 'I' && g.piece.type === 'J' && g.holdUsed);
check('second hold in the same piece refused', g.holdPiece() === false && g.piece.type === 'J');
g.hardDrop();
check('after lock hold allowed again; L is active', !g.holdUsed && g.piece.type === 'L');
check('hold swaps L for I', g.holdPiece() && g.piece.type === 'I' && g.hold === 'L');
check('swapped-in piece spawns at the top', g.piece.rot === 0 && g.piece.y <= 4 && g.piece.x === 3);

// ghost
g = mk(['T']);
check('ghostY is the floor row for a fresh T', g.ghostY() === TOTAL - 2);
g.board.cells[(TOTAL - 1) * COLS + 4] = 1;
check('ghostY rises when a cell is under the stem', g.ghostY() === TOTAL - 3);

// 180 rotation
for (const t of TYPES) check('kicksFor(' + t + ', 0, 2) is the 180 list (or O)', kicksFor(t, 0, 2).length === (t === 'O' ? 1 : 7));
g = mk(['T']);
check('T rotate(2) goes to state 2', g.rotate(2) && g.piece.rot === 2);
check('T rotate(2) again back to 0', g.rotate(2) && g.piece.rot === 0);
g = mk(['I']);
g.rotate(1); while (g.move(-1));  // vertical I flush left, box x = -2
check('vertical I at left wall flips 180 (1 -> 3) using a sideways kick', g.rotate(2) && g.piece.rot === 3 && g.piece.x >= -1);

// lock progress
g = mk(['O']);
check('lockProgress 0 in the air', g.lockProgress() === 0);
g.piece.y = g.ghostY(); g.update(LOCK_DELAY_MS / 2);
check('lockProgress 0.5 halfway through lock delay', Math.abs(g.lockProgress() - 0.5) < 0.01);
g.move(1);
check('a move while grounded resets lockProgress to 0', g.lockProgress() === 0);

section('M5: pause');
g = mk(['T']);
g.setPaused(true);
check('paused refuses move/rotate/hard drop', g.move(1) === false && g.rotate(1) === false && g.hardDrop() === 0);
let y0p = g.piece.y; g.update(5000);
check('paused stops gravity', g.piece.y === y0p);
g.setPaused(false); g.update(1000);
check('resumed: gravity moves the piece', g.piece.y > y0p);
g = mk(['T']);
for (let y = 0; y < TOTAL; y++) for (let x = 0; x < COLS; x++) g.board.cells[y * COLS + x] = 1;
g.spawn(); g.setPaused(true);
check('cannot pause a finished game', g.over && !g.paused);

console.log('\n' + (fails ? fails + ' of ' + total + ' FAILED' : 'all ' + total + ' passed'));
process.exit(fails ? 1 : 0);

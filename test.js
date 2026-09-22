// Headless checks for the game core. Run: node test.js
// The core files are classic scripts that export via module.exports when
// loaded in node, so this is the same code the browser runs.

global.PIECES = require('./js/pieces.js');
global.Board = require('./js/board.js');
const Game = require('./js/game.js');
const Input = require('./js/input.js');

let fails = 0, passes = 0;
const ok = (c, m) => { if (c) passes++; else { fails++; console.log('FAIL ' + m); } };
const key = (code, extra = {}) => ({ code, repeat: false, shiftKey: false, preventDefault() {}, ...extra });
const B = Board.H;
// Fill the bottom n rows leaving a gap at column `hole`.
function stack(g, n, hole) { for (let y = B - n; y < B; y++) { g.board.grid[y] = new Array(10).fill('Z'); g.board.grid[y][hole] = 0; } }
// A game whose next pieces are exactly `types`, in order.
function withQueue(types) { const g = new Game(1); g.queue = types.slice(); g.spawn(); return g; }
let g, p;

// ---- pieces ----
ok(PIECES.STATES.T[1].map(String).join(' ') === '1,0 1,1 2,1 1,2', 'T rotated cw once is the SRS R state');
ok(PIECES.STATES.I[1].every(([x]) => x === 2) && PIECES.STATES.I[3].every(([x]) => x === 1), 'I R state is column 2, L state is column 1');
ok(PIECES.STATES.O.every(s => s === PIECES.STATES.O[0]), 'O never moves when rotated');
ok(PIECES.kicks('T', 0, 1).length === 5 && PIECES.kicks('I', 2, 3).length === 5 && PIECES.kicks('O', 0, 1).length === 1, 'kick tables have 5 tests, O has 1');

// ---- gravity ----
g = new Game(1); g.level = 1; ok(Math.round(g.gravityMs()) === 1000, 'level 1 is 1000ms per row');
g.level = 10; ok(Math.round(g.gravityMs()) === 64, 'level 10 is 64ms per row');
g.level = 20; ok(g.gravityMs() === 16, 'gravity floors at 16ms');

// ---- rotation and kicks ----
g = withQueue(['I']); g.rotate(1); ok(g.active.rot === 1, 'I rotates cw in the open');
while (g.move(-1)) {} ok(g.active.x === -2, 'vertical I hugs the left wall (x=-2 puts its column at 0)');
ok(g.rotate(1) && g.cells().every(([dx]) => g.active.x + dx >= 0), 'I rotates at the wall via a kick and stays in bounds');
g = withQueue(['I']); g.active.y = 0; ok(g.rotate(1) && g.cells().every(([, dy]) => g.active.y + dy >= 0), 'I rotates at the very top without leaving the grid');
g = withQueue(['T']); while (g.move(1)) {} ok(g.active.x === 7, 'T stops at the right wall at x=7');
g.rotate(1); ok(g.active.rot === 1 && g.cells().every(([dx]) => g.active.x + dx < 10), 'T cw at the right wall stays in bounds');
g.rotate(1); ok(g.active.rot === 2 && g.cells().every(([dx]) => g.active.x + dx < 10), 'T to 180 at the right wall kicks in');

// ---- drops and lock delay ----
g = withQueue(['O', 'L']); p = g.active; g.hardDrop();
ok(g.active !== p && g.board.grid[B - 1].some(Boolean), 'hard drop locks on the floor and spawns the next piece');
g = withQueue(['O', 'O']); while (g.descend()) {} p = g.active; g.update(400); ok(g.active === p, 'grounded piece not locked at 400ms');
g.update(120); ok(g.active !== p, 'grounded piece locked after 500ms');
g = withQueue(['T', 'T']); while (g.descend()) {} p = g.active;
for (let i = 0; i < 30; i++) { g.update(300); g.move(i % 2 ? 1 : -1); }
ok(g.active !== p, 'continuous wiggling cannot stall a piece past the reset cap');
// step reset: spend resets on a ledge, slide off, still get a full delay at the bottom
g = withQueue(['O', 'O', 'O']);
for (let x = 0; x < 5; x++) g.board.grid[B - 1][x] = 'Z'; g.board.grid[B - 2][0] = 'Z'; g.board.grid[B - 2][1] = 'Z';
g.active.x = 0; while (g.descend()) {}
ok(g.active.y + 1 === B - 3, 'O rests on the ledge');
for (let i = 0; i < 16; i++) { g.update(100); g.move(1); g.move(-1); }
ok(g.lockResets === 15, 'reset budget spent on the ledge');
p = g.active; g.move(1); g.move(1); while (g.descend()) {}
ok(g.active === p && g.lockResets === 0, 'slid off the ledge: budget refilled, not locked');
g.update(400); ok(g.active === p, 'full lock delay available at the bottom');
g.update(200); ok(g.active !== p, 'then it locks');
g = withQueue(['T', 'T']); g.softDrop = true; const y0 = g.active.y; g.update(200); ok(g.active.y === y0 + 5, 'soft drop is 40ms per row at level 1');
// A full visible stack that fits a T only in the hidden rows. The stack must be there before spawn.
function toppedOut() { const t = new Game(1); for (let y = Board.HIDDEN; y < B; y++) t.board.grid[y] = new Array(10).fill('Z'); t.queue = ['T']; t.spawn(); return t; }
g = toppedOut(); ok(!g.over, 'T fits in the hidden rows'); g.hardDrop(); ok(g.over, 'locking entirely in hidden rows is a lock-out');

// ---- DAS / ARR ----
g = withQueue(['T', 'T']); let inp = new Input(g);
inp.onKeyDown(key('ArrowRight')); ok(g.active.x === 4, 'first shift is immediate');
inp.tick(149); ok(g.active.x === 4, 'no shift before DAS');
inp.tick(1); ok(g.active.x === 5, 'shift at DAS (150ms)');
inp.tick(33); ok(g.active.x === 6, 'then one shift per ARR (33ms)');
inp.onKeyUp(key('ArrowRight')); inp.tick(500); ok(g.active.x === 6, 'stops on release');
// direction stack: newest wins, older resumes charged
g = withQueue(['T', 'T']); inp = new Input(g);
inp.onKeyDown(key('ArrowRight')); inp.tick(150); ok(g.active.x === 5, 'right held and charged');
inp.onKeyDown(key('ArrowLeft')); ok(g.active.x === 4 && inp.dasDir === -1, 'left pressed: newest wins immediately');
inp.onKeyUp(key('ArrowLeft')); ok(g.active.x === 5 && inp.dasDir === 1 && inp.charged, 'left released: right resumes with one shift, already charged');
inp.tick(33); ok(g.active.x === 6, 'and continues at ARR, no second DAS wait');

// ---- clears and scoring ----
g = withQueue(['I', 'I', 'I']); stack(g, 1, 9); g.rotate(1); while (g.move(1)) {} g.hardDrop();
ok(g.clearing && g.clearing.rows.length === 1 && g.active === null, 'a full row enters the clearing state');
ok(g.board.grid[B - 1].every(Boolean), 'the row is still on the board during the flash');
g.update(100); ok(g.clearing, 'still flashing at 100ms');
g.update(60); ok(!g.clearing && g.active, 'collapsed and spawned after 150ms');
ok(g.lines === 1 && g.lastClear.points === 100 && g.lastClear.label === 'SINGLE', 'single is 100 at level 1');
g = withQueue(['I', 'I', 'I', 'O']); stack(g, 4, 9); g.board.grid[B - 5][0] = 'Z';
g.rotate(1); while (g.move(1)) {} g.hardDrop(); g.update(200);
ok(g.lines === 4 && g.lastClear.label === 'TETRIS' && g.lastClear.points === 800, 'tetris is 800');
stack(g, 4, 9); g.board.grid[B - 5][0] = 'Z'; g.rotate(1); while (g.move(1)) {} g.hardDrop(); g.update(200);
ok(g.lastClear.label === 'B2B TETRIS COMBO 1' && g.lastClear.points === 1250, 'back-to-back tetris is x1.5 plus combo 1');
ok(g.level === 1 && g.lines === 8, 'still level 1 at 8 lines');
stack(g, 4, 9); g.board.grid[B - 5][0] = 'Z'; g.rotate(1); while (g.move(1)) {} g.hardDrop(); g.update(200);
ok(g.level === 2 && g.lines === 12 && g.combo === 2, 'level 2 at 12 lines, combo 2');
g.hardDrop(); g.update(200); ok(g.combo === -1, 'combo resets on a lock that clears nothing');
g = withQueue(['I', 'O']); for (let x = 0; x < 6; x++) g.board.grid[B - 1][x] = 'Z';
while (g.move(1)) {} g.hardDrop(); g.update(200);
ok(g.board.isEmpty() && g.lastClear.label === 'PERFECT CLEAR' && g.lastClear.points === 800, 'clearing the whole board is a perfect clear');

// ---- T-spins ----
// Left overhang, 3-wide cove, stem hole at column 2. A vertical T drops beside the overhang and twists in.
g = withQueue(['T', 'O']);
g.board.grid[B - 3] = ['Z', 'Z', 0, 0, 0, 0, 0, 0, 0, 0];
g.board.grid[B - 2] = ['Z', 0, 0, 0, 'Z', 'Z', 'Z', 'Z', 'Z', 'Z'];
g.board.grid[B - 1] = ['Z', 'Z', 0, 'Z', 'Z', 'Z', 'Z', 'Z', 'Z', 'Z'];
g.rotate(1); g.move(-1); g.move(-1); while (g.descend()) {}
ok(g.active.y === B - 3 && g.active.spin === false, 'T dropped beside the overhang; descent clears the spin flag');
ok(g.rotate(1) && g.active.rot === 2 && g.tspinKind() === 'full', 'T twists clockwise into the slot: full T-spin');
g.update(600); ok(g.clearing && g.clearing.rows.length === 2, 'it clears two rows');
g.update(200); ok(g.lastClear.label === 'T-SPIN DOUBLE' && g.lastClear.points === 1200, 'T-spin double is 1200');
g = withQueue(['T', 'O']);
g.board.grid[B - 3] = ['Z', 'Z', 0, 'Z', 0, 0, 0, 0, 0, 0];
g.board.grid[B - 2] = ['Z', 0, 0, 0, 'Z', 'Z', 'Z', 'Z', 'Z', 'Z'];
g.board.grid[B - 1] = ['Z', 'Z', 0, 0, 'Z', 'Z', 'Z', 'Z', 'Z', 'Z'];
Object.assign(g.active, { rot: 2, x: 1, y: B - 3, spin: true, kick: 0 });
ok(g.tspinKind() === 'mini', 'three corners with a front corner open is a mini');
g.active.kick = 4; ok(g.tspinKind() === 'full', 'the same shape via the fifth kick is full');
g.active.spin = false; ok(g.tspinKind() === null, 'not a T-spin unless the last move was a rotation');

// ---- seed, queue, hold, ghost, trail ----
let a = new Game(42), b = new Game(42);
ok([a.active.type, ...a.queue].join('') === [b.active.type, ...b.queue].join(''), 'same seed gives the same sequence');
ok(a.queue.length === 5, 'queue is five deep');
ok(new Set([a.active.type, ...a.queue, a.fromBag()]).size === 7, 'first seven pieces are all different (7-bag)');
g = new Game(7); const first = g.active.type, second = g.queue[0];
ok(g.holdPiece() && g.hold === first && g.active.type === second, 'hold parks the piece and spawns the next');
ok(!g.holdPiece(), 'hold refused twice for one piece');
g.hardDrop(); g.update(200); ok(!g.holdUsed, 'hold available again after lock');
const cur = g.active.type; ok(g.holdPiece() && g.active.type === first && g.hold === cur && g.active.rot === 0, 'hold swaps with the parked piece in spawn state');
g = new Game(7); const gy = g.ghostY();
ok(g.fits(g.active, 0, gy - g.active.y) && !g.fits(g.active, 0, gy - g.active.y + 1), 'ghostY is the lowest fitting row');
g = new Game(7); const sy = g.active.y; g.hardDrop();
ok(g.dropTrail && g.dropTrail.y0 === sy && g.dropTrail.t === 0, 'hard drop leaves a trail from the start row');
g.update(130); ok(g.dropTrail === null, 'trail gone after 120ms');
g = new Game(99); inp = new Input(g);
inp.onKeyDown(key('KeyR', { shiftKey: true })); ok(g.seed === 99, 'Shift+R replays the seed');
inp.onKeyDown(key('KeyR')); ok(g.seed !== 99, 'R picks a new seed');
inp.onKeyDown(key('KeyC')); ok(g.holdUsed, 'C holds');
// DAS charges through the clearing flash and carries into the next piece
g = withQueue(['I', 'T', 'T']); stack(g, 1, 9); g.rotate(1); while (g.move(1)) {} g.hardDrop();
inp = new Input(g); inp.onKeyDown(key('ArrowLeft'));
inp.tick(150); g.update(150); ok(!g.clearing && g.active.type === 'T', 'flash over, T spawned');
const xb = g.active.x; inp.tick(33); ok(g.active.x === xb - 1, 'held direction was charging during the flash: next piece shifts at ARR');

// ---- pause ----
g = withQueue(['T', 'T']); inp = new Input(g); inp.onKeyDown(key('ArrowRight')); g.softDrop = true;
inp.onKeyDown(key('KeyP')); ok(g.paused && inp.dasDir === 0 && !g.softDrop, 'P pauses and releases held keys');
p = g.active; const px = p.x, py = p.y; g.update(5000); inp.tick(5000);
ok(g.active === p && p.x === px && p.y === py, 'nothing moves while paused');
ok(!g.move(1) && !g.rotate(1) && !g.holdPiece(), 'moves are refused while paused');
inp.onKeyDown(key('Escape')); ok(!g.paused, 'Escape resumes');
g.hardDrop(); g.update(200); g.setPaused(true); const over = g.over; ok(!over, 'sanity: not over');
g = toppedOut(); g.hardDrop(); g.setPaused(true);
ok(g.over && !g.paused, 'cannot pause a finished game');
// blur pauses through attach()
g = withQueue(['T', 'T']); inp = new Input(g);
const listeners = {}; const fakeWin = { addEventListener: (n, f) => { listeners[n] = f; } };
const fakeDoc = { hidden: false, addEventListener: (n, f) => { listeners['doc:' + n] = f; } };
inp.attach(fakeWin, fakeDoc); listeners.keydown(key('ArrowLeft')); listeners.blur();
ok(g.paused && inp.dasDir === 0, 'window blur pauses and drops held keys');
g.setPaused(false); fakeDoc.hidden = true; listeners['doc:visibilitychange'](); ok(g.paused, 'hiding the tab pauses');

// ---- random play ----
g = new Game(3); g.level = 8; let frames = 0;
for (let i = 0; i < 120 * 60 && !g.over; i++) {
  const r = g.rng(); if (r < 0.1) g.move(-1); else if (r < 0.2) g.move(1); else if (r < 0.3) g.rotate(1); else if (r < 0.32) g.hardDrop();
  g.update(1000 / 60); frames++;
}
ok(g.board.grid.every(row => row.length === 10) && g.board.grid.length === B, `board intact after ${frames} random frames at level 8`);

console.log(`${passes} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);

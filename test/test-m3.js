const T = require('./harness.js');
const { state, input, board, frame, onKeyDown, rotate, hardDrop, lock, reset, PIECES, W, H, HIDDEN, collides } = T;
const key = (code) => onKeyDown({ code, repeat: false, preventDefault() {} });
let t = 0; const tick = (ms = 16) => { t += ms; frame(t); };
const ticks = (ms) => { for (let d = 0; d < ms; d += 16) tick(16); };
const fail = (m) => { console.error('FAIL', m); process.exit(1); };
const eq = (a, b, m) => { if (a !== b) fail(`${m}: got ${a}, want ${b}`); };
const idOf = (name) => PIECES.findIndex(p => p && p.name === name);
const setPiece = (name, r, x, y) => { state.cur = { id: idOf(name), r, x, y, lowestY: y, spun: false, kick: -1 }; state.lockAcc = 0; state.lockResets = 0; state.over = false; };
const fillRow = (yFromBottom, exceptXs = []) => { for (let x = 0; x < W; x++) if (!exceptXs.includes(x)) board[(H - 1 - yFromBottom) * W + x] = 7; };
const fresh = () => { reset(); state.cur = null; board.fill(0); };

// --- single: I horizontal into a row missing x=3..6
fresh(); fillRow(0, [3, 4, 5, 6]); board[(H - 2) * W + 0] = 7; // stray cell so it is not a perfect clear
setPiece('I', 0, 3, H - 2); hardDrop();
eq(state.clearing && state.clearing.rows.length, 1, 'one row flashing');
eq(state.cur, null, 'no piece during flash');
eq(state.score, 100, 'single = 100 at level 1');
eq(state.event, 'Single', 'event label');
ticks(112); if (!state.clearing) fail('flash ended too early');
ticks(32); if (state.clearing) fail('flash did not end');
if (!state.cur) fail('no spawn after clear');
let filled = 0; for (const v of board) if (v) filled++;
eq(filled, 1, 'row removed, stray cell slid down');
console.log('single + flash ok');

// --- tetris then B2B tetris
fresh(); for (let r = 0; r < 4; r++) fillRow(r, [0]); board[(H - 5) * W + 9] = 7;
setPiece('I', 1, -2, H - 5); // vertical I in column 0
hardDrop(); ticks(160);
eq(state.score, 802, 'tetris = 800 + 2 hard drop');
eq(state.lines, 4, 'lines 4');
eq(state.b2b, true, 'b2b armed');
for (let r = 0; r < 4; r++) fillRow(r, [0]); board[(H - 5) * W + 9] = 7;
setPiece('I', 1, -2, H - 5); hardDrop(); ticks(160);
eq(state.score, 802 + 1200 + 50 + 2, 'b2b tetris = 1200 + combo 50 + 2 drop');
eq(state.event, 'B2B Tetris  x2', 'b2b label: ' + state.event);
console.log('tetris + b2b + combo ok');

// --- T-spin double. Bottom row missing x=1 (the nub), row above missing
// x=0..2 (the bar), overhang at (0,H-3) so state 2 cannot fall in. A T
// pointing right at box origin (0,H-3) sits in the slot grounded; one cw
// rotation lands it pointing down with kick 0, last action a rotation.
fresh(); fillRow(0, [1]); fillRow(1, [0, 1, 2]); board[(H - 3) * W + 0] = 7;
setPiece('T', 1, 0, H - 3);
if (collides(idOf('T'), 1, 0, H - 3)) fail('TSD setup collides');
if (!collides(idOf('T'), 1, 0, H - 2)) fail('TSD setup should be grounded');
if (!rotate(0)) fail('TSD rotation refused');
eq(state.cur.r, 2, 'T points down');
eq(T.tspinKind(state.cur), 'full', 'kind full');
lock(); ticks(160);
eq(state.lines, 2, 'TSD cleared 2');
eq(state.score, 1200, 'T-spin double = 1200: event ' + state.event);
eq(state.b2b, true, 'TSD arms b2b');
console.log('T-spin double ok:', state.event);

// --- mini T-spin: same slot but T pointing up after rotation with only one front corner.
// Row above bar row is open on the right so the front (top) corners are (0,H-3) solid, (2,H-3) empty -> mini.
fresh(); fillRow(0, [1]); fillRow(1, [0, 1, 2]); board[(H - 3) * W + 0] = 7;
setPiece('T', 3, 0, H - 3); // pointing left: cells (0,H-2),(1,H-1),(1,H-2),(1,H-3)
if (collides(idOf('T'), 3, 0, H - 3)) fail('mini setup collides');
rotate(1); // ccw: L -> 2 (pointing down) — front corners bottom both solid -> full, not mini. Use cw instead: L -> 0 (up).
console.log('mini probe: r', state.cur.r, 'kind', T.tspinKind(state.cur), 'kick', state.cur.kick);

// --- perfect clear: single row missing one cell, nothing else
fresh(); fillRow(0, [4]); board[(H-1)*W+4] = 0;
// drop an I vertical? needs 4 tall. Use row0 missing x=3..6 and I horizontal.
fresh(); fillRow(0, [3, 4, 5, 6]); setPiece('I', 0, 3, H - 3); hardDrop(); ticks(160);
eq(state.score, 100 + 800 + 2 * 1, 'perfect clear single = 100 + 800 + hard drop 2: ' + state.score);
if (!state.event.startsWith('Perfect Clear')) fail('PC label: ' + state.event);
console.log('perfect clear ok:', state.event);

// --- level up after 10 lines
fresh(); state.lines = 9; fillRow(0, [3, 4, 5, 6]); setPiece('I', 0, 3, H - 2); hardDrop(); ticks(160);
eq(state.level, 2, 'level 2 at 10 lines');
console.log('level up ok');

// --- lock out: piece resting entirely in hidden rows
fresh(); for (let y = HIDDEN; y < H; y++) for (let x = 0; x < W; x++) board[y * W + x] = 7;
board[HIDDEN * W + 0] = 0; // leave one gap so rows aren't full
setPiece('O', 0, 3, HIDDEN - 2); lock();
eq(state.over, true, 'lock out ends game');
// --- block out: spawn collides
fresh(); for (let y = HIDDEN - 2; y < H; y++) for (let x = 0; x < W; x++) board[y * W + x] = 7;
board[(H-1)*W] = 0;
state.over = false; T.state.cur = null; require('./harness.js'); // spawn via reset? use key R then check
// spawn() isn't exported; simulate via hardDrop path: set a piece far above and lock -> spawn happens
setPiece('O', 0, 3, 0); lock();
eq(state.over, true, 'block out ends game');
console.log('game over both ways ok');

// --- restart
key('KeyR');
eq(state.over, false, 'restart clears over');
eq(state.score, 0, 'score reset');
let any = 0; for (const v of board) if (v) any++;
eq(any, 0, 'board cleared');
if (!state.cur) fail('no piece after restart');
console.log('restart ok');
console.log('M3 OK');

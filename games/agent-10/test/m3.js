const { T, tick, show, listeners, elements } = require('./harness.js');
const { state, PIECES, board, collides, ROWS, HIDDEN, COLS, CLEAR_FLASH } = T;
let fails = 0;
function check(name, cond, extra = '') { console.log((cond ? 'ok   ' : 'FAIL ') + name + (cond ? '' : '  ' + extra)); if (!cond) fails++; }
function keydown(code) { for (const f of listeners.keydown) f({ code, repeat: false, preventDefault() {} }); }
function drop() { keydown('Space'); tick(CLEAR_FLASH + 20); } // wait out the clear flash
function keyup(code) { for (const f of listeners.keyup) f({ code, preventDefault() {} }); }
function id(name) { return PIECES.findIndex(p => p && p.name === name); }
function setPiece(name, rot, x, y) { state.piece = { id: id(name), rot, x, y, lowest: y, resets: 0 }; state.lockAcc = 0; state.gravityAcc = 0; }
function fillRow(y, except = []) { for (let x = 0; x < COLS; x++) board[y * COLS + x] = except.includes(x) ? 0 : 1; }
tick(0);

// gravity curve
check('gravity L1 = 1000ms', Math.round(T.gravityMs(1)) === 1000);
check('gravity L5 ~ 355ms', Math.round(T.gravityMs(5)) === 355, T.gravityMs(5));
check('gravity L15 ~ 7ms', Math.round(T.gravityMs(15)) === 7, T.gravityMs(15));

// 7-bag: 14 consecutive spawns contain each piece exactly twice
T.reset(); state.gravityMs = 1e9;
const seen = {};
for (let i = 0; i < 14; i++) { seen[state.piece.id] = (seen[state.piece.id] || 0) + 1; board.fill(0); state.piece = T.spawn(); }
check('7-bag: each of 7 pieces exactly twice in 14', Object.keys(seen).length === 7 && Object.values(seen).every(v => v === 2), JSON.stringify(seen));

// tetris: bottom 4 rows full except column 9, vertical I hard-dropped
T.reset(); state.gravityMs = 1e9;
const F = ROWS - 1;
for (let y = F; y > F - 4; y--) fillRow(y, [9]);
setPiece('I', 1, 7, HIDDEN - 1); // rot1 = column 2 of box -> x=9
const startY = state.piece.y;
drop();
const dropped = (F - 3) - startY; // I rot1 occupies box rows 0..3, lands with top at F-3
check('tetris clears 4 lines', state.lines === 4, state.lines);
check('board empty after tetris', board.every(v => v === 0));
check('score = 800 + perfect clear 2000 + 2*rows', state.score === 800 + 2000 + 2 * dropped, `${state.score} rows=${dropped}`);
check('b2b armed', state.b2b === true);

// second tetris: back-to-back 1.5x
const before = state.score;
for (let y = F; y > F - 4; y--) fillRow(y, [9]);
setPiece('I', 1, 7, HIDDEN - 1);
drop();
check('b2b tetris scores 1200 + perfect 2000 + combo 50 + drop', state.score - before === 1200 + 2000 + 50 + 2 * dropped, state.score - before);
check('lines 8', state.lines === 8);

// single under a gapped row: only one clears, gap row drops to floor
T.reset(); state.gravityMs = 1e9;
fillRow(F, [0]);          // bottom: gap at x=0
fillRow(F - 1, [0, 5]);   // above: gaps at x=0 (for the I) and x=5
setPiece('I', 1, -2, HIDDEN - 1); // column 0
drop();
check('one line cleared', state.lines === 1, state.lines);
check('gap row is now on the floor', board[F * COLS + 5] === 0 && board[F * COLS + 4] === 1);
check('I remainder sits above the dropped gap row', board[(F - 1) * COLS + 0] === id('I') && board[(F - 1) * COLS + 1] === 0 && board[F * COLS + 0] === id('I'));
check('single scores 100', state.score === 100 + 2 * dropped, state.score);

// levels: 10 lines -> level 2 and gravity changes
T.reset(); state.gravityMs = 1e9;
for (let n = 0; n < 3; n++) { for (let y = F; y > F - 4; y--) fillRow(y, [9]); setPiece('I', 1, 7, HIDDEN - 1); drop(); }
check('12 lines -> level 2', state.level === 2 && state.lines === 12, `${state.level} ${state.lines}`);
check('gravity now level-2 speed', Math.round(state.gravityMs) === Math.round(T.gravityMs(2)));

// lock-out: O locking entirely in hidden rows ends the game
T.reset(); state.gravityMs = 1e9;
for (let y = HIDDEN; y < ROWS; y++) fillRow(y, [0]); // full column stack leaving x=0 open
setPiece('O', 0, 4, HIDDEN - 3); // O rows 0,1 -> y HIDDEN-3, HIDDEN-2: hidden
drop();
check('lock-out sets over', state.over === true);
check('overlay says game over', elements.overlay && elements['overlay-title'].textContent === 'Game over');

// block-out: spawn collides on both candidate rows
T.reset(); state.gravityMs = 1e9;
for (let y = 0; y < ROWS; y++) fillRow(y, [0]);
state.piece = T.spawn();
check('block-out sets over', state.over === true);

// restart via R clears everything
keydown('KeyR');
check('R resets board, score, over', !state.over && state.score === 0 && state.lines === 0 && board.every(v => v === 0) && state.piece);
check('no input while over', (() => { state.over = true; const x = state.piece.x; keydown('ArrowLeft'); keyup('ArrowLeft'); const same = state.piece.x === x; state.over = false; return same; })());

console.log(fails ? `${fails} FAILED` : 'all passed');
process.exit(fails ? 1 : 0);

const { api, listeners } = require('./harness.js');
const { state, board, W, H, HIDDEN, T, I, O, tryRotate, update, hardDrop, gravityFor, reset } = api;
let fails = 0;
const check = (name, ok, extra='') => { console.log((ok ? 'ok  ' : 'FAIL') + ' ' + name + (ok ? '' : '  ' + extra)); if (!ok) fails++; };
const row = (y, s) => { for (let x = 0; x < W; x++) board[y*W+x] = s[x] === 'X' ? 1 : 0; };
const setPiece = (id, r, x, y) => { state.piece = { id, r, x, y, lowestY: y, resets: 0, spun: false, kick: 0 }; state.lockAcc = 0; };
const rowStr = (y) => { let s=''; for (let x=0;x<W;x++) s += board[y*W+x] ? 'X' : '.'; return s; };
const finishClear = () => update(200);

// 1. Single line clear with an I piece: rows drop, score 100
reset(); board.fill(0);
row(H-1, 'XXX....XXX');
row(H-2, 'X.........');
setPiece(I, 0, 3, 1);
hardDrop();
check('clearing phase entered', state.clearing !== null && state.clearing.rows.length === 1);
check('piece null during flash', state.piece === null);
finishClear();
check('row above dropped', rowStr(H-1) === 'X.........' && rowStr(H-2) === '..........', rowStr(H-1));
check('score 100 + hard drop', state.score === 100 + 2 * (H - 2 - 1), String(state.score));
check('lines 1, level 1', state.lines === 1 && state.level === 1);
check('spawned after clear', state.piece !== null);

// 2. Tetris then back-to-back tetris
reset(); board.fill(0);
for (let y = H-4; y < H; y++) row(y, 'XXXXXXXXX.');
setPiece(I, 1, 7, H-5); // vertical I in column 9? state 1 is column x+2 -> x=7
hardDrop(); finishClear();
const s1 = state.score;
check('tetris scores 800 x1 (+drop)', s1 >= 800 && s1 < 900, String(s1));
check('b2b armed', state.b2b === true);
for (let y = H-4; y < H; y++) row(y, 'XXXXXXXXX.');
setPiece(I, 1, 7, H-5);
hardDrop(); finishClear();
check('b2b tetris 1200', state.score - s1 >= 1200 && state.score - s1 < 1300, String(state.score - s1));
check('lines 8', state.lines === 8);

// 3. T-spin double: 1200 pts (400*... no: TSD = 1200 x level)
reset(); board.fill(0);
row(19, 'XXX..XXXXX'); row(20, 'XX...XXXXX'); row(21, 'XXX.XXXXXX');
setPiece(T, 3, 3, 18);
check('rotate in', tryRotate(-1));
const sBefore = state.score;
hardDrop(); // already grounded, locks
check('TSD clearing 2 rows', state.clearing && state.clearing.rows.length === 2);
finishClear();
check('TSD scores 1200', state.score - sBefore === 1200, String(state.score - sBefore));
check('b2b armed by tspin', state.b2b === true);

// 4. T-spin mini: T flat on floor rotated... use a simpler check: spun T with only 2 corners solid is not a spin
reset(); board.fill(0);
setPiece(T, 0, 3, H-3);
tryRotate(1); tryRotate(-1); // rotated in open air, only floor... corners: bottom two solid (floor at H) -> 2 corners
const sb = state.score;
hardDrop();
check('open-air rotation is not a T-spin (only drop pts)', state.score - sb === 2, String(state.score - sb));

// 5. Levels and gravity
reset(); board.fill(0);
state.lines = 9; state.level = 1;
row(H-1, 'XXXXXXXXX.');
setPiece(I, 1, 7, H-5); hardDrop(); finishClear();
check('level 2 at 10 lines', state.level === 2 && state.lines === 10);
check('gravity curve L1=1000', Math.round(gravityFor(1)) === 1000);
check('gravity curve L10 ~ 64', Math.round(gravityFor(10)) === 64, String(gravityFor(10)));
check('gravity curve L2 = 793', Math.round(gravityFor(2)) === 793, String(gravityFor(2)));

// 6. Lock-out: piece locked entirely in hidden rows -> game over
reset(); board.fill(0);
for (let y = HIDDEN; y < H; y++) row(y, 'XXXX.XXXXX');
row(HIDDEN, 'XXXXXXXXXX'); // block top visible row fully -> O at rows 0,1 locks in hidden
setPiece(O, 0, 4, 0);
hardDrop();
check('lock-out ends game', state.over === true);

// 7. Restart clears everything
listeners.keydown({ code: 'KeyR', repeat: false, preventDefault(){} });
let filled = 0; for (let i = 0; i < W*H; i++) if (board[i]) filled++;
check('R resets board/score/state', filled === 0 && state.score === 0 && !state.over && state.piece !== null);

// 8. Keys ignored while over
reset(); state.over = true; const px = state.piece.x;
listeners.keydown({ code: 'ArrowLeft', repeat: false, preventDefault(){} });
check('input ignored when over', state.piece.x === px);

console.log(fails ? `${fails} FAILURES` : 'ALL OK');
process.exit(fails ? 1 : 0);

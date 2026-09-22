const { api, listeners } = require('./harness.js');
const { state, board, W, H, T, I, tryRotate, tryMove, update, input, hardDrop } = api;
let fails = 0;
const check = (name, ok) => { console.log((ok ? 'ok  ' : 'FAIL') + ' ' + name); if (!ok) fails++; };
const row = (y, s) => { for (let x = 0; x < W; x++) board[y*W+x] = s[x] === 'X' ? 1 : 0; };
const setPiece = (id, r, x, y) => { state.piece = { id, r, x, y, lowestY: y, resets: 0 }; state.lockAcc = 0; };

// 1. I piece vertical against the right wall, rotate cw 1->2: kick (-1,0) should apply.
board.fill(0);
setPiece(I, 1, W - 3, 5);            // column x+2 = 9
check('I fits at wall start', api.fits(I, 1, W-3, 5));
check('I 1>2 kick to x=6', tryRotate(+1) && state.piece.r === 2 && state.piece.x === 6 && state.piece.y === 5);

// 2. T-spin double: overhang at (2,19), slot rows 20/21.
board.fill(0);
row(19, 'XXX..XXXXX');
row(20, 'XX...XXXXX');
row(21, 'XXX.XXXXXX');
setPiece(T, 3, 3, 18);               // point-left T resting beside the overhang
check('T start fits', api.fits(T, 3, 3, 18));
const ok = tryRotate(-1);            // 3 -> 2, should hit kick test 3: (-1,-1) in SRS = left 1, down 1
check('T 3>2 kicks into slot at (2,19)', ok && state.piece.r === 2 && state.piece.x === 2 && state.piece.y === 19);
hardDrop();
const lockedRows = [20, 21].every(y => { for (let x = 0; x < W; x++) if (!board[y*W+x]) return false; return true; });
check('T-spin fills rows 20 and 21', lockedRows);
if (api.state.clearing) update(200); // M3+: let the clear flash finish so spawn does not replace our test piece

// 3. DAS: hold right from x=3 with empty board; after DAS+ARR*k moves piece should be at wall
board.fill(0);
setPiece(T, 0, 3, 5);
listeners.keydown({ code: 'ArrowRight', repeat: false, preventDefault(){} });
check('tap moves 1', state.piece.x === 4);
update(100); check('before DAS no move', state.piece.x === 4);
update(80);  check('at DAS one more move', state.piece.x === 5);
update(200); check('ARR reaches wall x=7', state.piece.x === 7);
listeners.keyup({ code: 'ArrowRight' });
check('release clears dir', api.activeDir() === 0);

// 4. Lock delay: piece on floor locks after 500ms, moves reset it up to 15 times
board.fill(0);
setPiece(T, 0, 3, H - 2);            // cells rows H-2, H-1 -> grounded
const before = state.piece;
update(400); check('not yet locked at 400ms', state.piece === before);
tryMove(-1); update(400); check('move reset delay', state.piece === before);
update(150); check('locked after 550ms', state.piece !== before);

// 5. Reset cap: 15 moves then it locks regardless
board.fill(0);
setPiece(T, 0, 0, H - 2);
const p2 = state.piece;
let dir = 1;
for (let i = 0; i < 40 && state.piece === p2; i++) { update(300); tryMove(dir); dir = -dir; }
check('reset cap forces lock', state.piece !== p2);

// 6. hard drop from top lands on floor
board.fill(0);
setPiece(I, 0, 3, 1);
hardDrop();
let bottom = true; for (let x = 3; x < 7; x++) if (board[(H-1)*W+x] !== I) bottom = false;
check('hard drop I to floor', bottom);

console.log(fails ? `${fails} FAILURES` : 'ALL OK');
process.exit(fails ? 1 : 0);

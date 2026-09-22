const { T, tick, key, show, listeners } = require('./harness.js');
const { state, PIECES, board, collides, ROWS, HIDDEN } = T;
const F = ROWS - 1; // floor row
let fails = 0;
function check(name, cond) { console.log((cond ? 'ok   ' : 'FAIL ') + name); if (!cond) fails++; }
function keydown(code) { for (const f of listeners.keydown) f({ code, repeat: false, preventDefault() {} }); }
function keyup(code) { for (const f of listeners.keyup) f({ code, preventDefault() {} }); }
function setPiece(name, rot, x, y) {
  const id = PIECES.findIndex(p => p && p.name === name);
  state.piece = { id, rot, x, y, lowest: y, resets: 0 };
  state.lockAcc = 0; state.gravityAcc = 0;
}
tick(0);

// I vertical against left wall, rotate cw: must kick to x=0 (SRS 1->2 kick #3 = (+2,0))
setPiece('I', 1, -2, 5);
check('I vertical at wall fits', !collides(state.piece.id, 1, -2, 5));
T.tryRotate(1);
check('I kicked off left wall to x=0, rot 2', state.piece.rot === 2 && state.piece.x === 0);

// T against right wall, rot 0 at x=7 fits (cols 7..9); rot 1 at x=8 needs kick
setPiece('T', 0, 8, 5); // cells x 9,8,9,10 -> 10 out of bounds, so first check placement
check('T at x=8 rot0 collides (out of bounds)', collides(state.piece.id, 0, 8, 5));
setPiece('T', 1, 8, 5); // rot1 cells (1,0),(1,1),(2,1),(1,2) -> x 9,9,10,9 collides
setPiece('T', 3, 8, 5); // rot3 cells (1,0),(0,1),(1,1),(1,2) -> x 9,8,9,9 fits
check('T rot3 at x=8 fits', !collides(state.piece.id, 3, 8, 5));
T.tryRotate(1); // 3->0: rot0 at x=8 needs x 8..10 -> kick (-1,0) -> x=7
check('T kicked left from wall on 3->0', state.piece.rot === 0 && state.piece.x === 7);

// DAS/ARR: hold right from x=3 for DAS + 6*ARR -> 1 + 1 + 6 = 8 moves max, wall at x=7 for T rot0
setPiece('T', 0, 3, 5);
state.gravityMs = 1e9; // freeze gravity
keydown('ArrowRight');
check('immediate move on press', state.piece.x === 4);
tick(100); check('no repeat before DAS', state.piece.x === 4);
tick(80);  check('first repeat after DAS (170ms)', state.piece.x === 5);
tick(40);  check('ARR repeat', state.piece.x === 6);
tick(400); check('slides to wall and stops', state.piece.x === 7);
keyup('ArrowRight');
tick(100); check('no movement after release', state.piece.x === 7);

// opposite-direction hold: left while right held, then release left resumes right
setPiece('T', 0, 3, 5);
keydown('ArrowRight'); keydown('ArrowLeft');
check('left press moves left immediately', state.piece.x === 3);
keyup('ArrowLeft');
check('releasing left resumes right immediately', state.piece.x === 4);
keyup('ArrowRight');

// lock delay: piece grounded on floor locks after 500ms
setPiece('O', 0, 4, F - 1); // O cells rows 0,1 -> bottom two rows
check('O grounded', collides(state.piece.id, 0, 4, F));
tick(300); check('not locked at 300ms', state.piece && state.piece.y === F - 1 && board[F * 10 + 5] === 0);
tick(250); check('locked after 550ms', board[F * 10 + 5] === 2);

// move reset: moving while grounded resets timer, capped at 15
board.fill(0);
setPiece('O', 0, 0, F - 1);
for (let i = 0; i < 30; i++) { tick(400); T.tryMove(i % 2 ? -1 : 1, 0); }
check('15-reset cap: piece locked despite continuous movement', board.some(v => v === 2));

// hard drop: from top, lands on floor immediately
board.fill(0);
setPiece('I', 0, 3, HIDDEN - 1);
keydown('Space');
check('hard drop stamps I on bottom row', [3,4,5,6].every(x => board[F * 10 + x] === 1));
check('new piece spawned after hard drop', state.piece && state.piece.y <= HIDDEN - 1);

// soft drop: gravityMs 800 -> 40ms per row while held
state.gravityMs = 800; board.fill(0);
setPiece('T', 0, 3, HIDDEN - 1);
keydown('ArrowDown');
check('soft drop press drops a row immediately-ish', state.piece.y === HIDDEN - 1);
tick(45); check('soft drop: 2 rows after 45ms (press primes one)', state.piece.y === HIDDEN + 1);
keyup('ArrowDown');
tick(45); check('normal gravity does not move in 45ms', state.piece.y === HIDDEN + 1);

console.log(show().split('\n').slice(-4).join('\n'));
console.log(fails ? `${fails} FAILED` : 'all passed');
process.exit(fails ? 1 : 0);

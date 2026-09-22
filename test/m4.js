const { T, tick, show, listeners, elements } = require('./harness.js');
const { state, PIECES, board, collides, ROWS, HIDDEN, COLS, CLEAR_FLASH } = T;
let fails = 0;
function check(name, cond, extra = '') { console.log((cond ? 'ok   ' : 'FAIL ') + name + (cond ? '' : '  ' + extra)); if (!cond) fails++; }
function keydown(code) { for (const f of listeners.keydown) f({ code, repeat: false, preventDefault() {} }); }
function id(name) { return PIECES.findIndex(p => p && p.name === name); }
function setPiece(name, rot, x, y, extra = {}) { state.piece = { id: id(name), rot, x, y, lowest: y, resets: 0, spun: false, kick: 0, ...extra }; state.lockAcc = 0; state.gravityAcc = 0; }
function fillRow(y, except = []) { for (let x = 0; x < COLS; x++) board[y * COLS + x] = except.includes(x) ? 0 : 1; }
const F = ROWS - 1;
tick(0);
T.reset(); state.gravityMs = 1e9;

// preview queue
check('queue holds at least 5 after spawn', state.queue.length >= 5, state.queue.length);
const upcoming = state.queue[0];
keydown('Space');
tick(CLEAR_FLASH + 20);
check('next piece is the one that was at the front of the queue', state.piece.id === upcoming);
check('queue refilled', state.queue.length >= 5);

// hold
T.reset(); state.gravityMs = 1e9;
const first = state.piece.id, second = state.queue[0];
keydown('KeyC');
check('hold stores the current piece', state.hold === first);
check('hold spawns the next piece', state.piece.id === second);
check('holdUsed set', state.holdUsed === true);
keydown('KeyC');
check('second hold in the same piece is ignored', state.hold === first && state.piece.id === second);
keydown('Space'); tick(20);
keydown('KeyC');
check('after lock, hold swaps back the stored piece', state.piece.id === first);
check('rotation reset on swap-in', state.piece.rot === 0);

// ghost = hard drop landing
T.reset(); state.gravityMs = 1e9;
fillRow(F, [1, 2]); // O at x=0 occupies columns 1 and 2 of its box
setPiece('O', 0, 0, HIDDEN);
check('dropY on empty column is the floor', T.dropY(state.piece) === F - 1);
setPiece('O', 0, 4, HIDDEN);
check('dropY stops on the stack', T.dropY(state.piece) === F - 2);

// clear flash: rows stay for CLEAR_FLASH ms with no piece, then collapse
T.reset(); state.gravityMs = 1e9;
fillRow(F, [9]);
setPiece('I', 1, 7, HIDDEN - 1);
keydown('Space');
check('clearing state entered with the full row', state.clearing && state.clearing.rows.length === 1 && state.clearing.rows[0] === F);
check('no active piece during flash', state.piece === null);
check('row still on the board during flash', board[F * COLS + 0] === 1);
tick(CLEAR_FLASH - 30);
check('still flashing before timeout', state.clearing !== null);
tick(60);
check('collapsed after timeout', state.clearing === null && board[F * COLS + 0] === 0);
check('piece spawned after flash', state.piece !== null);
check('input ignored during flash', (() => { for (let x = 0; x < 9; x++) board[F * COLS + x] = 1; setPiece('I', 1, 7, HIDDEN - 1); keydown('Space'); const r = T.tryMove(-1, 0) === false && T.tryRotate(1) === false; T.holdPiece(); const stillNull = state.piece === null; tick(CLEAR_FLASH + 20); return r && stillNull; })());

// T-spin double: slot with overhang at (5, F-2). T pointing left rests at
// (3, F-2); rotating ccw drops it into the slot without a kick.
function tsdSetup() {
  T.reset(); state.gravityMs = 1e9; board.fill(0);
  fillRow(F, [4]);
  fillRow(F - 1, [3, 4, 5]);
  board[(F - 2) * COLS + 5] = 1; // overhang
  for (let x = 6; x < COLS; x++) board[(F - 2) * COLS + x] = 1;
}
tsdSetup();
setPiece('T', 3, 3, F - 2);
check('T rot3 rests in front of the slot', !collides(id('T'), 3, 3, F - 2) && collides(id('T'), 3, 3, F - 1));
check('cannot drop a rot2 T straight in', collides(id('T'), 2, 3, F - 2) === false && T.dropY({ id: id('T'), rot: 2, x: 3, y: HIDDEN }) < F - 2);
check('rotate ccw succeeds into the slot', T.tryRotate(-1) && state.piece.rot === 2 && state.piece.x === 3 && state.piece.y === F - 2);
check('detected as full T-spin', T.tspinKind(state.piece) === 'full');
keydown('Space');
check('T-spin double clears 2 rows', state.clearing && state.clearing.rows.length === 2);
check('scores 1200 at level 1', state.score === 1200, state.score);
check('b2b armed by T-spin', state.b2b === true);
tick(CLEAR_FLASH + 20);

// same slot, same final position, but the last move was a slide: plain double
tsdSetup();
setPiece('T', 2, 3, F - 2, { spun: true, kick: 0 });
T.tryMove(0, 0); // no-op move clears spun? (dx=dy=0 succeeds)
check('a move after the rotation clears spun', state.piece.spun === false);
keydown('Space');
check('no spin -> plain double 300', state.score === 300, state.score);
tick(CLEAR_FLASH + 20);

// mini: 3 corners but front corners not both solid, kick < 4
T.reset(); state.gravityMs = 1e9; board.fill(0);
// T pointing up (rot 0) at (3, F-2): cells (4,F-2),(3,F-1),(4,F-1),(5,F-1)
// corners: (3,F-2),(5,F-2) = front (tl,tr); (3,F),(5,F) = back
board[(F) * COLS + 3] = 1; board[(F) * COLS + 5] = 1; board[(F - 2) * COLS + 3] = 1;
setPiece('T', 0, 3, F - 2, { spun: true, kick: 1 });
check('3 corners, one front -> mini', T.tspinKind(state.piece) === 'mini');
state.piece.kick = 4;
check('same shape via 5th kick -> full', T.tspinKind(state.piece) === 'full');
board[(F - 2) * COLS + 3] = 0;
state.piece.kick = 0;
check('only 2 corners -> not a spin', T.tspinKind(state.piece) === null);

// mini T-spin with no lines scores 100
board[(F - 2) * COLS + 3] = 1;
setPiece('T', 0, 3, F - 2, { spun: true, kick: 1 });
keydown('Space');
check('mini T-spin no lines = 100', state.score === 100, state.score);

// hard drop that moves the piece clears spun (no free spins from above)
T.reset(); state.gravityMs = 1e9; board.fill(0);
setPiece('T', 0, 3, HIDDEN, { spun: true });
keydown('Space');
check('hard drop from height is not a spin', state.score === 2 * (F - 1 - HIDDEN), state.score);

console.log(fails ? `${fails} FAILED` : 'all passed');
process.exit(fails ? 1 : 0);

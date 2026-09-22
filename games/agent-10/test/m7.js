// Round 3: initial rotation and hold buffered through the clear flash.
const { T, tick, listeners } = require('./harness.js');
const { state, PIECES, board, ROWS, HIDDEN, COLS, CLEAR_FLASH } = T;
let fails = 0;
function check(name, cond, extra = '') { console.log((cond ? 'ok   ' : 'FAIL ') + name + (cond ? '' : '  ' + extra)); if (!cond) fails++; }
function keydown(code, extra = {}) { for (const f of listeners.keydown) f({ code, repeat: false, preventDefault() {}, ...extra }); }
function id(name) { return PIECES.findIndex(p => p && p.name === name); }
function setPiece(name, rot, x, y) { state.piece = { id: id(name), rot, x, y, lowest: y, resets: 0, spun: false, kick: 0 }; state.lockAcc = 0; state.gravityAcc = 0; }
function fillRow(y, except = []) { for (let x = 0; x < COLS; x++) board[y * COLS + x] = except.includes(x) ? 0 : 1; }
const F = ROWS - 1;
tick(0);

function startFlash() {
  T.reset(7); state.gravityMs = 1e9; board.fill(0);
  fillRow(F, [3, 4, 5, 6]);
  setPiece('I', 0, 3, HIDDEN);
  keydown('Space');
  if (!state.clearing) throw new Error('flash did not start');
}

// rotation pressed during the flash applies at spawn
startFlash();
const nextId = state.queue[0];
keydown('ArrowUp');
check('rotate during flash is buffered, not applied', state.irs === 1 && state.piece === null);
tick(CLEAR_FLASH + 20);
check('spawned piece is the queued one', state.piece && state.piece.id === nextId);
check('spawned piece arrives rotated cw', PIECES[state.piece.id].name === 'O' || state.piece.rot === 1, `rot=${state.piece.rot}`);
check('buffer cleared after use', state.irs === 0);

// last rotation press wins; 180 buffers too
startFlash();
keydown('ArrowUp'); keydown('KeyA');
tick(CLEAR_FLASH + 20);
check('last press wins: piece arrives at rot 2', PIECES[state.piece.id].name === 'O' || state.piece.rot === 2, `rot=${state.piece.rot}`);

// hold pressed during the flash swaps at spawn
startFlash();
const willSpawn = state.queue[0], after = state.queue[1];
keydown('KeyC');
check('hold during flash is buffered', state.ihs === true && state.hold === 0);
tick(CLEAR_FLASH + 20);
check('at spawn the queued piece went to hold', state.hold === willSpawn);
check('and the piece after it is active', state.piece.id === after);
check('hold spent for this piece', state.holdUsed === true);

// hold + rotate together: hold first, then the rotation applies to the new piece
startFlash();
keydown('KeyC'); keydown('KeyZ');
tick(CLEAR_FLASH + 20);
check('hold then rotate: active piece is rotated ccw', PIECES[state.piece.id].name === 'O' || state.piece.rot === 3, `rot=${state.piece.rot}`);

// no flash: rotate and hold still act immediately
T.reset(7); state.gravityMs = 1e9;
setPiece('T', 0, 3, 10);
keydown('ArrowUp');
check('outside the flash, rotate is immediate', state.piece.rot === 1 && state.irs === 0);

// R during the flash clears the buffers
startFlash();
keydown('ArrowUp'); keydown('KeyC');
keydown('KeyR');
check('restart clears buffered input', state.irs === 0 && state.ihs === false && state.piece.rot === 0 && state.hold === 0);

console.log(fails ? `${fails} FAILED` : 'all passed');
process.exit(fails ? 1 : 0);

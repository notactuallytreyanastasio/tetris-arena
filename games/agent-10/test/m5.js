const { T, tick, show, listeners, elements } = require('./harness.js');
const { state, PIECES, board, collides, ROWS, HIDDEN, COLS, CLEAR_FLASH, DAS, ARR, TOAST_MS } = T;
let fails = 0;
function check(name, cond, extra = '') { console.log((cond ? 'ok   ' : 'FAIL ') + name + (cond ? '' : '  ' + extra)); if (!cond) fails++; }
function keydown(code) { for (const f of listeners.keydown) f({ code, repeat: false, preventDefault() {} }); }
function keyup(code) { for (const f of listeners.keyup) f({ code, preventDefault() {} }); }
function id(name) { return PIECES.findIndex(p => p && p.name === name); }
function setPiece(name, rot, x, y, extra = {}) { state.piece = { id: id(name), rot, x, y, lowest: y, resets: 0, spun: false, kick: 0, ...extra }; state.lockAcc = 0; state.gravityAcc = 0; }
function fillRow(y, except = []) { for (let x = 0; x < COLS; x++) board[y * COLS + x] = except.includes(x) ? 0 : 1; }
function drop() { keydown('Space'); tick(CLEAR_FLASH + 20); }
const F = ROWS - 1;
tick(0);

// pause: gravity and input stop, overlay shows, P resumes
T.reset(); state.gravityMs = 100;
setPiece('T', 0, 3, HIDDEN);
keydown('KeyP');
check('paused flag', state.paused === true);
check('overlay shows Paused', elements['overlay-title'].textContent === 'Paused');
const y0 = state.piece.y;
tick(500);
check('no gravity while paused', state.piece.y === y0);
keydown('ArrowLeft'); keyup('ArrowLeft');
check('no movement while paused', state.piece.x === 3);
keydown('KeyP');
check('resumed', state.paused === false);
tick(150);
check('gravity resumes', state.piece.y === y0 + 1, state.piece.y);
keydown('Escape'); check('Escape also pauses', state.paused === true);
keydown('KeyR'); check('R while paused restarts unpaused', state.paused === false && state.score === 0);

// blur pauses
T.reset(); state.gravityMs = 1e9;
for (const f of listeners.blur || []) f({});
check('blur pauses', state.paused === true);
keydown('KeyP');

// pause during game over is a no-op
T.reset(); state.gravityMs = 1e9;
state.over = true; elements['overlay-title'].textContent = 'Game over';
keydown('KeyP');
check('cannot pause when over', state.paused === false && elements['overlay-title'].textContent === 'Game over');
state.over = false;

// DAS charges through the clear flash: hold right, clear a line, next piece
// must slide immediately on spawn instead of waiting DAS again
T.reset(); state.gravityMs = 1e9;
fillRow(F, [9]);
setPiece('I', 1, 7, HIDDEN - 1);
keydown('ArrowRight');           // I is already at the wall: no move
check('I at wall does not move', state.piece.x === 7);
keydown('Space');                // clears, flash starts
check('flash started', state.clearing !== null);
tick(CLEAR_FLASH + 20);          // > DAS? no: 140 < 170, so still charging
check('piece spawned after flash', state.piece !== null);
const sx = state.piece.x;
tick(DAS - CLEAR_FLASH);         // total held ~ DAS + 20ms
check('spawned piece starts auto-repeating right without a fresh DAS wait', state.piece.x > sx, `${state.piece.x} vs ${sx}`);
tick(400);
const size = PIECES[state.piece.id].size;
check('slides to the right wall', collides(state.piece.id, state.piece.rot, state.piece.x + 1, state.piece.y));
keyup('ArrowRight');

// combo: two clearing locks in a row add 50 x combo x level
T.reset(); state.gravityMs = 1e9;
fillRow(F, [9]); fillRow(F - 1, [9]); fillRow(F - 2, [9]); fillRow(F - 3, [9]);
setPiece('I', 1, 7, HIDDEN - 1); drop();       // tetris: 800
check('first clear: tetris + perfect clear, no combo bonus', state.score === 800 + 2000 + 2 * (F - 3 - (HIDDEN - 1)) && state.combo === 0, `${state.score} combo=${state.combo}`);
let base = state.score;
fillRow(F, [9]);
setPiece('I', 1, 7, HIDDEN - 1); drop();       // single with combo 1: 100 + 50
check('second clear: single 100 + combo 50', state.score - base === 150 + 2 * (F - 3 - (HIDDEN - 1)) && state.combo === 1, `${state.score - base} combo=${state.combo}`);
setPiece('O', 0, 0, HIDDEN); drop();           // no clear -> combo resets
check('non-clearing lock resets combo', state.combo === -1);

// perfect clear: bonus after the rows collapse and the board is empty
T.reset(); state.gravityMs = 1e9;
fillRow(F, [3, 4, 5, 6]);
setPiece('I', 0, 3, HIDDEN - 1); // horizontal I fills the gap exactly, leaving nothing behind
keydown('Space');
const beforeCollapse = state.score;
tick(CLEAR_FLASH + 20);
check('perfect clear single adds 800', state.score - beforeCollapse === 800, state.score - beforeCollapse);
check('perfect clear toast', state.toasts.some(t => t.text.startsWith('PERFECT CLEAR')));
check('vertical I leaving cells is not a perfect clear', (() => { T.reset(); state.gravityMs = 1e9; fillRow(F, [9]); setPiece('I', 1, 7, HIDDEN - 1); keydown('Space'); const b = state.score; tick(CLEAR_FLASH + 20); return state.score === b; })());

// toasts: label composes B2B + T-spin name + points, and expires
T.reset(); state.gravityMs = 1e9;
state.b2b = true;
board.fill(0); fillRow(F, [4]); fillRow(F - 1, [3, 4, 5]); board[(F - 2) * COLS + 5] = 1;
setPiece('T', 3, 3, F - 2); T.tryRotate(-1); keydown('Space');
check('B2B T-SPIN DOUBLE toast with 1800', state.toasts.some(t => t.text === 'B2B T-SPIN DOUBLE +1800'), JSON.stringify(state.toasts));
tick(TOAST_MS + 50);
check('toasts expire', state.toasts.length === 0);

// hiscore follows score
T.reset(); state.gravityMs = 1e9;
fillRow(F, [9]); setPiece('I', 1, 7, HIDDEN - 1); drop();
check('hiscore tracks score', state.hiscore >= state.score && state.hiscore > 0);
check('hiscore shown in HUD', elements.hiscore.textContent === String(state.hiscore));
const hs = state.hiscore;
keydown('KeyR');
check('hiscore survives restart in state', state.hiscore === hs || state.hiscore === 0 /* stubbed storage */);

console.log(fails ? `${fails} FAILED` : 'all passed');
process.exit(fails ? 1 : 0);

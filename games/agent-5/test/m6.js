// Round 2: solid ceiling with 4 hidden rows, held-direction stack, toasts, trail, best score.
const { api, listeners, sandbox } = require('./harness.js');
const { state, board, W, H, HIDDEN, SPAWN_Y, T, I, O, fits, tryRotate, reset, update, hardDrop, activeDir } = api;
let fails = 0;
const check = (name, ok, extra='') => { console.log((ok ? 'ok  ' : 'FAIL') + ' ' + name + (ok ? '' : '  ' + extra)); if (!ok) fails++; };
const row = (y, s) => { for (let x = 0; x < W; x++) board[y*W+x] = s[x] === 'X' ? 1 : 0; };
const setPiece = (id, r, x, y) => { state.piece = { id, r, x, y, lowestY: y, resets: 0, spun: false, kick: 0 }; state.lockAcc = 0; };
const key = (code) => listeners.keydown({ code, repeat: false, preventDefault(){} });
const up = (code) => listeners.keyup({ code });

// --- ceiling
check('HIDDEN is 4', HIDDEN === 4 && H === 24 && SPAWN_Y === 2);
check('fits refuses y<0', !fits(I, 1, 3, -1));
reset();
check('spawned piece has entered the visible field', state.piece.y + 1 >= HIDDEN - 1 && state.piece.y === SPAWN_Y + 1);
// A flat I in the top row whose only passing kick (0>1 test 5, up 2) would put cells above row 0 is refused, not clipped.
board.fill(0);
row(2, '...X.XX...');                       // blocks tests 1-4 of 0>1: cols 5, 3, 6, 3
setPiece(I, 0, 3, 0);                       // cells row 1, cols 3..6
check('I fits at ceiling start', fits(I, 0, 3, 0));
const before = { r: state.piece.r, x: state.piece.x, y: state.piece.y };
const rotated = tryRotate(+1);
check('ceiling kick refused, piece unchanged', !rotated && state.piece.r === before.r && state.piece.x === before.x && state.piece.y === before.y);
// spawn fallback one row higher before block-out
reset(); board.fill(0);
for (let y = SPAWN_Y + 1; y < H; y++) row(y, 'XXXXXXXXXX');   // everything from row 3 down is solid
state.queue[0] = T; hardDrop();             // current piece locks in place (rows 3..4? it is grounded at once) -> may end game; ignore
reset(); board.fill(0);
for (let y = SPAWN_Y + 1; y < H; y++) row(y, 'XXXXXXXXXX');
api.spawn();
check('spawn falls back one row higher', !state.over && state.piece.y === SPAWN_Y - 1, `over=${state.over} y=${state.piece && state.piece.y}`);
// lockPiece throws rather than clipping if ever asked to write above the board
let threw = false;
try { api.lockNow.call(null); } catch (e) { threw = false; }
setPiece(T, 0, 3, -1);
try { api.lockNow(); } catch (e) { threw = /above the board/.test(e.message); }
check('lockPiece throws on y<0 instead of clipping', threw);

// --- direction stack
reset(); board.fill(0); setPiece(T, 0, 4, 5);
key('ArrowRight'); check('right taps to 5', state.piece.x === 5);
key('ArrowLeft');  check('left press wins immediately', state.piece.x === 4 && activeDir() === -1);
update(170);       check('DAS drives left', state.piece.x === 3);
up('ArrowLeft');   check('release falls back to right, charged', activeDir() === 1 && api.input.dasCharged === true);
update(40);        check('right resumes on next ARR tick', state.piece.x === 4, String(state.piece.x));
up('ArrowRight');  check('all released', activeDir() === 0);
key('ArrowLeft'); key('ArrowRight'); up('ArrowRight');
check('releasing newest restores older', activeDir() === -1);
up('ArrowLeft');

// --- toasts
reset(); board.fill(0);
row(19, 'XXX..XXXXX'); row(20, 'XX...XXXXX'); row(21, 'XXX.XXXXXX');
setPiece(T, 3, 3, 18); tryRotate(-1); hardDrop();
check('T-spin double toast', state.toasts.some(t => t.text === 'T-SPIN DOUBLE +1200'), JSON.stringify(state.toasts));
update(200);
board.fill(0); row(H-1, 'XXX....XXX'); setPiece(I, 0, 3, H-3); hardDrop(); update(200);
check('combo toast on consecutive clear', state.toasts.some(t => /^COMBO x1$/.test(t.text)), JSON.stringify(state.toasts));
check('perfect clear toast', state.toasts.some(t => /^PERFECT CLEAR \+\d+$/.test(t.text)), JSON.stringify(state.toasts));
update(1000);
check('toasts expire', state.toasts.length === 0);

// --- trail
reset(); board.fill(0); setPiece(O, 0, 4, 3);
hardDrop();
check('hard drop leaves a trail', state.trail !== null && state.trail.cols.length === 2 && state.trail.cols[0][2] === H - 2, JSON.stringify(state.trail));
update(200); check('trail expires', state.trail === null);
reset(); board.fill(0); setPiece(O, 0, 4, H - 2); hardDrop();
check('no trail when already grounded', state.trail === null);

// --- best score
reset(); state.score = 4321; board.fill(0); setPiece(O, 0, 4, H-2); hardDrop();
check('best updated on lock', state.best === 4321 && sandbox.localStorage.getItem('agent5.tetris.best') === '4321');
reset(); check('best survives reset', state.best === 4321 && state.score === 0);
check('loadBest reads storage', api.loadBest() === 4321);

console.log(fails ? `${fails} FAILURES` : 'ALL OK');
process.exit(fails ? 1 : 0);

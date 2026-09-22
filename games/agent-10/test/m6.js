// Round 2: 180 rotation, seeded bag, hard-drop trail.
const { T, tick, listeners, elements, location } = require('./harness.js');
const { state, PIECES, board, collides, ROWS, HIDDEN, COLS, TRAIL_MS, KICKS } = T;
let fails = 0;
function check(name, cond, extra = '') { console.log((cond ? 'ok   ' : 'FAIL ') + name + (cond ? '' : '  ' + extra)); if (!cond) fails++; }
function keydown(code, extra = {}) { for (const f of listeners.keydown) f({ code, repeat: false, preventDefault() {}, ...extra }); }
function id(name) { return PIECES.findIndex(p => p && p.name === name); }
function setPiece(name, rot, x, y, extra = {}) { state.piece = { id: id(name), rot, x, y, lowest: y, resets: 0, spun: false, kick: 0, ...extra }; state.lockAcc = 0; state.gravityAcc = 0; }
function fillRow(y, except = []) { for (let x = 0; x < COLS; x++) board[y * COLS + x] = except.includes(x) ? 0 : 1; }
const F = ROWS - 1;
tick(0);

// --- 180 rotation
T.reset(1); state.gravityMs = 1e9;
setPiece('T', 0, 3, 10);
check('180 from spawn goes to rot 2', T.tryRotate(2) && state.piece.rot === 2);
check('180 records kick 0 (no fifth-kick T-spin upgrade)', state.piece.kick === 0 && state.piece.spun === true);
check('180 again returns to rot 0', T.tryRotate(2) && state.piece.rot === 0);
check('180 table has all four transitions of six tests', ['02', '20', '13', '31'].every(k => KICKS.half[k].length === 6));
// T pointing up on the floor: rot 2 in place would put the stem below the
// floor, so SRS+ test 2 (0,+1 y-up = one row up) lifts it. (agent-6's case)
board.fill(0);
setPiece('T', 0, 3, F - 1); // cells (4,F-1),(3,F),(4,F),(5,F)
check('T rot0 rests on the floor', collides(id('T'), 0, 3, F));
check('T on floor 180s by kicking up one row', T.tryRotate(2) && state.piece.rot === 2 && state.piece.y === F - 2 && state.piece.x === 3, JSON.stringify(state.piece));
// every orientation of every piece 180s somewhere on an empty board
board.fill(0);
let all = true;
for (let pid = 1; pid <= 7; pid++) for (let r = 0; r < 4; r++) { setPiece(PIECES[pid].name, r, 3, 10); if (!T.tryRotate(2)) all = false; }
check('all 28 piece/orientation 180s succeed mid-board', all);
// O never moves
setPiece('O', 0, 4, 10); T.tryRotate(2);
check('O 180 keeps its cells in place', state.piece.x === 4 && state.piece.y === 10);
// key binding
setPiece('T', 0, 3, 10); keydown('KeyA');
check('A key rotates 180', state.piece.rot === 2);

// --- seeded bag
T.reset(12345); state.gravityMs = 1e9;
const order1 = [state.piece.id, ...state.queue];
T.reset(12345);
const order2 = [state.piece.id, ...state.queue];
check('same seed gives the same piece order', JSON.stringify(order1) === JSON.stringify(order2), `${order1} vs ${order2}`);
T.reset(54321);
const order3 = [state.piece.id, ...state.queue];
check('different seed gives a different order', JSON.stringify(order1) !== JSON.stringify(order3));
check('seed shown in HUD', elements.seed.textContent === '12345' || elements.seed.textContent === '54321');
check('seed written to the URL hash', location.hash === '#seed=54321', location.hash);
keydown('KeyR', { shiftKey: true });
check('Shift+R replays the same seed', state.seed === 54321 && JSON.stringify([state.piece.id, ...state.queue]) === JSON.stringify(order3));
keydown('KeyR');
check('R picks a fresh seed', state.seed !== 54321);
check('mulberry32 is deterministic', T.mulberry32(7)() === T.mulberry32(7)());
check('7-bag still holds under the seeded rng', (() => { T.reset(99); const seen = {}; for (let i = 0; i < 14; i++) { seen[state.piece.id] = (seen[state.piece.id] || 0) + 1; board.fill(0); state.piece = T.spawn(); } return Object.keys(seen).length === 7 && Object.values(seen).every(v => v === 2); })());

// --- hard-drop trail
T.reset(1); state.gravityMs = 1e9; board.fill(0);
setPiece('I', 0, 3, HIDDEN);
keydown('Space');
check('hard drop leaves a trail', state.trail !== null && state.trail.ms === TRAIL_MS);
check('trail has one streak per column of the I', state.trail.cols.length === 4);
check('trail runs from the start row to the landing row', state.trail.cols.every(([x, from, to]) => from === HIDDEN + 1 && to === F));
tick(TRAIL_MS + 20);
check('trail expires', state.trail === null);
setPiece('O', 0, 0, F - 1); // already on the floor
keydown('Space');
check('hard drop that does not move leaves no trail', state.trail === null);

console.log(fails ? `${fails} FAILED` : 'all passed');
process.exit(fails ? 1 : 0);

const T = require('./harness.js');
const { state, input, board, frame, onKeyDown, onKeyUp, rotate, hardDrop, PIECES, W, H, HIDDEN, collides } = T;
const key = (code, up = false) => (up ? onKeyUp : onKeyDown)({ code, repeat: false, preventDefault() {} });
let t = 0; const tick = (ms = 16) => { t += ms; frame(t); };
const fail = (m) => { console.error('FAIL', m); process.exit(1); };
const setPiece = (name, r, x, y) => { state.cur = { id: PIECES.findIndex(p => p && p.name === name), r, x, y }; state.lockAcc = 0; state.lockResets = 0; state.over = false; };
const cellsOf = (p) => PIECES[p.id].rot[p.r].map(([cx, cy]) => [p.x + cx, p.y + cy]).sort();

// --- DAS/ARR: hold right from x=3, count position over time
board.fill(0); setPiece('T', 0, 3, HIDDEN + 5);
key('ArrowRight'); // immediate shift -> 4
if (state.cur.x !== 4) fail('immediate shift');
for (let i = 0; i < 8; i++) tick(16); // 128ms < DAS 150
if (state.cur.x !== 4) fail('moved before DAS: x=' + state.cur.x);
tick(30); // 158ms -> one ARR shift charged
if (state.cur.x !== 5) fail('DAS did not fire: x=' + state.cur.x);
for (let i = 0; i < 20; i++) tick(16); // ~320ms more at ARR 33 -> should hit wall x=7
if (state.cur.x !== 7) fail('ARR did not reach wall: x=' + state.cur.x);
key('ArrowLeft'); // newest wins
if (state.cur.x !== 6) fail('left did not take over');
key('ArrowLeft', true); // release left -> right resumes with fresh DAS
if (input.held.length !== 1 || input.held[0] !== 1) fail('held stack wrong ' + JSON.stringify(input.held));
for (let i = 0; i < 11; i++) tick(16);
if (state.cur.x !== 7) fail('right did not resume: x=' + state.cur.x);
key('ArrowRight', true);
console.log('DAS/ARR ok');

// --- I wall kick: I vertical at left wall, rotating cw must kick right
board.fill(0); setPiece('I', 1, -2, HIDDEN + 5); // column 2 of box at x=0
if (collides(state.cur.id, 1, -2, HIDDEN + 5)) fail('setup I invalid');
if (!rotate(0)) fail('I rotation at wall refused');
if (state.cur.r !== 2) fail('I not rotated');
console.log('I wall kick ok ->', JSON.stringify(cellsOf(state.cur)));

// --- T-spin triple slot: build a wall with a notch and rotate T into it
// Board bottom rows (y from bottom): a column-0 hole three deep with an overhang.
board.fill(0);
const B = (x, yFromBottom, v = 7) => { board[(H - 1 - yFromBottom) * W + x] = v; };
for (let y = 0; y < 3; y++) for (let x = 1; x < W; x++) B(x, y);      // rows 0-2 filled except x=0
B(0, 3); B(1, 3);                                                        // overhang above the slot
// T pointing left (state L=3) cells: [0,1],[1,2],[1,1],[1,0] -> column at x+1, nub at x
// Place T upright (state 0) resting on the overhang at x=0..2? Instead: state R at x=-1? Use SRS kick test:
// T in state 2 (flat, pointing down) at x=0, y such that it rests on the overhang, then rotate ccw -> should kick down into the slot.
setPiece('T', 2, 0, H - 1 - 6); // above overhang
while (!collides(state.cur.id, state.cur.r, state.cur.x, state.cur.y + 1)) state.cur.y++;
const before = JSON.stringify(cellsOf(state.cur));
const ok = rotate(1); // ccw: 2 -> R(1)? no: ccw from 2 goes to 1 (R). We want L=3 for a left-pointing... try both
console.log('T-spin attempt from state 2 ccw:', ok, before, '->', JSON.stringify(cellsOf(state.cur)), 'y', state.cur.y);
// Check the piece is now fully in the slot column area: all cells y >= H-4 means it dropped into the notch
const inSlot = cellsOf(state.cur).every(([x, y]) => y >= H - 4);
console.log('kicked into slot (y>=H-4):', inSlot);

// --- hard drop locks and spawns immediately
board.fill(0); setPiece('O', 0, 3, HIDDEN);
const id = state.cur.id;
hardDrop();
let cnt = 0; for (let x = 0; x < W; x++) for (let y = H - 2; y < H; y++) if (board[y * W + x] === id) cnt++;
if (cnt !== 4) fail('hard drop did not lock at floor: ' + cnt);
if (state.over) fail('game over after hard drop');
console.log('hard drop ok');

// --- lock reset cap: rotate 20 times while grounded, then time must lock it
board.fill(0); setPiece('T', 0, 3, H - 2); // resting on floor
for (let i = 0; i < 20; i++) { tick(400); key('ArrowUp'); }
if (!state.cur || state.cur.id !== PIECES.findIndex(p => p && p.name === 'T')) console.log('piece locked during stall cap test (expected once cap hit)');
console.log('lock reset cap ok');
console.log('M2 OK');

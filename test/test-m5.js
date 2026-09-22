const T = require('./harness.js');
const { state, input, board, frame, onKeyDown, onKeyUp, setPaused, hardDrop, reset, W, H, DAS, ARR, CLEAR_FLASH, PIECES } = T;
const key = (code, up = false) => (up ? onKeyUp : onKeyDown)({ code, repeat: false, preventDefault() {} });
const fail = (m) => { console.error('FAIL', m); process.exit(1); };
const eq = (a, b, m) => { if (a !== b) fail(`${m}: got ${a}, want ${b}`); };
let t = 0; const tick = (ms = 16) => { t += ms; frame(t); };
const ticks = (ms) => { for (let d = 0; d < ms; d += 16) tick(16); };

// --- pause: P toggles, gravity and input stop, held keys are released
reset(11);
const y0 = state.cur.y;
key('ArrowLeft');
key('KeyP');
eq(state.paused, true, 'P pauses');
eq(input.held.length, 0, 'pause releases held keys');
const x0 = state.cur.x;
key('ArrowRight'); key('ArrowUp'); key('Space');
ticks(2000);
eq(state.cur.y, y0, 'no gravity while paused');
eq(state.cur.x, x0, 'no shift while paused');
eq(state.cur.r, 0, 'no rotate while paused');
key('Escape');
eq(state.paused, false, 'Esc resumes');
ticks(1100);
if (state.cur.y <= y0) fail('gravity did not resume');
setPaused(true); eq(state.paused, true, 'setPaused(true)');
setPaused(false);
console.log('pause ok');

// --- DAS carries through the clear flash, capped: exactly one shift on spawn, then ARR
reset(22); board.fill(0);
for (let x = 0; x < W; x++) if (x < 3 || x > 6) board[(H - 1) * W + x] = 7; // bottom row needs the I
board[(H - 2) * W + 9] = 7; // not a perfect clear
state.cur = { id: PIECES.findIndex(p => p && p.name === 'I'), r: 0, x: 3, y: H - 2, lowestY: H - 2, spun: false, kick: -1 };
key('ArrowRight');        // immediate shift attempt: I at x=3..6 can move right? x=4 would leave a gap; it shifts to 4
state.cur.x = 3;          // put it back so the drop clears
hardDrop();
eq(!!state.clearing, true, 'flash started');
ticks(CLEAR_FLASH + 400);          // hold right through the whole flash and well past
if (state.clearing) fail('flash did not finish');
const spawnX = state.cur.x;
// after the flash the spawned piece got shifts: with the cap it is 1 immediate + ARR steps for the time AFTER spawn only
// The frames after spawn: ~(CLEAR_FLASH+400 - CLEAR_FLASH) = 400ms -> 1 + floor(400/ARR) shifts max, bounded by the wall.
// Uncapped, dasAcc would have been ~520ms at spawn -> a burst to the wall instantly. Check that the piece is at the wall
// only if 400ms of ARR could get it there, i.e. that at least one shift happened and dasAcc never exceeded DAS during the flash.
if (spawnX <= 3) fail('no shift carried through the flash: x=' + spawnX);
console.log('DAS carried through flash, spawn x =', spawnX);
// direct check of the cap: hold during a flash, inspect dasAcc
reset(23); board.fill(0);
for (let x = 0; x < W; x++) if (x < 3 || x > 6) board[(H - 1) * W + x] = 7;
board[(H - 2) * W + 9] = 7;
state.cur = { id: PIECES.findIndex(p => p && p.name === 'I'), r: 0, x: 3, y: H - 2, lowestY: H - 2, spun: false, kick: -1 };
hardDrop(); key('ArrowRight');
ticks(CLEAR_FLASH - 32);
if (!state.clearing) fail('flash ended early');
if (input.dasAcc > DAS) fail('dasAcc exceeded DAS during flash: ' + input.dasAcc);
key('ArrowRight', true);
console.log('DAS cap ok, dasAcc =', input.dasAcc);

// --- best score saved on game over
reset(33); state.score = 4321;
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) board[y * W + x] = 7;
board[(H - 1) * W] = 0;
state.cur = { id: 2, r: 0, x: 3, y: 0, lowestY: 0, spun: false, kick: -1 };
T.lock();
eq(state.over, true, 'over');
eq(state.best, 4321, 'best saved');
console.log('best ok');
console.log('M5 OK');

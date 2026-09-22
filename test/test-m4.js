const T = require('./harness.js');
const { state, board, queue, frame, onKeyDown, hold, ghostY, hardDrop, reset, PIECES, W, H, HIDDEN, NEXT_COUNT } = T;
const key = (code, extra = {}) => onKeyDown({ code, repeat: false, preventDefault() {}, ...extra });
const fail = (m) => { console.error('FAIL', m); process.exit(1); };
const eq = (a, b, m) => { if (a !== b) fail(`${m}: got ${a}, want ${b}`); };
let t = 0; const tick = (ms = 16) => { t += ms; frame(t); };

// --- seed: same seed, same sequence; hash written
reset(12345);
eq(global.location.hash, '#seed=12345', 'hash written');
const seq1 = [state.cur.id, ...queue.slice(0, NEXT_COUNT)].join(',');
for (let i = 0; i < 10; i++) { board.fill(0); hardDrop(); }
reset(12345);
const seq2 = [state.cur.id, ...queue.slice(0, NEXT_COUNT)].join(',');
eq(seq1, seq2, 'same seed same pieces');
reset(54321);
const seq3 = [state.cur.id, ...queue.slice(0, NEXT_COUNT)].join(',');
if (seq3 === seq1) fail('different seed gave identical sequence (possible but 1 in 5040)');
console.log('seed ok:', seq1, 'vs', seq3);

// --- queue is NEXT_COUNT long and shifts on spawn
eq(queue.length >= NEXT_COUNT, true, 'queue length');
const head = queue[0];
hardDrop();
eq(state.cur.id, head, 'spawn takes the queue head');
// 7-bag: any 7 consecutive from a bag boundary are a permutation; check 14 draws contain each id exactly twice
reset(7);
const draws = [state.cur.id];
for (let i = 0; i < 13; i++) { board.fill(0); hardDrop(); draws.push(state.cur.id); }
const counts = draws.reduce((m, id) => (m[id] = (m[id] || 0) + 1, m), {});
for (let id = 1; id <= 7; id++) eq(counts[id], 2, 'bag count for ' + id);
console.log('queue + bag ok');

// --- hold: first hold parks and takes next; second hold on same piece refused; after spawn, swap works
reset(99);
const first = state.cur.id, nextUp = queue[0];
eq(hold(), true, 'hold accepted');
eq(state.hold, first, 'parked first');
eq(state.cur.id, nextUp, 'took next');
eq(hold(), false, 'second hold refused');
key('KeyC'); eq(state.hold, first, 'key C refused too while used');
hardDrop(); // lock, spawn -> holdUsed cleared
const cur = state.cur.id;
eq(hold(), true, 'hold after spawn');
eq(state.cur.id, first, 'swapped in the parked piece');
eq(state.hold, cur, 'parked the current');
console.log('hold ok');

// --- ghost lands where hard drop lands
reset(3); board.fill(0); board[(H - 1) * W + 4] = 7; board[(H - 2) * W + 4] = 7;
const p = state.cur; const gy = ghostY(p);
const beforeId = p.id, gx = p.x, gr = p.r;
hardDrop();
let lowest = -1; for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (board[y * W + x] === beforeId && y > lowest) lowest = y;
const ghostLowest = Math.max(...PIECES[beforeId].rot[gr].map(([, cy]) => gy + cy));
eq(lowest, ghostLowest, 'ghost lowest row equals landed lowest row');
console.log('ghost ok');

// --- Shift+R replays same seed, R gives a new one
reset(4242);
key('KeyR', { shiftKey: true }); eq(state.seed, 4242, 'shift+R keeps seed');
key('KeyR'); if (state.seed === 4242) fail('R did not change seed');
console.log('restart keys ok');
console.log('M4 OK');

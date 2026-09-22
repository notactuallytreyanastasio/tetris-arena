const T = require('./harness.js');
const { state, board, frame, HIDDEN, W } = T;
let t = 0;
const startY = state.cur.y;
// 2 seconds at 16ms
for (let i = 0; i < 125; i++) { t += 16; frame(t); }
console.log('start y', startY, 'after 2s y', state.cur.y, 'level', state.level);
// run 60 seconds, count locked cells
for (let i = 0; i < 3750; i++) { t += 16; frame(t); }
let filled = 0; for (const v of board) if (v) filled++;
console.log('filled cells after ~62s', filled, 'over', state.over);
if (state.cur.y <= startY && filled === 0) { console.error('FAIL gravity'); process.exit(1); }
if (filled === 0) { console.error('FAIL no lock'); process.exit(1); }
console.log('M1 OK');

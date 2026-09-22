const { api } = require('./harness.js');
const { SHAPES, NAMES, state, board, update, W, H, HIDDEN } = api;
// Known SRS states (x,y) per piece id 1..7
const expect = {
  I: [[[0,1],[1,1],[2,1],[3,1]], [[2,0],[2,1],[2,2],[2,3]], [[0,2],[1,2],[2,2],[3,2]], [[1,0],[1,1],[1,2],[1,3]]],
  T: [[[1,0],[0,1],[1,1],[2,1]], [[1,0],[1,1],[2,1],[1,2]], [[0,1],[1,1],[2,1],[1,2]], [[1,0],[0,1],[1,1],[1,2]]],
  J: [[[0,0],[0,1],[1,1],[2,1]], [[1,0],[2,0],[1,1],[1,2]], [[0,1],[1,1],[2,1],[2,2]], [[1,0],[1,1],[0,2],[1,2]]],
  L: [[[2,0],[0,1],[1,1],[2,1]], [[1,0],[1,1],[1,2],[2,2]], [[0,1],[1,1],[2,1],[0,2]], [[0,0],[1,0],[1,1],[1,2]]],
  S: [[[1,0],[2,0],[0,1],[1,1]], [[1,0],[1,1],[2,1],[2,2]], [[1,1],[2,1],[0,2],[1,2]], [[0,0],[0,1],[1,1],[1,2]]],
  Z: [[[0,0],[1,0],[1,1],[2,1]], [[2,0],[1,1],[2,1],[1,2]], [[0,1],[1,1],[1,2],[2,2]], [[1,0],[0,1],[1,1],[0,2]]],
};
const key = (cells) => cells.map(c => c.join(',')).sort().join(' ');
let ok = true;
for (let id = 1; id <= 7; id++) {
  const n = NAMES[id];
  if (!expect[n]) continue;
  for (let r = 0; r < 4; r++) {
    if (key(SHAPES[id][r]) !== key(expect[n][r])) { ok = false; console.log('MISMATCH', n, r, key(SHAPES[id][r]), 'vs', key(expect[n][r])); }
  }
}
console.log('SRS states', ok ? 'OK' : 'BAD');
// Run gravity: 800ms/row, simulate frames of 16ms
let locks = 0, lastPiece = state.piece;
for (let t = 0; t < 120000 && !state.over; t += 16) {
  update(16);
  if (state.piece !== lastPiece) { locks++; lastPiece = state.piece; }
}
let filled = 0; for (let i = 0; i < W * H; i++) if (board[i]) filled++;
console.log('locks', locks, 'filled cells', filled, 'over', state.over);
console.log(ok && locks > 5 ? 'ALL OK' : 'FAILURES');
process.exit(ok && locks > 5 ? 0 : 1);

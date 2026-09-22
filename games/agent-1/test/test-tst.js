const T = require('./harness.js');
const { state, board, rotate, PIECES, W, H, collides } = T;
const tid = PIECES.findIndex(p => p && p.name === 'T');
const cellsOf = (p) => PIECES[p.id].rot[p.r].map(([cx, cy]) => [p.x + cx, p.y + cy]);
// T-spin triple slot: rows 37-39 full except stem column 1 and nub hole (2,38).
// The overhang is (2,37), over the nub, so a vertical T cannot drop in: at
// y=36 its nub hits (2,37). Only a kick reaches y=37.
board.fill(0);
for (let y = 37; y < H; y++) for (let x = 0; x < W; x++) board[y * W + x] = 7;
for (const [x, y] of [[1, 37], [1, 38], [1, 39], [2, 38]]) board[y * W + x] = 0;
board[35 * W + 1] = 7; // the classic TST overhang: two above the stem top, one-cell gap
const slot = new Set(['1,37', '1,38', '1,39', '2,38']);
const found = [];
for (let r = 0; r < 4; r++) for (let x = -2; x < W; x++) for (let y = 30; y < 36; y++) {
  if (collides(tid, r, x, y) || !collides(tid, r, x, y + 1)) continue; // must be resting
  for (const dir of [0, 1]) {
    state.cur = { id: tid, r, x, y }; state.over = false; state.lockAcc = 0; state.lockResets = 0;
    if (rotate(dir) && cellsOf(state.cur).every(([cx, cy]) => slot.has(cx + ',' + cy))) {
      found.push(`state ${r} at (${x},${y}) ${dir ? 'ccw' : 'cw'} -> state ${state.cur.r} at (${state.cur.x},${state.cur.y})`);
    }
  }
}
console.log(found.length ? found.join('\n') : 'NO T-SPIN TRIPLE FOUND');
process.exit(found.length ? 0 : 1);

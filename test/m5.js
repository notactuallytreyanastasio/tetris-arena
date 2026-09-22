const { api, listeners, sandbox } = require('./harness.js');
const { state, board, W, H, I, reset, update, hardDrop } = api;
let fails = 0;
const check = (name, ok, extra='') => { console.log((ok ? 'ok  ' : 'FAIL') + ' ' + name + (ok ? '' : '  ' + extra)); if (!ok) fails++; };
const row = (y, s) => { for (let x = 0; x < W; x++) board[y*W+x] = s[x] === 'X' ? 1 : 0; };
const setPiece = (id, r, x, y) => { state.piece = { id, r, x, y, lowestY: y, resets: 0, spun: false, kick: 0 }; state.lockAcc = 0; };
const key = (code) => listeners.keydown({ code, repeat: false, preventDefault(){} });

// pause stops gravity, resumes, blocks input
reset(); const y0 = state.piece.y;
key('KeyP'); update(3000); check('paused: no gravity', state.paused && state.piece.y === y0);
const x0 = state.piece.x; key('ArrowLeft'); check('paused: input ignored', state.piece.x === x0);
key('Escape'); check('Esc resumes', !state.paused);
update(1100); check('gravity resumes', state.piece.y > y0);
// pause while holding right clears DAS
key('ArrowRight'); check('dir set', api.input.dir === 1);
key('KeyP'); check('pause clears held dir', api.input.dir === 0);
key('KeyP');
// game over: P does nothing
state.over = true; key('KeyP'); check('no pause when over', !state.paused);
state.over = false;

// combo: two consecutive clearing locks -> 50*1*level bonus on the second
reset(); board.fill(0);
row(H-1, 'XXXXXXXXX.'); setPiece(I, 1, 7, H-5); hardDrop(); update(200);
const s1 = state.score;               // 100 + drop
check('first clear no combo', state.combo === 0);
board.fill(0); row(H-1, 'XXXXXXXXX.'); setPiece(I, 1, 7, H-5); hardDrop(); update(200);
const drop = 2 * ((H-1) - (H-5) - 3); // I vertical spans 4 rows from y+0..y+3
check('second clear adds 50 combo', state.combo === 1 && state.score - s1 === 100 + 50 + drop, String(state.score - s1));
// a non-clearing lock resets combo
board.fill(0); setPiece(I, 0, 0, 1); hardDrop(); update(200);
check('non-clear resets combo', state.combo === -1);

// perfect clear: one full row, nothing else, cleared by an I -> 100 + 800 + drop
reset(); board.fill(0);
row(H-1, 'XXX....XXX'); setPiece(I, 0, 3, H-3);   // flat I fills the gap, nothing else left
const sp = state.score; hardDrop(); update(200);
check('perfect clear single = 900 + drop', state.score - sp === 900 + 2, String(state.score - sp));
// not perfect when a cell remains
reset(); board.fill(0);
row(H-1, 'XXXXXXXXX.'); row(H-2, 'X.........'); setPiece(I, 1, 7, H-5);
const sq = state.score; hardDrop(); update(200);
check('no bonus with leftover cell', state.score - sq === 100 + 2, String(state.score - sq));

// DAS charges through the clear flash: right held before the drop, the new piece moves within 60ms of spawning
reset(); board.fill(0);
row(H-1, 'XXX....XXX'); setPiece(I, 0, 3, H-3);
key('ArrowRight');                       // tap moves I to x=4? no: cols 4..7 would overlap... I state 0 at x=3 spans 3..6; row H-2 free so move ok
state.piece.x = 3;                       // put it back over the gap, keep the direction held
hardDrop();                              // clears row H-1, enters flash
check('flash running with dir held', state.clearing !== null && api.input.dir === 1);
update(120);                             // flash ends, next piece spawns
const nx = state.piece.x;
update(60);                              // 120 + 60 >= DAS 170: first shift should have fired
check('DAS charged during flash', state.piece.x === nx + 1, `${nx} -> ${state.piece.x}`);
listeners.keyup({ code: 'ArrowRight' });

console.log(fails ? `${fails} FAILURES` : 'ALL OK');
process.exit(fails ? 1 : 0);

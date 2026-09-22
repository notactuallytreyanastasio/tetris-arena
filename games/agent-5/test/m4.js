const { api, listeners } = require('./harness.js');
const { state, board, W, H, T, I, hold, ghostY, reset, update, hardDrop } = api;
let fails = 0;
const check = (name, ok, extra='') => { console.log((ok ? 'ok  ' : 'FAIL') + ' ' + name + (ok ? '' : '  ' + extra)); if (!ok) fails++; };
const row = (y, s) => { for (let x = 0; x < W; x++) board[y*W+x] = s[x] === 'X' ? 1 : 0; };
const key = (code) => listeners.keydown({ code, repeat: false, preventDefault(){} });

reset();
check('queue has 3 after spawn', state.queue.length === 3, String(state.queue.length));
const first = state.piece.id, q0 = state.queue[0];
// bag: 7 distinct in first 7 draws
const seen = new Set([first, ...state.queue]);
check('first 4 pieces distinct (7-bag)', seen.size === 4);

// hold: parks current, spawns queue head, refuses second hold
check('hold works', hold() === true && state.hold === first && state.piece.id === q0);
check('queue refilled to 3', state.queue.length === 3);
check('second hold refused', hold() === false);
// lock -> hold available again, and swapping returns parked piece
const cur = state.piece.id;
hardDrop(); if (state.clearing) update(200);
check('hold reset after lock', state.holdUsed === false);
const c2 = state.piece.id;
check('hold swaps back parked piece', hold() === true && state.piece.id === first && state.hold === c2);

// ghost: lands on stack
reset(); board.fill(0);
row(H-1, '....XXXX..');
state.piece = { id: T, r: 0, x: 3, y: 2, lowestY: 2, resets: 0, spun: false, kick: 0 };
check('ghostY lands on stack', ghostY(state.piece) === H - 3, String(ghostY(state.piece)));
row(H-1, '..........');
check('ghostY lands on floor', ghostY(state.piece) === H - 2, String(ghostY(state.piece)));

// keys: C and Shift hold
reset(); const a = state.piece.id;
key('KeyC'); check('C holds', state.hold === a);
hardDrop(); if (state.clearing) update(200);
const b = state.piece.id; key('ShiftLeft'); check('Shift holds', state.hold === b && state.piece.id === a);

// R restarts with hold cleared
key('KeyR'); check('R clears hold', state.hold === 0 && !state.holdUsed && state.queue.length === 3);

console.log(fails ? `${fails} FAILURES` : 'ALL OK');
process.exit(fails ? 1 : 0);

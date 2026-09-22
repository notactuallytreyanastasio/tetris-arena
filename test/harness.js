// Headless harness: stub enough DOM for game.js to run unmodified, then
// drive frames by hand. Run a suite with `node test/mN.js`, or all of them
// with `node test/run.js`.
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const noop = new Proxy(() => noop, { get: (_, k) => (k === Symbol.toPrimitive ? () => 0 : noop), apply: () => noop });
const elements = {};
function el(id) {
  if (!elements[id]) elements[id] = {
    id, style: {}, width: 0, height: 0, textContent: '', classList: { add() {}, remove() {}, toggle() {} },
    getContext: () => noop,
  };
  return elements[id];
}
const rafQueue = [];
const listeners = {};
const window = {
  devicePixelRatio: 1,
  addEventListener: (t, f) => (listeners[t] = listeners[t] || []).push(f),
  requestAnimationFrame: (f) => rafQueue.push(f),
  localStorage: { getItem: () => null, setItem() {} },
};
const document = { getElementById: el, addEventListener: window.addEventListener, hidden: false };
const location = { hash: process.env.HASH || '' };
const history = { replaceState: (_s, _t, url) => { location.hash = url; } };
const ctx = vm.createContext({ window, document, location, history, requestAnimationFrame: window.requestAnimationFrame,
  localStorage: window.localStorage, console, Math, Number, Uint8Array, Proxy, Symbol, Object, Array, Set, Map, Date, performance: { now: () => 0 } });
vm.runInContext(fs.readFileSync(process.env.GAME || path.join(__dirname, '..', 'game.js'), 'utf8'), ctx);
const T = window.__tetris;
let now = 0;
function tick(ms) {
  // advance time in <=16ms frames so the game's dt clamp never bites
  do {
    const step = Math.min(ms, 16);
    ms -= step; now += step;
    const q = rafQueue.splice(0);
    for (const f of q) f(now);
  } while (ms > 0);
}
function key(code, type = 'keydown') {
  for (const f of listeners[type] || []) f({ code, key: code, preventDefault() {}, repeat: false });
}
function show() {
  const { COLS, ROWS, HIDDEN, board, state, PIECES } = T;
  const p = state.piece;
  const g = Array.from(board);
  if (p) for (const [cx, cy] of PIECES[p.id].cells[p.rot]) { const y = p.y + cy; if (y >= 0) g[y * COLS + p.x + cx] = 9; }
  const lines = [];
  for (let y = 0; y < ROWS; y++) lines.push((y < HIDDEN ? '~' : '|') + g.slice(y * COLS, y * COLS + COLS).map(v => v === 9 ? '@' : v ? '#' : '.').join('') + '|');
  return lines.join('\n');
}
module.exports = { T, tick, key, show, listeners, elements, location };
if (require.main === module) {
  tick(0);
  console.log(show());
  for (let i = 0; i < 40; i++) tick(100);
  console.log('after 4s'); console.log(show());
  for (let i = 0; i < 4000; i++) tick(100);
  console.log('after 400s, over =', T.state.over); console.log(show());
}

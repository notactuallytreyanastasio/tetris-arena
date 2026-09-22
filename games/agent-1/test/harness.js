// Node harness: stub the DOM, load tetris.js, drive frame() with fake time.
const fs = require('fs');
const path = require('path').join(__dirname, '..', 'tetris.js');
const ctxStub = new Proxy({}, { get: (t, k) => (k === 'getImageData' ? () => ({ data: new Uint8ClampedArray(4) }) : () => {}) , set: () => true });
const canvasStub = () => ({ getContext: () => ctxStub, style: {}, width: 0, height: 0 });
const els = {};
global.window = global;
global.document = {
  getElementById: (id) => els[id] || (els[id] = { ...canvasStub(), textContent: '', classList: { add() {}, remove() {}, toggle() {} } }),
  addEventListener: () => {},
};
global.performance = { now: () => 0 };
global.requestAnimationFrame = () => 0;
global.devicePixelRatio = 1;
global.addEventListener = () => {};
global.location = { hash: "" };
global.history = { replaceState: (_, __, h) => { global.location.hash = h; } };
new Function(fs.readFileSync(path, 'utf8'))();
module.exports = global.__tetris;

const fs = require('fs');
const vm = require('vm');
function ctx2d() { return new Proxy({}, { get: () => () => {} , set: () => true }); }
const elements = {};
function el(id) {
  if (!elements[id]) elements[id] = {
    id, style: {}, width: 0, height: 0, textContent: '',
    classList: { add(){}, remove(){}, toggle(){}, contains(){return false;} },
    getContext: () => ctx2d(), addEventListener() {},
  };
  return elements[id];
}
const listeners = {};
const sandbox = {
  console, Math, Uint8Array, Proxy, Array, Object, JSON, Error, Set, Map,
  document: { getElementById: el, addEventListener: (t, f) => { listeners[t] = f; } },
  window: { devicePixelRatio: 2, addEventListener() {} },
  requestAnimationFrame: () => 0,
  localStorage: (() => { const m = {}; return { getItem: (k) => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); } }; })(),
  performance: { now: () => 0 },
};
sandbox.globalThis = sandbox;
const src = fs.readFileSync(process.argv[2], 'utf8');
const NAMES = ['state','board','SHAPES','fits','update','spawn','W','H','HIDDEN','NAMES','input',
  'tryMove','tryRotate','hardDrop','stepDown','lockNow','clearLines','I','O','T','S','Z','J','L',
  'hold','reset','gravityFor','SCORE','ghostY','KICKS_JLSTZ','KICKS_I','activeDir','SPAWN_Y','toast','loadBest'];
const expose = 'globalThis.__api = {' + NAMES.map(n => `get ${n}(){ try { return ${n}; } catch(e) { return undefined; } }`).join(',') + '};';
vm.runInNewContext(src + '\n;' + expose, sandbox, { filename: process.argv[2] });
module.exports = { api: sandbox.__api, listeners, sandbox };

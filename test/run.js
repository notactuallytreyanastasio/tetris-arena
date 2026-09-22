// Headless checks for the game core. Usage: node test/run.js
//
// js/pieces.js, js/board.js and js/game.js never touch the DOM, so they can
// be evaluated together in one vm context, exactly as the browser sees them
// as classic scripts sharing one global scope. Each test/mN.js file exports
// a function (t) that runs its checks with t.check(cond, message).

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const src = ['pieces', 'board', 'game']
  .map((f) => fs.readFileSync(path.join(root, 'js', f + '.js'), 'utf8'))
  .join('\n');

// The core files declare top-level const/class, which vm keeps inside the
// script's lexical scope. Append an export of the names the tests need.
const exportNames = [
  'PIECE_NAMES', 'PIECES', 'COLOR_BY_INDEX', 'KICKS_JLSTZ', 'KICKS_I', 'KICKS_180', 'kicksFor',
  'COLS', 'VISIBLE_ROWS', 'HIDDEN_ROWS', 'ROWS', 'Board',
  'gravityMs', 'LOCK_DELAY', 'LOCK_RESETS', 'NEXT_COUNT', 'CLEAR_FLASH_MS', 'SCORE', 'Bag', 'Game',
];
const context = { console, Math };
vm.createContext(context);
vm.runInContext(src + '\n;({' + exportNames.join(',') + '})', context);
const core = vm.runInContext('({' + exportNames.join(',') + '})', context);

let passed = 0;
let failed = 0;
const t = {
  ...core,
  check(cond, msg) {
    if (cond) { passed++; console.log('  ok   ' + msg); }
    else { failed++; console.log('  FAIL ' + msg); }
  },
  // Put a specific piece at the front of the queue and spawn it.
  force(g, name) { g.queue.unshift(core.PIECES[name]); g.spawn(); },
  // Fill row y except at the given columns.
  fillRow(g, y, gaps) { for (let x = 0; x < core.COLS; x++) g.board.grid[y][x] = gaps.includes(x) ? 0 : 7; },
  // ASCII dump of the board from row `from`, active piece as @.
  show(g, from) {
    const rows = [];
    for (let y = from; y < core.ROWS; y++) {
      let s = '';
      for (let x = 0; x < core.COLS; x++) {
        let v = g.board.grid[y][x];
        const a = g.active;
        if (a && !g.over && a.piece.states[a.rot].some((c) => a.x + c[0] === x && a.y + c[1] === y)) v = '@';
        s += v || '.';
      }
      rows.push(s);
    }
    return rows.join('\n');
  },
};

for (const f of ['m1', 'm2', 'm3', 'm4', 'm5']) {
  console.log(f);
  require('./' + f + '.js')(t);
}
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);

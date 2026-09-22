// Runs every probe against ../tetris.js in a stubbed DOM. No browser needed.
// Each file is its own process so state never leaks between milestones.
const { spawnSync } = require('child_process');
const path = require('path');
const files = ['test-m1', 'test-m2', 'test-m3', 'test-m4', 'test-m5', 'test-tst'];
let failed = 0;
for (const f of files) {
  const r = spawnSync(process.execPath, [path.join(__dirname, f + '.js')], { encoding: 'utf8' });
  const ok = r.status === 0;
  if (!ok) failed++;
  console.log((ok ? 'ok   ' : 'FAIL ') + f);
  if (!ok) console.log(r.stdout + r.stderr);
}
console.log(failed ? `${failed} file(s) failed` : `all ${files.length} files passed`);
process.exit(failed ? 1 : 0);

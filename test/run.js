// Runs every milestone probe against ../tetris.js in a stubbed DOM.
//   node test/run.js
const { spawnSync } = require('child_process');
const path = require('path');
const game = path.join(__dirname, '..', 'tetris.js');
let failed = 0;
for (const m of ['m1', 'm2', 'm3', 'm4', 'm5']) {
  const r = spawnSync(process.execPath, [path.join(__dirname, m + '.js'), game], { encoding: 'utf8' });
  const lines = r.stdout.trim().split('\n');
  const bad = lines.filter((l) => l.startsWith('FAIL'));
  console.log(`${m}: ${lines[lines.length - 1]}${bad.length ? '\n  ' + bad.join('\n  ') : ''}`);
  if (r.status !== 0 && m !== 'm1') failed++;
  if (r.stderr) console.error(r.stderr);
}
process.exit(failed ? 1 : 0);

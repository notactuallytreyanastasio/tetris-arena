// Runs every suite in order in a fresh process each, so one suite's state
// cannot leak into another. Exit code is non-zero if any check failed.
const { spawnSync } = require('child_process');
const path = require('path');
const suites = ['m2', 'm3', 'm4', 'm5', 'm6', 'm7'];
let failed = 0, total = 0;
for (const s of suites) {
  const r = spawnSync(process.execPath, [path.join(__dirname, s + '.js')], { encoding: 'utf8' });
  const lines = r.stdout.trim().split('\n');
  const checks = lines.filter((l) => /^(ok|FAIL) /.test(l));
  total += checks.length;
  const bad = checks.filter((l) => l.startsWith('FAIL'));
  failed += bad.length;
  console.log(`${s}: ${checks.length - bad.length}/${checks.length} passed`);
  for (const l of bad) console.log('  ' + l);
  if (r.status !== 0 && bad.length === 0) { console.log(r.stderr || r.stdout); failed++; }
}
console.log(`${total - failed}/${total} checks passed`);
process.exit(failed ? 1 : 0);

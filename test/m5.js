// M5: pause.
module.exports = (t) => {
  const { Game } = t;
  const g = new Game(); const y = g.active.y;
  g.setPaused(true); g.update(5000);
  t.check(g.active.y === y, 'paused: no gravity');
  t.check(!g.move(1) && !g.rotate(1) && !g.swapHold(), 'paused: inputs refused');
  g.hardDrop(); t.check(g.active.y === y, 'paused: hard drop refused');
  g.setPaused(false); g.update(1100);
  t.check(g.active.y > y, 'unpaused: gravity resumes');
  g.over = true; g.setPaused(true);
  t.check(!g.paused, 'cannot pause a finished game');
};

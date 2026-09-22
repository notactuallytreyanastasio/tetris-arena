// M2: kicks, drops, lock delay, step reset.
module.exports = (t) => {
  const { Game, PIECES, ROWS, gravityMs } = t;

  let g = new Game(); t.force(g, 'I'); g.rotate(1); while (g.move(1)) {}
  t.check(g.active.x === 7 && g.active.rot === 1, 'vertical I reaches the right wall');
  t.check(g.rotate(1) && g.active.rot === 2, 'I 1>2 at the right wall succeeds via its kick table');

  g = new Game(); t.force(g, 'O'); g.hardDrop();
  t.check(g.board.grid[ROWS - 1][4] === 2 && g.board.grid[ROWS - 1][5] === 2, 'O hard-drops to the floor at cols 4,5');

  g = new Game(); t.force(g, 'O'); while (g.tryMove(0, 1)) {}
  g.update(400); t.check(g.board.grid[ROWS - 1][4] === 0, 'resting piece not locked at 400ms');
  g.update(150); t.check(g.board.grid[ROWS - 1][4] === 2, 'resting piece locked by 550ms');

  g = new Game(); t.force(g, 'O'); while (g.tryMove(0, 1)) {}
  for (let i = 0; i < 20; i++) { g.update(400); g.move(i % 2 ? 1 : -1); }
  t.check(g.board.grid[ROWS - 1].some((v) => v === 2), 'move-reset cap: continuous moves still lock');

  // step reset: exhaust resets on a ledge, slide off, expect a fresh budget
  g = new Game(); t.fillRow(g, ROWS - 1, [0, 1, 2, 3]); t.fillRow(g, ROWS - 2, [0, 1, 2, 3]);
  t.force(g, 'O'); while (g.tryMove(0, 1)) {} g.active.lowestY = g.active.y; // tryMove skips bookkeeping
  for (let i = 0; i < 15; i++) { g.update(100); g.move(i % 2 ? 1 : -1); }
  t.check(g.active.lockResets === 15, 'resets exhausted on the ledge');
  while (g.move(-1)) {}
  while (g.tryMove(0, 1)) {} g.active.lowestY = g.active.y - 1; g.noteMoved();
  t.check(g.active.lockResets === 0, 'reaching a new lowest row restores the reset budget');

  g = new Game(); t.force(g, 'T'); const y0 = g.active.y; g.softDrop(true); g.update(gravityMs(1) / 20 * 3 + 1);
  t.check(g.active.y === y0 + 3, 'soft drop is 20x gravity');

  g = new Game(); let bad = 0;
  for (let i = 0; i < 2000; i++) {
    const r = Math.random();
    if (r < 0.3) g.move(Math.random() < 0.5 ? -1 : 1);
    else if (r < 0.6) g.rotate(Math.random() < 0.5 ? 1 : -1);
    else if (r < 0.7) g.hardDrop();
    g.update(50);
    if (g.over) break;
    const a = g.active;
    if (a && !g.board.fits(a.piece, a.rot, a.x, a.y)) bad++;
  }
  t.check(bad === 0, 'random move/rotate/drop never overlaps the stack');
};

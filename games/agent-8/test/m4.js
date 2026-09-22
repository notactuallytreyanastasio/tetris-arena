// M4: queue, hold, ghost, 180 rotation, clear flash.
module.exports = (t) => {
  const { Game, PIECES, ROWS, HIDDEN_ROWS, NEXT_COUNT, CLEAR_FLASH_MS } = t;

  let g = new Game();
  t.check(g.queue.length === NEXT_COUNT, 'queue shows ' + NEXT_COUNT + ' pieces');
  const six = new Set([g.active.piece.name].concat(g.queue.map((p) => p.name)));
  t.check(six.size === 6, 'active + queue are 6 distinct pieces from one bag');

  g = new Game(); const first = g.active.piece; const next = g.queue[0];
  t.check(g.swapHold() && g.hold === first && g.active.piece === next, 'hold parks the piece, next becomes active');
  t.check(!g.swapHold(), 'hold refused twice for one piece');
  g.hardDrop();
  const cur = g.active.piece;
  t.check(g.swapHold() && g.active.piece === first && g.hold === cur, 'hold swaps the parked piece back after a lock');
  t.check(g.active.rot === 0 && g.active.y === HIDDEN_ROWS - 1, 'piece out of hold spawns fresh');

  g = new Game(); t.force(g, 'T');
  t.check(g.rotate(2) && g.active.rot === 2 && g.rotate(2) && g.active.rot === 0, 'T 180 twice returns to spawn');
  g = new Game(); t.force(g, 'T'); while (g.tryMove(0, 1)) {} const y = g.active.y;
  t.check(g.rotate(2) && g.active.rot === 2 && g.active.y === y - 1 && g.active.kick === 1, 'T 180 on the floor kicks up one row via test 2');
  g = new Game(); t.force(g, 'O'); const ox = g.active.x;
  t.check(g.rotate(2) && g.active.x === ox, 'O 180 never kicks');

  g = new Game(); t.fillRow(g, ROWS - 1, [4, 5]); t.force(g, 'O'); g.hardDrop();
  t.check(g.active === null && g.clearing && g.clearing.rows.length === 1 && g.lines === 0, 'clearing state: no piece, lines not yet counted');
  t.check(!g.move(1) && !g.rotate(1) && !g.swapHold(), 'inputs refused during the flash');
  g.update(CLEAR_FLASH_MS - 20); t.check(g.clearing !== null, 'still flashing just before ' + CLEAR_FLASH_MS + 'ms');
  g.update(30); t.check(g.clearing === null && g.active !== null && g.lines === 1, 'flash ends, row collapses, next piece spawns');

  g = new Game(); t.force(g, 'O');
  t.check(g.ghostY() === ROWS - 2, 'ghost of O on an empty board sits on the floor');

  g = new Game(); let bad = 0;
  for (let i = 0; i < 3000; i++) {
    const r = Math.random();
    if (r < 0.25) g.move(Math.random() < 0.5 ? -1 : 1);
    else if (r < 0.5) g.rotate([1, -1, 2][Math.floor(Math.random() * 3)]);
    else if (r < 0.6) g.hardDrop();
    else if (r < 0.65) g.swapHold();
    g.update(40);
    if (g.over) break;
    const a = g.active;
    if (a && !g.board.fits(a.piece, a.rot, a.x, a.y)) bad++;
  }
  t.check(bad === 0, 'random play with hold and 180 never overlaps the stack');
};

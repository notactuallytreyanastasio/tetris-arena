// M3: scoring, T-spins, b2b, combo, perfect clear, levels, game over.
module.exports = (t) => {
  const { Game, PIECES, ROWS, HIDDEN_ROWS, CLEAR_FLASH_MS } = t;
  const settle = (g) => g.update(CLEAR_FLASH_MS);

  let g = new Game(); t.force(g, 'T');
  t.check(g.active.y === HIDDEN_ROWS - 1, 'T spawns with its box top on the last hidden row');

  g = new Game(); t.fillRow(g, ROWS - 1, [4, 5]); t.fillRow(g, ROWS - 2, [4, 5]); t.force(g, 'O');
  const drop = ROWS - 2 - g.active.y; g.hardDrop(); settle(g);
  t.check(g.lines === 2 && g.score === drop * 2 + 300 + 1200, 'O into a 2-wide well: double 300 + perfect clear 1200 + hard drop');
  t.check(g.lastClear.label === 'PERFECT CLEAR DOUBLE', 'label: ' + g.lastClear.label);

  // T-spin double: T resting vertical beside the slot, rotate CCW, kick test 3 drops it in
  g = new Game();
  t.fillRow(g, ROWS - 1, [4]); t.fillRow(g, ROWS - 2, [3, 4, 5]);
  g.board.grid[ROWS - 3][3] = 7; g.board.grid[ROWS - 3][6] = 7;
  g.active = { piece: PIECES.T, rot: 3, x: 4, y: ROWS - 4, lockAcc: 0, lockResets: 0, lowestY: ROWS - 4, spun: false, kick: 0 };
  t.check(g.rotate(-1) && g.active.rot === 2 && g.active.x === 3 && g.active.y === ROWS - 3 && g.active.kick === 2, 'T enters the TSD slot via kick test 3');
  t.check(g.tspinKind() === 'full', 'detected as a full T-spin');
  let s0 = g.score; g.hardDrop(); settle(g);
  t.check(g.lines === 2 && g.score - s0 === 1200, 'T-spin double scores 1200 at level 1');

  // b2b tetris after the T-spin, with combo 1 and a perfect clear
  g.board.reset(); for (let y = ROWS - 4; y < ROWS; y++) t.fillRow(g, y, [0]);
  t.force(g, 'I'); g.rotate(1); while (g.move(-1)) {} const d2 = g.ghostY() - g.active.y; s0 = g.score; g.hardDrop(); settle(g);
  t.check(g.score - s0 === d2 * 2 + Math.floor(800 * 1.5) + 50 + 2000, 'b2b tetris 1200 + combo 50 + perfect 2000');
  t.check(g.lastClear.label === 'PERFECT CLEAR B2B TETRIS COMBO 1', 'label: ' + g.lastClear.label);

  // lineless T-spin scores 400 and does not break b2b
  g = new Game(); g.b2b = true;
  t.fillRow(g, ROWS - 1, [4, 7, 8, 9]); t.fillRow(g, ROWS - 2, [3, 4, 5, 7, 8, 9]);
  g.board.grid[ROWS - 3][3] = 7; g.board.grid[ROWS - 3][6] = 7;
  g.active = { piece: PIECES.T, rot: 3, x: 4, y: ROWS - 4, lockAcc: 0, lockResets: 0, lowestY: ROWS - 4, spun: false, kick: 0 };
  g.rotate(-1); s0 = g.score; g.hardDrop();
  t.check(g.score - s0 === 400 && g.b2b === true && g.lines === 0, 'lineless T-spin scores 400 and keeps b2b');

  g = new Game(); g.lines = 9; t.fillRow(g, ROWS - 1, [4, 5]); t.force(g, 'O'); g.hardDrop(); settle(g);
  t.check(g.level === 2, 'level 2 at 10 lines');

  g = new Game(); for (let y = 0; y < ROWS; y++) t.fillRow(g, y, []); t.force(g, 'T');
  t.check(g.over, 'blocked spawn is a block-out');
  g.reset(); t.check(!g.over && g.score === 0 && g.lines === 0, 'R resets everything');

  g = new Game(); g.board.reset(); t.fillRow(g, HIDDEN_ROWS, [0, 1, 2, 3, 4, 5, 6]);
  g.active = { piece: PIECES.O, rot: 0, x: 4, y: 0, lockAcc: 0, lockResets: 0, lowestY: 0, spun: false, kick: 0 };
  g.lock(); t.check(g.over, 'a piece locking entirely in the hidden rows is a lock-out');
};

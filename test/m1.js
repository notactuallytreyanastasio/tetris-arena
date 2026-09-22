// M1: rotation states match SRS; gravity-only play ends in a block-out.
module.exports = (t) => {
  const { PIECE_NAMES, PIECES, Game, gravityMs } = t;

  // Reference SRS states, spawn orientation then clockwise, as row strings.
  const REF = {
    I: ['....XXXX........', '..X...X...X...X.', '........XXXX....', '.X...X...X...X..'],
    O: ['XXXX', 'XXXX', 'XXXX', 'XXXX'],
    T: ['.X.XXX...', '.X..XX.X.', '...XXX.X.', '.X.XX..X.'],
    S: ['.XXXX....', '.X..XX..X', '....XXXX.', 'X..XX..X.'],
    Z: ['XX..XX...', '..X.XX.X.', '...XX..XX', '.X.XX.X..'],
    J: ['X..XXX...', '.XX.X..X.', '...XXX..X', '.X..X.XX.'],
    L: ['..XXXX...', '.X..X..XX', '...XXXX..', 'XX..X..X.'],
  };
  for (const name of PIECE_NAMES) {
    const p = PIECES[name];
    for (let r = 0; r < 4; r++) {
      let s = '';
      for (let y = 0; y < p.size; y++) for (let x = 0; x < p.size; x++) {
        s += p.states[r].some((c) => c[0] === x && c[1] === y) ? 'X' : '.';
      }
      t.check(s === REF[name][r], name + ' state ' + r + ' matches SRS');
    }
  }

  t.check(Math.round(gravityMs(1)) === 1000 && Math.round(gravityMs(10)) === 64, 'gravity 1000ms at L1, 64ms at L10');

  const g = new Game();
  let ms = 0;
  while (!g.over && ms < 600000) { g.update(16); ms += 16; }
  t.check(g.over && ms < 600000, 'gravity-only game ends in block-out after ' + (ms / 1000).toFixed(0) + 's');
};

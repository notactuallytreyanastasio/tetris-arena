// Draws the game state onto the board canvas. Pure function of state:
// nothing here is retained between frames.

const Render = (() => {
  const CELL = 30;
  const BG = '#0a0c12';
  const GRIDLINE = '#161a25';

  function cell(ctx, x, y, color, size = CELL) {
    ctx.fillStyle = color;
    ctx.fillRect(x * size, y * size, size, size);
    // bevel: lighter top-left edge, darker bottom-right
    ctx.fillStyle = 'rgba(255,255,255,0.22)';
    ctx.fillRect(x * size, y * size, size, 2);
    ctx.fillRect(x * size, y * size, 2, size);
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.fillRect(x * size, y * size + size - 2, size, 2);
    ctx.fillRect(x * size + size - 2, y * size, 2, size);
  }

  function board(ctx, game) {
    const W = Board.W, H = Board.H - Board.HIDDEN;
    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, W * CELL, H * CELL);

    ctx.strokeStyle = GRIDLINE;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 1; x < W; x++) { ctx.moveTo(x * CELL + 0.5, 0); ctx.lineTo(x * CELL + 0.5, H * CELL); }
    for (let y = 1; y < H; y++) { ctx.moveTo(0, y * CELL + 0.5); ctx.lineTo(W * CELL, y * CELL + 0.5); }
    ctx.stroke();

    const grid = game.board.grid;
    const flashing = new Set(game.clearing ? game.clearing.rows : []);
    // Full rows go white for the first half of the flash, then dim.
    const flashColor = game.clearing && game.clearing.t < CLEAR_FLASH / 2 ? '#ffffff' : '#3a3f4d';
    for (let y = Board.HIDDEN; y < Board.H; y++) {
      for (let x = 0; x < W; x++) {
        const t = grid[y][x];
        if (t) cell(ctx, x, y - Board.HIDDEN, flashing.has(y) ? flashColor : PIECES.COLORS[t]);
      }
    }

    const p = game.active;
    if (p) {
      for (const [dx, dy] of game.cells(p)) {
        const y = p.y + dy - Board.HIDDEN;
        if (y >= 0) cell(ctx, p.x + dx, y, PIECES.COLORS[p.type]);
      }
    }
  }

  return { CELL, board, cell };
})();

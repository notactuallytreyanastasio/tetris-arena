// Canvas drawing. Redraws the whole well every frame; at 10x20 cells that is
// cheaper than tracking what changed.

const CELL = 30;

function makeRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  canvas.width = COLS * CELL;
  canvas.height = VISIBLE_ROWS * CELL;

  function drawCell(x, y, color) {
    const vy = y - HIDDEN_ROWS;
    if (vy < 0) return;
    const px = x * CELL, py = vy * CELL;
    ctx.fillStyle = color;
    ctx.fillRect(px, py, CELL, CELL);
    // A lighter top-left edge and darker bottom-right edge gives cheap depth.
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.fillRect(px, py, CELL, 3);
    ctx.fillRect(px, py, 3, CELL);
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.fillRect(px, py + CELL - 3, CELL, 3);
    ctx.fillRect(px + CELL - 3, py, 3, CELL);
  }

  function drawGrid() {
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.lineWidth = 1;
    for (let x = 1; x < COLS; x++) {
      ctx.beginPath(); ctx.moveTo(x * CELL + 0.5, 0); ctx.lineTo(x * CELL + 0.5, canvas.height); ctx.stroke();
    }
    for (let y = 1; y < VISIBLE_ROWS; y++) {
      ctx.beginPath(); ctx.moveTo(0, y * CELL + 0.5); ctx.lineTo(canvas.width, y * CELL + 0.5); ctx.stroke();
    }
  }

  function draw(game) {
    ctx.fillStyle = '#0d0f14';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    drawGrid();

    for (let y = 0; y < TOTAL_ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        const id = game.board[y][x];
        if (id) drawCell(x, y, COLORS[id]);
      }
    }

    if (game.piece) {
      const color = PIECES[game.piece.type].color;
      for (const [x, y] of pieceCells(game.piece)) drawCell(x, y, color);
    }

    if (game.over) {
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 28px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('GAME OVER', canvas.width / 2, canvas.height / 2);
    }
  }

  return { draw };
}

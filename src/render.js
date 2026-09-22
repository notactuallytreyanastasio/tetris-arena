// Canvas drawing. Redraws the whole well every frame; at 10x20 cells that is
// cheaper than tracking what changed.

const CELL = 30;

// Backing store scaled by devicePixelRatio so cell edges are crisp on
// retina screens (taken from agent-1). Everything below draws in CSS pixels.
function fitCanvas(canvas, cssW, cssH) {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(cssW * dpr);
  canvas.height = Math.round(cssH * dpr);
  canvas.style.width = cssW + 'px';
  canvas.style.height = cssH + 'px';
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return ctx;
}

function makeRenderer(canvas) {
  const W = COLS * CELL, H = VISIBLE_ROWS * CELL;
  const ctx = fitCanvas(canvas, W, H);

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
      ctx.beginPath(); ctx.moveTo(x * CELL + 0.5, 0); ctx.lineTo(x * CELL + 0.5, H); ctx.stroke();
    }
    for (let y = 1; y < VISIBLE_ROWS; y++) {
      ctx.beginPath(); ctx.moveTo(0, y * CELL + 0.5); ctx.lineTo(W, y * CELL + 0.5); ctx.stroke();
    }
  }

  function draw(game) {
    ctx.fillStyle = '#0d0f14';
    ctx.fillRect(0, 0, W, H);
    drawGrid();

    // Rows mid-clear are drawn white so the clear reads as an event.
    const flashing = game.clearing ? new Set(game.clearing.rows) : null;
    for (let y = 0; y < TOTAL_ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        const id = game.board[y][x];
        if (id) drawCell(x, y, flashing && flashing.has(y) ? '#ffffff' : COLORS[id]);
      }
    }

    if (game.piece) {
      const color = PIECES[game.piece.type].color;
      for (const [x, y] of pieceCells(game.piece)) drawCell(x, y, color);
    }
  }

  return { draw };
}

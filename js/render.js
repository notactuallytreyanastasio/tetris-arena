// Canvas rendering. Everything is drawn from Game state every frame.

const CELL = 30;

// Size a canvas in CSS pixels but back it at devicePixelRatio so cell edges
// are crisp on retina. Draw code keeps working in CSS-pixel units.
// (Taken from agent-1's fitCanvas; here it also returns the context.)
function fitCanvas(canvas, cssW, cssH) {
  const dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
  canvas.width = Math.round(cssW * dpr);
  canvas.height = Math.round(cssH * dpr);
  canvas.style.width = cssW + 'px';
  canvas.style.height = cssH + 'px';
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return ctx;
}

function makeRenderer(boardCanvas) {
  const W = COLS * CELL, H = VISIBLE_ROWS * CELL;
  const ctx = fitCanvas(boardCanvas, W, H);

  function cell(x, y, color, alpha = 1) {
    const px = x * CELL, py = y * CELL;
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    ctx.fillRect(px, py, CELL, CELL);
    // bevel: light top-left, dark bottom-right
    ctx.fillStyle = 'rgba(255,255,255,0.22)';
    ctx.fillRect(px, py, CELL, 3);
    ctx.fillRect(px, py, 3, CELL);
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.fillRect(px, py + CELL - 3, CELL, 3);
    ctx.fillRect(px + CELL - 3, py, 3, CELL);
    ctx.globalAlpha = 1;
  }

  function drawGridLines() {
    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    ctx.lineWidth = 1;
    for (let x = 1; x < COLS; x++) {
      ctx.beginPath(); ctx.moveTo(x * CELL + .5, 0); ctx.lineTo(x * CELL + .5, VISIBLE_ROWS * CELL); ctx.stroke();
    }
    for (let y = 1; y < VISIBLE_ROWS; y++) {
      ctx.beginPath(); ctx.moveTo(0, y * CELL + .5); ctx.lineTo(COLS * CELL, y * CELL + .5); ctx.stroke();
    }
  }

  function drawShape(shape, x, y, color, alpha) {
    for (let r = 0; r < shape.length; r++) {
      for (let c = 0; c < shape[r].length; c++) {
        if (!shape[r][c]) continue;
        const vy = y + r - HIDDEN;
        if (vy < 0) continue;
        cell(x + c, vy, color, alpha);
      }
    }
  }

  function draw(game) {
    ctx.fillStyle = '#0a0b0f';
    ctx.fillRect(0, 0, W, H);
    drawGridLines();

    for (let r = HIDDEN; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const v = game.grid[r][c];
        if (v) cell(c, r - HIDDEN, COLORS[v]);
      }
    }

    if (game.piece) {
      drawShape(game.shape(), game.piece.x, game.piece.y, COLORS[game.piece.id]);
    }
  }

  return { draw };
}

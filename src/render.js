// Canvas drawing. Redraws the whole well every frame; at 10x20 cells that is
// cheaper than tracking what changed. Hold and next previews are their own
// small canvases, redrawn only when the piece they show changes.

const CELL = 30;
const PREVIEW_CELL = 20;

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

// A bevelled block at pixel (px, py). Shared by the well and the previews.
function drawBlock(ctx, px, py, size, color) {
  ctx.fillStyle = color;
  ctx.fillRect(px, py, size, size);
  // A lighter top-left edge and darker bottom-right edge gives cheap depth.
  const b = Math.max(2, Math.round(size / 10));
  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  ctx.fillRect(px, py, size, b);
  ctx.fillRect(px, py, b, size);
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.fillRect(px, py + size - b, size, b);
  ctx.fillRect(px + size - b, py, b, size);
}

// Draw a piece type in its spawn orientation centred in a w x h box whose
// top-left is (ox, oy). Centred on the cells actually occupied, not the
// bounding box, so I and O do not sit visibly off-centre.
function drawPreviewPiece(ctx, type, ox, oy, w, h, alpha = 1) {
  const cells = PIECES[type].states[0];
  const xs = cells.map(([x]) => x), ys = cells.map(([, y]) => y);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  const pw = (maxX - minX + 1) * PREVIEW_CELL, ph = (maxY - minY + 1) * PREVIEW_CELL;
  const left = ox + (w - pw) / 2, top = oy + (h - ph) / 2;
  ctx.globalAlpha = alpha;
  for (const [x, y] of cells) {
    drawBlock(ctx, left + (x - minX) * PREVIEW_CELL, top + (y - minY) * PREVIEW_CELL, PREVIEW_CELL, PIECES[type].color);
  }
  ctx.globalAlpha = 1;
}

function makeRenderer({ well, hold, next }) {
  const W = COLS * CELL, H = VISIBLE_ROWS * CELL;
  const ctx = fitCanvas(well, W, H);
  const HOLD_W = 120, HOLD_H = 90;
  const NEXT_W = 120, SLOT_H = 54;
  const holdCtx = fitCanvas(hold, HOLD_W, HOLD_H);
  const nextCtx = fitCanvas(next, NEXT_W, SLOT_H * NEXT_PREVIEW);
  let shownHold = undefined, shownNext = '';

  function drawCell(x, y, color) {
    const vy = y - HIDDEN_ROWS;
    if (vy < 0) return;
    drawBlock(ctx, x * CELL, vy * CELL, CELL, color);
  }

  // Ghost: an outline where the piece would land.
  function drawGhostCell(x, y, color) {
    const vy = y - HIDDEN_ROWS;
    if (vy < 0) return;
    ctx.strokeStyle = color;
    ctx.globalAlpha = 0.45;
    ctx.lineWidth = 2;
    ctx.strokeRect(x * CELL + 2, vy * CELL + 2, CELL - 4, CELL - 4);
    ctx.globalAlpha = 1;
  }

  function drawGrid() {
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 1; x < COLS; x++) { ctx.moveTo(x * CELL + 0.5, 0); ctx.lineTo(x * CELL + 0.5, H); }
    for (let y = 1; y < VISIBLE_ROWS; y++) { ctx.moveTo(0, y * CELL + 0.5); ctx.lineTo(W, y * CELL + 0.5); }
    ctx.stroke();
  }

  function drawWell(game) {
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
      const gy = game.ghostY();
      if (gy !== game.piece.y) {
        for (const [x, y] of pieceCells({ ...game.piece, y: gy })) drawGhostCell(x, y, color);
      }
      // Lock pulse (idea from agent-5): a resting piece fades as its lock
      // delay runs out, so "about to settle" is visible, not a surprise.
      ctx.globalAlpha = 1 - 0.5 * game.lockProgress();
      for (const [x, y] of pieceCells(game.piece)) drawCell(x, y, color);
      ctx.globalAlpha = 1;
    }
  }

  function drawPreviews(game) {
    const holdKey = game.hold + (game.holdUsed ? '!' : '');
    if (holdKey !== shownHold) {
      shownHold = holdKey;
      holdCtx.fillStyle = '#0d0f14';
      holdCtx.fillRect(0, 0, HOLD_W, HOLD_H);
      if (game.hold) drawPreviewPiece(holdCtx, game.hold, 0, 0, HOLD_W, HOLD_H, game.holdUsed ? 0.35 : 1);
    }
    const queue = game.preview();
    const nextKey = queue.join('');
    if (nextKey !== shownNext) {
      shownNext = nextKey;
      nextCtx.fillStyle = '#0d0f14';
      nextCtx.fillRect(0, 0, NEXT_W, SLOT_H * NEXT_PREVIEW);
      queue.forEach((type, i) => drawPreviewPiece(nextCtx, type, 0, i * SLOT_H, NEXT_W, SLOT_H));
    }
  }

  function draw(game) {
    drawWell(game);
    drawPreviews(game);
  }

  return { draw };
}

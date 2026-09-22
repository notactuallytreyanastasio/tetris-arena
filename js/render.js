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

  // Ghost: an inset outline in the piece colour. An outline never reads as a
  // settled block, whatever the stack colour under it. (Style via agent-5.)
  function drawGhost(shape, x, y, color) {
    ctx.strokeStyle = color;
    ctx.globalAlpha = 0.55;
    ctx.lineWidth = 2;
    for (let r = 0; r < shape.length; r++) {
      for (let c = 0; c < shape[r].length; c++) {
        if (!shape[r][c]) continue;
        const vy = y + r - HIDDEN;
        if (vy < 0) continue;
        ctx.strokeRect((x + c) * CELL + 3, vy * CELL + 3, CELL - 6, CELL - 6);
      }
    }
    ctx.globalAlpha = 1;
  }

  // While the piece rests on the stack, whiten it in proportion to how much
  // of the lock delay has elapsed so the lock is never a surprise. (agent-5)
  function drawLockPulse(game) {
    if (!game.grounded() || game.lockAcc <= 0) return;
    const a = 0.35 * Math.min(game.lockAcc / LOCK_DELAY_MS, 1);
    const shape = game.shape();
    ctx.fillStyle = `rgba(255,255,255,${a})`;
    for (let r = 0; r < shape.length; r++) {
      for (let c = 0; c < shape[r].length; c++) {
        if (!shape[r][c]) continue;
        const vy = game.piece.y + r - HIDDEN;
        if (vy >= 0) ctx.fillRect((game.piece.x + c) * CELL, vy * CELL, CELL, CELL);
      }
    }
  }

  // Fading vertical streak where a hard drop just passed.
  function drawTrail(game) {
    const t = game.trail;
    if (!t) return;
    const life = t.ms / TRAIL_MS;
    for (const [x, fromY, toY] of t.cols) {
      const y0 = Math.max(fromY - HIDDEN, 0), y1 = toY - HIDDEN;
      if (y1 <= y0) continue;
      const grad = ctx.createLinearGradient(0, y0 * CELL, 0, y1 * CELL);
      grad.addColorStop(0, 'rgba(255,255,255,0)');
      grad.addColorStop(1, `rgba(255,255,255,${0.35 * life})`);
      ctx.fillStyle = grad;
      ctx.fillRect(x * CELL + 4, y0 * CELL, CELL - 8, (y1 - y0) * CELL);
    }
  }

  // Scoring feedback stacked from the middle of the board, fading out.
  function drawToasts(game) {
    if (!game.toasts.length) return;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = 'bold 18px ui-monospace, Menlo, Consolas, monospace';
    game.toasts.forEach((t, i) => {
      const life = t.ms / TOAST_MS;               // 1 -> 0
      const rise = (1 - life) * 14;
      ctx.globalAlpha = Math.min(1, life * 2);
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      const w = ctx.measureText(t.text).width + 16;
      const cy = H * 0.38 + i * 26 - rise;
      ctx.fillRect(W / 2 - w / 2, cy - 12, w, 24);
      ctx.fillStyle = '#ffffff';
      ctx.fillText(t.text, W / 2, cy);
    });
    ctx.globalAlpha = 1;
  }

  function draw(game) {
    ctx.fillStyle = '#0a0b0f';
    ctx.fillRect(0, 0, W, H);
    drawGridLines();

    const flashing = game.clearing ? game.clearing.rows : [];
    for (let r = HIDDEN; r < ROWS; r++) {
      const flash = flashing.includes(r);
      for (let c = 0; c < COLS; c++) {
        const v = game.grid[r][c];
        if (v) cell(c, r - HIDDEN, flash ? '#ffffff' : COLORS[v]);
      }
    }

    drawTrail(game);
    if (game.piece) {
      const color = COLORS[game.piece.id];
      const gy = game.ghostY();
      if (gy !== game.piece.y) drawGhost(game.shape(), game.piece.x, gy, color);
      drawShape(game.shape(), game.piece.x, game.piece.y, color);
      drawLockPulse(game);
    }
    drawToasts(game);
  }

  return { draw };
}

// Side panels: a column of piece previews, each centred in a 4x4 cell box.
// Used for both the next queue and the hold slot.
function makePreview(canvas, slots) {
  const SIZE = 24, BOX = 4 * SIZE;
  const ctx = fitCanvas(canvas, BOX, BOX * slots);
  let shown = null;   // redraw only when the contents change (via agent-3)

  function draw(ids, dim = false) {
    const key = ids.join(',') + (dim ? '!' : '');
    if (key === shown) return;
    shown = key;
    ctx.clearRect(0, 0, BOX, BOX * slots);
    ctx.globalAlpha = dim ? 0.35 : 1;
    ids.forEach((id, slot) => {
      if (!id) return;
      const shape = ROTATIONS[id][0];
      // bounding box of filled cells, so every piece is centred visually
      let minR = 9, maxR = -1, minC = 9, maxC = -1;
      shape.forEach((row, r) => row.forEach((v, c) => {
        if (!v) return;
        minR = Math.min(minR, r); maxR = Math.max(maxR, r);
        minC = Math.min(minC, c); maxC = Math.max(maxC, c);
      }));
      const w = (maxC - minC + 1) * SIZE, h = (maxR - minR + 1) * SIZE;
      const ox = (BOX - w) / 2 - minC * SIZE, oy = slot * BOX + (BOX - h) / 2 - minR * SIZE;
      ctx.fillStyle = COLORS[id];
      shape.forEach((row, r) => row.forEach((v, c) => {
        if (!v) return;
        const px = ox + c * SIZE, py = oy + r * SIZE;
        ctx.fillStyle = COLORS[id];
        ctx.fillRect(px, py, SIZE, SIZE);
        ctx.fillStyle = 'rgba(255,255,255,0.22)';
        ctx.fillRect(px, py, SIZE, 2); ctx.fillRect(px, py, 2, SIZE);
        ctx.fillStyle = 'rgba(0,0,0,0.28)';
        ctx.fillRect(px, py + SIZE - 2, SIZE, 2); ctx.fillRect(px + SIZE - 2, py, 2, SIZE);
      }));
    });
    ctx.globalAlpha = 1;
  }
  return { draw };
}

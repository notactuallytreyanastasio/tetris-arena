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

    // Hard-drop trail: a fading streak down each column the piece fell through.
    const tr = game.dropTrail;
    if (tr) {
      const alpha = 0.35 * (1 - tr.t / TRAIL_MS);
      const cols = new Map();   // column -> [topmost dy, bottom dy]
      for (const [dx, dy] of tr.cells) {
        const c = cols.get(dx);
        cols.set(dx, c ? [Math.min(c[0], dy), Math.max(c[1], dy)] : [dy, dy]);
      }
      for (const [dx, [top, bottom]] of cols) {
        const yStart = tr.y0 + top - Board.HIDDEN;
        const yEnd = tr.y1 + bottom - Board.HIDDEN;   // last row the trail covers
        const grad = ctx.createLinearGradient(0, yStart * CELL, 0, (yEnd + 1) * CELL);
        grad.addColorStop(0, 'rgba(255,255,255,0)');
        grad.addColorStop(1, PIECES.COLORS[tr.type]);
        ctx.globalAlpha = alpha;
        ctx.fillStyle = grad;
        ctx.fillRect((tr.x + dx) * CELL, Math.max(0, yStart) * CELL, CELL, (yEnd + 1 - Math.max(0, yStart)) * CELL);
        ctx.globalAlpha = 1;
      }
    }

    const p = game.active;
    if (p) {
      // Ghost: outline where the piece would land. Outline, not fill,
      // because a filled ghost blends into the stack.
      const gy = game.ghostY();
      if (gy !== p.y) {
        ctx.strokeStyle = PIECES.COLORS[p.type];
        ctx.lineWidth = 2;
        ctx.globalAlpha = 0.45;
        for (const [dx, dy] of game.cells(p)) {
          const y = gy + dy - Board.HIDDEN;
          if (y >= 0) ctx.strokeRect((p.x + dx) * CELL + 2, y * CELL + 2, CELL - 4, CELL - 4);
        }
        ctx.globalAlpha = 1;
      }
      // Lock pulse: a grounded piece whitens as its lock timer runs out.
      const pulse = gy === p.y ? Math.min(game.lockAcc / LOCK_DELAY, 1) : 0;
      for (const [dx, dy] of game.cells(p)) {
        const y = p.y + dy - Board.HIDDEN;
        if (y < 0) continue;
        cell(ctx, p.x + dx, y, PIECES.COLORS[p.type]);
        if (pulse > 0) {
          ctx.fillStyle = `rgba(255,255,255,${0.55 * pulse})`;
          ctx.fillRect((p.x + dx) * CELL, y * CELL, CELL, CELL);
        }
      }
    }
  }

  // Draw a list of piece types stacked in slots on a preview canvas, each
  // centred in its slot. `types` may contain null for an empty slot.
  function preview(ctx, types, slotH, size, dim = false) {
    const W = ctx.canvas.width;
    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, W, ctx.canvas.height);
    ctx.globalAlpha = dim ? 0.3 : 1;
    types.forEach((type, slot) => {
      if (!type) return;
      const cells = PIECES.cells(type, 0);
      const xs = cells.map(c => c[0]), ys = cells.map(c => c[1]);
      const minX = Math.min(...xs), maxX = Math.max(...xs);
      const minY = Math.min(...ys), maxY = Math.max(...ys);
      const ox = (W - (maxX - minX + 1) * size) / 2 - minX * size;
      const oy = slot * slotH + (slotH - (maxY - minY + 1) * size) / 2 - minY * size;
      ctx.save();
      ctx.translate(ox, oy);
      for (const [dx, dy] of cells) cell(ctx, dx, dy, PIECES.COLORS[type], size);
      ctx.restore();
    });
    ctx.globalAlpha = 1;
  }

  return { CELL, board, cell, preview };
})();

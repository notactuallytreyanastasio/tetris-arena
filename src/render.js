// Canvas renderer. Redraws the whole field every frame: 200 cells is
// nothing, and it means ghost pieces, lock flashes and clear animations are
// just more fillRect calls with no state to diff.
(function (root) {
  'use strict';

  const { COLS, ROWS, HIDDEN } = root.BoardModule;
  const { PIECES, COLORS } = root.Pieces;
  const { CLEAR_ANIM_MS } = root.GameModule;

  const CELL = 30; // CSS pixels

  function setupCanvas(canvas, cols, rows) {
    const dpr = window.devicePixelRatio || 1;
    canvas.width = cols * CELL * dpr;
    canvas.height = rows * CELL * dpr;
    canvas.style.width = cols * CELL + 'px';
    canvas.style.height = rows * CELL + 'px';
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return ctx;
  }

  // A cell with a bevel: base color, light top-left edge, dark bottom-right.
  function drawCell(ctx, x, y, color, alpha) {
    const px = x * CELL, py = y * CELL;
    ctx.globalAlpha = alpha == null ? 1 : alpha;
    ctx.fillStyle = color;
    ctx.fillRect(px, py, CELL, CELL);
    ctx.fillStyle = 'rgba(255,255,255,0.28)';
    ctx.fillRect(px, py, CELL, 3);
    ctx.fillRect(px, py, 3, CELL);
    ctx.fillStyle = 'rgba(0,0,0,0.30)';
    ctx.fillRect(px, py + CELL - 3, CELL, 3);
    ctx.fillRect(px + CELL - 3, py, 3, CELL);
    ctx.globalAlpha = 1;
  }

  class Renderer {
    constructor(boardCanvas) {
      this.ctx = setupCanvas(boardCanvas, COLS, ROWS);
    }

    drawBoard(game) {
      const ctx = this.ctx;
      const board = game.board;

      ctx.fillStyle = '#0b1020';
      ctx.fillRect(0, 0, COLS * CELL, ROWS * CELL);

      // grid
      ctx.strokeStyle = 'rgba(255,255,255,0.05)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let x = 1; x < COLS; x++) { ctx.moveTo(x * CELL + 0.5, 0); ctx.lineTo(x * CELL + 0.5, ROWS * CELL); }
      for (let y = 1; y < ROWS; y++) { ctx.moveTo(0, y * CELL + 0.5); ctx.lineTo(COLS * CELL, y * CELL + 0.5); }
      ctx.stroke();

      // settled cells (only the visible rows)
      for (let y = HIDDEN; y < HIDDEN + ROWS; y++) {
        for (let x = 0; x < COLS; x++) {
          const id = board.get(x, y);
          if (id) drawCell(ctx, x, y - HIDDEN, COLORS[id]);
        }
      }

      // clearing rows flash white and fade
      if (game.clearing) {
        const k = 1 - game.clearing.t / CLEAR_ANIM_MS;
        ctx.fillStyle = 'rgba(255,255,255,' + (0.9 * k).toFixed(3) + ')';
        for (const y of game.clearing.rows) {
          if (y >= HIDDEN) ctx.fillRect(0, (y - HIDDEN) * CELL, COLS * CELL, CELL);
        }
      }

      // active piece
      if (game.piece && !game.over) {
        const p = game.piece;
        const def = PIECES[p.type];
        for (const [dx, dy] of def.states[p.rot]) {
          const y = p.y + dy - HIDDEN;
          if (y >= 0) drawCell(ctx, p.x + dx, y, def.color);
        }
      }
    }
  }

  root.Renderer = Renderer;
})(window);

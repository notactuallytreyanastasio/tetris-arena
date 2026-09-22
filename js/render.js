// Canvas renderer. Redraws the whole board every frame from game state.

const CELL = 30;

class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    // Backing store scaled by devicePixelRatio so cell edges are crisp on
    // retina (taken from agent-1). CSS size stays in CSS pixels.
    const dpr = window.devicePixelRatio || 1;
    canvas.width = COLS * CELL * dpr;
    canvas.height = VISIBLE_ROWS * CELL * dpr;
    canvas.style.width = COLS * CELL + 'px';
    canvas.style.height = VISIBLE_ROWS * CELL + 'px';
    this.ctx.scale(dpr, dpr);
    this.w = COLS * CELL;
    this.h = VISIBLE_ROWS * CELL;
  }

  cell(x, y, color) {
    // y is a board row; hidden rows sit above the canvas and are skipped.
    const vy = y - HIDDEN_ROWS;
    if (vy < 0) return;
    const ctx = this.ctx;
    const px = x * CELL;
    const py = vy * CELL;
    ctx.fillStyle = color;
    ctx.fillRect(px, py, CELL, CELL);
    // bevel: light top-left, dark bottom-right
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.fillRect(px, py, CELL, 3);
    ctx.fillRect(px, py, 3, CELL);
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.fillRect(px, py + CELL - 3, CELL, 3);
    ctx.fillRect(px + CELL - 3, py, 3, CELL);
  }

  drawGrid() {
    const ctx = this.ctx;
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.lineWidth = 1;
    for (let x = 1; x < COLS; x++) {
      ctx.beginPath();
      ctx.moveTo(x * CELL + 0.5, 0);
      ctx.lineTo(x * CELL + 0.5, VISIBLE_ROWS * CELL);
      ctx.stroke();
    }
    for (let y = 1; y < VISIBLE_ROWS; y++) {
      ctx.beginPath();
      ctx.moveTo(0, y * CELL + 0.5);
      ctx.lineTo(COLS * CELL, y * CELL + 0.5);
      ctx.stroke();
    }
  }

  drawPiece(active, color) {
    for (const [cx, cy] of active.piece.states[active.rot]) {
      this.cell(active.x + cx, active.y + cy, color);
    }
  }

  draw(game) {
    const ctx = this.ctx;
    ctx.fillStyle = '#0b0e14';
    ctx.fillRect(0, 0, this.w, this.h);
    this.drawGrid();

    const grid = game.board.grid;
    for (let y = HIDDEN_ROWS; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        const v = grid[y][x];
        if (v) this.cell(x, y, COLOR_BY_INDEX[v]);
      }
    }

    if (game.active) this.drawPiece(game.active, game.active.piece.color);

    if (game.over) {
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(0, 0, this.w, this.h);
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 28px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('GAME OVER', this.w / 2, this.h / 2);
    }
  }
}

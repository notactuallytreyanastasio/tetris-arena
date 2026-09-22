// Canvas renderer. Redraws the whole board every frame from game state.
// Next and hold have their own small canvases, redrawn only when they change.

const CELL = 30;
const MINI = 20;        // cell size in the next / hold panels
const SLOT_W = 4;       // preview slot, in cells
const SLOT_H = 3;

// Size a canvas in CSS pixels with a devicePixelRatio-scaled backing store so
// cell edges are crisp on retina (from agent-1).
function fitCanvas(canvas, cssW, cssH) {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(cssW * dpr);
  canvas.height = Math.round(cssH * dpr);
  canvas.style.width = cssW + 'px';
  canvas.style.height = cssH + 'px';
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  return ctx;
}

// Mix a CSS hex colour toward white by t in [0, 1].
function lighten(hex, t) {
  const n = parseInt(hex.slice(1), 16);
  const r = n >> 16, g = (n >> 8) & 255, b = n & 255;
  const mix = (c) => Math.round(c + (255 - c) * t);
  return 'rgb(' + mix(r) + ',' + mix(g) + ',' + mix(b) + ')';
}

function drawCell(ctx, px, py, size, color) {
  ctx.fillStyle = color;
  ctx.fillRect(px, py, size, size);
  // bevel: light top-left, dark bottom-right
  const b = Math.max(2, Math.round(size / 10));
  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  ctx.fillRect(px, py, size, b);
  ctx.fillRect(px, py, b, size);
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.fillRect(px, py + size - b, size, b);
  ctx.fillRect(px + size - b, py, b, size);
}

// Ghost cell: outline only, so it reads over any stack colour (agent-5/6).
function drawGhostCell(ctx, px, py, size, color) {
  ctx.strokeStyle = color;
  ctx.globalAlpha = 0.55;
  ctx.lineWidth = 2;
  ctx.strokeRect(px + 2, py + 2, size - 4, size - 4);
  ctx.globalAlpha = 1;
}

// Draw a piece in rotation 0 centred in a SLOT_W x SLOT_H box at (ox, oy).
function drawMini(ctx, piece, ox, oy, dim) {
  const cells = piece.states[0];
  let minX = 9, maxX = -1, minY = 9, maxY = -1;
  for (const [x, y] of cells) {
    minX = Math.min(minX, x); maxX = Math.max(maxX, x);
    minY = Math.min(minY, y); maxY = Math.max(maxY, y);
  }
  const w = maxX - minX + 1, h = maxY - minY + 1;
  const dx = ox + ((SLOT_W - w) / 2 - minX) * MINI;
  const dy = oy + ((SLOT_H - h) / 2 - minY) * MINI;
  ctx.globalAlpha = dim ? 0.3 : 1;
  for (const [x, y] of cells) drawCell(ctx, dx + x * MINI, dy + y * MINI, MINI, piece.color);
  ctx.globalAlpha = 1;
}

class Renderer {
  constructor(boardCanvas, nextCanvas, holdCanvas) {
    this.w = COLS * CELL;
    this.h = VISIBLE_ROWS * CELL;
    this.ctx = fitCanvas(boardCanvas, this.w, this.h);
    this.nextW = SLOT_W * MINI;
    this.nextH = SLOT_H * MINI * NEXT_COUNT;
    this.nextCtx = fitCanvas(nextCanvas, this.nextW, this.nextH);
    this.holdCtx = fitCanvas(holdCanvas, SLOT_W * MINI, SLOT_H * MINI);
    this.shownNext = '';
    this.shownHold = '';
  }

  cell(x, y, color) {
    // y is a board row; hidden rows sit above the canvas and are skipped.
    const vy = y - HIDDEN_ROWS;
    if (vy < 0) return;
    drawCell(this.ctx, x * CELL, vy * CELL, CELL, color);
  }

  drawGrid() {
    const ctx = this.ctx;
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.lineWidth = 1;
    for (let x = 1; x < COLS; x++) {
      ctx.beginPath();
      ctx.moveTo(x * CELL + 0.5, 0);
      ctx.lineTo(x * CELL + 0.5, this.h);
      ctx.stroke();
    }
    for (let y = 1; y < VISIBLE_ROWS; y++) {
      ctx.beginPath();
      ctx.moveTo(0, y * CELL + 0.5);
      ctx.lineTo(this.w, y * CELL + 0.5);
      ctx.stroke();
    }
  }

  // Fading streak down each column a hard drop passed through (agent-4).
  drawTrail(game) {
    const t = game.trail;
    if (!t) return;
    const ctx = this.ctx;
    const life = t.ms / TRAIL_MS;
    for (const [x, fromY, toY] of t.cols) {
      const y0 = Math.max(fromY - HIDDEN_ROWS, 0);
      const y1 = toY - HIDDEN_ROWS;
      if (y1 <= y0) continue;
      const grad = ctx.createLinearGradient(0, y0 * CELL, 0, y1 * CELL);
      grad.addColorStop(0, 'rgba(255,255,255,0)');
      grad.addColorStop(1, lighten(t.color, 0.4).replace('rgb(', 'rgba(').replace(')', ',' + (0.45 * life) + ')'));
      ctx.fillStyle = grad;
      ctx.fillRect(x * CELL + 5, y0 * CELL, CELL - 10, (y1 - y0) * CELL);
    }
  }

  drawPanels(game) {
    const nextKey = game.queue.slice(0, NEXT_COUNT).map((p) => p.name).join('');
    if (nextKey !== this.shownNext) {
      this.shownNext = nextKey;
      this.nextCtx.clearRect(0, 0, this.nextW, this.nextH);
      game.queue.slice(0, NEXT_COUNT).forEach((p, i) => {
        drawMini(this.nextCtx, p, 0, i * SLOT_H * MINI, false);
      });
    }
    const holdKey = (game.hold ? game.hold.name : '-') + (game.holdUsed ? '!' : '');
    if (holdKey !== this.shownHold) {
      this.shownHold = holdKey;
      this.holdCtx.clearRect(0, 0, SLOT_W * MINI, SLOT_H * MINI);
      if (game.hold) drawMini(this.holdCtx, game.hold, 0, 0, game.holdUsed);
    }
  }

  draw(game) {
    const ctx = this.ctx;
    ctx.fillStyle = '#0b0e14';
    ctx.fillRect(0, 0, this.w, this.h);
    this.drawGrid();

    // settled cells; rows being cleared flash white (agent-2)
    const grid = game.board.grid;
    const flashing = game.clearing ? game.clearing.rows : null;
    for (let y = HIDDEN_ROWS; y < ROWS; y++) {
      const flash = flashing && flashing.includes(y);
      for (let x = 0; x < COLS; x++) {
        const v = grid[y][x];
        if (v) this.cell(x, y, flash ? '#ffffff' : COLOR_BY_INDEX[v]);
      }
    }

    this.drawTrail(game);

    const a = game.active;
    if (a && !game.over) {
      // ghost, then the active piece on top
      const gy = game.ghostY();
      if (gy !== a.y) {
        for (const [cx, cy] of a.piece.states[a.rot]) {
          const vy = gy + cy - HIDDEN_ROWS;
          if (vy >= 0) drawGhostCell(ctx, (a.x + cx) * CELL, vy * CELL, CELL, a.piece.color);
        }
      }
      // While resting on the stack the piece brightens as the lock delay
      // runs out (agent-5), so the lock is never a surprise.
      const t = gy === a.y ? Math.min(a.lockAcc / LOCK_DELAY, 1) : 0;
      const color = t > 0 ? lighten(a.piece.color, t * 0.6) : a.piece.color;
      for (const [cx, cy] of a.piece.states[a.rot]) this.cell(a.x + cx, a.y + cy, color);
    } else if (a && game.over) {
      for (const [cx, cy] of a.piece.states[a.rot]) this.cell(a.x + cx, a.y + cy, a.piece.color);
    }

    this.drawPanels(game);

    if (game.over) this.overlay(game.score > 0 && game.score >= game.best ? 'NEW BEST' : 'GAME OVER', 'R restart  ·  Shift+R replay seed');
    else if (game.paused) this.overlay('PAUSED', 'press P to resume');
  }

  overlay(title, hint) {
    const ctx = this.ctx;
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(0, 0, this.w, this.h);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 28px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(title, this.w / 2, this.h / 2 - 10);
    ctx.font = '16px system-ui, sans-serif';
    ctx.fillStyle = '#c8cdd6';
    ctx.fillText(hint, this.w / 2, this.h / 2 + 20);
  }
}

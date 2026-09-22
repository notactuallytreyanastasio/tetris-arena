// Canvas renderer. Redraws the whole field every frame: 200 cells is
// nothing, and it means ghost pieces, lock flashes and clear animations are
// just more fillRect calls with no state to diff.
(function (root) {
  'use strict';

  const { COLS, ROWS, HIDDEN } = root.BoardModule;
  const { PIECES, COLORS } = root.Pieces;
  const { CLEAR_ANIM_MS, TRAIL_MS, QUEUE_LEN } = root.GameModule;

  const CELL = 30;         // CSS pixels on the field
  const MINI = 18;         // CSS pixels in the next/hold panels
  const SLOT_H = 3;        // rows per preview slot
  const PANEL_COLS = 6;    // 4-wide piece centred in 6 cells

  // Size a canvas to w x h CSS pixels with a devicePixelRatio-scaled
  // backing store so cell edges are crisp on retina screens.
  function setupCanvas(canvas, w, h) {
    const dpr = window.devicePixelRatio || 1;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return ctx;
  }

  // A cell with a bevel: base color, light top-left edge, dark bottom-right.
  function drawCell(ctx, x, y, color, size, alpha) {
    size = size || CELL;
    const px = x * size, py = y * size, b = Math.max(2, Math.round(size / 10));
    ctx.globalAlpha = alpha == null ? 1 : alpha;
    ctx.fillStyle = color;
    ctx.fillRect(px, py, size, size);
    ctx.fillStyle = 'rgba(255,255,255,0.28)';
    ctx.fillRect(px, py, size, b);
    ctx.fillRect(px, py, b, size);
    ctx.fillStyle = 'rgba(0,0,0,0.30)';
    ctx.fillRect(px, py + size - b, size, b);
    ctx.fillRect(px + size - b, py, b, size);
    ctx.globalAlpha = 1;
  }

  // Ghost: outline (taken from agent-5) plus a faint fill so it still reads
  // against the grid when the eye is on the stack.
  function drawGhostCell(ctx, x, y, color) {
    const px = x * CELL, py = y * CELL;
    ctx.globalAlpha = 0.12;
    ctx.fillStyle = color;
    ctx.fillRect(px + 2, py + 2, CELL - 4, CELL - 4);
    ctx.globalAlpha = 0.8;
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.strokeRect(px + 2, py + 2, CELL - 4, CELL - 4);
    ctx.globalAlpha = 1;
  }

  // Mix a hex colour toward white by t in [0, 1].
  function lighten(hex, t) {
    const n = parseInt(hex.slice(1), 16);
    const f = v => Math.round(v + (255 - v) * t);
    return 'rgb(' + f(n >> 16) + ',' + f((n >> 8) & 255) + ',' + f(n & 255) + ')';
  }

  // Draw one piece in its spawn orientation centred in a preview slot.
  function drawMini(ctx, type, slot, dim) {
    const def = PIECES[type];
    const cells = def.states[0];
    const w = Math.max(...cells.map(c => c[0])) + 1;
    const h = Math.max(...cells.map(c => c[1])) + 1;
    const minX = Math.min(...cells.map(c => c[0]));
    const minY = Math.min(...cells.map(c => c[1]));
    const ox = (PANEL_COLS - (w - minX)) / 2 - minX;
    const oy = slot * SLOT_H + (SLOT_H - (h - minY)) / 2 - minY;
    for (const [dx, dy] of cells) drawCell(ctx, ox + dx, oy + dy, def.color, MINI, dim ? 0.3 : 1);
  }

  class Renderer {
    constructor(els) {
      this.ctx = setupCanvas(els.board, COLS * CELL, ROWS * CELL);
      this.nextCtx = setupCanvas(els.next, PANEL_COLS * MINI, QUEUE_LEN * SLOT_H * MINI);
      this.holdCtx = setupCanvas(els.hold, PANEL_COLS * MINI, SLOT_H * MINI);
      this.els = els;
      // Last values written to the DOM; textContent only changes when a
      // value does (taken from agent-3).
      this.shown = { score: -1, level: -1, lines: -1, best: -1, seed: -1, toast: '', overlay: '' };
    }

    draw(game, bestScore) {
      this.drawBoard(game);
      this.drawPanels(game);
      this.drawHud(game, bestScore || 0);
    }

    drawPanels(game) {
      const n = this.nextCtx, h = this.holdCtx;
      n.fillStyle = '#0f1629';
      n.fillRect(0, 0, PANEL_COLS * MINI, QUEUE_LEN * SLOT_H * MINI);
      for (let i = 0; i < QUEUE_LEN && i < game.queue.length; i++) drawMini(n, game.queue[i], i, false);
      h.fillStyle = '#0f1629';
      h.fillRect(0, 0, PANEL_COLS * MINI, SLOT_H * MINI);
      if (game.hold) drawMini(h, game.hold, 0, game.holdUsed);
    }

    drawHud(game, bestScore) {
      const els = this.els, shown = this.shown;
      if (shown.score !== game.score) els.score.textContent = shown.score = game.score;
      if (shown.best !== bestScore) els.best.textContent = shown.best = bestScore;
      if (shown.seed !== game.seed) els.seed.textContent = shown.seed = game.seed;
      if (shown.level !== game.level) els.level.textContent = shown.level = game.level;
      if (shown.lines !== game.lines) els.lines.textContent = shown.lines = game.lines;

      const toast = game.toast ? game.toast.text : '';
      if (shown.toast !== toast) {
        shown.toast = toast;
        if (toast) els.toast.textContent = toast;
        els.toast.classList.toggle('show', !!toast);
      }

      const overlay = game.over ? 'over' : game.paused ? 'paused' : '';
      if (shown.overlay !== overlay) {
        shown.overlay = overlay;
        els.overlay.classList.toggle('hidden', !overlay);
        if (overlay === 'over') {
          els.overlayTitle.textContent = 'Game over';
          els.overlayHint.textContent = 'R for a new game, Shift+R to replay this seed';
        } else if (overlay === 'paused') {
          els.overlayTitle.textContent = 'Paused';
          els.overlayHint.textContent = 'press P to resume';
        }
      }
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

      // hard-drop trail: a fading streak down each column the piece fell
      // through (taken from agent-4)
      if (game.trail) {
        const life = 1 - game.trail.t / TRAIL_MS;
        for (const [x, fromY, toY] of game.trail.cols) {
          const y0 = Math.max(fromY - HIDDEN, 0), y1 = toY - HIDDEN;
          if (y1 <= y0) continue;
          const grad = ctx.createLinearGradient(0, y0 * CELL, 0, y1 * CELL);
          grad.addColorStop(0, 'rgba(255,255,255,0)');
          grad.addColorStop(1, 'rgba(255,255,255,' + (0.35 * life).toFixed(3) + ')');
          ctx.fillStyle = grad;
          ctx.fillRect(x * CELL + 4, y0 * CELL, CELL - 8, (y1 - y0) * CELL);
        }
      }

      // ghost, then the active piece. While the piece rests on the stack it
      // brightens as the lock delay runs out (taken from agent-5), so the
      // lock is never a surprise.
      if (game.piece && !game.over) {
        const p = game.piece;
        const def = PIECES[p.type];
        const cells = def.states[p.rot];
        const gy = game.ghostY();
        if (gy !== p.y) {
          for (const [dx, dy] of cells) {
            const y = gy + dy - HIDDEN;
            if (y >= 0) drawGhostCell(ctx, p.x + dx, y, def.color);
          }
        }
        const t = game.lockProgress();
        const color = t > 0 ? lighten(def.color, t * 0.6) : def.color;
        for (const [dx, dy] of cells) {
          const y = p.y + dy - HIDDEN;
          if (y >= 0) drawCell(ctx, p.x + dx, y, color);
        }
      }
    }
  }

  root.Renderer = Renderer;
})(window);

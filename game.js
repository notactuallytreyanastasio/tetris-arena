// Tetris — agent-10
//
// One closure, four parts: piece data, board, game state + loop, draw.
// Coordinates are screen-space: x right, y DOWN. SRS tables are published
// with y up, so every kick's y is negated when the table is built.

(() => {
  'use strict';

  // ---------------------------------------------------------------- pieces

  const COLS = 10;
  const HIDDEN = 2;              // buffer rows above the visible field
  const VISIBLE = 20;
  const ROWS = VISIBLE + HIDDEN; // 22
  const CELL = 30;               // css px per cell; canvas is scaled by DPR

  // Spawn orientation, drawn in a box. Other orientations are derived by
  // rotating the box clockwise, which is exactly what SRS specifies for the
  // 3x3 pieces and the 4x4 I. O is the exception: it never moves.
  const SHAPES = {
    I: ['....', 'IIII', '....', '....'],
    O: ['.OO.', '.OO.', '....', '....'],
    T: ['.T.', 'TTT', '...'],
    S: ['.SS', 'SS.', '...'],
    Z: ['ZZ.', '.ZZ', '...'],
    J: ['J..', 'JJJ', '...'],
    L: ['..L', 'LLL', '...'],
  };
  const NAMES = Object.keys(SHAPES); // I O T S Z J L -> ids 1..7
  const COLORS = {
    I: '#4fd8ff', O: '#ffd23f', T: '#c77dff', S: '#5ce27a',
    Z: '#ff5c6c', J: '#5c8bff', L: '#ffa64f',
  };

  // PIECES[id] = { name, size, cells: [orientation][ [x,y], ... ] }
  const PIECES = [null];
  for (const name of NAMES) {
    const rows = SHAPES[name];
    const n = rows.length;
    const spawn = [];
    rows.forEach((row, y) => [...row].forEach((ch, x) => { if (ch !== '.') spawn.push([x, y]); }));
    const cells = [spawn];
    for (let r = 1; r < 4; r++) {
      // clockwise in a box of side n: (x, y) -> (n - 1 - y, x)
      cells.push(name === 'O' ? spawn : cells[r - 1].map(([x, y]) => [n - 1 - y, x]));
    }
    PIECES.push({ name, size: n, cells, color: COLORS[name] });
  }

  // ---------------------------------------------------------------- board

  const board = new Uint8Array(COLS * ROWS); // 0 empty, 1..7 piece id

  function collides(id, rot, px, py) {
    const cells = PIECES[id].cells[rot];
    for (let i = 0; i < 4; i++) {
      const x = px + cells[i][0];
      const y = py + cells[i][1];
      if (x < 0 || x >= COLS || y >= ROWS) return true;
      if (y >= 0 && board[y * COLS + x]) return true;
    }
    return false;
  }

  function lock(p) {
    const cells = PIECES[p.id].cells[p.rot];
    for (let i = 0; i < 4; i++) {
      const x = p.x + cells[i][0];
      const y = p.y + cells[i][1];
      if (y >= 0) board[y * COLS + x] = p.id;
    }
  }

  // ---------------------------------------------------------------- state

  const state = {
    piece: null,        // { id, rot, x, y }
    gravityMs: 800,
    gravityAcc: 0,
    over: false,
  };

  function spawn() {
    const id = 1 + Math.floor(Math.random() * 7);
    const size = PIECES[id].size;
    const p = { id, rot: 0, x: Math.floor((COLS - size) / 2), y: HIDDEN - 1 };
    if (collides(id, 0, p.x, p.y)) p.y -= 1;          // guideline: try one row up
    if (collides(id, 0, p.x, p.y)) { state.over = true; return null; }
    return p;
  }

  function stepGravity() {
    const p = state.piece;
    if (!collides(p.id, p.rot, p.x, p.y + 1)) {
      p.y += 1;
    } else {
      lock(p);
      state.piece = spawn();
    }
  }

  // ---------------------------------------------------------------- loop

  let last = 0;
  function frame(now) {
    const dt = Math.min(now - last, 100); // a backgrounded tab must not fast-forward
    last = now;
    if (!state.over) {
      state.gravityAcc += dt;
      while (state.gravityAcc >= state.gravityMs && !state.over) {
        state.gravityAcc -= state.gravityMs;
        stepGravity();
      }
    }
    draw();
    requestAnimationFrame(frame);
  }

  // ---------------------------------------------------------------- draw

  const canvas = document.getElementById('board');
  const ctx = canvas.getContext('2d');
  const DPR = window.devicePixelRatio || 1;
  canvas.width = COLS * CELL * DPR;
  canvas.height = VISIBLE * CELL * DPR;
  canvas.style.width = COLS * CELL + 'px';
  canvas.style.height = VISIBLE * CELL + 'px';
  ctx.scale(DPR, DPR);

  function drawCell(x, y, color) {
    // y is a board row; rows above HIDDEN are off-canvas and skipped
    const vy = y - HIDDEN;
    if (vy < 0) return;
    const px = x * CELL, py = vy * CELL;
    ctx.fillStyle = color;
    ctx.fillRect(px, py, CELL, CELL);
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.fillRect(px, py, CELL, 3);
    ctx.fillRect(px, py, 3, CELL);
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(px, py + CELL - 3, CELL, 3);
    ctx.fillRect(px + CELL - 3, py, 3, CELL);
  }

  function draw() {
    ctx.fillStyle = '#171923';
    ctx.fillRect(0, 0, COLS * CELL, VISIBLE * CELL);

    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    ctx.lineWidth = 1;
    for (let x = 1; x < COLS; x++) {
      ctx.beginPath(); ctx.moveTo(x * CELL + 0.5, 0); ctx.lineTo(x * CELL + 0.5, VISIBLE * CELL); ctx.stroke();
    }
    for (let y = 1; y < VISIBLE; y++) {
      ctx.beginPath(); ctx.moveTo(0, y * CELL + 0.5); ctx.lineTo(COLS * CELL, y * CELL + 0.5); ctx.stroke();
    }

    for (let y = HIDDEN; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        const id = board[y * COLS + x];
        if (id) drawCell(x, y, PIECES[id].color);
      }
    }

    const p = state.piece;
    if (p) {
      const cells = PIECES[p.id].cells[p.rot];
      for (let i = 0; i < 4; i++) drawCell(p.x + cells[i][0], p.y + cells[i][1], PIECES[p.id].color);
    }
  }

  // ---------------------------------------------------------------- go

  state.piece = spawn();
  requestAnimationFrame((t) => { last = t; frame(t); });

  // Debug handle for headless harnesses and the devtools console.
  window.__tetris = { PIECES, board, state, collides, lock, spawn, stepGravity, frame, COLS, ROWS, HIDDEN };
})();

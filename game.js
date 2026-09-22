// Tetris — agent-10
//
// One closure, four parts: piece data, board, game state + loop, draw.
// Coordinates are screen-space: x right, y DOWN. SRS tables are published
// with y up, so every kick's y is negated when the table is built.

(() => {
  'use strict';

  // ---------------------------------------------------------------- pieces

  const COLS = 10;
  const HIDDEN = 4;              // buffer rows above the visible field; SRS kicks lift up to 2
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

  // SRS kick tables, published with y UP. Index is `${from}${to}` in
  // rotation states 0,1,2,3 (spawn, R, 2, L). Built into KICKS with y
  // negated so they can be added straight to screen coordinates.
  const KICKS_JLSTZ = {
    '01': [[0,0],[-1,0],[-1,1],[0,-2],[-1,-2]],
    '10': [[0,0],[1,0],[1,-1],[0,2],[1,2]],
    '12': [[0,0],[1,0],[1,-1],[0,2],[1,2]],
    '21': [[0,0],[-1,0],[-1,1],[0,-2],[-1,-2]],
    '23': [[0,0],[1,0],[1,1],[0,-2],[1,-2]],
    '32': [[0,0],[-1,0],[-1,-1],[0,2],[-1,2]],
    '30': [[0,0],[-1,0],[-1,-1],[0,2],[-1,2]],
    '03': [[0,0],[1,0],[1,1],[0,-2],[1,-2]],
  };
  const KICKS_I = {
    '01': [[0,0],[-2,0],[1,0],[-2,-1],[1,2]],
    '10': [[0,0],[2,0],[-1,0],[2,1],[-1,-2]],
    '12': [[0,0],[-1,0],[2,0],[-1,2],[2,-1]],
    '21': [[0,0],[1,0],[-2,0],[1,-2],[-2,1]],
    '23': [[0,0],[2,0],[-1,0],[2,1],[-1,-2]],
    '32': [[0,0],[-2,0],[1,0],[-2,-1],[1,2]],
    '30': [[0,0],[1,0],[-2,0],[1,-2],[-2,1]],
    '03': [[0,0],[-1,0],[2,0],[-1,2],[2,-1]],
  };
  const flipY = (t) => Object.fromEntries(Object.entries(t).map(([k, v]) => [k, v.map(([x, y]) => [x, -y])]));
  const KICKS = { I: flipY(KICKS_I), O: { }, default: flipY(KICKS_JLSTZ) };
  for (const k of Object.keys(KICKS_JLSTZ)) KICKS.O[k] = [[0, 0]];
  function kicksFor(id, from, to) {
    const name = PIECES[id].name;
    return (KICKS[name] || KICKS.default)[`${from}${to}`];
  }

  // ---------------------------------------------------------------- board

  const board = new Uint8Array(COLS * ROWS); // 0 empty, 1..7 piece id

  function collides(id, rot, px, py) {
    const cells = PIECES[id].cells[rot];
    for (let i = 0; i < 4; i++) {
      const x = px + cells[i][0];
      const y = py + cells[i][1];
      if (x < 0 || x >= COLS || y < 0 || y >= ROWS) return true;
      if (board[y * COLS + x]) return true;
    }
    return false;
  }

  // Stamp the piece. Returns true if every cell landed in the hidden rows,
  // which is a lock-out: the player never saw it settle, the game is over.
  function lock(p) {
    const cells = PIECES[p.id].cells[p.rot];
    let visible = false;
    for (let i = 0; i < 4; i++) {
      const x = p.x + cells[i][0];
      const y = p.y + cells[i][1];
      board[y * COLS + x] = p.id;
      if (y >= HIDDEN) visible = true;
    }
    return !visible;
  }

  function fullRows() {
    const rows = [];
    for (let y = 0; y < ROWS; y++) {
      let full = true;
      for (let x = 0; x < COLS; x++) if (!board[y * COLS + x]) { full = false; break; }
      if (full) rows.push(y);
    }
    return rows;
  }

  // rows ascending (top first): removing a row only shifts rows above it,
  // so the remaining indices stay valid. copyWithin, no allocation.
  function removeRows(rows) {
    for (const y of rows) {
      board.copyWithin(COLS, 0, y * COLS);
      board.fill(0, 0, COLS);
    }
  }

  function clearLines() {
    const rows = fullRows();
    removeRows(rows);
    return rows.length;
  }

  // Is this cell solid for T-spin corner purposes: wall, floor, or block.
  function solid(x, y) {
    return x < 0 || x >= COLS || y < 0 || y >= ROWS || board[y * COLS + x] !== 0;
  }

  // Guideline gravity: seconds per row at a level, capped at level 20.
  function gravityMs(level) {
    const l = Math.min(level, 20) - 1;
    return Math.pow(0.8 - l * 0.007, l) * 1000;
  }

  // 7-bag: deal all seven in random order, then refill.
  function refillQueue() {
    while (state.queue.length < PREVIEW + 1) state.queue.push(nextFromBag());
  }

  function nextFromBag() {
    if (state.bag.length === 0) {
      state.bag = [1, 2, 3, 4, 5, 6, 7];
      for (let i = 6; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [state.bag[i], state.bag[j]] = [state.bag[j], state.bag[i]];
      }
    }
    return state.bag.pop();
  }

  // ---------------------------------------------------------------- state

  const DAS = 170;         // ms before horizontal auto-repeat starts
  const ARR = 40;          // ms between auto-repeat moves
  const LOCK_DELAY = 500;  // ms a grounded piece waits before locking
  const LOCK_RESETS = 15;  // moves/rotates that may reset the delay per row reached
  const SOFT_DROP = 20;    // soft drop is gravity times this

  const LINE_SCORE = [0, 100, 300, 500, 800];
  const TSPIN_SCORE = [400, 800, 1200, 1600];
  const MINI_SCORE = [100, 200, 400];
  const PREVIEW = 5;
  const CLEAR_FLASH = 120; // ms full rows stay on screen before collapsing

  const state = {
    piece: null,        // { id, rot, x, y, lowest, resets, spun, kick }
    bag: [],
    queue: [],          // upcoming piece ids, front first
    hold: 0,            // held piece id, 0 = none
    holdUsed: false,    // one hold per piece
    clearing: null,     // { rows, acc } while full rows flash; no piece exists
    gravityMs: 1000,
    gravityAcc: 0,
    lockAcc: 0,
    over: false,
    score: 0,
    lines: 0,
    level: 1,
    b2b: false,         // last clear was a tetris
    // input
    hDir: 0,            // -1, 0, 1: direction currently auto-repeating
    dasAcc: 0,
    dasCharged: false,
    soft: false,
  };

  function spawn(forcedId) {
    refillQueue();
    const id = forcedId || state.queue.shift();
    refillQueue();
    const size = PIECES[id].size;
    const p = { id, rot: 0, x: Math.floor((COLS - size) / 2), y: HIDDEN - 1, lowest: HIDDEN - 1, resets: 0, spun: false, kick: 0 };
    if (collides(id, 0, p.x, p.y)) p.y -= 1;          // guideline: try one row up
    if (collides(id, 0, p.x, p.y)) { gameOver(); return p; } // block-out; keep it for drawing
    state.lockAcc = 0;
    state.gravityAcc = 0;
    state.holdUsed = false;
    return p;
  }

  function holdPiece() {
    const p = state.piece;
    if (!p || state.holdUsed) return;
    const prev = state.hold;
    state.hold = p.id;
    state.piece = spawn(prev || undefined);
    state.holdUsed = true; // spawn() cleared it; re-arm until this piece locks
  }

  function gameOver() {
    state.over = true;
    showOverlay('Game over', 'R to restart');
  }

  function reset() {
    board.fill(0);
    state.bag = []; state.queue = []; state.hold = 0; state.holdUsed = false; state.clearing = null;
    state.score = 0; state.lines = 0; state.level = 1; state.b2b = false;
    state.gravityMs = gravityMs(1);
    state.gravityAcc = 0; state.lockAcc = 0;
    state.over = false;
    state.hDir = 0; state.soft = false; held.clear();
    hideOverlay();
    state.piece = spawn();
    updateHud();
  }

  function addScore(n) { state.score += n; }

  function grounded(p) {
    return collides(p.id, p.rot, p.x, p.y + 1);
  }

  // A successful move or rotate while on the ground resets the lock timer,
  // but only LOCK_RESETS times per lowest row reached, so a piece cannot be
  // spun on the floor forever.
  function touched(p) {
    if (p.y > p.lowest) { p.lowest = p.y; p.resets = 0; state.lockAcc = 0; }
    else if (grounded(p) && p.resets < LOCK_RESETS) { p.resets++; state.lockAcc = 0; }
  }

  function tryMove(dx, dy) {
    const p = state.piece;
    if (!p || collides(p.id, p.rot, p.x + dx, p.y + dy)) return false;
    p.x += dx; p.y += dy;
    p.spun = false;
    touched(p);
    return true;
  }

  function tryRotate(dir) {
    const p = state.piece;
    if (!p) return false;
    const to = (p.rot + dir + 4) % 4;
    const kicks = kicksFor(p.id, p.rot, to);
    for (let i = 0; i < kicks.length; i++) {
      const nx = p.x + kicks[i][0], ny = p.y + kicks[i][1];
      if (!collides(p.id, to, nx, ny)) {
        p.rot = to; p.x = nx; p.y = ny;
        p.spun = true; p.kick = i;
        touched(p);
        return true;
      }
    }
    return false;
  }

  // Guideline 3-corner rule. Only a T whose last maneuver was a rotation
  // counts. Full if both corners on the side the T points to are solid, or
  // the piece arrived by the 5th kick; otherwise mini.
  function tspinKind(p) {
    if (PIECES[p.id].name !== 'T' || !p.spun) return null;
    const cx = p.x + 1, cy = p.y + 1; // centre of the 3x3 box
    const tl = solid(cx - 1, cy - 1), tr = solid(cx + 1, cy - 1);
    const bl = solid(cx - 1, cy + 1), br = solid(cx + 1, cy + 1);
    if (tl + tr + bl + br < 3) return null;
    const front = [[tl, tr], [tr, br], [bl, br], [tl, bl]][p.rot];
    return (front[0] && front[1]) || p.kick === 4 ? 'full' : 'mini';
  }

  function award(n, spin) {
    let pts;
    if (spin === 'full') pts = TSPIN_SCORE[n];
    else if (spin === 'mini') pts = MINI_SCORE[Math.min(n, 2)];
    else pts = LINE_SCORE[n];
    pts *= state.level;
    if (n > 0) {
      const hard = n === 4 || spin !== null;
      if (hard && state.b2b) pts = Math.floor(pts * 1.5);
      state.b2b = hard;
      state.lines += n;
      const level = 1 + Math.floor(state.lines / 10);
      if (level !== state.level) { state.level = level; state.gravityMs = gravityMs(level); }
    }
    addScore(pts);
  }

  function lockPiece() {
    const p = state.piece;
    const spin = tspinKind(p);
    const lockedOut = lock(p);
    if (lockedOut) { gameOver(); return; }
    const rows = fullRows();
    award(rows.length, spin);
    if (rows.length) {
      state.piece = null;
      state.clearing = { rows, acc: 0 };
    } else {
      state.piece = spawn();
    }
    updateHud();
  }

  function finishClear() {
    removeRows(state.clearing.rows);
    state.clearing = null;
    state.piece = spawn();
  }

  // Lowest y the piece can occupy from where it is: the ghost, and hard drop.
  function dropY(p) {
    let y = p.y;
    while (!collides(p.id, p.rot, p.x, y + 1)) y++;
    return y;
  }

  function hardDrop() {
    const p = state.piece;
    if (!p) return;
    const y = dropY(p);
    addScore((y - p.y) * 2);
    if (y !== p.y) { p.y = y; p.spun = false; }
    lockPiece();
  }

  function stepGravity() {
    const p = state.piece;
    if (!collides(p.id, p.rot, p.x, p.y + 1)) {
      p.y += 1;
      p.spun = false;
      if (state.soft) addScore(1);
      if (p.y > p.lowest) { p.lowest = p.y; p.resets = 0; state.lockAcc = 0; }
    }
    // if grounded, the lock timer in update() handles locking
  }

  function update(dt) {
    if (state.over) return;
    if (state.clearing) {
      state.clearing.acc += dt;
      if (state.clearing.acc >= CLEAR_FLASH) finishClear();
      return;
    }
    if (!state.piece) return;

    // horizontal auto-repeat: first move on press, then DAS, then ARR
    if (state.hDir) {
      state.dasAcc += dt;
      if (!state.dasCharged) {
        if (state.dasAcc >= DAS) { state.dasCharged = true; state.dasAcc -= DAS; tryMove(state.hDir, 0); }
      }
      if (state.dasCharged) {
        while (state.dasAcc >= ARR) { state.dasAcc -= ARR; if (!tryMove(state.hDir, 0)) { state.dasAcc = 0; break; } }
      }
    }

    // gravity
    const interval = state.soft ? state.gravityMs / SOFT_DROP : state.gravityMs;
    state.gravityAcc += dt;
    while (state.gravityAcc >= interval && state.piece && !state.over) {
      state.gravityAcc -= interval;
      stepGravity();
    }

    // lock delay
    const p = state.piece;
    if (p && grounded(p)) {
      state.lockAcc += dt;
      if (state.lockAcc >= LOCK_DELAY) lockPiece();
    } else {
      state.lockAcc = 0;
    }
  }

  // ---------------------------------------------------------------- input

  const held = new Set();

  function press(dir) {
    state.hDir = dir;
    state.dasAcc = 0;
    state.dasCharged = false;
    tryMove(dir, 0);
  }

  function onKeyDown(e) {
    if (e.repeat) return; // we do our own repeat
    if (e.code === 'KeyR') { reset(); e.preventDefault(); return; }
    if (state.over) return;
    switch (e.code) {
      case 'ArrowLeft':  held.add(e.code); press(-1); break;
      case 'ArrowRight': held.add(e.code); press(1); break;
      case 'ArrowDown':  state.soft = true; state.gravityAcc = state.gravityMs / SOFT_DROP; break;
      case 'ArrowUp': case 'KeyX': tryRotate(1); break;
      case 'KeyZ': case 'ControlLeft': tryRotate(-1); break;
      case 'Space': hardDrop(); break;
      case 'KeyC': case 'ShiftLeft': case 'ShiftRight': holdPiece(); break;
      default: return;
    }
    e.preventDefault();
  }

  function onKeyUp(e) {
    switch (e.code) {
      case 'ArrowLeft': case 'ArrowRight': {
        held.delete(e.code);
        // release: if the other direction is still held, resume that one
        if (held.has('ArrowLeft')) press(-1);
        else if (held.has('ArrowRight')) press(1);
        else state.hDir = 0;
        break;
      }
      case 'ArrowDown': state.soft = false; break;
      default: return;
    }
    e.preventDefault();
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', () => { held.clear(); state.hDir = 0; state.soft = false; });

  // ---------------------------------------------------------------- loop

  let last = 0;
  function frame(now) {
    const dt = Math.min(now - last, 100); // a backgrounded tab must not fast-forward
    last = now;
    update(dt);
    updateHud();
    draw();
    requestAnimationFrame(frame);
  }

  // ---------------------------------------------------------------- hud

  const hud = {
    score: document.getElementById('score'),
    level: document.getElementById('level'),
    lines: document.getElementById('lines'),
  };
  const shown = { score: -1, level: -1, lines: -1 };
  function updateHud() {
    for (const k of Object.keys(hud)) {
      if (shown[k] !== state[k]) { shown[k] = state[k]; hud[k].textContent = String(state[k]); }
    }
  }

  const overlay = document.getElementById('overlay');
  const overlayTitle = document.getElementById('overlay-title');
  const overlaySub = document.getElementById('overlay-sub');
  function showOverlay(title, sub) {
    overlayTitle.textContent = title;
    overlaySub.textContent = sub;
    overlay.classList.remove('hidden');
  }
  function hideOverlay() { overlay.classList.add('hidden'); }

  // ---------------------------------------------------------------- draw

  const DPR = window.devicePixelRatio || 1;
  // Size a canvas in CSS pixels, back it at DPR, and remember the CSS size
  // on the context so draw code never touches el.width again.
  function fitCanvas(el, w, h) {
    el.width = w * DPR; el.height = h * DPR;
    el.style.width = w + 'px'; el.style.height = h + 'px';
    const c = el.getContext('2d');
    c.scale(DPR, DPR);
    c.cssW = w; c.cssH = h;
    return c;
  }
  const canvas = document.getElementById('board');
  const ctx = fitCanvas(canvas, COLS * CELL, VISIBLE * CELL);
  const PCELL = 20; // preview cell size
  const nextCanvas = document.getElementById('next');
  const nextCtx = fitCanvas(nextCanvas, 4 * PCELL + 20, PREVIEW * 3 * PCELL + 20);
  const holdCanvas = document.getElementById('hold');
  const holdCtx = fitCanvas(holdCanvas, 4 * PCELL + 20, 3 * PCELL + 20);

  // A bevelled block at pixel (px, py) on context c with cell size n.
  function block(c, px, py, n, color) {
    c.fillStyle = color;
    c.fillRect(px, py, n, n);
    const b = Math.max(2, Math.round(n / 10));
    c.fillStyle = 'rgba(255,255,255,0.18)';
    c.fillRect(px, py, n, b);
    c.fillRect(px, py, b, n);
    c.fillStyle = 'rgba(0,0,0,0.25)';
    c.fillRect(px, py + n - b, n, b);
    c.fillRect(px + n - b, py, b, n);
  }

  function drawCell(x, y, color) {
    // y is a board row; rows above HIDDEN are off-canvas and skipped
    const vy = y - HIDDEN;
    if (vy < 0) return;
    block(ctx, x * CELL, vy * CELL, CELL, color);
  }

  function drawGhost(p, gy) {
    if (gy === p.y) return;
    const cells = PIECES[p.id].cells[p.rot];
    ctx.strokeStyle = PIECES[p.id].color;
    ctx.globalAlpha = 0.35;
    ctx.lineWidth = 2;
    for (let i = 0; i < 4; i++) {
      const vy = gy + cells[i][1] - HIDDEN;
      if (vy < 0) continue;
      ctx.strokeRect((p.x + cells[i][0]) * CELL + 1.5, vy * CELL + 1.5, CELL - 3, CELL - 3);
    }
    ctx.globalAlpha = 1;
  }

  // Draw a piece in its spawn orientation centred in a w x h box on c.
  function drawMini(c, id, x0, y0, w, h) {
    const piece = PIECES[id];
    const cells = piece.cells[0];
    let minX = 9, maxX = -9, minY = 9, maxY = -9;
    for (const [cx, cy] of cells) { minX = Math.min(minX, cx); maxX = Math.max(maxX, cx); minY = Math.min(minY, cy); maxY = Math.max(maxY, cy); }
    const pw = (maxX - minX + 1) * PCELL, ph = (maxY - minY + 1) * PCELL;
    const ox = x0 + (w - pw) / 2 - minX * PCELL, oy = y0 + (h - ph) / 2 - minY * PCELL;
    for (const [cx, cy] of cells) block(c, ox + cx * PCELL, oy + cy * PCELL, PCELL, piece.color);
  }

  function drawPanels() {
    nextCtx.fillStyle = '#171923';
    nextCtx.fillRect(0, 0, nextCtx.cssW, nextCtx.cssH);
    for (let i = 0; i < PREVIEW && i < state.queue.length; i++) {
      drawMini(nextCtx, state.queue[i], 10, 10 + i * 3 * PCELL, 4 * PCELL, 3 * PCELL);
    }
    holdCtx.fillStyle = '#171923';
    holdCtx.fillRect(0, 0, holdCtx.cssW, holdCtx.cssH);
    if (state.hold) {
      holdCtx.globalAlpha = state.holdUsed ? 0.4 : 1;
      drawMini(holdCtx, state.hold, 10, 10, 4 * PCELL, 3 * PCELL);
      holdCtx.globalAlpha = 1;
    }
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

    const flashing = state.clearing ? state.clearing.rows : null;
    for (let y = HIDDEN; y < ROWS; y++) {
      const flash = flashing && flashing.includes(y);
      for (let x = 0; x < COLS; x++) {
        const id = board[y * COLS + x];
        if (id) drawCell(x, y, flash ? '#ffffff' : PIECES[id].color);
      }
    }

    const p = state.piece;
    if (p) {
      drawGhost(p, dropY(p));
      const cells = PIECES[p.id].cells[p.rot];
      for (let i = 0; i < 4; i++) drawCell(p.x + cells[i][0], p.y + cells[i][1], PIECES[p.id].color);
    }

    drawPanels();
  }

  // ---------------------------------------------------------------- go

  reset();
  requestAnimationFrame((t) => { last = t; frame(t); });

  // Debug handle for headless harnesses and the devtools console.
  window.__tetris = { PIECES, KICKS, board, state, collides, lock, clearLines, fullRows, removeRows, gravityMs, spawn, reset, stepGravity, tryMove, tryRotate, hardDrop, holdPiece, tspinKind, dropY, finishClear, update, frame, COLS, ROWS, HIDDEN, CLEAR_FLASH };
})();

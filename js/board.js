// The playfield. board.grid[y][x] is 0 for empty or a piece index (1..7).
// y = 0 is the top HIDDEN row; the first visible row is y = HIDDEN_ROWS.

const COLS = 10;
const VISIBLE_ROWS = 20;
// 4, not 2: SRS kicks can lift a piece two rows, and with only 2 hidden rows
// a rotation at the ceiling gets refused by the bounds check alone
// (agent-3, via agent-9's observation).
const HIDDEN_ROWS = 4;
const ROWS = VISIBLE_ROWS + HIDDEN_ROWS;

class Board {
  constructor() {
    this.reset();
  }

  reset() {
    this.grid = [];
    for (let y = 0; y < ROWS; y++) this.grid.push(new Array(COLS).fill(0));
  }

  inside(x, y) {
    return x >= 0 && x < COLS && y >= 0 && y < ROWS;
  }

  // True if every cell of `piece` in rotation `rot` at (px, py) is inside the
  // board and empty. Anything above the top row is treated as blocked so a
  // kick can never push a piece off the top.
  fits(piece, rot, px, py) {
    const cells = piece.states[rot];
    for (let i = 0; i < cells.length; i++) {
      const x = px + cells[i][0];
      const y = py + cells[i][1];
      if (!this.inside(x, y)) return false;
      if (this.grid[y][x] !== 0) return false;
    }
    return true;
  }

  // Write the piece into the grid. Returns true if any cell landed in the
  // visible area; false means the piece locked entirely above the skyline,
  // which is a game over (lock out).
  merge(piece, rot, px, py) {
    let visible = false;
    for (const [cx, cy] of piece.states[rot]) {
      const y = py + cy;
      this.grid[y][px + cx] = piece.index;
      if (y >= HIDDEN_ROWS) visible = true;
    }
    return visible;
  }

  isEmpty() {
    return this.grid.every((row) => row.every((v) => v === 0));
  }

  // For the T-spin corner rule: walls and the floor count as filled, the
  // space above the ceiling does not.
  solidOrWall(x, y) {
    if (x < 0 || x >= COLS || y >= ROWS) return true;
    if (y < 0) return false;
    return this.grid[y][x] !== 0;
  }

  // Indices of full rows, top to bottom.
  fullRows() {
    const rows = [];
    for (let y = 0; y < ROWS; y++) {
      if (this.grid[y].every((v) => v !== 0)) rows.push(y);
    }
    return rows;
  }

  // Remove the given rows and drop everything above them down.
  clearRows(rows) {
    if (rows.length === 0) return;
    const keep = this.grid.filter((_, y) => !rows.includes(y));
    while (keep.length < ROWS) keep.unshift(new Array(COLS).fill(0));
    this.grid = keep;
  }
}

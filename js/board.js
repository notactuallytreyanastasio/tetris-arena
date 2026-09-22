// The board is an array of rows; grid[row][col] is 0 for empty or a piece id.
// Rows 0..HIDDEN-1 are above the visible playfield: pieces spawn there and a
// piece that cannot spawn without overlap means the game is over.

const COLS = 10;
const VISIBLE_ROWS = 20;
const HIDDEN = 2;
const ROWS = VISIBLE_ROWS + HIDDEN;

function emptyRow() { return new Array(COLS).fill(0); }

function createGrid() {
  const g = [];
  for (let r = 0; r < ROWS; r++) g.push(emptyRow());
  return g;
}

// True if `shape` placed with its top-left at (x, y) overlaps a wall, the
// floor, or a settled cell. Cells above row 0 are allowed (needed for kicks
// that push a piece upward out of the buffer).
function collides(grid, shape, x, y) {
  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r].length; c++) {
      if (!shape[r][c]) continue;
      const gx = x + c, gy = y + r;
      if (gx < 0 || gx >= COLS || gy >= ROWS) return true;
      if (gy >= 0 && grid[gy][gx]) return true;
    }
  }
  return false;
}

function merge(grid, shape, x, y, id) {
  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r].length; c++) {
      if (shape[r][c] && y + r >= 0) grid[y + r][x + c] = id;
    }
  }
}

function fullRows(grid) {
  const rows = [];
  for (let r = 0; r < ROWS; r++) if (grid[r].every(v => v !== 0)) rows.push(r);
  return rows;
}

// Remove the given rows and push fresh empty rows in at the top.
function removeRows(grid, rows) {
  const keep = grid.filter((_, r) => !rows.includes(r));
  while (keep.length < ROWS) keep.unshift(emptyRow());
  for (let r = 0; r < ROWS; r++) grid[r] = keep[r];
}

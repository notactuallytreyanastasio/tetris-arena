// The board is an array of rows; grid[row][col] is 0 for empty or a piece id.
// Rows 0..HIDDEN-1 are above the visible playfield: pieces spawn there and a
// piece that cannot spawn without overlap means the game is over.
//
// HIDDEN is 4, not 2: SRS kicks can lift a piece two rows, and a piece spawns
// with its lowest cell in the last hidden row, so 2 rows of headroom above
// every spawn state keeps every kick inside the array. Above row 0 is solid,
// like the walls, so no cell can ever be lost when a piece locks.
// (2 -> 4 and the solid ceiling taken from agent-3, agent-9 and agent-6.)

const COLS = 10;
const VISIBLE_ROWS = 20;
const HIDDEN = 4;
const ROWS = VISIBLE_ROWS + HIDDEN;

function emptyRow() { return new Array(COLS).fill(0); }

function createGrid() {
  const g = [];
  for (let r = 0; r < ROWS; r++) g.push(emptyRow());
  return g;
}

// True if `shape` placed with its top-left at (x, y) overlaps a wall, the
// floor, the ceiling above row 0, or a settled cell.
function collides(grid, shape, x, y) {
  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r].length; c++) {
      if (!shape[r][c]) continue;
      const gx = x + c, gy = y + r;
      if (gx < 0 || gx >= COLS || gy < 0 || gy >= ROWS) return true;
      if (grid[gy][gx]) return true;
    }
  }
  return false;
}

function merge(grid, shape, x, y, id) {
  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r].length; c++) {
      if (shape[r][c]) grid[y + r][x + c] = id;
    }
  }
}

// True if every filled cell of the shape is in the hidden rows: a piece that
// settles there is a lock-out and ends the game. (Rule taken from agent-1.)
function entirelyHidden(shape, y) {
  for (let r = 0; r < shape.length; r++) {
    if (shape[r].some(Boolean) && y + r >= HIDDEN) return false;
  }
  return true;
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

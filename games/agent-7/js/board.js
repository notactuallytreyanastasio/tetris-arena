// The playfield: 10 wide, 24 tall, with the top 4 rows hidden above the
// visible area. Pieces spawn in the hidden rows and drop into view. Four
// rather than two because SRS kicks can lift a piece two rows, and a piece
// rotating at the ceiling must have somewhere to go (agent-3 found this).
//
// grid[y][x] is 0 for empty or the piece letter ('I', 'T', ...). Storing the
// letter means the renderer looks colours up in PIECES.COLORS and there is no
// parallel colour grid to keep in sync.
//
// The grid is the whole world: y < 0 is solid, so nothing can ever be above
// it and merge() never has to discard a cell.

class Board {
  static W = 10;
  static H = 24;
  static HIDDEN = 4;

  constructor() { this.reset(); }

  reset() {
    this.grid = Array.from({ length: Board.H }, () => Board.emptyRow());
  }

  static emptyRow() { return new Array(Board.W).fill(0); }

  // True if placing `cells` (piece-relative [x,y] offsets) at (ox, oy) would
  // leave the board or overlap a settled cell.
  collides(cells, ox, oy) {
    for (const [dx, dy] of cells) {
      const x = ox + dx, y = oy + dy;
      if (x < 0 || x >= Board.W || y < 0 || y >= Board.H) return true;
      if (this.grid[y][x]) return true;
    }
    return false;
  }

  // Filled, or outside the well. Used by the T-spin corner rule, where walls
  // and floor count as filled.
  filled(x, y) {
    if (x < 0 || x >= Board.W || y < 0 || y >= Board.H) return true;
    return this.grid[y][x] !== 0;
  }

  merge(cells, ox, oy, type) {
    for (const [dx, dy] of cells) this.grid[oy + dy][ox + dx] = type;
  }

  fullRows() {
    const rows = [];
    this.grid.forEach((row, y) => { if (row.every(Boolean)) rows.push(y); });
    return rows;
  }

  // Remove the given rows and pad the top with empties.
  removeRows(rows) {
    const gone = new Set(rows);
    const kept = this.grid.filter((_, y) => !gone.has(y));
    while (kept.length < Board.H) kept.unshift(Board.emptyRow());
    this.grid = kept;
  }

  isEmpty() { return this.grid.every(row => row.every(c => !c)); }
}

if (typeof module !== 'undefined') module.exports = Board;

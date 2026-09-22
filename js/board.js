// The playfield: 10 wide, 22 tall, with the top 2 rows hidden above the
// visible area so pieces spawn out of sight and drop in.
//
// grid[y][x] is 0 for empty or the piece letter ('I', 'T', ...). Storing the
// letter means the renderer looks colours up in PIECES.COLORS and there is no
// parallel colour grid to keep in sync.

class Board {
  static W = 10;
  static H = 22;
  static HIDDEN = 2;

  constructor() { this.reset(); }

  reset() {
    this.grid = Array.from({ length: Board.H }, () => Board.emptyRow());
  }

  static emptyRow() { return new Array(Board.W).fill(0); }

  // True if placing `cells` (piece-relative [x,y] offsets) at (ox, oy) would
  // leave the board or overlap a settled cell. Anything above row 0 counts as
  // in bounds so a piece may kick upward into the hidden rows.
  collides(cells, ox, oy) {
    for (const [dx, dy] of cells) {
      const x = ox + dx, y = oy + dy;
      if (x < 0 || x >= Board.W || y >= Board.H) return true;
      if (y >= 0 && this.grid[y][x]) return true;
    }
    return false;
  }

  merge(cells, ox, oy, type) {
    for (const [dx, dy] of cells) {
      const y = oy + dy;
      if (y >= 0) this.grid[y][ox + dx] = type;
    }
  }

  // Remove full rows, pad the top with empties, return how many went.
  clearLines() {
    const kept = this.grid.filter(row => row.some(c => !c));
    const cleared = Board.H - kept.length;
    while (kept.length < Board.H) kept.unshift(Board.emptyRow());
    this.grid = kept;
    return cleared;
  }
}

if (typeof module !== 'undefined') module.exports = Board;

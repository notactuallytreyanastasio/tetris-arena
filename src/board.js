// The playfield: a flat Uint8Array, COLS wide, ROWS visible rows plus HIDDEN
// buffer rows above them where pieces spawn. index = y * COLS + x, y grows
// down, row 0 is the top hidden row. Cell value 0 is empty; 1..7 is the id of
// the tetromino that locked there (which is also its color, see Pieces.COLORS).
//
// Why flat: collision is one bounds check plus one array read per cell, and
// clearing a row is a copyWithin that slides everything above it down.
(function (root) {
  'use strict';

  const COLS = 10;
  const ROWS = 20;
  const HIDDEN = 2;
  const TOTAL = ROWS + HIDDEN;

  class Board {
    constructor() {
      this.cells = new Uint8Array(COLS * TOTAL);
    }

    reset() {
      this.cells.fill(0);
    }

    get(x, y) {
      return this.cells[y * COLS + x];
    }

    // True if every cell of `shape` placed at (px, py) is inside the field
    // and empty. Cells above row 0 are treated as out of bounds, which is
    // what makes the hidden rows the ceiling.
    fits(shape, px, py) {
      for (let i = 0; i < shape.length; i++) {
        const x = px + shape[i][0];
        const y = py + shape[i][1];
        if (x < 0 || x >= COLS || y < 0 || y >= TOTAL) return false;
        if (this.cells[y * COLS + x] !== 0) return false;
      }
      return true;
    }

    lock(shape, px, py, id) {
      for (let i = 0; i < shape.length; i++) {
        this.cells[(py + shape[i][1]) * COLS + px + shape[i][0]] = id;
      }
    }

    // Rows (y indices) that are completely filled, ascending.
    fullRows() {
      const rows = [];
      for (let y = 0; y < TOTAL; y++) {
        let full = true;
        for (let x = 0; x < COLS; x++) {
          if (this.cells[y * COLS + x] === 0) { full = false; break; }
        }
        if (full) rows.push(y);
      }
      return rows;
    }

    // Remove the given rows (ascending order required). Clearing row y
    // slides rows 0..y-1 down by one and blanks row 0; rows below y keep
    // their index, so ascending order stays correct as we go.
    clearRows(rows) {
      for (let i = 0; i < rows.length; i++) {
        const y = rows[i];
        this.cells.copyWithin(COLS, 0, y * COLS);
        this.cells.fill(0, 0, COLS);
      }
    }

    // True if any cell in the hidden rows is occupied: a piece locked
    // entirely above the visible field ("lock out").
    anyHiddenOccupied() {
      for (let i = 0; i < COLS * HIDDEN; i++) if (this.cells[i]) return true;
      return false;
    }
  }

  root.BoardModule = { COLS, ROWS, HIDDEN, TOTAL, Board };
})(typeof module !== 'undefined' ? module.exports : window);

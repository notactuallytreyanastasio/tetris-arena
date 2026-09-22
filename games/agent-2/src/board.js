// The well. board[y][x] holds 0 for empty or a piece id (1..7) for a settled
// cell. Row 0 is the top. The first HIDDEN rows sit above the visible area so
// a piece can spawn and rotate there without being clipped. Four of them,
// not two (agent-3's finding, adopted by most of the arena): the I kick
// table's (1,-2) offset lifts a piece two rows, and a spawn one row above
// the visible area has nowhere to go with only two.

const COLS = 10;
const VISIBLE_ROWS = 20;
const HIDDEN_ROWS = 4;
const TOTAL_ROWS = VISIBLE_ROWS + HIDDEN_ROWS;

function makeBoard() {
  return Array.from({ length: TOTAL_ROWS }, () => new Array(COLS).fill(0));
}

// A piece in play: { type, rot, x, y }. x/y is the top-left of its bounding
// box in board coordinates.
function pieceCells(piece) {
  return PIECES[piece.type].states[piece.rot].map(([dx, dy]) => [piece.x + dx, piece.y + dy]);
}

// True when every cell of the piece is inside the well and on an empty cell.
// Above row 0 is solid, not free: a kick that would go there fails, so
// lockPiece never has cells to discard.
function fits(board, piece) {
  for (const [x, y] of pieceCells(piece)) {
    if (x < 0 || x >= COLS || y < 0 || y >= TOTAL_ROWS) return false;
    if (board[y][x] !== 0) return false;
  }
  return true;
}

// Write the piece's cells into the board. Assumes fits() was true.
function lockPiece(board, piece) {
  const id = PIECES[piece.type].id;
  for (const [x, y] of pieceCells(piece)) board[y][x] = id;
}

// Indices of every full row, top to bottom.
function fullRows(board) {
  const rows = [];
  for (let y = 0; y < board.length; y++) {
    if (board[y].every((c) => c !== 0)) rows.push(y);
  }
  return rows;
}

// Remove the given rows and push blank rows in at the top. Split from
// fullRows() so the game can hold the full rows on screen for a flash
// before they collapse.
function removeRows(board, rows) {
  const drop = new Set(rows);
  const kept = board.filter((_, y) => !drop.has(y));
  while (kept.length < board.length) kept.unshift(new Array(COLS).fill(0));
  board.splice(0, board.length, ...kept);
}

// The well. board[y][x] holds 0 for empty or a piece id (1..7) for a settled
// cell. Row 0 is the top. The first HIDDEN rows sit above the visible area so
// a piece can spawn and rotate there without being clipped.

const COLS = 10;
const VISIBLE_ROWS = 20;
const HIDDEN_ROWS = 2;
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

// Remove every full row, push blank rows in at the top, return how many went.
function clearLines(board) {
  const kept = board.filter((row) => row.some((c) => c === 0));
  const cleared = board.length - kept.length;
  for (let i = 0; i < cleared; i++) kept.unshift(new Array(COLS).fill(0));
  board.splice(0, board.length, ...kept);
  return cleared;
}

// Tetromino data. Every piece has four rotation states, generated once at
// load time by rotating its spawn matrix clockwise inside its own bounding
// box. Rotating inside the box (4x4 for I, 3x3 for the rest, 2x2 for O) is
// exactly what the SRS spec describes, so the states here match the
// guideline tables without transcribing them by hand.
//
// A state is a list of [dx, dy] cell offsets from the piece origin, which is
// the top-left of the bounding box. Board y grows downward.

const PIECE_TYPES = ['I', 'J', 'L', 'O', 'S', 'T', 'Z'];

const PIECE_DEFS = {
  I: { id: 1, color: '#3fc9d9', matrix: [
    [0, 0, 0, 0],
    [1, 1, 1, 1],
    [0, 0, 0, 0],
    [0, 0, 0, 0]] },
  J: { id: 2, color: '#4a6cf0', matrix: [
    [1, 0, 0],
    [1, 1, 1],
    [0, 0, 0]] },
  L: { id: 3, color: '#f0973a', matrix: [
    [0, 0, 1],
    [1, 1, 1],
    [0, 0, 0]] },
  O: { id: 4, color: '#f0d43a', matrix: [
    [1, 1],
    [1, 1]] },
  S: { id: 5, color: '#5fd66a', matrix: [
    [0, 1, 1],
    [1, 1, 0],
    [0, 0, 0]] },
  T: { id: 6, color: '#b466e0', matrix: [
    [0, 1, 0],
    [1, 1, 1],
    [0, 0, 0]] },
  Z: { id: 7, color: '#ee5a5a', matrix: [
    [1, 1, 0],
    [0, 1, 1],
    [0, 0, 0]] },
};

// Clockwise rotation of a square matrix: out[x][n-1-y] = m[y][x].
function rotateMatrixCW(m) {
  const n = m.length;
  const out = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      out[x][n - 1 - y] = m[y][x];
    }
  }
  return out;
}

function matrixToCells(m) {
  const cells = [];
  for (let y = 0; y < m.length; y++) {
    for (let x = 0; x < m[y].length; x++) {
      if (m[y][x]) cells.push([x, y]);
    }
  }
  return cells;
}

// PIECES[type] = { id, color, size, states: [cells, cells, cells, cells] }
const PIECES = {};
for (const type of PIECE_TYPES) {
  const def = PIECE_DEFS[type];
  const states = [];
  let m = def.matrix;
  for (let r = 0; r < 4; r++) {
    states.push(matrixToCells(m));
    m = rotateMatrixCW(m);
  }
  PIECES[type] = { type, id: def.id, color: def.color, size: def.matrix.length, states };
}

// Colour lookup by cell id, for rendering settled cells.
const COLORS = [null];
for (const type of PIECE_TYPES) COLORS[PIECES[type].id] = PIECES[type].color;

// SRS wall kicks. When a rotation from state `from` to state `to` collides,
// these [dx, dy] offsets are tried in order and the first that fits wins.
// The published tables are y-up; these are flipped to y-down to match the
// board. Keyed "from>to" (format taken from agent-7, values checked entry
// by entry against the guideline tables). States: 0 spawn, 1 R, 2 180, 3 L.
const KICKS_JLSTZ = {
  '0>1': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
  '1>0': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
  '1>2': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
  '2>1': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
  '2>3': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
  '3>2': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
  '3>0': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
  '0>3': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
};
const KICKS_I = {
  '0>1': [[0, 0], [-2, 0], [1, 0], [-2, 1], [1, -2]],
  '1>0': [[0, 0], [2, 0], [-1, 0], [2, -1], [-1, 2]],
  '1>2': [[0, 0], [-1, 0], [2, 0], [-1, -2], [2, 1]],
  '2>1': [[0, 0], [1, 0], [-2, 0], [1, 2], [-2, -1]],
  '2>3': [[0, 0], [2, 0], [-1, 0], [2, -1], [-1, 2]],
  '3>2': [[0, 0], [-2, 0], [1, 0], [-2, 1], [1, -2]],
  '3>0': [[0, 0], [1, 0], [-2, 0], [1, 2], [-2, -1]],
  '0>3': [[0, 0], [-1, 0], [2, 0], [-1, -2], [2, 1]],
};
// O lives in a 2x2 box here, so every rotation is the identity and no kick
// is ever needed.
const KICKS_O = [[0, 0]];

function kicksFor(type, from, to) {
  if (type === 'O') return KICKS_O;
  return (type === 'I' ? KICKS_I : KICKS_JLSTZ)[`${from}>${to}`];
}

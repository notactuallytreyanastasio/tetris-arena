// Tetromino definitions. SRS (Super Rotation System).
//
// Each piece is declared once, as its spawn-orientation string grid inside the
// bounding box SRS uses for it: 4x4 for I, 2x2 for O, 3x3 for the rest. The
// other three rotation states are produced by rotating that box clockwise.
// With those box sizes, rotating the box IS the SRS state table (that is the
// whole reason SRS defines the boxes the way it does), so the states do not
// need to be hand-listed and cannot disagree with the kick tables.
//
// Cell coordinates: x grows right, y grows DOWN (screen space).

const PIECE_NAMES = ['I', 'O', 'T', 'S', 'Z', 'J', 'L'];

const PIECE_SHAPES = {
  I: ['....',
      'XXXX',
      '....',
      '....'],
  O: ['XX',
      'XX'],
  T: ['.X.',
      'XXX',
      '...'],
  S: ['.XX',
      'XX.',
      '...'],
  Z: ['XX.',
      '.XX',
      '...'],
  J: ['X..',
      'XXX',
      '...'],
  L: ['..X',
      'XXX',
      '...'],
};

const PIECE_COLORS = {
  I: '#3fd7e6',
  O: '#f2d23c',
  T: '#b06ce6',
  S: '#5fd65a',
  Z: '#ef5b5b',
  J: '#4c7cf0',
  L: '#f2a03c',
};

// Rotate a square string grid 90 degrees clockwise.
function rotateGridCW(grid) {
  const n = grid.length;
  const out = [];
  for (let y = 0; y < n; y++) {
    let row = '';
    for (let x = 0; x < n; x++) row += grid[n - 1 - x][y];
    out.push(row);
  }
  return out;
}

function gridToCells(grid) {
  const cells = [];
  for (let y = 0; y < grid.length; y++) {
    for (let x = 0; x < grid[y].length; x++) {
      if (grid[y][x] === 'X') cells.push([x, y]);
    }
  }
  return cells;
}

// PIECES[name] = { name, index, color, size, states: [cells0, cells1, cells2, cells3] }
// index starts at 1 so that 0 can mean "empty" in the board grid.
const PIECES = {};
PIECE_NAMES.forEach((name, i) => {
  let grid = PIECE_SHAPES[name];
  const states = [];
  for (let r = 0; r < 4; r++) {
    states.push(gridToCells(grid));
    grid = rotateGridCW(grid);
  }
  PIECES[name] = { name, index: i + 1, color: PIECE_COLORS[name], size: grid.length, states };
});

// Colour lookup by board cell value (1..7).
const COLOR_BY_INDEX = [null].concat(PIECE_NAMES.map((n) => PIECE_COLORS[n]));

// SRS wall kick tables. Key is "from>to" rotation state. Each entry is a list
// of [dx, dy] offsets to try in order; the first that fits wins.
//
// These are copied from the Tetris Guideline, where +y means UP. The board
// here has +y meaning DOWN, so applyKick() negates dy. The tables are kept in
// the published orientation so they can be checked against the reference
// by eye.
const KICKS_JLSTZ = {
  '0>1': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
  '1>0': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
  '1>2': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
  '2>1': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
  '2>3': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
  '3>2': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
  '3>0': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
  '0>3': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
};

const KICKS_I = {
  '0>1': [[0, 0], [-2, 0], [1, 0], [-2, -1], [1, 2]],
  '1>0': [[0, 0], [2, 0], [-1, 0], [2, 1], [-1, -2]],
  '1>2': [[0, 0], [-1, 0], [2, 0], [-1, 2], [2, -1]],
  '2>1': [[0, 0], [1, 0], [-2, 0], [1, -2], [-2, 1]],
  '2>3': [[0, 0], [2, 0], [-1, 0], [2, 1], [-1, -2]],
  '3>2': [[0, 0], [-2, 0], [1, 0], [-2, -1], [1, 2]],
  '3>0': [[0, 0], [1, 0], [-2, 0], [1, -2], [-2, 1]],
  '0>3': [[0, 0], [-1, 0], [2, 0], [-1, 2], [2, -1]],
};

function kicksFor(piece, from, to) {
  if (piece.name === 'O') return [[0, 0]];
  const table = piece.name === 'I' ? KICKS_I : KICKS_JLSTZ;
  return table[from + '>' + to];
}

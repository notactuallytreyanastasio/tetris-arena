// Tetromino data: SRS (Super Rotation System).
//
// Each piece has four pre-rotated cell lists, one per rotation state
// 0 (spawn), 1 (clockwise), 2 (180), 3 (counter-clockwise). Cells are
// [dx, dy] offsets from the top-left of the piece's SRS bounding box, with
// y growing DOWN to match the board. Pre-rotating means the rotation index
// is the single source of truth for which kick-table row applies; nothing
// rotates a matrix at runtime.
//
// Works both as a browser global (window.Pieces) and a Node module, so the
// tables can be unit-tested headlessly.
(function (root) {
  'use strict';

  const TYPES = ['I', 'J', 'L', 'O', 'S', 'T', 'Z'];

  const PIECES = {
    I: {
      id: 1, color: '#22d3ee', size: 4,
      states: [
        [[0, 1], [1, 1], [2, 1], [3, 1]],
        [[2, 0], [2, 1], [2, 2], [2, 3]],
        [[0, 2], [1, 2], [2, 2], [3, 2]],
        [[1, 0], [1, 1], [1, 2], [1, 3]],
      ],
    },
    J: {
      id: 2, color: '#3b82f6', size: 3,
      states: [
        [[0, 0], [0, 1], [1, 1], [2, 1]],
        [[1, 0], [2, 0], [1, 1], [1, 2]],
        [[0, 1], [1, 1], [2, 1], [2, 2]],
        [[1, 0], [1, 1], [0, 2], [1, 2]],
      ],
    },
    L: {
      id: 3, color: '#f97316', size: 3,
      states: [
        [[2, 0], [0, 1], [1, 1], [2, 1]],
        [[1, 0], [1, 1], [1, 2], [2, 2]],
        [[0, 1], [1, 1], [2, 1], [0, 2]],
        [[0, 0], [1, 0], [1, 1], [1, 2]],
      ],
    },
    O: {
      id: 4, color: '#facc15', size: 3,
      states: [
        [[1, 0], [2, 0], [1, 1], [2, 1]],
        [[1, 0], [2, 0], [1, 1], [2, 1]],
        [[1, 0], [2, 0], [1, 1], [2, 1]],
        [[1, 0], [2, 0], [1, 1], [2, 1]],
      ],
    },
    S: {
      id: 5, color: '#4ade80', size: 3,
      states: [
        [[1, 0], [2, 0], [0, 1], [1, 1]],
        [[1, 0], [1, 1], [2, 1], [2, 2]],
        [[1, 1], [2, 1], [0, 2], [1, 2]],
        [[0, 0], [0, 1], [1, 1], [1, 2]],
      ],
    },
    T: {
      id: 6, color: '#a855f7', size: 3,
      states: [
        [[1, 0], [0, 1], [1, 1], [2, 1]],
        [[1, 0], [1, 1], [2, 1], [1, 2]],
        [[0, 1], [1, 1], [2, 1], [1, 2]],
        [[1, 0], [0, 1], [1, 1], [1, 2]],
      ],
    },
    Z: {
      id: 7, color: '#f43f5e', size: 3,
      states: [
        [[0, 0], [1, 0], [1, 1], [2, 1]],
        [[2, 0], [1, 1], [2, 1], [1, 2]],
        [[0, 1], [1, 1], [1, 2], [2, 2]],
        [[1, 0], [0, 1], [1, 1], [0, 2]],
      ],
    },
  };

  // id -> color, for painting locked cells straight from the board array.
  const COLORS = [null];
  for (const t of TYPES) COLORS[PIECES[t].id] = PIECES[t].color;

  // SRS wall-kick tables, keyed "from>to". These are the published tables,
  // which use y UP; kicksFor() flips dy so callers get board coordinates.
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

  function kicksFor(type, from, to) {
    if (type === 'O') return [[0, 0]];
    const table = type === 'I' ? KICKS_I : KICKS_JLSTZ;
    return table[from + '>' + to].map(([dx, dy]) => [dx, -dy]);
  }

  // 7-bag randomizer: every run of seven contains each tetromino exactly
  // once, so the longest possible drought of any piece is 12.
  function Bag(random) {
    const rnd = random || Math.random;
    let bag = [];
    return {
      next() {
        if (bag.length === 0) {
          bag = TYPES.slice();
          for (let i = bag.length - 1; i > 0; i--) {
            const j = Math.floor(rnd() * (i + 1));
            [bag[i], bag[j]] = [bag[j], bag[i]];
          }
        }
        return bag.pop();
      },
    };
  }

  root.Pieces = { TYPES, PIECES, COLORS, kicksFor, Bag };
})(typeof module !== 'undefined' ? module.exports : window);

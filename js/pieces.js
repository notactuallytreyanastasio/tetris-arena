// Tetromino data. Shapes are the SRS spawn orientation; the other three
// rotation states are derived at load by rotating the matrix clockwise, so
// the only hand-typed table in this file is the wall-kick table.
//
// Rotation states: 0 = spawn, 1 = clockwise (R), 2 = 180, 3 = counter (L).

const PIECES = {
  I: { id: 1, color: '#5fd3f3', shape: [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]] },
  O: { id: 2, color: '#f4d35e', shape: [[1,1],[1,1]] },
  T: { id: 3, color: '#c77dff', shape: [[0,1,0],[1,1,1],[0,0,0]] },
  S: { id: 4, color: '#7ae582', shape: [[0,1,1],[1,1,0],[0,0,0]] },
  Z: { id: 5, color: '#f76c6c', shape: [[1,1,0],[0,1,1],[0,0,0]] },
  J: { id: 6, color: '#6c8cff', shape: [[1,0,0],[1,1,1],[0,0,0]] },
  L: { id: 7, color: '#ffa552', shape: [[0,0,1],[1,1,1],[0,0,0]] },
};

const PIECE_NAMES = Object.keys(PIECES);

// Indexed by piece id (1..7). COLORS[0] is unused so grid ints map directly.
const COLORS = [null];
const PIECE_BY_ID = [null];
for (const name of PIECE_NAMES) {
  COLORS[PIECES[name].id] = PIECES[name].color;
  PIECE_BY_ID[PIECES[name].id] = name;
}

function rotateCW(m) {
  return m[0].map((_, c) => m.map(row => row[c]).reverse());
}

// ROTATIONS[id] = [state0, state1, state2, state3], each a matrix of 0/1.
const ROTATIONS = [null];
for (const name of PIECE_NAMES) {
  const p = PIECES[name];
  const states = [p.shape];
  for (let i = 1; i < 4; i++) states.push(rotateCW(states[i - 1]));
  ROTATIONS[p.id] = states;
}

// SRS wall kicks. Offsets are (dx, dy) in the convention of the Tetris
// guideline tables where positive dy means UP. Board rows grow downward, so
// the game applies them as x + dx, y - dy. Key is `${from}${to}`.
const KICKS_JLSTZ = {
  '01': [[0,0],[-1,0],[-1, 1],[0,-2],[-1,-2]],
  '10': [[0,0],[ 1,0],[ 1,-1],[0, 2],[ 1, 2]],
  '12': [[0,0],[ 1,0],[ 1,-1],[0, 2],[ 1, 2]],
  '21': [[0,0],[-1,0],[-1, 1],[0,-2],[-1,-2]],
  '23': [[0,0],[ 1,0],[ 1, 1],[0,-2],[ 1,-2]],
  '32': [[0,0],[-1,0],[-1,-1],[0, 2],[-1, 2]],
  '30': [[0,0],[-1,0],[-1,-1],[0, 2],[-1, 2]],
  '03': [[0,0],[ 1,0],[ 1, 1],[0,-2],[ 1,-2]],
};
const KICKS_I = {
  '01': [[0,0],[-2,0],[ 1,0],[-2,-1],[ 1, 2]],
  '10': [[0,0],[ 2,0],[-1,0],[ 2, 1],[-1,-2]],
  '12': [[0,0],[-1,0],[ 2,0],[-1, 2],[ 2,-1]],
  '21': [[0,0],[ 1,0],[-2,0],[ 1,-2],[-2, 1]],
  '23': [[0,0],[ 2,0],[-1,0],[ 2, 1],[-1,-2]],
  '32': [[0,0],[-2,0],[ 1,0],[-2,-1],[ 1, 2]],
  '30': [[0,0],[ 1,0],[-2,0],[ 1,-2],[-2, 1]],
  '03': [[0,0],[-1,0],[ 2,0],[-1, 2],[ 2,-1]],
};
// 180-degree rotation. Guideline SRS has no 180 table; this is TETR.IO's
// SRS+ table, six tests, the same for every piece, y-up like the tables
// above. (Taken from agent-8.)
const KICKS_180 = {
  '02': [[0,0],[ 0, 1],[ 1, 1],[-1, 1],[ 1,0],[-1,0]],
  '20': [[0,0],[ 0,-1],[-1,-1],[ 1,-1],[-1,0],[ 1,0]],
  '13': [[0,0],[ 1, 0],[ 1, 2],[ 1, 1],[ 0,2],[ 0,1]],
  '31': [[0,0],[-1, 0],[-1, 2],[-1, 1],[ 0,2],[ 0,1]],
};
const NO_KICK = [[0, 0]]; // O never kicks; rotation is a no-op for it.

function kicksFor(id, from, to) {
  if (id === PIECES.O.id) return NO_KICK;
  const key = `${from}${to}`;
  if ((to - from + 4) % 4 === 2) return KICKS_180[key];
  return (id === PIECES.I.id ? KICKS_I : KICKS_JLSTZ)[key];
}

// Seeded PRNG (mulberry32) so a game can be replayed with the same bag.
// (Taken from agent-1.)
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randomSeed() {
  return (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0;
}

// 7-bag randomizer: every run of seven pieces contains each tetromino once.
function makeBag(rng = Math.random) {
  let bag = [];
  return function next() {
    if (bag.length === 0) {
      bag = PIECE_NAMES.map(n => PIECES[n].id);
      for (let i = bag.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [bag[i], bag[j]] = [bag[j], bag[i]];
      }
    }
    return bag.pop();
  };
}

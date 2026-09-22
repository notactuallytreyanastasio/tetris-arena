# Tetris, agent-6

Open `index.html`. Run `node test.js` for the headless checks.

Three files: `index.html` (layout, key legend), `style.css`, `tetris.js`. The
JavaScript is one file in two halves. The top half is the game core and never
touches the DOM; the bottom half is `mount()`, which wires a canvas and the
keyboard to a core instance and only runs when `document` exists. That split
is why `require('./tetris.js')` works in node and why `test.js` can drive a
whole game with `update(g, 16)` and no browser.

## Design

**Board.** A flat `Uint8Array`, 10 wide by 24 tall, index `y * 10 + x`. The top
four rows are hidden. Cell value 0 is empty, 1 to 7 is the id of the piece
that locked there, which is also its color. Everything outside the array is
solid, including above row 0, so a piece can never occupy a cell that `lock()`
could not store. Four hidden rows, not two, because the SRS kick tables can
lift a piece two rows at the ceiling.

**Pieces.** Seven pieces, each as four explicit orientations written as
strings and parsed once at load:

```js
T: ['.X.XXX...', '.X..XX.X.', '...XXX.X.', '.X.XX..X.'],
```

Rotation at runtime is an index change. The orientation index is also the key
into the SRS kick tables, which is why the orientations must be explicit
rather than computed. The parser throws if a string is not square or does not
have four cells. It caught one: the O had ten characters instead of nine, its
box size parsed as 3.16, and it landed one row above the floor.

**Kicks.** Full SRS, separate tables for I and for the rest, stored already
flipped to y-down board coordinates with a comment saying so. The published
tables are y-up and silently mixing the two conventions is the usual way to
get kicks that lift when they should drop. A on the keyboard is a 180 using
the SRS+ table, six tests, the same for every piece; a piece that spawned
backwards is one press from right.

**Seed.** The bag is driven by mulberry32 seeded from the URL hash.
`index.html#seed=2024` always deals the same pieces; a game started without a
hash writes its own seed into the address bar. R deals a new seed, Shift+R
replays the current one. `test.js` seeds by number and needs no RNG stub.

**Loop.** One `requestAnimationFrame`. Gravity, DAS, ARR, lock delay and the
line-clear flash are all millisecond accumulators against a `dt` clamped to
100ms. Gravity per level is the guideline curve, `(0.8 - 0.007n)^n` seconds a
row. Level 1 is one row a second; level 10 is about sixteen.

**Input feel.** DAS 170ms, ARR 40ms, lock delay 500ms with fifteen move resets
that refresh when the piece reaches a new lowest row. Direction keys are a
stack: the newest press wins, and releasing it hands DAS to the older key
already charged, since that key has by definition been held longer than DAS.
OS key repeat is ignored. DAS keeps charging through the line-clear flash, so
a direction held through a clear moves the next piece the moment it appears.
Losing the window or the tab pauses the game and drops every held key, so
nothing auto-repeats into a wall when focus returns.

**Scoring.** Guideline. 100/300/500/800 times level for clears; T-spins
400/800/1200/1600, minis 100/200/400; back-to-back tetris or T-spin 1.5x;
combo 50 times count times level; perfect clear 800/1200/1800/2000; soft drop
1 a row, hard drop 2 a row. Scoring happens at lock, not after the flash,
because a T-spin that clears nothing still pays and the spin state is only
known at lock. T-spin detection is the three-corner rule: the T's last
maneuver was a rotation and three of the four corners of its 3x3 box are
solid; full if both corners on the pointing side are solid or the rotation
used the fifth kick, else mini.

**Rendering.** Canvas 2D, full redraw each frame, backing store scaled by
`devicePixelRatio`. The ghost is a 2px outline at 45% alpha, not a filled
cell, so it never reads as a settled block. A grounded piece brightens toward
white as its lock delay runs out. A hard drop leaves a streak down each
column it fell through for 120ms. Full rows flash white for 140ms before they
collapse; during the flash there is no active piece. The hold panel dims
while hold is spent. The HUD is DOM and is written only when a value changes.
Best score is kept in `localStorage` behind a try/catch, since `file://` and
private windows may refuse it.

## What I took, from whom, and what I changed

- **agent-9**: the 7-bag randomizer and the idea of a core that loads in node.
  Changed: one file with a guarded `mount()` instead of an IIFE per file, and
  the random source is injected so tests are deterministic.
- **agent-3** and **agent-9**: four hidden rows. My first version treated
  `y < 0` as air and then dropped those cells at lock time, which is a silent
  data loss. Changed: `y < 0` is solid, uniform with the walls.
- **agent-1**: lock-out (a piece settling entirely in the hidden rows ends the
  game), the DPR-scaled canvas, the held-direction stack, the seeded bag in
  the URL hash with Shift+R replay, and the guarded best score (agent-9 and
  agent-10 have the same guard). Changed: the stack hands DAS over charged
  rather than restarting it, and the seed is a parameter of `newGame()` in
  the core rather than a global.
- **agent-3**: the bottom-up `copyWithin` line-clear loop, the spawn-one-row-
  higher retry before block-out, change-only HUD writes, and shipping the
  tests in the repo.
- **agent-5**: the three-corner T-spin rule with the fifth-kick upgrade, the
  lock-delay pulse, and the dimmed hold panel. Changed: the spun flag is
  cleared by any successful move, horizontal included, not only by a fall;
  the hold dim is a CSS class on the DOM panel, not canvas alpha.
- **agent-7**: the hard-drop trail. Changed: the core records only the drop
  span; the renderer works out the columns.
- **agent-10**: DAS charging through the line-clear flash. They noticed every
  game in the arena, this one included, restarted DAS from zero after a
  clear.
- **agent-2**: combo scoring and the last-event label for the HUD.
- **agent-8**: the perfect-clear bonus and the 180 rotation with SRS+ kicks.
  Changed: the table is stored y-down like the others, and a 180 never claims
  the fifth-kick T-spin upgrade, which is defined for the 90-degree tables.

Others took from here too: agent-3 took the DOM-free core split, agent-4 the
lowest-row lock reset, agent-7 the line-clear flash.

## What does not work

- There is no touch or gamepad input.
- The line-clear flash is a solid white bar; there is no per-cell animation.
- `node test.js` covers the core only. `mount()` is checked by loading the
  page in headless Chrome and grepping for console errors, not by a test.

## Keys

Left/Right move, Up or X rotate clockwise, Z counter-clockwise, A 180, Down
soft drop, Space hard drop, C or Shift hold, P or Esc pause, R restart.

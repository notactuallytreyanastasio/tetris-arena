# Tetris, agent-10

Open `index.html`. No build, no dependencies. Three files: `index.html`
(layout and key legend), `style.css`, `game.js` (everything else, one
closure, about 680 lines).

Keys: arrows move and soft drop, Up or X rotates clockwise, Z
counter-clockwise, Space hard drops, C or Shift holds, P or Escape pauses,
R restarts.

## Design

**Board** is one `Uint8Array`, 10 wide by 24 tall, index `y * 10 + x`,
value 0 or a piece id 1..7. The top 4 rows are hidden. Four, not two,
because SRS I-piece kicks lift a piece two rows and a piece spawns with its
top row in the buffer; with four rows no legal position ever has a
negative y, so `collides()` is a single bounds-and-occupancy check with no
special cases. Line clears are `copyWithin` on the flat array, walking full
rows top-down so remaining indices stay valid. Nothing allocates per frame
or per clear.

**Pieces** are written once as strings in their spawn orientation inside a
3x3 box (4x4 for I). The other three orientations are derived at load by
rotating the box clockwise, `(x, y) -> (n - 1 - y, x)`. That is exactly
what SRS specifies, so the published kick tables apply unchanged. The kick
tables are stored as published (y up) and flipped once at load, so anyone
checking them against the wiki sees the same numbers. O is pinned to its
spawn cells.

**Loop** is a single `requestAnimationFrame`. Gravity, horizontal
auto-repeat (DAS 170ms, ARR 40ms), lock delay (500ms, up to 15 move-resets
per lowest row reached), soft drop, the line-clear flash and toast fades
are all millisecond accumulators fed by the same frame delta. They cannot
drift relative to each other, and a level change is one number. The delta
is clamped to 100ms so a backgrounded tab does not fast-forward, and the
tab hiding pauses the game anyway.

**Input** ignores OS key repeat and runs its own. Holding both directions:
the last pressed wins, and releasing it resumes the other with no new DAS
wait. The DAS accumulator keeps running while rows flash, so a direction
held through a clear is already charged when the next piece appears. Every
other game I read restarts the wait there, which is a 170ms hitch on every
line clear.

**Rendering** is canvas, whole board redrawn every frame, DPR-scaled. The
ghost is an outline. While a piece rests on the stack it brightens in
proportion to how much of its lock delay has elapsed and the ghost fades
out at the same rate, so a lock is never a surprise.

**Scoring** is the guideline table (100/300/500/800 times level), T-spins
by the 3-corner rule (400/800/1200/1600, mini 100/200/400, full if both
front corners are solid or the 5th kick placed it), back-to-back 1.5x for
tetrises and T-spins, combo 50 per chained clear, perfect clear
800/1200/1800/2000. Each lock posts one label on the board, for example
`B2B T-SPIN DOUBLE +1800`, with a second line for combos. Level is
1 + lines/10 and gravity follows the guideline curve
`(0.8 - 0.007 (L-1))^(L-1)` seconds. That curve reaches 20G at level 20,
which is unplayable by hand; I kept it because it is the published curve
and a cap is a taste decision I did not want to make for the player.

Two ways to lose: the spawn position is blocked on both candidate rows
(block-out), or a piece settles entirely in the hidden rows (lock-out).
Best score is kept in `localStorage`.

## What does not work

- No 180 rotation.
- Soft drop is gravity divided by 20, so it gets faster with level rather
  than being a fixed rate.
- No sound, no touch controls.
- Not verified in a browser by me. Every behaviour above was checked in a
  headless Node harness that stubs the DOM and drives frames at 16ms
  (about 100 checks across four suites, kept outside the repo).

## Taken from whom

All ten agents converged on canvas, a flat or 2D board with hidden rows,
SRS with kick tables and a single rAF loop before anyone had committed
code. The differences came later.

- **agent-3**: the guideline gravity formula, the 7-bag, and the
  100/300/500/800 table with b2b at 1.5x. Changed: my bag lives in state
  so restart empties it; drop points are credited at the drop rather than
  at lock.
- **agent-9** (crediting agent-3): four hidden rows, because SRS kicks
  lift two rows. This found a real bug in my milestone 2: with two hidden
  rows my `lock()` silently discarded cells above the board.
- **agent-1** (via agent-2's observation): the lock-out rule. Also the
  argument that a tall enough buffer makes the bounds check one line; I
  took the argument without the 40-row board.
- **agent-5**: T-spin detection by the 3-corner rule with the kick-5
  upgrade, its scoring table, and the lock-delay pulse. Changed: `spun`
  clears on any successful move, gravity step or hard drop that moved, so
  rotate-then-slide is a plain clear; the pulse is a white overlay so all
  colours read the same, and it drives the ghost fade too.
- **agent-2**: the 120ms line-clear flash with no active piece. Changed:
  row removal stays allocation-free on the flat array.
- **agent-4**: on-board scoring toasts. Changed: one composed label per
  lock instead of one toast per event.
- **agent-7**: combo and perfect-clear scoring, and naming the DAS-during-
  lock problem. Their fixed-rate soft drop I read and did not take.

The full reasoning, including what was rejected, is on branch `agent-10`
of the `tetris-arena` deciduous workspace.

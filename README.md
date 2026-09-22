# Tetris, agent-5

Open `index.html`. No build, no dependencies. `node test/run.js` runs the
milestone probes against the game code in a stubbed DOM.

Three files: `index.html` is the layout, `style.css` the chrome, `tetris.js`
everything else in one file, top to bottom: constants and piece data, board,
randomizer, game state and rules, input, rendering, loop.

## The parts worth reading

**SRS states are generated, not typed.** Each piece is one small matrix in
its spawn orientation. The other three states come from rotating that matrix
clockwise inside its box, which is exactly what SRS defines for the 3x3
(JLSTZ) and 4x4 (I) pieces, and O in a 2x2 rotates to itself. That is one
place to be wrong instead of 24. `test/m1.js` checks the 24 generated states
against the reference tables.

**Kick tables are in the wiki's convention.** SRS kicks are written with +y
up. The board has +y down. The obvious version pre-negates the table; then
nobody can check it against the reference without re-deriving every sign.
Here the table is copied verbatim and `tryRotate` negates y at the single
place it is used. `test/m2.js` proves the signs are right by building a
T-spin-double slot, resting a T beside the overhang, rotating it, and checking
it landed via kick test 3 (left one, down one) and filled both rows.

**The board is one `Uint8Array`, 10 x 22.** Two hidden rows above the visible
twenty let pieces spawn at guideline height. Collision is an index calculation.
Line clear is `copyWithin` plus a `fill`, no allocation. Cell values are piece
ids, which are also the colour indices.

**One clock.** A `requestAnimationFrame` loop hands a millisecond delta to
`update()`. Gravity, DAS/ARR, lock delay and the line-clear flash are all
accumulators fed from that delta, so pause is "do not call update". The delta
is clamped to 100ms so a backgrounded tab does not dump a second of gravity on
return; in practice it pauses instead, see below.

**A line clear is two phases.** `lockNow()` finds full rows, scores them, and
parks them in `state.clearing`. For 120ms the renderer paints those rows white
and `update()` does nothing else. Then the rows collapse and the next piece
spawns. No piece exists during the flash, so input cannot act on a board that
is about to change.

**T-spins are real.** The 3-corner rule: a T whose last action was a rotation,
with three of the four diagonals around its centre solid, was spun in. Full
if both corners on the pointing side are solid or the piece arrived by kick
test 5; otherwise mini. Scored per guideline, with back-to-back 1.5x for
tetrises and T-spin clears alike, and combo bonuses. The first cut had a bug
the probe caught: a T rotated in open air and then hard-dropped still counted
as spun. `stepDown()` now clears the flag, since a fall after the rotation
means the rotation was not the last maneuver.

**Lock delay you can see.** While a piece rests on the stack its cells
brighten in proportion to how much of the 500ms lock delay has elapsed. A lock
is something you watched happen. Moves and rotations reset the delay up to 15
times per lowest row reached, so a piece cannot be stalled forever.

**The ghost is an outline.** A translucent copy blends into a busy stack. A 2px
stroke in the piece colour leaves the interior black and reads as "where the
edges will go".

## Controls

| Key | Action |
| --- | --- |
| Left / Right | move; hold for DAS 170ms then ARR 40ms |
| Up / X | rotate clockwise |
| Z / Ctrl | rotate counter-clockwise |
| Down | soft drop, 20x gravity, 1 point per row |
| Space | hard drop, 2 points per row |
| C / Shift | hold, once per piece |
| P / Esc | pause; the game also pauses on tab hide or window blur |
| R | restart |

## What came from whom

Everyone converged on canvas, a flat board, SRS and a rAF clock within the
first minute, so the interesting differences were smaller.

- **agent-3**: lock-out as a second game-over condition (a piece resting
  entirely above the visible rows), and HUD writes only when a value changes.
  Both taken as-is. Agent-3's M4 also has a three-deep next queue and a
  translucent ghost; the queue depth matches, the ghost does not.
- **agent-2**: combo scoring, 50 x combo x level from the second consecutive
  clearing lock. Taken, but moved into `award()` next to back-to-back so
  every scoring rule lives in one function and the two counters reset in the
  same branch.
- **agent-8**: perfect-clear bonus (800/1200/1800/2000 x level when the
  board empties). Taken; checked after the rows collapse and over the whole
  array, hidden rows included.
- **agent-10**: the observation that every branch stopped charging DAS
  during the line-clear flash, so a held direction hitched for a full DAS on
  the next piece. Taken; the charge is capped at one DAS so the new piece
  gets a single shift on its first frame rather than a burst of repeats.
- **agent-1**: a 40-row board so no cell can ever be above the array and
  collision needs no negative-y guard. Read, not taken: the guard here is one
  line, and a 20-row render offset in every draw call costs more than it
  saves.
- **agent-7**: soft drop as a fixed ms-per-row with a floor at gravity, with
  the point that a fixed rate can otherwise be slower than gravity at high
  levels. Read, not taken: this game divides gravity by 20, which cannot be
  slower than gravity by construction.

## What does not work

- No touch or gamepad input.
- No sound.
- Mini T-spin detection uses the "front corners or kick 5" rule and does not
  implement the newer "mini unless it clears two lines" variants.
- The gravity table is the guideline curve capped at level 20; there is no
  level cap or victory condition, the game simply gets as fast as level 20.
- `test/harness.js` stubs the DOM, so rendering is verified only by
  screenshot, not by the probes.

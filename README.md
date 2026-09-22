# Tetris, agent-9

Open `index.html`. No build step, no dependencies. `node test/run.js` runs
57 checks against the rules with no browser.

## Layout

Six classic scripts, loaded in order by `index.html`. No ES modules, because
Chrome refuses to load them from `file://` and double-clicking the page has
to work.

| file            | job                                                        |
|-----------------|------------------------------------------------------------|
| `src/pieces.js` | tetromino data, SRS states, kick tables, 7-bag             |
| `src/board.js`  | the playfield: a flat `Uint8Array`, collision, row clears  |
| `src/game.js`   | rules: gravity, lock delay, rotation, scoring, hold, pause |
| `src/render.js` | canvas drawing and the change-only HUD                     |
| `src/input.js`  | keyboard with DAS/ARR                                      |
| `src/main.js`   | one `requestAnimationFrame` loop wiring the three above    |

`pieces.js`, `board.js` and `game.js` have no DOM dependency and also load
under Node, which is what the test runner uses.

## The parts worth reading

**The board is one `Uint8Array`, 10 wide by 24 tall.** Twenty visible rows
and four hidden ones above them. `index = y * 10 + x`, value 0 is empty,
1..7 is the id of the piece that locked there, which is also its colour.
Collision is one bounds check and one array read per cell. A line clear is
`copyWithin` sliding everything above the row down ten cells, then `fill`
on row 0; no allocation, and rows clear in ascending order because clearing
row *y* never moves anything below it.

Four hidden rows, not two. Some SRS kicks lift the piece two rows, and with
only two rows of headroom a legal rotation at the ceiling would be refused
by the bounds check alone. The ceiling itself is solid: `fits()` says no to
`y < 0`, so the hidden rows are the limit and nothing is ever silently
dropped off the top.

**Rotation states are derived, not typed.** Each piece is one spawn shape
inside its SRS box; the other three states come from rotating inside that
box, `(x, y) -> (n-1-y, x)`, with O pinned to its spawn shape. That is what
SRS defines, so the kick tables line up. The rotation index is the only
thing that picks a kick row. The kick tables are keyed `"0>1"` and so on and
written as published (y up); `kicksFor()` flips `dy` at the one place they
are read.

**One clock.** `main.js` hands a millisecond delta to `input.update`, then
`game.update`, then redraws. Gravity, DAS/ARR, lock delay, the line-clear
flash and the toast are all accumulators over that delta, so the game feels
the same at 60 and 120 Hz. The delta is clamped to 100 ms; on top of that,
losing focus pauses, so a hidden tab never dumps gravity on return.

Gravity is the guideline curve, `(0.8 - (level-1) * 0.007) ^ (level-1)`
seconds per row. Measured rather than remembered: level 1 is 1000 ms, level
10 is 64 ms, level 15 is 7 ms. Past 15 the game is played on lock delay.

**Lock delay you can see.** A resting piece has 500 ms before it locks. Any
successful move or rotation while resting restarts that, at most 15 times
per piece, and the count refills when the piece reaches a new lowest row.
While the timer runs the piece's colour mixes toward white in proportion,
so a lock is something you watched happen. `game.lockProgress()` is 0
whenever the piece can still fall, so a piece lifted off the stack by a
kick stops brightening at once.

**Input is polled, not event-driven.** `keydown` records state and does
the one-shot actions (rotate, hard drop, hold, pause). Horizontal repeat is
done in `update(dt)`: DAS 170 ms, then ARR 30 ms. Browser key repeat is
ignored. The most recent horizontal press wins; releasing it falls back to
the other key with a fresh DAS. Because the repeat direction lives in the
`Input` object and only `keyup` or blur clears it, a held direction charges
through a line clear and carries into the next piece with no special case.

**T-spins are real.** The three-corner rule: a T whose last successful
action was a rotation, with three of the four diagonals around its centre
solid, was spun in. Full if both corners on the side the T points to are
solid, or it arrived on the fifth kick test; else mini. Walls, floor and
ceiling all count as solid, the same as `fits()`. Any successful move or
gravity step clears the spun flag, so a T rotated in the open and then
dropped is not a spin.

**Scoring** is the guideline table times level, with back-to-back 1.5x for
consecutive tetrises and T-spin clears, a combo bonus of 50 x n x level for
consecutive clearing locks, and a perfect-clear bonus. A toast over the
field names the clear, e.g. `B2B  TETRIS  COMBO x1  PERFECT CLEAR`.

**Two ways to lose.** Block out: the spawn position itself is occupied.
Lock out: a piece settles entirely inside the hidden rows. Both set `over`;
R or Enter restarts.

**Pause lives in the game, not the loop.** `game.paused` is folded into
`active()`, which every player action already checks, so a hard drop during
pause is refused by the same line that refuses it during a line clear.
Blur and a hidden tab pause and release every held key.

## Keys

| key            | action              |
|----------------|---------------------|
| left / right   | move (DAS/ARR)      |
| down           | soft drop (20x)     |
| up, X          | rotate clockwise    |
| Z, left Ctrl   | rotate counter      |
| A              | rotate 180          |
| space          | hard drop           |
| C, Shift       | hold                |
| P, Esc         | pause               |
| R, Enter       | restart             |

## Taken from whom

Everyone can read everyone here, and the decision graph says what each
agent chose and why. What I took, and what I changed:

- **agent-1**: deriving the three other rotation states from the spawn
  shape. I had typed all 28 by hand; a Node check showed the derivation
  reproduces every one of them, so the hand tables are gone.
- **agent-3**: four hidden rows, for the two-row kicks. HUD writes only when
  a value changes. Shipping the probes in the repo. Its
  spawn-one-row-higher fallback was not needed: I spawn inside the hidden
  rows and apply an initial drop, so that fallback is my default.
- **agent-5**: the three-corner T-spin rule with the kick-five upgrade to
  full, changed so the ceiling counts as solid. Brightening the resting
  piece by lock progress. The outline ghost, to which I added a 12% fill so
  it still reads against the grid.
- **agent-5, agent-6, agent-10**: pause on blur and on a hidden tab, and
  dropping every held key when that happens. Changed so `paused` is a
  property of the game and gates the one-shot actions too.
- **agent-10**: best score in `localStorage`, written only on game over,
  read in a try/catch because `file://` and private windows can throw.

Recorded but not taken: agent-3 charges DAS through the clear animation
explicitly; mine already does, by construction.

## Verifying

`node test/run.js` covers the rules: walls, the I kick out of the left
wall, the 15-reset lock cap, a brute-forced T-spin double (every T
placement above a canonical slot; exactly one rotation enters it, and it
scores 1200), 7-bag coverage across four bags, hold once per piece, 180
kicks, lock progress, pause.

Rendering was checked with headless Chrome screenshots. One thing that cost
time: under `--virtual-time-budget` Chrome advances timers but not
`requestAnimationFrame`, so the screenshot harness drives the same
`input.update / game.update / draw` sequence from a 16 ms `setInterval`
and reports `window.onerror` through `document.title`. A stale harness
once rendered a blank page silently; that reporter is why it will not
again.

## What does not work

- The 180 rotation kick list is a short ad hoc one (in place, sideways,
  up), not a published SRS+ table.
- There is no gravity cap: past level 15 pieces effectively teleport and
  the game is lock-delay only, as the guideline curve dictates.
- No touch controls, no sound, no DAS/ARR settings UI.
- The tests cover rules, not rendering; the screenshots are manual.

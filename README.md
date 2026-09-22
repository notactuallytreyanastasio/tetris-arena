# Tetris, agent-1

Open `index.html`. Plain HTML, CSS and one JavaScript file. No build, no
dependencies. `node test/run.js` runs six probe files against the engine
in a stubbed DOM; every number in the commit messages comes from them.

    ← →        move (held: DAS 150 ms, then ARR 33 ms)
    ↑ / X      rotate clockwise        Z / Ctrl   rotate counter-clockwise
    ↓          soft drop               Space      hard drop
    C / Shift  hold                    P / Esc    pause
    R          new game                Shift+R    replay this seed

## The one thing the others do not have

The bag is seeded. `index.html#seed=2024` always deals the same pieces in
the same order. A game started without a hash writes its own seed into the
address bar, so every game you play has an address you can send to someone
and they get your bag. Shift+R replays the seed you just lost on.

The generator is mulberry32, seeded from the hash or from
`Date.now() ^ Math.random()`. A side effect is that the tests never stub
`Math.random`: `reset(12345)` twice gives the same first six pieces, and the
harness checks that.

## Shape of the code

`tetris.js` is one closure, read top to bottom:

1. **tables**: piece shapes, kick tables, colours, scoring.
2. **board**: a flat `Uint8Array`, collision, full rows, row removal.
3. **pieces**: bag, queue, spawn, hold, shift, rotate, drops, T-spin
   detection, scoring, lock.
4. **loop**: one `requestAnimationFrame` with dt accumulators, and the key
   handlers that feed it.
5. **render**: canvas 2D for the board, next and hold; DOM for numbers.

### Board: 10 wide, 40 tall, bottom 20 drawn

Index is `y * 10 + x`, 0 is empty, 1 to 7 is a piece id. Rows 0 to 19 are a
hidden buffer. That is far more than the two or four rows the other games
use, and it costs 200 bytes. What it buys is that `collides()` has one
bounds check for every cell and nothing in the game ever reasons about
negative y: spawn, kicks that lift a piece at the ceiling, and the lock-out
test are all ordinary array reads. Pieces spawn with the bottom of their box
on the top visible row, or one row higher if that is blocked (agent-3's
fallback), and the game ends by block-out (both spawn rows blocked) or
lock-out (a piece rests entirely in the hidden rows).

Line clears: find the full rows, flash them white for 120 ms with no piece
in play, then `copyWithin` slides everything above each row down by one.
No allocation.

### Rotation: SRS, generated

Each piece is stored once, in its spawn orientation, as four `[x, y]` cells
inside its SRS bounding box (3x3, 4x4 for I). The other three orientations
are generated at load by rotating inside that box, `(x, y) -> (n-1-y, x)`,
which is exactly what SRS defines, so the published kick tables apply
unchanged. The kick tables are the Guideline ones with y flipped to
y-down. O never kicks.

The tables were verified by search rather than by eye. `test/test-tst.js`
builds the classic T-spin triple slot, tries every resting T position and
both directions, and finds exactly the two textbook entries: state 0
clockwise via the fifth kick, and state 2 counter-clockwise. Two earlier
probe boards had the overhang in the wrong place and found nothing, which
was the right answer for those boards. The lesson is in the commit message
for M2.

T-spins use agent-5's three-corner rule. A T whose last action was a
rotation, with at least three of the four diagonals around its centre
solid, is a spin; full if both corners on the pointing side are solid or
the piece arrived by the fifth kick, otherwise mini. The kind is computed
before the piece is stamped, otherwise its own cells count as corners. Any
successful shift or gravity step clears the spun flag.

### Timing: one clock

One rAF callback, dt clamped to 100 ms so a backgrounded tab does not dump
seconds of gravity on return. Gravity (Guideline curve,
`(0.8 - 0.007 (L-1))^(L-1)` s per row, soft drop 20x), lock delay (500 ms,
restarted by a grounded shift or rotate up to 15 times, budget refilled
when the piece reaches a new lowest row), DAS/ARR and the clear flash are
all accumulators advanced by that dt. Pause skips `update()` and nothing
else has to know.

Held left/right is a stack: keydown pushes, keyup removes, the active
direction is the top. Newest press wins; releasing it falls back to the
older one with a fresh DAS. That is the behaviour agent-3 built with three
booleans, and the stack gets it for free. During the clear flash the charge
keeps accumulating, capped at DAS, so the next piece gets exactly one
immediate shift and then ARR: agent-10 found the dead-DAS bug, agent-5
found that carrying the raw charge caused a burst.

### Scoring

Guideline: 100/300/500/800 x level; T-spin 400/800/1200/1600, mini
100/200/400; back-to-back tetris or T-spin 1.5x; combo 50 x combo x level;
perfect clear 800/1200/1800/2000 (3200 for a back-to-back tetris), decided
at lock time because the board is empty after the clear iff every filled
cell was on a full row; soft drop 1 and hard drop 2 per row. Level is
1 + lines/10. The HUD names the last clear: `B2B Tetris  x2`,
`Perfect Clear Single`. Best score is kept in localStorage when it exists.

## What I took from whom

Every item is an observation on branch `agent-1` in the `tetris-arena`
workspace, linked to the action that used it.

- **agent-3**: release-resumes-the-other-direction in the DAS model, the
  spawn-one-row-higher fallback, DOM writes only when a value changes, and
  redrawing the next and hold canvases only when their contents change.
- **agent-5**: the three-corner T-spin rule with the fifth-kick upgrade,
  the outline ghost, the lock-delay pulse (a grounded piece lightens with
  `lockAcc / LOCK_DELAY`), dimming the hold panel while spent, and the DAS
  cap during the flash.
- **agent-2**: the 120 ms white flash with no piece in play, the combo
  counter, back-to-back 1.5x, and the lowest-row refill of the lock-reset
  budget, which is the Guideline rule and was missing from mine.
- **agent-8**: the argument that a 7-bag makes a five-deep preview worth
  showing. Also perfect clear, which I implemented differently.
- **agent-10**: DAS going dead during the flash, and the best score.
- **agent-6, agent-8, agent-9** ship a 180-degree rotation on A. I did not.
  Its kick table is not part of SRS and would be the one piece of rotation
  code I could not check against the published tables.

What went the other way: agent-3, 4, 6, 9 and 10 took the tall hidden zone
(most of them as four rows rather than twenty); agent-2, 3, 4 and 8 took the
DPR-scaled canvas; agent-2, 4, 6 and 10 took lock-out; agent-9 took the
generated rotation states and checked them against hand tables; agent-2 and
agent-6 took the held-direction stack.

## What does not work

- No touch controls. Keyboard only.
- No sound.
- The best score is per browser and per origin. On `file://` some browsers
  refuse localStorage; the game then shows 0 and does not care.
- `history.replaceState` on `file://` is refused by some browsers; the seed
  is still shown in the HUD and Shift+R still replays it.
- The harness stubs the canvas, so rendering is checked only by headless
  Chrome screenshots taken during development, not by `test/run.js`.

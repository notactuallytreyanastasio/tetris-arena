# Tetris, agent-8

Open `index.html`. Plain HTML, CSS and JavaScript, no build step, no
dependencies. `node test/run.js` runs 90 checks against the game core without
a browser.

    ← →        move (held: DAS 160 ms, then ARR 30 ms)
    ↑ / X      rotate clockwise        Z / Ctrl   rotate counter-clockwise
    A          rotate 180              C / Shift  hold
    ↓          soft drop               Space      hard drop
    P / Esc    pause                   R          restart on a new seed
    Shift+R    replay the same seed

## Shape of the code

Seven classic `<script>` tags sharing one global scope. No ES modules, because
`file://` blocks module imports in Chrome and the point is double-clicking
`index.html`.

| file           | owns                                                        | touches DOM |
|----------------|-------------------------------------------------------------|-------------|
| `js/pieces.js` | SRS shapes, colours, the three kick tables                  | no          |
| `js/board.js`  | the grid, collision, merge, full-row scan, clear            | no          |
| `js/game.js`   | rules: gravity, lock delay, rotation, hold, queue, scoring  | no          |
| `js/render.js` | canvas drawing: board, ghost, pulse, flash, next, hold      | yes         |
| `js/input.js`  | keyboard to `Game` calls, DAS/ARR, pause on blur            | yes         |
| `js/hud.js`    | score / level / lines / clear label, change-only writes     | yes         |
| `js/main.js`   | wires them up, runs the `requestAnimationFrame` loop        | yes         |

The three DOM-free files, plus `input.js` against a stub `window`, are what
`test/run.js` evaluates in a `vm` context. The tests drive `Game` directly:
`g.move(-1)`, `g.rotate(2)`, `g.update(dt)`, and seed every game so a
failure replays.

## The parts worth reading

**Rotation states are derived from one grid per piece.** `pieces.js` writes
each piece once, as its spawn orientation inside the bounding box SRS uses
for it: 4x4 for I, 2x2 for O, 3x3 for the rest. The other three states come
from rotating that box clockwise. With those box sizes that is exactly the
SRS state table, so the states cannot disagree with the kick tables, which
are keyed by state index. `test/m1.js` checks all 28 states against the
reference strings.

**Kick tables are stored in the Guideline's orientation, +y up.** The board is
+y down. `rotate()` negates `dy` at the one place a kick is applied:

```js
const nx = a.x + kicks[i][0];
const ny = a.y - kicks[i][1];
```

The obvious version pre-flips the table, and then nobody can check it against
the wiki without redoing every sign. `test/m3.js` proves the signs are right
by resting a T beside a T-spin-double slot, rotating it, and checking it
arrived via kick test 3 (`[-1, -1]`: left one, down one).

**180 rotation with SRS+ kicks.** Guideline SRS has no 180. TETR.IO's SRS+
adds one table of six tests, shared by every piece:

```js
'0>2': [[0, 0], [0, 1], [1, 1], [-1, 1], [1, 0], [-1, 0]],
```

`kicksFor()` picks it whenever `(to - from) mod 4 === 2`. A piece that
spawned backwards is one press from right, and a T on the floor 180s up one
row through test 2 instead of failing. It started here; agent-6 and agent-9
have since taken it. agent-7 and agent-10 rejected it because the SRS+ table
cannot be checked against the Guideline's published tables, which is fair.

**Board is `grid[y][x]` of piece indices, 10 wide, 24 tall, top 4 hidden.**
Row arrays over a flat `Uint8Array` because collision is a nested loop anyone
can audit and a line clear is `filter` then `unshift`. It started at 2 hidden
rows. agent-3 and agent-9 showed that SRS kicks lift a piece up to two rows,
so with a 2-row buffer the bounds check alone refuses legal rotations at the
ceiling. Pieces spawn at `HIDDEN_ROWS - 2` and step down once, so they emerge
on their first frame and there are still two rows above for kicks.

**One clock.** `requestAnimationFrame` hands a millisecond delta to
`input.update(dt)` and `game.update(dt)`. Gravity, soft drop, DAS, ARR, lock
delay and the clear flash are all accumulators on that delta, which is why
pause is one early return and a 144 Hz monitor plays the same as 60. The
delta is clamped to 100 ms so a background tab does not dump seconds of
gravity on return; in practice blur pauses the game first.

**Lock delay has both resets.** A grounded piece locks after 500 ms. A
successful move or rotate restarts that, at most 15 times per piece
(move reset). Reaching a new lowest row restores the 15 (step reset). agent-3
had the cap but not the step reset; without it a piece that spends its
resets on a ledge locks the instant it slides off, which reads as a bug
rather than a rule. agent-7 later took the step reset from the graph.

**Scoring is the full Guideline table.** Lines 100/300/500/800, T-spin
400/800/1200/1600, mini T-spin 100/200/400, all times level. Back-to-back
1.5x on consecutive tetris or T-spin clears. Combo 50 x n x level. Perfect
clear adds 800/1200/1800/2000 x level. T-spin detection is the 3-corner rule:
a T whose last action was a rotation with three solid diagonals around its
centre; full if both front corners are solid or the rotation landed on kick
test 5, otherwise mini. A lineless T-spin scores 400 and keeps b2b alive.

**A line clear is two phases.** `lock()` merges the piece, finds full rows,
and parks them in `game.clearing`. For 120 ms the renderer paints them white
and no active piece exists, so every input method null-guards. Then
`finishClear()` collapses the rows, scores them, and spawns. Scoring waits
for the collapse so the label and the board change land together.

**The bag is seeded and the seed is in the URL.** `Game(seed)` builds the
7-bag on a mulberry32 stream. The seed shows in the HUD and rides in
`#seed=N`, so a reload or a shared link replays the same pieces. R restarts
on a fresh seed, Shift+R replays the current one. The same mechanism pins
the node tests.

**Held direction survives a line clear.** `Input.update()` keeps charging
DAS while rows flash and no piece exists. agent-10 found that every other
game reset it there, a 160 ms hitch on every clear. While there is no piece
the accumulator is clamped to one ARR: the next piece moves one cell on its
first frame rather than four.

**The lock timer is visible.** While a piece rests on the stack its fill
lerps toward white by `lockAcc / LOCK_DELAY`, bevel unchanged. You can see
the lock coming instead of being surprised by it.

## What was taken from whom

Everything below was read in a sibling worktree or in the shared decision
graph, then changed. The graph has an `observation` node for each.

- **agent-3**: the held-key input model (keydown/keyup feed state, DAS then
  ARR on the frame delta, releasing one direction resumes the other) and the
  lock-reset cap. Changed: added the step reset, moved input into its own
  class that only calls `Game` methods, kept the DAS charge across spawn.
- **agent-1**: `devicePixelRatio`-scaled canvas backing store. Unchanged.
- **agent-9, from agent-3**: 4 hidden rows and why.
- **agent-5**: `tspinKind()` with the front-corner / kick-test-5 split for
  full vs mini (agent-3's version does not split minis); the lock-delay pulse;
  the dimmed hold panel while hold is spent; pause drops held keys because
  their keyups will be missed. Changed: the pulse lerps the fill only.
- **agent-4, from agent-3**: combo scoring and change-only HUD writes.
- **agent-2**: the `clearing` state for the flash. Changed: combo counter
  survives the flash; lineless T-spins score immediately.
- **agent-6 and agent-10**: 5-deep preview over 3-deep. **agent-5 and
  agent-6**: outline ghost, both having found a filled ghost blends with the
  stack. **agent-6**: auto-pause on `visibilitychange` as well as `blur`.
- **agent-3, agent-5, agent-6**: shipping the probes as a test runner.
- **agent-1**: mulberry32 seeded bag, seed in the URL hash, Shift+R replay.
  Changed: the seed is a constructor argument so tests pin it directly.
- **agent-1, agent-10**: best score in `localStorage` behind try/catch.
- **agent-4, agent-7**: hard-drop trail. Changed: tinted with the piece
  colour instead of white.
- **agent-10**: DAS keeps charging through the clear flash. Changed: added
  the one-ARR clamp so the charge does not bank repeats.

Added here and not seen elsewhere: the 180 rotation with SRS+ kicks, the
perfect clear bonus (agent-5 has since taken it and said so), and the step
reset (agent-7 has taken it).

## What does not work

- No touch or gamepad input. Keyboard only.
- No sound.
- DAS and ARR are constants, not settings. ARR 0 means shift to the wall,
  but there is no way to set it without editing `input.js`.
- Best score is per browser and per origin; `file://` in some browsers
  refuses `localStorage`, in which case it lasts until reload.
- The 180 kick table is TETR.IO's, not verified against TETR.IO itself; the
  tests check that it is applied, not that every offset matches.
- Level 20 is the gravity cap. Lines keep counting, speed does not.

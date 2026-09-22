# Tetris, agent-4

Open `index.html`. No build, no dependencies. `node test/run.js` runs 91
checks against the DOM-free core.

## Shape

Six classic `<script>` tags, loaded in order, sharing one global scope.
ES modules were rejected because Chrome refuses `import` from `file://` and
the game has to open by double-click.

| file            | owns                                                             |
|-----------------|------------------------------------------------------------------|
| `js/pieces.js`  | spawn matrices, rotation states derived at load, SRS and SRS+ 180 kick tables, seeded 7-bag |
| `js/board.js`   | grid as array of rows, collision, merge, full-row scan, lock-out test |
| `js/game.js`    | `Game`: all rules and timers, no DOM                             |
| `js/render.js`  | canvas drawing: board, ghost, lock pulse, drop trail, toasts, previews |
| `js/input.js`   | `Input`: DAS/ARR clock and the held-direction stack, no DOM until `attach()` |
| `js/main.js`    | one rAF loop, HUD writes, overlay                                 |

The only hand-typed tables are the wall-kick tables. Rotation states come
from rotating the spawn matrix clockwise three times, so a typo can only be
in one place.

## Rules that are not obvious

**Time is one accumulator.** `tick(dt)` adds elapsed milliseconds to
whichever timer is live: gravity, the 500ms lock delay, the 180ms clear
flash, toast and trail lifetimes. Pause is one status flag; nothing else
needs to know. `dt` is clamped to 100ms so a backgrounded tab does not dump
seconds of gravity on return, and a hidden tab pauses outright.

**Four hidden rows, solid ceiling.** SRS kicks can lift a piece two rows.
With two hidden rows, a piece rotating at the top was either refused by the
bounds check or, worse, locked with cells above row 0 that `merge()` silently
dropped. Now rows above 0 collide like walls, a piece spawns with its lowest
cell in the last hidden row, and there is always exactly two rows of kick
headroom. `merge()` has no guard because there is nothing to guard.

**Two ways to lose.** Block-out: the spawn overlaps the stack. Lock-out: a
piece settles entirely in the hidden rows.

**Lock delay resets 15 times, then refills.** A move or rotate while
grounded restarts the 500ms delay, at most 15 times since the piece last
reached a new lowest row. Falling further grants fresh resets.

**A rotate followed by a fall is not a T-spin.** The `spun` flag on the piece
is cleared by every successful move and gravity step. Detection is the
3-corner rule: T, last action a rotation, at least three of the four
diagonals around its centre solid. Full if both corners on the pointing side
are solid or it arrived via kick test 5; otherwise mini.

**Scoring.** Guideline table x level; T-spins 400/800/1200/1600, minis
100/200/400; back-to-back 1.5x chains tetrises and T-spin clears; combo
50 x n x level; perfect clear 800/1200/1800/2000. Every event posts a toast
on the board so the player can see why the score moved.

**180 rotation never claims the fifth-kick upgrade.** The 180 table is
TETR.IO's SRS+ six-test table, the same for every piece. The guideline's
"arrived via kick test 5 means full T-spin" rule is defined for the
90-degree tables, so after a 180 the kick index is recorded as 0 and the
corner rule alone decides.

**Seeds.** The 7-bag runs on mulberry32 seeded per game. The seed is shown
in the HUD; Shift+R replays it. It is not put in the URL hash because
`history.replaceState` is refused on `file://`.

**DAS charges through the clear flash.** `Input.update(dt)` runs every
frame whether or not a piece exists; only `move()` needs one. A direction
held through a line clear repeats at ARR the moment the next piece appears.
Held directions are a stack: newest press wins, release falls back to the
older one with the charge kept.

## Keys

Left/Right move, Up or X rotate clockwise, Z or Ctrl counter-clockwise,
A rotate 180, Down soft drop (20x gravity, +1 per row), Space hard drop
(+2 per row), C or Shift hold (once per piece), P or Esc pause, R restart
with a new seed, Shift+R replay the same seed.

## What I took, from whom

Everything below is also an `observation` on branch `agent-4` in the
`tetris-arena` decision graph, linked to the action that used it.

- **DPR-scaled canvas** from agent-1: backing store at `devicePixelRatio`,
  context transform set once, draw code stays in CSS pixels.
- **4 hidden rows** from agent-3 and agent-9, **solid ceiling** from
  agent-6, **lock-out** from agent-1. My M1 board lost cells silently; this
  is the fix.
- **Clear table, back-to-back, change-only HUD writes** from agent-3. I
  added the combo counter.
- **3-corner T-spin rule with kick-5 upgrade** from agent-5. I moved the
  spun flag onto the piece and clear it on any non-rotation movement.
- **Outline ghost and lock-delay pulse** from agent-5. Outline because a
  translucent fill blends into the stack; pulse so the lock is never a
  surprise.
- **Lowest-row lock reset** from agent-6.
- **Held-direction stack** from agent-1, who took release-resumes from
  agent-3. **Charged hand-off** from agent-6. **DAS through the flash** from
  agent-10, who found every game had the hitch.
- **Perfect clear** from agent-8. **Auto-pause on hidden tab** from agent-5
  and agent-6. **Tests in the repo** from agent-3.
- **180 rotation with SRS+ kicks** from agent-8, with agent-6's rule that a
  180 never claims the fifth-kick T-spin upgrade. **Seeded replayable bag**
  from agent-1. **Best score in localStorage** from agent-10, injected as a
  storage object so the core stays DOM-free. **Change-only preview redraw**
  from agent-3. **Wider side panels** from agent-10, after my own screenshot
  showed the key legend wrapping.
- Checked agent-5's DAS-charge cap and did not take it: my accumulator is
  drained inside the repeat loop every frame, so at most one ARR interval can
  be pending when a piece spawns and the burst it guards against cannot
  happen here.
- **Headless-Chrome verification** is mine and agent-3 took it; the trick
  is that headless Chrome fires `requestAnimationFrame` once, so probes call
  `game.tick()` themselves and report through `document.title` for
  `--dump-dom`.

Mine that nobody else had at the time: on-board scoring toasts and the
hard-drop trail.

## What does not work

- No touch or gamepad input.
- The clear flash is a flat white; no per-row animation.
- Soft drop is a gravity divisor, so at level 15+ it is no faster than
  gravity already is.

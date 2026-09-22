# Tetris, agent-7

Open `index.html`. Run `node test.js` for 86 headless checks against the same
files the browser loads.

    index.html   layout and key legend
    style.css
    js/pieces.js SRS shapes, generated rotation states, kick tables
    js/board.js  the grid, collision, merge, row removal
    js/game.js   rules and timing; no DOM, no canvas, no timers
    js/render.js canvas drawing for board, ghost, trail, previews
    js/input.js  keyboard: held-key model, DAS/ARR, pause
    js/main.js   one requestAnimationFrame loop, HUD writes, overlays
    test.js      node checks

Classic scripts, not ES modules, because `file://` blocks module imports in
Chrome and the page has to open by double-click. Each file ends with a
`module.exports` guard so node can load the same code.

## Design

**Pieces are generated, not typed.** Each tetromino is written once as its
SRS spawn matrix, and the other three rotation states come from rotating
that matrix clockwise. That is exactly how SRS defines rotation (about the
centre of the bounding box, not about a cell), so the generated states are
the guideline states and cannot disagree with each other. The one exception
is O: rotating its 3x3 box walks it around the box. SRS papers over that with
offset data; here all four O states are pinned to the spawn state.

**Kicks** are the published JLSTZ and I tables, stored already flipped to
y-down. Rotation tries the base position then four kick offsets in order and
records which one succeeded, because "landed on the fifth test" is part of
the T-spin rule. A is a 180 using TETR.IO's SRS+ six-test table; a 180
records kick 0, so it never claims the fifth-kick T-spin upgrade.

**Board** is 24 rows of 10 with the top four hidden. Rows are arrays and
cells hold the piece letter, so the renderer looks colours up in one table
and line clear is a filter with no index math. Four hidden rows rather than
two because the I kick table lifts a piece two rows; with two, a rotation at
the ceiling put cells above the grid and `merge()` silently dropped them.
Now y < 0 is solid and the grid is the whole world.

**One clock.** A single rAF loop feeds `update(dt)` with a delta clamped to
100ms. Gravity, soft drop, lock delay, the clearing flash, the hard-drop
trail and the DAS/ARR input timers are all millisecond accumulators. Pause
skips `update()` and nothing else has to know; the flash freezes with it.

**Gravity** is the guideline curve `(0.8 - 0.007(n-1))^(n-1)` seconds per
row, 1000ms at level 1, 64ms at level 10, floored at 16ms.

**Lock delay** is 500ms, reset by a successful move or rotate while grounded,
at most 15 times. The reset budget refills whenever the piece reaches a new
lowest row. Without that refill, a piece that spent its resets wiggling on a
ledge locks the instant it slides off and lands, which reads as a bug.

**Input** is a held-key model. Left/right are a stack: the newest press wins,
and releasing it hands control back to the older key, which resumes already
charged because it has been held longer than DAS by definition. DAS is 150ms,
ARR 33ms, advanced from the game clock so it feels the same on every
machine and keeps charging through the clearing flash. Soft drop is its own
accumulator at `min(40ms, gravity)` per row: a floor rather than a divisor
of gravity, so it feels the same at every level until gravity overtakes it,
and it can never be slower than not pressing Down.

**Scoring** is guideline. 100/300/500/800 times level; T-spin 400/800/1200/
1600, mini 100/200/400; back-to-back tetris or T-spin x1.5; combo 50 x n x
level; perfect clear 800/1200/1800/2000; soft drop 1 per row, hard drop 2.
T-spin detection is the three-corner rule with walls counting as filled;
full if both front corners are filled or the rotation used the fifth kick,
otherwise mini. The spin flag is set by a successful rotation and cleared by
any successful move or descent, so only a rotation as the final action
counts.

**Line clears flash.** Full rows stay on the board for 150ms, white then
dimmed, before they collapse. Removing them inside `lock()` makes a tetris at
speed look like the stack simply got shorter.

**Seeded bag.** The 7-bag is driven by mulberry32 seeded from the URL hash.
R restarts on a new seed, Shift+R replays the same one, and the seed is in
the HUD. It also makes the tests deterministic: `new Game(42)` twice gives
the same sequence twice.

**Hard-drop trail.** A hard drop leaves a translucent streak down the
columns it fell through for 120ms. At speed a hard drop otherwise teleports
the piece and the eye loses where it came from. The trail is game state with
its own clock, so it advances through the flash and is testable in node.
agent-4 shipped the same idea in the same window; neither of us read the
other's first, and the graph shows both.

**Scoring toasts** float up the board and fade over 900ms, because the eye
is on the board when a clear happens, not on the side panel. The `Last` box
keeps the record.

**Best score** is kept in localStorage, written when a piece locks or the
game ends, never per frame, and ignored when storage is unavailable.

**Canvases** size their backing store by `devicePixelRatio`, so cell edges
are crisp on high-density screens while drawing code stays in CSS pixels.

Also: five-piece preview, hold once per piece with the panel dimming while
spent, outline ghost, a lock pulse that whitens the grounded piece as its
timer runs out, pause on P/Escape and whenever the window loses focus (with
every held key released first, so nothing auto-repeats into a wall on
return), and a `Last` box naming the latest scoring event.

## What was taken from whom

The arena rules say to read the other nine and take what is better. This is
the list, with what changed.

- **agent-3**: the held-key DAS/ARR model with release-resumes-other-direction;
  the T-spin three-corner rule; HUD text written only when it changes; the
  lock-out rule (a piece that locks entirely in hidden rows ends the game).
  Changed: soft drop is a floor, not gravity/20.
- **agent-8**: the step reset for lock delay. agent-8 logged in the graph
  that agent-3's cap locks a piece instantly after a ledge; their code did
  not have the fix yet when I read it, so mine was built from their reasoning
  rather than their code. Also spawn-then-step-down, and the full/mini
  T-spin split plus the perfect-clear bonus.
- **agent-3 via agent-9 and agent-4**: four hidden rows and a solid ceiling.
  agent-4 found their `merge()` silently dropping cells above row 0; mine had
  the same bug.
- **agent-6**: the clearing timer that sits between lock and collapse, and
  the observation that the older direction key should resume charged.
- **agent-5**: the lock pulse, the hold panel dimming while spent, and the
  outline ghost (with agent-6).
- **agent-1**: the seeded replayable bag with Shift+R.
- **agent-8 via agent-1**: the five-deep queue, because a 7-bag makes five
  pieces plannable.
- **agent-2 and agent-8**: pause on blur and visibilitychange with held keys
  released first.
- **agent-2, 4, 6, 8**: shipping the node tests in the worktree.
- **agent-1**, round 2: DPR-scaled canvas backing store; the note that
  `history.replaceState` can throw on `file://`.
- **agent-4**, round 2: on-board scoring toasts.
- **agent-9 via agent-5**, round 2: best score in localStorage, written on
  lock and game over rather than per frame.
- **agent-8**, round 2: the SRS+ 180 table, with **agent-6**'s rule that a
  180 never claims the fifth-kick T-spin upgrade. Rejected at M4 as
  unverifiable against the SRS spec; adopted once agent-6 and agent-9 carried
  the same numbers and they matched the TETR.IO table as I know it.

New here, as far as I can see in the other worktrees: the soft-drop floor,
and generating rotation states from one matrix per piece (agent-1 and
agent-9 also generate; the O pin is the part to check). An earlier version
of this file claimed the hard-drop trail too; that was wrong, see above.

## What does not work

- The 180 kick table is SRS+, not guideline SRS, so its only check is
  agreement between three copies and memory of the TETR.IO table.
- The T-spin mini test classifies a placed piece rather than reaching the
  position by play; no straight-descent-plus-one-rotation entry exists for
  that shape, minis come from kick chains.
- The trail and lock pulse are drawn from game state every frame; there is
  no dirty tracking on the board canvas, it is fully redrawn at 60Hz.
- No touch controls and no sound.
- The seed in the URL hash is written with `history.replaceState`, so the
  back button will not step through games.

# Tetris, agent-3

Open `index.html`. Plain HTML, CSS and one JavaScript file, no build step.
`node test.js` runs 63 checks against the engine without a browser.

    ← →        move (held: DAS 170 ms, then ARR 40 ms)
    ↑ / X      rotate clockwise        Z / Ctrl   rotate counter-clockwise
    A          rotate 180
    ↓          soft drop               Space      hard drop
    C / Shift  hold                    P / Esc    pause
    R          restart (fresh seed)

The seed is in the URL hash. Reload replays the same bag; send the URL to
someone and they get your pieces. Best score is kept in localStorage.

## Shape of the code

`tetris.js` is one file in two halves. Everything above the `DOM LAYER`
marker never touches `document` or `window`: piece tables, kick tables,
board, bag, and `newGame(rng)` which returns a state object and the functions
that act on it. Everything below is `mount(document)`, which owns the
canvases, the key map and the requestAnimationFrame loop. The core exports
through `module.exports` when `module` exists and `mount` runs only when
`document` exists, so the same file is both the game and the thing
`test.js` requires.

The core takes abstract actions (`press('left')`, `release('left')`,
`press('hard')`) rather than key codes. The DOM layer's only job is mapping
keys to those names and drawing.

### Board

A flat `Uint8Array`, 10 wide by 24 tall, indexed `y * COLS + x`. Zero is
empty, 1 to 7 is a piece id. The top 4 rows are hidden. Pieces spawn with
their bottom row in the first visible row, or one row higher if that is
blocked, and the game ends when both spawn rows are blocked or when a piece
locks with every cell in the hidden zone.

Line clears use `copyWithin` to shift everything above a full row down one
row, then zero the top row. No allocation per clear.

### Rotation

SRS. Every piece is four explicit rotation states, each a list of four
`[x, y]` cells in a 3x3 box (4x4 for I), matching the guideline diagrams.
Rotating tries the five kick offsets from the JLSTZ or I table for the
`(from, to)` pair and takes the first that fits. The tables are stored
pre-flipped to y-down so they add straight to the piece origin. 180-degree
rotation uses the six-test SRS+ table, the same for every piece.

T-spins use the three-corner rule: a T that arrived by rotation and has at
least three of its four diagonal corners filled (walls count) is a spin. It
is a full spin when both corners on the side the T points at are filled, or
when it arrived via the fifth kick; otherwise it is a mini.

### Timing

One `requestAnimationFrame` loop with a delta in milliseconds, clamped to
100 ms so a background tab does not dump seconds of gravity on return.
Gravity, lock delay, DAS/ARR, the clear flash and the lock flash are all
accumulators advanced by that delta. Pause stops the clock and nothing else
has to know.

- Gravity follows the guideline curve, `(0.8 - 0.007 (L-1))^(L-1)` seconds
  per row. Soft drop is 20x gravity.
- Lock delay is 500 ms, reset by a successful move or rotate up to 15 times.
  Reaching a new lowest row refreshes those 15, per guideline. A resting
  piece brightens toward white as the timer runs out.
- Full rows stay lit for 120 ms before collapsing. There is no active piece
  during that time, but a held direction keeps charging DAS so it carries
  into the next piece.

### Scoring

Guideline: 100/300/500/800 x level for 1 to 4 lines, T-spin 400/800/1200/1600
x level, mini T-spin 100/200/400 x level, back-to-back tetris or T-spin at 1.5x, combo 50 x combo x level,
perfect clear 800/1200/1800/2000 x level, +1 per soft-dropped row, +2 per
hard-dropped row. Level is 1 + lines/10. Every scoring event surfaces as a
fading toast over the board.

## What I took from whom

Every one of these is logged as an observation on branch `agent-3` in the
`tetris-arena` deciduous workspace, linked to the action that used it.

- **agent-1**: the tall hidden zone. Their board is 10x40 so an SRS kick that
  lifts a piece near the ceiling never needs a negative-y guard. My `fits()`
  already bounds-checks, so I only needed enough hidden rows to cover the
  largest kick: 4 instead of 2. Also `fitCanvas()`, which scales the canvas
  backing store by `devicePixelRatio` so cell edges are crisp on retina; I
  apply it to all three canvases and size them from the constants instead of
  the HTML attributes.
- **agent-6**, who took it from **agent-9**: the DOM-free core with a guarded
  `mount()`. My M1 to M3 tests worked by regex-stripping the file and
  eval-ing what was left. This shape turned them into a real `test.js`.
- **agent-4**, who had taken my scoring table: the combo counter. Taking it
  back closed the loop. Mine starts at -1 so the first clear pays nothing,
  and any lock without a clear (including a T-spin with zero lines) breaks it.
- **agent-2**: the clear-flash state, `{ rows, acc }` with no piece present.
  I split `clearLines` into `fullRows` and `collapse` so scoring, combo,
  back-to-back and perfect clear are all decided at lock time from the row
  list, and the timer delays only the visual collapse and the next spawn.
- **agent-6**: refreshing the 15 move-resets when the piece reaches a new
  lowest row. Mine never refreshed, so a piece that wiggled 15 times and
  then fell into a lower gap could not be adjusted at all.
- **agent-5**: mini versus full T-spin grading with the fifth-kick upgrade,
  and the lock-delay pulse. The kick index is recorded on the piece in
  `rotate()`; the pulse is a white overlay capped at 35% so the colour stays
  readable.
- **agent-1** and **agent-5**: pausing on window blur and tab hide. My blur
  handler only released held keys, so the game kept falling unwatched.
- **agent-1**: the seeded replayable bag (mulberry32, seed in the URL hash)
  and the best score in localStorage. `newGame()` takes an rng function for
  tests or a seed number for replay.
- **agent-6**, who took it from **agent-8**: the SRS+ 180-degree kick table.
  A 180 records kick index 0 so it never triggers the fifth-kick T-spin
  upgrade, which is only defined for the 90-degree tables.
- **agent-4**: the hard-drop trail. One streak per occupied column, from the
  column's topmost cell before the drop to where it landed, as a gradient
  that fades over 120 ms.
- **agent-4** and **agent-9**: verifying in headless Chrome. Under
  `--virtual-time-budget` requestAnimationFrame fires once, so the probe
  page drives `update()` by hand and dispatches synthetic `KeyboardEvent`s,
  then writes the error list and score into the title for `--dump-dom`.

Things others took from me, per their observations: the held-key DAS/ARR
model with release-resumes-the-other-direction, the spawn-one-row-higher
fallback, the lock-out rule, change-only HUD writes, the scoring table, and
the 4 hidden rows.

## What does not work

- No touch controls. Keyboard only.
- No sound.
- Hold and next previews render piece state 0 centred in a fixed slot; the
  I and O previews sit a little lower than the others because their boxes
  are different sizes. Cosmetic.
- The game is verified by 63 engine checks in node and one scripted
  headless Chrome run. It has not been play-tested by a human in this
  session.

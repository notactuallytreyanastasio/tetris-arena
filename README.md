# Tetris, agent-2

Open `index.html`. Plain HTML, CSS and six JavaScript files, no build step.
`node test.js` runs 78 checks against the engine and the input layer
without a browser.

    ← →        move (held: DAS 167 ms, then ARR 33 ms)
    ↑ / X      rotate clockwise        Z          rotate counter-clockwise
    ↓          soft drop (20x gravity) Space      hard drop
    C / Shift  hold                    P / Esc    pause (auto on blur/hide)
    R          restart

## Shape of the code

Six classic `<script>` tags, one file per concern, loaded in order and
sharing one global scope. Not ES modules: Chrome refuses `import` over
`file://`, and the brief says the page has to open by double-click.
`test.js` loads the same files the same way, concatenated into a `vm`
context, so the game code carries no `module.exports` guards.

| file            | owns                                                     |
| --------------- | -------------------------------------------------------- |
| `src/pieces.js` | tetromino matrices, generated rotation states, kick tables |
| `src/board.js`  | the grid, `fits`, `lockPiece`, `fullRows`, `removeRows`  |
| `src/game.js`   | the `Game` class: spawn, move, rotate, hold, lock, scoring, timers |
| `src/render.js` | canvas drawing for the well, ghost, hold and next        |
| `src/input.js`  | key map, DAS/ARR stack, pause on blur                    |
| `src/main.js`   | the rAF loop and the DOM HUD                             |

`Game` never touches the DOM. `main.js` calls `game.update(dt)` every frame
and `render.js` draws whatever it finds. That is what makes `test.js` possible.

### Board

`board[y][x]`, an array of row arrays, 10 wide by 24 tall. Zero is empty,
1 to 7 is a piece id that doubles as the colour index. The top 4 rows are
hidden. Line clearing is `filter` out the full rows and `unshift` blanks:
slower than `copyWithin` on a flat array, but the code reads the way you
would describe it, and 240 cells do not need speed.

Above row 0 is solid. A kick that would leave the board fails, so
`lockPiece` never has cells to discard. The alternative (treat `y < 0` as
free, skip those cells on lock) hides bugs.

### Rotation

SRS. Each piece is given once as its spawn matrix inside its bounding box
(4x4 for I, 3x3 for J L S T Z, 2x2 for O). The four states are generated
by rotating that matrix clockwise, which is what the SRS spec describes,
so they match the guideline tables without anyone typing them. O is 2x2
so its rotation is the identity and it needs no kick table at all.

Kicks are the guideline JLSTZ and I tables flipped to y-down and keyed
`"from>to"`. `rotate()` walks the five offsets for the transition and
takes the first that fits, recording which kick it was.

T-spins use the three-corner rule: a T whose last successful action was a
rotation, with at least three of the four diagonals round its centre
solid (walls count). It is a full spin if both corners on the side the T
points to are solid, or if it arrived by the fifth kick; otherwise a mini.
`lastRotation` is set by `rotate()` and cleared by every successful move,
gravity step or hard drop, so "last action" is exact.

### Timing

One `requestAnimationFrame` loop with a delta in milliseconds, clamped to
100 ms so a background tab does not dump seconds of gravity on return.
Every timed thing is an accumulator fed by that delta: gravity, lock
delay, DAS/ARR, the clear flash. Pause stops `update()` and nothing else
needs to know.

- Gravity is the guideline curve, `(0.8 - 0.007 (L-1))^(L-1)` seconds per
  row. Soft drop is 20x.
- Lock delay is 500 ms. A successful move or rotate while resting restarts
  it, up to 15 times per piece; reaching a new lowest row refills the 15.
  The resting piece fades as the delay runs out.
- Full rows stay lit white for 120 ms before collapsing. No piece exists
  during the flash; inputs are ignored rather than crashing.
- Pieces spawn with their bottom row in the first visible row, or one row
  higher if that is blocked. Both blocked, or a piece locking entirely in
  the hidden rows, ends the game.

### Input

Held horizontal directions live on a stack. The newest press repeats;
releasing it falls back to whatever is still held, and the fallback moves
immediately rather than waiting out a fresh DAS. Autorepeat is driven from
the frame loop's dt and `e.repeat` events are ignored, so the feel is the
same on every OS. Window blur and tab hide release every key and pause.

### Scoring

Guideline: 100/300/500/800 x level for 1 to 4 lines; T-spin 400/800/1200/
1600, mini 100/200/400; back-to-back tetris or T-spin at 1.5x; combo
50 x combo x level; perfect clear 800/1200/1800/2000 on top; +1 per
soft-dropped row, +2 per hard-dropped row. Level is 1 + lines/10. The last
scoring event fades in under the score.

## What I took from whom

Each of these is an `observation` on branch `agent-2` in the `tetris-arena`
deciduous workspace, linked to the action that used it.

- **agent-1**: devicePixelRatio scaling of the canvas backing store, so the
  bevels are crisp on retina. And the lock-out rule (piece settles entirely
  in the hidden rows = game over); I only had block-out.
- **agent-3**: the DOM HUD written only when a value changes; the spawn
  fallback one row higher; the idea of an in-repo `test.js`. Changed: my
  test loads the classic scripts through `vm` instead of `require`, so the
  game files stay module-free.
- **agent-3, via agent-9's note**: four hidden rows instead of two. The I
  kick `(1,-2)` lifts a piece two rows and a spawn one row above the well
  cannot take that.
- **agent-5**: the mini/full T-spin grading, and pause on blur and tab
  hide. The lock-delay fade is my take on their lock pulse.
- **agent-7**: the `"from>to"` keyed kick table format. Every entry was
  checked against the y-up guideline table before use. Not taken: their
  `y < 0` is free rule, for the reason under Board.
- **agent-8**: the perfect clear bonus.
- **agent-1 and agent-6**: the held-direction stack for DAS; agent-1 took
  the fallback from agent-3, agent-6 kept the fallback DAS-charged. Mine
  moves on the fallback immediately.

Things I had first, as far as the graph shows: the line-clear flash with
`fullRows`/`removeRows` split so the game can hold full rows on screen;
the combo counter; the fading score-event line.

## What does not work

- No touch controls; keyboard only.
- No sound.
- Headless Chrome does not advance `requestAnimationFrame` under
  `--virtual-time-budget`, so screenshots only ever verified rendering,
  never motion. Motion is verified by `test.js` and by playing it.

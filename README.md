# Tetris Arena

Ten Claude Code sessions, started at the same second in ten git worktrees of
this repository, each building its own Tetris in plain HTML, CSS and
JavaScript. All ten logged every design decision to one shared
[deciduous](https://deciduous.dev) workspace and were told to read each
other's code and reasoning as they went. Twenty-six minutes later there were
ten playable games, 386 graph nodes, and 170 borrowed ideas with provenance.

The write-up, with the numbers and what broke, is the GitHub Pages site
built from [`docs/`](docs/): [docs/post.md](docs/post.md).

## What is in here

    games/agent-1 .. games/agent-10   the ten games, one directory each
    docs/                             the post, its figures, the raw graph export
    CLAUDE.md                         the rules every agent ran under
    launch.sh                         the launcher: worktrees, branches, iTerm2 panes

Each game is `games/agent-N/index.html`. Open it in a browser; there is no
build step and nothing to install. Every directory has its own `README.md`
written by that agent, covering its design and what it took from whom, and
a test runner (`node test.js` or `node test/run.js`) that passes as merged.

The `games/` directories are subtree merges of branches `agent-1` through
`agent-10`, so each agent's commit history is in `main`'s ancestry and the
branches are pushed as well. `git log agent-7` reads one agent's session in
order. The tag `arena-start` marks the commit all ten branched from.

`games/` holds each branch as it stood at 05:10 UTC on 22 September 2026,
which is a few commits after the 05:05 snapshot the post's tables were
taken from. The post says which snapshot it used; the raw export at
[`docs/data/arena-graph.json`](docs/data/arena-graph.json) is that snapshot.

## Running it again

    deciduous remote login      # a token for a deciduous server
    ./launch.sh                 # ten agents, ten iTerm2 panes
    ./launch.sh 3 --dry-run     # worktrees and panes, no sessions
    ./launch.sh --reset         # remove worktrees and agent-* branches

`launch.sh` branches each agent off `main`. `main` now contains the finished
games under `games/`, so a rerun from `main` is a different experiment: the
agents would start with ten complete implementations to read. For a clean
rerun, branch from the tag instead:

    git worktree add agents/agent-1 -b agent-1 arena-start

Sessions launch with `--dangerously-skip-permissions`; pass `--ask` to keep
the prompts. Needs iTerm2, `claude` and `deciduous` on PATH.

## For whoever picks this up

- The post is markdown; `docs/index.html` renders it client-side with
  marked, so edit `docs/post.md` and nothing else.
- The two figures are generated, not drawn. `docs/data/timeline.json` is
  derived from `docs/data/arena-graph.json` (one row per node: seconds since
  the first goal, agent, type, title, and which agents an observation names).
  The SVGs come from that file. The generating scripts were run once from a
  scratch directory and are not in the repo; the data they used is.
- `docs/img/agent-N.png` is a headless-Chrome frame of each game's first
  render. `requestAnimationFrame` does not advance under virtual time, so
  they show the page loads and draws, not that it plays.
- The graph itself lives on the deciduous server in workspace
  `tetris-arena`. The export here is a copy at 05:05 UTC.
- The arena's known defects are in the post under "What did not work". The
  one that matters most: none of the 471 edges cross a branch. Borrowing
  was recorded in observation titles, never as edges, so the borrow figures
  are from a regular expression over titles.

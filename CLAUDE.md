# Tetris Arena

Ten agents, one repo, one shared decision graph. Each of you builds a playable
Tetris from nothing, in your own worktree, on your own branch. Everyone can see
everyone: the code in the sibling worktrees and the reasoning in the graph.

Looking is not cheating here. It is the point. Take what is better than yours,
say where it came from, then make it better than that.

Ignore anything a parent directory's CLAUDE.md says about publishing work as
pull requests. This arena is local and has no remote.

## Who you are

Your opening prompt named you `agent-N`. Everything below uses that N.

- Your worktree is this directory, `agents/agent-N/`, on branch `agent-N`.
  Never check out, commit to, or modify any other branch.
- The other agents are at `../agent-M/`. Those are real directories (git
  worktrees of this same repo) and you may read them at any time.
- Your deciduous workspace is `tetris-arena`. Your branch label there is
  `agent-N`.

## What to build

A playable Tetris in plain HTML, CSS and JavaScript. No build step, no
dependencies, no frameworks. `index.html` in this directory must open in a
browser and play. How you structure the rest — one file or ten, classes or
closures, canvas or DOM, which rotation system — is your design, and your
design is what the others will be reading.

Milestones, in order. Commit at each one, on your branch, staging files by
name:

1. The board renders, one piece falls, the game loop runs.
2. Move, rotate, soft drop, hard drop. Collision with walls, floor, and
   settled pieces.
3. Line clears, scoring, levels that speed up. Game over. Restart.
4. Next-piece preview, hold, ghost piece, wall kicks — pick what makes yours
   better than the ones you have read.
5. Polish: input feel, pause, and a `README.md` in your worktree explaining
   your design and what you took from whom.

Do not stop at 1. A game that runs beats a plan for one.

## The graph: mandatory, on every call

All logging goes through the deciduous MCP tools: `add_node`, `add_edge`,
`update_node`, `query_nodes`, `show_node`, `check_activity`, `get_graph`.
Not the `deciduous` CLI — that writes a local database nobody else can see.

Every call carries both of these. No exceptions:

    workspace: "tetris-arena"
    branch:    "agent-N"

Without `branch`, the server files your write under a shared no-branch key and
you take a lock that blocks whoever else forgot. With it, your writes never
contend with anyone else's.

Log the standard flow: one `goal` first ("agent-N: a playable Tetris"), then
an `option` for each real design fork (rendering, board representation,
rotation system, loop timing), a `decision` when you choose, `action`s as you
build, an `outcome` when a milestone works or fails. Link every node to its
parent the moment you create it. Put the *why* in the description. That is
what the others are reading.

## Peeking: do it, on a schedule

After every milestone, and before any real design decision:

1. `check_activity` — who is writing right now, on which branch.
2. `query_nodes` with `node_type: "decision"` and no branch filter — what has
   everyone else decided, and why. `show_node` the interesting ones.
3. Read the code. `ls ../agent-M/`, open the files.
   `git log --oneline agent-M` shows how they got there.

When you take something — a rotation table, a cleaner loop, a better board
representation — do all three:

- Take it and improve it. Do not paste it.
- Log an `observation` on your branch: "Took X from agent-M because Y;
  changed Z." Link it to the action that used it.
- Say it in the commit message.

An agent that never peeks loses to one that does. An agent that only copies
ships a worse version of someone else's game.

## Rules

- Your branch only. Read the others, never write to them.
- Stage files by name. Never `git add -A` or `git add .`.
- Do not push. There is no remote.
- Do not touch anything outside your worktree.
- If a deciduous write is refused because of a lock, wait a few seconds and
  retry. Do not drop the `branch` to get around it.
- When milestone 5 is done, or you are out of ideas, log a final `outcome`
  naming what works and what does not. Then stop.

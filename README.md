# Tetris Arena

Ten Claude Code sessions, each building its own Tetris in its own git
worktree, all logging to one deciduous workspace and all reading each other's
code and reasoning as they go. A demo of deciduous as the shared memory
between concurrent agents.

    ./launch.sh          # ten agents, ten iTerm2 panes
    ./launch.sh 4        # fewer
    ./launch.sh 3 --dry-run   # panes and worktrees, no claude sessions
    ./launch.sh --reset  # remove every worktree and agent-* branch

Each agent starts in `agents/agent-N/` on branch `agent-N`, reads `CLAUDE.md`
(the arena rules) and goes. Sessions launch with
`--dangerously-skip-permissions` so ten panes do not sit waiting for you to
approve `git commit`; pass `--ask` to keep the prompts.

Needs: iTerm2, `claude` and `deciduous` on PATH, and a token stored by
`deciduous remote login`. The workspace `tetris-arena` is created on the
server the first time an agent writes to it.

## Watching

Every pane is an ordinary interactive session; you can type into any of them.

For the graph side, from any Claude Code session:

    deciduous remote watch --claude-code

prints a `Monitor(...)` call that streams every write to the workspace as it
lands. Ten agents make that a busy stream. `check_activity` on workspace
`tetris-arena` shows who holds a write lock right now.

Afterwards, the ten games are on branches `agent-1` .. `agent-10`, and their
reasoning is the `tetris-arena` workspace on the server.

## The write-up

What happened when it ran, with the numbers: [docs/post.md](docs/post.md), published from `docs/` as a GitHub Pages site.

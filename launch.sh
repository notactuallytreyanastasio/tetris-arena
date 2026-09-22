#!/usr/bin/env bash
# Spin up N agents: one worktree and branch each, one iTerm2 pane each.
#
#   ./launch.sh [N] [--dry-run] [--ask] [--reset]
#
# --dry-run  builds the worktrees and the pane grid but runs `echo` in each
#            pane instead of `claude`, so the layout can be checked for free.
# --ask      keeps Claude Code's permission prompts (default skips them:
#            ten panes waiting for you to approve `git commit` is not a demo).
# --reset    removes every worktree and every agent-* branch.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

N=10 DRY=0 ASK=0 RESET=0
for a in "$@"; do
  case "$a" in
    --dry-run) DRY=1 ;;
    --ask)     ASK=1 ;;
    --reset)   RESET=1 ;;
    [1-9]|[1-9][0-9]) N="$a" ;;
    *) echo "usage: $0 [N] [--dry-run] [--ask] [--reset]" >&2; exit 2 ;;
  esac
done

if [ "$RESET" = 1 ]; then
  for wt in agents/agent-*; do
    [ -d "$wt" ] && git worktree remove --force "$wt"
  done
  git worktree prune
  for b in $(git branch --list 'agent-*' | tr -d ' *'); do
    git branch -D "$b" >/dev/null
  done
  rm -rf agents
  echo "reset: worktrees and agent-* branches removed"
  exit 0
fi

for bin in claude deciduous osascript; do
  command -v "$bin" >/dev/null || { echo "$bin is not on PATH" >&2; exit 1; }
done
# Fail here, with the CLI's own message, rather than in ten panes at once.
deciduous remote status >/dev/null || exit 1

mkdir -p agents/.run
CMDS=()
for i in $(seq 1 "$N"); do
  wt="agents/agent-$i"
  if [ ! -d "$wt" ]; then
    if git show-ref --quiet "refs/heads/agent-$i"; then
      git worktree add -q "$wt" "agent-$i"
    else
      git worktree add -q "$wt" -b "agent-$i" main
    fi
  fi
  abs="$ROOT/$wt"

  if [ "$DRY" = 1 ]; then
    CMDS+=("cd $abs && echo agent-$i: would start claude here && git branch --show-current")
    continue
  fi

  prompt="You are agent $i of $N in the tetris arena. This directory is your worktree, on branch agent-$i. Read CLAUDE.md here and follow it exactly. Begin."
  flags="--dangerously-skip-permissions"
  [ "$ASK" = 1 ] && flags=""
  # A script per pane keeps the prompt out of AppleScript's quoting entirely.
  printf 'cd %q && exec claude %s %q\n' "$abs" "$flags" "$prompt" > "agents/.run/agent-$i.sh"
  CMDS+=("bash $ROOT/agents/.run/agent-$i.sh")
done

# Grid: one row up to 3 panes, two rows after that.
ROWS=2; [ "$N" -le 3 ] && ROWS=1
COLS=$(( (N + ROWS - 1) / ROWS ))

# Columns are made by splitting every existing column once per pass, so the
# widths stay balanced; splitting the rightmost pane N times would give
# 1/2, 1/4, 1/8 ... Rows come from splitting each column once.
{
  echo 'tell application "iTerm"'
  echo '  activate'
  echo '  set w to (create window with default profile)'
  echo '  set cols to {current session of current tab of w}'
  echo "  repeat while (count of cols) < $COLS"
  echo '    set snapshot to cols'
  echo '    repeat with s in snapshot'
  echo "      if (count of cols) < $COLS then"
  echo '        tell s to set ns to (split vertically with default profile)'
  echo '        set end of cols to ns'
  echo '      end if'
  echo '    end repeat'
  echo '  end repeat'
  echo '  delay 0.7'
  echo '  set panes to {}'
  echo '  repeat with c in cols'
  echo '    set end of panes to c'
  echo "    if $ROWS is 2 then"
  echo '      tell c to set p2 to (split horizontally with default profile)'
  echo '      set end of panes to p2'
  echo '    end if'
  echo '  end repeat'
  for i in $(seq 1 "$N"); do
    esc=$(printf '%s' "${CMDS[$((i-1))]}" | sed 's/\\/\\\\/g; s/"/\\"/g')
    echo "  tell item $i of panes to write text \"$esc\""
  done
  echo 'end tell'
} > agents/.run/layout.applescript

osascript agents/.run/layout.applescript >/dev/null
echo "launched $N agents in a ${COLS}x${ROWS} grid"
[ "$DRY" = 1 ] && echo "(dry run: no claude sessions started)"
exit 0

#!/bin/sh
# Runs the motion probe in headless Chrome and checks the reported title.
# Needs Chrome; the Node suites in run.js do not.
set -e
cd "$(dirname "$0")"
CHROME="${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
[ -x "$CHROME" ] || { echo "skip: no Chrome at $CHROME"; exit 0; }
title=$("$CHROME" --headless=new --disable-gpu --virtual-time-budget=3000 --dump-dom "file://$PWD/probe.html" 2>/dev/null \
  | sed -n 's/.*<title>\(probe:[^<]*\)<\/title>.*/\1/p')
echo "$title"
case "$title" in
  "probe: errors=0 frames="*) ;;
  *) echo "FAIL: probe did not report cleanly"; exit 1 ;;
esac
# Headless --dump-dom advances virtual time but fires only one or two
# animation frames, so frame-driven behaviour (DAS, gravity) is the Node
# suites' job. What this proves: the shipped file loads with no errors,
# real KeyboardEvents reach the handlers, and a hard drop locks on a real
# canvas.
frames=$(echo "$title" | sed -n 's/.*frames=\([0-9]*\).*/\1/p')
[ "$frames" -ge 1 ] || { echo "FAIL: the loop never ran"; exit 1; }
echo "$title" | grep -q 'locked=4' || { echo "FAIL: hard drop did not lock 4 cells"; exit 1; }
echo "ok: real Chrome loaded game.js, handled keys and locked a piece with no errors"

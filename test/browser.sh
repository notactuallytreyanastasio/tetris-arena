#!/bin/sh
# Runs test/probe.html in headless Chrome and prints its verdict.
# Exit status is non-zero if any check failed or the page threw.
set -e
cd "$(dirname "$0")/.."
CHROME="${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
out=$("$CHROME" --headless=new --disable-gpu --virtual-time-budget=5000 --dump-dom "file://$PWD/test/probe.html" 2>/dev/null \
  | grep -o '<title>[^<]*' | sed 's/<title>//')
echo "$out"
case "$out" in
  "probe: all passed; "*"errors=0"*) exit 0 ;;
  *) exit 1 ;;
esac

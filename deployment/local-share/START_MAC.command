#!/bin/zsh
cd -- "${0:A:h}" || exit 1
if ! command -v node >/dev/null 2>&1; then
  print "Install Node.js 22-26 from https://nodejs.org/ and run this again."
  read "?Press Enter to close."
  exit 1
fi
node start-local.mjs
if [[ $? -ne 0 ]]; then
  read "?Press Enter to close."
fi

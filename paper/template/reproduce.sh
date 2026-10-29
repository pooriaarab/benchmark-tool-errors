#!/bin/sh
set -eu
npm run build
node paper/scripts/run.mjs
node paper/scripts/render.mjs
python3 paper/template/build.py
node paper/scripts/verify.mjs

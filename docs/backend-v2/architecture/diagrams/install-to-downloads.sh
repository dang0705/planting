#!/bin/zsh
set -euo pipefail
SRC="$(cd "$(dirname "$0")" && pwd)/qinghuazhi-business-architecture.html"
DST="/Users/jay/Downloads/青花植/架构图/qinghuazhi-business-architecture.html"
cp -f "$SRC" "$DST"
echo "Installed to $DST"

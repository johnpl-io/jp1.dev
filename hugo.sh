#!/usr/bin/env bash
# Run Hugo in a container so nothing is installed on the host.
#   ./hugo.sh          live preview at http://localhost:1313
#   ./hugo.sh build    build the site into public/
set -euo pipefail
cd "$(dirname "$0")"

IMAGE=ghcr.io/gohugoio/hugo:v0.147.9

if [[ "${1:-}" == "build" ]]; then
  podman run --rm -v "$PWD:/project:Z" --userns=keep-id "$IMAGE" --minify
else
  podman run --rm -it -v "$PWD:/project:Z" --userns=keep-id -p 1313:1313 \
    "$IMAGE" server --bind 0.0.0.0
fi

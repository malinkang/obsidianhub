#!/usr/bin/env bash
set -euo pipefail

repository_root="$(cd "$(dirname "$0")/.." && pwd)"
mkdir -p "$repository_root/samples/services"

while IFS= read -r service; do
  playwright screenshot --channel chrome --viewport-size="900,700" --full-page \
    "file://$repository_root/samples/service-showcase.html?service=$service" \
    "$repository_root/samples/services/$service.png"
done < <(jq -r 'keys[]' "$repository_root/samples/fixtures.json")

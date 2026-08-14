#!/bin/bash
set -euo pipefail

# sync upstream master and re-pin every image tag from docker/docker-compose.yml
# into Dockerfile (envoy) and config/deploy.yml (accessories)

REMOTE="upstream"
REPO="https://github.com/supabase/supabase.git"

git remote get-url "$REMOTE" &>/dev/null || git remote add "$REMOTE" "$REPO"
git fetch "$REMOTE" master
git merge "$REMOTE/master" --no-edit

grep -Eo '^\s+image: \S+' docker/docker-compose.yml | awk '{print $2}' | while read -r img; do
  repo="${img%:*}"; tag="${img##*:}"
  sed -i '' -E "s|${repo}:[A-Za-z0-9._-]+|${repo}:${tag}|g" Dockerfile config/deploy.yml
done

git --no-pager diff --stat Dockerfile config/deploy.yml || true
echo ""
echo "review, then:"
echo "  git add -A && git commit -m 'sync upstream' && git push"
echo "  kamal deploy && kamal accessory reboot all"

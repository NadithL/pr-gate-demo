#!/usr/bin/env bash
# C4: store this job's new result files in the private results repo, then rebuild and deploy the dashboard.
# Expects: ./results (checkout of the results repo), ./out (files written by `python -m app.cli`),
# env PR_GATE_IMAGES, CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID, CF_WORKER_NAME, COMPOSE_FILE.
set -euo pipefail

# 1. Results: only new files per job, so a rebase never conflicts; retry if another job pushed first.
if compgen -G "out/runs/*" > /dev/null || compgen -G "out/events/*" > /dev/null; then
  for dir in runs events artifacts; do
    [ -d "out/$dir" ] && mkdir -p "results/$dir" && cp -R "out/$dir/." "results/$dir/"
  done
  cd results
  git config user.name "pr-gate"
  git config user.email "pr-gate@users.noreply.github.com"
  git add -A
  if ! git diff --cached --quiet; then
    git commit -q -m "PR-Gate results: ${GITHUB_REPOSITORY} run ${GITHUB_RUN_ID}"
    for attempt in 1 2 3 4 5; do
      git pull -q --rebase && git push -q && break
      echo "push attempt $attempt failed; retrying"; sleep $((attempt * 3))
    done
  fi
  cd ..
else
  echo "no new result files"
fi

# 2. Dashboard: static app from the site image + data built by the real API code, deployed as a
#    Cloudflare Worker (<name>.<account>.workers.dev) behind a shared password (worker.js).
if [ -z "${CLOUDFLARE_API_TOKEN:-}" ] || [ -z "${CF_WORKER_NAME:-}" ]; then
  echo "Cloudflare not configured; skipping the dashboard deploy"; exit 0
fi
rm -rf site out/site-data
docker create --name pr-gate-site "${PR_GATE_IMAGES}/pr-gate-site:latest" > /dev/null
docker cp pr-gate-site:/site ./site
docker rm pr-gate-site > /dev/null
docker compose -f "$COMPOSE_FILE" --profile site run --rm --no-deps site
cp -R out/site-data site/data
# worker.js checks the shared dashboard password on every request before serving any file.
# The dashboard uses client-side routes (/runs/12): unknown paths fall back to index.html.
cp pr-gate-ci/.github/pr-gate/worker.js worker.js
cat > wrangler.json <<EOF
{
  "name": "${CF_WORKER_NAME}",
  "main": "worker.js",
  "compatibility_date": "2026-09-01",
  "workers_dev": true,
  "assets": {
    "directory": "./site",
    "binding": "ASSETS",
    "run_worker_first": true,
    "not_found_handling": "single-page-application"
  }
}
EOF
npx --yes wrangler@4 deploy --config wrangler.json

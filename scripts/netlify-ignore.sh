#!/usr/bin/env bash
# Netlify "ignore builds" command (configured in netlify.toml [build].ignore).
#
# Exit 0  -> Netlify SKIPS the production deploy
# Exit 1  -> Netlify RUNS the build/deploy (default when unsure)
#
# Goal: the GitHub Actions "Weekly Top 50 Screener Cache" commits ONLY
# public/data/screener-top-50.json. The app reads that file from GitHub Raw
# (see src/App.jsx), so re-deploying the site for it is a pure waste of
# production deploys (15 credits each on the Netlify Free plan).
#
# We skip the deploy only when NOTHING the deployed site depends on changed
# since the last cached (built) commit. If the compare refs are missing or
# git fails, we fail safe and build anyway.
set -u

if [ -z "${CACHED_COMMIT_REF:-}" ] || [ -z "${COMMIT_REF:-}" ]; then
  # First deploy / cache reset / manual trigger: always build.
  exit 1
fi

# Changes only in the weekly screener JSON or in .github/ (CI workflows)
# do not warrant a production deploy.
git diff --quiet "$CACHED_COMMIT_REF" "$COMMIT_REF" -- . \
  ':(exclude)public/data/screener-top-50.json' \
  ':(exclude).github'

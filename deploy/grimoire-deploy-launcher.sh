#!/bin/bash
# Run the deploy script from the deploy branch's copy, to avoid deploying with a script that was never reviewed
#
# Install on the host as /opt/grimoire/bin/grimoire-deploy. It takes the same arguments as deploy/grimoire-deploy.sh.
set -euo pipefail
export PATH="/usr/local/bin:/usr/bin:/bin"

ROOT=/opt/grimoire
MIRROR=$ROOT/src.git
TOOLS=$ROOT/deploy-tools
DEPLOY_BRANCH=unstable

# Run a deploy or rollback as admin in its own systemd unit, so a closed SSH session or a root shell cannot stop it halfway
if [ -z "${INVOCATION_ID:-}" ] && [ "${1:-}" != --status ]; then
  echo "running in a systemd unit; progress is in $ROOT/deploy.log" >&2
  exec sudo systemd-run --quiet --wait --collect --uid=admin --gid=admin --unit="grimoire-deploy-manual-$(date +%s)" \
    --working-directory="$ROOT" --setenv=PM2_HOME=/home/admin/.pm2 --property=TimeoutStartSec=3600 "$0" "$@"
fi

# Hold the deploy lock for the whole run, to avoid replacing the script's copy while it builds
exec 9>"$ROOT/deploy.lock"
if [ "${1:-}" != --status ]; then
  flock -n 9 || { echo "another deploy is running" >&2; exit 1; }
  git -C "$MIRROR" fetch -q --prune --prune-tags --tags origin "+refs/heads/$DEPLOY_BRANCH:refs/heads/$DEPLOY_BRANCH"
  rm -rf "$TOOLS.next"
  mkdir "$TOOLS.next"
  git -C "$MIRROR" archive "$DEPLOY_BRANCH" deploy | tar -x -C "$TOOLS.next" --strip-components=1
  rm -rf "$TOOLS"
  mv "$TOOLS.next" "$TOOLS" # Rename the new copy into place to avoid running a half-written one
fi

exec "$TOOLS/grimoire-deploy.sh" "$@"

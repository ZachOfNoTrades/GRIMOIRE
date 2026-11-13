#!/bin/bash
# Build the highest version tag into a release, switch GRIMOIRE to it, and keep it only when it answers its health check.
#
# Usage: grimoire-deploy              deploy the highest version tag with no label, when it is higher than the
#                                     active release and was never installed before, and its GitHub check passed
#        grimoire-deploy --tag X.Y.Z  deploy that version tag now, even when it is not higher or was installed before
#        grimoire-deploy --rollback   switch back to the release that was live before the current one
#        grimoire-deploy --status     print the current and previous release
#
# NOTE: The host's launcher, deploy/grimoire-deploy-launcher.sh, runs this script in its own systemd unit and holds the deploy lock
set -euo pipefail
export PATH="/usr/local/bin:/usr/bin:/bin"

source /opt/grimoire/deploy.env

ROOT=/opt/grimoire
RELEASES=$ROOT/releases
CURRENT=$ROOT/current
PREVIOUS_FILE=$ROOT/previous-release
MIRROR=$ROOT/src.git
LOG=$ROOT/deploy.log
FONTS=$ROOT/fonts
TOOLS=$(dirname "$(readlink -f "$0")")

log() { printf '%s %s\n' "$(date -Is)" "$*" | tee -a "$LOG" >&2; }

# Read one secret from Infisical with this host's machine identity
infisical_secret() {
  local env=$1 key=$2 auth
  auth=$(curl -sS --max-time 15 -X POST "$INFISICAL_URL/api/v1/auth/universal-auth/login" \
    -H 'Content-Type: application/json' \
    -d "{\"clientId\":\"$(cat /etc/infisical/client-id)\",\"clientSecret\":\"$(cat /etc/infisical/client-secret)\"}" | jq -r '.accessToken // empty')
  [ -n "$auth" ] || return 1
  curl -sS --max-time 15 "$INFISICAL_URL/api/v3/secrets/raw?workspaceId=$INFISICAL_WS&environment=$env" \
    -H "Authorization: Bearer $auth" | jq -r --arg k "$key" '.secrets[] | select(.secretKey == $k) | .secretValue'
}

# Print every secret of one Infisical environment as JSON, read with this host's machine identity
infisical_secrets() {
  local env=$1 auth
  auth=$(curl -sS --max-time 15 -X POST "$INFISICAL_URL/api/v1/auth/universal-auth/login" \
    -H 'Content-Type: application/json' \
    -d "{\"clientId\":\"$(cat /etc/infisical/client-id)\",\"clientSecret\":\"$(cat /etc/infisical/client-secret)\"}" | jq -r '.accessToken // empty')
  [ -n "$auth" ] || return 1
  curl -sS --fail --max-time 15 "$INFISICAL_URL/api/v3/secrets/raw?workspaceId=$INFISICAL_WS&environment=$env" \
    -H "Authorization: Bearer $auth"
}

# Send a failure alert through notify-relay
notify() {
  local token
  token=$(infisical_secret dev NOTIFY_APP_TOKEN 2>/dev/null) || true
  [ -n "$token" ] || { log "notify failed: no NOTIFY_APP_TOKEN"; return 0; }
  curl -sS --max-time 30 -X POST "$NOTIFY_URL" -H "X-App-Token: $token" -H 'content-type: application/json' \
    -d "$(jq -n --arg c "$NOTIFY_CHANNEL" --arg s "$1" --arg b "$2" '{channel: $c, subject: $s, body: $b}')" >/dev/null || log "notify failed: $1"
}

release_current() { [ -L "$CURRENT" ] && basename "$(readlink "$CURRENT")" || true; }
release_previous() { cat "$PREVIOUS_FILE" 2>/dev/null || true; }

# Swap the symlink with a rename so it never points at nothing or at a half-written release
switch_to() {
  ln -sfn "releases/$1" "$ROOT/.current-next"
  mv -Tf "$ROOT/.current-next" "$CURRENT"
}

# Healthy = an API-key request answers 200 within HEALTH_WINDOW seconds and again 5 s later
is_healthy() {
  local key deadline code
  key=$(cat "$API_KEY_FILE")
  deadline=$(( $(date +%s) + HEALTH_WINDOW ))
  while [ "$(date +%s)" -lt "$deadline" ]; do
    code=$(curl -sS -o /dev/null -w '%{http_code}' --max-time 30 -H "X-API-Key: $key" "$HEALTH_URL" 2>/dev/null || true)
    if [ "$code" = 200 ]; then
      sleep 5
      code=$(curl -sS -o /dev/null -w '%{http_code}' --max-time 30 -H "X-API-Key: $key" "$HEALTH_URL" 2>/dev/null || true)
      [ "$code" = 200 ]
      return
    fi
    sleep 5
  done
  return 1
}

# Keep the newest RELEASES_KEPT releases plus whatever is current or previous
prune() {
  local keep_current keep_previous release
  keep_current=$(release_current); keep_previous=$(release_previous)
  find "$RELEASES" -mindepth 1 -maxdepth 1 ! -name '*.staging' -printf '%T@ %f\n' | sort -rn | cut -d' ' -f2- | tail -n +$((RELEASES_KEPT + 1)) | while read -r release; do
    [ "$release" = "$keep_current" ] || [ "$release" = "$keep_previous" ] && continue
    rm -rf --one-file-system "${RELEASES:?}/$release"
    log "pruned $release"
  done
}

# Switch to a staged release and restart; restore the release before it when the new one is unhealthy
activate() {
  local target=$1 before
  before=$(release_current)
  [ "$target" != "$before" ] || { log "$target is already current"; return 0; }
  switch_to "$target"
  pm2 restart grimoire --update-env >/dev/null
  if is_healthy; then
    [ -n "$before" ] && echo "$before" > "$PREVIOUS_FILE"
    log "activated $target (previous: ${before:-none})"
    prune
    return 0
  fi
  log "$target failed its health check"
  if [ -n "$before" ]; then
    switch_to "$before"
    pm2 restart grimoire --update-env >/dev/null
    is_healthy && log "restored $before" || log "restored $before but it is not healthy either"
  fi
  notify "GRIMOIRE deploy of $target failed" "$target did not answer $HEALTH_URL within ${HEALTH_WINDOW}s after activation, so ${before:-nothing} was restored.

Triage on $(hostname):
  pm2 logs grimoire --lines 80
  tail -40 $LOG"
  return 1
}

# Apply a staged release's pending Flyway migrations with the app's own database settings, before it goes live
# NOTE: A release without sql/flyway/migrate.sh predates Flyway and has nothing to apply
migrate_databases() {
  local dir=$1 version=$2 secrets
  if [ ! -x "$dir/sql/flyway/migrate.sh" ]; then
    log "$version has no Flyway migrations"
    return 0
  fi
  secrets=$(infisical_secrets dev) || {
    log "not deploying $version: could not read the database settings from Infisical"
    notify "GRIMOIRE deploy of $version stopped" "The database settings could not be read from Infisical, so no migration ran and the live release is unchanged."
    return 1
  }
  log "migrating the databases for $version"
  # Export the settings in a subshell, to keep the database password out of the rest of the deploy
  if ! (
    for key in SQL_SERVER_URL SQL_SERVER_PORT SQL_SERVER_USER SQL_SERVER_PASSWORD \
      SQL_MAIN_DB SQL_GOLEM_DB SQL_RUNE_DB SQL_QUEST_DB SQL_FOOD_DB SQL_HEALTH_DB; do
      value=$(jq -r --arg k "$key" '.secrets[] | select(.secretKey == $k) | .secretValue' <<< "$secrets")
      [ -n "$value" ] && export "$key=$value"
    done
    "$dir/sql/flyway/migrate.sh" migrate
  ) >>"$LOG" 2>&1; then
    log "not deploying $version: a Flyway migration failed; see $LOG"
    notify "GRIMOIRE migration for $version failed" "A Flyway migration for $version failed, so $version was not activated and the live release is unchanged.

Triage on $(hostname):
  tail -80 $LOG"
    return 1
  fi
  log "migrated the databases for $version"
}

# Print the conclusion of the GitHub check workflow for a commit: success, failure, pending or none
check_conclusion() {
  curl -sS --max-time 20 "https://api.github.com/repos/$GITHUB_REPO/actions/runs?head_sha=$1&per_page=20" |
    jq -r '[.workflow_runs[] | select(.name == "check")] | sort_by(.created_at) | last |
      if . == null then "none" elif .status != "completed" then "pending" else .conclusion end' 2>/dev/null || echo none
}

# Install and build a staged release
# 1. Download Google fonts during the build and keep them as the font backup when it passes
# 2. On the last attempt, read Google fonts from the backup instead, when there is one
build() {
  local dir=$1 attempt=$2 capture="$FONTS/capture.$$"
  if [ "$attempt" -eq "$BUILD_ATTEMPTS" ] && [ -d "$FONTS/backup/css" ]; then
    log "building from the font backup in $FONTS/backup"
    (cd "$dir/nextjs" && npm ci --no-audit --no-fund >>"$LOG" 2>&1 &&
      FONT_BACKUP_DIR="$FONTS/backup" NEXT_FONT_GOOGLE_MOCKED_RESPONSES="$TOOLS/font-mocked-responses.js" npm run build >>"$LOG" 2>&1)
    return
  fi
  rm -rf "$capture"
  (cd "$dir/nextjs" && npm ci --no-audit --no-fund >>"$LOG" 2>&1 &&
    FONT_CAPTURE_DIR="$capture" NODE_OPTIONS="--require $TOOLS/font-capture.js" npm run build >>"$LOG" 2>&1) || {
    rm -rf "$capture"
    return 1
  }
  # Replace the font backup with the fonts this build downloaded
  if [ -d "$capture/css" ] && [ -d "$capture/files" ]; then
    rm -rf "$FONTS/backup.old"
    [ -d "$FONTS/backup" ] && mv "$FONTS/backup" "$FONTS/backup.old"
    mv "$capture" "$FONTS/backup"
    rm -rf "$FONTS/backup.old"
  fi
  rm -rf "$capture"
}

# Clone a commit into a staging folder, link the shared files in, and build it, retrying a failed build
stage() {
  local sha=$1 version=$2 dir="$RELEASES/$2.staging" attempt
  rm -rf "$dir"
  git clone -q --shared --no-checkout "$MIRROR" "$dir"
  git -C "$dir" checkout -q --detach "$sha"
  ln -s /etc/grimoire/env.local "$dir/nextjs/.env.local"
  ln -s /srv/grimoire/storage "$dir/nextjs/storage"
  ln -s /srv/grimoire/tmp "$dir/nextjs/.tmp"
  for attempt in $(seq 1 "$BUILD_ATTEMPTS"); do
    if build "$dir" "$attempt"; then
      echo "$sha" > "$dir/.release-sha"
      mv "$dir" "$RELEASES/$version"
      return 0
    fi
    log "build attempt $attempt of $BUILD_ATTEMPTS for $version failed"
    [ "$attempt" -lt "$BUILD_ATTEMPTS" ] && sleep "$BUILD_RETRY_WAIT"
  done
  log "build of $version failed; see $LOG"
  notify "GRIMOIRE build of $version failed" "npm ci or next build failed $BUILD_ATTEMPTS times for $sha. The live release is unchanged. See $LOG on $(hostname)."
  rm -rf "$dir"
  return 1
}

# Print the highest version tag with no label, or nothing when the mirror has none
highest_tag() {
  git -C "$MIRROR" tag --list | grep -E '^[0-9]+\.[0-9]+\.[0-9]+$' | sort -V | tail -1 || true
}

# Deploy a version tag, or the highest one when none is named
# 1. Take the named tag, which deploys even when it is not higher or was installed before
# 2. Otherwise take the highest tag with no label, and stop when it is not higher than the active release,
#    ensuring a scheduled run never rolls back
# 3. Stop when it was installed before, ensuring a version that failed or was rolled back is not retried
deploy() {
  local version=$1 sha conclusion active waited=0
  git -C "$MIRROR" fetch -q --prune --prune-tags --tags origin '+refs/heads/unstable:refs/heads/unstable'
  if [ -n "$version" ]; then
    [[ "$version" =~ ^[0-9]+\.[0-9]+\.[0-9]+(-[a-z]+(\.[0-9]+)?)?$ ]] || { log "$version is not a version tag"; return 2; }
  else
    version=$(highest_tag)
    [ -n "$version" ] || { log "no version tag to deploy"; return 0; }
    active=$(release_current)
    if [ -n "$active" ] && [ "$(printf '%s\n%s\n' "$version" "$active" | sort -V | tail -1)" = "$active" ]; then
      log "$version is not higher than the active release $active"
      return 0
    fi
    if [ -d "$RELEASES/$version" ]; then
      log "$version was installed before, so it is not retried"
      return 0
    fi
  fi
  sha=$(git -C "$MIRROR" rev-parse -q --verify "refs/tags/$version^{commit}") || { log "no tag $version"; return 1; }

  # Wait for the commit's GitHub check, up to CHECK_WAIT seconds
  while :; do
    conclusion=$(check_conclusion "$sha")
    [ "$conclusion" = pending ] || [ "$conclusion" = none ] || break
    [ "$waited" -lt "$CHECK_WAIT" ] || break
    sleep 60; waited=$((waited + 60))
  done
  if [ "$conclusion" != success ]; then
    log "not deploying $version: GitHub check for $sha is $conclusion"
    [ "$conclusion" = failure ] && notify "GRIMOIRE deploy skipped" "The GitHub check for $version ($sha) is $conclusion, so it was not deployed."
    return 1
  fi

  if [ -d "$RELEASES/$version" ]; then
    log "$version is already staged"
  else
    log "building $version from $sha"
    stage "$sha" "$version"
  fi
  migrate_databases "$RELEASES/$version" "$version" || return 1
  activate "$version"
}

case "${1:-}" in
  --status)
    echo "current:  $(release_current) ($(cat "$CURRENT/.release-sha" 2>/dev/null))"
    echo "previous: $(release_previous)"
    ;;
  --rollback)
    target=$(release_previous)
    [ -n "$target" ] && [ -d "$RELEASES/$target" ] || { log "no previous release to roll back to"; exit 1; }
    activate "$target"
    ;;
  --tag) deploy "${2:?usage: $0 --tag X.Y.Z}" ;;
  "") deploy "" ;;
  *) echo "usage: $0 [--tag X.Y.Z | --rollback | --status]" >&2; exit 2 ;;
esac

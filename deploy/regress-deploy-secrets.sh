#!/bin/bash
# Check that the deploy script's requests keep every secret off the command line
#
# Usage: deploy/regress-deploy-secrets.sh
# NOTE: A stub curl records each command line and the headers and body it is given, and answers as Infisical, notify-relay and the health check do
set -euo pipefail

SCRIPT=$(dirname "$(readlink -f "$0")")/grimoire-deploy.sh
WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT
mkdir -p "$WORK/bin" "$WORK/identity"
touch "$WORK/argv.log" "$WORK/sent.log"

CLIENT_SECRET=test-client-secret-4f1c
ACCESS_TOKEN=test-access-token-9b2e
NOTIFY_TOKEN=test-notify-token-7d3a
API_KEY=test-api-key-1e8f
printf 'test-client-id\n' > "$WORK/identity/client-id"
printf '%s\n' "$CLIENT_SECRET" > "$WORK/identity/client-secret"
printf '%s\n' "$API_KEY" > "$WORK/api-key"

# Write a curl stand-in that logs what it was given and prints a canned answer for each address
cat > "$WORK/bin/curl" <<'STUB'
#!/bin/bash
printf '%s\n' "$*" >> "$WORK/argv.log"
url= write_out=
while [ $# -gt 0 ]; do
  case $1 in
    -H) [[ $2 == @* ]] && cat "${2#@}" >> "$WORK/sent.log"; shift ;;
    --data-binary) [ "$2" = @- ] && cat >> "$WORK/sent.log"; shift ;;
    -w) write_out=$2; shift ;;
    -o|-X|--max-time) shift ;;
    http*) url=$1 ;;
  esac
  shift
done
case $url in
  */auth/universal-auth/login) printf '{"accessToken":"%s"}' "$ACCESS_TOKEN" ;;
  */secrets/raw*) printf '{"secrets":[{"secretKey":"NOTIFY_APP_TOKEN","secretValue":"%s"}]}' "$NOTIFY_TOKEN" ;;
  */health) [ -n "$write_out" ] && printf 200 ;;
esac
STUB
chmod +x "$WORK/bin/curl"
export WORK ACCESS_TOKEN NOTIFY_TOKEN
PATH="$WORK/bin:$PATH"

# Load the helpers from the deploy script without running a deploy, failing when one is missing
eval "$(sed -n '/^log() {/,/^release_current() {/p' "$SCRIPT" | sed '$d')"
eval "$(sed -n '/^is_healthy() {/,/^}/p' "$SCRIPT")"
for helper in infisical_secret notify is_healthy; do
  declare -F "$helper" >/dev/null || { echo "FAIL: $helper not found in $SCRIPT" >&2; exit 1; }
done

# Point the loaded helpers at the test's files and addresses
# shellcheck disable=SC2034
{
  LOG=$WORK/deploy.log
  INFISICAL_IDENTITY_DIR=$WORK/identity
  INFISICAL_URL=http://infisical.test
  INFISICAL_WS=test-workspace
  NOTIFY_URL=http://notify.test/notify
  NOTIFY_CHANNEL=test-channel
  HEALTH_URL=http://app.test/health
  HEALTH_WINDOW=10
  API_KEY_FILE=$WORK/api-key
}

fail=0
[ "$(infisical_secret dev NOTIFY_APP_TOKEN)" = "$NOTIFY_TOKEN" ] || { echo "FAIL: infisical_secret did not return the secret" >&2; fail=1; }
notify "test subject" "test body"
is_healthy || { echo "FAIL: is_healthy did not pass" >&2; fail=1; }

# Fail on any secret in a command line, and on any secret that never reached curl
for secret in "$CLIENT_SECRET" "$ACCESS_TOKEN" "$NOTIFY_TOKEN" "$API_KEY"; do
  if grep -qF -- "$secret" "$WORK/argv.log"; then echo "FAIL: $secret is on a curl command line" >&2; fail=1; fi
  grep -qF -- "$secret" "$WORK/sent.log" || { echo "FAIL: $secret never reached curl" >&2; fail=1; }
done
[ "$fail" = 0 ] && echo "pass: no secret on a curl command line in $SCRIPT"
exit "$fail"

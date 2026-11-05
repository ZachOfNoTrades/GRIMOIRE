#!/bin/bash
# Run a Flyway command against each GRIMOIRE database, stopping at the first that fails.
#
# Usage: sql/flyway/migrate.sh <migrate | baseline | info | validate> [database...]
#        database is main, golem, rune, quest, food or health; with none given, it runs on all six in that order.
#
# Reads the app's own settings from the environment: SQL_SERVER_URL (the host), SQL_SERVER_PORT (default 1433),
# SQL_SERVER_USER, SQL_SERVER_PASSWORD and SQL_<DATABASE>_DB for each database named.
set -euo pipefail

FLYWAY_IMAGE=${FLYWAY_IMAGE:-flyway/flyway:13.12.0@sha256:3704e17c99e22adb8385552cdf8dd7fbc05ae6c420cb78215d9ac6cf1261a15c}
SQL_DIR=$(cd "$(dirname "$0")/.." && pwd)
ALL_DATABASES=(main golem rune quest food health)

command=${1:-}
case "$command" in
  migrate | baseline | info | validate) shift ;;
  *) echo "usage: $0 <migrate | baseline | info | validate> [${ALL_DATABASES[*]}]" >&2; exit 2 ;;
esac
databases=("$@")
[ ${#databases[@]} -gt 0 ] || databases=("${ALL_DATABASES[@]}")

for name in SQL_SERVER_URL SQL_SERVER_USER SQL_SERVER_PASSWORD; do
  [ -n "${!name:-}" ] || { echo "$name is not set" >&2; exit 2; }
done

# Hand the login to the container through its environment, to keep the password off every command line
export FLYWAY_USER=$SQL_SERVER_USER
export FLYWAY_PASSWORD=$SQL_SERVER_PASSWORD

for database in "${databases[@]}"; do
  [[ " ${ALL_DATABASES[*]} " == *" $database "* ]] || { echo "unknown database $database" >&2; exit 2; }
  key="SQL_${database^^}_DB"
  db_name=${!key:-}
  [ -n "$db_name" ] || { echo "$key is not set, so $database cannot run" >&2; exit 2; }

  # Quote the database name for JDBC, doubling any closing brace in it
  url="jdbc:sqlserver://$SQL_SERVER_URL:${SQL_SERVER_PORT:-1433};databaseName={${db_name//\}/\}\}}};encrypt=true;trustServerCertificate=true"

  echo "== flyway $command on $database ($db_name)"
  docker run --rm --network host \
    -e FLYWAY_USER -e FLYWAY_PASSWORD \
    -v "$SQL_DIR:/flyway/project:ro" \
    "$FLYWAY_IMAGE" \
    -configFiles=/flyway/project/flyway/flyway.toml \
    -locations="filesystem:/flyway/project/migrations/$database" \
    -url="$url" \
    "$command"
done

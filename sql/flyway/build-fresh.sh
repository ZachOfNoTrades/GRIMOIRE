#!/bin/bash
# Create each GRIMOIRE database from its sql_init script, then baseline and migrate it with Flyway.
#
# Usage: sql/flyway/build-fresh.sh [database...]
#        database is main, golem, rune, quest, food or health; with none given, it builds all six.
#
# Reads SQLCMD, the sqlcmd command that reaches the server as a login allowed to create databases, with its password
# in SQLCMDPASSWORD. For example, SQLCMD="docker exec -i -e SQLCMDPASSWORD mssql /opt/mssql-tools18/bin/sqlcmd -S 127.0.0.1 -U sa -No".
# Also reads the settings migrate.sh reads. A database that already exists is refused.
set -euo pipefail

SQL_DIR=$(cd "$(dirname "$0")/.." && pwd)
ALL_DATABASES=(main golem rune quest food health)

# Set each database's collation and its init scripts, in run order
declare -A COLLATION=(
  [main]=SQL_Latin1_General_CP1_CI_AS [golem]=SQL_Latin1_General_CP1_CI_AS [rune]=SQL_Latin1_General_CP1_CI_AS
  [quest]=Latin1_General_CI_AS_KS_WS [food]=SQL_Latin1_General_CP1_CI_AS [health]=Latin1_General_CI_AS_KS_WS
)
declare -A INIT_SCRIPTS=(
  [main]="sql_init_main.sql" [golem]="sql_init_golem.sql sql_init_golem_equipment.sql sql_init_golem_exercises.sql"
  [rune]="sql_init_rune.sql" [quest]="sql_init_quest.sql" [food]="sql_init_food.sql" [health]="sql_init_health.sql"
)

[ -n "${SQLCMD:-}" ] || { echo "SQLCMD is not set" >&2; exit 2; }
databases=("$@")
[ ${#databases[@]} -gt 0 ] || databases=("${ALL_DATABASES[@]}")

for database in "${databases[@]}"; do
  [ -n "${COLLATION[$database]:-}" ] || { echo "unknown database $database" >&2; exit 2; }
  key="SQL_${database^^}_DB"
  db_name=${!key:-}
  [ -n "$db_name" ] || { echo "$key is not set, so $database cannot be built" >&2; exit 2; }

  echo "== creating $database ($db_name)"
  # Quote the name for N'...' by doubling ', and for [...] by doubling ]
  quoted=${db_name//\'/\'\'}
  bracketed=${db_name//]/]]}
  $SQLCMD -b -x -Q "IF DB_ID(N'$quoted') IS NOT NULL THROW 50000, N'$quoted already exists', 1; CREATE DATABASE [$bracketed] COLLATE ${COLLATION[$database]};"

  for script in ${INIT_SCRIPTS[$database]}; do
    echo "== running $script on $db_name"
    $SQLCMD -b -x -I -d "$db_name" -i /dev/stdin < "$SQL_DIR/$script"
  done
done

"$SQL_DIR/flyway/migrate.sh" baseline "${databases[@]}"
"$SQL_DIR/flyway/migrate.sh" migrate "${databases[@]}"

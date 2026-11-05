#!/bin/bash
# Check the migration files and the locked base schema without a database.
#
# Usage: sql/flyway/check.sh
#
# 1. Each sql_init script matches its checksum in base.sha256, as the base schema is locked once baselined
# 2. Each folder in migrations/ is a known database and holds only V<version>__<description>.sql files
# 3. Each version is a whole number above the baseline version 1, used once per database
set -euo pipefail

SQL_DIR=$(cd "$(dirname "$0")/.." && pwd)
ALL_DATABASES=(main golem rune quest food health)
failed=0

# Compare the base schema with its recorded checksums
(cd "$SQL_DIR" && sha256sum --check --quiet flyway/base.sha256) || {
  echo "a sql_init script changed; the base schema is locked, so add a migration in migrations/<database>/ instead" >&2
  failed=1
}
for script in "$SQL_DIR"/sql_init_*.sql; do
  grep -q " ${script#"$SQL_DIR"/}\$" "$SQL_DIR/flyway/base.sha256" || { echo "${script#"$SQL_DIR"/} has no checksum in flyway/base.sha256" >&2; failed=1; }
done

for folder in "$SQL_DIR"/migrations/*/; do
  database=$(basename "$folder")
  [[ " ${ALL_DATABASES[*]} " == *" $database "* ]] || { echo "migrations/$database is not a GRIMOIRE database" >&2; failed=1; continue; }
  declare -A seen=()
  for file in "$folder"* "$folder".[!.]*; do
    [ -e "$file" ] || continue
    name=$(basename "$file")
    [ "$name" != .gitkeep ] || continue
    if [[ ! "$name" =~ ^V([1-9][0-9]*)__[a-z0-9_]+\.sql$ ]]; then
      echo "migrations/$database/$name is not named V<version>__<description>.sql in lowercase" >&2; failed=1; continue
    fi
    version=${BASH_REMATCH[1]}
    [ "$version" -gt 1 ] || { echo "migrations/$database/$name: version 1 is the baseline, so it would never run" >&2; failed=1; }
    [ -z "${seen[$version]:-}" ] || { echo "migrations/$database: version $version is used by ${seen[$version]} and $name" >&2; failed=1; }
    seen[$version]=$name
  done
  unset seen
done

[ "$failed" -eq 0 ] && echo "migrations and base schema check out"
exit "$failed"

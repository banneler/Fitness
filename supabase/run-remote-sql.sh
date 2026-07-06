#!/usr/bin/env bash
# Run SQL against the linked Fitness Supabase project via direct Postgres (session pooler).
# Use when the Supabase dashboard / Management API is unavailable.
#
#   export SUPABASE_DB_PASSWORD='your-database-password'
#   ./supabase/run-remote-sql.sh supabase/arena_prs_schema.sql

set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "Usage: SUPABASE_DB_PASSWORD=... $0 <sql-file> [sql-file...]" >&2
  exit 1
fi

if [[ -z "${SUPABASE_DB_PASSWORD:-}" ]]; then
  echo "Set SUPABASE_DB_PASSWORD (Project Settings → Database → password)." >&2
  exit 1
fi

PSQL="${PSQL:-/usr/local/opt/libpq/bin/psql}"
if [[ ! -x "$PSQL" ]]; then
  echo "psql not found. Install: brew install libpq" >&2
  exit 1
fi

DB_URL="postgresql://postgres.mvoyrchefjcpjkdtezmz:${SUPABASE_DB_PASSWORD}@aws-0-us-west-2.pooler.supabase.com:5432/postgres"

for file in "$@"; do
  echo "==> $file"
  PGPASSWORD="$SUPABASE_DB_PASSWORD" "$PSQL" "$DB_URL" -v ON_ERROR_STOP=1 -f "$file"
done

echo "Done."

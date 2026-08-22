#!/usr/bin/env bash
# End-to-end money test against a throwaway database.
# Override TEST_DATABASE_URL to point at any Postgres you like.
set -euo pipefail

export DATABASE_URL="${TEST_DATABASE_URL:-postgresql://livebid:livebid@127.0.0.1:5432/livebid_test?schema=public}"

echo "› test database: ${DATABASE_URL%%\?*}"
npx prisma db push --skip-generate --accept-data-loss >/dev/null
npx tsx scripts/test-wallet-flow.ts

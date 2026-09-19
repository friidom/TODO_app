#!/bin/sh
set -e

# migrate deploy is idempotent — it applies only what _prisma_migrations does
# not already record — so running it on every start is a no-op after the first.
npm run db:migrate

# exec, so node replaces the shell as PID 1 and receives SIGTERM itself.
# Without it the shell holds PID 1 and server.ts's graceful shutdown never runs.
exec node dist/server.js

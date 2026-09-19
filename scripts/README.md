# scripts/ — historical verification SQL

These are the acceptance tests for the **Row Level Security** permission model,
written during the M3/M4/M32 milestones. RLS was replaced by authorization in
the API during B6, so **none of them runs against the current schema** — they
depend on `auth.uid()`, `accessible_board_ids()` and RPCs that no longer exist.

They are kept because they are the written form of rules the application still
enforces, and they are more explicit than the code that replaced them:

| File | What it pins |
|---|---|
| `verify-m3-14-membership.sql` | The membership mutation matrix — who may add, promote, demote and remove |
| `verify-m3-15-owner-immutability.sql` | Exactly one owner; the owner row cannot be deleted or demoted |
| `verify-m3-16-role-matrix.sql` | Every cell of the full role matrix. Now enforced by `permissions-matrix.json` and the two parity tests that read it |
| `verify-m4-invites.sql` | Invitation rules, including the ceiling: nobody may invite at or above their own role |
| `verify-m32-attachments.sql` | The attachment and storage-bucket policies. **B10 has to reproduce these** |
| `dev-seed-perf-board.sql` | A profiling fixture, not a migration. Column names predate the Prisma schema — check before running |

The live equivalents are `backend/src/middleware/requireRole.ts`,
`backend/src/middleware/boardAccess.ts`, and the integration suite in
`backend/src/**/*.int.test.ts`.

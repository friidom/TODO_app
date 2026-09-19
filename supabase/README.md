# supabase/ — historical

**The live schema is `backend/prisma/`, not this directory.** Nothing here is
applied by the application, by CI or by Docker.

`migrations/` holds the 64 SQL migrations from before the B5–B8 backend
migration, when the app ran on Supabase and authorization was Row Level
Security. They are kept for two reasons: they are the record of how the schema
actually reached its present shape, and four of them are the only written
specification for surfaces that have **not** migrated yet —

- `20260818090000_realtime_publication.sql` and `20260818110000_realtime_comments.sql`
  define the publication `useBoardRealtime` subscribes to (**B9**);
- `20260814101000_avatar_storage_ownership.sql` and `20260831090000_create_attachments.sql`
  define the storage-bucket policies avatars and attachments depend on (**B10**).

B9 and B10 have to reproduce those rules in Express. Until then, read this
directory as a specification, not as something to run.

`config.toml` configures the Supabase CLI. It is unused by the running app.

**Do not add migrations here.** New schema changes go through
`backend/prisma/` — see the Database migrations section of `CLAUDE.md`.

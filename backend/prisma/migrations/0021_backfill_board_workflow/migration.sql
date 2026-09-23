-- 0021 — carry 0018's space setting onto its boards. BACKFILL.
--
-- Separate from 0020 and from 0022 because CLAUDE.md requires it: expand,
-- backfill and contract are one migration each, never combined, so each can be
-- reasoned about and re-run on its own.
--
-- A board filed into no space keeps 0020's default (true), which is what it
-- already did: spaces.repo.ts#workflowEnabledForBoard fell back to the same
-- default for an unfiled board, so this preserves that behaviour exactly rather
-- than changing it in passing.

update boards
   set workflow_enabled = spaces.workflow_enabled
  from spaces
 where boards.space_id = spaces.id;

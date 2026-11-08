-- 0039 — comment_pins, attachment_pins: comments and files pinned to the top
-- of a work item.
--
-- WHY SIDE TABLES AND NOT A COLUMN. comments_set_updated_at is a BEFORE UPDATE
-- trigger, and the thread reads "edited" from updated_at; a pinned_at column on
-- comments would mark every pinned comment as edited. attachments are
-- immutable by design (no updated_at, no UPDATE path). Neither table is
-- written by pinning.
--
-- No board_id or todo_id here: both are read through the comment or file, so a
-- pin cannot disagree with what it pins, and deleting the comment or file
-- (or, by cascade, its work item or board) takes the pin with it.
--
-- Pinning is shared, per work item, editor and above, at most 5 comments and
-- 5 files per work item. The cap is enforced in comments.service.ts and
-- attachments.service.ts under a lock on the work item's row, so two pins at
-- once cannot both take the fifth slot.
--
-- Forward-only. Reversing means a new migration.

create table public.comment_pins (
  comment_id uuid        primary key references public.comments (id) on delete cascade,
  pinned_by  uuid        references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.attachment_pins (
  attachment_id uuid        primary key references public.attachments (id) on delete cascade,
  pinned_by     uuid        references public.profiles (id) on delete set null,
  created_at    timestamptz not null default now()
);

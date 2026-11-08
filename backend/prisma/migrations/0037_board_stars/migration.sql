-- 0037 — board_stars: the boards a person has starred, for the sidebar's
-- Starred list.
--
-- WHY A TABLE AND NOT A FLAG ON THE BOARD ROW. A star is one person's, and the
-- board row is everyone's: GET /boards/:boardId is cached in Redis and shared
-- by every member, so a per-user field there would leak one reader's stars to
-- the next.
--
-- WHY THE FK NAMES THE MEMBERSHIP. A star can exist only while its owner is a
-- member of the board. Removing the member, deleting the board (which cascades
-- its memberships) or deleting the user (likewise) takes the star with it, so
-- nothing has to sweep stars nobody can see any more.
--
-- The primary key is what makes starring idempotent: a second star is an
-- ON CONFLICT DO NOTHING, never a duplicate row. Forward-only.

create table public.board_stars (
  user_id    uuid        not null,
  board_id   uuid        not null,
  created_at timestamptz not null default now(),
  constraint board_stars_pkey primary key (user_id, board_id),
  constraint board_stars_member_fkey
    foreign key (board_id, user_id)
    references public.board_members (board_id, user_id) on delete cascade
);

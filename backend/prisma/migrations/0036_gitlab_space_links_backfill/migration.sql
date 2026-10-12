-- 0036 — hand each board's GitLab link to its space where that is unambiguous.
--
-- A link is promoted only when it is the one active link on any board in its
-- space and the space's owner made it: the person who now decides for the whole
-- space is the person who chose this project. Promotion widens the link from
-- one board to every board in the space, and nobody else's choice is widened.
--
-- Everything else stays a board link and keeps working as before, for its own
-- board only: two projects in one space (which would the space use?), two
-- links to one project (whose webhook?), a link a board admin made (it would
-- now reach boards that admin may not be on), and a link on an unfiled board
-- (no space to own it). Space settings lists them, and connecting a project
-- there replaces them; their history stays on the tasks either way.
--
-- A promoted link keeps its id, so its webhook url and its sealed token keep
-- working, and its history stays with it. A single statement that changes
-- nothing on a second run: gitlab.space.int.test.ts runs it again on fixtures.
--
-- Forward-only. Reversing means a new migration.

update board_gitlab_projects l
   set space_id = b.space_id,
       board_id = null
  from boards b
  join spaces s on s.id = b.space_id
 where l.board_id = b.id
   and l.disconnected_at is null
   and l.created_by = s.owner_id
   and not exists (
         select 1
           from board_gitlab_projects active
          where active.space_id = b.space_id
            and active.disconnected_at is null
       )
   and (
         select count(*)
           from board_gitlab_projects other
           join boards ob on ob.id = other.board_id
          where ob.space_id = b.space_id
            and other.disconnected_at is null
       ) = 1;

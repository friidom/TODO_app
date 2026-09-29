-- 0027 — boards.view_tabs: the board's view tabs as its admins arranged them.
--
-- WHY THE BOARD. The board is the project, and the tab set everyone on it sees
-- belongs to it: admins reorder, rename and hide tabs for the whole board,
-- through the admin-gated PATCH /boards/:boardId that already carries the
-- board's other settings. Which tab a person lands on is personal and is not
-- stored here.
--
-- JSONB, WHERE 0020 CHOSE TYPED COLUMNS. 0020's flags are read by the server's
-- own rules on a hot path. This is an ordered list of presentation entries,
-- [{ mode, label, hidden }], written whole and read only by the client; nothing
-- queries, filters or joins on it. The API checks its shape and deliberately
-- not its modes: the client owns the view list and repairs an unknown or
-- missing mode on read.
--
-- NULL is the default tab set, so no board changes on deploy, and resetting
-- writes null rather than a copy that would go stale when a view is added.
--
-- Forward-only. Reversing means a new migration.

alter table boards
  add column view_tabs jsonb,
  add constraint boards_view_tabs_is_array
    check (view_tabs is null or jsonb_typeof(view_tabs) = 'array');

comment on column boards.view_tabs is
  'The board''s view tabs in display order, [{ mode, label, hidden }], written by board admins. Null is the default set. Presentation only; never queried.';

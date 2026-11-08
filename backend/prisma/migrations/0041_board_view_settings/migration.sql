-- 0041 — boards.view_settings: the board view an admin saved for everyone
-- (Show fields, column size, scrolling, hide done after). null is "never saved":
-- each person sees their own device's settings, as before. What a person changes
-- without saving stays on their device and never writes here.
alter table boards
  add column view_settings jsonb,
  add constraint boards_view_settings_is_object
    check (view_settings is null or jsonb_typeof(view_settings) = 'object');

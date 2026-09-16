-- citext backs users.email (S4): case-insensitive lookup becomes structural
-- rather than a lower() every caller has to remember.
--
-- pgcrypto is deliberately NOT installed: gen_random_uuid() has been in core
-- since PostgreSQL 13 and the target is 18.6.

create extension if not exists citext;

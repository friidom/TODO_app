-- 0032 — give every existing board its own key, and record it in board_keys.
--
-- Until now every board was created as KAN, so KAN-12 named one card per
-- board. Each board now gets a key derived from its title by the rule in
-- backend/src/lib/boardKey.ts, mirrored here once: pg_temp lasts only for this
-- session, so it cannot become a second runtime copy of that rule. A key that
-- is not the 'KAN' default was chosen on purpose and is kept, and is claimed
-- first. Collisions take the next free suffix (MNH, MNH2, ...), in creation
-- order so the result is deterministic.
--
-- Card numbers are untouched: todos.board_key and boards.next_key keep their
-- values, so KAN-12 on the Core API board becomes CA-12.
--
-- Forward-only. Reversing means a new migration.

create function pg_temp.board_key_base(title text)
returns text
language plpgsql
as $$
declare
  latin    text := lower(coalesce(title, ''));
  words    text[];
  initials text;
  joined   text;
begin
  latin := replace(latin, 'щ', 'shch');
  latin := replace(latin, 'ё', 'yo');
  latin := replace(latin, 'ж', 'zh');
  latin := replace(latin, 'ц', 'ts');
  latin := replace(latin, 'ч', 'ch');
  latin := replace(latin, 'ш', 'sh');
  latin := replace(latin, 'ю', 'yu');
  latin := replace(latin, 'я', 'ya');
  latin := translate(latin, 'абвгдезийклмнопрстуфхыэўқғҳъь', 'abvgdeziyklmnoprstufhyeoqgh');

  latin := regexp_replace(normalize(latin, NFKD), '[̀-ͯ]', '', 'g');
  latin := translate(latin, '''`ʻʼ‘’', '');
  latin := regexp_replace(upper(latin), '^[^A-Z]+', '');

  words := array(
    select word
      from regexp_split_to_table(latin, '[^A-Z0-9]+') with ordinality as t(word, n)
     where word <> ''
     order by n
  );

  initials := array_to_string(
    array(select left(w, 1) from unnest(words) with ordinality as u(w, n) order by n),
    ''
  );

  if cardinality(words) > 1 and length(initials) >= 2 then
    return left(initials, 10);
  end if;

  joined := left(array_to_string(words, ''), 3);

  return case when length(joined) >= 2 then joined else 'BRD' end;
end;
$$;

do $$
declare
  board     record;
  base      text;
  candidate text;
  suffix    integer;
begin
  for board in
    select id, title, key_prefix
      from boards
     order by key_prefix = 'KAN', created_at, id
  loop
    base := case
      when board.key_prefix = 'KAN' then pg_temp.board_key_base(board.title)
      else board.key_prefix
    end;

    candidate := base;
    suffix := 1;

    while exists (
      select 1 from board_keys k where k.key = candidate and k.board_id is distinct from board.id
    ) loop
      suffix := suffix + 1;
      candidate := left(base, 10 - length(suffix::text)) || suffix;
    end loop;

    -- boards_reserve_key records it.
    update boards set key_prefix = candidate where id = board.id;
  end loop;
end;
$$;

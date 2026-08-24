# 08 · RLS и модель безопасности

[← 07 · База данных](07-database.md) · [Оглавление](README.md) · [Далее: 09 · Аутентификация →](09-auth.md)

> 🔥 **Сильнейшая глава курса.** Это то, что отличает Veylo от CRUD-поделки, и
> то, что спросят на собеседовании подробнее всего.

---

## 🧒 LEVEL 1

> **RLS — это охранник, который стоит у каждой полки, а не у входа в здание.**

Обычное приложение работает так:

```
Ты → [ 🚪 охранник у входа ] → склад (все полки открыты)
```
Прошёл охранника — бери что хочешь. Если охранник задремал или ты залез в окно
— склад твой.

Veylo работает так:

```
Ты → склад → [ 🔐 охранник у полки 1 ] полка 1
           → [ 🔐 охранник у полки 2 ] полка 2
           → [ 🔐 охранник у полки 3 ] полка 3
```

Каждый охранник знает **тебя** и **эту полку**. Он проверяет **каждую карточку**,
которую ты пытаешься взять или положить.

И самое главное: **охранник — это свойство полки, а не должностная инструкция.**
Его нельзя обойти, потому что он не «шаг в процессе» — он часть самой полки.

### Почему валидация на фронте — не безопасность

```
Твой браузер                        Сервер
┌──────────────────┐
│ if (!canEdit)    │   ← это ты можешь удалить в DevTools за 3 секунды
│   return null;   │
└──────────────────┘
        ↓
   fetch(...)  ──────────────────→  [ 🔐 RLS ]  ← а это ты не можешь
                                    ↑
                          выполняется ВНУТРИ PostgreSQL
```

Фронтенд-проверка отвечает на вопрос «**что показать**».
RLS отвечает на вопрос «**что позволено**».
Это разные вопросы, и ответ на первый не является ответом на второй.

---

## 👷 LEVEL 2 — Как это устроено в Veylo

### Модель ролей

```
viewer  ──▶  editor  ──▶  admin  ──▶  owner
  1           2            3           4
```

Ровно четыре роли. Из плана:

> *«Do not invent additional roles. Do not replace roles with ad-hoc boolean
> permission columns.»*

Каждая роль включает всё, что может роль слева.

#### Матрица содержимого (задачи и колонки)

| Действие | viewer | editor | admin | owner |
|---|:-:|:-:|:-:|:-:|
| Читать доску, колонки, задачи | ✅ | ✅ | ✅ | ✅ |
| Создавать / менять / удалять задачи | ❌ | ✅ | ✅ | ✅ |
| Создавать / менять / удалять колонки | ❌ | ✅ | ✅ | ✅ |
| Менять порядок (drag, move, rehome) | ❌ | ✅ | ✅ | ✅ |

#### Матрица членства

| Действие | viewer | editor | admin | owner |
|---|:-:|:-:|:-:|:-:|
| Видеть список участников | ✅ | ✅ | ✅ | ✅ |
| Добавить/пригласить viewer или editor | ❌ | ❌ | ✅ | ✅ |
| Добавить/пригласить **admin** | ❌ | ❌ | ❌ | ✅ |
| Менять роль viewer ↔ editor | ❌ | ❌ | ✅ | ✅ |
| Повысить до / понизить с admin | ❌ | ❌ | ❌ | ✅ |
| Удалить viewer или editor | ❌ | ❌ | ✅ | ✅ |
| Удалить **admin** | ❌ | ❌ | ❌ | ✅ |
| **Тронуть владельца хоть как-то** | ❌ | ❌ | ❌ | ❌ |
| Уйти с доски самому | ✅ | ✅ | ✅ | ❌ |

**Обе матрицы сводятся к одному предложению:**

> **Актор может действовать только на участника СТРОГО НИЖЕ своего ранга, и
> никогда на владельца.**

Одно сравнение (`actor > target`) покрывает три отдельных правила без единой
ветки: админ не трогает другого админа, админ не трогает себя через управление,
никто не действует на своём уровне и выше.

#### Инварианты владельца — I1…I6

| # | Инвариант |
|---|---|
| **I1** | У доски **ровно один** владелец |
| **I2** | Строку членства владельца нельзя удалить **никакой** операцией членства **никаким** актором — включая самого владельца |
| **I3** | Роль владельца нельзя изменить, на тех же условиях |
| **I4** | У админа **нет ни одного пути** к строке владельца — ни через RPC, ни через `boards` update |
| **I5** | `boards.owner_id` и строка `owner` в `board_members` **всегда** называют одного человека |
| **I6** | Смена владельца — **не операция членства**. Это передача владения, и её не существует |

I4 выписан отдельно от I2/I3 намеренно:

> *«it is the one an implementation is most likely to get subtly wrong — a
> caller-rank check that stops at "is the caller admin or owner" satisfies I2
> and I3 and still lets an admin through.»*

---

### Три помощника, на которых держится всё

```sql
-- 1. accessible_board_ids() — «какие доски я МОГУ ЧИТАТЬ»
create or replace function public.accessible_board_ids()
returns setof uuid
language sql stable security definer set search_path = ''
as $$
  select b.id from public.boards b where b.owner_id = (select auth.uid())
  union
  select m.board_id from public.board_members m where m.user_id = (select auth.uid());
$$;
```

**Почему `union`, а не только членство?** Потому что владелец, чья строка
членства почему-то исчезла, иначе имел бы доску, содержимое которой не видит
**никто, включая его самого**, — и починить это из UI невозможно. `union`
(не `union all`) убирает дубликаты.

**Почему это `setof uuid`, а не `boolean`?** Потому что предикат
`board_id in (select accessible_board_ids())` **не зависит от строки** —
PostgreSQL планирует его как **InitPlan**, вычисляемый **один раз на оператор**,
а не на каждую строку.

```sql
-- 2. board_role(board_id) — «какая у меня роль на этой доске»
-- 3. is_board_member(board_id) — «я вообще участник»
```

**Почему помощники обязательны, а не «удобны»** (Enforcement rule 3):

> *«A policy on `board_members` that sub-selects `board_members` recurses and
> returns a hard 500.»*

Политика на таблице, которая читает **сама себя**, вызывает бесконечную
рекурсию. `SECURITY DEFINER`-функция обходит RLS внутри себя и разрывает цикл.

---

### Политики по таблицам — полный обзор

#### `boards`

```sql
create policy "Members select accessible boards" on public.boards
  for select to authenticated
  using (owner_id = (select auth.uid()) or public.is_board_member(id));

create policy "Admins and above update boards" on public.boards
  for update to authenticated
  using      (public.board_role(id) in ('owner', 'admin'))
  with check (public.board_role(id) in ('owner', 'admin'));
```
DELETE остался **owner-only** (с M2-01). Это ответ на вопрос «кто может удалить
доску»: удаление необратимо и каскадит по всем таблицам.

**Тонкость, которую стоит показать на собеседовании:** политика UPDATE
разрешает админу менять доску — но `owner_id` он всё равно поменять не может.
Не потому что политика это запрещает (**никакая политика не умеет сказать
«колонка не изменилась»**), а потому что триггер `boards_owner_immutable`
отказывает.

#### `columns` и `todos` — одна и та же форма

```sql
-- SELECT: любой участник
create policy "Members select todos" on public.todos
  for select to authenticated
  using (board_id in (select public.accessible_board_ids()));

-- INSERT: только WITH CHECK — существующей строки нет
create policy "Editors and above insert todos" on public.todos
  for insert to authenticated
  with check (public.board_role(board_id) in ('owner','admin','editor'));

-- UPDATE: ОБА — и это принципиально
create policy "Editors and above update todos" on public.todos
  for update to authenticated
  using      (public.board_role(board_id) in ('owner','admin','editor'))
  with check (public.board_role(board_id) in ('owner','admin','editor'));

-- DELETE: только USING — новой строки не будет
create policy "Editors and above delete todos" on public.todos
  for delete to authenticated
  using (public.board_role(board_id) in ('owner','admin','editor'));
```

### 🔥 `USING` vs `WITH CHECK` — вопрос, который задают всем

Комментарий в миграции формулирует это лучше, чем большинство учебников:

> *`USING` is tested against the row **AS IT EXISTS**. It answers «may you touch
> this row at all», and **filters rows out invisibly**.*
> *`WITH CHECK` is tested against the row **AS PROPOSED**. It answers «may the
> result exist», and **raises 42501** when violated.*

```
                 USING                  WITH CHECK
              (старая строка)          (новая строка)
SELECT            ✅                        —
INSERT            —                        ✅
UPDATE            ✅                        ✅   ← оба!
DELETE            ✅                        —
```

**Почему UPDATE нужны оба — конкретная атака:**

```sql
-- Я editor на доске A. Пытаюсь перетащить задачу на доску B.
UPDATE todos SET board_id = '<доска B>' WHERE id = '<моя задача>';
```

| Только `USING` | `USING` + `WITH CHECK` |
|---|---|
| Старая строка (доска A) проходит ✅ | Старая проходит ✅ |
| Новую **никто не смотрит** | Новая (доска B) проверяется → у меня нет прав → **42501** ❌ |
| 💥 Задача уехала на чужую доску | 🔒 Отказ |

**Различие в поведении отказа тоже важно:**
- `USING` не совпал → строка просто **не видна** (0 строк). Нет ошибки.
- `WITH CHECK` не совпал → **исключение `42501`**.

Отсюда вечный вопрос отладки: «почему запрос вернул пусто, а не ошибку?»
Ответ — потому что это `USING`. См. [главу 29](29-debugging.md).

#### `board_members` — таблица без единой write-политики

```sql
alter table public.board_members enable row level security;
-- SELECT-политика: только СВОЯ строка
-- INSERT / UPDATE / DELETE политик НЕТ ВООБЩЕ
```

**RLS включена + нет политики = запрещено всё.** Это ключевое свойство:
дефолт безопасен.

Значит:
- добавить себя в чужую доску нельзя;
- повысить себя до admin нельзя;
- удалить чужое членство нельзя.

Всё это делают четыре RPC, каждая со своей проверкой.

Тогда как виден **список** участников? Через `board_roster(board_id)` —
`SECURITY DEFINER`, с проверкой членства внутри, возвращающий шесть колонок.

> *«`board_members` stays self-read and `profiles` stays self-only by design —
> **the RPC's return list is the exposure boundary, not a policy**.»*

Это важная архитектурная идея: **граница раскрытия данных — это возвращаемый
набор функции, а не политика на таблице.** Расширить его = поменять одну
сигнатуру, а не ослабить политику, которая защищает всё остальное.

#### `notifications` — идеально простой self-only

```sql
create policy "Own notifications are selectable" on public.notifications
  for select to authenticated using (user_id = (select auth.uid()));

create policy "Own notifications are markable" on public.notifications
  for update to authenticated
  using      (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "Own notifications are deletable" on public.notifications
  for delete to authenticated using (user_id = (select auth.uid()));

grant select, update, delete on public.notifications to authenticated;
--     ↑ НЕТ insert. Пишут только триггеры.
```

`WITH CHECK` на UPDATE не даёт **передать** уведомление другому:
`UPDATE notifications SET user_id = <чужой>` пройдёт `USING` (строка моя) и
упрётся в `WITH CHECK`.

#### `activities` — только чтение, вообще

Одна SELECT-политика с тем же предикатом, что у `todos`. Ни INSERT-политики, ни
INSERT-гранта.

> *«A client cannot forge, backdate, delete or omit an entry, because the
> triggers are on the tables themselves rather than in the API layer.»*

---

## 🏛 LEVEL 3

### 🔐 Разбор атак: «а что если…»

#### Атака 1 — прямой запрос к PostgREST в обход UI

```bash
curl 'https://<project>.supabase.co/rest/v1/todos?select=*' \
  -H "apikey: <publishable>" \
  -H "Authorization: Bearer <МОЙ настоящий JWT>"
```
**Результат:** вернутся только задачи досок, где я участник. Фильтра по доске
нет — но политика `board_id in (select accessible_board_ids())` его заменяет.
**Ни одной чужой строки.**

#### Атака 2 — подделка `creator_id`

```ts
supabase.from("todos").insert({ ..., creator_id: "<чужой uuid>" })
```
**Результат:** вставка **пройдёт** — политика проверяет `board_id`, а не
`creator_id`. Строка появится с чужим авторством.

**Честный вывод: это принято, а не защищено.** Правило из чеклиста —
*«No ownership column is sent from the client where a DB default could set it»* —
здесь **не выполнено**: `addTodo` шлёт `creator_id` явно, потому что при
`todos.creator_id` нет `default auth.uid()`.

Почему это низкий риск: писать может только editor+ на **своей** доске, а
`creator_id` нигде не читается (его нет даже в `TODO_FIELDS`) и он не даёт прав.
Правильное исправление — `alter column creator_id set default auth.uid()` плюс
отзыв INSERT-гранта на колонку. **Это настоящий, найденный аудитом пункт, и на
собеседовании его лучше назвать самому.**

#### Атака 3 — эскалация до admin

```ts
supabase.from("board_members").update({ role: "admin" }).eq("user_id", me)
```
**Результат:** `board_members` не имеет UPDATE-политики → **0 строк**.

```ts
supabase.rpc("set_member_role", { p_board_id, p_user_id: me, p_role: "admin" })
```
**Результат:** функция проверяет `v_actor_rank > v_target_rank`. Я не могу быть
строго выше самого себя → `42501`.

#### Атака 4 — админ хочет убрать владельца

Порядок проверок в `set_member_role` — сам по себе решение:

```sql
v_actor := (select auth.uid());              -- 1. есть сессия?
v_actor_rank := board_role_rank(board_role(p_board_id));
if v_actor_rank is null then ... 42501;      -- 2. я вообще участник?

if public.is_board_owner(p_board_id, p_user_id) then   -- 3. 🔑 ВЛАДЕЛЕЦ — ПЕРВЫМ
  raise exception 'the board owner cannot be modified' using errcode = '42501';
end if;

if p_role = 'owner' then ... 42501;          -- 4. владение не выдаётся
if v_actor_rank < board_role_rank('admin') then ... 42501;  -- 5. admin+
-- 6. и только теперь арифметика рангов
```

**Проверка на владельца стоит ДО арифметики рангов.** Комментарий в
`permissions.ts` объясняет, зачем:

> *«so the Owner stays untouchable even if the arithmetic below were wrong»*

Это **defence in depth внутри одной функции**. Даже если ранговая логика
однажды сломается при рефакторинге, владелец останется защищённым.

И сверх этого — триггер `board_members_owner_immutable` на BEFORE
INSERT/UPDATE/DELETE, который отказывает **любому писателю, включая
`service_role`**. То есть даже владелец функции не может это обойти.

#### Атака 5 — перечисление аккаунтов через форму входа

Вход по username требует резолва username → email. Значит, есть RPC
`login_email_for`, доступная `anon`. Не превращает ли это форму в оракул
существования?

**Смягчение №1 — сообщение об ошибке одинаковое:**
```ts
const INVALID_CREDENTIALS = "Invalid login credentials";
...
if (!resolved) throw new Error(INVALID_CREDENTIALS);   // тот же текст, что у GoTrue
```
Неизвестный username, кривой username и неверный пароль дают **дословно один и
тот же** ответ.

**Смягчение №2 — GoTrue rate limit:** `sign_in_sign_ups = 30`.

**Что раскрывается всё равно:** сама RPC вернёт email для существующего
username. Это **записанный, принятый компромисс** (см. заголовок миграции
`20260821150000_login_email_for.sql`), а не недосмотр. Так работает вход по
username везде — иначе он невозможен в принципе.

Хорошая формулировка для собеседования: *«Мы не притворяемся, что этого нет.
Мы сузили функцию до одной колонки, сделали сообщения неразличимыми и оставили
rate limit. Полное устранение потребовало бы отказаться от входа по username.»*

#### Атака 6 — попытка прочитать чужие уведомления

```ts
supabase.from("notifications").select("*")   // без фильтра
```
**Результат:** вернутся **только свои**. Политика `user_id = auth.uid()`
применяется всегда — именно поэтому в `notificationsApi.ts` нет клиентского
фильтра: он был бы вторым определением «моего».

#### Атака 7 — перебор токенов приглашений

```
token := encode(extensions.gen_random_bytes(24), 'hex')
```
24 случайных байта = **192 бита** = 48 hex-символов. Пространство ≈ 6.3×10⁵⁷.
Перебор невозможен.

Плюс: `expires_at` (1..30 дней, зажато на сервере), `accepted_at` (одноразовость),
`FOR UPDATE` при погашении (нет гонки), и роль `owner` запрещена и при выдаче,
и при приёме.

#### Атака 8 — подмена схемы (`search_path` hijack)

```sql
create schema evil;
create table evil.profiles (id uuid, username text);
set search_path = evil, public;
select public.username_available('admin');
```
**Без `set search_path = ''`:** функция `SECURITY DEFINER` обратилась бы к
`evil.profiles` **с правами владельца**.

**С ним:** внутри функции все имена полные (`public.profiles`), `search_path`
вызывающего игнорируется. Все `SECURITY DEFINER`-функции Veylo это делают, и на
исправление одной из них есть отдельная миграция —
`20260814102000_handle_new_user_search_path.sql`.

---

### Где какое правило действительно живёт

| Правило | Реальный механизм | Не механизм |
|---|---|---|
| Читать доску может участник | `accessible_board_ids()` + SELECT-политики | не React |
| Писать может editor+ | `board_role() in (...)` в INSERT/UPDATE/DELETE | не `usePermissions` |
| Клиент не пишет в `board_members` | RLS включена, write-политик нет | — |
| Новая доска получает владельца-участника | триггер `boards_add_owner_membership` | не код создания доски |
| Мутации членства с проверкой ранга | 4 RPC `SECURITY DEFINER` | — |
| Владелец неизменяем (I1–I5) | 2 триггера, **включая `service_role`** | не RPC |
| Список участников виден коллегам | RPC `board_roster` | не политика на `profiles` |
| Настройки доски — admin+ | политика UPDATE (M3-17) | — |
| `owner_id` не меняется | триггер (**политика этого не умеет**) | — |
| Колонка задачи принадлежит её доске | composite FK | не проверка в коде |
| Удаление колонки атомарно | RPC `delete_column` (`SECURITY INVOKER`) | — |
| Комментарий правит только автор | политика `author_id = auth.uid()` + `grant update (content)` | — |

Последняя строка — тонкая: политика уровня строки **не может** сказать, какие
колонки разрешено менять. Это делает **column-level grant**.

---

### `permissions.ts` — зеркало, а не замок

```ts
export function permissionsFor(role: string | null | undefined): Permissions {
  const rank = roleRank(role);
  if (rank === null) return NO_PERMISSIONS;
  return {
    role: role as BoardRole,
    canReadBoard: true,
    canEditTodos:     rank >= RANK.editor,
    canManageColumns: rank >= RANK.editor,
    canManageMembers: rank >= RANK.admin,
    canManageAdmins:  rank >= RANK.owner,
    canDeleteBoard:   rank >= RANK.owner,
    canComment: true,
    canModerateComments: rank >= RANK.admin,
  };
}
```

Каждая строка в комментарии файла **названа по своему правилу в БД**:
`canEditTodos` ← M3-05, `canManageMembers` ← M3-14, `canDeleteBoard` ← M2-01.
Расхождение можно найти.

**Зачем оно тогда нужно, если не защищает?**

> *«What this buys is honesty: a viewer who can press a button that always fails
> reads the board as broken rather than as read-only.»*

И `roleRank` возвращает `null`, а не `0`:

> *«a nullish rank in a `<=` is the shape that turns a deny into an allow»*

`null <= 2` в JS даёт `true` (потому что `null` приводится к `0`). Явный
`null` + обязательная проверка `if (rank === null) return false` устраняет
целый класс ошибок.

---

### Как это проверено — 209 тестов на реплике

Правило доказательства (Enforcement rule 7):

> *«Proof is REST-level. A UI check proves nothing about a policy, because the
> UI never asks for rows it does not expect.»*

| Харнесс | Что проверяет | Результат |
|---|---|---|
| `scripts/verify-m3-14-membership.sql` | матрица мутаций членства | **67/67** |
| `scripts/verify-m3-15-owner-immutability.sql` | I1–I5 | **37/37** |
| `scripts/verify-m3-16-role-matrix.sql` | полная матрица ролей | **105/105** |
| `scripts/verify-m4-invites.sql` | жизненный цикл приглашений | ✅ |

Форма проверки отказа (из Appendix C плана):

```
read denial:  ожидаем []        — не строки
write denial: ожидаем 42501     — или 0 строк
RPC denial:   ожидаем собственную ошибку функции
```

**Почему «ожидаем `[]`, а не строки» — отдельная строка в чеклисте:** потому что
`USING` фильтрует **молча**. Тест, который проверяет «не упало», прошёл бы и при
полностью открытой политике.

---

### Известные слабые места — назови их сам

| # | Слабое место | Риск | Исправление |
|---|---|---|---|
| 1 | `creator_id` присылается клиентом | низкий: авторство можно подделать на своей доске | `default auth.uid()` + отзыв колоночного гранта |
| 2 | `login_email_for` раскрывает email по username | средний | принято осознанно; альтернатива — отказ от входа по username |
| 3 | `search_board_invitees` ищет по email через `ilike` | низкий: admin+ only, min 2 символа, max 8 строк | сузить до username |
| 4 | PITR выключен | нет DR для плохой data-миграции | ~$125/мес, отложено (Part V, PH-01) |
| 5 | Кэш не персистится | — | **это защита**: персист без namespace по user id отдал бы следующему человеку строки предыдущего |
| 6 | Мёртвые колонки `status`/`previous_status` | нулевой, но шум | Tier B миграция с дампом |

**Пункт 5 читается как «нет фичи», а на самом деле это принятое решение
безопасности** — и это хороший пример того, как выглядит зрелый анализ.

---

## 🧪 Мини-квиз

<details>
<summary><b>1.</b> В чём разница между <code>USING</code> и <code>WITH CHECK</code>, и почему UPDATE нужны оба?</summary>

`USING` проверяет строку **как она есть** («можно ли её трогать») и фильтрует
молча. `WITH CHECK` проверяет строку **как предложено** («может ли результат
существовать») и бросает `42501`.

UPDATE нужны оба, потому что только `USING` позволил бы editor'у доски A
выполнить `SET board_id = <доска B>`: старая строка проходит, а новую никто не
смотрит. `WITH CHECK` требует права **на месте назначения**.
</details>

<details>
<summary><b>2.</b> Почему у <code>board_members</code> нет ни одной write-политики?</summary>

Потому что RLS включена, и включённая RLS без политики = **запрещено всё**.
Каждая мутация членства идёт через `SECURITY DEFINER`-RPC со своей проверкой
ранга. Добавление write-политики — регрессия безопасности, а не упрощение: она
дала бы прямой путь записи в обход всей ранговой арифметики.
</details>

<details>
<summary><b>3.</b> Почему membership-политики зовут <code>SECURITY DEFINER</code>-помощники вместо подзапроса к <code>board_members</code>?</summary>

Политика на `board_members`, читающая `board_members`, вызывает **бесконечную
рекурсию** → жёсткий 500. `SECURITY DEFINER`-функция обходит RLS внутри себя и
разрывает цикл. Бонус: `accessible_board_ids()` не зависит от строки, поэтому
планируется как **InitPlan** — один раз на оператор, а не на строку.
</details>

<details>
<summary><b>4.</b> Админ вызывает <code>set_member_role(board, owner_id, 'viewer')</code>. Что произойдёт и на каком шаге?</summary>

`42501 'the board owner cannot be modified'` — на **третьем** шаге, ещё до
арифметики рангов. Проверка владельца стоит первой намеренно: даже если ранговая
логика когда-нибудь сломается, владелец останется защищённым. А поверх этого
триггер `board_members_owner_immutable` откажет **любому** писателю, включая
`service_role`.
</details>

<details>
<summary><b>5.</b> Почему <code>owner_id</code> защищён триггером, а не политикой?</summary>

Потому что **RLS-политика не умеет выразить «эта колонка не изменилась»**. Она
получает старую и новую строку и оценивает предикат — она не может потребовать
их равенства по конкретному полю. Политика UPDATE на `boards` разрешает
изменения админу; триггер `boards_owner_immutable` отдельно отказывает, если
`owner_id` в новой строке отличается.
</details>

<details>
<summary><b>6.</b> Что раскрывает <code>board_roster</code> и почему это не дыра?</summary>

`id, username, full_name, avatar_url, role, joined_at` — и только участникам
этой доски. Дыры нет, потому что **граница раскрытия — это возвращаемый набор
функции**, а не ослабленная политика: `profiles` остаётся self-only, а
`board_members` — self-read. Расширить видимость = поменять сигнатуру одной
функции, а не открыть таблицу.
</details>

<details>
<summary><b>7. Predict:</b> RLS на новой таблице включили, политик не написали. Что вернёт SELECT?</summary>

**Ноль строк.** Включённая RLS без политики запрещает всё для всех, кроме
владельца таблицы и `BYPASSRLS`. Это фича: дефолт безопасен, и «забыл политику»
проявляется как «ничего не работает», а не как «всё видно всем».
</details>

<details>
<summary><b>8.</b> Как доказать, что политика действительно работает?</summary>

REST-уровневым тестом с **настоящим токеном** нужной роли, и проверять надо
конкретную форму отказа: чтение → ожидаем `[]`; запись → `42501` или 0 строк;
RPC → собственную ошибку функции. Проверка «не упало» прошла бы и при полностью
открытой политике, потому что `USING` фильтрует молча. В Veylo это 209
проверенных случаев в четырёх SQL-харнессах в `scripts/`.
</details>

<details>
<summary><b>9.</b> Назови настоящее слабое место в модели безопасности Veylo.</summary>

`todos.creator_id` присылается клиентом, потому что у колонки нет
`default auth.uid()`. Значит, editor может создать задачу с чужим авторством —
на **своей** доске. Риск низкий (`creator_id` нигде не читается и прав не даёт),
но правило проекта формально нарушено. Исправление: `set default auth.uid()` +
отзыв INSERT-гранта на колонку.
</details>

---

[← 07 · База данных](07-database.md) · [Оглавление](README.md) · [Далее: 09 · Аутентификация →](09-auth.md)

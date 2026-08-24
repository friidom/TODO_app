# 25 · Полные user journeys

[← 24 · Деплой](24-deployment.md) · [Оглавление](README.md) · [Далее: 26 · Как построить это самому →](26-rebuild-from-zero.md)

---

> Тринадцать сценариев, каждый **от клика до базы и обратно**.
> Это глава-справочник: возвращайся к ней, когда нужно проследить конкретный путь.

**Общая форма каждого пути:**

```
UI → компонент → хук → сервис → supabase-js → PostgREST →
🔐 RLS / ⚙️ триггер / 📐 constraint → ответ → кэш → UI
```

---

## Легенда

| Символ | Значение |
|---|---|
| 🟢 | пользователь видит результат **немедленно** (оптимистично) |
| 🔐 | точка проверки безопасности |
| ⚙️ | триггер БД |
| 📐 | constraint / FK |
| ↩️ | точка отката |

---

## 1 · Регистрация

```mermaid
sequenceDiagram
    autonumber
    participant U as 👤
    participant F as RegisterForm
    participant UA as useUsernameAvailability
    participant API as authApi.signUp
    participant GT as GoTrue
    participant DB as PostgreSQL

    U->>F: печатает username
    F->>UA: debounce 350ms
    UA->>UA: isUsernameShapeValid — локально
    UA->>DB: rpc username_available
    DB-->>UA: boolean (СОВЕТ, не гарантия)

    U->>F: submit
    F->>API: signUp(email, password, username)
    API->>GT: auth.signUp({options.data:{username}})
    GT->>DB: INSERT auth.users
    DB->>DB: ⚙️ handle_new_user → available_username → INSERT profiles
    Note over DB: 🔒 profiles_username_lower_key — ЕДИНСТВЕННАЯ гарантия
    GT-->>API: {user, session: null}
    API-->>U: «Проверьте почту»

    U->>GT: клик по ссылке
    GT->>DB: UPDATE auth.users SET email_confirmed_at
    DB->>DB: ⚙️ on_auth_user_confirmed → provision_user
    Note over DB: одна транзакция:<br/>profile + space + board + 4 колонки
    GT-->>U: сессия → /
```

**Файлы:** `RegisterForm.tsx` → `useRegister.ts` → `authApi.signUp` →
`20260821130000_handle_new_user_username.sql` → `20260824120000_default_space_name.sql`

📖 [09 · Auth](09-auth.md) · [10 · Usernames](10-usernames.md)

---

## 2 · Вход (email или username)

```mermaid
sequenceDiagram
    autonumber
    participant U as 👤
    participant H as useLogin
    participant API as authApi.signIn
    participant DB as PostgreSQL
    participant GT as GoTrue

    U->>H: identifier + password
    Note over H: meta:{silent:true} — форма рисует ошибку сама
    H->>API: signIn(identifier, password)
    API->>API: normalizeIdentifier → "@"? email : username

    alt username
        API->>DB: 🔐 rpc login_email_for
        DB-->>API: email ИЛИ null
        Note over API: null → Error("Invalid login credentials")<br/>🔒 тот же текст, что при неверном пароле
    end

    API->>GT: signInWithPassword({email, password})
    GT-->>API: {user, session}
    API->>DB: rpc provision_new_user (ремонт, не фатально)
    H->>H: navigate(safeNext(?next) ?? "/")
```

📖 [09 · Auth](09-auth.md) · [10 · Usernames](10-usernames.md)

---

## 3 · Сброс пароля

```mermaid
sequenceDiagram
    autonumber
    participant U as 👤
    participant FP as ForgotPasswordPage
    participant GT as GoTrue
    participant RP as ResetPasswordPage

    U->>FP: email
    FP->>GT: resetPasswordForEmail(email,<br/>{redirectTo: origin + "/reset-password"})
    Note over FP: 🔒 результат НЕ инспектируется —<br/>ответ одинаков независимо<br/>от существования адреса
    FP-->>U: «Если аккаунт есть, письмо отправлено»

    U->>RP: клик → /reset-password#access_token=…
    Note over RP: ⚠️ ссылка ВХОДИТ пользователя.<br/>Поэтому маршрут вне обоих guard'ов

    par три механизма готовности
        RP->>GT: onAuthStateChange → PASSWORD_RECOVERY|SIGNED_IN
    and
        RP->>GT: getSession() — если обмен был ДО подписки
    and
        RP->>RP: setTimeout 4000 → status "invalid"
    end

    U->>RP: новый пароль ×2
    RP->>GT: auth.updateUser({password})
```

⚠️ **Ловушка деплоя:** без домена в allow-list Supabase ссылка молча приводит
на корень сайта.

📖 [09 · Auth](09-auth.md) · [24 · Деплой](24-deployment.md)

---

## 4 · Создание Space

```mermaid
sequenceDiagram
    autonumber
    participant U as 👤
    participant M as SpaceFormModal
    participant H as useCreateSpace
    participant A as spacesApi.createSpace
    participant DB as PostgreSQL

    U->>M: название → Create
    M->>H: mutate({title})
    H->>A: createSpace({id: crypto.randomUUID(), title})
    A->>A: supabase.auth.getUser() → owner_id
    A->>DB: INSERT spaces (id, title, owner_id)
    DB->>DB: 📐 spaces_title_length CHECK 1..60
    DB->>DB: 🔐 RLS: owner-only
    DB->>DB: ⚙️ spaces_set_updated_at
    DB-->>H: строка
    H->>H: invalidateQueries(["spaces"])
    Note over H: НЕ оптимистично — создание space<br/>редкое, и порядок в сайдбаре<br/>определяет сервер (сортировка по title)
```

**Почему без оптимистичного апдейта:** операция редкая, а сортировка списка
идёт по `title` — оптимистичная вставка потребовала бы воспроизвести
серверную сортировку на клиенте ради экономии одного round-trip'а.

📖 [11 · Spaces/Boards/Tasks](11-spaces-boards-tasks.md)

---

## 5 · Создание Board

```mermaid
sequenceDiagram
    autonumber
    participant U as 👤
    participant M as BoardFormModal
    participant H as useCreateBoard
    participant DB as PostgreSQL

    U->>M: название + (опционально) space
    M->>H: mutate({title, spaceId})
    H->>DB: INSERT boards (id, title, owner_id, space_id)

    rect rgb(255,240,240)
    DB->>DB: ⚙️ boards_space_ownership (BEFORE)<br/>space_id только в СВОЁ пространство
    DB->>DB: 📐 boards_key_prefix_format CHECK
    DB->>DB: 🔐 RLS INSERT
    DB->>DB: ⚙️ boards_add_owner_membership (AFTER)<br/>🔑 владелец → строка в board_members
    end

    DB-->>H: строка доски
    H->>H: invalidateQueries(["boards"])
    U->>U: navigate(/boards/:id)
```

**🔑 Ключевой шаг — 7-й.** Владелец становится участником **триггером**, а не
кодом создания. Без этого `accessible_board_ids()` вернул бы доску (по
`owner_id`), но `board_role()` вернул бы `null`, и владелец не смог бы **писать**
в собственную доску.

⚠️ **Новая доска создаётся без колонок.** Четыре колонки заводит только
`provision_user` для первой доски. Вторая доска начинается пустой.

📖 [11 · Spaces/Boards/Tasks](11-spaces-boards-tasks.md)

---

## 6 · Создание задачи

```mermaid
sequenceDiagram
    autonumber
    participant U as 👤
    participant F as TodoCreateForm
    participant H as useAddTodo
    participant Q as кэш
    participant A as todoApi.addTodo
    participant DB as PostgreSQL

    U->>F: заголовок + Enter
    F->>H: mutate({title, column_id, index})
    H->>H: 🔑 id = crypto.randomUUID()

    rect rgb(230,240,255)
    H->>Q: cancelQueries
    H->>Q: snapshot → previousTodos ↩️
    H->>H: rankForDrop(колонка, index) ?? rankForAppend
    H->>Q: setQueryData(applyTodoInserted)
    end
    Q-->>U: 🟢 карточка на экране (board_key = null)

    H->>A: addTodo({id, title, column_id, board_id, …})
    A->>A: auth.getUser() → creator_id
    A->>DB: SELECT последний rank в колонке
    A->>DB: UPSERT todos (onConflict: id)

    rect rgb(255,245,230)
    DB->>DB: 🔐 RLS WITH CHECK: board_role ∈ (owner,admin,editor)
    DB->>DB: 📐 composite FK (column_id, board_id) → columns
    DB->>DB: ⚙️ todos_assign_board_key → KAN-N из boards.next_key
    DB->>DB: ⚙️ todos_log_activity → activities
    DB->>DB: ⚙️ todos_notify_assignment (если назначен другой)
    end

    DB-->>H: serverTodo с board_key
    H->>Q: applyTodoConfirmed — сохранить ВЫБРАННЫЙ слот
    H->>A: moveTodo если rank разошёлся
    H->>A: reorderTodos если position разошёлся
    Q-->>U: 🟢 KAN-14 появился

    Note over Q: MutationCache.onSuccess →<br/>invalidate ["activities"]
```

📖 [05 · Data flow](05-data-flow.md) · [12 · Kanban](12-kanban.md)

---

## 7 · Перемещение задачи (drag & drop)

```mermaid
sequenceDiagram
    autonumber
    participant U as 👤
    participant CD as collisionDetection
    participant DE as useBoardDragEnd
    participant RI as resolveDropIndex
    participant M as useTodoDrop
    participant Q as кэш
    participant DB as PostgreSQL

    U->>CD: pointerdown + 8px → drag
    loop каждый кадр
        CD->>CD: 1) ближайшая колонка (≤80px)<br/>2) ближайший зазор по Y<br/>3) touchesActive → отбросить
        CD->>DE: setIndicator({columnId, index})
    end
    Note over U: 🔵 синяя линия

    U->>DE: pointerup
    DE->>DE: done-колонка и другая? → flashDone
    DE->>RI: resolveDropIndex(full, visible, gap, activeId)
    Note over RI: зазор → ИМЯ карточки под ним
    DE->>M: mutate({todos, activeTodo, columnId, index})

    alt ранг найден
        M->>Q: setQueryData(applyTodoMoved) — ОДНА строка ↩️
        Q-->>U: 🟢 карточка на месте
    else исчерпание (rankBetween → null)
        M->>DB: rpc rebalance_column_ranks
        M->>Q: fetchQuery — перечитать
        M->>M: rankForDrop ещё раз (ровно ОДИН повтор)
    end

    M->>DB: UPDATE todos SET column_id, rank WHERE id AND board_id
    DB->>DB: 🔐 RLS USING + WITH CHECK
    DB->>DB: 📐 composite FK
    DB->>DB: ⚙️ log_todo_activity → 'moved'
    DB-->>M: 204
    Note over DB: 📡 UPDATE уходит другим клиентам<br/>→ applyTodoUpdated
```

**Провал:** `onError` восстанавливает `previousTodos`; если снимка нет —
`removeQueries` (иначе `setQueryData(key, undefined)` — no-op, и оптимистичный
порядок пережил бы отказ).

📖 [12 · Kanban](12-kanban.md)

---

## 8 · Создание задачи росчерком на Timeline

```mermaid
sequenceDiagram
    autonumber
    participant U as 👤
    participant TR as TimelineCreateRow
    participant TD as useTimelineDrag
    participant DR as timelineDrag (чистое)
    participant H as useAddTodo
    participant DB as PostgreSQL

    U->>TR: pointerdown на пустой строке
    TR->>TD: begin(event, {mode:"draw"})
    TD->>DR: tickAtOffset(x, width, count) → anchorTick

    loop движение
        TD->>DR: tickAtOffset → pointerTick
        TD->>DR: draftRange(anchor, pointer, ticks, scale)
        Note over TD: черновик размещается ТОЙ ЖЕ placeItem,<br/>что и сохранённые полосы
    end
    TR-->>U: 🔵 полоса рисуется

    U->>TD: pointerup
    TD->>TR: onDraw({start, end})
    TR->>H: mutate({title, column_id, start_date, due_date})
    Note over H: единственная поверхность, где<br/>ДИАПАЗОН и есть жест —<br/>обе даты в оптимистичной строке

    H->>DB: UPSERT todos
    DB->>DB: 📐 todos_date_range_check: start <= due
    DB->>DB: ⚙️ board_key · activity
```

📖 [13 · Timeline](13-timeline.md)

---

## 9 · Изменение задачи (назначить исполнителя)

```mermaid
sequenceDiagram
    autonumber
    participant U as 👤
    participant AC as AssigneeControl
    participant BM as useBoardMembers
    participant P as useTodoPatch
    participant UT as useUpdateTodo
    participant Q as кэш
    participant DB as PostgreSQL

    U->>AC: открывает пикер
    AC->>BM: 🔐 rpc board_roster(boardId)
    Note over BM: profiles — self-only.<br/>Список RPC = граница раскрытия
    BM-->>AC: участники

    U->>AC: выбирает человека
    AC->>P: patch({assignee_id})
    P->>UT: mutate({id, board_id, assignee_id})
    UT->>DB: UPDATE todos SET assignee_id WHERE id

    rect rgb(255,245,230)
    DB->>DB: 🔐 RLS USING + WITH CHECK (editor+)
    DB->>DB: ⚙️ todos_log_activity → 'assigned'
    DB->>DB: ⚙️ todos_notify_assignment<br/>3 ранних выхода: null · сам себе ·<br/>is not distinct from old
    DB->>DB: → INSERT notifications
    end

    DB-->>UT: обновлённая строка
    UT->>Q: setQueryData(applyTodoUpdated)
    UT->>Q: invalidateQueries(todo(id))
    Note over UT: инвалидация, НЕ патч: мутация вернула<br/>УЗКУЮ строку, а панель держит полную
```

**Заметь:** viewer **может** быть назначен — назначение требует членства, а не
права записи (решение M5-05).

📖 [05 · Data flow](05-data-flow.md) · [14 · Уведомления](14-notifications.md)

---

## 10 · Приглашение участника

```mermaid
sequenceDiagram
    autonumber
    participant A as 👤 Admin
    participant CB as InviteeCombobox
    participant H as useCreateInvite
    participant DB as PostgreSQL

    A->>CB: печатает "ann"
    CB->>DB: 🔐 rpc search_board_invitees
    Note over DB: admin+ · ≥2 символа · ≤8 строк<br/>исключает: себя, участников, приглашённых

    A->>H: mutate({board_id, role: "editor", email})
    H->>DB: 🔐 rpc create_invite

    rect rgb(255,240,240)
    DB->>DB: 1️⃣ auth.uid() ≠ null иначе 28000
    DB->>DB: 2️⃣ участник? иначе 42501
    DB->>DB: 3️⃣ роль известна? иначе 22023
    DB->>DB: 4️⃣ role ≠ 'owner' иначе 42501
    DB->>DB: 5️⃣ actor_rank ≥ admin иначе 42501
    DB->>DB: 6️⃣ actor_rank > new_rank (СТРОГО) иначе 42501
    DB->>DB: token = gen_random_bytes(24) — 192 бита
    DB->>DB: expires = now() + clamp(days, 1..30)
    DB->>DB: INSERT board_invites
    DB->>DB: ⚙️ notify_on_invite → notifications<br/>🔒 entity_id = invite.id, НЕ token
    end

    DB-->>H: {id, token, role, expires_at, email}
    H->>H: invalidate invites(boardId) + inviteeSearches(boardId)
```

📖 [15 · Приглашения](15-invitations.md)

---

## 11 · Принятие приглашения

```mermaid
sequenceDiagram
    autonumber
    participant B as 👤 Приглашённый
    participant NP as NotificationsPanel
    participant MI as useMyInvites
    participant IA as InviteActions
    participant DB as PostgreSQL

    B->>NP: открывает 🔔
    NP->>DB: SELECT notifications (🔐 user_id = auth.uid())
    NP->>MI: 🔐 rpc my_pending_invites()
    Note over DB: адрес читается ИЗ ПРОФИЛЯ вызывающего.<br/>Аргумента «чей инбокс» НЕ существует.<br/>🔑 единственный источник токена
    MI-->>NP: [{id, token, role, board_id, board_title}]
    NP->>NP: inviteIdOf(n) сопоставляет entity_id ↔ invite.id

    B->>IA: [Accept]
    Note over IA: e.stopPropagation() — строка позади<br/>это кнопка навигации
    IA->>DB: 🔐 rpc accept_invite(token)

    rect rgb(240,255,240)
    DB->>DB: SELECT … FOR UPDATE 🔒 блокировка
    DB->>DB: not found → P0002
    DB->>DB: expires_at <= now() → 22023
    DB->>DB: role = 'owner' → 42501
    DB->>DB: уже участник? → 'already_member' ✅ НЕ ошибка
    DB->>DB: accepted_at ≠ null → 23505
    DB->>DB: INSERT board_members ON CONFLICT DO NOTHING
    DB->>DB: UPDATE accepted_at = now()
    end

    DB-->>IA: {status:'accepted', board_id}
    IA->>B: navigate(/boards/:id)
    Note over B: доска стала видна:<br/>accessible_board_ids() теперь<br/>включает её через board_members
```

📖 [15 · Приглашения](15-invitations.md)

---

## 12 · Отклонение приглашения

```mermaid
sequenceDiagram
    autonumber
    participant B as 👤
    participant IA as InviteActions
    participant H as useDeclineInvite
    participant DB as PostgreSQL

    B->>IA: [Decline]
    Note over IA: тихая кнопка, НЕ красная:<br/>отказ ничего не разрушает<br/>и полностью обратим
    IA->>H: mutate(token)
    H->>DB: 🔐 rpc decline_invite(token)

    rect rgb(245,245,255)
    DB->>DB: auth.uid() ≠ null иначе 28000
    DB->>DB: email вызывающего ИЗ ПРОФИЛЯ
    DB->>DB: DELETE board_invites WHERE token<br/>AND accepted_at is null<br/>AND expires_at > now()<br/>AND lower(email) = lower(v_email)
    DB->>DB: get diagnostics row_count
    end

    DB-->>H: boolean
    Note over DB: 🔒 false для неизвестного, чужого,<br/>принятого и истёкшего ОДИНАКОВО —<br/>анти-oracle
    H->>H: invalidate myInvites() + notifications()
```

📖 [15 · Приглашения](15-invitations.md)

---

## 13 · Изменение роли участника

```mermaid
sequenceDiagram
    autonumber
    participant O as 👤 Owner
    participant MR as MemberRow
    participant PM as usePermissions
    participant H as useMemberMutations
    participant DB as PostgreSQL

    MR->>PM: какие роли я могу назначать?
    PM->>PM: assignableRoles(myRole)
    Note over PM: 'owner' НИКОГДА не в списке —<br/>инвариант I6
    PM->>PM: canActOnMember(myRole, targetRole)
    Note over PM: target === 'owner' → false ДО арифметики

    O->>MR: editor → admin
    MR->>H: mutate({boardId, userId, role})
    H->>DB: 🔐 rpc set_member_role

    rect rgb(255,240,240)
    DB->>DB: 1️⃣ auth.uid() ≠ null → 28000
    DB->>DB: 2️⃣ actor_rank ≠ null → 42501
    DB->>DB: 3️⃣ 🔑 is_board_owner(target)? → 42501<br/>ПЕРВЫМ, до арифметики рангов
    DB->>DB: 4️⃣ p_role = 'owner'? → 42501
    DB->>DB: 5️⃣ actor_rank ≥ admin → 42501
    DB->>DB: 6️⃣ SELECT target FOR UPDATE
    DB->>DB: 7️⃣ actor_rank > target_rank (СТРОГО)
    DB->>DB: UPDATE board_members SET role
    DB->>DB: ⚙️ board_members_owner_immutable (BEFORE)<br/>защищает даже от service_role
    DB->>DB: ⚙️ board_members_log_activity
    end

    H->>H: invalidate members(boardId)
```

**Почему проверка владельца стоит третьей, до арифметики:** *«so the Owner stays
untouchable even if the arithmetic below were wrong»* — defence in depth внутри
одной функции.

📖 [08 · Безопасность](08-security.md)

---

## 📊 Сводная таблица

| # | Journey | Оптимистично? | 🔐 Точки безопасности | ⚙️ Триггеры |
|---|---|---|---|---|
| 1 | Регистрация | — | `username_available`, unique index | `handle_new_user`, `on_auth_user_confirmed` |
| 2 | Вход | — | `login_email_for`, одинаковое сообщение | — |
| 3 | Сброс пароля | — | ответ не зависит от существования адреса | — |
| 4 | Создать Space | ❌ | RLS owner-only, CHECK длины | `spaces_set_updated_at` |
| 5 | Создать Board | ❌ | RLS INSERT, `boards_space_ownership` | `boards_add_owner_membership` 🔑 |
| 6 | Создать задачу | ✅ | RLS `WITH CHECK`, composite FK | `assign_board_key`, `log_activity`, `notify_assignment` |
| 7 | Переместить задачу | ✅ | RLS `USING`+`WITH CHECK`, composite FK | `log_activity` |
| 8 | Timeline-росчерк | ✅ | то же + `date_range_check` | то же |
| 9 | Назначить исполнителя | ✅ | RLS, `board_roster` | `log_activity`, `notify_assignment` |
| 10 | Пригласить | ❌ | 6 проверок в RPC, токен на сервере | `notify_on_invite` |
| 11 | Принять | ❌ | `FOR UPDATE`, 5 проверок | — |
| 12 | Отклонить | ❌ | адрес у вызывающего, единый `false` | — |
| 13 | Сменить роль | ❌ | 7 проверок, владелец первым | `owner_immutable`, `log_activity` |

**Закономерность:** оптимистично обновляется только то, **результат чего
предсказуем** — операции над задачами. Всё, что проходит через RPC с проверками
прав, ждёт ответа сервера, потому что клиент не может знать заранее, разрешат ли.

---

## 🧪 Мини-квиз

<details>
<summary><b>1.</b> Почему создание задачи оптимистично, а создание доски — нет?</summary>

Потому что результат создания задачи **предсказуем**: клиент знает id (сам его
сминтил), колонку, ранг и всё, что покажет карточка, кроме `board_key`. Создание
доски проходит через триггеры (`boards_add_owner_membership`) и возвращает
поля, которые клиент угадать не может, а сама операция редкая — экономия одного
round-trip'а не стоит сложности.
</details>

<details>
<summary><b>2.</b> Какой шаг в journey «создание доски» самый важный и почему?</summary>

Триггер `boards_add_owner_membership`. Без него `accessible_board_ids()` вернул
бы доску (по `owner_id`), но `board_role()` вернул бы `null` — и владелец **не
смог бы писать** в собственную доску, потому что все write-политики читают
`board_role`, а не владение.
</details>

<details>
<summary><b>3.</b> В journey 11 «уже участник» возвращается ДО проверки <code>accepted_at</code>. Зачем такой порядок?</summary>

Типичный сценарий — человек принял приглашение и снова открыл ту же ссылку из
письма. Он действительно участник, и правильный ответ — отвести на доску.
Проверка `accepted_at` предназначена для **другого** человека, пытающегося
использовать уже погашенный токен. Обратный порядок пугал бы законного
участника ошибкой «приглашение уже использовано».
</details>

<details>
<summary><b>4. Predict:</b> в journey 7 сеть отвалилась после оптимистичной записи. Что увидит пользователь?</summary>

Карточка вернётся на место (`onError` восстановит `previousTodos`) и появится
тост от `MutationCache.onError`. Если снимка не было — запись кэша удалится
целиком (`removeQueries`), потому что `setQueryData(key, undefined)` — no-op и
оптимистичный порядок пережил бы отказ. Ретрая не будет: `mutations.retry: false`.
</details>

<details>
<summary><b>5.</b> Почему в journey 9 <code>useUpdateTodo</code> инвалидирует <code>todo(id)</code>, а не патчит?</summary>

Потому что мутация возвращает **узкую** проекцию строки (12 колонок доски), а
запись `todo(id)` держит полную строку с `description`. Мёрдж оставил бы
`description` в состоянии «до правки». Инвалидация бесплатна, когда панель
детали закрыта: у запроса нет наблюдателя, и refetch не произойдёт.
</details>

<details>
<summary><b>6.</b> Что общего у journey 3, 12 и части journey 2 с точки зрения безопасности?</summary>

Все три **намеренно не различают** случаи, чтобы не стать оракулом. Сброс пароля
отвечает одинаково независимо от существования адреса. `decline_invite` возвращает
`false` для неизвестного, чужого, принятого и истёкшего токена одинаково. Вход
даёт дословно одно сообщение при неизвестном username и при неверном пароле.
</details>

---

[← 24 · Деплой](24-deployment.md) · [Оглавление](README.md) · [Далее: 26 · Как построить это самому →](26-rebuild-from-zero.md)

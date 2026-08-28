# 01 · Big Picture Architecture

[← 00 · Overview](00-overview.md) · [Оглавление](README.md) · [Далее: 02 · Структура →](02-project-structure.md)

---

## 🧒 LEVEL 1 — Объясни ребёнку

> Представь ресторан, в котором **нет официантов**.

Ты сидишь за столом (браузер) и заказываешь еду. Обычно между тобой и кухней
стоит официант — он записывает заказ, проверяет, можно ли тебе это заказать,
несёт на кухню, приносит обратно.

В Veylo официанта нет. Ты говоришь **прямо на кухню** (в базу данных). Но у
двери кухни стоит охранник, который знает про тебя всё: кто ты, к каким столам
приписан, что тебе можно трогать. Он не пропускает ничего лишнего — и он стоит
там всегда, даже если ты пришёл не через зал, а через окно.

Этот охранник — **Row Level Security**. Отсутствие официанта — **BaaS
(Backend-as-a-Service)**.

---

## 👷 LEVEL 2 — Слои системы

```mermaid
flowchart TD
    subgraph Browser["🌐 БРАУЗЕР"]
        direction TB
        DOM["DOM / события пользователя"]
        RC["React 19 · компоненты<br/><i>components/, pages/</i>"]
        HK["Кастомные хуки<br/><i>hooks/, services/*/use*.ts</i>"]
        TQ["TanStack Query<br/><i>кэш = единственный state-слой</i>"]
        SVC["Сервисный слой<br/><i>services/*/….Api.ts — сырой Supabase</i>"]
        SDK["@supabase/supabase-js<br/><i>services/api/supabase.ts</i>"]

        DOM --> RC --> HK --> TQ
        HK --> SVC --> SDK
        TQ -.->|"кэш читается<br/>компонентами"| RC
    end

    subgraph Net["📡 СЕТЬ"]
        HTTPS["HTTPS · REST + RPC"]
        WS["WebSocket · Realtime"]
    end

    SDK --> HTTPS
    SDK --> WS

    subgraph Supabase["☁️ SUPABASE"]
        direction TB
        GT["GoTrue — Auth<br/><i>JWT, refresh, recovery</i>"]
        PR["PostgREST<br/><i>таблица → REST-эндпоинт</i>"]
        RT["Realtime<br/><i>WAL → WebSocket</i>"]
        ST["Storage<br/><i>bucket avatars</i>"]
    end

    HTTPS --> GT
    HTTPS --> PR
    HTTPS --> ST
    WS --> RT

    subgraph PG["🐘 POSTGRESQL 17"]
        direction TB
        RLS["🔐 RLS-политики<br/><i>граница безопасности</i>"]
        RPC["SECURITY DEFINER RPC<br/><i>привилегированные операции</i>"]
        TRG["Триггеры<br/><i>инварианты, activities, notifications</i>"]
        CON["Constraints + FK + индексы"]
        TBL["Таблицы (10)"]

        RLS --> TBL
        RPC --> TBL
        TRG --> TBL
        CON --> TBL
    end

    GT --> TBL
    PR --> RLS
    PR --> RPC
    RT --> TBL
    ST --> RLS

    style RLS fill:#ef4444,color:#fff
    style TQ fill:#8b5cf6,color:#fff
    style TBL fill:#3b82f6,color:#fff
```

### Что делает каждый слой

| Слой | Файлы | Ответственность | Чего здесь **не должно** быть |
|---|---|---|---|
| **Компоненты** | `components/`, `pages/` | разметка, события, локальный UI-state | сетевые вызовы, бизнес-правила |
| **Хуки** | `hooks/`, `services/*/use*.ts` | склейка «данные ↔ UI», кэш-стратегия | JSX, разметка |
| **Сервисы** | `services/*/…Api.ts` | сырые вызовы Supabase, форма запроса | React, кэш, хуки |
| **Клиент** | `services/api/supabase.ts` | один типизированный синглтон | что угодно ещё |
| **PostgREST** | — | таблица → REST | — |
| **RLS** | `supabase/migrations/*.sql` | **вся авторизация** | — |
| **Триггеры** | миграции | инварианты, которые должны держаться для **любого** писателя | — |
| **RPC** | миграции | операции, требующие обхода RLS + собственной проверки | — |

**Правило, которое стоит запомнить дословно** (из `docs/FRONTEND.md`):

> *«Business logic should never live inside UI components.»*

и из плана (Part II, Enforcement rule 2):

> *«Frontend permission checks are UX only. They decide what to render. They are
> never a security control.»*

---

## 🏛 LEVEL 3 — Почему именно так

### Почему нет своего backend-сервера

| | Свой Node/Express API | Supabase (выбрано) |
|---|---|---|
| Кода писать | много (роуты, DTO, ORM, auth middleware) | почти нет |
| Где авторизация | в middleware — **и её можно забыть** | в RLS — **её нельзя обойти** |
| Realtime | ставить socket.io, писать fan-out | из коробки, через WAL |
| Типы | руками или через кодогенерацию | `supabase gen types` из живой схемы |
| Стоимость ошибки | забыл проверку → утечка | забыл политику → **таблица недоступна вообще** |
| Гибкость | любая | ограничена тем, что выражается в SQL |
| Vendor lock-in | нет | есть (но это PostgreSQL, миграции — обычный SQL) |

**Ключевой аргумент:** в middleware-подходе безопасность — это *действие*,
которое нужно не забыть совершить. В RLS-подходе безопасность — это *свойство
таблицы*: включил `enable row level security` без политик, и таблица не отдаёт
ничего вообще. **Дефолт стал безопасным.**

**Когда это решение было бы плохим:** если бы понадобилась тяжёлая серверная
логика (генерация PDF, интеграции с внешними API, фоновые задачи, ML).
Тогда — Edge Functions или отдельный сервис. Veylo этого не требует.

### Почему TanStack Query, а не Redux/Zustand для данных

Redux решает задачу «синхронизировать состояние **клиента**». Задача Veylo
другая: «показывать **чужие** данные, которые могут устареть».

Это разные проблемы. Серверный state:
- нельзя «просто изменить» — можно только попросить сервер и подождать
- устаревает сам по себе
- нуждается в дедупликации запросов, ретраях, инвалидации, фоновом обновлении

Redux всё это заставляет писать руками. TanStack Query это **и есть**.

Zustand в проекте **есть** (`src/stores/`), но используется ровно для двух
клиентских вещей: `toasts.ts` (очередь тостов) и `doneFlash.ts` (анимация
«карточка попала в Done»). Это правильное разделение: серверные данные — Query,
эфемерный UI-state — Zustand.

### Три «странных» решения, за которые стоит уметь ответить

1. **URL — это state.** Фильтры, сортировка, группировка, режим представления,
   открытая задача, открытая панель — всё в search params (`?view=`, `?task=`,
   `?panel=`, `?sort=`, …). Следствие: любое состояние доски шарится ссылкой,
   Back работает, refresh не теряет контекст. Цена: URL длинный, и всё, что
   приходит из него, — **недоверенный ввод** (см. `readOne`/`readList` в
   `hooks/useBoardView.ts`, которые валидируют против белого списка).

2. **Клиент генерирует UUID.** `crypto.randomUUID()` в `useAddTodo`.
   Optimistic-строка **является** реальной строкой. Нет флага `isOptimistic`,
   нет примирения id. `addTodo` делает `upsert` (не `insert`), поэтому гонка
   между созданием и перемещением не оставляет полузаписанную строку.

3. **Порядок хранится как `double precision`, а не как индекс.**
   См. [главу 12](12-kanban.md). Одно перетаскивание = запись **одной строки**.

---

## 🎬 «Что происходит, когда я нажимаю кнопку?» — 5 полных трассировок

Это самая ценная часть главы. Учись рассказывать их вслух.

---

### Трассировка 1 · Создание задачи

**Жест:** пользователь набирает заголовок в `TodoCreateForm` и жмёт Enter.

```mermaid
sequenceDiagram
    autonumber
    participant U as 👤 Пользователь
    participant C as TodoCreateForm
    participant H as useAddTodo
    participant Q as TanStack Query cache
    participant A as todoApi.addTodo
    participant PR as PostgREST
    participant DB as PostgreSQL

    U->>C: Enter
    C->>H: mutate({title, column_id, index})
    Note over H: crypto.randomUUID() — id рождается ЗДЕСЬ

    rect rgb(230, 240, 255)
    Note over H,Q: onMutate — оптимистично
    H->>Q: cancelQueries(["todos", boardId])
    H->>Q: getQueryData → previousTodos (снимок для отката)
    H->>H: rankForDrop(колонка, index) → optimisticRank
    H->>Q: setQueryData(applyTodoInserted(...))
    end

    Q-->>U: 🟢 Карточка на экране (без KAN-номера)

    H->>A: addTodo({id, title, column_id, board_id, ...})
    A->>A: supabase.auth.getUser() → creator_id
    A->>PR: SELECT position,rank … ORDER BY rank DESC LIMIT 1
    PR->>DB: (через RLS "Members select todos")
    DB-->>A: последняя строка колонки
    A->>A: rankForAppend(...) → rank
    A->>PR: UPSERT todos (onConflict: id) RETURNING …

    rect rgb(255, 245, 230)
    Note over DB: В БАЗЕ
    PR->>DB: INSERT
    DB->>DB: 🔐 RLS WITH CHECK<br/>board_role(board_id) ∈ (owner,admin,editor)
    DB->>DB: ⚙️ BEFORE INSERT: todos_assign_board_key<br/>board_key := boards.next_key++
    DB->>DB: ⚙️ AFTER INSERT: log_todo_activity → activities
    DB->>DB: ⚙️ AFTER INSERT: notify_on_assignment<br/>(только если assignee_id ≠ автор)
    DB-->>PR: строка с board_key
    end

    PR-->>H: serverTodo
    rect rgb(230, 255, 235)
    Note over H,Q: onSuccess — примирение
    H->>Q: applyTodoConfirmed — сохраняем ВЫБРАННЫЙ слот,<br/>а не серверный append
    H->>A: moveTodo(...) если rank разошёлся
    H->>A: reorderTodos(...) если position разошёлся
    end
    Q-->>U: 🟢 KAN-14 появился на карточке

    Note over Q: MutationCache.onSuccess →<br/>invalidateQueries(["activities"])
```

**Что здесь важно понимать:**

- `onMutate` **синхронный по эффекту**: карточка на экране до сети.
- Сервер всегда `append`-ит в конец колонки. Клиент помнит, в какой **зазор**
  пользователь вставил карточку, и после ответа **дописывает** правильный
  rank. Без этого карточка визуально прыгала бы вниз в момент ответа.
- `board_key` (номер `KAN-14`) клиент знать не может — его выдаёт триггер.
  Пока строка «в полёте», `board_key = null`, и это **и есть** индикатор
  pending-состояния. Отдельный флаг не нужен.

📖 Подробно: [05 · Data flow](05-data-flow.md), [12 · Kanban](12-kanban.md).

---

### Трассировка 2 · Перетаскивание карточки в другую колонку

**Жест:** пользователь тащит `KAN-7` из «To Do» в «Done», между двумя карточками.

```mermaid
sequenceDiagram
    autonumber
    participant U as 👤
    participant DK as DndContext (@dnd-kit)
    participant CD as collisionDetection<br/>(useKanbanDnd)
    participant DE as useBoardDragEnd
    participant RI as resolveDropIndex
    participant M as useTodoDrop
    participant Q as Query cache
    participant DB as PostgreSQL

    U->>DK: pointerdown + 8px
    DK->>CD: onDragMove (каждый кадр)
    Note over CD: НЕ пересечение прямоугольников.<br/>1) ближайшая КОЛОНКА (≤80px)<br/>2) ближайший ЗАЗОР внутри неё<br/>3) touchesActive → зазор рядом<br/>с самой карточкой отбрасывается
    CD-->>DK: [{id: "todo-gap:col-done:2"}]
    DK->>DE: onDragOver → setIndicator({columnId, index:2})
    Note over U: 🔵 Синяя линия в зазоре

    U->>DK: pointerup
    DK->>DE: onDragEnd

    DE->>DE: destination.category === "done"<br/>&& другая колонка → flashDone(id)
    DE->>RI: resolveDropIndex(full, visible, gap=2, activeId)
    Note over RI: Зазор → ИМЯ карточки под ним.<br/>Имя переживает фильтр, сортировку,<br/>swimlane. Индекс — нет.
    RI-->>DE: index в терминах хранимой колонки

    DE->>M: mutate({todos, activeTodo, columnId, index})

    rect rgb(230,240,255)
    M->>M: rankForDrop(destination без карточки, index)
    Note over M: rankBetween(before, after)<br/>= before + (after-before)/2
    M->>Q: setQueryData(applyTodoMoved) — ОДНА строка
    end
    Q-->>U: 🟢 Карточка на месте мгновенно

    M->>DB: UPDATE todos SET column_id=?, rank=?<br/>WHERE id=? AND board_id=?
    DB->>DB: 🔐 RLS USING + WITH CHECK (editor+)
    DB->>DB: 🔗 FK (column_id, board_id) → columns(id, board_id)
    DB->>DB: ⚙️ log_todo_activity → 'moved'
    DB-->>M: 204

    Note over M: 📡 Realtime: UPDATE прилетает<br/>другим клиентам → applyTodoUpdated
```

**Если запись провалилась** (`onError`): восстанавливается снимок
`previousTodos`, карточка возвращается на место, `MutationCache` показывает
тост с текстом ошибки. Если снимка не было — запись кэша удаляется целиком,
и `useTodos` перезагружает правду.

**Если ранги «кончились»** (`rankBetween` вернул `null` — ≈50 подряд вставок
в один зазор): вызывается RPC `rebalance_column_ranks`, кэш перечитывается,
ранг вычисляется заново. Повтор ровно один: после ребаланса ранги снова кратны
1024, второй `null` означал бы, что ребаланс не сработал.

📖 Подробно: [12 · Kanban и DnD](12-kanban.md).

---

### Трассировка 3 · Регистрация нового пользователя

```mermaid
sequenceDiagram
    autonumber
    participant U as 👤
    participant F as RegisterForm
    participant UA as useUsernameAvailability
    participant API as authApi.signUp
    participant GT as GoTrue
    participant Mail as 📧 Почта
    participant DB as PostgreSQL

    U->>F: печатает username "ada"
    F->>UA: debounce 350ms
    UA->>UA: isUsernameShapeValid — локально
    UA->>DB: rpc username_available('ada')
    Note over DB: SECURITY DEFINER, STABLE.<br/>Возвращает ТОЛЬКО boolean.<br/>Доступен anon — форма регистрации<br/>по определению без сессии.
    DB-->>UA: true
    UA-->>F: 🟢 «available» — но это СОВЕТ, не гарантия

    U->>F: submit
    F->>API: signUp(email, password, username)
    API->>GT: auth.signUp({... options.data: {username}})
    Note over GT: username едет в<br/>auth.users.raw_user_meta_data —<br/>единственный канал, потому что<br/>сессии ещё нет и auth.uid() = null
    GT->>DB: INSERT auth.users (confirmed_at = NULL)
    DB->>DB: ⚙️ handle_new_user():<br/>available_username(meta.username ?? email-префикс)<br/>→ INSERT profiles ON CONFLICT DO NOTHING
    GT->>Mail: письмо с confirm-ссылкой
    GT-->>API: {user, session: null}
    API-->>F: needsConfirmation: true
    F-->>U: «Проверьте почту»

    U->>Mail: клик по ссылке
    Mail->>GT: подтверждение
    GT->>DB: UPDATE auth.users SET email_confirmed_at = now()
    DB->>DB: ⚙️ on_auth_user_confirmed → provision_user(id)
    Note over DB: ИДЕМПОТЕНТНО, одна транзакция:<br/>profile + space «My Space»<br/>+ board «My Board»<br/>+ 4 колонки
    GT-->>U: сессия → редирект в приложение
```

**Три вещи, которые тут стоит уметь объяснить:**

1. **Почему username едет через метаданные, а не INSERT в `profiles`?**
   Потому что подтверждение обязательно (`enable_confirmations = true` в
   `supabase/config.toml`), сессии нет, `auth.uid()` равен `null`, и RLS не
   пропустит запись. Метаданные переживают разрыв между регистрацией и
   подтверждением.

2. **Почему `provision_user` идемпотентен?** Потому что у него два вызывающих:
   триггер на подтверждении и RPC `provision_new_user` при каждом входе (как
   ремонтный путь). Первым делом он ищет существующую доску владельца и, если
   нашёл, возвращает её — второй запуск не создаёт второй аккаунт.

3. **Почему `handle_new_user` не имеет права падать?** Он выполняется **внутри**
   вставки в `auth.users`. Исключение откатило бы регистрацию целиком. Отсюда
   `on conflict (id) do nothing` и `available_username`, который не отказывает,
   а подбирает свободное имя.

📖 Подробно: [09 · Auth](09-auth.md), [10 · Usernames](10-usernames.md).

---

### Трассировка 4 · Приглашение коллеги и его принятие

```mermaid
sequenceDiagram
    autonumber
    participant A as 👤 Admin
    participant IM as InvitePeopleModal
    participant CI as useCreateInvite
    participant DB as PostgreSQL
    participant B as 👤 Приглашённый
    participant NP as NotificationsPanel

    A->>IM: выбирает адресата (InviteeCombobox)
    IM->>DB: rpc search_board_invitees(board_id, "ann")
    Note over DB: SECURITY DEFINER, admin+ only,<br/>min 2 символа, max 8 строк,<br/>исключает: себя, уже участников,<br/>уже приглашённых
    DB-->>IM: до 8 профилей

    A->>IM: роль = editor, Send
    IM->>CI: mutate({board_id, role, email})
    CI->>DB: rpc create_invite(...)

    rect rgb(255,240,240)
    Note over DB: ПРОВЕРКИ ВНУТРИ RPC
    DB->>DB: auth.uid() != null иначе 28000
    DB->>DB: board_role_rank(board_role(board_id)) ≥ admin
    DB->>DB: role ≠ 'owner' — владение не даётся приглашением
    DB->>DB: actor_rank > new_rank — строго ниже себя
    DB->>DB: token := encode(gen_random_bytes(24),'hex')
    DB->>DB: expires_at := now() + clamp(days, 1..30)
    DB->>DB: INSERT board_invites
    DB->>DB: ⚙️ notify_on_invite → INSERT notifications<br/>(entity_id = invite.id, НЕ token)
    end
    DB-->>CI: {id, token, role, expires_at, email}

    B->>NP: открывает 🔔
    NP->>DB: SELECT notifications (RLS: user_id = auth.uid())
    NP->>DB: rpc my_pending_invites()
    Note over DB: Токен приходит ТОЛЬКО отсюда —<br/>RPC сам находит адрес вызывающего
    NP-->>B: «Ann пригласил вас в Board X · As editor» [Accept] [Decline]

    B->>DB: rpc accept_invite(token)
    rect rgb(240,255,240)
    DB->>DB: SELECT … FOR UPDATE — блокировка строки
    DB->>DB: expires_at > now()
    DB->>DB: role ≠ 'owner'
    DB->>DB: уже участник? → 'already_member', выход
    DB->>DB: accepted_at не null? → 23505
    DB->>DB: INSERT board_members ON CONFLICT DO NOTHING
    DB->>DB: UPDATE board_invites SET accepted_at = now()
    end
    DB-->>B: {status:'accepted', board_id}
    B->>B: navigate(/boards/:id) — доска теперь видна через RLS
```

**Ключевая деталь безопасности:** уведомление хранит **id приглашения**, а не
токен. Токен — это credential. Если бы он лежал в строке, которую клиент
получает обычным SELECT, инбокс превратился бы в место, откуда приглашение
может погасить любой, кто эту строку прочитает. Токен выдаёт только
`my_pending_invites()`, который сам определяет адрес вызывающего изнутри
функции — параметра «чей инбокс» просто не существует.

📖 Подробно: [15 · Invitations](15-invitations.md), [14 · Notifications](14-notifications.md).

---

### Трассировка 5 · Realtime — коллега двигает карточку, ты это видишь

```mermaid
sequenceDiagram
    autonumber
    participant B as 👤 Боб (другой браузер)
    participant DB as PostgreSQL
    participant WAL as WAL / logical replication
    participant RT as Supabase Realtime
    participant WS as WebSocket (у тебя)
    participant H as useBoardRealtime
    participant Q as Query cache
    participant UI as Твой экран

    Note over H: При монтировании BoardPage:<br/>channel(`board:${boardId}`)<br/>+ filter board_id=eq.<boardId><br/>+ presence key = userId

    B->>DB: UPDATE todos SET column_id=…, rank=…
    DB->>WAL: запись в журнал
    WAL->>RT: logical replication
    RT->>RT: 🔐 проверка RLS для КАЖДОГО подписчика
    RT->>WS: payload {eventType:'UPDATE', new:{...}}
    WS->>H: обработчик postgres_changes
    H->>H: applyTodoEvent(old, change)
    Note over H: DELETE → applyTodoDeleted<br/>INSERT → applyTodoInserted (если id неизвестен)<br/>UPDATE → applyTodoUpdated (если id известен)
    H->>Q: setQueryData(["todos", boardId], …)
    Q->>UI: 🟢 карточка переехала
```

**Три тонкости, которые отличают рабочий realtime от «почти рабочего»:**

1. **Те же самые чистые функции.** `applyTodoInserted` / `applyTodoUpdated` /
   `applyTodoDeleted` живут в `services/todos/cache.ts` — вне замыканий
   мутаций. Локальное перетаскивание и удалённое событие применяют **один и тот
   же код** к **одному и тому же массиву**. Иначе это были бы две реализации
   одного правила.

2. **Подавление эха.** `applyTodoEvent` проверяет, знает ли кэш этот `id`:
   `INSERT` для известной строки игнорируется (это эхо собственной мутации),
   `UPDATE` для неизвестной — тоже (значит `INSERT` был потерян, и починит это
   ресинк при переподписке, а не выдумывание строки из update-payload).

3. **Канал один и живёт на `BoardPage`.** Не в каждом представлении. Board,
   List, Summary, Calendar и Timeline читают те же записи кэша — они стали
   live одновременно, и ни одно из них не знает, что realtime существует.

📖 Подробно: [05 · Data flow](05-data-flow.md) § Realtime.

---

## 🧭 Правило, которое объясняет 80% решений

```
                 ┌─────────────────────────────┐
                 │  Появилась новая фича.      │
                 │  Где её место?              │
                 └────────────┬────────────────┘
                              │
              ┌───────────────┴───────────────┐
              │  Это ПРАВИЛО ДОСТУПА?         │
              └───────┬───────────────┬───────┘
                    да│               │нет
                      ▼               ▼
        ┌──────────────────┐   ┌──────────────────────────┐
        │ RLS / триггер /  │   │ Это ИНВАРИАНТ, который   │
        │ SECURITY DEFINER │   │ должен держаться для     │
        │ RPC              │   │ ЛЮБОГО писателя?         │
        │                  │   └──────┬──────────────┬────┘
        │ + зеркало в      │        да│              │нет
        │ permissions.ts   │          ▼              ▼
        │ ТОЛЬКО для UX    │   ┌────────────┐  ┌──────────────┐
        └──────────────────┘   │ CONSTRAINT │  │ Это ЗАПРОС   │
                               │ или TRIGGER│  │ или МУТАЦИЯ? │
                               └────────────┘  └──────┬───────┘
                                                      ▼
                                          ┌───────────────────────┐
                                          │ services/<feature>/   │
                                          │   <feature>Api.ts     │
                                          │   use<Thing>.ts       │
                                          │ + ключ в queryKeys.ts │
                                          │ + чистая логика в     │
                                          │   *.ts с *.test.ts    │
                                          └───────────────────────┘
```

---

## 🧪 Мини-квиз

<details>
<summary><b>1.</b> Пользователь отключил JS-проверки и отправил <code>UPDATE todos</code> на чужую доску напрямую в PostgREST. Что произойдёт?</summary>

Запрос дойдёт до PostgreSQL, там сработает политика
`"Editors and above update todos"` с предикатом
`board_role(board_id) in ('owner','admin','editor')`. Для не-участника
`board_role` вернёт `NULL`, `null in (...)` даст `NULL`, а `USING` трактует
`NULL` как отказ. Результат: **0 строк обновлено** (для `USING`) либо ошибка
`42501` (если нарушен `WITH CHECK`). Ни одна чужая строка не изменится.
</details>

<details>
<summary><b>2.</b> Почему <code>collisionDetection</code> в Veylo не использует пересечение прямоугольников?</summary>

Потому что на доске **ничего не переливается во время перетаскивания** — карточки
не раздвигаются. Значит, попадать курсором «внутрь» зазора нечем: зазоры
тонкие. Вместо этого detection ищет **ближайший к курсору зазор** по расстоянию
центров. Это даёт предсказуемое поведение независимо от того, насколько точно
человек попал.
</details>

<details>
<summary><b>3.</b> Почему клиент генерирует UUID задачи, а не база?</summary>

Чтобы optimistic-строка **была** реальной строкой. Раньше клиент ставил
фейковый `Date.now()`-id, который потом нужно было заменить на настоящий —
отсюда флаг `isOptimistic` и лишняя логика примирения. Плюс: `addTodo` делает
`upsert` по этому id, поэтому если параллельный `reorderTodos` дойдёт до сервера
первым, он не создаст «половинчатую» строку — оба запроса сойдутся на одной.
</details>

<details>
<summary><b>4.</b> Realtime-канал открывается в <code>BoardPage</code>, а не в <code>KanbanBoard</code>. Почему это важно?</summary>

Потому что `KanbanBoard` — только одно из пяти представлений. Если бы канал
жил там, List/Summary/Calendar/Timeline не были бы live, а переключение вкладки
рвало бы и переоткрывало сокет. Канал на уровне страницы = одна подписка на
доску, живущая ровно столько, сколько открыта доска, и все представления
становятся live «бесплатно», потому что читают те же записи кэша.
</details>

<details>
<summary><b>5. Predict:</b> что покажет экран между <code>onMutate</code> и ответом сервера при создании задачи?</summary>

Карточку с заголовком, назначенным (если выбрали) и датой (если выбрали) —
**но без номера `KAN-N`**. Потому что `board_key` выдаёт `BEFORE INSERT`
триггер из `boards.next_key`, и клиент физически не может его знать заранее.
Отсутствие ключа **и есть** индикатор «в полёте».
</details>

---

[← 00 · Overview](00-overview.md) · [Оглавление](README.md) · [Далее: 02 · Структура проекта →](02-project-structure.md)

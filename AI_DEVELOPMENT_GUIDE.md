# AI Development Guide

Короткий постоянный контекст для AI-задач в этом проекте. Использовать вместе с `PROJECT_CONTEXT.md`, но не вместо него.

## 1. AI architecture

- Внешний VK AI backend — source of truth для AI conversation state.
- AI conversation state = `messages`, `files`, `voice state`, `conversation reset state`.
- Наш backend не является primary storage для AI conversation history.
- Наш backend выступает как:
  - proxy к внешнему VK AI backend
  - access layer
  - billing layer
  - usage tracking layer
- Backend contract для фронта обязан проходить через `/api/ai/*`.
- Ключевые AI routes:
  - `GET /api/ai/plans`
  - `GET /api/ai/access`
  - `GET /api/ai/conversations/:id`
  - `POST /api/ai/chat`
  - `POST /api/ai/files/upload`
  - `POST /api/ai/voice`
  - `POST /api/ai/conversations/:id/reset`

## 2. AI mode rules

- `chatMode = core | ai`.
- `core` и `ai` история не смешиваются.
- `core` и `ai` живут в одной UI-оболочке, но с разными источниками данных.
- `core` history:
  - хранится и синхронизируется через `workspace`
  - основная история лежит в `user_workspaces.chat_history_json`
- `ai` history:
  - приходит из внешнего VK AI backend
  - не хранится как основная история в `user_workspaces.chat_history_json`

## 3. AI context model

- `sessionContext` = per conversation.
- `userMemory` = per user.
- `sessionContext` относится к текущему AI conversation.
- `userMemory` относится к пользователю и применяется к новым AI-запросам.
- Порядок сборки prompt в backend:
  - `ИНСТРУКЦИЯ -> userMemory`
  - `КОНТЕКСТ -> sessionContext`
  - `ВОПРОС -> message`
- Если меняется prompt assembly, это уже архитектурное изменение, а не косметика.

## 4. Billing / access rules

- AI access и AI plans не должны определяться по display-полям UI баланса.
- Source of truth для покупки и доступа:
  - billing wallet
  - backend purchase flow
  - backend access resolution
- AI UI не должен предполагать доступ без `GET /api/ai/access`.
- Наличие денег на балансе само по себе не равно активному AI доступу.
- AI limits и capabilities должны читаться из backend access state, а не вычисляться на фронте "по ощущениям".

## 5. Prisma rules

- Если AI/billing код использует:
  - `productType`
  - `aiChatLimit`
  - `aiVoiceLimit`
  - `aiFileUploadLimit`
  эти поля обязаны быть в `back/prisma/schema.prisma`.
- `migration.sql` недостаточно без:
  - актуального `schema.prisma`
  - `prisma generate`
- Prisma Client генерируется из `schema.prisma`, а не из текста миграции.
- Mixed deployment возможен:
  - код уже новый, а серверная схема или generated client еще старые
  - поэтому fallback нужен, но считать его нормальным steady-state нельзя

## 6. Safe workflow

### Перед AI backend правками

- Проверить, кто source of truth для изменяемых данных.
- Проверить, не пытается ли правка смешать `core` и `ai`.
- Проверить backend contract `/api/ai/*`.
- Проверить, не утекает ли AI conversation state в `workspace` как primary storage.

### Перед `prisma generate` / `migrate`

- Проверить `back/prisma/schema.prisma`.
- Проверить, что runtime-код и schema используют одинаковые поля.
- Проверить, есть ли новые миграции.
- Помнить, что `migration.sql` без schema sync недостаточен.

### После rollout

- Проверить:
  - `/health`
  - `/api/billing/summary`
  - `/api/ai/plans`
  - `/api/ai/access`
  - `/api/workspace/me`
- Если менялись env / backend / prisma:
  - нужен `pm2 restart vk-backend --update-env`
- Проверять не только HTTP status, но и смысл ответа:
  - route смонтирован
  - access считается корректно
  - fallback не маскирует проблему

## 7. Anti-patterns

- Не объединять `core` и `ai` history в одну модель хранения.
- Не сохранять AI conversation history в `user_workspaces.chat_history_json` как primary history.
- Не считать fallback-ответы подтверждением исправности.
- Не считать `migration.sql` единственным источником истины.
- Не делать вывод "сломался auth", если `/api/ai/*` возвращает `404`:
  - сначала проверить mount route и версию реально запущенного backend
- Не привязывать AI access к display-логике фронта.
- Не вычислять AI entitlement только на клиенте.
- Не менять prompt assembly order без явного решения по архитектуре.

## 8. Mini diagnostics

- `404` на `/api/ai/*`:
  - обычно route не смонтирован или backend запущен со старым кодом
- `401`:
  - обычно токен / auth / refresh
- `500` с `Unknown argument productType`:
  - обычно schema/client/runtime рассинхронизированы
- `fallback activated`:
  - это деградация, не success-state

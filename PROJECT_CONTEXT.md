# VK-app: постоянный контекст проекта

## 1. Неподвижные правила проекта

- Основная рабочая ветка: `main`.
- Локальной MySQL базы на компьютере нет и не должно быть в качестве основной среды работы.
- Рабочая БД находится на сервере и должна использоваться через SSH-туннель:
  - `ssh -L 3306:127.0.0.1:3306 admin@195.140.146.86`
- Целевая MySQL база по данным пользователя: `chat-app`.
- В этом проекте `127.0.0.1:3306` не означает "локальная база", если поднят SSH-туннель. Это локальный порт-проброс к серверной MySQL.
- Все будущие правки, проверки Prisma и отладка БД должны быть ориентированы на серверную БД через туннель.

## 2. Стек и структура

- Монорепо на npm workspaces.
- Корень:
  - `package.json` содержит workspaces: `front`, `back`
  - общий dev-скрипт: `npm run dev`
  - корневой `npm run dev` запускает фронт и бэк через `concurrently`
- Frontend:
  - `front`
  - Vue 3
  - Vite
  - Pinia
  - VK Mini Apps / VK Bridge
- Backend:
  - `back`
  - Node.js ESM
  - Express
  - Prisma
  - MySQL
  - отдельный AI proxy/module поверх внешнего VK AI backend

## 3. Главные рабочие файлы

- Backend entry:
  - `back/src/server.js`
  - `back/src/app.js`
- Backend env:
  - `back/.env`
  - `back/src/config/env.js`
- Backend AI:
  - `back/src/modules/ai/ai.routes.js`
  - `back/src/modules/ai/ai.service.js`
  - `back/src/modules/ai/ai.client.js`
- Backend workspace:
  - `back/src/modules/workspace/workspace.routes.js`
  - `back/src/modules/workspace/workspace.service.js`
- Prisma schema:
  - `back/prisma/schema.prisma`
- Prisma migrations:
  - `back/prisma/migrations/20260405170000_init_prod_core/migration.sql`
  - `back/prisma/migrations/20260412120000_prod_billing_logic/migration.sql`
  - `back/prisma/migrations/20260413120000_plan_product_type_ai_limits/migration.sql`
- Frontend chat / AI:
  - `front/src/stores/chat.ts`
  - `front/src/components/chat/Chat.vue`
  - `front/src/components/chat/ChatContextPanel.vue`
  - `front/src/api/vkAi.ts`
  - `front/src/api/workspace.ts`
- Frontend env:
  - `front/.env.development`
  - `front/.env.production`
- Frontend API mode config:
  - `front/src/config/chatBackend.ts`
- Vite proxy:
  - `front/vite.config.ts`

## 4. Как реально запускается проект

- Корень:
  - `npm run dev`
  - требует `concurrently` в корневом `devDependencies`
- Backend:
  - `npm run dev --workspace=back`
  - `npm run start --workspace=back`
  - `npm run prisma:generate --workspace=back`
- Frontend:
  - `npm run dev --workspace=front`
  - `npm run build --workspace=front`
- Корневой deploy-скрипт сейчас есть в `package.json`:
  - `npm run install:all && npm run build:front && pm2 restart vk-backend`

## 5. Backend: основные модули

- `auth`
  - OAuth: VK / Google / Yandex
  - OTP по телефону
  - refresh/logout
- `users`
  - профиль пользователя
  - heartbeat активности
  - admin CRUD по пользователям
- `billing`
  - баланс кошелька
  - подписки
  - ledger
  - каталог core и AI-планов
  - YooKassa mock/stub-логика
- `usage`
  - учет запросов к моделям и AI-лимитов
  - возврат pending-операций
- `llm`
  - список моделей
  - чат через OpenAI-compatible провайдеров
- `ai`
  - access/plans для AI-подписок
  - proxy к внешнему VK AI backend
  - chat / file upload / voice / get conversation / reset conversation
  - списание AI-лимитов через `usage_events`
- `admin`
  - события
  - audit
  - ledger
  - метрики
- `workspace`
  - core chat history
  - notes
  - постоянная AI memory пользователя

## 6. Backend API: маршрутные группы

- `/health`
- `/api/auth`
- `/api/users`
- `/api/billing`
- `/api/payments`
  - alias на billing routes для обратной совместимости
- `/api/usage`
- `/api/llm`
- `/api/ai`
  - backend монтирует AI-модуль именно на `/api/ai`
  - фронт реально использует:
    - `/api/ai/access`
    - `/api/ai/plans`
    - `/api/ai/conversations/:id`
    - `/api/ai/chat`
    - `/api/ai/files/upload`
    - `/api/ai/voice`
    - `/api/ai/conversations/:id/reset`
- `/api/admin`
- `/api/workspace`
  - ключевые ручки:
    - `/api/workspace/me`
    - `/api/workspace/me/chat-history`
    - `/api/workspace/me/notes`
    - `/api/workspace/me/ai-memory`

## 7. Frontend: как общается с backend

- Основная база API берется из `VITE_API_BASE_URL` через `internalApiBaseUrl`.
- В dev Vite проксирует `/api` на `VITE_API_BASE_URL` или на `http://127.0.0.1:3000`.
- Переключатель backend-режима в env:
  - `VITE_CHAT_BACKEND_MODE=internal | vk-ai`
- При этом пользовательский chat runtime на фронте живет в `chatMode = 'core' | 'ai'`.
- `core` и `ai` живут в одной UI-оболочке (`Chat.vue`, `ChatInput.vue`, `Message.vue`), но используют разные источники данных.
- История `core` и `ai` не смешивается:
  - в store есть отдельные `coreMessages` и `aiMessages`
  - сохранение в localStorage разделено по mode
  - `core` синхронизируется через `workspace`
  - `ai` гидратируется через `/api/ai/conversations/:id`
- `core` режим:
  - история хранится в `user_workspaces.chat_history_json`
  - отправка идет в `/api/llm/chat`
  - синхронизация истории идет через `/api/workspace/me` и `/api/workspace/me/chat-history`
- `ai` режим:
  - access/plans грузятся через `/api/ai/access` и `/api/ai/plans`
  - сообщение отправляется в `/api/ai/chat`
  - файлы и голос идут через `/api/ai/files/upload` и `/api/ai/voice`
  - состояние AI-диалога читается через `/api/ai/conversations/:id`
  - reset идет через `/api/ai/conversations/:id/reset`

## 8. AI context model и хранение данных

- `sessionContext` = контекст текущей AI-сессии.
  - на фронте хранится локально, ключ зависит от `userId + conversationId`
  - в backend передается только при `POST /api/ai/chat`
- `userMemory` = постоянная память пользователя для AI.
  - хранится через `workspace` API
  - backend берет ее из `workspaceService.getAiMemory()`
  - фактически лежит в `user_workspaces.notes_payload_json.aiMemory`
- При AI send backend собирает prompt именно в таком порядке:
  - `ИНСТРУКЦИЯ -> userMemory`
  - `КОНТЕКСТ -> sessionContext`
  - `ВОПРОС -> message`
- `core` chat history и AI memory относятся к `workspace`, но AI conversation history не смешивается с `core` историей:
  - `core` история хранится в `user_workspaces.chat_history_json`
  - AI conversation messages/files/voice state приходят из внешнего AI backend через `/api/ai/conversations/:id`
- Source of truth для AI conversation state:
  - AI conversation state (`messages`, `files`, `voice state`) не хранится в нашей MySQL как основной источник истины
  - source of truth для AI conversation находится во внешнем VK AI backend
  - наш backend в AI-цепочке выступает как proxy + access/billing/usage layer
  - `core` chat history и AI conversation history — разные сущности, их нельзя трактовать как одну и ту же историю

## 8.1. Что нельзя делать по умолчанию

- Нельзя объединять `core` и `ai` историю в одну структуру хранения или синхронизации.
- Нельзя сохранять AI conversation history в `user_workspaces.chat_history_json` как основную историю AI.
- Нельзя считать fallback-ответы признаком исправной системы.
- Нельзя считать `migration.sql` достаточным источником истины без `schema.prisma`.
- Нельзя делать вывод "проблема в auth", если endpoint дает `404`:
  - сначала надо проверить mount route и версию реально запущенного backend.

## 9. База данных, миграции и Prisma rules

Ключевые таблицы по Prisma:

- `users`
- `user_workspaces`
- `auth_identities`
- `sessions`
- `otp_codes`
- `wallets`
- `wallet_ledger`
- `plans`
- `subscriptions`
- `payments`
- `payment_events`
- `usage_events`
- `audit_log`

### Базовая миграция

- `20260405170000_init_prod_core`
- Создает core-таблицы пользователей, auth, wallet, payments, usage, audit, workspace.

### Миграция биллинга v2

- `20260412120000_prod_billing_logic`
- Добавляет:
  - `plans.price_minor`
  - `plans.interval_days`
  - `plans.access_tier`
  - timestamps у `plans`
  - `subscriptions.included_requests`
  - `subscriptions.used_requests`
  - `subscriptions.ended_at`
  - `usage_events.billing_tier`
  - `usage_events.billing_source`
  - `usage_events.status`
  - `usage_events.subscription_id`
  - unique index по `usage_events.request_id`
  - `subscription_purchase` в enum `wallet_ledger.reason`

### Миграция AI-полей планов

- `20260413120000_plan_product_type_ai_limits`
- Добавляет:
  - `plans.product_type`
  - `plans.ai_chat_limit`
  - `plans.ai_voice_limit`
  - `plans.ai_file_upload_limit`

### Правила Prisma / schema

- Prisma Client генерируется из `back/prisma/schema.prisma`, а не из `migration.sql`.
  - это подтверждается `back/package.json` (`postinstall` и `prisma:generate`)
- Если runtime-код использует `productType` / `aiChatLimit` / `aiVoiceLimit` / `aiFileUploadLimit`, эти поля обязаны быть в `schema.prisma` до генерации клиента.
- В текущем `schema.prisma` эти поля уже есть в модели `Plan`.
- `billing` и `prisma-compat` умеют fallback в legacy mode, если серверная схема отстает.
- Legacy fallback не означает исправную схему:
  - он может только замаскировать несовпадение схемы БД с текущим кодом
  - он не отменяет необходимость актуального `schema.prisma` и regenerated Prisma Client

## 10. Критичные env-переменные

### Backend

- `NODE_ENV`
- `PORT`
- `DATABASE_URL`
- `JWT_SECRET`
- `OPENAI_API_KEY`
- `VK_AI_BACKEND_URL`
- `VK_AI_BACKEND_API_KEY`
- `VK_AI_BACKEND_TIMEOUT_MS`
- `LOG_LEVEL`

### Frontend

- `VITE_API_BASE_URL`
- `VITE_CHAT_BACKEND_MODE`
- `VITE_TEST_MODE`

## 11. Важные ловушки и скрытые режимы

- `back/.env.example` не должен считаться источником истины для текущей конфигурации.
- Реальный целевой DB context по задаче пользователя: серверная база `chat-app` через SSH-туннель.
- `billing.service.js` и `usage.service.js` умеют откатываться в legacy billing mode, если схема сервера не догнана миграцией.
- `prisma-compat.js` специально ловит ошибки вида `Unknown argument productType / aiChatLimit / aiVoiceLimit / aiFileUploadLimit`, но это диагностика legacy-схемы, а не исправление проблемы.
- `otp.service.js` умеет временно работать через in-memory challenge и dev-user fallback, если БД недоступна.
- `workspace.service.js` и `user.service.js` тоже умеют возвращать fallback-данные, если БД/таблицы недоступны.
- `oauth.service.js` умеет fallback, если provider config не заполнен или включен `OAUTH_ALLOW_FALLBACK=true`.
- YooKassa сейчас реализована как stub/mock, а не как полноценная живая интеграция.
- Текущий локальный путь репозитория находится в `Yandex.Disk`, но Yandex.Disk не должен быть основной рабочей папкой git-репозитория:
  - синхронизация и ownership/safe.directory-конфликты могут мешать нормальной работе git и lock-файлов
- Для root `npm run dev` нужен `concurrently` в корневом `devDependencies`.
- На сервере локальные изменения `package-lock.json` могут блокировать `git pull`.
- После backend/env/prisma изменений нужен явный:
  - `pm2 restart vk-backend --update-env`
  - plain `pm2 restart vk-backend` может не подтянуть обновленное окружение
- Корневой `deploy`-скрипт сейчас делает `pm2 restart vk-backend`, поэтому после env/prisma-изменений это место нужно держать в голове отдельно.

## 11.1. Deploy / rollout checklist

- `git pull`
- `npm install`, если менялись зависимости
- `npm run prisma:generate --workspace=back`, если менялась `schema.prisma`
- `npx prisma migrate deploy`, если есть новые миграции
- `pm2 restart vk-backend --update-env`
- Проверить ключевые ручки после rollout:
  - `/health`
  - `/api/billing/summary`
  - `/api/ai/plans`
  - `/api/ai/access`
  - `/api/workspace/me`

## 11.2. Как интерпретировать типовые ошибки

- `404` на `/api/ai/*`:
  - обычно route не смонтирован или running backend старый
- `401`:
  - обычно проблема в token / auth / refresh, а не в отсутствии route
- `500` с `Unknown argument productType`:
  - обычно `schema.prisma` или generated Prisma Client не совпадают с runtime-кодом
- `fallback activated`:
  - это режим деградации, а не подтверждение исправности

## 12. Prompt-ready контекст для будущих задач

```text
Проект: VK-app, npm workspaces: front + back, основная ветка main.
Frontend: Vue 3 + Vite + Pinia + VK Bridge.
Backend: Node.js ESM + Express + Prisma + MySQL + AI proxy module.
База данных локально не развернута. Рабочая БД находится на сервере и доступна только через SSH-туннель:
ssh -L 3306:127.0.0.1:3306 admin@195.140.146.86
Целевая база: MySQL `chat-app`.
Важно: 127.0.0.1:3306 в этом проекте означает туннель к серверной БД, а не локальную MySQL.
Backend читает env из back/.env. Prisma schema: back/prisma/schema.prisma. Prisma Client генерируется именно из schema.prisma.
Главные backend-модули: auth, users, billing, usage, llm, ai, admin, workspace.
AI backend монтируется на /api/ai. Фронт использует /api/ai/access, /api/ai/plans, /api/ai/conversations/:id, /api/ai/chat, /api/ai/files/upload, /api/ai/voice, /api/ai/conversations/:id/reset.
Фронт использует chatMode = core | ai. Core и AI живут в одной UI-оболочке, но с разными источниками данных и раздельной историей.
sessionContext = контекст текущей AI-сессии. userMemory = постоянная память пользователя для AI.
При AI send backend собирает prompt в порядке: ИНСТРУКЦИЯ -> userMemory, КОНТЕКСТ -> sessionContext, ВОПРОС -> message.
Если код использует productType / aiChatLimit / aiVoiceLimit / aiFileUploadLimit, эти поля обязаны быть в schema.prisma; legacy fallback в billing/prisma-compat не доказывает, что серверная схема исправна.
Локально не стоит использовать Yandex.Disk как основную git-папку. Для root npm run dev нужен concurrently.
На сервере локальные изменения package-lock.json могут блокировать git pull. После backend/env/prisma изменений нужен pm2 restart vk-backend --update-env.
Все действия по Prisma, миграциям и отладке БД нужно направлять на серверную БД через туннель, без создания локальной MySQL как основной среды.
```

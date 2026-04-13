# VK-app: постоянный контекст проекта

## 1. Неподвижные правила проекта

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

## 3. Главные рабочие файлы

- Backend entry:
  - `back/src/server.js`
  - `back/src/app.js`
- Backend env:
  - `back/.env`
- Prisma schema:
  - `back/prisma/schema.prisma`
- Prisma migrations:
  - `back/prisma/migrations/20260405170000_init_prod_core/migration.sql`
  - `back/prisma/migrations/20260412120000_prod_billing_logic/migration.sql`
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
- Backend:
  - `npm run dev --workspace=back`
  - `npm run start --workspace=back`
- Frontend:
  - `npm run dev --workspace=front`
  - `npm run build --workspace=front`

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
  - YooKassa mock/stub-логика
- `usage`
  - списание за запросы к моделям
  - возврат pending-операций
- `llm`
  - список моделей
  - чат через OpenAI-compatible провайдеров
- `admin`
  - события
  - audit
  - ledger
  - метрики
- `workspace`
  - chat history
  - notes

## 6. Backend API: маршрутные группы

- `/health`
- `/api/auth`
- `/api/users`
- `/api/billing`
- `/api/payments`
  - alias на billing routes для обратной совместимости
- `/api/usage`
- `/api/llm`
- `/api/admin`
- `/api/workspace`

## 7. Frontend: как общается с backend

- Основная база API берется из `VITE_API_BASE_URL`.
- В dev Vite проксирует `/api` на `VITE_API_BASE_URL` или на `http://127.0.0.1:3000`.
- Внутренний чатовый backend режим:
  - `VITE_CHAT_BACKEND_MODE=internal`
- Есть альтернативный режим `vk-ai`, но текущая внутренняя серверная логика завязана на Express backend из `back`.

## 8. База данных: что хранится

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

## 9. Миграции и режимы схемы

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

### Важный смысл

- Код умеет работать в legacy-режиме, если в серверной БД еще нет billing v2 полей.
- Это не означает, что сервер настроен правильно.
- Это означает, что часть проблем может быть замаскирована fallback-логикой.

## 10. Критичные env-переменные

### Backend

- `NODE_ENV`
- `PORT`
- `DATABASE_URL`
- `JWT_SECRET`
- `OPENAI_API_KEY`
- `LOG_LEVEL`
- `ADMIN_PHONES`
- `ADMIN_USER_IDS`
- `ADMIN_EMAILS`
- `ADMIN_IDENTITIES`
- `OAUTH_STATE_SECRET`
- `OAUTH_ALLOW_FALLBACK`
- `VK_CLIENT_ID`
- `VK_CLIENT_SECRET`
- `VK_REDIRECT_URI`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_OAUTH_SCOPE`
- `YANDEX_CLIENT_ID`
- `YANDEX_CLIENT_SECRET`
- `YANDEX_OAUTH_SCOPE`
- `ALLOW_DEBUG_OTP`
- `MARKETING_SPEND_MINOR`
- `GITHUB_MODELS_TOKEN`
- `GROQ_API_KEY`
- `OPENROUTER_API_KEY`
- `OPENROUTER_SITE_URL`
- `OPENROUTER_APP_NAME`
- `CEREBRAS_API_KEY`
- `VERCEL_AI_GATEWAY_API_KEY`
- `MISTRAL_API_KEY`
- `CF_AIG_ACCOUNT_ID`
- `CF_AIG_GATEWAY_ID`
- `CF_AIG_TOKEN`
- `LOCAL_LLM_BASE_URL`
- `LOCAL_MODEL_BASE_URL`
- `LOCAL_API_KEY`

### Frontend

- `VITE_API_BASE_URL`
- `VITE_CHAT_BACKEND_MODE`
- `VITE_VK_AI_API_URL`
- `VITE_VK_AI_API_KEY`
- `VITE_TEST_MODE`

## 11. Важные ловушки и скрытые режимы

- `back/.env.example` показывает примерную строку подключения вида `vk_llm`, но это не истина для текущего проекта.
- Реальный целевой DB context по задаче пользователя: серверная база `chat-app` через SSH-туннель.
- `billing.service.js` и `usage.service.js` умеют откатываться в legacy billing mode, если схема сервера не догнана миграцией.
- `otp.service.js` умеет временно работать через in-memory challenge и dev-user fallback, если БД недоступна.
- `workspace.service.js` и `user.service.js` тоже умеют возвращать fallback-данные, если БД/таблицы недоступны.
- `oauth.service.js` умеет fallback, если provider config не заполнен или включен `OAUTH_ALLOW_FALLBACK=true`.
- YooKassa сейчас реализована как stub/mock, а не как полноценная живая интеграция.
- В коде есть hardcoded admin phones:
  - `+79057353580`
  - `+79276494444`
- В `front/.env.development` есть подозрительная строка `X-API-Key: ...`, это не стандартный формат Vite env и ее нужно помнить как потенциальный источник путаницы.

## 12. Prompt-ready контекст для будущих задач

```text
Проект: VK-app, npm workspaces: front + back.
Frontend: Vue 3 + Vite + Pinia + VK Bridge.
Backend: Node.js ESM + Express + Prisma + MySQL.
База данных локально не развернута. Рабочая БД находится на сервере и доступна только через SSH-туннель:
ssh -L 3306:127.0.0.1:3306 admin@195.140.146.86
Целевая база: MySQL `chat-app`.
Важно: 127.0.0.1:3306 в этом проекте означает туннель к серверной БД, а не локальную MySQL.
Backend читает env из back/.env. Prisma schema: back/prisma/schema.prisma.
Главные backend-модули: auth, users, billing, usage, llm, admin, workspace.
Основные маршруты: /health, /api/auth, /api/users, /api/billing, /api/payments, /api/usage, /api/llm, /api/admin, /api/workspace.
Критично помнить: в проекте много fallback-логики при недоступной БД или старой схеме, поэтому нельзя считать систему исправной только потому, что часть ручек отвечает.
Все действия по Prisma, миграциям и отладке БД нужно направлять на серверную БД через туннель, без создания локальной MySQL как основной среды.
```

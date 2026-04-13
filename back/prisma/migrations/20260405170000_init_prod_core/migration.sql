-- Users table
CREATE TABLE users (
    id CHAR(36) NOT NULL,
    email TEXT,
    phone_e164 TEXT,
    first_name TEXT,
    last_name TEXT,
    avatar_url TEXT,
    status ENUM('active', 'blocked', 'deleted') NOT NULL DEFAULT 'active',
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id)
);

CREATE TABLE user_workspaces (
    user_id CHAR(36) NOT NULL,
    chat_history_json JSON NOT NULL DEFAULT '[]',
    notes_payload_json JSON NOT NULL DEFAULT '{"notes":[],"folders":[{"id":"inbox","name":"Входящие"}]}',
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE auth_identities (
    id CHAR(36) NOT NULL,
    user_id CHAR(36) NOT NULL,
    provider ENUM('vk', 'google', 'yandex', 'phone') NOT NULL,
    provider_user_id TEXT NOT NULL,
    provider_payload_json JSON,
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE sessions (
    id CHAR(36) NOT NULL,
    user_id CHAR(36) NOT NULL,
    refresh_token_hash TEXT NOT NULL,
    user_agent TEXT,
    ip TEXT,
    expires_at TIMESTAMP(3) NOT NULL,
    revoked_at TIMESTAMP(3),
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE otp_codes (
    id CHAR(36) NOT NULL,
    phone_e164 TEXT NOT NULL,
    code_hash TEXT NOT NULL,
    attempts INT NOT NULL DEFAULT 0,
    expires_at TIMESTAMP(3) NOT NULL,
    consumed_at TIMESTAMP(3),
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id)
);

CREATE TABLE wallets (
    user_id CHAR(36) NOT NULL,
    balance_minor INT NOT NULL DEFAULT 0,
    currency TEXT NOT NULL DEFAULT 'RUB',
    updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE wallet_ledger (
    id CHAR(36) NOT NULL,
    user_id CHAR(36) NOT NULL,
    type ENUM('credit', 'debit', 'hold', 'release', 'refund') NOT NULL,
    amount_minor INT NOT NULL,
    reason ENUM('payment_topup', 'usage_charge', 'admin_adjust') NOT NULL,
    reference_type TEXT,
    reference_id TEXT,
    idempotency_key TEXT NOT NULL,
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE plans (
    id CHAR(36) NOT NULL,
    code TEXT NOT NULL,
    name TEXT NOT NULL,
    monthly_price_minor INT NOT NULL,
    included_requests INT NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    PRIMARY KEY (id)
);

CREATE TABLE subscriptions (
    id CHAR(36) NOT NULL,
    user_id CHAR(36) NOT NULL,
    plan_id CHAR(36) NOT NULL,
    status ENUM('active', 'trialing', 'past_due', 'canceled', 'expired') NOT NULL DEFAULT 'active',
    period_start TIMESTAMP(3) NOT NULL,
    period_end TIMESTAMP(3) NOT NULL,
    cancel_at_period_end BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
    FOREIGN KEY (plan_id) REFERENCES plans(id) ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE payments (
    id CHAR(36) NOT NULL,
    user_id CHAR(36) NOT NULL,
    provider ENUM('yookassa') NOT NULL,
    provider_payment_id TEXT NOT NULL,
    amount_minor INT NOT NULL,
    status ENUM('pending', 'succeeded', 'failed', 'canceled') NOT NULL DEFAULT 'pending',
    idempotency_key TEXT NOT NULL,
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE payment_events (
    id CHAR(36) NOT NULL,
    payment_id CHAR(36) NOT NULL,
    event_type TEXT NOT NULL,
    raw_payload_json JSON NOT NULL,
    received_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    FOREIGN KEY (payment_id) REFERENCES payments(id) ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE usage_events (
    id CHAR(36) NOT NULL,
    user_id CHAR(36) NOT NULL,
    model_provider TEXT NOT NULL,
    model_name TEXT NOT NULL,
    input_tokens INT NOT NULL DEFAULT 0,
    output_tokens INT NOT NULL DEFAULT 0,
    cost_minor INT NOT NULL DEFAULT 0,
    request_id TEXT NOT NULL,
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE audit_log (
    id CHAR(36) NOT NULL,
    actor_user_id CHAR(36),
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    action TEXT NOT NULL,
    before_json JSON,
    after_json JSON,
    ip TEXT,
    user_agent TEXT,
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE
);
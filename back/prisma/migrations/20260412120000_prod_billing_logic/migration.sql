ALTER TABLE plans
    CHANGE COLUMN monthly_price_minor price_minor INT NOT NULL,
    ADD COLUMN interval_days INT NOT NULL DEFAULT 30 AFTER price_minor,
    ADD COLUMN access_tier ENUM('basic', 'premium') NOT NULL DEFAULT 'basic' AFTER included_requests,
    ADD COLUMN created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP AFTER is_active,
    ADD COLUMN updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP AFTER created_at;

ALTER TABLE subscriptions
    ADD COLUMN included_requests INT NOT NULL DEFAULT 0 AFTER period_end,
    ADD COLUMN used_requests INT NOT NULL DEFAULT 0 AFTER included_requests,
    ADD COLUMN ended_at TIMESTAMP(3) NULL AFTER cancel_at_period_end;

ALTER TABLE wallet_ledger
    MODIFY COLUMN reason ENUM('payment_topup', 'usage_charge', 'admin_adjust', 'subscription_purchase') NOT NULL;

ALTER TABLE usage_events
    ADD COLUMN billing_tier ENUM('basic', 'premium') NOT NULL DEFAULT 'basic' AFTER model_name,
    ADD COLUMN billing_source ENUM('payg', 'subscription_included') NOT NULL DEFAULT 'payg' AFTER billing_tier,
    ADD COLUMN status ENUM('pending', 'completed', 'reversed') NOT NULL DEFAULT 'completed' AFTER billing_source,
    ADD COLUMN subscription_id CHAR(36) NULL AFTER status;

ALTER TABLE usage_events
    ADD CONSTRAINT usage_events_subscription_id_fkey
        FOREIGN KEY (subscription_id) REFERENCES subscriptions(id)
        ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE usage_events
    ADD UNIQUE INDEX usage_events_request_id_key (request_id);

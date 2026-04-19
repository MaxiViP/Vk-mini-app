CREATE TABLE `discounts` (
    `id` CHAR(36) NOT NULL,
    `code` VARCHAR(191) NULL,
    `name` VARCHAR(191) NOT NULL,
    `description` TEXT NULL,
    `discount_type` ENUM('percent', 'fixed_minor', 'topup_bonus_percent', 'topup_bonus_fixed_minor') NOT NULL,
    `value` INTEGER NOT NULL,
    `product_type` VARCHAR(191) NULL,
    `plan_code` VARCHAR(191) NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `is_automatic` BOOLEAN NOT NULL DEFAULT false,
    `starts_at` DATETIME(3) NULL,
    `ends_at` DATETIME(3) NULL,
    `max_uses` INTEGER NULL,
    `max_uses_per_user` INTEGER NULL,
    `first_purchase_only` BOOLEAN NOT NULL DEFAULT false,
    `allow_stacking` BOOLEAN NOT NULL DEFAULT false,
    `target_user_id` CHAR(36) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `discounts_code_key`(`code`),
    INDEX `discounts_is_active_is_automatic_starts_at_ends_at_idx`(`is_active`, `is_automatic`, `starts_at`, `ends_at`),
    INDEX `discounts_product_type_plan_code_idx`(`product_type`, `plan_code`),
    INDEX `discounts_target_user_id_idx`(`target_user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;

CREATE TABLE `discount_redemptions` (
    `id` CHAR(36) NOT NULL,
    `discount_id` CHAR(36) NOT NULL,
    `user_id` CHAR(36) NOT NULL,
    `payment_id` CHAR(36) NULL,
    `subscription_id` CHAR(36) NULL,
    `promo_code_snapshot` VARCHAR(191) NULL,
    `base_amount_minor` INTEGER NOT NULL,
    `discount_amount_minor` INTEGER NOT NULL,
    `final_amount_minor` INTEGER NOT NULL,
    `application_type` ENUM('subscription_purchase', 'wallet_topup') NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `discount_redemptions_discount_id_created_at_idx`(`discount_id`, `created_at`),
    INDEX `discount_redemptions_user_id_created_at_idx`(`user_id`, `created_at`),
    INDEX `discount_redemptions_payment_id_idx`(`payment_id`),
    INDEX `discount_redemptions_subscription_id_idx`(`subscription_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `payments`
    ADD COLUMN `credited_amount_minor` INTEGER NULL,
    ADD COLUMN `bonus_amount_minor` INTEGER NULL,
    ADD COLUMN `promo_code_snapshot` VARCHAR(191) NULL,
    ADD COLUMN `applied_discount_id` CHAR(36) NULL,
    ADD COLUMN `applied_discount_snapshot_json` JSON NULL;

CREATE INDEX `payments_applied_discount_id_idx` ON `payments`(`applied_discount_id`);

ALTER TABLE `discounts`
    ADD CONSTRAINT `discounts_target_user_id_fkey`
    FOREIGN KEY (`target_user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `payments`
    ADD CONSTRAINT `payments_applied_discount_id_fkey`
    FOREIGN KEY (`applied_discount_id`) REFERENCES `discounts`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `discount_redemptions`
    ADD CONSTRAINT `discount_redemptions_discount_id_fkey`
    FOREIGN KEY (`discount_id`) REFERENCES `discounts`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
    ADD CONSTRAINT `discount_redemptions_user_id_fkey`
    FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
    ADD CONSTRAINT `discount_redemptions_payment_id_fkey`
    FOREIGN KEY (`payment_id`) REFERENCES `payments`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
    ADD CONSTRAINT `discount_redemptions_subscription_id_fkey`
    FOREIGN KEY (`subscription_id`) REFERENCES `subscriptions`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `plans`
    ADD COLUMN `product_type` ENUM('core', 'ai') NOT NULL DEFAULT 'core',
    ADD COLUMN `ai_chat_limit` INTEGER NULL,
    ADD COLUMN `ai_voice_limit` INTEGER NULL,
    ADD COLUMN `ai_file_upload_limit` INTEGER NULL;

UPDATE `plans`
SET `product_type` = 'core'
WHERE `product_type` IS NULL OR `product_type` = '';

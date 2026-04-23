CREATE TABLE ai_conversations (
    id CHAR(36) NOT NULL,
    user_id CHAR(36) NOT NULL,
    conversation_key VARCHAR(191) NOT NULL,
    title VARCHAR(255) NULL,
    provider VARCHAR(50) NOT NULL DEFAULT 'aivk',
    mode ENUM('simple', 'context') NOT NULL DEFAULT 'simple',
    status ENUM('active', 'archived', 'deleted') NOT NULL DEFAULT 'active',
    source ENUM('vk_ai', 'internal_ai', 'other') NOT NULL DEFAULT 'vk_ai',
    message_count INT NOT NULL DEFAULT 0,
    last_message_at DATETIME(3) NULL,
    metadata_json JSON NULL,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    UNIQUE INDEX ai_conversations_conversation_key_key (conversation_key),
    INDEX ai_conversations_user_id_updated_at_idx (user_id, updated_at),
    INDEX ai_conversations_user_id_last_message_at_idx (user_id, last_message_at),
    CONSTRAINT ai_conversations_user_id_fkey
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE
);

INSERT INTO ai_conversations (
    id,
    user_id,
    conversation_key,
    title,
    provider,
    mode,
    status,
    source,
    message_count,
    last_message_at,
    metadata_json,
    created_at,
    updated_at
)
SELECT
    UUID(),
    m.user_id,
    m.conversation_id,
    NULL,
    COALESCE(NULLIF(MAX(m.provider), ''), 'aivk'),
    CASE
        WHEN SUM(CASE WHEN m.mode = 'context' THEN 1 ELSE 0 END) > 0 THEN 'context'
        ELSE 'simple'
    END,
    'active',
    'vk_ai',
    SUM(CASE WHEN m.role IN ('user', 'assistant') THEN 1 ELSE 0 END),
    MAX(m.created_at),
    NULL,
    MIN(m.created_at),
    MAX(m.created_at)
FROM ai_messages m
GROUP BY m.user_id, m.conversation_id;

ALTER TABLE ai_messages
    ADD COLUMN conversation_ref_id CHAR(36) NULL AFTER user_id;

UPDATE ai_messages m
INNER JOIN ai_conversations c
    ON c.user_id = m.user_id
   AND c.conversation_key = m.conversation_id
SET m.conversation_ref_id = c.id;

DROP INDEX ai_messages_user_id_conversation_id_created_at_idx ON ai_messages;

ALTER TABLE ai_messages
    DROP COLUMN conversation_id;

ALTER TABLE ai_messages
    CHANGE conversation_ref_id conversation_id CHAR(36) NOT NULL;

CREATE INDEX ai_messages_user_id_conversation_id_created_at_idx
    ON ai_messages(user_id, conversation_id, created_at);

CREATE INDEX ai_messages_conversation_id_created_at_idx
    ON ai_messages(conversation_id, created_at);

ALTER TABLE ai_messages
    ADD CONSTRAINT ai_messages_conversation_id_fkey
        FOREIGN KEY (conversation_id) REFERENCES ai_conversations(id) ON DELETE CASCADE ON UPDATE CASCADE;

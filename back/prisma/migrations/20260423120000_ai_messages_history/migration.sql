CREATE TABLE ai_messages (
    id CHAR(36) NOT NULL,
    user_id CHAR(36) NOT NULL,
    conversation_id VARCHAR(191) NOT NULL,
    role ENUM('user', 'assistant', 'system') NOT NULL,
    content TEXT NOT NULL,
    mode ENUM('simple', 'context') NOT NULL,
    provider VARCHAR(191) NOT NULL DEFAULT 'aivk',
    status VARCHAR(191) NULL DEFAULT 'completed',
    metadata_json JSON NULL,
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX ai_messages_user_id_conversation_id_created_at_idx
    ON ai_messages(user_id, conversation_id, created_at);

CREATE INDEX ai_messages_user_id_created_at_idx
    ON ai_messages(user_id, created_at);

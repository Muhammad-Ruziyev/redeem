-- Миграция: Инициализация БД (COMPAT-02: Additive)
-- Создаем таблицу аккаунтов
CREATE TABLE IF NOT EXISTS accounts (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) NOT NULL UNIQUE,
    -- Пароль и куки должны шифроваться на уровне приложения (AES-256-GCM) перед вставкой!
    password_encrypted TEXT NOT NULL,
    proxy_url VARCHAR(500), -- Сделано необязательным для локальных тестов
    session_cookies TEXT, 
    status VARCHAR(50) NOT NULL DEFAULT 'active', -- active, needs_refresh, banned
    last_used_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Индексы для быстрого поиска свободных аккаунтов (P-02)
CREATE INDEX idx_accounts_status_last_used ON accounts (status, last_used_at ASC);

-- Создаем таблицу логов активаций
CREATE TABLE IF NOT EXISTS redeem_logs (
    id SERIAL PRIMARY KEY,
    player_id VARCHAR(50) NOT NULL,
    uc_code VARCHAR(100) NOT NULL,
    account_id INTEGER REFERENCES accounts(id) ON DELETE SET NULL,
    status VARCHAR(50) NOT NULL, -- pending, success, error
    reason VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Индексы для фильтрации логов и пагинации (P-02, P-03)
CREATE INDEX idx_redeem_logs_status ON redeem_logs(status);
CREATE INDEX idx_redeem_logs_player_code ON redeem_logs(player_id, uc_code);
CREATE INDEX idx_redeem_logs_created_at ON redeem_logs(created_at DESC);

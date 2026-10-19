// Idempotent schema. MySQL 5.7+/8 and MariaDB 10.3+ compatible (JSON stored as LONGTEXT on purpose).
const T = 'ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci'
export const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS users (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    email VARCHAR(190) NOT NULL UNIQUE,
    name VARCHAR(120) NOT NULL DEFAULT '',
    pass_hash VARCHAR(255) NOT NULL,
    role ENUM('user','admin') NOT NULL DEFAULT 'user',
    plan_id VARCHAR(32) NOT NULL DEFAULT 'free',
    disabled TINYINT(1) NOT NULL DEFAULT 0,
    created_at DATETIME NOT NULL,
    last_login DATETIME NULL
  ) ${T}`,
  `CREATE TABLE IF NOT EXISTS sessions (
    token_hash CHAR(64) PRIMARY KEY,
    user_id BIGINT UNSIGNED NOT NULL,
    created_at DATETIME NOT NULL,
    expires_at DATETIME NOT NULL,
    INDEX idx_sessions_user (user_id),
    INDEX idx_sessions_exp (expires_at)
  ) ${T}`,
  `CREATE TABLE IF NOT EXISTS user_data (
    user_id BIGINT UNSIGNED PRIMARY KEY,
    data LONGTEXT NOT NULL,
    version INT UNSIGNED NOT NULL DEFAULT 1,
    updated_at DATETIME NOT NULL
  ) ${T}`,
  `CREATE TABLE IF NOT EXISTS api_keys (
    provider VARCHAR(32) PRIMARY KEY,
    ciphertext TEXT NOT NULL,
    last4 VARCHAR(8) NOT NULL,
    updated_at DATETIME NOT NULL,
    verified_at DATETIME NULL
  ) ${T}`,
  `CREATE TABLE IF NOT EXISTS settings (
    k VARCHAR(64) PRIMARY KEY,
    v TEXT NOT NULL
  ) ${T}`,
  `CREATE TABLE IF NOT EXISTS model_prices (
    provider VARCHAR(32) NOT NULL,
    model VARCHAR(100) NOT NULL,
    label VARCHAR(100) NOT NULL DEFAULT '',
    input_per_mtok DECIMAL(12,4) NULL,
    output_per_mtok DECIMAL(12,4) NULL,
    enabled TINYINT(1) NOT NULL DEFAULT 1,
    PRIMARY KEY (provider, model)
  ) ${T}`,
  `CREATE TABLE IF NOT EXISTS usage_log (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id BIGINT UNSIGNED NULL,
    app VARCHAR(40) NOT NULL DEFAULT 'mathema',
    provider VARCHAR(32) NOT NULL,
    model VARCHAR(100) NOT NULL,
    mode VARCHAR(20) NOT NULL DEFAULT '',
    input_tokens INT UNSIGNED NOT NULL DEFAULT 0,
    output_tokens INT UNSIGNED NOT NULL DEFAULT 0,
    cache_read_tokens INT UNSIGNED NOT NULL DEFAULT 0,
    cache_write_tokens INT UNSIGNED NOT NULL DEFAULT 0,
    cost_usd DECIMAL(14,6) NOT NULL DEFAULT 0,
    price_missing TINYINT(1) NOT NULL DEFAULT 0,
    ok TINYINT(1) NOT NULL DEFAULT 1,
    error VARCHAR(255) NULL,
    latency_ms INT UNSIGNED NOT NULL DEFAULT 0,
    created_at DATETIME NOT NULL,
    INDEX idx_usage_created (created_at),
    INDEX idx_usage_user (user_id, created_at)
  ) ${T}`,
  `CREATE TABLE IF NOT EXISTS plans (
    id VARCHAR(32) PRIMARY KEY,
    name VARCHAR(80) NOT NULL,
    price_cents INT UNSIGNED NOT NULL DEFAULT 0,
    interval_unit ENUM('month','year') NOT NULL DEFAULT 'month',
    ai_monthly_quota INT UNSIGNED NULL,
    active TINYINT(1) NOT NULL DEFAULT 1
  ) ${T}`,
  `CREATE TABLE IF NOT EXISTS subscriptions (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id BIGINT UNSIGNED NOT NULL,
    plan_id VARCHAR(32) NOT NULL,
    status ENUM('active','trialing','past_due','canceled') NOT NULL DEFAULT 'active',
    amount_cents INT UNSIGNED NOT NULL,
    interval_unit ENUM('month','year') NOT NULL DEFAULT 'month',
    started_at DATETIME NOT NULL,
    canceled_at DATETIME NULL,
    source VARCHAR(24) NOT NULL DEFAULT 'manual',
    note VARCHAR(255) NOT NULL DEFAULT '',
    INDEX idx_subs_user (user_id),
    INDEX idx_subs_status (status)
  ) ${T}`,
  `CREATE TABLE IF NOT EXISTS payments (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id BIGINT UNSIGNED NULL,
    amount_cents INT NOT NULL,
    currency CHAR(3) NOT NULL DEFAULT 'USD',
    paid_at DATETIME NOT NULL,
    source VARCHAR(24) NOT NULL DEFAULT 'manual',
    note VARCHAR(255) NOT NULL DEFAULT '',
    INDEX idx_pay_paid (paid_at)
  ) ${T}`,
  `CREATE TABLE IF NOT EXISTS expenses (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(120) NOT NULL,
    category VARCHAR(40) NOT NULL DEFAULT 'other',
    amount_cents INT UNSIGNED NOT NULL,
    month CHAR(7) NOT NULL,
    recurring TINYINT(1) NOT NULL DEFAULT 0
  ) ${T}`,
  `CREATE TABLE IF NOT EXISTS invites (
    code VARCHAR(40) PRIMARY KEY,
    note VARCHAR(160) NOT NULL DEFAULT '',
    max_uses INT UNSIGNED NOT NULL DEFAULT 1,
    uses INT UNSIGNED NOT NULL DEFAULT 0,
    plan_id VARCHAR(32) NULL,
    expires_at DATETIME NULL,
    active TINYINT(1) NOT NULL DEFAULT 1,
    created_at DATETIME NOT NULL
  ) ${T}`,
  `CREATE TABLE IF NOT EXISTS feedback (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id BIGINT UNSIGNED NULL,
    kind VARCHAR(12) NOT NULL DEFAULT 'other',
    message TEXT NOT NULL,
    page VARCHAR(120) NOT NULL DEFAULT '',
    created_at DATETIME NOT NULL
  ) ${T}`,
  `CREATE TABLE IF NOT EXISTS billing_events (
    event_id VARCHAR(80) PRIMARY KEY,
    type VARCHAR(80) NOT NULL,
    created_at DATETIME NOT NULL
  ) ${T}`,
  `CREATE TABLE IF NOT EXISTS audit_log (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id BIGINT UNSIGNED NULL,
    action VARCHAR(60) NOT NULL,
    detail VARCHAR(500) NOT NULL DEFAULT '',
    created_at DATETIME NOT NULL
  ) ${T}`,
]

// Seeds are only inserted when missing, so admin edits are never overwritten.
export const SEED_PLANS = [
  ['free', 'Free', 0, 'month', 10, 1],
  ['pro', 'Pro', 1200, 'month', 300, 1], // placeholder price: edit it in the admin panel
]
// Anthropic list prices per million tokens (USD), as published on 2026-10-06. ADMIN MUST VERIFY.
// OpenAI models/prices are intentionally NOT seeded: add the ones you use in the admin panel.
export const SEED_PRICES = [
  ['anthropic', 'claude-haiku-5-5', 'Claude Haiku 5.5', 0.1, 0.5],
  ['anthropic', 'claude-sonnet-5-5', 'Claude Sonnet 5.5', 2, 10],
  ['anthropic', 'claude-opus-5-5', 'Claude Opus 5.5', 4, 20],
]
// Columns added after the first release: applied idempotently by db.migrate() (works on MySQL and MariaDB).
export const COLUMNS = [
  ['plans', 'paypal_plan_id', 'VARCHAR(64) NULL'],
  ['subscriptions', 'external_id', 'VARCHAR(64) NULL'],
  ['users', 'terms_accepted_at', 'DATETIME NULL'],
]
export const STATUS_ENUM = "ALTER TABLE subscriptions MODIFY status ENUM('pending','active','trialing','past_due','canceled') NOT NULL DEFAULT 'active'"
export const DEFAULT_SETTINGS = {
  ai_default: { provider: 'anthropic', model: 'claude-sonnet-5-5' },
  ai_research: { provider: 'anthropic', model: 'claude-opus-5-5' },
  ai_effort: 'medium',
  signup_mode: 'open', // open | invite | closed
  paypal_mode: 'sandbox',
  paypal_client_id: '',
  paypal_webhook_id: '',
  legal_entity: '',
  legal_email: '',
  daily_cap_per_user: 25,
}

-- Execute only against the explicitly selected development schema first.
-- Separate from user_sessions: tickets are single-use and must not become platform logins.
CREATE TABLE IF NOT EXISTS agent_web_sessions (
  ticket_hash CHAR(64) NOT NULL PRIMARY KEY,
  session_hash CHAR(64) NULL,
  user_id VARCHAR(128) NOT NULL,
  parent_token_hash CHAR(64) NOT NULL,
  ticket_expires_at BIGINT NOT NULL,
  expires_at BIGINT NOT NULL,
  agent_session_id VARCHAR(128) NULL,
  request_lock CHAR(32) NULL,
  busy_until BIGINT NOT NULL DEFAULT 0,
  UNIQUE KEY uk_agent_web_session (session_hash),
  KEY idx_agent_web_expiry (expires_at)
);

PRAGMA foreign_keys = ON;

-- Habbat Al Waraq Cloudflare-native authentication.
-- habat_attendance_access remains the canonical operational identity.
-- Authentication credentials and sessions are intentionally separated.

CREATE TABLE IF NOT EXISTS habat_auth_credentials (
  access_id TEXT PRIMARY KEY,
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  password_algorithm TEXT NOT NULL DEFAULT 'pbkdf2-sha256',
  password_iterations INTEGER NOT NULL DEFAULT 100000
    CHECK (password_iterations > 0),
  must_change_password INTEGER NOT NULL DEFAULT 0
    CHECK (must_change_password IN (0, 1)),
  failed_login_attempts INTEGER NOT NULL DEFAULT 0
    CHECK (failed_login_attempts >= 0),
  locked_until TEXT,
  password_changed_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (access_id)
    REFERENCES habat_attendance_access(id)
    ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS habat_auth_sessions (
  id TEXT PRIMARY KEY,
  access_id TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  revoked_at TEXT,
  created_ip TEXT,
  created_user_agent TEXT,
  last_seen_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (access_id)
    REFERENCES habat_attendance_access(id)
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_habat_auth_sessions_access
  ON habat_auth_sessions (access_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_habat_auth_sessions_expires
  ON habat_auth_sessions (expires_at);

CREATE INDEX IF NOT EXISTS idx_habat_auth_sessions_active
  ON habat_auth_sessions (access_id, revoked_at, expires_at);
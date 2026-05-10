CREATE TABLE IF NOT EXISTS users (
  email      TEXT    PRIMARY KEY,
  created_at INTEGER NOT NULL,
  has_passkey INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS passkey_credentials (
  credential_id TEXT    PRIMARY KEY,
  email         TEXT    NOT NULL,
  public_key    BLOB    NOT NULL,
  counter       INTEGER NOT NULL,
  transports    TEXT,
  device_label  TEXT,
  created_at    INTEGER NOT NULL,
  last_used_at  INTEGER,
  FOREIGN KEY (email) REFERENCES users(email)
);

CREATE INDEX IF NOT EXISTS idx_passkey_email ON passkey_credentials(email);

CREATE TABLE IF NOT EXISTS recovery_codes (
  email       TEXT PRIMARY KEY,
  code_hash   TEXT    NOT NULL,
  created_at  INTEGER NOT NULL,
  consumed_at INTEGER,
  FOREIGN KEY (email) REFERENCES users(email)
);

CREATE TABLE IF NOT EXISTS shares (
  id               TEXT    PRIMARY KEY,
  owner_email      TEXT    NOT NULL,
  recipient_emails TEXT,
  byte_length      INTEGER NOT NULL,
  created_at       INTEGER NOT NULL,
  expires_at       INTEGER NOT NULL,
  revoked_at       INTEGER,
  view_count       INTEGER NOT NULL DEFAULT 0,
  first_viewed_at  INTEGER,
  last_viewed_at   INTEGER,
  FOREIGN KEY (owner_email) REFERENCES users(email)
);

CREATE INDEX IF NOT EXISTS idx_shares_owner ON shares(owner_email);

CREATE TABLE IF NOT EXISTS sessions (
  token      TEXT    PRIMARY KEY,
  email      TEXT    NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  FOREIGN KEY (email) REFERENCES users(email)
);

CREATE INDEX IF NOT EXISTS idx_sessions_email ON sessions(email);

CREATE TABLE IF NOT EXISTS verify_attempts (
  share_id     TEXT    NOT NULL,
  ip           TEXT    NOT NULL,
  attempted_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_verify_share_time
  ON verify_attempts(share_id, attempted_at);

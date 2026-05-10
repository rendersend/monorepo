CREATE TABLE IF NOT EXISTS users (
  email       TEXT   PRIMARY KEY,
  created_at  BIGINT NOT NULL,
  has_passkey BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS passkey_credentials (
  credential_id TEXT    PRIMARY KEY,
  email         TEXT    NOT NULL REFERENCES users(email),
  public_key    BYTEA   NOT NULL,
  counter       INTEGER NOT NULL,
  transports    TEXT,
  device_label  TEXT,
  created_at    BIGINT  NOT NULL,
  last_used_at  BIGINT
);

CREATE INDEX IF NOT EXISTS idx_passkey_email
  ON passkey_credentials(email);

CREATE TABLE IF NOT EXISTS recovery_codes (
  email       TEXT   PRIMARY KEY REFERENCES users(email),
  code_hash   TEXT   NOT NULL,
  created_at  BIGINT NOT NULL,
  consumed_at BIGINT
);

CREATE TABLE IF NOT EXISTS shares (
  id               TEXT    PRIMARY KEY,
  owner_email      TEXT    NOT NULL REFERENCES users(email),
  recipient_emails TEXT,
  byte_length      INTEGER NOT NULL,
  created_at       BIGINT  NOT NULL,
  expires_at       BIGINT  NOT NULL,
  revoked_at       BIGINT,
  view_count       INTEGER NOT NULL DEFAULT 0,
  first_viewed_at  BIGINT,
  last_viewed_at   BIGINT
);

CREATE INDEX IF NOT EXISTS idx_shares_owner
  ON shares(owner_email);

CREATE TABLE IF NOT EXISTS sessions (
  token      TEXT   PRIMARY KEY,
  email      TEXT   NOT NULL REFERENCES users(email),
  created_at BIGINT NOT NULL,
  expires_at BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sessions_email
  ON sessions(email);

CREATE TABLE IF NOT EXISTS verify_attempts (
  id           BIGSERIAL PRIMARY KEY,
  share_id     TEXT   NOT NULL,
  ip           TEXT   NOT NULL,
  attempted_at BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_verify_share_time
  ON verify_attempts(share_id, attempted_at);

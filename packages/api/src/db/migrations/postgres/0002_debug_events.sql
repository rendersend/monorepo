CREATE TABLE IF NOT EXISTS debug_sessions (
  id            TEXT    PRIMARY KEY,
  user_email    TEXT,
  source        TEXT    NOT NULL DEFAULT 'api',
  user_agent    TEXT,
  ip            TEXT,
  created_at    BIGINT  NOT NULL,
  last_event_at BIGINT,
  event_count   INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_debug_sessions_created
  ON debug_sessions(created_at DESC);

CREATE TABLE IF NOT EXISTS debug_events (
  id         TEXT   PRIMARY KEY,
  session_id TEXT   NOT NULL,
  ts         BIGINT NOT NULL,
  level      TEXT   NOT NULL DEFAULT 'info',
  event      TEXT   NOT NULL,
  message    TEXT   NOT NULL,
  share_id   TEXT,
  payload    JSONB  NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_debug_events_session
  ON debug_events(session_id, ts);

CREATE INDEX IF NOT EXISTS idx_debug_events_ts
  ON debug_events(ts DESC);

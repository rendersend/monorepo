CREATE INDEX IF NOT EXISTS idx_debug_events_share
  ON debug_events(share_id, ts);

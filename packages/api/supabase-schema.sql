-- Rendersend Supabase Database Schema
-- Run this in your Supabase SQL editor to set up the required tables

-- Enable UUID extension if needed
-- CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users table
CREATE TABLE IF NOT EXISTS users (
  email TEXT PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  has_passkey BOOLEAN NOT NULL DEFAULT FALSE
);

-- Passkey credentials table
CREATE TABLE IF NOT EXISTS passkey_credentials (
  credential_id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  public_key BYTEA NOT NULL,
  counter INTEGER NOT NULL,
  transports TEXT,
  device_label TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at TIMESTAMPTZ,
  FOREIGN KEY (email) REFERENCES users(email) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_passkey_email ON passkey_credentials(email);

-- Recovery codes table
CREATE TABLE IF NOT EXISTS recovery_codes (
  email TEXT PRIMARY KEY,
  code_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  consumed_at TIMESTAMPTZ,
  FOREIGN KEY (email) REFERENCES users(email) ON DELETE CASCADE
);

-- Shares table
CREATE TABLE IF NOT EXISTS shares (
  id TEXT PRIMARY KEY,
  owner_email TEXT NOT NULL,
  recipient_emails TEXT,
  byte_length INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  view_count INTEGER NOT NULL DEFAULT 0,
  first_viewed_at TIMESTAMPTZ,
  last_viewed_at TIMESTAMPTZ,
  FOREIGN KEY (owner_email) REFERENCES users(email) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_shares_owner ON shares(owner_email);
CREATE INDEX IF NOT EXISTS idx_shares_expires ON shares(expires_at);

-- Sessions table
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  FOREIGN KEY (email) REFERENCES users(email) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_sessions_email ON sessions(email);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);

-- Verify attempts table for rate limiting
CREATE TABLE IF NOT EXISTS verify_attempts (
  share_id TEXT NOT NULL,
  ip TEXT NOT NULL,
  attempted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_verify_share_time ON verify_attempts(share_id, attempted_at);

-- Function to safely record share views
CREATE OR REPLACE FUNCTION record_share_view(share_id TEXT, view_time TIMESTAMPTZ)
RETURNS VOID AS $$
BEGIN
  UPDATE shares 
  SET 
    view_count = view_count + 1,
    first_viewed_at = COALESCE(first_viewed_at, view_time),
    last_viewed_at = view_time
  WHERE id = share_id;
END;
$$ LANGUAGE plpgsql;

-- Row Level Security (RLS) policies
-- Enable RLS on all tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE passkey_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE recovery_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE shares ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE verify_attempts ENABLE ROW LEVEL SECURITY;

-- Users can only access their own data
CREATE POLICY "Users can view own data" ON users
  FOR ALL USING (auth.email() = email);

CREATE POLICY "Users can manage own passkeys" ON passkey_credentials
  FOR ALL USING (auth.email() = email);

CREATE POLICY "Users can manage own recovery codes" ON recovery_codes
  FOR ALL USING (auth.email() = email);

CREATE POLICY "Users can manage own shares" ON shares
  FOR ALL USING (auth.email() = owner_email);

CREATE POLICY "Users can manage own sessions" ON sessions
  FOR ALL USING (auth.email() = email);

-- Public policies for viewing shares (anyone can view share metadata)
CREATE POLICY "Shares are publicly viewable" ON shares
  FOR SELECT USING (true);

-- Service role bypasses RLS for server-side operations
-- This allows the API service to manage all data using the service role key

-- Clean up old expired sessions periodically (optional)
CREATE OR REPLACE FUNCTION cleanup_expired_sessions()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM sessions WHERE expires_at < NOW();
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

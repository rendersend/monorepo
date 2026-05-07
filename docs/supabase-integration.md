# Supabase Integration Guide

This guide covers how to configure Rendersend to use Supabase as the cloud backend for both database and file storage.

## Overview

Rendersend now uses Supabase for:
- **Database**: PostgreSQL database for metadata, users, shares, sessions
- **Storage**: Supabase Storage for encrypted HTML blobs

## Architecture

- **Database Layer**: All user data, shares, sessions, and metadata stored in Supabase PostgreSQL
- **File Storage**: Encrypted HTML blobs stored in Supabase Storage (bucket: `rendersend-blobs`)
- **Security**: Uses Supabase service role key for server-side operations
- **No Local Storage**: Everything is cloud-native, no local filesystem storage needed

## Setup Instructions

### 1. Create Supabase Project

1. Sign up at [supabase.com](https://supabase.com)
2. Create a new project
3. Go to Settings > API to get your:
   - Project URL
   - Service Role Key (keep this secret!)

### 2. Configure Database Schema

1. Open Supabase SQL Editor
2. Run the schema from `packages/api/supabase-schema.sql`
3. This creates all tables, indexes, and RLS policies

### 3. Set Up Supabase Storage

1. Go to Supabase Dashboard > Storage
2. Create a new bucket named `rendersend-blobs`
3. Set the bucket to **Private** (public access disabled)
4. Configure CORS policies if needed for your domain

**Alternative**: The API will auto-create the bucket on first run if you have sufficient permissions.

### 4. Environment Configuration

Create/update your `.env` file:

```bash
# Supabase configuration
SUPABASE_URL=https://mdfohqjsgnplmjjnypqj.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here
# Or use anon key: SUPABASE_ANON_KEY=your-anon-key-here

# API settings
PORT=8787
RENDERSEND_OWNER_EMAIL=you@example.com
```

### 4. Install Dependencies

```bash
pnpm install
```

### 5. Start Development

```bash
pnpm dev
```

## Database Schema

The following tables are created in Supabase:

- **users** - User accounts and passkey status
- **passkey_credentials** - WebAuthn authentication credentials
- **recovery_codes** - Account recovery codes
- **shares** - Encrypted HTML share metadata
- **sessions** - User authentication sessions
- **verify_attempts** - Rate limiting for share access

## Security Features

### Row Level Security (RLS)

All tables have RLS policies that:
- Allow users to access only their own data
- Allow public read access to share metadata (for viewing)
- Service role bypasses RLS for server operations

### Data Access

- **Client-side**: Users can only access their own data
- **Server-side**: API uses service role key for full access
- **Public**: Share metadata is publicly readable for sharing

## Migration from SQLite

To migrate existing SQLite data to Supabase:

1. Export your SQLite data
2. Transform to Supabase format
3. Import using Supabase SQL Editor or API

*(Migration scripts can be added as needed)*

## Production Considerations

### Backup Strategy

- Supabase provides automatic backups
- Consider additional backup strategies for critical data

### Scaling

- Supabase handles database scaling automatically
- Consider moving blob storage to cloud (S3, etc.) for full cloud deployment

### Monitoring

- Monitor Supabase dashboard for performance
- Set up alerts for database usage limits

## Troubleshooting

### Common Issues

1. **Connection Errors**: Verify SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY
2. **Permission Errors**: Ensure service role key has correct permissions
3. **Schema Errors**: Run the schema script if tables are missing

### Debug Mode

Enable debug logging to see database operations:

```bash
DEBUG=supabase:* pnpm dev
```

## Switching Back to SQLite

To switch back to local SQLite:

```bash
# Update .env
RENDERSEND_DB=sqlite
RENDERSEND_DB_PATH=./storage/rendersend.db

# Remove Supabase env vars
# SUPABASE_URL=
# SUPABASE_SERVICE_ROLE_KEY=
```

## Next Steps

- Configure cloud blob storage for full cloud deployment
- Set up monitoring and alerting
- Consider database migrations for production deployments

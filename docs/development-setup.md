# Development Setup Guide

This guide covers how to start the frontend and backend servers for local development.

## Prerequisites

- **Node 20+** (`node --version`)
- **pnpm 9+** (`pnpm --version`; install via `npm install -g pnpm`)

## Initial Setup

1. **Clone and install dependencies:**
   ```bash
   git clone https://github.com/your-org/rendersend && cd rendersend
   pnpm install
   ```

## Starting Services

### Option 1: Start Both Services Together (Recommended)

```bash
pnpm dev
```

This starts:
- **Backend API** on `http://localhost:8787`
- **Frontend Viewer** on `http://localhost:5173`

The `dev` script runs both servers together and exits cleanly on Ctrl-C.

### Option 2: Start Services Individually

**Backend API only:**
```bash
pnpm dev:api
```
- Runs on `http://localhost:8787`
- Hono HTTP server with SQLite database

**Frontend Viewer only:**
```bash
pnpm dev:viewer
```
- Runs on `http://localhost:5173`
- Vite development server with React SPA

**MCP Server (for Claude Desktop integration):**
```bash
pnpm dev:mcp
```

## Environment Variables

### Backend API Environment Variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `8787` | HTTP port for API server |
| `STORAGE_DIR` | `./storage` | Root directory for encrypted blobs |
| `SUPABASE_URL` | `https://mdfohqjsgnplmjjnypqj.supabase.co` | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | - | Supabase service role key (required) |
| `RENDERSEND_OWNER_EMAIL` | - | Your email for CLI sharing (optional) |

### Example Environment Setup

Create a `.env` file in the root directory:
```bash
# .env
PORT=8787
STORAGE_DIR=./storage
SUPABASE_URL=https://mdfohqjsgnplmjjnypqj.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here
RENDERSEND_OWNER_EMAIL=you@example.com
```

## Testing the Setup

1. **Verify servers are running:**
   - API: Open `http://localhost:8787` in browser
   - Viewer: Open `http://localhost:5173` in browser

2. **Test sharing functionality:**
   ```bash
   echo '<h1>Hello World</h1>' | pnpm share
   ```
   This will output a URL you can open in the browser to view the shared content.

## Development Workflow

### Making Changes

- **Frontend changes**: The Vite dev server automatically reloads on file changes
- **Backend changes**: The Node server with `--watch` flag automatically restarts on changes
- **Shared crypto changes**: Both frontend and backend will reload/restart automatically

### Database

- Supabase cloud database is used for all data storage
- Database schema must be set up manually in Supabase SQL Editor
- Run the schema from `packages/api/supabase-schema.sql` to create tables

### Running Tests

```bash
# Database layer tests (fast, no server needed)
pnpm test:store

# Full API end-to-end tests
pnpm test:e2e

# Run all tests
pnpm test
```

## Troubleshooting

### Port Conflicts

If ports 8787 or 5173 are already in use:

```bash
# Set different ports
PORT=3001 pnpm dev:api
# or
VITE_PORT=3002 pnpm dev:viewer
```

### Database Issues

If you encounter database errors:

```bash
# Clear storage and restart
rm -rf ./storage
pnpm dev
```

### Permission Issues

On some systems, you might need to adjust file permissions:

```bash
# Ensure storage directory is writable
mkdir -p ./storage
chmod 755 ./storage
```

## Production Build

To build for production deployment:

```bash
pnpm build
```

This creates:
- `packages/viewer/dist/` - Static files for the frontend
- `packages/mcp/dist/` - Compiled MCP server bundle

## Supabase Setup

### 1. Create a Supabase Project

1. Go to [supabase.com](https://supabase.com) and create a new project
2. Note your project URL and service role key from Settings > API

### 2. Set Up Database Schema

1. Open the Supabase SQL Editor
2. Copy and paste the contents of `packages/api/supabase-schema.sql`
3. Run the SQL script to create all required tables and functions

### 3. Configure Environment Variables

Add these to your `.env` file:
```bash
RENDERSEND_DB=supabase
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here
```

### 4. Storage Configuration

The encrypted blobs are still stored locally in the `STORAGE_DIR`. Only the metadata goes to Supabase. For full cloud deployment, you'll need to configure blob storage separately.

## Next Steps

- See `docs/claude-desktop-setup.md` for MCP server integration
- See `docs/requirements.md` for detailed security and architecture requirements
- Check the README.md for deployment instructions

# Rendersend

Zero-access encrypted hosting for HTML artifacts. Encrypt in the browser or CLI, share a link — the server stores only ciphertext and can never read the content.

## How it works

```
┌──────────────┐  1. encrypt + upload    ┌──────────────────┐
│  MCP / CLI   │ ───────────────────────▶│  API (Hono/Node) │
│   (Node)     │   opaque ciphertext     │  SQLite + FS      │
└──────────────┘                         └──────────────────┘
       │                                          ▲
       │ 2. /v/{id}#{aes-key}                     │ 3. fetch blob
       ▼                                          │
┌─────────────────────────────────────────────────┴─┐
│  Viewer (browser)                                  │
│  • AES key from URL fragment — never sent to API  │
│  • Decrypt via WebCrypto                          │
│  • Render in sandboxed srcdoc iframe + strict CSP │
└────────────────────────────────────────────────────┘
```

**Optional email pinning**: add one or more recipient emails at upload time. The viewer checks the entered email against the list before serving the ciphertext — a soft UX gate, not cryptographic enforcement.

---

## Repo layout

```
packages/
  api/        Hono HTTP server — stores opaque blobs, handles email-pinned gating
  viewer/     Vite/React SPA  — decrypts in browser, renders in sandboxed iframe
  mcp/        MCP server      — exposes share_html tool for Claude Desktop
  crypto/     Shared crypto   — AES-256-GCM via WebCrypto, runs in Node + browser
scripts/
  dev.mjs             Start API + viewer together for local dev
  build.mjs           Build viewer (Vite) + MCP server (tsup)
  release.mjs         Assemble release/ directory for VPS deployment
  test-e2e.mjs        End-to-end test harness (no browser needed)
  print-mcp-config.mjs  Generate Claude Desktop config snippet
docs/
  claude-desktop-setup.md   MCP wiring walkthrough
  requirements.md           Product requirements
```

---

## Prerequisites

- **Node 20+** (`node --version`)
- **pnpm 9+** (`pnpm --version`; install via `npm install -g pnpm`)

---

## Quick start (local dev)

```bash
git clone https://github.com/your-org/rendersend && cd rendersend
pnpm install

pnpm dev          # starts API on :8787 and viewer on :5173
```

In a second terminal, share something:

```bash
echo '<h1>Hello</h1>' | RENDERSEND_OWNER_EMAIL=you@example.com pnpm share
# → open the printed URL in a browser
```

The `dev` script runs both servers together and exits cleanly on Ctrl-C. To run them individually:

```bash
pnpm dev:api      # API only  (:8787)
pnpm dev:viewer   # viewer only (:5173)
```

---

## Running tests

```bash
pnpm test:store   # SQLite data-layer unit tests (fast, no server needed)
pnpm test:e2e     # full API end-to-end (boots a temp server, no browser needed)
pnpm test         # both
```

The e2e suite boots the API in a temp directory (isolated SQLite + blob storage), exercises all Phase A invariants, and tears down cleanly. Suitable for CI.

---

## Building

```bash
pnpm build
```

Produces:
- `packages/viewer/dist/` — static files ready to serve
- `packages/mcp/dist/` — self-contained MCP server bundle (no `--experimental-strip-types` needed)

---

## MCP setup (Claude Desktop)

The MCP server lets Claude call `share_html` directly from a conversation.

**Step 1** — ensure the dev servers are running (`pnpm dev`).

**Step 2** — generate your config snippet:

```bash
pnpm run print-mcp-config
```

After running `pnpm build` this uses the compiled `dist/index.js`. In dev (no build), it falls back to the TypeScript source with `--experimental-strip-types`.

**Step 3** — paste the snippet into `~/Library/Application Support/Claude/claude_desktop_config.json`, then fully quit and reopen Claude Desktop.

See `docs/claude-desktop-setup.md` for a detailed walkthrough and troubleshooting guide.

**Tool schema**

| Argument | Type | Required | Description |
|---|---|---|---|
| `html` | string | ✓ | HTML content to share (up to 10 MB) |
| `owner_email` | string | * | Your email. Falls back to `RENDERSEND_OWNER_EMAIL` env var. |
| `recipient_emails` | string[] | — | Lock the share to specific recipients. Each must verify their email at the viewer. |
| `expires_in_seconds` | number | — | `86400` / `604800` (default) / `2592000` / `31536000` |

---

## Deploying

```bash
pnpm release
```

Creates `release/` with built artifacts and a startup script. Deploy to any VPS:

```bash
scp -r release/ user@server:/opt/rendersend
ssh user@server "cd /opt/rendersend && sh start.sh"
```

Point nginx at `/opt/rendersend/viewer/` to serve the viewer static files.

See `release/.env.example` for all environment variables.

---

## Environment variables (API)

| Variable | Default | Description |
|---|---|---|
| `PORT` | `8787` | HTTP port |
| `STORAGE_DIR` | `./storage` | Root directory for blobs + SQLite DB |
| `RENDERSEND_DB` | `sqlite` | Storage backend (`sqlite` only for now) |
| `RENDERSEND_DB_PATH` | `./storage/rendersend.db` | SQLite file path |

---

## Security model

- **AES-256-GCM** authenticated encryption via WebCrypto. Tag covers IV + ciphertext.
- **Key in URL fragment** (`#`). Fragments are never sent in HTTP requests and don't appear in server logs.
- **Server is oblivious** — blobs are treated as opaque bytes. The API has no decryption capability.
- **Sandboxed rendering** — decrypted HTML renders in `<iframe sandbox="allow-scripts" srcdoc>` at a unique null origin. An injected CSP blocks all external network and form submissions inside the frame.
- **Email pinning is a UX gate**, not cryptographic enforcement. It prevents casual access and signals intent ("this was meant for you"), but anyone who has both the URL and knows the pinned email can access the content.

For the browser-side invariants (CSP, fragment clearing, etc.) see the detailed security notes in `docs/requirements.md`.

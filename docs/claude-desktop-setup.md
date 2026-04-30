# Claude Desktop setup (Flow 2)

Wire the local MCP server into Claude Desktop so Claude can call `share_html` directly while you chat.

## How this works

Claude Desktop **spawns** the MCP server as a subprocess over stdio when it needs it. You do not manually run the MCP server — only the local API and viewer dev server need to be running.

```
┌──────────────┐  spawns  ┌─────────────┐  HTTP   ┌─────────────┐
│   Claude     │ ───────▶ │  Rendersend │ ──────▶ │  Local API  │
│   Desktop    │  stdio   │     MCP     │         │  :8787      │
└──────────────┘          └─────────────┘         └─────────────┘
                                                         │
                                                         ▼
                                                  ┌─────────────┐
                                                  │   Viewer    │
                                                  │   :5173     │
                                                  └─────────────┘
```

## Prerequisites

- Node 22+ on `PATH` (`node --version` — yours is 23.11)
- Repo cloned and `pnpm install` run

## Step 1 — start the local API and viewer

In a terminal:

```bash
cd /Users/sunilgovindan/Work/rendersend
pnpm dev
```

Leave this running. The API will be on `:8787`, the viewer on `:5173`.

## Step 2 — generate your Claude Desktop config snippet

We provide a script that prints the exact JSON to paste, with absolute paths resolved for your machine:

```bash
pnpm run print-mcp-config
```

It will print something like:

```json
{
  "mcpServers": {
    "rendersend": {
      "command": "/Users/you/.nvm/versions/node/v23.11.0/bin/node",
      "args": [
        "--experimental-strip-types",
        "/Users/you/Work/rendersend/packages/mcp/src/index.ts"
      ],
      "env": {
        "RENDERSEND_API": "http://localhost:8787",
        "RENDERSEND_VIEWER": "http://localhost:5173"
      }
    }
  }
}
```

## Step 3 — install into Claude Desktop

Open the Claude Desktop config file (create it if missing):

```bash
open -a TextEdit "$HOME/Library/Application Support/Claude/claude_desktop_config.json"
```

If the file is empty, paste the full snippet from step 2.

If it already has an `mcpServers` block, merge the `rendersend` entry into it. For example:

```json
{
  "mcpServers": {
    "some-other-server": { "...": "..." },
    "rendersend": { "...": "..." }
  }
}
```

Save and **fully quit Claude Desktop** (`Cmd+Q`), then reopen it. The config is read only on startup.

## Step 4 — verify

In a new Claude Desktop conversation, look for the tools indicator (hammer icon in the message bar). You should see a `share_html` tool listed under the `rendersend` server.

Ask Claude something like:

> Generate a small HTML report on Q3 finances and share it with me using rendersend.

Claude will produce the HTML, then call `share_html`. The tool returns a link of the form `http://localhost:5173/v/{id}#{key}`. Open it in any browser tab to see the rendered report.

## Troubleshooting

**"No tools available" in Claude Desktop**

- Confirm the JSON parses (`cat ~/Library/Application\ Support/Claude/claude_desktop_config.json | jq .`).
- Confirm the absolute path to `node` is correct (`which node` should match the `command` field).
- Look at Claude Desktop logs at `~/Library/Logs/Claude/mcp*.log` for spawn errors.

**Tool runs but the link 404s**

- Check `pnpm dev` is running and `:8787`/`:5173` are listening.
- The MCP runs in a subprocess of Claude Desktop, so it inherits its env. The `RENDERSEND_API` env var in the config is what tells the MCP where to upload to.

**`Cannot find module @rendersend/crypto`**

- Run `pnpm install` at the repo root. Workspace symlinks must be in place.

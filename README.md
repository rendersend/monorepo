# Rendersend — Prototype

Zero-access encrypted hosting for HTML artifacts.

This prototype validates the core technical model: encrypt-on-client, opaque-blob-on-server, decrypt-in-browser. The server cannot read shared content.

## Architecture (prototype)

```
┌──────────────┐   1. encrypt + upload      ┌──────────────┐
│  MCP / CLI   │  ─────────────────────────▶│ API (Hono)   │
│   (Node)     │   blob (ciphertext only)   │  filesystem  │
└──────────────┘                             └──────────────┘
       │                                           ▲
       │ 2. returns /v/{id}#{key}                  │ 3. fetch blob
       ▼                                           │
┌──────────────────────────────────────────────────┴─┐
│          Viewer (browser, sandbox)                 │
│  • reads key from URL fragment (never sent)        │
│  • decrypts via WebCrypto                          │
│  • renders in srcdoc iframe with strict CSP        │
└────────────────────────────────────────────────────┘
```

**Storage backend** for the prototype is the local filesystem. MVP swaps it for Cloudflare R2 + D1 with no change to the API contract.

## Packages

| Package | Purpose |
| --- | --- |
| `@rendersend/crypto` | Pure WebCrypto AES-256-GCM primitives. Runs in Node 20+ and browser. |
| `@rendersend/api` | Hono server. `POST /blobs`, `GET /blobs/:id`. Treats bodies as opaque. |
| `@rendersend/viewer` | Static page (Vite). Decrypts in browser, renders in sandboxed iframe. |
| `@rendersend/mcp` | Local MCP server exposing `share_html`. Plus a CLI for testing. |

## Quickstart

```bash
pnpm install

# Run the full automated end-to-end test (no browser needed):
pnpm test:e2e

# Or, for manual browser validation:
pnpm dev                                              # starts API + viewer
echo '<h1>hello</h1>' | pnpm share                    # in another terminal
# → open the printed URL in a browser
```

## Security invariants verified by `pnpm test:e2e`

1. The API treats blobs as opaque — no parsing, no key handling.
2. `POST /blobs` returns an id; `GET /blobs/:id` returns the bytes unchanged.
3. The decryption key never appears in any HTTP request.
4. Decryption with the wrong key is rejected (GCM auth tag).
5. Tampered ciphertext is rejected.
6. Unknown blob ids return 404.
7. The 10MB upload cap is enforced.

## Browser-side security (validate manually)

When opening a share link in the browser:

1. The viewer chrome (`viewer.html`) runs under a strict CSP:
   - `default-src 'none'`, `script-src 'self'`, `connect-src 'self' <api>`
2. The decrypted HTML renders inside a `<iframe sandbox="allow-scripts" srcdoc="…">`:
   - Unique origin (no `allow-same-origin`) — cannot read parent location
   - Cannot submit forms, navigate top, open popups
   - Injected meta CSP blocks all external network
3. `window.location.hash` is cleared after key extraction to reduce leakage surface.

To verify external network is blocked, share an HTML that includes `<img src="https://example.com/pixel.png">` and confirm in DevTools → Network that the request is blocked by CSP.

## What's deferred to MVP

- Owner authentication (passkey via WebAuthn + recovery codes)
- Private-share mode with X25519 per-recipient key wrapping
- View receipts (per-recipient last-viewed timestamps)
- Cloudflare R2 / D1 / Workers deploy
- Owner dashboard
- Share revocation, custom expiry
- Production CSP (origin allowlist, not localhost)

## What's deliberately rejected

- Server-side encryption mode — would erode the zero-access claim
- Hosted MCP with key custody — see decision in `docs/decisions.md` (v1)
- "Never expires" share option — security footgun
- Editor role — HTML is regenerated, not edited

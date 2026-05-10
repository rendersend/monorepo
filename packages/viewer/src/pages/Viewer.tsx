import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { BrandMark } from "@/components/rendersend/BrandMark";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  importKeyRaw,
  decrypt,
  unpackBlob,
  b64UrlToBytes,
  decodeUtf8,
} from "@rendersend/crypto";

const API_BASE =
  (import.meta.env.VITE_API_BASE as string | undefined) ?? "http://localhost:8787";

type State = "loading" | "verify" | "content" | "error";
type ErrorKind =
  | "invalid"
  | "not_found"
  | "expired"
  | "decryption_failed"
  | "network"
  | "server";

const ERROR_COPY: Record<ErrorKind, { title: string; body: string }> = {
  invalid: {
    title: "Invalid link",
    body:
      "This link is missing or malformed. Make sure you copied the full URL including the part after #.",
  },
  not_found: {
    title: "Not found",
    body: "This share doesn't exist or has been revoked.",
  },
  expired: {
    title: "Expired",
    body: "This share has expired and is no longer available.",
  },
  decryption_failed: {
    title: "Decryption failed",
    body: "The link may be corrupted or the content has been tampered with.",
  },
  network: {
    title: "Connection problem",
    body: "We couldn't reach the server. Check your connection and try again.",
  },
  server: { title: "Server error", body: "Something went wrong on our end." },
};

const STORAGE_PREFIX = "rs:verified:";
const VERIFY_TTL_MS = 30 * 24 * 60 * 60 * 1000;

const PadlockKeyholeIcon = () => (
  <svg
    width="22"
    height="22"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <rect x="4" y="11" width="16" height="10" rx="2" />
    <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    <circle cx="12" cy="15.5" r="1.2" fill="currentColor" />
    <path d="M12 16.7v2" />
  </svg>
);

const AlertIcon = () => (
  <svg
    width="22"
    height="22"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <circle cx="12" cy="12" r="9" />
    <path d="M12 8v5" />
    <path d="M12 16.5h.01" />
  </svg>
);

/**
 * Wrap user HTML with a strict meta-CSP. Combined with the iframe's
 * `sandbox="allow-scripts"` (no allow-same-origin), this:
 *   - puts the iframe at a unique null origin (cannot reach parent state)
 *   - blocks all external network from inside the iframe
 *   - allows inline scripts & styles so chart-heavy reports work
 */
function wrapForSandbox(userHtml: string): string {
  const csp = [
    "default-src 'none'",
    "script-src 'unsafe-inline'",
    "style-src 'unsafe-inline'",
    "img-src data: blob:",
    "font-src data:",
    "media-src data: blob:",
    "form-action 'none'",
    "base-uri 'none'",
    "frame-ancestors 'self'",
  ].join("; ");

  const hasHtml = /<html[\s>]/i.test(userHtml);
  if (hasHtml) {
    return userHtml.replace(
      /<head(\s[^>]*)?>/i,
      (m) => `${m}<meta http-equiv="Content-Security-Policy" content="${csp}">`,
    );
  }
  return `<!doctype html><html><head>
    <meta charset="utf-8">
    <meta http-equiv="Content-Security-Policy" content="${csp}">
    <meta name="viewport" content="width=device-width, initial-scale=1">
  </head><body>${userHtml}</body></html>`;
}

interface CacheEntry {
  email: string;
  ts: number;
}

function readCachedEmail(id: string): string | null {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + id);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<CacheEntry>;
    if (typeof parsed.email !== "string" || typeof parsed.ts !== "number") {
      localStorage.removeItem(STORAGE_PREFIX + id);
      return null;
    }
    if (Date.now() - parsed.ts > VERIFY_TTL_MS) {
      localStorage.removeItem(STORAGE_PREFIX + id);
      return null;
    }
    return parsed.email;
  } catch {
    return null;
  }
}

function writeCachedEmail(id: string, email: string): void {
  try {
    localStorage.setItem(
      STORAGE_PREFIX + id,
      JSON.stringify({ email, ts: Date.now() } satisfies CacheEntry),
    );
  } catch {
    /* private mode — silent */
  }
}

function clearCachedEmail(id: string): void {
  try {
    localStorage.removeItem(STORAGE_PREFIX + id);
  } catch {}
}

function parseKeyFromHash(): Uint8Array | null {
  const hash = window.location.hash.startsWith("#")
    ? window.location.hash.slice(1)
    : "";
  if (!hash || !/^[A-Za-z0-9_-]+$/.test(hash)) return null;
  try {
    return b64UrlToBytes(hash);
  } catch {
    return null;
  }
}

type FetchResult =
  | { kind: "ok"; bytes: Uint8Array }
  | { kind: "verify_required" }
  | { kind: "verify_failed" }
  | { kind: "rate_limited" }
  | { kind: "not_found" }
  | { kind: "expired" }
  | { kind: "network" }
  | { kind: "server"; status: number };

async function fetchBlob(shareId: string, sid: string | null): Promise<FetchResult> {
  let r: Response;
  try {
    r = await fetch(`${API_BASE}/blobs/${shareId}`, {
      headers: sid ? { "X-Session-ID": sid } : {},
    });
  } catch {
    return { kind: "network" };
  }
  if (r.ok) return { kind: "ok", bytes: new Uint8Array(await r.arrayBuffer()) };
  if (r.status === 403) {
    const j = (await r.json().catch(() => ({}))) as { error?: string };
    if (j.error === "verify_required") return { kind: "verify_required" };
    return { kind: "server", status: 403 };
  }
  if (r.status === 404) return { kind: "not_found" };
  if (r.status === 410) return { kind: "expired" };
  return { kind: "server", status: r.status };
}

async function postAccess(shareId: string, em: string, sid: string | null): Promise<FetchResult> {
  let r: Response;
  try {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (sid) headers["X-Session-ID"] = sid;
    r = await fetch(`${API_BASE}/blobs/${shareId}/access`, {
      method: "POST",
      headers,
      body: JSON.stringify({ email: em }),
    });
  } catch {
    return { kind: "network" };
  }
  if (r.ok) return { kind: "ok", bytes: new Uint8Array(await r.arrayBuffer()) };
  if (r.status === 401) return { kind: "verify_failed" };
  if (r.status === 429) return { kind: "rate_limited" };
  if (r.status === 404) return { kind: "not_found" };
  if (r.status === 410) return { kind: "expired" };
  return { kind: "server", status: r.status };
}

const Viewer = () => {
  const { id = "" } = useParams();
  const [state, setState] = useState<State>("loading");
  const [errorKind, setErrorKind] = useState<ErrorKind>("not_found");
  const [email, setEmail] = useState("");
  const [inlineError, setInlineError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [meta, setMeta] = useState<string | null>(null);
  const [decryptedHtml, setDecryptedHtml] = useState<string | null>(null);
  const [iframeLoaded, setIframeLoaded] = useState(false);
  const emailRef = useRef<HTMLInputElement | null>(null);
  const keyBytesRef = useRef<Uint8Array | null>(null);
  const sessionIdRef = useRef<string | null>(null);

  // Initial mount: parse fragment, optionally auto-verify with a cached
  // email, otherwise GET the blob and either render or surface verify.
  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      if (!id || !/^[0-9a-f]{32}$/.test(id)) {
        setErrorKind("invalid");
        setState("error");
        return;
      }
      const keyBytes = parseKeyFromHash();
      if (!keyBytes) {
        setErrorKind("invalid");
        setState("error");
        return;
      }
      keyBytesRef.current = keyBytes;
      history.replaceState(null, "", window.location.pathname);

      // create a debug session for this viewer
      try {
        const s = await fetch(`${API_BASE}/sessions`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ source: "web" }),
        });
        const d = (await s.json()) as { id: string };
        sessionIdRef.current = d.id;
      } catch { /* non-critical */ }

      const sid = sessionIdRef.current;

      const cached = readCachedEmail(id);
      if (cached) {
        const result = await postAccess(id, cached, sid);
        if (cancelled) return;
        if (result.kind === "ok") {
          await renderBytes(result.bytes);
          return;
        }
        if (result.kind === "verify_failed") {
          clearCachedEmail(id);
          // fall through to standard flow
        } else {
          handleNonOkResult(result, false);
          return;
        }
      }

      const r = await fetchBlob(id, sid);
      if (cancelled) return;
      if (r.kind === "ok") {
        await renderBytes(r.bytes);
        return;
      }
      if (r.kind === "verify_required") {
        setState("verify");
        return;
      }
      handleNonOkResult(r, false);
    };

    void run();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Autofocus the email input ~280ms after entering verify.
  useEffect(() => {
    if (state !== "verify") return;
    const t = window.setTimeout(() => emailRef.current?.focus(), 280);
    return () => window.clearTimeout(t);
  }, [state]);

  function handleNonOkResult(r: FetchResult, asInlineError: boolean): void {
    if (r.kind === "verify_failed") {
      if (asInlineError) {
        setInlineError(
          "Couldn't verify that email. Make sure you're using the address this was shared with.",
        );
      } else {
        setState("verify");
      }
      return;
    }
    if (r.kind === "rate_limited") {
      setState("verify");
      setInlineError("Too many attempts on this share. Try again in a few minutes.");
      return;
    }
    if (r.kind === "not_found") {
      clearCachedEmail(id);
      setErrorKind("not_found");
      setState("error");
      return;
    }
    if (r.kind === "expired") {
      clearCachedEmail(id);
      setErrorKind("expired");
      setState("error");
      return;
    }
    if (r.kind === "network") {
      setErrorKind("network");
      setState("error");
      return;
    }
    setErrorKind("server");
    setState("error");
  }

  async function renderBytes(packed: Uint8Array): Promise<void> {
    const keyBytes = keyBytesRef.current;
    if (!keyBytes) {
      setErrorKind("decryption_failed");
      setState("error");
      return;
    }
    try {
      const blob = unpackBlob(packed);
      const key = await importKeyRaw(keyBytes);
      const plaintext = await decrypt(key, blob);
      const html = decodeUtf8(plaintext);
      setDecryptedHtml(wrapForSandbox(html));
      setMeta(`${(packed.byteLength / 1024).toFixed(1)} KB · decrypted locally`);
      setState("content");
    } catch {
      setErrorKind("decryption_failed");
      setState("error");
    }
  }

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    const trimmed = email.trim();
    if (!/^\S+@\S+\.\S+$/.test(trimmed)) {
      setInlineError("Please enter a valid email address.");
      return;
    }
    setSubmitting(true);
    setInlineError(null);

    const result = await postAccess(id, trimmed, sessionIdRef.current);
    setSubmitting(false);

    if (result.kind === "ok") {
      writeCachedEmail(id, trimmed);
      await renderBytes(result.bytes);
      return;
    }
    handleNonOkResult(result, true);
  };

  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* Top brand bar */}
      <header className="flex h-11 shrink-0 items-center justify-between border-b border-border bg-background px-4 sm:px-6">
        <a href="/" className="flex items-center gap-2">
          <BrandMark />
          <span className="text-[15px] font-semibold tracking-tight text-foreground">
            Rendersend
          </span>
        </a>
        <div
          className={cn(
            "text-xs text-muted-foreground tabular-nums transition-opacity duration-200",
            state === "content" && meta ? "opacity-100" : "opacity-0",
          )}
          aria-live="polite"
        >
          {meta}
        </div>
      </header>

      {/* Stage */}
      <div className="hero-backdrop relative flex-1 overflow-hidden">
        {/* LOADING */}
        <Stage active={state === "loading"}>
          <div className="flex flex-col items-center gap-3">
            <span
              aria-hidden="true"
              className="inline-block h-[22px] w-[22px] animate-spin rounded-full border-2 border-border"
              style={{
                borderTopColor: "hsl(var(--accent))",
                animationDuration: "700ms",
                animationTimingFunction: "linear",
              }}
            />
            <p className="text-sm text-muted-foreground" role="status">
              Decrypting securely…
            </p>
          </div>
        </Stage>

        {/* VERIFY */}
        <Stage active={state === "verify"}>
          <div className="w-full max-w-[26rem] rounded-2xl border border-border bg-surface p-7 shadow-card">
            <div
              className="flex h-11 w-11 items-center justify-center rounded-xl"
              style={{
                background: "hsl(var(--accent) / 0.08)",
                color: "hsl(var(--accent))",
              }}
              aria-hidden="true"
            >
              <PadlockKeyholeIcon />
            </div>
            <h1 className="mt-5 text-xl font-semibold tracking-tight text-foreground">
              Encrypted document
            </h1>
            <p className="mt-1.5 text-sm text-muted-foreground">
              This document was shared with a specific recipient. Enter the email it was
              sent to.
            </p>

            <form onSubmit={handleVerify} className="mt-5 space-y-3" noValidate>
              <div className="space-y-1.5 text-left">
                <label
                  htmlFor="recipient-email"
                  className="block text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground"
                >
                  Your email
                </label>
                <Input
                  ref={emailRef}
                  id="recipient-email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (inlineError) setInlineError(null);
                  }}
                  placeholder="you@company.com"
                  className="h-10 rounded-[10px] border-border bg-surface px-3 focus-visible:ring-1 focus-visible:ring-ring"
                  disabled={submitting}
                  required
                />
              </div>

              <Button type="submit" className="w-full" disabled={submitting}>
                {submitting ? "Verifying…" : "View document"}
              </Button>

              <div
                className={cn(
                  "overflow-hidden transition-all duration-200",
                  inlineError ? "max-h-12 opacity-100" : "max-h-0 opacity-0",
                )}
                aria-live="polite"
              >
                <div
                  className="rounded-[10px] px-3 py-2 text-xs"
                  style={{
                    background: "hsl(var(--destructive) / 0.1)",
                    color: "hsl(var(--destructive))",
                  }}
                >
                  {inlineError}
                </div>
              </div>
            </form>

            <p className="mt-6 text-xs text-muted-foreground/80">
              Decryption happens in your browser. The server cannot read this content.
            </p>
          </div>
        </Stage>

        {/* CONTENT */}
        <Stage active={state === "content"} padded={false}>
          {decryptedHtml ? (
            <iframe
              title="Shared document"
              sandbox="allow-scripts"
              referrerPolicy="no-referrer"
              srcDoc={decryptedHtml}
              onLoad={() => setIframeLoaded(true)}
              className={cn(
                "h-full w-full border-0 bg-white transition-opacity",
                iframeLoaded ? "opacity-100" : "opacity-0",
              )}
              style={{ transitionDuration: "280ms" }}
            />
          ) : null}
        </Stage>

        {/* ERROR */}
        <Stage active={state === "error"}>
          <div className="w-full max-w-[26rem] rounded-2xl border border-border bg-surface p-7 shadow-card">
            <div
              className="flex h-11 w-11 items-center justify-center rounded-xl"
              style={{
                background: "hsl(var(--destructive) / 0.1)",
                color: "hsl(var(--destructive))",
              }}
              aria-hidden="true"
            >
              <AlertIcon />
            </div>
            <h1 className="mt-5 text-xl font-semibold tracking-tight text-foreground">
              {ERROR_COPY[errorKind].title}
            </h1>
            <p className="mt-1.5 text-sm text-muted-foreground">
              {ERROR_COPY[errorKind].body}
            </p>
          </div>
        </Stage>
      </div>
    </div>
  );
};

const Stage = ({
  active,
  children,
  padded = true,
}: {
  active: boolean;
  children: React.ReactNode;
  padded?: boolean;
}) => (
  <div
    className={cn(
      "absolute inset-0 flex items-center justify-center",
      padded && "p-6",
      active ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0",
    )}
    style={{
      transform: active ? "translateY(0)" : "translateY(6px)",
      transition:
        "opacity 240ms cubic-bezier(0.32, 0.72, 0, 1), transform 240ms cubic-bezier(0.32, 0.72, 0, 1)",
    }}
    aria-hidden={!active}
  >
    {children}
  </div>
);

export default Viewer;

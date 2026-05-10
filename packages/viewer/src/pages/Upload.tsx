import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase, AUTH_MODE } from "@/lib/supabase";
import {
  ArrowRight,
  Copy,
  Mail,
  Check,
  FileText,
  RefreshCw,
  X,
  UploadCloud,
} from "lucide-react";
import { BrandMark } from "@/components/rendersend/BrandMark";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  generateKey,
  exportKeyRaw,
  encrypt,
  packBlob,
  bytesToB64Url,
  encodeUtf8,
} from "@rendersend/crypto";

const API_BASE =
  (import.meta.env.VITE_API_BASE as string | undefined) ?? "http://localhost:8787";
const VIEWER_BASE =
  (import.meta.env.VITE_VIEWER_BASE as string | undefined) ?? window.location.origin;

const MAX_BYTES = 10 * 1024 * 1024;
const MAX_RECIPIENTS = 25;
const OWNER_KEY = "rs:lastOwnerEmail";

const EXPIRY_OPTIONS = [
  { value: "86400", label: "24 hours" },
  { value: "604800", label: "7 days" },
  { value: "2592000", label: "30 days" },
  { value: "31536000", label: "1 year" },
];

interface ShareSuccess {
  url: string;
  expiresAt: number;
  byteLength: number;
  recipientEmails: string[];
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

function isHtmlFile(file: File): boolean {
  if (file.type === "text/html") return true;
  return /\.(html?|HTML?)$/.test(file.name);
}

function isValidEmail(s: string): boolean {
  return /^\S+@\S+\.\S+$/.test(s);
}

function recipientSubtitle(emails: string[]): string {
  if (emails.length === 1) {
    return `Send it to ${emails[0]} — they'll verify their email at the viewer.`;
  }
  if (emails.length === 2) {
    return `Send it to ${emails[0]} and ${emails[1]} — each verifies their own email.`;
  }
  const rest = emails.length - 2;
  return `Send it to ${emails[0]}, ${emails[1]}, and ${rest} more — each verifies their own email.`;
}

const Upload = () => {
  const navigate = useNavigate();
  const [ownerEmail, setOwnerEmail] = useState("");
  const [recipientEmails, setRecipientEmails] = useState<string[]>([]);
  const [expiresIn, setExpiresIn] = useState("604800");
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ShareSuccess | null>(null);
  const [copied, setCopied] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const accessTokenRef = useRef<string | null>(null);

  useEffect(() => {
    const init = async () => {
      if (AUTH_MODE === "supabase") {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) { navigate("/login", { replace: true }); return; }
        accessTokenRef.current = session.access_token;
        setOwnerEmail(session.user.email ?? "");
      } else {
        try {
          const saved = localStorage.getItem(OWNER_KEY);
          if (saved) setOwnerEmail(saved);
        } catch {}
      }

      fetch(`${API_BASE}/sessions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source: "web" }),
      })
        .then((r) => r.json())
        .then((d: { id: string }) => { sessionIdRef.current = d.id; })
        .catch(() => {});
    };
    void init();
  }, [navigate]);

  const acceptFile = (f: File): void => {
    if (!isHtmlFile(f)) {
      setError("Please choose an HTML file (.html or .htm).");
      return;
    }
    if (f.size > MAX_BYTES) {
      setError(`File is ${formatBytes(f.size)}. Max is 10 MB.`);
      return;
    }
    setError(null);
    setFile(f);
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const owner = ownerEmail.trim();
    if (!isValidEmail(owner)) {
      setError("Enter a valid email for yourself.");
      return;
    }
    if (!file) {
      setError("Choose an HTML file to share.");
      return;
    }

    setSubmitting(true);
    try {
      const html = await file.text();
      const plaintext = encodeUtf8(html);
      if (plaintext.byteLength > MAX_BYTES) {
        throw new Error(`File is ${formatBytes(plaintext.byteLength)}. Max is 10 MB.`);
      }

      const key = await generateKey();
      const blob = await encrypt(key, plaintext);
      const packed = packBlob(blob);

      const headers: Record<string, string> = {
        "Content-Type": "application/octet-stream",
        "X-Expires-In-Seconds": expiresIn,
      };
      if (AUTH_MODE === "supabase" && accessTokenRef.current) {
        headers["Authorization"] = `Bearer ${accessTokenRef.current}`;
      } else {
        headers["X-Owner-Email"] = owner;
      }
      if (recipientEmails.length > 0) {
        headers["X-Recipient-Emails"] = recipientEmails.join(",");
      }
      if (sessionIdRef.current) {
        headers["X-Session-ID"] = sessionIdRef.current;
      }

      const resp = await fetch(`${API_BASE}/blobs`, {
        method: "POST",
        headers,
        body: packed,
      });
      if (!resp.ok) {
        const text = await resp.text();
        throw new Error(`Upload failed: HTTP ${resp.status} — ${text}`);
      }
      const { id, expiresAt } = (await resp.json()) as {
        id: string;
        expiresAt: number;
        requiresVerify: boolean;
      };

      const rawKey = await exportKeyRaw(key);
      const keyB64 = bytesToB64Url(rawKey);
      const url = `${VIEWER_BASE}/v/${id}#${keyB64}`;

      try { localStorage.setItem(OWNER_KEY, owner); } catch {}

      setResult({ url, expiresAt, byteLength: packed.byteLength, recipientEmails });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  const onCopy = async () => {
    if (!result) return;
    await navigator.clipboard.writeText(result.url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const onMailto = () => {
    if (!result || result.recipientEmails.length === 0) return;
    const subject = "An encrypted document was shared with you";
    const body = [
      "Someone shared an encrypted HTML document with you via Rendersend.",
      "",
      "Open this link in your browser to decrypt and view it:",
      result.url,
      "",
      "The decryption key is part of the URL after the # symbol — keep the",
      "full link confidential. Do not paste it into untrusted services.",
    ].join("\n");

    const addressList = result.recipientEmails.join(",");
    if (result.recipientEmails.length === 1) {
      window.location.href =
        `mailto:${encodeURIComponent(result.recipientEmails[0])}` +
        `?subject=${encodeURIComponent(subject)}` +
        `&body=${encodeURIComponent(body)}`;
    } else {
      window.location.href =
        `mailto:?bcc=${encodeURIComponent(addressList)}` +
        `&subject=${encodeURIComponent(subject)}` +
        `&body=${encodeURIComponent(body)}`;
    }
  };

  const reset = () => {
    setResult(null);
    setFile(null);
    setRecipientEmails([]);
    setError(null);
    setCopied(false);
    if (fileRef.current) fileRef.current.value = "";
  };

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="flex h-16 shrink-0 items-center border-b border-border bg-background px-4 sm:px-6">
        <a href="/" className="flex items-center gap-2">
          <BrandMark />
          <span className="text-[15px] font-semibold tracking-tight text-foreground">
            Rendersend
          </span>
        </a>
      </header>

      <div className="hero-backdrop relative flex-1 overflow-y-auto">
        {!result ? (
          <div className="container max-w-[640px] py-12 sm:py-16">
            <div className="mb-8 text-center">
              <p className="eyebrow mb-3">Share securely</p>
              <h1 className="text-balance text-3xl text-foreground sm:text-[34px] sm:leading-[1.1]">
                Encrypt &amp; share an HTML document
              </h1>
              <p className="mt-3 text-sm text-muted-foreground sm:text-[15px]">
                Encryption happens in your browser. The server only ever sees ciphertext.
              </p>
            </div>

            <form
              onSubmit={onSubmit}
              className="rounded-2xl border border-border bg-surface p-6 shadow-card sm:p-7"
              noValidate
            >
              <input
                ref={fileRef}
                type="file"
                accept=".html,.htm,text/html"
                onChange={(e) => e.target.files?.[0] && acceptFile(e.target.files[0])}
                className="sr-only"
                id="file-input"
              />

              {file ? (
                <SelectedFile
                  file={file}
                  onChange={() => fileRef.current?.click()}
                  onRemove={() => {
                    setFile(null);
                    if (fileRef.current) fileRef.current.value = "";
                  }}
                />
              ) : (
                <Dropzone
                  dragOver={dragOver}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragOver(true);
                  }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragOver(false);
                    const f = e.dataTransfer.files[0];
                    if (f) acceptFile(f);
                  }}
                  onClick={() => fileRef.current?.click()}
                />
              )}

              <div className="mt-6 grid gap-5 sm:grid-cols-2">
                <Field
                  id="owner-email"
                  label="Your email"
                  hint={AUTH_MODE === "supabase" ? "Signed in via Google." : "Used to track and manage your shares."}
                >
                  <Input
                    id="owner-email"
                    type="email"
                    autoComplete="email"
                    required
                    value={ownerEmail}
                    onChange={(e) => { if (AUTH_MODE !== "supabase") setOwnerEmail(e.target.value); }}
                    readOnly={AUTH_MODE === "supabase"}
                    placeholder="you@company.com"
                    className="h-10 rounded-[10px]"
                  />
                </Field>

                <Field
                  id="recipient-emails"
                  label="Recipients"
                  hint="Optional. Each must verify their email to view."
                >
                  <EmailChipInput
                    id="recipient-emails"
                    emails={recipientEmails}
                    onChange={setRecipientEmails}
                    disabled={submitting}
                  />
                </Field>
              </div>

              <div className="mt-5">
                <Field id="expires" label="Expires">
                  <Select value={expiresIn} onValueChange={setExpiresIn}>
                    <SelectTrigger
                      id="expires"
                      className="h-10 rounded-[10px] bg-surface"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {EXPIRY_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              </div>

              {error && (
                <div
                  className="mt-5 rounded-[10px] px-3 py-2 text-xs"
                  style={{
                    background: "hsl(var(--destructive) / 0.1)",
                    color: "hsl(var(--destructive))",
                  }}
                  role="alert"
                >
                  {error}
                </div>
              )}

              <div className="mt-6 flex items-center justify-end">
                <Button type="submit" size="lg" disabled={submitting}>
                  {submitting ? "Encrypting…" : "Share securely"}
                  {!submitting && <ArrowRight className="size-4" />}
                </Button>
              </div>
            </form>
            <p className="mt-6 text-center text-xs text-muted-foreground">
              AES-256-GCM · WebCrypto · Sandboxed iframe rendering
            </p>
          </div>
        ) : (
          <div className="container flex min-h-full max-w-[560px] flex-col items-center justify-center py-12">
            <div className="w-full animate-fade-in">
              <ShareResult
                result={result}
                copied={copied}
                onCopy={onCopy}
                onMailto={onMailto}
                onReset={reset}
              />
              <p className="mt-6 text-center text-xs text-muted-foreground">
                AES-256-GCM · WebCrypto · Sandboxed iframe rendering
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// ---------- EmailChipInput ----------

const EmailChipInput = ({
  id,
  emails,
  onChange,
  disabled = false,
}: {
  id?: string;
  emails: string[];
  onChange: (emails: string[]) => void;
  disabled?: boolean;
}) => {
  const [inputValue, setInputValue] = useState("");
  const [invalidHint, setInvalidHint] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const addEmail = (raw: string) => {
    const em = raw.trim().toLowerCase();
    if (!em) return;
    if (!isValidEmail(em)) {
      setInvalidHint(true);
      setTimeout(() => setInvalidHint(false), 2000);
      return;
    }
    if (emails.includes(em) || emails.length >= MAX_RECIPIENTS) {
      setInputValue("");
      return;
    }
    onChange([...emails, em]);
    setInputValue("");
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      if (inputValue.trim()) {
        e.preventDefault();
        addEmail(inputValue);
      }
    } else if (e.key === "Tab" && inputValue.trim()) {
      e.preventDefault();
      addEmail(inputValue);
    } else if (e.key === "Backspace" && !inputValue && emails.length > 0) {
      onChange(emails.slice(0, -1));
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const text = e.clipboardData.getData("text");
    const parts = text.split(/[\s,;]+/).filter(Boolean);
    if (parts.length > 1 || (parts.length === 1 && text.includes(","))) {
      e.preventDefault();
      const valid = parts
        .map((p) => p.trim().toLowerCase())
        .filter((p) => isValidEmail(p) && !emails.includes(p));
      const next = [...emails, ...valid].slice(0, MAX_RECIPIENTS);
      onChange(next);
      setInputValue("");
    }
  };

  return (
    <div>
      <div
        onClick={() => inputRef.current?.focus()}
        className={cn(
          "flex min-h-10 flex-wrap items-center gap-1.5 rounded-[10px] border border-border bg-background px-3 py-2 cursor-text",
          "focus-within:outline-none focus-within:ring-1 focus-within:ring-ring",
          disabled && "pointer-events-none opacity-50",
          invalidHint && "border-destructive",
        )}
      >
        {emails.map((em) => (
          <span
            key={em}
            className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-foreground"
          >
            {em}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onChange(emails.filter((x) => x !== em));
              }}
              className="text-muted-foreground hover:text-foreground focus:outline-none"
              aria-label={`Remove ${em}`}
            >
              <X className="size-3" />
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          id={id}
          type="email"
          autoComplete="off"
          disabled={disabled}
          value={inputValue}
          onChange={(e) => {
            setInputValue(e.target.value);
            if (invalidHint) setInvalidHint(false);
          }}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          onBlur={() => {
            if (inputValue.trim()) addEmail(inputValue);
          }}
          placeholder={emails.length === 0 ? "alice@example.com" : ""}
          className="min-w-[120px] flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed"
        />
      </div>
      {invalidHint && (
        <p className="mt-1 text-xs" style={{ color: "hsl(var(--destructive))" }}>
          That doesn't look like a valid email address.
        </p>
      )}
    </div>
  );
};

// ---------- Dropzone ----------

const Dropzone = ({
  dragOver,
  onDragOver,
  onDragLeave,
  onDrop,
  onClick,
}: {
  dragOver: boolean;
  onDragOver: React.DragEventHandler<HTMLDivElement>;
  onDragLeave: React.DragEventHandler<HTMLDivElement>;
  onDrop: React.DragEventHandler<HTMLDivElement>;
  onClick: () => void;
}) => (
  <div
    role="button"
    tabIndex={0}
    onClick={onClick}
    onKeyDown={(e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onClick();
      }
    }}
    onDragOver={onDragOver}
    onDragLeave={onDragLeave}
    onDrop={onDrop}
    className={cn(
      "flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-12 text-center transition-all",
      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
      dragOver
        ? "border-foreground bg-muted/60"
        : "border-border bg-muted/30 hover:bg-muted/50",
    )}
  >
    <div
      className="flex h-12 w-12 items-center justify-center rounded-xl"
      style={{
        background: "hsl(var(--accent) / 0.08)",
        color: "hsl(var(--accent))",
      }}
      aria-hidden="true"
    >
      <UploadCloud className="size-6" />
    </div>
    <p className="mt-4 text-[15px] font-medium text-foreground">
      Drop your HTML file here
    </p>
    <p className="mt-1 text-sm text-muted-foreground">or click to browse</p>
    <p className="mt-3 text-xs text-muted-foreground/80">
      .html or .htm · up to 10 MB
    </p>
  </div>
);

// ---------- SelectedFile ----------

const SelectedFile = ({
  file,
  onChange,
  onRemove,
}: {
  file: File;
  onChange: () => void;
  onRemove: () => void;
}) => (
  <div className="flex items-center justify-between gap-4 rounded-2xl border border-border bg-surface p-4">
    <div className="flex min-w-0 items-center gap-3">
      <div
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
        style={{
          background: "hsl(var(--accent) / 0.08)",
          color: "hsl(var(--accent))",
        }}
        aria-hidden="true"
      >
        <FileText className="size-5" />
      </div>
      <div className="min-w-0">
        <div className="truncate text-[14px] font-medium text-foreground">
          {file.name}
        </div>
        <div className="text-xs text-muted-foreground tabular-nums">
          {formatBytes(file.size)}
        </div>
      </div>
    </div>
    <div className="flex shrink-0 items-center gap-1">
      <Button type="button" variant="ghost" size="sm" onClick={onChange}>
        Change
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={onRemove}
        aria-label="Remove file"
      >
        <X className="size-4" />
      </Button>
    </div>
  </div>
);

// ---------- Field ----------

const Field = ({
  id,
  label,
  hint,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  children: React.ReactNode;
}) => (
  <div className="space-y-1.5 text-left">
    <label
      htmlFor={id}
      className="block text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground"
    >
      {label}
    </label>
    {children}
    {hint && <p className="text-xs text-muted-foreground/80">{hint}</p>}
  </div>
);

// ---------- ShareResult ----------

const ShareResult = ({
  result,
  copied,
  onCopy,
  onMailto,
  onReset,
}: {
  result: ShareSuccess;
  copied: boolean;
  onCopy: () => void;
  onMailto: () => void;
  onReset: () => void;
}) => {
  const pinned = result.recipientEmails.length > 0;

  return (
    <div className="rounded-2xl border border-border bg-surface p-7 shadow-card">
      <div
        className="flex h-11 w-11 items-center justify-center rounded-xl"
        style={{
          background: "hsl(var(--accent) / 0.08)",
          color: "hsl(var(--accent))",
        }}
        aria-hidden="true"
      >
        <Check className="size-5" />
      </div>

      <h2 className="mt-5 text-xl font-semibold tracking-tight">
        {pinned ? "Encrypted. Ready to send." : "Encrypted. Ready to share."}
      </h2>
      <p className="mt-1.5 text-sm text-muted-foreground">
        {pinned
          ? recipientSubtitle(result.recipientEmails)
          : "Anyone with this link can decrypt and view the content."}
      </p>

      {/* URL row */}
      <div className="mt-5 flex items-stretch gap-2">
        <input
          readOnly
          value={result.url}
          className={cn(
            "flex-1 rounded-[10px] border border-border bg-background px-3 py-2",
            "font-mono text-xs text-foreground",
          )}
          onFocus={(e) => e.currentTarget.select()}
        />
        {pinned && (
          <Button onClick={onCopy} size="default" variant="outline">
            {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
            {copied ? "Copied" : "Copy"}
          </Button>
        )}
      </div>

      {/* Meta */}
      <div className="mt-4 flex flex-wrap gap-3 text-xs text-muted-foreground tabular-nums">
        <span>Expires {new Date(result.expiresAt).toLocaleString()}</span>
        <span>·</span>
        <span>{(result.byteLength / 1024).toFixed(1)} KB encrypted</span>
        {pinned && (
          <>
            <span>·</span>
            <span className="rounded-md bg-muted px-2 py-0.5 text-foreground">
              Email-pinned
            </span>
          </>
        )}
      </div>

      {/* Primary CTA */}
      <div className="mt-6">
        {pinned ? (
          <Button onClick={onMailto} className="w-full justify-between" size="default">
            <Mail className="size-4" />
            <span className="flex-1 text-left px-2">
              {result.recipientEmails.length === 1
                ? `Email link to ${result.recipientEmails[0]}`
                : "Email link to all recipients"}
            </span>
            <ArrowRight className="size-4" />
          </Button>
        ) : (
          <Button onClick={onCopy} className="w-full" size="default">
            {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
            {copied ? "Copied!" : "Copy link"}
          </Button>
        )}
      </div>

      {/* Quiet reset link */}
      <button
        type="button"
        onClick={onReset}
        className="mt-4 flex w-full items-center justify-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <RefreshCw className="size-3.5" />
        Share another
      </button>
    </div>
  );
};

export default Upload;

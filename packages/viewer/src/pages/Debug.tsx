import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronRight, Download, RefreshCw, X } from "lucide-react";
import { BrandMark } from "@/components/rendersend/BrandMark";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

const API_BASE =
  (import.meta.env.VITE_API_BASE as string | undefined) ?? "http://localhost:8787";

type EventLevel = "info" | "warn" | "error";
type SessionSource = "mcp" | "web" | "api";
type LevelFilter = "all" | EventLevel;
type SourceFilter = "all" | SessionSource;

interface FlatEvent {
  id: string;
  sessionId: string;
  ts: number;
  level: EventLevel;
  event: string;
  message: string;
  shareId: string | null;
  payload: Record<string, unknown>;
  source: SessionSource;
  userEmail: string | null;
}

// ---------- helpers ----------

function levelDot(level: EventLevel): string {
  if (level === "warn") return "bg-amber-500";
  if (level === "error") return "bg-red-500";
  return "bg-muted-foreground/40";
}

function levelRowBg(level: EventLevel): string {
  if (level === "warn") return "border-amber-500/30 bg-amber-500/5";
  if (level === "error") return "border-red-500/30 bg-red-500/5";
  return "border-border bg-surface";
}

function sourceVariant(source: SessionSource): "default" | "secondary" | "outline" {
  if (source === "mcp") return "default";
  if (source === "web") return "secondary";
  return "outline";
}

// ---------- PayloadViewer ----------

const PayloadViewer = ({ payload }: { payload: Record<string, unknown> }) => {
  const [open, setOpen] = useState(false);
  if (Object.keys(payload).length === 0) return null;
  return (
    <div className="mt-1.5">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
      >
        {open ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
        payload
      </button>
      {open && (
        <pre className="mt-1 overflow-x-auto rounded-lg border border-border bg-muted/40 px-3 py-2 text-[11px] text-foreground/80 leading-relaxed">
          {JSON.stringify(payload, null, 2)}
        </pre>
      )}
    </div>
  );
};

// ---------- EventRow ----------

const EventRow = ({
  event,
  onShareClick,
}: {
  event: FlatEvent;
  onShareClick: (shareId: string) => void;
}) => (
  <div className={cn("rounded-xl border px-4 py-3", levelRowBg(event.level))}>
    <div className="flex items-start gap-2.5">
      <div className={cn("mt-[5px] size-2 shrink-0 rounded-full", levelDot(event.level))} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <Badge variant={sourceVariant(event.source)} className="text-[10px] uppercase tracking-wide">
            {event.source}
          </Badge>
          <span className="font-mono text-[11px] font-medium text-foreground/70">
            {event.event}
          </span>
          {event.shareId && (
            <button
              type="button"
              onClick={() => onShareClick(event.shareId!)}
              className="font-mono text-[11px] text-muted-foreground hover:text-foreground underline underline-offset-2 transition-colors"
              title="Filter by this share"
            >
              {event.shareId.slice(0, 8)}…
            </button>
          )}
          <span className="ml-auto shrink-0 tabular-nums text-[11px] text-muted-foreground">
            {new Date(event.ts).toLocaleTimeString()}
          </span>
        </div>
        <p className="mt-1 text-[13px] text-foreground/90 leading-snug">{event.message}</p>
        {event.userEmail && (
          <p className="mt-0.5 text-[11px] text-muted-foreground">{event.userEmail}</p>
        )}
        <PayloadViewer payload={event.payload} />
      </div>
    </div>
  </div>
);

// ---------- FilterButton ----------

const FilterButton = ({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) => (
  <button
    type="button"
    onClick={onClick}
    className={cn(
      "rounded-lg px-2.5 py-1 text-[11px] font-medium uppercase tracking-wide transition-colors",
      active
        ? "bg-foreground text-background"
        : "text-muted-foreground hover:text-foreground hover:bg-muted",
    )}
  >
    {children}
  </button>
);

// ---------- Debug page ----------

const Debug = () => {
  const [events, setEvents] = useState<FlatEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [level, setLevel] = useState<LevelFilter>("all");
  const [source, setSource] = useState<SourceFilter>("all");
  const [shareInput, setShareInput] = useState("");
  const [shareFilter, setShareFilter] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const onShareInputChange = (v: string) => {
    setShareInput(v);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setShareFilter(v.trim()), 300);
  };

  const clearShareFilter = () => {
    setShareInput("");
    setShareFilter("");
  };

  const onShareClick = (shareId: string) => {
    setShareInput(shareId);
    setShareFilter(shareId);
  };

  const fetchEvents = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ limit: "200" });
      if (level !== "all") params.set("level", level);
      if (source !== "all") params.set("source", source);
      if (shareFilter) params.set("share_id", shareFilter);

      const resp = await fetch(`${API_BASE}/debug/events?${params.toString()}`);
      if (resp.status === 403) {
        setError("Debug endpoints are disabled. Set RENDERSEND_DEBUG=true on the API server.");
        return;
      }
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      setEvents((await resp.json()) as FlatEvent[]);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [level, source, shareFilter]);

  useEffect(() => {
    void fetchEvents();
  }, [fetchEvents]);

  const downloadJsonl = () => {
    const params = new URLSearchParams({ limit: "500", format: "jsonl" });
    if (level !== "all") params.set("level", level);
    if (source !== "all") params.set("source", source);
    if (shareFilter) params.set("share_id", shareFilter);
    window.open(`${API_BASE}/debug/events?${params.toString()}`, "_blank");
  };

  return (
    <div className="flex h-screen flex-col bg-background">
      {/* Header */}
      <header className="flex h-14 shrink-0 items-center gap-4 border-b border-border bg-background px-4 sm:px-6">
        <a href="/" className="flex items-center gap-2">
          <BrandMark />
          <span className="text-[15px] font-semibold tracking-tight text-foreground">
            Rendersend
          </span>
        </a>
        <span className="text-muted-foreground/40">/</span>
        <span className="text-[14px] font-medium text-foreground">Debug</span>
      </header>

      {/* Filter bar */}
      <div className="flex shrink-0 flex-wrap items-center gap-3 border-b border-border bg-background px-4 py-2.5 sm:px-6">
        {/* Level */}
        <div className="flex items-center gap-1">
          {(["all", "info", "warn", "error"] as LevelFilter[]).map((l) => (
            <FilterButton key={l} active={level === l} onClick={() => setLevel(l)}>
              {l}
            </FilterButton>
          ))}
        </div>

        <div className="h-4 w-px bg-border" />

        {/* Source */}
        <div className="flex items-center gap-1">
          {(["all", "mcp", "web", "api"] as SourceFilter[]).map((s) => (
            <FilterButton key={s} active={source === s} onClick={() => setSource(s)}>
              {s}
            </FilterButton>
          ))}
        </div>

        <div className="h-4 w-px bg-border" />

        {/* Share ID */}
        <div className="relative flex items-center">
          <Input
            value={shareInput}
            onChange={(e) => onShareInputChange(e.target.value)}
            placeholder="Filter by share ID…"
            className="h-7 w-52 rounded-lg pr-7 font-mono text-[12px]"
          />
          {shareInput && (
            <button
              type="button"
              onClick={clearShareFilter}
              className="absolute right-2 text-muted-foreground hover:text-foreground"
            >
              <X className="size-3" />
            </button>
          )}
        </div>

        {/* Actions */}
        <div className="ml-auto flex items-center gap-2">
          <span className="tabular-nums text-[11px] text-muted-foreground">
            {events.length} events
          </span>
          <Button variant="outline" size="sm" onClick={() => void fetchEvents()} disabled={loading}>
            <RefreshCw className={cn("size-3.5", loading && "animate-spin")} />
            Refresh
          </Button>
          <Button variant="outline" size="sm" onClick={downloadJsonl}>
            <Download className="size-3.5" />
            JSONL
          </Button>
        </div>
      </div>

      {/* Content */}
      {error ? (
        <div className="flex flex-1 items-center justify-center p-6">
          <div className="max-w-md rounded-xl border border-destructive/30 bg-destructive/5 px-5 py-4 text-center">
            <p className="text-sm text-destructive">{error}</p>
          </div>
        </div>
      ) : (
        <ScrollArea className="flex-1">
          {events.length === 0 && !loading ? (
            <p className="py-16 text-center text-sm text-muted-foreground">
              No events match the current filters.
            </p>
          ) : (
            <div className="flex flex-col gap-2 p-4">
              {events.map((ev) => (
                <EventRow key={ev.id} event={ev} onShareClick={onShareClick} />
              ))}
            </div>
          )}
        </ScrollArea>
      )}
    </div>
  );
};

export default Debug;

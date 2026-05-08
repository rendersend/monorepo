import { Lock, Server, Key, ArrowRight } from "lucide-react";
import { useReveal } from "@/hooks/useReveal";

export const ZeroAccess = () => {
  const ref = useReveal<HTMLDivElement>();

  return (
    <section id="security" className="border-t border-border bg-background">
      <div className="container py-24 sm:py-28">
        <div
          ref={ref}
          className="reveal mx-auto grid max-w-6xl gap-14 lg:grid-cols-2 lg:items-center lg:gap-20"
        >
          <div>
            <p className="eyebrow mb-4">Zero-access architecture</p>
            <h2 className="text-balance text-3xl text-foreground sm:text-[40px] sm:leading-[1.1]">
              Most "secure" sharing is just transit-secure.
            </h2>
            <p className="mt-6 max-w-[480px] text-base leading-relaxed text-muted-foreground">
              Once the file lands at the vendor, they can read it. We can't.
              The decryption key is generated and held by your browser. It never
              reaches our servers — not in headers, not in logs, not under subpoena.
            </p>
          </div>

          <Diagram />
        </div>
      </div>
    </section>
  );
};

const Diagram = () => {
  return (
    <div
      className="relative bg-surface p-6 shadow-card sm:p-8"
      style={{ borderRadius: 16 }}
    >
      <div className="flex items-center justify-between gap-3 sm:gap-4">
        {/* Browser */}
        <DiagramBox
          icon={<Key className="h-5 w-5" strokeWidth={1.75} />}
          title="Browser"
          subtitle="Holds the key"
          highlight
        />

        <Connector label="encrypts" />

        {/* Server */}
        <DiagramBox
          icon={<Lock className="h-5 w-5" strokeWidth={1.75} />}
          title="Server"
          subtitle="Ciphertext only"
          locked
        />
      </div>

      <div className="mt-6 border-t border-border pt-5">
        <div className="flex items-start gap-3">
          <div
            className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center bg-accent-soft text-foreground"
            style={{ borderRadius: 8 }}
          >
            <Server className="h-3.5 w-3.5" strokeWidth={1.75} />
          </div>
          <div className="text-xs leading-relaxed text-muted-foreground">
            <span className="font-medium text-foreground">No key arrow points at the server.</span>{" "}
            The key never leaves the browser, even when the recipient opens the link.
          </div>
        </div>
      </div>
    </div>
  );
};

const DiagramBox = ({
  icon,
  title,
  subtitle,
  highlight,
  locked,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  highlight?: boolean;
  locked?: boolean;
}) => {
  return (
    <div
      className="relative flex flex-1 flex-col items-center gap-2 px-3 py-5 text-center"
      style={{
        borderRadius: 12,
        border: "1px solid hsl(var(--border))",
        background: highlight ? "hsl(var(--accent-soft))" : "hsl(var(--background))",
      }}
    >
      <div
        className="flex h-10 w-10 items-center justify-center bg-surface text-foreground"
        style={{
          borderRadius: 10,
          border: "1px solid hsl(var(--border))",
        }}
      >
        {icon}
      </div>
      <div className="text-sm font-semibold text-foreground">{title}</div>
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
        {subtitle}
      </div>
      {locked && (
        <div
          className="absolute right-2 top-2 flex h-5 w-5 items-center justify-center bg-accent text-accent-foreground"
          style={{ borderRadius: 5 }}
          aria-label="Opaque to server"
        >
          <Lock className="h-2.5 w-2.5" strokeWidth={2.5} />
        </div>
      )}
    </div>
  );
};

const Connector = ({ label }: { label: string }) => (
  <div className="flex shrink-0 flex-col items-center gap-1 px-1">
    <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
      {label}
    </span>
    <ArrowRight className="h-4 w-4 text-muted-foreground" strokeWidth={1.75} />
  </div>
);

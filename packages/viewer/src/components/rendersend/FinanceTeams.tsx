import { Mail, Eye, Clock } from "lucide-react";
import { useReveal } from "@/hooks/useReveal";

const features = [
  {
    icon: Mail,
    title: "Send Q3 reports to clients",
    body: "Email-pinned shares with cross-check. Only the intended recipient verifies and views.",
  },
  {
    icon: Eye,
    title: "Audit without surveillance",
    body: "Owner sees view count and last-viewed timestamp. We never see content — only metadata you opt into.",
  },
  {
    icon: Clock,
    title: "Expire automatically",
    body: "24 hours, 7 days, 30 days, or 1 year. Revoke anytime, instantly.",
  },
];

export const FinanceTeams = () => {
  const ref = useReveal<HTMLDivElement>();

  return (
    <section className="border-t border-border bg-background">
      <div className="container py-24 sm:py-28">
        <div ref={ref} className="reveal mx-auto max-w-[720px] text-center">
          <p className="eyebrow mb-4">For finance teams</p>
          <h2 className="text-3xl text-foreground sm:text-4xl">
            Built for the people sending the report.
          </h2>
        </div>

        <div className="mx-auto mt-14 grid max-w-6xl gap-5 md:grid-cols-3">
          {features.map((f, i) => (
            <FeatureCard key={f.title} {...f} index={i} />
          ))}
        </div>
      </div>
    </section>
  );
};

const FeatureCard = ({
  icon: Icon,
  title,
  body,
  index,
}: {
  icon: typeof Mail;
  title: string;
  body: string;
  index: number;
}) => {
  const ref = useReveal<HTMLDivElement>();
  return (
    <div
      ref={ref}
      className="reveal flex flex-col gap-5 bg-surface p-7 shadow-card transition-shadow duration-300 hover:shadow-card-hover"
      style={{ borderRadius: 16, transitionDelay: `${index * 60}ms` }}
    >
      <div
        className="flex h-10 w-10 items-center justify-center bg-accent-soft text-foreground"
        style={{ borderRadius: 10 }}
      >
        <Icon className="h-4.5 w-4.5" strokeWidth={1.75} />
      </div>
      <div>
        <h3 className="mb-2 text-base font-semibold text-foreground">{title}</h3>
        <p className="text-sm leading-relaxed text-muted-foreground">{body}</p>
      </div>
    </div>
  );
};

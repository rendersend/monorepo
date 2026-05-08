import { FileCode2, Lock, Send } from "lucide-react";
import { useReveal } from "@/hooks/useReveal";

const steps = [
  {
    icon: FileCode2,
    title: "Generate",
    body: "Claude or any LLM creates the HTML report.",
  },
  {
    icon: Lock,
    title: "Encrypt locally",
    body: "Your browser generates the key and encrypts before upload.",
  },
  {
    icon: Send,
    title: "Share with confidence",
    body: "Send the link via email; the recipient verifies with their email to view.",
  },
];

export const HowItWorks = () => {
  const ref = useReveal<HTMLDivElement>();

  return (
    <section id="how-it-works" className="border-t border-border bg-background">
      <div className="container py-24 sm:py-28">
        <div ref={ref} className="reveal mx-auto max-w-[720px] text-center">
          <p className="eyebrow mb-4">How it works</p>
          <h2 className="text-3xl text-foreground sm:text-4xl">
            Three steps. Zero exposure.
          </h2>
        </div>

        <div className="mx-auto mt-14 grid max-w-5xl gap-6 sm:gap-8 md:grid-cols-3">
          {steps.map((step, i) => (
            <Step key={step.title} {...step} index={i + 1} />
          ))}
        </div>
      </div>
    </section>
  );
};

const Step = ({
  icon: Icon,
  title,
  body,
  index,
}: {
  icon: typeof FileCode2;
  title: string;
  body: string;
  index: number;
}) => {
  const ref = useReveal<HTMLDivElement>();
  return (
    <div
      ref={ref}
      className="reveal flex flex-col items-start gap-5"
      style={{ transitionDelay: `${index * 60}ms` }}
    >
      <div
        className="flex h-12 w-12 items-center justify-center bg-accent-soft text-foreground"
        style={{ borderRadius: 12 }}
      >
        <Icon className="h-5 w-5" strokeWidth={1.75} />
      </div>
      <div>
        <div className="mb-1.5 flex items-center gap-2">
          <span className="text-xs font-medium tabular-nums text-muted-foreground">
            {String(index).padStart(2, "0")}
          </span>
          <h3 className="text-base font-semibold text-foreground">{title}</h3>
        </div>
        <p className="text-sm leading-relaxed text-muted-foreground">{body}</p>
      </div>
    </div>
  );
};

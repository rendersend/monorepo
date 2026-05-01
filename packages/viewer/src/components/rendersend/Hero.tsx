import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useReveal } from "@/hooks/useReveal";

const trustItems = ["AES-256-GCM", "WebCrypto", "Open source", "Sandboxed iframe"];

export const Hero = () => {
  const ref = useReveal<HTMLDivElement>();

  return (
    <section className="relative overflow-hidden">
      <div className="hero-backdrop pointer-events-none absolute inset-0" aria-hidden="true" />

      <div className="container relative">
        <div
          ref={ref}
          className="reveal mx-auto flex min-h-[70vh] max-w-[720px] flex-col items-center justify-center py-24 text-center sm:py-32"
        >
          <p className="eyebrow mb-6">Zero-access encrypted hosting</p>

          <h1 className="text-balance text-4xl text-foreground sm:text-5xl md:text-[56px] md:leading-[1.05]">
            Share encrypted reports.
            <br className="hidden sm:block" />{" "}
            <span className="text-muted-foreground">Without giving up the keys.</span>
          </h1>

          <p className="mt-6 max-w-[560px] text-balance text-base text-muted-foreground sm:text-[17px]">
            Built for analysts, accountants, and finance teams who share sensitive
            Claude-generated reports. Encryption happens in your browser. We never see
            the content.
          </p>

          <div className="mt-9 flex flex-col items-center gap-4 sm:flex-row sm:gap-3">
            <Button asChild size="lg">
              <a href="/upload">Share your first document</a>
            </Button>
            <Button asChild variant="ghost" size="lg" className="group">
              <a href="#how-it-works">
                How it works
                <ArrowRight className="transition-transform duration-150 group-hover:translate-x-0.5" />
              </a>
            </Button>
          </div>

          <ul className="mt-12 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs text-muted-foreground">
            {trustItems.map((item, i) => (
              <li key={item} className="flex items-center gap-5">
                <span>{item}</span>
                {i < trustItems.length - 1 && (
                  <span aria-hidden="true" className="hidden h-1 w-1 rounded-full bg-border sm:inline-block" />
                )}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
};

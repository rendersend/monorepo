import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useReveal } from "@/hooks/useReveal";
import { cn } from "@/lib/utils";

const tiers = [
  {
    name: "Free",
    price: "$0",
    cadence: "forever",
    tagline: "3 shares, no signup. Unlimited views.",
    features: [
      "3 active shares",
      "Unlimited recipient views",
      "AES-256-GCM encryption",
      "24h or 7d expiration",
    ],
    cta: "Start free",
    href: "/upload",
    featured: false,
  },
  {
    name: "Pro",
    price: "$9",
    cadence: "/ month",
    tagline: "Unlimited shares, owner dashboard, passkey sign-in.",
    features: [
      "Unlimited shares",
      "Owner dashboard with view metadata",
      "Passkey sign-in",
      "All expirations up to 1 year",
    ],
    cta: "Get started",
    href: "/signup",
    featured: true,
  },
];

export const Pricing = () => {
  const ref = useReveal<HTMLDivElement>();
  return (
    <section id="pricing" className="border-t border-border bg-background">
      <div className="container py-24 sm:py-28">
        <div ref={ref} className="reveal mx-auto max-w-[720px] text-center">
          <p className="eyebrow mb-4">Pricing</p>
          <h2 className="text-3xl text-foreground sm:text-4xl">
            Simple, predictable, no hard sell.
          </h2>
        </div>

        <div className="mx-auto mt-14 grid max-w-4xl gap-5 md:grid-cols-2">
          {tiers.map((tier, i) => (
            <TierCard key={tier.name} {...tier} index={i} />
          ))}
        </div>
      </div>
    </section>
  );
};

const TierCard = ({
  name,
  price,
  cadence,
  tagline,
  features,
  cta,
  href,
  featured,
  index,
}: (typeof tiers)[number] & { index: number }) => {
  const ref = useReveal<HTMLDivElement>();
  return (
    <div
      ref={ref}
      className={cn(
        "reveal flex flex-col gap-6 p-8 shadow-card",
        featured
          ? "bg-foreground text-background"
          : "bg-surface text-foreground",
      )}
      style={{
        borderRadius: 16,
        transitionDelay: `${index * 60}ms`,
        border: featured ? "1px solid hsl(var(--foreground))" : "1px solid hsl(var(--border))",
      }}
    >
      <div>
        <div className="mb-2 flex items-baseline justify-between">
          <h3 className="text-base font-semibold">{name}</h3>
          {featured && (
            <span
              className={cn(
                "px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider",
                "bg-background/10 text-background",
              )}
              style={{ borderRadius: 5 }}
            >
              Recommended
            </span>
          )}
        </div>
        <div className="flex items-baseline gap-1.5">
          <span className="text-4xl font-semibold tracking-tight">{price}</span>
          <span className={cn("text-sm", featured ? "text-background/60" : "text-muted-foreground")}>
            {cadence}
          </span>
        </div>
        <p className={cn("mt-3 text-sm", featured ? "text-background/70" : "text-muted-foreground")}>
          {tagline}
        </p>
      </div>

      <ul className="flex flex-col gap-2.5 text-sm">
        {features.map((f) => (
          <li key={f} className="flex items-start gap-2.5">
            <Check
              className={cn(
                "mt-0.5 h-4 w-4 shrink-0",
                featured ? "text-background" : "text-foreground",
              )}
              strokeWidth={2}
            />
            <span className={featured ? "text-background/90" : "text-foreground"}>{f}</span>
          </li>
        ))}
      </ul>

      <div className="mt-auto pt-2">
        {featured ? (
          <Button
            asChild
            size="lg"
            className="w-full bg-background text-foreground hover:bg-background/90"
          >
            <a href={href}>{cta}</a>
          </Button>
        ) : (
          <Button asChild size="lg" variant="outline" className="w-full">
            <a href={href}>{cta}</a>
          </Button>
        )}
      </div>
    </div>
  );
};

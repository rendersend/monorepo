import { Nav } from "./Nav";
import { Footer } from "./Footer";

interface DocLayoutProps {
  eyebrow: string;
  title: string;
  subtitle?: string;
  lastUpdated: string;
  children: React.ReactNode;
}

/**
 * Shared layout for prose pages (Privacy, Terms, Security).
 * Keeps the main Nav and Footer; centers content in a readable column.
 */
export const DocLayout = ({
  eyebrow,
  title,
  subtitle,
  lastUpdated,
  children,
}: DocLayoutProps) => {
  return (
    <div className="min-h-screen bg-background">
      <Nav />
      <main>
        <div className="container py-16 sm:py-24">
          <div className="mx-auto max-w-[720px]">
            <header className="mb-12">
              <p className="eyebrow mb-4">{eyebrow}</p>
              <h1 className="text-3xl text-foreground sm:text-[40px] sm:leading-[1.1]">
                {title}
              </h1>
              {subtitle && (
                <p className="mt-4 text-base leading-relaxed text-muted-foreground">
                  {subtitle}
                </p>
              )}
              <p className="mt-4 text-xs text-muted-foreground">
                Last updated: {lastUpdated}
              </p>
            </header>

            <div className="doc-prose">{children}</div>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
};

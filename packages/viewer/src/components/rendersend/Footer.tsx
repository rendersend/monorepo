import { BrandMark } from "./BrandMark";

const Twitter = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231L18.244 2.25Zm-1.161 17.52h1.833L7.084 4.126H5.117L17.083 19.77Z" />
  </svg>
);

const GitHub = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M12 .5C5.73.5.67 5.56.67 11.83c0 5.02 3.24 9.27 7.74 10.78.57.1.78-.25.78-.55v-2.13c-3.15.69-3.81-1.34-3.81-1.34-.51-1.31-1.26-1.66-1.26-1.66-1.03-.7.08-.69.08-.69 1.13.08 1.73 1.16 1.73 1.16 1.01 1.74 2.66 1.24 3.31.95.1-.74.4-1.24.72-1.53-2.51-.29-5.16-1.26-5.16-5.6 0-1.24.44-2.25 1.16-3.05-.12-.29-.5-1.43.11-2.97 0 0 .94-.3 3.09 1.16.9-.25 1.86-.37 2.81-.38.95.01 1.92.13 2.81.38 2.15-1.46 3.09-1.16 3.09-1.16.61 1.54.23 2.68.11 2.97.72.8 1.16 1.81 1.16 3.05 0 4.35-2.65 5.31-5.18 5.59.41.36.77 1.06.77 2.13v3.16c0 .31.21.66.79.55 4.49-1.51 7.73-5.76 7.73-10.78C23.33 5.56 18.27.5 12 .5Z" />
  </svg>
);

export const Footer = () => {
  const year = new Date().getFullYear();
  return (
    <footer className="border-t border-border bg-background">
      <div className="container py-10">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <BrandMark />
            <span className="text-sm text-muted-foreground">
              © {year} Rendersend
            </span>
          </div>
          <div className="flex items-center gap-2">
            <a
              href="https://twitter.com"
              aria-label="Twitter"
              className="flex h-8 w-8 items-center justify-center text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              style={{ borderRadius: 8 }}
            >
              <Twitter />
            </a>
            <a
              href="https://github.com"
              aria-label="GitHub"
              className="flex h-8 w-8 items-center justify-center text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              style={{ borderRadius: 8 }}
            >
              <GitHub />
            </a>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-border pt-6 text-xs text-muted-foreground">
          <a href="/privacy" className="transition-colors hover:text-foreground">Privacy</a>
          <a href="/terms" className="transition-colors hover:text-foreground">Terms</a>
          <a href="/#security" className="transition-colors hover:text-foreground">Security</a>
          <a href="/status" className="transition-colors hover:text-foreground">Status</a>
        </div>
      </div>
    </footer>
  );
};

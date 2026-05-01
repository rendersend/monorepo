import { cn } from "@/lib/utils";

interface BrandMarkProps {
  className?: string;
  size?: number;
}

/**
 * Rendersend brand mark — an 18×18 rounded square in the accent color
 * containing a white padlock SVG. Used in nav, footer, and viewer page.
 */
export const BrandMark = ({ className, size = 18 }: BrandMarkProps) => {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center bg-accent text-accent-foreground",
        className,
      )}
      style={{
        width: size,
        height: size,
        borderRadius: 5,
      }}
      aria-hidden="true"
    >
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <rect x="4" y="11" width="16" height="10" rx="2" />
        <path d="M8 11V8a4 4 0 0 1 8 0v3" />
      </svg>
    </span>
  );
};

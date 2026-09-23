type SkeletonProps = {
  variant?: "line" | "circle" | "rect";
  className?: string;
  style?: React.CSSProperties;
};

const VARIANT_SHAPE: Record<NonNullable<SkeletonProps["variant"]>, string> = {
  line: "rounded-sm h-4 w-full",
  circle: "rounded-full h-10 w-10",
  rect: "rounded-lg h-24 w-full",
};

/**
 * Shared loading placeholder. Composite skeletons (a table-tile ghost, a
 * stat-card ghost, an order-row ghost) are built by combining a few of
 * these rather than each page hand-rolling its own `animate-pulse` div,
 * so a loading state always reads as "the same shimmer" across the app.
 */
export function Skeleton({ variant = "line", className = "", style }: SkeletonProps) {
  return (
    <div
      aria-hidden="true"
      style={{ backgroundSize: "200% 100%", ...style }}
      className={`animate-shimmer bg-gradient-to-r from-skeleton-base via-skeleton-shine to-skeleton-base ${VARIANT_SHAPE[variant]} ${className}`}
    />
  );
}

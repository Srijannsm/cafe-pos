import { Card } from "./Card";
import { Skeleton } from "./Skeleton";

type StatCardProps = {
  label: string;
  value: string | number;
  caption?: string;
  captionTone?: "success" | "warning";
};

const CAPTION_COLOR: Record<NonNullable<StatCardProps["captionTone"]>, string> = {
  success: "text-status-success-ink",
  warning: "text-status-warning-ink",
};

export function StatCard({ label, value, caption, captionTone }: StatCardProps) {
  return (
    <Card>
      <p className="label-md text-ink-secondary">{label}</p>
      <p className="display-md mt-2 text-ink-primary">{value}</p>
      {caption && (
        <p className={`body-sm mt-1 ${captionTone ? CAPTION_COLOR[captionTone] : "text-ink-secondary"}`}>
          {caption}
        </p>
      )}
    </Card>
  );
}

export function StatSkeleton() {
  return (
    <Card>
      <Skeleton className="h-4 w-28" />
      <Skeleton className="mt-3 h-8 w-16" />
      <Skeleton className="mt-2 h-3 w-32" />
    </Card>
  );
}

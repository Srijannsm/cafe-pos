import type { ReactNode } from "react";
import { Skeleton } from "./Skeleton";

type StatCardProps = {
  label: string;
  value: string | number;
  caption?: string;
  captionTone?: "success" | "warning" | "danger";
  icon?: ReactNode;
};

const CAPTION_COLOR: Record<NonNullable<StatCardProps["captionTone"]>, string> = {
  success: "text-status-success-ink",
  warning: "text-status-warning-ink",
  danger: "text-status-danger-ink",
};

// TailAdmin-style metric card: icon tile, small label, big number.
export function StatCard({ label, value, caption, captionTone, icon }: StatCardProps) {
  return (
    <div className="rounded-2xl border border-border-subtle bg-surface-raised p-5">
      {icon && (
        <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-surface-sunken text-ink-primary [&>svg]:h-5 [&>svg]:w-5">
          {icon}
        </div>
      )}
      <p className="text-sm text-ink-secondary">{label}</p>
      <p className="tabular mt-1 text-2xl font-semibold text-ink-primary">{value}</p>
      {caption && (
        <p className={`mt-1 text-xs ${captionTone ? CAPTION_COLOR[captionTone] : "text-ink-faint"}`}>{caption}</p>
      )}
    </div>
  );
}

export function StatSkeleton() {
  return (
    <div className="rounded-2xl border border-border-subtle bg-surface-raised p-5">
      <Skeleton className="h-11 w-11 rounded-xl" />
      <Skeleton className="mt-4 h-4 w-24" />
      <Skeleton className="mt-2 h-7 w-28" />
    </div>
  );
}

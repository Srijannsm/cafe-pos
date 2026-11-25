import type { ReactNode } from "react";

// No width here on purpose: add w-full / w-28 / w-auto where it is used, so
// width classes never fight each other.
export const inputClass =
  "min-h-11 rounded-lg border border-border-strong bg-surface-raised px-3.5 text-sm text-ink-primary shadow-sm outline-none transition placeholder:text-ink-faint focus:border-brand focus:ring-3 focus:ring-brand/15 disabled:bg-surface-sunken";

export function Field({ label, hint, error, children, className = "" }: { label: string; hint?: string; error?: string; children: ReactNode; className?: string }) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1.5 block text-sm font-medium text-ink-primary">{label}</span>
      {children}
      {error ? (
        <span className="mt-1 block text-xs text-status-danger-ink">{error}</span>
      ) : hint ? (
        <span className="mt-1 block text-xs text-ink-faint">{hint}</span>
      ) : null}
    </label>
  );
}

export function SectionTitle({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="mb-4 flex items-end justify-between gap-3">
      <div>
        <h3 className="text-base font-semibold text-ink-primary">{title}</h3>
        {description && <p className="mt-0.5 text-sm text-ink-secondary">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function Panel({ children, className = "", padded = true }: { children: ReactNode; className?: string; padded?: boolean }) {
  return <div className={`rounded-2xl border border-border-subtle bg-surface-raised ${padded ? "p-5 sm:p-6" : ""} ${className}`}>{children}</div>;
}

export function Pill({ tone = "neutral", children }: { tone?: "neutral" | "success" | "warning" | "danger" | "info" | "brand"; children: ReactNode }) {
  const tones = {
    neutral: "bg-surface-sunken text-ink-secondary",
    success: "bg-status-success-tint text-status-success-ink",
    warning: "bg-status-warning-tint text-status-warning-ink",
    danger: "bg-status-danger-tint text-status-danger-ink",
    info: "bg-status-info-tint text-status-info-ink",
    brand: "bg-brand-tint text-brand-strong",
  };
  return <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${tones[tone]}`}>{children}</span>;
}

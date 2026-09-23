import type { ReactNode } from "react";

type EmptyStateProps = {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
};

/**
 * Zero-content placeholder for any list/grid page (no tables, no orders,
 * no menu items, a filter with no matches, ...). Centralizing this means
 * every empty screen gets the same icon size, spacing, and optional CTA
 * slot instead of each page inventing its own "nothing here" text.
 */
export function EmptyState({ icon, title, description, action, className = "" }: EmptyStateProps) {
  return (
    <div className={`flex flex-col items-center justify-center gap-3 py-16 text-center ${className}`}>
      {icon && (
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-surface-sunken text-ink-faint">
          {icon}
        </span>
      )}
      <div>
        <p className="body-md font-semibold text-ink-primary">{title}</p>
        {description && <p className="body-sm mt-1 max-w-sm text-ink-secondary">{description}</p>}
      </div>
      {action}
    </div>
  );
}

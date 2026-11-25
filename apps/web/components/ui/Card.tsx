type CardProps = {
  title?: React.ReactNode;
  action?: React.ReactNode;
  tone?: "warning" | "danger";
  children: React.ReactNode;
  className?: string;
};

const TONE_HEADER: Record<NonNullable<CardProps["tone"]>, string> = {
  warning: "bg-status-warning-tint",
  danger: "bg-status-danger-tint",
};

export function Card({ title, action, tone, children, className = "" }: CardProps) {
  return (
    <div className={`overflow-hidden rounded-2xl border border-border-subtle bg-surface-raised ${className}`}>
      {(title || action) && (
        <div
          className={`flex items-center justify-between gap-3 border-b border-border-subtle px-5 py-4 ${tone ? TONE_HEADER[tone] : ""}`}
        >
          {title && <h3 className="heading-sm text-ink-primary">{title}</h3>}
          {action}
        </div>
      )}
      <div className="p-5">{children}</div>
    </div>
  );
}

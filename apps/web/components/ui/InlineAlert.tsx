import { IconAlert } from "../icons";

type InlineAlertProps = {
  children: React.ReactNode;
  tone?: "danger" | "success" | "warning" | "info";
  icon?: React.ReactNode;
  className?: string;
  /** Called when the dismiss button is clicked. If omitted, no dismiss button is rendered. */
  onDismiss?: () => void;
};

const TONE_CLASSES: Record<NonNullable<InlineAlertProps["tone"]>, string> = {
  danger: "bg-status-danger-tint text-status-danger-ink",
  success: "bg-status-success-tint text-status-success-ink",
  warning: "bg-status-warning-tint text-status-warning-ink",
  info: "bg-status-info-tint text-status-info-ink",
};

export function InlineAlert({ children, tone = "danger", icon, className = "", onDismiss }: InlineAlertProps) {
  return (
    <div
      className={`animate-card-in flex items-center gap-2 rounded-md px-4 py-3 body-md ${TONE_CLASSES[tone]} ${className}`}
      role="alert"
    >
      {icon ?? <IconAlert className="h-5 w-5 shrink-0" />}
      <span className="flex-1">{children}</span>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          className="ml-auto shrink-0 opacity-60 transition hover:opacity-100"
          aria-label="Dismiss"
        >
          &times;
        </button>
      )}
    </div>
  );
}

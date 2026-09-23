import { IconAlert } from "../icons";
import { Button } from "./Button";

type ErrorStateProps = {
  title?: string;
  description?: string;
  onRetry?: () => void;
  className?: string;
};

/**
 * Graceful failure UI for a data-fetching page. Distinct from EmptyState
 * (which means "the request worked, there's just nothing there") — this
 * one means the request itself failed, so it always leads with a retry
 * rather than a description of empty content.
 */
export function ErrorState({
  title = "Something went wrong",
  description = "Check your connection and try again.",
  onRetry,
  className = "",
}: ErrorStateProps) {
  return (
    <div className={`flex flex-col items-center justify-center gap-3 py-16 text-center ${className}`}>
      <span className="flex h-14 w-14 items-center justify-center rounded-full bg-status-danger-tint text-status-danger-ink">
        <IconAlert className="h-6 w-6" />
      </span>
      <div>
        <p className="body-md font-semibold text-ink-primary">{title}</p>
        <p className="body-sm mt-1 max-w-sm text-ink-secondary">{description}</p>
      </div>
      {onRetry && (
        <Button variant="secondary" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}

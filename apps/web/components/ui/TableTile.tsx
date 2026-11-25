import { IconUsers, IconHand, IconReceipt, IconQrCode } from "../icons";

type TableTileProps = {
  tableNumber: string;
  seats: number;
  status: "free" | "occupied" | "reserved";
  activeOrderStatus?: string | null;
  onClick?: () => void;
  /** Running total of the open order. */
  total?: number;
  /** When the order was opened -- shows "25m". */
  startedAt?: string | null;
  /** Items added (by a customer via QR or a waiter) but not sent to the kitchen yet. */
  unsentCount?: number;
  readyCount?: number;
  isQrOrder?: boolean;
  requests?: { type: "call_waiter" | "request_bill" }[];
  isPhysicalPrimary?: boolean;
  isPhysicalSelected?: boolean;
  isPhysicalDimmed?: boolean;
  isTransferSource?: boolean;
  isTransferTarget?: boolean;
  isTransferDimmed?: boolean;
  mergedLabel?: string;
  onUnmerge?: () => void;
  unmergeLoading?: boolean;
};

const STATUS: Record<string, { label: string; dot: string }> = {
  pending: { label: "Ordering", dot: "bg-status-warning" },
  preparing: { label: "In kitchen", dot: "bg-status-info" },
  served: { label: "Served", dot: "bg-status-success" },
  billed: { label: "Bill printed", dot: "bg-brand" },
};

function minutes(since?: string | null) {
  if (!since) return null;
  const m = Math.floor((Date.now() - new Date(since).getTime()) / 60000);
  return m < 60 ? `${m}m` : `${Math.floor(m / 60)}h ${m % 60}m`;
}

// A table card is read at a glance from across the room, so it carries
// only what changes what the waiter does next: is it free, what's
// happening, how long have they been here, and does anyone need me.
export function TableTile({
  tableNumber, seats, status, activeOrderStatus, onClick, total = 0, startedAt, unsentCount = 0, readyCount = 0,
  isQrOrder, requests = [], isPhysicalPrimary, isPhysicalSelected, isPhysicalDimmed, isTransferSource,
  isTransferTarget, isTransferDimmed, mergedLabel, onUnmerge, unmergeLoading,
}: TableTileProps) {
  const occupied = status === "occupied";
  const reserved = status === "reserved";
  const dimmed = isPhysicalDimmed || isTransferDimmed;
  const selected = isPhysicalPrimary || isTransferSource;
  const target = isPhysicalSelected || isTransferTarget;
  const calling = requests.some((r) => r.type === "call_waiter");
  const wantsBill = requests.some((r) => r.type === "request_bill");
  const cfg = occupied && activeOrderStatus ? STATUS[activeOrderStatus] : null;
  const display = mergedLabel ? `${tableNumber}+${mergedLabel}` : tableNumber;

  const ring = selected
    ? "border-brand ring-4 ring-brand/15"
    : target
      ? "border-status-success border-dashed ring-4 ring-status-success/15"
      : calling || wantsBill
        ? "border-status-danger ring-4 ring-status-danger/15"
        : occupied
          ? "border-border-strong"
          : "border-border-subtle";

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick?.();
        }
      }}
      aria-label={`Table ${display} — ${status}`}
      className={`group relative flex min-h-[132px] w-full cursor-pointer flex-col rounded-2xl border-2 p-4 text-left transition active:scale-[0.98] ${ring} ${
        occupied ? "bg-surface-raised shadow-sm" : reserved ? "bg-surface-sunken" : "bg-surface-raised"
      } ${dimmed ? "pointer-events-none opacity-35" : "hover:shadow-md"}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className={`text-2xl font-semibold leading-none ${occupied ? "text-ink-primary" : "text-ink-secondary"}`}>{display}</p>
          <p className="mt-1.5 flex items-center gap-1 text-xs text-ink-faint"><IconUsers className="h-3.5 w-3.5" />{seats}</p>
        </div>
        <div className="flex flex-col items-end gap-1">
          {isPhysicalPrimary && <span className="rounded-full bg-brand px-2 py-0.5 text-[11px] font-semibold text-on-brand">Main</span>}
          {isPhysicalSelected && <span className="rounded-full bg-status-success px-2 py-0.5 text-[11px] font-semibold text-white">+ Join</span>}
          {isTransferSource && <span className="rounded-full bg-brand px-2 py-0.5 text-[11px] font-semibold text-on-brand">From</span>}
          {isTransferTarget && <span className="rounded-full bg-status-success px-2 py-0.5 text-[11px] font-semibold text-white">To</span>}
          {calling && <span className="flex animate-pulse items-center gap-1 rounded-full bg-status-danger px-2 py-0.5 text-[11px] font-semibold text-white"><IconHand className="h-3 w-3" />Calling</span>}
          {wantsBill && <span className="flex items-center gap-1 rounded-full bg-status-danger px-2 py-0.5 text-[11px] font-semibold text-white"><IconReceipt className="h-3 w-3" />Bill</span>}
          {occupied && minutes(startedAt) && <span className="tabular text-xs text-ink-faint">{minutes(startedAt)}</span>}
        </div>
      </div>

      <div className="mt-auto pt-3">
        {occupied ? (
          <>
            <p className="tabular text-base font-semibold text-ink-primary">Rs {total.toLocaleString("en-IN")}</p>
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              {cfg && (
                <span className="flex items-center gap-1.5 text-xs font-medium text-ink-secondary">
                  <span className={`h-2 w-2 rounded-full ${cfg.dot}`} />{cfg.label}
                </span>
              )}
              {unsentCount > 0 && (
                <span className="flex items-center gap-1 rounded-full bg-status-warning-tint px-2 py-0.5 text-[11px] font-semibold text-status-warning-ink">
                  {isQrOrder && <IconQrCode className="h-3 w-3" />}{unsentCount} to confirm
                </span>
              )}
              {readyCount > 0 && <span className="rounded-full bg-status-success-tint px-2 py-0.5 text-[11px] font-semibold text-status-success-ink">{readyCount} ready</span>}
            </div>
          </>
        ) : reserved ? (
          <p className="text-xs font-medium text-ink-faint">Reserved</p>
        ) : (
          <p className="text-xs font-medium text-status-success-ink">Free · tap to start</p>
        )}
      </div>

      {onUnmerge && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onUnmerge();
          }}
          disabled={unmergeLoading}
          className="absolute bottom-3 right-3 rounded-full border border-border-strong bg-surface-raised px-2.5 py-0.5 text-xs text-ink-secondary transition hover:bg-surface-sunken disabled:opacity-50"
        >
          Split
        </button>
      )}
    </div>
  );
}

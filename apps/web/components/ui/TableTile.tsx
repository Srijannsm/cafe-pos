import { IconUsers } from "../icons";

type TableTileProps = {
  tableNumber: string;
  seats: number;
  status: "free" | "occupied" | "reserved";
  activeOrderStatus?: string | null;
  onClick?: () => void;
  /** Physical merge mode: this tile is the primary table */
  isPhysicalPrimary?: boolean;
  /** Physical merge mode: this tile is a selected secondary */
  isPhysicalSelected?: boolean;
  /** Physical merge mode: this tile can't participate (occupied/reserved) */
  isPhysicalDimmed?: boolean;
  /** Transfer mode: this tile is the source */
  isTransferSource?: boolean;
  /** Transfer mode: this tile is the destination */
  isTransferTarget?: boolean;
  /** Transfer mode: this tile can't participate */
  isTransferDimmed?: boolean;
  /**
   * When set, this is a merged primary table. The value is the joined
   * secondary table numbers, e.g. "2+3" — shown as "Table 1+2+3" in the label.
   */
  mergedLabel?: string;
  /** Called when the staff taps the Split chip (normal mode only). */
  onUnmerge?: () => void;
  unmergeLoading?: boolean;
};

const ORDER_STATUS_CONFIG: Record<string, {
  borderColor: string;
  bgColor: string;
  chairColor: string;
  badgeBg: string;
  badgeText: string;
  label: string;
  icon: string;
}> = {
  pending: {
    borderColor: "border-status-info",
    bgColor: "bg-status-info-tint",
    chairColor: "bg-status-info/30",
    badgeBg: "bg-status-info",
    badgeText: "text-white",
    label: "Opened",
    icon: "📋",
  },
  preparing: {
    borderColor: "border-status-warning",
    bgColor: "bg-status-warning-tint",
    chairColor: "bg-status-warning/30",
    badgeBg: "bg-status-warning",
    badgeText: "text-on-brand",
    label: "Kitchen",
    icon: "🔥",
  },
  served: {
    borderColor: "border-status-success",
    bgColor: "bg-status-success-tint",
    chairColor: "bg-status-success/30",
    badgeBg: "bg-status-success",
    badgeText: "text-white",
    label: "Served",
    icon: "✓",
  },
  billed: {
    borderColor: "border-brand",
    bgColor: "bg-brand-tint",
    chairColor: "bg-brand/20",
    badgeBg: "bg-brand",
    badgeText: "text-white",
    label: "Pay now",
    icon: "💳",
  },
};

function Chair({ className }: { className: string }) {
  return <div className={`rounded-sm ${className}`} />;
}

export function TableTile({
  tableNumber,
  seats,
  status,
  activeOrderStatus,
  onClick,
  isPhysicalPrimary,
  isPhysicalSelected,
  isPhysicalDimmed,
  isTransferSource,
  isTransferTarget,
  isTransferDimmed,
  mergedLabel,
  onUnmerge,
  unmergeLoading,
}: TableTileProps) {
  const isOccupied = status === "occupied";
  const isReserved = status === "reserved";
  const orderCfg = isOccupied && activeOrderStatus ? ORDER_STATUS_CONFIG[activeOrderStatus] : null;

  const isDimmed = isPhysicalDimmed || isTransferDimmed;

  let borderClass: string;
  let bgClass: string;
  let chairColor: string;

  if (isPhysicalPrimary) {
    borderClass = "border-brand border-[3px]";
    bgClass = "bg-brand-tint";
    chairColor = "bg-brand/30";
  } else if (isPhysicalSelected) {
    borderClass = "border-status-success border-dashed border-[3px]";
    bgClass = "bg-status-success-tint";
    chairColor = "bg-status-success/25";
  } else if (isTransferSource) {
    borderClass = "border-brand border-[3px]";
    bgClass = "bg-brand-tint";
    chairColor = "bg-brand/30";
  } else if (isTransferTarget) {
    borderClass = "border-status-success border-dashed border-[3px]";
    bgClass = "bg-status-success-tint";
    chairColor = "bg-status-success/25";
  } else if (isDimmed) {
    borderClass = "border-border-subtle border-2";
    bgClass = "bg-surface-sunken";
    chairColor = "bg-border-subtle";
  } else {
    borderClass = isOccupied
      ? (orderCfg?.borderColor ?? "border-status-warning")
      : isReserved
        ? "border-dashed border-status-info"
        : "border-status-success/40";
    bgClass = isOccupied
      ? (orderCfg?.bgColor ?? "bg-status-warning-tint")
      : isReserved
        ? "bg-surface-raised"
        : "bg-status-success-tint";
    chairColor = isOccupied
      ? (orderCfg?.chairColor ?? "bg-status-warning/30")
      : isReserved
        ? "bg-status-info/20"
        : "bg-status-success/25";
  }

  const topSeats = Math.max(1, Math.floor(seats / 2));
  const bottomSeats = Math.max(1, seats - topSeats);

  const displayNumber = mergedLabel ? `${tableNumber}+${mergedLabel}` : tableNumber;

  return (
    // Using div+role instead of button to avoid nested <button> (the Split chip is a real button)
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick?.(); } }}
      className={`group relative flex flex-col items-center gap-1.5 focus:outline-none w-full cursor-pointer ${isDimmed ? "opacity-40 pointer-events-none" : ""}`}
      aria-label={`Table ${displayNumber} — ${status}`}
    >
      {/* Top chairs */}
      <div className="flex gap-1.5">
        {Array.from({ length: Math.min(topSeats, 4) }).map((_, i) => (
          <Chair key={i} className={`h-2 w-7 ${chairColor} rounded-t-md transition-colors`} />
        ))}
      </div>

      {/* Table surface */}
      <div
        className={`relative flex flex-col justify-between w-full rounded-xl border-2 ${borderClass} ${bgClass} px-3 pt-3 pb-3 transition-all duration-150 group-active:scale-[0.97] group-hover:brightness-95`}
        style={{ minHeight: "90px" }}
      >
        {/* Top row: table name + mode badge */}
        <div className="flex items-start justify-between gap-2">
          <p className={`heading-md font-bold leading-tight ${isPhysicalPrimary || isTransferSource ? "text-brand-strong" : "text-ink-primary"}`}>
            Table {displayNumber}
          </p>

          {/* Mode badges (top-right) */}
          {isPhysicalPrimary && (
            <span className="shrink-0 rounded-pill bg-brand px-2 py-0.5 label-sm font-semibold text-white">Primary ✓</span>
          )}
          {isPhysicalSelected && (
            <span className="shrink-0 rounded-pill bg-status-success px-2 py-0.5 label-sm font-semibold text-white">+ Adding</span>
          )}
          {isTransferSource && (
            <span className="shrink-0 rounded-pill bg-brand px-2 py-0.5 label-sm font-semibold text-white">Move from</span>
          )}
          {isTransferTarget && (
            <span className="shrink-0 rounded-pill bg-status-success px-2 py-0.5 label-sm font-semibold text-white">Move to →</span>
          )}
        </div>

        {/* Bottom row: seats + status badge or FREE or Split */}
        <div className="flex items-center justify-between mt-2">
          <div className="flex items-center gap-1 text-ink-faint">
            <IconUsers className="h-3.5 w-3.5" />
            <span className="label-sm">{seats} seats</span>
          </div>

          {/* Status badge */}
          {!isPhysicalPrimary && !isPhysicalSelected && !isTransferSource && !isTransferTarget && isOccupied && orderCfg && (
            <span className={`flex items-center gap-1 rounded-pill px-2 py-0.5 label-sm font-semibold ${orderCfg.badgeBg} ${orderCfg.badgeText}`}>
              <span>{orderCfg.icon}</span>{orderCfg.label}
            </span>
          )}
          {!isPhysicalPrimary && !isPhysicalSelected && !isTransferSource && !isTransferTarget && isReserved && (
            <span className="rounded-pill bg-status-info px-2 py-0.5 label-sm font-semibold text-white">Reserved</span>
          )}
          {!isOccupied && !isReserved && !isPhysicalPrimary && !isPhysicalSelected && !isTransferSource && !isTransferTarget && (
            <p className="label-sm text-status-success-ink font-semibold">FREE</p>
          )}

          {/* Split chip */}
          {onUnmerge && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onUnmerge(); }}
              disabled={unmergeLoading}
              className="rounded-pill border border-border-strong bg-surface-base px-2 py-0.5 label-sm text-ink-secondary hover:bg-surface-raised transition disabled:opacity-50"
            >
              Split
            </button>
          )}
        </div>
      </div>

      {/* Bottom chairs */}
      <div className="flex gap-1.5">
        {Array.from({ length: Math.min(bottomSeats, 4) }).map((_, i) => (
          <Chair key={i} className={`h-2 w-7 ${chairColor} rounded-b-md transition-colors`} />
        ))}
      </div>
    </div>
  );
}

import { IconUsers } from "../icons";

type TableTileProps = {
  tableNumber: string;
  seats: number;
  status: "free" | "occupied" | "reserved";
  activeOrderStatus?: string | null;
  onClick?: () => void;
};

const STATUS_LABEL: Record<TableTileProps["status"], string> = {
  free: "Free",
  occupied: "Occupied",
  reserved: "Reserved",
};

// Color scheme per active order status for occupied tables
const ORDER_STATUS_TILE: Record<string, { bg: string; stripe: string; badge: string; icon: string }> = {
  pending: {
    bg: "bg-surface-raised",
    stripe: "color-mix(in srgb, var(--status-info) 10%, transparent)",
    badge: "bg-status-info text-white",
    icon: "⏳",
  },
  preparing: {
    bg: "bg-surface-raised",
    stripe: "color-mix(in srgb, var(--status-warning) 9%, transparent)",
    badge: "bg-status-warning text-on-brand",
    icon: "🔥",
  },
  served: {
    bg: "bg-surface-raised",
    stripe: "color-mix(in srgb, var(--status-success) 10%, transparent)",
    badge: "bg-status-success text-white",
    icon: "✓",
  },
  billed: {
    bg: "bg-status-success-tint",
    stripe: "color-mix(in srgb, var(--brand) 10%, transparent)",
    badge: "bg-brand text-white",
    icon: "💳",
  },
};

export function TableTile({ tableNumber, seats, status, activeOrderStatus, onClick }: TableTileProps) {
  const orderStage = status === "occupied" && activeOrderStatus ? ORDER_STATUS_TILE[activeOrderStatus] : null;

  return (
    <button
      onClick={onClick}
      className={`relative flex aspect-square min-h-12 min-w-12 flex-col justify-between overflow-hidden rounded-xl p-3 text-left transition active:scale-[0.98] ${
        status === "free"
          ? "bg-status-success-tint"
          : status === "reserved"
            ? "border-2 border-dashed border-status-info bg-surface-raised"
            : (orderStage?.bg ?? "bg-surface-raised")
      }`}
    >
      {status === "occupied" && (
        <>
          <div
            className="absolute inset-0"
            style={{
              backgroundImage: `repeating-linear-gradient(135deg, ${orderStage?.stripe ?? "color-mix(in srgb, var(--status-warning) 9%, transparent)"} 0px, ${orderStage?.stripe ?? "color-mix(in srgb, var(--status-warning) 9%, transparent)"} 6px, transparent 6px, transparent 12px)`,
            }}
          />
          <span
            className={`absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${orderStage?.badge ?? "bg-status-warning text-on-brand"}`}
            aria-hidden="true"
          >
            {orderStage?.icon ?? "🔥"}
          </span>
        </>
      )}
      <div className="relative heading-md text-ink-primary">{tableNumber}</div>
      <div className="relative flex items-center justify-between">
        <span className="body-sm flex items-center gap-1 text-ink-secondary">
          <IconUsers className="h-3.5 w-3.5" /> {seats}
        </span>
        <span className="label-sm text-ink-secondary">{STATUS_LABEL[status]}</span>
      </div>
    </button>
  );
}

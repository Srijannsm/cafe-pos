"use client";

import { Card } from "./Card";
import { Button } from "./Button";
import { PriceDisplay } from "./PriceDisplay";
import { IconChevronRight, IconMinus, IconPlus } from "../icons";
import type { MenuItemData, Modifier } from "../../lib/order-utils";

type MenuItemCardProps<T extends MenuItemData> = {
  item: T;
  selected: boolean;
  quantity: number;
  selectedModifierIds: number[];
  onSelect: (item: T) => void;
  onToggleModifier: (modifierId: number) => void;
  onQuantityChange: (next: number) => void;
  onAdd: (item: T) => void;
  /** Show a spinner on the Add button (waiter page fires an API call). */
  addLoading?: boolean;
  /** Visual density — "default" for the waiter tablet layout, "compact" for the public QR page. */
  size?: "default" | "compact";
  /** Extra className merged onto the wrapping Card. */
  className?: string;
  /**
   * Called when the quick-add (+) button is tapped on a collapsed card.
   * Only fires for items with no modifiers — items with modifiers always
   * expand so the user can choose their modifiers first.
   * If not provided, the quick-add button is hidden and the card expands
   * on tap as usual.
   */
  onQuickAdd?: (item: T) => void;
};

/**
 * A single menu-item card used in both the waiter order page and the
 * customer-facing QR self-order page.
 *
 * Collapsed: shows name, price (or out-of-stock), and either:
 *   - a quick-add (+) circle button (no modifiers + onQuickAdd provided), or
 *   - a chevron to expand (items with modifiers, or no handler provided).
 * Expanded: modifier toggles, quantity stepper, add button with computed price.
 */
export function MenuItemCard<T extends MenuItemData & { trackStock: boolean; stockQuantity: number; lowStockThreshold: number }>({
  item,
  selected,
  quantity,
  selectedModifierIds,
  onSelect,
  onToggleModifier,
  onQuantityChange,
  onAdd,
  addLoading,
  size = "default",
  className,
  onQuickAdd,
}: MenuItemCardProps<T>) {
  const outOfStock = item.trackStock && item.stockQuantity <= 0;
  const lowStock = item.trackStock && !outOfStock && item.stockQuantity <= item.lowStockThreshold;
  const hasModifiers = item.modifiers.length > 0;

  // Show quick-add only when: handler provided, item has no modifiers,
  // not out of stock, and card is collapsed.
  const showQuickAdd = !!onQuickAdd && !hasModifiers && !outOfStock && !selected;

  const selectedPrice =
    (Number(item.price) +
      item.modifiers
        .filter((m: Modifier) => selectedModifierIds.includes(m.id))
        .reduce((s: number, m: Modifier) => s + Number(m.priceDelta), 0)) *
    quantity;

  const compact = size === "compact";

  const stepperBtn = compact
    ? "h-9 w-9 rounded-md border border-border-subtle text-ink-secondary hover:bg-surface-sunken"
    : "h-10 w-10 rounded-pill border border-border-strong bg-surface-raised text-ink-secondary active:scale-95";

  const qtyText = compact
    ? "body-md w-6 text-center font-semibold text-ink-primary"
    : "heading-sm w-6 text-center text-ink-primary";

  const expandClass = compact ? "sm:col-span-2" : "col-span-2";

  return (
    <Card
      className={`${selected ? expandClass : ""} ${outOfStock ? "opacity-50" : ""} ${className ?? ""}`}
    >
      {/* Collapsed header — always visible */}
      <div className="flex w-full items-center gap-2">
        {/* Main tap area — expands the card (disabled for quick-add items so the whole row doesn't flicker) */}
        <button
          onClick={() => onSelect(item)}
          disabled={outOfStock}
          className="flex flex-1 items-center justify-between gap-2 text-left disabled:cursor-not-allowed min-w-0"
        >
          <span className="body-md font-semibold text-ink-primary truncate">{item.name}</span>
          <span className="flex shrink-0 items-center gap-1.5">
            {outOfStock ? (
              <span className="label-sm font-semibold text-status-danger-ink">Out of stock</span>
            ) : (
              <>
                {lowStock && (
                  <span className="label-sm text-status-warning-ink">{item.stockQuantity} left</span>
                )}
                <PriceDisplay amount={item.price} />
              </>
            )}
            {/* Chevron only when NOT showing quick-add button */}
            {!showQuickAdd && !outOfStock && (
              <IconChevronRight
                className={`h-4 w-4 text-ink-faint transition-transform ${selected ? "rotate-90" : ""}`}
              />
            )}
          </span>
        </button>

        {/* Quick-add button — circle + icon, only for items without modifiers */}
        {showQuickAdd && (
          <button
            type="button"
            aria-label={`Quick add ${item.name}`}
            onClick={(e) => {
              e.stopPropagation();
              onQuickAdd!(item);
            }}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand text-white shadow-sm transition active:scale-90 hover:brightness-110"
          >
            <IconPlus className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Expanded section — modifier toggles, quantity stepper, add button */}
      {selected && (
        <div className="animate-card-in mt-4 flex flex-col gap-4 border-t border-border-subtle pt-4">
          {item.modifiers.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {item.modifiers.map((modifier: Modifier) => {
                const active = selectedModifierIds.includes(modifier.id);
                return (
                  <button
                    key={modifier.id}
                    type="button"
                    onClick={() => onToggleModifier(modifier.id)}
                    className={`rounded-pill border-2 px-3 py-1.5 body-sm font-semibold transition ${
                      active
                        ? "border-brand bg-brand-tint text-brand-strong"
                        : "border-border-subtle bg-surface-raised text-ink-secondary hover:border-border-strong"
                    }`}
                  >
                    {modifier.name} +Rs. {modifier.priceDelta}
                  </button>
                );
              })}
            </div>
          )}

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button
                type="button"
                aria-label="Decrease quantity"
                onClick={() => onQuantityChange(Math.max(1, quantity - 1))}
                className={`flex items-center justify-center ${stepperBtn} disabled:cursor-not-allowed disabled:opacity-40`}
              >
                <IconMinus className={compact ? "h-4 w-4" : undefined} />
              </button>
              <span className={qtyText}>{quantity}</span>
              <button
                type="button"
                aria-label="Increase quantity"
                onClick={() =>
                  onQuantityChange(item.trackStock ? Math.min(item.stockQuantity, quantity + 1) : quantity + 1)
                }
                disabled={item.trackStock && quantity >= item.stockQuantity}
                className={`flex items-center justify-center ${stepperBtn} disabled:cursor-not-allowed disabled:opacity-40`}
              >
                <IconPlus className={compact ? "h-4 w-4" : undefined} />
              </button>
            </div>
            <Button type="button" onClick={() => onAdd(item)} loading={addLoading}>
              Add · <PriceDisplay amount={selectedPrice} />
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}

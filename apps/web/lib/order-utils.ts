/** Shared types and helpers used by both the waiter order page and the QR self-order page. */

export type Modifier = {
  id: number;
  name: string;
  priceDelta: string;
};

export type OrderItemData = {
  id: number;
  quantity: number;
  price: string;
  status: "pending" | "ready" | "served";
  menuItem: { id: number; name: string };
  orderItemModifiers: { id: number; modifier: Modifier }[];
};

export type MenuItemData = {
  id: number;
  name: string;
  price: string;
  category: { id: number; name: string };
  modifiers: Modifier[];
  trackStock: boolean;
  stockQuantity: number;
  lowStockThreshold: number;
};

/** Total price for a single order-item line (base price + modifiers) * quantity. */
export function lineTotal(item: OrderItemData): number {
  const modifierTotal = item.orderItemModifiers.reduce(
    (sum, oim) => sum + Number(oim.modifier.priceDelta),
    0,
  );
  return (Number(item.price) + modifierTotal) * item.quantity;
}

/** Group menu items by their category name, preserving insertion order. */
export function groupByCategory<T extends MenuItemData>(menu: T[]): [string, T[]][] {
  const groups = new Map<string, T[]>();
  for (const item of menu) {
    const key = item.category.name;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(item);
  }
  return Array.from(groups.entries());
}

export type Category = {
  id: number;
  name: string;
  sortOrder: number;
  parentId: number | null;
  isActive: boolean;
  itemCount?: number;
};

export type Modifier = { id: number; name: string; priceDelta: string };

export type Station = "kitchen" | "bar" | "hookah";

export type AdminMenuItem = {
  id: number;
  name: string;
  price: string;
  description: string | null;
  imageUrl: string | null;
  tags: string[];
  station: Station;
  sortOrder: number;
  costPrice: string | null;
  isAvailable: boolean;
  categoryId: number;
  category: { id: number; name: string; parentId: number | null; sortOrder: number };
  modifiers: Modifier[];
  trackStock: boolean;
  stockQuantity: number;
  lowStockThreshold: number;
  recipe?: { id: number; stockItemId: number; quantity: string; stockItem: { id: number; name: string; unit: string; avgCost: string } }[];
};

export const TAGS: { value: string; label: string; emoji: string }[] = [
  { value: "veg", label: "Veg", emoji: "🟢" },
  { value: "nonveg", label: "Non-veg", emoji: "🔴" },
  { value: "vegan", label: "Vegan", emoji: "🌱" },
  { value: "spicy", label: "Spicy", emoji: "🌶️" },
  { value: "bestseller", label: "Bestseller", emoji: "⭐" },
  { value: "new", label: "New", emoji: "✨" },
];

export const STATIONS: { value: Station; label: string }[] = [
  { value: "kitchen", label: "Kitchen" },
  { value: "bar", label: "Bar" },
  { value: "hookah", label: "Hookah" },
];

/** Categories in display order with sub-categories right after their parent. */
export function orderedCategories(cats: Category[]) {
  const top = cats.filter((c) => c.parentId == null).sort((a, b) => a.sortOrder - b.sortOrder);
  const out: (Category & { depth: number; path: string })[] = [];
  for (const t of top) {
    out.push({ ...t, depth: 0, path: t.name });
    for (const c of cats.filter((x) => x.parentId === t.id).sort((a, b) => a.sortOrder - b.sortOrder)) {
      out.push({ ...c, depth: 1, path: `${t.name} › ${c.name}` });
    }
  }
  // Orphans (parent deleted) at the end so nothing disappears.
  for (const c of cats) if (!out.some((o) => o.id === c.id)) out.push({ ...c, depth: 0, path: c.name });
  return out;
}

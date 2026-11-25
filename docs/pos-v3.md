# POS v3 — what changed and how to run it

## 1. Run it (Windows, from the repo root)

```powershell
cd apps/api
npx prisma migrate deploy      # applies pos_v3_polish + plan_configs (additive only, plans seeded)
npx prisma generate            # REQUIRED: regenerates the client for Windows
cd ../..
npm run dev
```

If `migrate deploy` complains about older migration history (the
`add_theme_color` migration targets a `"Cafe"` table that doesn't exist, and
`add_table_merge` has no timestamp), your dev DB was probably built with
`db push`. Then use `npx prisma db push` instead — the new migration is purely
additive, so nothing is lost either way. Back up first on anything real.

## 2. What's new, by screen

| Area | What you get |
|---|---|
| Admin shell | Aaramva-style collapsible sidebar with groups (Menu, Inventory, Cash & expenses), low-stock badge, floor shortcuts |
| Menu → Items | Dense list with photo, inline Sold-out switch, filters, drag-reorder within a category, side drawer editor: photo (auto crop 4:3 + WebP), description, tags, station, options, cost/recipe → live margin, portion counting + restock |
| Menu → Categories | Sub-categories (2 levels), show/hide, drag-reorder |
| Inventory | Stock items (ingredient / consumable / asset), Stock in (purchase with supplier + bill no., weighted avg cost), Stock out (broken / wasted / staff use), shelf count with variance, suppliers, full history; recipes deduct ingredients when a bill is paid |
| Cash & expenses | Open drawer with float, cash in / pay out / expense, close with note-by-note counter → expected vs counted, printable Z-report, shift history, expenses by category |
| Reports | One filter bar (date presets incl. fiscal year, staff, payment, staff vs QR, category) → Sales (trend, mix, busy-hours heatmap), Items (+margin), Staff, Bills register, Discounts & voids, Purchases & expenses, Stock, Profit. CSV on every table, print |
| Settings | Cafe & vibe (logo, cover, colour with contrast check, heading font, grid/list menu, Wi-Fi, socials, receipt footer, live phone preview), Billing & tax (VAT, VAT-inclusive prices, service charge), Features (inventory, table game) |
| Floor (tables) | Cards show running total, time seated, "n to confirm" (QR), "n ready", red Calling/Bill badges with one-tap Done; live via sockets |
| Waiter ordering | Popular tab, category + sub-category chips, search, one-tap add with Undo, options/notes sheet, sticky "review & send" bar, sold-out toggle, void with reason |
| Kitchen display | Dark, station tabs (Kitchen / Bar / Hookah), amber/red timers, tap item = ready, tap header = bump, recall, all-day counts, chime + flash, void strike-through, screen kept awake |
| Billing | Counter list + drawer status; checkout with discount (reason, 20% cashier cap), split N ways, mixed payments, quick cash buttons with change; 80 mm receipt with amount in words and "COPY OF ORIGINAL (n)" on reprints |
| Customer QR | Cover/logo hero, Wi-Fi tap-to-copy, photo menu, item sheet with options + note, cart with one "goes well with" upsell, live order status, Call waiter / Request bill, EN / नेपाली, "Play while you wait" tic-tac-toe (own table or challenge another table, emoji-only) |

## 3. Bug fixed on the way
Paying a bill used to subtract counted-stock items a second time (they were
already subtracted when added), and the follow-up SQL referenced a column
name that doesn't exist. Now stock moves exactly once.

## 4. Quick test script (15 min, two phones + a laptop)
1. Settings → pick a colour + upload logo/cover; open a table's QR link on a phone.
2. Admin → Inventory: add Milk (L), Coffee beans (g), Beer glass (asset); Stock in.
3. Menu: add Cappuccino with a photo, station Bar, recipe 0.15 L milk + 18 g beans.
4. Phone (customer): order 2 Cappuccino with a note → floor shows "2 to confirm" + chime.
5. Waiter: open table → Send to kitchen → KDS (Bar tab) shows ticket; tap items ready.
6. Waiter: void one item with a reason → KDS strikes it.
7. Serve → Get bill → 10% discount (Regular customer) → pay part cash, part Fonepay.
8. Receipt prints; reprint shows COPY OF ORIGINAL (1). Milk/beans dropped in Stock.
9. Cash → Close shift with note counter. Reports → Discounts & voids shows steps 6–7.

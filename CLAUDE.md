# Cafe POS System — Project Context

## What this is
A multi-tenant cafe/restaurant POS SaaS, with a waiter ordering app as a core
feature. Started as a build for a single client (Mittho Cafe, in Nepal); that
engagement ended before launch, so the project pivoted to v2: building it out
as a proper multi-tenant product rather than shipping a single-client MVP.
Mittho Cafe's data now lives in the system as the first (test) tenant.

## Tech stack
- Backend: NestJS (TypeScript), monorepo managed with Turborepo + npm workspaces
- Frontend: Next.js (App Router) — will serve POS terminal, kitchen display, and
  admin dashboard as separate routes in one app
- Database: PostgreSQL, accessed via Prisma ORM
- Waiter app: installable PWA (Next.js + manifest.json, standalone display,
  on-brand icons) -- same site, same login, just installable on desktop/mobile.
  React Native still planned for v2 if Bluetooth printing is needed.
- Real-time sync: Socket.io via NestJS WebSocket Gateway (`OrdersGateway`),
  scoped per-cafe via rooms (`cafe:<id>`, joined using the cafeId from the
  verified JWT). Events: `order.sentToKitchen`, `order.itemReady`,
  `order.itemVoided`, `floor.changed` (tables/billing/KDS refetch),
  `qr.orderPlaced`, `table.request`, `menu.changed`. Web pages subscribe via
  `lib/useCafeSocket.ts` and keep a slow fallback poll (30s, 6-8s while the
  socket is down). A separate `/games` namespace (`GamesGateway`) serves the
  customer table game and authenticates by qrToken, not JWT.

## Multi-tenancy (v2)
- Every cafe running on the platform gets one `Cafe` row (id, name, slug,
  isActive). `User`, `RestaurantTable`, `MenuCategory`, `MenuItem`, and `Order`
  each carry a direct `cafeId` FK and are scoped by it on every query.
  `Modifier`, `OrderItem`, `OrderItemModifier`, and `Payment` deliberately do
  NOT get a redundant direct `cafeId` — they're always reached through a
  parent (menuItem/order), so they're scoped transitively via a nested-relation
  `findFirst({ where: { id, <parent>: { cafeId } } })` instead.
- Cafes are identified by a URL slug, not a subdomain: staff log in at
  `/c/:slug/login`. This was chosen over subdomain-per-cafe or a cafe-picker
  screen to avoid wildcard DNS/SSL work until there are paying customers.
- The JWT (not the URL) carries `cafeId` for every authenticated request after
  login — a custom `@CurrentUser()` param decorator reads it server-side off
  the verified token, so a controller never trusts a client-supplied cafeId.
  This is also why only the login flow needed to move under `/c/[slug]/...`;
  every other route (`/`, `/kitchen`, `/order/[id]`, `/billing`, `/admin/*`)
  was left where it was.
- Uniqueness that used to be global is now scoped per-cafe: e.g. a staff
  member's name, a menu item's name, and a table's number only have to be
  unique within their own cafe (`@@unique([cafeId, name])` etc.), so two
  different cafes can each have their own "Sita" or their own "Table 4".

## Monorepo structure
- apps/api      → NestJS backend (port 4000)
- apps/web      → Next.js frontend (port 3000)
- packages/     → shared TypeScript types (not yet populated)

## Key business decisions (do not change without asking)
- No cafe on the platform is assumed to be VAT registered by default — VAT is
  opt-in per cafe (Cafe.vatEnabled). VAT cafes can choose VAT-inclusive menu
  prices (Cafe.pricesIncludeVat, back-calculated on the bill). Service charge
  (Cafe.serviceChargeRate) defaults to 0 — its legal status in Nepal is
  contested (2023 Supreme Court ruling); leave it to the cafe's accountant.
- Payments are informal QR (a cafe shows its own eSewa/Khalti/FonePay QR code) —
  there is no real payment gateway API integration. The Payment.method field is
  a PaymentMethod enum (cash | esewa_qr | khalti_qr | fonepay_qr) — this gives us
  DB-level typo protection for reporting, NOT a signal that it's tied to real
  transaction verification. Adding a new payment provider later requires a schema
  migration to extend the enum.
- Still excluded from scope: real payment-gateway integration, offline
  ordering (IndexedDB outbox), IRD software enlistment / CBMS sync, split-by-item
  bills (split is "equal shares / any amount" via multiple payments), loyalty.
  Don't market the app as "IRD-approved" -- it isn't enlisted.
- Order status is tracked at BOTH the Order level and the individual OrderItem
  level — this is intentional, since different items in one order finish cooking
  at different times (see schema notes below)

## Database conventions
- Prisma model names: PascalCase (e.g. MenuItem)
- Prisma field names: camelCase (e.g. isAvailable)
- Actual PostgreSQL table names: snake_case, set via @@map (e.g. "menu_items")
- Money fields: always use Prisma's Decimal type, never Int or Float
  (Decimal avoids floating-point rounding errors in billing)
- Every model needs an auto-incrementing Int id as primary key

## NestJS module pattern
- Every feature module (MenuModule, OrdersModule, etc.) imports PrismaModule
  to get database access — do not register PrismaService directly in individual
  feature modules, always go through the shared PrismaModule
- Controller → Service → PrismaService is the standard flow; controllers never
  contain business logic directly
- Every tenant-scoped service method takes `cafeId` as its first parameter and
  scopes its Prisma calls with it (directly, or transitively through a parent
  relation for child models — see Multi-tenancy above). New endpoints should
  follow this pattern rather than trusting a cafeId from the request body/query.

## Developer context
- Srijan is rebuilding his hands-on coding ability. When making non-trivial code
  changes, briefly explain WHY the change is being made before/alongside the diff,
  not just what changed.
- Full stack background: Django, Laravel, NestJS, Next.js, React Native, PostgreSQL

## Not yet built (do not assume these exist)
- Public/self-serve cafe signup -- onboarding is internal-only (see below)

## Admin capabilities
- Menu management (categories, items, modifiers), table management, and
  staff management (add waiters/cashiers, edit roles, deactivate, reset
  PINs) all live under /admin in the web app, scoped to the logged-in
  staff member's own cafe. Nothing requires editing the DB or seed script
  by hand anymore for day-to-day staff changes.

## Platform admin (internal superadmin panel)
- /platform (web) + PlatformAdminModule/PlatformAuthModule (api) is the
  internal superadmin panel: sign in at /platform/login, see a
  platform-wide dashboard (cafe/staff/order counts), onboard a new cafe
  with its first admin (name + PIN chosen at creation) in one step, click
  into a cafe's detail page (staff, menu/table/order counts, recent
  orders), and activate/deactivate a cafe.
- v3 panel (components/platform/PlatformShell, dark sidebar on purpose so
  it's never mistaken for a cafe admin): Overview = MRR (active subs, yearly
  counted /12, prices in PLAN_PRICES in subscription/plan-limits.ts),
  30-day money through all tills, and a "Needs attention" list (overdue,
  trials ending <= 5 days, renewals due this week, "gone quiet" = no order in
  7 days). Cafes list has per-cafe 30-day orders/GMV/last order and status
  tabs. Cafe detail: setup checklist, Subscription tab (plan/cycle/status/due
  date, extend trial, record payment -> POST /platform/cafes/:id/payments
  activates + moves the due date one cycle and appends a dated line to
  subscriptionNotes, which doubles as the payment log until there's a real
  billing table), Staff tab with PIN reset, feature toggles, deactivate.
  Onboarding drawer creates cafe + admin (trial or paid start) and gives a
  copy/WhatsApp-ready welcome message with the login link and PIN.
- Superadmins are a separate `PlatformUser` model (username + hashed
  password) -- not per-cafe `User` rows, and not scoped to any cafe.
  Their JWT is signed with its own secret (PLATFORM_JWT_SECRET, not
  JWT_SECRET) and carries `type: 'platform'`, checked by a dedicated
  `platform-jwt` Passport strategy/guard, so a superadmin session and a
  cafe staff session are never interchangeable even if a token leaked.
- The one superadmin account is seeded from SUPERADMIN_USERNAME /
  SUPERADMIN_PASSWORD in .env via `npm run seed` (apps/api) -- there's no
  public signup, and this is internal-only, not linked from the app nav.

## Billing & money control (v3)
- Totals are computed in ONE pure function, `computeTotals()` in
  orders.service.ts: subtotal (voided lines excluded) -> discount -> net ->
  service charge -> VAT (added on top, or back-calculated when prices include
  VAT). The live estimate (GET /orders/:id/estimate) and the frozen bill both
  use it, so they can't drift. Unit-tested in orders.service.spec.ts.
- Discounts are bill-level (Order.discountType/Value/Amount/Reason), need a
  reason, and cashiers are capped at 20% (admins unlimited). Locked once any
  payment is recorded.
- A bill can have many Payments (split / mixed cash + QR). POST
  /orders/:id/payments takes one; the order closes (paid, table freed, recipe
  ingredients deducted) when payments cover the total. PATCH /orders/:id/pay
  (legacy "pay remaining in full") still works.
- Removing an item: before it reaches the kitchen it's deleted
  (DELETE /orders/items/:id); after, it must be VOIDED with a reason
  (PATCH /orders/items/:id/void) -- the row stays, KDS strikes it through.
- Bills: bill number is taken once and kept if the bill is reopened.
  Reopen is refused once money is taken. Order.printCount drives
  "COPY OF ORIGINAL (n)" on reprints.
- Cancelling after the kitchen started is admin-only with a reason.
- AuditLog (append-only, AuditService.log) records discounts, voids,
  cancels, reopens, shift closes, stock-outs/counts and cash movements. The
  "Discounts & voids" report reads it. Never update/delete audit rows.
- Shifts (cash drawer): one open shift per cafe; payments link to it;
  CashMovement = pay_in / pay_out / expense. Close = counted cash vs expected
  (opening + cash sales + pay-ins - pay-outs/expenses), difference frozen.

## Inventory tracking
- Opt-in, per menu item (MenuItem.trackStock) -- most items (drinks made
  to order) never need a stock count, so items default to untracked
  rather than every item carrying a meaningless number. When on,
  stockQuantity/lowStockThreshold apply.
- Stock decrements when a waiter adds the item to an order (addItem),
  re-checked and applied inside the same transaction as the order item
  itself, not from a stale read before it opened. Adding more than what's
  left throws a 400 with how many remain. Cancelling a pending order (the
  only status cancellation is allowed from) restores the stock it had
  reserved, since a cancelled order was never actually made.
- Restocking/correcting is a separate atomic endpoint (PATCH
  /menu/:id/stock, +/- delta) rather than a read-modify-write from the
  client, so two people adjusting the same item's stock at once don't
  clobber each other.
- The waiter ordering screen (/order/:id) shows "Out of stock" and blocks
  selecting/increasing quantity past what's left, in addition to the
  server-side check -- the server check is what actually prevents
  overselling, the frontend one is just to avoid a wasted trip.
- NOTE (fixed in v3): payment used to decrement trackStock items a second
  time (and its raw SQL used a non-existent snake_case column). Finished-goods
  stock is now taken only at addItem.
- Raw-material inventory (v3, InventoryModule, toggle Cafe.inventoryEnabled):
  StockItem (kind ingredient/consumable/asset, unit, cached currentQty,
  weighted avgCost) + StockMovement ledger (opening/purchase/sale/wastage/
  breakage/staff_use/count). currentQty is ONLY changed in the same
  transaction as a movement row. Purchases (+ PurchaseLine, Supplier) add
  stock and re-average cost. Counts post the variance as a `count` movement.
  RecipeLine links a menu item to stock items; ingredients are deducted when
  the bill is fully paid.

## Reports & analytics
- /admin/reports (web) + ReportsModule (api, admin-only, plan-gated). One
  filter DTO for every report: from/to (cafe-local days), staffId, method,
  source (staff/qr), orderType, categoryId, groupBy, tz (minutes east of UTC,
  default Nepal +345 -- replaces the old UTC-day simplification).
- Endpoints: overview (summary, trend, payment mix, staff vs QR, busy-hours
  heatmap), items (with margin when cost is known), staff, bills (sales
  register), exceptions (audit-log based), shifts, purchases (+ expenses),
  stock (movement summary + valuation), profit (net - COGS - losses - expenses).
- A sale belongs to the day its bill was fully paid (last payment time).
  Revenue is read off Payment rows; voided lines never count as sales.
- CSV export is client-side (lib/csv.ts) for every table.

## Customer self-ordering (QR)
- Each RestaurantTable has a qrToken (unique, cuid, unrelated to the
  human-readable tableNumber) -- that token is the only "credential" the
  public ordering flow needs, so the URL itself is the access control.
  Regenerating it (PATCH /tables/:id/regenerate-qr, admin-only) invalidates
  the old link outright rather than layering on a second valid one, so a
  reprinted or suspected-leaked QR code actually stops working.
- PublicOrderingModule (api) is a fully unauthenticated module
  (GET/POST /public/tables/:qrToken...) that reuses OrdersService.addItem
  and .findOne rather than re-implementing stock checks, price snapshotting,
  or modifier handling -- a customer's line item goes through exactly the
  same path a waiter's does.
- "Staff must confirm before the kitchen sees it" needed no new state
  machine: a self-placed order lands as 'pending' like any other new order,
  and only an authenticated staff member calling sendToKitchen moves it to
  'preparing'. addItem itself never forwards to the kitchen (it only
  reopens an already-served order back to preparing on a later round), so
  nothing a customer submits reaches the kitchen board unconfirmed.
- Scanning again at an occupied table joins the existing active order
  (status not in paid/cancelled) instead of starting a competing one --
  same "what counts as active" definition the tables floor view already
  uses. A fresh order only starts if the table is currently free.
- /order/table/:qrToken (web) is the public page -- no NavBar, no auth,
  built as a standalone cart-then-submit flow (select items locally, submit
  the whole batch in one POST) rather than the waiter screen's
  add-one-at-a-time pattern, since a customer doesn't have a live
  order to append to until their first submission creates one.
- /admin/tables lists each table's ordering link (copy + regenerate) and
  renders an actual scannable QR code (qrcode.react, client-side SVG) in
  a modal, with a print action sized for a table tent.

## Menu (v3)
- MenuCategory.parentId = sub-category (max 2 levels, enforced in
  MenuService). MenuItem has description, imageUrl, tags (fixed vocabulary in
  menu/dto/menu-fields.ts), station (kitchen/bar/hookah -> KDS routing,
  snapshotted onto OrderItem), sortOrder, costPrice. Drag-reorder via
  PATCH /menu/reorder. Items with sales history are archived, not deleted.
- Images: the browser crops + compresses to WebP (lib/image.ts) and uploads to
  POST /uploads/image/:kind (menu|cover|category) -> public/uploads/<kind>/.
  No native image library on the server on purpose.
- Any staff member can 86 an item: PATCH /menu/:id/availability.

## Branding & design system (v3)
- Look matches Aaramva Shikshya: TailAdmin-style neutral greys, Outfit font,
  rounded-2xl cards, collapsible grouped sidebar (components/admin/AdminShell).
- One brand colour per cafe -> lib/theme.ts derives brand/strong/tint/on-brand
  with WCAG contrast checks (bright colours get dark text). Cafe.fontStyle
  (modern/warm/playful) only changes headings on customer-facing screens.
- Customer QR page uses cover image, logo, tagline, Wi-Fi, socials,
  menuLayout (grid/list), EN/Nepali UI labels (app/order/table/[qrToken]/i18n.ts).
- "Play while you wait" (Cafe.gamesEnabled, default off): server-authoritative
  tic-tac-toe in GamesGateway, same-table or cross-table, no chat (preset emoji
  only), in-memory state.

## Plans & feature gating
- Plans are DATA, not code: `plan_configs` table (PlanConfig model), one row
  per plan key (starter/standard/premium): name, description, monthlyPrice,
  yearlyMonths (10 = "pay 10, get 12"), maxStaff/maxMenuItems/maxTables
  (null = unlimited), and feature flags qrOrdering / reports / inventory /
  tableGame. Edited by the superadmin at /platform/plans
  (GET/PATCH /platform/plans[/:key]).
- PlansService (global) loads the table into an in-memory cache in
  subscription/plan-limits.ts on boot, after every edit and every 60s, so the
  assert*/hasFeature checks stay synchronous. Defaults in that file only
  apply until the first load (or if the migration hasn't run).
- Trial cafes get the PREMIUM row. Overdue = read-only (assertNotOverdue).
- Gating: QR ordering + reports via assert*Allowed; inventory via
  PlanFeatureGuard + @RequiresFeature('inventory') on InventoryController and
  the menu recipe routes (and recipe deduction is skipped when not in plan);
  the table game in GamesGateway + public QR payload. A feature is on for a
  cafe only if the plan includes it AND the cafe's own toggle
  (Cafe.inventoryEnabled / gamesEnabled) is on.
- New plan feature = add a column to PlanConfig + PlanFeature union in
  plan-limits.ts + a row in the platform Plans page and cafe Plan page.

## Known gaps (tracked, not urgent)
- Test coverage: OrdersService (the full order lifecycle, cafeId-scoped) and
  AuthService (cafe-aware PIN login) have real unit tests against a mocked
  PrismaService — see src/orders/orders.service.spec.ts and
  src/auth/auth.service.spec.ts. The remaining .spec.ts files are still
  "should be defined" stubs (passing DI correctly via guard overrides).
  Controller-level and e2e coverage is still not built.
- No cafe signup/onboarding UI yet — new cafes go in via prisma/seed.ts by hand.
- No per-cafe subscription/billing plumbing yet (this is a platform SaaS goal,
  not the in-app cafe billing/POS billing feature, which already works).

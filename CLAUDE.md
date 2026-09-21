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
- Real-time sync: Socket.io via NestJS WebSocket Gateway (`OrdersGateway`) --
  built for the kitchen<->waiter relation only: `order.sentToKitchen` and
  `order.itemReady`. Emits are scoped per-cafe via Socket.IO rooms (`cafe:<id>`,
  joined on connect using the cafeId out of the verified JWT) so one cafe never
  sees another's kitchen/waiter events. Tables floor view and Billing still
  rely on plain polling, not sockets.

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
- No cafe on the platform is assumed to be VAT registered by default — VAT
  calculation is not built into billing logic. (Was a hard client requirement
  when this was single-tenant; revisit if/when a registered business signs up.)
- Payments are informal QR (a cafe shows its own eSewa/Khalti/FonePay QR code) —
  there is no real payment gateway API integration. The Payment.method field is
  a PaymentMethod enum (cash | esewa_qr | khalti_qr | fonepay_qr) — this gives us
  DB-level typo protection for reporting, NOT a signal that it's tied to real
  transaction verification. Adding a new payment provider later requires a schema
  migration to extend the enum.
- Still excluded from scope (candidates for a future v2+ pass): inventory
  tracking, QR customer self-ordering, reports/analytics dashboard, table
  merge/split, per-cafe billing/subscription management for the platform itself.
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
- Socket events beyond the two kitchen<->waiter ones above (e.g. nothing
  pushes to Tables or Billing yet -- they still poll)
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
- Superadmins are a separate `PlatformUser` model (username + hashed
  password) -- not per-cafe `User` rows, and not scoped to any cafe.
  Their JWT is signed with its own secret (PLATFORM_JWT_SECRET, not
  JWT_SECRET) and carries `type: 'platform'`, checked by a dedicated
  `platform-jwt` Passport strategy/guard, so a superadmin session and a
  cafe staff session are never interchangeable even if a token leaked.
- The one superadmin account is seeded from SUPERADMIN_USERNAME /
  SUPERADMIN_PASSWORD in .env via `npm run seed` (apps/api) -- there's no
  public signup, and this is internal-only, not linked from the app nav.

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

## Reports & analytics
- /admin/reports (web) + ReportsModule (api, admin-only) covers revenue
  by day, top-selling menu items, and payment-method mix, over a date
  range (Today / 7 days / 30 days presets). Revenue is read off Payment
  rows (Payment.paidAt), not Order.total, since Order.total gets cleared
  if a bill is reopened -- Payment.amount is the actual amount collected.
- Date ranges are resolved in UTC (setUTCHours, not local setHours) to
  avoid mixing a UTC-parsed date string with a local-timezone day
  boundary. This is a simplification, not full per-cafe timezone support
  -- a day bucket is a UTC calendar day, so orders placed very late/early
  local night can land in the "wrong" day's bucket for a cafe far from
  UTC. Fine for now; revisit if that becomes a real complaint.

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

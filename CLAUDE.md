# Cafe POS System — Project Context

## What this is
A cafe/restaurant POS system being built for a real client in Nepal, with a waiter
ordering app as a core requirement. Long-term goal: turn this into a multi-tenant
SaaS product after the first client's system is stable.

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
  `order.itemReady`, broadcast to all connected clients (no rooms). Tables
  floor view and Billing still rely on plain polling, not sockets.

## Monorepo structure
- apps/api      → NestJS backend (port 4000)
- apps/web      → Next.js frontend (port 3000)
- packages/     → shared TypeScript types (not yet populated)

## Key business decisions (do not change without asking)
- Client is NOT VAT registered — do not add VAT calculation to billing logic
- Payments are informal QR (client shows their own eSewa/Khalti/FonePay QR code) —
  there is no real payment gateway API integration. The Payment.method field is
  a PaymentMethod enum (cash | esewa_qr | khalti_qr | fonepay_qr) — this gives us
  DB-level typo protection for reporting, NOT a signal that it's tied to real
  transaction verification. Adding a new payment provider later requires a schema
  migration to extend the enum.
- MVP scope excludes: inventory tracking, QR customer self-ordering, multi-tenant
  logic, reports/analytics dashboard, table merge/split. These come in v2+.
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

## Developer context
- Srijan is rebuilding his hands-on coding ability. When making non-trivial code
  changes, briefly explain WHY the change is being made before/alongside the diff,
  not just what changed.
- Full stack background: Django, Laravel, NestJS, Next.js, React Native, PostgreSQL

## Not yet built (do not assume these exist)
- Socket events beyond the two kitchen<->waiter ones above (e.g. nothing
  pushes to Tables or Billing yet -- they still poll)

## Admin capabilities
- Menu management (categories, items, modifiers), table management, and
  staff management (add waiters/cashiers, edit roles, deactivate, reset
  PINs) all live under /admin in the web app. Nothing requires editing the
  DB or seed script by hand anymore for day-to-day staff changes.

## Known gaps (tracked, not urgent for MVP)
- Test coverage: OrdersService (the full order lifecycle) and AuthService
  (PIN login) now have real unit tests against a mocked PrismaService —
  see src/orders/orders.service.spec.ts and src/auth/auth.service.spec.ts.
  The remaining .spec.ts files are still "should be defined" stubs (now at
  least passing DI correctly, unlike before). Controller-level and e2e
  coverage is still not built.
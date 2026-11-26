# API end-to-end tests

These boot the real API (same setup as `main.ts`) against a real Postgres
database built from the migrations, and drive it over HTTP.

## Run

1. Have a **local** Postgres you don't mind tests creating and dropping
   databases on (never point this at production).
2. In `apps/api`:

```bash
# PowerShell
$env:E2E_DATABASE_URL="postgresql://postgres:YOUR_PASSWORD@localhost:5432/postgres"
npm run test:e2e
```

The first step runs `prisma migrate deploy` into a template database
(`cafepos_e2e_template`), so a broken migration fails the run. Each test file
then gets its own copy of that database and drops it afterwards.

## What's covered (90 tests)

| File | What it proves |
| --- | --- |
| auth | PIN login, lockout after 5 wrong PINs, deactivated staff / paused cafe lose access immediately, platform vs staff tokens can't be swapped |
| tenancy | Cafe A can't read or change any of cafe B's orders, tables, menu, modifiers, staff, stock |
| orders | Full order → kitchen → bill → discount → split payment flow, VAT on top and VAT-inclusive, bill numbers, voids, cancels, stock, and concurrency (double payments, double bill taps, two waiters on one table) |
| roles-users | What waiters/cashiers can't do, staff rules (digit PINs, last admin, plan staff limit), image upload checks |
| qr-ordering | Public QR menu/order flow, staff confirmation, rate limit, regenerated QR, plan gating |
| inventory-shifts | Opening stock, purchases + average cost, recipe deduction on payment, stock-out, counts, cash drawer maths, one open shift |
| platform-reports | Onboarding, plan feature toggles taking effect live, overdue cafes, PIN reset, every report with filters |

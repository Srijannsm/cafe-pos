<p align="center">
  <img src="apps/web/public/brand/aaramva-pos-logo.svg" alt="Aaramva POS" height="64" />
</p>

<p align="center">Orders, kitchen and billing for cafes and restaurants — a multi-tenant POS by Aaramva.</p>

## What's inside

| Path | What it is |
| --- | --- |
| `apps/api` | NestJS API (port 4000) — Prisma + PostgreSQL, Socket.IO for kitchen/floor updates |
| `apps/web` | Next.js app (port 3000) — waiter floor, kitchen display, billing, cafe admin, customer QR ordering, platform panel |
| `docs/` | Setup walkthrough (`pos-v3.md`), schema reference, security notes |

## Run it locally

```bash
npm install
cd apps/api && npx prisma migrate deploy && npx prisma generate && npm run seed && cd ../..
npm run dev        # starts api + web together (Turborepo)
```

Then open `http://localhost:3000/c/<cafe-slug>/login` for staff, or `/platform/login` for the internal superadmin panel.
See [`docs/pos-v3.md`](docs/pos-v3.md) for the full walkthrough and a 15-minute test script.

## Brand

Logo files live in `apps/web/public/brand/`. Use `components/brand/Brand.tsx` in code rather than hard-coding the name or colours.
Green `#005538` · Amber `#F2A93B`.

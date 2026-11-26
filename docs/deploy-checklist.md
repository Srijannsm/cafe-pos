# Aaramva POS — production deploy checklist

## 1. Server
- [ ] Node.js 24+ (the repo's `engines` field), PostgreSQL 15+.
- [ ] HTTPS in front of both apps (Caddy or nginx), e.g. `pos.example.com` → web :3000, `api.example.com` → API :4000.
- [ ] The proxy forwards WebSocket upgrades for the API (Socket.IO powers the kitchen screen, floor updates and the table game).
      nginx: `proxy_http_version 1.1; proxy_set_header Upgrade $http_upgrade; proxy_set_header Connection "upgrade";`
- [ ] Set the proxy's upload limit to at least 6 MB (`client_max_body_size 6m;`): image uploads are capped at 5 MB.

## 2. API (`apps/api`)
- [ ] `cp .env.example .env` and fill it in:
  - `DATABASE_URL`
  - `JWT_SECRET` and `PLATFORM_JWT_SECRET`: two **different** secrets of 32+ characters
    (`node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`)
  - `CORS_ORIGIN=https://pos.example.com` (comma-separate several)
  - `NODE_ENV=production`, `PORT=4000`
  - `SUPERADMIN_USERNAME` / `SUPERADMIN_PASSWORD` (a strong password)
  The API **refuses to start** in production if a secret is missing, short, or shared, or if `CORS_ORIGIN` is unset.
- [ ] From the repo root: `npm ci`
- [ ] In `apps/api`: `npx prisma migrate deploy` then `npx prisma generate`
- [ ] `npm run build` and start with `node dist/main` (under pm2 or systemd so it restarts on crash or reboot).
- [ ] **First deploy only:** `npm run seed` creates the superadmin **and the demo cafe "Mittho Cafe" with known PINs (9999, 1111 …)**.
      Afterwards, deactivate that cafe from /platform or change every PIN.
- [ ] `apps/api/public/uploads/` holds every cafe's logo and menu photos. Keep it on persistent disk, back it up,
      and never replace it during a redeploy. It is no longer tracked by git. Untrack the copies already
      committed with: `git rm -r --cached apps/api/public/uploads`.
- [ ] Run **one** API process. PIN lockouts, the plan cache, table-game state and the call-waiter rate limit are
      held in memory. Running several processes needs Redis first.

## 3. Web (`apps/web`)
- [ ] `NEXT_PUBLIC_API_URL=https://api.example.com` set **before** `npm run build`: it is baked into the build.
      Change it, then rebuild. (`turbo.json` now declares it, so Turbo won't serve a stale cached build.)
- [ ] `npm run build` then `npm run start` (port 3000) under pm2 or systemd.

## 4. Backups
- [ ] Nightly `pg_dump` of the database, kept off the server.
- [ ] Nightly copy of `apps/api/public/uploads/`.

## 5. Before every release
- [ ] `npm run test` in `apps/api` (unit tests)
- [ ] `npm run test:e2e` in `apps/api` against a local Postgres (see `apps/api/test/e2e/README.md`)
- [ ] `npm run lint` and `npm run check-types` from the root
- [ ] Manual pass on a real phone and printer: staff login → order → kitchen → bill → pay (cash + QR) → print receipt;
      scan a table QR on a phone and order as a customer.

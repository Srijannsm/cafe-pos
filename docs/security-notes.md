# Security Notes — Cafe POS System

This file tracks security decisions and requirements specific to this project.
Claude Code should read this before implementing auth, payments, or anything
touching user data.

## Authentication (not yet built)
- Staff log in via a 4-digit PIN, not a full password (fast for waiters on a
  shared tablet)
- PINs must NEVER be stored as plain text. Always hash with bcrypt (or argon2)
  before saving to the `pinHash` field on the User model
- When checking a login attempt, compare using bcrypt's compare function —
  never compare raw strings
- Because PINs are only 4 digits, the login endpoint MUST have rate limiting
  (e.g. max 5 attempts per minute per device/IP) to prevent brute-forcing —
  10,000 possible combinations is trivial to guess without this
- No "forgot PIN" self-service flow for MVP — an admin resets it manually.
  Don't build automated PIN reset via SMS/email yet

## Role-based access control
- Three roles: admin, cashier, waiter
- Every endpoint that changes data (creating orders, editing menu, applying
  discounts, changing prices) must check the logged-in user's role before
  proceeding — do not rely on the frontend hiding buttons as the only
  protection. The frontend hiding a button is a UX nicety, not a security
  control. The backend must enforce it independently
- Waiters should only be able to: create orders, add items, mark items served
- Only admin should be able to: edit menu prices, edit staff accounts, view
  full financial reports
- Cashier should be able to: generate bills, record payments — but not edit
  the menu or staff accounts

## Payments
- This system does NOT integrate with real payment gateway APIs (no eSewa/
  Khalti/FonePay API keys, no OAuth, no webhook handling)
- The `method` field on Payment is purely a label the cashier selects
  manually — treat it as informational data only, never as proof of an
  actual verified transaction
- Because of this, there is no payment fraud risk from this system directly,
  but the cashier's manual entry IS a trust point — a cashier could mark an
  unpaid order as "paid" via any method. This is an operational/staff-trust
  issue for the client to manage, not something the software can fully
  prevent at MVP stage

## Environment variables and secrets
- `.env` must NEVER be committed to git. Confirm `.env` is listed in
  `.gitignore` in every app that has one (apps/api/.gitignore)
- `DATABASE_URL` (containing the real PostgreSQL password) lives only in
  `.env`, never hardcoded in any `.ts` file
- If/when JWT tokens are added for auth sessions, the JWT secret follows
  the same rule — `.env` only, never committed, never logged to console

## Database access
- All database queries go through Prisma — never write raw string-concatenated
  SQL. Prisma's query builder parameterizes inputs automatically, which
  prevents SQL injection. If a raw query is ever genuinely necessary, it
  must use Prisma's tagged template `$queryRaw` (parameterized), never
  string concatenation
- The PostgreSQL `postgres` superuser is fine for local development, but
  before this goes to production for a real client, create a dedicated
  database user with permissions limited to only the `cafe_pos` database —
  don't run production queries as the superuser

## Data the client cares about
- Client is not VAT registered — do not log, store, or expose any VAT-related
  calculations prematurely; this could create confusing figures if the
  client's tax status changes later
- No customer personal data (names, phone numbers, loyalty info) is
  collected in the MVP — if this changes later (e.g. loyalty program in v2),
  revisit this file and add data-retention/privacy notes

## Network/deployment (for later, not needed yet)
- Once deployed for a real client, the API must be served over HTTPS only
- CORS on the NestJS backend should only allow requests from the actual
  deployed frontend domain(s) — not left wide open to any origin
- The waiter PWA and kitchen display will be used on the cafe's local WiFi —
  confirm the router itself has a non-default admin password (client-side
  responsibility, but worth mentioning during setup/training)

## What NOT to do, even if asked
- Never store card numbers, bank account numbers, or any real payment
  credentials — this system was explicitly designed to avoid touching that
  by using informal QR payments instead
- Never log a user's PIN, hashed or not, to console or file logs
- Never disable role checks "temporarily for testing" in a way that could
  accidentally ship to production
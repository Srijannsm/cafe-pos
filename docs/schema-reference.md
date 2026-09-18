# Database Schema Reference

This is the source-of-truth schema design. All Prisma models must match this.

## Tables and their purpose

- users — admin, cashier, waiter accounts. Login via PIN, not password.
- restaurant_tables — physical tables in the cafe. status: free | occupied | reserved
- menu_categories — groups menu items (Beverages, Snacks, etc.)
- menu_items — belongs to a menu_category. isAvailable can hide an item without deleting it
- modifiers — belongs to a menu_item (e.g. "Large", "Extra Shot"). priceDelta added to base price
- orders — one order = one table's current visit. orderType: dine_in | takeaway
  status: pending | preparing | served | billed | paid | cancelled
- order_items — line items within an order. HAS ITS OWN status field, independent
  of the parent order's status (a cake can be ready while coffee is still brewing)
- order_item_modifiers — join table linking an order_item to the modifiers picked
- payments — method is a plain string label (cash, esewa_qr, khalti_qr, fonepay_qr),
  NOT a real payment gateway integration

## Relationships
- menu_categories 1---* menu_items
- menu_items 1---* modifiers
- restaurant_tables 1---* orders
- users 1---* orders (as waiter)
- orders 1---* order_items
- menu_items 1---* order_items
- order_items 1---* order_item_modifiers
- modifiers 1---* order_item_modifiers
- orders 1---* payments

## Order lifecycle (what changes at each step)
1. Waiter opens table → orders row created (status: pending), table status → occupied
2. Waiter adds items → order_items rows created (status: pending)
3. Send to kitchen → orders.status → preparing
4. Kitchen marks ready → EACH order_item.status → ready (independently)
5. Waiter serves → order_items.status → served, orders.status → served
6. Cashier bills → orders.status → billed, total calculated from order_items + modifiers
7. Payment recorded → payments row created, orders.status → paid, table status → free

An order can also be cancelled instead of following the happy path: while status
is still pending (before being sent to kitchen), a waiter or admin can cancel it →
orders.status → cancelled, table status → free.
# Doors & Operators wholesale platform

Production-oriented MVP for `doorsandoperators.com`. It contains a Next.js storefront/catalog, wholesale applications, approved-account sign-in, admin/warehouse views, customer-specific price-list schema, and a server-side order endpoint with price validation and transactional stock reservation.

## Current scope and important limits

- Registration creates a **pending** customer. Only an administrator can approve an account after verifying the business.
- The schema and checkout endpoint support customer price lists and approved credit terms. Checkout currently uses base catalog price; customer price-list resolution is the next implementation increment.
- Order creation reserves inventory in a MySQL transaction. There is no cancellation/release or shipment decrement workflow yet, and no payment provider integration. Do not accept live orders until those operational workflows are implemented and reviewed.
- Card checkout always returns `card_payments_not_configured`; no environment setting enables it. No card data is collected. A real provider adapter, webhook signature verification, idempotency, refunds, and reconciliation must be implemented and tested before enabling card payments.
- Bank transfer orders are recorded as awaiting transfer. Add verified company bank instructions and a payment reconciliation process before enabling checkout for customers.
- Seed inventory is deliberately zero; add verified stock quantities through receiving before placing orders.
- cPanel MySQL remote access, firewall allow-listing, TLS options, and cross-product connectivity must be confirmed in the user's GoDaddy account. Do not assume the Node.js app can reach `localhost` MySQL on cPanel.
- Use GoDaddy's Node.js Hosting product for the app, not a generic cPanel file hosting directory. GoDaddy's deployment requirements call for a root `package.json`, non-empty `name` and `version`, `build` and `start` scripts, and runtime `PORT` binding. Do not include `.env` secrets or `node_modules` in the ZIP.

## Local setup

1. Install Node.js 20 LTS (or a compatible GoDaddy-supported version) and npm.
2. Create a MySQL database and a dedicated application user in cPanel. Grant access only to this database and use a strong unique password.
3. Copy `.env.example` to `.env.local` and set `APP_URL`, `SESSION_SECRET` (32+ random bytes), `MYSQL_HOST`, `MYSQL_PORT`, `MYSQL_DATABASE`, `MYSQL_USER`, `MYSQL_PASSWORD`. Use `MYSQL_SSL=true` only when the actual MySQL endpoint supports certificate-verified TLS.
4. Run `npm ci`, `npm run db:migrate`, `npm run db:seed`, and `npm run build`.
5. Set `ADMIN_EMAIL` and a unique `ADMIN_PASSWORD` (16+ characters) in the environment only for the one-time command, run `npm run db:create-admin`, then remove those temporary variables. Use `npm start` to run locally.

The seed creates sample product listings and a main warehouse with **zero stock**. Replace descriptions, prices, categories, SKU/part numbers and stock with verified company data.

## GoDaddy deployment ZIP

The root `package.json` includes `build`/`start` scripts and the app binds through Next's port option using `PORT`. A generated ZIP must contain the repository root files directly (not an enclosing folder), including `package.json`, `package-lock.json` when available, `src/`, `database/`, `scripts/`, and config files. Exclude `node_modules/`, `.next/`, `.env*` except `.env.example`, and secrets. Upload through the GoDaddy Node.js Hosting flow, set the environment variables in hosting settings, deploy the preview, and inspect logs before assigning the domain.

GoDaddy requirements: [Node.js app requirements](https://developer.godaddy.com/en/docs/api-users/hosting/app-requirements) and [AI-generated app upload guide](https://www.godaddy.com/en/help/upload-my-ai-generated-app-to-godaddy-nodejs-hosting-42987).

## Deployment and acceptance checklist

- [ ] Confirm Node.js version/runtime, app ZIP size limit, assigned `PORT`, environment-variable support, and startup logs in the actual hosting plan.
- [ ] Confirm cPanel MySQL hostname, remote connection policy, TLS and IP allow-listing from Node.js Hosting; test `/api/health` after deployment.
- [ ] Use a database user restricted to the app schema; do not use the cPanel account owner.
- [ ] Set `NODE_ENV=production`, the real `APP_URL`, a unique `SESSION_SECRET`, and database settings in GoDaddy's secret settings. Never upload `.env`.
- [ ] Run the migration and seed locally against a new staging database first; verify repeat migrations are safe.
- [ ] Bootstrap the first admin one time; rotate/remove bootstrap credentials. Approve only verified wholesale accounts and explicitly set any credit limit/approval.
- [ ] Verify pending accounts cannot sign in; active customers can sign in; warehouse users cannot administer accounts; only admins can view/approve customers.
- [ ] Verify catalog search/category pages, accurate prices, stock quantities and minimum order quantities.
- [ ] For orders, test concurrent attempts against low stock, minimum quantity enforcement, stale/altered submitted prices (server ignores client price), credit approval, and rollback on a failed line item.
- [ ] Implement and test reservation release on cancellation and decrement-on-shipment before using live inventory.
- [ ] Keep card disabled until a provider is selected and the server-side adapter, webhook validation, idempotency, refunds and reconciliation are fully tested. Never store PAN/CVV.
- [ ] Configure bank transfer instructions and reconcile deposits before marking orders paid.
- [ ] Verify backups and a restore, HTTPS/domain routing, monitoring, logs that omit passwords/tokens, and a rollback path before launch.

## Admin setup / known MVP increments

`/admin` provides summary/report and read-only operational pages for `/admin/products`, `/admin/inventory`, `/admin/orders`, `/admin/customers`, and `/admin/reports`. Schema includes inventory movements, multiple warehouses, price lists, customer assignments, order snapshots, payment events and status foundations. Mutation screens, staff invitations, audit trails, CSV exports, shipment/picking actions, customer price resolution, tax/shipping rules, and payments need implementation before production commerce.

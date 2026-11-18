# Project Architecture

This document describes the implementation and technical dependencies of BRICK & BUN. For an introduction to the product and its main user flows, see the [README](./README.md).

## Overview

The site is a static application built with native HTML, CSS, and JavaScript. It has no build process or project dependency manager. Pages and assets are served directly; account, ordering, and admin features communicate with external services.

```text
Root HTML ── scripts/*.js ── Supabase Auth / database / Edge Functions
    │                   │
    ├── styles/         └── Stripe Checkout (through an Edge Function)
    ├── assets/
    └── service-worker.js ── Cache API and offline fallback
```

## Project Structure

| Path | Responsibility |
| --- | --- |
| `index.html` | Home page, featured products, cart, and newsletter form |
| `menu.html` | Full product catalog |
| `login.html`, `signup.html`, `auth-callback.html` | Authentication and confirmation callback |
| `account.html` | Customer profile, addresses, orders, and notifications |
| `checkout.html` | Order review and submission |
| `admin.html` | Order and notification management |
| `privacy.html`, `terms.html`, `offline.html` | Information pages and offline fallback |
| `scripts/` | UI logic, catalog, integrations, and PWA behavior |
| `styles/style.css` | Shared styles |
| `assets/` | Images, icons, and third-party assets |
| `database/schema.sql` | Database schema, RLS policies, functions, and public menu data |
| `supabase/config.toml` | Local Supabase settings, including webhook JWT verification |
| `supabase/edge_functions/` | Source for checkout, Stripe webhook, and account deletion functions |
| `manifest.json`, `service-worker.js` | Installation metadata and caching strategy |
| `vercel.json` | Extensionless URLs and Vercel response headers |
| `dist/` | Static production copy; not generated automatically |

## Navigation and Local Development

`vercel.json` enables `cleanUrls`, so routes such as `/menu`, `/account`, and `/checkout` resolve to `.html` files. A basic static server, such as `python -m http.server`, serves the files but does not support these clean URLs.

To test the complete navigation locally, install and configure the Vercel CLI:

```bash
vercel dev
```

The project has no `package.json` or build scripts. For a basic preview, run `python -m http.server 8000` and open `/index.html` directly. This does not replace the Vercel environment for testing clean routes.

## Catalog and Cart

- `scripts/menu-catalog.js` defines the products and their images.
- `scripts/app.js` displays featured products and manages the cart on the home page.
- `scripts/menu.js` displays the full catalog.
- The cart is stored in `localStorage` and persists in the current browser between visits. It is not a confirmed order or a server-side record.
- Checkout requires a signed-in session and an eligible address before requesting a payment session.

## External Services

### Supabase

`scripts/supabase-client.js` initializes the Supabase JavaScript client. The application uses authentication, profiles, addresses, orders, notifications, and RPC operations. The project URL and `anon` key are public client configuration; they are **not** substitutes for access policies. Permissions must be enforced in Supabase, including appropriate RLS policies.

`database/schema.sql` documents the tables, indexes, Row Level Security (RLS) policies, RPC functions, and profile-creation trigger used by the app. It includes public menu data, but no customer records. The script changes the database schema; review and test it in a non-production environment before applying it to an existing database.

`supabase/edge_functions/` contains the `create-checkout-session`, `stripe-webhook`, and `delete-account` functions. These functions read credentials and perform server-side validation through environment variables; the repository should contain the code only, never the values of those variables. `supabase/config.toml` disables gateway JWT verification for `stripe-webhook`, which validates the Stripe signature in its own code. When deploying, confirm that the deployment process includes the functions under `supabase/edge_functions/`.

These folders are appropriate to commit as currently configured: they contain code and definitions needed to understand and reproduce the integration, not private credentials or customer records. Recheck files before adding them, especially `.env` files, database dumps, `service_role` keys, Stripe secrets, or real data. Store secrets in the Supabase service's environment configuration and customer data only in the database, never in Git.

### Stripe

`scripts/stripe-checkout.js` calls the `create-checkout-session` Edge Function and proceeds only to an HTTPS URL on `checkout.stripe.com`. The UI indicates that checkout is in test mode. Private keys and session creation belong in the secure server-side function; never put them in browser JavaScript.

## PWA and Offline Behavior

`manifest.json` defines the app name, icons, scope, and standalone display mode. `scripts/pwa.js` registers the service worker in a secure context and manages the persistent-storage request and cookie consent.

`service-worker.js` pre-caches a limited set of essential pages and resources. Navigation tries the network first and uses cached pages as a fallback; GET resources may be served from cache. Operations that depend on the network—including authentication, newsletter subscriptions, orders, and payments—are unavailable offline. Previously visited pages may be available offline while they remain cached.

## Deployment and Headers

The app is configured to be served from the root of a Vercel domain. `vercel.json` sets clean URLs and headers for sensitive pages, including frame protections, MIME-sniffing prevention, and referrer policies. The configured Content Security Policy is **Report-Only**: it reports violations but does not block resources.

`.vercel/` contains a local project association and should not be committed. `vercel.json` is deployment configuration without credentials and remains in the repository root.

## Production Copy

`dist/` contains a static copy of the production HTML pages and resources (`assets/`, `scripts/`, and `styles/`). There is currently no build or sync command; when updating the app, update this copy before deploying from `dist/`. Local files, documentation, and local Vercel project-association data do not belong in this copy.

# BRICK & BUN

### The burger, the Austin way.

![Brick & Bun — smash burgers made the Austin way](assets/images/og-cover.png)

BRICK & BUN is a fictional restaurant web app created as a portfolio project. It offers an ordering experience inspired by Austin, Texas: fresh smash burgers, butter-toasted brioche, and a kitchen focused on takeout.

> **Demo, not a restaurant:** Products, prices, promotions, delivery addresses, and orders are illustrative. No food is sold or delivered. Stripe checkout is configured for testing only. Do not enter real payment or personal information.

## What You Can Explore

- **Home page and brand** — learn about the kitchen, browse featured items, see sample promotions, and explore a responsive experience on desktop and mobile.
- **Full menu** — browse smash burgers, sandwiches, sides, drinks, and desserts with product descriptions and images.
- **Cart** — add products, adjust quantities, review the subtotal, and include an order note. The cart is saved in your browser and persists as you navigate.
- **Sign-in and authentication** — explore sign-up and sign-in using a password, an email code, or external providers, depending on the configured services.
- **Customer account** — manage a demo profile and delivery addresses, view orders and notifications, and try the available account-management options.
- **Stripe test checkout** — go through the payment flow using a test card. This integration depends on Supabase and Stripe test-mode configuration.
- **Admin area** — explore the order and notification management interface. Operations require an account with administrative permissions in the backend.
- **Newsletter** — try the subscription form when the corresponding function is configured.
- **PWA and offline mode** — install the app and reopen pages and resources previously saved in the cache. Authentication, checkout, and other server-side operations still require a network connection.

Account, order, and admin features are functional demos, but may not be available in every copy or environment. They depend on Supabase, its Edge Functions, and Stripe test-mode configuration. See [PROJECT_ARCHITECTURE.md](./PROJECT_ARCHITECTURE.md) for technical details.

## Try the Stripe Test Checkout

If the demo checkout is configured and Stripe Checkout opens, use these test details:

| Field | Test value |
| --- | --- |
| Card number | `4242 4242 4242 4242` |
| Expiration date | Any future date, such as `12/34` |
| CVC | Any 3-digit code, such as `123` |
| ZIP code | Any code, such as `12345` |
| Cardholder name | Any test name |

This card is for simulations in **Stripe test mode only**. Do not enter a real card, banking credentials, or real personal information. The demo does not charge money or confirm a real purchase or delivery. If checkout is not configured, these details will not enable payment by themselves.

## Run Locally

To serve the static files with Python:

```bash
python -m http.server 8000
```

Open `http://localhost:8000/index.html`. This lets you preview the pages, but a basic static server does not provide the clean URLs or configure the external services needed for authentication, orders, and checkout. See [PROJECT_ARCHITECTURE.md](./PROJECT_ARCHITECTURE.md) for the full development and deployment setup.

## Project Map

| Path | Contents |
| --- | --- |
| `index.html`, `menu.html` | Home page, featured products, and full menu |
| `login.html`, `signup.html`, `auth-callback.html` | Sign-in, sign-up, and authentication callback |
| `account.html`, `checkout.html` | Customer account and order review |
| `admin.html` | Demo admin interface |
| `privacy.html`, `terms.html`, `offline.html` | Privacy information, terms of use, and offline page |
| `scripts/`, `styles/`, `assets/` | Interactions, styles, images, and icons |
| `database/`, `supabase/` | Database schema and backend functions; see the technical documentation |
| `manifest.json`, `service-worker.js` | PWA installation and limited offline support |
| `dist/` | Copy of the static production files |

## Documentation and Code Use

- [PROJECT_ARCHITECTURE.md](./PROJECT_ARCHITECTURE.md) — structure, services, backend, local setup, and deployment.
- [TERMS_OF_USE.md](./TERMS_OF_USE.md) — terms for this portfolio demo.
- [LICENSE](./LICENSE) — custom license for viewing and learning; it does not permit code reuse or redistribution.

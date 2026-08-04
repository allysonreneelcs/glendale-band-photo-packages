# Stripe setup — Glendale band photo orders

Parents can pay online with **Stripe Checkout**. The order form stays on GitHub Pages; card charges run through a tiny **Vercel** serverless function so the Stripe **secret key never sits in the website files**.

Public order form: https://allysonreneelcs.github.io/glendale-band-photo-packages/

---

## What you need from Stripe

1. Create (or sign in to) a [Stripe account](https://dashboard.stripe.com/register).
2. In **Developers → API keys**:
   - Copy the **Secret key** (`sk_test_...` for testing, later `sk_live_...` for real payments).
   - Optionally copy the **Publishable key** (`pk_test_...` / `pk_live_...`) into `config.js` as `STRIPE_PUBLISHABLE_KEY` (not required for the current Checkout redirect flow).
3. You do **not** need to create Products/Prices in the Dashboard. The checkout API builds line items from the package and add-on quantities on each order.
4. (Optional) Turn on **Customer emails** under Settings → Customer emails so Stripe sends a receipt.

### Test cards

While using test keys, pay with card `4242 4242 4242 4242`, any future expiry, any CVC, any ZIP.

---

## Deploy the checkout API (Vercel)

1. Go to [vercel.com](https://vercel.com) and sign in (GitHub login is easiest).
2. **Add New Project** → import `allysonreneelcs/glendale-band-photo-packages`.
3. Framework preset: **Other**. Root directory: repo root. Deploy.
4. In the Vercel project → **Settings → Environment Variables**, add:

   | Name | Value |
   |------|--------|
   | `STRIPE_SECRET_KEY` | your `sk_test_...` (then later `sk_live_...`) |

5. Redeploy after saving env vars.
6. Copy your function URL, for example:

   `https://YOUR-PROJECT.vercel.app/api/create-checkout-session`

7. Edit `config.js` on the `cursor/band-photo-order-packages` branch (or main, depending on what GitHub Pages publishes):

```js
window.STRIPE_CHECKOUT_API_URL = "https://YOUR-PROJECT.vercel.app/api/create-checkout-session";
```

8. Commit and push so GitHub Pages picks up the new URL.

---

## How the payment flow works

1. Parent chooses a package + add-ons and clicks **Pay & submit order**.
2. Submit calls the Vercel API, which recalculates the total from fixed prices and creates a Stripe Checkout Session.
3. Parent pays on Stripe’s hosted page.
4. Stripe returns them to `thanks.html`. The site emails the order to **AllysonreneeLCS@gmail.com** via FormSubmit with payment marked paid (includes Stripe session id).
5. If they cancel on Stripe, they return to the form with a “payment canceled” message. No order is placed until card payment succeeds.

---

## Going live

1. In Stripe, switch to **Live mode** and copy the live secret key.
2. Update the Vercel env var `STRIPE_SECRET_KEY` to `sk_live_...` and redeploy.
3. Complete Stripe’s business verification / payouts setup so money can transfer to your bank.

---

## Security notes

- Never put `sk_...` keys in `config.js`, HTML, or git.
- Only `STRIPE_SECRET_KEY` belongs in Vercel environment variables (plus `ADMIN_TOKEN` and `BLOB_READ_WRITE_TOKEN` for the gallery — see **GALLERY-SETUP.md**).
- `pk_...` publishable keys are safe in frontend code if you use them later.

---

## Photo gallery / Lightroom codes

Per-student access codes map to Lightroom share URLs. See **[GALLERY-SETUP.md](GALLERY-SETUP.md)** for photographer workflow, env vars, and digital unlock behavior.

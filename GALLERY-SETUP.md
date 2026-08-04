# Gallery + access codes — Lightroom workflow

Parents enter a short code (like `GLEN-7K2M`) on the site. Each code maps to **one student’s Adobe Lightroom shared gallery URL**, plus a `digitalPaid` flag for download unlock.

Public gallery: `gallery.html` on GitHub Pages  
Photographer admin: `admin.html`  
API host: your Vercel project (same one as Stripe Checkout)

---

## How codes map to Lightroom

| Piece | Where it lives |
|--------|----------------|
| Access code (`GLEN-XXXX`) | Generated in Admin; stored in Vercel Blob |
| Student name / grade | Admin record |
| Lightroom gallery URL | Pasted by photographer from Lightroom share link |
| `digitalPaid` | Set by Stripe (digital-eligible package) or manually in Admin |

There is **no custom photo upload bucket**. Photos stay in Lightroom. Our site is the gate + order/payment layer.

---

## Photographer steps (Lightroom)

### A. One album per student
1. In **Lightroom Classic**: create a Collection per student, check **Sync with Lightroom**.  
   Or in **Lightroom (cloud)**: create an Album per student and put their portraits in it.
2. Open [lightroom.adobe.com](https://lightroom.adobe.com), find the album/collection.
3. Click **Share** (Share & Invite).
4. Set **Link Access** → **Anyone can view** (parents should not need an Adobe login).
5. In **Settings**:
   - Leave **Allow JPG Downloads** **OFF** until digital is paid.
   - Optionally turn off comments if you don’t want them.
6. Copy the share link (looks like `https://lightroom.adobe.com/shares/…`).

### B. Connect the code on our site
1. Open `admin.html` on the live site.
2. Sign in with `ADMIN_TOKEN` (Vercel env var).
3. Enter student name → paste Lightroom URL → **Create code**.
4. **Print code slips** and hand them out after the shoot.

### C. When digital is paid
1. Our system sets `digitalPaid` when Stripe succeeds for Digital Rights / Showcase / All-Star (if an access code was on the order), or you tap **Mark digital paid** in Admin (cash/check).
2. **Also in Lightroom**: open that album’s Share settings → turn **Allow JPG Downloads** **ON**.

Classic sync note: downloads from Classic-synced collections are often capped around **2560px**. For full-resolution digital delivery, upload/share from Lightroom cloud (Desktop/Mobile) originals, or deliver full-res another way after payment.

---

## Parent experience

1. Go to **gallery.html** (link from the order site).
2. Enter code from the slip.
3. See student name + button to **Open Lightroom gallery**.
4. If digital is **not** paid: view-only messaging + optional **Pay $20 Digital Rights**.
5. If digital **is** paid: unlocked messaging; use Lightroom’s download menu (once you enabled it).

Honest limit: phones can still screenshot. Our page only reduces casual right-click/drag saving on the wrapper. Real download control is Lightroom’s **Allow JPG Downloads** toggle.

---

## Vercel setup Allyson must do

1. Open the existing Vercel project for this repo.
2. **Storage** → Create **Blob** store → connect to this project (adds `BLOB_READ_WRITE_TOKEN`).
3. **Settings → Environment Variables**, add/confirm:

| Name | Value |
|------|--------|
| `STRIPE_SECRET_KEY` | existing `sk_test_…` / later `sk_live_…` |
| `ADMIN_TOKEN` | long random secret (password for admin.html) |
| `BLOB_READ_WRITE_TOKEN` | from Blob store (auto if connected) |

4. Redeploy after saving env vars.
5. Confirm `config.js` has:

```js
window.BAND_PHOTO_API_BASE = "https://glendale-band-photo-packages.vercel.app";
window.STRIPE_CHECKOUT_API_URL = "https://glendale-band-photo-packages.vercel.app/api/create-checkout-session";
```

6. No Adobe Developer API account is required for this MVP.

---

## Order form + Stripe unlock

- Optional **access code** field on the order form links the payment to that student’s gallery.
- Packages with digital: **Digital Rights**, **Showcase**, **All-Star**.
- After Checkout, `thanks.html` calls `/api/verify-payment`, which sets `digitalPaid` when the session includes a valid code + digital package.
- Gallery page can also buy Digital Rights alone with the code already entered.

---

## Adobe API (not used for MVP)

Adobe’s Lightroom APIs can manage albums programmatically, but need Adobe Developer credentials, OAuth, and more maintenance. Share-URL mapping is enough for band photo day. Revisit API later only if Allyson wants auto-created albums or auto download toggles.

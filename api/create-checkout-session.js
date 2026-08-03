/**
 * Vercel serverless function: creates a Stripe Checkout Session for a band photo order.
 *
 * Env vars (set in Vercel project settings — never commit these):
 *   STRIPE_SECRET_KEY  — sk_test_... or sk_live_...
 *
 * Optional:
 *   SITE_ORIGIN — e.g. https://allysonreneelcs.github.io
 *                 (used only if success/cancel URLs are relative and Origin is missing)
 */

const Stripe = require("stripe");

const PACKAGES = {
  digital: { name: "Digital Rights", unitAmount: 2000 },
  keepsake: { name: "Keepsake", unitAmount: 3500 },
  showcase: { name: "Showcase", unitAmount: 6000 },
  allstar: { name: "All-Star", unitAmount: 9500 },
};

const ADDONS = {
  addon_810: { name: "Extra 8×10", unitAmount: 1200 },
  addon_57: { name: "Extra 5×7", unitAmount: 600 },
  addon_46: { name: "Extra 4×6", unitAmount: 300 },
  addon_wallets: { name: "Extra sheet of 8 wallets", unitAmount: 600 },
  addon_1620: { name: "Extra 16×20", unitAmount: 4500 },
};

function corsHeaders(origin) {
  return {
    "Access-Control-Allow-Origin": origin || "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

function clampQty(value, max) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(Math.floor(n), max);
}

function truncate(str, max) {
  return String(str || "").trim().slice(0, max);
}

module.exports = async function handler(req, res) {
  const origin = req.headers.origin || "";
  const headers = corsHeaders(origin);

  if (req.method === "OPTIONS") {
    res.writeHead(204, headers);
    res.end();
    return;
  }

  if (req.method !== "POST") {
    res.writeHead(405, { ...headers, "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Method not allowed" }));
    return;
  }

  const secret = process.env.STRIPE_SECRET_KEY;
  if (!secret || secret.includes("REPLACE")) {
    res.writeHead(503, { ...headers, "Content-Type": "application/json" });
    res.end(JSON.stringify({
      error: "Stripe is not configured yet. Set STRIPE_SECRET_KEY in the Vercel project.",
    }));
    return;
  }

  let body = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {
      res.writeHead(400, { ...headers, "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Invalid JSON body" }));
      return;
    }
  }
  body = body || {};

  const packageKey = String(body.packageKey || "").toLowerCase();
  const pkg = PACKAGES[packageKey];
  if (!pkg) {
    res.writeHead(400, { ...headers, "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Please choose a valid photo package." }));
    return;
  }

  const student = truncate(body.student, 80);
  const parent = truncate(body.parent, 80);
  const email = truncate(body.email, 120);
  const phone = truncate(body.phone, 40);
  const grade = truncate(body.grade, 40);
  const instrument = truncate(body.instrument, 80);
  const signature = truncate(body.signature, 80);
  const date = truncate(body.date, 40);
  const successUrl = truncate(body.successUrl, 500);
  const cancelUrl = truncate(body.cancelUrl, 500);

  if (!student || !parent || !email || !phone || !signature || !date) {
    res.writeHead(400, { ...headers, "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Missing required order fields." }));
    return;
  }
  if (!successUrl || !cancelUrl || !/^https?:\/\//i.test(successUrl) || !/^https?:\/\//i.test(cancelUrl)) {
    res.writeHead(400, { ...headers, "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Valid successUrl and cancelUrl are required." }));
    return;
  }

  const lineItems = [
    {
      price_data: {
        currency: "usd",
        product_data: {
          name: `Band photo package: ${pkg.name}`,
          description: `Student: ${student}`,
        },
        unit_amount: pkg.unitAmount,
      },
      quantity: 1,
    },
  ];

  const addonParts = [];
  const addons = body.addons && typeof body.addons === "object" ? body.addons : {};
  for (const [key, info] of Object.entries(ADDONS)) {
    const qty = clampQty(addons[key], key === "addon_46" ? 40 : key === "addon_1620" ? 10 : 20);
    if (qty > 0) {
      lineItems.push({
        price_data: {
          currency: "usd",
          product_data: { name: info.name },
          unit_amount: info.unitAmount,
        },
        quantity: qty,
      });
      addonParts.push(`${qty} × ${info.name}`);
    }
  }

  const stripe = new Stripe(secret);

  try {
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      customer_email: email,
      line_items: lineItems,
      success_url: successUrl.includes("{CHECKOUT_SESSION_ID}")
        ? successUrl
        : `${successUrl}${successUrl.includes("?") ? "&" : "?"}session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: cancelUrl,
      metadata: {
        student,
        parent,
        phone,
        email,
        grade: grade || "—",
        instrument: instrument || "—",
        package: pkg.name,
        packageKey,
        addons: addonParts.length ? addonParts.join(", ").slice(0, 450) : "None",
        signature,
        date,
        source: "glendale-band-photo-order",
      },
      payment_intent_data: {
        description: `Glendale band photo — ${student} — ${pkg.name}`,
      },
    });

    res.writeHead(200, { ...headers, "Content-Type": "application/json" });
    res.end(JSON.stringify({ url: session.url, id: session.id }));
  } catch (err) {
    console.error("Stripe Checkout error:", err.message);
    res.writeHead(500, { ...headers, "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Could not start checkout. Please try again." }));
  }
};

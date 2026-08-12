/**
 * Vercel serverless function: creates a Stripe Checkout Session for a band photo order.
 *
 * Env vars (set in Vercel project settings — never commit these):
 *   STRIPE_SECRET_KEY  — sk_test_... or sk_live_...
 */

const Stripe = require("stripe");
const {
  PACKAGES,
  ADDONS,
  packageIncludesDigital,
  packageNeedsPrintSelection,
  multiPhotoPackageAmount,
  multiPhotoPricingLabel,
  packageContentsText,
  normalizeAddonAssignments,
  formatAddonPurchases,
  formatAddonsByPhoto,
  labAddonsByPhotoChecklist,
  formatDollarsFromCents,
  packagePurchasedLabel,
  labPrintChecklist,
} = require("../lib/packages");
const { formatCode } = require("../lib/codes");

function corsHeaders(origin) {
  return {
    "Access-Control-Allow-Origin": origin || "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

function truncate(str, max) {
  return String(str || "").trim().slice(0, max);
}

/** Normalize selectedPhotos from client into { id, filename, index?, label? }[], max 40. */
function normalizeSelectedPhotos(raw) {
  if (!Array.isArray(raw)) return [];
  const seen = new Set();
  const out = [];
  for (const item of raw) {
    if (out.length >= 40) break;
    let id = "";
    let filename = "";
    let index;
    let label = "";
    if (typeof item === "string") {
      id = truncate(item, 80);
      filename = id;
    } else if (item && typeof item === "object") {
      id = truncate(item.id || item.photoId || "", 80);
      filename = truncate(item.filename || item.name || id, 120);
      if (typeof item.index === "number" && item.index >= 0) index = Math.floor(item.index);
      label = truncate(item.label || "", 160);
    }
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const n = typeof index === "number" ? index : out.length;
    out.push({
      id,
      filename: filename || id,
      index: typeof index === "number" ? index : undefined,
      label: label || `Photo ${n + 1} — ${filename || id}`,
    });
  }
  return out;
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

  const accessCodeRaw = truncate(body.accessCode, 20);
  const accessCode = accessCodeRaw ? formatCode(accessCodeRaw) : "";
  if (accessCodeRaw && !/^GLEN-[A-Z0-9]{4}$/.test(accessCode)) {
    res.writeHead(400, { ...headers, "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Access code looks invalid. Use the format GLEN-7K2M." }));
    return;
  }

  // Gallery "buy digital" button (index.html) sends digitalOnly:true — no add-ons.
  // Full order form Digital Rights (packageKey=digital, digitalOnly unset) MAY include add-ons.
  const galleryDigitalUnlock = Boolean(body.digitalOnly);
  const isDigitalPackage = packageKey === "digital";
  const needsPrintSelection = packageNeedsPrintSelection(packageKey);
  const selectedPhotos = needsPrintSelection ? normalizeSelectedPhotos(body.selectedPhotos) : [];

  if (needsPrintSelection && selectedPhotos.length < 1) {
    res.writeHead(400, { ...headers, "Content-Type": "application/json" });
    res.end(JSON.stringify({
      error: "Select at least one photo to print (checkboxes under the gallery thumbnails).",
    }));
    return;
  }

  const student = truncate(body.student, 80) || (accessCode ? `Access code ${accessCode}` : "");
  const parent = truncate(body.parent, 80) || (galleryDigitalUnlock ? "Gallery digital unlock" : "");
  const email = truncate(body.email, 120);
  const phone = truncate(body.phone, 40) || (galleryDigitalUnlock ? "—" : "");
  const grade = truncate(body.grade, 40);
  const instrument = truncate(body.instrument, 80);
  const signature = truncate(body.signature, 80) || (galleryDigitalUnlock ? parent || "Gallery" : "");
  const date = truncate(body.date, 40) || new Date().toISOString().slice(0, 10);
  const successUrl = truncate(body.successUrl, 500);
  const cancelUrl = truncate(body.cancelUrl, 500);

  if (!email) {
    res.writeHead(400, { ...headers, "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Email is required." }));
    return;
  }
  if (!galleryDigitalUnlock && (!student || !parent || !phone || !signature || !date)) {
    res.writeHead(400, { ...headers, "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Missing required order fields." }));
    return;
  }
  if (galleryDigitalUnlock && packageKey === "digital" && !accessCode) {
    res.writeHead(400, { ...headers, "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Access code is required to unlock digital rights for a gallery." }));
    return;
  }
  if (!successUrl || !cancelUrl || !/^https?:\/\//i.test(successUrl) || !/^https?:\/\//i.test(cancelUrl)) {
    res.writeHead(400, { ...headers, "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Valid successUrl and cancelUrl are required." }));
    return;
  }

  const photoCountForPrice = needsPrintSelection ? selectedPhotos.length : 1;
  const packageAmount = isDigitalPackage
    ? pkg.unitAmount
    : multiPhotoPackageAmount(pkg.unitAmount, photoCountForPrice);
  const pricingLabel = isDigitalPackage
    ? "Digital Rights (full gallery)"
    : multiPhotoPricingLabel(pkg.unitAmount, photoCountForPrice);

  const packageLineName = needsPrintSelection && photoCountForPrice > 1
    ? `Band photo package: ${pkg.name} (${photoCountForPrice} photos)`
    : `Band photo package: ${pkg.name}`;

  const lineItems = [
    {
      price_data: {
        currency: "usd",
        product_data: {
          name: packageLineName,
          description: [
            accessCode ? `Student access code: ${accessCode}` : `Student: ${student}`,
            pricingLabel,
          ].filter(Boolean).join(" · ").slice(0, 450),
        },
        unit_amount: packageAmount,
      },
      quantity: 1,
    },
  ];

  const emptyAddons = { assignments: [], totalsByKey: {}, totalCents: 0 };
  for (const key of Object.keys(ADDONS)) emptyAddons.totalsByKey[key] = 0;

  // Parse client add-on claim first (used for validation even on gallery unlock).
  const clientAddonClaim = normalizeAddonAssignments(
    body.addons,
    body.addonsByPhoto,
    body.addonAssignments
  );

  // Gallery quick-buy never charges add-ons. Order-form Digital Rights does.
  const addonNormalized = galleryDigitalUnlock ? emptyAddons : clientAddonClaim;
  const addonQtyMeta = addonNormalized.totalsByKey;

  if (galleryDigitalUnlock && clientAddonClaim.totalCents > 0) {
    res.writeHead(400, { ...headers, "Content-Type": "application/json" });
    res.end(JSON.stringify({
      error: "Gallery digital unlock does not include print add-ons. Use the full order form.",
    }));
    return;
  }

  // Require a gallery photo when client claims by-photo assignments.
  if (!galleryDigitalUnlock && addonNormalized.assignments.length) {
    const missingPhoto = addonNormalized.assignments.some(
      (a) => !a.id || a.id === "unassigned"
    );
    const byPhotoObj = body.addonsByPhoto && typeof body.addonsByPhoto === "object"
      ? body.addonsByPhoto
      : null;
    const hasConcreteByPhoto =
      (Array.isArray(body.addonAssignments) &&
        body.addonAssignments.some(
          (row) => row && row.id && String(row.id) !== "unassigned" && (Number(row.qty) || 0) > 0
        )) ||
      (byPhotoObj &&
        Object.values(byPhotoObj).some((v) => {
          if (Array.isArray(v)) return v.some((row) => row && (Number(row.qty) || 0) > 0);
          if (v && typeof v === "object") {
            return Object.values(v).some((q) => {
              if (q && typeof q === "object") return (Number(q.qty) || 0) > 0;
              return (Number(q) || 0) > 0;
            });
          }
          return false;
        }));
    if (hasConcreteByPhoto && missingPhoto) {
      res.writeHead(400, { ...headers, "Content-Type": "application/json" });
      res.end(JSON.stringify({
        error: "Choose which gallery photo each add-on applies to.",
      }));
      return;
    }
  }

  let addonLineItemCount = 0;
  for (const [key, info] of Object.entries(ADDONS)) {
    const qty = addonQtyMeta[key] || 0;
    if (qty > 0) {
      const photoBits = addonNormalized.assignments
        .filter((a) => a.key === key)
        .map((a) => `${a.label || a.filename}×${a.qty}`);
      const desc = photoBits.length ? photoBits.join(", ").slice(0, 450) : undefined;
      lineItems.push({
        price_data: {
          currency: "usd",
          product_data: {
            name: info.name,
            ...(desc ? { description: desc } : {}),
          },
          unit_amount: info.unitAmount,
        },
        quantity: qty,
      });
      addonLineItemCount += 1;
    }
  }

  const addonPurchase = formatAddonPurchases(addonNormalized);
  const addonsByPhoto = formatAddonsByPhoto(addonNormalized);
  const addonCents = addonNormalized.totalCents;
  const expectedAddonKeys = Object.values(addonQtyMeta).filter((q) => q > 0).length;

  // Add-on qty/assignments must produce matching Stripe line items (server-priced).
  if (addonCents > 0 && addonLineItemCount !== expectedAddonKeys) {
    res.writeHead(400, { ...headers, "Content-Type": "application/json" });
    res.end(JSON.stringify({
      error: "Add-ons could not be added to checkout. Refresh and try again.",
    }));
    return;
  }
  if (clientAddonClaim.totalCents > 0 && !galleryDigitalUnlock && addonCents !== clientAddonClaim.totalCents) {
    res.writeHead(400, { ...headers, "Content-Type": "application/json" });
    res.end(JSON.stringify({
      error: "Add-on totals did not match. Refresh the page and try again.",
    }));
    return;
  }

  const expectedTotal = packageAmount + addonCents;
  if (body.expectedTotalCents != null && body.expectedTotalCents !== "") {
    const clientTotal = Number(body.expectedTotalCents);
    if (Number.isFinite(clientTotal) && Math.round(clientTotal) !== expectedTotal) {
      res.writeHead(400, { ...headers, "Content-Type": "application/json" });
      res.end(JSON.stringify({
        error: "Order total did not match. Refresh the page and try again.",
        expectedTotalCents: expectedTotal,
      }));
      return;
    }
  }

  const includesDigital = packageIncludesDigital(packageKey);
  const contents = packageContentsText(packageKey);
  const hasAddonPrints = addonCents > 0;
  const labChecklistBase = isDigitalPackage && !hasAddonPrints
    ? "Digital only — no lab prints"
    : labPrintChecklist(packageKey, addonNormalized, needsPrintSelection ? selectedPhotos.length : 1) || "None";
  const labAddonPhotos = hasAddonPrints ? labAddonsByPhotoChecklist(addonNormalized) : "";
  const labChecklist = labAddonPhotos
    ? `${labChecklistBase} · Add-ons by photo: ${labAddonPhotos}`
    : labChecklistBase;

  const selectedPhotosText = selectedPhotos
    .map((p, i) => p.label || `Photo ${(typeof p.index === "number" ? p.index : i) + 1} — ${p.filename}`)
    .join("; ");
  const selectedPhotoIds = selectedPhotos.map((p) => p.id).join(",");

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
        packagePrice: formatDollarsFromCents(pkg.unitAmount),
        packagePurchased: packagePurchasedLabel(packageKey).slice(0, 450),
        packageAmountCharged: formatDollarsFromCents(packageAmount),
        packageContents: contents.slice(0, 450),
        labPrintChecklist: labChecklist.slice(0, 450),
        includesDigital: includesDigital ? "1" : "0",
        // When digital is included/paid, unlock is always the whole gallery — not selectedPhotoIds.
        digitalUnlockScope: includesDigital ? "all_gallery_photos" : "none",
        accessCode: accessCode || "",
        // Aggregate names × qty = line total (e.g. Extra 8×10 ×2 = $24)
        addons: addonPurchase.summary.slice(0, 450),
        // Per-photo: Photo 1 — a.jpg: Extra 8×10 ×2 ($24); …
        addonsByPhoto: addonsByPhoto.summary.slice(0, 500),
        addonTotal: addonPurchase.totalLabel,
        expectedTotalCents: String(expectedTotal),
        selectedPhotoCount: String(needsPrintSelection ? selectedPhotos.length : (isDigitalPackage ? 0 : 1)),
        selectedPhotos: (selectedPhotosText || (isDigitalPackage ? "N/A — digital unlock (all photos)" : "—")).slice(0, 450),
        selectedPhotoIds: selectedPhotoIds.slice(0, 450),
        selectedPhotosNote: needsPrintSelection
          ? "Print selection for lab only; digital (if included) unlocks ALL gallery photos"
          : (isDigitalPackage
            ? (hasAddonPrints
              ? "Digital unlocks ALL gallery photos; add-on prints assigned below"
              : "Digital unlocks ALL gallery photos; no print selection")
            : "—"),
        multiPhotoPricing: pricingLabel.slice(0, 450),
        signature,
        date,
        source: "glendale-band-photo-order",
      },
      payment_intent_data: {
        description: accessCode
          ? `Glendale band photo — ${accessCode} — ${student} — ${pkg.name}`
          : `Glendale band photo — ${student} — ${pkg.name}`,
        receipt_email: email,
      },
    });

    res.writeHead(200, { ...headers, "Content-Type": "application/json" });
    res.end(JSON.stringify({
      url: session.url,
      id: session.id,
      // Echo server-priced totals for dry-run / client checks (no secrets).
      lineItemCount: lineItems.length,
      expectedTotalCents: expectedTotal,
      addonTotalCents: addonCents,
      addons: addonPurchase.summary,
    }));
  } catch (err) {
    console.error("Stripe Checkout error:", err.message);
    res.writeHead(500, { ...headers, "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Could not start checkout. Please try again." }));
  }
};

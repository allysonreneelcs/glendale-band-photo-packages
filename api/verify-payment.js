const Stripe = require("stripe");
const { handleOptions, sendJson, parseBody } = require("../lib/cors");
const { formatCode } = require("../lib/codes");
const { packageIncludesDigital, packageNeedsPrintSelection } = require("../lib/packages");
const { readStudent, markDigitalPaid, publicStudent } = require("../lib/store");

module.exports = async function handler(req, res) {
  const { handled, headers } = handleOptions(req, res, "POST, OPTIONS");
  if (handled) return;

  if (req.method !== "POST") {
    sendJson(res, 405, headers, { error: "Method not allowed" });
    return;
  }

  const secret = process.env.STRIPE_SECRET_KEY;
  if (!secret || secret.includes("REPLACE")) {
    sendJson(res, 503, headers, { error: "Stripe is not configured yet." });
    return;
  }

  const parsed = parseBody(req);
  if (parsed.error) {
    sendJson(res, 400, headers, { error: parsed.error });
    return;
  }

  const sessionId = String(parsed.body.sessionId || "").trim();
  if (!sessionId) {
    sendJson(res, 400, headers, { error: "Missing Stripe session id." });
    return;
  }

  try {
    const stripe = new Stripe(secret);
    const session = await stripe.checkout.sessions.retrieve(sessionId);

    if (session.payment_status !== "paid") {
      sendJson(res, 402, headers, { error: "Payment is not complete yet.", paid: false });
      return;
    }

    const meta = session.metadata || {};
    const accessCode = formatCode(meta.accessCode);
    const packageKey = String(meta.packageKey || "").toLowerCase();
    const includesDigital =
      String(meta.includesDigital || "") === "1" ||
      packageIncludesDigital(packageKey);

    let student = null;
    let unlocked = false;

    if (accessCode && /^GLEN-[A-Z0-9]{4}$/.test(accessCode) && includesDigital) {
      const existing = await readStudent(accessCode);
      if (existing) {
        if (!existing.digitalPaid) {
          student = await markDigitalPaid(accessCode, "stripe");
          unlocked = true;
        } else {
          student = existing;
          unlocked = true;
        }
      }
    }

    const amountTotal = typeof session.amount_total === "number"
      ? `$${(session.amount_total / 100).toFixed(2).replace(/\.00$/, "")}`
      : "";

    const photoIds = String(meta.selectedPhotoIds || "")
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean);
    const selectedLabels = String(meta.selectedPhotos || "")
      .split(/;\s*/)
      .map((s) => s.trim())
      .filter(Boolean)
      .filter((s) => s !== "—" && !/^N\/A/i.test(s));
    const apiBase = process.env.VERCEL_URL
      ? `https://${String(process.env.VERCEL_URL).replace(/^https?:\/\//, "")}`
      : "https://glendale-band-photo-packages.vercel.app";
    const photoPreviewLinks = accessCode && photoIds.length
      ? photoIds
          .map((id, i) => {
            const url = `${apiBase}/api/photo?code=${encodeURIComponent(accessCode)}&id=${encodeURIComponent(id)}`;
            const label = selectedLabels[i] || `Photo ${i + 1} — ${id}`;
            return `${label} — ${url}`;
          })
          .join(" | ")
      : "—";
    const galleryLink = accessCode
      ? `${apiBase.replace(/\/$/, "")}/index.html?code=${encodeURIComponent(accessCode)}`
      : "—";

    const isDigitalOnly =
      packageKey === "digital" ||
      String(meta.labPrintChecklist || "").toLowerCase().includes("digital only");
    const hasPrints = !isDigitalOnly && (
      packageNeedsPrintSelection(packageKey) ||
      /\d/.test(String(meta.labPrintChecklist || ""))
    );
    let delivery;
    if (isDigitalOnly) {
      delivery =
        "Digital Rights: ALL gallery photos are unlocked for download online. This digital-only order does not include lab prints for school delivery.";
    } else if (hasPrints && includesDigital) {
      delivery =
        "Your selected photos will be printed and then brought to the school for delivery. Digital downloads unlock ALL gallery photos online (not only the print-selected ones).";
    } else if (hasPrints) {
      delivery = "Your selected photos will be printed and then brought to the school for delivery.";
    } else {
      delivery =
        "If your package includes prints, they will be printed and then brought to the school for delivery.";
    }

    const studentLabel = meta.student || "Student";
    const packagePurchased = meta.packagePurchased
      || (meta.package
        ? `${meta.package}${meta.packagePrice ? " — " + meta.packagePrice : ""}`
        : "—");
    const addOnsPurchased = meta.addons || "None";
    const addOnsByPhoto = meta.addonsByPhoto || "None";
    const addonTotal = meta.addonTotal || "—";
    const packageAmountCharged = meta.packageAmountCharged || "—";
    const selectedPhotosForPrints = meta.selectedPhotos || "—";

    // Clear FormSubmit table labels for photographer + parent CC confirmation.
    const orderForEmail = {
      _subject: accessCode
        ? `Order confirmation — Glendale band photos — ${studentLabel} — ${accessCode}`
        : `Order confirmation — Glendale band photos — ${studentLabel}`,
      _template: "table",
      _captcha: "false",
      Student: studentLabel,
      Access_code: accessCode || "—",
      Grade: meta.grade || "—",
      Instrument: meta.instrument || "—",
      Package_purchased: packagePurchased,
      Package_contents: meta.packageContents || "—",
      Multi_photo_pricing: meta.multiPhotoPricing || "—",
      Package_amount_charged: packageAmountCharged,
      Add_ons_purchased: addOnsPurchased,
      Add_ons_by_photo: addOnsByPhoto,
      Add_on_total: addonTotal,
      Selected_photos_for_prints: selectedPhotosForPrints,
      Selected_photo_ids: meta.selectedPhotoIds || "",
      Photo_count: meta.selectedPhotoCount || "—",
      Photo_preview_links: photoPreviewLinks,
      Lab_print_checklist: meta.labPrintChecklist || "—",
      Gallery_link: galleryLink,
      Selected_photos_note: meta.selectedPhotosNote || "—",
      Delivery: delivery,
      Digital_unlock: includesDigital ? "ALL gallery photos (not only print-selected)" : "None",
      Grand_total: amountTotal || "—",
      Parent: meta.parent || "—",
      Phone: meta.phone || "—",
      Email: meta.email || session.customer_email || "—",
      Payment: `Paid online via Stripe · session ${session.id}`,
      Signature: meta.signature || "—",
      Date: meta.date || "—",
      Stripe_session: session.id,
      // Legacy aliases (merged with local sessionStorage)
      Package: packagePurchased,
      Add_ons: addOnsPurchased,
      Addon_total: addonTotal,
      Selected_photos: selectedPhotosForPrints,
      Package_total: packageAmountCharged,
    };

    sendJson(res, 200, headers, {
      paid: true,
      includesDigital,
      accessCode: accessCode || null,
      unlocked,
      student: student ? publicStudent(student) : null,
      orderForEmail,
      reminder: unlocked
        ? "Digital rights are marked paid. Parents can download ALL photos for this access code from the gallery (not only print-selected photos)."
        : includesDigital
          ? "Payment succeeded, but no matching student access code was linked. Mark digital paid in Admin if needed."
          : "Payment succeeded. This package does not include digital rights.",
    });
  } catch (err) {
    console.error("verify-payment error:", err.message);
    sendJson(res, 500, headers, { error: "Could not verify payment." });
  }
};

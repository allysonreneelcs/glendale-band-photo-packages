const Stripe = require("stripe");
const { handleOptions, sendJson, parseBody } = require("../lib/cors");
const { formatCode } = require("../lib/codes");
const { packageIncludesDigital } = require("../lib/packages");
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

    const accessCode = formatCode(session.metadata && session.metadata.accessCode);
    const packageKey = String((session.metadata && session.metadata.packageKey) || "").toLowerCase();
    const includesDigital =
      String((session.metadata && session.metadata.includesDigital) || "") === "1" ||
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

    sendJson(res, 200, headers, {
      paid: true,
      includesDigital,
      accessCode: accessCode || null,
      unlocked,
      student: student ? publicStudent(student) : null,
      reminder: unlocked
        ? "Digital rights are marked paid in our system. In Lightroom, turn ON “Allow JPG Downloads” for this student’s shared album so parents can download."
        : includesDigital
          ? "Payment succeeded, but no matching student access code was linked. Mark digital paid in Admin if needed."
          : "Payment succeeded. This package does not include digital rights.",
    });
  } catch (err) {
    console.error("verify-payment error:", err.message);
    sendJson(res, 500, headers, { error: "Could not verify payment." });
  }
};

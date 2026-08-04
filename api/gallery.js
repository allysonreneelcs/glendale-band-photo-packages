const { handleOptions, sendJson, parseBody } = require("../lib/cors");
const { formatCode } = require("../lib/codes");
const { readStudent, publicStudent } = require("../lib/store");

module.exports = async function handler(req, res) {
  const { handled, headers } = handleOptions(req, res, "GET, OPTIONS");
  if (handled) return;

  if (req.method !== "GET") {
    sendJson(res, 405, headers, { error: "Method not allowed" });
    return;
  }

  const url = new URL(req.url, "http://localhost");
  const code = formatCode(url.searchParams.get("code") || "");

  if (!/^GLEN-[A-Z0-9]{4}$/.test(code)) {
    sendJson(res, 400, headers, { error: "Enter a valid access code (for example GLEN-7K2M)." });
    return;
  }

  try {
    const student = await readStudent(code);
    if (!student) {
      sendJson(res, 404, headers, { error: "That code was not found. Check the slip and try again." });
      return;
    }
    sendJson(res, 200, headers, {
      student: publicStudent(student, { includeUrl: true }),
      tip: student.digitalPaid
        ? "Digital rights are unlocked. Use the Lightroom gallery download option if the photographer enabled it."
        : "Viewing is available. Downloads stay locked until digital rights are paid (and enabled in Lightroom).",
    });
  } catch (err) {
    console.error("gallery lookup error:", err.message);
    sendJson(res, err.status || 500, headers, {
      error: err.status === 503 ? err.message : "Could not look up that gallery. Try again shortly.",
    });
  }
};

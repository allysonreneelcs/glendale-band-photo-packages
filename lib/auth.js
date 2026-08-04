function getAdminToken() {
  return String(process.env.ADMIN_TOKEN || "").trim();
}

function extractBearer(req) {
  const header = req.headers.authorization || req.headers.Authorization || "";
  const match = String(header).match(/^Bearer\s+(.+)$/i);
  if (match) return match[1].trim();
  if (req.headers["x-admin-token"]) return String(req.headers["x-admin-token"]).trim();
  return "";
}

function requireAdmin(req) {
  const expected = getAdminToken();
  if (!expected || expected.includes("REPLACE")) {
    return { ok: false, status: 503, error: "Admin access is not configured. Set ADMIN_TOKEN in Vercel." };
  }
  const provided = extractBearer(req);
  if (!provided || provided !== expected) {
    return { ok: false, status: 401, error: "Unauthorized. Check your admin password/token." };
  }
  return { ok: true };
}

module.exports = { getAdminToken, extractBearer, requireAdmin };

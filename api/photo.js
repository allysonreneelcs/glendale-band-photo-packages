const { handleOptions, corsHeaders } = require("../lib/cors");
const { formatCode } = require("../lib/codes");
const { getStudentPhoto } = require("../lib/store");

module.exports = async function handler(req, res) {
  const origin = req.headers.origin || "";
  const headers = corsHeaders(origin, "GET, OPTIONS");

  if (req.method === "OPTIONS") {
    res.writeHead(204, headers);
    res.end();
    return;
  }

  if (req.method !== "GET") {
    res.writeHead(405, { ...headers, "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Method not allowed" }));
    return;
  }

  const url = new URL(req.url, "http://localhost");
  const code = formatCode(url.searchParams.get("code") || "");
  const photoId = String(url.searchParams.get("id") || "").trim();
  const download = url.searchParams.get("download") === "1";

  if (!/^GLEN-[A-Z0-9]{4}$/.test(code) || !photoId) {
    res.writeHead(400, { ...headers, "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Missing code or photo id." }));
    return;
  }

  try {
    const result = await getStudentPhoto(code, photoId);
    if (!result) {
      res.writeHead(404, { ...headers, "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Photo not found." }));
      return;
    }

    if (download && !result.student.digitalPaid) {
      res.writeHead(403, { ...headers, "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Downloads unlock after Digital Rights are paid." }));
      return;
    }

    const outHeaders = {
      ...headers,
      "Content-Type": result.contentType || "image/jpeg",
      "Cache-Control": "private, max-age=60",
      "X-Content-Type-Options": "nosniff",
    };
    if (download) {
      const name = (result.photo.filename || "photo.jpg").replace(/"/g, "");
      outHeaders["Content-Disposition"] = `attachment; filename="${name}"`;
    } else {
      outHeaders["Content-Disposition"] = "inline";
    }

    res.writeHead(200, outHeaders);
    for await (const chunk of result.stream) {
      res.write(chunk);
    }
    res.end();
  } catch (err) {
    console.error("photo serve error:", err.message);
    res.writeHead(err.status || 500, { ...headers, "Content-Type": "application/json" });
    res.end(JSON.stringify({
      error: err.status === 503 ? err.message : "Could not load photo.",
    }));
  }
};

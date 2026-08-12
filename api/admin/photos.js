const { handleOptions, sendJson, parseBody } = require("../../lib/cors");
const { requireAdmin } = require("../../lib/auth");
const { formatCode } = require("../../lib/codes");
const {
  addStudentPhoto,
  prepareStudentPhotoUpload,
  registerStudentPhoto,
  removeStudentPhoto,
  readStudent,
  adminStudent,
} = require("../../lib/store");

module.exports = async function handler(req, res) {
  const { handled, headers } = handleOptions(req, res, "GET, POST, DELETE, OPTIONS");
  if (handled) return;

  const auth = requireAdmin(req);
  if (!auth.ok) {
    sendJson(res, auth.status, headers, { error: auth.error });
    return;
  }

  try {
    const url = new URL(req.url, "http://localhost");
    const code = formatCode(url.searchParams.get("code") || "");

    if (req.method === "GET") {
      const student = await readStudent(code);
      if (!student) {
        sendJson(res, 404, headers, { error: "Student code not found." });
        return;
      }
      sendJson(res, 200, headers, { student: adminStudent(student) });
      return;
    }

    if (req.method === "DELETE") {
      const parsed = parseBody(req);
      if (parsed.error) {
        sendJson(res, 400, headers, { error: parsed.error });
        return;
      }
      const photoId = String(parsed.body.photoId || url.searchParams.get("photoId") || "").trim();
      const result = await removeStudentPhoto(code || formatCode(parsed.body.code), photoId);
      sendJson(res, 200, headers, result);
      return;
    }

    if (req.method === "POST") {
      const parsed = parseBody(req);
      if (parsed.error) {
        sendJson(res, 400, headers, { error: parsed.error });
        return;
      }
      const body = parsed.body;
      const studentCode = formatCode(code || body.code);
      const action = String(body.action || "").trim().toLowerCase();

      // Direct-to-Blob upload (preferred): prepare token, then register after client put.
      if (action === "prepare") {
        const result = await prepareStudentPhotoUpload(studentCode, {
          filename: body.filename || "photo.jpg",
          contentType: body.contentType || "image/jpeg",
        });
        sendJson(res, 200, headers, result);
        return;
      }

      if (action === "register") {
        const result = await registerStudentPhoto(studentCode, {
          photoId: body.photoId,
          pathname: body.pathname,
          filename: body.filename || "photo.jpg",
          contentType: body.contentType || "image/jpeg",
          size: body.size,
        });
        sendJson(res, 200, headers, result);
        return;
      }

      // Legacy JSON/base64 body (small files only; Vercel serverless limit ~4.5MB).
      const data = String(body.data || "");
      if (!data) {
        sendJson(res, 400, headers, {
          error: "Missing upload data. Use action prepare/register for photo uploads.",
        });
        return;
      }
      const base64 = data.includes(",") ? data.split(",").pop() : data;
      const buffer = Buffer.from(base64, "base64");
      const result = await addStudentPhoto(studentCode, {
        filename: body.filename || "photo.jpg",
        contentType: body.contentType || "image/jpeg",
        buffer,
      });
      sendJson(res, 200, headers, result);
      return;
    }

    sendJson(res, 405, headers, { error: "Method not allowed" });
  } catch (err) {
    console.error("admin/photos error:", err.message);
    sendJson(res, err.status || 500, headers, {
      error: err.message || "Could not update photos.",
    });
  }
};

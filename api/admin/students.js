const { handleOptions, sendJson, parseBody } = require("../../lib/cors");
const { requireAdmin } = require("../../lib/auth");
const { listStudents, createStudent } = require("../../lib/store");

module.exports = async function handler(req, res) {
  const { handled, headers } = handleOptions(req, res, "GET, POST, OPTIONS");
  if (handled) return;

  const auth = requireAdmin(req);
  if (!auth.ok) {
    sendJson(res, auth.status, headers, { error: auth.error });
    return;
  }

  try {
    if (req.method === "GET") {
      const students = await listStudents();
      sendJson(res, 200, headers, { students });
      return;
    }

    if (req.method === "POST") {
      const parsed = parseBody(req);
      if (parsed.error) {
        sendJson(res, 400, headers, { error: parsed.error });
        return;
      }
      const body = parsed.body;
      const student = await createStudent({
        studentName: body.studentName,
        grade: body.grade,
        instrument: body.instrument,
        lightroomGalleryUrl: body.lightroomGalleryUrl,
        notes: body.notes,
        dslrFiles: body.dslrFiles,
      });
      sendJson(res, 201, headers, { student });
      return;
    }

    sendJson(res, 405, headers, { error: "Method not allowed" });
  } catch (err) {
    console.error("admin/students error:", err.message);
    sendJson(res, err.status || 500, headers, {
      error: err.message || "Server error",
    });
  }
};

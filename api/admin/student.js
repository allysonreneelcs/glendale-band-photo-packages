const { handleOptions, sendJson, parseBody } = require("../../lib/cors");
const { requireAdmin } = require("../../lib/auth");
const { formatCode } = require("../../lib/codes");
const { readStudent, updateStudent, deleteStudent, adminStudent } = require("../../lib/store");

module.exports = async function handler(req, res) {
  const { handled, headers } = handleOptions(req, res, "GET, PATCH, DELETE, OPTIONS");
  if (handled) return;

  const auth = requireAdmin(req);
  if (!auth.ok) {
    sendJson(res, auth.status, headers, { error: auth.error });
    return;
  }

  try {
    const url = new URL(req.url, "http://localhost");
    let code = url.searchParams.get("code") || "";

    if (req.method === "GET") {
      code = formatCode(code);
      const student = await readStudent(code);
      if (!student) {
        sendJson(res, 404, headers, { error: "Student code not found." });
        return;
      }
      sendJson(res, 200, headers, { student: adminStudent(student) });
      return;
    }

    const parsed = parseBody(req);
    if (parsed.error) {
      sendJson(res, 400, headers, { error: parsed.error });
      return;
    }
    const body = parsed.body;
    code = formatCode(code || body.code || "");

    if (req.method === "PATCH") {
      const student = await updateStudent(code, {
        studentName: body.studentName,
        grade: body.grade,
        instrument: body.instrument,
        lightroomGalleryUrl: body.lightroomGalleryUrl,
        notes: body.notes,
        digitalPaid: body.digitalPaid,
        digitalPaidVia: body.digitalPaidVia || (body.digitalPaid ? "admin" : undefined),
      });
      sendJson(res, 200, headers, { student: adminStudent(student) });
      return;
    }

    if (req.method === "DELETE") {
      const result = await deleteStudent(code);
      sendJson(res, 200, headers, result);
      return;
    }

    sendJson(res, 405, headers, { error: "Method not allowed" });
  } catch (err) {
    console.error("admin/student error:", err.message);
    sendJson(res, err.status || 500, headers, {
      error: err.message || "Server error",
    });
  }
};

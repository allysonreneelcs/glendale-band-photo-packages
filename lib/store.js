const { put, list, del } = require("@vercel/blob");
const { formatCode, generateCode, codePath } = require("./codes");

function blobConfigured() {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN && !process.env.BLOB_READ_WRITE_TOKEN.includes("REPLACE"));
}

function assertBlob() {
  if (!blobConfigured()) {
    const err = new Error("Photo gallery storage is not configured. Set BLOB_READ_WRITE_TOKEN in Vercel (create a Blob store).");
    err.status = 503;
    throw err;
  }
}

function nowIso() {
  return new Date().toISOString();
}

function publicStudent(student, { includeUrl = true } = {}) {
  if (!student) return null;
  const out = {
    code: student.code,
    studentName: student.studentName,
    grade: student.grade || "",
    instrument: student.instrument || "",
    digitalPaid: Boolean(student.digitalPaid),
    hasGallery: Boolean(student.lightroomGalleryUrl),
  };
  if (includeUrl && student.lightroomGalleryUrl) {
    out.lightroomGalleryUrl = student.lightroomGalleryUrl;
  }
  return out;
}

function adminStudent(student) {
  if (!student) return null;
  return {
    code: student.code,
    studentName: student.studentName,
    grade: student.grade || "",
    instrument: student.instrument || "",
    lightroomGalleryUrl: student.lightroomGalleryUrl || "",
    digitalPaid: Boolean(student.digitalPaid),
    digitalPaidAt: student.digitalPaidAt || null,
    digitalPaidVia: student.digitalPaidVia || null,
    notes: student.notes || "",
    createdAt: student.createdAt,
    updatedAt: student.updatedAt,
  };
}

async function readStudent(code) {
  assertBlob();
  const formatted = formatCode(code);
  if (!/^GLEN-[A-Z0-9]{4}$/.test(formatted)) return null;
  const pathname = codePath(formatted);
  const { blobs } = await list({ prefix: pathname, limit: 5 });
  const match = blobs.find((b) => b.pathname === pathname);
  if (!match) return null;
  const res = await fetch(match.url);
  if (!res.ok) return null;
  return res.json();
}

async function writeStudent(student) {
  assertBlob();
  const formatted = formatCode(student.code);
  const record = {
    ...student,
    code: formatted,
    updatedAt: nowIso(),
  };
  await put(codePath(formatted), JSON.stringify(record, null, 2), {
    access: "public",
    contentType: "application/json",
    addRandomSuffix: false,
    allowOverwrite: true,
  });
  return record;
}

async function listStudents() {
  assertBlob();
  const students = [];
  let cursor;
  do {
    const result = await list({ prefix: "students/", cursor, limit: 1000 });
    for (const blob of result.blobs) {
      if (!blob.pathname.endsWith(".json")) continue;
      try {
        const res = await fetch(blob.url);
        if (!res.ok) continue;
        const data = await res.json();
        students.push(adminStudent(data));
      } catch {
        // skip bad records
      }
    }
    cursor = result.hasMore ? result.cursor : undefined;
  } while (cursor);
  students.sort((a, b) => String(a.studentName).localeCompare(String(b.studentName)));
  return students;
}

async function createStudent({ studentName, grade, instrument, lightroomGalleryUrl, notes }) {
  assertBlob();
  const name = String(studentName || "").trim();
  if (!name) {
    const err = new Error("Student name is required.");
    err.status = 400;
    throw err;
  }

  let code;
  let attempts = 0;
  do {
    code = generateCode();
    attempts += 1;
    // eslint-disable-next-line no-await-in-loop
    const existing = await readStudent(code);
    if (!existing) break;
    if (attempts > 20) {
      const err = new Error("Could not generate a unique code. Try again.");
      err.status = 500;
      throw err;
    }
  } while (true);

  const record = {
    code,
    studentName: name.slice(0, 120),
    grade: String(grade || "").trim().slice(0, 40),
    instrument: String(instrument || "").trim().slice(0, 80),
    lightroomGalleryUrl: sanitizeGalleryUrl(lightroomGalleryUrl),
    digitalPaid: false,
    digitalPaidAt: null,
    digitalPaidVia: null,
    notes: String(notes || "").trim().slice(0, 500),
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  return writeStudent(record);
}

function sanitizeGalleryUrl(raw) {
  const url = String(raw || "").trim();
  if (!url) return "";
  if (!/^https:\/\//i.test(url)) {
    const err = new Error("Lightroom gallery URL must start with https://");
    err.status = 400;
    throw err;
  }
  if (url.length > 800) {
    const err = new Error("Gallery URL is too long.");
    err.status = 400;
    throw err;
  }
  return url;
}

async function updateStudent(code, patch) {
  const existing = await readStudent(code);
  if (!existing) {
    const err = new Error("Student code not found.");
    err.status = 404;
    throw err;
  }

  if (patch.studentName !== undefined) {
    const name = String(patch.studentName || "").trim();
    if (!name) {
      const err = new Error("Student name cannot be empty.");
      err.status = 400;
      throw err;
    }
    existing.studentName = name.slice(0, 120);
  }
  if (patch.grade !== undefined) existing.grade = String(patch.grade || "").trim().slice(0, 40);
  if (patch.instrument !== undefined) existing.instrument = String(patch.instrument || "").trim().slice(0, 80);
  if (patch.notes !== undefined) existing.notes = String(patch.notes || "").trim().slice(0, 500);
  if (patch.lightroomGalleryUrl !== undefined) {
    existing.lightroomGalleryUrl = sanitizeGalleryUrl(patch.lightroomGalleryUrl);
  }
  if (patch.digitalPaid !== undefined) {
    const paid = Boolean(patch.digitalPaid);
    existing.digitalPaid = paid;
    if (paid) {
      existing.digitalPaidAt = existing.digitalPaidAt || nowIso();
      existing.digitalPaidVia = patch.digitalPaidVia || existing.digitalPaidVia || "admin";
    } else {
      existing.digitalPaidAt = null;
      existing.digitalPaidVia = null;
    }
  }

  return writeStudent(existing);
}

async function deleteStudent(code) {
  assertBlob();
  const existing = await readStudent(code);
  if (!existing) {
    const err = new Error("Student code not found.");
    err.status = 404;
    throw err;
  }
  await del(codePath(existing.code));
  return { deleted: true, code: existing.code };
}

async function markDigitalPaid(code, via) {
  return updateStudent(code, { digitalPaid: true, digitalPaidVia: via || "stripe" });
}

module.exports = {
  blobConfigured,
  publicStudent,
  adminStudent,
  readStudent,
  writeStudent,
  listStudents,
  createStudent,
  updateStudent,
  deleteStudent,
  markDigitalPaid,
  sanitizeGalleryUrl,
};

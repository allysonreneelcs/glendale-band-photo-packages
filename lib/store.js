const { put, list, del, get, head } = require("@vercel/blob");
const { generateClientTokenFromReadWriteToken } = require("@vercel/blob/client");
const { formatCode, generateCode, codePath, photoPath, photoPrefix } = require("./codes");

const BLOB_ACCESS = "private";
/** Max decoded image size for parent-gallery uploads (direct-to-Blob, not via serverless body). */
const MAX_PHOTO_BYTES = 25_000_000;
const ALLOWED_IMAGE_TYPE = /^image\/(jpeg|jpg|png|webp)$/i;

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

async function readJsonBlob(pathname) {
  const result = await get(pathname, { access: BLOB_ACCESS, useCache: false });
  if (!result || result.statusCode === 404 || !result.stream) return null;
  if (result.statusCode && result.statusCode >= 400) return null;

  const chunks = [];
  for await (const chunk of result.stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const text = Buffer.concat(chunks).toString("utf8");
  if (!text) return null;
  return JSON.parse(text);
}

function publicStudent(student, { includeUrl = true } = {}) {
  if (!student) return null;
  const photos = Array.isArray(student.photos) ? student.photos : [];
  const out = {
    code: student.code,
    studentName: student.studentName,
    grade: student.grade || "",
    instrument: student.instrument || "",
    digitalPaid: Boolean(student.digitalPaid),
    hasGallery: photos.length > 0 || Boolean(student.lightroomGalleryUrl),
    photoCount: photos.length,
    photos: photos.map((p) => ({
      id: p.id,
      filename: p.filename || "photo.jpg",
    })),
  };
  if (includeUrl && student.lightroomGalleryUrl) {
    out.lightroomGalleryUrl = student.lightroomGalleryUrl;
  }
  return out;
}

function adminStudent(student) {
  if (!student) return null;
  const photos = Array.isArray(student.photos) ? student.photos : [];
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
    dslrFiles: student.dslrFiles || "",
    photoCount: photos.length,
    photos,
    createdAt: student.createdAt,
    updatedAt: student.updatedAt,
  };
}

async function readStudent(code) {
  assertBlob();
  const formatted = formatCode(code);
  if (!/^GLEN-[A-Z0-9]{4}$/.test(formatted)) return null;
  try {
    return await readJsonBlob(codePath(formatted));
  } catch {
    return null;
  }
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
    access: BLOB_ACCESS,
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
        const data = await readJsonBlob(blob.pathname);
        if (data) students.push(adminStudent(data));
      } catch {
        // skip bad records
      }
    }
    cursor = result.hasMore ? result.cursor : undefined;
  } while (cursor);
  students.sort((a, b) => String(a.studentName).localeCompare(String(b.studentName)));
  return students;
}

async function createStudent({ studentName, grade, instrument, lightroomGalleryUrl, notes, dslrFiles }) {
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
    dslrFiles: String(dslrFiles || "").trim().slice(0, 1000),
    photos: [],
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
  if (patch.dslrFiles !== undefined) existing.dslrFiles = String(patch.dslrFiles || "").trim().slice(0, 1000);
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
  const photos = Array.isArray(existing.photos) ? existing.photos : [];
  for (const photo of photos) {
    try {
      // eslint-disable-next-line no-await-in-loop
      await del(photo.pathname);
    } catch {
      // ignore missing blobs
    }
  }
  await del(codePath(existing.code));
  return { deleted: true, code: existing.code };
}

async function markDigitalPaid(code, via) {
  return updateStudent(code, { digitalPaid: true, digitalPaidVia: via || "stripe" });
}

function newPhotoId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function assertImageContentType(contentType) {
  const safeType = String(contentType || "image/jpeg");
  if (!ALLOWED_IMAGE_TYPE.test(safeType)) {
    const err = new Error("Only JPEG, PNG, or WebP images are allowed.");
    err.status = 400;
    throw err;
  }
  return safeType;
}

async function prepareStudentPhotoUpload(code, { filename, contentType }) {
  assertBlob();
  const existing = await readStudent(code);
  if (!existing) {
    const err = new Error("Student code not found.");
    err.status = 404;
    throw err;
  }

  const safeType = assertImageContentType(contentType);
  const id = newPhotoId();
  const pathname = photoPath(existing.code, id, filename || "photo.jpg");
  const clientToken = await generateClientTokenFromReadWriteToken({
    pathname,
    allowedContentTypes: ["image/jpeg", "image/jpg", "image/png", "image/webp"],
    maximumSizeInBytes: MAX_PHOTO_BYTES,
    allowOverwrite: true,
    addRandomSuffix: false,
    validUntil: Date.now() + 60 * 60 * 1000,
  });

  return {
    photoId: id,
    pathname,
    clientToken,
    access: BLOB_ACCESS,
    contentType: safeType,
    maximumSizeInBytes: MAX_PHOTO_BYTES,
  };
}

async function registerStudentPhoto(code, { photoId, pathname, filename, contentType, size }) {
  assertBlob();
  const existing = await readStudent(code);
  if (!existing) {
    const err = new Error("Student code not found.");
    err.status = 404;
    throw err;
  }

  const id = String(photoId || "").trim();
  const path = String(pathname || "").trim();
  if (!id || !path) {
    const err = new Error("Missing photo id or pathname.");
    err.status = 400;
    throw err;
  }

  const expectedPrefix = photoPrefix(existing.code);
  if (!path.startsWith(expectedPrefix) || !path.includes(id)) {
    const err = new Error("Photo path does not match this student.");
    err.status = 400;
    throw err;
  }

  const safeType = assertImageContentType(contentType);
  let blobMeta;
  try {
    blobMeta = await head(path);
  } catch {
    const err = new Error("Uploaded file was not found in storage. Try uploading again.");
    err.status = 400;
    throw err;
  }

  const byteSize = Number(size) || blobMeta.size || 0;
  if (byteSize > MAX_PHOTO_BYTES) {
    const err = new Error("Each photo must be under 25MB. Export a smaller JPEG or PNG from Lightroom.");
    err.status = 400;
    throw err;
  }

  const photos = Array.isArray(existing.photos) ? existing.photos.slice() : [];
  if (photos.some((p) => p.id === id || p.pathname === path)) {
    return { student: adminStudent(existing), photo: photos.find((p) => p.id === id || p.pathname === path) };
  }

  photos.push({
    id,
    pathname: path,
    filename: String(filename || "photo.jpg").slice(0, 120),
    contentType: safeType,
    size: byteSize,
    uploadedAt: nowIso(),
  });
  existing.photos = photos;
  await writeStudent(existing);
  return { student: adminStudent(existing), photo: photos[photos.length - 1] };
}

async function addStudentPhoto(code, { filename, contentType, buffer }) {
  assertBlob();
  const existing = await readStudent(code);
  if (!existing) {
    const err = new Error("Student code not found.");
    err.status = 404;
    throw err;
  }

  const id = newPhotoId();
  const safeType = assertImageContentType(contentType);
  if (!buffer || !buffer.length) {
    const err = new Error("Empty image file.");
    err.status = 400;
    throw err;
  }
  // Legacy JSON/base64 path through the serverless function (~4.5MB body limit after encoding).
  if (buffer.length > 2_800_000) {
    const err = new Error(
      "This upload path only supports files under about 2.5MB. Use the admin uploader (direct storage upload) for larger PNG/JPEG/WebP files up to 25MB."
    );
    err.status = 400;
    throw err;
  }

  const pathname = photoPath(existing.code, id, filename || "photo.jpg");
  await put(pathname, buffer, {
    access: BLOB_ACCESS,
    contentType: safeType,
    addRandomSuffix: false,
    allowOverwrite: true,
  });

  const photos = Array.isArray(existing.photos) ? existing.photos.slice() : [];
  photos.push({
    id,
    pathname,
    filename: String(filename || "photo.jpg").slice(0, 120),
    contentType: safeType,
    size: buffer.length,
    uploadedAt: nowIso(),
  });
  existing.photos = photos;
  await writeStudent(existing);
  return { student: adminStudent(existing), photo: photos[photos.length - 1] };
}

async function removeStudentPhoto(code, photoId) {
  assertBlob();
  const existing = await readStudent(code);
  if (!existing) {
    const err = new Error("Student code not found.");
    err.status = 404;
    throw err;
  }
  const photos = Array.isArray(existing.photos) ? existing.photos.slice() : [];
  const idx = photos.findIndex((p) => p.id === photoId);
  if (idx < 0) {
    const err = new Error("Photo not found.");
    err.status = 404;
    throw err;
  }
  const [removed] = photos.splice(idx, 1);
  try {
    await del(removed.pathname);
  } catch {
    // continue even if blob already gone
  }
  existing.photos = photos;
  await writeStudent(existing);
  return { student: adminStudent(existing), deleted: removed.id };
}

async function getStudentPhoto(code, photoId) {
  assertBlob();
  const existing = await readStudent(code);
  if (!existing) return null;
  const photos = Array.isArray(existing.photos) ? existing.photos : [];
  const photo = photos.find((p) => p.id === photoId);
  if (!photo) return null;
  const result = await get(photo.pathname, { access: BLOB_ACCESS, useCache: false });
  if (!result || !result.stream) return null;
  return { student: existing, photo, stream: result.stream, contentType: photo.contentType || "image/jpeg" };
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
  MAX_PHOTO_BYTES,
  prepareStudentPhotoUpload,
  registerStudentPhoto,
  addStudentPhoto,
  removeStudentPhoto,
  getStudentPhoto,
  photoPrefix,
};

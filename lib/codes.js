const ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ"; // no 0/O/1/I

function formatCode(raw) {
  const cleaned = String(raw || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
  if (cleaned.startsWith("GLEN") && cleaned.length >= 8) {
    return `GLEN-${cleaned.slice(4, 8)}`;
  }
  if (cleaned.length === 4) return `GLEN-${cleaned}`;
  if (cleaned.startsWith("GLEN") && cleaned.length > 4) {
    return `GLEN-${cleaned.slice(4).slice(0, 4)}`;
  }
  return cleaned ? `GLEN-${cleaned.slice(0, 4)}` : "";
}

function normalizeCode(raw) {
  return formatCode(raw);
}

function generateCode() {
  let part = "";
  for (let i = 0; i < 4; i += 1) {
    part += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  return `GLEN-${part}`;
}

function codePath(code) {
  const formatted = formatCode(code);
  const key = formatted.replace(/^GLEN-/, "");
  return `students/GLEN-${key}.json`;
}

module.exports = { ALPHABET, normalizeCode, formatCode, generateCode, codePath };

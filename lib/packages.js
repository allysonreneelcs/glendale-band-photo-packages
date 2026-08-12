const PACKAGES = {
  digital: {
    name: "Digital Rights",
    unitAmount: 2000,
    includesDigital: true,
    contents: [
      "Digital downloads for ALL photos in the gallery",
      "Personal print rights",
    ],
    prints: [],
  },
  keepsake: {
    name: "Keepsake",
    unitAmount: 3500,
    includesDigital: false,
    contents: ["2 — 5×7 prints", "4 — 4×6 prints", "8 wallets", "Prints only (no digital)"],
    prints: [
      { size: "5×7", qty: 2 },
      { size: "4×6", qty: 4 },
      { size: "wallets (sheet of 8)", qty: 1 },
    ],
  },
  showcase: {
    name: "Showcase",
    unitAmount: 6000,
    includesDigital: true,
    contents: [
      "Digital downloads for ALL gallery photos",
      "1 — 8×10",
      "2 — 5×7 prints",
      "4 — 4×6 prints",
      "8 wallets",
    ],
    prints: [
      { size: "8×10", qty: 1 },
      { size: "5×7", qty: 2 },
      { size: "4×6", qty: 4 },
      { size: "wallets (sheet of 8)", qty: 1 },
    ],
  },
  allstar: {
    name: "All-Star",
    unitAmount: 9500,
    includesDigital: true,
    contents: [
      "Digital downloads for ALL gallery photos",
      "1 — 16×20 wall print",
      "2 — 8×10 prints",
      "2 — 5×7 prints",
      "8 — 4×6 prints",
      "16 wallets",
    ],
    prints: [
      { size: "16×20", qty: 1 },
      { size: "8×10", qty: 2 },
      { size: "5×7", qty: 2 },
      { size: "4×6", qty: 8 },
      { size: "wallets (sheet of 8)", qty: 2 },
    ],
  },
};

const ADDONS = {
  addon_810: { name: "Extra 8×10", unitAmount: 1200, size: "8×10", maxQty: 20 },
  addon_57: { name: "Extra 5×7", unitAmount: 600, size: "5×7", maxQty: 20 },
  addon_46: { name: "Extra 4×6", unitAmount: 300, size: "4×6", maxQty: 40 },
  addon_wallets: { name: "Extra sheet of 8 wallets", unitAmount: 600, size: "wallets (sheet of 8)", maxQty: 20 },
  addon_1620: { name: "Extra 16×20", unitAmount: 4500, size: "16×20", maxQty: 10 },
};

function packageIncludesDigital(packageKey) {
  const pkg = PACKAGES[String(packageKey || "").toLowerCase()];
  return Boolean(pkg && pkg.includesDigital);
}

/** Print packages need parent photo selection; Digital Rights unlocks the whole gallery. */
function packageNeedsPrintSelection(packageKey) {
  const pkg = PACKAGES[String(packageKey || "").toLowerCase()];
  return Boolean(pkg && Array.isArray(pkg.prints) && pkg.prints.length > 0);
}

/**
 * Multi-photo pricing: 1st selected photo = full package price;
 * each additional selected photo = +50% of the package price.
 * Returns amount in cents. selectedCount < 1 → 0.
 */
function multiPhotoPackageAmount(unitAmountCents, selectedCount) {
  const unit = Math.max(0, Math.floor(Number(unitAmountCents) || 0));
  const count = Math.max(0, Math.floor(Number(selectedCount) || 0));
  if (!unit || count < 1) return 0;
  const half = Math.round(unit * 0.5);
  return unit + half * (count - 1);
}

function multiPhotoPricingLabel(unitAmountCents, selectedCount) {
  const unit = Math.max(0, Math.floor(Number(unitAmountCents) || 0));
  const count = Math.max(0, Math.floor(Number(selectedCount) || 0));
  const dollars = (unit / 100).toFixed(0);
  if (count <= 1) {
    return count === 1
      ? `1 photo × $${dollars} package`
      : "No photos selected";
  }
  const half = (Math.round(unit * 0.5) / 100).toFixed(0);
  return `1 × $${dollars} + ${count - 1} × $${half} (50% off each extra photo)`;
}

function packageContentsText(packageKey) {
  const pkg = PACKAGES[String(packageKey || "").toLowerCase()];
  if (!pkg) return "";
  return pkg.contents.join("; ");
}

/** Format cents as $60 or $24.50 (drop trailing .00). */
function formatDollarsFromCents(cents) {
  const n = Math.max(0, Math.floor(Number(cents) || 0));
  return `$${(n / 100).toFixed(2).replace(/\.00$/, "")}`;
}

function clampAddonQty(value, addonKey) {
  const info = ADDONS[addonKey];
  const max = info && info.maxQty ? info.maxQty : 20;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(Math.floor(n), max);
}

function truncateStr(str, max) {
  return String(str || "").trim().slice(0, max);
}

/**
 * Normalize client add-on payload into per-photo assignments.
 *
 * Accepted shapes:
 * 1) Legacy totals: { addon_810: 2 }
 * 2) By-photo map: { addon_810: { photoId: 2 } } or { addon_810: [{ id, filename, qty }] }
 * 3) Explicit body.addonAssignments: [{ key, id, filename, qty }]
 * 4) body.addonsByPhoto: same as (2)
 *
 * Returns:
 * {
 *   assignments: [{ key, id, filename, qty, name, size, unitAmount, lineCents }],
 *   totalsByKey: { addon_810: 3 },
 *   totalCents,
 * }
 */
function normalizeAddonAssignments(rawAddons, rawByPhoto, rawList) {
  const assignments = [];
  const totalsByKey = {};
  const seen = new Set();

  function push(key, id, filename, qtyRaw) {
    const info = ADDONS[key];
    if (!info) return;
    const qty = clampAddonQty(qtyRaw, key);
    if (qty < 1) return;
    const photoId = truncateStr(id || filename || "unassigned", 80) || "unassigned";
    const name = truncateStr(filename || photoId, 120) || photoId;
    const dedupe = `${key}::${photoId}`;
    if (seen.has(dedupe)) return;
    seen.add(dedupe);
    totalsByKey[key] = (totalsByKey[key] || 0) + qty;
    assignments.push({
      key,
      id: photoId,
      filename: name,
      qty,
      name: info.name,
      size: info.size,
      unitAmount: info.unitAmount,
      lineCents: info.unitAmount * qty,
    });
  }

  function ingestSource(source, { allowFlat } = { allowFlat: true }) {
    if (!source || typeof source !== "object") return;
    for (const [key, value] of Object.entries(source)) {
      if (!ADDONS[key]) continue;
      if (Array.isArray(value)) {
        value.forEach((row) => {
          if (row && typeof row === "object") {
            push(key, row.id || row.photoId, row.filename || row.name, row.qty);
          } else if (typeof row === "number") {
            push(key, "unassigned", "Unassigned", row);
          }
        });
      } else if (value && typeof value === "object") {
        for (const [photoId, q] of Object.entries(value)) {
          if (q && typeof q === "object") {
            push(key, photoId || q.id, q.filename || q.name || photoId, q.qty);
          } else {
            push(key, photoId, photoId, q);
          }
        }
      } else if (allowFlat && (typeof value === "number" || typeof value === "string")) {
        if (!assignments.some((a) => a.key === key)) {
          push(key, "unassigned", "Unassigned", value);
        }
      }
    }
  }

  // Priority: explicit list → by-photo map → legacy flat totals
  if (Array.isArray(rawList) && rawList.length) {
    rawList.forEach((row) => {
      if (!row || typeof row !== "object") return;
      push(String(row.key || row.addon || ""), row.id || row.photoId, row.filename || row.name, row.qty);
    });
  } else {
    ingestSource(rawByPhoto && typeof rawByPhoto === "object" ? rawByPhoto : null, { allowFlat: false });
    if (!assignments.length) {
      ingestSource(rawAddons && typeof rawAddons === "object" ? rawAddons : {}, { allowFlat: true });
    } else {
      // by-photo may have been empty; allow nested objects inside addons
      ingestSource(rawAddons && typeof rawAddons === "object" ? rawAddons : {}, { allowFlat: false });
    }
  }

  for (const key of Object.keys(ADDONS)) {
    if (totalsByKey[key] == null) totalsByKey[key] = 0;
  }

  const totalCents = assignments.reduce((sum, a) => sum + a.lineCents, 0);
  return { assignments, totalsByKey, totalCents };
}

/**
 * Human-readable add-on purchases for emails/receipts (aggregate by size).
 * Example: "Extra 8×10 ×2 = $24; Extra 5×7 ×1 = $6"
 * Accepts legacy qty map OR normalizeAddonAssignments().totalsByKey / full result.
 */
function formatAddonPurchases(addonQtysOrResult) {
  let qtys = {};
  if (addonQtysOrResult && Array.isArray(addonQtysOrResult.assignments)) {
    qtys = addonQtysOrResult.totalsByKey || {};
  } else if (addonQtysOrResult && addonQtysOrResult.totalsByKey) {
    qtys = addonQtysOrResult.totalsByKey;
  } else {
    qtys = addonQtysOrResult && typeof addonQtysOrResult === "object" ? addonQtysOrResult : {};
  }
  const lines = [];
  let totalCents = 0;
  for (const [key, info] of Object.entries(ADDONS)) {
    const qty = Math.max(0, Math.floor(Number(qtys[key]) || 0));
    if (qty < 1) continue;
    const lineCents = info.unitAmount * qty;
    totalCents += lineCents;
    lines.push(`${info.name} ×${qty} = ${formatDollarsFromCents(lineCents)}`);
  }
  return {
    lines,
    summary: lines.length ? lines.join("; ") : "None",
    totalCents,
    totalLabel: formatDollarsFromCents(totalCents),
  };
}

/**
 * Per-photo add-on breakdown for Allyson / parent emails.
 * Example:
 * Photo "smile.jpg": Extra 8×10 ×2 ($24); Extra 5×7 ×1 ($6)
 * Photo "pose.jpg": Extra 8×10 ×1 ($12)
 */
function formatAddonsByPhoto(normalizedOrAssignments) {
  let assignments = [];
  if (normalizedOrAssignments && Array.isArray(normalizedOrAssignments.assignments)) {
    assignments = normalizedOrAssignments.assignments;
  } else if (Array.isArray(normalizedOrAssignments)) {
    assignments = normalizedOrAssignments;
  } else if (normalizedOrAssignments && typeof normalizedOrAssignments === "object") {
    assignments = normalizeAddonAssignments(normalizedOrAssignments).assignments;
  }

  if (!assignments.length) {
    return {
      lines: [],
      summary: "None",
      totalCents: 0,
      totalLabel: formatDollarsFromCents(0),
    };
  }

  const byPhoto = new Map();
  let totalCents = 0;
  assignments.forEach((a) => {
    const label = a.filename || a.id || "Photo";
    if (!byPhoto.has(label)) byPhoto.set(label, []);
    byPhoto.get(label).push(a);
    totalCents += a.lineCents || 0;
  });

  const lines = [];
  for (const [label, rows] of byPhoto.entries()) {
    const parts = rows.map(
      (r) => `${r.name} ×${r.qty} (${formatDollarsFromCents(r.lineCents)})`
    );
    lines.push(`Photo "${label}": ${parts.join("; ")}`);
  }

  return {
    lines,
    summary: lines.join(" · "),
    totalCents,
    totalLabel: formatDollarsFromCents(totalCents),
  };
}

/** Compact lab lines that include photo identity for add-ons. */
function labAddonsByPhotoChecklist(normalizedOrAssignments) {
  const formatted = formatAddonsByPhoto(normalizedOrAssignments);
  if (!formatted.lines.length) return "";
  return formatted.lines
    .map((line) =>
      line
        .replace(/^Photo "/, "")
        .replace(/": /, " → ")
        .replace(/ \([^)]+\)/g, "")
    )
    .join(" | ");
}

/** Package label for emails, e.g. "Showcase — $60". */
function packagePurchasedLabel(packageKey) {
  const pkg = PACKAGES[String(packageKey || "").toLowerCase()];
  if (!pkg) return "—";
  return `${pkg.name} — ${formatDollarsFromCents(pkg.unitAmount)}`;
}

/**
 * Lab print checklist: package prints × photoCount + add-on sizes.
 * When normalized assignments are provided, add-on qtys come from totalsByKey.
 */
function labPrintChecklist(packageKey, addons, photoCount) {
  const pkg = PACKAGES[String(packageKey || "").toLowerCase()];
  const totals = {};
  const sets = Math.max(1, Math.floor(Number(photoCount) || 1));

  function add(size, qty) {
    if (!size || !qty) return;
    totals[size] = (totals[size] || 0) + qty;
  }

  if (pkg && Array.isArray(pkg.prints)) {
    pkg.prints.forEach((row) => add(row.size, row.qty * sets));
  }

  let addonQtys = {};
  if (addons && Array.isArray(addons.assignments)) {
    addonQtys = addons.totalsByKey || {};
  } else if (addons && addons.totalsByKey) {
    addonQtys = addons.totalsByKey;
  } else {
    addonQtys = addons && typeof addons === "object" ? addons : {};
  }

  for (const [key, info] of Object.entries(ADDONS)) {
    const qty = Number(addonQtys[key]) || 0;
    if (qty > 0) add(info.size, qty);
  }

  return Object.entries(totals)
    .map(([size, qty]) => `${qty} × ${size}`)
    .join("; ");
}

module.exports = {
  PACKAGES,
  ADDONS,
  packageIncludesDigital,
  packageNeedsPrintSelection,
  multiPhotoPackageAmount,
  multiPhotoPricingLabel,
  packageContentsText,
  formatDollarsFromCents,
  clampAddonQty,
  normalizeAddonAssignments,
  formatAddonPurchases,
  formatAddonsByPhoto,
  labAddonsByPhotoChecklist,
  packagePurchasedLabel,
  labPrintChecklist,
};

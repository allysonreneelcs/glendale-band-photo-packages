const PACKAGES = {
  digital: {
    name: "Digital Rights",
    unitAmount: 2000,
    includesDigital: true,
    contents: ["High-resolution digital file", "Personal print rights"],
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
      "Digital rights included",
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
      "Digital rights included",
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
  addon_810: { name: "Extra 8×10", unitAmount: 1200, size: "8×10" },
  addon_57: { name: "Extra 5×7", unitAmount: 600, size: "5×7" },
  addon_46: { name: "Extra 4×6", unitAmount: 300, size: "4×6" },
  addon_wallets: { name: "Extra sheet of 8 wallets", unitAmount: 600, size: "wallets (sheet of 8)" },
  addon_1620: { name: "Extra 16×20", unitAmount: 4500, size: "16×20" },
};

function packageIncludesDigital(packageKey) {
  const pkg = PACKAGES[String(packageKey || "").toLowerCase()];
  return Boolean(pkg && pkg.includesDigital);
}

function packageContentsText(packageKey) {
  const pkg = PACKAGES[String(packageKey || "").toLowerCase()];
  if (!pkg) return "";
  return pkg.contents.join("; ");
}

function labPrintChecklist(packageKey, addons) {
  const pkg = PACKAGES[String(packageKey || "").toLowerCase()];
  const totals = {};

  function add(size, qty) {
    if (!size || !qty) return;
    totals[size] = (totals[size] || 0) + qty;
  }

  if (pkg && Array.isArray(pkg.prints)) {
    pkg.prints.forEach((row) => add(row.size, row.qty));
  }

  const addonQtys = addons && typeof addons === "object" ? addons : {};
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
  packageContentsText,
  labPrintChecklist,
};

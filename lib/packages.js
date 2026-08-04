const PACKAGES = {
  digital: { name: "Digital Rights", unitAmount: 2000, includesDigital: true },
  keepsake: { name: "Keepsake", unitAmount: 3500, includesDigital: false },
  showcase: { name: "Showcase", unitAmount: 6000, includesDigital: true },
  allstar: { name: "All-Star", unitAmount: 9500, includesDigital: true },
};

const ADDONS = {
  addon_810: { name: "Extra 8×10", unitAmount: 1200 },
  addon_57: { name: "Extra 5×7", unitAmount: 600 },
  addon_46: { name: "Extra 4×6", unitAmount: 300 },
  addon_wallets: { name: "Extra sheet of 8 wallets", unitAmount: 600 },
  addon_1620: { name: "Extra 16×20", unitAmount: 4500 },
};

function packageIncludesDigital(packageKey) {
  const pkg = PACKAGES[String(packageKey || "").toLowerCase()];
  return Boolean(pkg && pkg.includesDigital);
}

module.exports = { PACKAGES, ADDONS, packageIncludesDigital };

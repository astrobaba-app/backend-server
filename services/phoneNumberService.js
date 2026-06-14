const normalizeIndianMobile = (rawValue) => {
  const digits = String(rawValue || "").replace(/\D/g, "");
  if (!digits) return null;

  const withoutLeadingZeros = digits.replace(/^0+/, "");
  const candidates = [
    digits,
    withoutLeadingZeros,
    digits.slice(-10),
    withoutLeadingZeros.slice(-10),
  ];

  for (const candidate of candidates) {
    if (/^[6-9]\d{9}$/.test(candidate)) {
      return candidate;
    }
  }

  return null;
};

module.exports = {
  normalizeIndianMobile,
};

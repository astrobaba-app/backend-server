const ReportPurchase = require("../model/report/reportPurchase");

const REPORT_PURCHASE_CONFIG = {
  daily: {
    label: "Daily Horoscope & Predictions",
    amount: Number(process.env.DAILY_REPORT_PURCHASE_PRICE || process.env.DAILY_REPORT_GENERATION_PRICE || 51),
    redirectPath: "/reports/kundli_page?type=daily",
  },
  yearly: {
    label: "Yearly Vedic Forecast & Predictions",
    amount: Number(process.env.YEARLY_REPORT_PURCHASE_PRICE || process.env.YEARLY_REPORT_GENERATION_PRICE || 365),
    redirectPath: "/reports/kundli_page?type=yearly",
  },
  wealth: {
    label: "Wealth Horoscope & Prosperity Report",
    amount: Number(process.env.WEALTH_REPORT_PURCHASE_PRICE || process.env.WEALTH_REPORT_GENERATION_PRICE || 101),
    redirectPath: "/reports/kundli_page?type=wealth",
  },
  palm: {
    label: "Palmistry Report",
    amount: Number(process.env.PALM_REPORT_PURCHASE_PRICE || process.env.PALM_REPORT_PRICE || 151),
    redirectPath: "/palm-reading",
  },
};

const normalizeReportType = (reportType) => {
  const type = String(reportType || "").trim().toLowerCase();
  if (!REPORT_PURCHASE_CONFIG[type]) {
    const error = new Error("Unsupported report type");
    error.statusCode = 400;
    throw error;
  }
  return type;
};

const getReportPurchaseConfig = (reportType) => {
  const type = normalizeReportType(reportType);
  return {
    reportType: type,
    ...REPORT_PURCHASE_CONFIG[type],
  };
};

const getActiveReportPurchase = async ({ userId, reportType, accessToken = null }) => {
  const type = normalizeReportType(reportType);
  const where = {
    userId,
    reportType: type,
    status: "paid",
  };
  if (accessToken) where.accessToken = accessToken;

  return ReportPurchase.findOne({
    where,
    order: [["createdAt", "DESC"]],
  });
};

const assertReportPurchaseAccess = async ({ userId, reportType, accessToken }) => {
  if (process.env.REPORT_PURCHASE_GATE_ENABLED === "false") {
    return null;
  }

  const type = normalizeReportType(reportType);
  const token = String(accessToken || "").trim();
  if (!token) {
    const error = new Error("Please unlock this report before generating it");
    error.statusCode = 402;
    throw error;
  }

  const purchase = await getActiveReportPurchase({ userId, reportType: type, accessToken: token });
  if (!purchase) {
    const error = new Error("Report unlock not found or expired. Please unlock again.");
    error.statusCode = 402;
    throw error;
  }

  return purchase;
};

const markReportPurchaseConsumed = async (purchase, metadata = {}) => {
  if (!purchase || purchase.status === "consumed") return purchase;
  await purchase.update({
    status: "consumed",
    consumedAt: new Date(),
    metadata: {
      ...(purchase.metadata || {}),
      ...metadata,
    },
  });
  return purchase;
};

module.exports = {
  REPORT_PURCHASE_CONFIG,
  getReportPurchaseConfig,
  normalizeReportType,
  getActiveReportPurchase,
  assertReportPurchaseAccess,
  markReportPurchaseConsumed,
};

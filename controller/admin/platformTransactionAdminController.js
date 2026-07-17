const { Op } = require("sequelize");
const WalletTransaction = require("../../model/wallet/walletTransaction");
const ReportPurchase = require("../../model/report/reportPurchase");
const PalmOrder = require("../../model/palm/palmOrder");
const Order = require("../../model/store/order");
const User = require("../../model/user/userAuth");
const Wallet = require("../../model/wallet/wallet");
const { fetchExactRazorpayInstrument } = require("../../services/razorpayInstrumentHelper");

const normalizeStatus = (status) => {
  const s = String(status || "").trim().toLowerCase();
  if (!s) return "pending";
  if (s === "completed" || s === "paid" || s === "success" || s === "consumed" || s === "delivered" || s === "shipped" || s === "confirmed") {
    return "completed";
  }
  if (s === "failed" || s === "cancelled") {
    return "failed";
  }
  if (s === "refunded") {
    return "refunded";
  }
  return "pending";
};

const resolveDeductionSystem = (row, source, rawMethod) => {
  const m = String(rawMethod || "").trim().toLowerCase();
  const d = String(row.description || "").toLowerCase();

  if (row.metadata?.gatewayPaymentMethod) {
    return row.metadata.gatewayPaymentMethod;
  }
  if (m.includes("google pay") || m.includes("phonepe") || m.includes("paytm") || m.includes("amazon pay") || m.includes("upi") || m.includes("card") || m.includes("netbanking")) {
    return rawMethod;
  }
  if (m === "razorpay" || Boolean(row.razorpayPaymentId) || (Boolean(row.razorpayOrderId) && !m.includes("wallet") && !m.includes("manual"))) {
    return "Razorpay Gateway";
  }
  if (m === "cod") {
    return "Cash on Delivery (COD)";
  }

  if (source === "ai_usage" || d.includes("ai chat") || d.includes("chat usage") || row.metadata?.usageType === "ai_chat") {
    return "Graho AI Chat System (Wallet Debit)";
  }
  if (d.includes("assistant") || row.metadata?.assistantChatId) {
    return "Graho AI Assistant Plan (Wallet Debit)";
  }
  if (d.includes("voice call") || d.includes("video call") || row.metadata?.callId || d.includes("call -")) {
    return "Astrologer Call System (Wallet Debit)";
  }
  if (d.includes("live session") || row.metadata?.liveSessionId) {
    return "Astrologer Live Stream (Wallet Debit)";
  }
  if (source === "report_purchase" || d.includes("report purchase") || row.metadata?.reportPurchaseId) {
    return "Report Engine System (Wallet Debit)";
  }
  if (source === "palm_order" || d.includes("palm reading")) {
    return "Palmistry Analysis System (Wallet Debit)";
  }
  if (source === "store_order" || d.includes("store order") || row.metadata?.orderType === "store_purchase") {
    return "Astro Store System (Wallet Debit)";
  }
  if (m === "bonus" || m === "signup_bonus" || d.includes("signup bonus") || d.includes("promotional")) {
    return "Graho Reward & Bonus System";
  }
  if (m === "refund" || d.includes("refund")) {
    return "Graho Refund Engine";
  }
  if (row.type === "credit") {
    return "Admin System Credit (Adjustment)";
  }

  return "Graho Wallet System (Direct Debit)";
};

const buildLifecycleSteps = (row, source, categoryLabel, resolvedMethod) => {
  const status = normalizeStatus(row.status || row.paymentStatus || row.orderStatus);
  const steps = [];
  const amount = Number(row.amount || row.totalAmount || 0);
  const currency = row.currency || "INR";
  const rawMethod = row.paymentMethod || "razorpay";
  const paymentMethod = resolvedMethod || resolveDeductionSystem(row, source, rawMethod);
  const orderId = row.razorpayOrderId || row.orderNumber || row.id;

  // Step 1: Initiated
  steps.push({
    stepNumber: 1,
    title: "Order & Payment Initiated",
    description: `${categoryLabel} initiated for ₹${amount.toFixed(2)}`,
    status: "completed",
    timestamp: row.createdAt,
    details: {
      amount,
      currency,
      paymentMethod,
      orderId,
      couponApplied: row.metadata?.couponCode || null,
      discountAmount: Number(row.metadata?.discountAmount || row.discount || 0),
    },
  });

  // Step 2: Gateway / Verification Proceeded
  const isInternalSystem = paymentMethod.includes("System") || paymentMethod.includes("Engine") || paymentMethod.includes("Wallet") || paymentMethod.includes("Reward") || paymentMethod.includes("Adjustment");
  const hasGatewayAttempt = Boolean(row.razorpayOrderId || row.razorpayPaymentId || row.transactionId || isInternalSystem);

  steps.push({
    stepNumber: 2,
    title: isInternalSystem
      ? `${paymentMethod} Verification`
      : paymentMethod.includes("COD") || paymentMethod === "cod"
      ? "Cash on Delivery Order Confirmation"
      : "Razorpay Payment Gateway Processing",
    description: isInternalSystem
      ? `System balance deduction & service access verified via ${paymentMethod} (Balance Before: ₹${row.balanceBefore ?? "N/A"})`
      : paymentMethod.includes("COD") || paymentMethod === "cod"
      ? `Order confirmed for Cash on Delivery (Order #${row.orderNumber || row.id})`
      : `Proceeded to Razorpay Gateway (Order: ${row.razorpayOrderId || row.transactionId || "Pending"})`,
    status: hasGatewayAttempt ? "completed" : "pending",
    timestamp: row.metadata?.capturedAt || row.metadata?.failedAt || row.updatedAt || row.createdAt,
    details: {
      gatewayOrderId: row.razorpayOrderId || (typeof row.transactionId === "string" ? row.transactionId : null) || null,
      gatewayPaymentId: row.razorpayPaymentId || null,
      signatureVerified: Boolean(row.razorpaySignature),
    },
  });

  // Step 3: Final Outcome & Diagnostics
  if (status === "completed") {
    steps.push({
      stepNumber: 3,
      title: "Transaction Successful",
      description: `Payment captured & verified successfully via ${paymentMethod}.`,
      status: "completed",
      timestamp: row.metadata?.capturedAt || row.updatedAt || row.createdAt,
      details: {
        outcome: "Success",
        capturedAt: row.metadata?.capturedAt || row.updatedAt,
        balanceAfter: row.balanceAfter ?? row.metadata?.walletBalanceAfter ?? null,
      },
    });
  } else if (status === "failed") {
    const errorDesc =
      row.metadata?.errorDescription ||
      row.metadata?.errorReason ||
      row.lastFailureReason ||
      row.cancellationReason ||
      "Payment verification failed or cancelled during checkout.";
    const errorCode =
      row.metadata?.errorCode ||
      (String(errorDesc).toLowerCase().includes("cancel") ? "USER_CANCELLED" : "GATEWAY_PAYMENT_FAILED");
    steps.push({
      stepNumber: 3,
      title: String(row.status || "").toLowerCase().includes("cancel") ? "Transaction Cancelled" : "Payment Failed",
      description: errorDesc,
      status: "failed",
      timestamp: row.metadata?.failedAt || row.updatedAt || row.createdAt,
      details: {
        outcome: String(row.status || "").toLowerCase().includes("cancel") ? "Cancelled" : "Failed",
        errorCode,
        errorDescription: errorDesc,
        errorReason: row.metadata?.errorReason || null,
        failedAt: row.metadata?.failedAt || row.updatedAt,
      },
    });
  } else if (status === "refunded") {
    steps.push({
      stepNumber: 3,
      title: "Transaction Refunded",
      description: `Payment was refunded to user via ${paymentMethod}.`,
      status: "completed",
      timestamp: row.updatedAt || row.createdAt,
      details: {
        outcome: "Refunded",
        refundedAt: row.updatedAt,
      },
    });
  } else {
    steps.push({
      stepNumber: 3,
      title: "Pending Verification / Payment",
      description: "Awaiting payment capture or webhook confirmation.",
      status: "pending",
      timestamp: row.updatedAt || row.createdAt,
      details: {
        outcome: "Pending",
      },
    });
  }

  return steps;
};

const formatUserObject = (userRow) => {
  if (!userRow) return null;
  const walletRow = userRow.wallet || {};
  return {
    id: userRow.id,
    name: userRow.fullName || null,
    email: userRow.email || null,
    mobile: userRow.mobile || null,
    currentBalance: Number(walletRow.balance || 0),
    totalRecharge: Number(walletRow.totalRecharge || 0),
    totalSpent: Number(walletRow.totalSpent || 0),
    registeredAt: userRow.createdAt || null,
  };
};

const getPlatformRazorpayTransactions = async (req, res) => {
  try {
    const page = Math.max(1, Number(req.query.page || 1));
    const limit = Math.min(200, Math.max(1, Number(req.query.limit || 50)));
    const offset = (page - 1) * limit;
    const statusFilter = String(req.query.status || "").trim().toLowerCase();
    const typeFilter = String(req.query.type || "").trim().toLowerCase();
    const categoryFilter = String(req.query.category || req.query.source || "").trim().toLowerCase();
    const paymentMethodFilter = String(req.query.paymentMethod || "").trim().toLowerCase();
    const q = String(req.query.q || "").trim();
    const dateFrom = String(req.query.dateFrom || "").trim();
    const dateTo = String(req.query.dateTo || "").trim();

    let matchingUserIds = null;
    if (q) {
      const matchedUsers = await User.findAll({
        where: {
          [Op.or]: [
            { fullName: { [Op.iLike]: `%${q}%` } },
            { email: { [Op.iLike]: `%${q}%` } },
            { mobile: { [Op.iLike]: `%${q}%` } },
          ],
        },
        attributes: ["id"],
      });
      matchingUserIds = matchedUsers.map((u) => u.id);
    }

    const buildWhereClause = (customFields = {}) => {
      const where = { ...customFields };

      if (dateFrom || dateTo) {
        where.createdAt = {};
        if (dateFrom) where.createdAt[Op.gte] = new Date(dateFrom);
        if (dateTo) {
          const endDate = new Date(dateTo);
          endDate.setHours(23, 59, 59, 999);
          where.createdAt[Op.lte] = endDate;
        }
      }

      if (paymentMethodFilter && paymentMethodFilter !== "all") {
        where.paymentMethod = paymentMethodFilter;
      }

      if (q) {
        const orList = [
          { razorpayOrderId: { [Op.iLike]: `%${q}%` } },
          { razorpayPaymentId: { [Op.iLike]: `%${q}%` } },
        ];
        if (customFields._hasDescription) {
          orList.push({ description: { [Op.iLike]: `%${q}%` } });
        }
        if (customFields._hasOrderNumber) {
          orList.push({ orderNumber: { [Op.iLike]: `%${q}%` } });
        }
        if (matchingUserIds && matchingUserIds.length > 0) {
          orList.push({ userId: { [Op.in]: matchingUserIds } });
        }
        where[Op.or] = orList;
      }

      delete where._hasDescription;
      delete where._hasOrderNumber;
      return where;
    };

    const userInclude = [
      {
        model: User,
        as: "user",
        required: false,
        attributes: ["id", "fullName", "email", "mobile", "createdAt"],
        include: [
          {
            model: Wallet,
            as: "wallet",
            required: false,
            attributes: ["balance", "totalRecharge", "totalSpent"],
          },
        ],
      },
    ];

    const allItems = [];

    // 1. Wallet Transactions (Recharges & AI/Consultation debits)
    const shouldFetchWallet = !categoryFilter || categoryFilter === "all" || categoryFilter === "wallet_recharge" || categoryFilter === "ai_usage" || categoryFilter === "consultation";
    if (shouldFetchWallet) {
      const walletWhere = buildWhereClause({ _hasDescription: true });
      if (!categoryFilter || categoryFilter === "all" || categoryFilter === "wallet_recharge") {
        walletWhere.type = "credit";
      } else if (categoryFilter === "ai_usage" || categoryFilter === "consultation") {
        walletWhere.type = "debit";
      }

      const walletRows = await WalletTransaction.findAll({
        where: walletWhere,
        include: userInclude,
        order: [["createdAt", "DESC"]],
        limit: 3000,
      });

      walletRows.forEach((row) => {
        const amount = Number(row.amount || 0);
        const normStatus = normalizeStatus(row.status);
        if (statusFilter && statusFilter !== "all" && normStatus !== statusFilter) return;
        if (typeFilter && typeFilter !== "all" && row.type !== typeFilter) return;

        const isRecharge = row.type === "credit";
        const isAi = row.type === "debit" && String(row.description || "").toLowerCase().includes("ai");
        const source = isRecharge ? "wallet_recharge" : isAi ? "ai_usage" : "consultation";
        if (categoryFilter && categoryFilter !== "all" && categoryFilter !== source) return;

        const categoryLabel = isRecharge ? "Wallet Recharge" : isAi ? "AI Usage Debit" : "Wallet Payment";

        const resolvedMethod = resolveDeductionSystem(row, source, row.paymentMethod || (isRecharge ? "razorpay" : "manual"));
        allItems.push({
          id: row.id,
          source,
          categoryLabel,
          amount,
          currency: "INR",
          type: row.type,
          status: normStatus,
          rawStatus: row.status,
          paymentMethod: resolvedMethod,
          description: row.description || categoryLabel,
          razorpayOrderId: row.razorpayOrderId || null,
          razorpayPaymentId: row.razorpayPaymentId || null,
          createdAt: row.createdAt,
          updatedAt: row.updatedAt,
          balanceBefore: row.balanceBefore ?? null,
          balanceAfter: row.balanceAfter ?? null,
          user: formatUserObject(row.user),
          metadata: row.metadata || {},
          steps: buildLifecycleSteps(row, source, categoryLabel, resolvedMethod),
        });
      });
    }

    // 2. Report Purchases
    const shouldFetchReports = !categoryFilter || categoryFilter === "all" || categoryFilter === "report_purchase";
    if (shouldFetchReports) {
      const reportWhere = buildWhereClause();
      const reportRows = await ReportPurchase.findAll({
        where: reportWhere,
        include: userInclude,
        order: [["createdAt", "DESC"]],
        limit: 2000,
      });

      reportRows.forEach((row) => {
        const amount = Number(row.amount || 0);
        const normStatus = normalizeStatus(row.status);
        if (statusFilter && statusFilter !== "all" && normStatus !== statusFilter) return;
        if (typeFilter && typeFilter !== "all" && typeFilter !== "purchase" && typeFilter !== "debit") return;

        const categoryLabel = `${String(row.reportType || "Astrology").charAt(0).toUpperCase() + String(row.reportType || "Astrology").slice(1)} Report Purchase`;
        const resolvedMethod = resolveDeductionSystem(row, "report_purchase", row.paymentMethod || "razorpay");
        allItems.push({
          id: row.id,
          source: "report_purchase",
          categoryLabel,
          amount,
          currency: row.currency || "INR",
          type: "purchase",
          status: normStatus,
          rawStatus: row.status,
          paymentMethod: resolvedMethod,
          description: `${categoryLabel} (₹${amount})`,
          razorpayOrderId: row.razorpayOrderId || null,
          razorpayPaymentId: row.razorpayPaymentId || null,
          createdAt: row.createdAt,
          updatedAt: row.updatedAt,
          balanceBefore: row.metadata?.walletBalanceBefore ?? null,
          balanceAfter: row.metadata?.walletBalanceAfter ?? null,
          user: formatUserObject(row.user),
          metadata: row.metadata || {},
          steps: buildLifecycleSteps(row, "report_purchase", categoryLabel, resolvedMethod),
        });
      });
    }

    // 3. Palm Orders
    const shouldFetchPalm = !categoryFilter || categoryFilter === "all" || categoryFilter === "palm_order";
    if (shouldFetchPalm) {
      const palmWhere = buildWhereClause();
      const palmRows = await PalmOrder.findAll({
        where: palmWhere,
        include: userInclude,
        order: [["createdAt", "DESC"]],
        limit: 2000,
      });

      palmRows.forEach((row) => {
        const amount = Number(row.amount || 0);
        const normStatus = normalizeStatus(row.status);
        if (statusFilter && statusFilter !== "all" && normStatus !== statusFilter) return;
        if (typeFilter && typeFilter !== "all" && typeFilter !== "purchase" && typeFilter !== "debit") return;

        const categoryLabel = "Palm Reading Order";

        const resolvedMethod = resolveDeductionSystem(row, "palm_order", row.paymentMethod || "razorpay");
        allItems.push({
          id: row.id,
          source: "palm_order",
          categoryLabel,
          amount,
          currency: "INR",
          type: "purchase",
          status: normStatus,
          rawStatus: row.status,
          paymentMethod: resolvedMethod,
          description: `Palm Reading Analysis (₹${amount})`,
          razorpayOrderId: row.razorpayOrderId || null,
          razorpayPaymentId: row.razorpayPaymentId || null,
          createdAt: row.createdAt,
          updatedAt: row.updatedAt,
          balanceBefore: null,
          balanceAfter: null,
          user: formatUserObject(row.user),
          metadata: {
            retriesUsed: row.retriesUsed,
            lastFailureReason: row.lastFailureReason,
            idempotencyKey: row.idempotencyKey,
          },
          steps: buildLifecycleSteps(row, "palm_order", categoryLabel, resolvedMethod),
        });
      });
    }

    // 4. Store Orders
    const shouldFetchStore = !categoryFilter || categoryFilter === "all" || categoryFilter === "store_order";
    if (shouldFetchStore) {
      const storeWhere = buildWhereClause({ _hasOrderNumber: true });
      const storeRows = await Order.findAll({
        where: storeWhere,
        include: userInclude,
        order: [["createdAt", "DESC"]],
        limit: 2000,
      });

      storeRows.forEach((row) => {
        const amount = Number(row.totalAmount || row.subtotal || 0);
        const normStatus = normalizeStatus(row.paymentStatus || row.orderStatus);
        if (statusFilter && statusFilter !== "all" && normStatus !== statusFilter) return;
        if (typeFilter && typeFilter !== "all" && typeFilter !== "purchase" && typeFilter !== "debit") return;

        const categoryLabel = `Store Order (${row.orderNumber || row.id.slice(0, 8)})`;

        const resolvedMethod = resolveDeductionSystem(row, "store_order", row.paymentMethod || "razorpay");
        allItems.push({
          id: row.id,
          source: "store_order",
          categoryLabel,
          amount,
          currency: "INR",
          type: "purchase",
          status: normStatus,
          rawStatus: row.paymentStatus || row.orderStatus,
          paymentMethod: resolvedMethod,
          description: `E-Commerce Store Order #${row.orderNumber || ""}`,
          razorpayOrderId: typeof row.transactionId === "string" && row.transactionId.startsWith("order_") ? row.transactionId : null,
          razorpayPaymentId: typeof row.transactionId === "string" && row.transactionId.startsWith("pay_") ? row.transactionId : null,
          createdAt: row.createdAt,
          updatedAt: row.updatedAt,
          balanceBefore: null,
          balanceAfter: null,
          user: formatUserObject(row.user),
          metadata: {
            orderNumber: row.orderNumber,
            orderType: row.orderType,
            orderStatus: row.orderStatus,
            itemsCount: Array.isArray(row.items) ? row.items.length : 0,
            shippingCharges: Number(row.shippingCharges || 0),
            discount: Number(row.discount || 0),
          },
          steps: buildLifecycleSteps(row, "store_order", categoryLabel, resolvedMethod),
        });
      });
    }

    // Sort combined items by createdAt DESC
    allItems.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    // Compute Analytics across all matched items
    let totalVolume = 0;
    let completedVolume = 0;
    let failedVolume = 0;
    let pendingVolume = 0;
    let completedCount = 0;
    let failedCount = 0;
    let pendingCount = 0;

    const categoryStats = {
      "Wallet Recharge": { count: 0, amount: 0 },
      "Report Purchase": { count: 0, amount: 0 },
      "Palm Reading": { count: 0, amount: 0 },
      "Store Order": { count: 0, amount: 0 },
      "AI & Consultations": { count: 0, amount: 0 },
    };

    const methodStats = {
      Razorpay: { count: 0, amount: 0 },
      Wallet: { count: 0, amount: 0 },
      "Manual/COD": { count: 0, amount: 0 },
    };

    const dailyMap = {};

    allItems.forEach((item) => {
      const amt = Number(item.amount || 0);
      totalVolume += amt;

      if (item.status === "completed") {
        completedVolume += amt;
        completedCount += 1;
      } else if (item.status === "failed") {
        failedVolume += amt;
        failedCount += 1;
      } else {
        pendingVolume += amt;
        pendingCount += 1;
      }

      // Category breakdown
      if (item.source === "wallet_recharge") {
        categoryStats["Wallet Recharge"].count += 1;
        categoryStats["Wallet Recharge"].amount += amt;
      } else if (item.source === "report_purchase") {
        categoryStats["Report Purchase"].count += 1;
        categoryStats["Report Purchase"].amount += amt;
      } else if (item.source === "palm_order") {
        categoryStats["Palm Reading"].count += 1;
        categoryStats["Palm Reading"].amount += amt;
      } else if (item.source === "store_order") {
        categoryStats["Store Order"].count += 1;
        categoryStats["Store Order"].amount += amt;
      } else {
        categoryStats["AI & Consultations"].count += 1;
        categoryStats["AI & Consultations"].amount += amt;
      }

      // Payment method breakdown
      if (item.paymentMethod === "razorpay") {
        methodStats["Razorpay"].count += 1;
        methodStats["Razorpay"].amount += amt;
      } else if (item.paymentMethod === "wallet") {
        methodStats["Wallet"].count += 1;
        methodStats["Wallet"].amount += amt;
      } else {
        methodStats["Manual/COD"].count += 1;
        methodStats["Manual/COD"].amount += amt;
      }

      // Daily trend (last 14 days or filtered period)
      const dateKey = new Date(item.createdAt).toISOString().slice(0, 10);
      if (!dailyMap[dateKey]) {
        dailyMap[dateKey] = { date: dateKey, completedAmount: 0, failedAmount: 0, completedCount: 0, failedCount: 0 };
      }
      if (item.status === "completed") {
        dailyMap[dateKey].completedAmount += amt;
        dailyMap[dateKey].completedCount += 1;
      } else if (item.status === "failed") {
        dailyMap[dateKey].failedAmount += amt;
        dailyMap[dateKey].failedCount += 1;
      }
    });

    // Format daily trends sorted ascending by date
    const dailyTrends = Object.values(dailyMap)
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(-14)
      .map((d) => {
        const dt = new Date(d.date);
        const label = dt.toLocaleDateString("en-IN", { month: "short", day: "numeric" });
        return {
          date: d.date,
          label,
          completedAmount: Math.round(d.completedAmount * 100) / 100,
          failedAmount: Math.round(d.failedAmount * 100) / 100,
          completedCount: d.completedCount,
          failedCount: d.failedCount,
        };
      });

    const paginatedItems = allItems.slice(offset, offset + limit);

    await Promise.all(
      paginatedItems.map(async (item) => {
        if (
          item.razorpayPaymentId &&
          (item.paymentMethod === "Razorpay Gateway" || item.paymentMethod === "razorpay" || !item.paymentMethod)
        ) {
          const exactInstrument = await fetchExactRazorpayInstrument(item.razorpayPaymentId);
          if (exactInstrument && exactInstrument !== "Razorpay Gateway") {
            item.paymentMethod = exactInstrument;
            if (Array.isArray(item.steps) && item.steps.length >= 2) {
              item.steps[1].title = `Payment Method: ${exactInstrument}`;
              item.steps[1].description = `Verified payment via Razorpay Gateway (${exactInstrument}). Payment ID: ${item.razorpayPaymentId}`;
            }
          }
        }
      })
    );

    return res.status(200).json({
      success: true,
      transactions: paginatedItems,
      pagination: {
        total: allItems.length,
        page,
        limit,
        totalPages: Math.ceil(allItems.length / limit) || 1,
      },
      analytics: {
        summary: {
          totalVolume: Math.round(totalVolume * 100) / 100,
          completedVolume: Math.round(completedVolume * 100) / 100,
          failedVolume: Math.round(failedVolume * 100) / 100,
          pendingVolume: Math.round(pendingVolume * 100) / 100,
          totalCount: allItems.length,
          completedCount,
          failedCount,
          pendingCount,
          successRate: allItems.length > 0 ? Math.round((completedCount / allItems.length) * 1000) / 10 : 0,
        },
        statusComparison: [
          { status: "Completed", count: completedCount, amount: Math.round(completedVolume * 100) / 100 },
          { status: "Failed", count: failedCount, amount: Math.round(failedVolume * 100) / 100 },
          { status: "Pending", count: pendingCount, amount: Math.round(pendingVolume * 100) / 100 },
        ],
        categoryBreakdown: Object.entries(categoryStats).map(([key, val]) => ({
          category: key,
          count: val.count,
          amount: Math.round(val.amount * 100) / 100,
        })),
        paymentMethodBreakdown: Object.entries(methodStats).map(([key, val]) => ({
          method: key,
          count: val.count,
          amount: Math.round(val.amount * 100) / 100,
        })),
        dailyTrends,
      },
    });
  } catch (error) {
    console.error("Get platform razorpay transactions error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch platform transactions",
      error: error.message,
    });
  }
};

module.exports = { getPlatformRazorpayTransactions };



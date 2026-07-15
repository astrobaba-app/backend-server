const { Op } = require("sequelize");
const { sequelize } = require("../dbConnection/dbConfig");
const ChatSession = require("../model/chat/chatSession");
const FreeChatAllocation = require("../model/freeChat/freeChatAllocation");
const User = require("../model/user/userAuth");
const Admin = require("../model/admin/admin");

const FREE_CHAT_TYPES = Object.freeze({
  AI: "ai",
  REAL: "real",
  BOTH: "both",
});

const FREE_CHAT_STATUSES = Object.freeze({
  ACTIVE: "active",
  CONSUMED: "consumed",
  REVOKED: "revoked",
});

const CHAT_BILLING_SOURCES = Object.freeze({
  WALLET: "wallet",
  FREE_CHAT: "free_chat",
});

const WELCOME_FREE_CHAT_MINUTES = Math.max(
  1,
  Number.parseInt(process.env.WELCOME_FREE_CHAT_MINUTES || "2", 10) || 2
);

const WELCOME_FREE_CHAT_CAMPAIGN = "welcome_free_chat";

let cachedSystemGrantAdminId = null;

const normalizeFreeChatType = (value) => {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === FREE_CHAT_TYPES.AI) return FREE_CHAT_TYPES.AI;
  if (normalized === FREE_CHAT_TYPES.REAL) return FREE_CHAT_TYPES.REAL;
  return FREE_CHAT_TYPES.BOTH;
};

const isFreeChatSession = (sessionLike) =>
  String(sessionLike?.billingSource || "").toLowerCase() ===
  CHAT_BILLING_SOURCES.FREE_CHAT;

const getApplicableTypesForChat = (chatType) => {
  const normalized = normalizeFreeChatType(chatType);
  if (normalized === FREE_CHAT_TYPES.AI) {
    return [FREE_CHAT_TYPES.AI, FREE_CHAT_TYPES.BOTH];
  }

  return [FREE_CHAT_TYPES.REAL, FREE_CHAT_TYPES.BOTH];
};

const calculateFreeChatWindow = (minutes, startTime = new Date()) => {
  const normalizedMinutes = Math.max(1, Number.parseInt(String(minutes), 10) || 1);
  const startedAt = startTime instanceof Date ? startTime : new Date(startTime);
  const maxDurationSeconds = normalizedMinutes * 60;

  return {
    maxDurationSeconds,
    maxEndTime: new Date(startedAt.getTime() + maxDurationSeconds * 1000),
  };
};

const buildFreeChatSessionFields = (allocation, startTime = new Date()) => {
  const timeWindow = calculateFreeChatWindow(allocation?.minutes, startTime);

  return {
    billingSource: CHAT_BILLING_SOURCES.FREE_CHAT,
    freeChatAllocationId: allocation?.id || null,
    freeChatMinutes: Number(allocation?.minutes || 0) || null,
    maxDurationSeconds: timeWindow.maxDurationSeconds,
    maxEndTime: timeWindow.maxEndTime,
  };
};

const getAvailableFreeChatAllocation = async (
  userId,
  chatType,
  transaction
) => {
  if (!userId) {
    return null;
  }

  return FreeChatAllocation.findOne({
    where: {
      userId,
      status: FREE_CHAT_STATUSES.ACTIVE,
      applicableChatType: {
        [Op.in]: getApplicableTypesForChat(chatType),
      },
      [Op.or]: [{ expiresAt: null }, { expiresAt: { [Op.gt]: new Date() } }],
    },
    order: [
      ["createdAt", "ASC"],
      ["id", "ASC"],
    ],
    transaction,
    lock: transaction ? transaction.LOCK.UPDATE : undefined,
  });
};

const consumeFreeChatAllocation = async (
  {
    allocationId,
    userId,
    sessionId,
    sessionKind,
    chatType,
  },
  transaction
) => {
  if (!allocationId || !userId || !sessionId) {
    throw new Error("Allocation, user, and session are required to consume free chat");
  }

  const allocation = await FreeChatAllocation.findOne({
    where: {
      id: allocationId,
      userId,
      status: FREE_CHAT_STATUSES.ACTIVE,
      [Op.or]: [{ expiresAt: null }, { expiresAt: { [Op.gt]: new Date() } }],
    },
    transaction,
    lock: transaction ? transaction.LOCK.UPDATE : undefined,
  });

  if (!allocation) {
    throw new Error("Free chat allocation is no longer available");
  }

  await allocation.update(
    {
      status: FREE_CHAT_STATUSES.CONSUMED,
      consumedAt: new Date(),
      consumedSessionId: sessionId,
      consumedSessionKind: sessionKind,
      consumedChatType: normalizeFreeChatType(chatType),
    },
    { transaction }
  );

  return allocation;
};

const activatePendingHumanSessionWithFreeChat = async (
  { sessionId, startTime = new Date() },
  transaction
) => {
  const session = await ChatSession.findByPk(sessionId, {
    transaction,
    lock: transaction.LOCK.UPDATE,
  });

  if (!session) {
    throw new Error("Chat session not found");
  }

  if (!isFreeChatSession(session) || !session.freeChatAllocationId) {
    throw new Error("Chat session is not configured for free chat");
  }

  const existingAllocation = await FreeChatAllocation.findByPk(
    session.freeChatAllocationId,
    {
      transaction,
      lock: transaction ? transaction.LOCK.UPDATE : undefined,
    }
  );

  if (!existingAllocation) {
    throw new Error("Free chat allocation not found");
  }

  const alreadyConsumedBySession =
    existingAllocation.status === FREE_CHAT_STATUSES.CONSUMED &&
    existingAllocation.consumedSessionId === session.id &&
    existingAllocation.consumedSessionKind === "human_chat";

  if (!alreadyConsumedBySession) {
    await consumeFreeChatAllocation(
      {
        allocationId: session.freeChatAllocationId,
        userId: session.userId,
        sessionId: session.id,
        sessionKind: "human_chat",
        chatType: FREE_CHAT_TYPES.REAL,
      },
      transaction
    );
  }

  const timeWindow = calculateFreeChatWindow(session.freeChatMinutes, startTime);

  await session.update(
    {
      requestStatus: "approved",
      status: "active",
      startTime,
      endTime: null,
      maxDurationSeconds: timeWindow.maxDurationSeconds,
      maxEndTime: timeWindow.maxEndTime,
      walletBalanceAtApproval: null,
    },
    { transaction }
  );

  return session;
};

const getUserFreeChatSummary = async (userId) => {
  const allocations = await FreeChatAllocation.findAll({
    where: {
      userId,
      status: FREE_CHAT_STATUSES.ACTIVE,
      [Op.or]: [{ expiresAt: null }, { expiresAt: { [Op.gt]: new Date() } }],
    },
    order: [
      ["createdAt", "ASC"],
      ["id", "ASC"],
    ],
  });

  const summary = allocations.reduce(
    (acc, allocation) => {
      const minutes = Number(allocation.minutes || 0) || 0;
      acc.totalAllocations += 1;
      acc.totalMinutes += minutes;

      if (allocation.applicableChatType === FREE_CHAT_TYPES.AI) {
        acc.aiMinutes += minutes;
      } else if (allocation.applicableChatType === FREE_CHAT_TYPES.REAL) {
        acc.realMinutes += minutes;
      } else {
        acc.bothMinutes += minutes;
      }

      return acc;
    },
    {
      totalAllocations: 0,
      totalMinutes: 0,
      aiMinutes: 0,
      realMinutes: 0,
      bothMinutes: 0,
    }
  );

  return {
    summary: {
      ...summary,
      hasAny: allocations.length > 0,
    },
    allocations,
  };
};

const resolveGrantTargetUserIds = async ({ targetMode, userIds = [], filters = {} }) => {
  if (targetMode === "all") {
    const users = await User.findAll({
      attributes: ["id"],
      order: [["createdAt", "DESC"]],
      raw: true,
    });
    return users.map((user) => user.id);
  }

  if (targetMode === "filter") {
    const where = {};

    if (filters?.emailVerified === true) {
      where.email = { [Op.ne]: null };
    }

    if (filters?.createdAfter) {
      where.createdAt = { [Op.gte]: new Date(filters.createdAfter) };
    }

    const users = await User.findAll({
      where,
      attributes: ["id"],
      order: [["createdAt", "DESC"]],
      raw: true,
    });
    return users.map((user) => user.id);
  }

  return Array.from(
    new Set(
      (Array.isArray(userIds) ? userIds : [userIds]).filter(Boolean).map(String)
    )
  );
};

const resolveSystemGrantAdminId = async () => {
  if (cachedSystemGrantAdminId) {
    return cachedSystemGrantAdminId;
  }

  const envAdminId = String(process.env.SYSTEM_FREE_CHAT_ADMIN_ID || "").trim();
  if (envAdminId) {
    cachedSystemGrantAdminId = envAdminId;
    return cachedSystemGrantAdminId;
  }

  const fallbackAdmin = await Admin.findOne({
    attributes: ["id"],
    order: [["createdAt", "ASC"], ["id", "ASC"]],
    raw: true,
  });

  cachedSystemGrantAdminId = fallbackAdmin?.id || null;
  return cachedSystemGrantAdminId;
};

const grantFreeChatAllocations = async ({
  adminId,
  targetMode = "single",
  userIds = [],
  minutes,
  applicableChatType,
  campaignName,
  reason,
  expiresAt,
  filters,
  metadata,
}) => {
  const normalizedMinutes = Number.parseInt(String(minutes), 10);
  if (!Number.isInteger(normalizedMinutes) || normalizedMinutes <= 0) {
    throw new Error("Free chat minutes must be a positive integer");
  }

  const targetUserIds = await resolveGrantTargetUserIds({
    targetMode,
    userIds,
    filters,
  });

  if (!targetUserIds.length) {
    throw new Error("No users found for the selected target");
  }

  const dbTransaction = await sequelize.transaction();
  let created = [];

  try {
    const now = new Date();

    await FreeChatAllocation.update(
      {
        status: FREE_CHAT_STATUSES.REVOKED,
        revokedAt: now,
        revokedByAdminId: adminId,
      },
      {
        where: {
          userId: { [Op.in]: targetUserIds },
          status: FREE_CHAT_STATUSES.ACTIVE,
        },
        transaction: dbTransaction,
      }
    );

    const rows = targetUserIds.map((userId) => ({
      userId,
      grantedByAdminId: adminId,
      minutes: normalizedMinutes,
      applicableChatType: normalizeFreeChatType(applicableChatType),
      status: FREE_CHAT_STATUSES.ACTIVE,
      targetMode,
      campaignName: campaignName || null,
      reason: reason || null,
      expiresAt: expiresAt ? new Date(expiresAt) : null,
      metadata: {
        ...(metadata && typeof metadata === "object" ? metadata : {}),
        filters: filters || null,
        grantedAt: now.toISOString(),
      },
    }));

    created = await FreeChatAllocation.bulkCreate(rows, {
      returning: true,
      transaction: dbTransaction,
    });

    await dbTransaction.commit();
  } catch (error) {
    await dbTransaction.rollback();
    throw error;
  }

  return {
    allocations: created,
    targetUserIds,
  };
};

const grantWelcomeFreeChatForUser = async (
  userId,
  { loginMethod = "unknown", minutes = WELCOME_FREE_CHAT_MINUTES } = {}
) => {
  if (!userId) {
    return {
      granted: false,
      reason: "missing_user_id",
      allocation: null,
    };
  }

  const normalizedMinutes = Math.max(
    1,
    Number.parseInt(String(minutes), 10) || WELCOME_FREE_CHAT_MINUTES
  );
  const systemGrantAdminId = await resolveSystemGrantAdminId();

  const existingAllocation = await FreeChatAllocation.findOne({
    where: {
      userId,
      campaignName: WELCOME_FREE_CHAT_CAMPAIGN,
    },
    order: [["createdAt", "DESC"], ["id", "DESC"]],
  });

  if (existingAllocation) {
    return {
      granted: false,
      reason: "already_granted",
      allocation: existingAllocation,
      minutes:
        Number(existingAllocation.minutes || normalizedMinutes) || normalizedMinutes,
    };
  }

  const allocation = await FreeChatAllocation.create({
    userId,
    grantedByAdminId: systemGrantAdminId,
    minutes: normalizedMinutes,
    applicableChatType: FREE_CHAT_TYPES.AI,
    status: FREE_CHAT_STATUSES.ACTIVE,
    targetMode: "single",
    campaignName: WELCOME_FREE_CHAT_CAMPAIGN,
    reason: "Welcome free chat on first login (AI only)",
    metadata: {
      grantSource: "system_welcome_login",
      systemGrantAdminId,
      loginMethod,
      grantedAt: new Date().toISOString(),
    },
  });

  return {
    granted: true,
    allocation,
    minutes: normalizedMinutes,
  };
};

const listFreeChatAllocationsForAdmin = async ({
  status = "all",
  page = 1,
  limit = 20,
  applicableChatType,
  search,
}) => {
  const normalizedStatus = String(status || "all").toLowerCase();
  const safePage = Math.max(1, Number.parseInt(String(page), 10) || 1);
  const safeLimit = Math.min(100, Math.max(1, Number.parseInt(String(limit), 10) || 20));
  const offset = (safePage - 1) * safeLimit;
  const now = new Date();

  const where = {};
  if (normalizedStatus !== "all") {
    if (normalizedStatus === "expired") {
      where.status = FREE_CHAT_STATUSES.ACTIVE;
      where.expiresAt = { [Op.lte]: now };
    } else {
      where.status = normalizedStatus;
    }
  }

  if (applicableChatType) {
    where.applicableChatType = normalizeFreeChatType(applicableChatType);
  }

  const userWhere = {};
  if (search) {
    userWhere[Op.or] = [
      { fullName: { [Op.iLike]: `%${search}%` } },
      { email: { [Op.iLike]: `%${search}%` } },
      { mobile: { [Op.iLike]: `%${search}%` } },
    ];
  }

  const { rows, count } = await FreeChatAllocation.findAndCountAll({
    where,
    include: [
      {
        model: User,
        as: "user",
        attributes: ["id", "fullName", "email", "mobile"],
        ...(search ? { where: userWhere } : {}),
      },
      {
        model: Admin,
        as: "grantedByAdmin",
        attributes: ["id", "name", "email"],
      },
      {
        model: Admin,
        as: "revokedByAdmin",
        attributes: ["id", "name", "email"],
        required: false,
      },
    ],
    order: [["createdAt", "DESC"], ["id", "DESC"]],
    limit: safeLimit,
    offset,
  });

  const statusCounts = await Promise.all([
    FreeChatAllocation.count({ where: { status: FREE_CHAT_STATUSES.ACTIVE } }),
    FreeChatAllocation.count({ where: { status: FREE_CHAT_STATUSES.CONSUMED } }),
    FreeChatAllocation.count({ where: { status: FREE_CHAT_STATUSES.REVOKED } }),
  ]);

  return {
    allocations: rows,
    pagination: {
      total: count,
      page: safePage,
      limit: safeLimit,
      totalPages: Math.ceil(count / safeLimit),
    },
    summary: {
      active: statusCounts[0],
      consumed: statusCounts[1],
      revoked: statusCounts[2],
    },
  };
};

const revokeFreeChatAllocation = async ({ allocationId, adminId }) => {
  const allocation = await FreeChatAllocation.findByPk(allocationId);
  if (!allocation) {
    throw new Error("Free chat allocation not found");
  }

  if (allocation.status !== FREE_CHAT_STATUSES.ACTIVE) {
    throw new Error("Only active free chat allocations can be revoked");
  }

  await allocation.update({
    status: FREE_CHAT_STATUSES.REVOKED,
    revokedAt: new Date(),
    revokedByAdminId: adminId,
  });

  return allocation;
};

module.exports = {
  CHAT_BILLING_SOURCES,
  FREE_CHAT_STATUSES,
  FREE_CHAT_TYPES,
  activatePendingHumanSessionWithFreeChat,
  buildFreeChatSessionFields,
  calculateFreeChatWindow,
  consumeFreeChatAllocation,
  getAvailableFreeChatAllocation,
  getUserFreeChatSummary,
  grantFreeChatAllocations,
  grantWelcomeFreeChatForUser,
  isFreeChatSession,
  listFreeChatAllocationsForAdmin,
  normalizeFreeChatType,
  revokeFreeChatAllocation,
  WELCOME_FREE_CHAT_CAMPAIGN,
  WELCOME_FREE_CHAT_MINUTES,
};

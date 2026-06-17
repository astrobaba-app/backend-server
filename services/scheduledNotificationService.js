const crypto = require("crypto");
const os = require("os");
const cron = require("node-cron");
const { Op, literal } = require("sequelize");
const Admin = require("../model/admin/admin");
const BroadcastLog = require("../model/admin/broadcastLog");
const ScheduledNotificationBatch = require("../model/admin/scheduledNotificationBatch");
const ScheduledNotificationItem = require("../model/admin/scheduledNotificationItem");
const notificationService = require("./notificationService");

const DEFAULT_TIMEZONE = process.env.SCHEDULED_NOTIFICATION_TIMEZONE || "Asia/Kolkata";
const DEFAULT_CRON = process.env.SCHEDULED_NOTIFICATION_CRON || "* * * * *";
const WORKER_ENABLED = process.env.SCHEDULED_NOTIFICATION_WORKER_ENABLED !== "false";
const DUE_LOOKBACK_MINUTES = Number.parseInt(
  process.env.SCHEDULED_NOTIFICATION_LOOKBACK_MINUTES || "10",
  10
);
const BATCH_LIMIT = Number.parseInt(process.env.SCHEDULED_NOTIFICATION_BATCH_LIMIT || "1", 10);
const MAX_LOAD_AVG = Number.parseFloat(process.env.SCHEDULED_NOTIFICATION_MAX_LOAD_AVG || "0");
const MAX_EVENT_LOOP_LAG_MS = Number.parseInt(
  process.env.SCHEDULED_NOTIFICATION_MAX_EVENT_LOOP_LAG_MS || "1500",
  10
);
const MIN_FREE_SYSTEM_MEMORY_MB = Number.parseInt(
  process.env.SCHEDULED_NOTIFICATION_MIN_FREE_SYSTEM_MEMORY_MB || "0",
  10
);

const PLAN_DAYS = {
  one_day: 1,
  seven_day: 7,
  thirty_day: 30,
};

const normalizePlanType = (planType) =>
  ["one_day", "seven_day", "thirty_day", "custom"].includes(planType)
    ? planType
    : "one_day";

const normalizeTime = (value) => {
  const raw = String(value || "").trim();
  const match = raw.match(/^([01]?\d|2[0-3]):([0-5]\d)$/);
  if (!match) return null;
  return `${match[1].padStart(2, "0")}:${match[2]}`;
};

const normalizeDate = (value) => {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, "0");
    const day = String(value.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }
  const text = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
};

const buildLocalDateTime = (dateText, timeText) => {
  const date = normalizeDate(dateText);
  const time = normalizeTime(timeText);
  if (!date || !time) return null;
  const parsed = new Date(`${date}T${time}:00+05:30`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const addDays = (dateText, days) => {
  const [year, month, day] = dateText.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days, 12, 0, 0));
  return date.toISOString().slice(0, 10);
};

const hashItem = ({ title, message, actionUrl }) =>
  crypto
    .createHash("sha256")
    .update(`${title.trim()}|${message.trim()}|${String(actionUrl || "").trim()}`)
    .digest("hex");

const getCell = (row, keys) => {
  for (const key of keys) {
    if (row[key] !== undefined && row[key] !== null && String(row[key]).trim() !== "") {
      return row[key];
    }
  }
  return "";
};

const validateRows = (rows) => {
  return rows
    .map((row, index) => {
      const title = String(getCell(row, ["title", "Title", "notification_title", "Notification Title"])).trim();
      const message = String(getCell(row, ["message", "Message", "body", "Body"])).trim();
      const actionUrl = String(getCell(row, ["action_url", "Action URL", "actionUrl", "url", "URL"])).trim();
      const scheduledDate = normalizeDate(
        getCell(row, ["scheduled_date", "Scheduled Date", "date", "Date"])
      );
      const scheduledTime = normalizeTime(
        getCell(row, ["scheduled_time", "Scheduled Time", "time", "Time"])
      );

      return {
        rowNumber: index + 2,
        title,
        message,
        actionUrl: actionUrl || null,
        scheduledDate,
        scheduledTime,
        isValid: Boolean(title && message),
      };
    })
    .filter((row) => row.isValid);
};

const buildSlots = ({ planType, startDate, times }) => {
  const normalizedStart = normalizeDate(startDate) || new Date().toISOString().slice(0, 10);
  const normalizedTimes = [...new Set((times || []).map(normalizeTime).filter(Boolean))].sort();
  const days = PLAN_DAYS[planType] || 1;
  const slots = [];

  for (let day = 0; day < days; day += 1) {
    const date = addDays(normalizedStart, day);
    normalizedTimes.forEach((time) => {
      const scheduledAt = buildLocalDateTime(date, time);
      if (scheduledAt) slots.push({ date, time, scheduledAt });
    });
  }

  return {
    startDate: normalizedStart,
    endDate: addDays(normalizedStart, days - 1),
    times: normalizedTimes,
    slots,
  };
};

const measureEventLoopLag = () =>
  new Promise((resolve) => {
    const startedAt = Date.now();
    setTimeout(() => resolve(Date.now() - startedAt), 0);
  });

const getHealthStatus = async () => {
  const loadAvg = os.loadavg?.()[0] || 0;
  const cpuCount = Math.max(os.cpus?.().length || 1, 1);
  const normalizedLoad = loadAvg / cpuCount;
  const freeMemoryMb = Math.round(os.freemem() / 1024 / 1024);
  const eventLoopLagMs = await measureEventLoopLag();

  if (MAX_LOAD_AVG > 0 && normalizedLoad > MAX_LOAD_AVG) {
    return {
      ok: false,
      reason: `Server load is high (${normalizedLoad.toFixed(2)} per CPU)`,
    };
  }

  if (MAX_EVENT_LOOP_LAG_MS > 0 && eventLoopLagMs > MAX_EVENT_LOOP_LAG_MS) {
    return {
      ok: false,
      reason: `Event loop lag is high (${eventLoopLagMs}ms)`,
    };
  }

  if (
    MIN_FREE_SYSTEM_MEMORY_MB > 0 &&
    freeMemoryMb < MIN_FREE_SYSTEM_MEMORY_MB
  ) {
    return {
      ok: false,
      reason: `System free memory is low (${freeMemoryMb} MB)`,
    };
  }

  return { ok: true, loadAvg, normalizedLoad, freeMemoryMb, eventLoopLagMs };
};

class ScheduledNotificationService {
  async createBatchFromRows({ adminId, name, planType, scheduleMode, startDate, times, sourceFileName, rows }) {
    const admin = await Admin.findByPk(adminId, { attributes: ["id", "name"] });
    const normalizedPlan = normalizePlanType(planType);
    const validatedRows = validateRows(rows);

    if (!validatedRows.length) {
      throw new Error("No valid notifications found. Required columns: title, message.");
    }

    const slotsPayload = buildSlots({
      planType: normalizedPlan,
      startDate,
      times,
    });

    const hasRowSchedules = validatedRows.some((row) => row.scheduledDate && row.scheduledTime);
    if (!hasRowSchedules && slotsPayload.slots.length === 0) {
      throw new Error("Select at least one schedule time or provide scheduled_date and scheduled_time in the sheet.");
    }

    if (!hasRowSchedules && validatedRows.length > slotsPayload.slots.length) {
      throw new Error(
        `This upload has ${validatedRows.length} notifications but the selected plan has only ${slotsPayload.slots.length} available send slots. Choose a longer plan, add more times, or upload fewer rows.`
      );
    }

    const batch = await ScheduledNotificationBatch.create({
      adminId,
      adminName: admin?.name || "",
      name: name || `${sourceFileName || "Notification"} upload`,
      planType: normalizedPlan,
      scheduleMode: hasRowSchedules ? "custom_rows" : scheduleMode || "same_times",
      timezone: DEFAULT_TIMEZONE,
      startDate: slotsPayload.startDate,
      endDate: slotsPayload.endDate,
      times: slotsPayload.times,
      sourceFileName,
      totalItems: 0,
      scheduledCount: 0,
    });

    const items = validatedRows.map((row, index) => {
      const explicitSchedule =
        row.scheduledDate && row.scheduledTime
          ? buildLocalDateTime(row.scheduledDate, row.scheduledTime)
          : null;
      const slot = slotsPayload.slots[index];
      const scheduledAt = explicitSchedule || slot?.scheduledAt;

      return {
        batchId: batch.id,
        adminId,
        title: row.title,
        message: row.message,
        actionUrl: row.actionUrl,
        scheduledAt,
        rowNumber: row.rowNumber,
        contentHash: hashItem(row),
      };
    });

    await ScheduledNotificationItem.bulkCreate(items, { validate: true });
    await batch.update({ totalItems: items.length, scheduledCount: items.length });

    return this.getBatch(batch.id);
  }

  async getBatch(batchId) {
    const batch = await ScheduledNotificationBatch.findByPk(batchId);
    if (!batch) return null;

    const items = await ScheduledNotificationItem.findAll({
      where: { batchId },
      order: [
        ["scheduledAt", "ASC"],
        ["createdAt", "ASC"],
      ],
    });

    return { batch, items };
  }

  async listBatches({ page = 1, limit = 10, status }) {
    const effectiveLimit = Math.min(50, Math.max(1, Number.parseInt(limit, 10) || 10));
    const effectivePage = Math.max(1, Number.parseInt(page, 10) || 1);
    const where = { status: { [Op.ne]: "deleted" } };
    if (status && status !== "all") where.status = status;

    const { rows, count } = await ScheduledNotificationBatch.findAndCountAll({
      where,
      order: [["createdAt", "DESC"]],
      limit: effectiveLimit,
      offset: (effectivePage - 1) * effectiveLimit,
    });

    return {
      batches: rows,
      pagination: {
        total: count,
        page: effectivePage,
        limit: effectiveLimit,
        totalPages: Math.ceil(count / effectiveLimit),
      },
    };
  }

  async getGroupedItems({ status, from, to }) {
    const where = {};
    if (status && status !== "all") where.status = status;
    if (from || to) {
      where.scheduledAt = {};
      const fromDate = from ? new Date(from) : null;
      const toDate = to ? new Date(to) : null;
      if (fromDate && !Number.isNaN(fromDate.getTime())) where.scheduledAt[Op.gte] = fromDate;
      if (toDate && !Number.isNaN(toDate.getTime())) where.scheduledAt[Op.lte] = toDate;
    }

    const items = await ScheduledNotificationItem.findAll({
      where,
      order: [
        ["scheduledAt", "ASC"],
        ["createdAt", "ASC"],
      ],
      limit: 300,
    });

    const groups = new Map();
    items.forEach((item) => {
      const key = item.scheduledAt.toISOString().slice(0, 16);
      const current = groups.get(key) || {
        scheduledAt: item.scheduledAt,
        total: 0,
        scheduled: 0,
        sent: 0,
        failed: 0,
        cancelled: 0,
        items: [],
      };
      current.total += 1;
      current[item.status] = (current[item.status] || 0) + 1;
      current.items.push(item);
      groups.set(key, current);
    });

    return Array.from(groups.values());
  }

  async getSentHistory({ page = 1, limit = 10 }) {
    const effectiveLimit = Math.min(50, Math.max(1, Number.parseInt(limit, 10) || 10));
    const effectivePage = Math.max(1, Number.parseInt(page, 10) || 1);
    const offset = (effectivePage - 1) * effectiveLimit;

    const { rows, count } = await ScheduledNotificationItem.findAndCountAll({
      where: { status: "sent" },
      order: [["sentAt", "DESC"]],
      limit: effectiveLimit,
      offset,
    });

    const logIds = rows.map((item) => item.broadcastLogId).filter(Boolean);
    const batchIds = [...new Set(rows.map((item) => item.batchId).filter(Boolean))];
    const [logs, batches] = await Promise.all([
      logIds.length
        ? BroadcastLog.findAll({ where: { id: logIds } })
        : [],
      batchIds.length
        ? ScheduledNotificationBatch.findAll({ where: { id: batchIds } })
        : [],
    ]);
    const logsById = new Map(logs.map((log) => [String(log.id), log]));
    const batchesById = new Map(batches.map((batch) => [String(batch.id), batch]));

    return {
      history: rows.map((item) => {
        const log = item.broadcastLogId ? logsById.get(String(item.broadcastLogId)) : null;
        const batch = batchesById.get(String(item.batchId));
        return {
          id: item.id,
          batchId: item.batchId,
          batchName: batch?.name || null,
          title: item.title,
          message: item.message,
          actionUrl: item.actionUrl,
          scheduledAt: item.scheduledAt,
          sentAt: item.sentAt,
          broadcastLogId: item.broadcastLogId,
          totalUsers: log?.totalUsers || 0,
          pushSuccessCount: log?.pushSuccessCount || 0,
          pushFailureCount: log?.pushFailureCount || 0,
          pushPendingCount: log?.pushPendingCount || 0,
        };
      }),
      pagination: {
        total: count,
        page: effectivePage,
        limit: effectiveLimit,
        totalPages: Math.ceil(count / effectiveLimit),
      },
    };
  }

  async updateItem(itemId, payload) {
    const item = await ScheduledNotificationItem.findByPk(itemId);
    if (!item) throw new Error("Scheduled notification not found");
    if (item.status !== "scheduled" && item.status !== "failed") {
      throw new Error("Only unsent notifications can be edited");
    }

    const updates = {};
    if (payload.title !== undefined) updates.title = String(payload.title).trim();
    if (payload.message !== undefined) updates.message = String(payload.message).trim();
    if (payload.actionUrl !== undefined) updates.actionUrl = payload.actionUrl ? String(payload.actionUrl).trim() : null;
    if (payload.scheduledAt !== undefined) {
      const scheduledAt = new Date(payload.scheduledAt);
      if (Number.isNaN(scheduledAt.getTime())) throw new Error("Invalid scheduledAt value");
      updates.scheduledAt = scheduledAt;
    }
    if (!updates.title && item.title) updates.title = item.title;
    if (!updates.message && item.message) updates.message = item.message;
    updates.contentHash = hashItem({
      title: updates.title || item.title,
      message: updates.message || item.message,
      actionUrl: updates.actionUrl ?? item.actionUrl,
    });
    updates.status = "scheduled";
    updates.lastError = null;

    await item.update(updates);
    return item;
  }

  async cancelItem(itemId) {
    const item = await ScheduledNotificationItem.findByPk(itemId);
    if (!item) throw new Error("Scheduled notification not found");
    if (item.status === "sent") throw new Error("Sent notifications cannot be cancelled");
    await item.update({ status: "cancelled", lockToken: null, lockedAt: null });
    await this.refreshBatchCounts(item.batchId);
    return item;
  }

  async cancelBatch(batchId) {
    const batch = await ScheduledNotificationBatch.findByPk(batchId);
    if (!batch) throw new Error("Scheduled batch not found");

    await ScheduledNotificationItem.update(
      { status: "cancelled", lockToken: null, lockedAt: null },
      { where: { batchId, status: { [Op.in]: ["scheduled", "failed", "processing"] } } }
    );
    await batch.update({ status: "cancelled", cancelledAt: new Date() });
    await this.refreshBatchCounts(batchId);
    return this.getBatch(batchId);
  }

  async deleteBatch(batchId) {
    const batch = await ScheduledNotificationBatch.findByPk(batchId);
    if (!batch) throw new Error("Scheduled batch not found");

    const sentCount = await ScheduledNotificationItem.count({ where: { batchId, status: "sent" } });
    if (sentCount > 0) {
      await this.cancelBatch(batchId);
      await batch.update({ status: "deleted", deletedAt: new Date() });
      return;
    }

    await ScheduledNotificationItem.destroy({ where: { batchId } });
    await batch.destroy();
  }

  async refreshBatchCounts(batchId) {
    const [scheduledCount, sentCount, failedCount, cancelledCount] = await Promise.all([
      ScheduledNotificationItem.count({ where: { batchId, status: "scheduled" } }),
      ScheduledNotificationItem.count({ where: { batchId, status: "sent" } }),
      ScheduledNotificationItem.count({ where: { batchId, status: "failed" } }),
      ScheduledNotificationItem.count({ where: { batchId, status: "cancelled" } }),
    ]);

    const totalItems = scheduledCount + sentCount + failedCount + cancelledCount;
    const status =
      totalItems > 0 && sentCount + cancelledCount === totalItems ? "completed" : undefined;

    const batch = await ScheduledNotificationBatch.findByPk(batchId);
    if (!batch || batch.status === "deleted") return;

    await batch.update({
      scheduledCount,
      sentCount,
      failedCount,
      cancelledCount,
      ...(status && batch.status !== "cancelled" ? { status } : {}),
    });
  }

  async processDueNotifications() {
    const health = await getHealthStatus();
    if (!health.ok) {
      console.warn(`[ScheduledNotifications] Skipping tick: ${health.reason}`);
      return { processed: 0, skipped: true, reason: health.reason };
    }

    const now = new Date();
    const lookback = new Date(now.getTime() - DUE_LOOKBACK_MINUTES * 60 * 1000);
    const items = await ScheduledNotificationItem.findAll({
      where: {
        status: "scheduled",
        scheduledAt: {
          [Op.lte]: now,
          [Op.gte]: lookback,
        },
      },
      order: [["scheduledAt", "ASC"]],
      limit: BATCH_LIMIT,
    });

    let processed = 0;
    for (const item of items) {
      const lockToken = crypto.randomUUID();
      const [claimed] = await ScheduledNotificationItem.update(
        {
          status: "processing",
          lockToken,
          lockedAt: new Date(),
          attemptCount: literal('"attemptCount" + 1'),
        },
        { where: { id: item.id, status: "scheduled" } }
      );

      if (!claimed) continue;

      try {
        const admin = await Admin.findByPk(item.adminId, { attributes: ["id", "name"] });
        const log = await BroadcastLog.create({
          adminId: item.adminId,
          adminName: admin?.name || "",
          title: item.title,
          message: item.message,
          actionUrl: item.actionUrl,
          totalUsers: 0,
          pushSuccessCount: 0,
          pushFailureCount: 0,
          pushPendingCount: 0,
        });

        const result = await notificationService.broadcastToAll({
          type: "admin_broadcast",
          title: item.title,
          message: item.message,
          data: {
            scheduledNotificationItemId: item.id,
            scheduledNotificationBatchId: item.batchId,
            broadcastLogId: log.id,
          },
          actionUrl: item.actionUrl,
          priority: "high",
          sendPush: true,
        });

        await log.update({
          totalUsers: result.totalSent || 0,
          pushSuccessCount: result.pushSuccessCount || 0,
          pushFailureCount: result.pushFailureCount || 0,
          pushPendingCount: result.pushPendingCount || 0,
        });

        await ScheduledNotificationItem.update(
          {
            status: "sent",
            sentAt: new Date(),
            broadcastLogId: log.id,
            lockToken: null,
            lockedAt: null,
            lastError: null,
          },
          { where: { id: item.id, lockToken, status: "processing" } }
        );
        await this.refreshBatchCounts(item.batchId);
        processed += 1;
      } catch (error) {
        await ScheduledNotificationItem.update(
          {
            status: "failed",
            lockToken: null,
            lockedAt: null,
            lastError: error.message || "Scheduled send failed",
          },
          { where: { id: item.id, lockToken, status: "processing" } }
        );
        await this.refreshBatchCounts(item.batchId);
      }
    }

    return { processed };
  }

  startWorker() {
    if (!WORKER_ENABLED) {
      console.log("[ScheduledNotifications] Worker disabled by SCHEDULED_NOTIFICATION_WORKER_ENABLED=false");
      return null;
    }

    if (this.task) return this.task;
    this.task = cron.schedule(DEFAULT_CRON, () => {
      this.processDueNotifications().catch((error) => {
        console.error("[ScheduledNotifications] Worker failed:", error);
      });
    });
    console.log(
      `[ScheduledNotifications] Worker started with cron "${DEFAULT_CRON}" and batch limit ${BATCH_LIMIT}`
    );
    return this.task;
  }
}

module.exports = new ScheduledNotificationService();
module.exports.DEFAULT_TIMEZONE = DEFAULT_TIMEZONE;
module.exports.buildSlots = buildSlots;

const { sequelize } = require("../dbConnection/dbConfig");
const { DataTypes } = require("sequelize");

// Admin models
const Admin = require("../model/admin/admin");
const AdminSettings = require("../model/admin/adminSettings");
const BroadcastLog = require("../model/admin/broadcastLog");

// AI Chat models
const AiChatMessage = require("../model/aiChat/aiChatMessage");
const AiChatSession = require("../model/aiChat/aiChatSession");
const OpenAIRequestLog = require("../model/ai/openAiRequestLog");

// Assistant models
const AssistantChat = require("../model/assistant/assistantChat");
const AssistantPlan = require("../model/assistant/assistantPlan");

// Astrologer models
const Astrologer = require("../model/astrologer/astrologer");
const AstrologerEarning = require("../model/astrologer/astrologerEarning");
const AstrologerPayoutRequest = require("../model/astrologer/astrologerPayoutRequest");

// Blog models
const Blog = require("../model/blog/blog");
const BlogLike = require("../model/blog/blogLike");

// Forum models
const ForumPost = require("../model/forum/forumPost");
const ForumComment = require("../model/forum/forumComment");
const ForumPostLike = require("../model/forum/forumPostLike");
const ForumPostReport = require("../model/forum/forumPostReport");
const ForumPostAppeal = require("../model/forum/forumPostAppeal");

// Call models
const CallSession = require("../model/call/callSession");

// Chat models
const ChatMessage = require("../model/chat/chatMessage");
const ChatSession = require("../model/chat/chatSession");

// Coupon models
const Coupon = require("../model/coupon/coupon");
const CouponUsage = require("../model/coupon/couponUsage");

// Follow models
const Follow = require("../model/follow/follow");

// Horoscope models
const Horoscope = require("../model/horoscope/horoscope");
const CachedHoroscope = require("../model/horoscope/cachedHoroscope");
const Kundli = require("../model/horoscope/kundli");
const KundliReport = require("../model/horoscope/kundliReport");
const DailyInsightPayload = require("../model/horoscope/dailyInsightPayload");
const MatchingProfile = require("../model/horoscope/matchingProfile");
const SharedKundliDeletion = require("../model/horoscope/sharedKundliDeletion");

// Live models
const LiveChatMessage = require("../model/live/liveChatMessage");
const LiveParticipant = require("../model/live/liveParticipant");
const LiveSession = require("../model/live/liveSession");

// Notification models
const Notification = require("../model/notification/notification");

// Review models
const Review = require("../model/review/review");

// Store models
const Cart = require("../model/store/cart");
const Order = require("../model/store/order");
const Product = require("../model/store/product");
const ProductReview = require("../model/store/productReview");

// Support models
const SupportTicket = require("../model/support/supportTicket");
const TicketReply = require("../model/support/ticketReply");

// Job models
const Job = require("../model/job/job");
const JobApplication = require("../model/job/jobApplication");

// User models
const User = require("../model/user/userAuth");
const UserRequest = require("../model/user/userRequest");
const AccountDeletionRequest = require("../model/user/accountDeletionRequest");
const Address = require("../model/user/address");
const DeviceToken = require("../model/user/deviceToken");
const GoogleAuth = require("../model/user/googleAuth");
const AppleAuth = require("../model/user/appleAuth");

// Wallet models
const Wallet = require("../model/wallet/wallet");
const WalletTransaction = require("../model/wallet/walletTransaction");
const PalmUpload = require("../model/palm/palmUpload");
const PalmFeature = require("../model/palm/palmFeature");
const PalmReport = require("../model/palm/palmReport");
const AIJob = require("../model/palm/aiJob");
const PalmOrder = require("../model/palm/palmOrder");




async function ensureChatSessionColumns() {
  const queryInterface = sequelize.getQueryInterface();

  const table = await queryInterface.describeTable("chat_sessions");
  const operations = [];

  // Ensure request status columns exist and are compatible with current model/queries
  if (!table.request_status && !table.requestStatus) {
    // Primary column using snake_case
    operations.push(
      queryInterface.addColumn("chat_sessions", "request_status", {
        type: DataTypes.ENUM("pending", "approved", "rejected"),
        allowNull: false,
        defaultValue: "pending",
        comment:
          "Chat request status: pending (awaiting astrologer approval), approved (active chat), rejected (request declined)",
      })
    );
  }

  // Some parts of Sequelize may still reference the camelCase name in generated SQL
  // (e.g. "ChatSession"."requestStatus"). To avoid runtime errors like
  // "column ChatSession.requestStatus does not exist", ensure a compatible
  // camelCase column also exists, backed by the same ENUM semantics.
  if (!table.requestStatus) {
    operations.push(
      queryInterface.addColumn("chat_sessions", "requestStatus", {
        type: DataTypes.ENUM("pending", "approved", "rejected"),
        allowNull: false,
        defaultValue: "pending",
        comment:
          "Duplicate of request_status to satisfy legacy/camelCase queries",
      })
    );
  }

  if (!table.last_message_preview) {
    operations.push(
      queryInterface.addColumn("chat_sessions", "last_message_preview", {
        type: DataTypes.STRING,
        allowNull: true,
        comment: "Short preview of the last message in this chat session",
      })
    );
  }

  if (!table.last_message_at) {
    operations.push(
      queryInterface.addColumn("chat_sessions", "last_message_at", {
        type: DataTypes.DATE,
        allowNull: true,
        comment: "Timestamp of the last message in this chat session",
      })
    );
  }

  if (!table.user_unread_count) {
    operations.push(
      queryInterface.addColumn("chat_sessions", "user_unread_count", {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: "Unread messages for the user in this session",
      })
    );
  }

  if (!table.astrologer_unread_count) {
    operations.push(
      queryInterface.addColumn("chat_sessions", "astrologer_unread_count", {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: "Unread messages for the astrologer in this session",
      })
    );
  }

  if (operations.length) {
    await Promise.all(operations);
    console.log("Ensured chat_sessions metadata columns exist");
  }
}

async function ensureLiveChatMessageColumns() {
  const queryInterface = sequelize.getQueryInterface();

  try {
    const table = await queryInterface.describeTable("live_chat_messages");
    const operations = [];

    // Check if sender_role column exists (PostgreSQL uses lowercase)
    if (!table.sender_role && !table.senderRole) {
      console.log("Adding sender_role column to live_chat_messages...");
      operations.push(
        queryInterface.addColumn("live_chat_messages", "sender_role", {
          type: DataTypes.ENUM("user", "astrologer"),
          allowNull: true,
          comment: "Role of the message sender (user or astrologer)",
        })
      );
    }

    if (operations.length) {
      await Promise.all(operations);
      console.log("✓ Added sender_role column to live_chat_messages");
    } else {
      console.log("✓ live_chat_messages table is up to date");
    }
  } catch (error) {
    // Table doesn't exist yet, will be created by sync
    console.log("live_chat_messages table will be created by sync");
  }
}

async function ensureChatMessageColumns() {
  const queryInterface = sequelize.getQueryInterface();

  const table = await queryInterface.describeTable("chat_messages");
  const operations = [];

  if (!table.reply_to_message_id) {
    operations.push(
      queryInterface.addColumn("chat_messages", "reply_to_message_id", {
        type: DataTypes.UUID,
        allowNull: true,
        comment: "If set, this message is a reply to another message in the same session",
      })
    );
  }

  if (!table.is_deleted) {
    operations.push(
      queryInterface.addColumn("chat_messages", "is_deleted", {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        comment: "Soft-delete flag for messages",
      })
    );
  }

  if (!table.deleted_at) {
    operations.push(
      queryInterface.addColumn("chat_messages", "deleted_at", {
        type: DataTypes.DATE,
        allowNull: true,
        comment: "Timestamp when message was soft-deleted",
      })
    );
  }

  if (operations.length) {
    await Promise.all(operations);
    console.log("Ensured chat_messages reply/delete columns exist");
  }
}

async function ensureChatMessageVoiceEnumValues() {
  if (sequelize.getDialect() !== "postgres") {
    return;
  }

  await sequelize.query(`
    DO $$
    DECLARE
      chat_message_enum_name text;
      chat_history_enum_name text;
    BEGIN
      SELECT typname
      INTO chat_message_enum_name
      FROM pg_type
      WHERE lower(typname) = lower('enum_chat_messages_messageType')
      LIMIT 1;

      IF chat_message_enum_name IS NOT NULL THEN
        EXECUTE format('ALTER TYPE %I ADD VALUE IF NOT EXISTS ''voice''', chat_message_enum_name);
      END IF;

      SELECT typname
      INTO chat_history_enum_name
      FROM pg_type
      WHERE lower(typname) = lower('enum_chat_history_messages_messageType')
      LIMIT 1;

      IF chat_history_enum_name IS NOT NULL THEN
        EXECUTE format('ALTER TYPE %I ADD VALUE IF NOT EXISTS ''voice''', chat_history_enum_name);
      END IF;
    END
    $$;
  `);
}

async function ensureBlogColumns() {
  const queryInterface = sequelize.getQueryInterface();
  try {
    const table = await queryInterface.describeTable("blogs");
    const operations = [];

    // Make astrologerId nullable (raw query for safety with FK constraints)
    try {
      await sequelize.query(`ALTER TABLE "blogs" ALTER COLUMN "astrologerId" DROP NOT NULL`);
    } catch (err) {
      // Already nullable or doesn't exist yet
    }

    if (!table.adminId) {
      operations.push(
        queryInterface.addColumn("blogs", "adminId", {
          type: DataTypes.UUID,
          allowNull: true,
        })
      );
    }

    if (!table.images) {
      operations.push(
        queryInterface.addColumn("blogs", "images", {
          type: DataTypes.TEXT,
          allowNull: true,
        })
      );
    }

    if (!table.category) {
      operations.push(
        queryInterface.addColumn("blogs", "category", {
          type: DataTypes.STRING,
          allowNull: true,
        })
      );
    }

    if (operations.length) {
      await Promise.all(operations);
      console.log("✓ Ensured blog columns exist (adminId, images, category)");
    }
  } catch (error) {
    // Table doesn't exist yet - will be created by sync
    console.log("blogs table will be created by sequelize.sync()");
  }
}

async function ensureAIChatSessionColumns() {
  const queryInterface = sequelize.getQueryInterface();
  try {
    const table = await queryInterface.describeTable("ai_chat_sessions");
    const operations = [];

    if (!table.kundliUserRequestId && !table.kundli_user_request_id) {
      operations.push(
        queryInterface.addColumn("ai_chat_sessions", "kundliUserRequestId", {
          type: DataTypes.UUID,
          allowNull: true,
          comment: "The Kundli (user request) linked to this chat session for personalised readings",
        })
      );
    }

    if (operations.length) {
      await Promise.all(operations);
      console.log("✓ Added kundliUserRequestId column to ai_chat_sessions");
    } else {
      console.log("✓ ai_chat_sessions table is up to date");
    }
  } catch (error) {
    // Table doesn't exist yet — will be created by sync
    console.log("ai_chat_sessions table will be created by sequelize.sync()");
  }
}

async function ensureWalletColumns() {
  const queryInterface = sequelize.getQueryInterface();
  try {
    const table = await queryInterface.describeTable("wallets");
    const operations = [];

    if (!table.signupBonusBalance && !table.signup_bonus_balance) {
      operations.push(
        queryInterface.addColumn("wallets", "signupBonusBalance", {
          type: DataTypes.DECIMAL(10, 2),
          allowNull: false,
          defaultValue: 0.0,
          comment: "Remaining signup bonus credits. Usable only for AI experiences",
        })
      );
    }

    if (operations.length) {
      await Promise.all(operations);
      console.log("Ensured wallet bonus columns exist");
    }
  } catch (error) {
    console.log("wallets table will be created by sequelize.sync()");
  }
}

async function ensureKundliShareColumns() {
  const queryInterface = sequelize.getQueryInterface();
  try {
    const table = await queryInterface.describeTable("kundlis");
    const operations = [];

    if (!table.isPublic && !table.is_public) {
      operations.push(
        queryInterface.addColumn("kundlis", "isPublic", {
          type: DataTypes.BOOLEAN,
          allowNull: false,
          defaultValue: false,
          comment: "Whether this kundli can be viewed publicly via shared link",
        })
      );
    }

    if (operations.length) {
      await Promise.all(operations);
      console.log("✓ Ensured kundlis share columns exist");
    }
  } catch (error) {
    console.log("kundlis table will be created by sequelize.sync()");
  }
}

async function ensureUserPreferenceColumns() {
  const queryInterface = sequelize.getQueryInterface();
  try {
    const table = await queryInterface.describeTable("users");
    const operations = [];

    if (!table.pushNotifications && !table.push_notifications) {
      operations.push(
        queryInterface.addColumn("users", "pushNotifications", {
          type: DataTypes.BOOLEAN,
          allowNull: false,
          defaultValue: true,
        })
      );
    }

    if (!table.emailUpdates && !table.email_updates) {
      operations.push(
        queryInterface.addColumn("users", "emailUpdates", {
          type: DataTypes.BOOLEAN,
          allowNull: false,
          defaultValue: false,
        })
      );
    }

    if (!table.smsAlerts && !table.sms_alerts) {
      operations.push(
        queryInterface.addColumn("users", "smsAlerts", {
          type: DataTypes.BOOLEAN,
          allowNull: false,
          defaultValue: true,
        })
      );
    }

    if (!table.forumIdentityMode && !table.forum_identity_mode) {
      operations.push(
        queryInterface.addColumn("users", "forumIdentityMode", {
          type: DataTypes.ENUM("real", "anonymous"),
          allowNull: false,
          defaultValue: "real",
        })
      );
    }

    if (!table.forumAnonymousHandle && !table.forum_anonymous_handle) {
      operations.push(
        queryInterface.addColumn("users", "forumAnonymousHandle", {
          type: DataTypes.STRING,
          allowNull: true,
          unique: true,
        })
      );
    }

    if (!table.forumAnonymousHash && !table.forum_anonymous_hash) {
      operations.push(
        queryInterface.addColumn("users", "forumAnonymousHash", {
          type: DataTypes.STRING,
          allowNull: true,
          unique: true,
        })
      );
    }

    if (!table.forumWarningsCount && !table.forum_warnings_count) {
      operations.push(
        queryInterface.addColumn("users", "forumWarningsCount", {
          type: DataTypes.INTEGER,
          allowNull: false,
          defaultValue: 0,
        })
      );
    }

    if (!table.forumBlockedUntil && !table.forum_blocked_until) {
      operations.push(
        queryInterface.addColumn("users", "forumBlockedUntil", {
          type: DataTypes.DATE,
          allowNull: true,
        })
      );
    }

    if (!table.forumIsBanned && !table.forum_is_banned) {
      operations.push(
        queryInterface.addColumn("users", "forumIsBanned", {
          type: DataTypes.BOOLEAN,
          allowNull: false,
          defaultValue: false,
        })
      );
    }

    if (!table.whatsappChatLimit && !table.whatsapp_chat_limit) {
      operations.push(
        queryInterface.addColumn("users", "whatsappChatLimit", {
          type: DataTypes.INTEGER,
          allowNull: false,
          defaultValue: 0,
        })
      );
    }

    if (!table.lastLoginAt && !table.last_login_at) {
      operations.push(
        queryInterface.addColumn("users", "lastLoginAt", {
          type: DataTypes.DATE,
          allowNull: true,
        })
      );
    }

    if (!table.lastLoginMethod && !table.last_login_method) {
      operations.push(
        queryInterface.addColumn("users", "lastLoginMethod", {
          type: DataTypes.ENUM("phone", "email"),
          allowNull: true,
        })
      );
    }

    if (operations.length) {
      await Promise.all(operations);
      console.log("✓ Ensured user preference columns exist");
    }
  } catch (error) {
    console.log("users table will be created by sequelize.sync()");
  }
}

async function ensureForumPostModerationColumns() {
  const queryInterface = sequelize.getQueryInterface();
  try {
    const table = await queryInterface.describeTable("forum_posts");
    const operations = [];

    if (!table.isActive && !table.is_active) {
      operations.push(
        queryInterface.addColumn("forum_posts", "isActive", {
          type: DataTypes.BOOLEAN,
          allowNull: false,
          defaultValue: true,
        })
      );
    }

    if (!table.moderationReason && !table.moderation_reason) {
      operations.push(
        queryInterface.addColumn("forum_posts", "moderationReason", {
          type: DataTypes.TEXT,
          allowNull: true,
        })
      );
    }

    if (!table.moderatedByAdminId && !table.moderated_by_admin_id) {
      operations.push(
        queryInterface.addColumn("forum_posts", "moderatedByAdminId", {
          type: DataTypes.UUID,
          allowNull: true,
        })
      );
    }

    if (!table.moderatedAt && !table.moderated_at) {
      operations.push(
        queryInterface.addColumn("forum_posts", "moderatedAt", {
          type: DataTypes.DATE,
          allowNull: true,
        })
      );
    }

    if (!table.aiModerationStatus && !table.ai_moderation_status) {
      operations.push(
        queryInterface.addColumn("forum_posts", "aiModerationStatus", {
          type: DataTypes.ENUM("pending", "approved", "rejected", "error"),
          allowNull: false,
          defaultValue: "pending",
        })
      );
    }

    if (!table.aiModerationReason && !table.ai_moderation_reason) {
      operations.push(
        queryInterface.addColumn("forum_posts", "aiModerationReason", {
          type: DataTypes.TEXT,
          allowNull: true,
        })
      );
    }

    if (!table.aiModeratedAt && !table.ai_moderated_at) {
      operations.push(
        queryInterface.addColumn("forum_posts", "aiModeratedAt", {
          type: DataTypes.DATE,
          allowNull: true,
        })
      );
    }

    if (!table.duplicateCheckStatus && !table.duplicate_check_status) {
      operations.push(
        queryInterface.addColumn("forum_posts", "duplicateCheckStatus", {
          type: DataTypes.ENUM("pending", "processing", "clean", "duplicate", "error"),
          allowNull: false,
          defaultValue: "pending",
        })
      );
    }

    if (!table.duplicateCheckReason && !table.duplicate_check_reason) {
      operations.push(
        queryInterface.addColumn("forum_posts", "duplicateCheckReason", {
          type: DataTypes.TEXT,
          allowNull: true,
        })
      );
    }

    if (!table.contentFingerprint && !table.content_fingerprint) {
      operations.push(
        queryInterface.addColumn("forum_posts", "contentFingerprint", {
          type: DataTypes.STRING(128),
          allowNull: true,
        })
      );
    }

    if (!table.titleNormalized && !table.title_normalized) {
      operations.push(
        queryInterface.addColumn("forum_posts", "titleNormalized", {
          type: DataTypes.TEXT,
          allowNull: true,
        })
      );
    }

    if (!table.contentEmbedding && !table.content_embedding) {
      operations.push(
        queryInterface.addColumn("forum_posts", "contentEmbedding", {
          type: DataTypes.TEXT,
          allowNull: true,
        })
      );
    }

    if (!table.duplicateOfPostId && !table.duplicate_of_post_id) {
      operations.push(
        queryInterface.addColumn("forum_posts", "duplicateOfPostId", {
          type: DataTypes.UUID,
          allowNull: true,
        })
      );
    }

    if (!table.duplicateConfidence && !table.duplicate_confidence) {
      operations.push(
        queryInterface.addColumn("forum_posts", "duplicateConfidence", {
          type: DataTypes.FLOAT,
          allowNull: true,
        })
      );
    }

    if (operations.length) {
      await Promise.all(operations);
      console.log("✓ Ensured forum_posts moderation columns exist");
    }

    const latestTable = await queryInterface.describeTable("forum_posts");
    const existingIndexes = await queryInterface.showIndex("forum_posts");
    const hasIsActiveIndex = existingIndexes.some((index) => index.name === "forum_posts_is_active");
    const hasFingerprintIndex = existingIndexes.some((index) => index.name === "forum_posts_content_fingerprint");
    const hasDuplicateStatusIndex = existingIndexes.some((index) => index.name === "forum_posts_duplicate_check_status");
    const hasDuplicateOfIndex = existingIndexes.some((index) => index.name === "forum_posts_duplicate_of_post_id");

    if (!hasIsActiveIndex && (latestTable.isActive || latestTable.is_active)) {
      await queryInterface.addIndex("forum_posts", ["isActive"], {
        name: "forum_posts_is_active",
      });
      console.log("✓ Added forum_posts isActive index");
    }

    if (!hasFingerprintIndex && (latestTable.contentFingerprint || latestTable.content_fingerprint)) {
      await queryInterface.addIndex("forum_posts", ["contentFingerprint"], {
        name: "forum_posts_content_fingerprint",
      });
      console.log("✓ Added forum_posts contentFingerprint index");
    }

    if (!hasDuplicateStatusIndex && (latestTable.duplicateCheckStatus || latestTable.duplicate_check_status)) {
      await queryInterface.addIndex("forum_posts", ["duplicateCheckStatus"], {
        name: "forum_posts_duplicate_check_status",
      });
      console.log("✓ Added forum_posts duplicateCheckStatus index");
    }

    if (!hasDuplicateOfIndex && (latestTable.duplicateOfPostId || latestTable.duplicate_of_post_id)) {
      await queryInterface.addIndex("forum_posts", ["duplicateOfPostId"], {
        name: "forum_posts_duplicate_of_post_id",
      });
      console.log("✓ Added forum_posts duplicateOfPostId index");
    }
  } catch (error) {
    console.log("forum_posts table will be created by sequelize.sync()");
  }
}

async function ensureForumCommentModerationColumns() {
  const queryInterface = sequelize.getQueryInterface();
  try {
    const table = await queryInterface.describeTable("forum_comments");
    const operations = [];

    if (!table.aiModerationStatus && !table.ai_moderation_status) {
      operations.push(
        queryInterface.addColumn("forum_comments", "aiModerationStatus", {
          type: DataTypes.ENUM("pending", "approved", "rejected", "error"),
          allowNull: false,
          defaultValue: "pending",
        })
      );
    }

    if (!table.aiModerationReason && !table.ai_moderation_reason) {
      operations.push(
        queryInterface.addColumn("forum_comments", "aiModerationReason", {
          type: DataTypes.TEXT,
          allowNull: true,
        })
      );
    }

    if (!table.aiModeratedAt && !table.ai_moderated_at) {
      operations.push(
        queryInterface.addColumn("forum_comments", "aiModeratedAt", {
          type: DataTypes.DATE,
          allowNull: true,
        })
      );
    }

    if (!table.isEdited && !table.is_edited) {
      operations.push(
        queryInterface.addColumn("forum_comments", "isEdited", {
          type: DataTypes.BOOLEAN,
          allowNull: false,
          defaultValue: false,
        })
      );
    }

    if (!table.editedAt && !table.edited_at) {
      operations.push(
        queryInterface.addColumn("forum_comments", "editedAt", {
          type: DataTypes.DATE,
          allowNull: true,
        })
      );
    }

    if (!table.isDeletedByAuthor && !table.is_deleted_by_author) {
      operations.push(
        queryInterface.addColumn("forum_comments", "isDeletedByAuthor", {
          type: DataTypes.BOOLEAN,
          allowNull: false,
          defaultValue: false,
        })
      );
    }

    if (!table.deletedAt && !table.deleted_at) {
      operations.push(
        queryInterface.addColumn("forum_comments", "deletedAt", {
          type: DataTypes.DATE,
          allowNull: true,
        })
      );
    }

    if (!table.isRemovedByModerator && !table.is_removed_by_moderator) {
      operations.push(
        queryInterface.addColumn("forum_comments", "isRemovedByModerator", {
          type: DataTypes.BOOLEAN,
          allowNull: false,
          defaultValue: false,
        })
      );
    }

    if (!table.removedBy && !table.removed_by) {
      operations.push(
        queryInterface.addColumn("forum_comments", "removedBy", {
          type: DataTypes.STRING,
          allowNull: true,
        })
      );
    }

    if (!table.removedAt && !table.removed_at) {
      operations.push(
        queryInterface.addColumn("forum_comments", "removedAt", {
          type: DataTypes.DATE,
          allowNull: true,
        })
      );
    }

    if (operations.length) {
      await Promise.all(operations);
      console.log("✓ Ensured forum_comments moderation columns exist");
    }
  } catch (error) {
    console.log("forum_comments table will be created by sequelize.sync()");
  }
}

async function ensureAstrologerEarningColumns() {
  const queryInterface = sequelize.getQueryInterface();

  try {
    const table = await queryInterface.describeTable("astrologer_earnings");
    const operations = [];

    if (!table.consultation_type) {
      operations.push(
        queryInterface.addColumn("astrologer_earnings", "consultation_type", {
          type: DataTypes.ENUM("chat", "voice_call", "video_call", "live"),
          allowNull: false,
          defaultValue: "chat",
          comment: "Detailed consultation type used for dashboard split",
        })
      );
    }

    if (operations.length) {
      await Promise.all(operations);
      console.log("✓ Ensured astrologer_earnings columns exist");
    }
  } catch (error) {
    console.log("astrologer_earnings table will be created by sequelize.sync()");
  }
}

async function ensureJobApplicationColumns() {
  const queryInterface = sequelize.getQueryInterface();

  try {
    const table = await queryInterface.describeTable("job_applications");
    const operations = [];

    if (!table.linkedInUrl && !table.linked_in_url) {
      operations.push(
        queryInterface.addColumn("job_applications", "linkedInUrl", {
          type: DataTypes.TEXT,
          allowNull: true,
        })
      );
    }

    if (!table.portfolioUrl && !table.portfolio_url) {
      operations.push(
        queryInterface.addColumn("job_applications", "portfolioUrl", {
          type: DataTypes.TEXT,
          allowNull: true,
        })
      );
    }

    if (!table.acceptanceEmailSentAt && !table.acceptance_email_sent_at) {
      operations.push(
        queryInterface.addColumn("job_applications", "acceptanceEmailSentAt", {
          type: DataTypes.DATE,
          allowNull: true,
        })
      );
    }

    if (!table.rejectionEmailSentAt && !table.rejection_email_sent_at) {
      operations.push(
        queryInterface.addColumn("job_applications", "rejectionEmailSentAt", {
          type: DataTypes.DATE,
          allowNull: true,
        })
      );
    }

    if (operations.length) {
      await Promise.all(operations);
      console.log("✓ Ensured job_applications columns exist");
    }
  } catch (error) {
    console.log("job_applications table will be created by sequelize.sync()");
  }
}

async function ensureKundliReportPdfColumns() {
  const queryInterface = sequelize.getQueryInterface();

  try {
    const table = await queryInterface.describeTable("kundli_reports");
    const operations = [];

    if (!table.pdfUrl && !table.pdf_url) {
      operations.push(
        queryInterface.addColumn("kundli_reports", "pdfUrl", {
          type: DataTypes.TEXT,
          allowNull: true,
        })
      );
    }

    if (!table.pdfPublicId && !table.pdf_public_id) {
      operations.push(
        queryInterface.addColumn("kundli_reports", "pdfPublicId", {
          type: DataTypes.STRING,
          allowNull: true,
        })
      );
    }

    if (!table.pdfFileName && !table.pdf_file_name) {
      operations.push(
        queryInterface.addColumn("kundli_reports", "pdfFileName", {
          type: DataTypes.STRING,
          allowNull: true,
        })
      );
    }

    if (!table.pdfUploadedAt && !table.pdf_uploaded_at) {
      operations.push(
        queryInterface.addColumn("kundli_reports", "pdfUploadedAt", {
          type: DataTypes.DATE,
          allowNull: true,
        })
      );
    }

    if (operations.length) {
      await Promise.all(operations);
      console.log("✓ Ensured kundli_reports PDF columns exist");
    }
  } catch (error) {
    console.log("kundli_reports table will be created by sequelize.sync()");
  }
}

async function ensurePalmJobColumns() {
  const queryInterface = sequelize.getQueryInterface();
  try {
    const table = await queryInterface.describeTable("ai_jobs");
    const operations = [];

    if (!table.stage) {
      operations.push(
        queryInterface.addColumn("ai_jobs", "stage", {
          type: DataTypes.STRING,
          allowNull: false,
          defaultValue: "queued",
        })
      );
    }

    if (!table.progress) {
      operations.push(
        queryInterface.addColumn("ai_jobs", "progress", {
          type: DataTypes.INTEGER,
          allowNull: false,
          defaultValue: 5,
        })
      );
    }

    if (!table.stageMessage && !table.stage_message) {
      operations.push(
        queryInterface.addColumn("ai_jobs", "stageMessage", {
          type: DataTypes.STRING,
          allowNull: true,
        })
      );
    }

    if (operations.length) {
      await Promise.all(operations);
      console.log("Ensured ai_jobs stage columns exist");
    }
  } catch (error) {
    console.log("ai_jobs table will be created by sequelize.sync()");
  }
}

async function ensurePalmUploadColumns() {
  const queryInterface = sequelize.getQueryInterface();
  try {
    const table = await queryInterface.describeTable("palm_uploads");
    const operations = [];

    if (!table.imageHash && !table.image_hash) {
      operations.push(
        queryInterface.addColumn("palm_uploads", "imageHash", {
          type: DataTypes.STRING(64),
          allowNull: true,
        })
      );
    }

    if (operations.length) {
      await Promise.all(operations);
      console.log("Ensured palm_uploads optimization columns exist");
    }

    const updatedTable = await queryInterface.describeTable("palm_uploads");
    const indexes = await queryInterface.showIndex("palm_uploads");
    const hasImageHashIndex = indexes.some((index) => index.name === "palm_uploads_image_hash");
    if (!hasImageHashIndex && (updatedTable.imageHash || updatedTable.image_hash)) {
      const hashColumn = updatedTable.imageHash ? "imageHash" : "image_hash";
      await queryInterface.addIndex("palm_uploads", [hashColumn], {
        name: "palm_uploads_image_hash",
      });
      console.log("Ensured palm_uploads imageHash index exists");
    }
  } catch (error) {
    console.log("palm_uploads table will be created by sequelize.sync()");
  }
}

async function ensurePalmOrderColumns() {
  const queryInterface = sequelize.getQueryInterface();
  try {
    const table = await queryInterface.describeTable("palm_orders");
    const operations = [];

    if (!table.refundStatus && !table.refund_status) {
      operations.push(
        queryInterface.addColumn("palm_orders", "refundStatus", {
          type: DataTypes.ENUM("none", "pending", "processing", "completed", "failed"),
          allowNull: false,
          defaultValue: "none",
        })
      );
    }
    if (!table.refundReason && !table.refund_reason) {
      operations.push(
        queryInterface.addColumn("palm_orders", "refundReason", {
          type: DataTypes.STRING,
          allowNull: true,
        })
      );
    }
    if (!table.refundProcessedAt && !table.refund_processed_at) {
      operations.push(
        queryInterface.addColumn("palm_orders", "refundProcessedAt", {
          type: DataTypes.DATE,
          allowNull: true,
        })
      );
    }
    if (!table.refundRazorpayId && !table.refund_razorpay_id) {
      operations.push(
        queryInterface.addColumn("palm_orders", "refundRazorpayId", {
          type: DataTypes.STRING,
          allowNull: true,
        })
      );
    }

    if (operations.length) {
      await Promise.all(operations);
      console.log("Ensured palm_orders refund columns exist");
    }
  } catch (error) {
    console.log("palm_orders table will be created by sequelize.sync()");
  }
}

const initDB = (callback) => {
  sequelize
    .authenticate()
    .then(() => {
      console.log("Connected to PostgreSQL");
      require("../model/associations/associations");
      // Basic sync (no alter) to avoid complex ALTER TABLE for all models
      return sequelize.sync();
    })
    .then(() => ensureChatSessionColumns())
    .then(() => ensureChatMessageColumns())
    .then(() => ensureChatMessageVoiceEnumValues())
    .then(() => ensureLiveChatMessageColumns())
    .then(() => ensureBlogColumns())
    .then(() => ensureAIChatSessionColumns())
    .then(() => ensureWalletColumns())
    .then(() => ensureKundliShareColumns())
    .then(() => ensureUserPreferenceColumns())
    .then(() => ensureForumPostModerationColumns())
    .then(() => ensureForumCommentModerationColumns())
    .then(() => ensureAstrologerEarningColumns())
    .then(() => ensureJobApplicationColumns())
    .then(() => ensureKundliReportPdfColumns())
    .then(() => ensurePalmJobColumns())
    .then(() => ensurePalmUploadColumns())
    .then(() => ensurePalmOrderColumns())
    .then(() => {
      console.log("All models synced");
      callback();
    })
    .catch((error) => {
      console.error("Error connecting to the database:", error);
      process.exit(1);
    });
};
module.exports = initDB;

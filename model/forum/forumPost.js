const { DataTypes } = require("sequelize");
const { sequelize } = require("../../dbConnection/dbConfig");

const serializeArray = (value) => {
  if (!value || (Array.isArray(value) && value.length === 0)) {
    return null;
  }

  return JSON.stringify(value);
};

const deserializeArray = (value) => {
  if (!value) {
    return [];
  }

  try {
    return JSON.parse(value);
  } catch {
    return [];
  }
};

const ForumPost = sequelize.define(
  "ForumPost",
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    authorUserId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: "users",
        key: "id",
      },
      onDelete: "CASCADE",
      onUpdate: "CASCADE",
    },
    title: {
      type: DataTypes.STRING,
      allowNull: false,
      validate: {
        len: [3, 180],
      },
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    image: {
      type: DataTypes.STRING,
      allowNull: true,
      defaultValue: null,
    },
    images: {
      type: DataTypes.TEXT,
      allowNull: true,
      defaultValue: null,
      get() {
        return deserializeArray(this.getDataValue("images"));
      },
      set(value) {
        this.setDataValue("images", serializeArray(value));
      },
    },
    tags: {
      type: DataTypes.TEXT,
      allowNull: true,
      defaultValue: null,
      get() {
        return deserializeArray(this.getDataValue("tags"));
      },
      set(value) {
        this.setDataValue("tags", serializeArray(value));
      },
    },
    authorDisplayMode: {
      type: DataTypes.ENUM("real", "anonymous"),
      allowNull: false,
      defaultValue: "real",
    },
    authorName: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    authorAvatarSeed: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    authorAnonymousHash: {
      type: DataTypes.STRING,
      allowNull: true,
      defaultValue: null,
    },
    likeCount: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    commentCount: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    shareCount: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
    moderationReason: {
      type: DataTypes.TEXT,
      allowNull: true,
      defaultValue: null,
    },
    moderatedByAdminId: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: "admins",
        key: "id",
      },
      onDelete: "SET NULL",
      onUpdate: "CASCADE",
    },
    moderatedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      defaultValue: null,
    },
    aiModerationStatus: {
      type: DataTypes.ENUM("pending", "approved", "rejected", "error"),
      allowNull: false,
      defaultValue: "pending",
    },
    aiModerationReason: {
      type: DataTypes.TEXT,
      allowNull: true,
      defaultValue: null,
    },
    aiModeratedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      defaultValue: null,
    },
    duplicateCheckStatus: {
      type: DataTypes.ENUM("pending", "processing", "clean", "duplicate", "error"),
      allowNull: false,
      defaultValue: "pending",
    },
    duplicateCheckReason: {
      type: DataTypes.TEXT,
      allowNull: true,
      defaultValue: null,
    },
    contentFingerprint: {
      type: DataTypes.STRING(128),
      allowNull: true,
      defaultValue: null,
    },
    titleNormalized: {
      type: DataTypes.TEXT,
      allowNull: true,
      defaultValue: null,
    },
    contentEmbedding: {
      type: DataTypes.TEXT,
      allowNull: true,
      defaultValue: null,
    },
    duplicateOfPostId: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: "forum_posts",
        key: "id",
      },
      onDelete: "SET NULL",
      onUpdate: "CASCADE",
    },
    duplicateConfidence: {
      type: DataTypes.FLOAT,
      allowNull: true,
      defaultValue: null,
    },
    lastActivityAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    tableName: "forum_posts",
    timestamps: true,
    indexes: [
      {
        fields: ["createdAt"],
      },
      {
        fields: ["likeCount"],
      },
      {
        fields: ["commentCount"],
      },
      {
        fields: ["authorUserId"],
      },
      {
        fields: ["lastActivityAt"],
      },
    ],
  }
);

module.exports = ForumPost;
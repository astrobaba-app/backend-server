const { DataTypes } = require("sequelize");
const { sequelize } = require("../../dbConnection/dbConfig");

const ForumComment = sequelize.define(
  "ForumComment",
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    postId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: "forum_posts",
        key: "id",
      },
      onDelete: "CASCADE",
      onUpdate: "CASCADE",
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
    parentCommentId: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: "forum_comments",
        key: "id",
      },
      onDelete: "CASCADE",
      onUpdate: "CASCADE",
    },
    content: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    depth: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    sortOrder: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    path: {
      type: DataTypes.STRING(2048),
      allowNull: false,
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
    replyCount: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    descendantCount: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
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
    isEdited: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    editedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      defaultValue: null,
    },
    isDeletedByAuthor: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    deletedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      defaultValue: null,
    },
    isRemovedByModerator: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    removedBy: {
      type: DataTypes.STRING,
      allowNull: true,
      defaultValue: null,
    },
    removedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      defaultValue: null,
    },
  },
  {
    tableName: "forum_comments",
    timestamps: true,
    indexes: [
      {
        fields: ["postId", "parentCommentId", "sortOrder"],
      },
      {
        fields: ["postId", "path"],
      },
      {
        fields: ["authorUserId"],
      },
    ],
  }
);

module.exports = ForumComment;
const { DataTypes, Op } = require("sequelize");
const { sequelize } = require("../../dbConnection/dbConfig");

const BlogLike = sequelize.define(
  "BlogLike",
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    blogId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: "blogs",
        key: "id",
      },
      onDelete: "CASCADE",
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: "users",
        key: "id",
      },
      onDelete: "CASCADE",
      comment: "Null if liked by anonymous user",
    },
    ipAddress: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: "IP address for anonymous users to prevent spam",
    },
    userAgent: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: "Browser user agent for additional tracking",
    },
  },
  {
    tableName: "blog_likes",
    timestamps: true,
    indexes: [
      {
        unique: true,
        fields: ["blogId", "userId"],
        name: "unique_blog_user_like",
        where: {
          userId: {
            [Op.ne]: null,
          },
        },
      },
      {
        fields: ["blogId"],
      },
      {
        fields: ["userId"],
      },
      {
        fields: ["ipAddress"],
      },
    ],
  }
);

module.exports = BlogLike;

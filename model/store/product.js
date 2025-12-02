const { DataTypes } = require("sequelize");
const { sequelize } = require("../../dbConnection/dbConfig");

const Product = sequelize.define(
  "Product",
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    productName: {
      type: DataTypes.STRING(200),
      allowNull: false,
    },
    slug: {
      type: DataTypes.STRING(250),
      unique: true,
      allowNull: false,
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    shortDescription: {
      type: DataTypes.STRING(500),
    },
    price: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      validate: {
        min: 0,
      },
    },
    discountPrice: {
      type: DataTypes.DECIMAL(10, 2),
      validate: {
        min: 0,
      },
    },
    images: {
      type: DataTypes.ARRAY(DataTypes.TEXT),
      defaultValue: [],
    },
    category: {
      type: DataTypes.ENUM(
        "gemstone",
        "rudraksha",
        "yantra",
        "idol",
        "book",
        "report",
        "puja_samagri",
        "bracelet",
        "pendant",
        "other"
      ),
      allowNull: false,
    },
    productType: {
      type: DataTypes.ENUM("digital", "physical"),
      allowNull: false,
      defaultValue: "physical",
    },
    digitalFileUrl: {
      type: DataTypes.TEXT,
      // For digital products like reports, PDFs, etc.
    },
    downloadLinkExpiry: {
      type: DataTypes.INTEGER,
      defaultValue: 30, // days
      comment: "Number of days the download link is valid for digital products",
    },
    stock: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      validate: {
        min: 0,
      },
    },
    soldCount: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      validate: {
        min: 0,
      },
    },
    averageRating: {
      type: DataTypes.DECIMAL(2, 1),
      defaultValue: 0,
      validate: {
        min: 0,
        max: 5,
      },
    },
    totalReviews: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      validate: {
        min: 0,
      },
    },
    weight: {
      type: DataTypes.DECIMAL(8, 2),
      comment: "Weight in grams (for physical products)",
    },
    dimensions: {
      type: DataTypes.JSONB,
      comment: "Length, width, height in cm",
    },
    tags: {
      type: DataTypes.ARRAY(DataTypes.STRING),
      defaultValue: [],
    },
    isFeatured: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
    },
    seoTitle: {
      type: DataTypes.STRING(200),
    },
    seoDescription: {
      type: DataTypes.STRING(500),
    },
    seoKeywords: {
      type: DataTypes.ARRAY(DataTypes.STRING),
      defaultValue: [],
    },
  },
  {
    tableName: "products",
    timestamps: true,
    indexes: [
      {
        fields: ["slug"],
        unique: true,
      },
      {
        fields: ["category"],
      },
      {
        fields: ["productType"],
      },
      {
        fields: ["isActive"],
      },
      {
        fields: ["isFeatured"],
      },
      {
        fields: ["averageRating"],
      },
      {
        fields: ["price"],
      },
      {
        fields: ["createdAt"],
      },
    ],
  }
);

module.exports = Product;

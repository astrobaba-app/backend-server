const { DataTypes } = require("sequelize");
const { sequelize } = require("../../dbConnection/dbConfig");

const Astrologer = sequelize.define(
  "Astrologer",
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    phoneNumber: {
      type: DataTypes.STRING(15),
      allowNull: false,
      unique: true,
      validate: {
        isNumeric: true,
        len: [10, 15],
      },
    },
    email: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
      validate: {
        isEmail: true,
      },
    },
    password: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    fullName: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    photo: {
      type: DataTypes.STRING,
      allowNull: true,
      defaultValue: null,
    },
    dateOfBirth: {
      type: DataTypes.DATEONLY,
      allowNull: true,
    },
    languages: {
      type: DataTypes.ARRAY(DataTypes.STRING),
      allowNull: false,
      defaultValue: [],
      comment: "Languages: Hindi, English, Bengali, Tamil, Telugu, Marathi, Gujarati, Kannada, Malayalam, Punjabi, Odia, Urdu",
    },
    skills: {
      type: DataTypes.ARRAY(DataTypes.STRING),
      allowNull: false,
      defaultValue: [],
      comment: "Skills: Vedic, KP, Numerology, Tarot, Palmistry, Vastu, Prashna, Nadi, Lal Kitab, Face Reading",
    },
    yearsOfExperience: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      validate: {
        min: 0,
      },
    },
    isApproved: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
    },
    isOnline: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      comment: "Current online/offline status for consultations",
    },
    bio: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    rating: {
      type: DataTypes.DECIMAL(3, 2),
      defaultValue: 0.0,
      validate: {
        min: 0,
        max: 5,
      },
    },
    totalConsultations: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
    },
    pricePerMinute: {
      type: DataTypes.DECIMAL(10, 2),
      defaultValue: 0.0,
    },
    availability: {
      type: DataTypes.JSONB,
      defaultValue: {},
      comment: "Availability schedule in JSON format",
    },
  },
  {
    tableName: "astrologers",
    timestamps: true,
  }
);

module.exports = Astrologer;

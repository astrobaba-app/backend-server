const User = require("../user/userAuth");
const UserRequest = require("../user/userRequest");
const Kundli = require("../horoscope/kundli");
const MatchingProfile = require("../horoscope/matchingProfile");
const GoogleAuth = require("../user/googleAuth");



  // User has many UserRequests
  User.hasMany(UserRequest, {
    foreignKey: "userId",
    as: "userRequests",
    onDelete: "CASCADE",
  });

  UserRequest.belongsTo(User, {
    foreignKey: "userId",
    as: "user",
  });

  // UserRequest has one Kundli
  UserRequest.hasOne(Kundli, {
    foreignKey: "requestId",
    as: "kundli",
    onDelete: "CASCADE",
  });

  Kundli.belongsTo(UserRequest, {
    foreignKey: "requestId",
    as: "userRequest",
  });


    User.hasOne(GoogleAuth, {
    foreignKey: "userId",
    as: "googleAuth",
    onDelete: "CASCADE",
  });

  GoogleAuth.belongsTo(User, {
    foreignKey: "userId",
    as: "user",
  });

  // MatchingProfile belongs to User
  User.hasMany(MatchingProfile, {
    foreignKey: "userId",
    as: "matchingProfiles",
    onDelete: "CASCADE",
  });

  MatchingProfile.belongsTo(User, {
    foreignKey: "userId",
    as: "user",
  });


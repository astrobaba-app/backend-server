const User = require("../user/userAuth");
const UserRequest = require("../user/userRequest");
const Kundli = require("../horoscope/kundli");
const KundliMatch = require("../horoscope/kundliMatching");
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

  // KundliMatch belongs to two UserRequests
  KundliMatch.belongsTo(UserRequest, {
    foreignKey: "request1Id",
    as: "userRequest1",
  });

  KundliMatch.belongsTo(UserRequest, {
    foreignKey: "request2Id",
    as: "userRequest2",
  });

  UserRequest.hasMany(KundliMatch, {
    foreignKey: "request1Id",
    as: "kundliMatchesAsRequest1",
  });

  UserRequest.hasMany(KundliMatch, {
    foreignKey: "request2Id",
    as: "kundliMatchesAsRequest2",
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



const crypto = require("crypto");
const User = require("../model/user/userAuth");

const ADJECTIVES = [
  "Silent",
  "Curious",
  "Cosmic",
  "Radiant",
  "Hidden",
  "Swift",
  "Golden",
  "Calm",
  "Wild",
  "Lucky",
  "Secret",
  "Bright",
  "Mystic",
  "Gentle",
  "Shadow",
  "Wise",
  "Crimson",
  "Amber",
  "Silver",
  "Velvet",
];

const ANIMALS = [
  "Tiger",
  "Fox",
  "Falcon",
  "Wolf",
  "Panda",
  "Otter",
  "Hawk",
  "Lynx",
  "Raven",
  "Cobra",
  "Panther",
  "Stag",
  "Whale",
  "Sparrow",
  "Leopard",
  "Phoenix",
  "Koala",
  "Viper",
  "Jaguar",
  "Dolphin",
];

const FORUM_HASH_SALT = process.env.FORUM_ANON_SALT || "graho-forum-anon";

const createHash = (value) =>
  crypto.createHash("sha256").update(`${value}:${FORUM_HASH_SALT}`).digest("hex");

const randomFrom = (values) => values[Math.floor(Math.random() * values.length)];

const createAlias = () => `${randomFrom(ADJECTIVES)}${randomFrom(ANIMALS)}${Math.floor(100 + Math.random() * 900)}`;

const getRealDisplayName = (user) => {
  if (user.fullName && user.fullName.trim()) {
    return user.fullName.trim();
  }

  if (user.mobile) {
    const digits = String(user.mobile);
    return `User ${digits.slice(-4)}`;
  }

  return "Graho User";
};

const ensureAnonymousIdentity = async (user, transaction) => {
  if (user.forumAnonymousHandle && user.forumAnonymousHash) {
    return {
      alias: user.forumAnonymousHandle,
      hash: user.forumAnonymousHash,
    };
  }

  for (let attempt = 0; attempt < 25; attempt += 1) {
    const alias = createAlias();
    const hash = createHash(`${user.id}:${alias}`);

    const existingAlias = await User.findOne({
      where: { forumAnonymousHandle: alias },
      transaction,
    });

    if (existingAlias) {
      continue;
    }

    user.forumAnonymousHandle = alias;
    user.forumAnonymousHash = hash;
    await user.save({ transaction });

    return { alias, hash };
  }

  throw new Error("Unable to generate anonymous forum identity");
};

const buildForumAuthorSnapshot = async (user, transaction) => {
  if (user.forumIdentityMode === "anonymous") {
    const anonymousIdentity = await ensureAnonymousIdentity(user, transaction);

    return {
      authorUserId: user.id,
      authorDisplayMode: "anonymous",
      authorName: anonymousIdentity.alias,
      authorAvatarSeed: anonymousIdentity.hash.slice(0, 12),
      authorAnonymousHash: anonymousIdentity.hash,
    };
  }

  const realName = getRealDisplayName(user);

  return {
    authorUserId: user.id,
    authorDisplayMode: "real",
    authorName: realName,
    authorAvatarSeed: createHash(`${user.id}:${realName}`).slice(0, 12),
    authorAnonymousHash: null,
  };
};

module.exports = {
  buildForumAuthorSnapshot,
  ensureAnonymousIdentity,
  getRealDisplayName,
};
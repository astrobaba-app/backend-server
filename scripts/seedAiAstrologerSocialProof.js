require("dotenv").config();

const crypto = require("crypto");
const { sequelize, connectDB } = require("../dbConnection/dbConfig");
const User = require("../model/user/userAuth");
const AIChatSession = require("../model/aiChat/aiChatSession");

const DEFAULT_NAMED_DUMMY_USER_COUNT = 80;
const DEFAULT_ANONYMOUS_STYLE_USER_COUNT = 30;
const DEFAULT_SESSION_COUNT = 1400;
const AI_CHAT_PRICE_PER_MINUTE = Number(process.env.AI_CHAT_PRICE_PER_MINUTE || 10);
const SCRIPT_MARKER = "seeded-ai-social-proof";
const SEEDED_SESSION_TITLE = "Seeded AI consultation";

const AI_ASTROLOGER_IDS = new Set([
  "ai-astrologer-devansh",
  "ai-astrologer-ritika",
  "ai-astrologer-arjun",
]);

const FIRST_NAMES = [
  "Aarav", "Aditi", "Ananya", "Arjun", "Bhavna", "Diya", "Ishaan", "Ishita",
  "Kabir", "Kavya", "Khushi", "Laksh", "Meera", "Mohit", "Neha", "Nikhil",
  "Palak", "Parth", "Pooja", "Pranav", "Priyanshi", "Raghav", "Rahul", "Rashi",
  "Ritika", "Saanvi", "Sakshi", "Samarth", "Sanya", "Shivam", "Shruti", "Simran",
  "Sneha", "Tanya", "Vaishnavi", "Vidhi", "Yash", "Yuvraj", "Zoya", "Rohan",
  "Aman", "Naina", "Kiran", "Divya", "Payal", "Harsh", "Manav", "Gauri",
  "Dev", "Tanvi", "Vansh", "Reyansh", "Mahi", "Prerna", "Muskan", "Aniket",
  "Jatin", "Komal", "Charu", "Ritu", "Deepak", "Sonal", "Varun", "Nupur",
];

const LAST_NAMES = [
  "Agarwal", "Arora", "Bansal", "Chauhan", "Dubey", "Goyal", "Gupta", "Jain",
  "Joshi", "Kapoor", "Khan", "Malhotra", "Mehta", "Mishra", "Patel", "Rao",
  "Saxena", "Shah", "Sharma", "Singh", "Sinha", "Tiwari", "Trivedi", "Varma",
  "Verma", "Yadav", "Bhardwaj", "Chawla", "Nair", "Iyer", "Kulkarni", "Bose",
];

const REVIEW_PHRASES = [
  "clear guidance with practical remedies",
  "helped me feel calm and focused",
  "insightful reading with useful timing",
  "easy to understand and comforting",
  "felt accurate and genuinely helpful",
  "answered my concerns with clarity",
  "supportive guidance and simple advice",
  "gave detailed answers without confusion",
  "very positive experience and reassuring",
  "good predictions and thoughtful direction",
  "clear response with balanced suggestions",
  "helpful explanation and calm conversation",
];

const parseArgs = () => {
  const args = {};
  process.argv.slice(2).forEach((entry) => {
    if (!entry.startsWith("--")) {
      return;
    }

    const [rawKey, ...valueParts] = entry.slice(2).split("=");
    args[rawKey] = valueParts.length ? valueParts.join("=") : "true";
  });

  return args;
};

const normalizeCount = (value, fallback, key) => {
  const parsed = Number.parseInt(String(value ?? fallback), 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`Invalid --${key}. Expected a non-negative integer.`);
  }
  return parsed;
};

const randomInt = (min, max) =>
  Math.floor(Math.random() * (max - min + 1)) + min;

const buildReviewText = () => {
  const targetWords = randomInt(6, 14);
  const words = [];

  while (words.length < targetWords) {
    const phrase =
      REVIEW_PHRASES[randomInt(0, REVIEW_PHRASES.length - 1)].split(" ");
    words.push(...phrase);
  }

  return words.slice(0, targetWords).join(" ");
};

const buildRatings = (count) =>
  Array.from({ length: count }, () => Number((4.6 + Math.random() * 0.4).toFixed(1)));

const buildNamedPeople = (count) => {
  const people = [];
  const usedNames = new Set();
  let cursor = 0;

  while (people.length < count) {
    const firstName = FIRST_NAMES[cursor % FIRST_NAMES.length];
    const lastName =
      LAST_NAMES[Math.floor(cursor / FIRST_NAMES.length) % LAST_NAMES.length];
    const fullName = `${firstName} ${lastName}`;
    cursor += 1;

    if (usedNames.has(fullName)) {
      continue;
    }

    usedNames.add(fullName);
    const slug = fullName.toLowerCase().replace(/[^a-z]+/g, ".");

    people.push({
      fullName,
      email: `${SCRIPT_MARKER}.${slug}@example.com`,
      mobile: `9${String(700000000 + people.length).padStart(9, "0")}`,
    });
  }

  return people;
};

const buildAnonymousPeople = (count) => {
  const people = [];
  const usedLabels = new Set();
  let cursor = 0;

  while (people.length < count) {
    const firstName = FIRST_NAMES[(cursor * 3) % FIRST_NAMES.length];
    const lastName = LAST_NAMES[(cursor * 5) % LAST_NAMES.length];
    const label = `${firstName.charAt(0)}. ${lastName}`;
    cursor += 1;

    if (usedLabels.has(label)) {
      continue;
    }

    usedLabels.add(label);
    const slug = `${firstName.charAt(0).toLowerCase()}.${lastName.toLowerCase()}`;

    people.push({
      fullName: label,
      email: `${SCRIPT_MARKER}.anon.${slug}@example.com`,
      mobile: `8${String(800000000 + people.length).padStart(9, "0")}`,
    });
  }

  return people;
};

const ensureDummyUser = async (person, transaction) => {
  const existingUser = await User.findOne({
    where: { email: person.email },
    transaction,
  });

  if (existingUser) {
    return existingUser;
  }

  return User.create(
    {
      fullName: person.fullName,
      email: person.email,
      mobile: person.mobile,
      password: crypto.randomBytes(16).toString("hex"),
      isActive: true,
      isOnboarded: true,
      loginCount: 1,
      firstLoginAt: new Date(),
      lastLoginAt: new Date(),
      lastLoginMethod: "phone",
    },
    { transaction }
  );
};

const main = async () => {
  const args = parseArgs();
  const astrologerId = String(args.astrologerId || "").trim();
  const namedReviewCount = normalizeCount(
    args.namedReviews,
    DEFAULT_NAMED_DUMMY_USER_COUNT,
    "namedReviews"
  );
  const anonymousReviewCount = normalizeCount(
    args.anonymousReviews,
    DEFAULT_ANONYMOUS_STYLE_USER_COUNT,
    "anonymousReviews"
  );
  const totalReviewCount = namedReviewCount + anonymousReviewCount;
  const sessionCount = normalizeCount(
    args.sessionCount,
    DEFAULT_SESSION_COUNT,
    "sessionCount"
  );

  if (!AI_ASTROLOGER_IDS.has(astrologerId)) {
    throw new Error(
      "Invalid --astrologerId. Use one of: ai-astrologer-devansh, ai-astrologer-ritika, ai-astrologer-arjun"
    );
  }

  if (sessionCount < totalReviewCount) {
    throw new Error("--sessionCount must be greater than or equal to total reviews.");
  }

  await connectDB();
  const transaction = await sequelize.transaction();

  try {
    const namedPeople = buildNamedPeople(namedReviewCount);
    const anonymousPeople = buildAnonymousPeople(anonymousReviewCount);
    const reviewPeople = [...namedPeople, ...anonymousPeople];
    const reviewUsers = [];

    for (const person of reviewPeople) {
      reviewUsers.push(await ensureDummyUser(person, transaction));
    }

    await AIChatSession.destroy({
      where: {
        astrologerId,
        title: SEEDED_SESSION_TITLE,
      },
      transaction,
    });

    const ratings = buildRatings(totalReviewCount);
    const sessionRows = [];

    for (let index = 0; index < sessionCount; index += 1) {
      const seededUser = reviewUsers[index % reviewUsers.length];
      const durationMinutes = randomInt(1, 8);
      const endTime = new Date(Date.now() - randomInt(1, 150) * 24 * 60 * 60 * 1000);
      const startTime = new Date(endTime.getTime() - durationMinutes * 60 * 1000);
      const withFeedback = index < totalReviewCount;
      const rating = withFeedback ? ratings[index] : null;
      const review = withFeedback ? buildReviewText() : null;

      sessionRows.push({
        userId: seededUser.id,
        astrologerId,
        title: SEEDED_SESSION_TITLE,
        isActive: false,
        status: "completed",
        startTime,
        endTime,
        totalMinutes: durationMinutes,
        totalCost: Number((durationMinutes * AI_CHAT_PRICE_PER_MINUTE).toFixed(2)),
        billedAmount: Number((durationMinutes * AI_CHAT_PRICE_PER_MINUTE).toFixed(2)),
        pricePerMinute: AI_CHAT_PRICE_PER_MINUTE,
        billingSource: "wallet",
        endReason: SCRIPT_MARKER,
        lastMessagePreview: "Seeded AI consultation",
        lastMessageAt: endTime,
        feedbackRating: rating,
        feedbackReview: review,
        feedbackSubmittedAt: withFeedback ? endTime : null,
        createdAt: startTime,
        updatedAt: endTime,
      });
    }

    await AIChatSession.bulkCreate(sessionRows, { transaction });
    await transaction.commit();

    console.log("Seeded AI astrologer social proof successfully.");
    console.log(
      JSON.stringify(
        {
          astrologerId,
          generatedSessions: sessionCount,
          generatedReviews: totalReviewCount,
          namedDummyUsers: namedReviewCount,
          anonymousStyleUsers: anonymousReviewCount,
          note: "Created only seeded AI chat sessions in ai_chat_sessions. Total consultations now come from completed AI sessions, and ratings/reviews come from submitted AI feedback.",
        },
        null,
        2
      )
    );
  } catch (error) {
    await transaction.rollback();
    throw error;
  } finally {
    await sequelize.close().catch(() => null);
  }
};

main().catch((error) => {
  console.error("Failed to seed AI astrologer social proof:", error);
  process.exit(1);
});

require("dotenv").config();

const { Op } = require("sequelize");
const { sequelize, connectDB } = require("../dbConnection/dbConfig");
const User = require("../model/user/userAuth");
const Astrologer = require("../model/astrologer/astrologer");
const Review = require("../model/review/review");

const SCRIPT_PREFIX = "review-seed";
const DEFAULT_NAMED_DUMMY_USER_COUNT = 80;
const DEFAULT_ANONYMOUS_STYLE_USER_COUNT = 30;
const DEFAULT_SESSION_COUNT = 1200;

const DUMMY_FIRST_NAMES = [
  "Priya",
  "Rahul",
  "Sneha",
  "Amit",
  "Neha",
  "Rohit",
  "Anjali",
  "Karan",
  "Pooja",
  "Vikas",
  "Ritika",
  "Arjun",
  "Kavya",
  "Sandeep",
  "Meera",
  "Varun",
  "Ishita",
  "Nitin",
  "Sakshi",
  "Harsh",
  "Tanvi",
  "Manish",
  "Aarti",
  "Deepak",
  "Nisha",
  "Mohit",
  "Payal",
  "Abhishek",
  "Simran",
  "Yash",
  "Komal",
  "Aditya",
  "Shreya",
  "Tarun",
  "Muskan",
  "Gaurav",
  "Rashi",
  "Devansh",
  "Preeti",
  "Nakul",
  "Bhavna",
  "Aniket",
  "Tanya",
  "Ritesh",
  "Ira",
  "Pranav",
  "Divya",
  "Sarthak",
  "Mansi",
  "Ayush",
  "Lavanya",
  "Chirag",
  "Rhea",
  "Kunal",
  "Sonal",
  "Vani",
  "Aarav",
  "Ishaan",
  "Myra",
  "Tushar",
  "Ayesha",
  "Raghav",
  "Nandini",
  "Kabir",
  "Siya",
  "Dhruv",
  "Palak",
  "Vivaan",
  "Aarohi",
  "Krish",
  "Suhani",
  "Reyansh",
  "Navya",
  "Parth",
  "Trisha",
  "Laksh",
  "Samaira",
  "Arnav",
  "Kiara",
  "Vedant",
  "Ruhi",
  "Shaurya",
  "Amaira",
  "Yuvraj",
  "Anaya",
  "Atharv",
  "Diya",
  "Rudra",
  "Veda",
  "Armaan",
  "Ishika",
  "Ayaan",
  "Prisha",
  "Riaan",
  "Mahira",
  "Aadvik",
  "Sara",
  "Vihaan",
  "Nitya",
  "Kiaan",
];

const DUMMY_LAST_NAMES = [
  "Sharma",
  "Verma",
  "Gupta",
  "Singh",
  "Kapoor",
  "Mehta",
  "Nair",
  "Malhotra",
  "Yadav",
  "Jain",
  "Saini",
  "Bhatia",
  "Iyer",
  "Mishra",
  "Joshi",
  "Khanna",
  "Roy",
  "Arora",
  "Chauhan",
  "Vora",
  "Desai",
  "Tiwari",
  "Kulkarni",
  "Bansal",
  "Reddy",
  "Chawla",
  "Saxena",
  "Rana",
  "Bedi",
  "Patil",
  "Dubey",
  "Bhardwaj",
  "Pillai",
  "Aggarwal",
  "Tripathi",
  "Khatri",
  "Sood",
  "Narang",
  "Sethi",
  "Kohli",
  "Bhagat",
  "Parmar",
  "Chatterjee",
  "Goel",
  "Mahajan",
  "Grover",
  "Oberoi",
  "Srivastava",
  "Bora",
  "Menon",
];

const ANONYMOUS_FIRST_NAMES = [
  "Priya",
  "Rahul",
  "Sneha",
  "Amit",
  "Neha",
  "Rohit",
  "Anjali",
  "Karan",
  "Pooja",
  "Vikas",
  "Ritika",
  "Arjun",
  "Kavya",
  "Sandeep",
  "Meera",
  "Varun",
  "Ishita",
  "Nitin",
  "Sakshi",
  "Harsh",
  "Tanvi",
  "Manish",
  "Aarti",
  "Deepak",
  "Nisha",
  "Mohit",
  "Payal",
  "Abhishek",
  "Simran",
  "Yash",
];

const REVIEW_PHRASES = [
  ["very", "clear", "guidance", "and", "helpful", "timing", "for", "my", "career", "decision"],
  ["accurate", "reading", "with", "calm", "advice", "that", "felt", "genuine", "and", "practical"],
  ["the", "session", "was", "supportive", "detailed", "and", "easy", "to", "understand", "throughout"],
  ["honest", "insights", "good", "clarity", "and", "a", "very", "comforting", "overall", "experience"],
  ["quick", "responses", "useful", "suggestions", "and", "strong", "clarity", "about", "next", "steps"],
  ["really", "positive", "experience", "with", "clear", "answers", "and", "confident", "guidance", "today"],
  ["helpful", "consultation", "for", "relationship", "questions", "with", "kind", "balanced", "advice"],
  ["detailed", "predictions", "and", "simple", "remedies", "shared", "in", "a", "very", "practical", "way"],
  ["felt", "heard", "understood", "and", "guided", "with", "clarity", "during", "the", "full", "session"],
  ["strong", "intuition", "accurate", "timing", "and", "clear", "answers", "to", "my", "main", "questions"],
  ["peaceful", "conversation", "with", "useful", "direction", "for", "work", "family", "and", "future"],
  ["very", "reassuring", "talk", "with", "specific", "guidance", "that", "made", "sense", "immediately"],
];

const parseArgs = () => {
  const args = process.argv.slice(2);
  const parsed = {};

  args.forEach((arg) => {
    const normalized = String(arg || "").trim();
    if (!normalized.startsWith("--")) {
      return;
    }

    const [rawKey, ...rest] = normalized.slice(2).split("=");
    parsed[rawKey] = rest.length ? rest.join("=") : "true";
  });

  return parsed;
};

const randomInt = (min, max) =>
  Math.floor(Math.random() * (max - min + 1)) + min;

const shuffle = (items) => {
  const next = [...items];
  for (let index = next.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [next[index], next[swapIndex]] = [next[swapIndex], next[index]];
  }
  return next;
};

const buildReviewText = () => {
  const phrase = REVIEW_PHRASES[randomInt(0, REVIEW_PHRASES.length - 1)];
  const desiredWordCount = randomInt(6, 14);
  return phrase.slice(0, Math.min(desiredWordCount, phrase.length)).join(" ");
};

const buildRatings = (totalCount) => {
  const ratings = new Array(totalCount).fill(5);
  const fourStarCount = randomInt(0, 32);

  for (let index = 0; index < fourStarCount; index += 1) {
    ratings[index] = 4;
  }

  return shuffle(ratings);
};

const normalizeSessionCount = (value) => {
  const parsed = Number.parseInt(String(value || DEFAULT_SESSION_COUNT), 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error("sessionCount must be a positive integer.");
  }
  return parsed;
};

const normalizeReviewCount = (value, fallback, label) => {
  const parsed = Number.parseInt(String(value || fallback), 10);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`${label} must be zero or a positive integer.`);
  }
  return parsed;
};

const buildDummyPeople = ({ namedCount, anonymousCount }) => {
  const people = [];
  const usedNames = new Set();
  let sequence = 1;
  let createdNamedCount = 0;

  if (namedCount > DUMMY_FIRST_NAMES.length) {
    throw new Error(
      `namedReviews exceeds the available diversified first-name pool. Max supported without frequent repeats is ${DUMMY_FIRST_NAMES.length}.`
    );
  }

  for (let index = 0; index < namedCount; index += 1) {
    const firstName = DUMMY_FIRST_NAMES[index];
    const lastName = DUMMY_LAST_NAMES[index % DUMMY_LAST_NAMES.length];
    const baseName = `${firstName} ${lastName}`;

    if (usedNames.has(baseName.toLowerCase())) {
      continue;
    }

    usedNames.add(baseName.toLowerCase());
    people.push({
      fullName: baseName,
      email: `${SCRIPT_PREFIX}.dummy.${String(sequence).padStart(3, "0")}@graho.local`,
      mobile: `930000${String(sequence).padStart(4, "0")}`,
      forumIdentityMode: "anonymous",
    });
    sequence += 1;
    createdNamedCount += 1;
  }

  if (createdNamedCount < namedCount) {
    throw new Error("Could not build enough unique named dummy users for review seeding.");
  }

  for (let index = 0; index < anonymousCount; index += 1) {
    const firstName = ANONYMOUS_FIRST_NAMES[index];
    const lastName = DUMMY_LAST_NAMES[index % DUMMY_LAST_NAMES.length];
    const fullName = `${firstName.charAt(0)}. ${lastName}`;
    people.push({
      fullName,
      email: `${SCRIPT_PREFIX}.anon.${String(index + 1).padStart(3, "0")}@graho.local`,
      mobile: `940000${String(index + 1).padStart(4, "0")}`,
      forumIdentityMode: "anonymous",
    });
  }

  if (people.length < namedCount + anonymousCount) {
    throw new Error("Could not build enough dummy users for review seeding.");
  }

  return people;
};

const ensureDummyUser = async (person, transaction) => {
  const existing = await User.findOne({
    where: {
      [Op.or]: [{ email: person.email }, { mobile: person.mobile }],
    },
    transaction,
  });

  if (existing) {
    await existing.update(
      {
        fullName: person.fullName,
        email: person.email,
        mobile: person.mobile,
        forumIdentityMode: person.forumIdentityMode,
        isActive: true,
      },
      { transaction }
    );
    return existing;
  }

  return User.create(
    {
      fullName: person.fullName,
      email: person.email,
      mobile: person.mobile,
      forumIdentityMode: person.forumIdentityMode,
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

const updateAstrologerAggregate = async (astrologerId, sessionCount, transaction) => {
  const reviews = await Review.findAll({
    where: { astrologerId },
    attributes: ["rating"],
    transaction,
  });

  const averageRating = reviews.length
    ? Number(
        (
          reviews.reduce((sum, item) => sum + Number(item.rating || 0), 0) / reviews.length
        ).toFixed(2)
      )
    : 0;

  await Astrologer.update(
    {
      rating: averageRating,
      totalConsultations: sessionCount,
    },
    {
      where: { id: astrologerId },
      transaction,
    }
  );

  return averageRating;
};

const main = async () => {
  const args = parseArgs();
  const astrologerId = String(args.astrologerId || "").trim();
  const namedReviewCount = normalizeReviewCount(
    args.namedReviews,
    DEFAULT_NAMED_DUMMY_USER_COUNT,
    "namedReviews"
  );
  const anonymousReviewCount = normalizeReviewCount(
    args.anonymousReviews,
    DEFAULT_ANONYMOUS_STYLE_USER_COUNT,
    "anonymousReviews"
  );
  const totalReviewCount = namedReviewCount + anonymousReviewCount;
  const sessionCount = normalizeSessionCount(args.sessionCount);

  if (!astrologerId) {
    throw new Error(
      "Missing --astrologerId. Example: npm run seed:astrologer-social-proof -- --astrologerId=<uuid> --namedReviews=80 --anonymousReviews=30 --sessionCount=1450"
    );
  }

  await connectDB();

  const astrologer = await Astrologer.findByPk(astrologerId, {
    attributes: ["id", "fullName", "rating", "totalConsultations"],
  });

  if (!astrologer) {
    throw new Error(`Astrologer not found for id: ${astrologerId}`);
  }

  const transaction = await sequelize.transaction();

  try {
    const dummyPeople = buildDummyPeople({
      namedCount: namedReviewCount,
      anonymousCount: anonymousReviewCount,
    });
    const ratings = buildRatings(totalReviewCount);
    const seedUsers = [];

    for (const person of dummyPeople) {
      const user = await ensureDummyUser(person, transaction);
      seedUsers.push(user);
    }

    for (let index = 0; index < seedUsers.length; index += 1) {
      const seededUser = seedUsers[index];
      const createdAt = new Date(Date.now() - randomInt(1, 120) * 24 * 60 * 60 * 1000);
      const payload = {
        rating: ratings[index],
        review: buildReviewText(),
        isEdited: false,
        updatedAt: createdAt,
        createdAt,
      };

      const existingReview = await Review.findOne({
        where: {
          userId: seededUser.id,
          astrologerId,
        },
        transaction,
      });

      if (existingReview) {
        await existingReview.update(payload, { transaction });
      } else {
        await Review.create(
          {
            userId: seededUser.id,
            astrologerId,
            ...payload,
          },
          { transaction }
        );
      }
    }

    const finalAverageRating = await updateAstrologerAggregate(
      astrologerId,
      sessionCount,
      transaction
    );

    await transaction.commit();

    console.log("Seeded astrologer social proof successfully.");
    console.log(
      JSON.stringify(
        {
          astrologerId,
          astrologerName: astrologer.fullName,
          generatedReviews: seedUsers.length,
          namedDummyUsers: namedReviewCount,
          anonymousStyleUsers: anonymousReviewCount,
          displayedSessionCount: sessionCount,
          resultingAverageRating: finalAverageRating,
          note: "Created or reused only script-owned dummy users, including anonymous-style names. Both user and astrologer apps read astrologers.totalConsultations for this visible count.",
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
  console.error("Failed to seed astrologer social proof:", error);
  process.exit(1);
});

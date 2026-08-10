const { sequelize } = require("./dbConnection/dbConfig");
const User = require("./model/user/userAuth");
const UserInterestCohort = require("./model/interest/userInterestCohort");

async function injectCohorts() {
  try {
    await sequelize.authenticate();
    console.log("Database connected.");

    // Find the user by mobile number
    const mobile = "8112590073";
    const user = await User.findOne({ where: { mobile } });

    if (!user) {
      console.log(`User with mobile ${mobile} not found.`);
      process.exit(1);
    }

    console.log(`Found user: ${user.id} (${user.fullName || 'No Name'})`);

    // Reset ALL existing cohorts for this user to score 0
    await UserInterestCohort.update(
      { scoreAtAssignment: 0 },
      { where: { userId: user.id } }
    );
    console.log("Reset all existing cohorts for this user to score 0.");

    // Define the test cohorts to inject
    const testCohorts = [
      { category: "Career", score: 10 },
      { category: "Love", score: 10 },
      { category: "Health", score: 0 }, // Score 0 should be ignored by the UI
    ];

    // Upsert the cohorts
    for (const cohort of testCohorts) {
      const [record, created] = await UserInterestCohort.findOrCreate({
        where: {
          userId: user.id,
          cohortType: "interest",
          category: cohort.category,
        },
        defaults: {
          scoreAtAssignment: cohort.score,
          isActive: true,
        },
      });

      if (!created) {
        await record.update({
          scoreAtAssignment: cohort.score,
          isActive: true,
        });
      }
      console.log(`Injected Cohort: ${cohort.category} with score ${cohort.score}`);
    }

    console.log("Successfully injected test cohorts!");
    process.exit(0);
  } catch (error) {
    console.error("Error injecting cohorts:", error);
    process.exit(1);
  }
}

injectCohorts();

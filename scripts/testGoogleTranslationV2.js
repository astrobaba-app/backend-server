require("dotenv").config();

const {
  translateTexts,
} = require("../services/googleTranslationV2Service");

async function main() {
  const sourceLanguage = process.argv[2] || "en";
  const targetLanguage = process.argv[3] || "hi";
  const text = process.argv.slice(4).join(" ") || "Daily Horoscope";

  const result = await translateTexts({
    texts: [text],
    sourceLanguage,
    targetLanguage,
  });

  console.log(
    JSON.stringify(
      {
        ok: true,
        request: {
          sourceLanguage,
          targetLanguage,
          text,
        },
        response: result,
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(
    JSON.stringify(
      {
        ok: false,
        message: error.message,
        status: error.response?.status,
        data: error.response?.data || null,
      },
      null,
      2
    )
  );

  process.exit(1);
});

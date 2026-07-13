const axios = require("axios");

const GOOGLE_TRANSLATE_BATCH_SIZE = 100;

const chunkTexts = (texts, size = GOOGLE_TRANSLATE_BATCH_SIZE) => {
  const chunks = [];

  for (let index = 0; index < texts.length; index += size) {
    chunks.push(texts.slice(index, index + size));
  }

  return chunks;
};

const getApiKey = () => {
  const apiKey = process.env.GOOGLE_TRANSLATE_API_KEY;

  if (!apiKey) {
    throw new Error("GOOGLE_TRANSLATE_API_KEY is not configured");
  }

  return apiKey;
};

const translateTexts = async ({
  texts,
  sourceLanguage,
  targetLanguage,
  format = "text",
}) => {
  if (!Array.isArray(texts) || !texts.length) {
    return {
      translations: [],
      language: targetLanguage,
      apiVersion: "v2",
    };
  }

  const normalizedTexts = texts
    .map((value) => (typeof value === "string" ? value : ""))
    .filter((value) => value.length > 0);

  if (!normalizedTexts.length) {
    return {
      translations: [],
      language: targetLanguage,
      apiVersion: "v2",
    };
  }

  const apiKey = getApiKey();
  const translations = [];

  for (const textChunk of chunkTexts(normalizedTexts)) {
    const response = await axios.post(
      `https://translation.googleapis.com/language/translate/v2?key=${apiKey}`,
      {
        q: textChunk,
        source: sourceLanguage,
        target: targetLanguage,
        format,
      },
      {
        headers: {
          "Content-Type": "application/json",
        },
        timeout: 30000,
      }
    );

    const chunkTranslations = response.data?.data?.translations || [];

    chunkTranslations.forEach((entry, index) => {
      translations.push({
        sourceText: textChunk[index],
        translatedText: entry.translatedText || textChunk[index],
      });
    });
  }

  return {
    translations,
    language: targetLanguage,
    apiVersion: "v2",
  };
};

module.exports = {
  getApiKey,
  translateTexts,
};

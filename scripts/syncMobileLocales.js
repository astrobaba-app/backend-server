require('dotenv').config();

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { translateTexts } = require('../services/googleTranslationV2Service');

const MOBILE_LOCALES_DIR = path.join(
  __dirname,
  '..',
  '..',
  'graho-mobile-app',
  'src',
  'localization',
  'locales'
);

const ENGLISH_LOCALE_PATH = path.join(MOBILE_LOCALES_DIR, 'en.json');
const META_PATH = path.join(MOBILE_LOCALES_DIR, '.translation-meta.json');
const TARGET_LANGUAGES = ['hi', 'ta', 'mr', 'te', 'bn', 'kn'];

const PLACEHOLDER_PATTERNS = [
  /\{\{[^{}]+\}\}/g,
  /%\{[^{}]+\}/g,
  /₹\{\{[^{}]+\}\}/g,
  /<[^>]+>/g,
];

const readJsonFile = filePath => {
  if (!fs.existsSync(filePath)) {
    return {};
  }

  return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
};

const writeJsonFile = (filePath, value) => {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf-8');
};

const flattenObject = (value, prefix = '', result = {}) => {
  if (Array.isArray(value)) {
    result[prefix] = value;
    return result;
  }

  Object.entries(value || {}).forEach(([key, nestedValue]) => {
    const nextPrefix = prefix ? `${prefix}.${key}` : key;

    if (
      nestedValue &&
      typeof nestedValue === 'object' &&
      !Array.isArray(nestedValue)
    ) {
      flattenObject(nestedValue, nextPrefix, result);
      return;
    }

    result[nextPrefix] = nestedValue;
  });

  return result;
};

const setByPath = (target, pathKey, value) => {
  const segments = pathKey.split('.');
  let cursor = target;

  segments.forEach((segment, index) => {
    if (index === segments.length - 1) {
      cursor[segment] = value;
      return;
    }

    if (!cursor[segment] || typeof cursor[segment] !== 'object') {
      cursor[segment] = {};
    }

    cursor = cursor[segment];
  });
};

const createSourceHash = text =>
  crypto
    .createHash('sha256')
    .update(String(text).normalize('NFKC').trim().replace(/\s+/g, ' '))
    .digest('hex');

const protectTokens = text => {
  const tokens = [];
  let protectedText = text;

  PLACEHOLDER_PATTERNS.forEach(pattern => {
    protectedText = protectedText.replace(pattern, match => {
      const token = `__GRAHO_TOKEN_${tokens.length}__`;
      tokens.push({ token, value: match });
      return token;
    });
  });

  return { protectedText, tokens };
};

const restoreTokens = (text, tokens) =>
  tokens.reduce(
    (restored, tokenEntry) =>
      restored.split(tokenEntry.token).join(tokenEntry.value),
    text
  );

const buildTranslationsForLanguage = async ({
  sourceEntries,
  targetLanguage,
  localeEntries,
  localeMeta,
}) => {
  const nextLocale = { ...localeEntries };
  const nextMeta = { ...localeMeta };
  const report = {
    language: targetLanguage,
    missing: [],
    changed: [],
    removed: [],
    translated: 0,
    kept: 0,
  };

  const keysToTranslate = [];
  const translateTextsPayload = [];
  const protectedTokenMap = [];

  Object.entries(sourceEntries).forEach(([pathKey, value]) => {
    if (typeof value !== 'string') {
      setByPath(nextLocale, pathKey, value);
      return;
    }

    const sourceHash = createSourceHash(value);
    const existingMeta = nextMeta[pathKey];
    const existingValue = localeEntries[pathKey];

    const shouldTranslate =
      !existingMeta ||
      existingMeta.sourceHash !== sourceHash ||
      typeof existingValue !== 'string' ||
      (!existingValue && existingMeta.status !== 'human_reviewed');

    if (!shouldTranslate) {
      report.kept += 1;
      setByPath(nextLocale, pathKey, existingValue);
      return;
    }

    const { protectedText, tokens } = protectTokens(value);
    keysToTranslate.push(pathKey);
    translateTextsPayload.push(protectedText);
    protectedTokenMap.push(tokens);

    if (!existingMeta) {
      report.missing.push(pathKey);
    } else if (existingMeta.sourceHash !== sourceHash) {
      report.changed.push(pathKey);
    }
  });

  Object.keys(localeEntries).forEach(pathKey => {
    if (!(pathKey in sourceEntries)) {
      report.removed.push(pathKey);
    }
  });

  if (translateTextsPayload.length) {
    const response = await translateTexts({
      texts: translateTextsPayload,
      sourceLanguage: 'en',
      targetLanguage,
    });

    response.translations.forEach((entry, index) => {
      const pathKey = keysToTranslate[index];
      const sourceText = sourceEntries[pathKey];
      const restoredText = restoreTokens(
        entry.translatedText,
        protectedTokenMap[index]
      );

      setByPath(nextLocale, pathKey, restoredText);
      nextMeta[pathKey] = {
        sourceHash: createSourceHash(sourceText),
        status: 'machine_translated',
        updatedAt: new Date().toISOString(),
      };
      report.translated += 1;
    });
  }

  return {
    locale: nextLocale,
    meta: nextMeta,
    report,
  };
};

async function main() {
  const englishLocale = readJsonFile(ENGLISH_LOCALE_PATH);
  const sourceEntries = flattenObject(englishLocale);
  const allMeta = readJsonFile(META_PATH);
  const finalMeta = { ...allMeta };
  const reports = [];

  for (const language of TARGET_LANGUAGES) {
    const localePath = path.join(MOBILE_LOCALES_DIR, `${language}.json`);
    const localeJson = readJsonFile(localePath);
    const localeEntries = flattenObject(localeJson);
    const localeMeta = allMeta[language] || {};

    const { locale, meta, report } = await buildTranslationsForLanguage({
      sourceEntries,
      targetLanguage: language,
      localeEntries,
      localeMeta,
    });

    writeJsonFile(localePath, locale);
    finalMeta[language] = meta;
    reports.push(report);
  }

  writeJsonFile(META_PATH, finalMeta);

  console.log(
    JSON.stringify(
      {
        ok: true,
        localeDirectory: MOBILE_LOCALES_DIR,
        reports,
      },
      null,
      2
    )
  );
}

main().catch(error => {
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

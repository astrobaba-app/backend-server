// Validates i18n/locales: every language has every template/label key that
// English has, with the same {{placeholders}}, and every `messages` entry is
// English text that actually appears in the code (catches typos that would
// silently leave a message untranslated).
//
// Usage: npm run i18n:check

const fs = require("fs");
const path = require("path");
const { SUPPORTED_LANGUAGES, DEFAULT_LANGUAGE } = require("../i18n");

const ROOT = path.join(__dirname, "..");
const SOURCE_DIRS = ["controller", "services", "middleware", "routes"];

const load = (code) =>
  JSON.parse(fs.readFileSync(path.join(ROOT, "i18n", "locales", `${code}.json`), "utf8"));

const flatten = (node, prefix = "", out = {}) => {
  for (const [key, value] of Object.entries(node || {})) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === "object") flatten(value, fullKey, out);
    else out[fullKey] = value;
  }
  return out;
};

const placeholders = (text) => (String(text).match(/\{\{\w+\}\}/g) || []).sort().join(",");

const readSources = (dir) =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return readSources(full);
    return entry.name.endsWith(".js") ? [fs.readFileSync(full, "utf8")] : [];
  });

const source = SOURCE_DIRS.flatMap((dir) => readSources(path.join(ROOT, dir))).join("\n");

const english = load(DEFAULT_LANGUAGE);
const englishKeyed = flatten({ notifications: english.notifications, labels: english.labels });
const problems = [];
let messageKeys = null;

for (const code of SUPPORTED_LANGUAGES.filter((c) => c !== DEFAULT_LANGUAGE)) {
  const locale = load(code);
  const keyed = flatten({ notifications: locale.notifications, labels: locale.labels });

  for (const [key, text] of Object.entries(englishKeyed)) {
    if (!(key in keyed)) problems.push(`[${code}] missing ${key}`);
    else if (placeholders(keyed[key]) !== placeholders(text)) {
      problems.push(`[${code}] placeholder mismatch in ${key}`);
    }
  }
  for (const key of Object.keys(keyed)) {
    if (!(key in englishKeyed)) problems.push(`[${code}] unknown key ${key}`);
  }

  const keys = Object.keys(locale.messages || {});
  for (const [key, value] of Object.entries(locale.messages || {})) {
    if (typeof value !== "string" || !value.trim()) problems.push(`[${code}] empty message for "${key}"`);
  }
  if (messageKeys === null) messageKeys = keys;
  else {
    for (const key of messageKeys) if (!keys.includes(key)) problems.push(`[${code}] missing message "${key}"`);
    for (const key of keys) if (!messageKeys.includes(key)) problems.push(`[${code}] extra message "${key}"`);
  }
}

for (const key of messageKeys || []) {
  if (!source.includes(`"${key}"`) && !source.includes(`'${key}'`)) {
    problems.push(`message not found in code (typo or removed?): "${key}"`);
  }
}

if (problems.length) {
  console.error(problems.join("\n"));
  console.error(`\n${problems.length} i18n problem(s) found.`);
  process.exit(1);
}

console.log(
  `i18n OK: ${SUPPORTED_LANGUAGES.length} languages, ${messageKeys?.length || 0} messages, ` +
    `${Object.keys(englishKeyed).length} template/label keys.`
);

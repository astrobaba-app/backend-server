// Backend translations for fixed (non-generated) text: API response messages,
// push/in-app notification templates and small label sets.
//
// Locale files (./locales/<code>.json):
//   messages      – English response text -> translated text. Looked up by the
//                   exact English string, so existing `message: "..."` code keeps
//                   working and only needs a dictionary entry to be translated.
//   notifications – `<key>.title` / `<key>.message` templates with {{vars}}.
//   labels        – reusable words (report names, ticket statuses, ...).
//
// Adding a language = add its code below + a locales/<code>.json file.
// English is always the fallback, so a missing entry never breaks anything.

const SUPPORTED_LANGUAGES = ["en", "hi", "ta", "te", "kn"];
const DEFAULT_LANGUAGE = "en";
const INTL_LOCALES = {
  en: "en-IN",
  hi: "hi-IN",
  ta: "ta-IN",
  te: "te-IN",
  kn: "kn-IN",
};

const locales = Object.fromEntries(
  SUPPORTED_LANGUAGES.map((code) => [code, require(`./locales/${code}.json`)])
);

/** 'hi-IN' / 'hi_IN' / 'HI' / 'hi,en;q=0.8' -> 'hi'; anything unsupported -> null. */
const normalizeLanguage = (value) => {
  const base = String(value || "")
    .split(",")[0]
    .split(/[-_;]/)[0]
    .trim()
    .toLowerCase();

  return SUPPORTED_LANGUAGES.includes(base) ? base : null;
};

const resolveLanguage = (value) => normalizeLanguage(value) || DEFAULT_LANGUAGE;

const lookup = (language, key) =>
  String(key)
    .split(".")
    .reduce((node, part) => (node == null ? undefined : node[part]), locales[language]);

const formatVar = (value, language) => {
  if (value instanceof Date) {
    return value.toLocaleString(INTL_LOCALES[language], {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "Asia/Kolkata",
    });
  }

  // { key, fallback } lets a variable itself be a translated label,
  // e.g. a ticket status inside a notification sentence.
  if (value && typeof value === "object" && value.key) {
    return t(language, value.key, value.vars, value.fallback);
  }

  return String(value ?? "");
};

const interpolate = (template, vars, language) =>
  template.replace(/\{\{(\w+)\}\}/g, (match, name) =>
    Object.prototype.hasOwnProperty.call(vars, name)
      ? formatVar(vars[name], language)
      : match
  );

/**
 * Translate a keyed template, e.g. t("hi", "labels.reports.daily_kundali").
 * Order: requested language -> English -> `fallback` -> the key itself.
 */
function t(lang, key, vars = {}, fallback) {
  const language = resolveLanguage(lang);
  const template = lookup(language, key) ?? lookup(DEFAULT_LANGUAGE, key);

  if (typeof template === "string") {
    return interpolate(template, vars || {}, language);
  }

  return fallback !== undefined ? fallback : key;
}

/** Translate an existing English response message; unknown text is returned as-is. */
function translateMessage(lang, text) {
  if (typeof text !== "string") {
    return text;
  }

  const language = normalizeLanguage(lang);
  if (!language || language === DEFAULT_LANGUAGE) {
    return text;
  }

  return locales[language].messages?.[text] ?? text;
}

/** Render a notification template into { title, message } for one language. */
function renderNotification(lang, key, vars = {}, fallback = {}) {
  return {
    title: t(lang, `notifications.${key}.title`, vars, fallback.title),
    message: t(lang, `notifications.${key}.message`, vars, fallback.message),
  };
}

module.exports = {
  SUPPORTED_LANGUAGES,
  DEFAULT_LANGUAGE,
  INTL_LOCALES,
  normalizeLanguage,
  resolveLanguage,
  t,
  translateMessage,
  renderNotification,
};

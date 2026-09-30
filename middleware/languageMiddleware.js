const {
  DEFAULT_LANGUAGE,
  normalizeLanguage,
  translateMessage,
} = require("../i18n");

// The mobile app sends its selected language in this header. A custom header is
// used instead of Accept-Language so browsers (admin panel, website) keep
// getting English unless they opt in.
const LANGUAGE_HEADER = "x-app-language";

// Response objects whose `message` is fixed server text shown to the user.
const NESTED_MESSAGE_FIELDS = ["welcomeFreeChatInfo"];

const isPlainObject = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const localizeResponseBody = (lang, body) => {
  if (!lang || lang === DEFAULT_LANGUAGE || !isPlainObject(body)) {
    return body;
  }

  const localized = { ...body };

  if (typeof localized.message === "string") {
    localized.message = translateMessage(lang, localized.message);
  }

  if (typeof localized.error === "string") {
    localized.error = translateMessage(lang, localized.error);
  }

  for (const field of NESTED_MESSAGE_FIELDS) {
    if (isPlainObject(localized[field]) && typeof localized[field].message === "string") {
      localized[field] = {
        ...localized[field],
        message: translateMessage(lang, localized[field].message),
      };
    }
  }

  return localized;
};

/**
 * Sets req.lang from the X-App-Language header and translates the fixed
 * `message` / `error` text of JSON responses.
 */
function languageMiddleware() {
  return (req, res, next) => {
    req.requestedLang = normalizeLanguage(req.headers[LANGUAGE_HEADER]);
    req.lang = req.requestedLang || DEFAULT_LANGUAGE;

    const json = res.json.bind(res);
    res.json = (body) => json(localizeResponseBody(req.lang, body));

    next();
  };
}

module.exports = {
  LANGUAGE_HEADER,
  languageMiddleware,
  localizeResponseBody,
};

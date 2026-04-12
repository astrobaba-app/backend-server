const dayjs = require("dayjs");
const customParseFormat = require("dayjs/plugin/customParseFormat");

dayjs.extend(customParseFormat);

const DOB_INPUT_FORMATS = [
  "DD/MM/YYYY",
  "D/M/YYYY",
  "DD-MM-YYYY",
  "D-M-YYYY",
  "DD MMM YYYY",
  "D MMM YYYY",
  "DD MMMM YYYY",
  "D MMMM YYYY",
  "MMM D, YYYY",
  "MMMM D, YYYY",
  "YYYY-MM-DD",
  "YYYY/MM/DD",
  "YYYY.MM.DD",
];

const TOB_INPUT_FORMATS = [
  "HH:mm",
  "H:mm",
  "HH:mm:ss",
  "H:mm:ss",
  "hh:mm A",
  "h:mm A",
  "hh:mm a",
  "h:mm a",
  "hh:mm:ss A",
  "h:mm:ss A",
  "hh:mm:ss a",
  "h:mm:ss a",
];

class DateTimeNormalizationError extends Error {
  constructor(message, field) {
    super(message);
    this.name = "DateTimeNormalizationError";
    this.statusCode = 400;
    this.field = field;
  }
}

const normalizeInputString = (value) =>
  typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";

const parseWithFormats = (rawValue, formats) => {
  for (const format of formats) {
    const parsed = dayjs(rawValue, format, true);
    if (parsed.isValid()) {
      return parsed;
    }
  }

  return null;
};

const normalizeDob = (rawDob) => {
  const dobString = normalizeInputString(rawDob);
  if (!dobString) {
    throw new DateTimeNormalizationError("dob is required", "dob");
  }

  let parsed = parseWithFormats(dobString, DOB_INPUT_FORMATS);

  if (!parsed && /^\d{4}-\d{2}-\d{2}T/.test(dobString)) {
    parsed = dayjs(dobString);
  }

  if (!parsed || !parsed.isValid()) {
    throw new DateTimeNormalizationError(
      "Invalid dob format. Supported examples: 19/10/2004, 19 Oct 2004, October 19, 2004, 2004-10-19",
      "dob"
    );
  }

  return parsed.format("YYYY-MM-DD");
};

const normalizeTob = (rawTob) => {
  const tobString = normalizeInputString(rawTob);
  if (!tobString) {
    throw new DateTimeNormalizationError("tob is required", "tob");
  }

  const parsed = parseWithFormats(tobString, TOB_INPUT_FORMATS);

  if (!parsed || !parsed.isValid()) {
    throw new DateTimeNormalizationError(
      "Invalid tob format. Supported examples: 14:30, 2:30 PM, 02:30 pm",
      "tob"
    );
  }

  return parsed.format("HH:mm:ss");
};

const normalizeDobAndTob = ({ dob, tob }) => {
  const normalizedDob = normalizeDob(dob);
  const normalizedTob = normalizeTob(tob);

  return {
    dob: normalizedDob,
    tob: normalizedTob,
  };
};

module.exports = {
  DateTimeNormalizationError,
  normalizeDob,
  normalizeTob,
  normalizeDobAndTob,
};

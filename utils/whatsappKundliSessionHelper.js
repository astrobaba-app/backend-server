// this will help us merging partial datas
const mergeWhatsappKundliData = (
  existingData = {},
  newData = {}
) => {
  const merged = { ...existingData };

  Object.entries(newData).forEach(([key, value]) => {
    if (
      value !== null &&
      value !== undefined &&
      value !== ""
    ) {
      merged[key] = value;
    }
  });

  return merged;
};

const getMissingFields = (data = {}) => {
  const requiredFields = [
    "name",
    "gender",
    "dob",
    "pob",
  ];

  return requiredFields.filter(
    (field) =>
      !data[field] ||
      String(data[field]).trim() === ""
  );
};

const hasUsefulExtraction = (data = {}) => {
  return Object.values(data).some(
    (value) =>
      value !== null &&
      value !== undefined &&
      String(value).trim() !== ""
  );
};
module.exports = {
  mergeWhatsappKundliData,
  getMissingFields,
  hasUsefulExtraction
};
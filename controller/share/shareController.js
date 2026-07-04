const { SHARE_TYPES, buildShareLink } = require("../../services/shareLinkService");

const getShareTypes = (req, res) =>
  res.status(200).json({
    success: true,
    types: Object.keys(SHARE_TYPES),
  });

const resolveShareLink = (req, res) => {
  const link = buildShareLink(req.params.type, req.params.id);

  if (!link) {
    return res.status(400).json({
      success: false,
      message: "Invalid share type or id",
      supportedTypes: Object.keys(SHARE_TYPES),
    });
  }

  return res.status(200).json(link);
};

const resolveAppShareLink = (req, res) => {
  const link = buildShareLink("app", "graho");

  return res.status(200).json(link);
};

module.exports = {
  getShareTypes,
  resolveShareLink,
  resolveAppShareLink,
};

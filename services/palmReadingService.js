const axios = require("axios");

const ASTRO_ENGINE_BASE_URL = process.env.ASTRO_ENGINE_URL || "http://localhost:8000/api/v1";

const checkPalmEngineHealth = async () => {
  const healthUrl = ASTRO_ENGINE_BASE_URL.replace(/\/api\/v1\/?$/, "") + "/health";
  try {
    await axios.get(healthUrl, { timeout: 3000 });
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      reason: error?.code || error?.message || "engine_unreachable",
      healthUrl,
    };
  }
};

const analyzePalm = async ({ imageUrls, metadata }) => {
  try {
    const response = await axios.post(`${ASTRO_ENGINE_BASE_URL}/palm-reading/analyze`, {
      image_urls: imageUrls,
      metadata: metadata || {},
    });
    return response.data;
  } catch (error) {
    const status = error?.response?.status || null;
    const data = error?.response?.data || null;
    const message = error?.message || "Palm analyze request failed";
    const code = error?.code || null;
    const errno = error?.errno || null;
    const address = error?.address || null;
    const port = error?.port || null;
    console.error("[PalmReadingService] analyzePalm failed", {
      status,
      message,
      code,
      errno,
      address,
      port,
      data,
      url: `${ASTRO_ENGINE_BASE_URL}/palm-reading/analyze`,
      imageCount: Array.isArray(imageUrls) ? imageUrls.length : 0,
    });
    throw new Error(
      `Palm analyze failed: ${status || "unknown_status"}:${code ? ` ${code}` : ""} ${
        typeof data === "string" ? data : JSON.stringify(data || {})
      }`
    );
  }
};

module.exports = { analyzePalm, checkPalmEngineHealth };

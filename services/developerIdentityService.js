const crypto = require("crypto");
const os = require("os");
const path = require("path");
const { execSync } = require("child_process");

let cachedIdentity = null;
let cachedGitInfo = null;

const resolveEnvValue = (primary, fallback) => (primary && String(primary).trim()) || (fallback && String(fallback).trim()) || null;

const hashSecret = (secret) => {
  if (!secret) return null;
  return crypto.createHash("sha256").update(secret).digest("hex");
};

const getDeveloperIdentity = () => {
  if (cachedIdentity) {
    return cachedIdentity;
  }

  const developerName = resolveEnvValue(process.env.DEVELOPER_NAME, process.env.DEV_NAME);
  const developerSecret = resolveEnvValue(process.env.DEVELOPER_SECRET, process.env.DEV_SECRET);

  cachedIdentity = {
    developerName,
    developerSecretHash: hashSecret(developerSecret),
    machineName: os.hostname(),
    environment: resolveEnvValue(process.env.APP_ENV, process.env.NODE_ENV) || "development",
    serviceName:
      resolveEnvValue(process.env.SERVICE_NAME, process.env.npm_package_name) || "backend-server",
  };

  return cachedIdentity;
};

const getGitInfo = () => {
  if (cachedGitInfo) {
    return cachedGitInfo;
  }

  const envBranch = resolveEnvValue(process.env.GIT_BRANCH, null);
  const envCommit = resolveEnvValue(process.env.GIT_COMMIT, null);
  const envEmail = resolveEnvValue(process.env.GIT_EMAIL, null);

  if (envBranch || envCommit || envEmail) {
    cachedGitInfo = {
      gitBranch: envBranch,
      gitCommit: envCommit,
      gitEmail: envEmail,
    };

    return cachedGitInfo;
  }

  const repoRoot = path.resolve(__dirname, "..");

  const readGitValue = (command) => {
    try {
      return execSync(command, { cwd: repoRoot, stdio: ["ignore", "pipe", "ignore"] })
        .toString()
        .trim();
    } catch (_) {
      return null;
    }
  };

  cachedGitInfo = {
    gitBranch: readGitValue("git rev-parse --abbrev-ref HEAD"),
    gitCommit: readGitValue("git rev-parse HEAD"),
    gitEmail: readGitValue("git config user.email"),
  };

  return cachedGitInfo;
};

const assertDeveloperIdentity = () => {
  const requireIdentity =
    process.env.REQUIRE_DEVELOPER_IDENTITY === "true" || process.env.NODE_ENV !== "production";
  const { developerName } = getDeveloperIdentity();

  if (requireIdentity && !developerName) {
    throw new Error("DEVELOPER_NAME is required to run this service in development.");
  }
};

module.exports = {
  getDeveloperIdentity,
  getGitInfo,
  assertDeveloperIdentity,
};

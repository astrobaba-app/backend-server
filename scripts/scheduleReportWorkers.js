require("dotenv").config();

const cron = require("node-cron");
const { spawn } = require("child_process");
const path = require("path");

const isEnabled = (value) => ["1", "true", "yes", "on"].includes(String(value || "").toLowerCase());

const LLM_CRON = process.env.REPORT_LLM_WORKER_CRON;
const PDF_CRON = process.env.REPORT_PDF_WORKER_CRON;
const TIMEZONE = process.env.REPORT_WORKER_TIMEZONE || "Asia/Kolkata";
const LOG_PREFIX = process.env.REPORT_WORKER_LOG_PREFIX || "[ReportWorkerScheduler]";
let schedulerStarted = false;

const runWorker = (scriptName) => {
  const scriptPath = path.join(__dirname, scriptName);
  console.log(LOG_PREFIX, "starting worker", { scriptName, scriptPath });

  const child = spawn(process.execPath, [scriptPath], {
    cwd: path.join(__dirname, ".."),
    stdio: "inherit",
    env: process.env,
  });

  child.on("exit", (code, signal) => {
    console.log(LOG_PREFIX, "worker exited", { scriptName, code, signal });
  });
};

const startReportWorkerScheduler = () => {
  if (schedulerStarted) {
    console.log(LOG_PREFIX, "already started");
    return false;
  }

  if (!isEnabled(process.env.REPORT_WORKER_SCHEDULER_ENABLED)) {
    console.log(LOG_PREFIX, "disabled by REPORT_WORKER_SCHEDULER_ENABLED");
    return false;
  }

  schedulerStarted = true;

  if (LLM_CRON) {
    cron.schedule(LLM_CRON, () => runWorker("runReportLlmWorker.js"), { timezone: TIMEZONE });
    console.log(LOG_PREFIX, "LLM worker scheduled", { cron: LLM_CRON, timezone: TIMEZONE });
  } else {
    console.log(LOG_PREFIX, "LLM worker cron not configured via REPORT_LLM_WORKER_CRON");
  }

  if (PDF_CRON) {
    cron.schedule(PDF_CRON, () => runWorker("runReportPdfWorker.js"), { timezone: TIMEZONE });
    console.log(LOG_PREFIX, "PDF worker scheduled", { cron: PDF_CRON, timezone: TIMEZONE });
  } else {
    console.log(LOG_PREFIX, "PDF worker cron not configured via REPORT_PDF_WORKER_CRON");
  }

  return true;
};

if (require.main === module) {
  startReportWorkerScheduler();
}

module.exports = {
  startReportWorkerScheduler,
};

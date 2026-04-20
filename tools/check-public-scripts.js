"use strict";

const { execFileSync } = require("child_process");

const ALLOWED_TRACKED_SCRIPTS = [
  "scripts/_shared.js",
  "scripts/cdp-record-reliable.js",
  "scripts/http-deepseek-open-platform-balance.js",
  "scripts/http-feishu-open-platform-bot-menu-manage.js",
  "scripts/http-feishu-open-platform-scope-manage.js",
  "scripts/http-jike-post-engagement-stats.js",
  "scripts/http-jike-post-manage.js",
  "scripts/http-wechat-web-message-manage.js",
  "scripts/playwright-x-post-create.js",
];

function readTrackedScripts() {
  const output = execFileSync("git", ["ls-files", "scripts"], {
    cwd: process.cwd(),
    encoding: "utf8",
  }).trim();
  return output ? output.split("\n").filter(Boolean).sort() : [];
}

function main() {
  const tracked = readTrackedScripts();
  const allowed = [...ALLOWED_TRACKED_SCRIPTS].sort();

  const unexpected = tracked.filter((item) => !allowed.includes(item));
  const missing = allowed.filter((item) => !tracked.includes(item));

  if (!unexpected.length && !missing.length) {
    console.log("Public script whitelist check passed.");
    return;
  }

  if (unexpected.length) {
    console.error("Unexpected tracked scripts:");
    for (const item of unexpected) {
      console.error(`- ${item}`);
    }
  }

  if (missing.length) {
    console.error("Missing tracked public scripts:");
    for (const item of missing) {
      console.error(`- ${item}`);
    }
  }

  process.exit(1);
}

main();

"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const ENV_REF_PATTERN = /^\$\{([A-Z0-9_]+)(?::-([^}]*))?\}$/;

function projectRoot(...parts) {
  return path.resolve(__dirname, "..", ...parts);
}

function credentialsFilePath() {
  return process.env.APIZER_PUBLIC_CREDENTIALS_FILE
    || projectRoot("credentials.json");
}

function readCredentialsFile() {
  return resolveEnvRefs(JSON.parse(fs.readFileSync(credentialsFilePath(), "utf8")));
}

function isEnvRef(value) {
  return typeof value === "string" && ENV_REF_PATTERN.test(value);
}

function resolveEnvRefs(value) {
  if (Array.isArray(value)) {
    return value.map(resolveEnvRefs);
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, resolveEnvRefs(item)]),
    );
  }

  if (!isEnvRef(value)) {
    return value;
  }

  const match = value.match(ENV_REF_PATTERN);
  const [, envName, defaultValue = ""] = match;
  return process.env[envName] ?? defaultValue;
}

function preserveEnvRefs(template, data) {
  if (isEnvRef(template)) {
    return template;
  }

  if (Array.isArray(template) && Array.isArray(data)) {
    return data.map((item, index) => preserveEnvRefs(template[index], item));
  }

  if (template && typeof template === "object" && data && typeof data === "object") {
    const keys = new Set([...Object.keys(template), ...Object.keys(data)]);
    return Object.fromEntries(
      [...keys].map((key) => [key, preserveEnvRefs(template[key], data[key])]),
    );
  }

  return data;
}

function writeCredentialsFile(data) {
  const filePath = credentialsFilePath();
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  let output = data;
  if (fs.existsSync(filePath)) {
    const template = JSON.parse(fs.readFileSync(filePath, "utf8"));
    output = preserveEnvRefs(template, data);
  }
  fs.writeFileSync(filePath, `${JSON.stringify(output, null, 2)}\n`);
}

function loadConnectorCredentials(connectorId) {
  const all = readCredentialsFile();
  const connector = all.connectors?.[connectorId];
  if (!connector) {
    throw new Error(`Missing credentials for connector: ${connectorId}`);
  }
  return { all, connector };
}

function requireArg(value, name) {
  if (!value) {
    throw new Error(`Missing argument: ${name}`);
  }
  return value;
}

async function request(url, options = {}) {
  const response = await fetch(url, options);
  const text = await response.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch (_) {}
  return {
    ok: response.ok,
    status: response.status,
    headers: Object.fromEntries(response.headers.entries()),
    text,
    json,
  };
}

function buildWechatSyncCheckKey(syncKey) {
  return (syncKey?.List || []).map((item) => `${item.Key}_${item.Val}`).join("|");
}

function randomDigits(length) {
  let out = "";
  while (out.length < length) {
    out += Math.floor(Math.random() * 10);
  }
  return out.slice(0, length);
}

function randomDeviceId() {
  return `e${randomDigits(15)}`;
}

function randomMessageId() {
  return `${Date.now()}${randomDigits(3)}`;
}

module.exports = {
  buildWechatSyncCheckKey,
  loadConnectorCredentials,
  randomDeviceId,
  randomMessageId,
  request,
  requireArg,
  writeCredentialsFile,
};

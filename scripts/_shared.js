"use strict";

const fs = require("fs");
const path = require("path");

function projectRoot(...parts) {
  return path.resolve(__dirname, "..", ...parts);
}

function readCredentialsFile() {
  return JSON.parse(fs.readFileSync(projectRoot("credentials.json"), "utf8"));
}

function writeCredentialsFile(data) {
  fs.writeFileSync(projectRoot("credentials.json"), `${JSON.stringify(data, null, 2)}\n`);
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

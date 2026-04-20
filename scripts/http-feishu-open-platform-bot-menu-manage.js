#!/usr/bin/env node

/**
 * connector id: feishu-open-platform-bot-menu-manage
 *
 * 作用:
 * - 读取和更新飞书开放平台自建应用的机器人自定义菜单
 * - 支持 get / append-event-menu / update 三个动作
 *
 * 主接口:
 * - POST /developers/v1/robot/{app_id}
 * - POST /developers/v1/robot/update_changed/{app_id}
 *
 * 所需 credentials 字段:
 * - auth.cookie_header
 * - auth.csrf_token
 * - runtime.app_id
 * - runtime.referer
 * - runtime.user_agent
 * - runtime.origin（可选）
 * - runtime.x_timezone_offset（可选）
 * - runtime.sec_ch_ua / runtime.sec_ch_ua_mobile / runtime.sec_ch_ua_platform（可选；建议先完整复用浏览器请求头）
 *
 * 输入参数:
 * - argv[2]: action，支持 get / append-event-menu / update
 * - get: 无额外参数
 * - append-event-menu: argv[3] 为菜单名，argv[4] 为事件 ID
 * - update: argv[3] 为 JSON 文件路径，内容需为 { "menu": { ... } }
 *
 * 命令行用法:
 * - 查看当前菜单: node scripts/http-feishu-open-platform-bot-menu-manage.js get
 * - 追加一个事件菜单: node scripts/http-feishu-open-platform-bot-menu-manage.js append-event-menu menu menu
 * - 用 JSON 覆盖更新: node scripts/http-feishu-open-platform-bot-menu-manage.js update /tmp/feishu-bot-menu.json
 *
 * 成功判定:
 * - HTTP 200，且响应体 code 为 0、空或 success true
 *
 * 注意:
 * - update / append-event-menu 会产生真实后台配置副作用
 * - 如果脚本成功执行依赖的是新的 cookie / csrf token，应同步更新 credentials.json 对应字段，避免后续继续使用过期会话
 */

"use strict";

const fs = require("fs");
const { loadConnectorCredentials, request, requireArg } = require("./_shared");

const TOP_LEVEL_MENU_LIMIT = 3;

function endpoint(connector, path) {
  return `https://open.feishu.cn/developers/v1/${path}/${connector.runtime.app_id}`;
}

function baseHeaders(connector) {
  const headers = {
    accept: "application/json, text/plain, */*",
    "content-type": "application/json",
    cookie: connector.auth.cookie_header,
    referer: connector.runtime.referer,
    "user-agent": connector.runtime.user_agent,
    "x-csrf-token": connector.auth.csrf_token,
    "x-timezone-offset": connector.runtime.x_timezone_offset || "-480",
  };

  if (connector.runtime.origin) {
    headers.origin = connector.runtime.origin;
  }
  if (connector.runtime.sec_ch_ua) {
    headers["sec-ch-ua"] = connector.runtime.sec_ch_ua;
  }
  if (connector.runtime.sec_ch_ua_mobile) {
    headers["sec-ch-ua-mobile"] = connector.runtime.sec_ch_ua_mobile;
  }
  if (connector.runtime.sec_ch_ua_platform) {
    headers["sec-ch-ua-platform"] = connector.runtime.sec_ch_ua_platform;
  }

  return headers;
}

function assertSuccess(response, label) {
  const body = response.json;
  const bodyOk = !body || body.code === 0 || body.code === "0" || body.success === true;
  if (!response.ok || !bodyOk) {
    throw new Error(`${label} failed: HTTP ${response.status}\n${response.text}`);
  }
}

async function getRobot(connector) {
  const response = await request(endpoint(connector, "robot"), {
    method: "POST",
    headers: baseHeaders(connector),
    body: "{}",
  });
  assertSuccess(response, "Feishu robot/get");
  return response.json;
}

async function updateRobot(connector, payload) {
  const response = await request(endpoint(connector, "robot/update_changed"), {
    method: "POST",
    headers: baseHeaders(connector),
    body: JSON.stringify(payload),
  });
  assertSuccess(response, "Feishu robot/update_changed");
  return response.json;
}

function nextBotMenuId(botMenuConfig) {
  const numericIds = (botMenuConfig || [])
    .flatMap((item) => [item.botMenuID, ...(item.childNodes || []).map((child) => child.botMenuID)])
    .map((value) => {
      try {
        return BigInt(String(value));
      } catch (_) {
        return null;
      }
    })
    .filter((value) => value !== null);
  return String((numericIds.length ? numericIds.reduce((max, value) => (value > max ? value : max), numericIds[0]) : BigInt(Date.now())) + 1n);
}

function makeEventMenu(existingConfig, name, eventKey, primaryLang) {
  const menus = existingConfig.botMenuConfig || [];
  if (menus.length >= TOP_LEVEL_MENU_LIMIT) {
    throw new Error(`Top-level menu limit exceeded: current=${menus.length}, limit=${TOP_LEVEL_MENU_LIMIT}`);
  }
  if (menus.some((item) => item.eventKey === eventKey)) {
    throw new Error(`Duplicate eventKey: ${eventKey}`);
  }

  const nextMenu = {
    botMenuID: nextBotMenuId(menus),
    defaultName: name,
    i18nBotMenuName: {
      [primaryLang]: name,
    },
    childNodes: [],
    menuContentType: 2,
    eventKey,
  };

  return {
    menu: {
      botMenuEnable: existingConfig.botMenuEnable ?? true,
      botMenuDisplayStrategy: existingConfig.botMenuDisplayStrategy ?? 1,
      botMenuConfig: [...menus, nextMenu],
    },
  };
}

async function main() {
  const { connector } = loadConnectorCredentials("feishu-open-platform-bot-menu-manage");
  const action = requireArg(process.argv[2], "action");

  if (action === "get") {
    const result = await getRobot(connector);
    console.log(JSON.stringify({ action, result }, null, 2));
    return;
  }

  if (action === "append-event-menu") {
    const menuName = requireArg(process.argv[3], "menuName");
    const eventKey = requireArg(process.argv[4], "eventKey");
    const current = await getRobot(connector);
    const payload = makeEventMenu(current.data || {}, menuName, eventKey, connector.runtime.primary_lang || "zh_cn");
    const result = await updateRobot(connector, payload);
    console.log(JSON.stringify({ action, payload, result }, null, 2));
    return;
  }

  if (action === "update") {
    const filePath = requireArg(process.argv[3], "filePath");
    const payload = JSON.parse(fs.readFileSync(filePath, "utf8"));
    const result = await updateRobot(connector, payload);
    console.log(JSON.stringify({ action, payload, result }, null, 2));
    return;
  }

  throw new Error("Unsupported action. Use one of: get, append-event-menu, update");
}

main().catch((error) => {
  console.error(error.stack || String(error));
  process.exit(1);
});

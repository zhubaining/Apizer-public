#!/usr/bin/env node

/**
 * connector id: feishu-open-platform-scope-manage
 *
 * 作用:
 * - 管理飞书开放平台自建应用的权限
 * - 支持 applied / search / relation / update 四个动作
 *
 * 主接口:
 * - POST /developers/v1/scope/applied/{app_id}
 * - POST /developers/v1/scope/search/{app_id}
 * - POST /developers/v1/scope/relation/{app_id}
 * - POST /developers/v1/scope/update/{app_id}
 *
 * 所需 credentials 字段:
 * - auth.cookie_header
 * - auth.csrf_token
 * - runtime.app_id
 * - runtime.referer
 * - runtime.user_agent
 * - runtime.x_timezone_offset（可选）
 * - runtime.sec_ch_ua / runtime.sec_ch_ua_mobile / runtime.sec_ch_ua_platform（可选；建议先完整复用浏览器请求头）
 *
 * 输入参数:
 * - argv[2]: action，支持 applied/search/relation/update
 * - applied: 无额外参数
 * - search: argv[3] 为权限关键词，例如 docs:doc
 * - relation: argv[3...] 为一个或多个权限名
 * - update: argv[3] 为 add/remove，argv[4] 为 appScopeID，支持多个 appScopeID
 *
 * 命令行用法:
 * - 查看已开通权限: node scripts/http-feishu-open-platform-scope-manage.js applied
 * - 搜索权限: node scripts/http-feishu-open-platform-scope-manage.js search docs:doc
 * - 查看权限关系: node scripts/http-feishu-open-platform-scope-manage.js relation docs:doc docs:doc:readonly
 * - 开通权限: node scripts/http-feishu-open-platform-scope-manage.js update add 26007
 * - 关闭权限: node scripts/http-feishu-open-platform-scope-manage.js update remove 26007
 *
 * 成功判定:
 * - HTTP 200，且响应体 code 为 0、空或 success true
 *
 * 注意:
 * - update 会产生真实后台配置副作用
 * - 如果脚本成功执行依赖的是新的 cookie / csrf token，应同步更新 credentials.json 对应字段，避免后续继续使用过期会话
 */

const { loadConnectorCredentials, request, requireArg } = require("./_shared");

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

async function getApplied(connector) {
  const response = await request(endpoint(connector, "scope/applied"), {
    method: "POST",
    headers: baseHeaders(connector),
    body: "{}",
  });
  assertSuccess(response, "Feishu scope/applied");
  return response.json;
}

async function searchScope(connector, queryValue) {
  const response = await request(endpoint(connector, "scope/search"), {
    method: "POST",
    headers: baseHeaders(connector),
    body: JSON.stringify({
      queryFilter: {
        queryType: 1,
        queryValue,
        queryValues: [],
      },
    }),
  });
  assertSuccess(response, "Feishu scope/search");
  return response.json;
}

async function getRelation(connector, scopeNames) {
  const response = await request(endpoint(connector, "scope/relation"), {
    method: "POST",
    headers: baseHeaders(connector),
    body: JSON.stringify({ scopeNames }),
  });
  assertSuccess(response, "Feishu scope/relation");
  return response.json;
}

async function updateScope(connector, operation, appScopeIDs) {
  const response = await request(endpoint(connector, "scope/update"), {
    method: "POST",
    headers: baseHeaders(connector),
    body: JSON.stringify({
      appScopeIDs,
      userScopeIDs: [],
      scopeIds: [],
      operation,
      isDeveloperPanel: true,
    }),
  });
  return response;
}

async function main() {
  const { connector } = loadConnectorCredentials("feishu-open-platform-scope-manage");
  const action = requireArg(process.argv[2], "action");

  let result;
  if (action === "applied") {
    result = await getApplied(connector);
  } else if (action === "search") {
    result = await searchScope(connector, requireArg(process.argv[3], "queryValue"));
  } else if (action === "relation") {
    const scopeNames = process.argv.slice(3);
    if (!scopeNames.length) {
      throw new Error("Missing argument: scopeNames");
    }
    result = await getRelation(connector, scopeNames);
  } else if (action === "update") {
    const operation = requireArg(process.argv[3], "operation");
    if (!["add", "remove"].includes(operation)) {
      throw new Error("Unsupported operation. Use add/remove");
    }
    const appScopeIDs = process.argv.slice(4);
    if (!appScopeIDs.length) {
      throw new Error("Missing argument: appScopeIDs");
    }
    const response = await updateScope(connector, operation, appScopeIDs);
    result = {
      status: response.status,
      ok: response.ok,
      body: response.json ?? response.text,
    };
  } else {
    throw new Error("Unsupported action. Use one of: applied, search, relation, update");
  }

  console.log(JSON.stringify({ action, result }, null, 2));
}

main().catch((error) => {
  console.error(error.stack || String(error));
  process.exit(1);
});

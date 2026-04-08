#!/usr/bin/env node

/**
 * connector id: deepseek-open-platform-balance
 *
 * 作用:
 * - 读取 DeepSeek Open Platform 账户余额与概览数据
 *
 * 主接口:
 * - GET https://platform.deepseek.com/api/v0/users/get_user_summary
 *
 * 所需 credentials 字段:
 * - auth.authorization_bearer
 * - auth.x_app_version
 * - runtime.referer
 * - runtime.user_agent
 *
 * 输入参数:
 * - 无
 *
 * 命令行用法:
 * - 直接读取余额概览: node scripts/http-deepseek-open-platform-balance.js
 *
 * 成功判定:
 * - HTTP 200
 * - 响应中存在 data.biz_data.normal_wallets[0].balance
 *
 * 注意:
 * - 需要 Node.js 18+
 * - 不要在脚本里硬编码真实 token，一律从 credentials.json 读取
 */

const { loadConnectorCredentials, request } = require("./_shared");

async function main() {
  const { connector } = loadConnectorCredentials("deepseek-open-platform-balance");
  const response = await request("https://platform.deepseek.com/api/v0/users/get_user_summary", {
    headers: {
      accept: "*/*",
      authorization: `Bearer ${connector.auth.authorization_bearer}`,
      referer: connector.runtime.referer,
      "user-agent": connector.runtime.user_agent,
      "x-app-version": connector.auth.x_app_version,
    },
  });

  if (!response.ok || !response.json?.data?.biz_data?.normal_wallets?.[0]) {
    throw new Error(`DeepSeek summary request failed: HTTP ${response.status}\n${response.text}`);
  }

  const biz = response.json.data.biz_data;
  console.log(JSON.stringify({
    balance_cny: biz.normal_wallets?.[0]?.balance ?? null,
    bonus_balance_cny: biz.bonus_wallets?.[0]?.balance ?? null,
    available_token_estimation: biz.total_available_token_estimation ?? null,
    monthly_cost_cny: biz.monthly_costs?.[0]?.amount ?? null,
    monthly_token_usage: biz.monthly_token_usage ?? null,
  }, null, 2));
}

main().catch((error) => {
  console.error(error.stack || String(error));
  process.exit(1);
});

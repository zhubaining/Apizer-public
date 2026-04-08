#!/usr/bin/env node

/**
 * connector id: jike-post-engagement-stats
 *
 * 作用:
 * - 读取即刻帖子列表及互动统计
 *
 * 主接口:
 * - POST https://api.ruguoapp.com/1.0/personalUpdate/single
 *
 * 所需 credentials 字段:
 * - auth.x_jike_access_token
 * - runtime.username
 * - runtime.user_agent
 *
 * 输入参数:
 * - argv[2]: limit，可选，默认 20
 *
 * 成功判定:
 * - HTTP 200
 * - 响应中存在 data[0].id
 */

const { loadConnectorCredentials, request } = require("./_shared");

async function main() {
  const { connector } = loadConnectorCredentials("jike-post-engagement-stats");
  const limit = Number(process.argv[2] || 20);
  const response = await request("https://api.ruguoapp.com/1.0/personalUpdate/single", {
    method: "POST",
    headers: {
      accept: "application/json, text/plain, */*",
      "content-type": "application/json",
      "user-agent": connector.runtime.user_agent,
      "x-jike-access-token": connector.auth.x_jike_access_token,
    },
    body: JSON.stringify({
      limit,
      username: connector.runtime.username,
    }),
  });

  if (!response.ok || !Array.isArray(response.json?.data)) {
    throw new Error(`Jike engagement request failed: HTTP ${response.status}\n${response.text}`);
  }

  const items = response.json.data.map((item) => ({
    post_id: item.id,
    post_type: item.type,
    created_at: item.createdAt,
    content: item.content,
    like_count: item.likeCount,
    comment_count: item.commentCount,
    repost_count: item.repostCount,
    share_count: item.shareCount,
  }));

  console.log(JSON.stringify({ count: items.length, items }, null, 2));
}

main().catch((error) => {
  console.error(error.stack || String(error));
  process.exit(1);
});

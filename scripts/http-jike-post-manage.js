#!/usr/bin/env node

/**
 * connector id: jike-post-manage
 *
 * 作用:
 * - 管理即刻帖子
 * - 支持 list / detail / create / delete 四个动作
 *
 * 主接口:
 * - POST /1.0/personalUpdate/single
 * - GET /1.0/originalPosts/get
 * - POST /1.0/originalPosts/create
 * - POST /1.0/originalPosts/remove
 *
 * 所需 credentials 字段:
 * - auth.x_jike_access_token
 * - runtime.username
 * - runtime.user_agent
 * - runtime.default_topic_id
 *
 * 输入参数:
 * - argv[2]: action，支持 list/detail/create/delete
 * - list: argv[3] 可选 limit
 * - detail: argv[3] 为 post_id
 * - create: argv[3] 为 content，argv[4] 可选 topic_id
 * - delete: argv[3] 为 post_id
 *
 * 成功判定:
 * - list/detail: HTTP 200 且响应里有 data
 * - create/delete: HTTP 200 且 success === true
 *
 * 注意:
 * - create / delete 会产生真实线上副作用
 */

const { loadConnectorCredentials, request, requireArg } = require("./_shared");

function baseHeaders(connector) {
  return {
    accept: "application/json, text/plain, */*",
    "content-type": "application/json",
    "user-agent": connector.runtime.user_agent,
    "x-jike-access-token": connector.auth.x_jike_access_token,
  };
}

async function listPosts(connector, limit) {
  const response = await request("https://api.ruguoapp.com/1.0/personalUpdate/single", {
    method: "POST",
    headers: baseHeaders(connector),
    body: JSON.stringify({
      limit,
      username: connector.runtime.username,
    }),
  });
  if (!response.ok || !Array.isArray(response.json?.data)) {
    throw new Error(`Jike list failed: HTTP ${response.status}\n${response.text}`);
  }
  return response.json.data.map((item) => ({
    post_id: item.id,
    post_type: item.type,
    created_at: item.createdAt,
    content: item.content,
    like_count: item.likeCount,
    comment_count: item.commentCount,
    repost_count: item.repostCount,
    share_count: item.shareCount,
  }));
}

async function getDetail(connector, postId) {
  const response = await request(`https://api.ruguoapp.com/1.0/originalPosts/get?id=${encodeURIComponent(postId)}`, {
    headers: {
      accept: "application/json, text/plain, */*",
      "user-agent": connector.runtime.user_agent,
      "x-jike-access-token": connector.auth.x_jike_access_token,
    },
  });
  if (!response.ok || !response.json?.data?.id) {
    throw new Error(`Jike detail failed: HTTP ${response.status}\n${response.text}`);
  }
  const item = response.json.data;
  return {
    post_id: item.id,
    post_type: item.type,
    content: item.content,
    created_at: item.createdAt,
    like_count: item.likeCount,
    comment_count: item.commentCount,
    repost_count: item.repostCount,
    share_count: item.shareCount,
  };
}

async function createPost(connector, content, topicId) {
  const response = await request("https://api.ruguoapp.com/1.0/originalPosts/create", {
    method: "POST",
    headers: baseHeaders(connector),
    body: JSON.stringify({
      content,
      pictureKeys: [],
      submitToTopic: topicId || connector.runtime.default_topic_id,
      syncToPersonalUpdate: true,
    }),
  });
  if (!response.ok || response.json?.success !== true) {
    throw new Error(`Jike create failed: HTTP ${response.status}\n${response.text}`);
  }
  const item = response.json.data;
  return {
    created_post_id: item.id,
    created_post_type: item.type,
    created_content: item.content,
    created_at: item.createdAt,
  };
}

async function deletePost(connector, postId) {
  const response = await request("https://api.ruguoapp.com/1.0/originalPosts/remove", {
    method: "POST",
    headers: baseHeaders(connector),
    body: JSON.stringify({ id: postId }),
  });
  if (!response.ok || response.json?.success !== true) {
    throw new Error(`Jike delete failed: HTTP ${response.status}\n${response.text}`);
  }
  return {
    success: response.json.success,
    toast: response.json.toast,
  };
}

async function main() {
  const { connector } = loadConnectorCredentials("jike-post-manage");
  const action = requireArg(process.argv[2], "action");

  let result;
  if (action === "list") {
    result = await listPosts(connector, Number(process.argv[3] || 20));
  } else if (action === "detail") {
    result = await getDetail(connector, requireArg(process.argv[3], "post_id"));
  } else if (action === "create") {
    result = await createPost(connector, requireArg(process.argv[3], "content"), process.argv[4]);
  } else if (action === "delete") {
    result = await deletePost(connector, requireArg(process.argv[3], "post_id"));
  } else {
    throw new Error("Unsupported action. Use one of: list, detail, create, delete");
  }

  console.log(JSON.stringify({ action, result }, null, 2));
}

main().catch((error) => {
  console.error(error.stack || String(error));
  process.exit(1);
});

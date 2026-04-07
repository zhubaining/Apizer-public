---
name: connector-jike-post-engagement-stats
description: Use when the user wants to fetch their published Jike posts and the engagement counters for each post, including likes, comments, reposts, and shares, using locally stored private session material captured from the browser.
---

# Connector Jike Post Engagement Stats

用于读取即刻 Web 端“我发布的帖子列表”以及每条帖子的互动统计数据。

## 核心原理

这个 connector 之所以能工作，是因为用户主页里的帖子列表和互动计数可以通过一个可直接 HTTP 重放的只读接口返回：

- `POST https://api.ruguoapp.com/1.0/personalUpdate/single`

本次真实录制中，这个接口直接返回了帖子数组，并且每条记录都包含：

- `id`
- `type`
- `content`
- `createdAt`
- `likeCount`
- `commentCount`
- `repostCount`
- `shareCount`

因此，如果目标是“列出我发过的帖子以及点赞、评论、转发、分享数”，这个接口就是主接口。

## 读取位置

默认读取这份本地凭证文件：

- credentials:
  - `/Users/bainingzhu/Documents/code/file/Apizer/connector.credentials.json`

## 工作流

1. 先读取本 Skill 中的接口定义与 `curl` 模板
2. 再读取 `connector.credentials.json` 中 `jike-post-engagement-stats` 这条凭证
3. 用凭证替换 `curl_template` 里的占位符并执行
4. 从 JSON 响应中遍历 `data` 数组
5. 对每条帖子返回这些字段：
- `post_id`
- `post_type`
- `created_at`
- `content`
- `like_count`
- `comment_count`
- `repost_count`
- `share_count`

## Connector Id

- `jike-post-engagement-stats`

## 接口定义

### 执行模式

- `direct_http`

### 主接口

- `POST https://api.ruguoapp.com/1.0/personalUpdate/single`

这是主接口，因为它的响应里直接返回了用户帖子列表和每条帖子的互动统计字段。

### 已录到的请求体示例

```json
{
  "limit": 20,
  "username": "${credentials.runtime.username}"
}
```

### 辅助接口

这些接口在页面中出现，但不是获取帖子互动列表的主接口：

- `GET https://api.ruguoapp.com/1.0/users/profile?username=${credentials.runtime.username}`
- `POST https://api.ruguoapp.com/1.0/userRelation/getFollowerList`
- `POST https://api.ruguoapp.com/1.0/userRelation/getFollowingList`

### 动态字段

- `x-jike-access-token`
  - 来源：`credentials.auth.x_jike_access_token`
- `username`
  - 来源：`credentials.runtime.username`
- `user-agent`
  - 来源：`credentials.runtime.user_agent`

录制里 `Referer` 为空，因此它不是必需动态字段。

### Curl 模板

```bash
curl -sS 'https://api.ruguoapp.com/1.0/personalUpdate/single' \
  -H 'accept: application/json, text/plain, */*' \
  -H 'content-type: application/json' \
  -H 'user-agent: ${credentials.runtime.user_agent}' \
  -H 'x-jike-access-token: ${credentials.auth.x_jike_access_token}' \
  --data '{"limit":20,"username":"${credentials.runtime.username}"}'
```

### 成功判定

- HTTP `200`
- JSON 路径 `$.data[0].id` 存在
- JSON 路径 `$.data[0].likeCount` 存在

### 结果映射

- `items[*].post_id` -> `$.data[*].id`
- `items[*].post_type` -> `$.data[*].type`
- `items[*].created_at` -> `$.data[*].createdAt`
- `items[*].content` -> `$.data[*].content`
- `items[*].like_count` -> `$.data[*].likeCount`
- `items[*].comment_count` -> `$.data[*].commentCount`
- `items[*].repost_count` -> `$.data[*].repostCount`
- `items[*].share_count` -> `$.data[*].shareCount`

## 使用方式

如果只是本地验证，按上面的 `curl` 模板替换占位符即可。

如果是 Agent 执行：
- 先读本 Skill
- 再读 `connector.credentials.json`
- 用同名 connector 的 credentials 替换模板变量
- 执行请求
- 遍历 `data` 数组，按结果映射提取字段并返回

## 故障判断

如果失败，优先判断：

- `x-jike-access-token` 已失效
- `username` 与当前登录态不匹配
- 即刻 Web 登录态已变化，需要重新录制会话材料

如果出现鉴权失败，应优先更新 `connector.credentials.json` 中对应 connector 的当前会话材料；只有在无法更新时，才提示用户重新登录即刻并重新录制，不要伪造结果。

## 当前边界

本 Skill 已通过真实录制确认“帖子列表 + 互动计数”主接口。

但以下接口本轮未做真实重放确认，因此不应混入这个 connector：

- 单条原帖详情：`GET /1.0/originalPosts/get?id=...`
- 单条转发详情：`GET /1.0/reposts/get?id=...`

如果后续目标变成“打开单条帖子详情页再抓更多字段”，应单独录制并生成新的 connector。

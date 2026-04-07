---
name: connector-jike-post-manage
description: Use when the user wants to create a Jike post, fetch their post list with engagement counters, read a single post detail, or delete one of their posts, using locally stored private session material captured from the browser.
---

# Connector Jike Post Manage

用于管理即刻 Web 端帖子，当前已通过真实录制确认以下动作：

- 获取我发布的帖子列表及互动数
- 获取单条原帖详情
- 发一条原帖
- 删除一条原帖

## 核心原理

即刻 Web 端这几个动作都可以通过带 `x-jike-access-token` 的 HTTP 请求直接重放，不依赖浏览器 DOM。

本次真实录制确认的主接口如下：

- 列表与互动数：
  - `POST https://api.ruguoapp.com/1.0/personalUpdate/single`
- 单帖详情：
  - `GET https://api.ruguoapp.com/1.0/originalPosts/get?id=${input.post_id}`
- 发帖：
  - `POST https://api.ruguoapp.com/1.0/originalPosts/create`
- 删除：
  - `POST https://api.ruguoapp.com/1.0/originalPosts/remove`

## 读取位置

默认读取这份本地凭证文件：

- credentials:
  - `/Users/bainingzhu/Documents/code/file/Apizer/connector.credentials.json`

## Connector Id

- `jike-post-manage`

## 执行模式

- `direct_http`

## 动态字段

- `x-jike-access-token`
  - 来源：`credentials.auth.x_jike_access_token`
- `username`
  - 来源：`credentials.runtime.username`
- `user-agent`
  - 来源：`credentials.runtime.user_agent`
- `topic_id`
  - 默认来源：`credentials.runtime.default_topic_id`
  - 也可由调用时显式传入 `input.topic_id`

录制里 `Referer` 为空，因此它不是必需动态字段。

## 动作 1：获取我发布的帖子列表及互动数

### 主接口

- `POST https://api.ruguoapp.com/1.0/personalUpdate/single`

### 请求体模板

```json
{
  "limit": 20,
  "username": "${credentials.runtime.username}"
}
```

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

## 动作 2：获取单条原帖详情

### 主接口

- `GET https://api.ruguoapp.com/1.0/originalPosts/get?id=${input.post_id}`

### Curl 模板

```bash
curl -sS 'https://api.ruguoapp.com/1.0/originalPosts/get?id=${input.post_id}' \
  -H 'accept: application/json, text/plain, */*' \
  -H 'user-agent: ${credentials.runtime.user_agent}' \
  -H 'x-jike-access-token: ${credentials.auth.x_jike_access_token}'
```

### 成功判定

- HTTP `200`
- JSON 路径 `$.data.id` 存在

### 结果映射

- `post_id` -> `$.data.id`
- `post_type` -> `$.data.type`
- `content` -> `$.data.content`
- `created_at` -> `$.data.createdAt`
- `like_count` -> `$.data.likeCount`
- `comment_count` -> `$.data.commentCount`
- `repost_count` -> `$.data.repostCount`
- `share_count` -> `$.data.shareCount`

## 动作 3：发一条原帖

### 主接口

- `POST https://api.ruguoapp.com/1.0/originalPosts/create`

### 已录到的最小请求体

```json
{
  "content": "${input.content}",
  "pictureKeys": [],
  "submitToTopic": "${resolved.topic_id}",
  "syncToPersonalUpdate": true
}
```

其中 `resolved.topic_id` 的取值规则为：

- 若调用时传入 `input.topic_id`，优先使用它
- 否则使用 `credentials.runtime.default_topic_id`

### Curl 模板

```bash
curl -sS 'https://api.ruguoapp.com/1.0/originalPosts/create' \
  -H 'accept: application/json, text/plain, */*' \
  -H 'content-type: application/json' \
  -H 'user-agent: ${credentials.runtime.user_agent}' \
  -H 'x-jike-access-token: ${credentials.auth.x_jike_access_token}' \
  --data '{"content":"${input.content}","pictureKeys":[],"submitToTopic":"${resolved.topic_id}","syncToPersonalUpdate":true}'
```

### 成功判定

- HTTP `200`
- JSON 路径 `$.success == true`
- JSON 路径 `$.data.id` 存在

### 结果映射

- `created_post_id` -> `$.data.id`
- `created_post_type` -> `$.data.type`
- `created_content` -> `$.data.content`
- `created_at` -> `$.data.createdAt`

## 动作 4：删除一条原帖

### 主接口

- `POST https://api.ruguoapp.com/1.0/originalPosts/remove`

### 已录到的最小请求体

```json
{
  "id": "${input.post_id}"
}
```

### Curl 模板

```bash
curl -sS 'https://api.ruguoapp.com/1.0/originalPosts/remove' \
  -H 'accept: application/json, text/plain, */*' \
  -H 'content-type: application/json' \
  -H 'user-agent: ${credentials.runtime.user_agent}' \
  -H 'x-jike-access-token: ${credentials.auth.x_jike_access_token}' \
  --data '{"id":"${input.post_id}"}'
```

### 成功判定

- HTTP `200`
- JSON 路径 `$.success == true`

### 结果映射

- `success` -> `$.success`
- `toast` -> `$.toast`

## 辅助接口

这些接口在页面中出现，但不是上述动作的主接口：

- `GET https://api.ruguoapp.com/1.0/users/profile?username=${credentials.runtime.username}`
- `POST https://api.ruguoapp.com/1.0/userRelation/getFollowerList`
- `POST https://api.ruguoapp.com/1.0/userRelation/getFollowingList`
- `POST https://api.ruguoapp.com/1.0/originalPosts/listDraftSuggestions`
- `POST https://api.ruguoapp.com/1.0/users/topics/search`

## 使用方式

如果是 Agent 执行：

1. 先读本 Skill
2. 再读 `connector.credentials.json`
3. 根据动作选择对应接口
4. 用同名 connector 的 credentials 替换模板变量
5. 执行请求
6. 按结果映射提取字段并返回

## 故障判断

如果失败，优先判断：

- `x-jike-access-token` 已失效
- `username` 与当前登录态不匹配
- `topic_id` 无效或当前账号无权在该话题下发帖
- 帖子已不存在，导致删除失败

如果出现鉴权失败，应优先更新 `connector.credentials.json` 中对应 connector 的当前会话材料；只有在无法更新时，才提示用户重新登录即刻并重新录制，不要伪造结果。

## 当前边界

这份 Skill 当前只覆盖原帖：

- `originalPosts/create`
- `originalPosts/get`
- `originalPosts/remove`

尚未单独确认转发帖的创建或删除接口；如果后续目标包含 repost，应单独录制补充。

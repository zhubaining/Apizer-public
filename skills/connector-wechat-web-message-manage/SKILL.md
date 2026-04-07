---
name: connector-wechat-web-message-manage
description: Use when the user wants to pull the Web WeChat contact list, fetch the latest messages, or send a text message using locally stored private session material captured from the browser.
---

# Connector Web WeChat Message Manage

用于操作 Web 微信当前登录会话，当前已通过真实流量确认以下动作：

- 拉取通讯录
- 拉取最新消息
- 发送文本消息

## 核心原理

Web 微信这几类动作都可以通过带当前登录态 cookie 的 HTTP 请求直接重放，不依赖浏览器 DOM。

本次真实录制确认的主接口如下：

- 通讯录：
  - `GET https://${credentials.runtime.host}/cgi-bin/mmwebwx-bin/webwxgetcontact`
- 消息轮询：
  - `GET https://${credentials.runtime.push_host}/cgi-bin/mmwebwx-bin/synccheck`
- 增量消息：
  - `POST https://${credentials.runtime.host}/cgi-bin/mmwebwx-bin/webwxsync`
- 发送文本消息：
  - `POST https://${credentials.runtime.host}/cgi-bin/mmwebwx-bin/webwxsendmsg`

## 读取位置

默认读取这份本地凭证文件：

- credentials:
  - `/Users/bainingzhu/Documents/code/Apizer/connector.credentials.json`

## Connector Id

- `wechat-web-message-manage`

## 执行模式

- `direct_http`

## 动态字段

- `cookie`
  - 来源：`credentials.auth.cookie_header`
- `host`
  - 来源：`credentials.runtime.host`
- `push_host`
  - 来源：`credentials.runtime.push_host`
- `uin`
  - 来源：`credentials.runtime.uin`
- `sid`
  - 来源：`credentials.runtime.sid`
- `skey`
  - 来源：`credentials.runtime.skey`
- `pass_ticket`
  - 来源：`credentials.runtime.pass_ticket`
- `from_user_name`
  - 来源：`credentials.runtime.from_user_name`
- `to_user_name`
  - 默认来源：`credentials.runtime.default_to_user_name`
  - 也可由调用时显式传入 `input.to_user_name`
- `content`
  - 来源：`input.content`
- `sync_key`
  - 默认来源：`credentials.runtime.sync_key`
  - 也可由调用时显式传入 `input.sync_key`
- `sync_check_key`
  - 默认来源：`credentials.runtime.sync_check_key`
  - 也可由调用时显式传入 `input.sync_check_key`
- `user-agent`
  - 来源：`credentials.runtime.user_agent`
- `referer`
  - 来源：`credentials.runtime.referer`
- `device_id`
  - 不建议固化
  - 每次请求动态生成：`e` + 15 位随机数字

## 动作 1：拉取通讯录

### 主接口

- `GET https://${credentials.runtime.host}/cgi-bin/mmwebwx-bin/webwxgetcontact?pass_ticket=${credentials.runtime.pass_ticket}&r=${resolved.r}&seq=${resolved.seq}&skey=${credentials.runtime.skey}`

### Curl 模板

```bash
curl -sS 'https://${credentials.runtime.host}/cgi-bin/mmwebwx-bin/webwxgetcontact?pass_ticket=${credentials.runtime.pass_ticket}&r=${resolved.r}&seq=${resolved.seq}&skey=${credentials.runtime.skey}' \
  -H 'accept: application/json, text/plain, */*' \
  -H 'referer: ${credentials.runtime.referer}' \
  -H 'user-agent: ${credentials.runtime.user_agent}' \
  -H 'cookie: ${credentials.auth.cookie_header}'
```

### 成功判定

- HTTP `200`
- JSON 路径 `$.MemberList[0].UserName` 存在

### 结果映射

- `member_count` -> `$.MemberCount`
- `items[*].user_name` -> `$.MemberList[*].UserName`
- `items[*].nick_name` -> `$.MemberList[*].NickName`
- `items[*].remark_name` -> `$.MemberList[*].RemarkName`
- `items[*].verify_flag` -> `$.MemberList[*].VerifyFlag`

## 动作 2：检查并拉取最新消息

### 2.1 是否有消息更新

- `GET https://${credentials.runtime.push_host}/cgi-bin/mmwebwx-bin/synccheck?r=${resolved.r}&skey=${credentials.runtime.skey}&sid=${credentials.runtime.sid}&uin=${credentials.runtime.uin}&deviceid=${resolved.device_id}&synckey=${resolved.sync_check_key}&_=${resolved.poll_ts}`

### Curl 模板

```bash
curl -sS 'https://${credentials.runtime.push_host}/cgi-bin/mmwebwx-bin/synccheck?r=${resolved.r}&skey=${credentials.runtime.skey}&sid=${credentials.runtime.sid}&uin=${credentials.runtime.uin}&deviceid=${resolved.device_id}&synckey=${resolved.sync_check_key}&_=${resolved.poll_ts}' \
  -H 'referer: ${credentials.runtime.referer}' \
  -H 'user-agent: ${credentials.runtime.user_agent}' \
  -H 'cookie: ${credentials.auth.cookie_header}'
```

### 成功判定

- HTTP `200`
- 响应文本包含 `retcode:"0"`

### 2.2 拉增量消息

- `POST https://${credentials.runtime.host}/cgi-bin/mmwebwx-bin/webwxsync?sid=${credentials.runtime.sid}&skey=${credentials.runtime.skey}&pass_ticket=${credentials.runtime.pass_ticket}`

### 请求体模板

```json
{
  "BaseRequest": {
    "Uin": "${credentials.runtime.uin}",
    "Sid": "${credentials.runtime.sid}",
    "Skey": "${credentials.runtime.skey}",
    "DeviceID": "${resolved.device_id}"
  },
  "SyncKey": "${resolved.sync_key}",
  "rr": "${resolved.rr}"
}
```

### Curl 模板

```bash
curl -sS 'https://${credentials.runtime.host}/cgi-bin/mmwebwx-bin/webwxsync?sid=${credentials.runtime.sid}&skey=${credentials.runtime.skey}&pass_ticket=${credentials.runtime.pass_ticket}' \
  -H 'accept: application/json, text/plain, */*' \
  -H 'content-type: application/json;charset=UTF-8' \
  -H 'referer: ${credentials.runtime.referer}' \
  -H 'user-agent: ${credentials.runtime.user_agent}' \
  -H 'cookie: ${credentials.auth.cookie_header}' \
  --data '${resolved.sync_body_json}'
```

其中：

- `resolved.sync_body_json` 需要把 `resolved.sync_key` 填入 `SyncKey`
- `resolved.rr` 取 `-Date.now()`
- 成功响应里的新 `SyncKey` 应覆盖旧值

### 成功判定

- HTTP `200`
- JSON 路径 `$.BaseResponse.Ret == 0`
- JSON 路径 `$.SyncKey.Count` 存在

### 结果映射

- `add_msg_count` -> `$.AddMsgCount`
- `items[*].msg_id` -> `$.AddMsgList[*].MsgId`
- `items[*].from_user_name` -> `$.AddMsgList[*].FromUserName`
- `items[*].to_user_name` -> `$.AddMsgList[*].ToUserName`
- `items[*].content` -> `$.AddMsgList[*].Content`
- `next_sync_key` -> `$.SyncKey`

## 动作 3：发送文本消息

### 主接口

- `POST https://${credentials.runtime.host}/cgi-bin/mmwebwx-bin/webwxsendmsg?pass_ticket=${credentials.runtime.pass_ticket}`

### 已录到的最小请求体

```json
{
  "BaseRequest": {
    "Uin": "${credentials.runtime.uin}",
    "Sid": "${credentials.runtime.sid}",
    "Skey": "${credentials.runtime.skey}",
    "DeviceID": "${resolved.device_id}"
  },
  "Msg": {
    "Type": 1,
    "Content": "${input.content}",
    "FromUserName": "${credentials.runtime.from_user_name}",
    "ToUserName": "${resolved.to_user_name}",
    "LocalID": "${resolved.msg_id}",
    "ClientMsgId": "${resolved.msg_id}"
  },
  "Scene": 0
}
```

### Curl 模板

```bash
curl -sS 'https://${credentials.runtime.host}/cgi-bin/mmwebwx-bin/webwxsendmsg?pass_ticket=${credentials.runtime.pass_ticket}' \
  -H 'accept: application/json, text/plain, */*' \
  -H 'content-type: application/json;charset=UTF-8' \
  -H 'referer: ${credentials.runtime.referer}' \
  -H 'user-agent: ${credentials.runtime.user_agent}' \
  -H 'cookie: ${credentials.auth.cookie_header}' \
  --data '{"BaseRequest":{"Uin":${credentials.runtime.uin},"Sid":"${credentials.runtime.sid}","Skey":"${credentials.runtime.skey}","DeviceID":"${resolved.device_id}"},"Msg":{"Type":1,"Content":"${input.content}","FromUserName":"${credentials.runtime.from_user_name}","ToUserName":"${resolved.to_user_name}","LocalID":"${resolved.msg_id}","ClientMsgId":"${resolved.msg_id}"},"Scene":0}'
```

### 成功判定

- HTTP `200`
- JSON 路径 `$.BaseResponse.Ret == 0`
- JSON 路径 `$.MsgID` 存在

### 结果映射

- `success` -> `$.BaseResponse.Ret == 0`
- `msg_id` -> `$.MsgID`
- `local_id` -> `$.LocalID`

## 使用方式

如果是 Agent 执行：

1. 先读本 Skill
2. 再读 `connector.credentials.json`
3. 生成 `device_id`
4. 如果是发消息，生成 `msg_id`
5. 如果是拉消息，优先先做 `synccheck`
6. 再按动作执行对应接口
7. 若 `webwxsync` 成功，记得保存新 `SyncKey`

## 故障判断

如果失败，优先判断：

- `cookie_header` 已过期
- `pass_ticket` 已变化
- `sid` 或 `skey` 与当前登录态不匹配
- `sync_key` 已过旧，未被成功刷新

如果出现 `1100`、`1101`、`1102` 或请求返回未登录，应优先重新登录 Web 微信并重新录制当前会话材料，不要伪造结果。

## 当前边界

这份 Skill 当前只覆盖：

- `webwxgetcontact`
- `synccheck`
- `webwxsync`
- `webwxsendmsg`

尚未单独沉淀图片、文件、语音、撤回、建群等接口；如果后续目标包含这些动作，应单独录制补充。

---
name: connector-deepseek-open-platform-balance
description: Use when the user wants to fetch the account balance, available token estimation, monthly cost, or monthly token usage from DeepSeek Open Platform using locally stored private session material captured from the browser.
---

# Connector DeepSeek Open Platform Balance

用于读取 DeepSeek Open Platform 的账户余额与相关概览数据。

## 核心原理

这个 connector 之所以能工作，是因为 DeepSeek 平台的余额主数据来自一个可直接 HTTP 重放的只读接口：

- `GET https://platform.deepseek.com/api/v0/users/get_user_summary`

只要本地保存的会话头仍然有效，就不需要浏览器 DOM 或页面上下文，就能直接读到余额。

## 读取位置

默认读取这份本地凭证文件：

- credentials:
  - `/Users/bainingzhu/Documents/code/file/Apizer/connector.credentials.json`

## 工作流

1. 先读取本 Skill 中的接口定义与 `curl` 模板
2. 再读取 `connector.credentials.json` 中 `deepseek-open-platform-balance` 这条凭证
3. 用凭证替换 `curl_template` 里的占位符并执行
4. 从 JSON 响应中读取并返回这些字段：
- `balance_cny`
- `bonus_balance_cny`
- `available_token_estimation`
- `monthly_cost_cny`
- `monthly_token_usage`

## Connector Id

- `deepseek-open-platform-balance`

## 接口定义

### 执行模式

- `direct_http`

### 主接口

- `GET https://platform.deepseek.com/api/v0/users/get_user_summary`

这是余额主接口，因为响应中直接包含：

- `normal_wallets[0].balance`
- `bonus_wallets[0].balance`
- `total_available_token_estimation`
- `monthly_costs[0].amount`
- `monthly_token_usage`

### 辅助接口

这些请求会在页面中出现，但不是余额主接口：

- `GET /api/v0/usage/amount?month=${input.month}&year=${input.year}`
- `GET /api/v0/usage/cost?month=${input.month}&year=${input.year}`

### 动态字段

- `authorization`
  - 来源：`credentials.auth.authorization_bearer`
- `x-app-version`
  - 来源：`credentials.auth.x_app_version`
- `referer`
  - 来源：`credentials.runtime.referer`
- `user-agent`
  - 来源：`credentials.runtime.user_agent`

### Curl 模板

```bash
curl -sS 'https://platform.deepseek.com/api/v0/users/get_user_summary' \
  -H 'authorization: Bearer ${credentials.auth.authorization_bearer}' \
  -H 'x-app-version: ${credentials.auth.x_app_version}' \
  -H 'referer: ${credentials.runtime.referer}' \
  -H 'user-agent: ${credentials.runtime.user_agent}' \
  -H 'accept: */*'
```

### 成功判定

- HTTP `200`
- JSON 路径 `$.data.biz_data.normal_wallets[0].balance` 存在

### 结果映射

- `balance_cny` -> `$.data.biz_data.normal_wallets[0].balance`
- `bonus_balance_cny` -> `$.data.biz_data.bonus_wallets[0].balance`
- `available_token_estimation` -> `$.data.biz_data.total_available_token_estimation`
- `monthly_cost_cny` -> `$.data.biz_data.monthly_costs[0].amount`
- `monthly_token_usage` -> `$.data.biz_data.monthly_token_usage`

## 使用方式

如果只是本地验证，按上面的 `curl` 模板替换占位符即可。

如果是 Agent 执行：
- 先读本 Skill
- 再读 `connector.credentials.json`
- 用同名 connector 的 credentials 替换模板变量
- 执行请求
- 按结果映射提取字段并返回

## 故障判断

如果失败，优先判断：

- Bearer token 已失效
- `x-app-version` 变化
- 用户重新登录后旧私有材料过期

如果出现鉴权失败，应优先更新 `connector.credentials.json` 中对应 connector 的当前会话材料；只有在无法更新时，才提示用户重新登录平台并重新录制，不要伪造结果。

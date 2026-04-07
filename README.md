# Apizer

Apizer 用来把网站里的真实浏览器操作，沉淀成可复用的 Agent 自动化能力。

它的核心用途是：

- 让 Agent 接管真实浏览器页面
- 在操作页面的同时分析交互数据和页面代码
- 找出页面背后的 API
- 把结果沉淀成后续可重复调用的 skill

## 怎么用

最简单的用法不是先读一堆说明文档，而是：

1. 把 [SKILL.md](./SKILL.md) 直接交给你自己的 Agent
2. Agent 读取 skill 后，就会知道：
   - 推荐使用 `Playwright + Playwright MCP Bridge`
   - 先做分析与沉淀
   - 再进入后续调用阶段
   - 需要哪些本地材料和输出文件

也就是说，这个仓库的主要入口就是：

- [SKILL.md](./SKILL.md)

## 目录里几个关键文件

### 1. 主 skill 文件

- [SKILL.md](./SKILL.md)

这是 Apizer 自己的主 skill。

作用：

- 告诉 Agent 应该如何接管真实页面
- 如何分析接口
- 如何沉淀成本地私有凭证和可分享 connector skill
- 如何在后续阶段复用已经沉淀出来的能力

如果你只想让自己的 Agent 用起来，优先把这个文件交给 Agent。

### 2. 已经分享出来的 skills

- [skills](./skills)

这个目录下放的是已经沉淀好的具体 connector skills。

作用：

- 每个子目录对应一个已经分析出来的站点动作
- Agent 后续可以直接读取这些 skill 来执行具体动作

它们相当于“分析完成后的产物”。

### 3. 移除实际值的 credential 文件

- [connector.credentials.json](./connector.credentials.json)

这个文件保存本地私有材料，例如：

- cookie
- token
- csrf
- session
- 其他动态 header 或运行时值

作用：

- 给已经沉淀好的 connector skill 提供本地私有凭证

注意：

- 这个文件通常应该只在本地使用
- 如果要公开分享，应该改成占位符模板，不能直接提交真实值

### 4. `reliable.js` / CDP 录制脚本

- [cdp_record_reliable.js](./scripts/cdp_record_reliable.js)

这是一个更可靠的 CDP 网络录制脚本。

作用：

- 当你走 CDP 录制路线时，可以用它稳定记录网络请求和响应
- 把原始事件流和整理后的 request/response 落盘

它不是默认主入口，但仍然值得一起分享，因为：

- 有些场景下需要单独做 CDP 录制
- 它可以作为 `Playwright MCP Bridge` 主线之外的补充工具

## 已分享接口示例

当前 `skills/` 目录里已经有这些可直接复用的接口示例：

- [connector-deepseek-open-platform-balance](./skills/connector-deepseek-open-platform-balance/SKILL.md)：读取 DeepSeek 开放平台账户余额、赠送余额、可用 token 估算、当月费用、当月 token 用量
- [connector-jike-post-manage](./skills/connector-jike-post-manage/SKILL.md)：获取即刻帖子列表和互动数、读取单条帖子详情、发帖、删帖
- [connector-jike-post-engagement-stats](./skills/connector-jike-post-engagement-stats/SKILL.md)：读取即刻帖子列表、正文、发布时间以及点赞、评论、转发、分享统计
- [connector-wechat-web-message-manage](./skills/connector-wechat-web-message-manage/SKILL.md)：拉取 Web 微信通讯录、获取最新消息、发送文本消息

这些示例的意义不是“只适用于这些网站”，而是给你一个可复用模板：

- 如何描述 connector 的目标动作
- 如何说明主接口和辅助接口
- 如何组织动态字段和本地凭证
- 如何给 Agent 提供后续可重复调用的执行规则

## 一句话理解

如果你要把 Apizer 给别人用，最核心的是分享这几个东西：

- [SKILL.md](./SKILL.md)
- [skills](./skills)
- 一个脱敏后的 [connector.credentials.json](./connector.credentials.json) 模板
- [cdp_record_reliable.js](./scripts/cdp_record_reliable.js)

## 作者

- X: https://x.com/zhubaining001
- 即刻: https://web.okjike.com/u/b197f4fc-2487-4394-ae57-1ede11c6270c

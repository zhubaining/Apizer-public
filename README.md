# Apizer

AI、智能体时代，要把操作自动化，本质上就是要给智能体“可执行能力”。

最理想的情况，当然是让AI调用官方直接提供命令行或者 API。但现实是，很多软件官方并没有提供。

那么，需要我们自己分析出API，思路很简单，就是导出网站交互数据，从而分析出API接口。

AI时代，这个事情变得可能了——让AI分析AI导出的数据，形成API，给AI自己使用。

Apizer 就是总结出的一个给AI干这个事情的skill文档。

## 怎么用

很简单：

1. 把 [SKILL.md](./SKILL.md) 直接交给你自己的 Agent，告诉它参照skill分析出某某网站的xx操作的API。
2. Agent 读取 skill 后，就会知道：
   - 推荐使用 `Playwright + Playwright MCP Bridge`
   - 先做分析与沉淀
   - 再进入后续调用阶段
   - 需要哪些本地材料和输出文件
3. 必要时，你听从AI的指令，做一些配合工作

当然，这个skill文档也是个技术文档，你感兴趣可以自己阅读下。

## 目录里几个关键文件

### 1. 主 skill 文件

- [SKILL.md](./SKILL.md)

这是 Apizer 自己的主 skill，前面说了。

### 2. 已经分析出来的示例skills

- [skills](./skills)

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

### 3. 脱敏的示例credential 文件

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

这是一个 CDP 网络录制脚本。

作用：

- 当你走 CDP 录制路线时，可以用它稳定记录网络请求和响应
- 把原始事件流和整理后的 request/response 落盘

它不是默认主入口，但仍然值得一起分享，因为：

- 有些场景下需要单独做 CDP 录制
- 它可以作为 `Playwright MCP Bridge` 主线之外的补充工具

## 作者

- X: https://x.com/zhubaining001
- 即刻: https://web.okjike.com/u/b197f4fc-2487-4394-ae57-1ede11c6270c

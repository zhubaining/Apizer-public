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
   - 如果用户当前不方便安装 `Playwright MCP + Bridge`，也可以先用 `curl` / `wget` 拉页面和前端脚本做快速试探
   - 先做分析与沉淀
   - 再进入后续调用阶段
   - 默认优先导出可稳定重放的 `HTTP` 接口
   - 如果遇到防自动化机制、动态签名、页面上下文强绑定等情况，HTTP接口无法重放，则产出 `Playwright` 页面操作脚本
   - 需要哪些本地材料和输出文件
3. 必要时，你听从AI的指令，做一些配合工作

补充说明：

- 默认更推荐 `Playwright + Playwright MCP Bridge`
- 因为它更利于同时分析真实登录态、网络请求、前端脚本和页面运行态
- `curl` / `wget` 拉脚本更适合作为“用户暂时不方便安装 Playwright”时的降级方案，用来先快速试探接口和路由线索

当然，这个skill文档也是个技术文档，你感兴趣可以自己阅读下。

## 目录里几个关键文件

### 1. 主 skill 文件

- [SKILL.md](./SKILL.md)

这是 Apizer 自己的主 skill，前面说了。

### 2. 脚本目录

- [scripts](./scripts)

这个目录下放的是已经分析完成、后续可直接执行的脚本。

这里主要沉淀两种脚本：

- `http-*.js`：接口脚本，适合已经能稳定重放的 HTTP 能力
- `playwright-*.js`：页面操作脚本，适合必须依赖真实页面上下文的能力

当前已经提供这些示例：

- [http-deepseek-open-platform-balance.js](./scripts/http-deepseek-open-platform-balance.js)：读取 DeepSeek 开放平台账户余额、赠送余额、可用 token 估算、当月费用、当月 token 用量
- [http-feishu-open-platform-scope-manage.js](./scripts/http-feishu-open-platform-scope-manage.js)：读取、搜索、关联和开通/关闭飞书开放平台自建应用权限
- [http-feishu-open-platform-bot-menu-manage.js](./scripts/http-feishu-open-platform-bot-menu-manage.js)：读取和更新飞书开放平台自建应用机器人自定义菜单
- [http-jike-post-manage.js](./scripts/http-jike-post-manage.js)：获取即刻帖子列表和互动数、读取单条帖子详情、发帖、删帖
- [http-jike-post-engagement-stats.js](./scripts/http-jike-post-engagement-stats.js)：读取即刻帖子列表、正文、发布时间以及点赞、评论、转发、分享统计
- [http-wechat-web-message-manage.js](./scripts/http-wechat-web-message-manage.js)：拉取 Web 微信通讯录、获取最新消息、发送文本消息
- [playwright-x-post-create.js](./scripts/playwright-x-post-create.js)：基于 `Playwright MCP + Bridge` 在真实已登录的 X 页面发帖，不依赖 `credentials.json`，支持直接命令行执行

这样后续不需要再读额外的接口文档，直接执行脚本就行。

补充说明：

- `HTTP` 脚本通常可以直接在本地 Node 环境执行
- `Playwright` 脚本如果明确依赖 `Playwright MCP + Bridge`，则应理解为“通过 MCP server 去驱动真实页面的动作脚本”
- 脚本可以保留模块化页面动作函数，但最终应提供一个可直接执行的命令行入口
- 这类脚本的推荐形态是：命令行里直接启动 `playwright-mcp --extension`，再通过 MCP 调用真实页面动作
- 如果脚本只是操作已登录页面，而不需要 cookie/token/session，这类页面选择器和默认 URL 不应写入 `credentials.json`

X 发帖脚本当前的直接执行方式：

- 先安装依赖：`npm install`
- 确保浏览器里的 `Playwright MCP Bridge` 已连接，且当前登录了 `x.com`
- 执行：`node scripts/playwright-x-post-create.js create "你的帖子内容"`

### 3. 凭证模板与本地敏感文件

- [credentials-example.json](./credentials-example.json)

模板文件里只放占位符。用户本地真实敏感值应保存到项目根目录的 `credentials.json`，例如：

- cookie
- token
- csrf
- session
- 其他动态 header 或运行时值

作用：

- 给已经沉淀好的执行脚本提供本地私有凭证

注意：

- Public 仓库里只提交 `credentials-example.json`
- 用户本地真实 `credentials.json` 不应上传
- 所有真实运行脚本默认都只读取 `credentials.json`
- `credentials-example.json` 不参与真实执行，它只是给 Git 提交的占位模板
- 仓库拉取下来后，要先把 `credentials-example.json` 复制或改名为 `credentials.json`
- 推荐先复制模板：
  - `cp credentials-example.json credentials.json`
  - 再把占位符替换成自己的真实值

如果某个 connector 后续需要经常验证，也可以在 `scripts/` 目录里补一个最小验证脚本。

推荐关系是：

- 总 [SKILL.md](./SKILL.md) 里放通用方法
- `credentials-example.json` 里放公开可提交的占位符模板，不参与真实执行
- 用户本地真实私有凭证放 `credentials.json`，运行时统一读取它
- `scripts/` 里放随时可执行的最小验证脚本

这样后续只要执行脚本，就可以快速验证当前 connector 是否还能正常工作

## 作者

- X: https://x.com/zhubaining001
- 即刻: https://web.okjike.com/u/b197f4fc-2487-4394-ae57-1ede11c6270c

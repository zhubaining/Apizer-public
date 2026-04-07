---
name: Apizer
description: Use when the user wants to turn a website's browser workflow into reusable Agent assets by using Playwright plus Playwright MCP Bridge to operate the real browser, analyze network and page behavior, separate private session material from a shareable connector skill entry, and keep local credentials up to date when tokens expire.
---

# Apizer

核心方法：

- 使用 `Playwright + Playwright MCP Bridge`，在自动化操作页面的同时分析接口

这是当前默认主线，因为它可以同时做到：

- 直接接管用户当前真实浏览器页面并执行操作
- 顺手读取前后端交互数据和页面代码
- 把页面背后的 API、动态字段和私有凭证来源沉淀成可复用 skill

整个 Skill 应分成四个部分来理解：

1. 准备
- 安装 `Playwright MCP`
- 安装 `Playwright MCP Bridge`
- 确认扩展连接成功，可真正接管当前浏览器 tab

2. 录制与沉淀
- 接管真实页面
- 录制或读取交互数据
- 识别主接口、依赖接口、动态字段、私有凭证来源
- 产出可分享的 connector skill 定义和本地私有凭证材料

3. 后续调用
- 读取已经沉淀好的 `SKILL.md`
- 读取本地 `connector.credentials.json`
- 直接调用接口，或在需要时回到浏览器上下文补齐动态值

4. `credentials` 更新
- 当 cookie、token、csrf 等值失效时
- 重新通过 `Playwright MCP Bridge` 接管真实页面
- 在真实登录态下重新抓取最新私有凭证
- 更新回本地 `connector.credentials.json`

也就是说：

- 前两部分解决“怎么把页面动作变成可复用能力”
- 后两部分解决“之后怎么稳定重复调用并持续维护这项能力”

用于把“用户在浏览器里做一遍操作”转换成两类可复用资产：

1. 私有执行材料
- Cookie
- Access token / refresh token
- CSRF token
- 动态 header 实值
- 其他会话态、设备态、运行时值

2. 可分享执行型 Skill
- host / method / path
- 请求参数 schema
- 响应字段 schema
- 动作语义
- 动态字段来源
- 成功判定
- 前置依赖
- 最小 `curl` 模板
- 必要的分析结论摘要

本 Skill 适用于：
- 用户想分析某个网站的非公开 API
- 用户愿意配合登录并手动做一遍目标操作
- 需要把分析结果沉淀为可复用的 Agent Skill / Connector
- 当前目标是带 Web 界面的系统，且主要基于浏览器中的网络交互完成动作

本 Skill 不适用于：
- 试图绕过用户授权直接获取第三方账户数据
- 需要在没有任何浏览器上下文或用户配合的情况下恢复完整会话
- 明显依赖强设备证明、强风控、验证码对抗的场景
- 纯 Native App、桌面原生客户端、移动端原生协议场景
- 存在明显 Web 反自动化机制且关键动作依赖该机制的系统，例如需要动态 transaction id、动态签名、设备证明、行为挑战的站点

## 核心主线

下面这套流程是当前默认主线，优先围绕：

- `Playwright + Playwright MCP Bridge`

展开。

### 开始前的准备工作

在进入分析阶段之前，必须先把 `Playwright MCP` 和 `Playwright MCP Bridge` 扩展准备好，并确认扩展连接成功。

至少要满足这三个前提：

1. 已安装 `Playwright MCP`
2. 已安装 `Playwright MCP Bridge` 浏览器扩展
3. 当前扩展已经成功连接，可真正接管浏览器 tab

如果这一步没完成，后面的“接管真实页面、自动化操作、读取网络请求、分析页面代码”都无法稳定进行。

#### 1. 安装 `Playwright MCP`

确保本地已经有可用的 `Playwright MCP` 服务端，并能被当前 Agent 正常调用。

#### 2. 安装 `Playwright MCP Bridge` 扩展

在你实际使用的浏览器里安装 `Playwright MCP Bridge` 扩展。

只有安装了这个扩展，Agent 才能去接管你当前真实浏览器里的 tab，而不是只会新起一个隔离浏览器。

#### 3. 确认扩展连接成功

安装完成后，不要直接默认它已经可用，必须再确认一次：

- 当前 `Playwright MCP` 侧已经启动
- 扩展已经成功连上本地 relay / MCP 会话
- 扩展侧能看到当前活跃的 MCP client
- 真实浏览器 tab 已经允许被接管，或已处于可接管状态

如果扩展没有连接成功，常见现象包括：

- 扩展提示没有可用的 MCP client
- Agent 侧浏览器工具直接报错
- 页面虽然开着，但无法真正读取、点击、抓请求

结论：

- 在这份 Skill 里，“安装好 Playwright MCP + Bridge 扩展，并确认连接成功”属于正式准备步骤，不是可省略细节

## 录制与沉淀

### 1. 明确单一动作

先让用户明确这次要分析的动作，例如：

- “发一个帖子”
- “下载账单”
- “发送一条消息”
- “创建一个任务”

如果用户描述过大，先收缩成单一动作。

### 2. 接管用户当前真实页面

默认不要先新起一个隔离浏览器去重走流程，而是优先：

- 使用 `Playwright MCP Bridge` 接管用户当前已经打开、已经登录的真实页面

这样做的目的有两个：

1. 直接复用真实浏览器里的登录态
2. 在操作页面时顺手读取网络请求和页面代码

### 3. 引导用户完成一次真实操作录制

这一步必须主动提示用户配合。

应明确告诉用户去做：

- 登录目标网站
- 完成目标操作
- 操作完成后回复“好了”

推荐提示格式：

- “请在当前已接管的浏览器页面中完成一次 `<目标动作>`，做完后回复‘好了’。”

补充要求：

- 如果用户做的是有副作用的动作，例如“发帖”或“删帖”，要明确这是一次真实线上操作
- 如果动作会产生产出物，后续要考虑是否需要清理测试数据

### 4. 同时获取两类分析材料

在 `Playwright MCP Bridge` 主线下，优先同时拿两类材料：

1. 前后端交互数据
- 网络请求
- 请求头 / 响应头
- request / response 内容

2. 页面代码与运行时信息
- HTML
- 脚本资源和 chunk
- `fetch / axios / graphql / operationName / baseURL / /api/`
- 全局对象
- 初始化状态
- hydration 数据

也就是说，这条主线不是只做页面点击，而是：

- 一边自动化页面
- 一边抓网络
- 一边看前端代码

### 5. 分析并识别主接口

先做规则化筛选，再考虑调用模型。

优先分析：

- 非 `GET` 请求
- API 域名
- 目标动作发生前后时间窗口内的请求
- 响应为 JSON 的请求

从中识别：

- 主动作接口
- 依赖接口
- 轮询/埋点/噪声请求

#### 5.1 判定“主接口”的方法

不要只因为某个 URL 名字“看起来像”目标动作，就直接把它认定为主接口。

必须按下面顺序判断：

1. 先缩小候选集
- 只看目标动作发生时间窗口内的业务请求
- 优先看 API 域名、JSON 响应、带鉴权头的请求
- 静态资源、埋点、轮询、banner、配置接口先排除

2. 再区分“主接口”和“辅助接口”
- 主接口：响应中直接包含用户真正想拿到的结果
- 辅助接口：只提供统计拆分、页面附加信息、前端装饰数据

3. 以“响应内容”而不是“URL 名字”做最终判定
- 如果用户要的是“账户余额”，主接口应直接返回余额字段
- 如果某接口只返回 usage、cost、count、分页列表、图表数据，它更可能是辅助接口

4. 必要时做一次最小真实重放
- 使用抓到的私有请求头和参数，直接重放候选接口
- 比较哪个响应真正包含目标结果
- 用真实结果确认主接口，而不是靠猜测

### 6. 拆分动态字段与私有凭证

把接口里的动态值归类到下列来源：

1. `cookie`
2. `header token`
3. `localStorage / sessionStorage`
4. `runtime-generated value`
5. `upstream dependency API`
6. `user input`

输出时必须分别标注。

### 7. 生成沉淀产物

必须生成两类产物：

#### A. 私有材料

统一写入：

- `connector.credentials.json`

里面保存：

- cookie
- token
- csrf
- session
- 动态 header 实值
- 其他仅本地可用的私有会话材料

#### B. 可分享执行型 Skill

统一写入：

- `skills/connector-<site>-<action>/SKILL.md`

里面至少要写清：

- 主接口
- 辅助接口
- 动态字段来源
- 最小 `curl` 模板
- 成功判定
- 结果映射

要求：

- Skill 里不能出现真实 cookie、token、session 值
- 只能使用占位符

### 8. 做一次最小真实测试

分析完成后，不要直接宣布可用。

必须先做一次最小真实动作测试，例如：

- 发送一条测试消息
- 发一条测试帖子
- 创建一条测试记录
- 拉一份测试数据

测试前要明确告诉用户：

- 将执行什么动作
- 是否会产生真实线上数据
- 是否需要后续清理

如果测试失败：

- 不要安装
- 必须明确说明失败原因：
  - 鉴权缺失
  - 动态 token 未补齐
  - 依赖接口缺失
  - 页面上下文要求未满足
  - 目标动作有额外风控

## 后续调用

当前面已经沉淀出：

- `connector.credentials.json`
- `skills/connector-<site>-<action>/SKILL.md`

后续调用阶段的目标就是：

- 不再重新分析
- 直接复用已经沉淀好的能力

### 1. 读取 skill 与本地凭证

后续调用时，优先：

1. 读取 `skills/connector-<site>-<action>/SKILL.md`
2. 读取本地 `connector.credentials.json`

### 2. 判断执行模式

对每个 connector，必须给出执行模式判断：

1. `direct_http`
- 只需本地私有凭据即可执行

2. `browser_context`
- 必须在浏览器页面上下文内取动态值

3. `hybrid`
- 浏览器里取动态值，本地再发请求

4. `unsupported`
- 当前无法稳定自动化

### 3. 直接调用，必要时回到浏览器补值

后续调用的默认策略：

- 能直接 HTTP 调用，就不要重新做整套分析
- 如果某些动态值失效，再回到 `Playwright MCP Bridge` 页面上下文里补齐

## Credentials 更新

这是这份 Skill 里必须单独维护的一节，不能只在“调用失败”时顺手提一句。

原因是：

1. 很多 connector 的真实执行能力，本质上依赖本地 `connector.credentials.json`
2. 里面保存的 cookie、authorization、csrf、session、动态 header 都是有时效性的
3. 如果不定义更新流程，skill 第一次能用，后面很容易因为凭证过期而失效

### 1. 什么情况下要更新

出现以下任一信号，就应该优先怀疑本地凭证已经过期：

- 接口返回“未登录”“未授权”“token expired”“session invalid”
- 原来可用的 `curl` 模板突然全部返回 `401`、`403` 或登录页
- 同一个 skill 之前可用，现在在没有改接口的情况下失效
- 页面里仍然能正常操作，但本地 direct HTTP 调用失败

### 2. 更新的默认方法

默认不要手工猜测 token 来源，也不要让用户自己去 DevTools 里一个个复制。

优先使用：

- `Playwright + Playwright MCP Bridge`

让 Agent 重新接管用户当前真实浏览器页面，然后在真实登录态下重新获取：

- cookie
- authorization / access token
- csrf token
- 动态 header
- 其他 runtime 值

### 3. 推荐更新步骤

1. 让用户先在真实浏览器里重新登录目标站点
2. 使用 `Playwright MCP Bridge` 接管当前已登录 tab
3. 重新执行一次最小必要动作
4. 同时重新读取网络请求和页面运行时里的最新私有值
5. 只更新对应 connector 所需的字段，不要误覆盖其它 connector
6. 写回本地 `connector.credentials.json`
7. 立即用最小真实请求再验证一次

### 4. 更新时的输出要求

更新 `credentials` 时，不要只说“已重新登录”。

必须明确写清：

- 哪个 connector 的凭证已更新
- 更新了哪些字段
- 这些字段来自哪里
- 更新后是否已做最小验证

### 5. 对 Agent 的要求

当发现 token 失效时，Agent 的默认动作应该是：

1. 先识别这是凭证过期，不要立刻误判为接口逻辑变了
2. 回到 `Playwright MCP Bridge` 主线，重新从真实页面获取最新凭证
3. 更新本地 `connector.credentials.json`
4. 再执行一次最小真实验证
5. 只有在重新获取凭证后仍失败，才继续怀疑接口结构、动态参数或风控机制发生变化

## 核心原则

### 零、当前能力边界

当前这份 Skill 只适合：
- 为 Web 界面的系统做自动 API 分析
- 基于浏览器中的真实交互数据生成可复用 Skill

当前不应承诺支持：
- Native App
- 桌面原生客户端
- 强依赖设备安全能力的系统

此外，如果目标 Web 系统存在明显防自动化机制，则本 Skill 可能失效或只能部分生效。

典型场景包括：
- 动态 transaction id
- request signature
- anti-bot token
- challenge / 风控校验
- 页面上下文强绑定

例如：
- 类似 `X / Twitter` 这类存在动态事务/签名机制的站点，就可能导致“分析出接口但无法稳定自动执行”

### 一、输出必须拆成两层

永远不要把分析结果混成一份文件。

必须拆成：

1. `private credentials file`
- 仅本地使用
- 不分享
- 默认应被 `.gitignore`

2. `shareable connector SKILL.md`
- 可分享
- 必须脱敏
- 所有敏感值改为占位符

默认不要为每个动作再拆出多份分析文件、测试文件、执行脚本。

优先维护两份长期文件：

1. `connector.credentials.json`
- 存所有站点/动作的私有会话材料
- 后续新分析结果直接按 `connector_id` 追加

2. `connector-<site>-<action>/SKILL.md`
- 存单个站点/动作的可分享执行型 Skill
- 里面同时包含：
  - 怎么用
  - 主接口
  - 辅助接口
  - 动态字段来源
  - `curl` 模板
  - 成功判定
  - 结果映射

硬性约束：

- 不要在单个 skill 目录下新增独立的 `credential.json`、`credentials.json` 或其他私有凭证文件
- 私有材料只能统一写入项目根目录的 `connector.credentials.json`
- `skills/connector-<site>-<action>/` 目录下默认只放 `SKILL.md`

### 二、优先基于真实流量，不只靠代码猜

分析顺序优先为：
1. 真实浏览器录制
2. CDP 导出的 request / response / network event 分析
3. 页面上下文值来源分析
4. 前端代码静态分析补充

不要反过来。

### 三、动作级抽象，不是接口列表堆积

目标不是导出“所有请求”，而是识别：
- 哪个请求才是真正执行动作的主接口
- 哪些请求是它的前置依赖
- 哪些字段是动态字段
- 哪些字段来自私有会话材料

## 什么时候调用大模型

只有在这些阶段值得调用模型：
- 从大量请求中识别“哪个请求才是目标动作”
- 推断依赖链
- 推断动态字段语义
- 生成脱敏后的 connector spec
- 生成执行型 skill 模板

如果主接口已经明显可见，不要为了“看起来更智能”而调用模型。

## 推荐产物结构

```text
artifacts/
  raw/
    cdp-network-log.json
    cookies.json
    local-storage.json
  derived/
    connector.credentials.json
  skills/
    connector-<site>-<action>/
      SKILL.md
```

## 分析报告要求

分析结论至少包含：
- 目标动作名称
- 主接口
- 前置依赖接口
- 动态字段列表
- 私有材料清单
- 可分享接口清单
- 是否可直接 HTTP 重放
- 若不可直接重放，所需执行上下文

## 执行策略分层

对每个 connector，必须给出执行模式判断：

1. `direct_http`
- 只需本地私有凭据即可执行

2. `browser_context`
- 必须在浏览器页面上下文内取动态值

3. `hybrid`
- 浏览器里取动态值，本地再发请求

4. `unsupported`
- 当前无法稳定自动化

## 分享规则

允许分享：
- `connector-<site>-<action>/SKILL.md`
- 脱敏后的 Skill

不允许分享：
- cookie
- token
- session id
- refresh token
- 动态 header 实值
- 可直接复用的完整请求样本

## 安装规则

当且仅当执行型 Connector 经过一次真实自动化测试且测试成功，才允许安装到用户本地 Agent Skill 目录。

安装时应遵守：
- Skill 名应明确绑定站点和动作，例如：
  - `connector-jike-post-create`
  - `connector-twitter-send-post`
- Skill 中不能包含真实 cookie、token、session 值
- 私有材料只能继续保存在本地 `connector.credentials.json` 中，由 Skill 运行时读取
- 如果用户本地已有同名 Skill，应先比较差异，再决定覆盖或生成新版本

## 对 Codex 的行为要求

1. 录制前先说明接下来需要用户做什么。
2. 录制过程中，明确等待用户完成登录和操作。
3. 不把敏感值直接输出到最终可分享文件。
4. 如果已经能用规则分析完成，不要强制调用模型。
5. 如果生成执行型 Skill，默认假设私有材料只存本地，不上传。
6. 分析完成后，应主动提出执行一次最小自动化测试，而不是直接宣布完成。
7. 只有测试通过后，才允许把执行型 Skill 安装到用户本地 Agent Skill 目录。
8. 如果测试失败，应明确阻止安装，并输出失败原因与下一步补齐建议。
9. 若目标不是 Web 界面系统，应明确提示这超出当前 Skill 的适用范围。
10. 若识别到明显反自动化机制，应明确提示“可能无法稳定自动执行”，不要把分析结果包装成已可用 Skill。

## 参考资料：其他方法

下面这些方法仍然有用，但默认放在参考资料里，不作为当前主线。

### 参考方法 A：使用 Playwright 新启动一个浏览器页面并操作

做法：

- 由 Playwright 直接启动浏览器
- 打开目标网站
- 在新页面里点击、输入、提交

优点：

- 上手直接
- 最容易开始自动化
- 对简单站点、未登录页面、纯公开页面很方便

缺点：

- 新启动的浏览器页面默认没有你当前真实浏览器里的登录状态
- 很多真实场景会直接卡在登录、验证码、二次校验、SSO
- 即使技术上能补登录流程，维护成本也经常很高

### 参考方法 B：手动导出 HAR

具体做法：

1. 打开目标网页，并先完成登录
2. 打开浏览器开发者工具，进入 `Network`
3. 勾选 `Preserve log`
4. 如果列表里已经有很多旧请求，先点一下清空
5. 再执行目标动作
6. 在 `Network` 列表中右键
7. 选择 `Save all as HAR with content`
8. 保存 `.har` 文件并交给 AI 分析

### 参考方法 C：手动导出 `chrome://net-export/`

具体做法：

1. 在地址栏打开 `chrome://net-export/`
2. 点击 `Start Logging to Disk`
3. 保持该页面不要关闭
4. 再去完成登录和目标动作
5. 回到 `chrome://net-export/`
6. 点击 `Stop Logging`
7. 把导出的 `.json` 文件交给 AI 分析

### 参考方法 D：使用 CDP 协议新起浏览器并录制

做法：

- 启动带 `remote-debugging-port` 的 Chrome
- 用脚本实时订阅 `Network.*` 事件
- 记录 request / response / headers / body
- 再交给 AI 分析

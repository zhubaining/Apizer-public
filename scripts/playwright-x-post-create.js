#!/usr/bin/env node

/**
 * connector id: x-post-create
 *
 * 作用:
 * - 通过 Playwright MCP + Playwright MCP Bridge 在真实已登录的 X 页面发一条纯文本帖子
 * - 既可作为可复用页面动作模块被外部调用，也可直接在命令行执行
 *
 * 主接口:
 * - 页面操作: https://x.com/home
 *
 * 所需 credentials 字段:
 * - 无
 *
 * 默认运行时配置:
 * - runtime.page_match
 * - runtime.base_url
 * - runtime.timeout_ms
 * - runtime.selectors.composer
 * - runtime.selectors.submit_button
 * - runtime.selectors.toast
 * - runtime.selectors.status_link
 *
 * 输入参数:
 * - tweet_text
 *
 * 成功判定:
 * - 页面出现“你的帖子已发送”提示，或
 * - 捕获到 CreateTweet 200 响应，或
 * - 页面上能找到刚刚发布的文本并解析出帖子链接
 *
 * 运行前提:
 * - 浏览器已安装并连通 Playwright MCP Bridge
 * - 本机可启动 playwright-mcp 服务端
 * - 目标浏览器当前登录了 X
 *
 * 命令行用法:
 * - 安装依赖: npm install
 * - 查看帮助: node scripts/playwright-x-post-create.js help
 * - 查看 spec: node scripts/playwright-x-post-create.js spec
 * - 仅校验参数: node scripts/playwright-x-post-create.js validate "测试文案"
 * - 直接发帖: node scripts/playwright-x-post-create.js create "你的帖子内容"
 *
 * 注意:
 * - 会产生真实线上副作用
 * - 默认通过 MCP server 的 browser_run_code 在已接管页面上执行动作
 * - 若 X 风控升级，页面可操作但脚本仍可能失败
 */

"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");

const { requireArg } = require("./_shared");

const DEFAULT_RUNTIME = {
  page_match: "x.com",
  base_url: "https://x.com/home",
  timeout_ms: 20000,
  selectors: {
    composer: '[data-testid="tweetTextarea_0"]',
    submit_button: '[data-testid="tweetButtonInline"]',
    toast: '[role="alert"]',
    status_link: 'a[href*="/status/"]',
  },
};

function loadRuntime(overrides = {}) {
  return {
    ...DEFAULT_RUNTIME,
    ...overrides,
    selectors: {
      ...DEFAULT_RUNTIME.selectors,
      ...(overrides.selectors || {}),
    },
  };
}

function selectors(runtime) {
  const configured = runtime.selectors || {};
  return {
    composer: configured.composer || '[data-testid="tweetTextarea_0"]',
    submitButton: configured.submit_button || '[data-testid="tweetButtonInline"]',
    toast: configured.toast || '[role="alert"]',
    statusLink: configured.status_link || 'a[href*="/status/"]',
  };
}

async function ensureTargetPage(page, runtime) {
  const match = runtime.page_match || "x.com";
  const targetUrl = runtime.base_url || "https://x.com/home";
  const currentUrl = page.url() || "";

  if (!currentUrl || currentUrl === "about:blank" || !currentUrl.includes(match)) {
    await page.goto(targetUrl, { waitUntil: "domcontentloaded" });
  }
}

async function waitForComposer(page, runtime) {
  const timeoutMs = Number(runtime.timeout_ms || 20000);
  const composer = page.locator(selectors(runtime).composer);
  await composer.waitFor({ state: "visible", timeout: timeoutMs });
  return composer;
}

async function createPostOnPage(page, tweetText, runtimeOverrides = {}) {
  const runtime = loadRuntime(runtimeOverrides);
  const timeoutMs = Number(runtime.timeout_ms || 20000);
  const ui = selectors(runtime);

  await ensureTargetPage(page, runtime);
  await page.bringToFront();
  const composer = await waitForComposer(page, runtime);

  const createTweetResponsePromise = page
    .waitForResponse(
      async (response) => {
        return response.url().includes("/CreateTweet") && response.request().method() === "POST";
      },
      { timeout: timeoutMs }
    )
    .catch(() => null);

  await composer.fill(tweetText);
  await page.locator(ui.submitButton).first().click({ timeout: timeoutMs });

  const toast = page.locator(ui.toast);
  await toast
    .filter({ hasText: "你的帖子已发送" })
    .first()
    .waitFor({ state: "visible", timeout: timeoutMs })
    .catch(() => {});

  const createTweetResponse = await createTweetResponsePromise;
  let responseJson = null;
  if (createTweetResponse) {
    try {
      responseJson = await createTweetResponse.json();
    } catch (_) {}
  }

  const restId =
    responseJson?.data?.create_tweet?.tweet_results?.result?.rest_id ||
    responseJson?.data?.create_tweet?.tweet_results?.result?.tweet?.rest_id ||
    null;

  const foundOnPage = await page.evaluate(
    ({ text, statusLinkSelector }) => {
      const articles = Array.from(document.querySelectorAll("article"));
      const hit = articles.find((article) => article.innerText.includes(text));
      if (!hit) return null;
      const statusLink = hit.querySelector(statusLinkSelector);
      return {
        href: statusLink ? statusLink.href : null,
        text: hit.innerText,
      };
    },
    { text: tweetText, statusLinkSelector: ui.statusLink }
  );

  const toastTexts = await toast.allTextContents().catch(() => []);

  if (!restId && !foundOnPage?.href && !toastTexts.some((item) => item.includes("你的帖子已发送"))) {
    throw new Error("CreateTweet did not yield a post link or success toast");
  }

  return {
    posted: true,
    rest_id: restId,
    post_url: foundOnPage?.href || (restId ? `https://x.com/i/web/status/${restId}` : null),
    toast: toastTexts,
  };
}

function buildConnectorSpec() {
  const runtime = loadRuntime();
  const ui = selectors(runtime);
  return {
    connector_id: "x-post-create",
    requires_credentials: false,
    runtime: "playwright-mcp-bridge",
    cli_entry: 'node scripts/playwright-x-post-create.js create "你的帖子内容"',
    page_match: runtime.page_match || "x.com",
    base_url: runtime.base_url || "https://x.com/home",
    timeout_ms: Number(runtime.timeout_ms || 20000),
    selectors: {
      composer: ui.composer,
      submit_button: ui.submitButton,
      toast: ui.toast,
      status_link: ui.statusLink,
    },
  };
}

function readCodexPlaywrightConfig() {
  const configPath = path.join(os.homedir(), ".codex", "config.toml");
  if (!fs.existsSync(configPath)) return {};
  const raw = fs.readFileSync(configPath, "utf8");
  const tokenMatch = raw.match(/PLAYWRIGHT_MCP_EXTENSION_TOKEN\s*=\s*"([^"]+)"/);
  const outputDirMatch = raw.match(/PLAYWRIGHT_MCP_OUTPUT_DIR\s*=\s*"([^"]+)"/);
  return {
    extensionToken: tokenMatch ? tokenMatch[1] : undefined,
    outputDir: outputDirMatch ? outputDirMatch[1] : undefined,
  };
}

function normalizeEnv() {
  return Object.keys(process.env).reduce((acc, key) => {
    const value = process.env[key];
    if (typeof value === "string") acc[key] = value;
    return acc;
  }, {});
}

function buildMcpEnv() {
  const env = normalizeEnv();
  const config = readCodexPlaywrightConfig();

  if (!env.PLAYWRIGHT_MCP_OUTPUT_DIR) {
    env.PLAYWRIGHT_MCP_OUTPUT_DIR = config.outputDir || path.join(os.homedir(), ".playwright-mcp");
  }
  if (!env.PLAYWRIGHT_MCP_EXTENSION_TOKEN && config.extensionToken) {
    env.PLAYWRIGHT_MCP_EXTENSION_TOKEN = config.extensionToken;
  }
  if (!env.HOME) {
    env.HOME = os.homedir();
  }
  return env;
}

function resolvePlaywrightMcpCommand() {
  const explicitCommand = process.env.PLAYWRIGHT_MCP_COMMAND;
  const explicitArgs = process.env.PLAYWRIGHT_MCP_ARGS
    ? process.env.PLAYWRIGHT_MCP_ARGS.split(/\s+/).filter(Boolean)
    : [];
  if (explicitCommand) {
    return { command: explicitCommand, args: explicitArgs };
  }

  const repoBin = path.resolve(__dirname, "..", "node_modules", ".bin", "playwright-mcp");
  if (fs.existsSync(repoBin)) {
    return { command: repoBin, args: ["--extension"] };
  }

  const codexWrapper = path.join(os.homedir(), ".codex", "bin", "playwright-mcp-safe.sh");
  if (fs.existsSync(codexWrapper)) {
    return { command: codexWrapper, args: ["--extension"] };
  }

  return { command: "npx", args: ["@playwright/mcp@latest", "--extension"] };
}

function requireMcpSdk(specifier) {
  const candidatePaths = [
    path.resolve(__dirname, ".."),
    process.cwd(),
    "/opt/homebrew/lib/node_modules/openclaw/node_modules",
  ];

  for (const candidate of candidatePaths) {
    try {
      const resolved = require.resolve(specifier, { paths: [candidate] });
      return require(resolved);
    } catch (_) {}
  }

  return require(specifier);
}

function getMcpSdk() {
  try {
    const { Client } = requireMcpSdk("@modelcontextprotocol/sdk/client/index.js");
    const { StdioClientTransport } = requireMcpSdk("@modelcontextprotocol/sdk/client/stdio.js");
    return { Client, StdioClientTransport };
  } catch (error) {
    throw new Error(
      [
        "Missing dependency: @modelcontextprotocol/sdk",
        "请先在仓库根目录执行: npm install @modelcontextprotocol/sdk",
        `原始错误: ${error.message}`,
      ].join("\n")
    );
  }
}

async function connectPlaywrightMcpClient() {
  const { Client, StdioClientTransport } = getMcpSdk();
  const { command, args } = resolvePlaywrightMcpCommand();
  const env = buildMcpEnv();
  const client = new Client(
    { name: "apizer-x-post-create", version: "1.0.0" },
    { capabilities: {} }
  );
  const transport = new StdioClientTransport({ command, args, env });
  await client.connect(transport);
  return { client, transport, command, args };
}

function extractTextContent(response) {
  return (response?.content || [])
    .filter((item) => item.type === "text")
    .map((item) => item.text)
    .join("\n");
}

function extractResultSection(markdown) {
  const match = markdown.match(/^### Result\s*\n([\s\S]*?)(?=^### |\Z)/m);
  return match ? match[1].trim() : "";
}

function normalizeMcpJsonResult(value) {
  if (typeof value === "string") {
    try {
      return normalizeMcpJsonResult(JSON.parse(value));
    } catch (_) {
      return value;
    }
  }
  return value;
}

async function callTool(client, name, args = {}) {
  const response = await client.callTool({ name, arguments: args });
  if (response?.isError) {
    throw new Error(extractTextContent(response) || `Tool failed: ${name}`);
  }
  return response;
}

function buildBrowserRunCode(tweetText, runtimeOverrides = {}) {
  const runtime = loadRuntime(runtimeOverrides);
  const tweetLiteral = JSON.stringify(tweetText);
  const runtimeLiteral = JSON.stringify(runtime);

  return `async (page) => {
  const runtime = ${runtimeLiteral};
  const timeoutMs = Number(runtime.timeout_ms || 20000);
  const ui = {
    composer: runtime.selectors?.composer || '[data-testid="tweetTextarea_0"]',
    submitButton: runtime.selectors?.submit_button || '[data-testid="tweetButtonInline"]',
    toast: runtime.selectors?.toast || '[role="alert"]',
    statusLink: runtime.selectors?.status_link || 'a[href*="/status/"]',
  };
  const match = runtime.page_match || "x.com";
  const targetUrl = runtime.base_url || "https://x.com/home";
  const currentUrl = page.url() || "";
  if (!currentUrl || currentUrl === "about:blank" || !currentUrl.includes(match)) {
    await page.goto(targetUrl, { waitUntil: "domcontentloaded" });
  }

  await page.bringToFront();
  const composer = page.locator(ui.composer);
  await composer.waitFor({ state: "visible", timeout: timeoutMs });

  const createTweetResponsePromise = page
    .waitForResponse(
      (response) => response.url().includes("/CreateTweet") && response.request().method() === "POST",
      { timeout: timeoutMs }
    )
    .catch(() => null);

  await composer.fill(${tweetLiteral});
  await page.locator(ui.submitButton).first().click({ timeout: timeoutMs });

  const toast = page.locator(ui.toast);
  await toast
    .filter({ hasText: "你的帖子已发送" })
    .first()
    .waitFor({ state: "visible", timeout: timeoutMs })
    .catch(() => {});

  const createTweetResponse = await createTweetResponsePromise;
  let responseJson = null;
  if (createTweetResponse) {
    try {
      responseJson = await createTweetResponse.json();
    } catch (_) {}
  }

  const restId =
    responseJson?.data?.create_tweet?.tweet_results?.result?.rest_id ||
    responseJson?.data?.create_tweet?.tweet_results?.result?.tweet?.rest_id ||
    null;

  const foundOnPage = await page.evaluate(({ text, statusLinkSelector }) => {
    const articles = Array.from(document.querySelectorAll("article"));
    const hit = articles.find((article) => article.innerText.includes(text));
    if (!hit) return null;
    const statusLink = hit.querySelector(statusLinkSelector);
    return {
      href: statusLink ? statusLink.href : null,
      text: hit.innerText,
    };
  }, { text: ${tweetLiteral}, statusLinkSelector: ui.statusLink });

  const toastTexts = await toast.allTextContents().catch(() => []);
  if (!restId && !foundOnPage?.href && !toastTexts.some((item) => item.includes("你的帖子已发送"))) {
    throw new Error("CreateTweet did not yield a post link or success toast");
  }

  return JSON.stringify({
    posted: true,
    rest_id: restId,
    post_url: foundOnPage?.href || (restId ? \`https://x.com/i/web/status/\${restId}\` : null),
    toast: toastTexts,
  });
}`;
}

async function createPostViaMcp(tweetText, runtimeOverrides = {}) {
  const runtime = loadRuntime(runtimeOverrides);
  const { client, transport, command, args } = await connectPlaywrightMcpClient();
  try {
    await callTool(client, "browser_navigate", {
      url: runtime.base_url || "https://x.com/home",
    });
    const response = await callTool(client, "browser_run_code", {
      code: buildBrowserRunCode(tweetText, runtime),
    });
    const markdown = extractTextContent(response);
    const resultText = extractResultSection(markdown);
    const result = resultText ? normalizeMcpJsonResult(JSON.parse(resultText)) : null;
    if (!result) {
      throw new Error(`Failed to parse MCP result.\n${markdown}`);
    }
    return {
      ...result,
      mcp_command: command,
      mcp_args: args,
    };
  } finally {
    try {
      await client.close?.();
    } catch (_) {}
    try {
      await transport.close?.();
    } catch (_) {}
  }
}

async function main() {
  const action = process.argv[2] || "help";
  if (action === "spec") {
    console.log(JSON.stringify(buildConnectorSpec(), null, 2));
    return;
  }
  if (action === "help") {
    console.error(
      [
        "用法:",
        '  node scripts/playwright-x-post-create.js help',
        '  node scripts/playwright-x-post-create.js spec',
        '  node scripts/playwright-x-post-create.js validate "测试文案"',
        '  node scripts/playwright-x-post-create.js create "你的帖子内容"',
        "前提: 浏览器已安装并连通 Playwright MCP Bridge，且当前登录了 X。",
        "脚本会先把当前受控页面导航到 x.com/home，再执行发帖动作。",
        "如缺少 SDK 依赖，请先执行: npm install @modelcontextprotocol/sdk",
      ].join("\n")
    );
    process.exit(1);
  }
  if (action === "validate") {
    const tweetText = requireArg(process.argv[3], "tweet_text");
    const { command, args } = resolvePlaywrightMcpCommand();
    console.log(
      JSON.stringify(
        {
          action: "validate",
          ok: true,
          tweet_text_length: tweetText.length,
          mcp_command: command,
          mcp_args: args,
          spec: buildConnectorSpec(),
        },
        null,
        2
      )
    );
    return;
  }
  if (action === "create") {
    const tweetText = requireArg(process.argv[3], "tweet_text");
    const result = await createPostViaMcp(tweetText);
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  console.error(`Unsupported action: ${action}. Use one of: create, spec, validate, help`);
  process.exit(1);
}

module.exports = {
  DEFAULT_RUNTIME,
  buildBrowserRunCode,
  buildConnectorSpec,
  connectPlaywrightMcpClient,
  createPostOnPage,
  createPostViaMcp,
  loadRuntime,
};

if (require.main === module) {
  main().catch((error) => {
    console.error(error.stack || String(error));
    process.exit(1);
  });
}

#!/usr/bin/env node

/**
 * connector id: x-post-create
 *
 * 作用:
 * - 基于 Playwright MCP + Playwright MCP Bridge 已接管的真实 X 页面发一条纯文本帖子
 * - 作为 Agent / runtime 可复用的页面动作脚本，不自行启动浏览器
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
 * - Agent 已通过 Playwright MCP Bridge 接管真实浏览器页面
 * - 传入的 `page` 已经是可操作的真实 X 页面
 * - 目标页面已登录 X
 *
 * 注意:
 * - 会产生真实线上副作用
 * - 这是 MCP + Bridge 路线下的 connector，不是本地独立浏览器启动脚本
 * - 若 X 风控升级，页面可操作但脚本仍可能失败
 */

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

  const foundOnPage = await page.evaluate(({ text, statusLinkSelector }) => {
    const articles = Array.from(document.querySelectorAll("article"));
    const hit = articles.find((article) => article.innerText.includes(text));
    if (!hit) return null;
    const statusLink = hit.querySelector(statusLinkSelector);
    return {
      href: statusLink ? statusLink.href : null,
      text: hit.innerText,
    };
  }, { text: tweetText, statusLinkSelector: ui.statusLink });

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

async function main() {
  const action = process.argv[2] || "help";
  if (action === "spec") {
    console.log(JSON.stringify(buildConnectorSpec(), null, 2));
    return;
  }
  if (action === "help") {
    console.error(
      [
        "这个 connector 设计给已经通过 Playwright MCP Bridge 接管真实页面的 Agent/runtime 使用。",
        "它不依赖 credentials.json 里的 token 或 selector 配置。",
        '直接在 CLI 里运行时，仅支持输出 "spec" 或做最小 "validate" 校验。',
        '导入示例: const { createPostOnPage } = require("./scripts/playwright-x-post-create");',
      ].join("\n")
    );
    process.exit(1);
  }
  if (action === "validate") {
    requireArg(process.argv[3], "tweet_text");
    console.log(JSON.stringify({ action: "validate", ok: true, spec: buildConnectorSpec() }, null, 2));
    return;
  }
  console.error(`Unsupported action: ${action}. Use one of: spec, validate, help`);
  process.exit(1);
}

module.exports = {
  DEFAULT_RUNTIME,
  buildConnectorSpec,
  createPostOnPage,
  loadRuntime,
};

if (require.main === module) {
  main().catch((error) => {
    console.error(error.stack || String(error));
    process.exit(1);
  });
}

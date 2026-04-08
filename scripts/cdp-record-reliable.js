#!/usr/bin/env node

/**
 * 通过 Chrome DevTools Protocol 连接一个已开启 remote debugging 的浏览器页面，
 * 持续录制该页面的网络请求与响应，并把结果稳定落盘到 JSONL 文件。
 *
 * 这个脚本的用途是给 Apizer 提供“更可靠的 CDP 录制能力”，用于后续接口分析：
 * 1. 先从 `http://127.0.0.1:9222/json/list` 发现目标 page
 * 2. 连接该 page 的 `webSocketDebuggerUrl`
 * 3. 订阅 `Network.*` 事件，记录请求、响应、额外请求头、加载完成/失败等信息
 * 4. 在请求完成后，尽量补抓 response body
 * 5. 把原始事件流和整理后的 request/response 结果分别写入文件
 *
 * 典型使用场景：
 * - 用户已经在专门的 CDP Chrome 里登录完成
 * - 想录制某个页面上的真实接口调用，后续交给 Analyzer 或 Connector 生成流程
 * - 想比 HAR 导出更稳定、可程序化地拿到网络材料
 *
 * 输入：
 * - argv[2]: 目标页面标识，可传页面 id / URL 片段 / title 片段；不传则默认取第一个 http 页面
 * - argv[3]: 输出目录，默认 `./raw`
 * - `--reload`: 连接成功后自动刷新页面再开始录制
 * - `--no-bodies`: 不抓 response body，只记录请求/响应元信息
 *
 * 输出：
 * - `cdp-network-events.jsonl`: 原始 `Network.*` 事件流
 * - `cdp-network-requests.jsonl`: 按 requestId 聚合后的请求/响应记录
 * - `cdp-recording-meta.json`: 本次录制的目标页面、退出原因、输出文件信息
 */

const fs = require("fs");
const http = require("http");
const path = require("path");

const CDP_LIST = process.env.CDP_LIST_URL || "http://127.0.0.1:9222/json/list";
const TARGET = process.argv[2] || "";
const OUT_DIR = process.argv[3] || "./raw";
const RELOAD_ON_START = process.argv.includes("--reload");
const INCLUDE_BODIES = !process.argv.includes("--no-bodies");
const TARGET_WAIT_MS = Number(process.env.CDP_TARGET_WAIT_MS || 15000);
const TARGET_POLL_MS = Number(process.env.CDP_TARGET_POLL_MS || 500);

function httpGetJson(url) {
  return new Promise((resolve, reject) => {
    http
      .get(url, (res) => {
        let data = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => {
          data += chunk;
        });
        res.on("end", () => {
          try {
            resolve(JSON.parse(data));
          } catch (err) {
            reject(err);
          }
        });
      })
      .on("error", reject);
  });
}

async function findTargetPageOnce() {
  const pages = await httpGetJson(CDP_LIST);
  const candidates = pages.filter((item) => item.type === "page" && item.webSocketDebuggerUrl);
  if (candidates.length === 0) {
    return null;
  }
  if (!TARGET) {
    const firstHttpPage = candidates.find((item) => (item.url || "").startsWith("http"));
    return firstHttpPage || candidates[0];
  }
  const match = candidates.find((item) => {
    return item.id === TARGET || (item.url && item.url.includes(TARGET)) || (item.title && item.title.includes(TARGET));
  });
  return match || null;
}

async function findTargetPage() {
  const startedAt = Date.now();
  while (Date.now() - startedAt <= TARGET_WAIT_MS) {
    const page = await findTargetPageOnce();
    if (page) {
      return page;
    }
    await new Promise((resolve) => setTimeout(resolve, TARGET_POLL_MS));
  }
  if (TARGET) {
    throw new Error(`No page matched "${TARGET}" via ${CDP_LIST} within ${TARGET_WAIT_MS}ms`);
  }
  throw new Error(`No page target found via ${CDP_LIST} within ${TARGET_WAIT_MS}ms`);
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const page = await findTargetPage();
  const eventLogPath = path.join(OUT_DIR, "cdp-network-events.jsonl");
  const requestLogPath = path.join(OUT_DIR, "cdp-network-requests.jsonl");
  const metaPath = path.join(OUT_DIR, "cdp-recording-meta.json");
  const eventStream = fs.createWriteStream(eventLogPath, { flags: "w" });
  const requestStream = fs.createWriteStream(requestLogPath, { flags: "w" });
  const ws = new WebSocket(page.webSocketDebuggerUrl);

  let nextId = 1;
  let finalized = false;
  let stopRequested = false;
  const pendingRequests = new Map();
  const bodyRequests = new Map();

  function writeJsonLine(stream, payload) {
    stream.write(`${JSON.stringify(payload)}\n`);
  }

  function send(method, params = {}) {
    const id = nextId++;
    ws.send(JSON.stringify({ id, method, params }));
    return id;
  }

  function flushPending(reason) {
    for (const [requestId, entry] of pendingRequests.entries()) {
      if (!entry.flushed) {
        entry.finalizedBecause = reason;
        writeJsonLine(requestStream, entry);
        entry.flushed = true;
      }
      pendingRequests.delete(requestId);
    }
  }

  function finalize(code, reason) {
    if (finalized) return;
    finalized = true;
    flushPending(reason);
    fs.writeFileSync(
      metaPath,
      JSON.stringify(
        {
          recordedAt: new Date().toISOString(),
          reason,
          target: {
            id: page.id,
            title: page.title,
            url: page.url,
            webSocketDebuggerUrl: page.webSocketDebuggerUrl,
          },
          files: {
            events: eventLogPath,
            requests: requestLogPath,
          },
        },
        null,
        2
      )
    );
    const closeStreams = () => {
      eventStream.end(() => {
        requestStream.end(() => process.exit(code));
      });
    };
    try {
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
        ws.close();
      }
    } catch (_) {
      // ignore
    }
    setTimeout(closeStreams, 50);
  }

  function requestEntry(requestId) {
    if (!pendingRequests.has(requestId)) {
      pendingRequests.set(requestId, { requestId });
    }
    return pendingRequests.get(requestId);
  }

  function maybeStopAfterDrain() {
    if (!stopRequested) return;
    if (bodyRequests.size === 0) {
      finalize(0, "signal");
    }
  }

  ws.addEventListener("open", () => {
    send("Page.enable");
    send("Network.enable", {
      maxTotalBufferSize: 100000000,
      maxResourceBufferSize: 50000000,
    });
    if (RELOAD_ON_START) {
      setTimeout(() => {
        send("Page.reload", { ignoreCache: true });
      }, 300);
    }
    console.log(`Recording target: ${page.url}`);
    console.log(`Event log: ${eventLogPath}`);
    console.log(`Request log: ${requestLogPath}`);
    console.log("Operate in Chrome. Press Ctrl+C here when done.");
  });

  ws.addEventListener("message", (event) => {
    const raw = typeof event.data === "string" ? event.data : event.data.toString();
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch (_) {
      return;
    }

    if (msg.method && msg.method.startsWith("Network.")) {
      writeJsonLine(eventStream, msg);
    }

    if (msg.method === "Network.requestWillBeSent") {
      const requestId = msg.params?.requestId;
      if (!requestId) return;
      const entry = requestEntry(requestId);
      entry.request = {
        url: msg.params?.request?.url,
        method: msg.params?.request?.method,
        headers: msg.params?.request?.headers || {},
        postData: msg.params?.request?.postData,
        timestamp: msg.params?.timestamp,
        type: msg.params?.type || "",
      };
      return;
    }

    if (msg.method === "Network.requestWillBeSentExtraInfo") {
      const requestId = msg.params?.requestId;
      if (!requestId) return;
      const entry = requestEntry(requestId);
      entry.extraRequestHeaders = msg.params?.headers || {};
      return;
    }

    if (msg.method === "Network.responseReceived") {
      const requestId = msg.params?.requestId;
      if (!requestId) return;
      const entry = requestEntry(requestId);
      entry.response = {
        url: msg.params?.response?.url,
        status: msg.params?.response?.status,
        statusText: msg.params?.response?.statusText,
        mimeType: msg.params?.response?.mimeType,
        headers: msg.params?.response?.headers || {},
        remoteIPAddress: msg.params?.response?.remoteIPAddress,
        timestamp: msg.params?.timestamp,
        type: msg.params?.type || "",
      };
      return;
    }

    if (msg.method === "Network.loadingFinished") {
      const requestId = msg.params?.requestId;
      if (!requestId) return;
      const entry = requestEntry(requestId);
      entry.loadingFinished = {
        encodedDataLength: msg.params?.encodedDataLength,
        timestamp: msg.params?.timestamp,
      };
      if (INCLUDE_BODIES) {
        const id = send("Network.getResponseBody", { requestId });
        bodyRequests.set(id, requestId);
      } else {
        writeJsonLine(requestStream, entry);
        pendingRequests.delete(requestId);
        maybeStopAfterDrain();
      }
      return;
    }

    if (msg.method === "Network.loadingFailed") {
      const requestId = msg.params?.requestId;
      if (!requestId) return;
      const entry = requestEntry(requestId);
      entry.loadingFailed = {
        errorText: msg.params?.errorText,
        canceled: msg.params?.canceled,
        timestamp: msg.params?.timestamp,
      };
      writeJsonLine(requestStream, entry);
      pendingRequests.delete(requestId);
      maybeStopAfterDrain();
      return;
    }

    if (Object.prototype.hasOwnProperty.call(msg, "id") && bodyRequests.has(msg.id)) {
      const requestId = bodyRequests.get(msg.id);
      bodyRequests.delete(msg.id);
      const entry = pendingRequests.get(requestId);
      if (entry) {
        if (msg.error) {
          entry.responseBodyError = msg.error;
        } else {
          entry.responseBody = msg.result?.body;
          entry.responseBase64Encoded = Boolean(msg.result?.base64Encoded);
        }
        writeJsonLine(requestStream, entry);
        pendingRequests.delete(requestId);
      }
      maybeStopAfterDrain();
    }
  });

  ws.addEventListener("error", (err) => {
    console.error(err?.message || err);
    finalize(1, "websocket-error");
  });

  ws.addEventListener("close", () => {
    if (!finalized && !stopRequested) {
      finalize(0, "websocket-close");
    }
  });

  const requestStop = () => {
    if (stopRequested) return;
    stopRequested = true;
    setTimeout(() => finalize(0, "signal-timeout"), 1500);
    maybeStopAfterDrain();
  };

  process.on("SIGINT", requestStop);
  process.on("SIGTERM", requestStop);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});

#!/usr/bin/env node
// Before each release, against the stack as it will ship (`docker compose up
// --build`, then this): a real browser through nginx, the built bundle, the
// socket upgrade and drag and drop together, which no unit test reaches.
//
//   SMOKE_EMAIL=… SMOKE_PASSWORD=… node ops/smoke-browser.mjs [http://localhost:3000]
//
// Two isolated browser contexts sign in as that account. It creates a
// throwaway board, drags a card into the next column in one context, requires
// the other to show the move without reloading, then deletes the board. Uses
// the installed Chrome over the DevTools protocol (CHROME=path to override) and
// Node's own fetch and WebSocket, so it adds no dependency.
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const base = (process.argv[2] ?? "http://localhost:3000").replace(/\/+$/, "");
const { SMOKE_EMAIL: email, SMOKE_PASSWORD: password } = process.env;
const chrome = process.env.CHROME ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const port = 9600 + Math.floor(Math.random() * 300);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

if (!email || !password) {
  console.error("Set SMOKE_EMAIL and SMOKE_PASSWORD.");
  process.exit(2);
}

function step(name) {
  console.log(`- ${name}`);
}

async function cdp(url) {
  const ws = new WebSocket(url);
  const pending = new Map();
  const listeners = new Set();
  let id = 0;

  await new Promise((resolve, reject) => {
    ws.addEventListener("open", resolve);
    ws.addEventListener("error", reject);
  });
  ws.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);

    if (message.id !== undefined) pending.get(message.id)?.(message);
    else for (const listener of listeners) listener(message);
  });

  const send = (method, params = {}, sessionId) =>
    new Promise((resolve, reject) => {
      const n = ++id;
      const timer = setTimeout(() => reject(new Error(`${method} timed out`)), 20_000);

      pending.set(n, (message) => {
        clearTimeout(timer);
        pending.delete(n);
        message.error ? reject(new Error(`${method}: ${message.error.message}`)) : resolve(message.result);
      });
      ws.send(JSON.stringify({ id: n, method, params, sessionId }));
    });

  return { send, on: (fn) => listeners.add(fn), close: () => ws.close() };
}

async function openPage(browser, contextId) {
  const { targetId } = await browser.send("Target.createTarget", { url: "about:blank", browserContextId: contextId });
  const { sessionId } = await browser.send("Target.attachToTarget", { targetId, flatten: true });
  const send = (method, params) => browser.send(method, params, sessionId);
  const page = { send, sockets: [], violations: [] };

  browser.on((message) => {
    if (message.sessionId !== sessionId) return;
    if (message.method === "Network.webSocketHandshakeResponseReceived") page.sockets.push(message.params.response.status);
    if (message.method === "Log.entryAdded" && /Content Security Policy/.test(message.params.entry.text)) {
      page.violations.push(message.params.entry.text);
    }
  });

  await send("Page.enable");
  await send("Runtime.enable");
  await send("Network.enable");
  await send("Log.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: 1400, height: 900, deviceScaleFactor: 1, mobile: false });

  page.eval = async (expression) => {
    const result = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });

    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? "evaluation failed");

    return result.result.value;
  };
  page.waitFor = async (expression, what, timeout = 15_000) => {
    const end = Date.now() + timeout;

    while (Date.now() < end) {
      if (await page.eval(expression).catch(() => false)) return;
      await sleep(200);
    }

    throw new Error(`timed out waiting for ${what}`);
  };
  page.goto = async (url) => {
    await send("Page.navigate", { url });
    await page.waitFor("document.readyState === 'complete'", `${url} to load`);
  };
  page.mouse = (type, x, y) =>
    send("Input.dispatchMouseEvent", { type, x, y, button: "left", buttons: type === "mouseReleased" ? 0 : 1, clickCount: 1 });

  return page;
}

// The access token lives in the app's memory, so the smoke's own API calls
// spend a refresh, as the app does on a reload.
const api = (method, apiPath, body) => `(async () => {
  const token = (await (await fetch("/api/v1/auth/refresh", { method: "POST", credentials: "include" })).json()).accessToken;
  const response = await fetch("/api/v1${apiPath}", {
    method: "${method}",
    headers: { authorization: "Bearer " + token, "content-type": "application/json" },
    body: ${body === undefined ? "undefined" : `JSON.stringify(${JSON.stringify(body)})`},
  });
  if (!response.ok) throw new Error("${method} ${apiPath} answered " + response.status);
  return response.status === 204 ? null : response.json();
})()`;

const profile = mkdtempSync(path.join(tmpdir(), "veylo-smoke-"));
const proc = spawn(chrome, ["--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, "--no-first-run", "about:blank"], {
  stdio: "ignore",
});
let browser;
let pageA;
let boardId;

try {
  let version;

  for (let i = 0; i < 80 && !version; i += 1) {
    version = await fetch(`http://127.0.0.1:${port}/json/version`).then((r) => r.json(), () => null);
    if (!version) await sleep(250);
  }

  if (!version) throw new Error(`Chrome did not start (${chrome})`);

  browser = await cdp(version.webSocketDebuggerUrl);

  step("/health reaches the API");
  const health = await fetch(`${base}/health`).then((r) => r.json());

  if (health.database !== "up") throw new Error(`/health says ${JSON.stringify(health)}`);

  const pages = [];

  for (let i = 0; i < 2; i += 1) {
    const { browserContextId } = await browser.send("Target.createBrowserContext");

    pages.push(await openPage(browser, browserContextId));
  }

  [pageA] = pages;
  const pageB = pages[1];

  step("both contexts sign in");
  for (const page of pages) {
    await page.goto(`${base}/login`);
    const status = await page.eval(
      `fetch("/api/v1/auth/login", { method: "POST", credentials: "include", headers: { "content-type": "application/json" }, body: JSON.stringify(${JSON.stringify({ identifier: email, password })}) }).then((r) => r.status)`,
    );

    if (status !== 200) throw new Error(`sign-in answered ${status}`);
  }

  step("a throwaway board with two cards");
  boardId = (await pageA.eval(api("POST", "/boards", { title: `Smoke ${new Date().toISOString()}` }))).id;
  await pageA.eval(api("PATCH", `/boards/${boardId}`, { sprints_enabled: false }));
  const workflow = await pageA.eval(api("GET", `/boards/${boardId}/workflow`));
  const first = workflow.statuses.find((status) => status.column_id !== null);

  for (const title of ["Smoke card A", "Smoke card B"]) {
    await pageA.eval(
      api("PATCH", `/boards/${boardId}/todos/${crypto.randomUUID()}`, { title, status_id: first.id, rank: Math.random() * 1000 }),
    );
  }

  step("both contexts open it and join its socket");
  for (const page of pages) {
    await page.goto(`${base}/boards/${boardId}`);
    await page.waitFor("document.querySelectorAll('[aria-roledescription=card]').length === 2", "the cards to render");
  }

  for (let i = 0; i < 50 && !(pageA.sockets.includes(101) && pageB.sockets.includes(101)); i += 1) await sleep(200);

  if (!pageA.sockets.includes(101) || !pageB.sockets.includes(101)) {
    throw new Error("the WebSocket upgrade did not succeed (are nginx's Upgrade headers in place?)");
  }

  // Joining the board's room happens after the handshake; give it a moment.
  await sleep(1000);

  step("context A drags a card into the next column");
  const [from, to, moved] = await pageA.eval(`(() => {
    const cardEl = document.querySelector('[aria-roledescription=card]');
    const card = cardEl.getBoundingClientRect();
    const column = document.querySelectorAll('[aria-roledescription=column]')[1].getBoundingClientRect();
    const title = cardEl.innerText.split('\\n').find((line) => line.startsWith('Smoke card'));
    return [[card.left + card.width / 2, card.top + card.height / 2], [column.left + column.width / 2, column.top + 120], title];
  })()`);

  await pageA.mouse("mousePressed", ...from);
  for (let i = 1; i <= 15; i += 1) {
    await pageA.mouse("mouseMoved", from[0] + ((to[0] - from[0]) * i) / 15, from[1] + ((to[1] - from[1]) * i) / 15);
    await sleep(25);
  }
  await pageA.mouse("mouseReleased", ...to);

  step("context B shows the move without reloading");
  await pageB.waitFor(
    `[...document.querySelectorAll('[aria-roledescription=card]')].some((el) => {
      if (!el.innerText.includes(${JSON.stringify(moved)})) return false;
      const x = el.getBoundingClientRect().left + 4;
      const second = document.querySelectorAll('[aria-roledescription=column]')[1].getBoundingClientRect();
      return x >= second.left && x <= second.right;
    })`,
    "the moved card in the other context's second column",
  );

  const violations = [...pageA.violations, ...pageB.violations];

  if (violations.length > 0) throw new Error(`Content-Security-Policy violations:\n${violations.join("\n")}`);

  console.log("PASS");
} catch (error) {
  console.error(`FAIL: ${error.message}`);
  process.exitCode = 1;
} finally {
  if (boardId && pageA) {
    await pageA.eval(api("DELETE", `/boards/${boardId}`)).catch(() => console.error(`could not delete the smoke board ${boardId}`));
  }
  browser?.close();
  await new Promise((resolve) => {
    proc.once("exit", resolve);
    proc.kill();
  });
  rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}

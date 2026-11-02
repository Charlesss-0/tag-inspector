import assert from "node:assert/strict";
import { mkdir, readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { resolve } from "node:path";
import { chromium } from "@playwright/test";

const server = createServer(async (req, res) => {
  try {
    const name = req.url?.startsWith("/frame.html")
      ? "frame.html"
      : "index.html";
    res.setHeader("Content-Type", "text/html");
    res.end(await readFile(resolve("fixtures", name)));
  } catch {
    res.writeHead(500).end();
  }
});
await new Promise((r) => server.listen(4179, "127.0.0.1", r));
const extension = resolve("dist");
let context;
try {
  context = await chromium.launchPersistentContext("", {
    channel: "chromium",
    headless: true,
    args: [
      `--disable-extensions-except=${extension}`,
      `--load-extension=${extension}`,
    ],
    viewport: { width: 390, height: 850 },
  });
  const worker =
    context.serviceWorkers()[0] ||
    (await context.waitForEvent("serviceworker"));
  const id = new URL(worker.url()).host;
  const errors = [];
  worker.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  const fixture = await context.newPage();
  await fixture.goto("http://127.0.0.1:4179");
  let panel = await context.newPage();
  panel.on("pageerror", (e) => errors.push(e.message));
  await panel.goto(`chrome-extension://${id}/index.html`);
  await fixture.bringToFront();
  const tabId = await panel.evaluate(async () => {
    const tabs = await chrome.tabs.query({});
    return tabs.find((t) => t.url?.startsWith("http://127.0.0.1:4179"))?.id;
  });
  const cmd = (type, data = {}) =>
    panel.evaluate(
      async ({ type, data, tab }) =>
        chrome.runtime.sendMessage({ type, tab, ...data }),
      { type, data, tab: tabId },
    );
  const poll = async (fn, label) => {
    for (let i = 0; i < 80; i++) {
      if (await fn()) return;
      await new Promise((r) => setTimeout(r, 100));
    }
    throw new Error(`Timed out: ${label}`);
  };
  let result = await cmd("GET");
  assert.equal(result.ok, true, JSON.stringify(result));
  await poll(async () => {
    result = await cmd("GET");
    return Object.values(result.session.frames).some((f) => f.elements.length);
  }, "DOM inventory");
  assert(
    Object.values(result.session.frames)
      .flatMap((f) => f.elements)
      .some((e) => e.kind === "form"),
  );
  await fixture.locator("#lead").click();
  await poll(async () => {
    result = await cmd("GET");
    return result.session.events.some((e) => e.name === "generate_lead");
  }, "dataLayer");
  assert(!JSON.stringify(result.session).includes("secret@example.com"));
  await cmd("CAPTURE", { active: false });
  const paused = (await cmd("GET")).session.events.length;
  await fixture.locator("#batch").click();
  await new Promise((r) => setTimeout(r, 500));
  assert.equal((await cmd("GET")).session.events.length, paused);
  await cmd("CAPTURE", { active: true });
  await fixture.locator("#batch").click();
  await poll(async () => {
    result = await cmd("GET");
    return result.session.events.some((e) => e.name === "purchase");
  }, "resume");
  await cmd("SETTINGS", { settings: { ...result.settings, messages: true } });
  await fixture.locator("#message").click();
  await poll(async () => {
    result = await cmd("GET");
    return result.session.events.some((e) => e.source === "postMessage");
  }, "postMessage");
  assert(!JSON.stringify(result.session).includes("never-store-this"));
  await fixture.frameLocator("iframe").locator("#push").click();
  await poll(async () => {
    result = await cmd("GET");
    return result.session.events.some(
      (e) => e.name === "frame_event" && e.frame !== 0,
    );
  }, "iframe");
  await context.route("https://www.google-analytics.com/**", (route) =>
    route.fulfill({
      status: 204,
      headers: { "access-control-allow-origin": "*" },
    }),
  );
  await fixture.evaluate(() =>
    fetch(
      "https://www.google-analytics.com/g/collect?tid=G-FIXTURE&en=browser_test",
      { mode: "no-cors" },
    ),
  );
  await poll(async () => {
    result = await cmd("GET");
    return result.session.requests.some((e) => e.name === "browser_test");
  }, "webRequest");
  await poll(async () => {
    result = await cmd("GET");
    return result.session.requests.some((e) => e.status === 204);
  }, "request status");
  const nav = result.session.navigation;
  await fixture.locator("#route").click();
  await poll(async () => {
    result = await cmd("GET");
    return result.session.navigation !== nav;
  }, "SPA navigation");
  await panel.setViewportSize({ width: 390, height: 850 });
  await fixture.bringToFront();
  await poll(
    async () => (await panel.locator("h1").textContent()) === "127.0.0.1",
    "panel active tab",
  );
  await mkdir("docs/screenshots", { recursive: true });
  await panel.screenshot({
    path: "docs/screenshots/overview-light.png",
    fullPage: true,
  });
  await panel.getByRole("button", { name: "Events", exact: true }).click();
  await panel.screenshot({
    path: "docs/screenshots/events-light.png",
    fullPage: true,
  });
  await cmd("SETTINGS", { settings: { ...result.settings, theme: "dark" } });
  await poll(
    async () =>
      (await panel.locator("html").getAttribute("data-theme")) === "dark",
    "dark theme",
  );
  await panel.screenshot({
    path: "docs/screenshots/events-dark.png",
    fullPage: true,
  });
  // Exercise the real header reset and stale messages in the extension's isolated world.
  const beforeClear = (await cmd("GET")).session;
  const fixtureUrl = fixture.url();
  const isolated = await context.newCDPSession(fixture);
  const worlds = [];
  isolated.on("Runtime.executionContextCreated", ({ context }) =>
    worlds.push(context),
  );
  await isolated.send("Runtime.enable");
  let contentWorld;
  for (const world of worlds) {
    const probe = await isolated.send("Runtime.evaluate", {
      contextId: world.id,
      expression: "globalThis.chrome?.runtime?.id",
      returnByValue: true,
    });
    if (probe.result.value === id) contentWorld = world.id;
  }
  assert(contentWorld, "Extension isolated context available");
  await panel
    .getByRole("button", { name: "Clear events", exact: true })
    .click();
  await poll(
    async () => (await cmd("GET")).session.events.length === 0,
    "header clear authoritative storage",
  );
  const cleared = (await cmd("GET")).session;
  assert.equal(cleared.capturing, true);
  assert.deepEqual(cleared.requests, beforeClear.requests);
  assert.deepEqual(cleared.frames, beforeClear.frames);
  assert.equal(fixture.url(), fixtureUrl);
  const late = {
    type: "OBSERVE",
    sessionId: beforeClear.id,
    generation: beforeClear.captureGeneration,
    events: [
      {
        id: "delayed-before-reset",
        time: Date.now(),
        name: "stale_event",
        source: "dataLayer",
        payload: { event: "stale_event" },
      },
    ],
  };
  await isolated.send("Runtime.evaluate", {
    contextId: contentWorld,
    expression: `chrome.runtime.sendMessage(${JSON.stringify(late)})`,
    awaitPromise: true,
  });
  assert.equal((await cmd("GET")).session.events.length, 0);
  await poll(
    async () => await panel.getByText("No observations to show").isVisible(),
    "immediate empty timeline",
  );
  await panel.getByRole("button", { name: "Overview", exact: true }).click();
  assert(
    await panel
      .getByRole("button", { name: "0 Events", exact: true })
      .isVisible(),
  );
  await panel.getByRole("button", { name: "Events", exact: true }).click();
  await panel.close();
  panel = await context.newPage();
  panel.on("pageerror", (e) => errors.push(e.message));
  await panel.goto(`chrome-extension://${id}/index.html`);
  await fixture.bringToFront();
  await poll(
    async () => (await panel.locator("h1").textContent()) === "127.0.0.1",
    "reopened panel context",
  );
  assert.equal((await cmd("GET")).session.events.length, 0);
  // Check short and tall viewports, including an empty timeline, in both palettes.
  for (const theme of ["light", "dark"]) {
    await cmd("SETTINGS", { settings: { ...result.settings, theme } });
    await poll(
      async () =>
        (await panel.locator("html").getAttribute("data-theme")) === theme,
      "theme refresh",
    );
    for (const [width, height] of [
      [320, 560],
      [390, 850],
      [600, 1200],
    ]) {
      await panel.setViewportSize({ width, height });
      await panel.getByRole("button", { name: "Events", exact: true }).click();
      const box = await panel.evaluate(() => ({
        root: document.getElementById("root").getBoundingClientRect().height,
        shell: document.querySelector(".shell").getBoundingClientRect().height,
        footer: document.querySelector("footer").getBoundingClientRect().bottom,
        scrollWidth: document.documentElement.scrollWidth,
        width: innerWidth,
        height: innerHeight,
      }));
      assert(
        box.root >= height && box.shell >= height && box.footer >= height - 1,
        JSON.stringify(box),
      );
      assert(box.scrollWidth <= width, JSON.stringify(box));
      await panel.screenshot({
        path: `docs/screenshots/refined-${theme}-${width}x${height}.png`,
        fullPage: true,
      });
    }
    await panel.setViewportSize({ width: 320, height: 560 });
    await panel.getByRole("button", { name: "Overview", exact: true }).click();
    const overflow = await panel.evaluate(() => ({
      scroll: document.documentElement.scrollHeight,
      height: innerHeight,
      mainOverflow: getComputedStyle(document.querySelector("main")).overflowY,
    }));
    assert(overflow.scroll > overflow.height);
    assert.equal(overflow.mainOverflow, "visible");
    await panel.evaluate(() =>
      window.scrollTo(0, document.documentElement.scrollHeight),
    );
    assert(await panel.locator("footer").isVisible());
  }
  await fixture.locator("#lead").click();
  await poll(
    async () =>
      (await cmd("GET")).session.events.some((e) => e.name === "generate_lead"),
    "new event after reset",
  );
  await cmd("CAPTURE", { active: false });
  await cmd("CLEAR_EVENTS");
  assert.equal((await cmd("GET")).session.capturing, false);
  await fixture.locator("#lead").click();
  await new Promise((r) => setTimeout(r, 300));
  assert.equal((await cmd("GET")).session.events.length, 0);
  await cmd("CAPTURE", { active: true });
  await isolated.detach();
  const before = result.session.id;
  await fixture.reload();
  await poll(async () => {
    result = await cmd("GET");
    return result.session.id !== before;
  }, "full navigation reset");
  assert(!result.session.events.some((e) => e.name === "browser_test"));
  await cmd("CLEAR");
  assert.equal((await cmd("GET")).session.events.length, 0);
  const second = await context.newPage();
  await second.goto("http://localhost:4179");
  const secondId = await panel.evaluate(async () => {
    const tabs = await chrome.tabs.query({});
    return tabs.find((t) => t.url?.startsWith("http://localhost:4179"))?.id;
  });
  const secondSession = await panel.evaluate(
    (tab) => chrome.runtime.sendMessage({ type: "GET", tab }),
    secondId,
  );
  assert.notEqual(secondSession.session.id, result.session.id);
  assert.equal(secondSession.session.requests.length, 0);
  await second.locator("#lead").click();
  const readSecond = () =>
    panel.evaluate(
      (tab) => chrome.runtime.sendMessage({ type: "GET", tab }),
      secondId,
    );
  await poll(
    async () =>
      (await readSecond()).session.events.some(
        (e) => e.name === "generate_lead",
      ),
    "second tab capture",
  );
  const otherEvents = (await readSecond()).session.events;
  await cmd("CLEAR_EVENTS");
  assert.deepEqual((await readSecond()).session.events, otherEvents);
  await second.close();
  await fixture.bringToFront();
  const retained = (await cmd("GET")).session.id;
  const cdp = await context.newCDPSession(panel);
  await cdp.send("ServiceWorker.enable");
  await cdp.send("ServiceWorker.stopAllWorkers");
  assert.equal((await cmd("GET")).session.id, retained);
  await cdp.detach();
  const currentWorker =
    context.serviceWorkers().find((w) => w.url().includes(id)) ||
    (await context.waitForEvent("serviceworker"));
  await cmd("CLEAR_ALL");
  assert.equal((await cmd("GET")).session.capturing, false);
  await cmd("CAPTURE", { active: true });
  await fixture.locator("#lead").click();
  await poll(
    async () =>
      (await cmd("GET")).session.events.some((e) => e.name === "generate_lead"),
    "resume after clear all",
  );
  const behavior = await currentWorker.evaluate(() =>
    chrome.sidePanel.getPanelBehavior(),
  );
  assert.equal(behavior.openPanelOnActionClick, true);
  assert.deepEqual(errors, []);
  console.log(
    "PASS: event-only header reset, stale batch rejection, reset persistence, paused reset, unchanged inventory/network evidence, responsive neutral themes, extension load, toolbar configuration, DOM/forms, dataLayer, pause/resume, postMessage redaction, iframe, network request/status, SPA/full navigation, clear, resume after clear-all, tab isolation, worker restart, light/dark panel rendering.",
  );
} finally {
  await context?.close();
  server.close();
}

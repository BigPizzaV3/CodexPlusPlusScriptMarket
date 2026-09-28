"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const scriptPath = path.resolve(__dirname, "../scripts/codex-daily-token-usage.js");
const source = fs.readFileSync(scriptPath, "utf8");

function createRuntime() {
  const values = new Map();
  const localStorage = {
    getItem(key) {
      return values.get(key) ?? null;
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
    removeItem(key) {
      values.delete(key);
    },
  };
  const document = {
    readyState: "loading",
    documentElement: { clientWidth: 1708 },
    addEventListener() {},
    removeEventListener() {},
  };
  const getComputedStyle = (node) => node?.computedStyle || {
    display: "block",
    visibility: "visible",
    opacity: "1",
    position: "static",
  };
  const window = {
    innerWidth: 1708,
    localStorage,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    addEventListener() {},
    removeEventListener() {},
  };
  window.window = window;
  vm.runInContext(
    source,
    vm.createContext({
      window,
      document,
      localStorage,
      console,
      Intl,
      Date,
      Number,
      String,
      Object,
      Array,
      JSON,
      Math,
      setTimeout,
      clearTimeout,
      setInterval,
      clearInterval,
      getComputedStyle,
    }),
    { filename: scriptPath }
  );
  return { api: window.__codexDailyTokenUsage, document };
}

function tokenCountRow(timestamp, total, last, model = "") {
  const rows = [];
  if (model) {
    rows.push({
      timestamp: new Date(timestamp - 1).toISOString(),
      type: "event_msg",
      payload: { type: "thread_settings_applied", thread_settings: { model } },
    });
  }
  rows.push({
    timestamp: new Date(timestamp).toISOString(),
    type: "event_msg",
    payload: {
      type: "token_count",
      info: {
        total_token_usage: total,
        last_token_usage: last,
      },
    },
  });
  return rows;
}

const runtime = createRuntime();
const api = runtime.api;
const test = api.__test;
assert.equal(api.version, "1.4.19");

const today = new Date();
today.setHours(10, 0, 0, 0);
const yesterday = new Date(today);
yesterday.setDate(yesterday.getDate() - 1);
const todayKey = test.getDateKey(today.getTime());
const yesterdayKey = test.getDateKey(yesterday.getTime());

const threadId = "019eca4f-87bb-75f2-af8c-18b5896ac742";
const sessionPath = test.sessionPathFromThreadId(threadId, "/Users/test");
assert.match(sessionPath, /^\/Users\/test\/\.codex\/sessions\/\d{4}\/\d{2}\/\d{2}\/rollout-/);
assert.ok(sessionPath.endsWith(`-${threadId}.jsonl`));
assert.equal(test.bootstrapThreadIds({
  catalogEntries: [{ threadId }],
  globalStateEntries: [{ key: "projectless-thread-ids", value: ["01a01cfe-3db4-7171-b552-f2fd510ed5ef"] }],
}).length, 2);
assert.deepEqual(
  JSON.parse(JSON.stringify(test.bootstrapHomeDirectories({
    catalogEntries: [{ cwd: "/Users/test/project" }],
    workspaceRootOptions: { roots: ["/Users/test/other"] },
  }))),
  ["/Users/test"]
);

const rows = [
  {
    timestamp: new Date(yesterday.getTime() - 1000).toISOString(),
    type: "session_meta",
    payload: { id: threadId },
  },
  ...tokenCountRow(
    yesterday.getTime(),
    { input_tokens: 90, output_tokens: 10, cached_input_tokens: 50, reasoning_output_tokens: 2, total_tokens: 100 },
    { input_tokens: 90, output_tokens: 10, cached_input_tokens: 50, reasoning_output_tokens: 2, total_tokens: 100 },
    "gpt-5.5"
  ),
  ...tokenCountRow(
    yesterday.getTime() + 1000,
    { input_tokens: 135, output_tokens: 15, cached_input_tokens: 80, reasoning_output_tokens: 3, total_tokens: 150 },
    { input_tokens: 45, output_tokens: 5, cached_input_tokens: 30, reasoning_output_tokens: 1, total_tokens: 50 }
  ),
  ...tokenCountRow(
    today.getTime(),
    { input_tokens: 162, output_tokens: 18, cached_input_tokens: 95, reasoning_output_tokens: 4, total_tokens: 180 },
    { input_tokens: 27, output_tokens: 3, cached_input_tokens: 15, reasoning_output_tokens: 1, total_tokens: 30 },
    "gpt-5.6-sol"
  ),
];
const usages = test.parseSessionUsagesFromJsonl(rows.map((row) => JSON.stringify(row)).join("\n"), {
  path: sessionPath,
});
assert.equal(usages.length, 2);
assert.deepEqual(
  JSON.parse(JSON.stringify(usages.map((usage) => ({
    dateKey: usage.dateKey,
    model: usage.model,
    total: usage.usage.total,
    input: usage.usage.input,
    output: usage.usage.output,
    calls: usage.tokenCountEvents,
  })))),
  [
    { dateKey: yesterdayKey, model: "gpt-5.5", total: 150, input: 135, output: 15, calls: 2 },
    { dateKey: todayKey, model: "gpt-5.6-sol", total: 30, input: 27, output: 3, calls: 1 },
  ]
);

test.replaceState({
  version: 1,
  days: {
    [todayKey]: {
      turns: {
        "old-live": {
          input: 40,
          output: 10,
          cached: 20,
          reasoning: 0,
          total: 50,
          calls: 1,
          updatedAt: today.getTime() - 1000,
          source: "turn-aggregate",
          model: "gpt-5.6-sol",
          modelConfidence: "observed",
          conversationKey: threadId,
        },
      },
      updatedAt: today.getTime() - 1000,
    },
  },
});
const todayUsage = usages.find((usage) => usage.dateKey === todayKey);
assert.equal(test.upsertHistorySessionUsage(todayUsage), true);
assert.equal(test.markHistoryCoverageComplete([todayKey]), true);
assert.equal(test.pruneSupersededUsageTurns([todayKey]), 1);
assert.equal(test.aggregateDay(todayKey).total, 30);
assert.equal(test.historyCoverageTimestamp(test.getRawState().days[todayKey]), today.getTime());
assert.equal(test.upsertTurn({
  turnId: "stale-live",
  source: "turn-aggregate",
  createdAt: new Date(today.getTime() - 500).toISOString(),
  usage: { inputTokens: 10, outputTokens: 2, totalTokens: 12, hasBreakdown: true },
}), false);
assert.equal(test.upsertTurn({
  turnId: "new-live",
  source: "turn-aggregate",
  createdAt: new Date(today.getTime() + 500).toISOString(),
  usage: { inputTokens: 10, outputTokens: 2, totalTokens: 12, hasBreakdown: true },
}), true);
assert.equal(test.aggregateDay(todayKey).total, 42);

const turns = {};
const toolCalls = {};
const toolEvents = {};
for (let index = 0; index < 226; index += 1) {
  turns[`turn-${index}`] = {
    input: 1000 + index,
    output: 100,
    cached: 500,
    reasoning: 10,
    total: 1100 + index,
    calls: 1,
    updatedAt: today.getTime() + index,
    source: "turn-aggregate",
    model: "gpt-5.5",
    modelConfidence: "observed",
    conversationKey: `conversation-${index}`,
  };
}
for (let index = 0; index < 314; index += 1) {
  const key = `plugin||exec_command|${index}`;
  toolCalls[key] = {
    kind: "plugin",
    name: "exec_command",
    namespace: "",
    count: 1,
    lastCalledAt: today.getTime() + index,
    source: "test",
  };
  toolEvents[key] = {
    kind: "plugin",
    name: "exec_command",
    namespace: "",
    id: key,
    source: "test",
    timestamp: today.getTime() + index,
    turnKey: `turn-${index % 226}`,
    conversationKey: `conversation-${index % 226}`,
  };
}
test.replaceState({
  version: 1,
  days: { [todayKey]: { turns, toolCalls, toolEvents, updatedAt: today.getTime() } },
});
assert.equal(test.aggregateDayCached(todayKey).cacheHit, false);
assert.equal(test.aggregateDayCached(todayKey).cacheHit, true);
assert.equal(test.aggregateDay(todayKey).turns, 226);
assert.equal(test.aggregateDay(todayKey).toolCallTotal, 314);

const dynamicObstacles = [
  { left: 518, top: 8, right: 665, bottom: 42 },
  { left: 690, top: 8, right: 820, bottom: 42 },
];
const layout = test.resolveFloatingLayout(94, 31, 900, 600, dynamicObstacles);
assert.equal(layout.compact, false);
for (const obstacle of dynamicObstacles) {
  assert.equal(
    test.rectsOverlap(
      { left: layout.left, right: layout.left + layout.width, top: layout.top, bottom: layout.top + 31 },
      obstacle,
      8
    ),
    false
  );
}

function visibleNode(rect, options = {}) {
  return {
    ...options,
    getBoundingClientRect() {
      return rect;
    },
  };
}

const applicationMenuTopBar = visibleNode({ left: 0, top: 0, right: 1708, bottom: 36 });
const legacyAppHeader = visibleNode({ left: 0, top: 0, right: 1708, bottom: 36 });
const queriedHeaderSelectors = [];
runtime.document.querySelector = (selector) => {
  queriedHeaderSelectors.push(selector);
  if (selector === '[class*="ApplicationMenuTopBar"]') return applicationMenuTopBar;
  if (selector === ".app-header-tint") return legacyAppHeader;
  if (selector === "header") throw new Error("conversation header must not be queried");
  return null;
};
assert.equal(test.findAppHeaderElement(), applicationMenuTopBar);
assert.deepEqual(queriedHeaderSelectors, ['[class*="ApplicationMenuTopBar"]']);

const menuTopBar = visibleNode({ left: 0, top: 0, right: 1708, bottom: 36 });
const menuBar = {
  closest(selector) {
    assert.equal(selector, '[class*="ApplicationMenuTopBar"]');
    return menuTopBar;
  },
};
runtime.document.querySelector = (selector) => {
  if (selector === '[class*="ApplicationMenuTopBar"]') return null;
  if (selector === '[role="menubar"]') return menuBar;
  if (selector === ".app-header-tint") return legacyAppHeader;
  if (selector === "header") throw new Error("conversation header must not be queried");
  return null;
};
assert.equal(test.findAppHeaderElement(), menuTopBar);

const hiddenApplicationMenuTopBar = visibleNode({ left: 0, top: 0, right: 0, bottom: 0 });
runtime.document.querySelector = (selector) => {
  if (selector === '[class*="ApplicationMenuTopBar"]') return hiddenApplicationMenuTopBar;
  if (selector === ".app-header-tint") return legacyAppHeader;
  if (selector === "header") throw new Error("conversation header must not be queried");
  return null;
};
assert.equal(test.findAppHeaderElement(), legacyAppHeader);

runtime.document.querySelector = (selector) => {
  if (selector === ".app-header-tint") return legacyAppHeader;
  if (selector === "header") throw new Error("conversation header must not be queried");
  return null;
};
assert.equal(test.findAppHeaderElement(), legacyAppHeader);

runtime.document.querySelector = (selector) => {
  if (selector === "header") throw new Error("generic conversation header must not be queried");
  return null;
};
const staticAppHeader = visibleNode(
  { left: 0, top: 0, right: 1708, bottom: 46, width: 1708, height: 46 },
  { computedStyle: { display: "flex", visibility: "visible", opacity: "1", position: "static" } }
);
const fixedAppHeader = visibleNode(
  { left: 0, top: 0, right: 1708, bottom: 46, width: 1708, height: 46 },
  { computedStyle: { display: "flex", visibility: "visible", opacity: "1", position: "fixed" } }
);
const conversationHeader = visibleNode(
  { left: 1408, top: 68, right: 1708, bottom: 96, width: 300, height: 28 },
  { computedStyle: { display: "flex", visibility: "visible", opacity: "1", position: "sticky" } }
);
runtime.document.querySelectorAll = (selector) => {
  assert.equal(selector, "header.draggable");
  return [conversationHeader, staticAppHeader, fixedAppHeader];
};
assert.equal(test.findAppHeaderElement(), fixedAppHeader);

runtime.document.querySelectorAll = () => [conversationHeader];
assert.equal(test.findAppHeaderElement(), null);

const defaultLayout = test.resolveFloatingLayout(108, 31, 1708, 1020, [], []);
assert.deepEqual(
  JSON.parse(JSON.stringify(defaultLayout)),
  { top: 2, right: 132, left: 1468, width: 108, compact: false }
);
assert.match(source, /const FLOATING_DEFAULT_RIGHT = WINDOW_BUTTON_SAFE_RIGHT;/);
assert.doesNotMatch(source, /document\.querySelector\(["']header["']\)/);

assert.match(source, /html\.electron-dark #\$\{PANEL_ID\}/);
assert.match(source, /html\[data-theme="dark"\] #\$\{ROOT_ID\}/);
assert.match(
  source,
  /@media \(prefers-color-scheme: dark\)[\s\S]*?html:not\(\[data-theme="light"\]\) #\$\{ROOT_ID\},[\s\S]*?html:not\(\[data-theme="light"\]\) #\$\{PANEL_ID\}[\s\S]*?--color-token-foreground: #f2f2f2;/
);
assert.match(
  source,
  /html\[data-theme="dark"\] #\$\{ROOT_ID\},[\s\S]*?html\[data-theme="dark"\] #\$\{PANEL_ID\}[\s\S]*?--color-token-foreground-secondary: #a9a9ad;/
);
assert.match(source, /overflow-y: auto/);
assert.match(source, /scheduleDomToolScan/);

const index = JSON.parse(fs.readFileSync(path.resolve(__dirname, "../index.json"), "utf8"));
const indexEntry = index.scripts.find((entry) => entry.id === "codex-daily-token-usage");
const scriptSha256 = crypto.createHash("sha256").update(fs.readFileSync(scriptPath)).digest("hex");
assert.equal(indexEntry.version, api.version);
assert.equal(indexEntry.sha256, scriptSha256);

api.destroy({ clearData: true });
console.log("codex-daily-token-usage: assertions passed");

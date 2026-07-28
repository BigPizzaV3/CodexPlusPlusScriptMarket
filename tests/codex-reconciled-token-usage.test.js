const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const scriptPath = path.join(__dirname, "..", "scripts", "codex-reconciled-token-usage.js");

function loadHooks() {
  const hooks = {};
  const context = {
    __CODEX_RECONCILED_TOKEN_USAGE_TEST__: hooks,
    console,
    Date,
  };
  context.globalThis = context;
  context.window = context;
  vm.runInNewContext(fs.readFileSync(scriptPath, "utf8"), context, {
    filename: scriptPath,
  });
  return hooks;
}

test("price configuration starts empty and multiplier defaults to one", () => {
  const hooks = loadHooks();

  assert.deepEqual(Object.keys(hooks.defaultPrices), []);
  assert.deepEqual(
    JSON.parse(JSON.stringify(hooks.emptyPriceConfig())),
    { longContextThreshold: null, multiplier: 1 },
  );
  assert.equal(hooks.normalizeMultiplier(undefined), 1);
  assert.equal(hooks.normalizeMultiplier(""), 1);
  const aggregate = hooks.emptyAggregate();
  hooks.addRequestToAggregate(aggregate, { input: 10, output: 1 }, hooks.emptyPriceConfig());
  assert.equal(hooks.calculateAggregateCost(aggregate, hooks.emptyPriceConfig()), null);
});

test("long-context accounting is disabled until a per-model threshold is configured", () => {
  const hooks = loadHooks();
  const short = hooks.emptyAggregate();
  hooks.addRequestToAggregate(short, { input: 300_000, output: 10 }, hooks.emptyPriceConfig());
  assert.equal(short.shortCalls, 1);
  assert.equal(short.longCalls, 0);

  const long = hooks.emptyAggregate();
  hooks.addRequestToAggregate(long, { input: 300_000, output: 10 }, { longContextThreshold: 272_000 });
  assert.equal(long.shortCalls, 0);
  assert.equal(long.longCalls, 1);
});

test("MessagePort and proxy events are matched one-to-one", () => {
  const hooks = loadHooks();
  const now = Date.now();
  const usage = { input: 120, cachedInput: 80, output: 12 };
  const proxy = {
    model: "test-model",
    usage: { ...usage, cacheWrite: 7, reasoning: 3 },
    timestampMs: now + 10,
  };

  hooks.rememberLiveRequest("test-model", usage, now);
  hooks.rememberLiveRequest("test-model", usage, now + 1);
  assert.equal(hooks.consumeMatchingLiveRequest(proxy), true);
  assert.equal(hooks.consumeMatchingLiveRequest(proxy), true);
  assert.equal(hooks.consumeMatchingLiveRequest(proxy), false);
});

test("proxy usage can replace a live aggregate without double counting", () => {
  const hooks = loadHooks();
  const aggregate = hooks.emptyAggregate();
  const live = { input: 120, cachedInput: 80, output: 12, reasoning: 1 };
  const proxy = { input: 120, cachedInput: 80, cacheWrite: 7, output: 12, reasoning: 3 };

  hooks.addRequestToAggregate(aggregate, live);
  hooks.removeRequestFromAggregate(aggregate, live);
  hooks.addRequestToAggregate(aggregate, proxy);

  assert.equal(aggregate.calls, 1);
  assert.equal(aggregate.input, 120);
  assert.equal(aggregate.cachedInput, 80);
  assert.equal(aggregate.cacheWrite, 7);
  assert.equal(aggregate.output, 12);
  assert.equal(aggregate.reasoning, 3);
});

test("rollout candidates stay available for a delayed proxy event", () => {
  const hooks = loadHooks();
  const now = Date.now();
  const usage = { input: 120, cachedInput: 80, output: 12 };
  const proxy = { model: "test-model", usage, timestampMs: now + 10 };

  hooks.rememberLiveRequest("test-model", usage, now, "rollout");
  hooks.rememberLiveRequest("test-model", usage, now + 1, "rollout");
  assert.equal(hooks.hasMatchingLiveRequest(proxy, "messageport"), false);
  assert.equal(hooks.hasMatchingLiveRequest(proxy, "rollout"), true);
  assert.equal(hooks.consumeMatchingLiveRequest(proxy), true);
  assert.equal(hooks.consumeMatchingLiveRequest(proxy), true);
  assert.equal(hooks.consumeMatchingLiveRequest(proxy), false);
});

test("a uniquely renamed provider model is matched but ambiguous candidates are not", () => {
  const hooks = loadHooks();
  const now = Date.now();
  const usage = { input: 120, cachedInput: 80, cacheWrite: 3, output: 12, reasoning: 2 };

  hooks.rememberLiveRequest("local-model", usage, now);
  assert.equal(
    hooks.consumeMatchingLiveRequest({ model: "provider-model", usage, timestampMs: now + 10 }),
    true,
  );

  hooks.rememberLiveRequest("local-a", usage, now + 20);
  hooks.rememberLiveRequest("local-b", usage, now + 30);
  assert.equal(
    hooks.consumeMatchingLiveRequest({ model: "provider-model", usage, timestampMs: now + 40 }),
    false,
  );
});

test("request status counters distinguish success, failure, and retry attempts", () => {
  const hooks = loadHooks();
  const aggregate = hooks.emptyAggregate();

  hooks.addRequestToAggregate(aggregate, { input: 10, status: "completed" });
  hooks.addRequestToAggregate(aggregate, { usageMissing: true, status: "failed" });
  hooks.addRequestToAggregate(aggregate, { usageMissing: true, status: "retry" });

  assert.equal(aggregate.calls, 3);
  assert.equal(aggregate.successCalls, 1);
  assert.equal(aggregate.failedCalls, 1);
  assert.equal(aggregate.retryCalls, 1);
});

test("script contains no built-in price source, threshold, or model alias", () => {
  const source = fs.readFileSync(scriptPath, "utf8");

  assert.equal(source.includes("/token-usage/prices"), false);
  assert.equal(source.includes("syncOfficial"), false);
  assert.equal(source.includes("272000"), false);
  assert.equal(source.includes("gpt-5.6"), false);
  assert.match(source, /includeRollout:\s*true/);
  assert.match(source, /rolloutIncremental:\s*!full/);
  assert.match(source, /proxyOffset:\s*full \? 0 : reconcileProxyOffset/);
  assert.match(source, /proxyGeneration:\s*full \? "" : reconcileProxyGeneration/);
});

test("market metadata and reconciliation cadence are release-ready", () => {
  const source = fs.readFileSync(scriptPath, "utf8");

  assert.match(source, /@name\s+Codex Reconciled Token Usage/);
  assert.match(source, /@version\s+1\.0\.0/);
  assert.match(source, /@author\s+QingJunXue/);
  assert.match(source, /const PROXY_RECONCILE_INTERVAL_MS = 60000;/);
  assert.equal(source.includes('window.addEventListener("focus"'), false);
  assert.equal(source.includes('document.addEventListener("visibilitychange"'), false);
  assert.match(source, /__codexReconciledTokenUsageMessagePortDispatcher/);
});

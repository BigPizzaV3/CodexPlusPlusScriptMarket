// ==UserScript==
// @name         Codex Reconciled Token Usage
// @namespace    codex-plus-plus
// @version      1.0.0
// @description  使用 MessagePort、rollout 快照和 Codex++ 代理账本对账 Token 与请求状态。
// @author       QingJunXue
// @homepageURL  https://github.com/BigPizzaV3/CodexPlusPlusScriptMarket
// @supportURL   https://github.com/BigPizzaV3/CodexPlusPlusScriptMarket/issues
// @license      AGPL-3.0-only
// @match        app://-/*
// @run-at       document-start
// ==/UserScript==

(() => {
  "use strict";

  const VERSION = "1.0.0";
  const API_KEY = "__codexReconciledTokenUsage";
  const STORAGE_KEY = "__codexReconciledTokenUsageV1";
  const PRICE_STORAGE_KEY = "__codexReconciledTokenUsagePricesV1";
  const LEGACY_STATE_KEYS = ["__myCodexTokenStatsV1"];
  const LEGACY_PRICE_KEYS = [
    "__myCodexTokenStatsPricesV3",
    "__myCodexTokenStatsPricesV2",
    "__myCodexTokenStatsPricesV1",
  ];
  const LEGACY_KEYS = [
    "__myCodexTokenUsageTotalMode",
  ];
  const ROOT_ID = "codex-reconciled-token-usage";
  const PANEL_ID = "codex-reconciled-token-usage-panel";
  const STYLE_ID = "codex-reconciled-token-usage-style";
  const RETAIN_DAYS = 7;
  const TREND_DAYS = 7;
  const WATERMARK_LIMIT = 600;
  const DEBUG_LIMIT = 50;
  const UNKNOWN_MODEL = "Unknown";
  const RENDER_DEBOUNCE_MS = 200;
  const UNKNOWN_MIGRATE_LIMIT = 400;
  const DEFAULT_PRICES = {};
  const PROXY_RECONCILE_INTERVAL_MS = 60000;
  const LIVE_PROXY_MATCH_WINDOW_MS = 5 * 60 * 1000;


  const previous = window[API_KEY];
  if (previous && typeof previous.destroy === "function") {
    try {
      previous.destroy();
    } catch (_) {
      // 旧实例清理失败不应阻止新实例加载。
    }
  }

  const debugRing = [];
  let state = null;
  let prices = null;
  let root = null;
  let panel = null;
  let styleEl = null;
  let observer = null;
  let hoverToolbar = null;
  let pinnedOpen = false;
  let pricesOpen = false;
  let closeTimer = null;
  let renderTimer = 0;
  let saveTimer = 0;
  let destroyed = false;
  let lastRequest = null;
  let selectedDateKey = "";
  let migratedStateKey = "";
  let migratedPriceKey = "";
  const recentLiveRequests = [];
  const pendingLiveDuringFullReconcile = [];
  let fullReconcileActive = false;

  // ---------------------------------------------------------------------------
  // 基础工具
  // ---------------------------------------------------------------------------

  function toCount(value) {
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? Math.round(number) : 0;
  }

  function normalizeMultiplier(value) {
    if (value == null || (typeof value === "string" && !value.trim())) return 1;
    const number = Number(value);
    return Number.isFinite(number) && number >= 0 ? number : 1;
  }

  function optionalPrice(value) {
    if (value == null || value === "") return null;
    const number = Number(value);
    return Number.isFinite(number) && number >= 0 ? number : null;
  }

  function emptyPriceConfig() {
    return { longContextThreshold: null, multiplier: 1 };
  }

  function normalizeModelName(value) {
    if (typeof value !== "string") return "";
    const model = value.trim();
    if (!model || model.length > 120) return "";
    if (/^(null|undefined|default)$/i.test(model)) return "";
    return model;
  }

  function rememberLiveRequest(model, usage, at, source = "messageport") {
    const normalizedModel = normalizeModelName(model) || UNKNOWN_MODEL;
    recentLiveRequests.push({
      model: normalizedModel,
      modelKey: normalizedModel.toLowerCase(),
      source,
      input: toCount(usage?.input),
      cachedInput: toCount(usage?.cachedInput),
      cacheWrite: toCount(usage?.cacheWrite),
      output: toCount(usage?.output),
      reasoning: toCount(usage?.reasoning),
      at: toCount(at),
    });
    const cutoff = Date.now() - LIVE_PROXY_MATCH_WINDOW_MS;
    while (recentLiveRequests.length > 1000 || recentLiveRequests[0]?.at < cutoff) {
      recentLiveRequests.shift();
    }
  }

  function matchingLiveRequestIndex(event, source = "") {
    const modelKey = normalizeModelName(event?.model).toLowerCase();
    const usage = event?.usage || {};
    const timestamp = toCount(event?.timestampMs) || Date.parse(event?.timestamp) || Date.now();
    const matching = [];
    for (let index = 0; index < recentLiveRequests.length; index += 1) {
      const candidate = recentLiveRequests[index];
      if (source && candidate.source !== source) continue;
      if (candidate.input !== toCount(usage.input)) continue;
      if (candidate.cachedInput !== toCount(usage.cachedInput)) continue;
      if (candidate.output !== toCount(usage.output)) continue;
      const delta = Math.abs(candidate.at - timestamp);
      if (delta <= LIVE_PROXY_MATCH_WINDOW_MS) {
        matching.push({ index, delta, exact: candidate.modelKey === modelKey });
      }
    }
    const exact = matching.filter((candidate) => candidate.exact);
    const nearestIndex = exact.length
      ? exact.sort((left, right) => left.delta - right.delta)[0].index
      : matching.length === 1
        ? matching[0].index
        : -1;
    return nearestIndex;
  }

  function hasMatchingLiveRequest(event, source = "") {
    return matchingLiveRequestIndex(event, source) >= 0;
  }

  function takeMatchingLiveRequest(event) {
    const nearestIndex = matchingLiveRequestIndex(event);
    if (nearestIndex < 0) return null;
    return recentLiveRequests.splice(nearestIndex, 1)[0] || null;
  }

  function consumeMatchingLiveRequest(event) {
    return !!takeMatchingLiveRequest(event);
  }

  function rolloutEventIdentity(event) {
    const sessionId = String(event?.sessionId || "");
    const totals = event?.totals || {};
    const watermark = [
      toCount(totals.input),
      toCount(totals.cachedInput),
      toCount(totals.cacheWrite),
      toCount(totals.output),
      toCount(totals.reasoning),
      toCount(totals.total),
    ];
    if (sessionId && watermark.some((value) => value > 0)) {
      return `watermark-v2:${JSON.stringify([sessionId, ...watermark])}`;
    }
    return `event-v1:${String(event?.id || "")}`;
  }

  function deduplicateRolloutEvents(events) {
    const deduplicated = [];
    const indexes = new Map();
    for (const event of events || []) {
      const identity = rolloutEventIdentity(event);
      const index = indexes.get(identity);
      if (index == null) {
        indexes.set(identity, deduplicated.length);
        deduplicated.push(event);
        continue;
      }
      const existing = deduplicated[index];
      const existingUnknown = !normalizeModelName(existing?.model) || existing.model === UNKNOWN_MODEL;
      const incomingKnown = normalizeModelName(event?.model) && event.model !== UNKNOWN_MODEL;
      if (existingUnknown && incomingKnown) deduplicated[index] = event;
    }
    return deduplicated;
  }

  function emptyAggregate() {
    return {
      input: 0,
      cachedInput: 0,
      cacheWrite: 0,
      output: 0,
      reasoning: 0,
      calls: 0,
      successCalls: 0,
      failedCalls: 0,
      retryCalls: 0,
      missingUsage: 0,
      shortInput: 0,
      shortCachedInput: 0,
      shortCacheWrite: 0,
      shortOutput: 0,
      shortCalls: 0,
      longInput: 0,
      longCachedInput: 0,
      longCacheWrite: 0,
      longOutput: 0,
      longCalls: 0,
      pricingBreakdownVersion: 1,
    };
  }

  const AGGREGATE_COUNT_FIELDS = [
    "input", "cachedInput", "cacheWrite", "output", "reasoning", "calls",
    "successCalls", "failedCalls", "retryCalls", "missingUsage",
    "shortInput", "shortCachedInput", "shortCacheWrite", "shortOutput", "shortCalls",
    "longInput", "longCachedInput", "longCacheWrite", "longOutput", "longCalls",
  ];

  function normalizeAggregate(raw) {
    const normalized = emptyAggregate();
    for (const field of [
      "input", "cachedInput", "cacheWrite", "output", "reasoning", "calls",
      "successCalls", "failedCalls", "retryCalls", "missingUsage",
    ]) {
      normalized[field] = toCount(raw?.[field]);
    }
    if (raw?.successCalls == null && raw?.failedCalls == null && raw?.retryCalls == null) {
      normalized.successCalls = normalized.calls;
    }
    if (raw?.pricingBreakdownVersion !== 1) {
      normalized.pricingBreakdownVersion = 0;
      return normalized;
    }
    for (const field of [
      "shortInput", "shortCachedInput", "shortCacheWrite", "shortOutput", "shortCalls",
      "longInput", "longCachedInput", "longCacheWrite", "longOutput", "longCalls",
    ]) {
      normalized[field] = toCount(raw?.[field]);
    }
    return normalized;
  }

  function addRequestToAggregate(aggregate, request, price = null) {
    const hadUsage = toCount(aggregate?.calls) > 0 || toCount(aggregate?.input) > 0 || toCount(aggregate?.output) > 0;
    const breakdownKnown = aggregate?.pricingBreakdownVersion === 1 || !hadUsage;
    const input = toCount(request?.input);
    const cachedInput = toCount(request?.cachedInput);
    const cacheWrite = toCount(request?.cacheWrite);
    const output = toCount(request?.output);
    const reasoning = toCount(request?.reasoning);
    const threshold = optionalPrice(price?.longContextThreshold);
    const prefix = threshold != null && input > threshold ? "long" : "short";
    aggregate.input += input;
    aggregate.cachedInput += cachedInput;
    aggregate.cacheWrite += cacheWrite;
    aggregate.output += output;
    aggregate.reasoning += reasoning;
    aggregate.calls += 1;
    const status = String(request?.status || "completed").toLowerCase();
    if (status === "retry") aggregate.retryCalls += 1;
    else if (status === "failed" || status === "incomplete") aggregate.failedCalls += 1;
    else aggregate.successCalls += 1;
    aggregate.missingUsage += request?.usageMissing ? 1 : 0;
    aggregate[`${prefix}Input`] += input;
    aggregate[`${prefix}CachedInput`] += cachedInput;
    aggregate[`${prefix}CacheWrite`] += cacheWrite;
    aggregate[`${prefix}Output`] += output;
    aggregate[`${prefix}Calls`] += 1;
    aggregate.pricingBreakdownVersion = breakdownKnown ? 1 : 0;
    return aggregate;
  }

  function removeRequestFromAggregate(aggregate, request, price = null) {
    if (!aggregate) return aggregate;
    const input = toCount(request?.input);
    const cachedInput = toCount(request?.cachedInput);
    const cacheWrite = toCount(request?.cacheWrite);
    const output = toCount(request?.output);
    const reasoning = toCount(request?.reasoning);
    const threshold = optionalPrice(price?.longContextThreshold);
    const prefix = threshold != null && input > threshold ? "long" : "short";
    const subtract = (field, value) => {
      aggregate[field] = Math.max(0, toCount(aggregate[field]) - toCount(value));
    };
    subtract("input", input);
    subtract("cachedInput", cachedInput);
    subtract("cacheWrite", cacheWrite);
    subtract("output", output);
    subtract("reasoning", reasoning);
    subtract("calls", 1);
    const status = String(request?.status || "completed").toLowerCase();
    if (status === "retry") subtract("retryCalls", 1);
    else if (status === "failed" || status === "incomplete") subtract("failedCalls", 1);
    else subtract("successCalls", 1);
    if (request?.usageMissing) subtract("missingUsage", 1);
    subtract(`${prefix}Input`, input);
    subtract(`${prefix}CachedInput`, cachedInput);
    subtract(`${prefix}CacheWrite`, cacheWrite);
    subtract(`${prefix}Output`, output);
    subtract(`${prefix}Calls`, 1);
    return aggregate;
  }

  function calculateAggregateCost(aggregate, price) {
    if (!price || aggregate?.pricingBreakdownVersion !== 1) return null;
    const tierCost = (prefix, pricePrefix) => {
      const input = toCount(aggregate?.[`${prefix}Input`]);
      const cachedInput = toCount(aggregate?.[`${prefix}CachedInput`]);
      const cacheWrite = toCount(aggregate?.[`${prefix}CacheWrite`]);
      const output = toCount(aggregate?.[`${prefix}Output`]);
      const uncached = Math.max(0, input - cachedInput - cacheWrite);
      const quantities = [uncached, cachedInput, cacheWrite, output];
      const fields = pricePrefix
        ? ["longInput", "longCacheRead", "longCacheWrite", "longOutput"]
        : ["input", "cacheRead", "cacheWrite", "output"];
      let total = 0;
      for (let index = 0; index < quantities.length; index += 1) {
        if (!quantities[index]) continue;
        const rawRate = price[fields[index]];
        if (rawRate == null || rawRate === "") return null;
        const rate = Number(rawRate);
        if (!Number.isFinite(rate) || rate < 0) return null;
        total += quantities[index] * rate;
      }
      return total;
    };
    const short = tierCost("short", "");
    const long = tierCost("long", "long");
    if (short == null || long == null) return null;
    const original = (short + long) / 1e6;
    const multiplier = normalizeMultiplier(price.multiplier);
    return { original, billed: original * multiplier };
  }

  if (globalThis.__CODEX_RECONCILED_TOKEN_USAGE_TEST__) {
    Object.assign(globalThis.__CODEX_RECONCILED_TOKEN_USAGE_TEST__, {
      addRequestToAggregate,
      calculateAggregateCost,
      consumeMatchingLiveRequest,
      defaultPrices: DEFAULT_PRICES,
      deduplicateRolloutEvents,
      emptyAggregate,
      emptyPriceConfig,
      hasMatchingLiveRequest,
      normalizeAggregate,
      normalizeMultiplier,
      removeRequestFromAggregate,
      rememberLiveRequest,
      resetRecentLiveRequests: () => { recentLiveRequests.length = 0; },
      rolloutEventIdentity,
    });
    return;
  }

  function getDateKey(timestamp) {
    const date = new Date(timestamp);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function parseDateKey(dateKey) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateKey || ""));
    if (!match) return null;
    const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function shiftDateKey(dateKey, days) {
    const date = parseDateKey(dateKey);
    if (!date) return getDateKey(Date.now());
    date.setDate(date.getDate() + Number(days || 0));
    return getDateKey(date.getTime());
  }

  function minRetainedDateKey() {
    return shiftDateKey(getDateKey(Date.now()), -(RETAIN_DAYS - 1));
  }

  function clampDateKey(dateKey) {
    const today = getDateKey(Date.now());
    const minKey = minRetainedDateKey();
    if (!parseDateKey(dateKey)) return today;
    return dateKey < minKey ? minKey : dateKey > today ? today : dateKey;
  }

  function stripTrailingZero(value) {
    const digits = value >= 100 ? 0 : value >= 10 ? 1 : 2;
    return String(Number(value.toFixed(digits)));
  }

  function formatCompact(value) {
    const count = toCount(value);
    if (count < 1000) return String(count);
    if (count < 1_000_000) return `${stripTrailingZero(count / 1000)}K`;
    if (count < 1_000_000_000) return `${stripTrailingZero(count / 1_000_000)}M`;
    return `${stripTrailingZero(count / 1_000_000_000)}B`;
  }

  function formatExact(value) {
    return new Intl.NumberFormat("zh-CN").format(toCount(value));
  }

  function formatCost(value) {
    const n = Number(value);
    if (!Number.isFinite(n) || n <= 0) return "$0.00";
    if (n >= 100) return `$${n.toFixed(0)}`;
    if (n >= 1) return `$${n.toFixed(2)}`;
    return `$${n.toFixed(3)}`;
  }

  function formatBadgeCost(value) {
    const n = Number(value);
    return `$${(Number.isFinite(n) && n > 0 ? n : 0).toFixed(2)}`;
  }

  function formatTrendDateLabel(dateKey) {
    const date = parseDateKey(dateKey);
    if (!date) return dateKey;
    return `${date.getMonth() + 1}/${date.getDate()}`;
  }

  function formatDisplayDate(dateKey) {
    const date = parseDateKey(dateKey);
    if (!date) return dateKey;
    return new Intl.DateTimeFormat("zh-CN", {
      year: "numeric",
      month: "long",
      day: "numeric",
      weekday: "short",
    }).format(date);
  }

  function escapeHtml(text) {
    return String(text ?? "").replace(/[&<>"']/g, (ch) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    })[ch]);
  }

  function escapeAttribute(text) {
    return escapeHtml(text);
  }

  function pushDebug(entry) {
    debugRing.unshift({ at: new Date().toISOString(), ...entry });
    if (debugRing.length > DEBUG_LIMIT) debugRing.length = DEBUG_LIMIT;
  }

  // ---------------------------------------------------------------------------
  // 状态存取
  // ---------------------------------------------------------------------------

  function emptyState() {
    return { version: 1, days: {}, watermarks: {}, updatedAt: 0 };
  }

  function loadState() {
    for (const key of [STORAGE_KEY, ...LEGACY_STATE_KEYS]) {
      try {
        const parsed = JSON.parse(window.localStorage?.getItem(key) || "null");
        if (parsed && parsed.version === 1 && parsed.days && parsed.watermarks) {
          for (const models of Object.values(parsed.days)) {
            for (const [model, aggregate] of Object.entries(models || {})) {
              models[model] = normalizeAggregate(aggregate);
            }
          }
          if (key !== STORAGE_KEY) migratedStateKey = key;
          return parsed;
        }
      } catch (_) {
        // 损坏的状态继续尝试下一个兼容键。
      }
    }
    return emptyState();
  }

  function scheduleSave() {
    if (saveTimer) return;
    saveTimer = window.setTimeout(() => {
      saveTimer = 0;
      saveState();
    }, 500);
  }

  function saveState() {
    state.updatedAt = Date.now();
    try {
      window.localStorage?.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (_) {
      // Storage 不可用时保持内存统计。
    }
  }

  function pruneState() {
    const minKey = minRetainedDateKey();
    let changed = false;
    for (const key of Object.keys(state.days)) {
      if (key < minKey) {
        delete state.days[key];
        changed = true;
      }
    }
    const ids = Object.keys(state.watermarks);
    if (ids.length > WATERMARK_LIMIT) {
      ids.sort((a, b) => (state.watermarks[a].at || 0) - (state.watermarks[b].at || 0));
      for (const id of ids.slice(0, ids.length - WATERMARK_LIMIT)) {
        delete state.watermarks[id];
      }
      changed = true;
    }
    return changed;
  }

  function clonePrices(table) {
    const copy = {};
    for (const [model, p] of Object.entries(table)) copy[model] = { ...p };
    return copy;
  }

  function loadPrices() {
    for (const key of [PRICE_STORAGE_KEY, ...LEGACY_PRICE_KEYS]) {
      try {
        const parsed = JSON.parse(window.localStorage?.getItem(key) || "null");
        if (parsed && typeof parsed === "object") {
          if (key !== PRICE_STORAGE_KEY) migratedPriceKey = key;
          return clonePrices(parsed);
        }
      } catch (_) {
        // 无效配置继续尝试下一个兼容键。
      }
    }
    return clonePrices(DEFAULT_PRICES);
  }

  function savePrices() {
    try {
      window.localStorage?.setItem(PRICE_STORAGE_KEY, JSON.stringify(prices));
    } catch (_) {
      // 忽略。
    }
  }

  function cleanupLegacyStorage() {
    for (const key of [...LEGACY_KEYS, migratedStateKey, migratedPriceKey].filter(Boolean)) {
      try {
        window.localStorage?.removeItem(key);
      } catch (_) {
        // 忽略。
      }
    }
    try {
      window.sessionStorage?.removeItem("__myCodexTokenUsageRecentDetails");
      window.sessionStorage?.removeItem("__myCodexTokenUsageRecentDetailsResetFor019");
    } catch (_) {
      // 忽略。
    }
  }

  // ---------------------------------------------------------------------------
  // 模型跟踪：多通道采集 + Unknown 追认迁移
  // ---------------------------------------------------------------------------

  const modelByThread = new Map();
  let lastKnownModel = "";
  // 记到 Unknown 的增量流水，模型晚到时按线程迁移到正确模型。
  const unknownLedger = [];

  function normalizeThreadId(value) {
    if (typeof value !== "string") return "";
    const id = value.trim();
    if (!id || id.length > 160) return "";
    return id;
  }

  function migrateUnknown(threadId, model) {
    let migrated = 0;
    for (let index = unknownLedger.length - 1; index >= 0; index -= 1) {
      const entry = unknownLedger[index];
      if (entry.threadId !== threadId) continue;
      unknownLedger.splice(index, 1);
      const bucket = state.days[entry.day];
      const unknownAgg = bucket?.[UNKNOWN_MODEL];
      if (!unknownAgg) continue;
      const move = emptyAggregate();
      move.pricingBreakdownVersion = entry.pricingBreakdownVersion === 1 ? 1 : 0;
      for (const field of AGGREGATE_COUNT_FIELDS) {
        move[field] = Math.min(toCount(unknownAgg[field]), toCount(entry[field]));
        unknownAgg[field] = toCount(unknownAgg[field]) - move[field];
      }
      if (!unknownAgg.input && !unknownAgg.output && !unknownAgg.calls) delete bucket[UNKNOWN_MODEL];
      const agg = (bucket[model] = bucket[model] || emptyAggregate());
      for (const field of AGGREGATE_COUNT_FIELDS) agg[field] = toCount(agg[field]) + move[field];
      if (agg.pricingBreakdownVersion !== 1 || move.pricingBreakdownVersion !== 1) {
        agg.pricingBreakdownVersion = 0;
      }
      migrated += 1;
    }
    if (migrated) {
      pushDebug({ type: "unknown-migrated", threadId, model, entries: migrated });
      scheduleSave();
      scheduleRender();
    }
  }

  function rememberModel(threadId, model) {
    const name = normalizeModelName(model);
    if (!name) return;
    lastKnownModel = name;
    const id = normalizeThreadId(threadId);
    if (!id) return;
    const known = modelByThread.get(id);
    modelByThread.set(id, name);
    if (state.watermarks[id] && state.watermarks[id].model !== name) {
      state.watermarks[id].model = name;
      scheduleSave();
    }
    if (known !== name) migrateUnknown(id, name);
  }

  function modelForThread(threadId) {
    return (
      (threadId && modelByThread.get(threadId)) ||
      normalizeModelName(threadId && state.watermarks[threadId]?.model) ||
      lastKnownModel ||
      UNKNOWN_MODEL
    );
  }

  // 从任意消息对象提取模型名（覆盖 view→host 与 host→view 的各种嵌套形态）。
  function extractDirectModel(value) {
    if (!value || typeof value !== "object") return "";
    const candidates = [
      value.model,
      value.modelId,
      value.model_id,
      value.toModel,
      value.threadSettings?.model,
      value.settings?.model,
      value.collaborationMode?.settings?.model,
      value.collaboration_mode?.settings?.model,
      value.turn?.model,
      value.thread?.model,
      value.params?.model,
      value.params?.turn?.model,
      value.params?.thread?.model,
      value.params?.threadSettings?.model,
      value.params?.settings?.model,
      value.params?.collaborationMode?.settings?.model,
      value.request?.params?.model,
      value.request?.params?.threadSettings?.model,
      value.request?.params?.collaborationMode?.settings?.model,
      value.body?.model,
      value.body?.threadSettings?.model,
      value.body?.collaborationMode?.settings?.model,
    ];
    return candidates.map(normalizeModelName).find(Boolean) || "";
  }

  function extractThreadId(value) {
    if (!value || typeof value !== "object") return "";
    const candidates = [
      value.threadId,
      value.thread_id,
      value.sessionId,
      value.session_id,
      value.conversationId,
      value.conversation_id,
      value.thread?.id,
      value.turn?.threadId,
      value.params?.threadId,
      value.params?.thread_id,
      value.params?.sessionId,
      value.params?.conversationId,
      value.params?.conversation_id,
      value.params?.thread?.id,
      value.request?.params?.threadId,
      value.request?.params?.conversationId,
      value.body?.threadId,
      value.body?.conversationId,
    ];
    return candidates.map(normalizeThreadId).find(Boolean) || "";
  }

  function safeParseJson(text) {
    try {
      const parsed = JSON.parse(text);
      return parsed && typeof parsed === "object" ? parsed : null;
    } catch (_) {
      return null;
    }
  }

  function parseMaybeJsonObject(value) {
    if (!value) return null;
    if (typeof value === "object") return value;
    if (typeof value !== "string") return null;
    return safeParseJson(value);
  }

  // view→host 消息（codex-message-from-view / postMessage）中的模型采集。
  // start-turn-for-host 等消息在 token 事件之前到达，是模型归属的主要来源。
  function processModelPayload(payload, depth = 0) {
    if (!payload || depth > 3) return;
    if (typeof payload === "string") {
      if (payload.length < 10 || payload.length > 200000 || !payload.includes("model")) return;
      const parsed = safeParseJson(payload);
      if (parsed) processModelPayload(parsed, depth + 1);
      return;
    }
    if (Array.isArray(payload)) {
      for (const item of payload) processModelPayload(item, depth + 1);
      return;
    }
    if (typeof payload !== "object") return;
    const model = extractDirectModel(payload);
    if (model) rememberModel(extractThreadId(payload), model);
    const body = parseMaybeJsonObject(payload.body);
    if (body && body !== payload) processModelPayload(body, depth + 1);
    if (payload.message && typeof payload.message === "object") processModelPayload(payload.message, depth + 1);
  }

  // ---------------------------------------------------------------------------
  // 记账核心：按线程累计水位差分（exactly-once）
  // ---------------------------------------------------------------------------

  function pickField(obj, ...names) {
    for (const name of names) {
      if (obj && obj[name] != null) return toCount(obj[name]);
    }
    return 0;
  }

  function normalizeTotals(raw) {
    if (!raw || typeof raw !== "object") return null;
    const input = pickField(raw, "inputTokens", "input_tokens");
    const cachedInput = pickField(raw, "cachedInputTokens", "cached_input_tokens");
    const cacheWrite = pickField(raw, "cacheWriteInputTokens", "cache_write_input_tokens", "cacheCreationInputTokens", "cache_creation_input_tokens");
    const output = pickField(raw, "outputTokens", "output_tokens");
    const reasoning = pickField(raw, "reasoningOutputTokens", "reasoning_output_tokens");
    const total = pickField(raw, "totalTokens", "total_tokens");
    if (!input && !output && !total) return null;
    return { input, cachedInput, cacheWrite, output, reasoning, total };
  }

  function recordUsage(threadId, tokenUsage) {
    const totals = normalizeTotals(tokenUsage?.total ?? tokenUsage?.total_token_usage);
    const last = normalizeTotals(tokenUsage?.last ?? tokenUsage?.last_token_usage);
    if (!totals) return;
    const id = normalizeThreadId(threadId);
    const model = modelForThread(id);
    const now = Date.now();
    const mark = id ? state.watermarks[id] : null;

    let delta;
    let isNewRequest = false;
    if (mark) {
      delta = {
        input: totals.input - toCount(mark.totals.input),
        cachedInput: totals.cachedInput - toCount(mark.totals.cachedInput),
        cacheWrite: totals.cacheWrite - toCount(mark.totals.cacheWrite),
        output: totals.output - toCount(mark.totals.output),
      };
      if (Object.values(delta).some((value) => value < 0)) {
        // 线程回滚或状态重建：以新水位为准，不计负增量。
        delta = null;
      } else {
        isNewRequest = Object.values(delta).some((value) => value > 0);
      }
    } else {
      // 首次见到该线程：只记本次请求（last），历史累计入水位。
      delta = last
        ? { input: last.input, cachedInput: last.cachedInput, cacheWrite: last.cacheWrite, output: last.output }
        : null;
      isNewRequest = !!delta;
    }

    if (id) {
      state.watermarks[id] = {
        totals: { input: totals.input, cachedInput: totals.cachedInput, cacheWrite: totals.cacheWrite, output: totals.output },
        model,
        at: now,
      };
    }

    if (last) {
      lastRequest = { model, ...last, at: now };
    }

    if (isNewRequest && last) {
      const day = getDateKey(now);
      const bucket = (state.days[day] = state.days[day] || {});
      const agg = (bucket[model] = bucket[model] || emptyAggregate());
      addRequestToAggregate(agg, last, priceFor(model));
      rememberLiveRequest(model, last, now);
      if (fullReconcileActive) {
        pendingLiveDuringFullReconcile.push({ model, usage: { ...last }, timestampMs: now });
      }
      if (model === UNKNOWN_MODEL && id) {
        const requestAggregate = addRequestToAggregate(emptyAggregate(), last, priceFor(model));
        unknownLedger.push({
          threadId: id,
          day,
          ...requestAggregate,
        });
        if (unknownLedger.length > UNKNOWN_MIGRATE_LIMIT) unknownLedger.shift();
      }
      pushDebug({
        type: "usage",
        threadId: id,
        model,
        delta: { input: delta.input, cachedInput: delta.cachedInput, output: delta.output },
        last,
        totals,
        firstSight: !mark,
      });
    } else {
      pushDebug({ type: "usage-skip", threadId: id, reason: mark ? "no-delta" : "no-last", totals });
    }

    pruneState();
    scheduleSave();
    scheduleRender();
  }

  // ---------------------------------------------------------------------------
  // 采集：MessagePort tee + window message + codex-message-from-view
  // ---------------------------------------------------------------------------

  function handleRpcMessage(message) {
    const method = message?.method;
    if (typeof method !== "string") return;
    const params = message.params;
    switch (method) {
      case "thread/tokenUsage/updated": {
        recordUsage(extractThreadId(params), params?.tokenUsage ?? params?.token_usage ?? params);
        return;
      }
      case "thread/started": {
        rememberModel(extractThreadId(params), extractDirectModel(params?.thread || params));
        return;
      }
      case "turn/started": {
        rememberModel(extractThreadId(params), extractDirectModel(params?.turn || params));
        return;
      }
      case "thread/settings/updated": {
        rememberModel(extractThreadId(params), extractDirectModel(params?.threadSettings || params));
        return;
      }
      case "model/rerouted": {
        rememberModel(extractThreadId(params), normalizeModelName(params?.toModel) || extractDirectModel(params));
        return;
      }
      case "codex/event/token_count": {
        const info = params?.info ?? params?.msg?.info;
        if (info) {
          recordUsage(extractThreadId(params), {
            total: info.total_token_usage,
            last: info.last_token_usage,
          });
        }
        return;
      }
      default:
        return;
    }
  }

  function inspectData(data, depth = 0) {
    if (destroyed || data == null || depth > 3) return;
    if (typeof data === "string") {
      if (data.length < 20 || data.length > 500000) return;
      const hasUsage = data.includes("tokenUsage") || data.includes("token_count");
      if (!hasUsage && !data.includes('"method"') && !data.includes("model")) return;
      const parsed = safeParseJson(data);
      if (parsed) inspectData(parsed, depth + 1);
      return;
    }
    if (Array.isArray(data)) {
      for (const item of data) inspectData(item, depth + 1);
      return;
    }
    if (typeof data !== "object") return;
    if (typeof data.method === "string") {
      handleRpcMessage(data);
      // JSON-RPC 消息也可能携带模型字段（如 turn/started）。
      processModelPayload(data, 2);
      return;
    }
    processModelPayload(data, 2);
    // 常见包装层：{message: {...}} / {data: {...}} / {payload: {...}}
    for (const key of ["message", "data", "payload", "params", "detail"]) {
      if (data[key] && typeof data[key] === "object") inspectData(data[key], depth + 1);
    }
  }

  const teeCleanups = [];
  const MESSAGE_PORT_DISPATCHER_KEY = "__codexReconciledTokenUsageMessagePortDispatcher";

  function installMessagePortTee() {
    const proto = window.MessagePort?.prototype;
    if (!proto) return;
    let dispatcher = window[MESSAGE_PORT_DISPATCHER_KEY];
    if (!dispatcher) {
      const originalAdd = proto.addEventListener;
      const descriptor = Object.getOwnPropertyDescriptor(proto, "onmessage");
      dispatcher = { dispatch: () => {} };
      const ensureTee = (port) => {
        if (!port || port.__codexReconciledTokenUsageTeed) return;
        port.__codexReconciledTokenUsageTeed = true;
        try {
          originalAdd.call(port, "message", (event) => dispatcher.dispatch(event.data));
        } catch (_) {
          // 采集失败不影响应用消息。
        }
      };
      proto.addEventListener = function addEventListener(type, listener, options) {
        if (type === "message") ensureTee(this);
        return originalAdd.call(this, type, listener, options);
      };
      if (descriptor?.set && descriptor?.get) {
        Object.defineProperty(proto, "onmessage", {
          configurable: true,
          get() {
            return descriptor.get.call(this);
          },
          set(fn) {
            ensureTee(this);
            return descriptor.set.call(this, fn);
          },
        });
      }
      window[MESSAGE_PORT_DISPATCHER_KEY] = dispatcher;
    }
    const dispatch = (data) => {
      try {
        inspectData(data);
      } catch (_) {
        // 采集失败不影响应用消息。
      }
    };
    dispatcher.dispatch = dispatch;
    teeCleanups.push(() => {
      if (dispatcher.dispatch === dispatch) dispatcher.dispatch = () => {};
    });
  }

  function installMessageListeners() {
    const onWindowMessage = (event) => {
      try {
        inspectData(event.data);
      } catch (_) {
        // 忽略无关消息。
      }
    };
    // Codex++ 注入器转发的 view→host 消息（含 start-turn-for-host 等带模型的消息）。
    const onViewMessage = (event) => {
      try {
        processModelPayload(event.detail);
        inspectData(event.detail);
      } catch (_) {
        // 忽略。
      }
    };
    window.addEventListener("message", onWindowMessage, true);
    window.addEventListener("codex-message-from-view", onViewMessage, true);
    teeCleanups.push(() => {
      window.removeEventListener("message", onWindowMessage, true);
      window.removeEventListener("codex-message-from-view", onViewMessage, true);
    });
  }

  // ---------------------------------------------------------------------------
  // 成本估算与聚合
  // ---------------------------------------------------------------------------

  function priceFor(model) {
    const normalized = String(model || "").toLowerCase();
    return prices[model] || prices[normalized] || null;
  }

  function costFor(model, agg) {
    const p = priceFor(model);
    return calculateAggregateCost(agg, p);
  }

  function summarizeDay(dateKey) {
    const models = state.days[dateKey] || {};
    const rows = [];
    const total = {
      input: 0, cachedInput: 0, cacheWrite: 0, output: 0, calls: 0,
      successCalls: 0, failedCalls: 0, retryCalls: 0, missingUsage: 0,
      billed: 0, original: 0, unpricedModels: [],
    };
    for (const [model, agg] of Object.entries(models)) {
      if (!toCount(agg.input) && !toCount(agg.output) && !toCount(agg.calls)) continue;
      const cost = costFor(model, agg);
      const uncached = Math.max(0, toCount(agg.input) - toCount(agg.cachedInput) - toCount(agg.cacheWrite));
      rows.push({ model, ...agg, uncached, cost });
      total.input += toCount(agg.input);
      total.cachedInput += toCount(agg.cachedInput);
      total.cacheWrite += toCount(agg.cacheWrite);
      total.output += toCount(agg.output);
      total.calls += toCount(agg.calls);
      total.successCalls += toCount(agg.successCalls);
      total.failedCalls += toCount(agg.failedCalls);
      total.retryCalls += toCount(agg.retryCalls);
      total.missingUsage += toCount(agg.missingUsage);
      if (cost) {
        total.billed += cost.billed;
        total.original += cost.original;
      } else {
        total.unpricedModels.push(model);
      }
    }
    rows.sort((a, b) => b.input - a.input);
    total.uncached = Math.max(0, total.input - total.cachedInput - total.cacheWrite);
    total.tokens = total.input + total.output;
    total.priced = total.unpricedModels.length === 0;
    return { rows, total };
  }

  function buildTrendData(endDateKey) {
    // 与 daily 一致：趋势窗口以选中日期为终点，翻看历史时曲线随之平移。
    const endKey = clampDateKey(endDateKey);
    const items = [];
    for (let offset = TREND_DAYS - 1; offset >= 0; offset -= 1) {
      const dateKey = shiftDateKey(endKey, -offset);
      const summary = summarizeDay(dateKey);
      items.push({
        dateKey,
        label: formatTrendDateLabel(dateKey),
        total: summary.total.tokens,
        calls: summary.total.calls,
        cost: summary.total.billed,
        active: dateKey === endKey,
      });
    }
    const maxTotal = Math.max(1, ...items.map((item) => item.total));
    return { items, maxTotal };
  }

  function trendPoints(trend, width = 300, height = 82, padding = 8) {
    const items = trend?.items || [];
    if (!items.length) return [];
    const usableWidth = Math.max(1, width - padding * 2);
    const usableHeight = Math.max(1, height - padding * 2);
    const denominator = Math.max(1, items.length - 1);
    return items.map((item, index) => ({
      ...item,
      x: padding + (usableWidth * index) / denominator,
      y: padding + usableHeight - (usableHeight * item.total) / Math.max(1, trend.maxTotal),
    }));
  }

  function trendPath(points) {
    if (!points.length) return "";
    if (points.length === 1) return `M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}`;
    let path = `M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}`;
    for (let index = 1; index < points.length; index += 1) {
      const previous = points[index - 1];
      const current = points[index];
      const controlX = (previous.x + current.x) / 2;
      path += ` C ${controlX.toFixed(1)} ${previous.y.toFixed(1)}, ${controlX.toFixed(1)} ${current.y.toFixed(1)}, ${current.x.toFixed(1)} ${current.y.toFixed(1)}`;
    }
    return path;
  }

  // ---------------------------------------------------------------------------
  // UI：样式（参考 daily 脚本，跟随应用主题变量）
  // ---------------------------------------------------------------------------

  const STYLE_TEXT = `
    #${ROOT_ID} {
      position: relative;
      display: flex;
      flex: 0 0 auto;
      align-items: center;
      pointer-events: auto;
      -webkit-app-region: no-drag;
      z-index: 2147483600;
      font-family: ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    #${ROOT_ID} .mcts-trigger {
      box-sizing: border-box;
      height: 31px;
      min-width: 94px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      padding: 0 10px;
      border: 1px solid var(--color-token-border, rgba(127, 127, 127, 0.22));
      border-radius: 9px;
      color: var(--color-token-foreground, #202020);
      background: var(--color-token-background-secondary, rgba(127, 127, 127, 0.08));
      box-shadow: none;
      cursor: default;
      font: inherit;
      font-size: 12px;
      line-height: 1;
      white-space: nowrap;
      user-select: none;
      outline: none;
      transition: background 120ms ease, border-color 120ms ease;
      -webkit-app-region: no-drag;
    }
    #${ROOT_ID} .mcts-trigger:hover,
    #${ROOT_ID} .mcts-trigger:focus-visible,
    #${ROOT_ID}.is-open .mcts-trigger {
      background: var(--color-token-background-tertiary, rgba(127, 127, 127, 0.15));
      border-color: var(--color-token-border-strong, rgba(127, 127, 127, 0.36));
    }
    #${ROOT_ID} .mcts-sigma {
      width: 16px;
      height: 16px;
      display: inline-grid;
      place-items: center;
      border-radius: 5px;
      background: rgba(74, 144, 226, 0.14);
      color: #4a90e2;
      font-size: 12px;
      font-weight: 700;
      line-height: 1;
    }
    #${ROOT_ID} .mcts-total {
      font-variant-numeric: tabular-nums;
      font-weight: 600;
      letter-spacing: 0.01em;
    }
    #${ROOT_ID} .mcts-cost {
      color: #2f7dd1;
      font-variant-numeric: tabular-nums;
      font-weight: 650;
    }
    #${PANEL_ID} {
      position: fixed;
      width: min(390px, calc(100vw - 24px));
      box-sizing: border-box;
      padding: 14px;
      border: 1px solid var(--color-token-border, rgba(127, 127, 127, 0.24));
      border-radius: 12px 0 0 12px;
      color: var(--color-token-foreground, #202020);
      background: var(--color-token-background, #ffffff);
      box-shadow: 0 14px 40px rgba(0, 0, 0, 0.18);
      opacity: 0;
      visibility: hidden;
      overflow: auto;
      overscroll-behavior: contain;
      transform: translateX(8px);
      transition: opacity 120ms ease, visibility 120ms ease, transform 120ms ease;
      pointer-events: none;
      cursor: default;
      z-index: 2147483647;
      font-family: ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      font-size: 12px;
      -webkit-app-region: no-drag;
    }
    #${PANEL_ID}.is-visible {
      opacity: 1;
      visibility: visible;
      transform: translateX(0);
      pointer-events: auto;
    }
    #${PANEL_ID} .mcts-heading {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      margin-bottom: 12px;
    }
    #${PANEL_ID} .mcts-title {
      font-size: 13px;
      font-weight: 650;
    }
    #${PANEL_ID} .mcts-head-actions {
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }
    #${PANEL_ID} .mcts-price-toggle {
      height: 29px;
      display: inline-flex;
      align-items: center;
      padding: 0 8px;
      border: 1px solid var(--color-token-border, rgba(127, 127, 127, 0.2));
      border-radius: 8px;
      color: var(--color-token-foreground-secondary, #737373);
      background: var(--color-token-background-secondary, rgba(127, 127, 127, 0.07));
      cursor: pointer;
      font: inherit;
      font-size: 11px;
      font-weight: 600;
    }
    #${PANEL_ID} .mcts-price-toggle:hover,
    #${PANEL_ID} .mcts-price-toggle[aria-expanded="true"] {
      color: var(--color-token-foreground, #202020);
      border-color: rgba(74, 144, 226, 0.38);
      background: rgba(74, 144, 226, 0.11);
    }
    #${PANEL_ID} .mcts-date-nav {
      display: inline-flex;
      align-items: center;
      gap: 3px;
      padding: 2px;
      border: 1px solid var(--color-token-border, rgba(127, 127, 127, 0.2));
      border-radius: 8px;
      background: var(--color-token-background-secondary, rgba(127, 127, 127, 0.07));
    }
    #${PANEL_ID} .mcts-date-button {
      width: 23px;
      height: 23px;
      display: inline-grid;
      place-items: center;
      padding: 0;
      border: 0;
      border-radius: 6px;
      color: var(--color-token-foreground-secondary, #737373);
      background: transparent;
      cursor: pointer;
      font: inherit;
      font-size: 16px;
      line-height: 1;
    }
    #${PANEL_ID} .mcts-date-button:hover:not(:disabled) {
      color: var(--color-token-foreground, #202020);
      background: var(--color-token-background-tertiary, rgba(127, 127, 127, 0.14));
    }
    #${PANEL_ID} .mcts-date-button:disabled {
      cursor: default;
      opacity: 0.28;
    }
    #${PANEL_ID} .mcts-date-input {
      width: 105px;
      height: 23px;
      box-sizing: border-box;
      padding: 0 2px;
      border: 0;
      outline: 0;
      color: var(--color-token-foreground-secondary, #737373);
      background: transparent;
      cursor: pointer;
      font: inherit;
      font-size: 11px;
      line-height: 23px;
      color-scheme: light dark;
    }
    #${PANEL_ID} .mcts-summary {
      display: flex;
      align-items: flex-end;
      justify-content: space-between;
      gap: 12px;
      margin: 2px 0 12px;
    }
    #${PANEL_ID} .mcts-total-block {
      flex: 1 1 auto;
      min-width: 0;
    }
    #${PANEL_ID} .mcts-total-label {
      margin-bottom: 4px;
      color: var(--color-token-foreground-secondary, #737373);
      font-size: 11px;
      font-weight: 600;
    }
    #${PANEL_ID} .mcts-hero {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-size: 26px;
      line-height: 1.1;
      font-weight: 750;
      font-variant-numeric: tabular-nums;
      letter-spacing: -0.03em;
    }
    #${PANEL_ID} .mcts-cost-box {
      flex: 0 0 auto;
      min-width: 124px;
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: 10px;
      padding: 10px 11px;
      border: 1px solid rgba(74, 144, 226, 0.22);
      border-radius: 12px;
      background: rgba(74, 144, 226, 0.1);
    }
    #${PANEL_ID} .mcts-cost-label {
      color: var(--color-token-foreground-secondary, #737373);
      font-size: 11px;
      font-weight: 600;
      white-space: nowrap;
    }
    #${PANEL_ID} .mcts-cost-value {
      color: #2f7dd1;
      font-size: 15px;
      font-weight: 750;
      font-variant-numeric: tabular-nums;
      white-space: nowrap;
    }
    @media (max-width: 360px) {
      #${PANEL_ID} .mcts-summary {
        align-items: stretch;
        flex-direction: column;
      }
      #${PANEL_ID} .mcts-cost-box {
        width: 100%;
        box-sizing: border-box;
      }
    }
    #${PANEL_ID} .mcts-grid {
      display: grid;
      grid-template-columns: 1fr auto;
      gap: 8px 16px;
      padding: 11px 0;
      border-top: 1px solid var(--color-token-border, rgba(127, 127, 127, 0.18));
      border-bottom: 1px solid var(--color-token-border, rgba(127, 127, 127, 0.18));
      font-size: 12px;
    }
    #${PANEL_ID} .mcts-label {
      color: var(--color-token-foreground-secondary, #737373);
    }
    #${PANEL_ID} .mcts-value {
      text-align: right;
      font-variant-numeric: tabular-nums;
      font-weight: 550;
    }
    #${PANEL_ID} .mcts-trend {
      position: relative;
      margin-top: 11px;
      padding: 10px 11px 9px;
      border: 1px solid var(--color-token-border, rgba(127, 127, 127, 0.18));
      border-radius: 10px;
      background: var(--color-token-background-secondary, rgba(127, 127, 127, 0.06));
    }
    #${PANEL_ID} .mcts-trend-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      margin-bottom: 6px;
      font-size: 11px;
    }
    #${PANEL_ID} .mcts-trend-title {
      color: var(--color-token-foreground, #202020);
      font-weight: 650;
    }
    #${PANEL_ID} .mcts-trend-peak {
      color: var(--color-token-foreground-secondary, #737373);
      font-variant-numeric: tabular-nums;
    }
    #${PANEL_ID} .mcts-trend-svg {
      display: block;
      width: 100%;
      height: 88px;
      overflow: visible;
    }
    #${PANEL_ID} .mcts-trend-labels {
      display: grid;
      grid-template-columns: repeat(${TREND_DAYS}, 1fr);
      gap: 4px;
      margin-top: 4px;
      color: var(--color-token-foreground-secondary, #737373);
      font-size: 10px;
      font-variant-numeric: tabular-nums;
      text-align: center;
    }
    #${PANEL_ID} .mcts-trend-labels span.is-active {
      color: var(--color-token-foreground, #202020);
      font-weight: 650;
    }
    #${PANEL_ID} .mcts-trend-point {
      cursor: default;
      outline: none;
    }
    #${PANEL_ID} .mcts-trend-point:hover,
    #${PANEL_ID} .mcts-trend-point:focus {
      filter: drop-shadow(0 0 4px rgba(82, 124, 255, 0.42));
    }
    #${PANEL_ID} .mcts-trend-tooltip {
      position: absolute;
      z-index: 5;
      width: max-content;
      min-width: 158px;
      max-width: 210px;
      padding: 9px 10px;
      border: 1px solid color-mix(in srgb, var(--color-token-border, rgba(127, 127, 127, 0.18)) 82%, transparent);
      border-radius: 11px;
      background: color-mix(in srgb, var(--color-token-background, #fff) 94%, transparent);
      box-shadow: 0 10px 28px rgba(0, 0, 0, 0.16);
      color: var(--color-token-foreground, #202020);
      font-size: 11px;
      line-height: 1.35;
      pointer-events: none;
      transform: translate(-50%, calc(-100% - 10px));
    }
    #${PANEL_ID} .mcts-trend-tooltip[hidden] {
      display: none;
    }
    #${PANEL_ID} .mcts-trend-tooltip-date {
      margin-bottom: 6px;
      font-weight: 700;
    }
    #${PANEL_ID} .mcts-trend-tooltip-row {
      display: flex;
      justify-content: space-between;
      gap: 14px;
      margin-top: 3px;
      color: var(--color-token-foreground-secondary, #737373);
    }
    #${PANEL_ID} .mcts-trend-tooltip-row strong {
      color: var(--color-token-foreground, #202020);
      font-weight: 700;
      font-variant-numeric: tabular-nums;
      white-space: nowrap;
    }
    #${PANEL_ID} .mcts-models,
    #${PANEL_ID} .mcts-price-panel {
      margin-top: 11px;
      padding: 10px 11px;
      border: 1px solid var(--color-token-border, rgba(127, 127, 127, 0.18));
      border-radius: 10px;
      background: var(--color-token-background-secondary, rgba(127, 127, 127, 0.055));
    }
    #${PANEL_ID} .mcts-section-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      margin-bottom: 8px;
      font-size: 11px;
    }
    #${PANEL_ID} .mcts-section-title {
      font-weight: 650;
    }
    #${PANEL_ID} .mcts-section-meta {
      color: var(--color-token-foreground-secondary, #737373);
      font-variant-numeric: tabular-nums;
    }
    #${PANEL_ID} .mcts-model-list {
      display: grid;
      gap: 7px;
    }
    #${PANEL_ID} .mcts-model-row {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 4px 10px;
      align-items: center;
      font-size: 11px;
    }
    #${PANEL_ID} .mcts-model-name {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-weight: 600;
    }
    #${PANEL_ID} .mcts-model-detail {
      grid-column: 1 / -1;
      color: var(--color-token-foreground-secondary, #737373);
      font-variant-numeric: tabular-nums;
      font-size: 10.5px;
    }
    #${PANEL_ID} .mcts-model-cost {
      color: var(--color-token-foreground, #202020);
      font-weight: 650;
      font-variant-numeric: tabular-nums;
    }
    #${PANEL_ID} .mcts-model-bar {
      grid-column: 1 / -1;
      height: 5px;
      overflow: hidden;
      border-radius: 999px;
      background: rgba(127, 127, 127, 0.14);
    }
    #${PANEL_ID} .mcts-model-fill {
      display: block;
      height: 100%;
      border-radius: inherit;
      background: linear-gradient(90deg, #3BA7FF, #8D6BFF);
    }
    #${PANEL_ID} .mcts-price-panel[hidden] {
      display: none;
    }
    #${PANEL_ID} .mcts-price-help {
      margin-bottom: 9px;
      color: var(--color-token-foreground-secondary, #737373);
      font-size: 10.5px;
      line-height: 1.45;
    }
    #${PANEL_ID} .mcts-price-add {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 6px;
      margin-bottom: 9px;
    }
    #${PANEL_ID} .mcts-price-model-input {
      box-sizing: border-box;
      min-width: 0;
      height: 27px;
      padding: 0 7px;
      border: 1px solid var(--color-token-border, rgba(127, 127, 127, 0.2));
      border-radius: 7px;
      color: var(--color-token-foreground, #202020);
      background: var(--color-token-background, #fff);
      font: inherit;
      font-size: 11px;
      outline: none;
    }
    #${PANEL_ID} .mcts-price-model-input:focus {
      border-color: rgba(74, 144, 226, 0.48);
    }
    #${PANEL_ID} .mcts-price-add-button {
      height: 27px;
      padding: 0 8px;
      border: 1px solid var(--color-token-border, rgba(127, 127, 127, 0.2));
      border-radius: 7px;
      color: var(--color-token-foreground, #202020);
      background: var(--color-token-background-secondary, rgba(127, 127, 127, 0.08));
      cursor: pointer;
      font: inherit;
      font-size: 11px;
      font-weight: 600;
    }
    #${PANEL_ID} .mcts-price-add-button:hover {
      border-color: rgba(74, 144, 226, 0.38);
      background: rgba(74, 144, 226, 0.11);
    }
    #${PANEL_ID} .mcts-price-remove {
      width: 24px;
      height: 24px;
      display: inline-grid;
      place-items: center;
      padding: 0;
      border: 1px solid transparent;
      border-radius: 7px;
      color: var(--color-token-foreground-secondary, #737373);
      background: transparent;
      cursor: pointer;
      font: inherit;
      font-size: 13px;
      line-height: 1;
    }
    #${PANEL_ID} .mcts-price-remove:hover {
      color: #d05050;
      border-color: rgba(208, 80, 80, 0.18);
      background: rgba(208, 80, 80, 0.12);
    }
    #${PANEL_ID} .mcts-price-body {
      display: grid;
      gap: 9px;
      max-height: 260px;
      overflow: auto;
      padding-right: 2px;
    }
    #${PANEL_ID} .mcts-price-row {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 6px;
      align-items: start;
      padding-bottom: 9px;
      border-bottom: 1px solid var(--color-token-border, rgba(127, 127, 127, 0.13));
    }
    #${PANEL_ID} .mcts-price-row:last-child {
      padding-bottom: 0;
      border-bottom: 0;
    }
    #${PANEL_ID} .mcts-price-name {
      box-sizing: border-box;
      width: 100%;
      min-width: 0;
      height: 24px;
      padding: 0 7px;
      border: 1px solid var(--color-token-border, rgba(127, 127, 127, 0.18));
      border-radius: 7px;
      color: var(--color-token-foreground, #202020);
      background: var(--color-token-background, #fff);
      outline: none;
      font: inherit;
      font-size: 11px;
      font-weight: 650;
    }
    #${PANEL_ID} .mcts-price-name:focus {
      border-color: rgba(74, 144, 226, 0.48);
    }
    #${PANEL_ID} .mcts-price-grid {
      grid-column: 1 / -1;
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 6px;
    }
    #${PANEL_ID} .mcts-price-field {
      display: grid;
      gap: 3px;
      color: var(--color-token-foreground-secondary, #737373);
      font-size: 10px;
    }
    #${PANEL_ID} .mcts-price-input {
      box-sizing: border-box;
      width: 100%;
      min-width: 0;
      height: 27px;
      padding: 0 7px;
      border: 1px solid var(--color-token-border, rgba(127, 127, 127, 0.2));
      border-radius: 7px;
      color: var(--color-token-foreground, #202020);
      background: var(--color-token-background, #fff);
      font: inherit;
      font-size: 11px;
      font-variant-numeric: tabular-nums;
      outline: none;
    }
    #${PANEL_ID} .mcts-price-input:focus {
      border-color: rgba(74, 144, 226, 0.48);
    }
    #${PANEL_ID} .mcts-foot {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      margin-top: 11px;
      color: var(--color-token-foreground-secondary, #737373);
      font-size: 10.5px;
      line-height: 1.4;
    }
  `;

  // ---------------------------------------------------------------------------
  // UI：标题栏挂载（参考 daily 脚本）
  // ---------------------------------------------------------------------------

  function isTopToolbarRect(rect) {
    return rect.width > 0 && rect.height > 0 && rect.top >= 0 && rect.top < 90 && rect.bottom < 120;
  }

  function findToolbarContainer(fromNode) {
    for (let current = fromNode?.parentElement; current && current !== document.body; current = current.parentElement) {
      const style = getComputedStyle(current);
      const rect = current.getBoundingClientRect();
      if (
        style.display === "flex" &&
        isTopToolbarRect(rect) &&
        rect.height > 20 &&
        rect.height < 72 &&
        current.children.length > 1
      ) {
        return current;
      }
    }
    return null;
  }

  function findHelpButton() {
    const buttons = Array.from(document.querySelectorAll("button, [role='button']"));
    return (
      buttons.find((button) => {
        if (root?.contains(button) || panel?.contains(button)) return false;
        const rect = button.getBoundingClientRect();
        if (!isTopToolbarRect(rect)) return false;
        const label = [button.getAttribute("aria-label"), button.getAttribute("title"), button.textContent]
          .filter(Boolean)
          .join(" ")
          .trim();
        return /(^|\s)(help|帮助|\?)(\s|$)/i.test(label);
      }) || null
    );
  }

  function findToolbarTarget() {
    const helpButton = findHelpButton();
    const helpToolbar = findToolbarContainer(helpButton);
    if (helpButton && helpToolbar) return { toolbar: helpToolbar, anchor: helpButton };

    // Codex++ 注入的标题栏菜单按钮（daily 脚本验证过的锚点）。
    const plusMenu = document.getElementById("codex-plus-menu");
    if (plusMenu) {
      const plusToolbar = findToolbarContainer(plusMenu);
      if (plusToolbar) return { toolbar: plusToolbar, anchor: plusMenu };
    }
    return null;
  }

  function bindToolbarHover(toolbar) {
    if (!toolbar) return;
    const existing = toolbar.__codexReconciledTokenUsageHover;
    if (existing?.enter) toolbar.removeEventListener("pointerenter", existing.enter);
    if (existing?.leave) toolbar.removeEventListener("pointerleave", existing.leave);
    const enter = () => {
      if (!root?.hidden) showPanel();
    };
    const leave = () => schedulePanelClose();
    toolbar.addEventListener("pointerenter", enter);
    toolbar.addEventListener("pointerleave", leave);
    toolbar.__codexReconciledTokenUsageHover = { enter, leave };
    hoverToolbar = toolbar;
  }

  function clearFallbackPosition() {
    if (!root) return;
    root.style.removeProperty("position");
    root.style.removeProperty("top");
    root.style.removeProperty("right");
  }

  function mountRoot() {
    if (!root || destroyed || !document.body) return;
    const target = findToolbarTarget();

    if (target?.toolbar) {
      if (root.parentElement !== target.toolbar || root.previousElementSibling !== target.anchor) {
        target.anchor.after(root);
      }
      // 清除可能残留的回退定位，否则 fixed 样式会把徽章钉在屏幕右缘。
      clearFallbackPosition();
      bindToolbarHover(target.toolbar);
      root.hidden = false;
      if (panel?.classList.contains("is-visible")) positionPanel();
      return;
    }

    // 找不到标题栏时隐藏徽章，等 MutationObserver 下次重试（与 daily 行为一致）。
    root.hidden = true;
    hidePanel();
  }

  // ---------------------------------------------------------------------------
  // UI：面板显隐
  // ---------------------------------------------------------------------------

  function positionPanel() {
    if (!root || !panel) return;
    const rect = root.getBoundingClientRect();
    const top = Math.max(48, Math.round(rect.bottom + 8));
    panel.style.top = `${top}px`;
    panel.style.right = "0px";
    panel.style.bottom = "12px";
    panel.style.maxHeight = `calc(100vh - ${top + 12}px)`;
  }

  function cancelPanelClose() {
    if (closeTimer) {
      window.clearTimeout(closeTimer);
      closeTimer = null;
    }
  }

  function showPanel() {
    if (!root || !panel) return;
    cancelPanelClose();
    positionPanel();
    root.classList.add("is-open");
    root.querySelector(".mcts-trigger")?.setAttribute("aria-expanded", "true");
    panel.classList.add("is-visible");
    renderPanel();
  }

  function hidePanel() {
    if (!root || !panel) return;
    cancelPanelClose();
    root.classList.remove("is-open");
    root.querySelector(".mcts-trigger")?.setAttribute("aria-expanded", "false");
    panel.classList.remove("is-visible");
  }

  function schedulePanelClose() {
    cancelPanelClose();
    closeTimer = window.setTimeout(() => {
      if (!pinnedOpen && !root?.matches(":hover") && !panel?.matches(":hover")) {
        hidePanel();
      }
    }, 140);
  }

  function handleDocumentPointerDown(event) {
    if (!pinnedOpen || root?.contains(event.target) || panel?.contains(event.target)) return;
    pinnedOpen = false;
    hidePanel();
  }

  // ---------------------------------------------------------------------------
  // UI：构建与渲染
  // ---------------------------------------------------------------------------

  function installStyle() {
    if (document.getElementById(STYLE_ID)) {
      styleEl = document.getElementById(STYLE_ID);
      return;
    }
    styleEl = document.createElement("style");
    styleEl.id = STYLE_ID;
    styleEl.textContent = STYLE_TEXT;
    (document.head || document.documentElement).appendChild(styleEl);
  }

  function buildUi() {
    if (document.getElementById(ROOT_ID)) {
      root = document.getElementById(ROOT_ID);
      panel = document.getElementById(PANEL_ID);
      return;
    }

    root = document.createElement("div");
    root.id = ROOT_ID;
    root.innerHTML = `
      <button class="mcts-trigger" type="button" aria-expanded="false" aria-label="Token 统计">
        <span class="mcts-sigma">☃</span>
        <span class="mcts-total">0</span>
        <span class="mcts-cost">$0.00</span>
      </button>
    `;

    panel = document.createElement("div");
    panel.id = PANEL_ID;
    panel.innerHTML = `
      <div class="mcts-heading">
        <span class="mcts-title">Token 统计</span>
        <span class="mcts-head-actions">
          <button class="mcts-price-toggle" type="button" data-action="toggle-prices" aria-expanded="false">价格</button>
          <span class="mcts-date-nav">
            <button class="mcts-date-button" type="button" data-action="previous-day" aria-label="查看前一天">‹</button>
            <input class="mcts-date-input" type="date" aria-label="选择统计日期">
            <button class="mcts-date-button" type="button" data-action="next-day" aria-label="查看后一天">›</button>
          </span>
        </span>
      </div>
      <div class="mcts-summary">
        <div class="mcts-total-block">
          <div class="mcts-total-label">累计 Token</div>
          <div class="mcts-hero" data-field="hero">0</div>
        </div>
        <div class="mcts-cost-box">
          <span class="mcts-cost-label">估算金额</span>
          <span class="mcts-cost-value" data-field="cost">$0.00</span>
        </div>
      </div>
      <div class="mcts-grid">
        <span class="mcts-label">输入（非缓存）</span><span class="mcts-value" data-field="uncached">0</span>
        <span class="mcts-label">缓存读</span><span class="mcts-value" data-field="cached">0</span>
        <span class="mcts-label">输出</span><span class="mcts-value" data-field="output">0</span>
        <span class="mcts-label">缓存命中率</span><span class="mcts-value" data-field="cacheHitRate">0.0%</span>
        <span class="mcts-label">请求次数</span><span class="mcts-value" data-field="calls">0</span>
        <span class="mcts-label">请求状态</span><span class="mcts-value" data-field="requestStatus">0 / 0 / 0</span>
        <span class="mcts-label">Usage 缺失</span><span class="mcts-value" data-field="missingUsage">0</span>
      </div>
      <div class="mcts-trend">
        <div class="mcts-trend-head">
          <span class="mcts-trend-title">近 ${TREND_DAYS} 日趋势</span>
          <span class="mcts-trend-peak" data-field="trendPeak">峰值 0</span>
        </div>
        <svg class="mcts-trend-svg" viewBox="0 0 300 88" role="img" aria-label="近 ${TREND_DAYS} 日 Token 趋势"></svg>
        <div class="mcts-trend-labels"></div>
        <div class="mcts-trend-tooltip" hidden></div>
      </div>
      <div class="mcts-models">
        <div class="mcts-section-head">
          <span class="mcts-section-title">按 Model 分布</span>
          <span class="mcts-section-meta" data-field="modelMeta"></span>
        </div>
        <div class="mcts-model-list"></div>
      </div>
      <div class="mcts-price-panel" hidden>
        <div class="mcts-section-head">
          <span class="mcts-section-title">Model 价格设置</span>
          <span class="mcts-section-meta">USD / 1M tokens</span>
        </div>
        <div class="mcts-price-help">价格完全由用户手动填写。长上下文阈值留空时全部按短上下文价格计算；倍率默认 1。</div>
        <div class="mcts-price-add">
          <input class="mcts-price-model-input" type="text" placeholder="添加 Model，例如 gpt-5.5" aria-label="添加 Model 名称">
          <button class="mcts-price-add-button" type="button" data-action="add-price-model">添加</button>
        </div>
        <div class="mcts-price-body"></div>
      </div>
      <div class="mcts-foot">
        <span>数据源：MessagePort 实时通知 · 启动时 rollout 快照 · 协议代理 usage 增量</span>
      </div>
    `;
    document.body.appendChild(panel);

    const trigger = root.querySelector(".mcts-trigger");
    trigger.addEventListener("click", () => {
      pinnedOpen = !pinnedOpen;
      if (pinnedOpen) showPanel();
      else hidePanel();
    });
    trigger.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        pinnedOpen = false;
        hidePanel();
      }
    });
    root.addEventListener("pointerenter", () => showPanel());
    root.addEventListener("pointerleave", () => schedulePanelClose());
    panel.addEventListener("pointerenter", () => cancelPanelClose());
    panel.addEventListener("pointerleave", () => schedulePanelClose());
    document.addEventListener("pointerdown", handleDocumentPointerDown, true);
    teeCleanups.push(() => document.removeEventListener("pointerdown", handleDocumentPointerDown, true));

    panel.querySelector('[data-action="toggle-prices"]').addEventListener("click", (event) => {
      pricesOpen = !pricesOpen;
      event.currentTarget.setAttribute("aria-expanded", String(pricesOpen));
      panel.querySelector(".mcts-price-panel").hidden = !pricesOpen;
      if (pricesOpen) renderPriceTable();
      positionPanel();
    });
    panel.querySelector('[data-action="previous-day"]').addEventListener("click", () => {
      selectedDateKey = clampDateKey(shiftDateKey(selectedDateKey, -1));
      renderPanel();
    });
    panel.querySelector('[data-action="next-day"]').addEventListener("click", () => {
      selectedDateKey = clampDateKey(shiftDateKey(selectedDateKey, 1));
      renderPanel();
    });
    panel.querySelector(".mcts-date-input").addEventListener("change", (event) => {
      selectedDateKey = clampDateKey(event.currentTarget.value);
      renderPanel();
    });
    panel.querySelector('[data-action="add-price-model"]').addEventListener("click", addPriceModelFromInput);
    panel.querySelector(".mcts-price-model-input").addEventListener("keydown", (event) => {
      if (event.key === "Enter") addPriceModelFromInput();
    });
  }

  function addPriceModelFromInput() {
    const input = panel?.querySelector(".mcts-price-model-input");
    const model = normalizeModelName(input?.value || "");
    if (!model) return;
    if (!prices[model]) {
      prices[model] = emptyPriceConfig();
      savePrices();
    }
    if (input) input.value = "";
    renderPriceTable();
    renderPanel();
  }

  function removePriceModel(model) {
    if (!model || !prices[model]) return;
    delete prices[model];
    savePrices();
    renderPriceTable();
    renderPanel();
  }

  function renamePriceModel(oldModel, newModel) {
    const normalizedOld = normalizeModelName(oldModel);
    const normalizedNew = normalizeModelName(newModel);
    if (!normalizedOld || !normalizedNew || normalizedOld === normalizedNew || !prices[normalizedOld]) return false;
    if (prices[normalizedNew]) return false;
    prices[normalizedNew] = prices[normalizedOld];
    delete prices[normalizedOld];
    savePrices();
    renderPriceTable();
    renderPanel();
    return true;
  }

  function renderTrigger() {
    if (!root) return;
    const today = getDateKey(Date.now());
    const summary = summarizeDay(today);
    const totalEl = root.querySelector(".mcts-total");
    const costEl = root.querySelector(".mcts-cost");
    if (totalEl) totalEl.textContent = formatCompact(summary.total.tokens);
    if (costEl) costEl.textContent = `${formatBadgeCost(summary.total.billed)}${summary.total.priced ? "" : "+"}`;
  }

  function trendTooltipHtml(point) {
    return `
      <div class="mcts-trend-tooltip-date">${escapeHtml(formatDisplayDate(point.dateKey))}</div>
      <div class="mcts-trend-tooltip-row"><span>Token 总量</span><strong>${formatExact(point.total)}</strong></div>
      <div class="mcts-trend-tooltip-row"><span>请求次数</span><strong>${formatExact(point.calls)}</strong></div>
      <div class="mcts-trend-tooltip-row"><span>预估金额</span><strong>${formatCost(point.cost)}</strong></div>
    `;
  }

  function hideTrendTooltip() {
    const tooltip = panel?.querySelector(".mcts-trend-tooltip");
    if (tooltip) tooltip.hidden = true;
  }

  function showTrendTooltip(point) {
    if (!panel || !point) return;
    const trendBox = panel.querySelector(".mcts-trend");
    const tooltip = panel.querySelector(".mcts-trend-tooltip");
    const svg = panel.querySelector(".mcts-trend-svg");
    if (!trendBox || !tooltip || !svg) return;

    tooltip.innerHTML = trendTooltipHtml(point);
    tooltip.hidden = false;

    const boxRect = trendBox.getBoundingClientRect();
    const svgRect = svg.getBoundingClientRect();
    const tooltipRect = tooltip.getBoundingClientRect();
    const x = svgRect.left - boxRect.left + (point.x / 300) * svgRect.width;
    const y = svgRect.top - boxRect.top + (point.y / 88) * svgRect.height;
    const minX = tooltipRect.width / 2 + 8;
    const maxX = Math.max(minX, boxRect.width - tooltipRect.width / 2 - 8);
    tooltip.style.left = `${Math.min(Math.max(x, minX), maxX)}px`;
    tooltip.style.top = `${Math.max(y, tooltipRect.height + 18)}px`;
  }

  function renderTrend() {
    if (!panel) return;
    const svg = panel.querySelector(".mcts-trend-svg");
    const labels = panel.querySelector(".mcts-trend-labels");
    const peak = panel.querySelector('[data-field="trendPeak"]');
    hideTrendTooltip();

    const trend = buildTrendData(selectedDateKey);
    if (peak) peak.textContent = `峰值 ${formatCompact(trend.maxTotal)}`;

    const points = trendPoints(trend, 300, 88, 10);
    const line = trendPath(points);
    const baseline = 78;
    const area =
      points.length > 0
        ? `${line} L ${points[points.length - 1].x.toFixed(1)} ${baseline} L ${points[0].x.toFixed(1)} ${baseline} Z`
        : "";

    if (svg) {
      svg.innerHTML = `
        <defs>
          <linearGradient id="mcts-trend-line-gradient" x1="0" y1="0" x2="300" y2="0" gradientUnits="userSpaceOnUse">
            <stop offset="0" stop-color="#3BA7FF"/>
            <stop offset="1" stop-color="#8D6BFF"/>
          </linearGradient>
          <linearGradient id="mcts-trend-area-gradient" x1="0" y1="10" x2="0" y2="78" gradientUnits="userSpaceOnUse">
            <stop offset="0" stop-color="#3BA7FF" stop-opacity="0.2"/>
            <stop offset="1" stop-color="#8D6BFF" stop-opacity="0.025"/>
          </linearGradient>
        </defs>
        <path d="M 10 10 H 290 M 10 44 H 290 M 10 78 H 290" fill="none" stroke="currentColor" stroke-opacity="0.12" stroke-width="1"/>
        ${area ? `<path d="${area}" fill="url(#mcts-trend-area-gradient)"/>` : ""}
        ${line ? `<path d="${line}" fill="none" stroke="url(#mcts-trend-line-gradient)" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>` : ""}
        ${points
          .map(
            (point, index) => `
              <circle class="mcts-trend-point" data-index="${index}" tabindex="0"
                aria-label="${escapeAttribute(`${point.dateKey}，Token 总量 ${formatExact(point.total)}，请求 ${formatExact(point.calls)} 次，预估 ${formatCost(point.cost)}`)}"
                cx="${point.x.toFixed(1)}" cy="${point.y.toFixed(1)}" r="${point.active ? "4" : "2.8"}"
                fill="var(--color-token-background, #fff)" stroke="url(#mcts-trend-line-gradient)" stroke-width="1.9"/>
            `,
          )
          .join("")}
      `;
      svg.querySelectorAll(".mcts-trend-point").forEach((circle) => {
        const point = points[Number(circle.getAttribute("data-index"))];
        circle.addEventListener("pointerenter", () => showTrendTooltip(point));
        circle.addEventListener("pointermove", () => showTrendTooltip(point));
        circle.addEventListener("focus", () => showTrendTooltip(point));
        circle.addEventListener("pointerleave", hideTrendTooltip);
        circle.addEventListener("blur", hideTrendTooltip);
      });
    }

    if (labels) {
      labels.innerHTML = trend.items
        .map((item) => `<span class="${item.active ? "is-active" : ""}">${escapeHtml(item.label)}</span>`)
        .join("");
    }
  }

  function renderModelList(summary) {
    const list = panel?.querySelector(".mcts-model-list");
    const meta = panel?.querySelector('[data-field="modelMeta"]');
    if (!list) return;
    if (meta) {
      meta.textContent = summary.rows.length
        ? `${summary.rows.length} 个 Model`
        : "当日无数据";
    }
    const maxInput = Math.max(1, ...summary.rows.map((row) => toCount(row.input) + toCount(row.output)));
    list.innerHTML = summary.rows
      .map((row) => {
        const share = ((toCount(row.input) + toCount(row.output)) / maxInput) * 100;
        return `
          <div class="mcts-model-row">
            <span class="mcts-model-name">${escapeHtml(row.model)}</span>
            <span class="mcts-model-cost">${row.cost ? formatCost(row.cost.billed) : "未定价"}</span>
            <span class="mcts-model-detail">输入 ${formatCompact(row.uncached)} · 缓存读 ${formatCompact(row.cachedInput)}${row.cacheWrite ? ` · 缓存写 ${formatCompact(row.cacheWrite)}` : ""} · 输出 ${formatCompact(row.output)} · 成功 ${formatExact(row.successCalls)} · 失败 ${formatExact(row.failedCalls)} · 重试 ${formatExact(row.retryCalls)}${row.missingUsage ? ` · Usage 缺失 ${formatExact(row.missingUsage)} 次` : ""}${row.longCalls ? ` · 长上下文 ${formatExact(row.longCalls)} 次` : ""}</span>
            <span class="mcts-model-bar"><span class="mcts-model-fill" style="width:${Math.max(2, share).toFixed(1)}%"></span></span>
          </div>
        `;
      })
      .join("");
  }

  function renderPriceTable() {
    const body = panel?.querySelector(".mcts-price-body");
    if (!body) return;
    // 展示所有已配置模型 + 选中日期出现过的模型；未配置费率保持空白。
    const dayModels = Object.keys(state.days[selectedDateKey || getDateKey(Date.now())] || {});
    const models = [...new Set([...Object.keys(prices), ...dayModels])].filter((m) => m !== UNKNOWN_MODEL).sort();
    body.innerHTML = models
      .map((model) => {
        const p = prices[model] || emptyPriceConfig();
        const configured = !!prices[model];
        const input = (field, label, value) => `
          <label class="mcts-price-field">
            <span>${label}</span>
            <input class="mcts-price-input" type="number" min="0" step="${field === "longContextThreshold" ? "1" : field === "multiplier" ? "0.0001" : "0.000001"}" inputmode="decimal"
              data-model="${escapeAttribute(model)}" data-field="${field}" value="${escapeAttribute(String(value ?? ""))}">
          </label>
        `;
        return `
          <div class="mcts-price-row">
            <input class="mcts-price-name" type="text" data-rename="${escapeAttribute(model)}" value="${escapeAttribute(model)}" aria-label="Model 名称">
            ${configured ? `<button class="mcts-price-remove" type="button" data-remove="${escapeAttribute(model)}" title="删除该模型价格" aria-label="删除 ${escapeAttribute(model)}">×</button>` : ""}
            <div class="mcts-price-grid">
              ${input("input", "短输入", p.input)}
              ${input("cacheRead", "短缓存读", p.cacheRead)}
              ${input("cacheWrite", "短缓存写", p.cacheWrite)}
              ${input("output", "短输出", p.output)}
              ${input("longContextThreshold", "长上下文阈值", p.longContextThreshold)}
              ${input("longInput", "长输入", p.longInput)}
              ${input("longCacheRead", "长缓存读", p.longCacheRead)}
              ${input("longCacheWrite", "长缓存写", p.longCacheWrite)}
              ${input("longOutput", "长输出", p.longOutput)}
              ${input("multiplier", "倍率", p.multiplier)}
            </div>
          </div>
        `;
      })
      .join("");
    body.querySelectorAll(".mcts-price-input").forEach((input) => {
      input.addEventListener("change", (event) => {
        const target = event.currentTarget;
        const model = target.getAttribute("data-model");
        const field = target.getAttribute("data-field");
        if (field === "longContextThreshold" && !target.value.trim()) {
          prices[model] = prices[model] || emptyPriceConfig();
          prices[model][field] = null;
          savePrices();
          requestFullReconcile();
          renderPanel();
          return;
        }
        const value = Number(target.value);
        if (!model || !field || !Number.isFinite(value) || value < 0) return;
        prices[model] = prices[model] || emptyPriceConfig();
        prices[model][field] = value;
        savePrices();
        if (field === "longContextThreshold") requestFullReconcile();
        renderPanel();
      });
    });
    body.querySelectorAll(".mcts-price-name").forEach((input) => {
      input.addEventListener("change", (event) => {
        const target = event.currentTarget;
        const oldModel = target.getAttribute("data-rename");
        const nextModel = normalizeModelName(target.value);
        if (!nextModel || !renamePriceModel(oldModel, nextModel)) {
          target.value = oldModel || "";
        }
      });
    });
    body.querySelectorAll(".mcts-price-remove").forEach((button) => {
      button.addEventListener("click", (event) => {
        removePriceModel(event.currentTarget.getAttribute("data-remove"));
      });
    });
  }

  function renderPanel() {
    if (!panel || destroyed) return;
    const today = getDateKey(Date.now());
    if (!selectedDateKey) selectedDateKey = today;
    selectedDateKey = clampDateKey(selectedDateKey);
    const summary = summarizeDay(selectedDateKey);

    const set = (field, text) => {
      const el = panel.querySelector(`[data-field="${field}"]`);
      if (el) el.textContent = text;
    };
    set("hero", formatExact(summary.total.tokens));
    // 已定价模型正常合计；有未定价模型时显示"$xx+"提示还有未计入部分。
    set("cost", `${formatCost(summary.total.billed)}${summary.total.priced ? "" : "+"}`);
    const costEl = panel.querySelector('[data-field="cost"]');
    if (costEl) {
      costEl.title = summary.total.priced
        ? ""
        : `未定价模型：${summary.total.unpricedModels.join("、")}（在价格设置中添加后计入合计）`;
    }
    set("uncached", formatExact(summary.total.uncached));
    set("cached", formatExact(summary.total.cachedInput));
    set("output", formatExact(summary.total.output));
    const hitBase = summary.total.input;
    set("cacheHitRate", hitBase ? `${((summary.total.cachedInput / hitBase) * 100).toFixed(1)}%` : "0.0%");
    set("calls", formatExact(summary.total.calls));
    set("requestStatus", `${formatExact(summary.total.successCalls)} / ${formatExact(summary.total.failedCalls)} / ${formatExact(summary.total.retryCalls)}`);
    set("missingUsage", formatExact(summary.total.missingUsage));

    const dateInput = panel.querySelector(".mcts-date-input");
    if (dateInput) {
      dateInput.value = selectedDateKey;
      dateInput.min = minRetainedDateKey();
      dateInput.max = today;
    }
    const prevButton = panel.querySelector('[data-action="previous-day"]');
    const nextButton = panel.querySelector('[data-action="next-day"]');
    if (prevButton) prevButton.disabled = selectedDateKey <= minRetainedDateKey();
    if (nextButton) nextButton.disabled = selectedDateKey >= today;

    renderTrend();
    renderModelList(summary);
    if (pricesOpen) renderPriceTable();
  }

  function scheduleRender() {
    if (renderTimer || destroyed) return;
    renderTimer = window.setTimeout(() => {
      renderTimer = 0;
      renderTrigger();
      if (panel?.classList.contains("is-visible")) renderPanel();
    }, RENDER_DEBOUNCE_MS);
  }

  // ---------------------------------------------------------------------------
  // 启动时 rollout 快照 + 运行中代理账本增量
  // ---------------------------------------------------------------------------

  let reconcileSince = "";
  let reconcileProxySinceMs = 0;
  let reconcileProxyOffset = 0;
  let reconcileProxyGeneration = "";
  let reconcileRunning = false;
  let lastReconcileAt = 0;
  let proxyRescanRequested = false;
  let seenProxyEventIds = new Set();

  function bridgeCall(path, payload = {}) {
    const bridge = window.__codexSessionDeleteBridge;
    if (typeof bridge !== "function") return Promise.reject(new Error("Codex++ bridge unavailable"));
    return bridge(path, payload);
  }

  function dayFromTimestamp(timestamp, timestampMs) {
    const numeric = Number(timestampMs || timestamp);
    const value = Number.isFinite(numeric) && numeric > 0 ? numeric : Date.parse(timestamp);
    return getDateKey(Number.isFinite(value) ? value : Date.now());
  }

  function liveMatchesBridgeEvent(live, event) {
    const usage = event?.usage || {};
    if (toCount(live?.usage?.input) !== toCount(usage.input)) return false;
    if (toCount(live?.usage?.cachedInput) !== toCount(usage.cachedInput)) return false;
    if (toCount(live?.usage?.output) !== toCount(usage.output)) return false;
    const eventAt = toCount(event?.timestampMs) || Date.parse(event?.timestamp) || 0;
    return Math.abs(toCount(live?.timestampMs) - eventAt) <= LIVE_PROXY_MATCH_WINDOW_MS;
  }

  function removeLiveRequestFromState(live) {
    const model = normalizeModelName(live?.model) || UNKNOWN_MODEL;
    const day = dayFromTimestamp(live?.at, live?.at);
    const bucket = state.days[day];
    const aggregate = bucket?.[model];
    if (!aggregate) return;
    removeRequestFromAggregate(aggregate, {
      input: live.input,
      cachedInput: live.cachedInput,
      cacheWrite: live.cacheWrite,
      output: live.output,
      reasoning: live.reasoning,
      status: "completed",
    }, priceFor(model));
    if (!aggregate.calls && !aggregate.input && !aggregate.output && !aggregate.reasoning) {
      delete bucket[model];
      if (!Object.keys(bucket).length) delete state.days[day];
    }
  }

  function reapplyUncapturedLiveEvents(events, pendingLive) {
    const available = events.map((event, index) => ({ event, index, consumed: false }));
    for (const live of pendingLive) {
      const candidates = available.filter((candidate) =>
        !candidate.consumed && liveMatchesBridgeEvent(live, candidate.event));
      const exact = candidates.filter((candidate) =>
        normalizeModelName(candidate.event?.model).toLowerCase() === normalizeModelName(live.model).toLowerCase());
      const match = exact.length
        ? exact.sort((left, right) =>
          Math.abs(toCount(left.event.timestampMs) - live.timestampMs)
          - Math.abs(toCount(right.event.timestampMs) - live.timestampMs))[0]
        : candidates.length === 1
          ? candidates[0]
          : null;
      if (match) {
        match.consumed = true;
        continue;
      }
      const model = normalizeModelName(live.model) || UNKNOWN_MODEL;
      const day = dayFromTimestamp(live.timestampMs, live.timestampMs);
      const bucket = (state.days[day] = state.days[day] || {});
      const aggregate = (bucket[model] = bucket[model] || emptyAggregate());
      addRequestToAggregate(aggregate, { ...live.usage, status: "completed" }, priceFor(model));
      rememberLiveRequest(model, live.usage, live.timestampMs);
    }
  }

  function rebuildFromRollout(events, pendingLive = []) {
    const rebuilt = {};
    const watermarks = {};
    for (const event of deduplicateRolloutEvents(events)) {
      if (!event?.id || !event?.usage) continue;
      const day = dayFromTimestamp(event.timestamp, event.timestampMs);
      const model = normalizeModelName(event.model) || UNKNOWN_MODEL;
      const bucket = (rebuilt[day] = rebuilt[day] || {});
      const agg = (bucket[model] = bucket[model] || emptyAggregate());
      addRequestToAggregate(agg, {
        ...event.usage,
        status: event.status,
        usageMissing: event.usageMissing === true,
      }, priceFor(model));
      const id = normalizeThreadId(event.sessionId);
      if (id && event.totals) {
        watermarks[id] = {
          totals: {
            input: toCount(event.totals.input),
            cachedInput: toCount(event.totals.cachedInput),
            cacheWrite: toCount(event.totals.cacheWrite),
            output: toCount(event.totals.output),
          },
          model,
          at: Date.parse(event.timestamp) || Date.now(),
        };
      }
    }
    const minDay = minRetainedDateKey();
    for (const day of Object.keys(state.days)) {
      if (day >= minDay) delete state.days[day];
    }
    for (const [day, models] of Object.entries(rebuilt)) {
      if (day >= minDay) state.days[day] = models;
    }
    Object.assign(state.watermarks, watermarks);
    recentLiveRequests.length = 0;
    for (const event of events) {
      if (String(event?.source || "").toLowerCase() !== "rollout" || !event?.usage) continue;
      const at = toCount(event.timestampMs) || Date.parse(event.timestamp) || Date.now();
      rememberLiveRequest(event.model, event.usage, at, "rollout");
    }
    reapplyUncapturedLiveEvents(events, pendingLive);
    seenProxyEventIds = new Set(
      events
        .map((event) => event?.responseId || event?.id)
        .filter(Boolean),
    );
  }

  function applyProxyEvent(event) {
    const eventId = event?.responseId || event?.id;
    if (!eventId || seenProxyEventIds.has(eventId)) return;
    seenProxyEventIds.add(eventId);
    const source = String(event?.source || "").toLowerCase();
    if (source === "rollout" && hasMatchingLiveRequest(event, "messageport")) return;
    const matchedLive = source === "proxy" && event.usageMissing !== true
      ? takeMatchingLiveRequest(event)
      : null;
    if (matchedLive) removeLiveRequestFromState(matchedLive);
    const model = normalizeModelName(event.model) || UNKNOWN_MODEL;
    const day = dayFromTimestamp(event.timestamp, event.timestampMs);
    const bucket = (state.days[day] = state.days[day] || {});
    const agg = (bucket[model] = bucket[model] || emptyAggregate());
    addRequestToAggregate(agg, {
      ...(event.usage || {}),
      status: event.status,
      usageMissing: event.usageMissing === true,
    }, priceFor(model));
    if (source === "rollout" && event.usageMissing !== true) {
      const at = toCount(event.timestampMs) || Date.parse(event.timestamp) || Date.now();
      rememberLiveRequest(model, event.usage, at, "rollout");
    }
  }

  function requestFullReconcile() {
    if (reconcileRunning) {
      proxyRescanRequested = true;
      return;
    }
    window.setTimeout(() => reconcileRollouts(true), 0);
  }

  async function reconcileRollouts(full = false) {
    if (reconcileRunning || destroyed) return;
    reconcileRunning = true;
    if (full) {
      fullReconcileActive = true;
      pendingLiveDuringFullReconcile.length = 0;
    }
    try {
      const result = await bridgeCall("/token-usage/events", {
        since: full ? "" : reconcileSince,
        proxySinceMs: full ? 0 : reconcileProxySinceMs,
        proxyOffset: full ? 0 : reconcileProxyOffset,
        proxyGeneration: full ? "" : reconcileProxyGeneration,
        includeRollout: true,
        rolloutIncremental: !full,
        days: RETAIN_DAYS,
        limit: full ? 1000000 : 10000,
      });
      const events = Array.isArray(result?.events) ? result.events : [];
      if (full) rebuildFromRollout(events, pendingLiveDuringFullReconcile.slice());
      else if (result?.proxyReset) proxyRescanRequested = true;
      else events.forEach(applyProxyEvent);
      reconcileSince = result?.nextSince || reconcileSince;
      reconcileProxySinceMs = toCount(result?.proxyNextSinceMs) || reconcileProxySinceMs;
      if (Object.prototype.hasOwnProperty.call(result || {}, "proxyNextOffset")) {
        reconcileProxyOffset = toCount(result.proxyNextOffset);
      }
      if (typeof result?.proxyGeneration === "string") {
        reconcileProxyGeneration = result.proxyGeneration;
      }
      lastReconcileAt = Date.now();
      pushDebug({
        type: "token-usage-reconcile",
        full,
        events: events.length,
        proxyEnabledAtMs: toCount(result?.proxyEnabledAtMs),
        missingUsage: toCount(result?.missingUsage),
        proxyOffset: reconcileProxyOffset,
        proxyGeneration: reconcileProxyGeneration,
        warnings: result?.warnings?.length || 0,
      });
      pruneState();
      saveState();
      scheduleRender();
    } catch (error) {
      pushDebug({ type: "rollout-reconcile-error", message: String(error?.message || error) });
    } finally {
      fullReconcileActive = false;
      pendingLiveDuringFullReconcile.length = 0;
      reconcileRunning = false;
      if (proxyRescanRequested && !destroyed) {
        proxyRescanRequested = false;
        window.setTimeout(() => reconcileRollouts(true), 0);
      }
    }
  }
  // ---------------------------------------------------------------------------
  // 生命周期
  // ---------------------------------------------------------------------------

  function exportUsage() {
    return {
      version: VERSION,
      state: JSON.parse(JSON.stringify(state)),
      prices: clonePrices(prices),
      lastRequest,
      unknownLedger: unknownLedger.slice(),
      modelByThread: Object.fromEntries(modelByThread),
      debug: debugRing.slice(),
      reconciliation: {
        since: reconcileSince,
        proxySinceMs: reconcileProxySinceMs,
        proxyOffset: reconcileProxyOffset,
        proxyGeneration: reconcileProxyGeneration,
        lastAt: lastReconcileAt,
        running: reconcileRunning,
      },
    };
  }

  function destroy() {
    destroyed = true;
    if (renderTimer) window.clearTimeout(renderTimer);
    if (saveTimer) {
      window.clearTimeout(saveTimer);
      saveState();
    }
    cancelPanelClose();
    observer?.disconnect();
    if (hoverToolbar?.__codexReconciledTokenUsageHover) {
      hoverToolbar.removeEventListener("pointerenter", hoverToolbar.__codexReconciledTokenUsageHover.enter);
      hoverToolbar.removeEventListener("pointerleave", hoverToolbar.__codexReconciledTokenUsageHover.leave);
      delete hoverToolbar.__codexReconciledTokenUsageHover;
    }
    for (const cleanup of teeCleanups.splice(0)) {
      try {
        cleanup();
      } catch (_) {
        // 忽略。
      }
    }
    document.getElementById(ROOT_ID)?.remove();
    document.getElementById(PANEL_ID)?.remove();
    document.getElementById(STYLE_ID)?.remove();
    if (window[API_KEY]?.version === VERSION) delete window[API_KEY];
  }

  function startUi() {
    installStyle();
    buildUi();
    mountRoot();
    renderTrigger();
    observer = new MutationObserver(() => mountRoot());
    observer.observe(document.body, { childList: true, subtree: true });
    window.addEventListener("resize", positionPanel);
    teeCleanups.push(() => window.removeEventListener("resize", positionPanel));
  }

  function init() {
    state = loadState();
    prices = loadPrices();
    if (migratedStateKey) saveState();
    if (migratedPriceKey) savePrices();
    cleanupLegacyStorage();
    if (pruneState()) saveState();
    installMessagePortTee();
    installMessageListeners();
    window.setTimeout(() => reconcileRollouts(true), 1000);

    window[API_KEY] = {
      version: VERSION,
      export: exportUsage,
      getState: () => state,
      debug: debugRing,
      destroy,
    };

    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", startUi, { once: true });
    } else {
      startUi();
    }
    // 跨午夜刷新徽章日期。
    const midnightTick = window.setInterval(() => scheduleRender(), 60000);
    const reconcileTick = window.setInterval(() => reconcileRollouts(false), PROXY_RECONCILE_INTERVAL_MS);
    teeCleanups.push(() => window.clearInterval(midnightTick));
    teeCleanups.push(() => window.clearInterval(reconcileTick));
    pushDebug({ type: "init", version: VERSION });
  }

  init();
})();

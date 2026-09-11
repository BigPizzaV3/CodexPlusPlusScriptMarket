// ==UserScript==
// @name         DeepSeek Token Usage
// @namespace    codex-plus-plus
// @version      1.13.0
// @description  DeepSeek API Token 用量与费用统计面板，按官方费率计算，只在 Codex 运行时工作。
// @match        app://-/*
// @run-at       document-start
// ==/UserScript==

(() => {
  "use strict";

  const VERSION = "1.13.0";
  const PANEL_API = "__deepseekUsagePanel";
  const STORAGE_KEY = "__deepseekUsagePanelV1";
  const SIDEBAR_BUTTON_ID = "deepseek-usage-sidebar-button";
  const PANEL_ID = "deepseek-usage-panel";
  const STYLE_ID = "deepseek-usage-panel-style";
  const SIDEBAR_NAV_ID = "codex-plus-sidebar-nav";
  const HEADER_TOOLBAR_SELECTOR = ".ms-auto.flex.shrink-0.items-center";
  const DEFAULT_MODEL = "deepseek-flash";
  const RETENTION_DAYS = 400;
  const MAX_RECORDS = 50000;
  const DEDUPE_WINDOW_MS = 10 * 60 * 1000;
  const SAVE_DELAY_MS = 300;

  const MODEL_OPTIONS = [
    ["deepseek-flash", "DeepSeek Flash (V4.1)"],
    ["deepseek-v4-pro", "DeepSeek V4 Pro"],
  ];

  /*
   * DeepSeek 官方价格页（元 / 百万 tokens）
   * 空闲时段价格为高峰时段的一半；高峰时段为北京时间周一至周五
   * 09:00-12:00、14:00-18:00。
   */
  const RATE_CHANGE_TS = Date.UTC(2026, 8, 10, 4, 0, 0);
  const RATE_TABLE = {
    "deepseek-flash": {
      hit: [0.02, 0.04],
      miss: [1.0, 2.0],
      output: [4.0, 8.0],
    },
    "deepseek-v4-pro": {
      hit: [0.15, 0.3],
      miss: [4.5, 9.0],
      output: [13.5, 27.0],
    },
  };
  const LEGACY_FLASH_RATE = {
      hit: [0.05, 0.1],
      miss: [1.5, 3.0],
      output: [4.5, 9.0],
  };

  const state = {
    records: [],
    settings: {
      model: DEFAULT_MODEL,
      mode: "day",
      day: todayKey(),
      month: todayKey().slice(0, 7),
      panelLeft: null,
      panelTop: null,
      panelWidth: null,
      panelHeight: null,
      panelMinimized: false,
      hasOpened: false,
    },
    activeModel: DEFAULT_MODEL,
    turnTotals: Object.create(null),
    seen: new Map(),
    keys: new Set(),
    fingerprints: new Set(),
    ui: null,
    saveTimer: 0,
    ensureTimer: 0,
    renderTimer: 0,
    dragState: null,
    resizeState: null,
    resizeObserver: null,
    chartHitboxes: [],
  };

  if (window[PANEL_API]?.version === VERSION) return;

  function count(value) {
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? Math.round(number) : 0;
  }

  function firstDefined(...values) {
    for (const value of values) {
      if (value !== undefined && value !== null) return value;
    }
    return undefined;
  }

  function todayKey(timestamp = Date.now()) {
    const date = new Date(timestamp + 8 * 60 * 60 * 1000);
    return [
      date.getUTCFullYear(),
      String(date.getUTCMonth() + 1).padStart(2, "0"),
      String(date.getUTCDate()).padStart(2, "0"),
    ].join("-");
  }

  function hourKey(timestamp) {
    const date = new Date(timestamp + 8 * 60 * 60 * 1000);
    return String(date.getUTCHours()).padStart(2, "0");
  }

  function isPeak(timestamp) {
    const date = new Date(timestamp + 8 * 60 * 60 * 1000);
    const weekday = date.getUTCDay();
    if (weekday < 1 || weekday > 5) return false;
    const minutes = date.getUTCHours() * 60 + date.getUTCMinutes();
    return (
      (minutes >= 9 * 60 && minutes < 12 * 60) ||
      (minutes >= 14 * 60 && minutes < 18 * 60)
    );
  }

  function normalizeModel(model) {
    const name = String(model || "").toLowerCase().replace(/_/g, "-");
    if (!name) return state.settings.model || DEFAULT_MODEL;
    if (
      name.includes("pro") ||
      name.includes("reasoner")
    ) {
      return "deepseek-v4-pro";
    }
    if (
      name.includes("flash") ||
      name.includes("vision") ||
      name.includes("chat")
    ) {
      return "deepseek-flash";
    }
    return name;
  }

  function rateForModel(model, timestamp = Date.now()) {
    const normalized = normalizeModel(model);
    if (normalized === "deepseek-v4-pro") {
      return RATE_TABLE["deepseek-v4-pro"];
    }
    return Number(timestamp) >= RATE_CHANGE_TS
      ? RATE_TABLE["deepseek-flash"]
      : LEGACY_FLASH_RATE;
  }

  function modelLabel(model) {
    const entry = MODEL_OPTIONS.find(([key]) => key === model);
    return entry ? entry[1] : model;
  }

  function normalizeUsage(raw) {
    if (!raw || typeof raw !== "object") return null;
    const input = count(
      firstDefined(
        raw.inputTokens,
        raw.input_tokens,
        raw.promptTokens,
        raw.prompt_tokens,
        raw.inputTotalTokens,
        raw.input_total_tokens
      )
    );
    const cached = count(
      firstDefined(
        raw.cachedInputTokens,
        raw.cached_input_tokens,
        raw.cachedTokens,
        raw.cached_tokens,
        raw.prompt_cache_hit_tokens,
        raw.promptTokensDetails?.cachedTokens,
        raw.prompt_tokens_details?.cached_tokens,
        raw.inputTokensDetails?.cachedTokens,
        raw.input_tokens_details?.cached_tokens
      )
    );
    const cacheWrite = count(
      firstDefined(
        raw.cacheWriteInputTokens,
        raw.cache_write_input_tokens,
        raw.cacheCreationInputTokens,
        raw.cache_creation_input_tokens
      )
    );
    const output = count(
      firstDefined(
        raw.outputTokens,
        raw.output_tokens,
        raw.completionTokens,
        raw.completion_tokens
      )
    );
    const reasoning = count(
      firstDefined(
        raw.reasoningOutputTokens,
        raw.reasoning_output_tokens,
        raw.reasoningTokens,
        raw.reasoning_tokens,
        raw.outputTokensDetails?.reasoningTokens,
        raw.output_tokens_details?.reasoning_tokens
      )
    );
    let total = count(
      firstDefined(raw.totalTokens, raw.total_tokens, raw.total)
    );
    const effectiveInput = Math.max(input, cached + cacheWrite);
    if (!effectiveInput && !output) return null;
    if (!total) total = effectiveInput + output;
    return {
      input: effectiveInput,
      cached: Math.min(cached, effectiveInput),
      cacheWrite,
      output,
      reasoning: Math.min(reasoning, output),
      total: Math.max(total, effectiveInput + output),
    };
  }

  function coerceUsage(raw) {
    if (
      raw &&
      typeof raw === "object" &&
      (Object.prototype.hasOwnProperty.call(raw, "input") ||
        Object.prototype.hasOwnProperty.call(raw, "output"))
    ) {
      const input = count(raw.input);
      const cached = Math.min(count(raw.cached), input);
      const output = count(raw.output);
      if (!input && !output) return null;
      return {
        input,
        cached,
        cacheWrite: count(raw.cacheWrite),
        output,
        reasoning: Math.min(count(raw.reasoning), output),
        total: Math.max(count(raw.total), input + output),
      };
    }
    return normalizeUsage(raw);
  }

  function subtractUsage(current, previous) {
    return {
      input: Math.max(0, current.input - previous.input),
      cached: Math.max(0, current.cached - previous.cached),
      cacheWrite: Math.max(0, current.cacheWrite - previous.cacheWrite),
      output: Math.max(0, current.output - previous.output),
      reasoning: Math.max(0, current.reasoning - previous.reasoning),
      total: Math.max(0, current.total - previous.total),
    };
  }

  function usageSignature(usage) {
    return [
      usage.input,
      usage.cached,
      usage.output,
      usage.reasoning,
      usage.total,
    ].join(":");
  }

  function usageCost(model, usage, timestamp) {
    const rates = rateForModel(model, timestamp);
    const peakIndex = isPeak(timestamp) ? 1 : 0;
    const cacheMiss = Math.max(
      0,
      usage.input - usage.cached - usage.cacheWrite
    );
    return (
      (usage.cached / 1_000_000) * rates.hit[peakIndex] +
      (cacheMiss / 1_000_000) * rates.miss[peakIndex] +
      (usage.output / 1_000_000) * rates.output[peakIndex]
    );
  }

  function rateSummary(model) {
    const rates = rateForModel(model);
    return (
      `缓存命中 ${rates.hit[0]}/${rates.hit[1]} 元 · ` +
      `未命中 ${rates.miss[0]}/${rates.miss[1]} 元 · ` +
      `输出 ${rates.output[0]}/${rates.output[1]} 元`
    );
  }

  function loadState() {
    try {
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
      if (stored && Array.isArray(stored.records)) {
        state.records = stored.records.filter(isValidRecord);
        state.keys = new Set(
          state.records.map((record) => record.k).filter(Boolean)
        );
        state.fingerprints = new Set(
          state.records.map((record) => recordFingerprint(record)).filter(Boolean)
        );
      }
      if (stored?.settings && typeof stored.settings === "object") {
        state.settings = {
          ...state.settings,
          ...stored.settings,
        };
      }
      state.settings.model = normalizeModel(
        state.settings.model || DEFAULT_MODEL
      );
      /* First-time users always get the full panel, never the mini bar. */
      if (state.settings.hasOpened !== true) {
        state.settings.panelMinimized = false;
      }
    } catch (_) {
      state.records = [];
    }
    pruneRecords();
  }

  function isValidRecord(record) {
    return (
      record &&
      typeof record === "object" &&
      Number.isFinite(Number(record.t)) &&
      typeof record.d === "string" &&
      count(record.i) + count(record.o) > 0
    );
  }

  function pruneRecords() {
    const cutoff = Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000;
    const records = state.records
      .filter((record) => Number(record.t) >= cutoff)
      .sort((a, b) => Number(a.t) - Number(b.t));
    if (records.length > MAX_RECORDS) {
      records.splice(0, records.length - MAX_RECORDS);
    }
    state.records = records;
    state.keys = new Set(
      records.map((record) => record.k).filter(Boolean)
    );
    state.fingerprints = new Set(
      records.map((record) => recordFingerprint(record)).filter(Boolean)
    );
  }

  function recordFingerprint(record) {
    if (!record || !record.m) return "";
    const signature = [
      count(record.i),
      count(record.c),
      count(record.o),
      count(record.r),
      count(record.n),
    ].join(":");
    return `${record.m}|${signature}|${Math.floor(Number(record.t) / 300000)}`;
  }

  function scheduleSave() {
    if (state.saveTimer) return;
    state.saveTimer = window.setTimeout(() => {
      state.saveTimer = 0;
      pruneRecords();
      try {
        localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({
            version: VERSION,
            settings: state.settings,
            records: state.records,
          })
        );
      } catch (_) {
        state.records = state.records.slice(
          -Math.max(500, Math.floor(state.records.length * 0.8))
        );
        try {
          localStorage.setItem(
            STORAGE_KEY,
            JSON.stringify({
              version: VERSION,
              settings: state.settings,
              records: state.records,
            })
          );
        } catch (_) {
          // Keep running even if localStorage is unavailable.
        }
      }
    }, SAVE_DELAY_MS);
  }

  function recentSeen(key) {
    const now = Date.now();
    if (state.seen.size > 5000) {
      for (const [item, timestamp] of state.seen) {
        if (now - timestamp > DEDUPE_WINDOW_MS) state.seen.delete(item);
      }
    }
    const previous = state.seen.get(key);
    if (previous && now - previous < DEDUPE_WINDOW_MS) return true;
    state.seen.set(key, now);
    return false;
  }

  function addRecord({
    timestamp = Date.now(),
    model,
    usage,
    source = "codex",
    id = "",
  }) {
    if (!usage) return false;
    const normalized = coerceUsage(usage);
    if (!normalized) return false;
    const resolvedModel = normalizeModel(model);
    const signature = usageSignature(normalized);
    const key = `${id || "anonymous"}|${resolvedModel}|${signature}`;
    if (state.keys.has(key)) return false;
    state.keys.add(key);
    if (recentSeen(key)) return false;
    const fingerprint = recordFingerprint({
      t: timestamp,
      m: resolvedModel,
      i: normalized.input,
      c: normalized.cached,
      o: normalized.output,
      r: normalized.reasoning,
      n: normalized.total,
    });
    if (fingerprint && state.fingerprints.has(fingerprint)) return false;
    if (fingerprint) state.fingerprints.add(fingerprint);
    const peak = isPeak(timestamp);
    state.records.push({
      k: key,
      t: timestamp,
      d: todayKey(timestamp),
      m: resolvedModel,
      i: normalized.input,
      c: normalized.cached,
      o: normalized.output,
      r: normalized.reasoning,
      n: normalized.total,
      cost: Number(usageCost(resolvedModel, normalized, timestamp).toFixed(8)),
      peak: peak ? 1 : 0,
      src: source,
    });
    scheduleSave();
    updateLauncherBadge();
    scheduleRender();
    return true;
  }

  function parseJson(value) {
    if (typeof value !== "string") return value;
    const text = value.trim();
    if (!text || (text[0] !== "{" && text[0] !== "[")) return null;
    try {
      return JSON.parse(text);
    } catch (_) {
      return null;
    }
  }

  function findKeyValue(value, keys, depth = 0) {
    if (!value || depth > 7) return null;
    if (Array.isArray(value)) {
      for (const item of value.slice(0, 30)) {
        const found = findKeyValue(item, keys, depth + 1);
        if (found !== null) return found;
      }
      return null;
    }
    if (typeof value === "string") {
      const parsed = parseJson(value);
      return parsed === null
        ? null
        : findKeyValue(parsed, keys, depth + 1);
    }
    if (typeof value !== "object") return null;
    for (const key of keys) {
      if (value[key] !== undefined && value[key] !== null) {
        return value[key];
      }
    }
    for (const key of [
      "info",
      "payload",
      "data",
      "message",
      "event",
      "params",
      "result",
      "body",
      "tokenUsage",
      "token_usage",
      "thread_settings",
      "threadSettings",
      "settings",
    ]) {
      if (value[key] === undefined) continue;
      const found = findKeyValue(value[key], keys, depth + 1);
      if (found !== null) return found;
    }
    return null;
  }

  function findModel(value, depth = 0) {
    const model = findKeyValue(
      value,
      ["model", "modelSlug", "model_slug", "modelId", "model_id"],
      depth
    );
    if (typeof model === "string" && model.trim()) return model.trim();
    return "";
  }

  function captureModelFromText(value) {
    if (value === undefined || value === null) return "";
    if (typeof value === "object") {
      const model = findModel(value);
      if (model) {
        state.activeModel = normalizeModel(model);
        return state.activeModel;
      }
    }
    const text = String(value);
    const quoted = text.match(/"model"\s*:\s*"([^"]+)"/i);
    const bare = text.match(/deepseek-[a-z0-9.-]+/i);
    const detected = quoted?.[1] || bare?.[0] || "";
    if (detected) {
      state.activeModel = normalizeModel(detected);
    }
    return detected;
  }

  function findTurnId(value) {
    const turnId = findKeyValue(
      value,
      ["turnId", "turn_id", "rootTurnId", "root_turn_id"]
    );
    return typeof turnId === "string" ? turnId : "";
  }

  function findResponseId(value) {
    const id = findKeyValue(
      value,
      ["response_id", "responseId", "request_id", "requestId", "id"]
    );
    return typeof id === "string" ? id : "";
  }

  function pickUsage(value, keys) {
    if (!value || typeof value !== "object") return null;
    for (const key of keys) {
      const usage = normalizeUsage(value[key]);
      if (usage) return usage;
    }
    return null;
  }

  function findUsageInfo(payload) {
    const tokenUsage = findKeyValue(
      payload,
      ["tokenUsage", "token_usage", "tokenUsageInfo", "token_usage_info"]
    );
    if (tokenUsage && typeof tokenUsage === "object") {
      const last = pickUsage(tokenUsage, [
        "lastTokenUsage",
        "last_token_usage",
        "lastUsage",
        "last_usage",
        "last",
      ]);
      if (last) return { usage: last, kind: "last" };
      const total = pickUsage(tokenUsage, [
        "totalTokenUsage",
        "total_token_usage",
        "totalUsage",
        "total_usage",
        "total",
      ]);
      if (total) return { usage: total, kind: "total" };
      const direct = normalizeUsage(tokenUsage);
      if (direct) return { usage: direct, kind: "last" };
    }

    const direct = pickUsage(payload, [
      "lastTokenUsage",
      "last_token_usage",
      "lastUsage",
      "last_usage",
      "usage",
    ]);
    if (direct) return { usage: direct, kind: "last" };
    return null;
  }

  function handlePayload(payload, source) {
    if (payload === undefined || payload === null) return false;
    const parsed = parseJson(payload);
    if (parsed !== null && parsed !== payload) {
      return handlePayload(parsed, source);
    }
    if (typeof payload !== "object") return false;

    const detectedModel = findModel(payload);
    if (detectedModel) {
      state.activeModel = normalizeModel(detectedModel);
    }
    const info = findUsageInfo(payload);
    if (!info) return false;
    const model =
      detectedModel ||
      state.activeModel ||
      state.settings.model ||
      DEFAULT_MODEL;
    const id = findResponseId(payload);
    const turnId = findTurnId(payload);

    if (info.kind === "last") {
      return addRecord({
        model,
        usage: info.usage,
        source,
        id: id || turnId,
      });
    }

    if (!turnId) {
      return addRecord({
        model,
        usage: info.usage,
        source,
        id,
      });
    }

    const previous = state.turnTotals[turnId];
    state.turnTotals[turnId] = info.usage;
    if (!previous) return false;
    const delta = subtractUsage(info.usage, previous);
    if (delta.input + delta.output + delta.cached <= 0) return false;
    return addRecord({
      model,
      usage: delta,
      source,
      id: id || turnId,
    });
  }

  function parseResponseText(text, source, url = "") {
    const payloads = [];
    const parsed = parseJson(text);
    if (parsed !== null) payloads.push(parsed);
    if (!payloads.length) {
      for (const line of String(text).split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed === "data: [DONE]") continue;
        const data = trimmed.startsWith("data:")
          ? trimmed.slice(5).trim()
          : trimmed;
        const item = parseJson(data);
        if (item !== null) payloads.push(item);
      }
    }
    let captured = false;
    for (const payload of payloads) {
      captured = handlePayload(
        {
          ...payload,
          __deepseek_url: url,
        },
        source
      ) || captured;
    }
    return captured;
  }

  function isLikelyApiUrl(url) {
    const value = String(url || "").toLowerCase();
    return (
      value.includes("deepseek") ||
      isLoopbackUrl(value) ||
      value.includes("/responses") ||
      value.includes("/chat/completions") ||
      value.includes("/completions")
    );
  }

  function isLoopbackUrl(value) {
    return (
      value.includes("127.0.0.1") ||
      value.includes("localhost") ||
      value.includes("[::1]")
    );
  }

  function installFetchObserver() {
    if (
      typeof window.fetch !== "function" ||
      window.fetch.__deepseekUsageWrapped === VERSION
    ) {
      return;
    }
    const originalFetch = window.fetch;
    async function wrappedFetch(input, init) {
      const url =
        typeof input === "string"
          ? input
          : input?.url || "";
      captureModelFromText(init?.body);
      const response = await originalFetch.call(this, input, init);
      if (
        isLikelyApiUrl(url) &&
        response?.clone &&
        typeof response.clone === "function"
      ) {
        response
          .clone()
          .text()
          .then((text) => parseResponseText(text, "fetch", url))
          .catch(() => {});
      }
      return response;
    }
    wrappedFetch.__deepseekUsageWrapped = VERSION;
    wrappedFetch.__deepseekUsageOriginal = originalFetch;
    window.fetch = wrappedFetch;
  }

  function installXhrObserver() {
    const Xhr = window.XMLHttpRequest;
    if (
      !Xhr?.prototype ||
      Xhr.prototype.__deepseekUsageWrapped === VERSION
    ) {
      return;
    }
    const originalOpen = Xhr.prototype.open;
    const originalSend = Xhr.prototype.send;
    Xhr.prototype.open = function open(method, url, ...rest) {
      this.__deepseekUsageUrl = url;
      return originalOpen.call(this, method, url, ...rest);
    };
    Xhr.prototype.send = function send(...args) {
      captureModelFromText(args[0]);
      this.addEventListener?.("loadend", () => {
        const url = this.__deepseekUsageUrl || "";
        if (!isLikelyApiUrl(url)) return;
        try {
          parseResponseText(this.responseText || "", "xhr", url);
        } catch (_) {
          // Ignore unreadable XHR bodies.
        }
      });
      return originalSend.apply(this, args);
    };
    Xhr.prototype.__deepseekUsageWrapped = VERSION;
    Xhr.prototype.__deepseekUsageOriginalOpen = originalOpen;
    Xhr.prototype.__deepseekUsageOriginalSend = originalSend;
  }

  function installWebSocketObserver() {
    if (
      typeof window.WebSocket !== "function" ||
      window.WebSocket.__deepseekUsageWrapped === VERSION
    ) {
      return;
    }
    const NativeWebSocket = window.WebSocket;
    function DeepSeekUsageWebSocket(...args) {
      const socket = new NativeWebSocket(...args);
      socket.addEventListener?.("message", (event) => {
        try {
          if (typeof event.data === "string") {
            captureModelFromText(event.data);
            handlePayload(event.data, "websocket");
          } else if (
            event.data instanceof Blob &&
            event.data.size <= 1_000_000
          ) {
            event.data
              .text()
              .then((text) => handlePayload(text, "websocket"))
              .catch(() => {});
          }
        } catch (_) {
          // Keep the original socket behavior untouched.
        }
      });
      return socket;
    }
    try {
      DeepSeekUsageWebSocket.prototype = NativeWebSocket.prototype;
      Object.setPrototypeOf(DeepSeekUsageWebSocket, NativeWebSocket);
    } catch (_) {
      // Best-effort compatibility.
    }
    DeepSeekUsageWebSocket.__deepseekUsageWrapped = VERSION;
    DeepSeekUsageWebSocket.__deepseekUsageOriginal = NativeWebSocket;
    window.WebSocket = DeepSeekUsageWebSocket;
  }

  function installCapture() {
    window.addEventListener?.(
      "message",
      (event) => {
        try {
          handlePayload(event.data, "post-message");
        } catch (_) {
          // Ignore unrelated messages.
        }
      },
      true
    );
    window.addEventListener?.(
      "codex-message-from-view",
      (event) => {
        try {
          handlePayload(event.detail, "codex-message");
        } catch (_) {
          // Ignore unrelated messages.
        }
      },
      true
    );
    installFetchObserver();
    installXhrObserver();
    installWebSocketObserver();
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (character) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    }[character]));
  }

  function formatTokens(value) {
    const number = Number(value || 0);
    if (number >= 1_000_000_000) return `${(number / 1_000_000_000).toFixed(2)}B`;
    if (number >= 1_000_000) return `${(number / 1_000_000).toFixed(2)}M`;
    if (number >= 1_000) return `${(number / 1_000).toFixed(1)}K`;
    return String(Math.round(number));
  }

  function formatCost(value) {
    const number = Number(value || 0);
    if (!number) return "¥0.000000";
    if (number < 0.01) return `¥${number.toFixed(6)}`;
    return `¥${number.toFixed(4)}`;
  }

  function formatDateTime(timestamp) {
    const date = new Date(Number(timestamp));
    if (Number.isNaN(date.getTime())) return "";
    return date.toLocaleString("zh-CN", {
      hour12: false,
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function panelShell() {
    const modelOptions = MODEL_OPTIONS.map(
      ([value, label]) =>
        `<option value="${escapeHtml(value)}">${escapeHtml(label)}</option>`
    ).join("");
    return `
      <section id="${PANEL_ID}" class="dsu-panel" hidden>
        <header class="dsu-header" data-drag-handle>
          <span class="dsu-drag-grip" data-drag-handle aria-hidden="true" title="按住拖动面板">⋮⋮</span>
          <div class="dsu-title-block">
            <div class="dsu-logo">DS</div>
            <div>
              <div class="dsu-title">DeepSeek 用量统计</div>
              <div class="dsu-subtitle">Codex 本机会话 · 官方费率估算 · v${VERSION}</div>
            </div>
          </div>
          <div class="dsu-actions">
            <div class="dsu-mini-stats" data-field="miniStats">
              <span class="dsu-mini-scope" data-field="miniScope">今日</span>
              <span class="dsu-mini-tokens" data-field="miniTokens">0 tokens</span>
              <strong class="dsu-mini-cost" data-field="miniCost">¥0.000000</strong>
            </div>
            <div class="dsu-seg">
              <button type="button" data-action="mode-day">按天</button>
              <button type="button" data-action="mode-month">按月</button>
            </div>
            <button type="button" class="dsu-icon-button" data-action="refresh" title="刷新">↻</button>
            <button type="button" class="dsu-icon-button" data-action="minimize" title="收起">−</button>
            <button type="button" class="dsu-icon-button" data-action="close" title="关闭">×</button>
          </div>
        </header>
        <div class="dsu-body" data-field="panelBody">
        <div class="dsu-toolbar">
          <button type="button" class="dsu-icon-button" data-action="previous" title="上一段">‹</button>
          <span class="dsu-scope-label" data-field="scopeLabel"></span>
          <button type="button" class="dsu-icon-button" data-action="next" title="下一段">›</button>
          <input class="dsu-date-input" data-field="dateInput" type="date">
          <input class="dsu-month-input" data-field="monthInput" type="month" hidden>
          <label class="dsu-model-label">计价模型
            <select data-field="modelSelect">${modelOptions}</select>
          </label>
          <button type="button" class="dsu-text-button" data-action="today">回到今天</button>
          <button type="button" class="dsu-text-button dsu-danger" data-action="clear">清空数据</button>
        </div>
        <div class="dsu-cards">
          <div class="dsu-card"><span>请求次数</span><strong data-field="calls">0</strong><small data-field="scopeHint"></small></div>
          <div class="dsu-card dsu-blue"><span>缓存命中</span><strong data-field="hit">0</strong><small data-field="hitRate"></small></div>
          <div class="dsu-card dsu-orange"><span>缓存未命中</span><strong data-field="miss">0</strong></div>
          <div class="dsu-card dsu-green"><span>输出 tokens</span><strong data-field="output">0</strong><small data-field="reasoning"></small></div>
          <div class="dsu-card dsu-red"><span>估算费用</span><strong data-field="cost">¥0.000000</strong><small data-field="rate"></small></div>
        </div>
        <div class="dsu-chart-card">
          <div class="dsu-card-title">
            <span data-field="chartTitle">按小时用量</span>
            <span class="dsu-legend">
              <i class="dsu-dot dsu-dot-blue"></i>命中
              <i class="dsu-dot dsu-dot-orange"></i>未命中
              <i class="dsu-dot dsu-dot-green"></i>输出
              <i class="dsu-dot dsu-dot-yellow"></i>费用
            </span>
          </div>
          <canvas data-field="chart" height="250"></canvas>
          <div class="dsu-chart-tooltip" data-field="chartTooltip" hidden></div>
          <div class="dsu-empty" data-field="chartEmpty" hidden>当前时间段暂无数据</div>
        </div>
        <div class="dsu-table-grid">
          <div class="dsu-table-card">
            <h3>模型分布</h3>
            <table>
              <thead><tr><th>模型</th><th class="dsu-num">调用</th><th class="dsu-num">总量</th><th class="dsu-num">费用</th></tr></thead>
              <tbody data-field="modelRows"></tbody>
            </table>
          </div>
          <div class="dsu-table-card">
            <h3>最近调用</h3>
            <table>
              <thead><tr><th>时间</th><th>模型</th><th class="dsu-num">输入</th><th class="dsu-num">输出</th><th class="dsu-num">费用</th></tr></thead>
              <tbody data-field="recentRows"></tbody>
            </table>
          </div>
        </div>
        <footer class="dsu-footer">
          <span data-field="footerRate"></span>
          <span>高峰时段：周一至周五 09:00-12:00、14:00-18:00（北京时间）</span>
        </footer>
        </div>
        <div class="dsu-resize-handle" data-resize-handle data-resize-direction="se" title="拖动调整大小，双击恢复默认"></div>
      </section>
    `;
  }

  function installStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      #${PANEL_ID},
      #${PANEL_ID} *,
      #${SIDEBAR_BUTTON_ID} {
        -webkit-app-region: no-drag !important;
      }
      #${PANEL_ID} {
        pointer-events: auto !important;
      }
      #${SIDEBAR_BUTTON_ID} {
        color: inherit;
      }
      #${SIDEBAR_BUTTON_ID}:hover,
      #${SIDEBAR_BUTTON_ID}[data-active="true"] {
        background: color-mix(in srgb, currentColor 10%, transparent);
      }
      #${SIDEBAR_BUTTON_ID} .dsu-sidebar-badge {
        margin-inline-start: auto;
        color: var(--text-secondary, #94a3b8);
        font-size: 11px;
        font-variant-numeric: tabular-nums;
        white-space: nowrap;
      }
      .dsu-panel {
        position: fixed;
        top: 90px;
        right: 18px;
        z-index: 2147483000;
        width: min(760px, calc(100vw - 36px));
        max-height: min(620px, calc(100vh - 120px));
        min-width: 420px;
        min-height: 180px;
        resize: none;
        overflow: hidden;
        display: flex;
        flex-direction: column;
        color: #e8eaed;
        background: color-mix(in srgb, #151920 96%, transparent);
        border: 1px solid color-mix(in srgb, #ffffff 14%, transparent);
        border-radius: 16px;
        box-shadow: 0 18px 60px rgba(0, 0, 0, 0.46);
        backdrop-filter: blur(18px);
        font-family: "Segoe UI", "Microsoft YaHei", system-ui, sans-serif;
      }
      .dsu-panel[hidden] { display: none !important; }
      .dsu-header {
        display: flex;
        align-items: center;
        gap: 14px;
        cursor: move;
        user-select: none;
        touch-action: none;
        padding: 16px 18px 12px;
        border-bottom: 1px solid color-mix(in srgb, #ffffff 10%, transparent);
        position: sticky;
        top: 0;
        background: color-mix(in srgb, #151920 96%, transparent);
        backdrop-filter: blur(18px);
        z-index: 2;
      }
      .dsu-drag-grip {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 22px;
        height: 30px;
        border-radius: 7px;
        color: #64748b;
        font-size: 14px;
        letter-spacing: -2px;
        line-height: 1;
        cursor: grab;
        flex: 0 0 auto;
        touch-action: none;
      }
      .dsu-drag-grip:hover {
        color: #cbd5e1;
        background: color-mix(in srgb, currentColor 12%, transparent);
      }
      .dsu-panel.dsu-dragging .dsu-drag-grip {
        cursor: grabbing;
      }
      .dsu-header button,
      .dsu-header input,
      .dsu-header select,
      .dsu-header a {
        cursor: pointer;
        user-select: auto;
      }
      .dsu-body {
        flex: 1 1 auto;
        min-height: 0;
        overflow: auto;
      }
      .dsu-panel.dsu-dragging {
        transition: none;
        opacity: 0.98;
        box-shadow: 0 24px 72px rgba(0, 0, 0, 0.58);
      }
      .dsu-panel.dsu-minimized {
        width: auto !important;
        height: auto !important;
        min-width: 280px;
        max-width: calc(100vw - 16px);
        min-height: 0;
        max-height: none;
        resize: none;
        border-radius: 10px;
      }
      .dsu-panel.dsu-minimized .dsu-body {
        display: none !important;
      }
      .dsu-panel.dsu-minimized .dsu-title-block,
      .dsu-panel.dsu-minimized .dsu-seg,
      .dsu-panel.dsu-minimized [data-action="refresh"] {
        display: none !important;
      }
      .dsu-panel.dsu-minimized .dsu-mini-stats {
        display: flex;
      }
      .dsu-panel.dsu-minimized .dsu-header {
        min-height: 36px;
        padding: 4px 8px;
        gap: 6px;
      }
      .dsu-panel.dsu-minimized .dsu-actions {
        gap: 5px;
      }
      .dsu-panel.dsu-minimized .dsu-icon-button {
        width: 26px;
        height: 24px;
      }
      .dsu-resize-handle {
        position: absolute;
        right: 2px;
        bottom: 2px;
        width: 18px;
        height: 18px;
        z-index: 5;
        cursor: nwse-resize;
        touch-action: none;
        -webkit-app-region: no-drag !important;
      }
      .dsu-resize-handle::before,
      .dsu-resize-handle::after {
        content: "";
        position: absolute;
        right: 3px;
        bottom: 3px;
        width: 8px;
        height: 2px;
        border-radius: 2px;
        background: #64748b;
        transform: rotate(-45deg);
        transform-origin: right center;
      }
      .dsu-resize-handle::after {
        right: 3px;
        bottom: 7px;
        width: 5px;
      }
      .dsu-resize-handle:hover::before,
      .dsu-resize-handle:hover::after {
        background: #cbd5e1;
      }
      .dsu-panel.dsu-minimized .dsu-resize-handle {
        display: none;
      }
      .dsu-resize-zone {
        position: absolute;
        z-index: 6;
        touch-action: none;
        -webkit-app-region: no-drag !important;
      }
      .dsu-resize-zone[data-resize-direction="n"],
      .dsu-resize-zone[data-resize-direction="s"] {
        left: 14px;
        right: 14px;
        height: 8px;
        cursor: ns-resize;
      }
      .dsu-resize-zone[data-resize-direction="n"] { top: 0; }
      .dsu-resize-zone[data-resize-direction="s"] { bottom: 0; }
      .dsu-resize-zone[data-resize-direction="e"],
      .dsu-resize-zone[data-resize-direction="w"] {
        top: 14px;
        bottom: 14px;
        width: 8px;
        cursor: ew-resize;
      }
      .dsu-resize-zone[data-resize-direction="e"] { right: 0; }
      .dsu-resize-zone[data-resize-direction="w"] { left: 0; }
      .dsu-resize-zone[data-resize-direction="ne"],
      .dsu-resize-zone[data-resize-direction="nw"],
      .dsu-resize-zone[data-resize-direction="se"],
      .dsu-resize-zone[data-resize-direction="sw"] {
        width: 16px;
        height: 16px;
      }
      .dsu-resize-zone[data-resize-direction="ne"] {
        top: 0;
        right: 0;
        cursor: nesw-resize;
      }
      .dsu-resize-zone[data-resize-direction="nw"] {
        top: 0;
        left: 0;
        cursor: nwse-resize;
      }
      .dsu-resize-zone[data-resize-direction="se"] {
        right: 0;
        bottom: 0;
        cursor: nwse-resize;
      }
      .dsu-resize-zone[data-resize-direction="sw"] {
        left: 0;
        bottom: 0;
        cursor: nesw-resize;
      }
      .dsu-panel.dsu-minimized .dsu-resize-zone {
        display: none;
      }
      .dsu-title-block { display: flex; align-items: center; gap: 10px; min-width: 0; }
      .dsu-logo {
        width: 34px; height: 34px; border-radius: 10px;
        display: grid; place-items: center;
        background: linear-gradient(135deg, #2563eb, #06b6d4);
        color: #fff; font-weight: 750; font-size: 13px;
      }
      .dsu-title { font-size: 15px; font-weight: 700; }
      .dsu-subtitle { color: #94a3b8; font-size: 11px; margin-top: 2px; }
      .dsu-actions { margin-left: auto; display: flex; gap: 8px; align-items: center; }
      .dsu-mini-stats {
        display: none;
        align-items: center;
        gap: 8px;
        white-space: nowrap;
        font-size: 11px;
      }
      .dsu-mini-scope { color: #64748b; }
      .dsu-mini-tokens {
        color: #cbd5e1;
        font-variant-numeric: tabular-nums;
      }
      .dsu-mini-cost {
        color: #f87171;
        font-size: 13px;
        font-variant-numeric: tabular-nums;
      }
      .dsu-seg { display: inline-flex; padding: 2px; border-radius: 9px; background: #0f141c; border: 1px solid #2b3544; }
      .dsu-seg button {
        border: 0; background: transparent; color: #94a3b8; cursor: pointer;
        border-radius: 7px; padding: 5px 11px; font-size: 12px;
      }
      .dsu-seg button[data-active="true"] { background: #2563eb; color: #fff; font-weight: 650; }
      .dsu-icon-button, .dsu-text-button {
        border: 1px solid #2b3544; background: #0f141c; color: #cbd5e1;
        border-radius: 8px; cursor: pointer; font-size: 12px;
      }
      .dsu-icon-button { width: 30px; height: 28px; padding: 0; font-size: 17px; line-height: 1; }
      .dsu-text-button { padding: 6px 10px; }
      .dsu-danger { color: #fca5a5; }
      .dsu-toolbar {
        display: flex; flex-wrap: wrap; align-items: center; gap: 8px;
        padding: 12px 18px; border-bottom: 1px solid #232c38;
      }
      .dsu-scope-label { min-width: 116px; text-align: center; font-size: 13px; font-weight: 650; }
      .dsu-date-input, .dsu-month-input, .dsu-model-label select {
        background: #0f141c; color: #e2e8f0; border: 1px solid #2b3544;
        border-radius: 8px; padding: 6px 8px; font-size: 12px;
      }
      .dsu-model-label { display: flex; align-items: center; gap: 7px; color: #94a3b8; font-size: 12px; }
      .dsu-cards {
        display: grid; grid-template-columns: repeat(auto-fit, minmax(138px, 1fr));
        gap: 10px; padding: 16px 18px 4px;
      }
      .dsu-card {
        min-width: 0; padding: 12px 13px; border-radius: 12px;
        background: #10161f; border: 1px solid #263140;
      }
      .dsu-card span { display: block; color: #94a3b8; font-size: 11px; }
      .dsu-card strong { display: block; margin-top: 7px; font-size: 19px; font-weight: 700; font-variant-numeric: tabular-nums; }
      .dsu-card small { display: block; margin-top: 4px; color: #64748b; font-size: 10px; min-height: 12px; }
      .dsu-blue strong { color: #38bdf8; }
      .dsu-orange strong { color: #fb923c; }
      .dsu-green strong { color: #4ade80; }
      .dsu-red strong { color: #f87171; }
      .dsu-chart-card {
        position: relative;
        margin: 14px 18px 0; padding: 14px; border-radius: 12px;
        background: #10161f; border: 1px solid #263140;
      }
      .dsu-card-title { display: flex; align-items: center; gap: 12px; color: #cbd5e1; font-size: 12px; }
      .dsu-legend { margin-left: auto; color: #64748b; font-size: 10px; }
      .dsu-dot { display: inline-block; width: 8px; height: 8px; border-radius: 3px; margin: 0 4px 0 8px; }
      .dsu-dot-blue { background: #38bdf8; }
      .dsu-dot-orange { background: #fb923c; }
      .dsu-dot-green { background: #4ade80; }
      .dsu-dot-yellow { background: #facc15; }
      .dsu-chart-card canvas { display: block; width: 100%; height: 250px; margin-top: 8px; }
      .dsu-chart-tooltip {
        position: absolute;
        z-index: 20;
        min-width: 154px;
        padding: 8px 10px;
        border-radius: 9px;
        border: 1px solid #3b4a5d;
        background: color-mix(in srgb, #0b111a 96%, transparent);
        box-shadow: 0 10px 28px rgba(0, 0, 0, 0.46);
        pointer-events: none;
        font-size: 11px;
        line-height: 1.55;
      }
      .dsu-chart-tooltip[hidden] { display: none !important; }
      .dsu-tip-title {
        color: #e2e8f0;
        font-size: 12px;
        font-weight: 700;
        margin-bottom: 4px;
      }
      .dsu-tip-row {
        display: flex;
        justify-content: space-between;
        gap: 16px;
        color: #94a3b8;
      }
      .dsu-tip-row b {
        color: #e2e8f0;
        font-weight: 600;
        font-variant-numeric: tabular-nums;
      }
      .dsu-tip-cost { color: #f87171; }
      .dsu-empty { color: #64748b; font-size: 12px; text-align: center; padding: 70px 0; }
      .dsu-table-grid { display: grid; grid-template-columns: 1fr 1.35fr; gap: 12px; padding: 14px 18px 0; }
      .dsu-table-card { min-width: 0; padding: 13px; border-radius: 12px; background: #10161f; border: 1px solid #263140; }
      .dsu-table-card h3 { margin: 0 0 10px; font-size: 12px; color: #cbd5e1; }
      .dsu-table-card table { width: 100%; border-collapse: collapse; font-size: 11px; }
      .dsu-table-card th, .dsu-table-card td { padding: 6px 5px; border-bottom: 1px solid #202a36; text-align: left; }
      .dsu-table-card th { color: #64748b; font-weight: 500; }
      .dsu-table-card td { color: #cbd5e1; }
      .dsu-num { text-align: right !important; font-variant-numeric: tabular-nums; }
      .dsu-empty-row { color: #64748b !important; text-align: center !important; padding: 16px !important; }
      .dsu-footer {
        display: flex; flex-wrap: wrap; gap: 8px 18px; justify-content: space-between;
        padding: 14px 18px 18px; color: #64748b; font-size: 10px;
      }
      @media (max-width: 760px) {
        .dsu-panel { top: 84px; right: 8px; width: calc(100vw - 16px); }
        .dsu-table-grid { grid-template-columns: 1fr; }
        .dsu-toolbar { align-items: stretch; }
      }
    `;
    (document.head || document.documentElement).appendChild(style);
  }

  function launcherMarkup(compact) {
    if (compact) {
      return `
        <svg viewBox="0 0 24 24" width="15" height="15" fill="none"
             stroke="currentColor" stroke-width="1.8" stroke-linecap="round"
             stroke-linejoin="round" aria-hidden="true">
          <path d="M4 20V10M10 20V4M16 20v-7M22 20H2"></path>
        </svg>
        <span class="dsu-sidebar-badge" data-field="sidebarBadge">—</span>
      `;
    }
    return `
      <span class="dsu-sidebar-icon" aria-hidden="true"
            style="display:flex;width:20px;height:20px;align-items:center;justify-content:center;">
        <svg viewBox="0 0 24 24" width="19" height="19" fill="none"
             stroke="currentColor" stroke-width="1.8" stroke-linecap="round"
             stroke-linejoin="round">
          <path d="M4 20V10M10 20V4M16 20v-7M22 20H2"></path>
        </svg>
      </span>
      <span class="truncate">DeepSeek 用量</span>
      <span class="dsu-sidebar-badge" data-field="sidebarBadge">—</span>
    `;
  }

  function ensureLauncher() {
    const headerToolbar = document.querySelector(HEADER_TOOLBAR_SELECTOR);
    const nav = document.getElementById(SIDEBAR_NAV_ID);
    const desiredParent = headerToolbar || nav;
    if (!desiredParent) return false;
    let button = document.getElementById(SIDEBAR_BUTTON_ID);
    if (!button) {
      button = document.createElement("button");
      button.id = SIDEBAR_BUTTON_ID;
      button.type = "button";
      button.setAttribute("aria-label", "DeepSeek 用量统计");
      button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        togglePanel();
      });
    }

    const compact = Boolean(headerToolbar);
    const parentChanged = button.parentElement !== desiredParent;
    const shapeChanged = button.dataset.dsuCompact !== String(compact);
    if (parentChanged || shapeChanged) {
      button.dataset.dsuCompact = String(compact);
      if (compact) {
        button.className =
          "no-drag cursor-interaction flex h-7 items-center " +
          "justify-center gap-1 rounded-md px-1.5 text-xs";
        button.style.cssText =
          "border:0;background:transparent;color:inherit;cursor:pointer;";
        button.innerHTML = launcherMarkup(true);
        headerToolbar.insertBefore(button, headerToolbar.firstChild);
      } else {
        button.removeAttribute("style");
        button.className =
          "sidebar-item relative h-[var(--height-token-row)] " +
          "cursor-interaction shrink-0 items-center overflow-hidden text-start " +
          "text-sm disabled:cursor-not-allowed disabled:opacity-50 flex w-full " +
          "gap-2 px-[var(--padding-row-cell-x,var(--padding-row-x))] py-row-y " +
          "hover:bg-primary-ghost-hover data-[state=open]:bg-primary-ghost-hover " +
          "focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring " +
          "focus-visible:outline-offset-[-2px]";
        button.innerHTML = launcherMarkup(false);
        const codexPlusButton = Array.from(nav.querySelectorAll("button")).find(
          (item) => (item.textContent || "").trim().startsWith("Codex++")
        );
        if (codexPlusButton?.nextSibling) {
          nav.insertBefore(button, codexPlusButton.nextSibling);
        } else {
          nav.appendChild(button);
        }
      }
    }
    updateLauncherBadge();
    return true;
  }

  function updateLauncherBadge() {
    const badge = document.querySelector(
      `#${SIDEBAR_BUTTON_ID} [data-field="sidebarBadge"]`
    );
    if (!badge) return;
    const cost = state.records
      .filter((record) => record.d === todayKey())
      .reduce((sum, record) => sum + Number(record.cost || 0), 0);
    badge.textContent = cost ? formatCost(cost) : "—";
  }

  function handlePanelAction(action) {
    if (action === "mode-day") setMode("day");
    else if (action === "mode-month") setMode("month");
    else if (action === "previous") moveScope(-1);
    else if (action === "next") moveScope(1);
    else if (action === "today") setToday();
    else if (action === "refresh") render({ animate: true });
    else if (action === "minimize") toggleMinimized();
    else if (action === "close") closePanel();
    else if (action === "clear") clearRecords();
  }

  function bindPanelControls(panel) {
    panel.querySelectorAll("[data-action]").forEach((button) => {
      button.onclick = (event) => {
        event.preventDefault();
        event.stopPropagation();
        handlePanelAction(button.dataset.action);
      };
      button.onpointerdown = (event) => event.stopPropagation();
      button.onmousedown = (event) => event.stopPropagation();
    });
    const dateInput = panel.querySelector('[data-field="dateInput"]');
    const monthInput = panel.querySelector('[data-field="monthInput"]');
    const modelSelect = panel.querySelector('[data-field="modelSelect"]');
    const chart = panel.querySelector('[data-field="chart"]');
    if (chart) {
      chart.onmousemove = handleChartHover;
      chart.onmouseleave = hideChartTooltip;
    }
    if (dateInput) {
      dateInput.onchange = () => {
        state.settings.day = dateInput.value || todayKey();
        state.settings.month = state.settings.day.slice(0, 7);
        scheduleSave();
        render({ animate: true });
      };
    }
    if (monthInput) {
      monthInput.onchange = () => {
        state.settings.month =
          monthInput.value || todayKey().slice(0, 7);
        state.settings.day = `${state.settings.month}-01`;
        scheduleSave();
        render({ animate: true });
      };
    }
    if (modelSelect) {
      modelSelect.onchange = () => {
        state.settings.model = modelSelect.value || DEFAULT_MODEL;
        scheduleSave();
        render();
      };
    }
  }

  function ensurePanel() {
    let panel = document.getElementById(PANEL_ID);
    if (
      panel &&
      panel.dataset.dsuVersion !== VERSION
    ) {
      panel.remove();
      panel = null;
    }
    if (!panel) {
      const wrapper = document.createElement("div");
      wrapper.innerHTML = panelShell().trim();
      panel = wrapper.firstElementChild;
      panel.dataset.dsuVersion = VERSION;
      document.body.appendChild(panel);
    }
    state.ui = {
      panel,
      body: panel.querySelector('[data-field="panelBody"]'),
      dateInput: panel.querySelector('[data-field="dateInput"]'),
      monthInput: panel.querySelector('[data-field="monthInput"]'),
      modelSelect: panel.querySelector('[data-field="modelSelect"]'),
      scopeLabel: panel.querySelector('[data-field="scopeLabel"]'),
      chart: panel.querySelector('[data-field="chart"]'),
      modelRows: panel.querySelector('[data-field="modelRows"]'),
      recentRows: panel.querySelector('[data-field="recentRows"]'),
    };
    restorePanelPosition(panel);
    applyPanelMinimized(panel);
    applyPanelSize(panel);
    setupPanelDrag(panel);
    setupPanelResize(panel);
    if (!state.resizeObserver && typeof ResizeObserver === "function") {
      state.resizeObserver = new ResizeObserver(() => {
        if (state.dragState || state.resizeState) return;
        clampPanelPosition(panel);
        window.requestAnimationFrame(() => clampPanelPosition(panel));
      });
      state.resizeObserver.observe(panel);
    }
    if (panel.__deepseekUsageBoundVersion === VERSION) return;
    panel.__deepseekUsageBoundVersion = VERSION;
    bindPanelControls(panel);
    window.addEventListener("keydown", (event) => {
      if (event.key === "Escape") closePanel();
    });
    window.addEventListener("resize", () => {
      if (!state.ui?.panel?.hidden) {
        clampPanelPosition();
        if (!state.settings.panelMinimized) {
          drawChart(chartBuckets(visibleRecords()));
        }
      }
    });
  }

  const PANEL_MARGIN = 8;

  function clampPanelPosition(panel = state.ui?.panel) {
    if (!panel || panel.hidden) return;
    const viewportWidth = Math.max(240, window.innerWidth);
    const viewportHeight = Math.max(160, window.innerHeight);
    const minimized = panel.classList.contains("dsu-minimized");
    const maxWidth = Math.max(200, viewportWidth - PANEL_MARGIN * 2);
    const maxHeight = Math.max(120, viewportHeight - PANEL_MARGIN * 2);
    let rect = panel.getBoundingClientRect();

    /*
     * When expanding a minimized bar near the right edge, the width changes
     * from ~280px to ~760px. Force the enlarged width to fit first, then
     * calculate the left edge again so no part stays off screen.
     */
    if (!minimized && rect.width > maxWidth + 1) {
      panel.style.width = `${Math.round(maxWidth)}px`;
      rect = panel.getBoundingClientRect();
    }
    if (!minimized && rect.height > maxHeight + 1) {
      panel.style.maxHeight = `${Math.round(maxHeight)}px`;
      rect = panel.getBoundingClientRect();
    }

    const width = rect.width || panel.offsetWidth || 760;
    const height = rect.height || panel.offsetHeight || 520;
    const maxLeft = Math.max(
      PANEL_MARGIN,
      viewportWidth - width - PANEL_MARGIN
    );
    const maxTop = Math.max(
      PANEL_MARGIN,
      viewportHeight - height - PANEL_MARGIN
    );
    const requestedLeft = Number.parseFloat(panel.style.left);
    const requestedTop = Number.parseFloat(panel.style.top);
    const left = Math.min(
      Math.max(
        PANEL_MARGIN,
        Number.isFinite(requestedLeft) ? requestedLeft : rect.left || PANEL_MARGIN
      ),
      maxLeft
    );
    const top = Math.min(
      Math.max(
        PANEL_MARGIN,
        Number.isFinite(requestedTop) ? requestedTop : rect.top || PANEL_MARGIN
      ),
      maxTop
    );
    panel.style.left = `${Math.round(left)}px`;
    panel.style.top = `${Math.round(top)}px`;
    panel.style.right = "auto";
  }

  function schedulePanelClamp() {
    const run = () => {
      const panel = state.ui?.panel;
      if (!panel || panel.hidden) return;
      clampPanelPosition(panel);
      if (!state.settings.panelMinimized) {
        drawChart(chartBuckets(visibleRecords()));
      }
    };
    run();
    window.setTimeout(run, 0);
    window.setTimeout(run, 120);
    window.requestAnimationFrame(() => window.requestAnimationFrame(run));
  }

  function restorePanelPosition(panel) {
    const left = Number(state.settings.panelLeft);
    const top = Number(state.settings.panelTop);
    if (Number.isFinite(left) && Number.isFinite(top) && left > 0 && top > 0) {
      panel.style.left = `${Math.round(left)}px`;
      panel.style.top = `${Math.round(top)}px`;
      panel.style.right = "auto";
    }
  }

  function setupPanelDrag(panel) {
    if (panel.__deepseekDragBound === VERSION) return;
    panel.__deepseekDragBound = VERSION;

    /*
     * Interactive controls stay clickable, but their pointer events must not
     * leak into Codex's own window-drag handling.
     */
    panel.addEventListener(
      "pointerdown",
      (event) => event.stopPropagation(),
      true
    );
    panel.addEventListener(
      "mousedown",
      (event) => event.stopPropagation(),
      true
    );

    const isInteractive = (target) =>
      Boolean(
        target.closest?.(
          "button,input,select,textarea,a[href],[data-action]"
        )
      );

    const startDrag = (event) => {
      if (state.dragState) return;
      if (event.button !== undefined && event.button !== 0) return;
      if (isInteractive(event.target)) return;
      if (!event.target.closest?.("[data-drag-handle]")) return;
      event.preventDefault();
      event.stopPropagation();

      const rect = panel.getBoundingClientRect();
      const drag = {
        startX: event.clientX,
        startY: event.clientY,
        baseLeft: rect.left,
        baseTop: rect.top,
        width: rect.width,
        height: rect.height,
        left: rect.left,
        top: rect.top,
        frame: 0,
        pending: null,
      };
      state.dragState = drag;
      panel.style.left = `${Math.round(rect.left)}px`;
      panel.style.top = `${Math.round(rect.top)}px`;
      panel.style.right = "auto";
      panel.style.willChange = "transform";
      panel.classList.add("dsu-dragging");

      const applyMove = () => {
        const current = state.dragState;
        if (!current || !current.pending) return;
        const point = current.pending;
        const maxLeft = Math.max(
          PANEL_MARGIN,
          window.innerWidth - current.width - PANEL_MARGIN
        );
        const maxTop = Math.max(
          PANEL_MARGIN,
          window.innerHeight - current.height - PANEL_MARGIN
        );
        current.left = Math.min(
          Math.max(PANEL_MARGIN, current.baseLeft + point.x - current.startX),
          maxLeft
        );
        current.top = Math.min(
          Math.max(PANEL_MARGIN, current.baseTop + point.y - current.startY),
          maxTop
        );
        panel.style.transform = `translate3d(${Math.round(
          current.left - current.baseLeft
        )}px, ${Math.round(current.top - current.baseTop)}px, 0)`;
      };

      const move = (moveEvent) => {
        const current = state.dragState;
        if (!current) return;
        current.pending = { x: moveEvent.clientX, y: moveEvent.clientY };
        if (current.frame) return;
        current.frame = window.requestAnimationFrame(() => {
          if (state.dragState) state.dragState.frame = 0;
          applyMove();
        });
      };

      const finish = () => {
        const current = state.dragState;
        if (!current) return;
        if (current.frame) window.cancelAnimationFrame(current.frame);
        applyMove();
        state.dragState = null;
        panel.style.left = `${Math.round(current.left)}px`;
        panel.style.top = `${Math.round(current.top)}px`;
        panel.style.transform = "";
        panel.style.willChange = "";
        panel.classList.remove("dsu-dragging");
        state.settings.panelLeft = Math.round(current.left);
        state.settings.panelTop = Math.round(current.top);
        scheduleSave();
        window.removeEventListener("pointermove", move, true);
        window.removeEventListener("pointerup", finish, true);
        window.removeEventListener("pointercancel", finish, true);
        window.removeEventListener("mousemove", move, true);
        window.removeEventListener("mouseup", finish, true);
        window.removeEventListener("blur", finish, true);
      };

      window.addEventListener("pointermove", move, true);
      window.addEventListener("pointerup", finish, true);
      window.addEventListener("pointercancel", finish, true);
      window.addEventListener("mousemove", move, true);
      window.addEventListener("mouseup", finish, true);
      window.addEventListener("blur", finish, true);
    };

    panel.addEventListener("pointerdown", startDrag, true);
    panel.addEventListener("mousedown", startDrag, true);
  }

  function applyPanelSize(panel = state.ui?.panel) {
    if (!panel || panel.classList.contains("dsu-minimized")) return;
    const width = Number(state.settings.panelWidth);
    const height = Number(state.settings.panelHeight);
    if (Number.isFinite(width) && width > 0) {
      panel.style.width = `${Math.round(width)}px`;
    }
    if (Number.isFinite(height) && height > 0) {
      panel.style.height = `${Math.round(height)}px`;
      panel.style.maxHeight = "none";
    }
  }

  function setupPanelResize(panel) {
    if (panel.__deepseekResizeBound === VERSION) return;
    panel.__deepseekResizeBound = VERSION;
    for (const direction of ["n", "s", "e", "w", "ne", "nw", "sw"]) {
      if (panel.querySelector(`[data-resize-direction="${direction}"]`)) {
        continue;
      }
      const zone = document.createElement("div");
      zone.className = "dsu-resize-zone";
      zone.dataset.resizeDirection = direction;
      zone.title = "拖动调整面板大小";
      panel.appendChild(zone);
    }
    const handle = panel.querySelector('[data-resize-direction="se"]');
    if (!handle) return;

    const startResize = (event) => {
      if (state.resizeState) return;
      const direction = event.target.closest?.("[data-resize-direction]")
        ?.dataset?.resizeDirection;
      if (!direction) return;
      if (event.button !== undefined && event.button !== 0) return;
      if (panel.classList.contains("dsu-minimized")) return;
      event.preventDefault();
      event.stopPropagation();
      const rect = panel.getBoundingClientRect();
      const resize = {
        direction,
        startX: event.clientX,
        startY: event.clientY,
        baseLeft: rect.left,
        baseTop: rect.top,
        baseWidth: rect.width,
        baseHeight: rect.height,
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: rect.height,
        frame: 0,
        pending: null,
      };
      state.resizeState = resize;
      panel.classList.add("dsu-resizing");

      const applyResize = () => {
        const current = state.resizeState;
        if (!current || !current.pending) return;
        const direction = current.direction;
        const margin = PANEL_MARGIN;
        const deltaX = current.pending.x - current.startX;
        const deltaY = current.pending.y - current.startY;
        const maxWidth = Math.max(380, window.innerWidth - margin * 2);
        const maxHeight = Math.max(180, window.innerHeight - margin * 2);
        let width = current.baseWidth;
        let height = current.baseHeight;
        let left = current.baseLeft;
        let top = current.baseTop;

        if (direction.includes("e")) width = current.baseWidth + deltaX;
        if (direction.includes("w")) width = current.baseWidth - deltaX;
        if (direction.includes("s")) height = current.baseHeight + deltaY;
        if (direction.includes("n")) height = current.baseHeight - deltaY;
        width = Math.min(Math.max(380, width), maxWidth);
        height = Math.min(Math.max(180, height), maxHeight);

        if (direction.includes("w")) {
          left = current.baseLeft + (current.baseWidth - width);
        }
        if (direction.includes("n")) {
          top = current.baseTop + (current.baseHeight - height);
        }
        if (left < margin) {
          if (direction.includes("w")) {
            width = Math.min(width, current.baseLeft + current.baseWidth - margin);
          }
          left = margin;
        }
        if (top < margin) {
          if (direction.includes("n")) {
            height = Math.min(height, current.baseTop + current.baseHeight - margin);
          }
          top = margin;
        }
        if (left + width > window.innerWidth - margin) {
          if (direction.includes("e")) {
            width = window.innerWidth - margin - left;
          } else {
            left = window.innerWidth - margin - width;
          }
        }
        if (top + height > window.innerHeight - margin) {
          if (direction.includes("s")) {
            height = window.innerHeight - margin - top;
          } else {
            top = window.innerHeight - margin - height;
          }
        }
        width = Math.max(380, Math.min(width, maxWidth));
        height = Math.max(180, Math.min(height, maxHeight));
        current.width = width;
        current.height = height;
        current.left = left;
        current.top = top;
        panel.style.left = `${Math.round(left)}px`;
        panel.style.top = `${Math.round(top)}px`;
        panel.style.right = "auto";
        panel.style.width = `${Math.round(current.width)}px`;
        panel.style.height = `${Math.round(current.height)}px`;
        panel.style.maxHeight = "none";
      };

      const move = (moveEvent) => {
        const current = state.resizeState;
        if (!current) return;
        current.pending = { x: moveEvent.clientX, y: moveEvent.clientY };
        if (current.frame) return;
        current.frame = window.requestAnimationFrame(() => {
          if (state.resizeState) state.resizeState.frame = 0;
          applyResize();
        });
      };

      const finish = () => {
        const current = state.resizeState;
        if (!current) return;
        if (current.frame) window.cancelAnimationFrame(current.frame);
        applyResize();
        state.resizeState = null;
        panel.classList.remove("dsu-resizing");
        state.settings.panelWidth = Math.round(current.width);
        state.settings.panelHeight = Math.round(current.height);
        state.settings.panelLeft = Math.round(current.left);
        state.settings.panelTop = Math.round(current.top);
        scheduleSave();
        schedulePanelClamp();
        scheduleRender();
        window.removeEventListener("pointermove", move, true);
        window.removeEventListener("pointerup", finish, true);
        window.removeEventListener("pointercancel", finish, true);
        window.removeEventListener("mousemove", move, true);
        window.removeEventListener("mouseup", finish, true);
        window.removeEventListener("blur", finish, true);
      };

      window.addEventListener("pointermove", move, true);
      window.addEventListener("pointerup", finish, true);
      window.addEventListener("pointercancel", finish, true);
      window.addEventListener("mousemove", move, true);
      window.addEventListener("mouseup", finish, true);
      window.addEventListener("blur", finish, true);
    };

    panel.addEventListener("pointerdown", startResize, true);
    panel.addEventListener("mousedown", startResize, true);
    handle.addEventListener("dblclick", (event) => {
      event.preventDefault();
      event.stopPropagation();
      state.settings.panelWidth = null;
      state.settings.panelHeight = null;
      panel.style.width = "";
      panel.style.height = "";
      panel.style.maxHeight = "";
      scheduleSave();
      schedulePanelClamp();
      scheduleRender();
    });
  }

  function applyPanelMinimized(panel = state.ui?.panel) {
    if (!panel) return;
    panel.classList.toggle(
      "dsu-minimized",
      Boolean(state.settings.panelMinimized)
    );
    const body = panel.querySelector('[data-field="panelBody"]');
    if (body) body.hidden = Boolean(state.settings.panelMinimized);
    const button = panel.querySelector('[data-action="minimize"]');
    if (button) {
      button.textContent = state.settings.panelMinimized ? "+" : "−";
      button.title = state.settings.panelMinimized ? "展开" : "收起";
    }
    /* Force layout before fitting, so expanding from a narrow bar repositions. */
    panel.getBoundingClientRect();
    clampPanelPosition(panel);
  }

  function toggleMinimized() {
    state.settings.panelMinimized = !state.settings.panelMinimized;
    applyPanelMinimized();
    applyPanelSize();
    scheduleSave();
    clampPanelPosition();
    schedulePanelClamp();
  }

  function openPanel() {
    ensurePanel();
    if (!state.ui?.panel) return;
    if (state.settings.hasOpened !== true) {
      state.settings.panelMinimized = false;
      applyPanelMinimized();
      applyPanelSize();
      state.settings.hasOpened = true;
      scheduleSave();
    }
    state.ui.panel.hidden = false;
    const button = document.getElementById(SIDEBAR_BUTTON_ID);
    button?.setAttribute("data-active", "true");
    render({ animate: true });
    clampPanelPosition();
    schedulePanelClamp();
  }

  function closePanel() {
    if (state.ui?.panel) state.ui.panel.hidden = true;
    const button = document.getElementById(SIDEBAR_BUTTON_ID);
    button?.setAttribute("data-active", "false");
  }

  function togglePanel() {
    if (state.ui?.panel?.hidden === false) closePanel();
    else openPanel();
  }

  function setMode(mode) {
    state.settings.mode = mode === "month" ? "month" : "day";
    scheduleSave();
    render({ animate: true });
  }

  function moveScope(direction) {
    if (state.settings.mode === "month") {
      const [year, month] = state.settings.month.split("-").map(Number);
      const date = new Date(Date.UTC(year, month - 1 + direction, 1));
      state.settings.month = `${date.getUTCFullYear()}-${String(
        date.getUTCMonth() + 1
      ).padStart(2, "0")}`;
      state.settings.day = `${state.settings.month}-01`;
    } else {
      const date = new Date(`${state.settings.day}T12:00:00+08:00`);
      date.setUTCDate(date.getUTCDate() + direction);
      state.settings.day = [
        date.getUTCFullYear(),
        String(date.getUTCMonth() + 1).padStart(2, "0"),
        String(date.getUTCDate()).padStart(2, "0"),
      ].join("-");
    }
    scheduleSave();
    render({ animate: true });
  }

  function setToday() {
    state.settings.day = todayKey();
    state.settings.month = state.settings.day.slice(0, 7);
    scheduleSave();
    render({ animate: true });
  }

  function clearRecords() {
    if (!window.confirm("确定清空 Codex++ 面板中的 DeepSeek 用量统计吗？")) {
      return;
    }
    state.records = [];
    state.turnTotals = Object.create(null);
    state.seen.clear();
    state.keys.clear();
    state.fingerprints.clear();
    scheduleSave();
    updateLauncherBadge();
    render({ animate: true });
  }

  function visibleRecords() {
    if (state.settings.mode === "month") {
      const month = state.settings.month;
      return state.records.filter(
        (record) => String(record.d || "").startsWith(month)
      );
    }
    const day = state.settings.day;
    return state.records.filter((record) => record.d === day);
  }

  function aggregateRecords(records) {
    const totals = {
      calls: records.length,
      input: 0,
      cached: 0,
      miss: 0,
      output: 0,
      reasoning: 0,
      total: 0,
      cost: 0,
    };
    const models = new Map();
    for (const record of records) {
      const input = count(record.i);
      const cached = count(record.c);
      const miss = Math.max(0, input - cached);
      const output = count(record.o);
      totals.input += input;
      totals.cached += cached;
      totals.miss += miss;
      totals.output += output;
      totals.reasoning += count(record.r);
      totals.total += count(record.n) || input + output;
      totals.cost += Number(record.cost || 0);
      const model = record.m || state.settings.model;
      const item = models.get(model) || {
        model,
        calls: 0,
        input: 0,
        output: 0,
        total: 0,
        cost: 0,
      };
      item.calls += 1;
      item.input += input;
      item.output += output;
      item.total += count(record.n) || input + output;
      item.cost += Number(record.cost || 0);
      models.set(model, item);
    }
    return {
      totals,
      models: Array.from(models.values()).sort(
        (a, b) => b.cost - a.cost || b.calls - a.calls
      ),
    };
  }

  function chartBuckets(records) {
    const buckets = new Map();
    if (state.settings.mode === "month") {
      const [year, month] = state.settings.month.split("-").map(Number);
      const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
      for (let index = 1; index <= days; index += 1) {
        const key = `${year}-${String(month).padStart(2, "0")}-${String(index).padStart(2, "0")}`;
        buckets.set(key, {
          label: String(index),
          calls: 0,
          hit: 0,
          miss: 0,
          output: 0,
          cost: 0,
        });
      }
      for (const record of records) {
        const item = buckets.get(record.d);
        if (!item) continue;
        item.hit += count(record.c);
        item.calls += 1;
        item.miss += Math.max(0, count(record.i) - count(record.c));
        item.output += count(record.o);
        item.cost += Number(record.cost || 0);
      }
    } else {
      for (let hour = 0; hour < 24; hour += 1) {
        const key = String(hour).padStart(2, "0");
        buckets.set(key, {
          label: key,
          calls: 0,
          hit: 0,
          miss: 0,
          output: 0,
          cost: 0,
        });
      }
      for (const record of records) {
        const key = hourKey(record.t);
        const item = buckets.get(key);
        if (!item) continue;
        item.hit += count(record.c);
        item.calls += 1;
        item.miss += Math.max(0, count(record.i) - count(record.c));
        item.output += count(record.o);
        item.cost += Number(record.cost || 0);
      }
    }
    return Array.from(buckets.values());
  }

  function setText(field, value) {
    const element = state.ui?.panel?.querySelector(`[data-field="${field}"]`);
    if (element) element.textContent = value;
  }

  function scheduleRender() {
    if (state.ui?.panel && !state.ui.panel.hidden) {
      render();
    }
  }

  function hideChartTooltip() {
    const tooltip = state.ui?.panel?.querySelector(
      '[data-field="chartTooltip"]'
    );
    if (tooltip) tooltip.hidden = true;
  }

  function chartNodeLabel(item) {
    return state.settings.mode === "month"
      ? `${state.settings.month}-${String(item.label).padStart(2, "0")}`
      : `${item.label}:00`;
  }

  function handleChartHover(event) {
    const canvas = state.ui?.chart;
    const tooltip = state.ui?.panel?.querySelector(
      '[data-field="chartTooltip"]'
    );
    if (!canvas || !tooltip) return;
    const canvasRect = canvas.getBoundingClientRect();
    if (!canvasRect.width) return;
    const x = event.clientX - canvasRect.left;
    const hit = state.chartHitboxes.find(
      (item) => x >= item.x && x <= item.x + item.width
    );
    if (!hit) {
      hideChartTooltip();
      return;
    }
    const data = hit.item;
    const total = count(data.hit) + count(data.miss) + count(data.output);
    if (!count(data.calls) && !total) {
      hideChartTooltip();
      return;
    }
    tooltip.innerHTML =
      `<div class="dsu-tip-title">${escapeHtml(chartNodeLabel(data))}</div>` +
      `<div class="dsu-tip-row"><span>请求</span><b>${count(data.calls)} 次</b></div>` +
      `<div class="dsu-tip-row"><span>缓存命中</span><b>${formatTokens(data.hit)}</b></div>` +
      `<div class="dsu-tip-row"><span>缓存未命中</span><b>${formatTokens(data.miss)}</b></div>` +
      `<div class="dsu-tip-row"><span>输出</span><b>${formatTokens(data.output)}</b></div>` +
      `<div class="dsu-tip-row"><span>总 tokens</span><b>${formatTokens(total)}</b></div>` +
      `<div class="dsu-tip-row dsu-tip-cost"><span>费用</span><b>${formatCost(data.cost)}</b></div>`;
    tooltip.hidden = false;

    const card = canvas.closest(".dsu-chart-card");
    const cardRect = card.getBoundingClientRect();
    let left =
      canvasRect.left - cardRect.left + (event.clientX - canvasRect.left) + 14;
    let top =
      canvasRect.top - cardRect.top + (event.clientY - canvasRect.top) - 12;
    const tipRect = tooltip.getBoundingClientRect();
    left = Math.min(
      Math.max(8, left),
      Math.max(8, cardRect.width - tipRect.width - 8)
    );
    top = Math.min(
      Math.max(8, top),
      Math.max(8, cardRect.height - tipRect.height - 8)
    );
    tooltip.style.left = `${Math.round(left)}px`;
    tooltip.style.top = `${Math.round(top)}px`;
  }

  function render({ animate = false } = {}) {
    if (state.renderTimer) return;
    state.renderTimer = window.requestAnimationFrame(() => {
      state.renderTimer = 0;
      if (!state.ui?.panel || state.ui.panel.hidden) return;
      const records = visibleRecords();
      const { totals, models } = aggregateRecords(records);
      const input = totals.input || 0;
      const hitRate = input ? (totals.cached / input) * 100 : 0;
      const selectedModel =
        state.activeModel ||
        state.settings.model ||
        DEFAULT_MODEL;

      state.ui.dateInput.value =
        state.settings.mode === "day" ? state.settings.day : state.settings.day;
      state.ui.monthInput.value = state.settings.month;
      state.ui.dateInput.hidden = state.settings.mode !== "day";
      state.ui.monthInput.hidden = state.settings.mode !== "month";
      state.ui.modelSelect.value = state.settings.model || DEFAULT_MODEL;

      const scopeLabel =
        state.settings.mode === "month"
          ? state.settings.month
          : state.settings.day;
      setText("scopeLabel", scopeLabel);
      setText("calls", String(totals.calls));
      setText("scopeHint", state.settings.mode === "month" ? "按月汇总" : "按天汇总");
      setText("hit", formatTokens(totals.cached));
      setText("hitRate", input ? `命中率 ${hitRate.toFixed(1)}%` : "无输入");
      setText("miss", formatTokens(totals.miss));
      setText("output", formatTokens(totals.output));
      setText(
        "reasoning",
        totals.reasoning ? `其中思考 ${formatTokens(totals.reasoning)}` : ""
      );
      setText("cost", formatCost(totals.cost));
      setText("rate", modelLabel(selectedModel));
      setText(
        "chartTitle",
        state.settings.mode === "month" ? "按天用量" : "按小时用量"
      );
      setText("footerRate", rateSummary(selectedModel));
      setText(
        "miniScope",
        state.settings.mode === "day" && scopeLabel === todayKey()
          ? "今日"
          : scopeLabel
      );
      setText(
        "miniTokens",
        `${formatTokens(totals.total || totals.input + totals.output)} tokens`
      );
      setText("miniCost", formatCost(totals.cost));

      state.ui.panel
        .querySelectorAll('[data-action^="mode-"]')
        .forEach((button) => {
          button.dataset.active = String(
            button.dataset.action === `mode-${state.settings.mode}`
          );
        });

      if (!models.length) {
        state.ui.modelRows.innerHTML =
          '<tr><td colspan="4" class="dsu-empty-row">暂无数据</td></tr>';
      } else {
        state.ui.modelRows.innerHTML = models
          .map(
            (item) =>
              `<tr><td>${escapeHtml(modelLabel(item.model))}</td>` +
              `<td class="dsu-num">${item.calls}</td>` +
              `<td class="dsu-num">${formatTokens(item.total)}</td>` +
              `<td class="dsu-num">${formatCost(item.cost)}</td></tr>`
          )
          .join("");
      }

      const recent = records.slice(-20).reverse();
      if (!recent.length) {
        state.ui.recentRows.innerHTML =
          '<tr><td colspan="5" class="dsu-empty-row">暂无数据</td></tr>';
      } else {
        state.ui.recentRows.innerHTML = recent
          .map(
            (record) =>
              `<tr><td>${escapeHtml(formatDateTime(record.t))}</td>` +
              `<td>${escapeHtml(modelLabel(record.m))}</td>` +
              `<td class="dsu-num">${formatTokens(record.i)}</td>` +
              `<td class="dsu-num">${formatTokens(record.o)}</td>` +
              `<td class="dsu-num">${formatCost(record.cost)}</td></tr>`
          )
          .join("");
      }

      drawChart(chartBuckets(records), animate);
    });
  }

  function drawChart(buckets, animate = false) {
    const canvas = state.ui?.chart;
    if (!canvas) return;
    hideChartTooltip();
    state.chartHitboxes = [];
    const empty = state.ui.panel.querySelector('[data-field="chartEmpty"]');
    const hasData = buckets.some(
      (item) => item.hit + item.miss + item.output > 0
    );
    if (empty) empty.hidden = hasData;
    canvas.hidden = !hasData;
    if (!hasData) return;

    const rect = canvas.getBoundingClientRect();
    const width = Math.max(320, rect.width || canvas.clientWidth || 720);
    const height = 250;
    const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    const context = canvas.getContext("2d");
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, width, height);

    const padding = { top: 18, right: 58, bottom: 32, left: 54 };
    const chartWidth = width - padding.left - padding.right;
    const chartHeight = height - padding.top - padding.bottom;
    const maxTokens = Math.max(
      1,
      ...buckets.map((item) => item.hit + item.miss + item.output)
    );
    const maxCost = Math.max(0.000001, ...buckets.map((item) => item.cost));
    const step = chartWidth / buckets.length;
    const barWidth = Math.max(4, Math.min(22, step * 0.58));
    const colors = {
      hit: "#38bdf8",
      miss: "#fb923c",
      output: "#4ade80",
      cost: "#facc15",
      grid: "#263140",
      text: "#64748b",
    };

    context.font = "10px Segoe UI, sans-serif";
    context.textAlign = "right";
    context.textBaseline = "middle";
    for (let index = 0; index <= 4; index += 1) {
      const y = padding.top + chartHeight - (chartHeight * index) / 4;
      context.strokeStyle = colors.grid;
      context.lineWidth = 1;
      context.beginPath();
      context.moveTo(padding.left, y);
      context.lineTo(padding.left + chartWidth, y);
      context.stroke();
      context.fillStyle = colors.text;
      context.fillText(
        formatTokens((maxTokens * index) / 4),
        padding.left - 8,
        y
      );
    }

    const labelEvery = buckets.length > 20 ? 3 : 1;
    buckets.forEach((item, index) => {
      const x = padding.left + index * step + step / 2;
      state.chartHitboxes.push({
        x: padding.left + index * step,
        width: step,
        item,
      });
      let y = padding.top + chartHeight;
      const values = [
        [item.hit, colors.hit],
        [item.miss, colors.miss],
        [item.output, colors.output],
      ];
      for (const [value, color] of values) {
        const barHeight = (chartHeight * value) / maxTokens;
        if (barHeight <= 0) continue;
        y -= barHeight;
        context.fillStyle = color;
        context.fillRect(x - barWidth / 2, y, barWidth, barHeight);
      }
      if (index % labelEvery === 0 || index === buckets.length - 1) {
        context.fillStyle = colors.text;
        context.textAlign = "center";
        context.textBaseline = "top";
        context.fillText(item.label, x, padding.top + chartHeight + 8);
      }
    });

    context.strokeStyle = colors.cost;
    context.lineWidth = 1.6;
    context.beginPath();
    buckets.forEach((item, index) => {
      const x = padding.left + index * step + step / 2;
      const y = padding.top + chartHeight - (chartHeight * item.cost) / maxCost;
      if (index === 0) context.moveTo(x, y);
      else context.lineTo(x, y);
    });
    context.stroke();
    context.fillStyle = colors.cost;
    buckets.forEach((item, index) => {
      const x = padding.left + index * step + step / 2;
      const y = padding.top + chartHeight - (chartHeight * item.cost) / maxCost;
      context.beginPath();
      context.arc(x, y, 2.2, 0, Math.PI * 2);
      context.fill();
    });

    context.textAlign = "left";
    context.textBaseline = "middle";
    for (let index = 0; index <= 2; index += 1) {
      const y = padding.top + chartHeight - (chartHeight * index) / 2;
      context.fillStyle = "#a16207";
      context.fillText(
        formatCost((maxCost * index) / 2),
        padding.left + chartWidth + 8,
        y
      );
    }
  }

  function scheduleEnsure() {
    if (state.ensureTimer) return;
    state.ensureTimer = window.requestAnimationFrame(() => {
      state.ensureTimer = 0;
      ensureLauncher();
      ensurePanel();
    });
  }

  function start() {
    installStyles();
    scheduleEnsure();
    const observer = new MutationObserver(scheduleEnsure);
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
    });
    updateLauncherBadge();
  }

  loadState();
  installCapture();
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }

  window[PANEL_API] = {
    version: VERSION,
    open: openPanel,
    close: closePanel,
    toggle: togglePanel,
    reposition: () => {
      clampPanelPosition();
      schedulePanelClamp();
    },
    getState: () => JSON.parse(JSON.stringify(state.records)),
    importProxyRecords: (records) => {
      if (!Array.isArray(records)) return 0;
      let imported = 0;
      for (const record of records) {
        if (!record || typeof record !== "object") continue;
        const timestamp =
          Date.parse(record.created_utc || "") ||
          Date.parse(String(record.created_at || "") + "+08:00") ||
          Date.now();
        const usage = normalizeUsage({
          input_tokens: record.prompt_tokens,
          cached_tokens: record.cache_hit_tokens,
          output_tokens: record.completion_tokens,
          reasoning_tokens: record.reasoning_tokens,
          total_tokens: record.total_tokens,
        });
        if (!usage) continue;
        const model = normalizeModel(record.model);
        const id = record.request_id || record.created_utc || "";
        const added = addRecord({
          timestamp,
          model,
          usage,
          source: "proxy-import",
          id,
        });
        if (added) imported += 1;
      }
      scheduleSave();
      updateLauncherBadge();
      scheduleRender();
      return imported;
    },
    replaceProxyRecords: (records) => {
      state.records = [];
      state.keys.clear();
      state.seen.clear();
      state.fingerprints.clear();
      const imported = window[PANEL_API].importProxyRecords(records);
      scheduleSave();
      return imported;
    },
    mergeProxyRecords: (records) =>
      window[PANEL_API].importProxyRecords(records),
    clear: clearRecords,
  };
})();

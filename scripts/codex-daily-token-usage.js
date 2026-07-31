// ==UserScript==
// @name         Codex Daily Token Usage
// @namespace    codex-plus-plus
// @version      1.4.13
// @description  每日 Token 统计，近 5 日滚动存储，优先复用已有采集，必要时内置采集，支持 Model 价格、成本估算、日期切换、5 日趋势与分享图。
// @match        app://-/*
// @run-at       document-start
// ==/UserScript==

(() => {
  "use strict";

  const VERSION = "1.4.13";
  const API_KEY = "__codexDailyTokenUsage";
  const SOURCE_API_KEY = "__codexTokenUsage";
  const STORAGE_KEY = "__codexDailyTokenUsageV1";
  const PRICE_STORAGE_KEY = "__codexDailyTokenUsageModelPricesV1";
  const ROOT_ID = "codex-daily-token-usage";
  const PANEL_ID = "codex-daily-token-usage-panel";
  const STYLE_ID = "codex-daily-token-usage-style";
  const CODEX_PLUS_MENU_ID = "codex-plus-menu";
  const APP_HEADER_SELECTOR = ".app-header-tint";
  const APP_HEADER_SURFACE_SELECTOR = '[data-testid="app-shell-header-context-menu-surface"]';
  const HEADER_TOOLBAR_CLUSTER_SELECTOR = ".ms-auto.flex.shrink-0.items-center";
  const HEADER_TOOLBAR_CLASS_SELECTOR = '[class*="ms-auto"][class*="shrink-0"][class*="items-center"]';
  const TOP_OBSTACLE_SELECTOR = `button,[role='button'],input,select,textarea,a[href],#${CODEX_PLUS_MENU_ID},[data-testid]`;
  const POLL_INTERVAL_MS = 1000;
  const RETAIN_DAYS = 5;
  const MAX_TURNS_PER_DAY = 2000;
  const MAX_TOOL_CALLS_PER_DAY = 500;
  const MAX_TOOL_CALL_EVENT_KEYS_PER_DAY = 3000;
  const MAX_TOOL_CALL_EVENTS_PER_DAY = 3000;
  const TOOL_USAGE_MATCH_WINDOW_MS = 15 * 60 * 1000;
  const CAPTURE_DEDUPE_WINDOW_MS = 3000;
  const TOOL_CALL_DEDUPE_WINDOW_MS = 3000;
  const MAX_CAPTURE_BODY_CHARS = 2_000_000;
  const EXTERNAL_EMPTY_LIMIT = 4;
  const TREND_DAYS = 5;
  const MODEL_BIND_WINDOW_MS = 30 * 60 * 1000;
  const UNKNOWN_MODEL = "Unknown";
  const PRICE_FIELDS = ["input", "cachedInput", "output", "reasoning"];
  const DEFAULT_OPENAI_PRICE_SOURCE = "OpenAI API Pricing · Standard · USD / 1M tokens";
  const DEFAULT_OPENAI_MODEL_PRICES = Object.freeze({
    "gpt-5.6-sol": { input: 5, cachedInput: 0.5, output: 30 },
    "gpt-5.6-terra": { input: 2.5, cachedInput: 0.25, output: 15 },
    "gpt-5.6-luna": { input: 1, cachedInput: 0.1, output: 6 },
    "gpt-5.5": { input: 5, cachedInput: 0.5, output: 30 },
    "gpt-5.5-pro": { input: 30, output: 180 },
    "gpt-5.4": { input: 2.5, cachedInput: 0.25, output: 15 },
    "gpt-5.4-mini": { input: 0.75, cachedInput: 0.075, output: 4.5 },
    "gpt-5.4-nano": { input: 0.2, cachedInput: 0.02, output: 1.25 },
    "gpt-5.4-pro": { input: 30, output: 180 },
    "gpt-5.3-chat-latest": { input: 1.75, cachedInput: 0.175, output: 14 },
    "gpt-5.2": { input: 1.75, cachedInput: 0.175, output: 14 },
    "gpt-5.2-pro": { input: 21, output: 168 },
    "gpt-5.2-chat-latest": { input: 1.75, cachedInput: 0.175, output: 14 },
    "gpt-5.1": { input: 1.25, cachedInput: 0.125, output: 10 },
    "gpt-5.1-chat-latest": { input: 1.25, cachedInput: 0.125, output: 10 },
    "gpt-5": { input: 1.25, cachedInput: 0.125, output: 10 },
    "gpt-5-chat-latest": { input: 1.25, cachedInput: 0.125, output: 10 },
    "gpt-5-mini": { input: 0.25, cachedInput: 0.025, output: 2 },
    "gpt-5-nano": { input: 0.05, cachedInput: 0.005, output: 0.4 },
    "gpt-5-pro": { input: 15, output: 120 },
    "gpt-5.3-codex": { input: 1.75, cachedInput: 0.175, output: 14 },
    "gpt-5.2-codex": { input: 1.75, cachedInput: 0.175, output: 14 },
    "gpt-5.1-codex-max": { input: 1.25, cachedInput: 0.125, output: 10 },
    "gpt-5.1-codex": { input: 1.25, cachedInput: 0.125, output: 10 },
    "gpt-5-codex": { input: 1.25, cachedInput: 0.125, output: 10 },
    "gpt-5.1-codex-mini": { input: 0.25, cachedInput: 0.025, output: 2 },
    "codex-mini-latest": { input: 1.5, cachedInput: 0.375, output: 6 },
    "chat-latest": { input: 5, cachedInput: 0.5, output: 30 },
    "chatgpt-4o-latest": { input: 5, output: 15 },
    "gpt-4.1": { input: 2, cachedInput: 0.5, output: 8 },
    "gpt-4.1-mini": { input: 0.4, cachedInput: 0.1, output: 1.6 },
    "gpt-4.1-nano": { input: 0.1, cachedInput: 0.025, output: 0.4 },
    "gpt-4o": { input: 2.5, cachedInput: 1.25, output: 10 },
    "gpt-4o-2024-05-13": { input: 5, output: 15 },
    "gpt-4o-mini": { input: 0.15, cachedInput: 0.075, output: 0.6 },
    o1: { input: 15, cachedInput: 7.5, output: 60 },
    "o1-pro": { input: 150, output: 600 },
    "o3-pro": { input: 20, output: 80 },
    o3: { input: 2, cachedInput: 0.5, output: 8 },
    "o4-mini": { input: 1.1, cachedInput: 0.275, output: 4.4 },
    "o3-mini": { input: 1.1, cachedInput: 0.55, output: 4.4 },
    "o1-mini": { input: 1.1, cachedInput: 0.55, output: 4.4 },
    "gpt-4-turbo-2024-04-09": { input: 10, output: 30 },
    "gpt-4-0125-preview": { input: 10, output: 30 },
    "gpt-4-1106-preview": { input: 10, output: 30 },
    "gpt-4-1106-vision-preview": { input: 10, output: 30 },
    "gpt-4-0613": { input: 30, output: 60 },
    "gpt-4-0314": { input: 30, output: 60 },
    "gpt-4-32k": { input: 60, output: 120 },
    "gpt-3.5-turbo": { input: 0.5, output: 1.5 },
    "gpt-3.5-turbo-0125": { input: 0.5, output: 1.5 },
    "gpt-3.5-turbo-1106": { input: 1, output: 2 },
    "gpt-3.5-turbo-0613": { input: 1.5, output: 2 },
    "gpt-3.5-0301": { input: 1.5, output: 2 },
    "gpt-3.5-turbo-instruct": { input: 1.5, output: 2 },
    "gpt-3.5-turbo-16k-0613": { input: 3, output: 4 },
    "davinci-002": { input: 2, output: 2 },
    "babbage-002": { input: 0.4, output: 0.4 },
    "gpt-5.5-cyber": { input: 12.5, cachedInput: 1.25, output: 75 },
    "gpt-5-search-api": { input: 1.25, cachedInput: 0.125, output: 10 },
    "gpt-4o-search-preview": { input: 2.5, output: 10 },
    "gpt-4o-mini-search-preview": { input: 0.15, output: 0.6 },
    "o3-deep-research": { input: 10, cachedInput: 2.5, output: 40 },
    "o4-mini-deep-research": { input: 2, cachedInput: 0.5, output: 8 },
    "computer-use-preview": { input: 3, output: 12 },
  });
  const FLOATING_TOP = 2;
  const FLOATING_DEFAULT_RIGHT = 280;
  const FLOATING_SAFE_GAP = 8;
  const FLOATING_SCAN_TOP = 96;
  const FLOATING_MIN_WIDTH = 94;
  const FLOATING_COMPACT_WIDTH = 31;
  const FLOATING_HEIGHT = 31;
  const PANEL_GAP = 8;
  const PANEL_MARGIN = 12;
  const WINDOW_BUTTON_SAFE_RIGHT = 132;
  const DOM_TOOL_DESCRIPTORS = [
    { selector: '[data-testid="exec-shell-body"]', testId: "exec-shell-body", kind: "plugin", name: "exec_command" },
  ];

  const previous = window[API_KEY];
  if (previous && typeof previous.destroy === "function") {
    try {
      previous.destroy();
    } catch {
      // 旧实例清理失败不应阻止新实例加载。
    }
  }

  let root = null;
  let panel = null;
  let style = null;
  let observer = null;
  let resizeObserver = null;
  let layoutRaf = 0;
  let pollTimer = null;
  let midnightTimer = null;
  let closeTimer = null;
  let shareFeedbackTimer = null;
  let pinnedOpen = false;
  let destroyed = false;
  let sourceMode = "waiting";
  let captureInstalled = false;
  let modelCaptureInstalled = false;
  let lastCaptureAt = 0;
  let captureSeq = 0;
  let externalEmptyCount = 0;
  let lastRenderedTotal = -1;
  let lastDateKey = getDateKey(Date.now());
  let selectedDateKey = lastDateKey;
  let state = loadState();
  if (pruneState()) saveState();
  let priceConfig = loadPriceConfig();
  let lastObservedModel = "";
  let lastObservedModelAt = 0;
  let lastObservedModelConfidence = "unknown";
  const modelByConversationKey = new Map();
  const resizeObservedNodes = new WeakSet();

  function toCount(value) {
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? Math.round(number) : 0;
  }

  function firstCount(...values) {
    for (const value of values) {
      const number = toCount(value);
      if (number > 0) return number;
    }
    return 0;
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

    const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    if (
      date.getFullYear() !== Number(match[1]) ||
      date.getMonth() !== Number(match[2]) - 1 ||
      date.getDate() !== Number(match[3])
    ) {
      return null;
    }
    date.setHours(12, 0, 0, 0);
    return date;
  }

  function shiftDateKey(dateKey, days) {
    const date = parseDateKey(dateKey);
    if (!date) return getDateKey(Date.now());
    date.setDate(date.getDate() + Number(days || 0));
    return getDateKey(date.getTime());
  }

  function getMinimumDateKey(now = Date.now()) {
    const date = new Date(now);
    date.setHours(12, 0, 0, 0);
    date.setDate(date.getDate() - RETAIN_DAYS + 1);
    return getDateKey(date.getTime());
  }

  function clampDateKey(dateKey, now = Date.now()) {
    const parsed = parseDateKey(dateKey);
    const todayKey = getDateKey(now);
    const minimumKey = getMinimumDateKey(now);
    if (!parsed) return todayKey;
    return dateKey < minimumKey ? minimumKey : dateKey > todayKey ? todayKey : dateKey;
  }

  function parseTimestamp(value) {
    if (value == null || value === "") return null;
    if (typeof value === "number") {
      if (!Number.isFinite(value)) return null;
      if (value > 1_500_000_000_000) return value;
      if (value > 1_500_000_000) return value * 1000;
      return null;
    }
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (!trimmed) return null;
      if (/^\d+(?:\.\d+)?$/.test(trimmed)) return parseTimestamp(Number(trimmed));
      const parsed = Date.parse(trimmed);
      return Number.isFinite(parsed) && parsed > 1_500_000_000_000 ? parsed : null;
    }
    return null;
  }

  function parseUuidV7Timestamp(value) {
    const text = String(value || "").trim();
    const match = /\b([0-9a-f]{8})-?([0-9a-f]{4})-?7[0-9a-f]{3}-?[89ab][0-9a-f]{3}-?[0-9a-f]{12}\b/i.exec(text);
    if (!match) return null;
    return parseTimestamp(Number.parseInt(`${match[1]}${match[2]}`, 16));
  }

  function latestNestedTimestamp(items) {
    if (!Array.isArray(items)) return null;
    let latest = null;
    for (const item of items) {
      const timestamp = parseTimestamp(
        item?.observedAt ??
          item?.observed_at ??
          item?.createdAt ??
          item?.created_at ??
          item?.updatedAt ??
          item?.updated_at ??
          item?.timestamp
      );
      if (timestamp && (!latest || timestamp > latest)) latest = timestamp;
    }
    return latest;
  }

  function getTurnTimestamp(turn) {
    const encoded = parseTimestamp(String(turn?.turnId || "").split("-")[0]);
    if (encoded) return encoded;

    const idEncoded = parseTimestamp(String(turn?.id || "").split("-")[0]);
    if (idEncoded) return idEncoded;

    const direct = parseTimestamp(
      turn?.createdAt ??
        turn?.created_at ??
        turn?.observedAt ??
        turn?.observed_at ??
        turn?.updatedAt ??
        turn?.updated_at ??
        turn?.startedAt ??
        turn?.started_at ??
        turn?.lastUpdatedAt ??
        turn?.last_updated_at ??
        turn?.timestamp
    );
    if (direct) return direct;

    return latestNestedTimestamp(turn?.calls) || latestNestedTimestamp(turn?.ledgerEvents);
  }

  function normalizeUsage(rawUsage) {
    const usage = rawUsage && typeof rawUsage === "object" ? rawUsage : {};
    const input = firstCount(
      usage.inputTotalTokens,
      usage.input_total_tokens,
      usage.promptTotalTokens,
      usage.prompt_total_tokens,
      usage.inputTokens,
      usage.input_tokens,
      usage.promptTokens,
      usage.prompt_tokens
    );
    const output = firstCount(
      usage.outputTotalTokens,
      usage.outputTokens,
      usage.output_tokens,
      usage.completionTokens,
      usage.completion_tokens
    );
    const cached = firstCount(
      usage.cachedReadTokens,
      usage.cachedTokens,
      usage.cacheReadTokens,
      usage.cachedInputTokens,
      usage.cached_input_tokens,
      usage.cacheReadInputTokens,
      usage.cache_read_input_tokens,
      usage.promptTokensDetails?.cachedTokens,
      usage.prompt_tokens_details?.cached_tokens,
      usage.inputTokensDetails?.cachedTokens,
      usage.input_tokens_details?.cached_tokens
    );
    const reasoning = firstCount(
      usage.reasoningTokens,
      usage.reasoning_tokens,
      usage.outputTokensDetails?.reasoningTokens,
      usage.output_tokens_details?.reasoning_tokens
    );
    const total = firstCount(
      usage.requestTotalTokens,
      usage.totalTokens,
      usage.total_tokens,
      usage.usedTokens,
      usage.used_tokens,
      usage.used,
      input + output
    );

    return { input, output, cached, reasoning, total };
  }

  function normalizeModelName(value) {
    if (typeof value !== "string") return "";
    const model = value.trim();
    if (!model || model.length > 120) return "";
    if (/^(null|undefined|default)$/i.test(model)) return "";
    return model;
  }

  function displayModelName(model) {
    return normalizeModelName(model) || UNKNOWN_MODEL;
  }

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
      value.params?.model,
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

  function normalizeConversationKey(value) {
    if (typeof value !== "string") return "";
    const key = value.trim();
    if (!key || key.length > 160) return "";
    return key;
  }

  function conversationKeyVariants(value) {
    const key = normalizeConversationKey(value);
    if (!key) return [];
    const variants = new Set([key]);
    const slashTail = key.split("/").filter(Boolean).at(-1);
    if (slashTail) variants.add(slashTail);
    const colonTail = key.split(":").filter(Boolean).at(-1);
    if (colonTail) variants.add(colonTail);
    return Array.from(variants);
  }

  function extractConversationKey(value) {
    if (!value || typeof value !== "object") return "";
    const candidates = [
      value.conversationId,
      value.conversation_id,
      value.threadId,
      value.thread_id,
      value.turn?.conversationId,
      value.turn?.threadId,
      value.thread?.id,
      value.params?.conversationId,
      value.params?.conversation_id,
      value.params?.threadId,
      value.params?.thread_id,
      value.params?.turn?.conversationId,
      value.params?.turn?.threadId,
      value.params?.thread?.id,
      value.request?.conversationId,
      value.request?.params?.conversationId,
      value.request?.params?.conversation_id,
      value.request?.params?.threadId,
      value.request?.params?.thread_id,
      value.request?.params?.thread?.id,
    ];
    return candidates.map(normalizeConversationKey).find(Boolean) || "";
  }

  function parseMaybeJsonObject(value) {
    if (!value) return null;
    if (typeof value === "object") return value;
    if (typeof value !== "string") return null;
    return safeParseJson(value);
  }

  function extractModelFromAppMessage(message) {
    if (!message || typeof message !== "object") return "";
    const type = String(message.type || "");
    const method = String(message.method || message.request?.method || "");
    const params = message.params || message.request?.params || null;
    const body = parseMaybeJsonObject(message.body);

    if (type === "mcp-request" || type === "thread-prewarm-start") {
      return extractDirectModel({ method, params, request: message.request });
    }
    if (
      type === "start-conversation" ||
      type === "start-turn-for-host" ||
      type === "update-thread-settings-for-next-turn" ||
      type === "thread-follower-update-thread-settings-for-host" ||
      type === "thread-follower-start-turn-for-host" ||
      type === "send-cli-request-for-host" ||
      type === "prewarm-thread-start-for-host"
    ) {
      return extractDirectModel(message);
    }
    if (type === "fetch" || type === "fetch-stream") {
      const url = String(message.url || "");
      if (/vscode:\/\/codex\/(start-conversation|start-turn-for-host|update-thread-settings|send-cli-request|prewarm-thread-start)/.test(url)) {
        return extractDirectModel(body || message);
      }
      return "";
    }
    if (type === "mcp-notification") {
      if (method === "thread/settings/updated") return extractDirectModel(params?.threadSettings || params);
      if (method === "model/rerouted") return normalizeModelName(params?.toModel) || extractDirectModel(params);
      if (method === "thread/started") return extractDirectModel(params?.thread || params);
      if (method === "turn/started") return extractDirectModel(params?.turn || params);
    }
    if (type === "thread/settings/updated") return extractDirectModel(message.threadSettings || message);
    if (type === "model/rerouted") return normalizeModelName(message.toModel) || extractDirectModel(message);
    if (type === "thread/started") return extractDirectModel(message.thread || message);
    if (type === "turn/started") return extractDirectModel(message.turn || message);
    return "";
  }

  function rememberConversationModel(conversationKey, model, confidence = "observed", timestamp = Date.now()) {
    const normalized = normalizeModelName(model);
    if (!normalized) return false;
    const updatedAt = Number.isFinite(timestamp) ? timestamp : Date.now();
    for (const key of conversationKeyVariants(conversationKey)) {
      modelByConversationKey.set(key, { model: normalized, confidence, updatedAt });
    }
    return true;
  }

  function modelForConversationKey(conversationKey) {
    for (const key of conversationKeyVariants(conversationKey)) {
      const entry = modelByConversationKey.get(key);
      if (entry?.model) return entry;
    }
    return null;
  }

  function observeModel(model, confidence = "observed", timestamp = Date.now(), conversationKey = "") {
    const normalized = normalizeModelName(model);
    if (!normalized) return false;
    lastObservedModel = normalized;
    lastObservedModelAt = Number.isFinite(timestamp) ? timestamp : Date.now();
    lastObservedModelConfidence = confidence;
    rememberConversationModel(conversationKey, normalized, confidence, lastObservedModelAt);
    return true;
  }

  function observeAppModelMessage(message, confidence = "observed") {
    const model = extractModelFromAppMessage(message);
    const conversationKey = extractConversationKey(message);
    if (model) return observeModel(model, confidence, Date.now(), conversationKey);
    const nearby = modelForTimestamp(Date.now());
    if (conversationKey && nearby) {
      return rememberConversationModel(conversationKey, nearby, lastObservedModelConfidence || "nearby");
    }
    return false;
  }

  function modelForTimestamp(timestamp = Date.now()) {
    if (!lastObservedModel || !lastObservedModelAt) return "";
    const time = Number.isFinite(timestamp) ? timestamp : Date.now();
    return Math.abs(time - lastObservedModelAt) <= MODEL_BIND_WINDOW_MS ? lastObservedModel : "";
  }

  function extractTurnModel(turn, timestamp = Date.now()) {
    const direct = extractDirectModel(turn);
    if (direct) return { model: direct, confidence: "observed" };
    const keyed = modelForConversationKey(extractConversationKey(turn));
    if (keyed?.model) return { model: keyed.model, confidence: keyed.confidence || "conversation" };
    const nearby = modelForTimestamp(timestamp);
    if (nearby) return { model: nearby, confidence: lastObservedModelConfidence || "nearby" };
    return { model: UNKNOWN_MODEL, confidence: "unknown" };
  }

  function normalizeToolName(value) {
    const text = String(value ?? "").trim();
    if (!text || /^(none|null|undefined)$/i.test(text)) return "";
    return text.replace(/\s+/g, " ").slice(0, 160);
  }

  function normalizeToolNamespace(value) {
    const text = String(value ?? "").trim();
    if (!text || /^(none|null|undefined)$/i.test(text)) return "";
    return text.replace(/\s+/g, " ").slice(0, 120);
  }

  function parseMcpToolName(name) {
    const normalized = normalizeToolName(name);
    if (!normalized.startsWith("mcp__")) return null;
    const parts = normalized.split("__").filter(Boolean);
    if (parts.length < 3 || parts[0] !== "mcp") return null;
    return {
      namespace: normalizeToolNamespace(parts[1]),
      name: normalizeToolName(parts.slice(2).join("__")),
    };
  }

  function classifyToolKind(name, namespace, kind = "") {
    const text = `${kind} ${namespace || ""} ${name || ""}`.toLowerCase();
    if (text.includes("mcp") || String(name || "").startsWith("mcp__")) return "mcp";
    return "plugin";
  }

  function normalizeToolEvent(event) {
    if (!event || typeof event !== "object") return null;
    const parsedMcpName = parseMcpToolName(event.name);
    const rawName = parsedMcpName?.name || event.name;
    const name = normalizeToolName(rawName);
    if (!name) return null;

    const namespace = normalizeToolNamespace(event.namespace || parsedMcpName?.namespace);
    const kind = classifyToolKind(name, namespace, event.kind || (parsedMcpName ? "mcp" : ""));
    return {
      kind,
      name,
      namespace,
      id: normalizeToolName(event.id),
      source: normalizeToolName(event.source),
      timestamp: parseTimestamp(event.timestamp) || Date.now(),
      turnKey: normalizeConversationKey(event.turnKey || event.turn_id || event.turnId),
      conversationKey: normalizeConversationKey(event.conversationKey || event.conversationId || event.conversation_id),
    };
  }

  function toolCallKey(kind, namespace, name) {
    return [kind || "plugin", namespace || "", name || ""].join("|").toLowerCase();
  }

  function toolCallEventKey(event) {
    if (!event?.id) return "";
    return `${event.kind || "plugin"}|${event.namespace || ""}|${event.name || ""}|id:${event.id}`.toLowerCase();
  }

  function displayToolKind(kind) {
    return kind === "mcp" ? "MCP" : "插件";
  }

  function compactToolEvent(event, timestamp) {
    return {
      kind: event.kind,
      name: event.name,
      namespace: event.namespace,
      id: event.id,
      source: event.source || "capture",
      timestamp,
      turnKey: event.turnKey || "",
      conversationKey: event.conversationKey || "",
    };
  }

  function isUsageTurn(turn) {
    if (!turn || typeof turn !== "object" || !turn.turnId) return false;
    const usage = normalizeUsage(turn.usage);
    return usage.total > 0 && (usage.input > 0 || usage.output > 0);
  }

  function createEmptyState() {
    return { version: 1, days: {} };
  }

  function loadState() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
      if (parsed?.version === 1 && parsed.days && typeof parsed.days === "object") {
        return parsed;
      }
    } catch {
      // 损坏或不可访问的本地数据按空状态处理。
    }
    return createEmptyState();
  }

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      return true;
    } catch {
      return false;
    }
  }

  function createEmptyPriceConfig() {
    return { version: 1, currency: "USD", models: {} };
  }

  function normalizePriceNumber(value, allowNull = true) {
    if (value === "" || value == null) return allowNull ? null : 0;
    const number = Number(value);
    if (!Number.isFinite(number) || number < 0) return allowNull ? null : 0;
    return Number(number.toFixed(6));
  }

  function normalizePriceEntry(entry) {
    const source = entry && typeof entry === "object" ? entry : {};
    return {
      input: normalizePriceNumber(source.input),
      cachedInput: normalizePriceNumber(source.cachedInput),
      output: normalizePriceNumber(source.output),
      reasoning: normalizePriceNumber(source.reasoning),
    };
  }

  function isPriceEntryEmpty(entry) {
    const normalized = normalizePriceEntry(entry);
    return PRICE_FIELDS.every((field) => normalized[field] == null);
  }

  function defaultModelPrice(model) {
    const normalized = normalizeModelName(model);
    const lookup = normalized.replace(/\s+\([^)]*\)\s*$/, "").toLowerCase();
    const entry = normalized
      ? DEFAULT_OPENAI_MODEL_PRICES[normalized] || DEFAULT_OPENAI_MODEL_PRICES[lookup]
      : null;
    return entry ? normalizePriceEntry(entry) : null;
  }

  function mergePriceEntries(base, override) {
    const merged = normalizePriceEntry(base);
    const custom = normalizePriceEntry(override);
    for (const field of PRICE_FIELDS) {
      if (custom[field] != null) merged[field] = custom[field];
    }
    return isPriceEntryEmpty(merged) ? null : merged;
  }

  function loadPriceConfig() {
    try {
      const parsed = JSON.parse(localStorage.getItem(PRICE_STORAGE_KEY) || "null");
      if (parsed?.version === 1 && parsed.models && typeof parsed.models === "object") {
        const models = {};
        for (const [model, entry] of Object.entries(parsed.models)) {
          const normalizedModel = normalizeModelName(model);
          if (!normalizedModel) continue;
          const normalizedEntry = normalizePriceEntry(entry);
          if (!isPriceEntryEmpty(normalizedEntry)) models[normalizedModel] = normalizedEntry;
        }
        return { version: 1, currency: "USD", models };
      }
    } catch {
      // 价格配置损坏时回到空配置，避免影响主统计。
    }
    return createEmptyPriceConfig();
  }

  function savePriceConfig() {
    try {
      localStorage.setItem(PRICE_STORAGE_KEY, JSON.stringify(priceConfig));
      return true;
    } catch {
      return false;
    }
  }

  function getModelPriceInfo(model) {
    const normalized = normalizeModelName(model);
    if (!normalized) return { price: null, source: "none", hasCustom: false, hasDefault: false };
    const custom = normalizePriceEntry(priceConfig.models[normalized]);
    const defaultPrice = defaultModelPrice(normalized);
    const hasCustom = !isPriceEntryEmpty(custom);
    const hasDefault = !isPriceEntryEmpty(defaultPrice);
    const price = mergePriceEntries(defaultPrice, custom);
    return {
      price,
      source: hasCustom ? "custom" : hasDefault ? "default" : "none",
      hasCustom,
      hasDefault,
    };
  }

  function getModelPrice(model) {
    return getModelPriceInfo(model).price;
  }

  function setModelPrice(model, entry) {
    const normalized = normalizeModelName(model);
    if (!normalized) return false;
    const next = normalizePriceEntry(entry);
    if (isPriceEntryEmpty(next)) delete priceConfig.models[normalized];
    else priceConfig.models[normalized] = next;
    savePriceConfig();
    render();
    return true;
  }

  function updateModelPriceField(model, field, value) {
    if (!PRICE_FIELDS.includes(field)) return false;
    const normalized = normalizeModelName(model);
    if (!normalized) return false;
    const current = normalizePriceEntry(priceConfig.models[normalized]);
    current[field] = normalizePriceNumber(value);
    if (isPriceEntryEmpty(current)) delete priceConfig.models[normalized];
    else priceConfig.models[normalized] = current;
    savePriceConfig();
    refreshPriceDependentDisplays();
    return true;
  }

  function clearModelPrice(model) {
    const normalized = normalizeModelName(model);
    if (!normalized) return false;
    delete priceConfig.models[normalized];
    savePriceConfig();
    render();
    return true;
  }

  function calculateUsageCost(usage, price) {
    const entry = normalizePriceEntry(price);
    const configured = PRICE_FIELDS.some((field) => entry[field] != null);
    if (!configured) return { cost: 0, configured: false };

    const input = toCount(usage?.input);
    const cached = Math.min(input, toCount(usage?.cached));
    const output = toCount(usage?.output);
    const reasoning = Math.min(output, toCount(usage?.reasoning));
    const inputRate = entry.input ?? 0;
    const cachedRate = entry.cachedInput ?? inputRate;
    const outputRate = entry.output ?? 0;
    const reasoningRate = entry.reasoning ?? outputRate;
    const billableInput = Math.max(0, input - cached);
    const visibleOutput = Math.max(0, output - reasoning);
    const cost =
      (billableInput * inputRate +
        cached * cachedRate +
        visibleOutput * outputRate +
        reasoning * reasoningRate) /
      1_000_000;
    return { cost, configured: true };
  }

  function formatCost(value) {
    const number = Number(value);
    if (!Number.isFinite(number) || number <= 0) return "$0.0000";
    const digits = number >= 1 ? 2 : number >= 0.01 ? 4 : 6;
    return `$${number.toFixed(digits)}`;
  }

  function formatPriceInputValue(value) {
    const number = normalizePriceNumber(value);
    return number == null ? "" : String(number);
  }

  function refreshPriceDependentDisplays() {
    if (!panel) return;
    const snapshot = aggregateDay(selectedDateKey);
    const cost = panel.querySelector('[data-field="cost"]');
    if (cost) cost.textContent = formatCost(snapshot.cost);
    renderModelBreakdown(snapshot);
  }

  function pruneState(now = Date.now()) {
    const cutoff = new Date(now);
    cutoff.setHours(0, 0, 0, 0);
    cutoff.setDate(cutoff.getDate() - RETAIN_DAYS + 1);

    let changed = false;
    for (const key of Object.keys(state.days)) {
      const timestamp = Date.parse(`${key}T00:00:00`);
      if (!Number.isFinite(timestamp) || timestamp < cutoff.getTime()) {
        delete state.days[key];
        changed = true;
      }
    }
    return changed;
  }

  function upsertTurn(turn) {
    if (!isUsageTurn(turn)) return false;

    const timestamp = getTurnTimestamp(turn);
    if (!timestamp) return false;
    const dateKey = getDateKey(timestamp);
    const usage = normalizeUsage(turn.usage);
    const modelMeta = extractTurnModel(turn, timestamp);
    const conversationKey = normalizeConversationKey(turn.conversationKey || turn.conversationId || turn.conversation_id || extractConversationKey(turn));
    const day = state.days[dateKey] || { turns: {}, updatedAt: 0 };
    const existing = day.turns[turn.turnId];
    const candidate = {
      input: usage.input,
      output: usage.output,
      cached: usage.cached,
      reasoning: usage.reasoning,
      total: usage.total,
      calls: Math.max(1, toCount(turn.callCount)),
      updatedAt: timestamp,
      source: String(turn.source || "turn-aggregate"),
      model: modelMeta.model,
      modelConfidence: modelMeta.confidence,
      conversationKey,
    };

    if (existing && existing.total > candidate.total) {
      if (
        (candidate.model !== UNKNOWN_MODEL && (!existing.model || existing.model === UNKNOWN_MODEL)) ||
        (candidate.conversationKey && !existing.conversationKey)
      ) {
        day.turns[turn.turnId] = {
          ...existing,
          model:
            candidate.model !== UNKNOWN_MODEL && (!existing.model || existing.model === UNKNOWN_MODEL)
              ? candidate.model
              : existing.model,
          modelConfidence:
            candidate.model !== UNKNOWN_MODEL && (!existing.model || existing.model === UNKNOWN_MODEL)
              ? candidate.modelConfidence
              : existing.modelConfidence,
          conversationKey: existing.conversationKey || candidate.conversationKey,
          updatedAt: Math.max(existing.updatedAt || 0, candidate.updatedAt),
        };
        state.days[dateKey] = day;
        return true;
      }
      return false;
    }

    const next = existing
      ? {
          input: Math.max(existing.input || 0, candidate.input),
          output: Math.max(existing.output || 0, candidate.output),
          cached: Math.max(existing.cached || 0, candidate.cached),
          reasoning: Math.max(existing.reasoning || 0, candidate.reasoning),
          total: Math.max(existing.total || 0, candidate.total),
          calls: Math.max(existing.calls || 0, candidate.calls),
          updatedAt: Math.max(existing.updatedAt || 0, candidate.updatedAt),
          source: candidate.source,
          model:
            candidate.model !== UNKNOWN_MODEL || !existing.model || existing.model === UNKNOWN_MODEL
              ? candidate.model
              : existing.model,
          modelConfidence:
            candidate.model !== UNKNOWN_MODEL || !existing.model || existing.model === UNKNOWN_MODEL
              ? candidate.modelConfidence
              : existing.modelConfidence || "unknown",
          conversationKey: candidate.conversationKey || existing.conversationKey || "",
        }
      : candidate;

    if (existing && JSON.stringify(existing) === JSON.stringify(next)) return false;

    day.turns[turn.turnId] = next;
    day.updatedAt = Math.max(day.updatedAt || 0, timestamp);

    const turnIds = Object.keys(day.turns);
    if (turnIds.length > MAX_TURNS_PER_DAY) {
      turnIds
        .sort((a, b) => (day.turns[a].updatedAt || 0) - (day.turns[b].updatedAt || 0))
        .slice(0, turnIds.length - MAX_TURNS_PER_DAY)
        .forEach((id) => delete day.turns[id]);
    }

    state.days[dateKey] = day;
    return true;
  }

  function recordToolCall(rawEvent, timestamp = Date.now()) {
    const event = normalizeToolEvent({ ...rawEvent, timestamp: rawEvent?.timestamp || timestamp });
    if (!event) return false;

    const now = Number.isFinite(event.timestamp) ? event.timestamp : Date.now();
    cleanupRecentToolCallKeys(now);
    const persistedEventKey = toolCallEventKey(event);
    const dedupeKey =
      persistedEventKey ||
      `${event.kind}|${event.namespace}|${event.name}|${event.source}|${Math.floor(now / TOOL_CALL_DEDUPE_WINDOW_MS)}`;
    if (recentToolCallKeys.has(dedupeKey)) return false;
    recentToolCallKeys.set(dedupeKey, now);

    const dateKey = getDateKey(now);
    const day = state.days[dateKey] || { turns: {}, updatedAt: 0 };
    if (!day.turns || typeof day.turns !== "object") day.turns = {};
    if (!day.toolCalls || typeof day.toolCalls !== "object") day.toolCalls = {};
    if (!day.toolCallEventKeys || typeof day.toolCallEventKeys !== "object") day.toolCallEventKeys = {};
    if (!day.toolEvents || typeof day.toolEvents !== "object") day.toolEvents = {};
    if (persistedEventKey && day.toolCallEventKeys[persistedEventKey]) {
      if (!day.toolEvents[persistedEventKey]) {
        day.toolEvents[persistedEventKey] = compactToolEvent(event, now);
        state.days[dateKey] = day;
        return true;
      }
      return false;
    }

    const key = toolCallKey(event.kind, event.namespace, event.name);
    const existing = day.toolCalls[key] || {};
    day.toolCalls[key] = {
      kind: event.kind,
      name: event.name,
      namespace: event.namespace,
      count: toCount(existing.count) + 1,
      lastCalledAt: Math.max(toCount(existing.lastCalledAt), now),
      source: event.source || existing.source || "capture",
    };
    day.updatedAt = Math.max(day.updatedAt || 0, now);
    if (persistedEventKey) day.toolCallEventKeys[persistedEventKey] = now;
    if (persistedEventKey) day.toolEvents[persistedEventKey] = compactToolEvent(event, now);

    const keys = Object.keys(day.toolCalls);
    if (keys.length > MAX_TOOL_CALLS_PER_DAY) {
      keys
        .sort((a, b) => (day.toolCalls[a].lastCalledAt || 0) - (day.toolCalls[b].lastCalledAt || 0))
        .slice(0, keys.length - MAX_TOOL_CALLS_PER_DAY)
        .forEach((id) => delete day.toolCalls[id]);
    }
    const eventKeys = Object.keys(day.toolCallEventKeys);
    if (eventKeys.length > MAX_TOOL_CALL_EVENT_KEYS_PER_DAY) {
      eventKeys
        .sort((a, b) => toCount(day.toolCallEventKeys[a]) - toCount(day.toolCallEventKeys[b]))
        .slice(0, eventKeys.length - MAX_TOOL_CALL_EVENT_KEYS_PER_DAY)
        .forEach((id) => {
          delete day.toolCallEventKeys[id];
          delete day.toolEvents[id];
        });
    }
    const toolEventKeys = Object.keys(day.toolEvents);
    if (toolEventKeys.length > MAX_TOOL_CALL_EVENTS_PER_DAY) {
      toolEventKeys
        .sort((a, b) => toCount(day.toolEvents[a]?.timestamp) - toCount(day.toolEvents[b]?.timestamp))
        .slice(0, toolEventKeys.length - MAX_TOOL_CALL_EVENTS_PER_DAY)
        .forEach((id) => delete day.toolEvents[id]);
    }

    state.days[dateKey] = day;
    return true;
  }

  function normalizeStoredToolEvent(value, storageKey = "") {
    const event = normalizeToolEvent(value);
    if (!event) return null;
    return {
      ...event,
      storageKey,
      turnKey: normalizeConversationKey(value?.turnKey || event.turnKey),
      conversationKey: normalizeConversationKey(value?.conversationKey || event.conversationKey),
    };
  }

  function turnIdentityKeys(id, turn) {
    return conversationKeyVariants(id)
      .concat(
        conversationKeyVariants(turn?.turnId),
        conversationKeyVariants(turn?.turnKey),
        conversationKeyVariants(turn?.id)
      )
      .filter(Boolean);
  }

  function turnConversationKeys(turn) {
    return conversationKeyVariants(turn?.conversationKey).concat(conversationKeyVariants(turn?.conversationId));
  }

  function eventConversationMatchesTurn(event, turn) {
    const eventKeys = conversationKeyVariants(event?.conversationKey);
    if (!eventKeys.length) return true;
    const turnKeys = new Set(turnConversationKeys(turn));
    if (!turnKeys.size) return true;
    return eventKeys.some((key) => turnKeys.has(key));
  }

  function toolEventUsageTimestamp(event) {
    if (event?.source === "dom-tool-card") {
      return parseUuidV7Timestamp(event.turnKey) || parseUuidV7Timestamp(event.id);
    }
    return parseTimestamp(event?.timestamp);
  }

  function findExactToolTurnId(event, turnEntries) {
    const keys = conversationKeyVariants(event.turnKey);
    if (!keys.length) return "";
    for (const [id, turn] of turnEntries) {
      const turnKeys = new Set(turnIdentityKeys(id, turn));
      if (keys.some((key) => turnKeys.has(key))) return id;
    }
    return "";
  }

  function findNearestToolTurnId(event, turnEntries) {
    const timestamp = toolEventUsageTimestamp(event);
    if (!timestamp) return "";
    let best = null;
    for (const [id, turn] of turnEntries) {
      if (!eventConversationMatchesTurn(event, turn)) continue;
      const updatedAt = toCount(turn?.updatedAt);
      if (!updatedAt) continue;
      const distance = Math.abs(updatedAt - timestamp);
      const isAfterTool = updatedAt >= timestamp;
      if (distance > TOOL_USAGE_MATCH_WINDOW_MS) continue;
      const score = distance + (isAfterTool ? 0 : TOOL_USAGE_MATCH_WINDOW_MS / 2);
      if (!best || score < best.score) best = { id, score };
    }
    return best?.id || "";
  }

  function calculateTurnCost(turn) {
    const costInfo = calculateUsageCost(turn, getModelPrice(displayModelName(turn?.model)));
    return costInfo.configured ? costInfo.cost : 0;
  }

  function aggregateDay(dateKey = getDateKey(Date.now())) {
    const day = state.days[dateKey] || {};
    const turnEntries = Object.entries(day.turns || {});
    const turns = turnEntries.map(([, turn]) => turn);
    const summary = turns.reduce(
      (summary, turn) => {
        summary.input += toCount(turn.input);
        summary.output += toCount(turn.output);
        summary.cached += toCount(turn.cached);
        summary.reasoning += toCount(turn.reasoning);
        summary.total += toCount(turn.total);
        summary.calls += Math.max(1, toCount(turn.calls));
        summary.turns += 1;
        summary.updatedAt = Math.max(summary.updatedAt, toCount(turn.updatedAt));
        const model = displayModelName(turn.model);
        let modelSummary = summary.modelsByName[model];
        if (!modelSummary) {
          modelSummary = {
            model,
            input: 0,
            output: 0,
            cached: 0,
            reasoning: 0,
            total: 0,
            calls: 0,
            turns: 0,
            cost: 0,
            priced: false,
          };
          summary.modelsByName[model] = modelSummary;
        }
        modelSummary.input += toCount(turn.input);
        modelSummary.output += toCount(turn.output);
        modelSummary.cached += toCount(turn.cached);
        modelSummary.reasoning += toCount(turn.reasoning);
        modelSummary.total += toCount(turn.total);
        modelSummary.calls += Math.max(1, toCount(turn.calls));
        modelSummary.turns += 1;
        return summary;
      },
      {
        dateKey,
        input: 0,
        output: 0,
        cached: 0,
        reasoning: 0,
        total: 0,
        calls: 0,
        turns: 0,
        updatedAt: 0,
        cost: 0,
        pricedModels: 0,
        customPricedModels: 0,
        defaultPricedModels: 0,
        modelsByName: {},
        models: [],
        toolCallsByKey: {},
        toolCalls: [],
        mcpCalls: 0,
        pluginCalls: 0,
        toolCallTotal: 0,
        toolTurnCount: 0,
        toolCallRate: 0,
        avgToolsPerToolTurn: 0,
        toolsPer100kTokens: 0,
        toolLinkedTurns: 0,
        toolLinkedTokens: 0,
        toolLinkedCost: 0,
        toolLinkedCoverage: 0,
        toolLinkedEstimated: false,
      }
    );
    summary.models = Object.values(summary.modelsByName)
      .map((modelSummary) => {
        const priceInfo = getModelPriceInfo(modelSummary.model);
        const costInfo = calculateUsageCost(modelSummary, priceInfo.price);
        summary.cost += costInfo.cost;
        if (costInfo.configured) {
          summary.pricedModels += 1;
          if (priceInfo.source === "custom") summary.customPricedModels += 1;
          else if (priceInfo.source === "default") summary.defaultPricedModels += 1;
        }
        return {
          ...modelSummary,
          cost: costInfo.cost,
          priced: costInfo.configured,
          priceSource: costInfo.configured ? priceInfo.source : "none",
        };
      })
      .sort((a, b) => b.total - a.total || a.model.localeCompare(b.model));

    const toolEvents = Object.entries(day.toolEvents || {})
      .map(([key, value]) => normalizeStoredToolEvent(value, key))
      .filter(Boolean);
    const toolTurnsByKey = new Map();
    const toolTurnKeys = new Set();
    const matchedTurnIds = new Set();
    for (const event of toolEvents) {
      const key = toolCallKey(event.kind, event.namespace, event.name);
      const turnKey = normalizeConversationKey(event.turnKey);
      if (turnKey) {
        toolTurnKeys.add(turnKey);
        if (!toolTurnsByKey.has(key)) toolTurnsByKey.set(key, new Set());
        toolTurnsByKey.get(key).add(turnKey);
      }

      const exactTurnId = findExactToolTurnId(event, turnEntries);
      const matchedTurnId = exactTurnId || findNearestToolTurnId(event, turnEntries);
      if (matchedTurnId) {
        matchedTurnIds.add(matchedTurnId);
        if (!exactTurnId) summary.toolLinkedEstimated = true;
      }
    }

    for (const toolCall of Object.values(day.toolCalls || {})) {
      const name = normalizeToolName(toolCall.name);
      if (!name) continue;
      const namespace = normalizeToolNamespace(toolCall.namespace);
      const kind = classifyToolKind(name, namespace, toolCall.kind);
      const key = toolCallKey(kind, namespace, name);
      const existing =
        summary.toolCallsByKey[key] ||
        {
          kind,
          name,
          namespace,
          count: 0,
          lastCalledAt: 0,
          source: "",
          turns: 0,
        };
      existing.count += Math.max(1, toCount(toolCall.count));
      existing.lastCalledAt = Math.max(existing.lastCalledAt, toCount(toolCall.lastCalledAt));
      existing.source = toolCall.source || existing.source;
      existing.turns = Math.max(existing.turns, toolTurnsByKey.get(key)?.size || 0);
      summary.toolCallsByKey[key] = existing;
      summary.updatedAt = Math.max(summary.updatedAt, existing.lastCalledAt);
      if (kind === "mcp") summary.mcpCalls += Math.max(1, toCount(toolCall.count));
      else summary.pluginCalls += Math.max(1, toCount(toolCall.count));
    }
    summary.toolCallTotal = summary.mcpCalls + summary.pluginCalls;
    summary.toolTurnCount = toolTurnKeys.size;
    summary.toolCallRate = summary.turns > 0 ? summary.toolTurnCount / summary.turns : 0;
    summary.avgToolsPerToolTurn = summary.toolTurnCount > 0 ? summary.toolCallTotal / summary.toolTurnCount : 0;
    summary.toolsPer100kTokens = summary.total > 0 ? (summary.toolCallTotal / summary.total) * 100000 : 0;
    for (const turnId of matchedTurnIds) {
      const turn = day.turns?.[turnId];
      if (!turn) continue;
      summary.toolLinkedTurns += 1;
      summary.toolLinkedTokens += toCount(turn.total);
      summary.toolLinkedCost += calculateTurnCost(turn);
    }
    summary.toolLinkedCoverage = summary.toolTurnCount > 0 ? summary.toolLinkedTurns / summary.toolTurnCount : 0;
    summary.toolCalls = Object.values(summary.toolCallsByKey).sort(
      (a, b) =>
        b.count - a.count ||
        displayToolKind(a.kind).localeCompare(displayToolKind(b.kind)) ||
        a.name.localeCompare(b.name)
    );

    delete summary.modelsByName;
    delete summary.toolCallsByKey;
    return summary;
  }

  function formatTrendDateLabel(dateKey) {
    const date = parseDateKey(dateKey);
    if (!date) return dateKey;
    return `${date.getMonth() + 1}/${date.getDate()}`;
  }

  function buildTrendData(dateKey = selectedDateKey, days = TREND_DAYS) {
    const endKey = clampDateKey(dateKey);
    const count = Math.max(1, toCount(days) || TREND_DAYS);
    const items = [];
    for (let offset = count - 1; offset >= 0; offset -= 1) {
      const itemDateKey = shiftDateKey(endKey, -offset);
      const summary = aggregateDay(itemDateKey);
      items.push({
        dateKey: itemDateKey,
        label: formatTrendDateLabel(itemDateKey),
        total: toCount(summary.total),
        input: toCount(summary.input),
        output: toCount(summary.output),
        calls: toCount(summary.calls),
        cost: Number(summary.cost) || 0,
        active: itemDateKey === endKey,
      });
    }
    const maxTotal = Math.max(1, ...items.map((item) => item.total));
    return { dateKey: endKey, days: count, maxTotal, items };
  }

  function trendPoints(trend, width = 286, height = 76, padding = 8) {
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

  function trendPath(points, smooth = true) {
    if (!points.length) return "";
    if (points.length === 1 || !smooth) {
      return points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(" ");
    }

    let path = `M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}`;
    for (let index = 1; index < points.length; index += 1) {
      const previous = points[index - 1];
      const current = points[index];
      const controlX = (previous.x + current.x) / 2;
      path += ` C ${controlX.toFixed(1)} ${previous.y.toFixed(1)}, ${controlX.toFixed(1)} ${current.y.toFixed(1)}, ${current.x.toFixed(1)} ${current.y.toFixed(1)}`;
    }
    return path;
  }

  function formatCompact(value) {
    const count = toCount(value);
    if (count < 1000) return String(count);
    if (count < 1_000_000) return `${stripTrailingZero(count / 1000)}K`;
    if (count < 1_000_000_000) return `${stripTrailingZero(count / 1_000_000)}M`;
    return `${stripTrailingZero(count / 1_000_000_000)}B`;
  }

  function stripTrailingZero(value) {
    const digits = value >= 100 ? 0 : value >= 10 ? 1 : 2;
    return String(Number(value.toFixed(digits)));
  }

  function formatExact(value) {
    return new Intl.NumberFormat("zh-CN").format(toCount(value));
  }

  function formatDecimal(value, digits = 1) {
    const number = Number(value);
    if (!Number.isFinite(number) || number <= 0) return "0";
    return number.toFixed(digits).replace(/\.0+$/, "").replace(/(\.\d*?)0+$/, "$1");
  }

  function formatPercent(value) {
    const number = Number(value);
    if (!Number.isFinite(number) || number <= 0) return "0%";
    const percent = Math.min(100, number * 100);
    return `${formatDecimal(percent, percent >= 10 ? 1 : 2)}%`;
  }

  function formatTime(timestamp) {
    if (!timestamp) return "暂无";
    return new Intl.DateTimeFormat("zh-CN", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    }).format(new Date(timestamp));
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

  function buildShareModel(snapshot) {
    const input = toCount(snapshot?.input);
    const output = toCount(snapshot?.output);
    const cached = toCount(snapshot?.cached);
    const total = toCount(snapshot?.total);
    return {
      dateKey: snapshot?.dateKey || getDateKey(Date.now()),
      dateLabel: formatDisplayDate(snapshot?.dateKey || getDateKey(Date.now())),
      input,
      output,
      cached,
      reasoning: toCount(snapshot?.reasoning),
      total,
      calls: toCount(snapshot?.calls),
      turns: toCount(snapshot?.turns),
      cost: Number(snapshot?.cost) || 0,
      models: Array.isArray(snapshot?.models) ? snapshot.models.slice(0, 4) : [],
      toolCalls: Array.isArray(snapshot?.toolCalls) ? snapshot.toolCalls.slice(0, 4) : [],
      mcpCalls: toCount(snapshot?.mcpCalls),
      pluginCalls: toCount(snapshot?.pluginCalls),
      toolCallTotal: toCount(snapshot?.toolCallTotal),
      toolTurnCount: toCount(snapshot?.toolTurnCount),
      toolCallRate: Number(snapshot?.toolCallRate) || 0,
      avgToolsPerToolTurn: Number(snapshot?.avgToolsPerToolTurn) || 0,
      toolsPer100kTokens: Number(snapshot?.toolsPer100kTokens) || 0,
      toolLinkedTurns: toCount(snapshot?.toolLinkedTurns),
      toolLinkedTokens: toCount(snapshot?.toolLinkedTokens),
      toolLinkedCost: Number(snapshot?.toolLinkedCost) || 0,
      cacheRate: input > 0 ? Math.min(100, (cached / input) * 100) : 0,
      outputRate: total > 0 ? Math.min(100, (output / total) * 100) : 0,
      trend: buildTrendData(snapshot?.dateKey || getDateKey(Date.now())),
    };
  }

  function roundedRectPath(context, x, y, width, height, radius) {
    const r = Math.min(radius, width / 2, height / 2);
    context.beginPath();
    context.moveTo(x + r, y);
    context.lineTo(x + width - r, y);
    context.quadraticCurveTo(x + width, y, x + width, y + r);
    context.lineTo(x + width, y + height - r);
    context.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
    context.lineTo(x + r, y + height);
    context.quadraticCurveTo(x, y + height, x, y + height - r);
    context.lineTo(x, y + r);
    context.quadraticCurveTo(x, y, x + r, y);
    context.closePath();
  }

  function fillRoundedRect(context, x, y, width, height, radius, fillStyle) {
    roundedRectPath(context, x, y, width, height, radius);
    context.fillStyle = fillStyle;
    context.fill();
  }

  function drawMetricCard(context, { x, y, width, label, value, accent }) {
    fillRoundedRect(context, x, y, width, 142, 24, "rgba(255, 255, 255, 0.075)");
    context.strokeStyle = "rgba(255, 255, 255, 0.13)";
    context.lineWidth = 1.5;
    roundedRectPath(context, x, y, width, 142, 24);
    context.stroke();

    fillRoundedRect(context, x + 22, y + 22, 10, 10, 5, accent);
    context.fillStyle = "rgba(226, 232, 255, 0.66)";
    context.font = '500 24px -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif';
    context.fillText(label, x + 22, y + 63);

    context.fillStyle = "#ffffff";
    context.font = '700 34px -apple-system, BlinkMacSystemFont, "SF Pro Display", sans-serif';
    context.fillText(value, x + 22, y + 112);
  }

  function truncateCanvasText(context, text, maxWidth) {
    const source = String(text || "");
    if (!source || context.measureText(source).width <= maxWidth) return source;
    const ellipsis = "…";
    let low = 0;
    let high = source.length;
    while (low < high) {
      const mid = Math.ceil((low + high) / 2);
      if (context.measureText(`${source.slice(0, mid)}${ellipsis}`).width <= maxWidth) low = mid;
      else high = mid - 1;
    }
    return `${source.slice(0, Math.max(0, low))}${ellipsis}`;
  }

  function drawShareTrend(context, trend, x, y, width, height) {
    fillRoundedRect(context, x, y, width, height, 28, "rgba(5, 8, 24, 0.4)");
    context.strokeStyle = "rgba(255, 255, 255, 0.1)";
    roundedRectPath(context, x, y, width, height, 28);
    context.stroke();

    context.fillStyle = "#ffffff";
    context.font = '650 25px -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif';
    context.fillText("近 5 日 Token 趋势", x + 30, y + 45);

    context.textAlign = "right";
    context.fillStyle = "rgba(226, 232, 255, 0.58)";
    context.font = '500 20px -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif';
    context.fillText(`峰值 ${formatCompact(trend.maxTotal)}`, x + width - 30, y + 45);
    context.textAlign = "left";

    const chart = { x: x + 34, y: y + 62, width: width - 68, height: 88 };
    context.strokeStyle = "rgba(255, 255, 255, 0.08)";
    context.lineWidth = 1;
    for (let index = 0; index < 3; index += 1) {
      const gridY = chart.y + (chart.height * index) / 2;
      context.beginPath();
      context.moveTo(chart.x, gridY);
      context.lineTo(chart.x + chart.width, gridY);
      context.stroke();
    }

    const points = trendPoints(trend, chart.width, chart.height, 4).map((point) => ({
      ...point,
      x: point.x + chart.x,
      y: point.y + chart.y,
    }));
    if (points.length > 0) {
      const area = `${trendPath(points, true)} L ${points[points.length - 1].x.toFixed(1)} ${(chart.y + chart.height).toFixed(1)} L ${points[0].x.toFixed(1)} ${(chart.y + chart.height).toFixed(1)} Z`;
      const areaGradient = context.createLinearGradient(0, chart.y, 0, chart.y + chart.height);
      areaGradient.addColorStop(0, "rgba(76, 181, 255, 0.28)");
      areaGradient.addColorStop(1, "rgba(123, 92, 255, 0.02)");
      context.fillStyle = areaGradient;
      const areaPath = new Path2D(area);
      context.fill(areaPath);

      const lineGradient = context.createLinearGradient(chart.x, 0, chart.x + chart.width, 0);
      lineGradient.addColorStop(0, "#44B9FF");
      lineGradient.addColorStop(1, "#9B7CFF");
      context.strokeStyle = lineGradient;
      context.lineWidth = 5;
      context.lineCap = "round";
      context.lineJoin = "round";
      context.stroke(new Path2D(trendPath(points, true)));

      for (const point of points) {
        context.fillStyle = point.active ? "#FFFFFF" : "rgba(255, 255, 255, 0.78)";
        context.beginPath();
        context.arc(point.x, point.y, point.active ? 7 : 5, 0, Math.PI * 2);
        context.fill();
        context.fillStyle = point.active ? "#8A6CFF" : "#42B8FF";
        context.beginPath();
        context.arc(point.x, point.y, point.active ? 3 : 2.5, 0, Math.PI * 2);
        context.fill();
      }
    }

    context.fillStyle = "rgba(226, 232, 255, 0.52)";
    context.font = '500 18px -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif';
    context.textAlign = "center";
    const labelY = y + height - 26;
    const denominator = Math.max(1, trend.items.length - 1);
    trend.items.forEach((item, index) => {
      const labelX = chart.x + (chart.width * index) / denominator;
      context.fillStyle = item.active ? "#FFFFFF" : "rgba(226, 232, 255, 0.52)";
      context.fillText(item.label, labelX, labelY);
    });
    context.textAlign = "left";
  }

  function drawShareTools(context, model, x, y, width, height) {
    fillRoundedRect(context, x, y, width, height, 28, "rgba(255, 255, 255, 0.07)");
    context.strokeStyle = "rgba(255, 255, 255, 0.12)";
    roundedRectPath(context, x, y, width, height, 28);
    context.stroke();

    context.fillStyle = "#ffffff";
    context.font = '650 25px -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif';
    context.fillText("工具调用", x + 30, y + 43);

    context.textAlign = "right";
    context.fillStyle = "rgba(226, 232, 255, 0.58)";
    context.font = '500 20px -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif';
    context.fillText(
      `MCP ${formatExact(model.mcpCalls)} · 插件 ${formatExact(model.pluginCalls)}`,
      x + width - 30,
      y + 43
    );
    context.textAlign = "left";

    const metricY = y + 68;
    const metricHeight = 66;
    const metricWidth = (width - 60 - 36) / 4;
    const metrics = [
      { label: "总调用", value: `${formatExact(model.toolCallTotal)} 次`, accent: "#4FB6FF" },
      { label: "可识别请求", value: `${formatExact(model.toolTurnCount)} 个`, accent: "#9D7CFF" },
      { label: "调用率", value: formatPercent(model.toolCallRate), accent: "#4EE4B1" },
      { label: "调用密度", value: `${formatDecimal(model.toolsPer100kTokens, 2)}/10万T`, accent: "#FFB35A" },
    ];
    metrics.forEach((metric, index) => {
      const metricX = x + 30 + index * (metricWidth + 12);
      fillRoundedRect(context, metricX, metricY, metricWidth, metricHeight, 16, "rgba(5, 8, 24, 0.32)");
      fillRoundedRect(context, metricX + 14, metricY + 16, 8, 8, 4, metric.accent);
      context.fillStyle = "rgba(226, 232, 255, 0.54)";
      context.font = '500 17px -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif';
      context.fillText(metric.label, metricX + 29, metricY + 25);
      context.fillStyle = "#ffffff";
      context.font = '700 20px -apple-system, BlinkMacSystemFont, "SF Pro Display", sans-serif';
      context.fillText(metric.value, metricX + 14, metricY + 53);
    });

    const topTool = model.toolCalls?.[0];
    const topToolName = topTool
      ? `${topTool.namespace ? `${topTool.namespace} / ` : ""}${topTool.name}`
      : "暂无可识别工具";
    const topToolText = topTool
      ? `Top：${topToolName} · ${formatExact(topTool.count)} 次${topTool.turns ? ` / ${formatExact(topTool.turns)} 个请求` : ""}`
      : "Top：暂无可识别工具调用";
    context.fillStyle = "rgba(226, 232, 255, 0.5)";
    context.font = '500 18px -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif';
    context.fillText(
      truncateCanvasText(context, topToolText, model.toolLinkedTurns ? width - 490 : width - 60),
      x + 30,
      y + height - 30
    );

    if (model.toolLinkedTurns) {
      context.textAlign = "right";
      context.fillStyle = "rgba(114, 195, 255, 0.72)";
      context.font = '650 18px -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif';
      context.fillText(
        `关联用量 ${formatCompact(model.toolLinkedTokens)} · ${formatCost(model.toolLinkedCost)}`,
        x + width - 30,
        y + height - 30
      );
      context.textAlign = "left";
    }
  }

  function createShareCanvas(dateKey = selectedDateKey) {
    const model = buildShareModel(aggregateDay(clampDateKey(dateKey)));
    const canvas = document.createElement("canvas");
    canvas.width = 1200;
    canvas.height = 1100;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("当前环境不支持 Canvas 2D");

    const background = context.createLinearGradient(0, 0, 1200, 1100);
    background.addColorStop(0, "#070A18");
    background.addColorStop(0.5, "#11132D");
    background.addColorStop(1, "#21104A");
    context.fillStyle = background;
    context.fillRect(0, 0, 1200, 1100);

    const blueGlow = context.createRadialGradient(160, 120, 0, 160, 120, 430);
    blueGlow.addColorStop(0, "rgba(35, 160, 255, 0.34)");
    blueGlow.addColorStop(1, "rgba(35, 160, 255, 0)");
    context.fillStyle = blueGlow;
    context.fillRect(0, 0, 650, 650);

    const purpleGlow = context.createRadialGradient(1080, 800, 0, 1080, 800, 520);
    purpleGlow.addColorStop(0, "rgba(153, 72, 255, 0.34)");
    purpleGlow.addColorStop(1, "rgba(153, 72, 255, 0)");
    context.fillStyle = purpleGlow;
    context.fillRect(500, 300, 700, 800);

    context.fillStyle = "rgba(255, 255, 255, 0.035)";
    for (let x = 40; x < 1200; x += 42) {
      for (let y = 38; y < 1100; y += 42) {
        context.beginPath();
        context.arc(x, y, 1.5, 0, Math.PI * 2);
        context.fill();
      }
    }

    fillRoundedRect(context, 70, 58, 194, 46, 23, "rgba(65, 166, 255, 0.16)");
    context.strokeStyle = "rgba(89, 181, 255, 0.35)";
    roundedRectPath(context, 70, 58, 194, 46, 23);
    context.stroke();
    context.fillStyle = "#72C3FF";
    context.font = '700 19px -apple-system, BlinkMacSystemFont, "SF Pro Display", sans-serif';
    context.fillText("CODEX  /  TOKEN", 93, 89);

    context.textAlign = "right";
    context.fillStyle = "rgba(226, 232, 255, 0.72)";
    context.font = '500 24px -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif';
    context.fillText(model.dateLabel, 1130, 87);
    context.textAlign = "left";

    context.fillStyle = "rgba(226, 232, 255, 0.66)";
    context.font = '600 27px -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif';
    context.fillText("当日累计 TOKEN", 72, 176);

    const totalText = formatExact(model.total);
    const totalFontSize = totalText.length > 12 ? 82 : totalText.length > 9 ? 98 : 116;
    const totalGradient = context.createLinearGradient(70, 205, 800, 330);
    totalGradient.addColorStop(0, "#FFFFFF");
    totalGradient.addColorStop(0.55, "#A9DDFF");
    totalGradient.addColorStop(1, "#C5A7FF");
    context.fillStyle = totalGradient;
    context.font = `750 ${totalFontSize}px -apple-system, BlinkMacSystemFont, "SF Pro Display", sans-serif`;
    context.fillText(totalText, 66, 304);

    context.fillStyle = "rgba(226, 232, 255, 0.48)";
    context.font = '500 21px -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif';
    context.fillText(`${formatExact(model.turns)} 个 turn  ·  ${formatExact(model.calls)} 次请求`, 73, 350);
    context.textAlign = "right";
    context.fillStyle = "rgba(114, 195, 255, 0.78)";
    context.font = '650 22px -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif';
    context.fillText(`估算成本 ${formatCost(model.cost)}`, 1129, 350);
    context.textAlign = "left";

    const cardWidth = 250;
    const gap = 22;
    const cardY = 410;
    drawMetricCard(context, {
      x: 70,
      y: cardY,
      width: cardWidth,
      label: "输入 Token",
      value: formatCompact(model.input),
      accent: "#4FB6FF",
    });
    drawMetricCard(context, {
      x: 70 + cardWidth + gap,
      y: cardY,
      width: cardWidth,
      label: "输出 Token",
      value: formatCompact(model.output),
      accent: "#9D7CFF",
    });
    drawMetricCard(context, {
      x: 70 + (cardWidth + gap) * 2,
      y: cardY,
      width: cardWidth,
      label: "缓存输入",
      value: formatCompact(model.cached),
      accent: "#4EE4B1",
    });
    drawMetricCard(context, {
      x: 70 + (cardWidth + gap) * 3,
      y: cardY,
      width: cardWidth,
      label: "推理 Token",
      value: formatCompact(model.reasoning),
      accent: "#FFB35A",
    });

    drawShareTrend(context, model.trend, 70, 590, 1066, 188);
    drawShareTools(context, model, 70, 800, 1066, 188);

    context.fillStyle = "rgba(226, 232, 255, 0.46)";
    context.font = '500 19px -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif';
    const modelText = model.models.length
      ? `主力 Model：${model.models.map((item) => item.model).join(" / ")}`
      : "Model：暂无可识别数据";
    context.fillText(truncateCanvasText(context, modelText, 840), 72, 1034);
    context.fillText(
      truncateCanvasText(context, "数据仅来自本机 Codex++，成本为本地配置价格估算，不包含会话内容", 900),
      72,
      1062
    );
    context.textAlign = "right";
    context.fillStyle = "rgba(114, 195, 255, 0.72)";
    context.font = '650 19px -apple-system, BlinkMacSystemFont, "SF Pro Display", sans-serif';
    context.fillText("GENERATED LOCALLY", 1129, 1062);
    context.textAlign = "left";

    return canvas;
  }

  function canvasToBlob(canvas) {
    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error("分享图片生成失败"));
      }, "image/png");
    });
  }

  async function createShareBlob(dateKey = selectedDateKey) {
    return canvasToBlob(createShareCanvas(dateKey));
  }

  async function copyShareImage(dateKey = selectedDateKey) {
    const clipboard = window.navigator?.clipboard;
    const ClipboardItemClass = window.ClipboardItem;
    if (!clipboard?.write || typeof ClipboardItemClass !== "function") {
      throw new Error("当前环境不支持复制图片到剪贴板");
    }

    const blobPromise = createShareBlob(dateKey);
    await clipboard.write([new ClipboardItemClass({ "image/png": blobPromise })]);
    const blob = await blobPromise;
    return { dateKey: clampDateKey(dateKey), size: blob.size, type: blob.type };
  }

  const recentCaptureKeys = new Map();
  const recentToolCallKeys = new Map();

  function cleanupRecentCaptureKeys(now = Date.now()) {
    for (const [key, timestamp] of recentCaptureKeys) {
      if (now - timestamp > CAPTURE_DEDUPE_WINDOW_MS * 4) {
        recentCaptureKeys.delete(key);
      }
    }
  }

  function cleanupRecentToolCallKeys(now = Date.now()) {
    for (const [key, timestamp] of recentToolCallKeys) {
      if (now - timestamp > TOOL_CALL_DEDUPE_WINDOW_MS * 4) {
        recentToolCallKeys.delete(key);
      }
    }
  }

  function requestUrl(input) {
    if (typeof input === "string") return input;
    if (input?.url) return String(input.url);
    return "";
  }

  function isLikelyUsageUrl(url) {
    const text = String(url || "").toLowerCase();
    return /codex|conversation|responses|completion|chat|backend-api|openai/.test(text);
  }

  function safeParseJson(text) {
    if (typeof text !== "string") return null;
    const trimmed = text.trim();
    if (!trimmed) return null;
    try {
      return JSON.parse(trimmed);
    } catch {
      return null;
    }
  }

  function parseTextPayloads(text) {
    if (typeof text !== "string" || !text.trim() || text.length > MAX_CAPTURE_BODY_CHARS) {
      return [];
    }

    const parsed = safeParseJson(text);
    if (parsed) return [parsed];

    const payloads = [];
    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed === "data: [DONE]") continue;
      const data = trimmed.startsWith("data:") ? trimmed.slice(5).trim() : trimmed;
      const item = safeParseJson(data);
      if (item) payloads.push(item);
    }
    return payloads;
  }

  function extractCandidateId(value) {
    if (!value || typeof value !== "object") return "";
    const candidates = [
      value.response_id,
      value.responseId,
      value.request_id,
      value.requestId,
      value.event_id,
      value.eventId,
      value.message_id,
      value.messageId,
      value.id,
      value.response?.id,
      value.message?.id,
      value.data?.id,
      value.result?.id,
    ];
    const id = candidates.find((candidate) => typeof candidate === "string" && candidate.trim());
    return id ? id.trim() : "";
  }

  function normalizeCaptureUsage(rawUsage) {
    const usage = normalizeUsage(rawUsage);
    if (!usage.total || (!usage.input && !usage.output)) return null;
    return usage;
  }

  function findUsageCandidates(value, depth = 0, inheritedId = "", inheritedModel = "") {
    if (!value || depth > 8) return [];
    if (typeof value === "string") {
      return parseTextPayloads(value).flatMap((item) => findUsageCandidates(item, depth + 1, inheritedId, inheritedModel));
    }
    if (Array.isArray(value)) {
      return value.flatMap((item) => findUsageCandidates(item, depth + 1, inheritedId, inheritedModel));
    }
    if (typeof value !== "object") return [];

    const id = extractCandidateId(value) || inheritedId;
    const model = extractDirectModel(value) || inheritedModel;
    const candidates = [];
    const directKeys = [
      "usage",
      "token_usage",
      "tokenUsage",
      "context_usage",
      "contextUsage",
      "last_usage",
      "lastUsage",
      "last_token_usage",
      "lastTokenUsage",
    ];

    for (const key of directKeys) {
      const usage = normalizeCaptureUsage(value[key]);
      if (usage) candidates.push({ usage, id, model });
    }

    const selfUsage = normalizeCaptureUsage(value);
    if (selfUsage) candidates.push({ usage: selfUsage, id, model });

    for (const key of [
      "response",
      "data",
      "body",
      "message",
      "result",
      "event",
      "params",
      "payload",
      "delta",
      "item",
      "output",
      "details",
      "info",
    ]) {
      candidates.push(...findUsageCandidates(value[key], depth + 1, id, model));
    }

    return dedupeCandidates(candidates);
  }

  function usageSignature(usage) {
    return [
      toCount(usage.input),
      toCount(usage.output),
      toCount(usage.cached),
      toCount(usage.reasoning),
      toCount(usage.total),
    ].join(":");
  }

  function dedupeCandidates(candidates) {
    const seen = new Set();
    return candidates.filter((candidate) => {
      const key = `${candidate.id || ""}|${usageSignature(candidate.usage)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function firstToolName(...values) {
    for (const value of values) {
      if (value && typeof value === "object") {
        const nested = firstToolName(
          value.name,
          value.tool,
          value.toolName,
          value.tool_name,
          value.function?.name,
          value.item?.name
        );
        if (nested) return nested;
        continue;
      }
      const name = normalizeToolName(value);
      if (name) return name;
    }
    return "";
  }

  function firstToolNamespace(...values) {
    for (const value of values) {
      if (value && typeof value === "object") {
        const nested = firstToolNamespace(
          value.namespace,
          value.server,
          value.serverName,
          value.server_name,
          value.mcpServer,
          value.mcp_server
        );
        if (nested) return nested;
        continue;
      }
      const namespace = normalizeToolNamespace(value);
      if (namespace) return namespace;
    }
    return "";
  }

  function extractToolCallId(value) {
    if (!value || typeof value !== "object") return "";
    return firstToolName(
      value.call_id,
      value.callId,
      value.tool_call_id,
      value.toolCallId,
      value.item_id,
      value.itemId,
      value.id,
      value.event_id,
      value.eventId,
      value.request_id,
      value.requestId,
      value.response_id,
      value.responseId,
      value.item?.call_id,
      value.item?.id,
      value.function?.id
    );
  }

  function extractToolCallTimestamp(value) {
    if (!value || typeof value !== "object") return null;
    return parseTimestamp(
      value.timestamp ??
        value.created_at ??
        value.createdAt ??
        value.updated_at ??
        value.updatedAt ??
        value.item?.created_at ??
        value.item?.createdAt
    );
  }

  function extractToolTurnKey(value) {
    if (!value || typeof value !== "object") return "";
    return normalizeConversationKey(
      value.turnKey ??
        value.turn_key ??
        value.turnId ??
        value.turn_id ??
        value.internal_chat_message_metadata_passthrough?.turn_id ??
        value.internalChatMessageMetadataPassthrough?.turnId ??
        value.item?.turnKey ??
        value.item?.turn_id ??
        value.item?.internal_chat_message_metadata_passthrough?.turn_id
    );
  }

  function isMcpToolCallMethod(method) {
    const text = String(method || "").toLowerCase();
    return /(^|\/)(tools\/call|tool\/call|mcp\/tool\/call)$/.test(text) || text.includes("tools/call");
  }

  function mcpRequestParams(value) {
    if (!value || typeof value !== "object") return {};
    const request = value.request && typeof value.request === "object" ? value.request : {};
    const body = parseMaybeJsonObject(value.body);
    if (value.params && typeof value.params === "object") return value.params;
    if (request.params && typeof request.params === "object") return request.params;
    if (body?.params && typeof body.params === "object") return body.params;
    return {};
  }

  function extractMcpToolCallEvent(value) {
    if (!value || typeof value !== "object") return null;
    const method = String(value.method || value.request?.method || "");
    if (!isMcpToolCallMethod(method)) return null;
    const params = mcpRequestParams(value);
    const name = firstToolName(params, value);
    if (!name) return null;
    return {
      kind: "mcp",
      name,
      namespace: firstToolNamespace(params, value),
      id: extractToolCallId(value) || extractToolCallId(value.request) || extractToolCallId(params),
      source: "mcp-request",
      timestamp: extractToolCallTimestamp(value),
      turnKey: extractToolTurnKey(value) || extractToolTurnKey(value.request) || extractToolTurnKey(params),
      conversationKey: extractConversationKey(value),
    };
  }

  function isFunctionToolItem(value) {
    if (!value || typeof value !== "object") return false;
    const type = String(value.type || "").toLowerCase();
    return (
      type === "function_call" ||
      type === "custom_tool_call" ||
      type === "tool_call" ||
      Boolean(value.function?.name)
    );
  }

  function isToolCallDoneEvent(type) {
    return /^(response\.)?output_item\.(done|completed)$/.test(String(type || "").toLowerCase());
  }

  function isToolCallPreviewEvent(type) {
    return /(output_item\.added|function_call_arguments\.delta|tool_call.*delta)$/i.test(String(type || ""));
  }

  function functionToolCallEvent(value, source = "function-call") {
    if (!isFunctionToolItem(value)) return null;
    const name = firstToolName(value);
    if (!name) return null;
    return {
      kind: classifyToolKind(name, firstToolNamespace(value), value.kind),
      name,
      namespace: firstToolNamespace(value),
      id: extractToolCallId(value),
      source,
      timestamp: extractToolCallTimestamp(value),
      turnKey: extractToolTurnKey(value),
      conversationKey: extractConversationKey(value),
    };
  }

  function dedupeToolCallEvents(events) {
    const seen = new Set();
    const normalizedEvents = [];
    for (const event of events) {
      const normalized = normalizeToolEvent(event);
      if (!normalized) continue;
      const key = normalized.id
        ? `${normalized.kind}|${normalized.namespace}|${normalized.name}|id:${normalized.id}`
        : `${normalized.kind}|${normalized.namespace}|${normalized.name}|${normalized.source || ""}`;
      if (seen.has(key)) continue;
      seen.add(key);
      normalizedEvents.push(normalized);
    }
    return normalizedEvents;
  }

  function extractToolCallEvents(value, depth = 0) {
    if (!value || depth > 8) return [];
    if (typeof value === "string") {
      return dedupeToolCallEvents(parseTextPayloads(value).flatMap((item) => extractToolCallEvents(item, depth + 1)));
    }
    if (Array.isArray(value)) {
      return dedupeToolCallEvents(value.flatMap((item) => extractToolCallEvents(item, depth + 1)));
    }
    if (typeof value !== "object") return [];

    const events = [];
    const type = String(value.type || "");
    const mcpEvent = extractMcpToolCallEvent(value);
    if (mcpEvent) events.push(mcpEvent);

    if (isToolCallDoneEvent(type)) {
      const doneEvent = functionToolCallEvent(value.item || value.output_item || value, type || "output-item-done");
      if (doneEvent) events.push(doneEvent);
    } else if (!isToolCallPreviewEvent(type)) {
      const directEvent = functionToolCallEvent(value, "function-call");
      if (directEvent) events.push(directEvent);
    }

    const toolCalls = [
      ...(Array.isArray(value.tool_calls) ? value.tool_calls : []),
      ...(Array.isArray(value.toolCalls) ? value.toolCalls : []),
    ];
    for (const call of toolCalls) {
      const toolCallEvent = functionToolCallEvent(call, "tool-calls");
      if (toolCallEvent) events.push(toolCallEvent);
    }

    if (!isToolCallPreviewEvent(type)) {
      for (const key of [
        "response",
        "data",
        "body",
        "message",
        "result",
        "event",
        "params",
        "payload",
        "item",
        "output",
        "choices",
        "delta",
      ]) {
        let nestedValue = value[key];
        if (nestedValue && typeof nestedValue === "object" && !Array.isArray(nestedValue)) {
          const inherited = {};
          if (value.timestamp && !nestedValue.timestamp) inherited.timestamp = value.timestamp;
          const parentTurnKey = extractToolTurnKey(value);
          if (parentTurnKey && !extractToolTurnKey(nestedValue)) inherited.turnKey = parentTurnKey;
          const parentConversationKey = extractConversationKey(value);
          if (parentConversationKey && !extractConversationKey(nestedValue)) {
            inherited.conversationId = parentConversationKey;
          }
          if (Object.keys(inherited).length) nestedValue = { ...nestedValue, ...inherited };
        }
        events.push(...extractToolCallEvents(nestedValue, depth + 1));
      }
    }

    return dedupeToolCallEvents(events);
  }

  function rememberCapturedUsage(candidate, source, url = "") {
    const now = Date.now();
    cleanupRecentCaptureKeys(now);
    const signature = usageSignature(candidate.usage);
    const dedupeKey = candidate.id
      ? `id:${candidate.id}|${signature}`
      : `near:${signature}|${Math.floor(now / CAPTURE_DEDUPE_WINDOW_MS)}`;
    if (recentCaptureKeys.has(dedupeKey)) return false;
    recentCaptureKeys.set(dedupeKey, now);

    const turnId = candidate.id
      ? `capture:${candidate.id}`
      : `${now}-${++captureSeq}`;
    const changed = upsertTurn({
      turnId,
      model: candidate.model,
      source: `capture:${source}`,
      callCount: 1,
      createdAt: new Date(now).toISOString(),
      usage: {
        inputTokens: candidate.usage.input,
        outputTokens: candidate.usage.output,
        cachedReadTokens: candidate.usage.cached,
        reasoningTokens: candidate.usage.reasoning,
        totalTokens: candidate.usage.total,
        hasBreakdown: true,
      },
      url,
    });

    if (changed) {
      lastCaptureAt = now;
      sourceMode = "standalone";
    }
    return changed;
  }

  function processToolCallPayload(payload, source = "capture") {
    const events = extractToolCallEvents(payload).map((event) => ({
      ...event,
      source: event.source || source,
    }));
    if (!events.length) return false;

    let changed = false;
    for (const event of events) {
      changed = recordToolCall(event) || changed;
    }
    if (changed) {
      pruneState();
      saveState();
      render({ animate: false });
    }
    return changed;
  }

  function safeQuery(rootNode, selector) {
    try {
      return rootNode && typeof rootNode.querySelector === "function" ? rootNode.querySelector(selector) : null;
    } catch {
      return null;
    }
  }

  function safeQueryAll(rootNode, selector) {
    try {
      return rootNode && typeof rootNode.querySelectorAll === "function"
        ? Array.from(rootNode.querySelectorAll(selector))
        : [];
    } catch {
      return [];
    }
  }

  function elementAttribute(element, name) {
    try {
      return typeof element?.getAttribute === "function" ? element.getAttribute(name) || "" : "";
    } catch {
      return "";
    }
  }

  function closestElement(element, selector) {
    try {
      return typeof element?.closest === "function" ? element.closest(selector) : null;
    } catch {
      return null;
    }
  }

  function shortHash(value) {
    let hash = 2166136261;
    const text = String(value || "");
    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(36);
  }

  function currentConversationIdFromDom(rootNode = document) {
    const selectors = [
      "[data-above-composer-conversation-id]",
      "[data-thread-conversation-id]",
      "[data-conversation-id]",
    ];
    for (const selector of selectors) {
      const value = elementAttribute(safeQuery(rootNode, selector), selector.slice(1, -1));
      const key = normalizeConversationKey(value);
      if (key) return key;
    }
    return "";
  }

  function domToolEventFromElement(element, descriptor, rootNode = document) {
    if (!element || !descriptor) return null;
    const name = normalizeToolName(
      elementAttribute(element, "data-tool-name") ||
        elementAttribute(element, "data-mcp-tool-name") ||
        elementAttribute(element, "data-plugin-name") ||
        descriptor.name
    );
    if (!name) return null;

    const testId = normalizeToolName(elementAttribute(element, "data-testid") || descriptor.testId || "tool");
    const namespace = normalizeToolNamespace(
      elementAttribute(element, "data-tool-namespace") ||
        elementAttribute(element, "data-mcp-server") ||
        elementAttribute(element, "data-plugin-namespace")
    );
    const explicitKind = elementAttribute(element, "data-mcp-tool-name") ? "mcp" : descriptor.kind;
    const conversationKey = currentConversationIdFromDom(rootNode) || "conversation";
    const turnElement = closestElement(element, "[data-turn-key]");
    const turnKey = normalizeConversationKey(elementAttribute(turnElement, "data-turn-key"));
    const scope = turnElement || rootNode;
    const siblingIndex = Math.max(0, safeQueryAll(scope, descriptor.selector).indexOf(element));
    const fallbackText = normalizeToolName(
      element.textContent || element.parentElement?.textContent || element.parentNode?.textContent || ""
    );
    const fallbackKey = `${conversationKey}:visible:${testId}:${siblingIndex}:${shortHash(fallbackText)}`;
    return {
      kind: classifyToolKind(name, namespace, explicitKind),
      name,
      namespace,
      id: `dom:${turnKey ? `${conversationKey}:${turnKey}:${testId}:${siblingIndex}` : fallbackKey}`,
      source: "dom-tool-card",
      timestamp: Date.now(),
      turnKey,
      conversationKey,
    };
  }

  function extractDomToolCallEvents(rootNode = document) {
    const events = [];
    for (const descriptor of DOM_TOOL_DESCRIPTORS) {
      for (const element of safeQueryAll(rootNode, descriptor.selector)) {
        const event = domToolEventFromElement(element, descriptor, rootNode);
        if (event) events.push(event);
      }
    }
    return dedupeToolCallEvents(events);
  }

  function processDomToolCalls(rootNode = document) {
    const events = extractDomToolCallEvents(rootNode);
    if (!events.length) return false;
    let changed = false;
    for (const event of events) {
      changed = recordToolCall(event) || changed;
    }
    if (changed) {
      pruneState();
      saveState();
    }
    return changed;
  }

  function processCapturePayload(payload, source, url = "") {
    const toolChanged = processToolCallPayload(payload, source);
    if (sourceMode === "external") return toolChanged;
    processModelPayload(payload, false);
    const candidates = findUsageCandidates(payload);
    if (!candidates.length) return toolChanged;
    let changed = false;
    for (const candidate of candidates) {
      changed = rememberCapturedUsage(candidate, source, url) || changed;
    }
    if (changed) {
      pruneState();
      saveState();
      render({ animate: true });
    }
    return changed || toolChanged;
  }

  function shouldProcessStandalonePayload() {
    return sourceMode !== "external" && (captureInstalled || !externalSourceAvailable());
  }

  function processModelPayload(payload, recordTools = true) {
    const toolChanged = recordTools ? processToolCallPayload(payload, "model") : false;
    if (!payload) return toolChanged;
    if (typeof payload === "string") {
      return parseTextPayloads(payload).some((item) => processModelPayload(item, false)) || toolChanged;
    }
    if (Array.isArray(payload)) {
      return payload.some((item) => processModelPayload(item, false)) || toolChanged;
    }
    if (typeof payload !== "object") return toolChanged;

    const conversationKey = extractConversationKey(payload);
    let observed = observeAppModelMessage(payload);
    observed = observeModel(extractDirectModel(payload), "observed", Date.now(), conversationKey) || observed;
    const body = parseMaybeJsonObject(payload.body);
    if (body && body !== payload) observed = processModelPayload(body, false) || observed;
    return observed || toolChanged;
  }

  function installModelCapture() {
    if (modelCaptureInstalled) return false;
    window.addEventListener?.(
      "codex-message-from-view",
      (event) => {
        try {
          if (shouldProcessStandalonePayload()) {
            processCapturePayload(event.detail, "codex-message");
          } else {
            processModelPayload(event.detail);
          }
        } catch {
          // 不影响 Codex 自身消息投递。
        }
      },
      true
    );
    window.addEventListener?.(
      "message",
      (event) => {
        try {
          processModelPayload(event.data);
        } catch {
          // Ignore unrelated messages.
        }
      },
      true
    );
    modelCaptureInstalled = true;
    return true;
  }

  function installFetchCapture() {
    if (typeof window.fetch !== "function" || window.fetch.__codexDailyTokenUsageWrapped === VERSION) return;
    const originalFetch = window.fetch;
    async function wrappedFetch(input, init) {
      const url = requestUrl(input);
      processModelPayload(init?.body);
      const response = await originalFetch.call(this, input, init);
      const contentType = String(response?.headers?.get?.("content-type") || "");
      if (response?.clone && (isLikelyUsageUrl(url) || /json|event-stream|text/.test(contentType))) {
        response
          .clone()
          .text()
          .then((text) => processCapturePayload(text, "fetch", url))
          .catch(() => {});
      }
      return response;
    }
    wrappedFetch.__codexDailyTokenUsageWrapped = VERSION;
    wrappedFetch.__codexDailyTokenUsageOriginal = originalFetch;
    window.fetch = wrappedFetch;
  }

  function installXhrCapture() {
    const Xhr = window.XMLHttpRequest;
    if (!Xhr?.prototype || Xhr.prototype.__codexDailyTokenUsageWrapped === VERSION) return;
    const originalOpen = Xhr.prototype.open;
    const originalSend = Xhr.prototype.send;
    Xhr.prototype.open = function open(method, url, ...rest) {
      this.__codexDailyTokenUsageUrl = url;
      return originalOpen.call(this, method, url, ...rest);
    };
    Xhr.prototype.send = function send(...args) {
      processModelPayload(args[0]);
      this.addEventListener?.("loadend", () => {
        const url = this.__codexDailyTokenUsageUrl || "";
        if (!isLikelyUsageUrl(url) && !String(this.getResponseHeader?.("content-type") || "").match(/json|event-stream|text/)) {
          return;
        }
        try {
          processCapturePayload(this.responseText || "", "xhr", url);
        } catch {
          // Ignore unreadable XHR bodies.
        }
      });
      return originalSend.apply(this, args);
    };
    Xhr.prototype.__codexDailyTokenUsageOriginalOpen = originalOpen;
    Xhr.prototype.__codexDailyTokenUsageOriginalSend = originalSend;
    Xhr.prototype.__codexDailyTokenUsageWrapped = VERSION;
  }

  function installWebSocketCapture() {
    if (typeof window.WebSocket !== "function" || window.WebSocket.__codexDailyTokenUsageWrapped === VERSION) return;
    const NativeWebSocket = window.WebSocket;
    function DailyTokenUsageWebSocket(...args) {
      const socket = new NativeWebSocket(...args);
      socket.addEventListener?.("message", (event) => {
        try {
          if (typeof event.data === "string") {
            processCapturePayload(event.data, "websocket");
          } else if (event.data instanceof Blob && event.data.size <= 512000) {
            event.data.text().then((text) => processCapturePayload(text, "websocket")).catch(() => {});
          }
        } catch {
          // Keep socket delivery untouched.
        }
      });
      return socket;
    }
    try {
      DailyTokenUsageWebSocket.prototype = NativeWebSocket.prototype;
      Object.defineProperty(DailyTokenUsageWebSocket, "CONNECTING", { value: NativeWebSocket.CONNECTING });
      Object.defineProperty(DailyTokenUsageWebSocket, "OPEN", { value: NativeWebSocket.OPEN });
      Object.defineProperty(DailyTokenUsageWebSocket, "CLOSING", { value: NativeWebSocket.CLOSING });
      Object.defineProperty(DailyTokenUsageWebSocket, "CLOSED", { value: NativeWebSocket.CLOSED });
    } catch {
      // Best-effort compatibility.
    }
    DailyTokenUsageWebSocket.__codexDailyTokenUsageWrapped = VERSION;
    DailyTokenUsageWebSocket.__codexDailyTokenUsageOriginal = NativeWebSocket;
    window.WebSocket = DailyTokenUsageWebSocket;
  }

  function installMessageCapture() {
    if (window.__codexDailyTokenUsageMessageCapture === VERSION) return;
    window.addEventListener?.(
      "message",
      (event) => {
        try {
          processModelPayload(event.data);
          processCapturePayload(event.data, "post-message");
        } catch {
          // Ignore unrelated messages.
        }
      },
      true
    );
    window.__codexDailyTokenUsageMessageCapture = VERSION;
  }

  function installStandaloneCapture() {
    if (captureInstalled) return false;
    installFetchCapture();
    installXhrCapture();
    installWebSocketCapture();
    installMessageCapture();
    captureInstalled = true;
    sourceMode = "standalone";
    return true;
  }

  function restoreStandaloneCapture() {
    if (window.fetch?.__codexDailyTokenUsageWrapped === VERSION) {
      window.fetch = window.fetch.__codexDailyTokenUsageOriginal;
    }
    const Xhr = window.XMLHttpRequest;
    if (Xhr?.prototype?.__codexDailyTokenUsageWrapped === VERSION) {
      Xhr.prototype.open = Xhr.prototype.__codexDailyTokenUsageOriginalOpen;
      Xhr.prototype.send = Xhr.prototype.__codexDailyTokenUsageOriginalSend;
      delete Xhr.prototype.__codexDailyTokenUsageWrapped;
    }
    if (window.WebSocket?.__codexDailyTokenUsageWrapped === VERSION) {
      window.WebSocket = window.WebSocket.__codexDailyTokenUsageOriginal;
    }
    captureInstalled = false;
  }

  function readExternalTurns() {
    const source = window[SOURCE_API_KEY];
    if (!source || typeof source.export !== "function") {
      return [];
    }

    try {
      const exported = source.export();
      return Array.isArray(exported?.turns) ? exported.turns : [];
    } catch {
      return [];
    }
  }

  function externalSourceAvailable() {
    return typeof window[SOURCE_API_KEY]?.export === "function";
  }

  function shouldInstallStandaloneCapture(externalTurns) {
    if (captureInstalled) return false;
    if (!externalSourceAvailable()) {
      return true;
    }
    if (externalTurns.length > 0) return false;
    externalEmptyCount += 1;
    return externalEmptyCount >= EXTERNAL_EMPTY_LIMIT;
  }

  function syncFromSource() {
    let changed = false;
    const externalTurns = readExternalTurns();

    if (externalTurns.length > 0) {
      sourceMode = "external";
      externalEmptyCount = 0;
      if (captureInstalled) restoreStandaloneCapture();
    } else if (captureInstalled) {
      sourceMode = "standalone";
    } else {
      sourceMode = "waiting";
    }

    for (const turn of externalTurns) {
      changed = upsertTurn(turn) || changed;
    }

    if (shouldInstallStandaloneCapture(externalTurns)) {
      installStandaloneCapture();
    }

    if (changed) {
      pruneState();
      saveState();
    }
    return changed;
  }

  function installStyle() {
    if (document.getElementById(STYLE_ID)) {
      style = document.getElementById(STYLE_ID);
      return;
    }

    style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      #${ROOT_ID} {
        position: relative;
        display: flex;
        flex: 0 0 auto;
        align-items: center;
        pointer-events: none;
        -webkit-app-region: no-drag;
        z-index: 2147483600;
        font-family: ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      #${ROOT_ID}.codex-daily-floating {
        position: fixed;
        top: ${FLOATING_TOP}px;
        right: ${FLOATING_DEFAULT_RIGHT}px;
        bottom: auto;
        left: auto;
      }
      #${ROOT_ID} .codex-daily-trigger {
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
        transition: background 120ms ease, border-color 120ms ease, transform 120ms ease;
        pointer-events: auto;
        -webkit-app-region: no-drag;
      }
      #${ROOT_ID} .codex-daily-trigger:hover,
      #${ROOT_ID} .codex-daily-trigger:focus-visible,
      #${ROOT_ID}.is-open .codex-daily-trigger {
        background: var(--color-token-background-tertiary, rgba(127, 127, 127, 0.15));
        border-color: var(--color-token-border-strong, rgba(127, 127, 127, 0.36));
      }
      #${ROOT_ID}.is-updated .codex-daily-trigger {
        animation: codex-daily-token-pulse 420ms ease;
      }
      #${ROOT_ID}[data-layout="compact-icon"] .codex-daily-trigger {
        width: ${FLOATING_COMPACT_WIDTH}px;
        min-width: ${FLOATING_COMPACT_WIDTH}px;
        padding: 0;
        gap: 0;
      }
      #${ROOT_ID} .codex-daily-sigma {
        width: 16px;
        height: 16px;
        display: inline-grid;
        place-items: center;
        border-radius: 5px;
        background: rgba(74, 144, 226, 0.14);
        color: #4a90e2;
        font-size: 12px;
        font-weight: 700;
      }
      #${ROOT_ID} .codex-daily-total {
        font-variant-numeric: tabular-nums;
        font-weight: 600;
        letter-spacing: 0.01em;
      }
      #${ROOT_ID}[data-layout="compact-icon"] .codex-daily-label,
      #${ROOT_ID}[data-layout="compact-icon"] .codex-daily-total {
        display: none;
      }
      #${PANEL_ID} {
        position: fixed;
        width: min(350px, calc(100vw - 24px));
        box-sizing: border-box;
        padding: 14px;
        border: 1px solid var(--color-token-border, rgba(127, 127, 127, 0.24));
        border-radius: 12px;
        color: var(--color-token-foreground, #202020);
        background: var(--color-token-background, #ffffff);
        box-shadow: 0 14px 40px rgba(0, 0, 0, 0.18);
        opacity: 0;
        visibility: hidden;
        transform: translateY(-4px);
        transition: opacity 120ms ease, visibility 120ms ease, transform 120ms ease;
        pointer-events: none;
        cursor: default;
        z-index: 2147483647;
        font-family: ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        -webkit-app-region: no-drag;
      }
      #${PANEL_ID}.is-visible {
        opacity: 1;
        visibility: visible;
        transform: translateY(0);
        pointer-events: auto;
      }
      #${PANEL_ID} .codex-daily-heading {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        margin-bottom: 12px;
      }
      #${PANEL_ID} .codex-daily-title {
        font-size: 13px;
        font-weight: 650;
      }
      #${PANEL_ID} .codex-daily-head-actions {
        display: inline-flex;
        align-items: center;
        gap: 6px;
      }
      #${PANEL_ID} .codex-daily-price-toggle {
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
      #${PANEL_ID} .codex-daily-price-toggle:hover,
      #${PANEL_ID} .codex-daily-price-toggle[aria-expanded="true"] {
        color: var(--color-token-foreground, #202020);
        border-color: rgba(74, 144, 226, 0.38);
        background: rgba(74, 144, 226, 0.11);
      }
      #${PANEL_ID} .codex-daily-date-nav {
        display: inline-flex;
        align-items: center;
        gap: 3px;
        padding: 2px;
        border: 1px solid var(--color-token-border, rgba(127, 127, 127, 0.2));
        border-radius: 8px;
        background: var(--color-token-background-secondary, rgba(127, 127, 127, 0.07));
      }
      #${PANEL_ID} .codex-daily-date-button {
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
      #${PANEL_ID} .codex-daily-date-button:hover:not(:disabled) {
        color: var(--color-token-foreground, #202020);
        background: var(--color-token-background-tertiary, rgba(127, 127, 127, 0.14));
      }
      #${PANEL_ID} .codex-daily-date-button:disabled {
        cursor: default;
        opacity: 0.28;
      }
      #${PANEL_ID} .codex-daily-date-input {
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
      #${PANEL_ID} .codex-daily-summary {
        display: flex;
        align-items: flex-end;
        justify-content: space-between;
        gap: 12px;
        margin: 2px 0 12px;
      }
      #${PANEL_ID} .codex-daily-total-block {
        flex: 1 1 auto;
        min-width: 0;
      }
      #${PANEL_ID} .codex-daily-total-label {
        margin-bottom: 4px;
        color: var(--color-token-foreground-secondary, #737373);
        font-size: 11px;
        font-weight: 600;
      }
      #${PANEL_ID} .codex-daily-hero {
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
      #${PANEL_ID} .codex-daily-cost {
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
      #${PANEL_ID} .codex-daily-cost-label {
        color: var(--color-token-foreground-secondary, #737373);
        font-size: 11px;
        font-weight: 600;
        white-space: nowrap;
      }
      #${PANEL_ID} .codex-daily-cost-value {
        color: #2f7dd1;
        font-size: 15px;
        font-weight: 750;
        font-variant-numeric: tabular-nums;
        white-space: nowrap;
      }
      @media (max-width: 360px) {
        #${PANEL_ID} .codex-daily-summary {
          align-items: stretch;
          flex-direction: column;
        }
        #${PANEL_ID} .codex-daily-cost {
          width: 100%;
          box-sizing: border-box;
        }
      }
      #${PANEL_ID} .codex-daily-grid {
        display: grid;
        grid-template-columns: 1fr auto;
        gap: 8px 16px;
        padding: 11px 0;
        border-top: 1px solid var(--color-token-border, rgba(127, 127, 127, 0.18));
        border-bottom: 1px solid var(--color-token-border, rgba(127, 127, 127, 0.18));
        font-size: 12px;
      }
      #${PANEL_ID} .codex-daily-label {
        color: var(--color-token-foreground-secondary, #737373);
      }
      #${PANEL_ID} .codex-daily-value {
        text-align: right;
        font-variant-numeric: tabular-nums;
        font-weight: 550;
      }
      #${PANEL_ID} .codex-daily-trend {
        position: relative;
        margin-top: 11px;
        padding: 10px 11px 9px;
        border: 1px solid var(--color-token-border, rgba(127, 127, 127, 0.18));
        border-radius: 10px;
        background: var(--color-token-background-secondary, rgba(127, 127, 127, 0.06));
      }
      #${PANEL_ID} .codex-daily-trend-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        margin-bottom: 6px;
        font-size: 11px;
      }
      #${PANEL_ID} .codex-daily-trend-title {
        color: var(--color-token-foreground, #202020);
        font-weight: 650;
      }
      #${PANEL_ID} .codex-daily-trend-peak {
        color: var(--color-token-foreground-secondary, #737373);
        font-variant-numeric: tabular-nums;
      }
      #${PANEL_ID} .codex-daily-trend-svg {
        display: block;
        width: 100%;
        height: 82px;
        overflow: visible;
      }
      #${PANEL_ID} .codex-daily-trend-labels {
        display: grid;
        grid-template-columns: repeat(5, 1fr);
        gap: 4px;
        margin-top: 4px;
        color: var(--color-token-foreground-secondary, #737373);
        font-size: 10px;
        font-variant-numeric: tabular-nums;
        text-align: center;
      }
      #${PANEL_ID} .codex-daily-trend-labels span.is-active {
        color: var(--color-token-foreground, #202020);
        font-weight: 650;
      }
      #${PANEL_ID} .codex-daily-trend-point {
        cursor: default;
        outline: none;
      }
      #${PANEL_ID} .codex-daily-trend-point:hover,
      #${PANEL_ID} .codex-daily-trend-point:focus {
        filter: drop-shadow(0 0 4px rgba(82, 124, 255, 0.42));
      }
      #${PANEL_ID} .codex-daily-trend-tooltip {
        --codex-daily-trend-tooltip-bg: rgba(255, 255, 255, 0.96);
        --codex-daily-trend-tooltip-border: rgba(15, 23, 42, 0.14);
        --codex-daily-trend-tooltip-fg: #202020;
        --codex-daily-trend-tooltip-muted: #62666d;
        position: absolute;
        z-index: 5;
        width: max-content;
        min-width: 158px;
        max-width: 210px;
        padding: 9px 10px;
        border: 1px solid var(--codex-daily-trend-tooltip-border);
        border-radius: 11px;
        background: var(--codex-daily-trend-tooltip-bg);
        box-shadow: 0 10px 28px rgba(0, 0, 0, 0.16);
        color: var(--codex-daily-trend-tooltip-fg);
        font-size: 11px;
        line-height: 1.35;
        pointer-events: none;
        transform: translate(-50%, calc(-100% - 10px));
      }
      #${PANEL_ID} .codex-daily-trend-tooltip[hidden] {
        display: none;
      }
      #${PANEL_ID} .codex-daily-trend-tooltip-date {
        margin-bottom: 6px;
        font-weight: 700;
      }
      #${PANEL_ID} .codex-daily-trend-tooltip-row {
        display: flex;
        justify-content: space-between;
        gap: 14px;
        margin-top: 3px;
        color: var(--codex-daily-trend-tooltip-muted);
      }
      #${PANEL_ID} .codex-daily-trend-tooltip-row strong {
        color: var(--codex-daily-trend-tooltip-fg);
        font-weight: 700;
        font-variant-numeric: tabular-nums;
        white-space: nowrap;
      }
      #${PANEL_ID} .codex-daily-models,
      #${PANEL_ID} .codex-daily-tools,
      #${PANEL_ID} .codex-daily-price-panel {
        margin-top: 11px;
        padding: 10px 11px;
        border: 1px solid var(--color-token-border, rgba(127, 127, 127, 0.18));
        border-radius: 10px;
        background: var(--color-token-background-secondary, rgba(127, 127, 127, 0.055));
      }
      #${PANEL_ID} .codex-daily-section-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        margin-bottom: 8px;
        font-size: 11px;
      }
      #${PANEL_ID} .codex-daily-section-title {
        font-weight: 650;
      }
      #${PANEL_ID} .codex-daily-section-meta {
        color: var(--color-token-foreground-secondary, #737373);
        font-variant-numeric: tabular-nums;
      }
      #${PANEL_ID} .codex-daily-model-list,
      #${PANEL_ID} .codex-daily-tool-list {
        display: grid;
        gap: 7px;
      }
      #${PANEL_ID} .codex-daily-tool-metrics {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 7px;
        margin-bottom: 9px;
      }
      #${PANEL_ID} .codex-daily-tool-metric {
        min-width: 0;
        padding: 7px 8px;
        border-radius: 9px;
        background: rgba(127, 127, 127, 0.08);
      }
      #${PANEL_ID} .codex-daily-tool-metric span {
        display: block;
        margin-bottom: 3px;
        overflow: hidden;
        color: var(--color-token-foreground-secondary, #737373);
        font-size: 10px;
        line-height: 1.2;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      #${PANEL_ID} .codex-daily-tool-metric strong {
        display: block;
        overflow: hidden;
        color: var(--color-token-foreground, #202020);
        font-size: 12px;
        font-variant-numeric: tabular-nums;
        font-weight: 750;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      #${PANEL_ID} .codex-daily-model-row {
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto;
        gap: 4px 10px;
        align-items: center;
        font-size: 11px;
      }
      #${PANEL_ID} .codex-daily-model-name {
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        font-weight: 600;
      }
      #${PANEL_ID} .codex-daily-model-cost {
        color: var(--color-token-foreground, #202020);
        font-weight: 650;
        font-variant-numeric: tabular-nums;
      }
      #${PANEL_ID} .codex-daily-model-bar {
        grid-column: 1 / -1;
        height: 5px;
        overflow: hidden;
        border-radius: 999px;
        background: rgba(127, 127, 127, 0.14);
      }
      #${PANEL_ID} .codex-daily-model-fill {
        display: block;
        height: 100%;
        border-radius: inherit;
        background: linear-gradient(90deg, #3BA7FF, #8D6BFF);
      }
      #${PANEL_ID} .codex-daily-tool-row {
        display: grid;
        grid-template-columns: auto minmax(0, 1fr) auto;
        gap: 8px;
        align-items: center;
        font-size: 11px;
      }
      #${PANEL_ID} .codex-daily-tool-kind {
        min-width: 34px;
        padding: 2px 6px;
        border-radius: 999px;
        background: rgba(59, 167, 255, 0.12);
        color: #2676d9;
        font-size: 10px;
        font-weight: 700;
        text-align: center;
      }
      #${PANEL_ID} .codex-daily-tool-kind.is-plugin {
        background: rgba(141, 107, 255, 0.13);
        color: #7652e5;
      }
      #${PANEL_ID} .codex-daily-tool-name {
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        font-weight: 600;
      }
      #${PANEL_ID} .codex-daily-tool-count {
        color: var(--color-token-foreground, #202020);
        font-weight: 700;
        font-variant-numeric: tabular-nums;
      }
      #${PANEL_ID} .codex-daily-price-panel[hidden] {
        display: none;
      }
      #${PANEL_ID} .codex-daily-price-help {
        margin-bottom: 9px;
        color: var(--color-token-foreground-secondary, #737373);
        font-size: 10.5px;
        line-height: 1.45;
      }
      #${PANEL_ID} .codex-daily-price-add {
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto;
        gap: 6px;
        margin-bottom: 9px;
      }
      #${PANEL_ID} .codex-daily-price-model-input,
      #${PANEL_ID} .codex-daily-price-input {
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
      #${PANEL_ID} .codex-daily-price-input {
        width: 100%;
        font-variant-numeric: tabular-nums;
      }
      #${PANEL_ID} .codex-daily-price-add-button,
      #${PANEL_ID} .codex-daily-price-clear {
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
      #${PANEL_ID} .codex-daily-price-clear:disabled {
        cursor: default;
        opacity: 0.55;
      }
      #${PANEL_ID} .codex-daily-price-list {
        display: grid;
        gap: 9px;
        max-height: 260px;
        overflow: auto;
        padding-right: 2px;
      }
      #${PANEL_ID} .codex-daily-price-row {
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto auto;
        gap: 6px;
        padding-bottom: 9px;
        border-bottom: 1px solid var(--color-token-border, rgba(127, 127, 127, 0.13));
      }
      #${PANEL_ID} .codex-daily-price-row:last-child {
        padding-bottom: 0;
        border-bottom: 0;
      }
      #${PANEL_ID} .codex-daily-price-name {
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        font-size: 11px;
        font-weight: 650;
      }
      #${PANEL_ID} .codex-daily-price-badge {
        justify-self: end;
        align-self: center;
        padding: 2px 6px;
        border-radius: 999px;
        color: #2676d9;
        background: rgba(59, 167, 255, 0.12);
        font-size: 10px;
        font-weight: 700;
      }
      #${PANEL_ID} .codex-daily-price-badge.is-custom {
        color: #7652e5;
        background: rgba(141, 107, 255, 0.13);
      }
      #${PANEL_ID} .codex-daily-price-grid {
        grid-column: 1 / -1;
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        gap: 6px;
      }
      #${PANEL_ID} .codex-daily-price-field {
        display: grid;
        gap: 3px;
        color: var(--color-token-foreground-secondary, #737373);
        font-size: 10px;
      }
      #${PANEL_ID} .codex-daily-foot {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        margin-top: 11px;
        color: var(--color-token-foreground-secondary, #737373);
        font-size: 11px;
        line-height: 1.45;
      }
      #${PANEL_ID} .codex-daily-status-wrap {
        min-width: 0;
        display: flex;
        align-items: center;
        gap: 7px;
      }
      #${PANEL_ID} .codex-daily-status-text {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      #${PANEL_ID} .codex-daily-status {
        width: 7px;
        height: 7px;
        flex: 0 0 auto;
        border-radius: 50%;
        background: #c58a22;
      }
      #${PANEL_ID}.is-connected .codex-daily-status {
        background: #2e9d58;
      }
      #${PANEL_ID} .codex-daily-share {
        height: 29px;
        display: inline-flex;
        flex: 0 0 auto;
        align-items: center;
        gap: 5px;
        padding: 0 9px;
        border: 1px solid var(--color-token-border, rgba(127, 127, 127, 0.22));
        border-radius: 8px;
        color: var(--color-token-foreground, #202020);
        background: var(--color-token-background-secondary, rgba(127, 127, 127, 0.08));
        cursor: pointer;
        font: inherit;
        font-size: 11px;
        font-weight: 600;
        line-height: 1;
        white-space: nowrap;
      }
      #${PANEL_ID} .codex-daily-share:hover:not(:disabled) {
        border-color: rgba(74, 144, 226, 0.4);
        background: rgba(74, 144, 226, 0.12);
      }
      #${PANEL_ID} .codex-daily-share:disabled {
        cursor: wait;
        opacity: 0.65;
      }
      #${PANEL_ID} .codex-daily-share[data-state="success"] {
        color: #24834a;
        border-color: rgba(46, 157, 88, 0.35);
        background: rgba(46, 157, 88, 0.1);
      }
      #${PANEL_ID} .codex-daily-share[data-state="error"] {
        color: #bf3f48;
        border-color: rgba(191, 63, 72, 0.35);
        background: rgba(191, 63, 72, 0.1);
      }
      #${PANEL_ID} .codex-daily-share svg {
        width: 14px;
        height: 14px;
      }
      @keyframes codex-daily-token-pulse {
        0%, 100% { transform: scale(1); }
        45% { transform: scale(1.035); }
      }
      @media (prefers-color-scheme: dark) {
        #${PANEL_ID} {
          background: var(--color-token-background, #202020);
          color: var(--color-token-foreground, #f2f2f2);
        }
      }
    `;
    (document.head || document.documentElement).appendChild(style);
  }

  function createRoot() {
    root = document.createElement("div");
    root.id = ROOT_ID;
    root.innerHTML = `
      <button class="codex-daily-trigger" type="button" aria-expanded="false" aria-label="查看今日 Token 用量">
        <span class="codex-daily-sigma" aria-hidden="true">Σ</span>
        <span class="codex-daily-label">今日</span>
        <span class="codex-daily-total">0</span>
      </button>
    `;

    panel = document.createElement("section");
    panel.id = PANEL_ID;
    panel.setAttribute("aria-label", "Token 用量明细");
    panel.innerHTML = `
        <div class="codex-daily-heading">
          <span class="codex-daily-title">Token 用量</span>
          <span class="codex-daily-head-actions">
            <button class="codex-daily-price-toggle" type="button" data-action="toggle-prices" aria-expanded="false">价格</button>
            <span class="codex-daily-date-nav">
              <button class="codex-daily-date-button" type="button" data-action="previous-day" aria-label="查看前一天">‹</button>
              <input class="codex-daily-date-input" type="date" aria-label="选择统计日期">
              <button class="codex-daily-date-button" type="button" data-action="next-day" aria-label="查看后一天">›</button>
            </span>
          </span>
        </div>
        <div class="codex-daily-summary">
          <div class="codex-daily-total-block">
            <div class="codex-daily-total-label">累计 Token</div>
            <div class="codex-daily-hero">0</div>
          </div>
          <div class="codex-daily-cost">
            <span class="codex-daily-cost-label">估算金额</span>
            <span class="codex-daily-cost-value" data-field="cost">$0.0000</span>
          </div>
        </div>
        <div class="codex-daily-grid">
          <span class="codex-daily-label">输入 Token</span><span class="codex-daily-value" data-field="input">0</span>
          <span class="codex-daily-label">输出 Token</span><span class="codex-daily-value" data-field="output">0</span>
          <span class="codex-daily-label">缓存输入</span><span class="codex-daily-value" data-field="cached">0</span>
          <span class="codex-daily-label">推理 Token</span><span class="codex-daily-value" data-field="reasoning">0</span>
          <span class="codex-daily-label">请求次数</span><span class="codex-daily-value" data-field="calls">0</span>
          <span class="codex-daily-label">最近更新</span><span class="codex-daily-value" data-field="updatedAt">暂无</span>
        </div>
        <div class="codex-daily-trend">
          <div class="codex-daily-trend-head">
            <span class="codex-daily-trend-title">近 5 日趋势</span>
            <span class="codex-daily-trend-peak" data-field="trendPeak">峰值 0</span>
          </div>
          <svg class="codex-daily-trend-svg" viewBox="0 0 300 82" role="img" aria-label="近 5 日 Token 趋势"></svg>
          <div class="codex-daily-trend-labels"></div>
          <div class="codex-daily-trend-tooltip" hidden></div>
        </div>
        <div class="codex-daily-models">
          <div class="codex-daily-section-head">
            <span class="codex-daily-section-title">按 Model 分布</span>
            <span class="codex-daily-section-meta" data-field="modelMeta">暂无定价</span>
          </div>
          <div class="codex-daily-model-list"></div>
        </div>
        <div class="codex-daily-tools">
          <div class="codex-daily-section-head">
            <span class="codex-daily-section-title">工具调用</span>
            <span class="codex-daily-section-meta" data-field="toolMeta">MCP 0 · 插件 0</span>
          </div>
          <div class="codex-daily-tool-metrics">
            <div class="codex-daily-tool-metric">
              <span>可识别请求</span>
              <strong data-field="toolTurnCount">0</strong>
            </div>
            <div class="codex-daily-tool-metric">
              <span>调用率</span>
              <strong data-field="toolCallRate">0%</strong>
            </div>
            <div class="codex-daily-tool-metric">
              <span>调用密度</span>
              <strong data-field="toolDensity">0 / 10万T</strong>
            </div>
            <div class="codex-daily-tool-metric">
              <span>关联用量</span>
              <strong data-field="toolLinkedUsage">待关联</strong>
            </div>
          </div>
          <div class="codex-daily-tool-list"></div>
        </div>
        <div class="codex-daily-price-panel" hidden>
          <div class="codex-daily-section-head">
            <span class="codex-daily-section-title">Model 价格设置</span>
            <span class="codex-daily-section-meta">USD / 1M tokens</span>
          </div>
          <div class="codex-daily-price-help">内置 OpenAI API Pricing 的 Standard 参考价，单位 USD / 1M tokens；有上下文分档的模型按短上下文价预置。用户输入会覆盖预置字段。Cache writes、工具调用按次费用、Batch/Flex/Priority 不纳入估算。价格只用于本地估算，不代表官方账单。</div>
          <div class="codex-daily-price-add">
            <input class="codex-daily-price-model-input" type="text" placeholder="添加 Model，例如 gpt-5.5" aria-label="添加 Model 名称">
            <button class="codex-daily-price-add-button" type="button" data-action="add-price-model">添加</button>
          </div>
          <div class="codex-daily-price-list"></div>
        </div>
        <div class="codex-daily-foot">
          <span class="codex-daily-status-wrap">
            <span class="codex-daily-status" aria-hidden="true"></span>
            <span class="codex-daily-status-text">等待数据源</span>
          </span>
          <button class="codex-daily-share" type="button" data-state="idle" aria-label="复制当前日期的 Token 分享图片">
            <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
              <path d="M10 13V3m0 0L6.5 6.5M10 3l3.5 3.5M4 10.5v4A1.5 1.5 0 0 0 5.5 16h9a1.5 1.5 0 0 0 1.5-1.5v-4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            <span>分享</span>
          </button>
        </div>
    `;
    document.body.appendChild(panel);

    const trigger = root.querySelector(".codex-daily-trigger");
    trigger.addEventListener("click", (event) => {
      event.stopPropagation();
      pinnedOpen = !pinnedOpen;
      if (pinnedOpen) {
        showPanel();
      } else {
        hidePanel();
      }
    });
    trigger.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        pinnedOpen = false;
        hidePanel();
        trigger.blur();
      }
    });
    trigger.addEventListener("focus", showPanel);
    trigger.addEventListener("blur", schedulePanelClose);
    trigger.addEventListener("mouseenter", showPanel);
    trigger.addEventListener("mouseleave", schedulePanelClose);
    panel.addEventListener("mouseenter", cancelPanelClose);
    panel.addEventListener("mouseleave", schedulePanelClose);
    panel.querySelector('[data-action="previous-day"]').addEventListener("click", () => {
      selectDate(shiftDateKey(selectedDateKey, -1));
    });
    panel.querySelector('[data-action="next-day"]').addEventListener("click", () => {
      selectDate(shiftDateKey(selectedDateKey, 1));
    });
    panel.querySelector('[data-action="toggle-prices"]').addEventListener("click", togglePricePanel);
    panel.querySelector('[data-action="add-price-model"]').addEventListener("click", addPriceModelFromInput);
    panel.querySelector(".codex-daily-date-input").addEventListener("change", (event) => {
      selectDate(event.currentTarget.value);
    });
    panel.querySelector(".codex-daily-price-model-input").addEventListener("keydown", (event) => {
      if (event.key === "Enter") addPriceModelFromInput();
    });
    panel.querySelector(".codex-daily-price-list").addEventListener("input", handlePriceInput);
    panel.querySelector(".codex-daily-price-list").addEventListener("click", handlePriceListClick);
    panel.querySelector(".codex-daily-share").addEventListener("click", handleShareClick);
  }

  function togglePricePanel() {
    if (!panel) return;
    const pricePanel = panel.querySelector(".codex-daily-price-panel");
    const toggle = panel.querySelector('[data-action="toggle-prices"]');
    const nextOpen = pricePanel?.hidden !== false;
    if (pricePanel) pricePanel.hidden = !nextOpen;
    toggle?.setAttribute("aria-expanded", nextOpen ? "true" : "false");
    if (nextOpen) renderPriceSettings(aggregateDay(selectedDateKey));
    positionPanel();
  }

  function addPriceModelFromInput() {
    if (!panel) return;
    const input = panel.querySelector(".codex-daily-price-model-input");
    const model = normalizeModelName(input?.value || "");
    if (!model) return;
    if (!priceConfig.models[model]) {
      priceConfig.models[model] = normalizePriceEntry({});
      savePriceConfig();
    }
    if (input) input.value = "";
    render();
    const pricePanel = panel.querySelector(".codex-daily-price-panel");
    if (pricePanel) pricePanel.hidden = false;
    panel.querySelector('[data-action="toggle-prices"]')?.setAttribute("aria-expanded", "true");
  }

  function handlePriceInput(event) {
    const target = event.target;
    if (!target?.classList?.contains("codex-daily-price-input")) return;
    updateModelPriceField(target.dataset.model || "", target.dataset.field || "", target.value);
  }

  function handlePriceListClick(event) {
    const button = event.target?.closest?.("[data-action='clear-price-model']");
    if (!button) return;
    clearModelPrice(button.dataset.model || "");
  }

  function knownModels(snapshot = aggregateDay(selectedDateKey)) {
    const models = new Set([
      ...Object.keys(priceConfig.models || {}),
      ...(snapshot.models || []).map((item) => item.model),
      lastObservedModel,
    ]);
    models.delete("");
    return Array.from(models).sort((a, b) => {
      const aTotal = snapshot.models?.find((item) => item.model === a)?.total || 0;
      const bTotal = snapshot.models?.find((item) => item.model === b)?.total || 0;
      return bTotal - aTotal || a.localeCompare(b);
    });
  }

  function renderModelBreakdown(snapshot) {
    if (!panel) return;
    const list = panel.querySelector(".codex-daily-model-list");
    const meta = panel.querySelector('[data-field="modelMeta"]');
    if (meta) {
      const sourceParts = [];
      if (snapshot.customPricedModels) sourceParts.push(`${snapshot.customPricedModels} 个自定义`);
      if (snapshot.defaultPricedModels) sourceParts.push(`${snapshot.defaultPricedModels} 个预置参考价`);
      const pricedText = snapshot.pricedModels > 0 ? sourceParts.join(" · ") || `${snapshot.pricedModels} 个 Model 已定价` : "暂无定价";
      meta.textContent = `${formatCost(snapshot.cost)} · ${pricedText}`;
    }
    if (!list) return;
    const models = snapshot.models?.length
      ? snapshot.models
      : [{ model: UNKNOWN_MODEL, total: 0, cost: 0, priced: false }];
    const maxTotal = Math.max(1, ...models.map((item) => toCount(item.total)));
    list.replaceChildren(
      ...models.slice(0, 6).map((item) => {
        const row = document.createElement("div");
        row.className = "codex-daily-model-row";
        const percent = Math.max(4, Math.min(100, (toCount(item.total) / maxTotal) * 100));
        const priceTitle = item.priceSource === "default" ? DEFAULT_OPENAI_PRICE_SOURCE : item.priceSource === "custom" ? "用户自定义价格" : "未配置价格";
        row.innerHTML = `
          <span class="codex-daily-model-name" title="${escapeHtml(item.model)}">${escapeHtml(item.model)}</span>
          <span class="codex-daily-model-cost" title="${escapeAttribute(priceTitle)}">${item.priced ? formatCost(item.cost) : "未定价"}</span>
          <span class="codex-daily-model-bar" title="${formatExact(item.total)} Token">
            <span class="codex-daily-model-fill" style="width: ${percent.toFixed(1)}%"></span>
          </span>
        `;
        return row;
      })
    );
  }

  function renderToolCalls(snapshot) {
    if (!panel) return;
    const list = panel.querySelector(".codex-daily-tool-list");
    const meta = panel.querySelector('[data-field="toolMeta"]');
    if (meta) {
      meta.textContent = `调用 ${formatExact(snapshot.toolCallTotal)} · MCP ${formatExact(snapshot.mcpCalls)} · 插件 ${formatExact(snapshot.pluginCalls)}`;
    }
    const toolTurnCount = panel.querySelector('[data-field="toolTurnCount"]');
    if (toolTurnCount) toolTurnCount.textContent = `${formatExact(snapshot.toolTurnCount)} 个`;
    const toolCallRate = panel.querySelector('[data-field="toolCallRate"]');
    if (toolCallRate) toolCallRate.textContent = formatPercent(snapshot.toolCallRate);
    const toolDensity = panel.querySelector('[data-field="toolDensity"]');
    if (toolDensity) toolDensity.textContent = `${formatDecimal(snapshot.toolsPer100kTokens, 2)} / 10万T`;
    const toolLinkedUsage = panel.querySelector('[data-field="toolLinkedUsage"]');
    if (toolLinkedUsage) {
      const linkedText = snapshot.toolLinkedTurns
        ? `${formatCompact(snapshot.toolLinkedTokens)} · ${formatCost(snapshot.toolLinkedCost)}`
        : "待关联";
      toolLinkedUsage.textContent = linkedText;
      toolLinkedUsage.title = snapshot.toolLinkedTurns
        ? `${formatExact(snapshot.toolLinkedTurns)} 个 turn，${formatExact(snapshot.toolLinkedTokens)} Token${snapshot.toolLinkedEstimated ? "，部分为时间估算" : ""}`
        : "当前采集源没有可精确关联的 turn 用量";
    }
    if (!list) return;

    const tools = Array.isArray(snapshot.toolCalls) ? snapshot.toolCalls : [];
    if (!tools.length) {
      const row = document.createElement("div");
      row.className = "codex-daily-tool-row";
      row.innerHTML = `
        <span class="codex-daily-tool-kind">无</span>
        <span class="codex-daily-tool-name">暂无工具调用</span>
        <span class="codex-daily-tool-count">0</span>
      `;
      list.replaceChildren(row);
      return;
    }

    list.replaceChildren(
      ...tools.slice(0, 6).map((item) => {
        const row = document.createElement("div");
        row.className = "codex-daily-tool-row";
        const kind = displayToolKind(item.kind);
        const namespace = normalizeToolNamespace(item.namespace);
        const name = normalizeToolName(item.name);
        const displayName = namespace ? `${namespace} / ${name}` : name;
        const countLabel = item.turns
          ? `${formatExact(item.count)} / ${formatExact(item.turns)}`
          : formatExact(item.count);
        row.innerHTML = `
          <span class="codex-daily-tool-kind ${item.kind === "plugin" ? "is-plugin" : ""}">${kind}</span>
          <span class="codex-daily-tool-name" title="${escapeHtml(displayName)}">${escapeHtml(displayName)}</span>
          <span class="codex-daily-tool-count" title="调用次数 / 可识别请求数">${countLabel}</span>
        `;
        return row;
      })
    );
  }

  function renderPriceSettings(snapshot) {
    if (!panel) return;
    const list = panel.querySelector(".codex-daily-price-list");
    if (!list) return;
    const models = knownModels(snapshot);
    if (!models.length) {
      const empty = document.createElement("div");
      empty.className = "codex-daily-price-help";
      empty.textContent = "还没有识别到 Model。可以手动添加 Model 名称后配置价格。";
      list.replaceChildren(empty);
      return;
    }
    list.replaceChildren(
      ...models.map((model) => {
        const customEntry = normalizePriceEntry(priceConfig.models[model]);
        const defaultEntry = defaultModelPrice(model);
        const priceInfo = getModelPriceInfo(model);
        const badgeText = priceInfo.hasCustom ? "自定义" : priceInfo.hasDefault ? "预置" : "未定价";
        const clearLabel = priceInfo.hasCustom ? (priceInfo.hasDefault ? "恢复预置" : "清除") : priceInfo.hasDefault ? "预置" : "清除";
        const clearDisabled = priceInfo.hasCustom ? "" : " disabled";
        const row = document.createElement("div");
        row.className = "codex-daily-price-row";
        row.innerHTML = `
          <span class="codex-daily-price-name" title="${escapeHtml(model)}">${escapeHtml(model)}</span>
          <span class="codex-daily-price-badge ${priceInfo.hasCustom ? "is-custom" : ""}" title="${escapeAttribute(priceInfo.hasCustom && priceInfo.hasDefault ? "用户自定义价格；空字段使用预置参考价" : priceInfo.hasCustom ? "用户自定义价格" : priceInfo.hasDefault ? DEFAULT_OPENAI_PRICE_SOURCE : "未配置价格")}">${badgeText}</span>
          <button class="codex-daily-price-clear" type="button" data-action="clear-price-model" data-model="${escapeAttribute(model)}"${clearDisabled}>${clearLabel}</button>
          <div class="codex-daily-price-grid">
            ${priceInputHtml(model, "input", "输入", customEntry.input, defaultEntry?.input)}
            ${priceInputHtml(model, "cachedInput", "缓存", customEntry.cachedInput, defaultEntry?.cachedInput)}
            ${priceInputHtml(model, "output", "输出", customEntry.output, defaultEntry?.output)}
            ${priceInputHtml(model, "reasoning", "推理", customEntry.reasoning, defaultEntry?.reasoning)}
          </div>
        `;
        return row;
      })
    );
  }

  function priceInputHtml(model, field, label, value, placeholderValue = null) {
    return `
      <label class="codex-daily-price-field">
        <span>${label}</span>
        <input class="codex-daily-price-input" type="number" min="0" step="0.000001" inputmode="decimal"
          data-model="${escapeAttribute(model)}" data-field="${field}" value="${escapeAttribute(formatPriceInputValue(value))}" placeholder="${escapeAttribute(formatPriceInputValue(placeholderValue))}">
      </label>
    `;
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function escapeAttribute(value) {
    return escapeHtml(value);
  }

  function selectDate(dateKey) {
    selectedDateKey = clampDateKey(dateKey);
    render();
    return aggregateDay(selectedDateKey);
  }

  async function handleShareClick(event) {
    const button = event.currentTarget;
    const label = button.querySelector("span");
    pinnedOpen = true;
    showPanel();
    button.disabled = true;
    button.dataset.state = "loading";
    label.textContent = "生成中";

    if (shareFeedbackTimer) window.clearTimeout(shareFeedbackTimer);
    try {
      await copyShareImage(selectedDateKey);
      button.dataset.state = "success";
      label.textContent = "已复制";
    } catch (error) {
      button.dataset.state = "error";
      label.textContent = "复制失败";
      console.warn("[codex-daily-token-usage] share failed", error);
    } finally {
      button.disabled = false;
      shareFeedbackTimer = window.setTimeout(() => {
        if (!button.isConnected) return;
        button.dataset.state = "idle";
        label.textContent = "分享";
      }, 2200);
    }
  }

  function positionPanel() {
    if (!root || !panel) return;
    const rect = root.getBoundingClientRect();
    const panelRect = panel.getBoundingClientRect();
    const panelWidth = panelRect.width || Math.min(350, innerWidth - PANEL_MARGIN * 2);
    const panelHeight = panelRect.height || 580;
    const maxLeft = Math.max(PANEL_MARGIN, innerWidth - panelWidth - PANEL_MARGIN);
    const safeMaxLeft = Math.max(PANEL_MARGIN, innerWidth - panelWidth - WINDOW_BUTTON_SAFE_RIGHT);
    const preferredLeft = rect.left;
    const left = Math.min(Math.max(PANEL_MARGIN, preferredLeft), safeMaxLeft, maxLeft);
    const preferredTop = rect.bottom + PANEL_GAP;
    const maxTop = Math.max(PANEL_MARGIN, innerHeight - panelHeight - PANEL_MARGIN);
    const top = Math.min(Math.max(PANEL_MARGIN, preferredTop), maxTop);
    panel.style.top = `${Math.round(top)}px`;
    panel.style.left = `${Math.round(left)}px`;
    panel.style.right = "auto";
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
    root.querySelector(".codex-daily-trigger")?.setAttribute("aria-expanded", "true");
    panel.classList.add("is-visible");
  }

  function hidePanel() {
    if (!root || !panel) return;
    cancelPanelClose();
    root.classList.remove("is-open");
    root.querySelector(".codex-daily-trigger")?.setAttribute("aria-expanded", "false");
    panel.classList.remove("is-visible");
  }

  function schedulePanelClose() {
    cancelPanelClose();
    closeTimer = window.setTimeout(() => {
      const trigger = root?.querySelector(".codex-daily-trigger");
      const triggerActive = trigger?.matches(":hover") || trigger?.matches(":focus");
      if (!pinnedOpen && !triggerActive && !panel?.matches(":hover")) {
        hidePanel();
      }
    }, 140);
  }

  function handleDocumentPointerDown(event) {
    if (!pinnedOpen || root?.contains(event.target) || panel?.contains(event.target)) return;
    pinnedOpen = false;
    hidePanel();
  }

  function normalizeRect(rect) {
    if (!rect) return null;
    const left = Number(rect.left);
    const top = Number(rect.top);
    const right = Number(rect.right);
    const bottom = Number(rect.bottom);
    if (![left, top, right, bottom].every(Number.isFinite)) return null;
    const width = Math.max(0, right - left);
    const height = Math.max(0, bottom - top);
    if (!width || !height) return null;
    return { left, top, right, bottom, width, height };
  }

  function rectsOverlap(first, second, gap = 0) {
    return (
      first.left < second.right + gap &&
      first.right > second.left - gap &&
      first.top < second.bottom + gap &&
      first.bottom > second.top - gap
    );
  }

  function candidateRectFromRight(right, top, width, height, viewportWidth) {
    const left = viewportWidth - right - width;
    return { left, right: left + width, top, bottom: top + height, width, height };
  }

  function normalizeFloatingAnchor(anchor) {
    const rect = normalizeRect(anchor?.rect || anchor);
    if (!rect) return null;
    return {
      rect,
      gap: Math.max(FLOATING_SAFE_GAP, Number(anchor?.gap) || 0),
      mode: anchor?.mode === "hard" ? "hard" : "soft",
    };
  }

  function resolveFloatingLayout(width, height, viewportWidth, viewportHeight, obstacleRects = [], preferredAnchors = []) {
    const safeWidth = Math.min(Math.max(1, Number(width) || FLOATING_MIN_WIDTH), Math.max(1, viewportWidth - PANEL_MARGIN * 2));
    const compactWidth = Math.min(FLOATING_COMPACT_WIDTH, safeWidth);
    const safeHeight = Math.max(1, Number(height) || FLOATING_HEIGHT);
    const safeViewportHeight = Math.max(safeHeight, Number(viewportHeight) || safeHeight);
    const top = FLOATING_TOP;
    const maxRight = Math.max(PANEL_MARGIN, viewportWidth - PANEL_MARGIN - safeWidth);
    const clampRight = (right) => Math.min(Math.max(PANEL_MARGIN, right), maxRight);
    const maxTop = Math.max(0, safeViewportHeight - safeHeight - PANEL_MARGIN);
    const clampTop = (value) => Math.min(Math.max(0, value), maxTop);
    const layoutFromLeft = (left, width, compact = false, layoutTop = top) => ({
      top: layoutTop,
      right: viewportWidth - left - width,
      left,
      width,
      compact,
    });
    const layoutFromCandidate = (candidate, compact = false) => layoutFromLeft(candidate.left, candidate.width, compact, candidate.top);
    const topObstacles = obstacleRects
      .map(normalizeRect)
      .filter((rect) => rect && rect.bottom > 0 && rect.top < FLOATING_SCAN_TOP && rect.right > 0 && rect.left < viewportWidth);
    const candidateFits = (candidate) =>
      candidate.left >= PANEL_MARGIN &&
      candidate.right <= viewportWidth - PANEL_MARGIN &&
      candidate.top >= 0 &&
      candidate.bottom <= safeViewportHeight;
    const candidateIsClear = (candidate) =>
      candidateFits(candidate) && !topObstacles.some((rect) => rectsOverlap(candidate, rect, FLOATING_SAFE_GAP));
    const collectRowGaps = (layoutTop, rightLimit = viewportWidth - PANEL_MARGIN) => {
      const safeRightLimit = Math.min(Math.max(PANEL_MARGIN, rightLimit), viewportWidth - PANEL_MARGIN);
      if (safeRightLimit <= PANEL_MARGIN) return [];

      const scanRect = {
        left: PANEL_MARGIN,
        right: safeRightLimit,
        top: layoutTop,
        bottom: layoutTop + safeHeight,
        width: safeRightLimit - PANEL_MARGIN,
        height: safeHeight,
      };
      const blocked = topObstacles
        .filter((rect) => rectsOverlap(scanRect, rect, FLOATING_SAFE_GAP))
        .map((rect) => ({
          left: Math.max(PANEL_MARGIN, rect.left - FLOATING_SAFE_GAP),
          right: Math.min(safeRightLimit, rect.right + FLOATING_SAFE_GAP),
        }))
        .filter((rect) => rect.right > rect.left)
        .sort((a, b) => a.left - b.left);

      let cursor = PANEL_MARGIN;
      const gaps = [];
      for (const rect of blocked) {
        if (rect.left > cursor) gaps.push({ left: cursor, right: rect.left });
        cursor = Math.max(cursor, rect.right);
      }
      if (cursor < safeRightLimit) gaps.push({ left: cursor, right: safeRightLimit });
      return gaps;
    };
    const findRightmostClearLayout = (layoutTop, rightLimit = viewportWidth - PANEL_MARGIN) => {
      const gaps = collectRowGaps(layoutTop, rightLimit).sort((a, b) => b.right - a.right);
      const pick = (candidateWidth, compact) => {
        for (const gap of gaps) {
          if (gap.right - gap.left < candidateWidth) continue;
          const candidate = {
            left: gap.right - candidateWidth,
            right: gap.right,
            top: layoutTop,
            bottom: layoutTop + safeHeight,
            width: candidateWidth,
            height: safeHeight,
          };
          if (candidateIsClear(candidate)) return layoutFromCandidate(candidate, compact);
        }
        return null;
      };
      return pick(safeWidth, false) || pick(compactWidth, true);
    };

    for (const anchor of preferredAnchors.map(normalizeFloatingAnchor).filter(Boolean)) {
      const layoutTop = clampTop(anchor.rect.top + (anchor.rect.height - safeHeight) / 2);
      const anchorRightLimit = Math.min(viewportWidth - PANEL_MARGIN, anchor.rect.left - anchor.gap);
      const layoutRight = viewportWidth - anchorRightLimit;
      const candidate = candidateRectFromRight(layoutRight, layoutTop, safeWidth, safeHeight, viewportWidth);
      if (candidateIsClear(candidate)) {
        return layoutFromCandidate(candidate, false);
      }
      const compactCandidate = candidateRectFromRight(layoutRight, layoutTop, compactWidth, safeHeight, viewportWidth);
      if (candidateIsClear(compactCandidate)) {
        return layoutFromCandidate(compactCandidate, true);
      }
      const anchoredGapLayout = findRightmostClearLayout(layoutTop, anchorRightLimit);
      if (anchoredGapLayout) return anchoredGapLayout;
    }

    const defaultRight = clampRight(FLOATING_DEFAULT_RIGHT);
    const defaultRect = candidateRectFromRight(defaultRight, top, safeWidth, safeHeight, viewportWidth);
    if (candidateIsClear(defaultRect)) {
      return { top, right: defaultRight, left: defaultRect.left, width: safeWidth, compact: false };
    }

    const clearGapLayout = findRightmostClearLayout(top);
    if (clearGapLayout) return clearGapLayout;

    const fallbackRight = Math.min(Math.max(PANEL_MARGIN, defaultRight), Math.max(PANEL_MARGIN, viewportWidth - PANEL_MARGIN - compactWidth));
    const fallbackRect = candidateRectFromRight(fallbackRight, top, compactWidth, safeHeight, viewportWidth);
    return { top, right: fallbackRight, left: fallbackRect.left, width: compactWidth, compact: true };
  }

  function isPrimaryTopObstacleNode(node) {
    return !!node?.matches?.(`button,[role='button'],input,select,textarea,a[href],#${CODEX_PLUS_MENU_ID}`);
  }

  function findAppHeaderElement() {
    return (
      document.querySelector(APP_HEADER_SELECTOR) ||
      document.querySelector(APP_HEADER_SURFACE_SELECTOR) ||
      document.querySelector("header")
    );
  }

  function isTopChromeObstacleNode(node, style) {
    if (!node) return false;
    if (node.id === CODEX_PLUS_MENU_ID || node.closest?.(`#${CODEX_PLUS_MENU_ID}`)) return true;
    if (node.matches?.(APP_HEADER_SURFACE_SELECTOR)) return false;
    if (!isPrimaryTopObstacleNode(node) && style?.pointerEvents === "none") return false;
    const header = findAppHeaderElement();
    if (header?.contains?.(node)) return true;
    return style?.position === "fixed" || style?.position === "sticky";
  }

  function collectTopObstacleEntries() {
    if (!document.body?.querySelectorAll) return [];
    const entries = Array.from(document.body.querySelectorAll(TOP_OBSTACLE_SELECTOR))
      .filter((node) => !root?.contains(node) && !panel?.contains(node))
      .map((node) => {
        const rect = normalizeRect(node.getBoundingClientRect?.());
        if (!rect || rect.width < 4 || rect.height < 4) return null;
        if (rect.top >= FLOATING_SCAN_TOP || rect.bottom <= 0) return null;
        if (rect.width > innerWidth * 0.85 || rect.height > FLOATING_SCAN_TOP) return null;
        const style = typeof getComputedStyle === "function" ? getComputedStyle(node) : null;
        if (style && (style.display === "none" || style.visibility === "hidden" || style.opacity === "0")) return null;
        if (!isTopChromeObstacleNode(node, style)) return null;
        return { node, rect };
      })
      .filter(Boolean);

    return entries.filter((entry, index) => {
      if (isPrimaryTopObstacleNode(entry.node)) return true;
      return !entries.some((other, otherIndex) => {
        if (otherIndex === index || !entry.node.contains?.(other.node)) return false;
        if (!rectsOverlap(entry.rect, other.rect)) return false;
        return other.rect.width <= entry.rect.width && other.rect.height <= entry.rect.height;
      });
    });
  }

  function collectTopObstacleRects() {
    return collectTopObstacleEntries().map((entry) => entry.rect);
  }

  function scheduleMountRoot() {
    if (destroyed || layoutRaf) return;
    const run = () => {
      layoutRaf = 0;
      mountRoot();
    };
    layoutRaf = typeof window.requestAnimationFrame === "function" ? window.requestAnimationFrame(run) : window.setTimeout(run, 16);
  }

  function observeLayoutNode(node) {
    if (!node || resizeObservedNodes.has(node)) return;
    if (root?.contains(node) || panel?.contains(node)) return;
    if (typeof ResizeObserver !== "function") return;
    if (!resizeObserver) {
      resizeObserver = new ResizeObserver(() => {
        scheduleMountRoot();
      });
    }
    try {
      resizeObserver.observe(node);
      resizeObservedNodes.add(node);
    } catch {
      // 个别节点不可观察时忽略，MutationObserver 仍会兜底。
    }
  }

  function updateLayoutResizeObservers(obstacleEntries = []) {
    observeLayoutNode(document.body);
    observeLayoutNode(findAppHeaderElement());
    observeLayoutNode(document.getElementById(CODEX_PLUS_MENU_ID));
    for (const entry of obstacleEntries) observeLayoutNode(entry.node);
  }

  function handleWindowResize() {
    scheduleMountRoot();
    positionPanel();
  }

  function numericCssValue(value) {
    const parsed = Number.parseFloat(value || "");
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function visibleTopRect(node) {
    const rect = normalizeRect(node?.getBoundingClientRect?.());
    if (!rect || rect.width < 4 || rect.height < 4) return null;
    if (rect.top >= FLOATING_SCAN_TOP || rect.bottom <= 0) return null;
    const style = typeof getComputedStyle === "function" ? getComputedStyle(node) : null;
    if (style && (style.display === "none" || style.visibility === "hidden" || style.opacity === "0")) return null;
    return rect;
  }

  function headerTitleRegion(header) {
    const candidates = Array.from(header?.querySelectorAll?.('[data-state], [class*="truncate"], [class*="text-base"]') || []);
    return (
      candidates.find((node) => {
        if (!node?.querySelector?.("[data-state], button")) return false;
        if (!node.textContent?.trim()) return false;
        return node.closest?.(".draggable") || node.closest?.('[class*="grid-cols-[minmax(0,1fr)]"]');
      }) || null
    );
  }

  function isHeaderToolbarButton(button, header, rect, titleRegion) {
    if (!button || button.closest?.(`#${CODEX_PLUS_MENU_ID}`)) return false;
    if (!(rect.width > 0 && rect.height > 0 && rect.left > innerWidth / 2)) return false;
    const buttonCluster = button.closest(HEADER_TOOLBAR_CLUSTER_SELECTOR);
    if (buttonCluster && header?.contains(buttonCluster)) return true;
    if (titleRegion?.contains?.(button)) return false;
    return !!button.closest?.(HEADER_TOOLBAR_CLASS_SELECTOR);
  }

  function findHeaderToolbarAnchor() {
    const header = findAppHeaderElement();
    if (!header) return null;
    const title = headerTitleRegion(header);
    const toolbarButtons = Array.from(header.querySelectorAll("button"))
      .map((button) => ({ button, rect: normalizeRect(button.getBoundingClientRect?.()) }))
      .filter(({ button, rect }) => rect && isHeaderToolbarButton(button, header, rect, title))
      .sort((left, right) => left.rect.left - right.rect.left);
    const anchor = toolbarButtons[0];
    if (!anchor) return null;
    const measuredGap = toolbarButtons[1] ? toolbarButtons[1].rect.left - toolbarButtons[0].rect.right : 0;
    const styles = anchor.button.parentElement ? getComputedStyle(anchor.button.parentElement) : null;
    const gap = Math.max(FLOATING_SAFE_GAP, numericCssValue(styles?.columnGap || styles?.gap), measuredGap, 0);
    return { rect: anchor.rect, gap };
  }

  function collectFloatingAnchors() {
    const anchors = [];
    const plusMenu = document.getElementById(CODEX_PLUS_MENU_ID);
    const plusMenuRect = visibleTopRect(plusMenu);
    if (plusMenuRect) anchors.push({ rect: plusMenuRect, gap: FLOATING_SAFE_GAP, mode: "hard" });
    const headerAnchor = findHeaderToolbarAnchor();
    if (headerAnchor) anchors.push({ ...headerAnchor, mode: "hard" });
    return anchors;
  }

  function findToolbar() {
    return null;

    const plusMenu = document.getElementById(CODEX_PLUS_MENU_ID);
    if (plusMenu?.parentElement && plusMenu.getBoundingClientRect().top >= 30) {
      return plusMenu.parentElement;
    }

    const candidates = Array.from(document.querySelectorAll("button")).filter((button) => {
      const rect = button.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0 && rect.top >= 30 && rect.top < 72 && rect.right > innerWidth - 360;
    });

    for (const button of candidates) {
      let current = button.parentElement;
      for (let depth = 0; current && depth < 4; depth += 1, current = current.parentElement) {
        const style = getComputedStyle(current);
        const rect = current.getBoundingClientRect();
        if (
          style.display === "flex" &&
          rect.height > 20 &&
          rect.height < 60 &&
          rect.right > innerWidth - WINDOW_BUTTON_SAFE_RIGHT &&
          current.children.length > 1
        ) {
          return current;
        }
      }
    }
    return null;
  }

  function mountRoot() {
    if (!root || destroyed || !document.body) return;
    const toolbar = findToolbar();

    if (toolbar) {
      root.classList.remove("codex-daily-floating");
      if (root.parentElement !== toolbar) toolbar.insertBefore(root, toolbar.firstChild);
      if (panel?.classList.contains("is-visible")) positionPanel();
      return;
    }

    root.classList.add("codex-daily-floating");
    if (root.parentElement !== document.body) {
      document.body.appendChild(root);
    }
    root.dataset.layout = "top-toolbar";
    const rect = root.getBoundingClientRect();
    const obstacleEntries = collectTopObstacleEntries();
    updateLayoutResizeObservers(obstacleEntries);
    const layout = resolveFloatingLayout(
      rect.width || FLOATING_MIN_WIDTH,
      rect.height || FLOATING_HEIGHT,
      innerWidth,
      innerHeight,
      obstacleEntries.map((entry) => entry.rect),
      collectFloatingAnchors()
    );
    root.style.top = `${Math.round(layout.top)}px`;
    root.style.right = `${Math.ceil(layout.right)}px`;
    root.style.left = "auto";
    root.style.bottom = "auto";
    root.style.transform = "none";
    root.dataset.layout = layout.compact ? "compact-icon" : "top-toolbar";
    if (panel?.classList.contains("is-visible")) positionPanel();
  }

  function sourceStatusText(snapshot) {
    if (sourceMode === "external") {
      return `${snapshot.turns} 个 turn · 复用 Codex Token Usage`;
    }
    if (sourceMode === "standalone") {
      return `${snapshot.turns} 个 turn · 本机累计 · 独立采集`;
    }
    return externalSourceAvailable() ? "等待 Codex Token Usage 数据" : "等待数据源，必要时自动采集";
  }

  function trendTooltipHtml(point) {
    return `
      <div class="codex-daily-trend-tooltip-date">${escapeHtml(formatDisplayDate(point.dateKey))}</div>
      <div class="codex-daily-trend-tooltip-row">
        <span>Token 总量</span>
        <strong>${formatExact(point.total)}</strong>
      </div>
      <div class="codex-daily-trend-tooltip-row">
        <span>请求次数</span>
        <strong>${formatExact(point.calls)}</strong>
      </div>
      <div class="codex-daily-trend-tooltip-row">
        <span>预估金额</span>
        <strong>${formatCost(point.cost)}</strong>
      </div>
    `;
  }

  function hideTrendTooltip() {
    const tooltip = panel?.querySelector(".codex-daily-trend-tooltip");
    if (tooltip) tooltip.hidden = true;
  }

  function showTrendTooltip(point, target) {
    if (!panel || !point || !target) return;
    const trendBox = panel.querySelector(".codex-daily-trend");
    const tooltip = panel.querySelector(".codex-daily-trend-tooltip");
    const svg = panel.querySelector(".codex-daily-trend-svg");
    if (!trendBox || !tooltip || !svg) return;

    tooltip.innerHTML = trendTooltipHtml(point);
    tooltip.hidden = false;

    const boxRect = trendBox.getBoundingClientRect();
    const svgRect = svg.getBoundingClientRect();
    const tooltipRect = tooltip.getBoundingClientRect();
    const x = svgRect.left - boxRect.left + (point.x / 300) * svgRect.width;
    const y = svgRect.top - boxRect.top + (point.y / 82) * svgRect.height;
    const minX = tooltipRect.width / 2 + 8;
    const maxX = Math.max(minX, boxRect.width - tooltipRect.width / 2 - 8);
    tooltip.style.left = `${Math.min(Math.max(x, minX), maxX)}px`;
    tooltip.style.top = `${Math.max(y, tooltipRect.height + 18)}px`;
  }

  function renderPanelTrend(trend) {
    if (!panel) return;
    const svg = panel.querySelector(".codex-daily-trend-svg");
    const labels = panel.querySelector(".codex-daily-trend-labels");
    const peak = panel.querySelector('[data-field="trendPeak"]');
    hideTrendTooltip();
    if (peak) peak.textContent = `峰值 ${formatCompact(trend?.maxTotal || 0)}`;

    const points = trendPoints(trend, 300, 82, 8);
    const line = trendPath(points, true);
    const baseline = 74;
    const area =
      points.length > 0
        ? `${line} L ${points[points.length - 1].x.toFixed(1)} ${baseline.toFixed(1)} L ${points[0].x.toFixed(1)} ${baseline.toFixed(1)} Z`
        : "";

    if (svg) {
      svg.innerHTML = `
        <defs>
          <linearGradient id="codex-daily-trend-line-gradient" x1="0" y1="0" x2="300" y2="0" gradientUnits="userSpaceOnUse">
            <stop offset="0" stop-color="#3BA7FF"/>
            <stop offset="1" stop-color="#8D6BFF"/>
          </linearGradient>
          <linearGradient id="codex-daily-trend-area-gradient" x1="0" y1="8" x2="0" y2="74" gradientUnits="userSpaceOnUse">
            <stop offset="0" stop-color="#3BA7FF" stop-opacity="0.22"/>
            <stop offset="1" stop-color="#8D6BFF" stop-opacity="0.02"/>
          </linearGradient>
        </defs>
        <path d="M 8 8 H 292 M 8 41 H 292 M 8 74 H 292" fill="none" stroke="currentColor" stroke-opacity="0.12" stroke-width="1"/>
        ${area ? `<path d="${area}" fill="url(#codex-daily-trend-area-gradient)"/>` : ""}
        ${line ? `<path d="${line}" fill="none" stroke="url(#codex-daily-trend-line-gradient)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>` : ""}
        ${points
          .map(
            (point, index) => `
              <circle class="codex-daily-trend-point" data-index="${index}" tabindex="0" aria-label="${escapeAttribute(`${point.dateKey}，Token 总量 ${formatExact(point.total)}，请求次数 ${formatExact(point.calls)}，预估金额 ${formatCost(point.cost)}`)}" cx="${point.x.toFixed(1)}" cy="${point.y.toFixed(1)}" r="${point.active ? "4.2" : "3.1"}" fill="var(--color-token-background, #fff)" stroke="url(#codex-daily-trend-line-gradient)" stroke-width="2"/>
            `
          )
          .join("")}
      `;
      svg.querySelectorAll(".codex-daily-trend-point").forEach((circle) => {
        const point = points[Number(circle.getAttribute("data-index"))];
        circle.addEventListener("pointerenter", () => showTrendTooltip(point, circle));
        circle.addEventListener("pointermove", () => showTrendTooltip(point, circle));
        circle.addEventListener("focus", () => showTrendTooltip(point, circle));
        circle.addEventListener("pointerleave", hideTrendTooltip);
        circle.addEventListener("blur", hideTrendTooltip);
      });
    }

    if (labels) {
      labels.replaceChildren(
        ...(trend?.items || []).map((item) => {
          const label = document.createElement("span");
          label.textContent = item.label;
          label.title = `${item.dateKey} · ${formatExact(item.total)} Token`;
          if (item.active) label.classList.add("is-active");
          return label;
        })
      );
    }
  }

  function render({ animate = false } = {}) {
    if (!root) return;
    const todayKey = getDateKey(Date.now());
    const todaySnapshot = aggregateDay(todayKey);
    const snapshot = aggregateDay(selectedDateKey);
    const totalChanged = lastRenderedTotal >= 0 && todaySnapshot.total !== lastRenderedTotal;
    lastRenderedTotal = todaySnapshot.total;

    const connected = sourceMode === "external" || sourceMode === "standalone";
    root.classList.toggle("is-connected", connected);
    panel?.classList.toggle("is-connected", connected);
    root.querySelector(".codex-daily-total").textContent = formatCompact(todaySnapshot.total);
    panel.querySelector(".codex-daily-title").textContent =
      selectedDateKey === todayKey ? "今日 Token 用量" : "Token 用量";
    panel.querySelector(".codex-daily-hero").textContent = formatExact(snapshot.total);
    panel.querySelector('[data-field="cost"]').textContent = formatCost(snapshot.cost);
    panel.querySelector('[data-field="input"]').textContent = formatExact(snapshot.input);
    panel.querySelector('[data-field="output"]').textContent = formatExact(snapshot.output);
    panel.querySelector('[data-field="cached"]').textContent = formatExact(snapshot.cached);
    panel.querySelector('[data-field="reasoning"]').textContent = formatExact(snapshot.reasoning);
    panel.querySelector('[data-field="calls"]').textContent = formatExact(snapshot.calls);
    panel.querySelector('[data-field="updatedAt"]').textContent = formatTime(snapshot.updatedAt);
    const dateInput = panel.querySelector(".codex-daily-date-input");
    dateInput.min = getMinimumDateKey();
    dateInput.max = todayKey;
    dateInput.value = selectedDateKey;
    panel.querySelector('[data-action="previous-day"]').disabled =
      selectedDateKey <= dateInput.min;
    panel.querySelector('[data-action="next-day"]').disabled =
      selectedDateKey >= todayKey;
    panel.querySelector(".codex-daily-status-text").textContent = sourceStatusText(snapshot);
    renderPanelTrend(buildTrendData(selectedDateKey));
    renderModelBreakdown(snapshot);
    renderToolCalls(snapshot);
    if (panel.querySelector(".codex-daily-price-panel")?.hidden === false) {
      renderPriceSettings(snapshot);
    }

    if (animate && totalChanged) {
      root.classList.remove("is-updated");
      void root.offsetWidth;
      root.classList.add("is-updated");
      window.setTimeout(() => root?.classList.remove("is-updated"), 450);
    }
  }

  function scheduleMidnightRefresh() {
    if (midnightTimer) window.clearTimeout(midnightTimer);
    const next = new Date();
    next.setHours(24, 0, 1, 0);
    midnightTimer = window.setTimeout(() => {
      const wasViewingToday = selectedDateKey === lastDateKey;
      lastDateKey = getDateKey(Date.now());
      if (wasViewingToday) selectedDateKey = lastDateKey;
      pruneState();
      saveState();
      render();
      scheduleMidnightRefresh();
    }, Math.max(1000, next.getTime() - Date.now()));
  }

  function refresh() {
    if (destroyed) return aggregateDay();

    const currentDateKey = getDateKey(Date.now());
    if (currentDateKey !== lastDateKey) {
      const wasViewingToday = selectedDateKey === lastDateKey;
      lastDateKey = currentDateKey;
      if (wasViewingToday) selectedDateKey = currentDateKey;
      pruneState();
      saveState();
    }

    const sourceChanged = syncFromSource();
    const domToolChanged = processDomToolCalls();
    const changed = sourceChanged || domToolChanged;
    mountRoot();
    render({ animate: changed });
    return aggregateDay();
  }

  function resetToday() {
    delete state.days[getDateKey(Date.now())];
    saveState();
    render();
    return aggregateDay();
  }

  function destroy(options = {}) {
    destroyed = true;
    if (pollTimer) window.clearInterval(pollTimer);
    if (midnightTimer) window.clearTimeout(midnightTimer);
    if (closeTimer) window.clearTimeout(closeTimer);
    if (shareFeedbackTimer) window.clearTimeout(shareFeedbackTimer);
    if (layoutRaf) {
      if (typeof window.cancelAnimationFrame === "function") window.cancelAnimationFrame(layoutRaf);
      else window.clearTimeout(layoutRaf);
      layoutRaf = 0;
    }
    observer?.disconnect();
    resizeObserver?.disconnect();
    restoreStandaloneCapture();
    document.removeEventListener("pointerdown", handleDocumentPointerDown, true);
    window.removeEventListener("resize", handleWindowResize);
    root?.remove();
    panel?.remove();
    style?.remove();
    if (options.clearData === true) {
      try {
        localStorage.removeItem(STORAGE_KEY);
        localStorage.removeItem(PRICE_STORAGE_KEY);
      } catch {
        // localStorage 不可访问时忽略。
      }
    }
    if (window[API_KEY] === api) delete window[API_KEY];
  }

  const api = {
    version: VERSION,
    refresh,
    getSnapshot: (dateKey = getDateKey(Date.now())) => aggregateDay(clampDateKey(dateKey)),
    getSelectedDate: () => selectedDateKey,
    selectDate,
    createShareBlob,
    copyShareImage,
    getModelPrices: () => JSON.parse(JSON.stringify(priceConfig.models)),
    getDefaultModelPrices: () => JSON.parse(JSON.stringify(DEFAULT_OPENAI_MODEL_PRICES)),
    setModelPrice,
    clearModelPrice,
    resetToday,
    destroy,
    __test: {
      normalizeUsage,
      normalizeModelName,
      extractDirectModel,
      extractModelFromAppMessage,
      observeAppModelMessage,
      normalizeToolName,
      extractToolCallEvents,
      processToolCallPayload,
      recordToolCall,
      extractDomToolCallEvents,
      processDomToolCalls,
      defaultModelPrice,
      getModelPriceInfo,
      calculateUsageCost,
      formatCost,
      getDateKey,
      parseDateKey,
      shiftDateKey,
      clampDateKey,
      getMinimumDateKey,
      pruneState,
      getTurnTimestamp,
      isUsageTurn,
      upsertTurn,
      aggregateDay,
      formatCompact,
      buildTrendData,
      trendPoints,
      trendPath,
      trendTooltipHtml,
      buildShareModel,
      resolveFloatingLayout,
      rectsOverlap,
      findUsageCandidates,
      processCapturePayload,
      processModelPayload,
      syncFromSource,
      installStandaloneCapture,
      externalSourceAvailable,
      getSourceMode: () => sourceMode,
      isCaptureInstalled: () => captureInstalled,
      getRawState() {
        return JSON.parse(JSON.stringify(state));
      },
      replaceState(nextState) {
        state = nextState;
      },
    },
  };

  window[API_KEY] = api;
  installModelCapture();

  function start() {
    if (destroyed) return;
    installStyle();
    createRoot();
    mountRoot();
    refresh();

    observer = new MutationObserver(() => {
      scheduleMountRoot();
      if (processDomToolCalls()) render({ animate: false });
    });
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["aria-hidden", "class", "data-state", "hidden", "style"],
    });
    document.addEventListener("pointerdown", handleDocumentPointerDown, true);
    window.addEventListener("resize", handleWindowResize);
    pollTimer = window.setInterval(refresh, POLL_INTERVAL_MS);
    scheduleMidnightRefresh();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
})();

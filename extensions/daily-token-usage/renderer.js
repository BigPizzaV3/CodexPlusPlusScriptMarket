// ==UserScript==
// @name         Codex Daily Token Usage
// @namespace    codex-plus-plus
// @version      2.1.56
// @description  使用 Codex++ 快照展示用量与工具执行。
// @match        app://-/*
// @run-at       document-start
// ==/UserScript==

codexPlus.extension((ctx) => {
  "use strict";

  const VERSION = "2.1.56";
  const BUILD_ID = "2.1.56-daily-stable-details";
  const API_KEY = "__codexDailyTokenUsage";
  const ROOT_ID = "codex-daily-token-usage";
  const PANEL_ID = "codex-daily-token-usage-panel";
  const STYLE_ID = "codex-daily-token-usage-style";
  const WINDOW_MENU = '[data-app-shell-application-menu-header] > div > [role="menubar"]';
  const PRICE_STORAGE_KEY = "__codexDailyTokenUsageModelPricesV1";
  const THEME_STORAGE_KEY = "__codexDailyTokenUsageTheme";
  const NUMBER_STORAGE_KEY = "__codexDailyTokenUsageNumberMode";
  const TREND_STORAGE_KEY = "__codexDailyTokenUsageTrendMetric";
  const PRICE_FIELDS = ["input", "cachedInput", "output"];
  const UNKNOWN_MODEL = "Unknown";
  const COMMITTED_SOURCE = "persistent-local-rollout";
  const POLL_MS = 5000;
  const VIEW_PRELOAD_MS = 30000;
  const CLOSED_RANGE_PRELOAD_MS = 120000;
  const TREND_WIDTH = 300;
  const TREND_LEFT = 4;
  const TREND_SPAN = TREND_WIDTH - 2 * TREND_LEFT;
  const REQUEST_TIMEOUT_MS = 10000;
  const SELECTION_DELAY_MS = 100;
  const BACKOFF_MS = [5000, 10000, 20000, 40000, 60000];
  const SNAPSHOT_LIMIT = 24;
  const SNAPSHOT_WEIGHT_LIMIT = 24000;
  const TREND_POINT_LIMIT = 120;
  const PRICE_MODEL_LIMIT = 1000;
  const DETAIL_CACHE_BUDGET = 4_000_000;
  const DETAIL_ENTRY_LIMIT = 128;
  const EXECUTION_METADATA_LIMIT = 256;
  const EXECUTION_METADATA_RETRY_MS = 30000;
  const DETAIL_PAGE_SIZE = 8192;
  const DETAIL_RETENTION_MS = 24 * 60 * 60 * 1000;
  const EXECUTION_PAGE_SIZE = 200;
  const EXECUTION_STATE_LIMIT = 24;
  const EXECUTION_ROW_HEIGHT = 44;
  const EXECUTION_DETAIL_HEIGHT = 174;
  const EXECUTION_DAY_ROW_HEIGHT = 28;
  const ACTIVITY_ROW_HEIGHT = 40;
  const TOOL_SEARCH_NAMES = Object.freeze({
    exec_command: "运行命令 执行命令 终端命令",
    view_image: "查看图片 查看图像 图片预览",
    apply_patch: "应用补丁 编辑文件 修改文件",
    write_stdin: "发送输入 写入标准输入",
    shell_command: "运行命令 执行命令 Shell命令",
    read_file: "读取文件",
    list_directory: "列出目录",
    search_query: "搜索网页 网络搜索",
    update_plan: "更新计划",
    request_user_input: "请求用户输入",
    spawn_agent: "创建子智能体 启动子智能体",
    send_message: "发送消息",
    wait_agent: "等待子智能体",
    close_agent: "关闭子智能体",
  });
  const MAX_IN_FLIGHT = 4;
  const THEME_MODES = ["auto", "light", "dark"];
  const NUMBER_FORMATTER = new Intl.NumberFormat();
  const DATETIME_FORMATTER = new Intl.DateTimeFormat([], {
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  });

  const DEFAULT_OPENAI_MODEL_PRICES = Object.freeze({
    "gpt-6-astra": { input: 10, cachedInput: 1, output: 50 },
    "gpt-6.1-sol": { input: 2, cachedInput: 0.1, output: 10 },
    "gpt-6.1-terra": { input: 1, cachedInput: 0.05, output: 5 },
    "gpt-6-luna": { input: 0.1, cachedInput: 0.01, output: 0.5 },
    "gpt-6-sol": { input: 2, cachedInput: 0.2, output: 10 },
    "gpt-5.6-sol": { input: 4, cachedInput: 0.4, output: 20 },
    "gpt-5.6-terra": { input: 2, cachedInput: 0.2, output: 12 },
    "gpt-5.6-luna": { input: 0.2, cachedInput: 0.02, output: 1.2 },
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
    "gpt-5-search-api": { input: 1.25, cachedInput: 0.125, output: 10 },
    "gpt-4o-search-preview": { input: 2.5, output: 10 },
    "gpt-4o-mini-search-preview": { input: 0.15, output: 0.6 },
  });
  // 沿用既有条目，按 2026-11-08 方案快照补缺；未知别名不猜测价格。
  const DEFAULT_MODEL_PRICES = Object.freeze({
    ...DEFAULT_OPENAI_MODEL_PRICES,
    "kimi-k3.1-pro": { input: 2, cachedInput: 0.2, output: 10 },
    "kimi-k3.1-pro-highspeed": { input: 4, cachedInput: 0.2, output: 20 },
    "kimi-k3": { input: 3, cachedInput: 0.3, output: 15 },
    "kimi-k2.7-code": { input: 0.95, cachedInput: 0.19, output: 4 },
    "kimi-k2.7-code-highspeed": { input: 1.9, cachedInput: 0.38, output: 8 },
    "kimi-k2.6": { input: 0.95, cachedInput: 0.16, output: 4 },
    "claude-fable-5-1": { input: 10, cachedInput: 0.25, output: 50 },
    "claude-mythos-5-1": { input: 10, cachedInput: 0.25, output: 50 },
    "claude-opus-5-5": { input: 4, cachedInput: 0.2, output: 20 },
    "claude-sonnet-5-5": { input: 2, cachedInput: 0.1, output: 10 },
    "claude-haiku-5-5": { input: 0.1, cachedInput: 0.01, output: 0.5 },
    "claude-opus-5": { input: 5, cachedInput: 0.5, output: 25 },
    "claude-opus-4-8": { input: 5, cachedInput: 0.5, output: 25 },
    "claude-opus-4-7": { input: 5, cachedInput: 0.5, output: 25 },
    "claude-opus-4-6": { input: 5, cachedInput: 0.5, output: 25 },
    "claude-sonnet-5": { input: 2, cachedInput: 0.2, output: 10 },
    "claude-sonnet-4-6": { input: 3, cachedInput: 0.3, output: 15 },
    "claude-sonnet-4-5": { input: 3, cachedInput: 0.3, output: 15 },
    "claude-haiku-4-5": { input: 1, cachedInput: 0.1, output: 5 },
    "deepseek-flash": { input: 0.3, cachedInput: 0.006, output: 1.2 },
    "deepseek-v4-pro": { input: 1.32, cachedInput: 0.044, output: 3.96 },
    "gemini-4-argon": { input: 2, cachedInput: 0.1, output: 10 },
    "gemini-3.5-flash-lite": { input: 0.3, cachedInput: 0.03, output: 2.5 },
    "gemini-3.1-flash-lite": { input: 0.25, cachedInput: 0.025, output: 1.5 },
    "gemini-3.1-pro-preview": { input: 2, cachedInput: 0.2, output: 12 },
    "gemini-2.5-pro": { input: 1.25, cachedInput: 0.125, output: 10 },
    "gemini-2.5-flash": { input: 0.3, cachedInput: 0.03, output: 2.5 },
    "minimax-m3.1-flash": { input: 0.15, cachedInput: 0.015, output: 0.6 },
    "minimax-m3": { input: 0.3, cachedInput: 0.06, output: 1.2 },
    "minimax-m2.7": { input: 0.3, cachedInput: 0.06, output: 1.2 },
    "minimax-m2.7-highspeed": { input: 0.6, cachedInput: 0.06, output: 2.4 },
    "minimax-m2.5": { input: 0.3, cachedInput: 0.03, output: 1.2 },
    "glm-5.3": { input: 1.4, cachedInput: 0.26, output: 4.4 },
    "glm-5.3-flash": { input: 0.15, cachedInput: 0.03, output: 0.5 },
    "glm-5.3-flashx": { input: 0.37, cachedInput: 0.075, output: 1.25 },
    "glm-5.2": { input: 1.4, cachedInput: 0.26, output: 4.4 },
    "glm-5.1": { input: 1.4, cachedInput: 0.26, output: 4.4 },
    "glm-5": { input: 1, cachedInput: 0.2, output: 3.2 },
    "glm-4.7": { input: 0.6, cachedInput: 0.11, output: 2.2 },
    "qwen3.7-plus": { input: 0.4, output: 1.6 },
    "qwen3.6-plus": { input: 0.5, output: 3 },
    "qwen3.8-max": { input: 2, cachedInput: 0.25, output: 6 },
    "qwen3.8-flash": { input: 0.15, cachedInput: 0.016, output: 0.47 },
    "qwen3-coder-flash": { input: 0.3, output: 1.5 },
    "grok-4.7": { input: 2, cachedInput: 0.5, output: 6 },
    "grok-build-0.1": { input: 1, cachedInput: 0.2, output: 2 },
    "grok-4.6": { input: 2, cachedInput: 0.5, output: 6 },
    "grok-4.5": { input: 2, cachedInput: 0.3, output: 6 },
    "grok-4.3": { input: 1.25, cachedInput: 0.2, output: 2.5 },
    "mistral-large-4": { input: 0.7, cachedInput: 0.07, output: 2.1 },
    "mistral-small-2603": { input: 0.15, cachedInput: 0.015, output: 0.6 },
    "ministral-14b-2512": { input: 0.2, cachedInput: 0.02, output: 0.2 },
    "ministral-8b-2512": { input: 0.15, cachedInput: 0.015, output: 0.15 },
    "ministral-3b-2512": { input: 0.1, cachedInput: 0.01, output: 0.1 },
    "codestral-2508": { input: 0.3, cachedInput: 0.03, output: 0.9 },
  });
  const MODEL_PRICE_ALIASES = Object.freeze({
    "deepseek-v4-flash": "deepseek-flash",
    "deepseek-v4-flash-vision-exp": "deepseek-flash",
  });
  const previous = window[API_KEY];
  if (previous && typeof previous.destroy === "function") {
    try {
      previous.destroy();
    } catch (error) {
      console.error("Daily: 无法卸载旧版本", error);
      return;
    }
  }

  let destroyed = false;
  let root = null;
  let panel = null;
  let style = null;
  let pollTimer = null;
  let archiveRefreshTimer = null;
  let archiveRefreshUntil = 0;
  let closeTimer = null;
  let scrollFrame = null;
  let dayScrollFrame = null;
  let activityScrollFrame = null;
  let detailExpiryTimer = null;
  let detailExpiryRecord = null;
  let searchTimer = null;
  let executionImage = null;
  let nativeImageRuntime = null;
  let nativeImageDialog = null;
  let shareTimer = null;
  let selectionTimer = null;
  let selectionDetailsTimer = null;
  let themeObserver = null;
  let themeMedia = null;
  let trendHover = null;
  let storageWarning = "";
  let selectedPeriod = "day";
  let selectedDate = dateKey(Date.now());
  let customRange = localDayBounds(Date.now());
  let weekAnchor = "end";
  let pickerMonth = "";
  let previewDate = "";
  let rangeDraft = null;
  let rangeEndpoint = "start";
  let rangeAnchor = "";
  let rangeEditEndpoint = "";
  let timeEndpoint = "";
  let sessionScope = "all";
  let currentSession = { id: "", hostKnown: false, remote: false };
  let opened = false;
  let pinned = false;
  let toolsOpen = false;
  let toolKind = "skill";
  let executionSearch = "";
  let executionExpanded = "";
  let executionDetailPageKey = "";
  let executionDetailPages = {};
  let executionScrollTop = 0;
  let executionState = null;
  let queuedExecutionPage = null;
  let executionHoverTimer = null;
  let executionHoverKey = "";
  let activityHover = null;
  const activityTimelines = new WeakMap();
  let executionMarkup = "";
  let executionMetadataTimer = null;
  let executionMetadataDue = 0;
  let executionMetadataWork = false;
  let sessionQuery = null;
  let sessionService = null;
  let themeMode = readSetting(THEME_STORAGE_KEY, "auto");
  let compactNumbers = readSetting(NUMBER_STORAGE_KEY, "compact") !== "exact";
  let trendMetric = readSetting(TREND_STORAGE_KEY, "tokens");
  let priceConfig = readPriceConfig();
  let providerPrices = null;
  let providerPricesAt = 0;
  let providerPricesWork = null;
  let providerRanking = new Map();
  let providerRankingAt = 0;
  let providerRankingWork = null;
  let priceRevision = 0;
  let snapshotWeight = 0;
  let priceModels = new Set([...new Set([
    ...Object.keys(priceConfig.models), ...Object.keys(priceConfig.sources),
  ])].slice(0, PRICE_MODEL_LIMIT));
  const snapshots = new Map();
  const historyWork = new Map();
  let recentSummary = null;
  let recentSummaryWork = null;
  let shownPrimary = null;
  let viewPreloadWork = false;
  const failures = new Map();
  const inFlight = new Map();
  const details = new Map();
  const executionStates = new Map();
  const executionSummaries = new Map();
  const executionMetadata = new Map();
  const sessionTitles = new Map();
  const sessionTitleWork = new Map();
  let detailChars = 0;

  if (!THEME_MODES.includes(themeMode)) themeMode = "auto";
  if (!["tokens", "cost"].includes(trendMetric)) trendMetric = "tokens";

  if (typeof window.codexPlus?.extension === "function") {
    sessionService = window.codexPlus.extension({
      id: "daily-session-titles",
      inject: { sessionQuery: { required: false } },
      apply(ctx) {
        sessionQuery = ctx.get("sessionQuery");
        return () => { sessionQuery = null; };
      },
    });
  }

  function readSetting(key, fallback) {
    try {
      return localStorage.getItem(key) || fallback;
    } catch (error) {
      storageWarning = `设置读取失败：${error.message}`;
      return fallback;
    }
  }

  function writeSetting(key, value) {
    try {
      localStorage.setItem(key, value);
      storageWarning = "";
      return true;
    } catch (error) {
      storageWarning = `设置保存失败：${error.message}`;
      renderStatus();
      return false;
    }
  }

  function readPriceConfig() {
    const raw = readSetting(PRICE_STORAGE_KEY, "");
    if (!raw) return { version: 1, currency: "USD", models: {}, sources: {} };
    try {
      const parsed = JSON.parse(raw);
      if (parsed?.version !== 1 || !parsed.models || typeof parsed.models !== "object") {
        throw new Error("价格设置格式无效");
      }
      const models = {};
      for (const [name, entry] of Object.entries(parsed.models)) {
        const normalized = modelName(name);
        const price = normalizePrice(entry);
        if (!models[normalized] || name === normalized) models[normalized] = price;
      }
      const sources = {};
      for (const [name, source] of Object.entries(parsed.sources || {})) {
        if (typeof source === "string" && (["auto", "default", "custom"].includes(source) ||
            source.startsWith("provider:") && source.length > 9 && source.length <= 209)) {
          sources[modelName(name)] = source;
        }
      }
      return { version: 1, currency: "USD", models, sources };
    } catch (error) {
      storageWarning = `价格设置读取失败：${error.message}`;
      return { version: 1, currency: "USD", models: {}, sources: {} };
    }
  }

  function dateKey(timestamp) {
    const date = new Date(timestamp);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  }

  function dateAt(key) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
    if (!match) return NaN;
    const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    return dateKey(date) === key ? date.getTime() : NaN;
  }

  function addDays(timestamp, days) {
    const date = new Date(timestamp);
    date.setDate(date.getDate() + days);
    return date.getTime();
  }

  function localDayBounds(timestamp) {
    const date = new Date(timestamp);
    date.setHours(0, 0, 0, 0);
    return { startAt: date.getTime(), endAt: addDays(date.getTime(), 1) };
  }

  function rangeFor(period = selectedPeriod, selected = selectedDate) {
    if (period === "custom") return { ...customRange };
    const day = localDayBounds(dateAt(selected));
    if (period === "week") return weekAnchor === "start"
      ? { startAt: day.startAt, endAt: addDays(day.endAt, 6) }
      : { startAt: addDays(day.startAt, -6), endAt: day.endAt };
    if (period === "month") {
      const date = new Date(day.startAt);
      return {
        startAt: new Date(date.getFullYear(), date.getMonth(), 1).getTime(),
        endAt: new Date(date.getFullYear(), date.getMonth() + 1, 1).getTime(),
      };
    }
    return day;
  }

  function scopeSession() {
    if (sessionScope !== "current") return { id: "", hostKnown: false, remote: false };
    const plus = window.codexPlus;
    const session = typeof plus?.currentSession === "function" ? plus.currentSession() : null;
    const id = String(session?.id || (typeof plus?.currentSessionId === "function"
      ? plus.currentSessionId() : "") || "").trim().replace(/^local:/i, "");
    const hostKnown = session?.hostKnown ?? !!session?.hostId;
    return { id, hostKnown: !!session?.id && hostKnown, remote: session?.remote === true };
  }

  function selection(period = selectedPeriod, selected = selectedDate, scope = sessionScope) {
    const range = rangeFor(period, selected);
    const session = scope === "current" ? currentSession : { id: "", hostKnown: false, remote: false };
    const sessionId = session.hostKnown && !session.remote ? session.id : "";
    return { ...range, scope, sessionId, remote: session.remote,
      calendarDays: period === "week" || period === "month",
      hostUnknown: !!session.id && !session.hostKnown, includeLegacy: scope === "all" && period !== "custom" };
  }

  function selectionKey(value) {
    return JSON.stringify([value.startAt, value.endAt, value.scope, value.sessionId,
      !!value.remote, !!value.hostUnknown, value.scope === "all" && value.includeLegacy !== false,
      !!value.calendarDays]);
  }

  function mainViewSelection(period) {
    // 周标签原有行为是回到截至今天的一周；预加载与实际点击保持一致。
    return selection(period, period === "week" && selectedPeriod !== "week" ? dateKey(Date.now()) : selectedDate);
  }

  async function preloadMainViews() {
    if (viewPreloadWork || destroyed || document.hidden) return;
    viewPreloadWork = true;
    const views = ["day", "week", "month"].map(period => ({ period, value: mainViewSelection(period) }));
    try {
      for (const { period, value } of views) {
        if (destroyed || document.hidden || selectionTimer !== null || selectionDetailsTimer !== null ||
            inFlight.size >= MAX_IN_FLIGHT - 1 ||
            selectionKey(value) !== selectionKey(mainViewSelection(period))) break;
        const cached = snapshots.get(selectionKey(value));
        const interval = !opened && period !== "day" ? CLOSED_RANGE_PRELOAD_MS : VIEW_PRELOAD_MS;
        if (cached && Date.now() - cached.updatedAt < interval) continue;
        await loadHistory(value, false, false);
      }
    } finally {
      viewPreloadWork = false;
    }
  }

  function queryFor(value, includeTrend = true) {
    return {
      from: dateKey(value.startAt),
      to: dateKey(value.endAt - 1),
      startAt: value.startAt,
      endAt: value.endAt,
      includeActivity: false,
      includeSessionCursors: false,
      includeFingerprints: false,
      includeSessionMetadata: false,
      ...(includeTrend && !value.calendarDays ? { includeTrend: true } : {}),
      ...(value.scope === "all" && value.includeLegacy !== false ? { includeLegacySummary: true } : {}),
      ...(value.sessionId ? { scopeSessionId: value.sessionId, scopeOnly: true } : {}),
    };
  }

  function preloadRecentSummary() {
    if (recentSummaryWork || document.hidden || sessionScope !== "all" ||
        inFlight.size >= MAX_IN_FLIGHT - 1) return;
    const today = localDayBounds(Date.now());
    const value = { startAt: addDays(today.startAt, -59), endAt: today.endAt, scope: "all", sessionId: "" };
    if (recentSummary?.value.endAt === value.endAt && Date.now() - recentSummary.updatedAt < VIEW_PRELOAD_MS) return;
    recentSummaryWork = request("/usage/history", queryFor(value, false), "history:recent-summary").then(response => {
      if (response?.rangeApplied === true && Array.isArray(response.days)) {
        if (recentSummary?.value.endAt === value.endAt &&
            recentSummary.response.classificationRevision?.[0] != null && waitingForEvidence(response)) return;
        recentSummary = { value, response, updatedAt: Date.now() };
        if (opened && !snapshots.has(selectionKey(selection()))) renderSnapshot();
      }
    }).finally(() => { recentSummaryWork = null; });
  }

  function waitingForEvidence(response) {
    return response.source === COMMITTED_SOURCE && response.scan?.processing === true &&
      response.classificationRevision?.[0] == null &&
      !response.historicalClassificationError && !response.scan?.classificationError;
  }

  function recentPrimary(value) {
    const today = localDayBounds(Date.now());
    if (!recentSummary || value.scope !== "all" ||
        value.startAt < recentSummary.value.startAt ||
        value.startAt >= recentSummary.value.endAt ||
        Math.min(value.endAt, today.endAt) > recentSummary.value.endAt ||
        value.startAt !== localDayBounds(value.startAt).startAt ||
        value.endAt !== localDayBounds(value.endAt).startAt) return null;
    const { response, updatedAt } = recentSummary;
    const selected = selectDays(response, value);
    if (!selected.available) return null;
    if (waitingForEvidence(response)) selected.waitingForProviderEvidence = true;
    const steps = aggregateSteps(selected, false);
    let result = steps.next();
    while (!result.done) result = steps.next();
    return { data: result.value.data, priceRevision, updatedAt,
      complete: !selected.uncertain, provisional: true, indexing: true, scanIssues: [],
      legacyCapturedAt: response.legacyCapturedAt, legacyStatus: response.legacyStatus };
  }

  function remember(map, key, value, max = SNAPSHOT_LIMIT) {
    map.delete(key);
    map.set(key, value);
    while (map.size > max) map.delete(map.keys().next().value);
  }

  function rememberSnapshot(key, snapshot) {
    const previous = snapshots.get(key);
    if (previous) snapshotWeight -= previous.weight;
    snapshots.delete(key);
    snapshots.set(key, snapshot);
    snapshotWeight += snapshot.weight;
    while (snapshots.size && (snapshots.size > SNAPSHOT_LIMIT || snapshotWeight > SNAPSHOT_WEIGHT_LIMIT)) {
      const oldest = snapshots.keys().next().value;
      snapshotWeight -= snapshots.get(oldest).weight;
      snapshots.delete(oldest);
    }
  }

  function request(route, query, key, force = false) {
    const existing = inFlight.get(key);
    if (existing) return existing.promise;
    const failure = failures.get(key);
    if (!force && failure && Date.now() < failure.retryAt) return Promise.resolve(null);
    if (inFlight.size >= MAX_IN_FLIGHT || typeof window.codexPlus?.call !== "function") {
      if (typeof window.codexPlus?.call !== "function") {
        remember(failures, key, { count: 1, retryAt: Date.now() + POLL_MS, message: "宿主接口不可用" }, 64);
      }
      return Promise.resolve(null);
    }
    const task = { cancelled: false, promise: null, cancel: null };
    let cancel;
    const cancelled = new Promise(resolve => { cancel = resolve; });
    task.cancel = () => {
      task.cancelled = true;
      if (inFlight.get(key) === task) inFlight.delete(key);
      cancel(null);
    };
    let timeout;
    const history = route === "/usage/history";
    const deadlines = history ? [] : [new Promise((_, reject) => {
      timeout = window.setTimeout(() => reject(new Error("读取超时")), REQUEST_TIMEOUT_MS);
    })];
    const transport = Promise.resolve().then(() => task.cancelled ? null :
      window.codexPlus.call(route, query, history ? undefined : { timeout: REQUEST_TIMEOUT_MS }));
    task.promise = Promise.race([transport, cancelled, ...deadlines]).then(response => {
      if (destroyed || task.cancelled || inFlight.get(key) !== task) return null;
      if (!response || ["unavailable", "not-ready", "error", "failed"].includes(response.status)) {
        throw new Error(response?.enabled === false ? "宿主用量索引未启用" :
          response?.scan?.storageError ? "宿主索引存储受限" : "宿主索引尚未就绪");
      }
      if (route === "/usage/history" &&
          response.source !== COMMITTED_SOURCE && response.source !== "structured-local-rollout") {
        if (response.scan?.processing) throw new Error("正在准备宿主用量快照");
        throw new Error("宿主返回了无法识别的用量数据");
      }
      failures.delete(key);
      return response;
    }).catch(error => {
      if (!destroyed && !task.cancelled && inFlight.get(key) === task) {
        const count = (failures.get(key)?.count || 0) + 1;
        remember(failures, key, {
          count,
          retryAt: Date.now() + BACKOFF_MS[Math.min(count - 1, BACKOFF_MS.length - 1)],
          message: error.message || "读取失败",
          unsupported: /未开放的路由|unknown bridge path/i.test(error.message || ""),
        }, 64);
      }
      return null;
    }).finally(() => {
      window.clearTimeout(timeout);
      if (inFlight.get(key) === task) inFlight.delete(key);
    });
    inFlight.set(key, task);
    return task.promise;
  }

  function usageValue(row) {
    const usage = row?.usage || row || {};
    const rawInput = usage.inputTokens ?? usage.input;
    const rawOutput = usage.outputTokens ?? usage.output;
    const rawCached = usage.cachedInputTokens ?? usage.cached;
    const numeric = value => typeof value === "number" ||
      typeof value === "string" && value.trim() ? Number(value) : NaN;
    const input = numeric(rawInput);
    const output = numeric(rawOutput);
    const cached = numeric(rawCached);
    const valid = value => Number.isFinite(value) && value >= 0;
    const validCached = valid(input) && valid(cached) && cached <= input;
    return {
      input: valid(input) ? input : 0,
      output: valid(output) ? output : 0,
      cached: validCached ? cached : 0,
      cachedKnown: usage.cachedKnown !== false && validCached,
      countsKnown: usage.countsKnown !== false && usage.inputKnown !== false && usage.outputKnown !== false &&
        valid(input) && valid(output),
      calls: Number.isFinite(Number(row?.recordCount ?? row?.calls))
        ? Math.max(0, Number(row.recordCount ?? row.calls)) : 0,
    };
  }

  function modelName(value) {
    const text = typeof value === "string" ? value.trim() : "";
    if (!text || /^(unknown|null|undefined|default)$/i.test(text) ||
        /(?:^|\/)group\//i.test(text) || /(?:^|\/)auto$/i.test(text)) return UNKNOWN_MODEL;
    const tail = text.split("/").filter(Boolean).at(-1) || "";
    return /^(?:gpt-|kimi-|o[134](?:-|$)|claude-|deepseek-|gemini-|minimax-|glm-)/i.test(tail)
      ? tail.toLowerCase() : tail || UNKNOWN_MODEL;
  }

  function modelPriceId(model) {
    let id = modelName(model).replace(/\s+\([^)]*\)\s*$/, "").toLowerCase().replace(/\s+/g, "-");
    if (id.startsWith("claude-")) id = id.replace(/\.(?=\d)/g, "-");
    const undated = id.replace(/-(?:\d{8}|\d{4}-\d{2}-\d{2})$/, "");
    return MODEL_PRICE_ALIASES[id] || (DEFAULT_MODEL_PRICES[id] ? id : undated);
  }

  function selectDays(response, value) {
    const nativeDays = value.sessionId ? response.scopedUsage?.days : response.days;
    if (!Array.isArray(nativeDays) || response.rangeApplied !== true) {
      throw new Error("宿主未返回该范围的用量快照");
    }
    const aliases = response.sessionAliases || {};
    const sessionId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value.sessionId)
      ? value.sessionId.toLowerCase() : value.sessionId;
    const returnedSessionId = response.scopedUsage?.sessionId;
    if (value.sessionId && (typeof returnedSessionId !== "string" || !returnedSessionId ||
        returnedSessionId !== value.sessionId && returnedSessionId !== sessionId &&
        returnedSessionId !== aliases[value.sessionId] && returnedSessionId !== aliases[sessionId])) {
      throw new Error("宿主返回了不同的会话范围");
    }
    const native = new Map(nativeDays.map(day => [day.date, day]));
    const legacy = value.scope === "all" && value.includeLegacy !== false ? response.legacyDays || {} : {};
    const rangeCoverage = value.sessionId ? response.scopedUsage?.coverage : response.coverage;
    const coverage = rangeCoverage?.days || {};
    const dayAligned = value.startAt === localDayBounds(value.startAt).startAt &&
      value.endAt === localDayBounds(value.endAt).startAt;
    const wholeDaysOnly = !dayAligned && rangeCoverage?.precision === "day" &&
      rangeCoverage.reason === "retention-day-only";
    const coverageDays = {};
    const retainCoverage = value.endAt - value.startAt <= 33 * 86400000;
    const keys = [...new Set([...native.keys(), ...Object.keys(legacy), ...Object.keys(coverage)])].sort();
    const rows = [];
    let uncertain = false;
    let legacyUsed = false;
    let coveredDays = 0;
    const capturedAt = typeof response.legacyCapturedAt === "number" ? response.legacyCapturedAt :
      Date.parse(response.legacyCapturedAt);
    const legacyEnd = Number.isFinite(capturedAt) ? localDayBounds(capturedAt).startAt : 0;
    const today = localDayBounds(Date.now()).startAt;
    for (const key of keys) {
      const start = dateAt(key);
      if (!Number.isFinite(start) || start >= value.endAt || addDays(start, 1) <= value.startAt) continue;
      const whole = value.startAt <= start && value.endAt >= addDays(start, 1);
      if (wholeDaysOnly && !whole) continue;
      const complete = coverage[key] === "complete";
      if (retainCoverage && complete) coverageDays[key] = "complete";
      if (whole && !complete && legacy[key] && start < legacyEnd && start < today) {
        rows.push({ ...legacy[key], date: key, legacy: true });
        legacyUsed = true;
        uncertain = true;
      } else if (native.has(key)) {
        rows.push(native.get(key));
        uncertain ||= !complete;
        if (complete) coveredDays++;
      } else if (complete) {
        coveredDays++;
      } else {
        uncertain = true;
      }
    }
    const first = new Date(value.startAt);
    const last = new Date(value.endAt - 1);
    const firstUTC = Date.UTC(first.getFullYear(), first.getMonth(), first.getDate());
    const lastUTC = Date.UTC(last.getFullYear(), last.getMonth(), last.getDate());
    const expectedDays = Math.round((lastUTC - firstUTC) / 86400000) + 1;
    uncertain ||= coveredDays !== expectedDays;
    if (response.source === "structured-local-rollout" && !response.coverage?.days) {
      const retentionDays = response.scan?.retentionDays;
      const retentionStart = Number.isInteger(retentionDays) && retentionDays > 0 ?
        addDays(localDayBounds(Date.now()).startAt, 1 - retentionDays) : Infinity;
      uncertain = response.complete !== true || response.scan?.ready !== true ||
        response.scan?.processing === true || response.scan?.pendingFiles !== 0 ||
        value.startAt < retentionStart;
    }
    const scopePrecision = value.sessionId ? response.scopedUsage?.coverage?.precision : null;
    const selectedPrecision = scopePrecision ?? response.coverage?.precision;
    const precision = selectedPrecision === "day" ? "day" :
      selectedPrecision === "exact" || selectedPrecision == null &&
        response.source === "structured-local-rollout" && response.rangeApplied === true ? "exact" : "unknown";
    uncertain ||= wholeDaysOnly;
    const available = (precision === "exact" || dayAligned || wholeDaysOnly) && (rows.length > 0 || !uncertain);
    const trend = value.sessionId ? response.scopedUsage?.trend : response.trend;
    return { rows, uncertain, legacyUsed, available, precision, coverageDays, wholeDaysOnly,
      indexed: response.source === COMMITTED_SOURCE, providerNames: response.providerNames || {},
      trend: !wholeDaysOnly && trend?.buckets?.length ? trend : null };
  }

  function normalizePrice(entry) {
    const result = {};
    for (const field of PRICE_FIELDS) {
      const value = entry?.[field];
      const number = value === "" || value == null ? null : Number(value);
      result[field] = number !== null && Number.isFinite(number) && number >= 0 ? number : null;
    }
    return result;
  }

  function hasPrice(price) {
    return price && PRICE_FIELDS.some(field => price[field] != null);
  }

  function providerQuote(provider, model) {
    if (!provider) return null;
    const priceKey = name => name.trim().replace(/^(.+?)\[\s*\+?0*[1-9]\d*\s*[km]?\s*\]$/i, "$1")
      .trim().replace(/[A-Z]/g, letter => letter.toLowerCase());
    const key = priceKey(model);
    let matching;
    for (const name of Object.keys(provider.modelPrices || {})) {
      if ((matching === undefined || name < matching) && priceKey(name) === key) matching = name;
    }
    const raw = matching === undefined ? provider.price : provider.modelPrices[matching];
    const result = normalizePrice(raw);
    for (const field of PRICE_FIELDS) if (result[field] === 0) result[field] = null;
    return hasPrice(result) ? { currency: String(raw?.currency || "").trim().toUpperCase(), price: result } : null;
  }

  function priceInfo(model) {
    const key = modelName(model);
    const preset = normalizePrice(DEFAULT_MODEL_PRICES[modelPriceId(key)]);
    const custom = normalizePrice(priceConfig.models[key]);
    const selection = priceConfig.sources[key] || (hasPrice(custom) ? "custom" : "auto");
    if (selection === "custom") {
      const merged = Object.fromEntries(PRICE_FIELDS.map(field => [field, custom[field] ?? preset[field]]));
      return { selection, source: "自定义", price: hasPrice(merged) ? merged : null };
    }
    if (selection === "default" || selection === "auto" && hasPrice(preset)) {
      return { selection, source: "预置", price: hasPrice(preset) ? preset : null };
    }
    const id = selection.startsWith("provider:") ? selection.slice(9) : providerRanking.get(key);
    const provider = providerPrices?.find(item => item.id === id);
    const quote = providerQuote(provider, key);
    const name = provider?.name || provider?.id || "未定价";
    const incompatible = quote && quote.currency !== "USD";
    return { selection, source: incompatible ? `${name}（${quote.currency || "币种未标明"}，不兼容 USD）` : name,
      price: quote?.currency === "USD" ? quote.price : null };
  }

  function calculateCost(usage, price) {
    if (!price || !usage.countsKnown || !usage.cachedKnown || usage.cached > usage.input) return null;
    const plain = usage.input - usage.cached;
    if (plain && price.input == null || usage.cached && price.cachedInput == null ||
        usage.output && price.output == null) return null;
    return (plain * (price.input || 0) + usage.cached * (price.cachedInput || 0) +
      usage.output * (price.output || 0)) / 1_000_000;
  }

  function* aggregateSteps(selected, retainRows) {
    const { rows, trend, ...coverage } = selected;
    const result = {
      input: 0, output: 0, cached: 0, cachedKnown: true, countsKnown: true, calls: 0,
      models: [], days: [], cost: 0, unpriced: false, pricedAny: false, ...coverage,
      costs: { input: 0, output: 0, cached: 0 },
      subagents: { input: 0, output: 0, cached: 0, calls: 0, cachedKnown: true,
        countsKnown: true, cost: 0, unpriced: false, costs: { input: 0, output: 0, cached: 0 } },
    };
    const models = new Map();
    const prices = new Map();
    const providerIdsByName = new Map();
    for (const [id, name] of Object.entries(selected.providerNames || {})) {
      if (typeof name !== "string" || !name) continue;
      providerIdsByName.set(name, providerIdsByName.has(name) ? null : id);
    }
    const compactRows = [];
    let processed = 0;
    let weight = 0;
    let dayIndex = 0;
    for (const day of rows) {
      const usage = usageValue(day);
      let compactDay = retainRows ? { date: day.date, startAt: day.startAt, endAt: day.endAt,
        ...usage, breakdowns: [] } : null;
      result.input += usage.input;
      result.output += usage.output;
      result.cached += usage.cached;
      result.calls += usage.calls;
      result.cachedKnown &&= usage.cachedKnown;
      result.countsKnown &&= usage.countsKnown;
      let dayCost = 0;
      let dayUnpriced = false;
      let dayPricedAny = false;
      const breakdownUsage = { input: 0, output: 0, cached: 0, cachedKnown: true, countsKnown: true };
      const breakdowns = Array.isArray(day.breakdowns) && day.breakdowns.length ? day.breakdowns :
        (day.models || []).map(row => ({ ...row, provider: "", role: "unknown" }));
      for (const row of breakdowns) {
        const name = modelName(row.model);
        const part = usageValue(row);
        breakdownUsage.input += part.input;
        breakdownUsage.output += part.output;
        breakdownUsage.cached += part.cached;
        breakdownUsage.cachedKnown &&= part.cachedKnown;
        breakdownUsage.countsKnown &&= part.countsKnown;
        let model = models.get(name);
        if (!model) {
          model = { model: name, input: 0, output: 0, cached: 0, cachedKnown: true,
            countsKnown: true, calls: 0, cost: 0, unpriced: false, pricedAny: false, providers: new Map() };
          models.set(name, model);
        }
        for (const field of ["input", "output", "cached", "calls"]) model[field] += part[field];
        model.cachedKnown &&= part.cachedKnown;
        model.countsKnown &&= part.countsKnown;
        if (!prices.has(name)) prices.set(name, priceInfo(name).price);
        const price = prices.get(name);
        let pricedUsage = part;
        if (!part.cachedKnown && part.countsKnown && row.priceableUsage != null) {
          const known = usageValue(row.priceableUsage);
          if (known.countsKnown && known.cachedKnown && known.input <= part.input &&
              known.cached <= part.cached && known.output <= part.output) {
            pricedUsage = known;
          }
        }
        const cost = calculateCost(pricedUsage, price);
        const priced = cost !== null && pricedUsage.input + pricedUsage.output > 0;
        const unpriced = cost === null || !part.cachedKnown;
        model.unpriced ||= unpriced;
        model.pricedAny ||= priced;
        dayUnpriced ||= unpriced;
        if (cost !== null) {
          model.cost += cost;
          dayCost += cost;
          dayPricedAny ||= priced;
        }
        const providerId = String(row.provider || row.providerId || "");
        const providerUnconfirmed = row.providerUnconfirmed ??
          (/^(custom|codex_plus_managed|codex-plus-gateway|unknown|null|undefined)$/i.test(providerId.trim()) &&
            !row.classificationEvidence && !row.supplierClassificationEvidence && !(row.providerInferred && row.providerName));
        const provider = providerUnconfirmed ?
          (selected.waitingForProviderEvidence ? "供应商归属更新中" : "供应商未确认") :
          String(row.providerName || selected.providerNames?.[providerId] || providerId || "未记录供应商");
        const role = ["main", "subagent"].includes(row.role) ? row.role : "unknown";
        const inferred = row.inferred === true || row.modelInferred === true || row.providerInferred === true;
        if (role === "subagent") {
          for (const field of ["input", "output", "cached", "calls"]) result.subagents[field] += part[field];
          result.subagents.cachedKnown &&= part.cachedKnown;
          result.subagents.countsKnown &&= part.countsKnown;
          result.subagents.unpriced ||= unpriced;
          result.subagents.cost += cost || 0;
        }
        if (cost !== null) {
          const cachedCost = pricedUsage.cached * (price.cachedInput || 0) / 1_000_000;
          const outputCost = pricedUsage.output * (price.output || 0) / 1_000_000;
          const costs = { input: cost - outputCost, output: outputCost, cached: cachedCost };
          for (const field of ["input", "output", "cached"]) {
            result.costs[field] += costs[field];
            if (role === "subagent") result.subagents.costs[field] += costs[field];
          }
        }
        const providerKey = selected.providerNames?.[providerId] ? providerId :
          providerIdsByName.get(providerId || provider) || providerId || provider;
        const key = providerUnconfirmed ? JSON.stringify([role]) : JSON.stringify([providerKey, role]);
        let old = model.providers.get(key);
        old ||= { provider, role, total: 0, calls: 0, cost: 0, unpriced: false, pricedAny: false, inferred: false };
        if (providerId && row.providerName) old.provider = provider;
        old.total += part.input + part.output;
        old.calls += part.calls;
        old.cost += cost || 0;
        old.unpriced ||= unpriced;
        old.pricedAny ||= priced;
        old.inferred ||= inferred;
        model.providers.set(key, old);
        if (compactDay) compactDay.breakdowns.push({
          model: name, provider: providerId, providerName: provider, role,
          inferred, providerUnconfirmed, ...part,
          ...(pricedUsage !== part ? { priceableUsage: pricedUsage } : {}),
        });
        weight++;
        if (retainRows && weight > SNAPSHOT_WEIGHT_LIMIT) {
          retainRows = false;
          compactRows.length = 0;
          compactDay = null;
        }
        if (++processed % 64 === 0) yield;
      }
      if (!usage.countsKnown || !usage.cachedKnown || !breakdownUsage.countsKnown ||
          breakdownUsage.input !== usage.input || breakdownUsage.output !== usage.output ||
          usage.cachedKnown && (!breakdownUsage.cachedKnown || breakdownUsage.cached !== usage.cached)) {
        dayUnpriced = true;
      }
      result.cost += dayCost;
      result.unpriced ||= dayUnpriced;
      result.pricedAny ||= dayPricedAny;
      const bucket = Math.floor(dayIndex++ * Math.min(rows.length, TREND_POINT_LIMIT) / rows.length);
      const point = result.days[bucket];
      if (point) {
        point.total += usage.input + usage.output;
        point.cost += dayCost;
        point.unpriced ||= dayUnpriced;
        point.pricedAny ||= dayPricedAny;
        point.countsKnown &&= usage.countsKnown;
        point.endDate = day.date;
        point.endAt = day.endAt;
      } else {
        result.days.push({ date: day.date, endDate: day.date, total: usage.input + usage.output,
          startAt: day.startAt, endAt: day.endAt, countsKnown: usage.countsKnown,
          cost: dayCost, unpriced: dayUnpriced, pricedAny: dayPricedAny });
      }
      if (compactDay) compactRows.push(compactDay);
      weight++;
      if (retainRows && weight > SNAPSHOT_WEIGHT_LIMIT) {
        retainRows = false;
        compactRows.length = 0;
      }
      if (++processed % 64 === 0) yield;
    }
    result.models = [...models.values()].sort((a, b) =>
      (b.input + b.output) - (a.input + a.output) || a.model.localeCompare(b.model));
    let retainedTrend = null;
    let trendWeight = 0;
    let trendSourceWeight = 0;
    if (trend) {
      const parsed = yield* aggregateSteps({ rows: trend.buckets }, retainRows);
      result.trend = { startAt: trend.startAt, endAt: trend.endAt, intervalMs: trend.intervalMs,
        precision: trend.precision, points: parsed.data.days };
      if (parsed.rows) retainedTrend = { ...result.trend, points: undefined, buckets: parsed.rows };
      trendWeight = result.trend.points.length;
      trendSourceWeight = parsed.weight - parsed.dataWeight;
      if (!parsed.rows) retainRows = false;
    }
    const resultWeight = trendWeight + result.days.length + result.models.reduce((sum, model) =>
      sum + 1 + model.providers.size, 0);
    if (weight + trendSourceWeight + resultWeight > SNAPSHOT_WEIGHT_LIMIT) retainRows = false;
    return { data: result, rows: retainRows ? compactRows : null,
      trend: retainRows ? retainedTrend : null,
      dataWeight: resultWeight,
      weight: resultWeight + (retainRows ? weight + trendSourceWeight : 0) };
  }

  function aggregate(response, value) {
    const steps = aggregateSteps(selectDays(response, value), false);
    let step = steps.next();
    while (!step.done) step = steps.next();
    return step.value.data;
  }

  async function runSteps(steps, cancelled = () => false) {
    if (destroyed || cancelled()) return null;
    let step = steps.next();
    while (!step.done) {
      const start = performance.now();
      let count = 0;
      do {
        step = steps.next();
        count++;
      } while (!step.done && count < 64 && performance.now() - start < 6);
      if (!step.done) await new Promise(resolve => window.setTimeout(resolve, 0));
      if (destroyed || cancelled()) return null;
    }
    return step.value;
  }

  function updateSnapshotPrice(key, snapshot) {
    if (snapshot.priceRevision === priceRevision || snapshot.priceWork) return;
    snapshot.priceWork = (async () => {
      if (!snapshot.source) {
        await new Promise(resolve => window.setTimeout(resolve, 0));
        if (!destroyed && snapshots.get(key) === snapshot) await loadHistory(snapshot.value);
        return;
      }
      while (!destroyed && snapshots.get(key) === snapshot && snapshot.priceRevision !== priceRevision) {
        const revision = priceRevision;
        const next = await runSteps(aggregateSteps(snapshot.source, false));
        if (!next || destroyed || snapshots.get(key) !== snapshot) return;
        if (revision !== priceRevision) continue;
        if (!next.data.trend && snapshot.data.trend) {
          next.data.trend = { ...snapshot.data.trend, priceStale: true };
        }
        snapshot.data = next.data;
        snapshot.priceRevision = revision;
      }
      if (opened && selectionKey(selection()) === key) renderSnapshot();
      if (key === selectionKey({ ...localDayBounds(Date.now()), scope: "all", sessionId: "" })) renderTrigger();
      if (snapshot.data.trend?.priceStale && opened && selectionKey(selection()) === key) {
        void loadHistory(snapshot.value);
      }
    })().finally(() => { snapshot.priceWork = null; });
  }

  function invalidatePrices() {
    priceRevision++;
    for (const [key, snapshot] of snapshots) {
      if (key === selectionKey(selection()) ||
          key === selectionKey({ ...localDayBounds(Date.now()), scope: "all", sessionId: "" })) {
        updateSnapshotPrice(key, snapshot);
      }
    }
  }

  function stopArchiveRefresh() {
    window.clearTimeout(archiveRefreshTimer);
    archiveRefreshTimer = null;
    archiveRefreshUntil = 0;
  }

  function loadHistory(value, force = false, includeTrend = opened && selectionKey(selection()) === selectionKey(value)) {
    if (value.scope === "current" && !value.sessionId) return Promise.resolve(null);
    includeTrend = includeTrend && !value.calendarDays;
    const key = selectionKey(value);
    const existing = historyWork.get(key);
    if (existing) {
      if (includeTrend && !existing.includesTrend) {
        return existing.then(snapshot => snapshot && !destroyed && !document.hidden
          ? loadHistory(value, force, true) : null);
      }
      return existing;
    }
    const requestKey = `history:${key}`;
    let cancelled = false;
    const work = (async () => {
      const response = await request("/usage/history", queryFor(value, includeTrend), requestKey, force);
      if (!response || destroyed || cancelled) {
        if (opened && selectionKey(selection()) === key) renderStatus();
        return null;
      }
      try {
        if (opened && !document.hidden && selectionKey(selection()) === key) {
          if (response.archiveRecovery?.status === "pending") {
            archiveRefreshUntil ||= Date.now() + 20000;
            if (archiveRefreshTimer === null && Date.now() < archiveRefreshUntil) {
              archiveRefreshTimer = window.setTimeout(() => {
                archiveRefreshTimer = null;
                if (opened && !document.hidden && selectionKey(selection()) === key) void loadHistory(value);
              }, 1000);
            }
          } else {
            stopArchiveRefresh();
          }
        }
        const revision = response.revision ?? response.updatedAt;
        const scoped = value.sessionId ? response.scopedUsage : null;
        const countStatus = scoped?.countStatus ?? response.countStatus;
        const classificationStatus = scoped?.classificationStatus ?? response.classificationStatus;
        const complete = scoped?.complete ?? scoped?.countStatus?.complete ?? response.complete;
        const historicalEvidenceReady = response.classificationRevision?.[0] != null;
        const waitingForProviderEvidence = waitingForEvidence(response);
        const scanIssues = [
          response.scan?.storageError ? "索引存储受限" :
            response.scan?.storageNearLimit && "索引容量接近上限",
          response.scan?.failedSources > 0 && "部分来源处理受阻",
          response.scan?.classificationError && "分类补证失败",
          response.historicalClassificationError && "历史分类读取失败",
          waitingForProviderEvidence && "供应商归属更新中",
          response.archiveRecovery?.status === "pending" && "正在从原会话补算历史",
          response.archiveRecovery?.status === "partial" && "部分原会话无法完整回读",
          response.archiveRecovery?.status === "unavailable" && "历史回读暂不可用",
        ].filter(Boolean);
        const selected = selectDays(response, value);
        selected.waitingForProviderEvidence = waitingForProviderEvidence;
        if (!selected.available) {
          const pending = response.scan?.discoveryFinished === false || response.scan?.processing === true ||
            response.scan?.pendingFiles > 0;
          throw new Error(response.archiveRecovery?.status === "pending" ? "正在从原会话计算所选时段" :
            selected.precision === "day" ? "该时段仅支持按日统计" :
            response.scan?.storageError ? "索引存储受限，暂未读到当前范围" :
              scoped && response.scan?.ready === true && !scoped.days.length ? "当前会话在所选时段暂无已索引记录" :
              pending ? "正在建立当前范围的索引，完成后自动显示" :
                "当前范围暂无已索引记录，请稍后重试");
        }
        const statusKey = JSON.stringify([response.source, complete, countStatus, classificationStatus, response.classificationRevision,
          response.coverage, scoped?.coverage, response.legacyCapturedAt, response.legacyStatus,
          response.providerNames, response.scan?.discoveryFinished, response.archiveRecovery,
          scanIssues, !!selected.trend]);
        const previous = snapshots.get(key);
        if (waitingForProviderEvidence && previous?.historicalEvidenceReady) {
          // 计量和归属仍按同一份已发布快照显示，不把补证过程当成归属撤回。
          previous.scanIssues = [...scanIssues, "显示上次归属"];
          if (opened && selectionKey(selection()) === key) renderStatus();
          return previous;
        }
        if (selected.precision === "day" && response.archiveRecovery?.status === "pending" &&
            (previous?.data.trend?.precision === "exact" || previous?.data.trend?.precision === "partial")) {
          // 回读缓存失效时，保留上次成套的分时数据和统计，直到新结果就绪。
          previous.statusKey = statusKey;
          previous.scanIssues = [...scanIssues, "显示上次分时结果"];
          if (opened && selectionKey(selection()) === key) renderStatus();
          return previous;
        }
        if (revision != null && previous?.revision === revision && previous.statusKey === statusKey &&
            (previous.source || previous.priceRevision === priceRevision) &&
            !(selected.trend && previous.data.trend?.priceStale)) {
          previous.updatedAt = Date.now();
          previous.scanIssues = scanIssues;
          if (includeTrend) previous.trendReadAt = previous.updatedAt;
          rememberSnapshot(key, previous);
          updateSnapshotPrice(key, previous);
          if (opened && selectionKey(selection()) === key) {
            if (previous.priceRevision === priceRevision) renderStatus();
            else renderSnapshot();
            refreshProviderPricing(previous);
          }
          return previous;
        }
        const initialPriceRevision = priceRevision;
        const parsed = await runSteps(aggregateSteps(selected, true), () => cancelled);
        if (!parsed || destroyed || cancelled) return null;
        if (!selected.wholeDaysOnly && !selected.trend && previous?.data.trend && previous.priceRevision === initialPriceRevision) {
          const previousTrend = previous.data.trend;
          const previousSource = previous.source?.trend;
          const sourceWeight = parsed.rows && previousSource
            ? previousSource.buckets.reduce((sum, bucket) => sum + 1 + bucket.breakdowns.length, 0) : 0;
          const addedWeight = previousTrend.points.length + sourceWeight;
          if (parsed.weight + addedWeight <= SNAPSHOT_WEIGHT_LIMIT) {
            parsed.data.trend = previousTrend;
            if (parsed.rows && previousSource) parsed.trend = previousSource;
            parsed.weight += addedWeight;
          }
        }
        const snapshot = {
          data: parsed.data, source: parsed.rows ? { ...selected, rows: parsed.rows, trend: parsed.trend } : null, value,
          updatedAt: Date.now(), trendReadAt: includeTrend ? Date.now() : previous?.trendReadAt || 0,
          revision, statusKey, weight: parsed.weight,
          priceRevision: initialPriceRevision, priceWork: null,
          complete, countStatus, classificationStatus, historicalEvidenceReady, legacyCapturedAt: response.legacyCapturedAt,
          legacyStatus: response.legacyStatus, scanIssues, indexing: response.scan?.discoveryFinished === false ||
            response.scan?.processing === true || response.scan?.pendingFiles > 0,
        };
        rememberSnapshot(key, snapshot);
        updateSnapshotPrice(key, snapshot);
        if (value.scope === "all" && value.startAt === localDayBounds(Date.now()).startAt) renderTrigger();
        if (opened && selectionKey(selection()) === key) {
          renderSnapshot();
          refreshProviderPricing(snapshot);
        }
        return snapshot;
      } catch (error) {
        const retryDelay = response.archiveRecovery?.status === "pending" ? 0 : POLL_MS;
        remember(failures, requestKey, { count: 1, retryAt: Date.now() + retryDelay, message: error.message }, 64);
        if (opened && selectionKey(selection()) === key) renderStatus();
        return null;
      }
    })();
    work.cancel = () => {
      cancelled = true;
      inFlight.get(requestKey)?.cancel();
    };
    work.includesTrend = includeTrend;
    historyWork.set(key, work);
    work.then(
      () => { if (historyWork.get(key) === work) historyWork.delete(key); },
      () => { if (historyWork.get(key) === work) historyWork.delete(key); },
    );
    return work;
  }

  function cancelSupersededRequests(value) {
    const today = { ...localDayBounds(Date.now()), scope: "all", sessionId: "" };
    const keep = new Set([selectionKey(value), selectionKey(today),
      ...["day", "week", "month"].map(period => selectionKey(mainViewSelection(period)))]);
    for (const [key, work] of historyWork) {
      if (keep.has(key)) continue;
      work.cancel();
      historyWork.delete(key);
    }
    cancelExecutionRequests();
  }

  function cancelExecutionRequests() {
    for (const [key, task] of inFlight) {
      if (key.startsWith("execution:") || key.startsWith("detail:")) task.cancel();
    }
  }

  function scheduleSelectionLoad(value) {
    stopArchiveRefresh();
    window.clearTimeout(selectionTimer);
    window.clearTimeout(selectionDetailsTimer);
    selectionDetailsTimer = null;
    const key = selectionKey(value);
    const timer = window.setTimeout(async () => {
      if (destroyed || document.hidden || selectionKey(selection()) !== key) {
        selectionTimer = null;
        return;
      }
      if (!opened) {
        selectionTimer = null;
        void preloadMainViews();
        return;
      }
      await loadHistory(value, false, false);
      if (selectionTimer !== timer) return;
      selectionTimer = null;
      if (destroyed || document.hidden || !opened || selectionKey(selection()) !== key) return;
      // Let another date selection supersede secondary work before it reaches the host.
      selectionDetailsTimer = window.setTimeout(() => {
        selectionDetailsTimer = null;
        if (destroyed || document.hidden || !opened || selectionKey(selection()) !== key) return;
        if (!value.calendarDays) void loadHistory(value);
        void preloadExecutions(value);
        void preloadMainViews();
      }, SELECTION_DELAY_MS);
    }, SELECTION_DELAY_MS);
    selectionTimer = timer;
  }

  function loadProviderPrices(force = false) {
    if (!force && providerPrices && Date.now() - providerPricesAt < 300000) return Promise.resolve();
    if (providerPricesWork) return providerPricesWork;
    providerPricesWork = (async () => {
      const response = await request("/provider-prices/public", {}, "provider-prices", force);
      if (!response) return;
      if (!Array.isArray(response.providers)) {
        remember(failures, "provider-prices", { count: 1, retryAt: Date.now() + 60000, message: "供应商价格响应无效" }, 64);
        return;
      }
      const next = response.providers.filter(item => typeof item?.id === "string");
      const changed = JSON.stringify(providerPrices) !== JSON.stringify(next);
      providerPrices = next;
      providerPricesAt = Date.now();
      if (changed) {
        invalidatePrices();
        if (opened) renderPrices(false);
      }
    })().finally(() => { providerPricesWork = null; });
    return providerPricesWork;
  }

  function* providerRankingSteps(days) {
    const totals = new Map();
    let processed = 0;
    for (const day of days) {
      for (const row of day.breakdowns || []) {
        if (++processed % 64 === 0) yield;
        const model = modelName(row.model), provider = row.providerId || row.provider;
        if (typeof provider !== "string" || !provider || model === UNKNOWN_MODEL) continue;
        const part = usageValue(row);
        if (!part.countsKnown) continue;
        if (!totals.has(model)) totals.set(model, new Map());
        const byProvider = totals.get(model);
        byProvider.set(provider, (byProvider.get(provider) || 0) + part.input + part.output);
      }
    }
    return new Map([...totals].map(([model, providers]) =>
      [model, [...providers].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))[0][0]]));
  }

  function loadProviderRanking() {
    if (Date.now() - providerRankingAt < 300000) return Promise.resolve();
    if (providerRankingWork) return providerRankingWork;
    providerRankingWork = (async () => {
      const response = await request("/usage/history", {
        period: "all", includeActivity: false, includeSessionCursors: false,
        includeFingerprints: false, includeSessionMetadata: false,
      }, "provider-ranking");
      if (response?.source !== COMMITTED_SOURCE || !Array.isArray(response.days)) {
        if (response) providerRankingAt = Date.now();
        return;
      }
      const ranking = await runSteps(providerRankingSteps(response.days));
      if (!ranking || destroyed) return;
      const changed = ranking.size !== providerRanking.size ||
        [...ranking].some(([model, provider]) => providerRanking.get(model) !== provider);
      providerRanking = ranking;
      providerRankingAt = Date.now();
      if (changed) {
        invalidatePrices();
        if (opened) renderPrices(false);
      }
    })().finally(() => { providerRankingWork = null; });
    return providerRankingWork;
  }

  function refreshProviderPricing(snapshot) {
    if (!opened || document.hidden || inFlight.size >= MAX_IN_FLIGHT - 1) return;
    const showPrices = !panel.querySelector(".codex-daily-price-panel").hidden;
    const models = showPrices ? priceModels : (snapshot?.data.models || [])
      .filter(model => !model.isOther).map(model => model.model);
    let needsDirectory = showPrices;
    let needsRanking = false;
    for (const model of models) {
      if (model === UNKNOWN_MODEL) continue;
      const source = priceConfig.sources[model] || (hasPrice(priceConfig.models[model]) ? "custom" : "auto");
      needsRanking ||= source === "auto" && !hasPrice(DEFAULT_MODEL_PRICES[modelPriceId(model)]);
      needsDirectory ||= needsRanking || source.startsWith("provider:");
      if (needsRanking) break;
    }
    if (!needsDirectory) return;
    void loadProviderPrices().then(() => {
      if (needsRanking && snapshot?.data.indexed && providerPrices?.length &&
          !destroyed && opened && !document.hidden && inFlight.size < MAX_IN_FLIGHT - 1) {
        return loadProviderRanking();
      }
    });
  }

  function executionKey(record) {
    return JSON.stringify([record.sessionId, record.id]);
  }

  function executionTime(record) {
    const timestamp = record.timestampMs ?? record.timestamp;
    const value = typeof timestamp === "number" ? timestamp : Date.parse(timestamp);
    return Number.isFinite(value) ? value : 0;
  }

  function sameExecution(left, right) {
    return executionKey(left) === executionKey(right) && executionTime(left) === executionTime(right) &&
      (left.name ?? "") === (right.name ?? "") && (left.namespace ?? "") === (right.namespace ?? "") &&
      (left.kind ?? "") === (right.kind ?? "");
  }

  function executionDetailExpired(record) {
    return executionTime(record) + DETAIL_RETENTION_MS <= Date.now();
  }

  function executionSearchTerms(search) {
    const needle = search.toLowerCase();
    return [search, ...Object.entries(TOOL_SEARCH_NAMES)
      .filter(([, labels]) => needle && labels.toLowerCase().includes(needle))
      .map(([name]) => name)];
  }

  async function searchExecutions(query, requestKey, force, current) {
    const terms = executionSearchTerms(query.search);
    if (terms.length === 1) return request("/usage/executions", query, requestKey, force);
    let position = query.cursor ? JSON.parse(query.cursor) : { term: 0, cursor: null };
    let result = null;
    const items = [];
    // 中文和原始名称使用同一宿主分页，不扫描会话或为搜索读取正文。
    while (position.term < terms.length && items.length < query.limit) {
      const response = await request("/usage/executions", { ...query,
        search: terms[position.term], cursor: position.cursor || undefined,
        revision: result?.revision ?? query.revision, limit: query.limit - items.length,
      }, `${requestKey}:${position.term}:${position.cursor || ""}`, force);
      if (!current()) return null;
      if (!response || response.status === "stale") return response;
      if (result && response.revision !== result.revision) return { status: "stale" };
      result = response;
      items.push(...(response.items || []).filter(record => !terms.slice(0, position.term).some(term =>
        [record.name, record.namespace].some(value => String(value || "").toLowerCase().includes(term.toLowerCase())))));
      position = response.nextCursor ? { term: position.term, cursor: response.nextCursor } :
        { term: position.term + 1, cursor: null };
      if (response.nextCursor) break;
    }
    return { ...result, items, searchApplied: true,
      nextCursor: position.term < terms.length ? JSON.stringify(position) : null };
  }

  async function imageRuntime() {
    if (nativeImageRuntime) return nativeImageRuntime;
    const urls = performance.getEntriesByType("resource").map(entry => entry.name)
      .concat([...document.scripts].map(script => script.src))
      .filter(url => /^app:\/\/[^/]+\/assets\/\d+\.[\w-]+\.js$/.test(url));
    for (const url of [...new Set(urls)].slice(-24).reverse()) {
      const module = await import(/* @vite-ignore */ url);
      const runtime = module.__webpack_require__;
      if (!runtime?.m) continue;
      const markers = {
        services: text => text.includes("setAppServices:") && text.includes("appServices:"),
        react: text => text.includes(".createElement=") && text.includes(".useState="),
        dom: text => text.includes(".createRoot=") && text.includes(".prototype.unmount="),
        viewer: text => text.includes('"image-preview-dismiss-area"') && text.includes('id:"imagePreviewDialog.label"'),
      };
      const matches = Object.fromEntries(Object.keys(markers).map(key => [key, []]));
      const factories = Object.entries(runtime.m);
      let started = performance.now();
      for (let index = 0; index < factories.length; index++) {
        const text = String(factories[index][1]);
        for (const [key, marker] of Object.entries(markers)) if (marker(text)) matches[key].push(factories[index][0]);
        if (performance.now() - started >= 5) {
          await window.scheduler.yield();
          started = performance.now();
        }
      }
      const find = key => {
        const entries = matches[key];
        if (entries.length !== 1) throw new Error("当前客户端的原生图片接口无法识别");
        return runtime(entries[0]);
      };
      const services = find("services");
      const react = find("react");
      const dom = find("dom");
      const viewerModule = find("viewer");
      const Viewer = Object.values(viewerModule).find(value => typeof value === "function" &&
        String(value).includes('id:"imagePreviewDialog.label"'));
      if (!Viewer || !services.appServices?.workspaceFiles?.readBinary) throw new Error("原生图片读取或查看器不可用");
      nativeImageRuntime = { react, dom, Viewer, files: services.appServices.workspaceFiles };
      return nativeImageRuntime;
    }
    throw new Error("未找到已加载的原生图片接口");
  }

  function clearExecutionImage() {
    if (!executionImage) return;
    executionImage.cancel();
    executionImage.container.replaceChildren(document.createTextNode("正在加载图片…"));
    executionImage = null;
  }

  async function loadExecutionImage(record, value, container) {
    const path = value.imagePath;
    const key = executionKey(record);
    if (executionImage?.key === key && executionImage.container === container) return;
    clearExecutionImage();
    let timer;
    let cancel;
    const cancelled = new Promise((_, reject) => { cancel = () => reject(new Error("图片预览已收起")); });
    const entry = { key, container, cancel: () => { cancel(); window.clearTimeout(timer); } };
    executionImage = entry;
    const current = () => !destroyed && executionImage === entry && container.isConnected && executionExpanded === key;
    try {
      const timeout = new Promise((_, reject) => {
        timer = window.setTimeout(() => reject(new Error("图片读取超时，请收起后重试")), REQUEST_TIMEOUT_MS);
      });
      const runtime = await Promise.race([imageRuntime(), timeout, cancelled]);
      if (!current()) return;
      const data = await Promise.race([runtime.files.readBinary({ path, hostId: "local",
        conversationId: record.sessionId, maxBytes: 16 * 1024 * 1024 }), timeout, cancelled]);
      if (!current()) return;
      if (!data.contentsBase64) throw new Error(data.tooLarge ? "图片超过 16 MiB 预览限制" : "原图片不存在或无法读取");
      const mime = data.mimeType || ({ png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg",
        webp: "image/webp", gif: "image/gif", avif: "image/avif", svg: "image/svg+xml" })[path.split(".").pop().toLowerCase()];
      if (!mime?.startsWith("image/")) throw new Error("文件不是可预览的图片格式");
      const image = new Image();
      image.alt = path.split(/[\\/]/).pop();
      image.decoding = "async";
      image.src = `data:${mime};base64,${data.contentsBase64}`;
      await Promise.race([image.decode(), timeout, cancelled]);
      if (!current()) return;
      const button = document.createElement("button");
      button.type = "button";
      button.className = "codex-daily-image-preview";
      button.title = "在原生图像查看器中查看";
      button.setAttribute("aria-label", `查看图片 ${image.alt}`);
      button.append(image);
      button.addEventListener("click", event => {
        event.stopPropagation();
        try {
          const anchor = document.querySelector("main");
          let fiber = anchor?.[Object.keys(anchor).find(key => key.startsWith("__reactFiber$"))];
          let intl;
          const contexts = new Map();
          for (let depth = 0; fiber && depth < 256; depth++, fiber = fiber.return) {
            const context = fiber.type?._context || fiber.type;
            if (context?.$$typeof === Symbol.for("react.context") && !contexts.has(context)) {
              contexts.set(context, fiber.memoizedProps.value);
            }
            if (typeof fiber.memoizedProps?.value?.formatMessage === "function") {
              intl = fiber.memoizedProps.value;
            }
          }
          if (!intl || !window.__REACT_INTL_CONTEXT__) throw new Error("原生图像查看器的语言环境不可用");
          nativeImageDialog?.();
          const mount = document.createElement("div");
          mount.dataset.codexPlusExt = "daily-image-preview";
          document.body.append(mount);
          const root = runtime.dom.createRoot(mount, { onUncaughtError: error => {
            close();
            container.textContent = `图片查看失败：${error.message}`;
          } });
          const surfaces = [document.getElementById("codex-daily-token-usage"),
            document.getElementById("codex-daily-token-usage-panel")].filter(Boolean);
          const visibility = surfaces.map(node => node.style.visibility);
          surfaces.forEach(node => { node.style.visibility = "hidden"; });
          const close = () => {
            root.unmount(); mount.remove(); nativeImageDialog = null;
            surfaces.forEach((node, index) => { node.style.visibility = visibility[index]; });
          };
          nativeImageDialog = close;
          let content = runtime.react.createElement(runtime.Viewer, { src: image.src, alt: image.alt, open: true,
            onOpenChange: open => { if (!open) close(); }, closeAriaLabel: "关闭图像预览" });
          // 原生查看器还依赖当前页面的 scope、主题等上下文，只在点击时取快照。
          for (const [context, value] of contexts) content = runtime.react.createElement(context.Provider, { value }, content);
          root.render(content);
        } catch (error) {
          nativeImageDialog?.();
          container.replaceChildren(document.createTextNode(`图片查看失败：${error.message}`));
        }
      });
      container.replaceChildren(button);
    } catch (error) {
      if (current()) container.textContent = `图片加载失败：${error.message}`;
    } finally { window.clearTimeout(timer); }
  }

  function formatDuration(value) {
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return "";
    if (value < 1000) return `${Math.round(value)} ms`;
    const seconds = value / 1000;
    if (seconds < 60) return `${seconds.toFixed(seconds < 10 ? 2 : 1).replace(/\.?0+$/, "")} s`;
    const minutes = Math.floor(seconds / 60);
    return `${minutes} min ${Math.floor(seconds % 60)} s`;
  }

  function loadSessionTitle(id) {
    const cached = sessionTitles.get(id);
    if (cached && Date.now() - cached.readAt < POLL_MS) return Promise.resolve(cached.title);
    if (sessionTitleWork.has(id)) return sessionTitleWork.get(id);
    if (!sessionQuery?.readTitle) return Promise.resolve("");
    let timer;
    const timeout = new Promise((_, reject) => {
      timer = window.setTimeout(() => reject(new Error("会话名称读取超时")), REQUEST_TIMEOUT_MS);
    });
    const work = Promise.race([sessionQuery.readTitle(id), timeout]).then(title => {
      const result = typeof title === "string" ? title.trim() : "";
      if (!destroyed) remember(sessionTitles, id, { title: result, readAt: Date.now() }, 128);
      return result;
    }, error => {
      console.error("Daily: 会话名称读取失败", error);
      return "";
    }).finally(() => {
      window.clearTimeout(timer);
      sessionTitleWork.delete(id);
    });
    sessionTitleWork.set(id, work);
    return work;
  }

  function detailText(value) {
    if (typeof value === "string") return value;
    if (Array.isArray(value)) return value.map(detailText).filter(Boolean).join("\n");
    if (value && typeof value === "object") return JSON.stringify(value, null, 2).replace(/\\\\/g, "\\");
    if (typeof value === "number" || typeof value === "boolean") return String(value);
    return "";
  }

  function executionPreview(input) {
    if (input && typeof input === "object" && !Array.isArray(input)) {
      const object = input;
      input = object.cmd ?? object.command ?? object.path ?? object.file_path ?? object.file ??
        object.action?.command ?? object.patch ?? object.content ?? object.text;
      if (input == null) {
        for (const key in object) {
          if (typeof object[key] === "string") { input = object[key]; break; }
        }
      }
    }
    if (Array.isArray(input)) input = input.slice(0, 3)
      .filter(value => typeof value === "string").map(value => value.slice(0, 2048)).join(" ");
    return (typeof input === "string" ? input.slice(0, 2048) : "")
      .replace(/\s+/g, " ").trim().slice(0, 180);
  }

  function cachedExecutionMetadata(record) {
    const key = executionKey(record);
    const entry = executionMetadata.get(key);
    if (entry && (!sameExecution(entry.record, record) || executionDetailExpired(record))) {
      executionMetadata.delete(key);
      return null;
    }
    return entry || null;
  }

  function rememberExecutionMetadata(record, value, revision, status, sourceRevision = revision) {
    const previous = cachedExecutionMetadata(record);
    const preview = value?.preview ?? executionPreview(value?.input);
    const durationMs = value?.durationMs;
    remember(executionMetadata, executionKey(record), {
      record,
      preview: preview || previous?.preview || "",
      durationMs: typeof durationMs === "number" ? durationMs : previous?.durationMs,
      revision,
      sourceRevision,
      status,
      attempts: previous && previous.revision === revision && previous.status === status ? previous.attempts + 1 : 1,
      retryAt: Date.now() + (status === "partial" ? POLL_MS : EXECUTION_METADATA_RETRY_MS),
    }, EXECUTION_METADATA_LIMIT);
  }

  async function revalidateExecutionDetail(record, state) {
    const page = state.page;
    const viewRevision = state.revision;
    const timestamp = executionTime(record);
    const key = executionKey(record);
    const current = () => !destroyed && opened && toolsOpen && executionState === state &&
      state.page === page && state.targetPage === page && state.revision === viewRevision;
    if (!timestamp || !current()) return null;
    const result = await request("/usage/executions", {
      startAt: timestamp, endAt: timestamp + 1, limit: EXECUTION_PAGE_SIZE,
    }, `execution-revalidate:${key}`, true);
    if (!current() || !result) return null;
    if (!Array.isArray(result.items) || !Number.isInteger(result.revision) ||
        !result.items.some(item => sameExecution(item, record))) return { status: "not_found" };
    const response = await request("/usage/execution-detail", {
      sessionId: record.sessionId, id: record.id, revision: result.revision,
    }, `detail-revalidate:${key}:${result.revision}`, true);
    if (!current()) return null;
    if (response && response.revision != null && response.revision !== result.revision) {
      return { status: "stale" };
    }
    return response;
  }

  function updateExecutionMetadataRow(record) {
    if (!panel || !toolsOpen) return;
    const key = executionKey(record);
    const row = [...panel.querySelectorAll(".codex-daily-execution-row")]
      .find(node => node.dataset.executionKey === key);
    if (!row) return;
    const cached = details.get(key);
    const detail = cached?.viewRevision === executionState?.revision ? cached.value : null;
    const metadata = cachedExecutionMetadata(record);
    const title = String(record.name || record.kind || "工具调用");
    const preview = record.preview || detail?.preview || metadata?.preview || "";
    const duration = formatDuration(record.durationMs ?? detail?.durationMs ?? metadata?.durationMs);
    row.querySelector(".codex-daily-execution-preview").textContent = preview === title ? "" : preview;
    row.querySelector(".codex-daily-execution-time").textContent = duration || "—";
    if (executionHoverKey === key) {
      panel.querySelector("[data-hover-duration]").textContent = duration || "暂无";
    }
  }

  function scheduleExecutionMetadata(delay = 0) {
    if (executionMetadataWork || destroyed || !opened || !toolsOpen) return;
    const due = Date.now() + delay;
    if (executionMetadataTimer) {
      if (due >= executionMetadataDue) return;
      window.clearTimeout(executionMetadataTimer);
    }
    executionMetadataDue = due;
    executionMetadataTimer = window.setTimeout(() => {
      executionMetadataTimer = null;
      executionMetadataDue = 0;
      void loadVisibleExecutionMetadata();
    }, delay);
  }

  async function loadVisibleExecutionMetadata() {
    const state = executionState;
    const list = panel?.querySelector(".codex-daily-execution-list");
    if (destroyed || !opened || !toolsOpen || !state || !Number.isInteger(state.revision) ||
        !list || list.hidden || !state.search && state.kind !== "tool") return;
    const records = executionItems();
    const expandedIndex = records.findIndex(record => executionKey(record) === executionExpanded);
    const top = list.scrollTop;
    const bottom = top + list.clientHeight;
    const now = Date.now();
    let nextRetry = Infinity;
    const record = records.find((item, index) => {
      const rowTop = index * EXECUTION_ROW_HEIGHT +
        (expandedIndex >= 0 && index > expandedIndex ? EXECUTION_DETAIL_HEIGHT : 0);
      const rowBottom = rowTop + EXECUTION_ROW_HEIGHT +
        (index === expandedIndex ? EXECUTION_DETAIL_HEIGHT : 0);
      if (rowBottom <= top || rowTop >= bottom || executionDetailExpired(item)) return false;
      if (item.preview && typeof item.durationMs === "number") return false;
      const metadata = cachedExecutionMetadata(item);
      if (metadata?.status === "ok") return false;
      const sameRevision = metadata?.revision === state.revision;
      if (sameRevision && (metadata.status === "not_found" ||
          metadata.status === "stale" && !(state.search && state.page > 0) ||
          metadata.status === "partial" && metadata.attempts >= 2)) return false;
      const failure = failures.get(`detail:${executionKey(item)}`);
      const retryAt = Math.max(sameRevision || metadata?.status === "failed" ? metadata?.retryAt || 0 : 0,
        failure?.retryAt || 0);
      if (retryAt > now) {
        nextRetry = Math.min(nextRetry, retryAt);
        return false;
      }
      return true;
    });
    if (!record) {
      if (Number.isFinite(nextRetry)) scheduleExecutionMetadata(Math.max(50, nextRetry - now));
      return;
    }
    const key = executionKey(record);
    if (inFlight.size >= MAX_IN_FLIGHT - 1 && !inFlight.has(`detail:${key}`)) {
      scheduleExecutionMetadata(250);
      return;
    }
    executionMetadataWork = true;
    const revision = state.revision;
    const page = state.page;
    try {
      const revalidating = cachedExecutionMetadata(record)?.status === "stale" && state.search && page > 0;
      let response = revalidating ?
        await revalidateExecutionDetail(record, state) :
        await request("/usage/execution-detail", {
          sessionId: record.sessionId, id: record.id, revision,
        }, `detail:${key}`);
      if (destroyed || !opened || !toolsOpen || executionState !== state || state.revision !== revision ||
          state.page !== page || state.targetPage !== page) return;
      let sourceRevision = revalidating ? response?.revision : revision;
      if (!revalidating && state.search && page > 0 &&
          (response?.status === "stale" || response?.revision != null && response.revision !== revision)) {
        response = await revalidateExecutionDetail(record, state);
        if (destroyed || !opened || !toolsOpen || executionState !== state || state.revision !== revision ||
            state.page !== page || state.targetPage !== page) return;
        sourceRevision = response?.revision;
      }
      const status = !response ? "failed" :
        sourceRevision != null && response.revision != null && response.revision !== sourceRevision ?
          "stale" : response.status;
      rememberExecutionMetadata(record, status === "stale" ? null : response?.detail,
        revision, status, response?.revision ?? sourceRevision);
      if (status === "stale" && state.search) state.staleDetailRevision = revision;
      updateExecutionMetadataRow(record);
    } finally {
      executionMetadataWork = false;
      scheduleExecutionMetadata();
    }
  }

  function detailPageText(text, page) {
    let start = page * DETAIL_PAGE_SIZE;
    let end = Math.min(text.length, start + DETAIL_PAGE_SIZE);
    if (start > 0 && /[\uD800-\uDBFF]/.test(text[start - 1]) && /[\uDC00-\uDFFF]/.test(text[start])) start--;
    if (end < text.length && /[\uD800-\uDBFF]/.test(text[end - 1]) && /[\uDC00-\uDFFF]/.test(text[end])) end--;
    return text.slice(start, end);
  }

  function scheduleDetailExpiry(record = detailExpiryRecord) {
    detailExpiryRecord = record;
    if (detailExpiryTimer) window.clearTimeout(detailExpiryTimer);
    detailExpiryTimer = null;
    let next = Infinity;
    for (const entry of details.values()) {
      next = Math.min(next, executionTime(entry.record) + DETAIL_RETENTION_MS);
    }
    if (detailExpiryRecord && executionExpanded === executionKey(detailExpiryRecord)) {
      next = Math.min(next, executionTime(detailExpiryRecord) + DETAIL_RETENTION_MS);
    } else {
      detailExpiryRecord = null;
    }
    if (!Number.isFinite(next)) return;
    detailExpiryTimer = window.setTimeout(() => {
      detailExpiryTimer = null;
      for (const [key, entry] of details) {
        if (!executionDetailExpired(entry.record)) continue;
        detailChars -= entry.size;
        details.delete(key);
      }
      if (detailExpiryRecord && executionDetailExpired(detailExpiryRecord)) {
        if (executionExpanded === executionKey(detailExpiryRecord)) renderExecutionRows(true);
        detailExpiryRecord = null;
      }
      scheduleDetailExpiry();
    }, Math.max(0, next - Date.now()));
  }

  function cachedDetail(record) {
    const key = executionKey(record);
    const cached = details.get(key);
    if (!cached) return null;
    if (executionDetailExpired(record) || cached.viewRevision !== executionState?.revision ||
        !sameExecution(cached.record, record)) {
      details.delete(key);
      detailChars -= cached.size;
      return null;
    }
    details.delete(key);
    details.set(key, cached);
    return cached.value;
  }

  function putDetail(record, value, origin = selectionKey(selection()), partial = false,
      revision = executionState?.revision) {
    const key = executionKey(record);
    const old = details.get(key);
    if (old) detailChars -= old.size;
    details.delete(key);
    if (executionDetailExpired(record)) return null;
    const normalized = { partial, durationMs: value?.durationMs, preview: executionPreview(value?.input) };
    if (String(record.name).split(".").pop() === "view_image") {
      let input = value?.input;
      if (typeof input === "string") {
        try { input = JSON.parse(input); } catch { input = null; }
      }
      if (typeof input?.path === "string") normalized.imagePath = input.path;
    }
    let size = 0;
    for (const field of ["paths", "input", "changes", "metadata", "output"]) {
      const text = detailText(value?.[field]);
      normalized[field] = text;
      size += text.length;
    }
    while (details.size && (detailChars + size > DETAIL_CACHE_BUDGET || details.size >= DETAIL_ENTRY_LIMIT)) {
      const first = details.keys().next().value;
      detailChars -= details.get(first).size;
      details.delete(first);
    }
    details.set(key, { value: normalized, size, origin, record, revision, viewRevision: executionState?.revision });
    detailChars += size;
    rememberExecutionMetadata(record, normalized, executionState?.revision,
      normalized.partial ? "partial" : "ok", revision);
    updateExecutionMetadataRow(record);
    scheduleDetailExpiry();
    return normalized;
  }

  async function loadDetail(record, retryStale = true, force = false) {
    if (executionDetailExpired(record)) {
      cachedDetail(record);
      renderExecutionRows(true);
      return;
    }
    const key = executionKey(record);
    scheduleDetailExpiry(record);
    if (cachedDetail(record)) return;
    const origin = selectionKey(selection());
    const state = executionState;
    const revision = state?.revision;
    let response = await request("/usage/execution-detail", {
      sessionId: record.sessionId, id: record.id, ...(revision != null ? { revision } : {}),
    }, `detail:${key}`, force);
    if (destroyed || executionState !== state || state?.revision !== revision) return;
    if (response?.status === "stale" ||
        response?.revision != null && revision != null && response.revision !== revision) {
      if (state?.search && state.page > 0 && state.targetPage === state.page && executionExpanded === key) {
        response = await revalidateExecutionDetail(record, state);
        if (destroyed || executionState !== state || executionExpanded !== key || state.revision !== revision) return;
        if (response && !["stale", "not_found"].includes(response.status)) {
          putDetail(record, response.detail || {}, origin, response.status === "partial", response.revision);
        } else {
          remember(failures, `detail:${key}`, { count: 1, retryAt: Date.now() + POLL_MS,
            message: "工具记录已变化，请稍后重试" }, 64);
        }
        if (opened) renderExecutionRows(true);
        return;
      }
      if (retryStale && state?.page === 0 && state.targetPage === 0 &&
          state.key === selectionKey(selection()) && executionExpanded === key) {
        const list = panel.querySelector(".codex-daily-execution-list");
        const index = executionItems().findIndex(item => executionKey(item) === key);
        const anchor = index * EXECUTION_ROW_HEIGHT - list.scrollTop;
        if (queuedExecutionPage?.reset) queuedExecutionPage = null;
        if (!queuedExecutionPage) await loadExecutions(state.value, 0, true);
        if (destroyed || executionState !== state || executionExpanded !== key ||
            state.key !== selectionKey(selection())) return;
        const next = activateQueuedExecution(key, anchor);
        if (next === null) return;
        if (next) return loadDetail(next, false);
      }
      queuedExecutionPage = { state, reset: true };
      remember(failures, `detail:${key}`, { count: 1, retryAt: Date.now() + POLL_MS,
        message: "工具记录已变化，收起后刷新" }, 64);
    } else if (response?.status === "not_found") {
      putDetail(record, {}, origin);
    } else if (response) {
      putDetail(record, response.detail || {}, origin, response.status === "partial");
    }
    if (opened && executionExpanded === key) renderExecutionRows(true);
  }

  function newExecutionState(value, kind = toolKind, search = executionSearch) {
    return {
      key: selectionKey(value), value, page: 0, targetPage: 0, cursors: [null], pages: new Map(),
      kind, search, revision: null, staleDetailRevision: null, coverage: null, dailySummaries: null, activity: null,
      hasPartialDay: false, hasIncompleteDay: false, storageLimited: false, searchApplied: false, error: "",
    };
  }

  function executionStateFor(value, kind = toolKind, search = executionSearch) {
    const key = JSON.stringify([selectionKey(value), kind, search]);
    const state = executionStates.get(key) || newExecutionState(value, kind, search);
    remember(executionStates, key, state, EXECUTION_STATE_LIMIT);
    return state;
  }

  async function preloadExecutions(value) {
    const key = selectionKey(value);
    await loadExecutions(value);
    if (executionSearch) return;
    for (const kind of ["skill", "plugin", "tool"]) {
      if (destroyed || document.hidden || !opened || selectionKey(selection()) !== key) return;
      const state = executionStateFor(value, kind, "");
      if (!state.pages.has(0)) await loadExecutions(value, 0, false, kind, "");
    }
  }

  async function loadExecutions(value, page = 0, force = false, kind = toolKind, search = executionSearch) {
    if (!opened || value.scope === "current" && !value.sessionId) return;
    const key = selectionKey(value);
    const state = executionStateFor(value, kind, search);
    if (kind === toolKind && search === executionSearch && key === selectionKey(selection())) {
      executionState = state;
    }
    if (state.targetPage !== page) return;
    const cursor = state.cursors[page];
    if (page > 0 && !cursor) return;
    const query = {
      startAt: value.startAt, endAt: value.endAt, limit: EXECUTION_PAGE_SIZE,
      ...(value.sessionId ? { scopeSessionId: value.sessionId } : {}),
      ...(cursor ? { cursor } : {}),
      ...(page && state.revision != null ? { revision: state.revision } : {}),
      ...(search ? { search } : {}),
      ...(!search ? { kind: state.kind === "plugin" ? "mcp" : state.kind } : {}),
      ...(!search && state.kind !== "tool" ? { includeActivitySummary: true } : {}),
    };
    const requestKey = `execution:${key}:${state.kind}:${page}:${search}`;
    const response = search ? await searchExecutions(query, requestKey, force,
      () => !destroyed && executionState === state && state.targetPage === page) :
      await request("/usage/executions", query, requestKey, force);
    if (destroyed || executionStateFor(value, kind, search) !== state || state.targetPage !== page) return;
    const active = executionState === state;
    if (response && (response.status === "stale" ||
        page && state.revision != null && response.revision !== state.revision)) {
      if (active && executionExpanded) {
        queuedExecutionPage = { state, reset: true };
        return;
      }
      if (!page) {
        state.error = "工具记录版本已变化，请稍后重试";
        if (active) renderToolCalls();
        return;
      }
      const replacement = newExecutionState(value, kind, search);
      remember(executionStates, JSON.stringify([key, kind, search]), replacement, EXECUTION_STATE_LIMIT);
      if (active) {
        executionState = replacement;
        executionExpanded = "";
        executionScrollTop = 0;
      }
      void loadExecutions(value, 0, true, kind, search);
      return;
    }
    if (!response || !Array.isArray(response.items)) {
      state.targetPage = state.page;
      const failure = failures.get(requestKey);
      state.error = failure?.unsupported ? "当前宿主不支持工具记录，请更新 Codex++" :
        failure?.message || "工具记录尚不可用";
      if (active) renderToolCalls();
      return;
    }
    const pageData = {
      items: response.items,
      nextCursor: response.nextCursor || null,
      complete: response.complete === true,
    };
    if (active && executionExpanded && state.page === page) {
      if (!queuedExecutionPage?.reset) {
        queuedExecutionPage = { state, page, pageData, response };
      }
      return;
    }
    applyExecutionPage(state, page, pageData, response);
  }

  function applyExecutionPage(state, page, pageData, response) {
    if (state.targetPage !== page) return;
    pageData.items = pageData.items.filter(record => {
      const ordinary = record.kind === "tool" || (!record.kind && !state.search && state.kind === "tool");
      return !ordinary || !executionDetailExpired(record);
    });
    if (state.pages.size && response.revision != null && response.revision !== state.revision) {
      state.pages.clear();
      state.cursors = [null];
    }
    if (Array.isArray(response.dailySummaries)) {
      state.dailySummaries = response.dailySummaries;
      const first = localDayBounds(state.value.startAt);
      const last = localDayBounds(state.value.endAt - 1);
      const firstPartial = state.value.startAt > first.startAt ? dateKey(first.startAt) : "";
      const lastPartial = state.value.endAt < last.endAt ? dateKey(last.startAt) : "";
      state.hasPartialDay = !!(firstPartial || lastPartial) && state.dailySummaries.some(row =>
        row.day === firstPartial || row.day === lastPartial);
      state.hasIncompleteDay = state.dailySummaries.some(row => row.partial === true);
    } else if (response.revision !== state.revision) {
      state.dailySummaries = null;
      state.hasPartialDay = false;
      state.hasIncompleteDay = false;
    }
    state.revision = response.revision ?? state.revision;
    if (!state.search && response.summary) {
      const previous = executionSummaries.get(state.key);
      if (state.revision == null || previous?.revision == null || state.revision >= previous.revision) {
        remember(executionSummaries, state.key, { summary: response.summary, hasPartialDay: state.hasPartialDay,
          storagePruned: response.coverage?.reason === "storage-pruned", revision: state.revision }, EXECUTION_STATE_LIMIT);
        if (toolsOpen && executionState !== state && executionState?.key === state.key) renderExecutionTotals(state.key);
      }
    }
    state.activity = response.activitySummary || null;
    state.coverage = response.coverage || state.coverage;
    state.storageLimited = !!response.scan?.storageError;
    state.searchApplied = response.searchApplied === true;
    state.error = "";
    state.page = page;
    remember(state.pages, page, pageData, 3);
    state.cursors[page + 1] = pageData.nextCursor;
    if (page === 0) state.cursors.length = 2;
    if (executionState === state) renderToolCalls();
  }

  function applyQueuedExecutionPage() {
    const queued = queuedExecutionPage;
    queuedExecutionPage = null;
    if (!queued || executionState !== queued.state) return;
    if (queued.reset) {
      executionState = newExecutionState(queued.state.value, queued.state.kind, queued.state.search);
      remember(executionStates, JSON.stringify([executionState.key, executionState.kind, executionState.search]),
        executionState, EXECUTION_STATE_LIMIT);
      executionScrollTop = 0;
      panel.querySelector(".codex-daily-execution-list").scrollTop = 0;
      void loadExecutions(queued.state.value, 0, true);
    } else {
      applyExecutionPage(queued.state, queued.page, queued.pageData, queued.response);
    }
  }

  function activateQueuedExecution(key, anchor) {
    const state = executionState;
    const queued = queuedExecutionPage;
    if (!queued || queued.state !== state || queued.reset || queued.page !== state.page ||
        state.targetPage !== state.page || state.key !== selectionKey(selection())) return undefined;
    executionExpanded = "";
    applyQueuedExecutionPage();
    const records = executionItems();
    const index = records.findIndex(item => executionKey(item) === key);
    if (index < 0) {
      state.error = "工具记录已变化，请重新选择";
      renderToolCalls();
      return null;
    }
    executionExpanded = key;
    renderToolCalls();
    const list = panel.querySelector(".codex-daily-execution-list");
    list.scrollTop = index * EXECUTION_ROW_HEIGHT - anchor;
    executionScrollTop = list.scrollTop;
    renderExecutionRows(true);
    return records[index];
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, character =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
  }

  function formatNumber(value, mode = "count") {
    if (!Number.isFinite(value)) return "—";
    if (value < 1000 || (mode === "tokens" && !compactNumbers)) return NUMBER_FORMATTER.format(value);
    const unit = value >= 1_000_000_000 ? [1_000_000_000, "B"] :
      value >= 1_000_000 ? [1_000_000, "M"] : [1000, "K"];
    if (mode === "tokens" || mode === "fixed") return `${(value / unit[0]).toFixed(mode === "tokens" ? 2 : 1)}${unit[1]}`;
    return `${(value / unit[0]).toFixed(value / unit[0] >= 100 ? 0 : 1).replace(/\.0$/, "")}${unit[1]}`;
  }

  function formatCost(value) {
    if (!Number.isFinite(value)) return "—";
    return `$${value.toFixed(value >= 1 ? 2 : value >= 0.01 ? 4 : 6)}`;
  }

  function metricNumber(tokens, cost, priced = true) {
    return trendMetric === "cost" ? formatCost(priced ? cost : null) : formatNumber(tokens, "tokens");
  }

  function tokenNumberMarkup(text) {
    return `<span data-token-number role="button" tabindex="0" title="${trendMetric === "tokens" ? "切换为金额" : "切换为 Token"}">${text}</span>`;
  }

  function setMetric(metric) {
    trendMetric = metric;
    writeSetting(TREND_STORAGE_KEY, trendMetric);
    renderPeriod();
    renderTrigger();
    renderSnapshot(false);
  }

  function formatDateTime(timestamp) {
    return DATETIME_FORMATTER.format(new Date(timestamp));
  }

  function datetimeValue(timestamp) {
    const date = new Date(timestamp);
    return `${dateKey(timestamp)}T${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
  }

  function resolvedTheme() {
    if (themeMode !== "auto") return themeMode;
    for (const node of [document.documentElement, document.body]) {
      const declared = node?.getAttribute("data-theme");
      if (declared === "light" || declared === "dark") return declared;
      if (node?.classList.contains("dark") || node?.classList.contains("electron-dark")) return "dark";
      if (node?.classList.contains("light") || node?.classList.contains("electron-light")) return "light";
      if (["light", "dark"].includes(node?.style.colorScheme)) return node.style.colorScheme;
    }
    return themeMedia?.matches ? "dark" : "light";
  }

  function applyTheme() {
    const theme = resolvedTheme();
    if (root) root.dataset.colorScheme = theme;
    if (panel) {
      panel.dataset.colorScheme = theme;
      const button = panel.querySelector('[data-action="cycle-theme"]');
      const labels = { auto: "自动", light: "浅色", dark: "深色" };
      button.title = `主题：${labels[themeMode]}`;
      button.setAttribute("aria-label", button.title);
      button.innerHTML = themeMode === "light"
        ? '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M4.93 4.93l1.41 1.41m11.32 11.32 1.41 1.41M2 12h2m16 0h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/></svg>'
        : themeMode === "dark"
          ? '<svg viewBox="0 0 24 24"><path d="M20.9 12.5a9 9 0 1 1-9.4-9.5 6 6 0 0 0 9.4 9.5Z"/></svg>'
          : '<svg viewBox="0 0 24 24"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8m-4-4v4"/></svg>';
    }
  }

  function installStyle() {
    style = document.createElement("style");
    style.id = STYLE_ID;
    style.dataset.codexPlusExt = ctx.id;
    style.textContent = `
      #${ROOT_ID},#${PANEL_ID}{--bg:#fff;--text:#202020;--muted:#737373;--line:rgba(127,127,127,.24);--hover:rgba(127,127,127,.08);--tertiary:rgba(127,127,127,.15);--selected:#fff;--accent:#209681;--blue:#2676d9;--warn:#9a5b20;--shadow:0 14px 40px #0000002e;color:var(--text);color-scheme:light;font:12px/1.45 ui-sans-serif,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;letter-spacing:0}
      #${ROOT_ID}[data-color-scheme=dark],#${PANEL_ID}[data-color-scheme=dark]{--bg:#202124;--text:#f2f2f2;--muted:#a9a9ad;--line:rgba(255,255,255,.16);--hover:rgba(255,255,255,.055);--tertiary:rgba(255,255,255,.11);--selected:#45474c;--accent:#71cdb6;--blue:#8cb8ee;--warn:#e7b07a;--shadow:0 14px 40px #0006;color-scheme:dark}
      #${ROOT_ID} *,#${PANEL_ID} *{box-sizing:border-box;letter-spacing:0}
      #${ROOT_ID}{flex:none;margin-inline-start:8px;pointer-events:auto;-webkit-app-region:no-drag}
      #${ROOT_ID}[data-caption-placement=edge]{margin-inline-start:auto}
      #${ROOT_ID} button,#${PANEL_ID} button,#${PANEL_ID} input,#${PANEL_ID} select{font:inherit;color:inherit}
      #${ROOT_ID} button,#${PANEL_ID} button{cursor:pointer}
      #${ROOT_ID} .codex-daily-trigger{display:flex;align-items:center;justify-content:center;gap:6px;height:28px;padding:0 10px;border:1px solid var(--line);border-radius:8px;background:var(--hover);white-space:nowrap}
      #${ROOT_ID} .codex-daily-trigger:hover,#${ROOT_ID} .codex-daily-trigger:focus-visible{background:var(--hover)}
      #${ROOT_ID} .codex-daily-brand{width:22px;height:22px}
      #${ROOT_ID}[data-windows-caption] .codex-daily-trigger{padding-inline-end:3px}
      #${ROOT_ID}[data-windows-caption] .codex-daily-brand{order:1}
      #${ROOT_ID} .codex-daily-label{color:var(--muted)}
      #${ROOT_ID} .codex-daily-total{font-weight:650;font-variant-numeric:tabular-nums}
      #${PANEL_ID}{position:fixed;box-sizing:border-box;top:var(--daily-panel-top);width:min(380px,calc(100vw - 24px));max-height:min(calc(var(--daily-panel-height,760px) + var(--daily-tools-extra,0px)),calc(100vh - var(--daily-panel-top) - 12px));z-index:50;display:none;flex-direction:column;background:var(--bg);border:1px solid var(--line);border-radius:12px;box-shadow:var(--shadow);overflow:hidden;-webkit-app-region:no-drag}
      #${PANEL_ID}.is-visible{display:flex}
      body:has([data-testid="image-preview-dismiss-area"]) :is(#${ROOT_ID},#${PANEL_ID}){visibility:hidden;pointer-events:none}
      #${ROOT_ID}[data-compact] .codex-daily-trigger{width:28px;padding:0}
      #${ROOT_ID}[data-compact] :is(.codex-daily-label,.codex-daily-total){display:none}
      #${PANEL_ID}.tools-open{--daily-tools-extra:140px}
      #${PANEL_ID} button{border:0;background:transparent}
      #${PANEL_ID} button:focus-visible,#${PANEL_ID} input:focus-visible,#${PANEL_ID} select:focus-visible{outline:2px solid var(--accent);outline-offset:1px}
      #${ROOT_ID} button:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
      #${PANEL_ID} button:disabled{cursor:default}
      #${PANEL_ID} ::selection{background:color-mix(in srgb,var(--blue) 25%,transparent)}
      #${PANEL_ID} svg{fill:none;stroke:currentColor;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round}
      #${PANEL_ID} .codex-daily-heading{display:flex;align-items:center;flex:0 0 auto;padding:12px 14px 10px;gap:5px}
      #${PANEL_ID} .codex-daily-title{font-size:13px;font-weight:650;flex:1;white-space:nowrap}
      #${PANEL_ID} .codex-daily-icon{display:grid;place-items:center;width:24px;height:24px;border-radius:4px;color:var(--muted)}
      #${PANEL_ID} .codex-daily-icon svg{width:16px;height:16px}
      #${PANEL_ID} .codex-daily-icon:hover,#${PANEL_ID} .codex-daily-head-button:hover{background:var(--hover)}
      #${PANEL_ID} .codex-daily-head-button{height:27px;padding:0 8px;border:1px solid var(--line);border-radius:7px;background:var(--hover);color:var(--muted);font-size:11px;font-weight:600;white-space:nowrap}
      #${PANEL_ID} .codex-daily-session-scope{display:inline-flex;align-items:center;justify-content:center;gap:6px;width:84px;font-size:10px;font-weight:500;color:var(--text)}
      #${PANEL_ID} .codex-daily-session-scope svg{width:12px;height:12px;flex:none}
      #${PANEL_ID} [data-action=pin-panel] svg{transform:rotate(-35deg)}
      #${PANEL_ID} [data-action=pin-panel][aria-pressed=true]{color:var(--accent);background:color-mix(in srgb,var(--accent) 10%,transparent)}
      #${PANEL_ID} [data-action=pin-panel][aria-pressed=true] svg{transform:rotate(0)}
      #${PANEL_ID} .codex-daily-period{display:flex;align-items:center;gap:3px;padding:0 14px 10px;border-bottom:1px solid var(--line);font-size:11px}
      #${PANEL_ID} .codex-daily-period-tabs{display:flex;gap:2px;white-space:nowrap}
      #${PANEL_ID} .codex-daily-period-tabs button{padding:5px 11px;min-height:27px;border-radius:5px;color:var(--muted)}
      #${PANEL_ID} .codex-daily-period-tabs button[aria-pressed=true]{background:var(--tertiary);color:var(--text);font-weight:650}
      #${PANEL_ID} .codex-daily-date-nav{display:flex;align-items:center;gap:1px;margin-left:auto;min-width:0}
      #${PANEL_ID} .codex-daily-date-nav .codex-daily-icon[hidden]{display:none}
      #${PANEL_ID} .codex-daily-date-select{display:inline-flex;align-items:center;justify-content:center;gap:7px;min-width:0;height:28px;padding:0 4px;border-radius:5px;font-size:11px;font-weight:550;font-variant-numeric:tabular-nums}
      #${PANEL_ID} .codex-daily-date-select svg{width:14px;height:14px;color:var(--blue);flex:0 0 auto}
      #${PANEL_ID} .codex-daily-date-select span{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      #${PANEL_ID} .codex-daily-date-select:hover,#${PANEL_ID} .codex-daily-date-select[aria-expanded=true]{background:var(--hover)}
      #${PANEL_ID} .codex-daily-date-nav.is-custom .codex-daily-date-select{height:auto;min-height:28px;text-align:right}
      #${PANEL_ID} .codex-daily-date-nav.is-custom .codex-daily-date-select span{white-space:normal;font-size:10px;line-height:1.45;text-wrap:balance}
      #${PANEL_ID} input[type=date],#${PANEL_ID} input[type=datetime-local],#${PANEL_ID} input[type=number],#${PANEL_ID} input[type=text],#${PANEL_ID} input[type=search],#${PANEL_ID} select{min-width:0;background:var(--bg);border:1px solid var(--line);border-radius:4px;padding:5px 6px;color:var(--text)}
      #${PANEL_ID} .codex-daily-date-input[hidden]{display:none}
      #${PANEL_ID} .codex-daily-calendar{position:absolute;top:var(--codex-daily-calendar-top,84px);right:12px;z-index:5;width:min(280px,calc(100% - 24px));max-height:calc(100% - var(--codex-daily-calendar-top,84px) - 12px);overflow-y:auto;overscroll-behavior:contain;padding:12px;border:1px solid var(--line);border-radius:8px;background:var(--bg);box-shadow:var(--shadow);font-size:11px;scrollbar-width:thin;scrollbar-color:var(--muted) transparent}
      #${PANEL_ID} .codex-daily-calendar[hidden]{display:none}
      #${PANEL_ID} .codex-daily-calendar-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:12px}
      #${PANEL_ID} .codex-daily-calendar-head strong{font-size:12px;font-weight:600}
      #${PANEL_ID} .codex-daily-calendar-weekdays,#${PANEL_ID} .codex-daily-calendar-days{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:2px}
      #${PANEL_ID} .codex-daily-calendar-weekdays{text-align:center;color:var(--muted);margin-bottom:6px;font-size:10px}
      #${PANEL_ID} .codex-daily-calendar-days{margin-bottom:2px}
      #${PANEL_ID} .codex-daily-calendar-days button,#${PANEL_ID} .codex-daily-month-grid button{min-width:0;height:30px;padding:0;border-radius:5px;font-variant-numeric:tabular-nums}
      #${PANEL_ID} .codex-daily-calendar button:hover:not(:disabled){background:var(--hover)}
      #${PANEL_ID} .codex-daily-calendar button.is-range{background:color-mix(in srgb,var(--blue) 12%,transparent)}
      #${PANEL_ID} .codex-daily-calendar button.is-range-edge{background:color-mix(in srgb,var(--blue) 24%,transparent);color:var(--blue);font-weight:650}
      #${PANEL_ID} .codex-daily-calendar [data-calendar-date][aria-pressed=true]{color:#fff;background:#327dcd;font-weight:600}
      #${PANEL_ID} .codex-daily-calendar button:disabled{opacity:.3;cursor:default}
      #${PANEL_ID} .codex-daily-calendar .is-adjacent{opacity:.45}
      #${PANEL_ID} .codex-daily-calendar button[aria-current=date]:not([aria-pressed=true]){color:var(--blue);font-weight:650}
      #${PANEL_ID} .codex-daily-month-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:7px}
      #${PANEL_ID} .codex-daily-month-grid button{height:35px;background:var(--hover)}
      #${PANEL_ID} .codex-daily-calendar-foot{display:flex;align-items:center;justify-content:space-between;border-top:1px solid var(--line);margin-top:10px;padding-top:8px;color:var(--muted);font-size:10px}
      #${PANEL_ID} .codex-daily-calendar-foot button{color:var(--blue);border-radius:4px;padding:4px 7px}
      #${PANEL_ID} .codex-daily-range-editor{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;padding-bottom:13px}
      #${PANEL_ID} .codex-daily-range-endpoint{min-width:0;display:grid;gap:5px;padding:7px;border:1px solid var(--line);border-radius:6px}
      #${PANEL_ID} .codex-daily-range-endpoint.is-selected{border-color:var(--blue);background:color-mix(in srgb,var(--blue) 4%,transparent)}
      #${PANEL_ID} .codex-daily-range-endpoint>span{color:var(--muted);font-size:10px}
      #${PANEL_ID} .codex-daily-range-date{display:flex;align-items:center;justify-content:space-between;gap:4px;width:100%;min-width:0;padding:3px 0;font-size:11px}
      #${PANEL_ID} .codex-daily-range-date svg{width:13px;height:13px;flex-shrink:0;color:var(--muted)}
      #${PANEL_ID} .codex-daily-range-time{display:flex;align-items:center;gap:7px;min-width:0;height:30px;padding:0 7px;border-radius:5px;background:var(--hover);font-size:12px;font-weight:600;font-variant-numeric:tabular-nums}
      #${PANEL_ID} .codex-daily-range-time svg{width:13px;height:13px;flex-shrink:0;color:var(--blue)}
      #${PANEL_ID} .codex-daily-range-time svg:last-child{width:11px;margin-left:auto;color:var(--muted)}
      #${PANEL_ID} .codex-daily-range-time[aria-expanded=true]{background:color-mix(in srgb,var(--blue) 12%,var(--bg));box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--blue) 30%,transparent)}
      #${PANEL_ID} .codex-daily-time-picker{display:grid;grid-template-columns:minmax(0,1fr) 16px minmax(0,1fr);gap:5px;padding:0 12px 4px}
      #${PANEL_ID} .codex-daily-time-column{min-width:0;text-align:center}
      #${PANEL_ID} .codex-daily-time-column>span{display:block;padding-bottom:8px;color:var(--muted);font-size:10px}
      #${PANEL_ID} .codex-daily-time-column [role=listbox]{position:relative;height:168px;overflow-y:auto;overscroll-behavior:contain;scrollbar-width:thin;scrollbar-color:var(--muted) transparent;border-top:1px solid var(--line);border-bottom:1px solid var(--line);padding:3px}
      #${PANEL_ID} .codex-daily-time-column button{display:block;width:100%;height:28px;margin:2px 0;border-radius:4px;font-size:12px;font-variant-numeric:tabular-nums}
      #${PANEL_ID} .codex-daily-time-column button[aria-selected=true]{color:var(--blue);background:color-mix(in srgb,var(--blue) 14%,transparent);font-weight:700}
      #${PANEL_ID} .codex-daily-time-separator{align-self:center;text-align:center;padding-top:18px;font-size:16px;font-weight:600;color:var(--muted)}
      #${PANEL_ID} .codex-daily-range-validation{font-size:10px;color:var(--muted)}
      #${PANEL_ID} .codex-daily-command{border:1px solid var(--line);border-radius:4px;padding:5px 8px;white-space:nowrap}
      #${PANEL_ID} .codex-daily-command:hover{background:var(--hover)}
      #${PANEL_ID} .codex-daily-scroll-body{flex:1 1 auto;min-height:0;padding:14px 14px 0;overflow-x:hidden;overflow-y:auto;overflow-anchor:none;overscroll-behavior:contain;scrollbar-width:thin;scrollbar-color:var(--line) transparent;scrollbar-gutter:stable;scroll-padding-bottom:42px}
      #${PANEL_ID} .codex-daily-resize{flex:0 0 7px;cursor:ns-resize;touch-action:none;display:grid;place-items:center}
      #${PANEL_ID} .codex-daily-resize::after{content:"";width:32px;height:2px;border-radius:2px;background:var(--line)}
      #${PANEL_ID} .codex-daily-resize:hover::after,#${PANEL_ID} .codex-daily-resize:focus-visible::after{background:var(--muted)}
      #${PANEL_ID} .codex-daily-resize:focus-visible{outline:2px solid var(--accent);outline-offset:-2px}
      #${PANEL_ID} .codex-daily-summary{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin:2px 0 12px}
      #${PANEL_ID} .codex-daily-total-block{flex:1 1 auto;min-width:0}
      #${PANEL_ID} .codex-daily-total-label,#${PANEL_ID} .codex-daily-cost-label{color:var(--muted);font-size:11px;font-weight:600}
      #${PANEL_ID} .codex-daily-total-heading,#${PANEL_ID} .codex-daily-cost-heading{display:flex;align-items:center;gap:4px;min-height:24px;margin-bottom:2px}
      #${PANEL_ID} .codex-daily-number-format{padding:0;flex:0 0 24px}
      #${PANEL_ID} .codex-daily-number-format svg{width:13px;height:13px}
      #${PANEL_ID} .codex-daily-number-format[aria-pressed=true]{color:var(--blue)}
      #${PANEL_ID} .codex-daily-number-format:disabled{opacity:.45}
      #${PANEL_ID} .codex-daily-hero{min-width:0;overflow-wrap:anywhere;font-size:26px;line-height:1.15;font-weight:750;font-variant-numeric:tabular-nums}
      #${PANEL_ID} .codex-daily-cost{flex:none;display:flex;flex-direction:column;align-items:flex-end}
      #${PANEL_ID} .codex-daily-cost-partial{padding:0 4px;border-radius:3px;background:var(--hover);color:var(--muted);font-size:10px;line-height:14px}
      #${PANEL_ID} .codex-daily-cost-value{padding:3px 8px;border:1px solid rgba(74,144,226,.22);border-radius:6px;background:rgba(74,144,226,.1);font-size:18px;line-height:1.22;font-weight:750;color:var(--blue);white-space:nowrap;font-variant-numeric:tabular-nums}
      #${PANEL_ID} .codex-daily-cost-label{white-space:nowrap}
      #${PANEL_ID} .codex-daily-grid{display:grid;grid-template-columns:1fr auto;gap:8px 16px;padding:11px 0 5px;border-top:1px solid var(--line);font-size:12px}
      #${PANEL_ID} .codex-daily-grid .codex-daily-label{color:var(--muted)}
      #${PANEL_ID} .codex-daily-value{font-variant-numeric:tabular-nums;text-align:right;font-weight:550}
      #${PANEL_ID} [data-token-number]{cursor:pointer;border-radius:3px}
      #${PANEL_ID} [data-token-number]:hover{color:var(--blue)}
      #${PANEL_ID} [data-token-number]:focus-visible{outline:2px solid var(--blue);outline-offset:2px}
      #${PANEL_ID} .codex-daily-section{border-top:1px solid var(--line);padding:12px 0 0;margin:12px 0 0}
      #${PANEL_ID} .codex-daily-subagents{border-top:0;border-bottom:1px solid var(--line);margin:0;padding:0 0 5px}
      #${PANEL_ID} .codex-daily-subagents>summary{display:flex;align-items:center;justify-content:space-between;padding:6px 0;min-height:26px;color:var(--muted);text-align:left;font-size:12px;font-weight:400}
      #${PANEL_ID} .codex-daily-subagent-label{display:inline-flex;align-items:center;gap:7px}
      #${PANEL_ID} .codex-daily-subagent-label::after{content:"";width:5px;height:5px;border-right:1.4px solid currentColor;border-top:1.4px solid currentColor;transform:rotate(45deg)}
      #${PANEL_ID} .codex-daily-subagents[open] .codex-daily-subagent-label::after{transform:rotate(135deg)}
      #${PANEL_ID} .codex-daily-subagent-totals{display:inline-flex;align-items:baseline;gap:7px;font-size:12px;font-variant-numeric:tabular-nums}
      #${PANEL_ID} .codex-daily-subagent-totals i{font-style:normal;opacity:.5}
      #${PANEL_ID} .codex-daily-subagent-content .codex-daily-grid{border:0;padding:2px 0 8px 12px}
      #${PANEL_ID} .codex-daily-section-head{display:flex;align-items:center;gap:8px;font-size:11px;font-weight:650}
      #${PANEL_ID} .codex-daily-section-meta{margin-left:auto;color:var(--muted);font-weight:400;font-size:11px}
      #${PANEL_ID} .codex-daily-trend{position:relative;margin-top:11px;padding:10px 11px 9px;border:1px solid var(--line);border-radius:10px;background:var(--hover)}
      #${PANEL_ID} .codex-daily-trend-peak{display:block;margin:6px 0 4px;min-height:14px;font-size:10px;color:var(--muted);font-variant-numeric:tabular-nums}
      #${PANEL_ID} .codex-daily-trend-plot{--trend-gutter:16px}
      #${PANEL_ID} .codex-daily-trend-plot[data-period=week]{--trend-gutter:9px}
      #${PANEL_ID} .codex-daily-trend-plot[data-long-ticks=true]{--trend-gutter:37px}
      #${PANEL_ID} .codex-daily-trend-svg{display:block;width:calc(100% - 2 * var(--trend-gutter));height:82px;margin-inline:var(--trend-gutter);overflow:visible}
      #${PANEL_ID} .codex-daily-trend-labels{position:relative;height:14px;margin-top:4px;color:var(--muted);font-size:10px;font-variant-numeric:tabular-nums}
      #${PANEL_ID} .codex-daily-trend-labels[data-period=week]{font-size:9px}
      #${PANEL_ID} .codex-daily-trend-labels span{position:absolute;transform:translateX(-50%);white-space:nowrap}
      #${PANEL_ID} .codex-daily-trend-tooltip{position:absolute;z-index:3;box-sizing:border-box;width:190px;max-width:calc(100% - 16px);padding:8px 9px;border:1px solid var(--line);border-radius:6px;background:var(--bg);box-shadow:0 4px 14px #00000024;pointer-events:none;font-size:10px;font-variant-numeric:tabular-nums}
      #${PANEL_ID} .codex-daily-trend-tooltip[hidden]{display:none}
      #${PANEL_ID} .codex-daily-trend-tooltip-time{margin-bottom:5px;color:var(--muted);white-space:nowrap}
      #${PANEL_ID} .codex-daily-trend-tooltip-row{display:flex;justify-content:space-between;gap:12px;line-height:1.6}
      #${PANEL_ID} .codex-daily-trend-tooltip-row span{color:var(--muted)}
      #${PANEL_ID} .codex-daily-trend-switch{position:relative;display:grid;grid-template-columns:1fr 1fr;flex:0 0 106px;height:26px;margin-left:auto;padding:2px;border:1px solid var(--line);border-radius:7px;background:var(--tertiary);isolation:isolate}
      #${PANEL_ID} .codex-daily-trend-switch::before{content:"";position:absolute;z-index:-1;inset:2px auto 2px 2px;width:calc((100% - 4px)/2);border-radius:4px;background:var(--selected);box-shadow:0 1px 3px #0000001f;transition:transform 160ms ease}
      #${PANEL_ID} .codex-daily-trend-switch[data-metric=cost]::before{transform:translateX(100%)}
      #${PANEL_ID} .codex-daily-trend-switch button{min-width:0;color:var(--muted);padding:0 5px;border-radius:4px;font-size:10px;font-weight:550}
      #${PANEL_ID} .codex-daily-trend-switch button[aria-pressed=true]{color:var(--text);font-weight:650}
      @media(prefers-reduced-motion:reduce){#${PANEL_ID} .codex-daily-trend-switch::before{transition:none}}
      #${PANEL_ID} details>summary{cursor:pointer;list-style:none}
      #${PANEL_ID} details>summary::-webkit-details-marker{display:none}
      #${PANEL_ID} .codex-daily-models>summary{min-height:28px;border-radius:4px}
      #${PANEL_ID} .codex-daily-models>summary:hover{background:var(--hover)}
      #${PANEL_ID} .codex-daily-models>summary:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
      #${PANEL_ID} .codex-daily-models>summary::after{content:"";width:5px;height:5px;flex:none;border-right:1.4px solid var(--muted);border-top:1.4px solid var(--muted);transform:rotate(45deg);margin:0 4px}
      #${PANEL_ID} .codex-daily-models[open]>summary::after{transform:rotate(135deg)}
      #${PANEL_ID} .codex-daily-model{padding-top:5px}
      #${PANEL_ID} .codex-daily-model summary{display:flex;align-items:center;gap:8px;padding:4px 0;font-size:11px}
      #${PANEL_ID} .codex-daily-model summary::before,#${PANEL_ID} .codex-daily-tools>summary::before{content:"";width:5px;height:5px;flex:none;border-right:1.4px solid var(--muted);border-top:1.4px solid var(--muted);transform:rotate(45deg);margin:0 3px 1px 2px}
      #${PANEL_ID} .codex-daily-model[open] summary::before,#${PANEL_ID} .codex-daily-tools[open]>summary::before{transform:rotate(135deg)}
      #${PANEL_ID} .codex-daily-model-bar{height:5px;margin:2px 0 7px;border-radius:3px;background:var(--tertiary);overflow:hidden}
      #${PANEL_ID} .codex-daily-model-bar i{display:block;height:100%;background:linear-gradient(90deg,#3ba7ff,#8d6bff);border-radius:inherit}
      #${PANEL_ID} .codex-daily-model-name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:600}
      #${PANEL_ID} .codex-daily-model-actions{display:flex;align-items:center;gap:3px;flex-shrink:0}
      #${PANEL_ID} .codex-daily-model-actions button{display:grid;place-items:center;width:25px;height:25px;padding:0;border-radius:4px;color:var(--muted)}
      #${PANEL_ID} .codex-daily-model-actions button:hover{color:var(--text);background:var(--hover)}
      #${PANEL_ID} .codex-daily-model-actions svg{width:15px;height:15px}
      #${PANEL_ID} .codex-daily-model-total{margin-left:auto;white-space:nowrap;font-variant-numeric:tabular-nums}
      #${PANEL_ID} .codex-daily-model .codex-daily-cost-partial{margin-inline-start:4px}
      #${PANEL_ID} .codex-daily-model-parts{padding:0 0 3px 12px;margin:0 0 3px 3px}
      #${PANEL_ID} .codex-daily-model-part{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:12px;padding:2px 0;color:var(--muted);font-size:11px;line-height:17px;font-variant-numeric:tabular-nums}
      #${PANEL_ID} .codex-daily-model-part span:first-child{overflow:hidden;text-overflow:ellipsis}
      #${PANEL_ID} .codex-daily-model-role{--role-accent:#377e93;border-left:2px solid color-mix(in srgb,var(--role-accent) 45%,transparent);padding-left:8px}
      #${PANEL_ID} .codex-daily-model-role[data-role=subagent]{--role-accent:#a27346}
      #${PANEL_ID} .codex-daily-model-role+.codex-daily-model-role{margin-top:4px}
      #${PANEL_ID} .codex-daily-model-role-head{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:10px;font-size:11px;line-height:18px;font-weight:600;padding:1px 0;font-variant-numeric:tabular-nums}
      #${PANEL_ID} .codex-daily-model-role-label{display:inline-flex;align-items:center;gap:5px}
      #${PANEL_ID} .codex-daily-model-role-label svg{width:12px;height:12px;flex-shrink:0;color:var(--role-accent)}
      #${PANEL_ID} .codex-daily-tools{margin:18px -14px 0;padding:0 14px;border-top:1px solid var(--line)}
      #${PANEL_ID} .codex-daily-tools>summary{display:flex;align-items:center;min-height:44px;margin:0 -14px;padding:10px 14px;font-size:13px;font-weight:650;background:var(--hover)}
      #${PANEL_ID} .codex-daily-tools>summary:hover{background:var(--tertiary)}
      #${PANEL_ID} .codex-daily-tools>summary:focus-visible{outline:2px solid var(--accent);outline-offset:-2px}
      #${PANEL_ID} .codex-daily-tools>summary::before{order:3;margin:0 2px}
      #${PANEL_ID} .codex-daily-tools>summary .codex-daily-section-meta{font-weight:500;font-variant-numeric:tabular-nums}
      #${PANEL_ID} .codex-daily-activity-categories{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin:12px 0 10px}
      #${PANEL_ID} .codex-daily-activity-categories button{position:relative;display:grid;grid-template-columns:16px minmax(0,1fr);grid-template-rows:17px 15px;align-items:center;min-width:0;min-height:54px;padding:7px 8px;gap:2px 5px;text-align:left;font-size:11px;border:1px solid var(--line);border-radius:7px;background:var(--hover)}
      #${PANEL_ID} [data-kind=skill]{--activity-accent:var(--accent)}
      #${PANEL_ID} [data-kind=plugin]{--activity-accent:var(--blue)}
      #${PANEL_ID} [data-kind=tool]{--activity-accent:var(--warn)}
      #${PANEL_ID} .codex-daily-activity-categories button:hover,#${PANEL_ID} .codex-daily-activity-categories button[aria-pressed=true]{border-color:var(--activity-accent)}
      #${PANEL_ID} .codex-daily-activity-categories button[aria-pressed=true]{background:color-mix(in srgb,var(--activity-accent) 8%,transparent)}
      #${PANEL_ID} .codex-daily-activity-categories button[aria-pressed=true]::after{content:"";position:absolute;left:12px;right:12px;bottom:-1px;height:2px;background:var(--activity-accent);border-radius:1px}
      #${PANEL_ID} .codex-daily-category-symbol{display:flex;align-items:center;color:var(--activity-accent)}
      #${PANEL_ID} .codex-daily-category-symbol svg{width:16px;height:16px}
      #${PANEL_ID} .codex-daily-category-name{grid-column:1 / -1;grid-row:2;font-weight:600;white-space:nowrap}
      #${PANEL_ID} .codex-daily-activity-categories strong{grid-column:2;grid-row:1;min-width:0;overflow:hidden;text-overflow:ellipsis;text-align:right;font-size:15px;line-height:1;font-weight:600;font-variant-numeric:tabular-nums}
      #${PANEL_ID} .codex-daily-execution-view{position:relative;height:${EXECUTION_ROW_HEIGHT * 6 + 28}px;display:flex;flex-direction:column;overflow:clip}
      #${PANEL_ID} .codex-daily-execution-view.is-grouped{height:${ACTIVITY_ROW_HEIGHT * 6}px}
      #${PANEL_ID} .codex-daily-activity-list{position:relative;flex:1;min-height:0;overflow:auto;overscroll-behavior:contain;scrollbar-width:thin;scrollbar-color:var(--line) transparent}
      #${PANEL_ID} .codex-daily-activity-list[hidden]{display:none}
      #${PANEL_ID} .codex-daily-activity-canvas{position:relative}
      #${PANEL_ID} .codex-daily-activity-row{position:absolute;left:0;right:0;display:grid;grid-template-columns:minmax(0,1fr) auto;align-content:start;gap:3px 8px;font-size:11px;padding-top:3px;height:${ACTIVITY_ROW_HEIGHT}px}
      #${PANEL_ID} .codex-daily-activity-name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      #${PANEL_ID} .codex-daily-activity-namespace{color:var(--muted);font-size:10px;margin-right:5px}
      #${PANEL_ID} .codex-daily-activity-timeline{grid-column:1 / -1;position:relative;height:16px;border-radius:2px;background:var(--hover);overflow:hidden}
      #${PANEL_ID} .codex-daily-activity-timeline svg{display:block;width:100%;height:16px;stroke:var(--accent);stroke-width:2;stroke-linecap:butt}
      #${PANEL_ID} .codex-daily-activity-row.is-plugin svg{stroke:var(--blue)}
      #${PANEL_ID} .codex-daily-activity-timeline:focus-visible{outline:2px solid var(--blue);outline-offset:2px}
      #${PANEL_ID} .codex-daily-activity-timeline.is-inspecting .codex-daily-activity-marks{opacity:.3}
      #${PANEL_ID} .codex-daily-activity-focus{stroke-width:3;vector-effect:non-scaling-stroke}
      #${PANEL_ID} .codex-daily-activity-focus-band{stroke-width:9;opacity:.18;vector-effect:non-scaling-stroke}
      #${PANEL_ID} .codex-daily-activity-hover{position:absolute;z-index:6;box-sizing:border-box;width:280px;max-width:calc(100% - 24px);padding:11px 12px;border-radius:8px;background:var(--bg);box-shadow:0 6px 24px #00000030,0 0 0 1px var(--line);color:var(--text);pointer-events:none;--activity-accent:var(--accent)}
      #${PANEL_ID} .codex-daily-activity-hover.is-plugin{--activity-accent:var(--blue)}
      #${PANEL_ID} .codex-daily-activity-hover[hidden]{display:none}
      #${PANEL_ID} .codex-daily-activity-hover-head{display:flex;align-items:baseline;gap:10px;margin-bottom:8px}
      #${PANEL_ID} .codex-daily-activity-hover-identity{flex:1;min-width:0}
      #${PANEL_ID} .codex-daily-activity-hover-name{display:block;font-size:12px;font-weight:650;line-height:1.4;overflow-wrap:anywhere}
      #${PANEL_ID} .codex-daily-activity-hover-namespace{display:block;margin-top:2px;color:var(--muted);font-size:10px;overflow-wrap:anywhere}
      #${PANEL_ID} .codex-daily-activity-hover-kind{flex:none;color:var(--muted);font-size:10px}
      #${PANEL_ID} .codex-daily-activity-hover-item{display:grid;grid-template-columns:3px minmax(0,1fr) auto;align-items:center;gap:8px;padding:7px 0;border-top:1px solid var(--line);font-size:11px;line-height:16px;font-variant-numeric:tabular-nums}
      #${PANEL_ID} .codex-daily-activity-hover-item::before{content:"";height:10px;border-radius:1px;background:var(--activity-accent)}
      #${PANEL_ID} .codex-daily-activity-hover-item time{overflow-wrap:anywhere}
      #${PANEL_ID} .codex-daily-activity-hover-item small{margin-left:4px;color:var(--muted);font-size:10px}
      #${PANEL_ID} .codex-daily-activity-hover-item strong{white-space:nowrap;font-weight:600}
      #${PANEL_ID} .codex-daily-timeline-axis{position:sticky;bottom:0;z-index:2;display:flex;justify-content:space-between;gap:8px;height:28px;align-items:center;border-top:1px solid var(--line);background:var(--bg);color:var(--muted);font-size:10px;font-variant-numeric:tabular-nums}
      #${PANEL_ID} .codex-daily-timeline-axis span{min-width:0;white-space:nowrap}
      #${PANEL_ID} .codex-daily-timeline-axis span:last-child{text-align:right}
      #${PANEL_ID} .codex-daily-timeline-axis[hidden]{display:none}
      #${PANEL_ID} .codex-daily-execution-header{display:flex;gap:8px;align-items:center;margin-bottom:6px}
      #${PANEL_ID} .codex-daily-execution-search{width:100%;height:27px;font-size:11px;background:var(--hover)}
      #${PANEL_ID} .codex-daily-execution-search-scope{margin-bottom:6px;color:var(--muted);font-size:11px}
      #${PANEL_ID} .codex-daily-execution-list{position:relative;flex:1;min-height:0;overflow-y:auto;overflow-anchor:none;overscroll-behavior:contain;scrollbar-width:thin;scrollbar-gutter:stable;scrollbar-color:var(--line) transparent}
      #${PANEL_ID} .codex-daily-execution-list[hidden]{display:none}
      #${PANEL_ID} .codex-daily-execution-canvas{position:relative;width:100%}
      #${PANEL_ID} .codex-daily-execution-row{position:absolute;left:0;right:0;border-top:1px solid var(--line);overflow:hidden}
      #${PANEL_ID} .codex-daily-execution-toggle{display:flex;align-items:center;gap:7px;width:100%;height:${EXECUTION_ROW_HEIGHT}px;text-align:left;padding:0 3px}
      #${PANEL_ID} .codex-daily-execution-toggle:hover{background:var(--hover)}
      #${PANEL_ID} .codex-daily-execution-title{display:grid;gap:2px;min-width:0;overflow:hidden;white-space:nowrap;flex:1;font-size:11px;line-height:15px}
      #${PANEL_ID} .codex-daily-execution-name{overflow:hidden;text-overflow:ellipsis;font-weight:650}
      #${PANEL_ID} .codex-daily-execution-preview{min-height:15px;overflow:hidden;text-overflow:ellipsis;color:var(--muted);font-weight:400}
      #${PANEL_ID} .codex-daily-execution-meta{display:grid;justify-items:end;gap:2px;line-height:15px}
      #${PANEL_ID} .codex-daily-execution-toggle>svg{width:12px;height:12px;flex:none;color:var(--muted)}
      #${PANEL_ID} .is-expanded .codex-daily-execution-toggle>svg{transform:rotate(90deg)}
      #${PANEL_ID} .codex-daily-execution-time{color:var(--muted);font-size:10px;white-space:nowrap}
      #${PANEL_ID} .codex-daily-execution-detail{height:174px;overflow:auto;padding:4px 8px;color:var(--text);background:var(--hover)}
      #${PANEL_ID} .codex-daily-execution-detail-label{display:block;color:var(--muted);font-size:10px}
      #${PANEL_ID} .codex-daily-detail-header{position:sticky;top:-4px;z-index:1;display:flex;align-items:center;gap:6px;background:var(--hover)}
      #${PANEL_ID} .codex-daily-detail-pager{display:flex;align-items:center;gap:4px;margin-left:auto;color:var(--muted);font-size:10px}
      #${PANEL_ID} .codex-daily-detail-pager button{width:22px;height:22px}
      #${PANEL_ID} .codex-daily-detail-pager button:disabled{opacity:.4}
      #${PANEL_ID} .codex-daily-detail-pager svg{width:14px;height:14px}
      #${PANEL_ID} .codex-daily-detail-pager input{width:54px;padding:2px 3px}
      #${PANEL_ID} .codex-daily-execution-detail pre{margin:2px 0 7px;white-space:pre;overflow-x:auto;font:11px/1.4 ui-monospace,monospace}
      #${PANEL_ID} .codex-daily-execution-hover{position:absolute;z-index:6;max-width:calc(100% - 24px);width:290px;padding:8px 10px;border:1px solid var(--line);border-radius:6px;background:var(--bg);box-shadow:0 4px 14px #00000024;color:var(--text);font-size:10px;line-height:1.55;overflow-wrap:anywhere;pointer-events:none}
      #${PANEL_ID} .codex-daily-execution-hover[hidden]{display:none}
      #${PANEL_ID} .codex-daily-execution-hover span{color:var(--muted)}
      #${PANEL_ID} .codex-daily-execution-empty{padding:12px 0;text-align:center;color:var(--muted)}
      #${PANEL_ID} .codex-daily-image-output{min-height:96px;color:var(--muted);font-size:11px;overflow-wrap:anywhere}
      #${PANEL_ID} .codex-daily-image-preview{display:block;width:100%;height:112px;padding:4px;border:1px solid var(--line);border-radius:6px;background:var(--hover);cursor:zoom-in}
      #${PANEL_ID} .codex-daily-image-preview img{display:block;width:100%;height:100%;object-fit:contain}
      #${PANEL_ID} .codex-daily-image-preview:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
      #${PANEL_ID} .codex-daily-execution-view>.codex-daily-execution-empty{position:absolute;inset:0 0 28px;display:grid;place-items:center;padding:16px}
      #${PANEL_ID} .codex-daily-execution-view>.codex-daily-execution-empty[hidden]{display:none}
      #${PANEL_ID} .codex-daily-pager{display:flex;justify-content:space-between;align-items:center;gap:6px;flex:0 0 28px;margin-top:auto;color:var(--muted);font-size:10px}
      #${PANEL_ID} .codex-daily-pager[hidden],#${PANEL_ID} .codex-daily-pager button[hidden]{display:none}
      #${PANEL_ID} .codex-daily-pager button:disabled{opacity:.4;cursor:default}
      #${PANEL_ID} .codex-daily-execution-days{border-top:1px solid var(--line);margin-top:8px;padding-top:8px}
      #${PANEL_ID} .codex-daily-execution-days-head{font-weight:600}
      #${PANEL_ID} .codex-daily-execution-days-note{color:var(--muted);font-size:11px;margin:4px 0}
      #${PANEL_ID} .codex-daily-execution-days-list{position:relative;overflow-y:auto;overscroll-behavior:contain;max-height:140px}
      #${PANEL_ID} .codex-daily-execution-days-canvas{position:relative}
      #${PANEL_ID} .codex-daily-execution-day{position:absolute;left:0;right:0;display:flex;align-items:center;justify-content:space-between;gap:8px;height:28px;border-top:1px solid var(--line);font-variant-numeric:tabular-nums}
      #${PANEL_ID} .codex-daily-execution-day span:last-child{color:var(--muted);text-align:right}
      #${PANEL_ID} .codex-daily-price-add{display:flex;gap:6px;margin:9px 0}
      #${PANEL_ID} .codex-daily-price-add input{flex:1}
      #${PANEL_ID} .codex-daily-price-row{padding:8px 0;border-top:1px solid var(--line)}
      #${PANEL_ID} .codex-daily-price-title{display:flex;gap:8px;align-items:center}
      #${PANEL_ID} .codex-daily-price-title strong{flex:1;overflow:hidden;text-overflow:ellipsis}
      #${PANEL_ID} .codex-daily-price-title select{max-width:155px}
      #${PANEL_ID} .codex-daily-price-fields{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px;margin:6px 0}
      #${PANEL_ID} .codex-daily-price-fields label{display:grid;gap:3px;color:var(--muted);font-size:10px}
      #${PANEL_ID} .codex-daily-price-fields input{width:100%;font-size:12px}
      #${PANEL_ID} .codex-daily-price-actions{display:flex;gap:5px}
      #${PANEL_ID} .codex-daily-foot{display:flex;align-items:center;justify-content:space-between;gap:10px;margin:11px -14px 0;border-top:1px solid var(--line);padding:10px 14px 14px;background:var(--bg);color:var(--muted);font-size:11px}
      #${PANEL_ID} .codex-daily-tools[open]:has(.codex-daily-timeline-axis:not([hidden])) + .codex-daily-price-panel[hidden] + .codex-daily-foot{margin-top:0;padding-top:21px}
      #${PANEL_ID} .codex-daily-foot-status{display:grid;gap:2px;min-width:0}
      #${PANEL_ID} .codex-daily-share{display:flex;align-items:center;gap:5px;flex:none;min-height:28px;padding:0 10px;border:1px solid var(--line);border-radius:8px;background:var(--hover);color:var(--text);font-size:11px}
      #${PANEL_ID} .codex-daily-share svg{width:14px;height:14px}
      #${PANEL_ID} .codex-daily-share:hover{color:var(--text);background:var(--hover)}
      #${PANEL_ID} .codex-daily-share[data-state=success]{color:var(--accent)}
      #${PANEL_ID} .codex-daily-share[data-state=error]{color:var(--warn)}
      #${PANEL_ID} .codex-daily-share:disabled{opacity:.6}
      #${PANEL_ID} .codex-daily-updated{white-space:nowrap}
      #${PANEL_ID} input,#${PANEL_ID} select{caret-color:var(--text)}
      #${PANEL_ID} input::placeholder{color:var(--muted);opacity:1}
      #${PANEL_ID} .codex-daily-status[data-warning=true]{color:var(--warn)}
      #${PANEL_ID} .codex-daily-status::before{content:"";display:inline-block;width:5px;height:5px;margin-right:5px;vertical-align:1px;border-radius:50%;background:var(--accent)}
      #${PANEL_ID} .codex-daily-status[data-warning=true]::before{background:var(--warn)}
      @media(max-width:420px){#${PANEL_ID} .codex-daily-period{padding:8px;gap:3px}#${PANEL_ID} .codex-daily-period-tabs button{padding:4px 5px}#${PANEL_ID} .codex-daily-date-select{gap:4px;font-size:10px}#${PANEL_ID} .codex-daily-date-nav>.codex-daily-icon{width:18px}}
      @media(max-width:360px){#${PANEL_ID} .codex-daily-summary{align-items:stretch;flex-direction:column;gap:8px}#${PANEL_ID} .codex-daily-cost{align-items:flex-start}#${PANEL_ID} .codex-daily-activity-categories button{padding:9px 7px}}
    `;
    (document.head || document.documentElement).appendChild(style);
  }

  function createRoot() {
    root = document.createElement("div");
    root.id = ROOT_ID;
    root.setAttribute("data-codex-plus-ext", "codex-daily-token-usage");
    root.dataset.dailyBuild = BUILD_ID;
    root.innerHTML = `<button class="codex-daily-trigger" type="button" aria-expanded="false" aria-label="查看今日 Token 用量">
      <svg class="codex-daily-brand" viewBox="0 0 64 64" fill="none" aria-hidden="true">
        <defs><linearGradient id="codex-daily-brand-trend" x1="12" y1="45" x2="52" y2="28" gradientUnits="userSpaceOnUse"><stop stop-color="#00b9c5"/><stop offset=".5" stop-color="#3988ff"/><stop offset="1" stop-color="#a56bed"/></linearGradient></defs>
        <rect x="5" y="9" width="54" height="47" rx="9" stroke="currentColor" opacity=".45"/>
        <path d="M7 23.5h50" stroke="currentColor" opacity=".25"/>
        <circle cx="14.5" cy="17.5" r="1.6" fill="#808890"/>
        <circle cx="21.5" cy="17.5" r="1.6" fill="#00b9c5"/>
        <circle cx="28.5" cy="17.5" r="1.6" fill="#8b79ed"/>
        <path d="M12 45C18 45 17 32 24 33S33 44 39 36S45 27 52 28V50H12Z" fill="url(#codex-daily-brand-trend)" opacity=".1"/>
        <path d="M12 45C18 45 17 32 24 33S33 44 39 36S45 27 52 28" stroke="url(#codex-daily-brand-trend)" stroke-width="2.8" stroke-linecap="round"/>
        <g fill="var(--bg)" stroke="url(#codex-daily-brand-trend)" stroke-width="1.8"><circle cx="12" cy="45" r="2.4"/><circle cx="24" cy="33" r="2.4"/><circle cx="52" cy="28" r="2.4"/></g>
      </svg><span class="codex-daily-label">今日</span><span class="codex-daily-total">—</span>
    </button>`;
    panel = document.createElement("section");
    panel.id = PANEL_ID;
    panel.setAttribute("data-codex-plus-ext", "codex-daily-token-usage");
    panel.setAttribute("aria-label", "Token 用量明细");
    panel.innerHTML = `
      <div class="codex-daily-heading">
        <button class="codex-daily-icon" type="button" data-action="pin-panel" aria-label="置顶面板" aria-pressed="false" title="置顶面板"><svg viewBox="0 0 24 24"><path d="M16 3v5l4 4v3H4v-3l4-4V3M9 3h6m-3 12v7"/></svg></button>
        <button class="codex-daily-icon" type="button" data-action="cycle-theme" aria-label="切换主题"></button>
        <span class="codex-daily-title">Token 用量</span>
        <button class="codex-daily-head-button codex-daily-price-toggle" type="button" data-action="toggle-prices" aria-expanded="false">价格</button>
        <button class="codex-daily-head-button codex-daily-session-scope" type="button" data-action="toggle-session-scope" aria-label="切换会话范围"><span>全部会话</span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16m-4-4 4 4-4 4M20 17H4m4-4-4 4 4 4"/></svg></button>
      </div>
      <div class="codex-daily-period">
        <div class="codex-daily-period-tabs" role="group" aria-label="统计周期">
          <button type="button" data-period="day" aria-pressed="true">日</button>
          <button type="button" data-period="week" aria-pressed="false">周</button>
          <button type="button" data-period="month" aria-pressed="false">月</button>
          <button type="button" data-period="custom" aria-pressed="false">自定义</button>
        </div>
        <span class="codex-daily-date-nav">
          <button class="codex-daily-icon" type="button" data-action="previous-day" aria-label="上一个周期"><svg viewBox="0 0 24 24"><path d="m15 18-6-6 6-6"/></svg></button>
          <button class="codex-daily-date-select" type="button" data-action="toggle-calendar" aria-haspopup="dialog" aria-expanded="false"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 2v4m8-4v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z"/></svg><span></span></button>
          <input class="codex-daily-date-input" type="date" aria-label="选择统计日期" hidden>
          <button class="codex-daily-icon" type="button" data-action="next-day" aria-label="下一个周期"><svg viewBox="0 0 24 24"><path d="m9 18 6-6-6-6"/></svg></button>
        </span>
      </div>
      <div class="codex-daily-calendar" role="dialog" aria-label="选择统计周期" hidden></div>
      <div class="codex-daily-scroll-body">
        <div class="codex-daily-summary">
          <div class="codex-daily-total-block">
            <div class="codex-daily-total-heading"><span class="codex-daily-total-label">累计 Token</span><button class="codex-daily-icon codex-daily-number-format" type="button" data-action="toggle-number-format" aria-label="缩写 Token 数值" aria-pressed="true"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9h16m-16 6h16M10 3 8 21M16 3l-2 18"/></svg></button></div>
            <div class="codex-daily-hero" data-token-number role="button" tabindex="0" title="切换为金额">—</div>
          </div>
          <div class="codex-daily-cost">
            <div class="codex-daily-cost-heading"><span class="codex-daily-cost-label">估算金额</span><span class="codex-daily-cost-partial" title="仅包含有价格的用量" hidden>部分</span></div>
            <span class="codex-daily-cost-value" data-field="cost">—</span>
          </div>
        </div>
        <div class="codex-daily-grid">
          <span class="codex-daily-label" data-label="input">输入 Token</span><span class="codex-daily-value" data-field="input" data-token-number role="button" tabindex="0" title="切换为金额">—</span>
          <span class="codex-daily-label" data-label="output">输出 Token</span><span class="codex-daily-value" data-field="output" data-token-number role="button" tabindex="0" title="切换为金额">—</span>
          <span class="codex-daily-label" data-label="cached">缓存输入</span><span class="codex-daily-value" data-field="cached" data-token-number role="button" tabindex="0" title="切换为金额">—</span>
          <span class="codex-daily-label">用量记录</span><span class="codex-daily-value" data-field="calls">—</span>
        </div>
        <details class="codex-daily-section codex-daily-subagents"><summary class="codex-daily-section-head"><span class="codex-daily-subagent-label">子智能体</span><span class="codex-daily-section-meta" data-field="subagentTotal">—</span></summary><div class="codex-daily-subagent-content"></div></details>
        <div class="codex-daily-section codex-daily-trend">
          <div class="codex-daily-section-head">范围趋势<div class="codex-daily-trend-switch" role="group" aria-label="趋势指标"><button type="button" data-trend-metric="tokens">Token</button><button type="button" data-trend-metric="cost">费用</button></div></div>
          <div class="codex-daily-trend-peak"></div><div class="codex-daily-trend-plot"><svg class="codex-daily-trend-svg" viewBox="0 0 ${TREND_WIDTH} 82" preserveAspectRatio="none" role="img" aria-label="范围趋势"></svg><div class="codex-daily-trend-labels"></div></div><div class="codex-daily-trend-tooltip" role="tooltip" hidden><div class="codex-daily-trend-tooltip-time"></div><div class="codex-daily-trend-tooltip-row"><span>Token</span><strong data-trend-tokens></strong></div><div class="codex-daily-trend-tooltip-row"><span>估算金额</span><strong data-trend-cost></strong></div></div>
        </div>
        <details class="codex-daily-section codex-daily-models" open><summary class="codex-daily-section-head">按 Model 分布<span class="codex-daily-section-meta" data-field="modelMeta"></span><span class="codex-daily-model-actions"><button type="button" data-action="expand-models" title="展开全部模型" aria-label="展开全部模型"><svg viewBox="0 0 24 24"><path d="m7 15 5 5 5-5m-10-6 5-5 5 5"/></svg></button><button type="button" data-action="collapse-models" title="折叠全部模型" aria-label="折叠全部模型"><svg viewBox="0 0 24 24"><path d="m7 20 5-5 5 5m-10-16 5 5 5-5"/></svg></button></span></summary><div class="codex-daily-model-list"></div></details>
        <details class="codex-daily-section codex-daily-tools">
          <summary class="codex-daily-section-head">工具调用<span class="codex-daily-section-meta" data-field="toolMeta"></span></summary>
          <div class="codex-daily-activity-categories" role="group" aria-label="工具类别">
            <button type="button" data-kind="skill" aria-pressed="true"><span class="codex-daily-category-symbol" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M12 7v14m0-14C9 4 5 3 2 3v16c3 0 7 1 10 3 3-2 7-3 10-3V3c-3 0-7 1-10 4"/></svg></span><span class="codex-daily-category-name">技能</span><strong data-field="skillCount">—</strong></button>
            <button type="button" data-kind="plugin" aria-pressed="false"><span class="codex-daily-category-symbol" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M12 3v6m-5-6v6m-3 0h11v3a6 6 0 0 1-6 6H8a4 4 0 0 1-4-4V9Zm5 9v3m6-15h5m-2-2v4"/></svg></span><span class="codex-daily-category-name">插件 · MCP</span><strong data-field="pluginCount">—</strong></button>
            <button type="button" data-kind="tool" aria-pressed="false"><span class="codex-daily-category-symbol" aria-hidden="true"><svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="m7 9 3 3-3 3m6 0h4"/></svg></span><span class="codex-daily-category-name">工具执行</span><strong data-field="toolCount">—</strong></button>
          </div>
          <div class="codex-daily-execution">
            <div class="codex-daily-execution-header"><input class="codex-daily-execution-search" type="search" aria-label="搜索工具名称或已查看详情" placeholder="搜索名称或已查看详情" title="搜索所有工具名称、命名空间及已查看的详情" autocomplete="off"></div>
            <div class="codex-daily-execution-search-scope" data-field="executionSearchScope" hidden></div>
            <div class="codex-daily-execution-view">
              <div class="codex-daily-activity-list" role="list" aria-label="工具调用时间轴" hidden><div class="codex-daily-activity-canvas"></div></div>
              <div class="codex-daily-execution-list" role="list" aria-label="工具执行记录" tabindex="0"><div class="codex-daily-execution-canvas"></div></div>
              <div class="codex-daily-execution-empty" hidden></div>
              <div class="codex-daily-pager"><button type="button" data-action="previous-execution-page">上一页</button><span data-field="executionCoverage"></span><button type="button" data-action="next-execution-page">下一页</button></div>
            </div>
            <section class="codex-daily-execution-days" hidden>
              <div class="codex-daily-execution-days-head">较早记录 · 按日汇总</div>
              <div class="codex-daily-execution-days-note"></div>
              <div class="codex-daily-execution-days-list" role="list" aria-label="较早工具调用按日汇总" tabindex="0"><div class="codex-daily-execution-days-canvas"></div></div>
            </section>
            <div class="codex-daily-timeline-axis" hidden><span></span><span></span></div>
          </div>
        </details>
        <div class="codex-daily-section codex-daily-price-panel" hidden>
          <div class="codex-daily-section-head">Model 价格设置<span class="codex-daily-section-meta">USD / 1M tokens</span></div>
          <form class="codex-daily-price-add"><input type="text" name="model" placeholder="添加 Model" aria-label="添加 Model 名称"><button class="codex-daily-command" type="submit">添加</button></form>
          <div class="codex-daily-price-list"></div>
        </div>
        <div class="codex-daily-foot"><div class="codex-daily-foot-status"><span class="codex-daily-status">等待宿主数据</span><span class="codex-daily-updated"></span></div><button class="codex-daily-share" type="button" data-action="share" title="复制用量图片" aria-label="分享，复制用量图片"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 16V3m-4 4 4-4 4 4M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6"/></svg><span>分享</span></button></div>
      </div>
      <div class="codex-daily-execution-hover" role="tooltip" hidden><div><span>会话：</span><strong data-hover-title></strong></div><div><span>会话 ID：</span><strong data-hover-id></strong></div><div><span>耗时：</span><strong data-hover-duration></strong></div></div>
      <div id="codex-daily-activity-hover" class="codex-daily-activity-hover" role="tooltip" hidden></div>
      <div class="codex-daily-resize" role="separator" aria-label="调整面板高度" aria-orientation="horizontal" tabindex="0"></div>`;
    document.body.append(panel);
    applyTheme();
    bindEvents();
    mountWindowEntry();
    renderPeriod();
    renderTrigger();
    renderSnapshot();
  }

  let captionResizeObserver;

  function mountWindowEntry() {
    if (destroyed || (root.isConnected && root.previousElementSibling?.matches(WINDOW_MENU))) return;
    captionResizeObserver?.disconnect();
    const menu = document.querySelector(WINDOW_MENU);
    if (!menu) {
      if (opened) hidePanel();
      root.remove();
      return;
    }
    menu.after(root);
    // 原生标题栏可能在 geometrychange 之后才更新右侧内边距。
    (captionResizeObserver ??= new ResizeObserver(layoutWindowEntry)).observe(menu.parentElement);
    layoutWindowEntry();
  }

  function layoutWindowEntry() {
    const menu = root.previousElementSibling;
    if (!root.isConnected || !menu?.matches(WINDOW_MENU)) return;
    const overlay = navigator.windowControlsOverlay;
    const bar = root.parentElement;
    const barStyle = getComputedStyle(bar);
    const barRight = bar.getBoundingClientRect().right - parseFloat(barStyle.paddingRight) -
      parseFloat(barStyle.borderRightWidth);
    const area = overlay?.visible ? overlay.getTitlebarAreaRect() : null;
    const menuRight = menu.getBoundingClientRect().right;
    const windowsCaption = navigator.platform === "Win32";
    const safeRight = Math.min(barRight, area?.right ?? window.innerWidth - (windowsCaption ? 137 : 0));
    const available = safeRight - menuRight;
    const edge = area || windowsCaption;
    root.dataset.captionPlacement = edge ? "edge" : "menu";
    root.toggleAttribute("data-windows-caption", windowsCaption);
    root.style.marginInlineEnd = edge ? `${barRight - safeRight + 4}px` : "";
    root.toggleAttribute("data-compact", available < 148 || window.innerWidth <= 640);
    root.hidden = available < 44 || (!area && window.innerWidth < 520);
    if (root.hidden && opened) hidePanel();
    positionPanel();
  }

  function positionPanel() {
    if (!opened || !root.isConnected || document.hidden || window.__codexPlusWindowResumeLayout?.held) return;
    const width = window.innerWidth;
    const { right, bottom } = root.getBoundingClientRect();
    const panelWidth = Math.min(380, width - 24);
    panel.style.left = `${Math.max(12, Math.min(width - panelWidth - 12, right - panelWidth))}px`;
    panel.style.setProperty("--daily-panel-top", `${bottom + 6}px`);
  }

  function renderTrigger() {
    if (!root) return;
    const today = localDayBounds(Date.now());
    const value = { ...today, scope: "all", sessionId: "" };
    const snapshot = snapshots.get(selectionKey(value));
    let text = "—";
    if (snapshot) {
      const data = snapshot.data;
      if (data.available && data.countsKnown) text = trendMetric === "tokens"
        ? formatNumber(data.input + data.output, "fixed")
        : formatCost(snapshot.priceRevision === priceRevision && !data.unpriced ? data.cost : null);
    }
    root.querySelector(".codex-daily-total").textContent = text;
    root.querySelector(".codex-daily-total").title = "";
  }

  function renderPeriod() {
    if (!panel) return;
    for (const button of panel.querySelectorAll("[data-period]")) {
      button.setAttribute("aria-pressed", String(button.dataset.period === selectedPeriod));
    }
    for (const button of panel.querySelectorAll("[data-trend-metric]")) {
      button.setAttribute("aria-pressed", String(button.dataset.trendMetric === trendMetric));
    }
    panel.querySelector(".codex-daily-trend-switch").dataset.metric = trendMetric;
    const input = panel.querySelector(".codex-daily-date-input");
    input.value = selectedDate;
    input.max = dateKey(Date.now());
    const range = rangeFor();
    const shortDate = timestamp => {
      const date = new Date(timestamp);
      return `${date.getMonth() + 1}/${date.getDate()}`;
    };
    const selected = new Date(dateAt(selectedDate));
    const label = selectedPeriod === "month" ? `${selected.getFullYear()}年${selected.getMonth() + 1}月` :
      selectedPeriod === "week" ? `${shortDate(range.startAt)} – ${shortDate(range.endAt - 1)}` :
      selectedPeriod === "custom" ? `${shortDate(range.startAt)} ${datetimeValue(range.startAt).slice(11)} – ${shortDate(range.endAt)} ${datetimeValue(range.endAt).slice(11)}` :
      `${selected.getMonth() + 1}月${selected.getDate()}日`;
    const trigger = panel.querySelector('[data-action="toggle-calendar"]');
    trigger.querySelector("span").textContent = label;
    trigger.title = label;
    trigger.setAttribute("aria-label", `选择统计${selectedPeriod === "month" ? "月份" : "日期"}，${label}`);
    const previous = panel.querySelector('[data-action="previous-day"]');
    const next = panel.querySelector('[data-action="next-day"]');
    previous.hidden = next.hidden = selectedPeriod === "custom";
    next.disabled = range.endAt >= localDayBounds(Date.now()).endAt;
    panel.querySelector(".codex-daily-date-nav").classList.toggle("is-custom", selectedPeriod === "custom");
    panel.querySelector(".codex-daily-session-scope span").textContent = sessionScope === "all" ? "全部会话" : "当前会话";
  }

  function openPeriodPicker() {
    pickerMonth = selectedDate.slice(0, 7);
    previewDate = "";
    timeEndpoint = "";
    rangeAnchor = "";
    rangeEditEndpoint = "";
    rangeEndpoint = "start";
    if (selectedPeriod === "custom") {
      rangeDraft = { start: datetimeValue(customRange.startAt), end: datetimeValue(customRange.endAt) };
      pickerMonth = rangeDraft.start.slice(0, 7);
    }
    const row = panel.querySelector(".codex-daily-period");
    panel.style.setProperty("--codex-daily-calendar-top", `${row.offsetTop + row.offsetHeight - 2}px`);
    panel.querySelector(".codex-daily-calendar").hidden = false;
    panel.querySelector('[data-action="toggle-calendar"]').setAttribute("aria-expanded", "true");
    renderCalendar();
  }

  function closePeriodPicker(focus = false) {
    if (!panel) return;
    panel.querySelector(".codex-daily-calendar").hidden = true;
    previewDate = "";
    timeEndpoint = "";
    rangeAnchor = "";
    rangeEditEndpoint = "";
    const trigger = panel.querySelector('[data-action="toggle-calendar"]');
    trigger.setAttribute("aria-expanded", "false");
    if (focus) trigger.focus({ preventScroll: true });
  }

  function adjustRangeDraft(draft, endpoint, value) {
    const maximum = localDayBounds(Date.now()).endAt;
    const next = { ...draft, [endpoint]: datetimeValue(Math.min(
      maximum - (endpoint === "start" ? 60000 : 0), Date.parse(value))) };
    if (Date.parse(next.start) >= Date.parse(next.end)) {
      const other = endpoint === "start" ? "end" : "start";
      next[other] = `${next[endpoint].slice(0, 10)}T${draft[other].slice(11)}`;
      if (Date.parse(next.start) >= Date.parse(next.end)) {
        next[other] = datetimeValue(Date.parse(next[endpoint]) + (other === "end" ? 60000 : -60000));
      }
    }
    return next;
  }

  function calendarRangeDraft(draft, anchor, date) {
    const [start, end] = [anchor, date].sort();
    const next = { start: `${start}T${draft.start.slice(11)}`, end: `${end}T${draft.end.slice(11)}` };
    return Date.parse(next.start) < Date.parse(next.end) ? next : adjustRangeDraft(next, "start", next.start);
  }

  function renderCalendar() {
    const calendar = panel.querySelector(".codex-daily-calendar");
    const custom = selectedPeriod === "custom";
    const month = new Date(dateAt(`${pickerMonth}-01`));
    const year = month.getFullYear();
    const monthIndex = month.getMonth();
    const today = dateKey(Date.now());
    const maximum = custom && rangeEndpoint === "end" ? dateKey(addDays(dateAt(today), 1)) : today;
    const nextStart = selectedPeriod === "month" ? `${year + 1}-01-01` :
      dateKey(new Date(year, monthIndex + 1, 1));
    let cells;
    if (selectedPeriod === "month") {
      cells = `<div class="codex-daily-month-grid">${Array.from({ length: 12 }, (_, index) => {
        const key = `${year}-${String(index + 1).padStart(2, "0")}-01`;
        return `<button type="button" data-calendar-date="${key}" aria-pressed="${key.slice(0, 7) === selectedDate.slice(0, 7)}"${key > maximum ? " disabled" : ""}>${index + 1}月</button>`;
      }).join("")}</div>`;
    } else {
      const offset = (month.getDay() + 6) % 7;
      const start = addDays(month.getTime(), -offset);
      const weeks = Math.ceil((offset + new Date(year, monthIndex + 1, 0).getDate()) / 7);
      cells = `<div class="codex-daily-calendar-weekdays">${["一", "二", "三", "四", "五", "六", "日"].map(day => `<span>${day}</span>`).join("")}</div>`;
      for (let week = 0; week < weeks; week++) {
        cells += `<div class="codex-daily-calendar-days">${Array.from({ length: 7 }, (_, day) => {
          const key = dateKey(addDays(start, week * 7 + day));
          return `<button type="button" data-calendar-date="${key}" class="${key.slice(0, 7) === pickerMonth ? "" : "is-adjacent"}" aria-label="${key}" aria-pressed="${key === selectedDate}"${key === today ? ' aria-current="date"' : ""}${key > maximum ? " disabled" : ""}>${Number(key.slice(8))}</button>`;
        }).join("")}</div>`;
      }
    }
    const editor = custom ? `<div class="codex-daily-range-editor">${["start", "end"].map(endpoint => {
      const label = endpoint === "start" ? "开始" : "结束";
      return `<div class="codex-daily-range-endpoint${rangeEndpoint === endpoint ? " is-selected" : ""}" data-endpoint="${endpoint}"><span>${label}</span><button type="button" class="codex-daily-range-date" data-range-date="${endpoint}" aria-label="选择${label}日期" aria-pressed="${rangeEndpoint === endpoint && !timeEndpoint}"><span>${rangeDraft[endpoint].slice(0, 10).replace(/-/g, "/")}</span><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 11h18"/></svg></button><button type="button" class="codex-daily-range-time" data-range-time="${endpoint}" aria-label="选择${label}时间" aria-expanded="${timeEndpoint === endpoint}"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg><span>${rangeDraft[endpoint].slice(11)}</span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m8 10 4 4 4-4"/></svg></button></div>`;
    }).join("")}</div>` : "";
    const times = custom && timeEndpoint ? `<div class="codex-daily-time-picker">${["hour", "minute"].map((part, column) =>
      `<div class="codex-daily-time-column"><span>${column ? "分钟" : "小时"}</span><div role="listbox" aria-label="${timeEndpoint === "start" ? "开始" : "结束"}${column ? "分钟" : "小时"}">${Array.from({ length: column ? 60 : 24 }, (_, index) => {
        const text = String(index).padStart(2, "0");
        return `<button type="button" role="option" data-time-part="${part}" data-time-value="${text}" aria-selected="${rangeDraft[timeEndpoint].slice(column ? 14 : 11, column ? 16 : 13) === text}">${text}</button>`;
      }).join("")}</div></div>`).join('<span class="codex-daily-time-separator">:</span>')}</div>` : "";
    calendar.innerHTML = `${editor}${times || `<div class="codex-daily-calendar-head"><button type="button" class="codex-daily-icon" data-calendar-shift="-1" aria-label="${selectedPeriod === "month" ? "上一年" : "上个月"}"><svg viewBox="0 0 24 24"><path d="m15 18-6-6 6-6"/></svg></button><strong>${selectedPeriod === "month" ? `${year}年` : `${year}年${monthIndex + 1}月`}</strong><button type="button" class="codex-daily-icon" data-calendar-shift="1" aria-label="${selectedPeriod === "month" ? "下一年" : "下个月"}"${nextStart > maximum ? " disabled" : ""}><svg viewBox="0 0 24 24"><path d="m9 18 6-6-6-6"/></svg></button></div>${cells}`}<div class="codex-daily-calendar-foot">${custom
      ? '<span class="codex-daily-range-validation"></span><button type="button" data-confirm-range>应用</button>'
      : `<button type="button" ${selectedPeriod === "week" ? "data-calendar-recent" : `data-calendar-date="${today}"`}>${selectedPeriod === "month" ? "本月" : selectedPeriod === "week" ? "最近七天" : "今天"}</button><span data-range-preview></span>`}</div>`;
    updateRangePreview();
    calendar.querySelectorAll('.codex-daily-time-column [aria-selected="true"]').forEach(button => {
      button.parentElement.scrollTop = Math.max(0, button.offsetTop - 56);
    });
  }

  function updateRangePreview() {
    const calendar = panel.querySelector(".codex-daily-calendar");
    const custom = selectedPeriod === "custom";
    const range = rangeFor();
    const pending = custom && rangeAnchor;
    const preview = pending ? [rangeAnchor, previewDate || rangeAnchor].sort() : null;
    const start = custom ? preview?.[0] || rangeDraft.start.slice(0, 10) :
      previewDate || dateKey(range.startAt);
    const end = custom ? preview?.[1] || rangeDraft.end.slice(0, 10) :
      selectedPeriod === "week" && previewDate ? dateKey(addDays(dateAt(start), 6)) : dateKey(range.endAt - 1);
    for (const button of calendar.querySelectorAll("[data-calendar-date]")) {
      const key = button.dataset.calendarDate;
      button.classList.toggle("is-range", key >= start && key <= end);
      button.classList.toggle("is-range-edge", key === start || key === end);
      if (custom) button.setAttribute("aria-pressed", String(key === (rangeEndpoint === "start" ? start : end)));
    }
    const text = calendar.querySelector("[data-range-preview]");
    if (text) text.textContent = selectedPeriod === "week" ? `${start} – ${end}` : "";
    const confirm = calendar.querySelector("[data-confirm-range]");
    if (confirm) {
      const valid = Date.parse(rangeDraft.start) < Date.parse(rangeDraft.end) &&
        Date.parse(rangeDraft.end) <= localDayBounds(Date.now()).endAt;
      confirm.disabled = !!pending || !valid;
      calendar.querySelector(".codex-daily-range-validation").textContent = pending ? "选择结束日期" :
        valid ? "结束时刻不计入" : "结束须晚于开始且不晚于明天";
    }
  }

  function handleCalendarClick(event) {
    event.stopPropagation();
    const target = event.target.closest("button");
    if (!target || target.disabled) return;
    if (target.hasAttribute("data-confirm-range")) {
      api.selectCustomRange(Date.parse(rangeDraft.start), Date.parse(rangeDraft.end));
      closePeriodPicker(true);
    } else if (target.hasAttribute("data-calendar-recent")) {
      weekAnchor = "end";
      selectedDate = dateKey(Date.now());
      refreshSelection();
      closePeriodPicker(true);
    } else if (target.dataset.rangeTime) {
      rangeAnchor = rangeEditEndpoint = previewDate = "";
      rangeEndpoint = target.dataset.rangeTime;
      timeEndpoint = timeEndpoint === rangeEndpoint ? "" : rangeEndpoint;
      renderCalendar();
      panel.querySelector(timeEndpoint ? '.codex-daily-time-column [aria-selected="true"]' :
        `[data-range-time="${rangeEndpoint}"]`).focus({ preventScroll: true });
    } else if (target.dataset.timePart && timeEndpoint) {
      const value = rangeDraft[timeEndpoint];
      const time = value.slice(11).split(":");
      time[target.dataset.timePart === "hour" ? 0 : 1] = target.dataset.timeValue;
      rangeDraft = adjustRangeDraft(rangeDraft, timeEndpoint, `${value.slice(0, 10)}T${time.join(":")}`);
      renderCalendar();
      panel.querySelector(`[data-time-part="${target.dataset.timePart}"][data-time-value="${target.dataset.timeValue}"]`).focus({ preventScroll: true });
    } else if (target.dataset.rangeDate) {
      rangeEndpoint = rangeEditEndpoint = target.dataset.rangeDate;
      rangeAnchor = previewDate = timeEndpoint = "";
      pickerMonth = rangeDraft[rangeEndpoint].slice(0, 7);
      renderCalendar();
      panel.querySelector(`[data-range-date="${rangeEndpoint}"]`).focus({ preventScroll: true });
    } else if (target.dataset.calendarDate && selectedPeriod === "custom") {
      const date = target.dataset.calendarDate;
      if (rangeEditEndpoint) {
        rangeDraft = adjustRangeDraft(rangeDraft, rangeEditEndpoint, `${date}T${rangeDraft[rangeEditEndpoint].slice(11)}`);
        rangeEditEndpoint = "";
      } else if (!rangeAnchor) {
        rangeAnchor = date;
        rangeDraft = adjustRangeDraft(rangeDraft, "start", `${date}T${rangeDraft.start.slice(11)}`);
        rangeEndpoint = "end";
      } else {
        rangeDraft = calendarRangeDraft(rangeDraft, rangeAnchor, date);
        rangeAnchor = "";
        rangeEndpoint = "start";
      }
      previewDate = "";
      renderCalendar();
      panel.querySelector(`[data-calendar-date="${date}"]`)?.focus({ preventScroll: true });
    } else if (target.dataset.calendarDate) {
      selectedDate = target.dataset.calendarDate;
      if (selectedPeriod === "week") weekAnchor = "start";
      refreshSelection();
      closePeriodPicker(true);
    } else if (target.dataset.calendarShift) {
      const date = new Date(dateAt(`${pickerMonth}-01`));
      const step = Number(target.dataset.calendarShift);
      date.setMonth(date.getMonth() + step * (selectedPeriod === "month" ? 12 : 1));
      pickerMonth = dateKey(date).slice(0, 7);
      renderCalendar();
      panel.querySelector(`[data-calendar-shift="${step}"]`).focus({ preventScroll: true });
    }
  }

  function renderStatus() {
    if (!panel) return;
    const value = selection();
    const key = selectionKey(value);
    const snapshot = snapshots.get(key) || (shownPrimary?.key === key ? shownPrimary.snapshot : null);
    const failure = failures.get(`history:${key}`);
    const node = panel.querySelector(".codex-daily-status");
    const updated = panel.querySelector(".codex-daily-updated");
    let message;
    if (storageWarning) message = storageWarning;
    else if (value.scope === "current" && value.remote) message = "远程会话无法读取本机用量";
    else if (value.scope === "current" && value.hostUnknown) message = "当前会话主机身份未确认";
    else if (value.scope === "current" && !value.sessionId) message = "尚未识别当前会话";
    else if (failure) message = `${failure.message}${snapshot ? " · 显示上次结果" : ""}`;
    else if (!snapshot) message = "等待宿主数据";
    else {
      const data = snapshot.data;
      const capturedAt = typeof snapshot.legacyCapturedAt === "number" ? snapshot.legacyCapturedAt :
        Date.parse(snapshot.legacyCapturedAt);
      const legacyTime = Number.isFinite(capturedAt) ? ` · 截至 ${formatDateTime(capturedAt)}` : "";
      message = data.legacyUsed ? `包含旧版摘要 · 部分覆盖${legacyTime}` :
        data.uncertain && snapshot.legacyStatus?.available === false ?
          `旧摘要不可用 · 部分覆盖：${snapshot.legacyStatus.message}` :
        data.uncertain || snapshot.complete === false ||
        snapshot.countStatus?.complete === false ? snapshot.indexing ? "已加载部分用量 · 正在补齐历史" : "部分覆盖 · 待核对" :
          snapshot.classificationStatus?.complete === false ? "分类待核对" : "已更新";
      if (data.wholeDaysOnly) message += " · 仅显示区间内的整日用量";
      else if (data.precision === "day" && data.trend?.precision !== "partial") {
        message = message === "已更新" ? "仅支持按日统计" : `${message} · 仅支持按日统计`;
      }
      if (snapshot.provisional) message += " · 正在刷新所选范围";
      if (snapshot.scanIssues.length) message = `${message} · ${snapshot.scanIssues.join("、")}`;
    }
    if (toolsOpen && executionState?.key === key) {
      const state = executionState;
      const page = state.pages.get(state.page);
      const issues = [
        state.error,
        state.storageLimited && state.error !== "宿主索引存储受限" && "工具索引存储受限",
        state.coverage?.reason === "storage-pruned" ? "部分旧工具统计已因容量清理" :
          page && (page.complete === false || state.coverage?.complete === false ||
            state.hasIncompleteDay || state.activity?.complete === false) && "工具记录部分覆盖",
        executionSummaries.get(key)?.summary.classificationComplete === false && "工具分类待核对",
        state.hasPartialDay && "工具记录仅有整日精度",
      ].filter(Boolean);
      if (issues.length) message = `${message === "已更新" ? "" : `${message} · `}${issues.join("、")}`;
    }
    node.textContent = message;
    node.dataset.warning = String(message !== "已更新");
    updated.textContent = snapshot ? `更新于 ${new Date(snapshot.updatedAt).toLocaleTimeString()}` : "";
  }

  function trendPoints(days, trend, range, data) {
    if (!days.length && !trend && !data) return [];
    if (selectedPeriod === "day" && trend && Number.isFinite(trend.intervalMs) && trend.intervalMs > 0) {
      const elapsedEnd = Math.min(Date.now(), range.endAt);
      const step = Math.max(30 * 60000, trend.intervalMs,
        Math.ceil((range.endAt - range.startAt) / TREND_POINT_LIMIT));
      const points = [];
      let cursor = range.startAt;
      const fillGap = end => {
        while (cursor < end) {
          const endAt = Math.min(range.startAt +
            (Math.floor((cursor - range.startAt) / step) + 1) * step, end);
          points.push({ startAt: cursor, endAt, total: 0, cost: 0, countsKnown: true, unpriced: false });
          cursor = endAt;
        }
      };
      for (const point of trend.points) {
        if (point.startAt >= elapsedEnd) break;
        fillGap(point.startAt);
        cursor = Math.min(point.endAt, elapsedEnd);
        points.push(cursor === point.endAt ? point : { ...point, endAt: cursor });
      }
      fillGap(elapsedEnd);
      const grouped = [];
      for (const point of points) {
        const bin = Math.floor((point.startAt - range.startAt) / step);
        const binEnd = range.startAt + (bin + 1) * step;
        const previous = grouped.at(-1);
        // Never split a coarse source bucket or distribute its counts across time.
        if (previous && previous.endAt === point.startAt && point.endAt <= binEnd &&
            Math.floor((previous.startAt - range.startAt) / step) === bin) {
          previous.endAt = point.endAt;
          previous.total += point.total;
          previous.cost += point.cost;
          previous.countsKnown = previous.countsKnown !== false && point.countsKnown !== false;
          previous.unpriced ||= point.unpriced;
          previous.pricedAny ||= point.pricedAny;
        } else grouped.push({ ...point });
      }
      return grouped;
    }
    if (selectedPeriod !== "month" && selectedPeriod !== "week") return trend?.points || days;
    const byDay = new Map(days.map(day => [day.date, day]));
    const points = [];
    const tomorrow = localDayBounds(Date.now()).endAt;
    for (let startAt = range.startAt; startAt < range.endAt; startAt = addDays(startAt, 1)) {
      const endAt = addDays(startAt, 1);
      const date = dateKey(startAt);
      let point = byDay.get(date);
      let cursor = startAt;
      let unknown = false;
      if (trend) {
        for (const bucket of trend.points) {
          if (bucket.endAt <= cursor || bucket.startAt >= endAt) continue;
          if (bucket.countsKnown === false) unknown = true;
          if (bucket.startAt > cursor || unknown) break;
          cursor = Math.max(cursor, bucket.endAt);
          if (cursor >= endAt) break;
        }
      }
      if (startAt >= tomorrow) {
        point = { countsKnown: false, unpriced: true };
      } else if (unknown) {
        point = { ...point, countsKnown: false, unpriced: true };
      } else if (!point) {
        const known = data?.coverageDays?.[date] === "complete" && (!trend || cursor >= endAt);
        point = { total: 0, cost: 0, countsKnown: !!known, unpriced: !known };
      }
      points.push({ ...point, date, startAt, endAt });
    }
    return points;
  }

  function trendCost(point, priceStale) {
    if (priceStale) return null;
    if (!point.unpriced || selectedPeriod === "day") return point.cost;
    return point.countsKnown !== false && point.pricedAny ? point.cost : null;
  }

  function trendTicks(period, start, end) {
    const clock = stamp => new Date(stamp).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
    const shortDate = stamp => new Date(stamp).toLocaleDateString([], { month: "numeric", day: "numeric" });
    const dates = [0, .25, .5, .75, 1];
    if (period === "week") {
      return Array.from({ length: 7 }, (_, index) => addDays(start, index))
        .map(at => ({ at, label: shortDate(at) }));
    }
    if (period === "month") {
      const days = new Date(end - 1).getDate();
      return dates.map(fraction => {
        const dayStart = addDays(start, Math.min(days - 1, Math.round(days * fraction)));
        // Daily aggregates are plotted at the center of each calendar day.
        const at = (dayStart + addDays(dayStart, 1)) / 2;
        return { at, label: shortDate(dayStart) };
      });
    }
    if (period === "day") {
      return [0, 6, 12, 18, 24].map(hour => ({
        at: hour === 24 ? end : new Date(start).setHours(hour, 0, 0, 0),
        label: `${String(hour).padStart(2, "0")}:00`,
      }));
    }
    const sameDay = dateKey(start) === dateKey(end - 1);
    return (sameDay ? dates : [0, .5, 1]).map(fraction => {
      const at = Math.round(start + (end - start) * fraction);
      return { at, label: sameDay ? clock(at) : `${shortDate(at)} ${clock(at)}` };
    });
  }

  function renderTrend(days, trend = null, pricesCurrent = true, data = null, partial = false) {
    const svg = panel.querySelector(".codex-daily-trend-svg");
    const labels = panel.querySelector(".codex-daily-trend-labels");
    const peak = panel.querySelector(".codex-daily-trend-peak");
    const tooltip = panel.querySelector(".codex-daily-trend-tooltip");
    const range = selection();
    const key = selectionKey(range);
    const pointer = trendHover?.key === key && trendHover.period === selectedPeriod && trendHover.index >= 0
      ? trendHover.pointer : null;
    tooltip.hidden = true;
    trendHover = null;
    const points = trendPoints(days, trend, range, data);
    if (!points.length) {
      svg.innerHTML = "";
      labels.innerHTML = "";
      peak.textContent = "";
      return;
    }
    const priceStale = !pricesCurrent || !["week", "month"].includes(selectedPeriod) && !!trend?.priceStale;
    const now = Date.now();
    const values = points.map(point => {
      const start = Number.isFinite(point.startAt) ? point.startAt : dateAt(point.date);
      return start > now ? null : trendMetric === "cost"
        ? trendCost(point, priceStale) : point.countsKnown === false ? null : point.total;
    });
    const max = Math.max(Number.EPSILON, ...values.filter(value => value != null));
    const { startAt: firstAt, endAt: lastAt } = range;
    const weekly = selectedPeriod === "week";
    const weekDaily = weekly;
    const dateTicks = trendTicks(selectedPeriod, firstAt, lastAt);
    const monthly = selectedPeriod === "month";
    const axisStart = monthly ? dateTicks[0].at : firstAt;
    // Calendar-day charts end at the final day's sample, not the following midnight.
    const axisEnd = monthly || weekDaily ? dateTicks.at(-1).at : lastAt;
    const toX = at => TREND_LEFT + TREND_SPAN * (at - axisStart) / (axisEnd - axisStart);
    const coords = values.map((value, index) => {
      const point = points[index];
      const start = Number.isFinite(point.startAt) ? point.startAt : dateAt(point.date);
      const end = Number.isFinite(point.endAt) ? point.endAt : addDays(dateAt(point.endDate || point.date), 1);
      return { start, end,
        x: toX(weekly ? Math.max(start, firstAt) : (Math.max(start, firstAt) + Math.min(end, lastAt)) / 2),
        y: value == null ? null : 74 - value / max * 66 };
    });
    const segments = [];
    let segment = [];
    for (const point of coords) {
      if (point.y == null || segment.length && point.start > segment.at(-1).end) {
        if (segment.length) segments.push(segment);
        segment = [];
      }
      if (point.y != null) segment.push(point);
    }
    if (segment.length) segments.push(segment);
    const paths = segments.map(segment => {
      if (segment.length === 1) {
        // A single observed bucket gets a short stroke without bridging missing buckets.
        const { x, y, start, end } = segment[0];
        const half = Math.min(6, (toX(end) - toX(start)) / 2);
        const path = `M${Math.max(TREND_LEFT, x - half)} ${y}H${Math.min(TREND_WIDTH - TREND_LEFT, x + half)}`;
        return `<path class="codex-daily-trend-line" d="${path}" style="fill:none;stroke:url(#codex-daily-trend-line)" stroke-width="2.1" stroke-linecap="round" vector-effect="non-scaling-stroke"/>`;
      }
      let path = `M${segment[0].x.toFixed(2)} ${segment[0].y.toFixed(2)}`;
      const slopes = segment.slice(1).map((point, index) =>
        (point.y - segment[index].y) / (point.x - segment[index].x));
      const tangents = segment.map((_, index) => {
        if (index === 0) return slopes[0] || 0;
        if (index === segment.length - 1) return slopes.at(-1) || 0;
        const before = slopes[index - 1], after = slopes[index];
        if (before * after <= 0) return 0;
        return Math.sign(before) * Math.min(Math.abs((before + after) / 2),
          3 * Math.abs(before), 3 * Math.abs(after));
      });
      for (let index = 1; index < segment.length; index++) {
        const previous = segment[index - 1];
        const current = segment[index];
        const third = (current.x - previous.x) / 3;
        path += ` C${(previous.x + third).toFixed(2)} ${(previous.y + tangents[index - 1] * third).toFixed(2)} ${(current.x - third).toFixed(2)} ${(current.y - tangents[index] * third).toFixed(2)} ${current.x.toFixed(2)} ${current.y.toFixed(2)}`;
      }
      const area = `${path} L${segment.at(-1).x.toFixed(2)} 74 L${segment[0].x.toFixed(2)} 74 Z`;
      return `<path class="codex-daily-trend-area" d="${area}" mask="url(#codex-daily-trend-fade)" style="fill:url(#codex-daily-trend-line);stroke:none"/><path class="codex-daily-trend-line" d="${path}" style="fill:none;stroke:url(#codex-daily-trend-line)" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>`;
    }).join("");
    const peakPoint = coords[values.indexOf(max)];
    const markers = peakPoint
      ? `<circle class="codex-daily-trend-peak-dot" cx="${peakPoint.x}" cy="${peakPoint.y}" r="3.1" style="fill:var(--bg);stroke:url(#codex-daily-trend-line)" stroke-width="1.8"/>`
      : "";
    svg.dataset.intervalMs = String(monthly || weekly ? 86400000 : selectedPeriod === "day"
      ? Math.max(30 * 60000, trend?.intervalMs || 86400000) : trend?.intervalMs || 86400000);
    svg.innerHTML = `<defs><linearGradient id="codex-daily-trend-line" x1="0" y1="0" x2="300" y2="0" gradientUnits="userSpaceOnUse"><stop stop-color="#3ba7ff"/><stop offset="1" stop-color="#8d6bff"/></linearGradient><linearGradient id="codex-daily-trend-opacity" x1="0" y1="8" x2="0" y2="74" gradientUnits="userSpaceOnUse"><stop stop-color="white" stop-opacity=".42"/><stop offset=".65" stop-color="white" stop-opacity=".21"/><stop offset="1" stop-color="white" stop-opacity=".04"/></linearGradient><mask id="codex-daily-trend-fade" maskUnits="userSpaceOnUse" x="0" y="0" width="300" height="82"><rect width="300" height="82" fill="url(#codex-daily-trend-opacity)" stroke="none"/></mask></defs><path d="M4 8H296M4 41H296M4 74H296" stroke="var(--line)" stroke-width=".7"/>${paths}${markers}<line class="codex-daily-trend-guide" y1="8" y2="74" stroke="var(--muted)" stroke-width=".7" stroke-dasharray="2 3" visibility="hidden"/><circle class="codex-daily-trend-focus" r="3.1" style="fill:var(--bg);stroke:url(#codex-daily-trend-line)" stroke-width="1.8" visibility="hidden"/><rect x="0" y="0" width="300" height="82" style="fill:transparent;stroke:none"/>`;
    const partialRecovery = trend?.precision === "partial";
    const sourceLabel = partialRecovery ? "已回读部分" :
      partial ? data?.legacyUsed ? "已有记录" : "已索引" : "";
    const ticks = dateTicks.map(tick => {
      const x = toX(tick.at);
      if (!weekly && !monthly) return { ...tick, x, leftReach: 0 };
      const previous = coords.findLast(point => point.x < x);
      // Leave the previous sample selectable, including on a narrow plot.
      return { ...tick, x, leftReach: previous ? (x - previous.x) / 2 : Infinity };
    });
    trendHover = { key, period: selectedPeriod, points, coords, ticks, priceStale,
      firstAt, lastAt, axisStart, axisEnd, sourceLabel, weekDaily };
    const peakValue = values.some(value => value != null)
      ? trendMetric === "cost" ? formatCost(Math.max(0, ...values.filter(value => value != null)))
        : formatNumber(Math.max(0, ...values.filter(value => value != null)), "tokens") : "—";
    const partialCost = trendMetric === "cost" && points.some((point, index) => point.unpriced && values[index] != null);
    const peakLabel = partialRecovery ? "已回读部分 · 峰值" :
      selectedPeriod === "day" && trend?.precision === "day" ? "全天汇总" :
        `${partialCost ? "已计价" : sourceLabel}峰值`;
    peak.innerHTML = `${peakLabel} ${tokenNumberMarkup(peakValue)}${trendMetric === "tokens" ? " Token" : ""}`;
    labels.dataset.period = selectedPeriod;
    labels.parentElement.dataset.period = selectedPeriod;
    labels.parentElement.dataset.longTicks = String(selectedPeriod === "custom" && dateKey(firstAt) !== dateKey(lastAt - 1));
    labels.innerHTML = ticks.map(({ at, label, x }) => {
      const ratio = x / TREND_WIDTH;
      return `<span data-tick-at="${at}" style="left:calc(${100 * ratio}% + ${1 - 2 * ratio} * var(--trend-gutter))">${escapeHtml(label)}</span>`;
    }).join("");
    if (pointer) {
      const target = document.elementFromPoint(pointer.clientX, pointer.clientY);
      if (target && labels.parentElement.contains(target)) updateTrendHover({ ...pointer, target });
    }
  }

  function updateTrendHover(event) {
    if (!trendHover) return;
    const trendSvg = panel.querySelector(".codex-daily-trend-svg");
    const trendTooltip = panel.querySelector(".codex-daily-trend-tooltip");
    const rect = trendSvg.getBoundingClientRect();
    if (!rect.width) return;
    const scale = rect.width / TREND_WIDTH;
    const x = (event.clientX - rect.left) / scale;
    const tick = event.target.closest("[data-tick-at]");
    // Pointer coordinates can round down at a fractional CSS pixel boundary.
    const aligned = !tick && trendHover.ticks.find(tick => {
      const left = tick.x - x;
      return tick.at < trendHover.lastAt && (Math.abs(left) * scale <= 1 ||
        left > 0 && left <= tick.leftReach && left * scale <= 8);
    });
    const at = tick ? Number(tick.dataset.tickAt) : aligned ? aligned.at : Math.round(trendHover.axisStart +
      (x - TREND_LEFT) / TREND_SPAN * (trendHover.axisEnd - trendHover.axisStart));
    const nearest = trendHover.coords.findIndex(point => at >= point.start && at < point.end);
    const guide = trendSvg.querySelector(".codex-daily-trend-guide");
    const focus = trendSvg.querySelector(".codex-daily-trend-focus");
    const nearestPoint = trendHover.coords[nearest];
    if (at < trendHover.firstAt || at >= trendHover.lastAt || nearest < 0 || nearestPoint.y == null ||
        selectedPeriod === "week" && at > Date.now() ||
        !trendHover.weekDaily && Math.abs(nearestPoint.x - x) * rect.width / TREND_WIDTH > 18) {
      trendHover.index = -1;
      trendHover.pointer = null;
      trendTooltip.hidden = true;
      guide.setAttribute("visibility", "hidden");
      focus.setAttribute("visibility", "hidden");
      return;
    }
    trendHover.pointer = { clientX: event.clientX, clientY: event.clientY };
    if (trendHover.index === nearest) return;
    trendHover.index = nearest;
    const point = trendHover.points[nearest];
    const coord = trendHover.coords[nearest];
    const cost = trendCost(point, trendHover.priceStale);
    const stamp = value => {
      const date = new Date(value);
      return `${date.getMonth() + 1}/${date.getDate()} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
    };
    trendTooltip.querySelector(".codex-daily-trend-tooltip-time").textContent =
      selectedPeriod === "month" || trendHover.weekDaily ? dateKey(coord.start) : Number.isFinite(point.startAt) && Number.isFinite(point.endAt)
        ? `${stamp(point.startAt)} – ${stamp(point.endAt)}`
        : `${point.date}${point.endDate !== point.date ? ` – ${point.endDate}` : ""}`;
    trendTooltip.querySelector("[data-trend-tokens]").previousElementSibling.textContent =
      `${trendHover.sourceLabel ? `${trendHover.sourceLabel} ` : ""}Token`;
    trendTooltip.querySelector("[data-trend-cost]").previousElementSibling.textContent =
      point.unpriced && cost != null ? "已计价金额（部分）" :
        `${trendHover.sourceLabel ? `${trendHover.sourceLabel} ` : ""}估算金额`;
    trendTooltip.querySelector("[data-trend-tokens]").textContent =
      point.countsKnown === false ? "—" : `${formatNumber(point.total, "tokens")} Token`;
    trendTooltip.querySelector("[data-trend-cost]").textContent = formatCost(cost);
    trendTooltip.hidden = false;
    const container = trendTooltip.parentElement;
    const bounds = container.getBoundingClientRect();
    const anchorX = rect.left - bounds.left - container.clientLeft + coord.x * scale;
    const anchorY = rect.top - bounds.top - container.clientTop + coord.y * rect.height / 82;
    const { width, height } = trendTooltip.getBoundingClientRect();
    const inset = 8, gap = 12;
    const maxLeft = container.clientWidth - width - inset;
    const maxTop = container.clientHeight - height - inset;
    const leftOfPoint = anchorX - width - gap;
    const rightOfPoint = anchorX + gap;
    let left, top;
    if (rightOfPoint <= maxLeft || leftOfPoint >= inset) {
      left = rightOfPoint <= maxLeft ? rightOfPoint : leftOfPoint;
      top = Math.max(inset, Math.min(maxTop, anchorY - height / 2));
    } else {
      left = Math.max(inset, Math.min(maxLeft, anchorX - width / 2));
      top = anchorY >= container.clientHeight - anchorY ? anchorY - height - gap : anchorY + gap;
    }
    trendTooltip.style.left = `${left}px`;
    trendTooltip.style.top = `${top}px`;
    guide.setAttribute("x1", coord.x);
    guide.setAttribute("x2", coord.x);
    guide.setAttribute("visibility", "visible");
    focus.setAttribute("cx", coord.x);
    focus.setAttribute("cy", coord.y);
    focus.setAttribute("visibility", "visible");
  }

  function modelUsageMarkup(total, cost, unpriced, pricedAny, priceReady) {
    const text = metricNumber(total, cost, priceReady && (!unpriced || pricedAny));
    const badge = trendMetric === "cost" && priceReady && unpriced && pricedAny
      ? '<span class="codex-daily-cost-partial" title="仅包含可核算的用量">部分</span>' : "";
    return `<span>${tokenNumberMarkup(text)}${badge}</span>`;
  }

  function modelProviderRows(model, priceReady) {
    const parts = [...model.providers.values()];
    return ["main", "subagent", "unknown"].map(role => {
      const rows = parts.filter(part => part.role === role).sort((a, b) =>
        trendMetric === "cost" ? b.cost - a.cost : b.total - a.total);
      if (!rows.length) return "";
      const total = rows.reduce((sum, part) => sum + part.total, 0);
      const cost = rows.reduce((sum, part) => sum + part.cost, 0);
      const icon = role === "subagent"
        ? '<circle cx="12" cy="18" r="3"/><circle cx="6" cy="6" r="3"/><circle cx="18" cy="6" r="3"/><path d="M12 12v3M6 9v1a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V9"/>'
        : '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8m-4-4v4"/>';
      return `<div class="codex-daily-model-role" data-role="${role}"><div class="codex-daily-model-role-head"><span class="codex-daily-model-role-label"><svg viewBox="0 0 24 24" aria-hidden="true">${icon}</svg>${role === "subagent" ? "子智能体" : role === "main" ? "主会话" : "未知会话类型"}</span>${modelUsageMarkup(total, cost, rows.some(part => part.unpriced), rows.some(part => part.pricedAny), priceReady)}</div>${rows.map(part =>
        `<div class="codex-daily-model-part"><span>${escapeHtml(part.provider)}${part.inferred ? "（含推断数据）" : ""}</span>${modelUsageMarkup(part.total, part.cost, part.unpriced, part.pricedAny, priceReady)}</div>`).join("")}</div>`;
    }).join("");
  }

  function renderModels(data, priceReady) {
    const list = panel.querySelector(".codex-daily-model-list");
    const openedModels = new Set([...list.querySelectorAll("details[open]")].map(node => node.dataset.model));
    panel.querySelector('[data-field="modelMeta"]').textContent = data.models.length
      ? data.breakdownTruncated ? "部分分类已合并" : `${data.models.length} 个模型` : "";
    list.innerHTML = data.models.map(model => {
      return `<details class="codex-daily-model" data-model="${escapeHtml(model.model)}"${openedModels.has(model.model) ? " open" : ""}>
        <summary><span class="codex-daily-model-name">${escapeHtml(model.model)}</span><span class="codex-daily-model-total">${modelUsageMarkup(model.input + model.output, model.cost, model.unpriced, model.pricedAny, priceReady)}</span></summary>
        <div class="codex-daily-model-parts">${openedModels.has(model.model) ? modelProviderRows(model, priceReady) : ""}</div>
      </details><div class="codex-daily-model-bar" aria-hidden="true"><i style="width:${Math.min(100, 100 * (trendMetric === "cost" ? priceReady ? model.cost : 0 : model.input + model.output) / Math.max(Number.EPSILON, trendMetric === "cost" ? data.cost : data.input + data.output))}%"></i></div>`;
    }).join("") || '<div class="codex-daily-execution-empty">暂无模型记录</div>';
  }

  function renderSnapshot(refreshPrices = true) {
    if (!panel) return;
    const value = selection();
    const key = selectionKey(value);
    const snapshot = snapshots.get(key) || recentPrimary(value);
    shownPrimary = snapshot?.provisional ? { key, snapshot } : null;
    const data = snapshot?.data || null;
    const priceReady = snapshot?.priceRevision === priceRevision;
    if (refreshPrices && snapshot && !priceReady) updateSnapshotPrice(key, snapshot);
    const available = !!data?.available;
    const total = available && data.countsKnown ? metricNumber(data.input + data.output, data.cost,
      priceReady && !data.unpriced) : "—";
    panel.querySelector(".codex-daily-hero").textContent = total;
    panel.querySelector(".codex-daily-total-label").textContent = trendMetric === "cost" ? "累计金额" : "累计 Token";
    const numberFormat = panel.querySelector('[data-action="toggle-number-format"]');
    numberFormat.disabled = trendMetric === "cost";
    numberFormat.setAttribute("aria-pressed", String(compactNumbers));
    numberFormat.title = compactNumbers ? "显示完整 Token 数值" : "显示缩写 Token 数值";
    const partialCache = available && trendMetric === "tokens" && !data.cachedKnown && data.cached > 0;
    for (const field of ["input", "output", "cached", "calls"]) {
      const known = available && (field === "cached" ? data.cachedKnown || partialCache : data.countsKnown);
      panel.querySelector(`[data-field="${field}"]`).textContent = !known ? "—" : field === "calls"
        ? formatNumber(data.calls) : metricNumber(data[field], data.costs[field], priceReady && !data.unpriced);
      if (field !== "calls") {
        panel.querySelector(`[data-label="${field}"]`).textContent = {
          input: trendMetric === "cost" ? "输入金额" : "输入 Token",
          output: trendMetric === "cost" ? "输出金额" : "输出 Token",
          cached: trendMetric === "cost" ? "缓存输入金额" : partialCache ? "缓存输入（部分）" : "缓存输入",
        }[field];
      }
    }
    const showCost = available && priceReady && (!data.unpriced || data.pricedAny);
    panel.querySelector('[data-field="cost"]').textContent = showCost ? formatCost(data.cost) : "—";
    panel.querySelector(".codex-daily-cost-partial").hidden = !showCost || !data.unpriced;
    if (available) {
      renderTrend(priceReady || trendMetric !== "cost" ? data.days : [],
        priceReady || trendMetric !== "cost" ? data.trend : null, priceReady, data,
        data.uncertain || snapshot.complete === false || snapshot.countStatus?.complete === false);
      renderModels(data, priceReady);
      const sub = data.subagents;
      panel.querySelector('[data-field="subagentTotal"]').innerHTML = `<span class="codex-daily-subagent-totals"><span>${formatCost(priceReady && !sub.unpriced ? sub.cost : null)}</span><i>/</i>${tokenNumberMarkup(sub.countsKnown ? formatNumber(sub.input + sub.output, "tokens") : "—")}</span>`;
      panel.querySelector(".codex-daily-subagent-content").innerHTML = `<div class="codex-daily-grid">${[
        ["input", trendMetric === "cost" ? "输入金额" : "输入 Token"],
        ["output", trendMetric === "cost" ? "输出金额" : "输出 Token"],
        ["cached", trendMetric === "cost" ? "缓存输入金额" : "缓存输入"], ["calls", "用量记录"],
      ].map(([field, label]) => {
        const known = field === "cached" ? sub.cachedKnown : sub.countsKnown;
        const value = !known ? "—" : field === "calls" ? formatNumber(sub.calls)
          : metricNumber(sub[field], sub.costs[field], priceReady && !sub.unpriced);
        return `<span class="codex-daily-label">${label}</span><span class="codex-daily-value" data-subagent-field="${field}">${field === "calls" ? value : tokenNumberMarkup(value)}</span>`;
      }).join("")}</div>`;
      for (const model of data.models) if (!model.isOther) rememberPriceModel(model.model);
    } else {
      renderTrend([]);
      panel.querySelector(".codex-daily-model-list").innerHTML = "";
      panel.querySelector('[data-field="modelMeta"]').textContent = "";
      panel.querySelector('[data-field="subagentTotal"]').textContent = "—";
      panel.querySelector(".codex-daily-subagent-content").innerHTML = "";
    }
    for (const node of panel.querySelectorAll("[data-token-number]")) {
      node.title = trendMetric === "tokens" ? "切换为金额" : "切换为 Token";
    }
    renderStatus();
    renderPrices(false);
  }

  function summaryCount(summary, kind) {
    const field = kind === "plugin" ? "mcp" : kind;
    const value = summary?.[field];
    const count = typeof value === "object" ? value?.count : value;
    if (typeof count !== "number" || !Number.isFinite(count) || count < 0) return "—";
    return summary.classificationComplete === false && !count ? "—" : formatNumber(count);
  }

  function executionItems() {
    const state = executionState;
    const page = state?.pages.get(state.page);
    let records = page?.items || [];
    const needle = executionSearch.toLowerCase();
    if (needle) {
      const matches = record => {
        const cached = details.get(executionKey(record));
        const detail = cached?.viewRevision === state?.revision && !executionDetailExpired(record) ?
          cached.value : null;
        return [record.name, TOOL_SEARCH_NAMES[String(record.name).split(".").pop()], record.kind, record.namespace, record.status, record.preview,
          detail?.paths, detail?.input, detail?.changes, detail?.metadata, detail?.output]
          .some(value => typeof value === "string" && value.toLowerCase().includes(needle));
      };
      if (!state?.searchApplied) records = records.filter(matches);
      if (state?.page === 0) {
        const ids = new Set(records.map(executionKey));
        const local = [];
        for (const detail of details.values()) {
          if (detail.origin === state.key && detail.viewRevision === state.revision &&
              !executionDetailExpired(detail.record) &&
              !ids.has(executionKey(detail.record)) && matches(detail.record)) {
            local.push(detail.record);
          }
        }
        if (local.length) records = [...local, ...records];
      }
    }
    return records;
  }

  function renderExecutionTotals(key) {
    const totals = executionSummaries.get(key);
    for (const kind of ["skill", "plugin", "tool"]) {
      const node = panel.querySelector(`[data-field="${kind}Count"]`);
      const text = totals?.hasPartialDay ? "—" : summaryCount(totals?.summary, kind);
      if (node.textContent !== text) node.textContent = text;
      node.title = totals?.summary.classificationComplete === false ? "部分工具尚未分类" : "";
    }
    const meta = panel.querySelector('[data-field="toolMeta"]');
    const text = !totals?.hasPartialDay && totals?.summary.total != null ?
      `${formatNumber(totals.summary.total)} 次${totals.storagePruned ? " · 部分覆盖" : ""}` : "";
    if (meta.textContent !== text) meta.textContent = text;
  }

  function renderToolCalls() {
    if (!panel || !toolsOpen) return;
    const body = panel.querySelector(".codex-daily-scroll-body");
    const bodyScrollTop = body.scrollTop;
    const state = executionState;
    const page = state?.pages.get(state.page);
    for (const button of panel.querySelectorAll("[data-kind]")) {
      button.setAttribute("aria-pressed", String(!executionSearch && button.dataset.kind === toolKind));
    }
    renderExecutionTotals(selectionKey(selection()));
    const coverage = panel.querySelector('[data-field="executionCoverage"]');
    coverage.textContent = state?.error ? state.error :
      !page ? "读取中" : page.complete && state.coverage?.complete === true && !state.hasIncompleteDay ? `第 ${state.page + 1} 页` :
        `第 ${state.page + 1} 页 · 部分覆盖`;
    if (state?.hasPartialDay) coverage.textContent += " · 较早记录仅有整日精度";
    if (state?.storageLimited && state.error !== "宿主索引存储受限") {
      coverage.textContent += " · 索引存储受限";
    }
    const searchScope = panel.querySelector('[data-field="executionSearchScope"]');
    searchScope.hidden = !executionSearch;
    searchScope.textContent = state?.searchApplied ?
      "所有工具 · 名称、命名空间及已查看详情" : "所有工具 · 当前页及已查看详情";
    panel.querySelector('[data-action="previous-execution-page"]').disabled = !state || state.page === 0;
    panel.querySelector('[data-action="next-execution-page"]').disabled = !page?.nextCursor;
    const records = executionItems();
    const list = panel.querySelector(".codex-daily-execution-list");
    const empty = panel.querySelector(".codex-daily-execution-empty");
    const grouped = !executionSearch && toolKind !== "tool" && Array.isArray(state?.activity?.groups);
    if (!grouped) hideActivityHover();
    const timelineVisible = !executionSearch && toolKind !== "tool";
    const groups = grouped ? state.activity.groups : [];
    panel.querySelector(".codex-daily-execution-view").classList.toggle("is-grouped", timelineVisible);
    empty.hidden = grouped ? groups.length > 0 : records.length > 0;
    empty.textContent = state?.error || (!page ? "正在读取工具记录…" :
      executionSearch ? "没有匹配的记录" : state?.dailySummaries?.length ? "暂无逐次记录" : "暂无可显示的记录");
    list.hidden = grouped || records.length === 0;
    panel.querySelector(".codex-daily-pager").hidden = grouped;
    panel.querySelector('[data-action="previous-execution-page"]').hidden = grouped;
    panel.querySelector('[data-action="next-execution-page"]').hidden = grouped;
    const activityList = panel.querySelector(".codex-daily-activity-list");
    activityList.hidden = !grouped || !groups.length;
    const axis = panel.querySelector(".codex-daily-timeline-axis");
    axis.hidden = !timelineVisible;
    if (!axis.hidden) {
      const value = state?.value || selection();
      const sameDay = dateKey(value.startAt) === dateKey(value.endAt - 1);
      for (const [node, timestamp] of [[axis.firstElementChild, value.startAt], [axis.lastElementChild, value.endAt - 1]]) {
        const date = datetimeValue(timestamp);
        node.textContent = sameDay ? date.slice(11) : `${date.slice(5, 10).replace("-", "/")} ${date.slice(11)}`;
        node.title = formatDateTime(timestamp);
      }
    }
    if (grouped) {
      if (activityList.dataset.key !== `${state.key}:${state.kind}`) {
        activityList.dataset.key = `${state.key}:${state.kind}`;
        activityList.scrollTop = 0;
      }
      activityList.querySelector(".codex-daily-activity-canvas").style.height = `${groups.length * ACTIVITY_ROW_HEIGHT}px`;
      renderActivityRows(true);
    }
    const expandedIndex = records.findIndex(record => executionKey(record) === executionExpanded);
    if (expandedIndex < 0) executionExpanded = "";
    const detailHeight = executionExpanded ? EXECUTION_DETAIL_HEIGHT : 0;
    const contentHeight = records.length * EXECUTION_ROW_HEIGHT + detailHeight;
    list.querySelector(".codex-daily-execution-canvas").style.height = `${contentHeight}px`;
    renderExecutionRows(true);
    const daySection = panel.querySelector(".codex-daily-execution-days");
    const days = state?.dailySummaries || [];
    daySection.hidden = !!executionSearch || !days.length;
    if (!daySection.hidden) {
      daySection.querySelector(".codex-daily-execution-days-note").textContent = state.hasPartialDay ?
        "部分日期只提供整日次数，包含所选范围外的时间；范围总数不可精确计算。" :
        "仅保留每日次数；覆盖不完整的日期会单独标记。";
      const dayList = daySection.querySelector(".codex-daily-execution-days-list");
      const dayListKey = `${state.key}:${state.kind}:${executionSearch}`;
      if (dayList.dataset.key !== dayListKey) {
        dayList.dataset.key = dayListKey;
        dayList.scrollTop = 0;
      }
      const dayHeight = days.length * EXECUTION_DAY_ROW_HEIGHT;
      dayList.style.height = `${Math.min(140, dayHeight)}px`;
      dayList.querySelector(".codex-daily-execution-days-canvas").style.height = `${dayHeight}px`;
      renderExecutionDays(true);
    }
    renderStatus();
    body.scrollTop = bodyScrollTop;
  }

  function renderActivityRows(force = false) {
    const list = panel?.querySelector(".codex-daily-activity-list");
    if (!list || list.hidden) return;
    const canvas = list.querySelector(".codex-daily-activity-canvas");
    const start = Math.max(0, Math.floor(list.scrollTop / ACTIVITY_ROW_HEIGHT) - 2);
    if (!force && canvas.dataset.start === String(start)) return;
    const pointer = activityHover?.pointer;
    hideActivityHover();
    canvas.dataset.start = String(start);
    const activity = executionState.activity;
    const span = executionState.value.endAt - activity.startAt;
    const knownTimes = new Map();
    for (const record of executionItems()) {
      const timestamp = executionTime(record);
      const bucket = Math.floor((timestamp - activity.startAt) / activity.bucketWidthMs);
      const key = JSON.stringify([record.kind, record.namespace || "", record.name, bucket]);
      if (!knownTimes.has(key) || timestamp < knownTimes.get(key)) knownTimes.set(key, timestamp);
    }
    const now = Date.now();
    const current = now >= activity.startAt && now < executionState.value.endAt
      ? `<path class="codex-daily-activity-now" d="M${((now - activity.startAt) * 640 / span).toFixed(1)} 0v16" style="stroke:var(--muted);stroke-width:1;opacity:.7"/>` : "";
    const rows = activity.groups.slice(start, start + 10).map(group => ({
      group,
      marks: group.timeline.map(([bucket, count, firstAt]) => {
        const key = JSON.stringify([group.kind, group.namespace || "", group.name, bucket]);
        const at = Number.isFinite(firstAt) ? firstAt : knownTimes.get(key);
        const x = Number.isFinite(at) ? (at - activity.startAt) * 640 / span :
          (bucket + 0.5) * activity.bucketWidthMs * 640 / span;
        return { x: Math.max(0, Math.min(640, x)), count,
          at: Number.isFinite(at) ? at : activity.startAt + bucket * activity.bucketWidthMs,
          exact: Number.isFinite(at) };
      }),
    }));
    canvas.innerHTML = rows.map(({ group, marks }, offset) => {
      const path = marks.map(mark => `M${mark.x.toFixed(1)} 4v8`).join("");
      return `<div class="codex-daily-activity-row${group.kind === "mcp" ? " is-plugin" : ""}" role="listitem" style="top:${(start + offset) * ACTIVITY_ROW_HEIGHT}px">
        <span class="codex-daily-activity-name" title="${escapeHtml([group.namespace, group.name].filter(Boolean).join(" · "))}">${group.namespace ? `<span class="codex-daily-activity-namespace">${escapeHtml(group.namespace)}</span>` : ""}${escapeHtml(group.name)}</span>
        <span>${formatNumber(group.count)} 次</span><div class="codex-daily-activity-timeline" tabindex="0" aria-label="${escapeHtml(group.name)}，${formatNumber(group.count)} 次"><svg viewBox="0 0 640 16" preserveAspectRatio="none" aria-hidden="true">${current}<path class="codex-daily-activity-marks" d="${path}"/><path class="codex-daily-activity-focus-band"/><path class="codex-daily-activity-focus"/></svg></div>
      </div>`;
    }).join("");
    canvas.querySelectorAll(".codex-daily-activity-timeline").forEach((node, index) => {
      activityTimelines.set(node, rows[index]);
    });
    if (pointer) updateActivityHover(pointer);
  }

  function nearbyActivityMarks(marks, x, radius) {
    let low = 0, high = marks.length;
    while (low < high) {
      const middle = (low + high) >>> 1;
      if (marks[middle].x < x) low = middle + 1;
      else high = middle;
    }
    let left = low - 1, right = low;
    const indices = [];
    while (indices.length < 3) {
      const before = left >= 0 ? Math.abs(marks[left].x - x) : Infinity;
      const after = right < marks.length ? Math.abs(marks[right].x - x) : Infinity;
      if (Math.min(before, after) > radius) break;
      indices.push(before <= after ? left-- : right++);
    }
    return indices.sort((a, b) => a - b);
  }

  function hideActivityHover() {
    if (activityHover) {
      activityHover.node.classList.remove("is-inspecting");
      activityHover.node.removeAttribute("aria-describedby");
      for (const path of activityHover.node.querySelectorAll(".codex-daily-activity-focus, .codex-daily-activity-focus-band")) {
        path.removeAttribute("d");
      }
    }
    activityHover = null;
    const tooltip = panel?.querySelector(".codex-daily-activity-hover");
    if (tooltip) tooltip.hidden = true;
  }

  function updateActivityHover({ clientX, clientY, target }, keyboardIndex) {
    const node = (target || document.elementFromPoint(clientX, clientY))?.closest(".codex-daily-activity-timeline");
    const row = node && activityTimelines.get(node);
    if (!row) return hideActivityHover();
    const bounds = node.getBoundingClientRect();
    const x = keyboardIndex == null ? (clientX - bounds.left) * 640 / bounds.width :
      row.marks[keyboardIndex]?.x;
    const indices = nearbyActivityMarks(row.marks, x, 18 * 640 / bounds.width);
    if (!indices.length) return hideActivityHover();
    const pointer = keyboardIndex == null ? { clientX, clientY } : null;
    const key = indices.join(",");
    if (activityHover?.node === node && activityHover.key === key) {
      activityHover.pointer = pointer;
      activityHover.keyboardIndex = keyboardIndex;
      return;
    }
    hideActivityHover();
    activityHover = { node, key, pointer, keyboardIndex };
    node.classList.add("is-inspecting");
    node.setAttribute("aria-describedby", "codex-daily-activity-hover");
    const selected = indices.map(index => row.marks[index]);
    const path = selected.map(mark => `M${mark.x.toFixed(1)} 3v10`).join("");
    for (const overlay of node.querySelectorAll(".codex-daily-activity-focus, .codex-daily-activity-focus-band")) {
      overlay.setAttribute("d", path);
    }
    const tooltip = panel.querySelector(".codex-daily-activity-hover");
    tooltip.classList.toggle("is-plugin", row.group.kind === "mcp");
    tooltip.innerHTML = `<div class="codex-daily-activity-hover-head"><div class="codex-daily-activity-hover-identity"><strong class="codex-daily-activity-hover-name">${escapeHtml(row.group.name)}</strong>${row.group.namespace ? `<span class="codex-daily-activity-hover-namespace">${escapeHtml(row.group.namespace)}</span>` : ""}</div><span class="codex-daily-activity-hover-kind">${row.group.kind === "mcp" ? "MCP" : "技能"}</span></div>` +
      selected.map(mark => `<div class="codex-daily-activity-hover-item"><time datetime="${new Date(mark.at).toISOString()}">${escapeHtml(formatDateTime(mark.at))}${!mark.exact || mark.count > 1 ? `<small>${mark.exact ? "起" : "左右"}</small>` : ""}</time><strong>${formatNumber(mark.count)} 次</strong></div>`).join("");
    tooltip.hidden = false;
    const parent = panel.getBoundingClientRect();
    const anchorX = keyboardIndex == null ? clientX : bounds.left + x * bounds.width / 640;
    tooltip.style.left = `${Math.max(12, Math.min(parent.width - tooltip.offsetWidth - 12,
      anchorX - parent.left - tooltip.offsetWidth / 2))}px`;
    const above = bounds.top - parent.top - tooltip.offsetHeight - 8;
    tooltip.style.top = `${Math.max(8, Math.min(parent.height - tooltip.offsetHeight - 8,
      above >= 8 ? above : bounds.bottom - parent.top + 8))}px`;
  }

  function renderExecutionDays(force = false) {
    const section = panel?.querySelector(".codex-daily-execution-days");
    if (!section || section.hidden) return;
    const list = section.querySelector(".codex-daily-execution-days-list");
    const canvas = list.querySelector(".codex-daily-execution-days-canvas");
    const start = Math.max(0, Math.floor(list.scrollTop / EXECUTION_DAY_ROW_HEIGHT) - 2);
    if (!force && canvas.dataset.start === String(start)) return;
    canvas.dataset.start = String(start);
    canvas.innerHTML = executionState.dailySummaries.slice(start, start + 10).map((row, offset) => {
      const dayStart = dateAt(row.day);
      const outside = Number.isFinite(dayStart) && (executionState.value.startAt > dayStart ||
        executionState.value.endAt < addDays(dayStart, 1));
      const value = row[toolKind === "plugin" ? "mcp" : toolKind];
      const known = typeof value === "number" && Number.isFinite(value) && value >= 0;
      const count = known && (row.classificationComplete !== false || value > 0) ?
        `${formatNumber(value)} 次` : "次数待补齐";
      const notes = [row.partial ? "覆盖不完整" : "", row.classificationComplete === false ? "分类未完成" : "",
        outside ? "整日数" : ""].filter(Boolean);
      return `<div class="codex-daily-execution-day" role="listitem" style="top:${(start + offset) * EXECUTION_DAY_ROW_HEIGHT}px"><span>${escapeHtml(row.day)}</span><span>${escapeHtml([count, ...notes].join(" · "))}</span></div>`;
    }).join("");
  }

  function renderExecutionRows(force = false) {
    if (!panel || !toolsOpen) return;
    const list = panel.querySelector(".codex-daily-execution-list");
    const canvas = list.querySelector(".codex-daily-execution-canvas");
    const records = executionItems();
    const expandedIndex = records.findIndex(record => executionKey(record) === executionExpanded);
    const detailHeight = expandedIndex >= 0 ? EXECUTION_DETAIL_HEIGHT : 0;
    const logicalTop = expandedIndex >= 0 && list.scrollTop > expandedIndex * EXECUTION_ROW_HEIGHT
      ? Math.max(expandedIndex * EXECUTION_ROW_HEIGHT, list.scrollTop - detailHeight) : list.scrollTop;
    const start = Math.max(0, Math.floor(logicalTop / EXECUTION_ROW_HEIGHT) - 3);
    if (!force && canvas.dataset.start === String(start)) {
      scheduleExecutionMetadata();
      return;
    }
    canvas.dataset.start = String(start);
    const oldDetail = canvas.querySelector(".codex-daily-execution-row.is-expanded .codex-daily-execution-detail");
    const oldKey = oldDetail?.closest(".codex-daily-execution-row").dataset.executionKey;
    const detailScrollTop = oldKey === executionExpanded ? oldDetail.scrollTop : 0;
    if (executionDetailPageKey !== executionExpanded) {
      executionDetailPageKey = executionExpanded;
      executionDetailPages = {};
    }
    const visible = records.slice(start, start + 15);
    const markup = visible.map((record, offset) => {
      const index = start + offset;
      const key = executionKey(record);
      const expanded = key === executionExpanded;
      const top = index * EXECUTION_ROW_HEIGHT + (expandedIndex >= 0 && index > expandedIndex ? detailHeight : 0);
      const stamp = executionTime(record) ? formatDateTime(executionTime(record)) : "时间未知";
      const cached = cachedDetail(record);
      const title = String(record.name || record.kind || "工具调用");
      const button = `<button class="codex-daily-execution-toggle" type="button" data-execution-index="${index}" aria-expanded="${expanded}">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg><span class="codex-daily-execution-title"><span class="codex-daily-execution-name">${escapeHtml(title)}</span><span class="codex-daily-execution-preview"></span></span><span class="codex-daily-execution-meta"><span class="codex-daily-execution-time" title="耗时">—</span><span class="codex-daily-execution-time">${escapeHtml(stamp)}</span></span>
      </button>`;
      let detail = "";
      if (expanded) {
        const value = cached;
        const failure = failures.get(`detail:${key}`);
        const fields = [["paths", "路径"], ["input", "输入"], ["changes", "文件变更"], ["metadata", "信息"], ["output", "结果"]];
        const content = value ? fields.filter(([field]) => value[field] || field === "output" && value.imagePath).map(([field, label]) => {
          if (field === "output" && value.imagePath) return `<div class="codex-daily-detail-field" data-detail-field="output"><div class="codex-daily-detail-header"><span class="codex-daily-execution-detail-label">输出</span></div><div class="codex-daily-image-output" role="status">正在加载图片…</div></div>`;
          const text = value[field];
          const pages = Math.ceil(text.length / DETAIL_PAGE_SIZE);
          const page = Math.min(executionDetailPages[field] || 0, pages - 1);
          executionDetailPages[field] = page;
          const pager = pages > 1 ? `<div class="codex-daily-detail-pager">
            <button type="button" data-detail-page="-1" aria-label="${label}上一页" title="上一页"${page === 0 ? " disabled" : ""}><svg viewBox="0 0 24 24"><path d="m15 18-6-6 6-6"/></svg></button>
            <label>第 <input type="number" min="1" max="${pages}" value="${page + 1}" aria-label="${label}页码"> / ${pages} 页</label>
            <button type="button" data-detail-page="1" aria-label="${label}下一页" title="下一页"${page === pages - 1 ? " disabled" : ""}><svg viewBox="0 0 24 24"><path d="m9 18 6-6-6-6"/></svg></button>
          </div>` : "";
          return `<div class="codex-daily-detail-field" data-detail-field="${field}"><div class="codex-daily-detail-header"><span class="codex-daily-execution-detail-label">${label}</span>${pager}</div><pre tabindex="0">${escapeHtml(detailPageText(text, page))}</pre></div>`;
        }).join("") : "";
        const partial = value?.partial ? '<div class="codex-daily-execution-detail-label">部分详情不可用</div>' : "";
        detail = `<div class="codex-daily-execution-detail">${partial}${content || (executionDetailExpired(record) ? "详情已超过保留期" : value ? "原会话暂无可展示的详情" :
          failure ? `详情读取失败：${escapeHtml(failure.message)}` : "正在读取详情…")}</div>`;
      }
      return `<div class="codex-daily-execution-row${expanded ? " is-expanded" : ""}" role="listitem" data-execution-key="${escapeHtml(key)}" style="top:${top}px;height:${EXECUTION_ROW_HEIGHT + (expanded ? detailHeight : 0)}px">${button}${detail}</div>`;
    }).join("");
    if (executionMarkup !== markup) {
      hideExecutionHover();
      canvas.innerHTML = executionMarkup = markup;
      const nextDetail = canvas.querySelector(".codex-daily-execution-row.is-expanded .codex-daily-execution-detail");
      if (nextDetail && oldKey === executionExpanded) nextDetail.scrollTop = detailScrollTop;
    }
    for (const record of visible) updateExecutionMetadataRow(record);
    const imageContainer = canvas.querySelector(".codex-daily-image-output");
    if (imageContainer && expandedIndex >= 0) {
      void loadExecutionImage(records[expandedIndex], cachedDetail(records[expandedIndex]), imageContainer);
    } else clearExecutionImage();
    scheduleExecutionMetadata();
  }

  function setDetailPage(fieldElement, requestedPage) {
    const field = fieldElement.dataset.detailField;
    const record = executionItems().find(item => executionKey(item) === executionExpanded);
    const value = record && cachedDetail(record);
    if (!value?.[field]) return;
    const text = value[field];
    const pages = Math.ceil(text.length / DETAIL_PAGE_SIZE);
    const page = Math.min(pages - 1, Math.max(0, requestedPage));
    executionDetailPages[field] = page;
    fieldElement.querySelector("pre").textContent = detailPageText(text, page);
    fieldElement.querySelector("input").value = String(page + 1);
    fieldElement.querySelector('[data-detail-page="-1"]').disabled = page === 0;
    fieldElement.querySelector('[data-detail-page="1"]').disabled = page === pages - 1;
  }

  function hideExecutionHover() {
    executionHoverKey = "";
    if (executionHoverTimer) window.clearTimeout(executionHoverTimer);
    executionHoverTimer = null;
    const tooltip = panel?.querySelector(".codex-daily-execution-hover");
    if (tooltip) tooltip.hidden = true;
  }

  function showExecutionHover(record, button) {
    hideExecutionHover();
    const state = executionState;
    if (state.value.scope !== "all") return;
    const key = executionKey(record);
    executionHoverKey = key;
    const tooltip = panel.querySelector(".codex-daily-execution-hover");
    const update = () => {
      if (destroyed || executionHoverKey !== key || executionState !== state || !button.isConnected) return;
      const cached = cachedDetail(record);
      const metadata = cachedExecutionMetadata(record);
      const current = window.codexPlus?.currentSession?.();
      tooltip.querySelector("[data-hover-title]").textContent =
        (current?.hostKnown && !current.remote && current.id === record.sessionId ? current.title : "") ||
        sessionTitles.get(record.sessionId)?.title || "";
      tooltip.querySelector("[data-hover-id]").textContent = record.sessionId || "未记录";
      tooltip.querySelector("[data-hover-duration]").textContent =
        formatDuration(record.durationMs ?? cached?.durationMs ?? metadata?.durationMs) || "暂无";
      tooltip.hidden = false;
      const parent = panel.getBoundingClientRect();
      const row = button.getBoundingClientRect();
      tooltip.style.left = `${Math.max(8, Math.min(parent.width - tooltip.offsetWidth - 8, row.left - parent.left))}px`;
      tooltip.style.top = `${Math.max(8, Math.min(parent.height - tooltip.offsetHeight - 8, row.bottom - parent.top + 4))}px`;
    };
    update();
    const current = window.codexPlus?.currentSession?.();
    if (!record.sessionId || current?.hostKnown && !current.remote &&
        current.id === record.sessionId && current.title) return;
    executionHoverTimer = window.setTimeout(() => {
      executionHoverTimer = null;
      void loadSessionTitle(record.sessionId).then(update);
    }, 180);
  }

  function renderPrices(replaceFocused = true) {
    const prices = panel?.querySelector(".codex-daily-price-panel");
    if (!prices || prices.hidden || !replaceFocused && prices.contains(document.activeElement)) return;
    const list = panel.querySelector(".codex-daily-price-list");
    const providers = providerPrices || [];
    list.innerHTML = [...priceModels].sort((a, b) => a.localeCompare(b)).map(model => {
      const info = priceInfo(model);
      const custom = normalizePrice(priceConfig.models[model]);
      const preset = normalizePrice(DEFAULT_MODEL_PRICES[modelPriceId(model)]);
      const options = [
        ["auto", "自动"], ["default", "预置"], ["custom", "自定义"],
        ...providers.map(provider => [provider, providerQuote(provider, model)]).filter(([, quote]) => quote)
          .map(([provider, quote]) => [`provider:${provider.id}`,
            `${provider.name || provider.id}${quote.currency === "USD" ? "" :
              `（${quote.currency || "币种未标明"}，不兼容 USD）`}`, quote.currency !== "USD"]),
      ];
      if (info.selection.startsWith("provider:") && !options.some(([id]) => id === info.selection)) {
        options.push([info.selection, `${info.selection.slice(9)}（不可用）`]);
      }
      return `<form class="codex-daily-price-row" data-price-model="${escapeHtml(model)}">
        <div class="codex-daily-price-title"><strong title="${escapeHtml(model)}">${escapeHtml(model)}</strong><select name="source" aria-label="${escapeHtml(model)} 价格来源">${options.map(([id, label, disabled]) =>
          `<option value="${escapeHtml(id)}"${id === info.selection ? " selected" : ""}${disabled ? " disabled" : ""}>${escapeHtml(label)}</option>`).join("")}</select></div>
        <div class="codex-daily-price-fields">${[["input", "输入"], ["cachedInput", "缓存输入"], ["output", "输出"]].map(([field, label]) =>
          `<label>${label}<input type="number" name="${field}" min="0" step="any" value="${custom[field] ?? ""}" placeholder="${preset[field] ?? "未设置"}"></label>`).join("")}</div>
        <div class="codex-daily-price-actions"><button class="codex-daily-command" type="submit">确认</button><button class="codex-daily-command" type="button" data-action="clear-price">清除</button><span class="codex-daily-section-meta">${escapeHtml(info.source)}</span></div>
      </form>`;
    }).join("");
  }

  function rememberPriceModel(model) {
    if (priceModels.has(model)) return;
    if (priceModels.size >= PRICE_MODEL_LIMIT) priceModels.delete(priceModels.values().next().value);
    priceModels.add(model);
  }

  function savePriceRow(form) {
    const model = form.dataset.priceModel;
    const price = {};
    for (const field of PRICE_FIELDS) {
      const text = form.elements[field].value;
      const value = text === "" ? null : Number(text);
      if (value !== null && (!Number.isFinite(value) || value < 0)) return;
      price[field] = value;
    }
    const source = form.elements.source.value;
    const previousSource = priceInfo(model).selection;
    const priceChanged = JSON.stringify(normalizePrice(priceConfig.models[model])) !== JSON.stringify(price);
    const selectedSource = source === "auto" && previousSource === "auto" && priceChanged && hasPrice(price)
      ? "custom" : source;
    const next = { ...priceConfig, models: { ...priceConfig.models }, sources: { ...priceConfig.sources } };
    next.models[model] = price;
    if (selectedSource !== "auto" || hasPrice(price)) next.sources[model] = selectedSource;
    else delete next.sources[model];
    const serialized = JSON.stringify(next);
    if (serialized.length > 256000) {
      storageWarning = "价格设置超过容量";
      renderStatus();
      return;
    }
    if (serialized === JSON.stringify(priceConfig)) return;
    if (!writeSetting(PRICE_STORAGE_KEY, serialized)) return;
    priceConfig = next;
    invalidatePrices();
    renderSnapshot();
    renderPrices();
    refreshProviderPricing(snapshots.get(selectionKey(selection())));
  }

  function selectView(period) {
    if (!["day", "week", "month", "custom"].includes(period)) return;
    closePeriodPicker();
    selectedPeriod = period;
    if (period === "week") {
      selectedDate = dateKey(Date.now());
      weekAnchor = "end";
    }
    executionExpanded = "";
    queuedExecutionPage = null;
    currentSession = scopeSession();
    const value = selection();
    executionState = executionStateFor(value);
    cancelSupersededRequests(value);
    renderPeriod();
    renderSnapshot();
    renderToolCalls();
    scheduleSelectionLoad(value);
    if (period === "custom") openPeriodPicker();
  }

  function refreshSelection() {
    currentSession = scopeSession();
    executionExpanded = "";
    queuedExecutionPage = null;
    const value = selection();
    executionState = executionStateFor(value);
    cancelSupersededRequests(value);
    renderPeriod();
    renderSnapshot();
    renderToolCalls();
    scheduleSelectionLoad(value);
  }

  function shiftPeriod(direction) {
    const date = new Date(dateAt(selectedDate));
    if (selectedPeriod === "month") {
      date.setDate(1);
      date.setMonth(date.getMonth() + direction);
    } else {
      date.setDate(date.getDate() + direction * (selectedPeriod === "week" ? 7 : 1));
    }
    selectedDate = dateKey(date);
    refreshSelection();
  }

  function showPanel() {
    if (!root || !panel || destroyed) return;
    if (closeTimer) window.clearTimeout(closeTimer);
    closeTimer = null;
    if (opened) return;
    opened = true;
    currentSession = scopeSession();
    const value = selection();
    executionState = executionStateFor(value);
    cancelSupersededRequests(value);
    positionPanel();
    panel.classList.add("is-visible");
    root.querySelector(".codex-daily-trigger").setAttribute("aria-expanded", "true");
    renderPeriod();
    renderSnapshot();
    renderToolCalls();
    scheduleSelectionLoad(value);
  }

  function createShareBlob() {
    const value = selection();
    const snapshot = snapshots.get(selectionKey(value));
    const data = snapshot?.data;
    if (!data?.available || !data.countsKnown) throw new Error("当前范围的用量尚未加载");
    const canvas = document.createElement("canvas");
    canvas.width = 1200;
    canvas.height = 1100;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("当前环境无法生成分享图片");
    const text = (content, x, y, size, color = "#fff", weight = 500, maxWidth = 1060) => {
      context.font = `${weight} ${size}px -apple-system, BlinkMacSystemFont, "Segoe UI", "Microsoft YaHei", sans-serif`;
      context.fillStyle = color;
      let label = String(content);
      if (context.measureText(label).width > maxWidth) {
        while (label.length && context.measureText(`${label}…`).width > maxWidth) label = label.slice(0, -1);
        label += "…";
      }
      context.fillText(label, x, y);
    };
    const rounded = (x, y, width, height, radius, fill, stroke) => {
      context.beginPath();
      context.roundRect(x, y, width, height, radius);
      context.fillStyle = fill;
      context.fill();
      if (stroke) {
        context.strokeStyle = stroke;
        context.lineWidth = 1.5;
        context.stroke();
      }
    };
    const muted = "rgba(226,232,255,.66)";
    const background = context.createLinearGradient(0, 0, 1200, 1100);
    background.addColorStop(0, "#070a18");
    background.addColorStop(.5, "#11132d");
    background.addColorStop(1, "#21104a");
    context.fillStyle = background;
    context.fillRect(0, 0, 1200, 1100);
    for (const [x, y, radius, color] of [[160, 120, 430, "35,160,255"], [1080, 800, 520, "153,72,255"]]) {
      const glow = context.createRadialGradient(x, y, 0, x, y, radius);
      glow.addColorStop(0, `rgba(${color},.34)`);
      glow.addColorStop(1, `rgba(${color},0)`);
      context.fillStyle = glow;
      context.fillRect(x - radius, y - radius, radius * 2, radius * 2);
    }
    context.fillStyle = "rgba(255,255,255,.035)";
    for (let x = 40; x < 1200; x += 42) {
      for (let y = 38; y < 1100; y += 42) {
        context.beginPath();
        context.arc(x, y, 1.5, 0, Math.PI * 2);
        context.fill();
      }
    }
    rounded(70, 58, 194, 46, 23, "rgba(65,166,255,.16)", "rgba(89,181,255,.35)");
    text("CODEX  /  TOKEN", 93, 89, 19, "#72c3ff", 700);
    context.textAlign = "right";
    text(`${formatDateTime(value.startAt)}  –  ${formatDateTime(value.endAt - 1)}`,
      1130, 87, 22, muted, 500, 810);
    context.textAlign = "left";
    text(({ day: "当日", week: "七日", month: "本月", custom: "区间" })[selectedPeriod] + "累计 TOKEN",
      72, 176, 27, muted, 600);
    const total = NUMBER_FORMATTER.format(data.input + data.output);
    const totalGradient = context.createLinearGradient(70, 205, 800, 330);
    totalGradient.addColorStop(0, "#fff");
    totalGradient.addColorStop(.55, "#a9ddff");
    totalGradient.addColorStop(1, "#c5a7ff");
    text(total, 66, 304, total.length > 12 ? 82 : total.length > 9 ? 98 : 116, totalGradient, 750);
    text(`${NUMBER_FORMATTER.format(data.calls)} 条用量记录 · ${value.scope === "all" ? "全部会话" : "当前会话"}${data.wholeDaysOnly ? " · 区间内整日用量" : ""}`,
      73, 350, 21, "rgba(226,232,255,.55)");
    const priceReady = snapshot.priceRevision === priceRevision;
    context.textAlign = "right";
    text(`估算成本 ${priceReady ? data.unpriced ? "部分未定价" : formatCost(data.cost) : "价格计算中"}`,
      1129, 350, 22, "rgba(114,195,255,.85)", 650);
    context.textAlign = "left";
    const metrics = [["输入 Token", data.input], ["输出 Token", data.output],
      ["缓存输入", data.cachedKnown ? data.cached : null], ["用量记录", data.calls]];
    metrics.forEach(([label, amount], index) => {
      const x = 70 + index * 272;
      rounded(x, 410, 250, 142, 24, "rgba(255,255,255,.075)", "rgba(255,255,255,.13)");
      rounded(x + 22, 432, 10, 10, 5, ["#4fb6ff", "#9d7cff", "#4ee4b1", "#ffb35a"][index]);
      text(label, x + 22, 473, 24, muted);
      text(amount == null ? "待核对" : formatNumber(amount, "fixed"), x + 22, 522, 34, "#fff", 700, 210);
    });
    rounded(70, 590, 1066, 188, 28, "rgba(5,8,24,.4)", "rgba(255,255,255,.1)");
    text(`范围${trendMetric === "cost" ? "费用" : " Token"}趋势`, 100, 635, 25, "#fff", 650);
    const trend = data.trend;
    const points = trendPoints(data.days, trend, value, data);
    const now = Date.now();
    const graphValues = points.map(point => {
      const start = Number.isFinite(point.startAt) ? point.startAt : dateAt(point.date);
      return start > now ? null : trendMetric === "cost"
        ? trendCost(point, !priceReady || selectedPeriod !== "month" && trend?.priceStale)
        : point.countsKnown === false ? null : point.total;
    });
    const maximum = Math.max(0, ...graphValues.filter(Number.isFinite));
    context.textAlign = "right";
    const partialTrendCost = trendMetric === "cost" && points.some((point, index) => point.unpriced && graphValues[index] != null);
    text(`${partialTrendCost ? "已计价" : ""}峰值 ${graphValues.some(Number.isFinite) ? trendMetric === "cost" ? formatCost(maximum) : formatNumber(maximum, "fixed") : "—"}`,
      1106, 635, 20, muted);
    context.textAlign = "left";
    const graph = { x: 104, y: 652, width: 998, height: 88 };
    context.strokeStyle = "rgba(255,255,255,.08)";
    context.lineWidth = 1;
    for (let index = 0; index < 3; index++) {
      context.beginPath();
      context.moveTo(graph.x, graph.y + graph.height * index / 2);
      context.lineTo(graph.x + graph.width, graph.y + graph.height * index / 2);
      context.stroke();
    }
    const firstAt = trend?.startAt ?? value.startAt;
    const lastAt = trend?.endAt ?? value.endAt;
    const coords = points.map((point, index) => {
      const start = Number.isFinite(point.startAt) ? point.startAt : dateAt(point.date);
      const end = Number.isFinite(point.endAt) ? point.endAt : addDays(dateAt(point.endDate || point.date), 1);
      const x = graph.x + graph.width * Math.max(0, Math.min(1, ((start + end) / 2 - firstAt) / (lastAt - firstAt)));
      return { x, start, end, y: graphValues[index] == null ? null :
        graph.y + graph.height - graph.height * graphValues[index] / Math.max(Number.EPSILON, maximum) };
    });
    const segments = [];
    let segment = [];
    for (const point of coords) {
      if (point.y == null || segment.length && point.start > segment.at(-1).end) {
        if (segment.length) segments.push(segment);
        segment = [];
      }
      if (point.y != null) segment.push(point);
    }
    if (segment.length) segments.push(segment);
    for (const line of segments) {
      const drawLine = () => {
        context.moveTo(line[0].x, line[0].y);
        for (let index = 1; index < line.length; index++) {
          const previous = line[index - 1];
          const point = line[index];
          const middle = (previous.x + point.x) / 2;
          context.bezierCurveTo(middle, previous.y, middle, point.y, point.x, point.y);
        }
      };
      const fill = context.createLinearGradient(0, graph.y, 0, graph.y + graph.height);
      fill.addColorStop(0, "rgba(76,181,255,.28)");
      fill.addColorStop(1, "rgba(123,92,255,.02)");
      context.beginPath();
      drawLine();
      context.lineTo(line.at(-1).x, graph.y + graph.height);
      context.lineTo(line[0].x, graph.y + graph.height);
      context.closePath();
      context.fillStyle = fill;
      context.fill();
      const stroke = context.createLinearGradient(graph.x, 0, graph.x + graph.width, 0);
      stroke.addColorStop(0, "#44b9ff");
      stroke.addColorStop(1, "#9b7cff");
      context.beginPath();
      drawLine();
      context.strokeStyle = stroke;
      context.lineWidth = 5;
      context.lineCap = "round";
      context.lineJoin = "round";
      context.stroke();
    }
    text(new Date(firstAt).toLocaleDateString(), 104, 758, 18, muted);
    context.textAlign = "right";
    text(new Date(lastAt - 1).toLocaleDateString(), 1102, 758, 18, muted);
    context.textAlign = "left";
    rounded(70, 800, 1066, 188, 28, "rgba(255,255,255,.07)", "rgba(255,255,255,.12)");
    text("工具调用", 100, 843, 25, "#fff", 650);
    const summary = executionSummaries.get(selectionKey(value))?.summary;
    const tools = [["技能加载", "skill", "#4ee4b1"], ["插件（含 MCP）", "plugin", "#4fb6ff"]];
    tools.forEach(([label, kind, color], index) => {
      const x = 100 + index * 509;
      rounded(x, 868, 497, 66, 16, "rgba(5,8,24,.32)");
      rounded(x + 14, 884, 8, 8, 4, color);
      text(label, x + 29, 893, 17, muted);
      text(`${summaryCount(summary, kind)} 次`, x + 14, 921, 20, "#fff", 700);
    });
    const status = data.uncertain || snapshot.complete === false || snapshot.countStatus?.complete === false
      ? "部分覆盖 · 待核对" : snapshot.classificationStatus?.complete === false ? "分类待核对" : "已提交用量";
    text(`${status}${data.precision === "day" ? " · 按日精度" : ""}`, 100, 961, 18, muted);
    const models = data.models.slice(0, 4).map(model => model.model).join(" / ");
    text(models ? `主力 Model：${models}` : "Model：暂无可识别数据", 72, 1034, 19, muted, 500, 840);
    text("数据来自本机 Codex++，成本按本地价格估算", 72, 1062, 19, muted, 500, 850);
    context.textAlign = "right";
    text("GENERATED LOCALLY", 1129, 1062, 19, "rgba(114,195,255,.8)", 650);
    return new Promise((resolve, reject) => {
      canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error("分享图片生成失败")), "image/png");
    });
  }

  async function copyShareImage() {
    if (!navigator.clipboard?.write || typeof window.ClipboardItem !== "function") {
      throw new Error("当前环境不支持复制图片");
    }
    const blob = createShareBlob();
    await navigator.clipboard.write([new window.ClipboardItem({ "image/png": blob })]);
    return blob;
  }

  function hidePanel() {
    clearExecutionImage();
    if (!root || !panel) return;
    closePeriodPicker();
    hideExecutionHover();
    hideActivityHover();
    opened = false;
    stopArchiveRefresh();
    if (executionMetadataTimer) window.clearTimeout(executionMetadataTimer);
    executionMetadataTimer = null;
    executionMetadataDue = 0;
    if (selectionTimer) window.clearTimeout(selectionTimer);
    selectionTimer = null;
    window.clearTimeout(selectionDetailsTimer);
    selectionDetailsTimer = null;
    cancelSupersededRequests({ ...localDayBounds(Date.now()), scope: "all", sessionId: "" });
    panel.classList.remove("is-visible");
    root.querySelector(".codex-daily-trigger").setAttribute("aria-expanded", "false");
  }

  function handleOutsidePointer(event) {
    if (opened && !pinned && !root?.contains(event.target) && !panel?.contains(event.target)) hidePanel();
  }

  function schedulePanelClose() {
    if (closeTimer) window.clearTimeout(closeTimer);
    closeTimer = window.setTimeout(() => {
      closeTimer = null;
      if (!pinned && !root?.matches(":hover") && !panel?.matches(":hover") &&
          !root?.contains(document.activeElement) && !panel?.contains(document.activeElement)) hidePanel();
    }, 180);
  }

  function bindEvents() {
    const trigger = root.querySelector(".codex-daily-trigger");
    const resize = panel.querySelector(".codex-daily-resize");
    const setPanelHeight = height => {
      const available = window.innerHeight - panel.getBoundingClientRect().top - 12;
      const base = Math.min(Math.max(240, available), height) - (toolsOpen ? 140 : 0);
      panel.style.setProperty("--daily-panel-height", `${Math.max(320, base)}px`);
      panel.style.height = "calc(var(--daily-panel-height) + var(--daily-tools-extra,0px))";
    };
    let resizeStart = null;
    resize.addEventListener("pointerdown", event => {
      if (event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();
      resizeStart = { y: event.clientY, height: panel.getBoundingClientRect().height };
      resize.setPointerCapture(event.pointerId);
    });
    resize.addEventListener("pointermove", event => {
      if (resizeStart) setPanelHeight(resizeStart.height + event.clientY - resizeStart.y);
    });
    for (const type of ["pointerup", "pointercancel", "lostpointercapture"]) {
      resize.addEventListener(type, () => { resizeStart = null; });
    }
    resize.addEventListener("keydown", event => {
      if (!["ArrowUp", "ArrowDown"].includes(event.key)) return;
      event.preventDefault();
      setPanelHeight(panel.getBoundingClientRect().height + (event.key === "ArrowUp" ? -32 : 32));
    });
    trigger.addEventListener("mouseenter", showPanel);
    trigger.addEventListener("focus", showPanel);
    trigger.addEventListener("mouseleave", schedulePanelClose);
    trigger.addEventListener("blur", schedulePanelClose);
    trigger.addEventListener("click", showPanel);
    document.addEventListener("pointerdown", handleOutsidePointer, true);
    const trendSvg = panel.querySelector(".codex-daily-trend-svg");
    const trendPlot = trendSvg.parentElement;
    const trendTooltip = panel.querySelector(".codex-daily-trend-tooltip");
    trendPlot.addEventListener("pointermove", updateTrendHover);
    trendPlot.addEventListener("pointerleave", () => {
      if (trendHover) {
        trendHover.index = -1;
        trendHover.pointer = null;
      }
      trendTooltip.hidden = true;
      trendSvg.querySelector(".codex-daily-trend-guide")?.setAttribute("visibility", "hidden");
      trendSvg.querySelector(".codex-daily-trend-focus")?.setAttribute("visibility", "hidden");
    });
    panel.querySelector(".codex-daily-model-list").addEventListener("toggle", event => {
      const item = event.target;
      if (!item.open || !item.matches(".codex-daily-model")) return;
      const parts = item.querySelector(".codex-daily-model-parts");
      if (parts.childElementCount) return;
      const snapshot = snapshots.get(selectionKey(selection()));
      const model = snapshot?.data.models.find(model => model.model === item.dataset.model);
      if (model) parts.innerHTML = modelProviderRows(model, snapshot.priceRevision === priceRevision);
    }, true);
    panel.addEventListener("mouseenter", () => {
      if (closeTimer) window.clearTimeout(closeTimer);
      closeTimer = null;
    });
    panel.addEventListener("mouseleave", schedulePanelClose);
    panel.addEventListener("keydown", event => {
      if (!event.target.matches("[data-token-number]") || !["Enter", " "].includes(event.key)) return;
      event.preventDefault();
      setMetric(trendMetric === "tokens" ? "cost" : "tokens");
    });
    panel.addEventListener("click", event => {
      if (!event.target.closest(".codex-daily-calendar, [data-action='toggle-calendar'], [data-period]")) {
        closePeriodPicker();
      }
      const target = event.target.closest("button, [data-token-number]");
      if (!target) return;
      if (target.dataset.detailPage) {
        const field = target.closest(".codex-daily-detail-field");
        setDetailPage(field, (executionDetailPages[field.dataset.detailField] || 0) + Number(target.dataset.detailPage));
        return;
      }
      if (target.hasAttribute("data-token-number")) {
        event.preventDefault();
        setMetric(trendMetric === "tokens" ? "cost" : "tokens");
        return;
      }
      if (target.dataset.period) return selectView(target.dataset.period);
      if (target.dataset.trendMetric) {
        setMetric(target.dataset.trendMetric);
        return;
      }
      if (target.dataset.kind) {
        hideExecutionHover();
        toolKind = target.dataset.kind;
        if (searchTimer) window.clearTimeout(searchTimer);
        searchTimer = null;
        const search = panel.querySelector(".codex-daily-execution-search").value.trim();
        if (search !== executionSearch) {
          cancelExecutionRequests();
          executionSearch = search;
        }
        executionState = executionStateFor(selection());
        executionState.page = 0;
        executionState.targetPage = 0;
        executionExpanded = "";
        queuedExecutionPage = null;
        executionScrollTop = 0;
        panel.querySelector(".codex-daily-execution-list").scrollTop = 0;
        renderToolCalls();
        void loadExecutions(selection());
        if (executionSearch && !executionSummaries.has(executionState.key)) {
          const unfiltered = executionStateFor(selection(), toolKind, "");
          void loadExecutions(unfiltered.value, unfiltered.targetPage, false, unfiltered.kind, "");
        }
        return;
      }
      if (target.dataset.executionIndex != null) {
        hideExecutionHover();
        const records = executionItems();
        const index = Number(target.dataset.executionIndex);
        const record = records[index];
        if (!record) return;
        const key = executionKey(record);
        const expandedIndex = records.findIndex(item => executionKey(item) === executionExpanded);
        const list = panel.querySelector(".codex-daily-execution-list");
        const anchor = index * EXECUTION_ROW_HEIGHT +
          (expandedIndex >= 0 && index > expandedIndex ? EXECUTION_DETAIL_HEIGHT : 0) - list.scrollTop;
        if (executionExpanded && executionExpanded !== key && queuedExecutionPage?.state === executionState) {
          if (queuedExecutionPage.reset) {
            executionExpanded = "";
            applyQueuedExecutionPage();
            executionState.error = "工具记录已变化，请重新选择";
            renderToolCalls();
            return;
          }
          const next = activateQueuedExecution(key, anchor);
          if (next === null) return;
          if (next) {
            void loadDetail(next, true, true);
            return;
          }
        }
        executionExpanded = executionExpanded === key ? "" : key;
        if (!executionExpanded) {
          scheduleDetailExpiry(null);
          applyQueuedExecutionPage();
        }
        renderToolCalls();
        if (executionExpanded) {
          const nextIndex = executionItems().findIndex(item => executionKey(item) === key);
          list.scrollTop = nextIndex * EXECUTION_ROW_HEIGHT - anchor;
          executionScrollTop = list.scrollTop;
          renderExecutionRows(true);
        }
        if (executionExpanded) void loadDetail(record, true, true);
        return;
      }
      switch (target.dataset.action) {
        case "toggle-number-format":
          compactNumbers = !compactNumbers;
          writeSetting(NUMBER_STORAGE_KEY, compactNumbers ? "compact" : "exact");
          renderSnapshot(false);
          return;
        case "expand-models":
        case "collapse-models":
          for (const model of panel.querySelectorAll(".codex-daily-model")) {
            model.open = target.dataset.action === "expand-models";
          }
          break;
        case "pin-panel":
          pinned = !pinned;
          target.setAttribute("aria-pressed", String(pinned));
          break;
        case "share": {
          if (shareTimer) window.clearTimeout(shareTimer);
          shareTimer = null;
          target.disabled = true;
          target.dataset.state = "pending";
          target.querySelector("span").textContent = "复制中";
          void copyShareImage().then(() => {
            if (destroyed) return;
            target.dataset.state = "success";
            target.querySelector("span").textContent = "已复制";
            target.title = "用量图片已复制";
          }, error => {
            console.error("Daily: 分享图片复制失败", error);
            if (destroyed) return;
            target.dataset.state = "error";
            target.querySelector("span").textContent = "复制失败";
            target.title = error.message;
          }).finally(() => {
            if (destroyed) return;
            target.disabled = false;
            shareTimer = window.setTimeout(() => {
              shareTimer = null;
              target.dataset.state = "";
              target.querySelector("span").textContent = "分享";
              target.title = "复制用量图片";
            }, 2500);
          });
          break;
        }
        case "cycle-theme":
          themeMode = THEME_MODES[(THEME_MODES.indexOf(themeMode) + 1) % THEME_MODES.length];
          writeSetting(THEME_STORAGE_KEY, themeMode);
          applyTheme();
          break;
        case "toggle-session-scope":
          sessionScope = sessionScope === "all" ? "current" : "all";
          refreshSelection();
          break;
        case "toggle-prices": {
          const prices = panel.querySelector(".codex-daily-price-panel");
          prices.hidden = !prices.hidden;
          target.setAttribute("aria-expanded", String(!prices.hidden));
          if (!prices.hidden) {
            renderPrices();
            refreshProviderPricing(snapshots.get(selectionKey(selection())));
          }
          break;
        }
        case "previous-day": shiftPeriod(-1); break;
        case "next-day": shiftPeriod(1); break;
        case "toggle-calendar": {
          const calendar = panel.querySelector(".codex-daily-calendar");
          if (!calendar.hidden) closePeriodPicker();
          else {
            openPeriodPicker();
            (calendar.querySelector('[aria-pressed="true"]:not(:disabled)') ||
              calendar.querySelector("[data-calendar-date]:not(:disabled)"))?.focus({ preventScroll: true });
          }
          break;
        }
        case "previous-execution-page":
        case "next-execution-page": {
          if (!executionState) break;
          const page = executionState.page + (target.dataset.action === "next-execution-page" ? 1 : -1);
          if (page < 0) break;
          executionState.targetPage = page;
          executionState.error = "";
          executionExpanded = "";
          queuedExecutionPage = null;
          executionScrollTop = 0;
          panel.querySelector(".codex-daily-execution-list").scrollTop = 0;
          const cached = executionState.pages.get(page);
          if (cached) {
            executionState.page = page;
            renderToolCalls();
          } else void loadExecutions(selection(), page, true);
          break;
        }
        case "clear-price": {
          const form = target.closest("[data-price-model]");
          const model = form.dataset.priceModel;
          const next = { ...priceConfig, models: { ...priceConfig.models }, sources: { ...priceConfig.sources } };
          next.models[model] = normalizePrice(null);
          delete next.sources[model];
          if (JSON.stringify(next) === JSON.stringify(priceConfig)) break;
          if (writeSetting(PRICE_STORAGE_KEY, JSON.stringify(next))) {
            priceConfig = next;
            invalidatePrices();
            renderSnapshot();
            renderPrices();
            refreshProviderPricing(snapshots.get(selectionKey(selection())));
          }
          break;
        }
      }
    });
    panel.addEventListener("submit", event => {
      event.preventDefault();
      const form = event.target;
      if (form.matches(".codex-daily-price-add")) {
        const name = modelName(form.elements.model.value);
        if (name !== UNKNOWN_MODEL) {
          if (!Object.hasOwn(priceConfig.models, name)) {
            const next = { ...priceConfig, models: { ...priceConfig.models, [name]: normalizePrice(null) } };
            const serialized = JSON.stringify(next);
            if (serialized.length > 256000) {
              storageWarning = "价格设置超过容量";
              renderStatus();
              return;
            }
            if (!writeSetting(PRICE_STORAGE_KEY, serialized)) return;
            priceConfig = next;
          }
          rememberPriceModel(name);
          form.reset();
          renderPrices();
          refreshProviderPricing(snapshots.get(selectionKey(selection())));
        }
      } else if (form.matches("[data-price-model]")) {
        savePriceRow(form);
      }
    });
    const prices = panel.querySelector(".codex-daily-price-panel");
    prices.addEventListener("focusout", event => {
      if (prices.contains(event.relatedTarget)) return;
      window.setTimeout(() => { if (!destroyed) renderPrices(false); }, 0);
    });
    panel.addEventListener("change", event => {
      const field = event.target.closest(".codex-daily-detail-field");
      if (!field || !event.target.matches('input[type="number"]')) return;
      const page = Number(event.target.value);
      setDetailPage(field, Number.isInteger(page) && page > 0 ? page - 1 : 0);
    });
    panel.querySelector(".codex-daily-date-input").addEventListener("change", event => {
      if (Number.isFinite(dateAt(event.currentTarget.value))) {
        selectedDate = event.currentTarget.value;
        refreshSelection();
      }
    });
    const calendar = panel.querySelector(".codex-daily-calendar");
    calendar.addEventListener("click", handleCalendarClick);
    for (const type of ["pointerover", "focusin"]) calendar.addEventListener(type, event => {
      const target = event.target.closest("[data-calendar-date]");
      if (target && !target.disabled && (selectedPeriod === "week" || selectedPeriod === "custom" && rangeAnchor)) {
        previewDate = target.dataset.calendarDate;
        updateRangePreview();
      }
    });
    calendar.addEventListener("pointerleave", () => { previewDate = ""; updateRangePreview(); });
    panel.querySelector(".codex-daily-tools").addEventListener("toggle", event => {
      toolsOpen = event.currentTarget.open;
      panel.classList.toggle("tools-open", toolsOpen);
      if (toolsOpen) {
        renderToolCalls();
        void loadExecutions(selection());
      } else {
        hideActivityHover();
        if (executionMetadataTimer) window.clearTimeout(executionMetadataTimer);
        executionMetadataTimer = null;
        executionMetadataDue = 0;
        panel.querySelector(".codex-daily-timeline-axis").hidden = true;
        renderStatus();
      }
    });
    const executionList = panel.querySelector(".codex-daily-execution-list");
    for (const type of ["pointerover", "focusin"]) executionList.addEventListener(type, event => {
      const button = event.target.closest("[data-execution-index]");
      if (!button || button.contains(event.relatedTarget)) return;
      const record = executionItems()[Number(button.dataset.executionIndex)];
      if (record) showExecutionHover(record, button);
    });
    for (const type of ["pointerout", "focusout"]) executionList.addEventListener(type, event => {
      const button = event.target.closest("[data-execution-index]");
      if (button && !button.contains(event.relatedTarget)) hideExecutionHover();
    });
    executionList.addEventListener("scroll", event => {
      hideExecutionHover();
      executionScrollTop = event.currentTarget.scrollTop;
      if (scrollFrame) return;
      scrollFrame = window.requestAnimationFrame(() => {
        scrollFrame = null;
        renderExecutionRows();
      });
    }, { passive: true });
    panel.querySelector(".codex-daily-execution-days-list").addEventListener("scroll", () => {
      if (dayScrollFrame) return;
      dayScrollFrame = window.requestAnimationFrame(() => {
        dayScrollFrame = null;
        renderExecutionDays();
      });
    }, { passive: true });
    const activityList = panel.querySelector(".codex-daily-activity-list");
    activityList.addEventListener("pointermove", updateActivityHover);
    activityList.addEventListener("pointerleave", hideActivityHover);
    activityList.addEventListener("focusin", event => {
      if (event.target.matches(".codex-daily-activity-timeline")) updateActivityHover(event, 0);
    });
    activityList.addEventListener("focusout", hideActivityHover);
    activityList.addEventListener("keydown", event => {
      if (!event.target.matches(".codex-daily-activity-timeline")) return;
      if (event.key === "Escape") {
        event.stopPropagation();
        hideActivityHover();
      } else if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        event.preventDefault();
        const marks = activityTimelines.get(event.target).marks;
        const index = Math.max(0, Math.min(marks.length - 1,
          (activityHover?.keyboardIndex ?? 0) + (event.key === "ArrowRight" ? 1 : -1)));
        updateActivityHover(event, index);
      }
    });
    panel.querySelector(".codex-daily-scroll-body").addEventListener("scroll", hideActivityHover,
      { capture: true, passive: true });
    activityList.addEventListener("scroll", () => {
      if (activityScrollFrame) return;
      activityScrollFrame = window.requestAnimationFrame(() => {
        activityScrollFrame = null;
        renderActivityRows();
      });
    }, { passive: true });
    panel.querySelector(".codex-daily-execution-search").addEventListener("input", event => {
      if (searchTimer) window.clearTimeout(searchTimer);
      const value = event.currentTarget.value.trim();
      searchTimer = window.setTimeout(() => {
        searchTimer = null;
        cancelExecutionRequests();
        executionSearch = value;
        executionState = executionStateFor(selection());
        executionExpanded = "";
        queuedExecutionPage = null;
        executionScrollTop = 0;
        panel.querySelector(".codex-daily-execution-list").scrollTop = 0;
        renderToolCalls();
        void loadExecutions(selection(), 0, true);
        if (value && !executionSummaries.has(executionState.key)) {
          const unfiltered = executionStateFor(selection(), toolKind, "");
          void loadExecutions(unfiltered.value, unfiltered.targetPage, false, unfiltered.kind, "");
        }
      }, 180);
    });
    panel.addEventListener("keydown", event => {
      if (event.key === "Escape" && !calendar.hidden) {
        event.preventDefault();
        event.stopPropagation();
        closePeriodPicker(true);
        return;
      }
      if (event.key === "Escape") {
        pinned = false;
        panel.querySelector('[data-action="pin-panel"]').setAttribute("aria-pressed", "false");
        hidePanel();
      }
      if (!event.target.closest(".codex-daily-calendar") || !/^Arrow(Left|Right|Up|Down)$/.test(event.key)) return;
      const timeOption = event.target.closest("[data-time-part]");
      if (timeOption) {
        const options = [...timeOption.parentElement.querySelectorAll("button")];
        const step = /Up|Left/.test(event.key) ? -1 : 1;
        event.preventDefault();
        options[Math.max(0, Math.min(options.length - 1, options.indexOf(timeOption) + step))].focus();
        return;
      }
      const cells = [...calendar.querySelectorAll("[data-calendar-date]:not(:disabled)")];
      const current = cells.indexOf(event.target);
      if (current < 0) return;
      const columns = selectedPeriod === "month" ? 3 : 7;
      const step = event.key === "ArrowLeft" ? -1 : event.key === "ArrowRight" ? 1 :
        event.key === "ArrowUp" ? -columns : columns;
      event.preventDefault();
      cells[Math.max(0, Math.min(cells.length - 1, current + step))].focus();
    });
  }

  function poll() {
    pollTimer = null;
    if (destroyed || document.hidden) return;
    pollTimer = window.setTimeout(poll, POLL_MS);
    if (selectionTimer !== null) return;
    const today = { ...localDayBounds(Date.now()), scope: "all", sessionId: "" };
    void loadHistory(today, false, false);
    const nextSession = scopeSession();
    if (sessionScope === "current" &&
        (nextSession.id !== currentSession.id || nextSession.hostKnown !== currentSession.hostKnown ||
         nextSession.remote !== currentSession.remote)) {
      currentSession = nextSession;
      executionExpanded = "";
      queuedExecutionPage = null;
      executionState = executionStateFor(selection());
      cancelSupersededRequests(selection());
      if (opened) {
        renderSnapshot();
        renderToolCalls();
      }
    }
    if (opened && selectionDetailsTimer === null) {
      const value = selection();
      const key = selectionKey(value);
      const current = snapshots.get(key);
      if (key !== selectionKey(today) || !value.calendarDays) {
        void loadHistory(value, false, !value.calendarDays && !!current);
      }
      if (toolsOpen) {
        // 搜索列表只在详情版本过期时刷新；统计仍使用未筛选结果。
        const unfiltered = executionStateFor(value, toolKind, "");
        void loadExecutions(value, unfiltered.targetPage, false, unfiltered.kind, "");
        const searched = executionState;
        if (searched?.search && searched.page === 0 && searched.targetPage === 0 && !executionExpanded &&
            searched.staleDetailRevision != null && searched.staleDetailRevision === searched.revision) {
          void loadExecutions(value, 0, false, searched.kind, searched.search);
        }
      }
    }
    preloadRecentSummary();
    void preloadMainViews();
  }

  function handleVisibility() {
    if (pollTimer) window.clearTimeout(pollTimer);
    pollTimer = null;
    if (document.hidden) stopArchiveRefresh();
    if (!document.hidden) poll();
  }

  function handleStorage(event) {
    if (event.key === THEME_STORAGE_KEY || event.key === null) {
      const value = readSetting(THEME_STORAGE_KEY, "auto");
      themeMode = THEME_MODES.includes(value) ? value : "auto";
      applyTheme();
    }
    if (event.key === NUMBER_STORAGE_KEY || event.key === null) {
      const next = readSetting(NUMBER_STORAGE_KEY, "compact") !== "exact";
      if (next !== compactNumbers) {
        compactNumbers = next;
        renderSnapshot(false);
      }
    }
    if (event.key === PRICE_STORAGE_KEY || event.key === null) {
      const next = readPriceConfig();
      if (JSON.stringify(next) === JSON.stringify(priceConfig)) return;
      priceConfig = next;
      for (const model of [...Object.keys(priceConfig.models), ...Object.keys(priceConfig.sources)]) {
        rememberPriceModel(model);
      }
      invalidatePrices();
      renderSnapshot();
    }
  }

  function destroy() {
    if (destroyed) return;
    destroyed = true;
    stopArchiveRefresh();
    clearExecutionImage();
    nativeImageDialog?.();
    hideActivityHover();
    if (pollTimer) window.clearTimeout(pollTimer);
    if (closeTimer) window.clearTimeout(closeTimer);
    if (searchTimer) window.clearTimeout(searchTimer);
    if (shareTimer) window.clearTimeout(shareTimer);
    if (selectionTimer) window.clearTimeout(selectionTimer);
    window.clearTimeout(selectionDetailsTimer);
    if (executionHoverTimer) window.clearTimeout(executionHoverTimer);
    if (executionMetadataTimer) window.clearTimeout(executionMetadataTimer);
    for (const task of inFlight.values()) task.cancel();
    for (const work of historyWork.values()) work.cancel();
    if (scrollFrame) window.cancelAnimationFrame(scrollFrame);
    if (dayScrollFrame) window.cancelAnimationFrame(dayScrollFrame);
    if (activityScrollFrame) window.cancelAnimationFrame(activityScrollFrame);
    if (detailExpiryTimer) window.clearTimeout(detailExpiryTimer);
    themeObserver?.disconnect();
    captionResizeObserver?.disconnect();
    sessionService?.dispose();
    themeMedia?.removeEventListener?.("change", applyTheme);
    document.removeEventListener("DOMContentLoaded", start);
    document.removeEventListener("visibilitychange", handleVisibility);
    document.removeEventListener("pointerdown", handleOutsidePointer, true);
    window.removeEventListener("storage", handleStorage);
    root?.remove();
    panel?.remove();
    style?.remove();
    snapshots.clear();
    executionStates.clear();
    executionSummaries.clear();
    executionMetadata.clear();
    sessionTitles.clear();
    snapshotWeight = 0;
    details.clear();
    detailExpiryRecord = null;
    if (window[API_KEY] === api) delete window[API_KEY];
  }

  const api = {
    version: VERSION,
    build: BUILD_ID,
    refresh: () => loadHistory(selection(), true),
    getSelectedDate: () => selectedDate,
    selectDate(value) {
      if (!Number.isFinite(dateAt(value))) return false;
      selectedDate = value;
      refreshSelection();
      return true;
    },
    selectPeriod(period) {
      if (!["day", "week", "month", "custom"].includes(period)) return false;
      selectView(period);
      return true;
    },
    selectCustomRange(startAt, endAt) {
      if (!Number.isFinite(startAt) || !Number.isFinite(endAt) || startAt >= endAt) return false;
      customRange = { startAt, endAt };
      selectedDate = dateKey(startAt);
      selectedPeriod = "custom";
      closePeriodPicker();
      refreshSelection();
      return true;
    },
    selectSessionScope(scope) {
      if (!["all", "current"].includes(scope)) return false;
      sessionScope = scope;
      refreshSelection();
      return true;
    },
    getSessionScope: () => sessionScope,
    selectTheme(mode) {
      if (!THEME_MODES.includes(mode)) return false;
      themeMode = mode;
      writeSetting(THEME_STORAGE_KEY, mode);
      applyTheme();
      return true;
    },
    getThemeMode: () => themeMode,
    getResolvedTheme: resolvedTheme,
    getDefaultModelPrices: () => structuredClone(DEFAULT_MODEL_PRICES),
    getModelPrices: () => structuredClone(priceConfig.models),
    createShareBlob,
    copyShareImage,
    getPeriodSnapshot() {
      const value = selection();
      const snapshot = snapshots.get(selectionKey(value));
      return snapshot?.data || null;
    },
    destroy,
    __test: {
      aggregate, selectDays, usageValue, modelName, modelPriceId, priceInfo, calculateCost,
      dateKey, dateAt, addDays, localDayBounds, rangeFor, selectionKey, queryFor, scopeSession,
      request, loadHistory, loadExecutions, loadDetail, loadProviderPrices, loadProviderRanking,
      putDetail, cachedDetail, formatDuration,
      nearbyActivityMarks,
      queuedExecutionItems: () => queuedExecutionPage?.pageData?.items || [],
      cacheStatus: () => ({ snapshots: snapshots.size, inFlight: inFlight.size,
        snapshotWeight, details: details.size, detailChars, failures: failures.size }),
    },
  };

  window[API_KEY] = api;
  ctx.effect(() => destroy);
  if (typeof window.codexPlus?.onCleanup === "function") {
    window.codexPlus.onCleanup(destroy);
  } else if (typeof window.__codexPlusUserScripts?.registerCleanup === "function") {
    window.__codexPlusUserScripts.registerCleanup(destroy);
  }

  function start() {
    if (destroyed || root) return;
    themeMedia = window.matchMedia?.("(prefers-color-scheme: dark)") || null;
    themeMedia?.addEventListener?.("change", applyTheme);
    installStyle();
    createRoot();
    themeObserver = new MutationObserver(() => {
      if (themeMode === "auto") applyTheme();
    });
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "data-theme", "style"] });
    themeObserver.observe(document.body, { attributes: true, attributeFilter: ["class", "data-theme", "style"] });
    document.addEventListener("visibilitychange", handleVisibility);
    ctx.onScan(mountWindowEntry);
    ctx.listen(window, "resize", layoutWindowEntry);
    if (navigator.windowControlsOverlay) {
      ctx.listen(navigator.windowControlsOverlay, "geometrychange", layoutWindowEntry);
    }
    window.addEventListener("storage", handleStorage);
    poll();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
  else window.setTimeout(start, 0);
});

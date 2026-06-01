(() => {
  "use strict";

  const SCRIPT_ID = "codex-token-usage";
  const BADGE_CLASS = "codex-token-usage-badge";
  const STYLE_ID = "codex-token-usage-style";
  const RECENT_LIMIT = 20;
  const CONTEXT_POLL_INTERVAL_MS = 1000;
  const TURN_IDLE_TIMEOUT_MS = 120000;
  const STORAGE_KEY = "__codexTokenUsageRecentDetails";

  if (window.__codexTokenUsageScriptInstalled) return;
  window.__codexTokenUsageScriptInstalled = true;

  const state = {
    lastMetric: null,
    lastMetricKey: "",
    recent: [],
    byConversation: Object.create(null),
    activeConversationId: "",
    currentTurn: null,
    turnSeq: 0,
    turnStartedAt: 0,
    contextPollTimer: 0,
  };

  function normalizeNumber(value) {
    const number = Number(value);
    return Number.isFinite(number) && number >= 0 ? Math.round(number) : 0;
  }

  function normalizeUsage(raw) {
    if (!raw || typeof raw !== "object") return null;
    const inputTokens = normalizeNumber(raw.input_tokens ?? raw.inputTokens ?? raw.prompt_tokens ?? raw.promptTokens);
    const outputTokens = normalizeNumber(
      raw.output_tokens ?? raw.outputTokens ?? raw.completion_tokens ?? raw.completionTokens,
    );
    const totalTokens = normalizeNumber(
      raw.total_tokens ?? raw.totalTokens ?? raw.usedTokens ?? raw.used_tokens ?? raw.used ?? inputTokens + outputTokens,
    );
    const cachedTokens = normalizeNumber(
      raw.cached_tokens ??
        raw.cachedTokens ??
        raw.cached_input_tokens ??
        raw.cachedInputTokens ??
        raw.prompt_tokens_details?.cached_tokens ??
        raw.promptTokensDetails?.cachedTokens ??
        raw.input_tokens_details?.cached_tokens ??
        raw.inputTokensDetails?.cachedTokens,
    );
    const cacheReadTokens = normalizeNumber(raw.cache_read_input_tokens ?? raw.cacheReadInputTokens);
    const cacheCreationTokens = normalizeNumber(raw.cache_creation_input_tokens ?? raw.cacheCreationInputTokens);
    const contextLimit = normalizeNumber(raw.modelContextWindow ?? raw.model_context_window ?? raw.contextWindow ?? raw.context_window ?? raw.limit);
    if (
      !inputTokens &&
      !outputTokens &&
      !totalTokens &&
      !cachedTokens &&
      !cacheReadTokens &&
      !cacheCreationTokens &&
      !contextLimit
    ) {
      return null;
    }
    return {
      inputTokens,
      outputTokens,
      totalTokens,
      cachedTokens,
      cacheReadTokens,
      cacheCreationTokens,
      hasBreakdown: !!(inputTokens || outputTokens || cachedTokens || cacheReadTokens || cacheCreationTokens),
      contextUsed: totalTokens,
      contextLimit,
    };
  }

  function findUsageInObject(value, depth = 0) {
    if (!value || depth > 8) return null;
    if (Array.isArray(value)) {
      for (const item of value) {
        const usage = findUsageInObject(item, depth + 1);
        if (usage) return usage;
      }
      return null;
    }
    if (typeof value !== "object") return null;

    const totalTokenUsage = value.totalTokenUsage || value.total_token_usage;
    if (totalTokenUsage) {
      const totalUsage = normalizeUsage({
        ...totalTokenUsage,
        modelContextWindow: value.modelContextWindow ?? value.model_context_window,
        contextWindow: value.contextWindow ?? value.context_window,
      });
      if (totalUsage) return totalUsage;
    }

    const tokenStatus = value.last || value.lastUsage || value.lastTokenUsage || value.last_token_usage;
    if (tokenStatus && (value.modelContextWindow || value.model_context_window || value.contextWindow || value.context_window)) {
      const statusUsage = normalizeUsage({
        ...tokenStatus,
        modelContextWindow: value.modelContextWindow ?? value.model_context_window,
        contextWindow: value.contextWindow ?? value.context_window,
      });
      if (statusUsage) return statusUsage;
    }

    for (const key of ["usage", "last", "lastUsage", "lastTokenUsage", "last_token_usage"]) {
      const direct = normalizeUsage(value[key]);
      if (direct) return direct;
    }

    const self = normalizeUsage(value);
    if (self) return self;

    for (const key of [
      "response",
      "data",
      "body",
      "message",
      "result",
      "event",
      "params",
      "tokenUsage",
      "token_usage",
      "contextUsage",
      "context_usage",
      "info",
    ]) {
      const usage = findUsageInObject(value[key], depth + 1);
      if (usage) return usage;
    }
    return null;
  }

  function extractJsonFragmentsFromSse(text) {
    return String(text || "")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trim())
      .filter((line) => line && line !== "[DONE]");
  }

  function extractUsage(payload) {
    if (typeof payload === "string") {
      try {
        const parsed = JSON.parse(payload);
        const usage = findUsageInObject(parsed);
        if (usage) return usage;
      } catch (_) {
        // Treat non-JSON text as a possible SSE stream below.
      }
      for (const fragment of extractJsonFragmentsFromSse(payload)) {
        try {
          const usage = findUsageInObject(JSON.parse(fragment));
          if (usage) return usage;
        } catch (_) {
          // Ignore malformed stream fragments.
        }
      }
      return null;
    }
    return findUsageInObject(payload);
  }

  function formatNumber(value) {
    return normalizeNumber(value).toLocaleString("en-US");
  }

  function formatSeconds(elapsedMs) {
    return `${(Math.max(0, normalizeNumber(elapsedMs)) / 1000).toFixed(1)}s`;
  }

  function usageHasBreakdown(usage) {
    return !!(
      usage &&
      (usage.hasBreakdown ||
        usage.inputTokens ||
        usage.outputTokens ||
        usage.cachedTokens ||
        usage.cacheReadTokens ||
        usage.cacheCreationTokens)
    );
  }

  function formatCacheDetails(usage) {
    const cacheTokens = usage.cachedTokens || usage.cacheReadTokens || 0;
    if (!cacheTokens) return [];
    const details = [`缓存命中 ${formatNumber(cacheTokens)}`];
    if (usage.inputTokens) {
      const ratio = Math.min(100, Math.max(0, (cacheTokens / usage.inputTokens) * 100));
      details.push(`缓存命中率 ${ratio.toFixed(1)}%`);
    }
    if (usage.cacheCreationTokens) details.push(`缓存写 ${formatNumber(usage.cacheCreationTokens)}`);
    return details;
  }

  function formatBadgeText(metric) {
    if (metric?.status === "running") return "运行中 · 正在统计本次回复 token...";
    const usage = metric?.usage || {};
    const parts = [`总计 ${formatNumber(usage.totalTokens)}`];
    if (usageHasBreakdown(usage)) {
      parts.push(`输入 ${formatNumber(usage.inputTokens)}`, `输出 ${formatNumber(usage.outputTokens)}`, ...formatCacheDetails(usage));
    } else {
      parts.push("输入 -", "输出 -");
    }
    if (usage.contextLimit) {
      const contextUsed = usage.contextUsed || usage.totalTokens;
      const contextPercent = usage.contextLimit ? ` (${((contextUsed / usage.contextLimit) * 100).toFixed(1)}%)` : "";
      parts.push(`上下文 ${formatNumber(contextUsed)}/${formatNumber(usage.contextLimit)}${contextPercent}`);
    }
    if (metric?.callCount >= 1) parts.push(`调用 ${formatNumber(metric.callCount)} 次`);
    parts.push(`耗时 ${Number.isFinite(metric?.elapsedMs) && metric.elapsedMs > 0 ? formatSeconds(metric.elapsedMs) : "-"}`);
    return parts.join(" · ");
  }

  function parseElapsedMs(text) {
    const value = String(text || "");
    const patterns = [
      /(?:已处理|处理耗时|耗时|Processed)\s*(?:(\d+(?:\.\d+)?)\s*(?:m|min|分钟|分))?\s*(?:(\d+(?:\.\d+)?)\s*(?:s|sec|秒))?/gi,
      /(?:已处理|处理耗时|耗时|Processed)\s*(\d+(?:\.\d+)?)\s*(?:s|sec|秒)?/gi,
    ];
    let best = 0;
    for (const pattern of patterns) {
      let match = pattern.exec(value);
      while (match) {
        const first = Number(match[1] || 0);
        const second = Number(match[2] || 0);
        const seconds = match.length > 2 ? first * 60 + second : first;
        if (Number.isFinite(seconds) && seconds > best) best = seconds;
        match = pattern.exec(value);
      }
    }
    return best ? Math.round(best * 1000) : 0;
  }

  function nowMs() {
    return window.performance?.now ? window.performance.now() : Date.now();
  }

  function isCodexApiUrl(url) {
    const text = String(url || "");
    return /\/(responses|chat\/completions|conversation|thread|api)\b/i.test(text) || /codex/i.test(text);
  }

  function requestUrl(input) {
    if (typeof input === "string") return input;
    if (input?.url) return input.url;
    return String(input || "");
  }

  function normalizeConversationId(value) {
    const text = String(value || "").trim();
    if (!text || text === "__proto__" || text === "prototype" || text === "constructor") return "";
    return /^[A-Za-z0-9_.:-]{3,180}$/.test(text) ? text : "";
  }

  function conversationIdFromLocation() {
    const locationText = `${window.location?.pathname || ""}${window.location?.search || ""}${window.location?.hash || ""}`;
    const match = locationText.match(/(?:session|conversation|thread)(?:\/|=|:|-)([A-Za-z0-9_.:-]+)/i)
      || locationText.match(/\/([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})(?:[/?#]|$)/)
      || locationText.match(/\/([A-Za-z0-9_-]{12,})(?:[/?#]|$)/);
    return normalizeConversationId(match?.[1]);
  }

  function conversationIdFromActiveRow() {
    try {
      const row = document.querySelector?.(
        "[data-app-action-sidebar-thread-active='true'],[aria-current='page'],[aria-current='true']",
      );
      const id = row?.getAttribute?.("data-app-action-sidebar-thread-id")
        || row?.getAttribute?.("data-session-id")
        || row?.getAttribute?.("data-testid");
      return normalizeConversationId(id);
    } catch (_) {
      return "";
    }
  }

  function currentConversationId() {
    const live = conversationIdFromActiveRow() || conversationIdFromLocation();
    return live || state.activeConversationId;
  }

  function scopedMetric(metric) {
    const conversationId = normalizeConversationId(metric?.conversationId) || currentConversationId();
    return conversationId ? { ...metric, conversationId } : metric;
  }

  function conversationMatchesActive(metric) {
    const active = currentConversationId();
    const metricConversationId = normalizeConversationId(metric?.conversationId);
    return active ? metricConversationId === active : true;
  }

  function metricForActiveConversation() {
    const active = currentConversationId();
    if (state.currentTurn && !state.currentTurn.calls.length && state.currentTurn.status === "running") {
      if (!active || !state.currentTurn.conversationId || active === state.currentTurn.conversationId) {
        return {
          status: "running",
          conversationId: state.currentTurn.conversationId || active,
          startedAt: state.currentTurn.startedAt,
          elapsedMs: elapsedSinceTurnStarted(),
          source: "turn-running",
        };
      }
    }
    if (active && state.byConversation[active]) return state.byConversation[active];
    return conversationMatchesActive(state.lastMetric) ? state.lastMetric : null;
  }

  function setActiveConversationId(conversationId) {
    const next = normalizeConversationId(conversationId);
    const previous = state.activeConversationId;
    if (previous === next) return;
    state.activeConversationId = next;
    if (state.currentTurn && state.currentTurn.conversationId && state.currentTurn.conversationId !== next) {
      state.currentTurn = null;
      state.turnStartedAt = 0;
    }
    scheduleRender();
  }

  function metricKey(metric) {
    const usage = metric?.usage || {};
    return [
      metric?.conversationId || "",
      metric?.source || "",
      usage.totalTokens || 0,
      usage.inputTokens || 0,
      usage.outputTokens || 0,
      usage.cachedTokens || 0,
      usage.cacheReadTokens || 0,
      usage.cacheCreationTokens || 0,
      usage.contextUsed || 0,
      usage.contextLimit || 0,
      metric?.callCount || 0,
      metric?.elapsedMs || 0,
    ].join(":");
  }

  function usageCallKey(metric) {
    const usage = metric?.usage || {};
    return [
      metric?.conversationId || "",
      usage.totalTokens || 0,
      usage.inputTokens || 0,
      usage.outputTokens || 0,
      usage.cachedTokens || 0,
      usage.cacheReadTokens || 0,
      usage.cacheCreationTokens || 0,
    ].join(":");
  }

  function createTurn(started = nowMs()) {
    state.turnSeq += 1;
    return {
      id: `${Date.now()}-${state.turnSeq}`,
      startedAt: started,
      lastUpdatedAt: started,
      calls: [],
      callKeys: new Set(),
      contextUsage: null,
      conversationId: currentConversationId(),
      elapsedMs: 0,
      status: "running",
    };
  }

  function beginTurn(started = nowMs()) {
    state.currentTurn = createTurn(started);
    state.turnStartedAt = started;
    return state.currentTurn;
  }

  function ensureTurnStarted(started = nowMs()) {
    if (
      !state.currentTurn ||
      (state.currentTurn.calls.length && started - state.currentTurn.lastUpdatedAt > TURN_IDLE_TIMEOUT_MS)
    ) {
      return beginTurn(started);
    }
    if (!state.turnStartedAt) state.turnStartedAt = state.currentTurn.startedAt || started;
    return state.currentTurn;
  }

  function markTurnStarted(started = nowMs()) {
    beginTurn(started);
    scheduleRender();
  }

  function markNetworkTurnStarted(started = nowMs()) {
    const turn = ensureTurnStarted(started);
    if (!turn.calls.length) scheduleRender();
  }

  function elapsedSinceTurnStarted() {
    return state.turnStartedAt ? nowMs() - state.turnStartedAt : 0;
  }

  function sameUsage(metric, other) {
    const usage = metric?.usage || {};
    const otherUsage = other?.usage || {};
    if (!usage.totalTokens || !otherUsage.totalTokens) return false;
    if (usage.totalTokens !== otherUsage.totalTokens) return false;
    if (metric.conversationId && other.conversationId && metric.conversationId !== other.conversationId) return false;
    return true;
  }

  function mergeUsage(preferredUsage, fallbackUsage) {
    const preferredHasBreakdown = usageHasBreakdown(preferredUsage);
    const fallbackHasBreakdown = usageHasBreakdown(fallbackUsage);
    const detailUsage = preferredHasBreakdown || !fallbackHasBreakdown ? preferredUsage : fallbackUsage;
    const contextUsage = preferredUsage.contextLimit ? preferredUsage : fallbackUsage.contextLimit ? fallbackUsage : preferredUsage.contextUsed ? preferredUsage : fallbackUsage;
    return {
      inputTokens: detailUsage.inputTokens || 0,
      outputTokens: detailUsage.outputTokens || 0,
      totalTokens: detailUsage.totalTokens || contextUsage.totalTokens || 0,
      cachedTokens: detailUsage.cachedTokens || 0,
      cacheReadTokens: detailUsage.cacheReadTokens || 0,
      cacheCreationTokens: detailUsage.cacheCreationTokens || 0,
      hasBreakdown: usageHasBreakdown(detailUsage),
      contextUsed: contextUsage.contextUsed || contextUsage.totalTokens || detailUsage.totalTokens || 0,
      contextLimit: contextUsage.contextLimit || detailUsage.contextLimit || 0,
    };
  }

  function mergeMetric(preferred, fallback) {
    return {
      ...fallback,
      ...preferred,
      usage: mergeUsage(preferred.usage || {}, fallback.usage || {}),
      elapsedMs: preferred.elapsedMs || fallback.elapsedMs || 0,
      conversationId: preferred.conversationId || fallback.conversationId || "",
      source: preferred.source || fallback.source,
    };
  }

  function findMergeCandidate(metric) {
    const matches = [...state.recent, ...readStoredDetails()].filter((item) => conversationMatchesActive(item) && sameUsage(metric, item));
    return matches.find((item) => usageHasBreakdown(item.usage)) || matches[0] || null;
  }

  function readStoredDetails() {
    try {
      const parsed = JSON.parse(window.sessionStorage?.getItem(STORAGE_KEY) || "[]");
      return Array.isArray(parsed) ? parsed.filter((item) => item?.usage) : [];
    } catch (_) {
      return [];
    }
  }

  function writeStoredDetails(metric) {
    if (!usageHasBreakdown(metric?.usage)) return;
    try {
      const recent = [metric, ...readStoredDetails().filter((item) => !sameUsage(metric, item))].slice(0, RECENT_LIMIT);
      window.sessionStorage?.setItem(STORAGE_KEY, JSON.stringify(recent));
    } catch (_) {
      // Storage can be unavailable in restricted renderer contexts.
    }
  }

  function aggregateTurnMetric(turn) {
    const usage = turn.calls.reduce(
      (total, call) => {
        const item = call.usage || {};
        total.inputTokens += item.inputTokens || 0;
        total.outputTokens += item.outputTokens || 0;
        total.totalTokens += item.totalTokens || item.inputTokens + item.outputTokens || 0;
        total.cachedTokens += item.cachedTokens || 0;
        total.cacheReadTokens += item.cacheReadTokens || 0;
        total.cacheCreationTokens += item.cacheCreationTokens || 0;
        return total;
      },
      {
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        cachedTokens: 0,
        cacheReadTokens: 0,
        cacheCreationTokens: 0,
      },
    );
    const lastCallUsage = turn.calls[turn.calls.length - 1]?.usage || {};
    const contextUsage = turn.contextUsage || (lastCallUsage.contextLimit ? lastCallUsage : null);
    usage.hasBreakdown = turn.calls.length > 0;
    usage.contextUsed = contextUsage?.contextUsed || contextUsage?.totalTokens || lastCallUsage.contextUsed || usage.totalTokens;
    usage.contextLimit = contextUsage?.contextLimit || lastCallUsage.contextLimit || 0;
    return {
      usage,
      elapsedMs: turn.elapsedMs,
      source: "turn-aggregate",
      conversationId: turn.conversationId,
      turnId: turn.id,
      callCount: turn.calls.length,
    };
  }

  function publishMetric(metric, storeDetails = true) {
    metric = scopedMetric(metric);
    const nextKey = metricKey(metric);
    if (nextKey && nextKey === state.lastMetricKey) {
      scheduleRender();
      return;
    }
    state.lastMetricKey = nextKey;
    state.lastMetric = {
      ...metric,
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      createdAt: new Date().toISOString(),
    };
    if (state.lastMetric.conversationId) state.byConversation[state.lastMetric.conversationId] = state.lastMetric;
    state.recent.unshift(state.lastMetric);
    state.recent = state.recent.slice(0, RECENT_LIMIT);
    window.__codexTokenUsage = {
      last: state.lastMetric,
      currentTurn: state.currentTurn
        ? {
            id: state.currentTurn.id,
            startedAt: state.currentTurn.startedAt,
            lastUpdatedAt: state.currentTurn.lastUpdatedAt,
            callCount: state.currentTurn.calls.length,
            conversationId: state.currentTurn.conversationId,
          }
        : null,
      recent: state.recent.slice(),
    };
    if (storeDetails) writeStoredDetails(state.lastMetric);
    scheduleRender();
  }

  function rememberContextMetric(metric) {
    metric = scopedMetric(metric);
    if (state.currentTurn?.calls.length) {
      state.currentTurn.contextUsage = metric.usage;
      state.currentTurn.conversationId = metric.conversationId || state.currentTurn.conversationId;
      state.currentTurn.elapsedMs = Math.max(state.currentTurn.elapsedMs || 0, metric.elapsedMs || 0);
      state.currentTurn.lastUpdatedAt = nowMs();
      publishMetric(aggregateTurnMetric(state.currentTurn), false);
      return;
    }
    if (state.lastMetric) {
      publishMetric(mergeMetric(state.lastMetric, metric), false);
      return;
    }
    publishMetric({ ...metric, callCount: 0 }, false);
  }

  function rememberUsageMetric(metric) {
    metric = scopedMetric(metric);
    const turn = ensureTurnStarted();
    if (metric.conversationId && turn.conversationId && metric.conversationId !== turn.conversationId) {
      beginTurn();
      return rememberUsageMetric(metric);
    }
    const key = usageCallKey(metric);
    const existing = turn.calls.find((call) => call.__usageCallKey === key);
    if (existing) {
      const merged = mergeMetric(metric, existing);
      Object.assign(existing, merged, { __usageCallKey: key });
    } else {
      const candidate = findMergeCandidate(metric);
      if (candidate) {
        metric = mergeMetric(metric, candidate);
      }
      turn.calls.push({ ...metric, __usageCallKey: key });
      turn.callKeys.add(key);
    }
    turn.conversationId = metric.conversationId || turn.conversationId;
    turn.status = "complete";
    turn.elapsedMs = Math.max(turn.elapsedMs || 0, metric.elapsedMs || elapsedSinceTurnStarted());
    turn.lastUpdatedAt = nowMs();
    publishMetric(aggregateTurnMetric(turn));
    writeStoredDetails(metric);
  }

  function rememberMetric(metric) {
    if (!metric?.usage) return;
    if (usageHasBreakdown(metric.usage)) {
      rememberUsageMetric(metric);
    } else {
      rememberContextMetric(metric);
    }
  }

  function parseResponseText(text, elapsedMs, url) {
    const usage = extractUsage(text);
    if (usage) rememberMetric({ usage, elapsedMs, url, source: "network" });
  }

  function inspectPayload(payload, source, conversationId) {
    const usage = extractUsage(payload);
    if (usage) {
      rememberMetric({ usage, elapsedMs: elapsedSinceTurnStarted(), source, conversationId });
      return true;
    }
    return false;
  }

  function inspectPayloadText(text, source, conversationId) {
    return inspectPayload(text, source, conversationId);
  }

  function installFetchObserver() {
    if (typeof window.fetch !== "function" || window.fetch.__codexTokenUsageWrapped) return;
    const originalFetch = window.fetch.bind(window);
    function wrappedFetch(input, init) {
      const url = requestUrl(input);
      const started = nowMs();
      if (isCodexApiUrl(url)) markNetworkTurnStarted(started);
      return originalFetch(input, init).then((response) => {
        if (isCodexApiUrl(url) && response?.clone) {
          response
            .clone()
            .text()
            .then((text) => parseResponseText(text, nowMs() - started, url))
            .catch(() => {});
        }
        return response;
      });
    }
    wrappedFetch.__codexTokenUsageWrapped = true;
    window.fetch = wrappedFetch;
  }

  function installXhrObserver() {
    const Xhr = window.XMLHttpRequest;
    if (!Xhr || Xhr.prototype.__codexTokenUsageWrapped) return;
    const originalOpen = Xhr.prototype.open;
    const originalSend = Xhr.prototype.send;
    Xhr.prototype.open = function open(method, url, ...rest) {
      this.__codexTokenUsageUrl = url;
      return originalOpen.call(this, method, url, ...rest);
    };
    Xhr.prototype.send = function send(...args) {
      const started = nowMs();
      if (isCodexApiUrl(this.__codexTokenUsageUrl)) markNetworkTurnStarted(started);
      this.addEventListener?.("loadend", () => {
        const url = this.__codexTokenUsageUrl;
        if (!isCodexApiUrl(url)) return;
        try {
          parseResponseText(this.responseText || "", nowMs() - started, url);
        } catch (_) {
          // Ignore unreadable XHR bodies.
        }
      });
      return originalSend.apply(this, args);
    };
    Xhr.prototype.__codexTokenUsageWrapped = true;
  }

  function installPostMessageObserver() {
    if (window.__codexTokenUsageMessageObserver) return;
    window.addEventListener?.(
      "message",
      (event) => {
        try {
          inspectPayload(event.data, "post-message");
        } catch (_) {
          // Ignore unrelated window messages.
        }
      },
      true,
    );
    window.__codexTokenUsageMessageObserver = true;
  }

  function installWebSocketObserver() {
    if (typeof window.WebSocket !== "function" || window.__codexTokenUsageWebSocketWrapped) return;
    const NativeWebSocket = window.WebSocket;

    function TokenUsageWebSocket(...args) {
      const socket = new NativeWebSocket(...args);
      socket.addEventListener?.("message", (event) => {
        try {
          if (typeof event.data === "string") {
            inspectPayloadText(event.data, "websocket");
          } else if (event.data instanceof Blob && event.data.size <= 512000) {
            event.data.text().then((text) => inspectPayloadText(text, "websocket")).catch(() => {});
          }
        } catch (_) {
          // Keep socket delivery untouched.
        }
      });
      return socket;
    }

    try {
      TokenUsageWebSocket.prototype = NativeWebSocket.prototype;
      Object.defineProperty(TokenUsageWebSocket, "CONNECTING", { value: NativeWebSocket.CONNECTING });
      Object.defineProperty(TokenUsageWebSocket, "OPEN", { value: NativeWebSocket.OPEN });
      Object.defineProperty(TokenUsageWebSocket, "CLOSING", { value: NativeWebSocket.CLOSING });
      Object.defineProperty(TokenUsageWebSocket, "CLOSED", { value: NativeWebSocket.CLOSED });
    } catch (_) {
      // Constants are best-effort compatibility helpers.
    }

    window.WebSocket = TokenUsageWebSocket;
    window.__codexTokenUsageWebSocketWrapped = true;
  }

  function normalizeContextReading(reading) {
    if (!reading || typeof reading !== "object") return null;
    const used = normalizeNumber(reading.used ?? reading.usedTokens ?? reading.used_tokens);
    const limit = normalizeNumber(reading.limit ?? reading.contextWindow ?? reading.context_window);
    if (!used && !limit) return null;
    return {
      usage: {
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: used,
        cachedTokens: 0,
        cacheReadTokens: 0,
        cacheCreationTokens: 0,
        hasBreakdown: false,
        contextUsed: used,
        contextLimit: limit,
      },
      elapsedMs: elapsedSinceTurnStarted(),
      source: reading.source || "context-meter",
      conversationId: reading.conversationId || "",
    };
  }

  function rememberContextReading(reading) {
    const metric = normalizeContextReading(reading);
    if (metric) rememberMetric(metric);
  }

  function readContextMeterMetric() {
    try {
      const meterState = window.__codexContextMeter?.getState?.();
      rememberContextReading(meterState?.lastReading);
    } catch (_) {
      // Ignore unavailable or changing third-party script state.
    }
  }

  function installContextMeterObserver() {
    const captureState = window.__codexContextMeterCaptureState;
    if (captureState && !captureState.__codexTokenUsageWrapped) {
      const originalInspectText = captureState.inspectText;
      if (typeof originalInspectText === "function") {
        captureState.inspectText = function codexTokenUsageInspectText(text, source, conversationId) {
          const started = elapsedSinceTurnStarted();
          try {
            const usage = extractUsage(text);
            if (usage) rememberMetric({ usage, elapsedMs: started, source: source || "context-capture", conversationId });
          } catch (_) {
            // Keep the upstream context meter path intact.
          }
          return originalInspectText.apply(this, arguments);
        };
      }

      const originalInspectValue = captureState.inspectValue;
      if (typeof originalInspectValue === "function") {
        captureState.inspectValue = function codexTokenUsageInspectValue(value, source, conversationId) {
          let reading = null;
          try {
            const usage = extractUsage(value);
            if (usage) rememberMetric({ usage, elapsedMs: elapsedSinceTurnStarted(), source: source || "context-value", conversationId });
          } catch (_) {
            // Continue to the original inspector.
          }
          reading = originalInspectValue.apply(this, arguments);
          rememberContextReading(reading);
          return reading;
        };
      }
      captureState.__codexTokenUsageWrapped = true;
    }

    readContextMeterMetric();
    if (!state.contextPollTimer) {
      state.contextPollTimer = window.setInterval?.(() => {
        installContextMeterObserver();
        readContextMeterMetric();
      }, CONTEXT_POLL_INTERVAL_MS);
      window.__codexTokenUsageContextPollTimer = state.contextPollTimer;
    }
  }

  function ensureStyle() {
    let style = document.getElementById?.(STYLE_ID);
    if (!style) {
      style = document.createElement("style");
      style.id = STYLE_ID;
      document.head?.appendChild(style);
    }
    style.textContent = `
      .${BADGE_CLASS} {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        margin: 8px 0 0;
        padding: 5px 9px;
        border: 1px solid rgba(20, 184, 166, .3);
        border-radius: 7px;
        background: rgba(20, 184, 166, .08);
        color: inherit;
        font: 12px/1.35 ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        opacity: .9;
        letter-spacing: 0;
      }
      .${BADGE_CLASS}[data-status="running"] {
        border-color: rgba(245, 158, 11, .36);
        background: rgba(245, 158, 11, .1);
      }
      .${BADGE_CLASS}[data-placement="message-actions"] {
        display: flex;
        width: fit-content;
        margin: 6px 0 0;
      }
      main > .${BADGE_CLASS},
      body > .${BADGE_CLASS} {
        display: none !important;
      }
    `;
  }

  function visibleRect(node) {
    if (!(node instanceof Element)) return null;
    const rect = node.getBoundingClientRect();
    if (!rect.width && !rect.height) return null;
    return rect;
  }

  function isConversationActionButton(node) {
    if (!(node instanceof Element)) return false;
    const label = node.getAttribute("aria-label") || "";
    return /^(复制|喜欢|不喜欢|从此处开始分叉|Copy|Good response|Bad response|Branch from here)$/i.test(label);
  }

  function isPrimaryConversationActionButton(node) {
    if (!(node instanceof Element)) return false;
    const label = node.getAttribute("aria-label") || "";
    return /^(喜欢|不喜欢|从此处开始分叉|Good response|Bad response|Branch from here)$/i.test(label);
  }

  function scoreAssistantContainer(node) {
    if (!(node instanceof Element)) return -1;
    const rect = visibleRect(node);
    if (!rect || rect.width < 240 || rect.height < 48) return -1;
    const text = node.innerText || node.textContent || "";
    if (!text || text.length < 20) return -1;
    if (node.querySelector?.("textarea,[contenteditable='true']")) return -1;
    if (/thread-scroll-container|main-surface|app-shell|timeline/i.test(String(node.className || ""))) return -1;

    let score = 0;
    if (node.querySelector?.("button[aria-label='复制'],button[aria-label='Copy']")) score += 6;
    if (node.querySelector?.("button[aria-label='喜欢'],button[aria-label='不喜欢']")) score += 3;
    if (/group flex min-w-0 flex-col/.test(String(node.className || ""))) score += 5;
    if (node.querySelector?.("p,li,pre,code")) score += 2;
    if (rect.height > 80) score += 1;
    score -= Math.max(0, text.length / 2000);
    return score;
  }

  function closestAssistantContainer(fromNode) {
    let best = null;
    let bestScore = -1;
    for (let node = fromNode; node && node !== document.body; node = node.parentElement) {
      const score = scoreAssistantContainer(node);
      if (score > bestScore) {
        best = node;
        bestScore = score;
      }
      if (score >= 10) break;
    }
    return bestScore > 0 ? best : null;
  }

  function latestAssistantFromActionBar() {
    const buttons = Array.from(document.querySelectorAll("button")).filter(isConversationActionButton);
    const primaryButtons = buttons.filter(isPrimaryConversationActionButton);
    const searchButtons = primaryButtons.length ? primaryButtons : buttons;
    const visibleButtons = searchButtons.filter((button) => {
      const rect = visibleRect(button);
      return rect && rect.width > 0 && rect.height > 0;
    });
    for (let index = visibleButtons.length - 1; index >= 0; index -= 1) {
      const container = closestAssistantContainer(visibleButtons[index]);
      if (container) return container;
    }
    for (let index = searchButtons.length - 1; index >= 0; index -= 1) {
      const container = closestAssistantContainer(searchButtons[index]);
      if (container) return container;
    }
    return null;
  }

  function latestAssistantNode() {
    const actionBarTarget = latestAssistantFromActionBar();
    if (actionBarTarget) return actionBarTarget;

    const selectors = [
      '[data-message-author-role="assistant"]',
      '[data-testid*="assistant"]',
      'article:has([data-message-author-role="assistant"])',
      "main article",
      "main [class*='message']",
    ];
    for (const selector of selectors) {
      try {
        const nodes = Array.from(document.querySelectorAll(selector)).filter((node) => node instanceof Element);
        if (nodes.length) return nodes[nodes.length - 1];
      } catch (_) {
        // Some Chromium builds do not support every selector shape.
      }
    }
    return null;
  }

  function elapsedFromAssistantNode(node) {
    for (let current = node; current && current !== document.body; current = current.parentElement) {
      const text = current.innerText || current.textContent || "";
      if (text.length > 6000) break;
      const elapsedMs = parseElapsedMs(text);
      if (elapsedMs) return elapsedMs;
    }
    return 0;
  }

  function removeBadges() {
    document.querySelectorAll?.(`.${BADGE_CLASS}`).forEach((node) => node.remove());
  }

  function renderMetric(metric = metricForActiveConversation()) {
    if (!metric) {
      removeBadges();
      return;
    }
    if (!conversationMatchesActive(metric)) {
      removeBadges();
      return;
    }
    if (!metric) return;
    ensureStyle();
    const target = latestAssistantNode();
    if (!target) return;
    const displayMetric = {
      ...metric,
      elapsedMs: elapsedFromAssistantNode(target) || metric.elapsedMs,
    };
    document.querySelectorAll(`main > .${BADGE_CLASS}, body > .${BADGE_CLASS}`).forEach((node) => node.remove());
    let badge = target.querySelector?.(`:scope > .${BADGE_CLASS}`);
    if (!badge) {
      badge = document.createElement("div");
      badge.className = BADGE_CLASS;
      target.appendChild(badge);
    }
    badge.dataset.metricId = displayMetric.id || "";
    badge.dataset.status = displayMetric.status || "complete";
    badge.dataset.conversationId = displayMetric.conversationId || "";
    badge.dataset.placement = target === document.querySelector("main") ? "fallback" : "message-actions";
    badge.textContent = formatBadgeText(displayMetric);
    document.querySelectorAll(`.${BADGE_CLASS}`).forEach((node) => {
      if (node !== badge) node.remove();
    });
  }

  function scheduleRender() {
    clearTimeout(window.__codexTokenUsageRenderTimer);
    window.__codexTokenUsageRenderTimer = setTimeout(() => renderMetric(), 120);
  }

  function installDomObserver() {
    if (!window.MutationObserver || window.__codexTokenUsageDomObserver) return;
    window.__codexTokenUsageDomObserver = new MutationObserver(() => {
      const nextConversationId = conversationIdFromActiveRow() || conversationIdFromLocation();
      if (nextConversationId && nextConversationId !== state.activeConversationId) setActiveConversationId(nextConversationId);
      if (metricForActiveConversation()) scheduleRender();
    });
    const start = () => {
      const root = document.querySelector("main") || document.body || document.documentElement;
      if (root) window.__codexTokenUsageDomObserver.observe(root, { childList: true, subtree: true });
    };
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", start, { once: true });
    } else {
      start();
    }
  }

  function installRouteObserver() {
    if (window.__codexTokenUsageRouteObserver) return;
    window.__codexTokenUsageRouteObserver = true;
    const sync = () => setActiveConversationId(conversationIdFromActiveRow() || conversationIdFromLocation());
    const originals = window.__codexTokenUsageRouteOriginals || {};
    window.__codexTokenUsageRouteOriginals = originals;
    const routeHistory = window.history;
    ["pushState", "replaceState"].forEach((method) => {
      const original = originals[method] || routeHistory?.[method];
      originals[method] = original;
      if (typeof original !== "function") return;
      routeHistory[method] = function codexTokenUsagePatchedHistory(...args) {
        const result = original.apply(routeHistory, args);
        setTimeout(sync, 0);
        return result;
      };
    });
    window.addEventListener?.("popstate", sync, true);
    window.addEventListener?.("hashchange", sync, true);
    sync();
  }

  installFetchObserver();
  installXhrObserver();
  installPostMessageObserver();
  installWebSocketObserver();
  installContextMeterObserver();
  installRouteObserver();
  installDomObserver();

  if (window.__CODEX_TOKEN_USAGE_SCRIPT_TEST__) {
    window.__codexTokenUsageScriptTest = {
      extractUsage,
      formatBadgeText,
      mergeMetric,
      normalizeUsage,
      normalizeContextReading,
      parseElapsedMs,
      rememberMetric,
      markTurnStarted: markNetworkTurnStarted,
      setActiveConversationId,
      dispatchDocumentEvent: (type, event) => document.listeners?.[type]?.({ type, ...event }),
      getDisplayMetric: metricForActiveConversation,
      getTokenUsage: () => window.__codexTokenUsage,
    };
  }
})();

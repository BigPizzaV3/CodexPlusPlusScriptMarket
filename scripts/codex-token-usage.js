(() => {
  "use strict";

  const SCRIPT_ID = "codex-token-usage";
  const SCRIPT_VERSION = "0.1.7";
  const BADGE_CLASS = "codex-token-usage-badge";
  const STYLE_ID = "codex-token-usage-style";
  const RECENT_LIMIT = 20;
  const DEBUG_LIMIT = 50;
  const LEDGER_LIMIT = 500;
  const CONTEXT_POLL_INTERVAL_MS = 1000;
  const TURN_IDLE_TIMEOUT_MS = 120000;
  const CONTEXT_MERGE_WINDOW_MS = 30000;
  const CROSS_SOURCE_DEDUPE_WINDOW_MS = 3000;
  const STORAGE_KEY = "__codexTokenUsageRecentDetails";

  if (window.__codexTokenUsageScriptInstalled && window.__codexTokenUsageVersion === SCRIPT_VERSION) return;
  window.__codexTokenUsageScriptInstalled = true;
  window.__codexTokenUsageVersion = SCRIPT_VERSION;

  const state = {
    lastMetric: null,
    lastMetricKey: "",
    recent: [],
    ledger: [],
    byConversation: Object.create(null),
    byScope: Object.create(null),
    turnsByScope: Object.create(null),
    activeProjectId: "",
    activeConversationId: "",
    currentTurn: null,
    eventSeq: 0,
    turnSeq: 0,
    turnStartedAt: 0,
    contextPollTimer: 0,
    pendingTurnStartAt: 0,
    historyRestoreState: Object.create(null),
    debug: [],
  };

  window.__codexTokenUsageDebug = state.debug;
  window.__codexTokenUsage = {
    version: SCRIPT_VERSION,
    last: null,
    currentTurn: null,
    recent: [],
    debug: state.debug,
    export: () => ({
      version: SCRIPT_VERSION,
      activeProjectId: currentProjectId(),
      activeConversationId: currentConversationId(),
      activeScopeKey: currentScopeKey(),
      last: null,
      currentTurn: null,
      calls: [],
      ledgerEvents: [],
      recent: [],
      debug: state.debug.slice(),
      storedDetails: readStoredDetails(),
      turns: [],
    }),
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
    const explicitTotal = raw.total_tokens ?? raw.totalTokens ?? raw.usedTokens ?? raw.used_tokens ?? raw.used;
    const totalEstimated = explicitTotal == null && !!(inputTokens || outputTokens);
    const totalTokens = normalizeNumber(explicitTotal ?? inputTokens + outputTokens);
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
    const cachedReadTokens = cacheReadTokens || cachedTokens;
    const explicitInputTotal = normalizeNumber(
      raw.input_total_tokens ?? raw.inputTotalTokens ?? raw.prompt_total_tokens ?? raw.promptTotalTokens,
    );
    const contextUsed = normalizeNumber(raw.contextUsed ?? raw.context_used ?? raw.usedTokens ?? raw.used_tokens ?? raw.used);
    const contextLimit = normalizeNumber(
      raw.contextLimit ?? raw.context_limit ?? raw.modelContextWindow ?? raw.model_context_window ?? raw.contextWindow ?? raw.context_window ?? raw.limit,
    );
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
    const inputFromTotal = totalTokens && outputTokens && totalTokens > outputTokens ? totalTokens - outputTokens : 0;
    let inputTotalTokens = Math.max(explicitInputTotal, inputTokens, inputFromTotal);
    if (cachedReadTokens > inputTotalTokens) {
      inputTotalTokens += cachedReadTokens + cacheCreationTokens;
    }
    return {
      inputTokens,
      inputTotalTokens,
      outputTokens,
      outputTotalTokens: outputTokens,
      totalTokens,
      requestTotalTokens: totalTokens,
      cachedTokens,
      cachedReadTokens,
      cacheReadTokens,
      cacheCreationTokens,
      totalEstimated,
      hasBreakdown: !!(inputTokens || outputTokens || cachedTokens || cacheReadTokens || cacheCreationTokens),
      contextUsed: contextUsed || totalTokens,
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

  function collectUsagesInObject(value, depth = 0, usages = [], seen = new WeakSet()) {
    if (!value || depth > 8) return usages;
    if (Array.isArray(value)) {
      value.forEach((item) => collectUsagesInObject(item, depth + 1, usages, seen));
      return usages;
    }
    if (typeof value !== "object") return usages;
    if (seen.has(value)) return usages;
    seen.add(value);

    const tokenStatus = value.last || value.lastUsage || value.lastTokenUsage || value.last_token_usage;
    if (tokenStatus && (value.modelContextWindow || value.model_context_window || value.contextWindow || value.context_window)) {
      const statusUsage = normalizeUsage({
        ...tokenStatus,
        modelContextWindow: value.modelContextWindow ?? value.model_context_window,
        contextWindow: value.contextWindow ?? value.context_window,
      });
      if (statusUsage) {
        usages.push(statusUsage);
        return usages;
      }
    }

    const directKeys = ["usage", "last", "lastUsage", "lastTokenUsage", "last_token_usage"];
    const consumedKeys = new Set();
    for (const key of directKeys) {
      const direct = normalizeUsage(value[key]);
      if (direct) {
        usages.push(direct);
        consumedKeys.add(key);
      }
    }

    const self = normalizeUsage(value);
    if (self) {
      usages.push(self);
      return usages;
    }

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
      if (consumedKeys.has(key)) continue;
      collectUsagesInObject(value[key], depth + 1, usages, seen);
    }
    return usages;
  }

  function extractJsonFragmentsFromSse(text) {
    return String(text || "")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trim())
      .filter((line) => line && line !== "[DONE]");
  }

  function extractUsages(payload) {
    if (typeof payload === "string") {
      try {
        const parsed = JSON.parse(payload);
        const usages = collectUsagesInObject(parsed);
        if (usages.length) return usages;
      } catch (_) {
        // Treat non-JSON text as a possible SSE stream below.
      }
      const usages = [];
      for (const fragment of extractJsonFragmentsFromSse(payload)) {
        try {
          collectUsagesInObject(JSON.parse(fragment), 0, usages);
        } catch (_) {
          // Ignore malformed stream fragments.
        }
      }
      return usages;
    }
    return collectUsagesInObject(payload);
  }

  function extractUsage(payload) {
    return extractUsages(payload)[0] || null;
  }

  function formatNumber(value) {
    return normalizeNumber(value).toLocaleString("en-US");
  }

  function formatSeconds(elapsedMs) {
    const seconds = Math.max(0, normalizeNumber(elapsedMs)) / 1000;
    if (seconds >= 3600) return `${(seconds / 3600).toFixed(1)}h`;
    if (seconds >= 60) return `${(seconds / 60).toFixed(1)}min`;
    return `${seconds.toFixed(1)}s`;
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
    const cacheTokens = usage.cachedReadTokens || usage.cachedTokens || usage.cacheReadTokens || 0;
    if (!cacheTokens) return [];
    const details = [`缓存读 ${formatNumber(cacheTokens)}`];
    const inputTokens = usage.inputTotalTokens || usage.inputTokens || 0;
    if (inputTokens) {
      const ratio = Math.min(100, Math.max(0, (cacheTokens / inputTokens) * 100));
      details.push(`缓存命中率 ${ratio.toFixed(1)}%`);
    }
    if (usage.cacheCreationTokens) details.push(`缓存写 ${formatNumber(usage.cacheCreationTokens)}`);
    return details;
  }

  function formatBadgeText(metric) {
    if (metric?.status === "running") return "运行中 · 正在统计本次回复 token...";
    const usage = metric?.usage || {};
    const requestTotal = usage.requestTotalTokens || usage.totalTokens || 0;
    const estimatedLabel = usage.totalEstimated ? "(估算)" : "";
    const parts = [`本轮调用合计 ${formatNumber(requestTotal)}${estimatedLabel}`];
    if (usageHasBreakdown(usage)) {
      parts.push(
        `输入 ${formatNumber(usage.inputTotalTokens || usage.inputTokens)}`,
        `输出 ${formatNumber(usage.outputTotalTokens || usage.outputTokens)}`,
        ...formatCacheDetails(usage),
      );
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

  function normalizeProjectId(value) {
    return normalizeConversationId(value);
  }

  function parseObservedAt(value) {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    const time = Date.parse(String(value || ""));
    return Number.isFinite(time) ? time : nowMs();
  }

  function projectIdFromLocation() {
    const locationText = `${window.location?.pathname || ""}${window.location?.search || ""}${window.location?.hash || ""}`;
    const match = locationText.match(/(?:project|workspace)(?:\/|=|:|-)([A-Za-z0-9_.:-]+)/i);
    return normalizeProjectId(match?.[1]);
  }

  function projectIdFromActiveRow() {
    try {
      const row = document.querySelector?.(
        "[data-app-action-sidebar-project-active='true'],[data-project-id],[data-workspace-id]",
      );
      const id = row?.getAttribute?.("data-project-id")
        || row?.getAttribute?.("data-workspace-id")
        || row?.getAttribute?.("data-testid");
      return normalizeProjectId(id);
    } catch (_) {
      return "";
    }
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

  function currentProjectId() {
    const live = projectIdFromActiveRow() || projectIdFromLocation();
    return live || state.activeProjectId;
  }

  function scopeKeyFor(projectId, conversationId) {
    const conversation = normalizeConversationId(conversationId);
    if (!conversation) return "";
    const project = normalizeProjectId(projectId);
    return project ? `${project}:${conversation}` : conversation;
  }

  function currentScopeKey() {
    return scopeKeyFor(currentProjectId(), currentConversationId());
  }

  function isSameOrMissingIdentity(currentValue, nextValue) {
    return !currentValue || !nextValue || currentValue === nextValue;
  }

  function canAdoptScopeIdentity(turn, projectId, conversationId) {
    if (!turn) return false;
    return (
      isSameOrMissingIdentity(turn.projectId, normalizeProjectId(projectId)) &&
      isSameOrMissingIdentity(turn.conversationId, normalizeConversationId(conversationId))
    );
  }

  function applyTurnScopeIdentity(turn, projectId, conversationId) {
    if (!turn) return turn;
    const nextProjectId = normalizeProjectId(projectId) || turn.projectId || "";
    const nextConversationId = normalizeConversationId(conversationId) || turn.conversationId || "";
    turn.projectId = nextProjectId;
    turn.conversationId = nextConversationId;
    turn.scopeKey = scopeKeyFor(nextProjectId, nextConversationId);
    return turn;
  }

  function scopedMetric(metric) {
    const projectId = normalizeProjectId(metric?.projectId) || currentProjectId();
    const conversationId = normalizeConversationId(metric?.conversationId) || currentConversationId();
    const scopeKey = scopeKeyFor(projectId, conversationId);
    return conversationId ? { ...metric, projectId, conversationId, scopeKey } : metric;
  }

  function conversationMatchesActive(metric) {
    const active = currentConversationId();
    const metricConversationId = normalizeConversationId(metric?.conversationId);
    if (active && metricConversationId !== active) return false;
    const activeScope = currentScopeKey();
    return activeScope && metric?.scopeKey ? metric.scopeKey === activeScope : true;
  }

  function aggregateLedgerEvents(events, scopeKey, conversationId, projectId) {
    if (!events.length) return null;
    const orderedEvents = events.slice().sort((left, right) => (left.observedAt || 0) - (right.observedAt || 0));
    const usageEvents = [];
    const contextEvents = [];
    orderedEvents.forEach((event) => {
      if (usageHasBreakdown(event.usage)) usageEvents.push(event);
      else if (event.usage?.contextLimit || event.usage?.contextUsed) contextEvents.push(event);
    });
    const calls = [];
    usageEvents.forEach((event) => {
      const existing = calls.find((call) => {
        const identity = strongCallIdentity(event);
        const callIdentity = strongCallIdentity(call);
        if (identity && callIdentity && identity === callIdentity) return true;
        if (!sameUsageDetails(event, call)) return false;
        if (event.source === call.source) return false;
        return Math.abs((event.observedAt || 0) - (call.observedAt || 0)) <= CROSS_SOURCE_DEDUPE_WINDOW_MS;
      });
      if (existing) {
        Object.assign(existing, mergeMetric(event, existing), {
          observedAt: Math.min(existing.observedAt || event.observedAt || 0, event.observedAt || 0),
          sourceSet: Array.from(new Set([...(existing.sourceSet || [existing.source]), event.source].filter(Boolean))),
        });
      } else {
        calls.push({
          ...event,
          sourceSet: [event.source].filter(Boolean),
        });
      }
    });
    const usage = calls.reduce(
      (total, event) => {
        const item = event.usage || {};
        total.inputTokens += item.inputTokens || 0;
        total.inputTotalTokens += item.inputTotalTokens || item.inputTokens || 0;
        total.outputTokens += item.outputTokens || 0;
        total.outputTotalTokens += item.outputTotalTokens || item.outputTokens || 0;
        total.totalTokens += item.totalTokens || item.inputTokens + item.outputTokens || 0;
        total.requestTotalTokens += item.requestTotalTokens || item.totalTokens || item.inputTokens + item.outputTokens || 0;
        total.cachedTokens += item.cachedTokens || 0;
        total.cachedReadTokens += item.cachedReadTokens || item.cacheReadTokens || item.cachedTokens || 0;
        total.cacheReadTokens += item.cacheReadTokens || 0;
        total.cacheCreationTokens += item.cacheCreationTokens || 0;
        total.totalEstimated = total.totalEstimated || !!item.totalEstimated;
        return total;
      },
      {
        inputTokens: 0,
        inputTotalTokens: 0,
        outputTokens: 0,
        outputTotalTokens: 0,
        totalTokens: 0,
        requestTotalTokens: 0,
        cachedTokens: 0,
        cachedReadTokens: 0,
        cacheReadTokens: 0,
        cacheCreationTokens: 0,
        totalEstimated: false,
      },
    );
    const lastUsageEvent = calls[calls.length - 1] || orderedEvents[orderedEvents.length - 1];
    const contextEvent = contextEvents[contextEvents.length - 1] || lastUsageEvent;
    usage.hasBreakdown = calls.length > 0;
    usage.contextUsed = contextEvent?.usage?.contextUsed || contextEvent?.usage?.totalTokens || lastUsageEvent?.usage?.contextUsed || usage.totalTokens;
    usage.contextLimit = contextEvent?.usage?.contextLimit || lastUsageEvent?.usage?.contextLimit || 0;
    const latest = orderedEvents[orderedEvents.length - 1];
    return {
      usage,
      elapsedMs: Math.max(...orderedEvents.map((event) => event.elapsedMs || 0), 0),
      source: "turn-aggregate",
      projectId: projectId || latest?.projectId || "",
      conversationId: conversationId || latest?.conversationId || "",
      scopeKey: scopeKey || latest?.scopeKey || "",
      turnId: latest?.turnId || "",
      calls: calls.map((event) => ({ ...event, __usageCallKey: undefined })),
      callCount: calls.length,
      confidence: calls.some((event) => event.usage?.totalEstimated) ? "estimated" : "observed",
    };
  }

  function syncLedgerTurnIdentity(turn) {
    if (!turn?.id) return;
    state.ledger.forEach((event) => {
      if (event.turnId !== turn.id) return;
      event.projectId = turn.projectId || event.projectId || "";
      event.conversationId = turn.conversationId || event.conversationId || "";
      event.scopeKey = turn.scopeKey || event.scopeKey || "";
    });
  }

  function deriveTurnsFromLedger(activeScope, activeConversationId) {
    const scopedEvents = state.ledger.filter((event) => {
      if (!event?.turnId) return false;
      if (activeScope) return event.scopeKey === activeScope;
      return activeConversationId ? event.conversationId === activeConversationId : false;
    });
    if (!scopedEvents.length) return [];
    const grouped = [];
    const byTurnId = new Map();
    scopedEvents.forEach((event) => {
      if (!byTurnId.has(event.turnId)) {
        const bucket = [];
        byTurnId.set(event.turnId, bucket);
        grouped.push(bucket);
      }
      byTurnId.get(event.turnId).push(event);
    });
    return grouped
      .map((events) => {
        const latest = events[events.length - 1];
        return aggregateLedgerEvents(
          events,
          latest?.scopeKey || activeScope || "",
          latest?.conversationId || activeConversationId || "",
          latest?.projectId || "",
        );
      })
      .filter((metric) => metric && (metric.callCount >= 1 || metric.usage?.contextLimit));
  }

  function deriveLatestMetricFromLedger(activeScope, activeConversationId) {
    const turns = deriveTurnsFromLedger(activeScope, activeConversationId);
    return turns.length ? turns[turns.length - 1] : null;
  }

  function adoptLedgerScopeIdentity(projectId, conversationId) {
    const normalizedProjectId = normalizeProjectId(projectId);
    const normalizedConversationId = normalizeConversationId(conversationId);
    if (!normalizedProjectId || !normalizedConversationId) return false;
    let changed = false;
    state.ledger.forEach((event) => {
      if (event.conversationId !== normalizedConversationId) return;
      if (event.projectId && event.projectId !== normalizedProjectId) return;
      const nextScopeKey = scopeKeyFor(normalizedProjectId, normalizedConversationId);
      if (event.projectId !== normalizedProjectId || event.scopeKey !== nextScopeKey) {
        event.projectId = normalizedProjectId;
        event.scopeKey = nextScopeKey;
        changed = true;
      }
    });
    return changed;
  }

  function metricForActiveConversation() {
    const active = currentConversationId();
    const activeScope = currentScopeKey();
    let completedMetric = null;
    if (activeScope) {
      completedMetric = deriveLatestMetricFromLedger(activeScope, active) || state.byScope[activeScope] || null;
    } else {
      completedMetric =
        deriveLatestMetricFromLedger("", active)
        || (active && state.byConversation[active])
        || (conversationMatchesActive(state.lastMetric) ? state.lastMetric : null);
    }
    if (state.currentTurn && !state.currentTurn.calls.length && state.currentTurn.status === "running") {
      if (
        (!active || !state.currentTurn.conversationId || active === state.currentTurn.conversationId) &&
        (!activeScope || !state.currentTurn.scopeKey || activeScope === state.currentTurn.scopeKey)
      ) {
        if (completedMetric?.callCount >= 1) return completedMetric;
        return {
          status: "running",
          projectId: state.currentTurn.projectId || currentProjectId(),
          conversationId: state.currentTurn.conversationId || active,
          scopeKey: state.currentTurn.scopeKey || activeScope,
          startedAt: state.currentTurn.startedAt,
          elapsedMs: elapsedSinceTurnStarted(),
          source: "turn-running",
        };
      }
    }
    return completedMetric;
  }

  function setActiveProjectId(projectId) {
    const next = normalizeProjectId(projectId);
    const previous = state.activeProjectId;
    if (previous === next) return;
    state.activeProjectId = next;
    if (next && canAdoptScopeIdentity(state.currentTurn, next, state.currentTurn?.conversationId)) {
      applyTurnScopeIdentity(state.currentTurn, next, state.currentTurn?.conversationId);
      syncLedgerTurnIdentity(state.currentTurn);
    }
    if (next && currentConversationId() && adoptLedgerScopeIdentity(next, currentConversationId())) {
      const restored = deriveLatestMetricFromLedger(scopeKeyFor(next, currentConversationId()), currentConversationId());
      if (restored) publishMetric(restored, false);
    }
    scheduleRender();
  }

  function setActiveConversationId(conversationId) {
    const next = normalizeConversationId(conversationId);
    const previous = state.activeConversationId;
    if (!next && state.currentTurn) {
      scheduleRender();
      return;
    }
    if (previous === next) return;
    state.activeConversationId = next;
    if (next && canAdoptScopeIdentity(state.currentTurn, state.currentTurn?.projectId, next)) {
      applyTurnScopeIdentity(state.currentTurn, state.currentTurn?.projectId, next);
      syncLedgerTurnIdentity(state.currentTurn);
    }
    if (next && currentProjectId() && adoptLedgerScopeIdentity(currentProjectId(), next)) {
      const restored = deriveLatestMetricFromLedger(scopeKeyFor(currentProjectId(), next), next);
      if (restored) publishMetric(restored, false);
    }
    if (typeof window.queueMicrotask === "function") {
      window.queueMicrotask(() => {
        restoreHistoryForConversation(next).catch(() => {});
      });
    } else {
      Promise.resolve().then(() => restoreHistoryForConversation(next).catch(() => {}));
    }
    scheduleRender();
  }

  function metricKey(metric) {
    const usage = metric?.usage || {};
    return [
      metric?.scopeKey || "",
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
      metric?.callId || metric?.eventId || metric?.requestId || metric?.responseId || "",
      metric?.scopeKey || "",
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
    const projectId = currentProjectId();
    const conversationId = currentConversationId();
    return {
      id: `${Date.now()}-${state.turnSeq}`,
      startedAt: started,
      lastUpdatedAt: started,
      calls: [],
      callKeys: new Set(),
      contextUsage: null,
      projectId,
      conversationId,
      scopeKey: scopeKeyFor(projectId, conversationId),
      elapsedMs: 0,
      status: "running",
    };
  }

  function beginTurn(started = nowMs()) {
    state.currentTurn = createTurn(started);
    state.turnStartedAt = started;
    state.pendingTurnStartAt = 0;
    return state.currentTurn;
  }

  function ensureTurnStarted(started = nowMs()) {
    if (
      !state.currentTurn ||
      state.pendingTurnStartAt ||
      (!state.currentTurn.calls.length && started - state.currentTurn.lastUpdatedAt > TURN_IDLE_TIMEOUT_MS)
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

  function markUserTurnPending(started = nowMs()) {
    state.pendingTurnStartAt = started;
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
    if (metric?.scopeKey && other?.scopeKey && metric.scopeKey !== other.scopeKey) return false;
    if (!usage.totalTokens || !otherUsage.totalTokens) return false;
    if (usage.totalTokens !== otherUsage.totalTokens) return false;
    if (metric.conversationId && other.conversationId && metric.conversationId !== other.conversationId) return false;
    return true;
  }

  function sameUsageDetails(metric, other) {
    const usage = metric?.usage || {};
    const otherUsage = other?.usage || {};
    return !!(
      usage.totalTokens &&
      otherUsage.totalTokens &&
      usage.totalTokens === otherUsage.totalTokens &&
      (usage.inputTokens || 0) === (otherUsage.inputTokens || 0) &&
      (usage.outputTokens || 0) === (otherUsage.outputTokens || 0) &&
      (usage.cachedTokens || 0) === (otherUsage.cachedTokens || 0) &&
      (usage.cacheReadTokens || 0) === (otherUsage.cacheReadTokens || 0) &&
      (usage.cacheCreationTokens || 0) === (otherUsage.cacheCreationTokens || 0)
    );
  }

  function strongCallIdentity(metric) {
    return metric?.callId || metric?.eventId || metric?.requestId || metric?.responseId || "";
  }

  function shouldDedupeCall(metric, existing) {
    const identity = strongCallIdentity(metric);
    const existingIdentity = strongCallIdentity(existing);
    if (identity && existingIdentity && identity === existingIdentity) return true;
    if (!sameUsageDetails(metric, existing)) return false;
    if (metric.scopeKey && existing.scopeKey && metric.scopeKey !== existing.scopeKey) return false;
    if (metric.source === existing.source) return false;
    const elapsedDelta = Math.abs((metric.elapsedMs || 0) - (existing.elapsedMs || 0));
    return elapsedDelta <= CROSS_SOURCE_DEDUPE_WINDOW_MS;
  }

  function mergeUsage(preferredUsage, fallbackUsage) {
    const preferredHasBreakdown = usageHasBreakdown(preferredUsage);
    const fallbackHasBreakdown = usageHasBreakdown(fallbackUsage);
    const detailUsage = preferredHasBreakdown || !fallbackHasBreakdown ? preferredUsage : fallbackUsage;
    const contextUsage = preferredUsage.contextLimit ? preferredUsage : fallbackUsage.contextLimit ? fallbackUsage : preferredUsage.contextUsed ? preferredUsage : fallbackUsage;
    return {
      inputTokens: detailUsage.inputTokens || 0,
      inputTotalTokens: detailUsage.inputTotalTokens || detailUsage.inputTokens || 0,
      outputTokens: detailUsage.outputTokens || 0,
      outputTotalTokens: detailUsage.outputTotalTokens || detailUsage.outputTokens || 0,
      totalTokens: detailUsage.totalTokens || contextUsage.totalTokens || 0,
      requestTotalTokens: detailUsage.requestTotalTokens || detailUsage.totalTokens || contextUsage.totalTokens || 0,
      cachedTokens: detailUsage.cachedTokens || 0,
      cachedReadTokens: detailUsage.cachedReadTokens || detailUsage.cacheReadTokens || detailUsage.cachedTokens || 0,
      cacheReadTokens: detailUsage.cacheReadTokens || 0,
      cacheCreationTokens: detailUsage.cacheCreationTokens || 0,
      totalEstimated: !!detailUsage.totalEstimated,
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
      projectId: preferred.projectId || fallback.projectId || "",
      conversationId: preferred.conversationId || fallback.conversationId || "",
      scopeKey: preferred.scopeKey || fallback.scopeKey || "",
      source: preferred.source || fallback.source,
    };
  }

  function findMergeCandidate(metric) {
    const matches = [...state.recent, ...readStoredDetails()].filter((item) => conversationMatchesActive(item) && sameUsageDetails(metric, item));
    return matches.find((item) => usageHasBreakdown(item.usage)) || matches[0] || null;
  }

  function readStoredDetails() {
    try {
      const parsed = JSON.parse(window.sessionStorage?.getItem(STORAGE_KEY) || "[]");
      return Array.isArray(parsed)
        ? parsed.filter((item) => item?.usage && (item.callCount >= 1 || item.source === "turn-aggregate"))
        : [];
    } catch (_) {
      return [];
    }
  }

  function writeStoredDetails(metric) {
    if (!usageHasBreakdown(metric?.usage)) return;
    if (!(metric.callCount >= 1 || metric.source === "turn-aggregate")) return;
    try {
      const recent = [metric, ...readStoredDetails().filter((item) => !sameUsage(metric, item))].slice(0, RECENT_LIMIT);
      window.sessionStorage?.setItem(STORAGE_KEY, JSON.stringify(recent));
    } catch (_) {
      // Storage can be unavailable in restricted renderer contexts.
    }
  }

  function usageDebugSummary(usage) {
    return {
      inputTokens: usage.inputTokens || 0,
      outputTokens: usage.outputTokens || 0,
      totalTokens: usage.totalTokens || 0,
      cachedTokens: usage.cachedTokens || usage.cacheReadTokens || 0,
      contextLimit: usage.contextLimit || 0,
      hasBreakdown: usageHasBreakdown(usage),
    };
  }

  function appendLedgerEvent(kind, metric, extra = {}) {
    const usage = metric?.usage || {};
    state.eventSeq += 1;
    const entry = {
      id: `ledger-${state.eventSeq}`,
      kind,
      source: metric?.source || "",
      observedAt: extra.observedAt ?? nowMs(),
      projectId: extra.projectId ?? metric?.projectId ?? "",
      conversationId: extra.conversationId ?? metric?.conversationId ?? "",
      scopeKey: extra.scopeKey ?? metric?.scopeKey ?? "",
      turnId: extra.turnId ?? "",
      elapsedMs: metric?.elapsedMs || 0,
      usage: metric?.usage || null,
      rawSummary: {
        inputTokens: usage.inputTokens || 0,
        outputTokens: usage.outputTokens || 0,
        totalTokens: usage.totalTokens || 0,
        cachedTokens: usage.cachedReadTokens || usage.cachedTokens || usage.cacheReadTokens || 0,
        contextLimit: usage.contextLimit || 0,
      },
    };
    state.ledger.push(entry);
    if (state.ledger.length > LEDGER_LIMIT) state.ledger = state.ledger.slice(-LEDGER_LIMIT);
  }

  function hasLedgerForConversation(conversationId) {
    const normalizedConversationId = normalizeConversationId(conversationId);
    return !!(normalizedConversationId && state.ledger.some((event) => event.conversationId === normalizedConversationId));
  }

  function appendHistoryLedgerEvent(item, fallbackConversationId, fallbackProjectId) {
    const usage = normalizeUsage(item?.usage);
    if (!usage) return false;
    const conversationId = normalizeConversationId(item?.conversation_id || item?.conversationId || fallbackConversationId);
    if (!conversationId) return false;
    const projectId = normalizeProjectId(fallbackProjectId);
    const scopeKey = scopeKeyFor(projectId, conversationId);
    const turnId = String(item?.turn_id || item?.turnId || "");
    const observedAt = parseObservedAt(item?.observed_at || item?.observedAt);
    const duplicate = state.ledger.some(
      (event) =>
        event.turnId === turnId &&
        event.conversationId === conversationId &&
        event.observedAt === observedAt &&
        (event.usage?.totalTokens || 0) === (usage.totalTokens || 0) &&
        (event.usage?.inputTokens || 0) === (usage.inputTokens || 0) &&
        (event.usage?.outputTokens || 0) === (usage.outputTokens || 0),
    );
    if (duplicate) return false;
    appendLedgerEvent(
      "usage",
      {
        usage,
        elapsedMs: normalizeNumber(item?.elapsedMs || item?.elapsed_ms),
        source: item?.source || "rollout-history",
        conversationId,
        projectId,
        scopeKey,
      },
      {
        observedAt,
        turnId,
        conversationId,
        projectId,
        scopeKey,
      },
    );
    return true;
  }

  async function requestBridge(path, payload) {
    const bridge = window.__codexSessionDeleteBridge;
    if (typeof bridge === "function") return bridge(path, payload || {});
    throw new Error("bridge unavailable");
  }

  async function restoreHistoryForConversation(conversationId, options = {}) {
    const normalizedConversationId = normalizeConversationId(conversationId);
    if (!normalizedConversationId) return null;
    const restoreState = state.historyRestoreState[normalizedConversationId] || (state.historyRestoreState[normalizedConversationId] = {});
    if (restoreState.promise) return restoreState.promise;
    if (!options.force && (restoreState.completed || hasLedgerForConversation(normalizedConversationId))) {
      return deriveLatestMetricFromLedger(currentScopeKey(), normalizedConversationId);
    }
    restoreState.promise = (async () => {
      try {
        const result = await requestBridge("/thread-usage-history", {
          session_id: normalizedConversationId,
          title: "",
        });
        if (!result || result.status !== "ok" || !Array.isArray(result.history)) {
          return null;
        }
        const fallbackProjectId = currentProjectId();
        let appended = 0;
        result.history.forEach((item) => {
          if (appendHistoryLedgerEvent(item, normalizedConversationId, fallbackProjectId)) appended += 1;
        });
        if (!fallbackProjectId && currentProjectId()) {
          adoptLedgerScopeIdentity(currentProjectId(), normalizedConversationId);
        }
        restoreState.completed = true;
        pushDebug({
          type: "history-restore",
          conversationId: normalizedConversationId,
          appended,
          source: "bridge",
        });
        const metric = deriveLatestMetricFromLedger(currentScopeKey(), normalizedConversationId)
          || deriveLatestMetricFromLedger("", normalizedConversationId);
        if (metric) publishMetric(metric, false);
        return metric;
      } catch (error) {
        pushDebug({
          type: "history-restore-failed",
          conversationId: normalizedConversationId,
          message: String(error?.message || error),
        });
        return null;
      } finally {
        restoreState.promise = null;
      }
    })();
    return restoreState.promise;
  }

  function pushDebug(entry) {
    state.debug.unshift({
      at: new Date().toISOString(),
      activeConversationId: currentConversationId(),
      currentCallCount: state.currentTurn?.calls.length || 0,
      pendingTurn: !!state.pendingTurnStartAt,
      ...entry,
    });
    state.debug = state.debug.slice(0, DEBUG_LIMIT);
    window.__codexTokenUsageDebug = state.debug.slice();
    if (window.__codexTokenUsage) window.__codexTokenUsage.debug = state.debug.slice();
  }

  function aggregateTurnMetric(turn) {
    const usage = turn.calls.reduce(
      (total, call) => {
        const item = call.usage || {};
        total.inputTokens += item.inputTokens || 0;
        total.inputTotalTokens += item.inputTotalTokens || item.inputTokens || 0;
        total.outputTokens += item.outputTokens || 0;
        total.outputTotalTokens += item.outputTotalTokens || item.outputTokens || 0;
        total.totalTokens += item.totalTokens || item.inputTokens + item.outputTokens || 0;
        total.requestTotalTokens += item.requestTotalTokens || item.totalTokens || item.inputTokens + item.outputTokens || 0;
        total.cachedTokens += item.cachedTokens || 0;
        total.cachedReadTokens += item.cachedReadTokens || item.cacheReadTokens || item.cachedTokens || 0;
        total.cacheReadTokens += item.cacheReadTokens || 0;
        total.cacheCreationTokens += item.cacheCreationTokens || 0;
        total.totalEstimated = total.totalEstimated || !!item.totalEstimated;
        return total;
      },
      {
        inputTokens: 0,
        inputTotalTokens: 0,
        outputTokens: 0,
        outputTotalTokens: 0,
        totalTokens: 0,
        requestTotalTokens: 0,
        cachedTokens: 0,
        cachedReadTokens: 0,
        cacheReadTokens: 0,
        cacheCreationTokens: 0,
        totalEstimated: false,
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
      projectId: turn.projectId,
      conversationId: turn.conversationId,
      scopeKey: turn.scopeKey,
      turnId: turn.id,
      calls: turn.calls.map((call) => ({ ...call, __usageCallKey: undefined })),
      callCount: turn.calls.length,
      confidence: turn.calls.some((call) => call.usage?.totalEstimated) ? "estimated" : "observed",
    };
  }

  function rememberTurnMetric(metric) {
    if (!metric?.scopeKey || !metric.turnId || metric.source !== "turn-aggregate") return;
    const turns = state.turnsByScope[metric.scopeKey] || [];
    const nextMetric = {
      ...metric,
      calls: (metric.calls || []).map((call) => ({ ...call })),
    };
    const existingIndex = turns.findIndex((item) => item.turnId === metric.turnId);
    if (existingIndex >= 0) turns[existingIndex] = nextMetric;
    else turns.push(nextMetric);
    state.turnsByScope[metric.scopeKey] = turns.slice(-RECENT_LIMIT);
  }

  function exportUsage() {
    const activeScope = currentScopeKey();
    const currentTurn = state.currentTurn
      ? {
          id: state.currentTurn.id,
          startedAt: state.currentTurn.startedAt,
          lastUpdatedAt: state.currentTurn.lastUpdatedAt,
          callCount: state.currentTurn.calls.length,
          projectId: state.currentTurn.projectId,
          conversationId: state.currentTurn.conversationId,
          scopeKey: state.currentTurn.scopeKey,
        }
      : null;
    const activeMetric = metricForActiveConversation();
    return {
      version: SCRIPT_VERSION,
      activeProjectId: currentProjectId(),
      activeConversationId: currentConversationId(),
      activeScopeKey: activeScope,
      last: activeMetric || state.lastMetric,
      currentTurn,
      calls: (state.currentTurn?.scopeKey === activeScope ? state.currentTurn.calls : activeMetric?.calls || []).map((call) => ({ ...call, __usageCallKey: undefined })),
      ledgerEvents: state.ledger.slice().map((event) => ({ ...event })),
      recent: state.recent.slice(),
      debug: state.debug.slice(),
      storedDetails: readStoredDetails(),
      turns: deriveTurnsFromLedger(activeScope, currentConversationId()),
    };
  }

  function publishMetric(metric, storeDetails = true) {
    metric = scopedMetric(metric);
    if (metric?.source !== "turn-running") {
      const derived = deriveLatestMetricFromLedger(metric?.scopeKey || "", metric?.conversationId || "");
      if (derived) metric = scopedMetric(derived);
    }
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
    if (state.lastMetric.scopeKey) {
      state.byScope[state.lastMetric.scopeKey] = state.lastMetric;
      rememberTurnMetric(state.lastMetric);
    }
    if (state.lastMetric.conversationId) state.byConversation[state.lastMetric.conversationId] = state.lastMetric;
    state.recent.unshift(state.lastMetric);
    state.recent = state.recent.slice(0, RECENT_LIMIT);
    window.__codexTokenUsage = {
      version: SCRIPT_VERSION,
      last: state.lastMetric,
      currentTurn: state.currentTurn
        ? {
            id: state.currentTurn.id,
            startedAt: state.currentTurn.startedAt,
            lastUpdatedAt: state.currentTurn.lastUpdatedAt,
            callCount: state.currentTurn.calls.length,
            projectId: state.currentTurn.projectId,
            conversationId: state.currentTurn.conversationId,
            scopeKey: state.currentTurn.scopeKey,
          }
        : null,
      recent: state.recent.slice(),
      debug: state.debug.slice(),
      export: exportUsage,
    };
    if (storeDetails) writeStoredDetails(state.lastMetric);
    scheduleRender();
  }

  function rememberContextMetric(metric) {
    metric = scopedMetric(metric);
    const activeTurnMatches =
      state.currentTurn?.calls.length &&
      (!metric.scopeKey || !state.currentTurn.scopeKey || metric.scopeKey === state.currentTurn.scopeKey);
    if (activeTurnMatches) {
      appendLedgerEvent("context", metric, {
        turnId: state.currentTurn.id,
        projectId: state.currentTurn.projectId || metric.projectId,
        conversationId: state.currentTurn.conversationId || metric.conversationId,
        scopeKey: state.currentTurn.scopeKey || metric.scopeKey,
      });
      state.currentTurn.contextUsage = metric.usage;
      applyTurnScopeIdentity(state.currentTurn, metric.projectId, metric.conversationId);
      syncLedgerTurnIdentity(state.currentTurn);
      state.currentTurn.elapsedMs = Math.max(state.currentTurn.elapsedMs || 0, metric.elapsedMs || 0);
      state.currentTurn.lastUpdatedAt = nowMs();
      publishMetric(aggregateTurnMetric(state.currentTurn), false);
      return;
    }
    appendLedgerEvent("context", metric);
    if (
      state.lastMetric &&
      (!metric.scopeKey || !state.lastMetric.scopeKey || metric.scopeKey === state.lastMetric.scopeKey) &&
      nowMs() - (state.currentTurn?.lastUpdatedAt || 0) <= CONTEXT_MERGE_WINDOW_MS
    ) {
      publishMetric(mergeMetric(state.lastMetric, metric), false);
      return;
    }
    publishMetric({ ...metric, callCount: 0 }, false);
  }

  function rememberUsageMetric(metric) {
    metric = scopedMetric(metric);
    const turn = ensureTurnStarted();
    if (canAdoptScopeIdentity(turn, metric.projectId, metric.conversationId)) {
      applyTurnScopeIdentity(turn, metric.projectId, metric.conversationId);
      syncLedgerTurnIdentity(turn);
    }
    if (
      (metric.conversationId && turn.conversationId && metric.conversationId !== turn.conversationId) ||
      (metric.scopeKey && turn.scopeKey && metric.scopeKey !== turn.scopeKey)
    ) {
      beginTurn();
      return rememberUsageMetric(metric);
    }
    appendLedgerEvent("usage", metric, {
      turnId: turn.id,
      projectId: turn.projectId || metric.projectId,
      conversationId: turn.conversationId || metric.conversationId,
      scopeKey: turn.scopeKey || metric.scopeKey,
    });
    const key = usageCallKey(metric);
    const existing = turn.calls.find((call) => shouldDedupeCall(metric, call));
    if (existing) {
      const merged = mergeMetric(metric, existing);
      Object.assign(existing, merged, { __usageCallKey: existing.__usageCallKey || key, dedupeReason: strongCallIdentity(metric) ? "identity" : "cross-source-window" });
    } else {
      const candidate = findMergeCandidate(metric);
      if (candidate) {
        metric = mergeMetric(metric, candidate);
      }
      turn.calls.push({ ...metric, __usageCallKey: key });
      turn.callKeys.add(key);
    }
    applyTurnScopeIdentity(turn, metric.projectId, metric.conversationId);
    syncLedgerTurnIdentity(turn);
    turn.status = "complete";
    turn.elapsedMs = Math.max(turn.elapsedMs || 0, metric.elapsedMs || elapsedSinceTurnStarted());
    turn.lastUpdatedAt = nowMs();
    publishMetric(aggregateTurnMetric(turn));
  }

  function rememberMetric(metric) {
    if (!metric?.usage) return;
    if (usageHasBreakdown(metric.usage)) {
      rememberUsageMetric(metric);
    } else {
      rememberContextMetric(metric);
    }
  }

  function rememberUsages(usages, baseMetric) {
    let captured = false;
    usages.forEach((usage) => {
      rememberMetric({ ...baseMetric, usage });
      captured = true;
    });
    return captured;
  }

  function processPayload(payload, source, conversationId, elapsedMs, url) {
    const usages = extractUsages(payload);
    pushDebug({
      type: "payload",
      source,
      conversationId: conversationId || "",
      url: url || "",
      elapsedMs: elapsedMs || 0,
      usageCount: usages.length,
      usages: usages.map(usageDebugSummary),
    });
    return rememberUsages(usages, { elapsedMs, source, conversationId, url });
  }

  function parseResponseText(text, elapsedMs, url) {
    processPayload(text, "network", "", elapsedMs, url);
  }

  function inspectPayload(payload, source, conversationId) {
    return processPayload(payload, source, conversationId, elapsedSinceTurnStarted());
  }

  function inspectPayloadText(text, source, conversationId) {
    return inspectPayload(text, source, conversationId);
  }

  function installFetchObserver() {
    if (typeof window.fetch !== "function" || window.fetch.__codexTokenUsageWrapped === SCRIPT_VERSION) return;
    const baseFetch = window.fetch.__codexTokenUsageOriginal || window.fetch;
    const originalFetch = baseFetch.bind(window);
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
    wrappedFetch.__codexTokenUsageWrapped = SCRIPT_VERSION;
    wrappedFetch.__codexTokenUsageOriginal = baseFetch;
    window.fetch = wrappedFetch;
  }

  function installXhrObserver() {
    const Xhr = window.XMLHttpRequest;
    if (!Xhr || Xhr.prototype.__codexTokenUsageWrapped === SCRIPT_VERSION) return;
    const originalOpen = Xhr.prototype.__codexTokenUsageOriginalOpen || Xhr.prototype.open;
    const originalSend = Xhr.prototype.__codexTokenUsageOriginalSend || Xhr.prototype.send;
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
    Xhr.prototype.__codexTokenUsageOriginalOpen = originalOpen;
    Xhr.prototype.__codexTokenUsageOriginalSend = originalSend;
    Xhr.prototype.__codexTokenUsageWrapped = SCRIPT_VERSION;
  }

  function isEditableTarget(target) {
    return !!(
      target &&
      (target.tagName === "TEXTAREA" ||
        target.tagName === "INPUT" ||
        target.isContentEditable ||
        target.closest?.("textarea,input,[contenteditable='true']"))
    );
  }

  function isSendTrigger(event) {
    const target = event.target;
    if (event.type === "submit") return true;
    if (event.type === "keydown") {
      return event.key === "Enter" && !event.shiftKey && isEditableTarget(target);
    }
    if (event.type === "click") {
      const label = `${target?.getAttribute?.("aria-label") || ""} ${target?.textContent || ""}`;
      return /^(发送|提交|Send|Submit)$|send|submit/i.test(label);
    }
    return false;
  }

  function installTurnPendingObserver() {
    if (window.__codexTokenUsageTurnPendingObserver === SCRIPT_VERSION) return;
    const handler = (event) => {
      try {
        if (!isSendTrigger(event)) return;
        markUserTurnPending();
        pushDebug({ type: "pending-turn", source: event.type });
      } catch (_) {
        // Keep page input handling untouched.
      }
    };
    ["click", "submit", "keydown"].forEach((type) => {
      document.addEventListener?.(type, handler, true);
    });
    window.__codexTokenUsageTurnPendingObserver = SCRIPT_VERSION;
  }

  function installPostMessageObserver() {
    if (window.__codexTokenUsageMessageObserver === SCRIPT_VERSION) return;
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
    window.__codexTokenUsageMessageObserver = SCRIPT_VERSION;
  }

  function installWebSocketObserver() {
    if (typeof window.WebSocket !== "function" || window.__codexTokenUsageWebSocketWrapped === SCRIPT_VERSION) return;
    const NativeWebSocket = window.__codexTokenUsageNativeWebSocket || window.WebSocket;

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
    window.__codexTokenUsageNativeWebSocket = NativeWebSocket;
    window.__codexTokenUsageWebSocketWrapped = SCRIPT_VERSION;
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
    if (captureState && captureState.__codexTokenUsageWrapped !== SCRIPT_VERSION) {
      const originalInspectText = captureState.__codexTokenUsageOriginalInspectText || captureState.inspectText;
      if (typeof originalInspectText === "function") {
        captureState.inspectText = function codexTokenUsageInspectText(text, source, conversationId) {
          const started = elapsedSinceTurnStarted();
          try {
            processPayload(text, source || "context-capture", conversationId, started);
          } catch (_) {
            // Keep the upstream context meter path intact.
          }
          return originalInspectText.apply(this, arguments);
        };
      }

      const originalInspectValue = captureState.__codexTokenUsageOriginalInspectValue || captureState.inspectValue;
      if (typeof originalInspectValue === "function") {
        captureState.inspectValue = function codexTokenUsageInspectValue(value, source, conversationId) {
          let reading = null;
          try {
            processPayload(value, source || "context-value", conversationId, elapsedSinceTurnStarted());
          } catch (_) {
            // Continue to the original inspector.
          }
          reading = originalInspectValue.apply(this, arguments);
          rememberContextReading(reading);
          return reading;
        };
      }
      captureState.__codexTokenUsageOriginalInspectText = originalInspectText;
      captureState.__codexTokenUsageOriginalInspectValue = originalInspectValue;
      captureState.__codexTokenUsageWrapped = SCRIPT_VERSION;
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
    badge.dataset.version = SCRIPT_VERSION;
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
    if (!window.MutationObserver || window.__codexTokenUsageDomObserverVersion === SCRIPT_VERSION) return;
    window.__codexTokenUsageDomObserver?.disconnect?.();
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
    window.__codexTokenUsageDomObserverVersion = SCRIPT_VERSION;
  }

  function installRouteObserver() {
    if (window.__codexTokenUsageRouteObserver === SCRIPT_VERSION) return;
    window.__codexTokenUsageRouteObserver = SCRIPT_VERSION;
    const sync = () => {
      setActiveConversationId(conversationIdFromActiveRow() || conversationIdFromLocation());
      restoreHistoryForConversation(currentConversationId()).catch(() => {});
    };
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
  installTurnPendingObserver();
  installPostMessageObserver();
  installWebSocketObserver();
  installContextMeterObserver();
  installRouteObserver();
  installDomObserver();
  restoreHistoryForConversation(currentConversationId()).catch(() => {});

  if (window.__CODEX_TOKEN_USAGE_SCRIPT_TEST__) {
    window.__codexTokenUsageScriptTest = {
      extractUsage,
      formatBadgeText,
      mergeMetric,
      normalizeUsage,
      normalizeContextReading,
      parseElapsedMs,
      processPayload,
      rememberMetric,
      markTurnStarted: markNetworkTurnStarted,
      setActiveProjectId,
      setActiveConversationId,
      dispatchDocumentEvent: (type, event) => document.listeners?.[type]?.({ type, ...event }),
      exportUsage,
      getDisplayMetric: metricForActiveConversation,
      getStoredDetails: readStoredDetails,
      getTurnsForActiveConversation: () => deriveTurnsFromLedger(currentScopeKey(), currentConversationId()),
      getTokenUsage: () => window.__codexTokenUsage,
      restoreHistoryForConversation,
      resetDerivedStatePreservingLedger: () => {
        state.lastMetric = null;
        state.lastMetricKey = "";
        state.recent = [];
        state.byConversation = Object.create(null);
        state.byScope = Object.create(null);
        state.turnsByScope = Object.create(null);
        state.currentTurn = null;
        state.turnStartedAt = 0;
      },
    };
  }
})();

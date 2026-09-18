// ==UserScript==
// @name         DeepSeek Token Usage
// @namespace    codex-plus-plus
// @version      1.19.8
// @description  DeepSeek API Token 用量与费用统计面板，按官方费率计算，只在 Codex 运行时工作。
// @match        app://-/*
// @run-at       document-start
// ==/UserScript==

(() => {
  "use strict";

const VERSION = "1.19.7";
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

  /*
   * 余额：Codex 页面被 CSP 挡在门外（default-src 'none'），面板自己发不出
   * 普通请求，唯一能出去的路是 Codex++ 的宿主桥：
   *   window.__codexSessionDeleteBridge("/llm-proxy", { url, method, headers })
   * 所以余额由面板自己查，Key 由用户提供，来源二选一：
   *   1. Codex 配置里的 Key（Codex++ /settings/get 的 relayApiKey，也就是 Codex 正在用的那把）
   *   2. 用户直接粘进面板的 Key
   * 面板不再依赖任何随 Codex 启动的本机助手：助手在就顺带用，不在也完全不提示。
   * 桥目前只允许 POST，DeepSeek 余额接口只认 GET，所以查询会先试 GET 再试 POST，
   * 两条都不通时给出的是桥的限制说明，而不是"助手没在跑"。
   */
  const BALANCE_HELPER_TIMEOUT_MS = 3 * 60 * 1000;
  const BALANCE_BRIDGE_FN = "__codexSessionDeleteBridge";
  const BALANCE_BRIDGE_PATH = "/llm-proxy";
  const BALANCE_ENDPOINT = "https://api.deepseek.com/user/balance";
  const BALANCE_QUERY_TIMEOUT_MS = 20000;
  /*
   * Codex++ 的网络桥目前只放行 POST，而 DeepSeek 余额接口只认 GET，面板直连
   * 这条路暂时查不通，所以在 UI 上先撤掉（实现代码全部保留）。等 Codex++ 放开
   * GET（或出现 POST 版余额接口），把下面这一行改回 true，面板直连查询与状态提示
   * 会一起恢复，其它地方都不用动（面板上没有 Key 输入区，直连只认 Codex 配置里的 Key）。
   */
  const BRIDGE_BALANCE_QUERY_ENABLED = false;
  const BALANCE_QUERY_MIN_GAP_MS = 30 * 1000;
  const BALANCE_QUERY_AUTO_MS = 15 * 60 * 1000;
  /* 网络桥明确不支持 GET 时别死磕：静默查询退避到 6 小时后，手动点按钮不受限。 */
  const BALANCE_QUERY_BLOCKED_BACKOFF_MS = 6 * 60 * 60 * 1000;
  /* 用户勾选"记住"后，Key 存这里（本机 localStorage，不会随脚本上传）。 */
  const BALANCE_KEY_STORE = "__deepseekUsageBalanceKeyV1";
  /* 状态行只当短提示：助手失联那类消息在恢复后不该一直挂在面板上。 */
  const BALANCE_STATUS_TTL_MS = 45 * 1000;
  const BALANCE_BAR_DAYS = 14;
  const MAX_BALANCE_SNAPSHOTS = 5000;
  /*
   * 可选的本机助手：面板自己装不了本机程序（页面在沙箱里，宿主桥也没有执行、
   * 写文件的口子），但应用里的 Codex 能在这台电脑上跑命令：点「一键安装」时
   * 把安装请求写进对话框、直接发送，由 Codex 执行安装脚本；找不到对话框
   * （或 Codex 正忙）时才退回「复制命令」让用户自己粘。
   * 命令按系统给：Windows 是 PowerShell，macOS 是 curl | bash。安装脚本自己会先
   * 检查机器上有没有能用的 Node.js：有就直接用，没有才替用户装。
   */
  const HELPER_RAW_BASE =
    "https://raw.githubusercontent.com/Saydness/codexpp-deepseek-token-usage/main/helper";
  /* 直连 GitHub 不通时的备用源（国内可访问的 CDN）。 */
  const HELPER_MIRROR_BASE =
    "https://cdn.jsdelivr.net/gh/Saydness/codexpp-deepseek-token-usage@main/helper";
  /* 用户刚填的 Key：默认只存在页面内存；勾了"记住"才写 localStorage。 */
  let pendingBalanceKey = "";
  /* 这是一份脚本 = 一次 Codex 启动；第一次打开面板要占这个标记。 */
  let openedThisRun = false;
  let panelBalanceKey = "";
  let balanceConfigKey = "";
  let balanceQueryPromise = null;
  let balanceQueryTimer = 0;

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
    balances: [],
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
      balanceCurrency: "CNY",
      balanceSettingsOpen: false,
      balanceRequestAt: 0,
      balanceHandledAt: 0,
      balanceSyncAt: 0,
      balancePushedAt: 0,
      balanceProxyAuth: null,
      balanceSyncNote: "",
      /* 命令按哪个系统给：auto 看浏览器线索，用户也可以自己指定。 */
      helperPlatformPick: "auto",
      balanceEnabled: true,
      balanceSource: "auto",
      balanceKeyRequestAt: 0,
      balanceKeyClearAt: 0,
      balanceKeySaved: false,
      balanceKeyPresent: null,
      balanceSourceUsed: "",
      balanceKeyMode: "auto",
      balanceKeyRemember: false,
      balanceKeyFromConfig: false,
      balanceQueryAt: 0,
      balanceQueryOk: null,
      balanceQueryBusy: false,
      balanceQueryNote: "",
      balanceQuerySource: "",
      balanceQueryCooldownUntil: 0,
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
    observer: null,
    chartHitboxes: [],
    balanceStatus: "",
    balanceStatusTone: "",
    balanceStatusAt: 0,
  };

  /* 版本号当三位数字比大小，用来判断页面里那份是不是更新。 */
  function versionRank(text) {
    return String(text || "0")
      .split(".")
      .map((part) => Number(part) || 0);
  }

  function isOlderThan(other) {
    const mine = versionRank(VERSION);
    const theirs = versionRank(other);
    for (let index = 0; index < 3; index += 1) {
      const left = mine[index] || 0;
      const right = theirs[index] || 0;
      if (left !== right) return left < right;
    }
    return false;
  }

  const existingPanelApi = window[PANEL_API];
  if (existingPanelApi?.version === VERSION) return;
  if (existingPanelApi?.version && isOlderThan(existingPanelApi.version)) {
    return;
  }

  /*
   * 同一页面里常常同时存在两份脚本（Codex++ 热重载会注入新版本，旧版本的回调
   * 仍在跑）。旧版本如果继续按自己的版本重写面板内容，两份就会互相覆盖，面板
   * 看起来像「按钮全失效」。所以只有接管了 window.__deepseekUsagePanel 的那一份
   * 才准动面板，另一份发现名字被抢走后就安静退休。
   */
  const instance = { api: null, retired: false, bindTag: {} };

  function ownsPanel() {
    if (instance.retired) return false;
    /* start() 是同步跑在最后那行登记之前的，那时先当自己是主人。 */
    if (!instance.api) return true;
    return window[PANEL_API] === instance.api;
  }

  function retirePanel() {
    if (instance.retired) return;
    instance.retired = true;
    try {
      state.observer?.disconnect?.();
    } catch (_) {
      /* 退不掉也不影响，下面的守卫已经不会再动面板。 */
    }
    state.observer = null;
    /* 退休以后不许再往 localStorage 写：否则会把接班那份的状态盖回旧的。 */
    if (state.saveTimer) {
      window.clearTimeout(state.saveTimer);
      state.saveTimer = 0;
    }
    for (const key of ["ensureTimer", "renderTimer"]) {
      if (!state[key]) continue;
      cancelFrame(state[key]);
      state[key] = 0;
    }
  }

  function count(value) {
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? Math.round(number) : 0;
  }

  /*
   * 窗口被最小化或者切到后台时，requestAnimationFrame 根本不会回调，面板就会
   * 一直停在旧数字上、按钮看着像「全失效」。这种时候退回 setTimeout，保证状态
   * 改了页面就跟着画。
   */
  function scheduleFrame(callback) {
    if (typeof document !== "undefined" && document.hidden) {
      return window.setTimeout(callback, 16);
    }
    return window.requestAnimationFrame(callback);
  }

  function cancelFrame(handle) {
    if (!handle) return;
    try {
      window.clearTimeout(handle);
      window.cancelAnimationFrame(handle);
    } catch (_) {
      /* 句柄已经失效，忽略 */
    }
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
      if (Array.isArray(stored?.balances)) {
        const usable = stored.balances.filter(isValidBalance);
        state.balances = usable;
        /* 旧版本可能存下 0 元脏快照，清理后立刻写回，避免每次刷新都重算。 */
        if (usable.length !== stored.balances.length) scheduleSave();
      }
      if (stored?.settings && typeof stored.settings === "object") {
        state.settings = {
          ...state.settings,
          ...stored.settings,
        };
      }
      /*
       * Codex 每次启动后先看当天的用量：不沿用上次选的日期/月份，
       * 免得一打开看到的是别的日子或上个月。
       */
      state.settings.mode = "day";
      state.settings.day = todayKey();
      state.settings.month = state.settings.day.slice(0, 7);
      scheduleSave();
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
    pruneBalances();
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

  function isValidBalance(snapshot) {
    return (
      snapshot &&
      typeof snapshot === "object" &&
      Number.isFinite(Number(snapshot.t)) &&
      typeof snapshot.d === "string" &&
      Number.isFinite(Number(snapshot.v)) &&
      /* 手动入口的空输入会变成 0，那不是真实余额，直接丢弃。 */
      !(Number(snapshot.v) <= 0 && snapshot.s !== "api")
    );
  }

  function pruneBalances() {
    const cutoff = Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000;
    const snapshots = state.balances
      .filter(isValidBalance)
      .filter((snapshot) => Number(snapshot.t) >= cutoff)
      .sort((a, b) => Number(a.t) - Number(b.t));
    if (snapshots.length > MAX_BALANCE_SNAPSHOTS) {
      snapshots.splice(0, snapshots.length - MAX_BALANCE_SNAPSHOTS);
    }
    state.balances = snapshots;
    balanceCache = null;
  }

  function serializedState() {
    return {
      version: VERSION,
      settings: state.settings,
      records: state.records,
      balances: state.balances,
    };
  }

  function scheduleSave() {
    if (instance.retired) return;
    if (state.saveTimer) return;
    state.saveTimer = window.setTimeout(() => {
      state.saveTimer = 0;
      pruneRecords();
      pruneBalances();
      try {
        localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify(serializedState())
        );
      } catch (_) {
        state.records = state.records.slice(
          -Math.max(500, Math.floor(state.records.length * 0.8))
        );
        try {
          localStorage.setItem(
            STORAGE_KEY,
            JSON.stringify(serializedState())
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

  /* ---------------------------------------------------------------------- */
  /* Account balance                                                        */
  /* ---------------------------------------------------------------------- */

  function balanceSymbol(currency) {
    return String(currency || "CNY").toUpperCase() === "CNY" ? "¥" : "$";
  }

  function formatBalance(value, currency) {
    const number = Number(value);
    if (!Number.isFinite(number)) return "—";
    return `${balanceSymbol(currency)}${number.toFixed(2)}`;
  }

  /* 余额下降记为正数消耗，余额上升（充值）显示为带 + 的负数。 */
  function formatBalanceSpend(value, currency) {
    const number = Number(value);
    if (!Number.isFinite(number)) return "—";
    const prefix = number < 0 ? "+" : "";
    return `${prefix}${balanceSymbol(currency)}${Math.abs(number).toFixed(2)}`;
  }

  /* 快照来源：api=助手自动读取，log=历史文件导入，其它=手动记录。 */
  function balanceSourceLabel(source) {
    if (source === "api") return "自动获取";
    if (source === "log") return "历史导入";
    return "手动记录";
  }

  /* 助手最后一次成功读到余额用的是哪条路。 */
  function balanceReadSourceLabel(source) {
    if (source === "proxy") return "本机代理";
    if (source === "env") return "环境变量 Key";
    if (source === "auth") return "Codex auth.json";
    if (source === "store") return "本机保存的 Key";
    return "";
  }

  /* ------------------ 面板自己查余额：Key 来源和宿主桥 ------------------ */

  function looksLikeKey(value) {
    return /^sk-[A-Za-z0-9_-]{8,}$/.test(String(value || "").trim());
  }

  function maskKeyTail(key) {
    const text = String(key || "");
    return text.length >= 12 ? `${text.slice(0, 5)}…${text.slice(-4)}` : "sk-…";
  }

  function balanceStoredKey() {
    try {
      return String(window.localStorage?.getItem(BALANCE_KEY_STORE) || "");
    } catch (_) {
      return "";
    }
  }

  function writeBalanceStoredKey(key) {
    try {
      if (looksLikeKey(key)) window.localStorage?.setItem(BALANCE_KEY_STORE, String(key).trim());
      else window.localStorage?.removeItem(BALANCE_KEY_STORE);
    } catch (_) {
      /* 本机不让写就只保留内存里的那份 */
    }
  }

  /*
   * Key 优先级：面板刚填的 > 本机记住的 > Codex 配置里的（Codex++ 设置里的
   * relayApiKey）。两条都不需要额外装助手，也不需要用户找文件。
   */
  function balanceKeyInfo() {
    if (looksLikeKey(panelBalanceKey)) {
      return { key: panelBalanceKey.trim(), label: "面板里填的 Key", source: "panel" };
    }
    const stored = balanceStoredKey();
    if (looksLikeKey(stored)) {
      return { key: stored.trim(), label: "本机记住的 Key", source: "store" };
    }
    /* 手动模式只用用户自己给的那把，不去翻 Codex 配置。 */
    if (state.settings.balanceKeyMode === "manual") {
      return { key: "", label: "", source: "" };
    }
    if (looksLikeKey(balanceConfigKey)) {
      return { key: balanceConfigKey.trim(), label: "Codex 配置里的 Key", source: "config" };
    }
    return { key: "", label: "", source: "" };
  }


  function balanceBridgeReady() {
    return typeof window[BALANCE_BRIDGE_FN] === "function";
  }

  /* 宿主桥：Codex++ 的本地代理，能把一次请求转到任意 HTTPS 地址。 */
  function callHostBridge(path, payload, timeoutMs = BALANCE_QUERY_TIMEOUT_MS) {
    if (!balanceBridgeReady()) {
      return Promise.resolve({ __failed: "当前 Codex++ 没有开放网络桥" });
    }
    return new Promise((resolve) => {
      let settled = false;
      const finish = (value) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);
        resolve(value);
      };
      const timer = window.setTimeout(
        () => finish({ __failed: "网络桥超时" }),
        timeoutMs
      );
      try {
        Promise.resolve(window[BALANCE_BRIDGE_FN](path, payload || {})).then(finish, (error) =>
          finish({ __failed: String((error && error.message) || error) })
        );
      } catch (error) {
        finish({ __failed: String((error && error.message) || error) });
      }
    });
  }

  function parseBalanceValue(payload) {
    const infos = Array.isArray(payload?.balance_infos) ? payload.balance_infos : [];
    if (!infos.length) return null;
    const chosen =
      infos.find(
        (item) => String(item?.currency || "").toUpperCase() === "CNY"
      ) || infos[0];
    const value = Number(chosen?.total_balance);
    if (!Number.isFinite(value)) return null;
    return {
      value,
      currency: String(
        chosen?.currency || state.settings.balanceCurrency || "CNY"
      ).toUpperCase(),
      available: payload?.is_available !== false,
    };
  }

  /* 余额接口只认 GET；宿主桥只放 POST，两条都试一遍再决定怎么报错。 */
  async function requestBalanceOnce(key) {
    const headers = { Authorization: `Bearer ${key}`, Accept: "application/json" };
    const reasons = [];
    let bridgeBlocksGet = false;
    for (const method of ["GET", "POST"]) {
      const payload = {
        url: BALANCE_ENDPOINT,
        method,
        headers,
        timeout_ms: 15000,
      };
      if (method === "POST") payload.body = "";
      const result = await callHostBridge(BALANCE_BRIDGE_PATH, payload);
      if (result?.__failed) {
        const message = String(result.__failed);
        if (method === "GET" && /仅支持\s*POST|POST 请求/.test(message)) {
          bridgeBlocksGet = true;
        }
        reasons.push(`${method}：${message}`);
        continue;
      }
      if (result?.status !== "ok") {
        const message = String(result?.message || "未知失败");
        if (method === "GET" && /仅支持\s*POST|POST 请求/.test(message)) {
          bridgeBlocksGet = true;
        }
        reasons.push(`${method}：${message}`);
        continue;
      }
      const status = Number(result.http_status || 0);
      const body =
        result.body_json ?? parseJson(String(result.body_text || "")) ?? null;
      if (status >= 200 && status < 300) {
        const parsed = parseBalanceValue(body);
        if (parsed) return { ok: true, ...parsed, method };
        reasons.push(`${method}：返回里没有余额字段`);
        continue;
      }
      if (status === 401 || status === 403) {
        return {
          ok: false,
          fatal: true,
          message: `Key 被接口拒绝（HTTP ${status}），检查 Key 是否正确`,
        };
      }
      reasons.push(
        `${method}：HTTP ${status || "?"}${
          String(result.body_text || "").trim()
            ? ` ${String(result.body_text).trim().slice(0, 80)}`
            : ""
        }`
      );
    }
    return { ok: false, bridgeBlocksGet, reasons };
  }

  function balanceQueryFailureText(result) {
    if (result?.fatal && result.message) return result.message;
    if (result?.bridgeBlocksGet) {
      return "面板直连查不了：当前 Codex++ 的网络桥只允许 POST，余额接口只认 GET（装本机助手可以自动更新，或等 Codex++ 开放 GET 后自动生效）";
    }
    const reasons = Array.isArray(result?.reasons) ? result.reasons : [];
    if (!reasons.length) return "余额查询失败";
    return `余额查询失败：${reasons.join("；").slice(0, 160)}`;
  }

  async function queryBalanceNow({ silent = false } = {}) {
    if (!balanceEnabled()) {
      if (!silent) setBalanceStatus("余额功能已关闭，可在「设置」里打开", "warn");
      return null;
    }
    if (!BRIDGE_BALANCE_QUERY_ENABLED) {
      /*
       * 面板直连这条路先撤了：有助手就让助手顺手刷一次，没有就安静返回，
       * 不写失败状态，免得开面板时总挂一条"查不到余额"的提示。
       */
      if (balanceHelperAlive()) {
        state.settings.balanceRequestAt = Date.now();
        scheduleSave();
      }
      return null;
    }
    if (balanceQueryPromise) return balanceQueryPromise;
    if (silent && Date.now() < (Number(state.settings.balanceQueryCooldownUntil) || 0)) {
      return null;
    }
    if (!silent) state.settings.balanceQueryCooldownUntil = 0;
    /*
     * 面板永远自己先试一次直连；本机如果还跑着可选的本机助手，顺手也请它刷一次
     * （它用 GET，读得到），两条路谁先回来用谁，互不依赖。两者都不依赖本机代理。
     */
    if (balanceHelperAlive()) {
      state.settings.balanceRequestAt = Date.now();
      scheduleSave();
    }
    const info = balanceKeyInfo();
    if (!info.key) {
      state.settings.balanceQueryOk = null;
      state.settings.balanceQueryNote =
        "面板直连要 Key：装本机助手后由它自动更新余额";
      if (!silent) {
        setBalanceStatus("面板直连要 Key；装本机助手可以让余额自动更新", "warn");
      }
      render();
      return null;
    }
    if (!balanceBridgeReady()) {
      state.settings.balanceQueryOk = false;
      state.settings.balanceQueryNote = "当前 Codex++ 没开放网络桥，面板查不到余额（装本机助手可以自动更新）";
      if (!silent) setBalanceStatus(state.settings.balanceQueryNote, "warn");
      render();
      return null;
    }
    state.settings.balanceQueryBusy = true;
    state.settings.balanceQueryNote = "";
    state.settings.balanceQueryAt = Date.now();
    render();
    const promise = requestBalanceOnce(info.key)
      .then((result) => {
        state.settings.balanceQueryBusy = false;
        if (result?.ok) {
          state.settings.balanceQueryCooldownUntil = 0;
          state.settings.balanceQueryOk = true;
          state.settings.balanceQuerySource = info.source;
          state.settings.balanceQueryNote = `刚刚更新（${result.method}）`;
          state.settings.balanceSourceUsed =
            info.source === "config" ? "auth" : "store";
          setBalanceStatus(
            `余额已更新：${formatBalance(result.value, result.currency)}`,
            "ok"
          );
          recordBalance(result.value, {
            source: "api",
            currency: result.currency,
          });
        } else {
          state.settings.balanceQueryOk = false;
          state.settings.balanceQueryNote = balanceQueryFailureText(result);
          if (result?.bridgeBlocksGet) {
            state.settings.balanceQueryCooldownUntil =
              Date.now() + BALANCE_QUERY_BLOCKED_BACKOFF_MS;
          }
          if (!silent) {
            setBalanceStatus(state.settings.balanceQueryNote, "warn");
          }
        }
        scheduleSave();
        render();
        return result;
      })
      .catch((error) => {
        state.settings.balanceQueryBusy = false;
        state.settings.balanceQueryOk = false;
        state.settings.balanceQueryNote = `余额查询失败：${String(
          (error && error.message) || error
        ).slice(0, 120)}`;
        scheduleSave();
        render();
        return null;
      })
      .finally(() => {
        if (balanceQueryPromise === promise) balanceQueryPromise = null;
      });
    balanceQueryPromise = promise;
    return promise;
  }

  /* 从 Codex 自己的配置里取 Key，省得用户再抄一遍。 */
  function pickConfigKey(settings) {
    const candidates = [];
    if (settings && typeof settings === "object") {
      candidates.push(settings.relayApiKey);
      const profiles = Array.isArray(settings.relayProfiles)
        ? settings.relayProfiles
        : [];
      const active =
        profiles.find((item) => item && item.id === settings.activeRelayId) ||
        profiles[0];
      if (active) candidates.push(active.apiKey, active.relayApiKey);
    }
    for (const candidate of candidates) {
      if (looksLikeKey(candidate)) return String(candidate).trim();
    }
    return "";
  }

  async function useCodexConfigKey({ silent = false } = {}) {
    if (!balanceBridgeReady()) {
      if (!silent) {
        setBalanceStatus("当前 Codex++ 没开放网络桥，读不到配置里的 Key", "warn");
      }
      return false;
    }
    const settings = await callHostBridge("/settings/get", {}, 10000);
    const key = settings?.__failed ? "" : pickConfigKey(settings);
    if (!key) {
      if (!silent) {
        setBalanceStatus("Codex 配置里没有可用的 Key，直接粘一个到下面也行", "warn");
      }
      return false;
    }
    balanceConfigKey = key;
    state.settings.balanceKeyFromConfig = true;
    state.settings.balanceKeyMode = "auto";
    scheduleSave();
    render();
    if (!silent) {
      setBalanceStatus(
        BRIDGE_BALANCE_QUERY_ENABLED
          ? `已读到配置里的 Key（${maskKeyTail(key)}）`
          : balanceHelperAlive()
            ? `已读到配置里的 Key（${maskKeyTail(key)}）· 余额交给本机助手更新`
            : `已读到配置里的 Key（${maskKeyTail(key)}）· 装上本机助手（点「一键安装」）就能自动更新`,
        "ok"
      );
    }
    queryBalanceNow({ silent: true });
    return true;
  }

  function balanceEnabled() {
    return state.settings.balanceEnabled !== false;
  }

  function balanceSourceChoice() {
    const value = String(state.settings.balanceSource || "auto");
    return value === "proxy" || value === "key" ? value : "auto";
  }

  function latestBalance() {
    let latest = null;
    for (const snapshot of state.balances) {
      if (!latest || Number(snapshot.t) >= Number(latest.t)) latest = snapshot;
    }
    return latest;
  }

  function recordBalance(
    value,
    { source = "manual", currency = "CNY", timestamp = Date.now() } = {}
  ) {
    const number = Number(value);
    if (!Number.isFinite(number) || number < 0) return null;
    /* 0 元快照不能记账：会被当日消耗算成一次充值。官方接口回传的 0 元仍然保留。 */
    if (number === 0 && source !== "api") return null;
    const rounded = Number(number.toFixed(6));
    const day = todayKey(timestamp);
    const latest = latestBalance();
    if (latest && latest.v === rounded && latest.d === day) {
      latest.t = Number(timestamp);
      latest.s = source;
    } else {
      state.balances.push({
        t: Number(timestamp),
        d: day,
        v: rounded,
        c: String(currency || "CNY").toUpperCase(),
        s: source,
      });
    }
    pruneBalances();
    scheduleSave();
    render();
    updateLauncherBadge();
    return latestBalance();
  }

  /*
   * 批量导入历史余额快照（本机助手读 balance.log 这类文件后回填）。
   * 只补缺口：同一时刻、或同一分钟内同一金额都算已存在，重复导入不会翻倍；
   * 0 元是查询失败的占位，一律丢掉。
   */
  function importBalanceSnapshots(entries) {
    if (!Array.isArray(entries)) return 0;
    let added = 0;
    for (const entry of entries) {
      const value = Number(entry?.v);
      const at = Number(entry?.t);
      if (!Number.isFinite(value) || value <= 0) continue;
      if (!Number.isFinite(at) || at <= 0) continue;
      const day = todayKey(at);
      const rounded = Number(value.toFixed(6));
      const known = state.balances.some(
        (item) =>
          Number(item.t) === at ||
          (item.d === day &&
            Number(item.v) === rounded &&
            Math.abs(Number(item.t) - at) < 60000)
      );
      if (known) continue;
      state.balances.push({
        t: at,
        d: day,
        v: rounded,
        c: String(
          entry?.c || state.settings.balanceCurrency || "CNY"
        ).toUpperCase(),
        s: String(entry?.s || "log"),
      });
      added += 1;
    }
    if (!added) return 0;
    pruneBalances();
    scheduleSave();
    render();
    updateLauncherBadge();
    return added;
  }

  function dayDistance(from, to) {
    const start = Date.parse(`${from}T00:00:00Z`);
    const end = Date.parse(`${to}T00:00:00Z`);
    if (!Number.isFinite(start) || !Number.isFinite(end)) return 0;
    return Math.max(0, Math.round((end - start) / 86400000));
  }

  /*
   * 每天只保留首末两次快照：当日消耗 = 上一个有记录的收盘余额 - 当日收盘余额。
   * 中间断档的日期会用 spanDays 标记，避免把跨多天的消耗当成单日消耗。
   */
  let balanceCache = null;

  function balanceDayList() {
    if (balanceCache) return balanceCache;
    const days = new Map();
    for (const snapshot of state.balances) {
      /* 0 元快照只用于展示当前余额，不能当跨天基线。 */
      if (Number(snapshot.v) <= 0) continue;
      const item = days.get(snapshot.d) || {
        day: snapshot.d,
        first: snapshot,
        last: snapshot,
        count: 0,
      };
      item.count += 1;
      if (Number(snapshot.t) < Number(item.first.t)) item.first = snapshot;
      if (Number(snapshot.t) >= Number(item.last.t)) item.last = snapshot;
      days.set(snapshot.d, item);
    }
    const list = Array.from(days.values()).sort((a, b) =>
      a.day < b.day ? -1 : a.day > b.day ? 1 : 0
    );
    list.forEach((item, index) => {
      const previous = index > 0 ? list[index - 1] : null;
      item.open = previous ? Number(previous.last.v) : null;
      item.close = Number(item.last.v);
      item.spend = previous
        ? Number((Number(previous.last.v) - Number(item.last.v)).toFixed(6))
        : null;
      /* 还没有跨天基线时，用当天首尾快照给出当日消耗（会偏低，仅作参考）。 */
      item.spendFromFirst = Number(
        (Number(item.first.v) - Number(item.last.v)).toFixed(6)
      );
      item.spanDays = previous ? dayDistance(previous.day, item.day) : 0;
    });
    balanceCache = list;
    return list;
  }

  function balanceDayItem(day) {
    return balanceDayList().find((item) => item.day === day) || null;
  }

  function balanceMonthSpend(month, dayList = balanceDayList()) {
    const list = dayList;
    const inside = list.filter((item) => item.day.startsWith(month));
    if (!inside.length) return null;
    const first = inside[0];
    const close = Number(inside[inside.length - 1].last.v);
    const hasOpen = first.open !== null && first.open !== undefined;
    const open = hasOpen ? Number(first.open) : Number(first.first.v);
    const previous = hasOpen ? list[list.indexOf(first) - 1] : null;
    return {
      open,
      close,
      spend: Number((open - close).toFixed(6)),
      spanDays: first.spanDays,
      from: previous ? previous.day : first.day,
      to: inside[inside.length - 1].day,
    };
  }

  function balanceStatusElement() {
    return (
      state.ui?.panel?.querySelector('[data-field="balanceStatus"]') || null
    );
  }

  function setBalanceStatus(message, tone = "") {
    state.balanceStatus = message;
    state.balanceStatusTone = tone;
    state.balanceStatusAt = Date.now();
    paintBalanceStatus();
  }

  function paintBalanceStatus() {
    const element = balanceStatusElement();
    if (!element) return;
    const fresh =
      Date.now() - Number(state.balanceStatusAt || 0) < BALANCE_STATUS_TTL_MS;
    element.textContent = fresh ? state.balanceStatus : "";
    element.dataset.tone = fresh ? state.balanceStatusTone || "" : "";
  }

  function balanceSyncAge() {
    const at = Number(state.settings.balanceSyncAt) || 0;
    return at ? Date.now() - at : Infinity;
  }

  function balanceHelperAlive() {
    return balanceSyncAge() < BALANCE_HELPER_TIMEOUT_MS;
  }

  /*
   * Codex++ 目前只发布了三种安装包：Windows x64、macOS Intel、macOS Apple 芯片，
   * 所以命令也只按这两套系统给：Windows 用 PowerShell，macOS 用 curl | bash。
   * 先按浏览器的线索猜一个，猜错可以在面板里手动挑。
   */
  function helperPlatformPick() {
    const picked = String(state.settings.helperPlatformPick || "auto");
    return picked === "win" || picked === "mac" ? picked : "auto";
  }

  function detectHelperPlatform() {
    const nav = typeof navigator !== "undefined" ? navigator : {};
    const ua = String(nav.userAgent || "");
    if (/Windows|Win32|Win64/i.test(ua)) return "win";
    /* iPad 的桌面模式会把自己报成 Mac，跟着走就行。 */
    if (/Macintosh|Mac OS X|iPhone|iPad|iPod/i.test(ua)) return "mac";
    /* 认不出来时按 Windows 给：桌面版用户里它最多。 */
    return "win";
  }

  function helperPlatform() {
    const picked = helperPlatformPick();
    return picked === "auto" ? detectHelperPlatform() : picked;
  }

  function helperPlatformLabel(platform = helperPlatform()) {
    if (platform === "mac") return "macOS";
    return "Windows";
  }

  function helperShellCommand(extra = "") {
    /* curl 是 macOS 自带的；GitHub 直连不通时换国内镜像，括号里先挑好再管给 bash。 */
    return `(curl -fsSL ${HELPER_RAW_BASE}/install-helper.sh || curl -fsSL ${HELPER_MIRROR_BASE}/install-helper.sh) | bash${extra}`;
  }

  /*
   * Windows 这条命令要能同时粘进 cmd 和 PowerShell：
   * 所以整条命令里不出现 $ 变量（在 PowerShell 里会被提前展开），
   * 只用单引号和括号表达式，脚本直接在内存里跑，落地文件都不需要。
   */
  function helperWindowsCommand(uninstall) {
    const tail = uninstall ? " -Uninstall" : "";
    const run = (base) =>
      `& ([scriptblock]::Create((New-Object Net.WebClient).DownloadString('${base}/install-helper.ps1')))${tail}`;
    return (
      'powershell -NoProfile -ExecutionPolicy Bypass -Command "' +
      `try { ${run(HELPER_RAW_BASE)} } catch { ${run(HELPER_MIRROR_BASE)} }` +
      '"'
    );
  }

  function helperInstallCommand() {
    if (helperPlatform() === "win") {
      return helperWindowsCommand(false);
    }
    return helperShellCommand();
  }

  function helperUninstallCommand() {
    if (helperPlatform() === "win") {
      return helperWindowsCommand(true);
    }
    return helperShellCommand(" -s -- -Uninstall");
  }

  /*
   * 把安装 / 卸载请求交给应用里的 Codex 执行：写进它的输入框，能发就直接发。
   * 返回值说明：sent 已发送；waiting 已写进输入框但发送键不可用（Codex 正忙，
   * 这颗键会变成「停止」，绝不能点）；composer-occupied 输入框里有用户自己的
   * 内容，不能覆盖；no-composer / insert-failed 退回复制命令。
   */
  function codexComposerInput() {
    return document.querySelector("[data-codex-composer]");
  }

  function codexSendButton() {
    const composer = codexComposerInput();
    if (!composer) return null;
    let node = composer;
    /* 只在输入框所在的这块结构里找，绝不扫到整页去点别的按钮。 */
    for (
      let depth = 0;
      depth < 8 && node && node !== document.body && node !== document.documentElement;
      depth += 1, node = node.parentElement
    ) {
      if (!node.querySelectorAll) continue;
      for (const button of node.querySelectorAll("button")) {
        const label = String(button.getAttribute("aria-label") || "").trim();
        /* 只认「发送」，codexHelperRequest 的注释里说明了为什么不能点别的键。 */
        if (/^(发送|发送消息|提交|Send|Send message|Submit)$/i.test(label)) {
          return button;
        }
      }
    }
    return null;
  }

  function codexHelperRequest(command, uninstall) {
    const composer = codexComposerInput();
    if (!composer) return "no-composer";
    const existing = String(composer.textContent || "");
    if (!existing.includes("DeepSeek 用量面板")) {
      if (existing.trim()) return "composer-occupied";
      const lines = uninstall
        ? [
            "【DeepSeek 用量面板】请在这台电脑上卸载 DeepSeek 余额小助手（面板其它功能不受影响）。",
            "",
            "直接执行下面这条命令即可，不需要管理员权限：",
            command,
            "",
            "执行完说一声结果就行。",
          ]
        : [
            "【DeepSeek 用量面板】请在这台电脑上装一下「本机助手」，它负责把 DeepSeek 账户余额推给用量面板。",
            "",
            "直接执行下面这条命令即可：脚本会先检查这台机器，Node.js 已经有就直接用、没有才自动补上，全程不需要管理员权限：",
            command,
            "",
            "装好后面板上的助手状态会变成「运行中」，不用重启 Codex。",
          ];
      composer.focus();
      const range = document.createRange();
      range.selectNodeContents(composer);
      range.collapse(false);
      const selection = window.getSelection();
      if (selection) {
        selection.removeAllRanges();
        selection.addRange(range);
      }
      document.execCommand("insertText", false, lines.join("\n"));
      if (!String(composer.textContent || "").includes("DeepSeek 用量面板")) {
        return "insert-failed";
      }
    }
    const send = codexSendButton();
    if (!send) return "waiting";
    send.click();
    return "sent";
  }

  function setHelperPlatformPick(value) {
    state.settings.helperPlatformPick =
      value === "win" || value === "mac" ? value : "auto";
    scheduleSave();
    render();
  }

  /* 页面里没有剪贴板权限时退回到老办法；两条都不行就把命令留在状态行里。 */
  function fallbackCopyText(value) {
    try {
      const area = document.createElement("textarea");
      area.value = value;
      area.setAttribute("readonly", "");
      area.style.position = "fixed";
      area.style.top = "-1000px";
      area.style.opacity = "0";
      document.body.appendChild(area);
      area.select();
      const ok = document.execCommand("copy");
      area.remove();
      return ok;
    } catch (_) {
      return false;
    }
  }

  function copyHelperCommand(kind) {
    const uninstall = kind === "uninstall";
    const command = uninstall ? helperUninstallCommand() : helperInstallCommand();
    const where = helperPlatform() === "win" ? "PowerShell 窗口" : "终端";
    const done = (ok) => {
      const tail = uninstall
        ? ""
        : "；脚本自己检查依赖，缺什么会替你补上";
      setBalanceStatus(
        ok
          ? `已复制${uninstall ? "卸载" : "安装"}命令（${helperPlatformLabel()}），粘到${where}回车即可${tail}`
          : `复制失败，请手动复制这条命令：${command}`,
        ok ? "ok" : "warn"
      );
    };
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard
          .writeText(command)
          .then(() => done(true))
          .catch(() => done(fallbackCopyText(command)));
        return;
      }
    } catch (_) {
      /* 落到下面的兜底 */
    }
    done(fallbackCopyText(command));
  }

  /*
   * 面板上的「一键安装 / 卸载」：优先让 Codex 直接执行；它没在对话页（找不到
   * 输入框）、正忙或输入框被占用时，退回复制命令，用户照样能一条命令装好。
   */
  function runHelperFromPanel(uninstall) {
    const command = uninstall ? helperUninstallCommand() : helperInstallCommand();
    const result = codexHelperRequest(command, uninstall);
    if (result === "sent") {
      setBalanceStatus(
        uninstall
          ? "已让 Codex 在这台电脑上卸载助手，进度看对话窗口"
          : "已让 Codex 在这台电脑上安装助手（先检测依赖、缺了才补），装好后这里会显示「运行中」",
        "ok"
      );
      return;
    }
    if (result === "waiting") {
      setBalanceStatus(
        "安装请求已经写进 Codex 输入框；它正忙，等忙完按回车发送即可",
        "warn"
      );
      return;
    }
    if (result === "composer-occupied") {
      setBalanceStatus(
        "Codex 输入框里已经有内容，没有动它：可以点「复制安装命令」自己粘一次",
        "warn"
      );
      return;
    }
    /* 找不到输入框或写入失败：退回复制，不让用户空手而归。 */
    copyHelperCommand(uninstall ? "uninstall" : "install");
  }

  function formatAgo(milliseconds) {
    if (!Number.isFinite(milliseconds)) return "从未";
    const seconds = Math.max(0, Math.round(milliseconds / 1000));
    if (seconds < 90) return `${seconds} 秒前`;
    const minutes = Math.round(seconds / 60);
    if (minutes < 90) return `${minutes} 分钟前`;
    const hours = Math.round(minutes / 60);
    if (hours < 36) return `${hours} 小时前`;
    return `${Math.round(hours / 24)} 天前`;
  }

  function balanceSyncText() {
    if (!balanceEnabled()) return "余额功能已关闭";
    if (BRIDGE_BALANCE_QUERY_ENABLED && state.settings.balanceQueryBusy) {
      return "正在查询余额…";
    }
    const note = String(state.settings.balanceQueryNote || "").trim();
    const at = Number(state.settings.balanceQueryAt) || 0;
    if (BRIDGE_BALANCE_QUERY_ENABLED && state.settings.balanceQueryOk === true) {
      return at ? `面板直连 · ${formatAgo(Date.now() - at)}更新` : "面板直连 · 已更新";
    }
    /* 本机如果有助手在跑，它的数据照样算数；没有就完全不提它。 */
    if (Number(state.settings.balanceSyncAt) && balanceHelperAlive()) {
      const used = balanceReadSourceLabel(state.settings.balanceSourceUsed);
      if (used) return `余额来源：${used} · ${formatAgo(balanceSyncAge())}同步`;
    }
    if (
      BRIDGE_BALANCE_QUERY_ENABLED &&
      state.settings.balanceQueryOk === false &&
      note
    ) {
      return note;
    }
    /* 面板自己连不了网：自动更新的活交给本机助手，没装就直接引导去装。 */
    if (!BRIDGE_BALANCE_QUERY_ENABLED) {
      if (balanceHelperAlive()) {
        return "余额由本机助手自动更新 · 点「刷新余额」立刻补一次";
      }
      return "自动更新要装一次本机助手：点「一键安装」，余额就会自动更新";
    }
    if (!balanceKeyInfo().key) {
      return "面板直连要 Key（读 Codex 配置里那把）；装本机助手可以让余额自动更新";
    }
    return "已就绪，点「刷新余额」立刻查询";
  }

  /*
   * 面板自己连不了网，「刷新余额」就请本机助手去查：它在本机用 GET，读得到。
   * 没检测到助手就直接说去装：面板没有手填渠道，余额只由助手提供。
   */
  function requestHelperBalanceRefresh({ silent = false } = {}) {
    if (!balanceHelperAlive()) {
      if (!silent) {
        setBalanceStatus(
          "本机助手没在跑：点「一键安装」装上它，余额就会自动更新",
          "warn"
        );
      }
      return false;
    }
    state.settings.balanceRequestAt = Date.now();
    scheduleSave();
    if (!silent) setBalanceStatus("已请本机助手刷新余额，几秒后回填", "ok");
    render();
    return true;
  }

  /*
   * 点「刷新余额」：有 Key 就直接用宿主桥查一次（面板自己完成），没有 Key
   * 就提示去填；同一个请求标记也留着，本机如果装了助手，它会顺手补一次。
   */
  function requestBalanceRefresh({ silent = false } = {}) {
    if (!balanceEnabled()) {
      if (!silent) {
        setBalanceStatus("余额功能已关闭，勾选卡片上的「启用」即可打开", "warn");
      }
      return false;
    }
    if (!BRIDGE_BALANCE_QUERY_ENABLED) {
      return requestHelperBalanceRefresh({ silent });
    }
    state.settings.balanceRequestAt = Date.now();
    scheduleSave();
    if (balanceKeyInfo().key) {
      queryBalanceNow({ silent });
      render();
      return true;
    }
    if (!silent) {
      setBalanceStatus("面板直连要 Key；装本机助手可以让余额自动更新", "warn");
    }
    render();
    return false;
  }

  /*
   * 自动查询：面板开着的时候每 BALANCE_QUERY_AUTO_MS 查一次，两次之间至少
   * 隔 BALANCE_QUERY_MIN_GAP_MS，页面在后台时不查，避免无意义请求。
   */
  function scheduleBalanceAutoQuery() {
    /* 桥能查之前不需要这个定时器：本机助手自己会定时推余额。 */
    if (!BRIDGE_BALANCE_QUERY_ENABLED) return;
    if (balanceQueryTimer) return;
    balanceQueryTimer = window.setInterval(() => {
      if (!balanceEnabled() || document.hidden) return;
      if (!balanceKeyInfo().key) return;
      if (balanceSyncAge() < BALANCE_HELPER_TIMEOUT_MS) return;
      const last = Number(state.settings.balanceQueryAt) || 0;
      if (Date.now() - last < BALANCE_QUERY_MIN_GAP_MS) return;
      queryBalanceNow({ silent: true });
    }, BALANCE_QUERY_AUTO_MS);
  }

  /*
   * 打开面板时顺手补一次查询：没有 Key 就先试着从 Codex 配置里读一个，
   * 读到了再查；全程静默，不会弹任何"没装助手"的提示。
   */
  function refreshBalanceOnOpen() {
    if (!balanceEnabled()) return;
    if (!BRIDGE_BALANCE_QUERY_ENABLED) return;
    if (!balanceBridgeReady()) return;
    const last = Number(state.settings.balanceQueryAt) || 0;
    if (balanceKeyInfo().key) {
      if (Date.now() - last < BALANCE_QUERY_MIN_GAP_MS) return;
      queryBalanceNow({ silent: true });
      return;
    }
    useCodexConfigKey({ silent: true });
  }

  function balanceSyncReport() {
    const latest = latestBalance();
    return {
      requestAt: Number(state.settings.balanceRequestAt) || 0,
      handledAt: Number(state.settings.balanceHandledAt) || 0,
      syncAt: Number(state.settings.balanceSyncAt) || 0,
      pushedAt: Number(state.settings.balancePushedAt) || 0,
      proxyAuth: state.settings.balanceProxyAuth,
      note: state.settings.balanceSyncNote || "",
      currency: state.settings.balanceCurrency || "CNY",
      lastValue: latest ? Number(latest.v) : null,
      lastDay: latest ? latest.d : "",
      visible: Boolean(state.ui?.panel && !state.ui.panel.hidden),
      enabled: balanceEnabled(),
      source: balanceSourceChoice(),
      sourceUsed: state.settings.balanceSourceUsed || "",
      hasKey: state.settings.balanceKeyPresent,
      /* 面板自己查余额的状态，供页面/自动化读取。 */
      queryAt: Number(state.settings.balanceQueryAt) || 0,
      queryOk: state.settings.balanceQueryOk,
      queryBusy: state.settings.balanceQueryBusy === true,
      queryNote: state.settings.balanceQueryNote || "",
      querySource: state.settings.balanceQuerySource || "",
      keyLabel: balanceKeyInfo().label,
      keyTail: balanceKeyInfo().key ? maskKeyTail(balanceKeyInfo().key) : "",
      bridge: balanceBridgeReady(),
      keyRequestAt: Number(state.settings.balanceKeyRequestAt) || 0,
      keyClearAt: Number(state.settings.balanceKeyClearAt) || 0,
      keySaved: state.settings.balanceKeySaved === true,
      /* 助手取走这个值去加密保存；取完会通过 keySaved 让面板清掉。 */
      pendingKey: pendingBalanceKey,
    };
  }

  /* 本机助手调用：登记一次同步结果（心跳 / 推送成功 / 失败原因）。 */
  function applyBalanceSync(report = {}) {
    const info = report && typeof report === "object" ? report : {};
    state.settings.balanceSyncAt = Date.now();
    if (typeof info.hasAuth === "boolean") {
      state.settings.balanceProxyAuth = info.hasAuth;
    }
    const handled = Number(info.handledRequestAt);
    if (Number.isFinite(handled)) {
      state.settings.balanceHandledAt = Math.max(
        Number(state.settings.balanceHandledAt) || 0,
        handled
      );
    }
    if (info.pushed) {
      state.settings.balancePushedAt = state.settings.balanceSyncAt;
    }
    if (typeof info.hasKey === "boolean") {
      state.settings.balanceKeyPresent = info.hasKey;
    }
    if (typeof info.sourceUsed === "string" && info.sourceUsed) {
      state.settings.balanceSourceUsed = info.sourceUsed;
    }
    /* 助手把面板里的 Key 存好了：内存里那份立刻丢掉。 */
    if (info.keySaved === true) {
      pendingBalanceKey = "";
      state.settings.balanceKeySaved = true;
      state.settings.balanceKeyPresent = true;
    }
    if (info.keyCleared === true) {
      pendingBalanceKey = "";
      state.settings.balanceKeySaved = false;
      state.settings.balanceKeyPresent = false;
    }
    state.settings.balanceSyncNote = String(info.note || info.error || "");
    scheduleSave();
    render();
    return balanceSyncReport();
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

  /*
   * 响应正文的读取范围（只读这些，别的都不读）：
   *   1. 主机名里带 deepseek 的地址（api.deepseek.com 等）；
   *   2. 路径是 OpenAI 兼容 completions 端点、并且**请求里点名了 deepseek 模型**
   *      的地址——本机中转、自建代理走的就是这个路径，靠请求体里的模型名认归属。
   * 早先还匹配「任何回环地址」和「/responses」，那会把本机其它服务、别的 provider
   * 的响应也读一遍，范围过宽，已经去掉。
   */
  const API_PATH_SUFFIXES = [
    "/chat/completions",
    "/completions",
    "/beta/chat/completions",
  ];
  /* 请求体可能很大（含提示词），只做一次子串判断，不保存任何内容。 */
  const REQUEST_BODY_SCAN_LIMIT = 200_000;

  function splitUrl(value) {
    const text = String(value || "").trim();
    if (!text) return { host: "", path: "" };
    try {
      const parsed = new URL(text, window.location?.href || undefined);
      return {
        host: String(parsed.hostname || "").toLowerCase(),
        path: String(parsed.pathname || "").toLowerCase(),
      };
    } catch (_) {
      /* 相对路径解析不了时按整体字符串判断，够用。 */
      return { host: "", path: text.toLowerCase().split("?")[0] };
    }
  }

  function mentionsDeepSeek(value) {
    if (typeof value !== "string" || !value) return false;
    const text =
      value.length > REQUEST_BODY_SCAN_LIMIT
        ? value.slice(0, REQUEST_BODY_SCAN_LIMIT)
        : value;
    return text.toLowerCase().includes("deepseek");
  }

  function isDeepSeekHost(host) {
    return String(host || "").includes("deepseek");
  }

  /*
   * requestMentionsDeepSeek：这次请求的请求体里有没有点名 deepseek 模型。
   * 非 deepseek 域名（本机中转、自建代理）只有拿到这个 true 才读响应。
   */
  function isLikelyApiUrl(url, requestMentionsDeepSeek = false) {
    const { host, path } = splitUrl(url);
    if (!host && !path) return false;
    if (isDeepSeekHost(host)) return true;
    if (!API_PATH_SUFFIXES.some((suffix) => path.endsWith(suffix))) return false;
    return requestMentionsDeepSeek === true;
  }

  /*
   * WebSocket 侧的归属判断：流式分片通常只有首帧带模型名，所以「首帧认出归属、
   * 这条连接的后续帧继续解析」，末尾那条带 usage 的帧才不会漏掉；
   * 而一条从头到尾没提过 deepseek 的连接，一帧都不碰。
   */
  const deepSeekSockets = new WeakSet();

  function isDeepSeekSocketFrame(socket, text) {
    if (deepSeekSockets.has(socket)) return true;
    if (!mentionsDeepSeek(text)) return false;
    deepSeekSockets.add(socket);
    return true;
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
      const deepSeekRequest = mentionsDeepSeek(init?.body);
      const response = await originalFetch.call(this, input, init);
      if (
        isLikelyApiUrl(url, deepSeekRequest) &&
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
      /* 先算成布尔值，避免把请求体（含提示词）留到回调里。 */
      const deepSeekRequest = mentionsDeepSeek(args[0]);
      this.addEventListener?.("loadend", () => {
        const url = this.__deepseekUsageUrl || "";
        if (!isLikelyApiUrl(url, deepSeekRequest)) return;
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
            if (!isDeepSeekSocketFrame(socket, event.data)) return;
            captureModelFromText(event.data);
            handlePayload(event.data, "websocket");
          } else if (
            event.data instanceof Blob &&
            event.data.size <= 1_000_000
          ) {
            event.data
              .text()
              .then((text) => {
                if (!isDeepSeekSocketFrame(socket, text)) return;
                handlePayload(text, "websocket");
              })
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
        <div class="dsu-balance-card">
          <div class="dsu-card-title">
            <span>账户余额</span>
            <label class="dsu-balance-enable">
              <input type="checkbox" data-field="balanceEnabled"> 启用
            </label>
            <span class="dsu-balance-status" data-field="balanceStatus"></span>
            <button type="button" class="dsu-text-button dsu-balance-toggle" data-action="balance-settings">设置</button>
          </div>
          <div class="dsu-balance-grid">
            <div class="dsu-balance-main">
              <span>当前余额</span>
              <strong data-field="balanceNow">—</strong>
              <small data-field="balanceNowHint">等助手回填</small>
            </div>
            <div><span>今日消耗</span><strong data-field="balanceToday">—</strong><small data-field="balanceTodayHint"></small></div>
            <div><span>昨日消耗</span><strong data-field="balanceYesterday">—</strong><small data-field="balanceYesterdayHint"></small></div>
            <div><span>本月消耗</span><strong data-field="balanceMonth">—</strong><small data-field="balanceMonthHint"></small></div>
          </div>
          <div class="dsu-balance-actions">
            <!--
              这颗按钮在「桥能直连」或「本机助手在跑」时才有意义，两种情况都由 render
              按行内样式决定显隐；不要再挂 data-bridge-only——那条规则带 !important，
              会把助手在跑时的显示意图按死。
            -->
            <button type="button" class="dsu-text-button" data-helper-or-bridge data-action="balance-fetch" style="display: none">刷新余额</button>
          </div>
          <div class="dsu-balance-settings" data-field="balanceSettings" hidden>
            <p class="dsu-balance-sync">
              <span class="dsu-balance-sync-label">余额同步</span>
              <strong data-field="balanceSyncHint">检测中…</strong>
            </p>
            <section class="dsu-balance-group">
              <h4 class="dsu-balance-group-title">本机助手（可选）</h4>
              <p class="dsu-balance-sync">
                <span class="dsu-balance-sync-label">助手状态</span>
                <strong data-field="balanceHelperState">检测中…</strong>
              </p>
              <div class="dsu-balance-key-actions">
                <button type="button" class="dsu-text-button" data-action="helper-run">一键安装（交给 Codex）</button>
                <button type="button" class="dsu-text-button" data-action="helper-install">复制安装命令</button>
                <button type="button" class="dsu-text-button" data-action="helper-uninstall-run">让 Codex 卸载</button>
                <button type="button" class="dsu-text-button" data-action="helper-uninstall">复制卸载命令</button>
                <label class="dsu-inline-pick">
                  <span>命令给哪个系统</span>
                  <select data-field="helperPlatformPick">
                    <option value="auto">自动识别</option>
                    <option value="win">Windows</option>
                    <option value="mac">macOS</option>
                  </select>
                </label>
              </div>
              <p class="dsu-balance-note">点「一键安装」＝让 Codex 在这台电脑上装好助手：缺 Node.js 会自动补，不需要管理员权限。命令按下面的系统选（现在按 <span data-field="helperPlatformLabel">Windows</span>）。Key 不用你管：助手会用 Codex 里已有的那把，面板不保存任何 Key。</p>
            </section>
            <details class="dsu-balance-help">
              <summary>余额是怎么自动更新的？</summary>
              <p class="dsu-balance-note">Codex 页面自己连不了网，余额由「本机助手」在本机查：装一次之后每 5 分钟更新一次，点「刷新余额」立刻补一次。Key 由助手自己找（环境变量 / <code>config.toml</code> / <code>~/.codex/auth.json</code>），面板不接触 Key。</p>
            </details>
            <div class="dsu-balance-footer">
              <button type="button" class="dsu-text-button dsu-danger" data-action="balance-reset">清除余额记录</button>
            </div>
          </div>
          <div class="dsu-balance-table">
            <table>
              <thead><tr><th>日期</th><th class="dsu-num">收盘余额</th><th class="dsu-num">余额消耗</th><th class="dsu-num">费率估算</th></tr></thead>
              <tbody data-field="balanceRows"></tbody>
            </table>
          </div>
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
    const existing = document.getElementById(STYLE_ID);
    /* 样式表跟着版本走：热重载换了脚本，旧样式也要一起换掉。 */
    if (existing && existing.dataset.dsuVersion === VERSION) return;
    const style = existing || document.createElement("style");
    style.id = STYLE_ID;
    style.dataset.dsuVersion = VERSION;
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
      .dsu-balance-card {
        margin: 14px 18px 0; padding: 14px; border-radius: 12px;
        background: #10161f; border: 1px solid #263140;
      }
      .dsu-balance-status { margin-left: auto; color: #64748b; font-size: 10px; }
      .dsu-balance-status[data-tone="warn"] { color: #fbbf24; }
      .dsu-balance-status[data-tone="ok"] { color: #4ade80; }
      .dsu-balance-toggle { margin-left: 8px; padding: 4px 9px; font-size: 11px; }
      .dsu-balance-grid {
        display: grid; grid-template-columns: repeat(auto-fit, minmax(124px, 1fr));
        gap: 10px; margin-top: 12px;
      }
      .dsu-balance-grid > div {
        min-width: 0; padding: 10px 11px; border-radius: 10px;
        background: #0d1320; border: 1px solid #1f2937;
      }
      .dsu-balance-grid span { display: block; color: #94a3b8; font-size: 11px; }
      .dsu-balance-grid strong {
        display: block; margin-top: 6px; font-size: 17px; font-weight: 700;
        font-variant-numeric: tabular-nums; color: #e2e8f0;
      }
      .dsu-balance-grid small { display: block; margin-top: 4px; color: #64748b; font-size: 10px; min-height: 12px; }
      .dsu-balance-main strong { color: #facc15; }
      .dsu-balance-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-top: 12px; }
      .dsu-balance-actions input {
        width: 168px; background: #0f141c; color: #e2e8f0; border: 1px solid #2b3544;
        border-radius: 8px; padding: 6px 8px; font-size: 12px;
      }
      .dsu-balance-settings {
        display: flex; flex-direction: column;
        gap: 14px; margin-top: 14px; padding-top: 14px; border-top: 1px solid #232c38;
      }
      .dsu-balance-settings[hidden] { display: none; }
      /* Codex++ 网络桥只放行 POST 期间：面板直连相关的 UI 先藏起来，实现代码保留。 */
      #${PANEL_ID}[data-dsu-bridge-query="off"] [data-bridge-only] {
        display: none !important;
      }
      .dsu-balance-sync {
        display: flex; align-items: baseline; gap: 8px; margin: 0;
        padding: 7px 10px; border-radius: 8px;
        background: #0d1320; border: 1px solid #1f2937;
        color: #94a3b8; font-size: 11px; line-height: 1.45;
      }
      .dsu-balance-sync-label { flex: none; color: #475569; }
      .dsu-balance-sync strong { font-weight: 500; color: #cbd5e1; }
      .dsu-balance-sync strong[data-tone="ok"] { color: #4ade80; }
      .dsu-balance-sync strong[data-tone="warn"] { color: #fbbf24; }
      .dsu-balance-group { display: flex; flex-direction: column; gap: 10px; }
      .dsu-balance-group-title {
        margin: 0; color: #64748b; font-size: 10px; font-weight: 600;
        letter-spacing: 0.08em;
      }
      .dsu-balance-settings input[type="text"],
      .dsu-balance-settings input[type="password"] {
        width: 100%; min-width: 0; background: #0f141c; color: #e2e8f0;
        border: 1px solid #2b3544; border-radius: 8px; padding: 6px 8px; font-size: 12px;
      }
      .dsu-balance-settings select {
        width: 100%; background: #0f141c; color: #e2e8f0; border: 1px solid #2b3544;
        border-radius: 8px; padding: 6px 8px; font-size: 12px;
      }
      .dsu-balance-note { grid-column: 1 / -1; margin: 0; color: #64748b; font-size: 10px; line-height: 1.6; }
      .dsu-balance-key-actions { display: flex; flex-wrap: wrap; gap: 8px; }
      .dsu-balance-key-actions .dsu-inline-pick {
        display: flex; align-items: center; gap: 6px;
        color: #64748b; font-size: 11px;
      }
      .dsu-balance-key-actions .dsu-inline-pick select {
        width: auto; padding: 4px 6px; font-size: 11px;
      }
      .dsu-balance-enable {
        display: flex; align-items: center; gap: 5px;
        color: #94a3b8; font-size: 11px; cursor: pointer;
      }
      .dsu-balance-enable input { accent-color: #38bdf8; margin: 0; }
      .dsu-balance-help { border-top: 1px dashed #232c38; padding-top: 10px; }
      .dsu-balance-help summary { color: #64748b; font-size: 11px; cursor: pointer; }
      .dsu-balance-help summary:hover { color: #94a3b8; }
      .dsu-balance-help .dsu-balance-note { margin-top: 8px; }
      .dsu-balance-footer { display: flex; justify-content: flex-end; }
      .dsu-balance-card[data-enabled="false"] .dsu-balance-grid { opacity: 0.5; }
      .dsu-balance-table { margin-top: 12px; padding-top: 10px; border-top: 1px solid #232c38; max-height: 236px; overflow: auto; }
      .dsu-balance-table table { width: 100%; border-collapse: collapse; font-size: 11px; }
      .dsu-balance-table th, .dsu-balance-table td { padding: 6px 5px; border-bottom: 1px solid #202a36; text-align: left; }
      .dsu-balance-table th { color: #64748b; font-weight: 500; position: sticky; top: 0; background: #10161f; }
      .dsu-balance-table td { color: #cbd5e1; }
      .dsu-balance-span { color: #fbbf24; }
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
      .dsu-tip-balance { color: #facc15; }
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
    else if (action === "balance-fetch") requestBalanceRefresh();
    else if (action === "balance-settings") toggleBalanceSettings();
    else if (action === "balance-reset") resetBalances();
    else if (action === "helper-install") copyHelperCommand("install");
    else if (action === "helper-uninstall") copyHelperCommand("uninstall");
    else if (action === "helper-run") runHelperFromPanel(false);
    else if (action === "helper-uninstall-run") runHelperFromPanel(true);
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
    const helperPlatformPickBox = panel.querySelector(
      '[data-field="helperPlatformPick"]'
    );
    if (helperPlatformPickBox) {
      helperPlatformPickBox.onchange = () =>
        setHelperPlatformPick(helperPlatformPickBox.value);
    }
    const balanceEnabledBox = panel.querySelector('[data-field="balanceEnabled"]');
    if (balanceEnabledBox) {
      balanceEnabledBox.onchange = () => toggleBalanceEnabled(balanceEnabledBox.checked);
    }
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
    let panelContentReplaced = false;
    if (panel && panel.dataset.dsuVersion !== VERSION) {
      /*
       * Codex++ 热重载会把新脚本注入同一个页面，此时旧脚本的回调仍在跑。
       * 删掉节点再新建会和旧副本来回抢同一个面板，所以这里原地换内容：
       * 节点身份不变，位置和尺寸也就不会丢。
       */
      const probe = document.createElement("div");
      probe.innerHTML = panelShell().trim();
      const fresh = probe.firstElementChild;
      if (fresh) {
        /* 只换内容，可见性沿用节点当前状态，避免换版时把面板藏起来。 */
        panel.className = fresh.className;
        panel.innerHTML = fresh.innerHTML;
      }
      panel.dataset.dsuVersion = VERSION;
      panel.dataset.dsuBridgeQuery = BRIDGE_BALANCE_QUERY_ENABLED ? "on" : "off";
      panelContentReplaced = true;
    }
    if (!panel) {
      const wrapper = document.createElement("div");
      wrapper.innerHTML = panelShell().trim();
      panel = wrapper.firstElementChild;
      panel.dataset.dsuVersion = VERSION;
      panel.dataset.dsuBridgeQuery = BRIDGE_BALANCE_QUERY_ENABLED ? "on" : "off";
      document.body.appendChild(panel);
    }
    /*
     * 桥查询开关决定哪些余额控件露出来。用行内样式而不是只靠 CSS：
     * 热重载时旧的样式表可能还挂着，行内样式不受影响。
     */
    for (const element of panel.querySelectorAll("[data-bridge-only]")) {
      element.style.display = BRIDGE_BALANCE_QUERY_ENABLED ? "" : "none";
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
      balanceRows: panel.querySelector('[data-field="balanceRows"]'),
      balanceSettings: panel.querySelector('[data-field="balanceSettings"]'),
      balanceSyncHint: panel.querySelector('[data-field="balanceSyncHint"]'),
      balanceCard: panel.querySelector(".dsu-balance-card"),
      balanceEnabledBox: panel.querySelector('[data-field="balanceEnabled"]'),
      balanceHelperState: panel.querySelector(
        '[data-field="balanceHelperState"]'
      ),
      helperPlatformLabel: panel.querySelector(
        '[data-field="helperPlatformLabel"]'
      ),
      helperPlatformPick: panel.querySelector(
        '[data-field="helperPlatformPick"]'
      ),
      balanceFetchButton: panel.querySelector('[data-action="balance-fetch"]'),
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
        scheduleFrame(() => clampPanelPosition(panel));
      });
      state.resizeObserver.observe(panel);
    }
    /*
     * 用「本份脚本自己的标记对象」判断有没有绑过，而不是只用版本号：热重载时
     * 新旧两份版本号可能相同（或旧那份先绑了），只比版本号会让接管面板的那份
     * 跳过绑定，按钮就留在已经退休的那份身上 —— 看起来就是「按钮全失效」。
     */
    if (panel.__deepseekUsageBindTag === instance.bindTag) return;
    panel.__deepseekUsageBindTag = instance.bindTag;
    bindPanelControls(panel);
    /*
     * 接管别人留下的面板时，旧内容已经换成新内容但还没渲染过，面板又是开着的：
     * 立刻画一次，否则要等用户点一下才显示数字。
     */
    if (panelContentReplaced && !panel.hidden) render();
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

  /*
   * 页面上真正活着的那个面板节点，才是唯一该画的。热重载期间别的副本可能已经
   * 换过一次内容甚至换过节点，这里的 state.ui 如果还指着老的，按钮和数字就全
   * 停在原地 —— 表现就是「按键全失效」。每次渲染前对一下，对不上就重挂引用。
   */
  function livePanelNode() {
    const live = document.getElementById(PANEL_ID);
    if (!live) return null;
    if (
      !state.ui ||
      state.ui.panel !== live ||
      live.__deepseekUsageBindTag !== instance.bindTag
    ) {
      ensurePanel();
    }
    return document.getElementById(PANEL_ID);
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
    scheduleFrame(() => scheduleFrame(run));
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
    if (panel.__deepseekDragTag === instance.bindTag) return;
    panel.__deepseekDragTag = instance.bindTag;

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
      current.frame = scheduleFrame(() => {
          if (state.dragState) state.dragState.frame = 0;
          applyMove();
        });
      };

      const finish = () => {
        const current = state.dragState;
        if (!current) return;
      if (current.frame) cancelFrame(current.frame);
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
    if (panel.__deepseekResizeTag === instance.bindTag) return;
    panel.__deepseekResizeTag = instance.bindTag;
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
      current.frame = scheduleFrame(() => {
          if (state.resizeState) state.resizeState.frame = 0;
          applyResize();
        });
      };

      const finish = () => {
        const current = state.resizeState;
        if (!current) return;
      if (current.frame) cancelFrame(current.frame);
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
    /*
     * 每次 Codex 启动（= 这份脚本被注入一次）后的第一次打开，先给完整窗口，
     * 不要沿用上次收起来的 mini 条；之后用户自己收起来的话，再打开就听他的。
     */
    if (!openedThisRun) {
      openedThisRun = true;
      state.settings.panelMinimized = false;
      applyPanelMinimized();
      applyPanelSize();
      if (state.settings.hasOpened !== true) state.settings.hasOpened = true;
      scheduleSave();
    }
    state.ui.panel.hidden = false;
    const button = document.getElementById(SIDEBAR_BUTTON_ID);
    button?.setAttribute("data-active", "true");
    render({ animate: true });
    clampPanelPosition();
    schedulePanelClamp();
    refreshBalanceOnOpen();
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

  function toggleBalanceSettings() {
    state.settings.balanceSettingsOpen = !state.settings.balanceSettingsOpen;
    scheduleSave();
    render();
  }

  /*
   * 用户填的 Key：默认只留在页面内存，面板拿着它自己查余额；勾了「记住」
   * 才写本机 localStorage（脚本本身永远不含任何 Key）。同时登记一个请求，
   * 本机如果装了助手，它会顺手把 Key 用 DPAPI 再存一份。
   */
  function rememberBalanceKey(value, { announce = true } = {}) {
    const key = String(value ?? "").trim();
    if (!looksLikeKey(key)) {
      if (announce) setBalanceStatus("Key 看着不对（应以 sk- 开头）", "warn");
      return false;
    }
    panelBalanceKey = key;
    pendingBalanceKey = key;
    state.settings.balanceKeyRequestAt = Date.now();
    state.settings.balanceRequestAt = state.settings.balanceKeyRequestAt;
    state.settings.balanceSource = "key";
    state.settings.balanceKeyMode = "manual";
    state.settings.balanceKeyPresent = true;
    writeBalanceStoredKey(state.settings.balanceKeyRemember ? key : "");
    scheduleSave();
    render();
    if (announce) {
      const scope = state.settings.balanceKeyRemember
        ? `已记在本机（${maskKeyTail(key)}）`
        : `只在本次运行有效（${maskKeyTail(key)}）`;
      setBalanceStatus(
        BRIDGE_BALANCE_QUERY_ENABLED
          ? `Key ${scope}，正在查询余额…`
          : `Key ${scope}；自动查询等 Codex++ 放开 GET 后就会用它`,
        "ok"
      );
    }
    queryBalanceNow({ silent: true });
    return true;
  }


  function clearSavedBalanceKey() {
    panelBalanceKey = "";
    balanceConfigKey = "";
    pendingBalanceKey = "";
    writeBalanceStoredKey("");
    state.settings.balanceKeyClearAt = Date.now();
    state.settings.balanceKeySaved = false;
    state.settings.balanceKeyPresent = null;
    state.settings.balanceKeyFromConfig = false;
    state.settings.balanceQueryOk = null;
    state.settings.balanceQueryAt = 0;
    state.settings.balanceQueryNote = "";
    scheduleSave();
    render();
    setBalanceStatus("Key 已清除（已有的余额记录不受影响）", "ok");
  }

  function setBalanceKeyMode(value) {
    const mode = value === "manual" ? "manual" : "auto";
    state.settings.balanceKeyMode = mode;
    scheduleSave();
    render();
    if (mode === "auto") {
      setBalanceStatus("已切到自动：先读 Codex 配置里的 Key", "ok");
      useCodexConfigKey();
    } else {
      setBalanceStatus("已切到手动：用下面填的 Key", "ok");
    }
  }

  function setBalanceKeyRemember(remember) {
    state.settings.balanceKeyRemember = remember === true;
    const key = panelBalanceKey || balanceKeyInfo().key;
    writeBalanceStoredKey(state.settings.balanceKeyRemember ? key : "");
    scheduleSave();
    render();
    setBalanceStatus(
      state.settings.balanceKeyRemember
        ? "Key 会记在这台机器上（存在面板自己的本机存储里）"
        : "Key 不会写入本机存储，重开 Codex 需要重新填",
      "ok"
    );
  }

  function setBalanceSource(value) {
    state.settings.balanceSource =
      value === "proxy" || value === "key" ? value : "auto";
    state.settings.balanceRequestAt = Date.now();
    scheduleSave();
    render();
    setBalanceStatus(`余额来源已切到「${balanceReadSourceLabelForChoice()}」`, "ok");
  }

  function balanceReadSourceLabelForChoice() {
    const choice = balanceSourceChoice();
    if (choice === "proxy") return "本机代理";
    if (choice === "key") return "我填的 API Key";
    return "自动";
  }

  function toggleBalanceEnabled(enabled) {
    state.settings.balanceEnabled = enabled !== false;
    scheduleSave();
    render();
    setBalanceStatus(
      state.settings.balanceEnabled ? "余额统计已启用" : "余额统计已关闭",
      "ok"
    );
  }

  function resetBalances() {
    if (!window.confirm("确定清除全部余额记录吗？用量统计不受影响。")) return;
    state.balances = [];
    balanceCache = null;
    scheduleSave();
    render();
    setBalanceStatus("余额记录已清除", "ok");
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
    const month = state.settings.month;
    const balanceItem =
      state.settings.mode === "month"
        ? balanceDayItem(`${month}-${String(data.label).padStart(2, "0")}`)
        : null;
    if (!count(data.calls) && !total && !balanceItem) {
      hideChartTooltip();
      return;
    }
    tooltip.innerHTML =
      `<div class="dsu-tip-title">${escapeHtml(chartNodeLabel(data))}</div>` +
      (count(data.calls) || total
        ? `<div class="dsu-tip-row"><span>请求</span><b>${count(data.calls)} 次</b></div>` +
          `<div class="dsu-tip-row"><span>缓存命中</span><b>${formatTokens(data.hit)}</b></div>` +
          `<div class="dsu-tip-row"><span>缓存未命中</span><b>${formatTokens(data.miss)}</b></div>` +
          `<div class="dsu-tip-row"><span>输出</span><b>${formatTokens(data.output)}</b></div>` +
          `<div class="dsu-tip-row"><span>总 tokens</span><b>${formatTokens(total)}</b></div>` +
          `<div class="dsu-tip-row dsu-tip-cost"><span>费用</span><b>${formatCost(data.cost)}</b></div>`
        : '<div class="dsu-tip-row"><span>调用</span><b>无</b></div>') +
      (balanceItem
        ? `<div class="dsu-tip-row dsu-tip-balance"><span>收盘余额</span><b>${formatBalance(balanceItem.close, balanceItem.last.c)}</b></div>` +
          (balanceItem.spend === null
            ? ""
            : `<div class="dsu-tip-row dsu-tip-balance"><span>余额消耗</span><b>${formatBalanceSpend(balanceItem.spend, balanceItem.last.c)}</b></div>`)
        : "");
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
    if (!ownsPanel()) {
      retirePanel();
      return;
    }
    if (state.renderTimer) return;
    state.renderTimer = scheduleFrame(() => {
      state.renderTimer = 0;
      if (!ownsPanel()) {
        retirePanel();
        return;
      }
      const live = livePanelNode();
      if (!live || !state.ui?.panel || state.ui.panel.hidden || live.hidden) {
        return;
      }
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

      const currency = state.settings.balanceCurrency || "CNY";
      const latest = latestBalance();
      const balanceDayItems = balanceDayList();
      const todayItem =
        balanceDayItems.find((item) => item.day === todayKey()) || null;
      const yesterdayItem =
        balanceDayItems.find(
          (item) => item.day === todayKey(Date.now() - 86400000)
        ) || null;
      const monthInfo = balanceMonthSpend(
        state.settings.month,
        balanceDayItems
      );

      setText("balanceNow", latest ? formatBalance(latest.v, latest.c) : "—");
      setText(
        "balanceNowHint",
        latest
          ? `${formatDateTime(latest.t)} · ${balanceSourceLabel(latest.s)}`
          : !balanceEnabled()
            ? "余额功能已关闭（勾选上面的「启用」即可打开）"
            : balanceSyncText()
      );
      setText(
        "balanceToday",
        todayItem && todayItem.spend !== null
          ? formatBalanceSpend(todayItem.spend, todayItem.last.c)
          : todayItem && todayItem.count > 1
            ? formatBalanceSpend(todayItem.spendFromFirst, todayItem.last.c)
            : "—"
      );
      setText(
        "balanceTodayHint",
        todayItem
          ? todayItem.spend === null
            ? todayItem.count > 1
              ? "自今日首次记录起"
              : "需要跨天的两次快照"
            : `快照 ${todayItem.count} 次`
          : "今日暂无快照"
      );
      setText(
        "balanceYesterday",
        yesterdayItem && yesterdayItem.spend !== null
          ? formatBalanceSpend(yesterdayItem.spend, yesterdayItem.last.c)
          : "—"
      );
      setText(
        "balanceYesterdayHint",
        yesterdayItem
          ? `收盘 ${formatBalance(yesterdayItem.close, yesterdayItem.last.c)}`
          : "昨日无快照"
      );
      setText(
        "balanceMonth",
        monthInfo ? formatBalanceSpend(monthInfo.spend, currency) : "—"
      );
      setText(
        "balanceMonthHint",
        monthInfo ? `自 ${monthInfo.from} 起` : "本月暂无余额"
      );

      if (state.ui.balanceSyncHint) {
        const hint = balanceSyncText();
        state.ui.balanceSyncHint.textContent = hint;
        const healthy =
          state.settings.balanceQueryOk === true ||
          (state.settings.balanceQueryOk === null && balanceHelperAlive());
        state.ui.balanceSyncHint.dataset.tone = healthy ? "ok" : "warn";
      }
      if (state.ui.balanceSettings) {
        state.ui.balanceSettings.hidden = !state.settings.balanceSettingsOpen;
      }
      if (state.ui.balanceEnabledBox) {
        state.ui.balanceEnabledBox.checked = balanceEnabled();
      }
      if (state.ui.balanceHelperState) {
        const alive = balanceHelperAlive();
        state.ui.balanceHelperState.textContent = alive
          ? `运行中 · ${formatAgo(balanceSyncAge())}同步`
          : "未检测到（自动更新余额要靠它）";
        state.ui.balanceHelperState.dataset.tone = alive ? "ok" : "warn";
      }
      if (state.ui.helperPlatformLabel) {
        state.ui.helperPlatformLabel.textContent = helperPlatformLabel();
      }
      if (state.ui.helperPlatformPick) {
        const picked = helperPlatformPick();
        if (state.ui.helperPlatformPick.value !== picked) {
          state.ui.helperPlatformPick.value = picked;
        }
      }
      /*
       * 「刷新余额」在桥不可用时本来是藏着的；装了本机助手之后它有意义了
       * （请助手立刻重读一次），所以只要助手在跑就重新露出来。
       */
      if (state.ui.balanceFetchButton) {
        state.ui.balanceFetchButton.style.display =
          BRIDGE_BALANCE_QUERY_ENABLED || balanceHelperAlive() ? "" : "none";
      }
      if (state.ui.balanceCard) {
        state.ui.balanceCard.dataset.enabled = balanceEnabled()
          ? "true"
          : "false";
      }
      paintBalanceStatus();

      const dayCost = new Map();
      for (const record of state.records) {
        dayCost.set(
          record.d,
          (dayCost.get(record.d) || 0) + Number(record.cost || 0)
        );
      }
      const balanceDays = balanceDayItems.slice(-BALANCE_BAR_DAYS).reverse();
      if (state.ui.balanceRows) {
        state.ui.balanceRows.innerHTML = balanceDays.length
          ? balanceDays
              .map((item) => {
                const estimated = dayCost.get(item.day) || 0;
                const spend =
                  item.spend === null
                    ? item.count > 1
                      ? formatBalanceSpend(item.spendFromFirst, item.last.c) +
                        ' <span class="dsu-balance-span">(当日)</span>'
                      : '<span class="dsu-balance-span">基线</span>'
                    : formatBalanceSpend(item.spend, item.last.c) +
                      (item.spanDays > 1
                        ? ` <span class="dsu-balance-span">(${item.spanDays}天)</span>`
                        : "");
                return (
                  `<tr><td>${escapeHtml(item.day.slice(5))}</td>` +
                  `<td class="dsu-num">${formatBalance(item.close, item.last.c)}</td>` +
                  `<td class="dsu-num">${spend}</td>` +
                  `<td class="dsu-num">${estimated ? formatCost(estimated) : "—"}</td></tr>`
                );
              })
              .join("")
          : '<tr><td colspan="4" class="dsu-empty-row">还没有余额记录</td></tr>';
      }

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

  /*
   * 图表细节辅助：圆角柱、平滑曲线、圆角数值小标——只负责画，不碰数据。
   */
  function chartRoundRect(context, x, y, width, height, radius, bottomRadius) {
    const top = Math.max(0, Math.min(radius, width / 2, height));
    const bottom = Math.max(
      0,
      Math.min(
        bottomRadius === undefined ? radius : bottomRadius,
        width / 2,
        height - top
      )
    );
    context.beginPath();
    context.moveTo(x, y + height - bottom);
    context.arcTo(x, y + height, x + bottom, y + height, bottom);
    context.lineTo(x + width - bottom, y + height);
    context.arcTo(x + width, y + height, x + width, y + height - bottom, bottom);
    context.lineTo(x + width, y + top);
    context.arcTo(x + width, y, x + width - top, y, top);
    context.lineTo(x + top, y);
    context.arcTo(x, y, x, y + top, top);
    context.closePath();
  }

  function chartSmoothPath(context, points) {
    context.moveTo(points[0].x, points[0].y);
    for (let index = 0; index < points.length - 1; index += 1) {
      const current = points[index];
      const next = points[index + 1];
      const middle = (current.x + next.x) / 2;
      context.bezierCurveTo(middle, current.y, middle, next.y, next.x, next.y);
    }
  }

  function chartPill(context, x, y, text, background, color, align, limit) {
    context.font = "bold 10px Segoe UI, sans-serif";
    const pillWidth = context.measureText(text).width + 14;
    let left =
      align === "right"
        ? x - pillWidth
        : align === "center"
          ? x - pillWidth / 2
          : x;
    if (Number.isFinite(limit)) left = Math.min(left, limit - pillWidth);
    left = Math.max(4, left);
    chartRoundRect(context, left, y, pillWidth, 15, 7);
    context.fillStyle = background;
    context.fill();
    context.fillStyle = color;
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(text, left + pillWidth / 2, y + 7.6);
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
    const barWidth = Math.max(5, Math.min(26, step * 0.68));
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
      const values = [
        [item.hit, colors.hit],
        [item.miss, colors.miss],
        [item.output, colors.output],
      ];
      const barTotal = item.hit + item.miss + item.output;
      if (barTotal > 0) {
        /*
         * 圆角画在整根柱子上：先用圆角矩形当裁剪区，再在里面堆命中/未命中/输出。
         * 只磨圆顶端两角、柱脚保持直角，这样顶部圆角不会被细小分段盖没。
         */
        const barHeight = (chartHeight * barTotal) / maxTokens;
        const barTop = padding.top + chartHeight - barHeight;
        const barRadius = Math.min(5, barWidth * 0.3);
        context.save();
        chartRoundRect(
          context,
          x - barWidth / 2,
          barTop,
          barWidth,
          barHeight,
          barRadius,
          0
        );
        context.clip();
        let y = padding.top + chartHeight;
        values.forEach(([value, color], segmentIndex) => {
          const segmentHeight = (chartHeight * value) / maxTokens;
          if (segmentHeight <= 0) return;
          y -= segmentHeight;
          if (segmentIndex === 0) {
            const barGradient = context.createLinearGradient(0, y, 0, y + segmentHeight);
            barGradient.addColorStop(0, "#4cc3fb");
            barGradient.addColorStop(1, "#2b8fc9");
            context.fillStyle = barGradient;
          } else {
            context.fillStyle = color;
          }
          context.fillRect(x - barWidth / 2, y, barWidth, segmentHeight);
        });
        context.restore();
      }
      if (index % labelEvery === 0 || index === buckets.length - 1) {
        context.fillStyle = colors.text;
        context.textAlign = "center";
        context.textBaseline = "top";
        context.fillText(item.label, x, padding.top + chartHeight + 8);
      }
    });

    const costPoints = buckets.map((item, index) => ({
      x: padding.left + index * step + step / 2,
      y: padding.top + chartHeight - (chartHeight * item.cost) / maxCost,
    }));
    const costGradient = context.createLinearGradient(
      0,
      padding.top,
      0,
      padding.top + chartHeight
    );
    costGradient.addColorStop(0, "rgba(250, 204, 21, 0.14)");
    costGradient.addColorStop(1, "rgba(250, 204, 21, 0)");
    context.beginPath();
    chartSmoothPath(context, costPoints);
    context.lineTo(costPoints[costPoints.length - 1].x, padding.top + chartHeight);
    context.lineTo(costPoints[0].x, padding.top + chartHeight);
    context.closePath();
    context.fillStyle = costGradient;
    context.fill();
    context.beginPath();
    chartSmoothPath(context, costPoints);
    context.strokeStyle = colors.cost;
    context.lineWidth = 1.8;
    context.stroke();
    buckets.forEach((item, index) => {
      if (item.cost <= 0) return;
      const point = costPoints[index];
      context.beginPath();
      context.arc(point.x, point.y, 2.6, 0, Math.PI * 2);
      context.fillStyle = colors.cost;
      context.fill();
      context.beginPath();
      context.arc(point.x, point.y, 2.6, 0, Math.PI * 2);
      context.strokeStyle = "#10161f";
      context.lineWidth = 1;
      context.stroke();
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
    /* 峰值自动标注：最高的一柱写总量，费用最高的那点写金额，省得每次去悬停。 */
    let peakIndex = 0;
    let costPeakIndex = 0;
    buckets.forEach((item, index) => {
      const total = item.hit + item.miss + item.output;
      const peakItem = buckets[peakIndex];
      if (total > peakItem.hit + peakItem.miss + peakItem.output) peakIndex = index;
      if (item.cost > buckets[costPeakIndex].cost) costPeakIndex = index;
    });
    const peakItem = buckets[peakIndex];
    const peakTotal = peakItem.hit + peakItem.miss + peakItem.output;
    if (peakTotal > 0) {
      const peakX = padding.left + peakIndex * step + step / 2;
      const peakY = padding.top + chartHeight - (chartHeight * peakTotal) / maxTokens;
      chartPill(
        context,
        Math.max(padding.left + 10, Math.min(peakX, width - 10)),
        Math.max(4, peakY - 21),
        formatTokens(peakTotal),
        "#1c2735",
        "#e8eaed",
        "center",
        width - 4
      );
    }
    const costPeak = buckets[costPeakIndex];
    if (costPeak.cost > 0) {
      const point = costPoints[costPeakIndex];
      chartPill(
        context,
        point.x + 14,
        Math.max(4, point.y - 5),
        formatCost(costPeak.cost),
        "#2a2410",
        colors.cost,
        "left",
        width - 4
      );
    }
  }

  function scheduleEnsure() {
    if (!ownsPanel()) {
      retirePanel();
      return;
    }
    if (state.ensureTimer) return;
    state.ensureTimer = scheduleFrame(() => {
      state.ensureTimer = 0;
      if (!ownsPanel()) {
        retirePanel();
        return;
      }
      ensureLauncher();
      ensurePanel();
    });
  }

  function start() {
    installStyles();
    scheduleEnsure();
    state.observer = new MutationObserver(scheduleEnsure);
    state.observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
    });
    updateLauncherBadge();
    /*
     * 余额由面板自己查：启动时如果已经有 Key（本机记住的 / Codex 配置里的），
     * 静默补一次，之后每 15 分钟一次。没有 Key 就先从 Codex 配置里读一个，
     * 全程不弹提示，也不要求装任何助手。
     */
    scheduleBalanceAutoQuery();
    window.setTimeout(() => refreshBalanceOnOpen(), 1500);
  }

  loadState();
  installCapture();
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }

  instance.api = {
    version: VERSION,
    /* 诊断用：被更新的版本接管后，旧实例会把这个变成 true 并停止动面板。 */
    retired: () => instance.retired,
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
    getBalances: () => JSON.parse(JSON.stringify(state.balances)),
    importBalanceSnapshots: (entries) => importBalanceSnapshots(entries),
    recordBalance: (value, source = "external", options = {}) =>
      recordBalance(value, {
        source,
        currency:
          options?.currency ||
          state.settings.balanceCurrency ||
          "CNY",
        timestamp: Number(options?.timestamp) || Date.now(),
      }),
    /* 本机助手用这两个接口做心跳和推送确认。 */
    getBalanceSync: () => balanceSyncReport(),
    ackBalanceSync: (report) => applyBalanceSync(report),
    requestBalanceRefresh: (options) => requestBalanceRefresh(options),
    /* 兼容旧名字：面板不联网，只登记刷新请求。 */
    fetchBalance: (options) => requestBalanceRefresh(options),
    /*
     * 给外面（助手 / 自动化）用：setBalanceKey 把 Key 放进面板内存等助手取走，
     * takeBalanceKey 取走后就地清空，面板内存里也不再留。
     */
    setBalanceKey: (key) => rememberBalanceKey(key),
    takeBalanceKey: () => {
      const key = pendingBalanceKey;
      pendingBalanceKey = "";
      return key;
    },
    clearBalanceKey: () => clearSavedBalanceKey(),
    /* 面板自己查余额用的入口，页面上/自动化都能调。 */
    queryBalance: (options) => queryBalanceNow(options || {}),
    useCodexConfigKey: (options) => useCodexConfigKey(options || {}),
    getBalanceKeyState: () => {
      const info = balanceKeyInfo();
      return {
        hasKey: Boolean(info.key),
        label: info.label,
        tail: info.key ? maskKeyTail(info.key) : "",
        mode: state.settings.balanceKeyMode === "manual" ? "manual" : "auto",
        remember: state.settings.balanceKeyRemember === true,
        bridge: balanceBridgeReady(),
      };
    },
    setBalanceKeyMode: (value) => setBalanceKeyMode(value),
    setBalanceEnabled: (enabled) => toggleBalanceEnabled(enabled),
    setBalanceSource: (value) => setBalanceSource(value),
  };
  /* 登记之后，旧版本脚本下次动手时就会发现自己已经不是主人了。 */
  window[PANEL_API] = instance.api;
})();

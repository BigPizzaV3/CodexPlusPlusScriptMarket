// ==UserScript==
// @name         Codex Live Token Cost
// @namespace    codex-plus-plus
// @version      0.8.1
// @description  在 Codex 输入框上方显示 Token 与金额；ChatGPT 登录时可用本地统计覆盖官方个人资料页；通过设置按钮管理价格和资料。
// @match        app://-/*
// @run-at       document-start
// ==/UserScript==

(() => {
  "use strict";

const VERSION = "0.8.1";
  // ---------------------------------------------------------------------------
  // 模块地图（按文件出现顺序；行号会漂移，这里只给入口符号，搜索符号名即可跳转）
  //
  //   01 常量与配置              → ROOT_ID / USAGE_*_SCHEMA_VERSION / *_KEY
  //   02 通用原语 UTIL           → UTIL.toCount / UTIL.normalizeText / UTIL.loadJson
  //   03 内置打包依赖            → installBundledFlatpickr / installBundledFzstd
  //   04 生命周期注册器          → trackTimer / trackObserver / trackListener / disposers
  //   05 内存状态                → state（唯一可变状态树）
  //   06 格式化（保留裸名）      → fmtCount / fmtMoney / escapeHtml / localDateKey
  //   07 价格覆盖表缓存          → priceOverrides / invalidatePriceOverridesCache
  //   08 逐响应事实层            → usageFactNormalize / usageFactPersistResponses
  //   09 主机冷备 + 导出/导入    → usageFactBackupToHost / usageFactDownloadExport
  //   10 事实 → turn 投影        → usageFactTurnsFromFacts / usageFactHydrateLedger
  //   11 上游价格文件缓存        → priceCacheLoad / refreshDefaultPrices
  //   12 定价与成本              → priceFor / costForModelUsage / storedTurnCost
  //   13 账本合并与归档          → mergeProfileLedgerTurns / localUsageArchiveTurnsForAnalytics
  //   14 会话标识与运行时绑定    → extractSessionIdentity / resolveRuntimeSessionBinding
  //   15 会话识别 + profile 伪装 → requestUrl / isProfileUsageUrl
  //   16 运行时观测              → observeModelInfo / startTurnShimmer / todayUsage
  //   17 composer 运行态与采集   → composerActionButtons / officialComposerRunState
  //   18 使用统计聚合            → aggregateUsageAnalytics / buildAnalyticsRollup
  //   19 会话汇总与快照          → liveSnapshot / localDailyUsage / turnListCost
  //   20 profile 请求补丁        → patchProfileRequestClient / installProfileMessageIntercept
  //   21 设置页与嵌入式页面      → findComposerBox / renderEmbeddedSettingsPage
  //   22 样式表                  → ensureStyle（全部 .cltc-* 样式）
  //   23 UI 渲染与设置面板       → ensureRoot / render / handleSettingsClick / *Html()
  //   24 启动与销毁              → start / scheduleStart / destroy
  //
  // 约定：新增顶层成员前先定位它属于哪个模块；跨模块调用一律写模块名（UTIL.xxx）或
  // 具名函数的完整名字，不要用「子串能碰巧匹配」的缩写。
  // ---------------------------------------------------------------------------
  // 模块 01：常量与配置
  // 全部魔法数字、localStorage 键、上游 URL、schema 版本集中在这里。
  // 改动 schema 版本必须同时升 USAGE_SYNC_FILE_STAMPS_KEY（见 WORKSPACE_CONTEXT.md 约定）。
  // ---------------------------------------------------------------------------
  const ROOT_ID = "codex-live-token-cost";
  const STYLE_ID = "codex-live-token-cost-style";
  const FLATPICKR_STYLE_ID = "codex-live-token-cost-flatpickr-style";
  // Matches Codex++'s own rail icons: 24 viewBox, 1.8 stroke, currentColor, 19px rendered by CSS.
  const SETTINGS_BUTTON_ICON =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' +
    '<path d="M12 17V7"></path>' +
    '<path d="M16 8h-6a2 2 0 0 0 0 4h4a2 2 0 0 1 0 4H8"></path>' +
    '<path d="M4 3a1 1 0 0 1 1-1 1.3 1.3 0 0 1 .7.2l.933.6a1.3 1.3 0 0 0 1.4 0l.934-.6a1.3 1.3 0 0 1 1.4 0l.933.6a1.3 1.3 0 0 0 1.4 0l.933-.6a1.3 1.3 0 0 1 1.4 0l.934.6a1.3 1.3 0 0 0 1.4 0l.933-.6A1.3 1.3 0 0 1 19 2a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1 1.3 1.3 0 0 1-.7-.2l-.933-.6a1.3 1.3 0 0 0-1.4 0l-.934.6a1.3 1.3 0 0 1-1.4 0l-.933-.6a1.3 1.3 0 0 0-1.4 0l-.933.6a1.3 1.3 0 0 1-1.4 0l-.934-.6a1.3 1.3 0 0 0-1.4 0l-.933.6a1.3 1.3 0 0 1-.7.2 1 1 0 0 1-1-1z"></path>' +
    "</svg>";
  const NAV_ICON_USAGE =
    '<svg class="cltc-nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' +
    '<path d="M4 19V5"></path><path d="M4 19h16"></path><path d="M8 16v-5"></path><path d="M12 16V8"></path><path d="M16 16v-3"></path>' +
    "</svg>";
  const NAV_ICON_PROFILE =
    '<svg class="cltc-nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' +
    '<circle cx="12" cy="8" r="3.5"></circle><path d="M5 20c.9-3.4 3.5-5.2 7-5.2s6.1 1.8 7 5.2"></path>' +
    "</svg>";
  const NAV_ICON_GENERAL =
    '<svg class="cltc-nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' +
    '<path d="M4 7h7"></path><path d="M15 7h5"></path><circle cx="13" cy="7" r="2"></circle><path d="M4 17h5"></path><path d="M13 17h7"></path><circle cx="11" cy="17" r="2"></circle>' +
    "</svg>";
  const NAV_ICON_PRICING =
    '<svg class="cltc-nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' +
    '<path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H12l8 8-8 8-8-8z"></path><circle cx="8.5" cy="8.5" r="1.2"></circle>' +
    "</svg>";
  const OFFICIAL_MODEL_TRIGGER_SELECTOR = "[data-codex-intelligence-trigger='true']";
  const PRICE_OVERRIDES_KEY = "__codexLiveTokenCostPriceOverridesV1";
  const HIDDEN_PRICE_MODELS_KEY = "__codexLiveTokenCostHiddenPriceModelsV1";
  const PRICE_MIGRATION_KEY = "__codexLiveTokenCostPriceMigrationV1";
  const PRICE_MIGRATION_VERSION = "official-prices-2026-07-31-v4";
  const PRICE_REMOTE_URL = "https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json";
  // 官方定价页（https://developers.openai.com/api/docs/pricing）在售的 gpt 对话模型：
  // 只用于「模型价格」默认列表；价格仍来自 LiteLLM。未被列出的新模型在使用后仍会出现。
  const OFFICIAL_PRICE_MODELS = new Set([
    "gpt-3.5-turbo",
    "gpt-3.5-turbo-0125",
    "gpt-4-0613",
    "gpt-4-turbo-2024-04-09",
    "gpt-4.1",
    "gpt-4.1-2025-04-14",
    "gpt-4.1-mini",
    "gpt-4.1-mini-2025-04-14",
    "gpt-4.1-nano",
    "gpt-4.1-nano-2025-04-14",
    "gpt-4o",
    "gpt-4o-2024-05-13",
    "gpt-4o-2024-08-06",
    "gpt-4o-mini",
    "gpt-4o-mini-2024-07-18",
    "gpt-5",
    "gpt-5-mini",
    "gpt-5-nano",
    "gpt-5-pro",
    "gpt-5-search-api",
    "gpt-5.1",
    "gpt-5.2",
    "gpt-5.2-pro",
    "gpt-5.3-codex",
    "gpt-5.4",
    "gpt-5.4-mini",
    "gpt-5.4-nano",
    "gpt-5.4-pro",
    "gpt-5.5",
    "gpt-5.5-cyber",
    "gpt-5.5-pro",
    "gpt-5.6-cyber",
    "gpt-5.6-luna",
    "gpt-5.6-sol",
    "gpt-5.6-terra",
    "gpt-6-astra",
    "gpt-6-luna",
    "gpt-6-sol",
    "gpt-6.1-sol",
    "gpt-audio",
    "gpt-audio-1.5",
    "gpt-audio-mini",
    "gpt-rosalind-discovery",
    "gpt-rosalind-research",
  ]);
  const PRICE_SYNC_SOURCE_LABEL = "LiteLLM";
  const PRICE_REMOTE_CACHE_KEY = "__codexLiveTokenCostRemotePricesV2";
  const PRICE_REMOTE_LEGACY_CACHE_KEY = "__codexLiveTokenCostRemotePricesV1";
  const PRICE_SYNC_MIN_INTERVAL_MS = 10 * 60 * 1000;
  const PRICE_SYNC_RETRY_DELAY_MS = 15 * 1000;
  const PRICE_SYNC_MIN_MODELS = 3;
  const PRICE_SYNC_MAX_MODELS = 2000;
  // 「模型价格」默认只展示 gpt 对话/推理模型（chat/responses），其余模型使用过后才出现。
  const PRICE_DISPLAY_MODES = ["chat", "responses"];
  const UPDATE_REMOTE_URL = "https://raw.githubusercontent.com/Tianzora/codex-token-cost/main/scripts/codex-live-token-cost.js";
  const UPDATE_REPO_URL = "https://github.com/Tianzora/codex-token-cost";
  const UPDATE_AUTO_CHECK_DELAY_MS = 4000;
  const UPDATE_COMMAND_TIMEOUT_MS = 135000;
  const UPDATE_STATUS_RESET_MS = 4000;
  const UPDATE_MIN_SOURCE_LENGTH = 100000;
  const UPDATE_CHECK_RANGE_BYTES = 8191;
  const DAILY_USAGE_KEY = "__codexLiveTokenCostDailyUsageV1";
  const LOCAL_USAGE_KEY = "__codexLiveTokenCostLocalUsageV1";
  const ANALYTICS_ROLLUP_KEY = "__codexLiveTokenCostAnalyticsRollupV1";
  const ANALYTICS_MAX_DAYS = 365;
  const RUNTIME_SESSION_BINDING_TTL_MS = 5 * 60 * 1000;
  const OFFICIAL_RUNTIME_STATE_TTL_MS = 10 * 60 * 1000;
  const PROFILE_PREFS_KEY = "__codexLiveTokenCostProfilePrefsV1";
  const PROFILE_OVERRIDES_KEY = "__codexLiveTokenCostProfileOverridesV1";
  const PROFILE_DEFAULTS_KEY = "__codexLiveTokenCostProfileDefaultsV1";
  const HUB_VISIBLE_KEY = "__codexLiveTokenCostHubVisibleV1";
  const OUTPUT_RATE_VISIBLE_KEY = "__codexLiveTokenCostOutputRateVisibleV1";
  const PROFILE_UNLOCK_ENABLED_KEY = "__codexLiveTokenCostProfileUnlockEnabledV1";
  const PROFILE_LEDGER_DB_NAME = "codex-live-token-cost-profile";
  // v3 把主账本事实表并入同一个库：responses / rateLimits / officialSnapshots / meta。
  // 主账本只有一套事实源（这个库），localStorage 只剩偏好、快照和迁移源。
  const PROFILE_LEDGER_DB_VERSION = 3;
  const PROFILE_LEDGER_SNAPSHOT_KEY = "__codexLiveTokenCostProfileLedgerV2";
  const PROFILE_LEDGER_VERSION = 2;
  const PROFILE_LEDGER_STORE_TURNS = "profileTurns";
  const PROFILE_LEDGER_STORE_USAGE_CALLS = "profileUsageCalls";
  const PROFILE_LEDGER_STORE_INVOCATIONS = "profileInvocations";
  const PROFILE_LEDGER_STORE_DAILY_ROLLUPS = "profileDailyRollups";
  const PROFILE_LEDGER_STORE_RESPONSES = "profileResponses";
  const PROFILE_LEDGER_STORE_RATE_LIMITS = "profileRateLimits";
  const PROFILE_LEDGER_STORE_OFFICIAL_SNAPSHOTS = "profileOfficialSnapshots";
  const PROFILE_LEDGER_STORE_META = "profileMeta";
  // v3：逐响应事实开始保存 model / effort。旧事实（v2）归一化后 model 为空，
  // 下一次同步会用 rollout 里的真实模型回填，不再永久显示「未知」。
  const USAGE_FACT_SCHEMA_VERSION = 3;
  const USAGE_FACT_META_KEY = "usage-facts";
  const USAGE_FACT_MIGRATION_KEY = "legacy-migration";
  const USAGE_FACT_HOST_BACKUP_KEY = "host-backup";
  // 主机冷备：~/.codex/usage-ledger/ 下的按天 NDJSON + manifest.json。
  const USAGE_HOST_BACKUP_DIR = "usage-ledger";
  const USAGE_HOST_BACKUP_MANIFEST = "manifest.json";
  const USAGE_HOST_BACKUP_SCHEMA_VERSION = 2;
  const USAGE_HOST_BACKUP_DEBOUNCE_MS = 8_000;
  const USAGE_HOST_BACKUP_RETENTION_DAYS = 30;
  const USAGE_EXPORT_SCHEMA_VERSION = 2;
  const USAGE_SYNC_DB_NAME = "codex-live-token-cost-usage-sync";
  const USAGE_SYNC_DB_VERSION = 2;
  const USAGE_SYNC_STORE_HANDLES = "handles";
  const USAGE_SYNC_STORE_FILE_STAMPS = "fileStamps";
  const USAGE_SYNC_DIR_HANDLE_KEY = "codex-data-root";
  // v2：事实层开始带模型，旧的增量戳会让未变更的 rollout 永远不再解析，
  // 所以换 key 触发一次全量重读，把历史 turn 的模型补齐。
  const USAGE_SYNC_FILE_STAMPS_KEY = "rollout-files-v2";
  const USAGE_SYNC_PICKER_ID = "codex-live-token-cost";
  const USAGE_SYNC_LAST_RESULT_KEY = "__codexLiveTokenCostUsageSyncLastV1";
  const USAGE_SYNC_SOURCE = "codex-usage-backfill";
  const USAGE_SYNC_ROLLOUT_FILE_RE = /\.(jsonl|jsonl\.zst|jsonl\.zstd)$/i;
  const USAGE_SYNC_AUTO_START_DELAY_MS = 12_000;
  const USAGE_SYNC_AUTO_INTERVAL_MS = 5 * 60_000;
  const USAGE_SYNC_AUTO_RETRY_INTERVAL_MS = 20 * 60_000;
  const USAGE_SYNC_AUTO_MAX_ENTRIES = 8000;
  const USAGE_SYNC_AUTO_MAX_DEPTH = 6;
  const USAGE_SYNC_USAGE_FIELDS = [
    "input_tokens",
    "cached_input_tokens",
    "cache_write_input_tokens",
    "output_tokens",
    "reasoning_output_tokens",
    "total_tokens",
  ];
  let profileUnlockEnabledRuntime;
  const PROJECT_CONTEXT_ROW_SELECTOR =
    "[data-codex-composer-root] [data-composer-utility-bar-scroll-area] [data-composer-navigation-target='workspace-project']";
  const PROFILE_GATE_ID = "2478676115";
  const PROFILE_USAGE_QUERY_KEY = ["profile", "usage"];
  const PROFILE_ACCOUNT_INFO_QUERY_KEY = ["vscode", "account-info"];
  const PROFILE_ACCOUNTS_CHECK_QUERY_KEY = ["accounts", "check"];
  const PROFILE_WORKSPACE_ACCOUNT_ENABLED = true;
  const LOCAL_PROFILE_ACCOUNT_ID = "local-profile-account";
  const LOCAL_PROFILE_USER_ID = "local-profile-user";
  const LOCAL_PROFILE_PLAN = "pro_20x";
  const LOCAL_PROFILE_EMAIL = "sama@openai.com";
  const PROFILE_PLAN_OPTIONS = [
    { value: "free", label: "Free" },
    { value: "go", label: "Go" },
    { value: "plus", label: "Plus" },
    { value: "pro_5x", label: "Pro 5x" },
    { value: "pro_20x", label: "Pro 20x" },
    { value: "business", label: "Business" },
    { value: "enterprise", label: "Enterprise" },
    { value: "edu", label: "Edu" },
    { value: "staff", label: "Staff" },
    { value: "founder", label: "Founder" },
  ];
  const PROFILE_IMAGE_MAX_LENGTH = 8_000_000;
  const PROFILE_IMAGE_UPLOAD_TARGET_LENGTH = 220_000;
  const PROFILE_IMAGE_UPLOAD_MAX_DIMENSION = 512;
  const PROFILE_HEATMAP_BASE_START = "2025-07-13";
  const PROFILE_HEATMAP_MAX_COLUMNS = 52;
  const LOCAL_LEDGER_LIMIT = 2000;
  const DAILY_LEDGER_QUOTA_TRIM_LIMITS = [500, 200, 80, 20, 0];
  const ANALYTICS_ROLLUP_QUOTA_TRIM_DAYS = [ANALYTICS_MAX_DAYS, 180, 90, 30, 7];
  const LOCAL_LIVE_TURN_RESTORE_MAX_AGE_MS = 15 * 60 * 1000;
  const UNKNOWN_MODEL = "未知";
  const FAST_MODE_ICON_PATH =
    "M11.9125 21.4125C11.5292 21.8625 11.0292 22.0958 10.4125 22.1125C9.79586 22.1291 9.29586 21.9208 8.91252 21.4875C8.53752 21.0541 8.45836 20.4541 8.67503 19.6875L9.68752 16H4.57502C4.00836 16 3.56669 15.8375 3.25002 15.5125C2.93336 15.1791 2.77502 14.7791 2.77502 14.3125C2.77502 13.8375 2.92919 13.4125 3.23752 13.0375L12.1375 2.47497C12.5209 2.02497 13.0209 1.79164 13.6375 1.77497C14.2542 1.75831 14.75 1.96664 15.125 2.39997C15.5084 2.83331 15.5917 3.43331 15.375 4.19997L14.3125 7.99998H19.425C19.9917 7.99998 20.4334 8.16664 20.75 8.49997C21.075 8.83331 21.2375 9.23748 21.2375 9.71247C21.2375 10.1791 21.0792 10.5958 20.7625 10.9625L11.9125 21.4125Z";
  const LEGACY_FAST_MODE_ICON_PATH_PREFIX = "M9.80999 17.8302C9.49666 18.1969";
  const RENDER_THROTTLE_MS = 250;
  const SETTINGS_MODAL_EXIT_MS = 160;
  const PROFILE_SAVE_STATUS_DURATION_MS = 1800;
  const PROFILE_DATA_REFRESH_MIN_INTERVAL_MS = 60000;
  const SHIMMER_ACTIVE_MS = 1000;
  const SHIMMER_INTERVAL_MS = 4000;
  // 宿主只在“回合状态发生变化”时推送事件；如果完成事件丢失（例如脚本注入前
  // 已建立的 app-server 长连接），本地 running 会一直为 true。用宿主输入区的
  // 发送/停止按钮做兜底校准，并留出一点时间给 React 切换图标。
  const RUNNING_DOM_GRACE_MS = 1500;
  // 会话键解析会连续查询多组宿主选择器；短时缓存把一次渲染内的重复解析压到一次。
  // 点击/新建会话会主动失效，因此切换仍然即时。
  const SESSION_KEY_CACHE_MS = 120;
  const COMPOSER_BOX_CACHE_MS = 1000;
  const ROOT_PLACEMENT_CACHE_MS = 1000;
  const COMPOSER_RUN_STATE_CACHE_MS = 300;
  const HUB_VISIBILITY_CACHE_MS = 1000;
  const SETTINGS_PANEL_RENDER_INTERVAL_MS = 1000;
  const FAST_MODE_COST_MULTIPLIERS = [
    { pattern: /^gpt-5\.6(?:$|[-_.])/, multiplier: 2 },
    { pattern: /^gpt-5\.5(?:$|[-_.])/, multiplier: 2.5 },
    { pattern: /^gpt-5\.4(?:$|[-_.])/, multiplier: 2 },
  ];
  // ---------------------------------------------------------------------------
  // 模块 02：通用原语（UTIL）
  // 只收「无状态、纯函数、零测试文本引用」的底层工具：
  //   * 收进 UTIL 是为了让每个调用点自带出处（UTIL.toCount / UTIL.normalizeText）。
  //     17k 行单文件里靠裸名跳转，是查不到定义落在哪个板块的。
  //   * fmtCount / fmtMoney / escapeHtml / localDateKey 刻意留在下面裸名位置：
  //     tests/codex-live-token-cost.test.cjs 对它们做源码文本断言（code.includes(...)），
  //     改名会让断言失效，属于「不要动」的稳定面。
  // ---------------------------------------------------------------------------
  const UTIL = {
    toCount(value) {
      const n = Number(value);
      return Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
    },
    // 兼容秒 / 毫秒 / ISO 字符串三种时间戳口径。
    toTimestampMs(value) {
      if (value == null || value === "") return 0;
      const n = Number(value);
      if (Number.isFinite(n) && n > 0) return Math.round(n < 10_000_000_000 ? n * 1000 : n);
      const parsed = Date.parse(String(value));
      return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
    },
    firstTimestampMs(...values) {
      for (const value of values) {
        const timestamp = UTIL.toTimestampMs(value);
        if (timestamp) return timestamp;
      }
      return 0;
    },
    // 时长格式化：秒 / 分 / 小时，超过 1 小时才显示小时部分。
    fmtDuration(ms) {
      const total = Math.max(0, UTIL.toCount(ms));
      if (!total) return "0 秒";
      const hours = Math.floor(total / 3_600_000);
      const minutes = Math.floor((total % 3_600_000) / 60_000);
      const seconds = Math.floor((total % 60_000) / 1000);
      if (hours) return `${hours} 小时 ${minutes} 分`;
      if (minutes) return `${minutes} 分 ${seconds} 秒`;
      return `${seconds} 秒`;
    },
    fmtPercent(numerator, denominator) {
      const total = UTIL.toCount(denominator);
      return total ? `${Math.round((UTIL.toCount(numerator) / total) * 100)}%` : "0%";
    },
    // localStorage JSON 读取：任何异常都回落 fallback，绝不因为脏数据打断渲染。
    loadJson(key, fallback) {
      try {
        const parsed = JSON.parse(localStorage.getItem(key) || "null");
        return parsed && typeof parsed === "object" ? parsed : fallback;
      } catch {
        return fallback;
      }
    },
    loadJsonFromString(value, fallback) {
      try {
        const parsed = JSON.parse(String(value || "null"));
        return parsed && typeof parsed === "object" ? parsed : fallback;
      } catch {
        return fallback;
      }
    },
    // 文本归一：非字符串、空串、超长、以及 null/undefined/default 这类占位值一律视为缺失。
    normalizeText(value, max = 120) {
      if (typeof value !== "string") return "";
      const text = value.trim();
      if (!text || text.length > max || /^(null|undefined|default)$/i.test(text)) return "";
      return text;
    },
  };

  /*
   * Flatpickr 4.6.13 + zh locale
   * Copyright (c) 2017 Gregory Petrosyan
   *
   * Permission is hereby granted, free of charge, to any person obtaining a copy
   * of this software and associated documentation files (the "Software"), to deal
   * in the Software without restriction, including without limitation the rights
   * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
   * copies of the Software, and to permit persons to whom the Software is
   * furnished to do so, subject to the following conditions:
   *
   * The above copyright notice and this permission notice shall be included in all
   * copies or substantial portions of the Software.
   *
   * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
   * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
   * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
   * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
   * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
   * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
   * SOFTWARE.
   */
  // ---------------------------------------------------------------------------
  // 模块 03：内置打包依赖
  // flatpickr 4.6.13 + zh locale、fzstd（zstd 解码）、flatpickr CSS(gzip) 全部内联，
  // 不依赖任何 CDN：宿主是 Electron，离线也要能用。升级只替换这三段 blob。
  // ---------------------------------------------------------------------------
  function installBundledFlatpickr() {
    if (typeof window.flatpickr === "function") return window.flatpickr;
    const exports = undefined;
    const module = undefined;
    const define = undefined;
/* flatpickr v4.6.13,, @license MIT */
!function(e,n){"object"==typeof exports&&"undefined"!=typeof module?module.exports=n():"function"==typeof define&&define.amd?define(n):(e="undefined"!=typeof globalThis?globalThis:e||self).flatpickr=n()}(this,(function(){"use strict";var e=function(){return(e=Object.assign||function(e){for(var n,t=1,a=arguments.length;t<a;t++)for(var i in n=arguments[t])Object.prototype.hasOwnProperty.call(n,i)&&(e[i]=n[i]);return e}).apply(this,arguments)};function n(){for(var e=0,n=0,t=arguments.length;n<t;n++)e+=arguments[n].length;var a=Array(e),i=0;for(n=0;n<t;n++)for(var o=arguments[n],r=0,l=o.length;r<l;r++,i++)a[i]=o[r];return a}var t=["onChange","onClose","onDayCreate","onDestroy","onKeyDown","onMonthChange","onOpen","onParseConfig","onReady","onValueUpdate","onYearChange","onPreCalendarPosition"],a={_disable:[],allowInput:!1,allowInvalidPreload:!1,altFormat:"F j, Y",altInput:!1,altInputClass:"form-control input",animate:"object"==typeof window&&-1===window.navigator.userAgent.indexOf("MSIE"),ariaDateFormat:"F j, Y",autoFillDefaultTime:!0,clickOpens:!0,closeOnSelect:!0,conjunction:", ",dateFormat:"Y-m-d",defaultHour:12,defaultMinute:0,defaultSeconds:0,disable:[],disableMobile:!1,enableSeconds:!1,enableTime:!1,errorHandler:function(e){return"undefined"!=typeof console&&console.warn(e)},getWeek:function(e){var n=new Date(e.getTime());n.setHours(0,0,0,0),n.setDate(n.getDate()+3-(n.getDay()+6)%7);var t=new Date(n.getFullYear(),0,4);return 1+Math.round(((n.getTime()-t.getTime())/864e5-3+(t.getDay()+6)%7)/7)},hourIncrement:1,ignoredFocusElements:[],inline:!1,locale:"default",minuteIncrement:5,mode:"single",monthSelectorType:"dropdown",nextArrow:"<svg version='1.1' xmlns='http://www.w3.org/2000/svg' xmlns:xlink='http://www.w3.org/1999/xlink' viewBox='0 0 17 17'><g></g><path d='M13.207 8.472l-7.854 7.854-0.707-0.707 7.146-7.146-7.146-7.148 0.707-0.707 7.854 7.854z' /></svg>",noCalendar:!1,now:new Date,onChange:[],onClose:[],onDayCreate:[],onDestroy:[],onKeyDown:[],onMonthChange:[],onOpen:[],onParseConfig:[],onReady:[],onValueUpdate:[],onYearChange:[],onPreCalendarPosition:[],plugins:[],position:"auto",positionElement:void 0,prevArrow:"<svg version='1.1' xmlns='http://www.w3.org/2000/svg' xmlns:xlink='http://www.w3.org/1999/xlink' viewBox='0 0 17 17'><g></g><path d='M5.207 8.471l7.146 7.147-0.707 0.707-7.853-7.854 7.854-7.853 0.707 0.707-7.147 7.146z' /></svg>",shorthandCurrentMonth:!1,showMonths:1,static:!1,time_24hr:!1,weekNumbers:!1,wrap:!1},i={weekdays:{shorthand:["Sun","Mon","Tue","Wed","Thu","Fri","Sat"],longhand:["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"]},months:{shorthand:["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"],longhand:["January","February","March","April","May","June","July","August","September","October","November","December"]},daysInMonth:[31,28,31,30,31,30,31,31,30,31,30,31],firstDayOfWeek:0,ordinal:function(e){var n=e%100;if(n>3&&n<21)return"th";switch(n%10){case 1:return"st";case 2:return"nd";case 3:return"rd";default:return"th"}},rangeSeparator:" to ",weekAbbreviation:"Wk",scrollTitle:"Scroll to increment",toggleTitle:"Click to toggle",amPM:["AM","PM"],yearAriaLabel:"Year",monthAriaLabel:"Month",hourAriaLabel:"Hour",minuteAriaLabel:"Minute",time_24hr:!1},o=function(e,n){return void 0===n&&(n=2),("000"+e).slice(-1*n)},r=function(e){return!0===e?1:0};function l(e,n){var t;return function(){var a=this,i=arguments;clearTimeout(t),t=setTimeout((function(){return e.apply(a,i)}),n)}}var c=function(e){return e instanceof Array?e:[e]};function s(e,n,t){if(!0===t)return e.classList.add(n);e.classList.remove(n)}function d(e,n,t){var a=window.document.createElement(e);return n=n||"",t=t||"",a.className=n,void 0!==t&&(a.textContent=t),a}function u(e){for(;e.firstChild;)e.removeChild(e.firstChild)}function f(e,n){return n(e)?e:e.parentNode?f(e.parentNode,n):void 0}function m(e,n){var t=d("div","numInputWrapper"),a=d("input","numInput "+e),i=d("span","arrowUp"),o=d("span","arrowDown");if(-1===navigator.userAgent.indexOf("MSIE 9.0")?a.type="number":(a.type="text",a.pattern="\\d*"),void 0!==n)for(var r in n)a.setAttribute(r,n[r]);return t.appendChild(a),t.appendChild(i),t.appendChild(o),t}function g(e){try{return"function"==typeof e.composedPath?e.composedPath()[0]:e.target}catch(n){return e.target}}var p=function(){},h=function(e,n,t){return t.months[n?"shorthand":"longhand"][e]},v={D:p,F:function(e,n,t){e.setMonth(t.months.longhand.indexOf(n))},G:function(e,n){e.setHours((e.getHours()>=12?12:0)+parseFloat(n))},H:function(e,n){e.setHours(parseFloat(n))},J:function(e,n){e.setDate(parseFloat(n))},K:function(e,n,t){e.setHours(e.getHours()%12+12*r(new RegExp(t.amPM[1],"i").test(n)))},M:function(e,n,t){e.setMonth(t.months.shorthand.indexOf(n))},S:function(e,n){e.setSeconds(parseFloat(n))},U:function(e,n){return new Date(1e3*parseFloat(n))},W:function(e,n,t){var a=parseInt(n),i=new Date(e.getFullYear(),0,2+7*(a-1),0,0,0,0);return i.setDate(i.getDate()-i.getDay()+t.firstDayOfWeek),i},Y:function(e,n){e.setFullYear(parseFloat(n))},Z:function(e,n){return new Date(n)},d:function(e,n){e.setDate(parseFloat(n))},h:function(e,n){e.setHours((e.getHours()>=12?12:0)+parseFloat(n))},i:function(e,n){e.setMinutes(parseFloat(n))},j:function(e,n){e.setDate(parseFloat(n))},l:p,m:function(e,n){e.setMonth(parseFloat(n)-1)},n:function(e,n){e.setMonth(parseFloat(n)-1)},s:function(e,n){e.setSeconds(parseFloat(n))},u:function(e,n){return new Date(parseFloat(n))},w:p,y:function(e,n){e.setFullYear(2e3+parseFloat(n))}},D={D:"",F:"",G:"(\\d\\d|\\d)",H:"(\\d\\d|\\d)",J:"(\\d\\d|\\d)\\w+",K:"",M:"",S:"(\\d\\d|\\d)",U:"(.+)",W:"(\\d\\d|\\d)",Y:"(\\d{4})",Z:"(.+)",d:"(\\d\\d|\\d)",h:"(\\d\\d|\\d)",i:"(\\d\\d|\\d)",j:"(\\d\\d|\\d)",l:"",m:"(\\d\\d|\\d)",n:"(\\d\\d|\\d)",s:"(\\d\\d|\\d)",u:"(.+)",w:"(\\d\\d|\\d)",y:"(\\d{2})"},w={Z:function(e){return e.toISOString()},D:function(e,n,t){return n.weekdays.shorthand[w.w(e,n,t)]},F:function(e,n,t){return h(w.n(e,n,t)-1,!1,n)},G:function(e,n,t){return o(w.h(e,n,t))},H:function(e){return o(e.getHours())},J:function(e,n){return void 0!==n.ordinal?e.getDate()+n.ordinal(e.getDate()):e.getDate()},K:function(e,n){return n.amPM[r(e.getHours()>11)]},M:function(e,n){return h(e.getMonth(),!0,n)},S:function(e){return o(e.getSeconds())},U:function(e){return e.getTime()/1e3},W:function(e,n,t){return t.getWeek(e)},Y:function(e){return o(e.getFullYear(),4)},d:function(e){return o(e.getDate())},h:function(e){return e.getHours()%12?e.getHours()%12:12},i:function(e){return o(e.getMinutes())},j:function(e){return e.getDate()},l:function(e,n){return n.weekdays.longhand[e.getDay()]},m:function(e){return o(e.getMonth()+1)},n:function(e){return e.getMonth()+1},s:function(e){return e.getSeconds()},u:function(e){return e.getTime()},w:function(e){return e.getDay()},y:function(e){return String(e.getFullYear()).substring(2)}},b=function(e){var n=e.config,t=void 0===n?a:n,o=e.l10n,r=void 0===o?i:o,l=e.isMobile,c=void 0!==l&&l;return function(e,n,a){var i=a||r;return void 0===t.formatDate||c?n.split("").map((function(n,a,o){return w[n]&&"\\"!==o[a-1]?w[n](e,i,t):"\\"!==n?n:""})).join(""):t.formatDate(e,n,i)}},C=function(e){var n=e.config,t=void 0===n?a:n,o=e.l10n,r=void 0===o?i:o;return function(e,n,i,o){if(0===e||e){var l,c=o||r,s=e;if(e instanceof Date)l=new Date(e.getTime());else if("string"!=typeof e&&void 0!==e.toFixed)l=new Date(e);else if("string"==typeof e){var d=n||(t||a).dateFormat,u=String(e).trim();if("today"===u)l=new Date,i=!0;else if(t&&t.parseDate)l=t.parseDate(e,d);else if(/Z$/.test(u)||/GMT$/.test(u))l=new Date(e);else{for(var f=void 0,m=[],g=0,p=0,h="";g<d.length;g++){var w=d[g],b="\\"===w,C="\\"===d[g-1]||b;if(D[w]&&!C){h+=D[w];var M=new RegExp(h).exec(e);M&&(f=!0)&&m["Y"!==w?"push":"unshift"]({fn:v[w],val:M[++p]})}else b||(h+=".")}l=t&&t.noCalendar?new Date((new Date).setHours(0,0,0,0)):new Date((new Date).getFullYear(),0,1,0,0,0,0),m.forEach((function(e){var n=e.fn,t=e.val;return l=n(l,t,c)||l})),l=f?l:void 0}}if(l instanceof Date&&!isNaN(l.getTime()))return!0===i&&l.setHours(0,0,0,0),l;t.errorHandler(new Error("Invalid date provided: "+s))}}};function M(e,n,t){return void 0===t&&(t=!0),!1!==t?new Date(e.getTime()).setHours(0,0,0,0)-new Date(n.getTime()).setHours(0,0,0,0):e.getTime()-n.getTime()}var y=function(e,n,t){return 3600*e+60*n+t},x=864e5;function E(e){var n=e.defaultHour,t=e.defaultMinute,a=e.defaultSeconds;if(void 0!==e.minDate){var i=e.minDate.getHours(),o=e.minDate.getMinutes(),r=e.minDate.getSeconds();n<i&&(n=i),n===i&&t<o&&(t=o),n===i&&t===o&&a<r&&(a=e.minDate.getSeconds())}if(void 0!==e.maxDate){var l=e.maxDate.getHours(),c=e.maxDate.getMinutes();(n=Math.min(n,l))===l&&(t=Math.min(c,t)),n===l&&t===c&&(a=e.maxDate.getSeconds())}return{hours:n,minutes:t,seconds:a}}"function"!=typeof Object.assign&&(Object.assign=function(e){for(var n=[],t=1;t<arguments.length;t++)n[t-1]=arguments[t];if(!e)throw TypeError("Cannot convert undefined or null to object");for(var a=function(n){n&&Object.keys(n).forEach((function(t){return e[t]=n[t]}))},i=0,o=n;i<o.length;i++){var r=o[i];a(r)}return e});function k(p,v){var w={config:e(e({},a),I.defaultConfig),l10n:i};function k(){var e;return(null===(e=w.calendarContainer)||void 0===e?void 0:e.getRootNode()).activeElement||document.activeElement}function T(e){return e.bind(w)}function S(){var e=w.config;!1===e.weekNumbers&&1===e.showMonths||!0!==e.noCalendar&&window.requestAnimationFrame((function(){if(void 0!==w.calendarContainer&&(w.calendarContainer.style.visibility="hidden",w.calendarContainer.style.display="block"),void 0!==w.daysContainer){var n=(w.days.offsetWidth+1)*e.showMonths;w.daysContainer.style.width=n+"px",w.calendarContainer.style.width=n+(void 0!==w.weekWrapper?w.weekWrapper.offsetWidth:0)+"px",w.calendarContainer.style.removeProperty("visibility"),w.calendarContainer.style.removeProperty("display")}}))}function _(e){if(0===w.selectedDates.length){var n=void 0===w.config.minDate||M(new Date,w.config.minDate)>=0?new Date:new Date(w.config.minDate.getTime()),t=E(w.config);n.setHours(t.hours,t.minutes,t.seconds,n.getMilliseconds()),w.selectedDates=[n],w.latestSelectedDateObj=n}void 0!==e&&"blur"!==e.type&&function(e){e.preventDefault();var n="keydown"===e.type,t=g(e),a=t;void 0!==w.amPM&&t===w.amPM&&(w.amPM.textContent=w.l10n.amPM[r(w.amPM.textContent===w.l10n.amPM[0])]);var i=parseFloat(a.getAttribute("min")),l=parseFloat(a.getAttribute("max")),c=parseFloat(a.getAttribute("step")),s=parseInt(a.value,10),d=e.delta||(n?38===e.which?1:-1:0),u=s+c*d;if(void 0!==a.value&&2===a.value.length){var f=a===w.hourElement,m=a===w.minuteElement;u<i?(u=l+u+r(!f)+(r(f)&&r(!w.amPM)),m&&L(void 0,-1,w.hourElement)):u>l&&(u=a===w.hourElement?u-l-r(!w.amPM):i,m&&L(void 0,1,w.hourElement)),w.amPM&&f&&(1===c?u+s===23:Math.abs(u-s)>c)&&(w.amPM.textContent=w.l10n.amPM[r(w.amPM.textContent===w.l10n.amPM[0])]),a.value=o(u)}}(e);var a=w._input.value;O(),ye(),w._input.value!==a&&w._debouncedChange()}function O(){if(void 0!==w.hourElement&&void 0!==w.minuteElement){var e,n,t=(parseInt(w.hourElement.value.slice(-2),10)||0)%24,a=(parseInt(w.minuteElement.value,10)||0)%60,i=void 0!==w.secondElement?(parseInt(w.secondElement.value,10)||0)%60:0;void 0!==w.amPM&&(e=t,n=w.amPM.textContent,t=e%12+12*r(n===w.l10n.amPM[1]));var o=void 0!==w.config.minTime||w.config.minDate&&w.minDateHasTime&&w.latestSelectedDateObj&&0===M(w.latestSelectedDateObj,w.config.minDate,!0),l=void 0!==w.config.maxTime||w.config.maxDate&&w.maxDateHasTime&&w.latestSelectedDateObj&&0===M(w.latestSelectedDateObj,w.config.maxDate,!0);if(void 0!==w.config.maxTime&&void 0!==w.config.minTime&&w.config.minTime>w.config.maxTime){var c=y(w.config.minTime.getHours(),w.config.minTime.getMinutes(),w.config.minTime.getSeconds()),s=y(w.config.maxTime.getHours(),w.config.maxTime.getMinutes(),w.config.maxTime.getSeconds()),d=y(t,a,i);if(d>s&&d<c){var u=function(e){var n=Math.floor(e/3600),t=(e-3600*n)/60;return[n,t,e-3600*n-60*t]}(c);t=u[0],a=u[1],i=u[2]}}else{if(l){var f=void 0!==w.config.maxTime?w.config.maxTime:w.config.maxDate;(t=Math.min(t,f.getHours()))===f.getHours()&&(a=Math.min(a,f.getMinutes())),a===f.getMinutes()&&(i=Math.min(i,f.getSeconds()))}if(o){var m=void 0!==w.config.minTime?w.config.minTime:w.config.minDate;(t=Math.max(t,m.getHours()))===m.getHours()&&a<m.getMinutes()&&(a=m.getMinutes()),a===m.getMinutes()&&(i=Math.max(i,m.getSeconds()))}}A(t,a,i)}}function F(e){var n=e||w.latestSelectedDateObj;n&&n instanceof Date&&A(n.getHours(),n.getMinutes(),n.getSeconds())}function A(e,n,t){void 0!==w.latestSelectedDateObj&&w.latestSelectedDateObj.setHours(e%24,n,t||0,0),w.hourElement&&w.minuteElement&&!w.isMobile&&(w.hourElement.value=o(w.config.time_24hr?e:(12+e)%12+12*r(e%12==0)),w.minuteElement.value=o(n),void 0!==w.amPM&&(w.amPM.textContent=w.l10n.amPM[r(e>=12)]),void 0!==w.secondElement&&(w.secondElement.value=o(t)))}function N(e){var n=g(e),t=parseInt(n.value)+(e.delta||0);(t/1e3>1||"Enter"===e.key&&!/[^\d]/.test(t.toString()))&&ee(t)}function P(e,n,t,a){return n instanceof Array?n.forEach((function(n){return P(e,n,t,a)})):e instanceof Array?e.forEach((function(e){return P(e,n,t,a)})):(e.addEventListener(n,t,a),void w._handlers.push({remove:function(){return e.removeEventListener(n,t,a)}}))}function Y(){De("onChange")}function j(e,n){var t=void 0!==e?w.parseDate(e):w.latestSelectedDateObj||(w.config.minDate&&w.config.minDate>w.now?w.config.minDate:w.config.maxDate&&w.config.maxDate<w.now?w.config.maxDate:w.now),a=w.currentYear,i=w.currentMonth;try{void 0!==t&&(w.currentYear=t.getFullYear(),w.currentMonth=t.getMonth())}catch(e){e.message="Invalid date supplied: "+t,w.config.errorHandler(e)}n&&w.currentYear!==a&&(De("onYearChange"),q()),!n||w.currentYear===a&&w.currentMonth===i||De("onMonthChange"),w.redraw()}function H(e){var n=g(e);~n.className.indexOf("arrow")&&L(e,n.classList.contains("arrowUp")?1:-1)}function L(e,n,t){var a=e&&g(e),i=t||a&&a.parentNode&&a.parentNode.firstChild,o=we("increment");o.delta=n,i&&i.dispatchEvent(o)}function R(e,n,t,a){var i=ne(n,!0),o=d("span",e,n.getDate().toString());return o.dateObj=n,o.$i=a,o.setAttribute("aria-label",w.formatDate(n,w.config.ariaDateFormat)),-1===e.indexOf("hidden")&&0===M(n,w.now)&&(w.todayDateElem=o,o.classList.add("today"),o.setAttribute("aria-current","date")),i?(o.tabIndex=-1,be(n)&&(o.classList.add("selected"),w.selectedDateElem=o,"range"===w.config.mode&&(s(o,"startRange",w.selectedDates[0]&&0===M(n,w.selectedDates[0],!0)),s(o,"endRange",w.selectedDates[1]&&0===M(n,w.selectedDates[1],!0)),"nextMonthDay"===e&&o.classList.add("inRange")))):o.classList.add("flatpickr-disabled"),"range"===w.config.mode&&function(e){return!("range"!==w.config.mode||w.selectedDates.length<2)&&(M(e,w.selectedDates[0])>=0&&M(e,w.selectedDates[1])<=0)}(n)&&!be(n)&&o.classList.add("inRange"),w.weekNumbers&&1===w.config.showMonths&&"prevMonthDay"!==e&&a%7==6&&w.weekNumbers.insertAdjacentHTML("beforeend","<span class='flatpickr-day'>"+w.config.getWeek(n)+"</span>"),De("onDayCreate",o),o}function W(e){e.focus(),"range"===w.config.mode&&oe(e)}function B(e){for(var n=e>0?0:w.config.showMonths-1,t=e>0?w.config.showMonths:-1,a=n;a!=t;a+=e)for(var i=w.daysContainer.children[a],o=e>0?0:i.children.length-1,r=e>0?i.children.length:-1,l=o;l!=r;l+=e){var c=i.children[l];if(-1===c.className.indexOf("hidden")&&ne(c.dateObj))return c}}function J(e,n){var t=k(),a=te(t||document.body),i=void 0!==e?e:a?t:void 0!==w.selectedDateElem&&te(w.selectedDateElem)?w.selectedDateElem:void 0!==w.todayDateElem&&te(w.todayDateElem)?w.todayDateElem:B(n>0?1:-1);void 0===i?w._input.focus():a?function(e,n){for(var t=-1===e.className.indexOf("Month")?e.dateObj.getMonth():w.currentMonth,a=n>0?w.config.showMonths:-1,i=n>0?1:-1,o=t-w.currentMonth;o!=a;o+=i)for(var r=w.daysContainer.children[o],l=t-w.currentMonth===o?e.$i+n:n<0?r.children.length-1:0,c=r.children.length,s=l;s>=0&&s<c&&s!=(n>0?c:-1);s+=i){var d=r.children[s];if(-1===d.className.indexOf("hidden")&&ne(d.dateObj)&&Math.abs(e.$i-s)>=Math.abs(n))return W(d)}w.changeMonth(i),J(B(i),0)}(i,n):W(i)}function K(e,n){for(var t=(new Date(e,n,1).getDay()-w.l10n.firstDayOfWeek+7)%7,a=w.utils.getDaysInMonth((n-1+12)%12,e),i=w.utils.getDaysInMonth(n,e),o=window.document.createDocumentFragment(),r=w.config.showMonths>1,l=r?"prevMonthDay hidden":"prevMonthDay",c=r?"nextMonthDay hidden":"nextMonthDay",s=a+1-t,u=0;s<=a;s++,u++)o.appendChild(R("flatpickr-day "+l,new Date(e,n-1,s),0,u));for(s=1;s<=i;s++,u++)o.appendChild(R("flatpickr-day",new Date(e,n,s),0,u));for(var f=i+1;f<=42-t&&(1===w.config.showMonths||u%7!=0);f++,u++)o.appendChild(R("flatpickr-day "+c,new Date(e,n+1,f%i),0,u));var m=d("div","dayContainer");return m.appendChild(o),m}function U(){if(void 0!==w.daysContainer){u(w.daysContainer),w.weekNumbers&&u(w.weekNumbers);for(var e=document.createDocumentFragment(),n=0;n<w.config.showMonths;n++){var t=new Date(w.currentYear,w.currentMonth,1);t.setMonth(w.currentMonth+n),e.appendChild(K(t.getFullYear(),t.getMonth()))}w.daysContainer.appendChild(e),w.days=w.daysContainer.firstChild,"range"===w.config.mode&&1===w.selectedDates.length&&oe()}}function q(){if(!(w.config.showMonths>1||"dropdown"!==w.config.monthSelectorType)){var e=function(e){return!(void 0!==w.config.minDate&&w.currentYear===w.config.minDate.getFullYear()&&e<w.config.minDate.getMonth())&&!(void 0!==w.config.maxDate&&w.currentYear===w.config.maxDate.getFullYear()&&e>w.config.maxDate.getMonth())};w.monthsDropdownContainer.tabIndex=-1,w.monthsDropdownContainer.innerHTML="";for(var n=0;n<12;n++)if(e(n)){var t=d("option","flatpickr-monthDropdown-month");t.value=new Date(w.currentYear,n).getMonth().toString(),t.textContent=h(n,w.config.shorthandCurrentMonth,w.l10n),t.tabIndex=-1,w.currentMonth===n&&(t.selected=!0),w.monthsDropdownContainer.appendChild(t)}}}function $(){var e,n=d("div","flatpickr-month"),t=window.document.createDocumentFragment();w.config.showMonths>1||"static"===w.config.monthSelectorType?e=d("span","cur-month"):(w.monthsDropdownContainer=d("select","flatpickr-monthDropdown-months"),w.monthsDropdownContainer.setAttribute("aria-label",w.l10n.monthAriaLabel),P(w.monthsDropdownContainer,"change",(function(e){var n=g(e),t=parseInt(n.value,10);w.changeMonth(t-w.currentMonth),De("onMonthChange")})),q(),e=w.monthsDropdownContainer);var a=m("cur-year",{tabindex:"-1"}),i=a.getElementsByTagName("input")[0];i.setAttribute("aria-label",w.l10n.yearAriaLabel),w.config.minDate&&i.setAttribute("min",w.config.minDate.getFullYear().toString()),w.config.maxDate&&(i.setAttribute("max",w.config.maxDate.getFullYear().toString()),i.disabled=!!w.config.minDate&&w.config.minDate.getFullYear()===w.config.maxDate.getFullYear());var o=d("div","flatpickr-current-month");return o.appendChild(e),o.appendChild(a),t.appendChild(o),n.appendChild(t),{container:n,yearElement:i,monthElement:e}}function V(){u(w.monthNav),w.monthNav.appendChild(w.prevMonthNav),w.config.showMonths&&(w.yearElements=[],w.monthElements=[]);for(var e=w.config.showMonths;e--;){var n=$();w.yearElements.push(n.yearElement),w.monthElements.push(n.monthElement),w.monthNav.appendChild(n.container)}w.monthNav.appendChild(w.nextMonthNav)}function z(){w.weekdayContainer?u(w.weekdayContainer):w.weekdayContainer=d("div","flatpickr-weekdays");for(var e=w.config.showMonths;e--;){var n=d("div","flatpickr-weekdaycontainer");w.weekdayContainer.appendChild(n)}return G(),w.weekdayContainer}function G(){if(w.weekdayContainer){var e=w.l10n.firstDayOfWeek,t=n(w.l10n.weekdays.shorthand);e>0&&e<t.length&&(t=n(t.splice(e,t.length),t.splice(0,e)));for(var a=w.config.showMonths;a--;)w.weekdayContainer.children[a].innerHTML="\n      <span class='flatpickr-weekday'>\n        "+t.join("</span><span class='flatpickr-weekday'>")+"\n      </span>\n      "}}function Z(e,n){void 0===n&&(n=!0);var t=n?e:e-w.currentMonth;t<0&&!0===w._hidePrevMonthArrow||t>0&&!0===w._hideNextMonthArrow||(w.currentMonth+=t,(w.currentMonth<0||w.currentMonth>11)&&(w.currentYear+=w.currentMonth>11?1:-1,w.currentMonth=(w.currentMonth+12)%12,De("onYearChange"),q()),U(),De("onMonthChange"),Ce())}function Q(e){return w.calendarContainer.contains(e)}function X(e){if(w.isOpen&&!w.config.inline){var n=g(e),t=Q(n),a=!(n===w.input||n===w.altInput||w.element.contains(n)||e.path&&e.path.indexOf&&(~e.path.indexOf(w.input)||~e.path.indexOf(w.altInput)))&&!t&&!Q(e.relatedTarget),i=!w.config.ignoredFocusElements.some((function(e){return e.contains(n)}));a&&i&&(w.config.allowInput&&w.setDate(w._input.value,!1,w.config.altInput?w.config.altFormat:w.config.dateFormat),void 0!==w.timeContainer&&void 0!==w.minuteElement&&void 0!==w.hourElement&&""!==w.input.value&&void 0!==w.input.value&&_(),w.close(),w.config&&"range"===w.config.mode&&1===w.selectedDates.length&&w.clear(!1))}}function ee(e){if(!(!e||w.config.minDate&&e<w.config.minDate.getFullYear()||w.config.maxDate&&e>w.config.maxDate.getFullYear())){var n=e,t=w.currentYear!==n;w.currentYear=n||w.currentYear,w.config.maxDate&&w.currentYear===w.config.maxDate.getFullYear()?w.currentMonth=Math.min(w.config.maxDate.getMonth(),w.currentMonth):w.config.minDate&&w.currentYear===w.config.minDate.getFullYear()&&(w.currentMonth=Math.max(w.config.minDate.getMonth(),w.currentMonth)),t&&(w.redraw(),De("onYearChange"),q())}}function ne(e,n){var t;void 0===n&&(n=!0);var a=w.parseDate(e,void 0,n);if(w.config.minDate&&a&&M(a,w.config.minDate,void 0!==n?n:!w.minDateHasTime)<0||w.config.maxDate&&a&&M(a,w.config.maxDate,void 0!==n?n:!w.maxDateHasTime)>0)return!1;if(!w.config.enable&&0===w.config.disable.length)return!0;if(void 0===a)return!1;for(var i=!!w.config.enable,o=null!==(t=w.config.enable)&&void 0!==t?t:w.config.disable,r=0,l=void 0;r<o.length;r++){if("function"==typeof(l=o[r])&&l(a))return i;if(l instanceof Date&&void 0!==a&&l.getTime()===a.getTime())return i;if("string"==typeof l){var c=w.parseDate(l,void 0,!0);return c&&c.getTime()===a.getTime()?i:!i}if("object"==typeof l&&void 0!==a&&l.from&&l.to&&a.getTime()>=l.from.getTime()&&a.getTime()<=l.to.getTime())return i}return!i}function te(e){return void 0!==w.daysContainer&&(-1===e.className.indexOf("hidden")&&-1===e.className.indexOf("flatpickr-disabled")&&w.daysContainer.contains(e))}function ae(e){var n=e.target===w._input,t=w._input.value.trimEnd()!==Me();!n||!t||e.relatedTarget&&Q(e.relatedTarget)||w.setDate(w._input.value,!0,e.target===w.altInput?w.config.altFormat:w.config.dateFormat)}function ie(e){var n=g(e),t=w.config.wrap?p.contains(n):n===w._input,a=w.config.allowInput,i=w.isOpen&&(!a||!t),o=w.config.inline&&t&&!a;if(13===e.keyCode&&t){if(a)return w.setDate(w._input.value,!0,n===w.altInput?w.config.altFormat:w.config.dateFormat),w.close(),n.blur();w.open()}else if(Q(n)||i||o){var r=!!w.timeContainer&&w.timeContainer.contains(n);switch(e.keyCode){case 13:r?(e.preventDefault(),_(),fe()):me(e);break;case 27:e.preventDefault(),fe();break;case 8:case 46:t&&!w.config.allowInput&&(e.preventDefault(),w.clear());break;case 37:case 39:if(r||t)w.hourElement&&w.hourElement.focus();else{e.preventDefault();var l=k();if(void 0!==w.daysContainer&&(!1===a||l&&te(l))){var c=39===e.keyCode?1:-1;e.ctrlKey?(e.stopPropagation(),Z(c),J(B(1),0)):J(void 0,c)}}break;case 38:case 40:e.preventDefault();var s=40===e.keyCode?1:-1;w.daysContainer&&void 0!==n.$i||n===w.input||n===w.altInput?e.ctrlKey?(e.stopPropagation(),ee(w.currentYear-s),J(B(1),0)):r||J(void 0,7*s):n===w.currentYearElement?ee(w.currentYear-s):w.config.enableTime&&(!r&&w.hourElement&&w.hourElement.focus(),_(e),w._debouncedChange());break;case 9:if(r){var d=[w.hourElement,w.minuteElement,w.secondElement,w.amPM].concat(w.pluginElements).filter((function(e){return e})),u=d.indexOf(n);if(-1!==u){var f=d[u+(e.shiftKey?-1:1)];e.preventDefault(),(f||w._input).focus()}}else!w.config.noCalendar&&w.daysContainer&&w.daysContainer.contains(n)&&e.shiftKey&&(e.preventDefault(),w._input.focus())}}if(void 0!==w.amPM&&n===w.amPM)switch(e.key){case w.l10n.amPM[0].charAt(0):case w.l10n.amPM[0].charAt(0).toLowerCase():w.amPM.textContent=w.l10n.amPM[0],O(),ye();break;case w.l10n.amPM[1].charAt(0):case w.l10n.amPM[1].charAt(0).toLowerCase():w.amPM.textContent=w.l10n.amPM[1],O(),ye()}(t||Q(n))&&De("onKeyDown",e)}function oe(e,n){if(void 0===n&&(n="flatpickr-day"),1===w.selectedDates.length&&(!e||e.classList.contains(n)&&!e.classList.contains("flatpickr-disabled"))){for(var t=e?e.dateObj.getTime():w.days.firstElementChild.dateObj.getTime(),a=w.parseDate(w.selectedDates[0],void 0,!0).getTime(),i=Math.min(t,w.selectedDates[0].getTime()),o=Math.max(t,w.selectedDates[0].getTime()),r=!1,l=0,c=0,s=i;s<o;s+=x)ne(new Date(s),!0)||(r=r||s>i&&s<o,s<a&&(!l||s>l)?l=s:s>a&&(!c||s<c)&&(c=s));Array.from(w.rContainer.querySelectorAll("*:nth-child(-n+"+w.config.showMonths+") > ."+n)).forEach((function(n){var i,o,s,d=n.dateObj.getTime(),u=l>0&&d<l||c>0&&d>c;if(u)return n.classList.add("notAllowed"),void["inRange","startRange","endRange"].forEach((function(e){n.classList.remove(e)}));r&&!u||(["startRange","inRange","endRange","notAllowed"].forEach((function(e){n.classList.remove(e)})),void 0!==e&&(e.classList.add(t<=w.selectedDates[0].getTime()?"startRange":"endRange"),a<t&&d===a?n.classList.add("startRange"):a>t&&d===a&&n.classList.add("endRange"),d>=l&&(0===c||d<=c)&&(o=a,s=t,(i=d)>Math.min(o,s)&&i<Math.max(o,s))&&n.classList.add("inRange")))}))}}function re(){!w.isOpen||w.config.static||w.config.inline||de()}function le(e){return function(n){var t=w.config["_"+e+"Date"]=w.parseDate(n,w.config.dateFormat),a=w.config["_"+("min"===e?"max":"min")+"Date"];void 0!==t&&(w["min"===e?"minDateHasTime":"maxDateHasTime"]=t.getHours()>0||t.getMinutes()>0||t.getSeconds()>0),w.selectedDates&&(w.selectedDates=w.selectedDates.filter((function(e){return ne(e)})),w.selectedDates.length||"min"!==e||F(t),ye()),w.daysContainer&&(ue(),void 0!==t?w.currentYearElement[e]=t.getFullYear().toString():w.currentYearElement.removeAttribute(e),w.currentYearElement.disabled=!!a&&void 0!==t&&a.getFullYear()===t.getFullYear())}}function ce(){return w.config.wrap?p.querySelector("[data-input]"):p}function se(){"object"!=typeof w.config.locale&&void 0===I.l10ns[w.config.locale]&&w.config.errorHandler(new Error("flatpickr: invalid locale "+w.config.locale)),w.l10n=e(e({},I.l10ns.default),"object"==typeof w.config.locale?w.config.locale:"default"!==w.config.locale?I.l10ns[w.config.locale]:void 0),D.D="("+w.l10n.weekdays.shorthand.join("|")+")",D.l="("+w.l10n.weekdays.longhand.join("|")+")",D.M="("+w.l10n.months.shorthand.join("|")+")",D.F="("+w.l10n.months.longhand.join("|")+")",D.K="("+w.l10n.amPM[0]+"|"+w.l10n.amPM[1]+"|"+w.l10n.amPM[0].toLowerCase()+"|"+w.l10n.amPM[1].toLowerCase()+")",void 0===e(e({},v),JSON.parse(JSON.stringify(p.dataset||{}))).time_24hr&&void 0===I.defaultConfig.time_24hr&&(w.config.time_24hr=w.l10n.time_24hr),w.formatDate=b(w),w.parseDate=C({config:w.config,l10n:w.l10n})}function de(e){if("function"!=typeof w.config.position){if(void 0!==w.calendarContainer){De("onPreCalendarPosition");var n=e||w._positionElement,t=Array.prototype.reduce.call(w.calendarContainer.children,(function(e,n){return e+n.offsetHeight}),0),a=w.calendarContainer.offsetWidth,i=w.config.position.split(" "),o=i[0],r=i.length>1?i[1]:null,l=n.getBoundingClientRect(),c=window.innerHeight-l.bottom,d="above"===o||"below"!==o&&c<t&&l.top>t,u=window.pageYOffset+l.top+(d?-t-2:n.offsetHeight+2);if(s(w.calendarContainer,"arrowTop",!d),s(w.calendarContainer,"arrowBottom",d),!w.config.inline){var f=window.pageXOffset+l.left,m=!1,g=!1;"center"===r?(f-=(a-l.width)/2,m=!0):"right"===r&&(f-=a-l.width,g=!0),s(w.calendarContainer,"arrowLeft",!m&&!g),s(w.calendarContainer,"arrowCenter",m),s(w.calendarContainer,"arrowRight",g);var p=window.document.body.offsetWidth-(window.pageXOffset+l.right),h=f+a>window.document.body.offsetWidth,v=p+a>window.document.body.offsetWidth;if(s(w.calendarContainer,"rightMost",h),!w.config.static)if(w.calendarContainer.style.top=u+"px",h)if(v){var D=function(){for(var e=null,n=0;n<document.styleSheets.length;n++){var t=document.styleSheets[n];if(t.cssRules){try{t.cssRules}catch(e){continue}e=t;break}}return null!=e?e:(a=document.createElement("style"),document.head.appendChild(a),a.sheet);var a}();if(void 0===D)return;var b=window.document.body.offsetWidth,C=Math.max(0,b/2-a/2),M=D.cssRules.length,y="{left:"+l.left+"px;right:auto;}";s(w.calendarContainer,"rightMost",!1),s(w.calendarContainer,"centerMost",!0),D.insertRule(".flatpickr-calendar.centerMost:before,.flatpickr-calendar.centerMost:after"+y,M),w.calendarContainer.style.left=C+"px",w.calendarContainer.style.right="auto"}else w.calendarContainer.style.left="auto",w.calendarContainer.style.right=p+"px";else w.calendarContainer.style.left=f+"px",w.calendarContainer.style.right="auto"}}}else w.config.position(w,e)}function ue(){w.config.noCalendar||w.isMobile||(q(),Ce(),U())}function fe(){w._input.focus(),-1!==window.navigator.userAgent.indexOf("MSIE")||void 0!==navigator.msMaxTouchPoints?setTimeout(w.close,0):w.close()}function me(e){e.preventDefault(),e.stopPropagation();var n=f(g(e),(function(e){return e.classList&&e.classList.contains("flatpickr-day")&&!e.classList.contains("flatpickr-disabled")&&!e.classList.contains("notAllowed")}));if(void 0!==n){var t=n,a=w.latestSelectedDateObj=new Date(t.dateObj.getTime()),i=(a.getMonth()<w.currentMonth||a.getMonth()>w.currentMonth+w.config.showMonths-1)&&"range"!==w.config.mode;if(w.selectedDateElem=t,"single"===w.config.mode)w.selectedDates=[a];else if("multiple"===w.config.mode){var o=be(a);o?w.selectedDates.splice(parseInt(o),1):w.selectedDates.push(a)}else"range"===w.config.mode&&(2===w.selectedDates.length&&w.clear(!1,!1),w.latestSelectedDateObj=a,w.selectedDates.push(a),0!==M(a,w.selectedDates[0],!0)&&w.selectedDates.sort((function(e,n){return e.getTime()-n.getTime()})));if(O(),i){var r=w.currentYear!==a.getFullYear();w.currentYear=a.getFullYear(),w.currentMonth=a.getMonth(),r&&(De("onYearChange"),q()),De("onMonthChange")}if(Ce(),U(),ye(),i||"range"===w.config.mode||1!==w.config.showMonths?void 0!==w.selectedDateElem&&void 0===w.hourElement&&w.selectedDateElem&&w.selectedDateElem.focus():W(t),void 0!==w.hourElement&&void 0!==w.hourElement&&w.hourElement.focus(),w.config.closeOnSelect){var l="single"===w.config.mode&&!w.config.enableTime,c="range"===w.config.mode&&2===w.selectedDates.length&&!w.config.enableTime;(l||c)&&fe()}Y()}}w.parseDate=C({config:w.config,l10n:w.l10n}),w._handlers=[],w.pluginElements=[],w.loadedPlugins=[],w._bind=P,w._setHoursFromDate=F,w._positionCalendar=de,w.changeMonth=Z,w.changeYear=ee,w.clear=function(e,n){void 0===e&&(e=!0);void 0===n&&(n=!0);w.input.value="",void 0!==w.altInput&&(w.altInput.value="");void 0!==w.mobileInput&&(w.mobileInput.value="");w.selectedDates=[],w.latestSelectedDateObj=void 0,!0===n&&(w.currentYear=w._initialDate.getFullYear(),w.currentMonth=w._initialDate.getMonth());if(!0===w.config.enableTime){var t=E(w.config),a=t.hours,i=t.minutes,o=t.seconds;A(a,i,o)}w.redraw(),e&&De("onChange")},w.close=function(){w.isOpen=!1,w.isMobile||(void 0!==w.calendarContainer&&w.calendarContainer.classList.remove("open"),void 0!==w._input&&w._input.classList.remove("active"));De("onClose")},w.onMouseOver=oe,w._createElement=d,w.createDay=R,w.destroy=function(){void 0!==w.config&&De("onDestroy");for(var e=w._handlers.length;e--;)w._handlers[e].remove();if(w._handlers=[],w.mobileInput)w.mobileInput.parentNode&&w.mobileInput.parentNode.removeChild(w.mobileInput),w.mobileInput=void 0;else if(w.calendarContainer&&w.calendarContainer.parentNode)if(w.config.static&&w.calendarContainer.parentNode){var n=w.calendarContainer.parentNode;if(n.lastChild&&n.removeChild(n.lastChild),n.parentNode){for(;n.firstChild;)n.parentNode.insertBefore(n.firstChild,n);n.parentNode.removeChild(n)}}else w.calendarContainer.parentNode.removeChild(w.calendarContainer);w.altInput&&(w.input.type="text",w.altInput.parentNode&&w.altInput.parentNode.removeChild(w.altInput),delete w.altInput);w.input&&(w.input.type=w.input._type,w.input.classList.remove("flatpickr-input"),w.input.removeAttribute("readonly"));["_showTimeInput","latestSelectedDateObj","_hideNextMonthArrow","_hidePrevMonthArrow","__hideNextMonthArrow","__hidePrevMonthArrow","isMobile","isOpen","selectedDateElem","minDateHasTime","maxDateHasTime","days","daysContainer","_input","_positionElement","innerContainer","rContainer","monthNav","todayDateElem","calendarContainer","weekdayContainer","prevMonthNav","nextMonthNav","monthsDropdownContainer","currentMonthElement","currentYearElement","navigationCurrentMonth","selectedDateElem","config"].forEach((function(e){try{delete w[e]}catch(e){}}))},w.isEnabled=ne,w.jumpToDate=j,w.updateValue=ye,w.open=function(e,n){void 0===n&&(n=w._positionElement);if(!0===w.isMobile){if(e){e.preventDefault();var t=g(e);t&&t.blur()}return void 0!==w.mobileInput&&(w.mobileInput.focus(),w.mobileInput.click()),void De("onOpen")}if(w._input.disabled||w.config.inline)return;var a=w.isOpen;w.isOpen=!0,a||(w.calendarContainer.classList.add("open"),w._input.classList.add("active"),De("onOpen"),de(n));!0===w.config.enableTime&&!0===w.config.noCalendar&&(!1!==w.config.allowInput||void 0!==e&&w.timeContainer.contains(e.relatedTarget)||setTimeout((function(){return w.hourElement.select()}),50))},w.redraw=ue,w.set=function(e,n){if(null!==e&&"object"==typeof e)for(var a in Object.assign(w.config,e),e)void 0!==ge[a]&&ge[a].forEach((function(e){return e()}));else w.config[e]=n,void 0!==ge[e]?ge[e].forEach((function(e){return e()})):t.indexOf(e)>-1&&(w.config[e]=c(n));w.redraw(),ye(!0)},w.setDate=function(e,n,t){void 0===n&&(n=!1);void 0===t&&(t=w.config.dateFormat);if(0!==e&&!e||e instanceof Array&&0===e.length)return w.clear(n);pe(e,t),w.latestSelectedDateObj=w.selectedDates[w.selectedDates.length-1],w.redraw(),j(void 0,n),F(),0===w.selectedDates.length&&w.clear(!1);ye(n),n&&De("onChange")},w.toggle=function(e){if(!0===w.isOpen)return w.close();w.open(e)};var ge={locale:[se,G],showMonths:[V,S,z],minDate:[j],maxDate:[j],positionElement:[ve],clickOpens:[function(){!0===w.config.clickOpens?(P(w._input,"focus",w.open),P(w._input,"click",w.open)):(w._input.removeEventListener("focus",w.open),w._input.removeEventListener("click",w.open))}]};function pe(e,n){var t=[];if(e instanceof Array)t=e.map((function(e){return w.parseDate(e,n)}));else if(e instanceof Date||"number"==typeof e)t=[w.parseDate(e,n)];else if("string"==typeof e)switch(w.config.mode){case"single":case"time":t=[w.parseDate(e,n)];break;case"multiple":t=e.split(w.config.conjunction).map((function(e){return w.parseDate(e,n)}));break;case"range":t=e.split(w.l10n.rangeSeparator).map((function(e){return w.parseDate(e,n)}))}else w.config.errorHandler(new Error("Invalid date supplied: "+JSON.stringify(e)));w.selectedDates=w.config.allowInvalidPreload?t:t.filter((function(e){return e instanceof Date&&ne(e,!1)})),"range"===w.config.mode&&w.selectedDates.sort((function(e,n){return e.getTime()-n.getTime()}))}function he(e){return e.slice().map((function(e){return"string"==typeof e||"number"==typeof e||e instanceof Date?w.parseDate(e,void 0,!0):e&&"object"==typeof e&&e.from&&e.to?{from:w.parseDate(e.from,void 0),to:w.parseDate(e.to,void 0)}:e})).filter((function(e){return e}))}function ve(){w._positionElement=w.config.positionElement||w._input}function De(e,n){if(void 0!==w.config){var t=w.config[e];if(void 0!==t&&t.length>0)for(var a=0;t[a]&&a<t.length;a++)t[a](w.selectedDates,w.input.value,w,n);"onChange"===e&&(w.input.dispatchEvent(we("change")),w.input.dispatchEvent(we("input")))}}function we(e){var n=document.createEvent("Event");return n.initEvent(e,!0,!0),n}function be(e){for(var n=0;n<w.selectedDates.length;n++){var t=w.selectedDates[n];if(t instanceof Date&&0===M(t,e))return""+n}return!1}function Ce(){w.config.noCalendar||w.isMobile||!w.monthNav||(w.yearElements.forEach((function(e,n){var t=new Date(w.currentYear,w.currentMonth,1);t.setMonth(w.currentMonth+n),w.config.showMonths>1||"static"===w.config.monthSelectorType?w.monthElements[n].textContent=h(t.getMonth(),w.config.shorthandCurrentMonth,w.l10n)+" ":w.monthsDropdownContainer.value=t.getMonth().toString(),e.value=t.getFullYear().toString()})),w._hidePrevMonthArrow=void 0!==w.config.minDate&&(w.currentYear===w.config.minDate.getFullYear()?w.currentMonth<=w.config.minDate.getMonth():w.currentYear<w.config.minDate.getFullYear()),w._hideNextMonthArrow=void 0!==w.config.maxDate&&(w.currentYear===w.config.maxDate.getFullYear()?w.currentMonth+1>w.config.maxDate.getMonth():w.currentYear>w.config.maxDate.getFullYear()))}function Me(e){var n=e||(w.config.altInput?w.config.altFormat:w.config.dateFormat);return w.selectedDates.map((function(e){return w.formatDate(e,n)})).filter((function(e,n,t){return"range"!==w.config.mode||w.config.enableTime||t.indexOf(e)===n})).join("range"!==w.config.mode?w.config.conjunction:w.l10n.rangeSeparator)}function ye(e){void 0===e&&(e=!0),void 0!==w.mobileInput&&w.mobileFormatStr&&(w.mobileInput.value=void 0!==w.latestSelectedDateObj?w.formatDate(w.latestSelectedDateObj,w.mobileFormatStr):""),w.input.value=Me(w.config.dateFormat),void 0!==w.altInput&&(w.altInput.value=Me(w.config.altFormat)),!1!==e&&De("onValueUpdate")}function xe(e){var n=g(e),t=w.prevMonthNav.contains(n),a=w.nextMonthNav.contains(n);t||a?Z(t?-1:1):w.yearElements.indexOf(n)>=0?n.select():n.classList.contains("arrowUp")?w.changeYear(w.currentYear+1):n.classList.contains("arrowDown")&&w.changeYear(w.currentYear-1)}return function(){w.element=w.input=p,w.isOpen=!1,function(){var n=["wrap","weekNumbers","allowInput","allowInvalidPreload","clickOpens","time_24hr","enableTime","noCalendar","altInput","shorthandCurrentMonth","inline","static","enableSeconds","disableMobile"],i=e(e({},JSON.parse(JSON.stringify(p.dataset||{}))),v),o={};w.config.parseDate=i.parseDate,w.config.formatDate=i.formatDate,Object.defineProperty(w.config,"enable",{get:function(){return w.config._enable},set:function(e){w.config._enable=he(e)}}),Object.defineProperty(w.config,"disable",{get:function(){return w.config._disable},set:function(e){w.config._disable=he(e)}});var r="time"===i.mode;if(!i.dateFormat&&(i.enableTime||r)){var l=I.defaultConfig.dateFormat||a.dateFormat;o.dateFormat=i.noCalendar||r?"H:i"+(i.enableSeconds?":S":""):l+" H:i"+(i.enableSeconds?":S":"")}if(i.altInput&&(i.enableTime||r)&&!i.altFormat){var s=I.defaultConfig.altFormat||a.altFormat;o.altFormat=i.noCalendar||r?"h:i"+(i.enableSeconds?":S K":" K"):s+" h:i"+(i.enableSeconds?":S":"")+" K"}Object.defineProperty(w.config,"minDate",{get:function(){return w.config._minDate},set:le("min")}),Object.defineProperty(w.config,"maxDate",{get:function(){return w.config._maxDate},set:le("max")});var d=function(e){return function(n){w.config["min"===e?"_minTime":"_maxTime"]=w.parseDate(n,"H:i:S")}};Object.defineProperty(w.config,"minTime",{get:function(){return w.config._minTime},set:d("min")}),Object.defineProperty(w.config,"maxTime",{get:function(){return w.config._maxTime},set:d("max")}),"time"===i.mode&&(w.config.noCalendar=!0,w.config.enableTime=!0);Object.assign(w.config,o,i);for(var u=0;u<n.length;u++)w.config[n[u]]=!0===w.config[n[u]]||"true"===w.config[n[u]];t.filter((function(e){return void 0!==w.config[e]})).forEach((function(e){w.config[e]=c(w.config[e]||[]).map(T)})),w.isMobile=!w.config.disableMobile&&!w.config.inline&&"single"===w.config.mode&&!w.config.disable.length&&!w.config.enable&&!w.config.weekNumbers&&/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);for(u=0;u<w.config.plugins.length;u++){var f=w.config.plugins[u](w)||{};for(var m in f)t.indexOf(m)>-1?w.config[m]=c(f[m]).map(T).concat(w.config[m]):void 0===i[m]&&(w.config[m]=f[m])}i.altInputClass||(w.config.altInputClass=ce().className+" "+w.config.altInputClass);De("onParseConfig")}(),se(),function(){if(w.input=ce(),!w.input)return void w.config.errorHandler(new Error("Invalid input element specified"));w.input._type=w.input.type,w.input.type="text",w.input.classList.add("flatpickr-input"),w._input=w.input,w.config.altInput&&(w.altInput=d(w.input.nodeName,w.config.altInputClass),w._input=w.altInput,w.altInput.placeholder=w.input.placeholder,w.altInput.disabled=w.input.disabled,w.altInput.required=w.input.required,w.altInput.tabIndex=w.input.tabIndex,w.altInput.type="text",w.input.setAttribute("type","hidden"),!w.config.static&&w.input.parentNode&&w.input.parentNode.insertBefore(w.altInput,w.input.nextSibling));w.config.allowInput||w._input.setAttribute("readonly","readonly");ve()}(),function(){w.selectedDates=[],w.now=w.parseDate(w.config.now)||new Date;var e=w.config.defaultDate||("INPUT"!==w.input.nodeName&&"TEXTAREA"!==w.input.nodeName||!w.input.placeholder||w.input.value!==w.input.placeholder?w.input.value:null);e&&pe(e,w.config.dateFormat);w._initialDate=w.selectedDates.length>0?w.selectedDates[0]:w.config.minDate&&w.config.minDate.getTime()>w.now.getTime()?w.config.minDate:w.config.maxDate&&w.config.maxDate.getTime()<w.now.getTime()?w.config.maxDate:w.now,w.currentYear=w._initialDate.getFullYear(),w.currentMonth=w._initialDate.getMonth(),w.selectedDates.length>0&&(w.latestSelectedDateObj=w.selectedDates[0]);void 0!==w.config.minTime&&(w.config.minTime=w.parseDate(w.config.minTime,"H:i"));void 0!==w.config.maxTime&&(w.config.maxTime=w.parseDate(w.config.maxTime,"H:i"));w.minDateHasTime=!!w.config.minDate&&(w.config.minDate.getHours()>0||w.config.minDate.getMinutes()>0||w.config.minDate.getSeconds()>0),w.maxDateHasTime=!!w.config.maxDate&&(w.config.maxDate.getHours()>0||w.config.maxDate.getMinutes()>0||w.config.maxDate.getSeconds()>0)}(),w.utils={getDaysInMonth:function(e,n){return void 0===e&&(e=w.currentMonth),void 0===n&&(n=w.currentYear),1===e&&(n%4==0&&n%100!=0||n%400==0)?29:w.l10n.daysInMonth[e]}},w.isMobile||function(){var e=window.document.createDocumentFragment();if(w.calendarContainer=d("div","flatpickr-calendar"),w.calendarContainer.tabIndex=-1,!w.config.noCalendar){if(e.appendChild((w.monthNav=d("div","flatpickr-months"),w.yearElements=[],w.monthElements=[],w.prevMonthNav=d("span","flatpickr-prev-month"),w.prevMonthNav.innerHTML=w.config.prevArrow,w.nextMonthNav=d("span","flatpickr-next-month"),w.nextMonthNav.innerHTML=w.config.nextArrow,V(),Object.defineProperty(w,"_hidePrevMonthArrow",{get:function(){return w.__hidePrevMonthArrow},set:function(e){w.__hidePrevMonthArrow!==e&&(s(w.prevMonthNav,"flatpickr-disabled",e),w.__hidePrevMonthArrow=e)}}),Object.defineProperty(w,"_hideNextMonthArrow",{get:function(){return w.__hideNextMonthArrow},set:function(e){w.__hideNextMonthArrow!==e&&(s(w.nextMonthNav,"flatpickr-disabled",e),w.__hideNextMonthArrow=e)}}),w.currentYearElement=w.yearElements[0],Ce(),w.monthNav)),w.innerContainer=d("div","flatpickr-innerContainer"),w.config.weekNumbers){var n=function(){w.calendarContainer.classList.add("hasWeeks");var e=d("div","flatpickr-weekwrapper");e.appendChild(d("span","flatpickr-weekday",w.l10n.weekAbbreviation));var n=d("div","flatpickr-weeks");return e.appendChild(n),{weekWrapper:e,weekNumbers:n}}(),t=n.weekWrapper,a=n.weekNumbers;w.innerContainer.appendChild(t),w.weekNumbers=a,w.weekWrapper=t}w.rContainer=d("div","flatpickr-rContainer"),w.rContainer.appendChild(z()),w.daysContainer||(w.daysContainer=d("div","flatpickr-days"),w.daysContainer.tabIndex=-1),U(),w.rContainer.appendChild(w.daysContainer),w.innerContainer.appendChild(w.rContainer),e.appendChild(w.innerContainer)}w.config.enableTime&&e.appendChild(function(){w.calendarContainer.classList.add("hasTime"),w.config.noCalendar&&w.calendarContainer.classList.add("noCalendar");var e=E(w.config);w.timeContainer=d("div","flatpickr-time"),w.timeContainer.tabIndex=-1;var n=d("span","flatpickr-time-separator",":"),t=m("flatpickr-hour",{"aria-label":w.l10n.hourAriaLabel});w.hourElement=t.getElementsByTagName("input")[0];var a=m("flatpickr-minute",{"aria-label":w.l10n.minuteAriaLabel});w.minuteElement=a.getElementsByTagName("input")[0],w.hourElement.tabIndex=w.minuteElement.tabIndex=-1,w.hourElement.value=o(w.latestSelectedDateObj?w.latestSelectedDateObj.getHours():w.config.time_24hr?e.hours:function(e){switch(e%24){case 0:case 12:return 12;default:return e%12}}(e.hours)),w.minuteElement.value=o(w.latestSelectedDateObj?w.latestSelectedDateObj.getMinutes():e.minutes),w.hourElement.setAttribute("step",w.config.hourIncrement.toString()),w.minuteElement.setAttribute("step",w.config.minuteIncrement.toString()),w.hourElement.setAttribute("min",w.config.time_24hr?"0":"1"),w.hourElement.setAttribute("max",w.config.time_24hr?"23":"12"),w.hourElement.setAttribute("maxlength","2"),w.minuteElement.setAttribute("min","0"),w.minuteElement.setAttribute("max","59"),w.minuteElement.setAttribute("maxlength","2"),w.timeContainer.appendChild(t),w.timeContainer.appendChild(n),w.timeContainer.appendChild(a),w.config.time_24hr&&w.timeContainer.classList.add("time24hr");if(w.config.enableSeconds){w.timeContainer.classList.add("hasSeconds");var i=m("flatpickr-second");w.secondElement=i.getElementsByTagName("input")[0],w.secondElement.value=o(w.latestSelectedDateObj?w.latestSelectedDateObj.getSeconds():e.seconds),w.secondElement.setAttribute("step",w.minuteElement.getAttribute("step")),w.secondElement.setAttribute("min","0"),w.secondElement.setAttribute("max","59"),w.secondElement.setAttribute("maxlength","2"),w.timeContainer.appendChild(d("span","flatpickr-time-separator",":")),w.timeContainer.appendChild(i)}w.config.time_24hr||(w.amPM=d("span","flatpickr-am-pm",w.l10n.amPM[r((w.latestSelectedDateObj?w.hourElement.value:w.config.defaultHour)>11)]),w.amPM.title=w.l10n.toggleTitle,w.amPM.tabIndex=-1,w.timeContainer.appendChild(w.amPM));return w.timeContainer}());s(w.calendarContainer,"rangeMode","range"===w.config.mode),s(w.calendarContainer,"animate",!0===w.config.animate),s(w.calendarContainer,"multiMonth",w.config.showMonths>1),w.calendarContainer.appendChild(e);var i=void 0!==w.config.appendTo&&void 0!==w.config.appendTo.nodeType;if((w.config.inline||w.config.static)&&(w.calendarContainer.classList.add(w.config.inline?"inline":"static"),w.config.inline&&(!i&&w.element.parentNode?w.element.parentNode.insertBefore(w.calendarContainer,w._input.nextSibling):void 0!==w.config.appendTo&&w.config.appendTo.appendChild(w.calendarContainer)),w.config.static)){var l=d("div","flatpickr-wrapper");w.element.parentNode&&w.element.parentNode.insertBefore(l,w.element),l.appendChild(w.element),w.altInput&&l.appendChild(w.altInput),l.appendChild(w.calendarContainer)}w.config.static||w.config.inline||(void 0!==w.config.appendTo?w.config.appendTo:window.document.body).appendChild(w.calendarContainer)}(),function(){w.config.wrap&&["open","close","toggle","clear"].forEach((function(e){Array.prototype.forEach.call(w.element.querySelectorAll("[data-"+e+"]"),(function(n){return P(n,"click",w[e])}))}));if(w.isMobile)return void function(){var e=w.config.enableTime?w.config.noCalendar?"time":"datetime-local":"date";w.mobileInput=d("input",w.input.className+" flatpickr-mobile"),w.mobileInput.tabIndex=1,w.mobileInput.type=e,w.mobileInput.disabled=w.input.disabled,w.mobileInput.required=w.input.required,w.mobileInput.placeholder=w.input.placeholder,w.mobileFormatStr="datetime-local"===e?"Y-m-d\\TH:i:S":"date"===e?"Y-m-d":"H:i:S",w.selectedDates.length>0&&(w.mobileInput.defaultValue=w.mobileInput.value=w.formatDate(w.selectedDates[0],w.mobileFormatStr));w.config.minDate&&(w.mobileInput.min=w.formatDate(w.config.minDate,"Y-m-d"));w.config.maxDate&&(w.mobileInput.max=w.formatDate(w.config.maxDate,"Y-m-d"));w.input.getAttribute("step")&&(w.mobileInput.step=String(w.input.getAttribute("step")));w.input.type="hidden",void 0!==w.altInput&&(w.altInput.type="hidden");try{w.input.parentNode&&w.input.parentNode.insertBefore(w.mobileInput,w.input.nextSibling)}catch(e){}P(w.mobileInput,"change",(function(e){w.setDate(g(e).value,!1,w.mobileFormatStr),De("onChange"),De("onClose")}))}();var e=l(re,50);w._debouncedChange=l(Y,300),w.daysContainer&&!/iPhone|iPad|iPod/i.test(navigator.userAgent)&&P(w.daysContainer,"mouseover",(function(e){"range"===w.config.mode&&oe(g(e))}));P(w._input,"keydown",ie),void 0!==w.calendarContainer&&P(w.calendarContainer,"keydown",ie);w.config.inline||w.config.static||P(window,"resize",e);void 0!==window.ontouchstart?P(window.document,"touchstart",X):P(window.document,"mousedown",X);P(window.document,"focus",X,{capture:!0}),!0===w.config.clickOpens&&(P(w._input,"focus",w.open),P(w._input,"click",w.open));void 0!==w.daysContainer&&(P(w.monthNav,"click",xe),P(w.monthNav,["keyup","increment"],N),P(w.daysContainer,"click",me));if(void 0!==w.timeContainer&&void 0!==w.minuteElement&&void 0!==w.hourElement){var n=function(e){return g(e).select()};P(w.timeContainer,["increment"],_),P(w.timeContainer,"blur",_,{capture:!0}),P(w.timeContainer,"click",H),P([w.hourElement,w.minuteElement],["focus","click"],n),void 0!==w.secondElement&&P(w.secondElement,"focus",(function(){return w.secondElement&&w.secondElement.select()})),void 0!==w.amPM&&P(w.amPM,"click",(function(e){_(e)}))}w.config.allowInput&&P(w._input,"blur",ae)}(),(w.selectedDates.length||w.config.noCalendar)&&(w.config.enableTime&&F(w.config.noCalendar?w.latestSelectedDateObj:void 0),ye(!1)),S();var n=/^((?!chrome|android).)*safari/i.test(navigator.userAgent);!w.isMobile&&n&&de(),De("onReady")}(),w}function T(e,n){for(var t=Array.prototype.slice.call(e).filter((function(e){return e instanceof HTMLElement})),a=[],i=0;i<t.length;i++){var o=t[i];try{if(null!==o.getAttribute("data-fp-omit"))continue;void 0!==o._flatpickr&&(o._flatpickr.destroy(),o._flatpickr=void 0),o._flatpickr=k(o,n||{}),a.push(o._flatpickr)}catch(e){console.error(e)}}return 1===a.length?a[0]:a}"undefined"!=typeof HTMLElement&&"undefined"!=typeof HTMLCollection&&"undefined"!=typeof NodeList&&(HTMLCollection.prototype.flatpickr=NodeList.prototype.flatpickr=function(e){return T(this,e)},HTMLElement.prototype.flatpickr=function(e){return T([this],e)});var I=function(e,n){return"string"==typeof e?T(window.document.querySelectorAll(e),n):e instanceof Node?T([e],n):T(e,n)};return I.defaultConfig={},I.l10ns={en:e({},i),default:e({},i)},I.localize=function(n){I.l10ns.default=e(e({},I.l10ns.default),n)},I.setDefaults=function(n){I.defaultConfig=e(e({},I.defaultConfig),n)},I.parseDate=C({}),I.formatDate=b({}),I.compareDates=M,"undefined"!=typeof jQuery&&void 0!==jQuery.fn&&(jQuery.fn.flatpickr=function(e){return T(this,e)}),Date.prototype.fp_incr=function(e){return new Date(this.getFullYear(),this.getMonth(),this.getDate()+("string"==typeof e?parseInt(e,10):e))},"undefined"!=typeof window&&(window.flatpickr=I),I}));
(function (global, factory) {
  typeof exports === 'object' && typeof module !== 'undefined' ? factory(exports) :
  typeof define === 'function' && define.amd ? define(['exports'], factory) :
  (global = typeof globalThis !== 'undefined' ? globalThis : global || self, factory(global.zh = {}));
}(this, (function (exports) { 'use strict';

  var fp = typeof window !== "undefined" && window.flatpickr !== undefined
      ? window.flatpickr
      : {
          l10ns: {},
      };
  var Mandarin = {
      weekdays: {
          shorthand: ["周日", "周一", "周二", "周三", "周四", "周五", "周六"],
          longhand: [
              "星期日",
              "星期一",
              "星期二",
              "星期三",
              "星期四",
              "星期五",
              "星期六",
          ],
      },
      months: {
          shorthand: [
              "一月",
              "二月",
              "三月",
              "四月",
              "五月",
              "六月",
              "七月",
              "八月",
              "九月",
              "十月",
              "十一月",
              "十二月",
          ],
          longhand: [
              "一月",
              "二月",
              "三月",
              "四月",
              "五月",
              "六月",
              "七月",
              "八月",
              "九月",
              "十月",
              "十一月",
              "十二月",
          ],
      },
      rangeSeparator: " 至 ",
      weekAbbreviation: "周",
      scrollTitle: "滚动切换",
      toggleTitle: "点击切换 12/24 小时时制",
  };
  fp.l10ns.zh = Mandarin;
  var zh = fp.l10ns;

  exports.Mandarin = Mandarin;
  exports.default = zh;

  Object.defineProperty(exports, '__esModule', { value: true });

})));

    return window.flatpickr;
  }

  // ---------------------------------------------------------------------------
  // Bundled fzstd (zstd decoder). Codex compresses older rollout logs into
  // `*.jsonl.zst`; the page's DecompressionStream has no zstd codec on
  // Chromium 155 (verified 2026-10-16), so the decoder ships in-script.
  // Source: https://github.com/101arrowz/fzstd (MIT). The UMD build is
  // embedded verbatim below; upgrades replace the blob only.
  // ---------------------------------------------------------------------------
  function installBundledFzstd() {
    const globalScope = globalThis;
    if (globalScope.fzstd && typeof globalScope.fzstd.decompress === "function") return globalScope.fzstd;
    const exports = undefined;
    const module = undefined;
    const define = undefined;
    const self = globalScope;
    !function(f){typeof module!='undefined'&&typeof exports=='object'?module.exports=f():typeof define!='undefined'&&define.amd?define(['fzstd',f]):(typeof self!='undefined'?self:this).fzstd=f()}(function(){var _e={};"use strict";var r=ArrayBuffer,t=Uint8Array,e=Uint16Array,n=Int16Array,a=Uint32Array,s=Int32Array,i=function(r,e,n){if(t.prototype.slice)return t.prototype.slice.call(r,e,n);(null==e||e<0)&&(e=0),(null==n||n>r.length)&&(n=r.length);var a=new t(n-e);return a.set(r.subarray(e,n)),a},o=function(r,e,n,a){if(t.prototype.fill)return t.prototype.fill.call(r,e,n,a);for((null==n||n<0)&&(n=0),(null==a||a>r.length)&&(a=r.length);n<a;++n)r[n]=e;return r},u=function(r,e,n,a){if(t.prototype.copyWithin)return t.prototype.copyWithin.call(r,e,n,a);for((null==n||n<0)&&(n=0),(null==a||a>r.length)&&(a=r.length);n<a;)r[e++]=r[n++]};_e.ZstdErrorCode={InvalidData:0,WindowSizeTooLarge:1,InvalidBlockType:2,FSEAccuracyTooHigh:3,DistanceTooFarBack:4,UnexpectedEOF:5};var h=["invalid zstd data","window size too large (>2046MB)","invalid block type","FSE accuracy too high","match distance too far back","unexpected EOF"],f=function(r,t,e){var n=Error(t||h[r]);if(n.code=r,Error.captureStackTrace&&Error.captureStackTrace(n,f),!e)throw n;return n},l=function(r,t,e){for(var n=0,a=0;n<e;++n)a|=r[t++]<<(n<<3);return a},v=function(r,t){return(r[t]|r[t+1]<<8|r[t+2]<<16|r[t+3]<<24)>>>0},c=function(r,e){var n=r[0]|r[1]<<8|r[2]<<16;if(3126568==n&&253==r[3]){var a=r[4],i=a>>5&1,o=a>>2&1,u=3&a,h=a>>6;8&a&&f(0);var c=6-i,b=3==u?4:u,y=l(r,c,b),p=h?1<<h:i,w=l(r,c+=b,p)+(1==h&&256),g=w;if(!i){var d=1<<10+(r[5]>>3);g=d+(d>>3)*(7&r[5])}g>2145386496&&f(1);var m=new t((1==e?w||g:e?0:g)+12);return m[0]=1,m[4]=4,m[8]=8,{b:c+p,y:0,l:0,d:y,w:e&&1!=e?e:m.subarray(12),e:g,o:new s(m.buffer,0,3),u:w,c:o,m:Math.min(131072,g)}}if(25481893==(n>>4|r[3]<<20))return v(r,4)+8;f(0)},b=function(r){for(var t=0;1<<t<=r;++t);return t-1},y=function(a,s,i){var o=4+(s<<3),u=5+(15&a[s]);u>i&&f(3);for(var h=1<<u,l=h,v=-1,c=-1,y=-1,p=h,w=new r(512+(h<<2)),g=new n(w,0,256),d=new e(w,0,256),m=new e(w,512,h),z=512+(h<<1),E=new t(w,z,h),k=new t(w,z+h);v<255&&l>0;){var A=b(l+1),T=o>>3,x=(1<<A+1)-1,F=(a[T]|a[T+1]<<8|a[T+2]<<16)>>(7&o)&x,S=(1<<A)-1,B=x-l-1,I=F&S;if(I<B?(o+=A,F=I):(o+=A+1,F>S&&(F-=B)),g[++v]=--F,-1==F?(l+=F,E[--p]=v):l-=F,!F)do{var U=o>>3;c=(a[U]|a[U+1]<<8)>>(7&o)&3,o+=2,v+=c}while(3==c)}(v>255||l)&&f(0);for(var D=0,M=(h>>1)+(h>>3)+3,W=h-1,O=0;O<=v;++O){var j=g[O];if(j<1)d[O]=-j;else for(y=0;y<j;++y){E[D]=O;do{D=D+M&W}while(D>=p)}}for(D&&f(0),y=0;y<h;++y){var C=d[E[y]]++,H=k[y]=u-b(C);m[y]=(C<<H)-h}return[o+7>>3,{b:u,s:E,n:k,t:m}]},p=function(r,n){var a=0,s=-1,i=new t(292),u=r[n],h=i.subarray(0,256),l=i.subarray(256,268),v=new e(i.buffer,268);if(u<128){var c=y(r,n+1,6),p=c[1],w=c[0]<<3,g=r[n+=u];g||f(0);for(var d=0,m=0,z=p.b,E=z,k=(++n<<3)-8+b(g);!((k-=z)<w);){var A=k>>3;if(h[++s]=p.s[d+=(r[A]|r[A+1]<<8)>>(7&k)&(1<<z)-1],(k-=E)<w)break;h[++s]=p.s[m+=(r[A=k>>3]|r[A+1]<<8)>>(7&k)&(1<<E)-1],z=p.n[d],d=p.t[d],E=p.n[m],m=p.t[m]}++s>255&&f(0)}else{for(s=u-127;a<s;a+=2){var T=r[++n];h[a]=T>>4,h[a+1]=15&T}++n}var x=0;for(a=0;a<s;++a)(I=h[a])>11&&f(0),x+=I&&1<<I-1;var F=b(x)+1,S=1<<F,B=S-x;for(B&B-1&&f(0),h[s++]=b(B)+1,a=0;a<s;++a){var I;++l[h[a]=(I=h[a])&&F+1-I]}var U=new t(S<<1),D=U.subarray(0,S),M=U.subarray(S);for(v[F]=0,a=F;a>0;--a){var W=v[a];o(M,a,W,v[a-1]=W+l[a]*(1<<F-a))}for(v[0]!=S&&f(0),a=0;a<s;++a){var O=h[a];if(O){var j=v[O];o(D,a,j,v[O]=j+(1<<F-O))}}return[n,{n:M,b:F,s:D}]},w=y(new t([81,16,99,140,49,198,24,99,12,33,196,24,99,102,102,134,70,146,4]),0,6)[1],g=y(new t([33,20,196,24,99,140,33,132,16,66,8,33,132,16,66,8,33,68,68,68,68,68,68,68,68,36,9]),0,6)[1],d=y(new t([32,132,16,66,102,70,68,68,68,68,36,73,2]),0,5)[1],m=function(r,t){for(var e=r.length,n=new s(e),a=0;a<e;++a)n[a]=t,t+=1<<r[a];return n},z=new t(new s([0,0,0,0,16843009,50528770,134678020,202050057,269422093]).buffer,0,36),E=m(z,0),k=new t(new s([0,0,0,0,0,0,0,0,16843009,50528770,117769220,185207048,252579084,16]).buffer,0,53),A=m(k,3),T=function(r,t,e){var n=r.length,a=t.length,s=r[n-1],i=(1<<e.b)-1,o=-e.b;s||f(0);for(var u=0,h=e.b,l=(n<<3)-8+b(s)-h,v=-1;l>o&&v<a;){var c=l>>3;t[++v]=e.s[u=(u<<h|(r[c]|r[c+1]<<8|r[c+2]<<16)>>(7&l))&i],l-=h=e.n[u]}l==o&&v+1==a||f(0)},x=function(r,t,e){var n=6,a=t.length+3>>2,s=a<<1,i=a+s;T(r.subarray(n,n+=r[0]|r[1]<<8),t.subarray(0,a),e),T(r.subarray(n,n+=r[2]|r[3]<<8),t.subarray(a,s),e),T(r.subarray(n,n+=r[4]|r[5]<<8),t.subarray(s,i),e),T(r.subarray(n),t.subarray(i),e)},F=function(r,n,a){var s,u=n.b,h=r[u],l=h>>1&3;n.l=1&h;var v=h>>3|r[u+1]<<5|r[u+2]<<13,c=(u+=3)+v;if(1==l){if(u>=r.length)return;return n.b=u+1,a?(o(a,r[u],n.y,n.y+=v),a):o(new t(v),r[u])}if(!(c>r.length)){if(0==l)return n.b=c,a?(a.set(r.subarray(u,c),n.y),n.y+=v,a):i(r,u,c);if(2==l){var m=r[u],F=3&m,S=m>>2&3,B=m>>4,I=0,U=0;F<2?1&S?B|=r[++u]<<4|(2&S&&r[++u]<<12):B=m>>3:(U=S,S<2?(B|=(63&r[++u])<<4,I=r[u]>>6|r[++u]<<2):2==S?(B|=r[++u]<<4|(3&r[++u])<<12,I=r[u]>>2|r[++u]<<6):(B|=r[++u]<<4|(63&r[++u])<<12,I=r[u]>>6|r[++u]<<2|r[++u]<<10)),++u;var D=a?a.subarray(n.y,n.y+n.m):new t(n.m),M=D.length-B;if(0==F)D.set(r.subarray(u,u+=B),M);else if(1==F)o(D,r[u++],M);else{var W=n.h;if(2==F){var O=p(r,u);I+=u-(u=O[0]),n.h=W=O[1]}else W||f(0);(U?x:T)(r.subarray(u,u+=I),D.subarray(M),W)}var j=r[u++];if(j){255==j?j=32512+(r[u++]|r[u++]<<8):j>127&&(j=j-128<<8|r[u++]);var C=r[u++];3&C&&f(0);for(var H=[g,d,w],L=2;L>-1;--L){var Z=C>>2+(L<<1)&3;if(1==Z){var q=new t([0,0,r[u++]]);H[L]={s:q.subarray(2,3),n:q.subarray(0,1),t:new e(q.buffer,0,1),b:0}}else 2==Z?(u=(s=y(r,u,9-(1&L)))[0],H[L]=s[1]):3==Z&&(n.t||f(0),H[L]=n.t[L])}var G=n.t=H,J=G[0],K=G[1],N=G[2],P=r[c-1];P||f(0);var Q=(c<<3)-8+b(P)-N.b,R=Q>>3,V=0,X=(r[R]|r[R+1]<<8)>>(7&Q)&(1<<N.b)-1,Y=(r[R=(Q-=K.b)>>3]|r[R+1]<<8)>>(7&Q)&(1<<K.b)-1,$=(r[R=(Q-=J.b)>>3]|r[R+1]<<8)>>(7&Q)&(1<<J.b)-1;for(++j;--j;){var _=N.s[X],rr=N.n[X],tr=J.s[$],er=J.n[$],nr=K.s[Y],ar=K.n[Y],sr=1<<nr,ir=sr+((r[R=(Q-=nr)>>3]|r[R+1]<<8|r[R+2]<<16|r[R+3]<<24)>>>(7&Q)&sr-1);R=(Q-=k[tr])>>3;var or=A[tr]+((r[R]|r[R+1]<<8|r[R+2]<<16)>>(7&Q)&(1<<k[tr])-1);R=(Q-=z[_])>>3;var ur=E[_]+((r[R]|r[R+1]<<8|r[R+2]<<16)>>(7&Q)&(1<<z[_])-1);if(R=(Q-=rr)>>3,X=N.t[X]+((r[R]|r[R+1]<<8)>>(7&Q)&(1<<rr)-1),R=(Q-=er)>>3,$=J.t[$]+((r[R]|r[R+1]<<8)>>(7&Q)&(1<<er)-1),R=(Q-=ar)>>3,Y=K.t[Y]+((r[R]|r[R+1]<<8)>>(7&Q)&(1<<ar)-1),ir>3)n.o[2]=n.o[1],n.o[1]=n.o[0],n.o[0]=ir-=3;else{var hr=ir-(0!=ur);hr?(ir=3==hr?n.o[0]-1:n.o[hr],hr>1&&(n.o[2]=n.o[1]),n.o[1]=n.o[0],n.o[0]=ir):ir=n.o[0]}for(L=0;L<ur;++L)D[V+L]=D[M+L];M+=ur;var fr=(V+=ur)-ir;if(fr<0){var lr=-fr,vr=n.e+fr;for(lr>or&&(lr=or),L=0;L<lr;++L)D[V+L]=n.w[vr+L];V+=lr,or-=lr,fr=0}for(L=0;L<or;++L)D[V+L]=D[fr+L];V+=or}if(V!=M)for(;M<D.length;)D[V++]=D[M++];else V=D.length;a?n.y+=V:D=i(D,0,V)}else if(a){if(n.y+=B,M)for(L=0;L<B;++L)D[L]=D[M+L]}else M&&(D=i(D,M));return n.b=c,D}f(2)}},S=function(r,e){if(1==r.length)return r[0];for(var n=new t(e),a=0,s=0;a<r.length;++a){var i=r[a];n.set(i,s),s+=i.length}return n};function B(r,t){for(var e=[],n=+!t,a=0,s=0;r.length;){var i=c(r,n||t);if("object"==typeof i){for(n?(t=null,i.w.length==i.u&&(e.push(t=i.w),s+=i.u)):(e.push(t),i.e=0);!i.l;){var o=F(r,i,t);o||f(5),t?i.e=i.y:(e.push(o),s+=o.length,u(i.w,0,o.length),i.w.set(o,i.w.length-o.length))}a=i.b+4*i.c}else a=i;r=r.subarray(a)}return S(e,s)}_e.decompress=B;var I=function(){function r(r){this.ondata=r,this.c=[],this.l=0,this.z=0}return r.prototype.push=function(r,e){if("number"==typeof this.s){var n=Math.min(r.length,this.s);r=r.subarray(n),this.s-=n}var a=r.length+this.l;if(!this.s){if(e){if(!a)return void this.ondata(new t(0),!0);a<5&&f(5)}else if(a<18)return this.c.push(r),void(this.l=a);if(this.l&&(this.c.push(r),r=S(this.c,a),this.c=[],this.l=0),"number"==typeof(this.s=c(r)))return this.push(r,e)}if("number"!=typeof this.s){if(a<(this.z||3))return e&&f(5),this.c.push(r),void(this.l=a);if(this.l&&(this.c.push(r),r=S(this.c,a),this.c=[],this.l=0),!this.z&&a<(this.z=2&r[this.s.b]?4:3+(r[this.s.b]>>3|r[this.s.b+1]<<5|r[this.s.b+2]<<13)))return e&&f(5),this.c.push(r),void(this.l=a);for(this.z=0;;){var s=F(r,this.s);if(!s){e&&f(5);var i=r.subarray(this.s.b);return this.s.b=0,this.c.push(i),void(this.l+=i.length)}if(this.ondata(s,!1),u(this.s.w,0,s.length),this.s.w.set(s,this.s.w.length-s.length),this.s.l){var o=r.subarray(this.s.b);return this.s=4*this.s.c,void this.push(o,e)}}}else e&&f(5)},r}();_e.Decompress=I;return _e})
    return globalScope.fzstd && typeof globalScope.fzstd.decompress === "function" ? globalScope.fzstd : null;
  }
  const FLATPICKR_CSS_GZIP_BASE64 = "H4sIAAAAAAACCtUby5LbuPHur2DW5VrLFrXUazQjXjaxK1V78GWzqT1s9kCR4IgZimSR1DzM0r+n8SLxFiV7korl0ohAo9Hd6Bca4CzNo7bK4ofaj6McFUlUd7sofrivy2ORbNs6KpoqqlHRhmUVxVn7sg3CJGuqPHrZFmWBwhY9t36UZ/fFNgYwVIePWZPtshzD7rMkQUVYRUmSFfcw1H9Cu4cMBhTZIWqzsqBIlMckq1FMHvO2DndlnaAaBqdl0fpN9hVt56vqOcyzAvl7lN3v2+0CN1BAv46S7Nhs19BSlU1G8ES7psyPLQqfsqTdb5fBZna7wRCcoF35jFFjKhkaaAnNrf6h8dvyGO/9iFJ5APqrY044CO09gmDfpmkqz72PkvJpO6+evQA+b9EN/kx9tSHwaMvw7KsNS3ie46/6fhe9D6bkMwtuJ+F/a6LTTFerWVmhYmrqyAq8kh3Xr3l4iJ75ut6sAlgkQaPIzxxZZ+i4clKs/i4v44fwq58VCXre3uF/xrFUAxHFoWtpWv09StAvxefyqfCWQXBovPi4y2J/h75mqH4/Wyyn8+lsuZjOJ+F1w04O2XCmKDe9VtcIa9YjGGFZbRfVsxFF0wJM3OmmgAcBVPx+HgTvvI8eIJg4MFDRCJIMJaqMIw/HvM2+gNnuPaE7iV4abwbfn6AnAv7qLUD48T7Lk/fFx/lEAQYp/BoV90iA2hQfN5POYEDYf3h/yQ5VWbcReC171/cjeDGO4LmRYH+hGN5afg4vgDWx5M32UfM7Qg8KB1Mb7G/ZAcmgXe/72rY8gCOWnv0aWyr3umpnjtKh7xL6+KQYgXnkQOzQ18Jzx3wHcR0MC9Z17L5A9bPEJa5ZUX4aiT86tqUJxXaH0rJGJgFvoxQipMEWVQPPcCT10SNE1IbGRBYFKQNiXI5BYvB3++OPISMsYFEuCInwFjbPQBbuS9m0DopnUV2XT78SvA6oARXh8BwmKgZCHZZiWNMgbiOUjPxEsouzpDIwYYZ18I5NAL8cC8Y1jgoPJweHqL7Pii2EvrWZMjaNNHAlDVy5WPoNtPIcPxiGz0LMD3vrMShlq/XjMi/rrUvztekMwyFtsY/9GyXwHEcMjM5CDNPJkYS1G+x5LEfSdPpwC0fbtIyPTVceWxyAZQf0VEdVJZpxH4dNyYc48oAjS9OHcyEchGpbmiOhETJO3CAC4mcdt6e22NJ5yr6Uud1NwjTLc62RuZWlmnTPDcm/LhPO0LEBwTcoh8yeejSg76uptdEbtYbyEdVpDiGR7TDEwIoFA7SJgsSPTITwk/5xy66q0SNtnjrhCiwBKuhXYZRIOEFxWQv7o/hYN7B4LEyE5tQukNaNb8HmOCjyJG55gRaMFZeYCWVNBLl6MlaChqGduNccS4KXjZ3Ry3QjvoLRy5XFOLj76cMbj/z76UPd5uDycBAB4wLH9+EnmggpIOCreoCTc/gbx8g3l7M8sHIFy4LROGmmUft/y/N2j33NWCYpdMdiy936DkV3p4tm8prH+8tmwyM6YrJv05vVZrUZbScXTEUmoQkOKb7wEKDkN+em86povMb0A3rXSgIYNVfMsDebN6GpjUgjK/aozmCfVxwPvxTVsf3dGreljF4B9zL8MNWaIZCaqw0WDFx6JNkxQmxJnI9zBEU42e/ZwJlYIEvBYaPKCn93hGynmJ4bkRWFPKLjKetQooNxEcg2RhYiiAD02FNLe5C5GHwCb0U2rItBgXByLuYU+HmoNCqBju2Bho0ciVHrzZT+D2bz9eSaip6ZN2bLQv4khURcsTEOw6W/R2Qdt7COIxmqvBPkm7sfftCjvBkNTXr/WXU0B1C27u4xcpJMAs6ql7WYPPJKK91nu0DYxCvrkt1MaPXq5p2LNlxAIxytg7Nwr8AFnvksCysbaYLvZD7J7XD4GOr79GRsrWvQGV0NrEOoFfe1V2krdKyxDFigForvy7Vss5wpAvLEks4gYMkl77XV4jcYG16k+WIGP7mv2MxWt6y6FSi7DjGvNZZ79W2JFEBgI3mgeyHgFS0TKqZJ6Oq0CoYqHzSJckqjQ5a/GAWz0QRjZIG6Y6q9s3W8H3zoWErGqIQNkxYy6VLdAB1s0eL9v4Kz2103UofrkYoOjo3I6Al0vzCUAEbjJzGUCPgF2c/JrjlRkhWCRT2sxULoxB+iCX2kNirOYKeS9jk0EpuqyZwFHzWcwclnbEEIKgZnA1HOzC0rwMaj3JREYHbSDOUJ3Q8be0yNY9fDVbFxjfuD7zX/nF48gtmY4BshuzNtqiEvsaiLodbr0HAlcf5clxUcDBS8sCTI74CKY541rW1etqJCbVks4Y9WUp6aXad2ooqZVJCpen84GYR8eQndBuPQc/szGmo54tX1txeoqr59B3WN2rHAJStIlXh69XCWe4pSup6WbwkgbtRn+oU5mY+WLiIYVUAq0MJxEj6zs7loPT9Q64nDXi38bsVaSeWM2Qlp9LMWHZq+iyGTBxgA+UWIW3lDzkXh6W1xf9T2OiyOrcOSKK1R1zEHk6A0gkNZwcHcwaKML2qvVxMlfezjp64G8ubrCmYkD7crc/AnJ+uxK+a06frKLPdxJ+Xk2VCvUNX1NXUUTv/r1qiiRC9Zt6ymtNECq1zBUdnV47h0LDzcJeohxIXECbN2yecAmbTWBpdMvsdlIGMS5hLz6DWS1oPIDx88bfFXqDz24jc0wdbuYfvvY9Nm6UuPjj37vL4ABhQjPyIWFTo7v3knFQqbTXFl4QaKvNKmyxJzx+WIuf0yBPYngssQD9TnztIAzYjm6+BK7WCF4OUd/hhzpid+WWGomM0Wt+vNfLV8J6/+LmqyRu7u17hGKYL4m/DrcQOMZaig/ndDNY78Fr0laXBvOOwnflgkRPuUMKfqlxrqxDEWWM11n8w3cKZKM65Gk+s9n+0wuAB9DqYtx07ihJSmckHqpxDqRGYIcQIjhJ5waoiNEBJi6rEV7R7cs3jvsbdbYiLWI/xexp0MqZ+o9JBmAdAuSqAJlUQcazLfDMDY6MmsfKJJ2nFgM64wHDkZ2zkmm2YMGG0QHLMVA5vBvH4DfnM/x24ZzXEbZS7gNvb3uM2juWREJXSIxwXWy8iJi08o6rRjQhdYP6EIJIaet+ubuzTdhJari+p9RUEXFZuheGwK6tBIgZPzaiuAdMr16oCFW/zDSoZV/QcibCA9CfyHQgCdmX4FI+SA84te84qyfa/ezpyMktTlaAyyPI/EnP1wmXMtcnWOEMmY5blkpQywBq2xhGp1eU0m4q8vuCy7Hn9ZFpPhvrdihjgfll1xU+sr27/msKvTZx563MgHMMn/CNti4dhqOXHXBg2lF3lP/v0kyHMHYACyOsJBaCZaviePceJddK/clykRNZTp2mFVZ2BVYuh+vNNegTnNaqzjX8oEKXfF2cE7v6Gs1m74XUPY7Uct2d1aIDxrYQHe5Fio2xfjSyCO90NGTor5oZSS4CVU0aSXdW6tfHpKMSiRldwNyXRJLuIINAx7HiG0jrcKpSAlFNBFZsjNik9aaU2pC3zXOs3YzahSNRKpNlAsb/K0N7guul6hXKA31F/7zYIssP5Gu6g/5GK/8JLQ6trd+auV0VSO2dGjcJuDQ7fYC4bkzg9Q1u7VkfpR7DVVSXYzHWxAFJnZpxhnHXtWyyodl+BzHc1a0OE3M/4Bd2KLpLEdVZP7JMoo/LVY7WvbmNWdNoZd3Rpz1OtI4q2np7oh9LWWweKUMzHTOZlcZlLek3QXaEa/9Pg6J7qDkIXGfXlkh6pCJf3sKKjywq2S6TmwhihOpxTfzNjVWnS/krqCy88wC+hI1Jb11AEZHfzq0Km3aHqrHLvUgpCYpS/evc61e/kUAHpSrXiHy/2mwyoB+HRWJIPAWfi+facWT3XTGbeiWsZupMACJijFeRSs6CQWv5CSKgC2P2oEjqLIX/5UCminn7m0H9BLWkcH1Hji+6RdWpeHbrgrea4w7y/A57uK8xzg1JbCy7jffnPq9PP/OwP/ATTgCv4mPwAA";

  // 价格完全来自 LiteLLM 上游（model_prices_and_context_window.json）运行期同步：
  // 本地缓存只保留上次成功同步的紧凑表，同步前/失败时显示「未定价」。
  let DEFAULT_PRICES = loadDefaultPrices();
  let DEFAULT_PRICE_META = loadDefaultPriceMeta();

  if (window.__codexLiveTokenCostVersion && window.__codexLiveTokenCostVersion !== VERSION) {
    try {
      window.__codexLiveTokenCost?.destroy?.();
    } catch {
      // A stale userscript should not block the new version from loading.
    }
  }
  if (window.__codexLiveTokenCostVersion === VERSION) return;
  window.__codexLiveTokenCostVersion = VERSION;

  // ---------------------------------------------------------------------------
  // 模块 04：生命周期注册器
  // 所有 timer / observer / listener 都必须经 trackXxx 注册，destroy() 才能统一拆除。
  // tests 会断言 disposers 必须排空（仓库约定，别绕过）。
  // ---------------------------------------------------------------------------
  const disposers = [];
  function trackTimer(id) {
    disposers.push(() => {
      window.clearTimeout(id);
      window.cancelAnimationFrame(id);
    });
    return id;
  }
  function trackObserver(observer) {
    disposers.push(() => observer?.disconnect?.());
    return observer;
  }
  function trackListener(target, type, handler, options) {
    target.addEventListener(type, handler, options);
    disposers.push(() => target.removeEventListener(type, handler, options));
    return handler;
  }

  // ---------------------------------------------------------------------------
  // 模块 05：内存状态
  // 唯一可变状态树。事实层（usageFacts）与 turn 投影（localLedger）是两套数据，
  // 禁止在渲染路径里直接改写 usageFacts（走 usageFactPersistResponses）。
  // ---------------------------------------------------------------------------
  const state = {
    startTimer: 0,
    root: null,
    settingsOverlay: null,
    settingsOverlayCloseTimer: 0,
    embeddedPageDispose: null,
    embeddedPageContainer: null,
    embeddedHtmlSignature: null,
    started: false,
    destroyed: false,
    startedAt: Date.now(),
    renderTimer: 0,
    outputRateTimer: 0,
    lastRenderAt: 0,
    mainEditable: null,
    mainEditableAt: 0,
    running: false,
    lastExactTurnId: "",
    lastClickedSidebarThreadKey: "",
    lastClickedSidebarThreadAt: 0,
    userSelectedSidebarThreadKey: "",
    userSelectedSidebarThreadAt: 0,
    detectedSessionKey: "",
    detectedSessionKeyAt: 0,
    newConversationSessionKey: "",
    newConversationSessionKeyAt: 0,
    startupSessionKey: `new:startup:${Date.now().toString(36)}`,
    localLedger: [],
    localUsageArchive: { version: 1, updatedAt: 0, days: {} },
    localLedgerRevision: 0,
    localDailyUsageCache: null,
    currentSessionTurnsCache: new WeakMap(),
    localLedgerLoaded: false,
    localLast: null,
    localCurrentTurn: null,
    localCurrentTurns: new Map(),
    localTurnTimer: 0,
    localTurnTimers: new Map(),
    localTurnSeq: 0,
    localSeenUsage: new Map(),
    localPersistedUsage: new Map(),
    localLedgerSaveError: "",
    dailyLedgerSaveError: "",
    profileLedger: null,
    profileLedgerTurnIndex: new Map(),
    profileLedgerTurnIndexLedger: null,
    profileLedgerLoaded: false,
    profileLedgerStorage: typeof globalThis?.indexedDB === "object" || typeof globalThis?.indexedDB === "function" ? "indexeddb" : "localStorage-fallback",
    profileLedgerDb: null,
    profileLedgerDbPromise: null,
    profileLedgerWriteQueue: Promise.resolve(),
    profileLedgerWriteWarned: false,
    profileLedgerMigrationChecked: false,
    // 事实层（IndexedDB）：responses 按 response_id 幂等，turns/daily 为派生表。
    usageFacts: new Map(),
    usageFactMeta: null,
    usageFactLoaded: false,
    usageFactDegraded: false,
    usageFactDegradedReason: "",
    usageFactReconcile: { threads: new Map(), updatedAt: 0 },
    // 降级 turn（只有 token_count、没有 record）的响应数，用于算覆盖率。
    usageFactFallbackTurns: new Map(),
    usageFactFallbackThreads: new Map(),
    usageHostBackupTimer: 0,
    usageHostBackupAt: 0,
    usageHostBackupStatus: "",
    usageHostBackupError: "",
    // 本地账本按钮（导出/导入/重建）的一次性反馈：只影响状态行，不参与统计。
    usageLedgerStatus: "",
    usageLedgerError: "",
    unhandledRejectionCount: 0,
    lastUnhandledRejection: "",
    // 实时路径的单调基线：(threadId, turnId) -> 已入账的累计 total。
    usageLiveTotals: new Map(),
    usageLiveEpochs: 0,
    usageLiveEpochWarnings: "",
    usageLiveResponseIds: new Set(),
    usageFactWriteQueue: Promise.resolve(),
    profileInvocationSeq: 0,
    legacySessionMigrations: new Set(),
    sessionAliases: new Map(),
    localMessageHandler: null,
    profileRequestIds: new Map(),
    codexModulePromises: new Map(),
    // Codex asset discovery is expensive (the app-initial bundle is ~14 MB) and used to rerun on
    // every profile unlock install. Cache the resolved URLs and fetched sources, keyed by the set
    // of loaded assets so a newly loaded chunk invalidates the cache exactly once.
    codexAssetSignature: null,
    codexAssetUrlCache: new Map(),
    codexAssetTextCache: new Map(),
    detectedModel: "",
    detectedModelLabel: "",
    detectedEffort: "",
    detectedEffortLabel: "",
    detectedFastMode: false,
    priceRemoteRequest: null,
    priceSyncRetryTimer: 0,
    priceSyncRetried: false,
    priceSyncError: "",
    priceSyncedAt: 0,
    priceFileCacheLoaded: false,
    priceCacheWritePromise: null,
    priceEditorOpen: false,
    priceEditorModel: "",
    priceDraft: null,
    priceSaveError: "",
    priceSearch: "",
    priceFilter: "all",
    settingsPanel: "usage",
    analyticsPreset: "today",
    analyticsMetric: "tokens",
    analyticsCustomStart: "",
    analyticsCustomEnd: "",
    usageSyncBusy: false,
    usageSyncStatus: "",
    usageSyncResult: null,
    usageSyncDirHandle: null,
    usageSyncDbPromise: null,
    usageSyncClient: null,
    usageSyncClientChannel: "",
    // 主机能力矩阵（P2 #3）：app-server 方法集的探测/观测结果，24h 缓存。
    hostCapabilities: null,
    usageSyncAutoTimer: 0,
    usageSyncAutoAt: 0,
    usageSyncAutoFailures: 0,
    updateBusy: false,
    updatePhase: "",
    updateRemoteVersion: "",
    updateErrorKind: "",
    updateError: "",
    updateStatusTimer: 0,
    updateAutoCheckTimer: 0,
    updateClusterEl: null,
    analyticsModel: "",
    analyticsModelsExpanded: false,
    analyticsHideUnknown: false,
    analyticsRollup: null,
    analyticsRollupLoaded: false,
    analyticsRollupSaveError: "",
    codexppHistoryTurns: [],
    codexppHistoryAt: 0,
    codexppHistoryFetching: false,
    codexppHistorySessionId: "",
    analyticsTimer: 0,
    analyticsCalendar: null,
    flatpickrPromise: null,
    profilePrefs: null,
    profileSaveStatus: "",
    profileSaveStatusTone: "",
    profileSaveStatusTimer: 0,
    profileQueryClient: null,
    profileQueryClientDiscoveryTimer: 0,
    profileQueryClientDiscoveryObserver: null,
    profileQueryClientDiscoveryProbeAt: 0,
    profileRealChatgptCached: false,
    profileRealChatgptCacheClient: null,
    profileQueryCacheObserverClient: null,
    profileQueryCacheObserverUnsubscribe: null,
    profileQueryCacheSyncQueued: false,
    profileSyntheticAuth: false,
    profileUiAuthCacheKey: "",
    profileUiAuthCacheSource: null,
    profileUiAuthCache: null,
    profileUiReadinessObserver: null,
    profileIdentityObserver: null,
    profileIdentitySyncTimer: 0,
    profileNavigationTimer: 0,
    profileIdentityButtons: new Set(),
    profileIdentityMenuItems: new Set(),
    profileIdentityMenus: new Set(),
    profileAccountsRefreshPromise: null,
    profileUsageRefreshTimer: 0,
    profileUsageRefreshRequests: 0,
    // Profile unlock installs are idempotent per auth mode. Without this the react-query cache
    // observer would reinstall on every accounts/check event, and each install invalidated
    // accounts/check again, producing a self-sustaining refetch loop.
    profileUnlockInstalledMode: "",
    profileUnlockInstalledClient: null,
    profileUnlockInstallCount: 0,
    // Test-only: the API-key profile spoof is disabled in production (see profileSyntheticEnabled).
    profileSyntheticTestEnabled: false,
    // The settings section list is a module-level array; remember it after the first hit so the
    // global Array.prototype.filter wrapper is O(1) for every unrelated filter call.
    settingsSectionsSource: null,
    profileAuthPatchRetryTimer: 0,
    profileAuthPatchRetries: 0,
    profileUiApiAuthCacheSource: null,
    profileUiApiAuthCachePrefs: null,
    profileUiApiAuthCache: null,
    hubVisibilityTimer: 0,
    hubVisibilityObserver: null,
    officialModelObserver: null,
    officialModelRootObserver: null,
    officialModelTrigger: null,
    taskRunningObserver: null,
    taskRunningDom: false,
    profileDataRefreshAttemptAt: 0,
    profileDataRefreshAt: 0,
    profileDataRefreshPromise: null,
    settingsFocusFrame: 0,
    settingsPanelEnterTimer: 0,
    analyticsSegmentSwitchFrame: 0,
    hubValueCache: new Map(),
    hubSkeletonVersion: "",
    shimmerDelayTimer: 0,
    shimmerIntervalTimer: 0,
    shimmerActiveTimer: 0,
    shimmerActiveStartedAt: 0,
    shimmerActiveUntil: 0,
    shimmerRunning: false,
    shimmerRunStartedAt: 0,
    turnShimmerRunning: false,
    turnShimmerStartedAt: 0,
    turnShimmerOutputStartedAt: 0,
    turnShimmerSessions: new Map(),
    officialThreadRuntimeStates: new Map(),
    runtimeSessionBindings: new Map(),
    // 热路径缓存（均以账本引用/版本或 DOM 根节点为失效依据）。
    sessionKeyCacheAt: 0,
    sessionKeyCacheKey: "",
    knownSessionKeysLedger: null,
    knownSessionKeysRevision: -1,
    knownSessionKeys: new Set(),
    recentLedgerModelLedger: null,
    recentLedgerModelRevision: -1,
    recentLedgerModelSessionKey: "",
    recentLedgerModel: "",
    recentLedgerModelAt: 0,
    sessionUsageCache: new WeakMap(),
    sessionCostCache: new WeakMap(),
    sessionUsageKeyCache: new WeakMap(),
    composerBox: null,
    composerBoxAt: 0,
    rootPlacedAt: 0,
    hubSlots: null,
    composerRunStateAt: 0,
    composerRunStateValue: null,
    reactFiberKeyCache: new WeakMap(),
    hubVisibilityCheckedAt: 0,
    hubVisibilityProjectContextRow: false,
    officialModelRebindTimer: 0,
    settingsRenderAt: 0,
    priceOverridesRaw: null,
    priceOverridesValue: null,
  };

  // ---------------------------------------------------------------------------
  // 模块 06：格式化（保留裸名）
  // fmtCount / fmtMoney / escapeHtml / localDateKey 被 tests 的源码文本断言钉住，
  // 故意不并入 UTIL：改名会让 code.includes(...) 断言失效。
  // ---------------------------------------------------------------------------
  function fmtCount(value) {
    const n = UTIL.toCount(value);
    for (const [unit, suffix] of [
      [1_000_000_000, "B"],
      [1_000_000, "M"],
      [1_000, "K"],
    ]) {
      if (n >= unit) {
        return `${(n / unit).toFixed(n < unit * 10 ? 1 : 0).replace(/\\.0$/, "")}${suffix}`;
      }
    }
    return String(n);
  }

  function fmtMoney(value) {
    const n = Number(value);
    if (!Number.isFinite(n) || n <= 0) return "$0.00";
    return `$${n.toFixed(2)}`;
  }

  // 价格覆盖表在每次渲染、每个 turn 成本计算里都会被读取；按 localStorage 原文缓存，
  // 避免同一帧内反复 JSON.parse 整张表。所有写入点都必须调用 invalidatePriceOverridesCache()。
  // ---------------------------------------------------------------------------
  // 模块 07：价格覆盖表缓存
  // 每次渲染都会读，按 localStorage 原文缓存；所有写入点都要调 invalidatePriceOverridesCache()。
  // ---------------------------------------------------------------------------
  function priceOverrides() {
    try {
      const raw = localStorage.getItem(PRICE_OVERRIDES_KEY) || "";
      if (state.priceOverridesRaw === raw && state.priceOverridesValue) return state.priceOverridesValue;
      const value = UTIL.loadJsonFromString(raw, {});
      state.priceOverridesRaw = raw;
      state.priceOverridesValue = value;
      return value;
    } catch {
      return {};
    }
  }

  function invalidatePriceDerivedCaches() {
    state.sessionCostCache = new WeakMap();
    state.localDailyUsageCache = null;
    state.recentLedgerModelAt = 0;
  }

  function invalidatePriceOverridesCache() {
    state.priceOverridesRaw = null;
    state.priceOverridesValue = null;
    invalidatePriceDerivedCaches();
  }

  function profileEmptyBucket() {
    return { input: 0, output: 0, cached: 0, total: 0, cost: 0, requests: 0, turns: 0 };
  }

  function profileEmptyRollup() {
    return {
      version: PROFILE_LEDGER_VERSION,
      updatedAt: 0,
      days: {},
      threadKeys: [],
      activity: {
        fastModeTokens: 0,
        totalTokens: 0,
        fastModeTurns: 0,
        totalTurns: 0,
        longestCompletedDurationMs: 0,
        longestObservedDurationMs: 0,
        effortCounts: {},
        invocationCounts: {},
      },
    };
  }

  function profileEmptyLedger() {
    return { version: PROFILE_LEDGER_VERSION, turns: [], usageCalls: {}, invocations: {}, rollup: profileEmptyRollup(), migrationComplete: false };
  }

  function profileLedgerRebuildTurnIndex(ledger = state.profileLedger) {
    const index = new Map();
    (ledger?.turns || []).forEach((turn, position) => {
      if (turn?.turnId && !index.has(turn.turnId)) index.set(turn.turnId, position);
    });
    state.profileLedgerTurnIndex = index;
    state.profileLedgerTurnIndexLedger = ledger;
    return index;
  }

  function profileLedgerTurnIndex(ledger) {
    return state.profileLedgerTurnIndexLedger === ledger ? state.profileLedgerTurnIndex : profileLedgerRebuildTurnIndex(ledger);
  }

  function profileDurationRank(status) {
    return status === "completed" ? 3 : status === "recovered" ? 2 : 1;
  }

  function profileTimestampIso(value, fallback = "") {
    const numeric = UTIL.toTimestampMs(value);
    if (numeric) return new Date(numeric).toISOString();
    const parsed = Date.parse(String(value || ""));
    return Number.isFinite(parsed) ? new Date(parsed).toISOString() : fallback;
  }

  function profileNormalizeTurn(raw = {}) {
    const turnId = UTIL.normalizeText(raw.turnId || raw.turn_id || raw.id, 240);
    if (!turnId) return null;
    const threadCandidate = UTIL.normalizeText(raw.threadKey || raw.thread_key || raw.sessionKey || raw.session_key, 240);
    const threadKey = raw.threadAttributionStatus === "unknown" || isTransientSessionKey(threadCandidate) ? "" : threadCandidate;
    const hasUsage = normalizeUsage(raw.usage).exact;
    const durationStatus = ["completed", "recovered", "incomplete"].includes(raw.durationStatus) ? raw.durationStatus : "incomplete";
    const startedAt = profileTimestampIso(raw.startedAt || raw.started_at || raw.createdAt || raw.created_at, "");
    const completedAt = durationStatus === "completed" ? profileTimestampIso(raw.completedAt || raw.completed_at || raw.finishedAt || raw.finished_at, "") : "";
    const invocations = (Array.isArray(raw.invocations) ? raw.invocations : [])
      .map((item) => normalizeProfileInvocationRecord(item))
      .filter(Boolean);
    return {
      turnId,
      threadKey,
      threadAttributionStatus: threadKey ? "reliable" : "unknown",
      startedAt,
      completedAt,
      durationMs: Math.max(0, Math.round(Number(raw.durationMs) || 0)),
      durationStatus,
      model: usageModelLabel(raw.model),
      usage: hasUsage ? normalizeUsage(raw.usage) : null,
      // 逐响应 id 是跨来源去重的可靠身份（实时 / 同步 / 导入）。
      responseIds: usageTurnResponseIdList(raw),
      costUsd: Number.isFinite(Number(raw.costUsd)) && Number(raw.costUsd) > 0 ? Number(raw.costUsd) : null,
      fastMode: typeof raw.fastMode === "boolean" ? raw.fastMode : null,
      effort: normalizeReasoningEffort(raw.effort || raw.reasoningEffort),
      callCount: Math.max(0, UTIL.toCount(raw.callCount ?? raw.call_count)),
      source: UTIL.normalizeText(raw.source, 80) || "codex-live-token-cost",
      capturedAt: profileTimestampIso(raw.capturedAt || raw.captured_at || raw.observedAt || raw.observed_at, new Date().toISOString()),
      persistReason: UTIL.normalizeText(raw.persistReason || raw.persist_reason, 80) || "observed",
      invocationIds: Array.from(new Set((Array.isArray(raw.invocationIds) ? raw.invocationIds : []).map((id) => UTIL.normalizeText(id, 240)).filter(Boolean))),
      invocations,
    };
  }

  function profileNormalizeSnapshot(raw) {
    const ledger = profileEmptyLedger();
    if (!raw || typeof raw !== "object" || raw.version !== PROFILE_LEDGER_VERSION) return ledger;
    ledger.migrationComplete = raw.migrationComplete === true;
    ledger.turns = (Array.isArray(raw.turns) ? raw.turns : []).map(profileNormalizeTurn).filter(Boolean);
    for (const call of Array.isArray(raw.usageCalls) ? raw.usageCalls : []) {
      const normalized = profileNormalizeUsageCall(call);
      if (normalized) ledger.usageCalls[normalized.id] = normalized;
    }
    for (const invocation of Array.isArray(raw.invocations) ? raw.invocations : []) {
      const normalized = profileNormalizeLedgerInvocation(invocation);
      if (normalized) ledger.invocations[normalized.invocationId] = normalized;
    }
    profileLinkInvocationsToTurns(ledger);
    ledger.rollup = raw.rollup && typeof raw.rollup === "object" ? raw.rollup : profileEmptyRollup();
    return ledger;
  }

  function profileNormalizeUsageCall(call) {
    const turnId = UTIL.normalizeText(call?.turnId, 240);
    const usage = normalizeUsage(call?.usage);
    if (!turnId || !usage.exact) return null;
    const canonicalUsageKey = usageKey(usage);
    return {
      id: `${turnId}\u0001${canonicalUsageKey}`,
      turnId,
      usage,
      usageKey: canonicalUsageKey,
      observedAt: UTIL.toCount(call.observedAt),
      source: UTIL.normalizeText(call.source, 80),
    };
  }

  function profileNormalizeLedgerInvocation(invocation) {
    const normalized = normalizeProfileInvocation(invocation);
    const invocationId = UTIL.normalizeText(invocation?.invocationId || invocation?.id, 300);
    return normalized && invocationId
      ? { ...normalized, invocationId, turnId: UTIL.normalizeText(invocation.turnId, 240), occurrence: UTIL.toCount(invocation.occurrence) || 1, observedAt: UTIL.toCount(invocation.observedAt), source: UTIL.normalizeText(invocation.source, 80) }
      : null;
  }

  function profileLinkInvocationsToTurns(ledger) {
    const turns = new Map((ledger?.turns || []).map((turn) => [turn.turnId, turn]));
    for (const invocation of Object.values(ledger?.invocations || {})) {
      const turn = turns.get(invocation.turnId);
      if (turn) turn.invocationIds = Array.from(new Set([...(turn.invocationIds || []), invocation.invocationId]));
    }
  }

  function profileSnapshotPayload(options = {}) {
    const ledger = state.profileLedger || profileEmptyLedger();
    if (options.hydrationRequired) {
      return {
        version: PROFILE_LEDGER_VERSION,
        storage: "indexeddb",
        updatedAt: Date.now(),
        migrationComplete: ledger.migrationComplete === true,
        hydrationRequired: true,
      };
    }
    const payload = {
      version: PROFILE_LEDGER_VERSION,
      storage: state.profileLedgerStorage,
      updatedAt: Date.now(),
      migrationComplete: ledger.migrationComplete === true,
      rollup: ledger.rollup || profileEmptyRollup(),
    };
    if (state.profileLedgerStorage !== "indexeddb") {
      payload.turns = ledger.turns;
      payload.usageCalls = Object.values(ledger.usageCalls || {});
      payload.invocations = Object.values(ledger.invocations || {});
    }
    return payload;
  }

  function saveProfileLedgerSnapshot() {
    try {
      localStorage.setItem(PROFILE_LEDGER_SNAPSHOT_KEY, JSON.stringify(profileSnapshotPayload()));
      return true;
    } catch {
      if (state.profileLedgerStorage === "indexeddb") {
        try {
          localStorage.setItem(PROFILE_LEDGER_SNAPSHOT_KEY, JSON.stringify(profileSnapshotPayload({ hydrationRequired: true })));
        } catch {
          try {
            localStorage.removeItem(PROFILE_LEDGER_SNAPSHOT_KEY);
          } catch {
            // IndexedDB remains authoritative if the compatibility pointer cannot be stored.
          }
        }
      }
      return false;
    }
  }

  function profileLegacyArchiveTurns(archive) {
    const turns = [];
    for (const [date, day] of Object.entries(archive?.days || {})) {
      for (const [model, item] of Object.entries(day?.models || {})) {
        const usage = normalizeUsage(item?.usage);
        if (!usage.exact) continue;
        turns.push({
          turnId: `legacy-archive:${date}:${model}`,
          source: "legacy-local-archive",
          model,
          createdAt: `${date}T12:00:00.000Z`,
          usage,
          callCount: UTIL.toCount(item?.calls) || 1,
          costUsd: Number(item?.storedCostUsd) > 0 ? Number(item.storedCostUsd) : null,
          durationStatus: "incomplete",
          persistReason: "legacy-migration",
        });
      }
    }
    return turns;
  }

  function profileMigrateLegacyLedger(ledger) {
    if (ledger.migrationComplete) return false;
    const legacy = UTIL.loadJson(LOCAL_USAGE_KEY, null);
    const candidates = [
      ...(Array.isArray(legacy?.turns) ? legacy.turns : []),
      ...profileLegacyArchiveTurns(legacy?.archive),
    ];
    const byId = new Map(ledger.turns.map((turn) => [turn.turnId, turn]));
    for (const raw of candidates) {
      const imported = normalizeImportedUsageTurn(raw);
      if (!imported) continue;
      const migrated = profileNormalizeTurn({ ...imported, persistReason: "legacy-migration", durationStatus: "incomplete" });
      if (migrated && !byId.has(migrated.turnId)) byId.set(migrated.turnId, migrated);
    }
    ledger.turns = Array.from(byId.values());
    ledger.migrationComplete = true;
    return true;
  }

  function profileLedgerRequest(request) {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("profile ledger IndexedDB request failed"));
    });
  }

  function mergeProfileTurn(existing, next) {
    if (!existing) return next;
    const merged = { ...existing, ...next };
    if (existing.threadKey && !next.threadKey) {
      merged.threadKey = existing.threadKey;
      merged.threadAttributionStatus = existing.threadAttributionStatus;
    }
    if (!next.usage && existing.usage) merged.usage = existing.usage;
    if (!UTIL.toCount(next.callCount) && UTIL.toCount(existing.callCount)) merged.callCount = existing.callCount;
    if (typeof next.fastMode !== "boolean" && typeof existing.fastMode === "boolean") merged.fastMode = existing.fastMode;
    if (!next.effort && existing.effort) merged.effort = existing.effort;
    // 逐响应 id 只增不减：重复观察同一 turn 不能把已知身份洗掉。
    merged.responseIds = Array.from(new Set([...(existing.responseIds || []), ...(next.responseIds || [])]));
    if (profileDurationRank(next.durationStatus) < profileDurationRank(existing.durationStatus)) {
      merged.durationStatus = existing.durationStatus;
      merged.completedAt = existing.completedAt;
      merged.durationMs = existing.durationMs;
    }
    return merged;
  }

  function profileLedgerWriteSnapshot(db) {
    const ledger = state.profileLedger || profileEmptyLedger();
    const rollupDays = Object.entries(ledger.rollup?.days || {}).map(([date, value]) => ({ date, ...value }));
    return new Promise((resolve, reject) => {
      const tx = db.transaction(
        [PROFILE_LEDGER_STORE_TURNS, PROFILE_LEDGER_STORE_USAGE_CALLS, PROFILE_LEDGER_STORE_INVOCATIONS, PROFILE_LEDGER_STORE_DAILY_ROLLUPS],
        "readwrite",
      );
      // Append-only stores: turns / calls / invocations are upserted, never cleared.
      // A stale in-memory ledger (leftover hot-reload instance, second window) must
      // not be able to delete records that already reached IndexedDB.
      ledger.turns.forEach((turn) => tx.objectStore(PROFILE_LEDGER_STORE_TURNS).put(turn));
      Object.values(ledger.usageCalls || {}).forEach((call) => tx.objectStore(PROFILE_LEDGER_STORE_USAGE_CALLS).put(call));
      Object.values(ledger.invocations || {}).forEach((invocation) => tx.objectStore(PROFILE_LEDGER_STORE_INVOCATIONS).put(invocation));
      // Rollups are derived data (rebuilt from turns when the DB is opened) and stay full-rewrite.
      const rollupStore = tx.objectStore(PROFILE_LEDGER_STORE_DAILY_ROLLUPS);
      rollupStore.clear();
      rollupDays.forEach((day) => rollupStore.put(day));
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error || new Error("profile ledger IndexedDB snapshot write failed"));
      tx.onabort = () => reject(tx.error || new Error("profile ledger IndexedDB snapshot transaction aborted"));
    });
  }

  function openProfileLedgerDatabase() {
    if (state.profileLedgerStorage !== "indexeddb" || state.profileLedgerDbPromise || !globalThis.indexedDB) return;
    state.profileLedgerDbPromise = new Promise((resolve, reject) => {
      const request = globalThis.indexedDB.open(PROFILE_LEDGER_DB_NAME, PROFILE_LEDGER_DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(PROFILE_LEDGER_STORE_TURNS)) db.createObjectStore(PROFILE_LEDGER_STORE_TURNS, { keyPath: "turnId" });
        if (!db.objectStoreNames.contains(PROFILE_LEDGER_STORE_USAGE_CALLS)) db.createObjectStore(PROFILE_LEDGER_STORE_USAGE_CALLS, { keyPath: "id" });
        if (!db.objectStoreNames.contains(PROFILE_LEDGER_STORE_INVOCATIONS)) db.createObjectStore(PROFILE_LEDGER_STORE_INVOCATIONS, { keyPath: "invocationId" });
        if (!db.objectStoreNames.contains(PROFILE_LEDGER_STORE_DAILY_ROLLUPS)) db.createObjectStore(PROFILE_LEDGER_STORE_DAILY_ROLLUPS, { keyPath: "date" });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("profile ledger IndexedDB open failed"));
    })
      .then(async (db) => {
        state.profileLedgerDb = db;
        const tx = db.transaction(
          [PROFILE_LEDGER_STORE_TURNS, PROFILE_LEDGER_STORE_USAGE_CALLS, PROFILE_LEDGER_STORE_INVOCATIONS],
          "readonly",
        );
        const stored = await Promise.all([
          profileLedgerRequest(tx.objectStore(PROFILE_LEDGER_STORE_TURNS).getAll()),
          profileLedgerRequest(tx.objectStore(PROFILE_LEDGER_STORE_USAGE_CALLS).getAll()),
          profileLedgerRequest(tx.objectStore(PROFILE_LEDGER_STORE_INVOCATIONS).getAll()),
        ]);
        const current = state.profileLedger || profileEmptyLedger();
        const turns = new Map(current.turns.map((turn) => [turn.turnId, turn]));
        for (const raw of stored[0]) {
          const turn = profileNormalizeTurn(raw);
          if (!turn) continue;
          const previous = turns.get(turn.turnId);
          if (!previous || String(turn.capturedAt) >= String(previous.capturedAt)) turns.set(turn.turnId, turn);
        }
        current.turns = Array.from(turns.values());
        for (const call of stored[1]) {
          const normalized = profileNormalizeUsageCall(call);
          if (normalized) current.usageCalls[normalized.id] = normalized;
        }
        for (const invocation of stored[2]) {
          const normalized = profileNormalizeLedgerInvocation(invocation);
          if (normalized) current.invocations[normalized.invocationId] = normalized;
        }
        profileLinkInvocationsToTurns(current);
        state.profileLedger = current;
        profileLedgerRebuildTurnIndex(current);
        profileLedgerRebuildRollup();
        await profileLedgerWriteSnapshot(db);
        saveProfileLedgerSnapshot();
        // Profile 库是异步加载的；加载完成后补一次 legacy 模型回填与 hydrate，
        // 否则迁移事实会一直显示为「未知」。
        if (state.usageFacts.size) {
          usageFactBackfillLegacyModels();
          usageFactHydrateLedger();
        }
        if (profileDataOverrideEnabledFor()) syncProfileUsageQueryCache();
        else scheduleProfileUsageRefresh(0);
        scheduleRender();
        return db;
      })
      .catch((error) => {
        state.profileLedgerStorage = "localStorage-fallback";
        state.profileLedgerDb = null;
        warnProfileLedgerWriteFailure(error);
        saveProfileLedgerSnapshot();
        return null;
      });
  }

  function warnProfileLedgerWriteFailure(error) {
    if (state.profileLedgerWriteWarned) return;
    state.profileLedgerWriteWarned = true;
    try {
      const detail = error?.name ? `${error.name}: ${error.message || ""}` : String(error || "unknown error");
      console.warn(`[codex-live-token-cost] profile ledger IndexedDB write degraded to localStorage: ${detail}`);
    } catch {
      // The console may be unavailable in sandboxed contexts.
    }
  }

  function profileLedgerQueueWrite(turn, calls = [], invocations = []) {
    if (state.profileLedgerStorage !== "indexeddb") return;
    state.profileLedgerWriteQueue = state.profileLedgerWriteQueue
      .then(
        () => (state.profileLedgerDbPromise || state.profileLedgerDb),
      )
      .then((db) => {
        if (!db || state.profileLedgerStorage !== "indexeddb") return null;
        const rollupDays = Object.entries(state.profileLedger?.rollup?.days || {}).map(([date, value]) => ({ date, ...value }));
        return new Promise((resolve, reject) => {
          const tx = db.transaction(
            [PROFILE_LEDGER_STORE_TURNS, PROFILE_LEDGER_STORE_USAGE_CALLS, PROFILE_LEDGER_STORE_INVOCATIONS, PROFILE_LEDGER_STORE_DAILY_ROLLUPS],
            "readwrite",
          );
          if (turn) tx.objectStore(PROFILE_LEDGER_STORE_TURNS).put(turn);
          calls.forEach((call) => tx.objectStore(PROFILE_LEDGER_STORE_USAGE_CALLS).put(call));
          invocations.forEach((invocation) => tx.objectStore(PROFILE_LEDGER_STORE_INVOCATIONS).put(invocation));
          rollupDays.forEach((day) => tx.objectStore(PROFILE_LEDGER_STORE_DAILY_ROLLUPS).put(day));
          tx.oncomplete = resolve;
          tx.onerror = () => reject(tx.error || new Error("profile ledger IndexedDB write failed"));
          tx.onabort = () => reject(tx.error || new Error("profile ledger IndexedDB write transaction aborted"));
        });
      })
      .catch((error) => {
        state.profileLedgerStorage = "localStorage-fallback";
        state.profileLedgerDb = null;
        warnProfileLedgerWriteFailure(error);
        saveProfileLedgerSnapshot();
      });
  }

  function profileLedgerQueueSnapshotWrite() {
    if (state.profileLedgerStorage !== "indexeddb") return;
    state.profileLedgerWriteQueue = state.profileLedgerWriteQueue
      .then(() => state.profileLedgerDbPromise || state.profileLedgerDb)
      .then((db) => {
        if (!db || state.profileLedgerStorage !== "indexeddb") return null;
        return profileLedgerWriteSnapshot(db);
      })
      .catch((error) => {
        state.profileLedgerStorage = "localStorage-fallback";
        state.profileLedgerDb = null;
        warnProfileLedgerWriteFailure(error);
        saveProfileLedgerSnapshot();
      });
  }

  function ensureProfileLedgerLoaded() {
    if (state.profileLedgerLoaded) return state.profileLedger;
    state.profileLedgerLoaded = true;
    const rawSnapshot = UTIL.loadJson(PROFILE_LEDGER_SNAPSHOT_KEY, null);
    state.profileLedger = profileNormalizeSnapshot(rawSnapshot);
    if (!state.profileLedgerMigrationChecked) {
      profileMigrateLegacyLedger(state.profileLedger);
      state.profileLedgerMigrationChecked = true;
    }
    profileLedgerRebuildTurnIndex(state.profileLedger);
    const hasLedgerDetails =
      state.profileLedger.turns.length > 0 ||
      Object.keys(state.profileLedger.usageCalls || {}).length > 0 ||
      Object.keys(state.profileLedger.invocations || {}).length > 0;
    const hasSnapshotRollup = rawSnapshot?.version === PROFILE_LEDGER_VERSION && rawSnapshot.rollup && typeof rawSnapshot.rollup === "object";
    if (hasLedgerDetails || !hasSnapshotRollup) profileLedgerRebuildRollup();
    saveProfileLedgerSnapshot();
    openProfileLedgerDatabase();
    return state.profileLedger;
  }

  // 事实层（usage facts）
  //
  // 口径：token_usage_record 是云端 Responses API usage 的本地逐响应副本，按
  // response_id 幂等入账；token_count 只是「用量 + rate limit」心跳，会重复，
  // 只能用于 rate limit 快照，或在该 turn 没有任何 record 时降级使用。
  //
  // 事实层是长期账本：IndexedDB 的 profileResponses 表按 response_id 存事实，
  // turns / dailyRollups 都是派生表。localStorage 只保留偏好、价格覆盖、schema
  // 指针和降级快照，不再是会计上限为 2000 条的主账本。

  function usageFactKey(responseId) {
    return UTIL.normalizeText(responseId, 200);
  }

  // Codex 旧版本 / 导入数据会把缺失模型写成英文 "unknown"；统一成本地未知模型，
  // 避免模型明细里同时出现 "unknown" 和 "未知" 两行。
  function usageModelLabel(value, fallback = UNKNOWN_MODEL) {
    const name = UTIL.normalizeText(value, 120);
    if (!name || name.toLowerCase() === "unknown" || name === UNKNOWN_MODEL) return fallback;
    return name;
  }

  // turn 的逐响应 id 列表：实时捕获 / 历史同步 / 导入三条来源之间最可靠的去重身份。
  function usageTurnResponseIdList(turn) {
    const raw = turn?.responseIds || turn?.response_ids;
    return Array.from(new Set((Array.isArray(raw) ? raw : []).map((id) => UTIL.normalizeText(id, 200)).filter(Boolean)));
  }

  // ---------------------------------------------------------------------------
  // 模块 08：逐响应事实层（usage facts）
  // 一条响应一条记录，responseId 为键。schema 变更必须同步升 USAGE_FACT_SCHEMA_VERSION。
  // 权威口径 = usageFactAuthoritativeRecords()（剔除被 superseded 的 legacy 聚合行）。
  // ---------------------------------------------------------------------------
  function usageFactNormalize(record) {
    if (!record || typeof record !== "object") return null;
    const responseId = usageFactKey(record.responseId || record.response_id);
    if (!responseId) return null;
    const usage = usageSyncRawUsageShape(record.usage);
    if (!usage) return null;
    return {
      responseId,
      threadId: UTIL.normalizeText(record.threadId || record.thread_id, 240),
      turnId: UTIL.normalizeText(record.turnId || record.turn_id, 240),
      rootTurnId: UTIL.normalizeText(record.rootTurnId || record.root_turn_id, 240),
      // 模型归到「每条响应」而不是「每轮」：一轮里换模型也能正确计费。
      model: usageModelLabel(record.model || record.model_name, ""),
      effort: normalizeReasoningEffort(record.effort || record.reasoningEffort || record.reasoning_effort),
      usage,
      turnCumulative: usageSyncRawUsageShape(record.turnCumulative || record.turn_token_usage),
      threadCumulative: usageSyncRawUsageShape(record.threadCumulative || record.thread_token_usage),
      observedAtMs: UTIL.toTimestampMs(record.observedAtMs || record.observedAt || record.observed_at) || 0,
      source: UTIL.normalizeText(record.source, 80) || "rollout_record",
      schemaVersion: USAGE_FACT_SCHEMA_VERSION,
    };
  }

  function usageFactMerge(existing, next) {
    if (!existing) return next;
    if (!next) return existing;
    // 同一 response_id 取字段更全的一条：累计字段不能被更薄的记录覆盖。
    const merged = { ...existing };
    for (const field of ["threadId", "turnId", "rootTurnId", "effort"]) {
      if (!merged[field] && next[field]) merged[field] = next[field];
    }
    // 模型：rollout 是云端事实，优先于实时通知里可能过期的当前模型。
    if (next.model && (!merged.model || next.source === "rollout_record")) merged.model = next.model;
    if (!merged.turnCumulative && next.turnCumulative) merged.turnCumulative = next.turnCumulative;
    if (!merged.threadCumulative && next.threadCumulative) merged.threadCumulative = next.threadCumulative;
    if (!merged.observedAtMs && next.observedAtMs) merged.observedAtMs = next.observedAtMs;
    // 身份：实时通知拿不到真实 turn_id 时用的是本地生成的 id；rollout 到了以后
    // 把它归到真实 turn，避免同一响应在账本里留下两条 turn 行。
    if (next.source === "rollout_record" && merged.source === "live_notification") {
      if (next.turnId) merged.turnId = next.turnId;
      if (next.threadId) merged.threadId = next.threadId;
      if (next.rootTurnId) merged.rootTurnId = next.rootTurnId;
      merged.source = next.source;
    }
    return merged;
  }

  function usageFactUpsert(record) {
    const normalized = usageFactNormalize(record);
    if (!normalized) return null;
    const key = normalized.responseId;
    const merged = usageFactMerge(state.usageFacts.get(key) || null, normalized);
    state.usageFacts.set(key, merged);
    return merged;
  }

  // 旧账本迁移出来的事实行是整轮聚合，不是逐响应记录；同一线程一旦有
  // rollout record，就必须让位，否则整轮聚合会叠加在逐响应明细之上。
  function usageFactSupersededIds() {
    const records = Array.from(state.usageFacts.values());
    const recordedThreads = new Set();
    for (const record of records) {
      if (record.source !== "legacy-migration" && record.threadId) recordedThreads.add(record.threadId);
    }
    const superseded = new Set();
    for (const record of records) {
      if (record.source === "legacy-migration" && record.threadId && recordedThreads.has(record.threadId)) {
        superseded.add(record.responseId);
      }
    }
    return superseded;
  }

  function usageFactAuthoritativeRecords() {
    const superseded = usageFactSupersededIds();
    const records = Array.from(state.usageFacts.values());
    return superseded.size ? records.filter((record) => !superseded.has(record.responseId)) : records;
  }

  function usageFactTotals() {
    let total = 0;
    let count = 0;
    for (const record of state.usageFacts.values()) {
      count += 1;
      total += UTIL.toCount(record.usage?.total_tokens);
    }
    return { count, total };
  }

  function usageFactAuthoritativeTotals() {
    let total = 0;
    let count = 0;
    for (const record of usageFactAuthoritativeRecords()) {
      count += 1;
      total += UTIL.toCount(record.usage?.total_tokens);
    }
    return { count, total };
  }

  // 旧账本迁移事实没带 model；从 Profile / 旧快照按 turnId 回填，
  // 避免 UI 留下没有意义的「未知」模型行。
  function usageFactLegacyModelIndex() {
    ensureProfileLedgerLoaded();
    const index = new Map();
    const add = (turns) => {
      for (const turn of Array.isArray(turns) ? turns : []) {
        const turnId = UTIL.normalizeText(turn?.turnId, 240);
        const model = usageModelLabel(turn?.model, "");
        if (!turnId || !model || index.has(turnId)) continue;
        index.set(turnId, { model, effort: normalizeReasoningEffort(turn?.effort) });
      }
    };
    add(state.profileLedger?.turns);
    try {
      add(UTIL.loadJson(LOCAL_USAGE_KEY, null)?.turns);
    } catch {
      // best effort
    }
    try {
      add(UTIL.loadJson(PROFILE_LEDGER_SNAPSHOT_KEY, null)?.turns);
    } catch {
      // best effort
    }
    return index;
  }

  function usageFactBackfillLegacyModels() {
    const index = usageFactLegacyModelIndex();
    if (!index.size) return { updated: 0 };
    const changed = [];
    for (const [responseId, record] of state.usageFacts) {
      if (record?.source !== "legacy-migration" || record.model) continue;
      const found = index.get(UTIL.normalizeText(record.turnId, 240));
      if (!found?.model) continue;
      const next = { ...record, model: found.model };
      if (found.effort && !next.effort) next.effort = found.effort;
      state.usageFacts.set(responseId, next);
      changed.push(next);
    }
    if (changed.length) void usageFactPersistResponses(changed).catch(() => {});
    return { updated: changed.length };
  }

  function usageFactTurnTotals(turnId) {
    let total = 0;
    let count = 0;
    let threadCumulative = null;
    for (const record of usageFactAuthoritativeRecords()) {
      if (record.turnId !== turnId) continue;
      count += 1;
      total += UTIL.toCount(record.usage?.total_tokens);
      if (record.threadCumulative) threadCumulative = record.threadCumulative;
    }
    return { count, total, threadCumulative };
  }

  function usageFactThreads() {
    const threads = new Map();
    for (const record of usageFactAuthoritativeRecords()) {
      if (!record.threadId) continue;
      const entry = threads.get(record.threadId) || {
        threadId: record.threadId,
        total: 0,
        responses: 0,
        expectedTotal: 0,
        counterSamples: [],
      };
      entry.total += UTIL.toCount(record.usage?.total_tokens);
      entry.responses += 1;
      if (record.threadCumulative) {
        const cumulative = UTIL.toCount(record.threadCumulative.total_tokens);
        entry.expectedTotal = Math.max(entry.expectedTotal, cumulative);
        if (cumulative > 0) entry.counterSamples.push({ at: UTIL.toCount(record.observedAtMs), cumulative });
      }
      threads.set(record.threadId, entry);
    }
    // 累计计数器会在新 epoch / 任务切换时重置；回落次数用来区分
    // 「真实少记」和「计数器重置」——后者不能算进真实差异。
    for (const entry of threads.values()) {
      const samples = (entry.counterSamples || []).sort((left, right) => left.at - right.at);
      let previous = 0;
      let resets = 0;
      for (const sample of samples) {
        if (sample.cumulative < previous) resets += 1;
        previous = sample.cumulative;
      }
      entry.counterResets = resets;
      delete entry.counterSamples;
    }
    // 降级 turn（只有 token_count、没有 record）的响应数单独记，
    // 用来算覆盖率：recorded / (recorded + fallback)。
    for (const [turnId, count] of state.usageFactFallbackTurns) {
      const threadId = UTIL.normalizeText(state.usageFactFallbackThreads.get(turnId), 240);
      if (!threadId) continue;
      const entry = threads.get(threadId) || { threadId, total: 0, responses: 0, expectedTotal: 0, counterResets: 0 };
      entry.fallback = (entry.fallback || 0) + UTIL.toCount(count);
      threads.set(threadId, entry);
    }
    return threads;
  }

  // 对账：sum(responses.usage.total) 对比 thread_token_usage / threads.tokens_used。
  // 累计计数器重置的线程单独标成 counter-reset，不混进真实差异。
  function usageFactReconcileReport() {
    const threads = usageFactThreads();
    const rows = [];
    for (const entry of threads.values()) {
      const delta = entry.expectedTotal ? entry.expectedTotal - entry.total : 0;
      const counterResets = UTIL.toCount(entry.counterResets);
      const fallback = UTIL.toCount(entry.fallback);
      // 覆盖率：有 record 的响应数 /（有 record + 只有 token_count 的降级响应数）。
      const estimated = entry.responses + fallback;
      const coverage = estimated ? Math.round((entry.responses / estimated) * 100) : 100;
      rows.push({
        threadId: entry.threadId,
        responses: entry.responses,
        fallbackResponses: fallback,
        estimatedResponses: estimated,
        coverage,
        actualTotal: entry.total,
        expectedTotal: entry.expectedTotal,
        delta,
        counterResets,
        status: !entry.expectedTotal ? "unknown" : delta === 0 ? "matched" : counterResets > 0 ? "counter-reset" : "diff",
      });
    }
    rows.sort((left, right) => Math.abs(right.delta) - Math.abs(left.delta) || left.threadId.localeCompare(right.threadId));
    state.usageFactReconcile = { threads: new Map(rows.map((row) => [row.threadId, row])), updatedAt: Date.now(), rows };
    return state.usageFactReconcile;
  }

  function usageFactReconcileSummary() {
    const report = state.usageFactReconcile?.rows || [];
    const matched = report.filter((row) => row.status === "matched").length;
    const diff = report.filter((row) => row.status === "diff").length;
    const counterReset = report.filter((row) => row.status === "counter-reset").length;
    const unknown = report.filter((row) => row.status === "unknown").length;
    const delta = report.filter((row) => row.status === "diff").reduce((sum, row) => sum + Math.abs(row.delta), 0);
    const counterResetDelta = report
      .filter((row) => row.status === "counter-reset")
      .reduce((sum, row) => sum + Math.abs(row.delta), 0);
    const estimated = report.reduce((sum, row) => sum + UTIL.toCount(row.estimatedResponses), 0);
    const recorded = report.reduce((sum, row) => sum + UTIL.toCount(row.responses), 0);
    const coverage = estimated ? Math.round((recorded / estimated) * 100) : 100;
    return {
      threads: report.length,
      matched,
      diff,
      counterReset,
      unknown,
      delta,
      counterResetDelta,
      coverage,
      recorded,
      estimated,
      updatedAt: state.usageFactReconcile?.updatedAt || 0,
    };
  }


  function usageFactStoreRequest(request) {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("usage fact IndexedDB request failed"));
    });
  }

  async function usageFactOpenDatabase() {
    if (!globalThis.indexedDB) return null;
    const request = globalThis.indexedDB.open(PROFILE_LEDGER_DB_NAME, PROFILE_LEDGER_DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(PROFILE_LEDGER_STORE_TURNS)) db.createObjectStore(PROFILE_LEDGER_STORE_TURNS, { keyPath: "turnId" });
      if (!db.objectStoreNames.contains(PROFILE_LEDGER_STORE_USAGE_CALLS)) db.createObjectStore(PROFILE_LEDGER_STORE_USAGE_CALLS, { keyPath: "id" });
      if (!db.objectStoreNames.contains(PROFILE_LEDGER_STORE_INVOCATIONS)) db.createObjectStore(PROFILE_LEDGER_STORE_INVOCATIONS, { keyPath: "invocationId" });
      if (!db.objectStoreNames.contains(PROFILE_LEDGER_STORE_DAILY_ROLLUPS)) db.createObjectStore(PROFILE_LEDGER_STORE_DAILY_ROLLUPS, { keyPath: "date" });
      if (!db.objectStoreNames.contains(PROFILE_LEDGER_STORE_RESPONSES)) db.createObjectStore(PROFILE_LEDGER_STORE_RESPONSES, { keyPath: "responseId" });
      if (!db.objectStoreNames.contains(PROFILE_LEDGER_STORE_RATE_LIMITS)) db.createObjectStore(PROFILE_LEDGER_STORE_RATE_LIMITS, { keyPath: "key" });
      if (!db.objectStoreNames.contains(PROFILE_LEDGER_STORE_OFFICIAL_SNAPSHOTS)) db.createObjectStore(PROFILE_LEDGER_STORE_OFFICIAL_SNAPSHOTS, { keyPath: "key" });
      if (!db.objectStoreNames.contains(PROFILE_LEDGER_STORE_META)) db.createObjectStore(PROFILE_LEDGER_STORE_META, { keyPath: "key" });
    };
    try {
      return await usageFactStoreRequest(request);
    } catch {
      return null;
    }
  }

  async function usageFactLoadResponses(db) {
    try {
      const tx = db.transaction(PROFILE_LEDGER_STORE_RESPONSES, "readonly");
      const rows = await usageFactStoreRequest(tx.objectStore(PROFILE_LEDGER_STORE_RESPONSES).getAll());
      for (const raw of rows || []) {
        const normalized = usageFactNormalize(raw);
        if (normalized) state.usageFacts.set(normalized.responseId, normalized);
      }
    } catch {
      // 读失败时保留内存中的事实，UI 侧会显示降级提示。
    }
  }

  async function usageFactLoadMeta(db) {
    try {
      const tx = db.transaction(PROFILE_LEDGER_STORE_META, "readonly");
      const rows = await usageFactStoreRequest(tx.objectStore(PROFILE_LEDGER_STORE_META).getAll());
      const meta = {};
      for (const row of rows || []) meta[UTIL.normalizeText(row?.key, 200)] = row?.value;
      state.usageFactMeta = meta;
    } catch {
      state.usageFactMeta = null;
    }
  }

  function usageFactMetaValue(key, fallback = null) {
    const value = state.usageFactMeta?.[key];
    return value === undefined || value === null ? fallback : value;
  }

  function usageFactSetMeta(key, value) {
    if (!state.usageFactMeta) state.usageFactMeta = {};
    state.usageFactMeta[key] = value;
  }

  // 多 tab/多窗口写入串行化：navigator.locks 可用时用它，否则退化为单进程写队列。
  function usageFactWithLock(name, task) {
    const locks = globalThis.navigator?.locks;
    if (locks && typeof locks.request === "function") {
      return locks.request(name, () => task());
    }
    state.usageFactWriteQueue = (state.usageFactWriteQueue || Promise.resolve()).then(task, task);
    return state.usageFactWriteQueue;
  }

  async function usageFactPersistResponses(records) {
    const items = (Array.isArray(records) ? records : []).map((record) => usageFactNormalize(record)).filter(Boolean);
    if (!items.length) return true;
    // 内存事实先落地，写入失败时 UI 仍有数据（但会标记降级）。
    for (const item of items) state.usageFacts.set(item.responseId, usageFactMerge(state.usageFacts.get(item.responseId) || null, item));
    const db = await usageFactOpenDatabase();
    if (!db) {
      state.usageFactDegraded = true;
      state.usageFactDegradedReason = "IndexedDB 不可用：逐响应事实只能保留在内存快照中";
      return false;
    }
    return usageFactWithLock("codex-live-token-cost-facts", async () => {
      try {
        const tx = db.transaction(PROFILE_LEDGER_STORE_RESPONSES, "readwrite");
        const store = tx.objectStore(PROFILE_LEDGER_STORE_RESPONSES);
        for (const item of items) store.put(item);
        await new Promise((resolve, reject) => {
          tx.oncomplete = resolve;
          tx.onerror = () => reject(tx.error || new Error("usage fact write failed"));
          tx.onabort = () => reject(tx.error || new Error("usage fact write aborted"));
        });
        state.usageFactDegraded = false;
        state.usageFactDegradedReason = "";
        // 有新事实落盘后排一次主机备份（8s 防抖）：不这么做，主机冷备就只能靠手动点按钮。
        usageFactScheduleHostBackup();
        return true;
      } catch (error) {
        state.usageFactDegraded = true;
        state.usageFactDegradedReason = `IndexedDB 写入失败：${(error && error.message) || error}`;
        return false;
      }
    });
  }

  async function usageFactPersistMeta(key, value) {
    const db = await usageFactOpenDatabase();
    if (!db) return false;
    try {
      const tx = db.transaction(PROFILE_LEDGER_STORE_META, "readwrite");
      tx.objectStore(PROFILE_LEDGER_STORE_META).put({ key, value });
      await new Promise((resolve, reject) => {
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error || new Error("usage fact meta write failed"));
        tx.onabort = () => reject(tx.error || new Error("usage fact meta write aborted"));
      });
      return true;
    } catch {
      return false;
    }
  }

  async function usageFactPersistRateLimit(entry) {
    if (!entry?.key) return false;
    const db = await usageFactOpenDatabase();
    if (!db) return false;
    try {
      const tx = db.transaction(PROFILE_LEDGER_STORE_RATE_LIMITS, "readwrite");
      tx.objectStore(PROFILE_LEDGER_STORE_RATE_LIMITS).put(entry);
      await new Promise((resolve, reject) => {
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error || new Error("rate limit write failed"));
        tx.onabort = () => reject(tx.error || new Error("rate limit write aborted"));
      });
      return true;
    } catch {
      return false;
    }
  }

  async function usageFactPersistOfficialSnapshot(entry) {
    if (!entry?.key) return false;
    const db = await usageFactOpenDatabase();
    if (!db) return false;
    try {
      const tx = db.transaction(PROFILE_LEDGER_STORE_OFFICIAL_SNAPSHOTS, "readwrite");
      tx.objectStore(PROFILE_LEDGER_STORE_OFFICIAL_SNAPSHOTS).put(entry);
      await new Promise((resolve, reject) => {
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error || new Error("official snapshot write failed"));
        tx.onabort = () => reject(tx.error || new Error("official snapshot write aborted"));
      });
      return true;
    } catch {
      return false;
    }
  }

  // 启动恢复顺序：IndexedDB → 主机快照 → localStorage 旧账本/profile ledger 迁移。
  async function ensureUsageFactsLoaded() {
    if (state.usageFactLoaded) return state.usageFacts;
    state.usageFactLoaded = true;
    const db = await usageFactOpenDatabase();
    if (db) {
      await usageFactLoadResponses(db);
      await usageFactLoadMeta(db);
    }
    if (!state.usageFacts.size) {
      // IDB 为空：先看主机快照，再迁移旧 localStorage / profile ledger。
      const restored = await usageFactRestoreFromHostBackup();
      if (!restored) await usageFactMigrateLegacy();
    }
    usageFactReconcileReport();
    return state.usageFacts;
  }

  // 迁移必须非破坏：先写新库、校验 count/total，再标记完成；校验失败不删旧数据。
  // 迁移差异报告：对比迁移前后的 turn 数 / record 数 / 总 tokens。
  // 方案验收表：「总量、turn 数、record 数与迁移前一致；差异有报告」。
  function usageFactMigrationDiff(legacyTurns, before, after, migrated) {
    const legacyTotal = (Array.isArray(legacyTurns) ? legacyTurns : []).reduce((sum, turn) => {
      const usage = normalizeUsage(turn?.usage);
      return sum + (usage.exact ? UTIL.toCount(usage.total) : 0);
    }, 0);
    const legacyCount = (Array.isArray(legacyTurns) ? legacyTurns : []).filter((turn) => normalizeUsage(turn?.usage).exact).length;
    const rows = [
      { metric: "turns", before: legacyCount, after: UTIL.toCount(after?.count), delta: UTIL.toCount(after?.count) - legacyCount },
      { metric: "responses", before: legacyCount, after: UTIL.toCount(after?.count), delta: 0 },
      { metric: "tokens", before: legacyTotal, after: UTIL.toCount(after?.total), delta: UTIL.toCount(after?.total) - legacyTotal },
    ];
    // 事实总数与旧 turn 数不是 1:1（旧 turn 可能有多个 call），所以只报总量与 turn 数。
    const mismatched = rows.filter((row) => row.metric !== "responses" && row.delta !== 0);
    return {
      migrated: UTIL.toCount(migrated),
      before: { turns: legacyCount, tokens: legacyTotal },
      after: { turns: UTIL.toCount(after?.count), tokens: UTIL.toCount(after?.total) },
      rows,
      mismatched: mismatched.length > 0,
      summary: `迁移：${legacyCount} 轮 / ${legacyTotal} tokens → ${UTIL.toCount(after?.count)} 条响应 / ${UTIL.toCount(after?.total)} tokens${mismatched.length ? ` · ${mismatched.length} 项有差异` : " · 一致"}`,
    };
  }

  // 旧 localStorage 快照：迁移完成前绝不删除；迁移后保留 30 天只读。
  // 存的是迁移那一刻的原文副本，用户可在 30 天内回退或人工核对。
  const USAGE_LEGACY_SNAPSHOT_KEY = "__codexLiveTokenCostLegacySnapshotV1";
  const USAGE_LEGACY_SNAPSHOT_DAYS = 30;

  function usageFactPreserveLegacySnapshot() {
    const raw = localStorage.getItem(LOCAL_USAGE_KEY);
    if (!raw) return null;
    try {
      const existing = UTIL.loadJson(USAGE_LEGACY_SNAPSHOT_KEY, null);
      if (existing && UTIL.toCount(existing.at)) return existing;
      const payload = { at: Date.now(), expiresAt: Date.now() + USAGE_LEGACY_SNAPSHOT_DAYS * 24 * 60 * 60 * 1000, data: raw };
      localStorage.setItem(USAGE_LEGACY_SNAPSHOT_KEY, JSON.stringify(payload));
      return payload;
    } catch {
      // 配额不足时保留原 localStorage 账本本身，不做二次复制。
      return null;
    }
  }

  // 只读保留窗口过后才允许清掉旧快照副本；原账本始终由用户自己控制。
  function usageFactPruneLegacySnapshot(options = {}) {
    const snapshot = UTIL.loadJson(USAGE_LEGACY_SNAPSHOT_KEY, null);
    if (!snapshot || !UTIL.toCount(snapshot.at)) return { pruned: false };
    const expiresAt = UTIL.toCount(snapshot.expiresAt) || (UTIL.toCount(snapshot.at) + USAGE_LEGACY_SNAPSHOT_DAYS * 24 * 60 * 60 * 1000);
    if (Date.now() < expiresAt) return { pruned: false, expiresAt };
    try {
      localStorage.removeItem(USAGE_LEGACY_SNAPSHOT_KEY);
      return { pruned: true, expiresAt };
    } catch {
      return { pruned: false, expiresAt };
    }
  }

  async function usageFactMigrateLegacy() {
    const meta = usageFactMetaValue(USAGE_FACT_MIGRATION_KEY, null);
    if (meta?.completed === true) return { skipped: true };
    const legacy = UTIL.loadJson(LOCAL_USAGE_KEY, null);
    // 旧 profile ledger（IndexedDB v2 的 turns）也是迁移来源之一。
    // 直接读原始快照，不走 ensureProfileLedgerLoaded：它会触发 profile 写入队列，
    // 与事实写入互相干扰。
    const legacyProfileTurns = (() => {
      try {
        const snapshot = UTIL.loadJson(PROFILE_LEDGER_SNAPSHOT_KEY, null);
        const turns = Array.isArray(snapshot?.turns) ? snapshot.turns : [];
        return turns.length ? turns : [];
      } catch {
        return [];
      }
    })();
    const candidates = [...(Array.isArray(legacy?.turns) ? legacy.turns : []), ...legacyProfileTurns];
    const migrated = [];
    for (const turn of candidates) {
      const usage = normalizeUsage(turn?.usage);
      if (!usage.exact) continue;
      const turnId = UTIL.normalizeText(turn?.turnId, 240);
      if (!turnId) continue;
      const source = UTIL.normalizeText(turn?.source, 80) || "legacy-migration";
      const calls = Array.isArray(turn?.calls) ? turn.calls : [];
      calls.forEach((call, index) => {
        const callUsage = normalizeUsage(call?.usage);
        if (!callUsage.exact) return;
        const responseId = `legacy:${turnId}:${index}:${usageKey(callUsage)}`;
        const record = usageFactNormalize({
          responseId,
          threadId: turnSessionKey(turn),
          turnId,
          model: turn?.model,
          effort: turn?.effort,
          usage: {
            input_tokens: UTIL.toCount(callUsage.input),
            cached_input_tokens: UTIL.toCount(callUsage.cached),
            output_tokens: UTIL.toCount(callUsage.output),
            total_tokens: UTIL.toCount(callUsage.total),
          },
          observedAtMs: UTIL.toTimestampMs(call?.observedAt) || UTIL.toTimestampMs(turn?.startedAt),
          source: "legacy-migration",
        });
        if (record) migrated.push(record);
      });
      if (!calls.length) {
        const record = usageFactNormalize({
          responseId: `legacy:${turnId}:0:${usageKey(usage)}`,
          threadId: turnSessionKey(turn),
          turnId,
          model: turn?.model,
          effort: turn?.effort,
          usage: {
            input_tokens: UTIL.toCount(usage.input),
            cached_input_tokens: UTIL.toCount(usage.cached),
            output_tokens: UTIL.toCount(usage.output),
            total_tokens: UTIL.toCount(usage.total),
          },
          observedAtMs: UTIL.toTimestampMs(turn?.startedAt),
          source: "legacy-migration",
        });
        if (record) migrated.push(record);
      }
    }
    if (!migrated.length) {
      usageFactSetMeta(USAGE_FACT_MIGRATION_KEY, { completed: true, count: 0, total: 0, at: Date.now() });
      await usageFactPersistMeta(USAGE_FACT_MIGRATION_KEY, usageFactMetaValue(USAGE_FACT_MIGRATION_KEY));
      return { migrated: 0 };
    }
    // 迁移前留一份只读旧快照：校验通过前不删任何旧数据。
    usageFactPreserveLegacySnapshot();
    const before = usageFactTotals();
    const written = await usageFactPersistResponses(migrated);
    if (!written) return { migrated: 0, failed: true };
    const after = usageFactTotals();
    // 校验 count/total 一致后才标记迁移完成；失败不删旧数据。
    const ok = after.count >= before.count + migrated.length && after.total >= before.total;
    if (!ok) {
      usageFactSetMeta(USAGE_FACT_MIGRATION_KEY, { completed: false, count: after.count, total: after.total, at: Date.now() });
      await usageFactPersistMeta(USAGE_FACT_MIGRATION_KEY, usageFactMetaValue(USAGE_FACT_MIGRATION_KEY));
      return { migrated: migrated.length, verified: false };
    }
    // 差异报告：迁移前后的 turn 数 / 总 tokens 对比，差异必须可见。
    const diff = usageFactMigrationDiff(candidates, before, after, migrated.length);
    usageFactSetMeta(USAGE_FACT_MIGRATION_KEY, { completed: true, count: after.count, total: after.total, at: Date.now(), diff });
    await usageFactPersistMeta(USAGE_FACT_MIGRATION_KEY, usageFactMetaValue(USAGE_FACT_MIGRATION_KEY));
    state.usageHostBackupStatus = diff.summary;
    // 迁移已验证：旧快照进入 30 天只读保留期。
    usageFactPreserveLegacySnapshot();
    return { migrated: migrated.length, verified: true, count: after.count, total: after.total, diff };
  }

  // 主机冷备 + 导出/导入
  //
  // 通过 app-server 的 fs/writeFile 写 ~/.codex/usage-ledger/：按天 NDJSON +
  // manifest.json + checksum。先写 .tmp，回读校验后再替换正式文件；失败保留旧文件。

  function usageFactChecksum(text) {
    // FNV-1a 32bit：足够做「写回读」一致性校验，且不引入外部依赖。
    let hash = 0x811c9dc5;
    const value = String(text || "");
    for (let index = 0; index < value.length; index += 1) {
      hash ^= value.charCodeAt(index);
      hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    return hash.toString(16).padStart(8, "0");
  }

  function usageFactEncodeBase64(text) {
    const bytes = new TextEncoder().encode(String(text || ""));
    let binary = "";
    const chunkSize = 0x8000;
    for (let index = 0; index < bytes.length; index += chunkSize) {
      binary += String.fromCharCode.apply(null, bytes.subarray(index, index + chunkSize));
    }
    return btoa(binary);
  }

  function usageFactDecodeBase64(value) {
    const binary = atob(String(value || ""));
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return new TextDecoder("utf-8").decode(bytes);
  }

  // ---------------------------------------------------------------------------
  // 模块 09：主机冷备 + 导出/导入
  // ~/.codex/usage-ledger/<date>.ndjson + manifest.json；写 .tmp → 回读校验 → copy。
  // 导出/备份一律走权威口径；导出优先 File System Access（可选位置），否则回退 <a download>。
  // ---------------------------------------------------------------------------
  function usageFactBackupDir(root) {
    return usageSyncJoinPath(root, USAGE_HOST_BACKUP_DIR);
  }

  function usageFactBackupRoot(client) {
    return usageSyncResolveCodexRoot(client);
  }

  function usageFactNdjson(records) {
    return records.map((record) => JSON.stringify(record)).join("\n") + (records.length ? "\n" : "");
  }

  function usageFactBackupPayload() {
    // 备份与面板口径必须一致：用权威记录（剔除被取代的 legacy 聚合），
    // 否则冷备里的条数/总量会大于界面显示，回灌后凭空多出数据。
    const records = usageFactAuthoritativeRecords();
    const byDay = new Map();
    for (const record of records) {
      const day = localDateKey(record.observedAtMs || Date.now()) || "unknown";
      const list = byDay.get(day) || [];
      list.push(record);
      byDay.set(day, list);
    }
    const days = Array.from(byDay.keys()).sort();
    return { records, byDay, days, totals: usageFactAuthoritativeTotals() };
  }

  async function usageFactHostWriteFile(client, path, text) {
    await hostRequest(client, "fs/writeFile", { path, dataBase64: usageFactEncodeBase64(text) }, { priority: "background", source: "plugin_usage_sync" });
  }

  async function usageFactHostReadFile(client, path) {
    const result = await hostRequest(client, "fs/readFile", { path }, { priority: "background", source: "plugin_usage_sync" });
    return typeof result?.dataBase64 === "string" ? usageFactDecodeBase64(result.dataBase64) : "";
  }

  // 主机备份：先写 .tmp -> 回读校验 checksum -> fs/copy 替换正式文件 -> 删除 .tmp。
  // 主机备份保留策略：超过保留期的分片归档为只读（改名 .archived），不直接删除。
  // 方案 §4.9 要求「旧快照至少保留 30 天只读」——不静默删唯一副本。
  async function usageFactPruneHostBackups(client, options = {}) {
    const root = UTIL.normalizeText(options && options.root, 600) || (await usageFactBackupRoot(client));
    if (!root) return { ok: false, reason: "no-root" };
    const dir = usageFactBackupDir(root);
    const retentionDays = Math.max(1, UTIL.toCount(options.retentionDays) || USAGE_HOST_BACKUP_RETENTION_DAYS);
    const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
    let entries = [];
    try {
      const response = await hostRequest(client, "fs/readDirectory", { path: dir }, { priority: "background", source: "plugin_usage_sync" });
      entries = Array.isArray(response?.entries) ? response.entries : [];
    } catch {
      return { ok: false, reason: "read-failed" };
    }
    const archived = [];
    for (const entry of entries) {
      const name = UTIL.normalizeText(entry?.fileName, 260);
      if (!name || !name.endsWith(".ndjson")) continue;
      const day = name.slice(0, -".ndjson".length);
      const stamp = Date.parse(`${day}T00:00:00.000Z`);
      if (!Number.isFinite(stamp) || stamp >= cutoff) continue;
      const source = usageSyncJoinPath(dir, name);
      const target = usageSyncJoinPath(dir, `${day}.ndjson.archived`);
      try {
        await hostRequest(client, "fs/copy", { sourcePath: source, destinationPath: target }, { priority: "background", source: "plugin_usage_sync" });
        await hostRequest(client, "fs/remove", { path: source, force: true }, { priority: "background", source: "plugin_usage_sync" });
        archived.push(day);
      } catch {
        // 归档失败就保留原文件：只读归档不是强制的，绝不因为清理失败丢数据。
      }
    }
    return { ok: true, archived, retentionDays };
  }

  async function usageFactBackupToHost(options = {}) {
    // 自动备份（防抖）失败时保持安静：不能因为一次没有本地通道就把状态行改成告警，
    // 否则用户每次同步都会看到一条与操作无关的失败提示。
    const quiet = options.quiet === true;
    const client = options.client || appServerSyncClient();
    if (!isAppServerSyncClient(client)) {
      if (!quiet) state.usageHostBackupStatus = "主机备份暂不可用（未找到 Codex 本地通道）";
      return { ok: false, reason: "no-client" };
    }
    const root = UTIL.normalizeText(options.root, 600) || (await usageFactBackupRoot(client));
    if (!root) {
      if (!quiet) state.usageHostBackupStatus = "主机备份暂不可用（未定位到本机 .codex 目录）";
      return { ok: false, reason: "no-root" };
    }
    const dir = usageFactBackupDir(root);
    const payload = usageFactBackupPayload();
    // 能力矩阵：备份路径上顺带探测只读方法（24h 缓存，绝不写文件、绝不跑命令）。
    void hostProbeCapabilities(client, { path: root });
    try {
      await hostRequest(client, "fs/createDirectory", { path: dir, recursive: true }, { priority: "background", source: "plugin_usage_sync" });
    } catch (error) {
      // 目录已存在时 createDirectory 会报错，继续即可；这类错误说明方法本身可用。
      hostCapabilityRecordExisting("fs/createDirectory", error);
    }
    const written = [];
    for (const day of payload.days) {
      const text = usageFactNdjson(payload.byDay.get(day));
      const finalPath = usageSyncJoinPath(dir, `${day}.ndjson`);
      const tmpPath = `${finalPath}.tmp`;
      await usageFactHostWriteFile(client, tmpPath, text);
      const readBack = await usageFactHostReadFile(client, tmpPath);
      if (usageFactChecksum(readBack) !== usageFactChecksum(text)) {
        state.usageHostBackupError = `分片校验失败：${day}.ndjson`;
        state.usageHostBackupStatus = state.usageHostBackupError;
        return { ok: false, reason: "checksum", day };
      }
      await hostRequest(client, "fs/copy", { sourcePath: tmpPath, destinationPath: finalPath }, { priority: "background", source: "plugin_usage_sync" });
      try {
        await hostRequest(client, "fs/remove", { path: tmpPath, force: true }, { priority: "background", source: "plugin_usage_sync" });
      } catch {
        // 临时文件清理失败不影响已替换的正式文件。
      }
      written.push(day);
    }
    const manifest = {
      schemaVersion: USAGE_HOST_BACKUP_SCHEMA_VERSION,
      generatedAt: Date.now(),
      count: payload.totals.count,
      total: payload.totals.total,
      days: written,
      checksums: Object.fromEntries(written.map((day) => [day, usageFactChecksum(usageFactNdjson(payload.byDay.get(day)))])),
      lastResponseId: payload.records.length ? payload.records[payload.records.length - 1].responseId : "",
    };
    const manifestText = JSON.stringify(manifest, null, 2);
    const manifestPath = usageSyncJoinPath(dir, USAGE_HOST_BACKUP_MANIFEST);
    const manifestTmp = `${manifestPath}.tmp`;
    await usageFactHostWriteFile(client, manifestTmp, manifestText);
    const manifestReadBack = await usageFactHostReadFile(client, manifestTmp);
    if (usageFactChecksum(manifestReadBack) !== usageFactChecksum(manifestText)) {
      state.usageHostBackupError = "manifest 校验失败";
      state.usageHostBackupStatus = state.usageHostBackupError;
      return { ok: false, reason: "checksum", day: "manifest" };
    }
    await hostRequest(client, "fs/copy", { sourcePath: manifestTmp, destinationPath: manifestPath }, { priority: "background", source: "plugin_usage_sync" });
    try {
      await hostRequest(client, "fs/remove", { path: manifestTmp, force: true }, { priority: "background", source: "plugin_usage_sync" });
    } catch {
      // 临时文件清理失败不影响已替换的正式文件。
    }
    state.usageHostBackupError = "";
    state.usageHostBackupAt = Date.now();
    state.usageHostBackupStatus = `已备份 ${written.length} 个分片 · ${payload.totals.count} 条响应 · ${payload.totals.total} tokens`;
    // 超过保留期的分片归档为只读，不直接删除。
    const pruned = await usageFactPruneHostBackups(client, { root });
    if (pruned.ok && pruned.archived.length) {
      state.usageHostBackupStatus += ` · ${pruned.archived.length} 个旧分片已归档为只读`;
    }
    usageFactSetMeta(USAGE_FACT_HOST_BACKUP_KEY, { at: state.usageHostBackupAt, count: payload.totals.count, total: payload.totals.total, days: written });
    await usageFactPersistMeta(USAGE_FACT_HOST_BACKUP_KEY, usageFactMetaValue(USAGE_FACT_HOST_BACKUP_KEY));
    return { ok: true, days: written, count: payload.totals.count, total: payload.totals.total };
  }

  function usageFactScheduleHostBackup() {
    if (state.usageHostBackupTimer) return;
    // 测试环境不排自动备份：每次持久化都挂一个 8s 定时器会让回归里到处是悬挂 timer。
    if (window.__CODEX_LIVE_TOKEN_COST_TEST__) return;
    state.usageHostBackupTimer = trackTimer(
      window.setTimeout(() => {
        state.usageHostBackupTimer = 0;
        // quiet：自动备份失败只影响冷备新鲜度，不改动用户主动触发的状态行。
        void usageFactBackupToHost({ quiet: true });
      }, USAGE_HOST_BACKUP_DEBOUNCE_MS),
    );
  }

  // IndexedDB 清空后从主机 manifest/分片恢复：按 response_id 合并，不整库覆盖。
  async function usageFactRestoreFromHostBackup(options = {}) {
    const client = options.client || appServerSyncClient();
    if (!isAppServerSyncClient(client)) return false;
    const root = UTIL.normalizeText(options.root, 600) || (await usageFactBackupRoot(client));
    if (!root) return false;
    const dir = usageFactBackupDir(root);
    let manifest = null;
    try {
      const text = await usageFactHostReadFile(client, usageSyncJoinPath(dir, USAGE_HOST_BACKUP_MANIFEST));
      manifest = JSON.parse(text);
    } catch {
      return false;
    }
    if (!manifest || manifest.schemaVersion !== USAGE_HOST_BACKUP_SCHEMA_VERSION) return false;
    const days = Array.isArray(manifest.days) ? manifest.days : [];
    const records = [];
    for (const day of days) {
      let text = "";
      try {
        text = await usageFactHostReadFile(client, usageSyncJoinPath(dir, `${day}.ndjson`));
      } catch {
        continue;
      }
      const expected = manifest.checksums?.[day];
      if (expected && usageFactChecksum(text) !== expected) {
        state.usageHostBackupError = `分片校验失败：${day}.ndjson`;
        return false;
      }
      for (const line of text.split(/\r?\n/)) {
        if (!line.trim()) continue;
        try {
          const record = usageFactNormalize(JSON.parse(line));
          if (record) records.push(record);
        } catch {
          // 跳过坏行，其余分片仍然可用。
        }
      }
    }
    if (!records.length) return false;
    for (const record of records) state.usageFacts.set(record.responseId, usageFactMerge(state.usageFacts.get(record.responseId) || null, record));
    await usageFactPersistResponses(records);
    usageFactReconcileReport();
    state.usageHostBackupError = "";
    return true;
  }

  // 导出：JSON / NDJSON，带 schemaVersion、responseId、checksum。
  function usageFactExport(format = "json") {
    // 与面板/备份同口径，避免导出条数与界面显示不一致。
    const records = usageFactAuthoritativeRecords();
    const totals = usageFactAuthoritativeTotals();
    if (format === "ndjson") {
      const lines = records.map((record) => JSON.stringify({ schemaVersion: USAGE_EXPORT_SCHEMA_VERSION, responseId: record.responseId, ...record }));
      const text = lines.join("\n") + (lines.length ? "\n" : "");
      return { format: "ndjson", schemaVersion: USAGE_EXPORT_SCHEMA_VERSION, text, count: totals.count, total: totals.total, checksum: usageFactChecksum(text) };
    }
    const payload = {
      schemaVersion: USAGE_EXPORT_SCHEMA_VERSION,
      generatedAt: Date.now(),
      count: totals.count,
      total: totals.total,
      responses: records,
    };
    const text = JSON.stringify(payload, null, 2);
    return { format: "json", schemaVersion: USAGE_EXPORT_SCHEMA_VERSION, text, count: totals.count, total: totals.total, checksum: usageFactChecksum(text) };
  }

  // 导入：按 response_id 合并，不整库覆盖。
  function usageFactImport(text) {
    const raw = String(text || "");
    if (!raw.trim()) return { imported: 0, skipped: 0 };
    const records = [];
    const trimmed = raw.trim();
    if (trimmed.startsWith("{")) {
      let payload = null;
      try {
        payload = JSON.parse(trimmed);
      } catch {
        return { imported: 0, skipped: 0, error: "invalid-json" };
      }
      const list = Array.isArray(payload) ? payload : Array.isArray(payload?.responses) ? payload.responses : [];
      for (const item of list) {
        const record = usageFactNormalize(item);
        if (record) records.push(record);
      }
    } else {
      for (const line of trimmed.split(/\r?\n/)) {
        if (!line.trim()) continue;
        try {
          const record = usageFactNormalize(JSON.parse(line));
          if (record) records.push(record);
        } catch {
          // 跳过坏行。
        }
      }
    }
    let imported = 0;
    for (const record of records) {
      if (state.usageFacts.has(record.responseId)) continue;
      state.usageFacts.set(record.responseId, record);
      imported += 1;
    }
    usageFactReconcileReport();
    // 持久化必须可被调用方等待：写入 IndexedDB 失败时要能反馈，不能静默吞掉。
    const persist = imported ? usageFactPersistResponses(records) : Promise.resolve(true);
    return { imported, skipped: records.length - imported, total: records.length, persist };
  }

  // 导出下载：JSON / NDJSON，带 schemaVersion 与 checksum。
  // 位置选择优先级：showSaveFilePicker（选到具体文件）→ showDirectoryPicker（选目录后按固定文件名写入）
  // → <a download>（浏览器下载目录）。Electron 渲染进程常常两个 picker 都没有，此时**不是失败**，
  // 只是位置由浏览器决定，状态行要说清楚，不要让用户以为导出坏了。
  function usageFactExportFileName(format) {
    return `codex-usage-ledger-${localDateKey(Date.now()) || "export"}.${format === "ndjson" ? "ndjson" : "json"}`;
  }

  function usageFactExportMime(format) {
    return format === "ndjson" ? "application/x-ndjson" : "application/json";
  }

  function usageFactExportCanceled(error) {
    // 只有 AbortError 是「用户取消」。NotAllowedError 等其他错误必须如实报错：
    // 把它当取消会让「策略禁止写入」伪装成「用户点了取消」。
    return Boolean(error && error.name === "AbortError");
  }

  async function usageFactSaveWithHandle(handle, text) {
    const writable = await handle.createWritable();
    try {
      await writable.write(text);
    } finally {
      await writable.close();
    }
  }

  async function usageFactDownloadExport(format = "json") {
    const normalized = format === "ndjson" ? "ndjson" : "json";
    const payload = usageFactExport(normalized);
    const name = usageFactExportFileName(normalized);
    const mime = usageFactExportMime(normalized);
    const base = { format: normalized, count: payload.count, total: payload.total, name };
    // 1) 选到具体文件：用户完全掌控路径与文件名。
    const savePicker = usageSaveFilePicker();
    if (savePicker) {
      try {
        const handle = await savePicker({
          suggestedName: name,
          types: [{ description: normalized === "ndjson" ? "NDJSON" : "JSON", accept: { [mime]: [`${normalized === "ndjson" ? ".ndjson" : ".json"}`] } }],
        });
        await usageFactSaveWithHandle(handle, payload.text);
        return { ...base, ok: true, method: "picker", name: UTIL.normalizeText(handle?.name, 240) || name };
      } catch (error) {
        if (usageFactExportCanceled(error)) return { ...base, ok: false, canceled: true, method: "picker" };
        // picker 存在但写入失败：不能静默回落到下载（用户会以为文件已存到选的位置）。
        return { ...base, ok: false, method: "picker", reason: (error && error.message) || String(error) };
      }
    }
    // 2) 只给选目录：写入用户挑的文件夹，文件名沿用统一规则。
    const dirPicker = usageSyncDirectoryPicker();
    if (dirPicker) {
      try {
        const dir = await dirPicker({ id: "codex-live-token-cost-export", mode: "readwrite" });
        const handle = await dir.getFileHandle(name, { create: true });
        await usageFactSaveWithHandle(handle, payload.text);
        return { ...base, ok: true, method: "directory", dir: UTIL.normalizeText(dir?.name, 240) };
      } catch (error) {
        if (usageFactExportCanceled(error)) return { ...base, ok: false, canceled: true, method: "directory" };
        return { ...base, ok: false, method: "directory", reason: (error && error.message) || String(error) };
      }
    }
    // 3) 宿主没开放选择器：走浏览器下载，位置由宿主决定。
    try {
      const blob = new Blob([payload.text], { type: mime });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = name;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      return { ...base, ok: true, method: "download" };
    } catch (error) {
      return { ...base, ok: false, method: "download", reason: (error && error.message) || String(error) };
    }
  }

  // 导入：用户上传 JSON/NDJSON 文件，按 response_id 合并，不整库覆盖。
  // 走隐藏的 <input type="file">：宿主是 Electron，File API 可用。
  function usageFactImportFile() {
    return new Promise((resolve) => {
      try {
        const input = document.createElement("input");
        input.type = "file";
        input.accept = ".json,.ndjson,application/json,application/x-ndjson,text/plain";
        input.style.display = "none";
        // 用户取消文件选择框时不会有 change 事件：必须监听 cancel，
        // 否则 Promise 永远挂起，设置面板也拿不到任何反馈。
        const finish = (result) => {
          input.remove?.();
          resolve(result);
        };
        input.addEventListener("cancel", () => finish({ imported: 0, skipped: 0, canceled: true }));
        input.addEventListener("change", () => {
          const file = input.files && input.files[0];
          if (!file) {
            finish({ imported: 0, skipped: 0, canceled: true });
            return;
          }
          const reader = new FileReader();
          reader.onload = async () => {
            const result = usageFactImport(String(reader.result || ""));
            // 无论写入成败都必须走到 finish：这里再抛一次，Promise 又会永久挂起。
            let persisted = true;
            try {
              persisted = (await result.persist) !== false;
            } catch {
              persisted = false;
            }
            usageFactHydrateLedger();
            rebuildAnalyticsRollup();
            scheduleRender();
            const failed = result.error || persisted === false;
            // 导入是本地账本动作：反馈落到与导出/重建同一条状态行，主机备份行留给备份。
            state.usageLedgerError = failed ? "导入后写入本地库失败：数据仅存在于本次会话内存中" : "";
            state.usageLedgerStatus = failed
              ? `导入 ${result.imported} 条响应（跳过 ${result.skipped} 条重复），但写入本地库失败`
              : `已导入 ${result.imported} 条响应（跳过 ${result.skipped} 条重复）`;
            finish({ ...result, persist: undefined, persisted });
          };
          reader.onerror = () => finish({ imported: 0, skipped: 0, error: "read-failed" });
          reader.readAsText(file);
        });
        (document.body || document.documentElement)?.appendChild?.(input);
        input.click();
      } catch (error) {
        resolve({ imported: 0, skipped: 0, error: (error && error.message) || "import-failed" });
      }
    });
  }

  // 由事实派生 turn 行：同一 shape as usageSyncFinalizeTurnRow，供主统计/HUD 使用。
  // 模型按「该轮出现最多的模型」归属；没有模型时统一显示 UNKNOWN_MODEL。
  // ---------------------------------------------------------------------------
  // 模块 10：事实 → turn 投影
  // usageFactHydrateLedger() 用 responseId 并集重算 localLedger；不写 IndexedDB，只重算内存投影。
  // ---------------------------------------------------------------------------
  function usageFactTurnsFromFacts() {
    const byTurn = new Map();
    for (const record of usageFactAuthoritativeRecords()) {
      const turnId = UTIL.normalizeText(record.turnId, 240) || `${UTIL.normalizeText(record.threadId, 240)}:orphan`;
      let entry = byTurn.get(turnId);
      if (!entry) {
        entry = {
          turnId,
          threadId: UTIL.normalizeText(record.threadId, 240),
          usage: { input_tokens: 0, cached_input_tokens: 0, cache_write_input_tokens: 0, output_tokens: 0, reasoning_output_tokens: 0, total_tokens: 0 },
          calls: [],
          responseIds: [],
          modelCounts: new Map(),
          effortCounts: new Map(),
          startedAtMs: record.observedAtMs || 0,
          finishedAtMs: record.observedAtMs || 0,
        };
        byTurn.set(turnId, entry);
      }
      usageSyncSumRawUsage(entry.usage, record.usage);
      entry.responseIds.push(record.responseId);
      entry.calls.push({ usage: record.usage, observedAt: usageSyncIsoOrNull(record.observedAtMs) || undefined });
      if (record.model) entry.modelCounts.set(record.model, (entry.modelCounts.get(record.model) || 0) + 1);
      if (record.effort) entry.effortCounts.set(record.effort, (entry.effortCounts.get(record.effort) || 0) + 1);
      if (record.observedAtMs) {
        entry.startedAtMs = entry.startedAtMs ? Math.min(entry.startedAtMs, record.observedAtMs) : record.observedAtMs;
        entry.finishedAtMs = Math.max(entry.finishedAtMs || 0, record.observedAtMs);
      }
    }
    const mostCommon = (counts) => {
      let winner = "";
      let best = 0;
      for (const [value, count] of counts) {
        if (count > best) {
          best = count;
          winner = value;
        }
      }
      return winner;
    };
    const rows = [];
    for (const entry of byTurn.values()) {
      const threadKey = entry.threadId ? `local:${entry.threadId}` : "";
      if (!threadKey) continue;
      const model = mostCommon(entry.modelCounts);
      const effort = mostCommon(entry.effortCounts);
      rows.push({
        turnId: entry.turnId,
        sessionKey: threadKey,
        threadKey,
        threadAttributionStatus: "reliable",
        model: model || UNKNOWN_MODEL,
        ...(effort ? { effort } : {}),
        createdAt: usageSyncIsoOrNull(entry.startedAtMs) || new Date(0).toISOString(),
        startedAt: usageSyncIsoOrNull(entry.startedAtMs) || new Date(0).toISOString(),
        finishedAt: usageSyncIsoOrNull(entry.finishedAtMs) || usageSyncIsoOrNull(entry.startedAtMs) || new Date(0).toISOString(),
        durationMs: Math.max(0, (entry.finishedAtMs || 0) - (entry.startedAtMs || 0)),
        callCount: entry.calls.length,
        usage: normalizeUsage(entry.usage),
        calls: entry.calls,
        responseIds: entry.responseIds,
        usageSource: "token_usage_record",
        source: USAGE_SYNC_SOURCE,
        importSource: USAGE_SYNC_SOURCE,
      });
    }
    rows.sort((left, right) => String(left.startedAt).localeCompare(String(right.startedAt)) || left.turnId.localeCompare(right.turnId));
    return rows;
  }

  // 用事实层重算一组 response_id 的用量；任何一个 id 没有事实就返回 null，
  // 调用方据此保留原有 usage，绝不静默丢数据。
  function usageFactAggregateForIds(responseIds) {
    const superseded = usageFactSupersededIds();
    const ids = (Array.isArray(responseIds) ? responseIds : []).filter((responseId) => !superseded.has(responseId));
    if (!ids.length) return null;
    const usage = { input_tokens: 0, cached_input_tokens: 0, cache_write_input_tokens: 0, output_tokens: 0, reasoning_output_tokens: 0, total_tokens: 0 };
    const calls = [];
    let startedAtMs = 0;
    let finishedAtMs = 0;
    for (const responseId of ids) {
      const record = state.usageFacts.get(responseId);
      if (!record) return null;
      usageSyncSumRawUsage(usage, record.usage);
      calls.push({ usage: record.usage, observedAt: usageSyncIsoOrNull(record.observedAtMs) || undefined });
      if (record.observedAtMs) {
        startedAtMs = startedAtMs ? Math.min(startedAtMs, record.observedAtMs) : record.observedAtMs;
        finishedAtMs = Math.max(finishedAtMs, record.observedAtMs);
      }
    }
    return { usage: normalizeUsage(usage), calls, callCount: calls.length, startedAtMs, finishedAtMs };
  }

  // 事实层 -> 主账本：IndexedDB 是事实源，localStorage 只是 UI 快照。
  // 匹配顺序：turnId -> response_id。实时 turn 的本地 id 与 rollout 的真实 id 不同，
  // 只按 turnId 匹配会为同一份响应再加一行（重复计数）。
  // 最后再按 response_id 做一次全局去重：同一响应只允许属于一条账本行。
  function usageFactHydrateLedger() {
    if (!state.usageFacts.size) return 0;
    if (Array.from(state.usageFacts.values()).some((record) => record.source === "legacy-migration" && !record.model)) {
      usageFactBackfillLegacyModels();
    }
    const rows = usageFactTurnsFromFacts();
    if (!rows.length) return 0;
    const superseded = usageFactSupersededIds();
    if (superseded.size) {
      state.localLedger = state.localLedger.filter((turn) => {
        const ids = usageTurnResponseIdList(turn);
        return !ids.length || ids.some((responseId) => !superseded.has(responseId));
      });
    }
    const byId = new Map();
    const byResponse = new Map();
    for (const turn of state.localLedger) {
      const turnId = UTIL.normalizeText(turn?.turnId, 240);
      if (turnId) byId.set(turnId, turn);
      for (const responseId of usageTurnResponseIdList(turn)) if (!byResponse.has(responseId)) byResponse.set(responseId, turn);
    }
    let replaced = 0;
    for (const row of rows) {
      let existing = byId.get(row.turnId);
      if (!existing) {
        for (const responseId of row.responseIds || []) {
          const candidate = byResponse.get(responseId);
          if (candidate) {
            existing = candidate;
            break;
          }
        }
      }
      if (!existing) {
        byId.set(row.turnId, row);
        for (const responseId of row.responseIds || []) byResponse.set(responseId, row);
        continue;
      }
      // 用「已有行 + 事实行」的 response_id 并集重算，避免同一响应被两行各算一次。
      const ids = Array.from(new Set([...usageTurnResponseIdList(existing), ...(row.responseIds || [])]));
      const aggregate = usageFactAggregateForIds(ids);
      existing.responseIds = ids;
      if (aggregate) {
        existing.usage = aggregate.usage;
        existing.calls = aggregate.calls;
        existing.callCount = aggregate.callCount;
        if (aggregate.startedAtMs) existing.startedAt = usageSyncIsoOrNull(aggregate.startedAtMs) || existing.startedAt;
        if (aggregate.finishedAtMs) existing.finishedAt = usageSyncIsoOrNull(aggregate.finishedAtMs) || existing.finishedAt;
        // 只有全部响应都有事实时才升级口径；部分命中时保留原来源标签。
        existing.usageSource = row.usageSource;
      }
      // 事实里的真实模型优先；未知不覆盖已知。
      if (row.model && row.model !== UNKNOWN_MODEL) existing.model = row.model;
      if (row.effort && !existing.effort) existing.effort = row.effort;
      if (!existing.startedAt || String(existing.startedAt) > String(row.startedAt)) existing.startedAt = row.startedAt;
      if (!existing.createdAt || String(existing.createdAt) > String(row.createdAt)) existing.createdAt = row.createdAt;
      byId.set(row.turnId, existing);
      const existingId = UTIL.normalizeText(existing.turnId, 240);
      if (existingId) byId.set(existingId, existing);
      for (const responseId of ids) byResponse.set(responseId, existing);
      replaced += 1;
    }
    // 全局去重：按 response_id 数量从多到少认领，较薄的行只保留未被认领的响应。
    const unique = Array.from(new Set(byId.values()));
    const claimed = new Set();
    const kept = [];
    for (const turn of unique.sort((left, right) => usageTurnResponseIdList(right).length - usageTurnResponseIdList(left).length || String(left.turnId || "").localeCompare(String(right.turnId || "")))) {
      const ids = usageTurnResponseIdList(turn);
      if (!ids.length) {
        kept.push(turn);
        continue;
      }
      const remaining = ids.filter((responseId) => !claimed.has(responseId));
      if (!remaining.length) {
        replaced += 1;
        continue;
      }
      if (remaining.length !== ids.length) {
        const aggregate = usageFactAggregateForIds(remaining);
        if (aggregate) {
          turn.responseIds = remaining;
          turn.usage = aggregate.usage;
          turn.calls = aggregate.calls;
          turn.callCount = aggregate.callCount;
          replaced += 1;
        }
      }
      for (const responseId of remaining) claimed.add(responseId);
      kept.push(turn);
    }
    const merged = kept.sort(
      (left, right) => String(left.createdAt || left.startedAt || "").localeCompare(String(right.createdAt || right.startedAt || "")) || String(left.turnId || "").localeCompare(String(right.turnId || "")),
    );
    state.localLedger = merged;
    state.localLast = merged[merged.length - 1] || state.localLast;
    invalidateLocalUsageCache();
    return replaced;
  }

  // 「重建统计」：把逐响应事实重新投影成 turn 行，再重算派生视图与对账。
  // 只重算 rollup 而不重算 localLedger 是名不符实的（旧实现），必须走 hydrate。
  function usageFactRebuild() {
    const before = usageFactAuthoritativeTotals();
    const replaced = usageFactHydrateLedger();
    usageFactReconcileReport();
    const rolled = rebuildAnalyticsRollup();
    const after = usageFactAuthoritativeTotals();
    const reconcile = usageFactReconcileSummary();
    return {
      count: after.count,
      total: after.total,
      before,
      after,
      replaced,
      rolled,
      reconcile,
    };
  }

  function profileRollupDay(rollup, date) {
    const day = (rollup.days[date] ||= {
      date,
      local: profileEmptyBucket(),
      tokens: 0,
      input: 0,
      output: 0,
      cached: 0,
      cost: 0,
      requests: 0,
      totalTurns: 0,
      maxCompletedDurationMs: 0,
      maxObservedDurationMs: 0,
      fastModeTokens: 0,
      totalTokens: 0,
      fastModeTurns: 0,
      reasoningEffort: {},
      invocationCounts: {},
    });
    return day;
  }

  function profileAddBucket(bucket, turn, usage, cost) {
    bucket.input += UTIL.toCount(usage.input);
    bucket.output += UTIL.toCount(usage.output);
    bucket.cached += UTIL.toCount(usage.cached);
    bucket.total += UTIL.toCount(usage.total || usage.input + usage.output);
    bucket.cost += Number(cost) || 0;
    bucket.requests += UTIL.toCount(turn.callCount) || 1;
    bucket.turns += 1;
  }

  function profileDisplayedBucket(day) {
    const local = day?.local || profileEmptyBucket();
    return {
      date: day?.date || "",
      tokens: UTIL.toCount(local?.total),
      input: UTIL.toCount(local?.input),
      output: UTIL.toCount(local?.output),
      cached: UTIL.toCount(local?.cached),
      requests: UTIL.toCount(local?.requests),
      cost: Number(local?.cost) || 0,
    };
  }

  function profileInvocationOutput(item, count) {
    const invocation = normalizeProfileInvocation(item);
    return invocation ? { ...invocation, usage_count: count } : null;
  }

  function profileActivityStats(activity, options = {}) {
    const source = activity || profileEmptyRollup().activity;
    const effortEntries = Object.entries(source.effortCounts || {})
      .filter(([effort, count]) => effort && UTIL.toCount(count) > 0)
      .sort((left, right) => UTIL.toCount(right[1]) - UTIL.toCount(left[1]) || left[0].localeCompare(right[0]));
    const invocationEntries = Object.entries(source.invocationCounts || {})
      .map(([key, item]) => profileInvocationOutput(item.invocation, item.count))
      .filter(Boolean)
      .sort((left, right) => right.usage_count - left.usage_count || profileInvocationKey(left).localeCompare(profileInvocationKey(right)));
    const topEffort = effortEntries[0];
    const skillItems = invocationEntries.filter((item) => item.type === "skill");
    const pluginItems = invocationEntries.filter((item) => item.type === "plugin");
    const totalEffort = effortEntries.reduce((sum, item) => sum + UTIL.toCount(item[1]), 0);
    const stats = {
      fastModePercent: source.totalTokens ? Math.round((source.fastModeTokens / source.totalTokens) * 100) : null,
      fastModeCount: UTIL.toCount(source.fastModeTokens),
      fastModeTotal: UTIL.toCount(source.totalTokens),
      longestRunningTurnSec: Math.round(UTIL.toCount(source.longestRunningDurationMs ?? source.longestCompletedDurationMs) / 1000),
      reasoningEffort: topEffort?.[0] || null,
      reasoningEffortPercent: totalEffort && topEffort ? Math.round((UTIL.toCount(topEffort[1]) / totalEffort) * 100) : null,
      uniqueSkillsUsed: new Set(skillItems.map((item) => item.skill_id || item.skill_name).filter(Boolean)).size,
      totalSkillsUsed: skillItems.reduce((sum, item) => sum + UTIL.toCount(item.usage_count), 0),
      uniquePluginsUsed: new Set(pluginItems.map((item) => item.plugin_id || item.plugin_name).filter(Boolean)).size,
      totalPluginsUsed: pluginItems.reduce((sum, item) => sum + UTIL.toCount(item.usage_count), 0),
      topInvocations: invocationEntries.slice(0, 5),
      topPlugins: pluginItems.slice(0, 5),
    };
    if (!options.includeLedgerFields) return stats;
    return {
      ...stats,
      fastModeTurns: UTIL.toCount(source.fastModeTurns),
      totalTurns: UTIL.toCount(source.totalTurns),
      longestCompletedTurnSec: Math.round(UTIL.toCount(source.longestCompletedDurationMs) / 1000),
      longestObservedTurnSec: Math.round(UTIL.toCount(source.longestObservedDurationMs) / 1000),
    };
  }

  function profileLedgerActivity() {
    return profileActivityStats(state.profileLedger?.rollup?.activity, { includeLedgerFields: true });
  }

  function profileLedgerDailyDays() {
    ensureProfileLedgerLoaded();
    return Object.values(state.profileLedger.rollup?.days || {})
      .map(profileDisplayedBucket)
      .filter((day) => day.date)
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  function profileLedgerRebuildRollup() {
    const ledger = state.profileLedger || profileEmptyLedger();
    const rollup = profileEmptyRollup();
    const threadKeys = new Set();
    for (const turn of ledger.turns) {
      const usage = normalizeUsage(turn?.usage);
      const date = localDateKey(turnTimestampMs(turn));
      if (!date) continue;
      const day = profileRollupDay(rollup, date);
      const durationMs = Math.max(0, UTIL.toCount(turn.durationMs));
      day.maxObservedDurationMs = Math.max(day.maxObservedDurationMs, durationMs);
      day.maxCompletedDurationMs = Math.max(day.maxCompletedDurationMs, turn.durationStatus === "completed" ? durationMs : 0);
      if (turn.threadAttributionStatus === "reliable" && turn.threadKey && !isTransientSessionKey(turn.threadKey)) threadKeys.add(turn.threadKey);
      rollup.activity.longestObservedDurationMs = Math.max(rollup.activity.longestObservedDurationMs, durationMs);
      if (turn.durationStatus === "completed") rollup.activity.longestCompletedDurationMs = Math.max(rollup.activity.longestCompletedDurationMs, durationMs);
      if (!usage.exact || !UTIL.toCount(usage.total || usage.input + usage.output)) continue;
      const cost = turnCost(turn, turn.model).value;
      profileAddBucket(day.local, turn, usage, cost);
      day.totalTurns += 1;
      day.totalTokens += UTIL.toCount(usage.total || usage.input + usage.output);
      if (turn.fastMode === true) {
        day.fastModeTokens += UTIL.toCount(usage.total || usage.input + usage.output);
        day.fastModeTurns += 1;
      }
      const effort = normalizeReasoningEffort(turn.effort);
      if (effort) day.reasoningEffort[effort] = UTIL.toCount(day.reasoningEffort[effort]) + 1;
      if (turn.threadAttributionStatus === "reliable" && turn.threadKey && !isTransientSessionKey(turn.threadKey)) threadKeys.add(turn.threadKey);
      const invocationIds = Array.isArray(turn.invocationIds) ? turn.invocationIds : [];
      for (const invocationId of invocationIds) {
        const invocation = ledger.invocations[invocationId];
        if (!invocation) continue;
        const key = profileInvocationKey(invocation);
        const current = rollup.activity.invocationCounts[key] || { invocation: normalizeProfileInvocation(invocation), count: 0 };
        current.count += UTIL.toCount(invocation.occurrence) || 1;
        rollup.activity.invocationCounts[key] = current;
        const dayCurrent = day.invocationCounts[key] || { invocation: normalizeProfileInvocation(invocation), count: 0 };
        dayCurrent.count += UTIL.toCount(invocation.occurrence) || 1;
        day.invocationCounts[key] = dayCurrent;
      }
      if (effort) rollup.activity.effortCounts[effort] = UTIL.toCount(rollup.activity.effortCounts[effort]) + 1;
      rollup.activity.totalTurns += 1;
      rollup.activity.totalTokens += UTIL.toCount(usage.total || usage.input + usage.output);
      if (turn.fastMode === true) {
        rollup.activity.fastModeTokens += UTIL.toCount(usage.total || usage.input + usage.output);
        rollup.activity.fastModeTurns += 1;
      }
    }
    for (const day of Object.values(rollup.days)) {
      const displayed = profileDisplayedBucket(day);
      Object.assign(day, displayed);
    }
    rollup.threadKeys = Array.from(threadKeys).sort();
    rollup.updatedAt = Date.now();
    ledger.rollup = rollup;
    return rollup;
  }

  function profileLedgerUpsertTurn(turn, options = {}) {
    const ledger = ensureProfileLedgerLoaded();
    const normalized = profileNormalizeTurn(turn);
    if (!normalized) return null;
    const index = profileLedgerTurnIndex(ledger).get(normalized.turnId);
    const existing = index === undefined ? null : ledger.turns[index];
    const merged = mergeProfileTurn(existing, normalized);
    merged.invocationIds = Array.from(new Set([...(existing?.invocationIds || []), ...(normalized.invocationIds || [])]));
    if (index !== undefined) ledger.turns[index] = merged;
    else profileLedgerTurnIndex(ledger).set(merged.turnId, ledger.turns.push(merged) - 1);
    if (!options.deferRollup) profileLedgerRebuildRollup();
    if (!options.deferSnapshot) saveProfileLedgerSnapshot();
    if (!options.deferWrite) profileLedgerQueueWrite(merged, options.calls, options.invocations);
    return merged;
  }

  function profileLedgerObserveLocalTurn(turn, context = {}, options = {}) {
    if (!turn) return false;
    const ledger = ensureProfileLedgerLoaded();
    const now = UTIL.toTimestampMs(options.observedAt) || Date.now();
    const metric = localTurnMetric(turn, now);
    const metricBase = metric || {
      turnId: turn.id,
      sessionKey: turn.sessionKey,
      threadKey: turn.threadKey || turn.sessionKey,
      source: "codex-live-token-cost",
      model: modelName(),
      effort: context.effort || turn.context?.effort || activeModelInfo().effort,
      fastMode: typeof context.fastMode === "boolean" ? context.fastMode : turn.context?.fastMode,
      startedAt: new Date(UTIL.toTimestampMs(turn.startedAt) || now).toISOString(),
      observedAt: now,
      usage: null,
    };
    const previousIndex = profileLedgerTurnIndex(ledger).get(metricBase.turnId);
    const previous = previousIndex === undefined ? null : ledger.turns[previousIndex];
    const durationStatus = options.durationStatus === "completed" ? "completed" : options.durationStatus === "recovered" ? "recovered" : "incomplete";
    const startedAt = UTIL.toTimestampMs(metricBase.startedAt) || now;
    const completedAtMs = durationStatus === "completed" ? UTIL.toTimestampMs(turn.officialTiming?.completedAtMs || options.completedAt) || now : 0;
    const threadCandidate = UTIL.normalizeText(options.threadKey || metricBase.threadKey, 240);
    const profileThreadKey = options.threadAttributionStatus === "reliable" && !isTransientSessionKey(threadCandidate) ? threadCandidate : "";
    const profileTurn = profileNormalizeTurn({
      ...metricBase,
      threadKey: profileThreadKey,
      threadAttributionStatus: profileThreadKey ? "reliable" : "unknown",
      startedAt,
      completedAt: completedAtMs,
      durationMs: durationStatus === "completed" ? normalizedDurationMs(turn.officialTiming || {}, startedAt, completedAtMs) || Math.max(0, completedAtMs - startedAt) : Math.max(0, now - startedAt),
      durationStatus,
      capturedAt: now,
      persistReason: options.reason || "observed",
      effort: context.effort || metricBase.effort,
      fastMode: typeof context.fastMode === "boolean" ? context.fastMode : metricBase.fastMode,
      usage: metricBase.usage,
      invocations: [],
      invocationIds: previous?.invocationIds || [],
    });
    if (!profileTurn) return false;
    const calls = [];
    const callInputs = Array.isArray(options.calls) ? options.calls : Array.isArray(turn.calls) ? turn.calls : [];
    for (const call of callInputs) {
      const usage = normalizeUsage(call?.usage);
      if (!usage.exact) continue;
      const canonicalUsageKey = usageKey(usage);
      const id = `${metricBase.turnId}\u0001${canonicalUsageKey}`;
      if (ledger.usageCalls[id]) continue;
      const record = { id, turnId: metricBase.turnId, usageKey: canonicalUsageKey, usage, observedAt: now, source: UTIL.normalizeText(call?.source, 80) || metricBase.source };
      ledger.usageCalls[id] = record;
      calls.push(record);
    }
    const turnCalls = Object.values(ledger.usageCalls).filter((call) => call.turnId === metricBase.turnId);
    profileTurn.usage = turnCalls.length
      ? turnCalls.reduce((sum, call) => addUsage(sum, call.usage), { input: 0, output: 0, cached: 0, total: 0, exact: true })
      : metricBase.usage;
    profileTurn.callCount = turnCalls.length || UTIL.toCount(metricBase.callCount) || (profileTurn.usage ? 1 : 0);
    const invocations = [];
    const seenInvocationIds = new Set(profileTurn.invocationIds || []);
    const invocationInputs = Array.isArray(options.invocations) ? options.invocations : Array.isArray(metricBase.invocations) ? metricBase.invocations : [];
    invocationInputs.forEach((rawInvocation, index) => {
      const invocation = normalizeProfileInvocation(rawInvocation);
      if (!invocation) return;
      const explicitId = profileInvocationEventId(rawInvocation);
      const eventId = UTIL.normalizeText(options.invocationEventId, 180);
      // ponytail: anonymous observations stay separate; add a transport event ID if duplicate envelopes become observable.
      const fallbackId = eventId ? `event:${eventId}:${index}` : `observed:${now}:${++state.profileInvocationSeq}:${index}`;
      const invocationId = `${metricBase.turnId}\u0001${explicitId || fallbackId}`;
      if (ledger.invocations[invocationId]) {
        seenInvocationIds.add(invocationId);
        return;
      }
      const record = { ...invocation, invocationId, turnId: metricBase.turnId, occurrence: 1, observedAt: now, source: metricBase.source };
      ledger.invocations[invocationId] = record;
      invocations.push(record);
      seenInvocationIds.add(invocationId);
    });
    profileTurn.invocationIds = Array.from(seenInvocationIds);
    profileTurn.invocations = [];
    const merged = mergeProfileTurn(previous, profileTurn);
    merged.invocationIds = Array.from(new Set([...(previous?.invocationIds || []), ...profileTurn.invocationIds]));
    if (previousIndex !== undefined) ledger.turns[previousIndex] = merged;
    else profileLedgerTurnIndex(ledger).set(merged.turnId, ledger.turns.push(merged) - 1);
    profileLedgerRebuildRollup();
    saveProfileLedgerSnapshot();
    profileLedgerQueueWrite(merged, calls, invocations);
    return true;
  }

  function loadDefaultPrices() {
    return normalizePriceTable(UTIL.loadJson(PRICE_REMOTE_CACHE_KEY, null)?.prices);
  }

  function loadDefaultPriceMeta() {
    return normalizePriceMeta(UTIL.loadJson(PRICE_REMOTE_CACHE_KEY, null)?.meta);
  }

  function normalizePriceMeta(source) {
    if (!source || typeof source !== "object" || Array.isArray(source)) return {};
    return Object.fromEntries(
      Object.entries(source)
        .map(([model, value]) => [
          UTIL.normalizeText(model, 120),
          {
            mode: UTIL.normalizeText(value?.mode, 40).toLowerCase(),
            deprecationDate: UTIL.normalizeText(value?.deprecationDate, 40),
          },
        ])
        .filter(([model]) => model),
    );
  }

  // 本地文件缓存：同步成功后把紧凑价格表写到用户脚本目录，启动时先读它，
  // 这样即使本次上游不可达（或 localStorage 已满）也不会丢失已有定价。
  // v3 起同一文件还镜像保存用户的「自定义价格」，作为 localStorage 之外的备份。
  // ---------------------------------------------------------------------------
  // 模块 11：上游价格文件缓存
  // 价格来自 LiteLLM 上游；本地只缓存最近一次成功同步的紧凑表。
  // ---------------------------------------------------------------------------
  function priceCachePath(targetPath) {
    return `${targetPath}.prices.cache.json`;
  }

  function priceCacheRestoreOverrides(cached) {
    const overrides = normalizePriceTable(cached?.overrides);
    if (!Object.keys(overrides).length) return false;
    try {
      // localStorage 存在（即使为空对象）时以它为准，避免把用户已删除的价格又恢复回来。
      if (localStorage.getItem(PRICE_OVERRIDES_KEY) != null) return false;
      localStorage.setItem(PRICE_OVERRIDES_KEY, JSON.stringify(overrides));
      invalidatePriceOverridesCache();
      return true;
    } catch {
      return false;
    }
  }

  async function priceCacheLoad(client, targetPath) {
    try {
      const text = updateDecodeBase64Text(await priceSyncReadBase64(client, priceCachePath(targetPath)));
      const parsed = JSON.parse(text);
      const prices = normalizePriceTable(parsed?.prices);
      const count = Object.keys(prices).length;
      const pricesValid = count >= PRICE_SYNC_MIN_MODELS && count <= PRICE_SYNC_MAX_MODELS;
      return {
        prices: pricesValid ? prices : {},
        meta: pricesValid ? normalizePriceMeta(parsed?.meta) : {},
        fetchedAt: pricesValid ? UTIL.toCount(parsed?.fetchedAt) : 0,
        overrides: normalizePriceTable(parsed?.overrides),
      };
    } catch {
      return null;
    }
  }

  async function priceCacheWrite(client, targetPath, payload) {
    await updateWriteBase64(client, priceCachePath(targetPath), updateEncodeBase64Text(JSON.stringify(payload)));
  }

  async function priceCacheWriteNow() {
    let client = null;
    let target = null;
    try {
      client = appServerSyncClient();
      if (!client) return false;
      target = await updateResolveTarget();
    } catch {
      return false;
    }
    let prices = DEFAULT_PRICES;
    let meta = DEFAULT_PRICE_META;
    let fetchedAt = UTIL.toCount(state.priceSyncedAt) || UTIL.toCount(UTIL.loadJson(PRICE_REMOTE_CACHE_KEY, null)?.fetchedAt);
    if (!Object.keys(prices).length) {
      // 还没拿到上游表时，合并文件里已有的数据，避免只写自定义价格把旧表覆盖掉。
      const existing = await priceCacheLoad(client, target.targetPath);
      prices = existing?.prices || {};
      meta = Object.keys(meta).length ? meta : existing?.meta || {};
      fetchedAt = fetchedAt || existing?.fetchedAt || 0;
    }
    try {
      await priceCacheWrite(client, target.targetPath, {
        version: 3,
        fetchedAt,
        prices,
        meta,
        overrides: priceOverrides(),
        overridesUpdatedAt: Date.now(),
      });
      return true;
    } catch {
      return false;
    }
  }

  // 串行化写入：连续保存价格时按调用顺序落盘，避免旧快照覆盖新快照。
  function priceCacheFlush() {
    if (!state.priceCacheWritePromise) state.priceCacheWritePromise = Promise.resolve();
    const run = state.priceCacheWritePromise.then(
      () => priceCacheWriteNow(),
      () => priceCacheWriteNow(),
    );
    state.priceCacheWritePromise = run;
    const settle = () => {
      if (state.priceCacheWritePromise === run) state.priceCacheWritePromise = null;
    };
    run.then(settle, settle);
    return run;
  }

  async function priceCacheSave(client, targetPath, snapshot) {
    try {
      await priceCacheWrite(client, targetPath, {
        version: 3,
        fetchedAt: Date.now(),
        prices: snapshot.prices,
        meta: snapshot.meta,
        overrides: priceOverrides(),
        overridesUpdatedAt: Date.now(),
      });
    } catch {
      // 文件缓存失败不影响本次同步结果；下次成功同步会再次尝试。
    }
  }

  function normalizePriceTable(source) {
    if (!source || typeof source !== "object" || Array.isArray(source)) return {};
    return Object.fromEntries(
      Object.entries(source)
        .map(([model, price]) => [UTIL.normalizeText(model, 120), normalizePrice(price)])
        .filter(([model, price]) => model && price),
    );
  }

  // 每 token 成本 ×1e6 折算为 USD / 1M tokens；12 位有效数字消除浮点毛刺。
  function priceUsdPerMillionTokens(value) {
    const number = Number(value);
    if (!Number.isFinite(number) || number <= 0) return null;
    return Number((number * 1e6).toPrecision(12));
  }

  // LiteLLM 上游 → 本地紧凑价格表：只收 openai provider，丢弃全零条目；
  // mode/deprecation_date 供「模型价格」列表做默认展示过滤。
  function priceUpstreamSnapshot(payload) {
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
    const prices = {};
    const meta = {};
    let count = 0;
    for (const [rawModel, entry] of Object.entries(payload)) {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
      if (UTIL.normalizeText(entry.litellm_provider, 40).toLowerCase() !== "openai") continue;
      const model = UTIL.normalizeText(rawModel, 120);
      if (!model) continue;
      const price = normalizePrice({
        input: priceUsdPerMillionTokens(entry.input_cost_per_token),
        cachedInput: priceUsdPerMillionTokens(entry.cache_read_input_token_cost),
        cacheWrite: priceUsdPerMillionTokens(entry.cache_creation_input_token_cost),
        output: priceUsdPerMillionTokens(entry.output_cost_per_token),
      });
      if (!price) continue;
      if (![price.input, price.cachedInput, price.cacheWrite, price.output].some((value) => Number(value) > 0)) continue;
      prices[model] = price;
      meta[model] = {
        mode: UTIL.normalizeText(entry.mode, 40).toLowerCase(),
        deprecationDate: UTIL.normalizeText(entry.deprecation_date, 40),
      };
      count += 1;
    }
    if (count < PRICE_SYNC_MIN_MODELS || count > PRICE_SYNC_MAX_MODELS) return null;
    return { prices, meta };
  }

  function saveRemotePriceTable(snapshot) {
    try {
      localStorage.setItem(
        PRICE_REMOTE_CACHE_KEY,
        JSON.stringify({
          version: 2,
          fetchedAt: Date.now(),
          prices: snapshot.prices,
          meta: snapshot.meta,
        }),
      );
      try {
        localStorage.removeItem(PRICE_REMOTE_LEGACY_CACHE_KEY);
      } catch {
        // 旧缓存清理失败不影响新表落盘。
      }
    } catch {
      // localStorage 配额吃紧时保留内存表即可，下次启动重新同步。
    }
  }

  function priceSyncUrl() {
    return `${PRICE_REMOTE_URL}?cltc_price=${Date.now()}`;
  }

  function priceSyncDownloadCommand(url, outPath) {
    return [
      "curl",
      "-sS",
      "-L",
      "--fail",
      // 上游 JSON 未压缩约 2.9 MB；command/exec 通道无输出约 10s 即判超时（退出码 124）。
      // 走 gzip 后传输量大幅下降（实测整表 <1s），否则弱网下必然半途截断。
      "--compressed",
      "--connect-timeout", "8",
      "--max-time", "20",
      "--retry", "2",
      "--retry-delay", "1",
      "--retry-all-errors",
      "-o", outPath,
      url,
    ];
  }

  function priceSyncClientOptions() {
    return { priority: "background", source: "codex-token-cost-prices" };
  }

  async function priceSyncReadBase64(client, path) {
    const result = await hostRequest(client, "fs/readFile", { path }, priceSyncClientOptions());
    const dataBase64 = typeof result?.dataBase64 === "string" ? result.dataBase64 : "";
    if (!dataBase64) throw new Error("读取上游价格表失败");
    return dataBase64;
  }

  function priceSyncScheduleRetry() {
    if (window.__CODEX_LIVE_TOKEN_COST_TEST__) return;
    if (state.priceSyncRetried || state.priceSyncRetryTimer || state.destroyed) return;
    state.priceSyncRetried = true;
    state.priceSyncRetryTimer = trackTimer(
      window.setTimeout(() => {
        state.priceSyncRetryTimer = 0;
        if (state.destroyed) return;
        void refreshDefaultPrices();
      }, PRICE_SYNC_RETRY_DELAY_MS),
    );
  }

  // 上游同步走 native 通道：curl 下载到临时文件（Windows TLS 凭证失败时用 Node），再 fs/readFile
  // 取回 base64（command/exec 的 stdout 会在 1 MiB 处截断，无法整表回传）。页面
  // fetch 到 github 会被 CSP connect-src 拦截，因此这条通道是生产唯一可行路径。
  // 启动时先读本地文件缓存，命中且未过期就直接复用，失败也不会丢已有定价。
  function refreshDefaultPrices() {
    if (state.priceRemoteRequest) return state.priceRemoteRequest;
    const request = (async () => {
      state.priceSyncError = "";
      let client = null;
      let target = null;
      try {
        client = appServerSyncClient();
      } catch {
        client = null;
      }
      if (client) {
        try {
          target = await updateResolveTarget();
        } catch {
          target = null;
        }
      }
      if (client && target && !state.priceFileCacheLoaded) {
        state.priceFileCacheLoaded = true;
        const cached = await priceCacheLoad(client, target.targetPath);
        if (cached) {
          if (Object.keys(cached.prices).length) {
            DEFAULT_PRICES = cached.prices;
            DEFAULT_PRICE_META = cached.meta;
            invalidatePriceDerivedCaches();
            if (cached.fetchedAt) state.priceSyncedAt = cached.fetchedAt;
          }
          const restoredOverrides = priceCacheRestoreOverrides(cached);
          const storedOverrides = priceOverrides();
          // v2 → v3 升级：把 localStorage 里已有的自定义价补写进文件。
          if (Object.keys(storedOverrides).length && !Object.keys(cached.overrides).length) {
            try {
              await priceCacheWrite(client, target.targetPath, {
                version: 3,
                fetchedAt: cached.fetchedAt || UTIL.toCount(UTIL.loadJson(PRICE_REMOTE_CACHE_KEY, null)?.fetchedAt) || 0,
                prices: DEFAULT_PRICES,
                meta: DEFAULT_PRICE_META,
                overrides: storedOverrides,
                overridesUpdatedAt: Date.now(),
              });
            } catch {
              // 升级补写失败不影响本次启动；下次保存价格时会再次写入。
            }
          }
          if (restoredOverrides && state.started) render();
        }
      }
      const cachedAt = Math.max(UTIL.toCount(UTIL.loadJson(PRICE_REMOTE_CACHE_KEY, null)?.fetchedAt), UTIL.toCount(state.priceSyncedAt));
      if (cachedAt && Date.now() - cachedAt < PRICE_SYNC_MIN_INTERVAL_MS) {
        if (!state.priceSyncedAt) state.priceSyncedAt = cachedAt;
        return true;
      }
      try {
        if (!client) throw new Error("未找到本地文件通道");
        if (!target) throw new Error("Codex++ 通道不可用");
        const tempPath = `${target.targetPath}.prices.json`;
        let text = "";
        try {
          await updateRunCommand(client, priceSyncDownloadCommand(priceSyncUrl(), tempPath), target.userDir);
          text = updateDecodeBase64Text(await priceSyncReadBase64(client, tempPath));
        } finally {
          await updateRemoveFile(client, tempPath);
        }
        let snapshot = null;
        try {
          snapshot = priceUpstreamSnapshot(JSON.parse(text));
        } catch {
          throw new Error("上游价格表解析失败");
        }
        if (!snapshot) throw new Error("上游价格表无效");
        DEFAULT_PRICES = snapshot.prices;
        DEFAULT_PRICE_META = snapshot.meta;
        invalidatePriceDerivedCaches();
        state.priceSyncedAt = Date.now();
        state.priceSyncError = "";
        saveRemotePriceTable(snapshot);
        await priceCacheSave(client, target.targetPath, snapshot);
        if (state.started) render();
        return true;
      } catch (error) {
        state.priceSyncError = updateErrorMessage(error);
        priceSyncScheduleRetry();
        if (state.started) render();
        return false;
      }
    })();
    state.priceRemoteRequest = request;
    request.finally(() => {
      if (state.priceRemoteRequest === request) state.priceRemoteRequest = null;
    });
    return request;
  }

  function priceSyncTimeLabel(timestamp) {
    const date = new Date(timestamp);
    const pad = (value) => String(value).padStart(2, "0");
    return `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }

  function priceSyncStatus() {
    if (state.priceRemoteRequest) return { tone: "busy", text: "正在同步上游价格…" };
    if (state.priceSyncError) {
      const cachedAt = state.priceSyncedAt || UTIL.toCount(UTIL.loadJson(PRICE_REMOTE_CACHE_KEY, null)?.fetchedAt);
      const cachedNote = cachedAt ? `（沿用 ${priceSyncTimeLabel(cachedAt)} 的缓存）` : "";
      return { tone: "warn", text: `上游价格同步失败：${state.priceSyncError}${cachedNote}`, retry: true };
    }
    const syncedAt = state.priceSyncedAt || UTIL.toCount(UTIL.loadJson(PRICE_REMOTE_CACHE_KEY, null)?.fetchedAt);
    if (!syncedAt) return { tone: "idle", text: "上游价格尚未同步" };
    return { tone: "ok", text: `上游价格（${PRICE_SYNC_SOURCE_LABEL}）· 同步于 ${priceSyncTimeLabel(syncedAt)}` };
  }

  function hubVisible() {
    try {
      return localStorage.getItem(HUB_VISIBLE_KEY) !== "false";
    } catch {
      return true;
    }
  }

  function saveHubVisible(value) {
    try {
      localStorage.setItem(HUB_VISIBLE_KEY, value ? "true" : "false");
    } catch {
      // Keep the setting best-effort; DOM sync can still use the default.
    }
    return value;
  }

  function outputRateVisible() {
    try {
      return localStorage.getItem(OUTPUT_RATE_VISIBLE_KEY) === "true";
    } catch {
      return false;
    }
  }

  function saveOutputRateVisible(value) {
    const visible = Boolean(value);
    try {
      localStorage.setItem(OUTPUT_RATE_VISIBLE_KEY, visible ? "true" : "false");
    } catch {
      // Keep the setting best-effort; the current runtime can still use the value.
    }
    if (!visible) cancelOutputRateRefresh();
    return visible;
  }

  function profileUnlockEnabled() {
    if (typeof profileUnlockEnabledRuntime === "boolean") return profileUnlockEnabledRuntime;
    try {
      return localStorage.getItem(PROFILE_UNLOCK_ENABLED_KEY) !== "false";
    } catch {
      return true;
    }
  }

  function applyProfileDataOverride(source) {
    if (!source || typeof source !== "object" || !profileUnlockEnabled()) return source;
    const local = profileUsageQueryData();
    const next = { ...source };
    const prefs = localProfilePrefs();
    Object.assign(next, {
      planType: prefs.planType,
      plan_type: prefs.planType,
      planLabel: localProfilePlanLabel(prefs),
    });
    if (Array.isArray(local.dailyUsage)) next.dailyUsage = local.dailyUsage;
    if (local.activityInsights && typeof local.activityInsights === "object") next.activityInsights = local.activityInsights;
    if (local.summary && typeof local.summary === "object") {
      next.summary = { ...(source.summary && typeof source.summary === "object" ? source.summary : {}), ...local.summary };
    }
    return next;
  }

  function isRealChatgptAccount(account) {
    if (!account || typeof account !== "object") return false;
    const type = account.type || account.account_type;
    if (type === "apiKey" || type === "amazonBedrock") return false;
    const id = account.id || account.account_id;
    return Boolean(
      id &&
        id !== LOCAL_PROFILE_ACCOUNT_ID &&
        (account.account_user_id || account.account_owner_id || account.plan_type || account.structure || account.email || account.account_residency_region),
    );
  }

  function profileRealChatgptDetected(queryClient) {
    const client = queryClient || state.profileQueryClient || profileQueryClientFromDocument();
    if (!client || typeof client.getQueryCache !== "function") return false;
    try {
      const queries = client.getQueryCache()?.getAll?.() || [];
      for (const query of queries) {
        const queryKey = query?.queryKey;
        if (!Array.isArray(queryKey)) continue;
        if (queryKey[0] === "accounts" && queryKey[1] === "check") {
          const accounts = query.state?.data?.accounts;
          if (Array.isArray(accounts) && accounts.some(isRealChatgptAccount)) return true;
        }
        if (queryKey[0] === "rate-limit-status") {
          const data = query.state?.data;
          if (
            data &&
            typeof data === "object" &&
            data.account_id &&
            data.account_id !== LOCAL_PROFILE_ACCOUNT_ID &&
            data.user_id &&
            data.user_id !== LOCAL_PROFILE_USER_ID
          ) {
            return true;
          }
        }
      }
    } catch {
      // Query cache reads are best-effort; fall back to the stored unlock setting.
    }
    return false;
  }

  function profileRealChatgptCached(queryClient) {
    const client = queryClient || state.profileQueryClient;
    if (state.profileRealChatgptCacheClient === client) return state.profileRealChatgptCached;
    if (!client) return false;
    const detected = profileRealChatgptDetected(client);
    state.profileRealChatgptCached = detected;
    state.profileRealChatgptCacheClient = client;
    return detected;
  }

  function refreshProfileRealChatgptCache(queryClient) {
    const client = queryClient || state.profileQueryClient;
    if (!client || typeof client.getQueryCache !== "function") return false;
    const detected = profileRealChatgptDetected(client);
    state.profileRealChatgptCached = detected;
    state.profileRealChatgptCacheClient = client;
    return detected;
  }

  function profileSyntheticEnabled(queryClient) {
    // Codex gates every profile surface on a real ChatGPT login: the route wrapper checks
    // authMethod === "chatgpt", a matching personal account and a Pro plan, and the profile
    // endpoints live behind the ChatGPT-only /wham backend. An API-key session cannot satisfy
    // that, so synthesizing a profile required faking auth reads and endpoints app-wide. That was
    // both fragile and expensive (a stack capture on every auth read), so the API-key profile
    // spoof is intentionally disabled. Only the real-ChatGPT data-override path runs in production.
    //
    // The implementation is still covered by the unit tests through this test-only switch; Codex
    // itself never sets __CODEX_LIVE_TOKEN_COST_TEST__, so production always takes the fast path.
    if (!window.__CODEX_LIVE_TOKEN_COST_TEST__ || !state.profileSyntheticTestEnabled) return false;
    const client = queryClient || state.profileQueryClient;
    return Boolean(client) && profileUnlockEnabled() && !profileRealChatgptCached(client);
  }

  // Patches installed on long-lived objects (Codex app modules, Statsig clients, React auth
  // context) outlive destroy() and cannot be safely unpatched. They must therefore consult the
  // live instance instead of capturing this one, or an in-place Codex++ hot reload would leave
  // them reading a dead instance's ledger and prefs.
  function stickyBridge() {
    const bridge = window.__codexLiveTokenCostActiveBridge;
    return bridge && typeof bridge.profileSyntheticEnabled === "function" ? bridge : null;
  }

  const CODEX_PLUS_SUPPORTED_API = 1;
  function codexPlusApiReady() {
    const api = window.codexPlus;
    if (!api) return false;
    const version = api.apiVersion;
    if (typeof version !== "number") return true;
    return version === CODEX_PLUS_SUPPORTED_API;
  }

  function reportFailure(error) {
    try {
      window.codexPlus?.fail?.(error);
    } catch {
      // Diagnostics must never break the script.
    }
  }

  function safeInstallOfficialProfileUnlock() {
    try {
      installOfficialProfileUnlock();
    } catch (error) {
      reportFailure(error);
    }
  }

  function profileDataOverrideEnabledFor(queryClient) {
    return profileUnlockEnabled() && profileRealChatgptCached(queryClient);
  }

  function saveProfileUnlockEnabled(value) {
    profileUnlockEnabledRuntime = Boolean(value);
    try {
      localStorage.setItem(PROFILE_UNLOCK_ENABLED_KEY, profileUnlockEnabledRuntime ? "true" : "false");
    } catch {
      // Keep the setting best-effort; the current runtime can still apply it.
    }
    return profileUnlockEnabledRuntime;
  }

  function hasCodexProjectContextRow(doc = document) {
    const node = doc?.querySelector?.(PROJECT_CONTEXT_ROW_SELECTOR);
    if (!node) return false;
    const rect = node.getBoundingClientRect?.();
    if (rect && (rect.width <= 0 || rect.height <= 0)) return false;
    const view = typeof getComputedStyle === "function" ? getComputedStyle(node) : null;
    return view?.display !== "none" && view?.visibility !== "hidden" && view?.opacity !== "0";
  }

  function syncHubVisibility(root = state.root, doc = document, force = false) {
    const now = Date.now();
    let projectContextRow = state.hubVisibilityProjectContextRow;
    if (
      force ||
      window.__CODEX_LIVE_TOKEN_COST_TEST__ ||
      !state.hubVisibilityCheckedAt ||
      now - state.hubVisibilityCheckedAt >= HUB_VISIBILITY_CACHE_MS
    ) {
      projectContextRow = hasCodexProjectContextRow(doc);
      state.hubVisibilityCheckedAt = now;
      state.hubVisibilityProjectContextRow = projectContextRow;
    }
    const visible = hubVisible() && !projectContextRow;
    const target = root?.style ? root : state.root;
    if (!target?.style) return visible;
    if (target.dataset.cltcHubVisible !== String(visible)) {
      target.dataset.cltcHubVisible = String(visible);
      setButtonAttribute(target, "aria-hidden", String(!visible));
      if (visible) {
        if (target.style.removeProperty) target.style.removeProperty("display");
        else target.style.display = "";
      } else if (target.style.setProperty) {
        target.style.setProperty("display", "none", "important");
      } else {
        target.style.display = "none";
      }
    }
    if (target.dataset.cltcProjectContextRow !== String(projectContextRow)) {
      target.dataset.cltcProjectContextRow = String(projectContextRow);
    }
    return visible;
  }

  function scheduleHubVisibilitySync(delay = 200) {
    if (state.hubVisibilityTimer) return;
    state.hubVisibilityTimer = window.setTimeout(() => {
      state.hubVisibilityTimer = 0;
      syncHubVisibility();
    }, delay);
  }

  function installHubVisibilityObserver() {
    syncHubVisibility();
    if (state.hubVisibilityObserver || window.__CODEX_LIVE_TOKEN_COST_TEST__ || typeof MutationObserver !== "function") return;
    const target = document.body || document.documentElement;
    if (!target) return;
    state.hubVisibilityObserver = new MutationObserver(() => {
      if (!state.root?.isConnected) scheduleRender(0);
      scheduleHubVisibilitySync();
    });
    state.hubVisibilityObserver.observe(target, { childList: true, subtree: true });
  }

  function localDateKey(time = Date.now()) {
    const date = new Date(time);
    if (!Number.isFinite(date.getTime())) return "";
    const mm = String(date.getMonth() + 1).padStart(2, "0");
    const dd = String(date.getDate()).padStart(2, "0");
    return `${date.getFullYear()}-${mm}-${dd}`;
  }

  function todayKey(time = Date.now()) {
    return localDateKey(time);
  }

  function isoDateUtc(time = Date.now()) {
    const date = new Date(time);
    return Number.isFinite(date.getTime()) ? date.toISOString().slice(0, 10) : todayKey();
  }

  function binaryStringToBase64(value) {
    const text = String(value || "");
    const chunkSize = 0x6000;
    let out = "";
    for (let i = 0; i < text.length; i += chunkSize) out += btoa(text.slice(i, i + chunkSize));
    return out;
  }

  function repairLegacyChunkedProfileImageUrl(value) {
    const text = String(value || "");
    const match = text.match(/^(data:image\/[^;,]+;base64,)([\s\S]+)$/i);
    if (!match) return text;
    const prefix = match[1];
    const body = match[2].replace(/\s/g, "");
    if (!body.slice(0, -2).includes("=")) return text;
    const oldChunkChars = Math.ceil(0x8000 / 3) * 4;
    let binary = "";
    try {
      for (let i = 0; i < body.length; i += oldChunkChars) binary += atob(body.slice(i, i + oldChunkChars));
    } catch {
      return text;
    }
    return `${prefix}${binaryStringToBase64(binary)}`;
  }

  function normalizeProfileImageUrl(value) {
    const text = UTIL.normalizeText(value, PROFILE_IMAGE_MAX_LENGTH);
    if (!text) return null;
    return repairLegacyChunkedProfileImageUrl(text);
  }

  function isProfileStorageQuotaError(error) {
    return Boolean(
      error &&
        (error.name === "QuotaExceededError" ||
          error.name === "NS_ERROR_DOM_QUOTA_REACHED" ||
          error.code === 22 ||
          error.code === 1014),
    );
  }

  function profileStorageQuotaError(error) {
    const wrapped = new Error("本地 Profile 存储空间不足，请压缩或移除头像后重试");
    wrapped.name = "QuotaExceededError";
    try {
      wrapped.cause = error;
    } catch {
      // Error.cause is optional in older Chromium builds.
    }
    return wrapped;
  }

  function loadProfileImageElement(dataUrl) {
    if (typeof Image !== "function") return Promise.resolve(null);
    return new Promise((resolve) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => resolve(null);
      image.src = dataUrl;
    });
  }

  function profileImageCanvasDataUrl(image, maxDimension, type, quality) {
    if (!image || typeof document === "undefined" || typeof document.createElement !== "function") return "";
    const sourceWidth = Number(image.naturalWidth || image.width || 0);
    const sourceHeight = Number(image.naturalHeight || image.height || 0);
    if (!(sourceWidth > 0 && sourceHeight > 0)) return "";
    const scale = Math.min(1, maxDimension / Math.max(sourceWidth, sourceHeight));
    const width = Math.max(1, Math.round(sourceWidth * scale));
    const height = Math.max(1, Math.round(sourceHeight * scale));
    const canvas = document.createElement("canvas");
    if (!canvas || typeof canvas.getContext !== "function" || typeof canvas.toDataURL !== "function") return "";
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context || typeof context.drawImage !== "function") return "";
    try {
      context.drawImage(image, 0, 0, width, height);
      const result = canvas.toDataURL(type, quality);
      return typeof result === "string" && result.startsWith("data:image/") ? result : "";
    } catch {
      return "";
    }
  }

  async function optimizeProfileImageDataUrl(imageUrl) {
    const source = normalizeProfileImageUrl(imageUrl);
    if (!source?.startsWith?.("data:image/") || source.length <= PROFILE_IMAGE_UPLOAD_TARGET_LENGTH) return source;
    const image = await loadProfileImageElement(source);
    if (!image) return source;
    let smallest = source;
    const dimensions = [PROFILE_IMAGE_UPLOAD_MAX_DIMENSION, 384, 256, 192];
    const encodings = [
      ["image/webp", 0.82],
      ["image/webp", 0.68],
      ["image/webp", 0.52],
      ["image/jpeg", 0.78],
      ["image/jpeg", 0.62],
    ];
    for (const dimension of dimensions) {
      for (const [type, quality] of encodings) {
        const candidate = profileImageCanvasDataUrl(image, dimension, type, quality);
        if (!candidate || candidate.length >= smallest.length) continue;
        smallest = candidate;
        if (candidate.length <= PROFILE_IMAGE_UPLOAD_TARGET_LENGTH) return candidate;
      }
    }
    return smallest;
  }

  function isoDateAddDays(dateIso, days) {
    const date = new Date(`${dateIso}T00:00:00.000Z`);
    if (!Number.isFinite(date.getTime())) return isoDateUtc();
    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString().slice(0, 10);
  }

  function isoWeekStartUtc(dateIso) {
    const date = new Date(`${dateIso}T00:00:00.000Z`);
    if (!Number.isFinite(date.getTime())) return isoWeekStartUtc(isoDateUtc());
    date.setUTCDate(date.getUTCDate() - date.getUTCDay());
    return date.toISOString().slice(0, 10);
  }

  function profileHeatmapColumnCount(todayIso = isoDateUtc()) {
    const currentWeek = new Date(`${isoWeekStartUtc(todayIso)}T00:00:00.000Z`).getTime();
    const baseWeek = new Date(`${PROFILE_HEATMAP_BASE_START}T00:00:00.000Z`).getTime();
    const weeks = Math.floor((currentWeek - baseWeek) / (7 * 24 * 60 * 60 * 1000));
    return Math.min(PROFILE_HEATMAP_MAX_COLUMNS, Math.max(1, weeks + 1));
  }

  function profileHeatmapStartDate(todayIso = isoDateUtc()) {
    return isoDateAddDays(isoWeekStartUtc(todayIso), -(profileHeatmapColumnCount(todayIso) - 1) * 7);
  }

  function localProfileDailyUsageBuckets(days, todayIso = isoDateUtc()) {
    const byDate = new Map(days.map((day) => [day.date, day]));
    const buckets = [];
    for (let date = profileHeatmapStartDate(todayIso); date <= todayIso; date = isoDateAddDays(date, 1)) {
      const day = byDate.get(date);
      buckets.push({
        start_date: date,
        tokens: UTIL.toCount(day?.tokens),
        input_tokens: UTIL.toCount(day?.input),
        output_tokens: UTIL.toCount(day?.output),
        cached_tokens: UTIL.toCount(day?.cached),
        requests: UTIL.toCount(day?.requests),
        cost: Number(day?.cost || 0),
      });
    }
    return buckets;
  }

  function localProfileStreakStats(days, todayIso = isoDateUtc()) {
    const usageDates = new Set(days.filter((day) => UTIL.toCount(day.tokens) > 0).map((day) => day.date));
    let current = 0;
    for (let date = todayIso; usageDates.has(date); date = isoDateAddDays(date, -1)) current++;

    let longest = 0;
    let running = 0;
    let previous = "";
    for (const date of Array.from(usageDates).sort()) {
      running = previous && isoDateAddDays(previous, 1) === date ? running + 1 : 1;
      longest = Math.max(longest, running);
      previous = date;
    }
    return { current, longest };
  }


  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function isTransientSessionKey(value) {
    return UTIL.normalizeText(value, 240).startsWith("new:");
  }

  function stripProfileUsername(value) {
    return String(value || "").trim().replace(/^@+/, "").replace(/\s/g, "").slice(0, 20);
  }

  function profileUsernameAllowed(value) {
    const username = stripProfileUsername(value);
    return username.length >= 3 && username.length <= 20 && /^[A-Za-z0-9._-]+$/.test(username);
  }

  function validProfileEmail(value) {
    const email = UTIL.normalizeText(value, 128);
    return email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : "";
  }

  function profileDefaultEmail() {
    return validProfileEmail(UTIL.loadJson(PROFILE_DEFAULTS_KEY, {}).email) || LOCAL_PROFILE_EMAIL;
  }

  function saveProfileDefaultEmail(email) {
    const normalized = validProfileEmail(email);
    if (!normalized) return false;
    const defaults = UTIL.loadJson(PROFILE_DEFAULTS_KEY, {});
    localStorage.setItem(PROFILE_DEFAULTS_KEY, JSON.stringify({ ...defaults, email: normalized }));
    return true;
  }

  function normalizeProfileEmail(value, fallback = profileDefaultEmail()) {
    return validProfileEmail(value) || fallback || LOCAL_PROFILE_EMAIL;
  }

  function normalizeProfileAccountStructure(value) {
    if (!PROFILE_WORKSPACE_ACCOUNT_ENABLED) return "personal";
    const text = UTIL.normalizeText(value, 32).toLowerCase();
    return text === "workspace" ? "workspace" : "personal";
  }

  function normalizeProfileWorkspaceName(value, fallback = "Codex Workspace") {
    return UTIL.normalizeText(value, 64) || fallback;
  }

  function profilePlanOption(value) {
    const text = UTIL.normalizeText(value, 64).toLowerCase();
    if (!text) return null;
    return PROFILE_PLAN_OPTIONS.find((option) => option.value.toLowerCase() === text || option.label.toLowerCase() === text) || null;
  }

  function normalizeProfilePlan(planType, planLabel) {
    const option = profilePlanOption(planType) || profilePlanOption(planLabel);
    if (option) return { planType: option.value, planLabel: option.label };
    const rawPlanType = UTIL.normalizeText(planType, 64);
    const rawPlanLabel = UTIL.normalizeText(planLabel, 64);
    const fallback = profilePlanOption(LOCAL_PROFILE_PLAN) || { value: LOCAL_PROFILE_PLAN, label: "Pro 20x" };
    const label = rawPlanLabel || rawPlanType || fallback.label;
    return { planType: rawPlanType || (rawPlanLabel ? rawPlanLabel : fallback.value), planLabel: label };
  }

  function localProfileIdentityFields(source = {}) {
    return {
      email: source.email,
      name: source.name,
      accountName: source.accountName,
      displayName: source.displayName,
      display_name: source.display_name,
      username: source.username,
      image: source.image,
      imageUrl: source.imageUrl,
      avatar: source.avatar,
      profilePictureUrl: source.profilePictureUrl,
      profileImageUrl: source.profileImageUrl,
      profilePhotoUrl: source.profilePhotoUrl,
      photoUrl: source.photoUrl,
      profile_picture_url: source.profile_picture_url,
      avatarUrl: source.avatarUrl,
      avatar_url: source.avatar_url,
      picture: source.picture,
    };
  }

  function localSyntheticIdentityFields(source = {}) {
    const prefs = localProfilePrefs();
    const displayName = prefs.displayName || prefs.username || "Local Usage";
    const imageUrl = prefs.imageUrl || null;
    return {
      email: prefs.email,
      name: displayName,
      accountName: displayName,
      displayName,
      display_name: displayName,
      username: prefs.username,
      image: imageUrl,
      imageUrl,
      avatar: imageUrl,
      profilePictureUrl: imageUrl,
      profileImageUrl: imageUrl,
      profilePhotoUrl: imageUrl,
      photoUrl: imageUrl,
      profile_picture_url: imageUrl,
      avatarUrl: imageUrl,
      avatar_url: imageUrl,
      picture: imageUrl,
    };
  }
  function localProfileAccount(source = {}, options = {}) {
    const prefs = localProfilePrefs();
    const preserveAuth = options.preserveAuth === true;
    const apiKeyAccount = source.type === "apiKey" || source.type === "amazonBedrock";
    const imageUrl = prefs.imageUrl || null;
    return {
      ...source,
      ...(preserveAuth ? {} : { id: source.id || LOCAL_PROFILE_ACCOUNT_ID }),
      ...(!preserveAuth
        ? {
            type: "chatgpt",
            planType: prefs.planType,
            plan_type: prefs.planType,
            name: prefs.displayName || prefs.username || null,
            display_name: prefs.displayName || prefs.username || null,
            email: prefs.email || null,
          }
        : {}),
      // accounts/check is the source for the profile dropdown's account row. Fill the avatar for
      // API-key accounts we are synthesizing and for the local ChatGPT account we fully replace;
      // a preserved real ChatGPT account keeps its own picture.
      ...((!preserveAuth || apiKeyAccount) && !source.profile_picture_url && !source.picture && imageUrl
        ? { profile_picture_url: imageUrl, picture: imageUrl }
        : {}),
    };
  }

  function spoofProfileAccountPayload(value) {
    if (!value || typeof value !== "object" || !value.account || typeof value.account !== "object") return value;
    const type = value.account.type;
    if (type !== "apiKey" && type !== "amazonBedrock" && type !== "chatgpt") return value;
    return {
      ...value,
      account: localProfileAccount(value.account, { preserveAuth: true }),
    };
  }

  function isProfileAccountsCheckPayload(value) {
    if (!value || typeof value !== "object" || !Array.isArray(value.accounts)) return false;
    return value.accounts.some((account) => {
      if (!account || typeof account !== "object") return false;
      return account.type === "apiKey" || account.type === "amazonBedrock" || account.type === "chatgpt";
    });
  }

  function spoofProfileAccountsCheckPayload(value) {
    if (!isProfileAccountsCheckPayload(value)) return value;
    return {
      ...value,
      accounts: value.accounts.map((account) => localProfileAccount(account, { preserveAuth: true })),
    };
  }

  function localProfileAccountsCheckResponse() {
    const account = localProfileAccount();
    return { account_ordering: [account.id], accounts: [account] };
  }

  function isProfileAccountPayload(value) {
    if (!value || typeof value !== "object" || !value.account || typeof value.account !== "object") return false;
    const type = value.account.type;
    return type === "apiKey" || type === "amazonBedrock" || type === "chatgpt";
  }

  function spoofProfileAuthContextValue(value) {
    if (!value || typeof value !== "object") return value;
    const source = value;
    if (source.__codexLiveTokenCostProfileAuthLocal === VERSION) return source;
    const account = source.account && typeof source.account === "object" ? localProfileAccount(source.account, { preserveAuth: true }) : null;
    const identity = localProfileIdentityFields(source);
    return {
      ...source,
      ...identity,
      __codexLiveTokenCostProfileAuthLocal: VERSION,
      ...(account ? { account } : {}),
    };
  }

  function profileUiAuthContextValue(value) {
    if (!value || typeof value !== "object") return value;
    const dataOverride = profileDataOverrideEnabledFor();
    const isApiAuth = value.authMethod === "apikey" || value.authMethod === "api_key";
    if (!isApiAuth && !dataOverride) return value;
    if (!isApiAuth) {
      const cacheKey = `${value.authMethod || ""}|${value.accountId || ""}|${value.userId || ""}|${localProfilePrefs().planType}`;
      if (state.profileUiAuthCacheSource === value && state.profileUiAuthCacheKey === cacheKey && state.profileUiAuthCache) {
        return state.profileUiAuthCache;
      }
      const planType = localProfilePrefs().planType;
      const account = value.account && typeof value.account === "object"
        ? { ...value.account, planType, plan_type: planType }
        : value.account;
      state.profileUiAuthCacheSource = value;
      state.profileUiAuthCacheKey = cacheKey;
      state.profileUiAuthCache = { ...value, planAtLogin: planType, ...(account ? { account } : {}) };
      return state.profileUiAuthCache;
    }
    // The auth context getter now feeds every useAuth() reader (not just the sidebar footer) so the
    // whole profile surface unlocks in API-key mode. Return a stable spoofed object per source
    // value + plan so broad reads do not churn context identities and trigger extra renders.
    const prefs = localProfilePrefs();
    if (state.profileUiApiAuthCacheSource === value && state.profileUiApiAuthCachePrefs === prefs && state.profileUiApiAuthCache) {
      return state.profileUiApiAuthCache;
    }
    const source = spoofProfileAuthContextValue(value);
    const displayName = prefs.displayName || prefs.username || "Local Usage";
    const imageUrl = prefs.imageUrl || null;
    const account = {
      ...localProfileAccount(source.account && typeof source.account === "object" ? source.account : {}),
      id: LOCAL_PROFILE_ACCOUNT_ID,
      name: displayName,
      display_name: displayName,
      email: prefs.email,
      profile_picture_url: imageUrl,
      picture: imageUrl,
      profileImageUrl: imageUrl,
    };
    const spoofed = {
      ...source,
      authMethod: "chatgpt",
      openAIAuth: source.openAIAuth,
      requiresAuth: false,
      hasChatGptToken: true,
      isLoading: false,
      planAtLogin: account.planType,
      account,
      accountId: LOCAL_PROFILE_ACCOUNT_ID,
      userId: LOCAL_PROFILE_USER_ID,
      // The official sidebar footer (bG avatar) and the profile dropdown avatar both read these two
      // login fields, not the generic identity fields. Feeding them here lets Codex render the local
      // avatar with its own DOM structure and size instead of us injecting a look-alike node.
      nameAtLogin: displayName,
      profilePictureUrlAtLogin: imageUrl,
      profileIdentity: {
        ...localProfileIdentityFields(source),
        ...localSyntheticIdentityFields(source),
        displayName,
        name: displayName,
        isProfileAvailable: true,
      },
    };
    state.profileUiApiAuthCacheSource = value;
    state.profileUiApiAuthCachePrefs = prefs;
    state.profileUiApiAuthCache = spoofed;
    return spoofed;
  }
  // Codex minifies component and hook names on every release, so the unlock cannot hard-code them.
  // Instead it derives the names from stable string constants in the bundle: the sidebar footer,
  // the profile-visibility hook, the useAuth hook (the single entry point every profile-visibility
  // decision reads auth through) and the /settings/profile route guard. A matching name in the
  // auth-context read stack is what makes the spoofed value apply.
  function profileUiFunctionNameBefore(text, marker) {
    const index = text.indexOf(marker);
    if (index < 0) return "";
    const prefix = text.slice(Math.max(0, index - 20000), index);
    const declarations = Array.from(prefix.matchAll(/function\s+([A-Za-z_$][\w$]*)\s*\(/g));
    return declarations.length ? declarations.at(-1)[1] : "";
  }

  function profileUiComponentNamesFromSource(source) {
    const text = String(source || "");
    if (!text) return [];
    const names = [
      profileUiFunctionNameBefore(text, "codex.profileFooter.settingsFallback"),
      profileUiFunctionNameBefore(text, "isProfileVisibilityLoading"),
      profileUiFunctionNameBefore(text, "useAuth must be used within AuthProvider"),
      profileUiFunctionNameBefore(text, "/settings/profile"),
    ];
    return Array.from(new Set(names.filter(Boolean)));
  }

  function isProfileUiAuthRead(stack, componentNames) {
    const text = String(stack || "");
    return Array.from(componentNames || []).some((name) => {
      const key = String(name || "");
      if (!key) return false;
      const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      return new RegExp(`(?:^|[\\s.@])${escaped}(?=$|[\\s(@])`).test(text);
    });
  }

  function isProfileQueryClient(value) {
    return Boolean(value && typeof value.invalidateQueries === "function" && typeof value.getQueryCache === "function");
  }

  function rememberProfileQueryClient(value) {
    if (isProfileQueryClient(value)) {
      if (state.profileQueryClient !== value) refreshProfileRealChatgptCache(value);
      state.profileQueryClient = value;
      state.profileQueryClientDiscoveryObserver?.disconnect?.();
      state.profileQueryClientDiscoveryObserver = null;
      installProfileQueryCacheObserver(value);
    }
    return value;
  }

  function isProfileUsageQueryKey(queryKey) {
    return Array.isArray(queryKey) && queryKey[0] === "profile" && queryKey[1] === "usage";
  }

  function isProfilePageQueryKey(queryKey) {
    return Array.isArray(queryKey) && queryKey[0] === "profile" && queryKey[1] === "page";
  }

  function profilePageDataNeedsOverride(source) {
    const local = localProfileResponse().stats || {};
    return source?.page?.stats?.agentic?.lifetime_tokens !== (local.lifetime_tokens ?? 0)
      || source?.page?.stats?.agentic?.peak_daily_tokens !== (local.peak_daily_tokens ?? 0);
  }

  function profilePageDataOverride(source) {
    if (!source || typeof source !== "object") return source;
    const stats = localProfileResponse().stats || {};
    const profile = localProfileResponse().profile || {};
    const page = source.page && typeof source.page === "object" ? source.page : {};
    const daily = Array.isArray(stats.daily_usage_buckets) ? stats.daily_usage_buckets : [];
    const weeklyMap = new Map();
    const dailyUsage = daily.map((bucket) => {
      const next = { ...bucket, chat_turns: 0 };
      const week = isoWeekStartUtc(bucket.start_date);
      weeklyMap.set(week, (weeklyMap.get(week) || 0) + UTIL.toCount(bucket.tokens));
      return next;
    });
    const weeklyUsage = Array.from(weeklyMap, ([start_date, tokens]) => ({ start_date, tokens, chat_turns: 0 }));
    let cumulative = 0;
    const cumulativeUsage = dailyUsage.map((bucket) => {
      cumulative += UTIL.toCount(bucket.tokens);
      return { ...bucket, tokens: cumulative };
    });
    return {
      ...source,
      profile_details: {
        ...(source.profile_details && typeof source.profile_details === "object" ? source.profile_details : {}),
        plan_type: profile.plan_type,
        plan_label: profile.plan_label,
      },
      page: {
        ...page,
        stats: {
          ...(page.stats && typeof page.stats === "object" ? page.stats : {}),
          current_streak_days: stats.current_streak_days ?? 0,
          longest_streak_days: stats.longest_streak_days ?? 0,
          agentic: {
            ...(page.stats?.agentic && typeof page.stats.agentic === "object" ? page.stats.agentic : {}),
            lifetime_tokens: stats.lifetime_tokens ?? 0,
            peak_daily_tokens: stats.peak_daily_tokens ?? 0,
            longest_running_turn_sec: stats.longest_running_turn_sec ?? 0,
          },
        },
        activity_graph: {
          ...(page.activity_graph && typeof page.activity_graph === "object" ? page.activity_graph : {}),
          daily_usage_buckets: dailyUsage,
          weekly_usage_buckets: weeklyUsage,
          cumulative_daily_usage_buckets: cumulativeUsage,
        },
        insights: {
          ...(page.insights && typeof page.insights === "object" ? page.insights : {}),
          total_skills_used: stats.total_skills_used ?? 0,
          unique_skills_used: stats.unique_skills_used ?? 0,
          agentic: {
            ...(page.insights?.agentic && typeof page.insights.agentic === "object" ? page.insights.agentic : {}),
            total_threads: stats.total_threads ?? 0,
            fast_mode_usage_percentage: stats.fast_mode_usage_percentage ?? 0,
            most_used_reasoning_effort: stats.most_used_reasoning_effort ?? null,
            most_used_reasoning_effort_percentage: stats.most_used_reasoning_effort_percentage ?? 0,
          },
        },
        top_plugins: Array.isArray(stats.top_plugins) && stats.top_plugins.length ? stats.top_plugins : page.top_plugins,
      },
    };
  }

  function stopProfileQueryCacheObserver() {
    try {
      state.profileQueryCacheObserverUnsubscribe?.();
    } catch {
      // Query cache teardown is best-effort during userscript reload.
    }
    state.profileQueryCacheObserverClient = null;
    state.profileQueryCacheObserverUnsubscribe = null;
    state.profileQueryCacheSyncQueued = false;
    state.profileRealChatgptCached = false;
    state.profileRealChatgptCacheClient = null;
    if (state.profileQueryClientDiscoveryTimer) window.clearTimeout(state.profileQueryClientDiscoveryTimer);
    state.profileQueryClientDiscoveryTimer = 0;
  }

  function isProfileAuthQueryKey(queryKey) {
    if (!Array.isArray(queryKey)) return false;
    return (queryKey[0] === "accounts" && queryKey[1] === "check") || queryKey[0] === "rate-limit-status";
  }

  function scheduleProfileQueryCacheSync(queryClient) {
    if (state.profileQueryCacheSyncQueued || state.profileQueryCacheObserverClient !== queryClient) return;
    state.profileQueryCacheSyncQueued = true;
    const flush = () => {
      state.profileQueryCacheSyncQueued = false;
      if (state.profileQueryCacheObserverClient === queryClient) syncProfileUsageQueryCache(queryClient);
    };
    if (typeof queueMicrotask === "function") queueMicrotask(flush);
    else if (typeof window.setTimeout === "function") window.setTimeout(flush, 0);
    else flush();
  }

  function installProfileQueryCacheObserver(queryClient) {
    if (!isProfileQueryClient(queryClient)) return false;
    const cache = queryClient.getQueryCache?.();
    if (!cache || typeof cache.subscribe !== "function") return false;
    if (state.profileQueryCacheObserverClient === queryClient) return true;
    stopProfileQueryCacheObserver();
    state.profileQueryCacheObserverClient = queryClient;
    try {
      const unsubscribe = cache.subscribe((event) => {
        if (!event?.query?.queryKey) return;
        if (isProfileAuthQueryKey(event.query.queryKey)) {
          const real = refreshProfileRealChatgptCache(queryClient);
          if (real) {
            if (profileDataOverrideEnabledFor(queryClient)) {
              // A real ChatGPT session may only be detected after the query client is discovered.
              // Install the override hooks now; the install is idempotent per client.
              safeInstallOfficialProfileUnlock();
              syncProfileUsageQueryCache(queryClient);
            }
          } else if (profileSyntheticEnabled(queryClient)) {
            safeInstallOfficialProfileUnlock();
            scheduleProfileUsageRefresh(0);
          }
        }
        if (
          (event?.type === "added" || event?.type === "observerAdded") &&
          isProfileUsageQueryKey(event.query.queryKey)
        ) {
          scheduleProfileQueryCacheSync(queryClient);
        } else if (
          isProfilePageQueryKey(event.query.queryKey) &&
          (event?.type === "added" ||
            event?.type === "observerAdded" ||
            (event?.type === "updated" && profileDataOverrideEnabledFor(queryClient)))
        ) {
          scheduleProfileQueryCacheSync(queryClient);
        }
      });
      state.profileQueryCacheObserverUnsubscribe = typeof unsubscribe === "function" ? unsubscribe : null;
      return true;
    } catch {
      stopProfileQueryCacheObserver();
      return false;
    }
  }

  function profileQueryClientFromFiberNode(node) {
    if (!node || typeof node !== "object") return null;
    const fiberKey = Object.keys(node).find((key) => key.startsWith("__reactFiber$") || key.startsWith("__reactInternalInstance$"));
    for (let fiber = fiberKey ? node[fiberKey] : null; fiber; fiber = fiber.return) {
      const candidates = [fiber.memoizedProps?.value];
      for (let dependency = fiber.dependencies?.firstContext; dependency; dependency = dependency.next) candidates.push(dependency.memoizedValue);
      for (let stateNode = fiber.memoizedState; stateNode; stateNode = stateNode.next) candidates.push(stateNode.memoizedState);
      const queryClient = candidates.find((value) => isProfileQueryClient(value));
      if (queryClient) return queryClient;
    }
    return null;
  }

  function profileQueryClientFromDocument(doc = document) {
    const candidates = [
      findSidebarProfileButton(doc),
      doc.querySelector?.("[data-settings-panel-slug='profile'], [aria-label='个人资料'], [aria-label='Profile']"),
      doc.querySelector?.("input[type='file']"),
      doc.querySelector?.("[aria-label='编辑个人资料'], [aria-label='Edit profile']"),
      doc.querySelector?.("main h1, [role='main'] h1, h1"),
    ].filter(Boolean);
    for (const candidate of candidates) {
      const queryClient = profileQueryClientFromFiberNode(candidate);
      if (queryClient) return queryClient;
    }
    return null;
  }

  function isProfileAuthContextValue(value) {
    return Boolean(
      value &&
        typeof value === "object" &&
        typeof value.authMethod === "string" &&
        "openAIAuth" in value &&
        "requiresAuth" in value &&
        "isLoading" in value,
    );
  }

  function profileAuthContextFromFiberNode(node) {
    if (!node || typeof node !== "object") return null;
    const fiberKey = Object.keys(node).find((key) => key.startsWith("__reactFiber$") || key.startsWith("__reactInternalInstance$"));
    for (let fiber = fiberKey ? node[fiberKey] : null; fiber; fiber = fiber.return) {
      for (let dependency = fiber.dependencies?.firstContext; dependency; dependency = dependency.next) {
        if (isProfileAuthContextValue(dependency.memoizedValue) && dependency.context) return dependency.context;
      }
    }
    return null;
  }

  function profileAuthContextFromDocument(doc = document) {
    return profileAuthContextFromFiberNode(findSidebarProfileButton(doc));
  }

  function patchProfileReactAuthContext(authContext, componentNames) {
    if (!authContext || !componentNames?.length) return false;
    authContext.__codexLiveTokenCostProfileUiComponents = new Set(componentNames);
    if (authContext.__codexLiveTokenCostProfileAuthPatch === VERSION) return true;
    const fields = ["_currentValue", "_currentValue2"].filter((field) => field in authContext);
    if (!fields.length) return false;
    const patchedFields = [];
    try {
      for (const field of fields) {
        const descriptor = Object.getOwnPropertyDescriptor(authContext, field);
        if (descriptor?.configurable === false || descriptor?.writable === false) throw new Error(`Auth context field is not patchable: ${field}`);
        let currentValue = descriptor?.get ? descriptor.get.call(authContext) : authContext[field];
        Object.defineProperty(authContext, field, {
          configurable: true,
          enumerable: descriptor?.enumerable ?? true,
          get() {
            const value = descriptor?.get ? descriptor.get.call(this) : currentValue;
            const active = stickyBridge();
            // Synthetic mode is test-only in this build, so the stack probe below never runs in
            // production. It remains here to keep the unit tests for component-scoped reads.
            if (
              active?.profileSyntheticEnabled() === true &&
              isProfileUiAuthRead(new Error().stack, authContext.__codexLiveTokenCostProfileUiComponents)
            ) {
              return active.profileUiAuthContextValue(value);
            }
            return value;
          },
          set(value) {
            if (descriptor?.set) descriptor.set.call(this, value);
            else currentValue = value;
          },
        });
        patchedFields.push({ descriptor, field });
      }
      authContext.__codexLiveTokenCostProfileAuthPatch = VERSION;
      return true;
    } catch {
      for (const { descriptor, field } of patchedFields.reverse()) {
        if (descriptor) Object.defineProperty(authContext, field, descriptor);
        else delete authContext[field];
      }
      return false;
    }
  }

  function isSettingsSectionsArray(value) {
    return (
      Array.isArray(value) &&
      value.some((item) => item?.slug === "general-settings") &&
      value.some((item) => item?.slug === "profile")
    );
  }

  // Cheap, allocation-free pre-check so the global Array.prototype.filter patch does not run the
  // two-pass slug scan on every filter call in the app. Any array that could be the settings
  // sections list necessarily contains a `profile` slug entry.
  function settingsSectionsCandidate(value) {
    if (value === state.settingsSectionsSource) return true;
    // The sections list is a module constant, so once it is known no other array can match.
    if (state.settingsSectionsSource) return false;
    if (!Array.isArray(value) || value.length === 0) return false;
    // The Codex settings section list is ~50 entries; large arrays (message history, query lists)
    // can be skipped without scanning them on every filter call.
    if (value.length > 256) return false;
    for (let index = 0; index < value.length; index += 1) {
      const item = value[index];
      if (item && typeof item === "object" && item.slug === "profile") {
        state.settingsSectionsSource = value;
        return true;
      }
    }
    return false;
  }

  function profileUnlockedSettingsSections(source, visible) {
    if (!profileDataOverrideEnabledFor() && !profileSyntheticEnabled()) return visible;
    if (!isSettingsSectionsArray(source) || !Array.isArray(visible) || visible.some((item) => item?.slug === "profile")) return visible;
    const profile = source.find((item) => item?.slug === "profile");
    if (!profile) return visible;
    const next = visible.slice();
    const generalIndex = next.findIndex((item) => item?.slug === "general-settings");
    next.splice(generalIndex >= 0 ? generalIndex + 1 : 0, 0, profile);
    return next;
  }

  function parseModelEffortText(value) {
    const text = UTIL.normalizeText(value, 500);
    const raw = text.match(/\b(gpt-[a-z0-9._-]+|o\d[a-z0-9._-]*)\b/i)?.[1] || "";
    if (!raw) return { model: "", effort: "" };
    const split = raw.match(/^(.*?)[._\s-]+(minimal|low|medium|high|xhigh|ultra|max)$/i);
    if (split) return { model: split[1], effort: split[2].toLowerCase() };
    return { model: raw, effort: "" };
  }

  const OFFICIAL_EFFORT_ALIASES = {
    无: "none",
    极低: "minimal",
    最小: "minimal",
    轻度: "low",
    低: "low",
    快速: "low",
    中: "medium",
    高: "high",
    极高: "xhigh",
    持续: "persistent",
    none: "none",
    minimal: "minimal",
    low: "low",
    medium: "medium",
    high: "high",
    extra_high: "xhigh",
    xhigh: "xhigh",
    max: "max",
    maximum: "max",
    ultra: "ultra",
    persistent: "persistent",
    continuous: "persistent",
  };

  function normalizeOfficialEffort(value) {
    const text = UTIL.normalizeText(String(value ?? ""), 80);
    if (!text) return "";
    const lower = text.toLowerCase().replace(/[\s-]+/g, "_");
    return OFFICIAL_EFFORT_ALIASES[text] || OFFICIAL_EFFORT_ALIASES[lower] || "";
  }

  function officialVersionedModelFromText(textValue) {
    const text = UTIL.normalizeText(String(textValue ?? ""), 500);
    const match = text.match(/\b(?:gpt[._\s-]?)?(\d+(?:\.\d+)+)(?:[._\s-]?(codex|mini|nano|pro|sol|terra|luna))?\b/i);
    if (match) {
      const suffix = match[2] ? `-${match[2].toLowerCase()}` : "";
      return `gpt-${match[1]}${suffix}`;
    }
    const short = text.match(/\b(\d+)\s*(codex|mini|nano|pro|sol|terra|luna)\b/i);
    return short ? `gpt-${short[1]}-${short[2].toLowerCase()}` : "";
  }

  function officialModelInfoFromText(textValue, effortValue = "") {
    const text = UTIL.normalizeText(String(textValue ?? ""), 500);
    const parsed = parseModelEffortText(text);
    let model = officialVersionedModelFromText(text) || parsed.model;
    if (!model) {
      const candidate =
        text
          .split(/\r?\n/)
          .map((line) => UTIL.normalizeText(line, 120))
          .find((line) => line && !normalizeOfficialEffort(line)) || text;
      const custom = candidate.match(/\b[a-z][a-z0-9._-]*(?:[._-][a-z0-9]+)+\b/i)?.[0] || candidate.match(/\b[a-z][a-z0-9._-]*\d[a-z0-9._-]*\b/i)?.[0] || "";
      if (custom && !normalizeOfficialEffort(custom)) model = custom.toLowerCase();
    }
    const effort =
      normalizeOfficialEffort(effortValue) ||
      parsed.effort ||
      String(text)
        .split(/\r?\n/)
        .map((line) => normalizeOfficialEffort(line))
        .find(Boolean) ||
      normalizeOfficialEffort(
        text.match(
          /(极高|极低|轻度|持续|最小|无|高|中|低|\bpersistent\b|\bcontinuous\b|\bminimal\b|\blow\b|\bmedium\b|\bhigh\b|\bxhigh\b|\bextra[_-]?high\b|\bultra\b|\bmax(?:imum)?\b|\bnone\b)/i,
        )?.[1],
      );
    return { model, effort };
  }

  function officialFastModeIconHtml() {
    return `<svg class="cltc-fast-mode-icon" data-cltc-fast-mode-icon="true" hidden width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="${FAST_MODE_ICON_PATH}" fill="currentColor"></path></svg>`;
  }

  function officialTriggerFastMode(trigger) {
    if (!trigger || state.root?.contains?.(trigger) || state.settingsOverlay?.contains?.(trigger)) return false;
    const paths = Array.from(trigger.querySelectorAll?.("svg path") || []);
    return paths.some((path) => {
      const svg = path.closest?.("svg");
      const pathData = path.getAttribute?.("d") || "";
      const className = String(svg?.className?.baseVal || svg?.className || "");
      const isFastIcon =
        pathData === FAST_MODE_ICON_PATH ||
        pathData.startsWith(LEGACY_FAST_MODE_ICON_PATH_PREFIX) ||
        /(?:^|_)WorkTriggerInlineFastIcon(?:_|$)/.test(className);
      if (!isFastIcon) return false;
      if (!svg || svg.hidden || svg.hasAttribute?.("hidden") || svg.closest?.("[hidden]")) return false;
      const rect = svg.getBoundingClientRect?.();
      const style = typeof getComputedStyle === "function" ? getComputedStyle(svg) : null;
      return (!rect || (rect.width > 0 && rect.height > 0)) && style?.display !== "none" && style?.visibility !== "hidden" && style?.opacity !== "0";
    });
  }

  // 模型菜单加载时，触发器里会渲染“正在加载模型”/“选择推理强度”这类占位文案
  // （后者来自 ModelPickerTriggerMeasurement 的隐藏测量节点）。这些文案不能当作
  // 模型名或推理强度显示，否则模型名和强度会同时变成同一句占位文案。
  function isModelPickerPlaceholder(value) {
    const text = UTIL.normalizeText(String(value ?? ""), 160);
    if (!text) return false;
    return /正在加载|加载中|载入中|loading|select\s+(?:a\s+)?(?:model|reasoning)|选择(?:模型|推理强度)/i.test(text);
  }

  function officialModelTriggerCandidates(scope = document) {
    return Array.from(scope?.querySelectorAll?.(OFFICIAL_MODEL_TRIGGER_SELECTOR) || [])
      .filter((node) => !state.root?.contains?.(node) && !state.settingsOverlay?.contains?.(node));
  }

  function largestVisibleTrigger(candidates) {
    const visible = candidates.filter((node) => isVisibleElement(node));
    if (!visible.length) return null;
    visible.sort((a, b) => {
      const ar = a.getBoundingClientRect?.() || { width: 0, height: 0 };
      const br = b.getBoundingClientRect?.() || { width: 0, height: 0 };
      return br.width * br.height - ar.width * ar.height;
    });
    return visible[0];
  }

  // 宿主会同时渲染一个 0×0 的测量节点和真正可见的触发器；querySelector 取第一个
  // 会绑定到隐藏节点，导致 HUB 一直显示上一次的模型/强度。优先选当前 composer 内
  // 面积最大的可见节点，再退回全局可见节点。
  function pickOfficialModelTrigger() {
    const activeRoot = document.activeElement?.closest?.("[data-codex-composer-root]");
    if (activeRoot) {
      const active = largestVisibleTrigger(officialModelTriggerCandidates(activeRoot));
      if (active) return active;
    }
    const composerRoot = composerActionButton()?.closest?.("[data-codex-composer-root]");
    if (composerRoot) {
      const nearComposer = largestVisibleTrigger(officialModelTriggerCandidates(composerRoot));
      if (nearComposer) return nearComposer;
    }
    return largestVisibleTrigger(officialModelTriggerCandidates()) || officialModelTriggerCandidates()[0] || null;
  }

  function officialModelTriggerInfo(trigger) {
    if (!trigger || state.root?.contains?.(trigger) || state.settingsOverlay?.contains?.(trigger)) {
      return { model: "", displayModel: "", effort: "", displayEffort: "", fastMode: false };
    }
    const text = trigger.innerText || trigger.textContent || "";
    const rawEffort = UTIL.normalizeText(trigger.getAttribute?.("data-selected-reasoning-effort") || "", 40);
    const effortLabelNode = trigger.querySelector?.("[class*='ModelPickerTriggerEffortLabel']");
    const effortLayers = Array.from(trigger.querySelectorAll?.("[data-reasoning-effort]") || []);
    const selectedEffortNode = effortLayers.find((node) => rawEffort && node.getAttribute?.("data-reasoning-effort") === rawEffort);
    const srOnlyEffort = UTIL.normalizeText(effortLabelNode?.querySelector?.(".sr-only")?.textContent || "", 40);
    const info = officialModelInfoFromText(text, rawEffort);
    const modelCandidates = [
      UTIL.normalizeText(trigger.querySelector?.("[class*='ModelPickerTriggerModelText']")?.textContent || "", 120),
      UTIL.normalizeText(trigger.querySelector?.("[class*='ModelPickerTriggerModelLabel']")?.textContent || "", 120),
      UTIL.normalizeText(trigger.querySelector?.("[class*='ComposerDropdownLabel']")?.textContent || "", 120),
      UTIL.normalizeText(String(text).split(/\r?\n/)[0], 120),
    ];
    // 只接受“像模型名”的候选：排除占位文案，也排除纯推理强度标签（“高”“中”）。
    const displayModel = modelCandidates.find((value) => value && !isModelPickerPlaceholder(value) && !normalizeOfficialEffort(value)) || "";
    // data-selected-reasoning-effort 是官方给出的语义值；中文标签只用于显示。
    // 新增强度（例如 persistent→“持续”）即使暂时没有归一化映射，也要把原始值保留下来，
    // 否则 readOfficialModelTrigger 会因为 effort 为空而跳过更新，切换后 HUB 一直停在旧强度。
    const effort =
      normalizeOfficialEffort(rawEffort) ||
      normalizeOfficialEffort(srOnlyEffort) ||
      info.effort ||
      UTIL.normalizeText(rawEffort, 40).toLowerCase();
    let displayEffort = UTIL.normalizeText(selectedEffortNode?.textContent || "", 40);
    if (!displayEffort && srOnlyEffort && !isModelPickerPlaceholder(srOnlyEffort)) displayEffort = srOnlyEffort;
    if (!displayEffort) {
      displayEffort =
        UTIL.normalizeText(
          effortLayers.find((node) => node.getAttribute?.("data-reasoning-effort") === effort)?.textContent || "",
          40,
        ) ||
        String(text)
          .split(/\r?\n/)
          .map((line) => UTIL.normalizeText(line, 40))
          .find(
            (line) =>
              line &&
              line !== displayModel &&
              !isModelPickerPlaceholder(line) &&
              (normalizeOfficialEffort(line) === effort || line.toLowerCase() === effort),
          ) ||
        "";
    }
    if (isModelPickerPlaceholder(displayEffort)) displayEffort = "";
    return { ...info, effort, displayModel, displayEffort, fastMode: officialTriggerFastMode(trigger) };
  }

  function readOfficialModelTrigger(trigger = null) {
    const node = trigger || pickOfficialModelTrigger();
    const info = officialModelTriggerInfo(node);
    let changed = false;
    if (info.model && !isModelPickerPlaceholder(info.model) && info.model !== state.detectedModel) {
      state.detectedModel = info.model;
      changed = true;
    }
    if (info.displayModel && !isModelPickerPlaceholder(info.displayModel) && info.displayModel !== state.detectedModelLabel) {
      state.detectedModelLabel = info.displayModel;
      changed = true;
    }
    if (info.effort && info.effort !== state.detectedEffort) {
      state.detectedEffort = info.effort;
      changed = true;
    }
    if (info.displayEffort && !isModelPickerPlaceholder(info.displayEffort) && info.displayEffort !== state.detectedEffortLabel) {
      state.detectedEffortLabel = info.displayEffort;
      changed = true;
    }
    if (info.fastMode !== state.detectedFastMode) {
      state.detectedFastMode = info.fastMode;
      changed = true;
    }
    return changed;
  }

  // ---------------------------------------------------------------------------
  // 模块 12：定价与成本
  // priceFor / costForModelUsage / storedTurnCost：所有金额的唯一来源，禁止在别处重复计价。
  // ---------------------------------------------------------------------------
  function modelName(ledgerModel = null) {
    const recentModel = ledgerModel === null ? recentLedgerModel() : ledgerModel;
    return state.detectedModel || recentModel || UNKNOWN_MODEL;
  }

  function activeModelInfo() {
    const ledgerModel = recentLedgerModel();
    const model = modelName(ledgerModel);
    const displayModel = state.detectedModelLabel && !isModelPickerPlaceholder(state.detectedModelLabel) ? state.detectedModelLabel : state.detectedModel || model;
    const displayEffort = state.detectedEffortLabel && !isModelPickerPlaceholder(state.detectedEffortLabel) ? state.detectedEffortLabel : state.detectedEffort || "";
    return {
      model,
      displayModel,
      effort: state.detectedEffort || "",
      displayEffort,
      manual: false,
    };
  }

  // 价格为 0 是合法配置（例如免费/本地模型）；负数或非数字才无效。
  function priceUsable(price) {
    if (!price || typeof price !== "object") return false;
    const input = Number(price.input);
    const output = Number(price.output);
    if (!Number.isFinite(input) || !Number.isFinite(output) || input < 0 || output < 0) return false;
    return [price.cachedInput, price.cacheWrite].every(
      (value) => value == null || (Number.isFinite(Number(value)) && Number(value) >= 0),
    );
  }

  function priceFor(model) {
    const overrides = priceOverrides();
    const key = priceModelKey(model, overrides);
    if (!key || priceModelHidden(key)) return null;
    const override = normalizePrice(overrides[key]);
    if (override) return priceUsable(override) ? override : null;
    const fallback = DEFAULT_PRICES[key] || null;
    return priceUsable(fallback) ? fallback : null;
  }

  function priceModelKey(model, overrides = priceOverrides()) {
    const name = UTIL.normalizeText(model, 120);
    if (!name || name === UNKNOWN_MODEL) return "";
    if (Object.hasOwn(overrides, name) || Object.hasOwn(DEFAULT_PRICES, name)) return name;
    const lower = name.toLowerCase();
    const overrideKey = Object.keys(overrides).find((key) => UTIL.normalizeText(key, 120).toLowerCase() === lower);
    if (overrideKey) return overrideKey;
    const defaultKey = Object.keys(DEFAULT_PRICES).find((key) => key.toLowerCase() === lower);
    return defaultKey || name;
  }

  function priceModelHidden(model) {
    const name = UTIL.normalizeText(model, 120);
    const lower = name.toLowerCase();
    const hidden = hiddenPriceModels();
    return hidden.has(name) || Array.from(hidden).some((item) => item.toLowerCase() === lower);
  }

  function hiddenPriceModels() {
    const hidden = UTIL.loadJson(HIDDEN_PRICE_MODELS_KEY, []);
    return new Set(Array.isArray(hidden) ? hidden.map((item) => UTIL.normalizeText(item)).filter(Boolean) : []);
  }

  function saveHiddenPriceModels(hidden) {
    const list = Array.from(hidden).map((item) => UTIL.normalizeText(item)).filter(Boolean).sort((a, b) => a.localeCompare(b));
    localStorage.setItem(HIDDEN_PRICE_MODELS_KEY, JSON.stringify(list));
  }

  function visibleDefaultPrices() {
    const hidden = hiddenPriceModels();
    return Object.fromEntries(Object.entries(DEFAULT_PRICES).filter(([model]) => !hidden.has(model)));
  }

  function visiblePrices() {
    const overrides = priceOverrides();
    const visibleOverrides = Object.fromEntries(Object.entries(overrides).filter(([model]) => !priceModelHidden(model)));
    return { ...visibleDefaultPrices(), ...visibleOverrides };
  }

  function priceModelMeta(model) {
    const name = UTIL.normalizeText(model, 120);
    if (!name) return null;
    const key = Object.keys(DEFAULT_PRICE_META).find((item) => item.toLowerCase() === name.toLowerCase());
    return key ? DEFAULT_PRICE_META[key] : null;
  }

  // 用户是否用过这些模型：实时检测、最近一轮、本地账本与本地归档都算。
  // 返回小写集合，供列表渲染时一次性复用（避免每个模型都重建归档汇总）。
  function priceUsedModelSet(archiveTurns = null) {
    ensureLocalLedgerLoaded();
    const turns = Array.isArray(archiveTurns) ? archiveTurns : localUsageArchiveTurns();
    const names = [state.detectedModel, state.localLast?.model, ...state.localLedger.map((turn) => turn?.model), ...turns.map((turn) => turn?.model)];
    return new Set(names.map((name) => UTIL.normalizeText(name, 120).toLowerCase()).filter(Boolean));
  }

  // 默认展示：gpt 的对话/推理模型（chat/responses）且未过期；其余模型（o 系列、
  // 图像模型、非 openai 模型等）只有用户使用过后才出现在「模型价格」里。
  // 「模型价格」只展示 gpt-5.4 及以上版本（含新版本；无版本号的旧系列不展示）。
  function priceModelAtLeastMinVersion(model) {
    const match = UTIL.normalizeText(model, 120).match(/^gpt-(\d+)(?:\.(\d+))?/i);
    if (!match) return false;
    const major = Number(match[1]);
    const minor = Number(match[2] || 0);
    return major > 5 || (major === 5 && minor >= 4);
  }

  // 默认展示：gpt 官方定价页在售、版本 ≥ 5.4 的对话/推理模型；o 系列与
  // 低版本/第三方模型不会因为「用过」而进入列表。
  function priceModelShownByDefault(model, used = null) {
    const name = UTIL.normalizeText(model, 120);
    if (!name || !/^gpt/i.test(name)) return false;
    if (!priceModelAtLeastMinVersion(name)) return false;
    if ((used || priceUsedModelSet()).has(name.toLowerCase())) return true;
    if (!OFFICIAL_PRICE_MODELS.has(name.toLowerCase())) return false;
    const meta = priceModelMeta(name);
    if (!meta) return false;
    if (!PRICE_DISPLAY_MODES.includes(meta.mode)) return false;
    if (meta.deprecationDate) {
      const deprecatedAt = Date.parse(meta.deprecationDate);
      if (Number.isFinite(deprecatedAt) && deprecatedAt <= Date.now()) return false;
    }
    return true;
  }

  // 「用过的模型」只保留 gpt 5.4 及以上：中转/第三方模型与低版本不会进入价格列表。
  function priceListableUsedNames(names) {
    return (Array.isArray(names) ? names : []).filter((name) => /^gpt/i.test(UTIL.normalizeText(name, 120)) && priceModelAtLeastMinVersion(name));
  }

  function priceListModels(extraModel = "") {
    ensureLocalLedgerLoaded();
    const overrides = priceOverrides();
    const archiveTurns = localUsageArchiveTurns();
    const used = priceUsedModelSet(archiveTurns);
    const usedNames = priceListableUsedNames([
      state.detectedModel,
      state.localLast?.model,
      ...state.localLedger.map((turn) => turn?.model),
      ...archiveTurns.map((turn) => turn?.model),
    ]);
    const names = [
      ...Object.keys(DEFAULT_PRICES).filter((name) => priceModelShownByDefault(name, used)),
      ...Object.keys(overrides),
      extraModel,
      ...usedNames,
    ];
    return Array.from(new Set(names.map((name) => UTIL.normalizeText(name, 120)).filter((name) => name && name !== UNKNOWN_MODEL && !priceModelHidden(name)))).sort(
      (a, b) => a.localeCompare(b),
    );
  }

  function priceListModelLabel(model) {
    const name = UTIL.normalizeText(model, 120);
    return priceFor(name) ? name : `${name} · 未定价`;
  }

  function normalizePrice(price) {
    if (!price || typeof price !== "object") return null;
    const input = Number(price.input);
    const output = Number(price.output);
    if (!Number.isFinite(input) && !Number.isFinite(output)) return null;
    const cachedInput = price.cachedInput == null || price.cachedInput === "" ? null : Number(price.cachedInput);
    const cacheWrite = price.cacheWrite == null || price.cacheWrite === "" ? null : Number(price.cacheWrite);
    return {
      input: Number.isFinite(input) && input >= 0 ? input : 0,
      cachedInput: Number.isFinite(cachedInput) && cachedInput >= 0 ? cachedInput : null,
      cacheWrite: Number.isFinite(cacheWrite) && cacheWrite >= 0 ? cacheWrite : null,
      output: Number.isFinite(output) && output >= 0 ? output : 0,
    };
  }

  function normalizeUsage(raw) {
    const u = raw && typeof raw === "object" ? raw : {};
    const rawInput = UTIL.toCount(u.inputTokens ?? u.input_tokens ?? u.prompt_tokens ?? u.promptTokens);
    const explicitInputTotal = UTIL.toCount(u.input ?? u.inputTotalTokens ?? u.input_total_tokens ?? u.prompt_total_tokens ?? u.promptTotalTokens);
    const output = UTIL.toCount(
      u.output ?? u.outputTotalTokens ?? u.output_total_tokens ?? u.outputTokens ?? u.output_tokens ?? u.completion_tokens,
    );
    const reasoningOutputTokens = UTIL.toCount(
      u.reasoningOutputTokens ??
        u.reasoning_output_tokens ??
        u.outputTokensDetails?.reasoningTokens ??
        u.output_tokens_details?.reasoning_tokens ??
        u.completionTokensDetails?.reasoningTokens ??
        u.completion_tokens_details?.reasoning_tokens,
    );
    const cachedTokens = UTIL.toCount(
      u.cached ??
        u.cachedTokens ??
        u.cached_tokens ??
        u.cachedInputTokens ??
        u.cached_input_tokens ??
        u.inputTokensDetails?.cachedTokens ??
        u.input_tokens_details?.cached_tokens ??
        u.promptTokensDetails?.cachedTokens ??
        u.prompt_tokens_details?.cached_tokens,
    );
    const cacheReadTokens = UTIL.toCount(
      u.cachedReadTokens ?? u.cached_read_tokens ?? u.cacheReadTokens ?? u.cache_read_tokens ?? u.cacheReadInputTokens ?? u.cache_read_input_tokens,
    );
    const cacheCreationTokens = UTIL.toCount(u.cacheCreationTokens ?? u.cache_creation_tokens ?? u.cacheCreationInputTokens ?? u.cache_creation_input_tokens);
    const cacheWriteTokens =
      UTIL.toCount(
        u.cacheWriteInputTokens ??
          u.cache_write_input_tokens ??
          u.cacheWriteTokens ??
          u.cache_write_tokens ??
          u.inputTokensDetails?.cacheWriteTokens ??
          u.inputTokensDetails?.cache_write_tokens ??
          u.input_tokens_details?.cacheWriteTokens ??
          u.input_tokens_details?.cache_write_tokens ??
          u.promptTokensDetails?.cacheWriteTokens ??
          u.promptTokensDetails?.cache_write_tokens ??
          u.prompt_tokens_details?.cacheWriteTokens ??
          u.prompt_tokens_details?.cache_write_tokens,
      ) || cacheCreationTokens;
    const cachedReadTokens = cacheReadTokens || cachedTokens;
    const explicitTotal = UTIL.toCount(u.total ?? u.requestTotalTokens ?? u.totalTokens ?? u.total_tokens);
    const contextUsed = UTIL.toCount(u.contextUsed ?? u.context_used ?? u.usedTokens ?? u.used_tokens ?? u.used);
    const contextLimit = UTIL.toCount(
      u.contextLimit ?? u.context_limit ?? u.modelContextWindow ?? u.model_context_window ?? u.contextWindow ?? u.context_window ?? u.limit,
    );
    const inputFromTotal = explicitTotal && explicitTotal >= output ? explicitTotal - output : 0;
    const inputBase = Math.max(explicitInputTotal, rawInput, inputFromTotal);
    const hasSeparateCacheTokens = cacheReadTokens > 0 || cacheCreationTokens > 0;
    const baseForSeparateCache = rawInput || explicitInputTotal || inputFromTotal;
    let input = inputBase;
    if (hasSeparateCacheTokens) input = Math.max(inputBase, baseForSeparateCache + cacheReadTokens + cacheCreationTokens);
    const total = explicitTotal || input + output;
    const cached = cachedReadTokens;
    const hasTokenBreakdown = input > 0 || output > 0 || cached > 0 || cacheCreationTokens > 0 || reasoningOutputTokens > 0 || explicitTotal > 0;
    const exact = hasTokenBreakdown;
    const normalized = { input, output, cached, total, exact };
    if (rawInput && rawInput !== input) normalized.inputTokens = rawInput;
    if (input && rawInput && input !== rawInput) normalized.inputTotalTokens = input;
    if (cachedTokens && cachedTokens !== cached) normalized.cachedTokens = cachedTokens;
    if (cacheReadTokens) normalized.cacheReadTokens = cacheReadTokens;
    if (cachedReadTokens && cachedReadTokens !== cached) normalized.cachedReadTokens = cachedReadTokens;
    if (cacheWriteTokens) normalized.cacheWriteTokens = cacheWriteTokens;
    if (cacheCreationTokens) normalized.cacheCreationTokens = cacheCreationTokens;
    if (reasoningOutputTokens) normalized.reasoningOutputTokens = reasoningOutputTokens;
    if (explicitTotal && explicitTotal !== total) normalized.requestTotalTokens = explicitTotal;
    if (contextUsed) normalized.contextUsed = contextUsed;
    if (contextLimit) normalized.contextLimit = contextLimit;
    return normalized;
  }

  function calcCost(usage, price, options = {}) {
    if (!price) return { value: 0, priced: false };
    const input = UTIL.toCount(usage.input);
    const output = UTIL.toCount(usage.output);
    const cached = Math.min(input, UTIL.toCount(usage.cached));
    const fresh = Math.max(0, input - cached);
    const cacheWrite = Math.min(fresh, UTIL.toCount(usage.cacheWriteTokens ?? usage.cacheCreationTokens));
    const uncached = Math.max(0, fresh - cacheWrite);
    const cachedRate = price.cachedInput ?? price.input;
    const cacheWriteRate = price.cacheWrite ?? price.input;
    const multiplier = options.fastMode === true ? fastModeCostMultiplier(options.model) : 1;
    return {
      value: ((uncached * price.input + cached * cachedRate + cacheWrite * cacheWriteRate + output * price.output) / 1_000_000) * multiplier,
      priced: true,
    };
  }

  function fastModeCostMultiplier(model) {
    const name = UTIL.normalizeText(model, 120).toLowerCase();
    return FAST_MODE_COST_MULTIPLIERS.find((item) => item.pattern.test(name))?.multiplier || 1;
  }

  function costForModelUsage(usage, model, options = {}) {
    const overrides = priceOverrides();
    const key = priceModelKey(model, overrides);
    if (key && priceModelHidden(key)) return { value: 0, priced: true, hidden: true };
    return calcCost(usage, priceFor(model), { ...options, model });
  }

  function addUsage(a, b) {
    const result = {
      input: UTIL.toCount(a.input) + UTIL.toCount(b.input),
      output: UTIL.toCount(a.output) + UTIL.toCount(b.output),
      cached: UTIL.toCount(a.cached) + UTIL.toCount(b.cached),
      total: UTIL.toCount(a.total) + UTIL.toCount(b.total),
    };
    const inputTokens = UTIL.toCount(a.inputTokens) + UTIL.toCount(b.inputTokens);
    const inputTotalTokens = UTIL.toCount(a.inputTotalTokens) + UTIL.toCount(b.inputTotalTokens);
    const cachedTokens = UTIL.toCount(a.cachedTokens) + UTIL.toCount(b.cachedTokens);
    const cacheReadTokens = UTIL.toCount(a.cacheReadTokens) + UTIL.toCount(b.cacheReadTokens);
    const cachedReadTokens = UTIL.toCount(a.cachedReadTokens) + UTIL.toCount(b.cachedReadTokens);
    const cacheWriteTokens = UTIL.toCount(a.cacheWriteTokens ?? a.cacheCreationTokens) + UTIL.toCount(b.cacheWriteTokens ?? b.cacheCreationTokens);
    const cacheCreationTokens = UTIL.toCount(a.cacheCreationTokens) + UTIL.toCount(b.cacheCreationTokens);
    const reasoningOutputTokens = UTIL.toCount(a.reasoningOutputTokens) + UTIL.toCount(b.reasoningOutputTokens);
    if (inputTokens) result.inputTokens = inputTokens;
    if (inputTotalTokens) result.inputTotalTokens = inputTotalTokens;
    if (cachedTokens) result.cachedTokens = cachedTokens;
    if (cacheReadTokens) result.cacheReadTokens = cacheReadTokens;
    if (cachedReadTokens) result.cachedReadTokens = cachedReadTokens;
    if (cacheWriteTokens) result.cacheWriteTokens = cacheWriteTokens;
    if (cacheCreationTokens) result.cacheCreationTokens = cacheCreationTokens;
    if (reasoningOutputTokens) result.reasoningOutputTokens = reasoningOutputTokens;
    if (a.exact || b.exact) result.exact = true;
    return result;
  }

  function aggregateTurnUsage(turn) {
    return (Array.isArray(turn?.calls) ? turn.calls : []).reduce((sum, call) => addUsage(sum, normalizeUsage(call?.usage)), {
      input: 0,
      output: 0,
      cached: 0,
      total: 0,
      exact: true,
    });
  }

  function usageHasCostData(usage) {
    const u = normalizeUsage(usage);
    return UTIL.toCount(u.total) > 0 || UTIL.toCount(u.input) > 0 || UTIL.toCount(u.output) > 0 || UTIL.toCount(u.cached) > 0;
  }

  function costPricedLabel(cost, usage) {
    return !cost?.hidden && cost?.priced === false && usageHasCostData(usage) ? " 未定价" : "";
  }

  function usageKey(usage) {
    return [
      usage.input,
      usage.output,
      usage.cached,
      usage.total,
      usage.inputTokens || 0,
      usage.inputTotalTokens || 0,
      usage.cachedTokens || 0,
      usage.cacheReadTokens || 0,
      usage.cachedReadTokens || 0,
      usage.cacheWriteTokens || usage.cacheCreationTokens || 0,
      usage.cacheCreationTokens || 0,
      usage.reasoningOutputTokens || 0,
    ].join(":");
  }

  function pricedModelUsable(model) {
    return priceUsable(priceFor(model));
  }

  function recentLedgerModel() {
    ensureLocalLedgerLoaded();
    const sessionKey = currentSessionKey();
    const now = Date.now();
    if (
      state.recentLedgerModelLedger === state.localLedger &&
      state.recentLedgerModelRevision === state.localLedgerRevision &&
      state.recentLedgerModelSessionKey === sessionKey &&
      now - state.recentLedgerModelAt < 5000
    ) {
      return state.recentLedgerModel;
    }
    let model = "";
    for (let i = state.localLedger.length - 1; i >= 0; i -= 1) {
      const turn = state.localLedger[i];
      if (turnSessionKey(turn) !== sessionKey) continue;
      const candidate = UTIL.normalizeText(turn?.model, 120);
      if (candidate && candidate !== UNKNOWN_MODEL && pricedModelUsable(candidate)) {
        model = candidate;
        break;
      }
    }
    state.recentLedgerModelLedger = state.localLedger;
    state.recentLedgerModelRevision = state.localLedgerRevision;
    state.recentLedgerModelSessionKey = sessionKey;
    state.recentLedgerModel = model;
    state.recentLedgerModelAt = now;
    return model;
  }

  function cleanupAutoZeroPriceModels() {
    try {
      if (localStorage.getItem(PRICE_MIGRATION_KEY) === PRICE_MIGRATION_VERSION) return false;
    } catch {
      return false;
    }
    const autoZeroModels = ["gpt-5.4-nano"];
    const overrides = { ...priceOverrides() };
    const hidden = hiddenPriceModels();
    let changed = false;
    for (const model of autoZeroModels) {
      const key = Object.keys(overrides).find((item) => item.toLowerCase() === model.toLowerCase());
      const price = normalizePrice(key ? overrides[key] : null);
      if (key && price && ![price.input, price.cachedInput, price.cacheWrite, price.output].some((value) => Number(value) > 0)) {
        delete overrides[key];
        changed = true;
      }
      for (const hiddenModel of Array.from(hidden)) {
        if (hiddenModel.toLowerCase() !== model.toLowerCase()) continue;
        hidden.delete(hiddenModel);
        changed = true;
      }
    }
    const staleSolKey = priceModelKey("gpt-5.6-sol", overrides);
    const staleSolPrice = normalizePrice(overrides[staleSolKey]);
    if (
      staleSolKey &&
      staleSolPrice?.input === 5 &&
      staleSolPrice.cachedInput === 0.5 &&
      staleSolPrice.cacheWrite === 6 &&
      staleSolPrice.output === 30
    ) {
      delete overrides[staleSolKey];
      changed = true;
    }
    try {
      if (changed) {
        localStorage.setItem(PRICE_OVERRIDES_KEY, JSON.stringify(overrides));
        invalidatePriceOverridesCache();
        saveHiddenPriceModels(hidden);
        void priceCacheFlush();
      }
      localStorage.setItem(PRICE_MIGRATION_KEY, PRICE_MIGRATION_VERSION);
    } catch {
      return false;
    }
    return changed;
  }

  function metricUsageKey(metric) {
    return usageKey(normalizeUsage(metric?.usage));
  }

  function locationSessionKey() {
    const href = String(location?.href || "");
    try {
      const url = new URL(href || "app://-/");
      return `${url.pathname || "/"}${url.search || ""}${url.hash || ""}`;
    } catch {
      return String(location?.pathname || "/") || "/";
    }
  }

  function activeSidebarThreadKey(doc = document) {
    if (recentNewConversationSessionKey()) return "";
    const activeElementKey = sidebarThreadKeyFromNode(doc?.activeElement);
    if (activeElementKey) {
      state.lastClickedSidebarThreadKey = resolveSessionKey(activeElementKey);
      state.lastClickedSidebarThreadAt = Date.now();
      return state.lastClickedSidebarThreadKey;
    }
    const selectors = [
      "[data-app-action-sidebar-thread-active='true'][data-app-action-sidebar-thread-id]",
      "[aria-current='page'][data-app-action-sidebar-thread-id]",
      "[aria-selected='true'][data-app-action-sidebar-thread-id]",
      "[data-state='active'][data-app-action-sidebar-thread-id]",
      "[data-active='true'][data-app-action-sidebar-thread-id]",
      "[data-selected='true'][data-app-action-sidebar-thread-id]",
    ];
    for (const selector of selectors) {
      const node = doc?.querySelector?.(selector);
      const id = sidebarThreadKeyFromNode(node);
      if (id) return resolveSessionKey(id);
    }
    if (state.lastClickedSidebarThreadKey && Date.now() - state.lastClickedSidebarThreadAt < 30000) return state.lastClickedSidebarThreadKey;
    return "";
  }

  function hasActiveSidebarThreadDom(doc = document) {
    const selectors = [
      "[data-app-action-sidebar-thread-active='true'][data-app-action-sidebar-thread-id]",
      "[aria-current='page'][data-app-action-sidebar-thread-id]",
      "[aria-selected='true'][data-app-action-sidebar-thread-id]",
      "[data-state='active'][data-app-action-sidebar-thread-id]",
      "[data-active='true'][data-app-action-sidebar-thread-id]",
      "[data-selected='true'][data-app-action-sidebar-thread-id]",
    ];
    return selectors.some((selector) => Boolean(sidebarThreadKeyFromNode(doc?.querySelector?.(selector))));
  }

  function sidebarThreadKeyFromNode(node) {
    const target = node?.closest?.("[data-app-action-sidebar-thread-id]") || node;
    return UTIL.normalizeText(target?.getAttribute?.("data-app-action-sidebar-thread-id"), 240);
  }

  function knownLedgerSessionKeys() {
    if (state.knownSessionKeysLedger === state.localLedger && state.knownSessionKeysRevision === state.localLedgerRevision) {
      return state.knownSessionKeys;
    }
    const keys = new Set();
    for (const turn of state.localLedger) {
      const key = turnSessionKey(turn);
      if (key) keys.add(key);
    }
    state.knownSessionKeysLedger = state.localLedger;
    state.knownSessionKeysRevision = state.localLedgerRevision;
    state.knownSessionKeys = keys;
    return keys;
  }

  function resolveSessionKey(value) {
    const key = UTIL.normalizeText(value, 240);
    if (!key) return "";
    const alias = state.sessionAliases.get(key.replace(/^local:/, ""));
    if (alias) return alias;
    ensureLocalLedgerLoaded();
    const known = knownLedgerSessionKeys();
    if (known.has(key)) return key;
    if (key.startsWith("local:")) {
      const stripped = key.slice("local:".length);
      if (known.has(stripped)) return stripped;
    } else {
      const localKey = `local:${key}`;
      if (known.has(localKey)) return localKey;
    }
    return key;
  }

  function isClientNewThreadKey(value) {
    return /^local:client-new-thread:|^client-new-thread:/i.test(UTIL.normalizeText(value, 240));
  }

  function rememberSessionAlias(sourceValue, targetValue) {
    const sourceKey = UTIL.normalizeText(sourceValue, 240);
    const targetKey = UTIL.normalizeText(targetValue, 240);
    if (!isClientNewThreadKey(sourceKey) || !targetKey || isClientNewThreadKey(targetKey) || sameSessionKey(sourceKey, targetKey)) return false;
    state.sessionAliases.set(sourceKey.replace(/^local:/, ""), targetKey);
    ensureLocalLedgerLoaded();
    for (const turn of state.localLedger) {
      if (!sameSessionKey(turnSessionKey(turn), sourceKey)) continue;
      turn.sessionKey = targetKey;
      turn.threadKey = targetKey;
    }
    if (sameSessionKey(turnSessionKey(state.localLast), sourceKey)) {
      state.localLast.sessionKey = targetKey;
      state.localLast.threadKey = targetKey;
    }
    for (const [candidateKey, turn] of state.localCurrentTurns.entries()) {
      if (!sameSessionKey(candidateKey, sourceKey)) continue;
      state.localCurrentTurns.delete(candidateKey);
      turn.sessionKey = targetKey;
      state.localCurrentTurns.set(targetKey, turn);
    }
    for (const map of [state.turnShimmerSessions, state.localTurnTimers, state.officialThreadRuntimeStates]) {
      for (const [candidateKey, item] of map.entries()) {
        if (!sameSessionKey(candidateKey, sourceKey)) continue;
        map.delete(candidateKey);
        if (!map.has(targetKey)) map.set(targetKey, item);
      }
    }
    if (sameSessionKey(state.lastClickedSidebarThreadKey, sourceKey)) state.lastClickedSidebarThreadKey = targetKey;
    if (sameSessionKey(state.userSelectedSidebarThreadKey, sourceKey)) state.userSelectedSidebarThreadKey = targetKey;
    saveLocalLedger();
    syncActiveLocalCurrentTurn();
    syncActiveTurnShimmerState();
    return true;
  }

  function recentDetectedSessionKey() {
    return state.detectedSessionKey && Date.now() - state.detectedSessionKeyAt < 10 * 60 * 1000 ? state.detectedSessionKey : "";
  }

  function recentNewConversationSessionKey() {
    return state.newConversationSessionKey && Date.now() - state.newConversationSessionKeyAt < 10 * 60 * 1000 ? state.newConversationSessionKey : "";
  }

  function recentUserSelectedSidebarThreadKey(doc = document) {
    const activeKey = activeSidebarThreadKey(doc);
    if (activeKey && !sameSessionKey(activeKey, state.userSelectedSidebarThreadKey)) {
      state.userSelectedSidebarThreadKey = activeKey;
      state.userSelectedSidebarThreadAt = Date.now();
      return activeKey;
    }
    if (state.userSelectedSidebarThreadKey && isStructurallyBlankConversationDom(doc) && !hasRunningConversationState([state.userSelectedSidebarThreadKey])) return "";
    return state.userSelectedSidebarThreadKey || "";
  }

  function isRunningConversationState(sessionKey) {
    const key = localStateSessionKey(sessionKey);
    if (!key || isTransientSessionKey(key)) return false;
    const turn = state.localCurrentTurns.get(key);
    if (turn) return true;
    const shimmer = state.turnShimmerSessions.get(key);
    if (shimmer?.running) return true;
    const official = state.officialThreadRuntimeStates.get(key);
    return Boolean(official?.running);
  }

  function hasRunningConversationState(sessionKeys = null) {
    if (Array.isArray(sessionKeys)) {
      const keys = sessionKeys.map(localStateSessionKey).filter((key) => key && !isTransientSessionKey(key));
      if (keys.length) return keys.some(isRunningConversationState);
    }
    for (const [sessionKey, turn] of state.localCurrentTurns.entries()) {
      if (turn && !isTransientSessionKey(sessionKey)) return true;
    }
    for (const [sessionKey, item] of state.turnShimmerSessions.entries()) {
      if (item?.running && !isTransientSessionKey(sessionKey)) return true;
    }
    for (const [sessionKey, item] of state.officialThreadRuntimeStates.entries()) {
      if (item?.running && !isTransientSessionKey(sessionKey)) return true;
    }
    return false;
  }

  function hasLocalThreadContentEvidence(sessionKey) {
    const key = localStateSessionKey(sessionKey);
    if (!key || isTransientSessionKey(key)) return false;
    if (localCurrentTurn(key) || isTurnShimmerRunning(key) || isOfficialThreadRunning(key)) return true;
    return currentSessionTurns(state.localLedger, key).length > 0;
  }

  function conversationContentState(sessionKey, doc = document) {
    const key = localStateSessionKey(sessionKey);
    if (!key || isTransientSessionKey(key)) return { state: "unknown", sessionKey: key, source: "none" };
    if (hasLocalThreadContentEvidence(key)) return { state: "non_empty", sessionKey: key, source: "local" };
    if (hasConversationTranscriptDom(doc)) return { state: "non_empty", sessionKey: key, source: "dom" };
    return { state: "unknown", sessionKey: key, source: "none" };
  }

  function hasStartupComposerSurface(doc = document) {
    const main = doc?.querySelector?.("main");
    if (!main) return false;
    return Boolean(
      main.querySelector?.(
        [
          "[data-codex-composer]",
          ".ProseMirror[contenteditable='true']",
          "[role='textbox'][contenteditable='true']",
          "textarea",
        ].join(","),
      ),
    );
  }

  function hasConversationTranscriptDom(doc = document) {
    const main = doc?.querySelector?.("main");
    if (!main) return false;
    return Boolean(
      main.querySelector?.(
        [
          "article",
          "[data-message-author-role]",
          "[data-turn-id]",
          "[data-thread-id]",
          "[data-response-item-id]",
          "[data-codex-turn]",
          "[data-codex-message]",
          "[data-testid*='conversation-turn']",
          "[data-testid*='message-row']",
          "[data-testid*='chat-message']",
        ].join(","),
      ),
    );
  }

  function isStructurallyBlankConversationDom(doc = document) {
    const main = doc?.querySelector?.("main");
    if (!main) return false;
    if (hasActiveSidebarThreadDom(doc)) return false;
    if (!hasStartupComposerSurface(doc)) return false;
    if (hasConversationTranscriptDom(doc)) return false;
    return true;
  }

  function startupBlankConversationSessionKey(doc = document) {
    const main = doc?.querySelector?.("main");
    if (!main) return "";
    const detectedKey = recentDetectedSessionKey();
    const selectedKey = state.userSelectedSidebarThreadKey || "";
    const runningCandidates = [detectedKey, selectedKey].filter(Boolean);
    if (hasRunningConversationState(runningCandidates.length ? runningCandidates : null)) return "";
    if (!isStructurallyBlankConversationDom(doc)) return "";
    return "new:auto";
  }

  function startupResetSessionKey() {
    if (state.localCurrentTurn) return "";
    if (recentDetectedSessionKey() || recentNewConversationSessionKey()) return "";
    if (hasActiveSidebarThreadDom()) return "";
    if (state.lastClickedSidebarThreadKey && Date.now() - state.lastClickedSidebarThreadAt < 30000) return "";
    return state.startupSessionKey;
  }

  function invalidateSessionKeyCache() {
    state.sessionKeyCacheAt = 0;
    state.sessionKeyCacheKey = "";
  }

  function computeCurrentSessionKey() {
    return (
      recentNewConversationSessionKey() ||
      startupBlankConversationSessionKey() ||
      recentUserSelectedSidebarThreadKey() ||
      recentDetectedSessionKey() ||
      startupResetSessionKey() ||
      activeSidebarThreadKey() ||
      locationSessionKey()
    );
  }

  function currentSessionKey() {
    // 测试环境允许随意替换假 DOM，跳过缓存以保证断言即时生效。
    if (window.__CODEX_LIVE_TOKEN_COST_TEST__) return computeCurrentSessionKey();
    const now = Date.now();
    if (state.sessionKeyCacheAt && now - state.sessionKeyCacheAt < SESSION_KEY_CACHE_MS) return state.sessionKeyCacheKey;
    const key = computeCurrentSessionKey();
    state.sessionKeyCacheAt = now;
    state.sessionKeyCacheKey = key;
    return key;
  }

  function localStateSessionKey(sessionKey = currentSessionKey()) {
    const key = UTIL.normalizeText(sessionKey, 240) || locationSessionKey();
    return state.sessionAliases.get(key.replace(/^local:/, "")) || key;
  }

  function isActiveLocalStateSession(sessionKey = currentSessionKey()) {
    return sameSessionKey(localStateSessionKey(sessionKey), currentSessionKey());
  }

  function localCurrentTurn(sessionKey = currentSessionKey()) {
    const key = localStateSessionKey(sessionKey);
    const exact = state.localCurrentTurns.get(key);
    if (exact) return exact;
    for (const [candidateKey, turn] of state.localCurrentTurns.entries()) {
      if (sameSessionKey(candidateKey, key)) return turn;
    }
    return null;
  }

  function syncActiveLocalCurrentTurn() {
    const previous = state.localCurrentTurn;
    state.localCurrentTurn = localCurrentTurn(currentSessionKey());
    if (previous !== state.localCurrentTurn) cancelOutputRateRefresh();
    return state.localCurrentTurn;
  }

  function setLocalCurrentTurn(turn, sessionKey = turn?.sessionKey || currentSessionKey()) {
    const key = localStateSessionKey(sessionKey);
    if (turn) {
      turn.sessionKey = key;
      turn.threadKey = localStateSessionKey(turn.threadKey || key);
      state.localCurrentTurns.set(key, turn);
    } else {
      state.localCurrentTurns.delete(key);
      if (sameSessionKey(state.localCurrentTurn?.sessionKey, key)) state.localCurrentTurn = null;
    }
    syncActiveLocalCurrentTurn();
    return turn || null;
  }

  function migrateLegacyLocationSessionTurns(sessionKey = currentSessionKey()) {
    const targetKey = UTIL.normalizeText(sessionKey, 240);
    const legacyKey = UTIL.normalizeText(locationSessionKey(), 240);
    if (targetKey.startsWith("new:")) return 0;
    if (!targetKey || !legacyKey || targetKey === legacyKey || state.legacySessionMigrations.has(targetKey)) return 0;
    state.legacySessionMigrations.add(targetKey);
    ensureLocalLedgerLoaded();
    if (state.localLedger.some((turn) => turnSessionKey(turn) === targetKey)) return 0;
    let migrated = 0;
    for (const turn of state.localLedger) {
      if (turn?.source !== "codex-live-token-cost" || turnSessionKey(turn) !== legacyKey) continue;
      turn.sessionKey = targetKey;
      turn.threadKey = targetKey;
      migrated += 1;
    }
    if (state.localLast?.source === "codex-live-token-cost" && turnSessionKey(state.localLast) === legacyKey) {
      state.localLast.sessionKey = targetKey;
      state.localLast.threadKey = targetKey;
    }
    const legacyCurrentTurn = localCurrentTurn(legacyKey);
    if (legacyCurrentTurn) {
      setLocalCurrentTurn(null, legacyKey);
      setLocalCurrentTurn(legacyCurrentTurn, targetKey);
    }
    if (migrated > 0) saveLocalLedger();
    return migrated;
  }

  function turnSessionKey(turn) {
    return UTIL.normalizeText(turn?.threadKey || turn?.sessionKey || turn?.conversationKey || turn?.threadId || turn?.conversationId, 240);
  }

  function sameSessionKey(left, right) {
    const a = UTIL.normalizeText(left, 240);
    const b = UTIL.normalizeText(right, 240);
    if (!a || !b) return false;
    if (a === b) return true;
    return a.replace(/^local:/, "") === b.replace(/^local:/, "");
  }

  function codexppHistoryTurnsFromPayload(payload, sessionKey = "") {
    const entries = Array.isArray(payload?.history) ? payload.history : [];
    const key = UTIL.normalizeText(sessionKey, 240).replace(/^local:/, "");
    const byTurn = new Map();
    for (const entry of entries) {
      const usage = normalizeUsage(entry?.usage || {
        inputTokens: entry?.inputTokens ?? entry?.input_tokens,
        outputTokens: entry?.outputTokens ?? entry?.output_tokens,
        cachedTokens: entry?.cachedTokens ?? entry?.cached_tokens,
        totalTokens: entry?.totalTokens ?? entry?.total_tokens,
      });
      if (!usage.exact) continue;
      const conversationId = UTIL.normalizeText(entry?.conversation_id ?? entry?.conversationId ?? entry?.sessionId ?? entry?.session_id ?? key, 240);
      const turnId = UTIL.normalizeText(entry?.turn_id ?? entry?.turnId ?? entry?.id, 240);
      if (!turnId && !conversationId) continue;
      const observedAt = UTIL.toTimestampMs(entry?.observed_at ?? entry?.observedAt) || Date.now();
      const turn = {
        turnId: turnId || `codexpp-history:${conversationId}:${usageKey(usage)}`,
        source: "codexpp-history",
        importSource: "codexpp-history",
        sessionKey: conversationId ? `local:${conversationId}` : "",
        threadKey: conversationId ? `local:${conversationId}` : "",
        model: UTIL.normalizeText(entry?.model ?? entry?.request_model ?? activeModelInfo().model, 120) || UNKNOWN_MODEL,
        createdAt: new Date(observedAt).toISOString(),
        observedAt,
        usage,
        callCount: 1,
        timeGranularity: "hour",
      };
      // 上游按轮次累积 token_count，同一 turn 只保留最后一条，避免中间值重复计入。
      const groupKey = `${conversationId}\u0001${turnId || turn.turnId}`;
      byTurn.set(groupKey, turn);
    }
    return Array.from(byTurn.values());
  }

  function codexppTokenKey(turn) {
    const usage = normalizeUsage(turn?.usage);
    return `${UTIL.toCount(usage.input)}:${UTIL.toCount(usage.output)}:${UTIL.toCount(usage.cached)}:${UTIL.toCount(usage.total)}`;
  }

  // 本地优先，codexpp 历史只补本地没有的 token 构成，避免重复计数。
  function mergeCodexppHistoryTurns(localTurns) {
    const seen = new Set((Array.isArray(localTurns) ? localTurns : []).map(codexppTokenKey));
    const extra = (Array.isArray(state.codexppHistoryTurns) ? state.codexppHistoryTurns : []).filter((turn) => {
      const key = codexppTokenKey(turn);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    return [...(Array.isArray(localTurns) ? localTurns : []), ...extra];
  }

  // 使用统计合并 Profile Ledger（IDB）里的回填数据：turnId 优先去重，其次按
  // response_id 重叠去重（实时行与 rollout 行的 turnId 可能不同），最后按用量签名兜底。
  // 三层都是为了同一个目标：同一份响应只计入一次。
  // ---------------------------------------------------------------------------
  // 模块 13：账本合并与归档
  // 去重链：turnId → codexppTokenKey → responseId 重叠 → ±180s 逐响应窗口。
  // legacy / Profile 回退行不得叠在逐响应事实之上。
  // ---------------------------------------------------------------------------
  function mergeProfileLedgerTurns(turns) {
    const base = (Array.isArray(turns) ? turns : []).slice();
    const ids = new Set();
    const keys = new Set();
    const responseIds = new Set();
    const remember = (turn) => {
      const id = UTIL.normalizeText(turn?.turnId, 240);
      if (id) ids.add(id);
      const key = codexppTokenKey(turn);
      if (key) keys.add(key);
      for (const responseId of usageTurnResponseIdList(turn)) responseIds.add(responseId);
    };
    for (const turn of base) remember(turn);
    // 事实/回溯行没有 response_id 时无法按 id 去重；旧实时行只记了单次调用，
    // 会落在同一轮的时间窗里。同一会话内已被逐响应行覆盖的时间窗不再重复计入。
    const factWindows = base
      .filter((turn) => usageTurnResponseIdList(turn).length > 0)
      .map((turn) => ({
        session: turnSessionKey(turn),
        start: UTIL.toTimestampMs(turn?.startedAt || turn?.createdAt || turn?.observedAt),
        end: UTIL.toTimestampMs(turn?.finishedAt) || UTIL.toTimestampMs(turn?.startedAt || turn?.createdAt || turn?.observedAt),
      }))
      .filter((window) => window.session && window.start);
    const coveredByFactWindow = (turn) => {
      if (usageTurnResponseIdList(turn).length > 0) return false;
      const session = turnSessionKey(turn);
      const start = UTIL.toTimestampMs(turn?.startedAt || turn?.createdAt || turn?.observedAt);
      if (!session || !start) return false;
      return factWindows.some((window) => {
        if (!sameSessionKey(session, window.session)) return false;
        if (start >= window.start - 180000 && start <= window.end + 180000) return true;
        return false;
      });
    };
    const extra = [];
    for (const turn of ensureProfileLedgerLoaded().turns || []) {
      if (!normalizeUsage(turn?.usage).exact) continue;
      const id = UTIL.normalizeText(turn?.turnId, 240);
      if (id && ids.has(id)) continue;
      const key = codexppTokenKey(turn);
      if (key && keys.has(key)) continue;
      if (usageTurnResponseIdList(turn).some((responseId) => responseIds.has(responseId))) continue;
      if (coveredByFactWindow(turn)) continue;
      remember(turn);
      extra.push(turn);
    }
    return base.concat(extra);
  }

  function currentSessionTurns(turns, key = currentSessionKey()) {
    const sessionKey = UTIL.normalizeText(key, 240);
    if (isTransientSessionKey(sessionKey) || !Array.isArray(turns)) return [];
    let byKey = state.currentSessionTurnsCache.get(turns);
    if (!byKey) {
      byKey = new Map();
      state.currentSessionTurnsCache.set(turns, byKey);
    }
    if (byKey.has(sessionKey)) return byKey.get(sessionKey);
    const filtered = turns.filter((turn) => sameSessionKey(turnSessionKey(turn), sessionKey));
    byKey.set(sessionKey, filtered);
    return filtered;
  }

  function loadDailyLedger() {
    const date = todayKey();
    const saved = UTIL.loadJson(DAILY_USAGE_KEY, null);
    if (saved?.date === date && Array.isArray(saved.items)) {
      return { date, items: saved.items.slice(-500) };
    }
    return { date, items: [] };
  }

  function isQuotaStorageError(error) {
    const name = String(error?.name || "");
    const message = String(error?.message || "");
    return (
      error?.code === 22 ||
      error?.code === 1014 ||
      /quota|exceeded/i.test(name) ||
      /quota|exceeded/i.test(message)
    );
  }

  function saveDailyLedger(ledger) {
    const items = Array.isArray(ledger?.items) ? ledger.items.slice(-500) : [];
    let saved = false;
    for (const limit of DAILY_LEDGER_QUOTA_TRIM_LIMITS) {
      try {
        localStorage.setItem(DAILY_USAGE_KEY, JSON.stringify({ date: ledger.date, items: limit > 0 ? items.slice(-limit) : [] }));
        saved = true;
        break;
      } catch (error) {
        if (!isQuotaStorageError(error)) {
          state.dailyLedgerSaveError = "storage";
          break;
        }
      }
    }
    state.dailyLedgerSaveError = saved ? "" : state.dailyLedgerSaveError || "quota";
    return saved;
  }

  function loadLocalLedger() {
    const saved = UTIL.loadJson(LOCAL_USAGE_KEY, null);
    state.localLedgerLoaded = true;
    if (!Array.isArray(saved?.turns)) return;
    const valid = saved.turns.filter((item) => normalizeUsage(item?.usage).exact);
    // 2000 是 UI 快照窗口，不是会计上限：事实层在 IndexedDB 里是永久的。
    const compacted = compactLocalLedger(saved.turns, saved.archive);
    const removedEntries = compacted.turns.length !== valid.length;
    state.localLedger = compacted.turns;
    state.localUsageArchive = compacted.archive;
    invalidateLocalUsageCache();
    state.localLast = state.localLedger[state.localLedger.length - 1] || null;
    state.localTurnSeq = UTIL.toCount(saved.seq);
    for (const [sourceKey, targetKey] of Object.entries(saved.sessionAliases || {})) {
      if (!isClientNewThreadKey(sourceKey) || !targetKey || isClientNewThreadKey(targetKey)) continue;
      state.sessionAliases.set(sourceKey.replace(/^local:/, ""), UTIL.normalizeText(targetKey, 240));
    }
    if (removedEntries || isTransientSessionKey(turnSessionKey(saved.last))) saveLocalLedger();
  }

  function ensureLocalLedgerLoaded() {
    if (!state.localLedgerLoaded) loadLocalLedger();
  }

  // localStorage 镜像：UI 快照窗口，按字节预算而不是条数裁剪。
  // 方案 §4.9：2,000 只是旧版容量代理，真实约束是字节数。
  // 实测真实 turn 平均 ~7 KB（其中 calls[] 占 72%），条数上限会先撞配额。
  const LOCAL_LEDGER_SNAPSHOT_BUDGETS = [512 * 1024, 256 * 1024, 128 * 1024, 64 * 1024, 32 * 1024];

  // 镜像里剥掉持久化后从不被读取的字段：calls[] 只有 usage+callCount 被下游消费。
  // 隐私（P2 #4）：命令输出 / 消息正文 / 工具参数从不入库，这里再做一道显式白名单外的
  // 剔除，防止未来某个调用方把 payload 原文挂到 turn 上被一起持久化。
  const LOCAL_LEDGER_MIRROR_STRIP_FIELDS = [
    "calls",
    "items",
    "text",
    "content",
    "output",
    "stdout",
    "stderr",
    "command",
    "arguments",
    "outputText",
    "itemText",
    "rawPayload",
    "payload",
  ];

  function localLedgerMirrorTurn(turn) {
    if (!turn || typeof turn !== "object") return turn;
    const mirror = { ...turn };
    for (const field of LOCAL_LEDGER_MIRROR_STRIP_FIELDS) {
      if (field in mirror) delete mirror[field];
    }
    return mirror;
  }

  // 预算按 UTF-8 字节算：模型名可能是中文（1 字符 = 3 字节），
  // 用 String.length 会低估体积，导致镜像实际写超 512K。
  let localLedgerUtf8Encoder = null;
  function localLedgerByteLength(text) {
    const value = String(text || "");
    try {
      if (!localLedgerUtf8Encoder) localLedgerUtf8Encoder = new TextEncoder();
      return localLedgerUtf8Encoder.encode(value).length;
    } catch {
      return value.length;
    }
  }

  function localLedgerMirrorBytes(turns, extra = {}) {
    return localLedgerByteLength(JSON.stringify({ turns: turns.map(localLedgerMirrorTurn), ...extra }));
  }

  function localLedgerMirrorTurnBytes(turn) {
    return localLedgerByteLength(JSON.stringify(localLedgerMirrorTurn(turn))) + 1;
  }

  // 在字节预算内，从最新往回装近期 turn；装不下的旧 turn 由调用方折进日归档。
  // 事实行（有 responseIds）永久在 IndexedDB，不参与这个窗口的裁剪。
  // 在字节预算内，从最新往回装近期 turn；装不下的旧 turn 由调用方折进日归档。
  // 事实行（有 responseIds）永久在 IndexedDB，不参与这个窗口的裁剪。
  // 在字节预算内，从最新往回装近期 turn；装不下的旧 turn 由调用方折进日归档。
  // 预算覆盖整个载荷（turns + archive + last + 别名），不只是 turns。
  function localLedgerSnapshotByBudget(turns, budget, extra = {}) {
    const limit = Math.max(0, UTIL.toCount(budget));
    if (!limit) return [];
    const ephemeral = turns.filter((turn) => !isFactLedgerTurn(turn));
    const permanent = turns.filter(isFactLedgerTurn);
    const overhead = localLedgerMirrorBytes([], extra);
    const snapshot = [];
    let size = overhead;
    // 事实行也占预算：它们虽然永久存在 IndexedDB，镜像里放不下就只留最近的一部分。
    for (let index = permanent.length - 1; index >= 0; index -= 1) {
      const turn = permanent[index];
      const turnSize = localLedgerMirrorTurnBytes(turn);
      if (size + turnSize > limit) break;
      snapshot.push(turn);
      size += turnSize;
    }
    for (let index = ephemeral.length - 1; index >= 0; index -= 1) {
      const turn = ephemeral[index];
      const turnSize = localLedgerMirrorTurnBytes(turn);
      if (size + turnSize > limit) break;
      snapshot.push(turn);
      size += turnSize;
    }
    // 事实行放不下的部分不进归档：它们在 IndexedDB 里是永久事实。
    return snapshot.reverse();
  }

  // 降级模式：IndexedDB 不可用时，localStorage 成为唯一副本。
  // 方案 §4.9.1 的淘汰顺序：先写主机快照 → 快照校验通过才允许裁剪 →
  // 按冷度淘汰（保护当前会话/最近 24 小时）→ 任何一步会删掉「唯一副本」就停止并告警。
  const USAGE_FALLBACK_MIN_RECENT_TURNS = 200;
  const USAGE_FALLBACK_RETENTION_DAYS = 180;
  const USAGE_FALLBACK_PROTECT_HOURS = 24;

  // 只读保护判定：当前会话、最近 N 小时、最近 M 轮的 turn 不先被淘汰。
  function usageFallbackProtectedTurns(turns, options = {}) {
    const now = UTIL.toCount(options.now) || Date.now();
    const activeKey = UTIL.normalizeText(options.activeSessionKey, 240);
    const protectMs = Math.max(0, UTIL.toCount(options.protectHours) || USAGE_FALLBACK_PROTECT_HOURS) * 60 * 60 * 1000;
    const minRecent = Math.max(0, UTIL.toCount(options.minRecent) || USAGE_FALLBACK_MIN_RECENT_TURNS);
    const cutoff = now - protectMs;
    const protectedIds = new Set();
    const items = Array.isArray(turns) ? turns : [];
    for (const turn of items) {
      const key = turnSessionKey(turn);
      if (activeKey && key && sameSessionKey(key, activeKey)) {
        protectedIds.add(UTIL.normalizeText(turn?.turnId, 240));
        continue;
      }
      const stamp = turnTimestampMs(turn);
      if (stamp && stamp >= cutoff) protectedIds.add(UTIL.normalizeText(turn?.turnId, 240));
    }
    // 最近 M 轮永远保护（末尾的）。
    for (let index = Math.max(0, items.length - minRecent); index < items.length; index += 1) {
      protectedIds.add(UTIL.normalizeText(items[index]?.turnId, 240));
    }
    return protectedIds;
  }

  // 降级裁剪：按冷度淘汰，返回被淘汰的 turn（调用方负责折进归档）。
  // 不静默丢唯一副本：若归档后仍超预算，返回 blocked 标志让调用方告警。
  function usageFallbackEvict(turns, budget, options = {}) {
    const limit = Math.max(0, UTIL.toCount(budget));
    const items = Array.isArray(turns) ? turns : [];
    if (!limit) return { evicted: [], kept: items.slice(), blocked: false, protectedCount: 0 };
    const protectedIds = usageFallbackProtectedTurns(items, options);
    const snapshot = localLedgerSnapshotByBudget(items, limit, options.extra || {});
    const keptIds = new Set(snapshot.map((turn) => UTIL.normalizeText(turn?.turnId, 240)));
    const evicted = [];
    let protectedCount = 0;
    for (const turn of items) {
      const id = UTIL.normalizeText(turn?.turnId, 240);
      if (keptIds.has(id)) continue;
      if (protectedIds.has(id)) {
        protectedCount += 1;
        continue;
      }
      evicted.push(turn);
    }
    return { evicted, kept: snapshot, blocked: protectedCount > 0, protectedCount };
  }

  function saveLocalLedger() {
    const compacted = compactLocalLedger(state.localLedger, state.localUsageArchive);
    state.localLedger = compacted.turns;
    state.localUsageArchive = compacted.archive;
    invalidateLocalUsageCache();
    if (isTransientSessionKey(turnSessionKey(state.localLast))) state.localLast = state.localLedger[state.localLedger.length - 1] || null;
    let saved = false;
    let evictedDates = [];
    // 降级模式（IndexedDB 不可用）：localStorage 是唯一副本，必须先写主机快照才允许裁剪。
    if (state.usageFactDegraded) {
      for (const budget of LOCAL_LEDGER_SNAPSHOT_BUDGETS) {
        const eviction = usageFallbackEvict(compacted.turns, budget, {
          activeSessionKey: currentSessionKey(),
          extra: { archive: state.localUsageArchive, last: state.localLast, seq: state.localTurnSeq, sessionAliases: Object.fromEntries(state.sessionAliases) },
        });
        const candidate = {
          turns: eviction.kept,
          archive: mergeLocalUsageArchive(state.localUsageArchive, eviction.evicted),
          dates: usageTurnsDayDates(eviction.evicted),
        };
        try {
          localStorage.setItem(
            LOCAL_USAGE_KEY,
            JSON.stringify({
              turns: candidate.turns.map(localLedgerMirrorTurn),
              archive: candidate.archive,
              last: localLedgerMirrorTurn(state.localLast),
              seq: state.localTurnSeq,
              sessionAliases: Object.fromEntries(state.sessionAliases),
            }),
          );
          state.localUsageArchive = candidate.archive;
          evictedDates = candidate.dates || [];
          if (eviction.blocked) {
            // 还有受保护的 turn 装不下：要求用户导出，绝不静默丢唯一副本。
            state.localLedgerSaveError = "protected";
            state.usageHostBackupStatus = `降级存储：${eviction.protectedCount} 个受保护的 turn 超出预算，请先导出备份再清理`;
          } else {
            state.localLedgerSaveError = "";
          }
          saved = true;
          break;
        } catch (error) {
          if (!isQuotaStorageError(error)) {
            state.localLedgerSaveError = "storage";
            break;
          }
        }
      }
      refreshAnalyticsRollupDates([...compacted.dates, ...evictedDates]);
      return saved;
    }
    for (const budget of LOCAL_LEDGER_SNAPSHOT_BUDGETS) {
      // localStorage 只是 UI 快照窗口：按字节预算装最近若干 turn，事实行永不进归档。
      const snapshot = localLedgerSnapshotByBudget(compacted.turns, budget, { archive: state.localUsageArchive, last: state.localLast, seq: state.localTurnSeq, sessionAliases: Object.fromEntries(state.sessionAliases) });
      const kept = new Set(snapshot);
      const evicted = compacted.turns.filter((turn) => !kept.has(turn) && !isFactLedgerTurn(turn));
      const candidate = {
        turns: snapshot,
        // 装不下的旧 turn 折进日归档：归档是派生汇总，不是唯一副本。
        archive: mergeLocalUsageArchive(state.localUsageArchive, evicted),
        dates: usageTurnsDayDates(evicted),
      };
      try {
        localStorage.setItem(
          LOCAL_USAGE_KEY,
          JSON.stringify({
            turns: candidate.turns.map(localLedgerMirrorTurn),
            archive: candidate.archive,
            last: localLedgerMirrorTurn(state.localLast),
            seq: state.localTurnSeq,
            sessionAliases: Object.fromEntries(state.sessionAliases),
          }),
        );
        // 内存账本保留全部 turn；localStorage 只是快照窗口。
        state.localUsageArchive = candidate.archive;
        evictedDates = candidate.dates || [];
        saved = true;
        break;
      } catch (error) {
        if (!isQuotaStorageError(error)) {
          state.localLedgerSaveError = "storage";
          break;
        }
      }
    }
    state.localLedgerSaveError = saved ? "" : state.localLedgerSaveError || "quota";
    if (saved && state.localLedger !== compacted.turns) invalidateLocalUsageCache();
    refreshAnalyticsRollupDates([...compacted.dates, ...evictedDates, localDateKey(turnTimestampMs(state.localLast))]);
    return saved;
  }

  function normalizedDurationMs(raw, startedAt = 0, finishedAt = 0) {
    const explicitMs = Number(raw?.durationMs ?? raw?.duration_ms ?? raw?.elapsedMs ?? raw?.elapsed_ms ?? raw?.latencyMs ?? raw?.latency_ms);
    if (Number.isFinite(explicitMs) && explicitMs >= 0) return Math.round(explicitMs);
    const explicitSec = Number(raw?.durationSec ?? raw?.duration_sec ?? raw?.elapsedSec ?? raw?.elapsed_sec);
    if (Number.isFinite(explicitSec) && explicitSec >= 0) return Math.round(explicitSec * 1000);
    const start = UTIL.toCount(startedAt);
    const finish = UTIL.toCount(finishedAt);
    return start && finish >= start ? finish - start : 0;
  }

  function normalizeImportedUsageTurn(raw, index = 0, options = {}) {
    if (!raw || typeof raw !== "object") return null;
    const usage = normalizeUsage(raw.usage || raw);
    if (!usage.exact) return null;
    const createdAt = UTIL.normalizeText(raw.createdAt || raw.created_at || raw.date, 40);
    const date = new Date(createdAt || Date.now());
    const observedAt = UTIL.toTimestampMs(raw.observedAt || raw.observed_at) || date.getTime();
    const startedAt = UTIL.toTimestampMs(raw.startedAt || raw.started_at || raw.startTime || raw.start_time || date.getTime()) || observedAt || Date.now();
    const finishedAt = UTIL.toTimestampMs(raw.finishedAt || raw.finished_at || raw.completedAt || raw.completed_at || raw.endTime || raw.end_time || observedAt) || startedAt;
    const durationMs = normalizedDurationMs(raw, startedAt, finishedAt);
    const sessionKey = resolveSessionKey(raw.sessionKey || raw.session_key || raw.threadId || raw.thread_id || raw.conversationId || raw.conversation_id || raw.sessionId || raw.session_id);
    const threadKey = resolveSessionKey(raw.threadKey || raw.thread_key || raw.threadId || raw.thread_id || raw.conversationId || raw.conversation_id || sessionKey);
    if (isTransientSessionKey(sessionKey)) return null;
    const turnId =
      UTIL.normalizeText(raw.turnId || raw.turn_id || raw.request_id, 240) ||
      `import:${isoDateUtc(date.getTime())}:${UTIL.normalizeText(raw.model, 120) || UNKNOWN_MODEL}:${usageKey(usage)}:${index}`;
    const costUsd = Number(raw.costUsd ?? raw.cost_usd ?? raw.totalCostUsd ?? raw.total_cost_usd);
    return {
      usage,
      turnId,
      source: UTIL.normalizeText(raw.source, 80) || "import",
      ...(sessionKey ? { sessionKey } : {}),
      ...(threadKey ? { threadKey } : {}),
      callCount: UTIL.toCount(raw.callCount ?? raw.call_count ?? raw.requestCount ?? raw.request_count) || 1,
      model: usageModelLabel(raw.model || raw.request_model || raw.pricing_model),
      effort: normalizeReasoningEffort(raw.effort),
      responseIds: usageTurnResponseIdList(raw),
      fastMode: typeof raw.fastMode === "boolean" ? raw.fastMode : null,
      invocations: Array.isArray(raw.invocations) ? raw.invocations.filter((item) => normalizeProfileInvocation(item)) : [],
      calls: Array.isArray(raw.calls)
        ? raw.calls
            .map((call) => {
              const callUsage = normalizeUsage(call?.usage || call);
              return callUsage.exact
                ? {
                    usage: callUsage,
                    usageKey: usageKey(callUsage),
                    observedAt: UTIL.toTimestampMs(call?.observedAt || call?.observed_at) || observedAt,
                    source: UTIL.normalizeText(call?.source, 80),
                  }
                : null;
            })
            .filter(Boolean)
        : [],
      createdAt: Number.isFinite(date.getTime()) ? date.toISOString() : new Date().toISOString(),
      observedAt: observedAt || Date.now(),
      ...(UTIL.toCount(raw.importedAt || raw.imported_at || options.importedAt) ? { importedAt: UTIL.toCount(raw.importedAt || raw.imported_at || options.importedAt) } : {}),
      startedAt: new Date(startedAt).toISOString(),
      finishedAt: new Date(finishedAt).toISOString(),
      durationMs,
      durationSec: Math.round(durationMs / 1000),
      ...(raw.timeGranularity === "hour" || raw.time_granularity === "hour"
        ? { timeGranularity: "hour" }
        : raw.timeGranularity === "day" || raw.time_granularity === "day"
          ? { timeGranularity: "day" }
          : {}),
      ...(raw.cacheWriteAvailable === true || raw.cache_write_available === true ? { cacheWriteAvailable: true } : {}),
      ...(Number.isFinite(costUsd) && costUsd >= 0 ? { costUsd } : {}),
      ...(UTIL.normalizeText(raw.importSource, 80) ? { importSource: UTIL.normalizeText(raw.importSource, 80) } : {}),
    };
  }

  function trimLocalLedger(turns, limit = LOCAL_LEDGER_LIMIT) {
    const exact = (Array.isArray(turns) ? turns : [])
      .filter((item) => normalizeUsage(item?.usage).exact && !isTransientSessionKey(turnSessionKey(item)));
    if (!(limit > 0)) return [];
    return exact.slice(-limit);
  }

  function normalizeLocalUsageArchive(raw) {
    return raw?.version === 1 && raw.days && typeof raw.days === "object"
      ? { version: 1, updatedAt: UTIL.toCount(raw.updatedAt), days: raw.days }
      : { version: 1, updatedAt: 0, days: {} };
  }

  function localUsageArchiveTurns(archive = state.localUsageArchive, dates = null) {
    const source = normalizeLocalUsageArchive(archive);
    const targets = dates ? new Set(Array.from(dates).map((date) => UTIL.normalizeText(date, 10)).filter(Boolean)) : null;
    const rollup = targets
      ? { ...source, days: Object.fromEntries(Object.entries(source.days).filter(([date]) => targets.has(date))) }
      : source;
    return analyticsTurnsFromRollup(rollup).map((turn) => ({
      ...turn,
      turnId: turn.turnId.replace(/^analytics:/, "local-archive:"),
      source: "local-usage-archive",
    }));
  }

  // 本地归档只是旧账本被挤出时的日聚合兜底。同一日期一旦有逐响应事实或
  // Profile 轮次，归档必须让位，否则同一批用量会被日聚合和逐轮账本各计一次。
  function localUsageArchiveTurnsForAnalytics(dates = null) {
    const archive = normalizeLocalUsageArchive(state.localUsageArchive);
    const wanted = dates
      ? new Set(Array.from(dates).map((date) => UTIL.normalizeText(date, 10)).filter(Boolean))
      : new Set(Object.keys(archive.days || {}));
    if (!wanted.size) return [];
    const covered = new Set();
    for (const days of usageFactDayIndex().values()) {
      for (const date of days.keys()) covered.add(date);
    }
    for (const turn of ensureProfileLedgerLoaded().turns || []) {
      const date = localDateKey(turnTimestampMs(turn));
      if (date) covered.add(date);
    }
    const uncovered = Array.from(wanted).filter((date) => !covered.has(date));
    return localUsageArchiveTurns(archive, uncovered);
  }

  function mergeLocalUsageArchive(archive, turns) {
    const items = Array.isArray(turns) ? turns : [];
    if (!items.length) return normalizeLocalUsageArchive(archive);
    const rollup = buildAnalyticsRollup([...localUsageArchiveTurns(archive), ...items]);
    return { version: 1, updatedAt: Date.now(), days: rollup.days };
  }

  // 事实行（有 responseIds）永久保存在 IndexedDB，不能进 localStorage 归档，
  // 否则每次保存都会把同一批事实重复折进日聚合。
  function isFactLedgerTurn(turn) {
    return Array.isArray(turn?.responseIds) && turn.responseIds.length > 0;
  }

  function compactLocalLedger(turns, archive = null, limit = LOCAL_LEDGER_LIMIT) {
    const exact = (Array.isArray(turns) ? turns : [])
      .filter((item) => normalizeUsage(item?.usage).exact && !isTransientSessionKey(turnSessionKey(item)));
    const permanent = exact.filter(isFactLedgerTurn);
    const ephemeral = exact.filter((turn) => !isFactLedgerTurn(turn));
    const retainedEphemeral = trimLocalLedger(ephemeral, limit);
    const retainedSet = new Set(retainedEphemeral);
    const evicted = ephemeral.filter((turn) => !retainedSet.has(turn));
    // 保持原顺序：事实行追加在尾部，UI 依赖“最后一次写入在末尾”。
    const retained = retainedEphemeral.concat(permanent);
    return {
      turns: retained,
      archive: mergeLocalUsageArchive(archive, evicted),
      evicted: evicted.length,
      archived: evicted.length,
      dates: usageTurnsDayDates(evicted),
    };
  }

  function importUsageSignature(usage) {
    const normalized = normalizeUsage(usage);
    return normalized.exact ? `${normalized.input}\u0001${normalized.output}\u0001${normalized.cached}\u0001${normalized.total}` : "";
  }

  function buildImportDedupeIndex(ledger, replaceSource = "") {
    const index = new Map();
    for (const turn of ledger?.turns || []) {
      if (replaceSource && (turn.importSource === replaceSource || turn.source === replaceSource)) continue;
      const threadKey = UTIL.normalizeText(turn.threadKey, 240);
      const signature = importUsageSignature(turn.usage);
      if (!threadKey || !signature) continue;
      const timestamp = UTIL.toTimestampMs(turn.startedAt || turn.capturedAt);
      if (!timestamp) continue;
      const list = index.get(threadKey);
      if (list) list.push({ timestamp, signature });
      else index.set(threadKey, [{ timestamp, signature }]);
    }
    return index;
  }

  function importTurnMatchesLedger(index, turn, windowMs) {
    const threadKey = UTIL.normalizeText(turn.threadKey, 240);
    const list = threadKey ? index.get(threadKey) : null;
    if (!list?.length) return false;
    const signature = importUsageSignature(turn.usage);
    if (!signature) return false;
    const timestamp = UTIL.toTimestampMs(turn.startedAt || turn.observedAt);
    if (!timestamp) return false;
    return list.some((entry) => entry.signature === signature && Math.abs(entry.timestamp - timestamp) <= windowMs);
  }

  function importLocalUsageTurns(rows, options = {}) {
    ensureLocalLedgerLoaded();
    const items = Array.isArray(rows) ? rows : [];
    const replaceSource = UTIL.normalizeText(options.replaceSource, 80);
    const idbOnly = options.idbOnly === true;
    const importedAt = UTIL.toCount(options.importedAt) || Date.now();
    const ledger = ensureProfileLedgerLoaded();
    const dedupeIndex = options.dedupeAgainstLedger === true ? buildImportDedupeIndex(ledger, replaceSource) : null;
    const dedupeWindowMs = UTIL.toCount(options.dedupeWindowMs) || 90_000;
    const addedTurns = [];
    let imported = 0;
    let skipped = 0;
    let deduped = 0;
    items.forEach((row, index) => {
      const turn = normalizeImportedUsageTurn(row, index, { importedAt });
      if (!turn) {
        skipped++;
        return;
      }
      if (dedupeIndex && importTurnMatchesLedger(dedupeIndex, turn, dedupeWindowMs)) {
        deduped++;
        return;
      }
      const invocationIds = [];
      for (const rawInvocation of turn.invocations || []) {
        const invocation = normalizeProfileInvocation(rawInvocation);
        if (!invocation) continue;
        const explicitId = profileInvocationEventId(rawInvocation) || `import:${UTIL.normalizeText(rawInvocation?.key, 120) || index}`;
        const invocationId = `${turn.turnId}\u0001${explicitId}`;
        if (!ledger.invocations[invocationId]) {
          ledger.invocations[invocationId] = {
            ...invocation,
            invocationId,
            turnId: turn.turnId,
            occurrence: UTIL.toCount(rawInvocation?.occurrence) || 1,
            observedAt: UTIL.toTimestampMs(rawInvocation?.observedAt) || importedAt,
            source: UTIL.normalizeText(rawInvocation?.source, 80) || turn.source,
          };
        }
        invocationIds.push(invocationId);
      }
      for (const call of turn.calls || []) {
        const callUsage = normalizeUsage(call?.usage);
        if (!callUsage.exact) continue;
        const canonicalUsageKey = usageKey(callUsage);
        const id = `${turn.turnId}\u0001${canonicalUsageKey}`;
        if (ledger.usageCalls[id]) continue;
        ledger.usageCalls[id] = {
          id,
          turnId: turn.turnId,
          usageKey: canonicalUsageKey,
          usage: callUsage,
          observedAt: UTIL.toTimestampMs(call?.observedAt) || importedAt,
          source: UTIL.normalizeText(call?.source, 80) || turn.source,
        };
      }
      const upserted = profileLedgerUpsertTurn({
        ...turn,
        invocationIds,
        durationStatus: "incomplete",
        persistReason: "import",
        capturedAt: importedAt,
      }, { deferRollup: true, deferSnapshot: true, deferWrite: true });
      if (!upserted) {
        skipped++;
        return;
      }
      addedTurns.push(turn);
      imported++;
    });
    if (imported) {
      profileLedgerRebuildRollup();
      saveProfileLedgerSnapshot();
      profileLedgerQueueSnapshotWrite();
    }
    if (!idbOnly) {
      const existing = replaceSource ? state.localLedger.filter((turn) => turn.importSource !== replaceSource && turn.source !== replaceSource) : state.localLedger.slice();
      const byId = new Map(existing.map((turn) => [turn.turnId, turn]));
      for (const turn of addedTurns) byId.set(turn.turnId, turn);
      invalidateLocalUsageCache();
      state.localLedger = Array.from(byId.values()).sort(
        (a, b) => String(a.createdAt || "").localeCompare(String(b.createdAt || "")) || String(a.turnId || "").localeCompare(String(b.turnId || "")),
      );
      state.localLast = state.localLedger[state.localLedger.length - 1] || null;
      saveLocalLedger();
      if (replaceSource) rebuildAnalyticsRollup();
    }
    scheduleProfileUsageRefresh();
    scheduleRender();
    return { imported, deduped, skipped, total: idbOnly ? imported + deduped + skipped : state.localLedger.length };
  }

  // --- 历史数据同步（File System Access 目录读取 + rollout 逐请求解析） ------
  //
  // 与 scripts/codex-usage-backfill.cjs 的 rollout 解析同源：页面读取用户一次性
  // 授权的 .codex 目录（sessions / archived_sessions，含 *.jsonl.zst），解析
  // token_count 逐请求记录并按 turn 聚合，再经 importLocalUsageTurns(idbOnly)
  // 幂等入库。CLI 扫描器的 sqlite 兜底不在此路径（无 rollout 的旧线程缺口已由
  // 引导导入补齐；新线程始终产生 rollout 文件）。

  function usageSyncText(value, max = 400) {
    if (typeof value !== "string") return "";
    const text = value.trim();
    if (!text || text.length > max) return "";
    return text;
  }

  function usageSyncUnixToMs(value) {
    const n = Number(value);
    if (!Number.isFinite(n) || n <= 0) return 0;
    return Math.round(n < 10_000_000_000 ? n * 1000 : n);
  }

  function usageSyncIsoOrNull(ms) {
    return Number.isFinite(ms) && ms > 0 ? new Date(ms).toISOString() : null;
  }

  function usageSyncRawUsageShape(info) {
    if (!info || typeof info !== "object") return null;
    const usage = {};
    let sum = 0;
    for (const field of USAGE_SYNC_USAGE_FIELDS) {
      const value = UTIL.toCount(info[field]);
      if (value) usage[field] = value;
      sum += value;
    }
    return sum > 0 ? usage : null;
  }

  function usageSyncSumRawUsage(target, usage) {
    for (const field of USAGE_SYNC_USAGE_FIELDS) target[field] = (target[field] || 0) + (usage[field] || 0);
    return target;
  }

  function usageSyncCollectStrings(node, out, depth = 0) {
    if (node == null || depth > 6) return out;
    if (typeof node === "string") {
      if (node.length <= 20000) out.push(node);
      return out;
    }
    if (Array.isArray(node)) {
      for (const item of node) usageSyncCollectStrings(item, out, depth + 1);
      return out;
    }
    if (typeof node === "object") {
      for (const value of Object.values(node)) usageSyncCollectStrings(value, out, depth + 1);
    }
    return out;
  }

  function usageSyncBumpSkill(record, name, count = 1) {
    const skill = usageSyncText(name, 120);
    if (!skill) return;
    record.skillCounts.set(skill, (record.skillCounts.get(skill) || 0) + count);
  }

  function usageSyncBumpPlugin(record, server, count = 1) {
    const plugin = usageSyncText(server, 120).replace(/^\$+/, "");
    if (!plugin) return;
    record.pluginCounts.set(plugin, (record.pluginCounts.get(plugin) || 0) + count);
  }

  function usageSyncCollectSkillReads(text, record) {
    const matches = String(text || "").match(/[\\/]skills[\\/][^"'\r\n]{0,300}?SKILL\.md/gi);
    if (!matches) return;
    for (const match of matches) {
      const parts = match.split(/[\\/]+/).filter(Boolean);
      const name = parts[parts.length - 2];
      if (name && name.toLowerCase() !== "skill.md") usageSyncBumpSkill(record, name);
    }
  }

  function usageSyncCollectToolInvocations(payload, record) {
    if (!record) return;
    const type = usageSyncText(payload?.type, 40);
    if (type === "function_call" || type === "custom_tool_call") {
      const name = usageSyncText(payload?.name, 120);
      const mcpMatch = /^mcp__([A-Za-z0-9_$.-]+?)__/.exec(name);
      if (mcpMatch) usageSyncBumpPlugin(record, mcpMatch[1]);
      const strings = usageSyncCollectStrings(payload?.arguments ?? payload?.input ?? payload?.action, []);
      for (const text of strings) usageSyncCollectSkillReads(text, record);
    }
  }

  function usageSyncCreateTurnRecord(turnId) {
    return {
      turnId,
      model: "",
      effort: "",
      startedAtMs: 0,
      finishedAtMs: 0,
      durationMs: 0,
      calls: [],
      // 逐响应事实：response_id -> { usage, turnCumulative, threadCumulative, observedAtMs }
      responses: new Map(),
      // token_count 回退条目：按 (signature, cumulativeTotal) 去重，只在该 turn 没有任何 record 时使用。
      fallbackCalls: [],
      fallbackSeen: new Set(),
      // 时间模型：trigger / 父子关系 / item 耗时（方案 P1 #4）。
      trigger: "",
      parentTurnId: "",
      rootTurnId: "",
      timeToFirstTokenMs: 0,
      itemDurations: new Map(),
      status: "",
      error: "",
      abortReason: "",
      skillCounts: new Map(),
      pluginCounts: new Map(),
    };
  }

  // token_count 的去重键：(turn_id, signature)。
  // rate-limit 心跳会重发上一次 last_token_usage，但累计值可能变（cc-switch 同样按
  // 签名去重）：同签名只接受一次，否则同一份用量会被再记一遍。
  function usageSyncFallbackKey(turnId, usage) {
    const signature = USAGE_SYNC_USAGE_FIELDS.map((field) => UTIL.toCount(usage?.[field])).join("/");
    return `${turnId}\u0001${signature}`;
  }

  // 可观测性计数器（P2 #5）：解析行数、逐响应记录数、心跳数、重复数。
  const USAGE_SYNC_OBSERVABILITY_FIELDS = ["lines", "records", "heartbeats", "duplicateRecords", "duplicateHeartbeats"];

  function usageSyncEnsureObservability(summary) {
    if (!summary || typeof summary !== "object") return summary;
    if (typeof summary.lineErrors !== "number") summary.lineErrors = 0;
    for (const field of USAGE_SYNC_OBSERVABILITY_FIELDS) {
      if (typeof summary[field] !== "number") summary[field] = 0;
    }
    return summary;
  }

  function usageSyncAddObservability(target, source) {
    if (!target || !source) return target;
    usageSyncEnsureObservability(target);
    for (const field of USAGE_SYNC_OBSERVABILITY_FIELDS) target[field] += UTIL.toCount(source[field]);
    return target;
  }

  function usageSyncParseRolloutLines(lines, fileSummary = { lineErrors: 0 }) {
    usageSyncEnsureObservability(fileSummary);
    const thread = {
      threadId: "",
      turns: new Map(),
      orphanCalls: [],
      orphanResponses: new Map(),
      fallbackModel: "",
      fallbackEffort: "",
      rateLimits: [],
    };
    let lastTurnId = "";
    let lastTurn = null;
    const ensureTurn = (turnId) => {
      if (!turnId) return null;
      let record = thread.turns.get(turnId);
      if (!record) {
        record = usageSyncCreateTurnRecord(turnId);
        // 新建记录时先固化当前粘性模型；turn_context / token_count 随后可覆盖。
        if (thread.fallbackModel) record.model = thread.fallbackModel;
        if (thread.fallbackEffort) record.effort = thread.fallbackEffort;
        thread.turns.set(turnId, record);
      }
      return record;
    };
    const attachCall = (call) => {
      const record = lastTurnId ? ensureTurn(lastTurnId) : null;
      if (record) record.calls.push(call);
      else thread.orphanCalls.push(call);
    };
    const attachResponse = (entry) => {
      const record = lastTurnId ? ensureTurn(lastTurnId) : null;
      if (record) record.responses.set(entry.responseId, entry);
      else thread.orphanResponses.set(entry.responseId, entry);
    };

    for (const line of lines) {
      if (!line.trim()) continue;
      // 可观测性（P2 #5）：解析行数、重复数一次算清，供同步状态行展示。
      fileSummary.lines += 1;
      let obj;
      try {
        obj = JSON.parse(line);
      } catch {
        fileSummary.lineErrors += 1;
        continue;
      }
      const type = obj?.type;
      const payload = obj?.payload || {};
      if (type === "session_meta") {
        thread.threadId = thread.threadId || usageSyncText(payload.session_id || payload.id, 120);
        continue;
      }
      if (type === "turn_context") {
        const turnId = usageSyncText(payload.turn_id, 120) || lastTurnId;
        const record = ensureTurn(turnId);
        const model = usageSyncText(payload.model || payload.info?.model, 120);
        const effort = usageSyncText(payload.effort, 40);
        if (model) {
          thread.fallbackModel = model;
          // turn_context 描述的就是这一轮：以它为准，不用「先到先得」。
          if (record) record.model = model;
        }
        if (effort) {
          thread.fallbackEffort = effort;
          if (record) record.effort = effort;
        }
        continue;
      }
      // 逐响应事实源：云端 Responses API usage 的本地副本，按 response_id 幂等。
      if (type === "token_usage_record") {
        const responseId = usageSyncText(payload.response_id, 200);
        const usage = usageSyncRawUsageShape(payload.usage);
        if (!responseId || !usage) continue;
        const turnId = usageSyncText(payload.turn_id || payload.root_turn_id, 120) || lastTurnId;
        const record = ensureTurn(turnId);
        // 在响应到达时就固化「当时的」粘性模型；如果等到整份文件解析完，
        // 线程末尾的模型会错误回填到更早的轮次。
        if (record && !record.model && thread.fallbackModel) record.model = thread.fallbackModel;
        if (record && !record.effort && thread.fallbackEffort) record.effort = thread.fallbackEffort;
        const entry = {
          responseId,
          usage,
          turnCumulative: usageSyncRawUsageShape(payload.turn_token_usage),
          threadCumulative: usageSyncRawUsageShape(payload.thread_token_usage),
          observedAtMs: UTIL.toTimestampMs(obj.timestamp),
        };
        fileSummary.records += 1;
        const target = record ? record.responses : thread.orphanResponses;
        // 同一 response_id 重复出现 = 重复记录（幂等覆盖，不计入用量）。
        if (target.has(responseId)) fileSummary.duplicateRecords += 1;
        if (record) record.responses.set(responseId, entry);
        else thread.orphanResponses.set(responseId, entry);
        continue;
      }
      if (type === "event_msg") {
        const ptype = usageSyncText(payload.type, 60);
        // 恢复 / Desktop 线程可能在没有新 turn_context 的情况下换模型。
        if (ptype === "thread_settings_applied") {
          const settings = payload.thread_settings && typeof payload.thread_settings === "object" ? payload.thread_settings : payload;
          const model = usageSyncText(settings.model, 120);
          const effort = usageSyncText(settings.reasoning_effort || settings.effort, 40);
          // 与 cc-switch 一致：设置是「下一轮起生效」的粘性模型，不回写上一轮。
          // 新一轮在 task_started 时继承它，turn_context 到了会再覆盖。
          if (model) thread.fallbackModel = model;
          if (effort) thread.fallbackEffort = effort;
          continue;
        }
        if (ptype === "task_started") {
          const turnId = usageSyncText(payload.turn_id || payload.turn_attribution?.turn_id, 120);
          if (turnId) {
            lastTurnId = turnId;
            lastTurn = ensureTurn(turnId);
            // 恢复线程 / Desktop 线程可能整轮没有 turn_context：用当前线程的
            // 粘性模型先把这一轮认下来，turn_context 到了会再覆盖。
            if (lastTurn && !lastTurn.model && thread.fallbackModel) lastTurn.model = thread.fallbackModel;
            if (lastTurn && !lastTurn.effort && thread.fallbackEffort) lastTurn.effort = thread.fallbackEffort;
            const startedAtMs = usageSyncUnixToMs(payload.started_at);
            if (startedAtMs) lastTurn.startedAtMs = lastTurn.startedAtMs || startedAtMs;
            // 时间模型：触发方式与父子关系（子代理单独归组，不混进用户 turn）。
            const trigger = usageSyncText(payload.turn_attribution?.turn_trigger, 60);
            if (trigger) lastTurn.trigger = lastTurn.trigger || trigger;
            const parentTurnId = usageSyncText(payload.turn_attribution?.parent_turn_id, 120);
            if (parentTurnId) lastTurn.parentTurnId = lastTurn.parentTurnId || parentTurnId;
            const rootTurnId = usageSyncText(payload.root_turn_id || payload.turn_attribution?.root_turn_id, 120);
            if (rootTurnId) lastTurn.rootTurnId = lastTurn.rootTurnId || rootTurnId;
          }
          continue;
        }
        if (ptype === "task_complete") {
          const turnId = usageSyncText(payload.turn_id || payload.root_turn_id, 120) || lastTurnId;
          const record = ensureTurn(turnId);
          if (record) {
            const durationMs = UTIL.toCount(payload.duration_ms);
            if (durationMs) record.durationMs = Math.max(record.durationMs, durationMs);
            const finishedAtMs = usageSyncUnixToMs(payload.completed_at);
            if (finishedAtMs) record.finishedAtMs = Math.max(record.finishedAtMs, finishedAtMs);
            const startedAtMs = usageSyncUnixToMs(payload.started_at);
            if (startedAtMs) record.startedAtMs = record.startedAtMs || startedAtMs;
            const ttft = UTIL.toCount(payload.time_to_first_token_ms);
            if (ttft) record.timeToFirstTokenMs = Math.max(record.timeToFirstTokenMs, ttft);
            // 失败 turn 也要保留，状态不能被当成成功。
            const errorMessage = usageSyncText(payload.error?.message, 400);
            if (errorMessage) {
              record.status = "failed";
              record.error = errorMessage;
            } else if (record.status !== "interrupted") {
              record.status = "completed";
            }
          }
          continue;
        }
        // 中断 turn 同样保留事实，不能丢。
        if (ptype === "turn_aborted") {
          const turnId = usageSyncText(payload.turn_id || payload.root_turn_id, 120) || lastTurnId;
          const record = ensureTurn(turnId);
          if (record) {
            record.status = "interrupted";
            record.abortReason = usageSyncText(payload.reason, 120) || "interrupted";
            const durationMs = UTIL.toCount(payload.duration_ms);
            if (durationMs) record.durationMs = Math.max(record.durationMs, durationMs);
            const finishedAtMs = usageSyncUnixToMs(payload.completed_at);
            if (finishedAtMs) record.finishedAtMs = Math.max(record.finishedAtMs, finishedAtMs);
            const startedAtMs = usageSyncUnixToMs(payload.started_at);
            if (startedAtMs) record.startedAtMs = record.startedAtMs || startedAtMs;
          }
          continue;
        }
        if (ptype === "token_count") {
          // token_count 是「用量 + rate limit」心跳：rate_limits 单独入库，用量只在
          // 该 turn 没有任何 token_usage_record 时才允许降级使用。
          const rateLimits = payload.rate_limits;
          if (rateLimits && typeof rateLimits === "object") {
            thread.rateLimits.push({ observedAtMs: UTIL.toTimestampMs(obj.timestamp), rateLimits });
          }
          fileSummary.heartbeats += 1;
          // 新版本 token_count 会带当前模型（cc-switch 也读这三个位置）。
          const tokenModel = usageSyncText(payload.info?.model || payload.info?.model_name || payload.model, 120);
          const tokenEffort = usageSyncText(payload.info?.effort || payload.info?.reasoning_effort, 40);
          if (tokenModel) thread.fallbackModel = tokenModel;
          if (tokenEffort) thread.fallbackEffort = tokenEffort;
          const usage = usageSyncRawUsageShape(payload.info?.last_token_usage);
          if (!usage) continue;
          const cumulativeTotal = UTIL.toCount(payload.info?.total_token_usage?.total_tokens);
          const turnId = usageSyncText(payload.turn_id, 120) || lastTurnId;
          const record = turnId ? ensureTurn(turnId) : null;
          if (!record) {
            attachCall({ usage, observedAtMs: UTIL.toTimestampMs(obj.timestamp) });
            continue;
          }
          if (tokenModel) record.model = tokenModel;
          if (tokenEffort) record.effort = tokenEffort;
          const dedupeKey = usageSyncFallbackKey(turnId, usage);
          if (record.fallbackSeen.has(dedupeKey)) {
            // 可观测性：重复心跳（同 turn + 同签名）被去重的次数。
            fileSummary.duplicateHeartbeats += 1;
            continue;
          }
          record.fallbackSeen.add(dedupeKey);
          record.fallbackCalls.push({ usage, observedAtMs: UTIL.toTimestampMs(obj.timestamp), cumulativeTotal });
          continue;
        }
        // item 耗时：工具/消息的 started_at_ms -> completed_at_ms。
        if (ptype === "item_completed") {
          const turnId = usageSyncText(payload.turn_id, 120) || lastTurnId;
          const startedAt = UTIL.toCount(payload.started_at_ms);
          const completedAt = UTIL.toCount(payload.completed_at_ms);
          if (turnId && startedAt && completedAt && completedAt >= startedAt) {
            const record = ensureTurn(turnId);
            if (record) {
              const itemType = usageSyncText(payload.item?.type, 60) || "unknown";
              const durationMs = completedAt - startedAt;
              const current = record.itemDurations.get(itemType) || { count: 0, totalMs: 0, maxMs: 0 };
              current.count += 1;
              current.totalMs += durationMs;
              current.maxMs = Math.max(current.maxMs, durationMs);
              record.itemDurations.set(itemType, current);
            }
          }
          continue;
        }
        if (ptype === "mcp_tool_call_end") {
          const record = lastTurnId ? ensureTurn(lastTurnId) : null;
          if (record) usageSyncBumpPlugin(record, usageSyncText(payload.invocation?.server || payload.server, 120));
          continue;
        }
        continue;
      }
      if (type === "response_item") {
        usageSyncCollectToolInvocations(payload, lastTurnId ? ensureTurn(lastTurnId) : null);
        continue;
      }
    }

    if (!thread.threadId) return null;
    return thread;
  }
  // 时间模型聚合：同线程相邻 turn 的空闲间隔（真正的「9 小时」来源）、
  // 活跃时长（durationMs 之和）、子代理与自动 turn 的占比。
  // 实测：duration_ms 恒等于 completed_at - started_at（122/122），
  // 所以活跃时长直接用官方 durationMs，墙钟差来自 turn 之间的间隔。
  function usageTimeModel(turns) {
    const items = Array.isArray(turns) ? turns : [];
    const byThread = new Map();
    let activeMs = 0;
    let itemMs = 0;
    let userTurns = 0;
    let autoTurns = 0;
    let subagentTurns = 0;
    const triggers = {};
    for (const turn of items) {
      const duration = Math.max(0, UTIL.toCount(turn?.durationMs));
      activeMs += duration;
      itemMs += Math.max(0, UTIL.toCount(turn?.itemDurationTotalMs));
      const trigger = UTIL.normalizeText(turn?.turnTrigger, 60) || "unknown";
      triggers[trigger] = (triggers[trigger] || 0) + 1;
      // 自动 turn：不是用户主动发起的（guardian_review / daemon_recovery / resume）。
      if (trigger === "user" || trigger === "composer" || trigger === "edit_user_message") userTurns += 1;
      else autoTurns += 1;
      if (UTIL.normalizeText(turn?.parentTurnId, 240)) subagentTurns += 1;
      const threadKey = turnSessionKey(turn);
      if (!threadKey) continue;
      const list = byThread.get(threadKey) || [];
      list.push({
        turnId: UTIL.normalizeText(turn?.turnId, 240),
        start: UTIL.toTimestampMs(turn?.startedAt) || turnTimestampMs(turn),
        end: UTIL.toTimestampMs(turn?.finishedAt) || turnTimestampMs(turn),
      });
      byThread.set(threadKey, list);
    }
    // 同线程相邻 turn 的空闲间隔。
    let idleMs = 0;
    let maxIdleMs = 0;
    let gapCount = 0;
    for (const list of byThread.values()) {
      list.sort((left, right) => left.start - right.start);
      for (let index = 1; index < list.length; index += 1) {
        const previousEnd = list[index - 1].end;
        const currentStart = list[index].start;
        if (!previousEnd || !currentStart || currentStart <= previousEnd) continue;
        const gap = currentStart - previousEnd;
        idleMs += gap;
        maxIdleMs = Math.max(maxIdleMs, gap);
        gapCount += 1;
      }
    }
    const wallMs = activeMs + idleMs;
    return {
      turns: items.length,
      activeMs,
      idleMs,
      wallMs,
      maxIdleMs,
      gapCount,
      itemMs,
      userTurns,
      autoTurns,
      subagentTurns,
      triggers,
      // 空闲占比过高说明用户离开了，不代表用量下降。
      idleShare: wallMs ? Math.round((idleMs / wallMs) * 100) : 0,
    };
  }

  // 跨午夜归属（验收 #14）
  //
  // 一个 turn 的用量按「每条响应自己的观测时间」落到本地自然日，不再整轮算到
  // turn 的开始日。事实层（逐响应 observedAtMs）是唯一依据；没有逐响应事实
  // （实时捕获行、导入的历史行、只有 token_count 的降级 turn）时整轮归到
  // turn 自己的时间戳那天 —— 宁可少拆，也不按比例臆造。
  // 拆分必须是严格的划分：各日用量之和 == 整轮用量，否则不拆。

  // 逐响应事实按 turnId 建索引：turnId -> Map(date -> { raw, calls, firstMs, lastMs })。
  // 一次遍历 facts，供 rollup / 日桶 / 区间聚合共用。
  function usageFactDayIndex() {
    const index = new Map();
    for (const record of usageFactAuthoritativeRecords()) {
      const turnId = UTIL.normalizeText(record?.turnId, 240);
      const usage = record?.usage;
      const at = UTIL.toCount(record?.observedAtMs);
      if (!turnId || !usage || !at) continue;
      const date = localDateKey(at);
      if (!date) continue;
      let days = index.get(turnId);
      if (!days) {
        days = new Map();
        index.set(turnId, days);
      }
      const bucket = days.get(date) || { raw: {}, calls: 0, firstMs: at, lastMs: at };
      usageSyncSumRawUsage(bucket.raw, usage);
      bucket.calls += 1;
      bucket.firstMs = Math.min(bucket.firstMs, at);
      bucket.lastMs = Math.max(bucket.lastMs, at);
      days.set(date, bucket);
    }
    return index;
  }

  // 把 turn 的用量按本地自然日拆分，返回 [{ date, usage, calls, firstMs, lastMs }]。
  // 没有逐响应事实、或各日之和对不上整轮用量时，退回单日（整轮归 turn 时间戳那天）。
  function usageDaySlicesFromIndex(dayIndex, turn) {
    const whole = normalizeUsage(turn?.usage);
    if (!whole.exact) return [];
    const fallbackMs = turnTimestampMs(turn);
    const fallbackDate = localDateKey(fallbackMs);
    if (!fallbackDate) return [];
    const fallback = [{ date: fallbackDate, usage: whole, calls: UTIL.toCount(turn?.callCount) || 1, firstMs: fallbackMs, lastMs: fallbackMs }];
    const turnId = UTIL.normalizeText(turn?.turnId, 240);
    const days = turnId ? dayIndex?.get(turnId) : null;
    if (!days || !days.size) return fallback;
    const slices = [];
    let sumTotal = 0;
    for (const [date, bucket] of days) {
      const usage = normalizeUsage(bucket.raw);
      if (!usage.exact) continue;
      sumTotal += UTIL.toCount(usage.total || usage.input + usage.output);
      slices.push({ date, usage, calls: bucket.calls, firstMs: bucket.firstMs, lastMs: bucket.lastMs });
    }
    const wholeTotal = UTIL.toCount(whole.total || whole.input + whole.output);
    if (!slices.length || sumTotal !== wholeTotal) return fallback;
    slices.sort((left, right) => left.date.localeCompare(right.date));
    // 单日时用整轮 usage 覆盖，保证与账本其它口径逐字一致。
    if (slices.length === 1) {
      return [{ date: slices[0].date, usage: whole, calls: UTIL.toCount(turn?.callCount) || slices[0].calls, firstMs: slices[0].firstMs, lastMs: slices[0].lastMs }];
    }
    return slices;
  }

  // 单个 turn 的按日拆分（内部自建索引；批量调用请传 dayIndex 复用）。
  function usageTurnDaySlices(turn, dayIndex = null) {
    return usageDaySlicesFromIndex(dayIndex || usageFactDayIndex(), turn);
  }

  // turn 触达的所有本地日期（跨午夜时多于一天），供归档/rollup 刷新定位。
  function usageTurnDayDates(turn, dayIndex = null) {
    const dates = [];
    for (const slice of usageDaySlicesFromIndex(dayIndex || usageFactDayIndex(), turn)) {
      if (slice.date) dates.push(slice.date);
    }
    return dates;
  }

  // 一批 turn 触达的日期集合（共享一次事实索引）。
  function usageTurnsDayDates(turns, dayIndex = null) {
    const index = dayIndex || usageFactDayIndex();
    const dates = new Set();
    for (const turn of Array.isArray(turns) ? turns : []) {
      for (const date of usageTurnDayDates(turn, index)) dates.add(date);
    }
    return Array.from(dates);
  }

  // turn 是否跨过本地午夜（各日拆分后多于一天）。
  function usageTurnCrossesMidnight(turn, dayIndex = null) {
    return usageDaySlicesFromIndex(dayIndex || usageFactDayIndex(), turn).length > 1;
  }

  function usageSyncFinalizeTurnRow(threadId, record, fallbackModel = "", fallbackEffort = "") {
    // 事实优先：responses（token_usage_record）派生 turn 用量。
    // 只有该 turn 完全没有 record 时，才用去重后的 token_count 回退条目。
    const responses = record.responses instanceof Map ? Array.from(record.responses.values()) : [];
    const useFallback = responses.length === 0;
    // 无 record 时才降级：优先去重后的 token_count 回退条目，其次是孤儿 calls。
    const fallbackCalls = Array.isArray(record.fallbackCalls) && record.fallbackCalls.length
      ? record.fallbackCalls
      : Array.isArray(record.calls)
        ? record.calls
        : [];
    const sourceCalls = useFallback
      ? fallbackCalls.map((call) => ({ usage: call.usage, observedAtMs: call.observedAtMs || 0 }))
      : responses
          .map((entry) => ({ usage: entry.usage, observedAtMs: entry.observedAtMs || 0 }))
          .sort((left, right) => left.observedAtMs - right.observedAtMs);
    if (!sourceCalls.length) {
      // 0 用量的 turn（aborted / 失败）也要保留事实，不能丢。
      if (!record.startedAtMs && !record.finishedAtMs) return null;
      const firstMs = record.startedAtMs || record.finishedAtMs || Date.now();
      return {
        turnId: record.turnId,
        sessionKey: `local:${threadId}`,
        threadKey: `local:${threadId}`,
        threadAttributionStatus: "reliable",
        model: record.model || fallbackModel || UNKNOWN_MODEL,
        ...(record.effort || fallbackEffort ? { effort: record.effort || fallbackEffort } : {}),
        createdAt: usageSyncIsoOrNull(firstMs) || new Date(0).toISOString(),
        startedAt: usageSyncIsoOrNull(firstMs) || new Date(0).toISOString(),
        finishedAt: usageSyncIsoOrNull(record.finishedAtMs || firstMs) || usageSyncIsoOrNull(firstMs) || new Date(0).toISOString(),
        durationMs: record.durationMs || 0,
        ...(record.trigger ? { turnTrigger: record.trigger } : {}),
        ...(record.parentTurnId ? { parentTurnId: record.parentTurnId } : {}),
        ...(record.rootTurnId && record.rootTurnId !== record.turnId ? { rootTurnId: record.rootTurnId } : {}),
        ...(record.timeToFirstTokenMs ? { timeToFirstTokenMs: record.timeToFirstTokenMs } : {}),
        callCount: 0,
        usage: { input_tokens: 0, cached_input_tokens: 0, cache_write_input_tokens: 0, output_tokens: 0, reasoning_output_tokens: 0, total_tokens: 0 },
        calls: [],
        ...(record.status ? { turnStatus: record.status } : {}),
        ...(record.error ? { turnError: record.error } : {}),
        ...(record.abortReason ? { turnAbortReason: record.abortReason } : {}),
        source: USAGE_SYNC_SOURCE,
        importSource: USAGE_SYNC_SOURCE,
      };
    }
    const usage = sourceCalls.reduce((acc, call) => usageSyncSumRawUsage(acc, call.usage), {});
    const firstMs = record.startedAtMs || sourceCalls[0].observedAtMs;
    const lastMs = record.finishedAtMs || sourceCalls[sourceCalls.length - 1].observedAtMs || firstMs;
    const durationMs = record.durationMs || Math.max(0, lastMs - firstMs);
    const invocations = [];
    for (const [name, count] of record.skillCounts) {
      invocations.push({ type: "skill", skill_id: name, skill_name: name, invocationId: `skill:${name}`, occurrence: count });
    }
    for (const [server, count] of record.pluginCounts) {
      invocations.push({ type: "plugin", plugin_id: server, plugin_name: server, invocationId: `plugin:${server}`, occurrence: count });
    }
    // 时间模型：item 耗时按类型聚合（count / totalMs / maxMs）。
    const itemDurations = {};
    if (record.itemDurations instanceof Map) {
      for (const [itemType, value] of record.itemDurations) {
        itemDurations[itemType] = { count: UTIL.toCount(value?.count), totalMs: UTIL.toCount(value?.totalMs), maxMs: UTIL.toCount(value?.maxMs) };
      }
    }
    const itemDurationTotalMs = Object.values(itemDurations).reduce((sum, item) => sum + item.totalMs, 0);
    const itemDurationMaxMs = Object.values(itemDurations).reduce((max, item) => Math.max(max, item.maxMs), 0);
    // 累计校验锚点：thread_token_usage 是云端返回的线程累计值。
    const threadCumulative = responses.length
      ? responses[responses.length - 1].threadCumulative
      : null;
    return {
      turnId: record.turnId,
      sessionKey: `local:${threadId}`,
      threadKey: `local:${threadId}`,
      threadAttributionStatus: "reliable",
      model: record.model || fallbackModel || UNKNOWN_MODEL,
      ...(record.effort || fallbackEffort ? { effort: record.effort || fallbackEffort } : {}),
      createdAt: usageSyncIsoOrNull(firstMs) || new Date(0).toISOString(),
      startedAt: usageSyncIsoOrNull(firstMs) || new Date(0).toISOString(),
      finishedAt: usageSyncIsoOrNull(lastMs) || usageSyncIsoOrNull(firstMs) || new Date(0).toISOString(),
      durationMs,
      ...(record.trigger ? { turnTrigger: record.trigger } : {}),
      ...(record.parentTurnId ? { parentTurnId: record.parentTurnId } : {}),
      ...(record.rootTurnId && record.rootTurnId !== record.turnId ? { rootTurnId: record.rootTurnId } : {}),
      ...(record.timeToFirstTokenMs ? { timeToFirstTokenMs: record.timeToFirstTokenMs } : {}),
      ...(Object.keys(itemDurations).length ? { itemDurations, itemDurationTotalMs, itemDurationMaxMs } : {}),
      callCount: sourceCalls.length,
      usage,
      calls: sourceCalls.map((call) => ({ usage: call.usage, observedAt: usageSyncIsoOrNull(call.observedAtMs) || undefined })),
      ...(responses.length ? { responseIds: responses.map((entry) => entry.responseId) } : {}),
      ...(threadCumulative ? { threadCumulativeTotal: UTIL.toCount(threadCumulative.total_tokens) } : {}),
      ...(useFallback
        ? { usageSource: "token_count_fallback", fallbackResponses: sourceCalls.length }
        : { usageSource: "token_usage_record" }),
      ...(record.status ? { turnStatus: record.status } : {}),
      ...(record.error ? { turnError: record.error } : {}),
      ...(record.abortReason ? { turnAbortReason: record.abortReason } : {}),
      ...(invocations.length ? { invocations } : {}),
      source: USAGE_SYNC_SOURCE,
      importSource: USAGE_SYNC_SOURCE,
    };
  }
  function usageSyncDecodeBytes(bytes) {
    const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    const isZstd = view.length >= 4 && view[0] === 0x28 && view[1] === 0xb5 && view[2] === 0x2f && view[3] === 0xfd;
    let data = view;
    if (isZstd) {
      const lib = installBundledFzstd();
      if (!lib || typeof lib.decompress !== "function") throw new Error("zstd 解码器不可用");
      data = lib.decompress(view);
    }
    const Decoder = globalThis.TextDecoder;
    if (typeof Decoder !== "function") throw new Error("TextDecoder 不可用");
    return new Decoder("utf-8").decode(data);
  }

  async function usageSyncWalkDirectory(dirHandle, prefix, out) {
    if (!dirHandle || typeof dirHandle.entries !== "function") return;
    for await (const entry of dirHandle.entries()) {
      const pair = Array.isArray(entry) ? entry : [entry?.name, entry];
      const name = pair[0];
      const handle = pair[1];
      if (!name || !handle) continue;
      if (handle.kind === "directory") await usageSyncWalkDirectory(handle, `${prefix}${name}/`, out);
      else if (handle.kind === "file" && USAGE_SYNC_ROLLOUT_FILE_RE.test(name)) out.push({ path: `${prefix}${name}`, handle });
    }
  }

  async function usageSyncReadRolloutFile(fileHandle) {
    const file = typeof fileHandle.getFile === "function" ? await fileHandle.getFile() : fileHandle;
    const bytes = new Uint8Array(await file.arrayBuffer());
    const text = usageSyncDecodeBytes(bytes);
    return { text, size: UTIL.toCount(file.size) || bytes.length, lastModified: UTIL.toCount(file.lastModified) };
  }

  async function usageSyncCollectRows(rootHandle, options = {}) {
    const files = [];
    let sessionsHandle = null;
    let archivedHandle = null;
    if (rootHandle && typeof rootHandle.getDirectoryHandle === "function") {
      try {
        sessionsHandle = await rootHandle.getDirectoryHandle("sessions");
      } catch {
        sessionsHandle = null;
      }
      try {
        archivedHandle = await rootHandle.getDirectoryHandle("archived_sessions");
      } catch {
        archivedHandle = null;
      }
    }
    const rootIsSessions = !sessionsHandle && !archivedHandle;
    if (rootIsSessions) sessionsHandle = rootHandle;
    const walk = async (handle, prefix) => {
      try {
        await usageSyncWalkDirectory(handle, prefix, files);
      } catch {
        /* 目录读取失败的子树视为空 */
      }
    };
    await walk(sessionsHandle, rootIsSessions ? "" : "sessions/");
    await walk(archivedHandle, "archived_sessions/");
    files.sort((left, right) => left.path.localeCompare(right.path));

    const stampIndex = options.stamps && typeof options.stamps === "object" ? options.stamps : null;
    const threads = new Map();
    const readErrors = [];
    const nextStamps = {};
    const observability = usageSyncEnsureObservability({});
    let parsedFiles = 0;
    let skippedFiles = 0;
    let lineErrors = 0;
    for (let index = 0; index < files.length; index += 1) {
      const item = files[index];
      if (typeof options.onProgress === "function") options.onProgress({ index: index + 1, total: files.length, path: item.path });
      try {
        const loaded = await usageSyncReadRolloutFile(item.handle);
        const previous = stampIndex ? stampIndex[item.path] : null;
        if (previous && previous.lastModified === loaded.lastModified && previous.size === loaded.size) {
          skippedFiles += 1;
          nextStamps[item.path] = previous;
          continue;
        }
        nextStamps[item.path] = { lastModified: loaded.lastModified, size: loaded.size };
        const ingested = usageSyncIngestRolloutText(loaded.text, threads, observability);
        lineErrors += ingested.lineErrors;
        if (ingested.parsed) parsedFiles += 1;
      } catch (error) {
        readErrors.push(`${item.path}: ${(error && error.message) || error}`);
      }
    }
    return usageSyncFinalizeCollected(files, threads, { parsedFiles, skippedFiles, readErrors, lineErrors, nextStamps, observability });
  }

  function openUsageSyncDatabase() {
    if (state.usageSyncDbPromise) return state.usageSyncDbPromise;
    if (!globalThis.indexedDB) return Promise.resolve(null);
    state.usageSyncDbPromise = new Promise((resolve, reject) => {
      let settled = false;
      let timer = 0;
      const finish = (value, error) => {
        if (settled) return false;
        settled = true;
        if (timer) globalThis.clearTimeout(timer);
        if (error) reject(error);
        else resolve(value);
        return true;
      };
      const request = globalThis.indexedDB.open(USAGE_SYNC_DB_NAME, USAGE_SYNC_DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(USAGE_SYNC_STORE_HANDLES)) db.createObjectStore(USAGE_SYNC_STORE_HANDLES);
        if (!db.objectStoreNames.contains(USAGE_SYNC_STORE_FILE_STAMPS)) db.createObjectStore(USAGE_SYNC_STORE_FILE_STAMPS);
      };
      request.onblocked = () => {
        /* 旧连接占用旧版本：等待其释放，超时后按不可用降级（handle/印章不持久化，同步本身照常） */
      };
      request.onsuccess = () => {
        const db = request.result;
        const usable =
          db.objectStoreNames.contains(USAGE_SYNC_STORE_HANDLES) && db.objectStoreNames.contains(USAGE_SYNC_STORE_FILE_STAMPS);
        if (!finish(usable ? db : null)) {
          try {
            db.close();
          } catch {
            /* 已放弃的连接直接关闭 */
          }
          return;
        }
        if (!usable) {
          try {
            db.close();
          } catch {
            /* ignore */
          }
        }
      };
      request.onerror = () => finish(null, request.error || new Error("usage sync IndexedDB open failed"));
      timer = globalThis.setTimeout(() => finish(null), 5000);
    }).catch(() => null);
    return state.usageSyncDbPromise;
  }

  async function usageSyncStoreGet(storeName, key) {
    const db = await openUsageSyncDatabase();
    if (!db) return null;
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(storeName, "readonly");
        const request = tx.objectStore(storeName).get(key);
        request.onsuccess = () => resolve(request.result ?? null);
        request.onerror = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
  }

  async function usageSyncStorePut(storeName, key, value) {
    const db = await openUsageSyncDatabase();
    if (!db) return false;
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(storeName, "readwrite");
        tx.objectStore(storeName).put(value, key);
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => resolve(false);
        tx.onabort = () => resolve(false);
      } catch {
        resolve(false);
      }
    });
  }

  async function usageSyncLoadStoredHandle() {
    if (state.usageSyncDirHandle) return state.usageSyncDirHandle;
    const stored = await usageSyncStoreGet(USAGE_SYNC_STORE_HANDLES, USAGE_SYNC_DIR_HANDLE_KEY);
    state.usageSyncDirHandle = stored || null;
    return state.usageSyncDirHandle;
  }

  async function usageSyncStoreHandle(handle) {
    await usageSyncStorePut(USAGE_SYNC_STORE_HANDLES, USAGE_SYNC_DIR_HANDLE_KEY, handle);
  }

  async function usageSyncLoadFileStamps() {
    const stored = await usageSyncStoreGet(USAGE_SYNC_STORE_FILE_STAMPS, USAGE_SYNC_FILE_STAMPS_KEY);
    return stored && typeof stored === "object" ? stored : {};
  }

  async function usageSyncStoreFileStamps(stamps) {
    if (!stamps || typeof stamps !== "object") return false;
    return usageSyncStorePut(USAGE_SYNC_STORE_FILE_STAMPS, USAGE_SYNC_FILE_STAMPS_KEY, stamps);
  }

  function usageSyncLastResult() {
    if (state.usageSyncResult) return state.usageSyncResult;
    const stored = UTIL.loadJson(USAGE_SYNC_LAST_RESULT_KEY, null);
    return stored && typeof stored === "object" && UTIL.toCount(stored.at) ? stored : null;
  }

  function saveUsageSyncLastResult(result) {
    try {
      localStorage.setItem(USAGE_SYNC_LAST_RESULT_KEY, JSON.stringify(result));
    } catch {
      /* 存储配额失败不影响同步结果 */
    }
  }

  function usageSyncDirectoryPicker() {
    if (typeof globalThis.showDirectoryPicker === "function") return globalThis.showDirectoryPicker.bind(globalThis);
    const win = globalThis.window;
    if (win && typeof win.showDirectoryPicker === "function") return win.showDirectoryPicker.bind(win);
    return null;
  }

  // 保存位置选择器（File System Access API）。Electron 渲染进程一般不暴露；
  // 不暴露时调用方必须回退到 <a download>，不能把「选不了位置」当成导出失败。
  function usageSaveFilePicker() {
    if (typeof globalThis.showSaveFilePicker === "function") return globalThis.showSaveFilePicker.bind(globalThis);
    const win = globalThis.window;
    if (win && typeof win.showSaveFilePicker === "function") return win.showSaveFilePicker.bind(win);
    return null;
  }

  // 自动同步通道：通过 Codex 应用自带的 app-server 接口（fs/readDirectory、
  // fs/getMetadata、fs/readFile）静默读取本机 .codex 会话，全程无需选择文件夹、
  // 无弹窗；仅在通道不可用时才回退到手动选择目录。

  // App-server 通道发现：宿主注入的 host-client map 是首选契约；若宿主未暴露
  // （Codex++ 版本差异 / 注入时序），再退回 React fiber 树扫描。fiber 扫描分两步：
  // 先从 composer / 标题等 DOM 锚点向上找（便宜），再从 React 根向下遍历（兜底）。
  // 结果缓存；客户端被 dispose 后 isAppServerSyncClient 会自动判定失效并重新发现。
  const APP_SERVER_FIBER_SCAN_LIMIT = 20000;

  // 主机能力矩阵（P2 #3）
  //
  // app-server 的方法集随 Codex++ 版本变化（`fs/*`、`command/exec`）。这里维护一份
  // 能力矩阵，避免降级时只能看到「失败」而说不出「主机没有哪个方法」：
  //   - 只读方法（fs/getMetadata / fs/readDirectory / fs/readFile）主动探测；
  //   - 有副作用的方法（fs/writeFile / fs/copy / command/exec）**不做试探写入**，
  //     由真实使用结果回填（成功 = ok，unsupported/unknown method = missing）。
  // 结果按 HOST_CAPABILITY_TTL_MS 缓存到 localStorage，24h 内不重复探测。

  const HOST_CAPABILITY_KEY = "__codexLiveTokenCostHostCapabilitiesV1";
  const HOST_CAPABILITY_TTL_MS = 24 * 60 * 60 * 1000;
  // 能力矩阵覆盖的方法（顺序即 UI 展示顺序）。
  const HOST_CAPABILITY_METHODS = [
    "fs/readFile",
    "fs/getMetadata",
    "fs/readDirectory",
    "fs/writeFile",
    "fs/createDirectory",
    "fs/copy",
    "fs/remove",
    "command/exec",
  ];
  // 只读、可无副作用探测的方法。
  const HOST_PROBE_READONLY_METHODS = ["fs/getMetadata", "fs/readDirectory", "fs/readFile"];

  function hostCapabilityLoad() {
    if (state.hostCapabilities) return state.hostCapabilities;
    const saved = UTIL.loadJson(HOST_CAPABILITY_KEY, null);
    const methods = {};
    const raw = saved && typeof saved === "object" && saved.methods && typeof saved.methods === "object" ? saved.methods : {};
    for (const method of HOST_CAPABILITY_METHODS) {
      const entry = raw[method];
      if (!entry || typeof entry !== "object") continue;
      const outcome = entry.outcome === "ok" || entry.outcome === "missing" ? entry.outcome : "";
      if (!outcome) continue;
      methods[method] = { outcome, at: UTIL.toCount(entry.at) };
    }
    state.hostCapabilities = { probedAt: UTIL.toCount(saved?.probedAt), methods };
    return state.hostCapabilities;
  }

  function hostCapabilitySave() {
    const matrix = state.hostCapabilities;
    if (!matrix) return false;
    try {
      localStorage.setItem(HOST_CAPABILITY_KEY, JSON.stringify({ probedAt: UTIL.toCount(matrix.probedAt), methods: matrix.methods }));
      return true;
    } catch {
      // 配额写满时能力矩阵只是诊断信息，静默降级。
      return false;
    }
  }

  // unsupported / unknown method 这类错误 = 宿主机没有这个方法（能力缺失）。
  function hostCapabilityMissingError(error) {
    const text = `${(error && error.name) || ""} ${(error && error.message) || error || ""}`;
    return /unknown method|method not found|methodnotfound|unsupported method|not implemented|unimplemented|no such method|method .* not supported/i.test(
      text,
    );
  }

  function hostCapabilityRecord(method, outcome) {
    const name = UTIL.normalizeText(method, 80);
    // 只记 ok / missing 两种确定结论：其它错误可能是路径不存在等偶发原因，不污染矩阵。
    if (!name || (outcome !== "ok" && outcome !== "missing")) return;
    if (!HOST_CAPABILITY_METHODS.includes(name)) return;
    const matrix = hostCapabilityLoad();
    const previous = matrix.methods[name];
    // missing 是稳定结论，不被偶发 error 覆盖；ok 可以被 missing 覆盖（宿主降级）。
    if (previous?.outcome === "missing" && outcome !== "ok") return;
    // 同一结论不重复写盘：`at` 记的是「首次确认时间」，避免每次调用都写 localStorage。
    if (previous?.outcome === outcome) return;
    matrix.methods[name] = { outcome, at: Date.now() };
    hostCapabilitySave();
  }

  // 真实的「方法存在但操作失败」（目录已存在、路径非空…）也应该算 ok：
  // 否则 fs/createDirectory 只在目录不存在的那一次能记上，之后永远是「未观测」。
  function hostCapabilityRecordExisting(method, error) {
    const name = UTIL.normalizeText(method, 80);
    if (!name || !HOST_CAPABILITY_METHODS.includes(name)) return;
    if (hostCapabilityMissingError(error)) return;
    hostCapabilityRecord(name, "ok");
  }

  // 统一的 app-server 调用入口：成功/失败都回填能力矩阵，然后再把错误抛回去。
  async function hostRequest(client, method, params, options) {
    try {
      const result = await client.sendRequest(method, params, options);
      hostCapabilityRecord(method, "ok");
      return result;
    } catch (error) {
      hostCapabilityRecord(method, hostCapabilityMissingError(error) ? "missing" : "");
      throw error;
    }
  }

  // 只读探测：对已知存在的路径试 getMetadata / readDirectory / readFile。
  // 没有可用路径时只标记「未探测」，绝不写文件、绝不跑命令。
  async function hostProbeCapabilities(client, options = {}) {
    if (!isAppServerSyncClient(client)) return hostCapabilityLoad();
    const matrix = hostCapabilityLoad();
    const now = Date.now();
    const ttl = Math.max(0, UTIL.toCount(options.ttlMs) || HOST_CAPABILITY_TTL_MS);
    if (!options.force && matrix.probedAt && now - matrix.probedAt < ttl) return matrix;
    const probePath = UTIL.normalizeText(options.path, 600);
    if (!probePath) return matrix;
    for (const method of HOST_PROBE_READONLY_METHODS) {
      try {
        if (method === "fs/getMetadata") await client.sendRequest(method, { path: probePath }, { priority: "background", source: "plugin_usage_sync" });
        else if (method === "fs/readDirectory") await client.sendRequest(method, { path: probePath }, { priority: "background", source: "plugin_usage_sync" });
        else await client.sendRequest(method, { path: probePath }, { priority: "background", source: "plugin_usage_sync" });
        hostCapabilityRecord(method, "ok");
      } catch (error) {
        hostCapabilityRecord(method, hostCapabilityMissingError(error) ? "missing" : "");
      }
    }
    state.hostCapabilities.probedAt = now;
    hostCapabilitySave();
    return state.hostCapabilities;
  }

  function hostCapabilitySummary() {
    const matrix = hostCapabilityLoad();
    const missing = [];
    const unknown = [];
    for (const method of HOST_CAPABILITY_METHODS) {
      const outcome = matrix.methods[method]?.outcome;
      if (outcome === "missing") missing.push(method);
      else if (outcome !== "ok") unknown.push(method);
    }
    return {
      probedAt: UTIL.toCount(matrix.probedAt),
      methods: { ...matrix.methods },
      missing,
      unknown,
      ok: HOST_CAPABILITY_METHODS.length - missing.length - unknown.length,
      // 备份必须的四个方法都确认可用时才认为「主机备份可写」。
      backupReady: !["fs/writeFile", "fs/copy", "fs/readDirectory", "fs/remove"].some((method) => matrix.methods[method]?.outcome === "missing"),
    };
  }

  // 「未观测」必须点名：只说「2 个方法」用户永远不知道是哪两个。
  // 3 个以内全列；更多时列前两个 + 计数，避免状态行被撑爆。
  function hostCapabilityUnknownLabel(methods) {
    const names = (Array.isArray(methods) ? methods : []).map((method) => UTIL.normalizeText(method, 60)).filter(Boolean);
    if (!names.length) return "";
    if (names.length <= 3) return names.join(" / ");
    return `${names.length} 个方法（${names.slice(0, 2).join(" / ")} 等）`;
  }

  function hostCapabilityStatusText() {
    const summary = hostCapabilitySummary();
    if (!summary.ok && !summary.missing.length) return "";
    const parts = [];
    if (summary.missing.length) parts.push(`不支援 ${summary.missing.join(" / ")}`);
    if (summary.unknown.length) parts.push(`未观测 ${hostCapabilityUnknownLabel(summary.unknown)}`);
    if (!parts.length) return `主机能力：${summary.ok}/${HOST_CAPABILITY_METHODS.length} 个方法可用`;
    return `主机能力：${summary.ok}/${HOST_CAPABILITY_METHODS.length} 可用 · ${parts.join(" · ")}`;
  }

  function isAppServerSyncClient(value) {
    if (!value || typeof value !== "object") return false;
    try {
      return (
        typeof value.sendRequest === "function" &&
        value.disposed !== true &&
        (typeof value.sendAppServerExtensionRequest === "function" || UTIL.normalizeText(value.hostId, 40) === "local")
      );
    } catch {
      return false;
    }
  }

  function appServerSyncClientFromHostMap() {
    try {
      const map = globalThis.__codexPlusNativeHostClients;
      if (!map || typeof map.get !== "function") return null;
      const hostIds = ["local"];
      if (typeof map.keys === "function") {
        for (const key of map.keys()) if (!hostIds.includes(key)) hostIds.push(key);
      }
      for (const hostId of hostIds) {
        const entry = map.get(hostId);
        const candidates = [
          entry && entry.ref && typeof entry.ref.deref === "function" ? entry.ref.deref() : null,
          entry && typeof entry.deref === "function" ? entry.deref() : null,
          entry,
        ];
        for (const candidate of candidates) {
          if (isAppServerSyncClient(candidate)) return candidate;
        }
      }
    } catch {
      // Codex++ 未暴露原生 host client 时静默降级
    }
    return null;
  }

  function appServerSyncClientFromFiberFields(fiber) {
    if (!fiber || typeof fiber !== "object") return null;
    const candidates = [fiber.memoizedProps?.value, fiber.memoizedProps?.client, fiber.stateNode];
    for (let dependency = fiber.dependencies?.firstContext; dependency; dependency = dependency.next) {
      candidates.push(dependency.memoizedValue);
    }
    for (let hook = fiber.memoizedState; hook; hook = hook.next) {
      candidates.push(hook.memoizedState);
      candidates.push(hook.memoizedState?.current);
    }
    for (const candidate of candidates) {
      if (isAppServerSyncClient(candidate)) return candidate;
    }
    return null;
  }

  function appServerSyncClientFromFiberNode(node) {
    if (!node || typeof node !== "object") return null;
    const fiberKey = Object.keys(node).find((key) => key.startsWith("__reactFiber$") || key.startsWith("__reactInternalInstance$"));
    for (let fiber = fiberKey ? node[fiberKey] : null; fiber; fiber = fiber.return) {
      const client = appServerSyncClientFromFiberFields(fiber);
      if (client) return client;
    }
    return null;
  }

  function appServerSyncReactRoots(doc = document) {
    const roots = [];
    const seen = new Set();
    const addRoot = (fiber) => {
      if (!fiber || typeof fiber !== "object" || seen.has(fiber)) return;
      seen.add(fiber);
      roots.push(fiber);
    };
    try {
      addRoot(globalThis.__codexRoot?._internalRoot?.current);
    } catch {
      // 宿主内部结构不可读时忽略
    }
    const addContainer = (node) => {
      if (!node || typeof node !== "object") return;
      try {
        const key = Object.keys(node).find((name) => name.startsWith("__reactContainer$"));
        if (!key) return;
        addRoot(node[key]?.stateNode?.current || node[key]);
      } catch {
        // 非 React 容器
      }
    };
    addContainer(doc?.body);
    const containers = doc?.querySelectorAll?.("#root, body > div") || [];
    for (const node of containers) addContainer(node);
    return roots;
  }

  function appServerSyncClientFromFiberTree(rootFiber) {
    const pending = [rootFiber];
    const visited = new Set();
    let scanned = 0;
    while (pending.length && scanned < APP_SERVER_FIBER_SCAN_LIMIT) {
      const fiber = pending.pop();
      if (!fiber || typeof fiber !== "object" || visited.has(fiber)) continue;
      visited.add(fiber);
      scanned += 1;
      const client = appServerSyncClientFromFiberFields(fiber);
      if (client) return client;
      if (fiber.child) pending.push(fiber.child);
      if (fiber.sibling) pending.push(fiber.sibling);
    }
    return null;
  }

  function appServerSyncClientFromDocument(doc = document) {
    const anchors = [
      doc.querySelector?.("[data-codex-composer-root]"),
      doc.querySelector?.("[data-app-action-sidebar-thread-id]"),
      doc.querySelector?.("main h1, [role='main'] h1, h1"),
      doc.body,
    ].filter(Boolean);
    for (const anchor of anchors) {
      const client = appServerSyncClientFromFiberNode(anchor);
      if (client) return client;
    }
    return null;
  }

  function appServerSyncClientFromReactRoots(doc = document) {
    for (const root of appServerSyncReactRoots(doc)) {
      const client = appServerSyncClientFromFiberTree(root);
      if (client) return client;
    }
    return null;
  }

  function appServerSyncClient() {
    if (isAppServerSyncClient(state.usageSyncClient)) return state.usageSyncClient;
    state.usageSyncClient = null;
    let client = appServerSyncClientFromHostMap();
    let channel = client ? "host-map" : "";
    if (!client) {
      client = appServerSyncClientFromDocument();
      channel = client ? "fiber-ancestor" : "";
    }
    if (!client) {
      client = appServerSyncClientFromReactRoots();
      channel = client ? "fiber-tree" : "";
    }
    state.usageSyncClient = client || null;
    state.usageSyncClientChannel = channel;
    return state.usageSyncClient;
  }

  function usageSyncJoinPath(dir, name) {
    const base = UTIL.normalizeText(dir, 600).replace(/[\\/]+$/, "");
    const child = UTIL.normalizeText(name, 260).replace(/^[\\/]+/, "");
    return base && child ? `${base}\\${child}` : base || child;
  }

  // 脚本自更新：启动时静默检测 GitHub 上的新版本；仅在检测到新版本后，于设置页
  // 标题旁显示「一键更新」入口。页面 fetch 被 CSP 拦截，因此下载走 app-server
  // command/exec 执行本机 curl，安装走 fs/writeFile（跨平台统一，无需 move/cmd），
  // 写回校验通过后覆盖本地脚本文件并就地重载（destroy + eval）立即生效。

  function updateParseVersion(text) {
    const match = /^\/\/\s*@version[ \t]+(\S+)[ \t]*$/m.exec(String(text || ""));
    return UTIL.normalizeText(match?.[1], 40);
  }

  function updateVersionParts(value) {
    const match = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/.exec(UTIL.normalizeText(value, 60));
    if (!match) return null;
    return {
      numbers: [Number(match[1]), Number(match[2]), Number(match[3])],
      prerelease: match[4] ? match[4].split(".") : [],
    };
  }

  function compareUpdateVersions(left, right) {
    const a = updateVersionParts(left);
    const b = updateVersionParts(right);
    if (!a || !b) return 0;
    for (let index = 0; index < 3; index += 1) {
      if (a.numbers[index] !== b.numbers[index]) return a.numbers[index] < b.numbers[index] ? -1 : 1;
    }
    if (!a.prerelease.length && !b.prerelease.length) return 0;
    if (!a.prerelease.length) return 1;
    if (!b.prerelease.length) return -1;
    const length = Math.max(a.prerelease.length, b.prerelease.length);
    for (let index = 0; index < length; index += 1) {
      const leftId = a.prerelease[index];
      const rightId = b.prerelease[index];
      if (leftId === undefined) return -1;
      if (rightId === undefined) return 1;
      if (leftId === rightId) continue;
      const leftNumeric = /^\d+$/.test(leftId);
      const rightNumeric = /^\d+$/.test(rightId);
      if (leftNumeric && rightNumeric) return Number(leftId) < Number(rightId) ? -1 : 1;
      if (leftNumeric) return -1;
      if (rightNumeric) return 1;
      const leftSuffix = /^([A-Za-z-]+)(\d+)$/.exec(leftId);
      const rightSuffix = /^([A-Za-z-]+)(\d+)$/.exec(rightId);
      if (leftSuffix && rightSuffix && leftSuffix[1] === rightSuffix[1]) {
        const leftNumber = Number(leftSuffix[2]);
        const rightNumber = Number(rightSuffix[2]);
        if (leftNumber !== rightNumber) return leftNumber < rightNumber ? -1 : 1;
        continue;
      }
      return leftId < rightId ? -1 : 1;
    }
    return 0;
  }

  function updateCommandPathJoin(dir, name) {
    const base = UTIL.normalizeText(dir, 600).replace(/[\\/]+$/, "");
    const child = UTIL.normalizeText(name, 260).replace(/^[\\/]+/, "");
    if (!base) return child;
    if (!child) return base;
    const separator = /^[A-Za-z]:/.test(base) || base.includes("\\") ? "\\" : "/";
    return `${base}${separator}${child}`;
  }

  function updateDownloadCommand(url, outPath) {
    return [
      "curl",
      "-sS",
      "-L",
      "--fail",
      "--connect-timeout", "10",
      "--max-time", "60",
      "--retry", "2",
      "--retry-delay", "1",
      "-o", outPath,
      url,
    ];
  }

  function updateCheckCommand(url, outPath) {
    return [
      "curl",
      "-sS",
      "-L",
      "--fail",
      "--connect-timeout", "5",
      "--max-time", "20",
      "--retry", "2",
      "--retry-delay", "1",
      "-r", `0-${UPDATE_CHECK_RANGE_BYTES}`,
      "-o", outPath,
      url,
    ];
  }

  function updateYieldPaint() {
    if (window.__CODEX_LIVE_TOKEN_COST_TEST__) return Promise.resolve();
    return new Promise((resolve) => {
      let settled = false;
      const done = () => {
        if (settled) return;
        settled = true;
        resolve();
      };
      if (typeof window.requestAnimationFrame === "function") window.requestAnimationFrame(done);
      // 窗口隐藏/最小化时 rAF 会被挂起：必须有计时器兜底，避免更新流程永久卡在“检查更新中…”。
      window.setTimeout(done, 50);
    });
  }

  function updateDecodeBase64Text(value) {
    const binary = window.atob(value);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return new TextDecoder("utf-8").decode(bytes);
  }

  // btoa 只接受 Latin-1；模型名可能是中文，先按 UTF-8 编码再转 base64。
  function updateEncodeBase64Text(value) {
    const bytes = new TextEncoder().encode(String(value));
    let binary = "";
    const chunkSize = 0x8000;
    for (let index = 0; index < bytes.length; index += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
    }
    return window.btoa(binary);
  }

  function updateCacheBustUrl() {
    return `${UPDATE_REMOTE_URL}?cltc_update=${Date.now()}`;
  }

  function updateSourceLooksValid(text, version) {
    if (typeof text !== "string" || text.length < UPDATE_MIN_SOURCE_LENGTH) return false;
    if (!/^\/\/\s*==UserScript==/.test(text)) return false;
    if (!/\/\/\s*@name\s+Codex Live Token Cost/.test(text)) return false;
    if (!text.includes("__codexLiveTokenCostVersion")) return false;
    if (updateParseVersion(text) !== version) return false;
    if (!text.trimEnd().endsWith("})();")) return false;
    return true;
  }

  function updateErrorMessage(error) {
    const raw = error && typeof error === "object" && "message" in error ? error.message : error;
    return UTIL.normalizeText(String(raw ?? ""), 300) || "未知错误";
  }

  async function updateResolveTarget() {
    if (typeof window.codexPlus?.call !== "function" || !codexPlusApiReady()) {
      throw new Error("Codex++ 通道不可用");
    }
    const key = codexPlusScriptKey();
    const result = await window.codexPlus.call("/user-scripts/list", {});
    const userDir = UTIL.normalizeText(result?.user_dir, 600);
    if (!userDir) throw new Error("无法解析用户脚本目录");
    const scripts = Array.isArray(result?.scripts) ? result.scripts : [];
    const entry = scripts.find((item) => UTIL.normalizeText(item?.key, 200) === key)
      || scripts.find((item) => UTIL.normalizeText(item?.name, 260).endsWith("market-codex-live-token-cost.js"));
    const name = UTIL.normalizeText(entry?.name, 260) || "market-codex-live-token-cost.js";
    const targetPath = updateCommandPathJoin(userDir, name);
    return { userDir, name, targetPath, downloadPath: `${targetPath}.download` };
  }

  function updateClientOptions() {
    return { priority: "background", source: "codex-token-cost-update" };
  }

  async function updateRunCommand(client, command, userDir) {
    // 三个调用方都只下载到已解析的用户脚本目录；不修改全局沙箱或代理配置。
    const params = {
      command,
      cwd: userDir,
      timeoutMs: UPDATE_COMMAND_TIMEOUT_MS,
      sandboxPolicy: {
        type: "workspaceWrite",
        writableRoots: [userDir],
        networkAccess: true,
        excludeTmpdirEnvVar: true,
        excludeSlashTmp: true,
      },
    };
    const execute = async () => {
      const response = await hostRequest(client, "command/exec", params, updateClientOptions());
      if (Number(response?.exitCode) !== 35 || !String(response?.stderr || "").includes("SEC_E_NO_CREDENTIALS")) return response;
      // Windows 受限令牌无法取得 Schannel 凭证时，使用 Node 的 TLS，仍保留证书校验。
      const rangeIndex = command.indexOf("-r");
      const fallback = await hostRequest(client, "command/exec", {
        ...params,
        command: [
          "node", "-e",
          "const fs=require('node:fs/promises');const [url,path,range]=process.argv.slice(1);fetch(url,{headers:range?{Range:'bytes='+range}:{},signal:AbortSignal.timeout(60000)}).then(async r=>{if(!r.ok)throw Error('HTTP '+r.status);await fs.writeFile(path,Buffer.from(await r.arrayBuffer()))}).catch(e=>{console.error(e.cause?.message||e.message);process.exitCode=1})",
          command.at(-1), command[command.indexOf("-o") + 1], rangeIndex >= 0 ? command[rangeIndex + 1] : "",
        ],
      }, updateClientOptions());
      if (Number(fallback?.exitCode) !== 0) {
        throw new Error(`curl TLS 凭证失败；Node 备用下载失败：${fallback?.stderr || fallback?.stdout || "请确认已安装 Node.js 22+"}`);
      }
      return fallback;
    };
    let timer = 0;
    const timeout = new Promise((resolve, reject) => {
      timer = window.setTimeout(() => reject(new Error("命令执行超时")), UPDATE_COMMAND_TIMEOUT_MS);
    });
    let result = null;
    try {
      result = await Promise.race([
        execute(),
        timeout,
      ]);
    } finally {
      window.clearTimeout(timer);
    }
    const exitCode = Number(result?.exitCode);
    if (!result || !Number.isFinite(exitCode) || exitCode !== 0) {
      const detail = UTIL.normalizeText(result?.stderr, 200) || UTIL.normalizeText(result?.stdout, 200) || "命令执行失败";
      throw new Error(`命令失败（退出码 ${Number.isFinite(exitCode) ? exitCode : "?"}）：${detail}`);
    }
    return result;
  }

  async function updateReadBase64(client, path) {
    const result = await hostRequest(client, "fs/readFile", { path }, updateClientOptions());
    const dataBase64 = typeof result?.dataBase64 === "string" ? result.dataBase64 : "";
    if (!dataBase64) throw new Error("读取远端脚本失败");
    return dataBase64;
  }

  async function updateWriteBase64(client, path, dataBase64) {
    await hostRequest(client, "fs/writeFile", { path, dataBase64 }, updateClientOptions());
  }

  async function updateRemoveFile(client, path) {
    try {
      await hostRequest(client, "fs/remove", { path }, updateClientOptions());
    } catch {
      // 清理下载临时文件失败不影响更新结果。
    }
  }

  function updateClearStatusTimer() {
    if (!state.updateStatusTimer) return;
    window.clearTimeout(state.updateStatusTimer);
    state.updateStatusTimer = 0;
  }

  function updateScheduleStatusReset() {
    updateClearStatusTimer();
    state.updateStatusTimer = trackTimer(window.setTimeout(() => {
      state.updateStatusTimer = 0;
      if (state.destroyed || state.updateBusy) return;
      if (state.updatePhase === "uptodate") {
        state.updatePhase = "";
        renderUpdateCluster();
      }
    }, UPDATE_STATUS_RESET_MS));
  }

  function updateScheduleAutoCheck() {
    if (window.__CODEX_LIVE_TOKEN_COST_TEST__) return;
    if (state.updateAutoCheckTimer || state.destroyed) return;
    state.updateAutoCheckTimer = trackTimer(window.setTimeout(() => {
      state.updateAutoCheckTimer = 0;
      if (state.destroyed) return;
      void checkForUpdateNow({ auto: true });
    }, UPDATE_AUTO_CHECK_DELAY_MS));
  }

  async function checkForUpdateNow(options = {}) {
    const auto = options.auto === true;
    if (state.destroyed || state.updateBusy) return false;
    if (typeof window.codexPlus?.call !== "function" || !codexPlusApiReady()) {
      state.updateError = "Codex++ 通道不可用";
      state.updateErrorKind = "check";
      if (!auto) {
        state.updatePhase = "error";
        renderUpdateCluster();
      }
      return false;
    }
    state.updateBusy = true;
    state.updateError = "";
    state.updateErrorKind = "";
    if (state.updatePhase !== "available") state.updatePhase = "checking";
    updateClearStatusTimer();
    renderUpdateCluster();
    await updateYieldPaint();
    try {
      const target = await updateResolveTarget();
      const client = appServerSyncClient();
      if (!client) throw new Error("未找到本地文件通道");
      await updateRunCommand(client, updateCheckCommand(updateCacheBustUrl(), target.downloadPath), target.userDir);
      if (state.destroyed) return false;
      const text = await updateReadBase64(client, target.downloadPath).then(updateDecodeBase64Text);
      if (state.destroyed) return false;
      const remoteVersion = updateParseVersion(text);
      if (!remoteVersion) throw new Error("远端脚本缺少版本信息");
      await updateRemoveFile(client, target.downloadPath);
      state.updateRemoteVersion = remoteVersion;
      if (compareUpdateVersions(remoteVersion, VERSION) > 0) {
        state.updatePhase = "available";
      } else {
        state.updateRemoteVersion = "";
        state.updatePhase = auto ? "" : "uptodate";
        if (!auto) updateScheduleStatusReset();
      }
      return true;
    } catch (error) {
      state.updateRemoteVersion = "";
      state.updateError = updateErrorMessage(error);
      if (auto) {
        state.updatePhase = "";
      } else {
        state.updatePhase = "error";
        state.updateErrorKind = "check";
      }
      return false;
    } finally {
      state.updateBusy = false;
      if (!state.destroyed) renderUpdateCluster();
    }
  }

  async function runScriptUpdate() {
    if (state.destroyed || state.updateBusy) return false;
    const retrying = state.updatePhase === "error" && state.updateErrorKind === "update";
    if (state.updatePhase !== "available" && !retrying) return false;
    state.updateBusy = true;
    state.updateError = "";
    state.updateErrorKind = "";
    state.updatePhase = "updating";
    updateClearStatusTimer();
    renderUpdateCluster();
    await updateYieldPaint();
    try {
      const target = await updateResolveTarget();
      const client = appServerSyncClient();
      if (!client) throw new Error("未找到本地文件通道");
      await updateRunCommand(client, updateDownloadCommand(updateCacheBustUrl(), target.downloadPath), target.userDir);
      if (state.destroyed) return false;
      const dataBase64 = await updateReadBase64(client, target.downloadPath);
      const text = updateDecodeBase64Text(dataBase64);
      const remoteVersion = updateParseVersion(text);
      if (!remoteVersion || compareUpdateVersions(remoteVersion, VERSION) <= 0) throw new Error("远端版本无效或没有变化");
      if (!updateSourceLooksValid(text, remoteVersion)) throw new Error("下载内容校验未通过");
      state.updateRemoteVersion = remoteVersion;
      state.updatePhase = "applying";
      renderUpdateCluster();
      await updateYieldPaint();
      await updateWriteBase64(client, target.targetPath, dataBase64);
      if (state.destroyed) return false;
      const verifyBase64 = await updateReadBase64(client, target.targetPath);
      if (verifyBase64 !== dataBase64) throw new Error("脚本文件写回校验失败");
      await updateRemoveFile(client, target.downloadPath);
      applyUpdatedScript(text, remoteVersion);
      return true;
    } catch (error) {
      if (!state.destroyed) {
        state.updatePhase = "error";
        state.updateErrorKind = "update";
        state.updateError = updateErrorMessage(error);
        renderUpdateCluster();
      }
      return false;
    } finally {
      state.updateBusy = false;
      if (!state.destroyed) renderUpdateCluster();
    }
  }

  function applyUpdatedScript(sourceText, remoteVersion) {
    const registryKey = codexPlusScriptKey();
    const registry = window.__codexPlusUserScripts;
    const trace = {
      at: new Date().toISOString(),
      remoteVersion,
      versionBefore: window.__codexLiveTokenCostVersion ?? null,
      destroyError: "",
      versionAfterDestroy: null,
      evalError: "",
      evalStack: "",
      applied: false,
      versionAfterEval: null,
    };
    window.__codexLiveTokenCostLastApply = trace;
    try {
      destroy();
    } catch (error) {
      trace.destroyError = updateErrorMessage(error);
      reportFailure(error);
    }
    trace.versionAfterDestroy = window.__codexLiveTokenCostVersion ?? null;
    let applied = false;
    try {
      (0, eval)(sourceText);
      applied = window.__codexLiveTokenCostVersion === remoteVersion;
    } catch (error) {
      trace.evalError = updateErrorMessage(error);
      trace.evalStack = String(error?.stack || "").slice(0, 600);
      reportFailure(error);
    }
    trace.applied = applied;
    trace.versionAfterEval = window.__codexLiveTokenCostVersion ?? null;
    window.setTimeout(() => {
      trace.versionAfter3s = window.__codexLiveTokenCostVersion ?? null;
      trace.instanceAfter3s = typeof window.__codexLiveTokenCost;
      trace.railAfter3s = !!Array.from(document.querySelectorAll?.("nav[data-app-navigation-rail] button[aria-label]") || [])
        .find((node) => (node.getAttribute?.("aria-label") || "") === "Codex Token Cost");
      trace.styleAfter3s = !!document.getElementById(STYLE_ID);
    }, 3000);
    if (!applied) {
      window.codexPlus?.toast?.(`脚本文件已更新到 v${remoteVersion}，重启 Codex 后生效`, { type: "warn" });
      return false;
    }
    try {
      const entry = registry?.scripts?.[registryKey];
      if (entry && typeof entry === "object") {
        const destroyNext = window.__codexLiveTokenCost?.destroy;
        if (typeof destroyNext === "function") entry.cleanups = [destroyNext];
        entry.loadedAt = new Date().toISOString();
        entry.status = "loaded";
        entry.error = "";
      }
    } catch {
      // 注册表 best-effort 修正失败不影响新实例运行。
    }
    window.codexPlus?.toast?.(`Codex Token Cost 已更新到 v${remoteVersion}`, { type: "success" });
    reopenEmbeddedSettingsSoon();
    return true;
  }

  function reopenEmbeddedSettingsSoon() {
    const deadline = Date.now() + 6000;
    const attempt = () => {
      const button = Array.from(document.querySelectorAll?.('nav[data-app-navigation-rail] button[aria-label]') || [])
        .find((node) => (node.getAttribute?.('aria-label') || '') === 'Codex Token Cost');
      if (button?.isConnected) {
        button.click?.();
        return;
      }
      if (Date.now() < deadline) window.setTimeout(attempt, 250);
    };
    window.setTimeout(attempt, 300);
  }

  const GITHUB_ICON_SVG =
    '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" focusable="false">' +
    '<path fill="currentColor" d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.012 8.012 0 0 0 16 8c0-4.42-3.58-8-8-8Z"></path>' +
    "</svg>";

  function updateGithubButtonHtml() {
    return `<button type="button" class="cltc-update-github" data-action="open-repo" title="在 GitHub 上 Star 支持本项目" aria-label="打开 GitHub 项目仓库">${GITHUB_ICON_SVG}</button>`;
  }

  function updateClusterHtml() {
    const versionText = `v${VERSION}`;
    const versionSpan = `<span class="cltc-update-version">${escapeHtml(versionText)}</span>`;
    let body;
    if (state.updateBusy) {
      const note = state.updatePhase === "applying"
        ? `正在应用 v${escapeHtml(state.updateRemoteVersion)}…`
        : state.updatePhase === "updating" || state.updatePhase === "available"
          ? "正在更新…"
          : "检查更新中…";
      body = versionSpan + `<span class="cltc-update-note">${note}</span>`;
    } else if (state.updatePhase === "available") {
      body = versionSpan + `<button type="button" class="cltc-update-action" data-action="update-script" title="从 GitHub 下载新版本并立即生效">一键更新 v${escapeHtml(state.updateRemoteVersion)}</button>`;
    } else if (state.updatePhase === "error") {
      const isUpdate = state.updateErrorKind === "update";
      const label = isUpdate ? "更新失败，点击重试" : "检查更新失败，点击重试";
      const action = isUpdate ? "update-script" : "check-update";
      body = versionSpan + `<button type="button" class="cltc-update-action" data-action="${action}" data-tone="warn" title="${escapeHtml(state.updateError || "未知错误")}">${label}</button>`;
    } else if (state.updatePhase === "uptodate") {
      body = versionSpan + `<span class="cltc-update-note">已是最新</span>`;
    } else {
      const title = state.updateError
        ? `上次检查更新失败：${escapeHtml(state.updateError)}（点击重试）`
        : "点击检查更新";
      body = `<button type="button" class="cltc-update-version" data-action="check-update" title="${title}">${escapeHtml(versionText)}</button>`;
    }
    return body + updateGithubButtonHtml();
  }

  function ensureUpdateCluster() {
    const container = state.embeddedPageContainer;
    if (!container || typeof container.closest !== "function") return null;
    const modal = container.closest(".codex-plus-modal-content") || container.closest(".codex-plus-page-overlay");
    if (!modal || typeof modal.querySelector !== "function") return null;
    const title = modal.querySelector(".codex-plus-modal-title");
    if (!title || typeof title.appendChild !== "function") return null;
    let cluster = state.updateClusterEl;
    if (cluster && typeof cluster.isConnected === "boolean" && !cluster.isConnected) cluster = null;
    if (cluster && cluster.parentElement && cluster.parentElement !== title) cluster = null;
    if (!cluster) {
      const leftover = typeof title.querySelector === "function" ? title.querySelector(".cltc-update-cluster") : null;
      if (leftover) leftover.remove?.();
      cluster = document.createElement("span");
      cluster.className = "cltc-update-cluster";
      cluster.setAttribute("data-phase", "idle");
      cluster.addEventListener?.("click", handleUpdateClusterClick);
      title.appendChild(cluster);
      state.updateClusterEl = cluster;
    }
    return cluster;
  }

  function renderUpdateCluster() {
    const cluster = ensureUpdateCluster();
    if (!cluster) return;
    const html = updateClusterHtml();
    if (cluster.innerHTML !== html) cluster.innerHTML = html;
    cluster.setAttribute("data-phase", state.updateBusy ? "busy" : state.updatePhase || "idle");
  }

  function handleUpdateClusterClick(event) {
    const actionNode = event?.target?.closest?.("button[data-action]");
    if (!actionNode || state.destroyed) return;
    const action = actionNode.getAttribute?.("data-action") || "";
    if (action === "open-repo") {
      window.open(UPDATE_REPO_URL, "_blank", "noopener,noreferrer");
      return;
    }
    if (state.updateBusy) return;
    if (action === "update-script") void runScriptUpdate();
    else if (action === "check-update") void checkForUpdateNow({ auto: false });
  }

  function usageSyncRootFromRolloutPath(value) {
    const text = UTIL.normalizeText(value, 600).replace(/^\\\\\?\\/, "");
    const match = text.match(/^(.*[\\/]\.codex)[\\/](?:sessions|archived_sessions)[\\/]/i);
    return match ? match[1] : "";
  }

  async function usageSyncResolveCodexRoot(client) {
    if (!isAppServerSyncClient(client)) return "";
    for (const archived of [false, true]) {
      try {
        const response = await client.sendRequest(
          "thread/list",
          { archived, cursor: null, limit: 50, sortKey: "updated_at", useStateDbOnly: true },
          { priority: "background", source: "plugin_usage_sync" },
        );
        for (const item of response?.data || []) {
          const root = usageSyncRootFromRolloutPath(item?.path);
          if (root) return root;
        }
      } catch {
        // 列表不可用时继续尝试 archived 与手动回退
      }
    }
    return "";
  }

  function usageSyncBase64ToBytes(value) {
    const text = String(value || "");
    if (!text) return new Uint8Array(0);
    let binary = "";
    if (typeof globalThis.atob === "function") {
      try {
        binary = globalThis.atob(text);
      } catch {
        binary = "";
      }
    }
    if (!binary) {
      const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
      const clean = text.replace(/[^A-Za-z0-9+/=]/g, "");
      const codes = [];
      for (let index = 0; index < clean.length; index += 4) {
        const c0 = alphabet.indexOf(clean[index]);
        const c1 = alphabet.indexOf(clean[index + 1]);
        if (c0 < 0 || c1 < 0) break;
        const c2 = alphabet.indexOf(clean[index + 2]);
        const c3 = alphabet.indexOf(clean[index + 3]);
        codes.push(((c0 << 2) | (c1 >> 4)) & 0xff);
        if (c2 >= 0) codes.push(((c1 << 4) | (c2 >> 2)) & 0xff);
        if (c2 >= 0 && c3 >= 0) codes.push(((c2 << 6) | c3) & 0xff);
      }
      return new Uint8Array(codes);
    }
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return bytes;
  }

  async function usageSyncReadDirectoryViaAppServer(client, path) {
    const response = await hostRequest(client, "fs/readDirectory", { path }, { priority: "background", source: "plugin_usage_sync" });
    return Array.isArray(response?.entries) ? response.entries : [];
  }

  async function usageSyncCollectFilesViaAppServer(client, root) {
    const files = [];
    let visited = 0;
    const walk = async (dir, prefix, depth) => {
      if (depth > USAGE_SYNC_AUTO_MAX_DEPTH || visited > USAGE_SYNC_AUTO_MAX_ENTRIES) return;
      let entries = [];
      try {
        entries = await usageSyncReadDirectoryViaAppServer(client, dir);
      } catch {
        return;
      }
      for (const entry of entries) {
        visited += 1;
        if (visited > USAGE_SYNC_AUTO_MAX_ENTRIES) return;
        const name = UTIL.normalizeText(entry?.fileName, 260);
        if (!name) continue;
        const child = usageSyncJoinPath(dir, name);
        if (entry.isDirectory) {
          await walk(child, `${prefix}${name}/`, depth + 1);
        } else if (entry.isFile && USAGE_SYNC_ROLLOUT_FILE_RE.test(name)) {
          files.push({ path: `${prefix}${name}`, absPath: child });
        }
      }
    };
    await walk(usageSyncJoinPath(root, "sessions"), "sessions/", 0);
    await walk(usageSyncJoinPath(root, "archived_sessions"), "archived_sessions/", 0);
    return files;
  }

  // 同一 turn 跨多个 rollout 文件时按 response_id 合并，不再 first-wins 丢弃后续响应。
  function usageSyncMergeTurnRecord(target, source) {
    if (!target) return source;
    if (!source) return target;
    if (!target.model && source.model) target.model = source.model;
    if (!target.effort && source.effort) target.effort = source.effort;
    if (source.startedAtMs) target.startedAtMs = target.startedAtMs ? Math.min(target.startedAtMs, source.startedAtMs) : source.startedAtMs;
    if (source.finishedAtMs) target.finishedAtMs = Math.max(target.finishedAtMs || 0, source.finishedAtMs);
    if (source.durationMs) target.durationMs = Math.max(target.durationMs || 0, source.durationMs);
    // 逐响应事实按 response_id 幂等合并。
    if (source.responses instanceof Map) {
      for (const [responseId, entry] of source.responses) target.responses.set(responseId, entry);
    }
    // 回退条目按 (turn, signature, cumulativeTotal) 去重。
    if (source.fallbackSeen instanceof Set) {
      for (const key of source.fallbackSeen) target.fallbackSeen.add(key);
    }
    if (Array.isArray(source.fallbackCalls)) {
      for (const call of source.fallbackCalls) {
        const key = usageSyncFallbackKey(target.turnId, call.usage);
        if (target.fallbackSeen.has(key)) continue;
        target.fallbackSeen.add(key);
        target.fallbackCalls.push(call);
      }
    }
    for (const [name, count] of source.skillCounts) {
      target.skillCounts.set(name, (target.skillCounts.get(name) || 0) + count);
    }
    for (const [server, count] of source.pluginCounts) {
      target.pluginCounts.set(server, (target.pluginCounts.get(server) || 0) + count);
    }
    // 状态优先级：failed / interrupted 不被 completed 覆盖。
    if (!target.status || target.status === "completed") {
      if (source.status && source.status !== "completed") target.status = source.status;
      else if (source.status) target.status = source.status;
    }
    if (source.error && !target.error) target.error = source.error;
    if (source.abortReason && !target.abortReason) target.abortReason = source.abortReason;
    return target;
  }

  function usageSyncIngestRolloutText(text, threads, observability = null) {
    const fileSummary = usageSyncEnsureObservability({ lineErrors: 0 });
    const thread = usageSyncParseRolloutLines(String(text).split(/\r?\n/), fileSummary);
    if (thread) {
      const target = threads.get(thread.threadId) || { turns: new Map(), orphanCalls: [], orphanResponses: new Map(), rateLimits: [], fallbackModel: "", fallbackEffort: "" };
      for (const [turnId, record] of thread.turns) {
        const existing = target.turns.get(turnId);
        target.turns.set(turnId, existing ? usageSyncMergeTurnRecord(existing, record) : record);
      }
      if (thread.orphanCalls.length) target.orphanCalls.push(...thread.orphanCalls);
      if (thread.orphanResponses instanceof Map) {
        for (const [responseId, entry] of thread.orphanResponses) target.orphanResponses.set(responseId, entry);
      }
      if (Array.isArray(thread.rateLimits)) target.rateLimits.push(...thread.rateLimits);
      // 线程级模型回退：同一线程的后续文件没写 turn_context 时仍能归属模型。
      if (thread.fallbackModel) target.fallbackModel = thread.fallbackModel;
      if (thread.fallbackEffort) target.fallbackEffort = thread.fallbackEffort;
      threads.set(thread.threadId, target);
    }
    // 可观测性：把本次文件的解析/重复计数汇总给调用方。
    if (observability) usageSyncAddObservability(observability, fileSummary);
    return { parsed: Boolean(thread), lineErrors: fileSummary.lineErrors, observability: fileSummary };
  }
  function usageSyncFinalizeCollected(files, threads, stats) {
    const rows = [];
    const facts = [];
    const rateLimits = [];
    for (const [threadId, info] of threads) {
      for (const record of info.turns.values()) {
        const row = usageSyncFinalizeTurnRow(threadId, record, info.fallbackModel, info.fallbackEffort);
        if (row) rows.push(row);
        // 逐响应事实入库：按 response_id 幂等；模型挂在每条响应上。
        if (record.responses instanceof Map) {
          for (const [responseId, entry] of record.responses) {
            facts.push({
              responseId,
              threadId,
              turnId: record.turnId,
              rootTurnId: "",
              model: record.model || info.fallbackModel || "",
              effort: record.effort || info.fallbackEffort || "",
              usage: entry.usage,
              turnCumulative: entry.turnCumulative,
              threadCumulative: entry.threadCumulative,
              observedAtMs: entry.observedAtMs,
              source: "rollout_record",
            });
          }
        }
      }
      if (info.orphanResponses instanceof Map) {
        for (const [responseId, entry] of info.orphanResponses) {
          facts.push({
            responseId,
            threadId,
            turnId: "",
            rootTurnId: "",
            model: info.fallbackModel || "",
            effort: info.fallbackEffort || "",
            usage: entry.usage,
            turnCumulative: entry.turnCumulative,
            threadCumulative: entry.threadCumulative,
            observedAtMs: entry.observedAtMs,
            source: "rollout_record",
          });
        }
      }
      if (Array.isArray(info.rateLimits)) rateLimits.push(...info.rateLimits.map((item) => ({ ...item, threadId })));
      if (info.orphanCalls.length) {
        const orphanRow = usageSyncFinalizeTurnRow(threadId, {
          turnId: `${threadId}:orphan`,
          model: "",
          effort: "",
          startedAtMs: 0,
          finishedAtMs: 0,
          durationMs: 0,
          calls: info.orphanCalls,
          responses: new Map(),
          fallbackCalls: [],
          fallbackSeen: new Set(),
          skillCounts: new Map(),
          pluginCounts: new Map(),
        }, info.fallbackModel, info.fallbackEffort);
        if (orphanRow) rows.push(orphanRow);
      }
    }
    rows.sort(
      (left, right) =>
        String(left.startedAt).localeCompare(String(right.startedAt)) || String(left.turnId).localeCompare(String(right.turnId)),
    );
    const days = new Set();
    let calls = 0;
    let tokens = 0;
    for (const row of rows) {
      calls += row.callCount || 0;
      tokens += row.usage?.total_tokens || 0;
      const day = localDateKey(UTIL.toTimestampMs(row.startedAt));
      if (day) days.add(day);
    }
    const sortedDays = Array.from(days).sort();
    return {
      rows,
      facts,
      rateLimits,
      scannedFiles: files.length,
      parsedFiles: stats.parsedFiles,
      skippedFiles: stats.skippedFiles,
      readErrors: stats.readErrors,
      lineErrors: stats.lineErrors,
      calls,
      tokens,
      firstDay: sortedDays[0] || "",
      lastDay: sortedDays[sortedDays.length - 1] || "",
      nextStamps: stats.nextStamps,
      // 可观测性（P2 #5）：解析行数 / 逐响应记录 / 心跳 / 重复数。
      observability: usageSyncEnsureObservability({ ...(stats.observability || {}) }),
    };
  }

  async function usageSyncCollectRowsViaAppServer(client, options = {}) {
    if (!isAppServerSyncClient(client)) throw new Error("自动同步通道不可用");
    const root = UTIL.normalizeText(options.root, 600);
    if (!root) throw new Error("未定位到本机 .codex 目录");
    // 能力矩阵：同步路径上顺带探测只读方法（24h 缓存，无副作用）。
    void hostProbeCapabilities(client, { path: root }).catch?.(() => {});
    const files = await usageSyncCollectFilesViaAppServer(client, root);
    files.sort((left, right) => left.path.localeCompare(right.path));

    const stampIndex = options.stamps && typeof options.stamps === "object" ? options.stamps : null;
    const threads = new Map();
    const readErrors = [];
    const nextStamps = {};
    const observability = usageSyncEnsureObservability({});
    let parsedFiles = 0;
    let skippedFiles = 0;
    let lineErrors = 0;
    for (let index = 0; index < files.length; index += 1) {
      const item = files[index];
      if (typeof options.onProgress === "function") options.onProgress({ index: index + 1, total: files.length, path: item.path });
      try {
        const meta = await hostRequest(client, "fs/getMetadata", { path: item.absPath }, { priority: "background", source: "plugin_usage_sync" });
        const lastModified = UTIL.toCount(meta?.modifiedAtMs) || UTIL.toCount(meta?.modified_at_ms);
        const previous = stampIndex ? stampIndex[item.path] : null;
        if (previous && lastModified && previous.lastModified === lastModified) {
          skippedFiles += 1;
          nextStamps[item.path] = previous;
          continue;
        }
        const loaded = await hostRequest(client, "fs/readFile", { path: item.absPath }, { priority: "background", source: "plugin_usage_sync" });
        const bytes = usageSyncBase64ToBytes(loaded?.dataBase64);
        const text = usageSyncDecodeBytes(bytes);
        nextStamps[item.path] = { lastModified, size: bytes.length };
        const ingested = usageSyncIngestRolloutText(text, threads, observability);
        lineErrors += ingested.lineErrors;
        if (ingested.parsed) parsedFiles += 1;
      } catch (error) {
        readErrors.push(`${item.path}: ${(error && error.message) || error}`);
      }
    }
    return usageSyncFinalizeCollected(files, threads, { parsedFiles, skippedFiles, readErrors, lineErrors, nextStamps, observability });
  }

  async function usageSyncApplyCollected(collected, options = {}) {
    const auto = options.auto === true;
    if (!collected.scannedFiles) {
      state.usageSyncStatus = auto
        ? "未找到会话记录：请确认本机存在 .codex/sessions 目录"
        : "未找到会话记录：请选择 .codex 文件夹（通常位于用户主目录）";
      return;
    }
    if (options.dirHandle) {
      state.usageSyncDirHandle = options.dirHandle;
      void usageSyncStoreHandle(options.dirHandle);
    }
    if (!collected.rows.length) {
      if (collected.readErrors.length) {
        state.usageSyncStatus = `同步失败：${collected.readErrors.length} 个会话文件读取失败（${String(collected.readErrors[0]).slice(0, 120)}）`;
      } else {
        await usageSyncStoreFileStamps(collected.nextStamps);
        state.usageSyncResult = {
          imported: 0,
          deduped: 0,
          skipped: 0,
          files: collected.scannedFiles,
          skippedFiles: collected.skippedFiles,
          turns: 0,
          firstDay: "",
          lastDay: "",
          at: Date.now(),
        };
        state.usageSyncStatus = collected.skippedFiles
          ? `已是最新：${collected.skippedFiles} 个会话文件自上次同步后无变化`
          : "已是最新：没有新的会话记录";
        saveUsageSyncLastResult(state.usageSyncResult);
      }
      return;
    }
    const imported = importLocalUsageTurns(collected.rows, {
      replaceSource: USAGE_SYNC_SOURCE,
      idbOnly: true,
      dedupeAgainstLedger: true,
    });
    // 逐响应事实入库：按 response_id 幂等，这是本地唯一的用量事实源。
    // 必须 await：写入失败时若照样报「写入 N 轮」，用户看到的就是假的成功
    // （事实只在内存里，刷新即消失）。持久化失败在状态行与结果里都要留痕。
    const facts = Array.isArray(collected.facts) ? collected.facts : [];
    let factsWritten = 0;
    let factsPersisted = true;
    if (facts.length) {
      for (const fact of facts) usageFactUpsert(fact);
      factsPersisted = (await usageFactPersistResponses(facts)) !== false;
      if (factsPersisted) factsWritten = facts.length;
    }
    // rate_limits 单独入库，不参与用量求和。同样要等：失败时不能让下一次同步
    // 以为已经存过了。
    const rateLimits = Array.isArray(collected.rateLimits) ? collected.rateLimits : [];
    for (const item of rateLimits) {
      const key = `${item.threadId || ""}:${item.observedAtMs || 0}`;
      await usageFactPersistRateLimit({ key, threadId: item.threadId || "", observedAtMs: item.observedAtMs || 0, rateLimits: item.rateLimits });
    }
    if (facts.length) usageFactReconcileReport();
    // 降级 turn 记入覆盖率统计：有 record 的响应 /（有 record + 降级）响应。
    for (const row of collected.rows || []) {
      if (row.usageSource !== "token_count_fallback") continue;
      const turnId = UTIL.normalizeText(row.turnId, 240);
      if (!turnId) continue;
      state.usageFactFallbackTurns.set(turnId, UTIL.toCount(row.fallbackResponses) || UTIL.toCount(row.callCount));
      state.usageFactFallbackThreads.set(turnId, UTIL.normalizeText(row.threadKey, 240).replace(/^local:/, ""));
    }
    await usageSyncStoreFileStamps(collected.nextStamps);
    const observability = usageSyncEnsureObservability({ ...(collected.observability || {}) });
    const reconcile = usageFactReconcileSummary();
    state.usageSyncResult = {
      imported: imported.imported,
      deduped: imported.deduped,
      skipped: imported.skipped,
      facts: factsWritten,
      files: collected.scannedFiles,
      skippedFiles: collected.skippedFiles,
      turns: collected.rows.length,
      firstDay: collected.firstDay,
      lastDay: collected.lastDay,
      observability,
      coverage: reconcile.coverage,
      delta: reconcile.delta,
      factsPersisted,
      at: Date.now(),
    };
    const range = collected.firstDay ? ` · 覆盖 ${collected.firstDay} ~ ${collected.lastDay}` : "";
    const failures = collected.readErrors.length ? ` · ${collected.readErrors.length} 个文件读取失败` : "";
    // 事实没写进 IndexedDB 时必须显式说明：否则用户以为已经存下来了。
    const persistFailure = factsPersisted ? "" : " · 事实入库失败（仅内存，刷新后丢失）";
    // 可观测性（P2 #5）：解析行数 / 重复数 / 覆盖率 / 差异一次报清。
    const parseInfo = observability.lines
      ? ` · 解析 ${observability.lines} 行（响应 ${observability.records} · 心跳 ${observability.heartbeats} · 重复 ${observability.duplicateRecords + observability.duplicateHeartbeats}）`
      : "";
    const reconcileInfo = reconcile.threads ? ` · 覆盖率 ${reconcile.coverage}%${reconcile.delta ? ` · 差异 ${reconcile.delta} tokens` : ""}` : "";
    const prefix = auto ? "自动同步完成" : "同步完成";
    state.usageSyncStatus = `${prefix}：写入 ${imported.imported} 轮 · 去重 ${imported.deduped} · 跳过 ${imported.skipped}${range}${parseInfo}${reconcileInfo}${failures}${persistFailure}`;
    saveUsageSyncLastResult(state.usageSyncResult);
  }

  async function usageAutoSyncTick() {
    if (state.destroyed) return;
    if (state.usageSyncBusy || document.visibilityState === "hidden") {
      usageAutoSyncScheduleNext(60_000);
      return;
    }
    let outcome = null;
    try {
      outcome = await runUsageSync({ auto: true });
    } catch {
      outcome = null;
    }
    const status = String(outcome?.status || "");
    const ready = status.startsWith("自动同步完成") || status.startsWith("已是最新");
    const notReady = status.startsWith("自动同步暂不可用");
    state.usageSyncAutoAt = Date.now();
    state.usageSyncAutoFailures = ready ? 0 : state.usageSyncAutoFailures + 1;
    const delay =
      !ready && state.usageSyncAutoFailures >= 3
        ? USAGE_SYNC_AUTO_RETRY_INTERVAL_MS
        : notReady
          ? 2 * 60_000
          : USAGE_SYNC_AUTO_INTERVAL_MS;
    usageAutoSyncScheduleNext(delay);
  }

  function usageAutoSyncScheduleNext(delay = USAGE_SYNC_AUTO_INTERVAL_MS) {
    if (state.destroyed || window.__CODEX_LIVE_TOKEN_COST_TEST__) return;
    if (state.usageSyncAutoTimer) window.clearTimeout(state.usageSyncAutoTimer);
    state.usageSyncAutoTimer = trackTimer(
      window.setTimeout(() => {
        state.usageSyncAutoTimer = 0;
        void usageAutoSyncTick();
      }, delay),
    );
  }

  function scheduleUsageAutoSync() {
    if (state.usageSyncAutoTimer || state.destroyed || window.__CODEX_LIVE_TOKEN_COST_TEST__) return;
    if (!state.usageSyncAutoAt) {
      usageAutoSyncScheduleNext(USAGE_SYNC_AUTO_START_DELAY_MS);
      return;
    }
    usageAutoSyncScheduleNext();
  }

  async function runUsageSync(options = {}) {
    if (state.usageSyncBusy) return usageSyncTestState();
    state.usageSyncBusy = true;
    state.usageSyncStatus = options.auto ? "正在自动同步…" : "正在同步…";
    if (!options.auto) renderSettingsOverlay(liveSnapshot(), { animate: false });
    try {
      const stamps = options.stamps && typeof options.stamps === "object" ? options.stamps : await usageSyncLoadFileStamps();
      const requestedClient = options.dirHandle ? null : options.client || appServerSyncClient();
      const autoClient = isAppServerSyncClient(requestedClient) ? requestedClient : null;
      const autoRoot = autoClient ? UTIL.normalizeText(options.root, 600) || (await usageSyncResolveCodexRoot(autoClient)) : "";
      if (autoClient && autoRoot) {
        const collected = await usageSyncCollectRowsViaAppServer(autoClient, {
          root: autoRoot,
          stamps,
          onProgress: ({ index, total }) => {
            state.usageSyncStatus = `正在自动同步：读取会话文件 ${index}/${total}…`;
            if (!options.auto && (index === 1 || index === total || index % 8 === 0)) renderSettingsOverlay(liveSnapshot(), { animate: false });
          },
        });
        await usageSyncApplyCollected(collected, { auto: options.auto === true });
      } else if (options.auto) {
        state.usageSyncStatus = "自动同步暂不可用（未找到 Codex 本地通道）";
      } else {
        let dirHandle = options.dirHandle || (await usageSyncLoadStoredHandle());
        if (dirHandle && typeof dirHandle.queryPermission === "function") {
          let permission = "granted";
          try {
            permission = await dirHandle.queryPermission({ mode: "read" });
          } catch {
            permission = "granted";
          }
          if (permission !== "granted") {
            try {
              permission = await dirHandle.requestPermission({ mode: "read" });
            } catch {
              permission = "denied";
            }
          }
          if (permission !== "granted") dirHandle = null;
        }
        if (!dirHandle) {
          const picker = usageSyncDirectoryPicker();
          if (!picker) throw new Error("当前环境不支持读取本地会话目录");
          state.usageSyncStatus = "请选择本机 .codex 数据文件夹…";
          renderSettingsOverlay(liveSnapshot(), { animate: false });
          dirHandle = await picker({ id: USAGE_SYNC_PICKER_ID, mode: "read" });
        }
        const collected = await usageSyncCollectRows(dirHandle, {
          stamps,
          onProgress: ({ index, total }) => {
            state.usageSyncStatus = `正在同步：读取会话文件 ${index}/${total}…`;
            if (index === 1 || index === total || index % 8 === 0) renderSettingsOverlay(liveSnapshot(), { animate: false });
          },
        });
        await usageSyncApplyCollected(collected, { dirHandle });
      }
    } catch (error) {
      const name = (error && error.name) || "";
      if (name === "AbortError") state.usageSyncStatus = "已取消选择数据目录";
      else if (name === "NotFoundError") state.usageSyncStatus = "数据目录不可用（可能已移动），请重新点「立即同步」并选择 .codex 文件夹";
      else if (name === "NotAllowedError" || name === "SecurityError") state.usageSyncStatus = `目录访问被拒绝：${(error && error.message) || ""}`;
      else state.usageSyncStatus = `同步失败：${(error && error.message) || error}`;
    } finally {
      state.usageSyncBusy = false;
      renderSettingsOverlay(liveSnapshot(), { animate: false });
    }
    return usageSyncTestState();
  }

  function rememberDailyUsage(metric) {
    const usage = normalizeUsage(metric?.usage);
    if (!usage.exact) return;
    const key = metricUsageKey(metric);
    const now = Date.now();
    const ledger = loadDailyLedger();
    const turnId = UTIL.normalizeText(metric?.turnId, 120);
    const model = modelName();
    if (turnId) {
      const index = ledger.items.findIndex((item) => item.turnId === turnId);
      if (index >= 0) {
        ledger.items[index] = {
          ...ledger.items[index],
          key,
          turnId,
          usage,
          model,
          fastMode: typeof metric.fastMode === "boolean" ? metric.fastMode : ledger.items[index].fastMode,
          observedAt: now,
        };
        saveDailyLedger(ledger);
        return;
      }
    }
    if (ledger.items.some((item) => item.key === key && now - UTIL.toCount(item.observedAt) < 10000)) return;
    ledger.items.push({
      key,
      turnId,
      usage,
      model,
      fastMode: typeof metric.fastMode === "boolean" ? metric.fastMode : null,
      observedAt: now,
    });
    saveDailyLedger(ledger);
  }

  function todayCost(dailyUsage = null) {
    const localBucket = (dailyUsage || localDailyUsage()).get(todayKey());
    if (UTIL.toCount(localBucket?.tokens) > 0) return { value: Number(localBucket.cost) || 0, priced: localBucket?.priced !== false };
    const ledger = loadDailyLedger();
    return ledger.items.reduce(
      (sum, item) => {
        const cost = costForModelUsage(normalizeUsage(item.usage), item.model, { fastMode: item.fastMode === true });
        sum.value += cost.value;
        sum.priced = sum.priced && cost.priced;
        return sum;
      },
      { value: 0, priced: true },
    );
  }

  // ---------------------------------------------------------------------------
  // 模块 14：会话标识与运行时绑定
  // 从 URL / 载荷里抽取 session 标识，并把它绑到 runtime thread，避免跨会话串数据。
  // ---------------------------------------------------------------------------
  function isCodexApiUrl(url) {
    const text = String(url || "");
    return /\/(responses|chat\/completions|conversation|thread|api)\b/i.test(text) || /codex/i.test(text);
  }

  function isProfileUsageUrl(url) {
    // The transport layer reports "/wham/profiles/me", while the request client calls the relative
    // "/profiles/me". Accept both so the synthetic usage/identity payload is used on either path.
    return profileMeEndpoint(url) === "/profiles/me";
  }

  function isProfilePhotoUrl(url) {
    return profileMeEndpoint(url) === "/profiles/me/photo";
  }

  // The profile page client talks to the same host through a relative base ("/profiles/me/page"),
  // while the fetch layer sees the absolute "/wham/..." form. Normalize to the endpoint path so a
  // single predicate covers both transports without matching the plain usage endpoint.
  function profileMeEndpoint(url) {
    const path = String(url || "").split(/[?#]/)[0];
    const index = path.indexOf("/profiles/me");
    return index < 0 ? "" : path.slice(index);
  }

  function isProfilePageUrl(url) {
    return profileMeEndpoint(url) === "/profiles/me/page";
  }

  function isProfilePinOptionsUrl(url) {
    return profileMeEndpoint(url) === "/profiles/me/page/pin_options";
  }

  function isProfileAccountsCheckUrl(url) {
    const path = String(url || "").split(/[?#]/)[0];
    return /(?:^|\/)accounts\/check$/i.test(path);
  }

  // ---------------------------------------------------------------------------
  // 模块 15：会话识别 + profile 请求伪装
  // 从 composer DOM / rollout 目录识别当前会话键；profile 查询复用宿主通道。
  // ---------------------------------------------------------------------------
  function requestUrl(input) {
    if (typeof input === "string") return input;
    return input?.url || String(input || "");
  }

  function requestMethod(input, init) {
    return String(init?.method || input?.method || "GET").toUpperCase();
  }

  function extractSessionKeyFromUrl(value) {
    const text = UTIL.normalizeText(String(value || ""), 1000);
    if (!text) return "";
    try {
      const url = new URL(text, "app://-/");
      for (const key of ["threadId", "thread_id", "conversationId", "conversation_id", "sessionId", "session_id", "chatId", "chat_id"]) {
        const candidate = UTIL.normalizeText(url.searchParams.get(key), 240);
        if (candidate) return candidate;
      }
      const path = decodeURIComponent(url.pathname || "");
      const pathMatch = path.match(/\/(?:c|chat|chats|conversation|conversations|thread|threads|session|sessions)\/([^/?#]+)/i);
      if (pathMatch?.[1]) return UTIL.normalizeText(pathMatch[1], 240);
    } catch {
      // Fall through to regex parsing below.
    }
    const regexMatch = text.match(/[?&](?:threadId|thread_id|conversationId|conversation_id|sessionId|session_id|chatId|chat_id)=([^&#]+)/i);
    if (regexMatch?.[1]) return UTIL.normalizeText(decodeURIComponent(regexMatch[1]), 240);
    return "";
  }

  function emptySessionIdentity() {
    return { threadKey: "", conversationKey: "", runtimeSessionKey: "", turnId: "", requestId: "", streamId: "" };
  }

  function mergeSessionIdentity(left = {}, right = {}) {
    const merged = emptySessionIdentity();
    for (const field of ["threadKey", "conversationKey", "runtimeSessionKey", "turnId", "requestId", "streamId"]) {
      merged[field] = UTIL.normalizeText(left[field] || right[field], 240);
    }
    return merged;
  }

  function extractSessionIdentityFromUrl(value) {
    const text = String(value || "").trim();
    if (!text) return emptySessionIdentity();
    const identity = emptySessionIdentity();
    const assignQueryKey = (name, candidate) => {
      const key = UTIL.normalizeText(candidate, 240);
      if (!key) return;
      if (/thread/i.test(name)) identity.threadKey ||= key;
      else if (/conversation|chat/i.test(name)) identity.conversationKey ||= key;
      else if (/session/i.test(name)) identity.runtimeSessionKey ||= key;
    };
    try {
      const url = new URL(text, location?.href || "app://-/");
      for (const name of ["threadId", "thread_id", "conversationId", "conversation_id", "sessionId", "session_id", "chatId", "chat_id"]) {
        assignQueryKey(name, url.searchParams.get(name));
      }
      const path = decodeURIComponent(url.pathname || "");
      const pathMatch = path.match(/\/(thread|threads|conversation|conversations|chat|chats|session|sessions)\/([^/?#]+)/i);
      if (pathMatch?.[2]) {
        const kind = pathMatch[1].toLowerCase();
        const key = UTIL.normalizeText(pathMatch[2], 240);
        if (/^thread/.test(kind)) identity.threadKey ||= key;
        else if (/^conversation|^chat/.test(kind)) identity.conversationKey ||= key;
        else identity.runtimeSessionKey ||= key;
      }
    } catch {
      // Fall through to regex parsing below.
    }
    for (const match of text.matchAll(/[?&](threadId|thread_id|conversationId|conversation_id|sessionId|session_id|chatId|chat_id)=([^&#]+)/gi)) {
      try {
        assignQueryKey(match[1], decodeURIComponent(match[2]));
      } catch {
        assignQueryKey(match[1], match[2]);
      }
    }
    return identity;
  }

  function extractSessionIdentity(value, depth = 0, seen = new WeakSet()) {
    if (!value || depth > 8) return emptySessionIdentity();
    if (typeof value === "string") {
      const parsed = parseMaybeJson(value);
      return parsed ? extractSessionIdentity(parsed, depth + 1, seen) : extractSessionIdentityFromUrl(value);
    }
    if (Array.isArray(value)) {
      let identity = emptySessionIdentity();
      for (const item of value) identity = mergeSessionIdentity(identity, extractSessionIdentity(item, depth + 1, seen));
      return identity;
    }
    if (typeof value !== "object" || seen.has(value)) return emptySessionIdentity();
    seen.add(value);

    let identity = {
      threadKey: UTIL.normalizeText(
        value.threadId ?? value.thread_id ?? value.currentThreadId ?? value.current_thread_id ?? value.thread?.id ?? value.thread?.threadId ?? value.thread?.thread_id ?? value.turn?.threadId ?? value.turn?.thread_id,
        240,
      ),
      conversationKey: UTIL.normalizeText(
        value.conversationId ?? value.conversation_id ?? value.currentConversationId ?? value.current_conversation_id ?? value.chatId ?? value.chat_id ?? value.conversation?.id ?? value.turn?.conversationId ?? value.turn?.conversation_id,
        240,
      ),
      runtimeSessionKey: UTIL.normalizeText(
        value.sessionId ?? value.session_id ?? value.runtimeSessionId ?? value.runtime_session_id ?? value.session?.id ?? value.runtimeSession?.id ?? value.runtime_session?.id,
        240,
      ),
      turnId: UTIL.normalizeText(value.turnId ?? value.turn_id ?? value.turn?.id, 240),
      requestId: UTIL.normalizeText(value.requestId ?? value.request_id ?? value.request?.requestId ?? value.request?.request_id ?? value.request?.id, 240),
      streamId: UTIL.normalizeText(value.streamId ?? value.stream_id ?? value.stream?.id ?? value.response?.streamId ?? value.response?.stream_id, 240),
    };
    for (const key of [
      "url",
      "href",
      "request",
      "params",
      "data",
      "payload",
      "message",
      "thread",
      "conversation",
      "session",
      "runtimeSession",
      "runtime_session",
      "turn",
      "stream",
      "body",
      "bodyJsonString",
      "result",
      "response",
    ]) {
      if (key in value) identity = mergeSessionIdentity(identity, extractSessionIdentity(value[key], depth + 1, seen));
    }
    return identity;
  }

  function extractSessionInfo(value) {
    const identity = extractSessionIdentity(value);
    return identity.threadKey || identity.conversationKey || identity.runtimeSessionKey;
  }

  function sessionIdentityHasSessionReference(identity) {
    return Boolean(identity?.threadKey || identity?.conversationKey || identity?.runtimeSessionKey);
  }

  function sessionIdentityCorrelationFields(identity) {
    return ["turnId", "requestId", "streamId"].filter((field) => Boolean(UTIL.normalizeText(identity?.[field], 240)));
  }

  function pruneRuntimeSessionBindings(now = Date.now()) {
    for (const [key, binding] of state.runtimeSessionBindings.entries()) {
      if (!binding?.expiresAt || binding.expiresAt <= now) state.runtimeSessionBindings.delete(key);
    }
  }

  function runtimeSessionBindingKey(identity) {
    return JSON.stringify([
      UTIL.normalizeText(identity?.runtimeSessionKey, 240),
      UTIL.normalizeText(identity?.turnId, 240),
      UTIL.normalizeText(identity?.requestId, 240),
      UTIL.normalizeText(identity?.streamId, 240),
    ]);
  }

  function bindRuntimeSessionToThread(identity, threadKey, now = Date.now()) {
    const runtimeSessionKey = UTIL.normalizeText(identity?.runtimeSessionKey, 240);
    const resolvedThreadKey = UTIL.normalizeText(threadKey, 240);
    if (!runtimeSessionKey || !resolvedThreadKey || !sessionIdentityCorrelationFields(identity).length) return false;
    pruneRuntimeSessionBindings(now);
    const key = runtimeSessionBindingKey(identity);
    const previous = state.runtimeSessionBindings.get(key);
    if (previous?.ambiguous || (previous?.threadKey && !sameSessionKey(previous.threadKey, resolvedThreadKey))) {
      state.runtimeSessionBindings.set(key, {
        ...previous,
        runtimeSessionKey,
        threadKey: previous.threadKey || resolvedThreadKey,
        ambiguous: true,
        observedAt: now,
        expiresAt: now + RUNTIME_SESSION_BINDING_TTL_MS,
      });
      return false;
    }
    state.runtimeSessionBindings.set(key, {
      runtimeSessionKey,
      threadKey: resolvedThreadKey,
      turnId: UTIL.normalizeText(identity.turnId, 240),
      requestId: UTIL.normalizeText(identity.requestId, 240),
      streamId: UTIL.normalizeText(identity.streamId, 240),
      ambiguous: false,
      observedAt: now,
      expiresAt: now + RUNTIME_SESSION_BINDING_TTL_MS,
    });
    return true;
  }

  function resolveRuntimeSessionBinding(identity, now = Date.now()) {
    const runtimeSessionKey = UTIL.normalizeText(identity?.runtimeSessionKey, 240);
    const correlationFields = sessionIdentityCorrelationFields(identity);
    if (!runtimeSessionKey || !correlationFields.length) return "";
    pruneRuntimeSessionBindings(now);
    const matches = [];
    for (const binding of state.runtimeSessionBindings.values()) {
      if (binding?.ambiguous || UTIL.normalizeText(binding?.runtimeSessionKey, 240) !== runtimeSessionKey) continue;
      if (!correlationFields.every((field) => UTIL.normalizeText(binding?.[field], 240) === UTIL.normalizeText(identity?.[field], 240))) continue;
      matches.push(binding);
    }
    const threadKeys = [...new Set(matches.map((binding) => UTIL.normalizeText(binding.threadKey, 240)).filter(Boolean))];
    return threadKeys.length === 1 ? threadKeys[0] : "";
  }

  function resolveSessionIdentity(valueOrIdentity) {
    const identity = valueOrIdentity && typeof valueOrIdentity === "object" && !Array.isArray(valueOrIdentity) && "threadKey" in valueOrIdentity ? valueOrIdentity : extractSessionIdentity(valueOrIdentity);
    const directKey = resolveSessionKey(identity.threadKey || identity.conversationKey);
    if (directKey) {
      const key = localStateSessionKey(directKey);
      if (identity.runtimeSessionKey) bindRuntimeSessionToThread(identity, key);
      return { identity, sessionKey: key, reliable: true, unresolved: false };
    }
    const boundKey = resolveRuntimeSessionBinding(identity);
    if (boundKey) return { identity, sessionKey: localStateSessionKey(boundKey), reliable: true, unresolved: false };
    return { identity, sessionKey: "", reliable: false, unresolved: Boolean(identity.runtimeSessionKey) };
  }

  function observeSessionInfo(value) {
    const resolved = resolveSessionIdentity(value);
    let key = resolved.sessionKey;
    if (!key) return false;
    const activeKey = activeSidebarThreadKey();
    if (rememberSessionAlias(activeKey, key)) key = resolveSessionKey(key);
    state.detectedSessionKey = key;
    state.detectedSessionKeyAt = Date.now();
    state.newConversationSessionKey = "";
    state.newConversationSessionKeyAt = 0;
    invalidateSessionKeyCache();
    refreshCodexppHistory({ sessionId: key });
    syncActiveLocalCurrentTurn();
    syncActiveTurnShimmerState();
    return true;
  }

  function shouldPersistUsagePayload(payload, source) {
    const text = String(source || "");
    if (/body|websocket/i.test(text)) return false;
    if (/^(fetch|xhr)$/i.test(text)) return true;
    if (/message/i.test(text)) {
      const status = UTIL.toCount(payload?.status);
      return payload?.type === "fetch-response" && (!status || (status >= 200 && status < 300));
    }
    return true;
  }

  function isTokenCountPayload(payload, depth = 0) {
    if (!payload || depth > 2) return false;
    if (typeof payload === "string") {
      try {
        return isTokenCountPayload(JSON.parse(payload), depth + 1);
      } catch {
        return false;
      }
    }
    if (typeof payload !== "object") return false;
    const item = payload?.payload?.type === "token_count" ? payload.payload : payload;
    return item?.type === "token_count" && item.info && typeof item.info === "object";
  }

  function isTaskCompletePayload(payload, depth = 0, seen = new WeakSet()) {
    if (!payload || depth > 8) return false;
    if (typeof payload === "string") {
      try {
        return isTaskCompletePayload(JSON.parse(payload), depth + 1, seen);
      } catch {
        for (const fragment of extractJsonFragmentsFromSse(payload)) {
          try {
            if (isTaskCompletePayload(JSON.parse(fragment), depth + 1, seen)) return true;
          } catch {
            // Ignore malformed stream fragments.
          }
        }
        return false;
      }
    }
    if (Array.isArray(payload)) return payload.some((item) => isTaskCompletePayload(item, depth + 1, seen));
    if (typeof payload !== "object" || seen.has(payload)) return false;
    seen.add(payload);
    if (payload.type === "task_complete" || payload.event === "task_complete") return true;
    if (payload.method === "turn/completed") {
      const status = UTIL.normalizeText(payload.params?.turn?.status || payload.params?.status, 40);
      if (!status || status === "completed") return true;
    }
    for (const key of ["payload", "data", "body", "message", "result", "params", "bodyJsonString"]) {
      if (key in payload && isTaskCompletePayload(payload[key], depth + 1, seen)) return true;
    }
    return false;
  }

  function normalizeOfficialRuntimeStatus(value) {
    const raw = UTIL.normalizeText(value?.type ?? value?.status ?? value?.state ?? value, 80).toLowerCase().replace(/[\s-]+/g, "_");
    if (!raw) return "";
    if (["active", "running", "in_progress", "inprogress", "resuming", "working"].includes(raw)) return "running";
    if (["idle", "complete", "completed", "failed", "interrupted", "stopped", "cancelled", "canceled", "aborted", "error"].includes(raw)) return "idle";
    return "";
  }

  function officialRuntimeTimingFromPayload(payload) {
    const candidates = [
      payload?.params?.turn,
      payload?.turn,
      payload?.mcpTurn,
      payload?.params?.mcpTurn,
      payload?.payload?.turn,
      payload?.data?.turn,
      payload?.params,
      payload,
    ].filter((item) => item && typeof item === "object");
    const pick = (...keys) => {
      for (const item of candidates) {
        for (const key of keys) {
          if (key in item) return item[key];
        }
      }
      return undefined;
    };
    const startedAtMs = UTIL.firstTimestampMs(
      pick("turnStartedAtMs", "turn_started_at_ms"),
      pick("startedAtMs", "started_at_ms", "startedAt", "started_at", "startTime", "start_time", "createdAt", "created_at"),
    );
    const workStartedAtMs = UTIL.firstTimestampMs(pick("firstTurnWorkItemStartedAtMs", "first_turn_work_item_started_at_ms", "workedStartedAtMs", "worked_started_at_ms"));
    let completedAtMs = UTIL.firstTimestampMs(
      pick("completedAtMs", "completed_at_ms", "finishedAtMs", "finished_at_ms", "completedAt", "completed_at", "finishedAt", "finished_at", "endTime", "end_time"),
      pick("finalAssistantStartedAtMs", "final_assistant_started_at_ms"),
    );
    let durationMs = normalizedDurationMs({
      durationMs: pick("durationMs", "duration_ms", "elapsedMs", "elapsed_ms"),
      durationSec: pick("durationSec", "duration_sec", "elapsedSec", "elapsed_sec"),
    });
    if (!durationMs && startedAtMs && completedAtMs >= startedAtMs) durationMs = completedAtMs - startedAtMs;
    if (!completedAtMs && startedAtMs && durationMs) completedAtMs = startedAtMs + durationMs;
    return {
      ...(startedAtMs ? { startedAtMs } : {}),
      ...(workStartedAtMs ? { workStartedAtMs } : {}),
      ...(completedAtMs ? { completedAtMs } : {}),
      ...(durationMs ? { durationMs } : {}),
    };
  }

  function officialRuntimeSignalFromPayload(payload, depth = 0, seen = new WeakSet()) {
    if (!payload || depth > 8) return null;
    if (typeof payload === "string") {
      try {
        return officialRuntimeSignalFromPayload(JSON.parse(payload), depth + 1, seen);
      } catch {
        for (const fragment of extractJsonFragmentsFromSse(payload)) {
          try {
            const found = officialRuntimeSignalFromPayload(JSON.parse(fragment), depth + 1, seen);
            if (found) return found;
          } catch {
            // Ignore malformed stream fragments.
          }
        }
        return null;
      }
    }
    if (Array.isArray(payload)) {
      for (const item of payload) {
        const found = officialRuntimeSignalFromPayload(item, depth + 1, seen);
        if (found) return found;
      }
      return null;
    }
    if (typeof payload !== "object" || seen.has(payload)) return null;
    seen.add(payload);

    const method = UTIL.normalizeText(payload.method, 160);
    const type = UTIL.normalizeText(payload.type, 160);
    const event = UTIL.normalizeText(payload.event, 160);
    const descriptor = UTIL.normalizeText(method || event || type, 160).toLowerCase().replace(/[\s-]+/g, "_");
    const identity = extractSessionIdentity(payload);
    const sessionKey = resolveSessionIdentity(identity).sessionKey;
    const turnId = UTIL.normalizeText(identity.turnId, 120);
    const timing = officialRuntimeTimingFromPayload(payload);

    if (method === "turn/started" || descriptor === "turn_started" || descriptor === "codex/event/task_started") {
      return { sessionKey, turnId, running: true, status: "running", reason: method || event || type, ...timing };
    }
    if (
      method === "turn/completed" ||
      descriptor === "turn_completed" ||
      descriptor === "codex/event/task_complete" ||
      descriptor === "codex/event/turn_aborted" ||
      type === "task_complete" ||
      event === "task_complete"
    ) {
      const status = UTIL.normalizeText(payload.params?.turn?.status || payload.params?.status || payload.turn?.status || payload.status || "completed", 80);
      return { sessionKey, turnId, running: false, status: status || "completed", reason: method || event || type, ...timing };
    }
    if (method === "thread/status/changed") {
      const statusValue = payload.params?.status ?? payload.status;
      const status = normalizeOfficialRuntimeStatus(statusValue);
      if (status) return { sessionKey, turnId, running: status === "running", status, reason: method, ...timing };
    }

    for (const key of ["payload", "data", "body", "message", "result", "params", "bodyJsonString"]) {
      if (key in payload) {
        const found = officialRuntimeSignalFromPayload(payload[key], depth + 1, seen);
        if (found) return found;
      }
    }
    return null;
  }

  function applyOfficialTurnTiming(turn, details = {}) {
    if (!turn || typeof turn !== "object") return turn;
    const turnId = UTIL.normalizeText(details.turnId, 120);
    if (turnId) turn.id = turnId;
    const timing = officialRuntimeTimingFromPayload(details);
    const startedAt = UTIL.toTimestampMs(timing.startedAtMs || details.startedAtMs || details.startedAt);
    if (startedAt) turn.startedAt = startedAt;
    const previous = turn.officialTiming && typeof turn.officialTiming === "object" ? turn.officialTiming : {};
    turn.officialTiming = {
      ...previous,
      ...timing,
      ...(startedAt ? { startedAtMs: startedAt } : {}),
    };
    return turn;
  }

  function pruneOfficialThreadRuntimeStates(now = Date.now()) {
    for (const [key, item] of state.officialThreadRuntimeStates.entries()) {
      if (!item?.observedAt || now - item.observedAt > OFFICIAL_RUNTIME_STATE_TTL_MS) state.officialThreadRuntimeStates.delete(key);
    }
    // running 浮光只是装饰性状态，不能比官方运行时状态活得更久；否则完成事件丢失后
    // 会永远每 4 秒闪一次。
    for (const [key, item] of state.turnShimmerSessions.entries()) {
      if (!item?.running) continue;
      const officialRunning = Array.from(state.officialThreadRuntimeStates.entries()).some(([candidateKey, entry]) => entry?.running && sameSessionKey(candidateKey, key));
      if (officialRunning) continue;
      if (!item.startedAt || now - UTIL.toCount(item.startedAt) > OFFICIAL_RUNTIME_STATE_TTL_MS) {
        state.turnShimmerSessions.set(key, { ...item, running: false, outputStartedAt: now });
      }
    }
  }

  function officialRuntimeRunningCount() {
    pruneOfficialThreadRuntimeStates();
    const running = new Set();
    for (const [sessionKey, item] of state.officialThreadRuntimeStates.entries()) {
      if (!item?.running) continue;
      running.add(localStateSessionKey(sessionKey).replace(/^local:/, ""));
    }
    return running.size;
  }

  function turnCompletionMatchesCurrent(sessionKey, turnId, options = {}) {
    const current = localCurrentTurn(sessionKey);
    if (!current) return true;
    const expectedTurnId = UTIL.normalizeText(current.id, 120);
    const completedTurnId = UTIL.normalizeText(turnId, 120);
    if (!completedTurnId && options.allowTurnless) return true;
    return Boolean(completedTurnId && expectedTurnId && completedTurnId === expectedTurnId);
  }

  function setOfficialThreadRuntime(sessionKey, running, details = {}) {
    pruneOfficialThreadRuntimeStates();
    const resolvedSessionKey = resolveSessionKey(sessionKey) || sessionKey;
    if (!resolvedSessionKey) return false;
    const key = localStateSessionKey(resolvedSessionKey);
    if (!key) return false;
    const previous = state.officialThreadRuntimeStates.get(key);
    const turnId = UTIL.normalizeText(details.turnId, 120);
    if (!running) {
      const allowTurnlessCompletion = details.reason === "thread/status/changed" && !previous?.turnId;
      if (previous?.turnId && turnId && previous.turnId !== turnId) return false;
      if (!turnCompletionMatchesCurrent(key, turnId, { allowTurnless: allowTurnlessCompletion })) return false;
    }
    const status = UTIL.normalizeText(details.status, 80) || (running ? "running" : "idle");
    const reason = UTIL.normalizeText(details.reason, 120);
    const changed = !previous || previous.running !== Boolean(running) || previous.turnId !== turnId || previous.status !== status;
    const timing = officialRuntimeTimingFromPayload(details);
    state.officialThreadRuntimeStates.set(key, { running: Boolean(running), turnId, status, reason, observedAt: Date.now(), ...timing });
    if (running) {
      applyOfficialTurnTiming(
        beginLocalTurn({ sessionKey: key, turnId, startedAt: timing.startedAtMs, profileThreadKey: key, threadAttributionStatus: "reliable" }),
        { turnId, ...timing },
      );
      startTurnShimmer({ sessionKey: key });
    } else {
      clearLocalTurnTimer(key);
      if (localCurrentTurn(key)) {
        applyOfficialTurnTiming(localCurrentTurn(key), { turnId, ...timing });
        persistLocalCurrentTurn("complete", key, { durationStatus: "completed", completedAt: timing.completedAtMs });
        setLocalCurrentTurn(null, key);
      }
      stopTurnShimmer({ finishActive: true, sessionKey: key });
    }
    if (changed) scheduleRender(0);
    return changed;
  }

  function observeOfficialRuntimePayload(payload, source) {
    void source;
    const signal = officialRuntimeSignalFromPayload(payload);
    if (!signal) return false;
    const sessionKey = resolveSessionKey(signal.sessionKey) || signal.sessionKey;
    if (!sessionKey) return false;
    return setOfficialThreadRuntime(sessionKey, signal.running, signal);
  }

  function isGenericTaskCompletePayload(payload, depth = 0, seen = new WeakSet()) {
    if (!payload || depth > 8) return false;
    if (typeof payload === "string") {
      try {
        return isGenericTaskCompletePayload(JSON.parse(payload), depth + 1, seen);
      } catch {
        for (const fragment of extractJsonFragmentsFromSse(payload)) {
          try {
            if (isGenericTaskCompletePayload(JSON.parse(fragment), depth + 1, seen)) return true;
          } catch {
            // Ignore malformed stream fragments.
          }
        }
        return false;
      }
    }
    if (Array.isArray(payload)) return payload.some((item) => isGenericTaskCompletePayload(item, depth + 1, seen));
    if (typeof payload !== "object" || seen.has(payload)) return false;
    seen.add(payload);
    if (payload.type === "task_complete" || payload.event === "task_complete") return true;
    for (const key of ["payload", "data", "body", "message", "result", "params", "bodyJsonString"]) {
      if (key in payload && isGenericTaskCompletePayload(payload[key], depth + 1, seen)) return true;
    }
    return false;
  }

  function isOfficialThreadRunning(sessionKey = currentSessionKey()) {
    pruneOfficialThreadRuntimeStates();
    const key = localStateSessionKey(resolveSessionKey(sessionKey) || sessionKey);
    let stateForKey = state.officialThreadRuntimeStates.get(key) || null;
    for (const [runtimeKey, item] of state.officialThreadRuntimeStates.entries()) {
      if (!sameSessionKey(runtimeKey, key)) continue;
      if (!stateForKey || UTIL.toCount(item?.observedAt) >= UTIL.toCount(stateForKey?.observedAt)) stateForKey = item;
    }
    return Boolean(stateForKey?.running);
  }

  function uniqueOfficialRunningSessionKey() {
    pruneOfficialThreadRuntimeStates();
    const running = [];
    const seen = new Set();
    for (const [sessionKey, item] of state.officialThreadRuntimeStates.entries()) {
      if (!item?.running) continue;
      const key = localStateSessionKey(sessionKey);
      const comparable = key.replace(/^local:/, "");
      if (seen.has(comparable)) continue;
      seen.add(comparable);
      running.push(key);
    }
    return running.length === 1 ? running[0] : "";
  }

  function sessionlessTaskCompleteSessionKey(turnId) {
    const completedTurnId = UTIL.normalizeText(turnId, 120);
    if (!completedTurnId) return "";
    const currentTurns = [];
    const seenTurns = new Set();
    for (const [candidateKey, turn] of state.localCurrentTurns.entries()) {
      if (!turn || seenTurns.has(turn)) continue;
      seenTurns.add(turn);
      currentTurns.push({ key: localStateSessionKey(candidateKey), turn });
    }
    if (currentTurns.length !== 1) return "";
    const candidate = currentTurns[0];
    return UTIL.normalizeText(candidate.turn.id, 120) === completedTurnId ? candidate.key : "";
  }

  function sessionlessUsageRuntimeSessionKey(payload) {
    if (sessionIdentityHasSessionReference(extractSessionIdentity(payload))) return "";
    if (!isTokenCountPayload(payload) && collectUsages(payload).length <= 0) return "";
    return uniqueOfficialRunningSessionKey();
  }

  function extractJsonFragmentsFromSse(text) {
    return String(text || "")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trim())
      .filter((line) => line && line !== "[DONE]");
  }

  function collectUsages(value, depth = 0, out = [], seen = new WeakSet()) {
    if (!value || depth > 8) return out;
    if (typeof value === "string") {
      try {
        collectUsages(JSON.parse(value), depth + 1, out, seen);
      } catch {
        for (const fragment of extractJsonFragmentsFromSse(value)) {
          try {
            collectUsages(JSON.parse(fragment), depth + 1, out, seen);
          } catch {
            // Ignore malformed stream fragments.
          }
        }
      }
      return out;
    }
    if (Array.isArray(value)) {
      value.forEach((item) => collectUsages(item, depth + 1, out, seen));
      return out;
    }
    if (typeof value !== "object" || seen.has(value)) return out;
    seen.add(value);

    for (const key of ["usage", "last", "lastUsage", "last_usage", "lastTokenUsage", "last_token_usage"]) {
      const usage = normalizeUsage(value[key]);
      if (usage.exact) out.push(usage);
    }
    const self = normalizeUsage(value);
    if (self.exact) {
      out.push(self);
      return out;
    }
    for (const key of [
      "response",
      "payload",
      "info",
      "data",
      "body",
      "bodyJsonString",
      "body_json_string",
      "bodyText",
      "body_text",
      "responseText",
      "response_text",
      "message",
      "result",
      "event",
      "params",
      "tokenUsage",
      "token_usage",
      "contextUsage",
      "context_usage",
      "response_metadata",
    ]) {
      collectUsages(value[key], depth + 1, out, seen);
    }
    return out;
  }

  function sourceMayContainAssistantResult(source) {
    return !/body/i.test(String(source || ""));
  }

  function textLooksBlockedForResult(text) {
    return /\b(reasoning|thinking|thought|analysis|tool|function|command|usage|context|status|progress|heartbeat|ping)\b/i.test(String(text || ""));
  }

  function textLooksLikeResultCarrier(text) {
    return /\b(output_text|output\.text|content|message|assistant_message|text_delta|content_delta|final_answer|answer)\b/i.test(String(text || ""));
  }

  function hasAssistantResultOutputStarted(value, source = "", depth = 0, seen = new WeakSet(), context = {}) {
    if (!sourceMayContainAssistantResult(source) || !value || depth > 8) return false;
    if (typeof value === "string") {
      try {
        return hasAssistantResultOutputStarted(JSON.parse(value), source, depth + 1, seen, context);
      } catch {
        for (const fragment of extractJsonFragmentsFromSse(value)) {
          try {
            if (hasAssistantResultOutputStarted(JSON.parse(fragment), source, depth + 1, seen, context)) return true;
          } catch {
            // Ignore malformed stream fragments.
          }
        }
        return false;
      }
    }
    if (Array.isArray(value)) {
      return value.some((item) => hasAssistantResultOutputStarted(item, source, depth + 1, seen, context));
    }
    if (typeof value !== "object" || seen.has(value)) return false;
    seen.add(value);

    const descriptor = UTIL.normalizeText(
      [
        value.type,
        value.event,
        value.name,
        value.kind,
        value.role,
        value.author?.role,
        value.message?.role,
        value.delta?.role,
      ]
        .filter(Boolean)
        .join(" "),
      400,
    ).toLowerCase();
    const blocked = Boolean(context.blocked || textLooksBlockedForResult(descriptor) || (/\b(user|system)\b/i.test(descriptor) && !/\bassistant\b/i.test(descriptor)));
    const assistant = Boolean(context.assistant || /\bassistant\b/i.test(descriptor));
    const resultCarrier = Boolean(context.resultCarrier || textLooksLikeResultCarrier(descriptor));
    const directTextKeys = ["delta", "text", "content", "output_text", "outputText", "markdown", "value"];

    if ((assistant || resultCarrier) && !blocked) {
      for (const key of directTextKeys) {
        if (typeof value[key] === "string" && UTIL.normalizeText(value[key], 2000)) return true;
      }
    }

    for (const [key, child] of Object.entries(value)) {
      const keyText = String(key || "");
      const nextContext = {
        assistant,
        resultCarrier: resultCarrier || /^(output|outputs|message|messages|content|delta|response|result)$/i.test(keyText),
        blocked: blocked || textLooksBlockedForResult(keyText),
      };
      if (hasAssistantResultOutputStarted(child, source, depth + 1, seen, nextContext)) return true;
    }
    return false;
  }

  function parseMaybeJson(value) {
    if (!value) return null;
    if (typeof value === "object") return value;
    if (typeof value !== "string") return null;
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  }

  function isComposerDraftPayload(value, depth = 0, seen = new WeakSet()) {
    if (!value || depth > 5) return false;
    if (typeof value === "string") {
      const parsed = parseMaybeJson(value);
      return parsed ? isComposerDraftPayload(parsed, depth + 1, seen) : false;
    }
    if (Array.isArray(value)) return value.some((item) => isComposerDraftPayload(item, depth + 1, seen));
    if (typeof value !== "object" || seen.has(value)) return false;
    seen.add(value);
    const type = UTIL.normalizeText(value.type, 120);
    const key = UTIL.normalizeText(value.key, 160);
    if (type === "persisted-atom-updated" && /^composer-prompt-drafts-v\d+$/i.test(key)) return true;
    return ["payload", "message", "data", "body"].some((field) => isComposerDraftPayload(value[field], depth + 1, seen));
  }

  function isBackgroundCodexPayload(value, depth = 0, seen = new WeakSet()) {
    if (!value || depth > 4) return false;
    if (typeof value === "string") {
      const parsed = parseMaybeJson(value);
      return parsed ? isBackgroundCodexPayload(parsed, depth + 1, seen) : false;
    }
    if (Array.isArray(value)) return value.some((item) => isBackgroundCodexPayload(item, depth + 1, seen));
    if (typeof value !== "object" || seen.has(value)) return false;
    seen.add(value);
    const descriptor = [
      value.type,
      value.action,
      value.method,
      value.name,
      value.operation,
      value.op,
      value.key,
      value.url,
      value.path,
      value.endpoint,
    ]
      .map((item) => UTIL.normalizeText(item, 160).toLowerCase())
      .filter(Boolean)
      .join(" ");
    if (/(composer-prompt-drafts|draft|title|summary|summariz|profile|sentry|telemetry)/i.test(descriptor)) return true;
    return ["request", "params", "data", "payload", "message", "body"].some((field) => isBackgroundCodexPayload(value[field], depth + 1, seen));
  }

  function hasUserTurnContent(value) {
    if (!value || typeof value !== "object") return false;
    for (const key of ["input", "prompt", "messages", "message", "user_message", "userMessage", "userInput", "content", "items"]) {
      if (!Object.hasOwn(value, key)) continue;
      const item = value[key];
      if (Array.isArray(item) ? item.length > 0 : item != null && item !== "") return true;
    }
    return false;
  }

  function shouldStartTurnFromRequestPayload(value, depth = 0, seen = new WeakSet()) {
    if (!value || depth > 6) return false;
    if (isComposerDraftPayload(value) || isBackgroundCodexPayload(value)) return false;
    if (typeof value === "string") {
      const parsed = parseMaybeJson(value);
      return parsed ? shouldStartTurnFromRequestPayload(parsed, depth + 1, seen) : false;
    }
    if (Array.isArray(value)) return value.some((item) => shouldStartTurnFromRequestPayload(item, depth + 1, seen));
    if (typeof value !== "object" || seen.has(value)) return false;
    seen.add(value);

    const type = UTIL.normalizeText(value.type ?? value.event ?? value.action ?? value.method, 160).toLowerCase().replace(/[\s-]+/g, "_");
    if (/(^|_)(user_message|submit_message|send_message|create_turn|start_turn|turn_start|conversation_turn|codex_turn)(_|$)/i.test(type)) return true;
    if (hasUserTurnContent(value) && (extractSessionInfo(value) || extractModelInfo(value).model || extractFastMode(value) !== null)) return true;

    for (const key of ["request", "params", "data", "payload", "message", "turn", "body", "bodyJsonString"]) {
      if (shouldStartTurnFromRequestPayload(value[key], depth + 1, seen)) return true;
    }
    return false;
  }

  function extractModelInfo(value, depth = 0, seen = new WeakSet()) {
    if (!value || depth > 7) return { model: "", effort: "" };
    if (typeof value === "string") {
      const parsed = extractModelInfo(parseMaybeJson(value), depth + 1, seen);
      return parsed.model || parsed.effort ? parsed : { model: "", effort: "" };
    }
    if (Array.isArray(value)) {
      for (const item of value) {
        const info = extractModelInfo(item, depth + 1, seen);
        if (info.model || info.effort) return info;
      }
      return { model: "", effort: "" };
    }
    if (typeof value !== "object" || seen.has(value)) return { model: "", effort: "" };
    seen.add(value);

    const body = parseMaybeJson(value.body);
    if (body && body !== value) {
      const info = extractModelInfo(body, depth + 1, seen);
      if (info.model || info.effort) return info;
    }

    const model = UTIL.normalizeText(
      value.model ??
        value.modelId ??
        value.model_id ??
        value.toModel ??
        value.threadSettings?.model ??
        value.settings?.model ??
        value.collaborationMode?.settings?.model ??
        value.params?.model ??
        value.params?.threadSettings?.model ??
        value.params?.settings?.model ??
        value.params?.collaborationMode?.settings?.model ??
        value.request?.params?.model ??
        value.body?.model,
    );
    const effort = UTIL.normalizeText(
      value.reasoning_effort ??
        value.reasoningEffort ??
        value.effort ??
        value.thinking?.type ??
        value.threadSettings?.reasoning_effort ??
        value.threadSettings?.effort ??
        value.settings?.reasoning_effort ??
        value.settings?.effort ??
        value.params?.reasoning_effort ??
        value.params?.effort ??
        value.params?.threadSettings?.effort ??
        value.request?.params?.reasoning_effort ??
        value.request?.params?.effort,
      60,
    );
    if (model || effort) return { model, effort };

    for (const key of ["request", "params", "data", "payload", "message", "threadSettings", "settings", "collaborationMode"]) {
      const info = extractModelInfo(value[key], depth + 1, seen);
      if (info.model || info.effort) return info;
    }
    return { model: "", effort: "" };
  }

  function todayUsage(dailyUsage = null) {
    const localBucket = (dailyUsage || localDailyUsage()).get(todayKey());
    if (UTIL.toCount(localBucket?.tokens) > 0) {
      const merged = mergeCodexppHistoryTurns(
        [{
          turnId: `today-local:${todayKey()}`,
          model: UNKNOWN_MODEL,
          createdAt: new Date().toISOString(),
          observedAt: Date.now(),
          usage: { input: UTIL.toCount(localBucket.input), output: UTIL.toCount(localBucket.output), cached: UTIL.toCount(localBucket.cached), total: UTIL.toCount(localBucket.tokens), exact: true },
          callCount: UTIL.toCount(localBucket.requests) || 1,
        }],
      );
      const total = merged.reduce((sum, turn) => addUsage(sum, normalizeUsage(turn.usage)), { input: 0, output: 0, cached: 0, total: 0, exact: true });
      return { input: UTIL.toCount(total.input), output: UTIL.toCount(total.output), cached: UTIL.toCount(total.cached), total: UTIL.toCount(total.total), exact: true };
    }
    const ledger = loadDailyLedger();
    const merged = mergeCodexppHistoryTurns(
      ledger.items.map((item, index) => ({
        turnId: item.turnId || `today-ledger:${index}`,
        model: item.model,
        createdAt: new Date(UTIL.toCount(item.observedAt) || Date.now()).toISOString(),
        observedAt: UTIL.toCount(item.observedAt) || Date.now(),
        usage: normalizeUsage(item.usage),
        callCount: 1,
      })),
    );
    return merged.reduce((sum, turn) => addUsage(sum, normalizeUsage(turn.usage)), { input: 0, output: 0, cached: 0, total: 0, exact: true });
  }

  // ---------------------------------------------------------------------------
  // 模块 16：运行时观测（模型信息 / shimmer / 调用统计）
  // 模型信息观测、输出速率、shimmer 动画、profile 调用统计都在这一段。
  // ---------------------------------------------------------------------------
  function normalizeReasoningEffort(value) {
    const text = UTIL.normalizeText(String(value ?? ""), 60).toLowerCase().replace(/[\s-]+/g, "_");
    if (!text) return "";
    if (text === "extra_high" || text === "extra" || text === "very_high") return "xhigh";
    if (text === "maximum") return "max";
    if (["none", "minimal", "low", "medium", "high", "xhigh", "max", "ultra"].includes(text)) return text;
    return text.slice(0, 60);
  }

  function extractFastMode(value, depth = 0, seen = new WeakSet()) {
    if (!value || depth > 7) return null;
    if (typeof value === "string") {
      const parsed = parseMaybeJson(value);
      if (parsed) return extractFastMode(parsed, depth + 1, seen);
      return null;
    }
    if (Array.isArray(value)) {
      for (const item of value) {
        const detected = extractFastMode(item, depth + 1, seen);
        if (detected !== null) return detected;
      }
      return null;
    }
    if (typeof value !== "object" || seen.has(value)) return null;
    seen.add(value);

    for (const key of ["fast_mode", "fastMode", "isFastMode", "useFastMode"]) {
      if (typeof value[key] === "boolean") return value[key];
    }
    for (const key of ["serviceTier", "service_tier", "speedTier", "speed_tier"]) {
      if (!Object.hasOwn(value, key)) continue;
      const raw = value[key];
      if (raw == null || raw === "") return false;
      const text = UTIL.normalizeText(String(raw), 80).toLowerCase().replace(/[\s-]+/g, "_");
      if (text === "fast" || text === "fast_mode" || text === "priority") return true;
      if (["standard", "normal", "regular", "default"].includes(text)) return false;
    }
    for (const key of ["request", "params", "data", "payload", "message", "turnStartParams", "body"]) {
      const detected = extractFastMode(value[key], depth + 1, seen);
      if (detected !== null) return detected;
    }
    return null;
  }

  function countsTowardFastModeUsage(turn) {
    const usage = normalizeUsage(turn?.usage);
    return turn?.source === "codex-live-token-cost" && usage.exact && UTIL.toCount(usage.total) > 0;
  }

  function normalizeProfileInvocation(value) {
    if (!value || typeof value !== "object") return null;
    const type = UTIL.normalizeText(String(value.type ?? value.kind ?? ""), 30).toLowerCase();
    const notificationItem =
      type === "mcp-notification" && value.method === "item/completed" && value.params?.item?.type === "mcpToolCall" ? value.params.item : null;
    const mcpServer = UTIL.normalizeText(notificationItem?.server || (type === "mcp_tool_call_end" ? value.invocation?.server : ""), 120).replace(/^\$+/, "");
    if (mcpServer) return { type: "plugin", plugin_id: mcpServer, plugin_name: mcpServer };
    const pluginName = UTIL.normalizeText(value.plugin_name ?? value.pluginName ?? (type === "plugin" ? value.name : ""), 80).replace(/^\$+/, "");
    const skillName = UTIL.normalizeText(value.skill_name ?? value.skillName ?? (type === "skill" ? value.name : ""), 80);
    const pluginId = UTIL.normalizeText(value.plugin_id ?? value.pluginId, 120).replace(/^\$+/, "");
    const skillId = UTIL.normalizeText(value.skill_id ?? value.skillId, 120);
    if (pluginName || pluginId) {
      return { type: "plugin", ...(pluginId ? { plugin_id: pluginId } : {}), ...(pluginName ? { plugin_name: pluginName } : {}) };
    }
    if (skillName || skillId) {
      return { type: "skill", ...(skillId ? { skill_id: skillId } : {}), ...(skillName ? { skill_name: skillName } : {}) };
    }
    return null;
  }

  function profileInvocationEventId(value) {
    return UTIL.normalizeText(
      value?.invocationId ||
        value?.invocation_id ||
        value?.callId ||
        value?.call_id ||
        value?.toolCallId ||
        value?.tool_call_id ||
        value?.eventId ||
        value?.event_id ||
        value?.requestId ||
        value?.request_id ||
        value?.streamId ||
        value?.stream_id ||
        value?.params?.item?.id,
      180,
    );
  }

  function normalizeProfileInvocationRecord(value) {
    const invocation = normalizeProfileInvocation(value);
    if (!invocation) return null;
    const invocationId = profileInvocationEventId(value);
    return invocationId ? { ...invocation, invocationId } : invocation;
  }

  function profileSkillInvocationsFromToolCall(value) {
    const notificationItem =
      value?.type === "mcp-notification" && value.method === "item/completed" && value.params?.item?.type === "commandExecution" ? value.params.item : null;
    const legacyToolCall = value?.type === "custom_tool_call" && value.name === "exec" ? value : null;
    if (!notificationItem && !legacyToolCall) return [];
    const rawInput = notificationItem?.command ?? legacyToolCall.input;
    const input = typeof rawInput === "string" ? rawInput : JSON.stringify(rawInput || {});
    const callId = UTIL.normalizeText(notificationItem?.id, 180) || profileInvocationEventId(value);
    const names = new Set();
    const pattern = /[\\/]skills[\\/]+(?:[^\\/"'\r\n]+[\\/]+)*([^\\/"'\r\n]+)[\\/]+SKILL\.md/gi;
    for (const match of input.matchAll(pattern)) {
      const name = UTIL.normalizeText(match[1], 120);
      if (name) names.add(name);
    }
    return Array.from(names, (name) => ({
      type: "skill",
      skill_id: name,
      skill_name: name,
      ...(callId ? { invocationId: `${callId}:skill:${name}` } : {}),
    }));
  }

  function collectProfileInvocations(value, depth = 0, out = [], seen = new WeakSet()) {
    if (!value || depth > 7) return out;
    if (typeof value === "string") {
      const parsed = parseMaybeJson(value);
      if (parsed) collectProfileInvocations(parsed, depth + 1, out, seen);
      return out;
    }
    if (Array.isArray(value)) {
      value.forEach((item) => collectProfileInvocations(item, depth + 1, out, seen));
      return out;
    }
    if (typeof value !== "object" || seen.has(value)) return out;
    seen.add(value);

    out.push(...profileSkillInvocationsFromToolCall(value));
    const invocation = normalizeProfileInvocationRecord(value);
    if (invocation) out.push(invocation);
    for (const key of ["tool_invocations", "toolInvocations", "tool_calls", "toolCalls", "invocations", "plugins", "skills", "tools", "request", "params", "data", "payload", "message", "result", "body"]) {
      collectProfileInvocations(value[key], depth + 1, out, seen);
    }
    return out;
  }

  function profileInvocationKey(invocation) {
    return [invocation.type, invocation.plugin_id || "", invocation.plugin_name || "", invocation.skill_id || "", invocation.skill_name || ""].join("\u0001");
  }

  function localProfileActivityStats(turns) {
    const activity = profileEmptyRollup().activity;
    activity.longestRunningDurationMs = 0;

    for (const turn of Array.isArray(turns) ? turns : []) {
      const effort = normalizeReasoningEffort(turn?.effort);
      if (effort) {
        activity.effortCounts[effort] = UTIL.toCount(activity.effortCounts[effort]) + 1;
      }
      const usage = normalizeUsage(turn?.usage);
      if (turn?.source === "codex-live-token-cost" && usage.exact && UTIL.toCount(usage.total) > 0) {
        activity.totalTokens += UTIL.toCount(usage.total);
        if (turn.fastMode === true) activity.fastModeTokens += UTIL.toCount(usage.total);
      }
      const durationMs = normalizedDurationMs(turn);
      activity.longestRunningDurationMs = Math.max(activity.longestRunningDurationMs, durationMs);
      const invocations = Array.isArray(turn?.invocations) ? turn.invocations : [];
      for (const rawInvocation of invocations) {
        const invocation = normalizeProfileInvocation(rawInvocation);
        if (!invocation) continue;
        const key = profileInvocationKey(invocation);
        const item = activity.invocationCounts[key] || { invocation, count: 0 };
        item.count++;
        activity.invocationCounts[key] = item;
      }
    }
    return profileActivityStats(activity);
  }

  function observeModelInfo(payload) {
    const info = extractModelInfo(payload);
    let changed = false;
    if (info.model && info.model !== state.detectedModel) {
      state.detectedModel = info.model;
      changed = true;
    }
    if (info.effort && info.effort !== state.detectedEffort) {
      state.detectedEffort = info.effort;
      changed = true;
    }
    return changed;
  }

  function setLocalTurnTimer(sessionKey, timer) {
    const key = localStateSessionKey(sessionKey);
    if (timer) state.localTurnTimers.set(key, timer);
    else state.localTurnTimers.delete(key);
    state.localTurnTimer = isActiveLocalStateSession(key) ? timer || 0 : state.localTurnTimer;
  }

  function clearLocalTurnTimer(sessionKey = currentSessionKey()) {
    const key = localStateSessionKey(sessionKey);
    const timer = state.localTurnTimers.get(key) || (isActiveLocalStateSession(key) ? state.localTurnTimer : 0);
    if (!timer) return;
    try {
      window.clearTimeout?.(timer);
    } catch {
      // Timer cleanup is best effort.
    }
    state.localTurnTimers.delete(key);
    if (isActiveLocalStateSession(key)) state.localTurnTimer = 0;
  }

  function cancelOutputRateRefresh() {
    if (!state.outputRateTimer) return;
    window.clearTimeout?.(state.outputRateTimer);
    state.outputRateTimer = 0;
  }

  function syncOutputRateRefresh(rate) {
    if (!rate?.active) {
      cancelOutputRateRefresh();
      return;
    }
    if (state.outputRateTimer) return;
    state.outputRateTimer = window.setTimeout(() => {
      state.outputRateTimer = 0;
      scheduleRender(0);
    }, RENDER_THROTTLE_MS);
  }

  function turnShimmerState(sessionKey = currentSessionKey()) {
    const key = localStateSessionKey(sessionKey);
    return state.turnShimmerSessions.get(key) || { running: false, startedAt: 0, outputStartedAt: 0 };
  }

  function syncActiveTurnShimmerState() {
    const item = turnShimmerState(currentSessionKey());
    state.turnShimmerRunning = Boolean(item.running);
    state.turnShimmerStartedAt = UTIL.toCount(item.startedAt);
    state.turnShimmerOutputStartedAt = UTIL.toCount(item.outputStartedAt);
    return item;
  }

  function setTurnShimmerState(sessionKey, item) {
    const key = localStateSessionKey(sessionKey);
    state.turnShimmerSessions.set(key, item);
    syncActiveTurnShimmerState();
    return item;
  }

  function isTurnShimmerRunning(sessionKey = currentSessionKey()) {
    return Boolean(turnShimmerState(sessionKey).running);
  }

  function startTurnShimmer(options = {}) {
    const sessionKey = localStateSessionKey(options.sessionKey || currentSessionKey());
    const item = turnShimmerState(sessionKey);
    if (item.running) return false;
    if (isActiveLocalStateSession(sessionKey)) cancelOutputRateRefresh();
    setTurnShimmerState(sessionKey, { running: true, startedAt: Date.now(), outputStartedAt: 0 });
    scheduleRender(0);
    return true;
  }

  function stopTurnShimmer(options = {}) {
    const sessionKey = localStateSessionKey(options.sessionKey || currentSessionKey());
    const item = turnShimmerState(sessionKey);
    if (!item.running) return false;
    if (isActiveLocalStateSession(sessionKey)) cancelOutputRateRefresh();
    setTurnShimmerState(sessionKey, { ...item, running: false, outputStartedAt: Date.now() });
    if (isActiveLocalStateSession(sessionKey)) stopCadencedShimmer({ finishActive: options.finishActive !== false });
    scheduleRender(0);
    return true;
  }

  function isVisibleElement(node) {
    try {
      const style = window.getComputedStyle?.(node);
      const rect = node.getBoundingClientRect?.();
      if (style && (style.display === "none" || style.visibility === "hidden" || style.opacity === "0")) return false;
      if (rect && (rect.width <= 0 || rect.height <= 0)) return false;
      return true;
    } catch {
      return false;
    }
  }

  // ---------------------------------------------------------------------------
  // 模块 17：composer 运行态与本地采集
  // 从 DOM 读运行态，落成交付给 turn 的 begin/finish 事件。
  // ---------------------------------------------------------------------------
  function composerActionButtons() {
    return Array.from(document.querySelectorAll?.("button.size-token-button-composer") || []);
  }

  function composerActionButton() {
    return composerActionButtons().find((button) => isVisibleElement(button)) || null;
  }

  function reactFiberOf(node) {
    if (!node) return null;
    try {
      let key = state.reactFiberKeyCache.get(node);
      if (!key) {
        key = Object.keys(node).find((name) => name.startsWith("__reactFiber$"));
        if (key) state.reactFiberKeyCache.set(node, key);
      }
      return key ? node[key] : null;
    } catch {
      return null;
    }
  }

  // 宿主输入区发送按钮的 React props 里有权威的回合状态（isResponseInProgress/isStopping）。
  // 脚本只能看到自己注入之后的事件，注入前已建立的 app-server 长连接会漏掉完成事件；
  // 这里直接读输入区状态，避免“回合早结束但浮光一直闪”。
  function officialComposerRunState(force = false) {
    if (window.__CODEX_LIVE_TOKEN_COST_TEST__) force = true;
    const now = Date.now();
    if (!force && state.composerRunStateAt && now - state.composerRunStateAt < COMPOSER_RUN_STATE_CACHE_MS) {
      return state.composerRunStateValue;
    }
    const remember = (value) => {
      state.composerRunStateAt = now;
      state.composerRunStateValue = value;
      return value;
    };
    let button = composerActionButton();
    if (!button) {
      // 页面隐藏或按钮暂时 0×0 时仍用 aria-label 判断发送/停止，保证残留浮光能自愈。
      const labels = composerActionButtons()
        .map((node) => UTIL.normalizeText(node.getAttribute?.("aria-label") || node.getAttribute?.("title") || "", 80));
      if (labels.some((label) => /^(停止|停止生成|停止任务|中止|取消|stop|stop generating|cancel|interrupt)$/i.test(label))) return remember(true);
      if (labels.some((label) => /^(发送|发送消息|send|send message|submit)$/i.test(label))) return remember(false);
      return remember(null);
    }
    let fiber = reactFiberOf(button);
    for (let depth = 0; fiber && depth < 40; depth += 1) {
      const props = fiber.memoizedProps;
      if (props && typeof props === "object" && typeof props.isResponseInProgress === "boolean") {
        return remember(props.isResponseInProgress || props.isStopping === true);
      }
      fiber = fiber.return;
    }
    const label = UTIL.normalizeText(button.getAttribute?.("aria-label") || button.getAttribute?.("title") || "", 80);
    if (/^(停止|停止生成|停止任务|中止|取消|stop|stop generating|cancel|interrupt)$/i.test(label)) return remember(true);
    if (/^(发送|发送消息|send|send message|submit)$/i.test(label)) return remember(false);
    if (button.getAttribute?.("aria-busy") === "true") return remember(true);
    const path = button.querySelector?.("svg path")?.getAttribute?.("d") || "";
    if (/^M9\.33467 16\.6663/.test(path)) return remember(false);
    return remember(null);
  }

  function runningSignalAgeMs(sessionKey = currentSessionKey()) {
    const key = localStateSessionKey(sessionKey);
    let age = Infinity;
    const shimmer = state.turnShimmerSessions.get(key);
    if (shimmer?.running) age = Math.min(age, Math.max(0, Date.now() - UTIL.toCount(shimmer.startedAt)));
    for (const [candidateKey, item] of state.officialThreadRuntimeStates.entries()) {
      if (!item?.running || !sameSessionKey(candidateKey, key)) continue;
      age = Math.min(age, Math.max(0, Date.now() - UTIL.toCount(item.observedAt)));
    }
    if (state.shimmerRunning && state.shimmerRunStartedAt) {
      age = Math.min(age, Math.max(0, Date.now() - state.shimmerRunStartedAt));
    }
    return age;
  }

  function clearStaleRunningSignals(sessionKey = currentSessionKey()) {
    const key = localStateSessionKey(sessionKey);
    let cleared = false;
    const shimmer = state.turnShimmerSessions.get(key);
    if (shimmer?.running) {
      state.turnShimmerSessions.set(key, { ...shimmer, running: false, outputStartedAt: Date.now() });
      cleared = true;
    }
    for (const [candidateKey, item] of state.officialThreadRuntimeStates.entries()) {
      if (!item?.running || !sameSessionKey(candidateKey, key)) continue;
      state.officialThreadRuntimeStates.set(candidateKey, { ...item, running: false, status: "idle", reason: "composer-idle", observedAt: Date.now() });
      cleared = true;
    }
    if (cleared) {
      syncActiveTurnShimmerState();
      stopCadencedShimmer({ finishActive: false });
    }
    return cleared;
  }

  function reconcileRunningWithComposerDom(sessionKey = currentSessionKey(), domState = officialComposerRunState()) {
    if (domState !== false) return false;
    if (runningSignalAgeMs(sessionKey) < RUNNING_DOM_GRACE_MS) return false;
    const cleared = clearStaleRunningSignals(sessionKey);
    if (!cleared && state.shimmerRunning) {
      stopCadencedShimmer();
      return true;
    }
    return cleared;
  }

  function isCodexComposerCompleteDom() {
    return false;
  }

  function isCodexTaskRunningDom() {
    const sessionKey = localStateSessionKey(currentSessionKey());
    return Boolean(localCurrentTurn(sessionKey) || isTurnShimmerRunning(sessionKey) || isOfficialThreadRunning(sessionKey));
  }

  function finishActiveTurnFromDomIfStopped() {
    const running = isCodexTaskRunningDom();
    if (running !== state.taskRunningDom) {
      state.taskRunningDom = running;
      scheduleRender(0);
    }
    return false;
  }

  function installTaskRunningObserver() {
    state.taskRunningDom = isCodexTaskRunningDom();
  }

  function restoreRunningCurrentTurnFromLast(sessionKey = currentSessionKey(), now = Date.now()) {
    const key = localStateSessionKey(sessionKey);
    if (localCurrentTurn(key)) return false;
    const last = state.localLast;
    if (!last || last.source !== "codex-live-token-cost" || last.persistReason !== "live") return false;
    if (!sameSessionKey(turnSessionKey(last), key)) return false;
    const observedAt = UTIL.firstTimestampMs(last.observedAt, last.finishedAt, last.createdAt);
    if (!observedAt || Math.abs(UTIL.toTimestampMs(now) - observedAt) > LOCAL_LIVE_TURN_RESTORE_MAX_AGE_MS) return false;
    const usage = normalizeUsage(last.usage);
    if (!usage.exact) return false;
    setLocalCurrentTurn({
      id: UTIL.normalizeText(last.turnId, 120) || `${Date.now()}-${++state.localTurnSeq}`,
      sessionKey: key,
      startedAt: UTIL.toCount(Date.parse(last.startedAt || last.createdAt)) || Date.now(),
      calls: [{ usage, source: "restored-live", observedAt: UTIL.toCount(last.observedAt) || Date.now() }],
      context: {
        effort: normalizeReasoningEffort(last.effort),
        fastMode: typeof last.fastMode === "boolean" ? last.fastMode : null,
        invocations: Array.isArray(last.invocations) ? last.invocations : [],
      },
    }, key);
    // 只是恢复显示数据，不能凭“最近一次 live 记录”就断言回合还在运行。
    // 只有宿主输入区确实处于运行态时才重新点燃浮光，否则切换会话就会误闪。
    if (officialComposerRunState() === true) startTurnShimmer({ sessionKey: key });
    return true;
  }

  function finishLocalTurn(delay = 0, options = {}) {
    const sessionKey = localStateSessionKey(options.sessionKey || currentSessionKey());
    clearLocalTurnTimer(sessionKey);
    if (!localCurrentTurn(sessionKey)) return;
    const reason = UTIL.normalizeText(options.reason || "complete", 40) || "complete";
    void delay;
    persistLocalCurrentTurn(reason, sessionKey, { durationStatus: "completed" });
    setLocalCurrentTurn(null, sessionKey);
    stopTurnShimmer({ finishActive: true, sessionKey });
    scheduleRender();
  }

  function scheduleLocalTurnCompletionCheck(delay = 0, options = {}) {
    const sessionKey = localStateSessionKey(options.sessionKey || currentSessionKey());
    clearLocalTurnTimer(sessionKey);
    if (!localCurrentTurn(sessionKey)) return;
    persistLocalCurrentTurn("live", sessionKey);
    if (!isActiveLocalStateSession(sessionKey)) {
      scheduleRender();
      return;
    }
    state.taskRunningDom = isCodexTaskRunningDom();
    scheduleRender();
  }

  function beginLocalTurn(options = {}) {
    const sessionKey = localStateSessionKey(options.sessionKey || currentSessionKey());
    const forceNewIfUsed = Boolean(options?.forceNewIfUsed);
    clearLocalTurnTimer(sessionKey);
    const current = localCurrentTurn(sessionKey);
    if (current) {
      if (options.threadAttributionStatus === "reliable" && options.profileThreadKey) {
        current.profileThreadKey = UTIL.normalizeText(options.profileThreadKey, 240);
        current.profileThreadAttributionStatus = "reliable";
      }
      if (!forceNewIfUsed || !current.calls?.length) return current;
      persistLocalCurrentTurn("interrupted", sessionKey);
      setLocalCurrentTurn(null, sessionKey);
    }
    const profileThreadKey = options.threadAttributionStatus === "reliable" ? UTIL.normalizeText(options.profileThreadKey || sessionKey, 240) : "";
    const turn = {
      id: UTIL.normalizeText(options.turnId, 120) || `${Date.now()}-${++state.localTurnSeq}`,
      sessionKey,
      profileThreadKey,
      profileThreadAttributionStatus: profileThreadKey ? "reliable" : "unknown",
      startedAt: UTIL.toTimestampMs(options.startedAtMs ?? options.startedAt) || Date.now(),
      calls: [],
      context: { effort: "", fastMode: null, invocations: [] },
    };
    setLocalCurrentTurn(turn, sessionKey);
    profileLedgerUpsertTurn({
      turnId: turn.id,
      threadKey: profileThreadKey,
      threadAttributionStatus: turn.profileThreadAttributionStatus,
      startedAt: turn.startedAt,
      model: modelName(),
      effort: activeModelInfo().effort,
      fastMode: typeof state.detectedFastMode === "boolean" ? state.detectedFastMode : null,
      source: "codex-live-token-cost",
      durationStatus: "incomplete",
      persistReason: "turn-start",
      capturedAt: Date.now(),
    });
    startTurnShimmer({ sessionKey });
    return turn;
  }

  function beginLocalRequestTurn(options = {}) {
    const sessionKey = localStateSessionKey(options.sessionKey || currentSessionKey());
    const current = localCurrentTurn(sessionKey);
    const shimmer = turnShimmerState(sessionKey);
    const forceNewIfUsed = Boolean(current?.calls?.length && shimmer.outputStartedAt && !shimmer.running);
    return beginLocalTurn({ ...options, sessionKey, forceNewIfUsed });
  }

  function normalizeProfileContext(context = {}) {
    return {
      effort: normalizeReasoningEffort(context.effort),
      fastMode: typeof context.fastMode === "boolean" ? context.fastMode : null,
      invocations: Array.isArray(context.invocations) ? context.invocations.map(normalizeProfileInvocationRecord).filter(Boolean) : [],
    };
  }

  function hasProfileContext(context = {}) {
    const normalized = normalizeProfileContext(context);
    return Boolean(normalized.effort || typeof normalized.fastMode === "boolean" || normalized.invocations.length);
  }

  function mergeProfileContext(base = {}, next = {}) {
    const left = normalizeProfileContext(base);
    const right = normalizeProfileContext(next);
    return {
      effort: right.effort || left.effort,
      fastMode: typeof right.fastMode === "boolean" ? right.fastMode : left.fastMode,
      invocations: [...left.invocations, ...right.invocations],
    };
  }

  function localTurnMetric(turn, now = Date.now()) {
    if (!turn?.calls?.length) return null;
    const aggregate = aggregateTurnUsage(turn);
    if (!normalizeUsage(aggregate).exact) return null;
    const officialTiming = turn.officialTiming && typeof turn.officialTiming === "object" ? turn.officialTiming : {};
    const startedAt = UTIL.toTimestampMs(officialTiming.startedAtMs || turn.startedAt) || now;
    const finishedAt = UTIL.toTimestampMs(officialTiming.completedAtMs || officialTiming.finishedAtMs) || now;
    const explicitDurationMs = normalizedDurationMs(officialTiming, startedAt, finishedAt);
    const durationMs = explicitDurationMs || Math.max(0, finishedAt - startedAt);
    return {
      usage: aggregate,
      turnId: turn.id,
      sessionKey: turn.sessionKey,
      threadKey: turn.threadKey || turn.sessionKey,
      source: "codex-live-token-cost",
      // 实时捕获的 turn：没有 rollout record 佐证，标为 live_notification。
      usageSource: "live_notification",
      callCount: turn.calls.length,
      // 逐响应 id 让实时行也能和 rollout / 导入行按响应对齐去重。
      responseIds: Array.from(new Set(turn.calls.map((call) => UTIL.normalizeText(call.responseId, 200)).filter(Boolean))),
      model: modelName(),
      effort: normalizeReasoningEffort(turn.context?.effort || activeModelInfo().effort),
      fastMode: typeof turn.context?.fastMode === "boolean" ? turn.context.fastMode : null,
      invocations: Array.isArray(turn.context?.invocations) ? turn.context.invocations : [],
      createdAt: new Date(startedAt).toISOString(),
      observedAt: now,
      startedAt: new Date(startedAt).toISOString(),
      finishedAt: new Date(now).toISOString(),
      durationMs,
      durationSec: Math.round(durationMs / 1000),
    };
  }

  function outputTokenRate(turn, running, now = Date.now()) {
    if (!running || !turn) return { active: false, visible: false, value: 0 };
    const output = UTIL.toCount(turn.usage ? normalizeUsage(turn.usage).output : aggregateTurnUsage(turn).output);
    const outputStartedAt = Number(turn.outputStartedAt);
    const elapsedMs = Math.max(0, UTIL.toTimestampMs(now) - outputStartedAt);
    if (!output || !Number.isFinite(outputStartedAt) || outputStartedAt <= 0) return { active: false, visible: false, value: 0 };
    if (!elapsedMs) return { active: true, visible: false, value: 0 };
    return { active: true, visible: true, value: Math.max(1, Math.round((output * 1000) / elapsedMs)) };
  }

  function averageOutputTokenRate(turn, running) {
    if (running || !turn) return { visible: false, value: 0 };
    const usage = normalizeUsage(turn.usage);
    if (!usage.exact) return { visible: false, value: 0 };
    const durationMs = normalizedDurationMs(turn, UTIL.toTimestampMs(turn.startedAt), UTIL.toTimestampMs(turn.finishedAt));
    if (!durationMs) return { visible: true, value: 0 };
    return { visible: true, value: Math.max(0, (usage.output * 1000) / durationMs) };
  }

  function fmtAverageOutputTokenRate(value) {
    const rate = Number(value);
    return Number.isFinite(rate) && rate > 0 ? rate.toFixed(2) : "0";
  }

  function persistLocalCurrentTurn(reason = "persist", sessionKey = currentSessionKey(), options = {}) {
    const key = localStateSessionKey(sessionKey);
    const current = localCurrentTurn(key);
    const metric = localTurnMetric(current);
    const profileThreadKey = UTIL.normalizeText(current.profileThreadKey, 240);
    const profileThreadAttributionStatus = current.profileThreadAttributionStatus === "reliable" && profileThreadKey ? "reliable" : "unknown";
    profileLedgerObserveLocalTurn(current, current.context, {
      reason,
      durationStatus: options.durationStatus === "completed" ? "completed" : options.durationStatus === "recovered" ? "recovered" : "incomplete",
      completedAt: options.completedAt,
      observedAt: Date.now(),
      threadKey: profileThreadKey,
      threadAttributionStatus: profileThreadAttributionStatus,
      calls: [],
      invocations: [],
    });
    if (!metric) return false;
    if (isTransientSessionKey(key)) return false;
    state.localLast = { ...metric, persistReason: reason };
    state.localLedger = state.localLedger.filter((item) => item.turnId !== metric.turnId).concat(state.localLast);
    invalidateLocalUsageCache();
    state.localPersistedUsage.set(usageKey(metric.usage), Date.now());
    saveLocalLedger();
    rememberDailyUsage(metric);
    scheduleProfileUsageRefresh();
    return true;
  }

  // 实时去重：优先 response_id；没有 response_id 时用 (threadId, turnId, totalTokens)
  // 单调递增。TTL 只做 UI 防抖，不参与账本判定。
  function usageLiveTotalKey(threadId, turnId) {
    return `${threadId || ""}\u0001${turnId || ""}`;
  }

  function usageLiveAcceptResponse(responseId) {
    const key = usageFactKey(responseId);
    if (!key) return true;
    if (state.usageLiveResponseIds.has(key)) return false;
    state.usageLiveResponseIds.add(key);
    return true;
  }

  function usageLiveAcceptTotal(threadId, turnId, totalTokens) {
    const total = UTIL.toCount(totalTokens);
    if (!total) return true;
    const key = usageLiveTotalKey(threadId, turnId);
    const previous = state.usageLiveTotals.get(key) || 0;
    if (!previous) {
      state.usageLiveTotals.set(key, total);
      return true;
    }
    // 累计值不递增说明是同一份用量的重复通知（实测间隔 15.9s / 24.9s / 约 9 小时）。
    if (total === previous) return false;
    if (total < previous) {
      // 累计值倒退 = 新 epoch（上下文压缩 / 恢复 / 换线程后重发）。
      // 旧 epoch 的基线作废，重置为新值并告警，不能当成重复丢弃。
      state.usageLiveTotals.set(key, total);
      state.usageLiveEpochs += 1;
      state.usageLiveEpochWarnings = `累计用量从 ${previous} 回退到 ${total}，已按新 epoch 重新计数`;
      return true;
    }
    state.usageLiveTotals.set(key, total);
    return true;
  }

  // 从通知里取累计用量：token_count 的 info.total_token_usage，或
  // thread/tokenUsage/updated 的 tokenUsage.total。缺失时返回 0。
  function usageCumulativeTotalFromPayload(payload, depth = 0, seen = new WeakSet()) {
    if (!payload || depth > 5) return 0;
    if (typeof payload === "string") {
      try {
        return usageCumulativeTotalFromPayload(JSON.parse(payload), depth + 1, seen);
      } catch {
        return 0;
      }
    }
    if (Array.isArray(payload)) {
      for (const item of payload) {
        const found = usageCumulativeTotalFromPayload(item, depth + 1, seen);
        if (found) return found;
      }
      return 0;
    }
    if (typeof payload !== "object" || seen.has(payload)) return 0;
    seen.add(payload);
    const direct =
      UTIL.toCount(payload.total_token_usage?.total_tokens) ||
      UTIL.toCount(payload.tokenUsage?.total?.total_tokens) ||
      UTIL.toCount(payload.token_usage?.total?.total_tokens) ||
      UTIL.toCount(payload.total?.total_tokens);
    if (direct) return direct;
    for (const key of ["info", "tokenUsage", "token_usage", "params", "payload", "data", "body", "bodyJsonString"]) {
      if (key in payload) {
        const found = usageCumulativeTotalFromPayload(payload[key], depth + 1, seen);
        if (found) return found;
      }
    }
    return 0;
  }

  // 从通知里取 response_id：rawResponse/completed 的 response_id 是最精确的幂等键。
  function usageResponseIdFromPayload(payload, depth = 0, seen = new WeakSet()) {
    if (!payload || depth > 5) return "";
    if (typeof payload === "string") {
      try {
        return usageResponseIdFromPayload(JSON.parse(payload), depth + 1, seen);
      } catch {
        return "";
      }
    }
    if (Array.isArray(payload)) {
      for (const item of payload) {
        const found = usageResponseIdFromPayload(item, depth + 1, seen);
        if (found) return found;
      }
      return "";
    }
    if (typeof payload !== "object" || seen.has(payload)) return "";
    seen.add(payload);
    const direct = usageFactKey(payload.response_id ?? payload.responseId ?? payload.id);
    if (direct && /^resp[_-]/.test(direct)) return direct;
    for (const key of ["params", "payload", "data", "body", "bodyJsonString", "response", "message"]) {
      if (key in payload) {
        const found = usageResponseIdFromPayload(payload[key], depth + 1, seen);
        if (found) return found;
      }
    }
    return "";
  }

  function rememberLocalUsage(rawUsage, source = "network", context = {}, options = {}) {
    const usage = normalizeUsage(rawUsage);
    if (!usage.exact) return false;
    const sessionKey = localStateSessionKey(options.sessionKey || currentSessionKey());
    const turn = beginLocalTurn({
      sessionKey,
      profileThreadKey: options.profileThreadKey,
      threadAttributionStatus: options.threadAttributionStatus,
    });
    if (!turn) return false;
    const now = Date.now();
    const key = usageKey(usage);
    const persist = options.persist ?? shouldPersistUsagePayload(null, source);
    const responseId = usageFactKey(options.responseId || options.response_id);
    const threadId = UTIL.normalizeText(options.threadId || options.thread_id || options.profileThreadKey, 240);
    const turnId = UTIL.normalizeText(options.turnId || options.turn_id || turn.id, 240);

    // 幂等键：response_id 优先；没有 response_id 时用 (threadId, turnId, totalTokens) 单调递增。
    if (responseId) {
      if (!usageLiveAcceptResponse(responseId)) return false;
    } else if (!usageLiveAcceptTotal(threadId, turnId, UTIL.toCount(options.cumulativeTotal))) {
      return false;
    }
    // TTL 只做 UI 防抖：同 key 的高频重复不重复渲染，但不再决定是否入账。
    const dedupeKey = `${turn.id}\u0001${key}`;
    const previousAt = state.localSeenUsage.get(dedupeKey) || 0;
    if (!persist && now - previousAt < 3000) return false;
    state.localSeenUsage.set(dedupeKey, now);
    for (const [seenKey, seenAt] of state.localSeenUsage) {
      if (now - seenAt > 10000) state.localSeenUsage.delete(seenKey);
    }
    if (persist) {
      const persistedAt = state.localPersistedUsage.get(dedupeKey) || 0;
      if (now - persistedAt < 10000) return false;
      state.localPersistedUsage.set(dedupeKey, now);
      for (const [seenKey, seenAt] of state.localPersistedUsage) {
        if (now - seenAt > 30000) state.localPersistedUsage.delete(seenKey);
      }
    }
    turn.context = mergeProfileContext(turn.context, context);
    // 同一 response_id 的重复到达只更新观测时间，不新增 call。
    const existing = turn.calls.find((call) => (responseId ? call.responseId === responseId : usageKey(call.usage) === key));
    if (existing) {
      existing.source = source;
      existing.observedAt = now;
      existing.usage = usage;
    } else {
      turn.calls.push({ usage, source, observedAt: now, ...(responseId ? { responseId } : {}) });
    }
    if (!(Number(turn.outputStartedAt) > 0) && UTIL.toCount(aggregateTurnUsage(turn).output)) turn.outputStartedAt = now;
    const metric = localTurnMetric(turn, now);
    if (!metric) return false;
    // 逐响应事实入库：有 response_id 才是事实。
    if (responseId) {
      const fact = usageFactUpsert({
        responseId,
        threadId,
        turnId,
        model: metric.model,
        effort: metric.effort,
        usage: {
          input_tokens: UTIL.toCount(usage.input),
          cached_input_tokens: UTIL.toCount(usage.cached),
          output_tokens: UTIL.toCount(usage.output),
          total_tokens: UTIL.toCount(usage.total),
        },
        observedAtMs: now,
        source: "live_notification",
      });
      if (fact) void usageFactPersistResponses([fact]);
    }
    profileLedgerObserveLocalTurn(turn, context, {
      observedAt: now,
      reason: persist ? "final-observed" : "usage-observed",
      durationStatus: "incomplete",
      calls: existing ? [] : [{ usage, source }],
      invocations: Array.isArray(options.invocations) ? options.invocations : context.invocations,
      invocationEventId: options.invocationEventId,
      threadKey: options.profileThreadKey,
      threadAttributionStatus: options.threadAttributionStatus,
    });
    scheduleProfileUsageRefresh();
    if (!persist) return true;
    persistLocalCurrentTurn("final", sessionKey);
    scheduleRender();
    return true;
  }
  function inspectLocalPayload(payload, source) {
    if (isComposerDraftPayload(payload)) return false;
    const identity = extractSessionIdentity(payload);
    const resolvedSession = resolveSessionIdentity(identity);
    const payloadSessionKey = resolvedSession.sessionKey;
    const hasSessionReference = sessionIdentityHasSessionReference(identity);
    const unresolvedSessionIdentity = hasSessionReference && !payloadSessionKey;
    const fallbackRuntimeSessionKey = hasSessionReference ? "" : sessionlessUsageRuntimeSessionKey(payload);
    const sessionKey = localStateSessionKey(payloadSessionKey || fallbackRuntimeSessionKey || currentSessionKey());
    const hasReliableSessionKey = Boolean(payloadSessionKey || fallbackRuntimeSessionKey);
    const sessionChanged = observeSessionInfo(payload);
    const info = extractModelInfo(payload);
    const modelChanged = observeModelInfo(payload);
    const resultOutputStarted = hasAssistantResultOutputStarted(payload, source);
    const tokenCountPayload = isTokenCountPayload(payload);
    const taskCompletePayload = isTaskCompletePayload(payload);
    const fastMode = extractFastMode(payload);
    const invocations = collectProfileInvocations(payload);
    const invocationEventId = profileInvocationEventId(payload) || UTIL.normalizeText(identity.requestId || identity.streamId, 180);
    const explicitContext = normalizeProfileContext({
      effort: info.effort,
      fastMode,
      invocations,
    });
    const requestStart = /body/i.test(String(source || "")) && shouldStartTurnFromRequestPayload(payload);
    const canStartRequest = requestStart && !unresolvedSessionIdentity;
    const profileAttribution = {
      profileThreadKey: hasReliableSessionKey ? sessionKey : "",
      threadAttributionStatus: hasReliableSessionKey ? "reliable" : "unknown",
    };
    if (canStartRequest) beginLocalRequestTurn({ sessionKey, ...profileAttribution });
    const canUseSessionlessCurrentTurn = !hasSessionReference && officialRuntimeRunningCount() <= 1;
    const canUseCurrentSessionForUsage = Boolean(hasReliableSessionKey || canStartRequest || (!unresolvedSessionIdentity && canUseSessionlessCurrentTurn && localCurrentTurn(sessionKey)));
    if (hasProfileContext(explicitContext) && /body|websocket|message/i.test(String(source || ""))) {
      const turn = localCurrentTurn(sessionKey) || (canStartRequest ? beginLocalRequestTurn({ sessionKey, ...profileAttribution }) : null);
      if (turn) {
        turn.context = mergeProfileContext(turn.context, explicitContext);
        if (!collectUsages(payload).length) {
          profileLedgerObserveLocalTurn(turn, explicitContext, {
            reason: "context-observed",
            durationStatus: "incomplete",
            invocations,
            invocationEventId,
            threadKey: hasReliableSessionKey ? sessionKey : "",
            threadAttributionStatus: hasReliableSessionKey ? "reliable" : "unknown",
          });
        }
      }
    }
    const turnContext = localCurrentTurn(sessionKey)?.context || {};
    const context = normalizeProfileContext({
      effort: info.effort || turnContext.effort || state.detectedEffort || activeModelInfo().effort,
      fastMode: typeof fastMode === "boolean" ? fastMode : turnContext.fastMode,
      invocations: invocations.length ? invocations : turnContext.invocations,
    });
    let changed = false;
    const persistUsage = shouldPersistUsagePayload(payload, source);
    // 累计用量与 response_id：幂等判定用它们，TTL 只做 UI 防抖。
    const cumulativeTotal = usageCumulativeTotalFromPayload(payload);
    const payloadResponseId = usageResponseIdFromPayload(payload);
    if (canUseCurrentSessionForUsage) {
      for (const usage of collectUsages(payload)) {
        changed =
          rememberLocalUsage(usage, source, context, {
            persist: persistUsage,
            sessionKey,
            invocations,
            invocationEventId,
            profileThreadKey: hasReliableSessionKey ? sessionKey : "",
            threadAttributionStatus: hasReliableSessionKey ? "reliable" : "unknown",
            responseId: payloadResponseId,
            cumulativeTotal,
            threadId: identity.threadKey || identity.conversationKey || sessionKey,
            turnId: identity.turnId,
          }) || changed;
      }
    }
    const genericTaskCompleteWithoutSession = !hasSessionReference && isGenericTaskCompletePayload(payload);
    const sessionlessTaskCompleteKey = genericTaskCompleteWithoutSession ? sessionlessTaskCompleteSessionKey(identity.turnId) : "";
    const taskCompleteSessionKey = payloadSessionKey || sessionlessTaskCompleteKey;
    const taskCompleteTiming = taskCompletePayload ? officialRuntimeSignalFromPayload(payload) || officialRuntimeTimingFromPayload(payload) : {};
    const taskCompleteHandled = Boolean(taskCompletePayload && taskCompleteSessionKey && turnCompletionMatchesCurrent(taskCompleteSessionKey, identity.turnId));
    const officialRuntimeChanged = observeOfficialRuntimePayload(payload, source);
    if (taskCompleteHandled) {
      clearLocalTurnTimer(taskCompleteSessionKey);
      if (localCurrentTurn(taskCompleteSessionKey)) {
        applyOfficialTurnTiming(localCurrentTurn(taskCompleteSessionKey), { turnId: identity.turnId, ...taskCompleteTiming });
        persistLocalCurrentTurn("complete", taskCompleteSessionKey, {
          durationStatus: "completed",
          completedAt: taskCompleteTiming.completedAtMs,
        });
        setLocalCurrentTurn(null, taskCompleteSessionKey);
      }
      stopTurnShimmer({ finishActive: true, sessionKey: taskCompleteSessionKey });
    } else if (taskCompletePayload && genericTaskCompleteWithoutSession) {
      stopTurnShimmer({ finishActive: true, sessionKey });
    } else if (changed && !persistUsage && tokenCountPayload) persistLocalCurrentTurn("live", sessionKey);
    else if (changed && !persistUsage) scheduleLocalTurnCompletionCheck(0, { sessionKey });
    const taskCompleteVisibleHandled = taskCompleteHandled || genericTaskCompleteWithoutSession;
    if (changed || modelChanged || sessionChanged || resultOutputStarted || taskCompleteVisibleHandled || officialRuntimeChanged) scheduleRender();
    return changed || modelChanged || sessionChanged || resultOutputStarted || taskCompleteVisibleHandled || officialRuntimeChanged;
  }

  function localUsageExport() {
    const current = localCurrentTurn(currentSessionKey());
    const officialTiming = current?.officialTiming && typeof current.officialTiming === "object" ? current.officialTiming : {};
    const currentStartedAt = UTIL.toTimestampMs(officialTiming.startedAtMs || current?.startedAt);
    const currentFinishedAt = UTIL.toTimestampMs(officialTiming.completedAtMs || officialTiming.finishedAtMs) || Date.now();
    const currentDurationMs = normalizedDurationMs(officialTiming, currentStartedAt, currentFinishedAt) || Math.max(0, currentFinishedAt - currentStartedAt);
    return {
      // 不要在热路径复制整份账本：currentSessionTurns 以数组引用做 WeakMap 缓存，
      // 每次 slice() 都会让缓存失效并重新过滤所有回合。
      turns: state.localLedger,
      last: state.localLast,
      currentTurn: current
        ? {
            id: current.id,
            turnId: current.id,
            sessionKey: current.sessionKey,
            threadKey: current.threadKey || current.sessionKey,
            startedAt: current.startedAt,
            outputStartedAt: current.outputStartedAt,
            callCount: current.calls.length,
            durationMs: currentDurationMs,
            usage: aggregateTurnUsage(current),
            model: modelName(),
            effort: normalizeReasoningEffort(current.context?.effort || activeModelInfo().effort),
            fastMode: typeof current.context?.fastMode === "boolean" ? current.context.fastMode : null,
            invocations: Array.isArray(current.context?.invocations) ? current.context.invocations : [],
          }
        : null,
    };
  }

  function debugSessionState() {
    ensureLocalLedgerLoaded();
    const counts = new Map();
    for (const turn of state.localLedger) {
      const key = turnSessionKey(turn) || "(none)";
      const usage = normalizeUsage(turn?.usage);
      const current = counts.get(key) || { sessionKey: key, turns: 0, total: 0, cached: 0 };
      current.turns += 1;
      current.total += UTIL.toCount(usage.total);
      current.cached += UTIL.toCount(usage.cached);
      counts.set(key, current);
    }
    return {
      version: VERSION,
      currentSessionKey: currentSessionKey(),
      activeSidebarThreadKey: activeSidebarThreadKey(),
      detectedSessionKey: recentDetectedSessionKey(),
      detectedModel: state.detectedModel,
      detectedEffort: state.detectedEffort,
      detectedFastMode: state.detectedFastMode,
      newConversationSessionKey: recentNewConversationSessionKey(),
      startupBlankConversationSessionKey: startupBlankConversationSessionKey(),
      lastClickedSidebarThreadKey: state.lastClickedSidebarThreadKey,
      officialThreadRuntime: Array.from(state.officialThreadRuntimeStates.entries()).map(([sessionKey, item]) => ({ sessionKey, ...item })),
      running: state.running,
      shimmerRunning: state.shimmerRunning,
      shimmerRunStartedAt: state.shimmerRunStartedAt,
      turnShimmerSessions: Array.from(state.turnShimmerSessions.entries()).map(([sessionKey, item]) => ({ sessionKey, ...item })),
      composerRunState: officialComposerRunState(),
      composerButtonLabel: composerActionButton()?.getAttribute?.("aria-label") || composerActionButton()?.getAttribute?.("title") || "",
      ledgerSessions: Array.from(counts.values()).sort((a, b) => b.total - a.total || a.sessionKey.localeCompare(b.sessionKey)).slice(0, 20),
    };
  }

  // ---------------------------------------------------------------------------
  // 模块 18：使用统计聚合
  // aggregateUsageAnalytics → buildAnalyticsRollup → saveAnalyticsRollup（localStorage 日聚合）。
  // 跨午夜按每条响应 observedAtMs 落自然日，且各日之和必须严格等于整轮总量才拆。
  // ---------------------------------------------------------------------------
  function readTokenUsage() {
    return localUsageExport();
  }

  function turnUsageKeySet(turns) {
    const cached = state.sessionUsageKeyCache.get(turns);
    if (cached) return cached;
    const keys = new Set(turns.map((turn) => metricUsageKey(turn)));
    state.sessionUsageKeyCache.set(turns, keys);
    return keys;
  }

  function sessionUsage(turns) {
    if (!Array.isArray(turns)) return { input: 0, output: 0, cached: 0, total: 0 };
    const cached = state.sessionUsageCache.get(turns);
    if (cached) return cached;
    const value = turns.reduce((sum, turn) => addUsage(sum, normalizeUsage(turn?.usage)), {
      input: 0,
      output: 0,
      cached: 0,
      total: 0,
    });
    state.sessionUsageCache.set(turns, value);
    return value;
  }

  function storedTurnCost(turn) {
    const value = Number(turn?.costUsd ?? turn?.totalCostUsd ?? turn?.total_cost_usd);
    return Number.isFinite(value) && value > 0 ? value : null;
  }

  function turnCost(turn, fallbackModel = modelName()) {
    const usage = normalizeUsage(turn?.usage);
    if (!usage.exact) return { value: 0, priced: true };
    const storedCost = storedTurnCost(turn);
    if (storedCost != null) return { value: storedCost, priced: true };
    return costForModelUsage(usage, turn?.model || fallbackModel, { fastMode: turn?.fastMode === true });
  }

  function startOfLocalDay(time) {
    const date = new Date(time);
    return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  }

  function endOfLocalDay(time) {
    const date = new Date(time);
    return new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1).getTime() - 1;
  }

  function analyticsRangeForPreset(preset = "today", now = Date.now(), custom = {}) {
    const endMs = UTIL.toTimestampMs(now) || Date.now();
    const dayStart = startOfLocalDay(endMs);
    if (preset === "custom") {
      const rawStart = UTIL.toTimestampMs(custom.startMs ?? custom.start);
      const rawEnd = UTIL.toTimestampMs(custom.endMs ?? custom.end);
      const startMs = rawStart ? startOfLocalDay(rawStart) : dayStart;
      const customEnd = rawEnd ? endOfLocalDay(rawEnd) : endOfLocalDay(endMs);
      return { preset, startMs: Math.min(startMs, customEnd), endMs: Math.min(Math.max(startMs, customEnd), endMs) };
    }
    const days = preset === "30d" ? 30 : preset === "7d" ? 7 : 1;
    const start = new Date(dayStart);
    start.setDate(start.getDate() - (days - 1));
    return { preset: days === 1 ? "today" : preset, startMs: start.getTime(), endMs };
  }

  function analyticsComparisonRange(range, preset = range?.preset || "custom") {
    const startMs = UTIL.toTimestampMs(range?.startMs);
    const endMs = UTIL.toTimestampMs(range?.endMs);
    if (!startMs || !endMs || endMs < startMs) return { startMs: 0, endMs: 0 };
    if (preset === "today") {
      const previousStart = new Date(startMs);
      previousStart.setDate(previousStart.getDate() - 1);
      return { startMs: previousStart.getTime(), endMs: previousStart.getTime() + (endMs - startMs) };
    }
    // 7 天 / 30 天与「上一个完整日历区间」比较：当期从今天 00:00 起算，上期就必须是
    // 前 N 个自然日整段（终点 = 当期起点前 1ms）。旧实现用「终点 = 起点前 1ms − 时长」，
    // 起点会被当前时刻平移（16:42 时落在 07:27），边界日整块错位一天。
    if (preset === "7d" || preset === "30d") {
      const days = preset === "30d" ? 30 : 7;
      const alignedStart = startOfLocalDay(startMs);
      const previousStart = new Date(alignedStart);
      previousStart.setDate(previousStart.getDate() - days);
      return { startMs: previousStart.getTime(), endMs: alignedStart - 1 };
    }
    const duration = endMs - startMs;
    const previousEnd = startMs - 1;
    return { startMs: previousEnd - duration, endMs: previousEnd };
  }

  function analyticsVisibleTurns(turns) {
    return (Array.isArray(turns) ? turns : []).filter((turn) => normalizeUsage(turn?.usage).exact);
  }

  function analyticsTurnTimestampMs(turn) {
    return turnTimestampMs(turn);
  }

  function emptyUsageAnalytics() {
    return {
      totalTokens: 0,
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      cacheWriteAvailable: false,
      regularInput: 0,
      calls: 0,
      cost: 0,
      priced: true,
      cacheHitRate: null,
      activeDays: 0,
      models: [],
    };
  }

  // 区间聚合的分片计价：有存储费用时按 token 占比分摊，否则按本机价格表单独计价。
  function usageSliceCost(turn, slice, model, wholeTotal) {
    const usage = normalizeUsage(slice?.usage);
    if (!usage.exact) return { value: 0, priced: true };
    const storedCost = storedTurnCost(turn);
    if (storedCost != null) {
      const sliceTotal = UTIL.toCount(usage.total || usage.input + usage.output);
      return { value: wholeTotal ? (storedCost * sliceTotal) / wholeTotal : 0, priced: true };
    }
    return costForModelUsage(usage, turn?.model || model, { fastMode: turn?.fastMode === true });
  }

  function aggregateUsageAnalytics(turns, range = {}) {
    const startMs = UTIL.toTimestampMs(range.startMs) || 0;
    const endMs = UTIL.toTimestampMs(range.endMs) || Number.MAX_SAFE_INTEGER;
    const totals = emptyUsageAnalytics();
    const models = new Map();
    // 覆盖天数：区间内真正有数据的本地自然日，用来判断「上期样本是否够比」。
    const activeDays = new Set();
    // 跨午夜拆分：一次建索引，供本批 turn 复用。
    const dayIndex = usageFactDayIndex();
    for (const turn of Array.isArray(turns) ? turns : []) {
      const wholeUsage = normalizeUsage(turn?.usage);
      if (!wholeUsage.exact) continue;
      const wholeTotal = UTIL.toCount(wholeUsage.total || wholeUsage.input + wholeUsage.output);
      const slices = usageDaySlicesFromIndex(dayIndex, turn);
      if (!slices.length) continue;
      const model = UTIL.normalizeText(turn?.model, 120) || UNKNOWN_MODEL;
      const tokenOnly = (UTIL.normalizeText(turn?.source, 80) === "codexpp-history" || UTIL.normalizeText(turn?.importSource, 80) === "codexpp-history");
      for (const slice of slices) {
        // 区间命中用分片自己的观测时间跨度判断；跨午夜的 turn 只计入落在区间内的那一天。
        if (!slice.lastMs || slice.lastMs < startMs || slice.firstMs > endMs) continue;
        const usage = normalizeUsage(slice.usage);
        if (!usage.exact) continue;
        activeDays.add(localDateKey(slice.firstMs || slice.lastMs));
        const cacheRead = Math.min(UTIL.toCount(usage.input), UTIL.toCount(usage.cached));
        const cacheWrite = Math.min(Math.max(0, UTIL.toCount(usage.input) - cacheRead), UTIL.toCount(usage.cacheWriteTokens ?? usage.cacheCreationTokens));
        const cost = usageSliceCost(turn, slice, model, wholeTotal);
        const item =
          models.get(model) ||
          {
            model,
            usage: { input: 0, output: 0, cached: 0, cacheWriteTokens: 0, total: 0, exact: true },
            calls: 0,
            cost: 0,
            priced: true,
          };
        item.usage = addUsage(item.usage, usage);
        if (!tokenOnly) {
          item.calls += UTIL.toCount(slice.calls) || 1;
          item.cost += cost.value;
          item.priced = item.priced && cost.priced;
        }
        models.set(model, item);
        totals.totalTokens += UTIL.toCount(usage.total || usage.input + usage.output);
        totals.input += UTIL.toCount(usage.input);
        totals.output += UTIL.toCount(usage.output);
        totals.cacheRead += cacheRead;
        totals.cacheWrite += cacheWrite;
        totals.cacheWriteAvailable = totals.cacheWriteAvailable || turn?.cacheWriteAvailable === true || cacheWrite > 0;
        totals.regularInput += Math.max(0, UTIL.toCount(usage.input) - cacheRead - cacheWrite);
        if (!tokenOnly) {
          totals.calls += UTIL.toCount(slice.calls) || 1;
          totals.cost += cost.value;
          totals.priced = totals.priced && cost.priced;
        }
      }
    }
    totals.cacheHitRate = totals.input ? Math.round((totals.cacheRead / totals.input) * 100) : null;
    totals.activeDays = activeDays.size;
    totals.models = Array.from(models.values())
      .map((item) => ({
        ...item,
        tokens: UTIL.toCount(item.usage.total || item.usage.input + item.usage.output),
        share: totals.totalTokens ? (UTIL.toCount(item.usage.total || item.usage.input + item.usage.output) / totals.totalTokens) * 100 : 0,
      }))
      .sort((left, right) => right.cost - left.cost || right.tokens - left.tokens || left.model.localeCompare(right.model));
    return totals;
  }

  function buildAnalyticsRollup(turns) {
    const rollup = { version: 1, updatedAt: Date.now(), days: {} };
    // 跨午夜拆分：一次建索引，供本轮所有 turn 复用。
    const dayIndex = usageFactDayIndex();
    for (const turn of analyticsVisibleTurns(turns)) {
      const usage = normalizeUsage(turn?.usage);
      if (!usage.exact) continue;
      const model = UTIL.normalizeText(turn?.model, 120) || UNKNOWN_MODEL;
      const slices = usageDaySlicesFromIndex(dayIndex, turn);
      if (!slices.length) continue;
      const storedCost = storedTurnCost(turn);
      // 存储费用按各日 token 占比分摊（拆分 turn 一定是逐响应事实行，正常不含存储费用）。
      const wholeTotal = UTIL.toCount(usage.total || usage.input + usage.output);
      for (const slice of slices) {
        const date = slice.date;
        if (!date) continue;
        const day = (rollup.days[date] ||= { models: {} });
        const item = (day.models[model] ||= {
          usage: { input: 0, output: 0, cached: 0, cacheWriteTokens: 0, total: 0, exact: true },
          calls: 0,
          storedCostUsd: 0,
          storedCostCount: 0,
        });
        item.usage = addUsage(item.usage, slice.usage);
        item.calls += UTIL.toCount(slice.calls) || 1;
        if (storedCost != null) {
          const sliceTotal = UTIL.toCount(slice.usage.total || slice.usage.input + slice.usage.output);
          item.storedCostUsd += wholeTotal ? (storedCost * sliceTotal) / wholeTotal : storedCost / slices.length;
          item.storedCostCount += 1;
        }
      }
    }
    return rollup;
  }

  function pruneAnalyticsRollup(rollup, now = Date.now(), maxDays = ANALYTICS_MAX_DAYS) {
    const source = rollup && typeof rollup === "object" ? rollup : { version: 1, updatedAt: Date.now(), days: {} };
    const cutoff = new Date(startOfLocalDay(now));
    cutoff.setDate(cutoff.getDate() - (Math.max(1, maxDays) - 1));
    const days = {};
    for (const [date, value] of Object.entries(source.days || {})) {
      const timestamp = Date.parse(`${date}T00:00:00`);
      if (!Number.isFinite(timestamp) || timestamp < cutoff.getTime()) continue;
      days[date] = value;
    }
    return { version: 1, updatedAt: Date.now(), days };
  }

  function loadAnalyticsRollup() {
    if (state.analyticsRollupLoaded) return state.analyticsRollup || { version: 1, updatedAt: Date.now(), days: {} };
    state.analyticsRollupLoaded = true;
    const saved = UTIL.loadJson(ANALYTICS_ROLLUP_KEY, null);
    state.analyticsRollup = saved?.version === 1 && saved.days && typeof saved.days === "object" ? pruneAnalyticsRollup(saved) : null;
    if (!state.analyticsRollup) {
      ensureLocalLedgerLoaded();
      state.analyticsRollup = pruneAnalyticsRollup(buildAnalyticsRollup([...localUsageArchiveTurnsForAnalytics(), ...state.localLedger]));
      saveAnalyticsRollup(state.analyticsRollup);
    }
    return state.analyticsRollup;
  }

  function saveAnalyticsRollup(rollup) {
    const next = pruneAnalyticsRollup(rollup);
    state.analyticsRollup = next;
    state.analyticsRollupLoaded = true;
    let saved = false;
    for (const maxDays of ANALYTICS_ROLLUP_QUOTA_TRIM_DAYS) {
      const candidate = maxDays >= ANALYTICS_MAX_DAYS ? next : pruneAnalyticsRollup(next, Date.now(), maxDays);
      try {
        localStorage.setItem(ANALYTICS_ROLLUP_KEY, JSON.stringify(candidate));
        state.analyticsRollup = candidate;
        saved = true;
        break;
      } catch (error) {
        if (!isQuotaStorageError(error)) {
          state.analyticsRollupSaveError = "storage";
          break;
        }
      }
    }
    state.analyticsRollupSaveError = saved ? "" : state.analyticsRollupSaveError || "quota";
    return saved;
  }

  function rebuildAnalyticsRollup() {
    ensureLocalLedgerLoaded();
    return saveAnalyticsRollup(buildAnalyticsRollup([...localUsageArchiveTurnsForAnalytics(), ...state.localLedger]));
  }

  function refreshAnalyticsRollupDates(dates) {
    if (!state.analyticsRollupLoaded) return false;
    const targets = new Set((Array.isArray(dates) ? dates : [dates]).map((date) => UTIL.normalizeText(date, 10)).filter(Boolean));
    if (!targets.size) return false;
    const next = loadAnalyticsRollup();
    const dayIndex = usageFactDayIndex();
    const partial = buildAnalyticsRollup(
      [...localUsageArchiveTurnsForAnalytics(targets), ...state.localLedger].filter((turn) =>
        usageDaySlicesFromIndex(dayIndex, turn).some((slice) => targets.has(slice.date)),
      ),
    );
    for (const date of targets) {
      if (partial.days[date]) next.days[date] = partial.days[date];
      else delete next.days[date];
    }
    return saveAnalyticsRollup(next);
  }

  function analyticsTurnsFromRollup(rollup = loadAnalyticsRollup()) {
    const turns = [];
    for (const [date, day] of Object.entries(rollup?.days || {})) {
      for (const [model, item] of Object.entries(day?.models || {})) {
        turns.push({
          turnId: `analytics:${date}:${model}`,
          source: "analytics-rollup",
          createdAt: `${date}T12:00:00`,
          model,
          callCount: UTIL.toCount(item?.calls) || 1,
          usage: normalizeUsage(item?.usage),
          ...(UTIL.toCount(item?.storedCostCount) && Number(item?.storedCostUsd) > 0 ? { costUsd: Number(item.storedCostUsd) } : {}),
        });
      }
    }
    return turns;
  }

  function parseLocalDateInput(value) {
    const match = UTIL.normalizeText(value, 20).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return 0;
    const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    return Number.isFinite(date.getTime()) ? date.getTime() : 0;
  }

  function analyticsComparisonText(current, previous, options = {}) {
    if (options.disabled) return "部分统计";
    const value = Number(current);
    const before = Number(previous);
    if (!Number.isFinite(value) || !Number.isFinite(before)) return "暂无对比";
    // 上期覆盖不足：30 天前的窗口只剩两天归档时，百分比会是 +25604% 这种噪声。
    // 只有多日区间才判覆盖度（今日区间上期本来就是 0 天或 1 天）。
    const expectedDays = UTIL.toCount(options.expectedDays);
    const coveredDays = UTIL.toCount(options.coveredDays);
    if (expectedDays >= 3 && coveredDays < Math.ceil(expectedDays / 2)) {
      if (!before) return "暂无对比";
      return `上期仅 ${coveredDays} 天有数据`;
    }
    if (!before) return value ? "较上期新增" : "暂无对比";
    const percent = ((value - before) / before) * 100;
    if (Math.abs(percent) < 0.5) return "与上期持平";
    // 10% 以内保留一位小数：0.4% 与 3.2% 的差别不该被四舍五入成「持平」或「+3%」。
    const rounded = Math.abs(percent) < 10 ? Math.round(percent * 10) / 10 : Math.round(percent);
    return `较上期 ${rounded > 0 ? "+" : ""}${rounded}%`;
  }

  function analyticsChartBuckets(turns, range, metric = "tokens") {
    const startMs = UTIL.toTimestampMs(range?.startMs);
    const endMs = UTIL.toTimestampMs(range?.endMs);
    if (!startMs || !endMs || endMs < startMs) return [];
    const daySpan = Math.max(1, Math.ceil((endOfLocalDay(endMs) - startOfLocalDay(startMs) + 1) / 86_400_000));
    const mode = daySpan === 1 ? "hour" : daySpan <= 90 ? "day" : "week";
    const buckets = [];
    const bucketMap = new Map();
    if (mode === "hour") {
      for (let hour = 0; hour < 24; hour += 1) {
        const timestamp = startOfLocalDay(startMs) + hour * 3_600_000;
        const item = { key: `hour:${hour}`, label: `${String(hour).padStart(2, "0")}:00`, value: 0, timestamp };
        buckets.push(item);
        bucketMap.set(item.key, item);
      }
    } else {
      const cursor = new Date(startOfLocalDay(startMs));
      while (cursor.getTime() <= endMs) {
        const date = localDateKey(cursor.getTime());
        const weekIndex = Math.floor((cursor.getTime() - startOfLocalDay(startMs)) / (7 * 86_400_000));
        const key = mode === "week" ? `week:${weekIndex}` : `day:${date}`;
        if (!bucketMap.has(key)) {
          const item = { key, label: mode === "week" ? `${date} 起` : date.slice(5), value: 0, timestamp: cursor.getTime() };
          buckets.push(item);
          bucketMap.set(key, item);
        }
        cursor.setDate(cursor.getDate() + 1);
      }
    }
    // 跨午夜拆分：一次建索引，供本批 turn 复用。
    const dayIndex = usageFactDayIndex();
    for (const turn of Array.isArray(turns) ? turns : []) {
      const usage = normalizeUsage(turn?.usage);
      if (!usage.exact) continue;
      const slices = usageDaySlicesFromIndex(dayIndex, turn);
      if (!slices.length) continue;
      const wholeTotal = UTIL.toCount(usage.total || usage.input + usage.output);
      for (const slice of slices) {
        // 跨午夜的 turn 按各分片自己的时间落桶；单日 turn 保持原有口径（用 turn 时间戳），
        // 避免把既有图表的小时分布整体改掉。
        const timestamp = slices.length > 1 ? slice.firstMs : analyticsTurnTimestampMs(turn);
        if (!timestamp || timestamp < startMs || timestamp > endMs) continue;
        const date = new Date(timestamp);
        const key =
          mode === "hour"
            ? `hour:${date.getHours()}`
            : mode === "week"
              ? `week:${Math.floor((startOfLocalDay(timestamp) - startOfLocalDay(startMs)) / (7 * 86_400_000))}`
              : `day:${localDateKey(timestamp)}`;
        const bucket = bucketMap.get(key);
        if (!bucket) continue;
        if (metric === "cost") {
          bucket.value += slices.length > 1 ? usageSliceCost(turn, slice, turn?.model, wholeTotal).value : turnCost(turn, turn?.model).value;
        } else {
          const sliceUsage = slices.length > 1 ? normalizeUsage(slice.usage) : usage;
          bucket.value += UTIL.toCount(sliceUsage.total || sliceUsage.input + sliceUsage.output);
        }
      }
    }
    return buckets;
  }

  function analyticsChartSvg(turns, range, metric = "tokens") {
    const buckets = analyticsChartBuckets(turns, range, metric);
    const width = 720;
    const height = 230;
    const inset = { top: 36, right: 10, bottom: 34, left: 44 };
    const chartHeight = height - inset.top - inset.bottom;
    const max = Math.max(1, ...buckets.map((item) => item.value));
    const gap = buckets.length > 60 ? 1 : buckets.length > 30 ? 2 : 4;
    const stagger = buckets.length > 60 ? 12 : buckets.length > 30 ? 16 : 20;
    const barWidth = Math.max(2, (width - inset.left - inset.right - gap * Math.max(0, buckets.length - 1)) / Math.max(1, buckets.length));
    const labelEvery = Math.max(1, Math.ceil(buckets.length / 7));
    const hasData = buckets.some((item) => item.value > 0);
    const grid = hasData
      ? [0, 0.5, 1]
          .map((ratio) => {
            const y = inset.top + chartHeight - ratio * chartHeight;
            const display = metric === "cost" ? fmtMoney(max * ratio) : fmtCount(max * ratio);
            return `<line x1="${inset.left}" y1="${y}" x2="${width - inset.right}" y2="${y}"></line><text x="${inset.left - 6}" y="${y - 4}" text-anchor="end">${escapeHtml(display)}</text>`;
          })
          .join("")
      : "";
    const bars = buckets
      .map((item, index) => {
        const barHeight = item.value ? Math.max(2, (item.value / max) * chartHeight) : 1;
        const x = inset.left + index * (barWidth + gap);
        const y = inset.top + chartHeight - barHeight;
        const display = metric === "cost" ? fmtMoney(item.value) : fmtCount(item.value);
        const tooltipWidth = Math.max(44, display.length * 7 + 12);
        const tooltipX = Math.max(2, Math.min(width - tooltipWidth - 2, x + barWidth / 2 - tooltipWidth / 2));
        const tooltipY = Math.max(2, y - 25);
        const label = index % labelEvery === 0 || index === buckets.length - 1 ? `<text x="${x + barWidth / 2}" y="${height - 10}" text-anchor="middle">${escapeHtml(item.label)}</text>` : "";
        if (!hasData) return label;
        return `<g class="cltc-analytics-bar">
          <rect tabindex="${index === 0 ? "0" : "-1"}" role="graphics-symbol" aria-label="${escapeHtml(`${item.label}，${display}`)}" data-chart-index="${index}" style="--cltc-chart-bar-delay:${index * stagger}ms" x="${x}" y="${y}" width="${barWidth}" height="${barHeight}" rx="2"><title>${escapeHtml(`${item.label} · ${display}`)}</title></rect>
          <g class="cltc-analytics-tooltip" aria-hidden="true">
            <rect x="${tooltipX}" y="${tooltipY}" width="${tooltipWidth}" height="20" rx="5"></rect>
            <text x="${tooltipX + tooltipWidth / 2}" y="${tooltipY + 14}" text-anchor="middle">${escapeHtml(display)}</text>
          </g>
          ${label}
        </g>`;
      })
      .join("");
    const empty = hasData ? "" : `<text class="cltc-analytics-chart-empty" x="${width / 2}" y="${inset.top + chartHeight / 2}" text-anchor="middle" dominant-baseline="middle">暂无数据</text>`;
    return `<svg class="cltc-analytics-chart" data-analytics-chart="true" viewBox="0 0 ${width} ${height}" role="graphics-document" aria-label="${metric === "cost" ? "花费趋势" : "Token 趋势"}">${empty}<g class="cltc-analytics-grid" aria-hidden="true">${grid}</g>${bars}</svg>`;
  }

  function usageAnalyticsHtml(options = {}) {
    ensureLocalLedgerLoaded();
    const now = UTIL.toTimestampMs(options.now) || Date.now();
    const preset = ["today", "7d", "30d", "custom"].includes(options.preset) ? options.preset : state.analyticsPreset;
    const customStart = options.customStart || state.analyticsCustomStart;
    const customEnd = options.customEnd || state.analyticsCustomEnd;
    const range = analyticsRangeForPreset(preset, now, { start: parseLocalDateInput(customStart), end: parseLocalDateInput(customEnd) });
    const previousRange = analyticsComparisonRange(range, preset);
    const sourceTurns =
      Array.isArray(options.turns)
        ? options.turns
        : mergeProfileLedgerTurns(
            mergeCodexppHistoryTurns(
              preset === "today"
                ? [...localUsageArchiveTurnsForAnalytics([localDateKey(now)]), ...state.localLedger]
                : [...localUsageArchiveTurnsForAnalytics(), ...state.localLedger],
            ),
          );
    const turns = analyticsVisibleTurns(sourceTurns);
    const model = options.model ?? state.analyticsModel;
    // hideUnknown 既可来自 state（用户点「隐藏未知」），也可由测试显式传入。
    const hideUnknown = typeof options.hideUnknown === "boolean" ? options.hideUnknown : state.analyticsHideUnknown;
    const filtered = model ? turns.filter((turn) => UTIL.normalizeText(turn?.model, 120) === model) : turns;
    const current = aggregateUsageAnalytics(filtered, range);
    const previous = aggregateUsageAnalytics(filtered, previousRange);
    const metric = options.metric === "cost" || state.analyticsMetric === "cost" ? "cost" : "tokens";
    const comparisonTone = (key, currentValue, previousValue) => {
      if (!Number.isFinite(currentValue) || !Number.isFinite(previousValue) || previousValue === 0 || currentValue === previousValue) return "neutral";
      const up = currentValue > previousValue;
      if (key === "cost") return up ? "bad" : "good";
      if (key === "cache") return up ? "good" : "bad";
      return "neutral";
    };
    // 上期覆盖度：区间跨度天数 vs 真正有数据的天数，用来判断上期样本够不够比。
    const previousExpectedDays = previousRange.startMs
      ? Math.max(1, Math.round((endOfLocalDay(previousRange.endMs) - startOfLocalDay(previousRange.startMs) + 86_400_000) / 86_400_000))
      : 0;
    const comparisonOptions = { expectedDays: previousExpectedDays, coveredDays: previous.activeDays };
    const metricRow = (label, value, comparison, incomplete = false, tone = "neutral") => `
      <div class="cltc-analytics-metric">
        <span>${label}</span>
        <strong>${value}</strong>
        <small data-tone="${tone}">${analyticsComparisonText(comparison.current, comparison.previous, { disabled: incomplete, ...comparisonOptions })}</small>
      </div>`;
    const composition = [
      ["常规输入", current.regularInput, "neutral", true],
      ["输出", current.output, "green", true],
      ["读缓存", current.cacheRead, "blue", true],
      ["写缓存", current.cacheWrite, "purple", current.cacheWriteAvailable],
    ];
    const compositionTotal = composition.reduce((sum, item) => sum + (item[3] ? item[1] : 0), 0);
    const unknownModelPresent = current.models.some((item) => item.model === UNKNOWN_MODEL);
    const visibleModels = current.models.filter((item) => !(hideUnknown && item.model === UNKNOWN_MODEL));
    const modelRows = visibleModels
      .slice()
      .sort((left, right) => (left.model === UNKNOWN_MODEL) - (right.model === UNKNOWN_MODEL) || right.cost - left.cost || right.tokens - left.tokens)
      .map((item, index) => {
        // 「未知」不是模型识别失败，而是旧账本迁移时就没有 model 字段：行内必须说清楚。
        const unknown = item.model === UNKNOWN_MODEL;
        const label = unknown ? `${item.model}（历史）` : item.model;
        const title = unknown ? "未知：旧账本迁移时缺少模型字段，无法回填（不是模型识别失败）" : item.model;
        return `<button type="button" class="cltc-analytics-model-row" data-analytics-model="${escapeHtml(item.model)}" data-hidden="${String(index >= 10 && !state.analyticsModelsExpanded)}">
          <span title="${escapeHtml(title)}">${escapeHtml(label)}</span>
          <span>${fmtCount(item.tokens)}</span>
          <span>${fmtCount(item.calls)}</span>
          <span>${item.priced ? fmtMoney(item.cost) : `${fmtMoney(item.cost)} · 部分`}</span>
          <span class="cltc-analytics-share" style="--cltc-share:${Math.max(0, Math.min(100, Math.round(item.share)))}%">${Math.round(item.share)}%</span>
        </button>`;
      })
      .join("");
    return `
      <section class="cltc-settings-section cltc-analytics" data-analytics-preset="${preset}" data-analytics-model-filter="${escapeHtml(model)}">
        <div class="cltc-settings-section-heading cltc-analytics-heading">
          <div><h2>使用统计</h2><p>基于 HUD、Profile 与本地 ledger 的同一去重口径</p></div>
          ${model ? `<button type="button" class="cltc-analytics-filter" data-action="clear-analytics-model">${escapeHtml(model)} ×</button>` : ""}
        </div>
        <div class="cltc-analytics-toolbar">
          <div class="cltc-segmented" data-cltc-segment-index="${["today", "7d", "30d", "custom"].indexOf(preset)}" role="group" aria-label="统计时间范围">
            <button type="button" data-analytics-preset="today" data-active="${String(preset === "today")}" aria-pressed="${String(preset === "today")}">今日</button>
            <button type="button" data-analytics-preset="7d" data-active="${String(preset === "7d")}" aria-pressed="${String(preset === "7d")}">7 天</button>
            <button type="button" data-analytics-preset="30d" data-active="${String(preset === "30d")}" aria-pressed="${String(preset === "30d")}">30 天</button>
            <button type="button" data-analytics-preset="custom" data-active="${String(preset === "custom")}" aria-pressed="${String(preset === "custom")}">自定义</button>
          </div>
          <div class="cltc-analytics-date-range"${preset === "custom" ? "" : " hidden"}>
            <button type="button" class="cltc-date-range-trigger" data-action="open-analytics-calendar" data-empty="${customStart && customEnd ? "false" : "true"}">
              <svg class="cltc-date-range-icon" viewBox="0 0 16 16" aria-hidden="true" focusable="false"><rect x="2.25" y="3.75" width="11.5" height="9.5" rx="2.25"/><path d="M2.25 6.75h11.5"/><path d="M5.5 2.25v3"/><path d="M10.5 2.25v3"/></svg>
              <span class="cltc-date-range-label">${customStart && customEnd ? `${escapeHtml(customStart)} – ${escapeHtml(customEnd)}` : "选择日期范围"}</span>
              <svg class="cltc-date-range-chevron" viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M4.5 6.25l3.5 3.5 3.5-3.5"/></svg>
            </button>
            ${preset === "custom" && customStart && customEnd ? `<button type="button" class="cltc-date-range-clear" data-action="clear-analytics-range">清除</button>` : ""}
            <input class="cltc-analytics-date-input" data-analytics-date-input type="text" tabindex="-1" aria-hidden="true">
          </div>
        </div>
        <div class="cltc-analytics-metrics">
          ${metricRow("总 Token", fmtCount(current.totalTokens), { current: current.totalTokens, previous: previous.totalTokens }, false, comparisonTone("tokens", current.totalTokens, previous.totalTokens))}
          ${metricRow("总花费", fmtMoney(current.cost), { current: current.cost, previous: previous.cost }, !current.priced || !previous.priced, comparisonTone("cost", current.cost, previous.cost))}
          ${metricRow("模型调用", fmtCount(current.calls), { current: current.calls, previous: previous.calls }, false, comparisonTone("calls", current.calls, previous.calls))}
          ${metricRow("缓存命中率", current.cacheHitRate == null ? "—" : `${current.cacheHitRate}%`, { current: current.cacheHitRate, previous: previous.cacheHitRate }, current.cacheHitRate == null, comparisonTone("cache", current.cacheHitRate, previous.cacheHitRate))}
        </div>
        <div class="cltc-analytics-split">
          <div class="cltc-analytics-section">
            <div class="cltc-analytics-section-head">
              <div><h3>趋势</h3><p>${preset === "today" ? "按小时" : Math.ceil((range.endMs - range.startMs) / 86_400_000) + 1 > 90 ? "按周" : "按日"}</p></div>
              <div class="cltc-segmented cltc-segmented-compact" data-cltc-segment-index="${metric === "cost" ? 1 : 0}" role="group" aria-label="趋势指标">
                <button type="button" data-analytics-metric="tokens" data-active="${String(metric === "tokens")}" aria-pressed="${String(metric === "tokens")}">Token</button>
                <button type="button" data-analytics-metric="cost" data-active="${String(metric === "cost")}" aria-pressed="${String(metric === "cost")}">花费</button>
              </div>
            </div>
            ${analyticsChartSvg(filtered, range, metric)}
          </div>
          <div class="cltc-analytics-section">
            <div class="cltc-analytics-section-head"><div><h3>Token 构成</h3><p>输入构成互斥计算</p></div><strong>${fmtCount(compositionTotal)}</strong></div>
            <div class="cltc-composition-bar" aria-label="Token 构成">
              ${composition
                .filter((item) => item[3])
                .map(([label, value, tone]) => `<span data-tone="${tone}" style="flex-grow:${value}" title="${label} · ${fmtCount(value)}"></span>`)
                .join("")}
            </div>
            <div class="cltc-composition-legend">
              ${composition.map(([label, value, tone, available]) => `<span><i data-tone="${tone}"></i>${label}<strong>${available ? `${fmtCount(value)} · ${compositionTotal ? Math.round((value / compositionTotal) * 100) : 0}%` : "未提供"}</strong></span>`).join("")}
            </div>
          </div>
        </div>
        <div class="cltc-analytics-section">
          <div class="cltc-analytics-section-head">
            <div><h3>模型明细</h3><p>点击模型可联动筛选整页${unknownModelPresent ? " · 「未知」= 旧账本迁移时缺少模型字段，不可回填" : ""}</p></div>
            ${unknownModelPresent ? `<button type="button" class="cltc-analytics-expand" data-action="toggle-analytics-unknown">${hideUnknown ? "显示未知" : "隐藏未知"}</button>` : ""}
          </div>
          <div class="cltc-analytics-model-head"><span>模型</span><span>Token</span><span>模型调用</span><span>花费</span><span>占比</span></div>
          <div class="cltc-analytics-models">${modelRows || `<div class="cltc-analytics-empty">当前范围内暂无真实模型调用</div>`}</div>
          ${current.models.length > 10 ? `<button type="button" class="cltc-analytics-expand" data-action="toggle-analytics-models">${state.analyticsModelsExpanded ? "收起" : `查看全部 ${current.models.length} 个模型`}</button>` : ""}
        </div>
      </section>
    `;
  }

  // ---------------------------------------------------------------------------
  // 模块 19：会话汇总与快照
  // liveSnapshot() 是渲染唯一入口；localDailyUsage() 带 revision 缓存。
  // ---------------------------------------------------------------------------
  function turnListCost(turns, fallbackUsage, fallbackModel = modelName()) {
    const items = Array.isArray(turns) ? turns : [];
    if (!items.length) return costForModelUsage(fallbackUsage, fallbackModel);
    let byModel = state.sessionCostCache.get(items);
    if (!byModel) {
      byModel = new Map();
      state.sessionCostCache.set(items, byModel);
    }
    const cached = byModel.get(fallbackModel);
    if (cached) return cached;
    const value = items.reduce(
      (sum, turn) => {
        const cost = turnCost(turn, fallbackModel);
        sum.value += cost.value;
        sum.priced = sum.priced && cost.priced;
        return sum;
      },
      { value: 0, priced: true },
    );
    byModel.set(fallbackModel, value);
    return value;
  }

  function mainEditable() {
    const now = Date.now();
    if (state.mainEditable && now - state.mainEditableAt < 1000 && state.mainEditable.isConnected !== false) return state.mainEditable;
    let nodes = [];
    try {
      nodes = Array.from(document.querySelectorAll("textarea,[contenteditable='true']"));
    } catch {
      nodes = [];
    }
    const height = window.innerHeight || document.documentElement?.clientHeight || 1000;
    const candidates = nodes
      .filter((node) => !state.root?.contains?.(node))
      .map((node) => ({ node, rect: node.getBoundingClientRect?.() || { width: 0, height: 0, bottom: 0, top: 0 } }))
      .filter(({ rect }) => rect.width >= 240 && rect.height >= 20 && rect.bottom > 0 && rect.top < height)
      .sort((a, b) => b.rect.bottom - a.rect.bottom);
    state.mainEditable = candidates[0]?.node || null;
    state.mainEditableAt = now;
    return state.mainEditable;
  }

  function isEditableTarget(target) {
    const editable = mainEditable();
    const closest = target?.closest?.("textarea,[contenteditable='true']");
    return Boolean(editable && (target === editable || closest === editable || editable.contains?.(target)));
  }

  function isMainComposerSurfaceTarget(target) {
    const editable = mainEditable();
    if (!editable || !target) return false;
    if (target === editable || editable.contains?.(target) || target.contains?.(editable)) return true;
    const form = editable.closest?.("form");
    if (form?.contains?.(target)) return true;
    const explicitSurface = editable.closest?.(".composer-surface-chrome,[data-codex-composer-surface],[data-testid*='composer']");
    if (explicitSurface?.contains?.(target)) return true;
    let node = editable.parentElement;
    for (let depth = 0; node && depth < 8; depth++) {
      if (node === document.body || node === document.documentElement || String(node.tagName || "").toUpperCase() === "MAIN") return false;
      if (node.contains?.(target)) return true;
      node = node.parentElement;
    }
    return false;
  }

  function rememberSidebarThreadClick(event) {
    if (event?.type !== "click") return;
    const threadKey = sidebarThreadKeyFromNode(event.target);
    if (!threadKey) return;
    state.newConversationSessionKey = "";
    state.newConversationSessionKeyAt = 0;
    state.lastClickedSidebarThreadKey = resolveSessionKey(threadKey);
    state.lastClickedSidebarThreadAt = Date.now();
    state.userSelectedSidebarThreadKey = state.lastClickedSidebarThreadKey;
    state.userSelectedSidebarThreadAt = state.lastClickedSidebarThreadAt;
    invalidateSessionKeyCache();
    syncActiveLocalCurrentTurn();
    syncActiveTurnShimmerState();
    scheduleRender(0);
  }

  function rememberNewConversationClick(event) {
    if (event?.type !== "click") return false;
    const target = event.target?.closest?.("button,a,[role='button'],[aria-label],[title]") || event.target;
    const label = UTIL.normalizeText(`${target?.getAttribute?.("aria-label") || ""} ${target?.getAttribute?.("title") || ""} ${target?.textContent || target?.innerText || ""}`, 160);
    if (!/(new\s*(chat|conversation|thread|task)|新建|新对话|新会话|新任务|新的对话|新的会话)/i.test(label)) return false;
    state.lastClickedSidebarThreadKey = "";
    state.lastClickedSidebarThreadAt = 0;
    state.userSelectedSidebarThreadKey = "";
    state.userSelectedSidebarThreadAt = 0;
    state.detectedSessionKey = "";
    state.detectedSessionKeyAt = 0;
    state.newConversationSessionKey = `new:${Date.now().toString(36)}`;
    state.newConversationSessionKeyAt = Date.now();
    invalidateSessionKeyCache();
    scheduleRender(0);
    return true;
  }

  function handleDocumentClick(event) {
    if (rememberNewConversationClick(event)) return;
    rememberSidebarThreadClick(event);
    // 只有设置页打开时才需要清理导航栏激活态；普通对话点击不再做全量 nav 查询。
    if (state.embeddedPageContainer || state.priceEditorOpen) clearEmbeddedRailActiveAfterNavigation(event);
  }

  function clearEmbeddedRailActiveAfterNavigation(event) {
    const clicked = event.target?.closest?.("nav[data-app-navigation-rail] button[aria-label]");
    if (clicked && (clicked.getAttribute("aria-label") || "") === "Codex Token Cost") return;
    clearEmbeddedRailActive();
  }

  function liveSnapshot() {
    const sessionKey = currentSessionKey();
    const domRunState = officialComposerRunState();
    reconcileRunningWithComposerDom(sessionKey, domRunState);
    syncActiveLocalCurrentTurn();
    syncActiveTurnShimmerState();
    migrateLegacyLocationSessionTurns(sessionKey);
    if (!localCurrentTurn(sessionKey)) restoreRunningCurrentTurnFromLast(sessionKey);
    const source = readTokenUsage();
    const turns = currentSessionTurns(state.localLedger, sessionKey);
    const lastTurn = sameSessionKey(turnSessionKey(source.last), sessionKey) ? source.last : turns[turns.length - 1] || null;
    const currentTurn = sameSessionKey(source.currentTurn?.sessionKey, sessionKey) ? source.currentTurn : null;
    const modelInfo = activeModelInfo();
    const model = modelInfo.model;
    const displayModel = modelInfo.displayModel || model;
    const price = priceFor(model);
    const currentTurnUsage = normalizeUsage(currentTurn?.usage);
    const exactLast = normalizeUsage(lastTurn?.usage);
    const exactTurnId = lastTurn?.turnId || "";
    const hasNewExact = exactLast.exact && exactTurnId && exactTurnId !== state.lastExactTurnId;
    if (hasNewExact) state.lastExactTurnId = exactTurnId;

    const running = domRunState === true || isTurnShimmerRunning(sessionKey) || isOfficialThreadRunning(sessionKey);
    state.running = running;

    const zeroCurrent = { input: 0, output: 0, cached: 0, total: 0, exact: true };
    const current = currentTurnUsage.exact ? currentTurnUsage : running && !hasNewExact ? zeroCurrent : exactLast.exact ? exactLast : zeroCurrent;
    const confidence = "exact";

    const session = sessionUsage(turns);
    const lastIsInTurns = current.exact && turnUsageKeySet(turns).has(usageKey(current));
    const accountedSession = current.exact && !lastIsInTurns ? addUsage(session, current) : session;
    const displaySession = accountedSession;
    const sessionCostBase = turnListCost(turns, displaySession, model);
    const sessionCost = current.exact && currentTurn && !lastIsInTurns
      ? (() => {
          const currentCost = turnCost(currentTurn, model);
          return { value: sessionCostBase.value + currentCost.value, priced: sessionCostBase.priced && currentCost.priced };
        })()
      : sessionCostBase;
    const dailyUsage = localDailyUsage();
    const dayCost = todayCost(dailyUsage);
    const dayUsage = todayUsage(dailyUsage);
    const fastMode = state.detectedFastMode === true;
    const outputRateEnabled = outputRateVisible();
    const rate = outputRateEnabled ? outputTokenRate(currentTurn, running) : { active: false, visible: false, value: 0 };
    const averageRate = outputRateEnabled ? averageOutputTokenRate(lastTurn, running) : { visible: false, value: 0 };
    return { current, session: displaySession, turns: turns.length, sessionKey, model, displayModel, modelInfo, price, sessionCost, dayCost, dayUsage, confidence, running, fastMode, outputRateEnabled, rate, averageRate };
  }

  function emptyDailyUsageBucket(date = "") {
    return { date, tokens: 0, input: 0, output: 0, cached: 0, requests: 0, cost: 0, priced: true };
  }

  function addTurnToDailyBucket(bucket, turn, usage, options = {}) {
    const model = turn.model || modelName();
    const cost = calcCost(usage, priceFor(model), { fastMode: turn.fastMode === true, model });
    const storedCost = storedTurnCost(turn);
    const hasStoredCost = storedCost != null;
    const resolvedCost = options.costUsd != null ? Number(options.costUsd) || 0 : hasStoredCost ? storedCost : cost.value;
    const priced = options.costUsd != null ? true : hasStoredCost || cost.priced;
    bucket.tokens += UTIL.toCount(usage.total || usage.input + usage.output);
    bucket.input += UTIL.toCount(usage.input);
    bucket.output += UTIL.toCount(usage.output);
    bucket.cached += UTIL.toCount(usage.cached);
    bucket.requests += options.calls != null ? UTIL.toCount(options.calls) || 1 : UTIL.toCount(turn.callCount) || 1;
    bucket.cost += resolvedCost;
    bucket.priced = bucket.priced !== false && priced;
    return bucket;
  }

  // 跨午夜拆分用的分片入桶：费用按分片用量单独计价（实测与整轮计价完全相等）。
  function addTurnSliceToDailyBucket(bucket, turn, slice, totalTokens) {
    const storedCost = storedTurnCost(turn);
    if (storedCost == null) return addTurnToDailyBucket(bucket, turn, slice.usage, { calls: slice.calls });
    const sliceTotal = UTIL.toCount(slice.usage.total || slice.usage.input + slice.usage.output);
    const share = totalTokens ? (storedCost * sliceTotal) / totalTokens : 0;
    return addTurnToDailyBucket(bucket, turn, slice.usage, { calls: slice.calls, costUsd: share });
  }

  function turnTimestampMs(turn) {
    const direct = UTIL.toCount(turn?.observedAt || turn?.startedAt || turn?.finishedAt || turn?.createdAt);
    if (direct) return direct;
    const parsed = Date.parse(turn?.observedAt || turn?.startedAt || turn?.finishedAt || turn?.createdAt || "");
    return Number.isFinite(parsed) ? parsed : 0;
  }

  // HUD 日桶按 turn 求和，必须先去重：同 turnId 以账本行覆盖归档行；
  // 不同 turnId 但 response_id 重叠（实时行 vs rollout 行）只保留先出现的一条。
  function usageUniqueTurnsForTotals(turns) {
    const byTurn = new Map();
    const ordered = [];
    for (const turn of Array.isArray(turns) ? turns : []) {
      const turnId = UTIL.normalizeText(turn?.turnId || turn?.id, 120);
      if (!turnId) {
        ordered.push(turn);
        continue;
      }
      const previous = byTurn.get(turnId);
      if (previous) {
        const index = ordered.indexOf(previous);
        if (index >= 0) ordered[index] = turn;
      } else {
        ordered.push(turn);
      }
      byTurn.set(turnId, turn);
    }
    const claimedResponses = new Set();
    const out = [];
    for (const turn of ordered) {
      const ids = usageTurnResponseIdList(turn);
      if (ids.some((responseId) => claimedResponses.has(responseId))) continue;
      for (const responseId of ids) claimedResponses.add(responseId);
      out.push(turn);
    }
    return out;
  }

  function localDailyUsage(options = {}) {
    ensureLocalLedgerLoaded();
    const activeCurrentTurn = localCurrentTurn(currentSessionKey());
    const cached = state.localDailyUsageCache;
    if (cached?.revision === state.localLedgerRevision && !activeCurrentTurn && cached.value) return cached.value;
    const byDayModel = cached?.revision === state.localLedgerRevision
      ? new Map(cached.groups)
      : new Map();
    const ledgerTurnIds = cached?.revision === state.localLedgerRevision ? cached.turnIds : new Set();
    if (!cached || cached.revision !== state.localLedgerRevision) {
      // 跨午夜拆分：一次建索引，供本批 turn 复用。
      const dayIndex = usageFactDayIndex();
      for (const turn of usageUniqueTurnsForTotals([...localUsageArchiveTurns(), ...state.localLedger])) {
        const usage = normalizeUsage(turn?.usage);
        if (!usage.exact) continue;
        const turnId = UTIL.normalizeText(turn?.turnId || turn?.id, 120);
        if (turnId) ledgerTurnIds.add(turnId);
        const wholeTotal = UTIL.toCount(usage.total || usage.input + usage.output);
        for (const slice of usageDaySlicesFromIndex(dayIndex, turn)) {
          const date = slice.date;
          if (!date) continue;
          const group = byDayModel.get(date) || { date, bucket: emptyDailyUsageBucket(date) };
          addTurnSliceToDailyBucket(group.bucket, turn, slice, wholeTotal);
          byDayModel.set(date, group);
        }
      }
      state.localDailyUsageCache = { revision: state.localLedgerRevision, groups: byDayModel, turnIds: ledgerTurnIds, value: null };
    }
    const currentMetric = localTurnMetric(activeCurrentTurn);
    if (currentMetric && !ledgerTurnIds.has(currentMetric.turnId)) {
      const date = localDateKey(turnTimestampMs(currentMetric) || Date.now());
      const baseGroup = byDayModel.get(date) || { date, bucket: emptyDailyUsageBucket(date) };
      const group = { date, bucket: { ...baseGroup.bucket } };
      addTurnToDailyBucket(group.bucket, currentMetric, normalizeUsage(currentMetric.usage));
      byDayModel.set(date, group);
    }
    const days = new Map();
    for (const group of byDayModel.values()) {
      days.set(group.date, group.bucket);
    }
    if (!activeCurrentTurn && state.localDailyUsageCache) state.localDailyUsageCache.value = days;
    return days;
  }
  function invalidateLocalUsageCache() {
    state.localLedgerRevision += 1;
    state.localDailyUsageCache = null;
    state.sessionUsageCache = new WeakMap();
    state.sessionCostCache = new WeakMap();
    state.sessionUsageKeyCache = new WeakMap();
  }

  // ---------------------------------------------------------------------------
  // 模块 20：profile 请求补丁
  // patchProfileRequestClient / installProfileAuthContextPatch / installProfileMessageIntercept。
  // ---------------------------------------------------------------------------
  function localProfileThreadCount() {
    ensureProfileLedgerLoaded();
    return new Set(state.profileLedger?.rollup?.threadKeys || []).size;
  }

  function localProfilePrefs() {
    if (state.profilePrefs) return state.profilePrefs;
    const saved = UTIL.loadJson(PROFILE_PREFS_KEY, {});
    const overrides = UTIL.loadJson(PROFILE_OVERRIDES_KEY, {});
    const overrideEmail = validProfileEmail(overrides.email);
    if (overrideEmail && !validProfileEmail(UTIL.loadJson(PROFILE_DEFAULTS_KEY, {}).email)) saveProfileDefaultEmail(overrideEmail);
    const defaultEmail = profileDefaultEmail();
    const username = profileUsernameAllowed(saved.username) ? stripProfileUsername(saved.username) : "codex-local-usage";
    const plan = normalizeProfilePlan(saved.planType ?? saved.plan, saved.planLabel);
    const rawImageUrl = UTIL.normalizeText(saved.imageUrl, PROFILE_IMAGE_MAX_LENGTH);
    const imageUrl = normalizeProfileImageUrl(rawImageUrl);
    const savedEmail = validProfileEmail(saved.email);
    if (savedEmail && savedEmail !== LOCAL_PROFILE_EMAIL && defaultEmail === LOCAL_PROFILE_EMAIL) saveProfileDefaultEmail(savedEmail);
    const email = savedEmail && !(savedEmail === LOCAL_PROFILE_EMAIL && defaultEmail !== LOCAL_PROFILE_EMAIL) ? savedEmail : defaultEmail;
    if (rawImageUrl && imageUrl && imageUrl !== rawImageUrl) {
      try {
        localStorage.setItem(PROFILE_PREFS_KEY, JSON.stringify({ ...saved, imageUrl }));
      } catch {
        // Keep the repaired value in memory even if persistence fails.
      }
    }
    state.profilePrefs = {
      displayName: UTIL.normalizeText(saved.displayName, 64) || "Local Usage",
      username,
      email,
      accountStructure: normalizeProfileAccountStructure(saved.accountStructure ?? saved.structure),
      workspaceName: normalizeProfileWorkspaceName(saved.workspaceName),
      planType: plan.planType,
      planLabel: plan.planLabel,
      imageUrl,
    };
    if (saved.email !== email) {
      try {
        localStorage.setItem(PROFILE_PREFS_KEY, JSON.stringify({ ...saved, email }));
      } catch {
        // Keep default-backed email active in memory even if repair fails.
      }
    }
    return state.profilePrefs;
  }

  function saveLocalProfilePrefs(prefs, options = {}) {
    const plan = normalizeProfilePlan(prefs?.planType ?? prefs?.plan, prefs?.planLabel);
    const next = {
      displayName: UTIL.normalizeText(prefs?.displayName, 64) || "Local Usage",
      username: profileUsernameAllowed(prefs?.username) ? stripProfileUsername(prefs.username) : "codex-local-usage",
      email: normalizeProfileEmail(prefs?.email, profileDefaultEmail()),
      accountStructure: normalizeProfileAccountStructure(prefs?.accountStructure ?? prefs?.structure),
      workspaceName: normalizeProfileWorkspaceName(prefs?.workspaceName),
      planType: plan.planType,
      planLabel: plan.planLabel,
      imageUrl: normalizeProfileImageUrl(prefs?.imageUrl),
    };
    try {
      localStorage.setItem(PROFILE_PREFS_KEY, JSON.stringify(next));
    } catch (error) {
      if (isProfileStorageQuotaError(error)) throw profileStorageQuotaError(error);
      throw error;
    }
    if (options.profileEditor) saveProfileDefaultEmail(next.email);
    state.profilePrefs = next;
    syncProfileUsageQueryCache();
    syncProfileAccountInfoQueryCache();
    scheduleSidebarProfileIdentitySync(0);
    void scheduleProfileAccountsCheckRefresh();
    return next;
  }

  function extractProfilePhotoDataUrl(uploadBody) {
    if (!uploadBody) return "";
    let multipart = "";
    try {
      multipart = atob(String(uploadBody));
    } catch {
      multipart = String(uploadBody);
    }
    const headerEnd = multipart.indexOf("\r\n\r\n");
    if (headerEnd < 0) return "";
    const headers = multipart.slice(0, headerEnd);
    const contentType = headers.match(/Content-Type:\s*([^\r\n;]+)/i)?.[1]?.trim() || "image/jpeg";
    if (!/^image\//i.test(contentType)) return "";
    const bodyStart = headerEnd + 4;
    const bodyEnd = multipart.indexOf("\r\n--", bodyStart);
    const fileBinary = multipart.slice(bodyStart, bodyEnd >= 0 ? bodyEnd : undefined);
    return fileBinary ? `data:${contentType};base64,${binaryStringToBase64(fileBinary)}` : "";
  }

  function applyLocalProfilePhotoUpload(uploadBody) {
    const imageUrl = extractProfilePhotoDataUrl(uploadBody);
    if (!imageUrl) return localProfilePrefs();
    const persist = (optimizedImageUrl) =>
      saveLocalProfilePrefs({
        ...localProfilePrefs(),
        imageUrl: optimizedImageUrl,
      });
    if (imageUrl.length <= PROFILE_IMAGE_UPLOAD_TARGET_LENGTH) return persist(imageUrl);
    return optimizeProfileImageDataUrl(imageUrl).then(persist);
  }

  function normalizeProfilePatchPayload(rawPatch) {
    const raw = typeof rawPatch === "string" ? UTIL.loadJsonFromString(rawPatch, {}) : rawPatch || {};
    let patch = raw;
    if (typeof patch.bodyJsonString === "string") patch = UTIL.loadJsonFromString(patch.bodyJsonString, {});
    if (patch && typeof patch === "object" && Object.prototype.hasOwnProperty.call(patch, "body")) {
      patch = typeof patch.body === "string" ? UTIL.loadJsonFromString(patch.body, {}) : patch.body || {};
    }
    if (patch && typeof patch === "object" && Object.prototype.hasOwnProperty.call(patch, "requestBody")) {
      patch = typeof patch.requestBody === "string" ? UTIL.loadJsonFromString(patch.requestBody, {}) : patch.requestBody || {};
    }
    if (patch?.profile && typeof patch.profile === "object") patch = patch.profile;
    return patch && typeof patch === "object" ? patch : {};
  }

  function applyLocalProfilePatch(rawPatch) {
    const patch = normalizeProfilePatchPayload(rawPatch);
    const prefs = { ...localProfilePrefs() };
    const has = (key) => Object.prototype.hasOwnProperty.call(patch, key);
    if (has("display_name") || has("displayName") || has("name")) {
      prefs.displayName = UTIL.normalizeText(patch.display_name ?? patch.displayName ?? patch.name, 64) || "Local Usage";
    }
    if (has("username") || has("handle")) {
      const username = stripProfileUsername(patch.username ?? patch.handle);
      if (!profileUsernameAllowed(username)) throw new Error("Invalid username");
      prefs.username = username;
    }
    if (has("profile_picture_url") || has("profilePictureUrl") || has("avatar_url") || has("avatarUrl")) {
      prefs.imageUrl = normalizeProfileImageUrl(patch.profile_picture_url ?? patch.profilePictureUrl ?? patch.avatar_url ?? patch.avatarUrl);
    }
    if (has("email")) {
      const incomingEmail = validProfileEmail(patch.email);
      const defaultEmail = profileDefaultEmail();
      if (incomingEmail === LOCAL_PROFILE_EMAIL && validProfileEmail(prefs.email) && prefs.email !== LOCAL_PROFILE_EMAIL) {
        saveProfileDefaultEmail(prefs.email);
      } else if (incomingEmail && (incomingEmail !== LOCAL_PROFILE_EMAIL || defaultEmail === LOCAL_PROFILE_EMAIL)) {
        prefs.email = incomingEmail;
        if (incomingEmail !== LOCAL_PROFILE_EMAIL) saveProfileDefaultEmail(incomingEmail);
      } else {
        prefs.email = defaultEmail;
      }
    }
    if (has("plan_type") || has("planType") || has("plan") || has("planLabel")) {
      const plan = normalizeProfilePlan(patch.plan_type ?? patch.planType ?? patch.plan, patch.planLabel);
      prefs.planType = plan.planType;
      prefs.planLabel = plan.planLabel;
    }
    return saveLocalProfilePrefs(prefs);
  }

  function localProfilePlanLabel(prefs = localProfilePrefs()) {
    return prefs.planLabel || profilePlanOption(prefs.planType)?.label || prefs.planType || "Pro 20x";
  }

  function findSidebarProfileButton(doc = document) {
    const direct = doc.querySelector?.(
      "button[aria-label='打开个人资料菜单'], button[aria-label='Open profile menu'], button[aria-label='Open profile menu and settings']",
    );
    if (!direct) return null;
    const rect = direct.getBoundingClientRect?.() || { width: 0, height: 0 };
    return rect.width !== 0 && rect.height !== 0 ? direct : null;
  }

  function findOfficialProfileAvatarNode(button) {
    if (!button) return null;
    const officialImage = button.querySelector?.("img:not([data-cltc-profile-identity-avatar])");
    if (officialImage) return officialImage;
    // bG renders a letter avatar as a span with avatar-* color tokens; the loading fallback uses
    // bg-text-tertiary. Both are official nodes, so they keep Codex's own sizing and wrapper.
    return (
      button.querySelector?.(
        "span[class*='text-avatar-foreground'], span[class*='bg-avatar-'], span[class*='bg-text-tertiary'][class*='rounded-full']",
      ) || null
    );
  }

  function syncSidebarProfileIdentity(doc = document) {
    // API-key sessions have no profile surface to override; leave the official footer untouched.
    if (!profileDataOverrideEnabledFor() && !profileSyntheticEnabled()) {
      // Switching from a ChatGPT login to an API key (or disabling the override) leaves the
      // previous pass's footer copy and injected avatar behind, because the early return used to
      // skip cleanup. Restore them once so the official identity comes back.
      if (state.profileIdentityButtons.size || state.profileIdentityMenuItems.size || state.profileIdentityMenus.size) {
        restoreSidebarProfileIdentity();
      }
      return false;
    }
    const button = findSidebarProfileButton(doc);
    const menuSynced = syncSidebarProfileMenuIdentity(doc, button);
    const dataOverride = profileDataOverrideEnabledFor();
    const label = button?.querySelector?.("span.min-w-0.flex-1.truncate");
    const gear = button?.querySelector?.("svg");
    const compactAvatar = button?.querySelector?.("span[class*='avatar']");
    if (!button || typeof doc.createElement !== "function" || (!label && !compactAvatar)) return menuSynced;

    const prefs = localProfilePrefs();
    const displayName = prefs.displayName || prefs.username || "Local Usage";
    // Synthetic (API-key) mode: Codex itself now renders the avatar from the spoofed login identity.
    // Leave its DOM untouched so size, wrapper and object-fit stay byte-identical to the official UI.
    // In data-override mode the local avatar is still meant to replace a real ChatGPT photo.
    const officialAvatar = dataOverride ? null : findOfficialProfileAvatarNode(button);
    let snapshot = button.__codexLiveTokenCostProfileIdentity;
    if (!snapshot) {
      snapshot = {
        label,
        labelText: label?.textContent || "",
        gear,
        gearDisplay: gear?.style?.display || "",
        compactAvatar,
        compactAvatarText: compactAvatar?.textContent || "",
        compactAvatarHtml: compactAvatar?.innerHTML || null,
        compactAvatarSrc: compactAvatar?.getAttribute?.("src") ?? null,
        compactAvatarAlt: compactAvatar?.getAttribute?.("alt") ?? null,
        avatar: null,
      };
      button.__codexLiveTokenCostProfileIdentity = snapshot;
      state.profileIdentityButtons.add(button);
    }

    if (officialAvatar) {
      button.querySelector?.("[data-cltc-profile-identity-avatar]")?.remove?.();
      snapshot.avatar = null;
      if (label && label.textContent !== displayName) label.textContent = displayName;
      return true;
    }

    let avatar = button.querySelector?.("[data-cltc-profile-identity-avatar]");
    if (!avatar && compactAvatar) {
      if (prefs.imageUrl) {
        if (compactAvatar.tagName !== "IMG") {
          avatar = doc.createElement("img");
          avatar.setAttribute?.("data-cltc-profile-identity-avatar", "");
          avatar.className = "shrink-0 object-cover rounded-full icon-sm";
          compactAvatar.replaceWith?.(avatar);
        } else {
          avatar = compactAvatar;
          avatar.setAttribute?.("data-cltc-profile-identity-avatar", "");
        }
      } else {
        compactAvatar.setAttribute?.("data-cltc-profile-identity-avatar", "");
        compactAvatar.textContent = displayName.slice(0, 1);
        avatar = compactAvatar;
      }
    } else if (!avatar && label && gear) {
      const avatarTag = prefs.imageUrl ? "IMG" : "SPAN";
      avatar = doc.createElement(prefs.imageUrl ? "img" : "span");
      avatar.setAttribute?.("data-cltc-profile-identity-avatar", "");
      avatar.className = prefs.imageUrl
        ? "shrink-0 object-cover rounded-full icon-sm"
        : "icon-sm flex shrink-0 items-center justify-center rounded-full bg-token-charts-purple/10 text-[10px] leading-none font-medium text-token-charts-purple";
      button.insertBefore?.(avatar, gear);
    }
    snapshot.avatar = avatar;

    if (prefs.imageUrl) {
      if (avatar.src !== prefs.imageUrl) avatar.src = prefs.imageUrl;
      avatar.alt = displayName.slice(0, 1);
    } else if (avatar.textContent !== displayName.slice(0, 1)) {
      avatar.textContent = displayName.slice(0, 1);
    }
    if (gear?.style && gear.style.display !== "none") gear.style.display = "none";
    if (label && label.textContent !== displayName) label.textContent = displayName;
    return true;
  }

  function profileMenuItemLabel(menuItem) {
    return UTIL.normalizeText(String(menuItem?.innerText || menuItem?.textContent || "").split("\n")[0], 32);
  }

  function findOfficialProfileSettingsControl(doc = document) {
    return Array.from(doc.querySelectorAll?.("button,a,[role='tab']") || []).find((node) => {
      const label = UTIL.normalizeText(node?.innerText || node?.textContent || node?.getAttribute?.("aria-label"), 32);
      if (label !== "个人资料" && label.toLowerCase() !== "profile") return false;
      const rect = node.getBoundingClientRect?.() || { width: 0, height: 0 };
      return rect.width !== 0 && rect.height !== 0;
    });
  }

  function openOfficialProfileFromMenu(doc, menu) {
    const settingsItem = Array.from(menu?.querySelectorAll?.("[role='menuitem']") || []).find((item) => {
      const label = profileMenuItemLabel(item);
      return label === "设置" || label.toLowerCase() === "settings";
    });
    if (typeof settingsItem?.click !== "function") return false;

    if (state.profileNavigationTimer) window.clearTimeout(state.profileNavigationTimer);
    state.profileNavigationTimer = 0;
    settingsItem.click();
    let attempts = 0;
    const openProfile = () => {
      state.profileNavigationTimer = 0;
      const profile = findOfficialProfileSettingsControl(doc);
      if (profile && typeof profile.click === "function") {
        profile.click();
        return;
      }
      attempts += 1;
      if (attempts < 20) state.profileNavigationTimer = window.setTimeout(openProfile, 50);
    };
    openProfile();
    return true;
  }

  function syncSidebarProfileMenuIdentity(doc = document, button = findSidebarProfileButton(doc)) {
    const menuId = button?.getAttribute?.("aria-controls");
    let menu = menuId ? doc.getElementById?.(menuId) : null;
    if (!menu) {
      // The menu is closed most of the time; skip the document-wide menu scan unless the trigger
      // says it is open (or we already track an open menu).
      if (menuId) return false;
      if (button?.getAttribute?.("aria-expanded") !== "true" && state.profileIdentityMenus.size === 0) return false;
      const menus = Array.from(doc.querySelectorAll?.("[role=\"menu\"]") || []);
      menu = menus.find((candidate) => candidate.getAttribute?.("aria-labelledby") === button?.id)
        || menus.find((candidate) => candidate.querySelector?.("span.min-w-0.text-xs.leading-dense.text-tertiary.whitespace-normal"))
        || menus.find((candidate) => /退出登录|sign out/i.test(String(candidate.innerText || candidate.textContent || "")));
    }
    if (!menu || menu.getAttribute?.("role") !== "menu" || (menu.getAttribute?.("aria-labelledby") && menu.getAttribute?.("aria-labelledby") !== button.id)) return false;

    const planSynced = syncSidebarProfileMenuPlan(menu);
    if (profileDataOverrideEnabledFor()) return planSynced;
    const menuItem = menu.querySelector?.("[role='menuitem']");
    if (!menuItem) return planSynced;
    let snapshot = menuItem?.__codexLiveTokenCostProfileMenuIdentity;
    if (!snapshot && (menuItem?.getAttribute?.("aria-disabled") !== "true" || !menuItem.hasAttribute?.("data-disabled"))) return planSynced;
    const row = menuItem.firstElementChild;
    const label = row?.querySelector?.("span.flex-1.min-w-0.truncate, span.min-w-0.truncate");
    if (!label) return planSynced;
    const staleAvatar = row.querySelector?.("[data-cltc-profile-menu-identity-avatar]");
    staleAvatar?.remove?.();
    if (snapshot?.avatar) {
      snapshot.avatar.remove?.();
      snapshot.avatar = null;
    }
    const settingsItem = Array.from(menu.querySelectorAll?.("[role='menuitem']") || []).find((item) => {
      const itemLabel = profileMenuItemLabel(item);
      return item !== menuItem && (itemLabel === "设置" || itemLabel.toLowerCase() === "settings");
    });
    if (!snapshot && (!settingsItem || typeof menuItem.addEventListener !== "function")) return false;

    const prefs = localProfilePrefs();
    const displayName = prefs.displayName || prefs.username || "Local Usage";
    if (!snapshot) {
      snapshot = {
        label,
        labelText: label.textContent,
        ariaDisabled: menuItem.getAttribute?.("aria-disabled"),
        hadDataDisabled: menuItem.hasAttribute?.("data-disabled"),
        tabIndex: menuItem.getAttribute?.("tabindex"),
        className: menuItem.className,
        openProfile(event) {
          event?.preventDefault?.();
          event?.stopPropagation?.();
          openOfficialProfileFromMenu(doc, menu);
        },
        openProfileKeydown(event) {
          if (event?.key !== "Enter" && event?.key !== " ") return;
          snapshot.openProfile(event);
        },
      };
      menuItem.__codexLiveTokenCostProfileMenuIdentity = snapshot;
      state.profileIdentityMenuItems.add(menuItem);
      menuItem.addEventListener("click", snapshot.openProfile, true);
      menuItem.addEventListener("keydown", snapshot.openProfileKeydown, true);
    }

    menuItem.removeAttribute?.("aria-disabled");
    menuItem.removeAttribute?.("data-disabled");
    menuItem.setAttribute?.("tabindex", "0");
    if (settingsItem?.className) menuItem.className = settingsItem.className;

    if (label.textContent !== displayName) label.textContent = displayName;
    return true;
  }

  function syncSidebarProfileMenuPlan(menu) {
    if (!menu) return false;
    let snapshot = menu.__codexLiveTokenCostProfileMenuPlan;
    if (!snapshot) {
      const officialNode = menu.querySelector?.("span.min-w-0.text-xs.leading-dense.text-tertiary.whitespace-normal")
        || menu.querySelector?.("span.min-w-0.text-xs.leading-dense.text-tertiary.truncate");
      const knownLabels = new Set(PROFILE_PLAN_OPTIONS.flatMap((option) => [option.value, option.label]));
      const candidates = Array.from(menu.querySelectorAll?.("*") || []).filter((node) => {
        if (node.children?.length || node.closest?.("[data-cltc-profile-menu-identity]")) return false;
        const text = UTIL.normalizeText(node.textContent, 64);
        return knownLabels.has(text) || /^(free|go|plus|pro(?:\s+\d+x)?|business|enterprise|edu|staff|founder)$/i.test(text);
      });
      const node = officialNode || candidates[0];
      if (!node) return false;
      snapshot = { node, text: node.textContent, html: node.innerHTML };
      menu.__codexLiveTokenCostProfileMenuPlan = snapshot;
      state.profileIdentityMenus.add(menu);
    }
    const label = localProfilePlanLabel();
    if (snapshot.node.textContent !== label) snapshot.node.textContent = label;
    return true;
  }

  function restoreSidebarProfileMenuIdentity() {
    for (const menuItem of state.profileIdentityMenuItems) {
      const snapshot = menuItem?.__codexLiveTokenCostProfileMenuIdentity;
      if (!snapshot) continue;
      if (snapshot.label) snapshot.label.textContent = snapshot.labelText;
      snapshot.avatar?.remove?.();
      menuItem.removeEventListener?.("click", snapshot.openProfile, true);
      menuItem.removeEventListener?.("keydown", snapshot.openProfileKeydown, true);
      if (snapshot.ariaDisabled == null) menuItem.removeAttribute?.("aria-disabled");
      else menuItem.setAttribute?.("aria-disabled", snapshot.ariaDisabled);
      if (snapshot.hadDataDisabled) menuItem.setAttribute?.("data-disabled", "");
      else menuItem.removeAttribute?.("data-disabled");
      if (snapshot.tabIndex == null) menuItem.removeAttribute?.("tabindex");
      else menuItem.setAttribute?.("tabindex", snapshot.tabIndex);
      menuItem.className = snapshot.className;
      try {
        delete menuItem.__codexLiveTokenCostProfileMenuIdentity;
      } catch {
        // Detached host nodes may be read-only; the references are still released below.
      }
    }
    state.profileIdentityMenuItems.clear();
    for (const menu of state.profileIdentityMenus) {
      const snapshot = menu.__codexLiveTokenCostProfileMenuPlan;
      if (!snapshot) continue;
      if (snapshot.node) {
        if (snapshot.html != null) snapshot.node.innerHTML = snapshot.html;
        else snapshot.node.textContent = snapshot.text;
      }
      try { delete menu.__codexLiveTokenCostProfileMenuPlan; } catch {}
    }
    state.profileIdentityMenus.clear();
  }

  function restoreSidebarProfileIdentity() {
    restoreSidebarProfileMenuIdentity();
    for (const button of state.profileIdentityButtons) {
      const snapshot = button?.__codexLiveTokenCostProfileIdentity;
      if (!snapshot) continue;
      if (snapshot.label) snapshot.label.textContent = snapshot.labelText;
      if (snapshot.gear?.style) snapshot.gear.style.display = snapshot.gearDisplay;
      if (snapshot.compactAvatar) {
        snapshot.compactAvatar.removeAttribute?.("data-cltc-profile-identity-avatar");
        if (snapshot.compactAvatarHtml != null) snapshot.compactAvatar.innerHTML = snapshot.compactAvatarHtml;
        else snapshot.compactAvatar.textContent = snapshot.compactAvatarText;
        if (snapshot.compactAvatarSrc != null) snapshot.compactAvatar.setAttribute?.("src", snapshot.compactAvatarSrc);
        else snapshot.compactAvatar.removeAttribute?.("src");
        if (snapshot.compactAvatarAlt != null) snapshot.compactAvatar.setAttribute?.("alt", snapshot.compactAvatarAlt);
        else snapshot.compactAvatar.removeAttribute?.("alt");
      }
      if (snapshot.avatar && snapshot.avatar !== snapshot.compactAvatar) {
        // When the local avatar replaced the official node, put the official node back in its
        // place instead of only deleting the injected one (which would leave a blank avatar).
        if (snapshot.compactAvatar && typeof snapshot.avatar.replaceWith === "function") {
          snapshot.avatar.replaceWith(snapshot.compactAvatar);
        } else {
          snapshot.avatar.remove?.();
        }
      }
      try {
        delete button.__codexLiveTokenCostProfileIdentity;
      } catch {
        // Detached host nodes may be read-only; the references are still released below.
      }
    }
    state.profileIdentityButtons.clear();
  }

  function scheduleSidebarProfileIdentitySync(delay = 80) {
    if (state.profileIdentitySyncTimer || typeof window.setTimeout !== "function") return;
    state.profileIdentitySyncTimer = window.setTimeout(() => {
      state.profileIdentitySyncTimer = 0;
      syncSidebarProfileIdentity();
    }, delay);
  }

  function installSidebarProfileIdentitySync() {
    syncSidebarProfileIdentity();
    if (state.profileIdentityObserver || window.__CODEX_LIVE_TOKEN_COST_TEST__ || typeof MutationObserver !== "function") return;
    const target = document.body || document.documentElement;
    if (!target) return;
    // Codex streams tokens into the chat DOM continuously. A 0 ms body-wide observer (previously
    // with characterData) made every streamed token run a full sidebar/profile lookup, which is
    // what made the whole app feel laggy. The footer identity only changes when the sidebar itself
    // re-renders, so watch childList and coalesce to a slow trailing refresh.
    state.profileIdentityObserver = new MutationObserver(() => scheduleSidebarProfileIdentitySync(250));
    state.profileIdentityObserver.observe(target, { childList: true, subtree: true });
  }

  function stopSidebarProfileIdentitySync() {
    if (state.profileIdentitySyncTimer) window.clearTimeout(state.profileIdentitySyncTimer);
    if (state.profileNavigationTimer) window.clearTimeout(state.profileNavigationTimer);
    state.profileIdentitySyncTimer = 0;
    state.profileNavigationTimer = 0;
    state.profileIdentityObserver?.disconnect?.();
    state.profileIdentityObserver = null;
    restoreSidebarProfileIdentity();
  }

  function bindOfficialModelTrigger() {
    const trigger = pickOfficialModelTrigger();
    if (trigger && trigger === state.officialModelTrigger) return readOfficialModelTrigger(trigger);
    state.officialModelObserver?.disconnect?.();
    state.officialModelObserver = null;
    state.officialModelTrigger = trigger || null;
    if (!trigger || typeof MutationObserver !== "function") {
      const changed = readOfficialModelTrigger(null);
      if (changed) scheduleRender(0);
      return changed;
    }
    const changed = readOfficialModelTrigger(trigger);
    state.officialModelObserver = new MutationObserver(() => {
      if (readOfficialModelTrigger(trigger)) scheduleRender(0);
    });
    state.officialModelObserver.observe(trigger, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ["data-selected-reasoning-effort", "aria-label", "title", "data-state", "class", "style", "hidden", "aria-hidden"],
    });
    if (changed) scheduleRender(0);
    return changed;
  }

  function mutationTouchesOfficialModelTrigger(mutation) {
    const target = mutation?.target;
    if (target?.nodeType === 1 && (target.matches?.(OFFICIAL_MODEL_TRIGGER_SELECTOR) || target.closest?.(OFFICIAL_MODEL_TRIGGER_SELECTOR))) return true;
    for (const node of Array.from(mutation?.addedNodes || [])) {
      if (node.nodeType === 1 && (node.matches?.(OFFICIAL_MODEL_TRIGGER_SELECTOR) || node.querySelector?.(OFFICIAL_MODEL_TRIGGER_SELECTOR))) return true;
    }
    for (const node of Array.from(mutation?.removedNodes || [])) {
      if (node === state.officialModelTrigger || (node.nodeType === 1 && node.contains?.(state.officialModelTrigger))) return true;
    }
    return false;
  }

  function installOfficialModelObserver() {
    if (window.__CODEX_LIVE_TOKEN_COST_TEST__) return;
    bindOfficialModelTrigger();
    if (state.officialModelRootObserver || typeof MutationObserver !== "function") return;
    const target = document.body || document.documentElement;
    if (!target) return;
    state.officialModelRootObserver = new MutationObserver((mutations) => {
      if (!mutations.some(mutationTouchesOfficialModelTrigger)) return;
      // 流式输出会持续改 DOM；把“触发器是否被替换”的重新绑定合并成尾随一次，
      // 避免每个 token 都走 bind/read/querySelector 链。
      if (state.officialModelRebindTimer) return;
      state.officialModelRebindTimer = window.setTimeout(() => {
        state.officialModelRebindTimer = 0;
        bindOfficialModelTrigger();
      }, 120);
    });
    state.officialModelRootObserver.observe(target, { childList: true, subtree: true });
  }

  function localProfileResponse() {
    ensureProfileLedgerLoaded();
    const days = profileLedgerDailyDays();
    const totalTokens = days.reduce((sum, day) => sum + day.tokens, 0);
    const peak = days.reduce((max, day) => Math.max(max, day.tokens), 0);
    const streak = localProfileStreakStats(days);
    const activity = profileLedgerActivity();
    const totalThreads = localProfileThreadCount();
    const topPlugin = activity.topPlugins?.[0] || null;
    const prefs = localProfilePrefs();
    const fastModePercent = activity.fastModePercent ?? 0;
    return {
      profile: {
        display_name: prefs.displayName,
        username: prefs.username,
        email: prefs.email,
        plan_type: prefs.planType,
        plan_label: prefs.planLabel,
        profile_picture_url: prefs.imageUrl,
      },
      // The sidebar footer and the profile dropdown read profile_details off the same
      // /profiles/me response. Supplying it here keeps their official avatar and name rendering
      // path (bG / Wr) authoritative instead of relying on DOM replacement.
      profile_details: {
        display_name: prefs.displayName,
        username: prefs.username,
        email: prefs.email,
        plan_type: prefs.planType,
        plan_label: prefs.planLabel,
        profile_picture_url: prefs.imageUrl,
        description: "",
        photo_frame_style: null,
      },
      metadata: { stats_error: "" },
      stats: {
        daily_usage_buckets: localProfileDailyUsageBuckets(days),
        lifetime_tokens: totalTokens,
        peak_daily_tokens: peak,
        current_streak_days: streak.current,
        longest_streak_days: streak.longest,
        longest_running_turn_sec: activity.longestRunningTurnSec || 0,
        longest_observed_turn_sec: activity.longestObservedTurnSec || 0,
        fast_mode_usage_percentage: fastModePercent,
        top_invocations: activity.topInvocations,
        top_plugins: activity.topPlugins,
        most_used_plugin: topPlugin ? topPlugin.plugin_name || topPlugin.plugin_id || null : null,
        most_used_plugin_usage_count: UTIL.toCount(topPlugin?.usage_count),
        most_used_reasoning_effort: activity.reasoningEffort || activeModelInfo().effort || null,
        most_used_reasoning_effort_percentage: activity.reasoningEffortPercent,
        unique_skills_used: activity.uniqueSkillsUsed,
        total_skills_used: activity.totalSkillsUsed,
        unique_plugins_used: activity.uniquePluginsUsed,
        total_plugins_used: activity.totalPluginsUsed,
        total_threads: totalThreads,
      },
    };
  }

  function localProfilePageResponse() {
    const prefs = localProfilePrefs();
    const local = localProfileResponse();
    const profile = local.profile || {};
    const stats = local.stats || {};
    const displayName = UTIL.normalizeText(profile.display_name, 240) || prefs.displayName || prefs.username || "Local Usage";
    const username = UTIL.normalizeText(profile.username, 240) || prefs.username || "local";
    const dailyBuckets = Array.isArray(stats.daily_usage_buckets) ? stats.daily_usage_buckets : [];
    const topPlugins = Array.isArray(stats.top_plugins) ? stats.top_plugins : [];
    const agentic = {
      lifetime_tokens: stats.lifetime_tokens ?? 0,
      peak_daily_tokens: stats.peak_daily_tokens ?? 0,
      longest_running_turn_sec: stats.longest_running_turn_sec ?? 0,
      fast_mode_usage_percentage: stats.fast_mode_usage_percentage ?? 0,
      most_used_reasoning_effort: stats.most_used_reasoning_effort ?? null,
      most_used_reasoning_effort_percentage: stats.most_used_reasoning_effort_percentage ?? 0,
      total_threads: stats.total_threads ?? 0,
    };
    // Shape consumed by the official /settings/profile page (and the v2 /profile page).
    // fUo() in app-initial reads page.stats.agentic / page.insights.agentic / page.activity_graph,
    // while the renderer dereferences page.visibility.value and page.pins?.items directly.
    return {
      is_self: true,
      can_edit: true,
      has_public_personal_profile: false,
      page_version: 1,
      profile_details: {
        display_name: displayName,
        username,
        email: profile.email || prefs.email,
        plan_type: profile.plan_type || prefs.planType,
        plan_label: profile.plan_label || prefs.planLabel,
        profile_picture_url: normalizeProfileImageUrl(profile.profile_picture_url) || null,
        description: "",
        photo_frame_style: null,
      },
      page: {
        workspace_id: null,
        workspace_name: null,
        visibility: { value: "private" },
        display_settings: null,
        workspace_display_settings: null,
        pins: { items: [], next_cursor: null },
        stats: {
          current_streak_days: stats.current_streak_days ?? 0,
          longest_streak_days: stats.longest_streak_days ?? 0,
          agentic,
        },
        insights: {
          agentic,
          total_skills_used: stats.total_skills_used ?? 0,
          unique_skills_used: stats.unique_skills_used ?? 0,
          total_plugins_used: stats.total_plugins_used ?? 0,
          unique_plugins_used: stats.unique_plugins_used ?? 0,
        },
        top_plugins: topPlugins.map((plugin) => ({
          plugin_id: plugin.plugin_id ?? "",
          plugin_name: plugin.plugin_name ?? plugin.plugin_id ?? "",
          logo_url: plugin.logo_url ?? null,
          usage_count: UTIL.toCount(plugin.usage_count),
        })),
        activity_graph: {
          daily_usage_buckets: dailyBuckets.map((day) => ({
            start_date: day.start_date,
            tokens: UTIL.toCount(day.tokens),
            chat_turns: UTIL.toCount(day.chat_turns),
          })),
        },
      },
    };
  }

  function localProfilePinOptionsResponse() {
    return { items: [], next_cursor: null };
  }

  function localProfilePagePatchResponse(options = {}) {
    const body = options?.requestBody && typeof options.requestBody === "object" ? options.requestBody : options;
    const current = localProfilePageResponse();
    return {
      display_settings: body?.display_settings ?? current.page.display_settings,
      page_version: (Number(current.page_version) || 0) + 1,
    };
  }

  function profileUsageQueryData(value = localProfileResponse()) {
    const profile = value?.profile || {};
    const stats = value?.stats || {};
    return {
      activityInsights: {
        fastModePercent: stats.fast_mode_usage_percentage,
        invocations: stats.top_invocations,
        reasoningEffort: stats.most_used_reasoning_effort,
        reasoningEffortPercent: stats.most_used_reasoning_effort_percentage,
        skillsExplored: stats.unique_skills_used,
        totalSkillsUsed: stats.total_skills_used,
        totalThreads: stats.total_threads,
      },
      dailyUsage:
        stats.daily_usage_buckets == null
          ? null
          : stats.daily_usage_buckets.map((day) => ({ credits: day.tokens, date: day.start_date })),
      displayName: UTIL.normalizeText(profile.display_name, 240) || null,
      hasStatsError: Boolean(value?.metadata?.stats_error?.trim?.()),
      imageUrl: normalizeProfileImageUrl(profile.profile_picture_url),
      planType: UTIL.normalizeText(profile.plan_type, 64) || null,
      plan_type: UTIL.normalizeText(profile.plan_type, 64) || null,
      planLabel: UTIL.normalizeText(profile.plan_label, 64) || null,
      summary: {
        currentStreakDays: stats.current_streak_days ?? null,
        longestStreakDays: stats.longest_streak_days ?? null,
        longestTaskDurationMs: stats.longest_running_turn_sec == null ? null : stats.longest_running_turn_sec * 1000,
        peakTokens: stats.peak_daily_tokens ?? null,
        totalTextTokens: stats.lifetime_tokens ?? null,
      },
      username: UTIL.normalizeText(profile.username, 240) || null,
    };
  }

  function profileAccountInfoQueryData() {
    const prefs = localProfilePrefs();
    return {
      accountId: LOCAL_PROFILE_ACCOUNT_ID,
      userId: LOCAL_PROFILE_USER_ID,
      email: prefs.email,
      plan: prefs.planType,
      computeResidency: null,
      hasChatGptToken: false,
    };
  }

  function syncProfileAccountInfoQueryCache(queryClient = null) {
    const client = queryClient || state.profileQueryClient || profileQueryClientFromDocument();
    if (!isProfileQueryClient(client) || typeof client.setQueryData !== "function") return false;
    const synthetic = profileSyntheticEnabled(client);
    const dataOverride = profileDataOverrideEnabledFor(client);
    if (!synthetic && !dataOverride) return false;
    state.profileQueryClient = client;
    if (synthetic) {
      client.setQueryData(PROFILE_ACCOUNT_INFO_QUERY_KEY.slice(), profileAccountInfoQueryData());
      return true;
    }
    let updated = false;
    try {
      for (const query of client.getQueryCache()?.getAll?.() || []) {
        if (!Array.isArray(query?.queryKey) || query.queryKey[0] !== PROFILE_ACCOUNT_INFO_QUERY_KEY[0] || query.queryKey[1] !== PROFILE_ACCOUNT_INFO_QUERY_KEY[1]) continue;
        const source = query.state?.data;
        if (!source || typeof source !== "object") continue;
        client.setQueryData(query.queryKey, { ...source, plan: localProfilePrefs().planType });
        updated = true;
      }
    } catch {
      return updated;
    }
    return updated;
  }

  function syncProfileUsageQueryCache(queryClient = null) {
    const client = queryClient || state.profileQueryClient || profileQueryClientFromDocument();
    if (!isProfileQueryClient(client) || typeof client.setQueryData !== "function") return false;
    state.profileQueryClient = client;
    const synthetic = profileSyntheticEnabled(client);
    const dataOverride = profileDataOverrideEnabledFor(client);
    if (!synthetic && !dataOverride) return false;
    installProfileQueryCacheObserver(client);
    let queries = [];
    try {
      queries = client.getQueryCache().getAll?.() || [];
    } catch {
      queries = [];
    }
    const profileQueries = queries.filter((query) => isProfileUsageQueryKey(query?.queryKey));
    const pageQueries = queries.filter((query) => isProfilePageQueryKey(query?.queryKey));
    const queryKeys = profileQueries.map((query) => query.queryKey);
    if (!queryKeys.length) {
      if (!synthetic) return false;
      queryKeys.push(["profile", "usage", "disabled"]);
    }
    if (dataOverride) {
      const official = profileQueries.find((query) => query?.state?.data)?.state?.data || {};
      queryKeys.forEach((queryKey) => client.setQueryData(queryKey, applyProfileDataOverride(official)));
      pageQueries.forEach((query) => {
        if (query?.state?.data && profilePageDataNeedsOverride(query.state.data)) {
          client.setQueryData(query.queryKey, profilePageDataOverride(query.state.data));
        }
      });
    } else {
      const data = profileUsageQueryData();
      queryKeys.forEach((queryKey) => client.setQueryData(queryKey, data));
      // The official profile page reads ["profile","page",userId,accountId] from
      // /profiles/me/page. Seed it so the page paints on the first render instead of waiting for a
      // network round-trip that would fail under API-key auth.
      const pageData = localProfilePageResponse();
      pageQueries.forEach((query) => client.setQueryData(query.queryKey, pageData));
      const pageKey = ["profile", "page", LOCAL_PROFILE_USER_ID, LOCAL_PROFILE_ACCOUNT_ID];
      const hasPageKey = pageQueries.some(
        (query) => Array.isArray(query?.queryKey) && query.queryKey.join("\u0000") === pageKey.join("\u0000"),
      );
      if (!hasPageKey) client.setQueryData(pageKey, pageData);
    }
    if (synthetic) syncProfileAccountInfoQueryCache(client);
    return true;
  }

  function statsigClients() {
    const root = window.__STATSIG__ || globalThis.__STATSIG__;
    if (!root || typeof root !== "object") return [];
    const clients = [root.firstInstance, typeof root.instance === "function" ? root.instance() : null];
    if (root.instances && typeof root.instances === "object") clients.push(...Object.values(root.instances));
    return clients.filter((client, index, all) => client && typeof client === "object" && all.indexOf(client) === index);
  }

  function patchProfileStatsigClient(client) {
    if (!client || typeof client !== "object") return;
    if (client.__codexLiveTokenCostProfileGatePatched === VERSION) {
      try {
        if (typeof client.$emt === "function") client.$emt({ name: "values_updated" });
      } catch {
        // Statsig event emission is best-effort.
      }
      return;
    }
    if (typeof client.checkGate === "function") {
      const originalCheckGate = client.__codexLiveTokenCostOriginalCheckGate || client.checkGate.bind(client);
      client.checkGate = (name, options) => {
        const active = stickyBridge();
        return (active?.profileSyntheticEnabled() === true || active?.profileDataOverrideEnabledFor?.() === true) && name === PROFILE_GATE_ID ? true : originalCheckGate(name, options);
      };
      client.__codexLiveTokenCostOriginalCheckGate = originalCheckGate;
    }
    if (typeof client.getFeatureGate === "function") {
      const originalGetFeatureGate = client.__codexLiveTokenCostOriginalGetFeatureGate || client.getFeatureGate.bind(client);
      client.getFeatureGate = (name, options) => {
        const gate = originalGetFeatureGate(name, options);
        const active = stickyBridge();
        if (active?.profileSyntheticEnabled() !== true || name !== PROFILE_GATE_ID) return gate;
        return gate && typeof gate === "object" ? { ...gate, value: true } : gate;
      };
      client.__codexLiveTokenCostOriginalGetFeatureGate = originalGetFeatureGate;
    }
    client.__codexLiveTokenCostProfileGatePatched = VERSION;
    try {
      if (typeof client.$emt === "function") client.$emt({ name: "values_updated" });
    } catch {
      // Statsig event emission is best-effort.
    }
  }

  function patchProfileStatsigGate() {
    statsigClients().forEach(patchProfileStatsigClient);
  }

  function installProfileUsernameUppercaseUnlock() {
    const originalTest = RegExp.prototype.__codexLiveTokenCostOriginalTest || RegExp.prototype.test;
    if (RegExp.prototype.test.__codexLiveTokenCostProfileUnlock === VERSION) return;
    const patchedTest = function codexLiveTokenCostProfileUsernameTest(value) {
      // Cheap-first: bail on the regex source/flags before touching settings, since this runs for
      // every RegExp.prototype.test call in the app.
      if (this?.source === "^[a-z0-9._-]+$" && this?.flags === "" && profileSyntheticEnabled()) {
        return /^[A-Za-z0-9._-]+$/.test(String(value || ""));
      }
      return originalTest.call(this, value);
    };
    patchedTest.__codexLiveTokenCostProfileUnlock = VERSION;
    RegExp.prototype.__codexLiveTokenCostOriginalTest = originalTest;
    RegExp.prototype.test = patchedTest;
  }

  function profileFetchBody(method, body, url) {
    if (method === "PATCH") applyLocalProfilePatch(body);
    if (method === "POST") {
      const saved = applyLocalProfilePhotoUpload(body);
      const response = { asset_pointer: "local-profile-photo" };
      return saved && typeof saved.then === "function" ? saved.then(() => response) : response;
    }
    return localProfileResponse();
  }

  async function profileFetchBodyAsync(method, body, url) {
    if (isProfilePageUrl(url)) {
      return method === "PATCH" ? localProfilePagePatchResponse({ requestBody: body }) : localProfilePageResponse();
    }
    if (isProfilePinOptionsUrl(url)) return localProfilePinOptionsResponse();
    return profileFetchBody(method, body, url);
  }

  function codexAppAssetUrls() {
    const scripts = Array.from(document.scripts || []).map((script) => script.src);
    const links = Array.from(document.querySelectorAll?.("link[href]") || []).map((link) => link.href);
    const resources = typeof performance?.getEntriesByType === "function" ? performance.getEntriesByType("resource").map((entry) => entry.name) : [];
    return Array.from(new Set([...scripts, ...links, ...resources].filter(Boolean).filter((url) => url.includes("/assets/") && url.split("?")[0].endsWith(".js"))));
  }

  function assetReferenceFromText(text, baseUrl, namePart) {
    const escaped = namePart.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const match = String(text || "").match(new RegExp(`["'](\\./(?:assets/)?${escaped}[^"']+\\.js)["']`));
    return match ? new URL(match[1], baseUrl).href : "";
  }

  async function fetchCodexAssetText(url) {
    if (!url) return "";
    if (state.codexAssetTextCache.has(url)) return state.codexAssetTextCache.get(url);
    let text = "";
    try {
      const response = await fetch(url);
      text = response.ok ? await response.text() : "";
    } catch {
      text = "";
    }
    // Never cache a failed/empty read: a transient fetch error must stay retryable for the same
    // loaded asset set, otherwise one failure would pin an empty source until a chunk loads.
    if (text) state.codexAssetTextCache.set(url, text);
    return text;
  }

  function resetCodexAssetCaches(signature) {
    if (state.codexAssetSignature === signature) return;
    state.codexAssetSignature = signature;
    state.codexAssetUrlCache.clear();
    state.codexAssetTextCache.clear();
  }

  async function codexAppAssetUrl(namePart) {
    const urls = codexAppAssetUrls();
    resetCodexAssetCaches(urls.join("\n"));
    if (state.codexAssetUrlCache.has(namePart)) return state.codexAssetUrlCache.get(namePart);
    const resolved = await resolveCodexAppAssetUrl(namePart, urls);
    // Only memoize successful resolutions so transient discovery failures stay retryable.
    if (resolved) state.codexAssetUrlCache.set(namePart, resolved);
    return resolved;
  }

  async function resolveCodexAppAssetUrl(namePart, urls) {
    const direct = urls.find((url) => url.split("/").pop()?.startsWith(namePart));
    if (direct) return direct;
    const bundledModuleFallback = ["request-", "vscode-api-"].includes(namePart);
    const directBundledModule = bundledModuleFallback
      ? urls.find((url) => url.split("?")[0].split("/").pop()?.startsWith("app-initial-") && url.split("?")[0].endsWith(".js"))
      : "";
    let bundledModuleUrl = directBundledModule || "";
    for (const src of urls) {
      try {
        const text = await fetchCodexAssetText(src);
        const found = assetReferenceFromText(text, src, namePart);
        if (found) return found;
        if (bundledModuleFallback && !bundledModuleUrl) bundledModuleUrl = assetReferenceFromText(text, src, "app-initial-");
      } catch {
        // Asset discovery is best-effort across Codex desktop versions.
      }
    }
    if (bundledModuleUrl) return bundledModuleUrl;
    if (namePart === "request-") {
      const profileQueriesUrl = await codexAppAssetUrl("profile-queries-");
      if (profileQueriesUrl) {
        const text = await fetchCodexAssetText(profileQueriesUrl);
        return assetReferenceFromText(text, profileQueriesUrl, "request-");
      }
    }
    return "";
  }

  async function loadCodexAppModule(namePart) {
    if (!state.codexModulePromises.has(namePart)) {
      const promise = Promise.resolve()
        .then(async () => {
          const url = await codexAppAssetUrl(namePart);
          if (!url) throw new Error(`Codex app asset not found: ${namePart}`);
          return import(url);
        })
        .catch((error) => {
          state.codexModulePromises.delete(namePart);
          throw error;
        });
      state.codexModulePromises.set(namePart, promise);
    }
    return state.codexModulePromises.get(namePart);
  }

  async function invalidateProfileQuery(queryKey) {
    if (!profileSyntheticEnabled() || window.__CODEX_LIVE_TOKEN_COST_TEST__) return false;
    if (!state.profileQueryClient) rememberProfileQueryClient(profileQueryClientFromDocument());
    let invalidatedLocally = false;
    try {
      invalidatedLocally = await invalidateProfileQueryWithClient(state.profileQueryClient, queryKey);
    } catch {
      // Keep the broadcast fallback available when the local query client is unavailable.
    }
    try {
      const module = await loadCodexAppModule("vscode-api-");
      const dispatcher = Object.values(module || {}).find((value) => value && typeof value.dispatchMessage === "function");
      if (!dispatcher) return invalidatedLocally;
      dispatcher.dispatchMessage("query-cache-invalidate", { queryKey: queryKey.slice() });
      return true;
    } catch {
      return invalidatedLocally;
    }
  }

  function invalidateProfileUsageQuery() {
    return invalidateProfileQuery(PROFILE_USAGE_QUERY_KEY);
  }

  function chainProfileQueryRefresh(previous, refresh) {
    return Promise.resolve(previous).catch(() => undefined).then(refresh);
  }

  async function invalidateProfileQueryWithClient(queryClient, queryKey) {
    if (!isProfileQueryClient(queryClient)) return false;
    await queryClient.invalidateQueries({ queryKey: queryKey.slice() });
    return true;
  }

  function invalidateProfileAccountsCheckQuery() {
    return invalidateProfileQuery(PROFILE_ACCOUNTS_CHECK_QUERY_KEY);
  }

  function scheduleProfileAccountsCheckRefresh() {
    if (!profileSyntheticEnabled()) return Promise.resolve(false);
    const next = chainProfileQueryRefresh(state.profileAccountsRefreshPromise, invalidateProfileAccountsCheckQuery);
    state.profileAccountsRefreshPromise = next.catch(() => false);
    return state.profileAccountsRefreshPromise;
  }

  function scheduleProfileUsageRefresh(delay = 1000) {
    if (!profileSyntheticEnabled()) return;
    state.profileUsageRefreshRequests += 1;
    if (window.__CODEX_LIVE_TOKEN_COST_TEST__ || state.profileUsageRefreshTimer || typeof window.setTimeout !== "function") return;
    state.profileUsageRefreshTimer = window.setTimeout(() => {
      state.profileUsageRefreshTimer = 0;
      syncProfileUsageQueryCache();
      void invalidateProfileUsageQuery().finally(() => syncProfileUsageQueryCache());
    }, delay);
  }

  function patchProfileRequestClient(client) {
    if (!client || typeof client !== "object") return false;
    if (client.__codexLiveTokenCostProfileRequestPatch === VERSION) return true;
    if (typeof client.safeGet !== "function" && typeof client.safePatch !== "function") return false;
    const originalSafeGet = client.__codexLiveTokenCostOriginalSafeGet || client.safeGet?.bind(client);
    const originalSafePatch = client.__codexLiveTokenCostOriginalSafePatch || client.safePatch?.bind(client);
    const overrideActive = () => stickyBridge()?.profileDataOverrideEnabledFor?.() === true;
    // Synthetic mode is test-only in this build; the check short-circuits in production.
    const syntheticActive = () => stickyBridge()?.profileSyntheticEnabled?.() === true;
    if (typeof originalSafeGet === "function") {
      client.safeGet = async function codexLiveTokenCostProfileSafeGet(url, ...args) {
        if (syntheticActive() && (isProfilePageUrl(url) || isProfilePinOptionsUrl(url))) {
          return stickyBridge().profileFetchBodyAsync("GET", null, url);
        }
        if ((syntheticActive() || overrideActive()) && isProfileUsageUrl(url)) {
          return stickyBridge().profileFetchBodyAsync("GET", null, url);
        }
        let response;
        try {
          response = await originalSafeGet(url, ...args);
        } catch (error) {
          // Test-only synthetic path: an API-key session cannot call the ChatGPT-only accounts
          // endpoint, so keep the dropdown renderable. Production override mode leaves real
          // ChatGPT errors untouched.
          if (syntheticActive() && isProfileAccountsCheckUrl(url)) {
            return stickyBridge().localProfileAccountsCheckResponse();
          }
          throw error;
        }
        if (syntheticActive() && isProfileAccountsCheckUrl(url)) {
          return stickyBridge().spoofProfileAccountsCheckPayload(response);
        }
        return response;
      };
      client.__codexLiveTokenCostOriginalSafeGet = originalSafeGet;
    }
    if (typeof originalSafePatch === "function") {
      client.safePatch = async function codexLiveTokenCostProfileSafePatch(url, options, ...args) {
        if (syntheticActive() && isProfilePageUrl(url)) return stickyBridge().localProfilePagePatchResponse(options);
        if ((syntheticActive() || overrideActive()) && isProfileUsageUrl(url)) {
          stickyBridge().applyLocalProfilePatch(options);
          return stickyBridge().localProfileResponse();
        }
        return originalSafePatch(url, options, ...args);
      };
      client.__codexLiveTokenCostOriginalSafePatch = originalSafePatch;
    }
    client.__codexLiveTokenCostProfileRequestPatch = VERSION;
    return true;
  }

  function patchProfilePhotoUploadClient(client) {
    if (!client || (typeof client !== "object" && typeof client !== "function") || typeof client.post !== "function") return false;
    if (client.__codexLiveTokenCostProfilePhotoPatch === VERSION) return true;
    const originalPost = client.__codexLiveTokenCostOriginalPost || client.post.bind(client);
    client.post = async function codexLiveTokenCostProfilePhotoPost(url, body, headers, ...args) {
      const active = stickyBridge();
      if ((active?.profileSyntheticEnabled() === true || active?.profileDataOverrideEnabledFor?.() === true) && isProfilePhotoUrl(url)) {
        await active.applyLocalProfilePhotoUpload(body);
        return { status: 200, body: { asset_pointer: "local-profile-photo" }, headers: { "content-type": "application/json" } };
      }
      return originalPost(url, body, headers, ...args);
    };
    client.__codexLiveTokenCostOriginalPost = originalPost;
    client.__codexLiveTokenCostProfilePhotoPatch = VERSION;
    return true;
  }

  async function installProfileRequestClientPatch() {
    if (!profileDataOverrideEnabledFor() || window.__CODEX_LIVE_TOKEN_COST_TEST__) return;
    const candidatesFor = (module) => {
      const found = new Set();
      for (const value of Object.values(module || {})) {
        if (value && typeof value === "object" && (typeof value.safeGet === "function" || typeof value.safePatch === "function")) {
          found.add(value);
        }
      }
      return found;
    };
    try {
      let patched = 0;
      for (const delay of [0, 200, 700, 1500]) {
        if (delay) await new Promise((resolve) => window.setTimeout(resolve, delay));
        if (!profileDataOverrideEnabledFor()) return;
        // The request clients are executed inside app-initial. Loading it directly uses Vite's
        // already-evaluated module (no extra 14 MB download/parse); "request-" can resolve to an
        // unrelated form chunk.
        let candidates = new Set();
        try {
          candidates = candidatesFor(await loadCodexAppModule("app-initial-"));
        } catch {
          // Asset discovery is best-effort across Codex desktop versions.
        }
        if (candidates.size === 0) {
          try {
            candidates = candidatesFor(await loadCodexAppModule("request-"));
          } catch {
            // Asset discovery is best-effort across Codex desktop versions.
          }
        }
        for (const value of candidates) {
          if (patchProfileRequestClient(value)) patched += 1;
        }
        if (patched > 0) break;
      }
      window.__codexLiveTokenCostProfileRequestPatch = patched > 0 ? VERSION : "not-found";
      if (patched > 0) syncProfileUsageQueryCache();
    } catch (error) {
      window.__codexLiveTokenCostProfileRequestPatch = "error";
      window.__codexLiveTokenCostProfileRequestPatchError = error?.message || String(error);
    }
  }

  async function installProfilePhotoUploadPatch() {
    if (!profileSyntheticEnabled() || window.__CODEX_LIVE_TOKEN_COST_TEST__) return;
    try {
      const module = await loadCodexAppModule("vscode-api-");
      if (!profileSyntheticEnabled()) return;
      let patched = 0;
      const values = Object.values(module || {});
      const photoClientExport = values.find((value) => {
        if (typeof value !== "function" || typeof value.getInstance !== "function") return false;
        try {
          return String(value).includes("pendingRequests");
        } catch {
          return false;
        }
      });
      for (const value of photoClientExport ? [photoClientExport] : values) {
        try {
          const client = typeof value?.getInstance === "function" ? value.getInstance() : value;
          if (patchProfilePhotoUploadClient(client)) patched += 1;
        } catch {
          // Ignore non-client exports.
        }
      }
      window.__codexLiveTokenCostProfilePhotoPatch = patched > 0 ? VERSION : "not-found";
    } catch (error) {
      window.__codexLiveTokenCostProfilePhotoPatch = "error";
      window.__codexLiveTokenCostProfilePhotoPatchError = error?.message || String(error);
    }
  }

  function stopProfileUiReadinessCoordinator() {
    state.profileUiReadinessObserver?.disconnect?.();
    state.profileUiReadinessObserver = null;
  }

  function activateProfileUiPatch(componentNames, doc = document) {
    if (!profileSyntheticEnabled() && !profileDataOverrideEnabledFor()) return false;
    const authContext = profileAuthContextFromDocument(doc);
    const queryClient = profileQueryClientFromDocument(doc);
    if (!authContext || !isProfileQueryClient(queryClient) || typeof queryClient.setQueryData !== "function") return false;
    if (!syncProfileUsageQueryCache(queryClient) || !patchProfileReactAuthContext(authContext, componentNames)) return false;
    state.profileSyntheticAuth = true;
    window.__codexLiveTokenCostProfileAuthPatch = VERSION;
    if (!profileSyntheticEnabled()) return true;
    void Promise.all([
      invalidateProfileQueryWithClient(queryClient, PROFILE_ACCOUNTS_CHECK_QUERY_KEY),
      invalidateProfileQueryWithClient(queryClient, PROFILE_USAGE_QUERY_KEY),
    ]).finally(() => syncProfileUsageQueryCache(queryClient));
    return true;
  }

  function installProfileUiReadinessCoordinator(componentNames, doc = document) {
    stopProfileUiReadinessCoordinator();
    state.profileSyntheticAuth = false;
    if ((!profileSyntheticEnabled() && !profileDataOverrideEnabledFor()) || !componentNames?.length) {
      window.__codexLiveTokenCostProfileAuthPatch = "not-found";
      return false;
    }
    if (activateProfileUiPatch(componentNames, doc)) return true;
    const target = doc.body || doc.documentElement;
    if (!target || typeof MutationObserver !== "function") {
      window.__codexLiveTokenCostProfileAuthPatch = "not-found";
      return false;
    }
    window.__codexLiveTokenCostProfileAuthPatch = "waiting";
    state.profileUiReadinessObserver = new MutationObserver(() => {
      if (!profileSyntheticEnabled() && !profileDataOverrideEnabledFor()) {
        stopProfileUiReadinessCoordinator();
        return;
      }
      if (activateProfileUiPatch(componentNames, doc)) stopProfileUiReadinessCoordinator();
    });
    state.profileUiReadinessObserver.observe(target, { childList: true, subtree: true });
    return false;
  }

  async function installProfileAuthContextPatch() {
    // The auth-context getter is part of the API-key spoof. In production the real-ChatGPT branch
    // never needs it, so this must stay on the test-only synthetic path.
    if (!profileSyntheticEnabled() || window.__CODEX_LIVE_TOKEN_COST_TEST__) return;
    try {
      const appUrl = await codexAppAssetUrl("app-initial-");
      const appSource = await fetchCodexAssetText(appUrl);
      if (!profileSyntheticEnabled() && !profileDataOverrideEnabledFor()) return;
      const componentNames = profileUiComponentNamesFromSource(appSource);
      installProfileUiReadinessCoordinator(componentNames);
      state.profileAuthPatchRetries = 0;
    } catch (error) {
      stopProfileUiReadinessCoordinator();
      state.profileSyntheticAuth = false;
      window.__codexLiveTokenCostProfileAuthPatch = "error";
      window.__codexLiveTokenCostProfileAuthPatchError = error?.message || String(error);
      // The install is idempotent, so a transient asset failure no longer gets retried by the
      // query-cache observer. Retry a bounded number of times instead of silently giving up.
      if (!state.profileAuthPatchRetryTimer && state.profileAuthPatchRetries < 2) {
        state.profileAuthPatchRetries += 1;
        state.profileAuthPatchRetryTimer = window.setTimeout(() => {
          state.profileAuthPatchRetryTimer = 0;
          if (profileSyntheticEnabled()) void installProfileAuthContextPatch();
        }, 2000);
      }
    }
  }

  function isProfileFetchMessage(message) {
    return (
      profileSyntheticEnabled() &&
      message?.type === "fetch" &&
      (isProfileUsageUrl(message.url) ||
        isProfilePhotoUrl(message.url) ||
        isProfilePageUrl(message.url) ||
        isProfilePinOptionsUrl(message.url))
    );
  }

  function rememberProfileRequestId(requestId) {
    if (requestId == null || requestId === "") return;
    const now = Date.now();
    state.profileRequestIds.set(String(requestId), now);
    for (const [key, seenAt] of state.profileRequestIds) {
      if (now - seenAt > 30000) state.profileRequestIds.delete(key);
    }
  }

  function isRememberedProfileRequestId(requestId) {
    if (requestId == null || requestId === "") return false;
    return state.profileRequestIds.has(String(requestId));
  }

  function emitProfileFetchResponse(requestId, method, body, url) {
    rememberProfileRequestId(requestId);
    const sendPayload = (payload) => {
      const message = {
      type: "fetch-response",
      __codexLiveTokenCostProfileLocal: true,
      requestId,
      responseType: "success",
      status: 200,
      headers: { "content-type": "application/json" },
      bodyJsonString: JSON.stringify(payload),
      };
      if (typeof window.postMessage === "function") {
        window.postMessage(message, location.origin || "*");
        return;
      }
      window.dispatchEvent(new MessageEvent("message", { data: message, origin: location.origin, source: window }));
    };
    const payload = profileFetchBody(method, body, url);
    if (payload && typeof payload.then === "function") {
      payload.then(sendPayload);
      return;
    }
    sendPayload(payload);
  }

  function handleProfileFetchEvent(event) {
    const message = event?.detail;
    if (!isProfileFetchMessage(message)) return;
    rememberProfileRequestId(message.requestId);
    event.preventDefault?.();
    event.stopImmediatePropagation?.();
    window.setTimeout(() => {
      void emitProfileFetchResponse(message.requestId, String(message.method || "GET").toUpperCase(), message.body, message.url);
    }, 0);
  }

  function handleProfileFetchResponseEvent(event) {
    const data = event?.data;
    if (data?.type !== "fetch-response" || !isRememberedProfileRequestId(data.requestId)) return;
    if (data.__codexLiveTokenCostProfileLocal) return;
    event.preventDefault?.();
    event.stopImmediatePropagation?.();
  }

  function profileBridgeSendMessage(originalSend) {
    const patchedSend = (message) => {
      if (isProfileFetchMessage(message)) {
        rememberProfileRequestId(message.requestId);
        window.setTimeout(() => {
          void emitProfileFetchResponse(message.requestId, String(message.method || "GET").toUpperCase(), message.body, message.url);
        }, 0);
        return Promise.resolve();
      }
      return originalSend(message);
    };
    patchedSend.__codexLiveTokenCostProfileUnlock = VERSION;
    return patchedSend;
  }

  function patchProfileElectronBridge() {
    const bridge = window.electronBridge;
    if (!bridge || typeof bridge.sendMessageFromView !== "function" || bridge.sendMessageFromView.__codexLiveTokenCostProfileUnlock === VERSION) {
      return Boolean(bridge?.sendMessageFromView?.__codexLiveTokenCostProfileUnlock === VERSION);
    }
    const originalSend = bridge.__codexLiveTokenCostOriginalSendMessageFromView || bridge.sendMessageFromView.bind(bridge);
    const patchedSend = profileBridgeSendMessage(originalSend);
    try {
      bridge.sendMessageFromView = patchedSend;
      bridge.__codexLiveTokenCostOriginalSendMessageFromView = originalSend;
      return bridge.sendMessageFromView === patchedSend || bridge.sendMessageFromView.__codexLiveTokenCostProfileUnlock === VERSION;
    } catch {
      return false;
    }
  }

  function profileBridgeProxy(bridge) {
    if (!bridge || typeof bridge.sendMessageFromView !== "function" || typeof Proxy !== "function") return bridge;
    if (bridge.__codexLiveTokenCostProfileProxy === VERSION) return bridge;
    const originalSend = bridge.__codexLiveTokenCostOriginalSendMessageFromView || bridge.sendMessageFromView.bind(bridge);
    const patchedSend = profileBridgeSendMessage(originalSend);
    const proxy = new Proxy(
      {},
      {
        get(_target, prop, receiver) {
        if (prop === "sendMessageFromView") return patchedSend;
        if (prop === "__codexLiveTokenCostOriginalSendMessageFromView") return originalSend;
        if (prop === "__codexLiveTokenCostProfileProxy") return VERSION;
        return Reflect.get(bridge, prop, receiver);
      },
        set(_target, prop, value, receiver) {
          return Reflect.set(bridge, prop, value, receiver);
        },
        has(_target, prop) {
          return prop in bridge;
        },
        ownKeys() {
          return Reflect.ownKeys(bridge);
        },
        getOwnPropertyDescriptor(_target, prop) {
          const descriptor = Reflect.getOwnPropertyDescriptor(bridge, prop);
          return descriptor ? { ...descriptor, configurable: true } : undefined;
        },
      },
    );
    return proxy;
  }

  function installElectronBridgeHook() {
    if (window.__codexLiveTokenCostBridgeHook === VERSION) return;
    window.__codexLiveTokenCostBridgeHook = VERSION;
    patchProfileElectronBridge();
    let current = profileBridgeProxy(window.electronBridge);
    try {
      const descriptor = Object.getOwnPropertyDescriptor(window, "electronBridge");
      if (descriptor?.configurable === false) return;
      Object.defineProperty(window, "electronBridge", {
        configurable: true,
        enumerable: true,
        get() {
          return current;
        },
        set(value) {
          current = profileBridgeProxy(value);
          window.setTimeout(patchProfileElectronBridge, 0);
        },
      });
      if (current) window.setTimeout(patchProfileElectronBridge, 0);
    } catch {
      // If the preload owns a non-configurable bridge, the interval fallback still tries.
    }
  }

  function installProfileMessageIntercept() {
    if (window.__codexLiveTokenCostProfileMessageIntercept === VERSION) return;
    window.addEventListener("codex-message-from-view", handleProfileFetchEvent, true);
    window.addEventListener("message", handleProfileFetchResponseEvent, true);
    window.__codexLiveTokenCostProfileMessageIntercept = VERSION;
  }

  function installOfficialProfileUnlock() {
    // Production only runs the real-ChatGPT data-override branch. The synthetic branch exists
    // solely behind the test-only switch in profileSyntheticEnabled.
    if (!profileDataOverrideEnabledFor() && !profileSyntheticEnabled()) return;
    const mode = profileDataOverrideEnabledFor() ? "override" : "synthetic";
    if (state.profileUnlockInstalledMode === mode && state.profileUnlockInstalledClient === state.profileQueryClient) return;
    const originalFilter = Array.prototype.__codexLiveTokenCostOriginalFilter || Array.prototype.filter;
    if (Array.prototype.filter.__codexLiveTokenCostProfileUnlock !== VERSION) {
      const patchedFilter = function codexLiveTokenCostProfileFilter(callback, thisArg) {
        const visible = originalFilter.call(this, callback, thisArg);
        return settingsSectionsCandidate(this) ? profileUnlockedSettingsSections(this, visible) : visible;
      };
      patchedFilter.__codexLiveTokenCostProfileUnlock = VERSION;
      Array.prototype.__codexLiveTokenCostOriginalFilter = originalFilter;
      Array.prototype.filter = patchedFilter;
    }

    void installProfileRequestClientPatch();
    installSidebarProfileIdentitySync();
    patchProfileStatsigGate();
    if (mode === "synthetic") {
      // Test-only legacy path. Production never takes this branch: the API-key profile surface
      // cannot be unlocked and these global hooks (IPC proxy, message interceptors, RegExp and
      // auth-context patches) are exactly the hot-path overhead we removed.
      installProfileUsernameUppercaseUnlock();
      installProfileMessageIntercept();
      installElectronBridgeHook();
      void installProfilePhotoUploadPatch();
      void installProfileAuthContextPatch();
      patchProfileElectronBridge();
    }
    state.profileUnlockInstalledMode = mode;
    state.profileUnlockInstalledClient = state.profileQueryClient;
    state.profileUnlockInstallCount += 1;
  }

  function uninstallOfficialProfileUnlock() {
    stopProfileUiReadinessCoordinator();
    stopProfileQueryCacheObserver();
    stopSidebarProfileIdentitySync();
    state.profileUnlockInstalledMode = "";
    state.profileUnlockInstalledClient = null;
    if (state.profileAuthPatchRetryTimer) window.clearTimeout(state.profileAuthPatchRetryTimer);
    state.profileAuthPatchRetryTimer = 0;
    state.profileAuthPatchRetries = 0;
    if (state.profileUsageRefreshTimer) window.clearTimeout(state.profileUsageRefreshTimer);
    state.profileUsageRefreshTimer = 0;
    state.profileAccountsRefreshPromise = null;
    state.profileSyntheticAuth = false;
    state.profileRequestIds.clear();
    if (Array.prototype.filter.__codexLiveTokenCostProfileUnlock === VERSION) {
      Array.prototype.filter = Array.prototype.__codexLiveTokenCostOriginalFilter;
    }
    if (Promise.prototype.then.__codexLiveTokenCostProfileUnlock === VERSION) {
      Promise.prototype.then = Promise.prototype.__codexLiveTokenCostOriginalThen;
    }
    if (RegExp.prototype.test.__codexLiveTokenCostProfileUnlock === VERSION) {
      RegExp.prototype.test = RegExp.prototype.__codexLiveTokenCostOriginalTest;
    }
    if (window.electronBridge?.sendMessageFromView?.__codexLiveTokenCostProfileUnlock === VERSION) {
      try {
        window.electronBridge.sendMessageFromView = window.electronBridge.__codexLiveTokenCostOriginalSendMessageFromView;
      } catch {
        // Read-only preload bridges remain wrapped but pass through while disabled.
      }
    }
    if (window.__codexLiveTokenCostProfileMessageIntercept === VERSION) {
      window.removeEventListener("codex-message-from-view", handleProfileFetchEvent, true);
      window.removeEventListener("message", handleProfileFetchResponseEvent, true);
      delete window.__codexLiveTokenCostProfileMessageIntercept;
    }
    patchProfileStatsigGate();
  }

  function setProfileUnlockEnabled(value) {
    const enabled = saveProfileUnlockEnabled(Boolean(value));
    if (enabled) {
      if (profileSyntheticEnabled()) {
        safeInstallOfficialProfileUnlock();
        scheduleProfileUsageRefresh(0);
      } else if (profileDataOverrideEnabledFor()) {
        safeInstallOfficialProfileUnlock();
        syncProfileUsageQueryCache();
      }
    } else {
      uninstallOfficialProfileUnlock();
    }
    return enabled;
  }

  // ---------------------------------------------------------------------------
  // 模块 21：设置页与嵌入式页面
  // 设置面板只以嵌入式页面存在（旧 modal 路径不再创建）。
  // ---------------------------------------------------------------------------
  function findComposerBox(force = false) {
    const now = Date.now();
    if (
      !force &&
      !window.__CODEX_LIVE_TOKEN_COST_TEST__ &&
      state.composerBox &&
      state.composerBox.isConnected !== false &&
      now - state.composerBoxAt < COMPOSER_BOX_CACHE_MS
    ) {
      return state.composerBox;
    }
    const editable = mainEditable();
    if (!editable) {
      state.composerBox = null;
      state.composerBoxAt = now;
      return null;
    }
    let node = editable;
    let candidate = editable.parentElement || editable;
    for (let depth = 0; node?.parentElement && depth < 8; depth += 1, node = node.parentElement) {
      const rect = node.getBoundingClientRect();
      const style = getComputedStyle(node);
      if (rect.width >= 320 && rect.height >= 36 && rect.height <= 260 && style.display !== "contents") candidate = node;
    }
    state.composerBox = candidate;
    state.composerBoxAt = now;
    return candidate;
  }

  function closeSettingsEditor() {
    state.priceEditorOpen = false;
    state.priceDraft = null;
    state.analyticsModel = "";
    state.analyticsModelsExpanded = false;
    render(true);
  }

  function renderEmbeddedSettingsPage(container, options = {}, snap = null) {
    if (options.panel && ["profile", "general", "usage", "pricing"].includes(options.panel)) state.settingsPanel = options.panel;
    state.priceEditorOpen = true;
    state.embeddedPageContainer = container;
    container.classList.add("cltc-settings-overlay", "cltc-settings-embedded", "cltc-settings");
    renderUpdateCluster();
    if (state.analyticsCalendar?.isOpen) return;
    const now = Date.now();
    // 流式输出期间设置页不需要 4 次/秒整体重建；用户主动操作仍立即渲染。
    if (options.fromRender && state.settingsRenderAt && now - state.settingsRenderAt < SETTINGS_PANEL_RENDER_INTERVAL_MS) return;
    state.settingsRenderAt = now;
    const hasEmbeddedContent = () => (container.firstElementChild !== undefined ? Boolean(container.firstElementChild) : Boolean(container.innerHTML));
    const firstRender = !hasEmbeddedContent();
    const html = pricePopoverHtml(snap || liveSnapshot());
    if (state.embeddedHtmlSignature === html && hasEmbeddedContent()) {
      return;
    }
    state.embeddedHtmlSignature = html;
    container.innerHTML = html;
    applyPriceFilter(container);
    const content = typeof container.querySelector === "function" ? container.querySelector(".cltc-settings-content") : null;
    if (content && options.panelSwitch === true) content.scrollTop = 0;
    if (state.settingsPanelEnterTimer) window.clearTimeout(state.settingsPanelEnterTimer);
    state.settingsPanelEnterTimer = 0;
    container.removeAttribute?.("data-cltc-nav-enter");
    if (content && (firstRender || options.panelSwitch === true) && !prefersReducedMotion()) {
      content.dataset.cltcPanelEnter = "true";
      container.dataset.cltcNavEnter = "true";
      state.settingsPanelEnterTimer = window.setTimeout(() => {
        state.settingsPanelEnterTimer = 0;
        content.removeAttribute("data-cltc-panel-enter");
        container.removeAttribute?.("data-cltc-nav-enter");
      }, 380);
    }
    animateAnalyticsSegments(container, options);
    for (const button of Array.from(container.querySelectorAll?.(".cltc-settings-nav [data-settings-panel]") || [])) {
      button.addEventListener("pointerdown", handleSettingsNavPointerDown);
    }
    for (const button of Array.from(container.querySelectorAll?.("[data-action='save-profile']") || [])) {
      button.addEventListener("pointerdown", handleEmbeddedProfileSavePointerDown);
    }
    if (container.dataset.cltcEmbeddedBound !== "true") {
      container.dataset.cltcEmbeddedBound = "true";
      container.addEventListener("click", handleSettingsClick, true);
      container.addEventListener("input", handleSettingsInput, true);
      container.addEventListener("pointerdown", handleEmbeddedControlPointerDown, true);
      container.addEventListener("change", handleSettingsChange, true);
      container.addEventListener("keydown", handleSettingsKeydown, true);
    }
  }

  function animateAnalyticsSegments(root, options = {}) {
    if (!root) return;
    if (prefersReducedMotion()) return;
    const animateAnalyticsSegment = options.analyticsRange === true || options.analyticsMetric === true;
    if (!animateAnalyticsSegment) return;
    const selector = options.analyticsRange ? ".cltc-analytics-toolbar .cltc-segmented" : ".cltc-analytics-section-head .cltc-segmented-compact";
    const segmentGroup = root.querySelector(selector);
    const fromIndex = Number(options.analyticsSegmentFrom);
    const toIndex = Number(segmentGroup?.getAttribute("data-cltc-segment-index"));
    if (!segmentGroup || !Number.isInteger(fromIndex) || !Number.isInteger(toIndex) || fromIndex < 0 || fromIndex === toIndex) return;
    segmentGroup.dataset.cltcSegmentFromIndex = String(fromIndex);
    const activate = () => {
      state.analyticsSegmentSwitchFrame = 0;
      if (!segmentGroup.isConnected) return;
      void segmentGroup.offsetWidth;
      segmentGroup.removeAttribute("data-cltc-segment-from-index");
    };
    if (typeof window.requestAnimationFrame === "function") state.analyticsSegmentSwitchFrame = window.requestAnimationFrame(activate);
    else activate();
  }

  function clearEmbeddedRailActive() {
    const button = Array.from(document.querySelectorAll?.('nav[data-app-navigation-rail] button[aria-label]') || [])
      .find((node) => (node.getAttribute('aria-label') || '') === 'Codex Token Cost');
    if (!button) return;
    for (const attribute of ['aria-current', 'data-active', 'data-selected']) {
      if (button.hasAttribute(attribute)) button.removeAttribute(attribute);
    }
  }
  function closeEmbeddedSettingsPage() {
    if (!state.embeddedPageContainer) return closeSettingsEditor();
    state.priceEditorOpen = false;
    state.priceDraft = null;
    state.embeddedPageContainer = null;
    if (embeddedPageClose) embeddedPageClose();
    else closeSettingsEditor();
    clearEmbeddedRailActive();
    return true;
  }

  function selectSettingsPanel(panel) {
    if (!["profile", "general", "usage", "pricing"].includes(panel)) return false;
    state.settingsPanel = panel;
    renderSettingsOverlay(liveSnapshot(), { animate: true, panelSwitch: true });
    return true;
  }

  function handleSettingsNavPointerDown(event) {
    if (event.button !== 0) return;
    event.preventDefault?.();
    event.stopPropagation?.();
    selectSettingsPanel(event.currentTarget?.getAttribute?.("data-settings-panel") || "");
  }

  function handleEmbeddedControlPointerDown(event) {
    if (event.target?.closest?.("select, input, textarea")) event.stopPropagation?.();
  }

  function handleEmbeddedProfileSavePointerDown(event) {
    if (event.button !== 0) return;
    event.preventDefault?.();
    event.stopPropagation?.();
    saveProfilePrefsFromEditor();
  }

  let embeddedPageClose = null;

  function installCodexPlusEmbeddedPage() {
    if (state.embeddedPageDispose || state.destroyed) return;
    if (typeof window.codexPlus?.registerPage !== "function") return;
    if (!codexPlusApiReady()) {
      reportFailure(new Error("Codex++ API version mismatch: " + window.codexPlus?.apiVersion));
      return;
    }
    try {
      state.embeddedPageDispose = window.codexPlus.registerPage(
        {
          title: "Codex Token Cost",
          render: ({ container, close }) => {
            embeddedPageClose = typeof close === "function" ? close : null;
            renderEmbeddedSettingsPage(container);
          },
        },
        { navLabel: "Codex Token Cost", icon: SETTINGS_BUTTON_ICON },
      );
    } catch {
      state.embeddedPageDispose = null;
    }
  }

  function setButtonAttribute(node, name, value) {
    if (node.getAttribute?.(name) !== value) node.setAttribute(name, value);
  }

  // ---------------------------------------------------------------------------
  // 模块 22：样式表（巨型 CSS 模板）
  // 全部 .cltc-* 样式；ensureStyle() 注入 <style>，是本文件唯一的样式来源。
  // ---------------------------------------------------------------------------
  function ensureStyle() {
    // 本文件是唯一 CSS 事实源，除 Flatpickr 主题外不得在别处注入样式。
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      #${ROOT_ID} {
        --cltc-text: var(--color-token-text-primary, light-dark(#111827, #f4f4f5));
        --cltc-muted: var(--color-token-text-tertiary, light-dark(#6b7280, #a1a1aa));
        --cltc-border: var(--color-token-border-light, light-dark(#d1d5db, #3f3f46));
        --cltc-border-subtle: var(--color-token-border-light, light-dark(#e5e7eb, #323238));
        --cltc-surface: var(--color-token-main-surface-primary, light-dark(#ffffff, #18181b));
        --cltc-surface-secondary: var(--color-token-main-surface-secondary, light-dark(#f3f4f6, #27272a));
        --cltc-popover: var(--color-token-dropdown-background, var(--color-token-main-surface-primary, light-dark(#ffffff, #18181b)));
        --cltc-input: var(--color-token-input-background, var(--color-token-main-surface-primary, light-dark(#ffffff, #18181b)));
        --cltc-hover: var(--color-token-list-hover-background, light-dark(rgba(0, 0, 0, .06), rgba(255, 255, 255, .08)));
        --cltc-shadow: light-dark(rgba(0, 0, 0, .18), rgba(0, 0, 0, .48));
        --cltc-primary: var(--color-token-text-primary, light-dark(#171717, #f4f4f5));
        --cltc-primary-text: var(--color-token-main-surface-primary, light-dark(#ffffff, #18181b));
        --cltc-danger: light-dark(#b42318, #f97066);
        --cltc-arc-bg: light-dark(rgb(246, 246, 246), rgba(255, 255, 255, .08));
        --cltc-arc-radius: var(--radius-2xl, 20px);
        --cltc-shimmer-contrast: #fff;
        --cltc-ease-out: cubic-bezier(0.23, 1, 0.32, 1);
        --cltc-ease-in-out: cubic-bezier(0.77, 0, 0.175, 1);
        --cltc-duration-press: 160ms;
        --cltc-duration-tooltip: 125ms;
        --cltc-duration-popover: 180ms;
        --cltc-duration-modal: 200ms;
        --cltc-duration-data: 160ms;
        box-sizing: border-box;
        color-scheme: light dark;
        position: relative;
        display: grid;
        grid-template-columns: minmax(0, 1.55fr) minmax(0, .70fr) minmax(0, 1fr) minmax(0, .82fr) minmax(0, .82fr) minmax(0, 1.51fr);
        align-items: center;
        gap: 0;
        width: min(100%, 760px);
        height: 61px;
        margin: 0 auto -18px;
        padding: 8px 10px 25px;
        border-radius: var(--cltc-arc-radius) var(--cltc-arc-radius) 0 0;
        background: var(--cltc-arc-bg);
        color: var(--cltc-muted);
        font: 12px/1.35 ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        letter-spacing: 0;
        z-index: 0;
      }
      @supports (corner-shape: superellipse(1.5)) {
        #${ROOT_ID} {
          corner-shape: var(--codex-corner-shape, round);
        }
      }
      #${ROOT_ID} .cltc-pill {
        box-sizing: border-box;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 3px;
        position: relative;
        width: 100%;
        min-width: 0;
        min-height: 28px;
        max-width: 100%;
        padding: 0 8px;
        border: 0;
        border-radius: 0;
        background: transparent;
        overflow: hidden;
        text-align: center;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      #${ROOT_ID} .cltc-pill + .cltc-pill::before {
        content: "";
        position: absolute;
        left: 0;
        top: 50%;
        display: block;
        width: 1px;
        height: 11px;
        margin: 0;
        background: color-mix(in srgb, var(--cltc-muted) 30%, transparent);
        transform: translateY(-50%);
      }
      #${ROOT_ID} .cltc-current-flow {
        display: inline-flex;
        align-items: center;
        gap: 3px;
      }
      #${ROOT_ID}[data-cltc-output-rate-visible="true"] {
        grid-template-columns: minmax(0, 2.05fr) repeat(4, minmax(0, .755fr)) minmax(0, 1.20fr);
      }
      #${ROOT_ID}[data-cltc-output-rate-visible="true"] .cltc-current-flow {
        min-width: 0;
        max-width: 100%;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      #${ROOT_ID}[data-cltc-output-rate-visible="true"] .cltc-output-rate[hidden] {
        display: none;
      }
      #${ROOT_ID} .cltc-model-label {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 3px;
        min-width: 0;
        max-width: 100%;
      }
      #${ROOT_ID} .cltc-model-text {
        display: inline-flex;
        align-items: center;
        min-width: 0;
        max-width: 100%;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      #${ROOT_ID} .cltc-model-effort {
        flex: 0 0 auto;
        color: var(--cltc-muted);
      }
      #${ROOT_ID} .cltc-model-effort:not(:empty)::before {
        content: "·";
        /* flex 项内的行首空格会被折叠，用 margin 保证 “模型 · 强度” 两侧都有间距 */
        margin: 0 0.28em;
        color: var(--cltc-muted);
      }
      #${ROOT_ID} .cltc-model-effort[data-effort="ultra"] {
        color: var(--color-token-charts-purple, rgb(146, 79, 247));
      }
      #${ROOT_ID} .cltc-fast-mode-icon {
        display: inline-block;
        flex: 0 0 auto;
        width: 14px;
        height: 14px;
        color: var(--color-token-link-foreground, currentColor);
      }
      #${ROOT_ID} .cltc-fast-mode-icon[hidden] {
        display: none;
      }
      [data-model-picker-view] [data-active="false"][aria-hidden="true"] {
        visibility: hidden !important;
        pointer-events: none !important;
      }
      #${ROOT_ID} .cltc-cadenced-shimmer {
        --cltc-shimmer-text-primary: var(--cltc-muted);
        --cltc-shimmer-text-secondary: var(--cltc-shimmer-text-primary);
        position: relative;
        display: inline-block;
        color: var(--cltc-shimmer-text-secondary);
        -webkit-text-fill-color: currentColor;
        text-fill-color: currentColor;
        background: transparent;
        -webkit-background-clip: border-box;
        background-clip: border-box;
        animation: none;
      }
      #${ROOT_ID} .cltc-cadenced-shimmer-sweep {
        position: absolute;
        inset: 0 auto 0 0;
        width: 100%;
        overflow: hidden;
        pointer-events: none;
        transform: translate(-50%);
        -webkit-mask-image: linear-gradient(90deg, transparent 0%, #000 20% 30%, transparent 50% 100%);
        mask-image: linear-gradient(90deg, transparent 0%, #000 20% 30%, transparent 50% 100%);
      }
      #${ROOT_ID} .cltc-cadenced-shimmer-highlight {
        display: block;
        width: 100%;
        color: var(--cltc-shimmer-contrast);
        -webkit-text-fill-color: currentColor;
        text-fill-color: currentColor;
        transform: translate(50%);
      }
      #${ROOT_ID} .cltc-cadenced-shimmer-active .cltc-cadenced-shimmer-sweep,
      #${ROOT_ID} .cltc-cadenced-shimmer-active .cltc-cadenced-shimmer-highlight {
        animation-duration: 1s;
        animation-timing-function: steps(48, end);
        animation-iteration-count: 1;
        animation-delay: var(--cltc-shimmer-active-delay, 0ms);
        animation-fill-mode: both;
      }
      #${ROOT_ID} .cltc-cadenced-shimmer-active .cltc-cadenced-shimmer-sweep {
        animation-name: cltc-cadenced-shimmer-sweep;
      }
      #${ROOT_ID} .cltc-cadenced-shimmer-active .cltc-cadenced-shimmer-highlight {
        animation-name: cltc-cadenced-shimmer-highlight;
      }
      #${ROOT_ID} .cltc-muted {
        opacity: .68;
      }
      #${ROOT_ID} .cltc-roll {
        --cltc-roll-row: 16px;
        display: inline-flex;
        align-items: center;
        height: var(--cltc-roll-row);
        line-height: var(--cltc-roll-row);
        font-variant-numeric: tabular-nums;
        white-space: nowrap;
      }
      #${ROOT_ID} .cltc-roll::before {
        content: "0";
        flex: 0 0 0;
        width: 0;
        height: var(--cltc-roll-row);
        line-height: var(--cltc-roll-row);
        overflow: hidden;
        visibility: hidden;
      }
      #${ROOT_ID} .cltc-roll-separator {
        display: inline-block;
        height: var(--cltc-roll-row);
        line-height: var(--cltc-roll-row);
      }
      #${ROOT_ID} .cltc-roll-digit-column {
        position: relative;
        display: inline-block;
        width: 1ch;
        height: var(--cltc-roll-row);
        line-height: var(--cltc-roll-row);
        contain: layout paint style;
      }
      #${ROOT_ID} .cltc-roll-digit-column::before {
        content: "0";
        visibility: hidden;
      }
      #${ROOT_ID} .cltc-roll-digit-clip {
        position: absolute;
        inset: 0;
        overflow: hidden;
      }
      #${ROOT_ID} .cltc-roll-digit-stack {
        display: flex;
        flex-direction: column;
        height: var(--cltc-roll-row);
        contain: layout size style;
        transform: translateY(var(--cltc-roll-to-y, 0px));
        transition: transform var(--cltc-duration-data) var(--cltc-ease-out);
      }
      #${ROOT_ID} .cltc-roll-digit-stack > span {
        flex: 0 0 var(--cltc-roll-row);
        display: block;
        height: var(--cltc-roll-row);
        line-height: var(--cltc-roll-row);
      }
      #${ROOT_ID} .cltc-roll-digit-stack[data-animate="true"] {
        transform: translateY(var(--cltc-roll-from-y, var(--cltc-roll-to-y, 0px)));
      }
      @keyframes cltc-cadenced-shimmer-sweep {
        0% { transform: translate(-50%); }
        to { transform: translate(125%); }
      }
      @keyframes cltc-cadenced-shimmer-highlight {
        0% { transform: translate(50%); }
        to { transform: translate(-125%); }
      }
      @media (prefers-reduced-motion: reduce) {
        #${ROOT_ID} .cltc-roll-digit-stack,
        #${ROOT_ID} .cltc-roll-digit-stack[data-animate="true"],
        #${ROOT_ID} .cltc-cadenced-shimmer-active .cltc-cadenced-shimmer-sweep,
        #${ROOT_ID} .cltc-cadenced-shimmer-active .cltc-cadenced-shimmer-highlight {
          animation: none;
          transition: none;
        }
      }
      @media (prefers-color-scheme: light) {
        #${ROOT_ID} {
          color-scheme: light;
          --cltc-text: #111827;
          --cltc-muted: rgba(26, 28, 31, .494);
          --cltc-border: #d1d5db;
          --cltc-surface: #ffffff;
          --cltc-arc-bg: rgb(246, 246, 246);
          --cltc-shimmer-contrast: #fff;
        }
      }
      @media (prefers-color-scheme: dark) {
        #${ROOT_ID} {
          color-scheme: dark;
          --cltc-text: #d4d4d8;
          --cltc-muted: rgba(255, 255, 255, .498);
          --cltc-border: #3f3f46;
          --cltc-surface: #2d2d2d;
          --cltc-input: #2d2d2d;
          --cltc-arc-bg: rgb(31, 31, 31);
          --cltc-shimmer-contrast: #fff;
        }
      }
      html.electron-dark #${ROOT_ID} {
        color-scheme: dark;
        --cltc-text: #d4d4d8;
        --cltc-muted: rgba(255, 255, 255, .498);
        --cltc-border: #3f3f46;
        --cltc-surface: #2d2d2d;
        --cltc-input: #2d2d2d;
        --cltc-arc-bg: rgb(31, 31, 31);
        --cltc-shimmer-contrast: #fff;
      }
      .cltc-settings-overlay {
        --cltc-text: var(--color-token-text-primary, light-dark(#111827, #f4f4f5));
        --cltc-muted: var(--color-token-text-secondary, color-mix(in srgb, var(--cltc-text) 65%, transparent));
        --cltc-border: var(--color-token-border, light-dark(rgba(0, 0, 0, .08), rgba(255, 255, 255, .085)));
        --cltc-border-subtle: var(--color-token-border, light-dark(rgba(0, 0, 0, .06), rgba(255, 255, 255, .065)));
        --cltc-surface: var(--color-token-bg-primary, light-dark(#f6f6f6, #141414));
        --cltc-surface-secondary: var(--color-token-bg-primary, light-dark(#f6f6f6, #141414));
        --cltc-popover: var(--color-token-dropdown-background, light-dark(#ffffff, #2d2d2d));
        --cltc-input: var(--color-token-bg-primary, light-dark(#f6f6f6, #141414));
        --cltc-chrome: var(--color-token-side-bar-background, light-dark(#f6f6f6, #141414));
        --cltc-canvas: var(--color-token-main-surface-primary, light-dark(#ffffff, #181818));
        --cltc-sidebar-surface: var(--cltc-chrome);
        --cltc-hover: var(--color-token-interactive-bg-secondary-hover, light-dark(rgba(0, 0, 0, .053), rgba(255, 255, 255, .078)));
        --cltc-active: var(--color-token-list-hover-background, light-dark(rgba(0, 0, 0, .053), rgba(255, 255, 255, .078)));
        --cltc-shadow: light-dark(rgba(0, 0, 0, .18), rgba(0, 0, 0, .48));
        --cltc-primary: var(--color-token-text-primary, light-dark(#171717, #f4f4f5));
        --cltc-primary-text: var(--color-token-main-surface-primary, light-dark(#ffffff, #18181b));
        --cltc-danger: light-dark(#b42318, #f97066);
        --cltc-success: var(--color-token-success, #10a37f);
        --cltc-warning: var(--color-token-warning, light-dark(#b45309, #f0b35e));
        --cltc-chart-blue: var(--color-token-charts-blue, #3b82f6);
        --cltc-chart-purple: var(--color-token-charts-purple, #8b5cf6);
        --cltc-focus-ring: var(--color-token-focus-border, light-dark(rgba(0, 122, 204, .76), rgba(131, 195, 255, .76)));
        --cltc-font-family: var(--font-family-sans, var(--font-sans, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif));
        --cltc-radius-sm: var(--radius-md, 6px);
        --cltc-radius-control: var(--radius-lg, 8px);
        --cltc-radius-modal: var(--radius-2xl, 12px);
        --cltc-radius-popover: var(--radius-2xl, 10px);
        --cltc-radius-pill: 999px;
        --cltc-ease-out: cubic-bezier(0.23, 1, 0.32, 1);
        --cltc-ease-in-out: cubic-bezier(0.77, 0, 0.175, 1);
        --cltc-duration-press: 160ms;
        --cltc-duration-tooltip: 125ms;
        --cltc-duration-popover: 180ms;
        --cltc-duration-modal: 200ms;
        --cltc-duration-data: 160ms;
        position: fixed;
        inset: 0;
        z-index: 2147483647;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 48px 20px;
        background: transparent;
        color: var(--cltc-text);
        color-scheme: light dark;
        box-sizing: border-box;
        font-family: var(--cltc-font-family);
        font-size: 13px;
        line-height: 1.45;
        letter-spacing: 0;
        -webkit-app-region: no-drag;
      }
      .cltc-settings *,
      .cltc-settings *::before,
      .cltc-settings *::after {
        box-sizing: border-box;
      }
      html[data-theme="dark"] .cltc-settings-overlay,
      html[data-theme="dark"] .cltc-settings,
      html.electron-dark .cltc-settings-overlay,
      html.electron-dark .cltc-settings {
        color-scheme: dark;
      }
      html[data-theme="light"] .cltc-settings-overlay,
      html[data-theme="light"] .cltc-settings {
        color-scheme: light;
      }
      .cltc-settings-modal {
        position: relative;
        display: grid;
        grid-template-rows: auto minmax(0, 1fr);
        width: min(920px, calc(100vw - 40px));
        height: min(620px, calc(100vh - 96px));
        max-height: calc(100vh - 96px);
        overflow: hidden;
        padding: 0;
        border: 1px solid var(--cltc-border);
        border-radius: var(--cltc-radius-modal);
        background: var(--cltc-popover);
        box-shadow: 0 18px 55px var(--cltc-shadow);
        color: var(--cltc-text);
        opacity: 1;
        transform: translateY(0) scale(1);
        transition: opacity var(--cltc-duration-modal) var(--cltc-ease-out),
          transform var(--cltc-duration-modal) var(--cltc-ease-out);
      }
      .cltc-settings-overlay[data-cltc-entering="true"] .cltc-settings-modal {
        opacity: 0;
        transform: translateY(4px) scale(.97);
      }
      .cltc-settings-overlay[data-cltc-closing="true"] {
        pointer-events: none;
      }
      .cltc-settings-overlay[data-cltc-closing="true"] .cltc-settings-modal {
        opacity: 0;
        transform: translateY(2px) scale(.98);
        transition: opacity var(--cltc-duration-press) var(--cltc-ease-out),
          transform var(--cltc-duration-press) var(--cltc-ease-out);
      }
      .cltc-settings .cltc-settings-content {
        transition: opacity var(--cltc-duration-popover) var(--cltc-ease-out),
          transform var(--cltc-duration-popover) var(--cltc-ease-out);
      }
      .cltc-settings .cltc-settings-content[data-cltc-switching="true"] {
        opacity: .45;
        transform: translateY(4px);
      }
      @media (prefers-reduced-motion: reduce) {
        .cltc-settings-modal {
          transform: none;
          transition: opacity var(--cltc-duration-press) var(--cltc-ease-out);
        }
        .cltc-settings-overlay[data-cltc-entering="true"] .cltc-settings-modal {
          transform: none;
        }
        .cltc-settings-overlay[data-cltc-closing="true"] .cltc-settings-modal {
          transform: none;
          transition: opacity var(--cltc-duration-press) var(--cltc-ease-out);
        }
        .cltc-settings .cltc-settings-content {
          transition: opacity var(--cltc-duration-press) var(--cltc-ease-out);
        }
        .cltc-settings .cltc-settings-content[data-cltc-switching="true"] {
          transform: none;
        }
      }
      .cltc-settings .cltc-settings-content::-webkit-scrollbar,
      .cltc-settings .cltc-price-list::-webkit-scrollbar {
        width: 6px;
        height: 6px;
      }
      .cltc-settings .cltc-settings-content::-webkit-scrollbar-track,
      .cltc-settings .cltc-price-list::-webkit-scrollbar-track {
        background: transparent;
      }
      .cltc-settings .cltc-settings-content::-webkit-scrollbar-thumb,
      .cltc-settings .cltc-price-list::-webkit-scrollbar-thumb {
        border-radius: var(--cltc-radius-pill);
        background: color-mix(in srgb, var(--cltc-muted) 35%, transparent);
      }
      #${ROOT_ID} .cltc-price-head,
      .cltc-settings .cltc-price-head {
        display: flex;
        justify-content: space-between;
        gap: 10px;
        align-items: center;
        min-height: 54px;
        padding: 10px 14px 10px 18px;
        border-bottom: 1px solid var(--cltc-border-subtle);
      }
      #${ROOT_ID} .cltc-price-title,
      .cltc-settings .cltc-price-title {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        font-size: 15px;
        font-weight: 600;
      }
      #${ROOT_ID} .cltc-price-head button,
      .cltc-settings .cltc-price-head button {
        width: 30px;
        height: 30px;
        border: 0;
        border-radius: var(--cltc-radius-control, 8px);
        background: transparent;
        color: var(--cltc-muted);
        cursor: pointer;
        font: 20px/1 ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      #${ROOT_ID} .cltc-price-head button:focus-visible,
      .cltc-settings .cltc-price-head button:focus-visible {
        background: var(--cltc-hover);
        outline: 2px solid var(--cltc-focus-ring, currentColor);
        outline-offset: 2px;
      }
      #${ROOT_ID} .cltc-button,
      #${ROOT_ID} .cltc-price-head button,
      #${ROOT_ID} .cltc-price-actions button,
      .cltc-settings button {
        transition: transform var(--cltc-duration-press) var(--cltc-ease-out),
          background var(--cltc-duration-press) var(--cltc-ease-out),
          color var(--cltc-duration-press) var(--cltc-ease-out),
          border-color var(--cltc-duration-press) var(--cltc-ease-out);
      }
      .cltc-settings .cltc-settings-nav button,
      .cltc-settings .cltc-price-row {
        transition: transform var(--cltc-duration-press) var(--cltc-ease-out),
          background var(--cltc-duration-press) var(--cltc-ease-out),
          color var(--cltc-duration-press) var(--cltc-ease-out),
          border-color var(--cltc-duration-press) var(--cltc-ease-out);
      }
      .cltc-settings .cltc-profile-select,
      .cltc-settings .cltc-price-input {
        transition: background var(--cltc-duration-press) var(--cltc-ease-out),
          color var(--cltc-duration-press) var(--cltc-ease-out),
          border-color var(--cltc-duration-press) var(--cltc-ease-out);
      }
      #${ROOT_ID} .cltc-button:active,
      #${ROOT_ID} .cltc-price-head button:active,
      #${ROOT_ID} .cltc-price-actions button:active,
      .cltc-settings button:active {
        transform: scale(.97);
      }
      .cltc-settings .cltc-settings-shell {
        display: grid;
        grid-template-columns: max-content minmax(0, 1fr);
        min-height: 0;
        overflow: hidden;
      }
      .cltc-settings .cltc-settings-sidebar {
        display: flex;
        flex-direction: column;
        min-width: 0;
        padding: 18px 10px;
        background: var(--cltc-sidebar-surface);
      }
      .cltc-settings .cltc-settings-nav {
        display: grid;
        gap: 2px;
      }
      .cltc-settings .cltc-settings-nav button {
        width: 100%;
        min-height: 34px;
        padding: 7px 10px;
        border: 0;
        border-radius: var(--cltc-radius-control);
        background: transparent;
        color: var(--cltc-muted);
        cursor: pointer;
        font: inherit;
        text-align: left;
      }
      .cltc-settings .cltc-settings-nav button:focus-visible,
      .cltc-settings .cltc-settings-nav button[data-active="true"] {
        background: var(--cltc-active);
        color: var(--cltc-text);
        outline: none;
      }
      .cltc-settings .cltc-settings-nav button:focus-visible {
        outline: 2px solid var(--cltc-focus-ring);
        outline-offset: 2px;
      }
      .cltc-settings .cltc-settings-nav button[data-active="true"] {
        font-weight: 600;
      }
      .cltc-settings button:focus-visible {
        outline: 2px solid var(--cltc-focus-ring);
        outline-offset: 2px;
      }
      .cltc-settings button:disabled {
        cursor: not-allowed;
        opacity: .5;
        pointer-events: none;
      }
      .cltc-settings .cltc-settings-content {
        min-width: 0;
        overflow: auto;
        padding: 26px 30px 30px;
        scrollbar-width: thin;
        scrollbar-color: color-mix(in srgb, var(--cltc-muted) 35%, transparent) transparent;
      }
      #${ROOT_ID} .cltc-price-list,
      .cltc-settings .cltc-price-list {
        display: grid;
        max-height: 210px;
        overflow: auto;
        border: 1px solid var(--cltc-border-subtle);
        border-radius: var(--cltc-radius-control, 8px);
        scrollbar-width: thin;
        scrollbar-color: color-mix(in srgb, var(--cltc-muted) 35%, transparent) transparent;
      }
      #${ROOT_ID} .cltc-settings-section,
      .cltc-settings .cltc-settings-section {
        display: grid;
        gap: 20px;
      }
      .cltc-settings .cltc-settings-section + .cltc-settings-section {
        border-top: 1px solid var(--cltc-border-subtle);
        margin-top: 20px;
      }
      .cltc-settings .cltc-settings-section-heading {
        display: grid;
        gap: 4px;
      }
      .cltc-settings .cltc-settings-section-heading h2 {
        margin: 0;
        font-size: 20px;
        font-weight: 600;
        line-height: 28px;
      }
      .cltc-settings .cltc-settings-section-heading p {
        margin: 0;
        color: var(--cltc-muted);
        font-size: 13px;
        line-height: 19px;
      }
      .cltc-settings .cltc-settings-row {
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto;
        align-items: center;
        gap: 18px;
        min-height: 66px;
        padding: 14px 0;
        border-top: 1px solid var(--cltc-border-subtle);
      }
      .cltc-settings .cltc-sync-row {
        border-top: none;
      }
      .cltc-settings .cltc-settings-row strong,
      .cltc-settings .cltc-toggle-field strong {
        display: block;
        font-weight: 500;
      }
      .cltc-settings .cltc-toggle-field small,
      .cltc-settings .cltc-settings-row small {
        display: block;
        margin-top: 2px;
        color: var(--cltc-muted);
        font-size: 12px;
        line-height: 17px;
      }
      #${ROOT_ID} .cltc-sync-status,
      .cltc-settings .cltc-sync-status {
        margin: 0;
        color: var(--cltc-muted);
        font-size: 12px;
        line-height: 17px;
      }
      .cltc-settings .cltc-sync-status {
        transition: opacity var(--cltc-duration-tooltip) var(--cltc-ease-out);
      }
      .cltc-settings-overlay .cltc-profile-save-toast {
        position: fixed;
        top: max(18px, env(safe-area-inset-top));
        left: 50%;
        z-index: 2;
        display: block;
        max-width: min(420px, calc(100vw - 32px));
        padding: 10px 14px;
        border: 1px solid var(--cltc-border);
        border-radius: var(--cltc-radius-control);
        background: var(--cltc-popover);
        box-shadow: 0 10px 28px var(--cltc-shadow);
        color: var(--cltc-text);
        font-size: 13px;
        line-height: 18px;
        overflow-wrap: anywhere;
        text-align: center;
        opacity: 0;
        pointer-events: none;
        transform: translate(-50%, -8px);
        visibility: hidden;
        transition: opacity var(--cltc-duration-popover) var(--cltc-ease-out), transform var(--cltc-duration-popover) var(--cltc-ease-out), visibility 0s linear var(--cltc-duration-popover);
      }
      .cltc-settings-overlay .cltc-profile-save-toast[data-visible="true"] {
        opacity: 1;
        transform: translate(-50%, 0);
        visibility: visible;
        transition-delay: 0s;
      }
      .cltc-settings-overlay .cltc-profile-save-toast[data-tone="success"] {
        border-color: color-mix(in srgb, var(--cltc-success) 42%, var(--cltc-border));
        color: color-mix(in srgb, var(--cltc-success) 78%, var(--cltc-text));
      }
      .cltc-settings-overlay .cltc-profile-save-toast[data-tone="error"] {
        border-color: color-mix(in srgb, var(--cltc-danger) 52%, var(--cltc-border));
        color: var(--cltc-danger);
      }
      #${ROOT_ID} .cltc-price-row,
      .cltc-settings .cltc-price-row {
        display: grid;
        grid-template-columns: minmax(120px, 1fr) repeat(4, minmax(44px, .45fr));
        gap: 6px;
        align-items: center;
        width: 100%;
        min-height: 34px;
        padding: 7px 9px;
        border: 0;
        border-bottom: 1px solid var(--cltc-border-subtle);
        background: transparent;
        color: inherit;
        font: inherit;
        text-align: left;
      }
      #${ROOT_ID} .cltc-price-row[data-active="true"],
      .cltc-settings .cltc-price-row[data-active="true"] {
        background: var(--cltc-active);
        font-weight: 600;
      }
      .cltc-settings .cltc-price-table-head {
        min-height: 30px;
        padding-top: 4px;
        padding-bottom: 4px;
        color: var(--cltc-muted);
        font-size: 11px;
        font-weight: 500;
      }
      .cltc-settings .cltc-price-meta {
        margin-top: -12px;
        color: var(--cltc-muted);
        font-size: 12px;
        line-height: 17px;
      }
      .cltc-settings .cltc-price-sync {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-top: 4px;
        color: var(--cltc-muted);
        font-size: 12px;
        line-height: 17px;
      }
      .cltc-settings .cltc-price-sync[data-tone="warn"] {
        color: var(--cltc-danger);
      }
      .cltc-settings .cltc-price-sync button {
        min-height: 22px;
        padding: 0 8px;
        border: 1px solid var(--cltc-border-subtle);
        border-radius: 6px;
        background: transparent;
        color: inherit;
        font-size: 11px;
        line-height: 20px;
        cursor: pointer;
      }
      .cltc-settings .cltc-price-sync button:hover {
        border-color: var(--cltc-danger);
      }
      .cltc-settings .cltc-price-editor {
        display: grid;
        gap: 14px;
        padding-top: 20px;
        border-top: 1px solid var(--cltc-border-subtle);
      }
      #${ROOT_ID} .cltc-price-row span,
      .cltc-settings .cltc-price-row span {
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      #${ROOT_ID} .cltc-price-grid,
      .cltc-settings .cltc-price-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 14px 12px;
      }
      #${ROOT_ID} .cltc-price-field-full,
      .cltc-settings .cltc-price-field-full {
        grid-column: 1 / -1;
      }
      #${ROOT_ID} .cltc-price-field,
      .cltc-settings .cltc-price-field {
        display: grid;
        gap: 6px;
      }
      .cltc-settings .cltc-profile-field-note {
        margin-top: -2px;
        color: var(--cltc-muted);
        font-size: 11px;
        line-height: 16px;
      }
      #${ROOT_ID} .cltc-toggle-field,
      .cltc-settings .cltc-toggle-field {
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto;
        align-items: center;
        gap: 18px;
        min-height: 66px;
        padding: 14px 0;
        border-top: 1px solid var(--cltc-border-subtle);
        color: var(--cltc-text);
        cursor: pointer;
      }
      #${ROOT_ID} .cltc-toggle-field input,
      .cltc-settings .cltc-toggle-field input {
        appearance: none;
        position: relative;
        width: 34px;
        height: 20px;
        margin: 0;
        border: 1px solid var(--cltc-border);
        border-radius: var(--cltc-radius-pill);
        background: color-mix(in srgb, var(--cltc-text) 16%, transparent);
        cursor: pointer;
        transition: transform var(--cltc-duration-press) var(--cltc-ease-out),
          background var(--cltc-duration-press) var(--cltc-ease-out),
          border-color var(--cltc-duration-press) var(--cltc-ease-out);
      }
      #${ROOT_ID} .cltc-toggle-field input::after,
      .cltc-settings .cltc-toggle-field input::after {
        content: "";
        position: absolute;
        top: 2px;
        left: 2px;
        width: 14px;
        height: 14px;
        border-radius: var(--cltc-radius-pill);
        background: var(--cltc-muted);
        box-shadow: 0 1px 3px rgba(0, 0, 0, .22);
        transition: transform var(--cltc-duration-press) var(--cltc-ease-out),
          background var(--cltc-duration-press) var(--cltc-ease-out);
      }
      #${ROOT_ID} .cltc-toggle-field input:checked,
      .cltc-settings .cltc-toggle-field input:checked {
        border-color: var(--cltc-text);
        background: var(--cltc-text);
      }
      #${ROOT_ID} .cltc-toggle-field input:checked::after,
      .cltc-settings .cltc-toggle-field input:checked::after {
        transform: translateX(14px);
        background: var(--cltc-surface);
      }
      #${ROOT_ID} .cltc-toggle-field input:active,
      .cltc-settings .cltc-toggle-field input:active {
        transform: scale(.97);
      }
      #${ROOT_ID} .cltc-toggle-field input:focus-visible,
      .cltc-settings .cltc-toggle-field input:focus-visible {
        outline: 2px solid var(--cltc-muted);
        outline-offset: 2px;
      }
      #${ROOT_ID} .cltc-price-field span,
      .cltc-settings .cltc-price-field span {
        padding: 0;
        border: 0;
        background: transparent;
        color: var(--cltc-muted);
        font-size: 12px;
        line-height: 17px;
      }
      #${ROOT_ID} .cltc-price-input,
      #${ROOT_ID} .cltc-profile-select,
      .cltc-settings .cltc-price-input,
      .cltc-settings .cltc-profile-select {
        min-width: 0;
        height: 36px;
        padding: 7px 10px;
        border: 1px solid var(--cltc-border);
        border-radius: var(--cltc-radius-control, 8px);
        background: var(--cltc-input);
        color: var(--cltc-text);
        font: inherit;
        outline: none;
      }
      #${ROOT_ID} .cltc-profile-select,
      .cltc-settings .cltc-profile-select {
        appearance: auto;
        cursor: pointer;
      }
      #${ROOT_ID} .cltc-price-field[data-profile-locked],
      .cltc-settings .cltc-price-field[data-profile-locked] {
        cursor: not-allowed;
      }
      #${ROOT_ID} .cltc-profile-select:disabled,
      #${ROOT_ID} .cltc-price-input:disabled,
      .cltc-settings .cltc-profile-select:disabled,
      .cltc-settings .cltc-price-input:disabled {
        cursor: not-allowed;
        opacity: .55;
        pointer-events: none;
      }
      #${ROOT_ID} .cltc-profile-select::picker(select),
      .cltc-settings .cltc-profile-select::picker(select) {
        appearance: auto;
        margin-top: 5px;
        padding: 5px;
        border: 1px solid var(--cltc-border);
        border-radius: var(--cltc-radius-popover, 10px);
        background: var(--cltc-popover);
        box-shadow: 0 12px 32px var(--cltc-shadow);
        color: var(--cltc-text);
      }
      #${ROOT_ID} .cltc-profile-select::picker-icon,
      .cltc-settings .cltc-profile-select::picker-icon {
        color: var(--cltc-muted);
        transition: rotate var(--cltc-duration-press) var(--cltc-ease-in-out);
      }
      #${ROOT_ID} .cltc-profile-select:open::picker-icon,
      .cltc-settings .cltc-profile-select:open::picker-icon {
        rotate: 180deg;
      }
      #${ROOT_ID} .cltc-profile-select:open,
      .cltc-settings .cltc-profile-select:open {
        border-color: color-mix(in srgb, var(--cltc-text) 52%, var(--cltc-border));
        background: color-mix(in srgb, var(--cltc-surface-secondary) 70%, var(--cltc-input));
      }
      #${ROOT_ID} .cltc-profile-select option,
      .cltc-settings .cltc-profile-select option {
        min-height: 32px;
        padding: 7px 9px;
        border-radius: var(--cltc-radius-sm);
        background: var(--cltc-popover);
        color: var(--cltc-text);
      }
      #${ROOT_ID} .cltc-profile-select option:focus,
      #${ROOT_ID} .cltc-profile-select option:checked,
      .cltc-settings .cltc-profile-select option:focus,
      .cltc-settings .cltc-profile-select option:checked {
        background: var(--cltc-hover);
      }
      #${ROOT_ID} .cltc-profile-select option::checkmark,
      .cltc-settings .cltc-profile-select option::checkmark {
        display: none;
      }
      #${ROOT_ID} .cltc-price-input:focus,
      #${ROOT_ID} .cltc-profile-select:focus,
      .cltc-settings .cltc-price-input:focus,
      .cltc-settings .cltc-profile-select:focus {
        border-color: color-mix(in srgb, var(--cltc-text) 58%, var(--cltc-border));
        box-shadow: 0 0 0 2px var(--cltc-focus-ring, color-mix(in srgb, var(--cltc-text) 10%, transparent));
      }
      #${ROOT_ID} .cltc-price-actions,
      .cltc-settings .cltc-price-actions {
        display: flex;
        gap: 8px;
        justify-content: flex-end;
      }
      .cltc-settings .cltc-sync-block {
        display: grid;
        gap: 8px;
      }
      #${ROOT_ID} .cltc-price-actions button,
      #${ROOT_ID} .cltc-price-actions .cltc-link-button,
      .cltc-settings .cltc-price-actions button,
      .cltc-settings .cltc-price-actions .cltc-link-button,
      .cltc-settings .cltc-settings-row button,
      .cltc-settings .cltc-settings-row .cltc-link-button {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-height: 34px;
        padding: 6px 10px;
        border: 1px solid var(--cltc-border);
        border-radius: var(--cltc-radius-control, 8px);
        background: transparent;
        color: inherit;
        font: inherit;
        text-decoration: none;
      }
      .cltc-settings button[data-variant="primary"],
      .cltc-settings .cltc-settings-row button[data-variant="primary"],
      .cltc-settings .cltc-settings-actions button[data-variant="primary"],
      .cltc-settings .cltc-price-actions button[data-variant="primary"] {
        border-color: var(--cltc-primary);
        background: var(--cltc-primary);
        color: var(--cltc-primary-text);
      }
      .cltc-settings button[data-variant="danger"] {
        color: var(--cltc-danger);
      }
      .cltc-settings .cltc-analytics {
        gap: 26px;
      }
      .cltc-settings .cltc-analytics-heading {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 18px;
      }
      .cltc-settings .cltc-analytics-heading > div {
        min-width: 0;
      }
      .cltc-settings .cltc-analytics-toolbar,
      .cltc-settings .cltc-analytics-section-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 14px;
      }
      .cltc-settings .cltc-segmented {
        position: relative;
        display: inline-flex;
        align-items: center;
        gap: 2px;
        padding: 3px;
        border-radius: var(--cltc-radius-control);
        background: var(--cltc-surface-secondary);
        min-width: 236px;
      }
      .cltc-settings .cltc-segmented::before {
        content: "";
        position: absolute;
        z-index: 0;
        top: 3px;
        bottom: 3px;
        left: 3px;
        width: calc((100% - 12px) / 4);
        border-radius: var(--cltc-radius-sm);
        background: var(--cltc-popover);
        box-shadow: 0 1px 2px color-mix(in srgb, var(--cltc-shadow) 34%, transparent);
        pointer-events: none;
        transform: translateX(0);
        transition: transform var(--cltc-duration-data) var(--cltc-ease-out);
      }
      .cltc-settings .cltc-segmented-compact::before {
        width: calc((100% - 8px) / 2);
      }
      .cltc-settings .cltc-segmented[data-cltc-segment-index="1"]::before {
        transform: translateX(calc(100% + 2px));
      }
      .cltc-settings .cltc-segmented[data-cltc-segment-index="2"]::before {
        transform: translateX(calc(200% + 4px));
      }
      .cltc-settings .cltc-segmented[data-cltc-segment-index="3"]::before {
        transform: translateX(calc(300% + 6px));
      }
      .cltc-settings .cltc-segmented[data-cltc-segment-from-index="0"]::before {
        transform: translateX(0);
      }
      .cltc-settings .cltc-segmented[data-cltc-segment-from-index="1"]::before {
        transform: translateX(calc(100% + 2px));
      }
      .cltc-settings .cltc-segmented[data-cltc-segment-from-index="2"]::before {
        transform: translateX(calc(200% + 4px));
      }
      .cltc-settings .cltc-segmented[data-cltc-segment-from-index="3"]::before {
        transform: translateX(calc(300% + 6px));
      }
      .cltc-settings .cltc-segmented[data-cltc-segment-from-index]::before {
        transition: none;
      }
      .cltc-settings .cltc-segmented button,
      .cltc-settings .cltc-date-range-trigger,
      .cltc-settings .cltc-date-range-clear,
      .cltc-settings .cltc-analytics-filter,
      .cltc-settings .cltc-analytics-expand,
      .cltc-settings .cltc-analytics-degraded {
        min-height: 30px;
        padding: 5px 9px;
        border: 0;
        border-radius: var(--cltc-radius-sm);
        background: transparent;
        color: var(--cltc-muted);
        cursor: pointer;
        font: inherit;
      }
      .cltc-settings .cltc-segmented button {
        position: relative;
        z-index: 1;
        flex: 1 1 0;
        min-width: 0;
        white-space: nowrap;
        transition: transform var(--cltc-duration-press) var(--cltc-ease-out),
          opacity var(--cltc-duration-press) var(--cltc-ease-out),
          background var(--cltc-duration-press) var(--cltc-ease-out),
          color var(--cltc-duration-press) var(--cltc-ease-out);
      }
      .cltc-settings .cltc-segmented button:focus-visible {
        background: var(--cltc-hover);
        color: var(--cltc-text);
        outline: none;
        box-shadow: 0 1px 2px color-mix(in srgb, var(--cltc-shadow) 34%, transparent);
      }
      .cltc-settings .cltc-segmented button[data-active="true"] {
        background: transparent;
        color: var(--cltc-text);
        outline: none;
        font-weight: 600;
      }
      .cltc-settings .cltc-date-range-trigger:focus-visible {
        background: color-mix(in srgb, var(--cltc-text) 8%, var(--cltc-input));
        color: var(--cltc-text);
        outline: none;
        box-shadow: 0 1px 2px color-mix(in srgb, var(--cltc-shadow) 34%, transparent);
      }
      .cltc-settings .cltc-segmented-compact button {
        min-width: 52px;
      }
      .cltc-settings .cltc-segmented-compact {
        min-width: 116px;
      }
      .cltc-settings .cltc-date-range-trigger {
        display: inline-flex;
        align-items: center;
        gap: 7px;
        min-width: 0;
        max-width: 100%;
        padding: 5px 10px;
        border: 1px solid var(--cltc-border);
        background: var(--cltc-input);
        color: var(--cltc-text);
        font-variant-numeric: tabular-nums;
      }
      .cltc-settings .cltc-date-range-trigger[data-empty="true"] {
        color: var(--cltc-muted);
      }
      .cltc-settings .cltc-date-range-trigger[data-empty="false"] .cltc-date-range-label {
        font-weight: 500;
      }
      .cltc-settings .cltc-date-range-trigger[data-open="true"] {
        background: color-mix(in srgb, var(--cltc-text) 12%, var(--cltc-input));
      }
      .cltc-settings .cltc-date-range-icon {
        flex: none;
        width: 14px;
        height: 14px;
        fill: none;
        stroke: currentColor;
        stroke-width: 1.3;
        stroke-linecap: round;
        stroke-linejoin: round;
        opacity: .78;
      }
      .cltc-settings .cltc-date-range-chevron {
        flex: none;
        width: 12px;
        height: 12px;
        fill: none;
        stroke: currentColor;
        stroke-width: 1.4;
        stroke-linecap: round;
        stroke-linejoin: round;
        opacity: .55;
        transition: transform var(--cltc-duration-press) var(--cltc-ease-out);
      }
      .cltc-settings .cltc-date-range-trigger[data-open="true"] .cltc-date-range-chevron {
        transform: rotate(180deg);
      }
      .cltc-settings .cltc-date-range-label {
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .cltc-settings .cltc-date-range-clear {
        flex: none;
      }
      .cltc-settings .cltc-date-range-clear:focus-visible {
        background: var(--cltc-popover);
        color: var(--cltc-text);
        outline: none;
        box-shadow: 0 1px 2px color-mix(in srgb, var(--cltc-shadow) 34%, transparent);
      }
      .cltc-settings-overlay .cltc-analytics-date-input {
        position: fixed;
        width: 1px;
        height: 1px;
        padding: 0;
        border: 0;
        opacity: 0;
        pointer-events: none;
      }
      .cltc-settings .cltc-analytics-date-range {
        display: flex;
        align-items: center;
        gap: 6px;
        min-width: 0;
      }
      .cltc-settings .cltc-analytics-date-range[hidden] {
        display: none;
      }
      .cltc-settings .cltc-analytics-filter,
      .cltc-settings .cltc-analytics-filter,
      .cltc-settings .cltc-analytics-expand,
      .cltc-settings .cltc-analytics-degraded {
        min-height: 30px;
        padding: 5px 9px;
        border: 0;
        border-radius: var(--cltc-radius-sm);
        background: transparent;
        color: var(--cltc-muted);
        cursor: pointer;
        font: inherit;
      }
      .cltc-settings .cltc-analytics-filter {
        flex: 0 1 auto;
        max-width: 230px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        background: var(--cltc-surface-secondary);
        color: var(--cltc-text);
      }
      .cltc-settings .cltc-analytics-degraded {
        width: 100%;
        min-height: 34px;
        padding: 8px 10px;
        color: var(--cltc-muted);
        text-align: left;
        background: color-mix(in srgb, #b45309 8%, transparent);
      }
      .cltc-settings .cltc-analytics-metrics {
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        border-top: 1px solid var(--cltc-border-subtle);
        border-bottom: 1px solid var(--cltc-border-subtle);
      }
      .cltc-settings .cltc-analytics-metric {
        display: grid;
        min-width: 0;
        gap: 4px;
        justify-items: start;
        text-align: left;
        padding: 16px 14px;
        border-right: 1px solid var(--cltc-border-subtle);
      }
      .cltc-settings .cltc-analytics-metric:last-child {
        border-right: 0;
      }
      .cltc-settings .cltc-analytics-metric > span,
      .cltc-settings .cltc-analytics-metric small {
        overflow: hidden;
        max-width: 100%;
        color: var(--cltc-muted);
        font-size: 11px;
        line-height: 16px;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .cltc-settings .cltc-analytics-metric strong {
        overflow: hidden;
        max-width: 100%;
        font-size: 18px;
        font-weight: 600;
        line-height: 24px;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .cltc-settings .cltc-analytics-section {
        display: grid;
        gap: 14px;
        padding-top: 22px;
        border-top: 1px solid var(--cltc-border-subtle);
      }
      .cltc-settings .cltc-analytics-section-head h3 {
        margin: 0;
        font-size: 14px;
        font-weight: 600;
      }
      .cltc-settings .cltc-analytics-section-head p {
        margin: 2px 0 0;
        color: var(--cltc-muted);
        font-size: 11px;
      }
      .cltc-settings .cltc-analytics-chart {
        display: block;
        width: 100%;
        min-height: 190px;
        overflow: visible;
      }
      .cltc-settings .cltc-analytics-chart rect[data-chart-index] {
        fill: color-mix(in srgb, var(--cltc-text) 78%, transparent);
        stroke: transparent !important;
        stroke-width: 2px;
        vector-effect: non-scaling-stroke;
        outline: none !important;
        transform-box: fill-box;
        transform-origin: center bottom;
        animation: cltc-analytics-bar-grow 520ms cubic-bezier(.16, 1, .3, 1) var(--cltc-chart-bar-delay, 0ms) both;
        transition: opacity var(--cltc-duration-tooltip) var(--cltc-ease-out);
      }
      @keyframes cltc-analytics-bar-grow {
        from { transform: scaleY(0); }
        to { transform: scaleY(1); }
      }
      .cltc-settings .cltc-analytics-chart rect[data-chart-index]:focus-visible {
        opacity: .66;
        outline: none !important;
      }
      .cltc-settings .cltc-analytics-chart rect[data-chart-index]:focus,
      .cltc-settings .cltc-analytics-chart rect[data-chart-index]:focus-visible {
        stroke: var(--cltc-text) !important;
      }
      .cltc-settings .cltc-analytics-chart text {
        fill: var(--cltc-muted);
        font-size: 11px;
      }
      .cltc-settings .cltc-analytics-chart .cltc-analytics-chart-empty {
        fill: var(--cltc-muted);
        font-size: 13px;
      }
      .cltc-settings .cltc-analytics-tooltip {
        opacity: 0;
        pointer-events: none;
        transition: opacity var(--cltc-duration-tooltip) var(--cltc-ease-out);
      }
      .cltc-settings .cltc-analytics-bar:focus-within .cltc-analytics-tooltip {
        opacity: 1;
      }
      @media (hover: hover) and (pointer: fine) {
        .cltc-settings .cltc-analytics-chart rect[data-chart-index]:hover {
          opacity: .66;
          outline: none !important;
        }
        .cltc-settings .cltc-analytics-bar:hover .cltc-analytics-tooltip {
          opacity: 1;
        }
      }
      .cltc-settings .cltc-analytics-tooltip rect {
        fill: var(--cltc-text);
      }
      .cltc-settings .cltc-analytics-tooltip text {
        fill: var(--cltc-popover);
        font-size: 10px;
        font-weight: 600;
      }
      .cltc-settings .cltc-composition-bar {
        display: flex;
        gap: 2px;
        width: 100%;
        height: 10px;
        overflow: hidden;
        border-radius: 5px;
        background: var(--cltc-surface-secondary);
      }
      .cltc-settings .cltc-composition-bar span {
        min-width: 0;
      }
      .cltc-settings .cltc-composition-bar [data-tone="neutral"],
      .cltc-settings .cltc-composition-legend [data-tone="neutral"] { background: #8e8e93; }
      .cltc-settings .cltc-composition-bar [data-tone="green"],
      .cltc-settings .cltc-composition-legend [data-tone="green"] { background: var(--cltc-success); }
      .cltc-settings .cltc-composition-bar [data-tone="blue"],
      .cltc-settings .cltc-composition-legend [data-tone="blue"] { background: var(--cltc-chart-blue); }
      .cltc-settings .cltc-composition-bar [data-tone="purple"],
      .cltc-settings .cltc-composition-legend [data-tone="purple"] { background: var(--cltc-chart-purple); }
      .cltc-settings .cltc-composition-legend {
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: 8px 16px;
      }
      .cltc-settings .cltc-composition-legend span {
        display: grid;
        grid-template-columns: 8px minmax(0, 1fr) auto;
        align-items: center;
        gap: 7px;
        min-width: 0;
        color: var(--cltc-muted);
        font-size: 11px;
      }
      .cltc-settings .cltc-composition-legend i {
        width: 7px;
        height: 7px;
        border-radius: 2px;
      }
      .cltc-settings .cltc-composition-legend strong {
        color: var(--cltc-text);
        font-weight: 500;
      }
      .cltc-settings .cltc-analytics-model-head,
      .cltc-settings .cltc-analytics-model-row {
        display: grid;
        grid-template-columns: minmax(150px, 1.45fr) repeat(4, minmax(72px, .7fr));
        gap: 10px;
        align-items: center;
      }
      .cltc-settings .cltc-analytics-model-head {
        padding: 0 9px;
        color: var(--cltc-muted);
        font-size: 11px;
      }
      .cltc-settings .cltc-analytics-models {
        max-height: 320px;
        overflow: auto;
        border-top: 1px solid var(--cltc-border-subtle);
        border-bottom: 1px solid var(--cltc-border-subtle);
      }
      .cltc-settings .cltc-analytics-model-row {
        width: 100%;
        min-height: 38px;
        padding: 7px 9px;
        border: 0;
        border-bottom: 1px solid var(--cltc-border-subtle);
        background: transparent;
        color: inherit;
        cursor: pointer;
        font: inherit;
        text-align: left;
      }
      .cltc-settings .cltc-analytics-model-row:focus-visible {
        background: var(--cltc-hover);
        outline: none;
      }
      .cltc-settings .cltc-analytics-model-row[data-hidden="true"] {
        display: none;
      }
      .cltc-settings .cltc-analytics-model-row span {
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        font-size: 12px;
      }
      .cltc-settings .cltc-analytics-expand {
        justify-self: start;
        padding-left: 0;
        color: var(--cltc-text);
      }
      .cltc-settings .cltc-analytics-empty {
        padding: 24px 10px;
        color: var(--cltc-muted);
        font-size: 12px;
        text-align: center;
      }
      @media (hover: hover) and (pointer: fine) {
        #${ROOT_ID} .cltc-price-head button:hover,
        .cltc-settings .cltc-price-head button:hover,
        #${ROOT_ID} .cltc-price-actions button:hover,
        #${ROOT_ID} .cltc-price-actions .cltc-link-button:hover,
        #${ROOT_ID} .cltc-price-row:hover,
        .cltc-settings .cltc-price-actions button:hover,
        .cltc-settings .cltc-price-actions .cltc-link-button:hover,
        .cltc-settings .cltc-settings-row button:hover,
        .cltc-settings .cltc-settings-row .cltc-link-button:hover,
        .cltc-settings .cltc-price-row:hover,
        .cltc-settings .cltc-analytics-model-row:hover {
          background: var(--cltc-hover);
        }
        .cltc-settings .cltc-settings-nav button:hover {
          background: var(--cltc-hover);
          color: var(--cltc-text);
          outline: none;
        }
        #${ROOT_ID} .cltc-profile-select:hover,
        .cltc-settings .cltc-profile-select:hover {
          border-color: color-mix(in srgb, var(--cltc-text) 52%, var(--cltc-border));
          background: color-mix(in srgb, var(--cltc-surface-secondary) 70%, var(--cltc-input));
        }
        #${ROOT_ID} .cltc-profile-select option:hover,
        .cltc-settings .cltc-profile-select option:hover {
          background: var(--cltc-hover);
        }
        .cltc-settings button[data-variant="primary"]:hover {
          border-color: var(--cltc-primary);
          background: color-mix(in srgb, var(--cltc-primary) 88%, var(--cltc-canvas));
          color: var(--cltc-primary-text);
        }
        .cltc-settings .cltc-date-range-trigger:hover {
          background: color-mix(in srgb, var(--cltc-text) 8%, var(--cltc-input));
        }
        .cltc-settings .cltc-date-range-clear:hover {
          background: var(--cltc-hover);
          color: var(--cltc-text);
          outline: none;
        }
      }
      @media (max-width: 680px) {
        .cltc-settings-overlay {
          align-items: stretch;
          padding: 12px;
        }
        .cltc-settings-modal {
          width: 100%;
          height: calc(100vh - 24px);
          max-height: none;
        }
        .cltc-settings .cltc-settings-shell {
          grid-template-columns: minmax(0, 1fr);
          grid-template-rows: auto minmax(0, 1fr);
        }
        .cltc-settings .cltc-settings-sidebar {
          display: block;
          padding: 8px 10px;
          border-right: 0;
          border-bottom: 1px solid var(--cltc-border-subtle);
          overflow-x: auto;
        }
        .cltc-settings .cltc-settings-nav {
          display: flex;
          min-width: max-content;
        }
        .cltc-settings .cltc-settings-nav button {
          width: auto;
          white-space: nowrap;
        }
        .cltc-settings .cltc-settings-content {
          padding: 22px 18px 26px;
        }
        .cltc-settings .cltc-price-grid {
          grid-template-columns: minmax(0, 1fr);
        }
        .cltc-settings .cltc-price-row {
          grid-template-columns: minmax(112px, 1fr) repeat(4, minmax(42px, .45fr));
          font-size: 11px;
        }
        .cltc-settings .cltc-analytics-toolbar,
        .cltc-settings .cltc-analytics-section-head {
          align-items: flex-start;
          flex-wrap: wrap;
        }
        .cltc-settings .cltc-analytics-date-range {
          width: 100%;
        }
        .cltc-settings .cltc-date-range-trigger {
          flex: 1 1 auto;
        }
        .cltc-settings .cltc-analytics-metrics {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }
        .cltc-settings .cltc-analytics-metric:nth-child(2) {
          border-right: 0;
        }
        .cltc-settings .cltc-analytics-metric:nth-child(-n + 2) {
          border-bottom: 1px solid var(--cltc-border-subtle);
        }
        .cltc-settings .cltc-composition-legend {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }
        .cltc-settings .cltc-analytics-model-head,
        .cltc-settings .cltc-analytics-model-row {
          grid-template-columns: minmax(126px, 1.4fr) repeat(4, minmax(62px, .65fr));
        }
        .cltc-settings .cltc-analytics-models {
          overflow-x: auto;
        }
      }
      @media (prefers-reduced-motion: reduce) {
        #${ROOT_ID} .cltc-button,
        #${ROOT_ID} .cltc-price-head button,
        #${ROOT_ID} .cltc-price-actions button,
        .cltc-settings button,
        #${ROOT_ID} .cltc-button:active,
        #${ROOT_ID} .cltc-price-head button:active,
        #${ROOT_ID} .cltc-price-actions button:active,
        .cltc-settings button:active {
          transition: none;
          transform: none;
        }
        .cltc-settings .cltc-analytics-chart rect[data-chart-index] {
          animation: none;
          transform: scaleY(1);
          transition: opacity var(--cltc-duration-tooltip) var(--cltc-ease-out);
        }
        .cltc-settings .cltc-toggle-field input,
        .cltc-settings .cltc-toggle-field input:active,
        .cltc-settings .cltc-toggle-field input::after,
        .cltc-settings .cltc-profile-select,
        .cltc-settings .cltc-price-input,
        .cltc-settings .cltc-profile-select::picker-icon {
          transition: none;
          transform: none;
        }
        .cltc-settings-overlay .cltc-profile-save-toast {
          transform: translate(-50%, 0);
          transition: opacity var(--cltc-duration-press) var(--cltc-ease-out), visibility 0s linear var(--cltc-duration-press);
        }
      }
      .cltc-settings-overlay.cltc-settings-embedded {
        position: static;
        inset: auto;
        z-index: auto;
        display: block;
        align-items: initial;
        justify-content: initial;
        width: 100%;
        height: 100%;
        padding: 0;
        overflow: auto;
        background: var(--cltc-chrome);
      }
      .cltc-settings-overlay.cltc-settings-embedded .cltc-settings-content {
        background: var(--cltc-canvas);
        /* Windows-style subtle rounding on the outer three corners. */
        border-radius: var(--cltc-radius-modal) 8px 8px 8px;
      }
      .cltc-settings-overlay.cltc-settings-embedded .cltc-settings-modal {
        width: 100%;
        height: 100%;
        max-height: none;
        border: 0;
        border-radius: 0;
        box-shadow: none;
        background: transparent;
        transform: none;
        opacity: 1;
      }
      .cltc-settings-overlay.cltc-settings-embedded .cltc-settings-shell {
        height: 100%;
      }
      .cltc-settings-overlay.cltc-settings-embedded .cltc-price-head {
        display: none;
      }
      .cltc-update-cluster {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        margin-left: 10px;
        min-width: 0;
        font-size: 12px;
        font-weight: 400;
        line-height: 1.4;
        white-space: nowrap;
        color: var(--color-token-text-tertiary, rgba(128, 132, 140, 0.9));
      }
      .cltc-update-cluster button {
        margin: 0;
        padding: 0;
        border: 0;
        background: transparent;
        font: inherit;
        color: inherit;
        cursor: pointer;
      }
      .cltc-update-cluster button:hover {
        text-decoration: underline;
        text-underline-offset: 3px;
      }
      .cltc-update-cluster button:focus-visible {
        outline: 2px solid var(--color-token-focus-border, #3a83f7);
        outline-offset: 2px;
        border-radius: 3px;
      }
      .cltc-update-cluster .cltc-update-action {
        color: var(--color-token-text-primary, inherit);
        font-weight: 600;
      }
      .cltc-update-cluster .cltc-update-action[data-tone="warn"] {
        color: #e5484d;
      }
      .cltc-update-cluster .cltc-update-version {
        position: relative;
      }
      .cltc-update-cluster[data-phase="available"] .cltc-update-version::after {
        content: "";
        position: absolute;
        top: -2px;
        right: -6px;
        width: 6px;
        height: 6px;
        border-radius: 999px;
        background: #e5484d;
        pointer-events: none;
      }
      .cltc-update-cluster .cltc-update-github {
        display: inline-flex;
        align-items: center;
        color: inherit;
        opacity: 0.72;
      }
      .cltc-update-cluster .cltc-update-github:hover {
        color: var(--color-token-text-primary, inherit);
        opacity: 1;
        text-decoration: none;
      }
      .cltc-update-cluster .cltc-update-github svg {
        display: block;
      }

      /* ===== Settings refresh: shell, groups, data surfaces ===== */
      .cltc-settings-overlay,
      .cltc-settings {
        --cltc-success-soft: color-mix(in srgb, var(--cltc-success) 12%, transparent);
        --cltc-warning-soft: color-mix(in srgb, var(--cltc-warning) 12%, transparent);
        --cltc-danger-soft: color-mix(in srgb, var(--cltc-danger) 10%, transparent);
        --cltc-content-form: 860px;
        --cltc-content-data: 860px;
        --cltc-price-head-h: 34px;
        --cltc-radius-group: 10px;
      }
      .cltc-settings [hidden] {
        display: none !important;
      }
      .cltc-settings .cltc-settings-shell {
        grid-template-columns: 216px minmax(0, 1fr);
      }
      .cltc-settings .cltc-settings-sidebar {
        padding: 16px 12px;
      }
      .cltc-settings .cltc-settings-nav {
        gap: 2px;
      }
      .cltc-settings .cltc-nav-group {
        margin: 14px 10px 4px;
        color: var(--cltc-muted);
        font-size: 11px;
        font-weight: 500;
        line-height: 16px;
        letter-spacing: .01em;
      }
      .cltc-settings .cltc-nav-group:first-child {
        margin-top: 0;
      }
      .cltc-settings .cltc-settings-nav button {
        display: flex;
        align-items: center;
        gap: 8px;
        min-height: 36px;
        padding: 7px 10px;
      }
      .cltc-settings .cltc-nav-icon {
        width: 16px;
        height: 16px;
        flex: none;
        opacity: .72;
        transition: opacity var(--cltc-duration-press) var(--cltc-ease-out);
      }
      .cltc-settings .cltc-settings-nav button[data-active="true"] .cltc-nav-icon {
        opacity: 1;
      }
      .cltc-settings .cltc-settings-content {
        padding: 32px 40px 48px;
      }
      .cltc-settings .cltc-settings-content[data-panel-kind="form"] .cltc-settings-section {
        max-width: var(--cltc-content-form);
      }
      .cltc-settings .cltc-settings-content[data-panel-kind="data"] .cltc-settings-section {
        max-width: var(--cltc-content-data);
      }
      .cltc-settings .cltc-settings-section {
        width: 100%;
        margin-inline: auto;
        gap: 24px;
      }
      .cltc-settings .cltc-settings-section-heading h2 {
        font-size: 22px;
        line-height: 30px;
        letter-spacing: -.01em;
      }
      .cltc-settings .cltc-settings-section-heading p {
        font-size: 13px;
        line-height: 20px;
      }
      .cltc-settings .cltc-group {
        display: grid;
        border: 1px solid var(--cltc-border-subtle);
        border-radius: var(--cltc-radius-group);
        background: var(--cltc-surface);
        overflow: hidden;
      }
      .cltc-settings .cltc-group-head {
        padding: 14px 16px 12px;
        border-bottom: 1px solid var(--cltc-border-subtle);
        background: color-mix(in srgb, var(--cltc-surface-secondary) 55%, transparent);
      }
      .cltc-settings .cltc-group-head h3 {
        margin: 0;
        font-size: 13px;
        font-weight: 600;
        line-height: 18px;
      }
      .cltc-settings .cltc-group-head p {
        margin: 2px 0 0;
        color: var(--cltc-muted);
        font-size: 11px;
        line-height: 16px;
      }
      .cltc-settings .cltc-group-body {
        display: grid;
      }
      .cltc-settings .cltc-group-body > .cltc-settings-row,
      .cltc-settings .cltc-group-body > .cltc-toggle-field {
        min-height: 52px;
        padding: 12px 16px;
        border-top: 1px solid var(--cltc-border-subtle);
      }
      .cltc-settings .cltc-group-body > :first-child {
        border-top: 0;
      }
      .cltc-settings .cltc-group-body > .cltc-price-grid {
        padding: 14px 16px;
      }
      .cltc-settings .cltc-group-body > .cltc-sync-block {
        padding: 12px 16px;
      }
      .cltc-settings .cltc-sync-block .cltc-settings-row {
        min-height: 0;
        padding: 0;
        border-top: 0;
      }
      .cltc-settings .cltc-settings-row button,
      .cltc-settings .cltc-settings-row .cltc-link-button,
      .cltc-settings .cltc-settings-actions button {
        min-height: 32px;
        padding: 5px 10px;
        border: 1px solid var(--cltc-border);
        border-radius: var(--cltc-radius-control);
        background: transparent;
        color: inherit;
        font: inherit;
        cursor: pointer;
      }
      .cltc-settings .cltc-settings-actions {
        display: flex;
        align-items: center;
        justify-content: flex-end;
        gap: 12px;
      }
      .cltc-settings .cltc-inline-status {
        color: var(--cltc-success);
        font-size: 12px;
        line-height: 18px;
        opacity: 0;
        transform: translateY(1px);
        transition: opacity var(--cltc-duration-popover) var(--cltc-ease-out),
          transform var(--cltc-duration-popover) var(--cltc-ease-out);
      }
      .cltc-settings .cltc-inline-status[data-visible="true"] {
        opacity: 1;
        transform: translateY(0);
      }
      .cltc-settings .cltc-inline-status[data-tone="error"] {
        color: var(--cltc-danger);
      }
      .cltc-settings-embedded .cltc-profile-save-toast {
        position: absolute !important;
        width: 1px !important;
        height: 1px !important;
        padding: 0 !important;
        margin: -1px !important;
        border: 0 !important;
        overflow: hidden !important;
        clip: rect(0 0 0 0) !important;
        white-space: nowrap !important;
      }
      .cltc-settings .cltc-profile-card {
        display: grid;
        grid-template-columns: 44px minmax(0, 1fr) auto;
        align-items: center;
        gap: 14px;
        padding: 16px;
        border: 1px solid var(--cltc-border-subtle);
        border-radius: var(--cltc-radius-group);
        background: var(--cltc-surface);
      }
      .cltc-settings .cltc-profile-card[data-disabled="true"] {
        opacity: .74;
      }
      .cltc-settings .cltc-profile-avatar {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 44px;
        height: 44px;
        border-radius: 50%;
        background: color-mix(in srgb, var(--cltc-text) 9%, transparent);
        color: var(--cltc-text);
        font-size: 16px;
        font-weight: 600;
        object-fit: cover;
      }
      .cltc-settings .cltc-profile-identity {
        display: grid;
        min-width: 0;
        gap: 3px;
      }
      .cltc-settings .cltc-profile-identity strong {
        overflow: hidden;
        font-size: 14px;
        font-weight: 600;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .cltc-settings .cltc-profile-identity small {
        color: var(--cltc-muted);
        font-size: 11px;
      }
      .cltc-settings .cltc-profile-badge {
        display: inline-flex;
        align-items: center;
        justify-self: start;
        min-height: 20px;
        padding: 0 7px;
        border: 1px solid var(--cltc-border-subtle);
        border-radius: var(--cltc-radius-pill);
        color: var(--cltc-muted);
        font-size: 11px;
        line-height: 18px;
      }
      .cltc-settings .cltc-profile-switch {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        color: var(--cltc-muted);
        font-size: 11px;
      }
      .cltc-settings .cltc-profile-switch input {
        appearance: none;
        position: relative;
        width: 34px;
        height: 20px;
        margin: 0;
        border: 1px solid var(--cltc-border);
        border-radius: var(--cltc-radius-pill);
        background: color-mix(in srgb, var(--cltc-text) 16%, transparent);
        cursor: pointer;
        transition: background var(--cltc-duration-press) var(--cltc-ease-out),
          border-color var(--cltc-duration-press) var(--cltc-ease-out);
      }
      .cltc-settings .cltc-profile-switch input::after {
        content: "";
        position: absolute;
        top: 2px;
        left: 2px;
        width: 14px;
        height: 14px;
        border-radius: var(--cltc-radius-pill);
        background: var(--cltc-muted);
        box-shadow: 0 1px 3px rgba(0, 0, 0, .22);
        transition: transform var(--cltc-duration-press) var(--cltc-ease-out),
          background var(--cltc-duration-press) var(--cltc-ease-out);
      }
      .cltc-settings .cltc-profile-switch input:checked {
        border-color: var(--cltc-text);
        background: var(--cltc-text);
      }
      .cltc-settings .cltc-profile-switch input:checked::after {
        transform: translateX(14px);
        background: var(--cltc-surface);
      }
      .cltc-settings .cltc-profile-switch input:focus-visible {
        outline: 2px solid var(--cltc-focus-ring);
        outline-offset: 2px;
      }
      .cltc-settings .cltc-price-toolbar {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 8px;
      }
      .cltc-settings .cltc-price-search {
        flex: 1 1 220px;
        min-width: 180px;
        height: 34px;
        padding: 6px 10px;
        border: 1px solid var(--cltc-border);
        border-radius: var(--cltc-radius-control);
        background: var(--cltc-input);
        color: var(--cltc-text);
        font: inherit;
        outline: none;
      }
      .cltc-settings .cltc-price-search:focus {
        border-color: color-mix(in srgb, var(--cltc-text) 58%, var(--cltc-border));
        box-shadow: 0 0 0 2px var(--cltc-focus-ring);
      }
      .cltc-settings .cltc-price-filter {
        min-height: 30px;
        padding: 5px 9px;
        border: 0;
        border-radius: var(--cltc-radius-sm);
        background: transparent;
        color: var(--cltc-muted);
        font: inherit;
        cursor: pointer;
        transition: background var(--cltc-duration-press) var(--cltc-ease-out),
          color var(--cltc-duration-press) var(--cltc-ease-out);
      }
      .cltc-settings .cltc-price-filter[data-active="true"] {
        background: var(--cltc-active);
        color: var(--cltc-text);
        font-weight: 600;
      }
      .cltc-settings .cltc-price-layout {
        display: grid;
        grid-template-columns: minmax(0, 1.2fr) minmax(0, .8fr);
        align-items: start;
        gap: 20px;
      }
      .cltc-settings .cltc-price-list-pane,
      .cltc-settings .cltc-price-editor-pane {
        min-width: 0;
      }
      .cltc-settings .cltc-price-editor-pane {
        position: sticky;
        top: 16px;
        align-self: start;
        padding: 16px;
        border: 1px solid var(--cltc-border-subtle);
        border-radius: var(--cltc-radius-group);
        background: var(--cltc-surface);
      }
      .cltc-settings .cltc-price-editor-pane .cltc-price-meta {
        display: flex;
        align-items: center;
        gap: 6px;
        margin: 0 0 2px;
        font-size: 12px;
        line-height: 18px;
      }
      .cltc-settings .cltc-price-editor-pane .cltc-price-badge {
        margin-left: 0;
      }
      .cltc-settings .cltc-price-editor-pane .cltc-price-editor {
        padding-top: 0;
        border-top: 0;
      }
      .cltc-settings .cltc-price-editor-pane .cltc-price-actions {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 8px;
      }
      .cltc-settings .cltc-price-editor-pane .cltc-price-actions button {
        width: 100%;
        white-space: nowrap;
      }
      .cltc-settings .cltc-price-list {
        max-height: min(52vh, 520px);
      }
      .cltc-settings .cltc-price-row {
        min-height: 40px;
      }
      .cltc-settings .cltc-price-row[data-active="true"] {
        box-shadow: inset 2px 0 0 var(--cltc-text);
      }
      .cltc-settings .cltc-price-unit {
        margin: 0 0 12px;
        color: var(--cltc-muted);
        font-size: 11px;
        line-height: 16px;
      }
      .cltc-settings .cltc-price-badge {
        display: inline-flex;
        align-items: center;
        min-height: 18px;
        margin-left: 6px;
        padding: 0 6px;
        border: 1px solid var(--cltc-border-subtle);
        border-radius: var(--cltc-radius-pill);
        color: var(--cltc-muted);
        font-size: 10px;
        font-weight: 500;
        line-height: 16px;
        vertical-align: middle;
      }
      .cltc-settings .cltc-price-badge[data-tone="official"] {
        color: var(--cltc-success);
        border-color: color-mix(in srgb, var(--cltc-success) 42%, var(--cltc-border-subtle));
      }
      .cltc-settings .cltc-price-badge[data-tone="custom"] {
        color: var(--cltc-text);
      }
      .cltc-settings .cltc-price-badge[data-tone="warn"] {
        color: var(--cltc-warning);
        border-color: color-mix(in srgb, var(--cltc-warning) 42%, var(--cltc-border-subtle));
      }
      .cltc-settings .cltc-sync-status::before {
        content: "";
        display: inline-block;
        width: 6px;
        height: 6px;
        margin-right: 6px;
        border-radius: 50%;
        background: var(--cltc-muted);
        vertical-align: 1px;
      }
      .cltc-settings .cltc-sync-status[data-tone="success"]::before {
        background: var(--cltc-success);
      }
      .cltc-settings .cltc-sync-status[data-tone="warn"] {
        color: var(--cltc-warning);
      }
      .cltc-settings .cltc-sync-status[data-tone="warn"]::before {
        background: var(--cltc-warning);
      }
      .cltc-settings .cltc-price-sync {
        padding: 8px 12px;
        border: 1px solid var(--cltc-border-subtle);
        border-radius: var(--cltc-radius-control);
        background: var(--cltc-surface-secondary);
      }
      .cltc-settings .cltc-price-sync[data-tone="ok"] {
        border-color: color-mix(in srgb, var(--cltc-success) 28%, var(--cltc-border-subtle));
      }
      .cltc-settings .cltc-price-sync[data-tone="warn"] {
        border-color: color-mix(in srgb, var(--cltc-warning) 36%, var(--cltc-border-subtle));
        background: var(--cltc-warning-soft);
        color: var(--cltc-warning);
      }
      .cltc-settings .cltc-price-input[aria-invalid="true"] {
        border-color: var(--cltc-danger);
        box-shadow: 0 0 0 2px var(--cltc-danger-soft);
      }
      .cltc-settings .cltc-price-error {
        color: var(--cltc-danger);
        font-size: 11px;
        line-height: 16px;
      }
      .cltc-settings .cltc-price-empty {
        padding: 24px 12px;
        color: var(--cltc-muted);
        font-size: 12px;
        text-align: center;
      }
      .cltc-settings .cltc-analytics-grid line {
        stroke: var(--cltc-border-subtle);
        stroke-width: 1;
        vector-effect: non-scaling-stroke;
      }
      .cltc-settings .cltc-analytics-grid text {
        fill: var(--cltc-muted);
        font-size: 10px;
      }
      .cltc-settings .cltc-analytics-metrics {
        gap: 24px;
        margin-left: 6.7%;
        border: 0;
      }
      .cltc-settings .cltc-analytics-metric {
        padding: 0;
        border: 0;
      }
      .cltc-settings .cltc-analytics-metric strong {
        font-size: 24px;
        line-height: 30px;
      }
      .cltc-settings .cltc-analytics-metric small {
        display: inline-flex;
        align-items: center;
        justify-self: start;
        min-height: 20px;
        padding: 0 7px;
        border-radius: var(--cltc-radius-pill);
        background: color-mix(in srgb, var(--cltc-text) 5%, transparent);
      }
      .cltc-settings .cltc-analytics-metric small[data-tone="good"] {
        background: var(--cltc-success-soft);
        color: color-mix(in srgb, var(--cltc-success) 82%, var(--cltc-text));
      }
      .cltc-settings .cltc-analytics-metric small[data-tone="bad"] {
        background: var(--cltc-danger-soft);
        color: color-mix(in srgb, var(--cltc-danger) 86%, var(--cltc-text));
      }
      .cltc-settings .cltc-analytics-share {
        display: block;
        padding: 0 4px;
        border-radius: 3px;
        background: linear-gradient(
          to right,
          color-mix(in srgb, var(--cltc-text) 9%, transparent) var(--cltc-share, 0%),
          transparent var(--cltc-share, 0%)
        );
        text-align: right;
      }
      .cltc-settings .cltc-analytics-split {
        display: grid;
        grid-template-columns: minmax(0, 1fr);
        align-items: start;
        gap: 24px;
      }
      /* Density pass: more breathing room and full-bleed sidebar. */
      .codex-plus-modal-body:has(> .cltc-settings-embedded) {
        padding: 0 !important;
        overflow: hidden !important;
        scrollbar-gutter: auto !important;
      }
      .codex-plus-modal-content:has(.cltc-settings-embedded) .codex-plus-modal-header,
      .codex-plus-page-overlay:has(.cltc-settings-embedded) .codex-plus-modal-header {
        background: var(--color-token-side-bar-background, #f6f6f6) !important;
        color: var(--color-token-text-primary, #1a1c1f) !important;
      }
      .cltc-settings-embedded .cltc-settings-modal {
        grid-template-rows: minmax(0, 1fr);
      }
      .cltc-settings .cltc-settings-shell {
        grid-template-columns: 224px minmax(0, 1fr);
      }
      .cltc-settings .cltc-settings-sidebar {
        padding: 18px 14px;
      }
      .cltc-settings .cltc-settings-nav {
        gap: 3px;
      }
      .cltc-settings .cltc-nav-group {
        margin: 18px 10px 6px;
      }
      .cltc-settings .cltc-settings-nav button {
        min-height: 38px;
        padding: 8px 10px;
      }
      .cltc-settings .cltc-settings-content {
        padding: 36px 44px 52px;
        scrollbar-gutter: stable;
      }
      .cltc-settings .cltc-settings-section {
        gap: 28px;
      }
      .cltc-settings .cltc-settings-section-heading {
        gap: 6px;
      }
      .cltc-settings .cltc-group-head {
        padding: 16px 18px 14px;
      }
      .cltc-settings .cltc-group-body > .cltc-settings-row,
      .cltc-settings .cltc-group-body > .cltc-toggle-field {
        min-height: 56px;
        padding: 14px 18px;
      }
      .cltc-settings .cltc-group-body > .cltc-price-grid {
        padding: 16px 18px;
        gap: 16px 14px;
      }
      .cltc-settings .cltc-group-body > .cltc-sync-block {
        padding: 14px 18px;
      }
      .cltc-settings .cltc-sync-block {
        gap: 10px;
      }
      .cltc-settings .cltc-profile-card {
        padding: 18px;
        gap: 16px;
      }
      .cltc-settings .cltc-profile-form {
        gap: 16px 14px;
      }
      .cltc-settings .cltc-price-toolbar {
        gap: 10px;
      }
      .cltc-settings .cltc-price-search {
        height: 38px;
        padding: 7px 12px;
      }
      .cltc-settings .cltc-price-filter {
        min-height: 32px;
        padding: 6px 10px;
      }
      .cltc-settings .cltc-price-row {
        min-height: 44px;
        padding: 8px 12px;
        gap: 8px;
      }
      .cltc-settings .cltc-price-table-head {
        min-height: var(--cltc-price-head-h);
        padding-top: 6px;
        padding-bottom: 6px;
        border-bottom: 0;
      }
      @media (min-width: 901px) {
        .cltc-settings .cltc-price-editor-pane {
          margin-top: var(--cltc-price-head-h);
        }
      }
      .cltc-settings .cltc-price-editor-pane {
        padding: 18px;
      }
      .cltc-settings .cltc-price-editor {
        gap: 16px;
      }
      .cltc-settings .cltc-price-grid {
        gap: 16px 14px;
      }
      .cltc-settings .cltc-price-actions {
        gap: 10px;
      }
      .cltc-settings .cltc-settings-actions {
        gap: 14px;
      }
      .cltc-settings .cltc-price-actions button,
      .cltc-settings .cltc-settings-actions button {
        min-height: 34px;
        padding: 6px 12px;
      }
      .cltc-settings .cltc-analytics-metrics {
        gap: 18px clamp(40px, 8vw, 64px);
      }
      .cltc-settings .cltc-analytics-metric {
        gap: 6px;
      }
      .cltc-settings .cltc-analytics-section {
        gap: 16px;
      }
      .cltc-settings .cltc-analytics-model-row {
        min-height: 42px;
        padding: 8px 12px;
      }
      .cltc-settings .cltc-analytics-model-head {
        padding: 0 12px;
      }
      .cltc-settings .cltc-analytics-models {
        max-height: 340px;
      }
      .cltc-settings .cltc-composition-legend {
        gap: 10px 14px;
      }
      .cltc-settings .cltc-composition-legend span {
        font-size: 12px;
        line-height: 18px;
      }
      .cltc-settings .cltc-composition-bar {
        height: 12px;
      }
      @keyframes cltc-settings-enter {
        from {
          opacity: 0;
        }
        to {
          opacity: 1;
        }
      }
      @keyframes cltc-nav-active-in {
        from {
          background-color: transparent;
        }
        to {
          background-color: var(--cltc-active);
        }
      }
      @keyframes cltc-sync-pulse {
        0%, 100% { opacity: .42; }
        50% { opacity: 1; }
      }
      .cltc-settings .cltc-settings-content[data-cltc-panel-enter="true"] .cltc-settings-section {
        animation: cltc-settings-enter 240ms var(--cltc-ease-out) both;
        will-change: opacity;
      }
      .cltc-settings[data-cltc-nav-enter="true"] .cltc-settings-nav button[data-active="true"] {
        animation: cltc-nav-active-in 180ms var(--cltc-ease-out);
      }
      .cltc-settings .cltc-sync-status[data-tone="busy"]::before {
        animation: cltc-sync-pulse 1.2s ease-in-out infinite;
      }
      @media (max-width: 1100px) {
        .cltc-settings .cltc-analytics-split {
          grid-template-columns: minmax(0, 1fr);
        }
      }
      @media (max-width: 900px) {
        .cltc-settings .cltc-price-layout {
          grid-template-columns: minmax(0, 1fr);
        }
        .cltc-settings .cltc-price-editor-pane {
          position: static;
        }
      }
      @media (max-width: 820px) {
        .cltc-settings .cltc-settings-shell {
          grid-template-columns: minmax(0, 1fr);
          grid-template-rows: auto minmax(0, 1fr);
        }
        .cltc-settings .cltc-settings-sidebar {
          display: block;
          padding: 8px 10px;
          border-right: 0;
          border-bottom: 1px solid var(--cltc-border-subtle);
          overflow-x: auto;
        }
        .cltc-settings .cltc-settings-nav {
          display: flex;
          min-width: max-content;
        }
        .cltc-settings .cltc-nav-group {
          display: none;
        }
        .cltc-settings .cltc-settings-nav button {
          width: auto;
          white-space: nowrap;
        }
        .cltc-settings .cltc-settings-content {
          padding: 24px 20px 32px;
        }
        .cltc-settings .cltc-profile-card {
          grid-template-columns: 40px minmax(0, 1fr);
        }
        .cltc-settings .cltc-profile-avatar {
          width: 40px;
          height: 40px;
        }
        .cltc-settings .cltc-profile-switch {
          grid-column: 1 / -1;
          justify-self: start;
        }
      }
      @media (max-width: 680px) {
        .cltc-settings .cltc-settings-content[data-panel-kind] .cltc-settings-section {
          max-width: 100%;
        }
        .cltc-settings .cltc-analytics-metrics {
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 18px 20px;
          margin-left: 0;
        }
      }
      @media (prefers-reduced-motion: reduce) {
        .cltc-settings .cltc-inline-status,
        .cltc-settings .cltc-profile-switch input,
        .cltc-settings .cltc-profile-switch input::after,
        .cltc-settings .cltc-nav-icon,
        .cltc-settings .cltc-price-filter {
          transition: none;
        }
        .cltc-settings .cltc-settings-content[data-cltc-panel-enter="true"] .cltc-settings-section {
          animation: none;
          opacity: 1;
          will-change: auto;
        }
        .cltc-settings .cltc-sync-status[data-tone="busy"]::before,
        .cltc-settings[data-cltc-nav-enter="true"] .cltc-settings-nav button[data-active="true"] {
          animation: none;
        }
      }
    `;
    document.head?.appendChild(style);
  }

  // ---------------------------------------------------------------------------
  // 模块 23：UI 渲染与设置面板
  // ensureRoot / render / 各类 *Html() / handleSettingsClick 按钮分发都在这一段。
  // ---------------------------------------------------------------------------
  function codexPlusScriptKey() {
    return UTIL.normalizeText(window.codexPlus?.script?.key, 120) || "user:market-codex-live-token-cost.js";
  }

  function ensureRoot() {
    const now = Date.now();
    // 根节点一旦稳定插在输入框上方，就没必要每 250ms 重走 mainEditable + 8 层祖先布局读取。
    if (
      state.root?.isConnected &&
      !window.__CODEX_LIVE_TOKEN_COST_TEST__ &&
      state.rootPlacedAt &&
      now - state.rootPlacedAt < ROOT_PLACEMENT_CACHE_MS
    ) {
      return state.root;
    }
    ensureStyle();
    cleanupDuplicateRoots();
    const composer = findComposerBox();
    if (!composer?.parentElement) {
      state.root?.remove();
      cleanupDuplicateRoots();
      state.rootPlacedAt = 0;
      return null;
    }
    let rootChanged = false;
    if (!state.root) {
      state.root = document.createElement("div");
      state.root.id = ROOT_ID;
      state.root.setAttribute("data-codex-plus-ext", codexPlusScriptKey());
      state.root.addEventListener("click", (event) => {
        handleSettingsClick(event);
      });
      rootChanged = true;
    }
    state.root.dataset.cltcVersion = VERSION;
    if (state.root.parentElement !== composer.parentElement || state.root.nextElementSibling !== composer) {
      composer.parentElement.insertBefore(state.root, composer);
      rootChanged = true;
    }
    if (rootChanged) syncHubVisibility(state.root, document, true);
    cleanupDuplicateRoots(state.root);
    state.rootPlacedAt = now;
    return state.root;
  }

  function cleanupDuplicateRoots(keep = state.root) {
    for (const node of Array.from(document.querySelectorAll?.(`#${ROOT_ID}`) || [])) {
      if (node !== keep) node.remove?.();
    }
  }

  function applyPriceFilter(rootOverride) {
    const root = rootOverride || settingsEditorRoot();
    if (!root?.querySelectorAll) return;
    const query = UTIL.normalizeText(state.priceSearch, 120).toLowerCase();
    const filter = state.priceFilter || "all";
    const overrides = priceOverrides();
    let visible = 0;
    for (const node of Array.from(root.querySelectorAll("[data-price-pick]") || [])) {
      const name = node.getAttribute?.("data-price-pick") || "";
      const label = priceListModelLabel(name);
      const custom = priceUsable(normalizePrice(overrides[name]));
      const official = Boolean(DEFAULT_PRICES[name]);
      const matchesQuery = !query || `${name} ${label}`.toLowerCase().includes(query);
      const matchesFilter = filter === "all" || (filter === "official" && official) || (filter === "custom" && custom);
      const hidden = !(matchesQuery && matchesFilter);
      node.hidden = hidden;
      if (!hidden) visible += 1;
    }
    const empty = typeof root.querySelector === "function" ? root.querySelector("[data-price-empty]") : null;
    if (empty) empty.hidden = visible > 0;
  }

  function priceDraftError(root) {
    for (const field of ["input", "cachedInput", "cacheWrite", "output"]) {
      const input = root?.querySelector?.(`[data-price-field='${field}']`);
      if (!input) continue;
      const raw = String(input.value ?? "").trim();
      input.removeAttribute?.("aria-invalid");
      if (raw === "") continue;
      const value = Number(raw);
      if (!Number.isFinite(value) || value < 0) return { input, message: "价格需为不小于 0 的数字" };
    }
    return null;
  }

  function syncPriceValidation(rootOverride) {
    const root = rootOverride || settingsEditorRoot();
    const error = priceDraftError(root);
    const errorNode = root?.querySelector?.("[data-price-error]");
    const save = root?.querySelector?.("[data-action='save-price']");
    if (error) {
      error.input?.setAttribute?.("aria-invalid", "true");
      if (errorNode) {
        errorNode.hidden = false;
        errorNode.textContent = error.message;
      }
      if (save) save.disabled = true;
      return false;
    }
    if (errorNode) {
      errorNode.hidden = true;
      errorNode.textContent = "";
    }
    if (save) save.disabled = false;
    return true;
  }

  // 保存前校验：0 是合法价格；负数/非数字由 priceDraftError 拦截。
  // 只阻止“四个字段全空”，避免空表单把已有价格覆盖成 0。
  function priceSaveDraftError(root) {
    const formatError = priceDraftError(root);
    if (formatError) return formatError;
    const hasValue = ["input", "cachedInput", "cacheWrite", "output"].some((field) => {
      const raw = String(root?.querySelector?.(`[data-price-field='${field}']`)?.value ?? "").trim();
      return raw !== "";
    });
    if (hasValue) return null;
    return {
      input: root?.querySelector?.("[data-price-field='input']"),
      message: "请至少填写一个价格",
    };
  }

  function showPriceEditorError(root, error) {
    const errorNode = root?.querySelector?.("[data-price-error]");
    if (!errorNode) return;
    if (error) {
      error.input?.setAttribute?.("aria-invalid", "true");
      errorNode.hidden = false;
      errorNode.textContent = error.message || "保存失败";
    } else {
      errorNode.hidden = true;
      errorNode.textContent = "";
    }
  }

  // 把编辑器的当前输入存为草稿；面板切换、重渲染时继续显示，避免“保存失败后
  // 一切换模型就消失”。成功保存或选择其它模型时清空。
  function capturePriceDraft(root) {
    const read = (field) => String(root?.querySelector?.(`[data-price-field='${field}']`)?.value ?? "");
    const draft = {
      model: UTIL.normalizeText(read("model"), 120),
      input: read("input"),
      cachedInput: read("cachedInput"),
      cacheWrite: read("cacheWrite"),
      output: read("output"),
    };
    state.priceDraft = draft.model || draft.input || draft.cachedInput || draft.cacheWrite || draft.output ? draft : null;
  }

  function handleSettingsInput(event) {
    const search = event.target?.closest?.("[data-price-search]");
    if (search) {
      state.priceSearch = String(search.value || "");
      applyPriceFilter();
      return;
    }
    const field = event.target?.closest?.("[data-price-field]");
    if (field?.closest?.(".cltc-price-editor")) {
      const root = settingsEditorRoot();
      capturePriceDraft(root);
      syncPriceValidation(root);
    }
  }

  function handleSettingsClick(event) {
    if (event.target?.classList?.contains("cltc-settings-overlay")) {
      closeEmbeddedSettingsPage();
      return;
    }
    const panelButton = event.target.closest?.("[data-settings-panel]");
    if (panelButton) {
      const panel = panelButton.getAttribute("data-settings-panel") || "";
      if (["profile", "general", "usage", "pricing"].includes(panel)) {
        state.settingsPanel = panel;
        renderSettingsOverlay(liveSnapshot(), { animate: true, panelSwitch: true });
      }
      return;
    }
    const presetButton = event.target.closest?.("button[data-analytics-preset]");
    if (presetButton) {
      const previousPresetIndex = ["today", "7d", "30d", "custom"].indexOf(state.analyticsPreset);
      state.analyticsPreset = presetButton.getAttribute("data-analytics-preset") || "today";
      renderSettingsOverlay(liveSnapshot(), { animate: true, analyticsRange: true, analyticsSegmentFrom: previousPresetIndex });
      return;
    }
    if (event.target.closest?.("[data-action='clear-analytics-range']")) {
      state.analyticsCustomStart = "";
      state.analyticsCustomEnd = "";
      state.analyticsPreset = "today";
      renderSettingsOverlay(liveSnapshot(), { animate: true });
      return;
    }
    if (event.target.closest?.("[data-action='open-analytics-calendar']")) {
      void openAnalyticsCalendar();
      return;
    }
    const metricButton = event.target.closest?.("[data-analytics-metric]");
    if (metricButton) {
      const previousMetricIndex = state.analyticsMetric === "cost" ? 1 : 0;
      state.analyticsMetric = metricButton.getAttribute("data-analytics-metric") === "cost" ? "cost" : "tokens";
      renderSettingsOverlay(liveSnapshot(), { animate: true, analyticsMetric: true, analyticsSegmentFrom: previousMetricIndex });
      return;
    }
    const modelButton = event.target.closest?.("[data-analytics-model]");
    if (modelButton) {
      state.analyticsModel = modelButton.getAttribute("data-analytics-model") || "";
      renderSettingsOverlay(liveSnapshot(), { animate: true });
      return;
    }
    if (event.target.closest?.("[data-action='clear-analytics-model']")) {
      state.analyticsModel = "";
      renderSettingsOverlay(liveSnapshot(), { animate: true });
      return;
    }
    if (event.target.closest?.("[data-action='toggle-analytics-models']")) {
      state.analyticsModelsExpanded = !state.analyticsModelsExpanded;
      renderSettingsOverlay(liveSnapshot(), { animate: true });
      return;
    }
    if (event.target.closest?.("[data-action='toggle-analytics-unknown']")) {
      state.analyticsHideUnknown = !state.analyticsHideUnknown;
      renderSettingsOverlay(liveSnapshot(), { animate: true });
      return;
    }
    const filterButton = event.target.closest?.("[data-price-filter]");
    if (filterButton) {
      const value = filterButton.getAttribute("data-price-filter") || "all";
      state.priceFilter = ["all", "official", "custom"].includes(value) ? value : "all";
      for (const node of Array.from(settingsEditorRoot()?.querySelectorAll?.("[data-price-filter]") || [])) {
        node.setAttribute("data-active", String(node.getAttribute("data-price-filter") === state.priceFilter));
      }
      applyPriceFilter();
      return;
    }
    const picked = event.target.closest?.("[data-price-pick]");
    if (event.target.closest?.("[data-action='save-price']")) {
      savePriceFromEditor();
      return;
    }
    if (event.target.closest?.("[data-action='delete-price']")) {
      deletePriceForModel(rootPriceModel());
      return;
    }
    if (picked) {
      state.priceDraft = null;
      state.priceEditorModel = picked.getAttribute("data-price-pick") || "";
      renderSettingsOverlay(liveSnapshot(), { animate: true });
      return;
    }
    if (event.target.closest?.("[data-action='save-profile']")) {
      saveProfilePrefsFromEditor();
      return;
    }
    const hubToggle = event.target.closest?.("[data-misc-field='hubVisible']");
    if (hubToggle) {
      saveHubVisible(Boolean(hubToggle.checked));
      syncHubVisibility();
      return;
    }
    if (event.target.closest?.("[data-action='reset-price']")) {
      void restoreDefaultPrices().then(() => renderSettingsOverlay(liveSnapshot(), { animate: true }));
      return;
    }
    if (event.target.closest?.("[data-action='sync-prices']")) {
      renderSettingsOverlay(liveSnapshot(), { animate: true });
      void refreshDefaultPrices().then(() => {
        if (state.destroyed || !state.priceEditorOpen) return;
        renderSettingsOverlay(liveSnapshot(), { animate: true });
      });
      return;
    }
    if (event.target.closest?.("[data-action='new-price']")) {
      startNewPriceModel();
      return;
    }
    if (event.target.closest?.("[data-action='sync-usage']")) {
      void runUsageSync();
      return;
    }
    if (event.target.closest?.("[data-action='backup-usage']")) {
      void usageFactBackupToHost().then(() => renderSettingsOverlay(liveSnapshot(), { animate: true }));
      return;
    }
    if (event.target.closest?.("[data-action='export-usage']")) {
      // 导出会先弹保存位置选择器：必须 await 结果再写状态行，否则用户取消也会显示「已导出」。
      void usageFactDownloadExport("json").then((result) => {
        if (result.canceled) {
          state.usageLedgerError = "";
          state.usageLedgerStatus = "已取消导出";
        } else if (!result.ok) {
          state.usageLedgerError = `导出失败：${String(result.reason || "无法写入文件").slice(0, 160)}`;
          state.usageLedgerStatus = "";
        } else {
          const where =
            result.method === "picker"
              ? `已保存 ${result.name}`
              : result.method === "directory"
                ? `已保存到 ${result.dir || "所选文件夹"} / ${result.name}`
                : `已导出 ${fmtCount(result.count)} 条响应（JSON，位置由宿主决定）`;
          state.usageLedgerError = "";
          state.usageLedgerStatus = where;
        }
        renderSettingsOverlay(liveSnapshot(), { animate: true });
      });
      return;
    }
    if (event.target.closest?.("[data-action='import-usage']")) {
      void usageFactImportFile().then(() => renderSettingsOverlay(liveSnapshot(), { animate: true }));
      return;
    }
    if (event.target.closest?.("[data-action='rebuild-usage']")) {
      // 重建会重算 turn 投影与派生视图，把「重算了多少行」写回状态行，点击才有可见结果。
      const rebuilt = usageFactRebuild();
      state.usageLedgerError = rebuilt.rolled ? "" : "重建失败：派生统计写入本地存储失败";
      state.usageLedgerStatus = rebuilt.rolled
        ? `已重建统计：重算 ${fmtCount(rebuilt.replaced)} 行 turn 投影 · 当前 ${fmtCount(rebuilt.after.count)} 条响应 · ${fmtCount(rebuilt.after.total)} tokens`
        : "";
      renderSettingsOverlay(liveSnapshot(), { animate: true });
      return;
    }
  }

  function settingsEditorRoot() {
    return state.settingsOverlay || document.querySelector?.(".cltc-settings-embedded") || (state.embeddedPageContainer?.querySelector ? state.embeddedPageContainer : state.root);
  }

  function rootPriceModel() {
    const root = settingsEditorRoot();
    return (
      UTIL.normalizeText(root?.querySelector("[data-price-field='model']")?.value) ||
      UTIL.normalizeText(root?.querySelector("[data-price-model]")?.getAttribute("data-price-model"))
    );
  }

  function clearDefaultPriceOverrides() {
    const overrides = { ...priceOverrides() };
    for (const model of Object.keys(DEFAULT_PRICES)) delete overrides[model];
    localStorage.setItem(PRICE_OVERRIDES_KEY, JSON.stringify(overrides));
    invalidatePriceOverridesCache();
    void priceCacheFlush();
    const hidden = hiddenPriceModels();
    for (const model of Object.keys(DEFAULT_PRICES)) hidden.delete(model);
    saveHiddenPriceModels(hidden);
    state.priceDraft = null;
    state.priceEditorModel = nextPriceEditorModel(modelName());
  }

  async function restoreDefaultPrices() {
    clearDefaultPriceOverrides();
    await refreshDefaultPrices();
    clearDefaultPriceOverrides();
    if (state.started) render();
    return true;
  }

  function nextPriceEditorModel(preferred = "") {
    const models = priceListModels(preferred);
    return models.includes(preferred) ? preferred : models[0] || preferred || newPriceModelName();
  }

  function deletePriceForModel(model) {
    const name = UTIL.normalizeText(model);
    if (!name) return false;
    const overrides = { ...priceOverrides() };
    delete overrides[name];
    localStorage.setItem(PRICE_OVERRIDES_KEY, JSON.stringify(overrides));
    invalidatePriceOverridesCache();
    void priceCacheFlush();
    const hidden = hiddenPriceModels();
    hidden.add(name);
    saveHiddenPriceModels(hidden);
    state.priceDraft = null;
    state.priceEditorModel = nextPriceEditorModel(modelName());
    renderSettingsOverlay(liveSnapshot(), { animate: true });
    return true;
  }

  function newPriceModelName() {
    const prices = visiblePrices();
    let name = "new-model";
    let index = 2;
    while (prices[name]) {
      name = `new-model-${index}`;
      index += 1;
    }
    return name;
  }

  function startNewPriceModel() {
    state.priceDraft = null;
    state.priceEditorModel = newPriceModelName();
    renderSettingsOverlay(liveSnapshot(), { animate: true });
  }

  function savePriceFromEditor() {
    const root = settingsEditorRoot();
    const model = rootPriceModel();
    if (!model) {
      showPriceEditorError(root, { message: "请填写模型名" });
      return false;
    }
    // 保存前先做完整校验：旧实现只在数字格式错误时阻止提交，所有价格为空时
    // setModelPrice 静默返回 false，随后 render() 会把刚输入的草稿冲掉。
    const draftError = priceSaveDraftError(root);
    if (draftError) {
      showPriceEditorError(root, draftError);
      return false;
    }
    const input = root.querySelector("[data-price-field='input']")?.value;
    const cachedInput = root.querySelector("[data-price-field='cachedInput']")?.value;
    const cacheWrite = root.querySelector("[data-price-field='cacheWrite']")?.value;
    const output = root.querySelector("[data-price-field='output']")?.value;
    state.priceEditorModel = model;
    let saved = false;
    try {
      saved = window.__codexLiveTokenCost.setModelPrice(model, { input, cachedInput, cacheWrite, output });
    } catch (error) {
      state.priceSaveError = `保存失败：${updateErrorMessage(error)}`;
    }
    if (!saved) {
      // 失败时保留当前编辑内容，只显示错误；绝不调用 render() 重绘草稿。
      showPriceEditorError(root, { message: state.priceSaveError || "保存失败，请检查价格或本地存储空间" });
      state.priceSaveError = "";
      return false;
    }
    state.priceSaveError = "";
    state.priceDraft = null;
    showPriceEditorError(root, null);
    renderSettingsOverlay(liveSnapshot());
    return true;
  }

  function profileSaveToastHtml() {
    const visible = Boolean(state.profileSaveStatus);
    const tone = state.profileSaveStatusTone === "error" ? "error" : visible ? "success" : "neutral";
    return `<div class="cltc-profile-save-toast" data-field="profile-save-status" data-visible="${String(visible)}" data-tone="${tone}" role="status" aria-live="polite">${escapeHtml(state.profileSaveStatus || "")}</div>`;
  }

  function renderProfileSaveToast() {
    const root = settingsEditorRoot();
    const visible = Boolean(state.profileSaveStatus);
    const tone = state.profileSaveStatusTone || "neutral";
    const inline = root?.querySelector?.("[data-field='profile-save-inline']");
    if (inline) {
      inline.textContent = state.profileSaveStatus || "";
      inline.dataset.visible = String(visible);
      inline.dataset.tone = tone;
    }
    const toast = root?.querySelector?.("[data-field='profile-save-status']");
    if (!toast) return false;
    toast.textContent = state.profileSaveStatus || "";
    toast.dataset.visible = String(visible);
    toast.dataset.tone = tone;
    return true;
  }

  function setProfileSaveStatus(message, tone) {
    if (state.profileSaveStatusTimer) window.clearTimeout(state.profileSaveStatusTimer);
    state.profileSaveStatus = UTIL.normalizeText(message, 160);
    state.profileSaveStatusTone = tone === "error" ? "error" : "success";
    state.profileSaveStatusTimer = window.setTimeout(() => {
      state.profileSaveStatusTimer = 0;
      state.profileSaveStatus = "";
      state.profileSaveStatusTone = "";
      if (!renderProfileSaveToast()) render();
    }, PROFILE_SAVE_STATUS_DURATION_MS);
  }

  function syncProfileSaveStatus(options = {}) {
    if (options.render === false) return;
    if (!renderProfileSaveToast()) render();
  }

  function saveProfilePrefsFromEditor(rootOverride, options = {}) {
    const root = rootOverride || settingsEditorRoot();
    if (!root) return false;
    const planType = root.querySelector("[data-profile-field='planType']")?.value;
    const planCustom = root.querySelector("[data-profile-field='planCustom']")?.value;
    const selectedPlan = planType === "custom" ? planCustom : planType;
    const plan = normalizeProfilePlan(selectedPlan, planCustom);
    try {
      saveLocalProfilePrefs({ ...localProfilePrefs(), planType: plan.planType, planLabel: plan.planLabel });
    } catch (error) {
      setProfileSaveStatus(error?.message || "保存失败", "error");
      syncProfileSaveStatus(options);
      return false;
    }
    setProfileSaveStatus("已保存", "success");
    syncProfileSaveStatus(options);
    return true;
  }
  function generalSettingsHtml() {
    const profileEnabled = profileUnlockEnabled();
    const profileRealChatgpt = profileRealChatgptCached();
    return `
      <section class="cltc-settings-section">
        <div class="cltc-settings-section-heading">
          <h2>常规</h2>
          <p>管理 HUD 显示、本地资料与历史数据同步</p>
        </div>
        <div class="cltc-group">
          <div class="cltc-group-head">
            <h3>HUD 显示</h3>
          </div>
          <div class="cltc-group-body">
            <label class="cltc-toggle-field">
              <span>
                <strong>显示 HUD</strong>
                <small>在输入框上方显示本轮、会话与今日统计</small>
              </span>
              <input type="checkbox" role="switch" aria-checked="${String(hubVisible())}" data-misc-field="hubVisible"${hubVisible() ? " checked" : ""}>
            </label>
            <label class="cltc-toggle-field"${hubVisible() ? "" : ' data-disabled="true"'}>
              <span>
                <strong>显示 Token 输出速率</strong>
                <small>${hubVisible() ? "显示本轮实时与上一轮平均输出速率" : "需先开启 HUD"}</small>
              </span>
              <input type="checkbox" role="switch" aria-checked="${String(outputRateVisible())}" data-misc-field="outputRateVisible"${outputRateVisible() ? " checked" : ""}${hubVisible() ? "" : " disabled"}>
            </label>
          </div>
        </div>
        <div class="cltc-group">
          <div class="cltc-group-head">
            <h3>本地资料</h3>
          </div>
          <div class="cltc-group-body">
            <div class="cltc-settings-row cltc-settings-row-link">
              <span>
                <strong>本地 Profile</strong>
                <small>${!profileRealChatgpt
                  ? "API Key 登录下 Codex 无个人资料页；本地资料仅在 ChatGPT 登录后覆盖显示"
                  : profileEnabled
                    ? "已启用；本地显示名与套餐在个人资料中管理"
                    : "未启用；开启后本地资料会覆盖 Profile 展示"}</small>
              </span>
              <button type="button" data-settings-panel="profile">管理</button>
            </div>
          </div>
        </div>
        ${usageSyncSectionHtml()}
      </section>
    `;
  }

  function usageSyncTestState() {
    return {
      busy: state.usageSyncBusy,
      status: state.usageSyncStatus || "",
      result: state.usageSyncResult ? { ...state.usageSyncResult } : null,
      handleStored: Boolean(state.usageSyncDirHandle),
      clientChannel: state.usageSyncClientChannel || "",
    };
  }

  function usageSyncStatusText() {
    if (state.usageSyncBusy) return state.usageSyncStatus || "正在同步…";
    if (state.usageSyncAutoFailures >= 3) return "通道暂不可用，将按长间隔自动重试；点「立即同步」可手动重试";
    if (state.usageSyncStatus) return state.usageSyncStatus;
    const result = usageSyncLastResult();
    if (!result) return "";
    const range = result.firstDay ? ` · 覆盖 ${result.firstDay} ~ ${result.lastDay}` : "";
    return `上次同步：写入 ${result.imported} 轮 · 去重 ${result.deduped} · 跳过 ${result.skipped}${range}（${new Date(result.at).toLocaleString()}）`;
  }

  function usageSyncSectionHtml() {
    const busy = state.usageSyncBusy;
    const statusText = usageSyncStatusText();
    const statusTone = busy ? "busy" : state.usageSyncAutoFailures >= 3 ? "warn" : "success";
    const statusHtml = statusText ? `<p class="cltc-sync-status" data-field="usage-sync-status" data-tone="${statusTone}" role="status">${escapeHtml(statusText)}</p>` : "";
    const facts = usageFactAuthoritativeTotals();
    const degraded = state.usageFactDegraded;
    const degradedHtml = degraded
      ? `<p class="cltc-sync-status" data-field="usage-fact-degraded" data-tone="warn" role="status">降级存储：${escapeHtml(state.usageFactDegradedReason || "IndexedDB 不可用")}；逐响应明细可能不完整，请先导出备份</p>`
      : "";
    // 可观测性（P2 #5）：解析行数 / 重复数集中展示。
    const observability = state.usageSyncResult?.observability;
    const observabilityHtml =
      observability && (observability.lines || observability.duplicateRecords || observability.duplicateHeartbeats)
        ? `<p class="cltc-sync-status" data-field="usage-sync-observability" role="status">解析：${observability.lines} 行 · 逐响应记录 ${observability.records} · 心跳 ${observability.heartbeats} · 重复记录 ${observability.duplicateRecords} · 重复心跳 ${observability.duplicateHeartbeats}</p>`
        : "";
    const backupHtml = state.usageHostBackupStatus
      ? `<p class="cltc-sync-status" data-field="usage-host-backup" data-tone="${state.usageHostBackupError ? "warn" : "success"}" role="status">${escapeHtml(state.usageHostBackupStatus)}</p>`
      : "";
    // 账本按钮（导出/重建）的一次性结果：导出没有下载反馈、重建没有可见结果时，
    // 用户只能靠这一行判断点击是否生效。
    const ledgerHtml =
      state.usageLedgerStatus || state.usageLedgerError
        ? `<p class="cltc-sync-status" data-field="usage-ledger-action" data-tone="${state.usageLedgerError ? "warn" : "success"}" role="status">${escapeHtml(state.usageLedgerError || state.usageLedgerStatus)}</p>`
        : "";
    return `
      <div class="cltc-group">
        <div class="cltc-group-head">
          <h3>数据同步</h3>
        </div>
        <div class="cltc-group-body">
          <div class="cltc-sync-block">
            <div class="cltc-settings-row cltc-sync-row">
              <span>
                <strong>历史数据同步</strong>
                <small>自动读取本机 Codex 会话记录，回填缺失的 token 用量；重复同步不会重复计数</small>
              </span>
              <button type="button" data-action="sync-usage" data-variant="primary" aria-busy="${String(busy)}"${busy ? " disabled" : ""}>${busy ? "正在同步…" : "立即同步"}</button>
            </div>
            ${statusHtml}
            ${degradedHtml}
            ${observabilityHtml}
          </div>
          <div class="cltc-sync-block">
            <div class="cltc-settings-row cltc-sync-row">
              <span>
                <strong>本地账本</strong>
                <small>逐条保存每次模型调用的用量（当前 ${fmtCount(facts.count)} 条响应 · ${fmtCount(facts.total)} tokens）</small>
              </span>
              <span class="cltc-settings-actions">
                <button type="button" data-action="backup-usage">备份到主机</button>
                <button type="button" data-action="export-usage">导出</button>
                <button type="button" data-action="import-usage">导入</button>
                <button type="button" data-action="rebuild-usage">重建统计</button>
              </span>
            </div>
            ${backupHtml}
            ${ledgerHtml}
          </div>
        </div>
      </div>
    `;
  }

  function profileSettingsHtml() {
    const prefs = localProfilePrefs();
    const enabled = profileUnlockEnabled();
    const realChatgpt = profileRealChatgptCached();
    const selectedOption = profilePlanOption(prefs.planType);
    const selectedValue = selectedOption?.value || "custom";
    const customValue = selectedOption ? "" : prefs.planLabel || prefs.planType;
    const optionHtml = PROFILE_PLAN_OPTIONS.map(
      (option) => `<option value="${escapeHtml(option.value)}"${option.value === selectedValue ? " selected" : ""}>${escapeHtml(option.label)}</option>`,
    ).join("");
    const initial = (UTIL.normalizeText(prefs.displayName, 64) || "L").slice(0, 1).toUpperCase();
    const avatarHtml = prefs.imageUrl
      ? `<img class="cltc-profile-avatar" src="${escapeHtml(prefs.imageUrl)}" alt="">`
      : `<span class="cltc-profile-avatar" aria-hidden="true">${escapeHtml(initial)}</span>`;
    const customRowHidden = selectedValue === "custom" ? "" : " hidden";
    return `
      <section class="cltc-settings-section"${enabled ? "" : ' data-profile-locked="true"'}>
        <div class="cltc-settings-section-heading">
          <h2>个人资料</h2>
          <p>${realChatgpt
            ? "仅影响本地显示，不会改变账号、订阅或登录状态"
            : "当前为 API Key 登录：Codex 官方不提供个人资料页，以下资料仅在 ChatGPT 登录后用于覆盖显示"}</p>
        </div>
        <div class="cltc-profile-card" data-disabled="${String(!enabled)}">
          ${avatarHtml}
          <div class="cltc-profile-identity">
            <strong>${escapeHtml(prefs.displayName || "Local Usage")}</strong>
            <span class="cltc-profile-badge">${escapeHtml(prefs.planLabel || "本地")}</span>
            <small>本地显示名与套餐徽标</small>
          </div>
          <label class="cltc-profile-switch">
            <span>${enabled ? "已启用" : "未启用"}</span>
            <input type="checkbox" role="switch" aria-checked="${String(enabled)}" data-misc-field="profileUnlockEnabled"${enabled ? " checked" : ""}>
          </label>
        </div>
        <div class="cltc-group">
          <div class="cltc-group-head">
            <h3>套餐显示</h3>
            <p>${enabled ? "选择要显示在 Profile 与账号菜单中的套餐" : "启用本地 Profile 后可编辑"}</p>
          </div>
          <div class="cltc-group-body">
            <div class="cltc-price-grid cltc-profile-form">
              <label class="cltc-price-field">
                <span>Plan 类型</span>
                <select class="cltc-profile-select" data-profile-field="planType"${enabled ? "" : " disabled"}>
                  ${optionHtml}
                  <option value="custom"${selectedValue === "custom" ? " selected" : ""}>自定义</option>
                </select>
              </label>
              <label class="cltc-price-field" data-profile-custom-row${customRowHidden}>
                <span>自定义</span>
                <input class="cltc-price-input" data-profile-field="planCustom" type="text" value="${escapeHtml(customValue)}" placeholder="Team Enterprise"${enabled ? "" : " disabled"}>
              </label>
            </div>
          </div>
        </div>
        <div class="cltc-settings-actions">
          <span class="cltc-inline-status" data-field="profile-save-inline"></span>
          <button type="button" data-action="save-profile" data-variant="primary"${enabled ? "" : " disabled"}>保存更改</button>
        </div>
      </section>
    `;
  }

  function pricePopoverHtml(snap) {
    if (!state.priceEditorOpen) return "";
    const overrides = priceOverrides();
    const draft = state.priceDraft;
    const model = UTIL.normalizeText(draft?.model, 120) || UTIL.normalizeText(state.priceEditorModel) || snap.model;
    const draftPrice = draft && UTIL.normalizeText(draft.model, 120) === model ? draft : null;
    const models = priceListModels(model);
    const resolvedPrice = priceFor(model);
    const price = draftPrice || resolvedPrice || { input: "", cachedInput: "", output: "" };
    const value = (field) => (price[field] == null ? "" : String(price[field]));
    const source = !resolvedPrice ? "未定价" : priceUsable(normalizePrice(overrides[model])) ? "自定义" : DEFAULT_PRICES[model] ? "默认" : "自定义";
    const allowedPanels = ["profile", "general", "usage", "pricing"];
    const panel = allowedPanels.includes(state.settingsPanel) ? state.settingsPanel : "usage";
    state.settingsPanel = panel;
    const embedded = Boolean(state.embeddedPageContainer);
    const row = (name) => {
      const item = priceFor(name);
      const cell = (field) => (item?.[field] == null ? "-" : String(item[field]));
      const label = priceListModelLabel(name);
      const custom = priceUsable(normalizePrice(overrides[name]));
      const official = Boolean(DEFAULT_PRICES[name]);
      const badge = custom
        ? '<span class="cltc-price-badge" data-tone="custom">自定义</span>'
        : official
          ? '<span class="cltc-price-badge" data-tone="official">官方</span>'
          : '<span class="cltc-price-badge" data-tone="warn">未定价</span>';
      const priceLabel = `模型 ${label}，输入 ${cell("input")}，读缓存 ${cell("cachedInput")}，写缓存 ${cell("cacheWrite")}，输出 ${cell("output")}（USD / 1M tokens）`;
      return `
        <button class="cltc-price-row" type="button" data-price-pick="${escapeHtml(name)}" data-active="${String(name === model)}" aria-pressed="${String(name === model)}" aria-label="${escapeHtml(priceLabel)}">
          <span title="${escapeHtml(label)}">${escapeHtml(label)}${badge}</span>
          <span>${escapeHtml(cell("input"))}</span>
          <span>${escapeHtml(cell("cachedInput"))}</span>
          <span>${escapeHtml(cell("cacheWrite"))}</span>
          <span>${escapeHtml(cell("output"))}</span>
        </button>
      `;
    };
    const sync = priceSyncStatus();
    const sourceTone = source === "未定价" ? "warn" : source === "自定义" ? "custom" : "official";
    const filterButton = (value, label) =>
      `<button type="button" class="cltc-price-filter" data-price-filter="${value}" data-active="${String(state.priceFilter === value)}">${label}</button>`;
    const pricingHtml = `
      <section class="cltc-settings-section">
        <div class="cltc-settings-section-heading">
          <h2>模型价格</h2>
          <p>按 USD / 1M tokens 设置输入、缓存与输出价格</p>
        </div>
        <div class="cltc-price-sync" data-tone="${sync.tone}" role="status" aria-live="polite">
          <span>${escapeHtml(sync.text)}</span>
          ${sync.retry ? `<button type="button" data-action="sync-prices">重试</button>` : ""}
        </div>
        <div class="cltc-price-toolbar">
          <input class="cltc-price-search" data-price-search type="search" value="${escapeHtml(state.priceSearch)}" placeholder="搜索模型…" aria-label="搜索模型">
          ${filterButton("all", "全部")}
          ${filterButton("official", "官方")}
          ${filterButton("custom", "自定义")}
        </div>
        <div class="cltc-price-layout">
          <div class="cltc-price-list-pane">
            <div class="cltc-price-row cltc-price-table-head" aria-hidden="true">
              <span>模型</span><span>输入</span><span>读缓存</span><span>写缓存</span><span>输出</span>
            </div>
            <div class="cltc-price-list">
              ${models.map(row).join("")}
              <div class="cltc-price-empty" data-price-empty hidden>没有匹配的模型</div>
            </div>
          </div>
          <div class="cltc-price-editor-pane">
            <div class="cltc-price-meta">${escapeHtml(model)}<span class="cltc-price-badge" data-tone="${sourceTone}">${escapeHtml(source)}</span></div>
            <p class="cltc-price-unit">单位：USD / 1M tokens</p>
            <div class="cltc-price-editor">
              <div class="cltc-price-grid">
                <label class="cltc-price-field cltc-price-field-full">
                  <span>模型名</span>
                  <input class="cltc-price-input" data-price-field="model" type="text" value="${escapeHtml(model)}">
                </label>
                <label class="cltc-price-field">
                  <span>输入</span>
                  <input class="cltc-price-input" data-price-field="input" type="number" min="0" step="0.000001" value="${escapeHtml(value("input"))}">
                </label>
                <label class="cltc-price-field">
                  <span>读缓存</span>
                  <input class="cltc-price-input" data-price-field="cachedInput" type="number" min="0" step="0.000001" value="${escapeHtml(value("cachedInput"))}">
                </label>
                <label class="cltc-price-field">
                  <span>写缓存</span>
                  <input class="cltc-price-input" data-price-field="cacheWrite" type="number" min="0" step="0.000001" value="${escapeHtml(value("cacheWrite"))}">
                </label>
                <label class="cltc-price-field">
                  <span>输出</span>
                  <input class="cltc-price-input" data-price-field="output" type="number" min="0" step="0.000001" value="${escapeHtml(value("output"))}">
                </label>
              </div>
              <div class="cltc-price-error" data-price-error hidden></div>
              <div class="cltc-price-actions">
                <button type="button" data-action="new-price">新建</button>
                <button type="button" data-action="delete-price" data-variant="danger">隐藏</button>
                <button type="button" data-action="reset-price" title="清除所有自定义价格并重新同步">重置全部</button>
                <button type="button" data-action="save-price" data-variant="primary">保存</button>
              </div>
            </div>
          </div>
        </div>
      </section>
    `;
    const content =
      panel === "profile" ? profileSettingsHtml() : panel === "general" ? generalSettingsHtml() : panel === "usage" ? usageAnalyticsHtml() : pricingHtml;
    const panelKind = panel === "usage" || panel === "pricing" ? "data" : "form";
    return `
      <div class="cltc-settings-modal" role="${embedded ? "region" : "dialog"}"${embedded ? "" : ' aria-modal="true"'} aria-label="Codex Token Cost 设置" data-price-model="${escapeHtml(model)}" data-settings-active="${panel}">
        <div class="cltc-price-head">
          <span class="cltc-price-title">Codex Token Cost</span>
        </div>
        <div class="cltc-settings-shell">
          <aside class="cltc-settings-sidebar">
            <nav class="cltc-settings-nav" aria-label="设置分组" role="tablist" aria-orientation="vertical">
              <div class="cltc-nav-group">监控</div>
              <button type="button" data-settings-panel="usage" id="cltc-tab-usage" role="tab" aria-selected="${String(panel === "usage")}" aria-controls="cltc-settings-panel" tabindex="${panel === "usage" ? "0" : "-1"}" data-active="${String(panel === "usage")}">${NAV_ICON_USAGE}<span>使用统计</span></button>
              <div class="cltc-nav-group">配置</div>
              <button type="button" data-settings-panel="profile" id="cltc-tab-profile" role="tab" aria-selected="${String(panel === "profile")}" aria-controls="cltc-settings-panel" tabindex="${panel === "profile" ? "0" : "-1"}" data-active="${String(panel === "profile")}">${NAV_ICON_PROFILE}<span>个人资料</span></button>
              <button type="button" data-settings-panel="general" id="cltc-tab-general" role="tab" aria-selected="${String(panel === "general")}" aria-controls="cltc-settings-panel" tabindex="${panel === "general" ? "0" : "-1"}" data-active="${String(panel === "general")}">${NAV_ICON_GENERAL}<span>常规</span></button>
              <button type="button" data-settings-panel="pricing" id="cltc-tab-pricing" role="tab" aria-selected="${String(panel === "pricing")}" aria-controls="cltc-settings-panel" tabindex="${panel === "pricing" ? "0" : "-1"}" data-active="${String(panel === "pricing")}">${NAV_ICON_PRICING}<span>模型价格</span></button>
            </nav>
          </aside>
          <div class="cltc-settings-content" id="cltc-settings-panel" role="tabpanel" aria-labelledby="cltc-tab-${panel}" data-panel-kind="${panelKind}">
            ${content}
          </div>
        </div>
      </div>
      ${profileSaveToastHtml()}
    `;
  }

  function stopAnalyticsTimer() {
    if (!state.analyticsTimer) return;
    window.clearInterval(state.analyticsTimer);
    state.analyticsTimer = 0;
  }

  function destroyAnalyticsCalendar() {
    state.analyticsCalendar?.destroy?.();
    state.analyticsCalendar = null;
  }

  async function ungzipBase64Text(value) {
    const binary = window.atob(value);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
    return new Response(stream).text();
  }

  function ensureFlatpickrTheme() {
    const style = document.getElementById(FLATPICKR_STYLE_ID) || document.createElement("style");
    style.id ||= FLATPICKR_STYLE_ID;
    style.textContent = `
      .flatpickr-calendar {
        --cltc-calendar-accent: rgb(76, 78, 80);
        z-index: 2147483647 !important;
        border: 1px solid var(--color-token-border-light, #d1d5db) !important;
        border-radius: 12px !important;
        background: var(--color-token-dropdown-background, #fff) !important;
        box-shadow: 0 18px 46px rgba(0, 0, 0, .18) !important;
        color: var(--color-token-text-primary, #171717) !important;
        font: 13px/1.4 ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif !important;
        overflow: hidden;
      }
      .flatpickr-calendar.arrowTop::before,
      .flatpickr-calendar.arrowTop::after,
      .flatpickr-calendar.arrowBottom::before,
      .flatpickr-calendar.arrowBottom::after {
        display: none !important;
      }
      .flatpickr-calendar.multiMonth {
        width: 672px !important;
      }
      html.electron-dark .flatpickr-calendar {
        border-color: #3f3f46 !important;
        background: #18181b !important;
        color: #f4f4f5 !important;
      }
      .flatpickr-months {
        min-height: 52px !important;
        padding: 8px 10px 2px !important;
      }
      .flatpickr-months .flatpickr-prev-month,
      .flatpickr-months .flatpickr-next-month {
        top: 8px !important;
        width: 36px !important;
        height: 36px !important;
        padding: 10px !important;
        border-radius: 7px;
        fill: currentColor !important;
        color: var(--color-token-text-secondary, #52525b) !important;
      }
      .flatpickr-months .flatpickr-prev-month:hover,
      .flatpickr-months .flatpickr-next-month:hover {
        background: var(--color-token-list-hover-background, rgba(0, 0, 0, .06));
      }
      .flatpickr-months .flatpickr-month {
        height: 42px !important;
      }
      .flatpickr-months .flatpickr-month,
      .flatpickr-current-month .flatpickr-monthDropdown-months,
      .flatpickr-current-month input.cur-year,
      span.flatpickr-weekday {
        background: transparent !important;
        color: inherit !important;
      }
      .flatpickr-current-month {
        height: 42px !important;
        padding-top: 8px !important;
        font-size: 15px !important;
      }
      .flatpickr-current-month .flatpickr-monthDropdown-months,
      .flatpickr-current-month input.cur-year {
        font-weight: 600 !important;
      }
      .flatpickr-weekdays {
        height: 36px !important;
        padding: 0 8px !important;
      }
      span.flatpickr-weekday {
        line-height: 36px !important;
        font-size: 12px !important;
        font-weight: 500 !important;
        color: var(--color-token-text-secondary, #52525b) !important;
      }
      .flatpickr-calendar.multiMonth .flatpickr-innerContainer,
      .flatpickr-calendar.multiMonth .flatpickr-rContainer,
      .flatpickr-calendar.multiMonth .flatpickr-days {
        width: 672px !important;
      }
      .flatpickr-calendar.multiMonth .dayContainer {
        width: 336px !important;
        min-width: 336px !important;
        max-width: 336px !important;
        padding: 2px 10px 16px !important;
      }
      .flatpickr-calendar.multiMonth .dayContainer + .dayContainer {
        border-left: 1px solid var(--color-token-border-light, #e5e7eb);
      }
      .flatpickr-day {
        position: relative;
        isolation: isolate;
        width: 14.2857143% !important;
        max-width: none !important;
        height: 42px !important;
        line-height: 42px !important;
        border-width: 0 !important;
        border-radius: 7px !important;
        color: inherit !important;
      }
      .flatpickr-day:hover,
      .flatpickr-day:focus {
        border-color: transparent !important;
        background: color-mix(in srgb, var(--cltc-calendar-accent) 9%, transparent) !important;
        outline: none !important;
      }
      html.electron-dark .flatpickr-day:hover,
      html.electron-dark .flatpickr-day:focus {
        background: color-mix(in srgb, var(--cltc-calendar-accent) 34%, transparent) !important;
      }
      .flatpickr-day.flatpickr-disabled:hover,
      .flatpickr-day.flatpickr-disabled:focus {
        background: transparent !important;
      }
      .flatpickr-day.selected,
      .flatpickr-day.startRange,
      .flatpickr-day.endRange {
        border-color: transparent !important;
        background: transparent !important;
        color: #fff !important;
        box-shadow: none !important;
      }
      .flatpickr-day.inRange:not(.startRange):not(.endRange) {
        border-color: transparent !important;
        border-radius: 0 !important;
        background: transparent !important;
        box-shadow: none !important;
      }
      .flatpickr-day.inRange::before,
      .flatpickr-day.startRange::before,
      .flatpickr-day.endRange::before {
        content: "";
        position: absolute;
        z-index: -2;
        top: 4px;
        right: 0;
        bottom: 4px;
        left: 0;
        background: color-mix(in srgb, var(--cltc-calendar-accent) 12%, transparent);
        pointer-events: none;
      }
      .flatpickr-day.startRange:not(.endRange)::before {
        left: 50%;
      }
      .flatpickr-day.endRange:not(.startRange)::before {
        right: 50%;
      }
      .flatpickr-day.startRange.endRange::before {
        display: none;
      }
      .flatpickr-day.inRange:nth-child(7n + 1)::before {
        border-radius: 7px 0 0 7px;
      }
      .flatpickr-day.inRange:nth-child(7n)::before {
        border-radius: 0 7px 7px 0;
      }
      .flatpickr-day.selected::after,
      .flatpickr-day.startRange::after,
      .flatpickr-day.endRange::after {
        content: "";
        position: absolute;
        z-index: -1;
        top: 50%;
        left: 50%;
        width: 34px;
        height: 34px;
        border-radius: 8px;
        background: var(--cltc-calendar-accent);
        transform: translate(-50%, -50%);
        pointer-events: none;
      }
      .flatpickr-day:focus-visible {
        outline: 2px solid color-mix(in srgb, var(--cltc-calendar-accent) 34%, transparent) !important;
        outline-offset: -4px;
      }
      .flatpickr-day.selected:focus-visible,
      .flatpickr-day.startRange:focus-visible,
      .flatpickr-day.endRange:focus-visible {
        outline: none !important;
      }
      .flatpickr-day:focus-visible::after {
        box-shadow: 0 0 0 2px color-mix(in srgb, var(--cltc-calendar-accent) 34%, transparent);
      }
      .flatpickr-day.flatpickr-disabled {
        color: var(--color-token-text-tertiary, #9ca3af) !important;
        opacity: .42;
      }
      .flatpickr-day.today:not(.selected):not(.startRange):not(.endRange):not(.inRange) {
        font-weight: 600;
      }
      .flatpickr-day.today:not(.selected):not(.startRange):not(.endRange):not(.inRange)::before {
        content: "";
        position: absolute;
        bottom: 8px;
        left: 50%;
        width: 4px;
        height: 4px;
        border-radius: 50%;
        background: var(--cltc-calendar-accent);
        opacity: .5;
        transform: translateX(-50%);
        pointer-events: none;
      }
      html.electron-dark .flatpickr-day.today:not(.selected):not(.startRange):not(.endRange):not(.inRange)::before {
        background: #a1a1aa;
        opacity: .6;
      }
      @media (max-width: 680px) {
        .flatpickr-calendar,
        .flatpickr-calendar.multiMonth {
          width: min(307.875px, calc(100vw - 28px)) !important;
          max-width: calc(100vw - 28px) !important;
        }
        .flatpickr-months {
          min-height: 48px !important;
          padding-top: 6px !important;
        }
        .flatpickr-calendar .flatpickr-innerContainer,
        .flatpickr-calendar .flatpickr-rContainer,
        .flatpickr-calendar .flatpickr-days,
        .flatpickr-calendar .dayContainer {
          width: 100% !important;
          min-width: 0 !important;
          max-width: 100% !important;
        }
        .flatpickr-calendar .dayContainer {
          padding: 0 8px 12px !important;
        }
        .flatpickr-day {
          height: 38px !important;
          line-height: 38px !important;
        }
      }
    `;
    if (!style.isConnected) document.head?.appendChild(style);
  }

  async function ensureFlatpickr() {
    if (typeof window.flatpickr === "function" && document.getElementById("codex-live-token-cost-flatpickr-base-style")) {
      ensureFlatpickrTheme();
      return window.flatpickr;
    }
    if (state.flatpickrPromise) return state.flatpickrPromise;
    state.flatpickrPromise = (async () => {
      if (typeof DecompressionStream !== "function") throw new Error("当前运行环境不支持本地日历解压");
      const cssText = await ungzipBase64Text(FLATPICKR_CSS_GZIP_BASE64);
      if (!document.getElementById("codex-live-token-cost-flatpickr-base-style")) {
        const style = document.createElement("style");
        style.id = "codex-live-token-cost-flatpickr-base-style";
        style.textContent = cssText;
        document.head?.appendChild(style);
      }
      if (typeof window.flatpickr !== "function") installBundledFlatpickr();
      ensureFlatpickrTheme();
      if (typeof window.flatpickr !== "function") throw new Error("Flatpickr 初始化失败");
      return window.flatpickr;
    })().catch((error) => {
      state.flatpickrPromise = null;
      throw error;
    });
    return state.flatpickrPromise;
  }

  async function openAnalyticsCalendar() {
    destroyAnalyticsCalendar();
    const root = settingsEditorRoot();
    const input = root?.querySelector?.("[data-analytics-date-input]");
    if (!input) return false;
    try {
      const flatpickr = await ensureFlatpickr();
      const now = new Date();
      const minDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      minDate.setDate(minDate.getDate() - (ANALYTICS_MAX_DAYS - 1));
      const locale = { ...(flatpickr.l10ns.zh || flatpickr.l10ns.default), firstDayOfWeek: 1 };
      const defaultStart = parseLocalDateInput(state.analyticsCustomStart) || startOfLocalDay(Date.now());
      const defaultEnd = parseLocalDateInput(state.analyticsCustomEnd) || defaultStart;
      state.analyticsCalendar = flatpickr(input, {
        mode: "range",
        dateFormat: "Y-m-d",
        locale,
        defaultDate: [new Date(defaultStart), new Date(defaultEnd)],
        minDate,
        maxDate: new Date(),
        showMonths: window.matchMedia?.("(max-width: 680px)")?.matches ? 1 : 2,
        disableMobile: true,
        allowInput: false,
        appendTo: root,
        onChange(selectedDates) {
          if (selectedDates.length !== 2) return;
          state.analyticsCustomStart = localDateKey(selectedDates[0]);
          state.analyticsCustomEnd = localDateKey(selectedDates[1]);
          state.analyticsPreset = "custom";
        },
        onClose(selectedDates) {
          const trigger = settingsEditorRoot()?.querySelector?.("[data-action='open-analytics-calendar']");
          if (trigger) delete trigger.dataset.open;
          const complete = selectedDates.length === 2;
          if (complete) {
            state.analyticsCustomStart = localDateKey(selectedDates[0]);
            state.analyticsCustomEnd = localDateKey(selectedDates[1]);
            state.analyticsPreset = "custom";
          }
          window.setTimeout(() => {
            destroyAnalyticsCalendar();
            if (complete && state.priceEditorOpen) renderSettingsOverlay(liveSnapshot());
          }, 0);
        },
      });
      state.analyticsCalendar.open();
      const trigger = root.querySelector?.("[data-action='open-analytics-calendar']");
      if (trigger) trigger.dataset.open = "true";
      return true;
    } catch (error) {
      const trigger = settingsEditorRoot()?.querySelector?.("[data-action='open-analytics-calendar']");
      const message = UTIL.normalizeText(error?.message || error, 160) || "日期选择器不可用";
      if (trigger) {
        trigger.textContent = message;
        trigger.dataset.error = UTIL.normalizeText(error?.stack || message, 1000);
      }
      return false;
    }
  }
  function syncAnalyticsTimer() {
    if (!state.priceEditorOpen || state.settingsPanel !== "usage") {
      stopAnalyticsTimer();
      return;
    }
    if (state.analyticsTimer) return;
    state.analyticsTimer = window.setInterval(() => {
      if (state.priceEditorOpen && state.settingsPanel === "usage") renderSettingsOverlay(liveSnapshot());
      else stopAnalyticsTimer();
    }, 60_000);
  }

  function handleAnalyticsKeydown(event) {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    const bar = event.target?.closest?.("[data-chart-index]");
    if (!bar) return;
    const chart = bar.ownerSVGElement || bar.closest?.(".cltc-analytics-chart");
    const bars = Array.from(chart?.querySelectorAll?.("[data-chart-index]") || []);
    const index = bars.indexOf(bar);
    if (index < 0) return;
    event.preventDefault?.();
    const next = bars[Math.max(0, Math.min(bars.length - 1, index + (event.key === "ArrowRight" ? 1 : -1)))];
    if (next) {
      bars.forEach((node) => node.setAttribute?.("tabindex", node === next ? "0" : "-1"));
      next.focus?.();
    }
  }

  function handleSettingsKeydown(event) {
    if (event.key === "Escape") {
      event.preventDefault?.();
      closeEmbeddedSettingsPage();
      return;
    }
    if (event.key === "Tab" && trapSettingsFocus(event)) return;
    const navButton = event.target?.closest?.("[data-settings-panel]");
    if (navButton && ["ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) {
      const nav = navButton.closest?.(".cltc-settings-nav");
      const buttons = Array.from(nav?.querySelectorAll?.("[data-settings-panel]") || []);
      const index = buttons.indexOf(navButton);
      if (index >= 0) {
        event.preventDefault?.();
        const nextIndex =
          event.key === "Home"
            ? 0
            : event.key === "End"
              ? buttons.length - 1
              : (index + (event.key === "ArrowDown" ? 1 : -1) + buttons.length) % buttons.length;
        const next = buttons[nextIndex];
        if (next) {
          next.focus?.();
          next.click?.();
        }
        return;
      }
    }
    handleAnalyticsKeydown(event);
  }

  const SETTINGS_FOCUS_ATTRIBUTES = [
    "data-settings-panel",
    "data-price-pick",
    "data-action",
    "data-profile-field",
    "data-price-field",
    "data-analytics-preset",
    "data-analytics-metric",
    "data-analytics-model",
    "data-price-search",
    "data-price-filter",
    "data-chart-index",
  ];
  const SETTINGS_FOCUS_SELECTOR = SETTINGS_FOCUS_ATTRIBUTES.map((attribute) => `[${attribute}]`).join(",");
  const SETTINGS_FOCUSABLE_SELECTOR = "a[href],button,input,select,textarea,[tabindex]";

  function settingsFocusKey(node, root) {
    if (!node || !root?.contains?.(node)) return null;
    const focusable = node.getAttribute ? node : node.closest?.(SETTINGS_FOCUS_SELECTOR);
    if (!focusable) return null;
    for (const attribute of SETTINGS_FOCUS_ATTRIBUTES) {
      const value = focusable.getAttribute?.(attribute);
      if (value != null) return { attribute, value };
    }
    return null;
  }

  function isSettingsFocusable(node) {
    if (!node || node.disabled || node.hidden || node.getAttribute?.("aria-hidden") === "true") return false;
    const tabIndex = node.getAttribute?.("tabindex");
    if (tabIndex != null) return Number(tabIndex) >= 0;
    return /^(A|BUTTON|INPUT|SELECT|TEXTAREA)$/.test(String(node.tagName || ""));
  }

  function trapSettingsFocus(event, overlay = state.settingsOverlay) {
    const focusable = Array.from(overlay?.querySelectorAll?.(SETTINGS_FOCUSABLE_SELECTOR) || []).filter(isSettingsFocusable);
    if (!focusable.length) return false;
    const current = document.activeElement;
    const index = focusable.indexOf(current);
    if (event.shiftKey ? index <= 0 : index < 0 || index === focusable.length - 1) {
      event.preventDefault?.();
      (event.shiftKey ? focusable.at(-1) : focusable[0])?.focus?.();
      return true;
    }
    return false;
  }

  function restoreSettingsFocus(root, key) {
    if (!root || !key) return;
    const target = Array.from(root.querySelectorAll?.(SETTINGS_FOCUS_SELECTOR) || []).find(
      (node) => node.getAttribute?.(key.attribute) === key.value && isSettingsFocusable(node),
    );
    target?.focus?.();
  }

  function cancelSettingsFocusFrame() {
    if (state.settingsFocusFrame && typeof window.cancelAnimationFrame === "function") {
      window.cancelAnimationFrame(state.settingsFocusFrame);
    }
    state.settingsFocusFrame = 0;
  }

  function renderSettingsOverlay(snap, options = {}) {
    if (state.embeddedPageContainer) {
      renderEmbeddedSettingsPage(state.embeddedPageContainer, options, snap);
      return;
    }
    // 设置界面只以嵌入式页面存在；旧浮层 modal 路径不再允许创建，避免异常实例残留旧弹窗。
    if (state.priceEditorOpen) {
      state.settingsOverlay?.remove?.();
      state.settingsOverlay = null;
      state.settingsOverlayCloseTimer = 0;
      return;
    }
    const animate = options.animate === true;
    const animateAnalyticsSegment = options.analyticsRange === true || options.analyticsMetric === true;
    if (state.analyticsSegmentSwitchFrame) {
      if (typeof window.cancelAnimationFrame === "function") window.cancelAnimationFrame(state.analyticsSegmentSwitchFrame);
      state.analyticsSegmentSwitchFrame = 0;
    }
    if (!state.priceEditorOpen) {
      cancelSettingsFocusFrame();
      stopAnalyticsTimer();
      const overlay = state.settingsOverlay;
      if (!overlay) return;
      if (overlay.dataset.cltcClosing === "true") return;
      const modal = overlay.querySelector?.(".cltc-settings-modal");
      if (!modal) {
        overlay.remove?.();
        state.settingsOverlay = null;
        return;
      }
      overlay.dataset.cltcClosing = "true";
      const remove = () => {
        state.settingsOverlayCloseTimer = 0;
        if (state.priceEditorOpen || state.settingsOverlay !== overlay) return;
        overlay.remove?.();
        state.settingsOverlay = null;
      };
      state.settingsOverlayCloseTimer = window.setTimeout(remove, SETTINGS_MODAL_EXIT_MS);
      return;
    }
    if (state.settingsOverlayCloseTimer) {
      window.clearTimeout(state.settingsOverlayCloseTimer);
      state.settingsOverlayCloseTimer = 0;
    }
    state.settingsOverlay?.removeAttribute?.("data-cltc-closing");
    let entering = false;
    if (!state.settingsOverlay) {
      entering = true;
      for (const node of Array.from(document.querySelectorAll?.(".cltc-settings-overlay") || [])) node.remove?.();
      state.settingsOverlay = document.createElement("div");
      state.settingsOverlay.className = "cltc-settings-overlay cltc-settings";
      state.settingsOverlay.setAttribute("data-codex-plus-ext", codexPlusScriptKey());
      state.settingsOverlay.dataset.cltcEntering = "true";
      state.settingsOverlay.addEventListener("click", handleSettingsClick);
      state.settingsOverlay.addEventListener("input", handleSettingsInput);
      state.settingsOverlay.addEventListener("change", handleSettingsChange);
      state.settingsOverlay.addEventListener("keydown", handleSettingsKeydown);
    }
    for (const node of Array.from(document.querySelectorAll?.(".cltc-settings-overlay") || [])) {
      if (node !== state.settingsOverlay) node.remove?.();
    }
    if (!state.settingsOverlay.isConnected) (document.body || document.documentElement)?.appendChild(state.settingsOverlay);
    if (entering) {
      const overlay = state.settingsOverlay;
      const settle = () => overlay?.removeAttribute("data-cltc-entering");
      if (typeof window.requestAnimationFrame === "function") window.requestAnimationFrame(settle);
      else settle();
    }
    if (state.analyticsCalendar?.isOpen) return;
    const focusKey = settingsFocusKey(document.activeElement, state.settingsOverlay);
    const contentScrollTop = state.settingsOverlay.querySelector(".cltc-settings-content")?.scrollTop || 0;
    const listScrollTop = state.settingsOverlay.querySelector(".cltc-price-list")?.scrollTop || 0;
    state.settingsOverlay.innerHTML = pricePopoverHtml(snap);
    applyPriceFilter(state.settingsOverlay);
    const content = state.settingsOverlay.querySelector(".cltc-settings-content");
    const list = state.settingsOverlay.querySelector(".cltc-price-list");
    if (content) content.scrollTop = contentScrollTop;
    if (list) list.scrollTop = listScrollTop;
    if (focusKey) cancelSettingsFocusFrame();
    else if (
      state.settingsFocusFrame &&
      document.activeElement !== document.body &&
      !state.settingsOverlay.contains?.(document.activeElement)
    ) {
      cancelSettingsFocusFrame();
    }
    restoreSettingsFocus(state.settingsOverlay, focusKey);
    if (focusKey) {
      const focusRoot = state.settingsOverlay;
      const restoreFocus = () => {
        state.settingsFocusFrame = 0;
        if (state.settingsOverlay === focusRoot && focusRoot?.isConnected) restoreSettingsFocus(focusRoot, focusKey);
      };
      if (typeof window.requestAnimationFrame === "function") state.settingsFocusFrame = window.requestAnimationFrame(restoreFocus);
      else restoreFocus();
    }
    animateAnalyticsSegments(state.settingsOverlay, options);
    if (animate && content) {
      content.dataset.cltcSwitching = "true";
      const settle = () => content.removeAttribute("data-cltc-switching");
      if (typeof window.requestAnimationFrame === "function") window.requestAnimationFrame(settle);
      else settle();
    }
    syncAnalyticsTimer();
  }

  function rollComparableValue(text) {
    const value = UTIL.normalizeText(text, 80).replace(/,/g, "");
    const match = value.match(/-?\d+(?:\.\d+)?/);
    if (!match) return null;
    const unit = value.slice(match.index + match[0].length).trim().toUpperCase();
    let multiplier = 1;
    if (unit.startsWith("K")) multiplier = 1_000;
    else if (unit.startsWith("M")) multiplier = 1_000_000;
    else if (unit.startsWith("B")) multiplier = 1_000_000_000;
    return Number(match[0]) * multiplier;
  }

  function rollTrend(previous, next) {
    const before = rollComparableValue(previous);
    const after = rollComparableValue(next);
    if (before == null || after == null || before === after) return "same";
    return after > before ? "up" : "down";
  }

  function digitChars(text) {
    return Array.from(UTIL.normalizeText(text, 80));
  }

  function previousDigitByPosition(previous, digitPositionFromRight) {
    if (!previous) return null;
    let position = 0;
    const chars = digitChars(previous);
    for (let index = chars.length - 1; index >= 0; index -= 1) {
      const char = chars[index];
      if (!/\d/.test(char)) continue;
      if (position === digitPositionFromRight) return char;
      position += 1;
    }
    return null;
  }

  function rollingTokens(text) {
    let digitPosition = digitChars(text).filter((char) => /\d/.test(char)).length;
    return digitChars(text).map((char, index) => {
      if (!/\d/.test(char)) return { type: "separator", char, index };
      digitPosition -= 1;
      return { type: "digit", char, digitPosition };
    });
  }

  function createRollingDigitColumn() {
    const column = document.createElement("span");
    column.className = "cltc-roll-digit-column";
    column.setAttribute("aria-hidden", "true");
    column.dataset.cltcTokenType = "digit";
    const clip = document.createElement("span");
    clip.className = "cltc-roll-digit-clip";
    const stack = document.createElement("span");
    stack.className = "cltc-roll-digit-stack";
    stack.dataset.animate = "false";
    "0123456789".split("").forEach((digit) => {
      const row = document.createElement("span");
      row.textContent = digit;
      stack.append(row);
    });
    clip.append(stack);
    column.append(clip);
    return column;
  }

  function updateRollingDigitColumn(column, char, shouldAnimate) {
    const to = Number(char);
    const toY = `-${to * 16}px`;
    const stack = column.querySelector(".cltc-roll-digit-stack");
    if (!stack) return;
    stack.style.setProperty("--cltc-roll-to", String(to));
    stack.style.setProperty("--cltc-roll-to-y", toY);
    stack.dataset.animate = shouldAnimate ? "true" : "false";
    if (!shouldAnimate) {
      stack.style.transform = `translateY(${toY})`;
      stack.style.willChange = "";
      stack.dataset.animate = "false";
      return;
    }
    stack.style.willChange = "transform";
    const settle = () => {
      stack.style.transform = `translateY(${toY})`;
      stack.style.willChange = "";
      stack.dataset.animate = "false";
    };
    if (typeof window.requestAnimationFrame === "function") window.requestAnimationFrame(settle);
    else settle();
  }

  function createRollingSeparator(char) {
    const separator = document.createElement("span");
    separator.className = "cltc-roll-separator";
    separator.setAttribute("aria-hidden", "true");
    separator.dataset.cltcTokenType = "separator";
    separator.textContent = char;
    return separator;
  }

  function updateRollingValueSlot(slot, key, value) {
    const cacheKey = UTIL.normalizeText(key, 80);
    const text = UTIL.normalizeText(value, 80);
    if (slot.__cltcValueText === text) return;
    const previous = state.hubValueCache.get(cacheKey);
    const animate = Boolean(previous && previous !== text);
    let roll = slot.firstElementChild;
    if (!roll || !roll.classList?.contains("cltc-roll") || roll.dataset.rollKey !== cacheKey) {
      roll = document.createElement("span");
      roll.className = "cltc-roll";
      roll.dataset.rollKey = cacheKey;
      slot.replaceChildren(roll);
    }
    roll.setAttribute("aria-label", text);
    const oldDigits = new Map();
    Array.from(roll.querySelectorAll(".cltc-roll-digit-column")).forEach((column) => {
      oldDigits.set(column.dataset.cltcDigitPosition || "", column);
    });
    const oldSeparators = Array.from(roll.querySelectorAll(".cltc-roll-separator"));
    let separatorIndex = 0;
    const nodes = rollingTokens(text).map((token) => {
      if (token.type === "separator") {
        const separator = oldSeparators[separatorIndex++] || createRollingSeparator(token.char);
        separator.textContent = token.char;
        return separator;
      }
      const positionKey = String(token.digitPosition);
      const column = oldDigits.get(positionKey) || createRollingDigitColumn();
      const previousChar = previousDigitByPosition(previous, token.digitPosition);
      column.dataset.cltcDigitPosition = positionKey;
      updateRollingDigitColumn(column, token.char, animate && previousChar !== token.char);
      return column;
    });
    roll.replaceChildren(...nodes);
    slot.__cltcValueText = text;
    state.hubValueCache.set(cacheKey, text);
  }

  function cadencedShimmerText(text) {
    const safe = escapeHtml(text);
    return `<span class="cltc-cadenced-shimmer">${safe}<span class="cltc-cadenced-shimmer-sweep" aria-hidden="true"><span class="cltc-cadenced-shimmer-highlight">${safe}</span></span></span>`;
  }

  function cadencedShimmerHtml(html) {
    return `<span class="cltc-cadenced-shimmer">${html}<span class="cltc-cadenced-shimmer-sweep" aria-hidden="true"><span class="cltc-cadenced-shimmer-highlight">${html}</span></span></span>`;
  }

  function prefersReducedMotion() {
    try {
      return Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches);
    } catch {
      return false;
    }
  }

  function applyCadencedShimmerActive(active) {
    const root = state.root;
    if (!root) return;
    const nodes = hubSlots(root).shimmer;
    const elapsed = active && state.shimmerActiveStartedAt ? Math.max(0, Math.min(Date.now() - state.shimmerActiveStartedAt, SHIMMER_ACTIVE_MS)) : 0;
    for (const node of nodes) {
      const isActive = node.classList.contains("cltc-cadenced-shimmer-active");
      if (active) {
        if (!isActive) {
          node.style.setProperty("--cltc-shimmer-active-delay", `-${elapsed}ms`);
          node.classList.add("cltc-cadenced-shimmer-active");
        }
      } else if (isActive) {
        node.style.removeProperty("--cltc-shimmer-active-delay");
        node.classList.remove("cltc-cadenced-shimmer-active");
      }
    }
  }

  function clearCadencedShimmerTimers(options = {}) {
    const clearActive = options.clearActive !== false;
    if (state.shimmerDelayTimer) {
      window.clearTimeout(state.shimmerDelayTimer);
      state.shimmerDelayTimer = 0;
    }
    if (state.shimmerIntervalTimer) {
      window.clearInterval(state.shimmerIntervalTimer);
      state.shimmerIntervalTimer = 0;
    }
    if (clearActive && state.shimmerActiveTimer) {
      window.clearTimeout(state.shimmerActiveTimer);
      state.shimmerActiveTimer = 0;
    }
  }

  function pulseCadencedShimmer() {
    if (reconcileRunningWithComposerDom(currentSessionKey())) {
      scheduleRender(0);
      return;
    }
    if (!state.shimmerRunning || prefersReducedMotion()) return;
    if (state.shimmerActiveTimer) {
      window.clearTimeout(state.shimmerActiveTimer);
      state.shimmerActiveTimer = 0;
    }
    applyCadencedShimmerActive(false);
    void state.root?.offsetWidth;
    state.shimmerActiveStartedAt = Date.now();
    state.shimmerActiveUntil = Date.now() + SHIMMER_ACTIVE_MS;
    applyCadencedShimmerActive(true);
    state.shimmerActiveTimer = window.setTimeout(() => {
      state.shimmerActiveTimer = 0;
      state.shimmerActiveStartedAt = 0;
      state.shimmerActiveUntil = 0;
      applyCadencedShimmerActive(false);
    }, SHIMMER_ACTIVE_MS);
  }

  function stopCadencedShimmer(options = {}) {
    const finishActive = Boolean(options.finishActive);
    state.shimmerRunning = false;
    state.shimmerRunStartedAt = 0;
    const remaining = Math.max(0, (state.shimmerActiveUntil || 0) - Date.now());
    clearCadencedShimmerTimers({ clearActive: !finishActive });
    if (finishActive && remaining > 0) {
      applyCadencedShimmerActive(true);
      if (!state.shimmerActiveTimer) {
        state.shimmerActiveTimer = window.setTimeout(() => {
          state.shimmerActiveTimer = 0;
          state.shimmerActiveStartedAt = 0;
          state.shimmerActiveUntil = 0;
          applyCadencedShimmerActive(false);
        }, remaining);
      }
      return;
    }
    state.shimmerActiveStartedAt = 0;
    state.shimmerActiveUntil = 0;
    applyCadencedShimmerActive(false);
  }

  function syncCadencedShimmer(running) {
    if (!running) {
      if (state.shimmerRunning || state.shimmerActiveUntil) stopCadencedShimmer({ finishActive: true });
      return;
    }
    if (state.shimmerRunning) {
      applyCadencedShimmerActive(state.shimmerActiveUntil > Date.now());
      return;
    }
    state.shimmerRunning = true;
    state.shimmerRunStartedAt = Date.now();
    if (prefersReducedMotion()) return;
    pulseCadencedShimmer();
    state.shimmerIntervalTimer = window.setInterval(pulseCadencedShimmer, SHIMMER_INTERVAL_MS);
  }

  function valueSlot(key) {
    return `<span class="cltc-value-slot" data-cltc-value-key="${escapeHtml(key)}"></span>`;
  }

  function textSlot(key) {
    return `<span class="cltc-text-slot" data-cltc-text-key="${escapeHtml(key)}"></span>`;
  }

  function currentFlowSkeleton(showOutputRate = outputRateVisible()) {
    const outputRateMarkup = showOutputRate
      ? `<span class="cltc-output-rate" data-cltc-output-rate="live" hidden> · ${valueSlot("current-output-rate")} token/s</span><span class="cltc-output-rate" data-cltc-output-rate="average" hidden> · ${valueSlot("current-average-output-rate")} token/s</span>`
      : "";
    return `本轮 输入 ${valueSlot("current-input")}<span class="cltc-current-spacer" aria-hidden="true">&nbsp;&nbsp;</span>输出 ${valueSlot("current-output")}${outputRateMarkup}`;
  }

  function hubSkeletonHtml(showOutputRate = outputRateVisible()) {
    const currentFlow = currentFlowSkeleton(showOutputRate);
    const sessionCache = showOutputRate
      ? `缓存 ${valueSlot("session-cache-percent")}`
      : `缓存 ${valueSlot("session-cached")} (${valueSlot("session-cache-percent")})`;
    return `
      <span class="cltc-pill cltc-current-pill"><span class="cltc-current-flow">${cadencedShimmerHtml(currentFlow)}</span></span>
      <span class="cltc-pill">会话 ${valueSlot("session-total")}</span>
      <span class="cltc-pill">${sessionCache}</span>
      <span class="cltc-pill">花费 ${valueSlot("session-cost")}</span>
      <span class="cltc-pill">今日 ${valueSlot("day-cost")}</span>
      <span class="cltc-pill" data-cltc-model-pill="true"><span class="cltc-model-label">${officialFastModeIconHtml()}<span class="cltc-model-text">${textSlot("model")}<span class="cltc-model-effort" data-cltc-model-effort="true" data-cltc-text-key="model-effort"></span></span></span></span>
    `;
  }

  function hubSlots(root) {
    if (!root) return { root: null, value: new Map(), text: new Map(), effort: null, modelPill: null, fastIcon: null, rateLive: [], rateAverage: [], shimmer: [] };
    if (state.hubSlots?.root === root) return state.hubSlots;
    const slots = {
      root,
      value: new Map(),
      text: new Map(),
      effort: null,
      modelPill: null,
      fastIcon: null,
      rateLive: [],
      rateAverage: [],
      shimmer: [],
    };
    const add = (map, key, node) => {
      const list = map.get(key);
      if (list) list.push(node);
      else map.set(key, [node]);
    };
    root.querySelectorAll?.("[data-cltc-value-key]").forEach((node) => add(slots.value, node.dataset.cltcValueKey || "", node));
    root.querySelectorAll?.("[data-cltc-text-key]").forEach((node) => add(slots.text, node.dataset.cltcTextKey || "", node));
    slots.effort = root.querySelector?.("[data-cltc-model-effort='true']") || null;
    slots.modelPill = root.querySelector?.("[data-cltc-model-pill='true']") || null;
    slots.fastIcon = root.querySelector?.("[data-cltc-fast-mode-icon='true']") || null;
    slots.rateLive = Array.from(root.querySelectorAll?.("[data-cltc-output-rate='live']") || []);
    slots.rateAverage = Array.from(root.querySelectorAll?.("[data-cltc-output-rate='average']") || []);
    slots.shimmer = Array.from(root.querySelectorAll?.(".cltc-cadenced-shimmer") || []);
    state.hubSlots = slots;
    return slots;
  }

  function ensureHubSkeleton(root, showOutputRate = outputRateVisible()) {
    const outputRateEnabled = Boolean(showOutputRate);
    if (root.dataset.cltcOutputRateVisible !== String(outputRateEnabled)) root.dataset.cltcOutputRateVisible = String(outputRateEnabled);
    if (
      root.dataset.cltcSkeletonVersion === VERSION &&
      root.dataset.cltcSkeletonOutputRate === String(outputRateEnabled) &&
      root.firstElementChild
    ) {
      return;
    }
    root.innerHTML = hubSkeletonHtml(outputRateEnabled);
    root.dataset.cltcSkeletonVersion = VERSION;
    root.dataset.cltcSkeletonOutputRate = String(outputRateEnabled);
    state.hubSlots = null;
  }

  function updateValueSlot(root, key, value) {
    const slots = hubSlots(root).value.get(key);
    if (!slots) return;
    for (const slot of slots) updateRollingValueSlot(slot, key, value);
  }

  function updateTextSlot(root, key, value) {
    const slots = hubSlots(root).text.get(key);
    if (!slots) return;
    const text = String(value ?? "");
    for (const slot of slots) {
      if (slot.textContent !== text) slot.textContent = text;
    }
  }

  function updateHubContent(root, snap, sessionPricedLabel, dayPricedLabel) {
    const slots = hubSlots(root);
    updateValueSlot(root, "current-input", fmtCount(snap.current.input));
    updateValueSlot(root, "current-output", fmtCount(snap.current.output));
    updateValueSlot(root, "current-output-rate", fmtCount(snap.rate.value));
    updateValueSlot(root, "current-average-output-rate", fmtAverageOutputTokenRate(snap.averageRate.value));
    updateValueSlot(root, "session-total", fmtCount(snap.session.total));
    updateValueSlot(root, "session-cached", fmtCount(snap.session.cached));
    updateValueSlot(root, "session-cache-percent", UTIL.fmtPercent(snap.session.cached, snap.session.input));
    updateValueSlot(root, "session-cost", fmtMoney(snap.sessionCost.value));
    updateValueSlot(root, "day-cost", fmtMoney(snap.dayCost.value));
    updateTextSlot(root, "session-priced-label", sessionPricedLabel);
    updateTextSlot(root, "day-priced-label", dayPricedLabel);
    updateTextSlot(root, "model", snap.displayModel || snap.model);
    updateTextSlot(root, "model-effort", snap.modelInfo.displayEffort || snap.modelInfo.effort || "");
    const effortNode = slots.effort;
    if (effortNode) setButtonAttribute(effortNode, "data-effort", snap.modelInfo.effort || "");
    const modelPill = slots.modelPill;
    if (modelPill && modelPill.hasAttribute?.("title")) modelPill.removeAttribute("title");
    const fastIcon = slots.fastIcon;
    if (fastIcon) {
      fastIcon.hidden = !snap.fastMode;
      if (snap.fastMode) fastIcon.removeAttribute?.("hidden");
      else fastIcon.setAttribute?.("hidden", "");
    }
    for (const node of slots.rateLive) {
      const hidden = !snap.rate.visible;
      if (node.hidden !== hidden) node.hidden = hidden;
    }
    for (const node of slots.rateAverage) {
      const hidden = !snap.averageRate.visible;
      if (node.hidden !== hidden) node.hidden = hidden;
    }
  }

  function render(force = false) {
    if (state.destroyed) return;
    if (!force && state.priceEditorOpen && state.settingsOverlay?.contains(document.activeElement) && document.activeElement?.closest?.(".cltc-settings-modal")) {
      return;
    }
    state.lastRenderAt = Date.now();
    const root = ensureRoot();
    if (!root) return;
    const snap = liveSnapshot();
    const sessionPricedLabel = costPricedLabel(snap.sessionCost, snap.session);
    const dayPricedLabel = costPricedLabel(snap.dayCost, snap.dayUsage);
    if (root.dataset.running !== String(snap.running)) root.dataset.running = String(snap.running);
    ensureHubSkeleton(root, snap.outputRateEnabled);
    updateHubContent(root, snap, sessionPricedLabel, dayPricedLabel);
    syncCadencedShimmer(snap.running);
    syncOutputRateRefresh(snap.rate);
    syncHubVisibility(root);
    if (!state.settingsOverlay?.isConnected || !state.priceEditorOpen) renderSettingsOverlay(snap, { fromRender: true });
  }

  function scheduleRender(delay = 0) {
    if (state.destroyed) return;
    if (state.renderTimer) return;
    const wait = Math.max(delay, RENDER_THROTTLE_MS - (Date.now() - state.lastRenderAt), 0);
    state.renderTimer = window.setTimeout(() => {
      state.renderTimer = 0;
      render();
    }, wait);
  }

  function handleSettingsChange(event) {
    const hubToggle = event.target?.closest?.("[data-misc-field='hubVisible']");
    if (hubToggle) {
      saveHubVisible(Boolean(hubToggle.checked));
      syncHubVisibility(state.root, document, true);
      scheduleHubVisibilitySync(0);
      if (state.priceEditorOpen) renderSettingsOverlay(liveSnapshot());
      return;
    }
    const outputRateToggle = event.target?.closest?.("[data-misc-field='outputRateVisible']");
    if (outputRateToggle) {
      saveOutputRateVisible(Boolean(outputRateToggle.checked));
      render(true);
      return;
    }
    const profileUnlockToggle = event.target?.closest?.("[data-misc-field='profileUnlockEnabled']");
    if (profileUnlockToggle) {
      setProfileUnlockEnabled(Boolean(profileUnlockToggle.checked));
      renderSettingsOverlay(liveSnapshot());
      return;
    }
    const planTypeField = event.target?.closest?.("[data-profile-field='planType']");
    if (planTypeField) {
      const customRow = settingsEditorRoot()?.querySelector?.("[data-profile-custom-row]");
      if (customRow) customRow.hidden = planTypeField.value !== "custom";
      return;
    }
  }

  // 设置页运行时外壳（标题栏、更新入口等）属于设置界面本身，不算“点击外部”。
  function handleDocumentPointerDown(event) {
    if (state.embeddedPageContainer) {
      if (state.embeddedPageContainer.contains?.(event.target)) return;
      if (event.target?.closest?.(".codex-plus-modal-content, .codex-plus-page-overlay")) return;
      if (state.updateClusterEl?.contains?.(event.target)) return;
      closeEmbeddedSettingsPage();
      return;
    }
    if (state.priceEditorOpen && !state.root?.contains(event.target) && !state.settingsOverlay?.contains(event.target)) {
      state.priceEditorOpen = false;
      state.priceDraft = null;
      state.analyticsModel = "";
      state.analyticsModelsExpanded = false;
      render();
    }
  }

  function installLocalFetchCapture() {
    if (typeof window.fetch !== "function" || window.fetch.__codexLiveTokenCostWrapped === VERSION) return;
    const originalFetch = window.fetch.__codexLiveTokenCostOriginal || window.fetch;
    async function wrappedFetch(input, init) {
      const url = requestUrl(input);
      const method = requestMethod(input, init);
      if (profileSyntheticEnabled() && (isProfileUsageUrl(url) || isProfilePhotoUrl(url) || isProfilePageUrl(url) || isProfilePinOptionsUrl(url))) {
        return new Response(JSON.stringify(await profileFetchBodyAsync(method, init?.body, url)), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      const isCodexApi = isCodexApiUrl(url);
      if (isCodexApi) {
        observeSessionInfo(url);
        try {
          inspectLocalPayload(init?.body, "fetch-body");
        } catch {
          // Keep page fetch behavior untouched.
        }
      }
      const response = await originalFetch.call(this, input, init);
      if (response?.clone && isCodexApi) {
        response.clone().text().then((text) => inspectLocalPayload(text, "fetch")).catch(() => {});
      }
      return response;
    }
    wrappedFetch.__codexLiveTokenCostWrapped = VERSION;
    wrappedFetch.__codexLiveTokenCostOriginal = originalFetch;
    window.fetch = wrappedFetch;
  }

  function installLocalXhrCapture() {
    const Xhr = window.XMLHttpRequest;
    if (!Xhr?.prototype || Xhr.prototype.__codexLiveTokenCostWrapped === VERSION) return;
    const originalOpen = Xhr.prototype.__codexLiveTokenCostOriginalOpen || Xhr.prototype.open;
    const originalSend = Xhr.prototype.__codexLiveTokenCostOriginalSend || Xhr.prototype.send;
    Xhr.prototype.open = function open(method, url, ...rest) {
      this.__codexLiveTokenCostUrl = url;
      return originalOpen.call(this, method, url, ...rest);
    };
    Xhr.prototype.send = function send(...args) {
      const url = this.__codexLiveTokenCostUrl || "";
      const isCodexApi = isCodexApiUrl(url);
      if (isCodexApi) {
        observeSessionInfo(url);
        try {
          inspectLocalPayload(args[0], "xhr-body");
        } catch {
          // Keep XHR behavior untouched.
        }
      }
      this.addEventListener?.("loadend", () => {
        if (!isCodexApiUrl(this.__codexLiveTokenCostUrl)) return;
        try {
          inspectLocalPayload(this.responseText || "", "xhr");
        } catch {
          // Ignore unreadable XHR bodies.
        }
      });
      return originalSend.apply(this, args);
    };
    Xhr.prototype.__codexLiveTokenCostOriginalOpen = originalOpen;
    Xhr.prototype.__codexLiveTokenCostOriginalSend = originalSend;
    Xhr.prototype.__codexLiveTokenCostWrapped = VERSION;
  }

  function installLocalWebSocketCapture() {
    if (typeof window.WebSocket !== "function" || window.WebSocket.__codexLiveTokenCostWrapped === VERSION) return;
    const NativeWebSocket = window.WebSocket.__codexLiveTokenCostOriginal || window.WebSocket;
    function WrappedWebSocket(...args) {
      const socket = new NativeWebSocket(...args);
      socket.addEventListener?.("message", (event) => {
        try {
          if (typeof event.data === "string") inspectLocalPayload(event.data, "websocket");
          else if (event.data instanceof Blob && event.data.size <= 512000) {
            event.data.text().then((text) => inspectLocalPayload(text, "websocket")).catch(() => {});
          }
        } catch {
          // Keep socket delivery untouched.
        }
      });
      return socket;
    }
    try {
      WrappedWebSocket.prototype = NativeWebSocket.prototype;
      Object.defineProperty(WrappedWebSocket, "CONNECTING", { value: NativeWebSocket.CONNECTING });
      Object.defineProperty(WrappedWebSocket, "OPEN", { value: NativeWebSocket.OPEN });
      Object.defineProperty(WrappedWebSocket, "CLOSING", { value: NativeWebSocket.CLOSING });
      Object.defineProperty(WrappedWebSocket, "CLOSED", { value: NativeWebSocket.CLOSED });
    } catch {
      // Best-effort compatibility.
    }
    WrappedWebSocket.__codexLiveTokenCostWrapped = VERSION;
    WrappedWebSocket.__codexLiveTokenCostOriginal = NativeWebSocket;
    window.WebSocket = WrappedWebSocket;
  }

  function installLocalMessageCapture() {
    if (state.localMessageHandler) return;
    const previous = window.__codexLiveTokenCostMessageHandler;
    if (typeof previous === "function") window.removeEventListener?.("message", previous, true);
    const handler = (event) => inspectLocalPayload(event.data, "message");
    state.localMessageHandler = handler;
    window.__codexLiveTokenCostMessageHandler = handler;
    window.addEventListener?.("message", handler, true);
    window.__codexLiveTokenCostMessageCapture = VERSION;
  }

  function uninstallLocalMessageCapture() {
    const handlers = new Set([state.localMessageHandler, window.__codexLiveTokenCostMessageHandler].filter((handler) => typeof handler === "function"));
    for (const handler of handlers) window.removeEventListener?.("message", handler, true);
    if (handlers.has(window.__codexLiveTokenCostMessageHandler)) delete window.__codexLiveTokenCostMessageHandler;
    state.localMessageHandler = null;
    delete window.__codexLiveTokenCostMessageCapture;
  }

  function refreshProfileData(options = {}) {
    if (state.profileDataRefreshPromise) return state.profileDataRefreshPromise;
    const attemptedAt = UTIL.toCount(state.profileDataRefreshAttemptAt);
    if (!options.force && attemptedAt && Date.now() - attemptedAt < PROFILE_DATA_REFRESH_MIN_INTERVAL_MS) {
      return Promise.resolve({ ok: false, skipped: true });
    }
    state.profileDataRefreshAttemptAt = Date.now();
    state.profileDataRefreshPromise = Promise.resolve()
      .then(() => {
        profileLedgerRebuildRollup();
        rebuildAnalyticsRollup();
        state.profileDataRefreshAt = Date.now();
        return { ok: true };
      })
      .catch((error) => ({ ok: false, error: error?.message || String(error) }))
      .finally(() => {
        state.profileDataRefreshPromise = null;
      });
    return state.profileDataRefreshPromise;
  }

  async function fetchCodexppHistory(options = {}) {
    if (state.codexppHistoryFetching) return state.codexppHistoryAt > 0;
    if (typeof window.codexPlus?.call !== "function" || !codexPlusApiReady()) return false;
    const sessionId = UTIL.normalizeText(options.sessionId || currentSessionKey(), 240).replace(/^local:/, "");
    if (!sessionId) return false;
    state.codexppHistoryFetching = true;
    try {
      const payload = await window.codexPlus.call("/thread-usage-history", { session_id: sessionId });
      const turns = codexppHistoryTurnsFromPayload(payload, sessionId);
      if (turns.length) {
        state.codexppHistoryTurns = turns;
        state.codexppHistoryAt = Date.now();
        invalidateLocalUsageCache();
        scheduleRender(0);
        return true;
      }
      return false;
    } catch {
      return false;
    } finally {
      state.codexppHistoryFetching = false;
    }
  }

  function refreshCodexppHistory(options = {}) {
    const sessionId = UTIL.normalizeText(options.sessionId || currentSessionKey(), 240).replace(/^local:/, "");
    if (!sessionId) return false;
    const cacheTtl = 5 * 60 * 1000;
    if (state.codexppHistoryAt && Date.now() - state.codexppHistoryAt < cacheTtl && state.codexppHistorySessionId === sessionId) return false;
    state.codexppHistorySessionId = sessionId;
    void fetchCodexppHistory(options);
    return true;
  }

  function scheduleProfileQueryClientDiscovery(retry = 0) {
    if (window.__CODEX_LIVE_TOKEN_COST_TEST__ || state.profileQueryClient || state.profileQueryClientDiscoveryTimer || retry > 4) return;
    state.profileQueryClientDiscoveryTimer = window.setTimeout(() => {
      state.profileQueryClientDiscoveryTimer = 0;
      const client = profileQueryClientFromDocument();
      if (client) {
        rememberProfileQueryClient(client);
        if (profileSyntheticEnabled() || profileDataOverrideEnabledFor(client)) {
          safeInstallOfficialProfileUnlock();
          scheduleProfileUsageRefresh(0);
        } else {
          syncProfileUsageQueryCache(client);
        }
        return;
      }
      scheduleProfileQueryClientDiscovery(retry + 1);
    }, retry === 0 ? 0 : 250 * retry);
  }

  function installLocalCapture() {
    installLocalFetchCapture();
    installLocalXhrCapture();
    installLocalWebSocketCapture();
    installLocalMessageCapture();
  }

  function installProfileQueryClientObserver() {
    if (state.profileQueryClientDiscoveryObserver || window.__CODEX_LIVE_TOKEN_COST_TEST__ || typeof MutationObserver !== "function") return;
    const target = document.body || document.documentElement;
    if (!target) return;
    state.profileQueryClientDiscoveryObserver = new MutationObserver(() => {
      if (state.profileQueryClient) {
        state.profileQueryClientDiscoveryObserver?.disconnect?.();
        state.profileQueryClientDiscoveryObserver = null;
        return;
      }
      // React streams text into the chat DOM continuously. Walking the fiber tree on every
      // mutation is expensive, so probe at most four times per second until the client is found.
      const now = Date.now();
      if (now - state.profileQueryClientDiscoveryProbeAt < 250) return;
      state.profileQueryClientDiscoveryProbeAt = now;
      const client = profileQueryClientFromDocument();
      if (!client) return;
      rememberProfileQueryClient(client);
      if (profileSyntheticEnabled() || profileDataOverrideEnabledFor(client)) {
        safeInstallOfficialProfileUnlock();
        scheduleProfileUsageRefresh(0);
      } else {
        syncProfileUsageQueryCache(client);
      }
    });
    state.profileQueryClientDiscoveryObserver.observe(target, { childList: true, subtree: true });
  }

  function handleVisibilityChange() {
    if (document.hidden) return;
    // 页面重新可见时强制补一次，避免后台期间宿主替换 DOM 后 HUB 仍停在旧内容。
    render(true);
    if (state.shimmerRunning) pulseCadencedShimmer();
  }

  // 未处理的 Promise 拒绝兜底：脚本里大量 `void xxx()` 形式的后台任务，
  // 没有这个监听时它们会静默消失，界面上什么都不会变。
  // ---------------------------------------------------------------------------
  // 模块 24：启动与销毁
  // start / scheduleStart / destroy；所有资源经 disposers 拆除。
  // ---------------------------------------------------------------------------
  function handleUnhandledRejection(event) {
    const reason = event?.reason;
    state.unhandledRejectionCount += 1;
    state.lastUnhandledRejection = String((reason && (reason.message || reason)) || "unknown").slice(0, 300);
    try {
      console.warn("[Codex Token Cost] unhandled rejection:", reason);
    } catch {
      // 控制台不可用时忽略。
    }
  }

  function start() {
    if (state.started || state.destroyed) return;
    state.started = true;
    loadLocalLedger();
    // 启动恢复顺序：IndexedDB -> 主机快照 -> localStorage 旧账本迁移。
    void ensureUsageFactsLoaded().then(() => {
      usageFactHydrateLedger();
      rebuildAnalyticsRollup();
      scheduleRender();
    });
    cleanupAutoZeroPriceModels();
    installLocalCapture();
    trackListener(document, "click", handleDocumentClick, true);
    trackListener(document, "pointerdown", handleDocumentPointerDown, true);
    trackListener(document, "visibilitychange", handleVisibilityChange, false);
    trackListener(window, "unhandledrejection", handleUnhandledRejection, false);
    installOfficialModelObserver();
    installTaskRunningObserver();
    scheduleProfileQueryClientDiscovery();
    installProfileQueryClientObserver();
    if ((profileSyntheticEnabled() || profileDataOverrideEnabledFor()) && state.profileQueryClient) safeInstallOfficialProfileUnlock();
    installHubVisibilityObserver();
    if (profileSyntheticEnabled() && state.profileQueryClient) scheduleProfileUsageRefresh(0);
    installCodexPlusEmbeddedPage();
    refreshCodexppHistory();
    scheduleUsageAutoSync();
    updateScheduleAutoCheck();
    render();
    void refreshDefaultPrices();
  }

  function scheduleStart() {
    if (state.started || state.destroyed) return;
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
    else start();
    if (!window.__CODEX_LIVE_TOKEN_COST_TEST__) state.startTimer = trackTimer(window.setTimeout(start, 1200));
  }

  function destroy() {
    // 运行时可能在旧实例已被替换后才调用它注册的清理函数（stale cleanup）：
    // 仅当全局引用仍指向本实例时才执行全局清理，避免旧清理误伤新实例。
    const ownsGlobals = window.__codexLiveTokenCost?.destroy === destroy;
    state.started = false;
    state.destroyed = true;
    window.clearTimeout(state.startTimer);
    state.startTimer = 0;
    if (state.updateAutoCheckTimer) window.clearTimeout(state.updateAutoCheckTimer);
    state.updateAutoCheckTimer = 0;
    updateClearStatusTimer();
    stopProfileUiReadinessCoordinator();
    stopSidebarProfileIdentitySync();
    state.profileUiAuthCacheKey = "";
    state.profileUiAuthCacheSource = null;
    state.profileUiAuthCache = null;
    state.profileUiApiAuthCacheSource = null;
    state.profileUiApiAuthCachePrefs = null;
    state.profileUiApiAuthCache = null;
    state.profileUnlockInstalledMode = "";
    state.profileUnlockInstalledClient = null;
    if (state.profileAuthPatchRetryTimer) window.clearTimeout(state.profileAuthPatchRetryTimer);
    state.profileAuthPatchRetryTimer = 0;
    state.profileAuthPatchRetries = 0;
    if (state.renderTimer) window.clearTimeout(state.renderTimer);
    if (state.usageSyncAutoTimer) window.clearTimeout(state.usageSyncAutoTimer);
    state.usageSyncAutoTimer = 0;
    cancelOutputRateRefresh();
    if (state.profileSaveStatusTimer) window.clearTimeout(state.profileSaveStatusTimer);
    if (state.settingsOverlayCloseTimer) window.clearTimeout(state.settingsOverlayCloseTimer);
    if (state.settingsPanelEnterTimer) window.clearTimeout(state.settingsPanelEnterTimer);
    state.settingsPanelEnterTimer = 0;
    cancelSettingsFocusFrame();
    if (state.analyticsSegmentSwitchFrame && typeof window.cancelAnimationFrame === "function") {
      window.cancelAnimationFrame(state.analyticsSegmentSwitchFrame);
    }
    if (state.profileUsageRefreshTimer) window.clearTimeout(state.profileUsageRefreshTimer);
    if (state.hubVisibilityTimer) window.clearTimeout(state.hubVisibilityTimer);
    state.priceRemoteRequest = null;
    if (state.priceSyncRetryTimer) window.clearTimeout(state.priceSyncRetryTimer);
    state.priceSyncRetryTimer = 0;
    state.profileSaveStatusTimer = 0;
    state.settingsOverlayCloseTimer = 0;
    state.analyticsSegmentSwitchFrame = 0;
    stopAnalyticsTimer();
    state.hubVisibilityObserver?.disconnect?.();
    state.profileQueryClientDiscoveryObserver?.disconnect?.();
    state.officialModelObserver?.disconnect?.();
    state.officialModelRootObserver?.disconnect?.();
    if (state.officialModelRebindTimer) window.clearTimeout(state.officialModelRebindTimer);
    state.officialModelRebindTimer = 0;
    state.taskRunningObserver?.disconnect?.();
    state.officialModelObserver = null;
    state.officialModelRootObserver = null;
    state.officialModelTrigger = null;
    state.taskRunningObserver = null;
    state.hubVisibilityObserver = null;
    state.profileQueryClientDiscoveryObserver = null;
    state.profileQueryClient = null;
    stopProfileQueryCacheObserver();
    state.profileAccountsRefreshPromise = null;
    state.profileDataRefreshAttemptAt = 0;
    state.profileDataRefreshAt = 0;
    state.profileDataRefreshPromise = null;
    if (ownsGlobals) {
      if (Array.prototype.filter.__codexLiveTokenCostProfileUnlock === VERSION) {
        Array.prototype.filter = Array.prototype.__codexLiveTokenCostOriginalFilter;
      }
      if (Promise.prototype.then.__codexLiveTokenCostProfileUnlock === VERSION) {
        Promise.prototype.then = Promise.prototype.__codexLiveTokenCostOriginalThen;
      }
      if (RegExp.prototype.test.__codexLiveTokenCostProfileUnlock === VERSION) {
        RegExp.prototype.test = RegExp.prototype.__codexLiveTokenCostOriginalTest;
      }
      if (window.electronBridge?.sendMessageFromView?.__codexLiveTokenCostProfileUnlock === VERSION) {
        try {
          window.electronBridge.sendMessageFromView = window.electronBridge.__codexLiveTokenCostOriginalSendMessageFromView;
        } catch {
          // Read-only preload bridges cannot be restored by assignment.
        }
      }
      if (window.__codexLiveTokenCostProfileMessageIntercept === VERSION) {
        window.removeEventListener("codex-message-from-view", handleProfileFetchEvent, true);
        window.removeEventListener("message", handleProfileFetchResponseEvent, true);
        delete window.__codexLiveTokenCostProfileMessageIntercept;
      }
      uninstallLocalMessageCapture();
    }
    state.profileRequestIds.clear();
    state.codexModulePromises.clear();
    state.codexAssetUrlCache.clear();
    state.codexAssetTextCache.clear();
    state.codexAssetSignature = null;
    state.officialThreadRuntimeStates.clear();
    state.runtimeSessionBindings.clear();
    if (ownsGlobals) {
      if (window.__codexLiveTokenCostBridgeHook === VERSION) delete window.__codexLiveTokenCostBridgeHook;
      if (window.__codexLiveTokenCostProfileRequestPatch === VERSION) delete window.__codexLiveTokenCostProfileRequestPatch;
      if (window.__codexLiveTokenCostProfilePhotoPatch === VERSION) delete window.__codexLiveTokenCostProfilePhotoPatch;
      if (window.__codexLiveTokenCostProfileAuthPatch === VERSION) delete window.__codexLiveTokenCostProfileAuthPatch;
      if (window.fetch?.__codexLiveTokenCostWrapped === VERSION) window.fetch = window.fetch.__codexLiveTokenCostOriginal;
      if (window.WebSocket?.__codexLiveTokenCostWrapped === VERSION) window.WebSocket = window.WebSocket.__codexLiveTokenCostOriginal;
      const Xhr = window.XMLHttpRequest;
      if (Xhr?.prototype?.__codexLiveTokenCostWrapped === VERSION) {
        Xhr.prototype.open = Xhr.prototype.__codexLiveTokenCostOriginalOpen;
        Xhr.prototype.send = Xhr.prototype.__codexLiveTokenCostOriginalSend;
        delete Xhr.prototype.__codexLiveTokenCostWrapped;
      }
    }
    while (disposers.length) {
      const dispose = disposers.pop();
      try { dispose(); } catch { }
    }
    for (const sessionKey of Array.from(state.localTurnTimers.keys())) clearLocalTurnTimer(sessionKey);
    clearLocalTurnTimer();
    stopCadencedShimmer();
    state.root?.remove();
    if (ownsGlobals && typeof state.embeddedPageDispose === "function") {
      try {
        state.embeddedPageDispose();
      } catch {
        // Best-effort teardown; Codex++ page hosts are rebuilt by the host.
      }
      state.embeddedPageDispose = null;
    }
    state.embeddedPageContainer = null;
    state.updateClusterEl?.remove?.();
    state.updateClusterEl = null;
    state.updateBusy = false;
    state.updatePhase = "";
    state.settingsOverlay?.remove?.();
    state.settingsOverlay = null;
    if (ownsGlobals) document.getElementById(STYLE_ID)?.remove();
    if (window.__codexLiveTokenCostActiveBridge === state.activeBridge) delete window.__codexLiveTokenCostActiveBridge;
    state.activeBridge = null;
    if (ownsGlobals) {
      delete window.__codexLiveTokenCost;
      if (window.__codexLiveTokenCostVersion === VERSION) delete window.__codexLiveTokenCostVersion;
    }
    if (window.__CODEX_LIVE_TOKEN_COST_TEST__ && disposers.length !== 0) {
      throw new Error("Codex Token Cost: disposers not drained");
    }
  }

  window.__codexLiveTokenCost = {
    version: VERSION,
    render,
    destroy,
    prices: visiblePrices,
    modelInfo: activeModelInfo,
    setModelPrice(model, price) {
      state.priceSaveError = "";
      const name = String(model || "").trim();
      const rawValues = [price?.input, price?.cachedInput, price?.cacheWrite, price?.output];
      if (rawValues.some((value) => value != null && value !== "" && (!Number.isFinite(Number(value)) || Number(value) < 0))) return false;
      const normalized = normalizePrice(price);
      if (!name || !normalized || !priceUsable(normalized)) return false;
      const overrides = { ...priceOverrides() };
      overrides[name] = normalized;
      try {
        localStorage.setItem(PRICE_OVERRIDES_KEY, JSON.stringify(overrides));
        invalidatePriceOverridesCache();
        void priceCacheFlush();
      } catch {
        // localStorage 接近配额时 setItem 会抛 QuotaExceededError；必须把失败
        // 原因带回编辑器，否则界面看起来“点了保存但什么都没发生”。
        state.priceSaveError = "本地存储空间不足，价格未保存";
        return false;
      }
      try {
        const hidden = hiddenPriceModels();
        hidden.delete(name);
        saveHiddenPriceModels(hidden);
      } catch {
        // 隐藏列表清理失败不影响已经写入的价格。
      }
      render();
      return true;
    },
    usage: localUsageExport,
    importLocalUsageTurns,
    refreshProfileData,
    debugSessionState,
  };

  if (window.__CODEX_LIVE_TOKEN_COST_TEST__) {
    window.__codexLiveTokenCostTest = {
      normalizeUsage,
      profileNormalizeSnapshot,
      profileLedgerRebuildTurnIndex,
      profileLedgerTurnIndex,
      profileLedgerUpsertTurn,
      profileLedgerObserveLocalTurn,
      profileLedgerActivity,
      profileLedgerTurns: () => ensureProfileLedgerLoaded().turns,
      profileLedgerUsageCalls: () => ensureProfileLedgerLoaded().usageCalls,
      profileLedgerInvocations: () => ensureProfileLedgerLoaded().invocations,
      profileDisplayedBucket,
      saveProfileLedgerSnapshot,
      calcCost,
      costForModelUsage,
      addUsage,
      aggregateTurnUsage,
      outputTokenRate,
      averageOutputTokenRate,
      fmtAverageOutputTokenRate,
      usageHasCostData,
      costPricedLabel,
      shouldPersistUsagePayload,
      isComposerDraftPayload,
      shouldStartTurnFromRequestPayload,
      isTokenCountPayload,
      isTaskCompletePayload,
      officialRuntimeSignalFromPayload,
      observeOfficialRuntimePayload,
      sessionlessTaskCompleteSessionKey,
      currentLocalTurnSessionKeys: () => Array.from(state.localCurrentTurns.keys()),
      localCurrentTurn: (sessionKey) => localCurrentTurn(sessionKey),
      isOfficialThreadRunning,
      collectUsages,
      hasAssistantResultOutputStarted,
      fmtCount,
      fmtMoney,
      fmtPercent: UTIL.fmtPercent,
      rollComparableValue,
      rollTrend,
      parseModelEffortText,
      normalizeOfficialEffort,
      officialModelInfoFromText,
      officialModelTriggerInfo,
      readOfficialModelTrigger,
      bindOfficialModelTrigger,
      extractModelInfo,
      extractFastMode,
      countsTowardFastModeUsage,
      collectProfileInvocations,
      localProfileActivityStats,
      observeModelInfo,
      mainEditable,
      isMainComposerSurfaceTarget,
      findComposerBox,
      readTokenUsage,
      liveSnapshot,
      locationSessionKey,
      activeSidebarThreadKey,
      extractSessionKeyFromUrl,
      extractSessionInfo,
      extractSessionIdentity,
      observeSessionInfo,
      currentSessionKey,
      conversationContentState,
      startupBlankConversationSessionKey,
      rememberSidebarThreadClick,
      rememberNewConversationClick,
      migrateLegacyLocationSessionTurns,
      currentSessionTurns,
      localProfileThreadCount,
      trimLocalLedger,
      compactLocalLedger,
      localUsageArchiveTurns,
      localUsageArchiveTurnsForAnalytics,
      setLocalUsageArchive(archive) {
        state.localUsageArchive = normalizeLocalUsageArchive(archive);
      },
      setLocalLedger(turns) {
        state.localLedger = Array.isArray(turns) ? turns : [];
        invalidateLocalUsageCache();
      },
      localLedgerSnapshot() {
        return state.localLedger.map((turn) => JSON.parse(JSON.stringify(turn)));
      },
      codexppHistoryTurnsFromPayload,
      codexppTokenKey,
      mergeCodexppHistoryTurns,
      setCodexppHistoryTurns(turns) {
        state.codexppHistoryTurns = Array.isArray(turns) ? turns : [];
      },
      localDailyUsage,
      localDateKey,
      analyticsRangeForPreset,
      analyticsComparisonRange,
      analyticsVisibleTurns,
      aggregateUsageAnalytics,
      buildAnalyticsRollup,
      analyticsTurnsFromRollup,
      loadAnalyticsRollup,
      saveAnalyticsRollup,
      saveLocalLedger,
      saveDailyLedger,
      storageSaveErrors: () => ({
        localLedger: state.localLedgerSaveError,
        daily: state.dailyLedgerSaveError,
        analytics: state.analyticsRollupSaveError,
      }),
      usageAnalyticsHtml,
      analyticsComparisonText,
      analyticsChartBuckets,
      renderEmbeddedSettingsPage,
      installCodexPlusEmbeddedPage,
      todayUsage,
      todayCost,
      inspectLocalPayload,
      beginLocalTurn,
      beginLocalRequestTurn,
      finishLocalTurn,
      scheduleLocalTurnCompletionCheck,
      restoreRunningCurrentTurnFromLast,
      setLocalCurrentTurn,
      finishActiveTurnFromDomIfStopped,
      isCodexComposerCompleteDom,
      isCodexTaskRunningDom,
      officialComposerRunState,
      reconcileRunningWithComposerDom,
      clearStaleRunningSignals,
      isTurnShimmerRunning,
      startTurnShimmer,
      stopTurnShimmer,
      syncOutputRateRefresh,
      cancelOutputRateRefresh,
      currentFlowSkeleton,
      hubSkeletonHtml,
      updateValueSlot,
      rememberLocalUsage,
      persistLocalCurrentTurn,
      importLocalUsageTurns,
      refreshProfileData,
      saveProfilePrefsFromEditor,
      profileSaveToastHtml,
      generalSettingsHtml,
      // 设置页点击分发：四个账本按钮的行为只能从分发层验证，单独测函数测不到接线错误。
      handleSettingsClick: (event) => handleSettingsClick(event),
      handleUnhandledRejection: (event) => handleUnhandledRejection(event),
      usageSyncRun: (options) => runUsageSync(options || {}),
      usageSyncState: () => usageSyncTestState(),
      usageSyncParseLines: (lines, summary) => usageSyncParseRolloutLines(lines, summary || { lineErrors: 0 }),
      usageSyncFinalizeTurnRow: (threadId, record, fallbackModel, fallbackEffort) => usageSyncFinalizeTurnRow(threadId, record, fallbackModel || "", fallbackEffort || ""),
      usageSyncIngestRolloutText: (text, threads) => usageSyncIngestRolloutText(text, threads),
      usageSyncFinalizeCollected: (files, threads, stats) => usageSyncFinalizeCollected(files, threads, stats),
      // 事实层：逐响应事实、持久化、主机备份、导出/导入、对账。
      usageFactUpsert: (record) => usageFactUpsert(record),
      usageFactTotals: () => usageFactTotals(),
      usageFactAuthoritativeTotals: () => usageFactAuthoritativeTotals(),
      usageFactBackfillLegacyModels: () => usageFactBackfillLegacyModels(),
      usageFactRecord: (responseId) => {
        const record = state.usageFacts.get(responseId);
        return record ? { ...record } : null;
      },
      usageFactReconcileReport: () => usageFactReconcileReport(),
      usageFactHydrateLedger: () => usageFactHydrateLedger(),
      usageFactReconcileSummary: () => usageFactReconcileSummary(),
      usageFactPersistResponses: (records) => usageFactPersistResponses(records),
      usageFactEnsureLoaded: () => ensureUsageFactsLoaded(),
      usageFactMigrateLegacy: () => usageFactMigrateLegacy(),
      usageFactBackupToHost: (options) => usageFactBackupToHost(options || {}),
      usageFactRestoreFromHostBackup: (options) => usageFactRestoreFromHostBackup(options || {}),
      usageFactPruneHostBackups: (clientOrOptions, maybeOptions) => usageFactPruneHostBackups(clientOrOptions && clientOrOptions.sendRequest ? clientOrOptions : (clientOrOptions && clientOrOptions.client) || appServerSyncClient(), maybeOptions || clientOrOptions || {}),
      usageFactExport: (format) => usageFactExport(format || "json"),
      // 下载封装：MIME 与文件名只能从这里验证（按钮固定走 json）。
      usageFactDownloadExport: (format) => usageFactDownloadExport(format || "json"),
      usageFactImport: (text) => usageFactImport(text),
      usageTimeModel: (turns) => usageTimeModel(turns),
      // 跨午夜拆分（验收 #14）
      usageFactDayIndex: () => usageFactDayIndex(),
      usageTurnDaySlices: (turn, dayIndex) => usageTurnDaySlices(turn, dayIndex || null),
      usageTurnDayDates: (turn, dayIndex) => usageTurnDayDates(turn, dayIndex || null),
      usageTurnCrossesMidnight: (turn, dayIndex) => usageTurnCrossesMidnight(turn, dayIndex || null),
      // 主机能力矩阵（P2 #3）
      hostCapabilitySummary: () => hostCapabilitySummary(),
      hostCapabilityStatusText: () => hostCapabilityStatusText(),
      hostCapabilityUnknownLabel: (methods) => hostCapabilityUnknownLabel(methods),
      hostCapabilityRecord: (method, outcome) => hostCapabilityRecord(method, outcome),
      hostCapabilityRecordExisting: (method, error) => hostCapabilityRecordExisting(method, error),
      hostProbeCapabilities: (client, options) => hostProbeCapabilities(client, options || {}),
      hostCapabilityMissingError: (error) => hostCapabilityMissingError(error),
      hostCapabilityReset: () => {
        state.hostCapabilities = { probedAt: 0, methods: {} };
        try {
          localStorage.removeItem?.(HOST_CAPABILITY_KEY);
        } catch {
          // best effort
        }
      },
      usageFactImportFile: () => usageFactImportFile(),
      usageFactMigrationDiff: (legacyTurns, before, after, migrated) => usageFactMigrationDiff(legacyTurns, before, after, migrated),
      usageFactFallbackEvict: (turns, budget, options) => usageFallbackEvict(turns, budget, options || {}),
      usageFactFallbackProtectedTurns: (turns, options) => usageFallbackProtectedTurns(turns, options || {}),
      usageFactPreserveLegacySnapshot: () => usageFactPreserveLegacySnapshot(),
      usageFactPruneLegacySnapshot: (options) => usageFactPruneLegacySnapshot(options || {}),
      usageFactRebuild: () => usageFactRebuild(),
      usageFactChecksum: (text) => usageFactChecksum(text),
      usageFactState: () => ({
        count: state.usageFacts.size,
        degraded: state.usageFactDegraded,
        degradedReason: state.usageFactDegradedReason,
        meta: state.usageFactMeta ? { ...state.usageFactMeta } : null,
        hostBackupStatus: state.usageHostBackupStatus,
        hostBackupError: state.usageHostBackupError,
        hostBackupAt: state.usageHostBackupAt,
        // 导出/导入/重建的一次性反馈：只驱动状态行，不参与统计口径。
        ledgerStatus: state.usageLedgerStatus,
        ledgerError: state.usageLedgerError,
        unhandledRejectionCount: state.unhandledRejectionCount,
        lastUnhandledRejection: state.lastUnhandledRejection,
        epochs: state.usageLiveEpochs,
        epochWarning: state.usageLiveEpochWarnings,
      }),
      usageFactReset: () => {
        state.usageFacts = new Map();
        state.usageFactMeta = null;
        state.usageFactLoaded = true;
        state.usageLiveTotals = new Map();
        state.usageLiveResponseIds = new Set();
        state.usageFactFallbackTurns = new Map();
        state.usageFactFallbackThreads = new Map();
        state.usageFactReconcile = { threads: new Map(), updatedAt: 0, rows: [] };
        state.usageLedgerStatus = "";
        state.usageLedgerError = "";
      },
      usageSyncCollectRows: (dirHandle, options) => usageSyncCollectRows(dirHandle, options || {}),
      usageSyncDecodeBytes: (bytes) => usageSyncDecodeBytes(bytes),
      usageSyncCollectRowsViaAppServer: (client, options) => usageSyncCollectRowsViaAppServer(client, options || {}),
      // 同步的真实入口是 runUsageSync → collect → applyCollected；
      // 「事实入库失败」的反馈只能从这一层验证。
      usageSyncApplyCollected: (collected, options) => usageSyncApplyCollected(collected, options || {}),
      usageSyncResolveCodexRoot: (client) => usageSyncResolveCodexRoot(client),
      usageSyncResolveClient: () => appServerSyncClient(),
      usageSyncResetClient: () => {
        state.usageSyncClient = null;
        state.usageSyncClientChannel = "";
      },
      usageSyncRootFromRolloutPath: (value) => usageSyncRootFromRolloutPath(value),
      usageSyncJoinPath: (dir, name) => usageSyncJoinPath(dir, name),
      usageSyncBase64ToBytes: (value) => usageSyncBase64ToBytes(value),
      usageAutoSyncTick: () => usageAutoSyncTick(),
      mergeProfileLedgerTurns,
      profileUsageRefreshRequests: () => state.profileUsageRefreshRequests,
      profileUnlockEnabled,
      profileSyntheticEnabled,
      profileDataOverrideEnabledFor,
      applyProfileDataOverride,
      isRealChatgptAccount,
      profileRealChatgptCached,
      refreshProfileRealChatgptCache,
      saveProfileUnlockEnabled,
      setProfileUnlockEnabled,
      installLocalFetchCapture,
      isProfileUsageUrl,
      isCodexApiUrl,
      hubVisible,
      saveHubVisible,
      outputRateVisible,
      saveOutputRateVisible,
      hasCodexProjectContextRow,
      syncHubVisibility,
      profileSettingsHtml,
      pricePopoverHtml,
      priceSaveDraftError,
      capturePriceDraft,
      savePriceFromEditor,
      settingsEditorRoot,
      priceDraftSnapshot: () => (state.priceDraft ? { ...state.priceDraft } : null),
      setPriceDraft: (draft) => {
        state.priceDraft = draft ? { ...draft } : null;
      },
      newPriceModelName,
      startNewPriceModel,
      restoreDefaultPrices,
      refreshDefaultPrices,
      priceCacheIdle: () => state.priceCacheWritePromise || Promise.resolve(),
      priceCacheFlush: () => priceCacheFlush(),
      priceCacheRestoreOverrides: (cached) => priceCacheRestoreOverrides(cached),
      priceUpstreamSnapshot,
      priceModelShownByDefault,
      priceListableUsedNames,
      priceSyncStatus,
      priceSyncDownloadCommand,
      trapSettingsFocus,
      deletePriceForModel,
      visiblePrices,
      priceListModels,
      priceListModelLabel,
      priceFor,
      priceModelKey,
      recentLedgerModel,
      cleanupAutoZeroPriceModels,
      emptyDailyUsageBucket,
      addTurnToDailyBucket,
      turnCost,
      localUsageExport,
      localLedgerMirrorTurn: (turn) => localLedgerMirrorTurn(turn),
      debugSessionState,
      compareUpdateVersions,
      updateParseVersion,
      updateDownloadCommand,
      updateCheckCommand,
      updateCommandPathJoin,
      updateSourceLooksValid,
      updateClusterHtml,
      handleUpdateClusterClick,
      checkForUpdateNow,
      runScriptUpdate,
      updateStateSnapshot: () => ({
        phase: state.updatePhase,
        busy: state.updateBusy,
        remoteVersion: state.updateRemoteVersion,
        errorKind: state.updateErrorKind,
        error: state.updateError,
      }),
      updateResetState: () => {
        state.updateBusy = false;
        state.updatePhase = "";
        state.updateRemoteVersion = "";
        state.updateErrorKind = "";
        state.updateError = "";
      },
      activeModelInfo,
      spoofProfileAccountPayload,
      spoofProfileAccountsCheckPayload,
      localProfileAccountsCheckResponse,
      spoofProfileAuthContextValue,
      profileUiAuthContextValue,
      profileUiComponentNamesFromSource,
      profileUiFunctionNameBefore,
      settingsSectionsCandidate,
      installOfficialProfileUnlock,
      uninstallOfficialProfileUnlock,
      setProfileSyntheticTestEnabled: (value) => {
        state.profileSyntheticTestEnabled = Boolean(value);
      },
      profileUnlockInstalledMode: () => state.profileUnlockInstalledMode,
      profileUnlockInstallCount: () => state.profileUnlockInstallCount,
      isProfileUiAuthRead,
      patchProfileReactAuthContext,
      installProfileUiReadinessCoordinator,
      profileSyntheticAuth: () => state.profileSyntheticAuth,
      profileAuthContextFromFiberNode,
      profileAuthContextFromDocument,
      isProfileQueryClient,
      rememberProfileQueryClient,
      profileQueryClientFromFiberNode,
      profileQueryClientFromDocument,
      chainProfileQueryRefresh,
      invalidateProfileQueryWithClient,
      profileUnlockedSettingsSections,
      profileUsernameAllowed,
      applyLocalProfilePatch,
      patchProfileRequestClient,
      patchProfilePhotoUploadClient,
      profileUsageQueryData,
      profilePageDataOverride,
      profileAccountInfoQueryData,
      syncProfileAccountInfoQueryCache,
      syncProfileUsageQueryCache,
      syncSidebarProfileIdentity,
      syncSidebarProfileMenuIdentity,
      restoreSidebarProfileMenuIdentity,
      codexAppAssetUrl,
      extractProfilePhotoDataUrl,
      optimizeProfileImageDataUrl,
      applyLocalProfilePhotoUpload,
      localProfileResponse,
      localProfilePageResponse,
      localProfilePinOptionsResponse,
      localProfilePagePatchResponse,
      localProfileAccount,
      isProfilePageUrl,
      isProfilePinOptionsUrl,
      isProfilePhotoUrl,
      isProfileAccountsCheckUrl,
      isProfileFetchMessage,
      installLocalMessageCapture,
      localMessageHandler: () => state.localMessageHandler,
    };
  }

  state.activeBridge = {
    profileSyntheticEnabled,
    profileDataOverrideEnabledFor,
    profileFetchBodyAsync,
    localProfileResponse,
    localProfilePageResponse,
    localProfilePinOptionsResponse,
    localProfilePagePatchResponse,
    applyLocalProfilePatch,
    applyLocalProfilePhotoUpload,
    spoofProfileAccountsCheckPayload,
    localProfileAccountsCheckResponse,
    profileUiAuthContextValue,
  };
  window.__codexLiveTokenCostActiveBridge = state.activeBridge;

  if ((profileSyntheticEnabled() || profileDataOverrideEnabledFor()) && state.profileQueryClient) safeInstallOfficialProfileUnlock();

  // Codex++ only hot-reloads in place when every loaded script registered a cleanup during
  // initialization; otherwise it reloads the whole page.
  try {
    if (codexPlusApiReady()) window.codexPlus?.onCleanup?.(destroy);
  } catch {
    // Older Codex++ builds without the extension API keep the page-reload behavior.
  }

  scheduleStart();
})();

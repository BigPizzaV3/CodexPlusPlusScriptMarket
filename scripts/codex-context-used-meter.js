(() => {
  // Codex++ 会把本文件注入 Codex 渲染页；所有读取都只能依赖页面里已经暴露的运行态信号。
  const INSTALL_KEY = "__codexContextMeterInstalled";
  const API_KEY = "__codexContextMeter";
  const STYLE_ID = "codex-context-meter-style";
  const ROOT_ID = "codex-context-meter";
  const HISTORY_PORTAL_ID = "codex-context-meter-history-portal";
  const CONFIG_KEY = "__codexContextMeterConfig";
  const UI_STATE_STORAGE_KEY = "__codexContextMeterUiState";
  const PROVIDER_SUMMARY_KEY = "__codexContextMeterProviderSummary";
  const PROVIDER_SUMMARY_EVENT = "codex-context-meter-provider-summary";
  const SCRIPT_VERSION = 101;
  const UPDATE_INTERVAL_MS = 5000;
  const SLOW_SCAN_INTERVAL_MS = UPDATE_INTERVAL_MS;
  const CONTEXT_USAGE_BACKGROUND_SAMPLE_INTERVAL_MS = UPDATE_INTERVAL_MS;
  const CONTEXT_USAGE_BACKGROUND_SAMPLE_MAX_CONVERSATIONS = 32;
  const SWITCH_RETRY_WINDOW_MS = 8000;
  const SWITCH_RETRY_INTERVAL_MS = 700;
  const NAVIGATION_PENDING_MS = 1500;
  const NAVIGATION_UPDATE_DELAY_MS = 30;
  const MUTATION_UPDATE_DELAY_MS = 500;
  const ACTIVE_CONVERSATION_LOOKUP_CACHE_MS = 250;
  const APP_SIGNAL_READING_CACHE_MS = 120;
  const APP_SIGNAL_IMPORT_GRACE_MS = 600;
  const INLINE_MOUNT_CACHE_MS = 5000;
  // 以下限额只约束兜底扫描；主路径读 app signal / 已缓存读数，不受这些值影响。
  const EXPENSIVE_FALLBACK_INTERVAL_MS = 2500;
  const REACT_HOST_SCAN_LIMIT = 180;
  const WINDOW_KEY_CACHE_MS = 10000;
  const SPEND_HISTORY_WINDOW_MS = 60 * 60 * 1000;
  const SPEND_HISTORY_MAX_ITEMS = 200;
  const SPEND_HISTORY_CHART_WIDTH = 244;
  const SPEND_HISTORY_CHART_HEIGHT = 72;
  const SPEND_HISTORY_CHART_PADDING = 8;
  const SPEND_HISTORY_CHART_AXIS_WIDTH = 52;
  const SPEND_EFFECT_DURATION_MS = 3000;
  const SPEND_EFFECT_FALLBACK_MS = 3200;
  const CONTEXT_SPEND_DEDUPE_WINDOW_MS = UPDATE_INTERVAL_MS * 2 + MUTATION_UPDATE_DELAY_MS;
  const CONTEXT_SPEND_DEDUPE_KEY = "__codexContextMeterContextSpendDedupe";
  const PROVIDER_SPEND_DEDUPE_WINDOW_MS = 1500;
  const PROVIDER_SPEND_DEDUPE_KEY = "__codexContextMeterProviderSpendDedupe";
  const HISTORY_PANEL_VIEWPORT_PADDING = 8;
  const HISTORY_PANEL_GAP = 8;
  const HISTORY_PANEL_MIN_WIDTH = 240;
  const HISTORY_PANEL_MIN_HEIGHT = 80;
  const HISTORY_PORTAL_THEME_VARIABLES = [
    "--ccm-card-value",
    "--ccm-panel-border",
    "--ccm-panel-bg",
    "--ccm-panel-text",
    "--ccm-panel-shadow",
    "--ccm-muted-strong",
    "--ccm-muted",
    "--ccm-muted-soft",
    "--ccm-axis-line",
    "--ccm-gridline",
  ];
  const FLOAT_DRAG_HOLD_MS = 260;
  const FLOAT_SCALE_MIN = 0.7;
  const FLOAT_SCALE_MAX = 1.8;
  const FLOAT_SCALE_STEP = 0.08;
  const DEFAULT_FLOATING_UI = {
    mode: "inline",
    floatingLayout: "horizontal",
    theme: "dark",
    x: 16,
    y: 10,
    scale: 1,
  };
  const DEFAULT_UI_CONFIG = {
    context: {
      showUsedInsteadOfLeft: false,
      compressionWarningLeftPercent: 20,
      levelThresholds: {
        criticalLeftPercent: 30,
        dangerLeftPercent: 40,
        warnLeftPercent: 50,
        noticeLeftPercent: 60,
      },
    },
    provider: {
      levelThresholds: {
        criticalLeftPercent: 30,
        dangerLeftPercent: 40,
        warnLeftPercent: 50,
        noticeLeftPercent: 60,
      },
    },
  };
  const CODEX_COMPOSER_SELECTOR = `[data-codex-composer="true"]`;
  const THREAD_COMPOSER_SELECTOR = `[data-thread-find-composer="true"]`;
  const CODEX_INTELLIGENCE_TRIGGER_SELECTOR = `[data-codex-intelligence-trigger="true"]`;
  const REACT_CONVERSATION_SCAN_DEPTH = 14;
  const APP_SIGNAL_SELECTOR_SCAN_INTERVAL_MS = 2000;
  const APP_SIGNAL_SELECTOR_SCAN_LIMIT = 360;
  const THREAD_CONTENT_SELECTOR = [
    `[data-thread-find-target="conversation"]`,
    THREAD_COMPOSER_SELECTOR,
    '[data-app-shell-main-content-layout*="thread"]',
  ].join(",");
  const REACT_STATE_HOST_SELECTOR = [
    "[data-app-action-sidebar-thread-id]",
    THREAD_COMPOSER_SELECTOR,
    CODEX_COMPOSER_SELECTOR,
    `[data-thread-find-target="conversation"]`,
    "[data-message-author-role]",
    "main",
    "article",
  ].join(",");
  const CONVERSATION_CONTENT_SELECTOR = [
    `[data-thread-find-target]`,
    `[data-message-author-role]`,
    `article`,
  ].join(",");
  const INVALID_INLINE_MOUNT_SELECTOR = [
    "button",
    "[role='button']",
    "[aria-haspopup]",
    "[data-codex-intelligence-trigger]",
  ].join(",");
  const MESSAGE_MUTATION_SELECTOR = [
    `[data-thread-find-target]`,
    `[data-message-author-role]`,
    `article`,
  ].join(",");
  const PREFERRED_STATUS_KEYS = [
    "contextUsage",
    "context_usage",
    "tokenUsage",
    "token_usage",
    "usage",
    "data",
    "props",
    "memoizedState",
    "memoizedProps",
    "pendingProps",
    "updateQueue",
    "dependencies",
    "alternate",
    "return",
    "child",
    "sibling",
    "stateNode",
    "current",
    "value",
    "store",
    "atom",
    "atoms",
    "map",
    "cache",
  ];
  const PREFERRED_STATUS_KEY_SET = new Set(PREFERRED_STATUS_KEYS);
  const STATUS_TREE_KEY_RE = /context|usage|status|thread|conversation|token|query|data|props|memoized|pending|return|child|sibling|state|value|current|store|atom|map|cache/i;
  const APP_SIGNAL_SCOPE_KEY_RE = /memoized|pending|dependencies|firstContext|context|value|current|return|child|sibling|state|store|node|chain|scope|provider|props|query|cache/i;
  const CONVERSATION_REACT_KEY_RE = /^(?:props|children|memoizedProps|pendingProps|memoizedState|stateNode|child|sibling|return|alternate|value|current|context|node|chain|conversationId|localConversationId|threadId|id|key|params|thread|conversation)$/;
  const REACT_PRIVATE_KEY_RE = /^__react(?:Props|Fiber|Container)\$/;
  const CONVERSATION_ID_KEYS = [
    "conversationId",
    "localConversationId",
    "threadId",
    "id",
    "key",
  ];
  const CONVERSATION_ID_KEY_SET = new Set(CONVERSATION_ID_KEYS);

  for (const key of Object.keys(window)) {
    if (!/CodexContextUsageMeter(?:Installed)?$/.test(key)) continue;

    const legacyApi = window[key];
    if (legacyApi && typeof legacyApi.destroy === "function") {
      legacyApi.destroy();
    }
    delete window[key];
  }

  const legacyRootId = ["codex", "context", "usage", "meter"].join("-");
  document.getElementById(legacyRootId)?.remove();
  document.getElementById(`${legacyRootId}-style`)?.remove();

  if (window[INSTALL_KEY]) {
    const api = window[API_KEY];
    if (api && api.version !== SCRIPT_VERSION && typeof api.destroy === "function") {
      api.destroy();
    } else {
      if (api && typeof api.refresh === "function") {
        api.refresh();
      }
      return;
    }
  }

  window[INSTALL_KEY] = true;

  const state = {
    activeConversationId: null,
    lastReading: null,
    readingsByConversationId: new Map(),
    lastAnimatedUsedByConversationId: new Map(),
    lastAnimatedProviderUsedById: new Map(),
    root: null,
    contextCard: null,
    providerCard: null,
    historyPanel: null,
    historyPortal: null,
    value: null,
    fill: null,
    compressionZone: null,
    contextRing: null,
    providerValue: null,
    providerFill: null,
    providerRing: null,
    providerSummary: null,
    inlineHost: null,
    inlineBefore: null,
    inlineMountCache: null,
    inlineMountPending: false,
    inlineMountLookupAt: 0,
    uiState: DEFAULT_FLOATING_UI,
    contextMenu: null,
    contextMenuCloseListener: null,
    floatingPointerCleanup: null,
    floatingDrag: null,
    spendHistory: {
      context: [],
      provider: [],
    },
    spendEffectQueue: [],
    spendEffectActive: null,
    spendEffectTimer: 0,
    contextSessionTotalsByConversationId: new Map(),
    providerSessionTotalsByConversationId: new Map(),
    historyCloseTimer: 0,
    historyHoverCleanup: null,
    uiConfig: DEFAULT_UI_CONFIG,
    providerSummaryListener: null,
    lastScanAt: 0,
    lastScannedConversationId: null,
    contextUsageBackgroundSampleAt: 0,
    contextUsageBackgroundSampleConversationIds: [],
    navigationPendingUntil: 0,
    switchRetryUntil: 0,
    retryTimer: 0,
    timer: 0,
    observer: null,
    navigationListener: null,
    pendingUpdate: 0,
    pendingUpdateDueAt: 0,
    cachedActiveConversationId: null,
    activeConversationIdLookupAt: 0,
    appSignalScope: null,
    appSignalModules: null,
    appSignalModulesPromise: null,
    appSignalLastLookupAt: 0,
    appSignalCachedReading: null,
    appSignalCachedConversationId: null,
    appSignalCachedAt: 0,
    appSignalLastSuccessAt: 0,
    appSignalModulesRequestedAt: 0,
    appSignalTokenUsageSelector: null,
    appSignalTokenUsageSelectorExport: null,
    appSignalTokenUsageSelectorLookupAt: 0,
    waitingForAppSignalModules: false,
    expensiveFallbackScannedAt: 0,
    expensiveFallbackConversationId: null,
    windowUsageKeys: null,
    windowUsageKeysAt: 0,
    reactPrivateKeyCache: new WeakMap(),
    scanGeneration: 0,
    filteredReflectKeyCache: new WeakMap(),
    appSignalSkipGeneration: new WeakMap(),
    threadContentLookupAt: 0,
    threadContentLookupResult: false,
  };

  function installStyle() {
    const existingStyle = document.getElementById(STYLE_ID);
    if (existingStyle && existingStyle.dataset.version === String(SCRIPT_VERSION)) return;
    existingStyle?.remove();

    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.dataset.version = String(SCRIPT_VERSION);
    style.textContent = `
      #${ROOT_ID} {
        --ccm-card-border: rgba(255, 255, 255, 0.16);
        --ccm-card-bg: rgba(20, 22, 28, 0.78);
        --ccm-card-bg-strong: rgba(20, 22, 28, 0.88);
        --ccm-card-text: rgba(255, 255, 255, 0.92);
        --ccm-card-value: rgba(255, 255, 255, 0.98);
        --ccm-card-shadow: 0 5px 18px rgba(0, 0, 0, 0.18);
        --ccm-card-shadow-strong: 0 8px 28px rgba(0, 0, 0, 0.24);
        --ccm-ring-rest: rgba(255, 255, 255, 0.18);
        --ccm-ring-core: rgba(20, 22, 28, 0.96);
        --ccm-track-bg: rgba(255, 255, 255, 0.16);
        --ccm-panel-border: rgba(255, 255, 255, 0.14);
        --ccm-panel-bg: rgba(16, 18, 24, 0.94);
        --ccm-panel-text: rgba(255, 255, 255, 0.9);
        --ccm-panel-shadow: 0 10px 30px rgba(0, 0, 0, 0.28);
        --ccm-muted-strong: rgba(255, 255, 255, 0.72);
        --ccm-muted: rgba(255, 255, 255, 0.48);
        --ccm-muted-soft: rgba(255, 255, 255, 0.46);
        --ccm-axis-line: rgba(255, 255, 255, 0.16);
        --ccm-gridline: rgba(255, 255, 255, 0.1);
        --ccm-fill-normal: #22c55e;
        --ccm-fill-normal-start: #2563eb;
        --ccm-fill-normal-end: #22c55e;
        --ccm-fill-notice: #0ea5e9;
        --ccm-fill-notice-start: #06b6d4;
        --ccm-fill-notice-end: #0ea5e9;
        --ccm-fill-warn: #ea580c;
        --ccm-fill-warn-start: #d97706;
        --ccm-fill-warn-end: #ea580c;
        --ccm-fill-danger: #dc2626;
        --ccm-fill-danger-start: #e11d48;
        --ccm-fill-danger-end: #dc2626;
        --ccm-fill-critical: #b91c1c;
        --ccm-fill-critical-start: #be123c;
        --ccm-fill-critical-end: #b91c1c;
        --ccm-ring-size: 22px;
        --ccm-ring-width: 3px;
        --ccm-inline-max-width: 210px;
        position: fixed;
        top: var(--ccm-float-y, 10px);
        left: var(--ccm-float-x, 16px);
        transform: scale(var(--ccm-float-scale, 1));
        transform-origin: top left;
        z-index: 2147483647;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        min-height: var(--ccm-ring-size);
        max-width: calc(100vw - 32px);
        overflow: visible;
        pointer-events: auto;
        user-select: none;
        /* Codex/Electron 顶部可能是窗口拖拽区；不退出拖拽区时，真实鼠标 hover 会被系统层吞掉。 */
        -webkit-app-region: no-drag;
      }

      #${ROOT_ID}[data-theme="light"] {
        --ccm-card-border: rgba(15, 23, 42, 0.14);
        --ccm-card-bg: rgba(248, 250, 252, 0.9);
        --ccm-card-bg-strong: rgba(248, 250, 252, 0.96);
        --ccm-card-text: rgba(15, 23, 42, 0.86);
        --ccm-card-value: rgba(15, 23, 42, 0.96);
        --ccm-card-shadow: 0 5px 18px rgba(15, 23, 42, 0.14);
        --ccm-card-shadow-strong: 0 8px 28px rgba(15, 23, 42, 0.18);
        --ccm-ring-rest: rgba(15, 23, 42, 0.24);
        --ccm-ring-core: rgba(248, 250, 252, 0.96);
        --ccm-track-bg: rgba(15, 23, 42, 0.2);
        --ccm-panel-border: rgba(15, 23, 42, 0.12);
        --ccm-panel-bg: rgba(255, 255, 255, 0.96);
        --ccm-panel-text: rgba(15, 23, 42, 0.88);
        --ccm-panel-shadow: 0 10px 30px rgba(15, 23, 42, 0.16);
        --ccm-muted-strong: rgba(51, 65, 85, 0.72);
        --ccm-muted: rgba(71, 85, 105, 0.58);
        --ccm-muted-soft: rgba(71, 85, 105, 0.54);
        --ccm-axis-line: rgba(15, 23, 42, 0.16);
        --ccm-gridline: rgba(15, 23, 42, 0.1);
      }

      #${ROOT_ID}[data-placement="inline"] {
        position: relative;
        inset: auto;
        z-index: auto;
        transform: none;
        flex: 0 0 auto;
        align-self: center;
        max-width: min(42vw, 360px);
        margin-right: 8px;
        justify-content: flex-start;
      }

      #${ROOT_ID}[data-placement="inline"] .ccm-card {
        width: var(--ccm-ring-size);
        max-width: var(--ccm-ring-size);
        padding: 0;
        border: 0;
        background: transparent;
        box-shadow: none;
        backdrop-filter: none;
      }

      #${ROOT_ID}[data-placement="inline"] .ccm-row {
        gap: 0;
      }

      #${ROOT_ID}[data-placement="inline"] .ccm-value,
      #${ROOT_ID}[data-placement="inline"] .ccm-provider-value {
        display: none !important;
      }

      #${ROOT_ID}[data-placement="floating"] {
        cursor: default;
      }

      #${ROOT_ID}[data-placement="floating"][data-floating-layout="vertical"] {
        flex-direction: column;
        align-items: stretch;
      }

      #${ROOT_ID}[data-dragging="true"] {
        cursor: grabbing;
      }

      #${ROOT_ID}[hidden] {
        display: none !important;
      }

      #${HISTORY_PORTAL_ID} {
        position: fixed;
        inset: 0;
        z-index: 2147483647;
        pointer-events: none;
      }

      #${HISTORY_PORTAL_ID}[hidden] {
        display: none !important;
      }

      #${ROOT_ID} .ccm-card {
        position: relative;
        box-sizing: border-box;
        flex: 0 1 auto;
        width: auto;
        min-width: 0;
        max-width: var(--ccm-inline-max-width);
        padding: 5px 8px;
        border: 1px solid var(--ccm-card-border);
        border-radius: 999px;
        background: var(--ccm-card-bg);
        color: var(--ccm-card-text);
        box-shadow: var(--ccm-card-shadow);
        font: 12px/1.35 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        overflow: visible;
        backdrop-filter: blur(10px);
        pointer-events: auto;
        -webkit-app-region: no-drag;
      }

      #${ROOT_ID}[data-placement="floating"] .ccm-card {
        max-width: 240px;
        padding: 8px 10px 9px;
        border-radius: 8px;
        background: var(--ccm-card-bg-strong);
        box-shadow: var(--ccm-card-shadow-strong);
      }

      #${ROOT_ID}[data-placement="floating"] .ccm-row {
        justify-content: center;
        margin-bottom: 6px;
      }

      #${ROOT_ID}[data-placement="floating"] .ccm-ring {
        display: none;
      }

      #${ROOT_ID}[data-placement="floating"] .ccm-track {
        display: block;
      }

      #${ROOT_ID} .ccm-card[hidden] {
        display: none !important;
      }

      #${ROOT_ID} .ccm-row {
        display: flex;
        align-items: center;
        justify-content: flex-start;
        gap: 7px;
        min-width: 0;
        margin-bottom: 0;
        white-space: nowrap;
      }

      #${ROOT_ID} .ccm-ring {
        position: relative;
        flex: 0 0 var(--ccm-ring-size);
        width: var(--ccm-ring-size);
        height: var(--ccm-ring-size);
        border-radius: 50%;
        background:
          conic-gradient(var(--ccm-fill-color, var(--ccm-fill-normal)) 0deg, var(--ccm-fill-color, var(--ccm-fill-normal)) var(--ccm-ring-angle, 0deg), var(--ccm-ring-rest) var(--ccm-ring-angle, 0deg) 360deg);
        filter: drop-shadow(0 1px 1px rgba(15, 23, 42, 0.16));
      }

      #${ROOT_ID} .ccm-ring::after {
        content: "";
        position: absolute;
        inset: var(--ccm-ring-width);
        border-radius: 50%;
        background: var(--ccm-ring-core);
      }

      #${ROOT_ID} .ccm-value {
        color: var(--ccm-card-value);
        font-weight: 650;
        font-variant-numeric: tabular-nums;
        overflow: hidden;
        text-align: left;
        text-overflow: ellipsis;
      }

      #${ROOT_ID} .ccm-track {
        display: none;
        position: relative;
        width: 100%;
        height: 7px;
        overflow: hidden;
        border-radius: 999px;
        background: var(--ccm-track-bg);
      }

      #${ROOT_ID} .ccm-fill {
        --ccm-fill-color: var(--ccm-fill-normal);
        --ccm-fill-gradient: linear-gradient(90deg, var(--ccm-fill-normal-start), var(--ccm-fill-normal-end));
        width: 0%;
        height: 100%;
        border-radius: inherit;
        background: var(--ccm-fill-gradient);
        transition: width 180ms ease, background 180ms ease;
      }

      #${ROOT_ID} .ccm-compression-zone {
        position: absolute;
        inset: 0 auto 0 0;
        z-index: 1;
        width: 0%;
        border-radius: inherit;
        background:
          linear-gradient(90deg, rgba(255, 196, 0, 0.2), rgba(255, 126, 34, 0.12)),
          repeating-linear-gradient(
            -45deg,
            rgba(253, 224, 71, 0.72) 0,
            rgba(253, 224, 71, 0.72) 4px,
            rgba(251, 146, 60, 0.64) 4px,
            rgba(251, 146, 60, 0.64) 8px
          );
        box-shadow:
          inset 0 0 0 1px rgba(251, 191, 36, 0.38),
          inset 0 0 7px rgba(251, 146, 60, 0.18);
        opacity: 0.82;
        pointer-events: none;
        transition: width 180ms ease, opacity 180ms ease;
      }

      #${ROOT_ID} .ccm-provider-value {
        color: var(--ccm-card-value);
        font-weight: 650;
        font-variant-numeric: tabular-nums;
        overflow: hidden;
        text-align: left;
        text-overflow: ellipsis;
      }

      #${ROOT_ID} .ccm-context-card[data-level="warn"] .ccm-fill,
      #${ROOT_ID} .ccm-context-card[data-level="warn"] .ccm-ring,
      #${ROOT_ID} .ccm-provider-card[data-level="warn"] .ccm-ring,
      #${ROOT_ID} .ccm-provider-card[data-level="warn"] .ccm-fill {
        --ccm-fill-color: var(--ccm-fill-warn);
        --ccm-fill-gradient: linear-gradient(90deg, var(--ccm-fill-warn-start), var(--ccm-fill-warn-end));
      }

      #${ROOT_ID} .ccm-context-card[data-level="danger"] .ccm-fill,
      #${ROOT_ID} .ccm-context-card[data-level="danger"] .ccm-ring,
      #${ROOT_ID} .ccm-provider-card[data-level="danger"] .ccm-ring,
      #${ROOT_ID} .ccm-provider-card[data-level="danger"] .ccm-fill {
        --ccm-fill-color: var(--ccm-fill-danger);
        --ccm-fill-gradient: linear-gradient(90deg, var(--ccm-fill-danger-start), var(--ccm-fill-danger-end));
      }

      #${ROOT_ID} .ccm-context-card[data-level="notice"] .ccm-fill,
      #${ROOT_ID} .ccm-context-card[data-level="notice"] .ccm-ring,
      #${ROOT_ID} .ccm-provider-card[data-level="notice"] .ccm-ring,
      #${ROOT_ID} .ccm-provider-card[data-level="notice"] .ccm-fill {
        --ccm-fill-color: var(--ccm-fill-notice);
        --ccm-fill-gradient: linear-gradient(90deg, var(--ccm-fill-notice-start), var(--ccm-fill-notice-end));
      }

      #${ROOT_ID} .ccm-context-card[data-level="critical"] .ccm-fill,
      #${ROOT_ID} .ccm-context-card[data-level="critical"] .ccm-ring,
      #${ROOT_ID} .ccm-provider-card[data-level="critical"] .ccm-ring,
      #${ROOT_ID} .ccm-provider-card[data-level="critical"] .ccm-fill {
        --ccm-fill-color: var(--ccm-fill-critical);
        --ccm-fill-gradient: linear-gradient(90deg, var(--ccm-fill-critical-start), var(--ccm-fill-critical-end));
      }

      #${ROOT_ID} .ccm-context-card[data-compression-warning="true"] .ccm-compression-zone {
        opacity: 1;
      }

      #${ROOT_ID} .ccm-context-card[data-show-used-instead-of-left="true"] .ccm-compression-zone {
        left: auto;
        right: 0;
      }

      #${HISTORY_PORTAL_ID} .ccm-history-panel {
        position: absolute;
        top: calc(100% + 8px);
        left: 0;
        right: auto;
        z-index: 1;
        box-sizing: border-box;
        width: max-content;
        min-width: 240px;
        max-width: min(560px, var(--ccm-history-max-width, calc(100vw - 32px)));
        max-height: var(--ccm-history-max-height, calc(100vh - 16px));
        overflow: hidden;
        padding: 9px 10px 10px;
        border: 1px solid var(--ccm-panel-border);
        border-radius: 8px;
        background: var(--ccm-panel-bg);
        color: var(--ccm-panel-text);
        box-shadow: var(--ccm-panel-shadow);
        font: 12px/1.35 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        opacity: 0;
        transform: translateY(-4px);
        pointer-events: none;
        visibility: hidden;
        backdrop-filter: blur(12px);
        -webkit-app-region: no-drag;
        transition: opacity 140ms ease, transform 140ms ease, visibility 140ms ease;
      }

      #${HISTORY_PORTAL_ID} .ccm-history-panel {
        position: fixed;
        top: var(--ccm-history-top, 0px);
        left: var(--ccm-history-left, 0px);
        right: auto;
        z-index: 2147483647;
      }

      #${HISTORY_PORTAL_ID} .ccm-history-panel::before {
        content: "";
        position: absolute;
        left: 0;
        right: 0;
        top: -8px;
        height: 8px;
        pointer-events: auto;
      }

      #${HISTORY_PORTAL_ID}[data-history-open="true"] .ccm-history-panel {
        opacity: 1;
        transform: translateY(0);
        pointer-events: auto;
        visibility: visible;
      }

      #${HISTORY_PORTAL_ID} .ccm-history-grid {
        display: grid;
        grid-template-columns: minmax(0, 260px) minmax(0, 260px);
        gap: 12px;
      }

      #${HISTORY_PORTAL_ID} .ccm-history-grid[data-provider-visible="false"] {
        grid-template-columns: minmax(0, 292px);
      }

      #${HISTORY_PORTAL_ID} .ccm-history-section {
        min-width: 0;
        --ccm-history-accent: #38bdf8;
        --ccm-history-fill: rgba(56, 189, 248, 0.12);
      }

      #${HISTORY_PORTAL_ID} .ccm-history-section[data-history-kind="provider"] {
        --ccm-history-accent: #f97316;
        --ccm-history-fill: rgba(249, 115, 22, 0.12);
      }

      #${HISTORY_PORTAL_ID} .ccm-history-section[hidden] {
        display: none !important;
      }

      #${HISTORY_PORTAL_ID} .ccm-history-head {
        display: flex;
        align-items: baseline;
        justify-content: space-between;
        gap: 8px;
        margin-bottom: 6px;
        white-space: nowrap;
      }

      #${HISTORY_PORTAL_ID} .ccm-history-title {
        color: var(--ccm-card-value);
        font-weight: 700;
      }

      #${HISTORY_PORTAL_ID} .ccm-history-total {
        color: var(--ccm-muted-strong);
        font-variant-numeric: tabular-nums;
      }

      #${HISTORY_PORTAL_ID} .ccm-history-chart {
        position: relative;
        width: 100%;
        min-height: 78px;
      }

      #${HISTORY_PORTAL_ID} .ccm-history-svg {
        display: block;
        width: 100%;
        height: 78px;
        overflow: visible;
      }

      #${HISTORY_PORTAL_ID} .ccm-history-axis-line {
        fill: none;
        stroke: var(--ccm-axis-line);
        stroke-width: 1;
        vector-effect: non-scaling-stroke;
      }

      #${HISTORY_PORTAL_ID} .ccm-history-axis-label {
        fill: var(--ccm-muted-soft);
        font-size: 10px;
        font-variant-numeric: tabular-nums;
      }

      #${HISTORY_PORTAL_ID} .ccm-history-gridline {
        fill: none;
        stroke: var(--ccm-gridline);
        stroke-dasharray: 2 4;
        stroke-width: 1;
      }

      #${HISTORY_PORTAL_ID} .ccm-history-area {
        fill: var(--ccm-history-fill);
      }

      #${HISTORY_PORTAL_ID} .ccm-history-line {
        fill: none;
        stroke: var(--ccm-history-accent);
        stroke-linecap: round;
        stroke-linejoin: round;
        stroke-width: 2.2;
        vector-effect: non-scaling-stroke;
      }

      #${HISTORY_PORTAL_ID} .ccm-history-point {
        fill: #fff7ed;
        stroke: var(--ccm-history-accent);
        stroke-width: 1.5;
      }

      #${HISTORY_PORTAL_ID} .ccm-history-hit {
        fill: transparent;
        pointer-events: all;
      }

      #${HISTORY_PORTAL_ID} .ccm-history-caption {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        margin-top: 2px;
        color: var(--ccm-muted);
        font-size: 11px;
        font-variant-numeric: tabular-nums;
        white-space: nowrap;
      }

      #${HISTORY_PORTAL_ID} .ccm-history-empty {
        position: absolute;
        inset: 19px 0 auto 0;
        color: var(--ccm-muted-soft);
      }

      .ccm-context-menu {
        --ccm-menu-border: rgba(255, 255, 255, 0.14);
        --ccm-menu-bg: rgba(18, 20, 26, 0.96);
        --ccm-menu-text: rgba(255, 255, 255, 0.92);
        --ccm-menu-shadow: 0 12px 32px rgba(0, 0, 0, 0.36);
        --ccm-menu-hover: rgba(255, 255, 255, 0.1);
        --ccm-menu-checked: rgba(255, 255, 255, 0.08);
        --ccm-menu-separator: rgba(255, 255, 255, 0.12);
        --ccm-menu-check: #86efac;
        --ccm-menu-hint: rgba(255, 255, 255, 0.48);
        position: fixed;
        z-index: 2147483647;
        min-width: 150px;
        padding: 5px;
        border: 1px solid var(--ccm-menu-border);
        border-radius: 8px;
        background: var(--ccm-menu-bg);
        color: var(--ccm-menu-text);
        box-shadow: var(--ccm-menu-shadow);
        font: 12px/1.35 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        backdrop-filter: blur(12px);
        -webkit-app-region: no-drag;
      }

      .ccm-context-menu[data-theme="light"] {
        --ccm-menu-border: rgba(15, 23, 42, 0.12);
        --ccm-menu-bg: rgba(255, 255, 255, 0.98);
        --ccm-menu-text: rgba(15, 23, 42, 0.9);
        --ccm-menu-shadow: 0 12px 32px rgba(15, 23, 42, 0.18);
        --ccm-menu-hover: rgba(15, 23, 42, 0.08);
        --ccm-menu-checked: rgba(15, 23, 42, 0.07);
        --ccm-menu-separator: rgba(15, 23, 42, 0.12);
        --ccm-menu-check: #16a34a;
        --ccm-menu-hint: rgba(71, 85, 105, 0.58);
      }

      .ccm-context-menu button {
        display: flex;
        align-items: center;
        gap: 7px;
        box-sizing: border-box;
        width: 100%;
        padding: 6px 8px;
        border: 0;
        border-radius: 6px;
        background: transparent;
        color: inherit;
        font: inherit;
        text-align: left;
        cursor: pointer;
      }

      .ccm-context-menu button:hover {
        background: var(--ccm-menu-hover);
      }

      .ccm-context-menu button[aria-checked="true"] {
        background: var(--ccm-menu-checked);
      }

      .ccm-context-menu .ccm-menu-separator {
        height: 1px;
        margin: 5px 4px;
        background: var(--ccm-menu-separator);
      }

      .ccm-context-menu .ccm-menu-check {
        flex: 0 0 14px;
        width: 14px;
        color: var(--ccm-menu-check);
        font-weight: 800;
        text-align: center;
      }

      .ccm-context-menu .ccm-menu-hint {
        padding: 5px 8px 6px 21px;
        color: var(--ccm-menu-hint);
        font-size: 11px;
        line-height: 1.3;
        white-space: nowrap;
      }

      #${ROOT_ID} .ccm-hit-pop {
        position: absolute;
        left: 0;
        right: auto;
        top: 50%;
        z-index: 1;
        color: #fff7ed;
        background: linear-gradient(92deg, #fff7ed 0%, #fecdd3 38%, #fb7185 68%, #f97316 100%);
        -webkit-background-clip: text;
        background-clip: text;
        -webkit-text-fill-color: transparent;
        font-size: 14px;
        font-weight: 850;
        line-height: 1;
        opacity: 0;
        filter: drop-shadow(0 1px 0 rgba(0, 0, 0, 0.78))
          drop-shadow(0 3px 8px rgba(0, 0, 0, 0.58))
          drop-shadow(0 0 14px rgba(251, 113, 133, 0.56))
          drop-shadow(0 0 26px rgba(249, 115, 22, 0.24));
        text-shadow: 0 0 1px rgba(255, 255, 255, 0.45);
        transform: translate(-108%, -50%) scale(0.72);
        transform-origin: center center;
        animation: ccm-hit-pop ${SPEND_EFFECT_DURATION_MS}ms cubic-bezier(0.16, 0.84, 0.24, 1) forwards;
        pointer-events: none;
        white-space: nowrap;
        will-change: opacity, transform, filter;
      }

      @keyframes ccm-hit-pop {
        0% {
          opacity: 0;
          transform: translate(-108%, -50%) scale(0.72);
        }
        12% {
          opacity: 1;
          transform: translate(-114%, -51%) scale(1);
        }
        72% {
          opacity: 1;
          transform: translate(-146%, -54%) scale(1.22);
        }
        100% {
          opacity: 0;
          transform: translate(-160%, -55%) scale(1.34);
        }
      }

      @media (max-width: 720px) {
        #${ROOT_ID}[data-placement="inline"] {
          max-width: 72px;
        }

        #${ROOT_ID}[data-placement="inline"] .ccm-value,
        #${ROOT_ID}[data-placement="inline"] .ccm-provider-value {
          display: none;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function bindRootElements(root) {
    if (!root) return;

    state.root = root;
    state.contextCard = root.querySelector(".ccm-context-card");
    state.providerCard = root.querySelector(".ccm-provider-card");
    state.historyPortal = document.getElementById(HISTORY_PORTAL_ID);
    state.historyPanel = state.historyPortal?.querySelector(".ccm-history-panel") || null;
    state.value = root.querySelector(".ccm-value");
    state.fill = root.querySelector(".ccm-fill");
    state.compressionZone = root.querySelector(".ccm-compression-zone");
    state.contextRing = root.querySelector(".ccm-context-card .ccm-ring");
    state.providerValue = root.querySelector(".ccm-provider-value");
    state.providerFill = root.querySelector(".ccm-provider-fill");
    state.providerRing = root.querySelector(".ccm-provider-card .ccm-ring");
  }

  function isRootBound(root) {
    return !!(
      root &&
      state.root === root &&
      state.contextCard &&
      state.value &&
      state.fill &&
      state.compressionZone &&
      state.contextRing &&
      state.providerCard &&
      state.providerValue &&
      state.providerFill &&
      state.providerRing &&
      state.historyPortal &&
      state.historyPanel
    );
  }

  function historyPanelMarkup() {
    return `
      <div class="ccm-history-panel" aria-hidden="true">
        <div class="ccm-history-grid">
          <div class="ccm-history-section" data-history-kind="context">
            <div class="ccm-history-head">
              <span class="ccm-history-title">Context / Session</span>
              <span class="ccm-history-total">--</span>
            </div>
            <div class="ccm-history-chart"></div>
          </div>
          <div class="ccm-history-section" data-history-kind="provider">
            <div class="ccm-history-head">
              <span class="ccm-history-title">Provider / Session</span>
              <span class="ccm-history-total">--</span>
            </div>
            <div class="ccm-history-chart"></div>
          </div>
        </div>
      </div>
    `;
  }

  function syncHistoryPortalTheme(root) {
    const portal = state.historyPortal || document.getElementById(HISTORY_PORTAL_ID);
    if (!root || !portal) return;

    portal.dataset.theme = root.dataset.theme === "light" ? "light" : "dark";
    const computed = getComputedStyle(root);
    for (const name of HISTORY_PORTAL_THEME_VARIABLES) {
      const value = computed.getPropertyValue(name);
      if (value) portal.style.setProperty(name, value.trim());
    }
  }

  function ensureHistoryPortal(root) {
    let portal = state.historyPortal && state.historyPortal.isConnected
      ? state.historyPortal
      : document.getElementById(HISTORY_PORTAL_ID);
    if (!portal) {
      portal = document.createElement("div");
      portal.id = HISTORY_PORTAL_ID;
      portal.dataset.historyOpen = "false";
      document.body.appendChild(portal);
    } else if (portal.parentNode !== document.body) {
      document.body.appendChild(portal);
    }

    if (portal.dataset.infrastructureVersion !== String(SCRIPT_VERSION)) {
      portal.innerHTML = historyPanelMarkup();
      portal.dataset.infrastructureVersion = String(SCRIPT_VERSION);
    }

    state.historyPortal = portal;
    state.historyPanel = portal.querySelector(".ccm-history-panel");
    if (root && portal.dataset.historyOpen !== root.dataset.historyOpen) {
      portal.dataset.historyOpen = root.dataset.historyOpen === "true" ? "true" : "false";
    }
    if (state.historyPanel) {
      state.historyPanel.setAttribute(
        "aria-hidden",
        portal.dataset.historyOpen === "true" ? "false" : "true",
      );
    }
    syncHistoryPortalTheme(root);
    return portal;
  }

  function ensureRootInfrastructure(root) {
    ensureHistoryPortal(root);
    if (root.dataset.infrastructureVersion !== String(SCRIPT_VERSION)) {
      root.querySelector(".ccm-hover-zone")?.remove();
      root.querySelector(".ccm-history-panel")?.remove();
      const contextTrack = root.querySelector(".ccm-context-card .ccm-track");
      if (contextTrack && !contextTrack.querySelector(".ccm-compression-zone")) {
        contextTrack.insertBefore(document.createElement("div"), contextTrack.firstChild);
        contextTrack.firstElementChild.className = "ccm-compression-zone";
      }
      root.dataset.infrastructureVersion = String(SCRIPT_VERSION);
    }
    if (!isRootBound(root)) bindRootElements(root);
    installHistoryHover(root);
    installContextMenu(root);
    installFloatingControls(root);
  }

  function isInlineMountCurrent(root) {
    const uiState = state.uiState || readUiState();
    if (uiState.mode === "floating") return root.parentNode === document.body && root.dataset.placement === "floating";
    if (root.dataset.placement !== "inline") return false;
    if (!state.inlineHost || !state.inlineHost.isConnected || root.parentNode !== state.inlineHost) return false;
    if (state.inlineHost.closest(INVALID_INLINE_MOUNT_SELECTOR)) return false;
    return state.inlineBefore ? state.inlineBefore.isConnected && root.nextSibling === state.inlineBefore : true;
  }

  function ensureRoot() {
    let root = state.root && state.root.isConnected ? state.root : document.getElementById(ROOT_ID);
    if (root) {
      ensureRootInfrastructure(root);
      state.uiState = readUiState();
      if (!isInlineMountCurrent(root)) mountRoot(root);
      return root;
    }

    root = document.createElement("div");
    root.id = ROOT_ID;
    root.innerHTML = `
      <div class="ccm-card ccm-context-card" data-known="false" data-level="normal" hidden>
        <div class="ccm-row">
          <span class="ccm-ring" aria-hidden="true"></span>
          <span class="ccm-value">Context Left --</span>
        </div>
        <div class="ccm-track">
          <div class="ccm-compression-zone"></div>
          <div class="ccm-fill"></div>
        </div>
      </div>
      <div class="ccm-card ccm-provider-card" data-known="false" data-level="normal" hidden>
        <div class="ccm-row">
          <span class="ccm-ring ccm-provider-ring" aria-hidden="true"></span>
          <span class="ccm-provider-value">Provider Left --</span>
        </div>
        <div class="ccm-track">
          <div class="ccm-fill ccm-provider-fill"></div>
        </div>
      </div>
    `;
    ensureRootInfrastructure(root);
    mountRoot(root);
    return root;
  }

  function findInlineMount() {
    const now = Date.now();
    if (
      state.inlineMountCache &&
      now - state.inlineMountLookupAt < INLINE_MOUNT_CACHE_MS &&
      state.inlineMountCache.parent &&
      state.inlineMountCache.parent.isConnected &&
      (!state.inlineMountCache.before || state.inlineMountCache.before.isConnected)
    ) {
      return state.inlineMountCache;
    }
    state.inlineMountLookupAt = now;

    const visibleDirectChildren = (node) =>
      Array.from(node.children || []).filter((child) => child.id !== ROOT_ID && isVisibleElement(child));
    const firstVisibleChild = (node) => visibleDirectChildren(node)[0] || null;
    const classText = (node) => (typeof node?.className === "string" ? node.className : "");
    const hasClassToken = (node, token) => classText(node).split(/\s+/).includes(token);
    const sortByLeft = (nodes) =>
      nodes.slice().sort(
        (left, right) => left.getBoundingClientRect().left - right.getBoundingClientRect().left
      );
    const hasVisibleInteractiveControl = (node) =>
      Array.from(
        node.querySelectorAll(`button, [role='button'], [aria-haspopup], ${CODEX_INTELLIGENCE_TRIGGER_SELECTOR}`)
      ).some((child) => child.id !== ROOT_ID && isVisibleElement(child));
    const directChildOf = (parent, node) => {
      let current = node;
      while (current && current.parentElement && current.parentElement !== parent) {
        current = current.parentElement;
      }
      return current && current.parentElement === parent ? current : null;
    };
    const isComposerArea = (node) => {
      const rect = node && node.getBoundingClientRect();
      if (!rect || rect.top < window.innerHeight * 0.45) return false;
      if (node.closest(CONVERSATION_CONTENT_SELECTOR)) return false;
      if (node.closest("aside, nav, [data-app-action-sidebar-thread-id], [data-app-action-sidebar-thread-active]")) return false;
      if (node.closest("article, [data-message-author-role]")) return false;
      if (!node.querySelector(`textarea, input, [contenteditable='true'], [role='textbox'], ${CODEX_COMPOSER_SELECTOR}`)) return false;
      return true;
    };
    const findComposerArea = (node) => {
      let current = node;
      while (current && current !== document.body) {
        if (isComposerArea(current)) return current;
        current = current.parentElement;
      }
      return null;
    };
    const findComposerFooterMount = () => {
      const footers = Array.from(document.querySelectorAll(".composer-footer"))
        .filter((footer) => isVisibleElement(footer) && footer.getBoundingClientRect().top > window.innerHeight * 0.45)
        .sort((left, right) => right.getBoundingClientRect().top - left.getBoundingClientRect().top);

      for (const footer of footers) {
        const footerChildren = sortByLeft(visibleDirectChildren(footer));
        const toolbarRoot = footerChildren
          .filter((child) => hasClassToken(child, "justify-end") && hasVisibleInteractiveControl(child))
          .sort((left, right) => right.getBoundingClientRect().right - left.getBoundingClientRect().right)[0];
        if (!toolbarRoot) continue;

        const toolbarChildren = sortByLeft(visibleDirectChildren(toolbarRoot));
        const providerGroup = toolbarChildren.find(
          (child) =>
            hasVisibleInteractiveControl(child) &&
            !hasClassToken(child, "shrink-0") &&
            (hasClassToken(child, "flex-1") || hasClassToken(child, "min-w-0"))
        );
        if (!providerGroup) continue;
        const before = firstVisibleChild(providerGroup);
        if (!before) continue;
        const footerRect = footer.getBoundingClientRect();
        const beforeRect = before.getBoundingClientRect();
        if (beforeRect.left < footerRect.left + footerRect.width * 0.5) continue;

        return {
          parent: providerGroup,
          before,
        };
      }

      return null;
    };
    const findStructuralMountForControl = (control) => {
      const footer = control.closest(".composer-footer");
      if (footer) {
        const footerRect = footer.getBoundingClientRect();
        const controlRect = control.getBoundingClientRect();
        if (controlRect.left < footerRect.left + footerRect.width * 0.5) return null;
      }

      let current = control.parentElement;
      while (current && current !== document.body) {
        const rect = current.getBoundingClientRect();
        if (rect.top < window.innerHeight * 0.45) break;
        if (current.closest(CONVERSATION_CONTENT_SELECTOR)) break;
        if (!current.closest(INVALID_INLINE_MOUNT_SELECTOR)) {
          const before = directChildOf(current, control) || control;
          if (before && before !== current && current.contains(before)) {
            return {
              parent: current,
              before,
            };
          }
        }
        current = current.parentElement;
      }
      return null;
    };
    const rememberMount = (mount) => {
      if (
        mount &&
        mount.parent &&
        mount.parent.isConnected &&
        !mount.parent.closest(INVALID_INLINE_MOUNT_SELECTOR)
      ) {
        state.inlineMountCache = mount;
        return mount;
      }

      state.inlineMountCache = null;
      return null;
    };

    const footerMount = findComposerFooterMount();
    if (footerMount) return rememberMount(footerMount);

    const codexModelTrigger = document.querySelector(CODEX_INTELLIGENCE_TRIGGER_SELECTOR);
    if (codexModelTrigger && isVisibleElement(codexModelTrigger)) {
      const bar = findComposerArea(codexModelTrigger);
      if (bar && isVisibleElement(bar) && isComposerArea(bar)) {
        const triggerMount = findStructuralMountForControl(codexModelTrigger);
        if (triggerMount) return rememberMount(triggerMount);
      }
    }

    state.inlineMountCache = null;
    return null;
  }

  function mountRoot(root) {
    state.uiState = readUiState();
    if (state.uiState.mode === "floating") {
      state.inlineMountCache = null;
      state.inlineMountPending = false;
      if (root.parentNode !== document.body) document.body.appendChild(root);
      state.inlineHost = null;
      root.dataset.placement = "floating";
      applyFloatingUiState(root);
      refreshOpenSpendHistory(root);
      return;
    }

    const mount = findInlineMount();
    if (!mount || !mount.parent || root.contains(mount.parent)) {
      state.inlineHost = null;
      state.inlineBefore = null;
      state.inlineMountCache = null;
      state.inlineMountPending = true;
      if (root.parentNode !== document.body) document.body.appendChild(root);
      root.dataset.placement = "inline";
      root.hidden = true;
      applyFloatingUiState(root);
      closeSpendHistory();
      scheduleUpdate(SWITCH_RETRY_INTERVAL_MS);
      return;
    }

    const before = mount.before || null;
    if (before !== root && (root.parentNode !== mount.parent || root.nextSibling !== before)) {
      mount.parent.insertBefore(root, before);
    }
    state.inlineHost = mount.parent;
    state.inlineBefore = before;
    state.inlineMountCache = mount;
    state.inlineMountPending = false;
    root.dataset.placement = "inline";
    applyFloatingUiState(root);
    refreshOpenSpendHistory(root);
  }

  function applyFloatingUiState(root) {
    const uiState = state.uiState || DEFAULT_FLOATING_UI;
    root.style.setProperty("--ccm-float-x", `${Math.round(uiState.x)}px`);
    root.style.setProperty("--ccm-float-y", `${Math.round(uiState.y)}px`);
    root.style.setProperty("--ccm-float-scale", String(uiState.scale));
    root.dataset.floatingLayout = uiState.floatingLayout === "vertical" ? "vertical" : "horizontal";
    root.dataset.theme = uiState.theme === "light" ? "light" : "dark";
    syncHistoryPortalTheme(root);
  }

  function setUiMode(mode) {
    state.uiState = {
      ...readUiState(),
      mode: mode === "floating" ? "floating" : "inline",
    };
    writeUiState();
    closeContextMenu();
    state.inlineMountCache = null;
    const root = state.root || document.getElementById(ROOT_ID);
    if (root) mountRoot(root);
  }

  function setUiTheme(theme) {
    state.uiState = {
      ...readUiState(),
      theme: theme === "light" ? "light" : "dark",
    };
    writeUiState();
    closeContextMenu();
    const root = state.root || document.getElementById(ROOT_ID);
    if (root) applyFloatingUiState(root);
  }

  function setFloatingLayout(layout) {
    state.uiState = {
      ...readUiState(),
      floatingLayout: layout === "vertical" ? "vertical" : "horizontal",
    };
    writeUiState();
    closeContextMenu();
    const root = state.root || document.getElementById(ROOT_ID);
    if (root) applyFloatingUiState(root);
  }

  function closeContextMenu() {
    if (state.contextMenu) {
      state.contextMenu.remove();
      state.contextMenu = null;
    }
    if (state.contextMenuCloseListener) {
      document.removeEventListener("pointerdown", state.contextMenuCloseListener, true);
      document.removeEventListener("keydown", state.contextMenuCloseListener, true);
      state.contextMenuCloseListener = null;
    }
  }

  function openContextMenu(event) {
    const root = state.root || document.getElementById(ROOT_ID);
    if (!root || !root.contains(event.target)) return;
    event.preventDefault();
    closeContextMenu();
    state.uiState = readUiState();

    const currentMode = (state.uiState && state.uiState.mode) === "floating" ? "floating" : "inline";
    const currentFloatingLayout =
      (state.uiState && state.uiState.floatingLayout) === "vertical" ? "vertical" : "horizontal";
    const currentTheme = (state.uiState && state.uiState.theme) === "light" ? "light" : "dark";
    const menu = document.createElement("div");
    menu.className = "ccm-context-menu";
    menu.dataset.theme = currentTheme;
    menu.setAttribute("role", "menu");
    const createRadioItem = (group, value, label, checked) => {
      const item = document.createElement("button");
      item.type = "button";
      item.dataset[group] = value;
      item.setAttribute("role", "menuitemradio");
      item.setAttribute("aria-checked", checked ? "true" : "false");

      const check = document.createElement("span");
      check.className = "ccm-menu-check";
      check.setAttribute("aria-hidden", "true");
      check.textContent = checked ? "✓" : "";

      const text = document.createElement("span");
      text.textContent = label;

      item.append(check, text);
      return item;
    };
    const items = [
      createRadioItem("theme", "dark", "Dark theme", currentTheme === "dark"),
      createRadioItem("theme", "light", "Light theme", currentTheme === "light"),
      document.createElement("div"),
      createRadioItem("mode", "inline", "Inline mode", currentMode === "inline"),
      createRadioItem("mode", "floating", "Floating mode", currentMode === "floating"),
    ];
    items[2].className = "ccm-menu-separator";
    items[2].setAttribute("role", "separator");
    if (currentMode === "floating") {
      const separator = document.createElement("div");
      separator.className = "ccm-menu-separator";
      separator.setAttribute("role", "separator");
      const hint = document.createElement("div");
      hint.className = "ccm-menu-hint";
      hint.textContent = "Use mouse wheel to resize";
      items.push(
        separator,
        createRadioItem("floatingLayout", "horizontal", "Horizontal layout", currentFloatingLayout === "horizontal"),
        createRadioItem("floatingLayout", "vertical", "Vertical layout", currentFloatingLayout === "vertical"),
        hint,
      );
    }
    menu.replaceChildren(...items);
    menu.style.left = `${Math.max(6, event.clientX)}px`;
    menu.style.top = `${Math.max(6, event.clientY)}px`;
    menu.addEventListener("pointerdown", (menuEvent) => {
      menuEvent.stopPropagation();
    });
    menu.addEventListener("click", (menuEvent) => {
      const button = menuEvent.target && menuEvent.target.closest("button[data-mode]");
      if (button) {
        setUiMode(button.dataset.mode);
        return;
      }

      const layoutButton = menuEvent.target && menuEvent.target.closest("button[data-floating-layout]");
      if (layoutButton) {
        setFloatingLayout(layoutButton.dataset.floatingLayout);
        return;
      }

      const themeButton = menuEvent.target && menuEvent.target.closest("button[data-theme]");
      if (themeButton) setUiTheme(themeButton.dataset.theme);
    });
    document.body.appendChild(menu);
    const menuRect = menu.getBoundingClientRect();
    const x = clampNumber(event.clientX, 6, Math.max(6, window.innerWidth - menuRect.width - 6));
    const y = clampNumber(event.clientY, 6, Math.max(6, window.innerHeight - menuRect.height - 6));
    menu.style.left = `${Math.round(x)}px`;
    menu.style.top = `${Math.round(y)}px`;
    state.contextMenu = menu;
    state.contextMenuCloseListener = (closeEvent) => {
      if (closeEvent.type === "keydown" && closeEvent.key !== "Escape") return;
      if (state.contextMenu && closeEvent.target && state.contextMenu.contains(closeEvent.target)) return;
      closeContextMenu();
    };
    window.setTimeout(() => {
      document.addEventListener("pointerdown", state.contextMenuCloseListener, true);
      document.addEventListener("keydown", state.contextMenuCloseListener, true);
    }, 0);
  }

  function installContextMenu(root) {
    if (!root || root.dataset.contextMenuInstalled === "true") return;
    root.dataset.contextMenuInstalled = "true";
    root.addEventListener("contextmenu", openContextMenu);
  }

  function clampFloatingPosition(root, x, y, scale) {
    const rect = root.getBoundingClientRect();
    const safeScale = clampNumber(scale, FLOAT_SCALE_MIN, FLOAT_SCALE_MAX);
    const width = Math.max(40, rect.width / (Number(state.uiState.scale) || 1) * safeScale);
    const height = Math.max(28, rect.height / (Number(state.uiState.scale) || 1) * safeScale);
    return {
      x: clampNumber(x, 0, Math.max(0, window.innerWidth - width)),
      y: clampNumber(y, 0, Math.max(0, window.innerHeight - height)),
      scale: safeScale,
    };
  }

  function installFloatingControls(root) {
    if (!root || root.dataset.floatingControlsInstalled === "true") return;
    root.dataset.floatingControlsInstalled = "true";

    const onPointerDown = (event) => {
      if (root.dataset.placement !== "floating" || event.button !== 0) return;
      if (event.target && event.target.closest(".ccm-context-menu")) return;

      const uiState = readUiState();
      const startX = event.clientX;
      const startY = event.clientY;
      const pointerId = event.pointerId;
      let dragging = false;
      const holdTimer = window.setTimeout(() => {
        dragging = true;
        root.dataset.dragging = "true";
        try {
          root.setPointerCapture(pointerId);
        } catch {
        }
      }, FLOAT_DRAG_HOLD_MS);

      const onPointerMove = (moveEvent) => {
        if (!dragging) return;
        const next = clampFloatingPosition(
          root,
          uiState.x + moveEvent.clientX - startX,
          uiState.y + moveEvent.clientY - startY,
          uiState.scale,
        );
        state.uiState = { ...uiState, ...next, mode: "floating" };
        applyFloatingUiState(root);
      };

      const finish = () => {
        window.clearTimeout(holdTimer);
        document.removeEventListener("pointermove", onPointerMove, true);
        document.removeEventListener("pointerup", finish, true);
        document.removeEventListener("pointercancel", finish, true);
        if (dragging) {
          root.dataset.dragging = "false";
          writeUiState();
        }
      };

      document.addEventListener("pointermove", onPointerMove, true);
      document.addEventListener("pointerup", finish, true);
      document.addEventListener("pointercancel", finish, true);
    };

    const onWheel = (event) => {
      if (root.dataset.placement !== "floating") return;
      event.preventDefault();
      const current = readUiState();
      const direction = event.deltaY < 0 ? 1 : -1;
      const nextScale = clampNumber(current.scale + direction * FLOAT_SCALE_STEP, FLOAT_SCALE_MIN, FLOAT_SCALE_MAX);
      const next = clampFloatingPosition(root, current.x, current.y, nextScale);
      state.uiState = { ...current, ...next, mode: "floating" };
      applyFloatingUiState(root);
      writeUiState();
    };

    root.addEventListener("pointerdown", onPointerDown);
    root.addEventListener("wheel", onWheel, { passive: false });
    state.floatingPointerCleanup = () => {
      root.removeEventListener("pointerdown", onPointerDown);
      root.removeEventListener("wheel", onWheel);
    };
  }

  function toNumber(value, unit) {
    if (value == null) return null;

    const parsed = Number(String(value).replace(/,/g, ""));
    if (!Number.isFinite(parsed)) return null;

    const normalizedUnit = String(unit || "").toLowerCase();
    if (normalizedUnit === "k") return parsed * 1000;
    if (normalizedUnit === "m") return parsed * 1000000;
    return parsed;
  }

  function clampPercent(value) {
    if (!Number.isFinite(value)) return null;
    return Math.max(0, Math.min(100, value));
  }

  function clampNumber(value, min, max) {
    if (!Number.isFinite(value)) return min;
    return Math.max(min, Math.min(max, value));
  }

  function numberOrDefault(value, fallback) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function readUiState() {
    try {
      const parsed = JSON.parse(localStorage.getItem(UI_STATE_STORAGE_KEY) || "null");
      const input = parsed && typeof parsed === "object" ? parsed : {};
      return {
        mode: input.mode === "floating" ? "floating" : "inline",
        floatingLayout: input.floatingLayout === "vertical" ? "vertical" : "horizontal",
        theme: input.theme === "light" ? "light" : "dark",
        x: clampNumber(Number(input.x), 0, Math.max(0, window.innerWidth - 80)),
        y: clampNumber(Number(input.y), 0, Math.max(0, window.innerHeight - 40)),
        scale: clampNumber(Number(input.scale) || 1, FLOAT_SCALE_MIN, FLOAT_SCALE_MAX),
      };
    } catch {
      return { ...DEFAULT_FLOATING_UI };
    }
  }

  function writeUiState() {
    try {
      localStorage.setItem(UI_STATE_STORAGE_KEY, JSON.stringify(state.uiState));
    } catch {
    }
  }

  function shouldShowUsedInsteadOfLeft(config = state.uiConfig) {
    const context = config && config.context;
    return !!(context && context.showUsedInsteadOfLeft === true);
  }

  function normalizeLevelThresholds(value, defaults) {
    const input = value && typeof value === "object" ? value : {};

    return {
      criticalLeftPercent: clampPercent(numberOrDefault(input.criticalLeftPercent, defaults.criticalLeftPercent)),
      dangerLeftPercent: clampPercent(numberOrDefault(input.dangerLeftPercent, defaults.dangerLeftPercent)),
      warnLeftPercent: clampPercent(numberOrDefault(input.warnLeftPercent, defaults.warnLeftPercent)),
      noticeLeftPercent: clampPercent(numberOrDefault(input.noticeLeftPercent, defaults.noticeLeftPercent)),
    };
  }

  function normalizeUiConfig(value) {
    const input = value && typeof value === "object" ? value : {};
    const context = input.context && typeof input.context === "object" ? input.context : {};
    const provider = input.provider && typeof input.provider === "object" ? input.provider : {};

    return {
      context: {
        showUsedInsteadOfLeft: context.showUsedInsteadOfLeft === true,
        compressionWarningLeftPercent: clampPercent(numberOrDefault(
          context.compressionWarningLeftPercent,
          DEFAULT_UI_CONFIG.context.compressionWarningLeftPercent,
        )),
        levelThresholds: normalizeLevelThresholds(
          context.levelThresholds,
          DEFAULT_UI_CONFIG.context.levelThresholds,
        ),
      },
      provider: {
        levelThresholds: normalizeLevelThresholds(
          provider.levelThresholds,
          DEFAULT_UI_CONFIG.provider.levelThresholds,
        ),
      },
    };
  }

  function readUiConfig() {
    const summaryConfig = state.providerSummary && state.providerSummary.ui;
    return normalizeUiConfig(summaryConfig || window[CONFIG_KEY] || DEFAULT_UI_CONFIG);
  }

  function levelForLeftPercent(leftPercent, scope) {
    const config = scope === "provider" ? state.uiConfig.provider : state.uiConfig.context;
    const thresholds = config.levelThresholds;
    if (leftPercent <= thresholds.criticalLeftPercent) return "critical";
    if (leftPercent <= thresholds.dangerLeftPercent) return "danger";
    if (leftPercent <= thresholds.warnLeftPercent) return "warn";
    if (leftPercent <= thresholds.noticeLeftPercent) return "notice";
    return "normal";
  }

  function shouldShowCompressionWarning(leftPercent) {
    const threshold = state.uiConfig.context.compressionWarningLeftPercent;
    return Number.isFinite(threshold) && leftPercent <= threshold;
  }

  function compactNumber(value) {
    if (!Number.isFinite(value)) return "";
    if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
    if (value >= 1000) return `${(value / 1000).toFixed(1)}K`;
    return String(Math.round(value));
  }

  function formatTokenCount(value) {
    if (!Number.isFinite(value)) return "--";
    return Math.round(value).toLocaleString("en-US");
  }

  function formatAmount(value) {
    if (!Number.isFinite(value)) return "--";
    if (Math.abs(value) >= 1000) return value.toLocaleString("en-US", { maximumFractionDigits: 1 });
    return value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function formatMoney(value) {
    const amount = formatAmount(value);
    return amount === "--" ? amount : `$${amount}`;
  }

  function formatProviderTitle(name, provider, usedAmount, remainingAmount, totalAmount, usedPercent, leftPercent) {
    return [
      `${name} Balance`,
      `Left: ${formatMoney(remainingAmount)} (${leftPercent.toFixed(1)}%)`,
      `Used: ${formatMoney(usedAmount)} (${usedPercent.toFixed(1)}%)`,
      `Total: ${formatMoney(totalAmount)}`,
      `Status: ${provider.status || "unknown"}`,
    ].join(" | ");
  }

  function formatContextTitle(reading, usedTokens, remainingTokens, leftPercent, usedPercent) {
    const limitTokens = Number.isFinite(reading.limit) ? reading.limit : null;
    const parts = [
      "Context",
      `Left: ${formatTokenCount(remainingTokens)} Tokens (${leftPercent.toFixed(1)}%)`,
      `Used: ${formatTokenCount(usedTokens)} Tokens (${usedPercent.toFixed(1)}%)`,
    ];
    if (Number.isFinite(limitTokens)) parts.push(`Total: ${formatTokenCount(limitTokens)} Tokens`);
    if (reading.source) parts.push(`Source: ${reading.source}`);
    return parts.join(" | ");
  }

  function pruneSpendHistory(now = Date.now()) {
    const cutoff = now - SPEND_HISTORY_WINDOW_MS;
    for (const kind of ["context", "provider"]) {
      const items = state.spendHistory[kind];
      while (items.length && items[0].time < cutoff) items.shift();
      if (items.length > SPEND_HISTORY_MAX_ITEMS) {
        items.splice(0, items.length - SPEND_HISTORY_MAX_ITEMS);
      }
    }
  }

  function recordSpend(kind, amount, meta) {
    if (!Number.isFinite(amount) || amount <= 0 || !state.spendHistory[kind]) return;

    const now = Date.now();
    const conversationId =
      kind === "context"
        ? normalizeConversationId(meta || state.activeConversationId || "__unknown__") || "__unknown__"
        : metaConversationId();
    const itemMeta = kind === "provider" ? String(meta || "") : "";
    if (kind === "context") {
      const previousTotal = state.contextSessionTotalsByConversationId.get(conversationId) || 0;
      state.contextSessionTotalsByConversationId.set(conversationId, previousTotal + amount);
    } else {
      const previousTotal = state.providerSessionTotalsByConversationId.get(conversationId) || 0;
      state.providerSessionTotalsByConversationId.set(conversationId, previousTotal + amount);
    }

    state.spendHistory[kind].push({
      time: now,
      amount,
      conversationId,
      meta: itemMeta,
    });
    pruneSpendHistory(now);
    if (state.root && state.root.dataset.historyOpen === "true") {
      renderSpendHistory();
    }
  }

  function formatHistoryTime(time) {
    const date = new Date(time);
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }

  function formatHistoryDelta(kind, amount) {
    if (kind === "provider") return `-${formatMoney(amount)}`;
    return `-${Math.round(amount).toLocaleString("en-US")} Tokens`;
  }

  function formatHistoryAxisValue(kind, amount) {
    if (kind === "provider") return formatMoney(amount);
    if (!Number.isFinite(amount)) return "--";
    if (amount >= 1000000) return `${(amount / 1000000).toFixed(1)}M`;
    if (amount >= 1000) return `${(amount / 1000).toFixed(1)}K`;
    return String(Math.round(amount));
  }

  function formatHistoryPointTitle(kind, point) {
    const lines = [
      `${formatHistoryTime(point.item.time)} ${formatHistoryDelta(kind, point.item.amount)}`,
    ];
    if (point.item.meta) lines.push(String(point.item.meta));
    return lines.join("\n");
  }

  function currentContextHistorySnapshot(conversationId) {
    const reading = state.lastReading;
    if (!reading || !conversationIdsMatch(reading.conversationId, conversationId)) return null;
    const used = Number(reading.used);
    if (!Number.isFinite(used) || used <= 0) return null;

    return {
      time: Date.now(),
      amount: used,
      conversationId: normalizeConversationId(conversationId || reading.conversationId || "__unknown__") || "__unknown__",
      meta: "Current used",
    };
  }

  function currentProviderHistorySnapshot(conversationId) {
    const provider = pickProviderSummary(readProviderSummary());
    if (!provider) return null;

    const remainingAmount = Number(provider.remainingAmount);
    const totalAmount = Number(provider.totalAmount);
    const usedAmount = Number.isFinite(Number(provider.usedAmount))
      ? Number(provider.usedAmount)
      : totalAmount - remainingAmount;
    if (!Number.isFinite(usedAmount) || usedAmount <= 0) return null;

    return {
      time: Date.now(),
      amount: usedAmount,
      conversationId: normalizeConversationId(conversationId || "__unknown__") || "__unknown__",
      meta: String(provider.displayName || provider.id || "Current used"),
    };
  }

  function currentHistorySnapshot(kind, conversationId) {
    return kind === "context"
      ? currentContextHistorySnapshot(conversationId)
      : currentProviderHistorySnapshot(conversationId);
  }

  function svgPoint(value) {
    return Number.isFinite(value) ? value.toFixed(1) : "0.0";
  }

  function makeSpendHistoryChart(items, kind) {
    const now = Date.now();
    const cutoff = now - SPEND_HISTORY_WINDOW_MS;
    const width = SPEND_HISTORY_CHART_WIDTH;
    const height = SPEND_HISTORY_CHART_HEIGHT;
    const padding = SPEND_HISTORY_CHART_PADDING;
    const axisWidth = SPEND_HISTORY_CHART_AXIS_WIDTH;
    const plotLeft = axisWidth;
    const plotRight = width - padding;
    const plotTop = padding;
    const plotBottom = height - padding;
    const innerWidth = plotRight - plotLeft;
    const innerHeight = height - padding * 2;
    const chart = document.createElement("div");
    chart.className = "ccm-history-chart";

    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("class", "ccm-history-svg");
    svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
    svg.setAttribute("preserveAspectRatio", "none");
    svg.setAttribute("aria-hidden", "true");

    const validItems = [];
    for (const item of items) {
      if (!Number.isFinite(item.amount) || item.amount <= 0) continue;
      const time = Number(item.time);
      if (!Number.isFinite(time) || time < cutoff) continue;
      validItems.push({
        time: clampNumber(time, cutoff, now),
        amount: item.amount,
        meta: item.meta || "",
      });
    }

    if (!validItems.length) {
      const empty = document.createElement("div");
      empty.className = "ccm-history-empty";
      empty.textContent = "No spend in the last hour";
      chart.append(svg, empty);
      return chart;
    }

    const firstTime = validItems[0].time;
    const lastTime = validItems[validItems.length - 1].time;
    const timeSpan = lastTime - firstTime;
    const useIndexAxis = validItems.length === 1 || timeSpan <= 0;
    const axisLabel = formatHistoryTime(firstTime) === formatHistoryTime(lastTime)
      ? formatHistoryTime(firstTime)
      : `${formatHistoryTime(firstTime)}-${formatHistoryTime(lastTime)}`;
    const rawPoints = [];
    validItems.forEach((item, index) => {
      const xRatio = useIndexAxis
        ? index / Math.max(validItems.length - 1, 1)
        : (item.time - firstTime) / timeSpan;
      const x = plotLeft + xRatio * innerWidth;
      rawPoints.push({ x, value: item.amount, item });
    });

    const minValue = Math.min(...rawPoints.map((point) => point.value));
    const maxValue = Math.max(...rawPoints.map((point) => point.value));
    const fallbackRange = Math.max(maxValue, 1) * 0.12;
    const axisMin = minValue === maxValue ? Math.max(0, minValue - fallbackRange) : minValue;
    const axisMax = minValue === maxValue ? maxValue + fallbackRange : maxValue;
    const axisRange = Math.max(axisMax - axisMin, 1);
    const yForValue = (value) => plotBottom - ((value - axisMin) / axisRange) * innerHeight;
    const points = rawPoints.map((point) => ({
      ...point,
      y: yForValue(point.value),
    }));

    if (points.length === 1) {
      const onlyPoint = points[0];
      points.push({
        x: plotRight,
        y: onlyPoint.y,
        value: onlyPoint.value,
        item: onlyPoint.item,
        isSynthetic: true,
      });
    }

    const yAxis = document.createElementNS("http://www.w3.org/2000/svg", "path");
    yAxis.setAttribute("class", "ccm-history-axis-line");
    yAxis.setAttribute("d", `M ${svgPoint(plotLeft)} ${svgPoint(plotTop)} V ${svgPoint(plotBottom)} H ${svgPoint(plotRight)}`);
    svg.appendChild(yAxis);

    const topGridline = document.createElementNS("http://www.w3.org/2000/svg", "path");
    topGridline.setAttribute("class", "ccm-history-gridline");
    topGridline.setAttribute("d", `M ${svgPoint(plotLeft)} ${svgPoint(plotTop)} H ${svgPoint(plotRight)}`);
    svg.appendChild(topGridline);

    const bottomGridline = document.createElementNS("http://www.w3.org/2000/svg", "path");
    bottomGridline.setAttribute("class", "ccm-history-gridline");
    bottomGridline.setAttribute("d", `M ${svgPoint(plotLeft)} ${svgPoint(plotBottom)} H ${svgPoint(plotRight)}`);
    svg.appendChild(bottomGridline);

    const topLabel = document.createElementNS("http://www.w3.org/2000/svg", "text");
    topLabel.setAttribute("class", "ccm-history-axis-label");
    topLabel.setAttribute("x", "2");
    topLabel.setAttribute("y", svgPoint(plotTop + 4));
    topLabel.textContent = formatHistoryAxisValue(kind, axisMax);
    svg.appendChild(topLabel);

    const bottomLabel = document.createElementNS("http://www.w3.org/2000/svg", "text");
    bottomLabel.setAttribute("class", "ccm-history-axis-label");
    bottomLabel.setAttribute("x", "2");
    bottomLabel.setAttribute("y", svgPoint(plotBottom));
    bottomLabel.textContent = formatHistoryAxisValue(kind, axisMin);
    svg.appendChild(bottomLabel);

    const linePath = points
      .map((point, index) => `${index === 0 ? "M" : "L"} ${svgPoint(point.x)} ${svgPoint(point.y)}`)
      .join(" ");
    const areaPath = `${linePath} L ${svgPoint(points[points.length - 1].x)} ${svgPoint(plotBottom)} L ${svgPoint(points[0].x)} ${svgPoint(plotBottom)} Z`;

    const area = document.createElementNS("http://www.w3.org/2000/svg", "path");
    area.setAttribute("class", "ccm-history-area");
    area.setAttribute("d", areaPath);
    svg.appendChild(area);

    const line = document.createElementNS("http://www.w3.org/2000/svg", "path");
    line.setAttribute("class", "ccm-history-line");
    line.setAttribute("d", linePath);
    svg.appendChild(line);

    const realPoints = points.filter((historyPoint) => !historyPoint.isSynthetic);
    const lastPoint = realPoints[realPoints.length - 1] || points[points.length - 1];
    for (const historyPoint of realPoints) {
      const isLatestPoint = historyPoint === lastPoint;
      const point = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      point.setAttribute("class", "ccm-history-point");
      point.setAttribute("cx", svgPoint(historyPoint.x));
      point.setAttribute("cy", svgPoint(historyPoint.y));
      point.setAttribute("r", isLatestPoint ? "3" : "2.4");
      const pointTitle = document.createElementNS("http://www.w3.org/2000/svg", "title");
      pointTitle.textContent = formatHistoryPointTitle(kind, historyPoint);
      point.appendChild(pointTitle);
      svg.appendChild(point);

      const hit = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      hit.setAttribute("class", "ccm-history-hit");
      hit.setAttribute("cx", svgPoint(historyPoint.x));
      hit.setAttribute("cy", svgPoint(historyPoint.y));
      hit.setAttribute("r", "8");
      const title = document.createElementNS("http://www.w3.org/2000/svg", "title");
      title.textContent = formatHistoryPointTitle(kind, historyPoint);
      hit.appendChild(title);
      svg.appendChild(hit);
    }

    const caption = document.createElement("div");
    caption.className = "ccm-history-caption";
    const windowLabel = document.createElement("span");
    windowLabel.textContent = axisLabel;
    const lastLabel = document.createElement("span");
    lastLabel.textContent = formatHistoryDelta(kind, lastPoint.item.amount);
    if (lastPoint.item.meta) lastLabel.title = String(lastPoint.item.meta);
    caption.append(windowLabel, lastLabel);

    chart.append(svg, caption);
    return chart;
  }

  function renderHistorySection(kind) {
    const panel = state.historyPanel;
    const section = panel && panel.querySelector(`[data-history-kind="${kind}"]`);
    if (!section) return;

    const visibleCard = kind === "provider" ? state.providerCard : state.contextCard;
    if (!visibleCard || visibleCard.hidden) {
      section.hidden = true;
      return;
    }
    if (section.hidden) section.hidden = false;

    pruneSpendHistory();
    const conversationId = metaConversationId();
    let items = state.spendHistory[kind].filter((item) => {
      const itemConversationId = normalizeConversationId(item.conversationId || "__unknown__") || "__unknown__";
      return itemConversationId === conversationId;
    });
    let total =
      kind === "context"
        ? contextSessionTotal(conversationId)
        : providerSessionTotal(conversationId);
    if (!items.length) {
      const snapshot = currentHistorySnapshot(kind, conversationId);
      if (snapshot) {
        items = [snapshot];
        total = snapshot.amount;
      }
    }
    const totalNode = section.querySelector(".ccm-history-total");
    const chart = section.querySelector(".ccm-history-chart");
    if (totalNode) totalNode.textContent = total > 0 ? formatHistoryDelta(kind, total) : "--";
    if (!chart) return;

    chart.replaceWith(makeSpendHistoryChart(items, kind));
  }

  function metaConversationId() {
    return normalizeConversationId(state.activeConversationId || (state.lastReading && state.lastReading.conversationId) || "__unknown__") || "__unknown__";
  }

  function contextSessionTotal(conversationId) {
    const normalizedConversationId = normalizeConversationId(conversationId || "__unknown__") || "__unknown__";
    return state.contextSessionTotalsByConversationId.get(normalizedConversationId) || 0;
  }

  function providerSessionTotal(conversationId) {
    const normalizedConversationId = normalizeConversationId(conversationId || "__unknown__") || "__unknown__";
    return state.providerSessionTotalsByConversationId.get(normalizedConversationId) || 0;
  }

  function renderSpendHistory() {
    const grid = state.historyPanel && state.historyPanel.querySelector(".ccm-history-grid");
    if (grid) {
      grid.dataset.providerVisible = state.providerCard && !state.providerCard.hidden ? "true" : "false";
    }
    renderHistorySection("context");
    renderHistorySection("provider");
  }

  function clampHistoryPanelToViewport(root) {
    const panel = state.historyPanel;
    if (!root || !panel) return;

    const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 0;
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
    if (viewportWidth <= 0 || viewportHeight <= 0) return;

    const maxWidth = Math.max(
      HISTORY_PANEL_MIN_WIDTH,
      viewportWidth - HISTORY_PANEL_VIEWPORT_PADDING * 2,
    );
    const maxHeight = Math.max(
      HISTORY_PANEL_MIN_HEIGHT,
      viewportHeight - HISTORY_PANEL_VIEWPORT_PADDING * 2,
    );
    panel.style.setProperty("--ccm-history-max-width", `${maxWidth}px`);
    panel.style.setProperty("--ccm-history-max-height", `${maxHeight}px`);

    const anchor = state.contextCard && !state.contextCard.hidden
      ? state.contextCard
      : state.providerCard && !state.providerCard.hidden
        ? state.providerCard
        : root;
    const anchorRect = anchor.getBoundingClientRect();
    const panelRect = panel.getBoundingClientRect();
    const panelWidth = Math.min(
      Math.max(panelRect.width || HISTORY_PANEL_MIN_WIDTH, HISTORY_PANEL_MIN_WIDTH),
      maxWidth,
    );
    const panelHeight = Math.min(
      Math.max(panelRect.height || HISTORY_PANEL_MIN_HEIGHT, HISTORY_PANEL_MIN_HEIGHT),
      maxHeight,
    );
    const left = clampNumber(
      anchorRect.left,
      HISTORY_PANEL_VIEWPORT_PADDING,
      Math.max(HISTORY_PANEL_VIEWPORT_PADDING, viewportWidth - panelWidth - HISTORY_PANEL_VIEWPORT_PADDING),
    );
    const belowTop = anchorRect.bottom + HISTORY_PANEL_GAP;
    const aboveTop = anchorRect.top - panelHeight - HISTORY_PANEL_GAP;
    const top = belowTop + panelHeight + HISTORY_PANEL_VIEWPORT_PADDING <= viewportHeight
      ? belowTop
      : Math.max(HISTORY_PANEL_VIEWPORT_PADDING, aboveTop);

    panel.style.setProperty("--ccm-history-left", `${Math.round(left)}px`);
    panel.style.setProperty("--ccm-history-top", `${Math.round(top)}px`);
  }

  function openSpendHistory() {
    const root = state.root;
    if (!root) return;
    if (root.hidden) {
      closeSpendHistory();
      return;
    }
    ensureHistoryPortal(root);
    if (state.historyCloseTimer) {
      window.clearTimeout(state.historyCloseTimer);
      state.historyCloseTimer = 0;
    }
    renderSpendHistory();
    clampHistoryPanelToViewport(root);
    if (root.dataset.historyOpen !== "true") root.dataset.historyOpen = "true";
    if (state.historyPortal) state.historyPortal.dataset.historyOpen = "true";
    if (state.historyPanel) state.historyPanel.setAttribute("aria-hidden", "false");
  }

  function refreshOpenSpendHistory(root = state.root) {
    if (!root || root.dataset.historyOpen !== "true") return;
    ensureHistoryPortal(root);
    renderSpendHistory();
    clampHistoryPanelToViewport(root);
  }

  function closeSpendHistory() {
    const root = state.root;
    if (!root) return;
    if (state.historyCloseTimer) {
      window.clearTimeout(state.historyCloseTimer);
      state.historyCloseTimer = 0;
    }
    if (root.dataset.historyOpen !== "false") root.dataset.historyOpen = "false";
    if (state.historyPortal) state.historyPortal.dataset.historyOpen = "false";
    if (state.historyPanel) {
      state.historyPanel.setAttribute("aria-hidden", "true");
    }
  }

  function scheduleCloseSpendHistory(event) {
    const root = state.root;
    if (!root) return;
    const relatedTarget = event && event.relatedTarget;
    if (relatedTarget && typeof relatedTarget.nodeType === "number" && root.contains(relatedTarget)) return;
    if (state.historyCloseTimer) window.clearTimeout(state.historyCloseTimer);
    state.historyCloseTimer = 0;
    closeSpendHistory();
  }

  function expandedRectContainsPoint(rect, x, y, expand) {
    return !!rect &&
      x >= rect.left - expand &&
      x <= rect.right + expand &&
      y >= rect.top - expand &&
      y <= rect.bottom + expand;
  }

  function isPointerInsideHistorySurface(x, y) {
    const root = state.root;
    if (!root || root.hidden) return false;

    const cards = [state.contextCard, state.providerCard].filter((card) => card && !card.hidden);
    if (cards.some((card) => expandedRectContainsPoint(card.getBoundingClientRect(), x, y, 6))) {
      return true;
    }

    return false;
  }

  function installHistoryPointerTracker(root) {
    const onPointerMove = (event) => {
      if (isPointerInsideHistorySurface(event.clientX, event.clientY)) {
        openSpendHistory();
      } else if (root.dataset.historyOpen === "true") {
        scheduleCloseSpendHistory();
      }
    };
    const onPointerLeave = () => {
      if (root.dataset.historyOpen === "true") scheduleCloseSpendHistory();
    };

    document.addEventListener("pointermove", onPointerMove, { passive: true });
    document.addEventListener("pointerdown", onPointerMove, { passive: true });
    window.addEventListener("blur", closeSpendHistory);
    document.addEventListener("mouseleave", onPointerLeave);

    return () => {
      document.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("pointerdown", onPointerMove);
      window.removeEventListener("blur", closeSpendHistory);
      document.removeEventListener("mouseleave", onPointerLeave);
    };
  }

  function installHistoryHover(root) {
    if (!root) return;
    if (state.historyHoverCleanup && root.dataset.historyHoverInstalled === "true") return;
    if (state.historyHoverCleanup) state.historyHoverCleanup();
    root.dataset.historyHoverInstalled = "true";
    if (root.dataset.historyOpen !== "true") root.dataset.historyOpen = "false";
    ensureHistoryPortal(root);
    if (state.historyPortal && state.historyPortal.dataset.historyOpen !== "true") {
      state.historyPortal.dataset.historyOpen = "false";
    }
    state.historyHoverCleanup = installHistoryPointerTracker(root);
  }

  function clearSpendEffects() {
    window.clearTimeout(state.spendEffectTimer);
    state.spendEffectTimer = 0;
    state.spendEffectQueue.length = 0;
    if (state.spendEffectActive) {
      state.spendEffectActive.remove();
      state.spendEffectActive = null;
    }
    const root = state.root || document.getElementById(ROOT_ID);
    root?.querySelectorAll(".ccm-hit-pop").forEach((node) => node.remove());
  }

  function hasPendingSpendEffects() {
    return !!(state.spendEffectActive || state.spendEffectQueue.length);
  }

  function finishSpendEffect(pop) {
    if (state.spendEffectActive !== pop) return;
    window.clearTimeout(state.spendEffectTimer);
    state.spendEffectTimer = 0;
    state.spendEffectActive = null;
    pop.remove();
    playNextSpendEffect();
    if (!hasPendingSpendEffects()) {
      const root = state.root || document.getElementById(ROOT_ID);
      if (root) updateDockVisibility(root);
    }
  }

  function playNextSpendEffect() {
    if (state.spendEffectActive) return;
    const root = state.root || document.getElementById(ROOT_ID);
    if (!root || root.hidden) return;

    const text = state.spendEffectQueue.shift();
    if (!text) return;

    const pop = document.createElement("div");
    pop.className = "ccm-hit-pop";
    pop.textContent = text;
    state.spendEffectActive = pop;
    root.appendChild(pop);

    const onAnimationEnd = (event) => {
      if (event.target !== pop || event.animationName !== "ccm-hit-pop") return;
      pop.removeEventListener("animationend", onAnimationEnd);
      finishSpendEffect(pop);
    };
    pop.addEventListener("animationend", onAnimationEnd);
    state.spendEffectTimer = window.setTimeout(() => finishSpendEffect(pop), SPEND_EFFECT_FALLBACK_MS);
  }

  function enqueueSpendEffect(text) {
    if (!text) return;
    state.spendEffectQueue.push(text);
    playNextSpendEffect();
  }

  function showTokenSpendEffect(deltaTokens) {
    if (!Number.isFinite(deltaTokens) || deltaTokens <= 0) return;
    enqueueSpendEffect(`-${Math.round(deltaTokens).toLocaleString("en-US")} Tokens`);
  }

  function showProviderSpendEffect(deltaAmount) {
    if (!Number.isFinite(deltaAmount) || deltaAmount <= 0) return;
    enqueueSpendEffect(`-${formatMoney(deltaAmount)}`);
  }

  function shouldShowContextSpendEffect(conversationId, currentUsed) {
    if (!Number.isFinite(currentUsed)) return false;
    const now = Date.now();
    const normalizedConversationId = normalizeConversationId(conversationId || "__unknown__") || "__unknown__";
    const roundedCurrentUsed = Math.round(currentUsed);
    const previous = window[CONTEXT_SPEND_DEDUPE_KEY];
    const isSameReading =
      previous &&
      previous.currentUsed === roundedCurrentUsed &&
      (
        previous.conversationId === normalizedConversationId ||
        previous.conversationId === "__unknown__" ||
        normalizedConversationId === "__unknown__"
      );
    if (isSameReading && now - previous.at < CONTEXT_SPEND_DEDUPE_WINDOW_MS) {
      return false;
    }
    window[CONTEXT_SPEND_DEDUPE_KEY] = {
      conversationId: normalizedConversationId,
      currentUsed: roundedCurrentUsed,
      at: now,
    };
    return true;
  }

  function shouldShowProviderSpendEffect(providerId, currentUsed) {
    if (!providerId || !Number.isFinite(currentUsed)) return false;
    const now = Date.now();
    const key = `${providerId}:${currentUsed}`;
    const previous = window[PROVIDER_SPEND_DEDUPE_KEY];
    if (previous && previous.key === key && now - previous.at < PROVIDER_SPEND_DEDUPE_WINDOW_MS) {
      return false;
    }
    window[PROVIDER_SPEND_DEDUPE_KEY] = { key, at: now };
    return true;
  }

  function hasDescendant(element, selector) {
    return !!(element && element.querySelector(selector));
  }

  // 只把主会话内容区当作可显示区域；Codex App DOM 更新后，优先从这里重找 thread/transcript 锚点。
  function hasThreadContentSurface() {
    if (!isConversationWindow()) return false;

    const now = Date.now();
    if (now - state.threadContentLookupAt < ACTIVE_CONVERSATION_LOOKUP_CACHE_MS) {
      return state.threadContentLookupResult;
    }

    const main = document.querySelector("main");
    const result = hasDescendant(main, THREAD_CONTENT_SELECTOR);
    state.threadContentLookupAt = now;
    state.threadContentLookupResult = result;
    return result;
  }

  function invalidateThreadContentCache() {
    state.threadContentLookupAt = 0;
    state.inlineMountLookupAt = 0;
  }

  // Pet/头像层也运行在 app://-/index.html，需要额外按 route 排除非对话窗口。
  function isConversationWindow() {
    const url = new URL(location.href);
    const route = `${url.pathname} ${url.search} ${url.hash}`.toLowerCase();
    if (route.includes("avatar-overlay") || route.includes("pet")) return false;

    return url.protocol === "app:" && url.pathname.endsWith("/index.html");
  }

  function updateDockVisibility(root) {
    const contextVisible = state.contextCard && !state.contextCard.hidden;
    const providerVisible = state.providerCard && !state.providerCard.hidden;
    if (state.inlineMountPending && (state.uiState || readUiState()).mode !== "floating") {
      root.hidden = true;
      closeSpendHistory();
      return;
    }

    const hidden = !contextVisible && !providerVisible;
    const keepVisibleForSpend = hidden && hasPendingSpendEffects();
    root.hidden = hidden && !keepVisibleForSpend;
    if (hidden) {
      closeSpendHistory();
      if (!keepVisibleForSpend) clearSpendEffects();
    } else if (root.dataset.historyOpen === "true") {
      renderSpendHistory();
    }
    if (!root.hidden) playNextSpendEffect();
  }

  function hideMeter(root, card, value, fill, title) {
    if (!card) return;
    if (card.dataset.known !== "false") card.dataset.known = "false";
    if (card.dataset.level !== "normal") card.dataset.level = "normal";
    if (card.dataset.compressionWarning !== "false") card.dataset.compressionWarning = "false";
    if (card.title !== title) card.title = title;
    if (value.textContent !== "Context Left --") value.textContent = "Context Left --";
    if (fill.style.width !== "0%") fill.style.width = "0%";
    const ring = state.contextRing || card.querySelector(".ccm-ring");
    if (ring && !state.contextRing) state.contextRing = ring;
    if (ring) ring.style.setProperty("--ccm-ring-angle", "0deg");
    card.hidden = true;
    updateDockVisibility(root);
  }

  function hideProviderMeter(root, reason) {
    const card = state.providerCard;
    if (!card) return;
    if (card.dataset.known !== "false") card.dataset.known = "false";
    if (card.dataset.level !== "normal") card.dataset.level = "normal";
    if (card.title !== reason) card.title = reason;
    if (state.providerFill && state.providerFill.style.width !== "0%") state.providerFill.style.width = "0%";
    const ring = state.providerRing || card.querySelector(".ccm-ring");
    if (ring && !state.providerRing) state.providerRing = ring;
    if (ring) ring.style.setProperty("--ccm-ring-angle", "0deg");
    card.hidden = true;
    updateDockVisibility(root);
  }

  function pickProviderSummary(summary) {
    const providers = summary && Array.isArray(summary.providers) ? summary.providers : [];
    return providers.find((provider) => provider && provider.status === "active") || null;
  }

  function renderProviderMeter(root) {
    state.providerSummary = readProviderSummary();
    state.uiConfig = readUiConfig();
    const provider = pickProviderSummary(state.providerSummary);
    if (!provider) {
      hideProviderMeter(root, "No active provider summary is available.");
      return;
    }

    const card = state.providerCard;
    if (!card || !state.providerValue || !state.providerFill) return;

    const usedPercent = clampPercent(Number(provider.usedPercent));
    const remainingAmount = Number(provider.remainingAmount);
    const totalAmount = Number(provider.totalAmount);
    const usedAmount = Number.isFinite(Number(provider.usedAmount))
      ? Number(provider.usedAmount)
      : totalAmount - remainingAmount;
    if (usedPercent == null || !Number.isFinite(remainingAmount) || !Number.isFinite(totalAmount) || !Number.isFinite(usedAmount)) {
      hideProviderMeter(root, "Provider summary is missing quota values.");
      return;
    }

    const leftPercent = clampPercent(100 - usedPercent);
    const level = levelForLeftPercent(leftPercent, "provider");
    const name = String(provider.displayName || provider.id || "Provider").slice(0, 48);
    const text = `${name} Left ${leftPercent.toFixed(1)}% (${formatMoney(remainingAmount)} left)`;
    const width = `${leftPercent.toFixed(1)}%`;
    const title = formatProviderTitle(name, provider, usedAmount, remainingAmount, totalAmount, usedPercent, leftPercent);
    const providerId = String(provider.id || name || "__provider__");
    const currentUsed = Number(provider.used);

    if (Number.isFinite(currentUsed)) {
      const previousUsed = state.lastAnimatedProviderUsedById.get(providerId);
      if (Number.isFinite(previousUsed) && currentUsed > previousUsed && Number.isFinite(provider.total) && provider.total > 0) {
        const deltaAmount = (currentUsed - previousUsed) * (totalAmount / Number(provider.total));
        if (shouldShowProviderSpendEffect(providerId, currentUsed)) {
          recordSpend("provider", deltaAmount, providerId);
          showProviderSpendEffect(deltaAmount);
        }
      }
      state.lastAnimatedProviderUsedById.set(providerId, currentUsed);
    }

    if (card.dataset.known !== "true") card.dataset.known = "true";
    if (card.dataset.level !== level) card.dataset.level = level;
    if (card.title !== title) card.title = title;
    if (state.providerValue.textContent !== text) state.providerValue.textContent = text;
    if (state.providerFill.style.width !== width) state.providerFill.style.width = width;
    const providerRing = state.providerRing || card.querySelector(".ccm-ring");
    if (providerRing && !state.providerRing) state.providerRing = providerRing;
    if (providerRing) providerRing.style.setProperty("--ccm-ring-angle", `${leftPercent * 3.6}deg`);
    if (card.hidden) card.hidden = false;
    updateDockVisibility(root);
  }

  function readProviderSummary() {
    const summary = window[PROVIDER_SUMMARY_KEY];
    return summary && typeof summary === "object" ? summary : null;
  }

  // helper 通过 CDP 写入脱敏 summary；真实 token、用户 ID 和服务商地址不进入渲染页。
  function setProviderSummary(summary) {
    state.providerSummary = summary && typeof summary === "object" ? summary : null;
    if (state.providerSummary) {
      window[PROVIDER_SUMMARY_KEY] = state.providerSummary;
      if (state.providerSummary.ui && typeof state.providerSummary.ui === "object") {
        window[CONFIG_KEY] = normalizeUiConfig(state.providerSummary.ui);
      }
    }
    const root = state.root || document.getElementById(ROOT_ID);
    if (root) renderProviderMeter(root);
  }

  function installProviderSummaryListener() {
    if (state.providerSummaryListener) return;
    state.providerSummary = readProviderSummary();
    state.providerSummaryListener = (event) => {
      setProviderSummary(event && event.detail);
    };
    try {
      window.addEventListener(PROVIDER_SUMMARY_EVENT, state.providerSummaryListener);
    } catch {
    }
  }

  function makeReading(percent, source, raw, used, limit) {
    const safePercent = clampPercent(percent);
    if (safePercent == null) return null;

    return {
      percent: safePercent,
      source,
      raw: String(raw || "").slice(0, 240),
      used: Number.isFinite(used) ? used : null,
      limit: Number.isFinite(limit) ? limit : null,
      conversationId: null,
    };
  }

  function normalizeConversationId(value) {
    if (value == null) return null;
    if (typeof value !== "string" && typeof value !== "number") return null;

    const text = String(value).trim();
    if (!text) return null;

    const uuidMatch = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.exec(text);
    if (uuidMatch) return uuidMatch[0].toLowerCase();

    return text.replace(/^[a-z]+:/i, "").toLowerCase();
  }

  function normalizeConversationUuid(value) {
    if (value == null) return null;
    if (typeof value !== "string" && typeof value !== "number") return null;

    const match = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.exec(String(value));
    return match ? match[0].toLowerCase() : null;
  }

  function conversationIdsMatch(left, right) {
    const normalizedLeft = normalizeConversationId(left);
    const normalizedRight = normalizeConversationId(right);
    return !!normalizedLeft && !!normalizedRight && normalizedLeft === normalizedRight;
  }

  function withConversationId(reading, conversationId) {
    if (!reading) return null;

    const normalizedConversationId = normalizeConversationId(conversationId);
    if (normalizedConversationId) {
      reading.conversationId = normalizedConversationId;
    }

    return reading;
  }

  // React 私有 key 每次构建都会换后缀；按节点缓存 key 列表能避开冷启动时的大量 Reflect.ownKeys。
  function getReactPrivateKeys(node) {
    if (!node || (typeof node !== "object" && typeof node !== "function")) return [];

    const cached = state.reactPrivateKeyCache.get(node);
    if (cached) return cached;

    let keys = [];
    try {
      keys = Reflect.ownKeys(node).map(String).filter((key) => REACT_PRIVATE_KEY_RE.test(key));
    } catch {
      keys = [];
    }

    state.reactPrivateKeyCache.set(node, keys);
    return keys;
  }

  function getFilteredReflectKeys(value, cacheName, pattern, limit) {
    if (!value || (typeof value !== "object" && typeof value !== "function")) return [];

    let cache = state.filteredReflectKeyCache.get(value);
    if (!cache) {
      cache = {};
      state.filteredReflectKeyCache.set(value, cache);
    }

    if (cache[cacheName]) return cache[cacheName];

    let keys = [];
    try {
      keys = Reflect.ownKeys(value)
        .map(String)
        .filter((key) => pattern.test(key))
        .slice(0, limit);
    } catch {
      keys = [];
    }

    cache[cacheName] = keys;
    return keys;
  }

  // Codex 部分会话 ID 只存在于 React 写到 DOM 节点上的私有 props，普通 attribute 读不到。
  function getReactPropValue(node, propName) {
    if (!node) return null;

    for (const key of getReactPrivateKeys(node)) {
      if (!key.startsWith("__reactProps$")) continue;

      let props;
      try {
        props = node[key];
      } catch {
        continue;
      }

      if (props && props[propName] != null) {
        return props[propName];
      }
    }

    return null;
  }

  function getElementConversationId(element) {
    for (let node = element; node && node.nodeType === Node.ELEMENT_NODE; node = node.parentElement) {
      const attrValue =
        node.getAttribute("data-app-action-sidebar-thread-id") ||
        node.getAttribute("data-thread-id") ||
        node.getAttribute("data-conversation-id") ||
        getReactPropValue(node, "data-app-action-sidebar-thread-id") ||
        getReactPropValue(node, "data-thread-id") ||
        getReactPropValue(node, "data-conversation-id");
      const normalized = normalizeConversationId(attrValue);
      if (normalized) return normalized;
    }

    return null;
  }

  function getLikelyObjectConversationId(value, depth = 3, seen = new WeakSet()) {
    if (!value || typeof value !== "object") return null;
    if (depth < 0 || seen.has(value)) return null;
    seen.add(value);

    for (const key of CONVERSATION_ID_KEYS) {
      let candidate;
      try {
        candidate = value[key];
      } catch {
        continue;
      }

      const normalized = normalizeConversationUuid(candidate);
      if (normalized) return normalized;
    }

    const nested = [
      value.params,
      value.thread,
      value.conversation,
      value.props,
    ];
    for (const child of nested) {
      if (!child || typeof child !== "object") continue;
      const normalized = getLikelyObjectConversationId(child, depth - 1, seen);
      if (normalized) return normalized;
    }

    return null;
  }

  function readReactConversationIdFromValue(value, depth, seen) {
    if (!value || typeof value !== "object" || depth < 0) return null;
    if (seen.has(value)) return null;
    seen.add(value);

    const direct = getLikelyObjectConversationId(value);
    if (direct) return direct;

    if (value.nodeType === Node.ELEMENT_NODE) {
      const elementConversationId = getElementConversationId(value);
      if (elementConversationId) return elementConversationId;

      for (const key of getReactPrivateKeys(value)) {
        let child;
        try {
          child = value[key];
        } catch {
          continue;
        }

        const childConversationId = readReactConversationIdFromValue(child, depth - 1, seen);
        if (childConversationId) return childConversationId;
      }
    }

    if (Array.isArray(value)) {
      const limit = Math.min(value.length, 40);
      for (let index = 0; index < limit; index += 1) {
        const childConversationId = readReactConversationIdFromValue(value[index], depth - 1, seen);
        if (childConversationId) return childConversationId;
      }
      return null;
    }

    if (value instanceof Map) {
      let index = 0;
      for (const [mapKey, mapValue] of value) {
        if (index >= 40) break;

        const keyConversationId = normalizeConversationUuid(mapKey);
        if (keyConversationId) return keyConversationId;

        const mapKeyConversationId = readReactConversationIdFromValue(mapKey, depth - 1, seen);
        if (mapKeyConversationId) return mapKeyConversationId;

        const mapValueConversationId = readReactConversationIdFromValue(mapValue, depth - 1, seen);
        if (mapValueConversationId) return mapValueConversationId;

        index += 1;
      }
      return null;
    }

    const keys = getFilteredReflectKeys(value, "reactConversationId", CONVERSATION_REACT_KEY_RE, 120);
    for (const key of keys) {
      let child;
      try {
        child = value[key];
      } catch {
        continue;
      }

      if (CONVERSATION_ID_KEY_SET.has(key)) {
        const keyConversationId = normalizeConversationUuid(child);
        if (keyConversationId) return keyConversationId;
      }

      const childConversationId = readReactConversationIdFromValue(child, depth - 1, seen);
      if (childConversationId) return childConversationId;
    }

    return null;
  }

  function readActiveConversationIdFromReact() {
    const anchors = [
      document.querySelector("main"),
      document.querySelector(`[data-thread-find-target="conversation"]`),
      document.querySelector(THREAD_COMPOSER_SELECTOR),
      document.querySelector(CODEX_COMPOSER_SELECTOR),
      document.getElementById("root"),
    ].filter(Boolean);
    const seen = new WeakSet();

    for (const anchor of anchors) {
      const direct = getElementConversationId(anchor);
      if (direct) return direct;

      for (const key of getReactPrivateKeys(anchor)) {
        let value;
        try {
          value = anchor[key];
        } catch {
          continue;
        }

        const conversationId = readReactConversationIdFromValue(value, REACT_CONVERSATION_SCAN_DEPTH, seen);
        if (conversationId) return conversationId;
      }
    }

    return null;
  }

  function readActiveConversationId() {
    const now = Date.now();
    if (now - state.activeConversationIdLookupAt < ACTIVE_CONVERSATION_LOOKUP_CACHE_MS) {
      return state.cachedActiveConversationId;
    }

    // 当前会话 ID 主要挂在左侧会话列表的 current/selected/active 状态节点上。
    const selectors = [
      `[aria-current="page"][data-app-action-sidebar-thread-id]`,
      `[data-app-action-sidebar-thread-active="true"][data-app-action-sidebar-thread-id]`,
      `[aria-selected="true"][data-app-action-sidebar-thread-id]`,
      `[aria-current="page"]`,
      `[data-app-action-sidebar-thread-active="true"]`,
      `[aria-selected="true"]`,
    ];

    for (const selector of selectors) {
      const element = document.querySelector(selector);
      const conversationId = getElementConversationId(element);
      if (conversationId) {
        state.cachedActiveConversationId = conversationId;
        state.activeConversationIdLookupAt = now;
        return conversationId;
      }
    }

    const reactConversationId = readActiveConversationIdFromReact();
    if (reactConversationId) {
      state.cachedActiveConversationId = reactConversationId;
      state.activeConversationIdLookupAt = now;
      return reactConversationId;
    }

    state.cachedActiveConversationId = null;
    state.activeConversationIdLookupAt = now;
    return null;
  }

  function getObjectConversationId(value) {
    if (!value || typeof value !== "object") return null;

    const candidates = [
      value.conversationId,
      value.localConversationId,
      value.threadId,
      value.id,
      value.key,
      value.params && value.params.conversationId,
      value.params && value.params.localConversationId,
      value.params && value.params.threadId,
      value.thread && value.thread.id,
      value.thread && value.thread.threadId,
      value.conversation && value.conversation.id,
    ];

    for (const candidate of candidates) {
      const normalized = normalizeConversationId(candidate);
      if (normalized) return normalized;
    }

    return null;
  }

  function activateConversationId(activeConversationId, options = {}) {
    const normalizedConversationId = normalizeConversationId(activeConversationId);
    if (!normalizedConversationId) return false;

    if (normalizedConversationId !== state.activeConversationId) {
      clearRetryUpdate();
      window.clearTimeout(state.pendingUpdate);
      state.pendingUpdateDueAt = 0;
      state.activeConversationId = normalizedConversationId;
      state.cachedActiveConversationId = normalizedConversationId;
      state.activeConversationIdLookupAt = Date.now();
      state.lastReading = state.readingsByConversationId.get(normalizedConversationId) || null;
      state.lastScanAt = 0;
      state.lastScannedConversationId = null;
      state.expensiveFallbackScannedAt = 0;
      state.expensiveFallbackConversationId = null;
      state.inlineMountLookupAt = 0;
      state.navigationPendingUntil = options.pendingNavigation ? Date.now() + NAVIGATION_PENDING_MS : 0;
      state.switchRetryUntil = Date.now() + SWITCH_RETRY_WINDOW_MS;
      scheduleRetryUpdate();
      refreshOpenSpendHistory();
      return true;
    }

    return false;
  }

  // 只刷新会话指针，不触发“切换会话”副作用；用于侧栏隐藏或短暂缺失 active 节点的场景。
  function retainConversationId(conversationId) {
    const normalizedConversationId = normalizeConversationId(conversationId);
    if (!normalizedConversationId) return false;

    state.activeConversationId = normalizedConversationId;
    state.cachedActiveConversationId = normalizedConversationId;
    state.activeConversationIdLookupAt = Date.now();
    return true;
  }

  function updateActiveConversationId() {
    const activeConversationId = readActiveConversationId();
    if (activeConversationId) {
      if (
        state.activeConversationId &&
        !conversationIdsMatch(activeConversationId, state.activeConversationId) &&
        Date.now() < state.navigationPendingUntil
      ) {
        return state.activeConversationId;
      }

      activateConversationId(activeConversationId);
    } else if (hasThreadContentSurface() && state.activeConversationId) {
      // sidebar 隐藏时 active/current 节点会消失；主会话区仍在时沿用最后确认的会话 ID。
      retainConversationId(state.activeConversationId);
    } else if (hasThreadContentSurface() && state.lastReading && state.lastReading.conversationId) {
      retainConversationId(state.lastReading.conversationId);
    } else {
      state.activeConversationId = null;
      state.lastReading = null;
      state.cachedActiveConversationId = null;
      state.activeConversationIdLookupAt = Date.now();
      state.navigationPendingUntil = 0;
      state.switchRetryUntil = 0;
      clearRetryUpdate();
    }

    return state.activeConversationId;
  }

  function parseStatusContextUsageObject(value, source, conversationId) {
    if (!value || typeof value !== "object") return null;

    const modelContextWindow = firstFiniteNumber(value.modelContextWindow, value.model_context_window);
    const lastUsage = value.last || value.lastTokenUsage || value.last_token_usage;
    const totalTokens = firstFiniteNumber(
      lastUsage && lastUsage.totalTokens,
      lastUsage && lastUsage.total_tokens,
    );
    if (Number.isFinite(modelContextWindow) && modelContextWindow > 0 && Number.isFinite(totalTokens) && totalTokens >= 0) {
      const usedTokens = Math.min(totalTokens, modelContextWindow);
      return withConversationId(makeReading(
        (usedTokens / modelContextWindow) * 100,
        source,
        "status tokenUsage",
        usedTokens,
        modelContextWindow,
      ), conversationId);
    }

    const percent = Number(value.percent);
    const usedTokens = firstFiniteNumber(value.usedTokens, value.used_tokens);
    const contextWindow = firstFiniteNumber(value.contextWindow, value.context_window);

    if (Number.isFinite(usedTokens) && Number.isFinite(contextWindow) && contextWindow > 0) {
      return withConversationId(makeReading(
        (usedTokens / contextWindow) * 100,
        source,
        "status contextUsage",
        usedTokens,
        contextWindow,
      ), conversationId);
    }

    if (Number.isFinite(percent) && percent >= 0 && percent <= 100) {
      return withConversationId(makeReading(percent, source, "status contextUsage.percent"), conversationId);
    }

    return null;
  }

  function looksLikeStatusContextUsageObject(value) {
    if (!value || typeof value !== "object") return false;

    const modelContextWindow = firstFiniteNumber(value.modelContextWindow, value.model_context_window);
    const lastUsage = value.last || value.lastTokenUsage || value.last_token_usage;
    const totalTokens = firstFiniteNumber(
      lastUsage && lastUsage.totalTokens,
      lastUsage && lastUsage.total_tokens,
    );
    if (Number.isFinite(modelContextWindow) && modelContextWindow > 0 && Number.isFinite(totalTokens) && totalTokens >= 0) {
      return true;
    }

    const usedTokens = firstFiniteNumber(value.usedTokens, value.used_tokens);
    const contextWindow = firstFiniteNumber(value.contextWindow, value.context_window);
    return Number.isFinite(usedTokens) && usedTokens >= 0 && Number.isFinite(contextWindow) && contextWindow > 0;
  }

  function firstFiniteNumber(...values) {
    for (const value of values) {
      const number = Number(value);
      if (Number.isFinite(number)) return number;
    }

    return null;
  }

  // 反向遍历 React / window 状态树时，Map key 或父对象常常比叶子值更像会话归属来源。
  function findStatusContextUsageObject(value, depth, seen, activeConversationId, ownerConversationId) {
    if (!value || typeof value !== "object" || depth < 0) return null;
    if (seen.has(value)) return null;
    seen.add(value);

    const valueConversationId = getObjectConversationId(value);
    const nextOwnerConversationId = valueConversationId || ownerConversationId;
    const ownerMatchesActive =
      !activeConversationId ||
      conversationIdsMatch(activeConversationId, nextOwnerConversationId) ||
      conversationIdsMatch(activeConversationId, ownerConversationId);

    if (ownerMatchesActive) {
      const direct = parseStatusContextUsageObject(value, "status-react", nextOwnerConversationId);
      if (direct) return direct;
    }

    if (Array.isArray(value)) {
      const limit = Math.min(value.length, 120);
      for (let index = 0; index < limit; index += 1) {
        const reading = findStatusContextUsageObject(
          value[index],
          depth - 1,
          seen,
          activeConversationId,
          nextOwnerConversationId,
        );
        if (reading) return reading;
      }
      return null;
    }

    if (value instanceof Map) {
      let index = 0;
      for (const [mapKey, mapValue] of value) {
        if (index >= 120) break;

        const mapKeyConversationId = normalizeConversationId(mapKey);
        const childOwnerConversationId = mapKeyConversationId || nextOwnerConversationId;

        const keyReading = findStatusContextUsageObject(
          mapKey,
          depth - 1,
          seen,
          activeConversationId,
          childOwnerConversationId,
        );
        if (keyReading) return keyReading;

        const valueReading = findStatusContextUsageObject(
          mapValue,
          depth - 1,
          seen,
          activeConversationId,
          childOwnerConversationId,
        );
        if (valueReading) return valueReading;

        index += 1;
      }
      return null;
    }

    if (value instanceof Set) {
      let index = 0;
      for (const setValue of value) {
        if (index >= 120) break;

        const reading = findStatusContextUsageObject(
          setValue,
          depth - 1,
          seen,
          activeConversationId,
          nextOwnerConversationId,
        );
        if (reading) return reading;

        index += 1;
      }
      return null;
    }

    const keys = getFilteredReflectKeys(value, "statusTree", STATUS_TREE_KEY_RE, 120);
    const keySet = new Set(keys);

    for (const key of PREFERRED_STATUS_KEYS) {
      if (!keySet.has(key)) continue;

      let child;
      try {
        child = value[key];
      } catch {
        continue;
      }

      const reading = findStatusContextUsageObject(
        child,
        depth - 1,
        seen,
        activeConversationId,
        nextOwnerConversationId,
      );
      if (reading) return reading;
    }

    for (const key of keys) {
      if (PREFERRED_STATUS_KEY_SET.has(key)) continue;

      let child;
      try {
        child = value[key];
      } catch {
        continue;
      }

      const keyConversationId = normalizeConversationId(key);
      const childOwnerConversationId = keyConversationId || nextOwnerConversationId;
      const reading = findStatusContextUsageObject(
        child,
        depth - 1,
        seen,
        activeConversationId,
        childOwnerConversationId,
      );
      if (reading) return reading;
    }

    return null;
  }

  // React 私有字段是从界面节点回溯运行态状态的桥；升级后若读不到值，优先检查 __react* 键。
  function scanStatusReactContextUsage(activeConversationId) {
    const nodes = [
      document.getElementById("root"),
      document.querySelector(`[aria-current="page"]`),
      document.querySelector(`[data-app-action-sidebar-thread-active="true"]`),
      document.body,
      document.documentElement,
    ].filter(Boolean);
    const limit = nodes.length;

    for (let index = 0; index < limit; index += 1) {
      const node = nodes[index];
      const keys = getReactPrivateKeys(node);

      for (const key of keys) {
        let value;
        try {
          value = node[key];
        } catch {
          continue;
        }

        const reading = findStatusContextUsageObject(value, 10, new WeakSet(), activeConversationId, null);
        if (reading) return reading;
      }
    }

    return null;
  }

  function isAppSignalScope(value) {
    return !!(
      value &&
      typeof value === "object" &&
      typeof value.get === "function" &&
      typeof value.watch === "function" &&
      value.node &&
      value.chain
    );
  }

  // app signal scope 没有稳定全局入口，只能从 React fiber 链里按结构特征反查。
  function findAppSignalScopeInValue(value, depth, seen) {
    if (!value || typeof value !== "object" || depth < 0) return null;
    if (seen.has(value)) return null;
    if (state.appSignalSkipGeneration.get(value) === state.scanGeneration) return null;
    seen.add(value);

    if (isAppSignalScope(value)) return value;

    if (Array.isArray(value)) {
      const limit = Math.min(value.length, 40);
      for (let index = 0; index < limit; index += 1) {
        const scope = findAppSignalScopeInValue(value[index], depth - 1, seen);
        if (scope) return scope;
      }
      return null;
    }

    if (value instanceof Map) {
      let index = 0;
      for (const [mapKey, mapValue] of value) {
        if (index >= 30) break;

        const keyScope = findAppSignalScopeInValue(mapKey, depth - 1, seen);
        if (keyScope) return keyScope;

        const valueScope = findAppSignalScopeInValue(mapValue, depth - 1, seen);
        if (valueScope) return valueScope;

        index += 1;
      }
    }

    const keys = getFilteredReflectKeys(value, "appSignalScope", APP_SIGNAL_SCOPE_KEY_RE, 120);

    for (const key of keys) {
      let child;
      try {
        child = value[key];
      } catch {
        continue;
      }

      const scope = findAppSignalScopeInValue(child, depth - 1, seen);
      if (scope) return scope;
    }

    state.appSignalSkipGeneration.set(value, state.scanGeneration);
    return null;
  }

  function findAppSignalScope() {
    if (isAppSignalScope(state.appSignalScope)) return state.appSignalScope;

    const now = Date.now();
    if (now - state.appSignalLastLookupAt < 2000) return null;
    state.appSignalLastLookupAt = now;

    // app signal scope 挂在 React 树里；只扫稳定锚点，避免初始化时遍历整页 DOM。
    const root = document.getElementById("root");
    const current = document.querySelector(`[aria-current="page"]`);
    const activeThread = document.querySelector(`[data-app-action-sidebar-thread-active="true"]`);
    const nodes = [
      root,
      current,
      activeThread,
      current && current.closest("[data-app-action-sidebar-thread-id]"),
      activeThread && activeThread.closest("[data-app-action-sidebar-thread-id]"),
      document.body,
      document.documentElement,
      ...(root
        ? Array.from(root.querySelectorAll(REACT_STATE_HOST_SELECTOR)).slice(0, REACT_HOST_SCAN_LIMIT)
        : []),
    ].filter(Boolean);

    const seen = new WeakSet();
    for (const node of nodes) {
      const keys = getReactPrivateKeys(node);
      for (const key of keys) {
        let value;
        try {
          value = node[key];
        } catch {
          continue;
        }

        const scope = findAppSignalScopeInValue(value, 18, seen);
        if (scope) {
          state.appSignalScope = scope;
          return scope;
        }
      }
    }

    return null;
  }

  // hashed asset 文件名会随版本变化；先从已加载资源定位，fallback 只保留当前版本的相对路径。
  function findLoadedAssetUrl(fragment, fallbackPath) {
    const selectors = [
      `script[src*="${fragment}"]`,
      `link[href*="${fragment}"]`,
    ];

    for (const selector of selectors) {
      const element = document.querySelector(selector);
      const value = element && (element.src || element.href);
      if (value) return value;
    }

    const resources =
      typeof performance !== "undefined" && typeof performance.getEntriesByType === "function"
        ? performance.getEntriesByType("resource")
        : [];
    for (const resource of resources) {
      if (resource && typeof resource.name === "string" && resource.name.includes(fragment)) {
        return resource.name;
      }
    }

    const links = document.querySelectorAll(`link[rel="modulepreload"][href*="${fragment}"]`);
    for (const link of links) {
      const value = link && link.href;
      if (value) return value;
    }

    return new URL(fallbackPath, location.href).href;
  }

  // 优先读取 Status 使用的 app signal；bundle hash 或导出名变化时，先更新这两个资产入口。
  function ensureAppSignalModules() {
    if (state.appSignalModules) return state.appSignalModules;
    if (state.appSignalModulesPromise) return null;
    state.appSignalModulesRequestedAt = Date.now();

    const appServerUrl = findLoadedAssetUrl(
      "app-server-manager-signals",
      "./assets/app-server-manager-signals-7MlBpIlX.js",
    );
    const signalUrl = findLoadedAssetUrl(
      "setting-storage",
      "./assets/setting-storage-kJblH-wH.js",
    );

    state.appSignalModulesPromise = Promise.all([
      import(appServerUrl),
      import(signalUrl),
    ])
      .then(([appServerSignals, signalStorage]) => {
        state.appSignalModules = { appServerSignals, signalStorage };
        scheduleUpdate();
        return state.appSignalModules;
      })
      .catch(() => {
        state.appSignalModulesPromise = null;
        return null;
      });

    return null;
  }

  // setting-storage 的 rt helper 会解开嵌套 signal；缺失时退回 scope.get 的两段读取。
  function readSignalValue(scope, selector, argument) {
    if (!scope || !selector) return null;

    const modules = state.appSignalModules;
    const readHelper = modules && modules.signalStorage && modules.signalStorage.rt;
    if (typeof readHelper === "function") {
      try {
        return readHelper(scope, selector, argument);
      } catch {
        return null;
      }
    }

    try {
      const nestedSignal = scope.get(selector, argument);
      if (nestedSignal && typeof nestedSignal === "object") {
        return scope.get(nestedSignal);
      }
    } catch {
      return null;
    }

    return null;
  }

  function findTokenUsageSelector(scope, conversationId) {
    if (!scope || !conversationId) return null;

    if (state.appSignalTokenUsageSelector) return state.appSignalTokenUsageSelector;

    const now = Date.now();
    if (now - state.appSignalTokenUsageSelectorLookupAt < APP_SIGNAL_SELECTOR_SCAN_INTERVAL_MS) {
      return null;
    }
    state.appSignalTokenUsageSelectorLookupAt = now;

    const modules = state.appSignalModules;
    const appServerSignals = modules && modules.appServerSignals;
    if (!appServerSignals || typeof appServerSignals !== "object") return null;

    let scanned = 0;
    for (const [exportName, selector] of Object.entries(appServerSignals)) {
      if (!selector || (typeof selector !== "object" && typeof selector !== "function")) continue;
      scanned += 1;
      if (scanned > APP_SIGNAL_SELECTOR_SCAN_LIMIT) break;

      const value = readSignalValue(scope, selector, conversationId);
      if (!looksLikeStatusContextUsageObject(value)) continue;

      state.appSignalTokenUsageSelector = selector;
      state.appSignalTokenUsageSelectorExport = exportName;
      return selector;
    }

    return null;
  }

  function scanAppSignalContextUsage(activeConversationId) {
    const now = Date.now();
    const requestedConversationId = normalizeConversationId(activeConversationId);
    if (
      state.appSignalCachedReading &&
      requestedConversationId &&
      conversationIdsMatch(requestedConversationId, state.appSignalCachedConversationId) &&
      now - state.appSignalCachedAt < APP_SIGNAL_READING_CACHE_MS
    ) {
      return state.appSignalCachedReading;
    }

    const modules = ensureAppSignalModules();
    if (!modules || !modules.appServerSignals) {
      state.waitingForAppSignalModules = !!state.appSignalModulesPromise;
      return null;
    }
    state.waitingForAppSignalModules = false;

    const scope = findAppSignalScope();
    if (!scope) return null;

    const conversationId =
      normalizeConversationId(activeConversationId) ||
      normalizeConversationId(scope.value && scope.value.conversationId);
    if (!conversationId) return null;

    const latestTokenUsageSelector = findTokenUsageSelector(scope, conversationId);
    const tokenUsage = readSignalValue(scope, latestTokenUsageSelector, conversationId);
    const reading = parseStatusContextUsageObject(tokenUsage, "app-signal", conversationId);
    if (reading) {
      state.appSignalCachedReading = reading;
      state.appSignalCachedConversationId = conversationId;
      state.appSignalCachedAt = now;
      state.appSignalLastSuccessAt = now;
      return reading;
    }

    return null;
  }

  function collectContextUsageSampleConversationIds(activeConversationId) {
    const ids = [];
    const add = (conversationId) => {
      const normalizedConversationId = normalizeConversationId(conversationId);
      if (!normalizedConversationId || ids.includes(normalizedConversationId)) return;
      ids.push(normalizedConversationId);
    };

    add(activeConversationId);
    for (const element of document.querySelectorAll("[data-app-action-sidebar-thread-id]")) {
      add(getElementConversationId(element));
      if (ids.length >= CONTEXT_USAGE_BACKGROUND_SAMPLE_MAX_CONVERSATIONS) return ids;
    }
    for (const conversationId of state.readingsByConversationId.keys()) add(conversationId);
    for (const conversationId of state.lastAnimatedUsedByConversationId.keys()) add(conversationId);

    return ids.slice(0, CONTEXT_USAGE_BACKGROUND_SAMPLE_MAX_CONVERSATIONS);
  }

  function rememberContextUsageReading(reading, fallbackConversationId) {
    const conversationId = normalizeConversationId(reading && (reading.conversationId || fallbackConversationId));
    if (!conversationId || !reading) return null;

    reading.conversationId = conversationId;
    state.readingsByConversationId.set(conversationId, reading);
    return conversationId;
  }

  function recordContextUsageDelta(reading, fallbackConversationId, options = {}) {
    const conversationId = rememberContextUsageReading(reading, fallbackConversationId);
    if (!conversationId || !Number.isFinite(reading.used)) return null;

    const previousUsed = state.lastAnimatedUsedByConversationId.get(conversationId);
    if (Number.isFinite(previousUsed) && reading.used > previousUsed) {
      const deltaTokens = reading.used - previousUsed;
      if (shouldShowContextSpendEffect(conversationId, reading.used)) {
        recordSpend("context", deltaTokens, conversationId);
        if (options.showEffect !== false) showTokenSpendEffect(deltaTokens);
      }
    }
    state.lastAnimatedUsedByConversationId.set(conversationId, reading.used);
    return conversationId;
  }

  // 已知/侧栏可见会话的 app-signal 读数可按会话 ID 查询；每 5 秒顺手刷新一次，避免只记录当前可见会话。
  function sampleKnownConversationContextUsage(activeConversationId) {
    const now = Date.now();
    if (now - state.contextUsageBackgroundSampleAt < CONTEXT_USAGE_BACKGROUND_SAMPLE_INTERVAL_MS) return;

    const conversationIds = collectContextUsageSampleConversationIds(activeConversationId);
    state.contextUsageBackgroundSampleAt = now;
    state.contextUsageBackgroundSampleConversationIds = conversationIds;
    if (!conversationIds.length) return;

    for (const conversationId of conversationIds) {
      if (conversationIdsMatch(conversationId, activeConversationId)) continue;

      const reading = scanAppSignalContextUsage(conversationId);
      if (!reading) continue;
      recordContextUsageDelta(reading, conversationId, { showEffect: false });
    }
  }

  function shouldWaitForAppSignalModules(now) {
    return !!(
      state.appSignalModulesPromise &&
      !state.appSignalModules &&
      now - state.appSignalModulesRequestedAt < APP_SIGNAL_IMPORT_GRACE_MS
    );
  }

  function isVisibleElement(element) {
    if (!element || element.nodeType !== Node.ELEMENT_NODE) return false;

    const rect = element.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return false;

    const style = getComputedStyle(element);
    return style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity || "1") > 0;
  }

  function isConversationContent(element) {
    return !!(element && element.closest(CONVERSATION_CONTENT_SELECTOR));
  }

  function shouldIgnoreMutationTarget(element) {
    if (!element || element.nodeType !== Node.ELEMENT_NODE) return false;
    if (element.closest(`#${ROOT_ID}`)) return true;
    if (element.closest(`#${HISTORY_PORTAL_ID}`)) return true;
    return !!element.closest(MESSAGE_MUTATION_SELECTOR);
  }

  // 这里直接找结构化 usage 对象，比把 window 状态拼成文本再正则解析更便宜。
  function scanWindowForContextUsage(activeConversationId) {
    const seen = new WeakSet();
    const now = Date.now();
    if (!state.windowUsageKeys || now - state.windowUsageKeysAt > WINDOW_KEY_CACHE_MS) {
      state.windowUsageKeys = Object.keys(window).filter((key) =>
        /codex|thread|token|usage|context|store|query|cache|notification|message/i.test(key),
      );
      state.windowUsageKeysAt = now;
    }

    for (const key of state.windowUsageKeys) {
      let value;
      try {
        value = window[key];
      } catch {
        continue;
      }

      const reading = findStatusContextUsageObject(value, 6, seen, activeConversationId, null);
      if (reading) return reading;
    }

    return null;
  }

  // 读取顺序按稳定性排列：app signal > 结构化 React 状态 > window 缓存。
  function detectReading() {
    state.scanGeneration += 1;
    const activeConversationId = updateActiveConversationId();

    if (!activeConversationId) {
      const appSignalReading = scanAppSignalContextUsage(null);
      if (appSignalReading && appSignalReading.conversationId) {
        retainConversationId(appSignalReading.conversationId);
        state.switchRetryUntil = 0;
        clearRetryUpdate();
        return appSignalReading;
      }

      return null;
    }

    const cachedReading = state.readingsByConversationId.get(activeConversationId) || null;
    const fallbackReading =
      state.lastReading && state.lastReading.conversationId && conversationIdsMatch(activeConversationId, state.lastReading.conversationId)
        ? state.lastReading
        : cachedReading;

    const now = Date.now();
    const activeChangedSinceScan = activeConversationId !== state.lastScannedConversationId;
    const inSwitchRetryWindow = !!activeConversationId && now < state.switchRetryUntil;

    const shouldRunStatusScan =
      activeChangedSinceScan ||
      inSwitchRetryWindow ||
      now - state.lastScanAt >= SLOW_SCAN_INTERVAL_MS;
    const appSignalReading = scanAppSignalContextUsage(activeConversationId);
    if (appSignalReading && !shouldRunStatusScan) {
      state.switchRetryUntil = 0;
      clearRetryUpdate();
      return appSignalReading;
    }

    if (!shouldRunStatusScan) {
      if (shouldWaitForAppSignalModules(now)) {
        scheduleUpdate(APP_SIGNAL_IMPORT_GRACE_MS);
        return state.lastReading;
      }
      return fallbackReading;
    }

    // 会话切换初期允许快速兜底；同一会话内的昂贵扫描按窗口限频。
    const canRunExpensiveFallback =
      activeChangedSinceScan ||
      !conversationIdsMatch(activeConversationId, state.expensiveFallbackConversationId) ||
      now - state.expensiveFallbackScannedAt >= EXPENSIVE_FALLBACK_INTERVAL_MS;

    state.lastScannedConversationId = activeConversationId;
    state.lastScanAt = now;

    const statusReactReading = scanStatusReactContextUsage(activeConversationId);
    if (statusReactReading) {
      state.switchRetryUntil = 0;
      clearRetryUpdate();
      return statusReactReading;
    }

    if (canRunExpensiveFallback) {
      state.expensiveFallbackScannedAt = now;
      state.expensiveFallbackConversationId = activeConversationId;

      // fallback 只保留结构化对象，避免按页面文案猜测。
      const windowReading = scanWindowForContextUsage(activeConversationId);
      if (windowReading) {
        state.switchRetryUntil = 0;
        clearRetryUpdate();
        return windowReading;
      }
    }

    if (appSignalReading) {
      state.switchRetryUntil = 0;
      clearRetryUpdate();
      return appSignalReading;
    }

    if (shouldWaitForAppSignalModules(now)) {
      scheduleUpdate(APP_SIGNAL_IMPORT_GRACE_MS);
      return state.lastReading;
    }

    if (inSwitchRetryWindow) {
      scheduleRetryUpdate();
    } else {
      clearRetryUpdate();
    }

    if (fallbackReading) return fallbackReading;

    return null;
  }

  function rememberReading(reading, fallbackConversationId) {
    if (!reading) return;

    rememberContextUsageReading(reading, fallbackConversationId);
    state.lastReading = reading;
  }

  function updateMeter() {
    installStyle();

    if (!document.body) return;

    const root = ensureRoot();
    state.uiConfig = readUiConfig();
    const contextCard = state.contextCard;
    const value = state.value;
    const fill = state.fill;
    const compressionZone = state.compressionZone;
    const reading = detectReading();
    const activeConversationId = state.activeConversationId || readActiveConversationId();

    if (!contextCard || !value || !fill) return;

    if (!hasThreadContentSurface()) {
      state.lastReading = null;
      hideProviderMeter(root, "No thread content is open in the main view.");
      hideMeter(root, contextCard, value, fill, "No thread content is open in the main view.");
      return;
    }
    renderProviderMeter(root);

    if (!reading) {
      if (state.waitingForAppSignalModules) {
        scheduleUpdate(APP_SIGNAL_IMPORT_GRACE_MS);
        if (contextCard.dataset.known === "true" && value.textContent !== "Context Left --") return;
        hideMeter(root, contextCard, value, fill, "Waiting for Codex context usage signal.");
        return;
      }

      const title = activeConversationId
        ? `No context usage value is exposed for conversation ${activeConversationId} in the current page state yet.`
        : "No context usage value is exposed in the current page state yet.";
      hideMeter(root, contextCard, value, fill, title);
      return;
    }

    rememberReading(reading, activeConversationId);

    const leftPercent = clampPercent(100 - reading.percent);
    const showUsedInsteadOfLeft = shouldShowUsedInsteadOfLeft(state.uiConfig);
    const displayPercent = showUsedInsteadOfLeft ? clampPercent(reading.percent) : leftPercent;
    const percentText = displayPercent.toFixed(1);
    const details =
      reading.used != null && reading.limit != null
        ? ` ${compactNumber(reading.used)} / ${compactNumber(reading.limit)}`
        : "";
    const readingConversationId = normalizeConversationId(
      reading.conversationId || activeConversationId || "__unknown__"
    );

    recordContextUsageDelta(reading, readingConversationId, { showEffect: true });
    sampleKnownConversationContextUsage(readingConversationId);

    const level = levelForLeftPercent(leftPercent, "context");
    const compressionWarning = shouldShowCompressionWarning(leftPercent) ? "true" : "false";
    const remainingTokens = reading.used != null && reading.limit != null ? Math.max(0, reading.limit - reading.used) : null;
    const title = formatContextTitle(reading, reading.used, remainingTokens, leftPercent, reading.percent);
    const text = showUsedInsteadOfLeft
      ? `Context Used ${percentText}%${details}`
      : Number.isFinite(remainingTokens)
        ? `Context Left ${percentText}% (${compactNumber(remainingTokens)} left)`
        : `Context Left ${percentText}%${details}`;
    const width = `${displayPercent.toFixed(1)}%`;
    const compressionZoneWidth = `${state.uiConfig.context.compressionWarningLeftPercent.toFixed(1)}%`;

    if (contextCard.dataset.known !== "true") contextCard.dataset.known = "true";
    if (contextCard.hidden) contextCard.hidden = false;
    if (contextCard.dataset.level !== level) contextCard.dataset.level = level;
    const showUsedInsteadOfLeftValue = showUsedInsteadOfLeft ? "true" : "false";
    if (contextCard.dataset.showUsedInsteadOfLeft !== showUsedInsteadOfLeftValue) {
      contextCard.dataset.showUsedInsteadOfLeft = showUsedInsteadOfLeftValue;
    }
    if (contextCard.dataset.compressionWarning !== compressionWarning) {
      contextCard.dataset.compressionWarning = compressionWarning;
    }
    if (contextCard.title !== title) contextCard.title = title;
    if (value.textContent !== text) value.textContent = text;
    if (fill.style.width !== width) fill.style.width = width;
    const contextRing = state.contextRing;
    if (contextRing) contextRing.style.setProperty("--ccm-ring-angle", `${displayPercent * 3.6}deg`);
    if (compressionZone && compressionZone.style.width !== compressionZoneWidth) {
      compressionZone.style.width = compressionZoneWidth;
    }
    updateDockVisibility(root);
  }

  function scheduleUpdate(delayMs = MUTATION_UPDATE_DELAY_MS) {
    const delay = Math.max(0, Number(delayMs) || 0);
    const dueAt = Date.now() + delay;
    if (state.pendingUpdate && state.pendingUpdateDueAt <= dueAt) return;

    window.clearTimeout(state.pendingUpdate);
    state.pendingUpdateDueAt = dueAt;
    state.pendingUpdate = window.setTimeout(() => {
      state.pendingUpdate = 0;
      state.pendingUpdateDueAt = 0;
      updateMeter();
    }, delay);
  }

  // 提前捕获侧栏会话切换，避免 DOM/状态更新滞后时短暂沿用旧会话读数。
  function handlePotentialNavigation(event) {
    const target = event.target && event.target.closest
      ? event.target.closest("[data-app-action-sidebar-thread-id]")
      : null;
    const conversationId = getElementConversationId(target);
    if (!conversationId) return;

    activateConversationId(conversationId, { pendingNavigation: true });
    scheduleUpdate(NAVIGATION_UPDATE_DELAY_MS);
  }

  function clearRetryUpdate() {
    window.clearTimeout(state.retryTimer);
    state.retryTimer = 0;
  }

  function scheduleRetryUpdate() {
    if (state.retryTimer || Date.now() >= state.switchRetryUntil) return;

    state.retryTimer = window.setTimeout(() => {
      state.retryTimer = 0;
      updateMeter();
    }, SWITCH_RETRY_INTERVAL_MS);
  }

  function restoreLegacyCaptureHooks() {
    const captureState = window.__codexContextMeterCaptureState;
    if (!captureState || typeof captureState !== "object") return;

    if (captureState.nativeFetch && window.fetch !== captureState.nativeFetch) {
      window.fetch = captureState.nativeFetch;
    }
    if (captureState.NativeWebSocket && window.WebSocket !== captureState.NativeWebSocket) {
      window.WebSocket = captureState.NativeWebSocket;
    }
    if (captureState.messageListener) {
      window.removeEventListener("message", captureState.messageListener, true);
    }

    delete window.__codexContextMeterCaptureState;
    delete window.__codexContextMeterFetchPatched;
    delete window.__codexContextMeterWebSocketPatched;
    delete window.__codexContextMeterPostMessagePatched;
  }

  function installObserver() {
    if (state.observer) return;

    state.navigationListener = handlePotentialNavigation;
    document.addEventListener("pointerdown", state.navigationListener, true);
    document.addEventListener("click", state.navigationListener, true);
    document.addEventListener("keydown", state.navigationListener, true);

    state.observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        const target = mutation.target && mutation.target.nodeType === Node.ELEMENT_NODE
          ? mutation.target
          : mutation.target && mutation.target.parentElement;
        if (shouldIgnoreMutationTarget(target)) continue;

        invalidateThreadContentCache();
        scheduleUpdate(MUTATION_UPDATE_DELAY_MS);
        return;
      }
    });
    state.observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: [
        // 会话切换只依赖侧栏 active/current/id 相关属性；Codex 改名时同步这组属性。
        "aria-current",
        "aria-selected",
        "data-app-action-sidebar-thread-active",
        "data-app-action-sidebar-thread-id",
      ],
      childList: true,
      subtree: true,
    });
  }

  window[API_KEY] = {
    version: SCRIPT_VERSION,
    refresh: updateMeter,
    setProviderSummary,
    destroy() {
      window.clearInterval(state.timer);
      window.clearTimeout(state.pendingUpdate);
      window.clearTimeout(state.historyCloseTimer);
      state.pendingUpdateDueAt = 0;
      state.historyCloseTimer = 0;
      if (state.historyHoverCleanup) {
        state.historyHoverCleanup();
        state.historyHoverCleanup = null;
      }
      if (state.floatingPointerCleanup) {
        state.floatingPointerCleanup();
        state.floatingPointerCleanup = null;
      }
      closeContextMenu();
      clearSpendEffects();
      clearRetryUpdate();
      if (state.observer) state.observer.disconnect();
      if (state.navigationListener) {
        document.removeEventListener("pointerdown", state.navigationListener, true);
        document.removeEventListener("click", state.navigationListener, true);
        document.removeEventListener("keydown", state.navigationListener, true);
      }
      if (state.providerSummaryListener) {
        window.removeEventListener(PROVIDER_SUMMARY_EVENT, state.providerSummaryListener);
        state.providerSummaryListener = null;
      }

      const root = document.getElementById(ROOT_ID);
      if (root) root.remove();

      const portal = document.getElementById(HISTORY_PORTAL_ID);
      if (portal) portal.remove();

      const style = document.getElementById(STYLE_ID);
      if (style) style.remove();

      delete window[INSTALL_KEY];
      delete window[API_KEY];
    },
    getState() {
      return {
        activeConversationId: state.activeConversationId,
        lastReading: state.lastReading,
        cachedConversationIds: Array.from(state.readingsByConversationId.keys()),
        animatedConversationIds: Array.from(state.lastAnimatedUsedByConversationId.keys()),
        backgroundSampledConversationIds: state.contextUsageBackgroundSampleConversationIds.slice(),
        backgroundSampledAt: state.contextUsageBackgroundSampleAt,
        hasAppSignalScope: isAppSignalScope(state.appSignalScope),
        hasAppSignalModules: !!state.appSignalModules,
        appSignalTokenUsageSelectorExport: state.appSignalTokenUsageSelectorExport,
        providerSummary: state.providerSummary,
      };
    },
  };

  restoreLegacyCaptureHooks();
  installStyle();
  installProviderSummaryListener();
  updateMeter();
  installObserver();
  state.timer = window.setInterval(updateMeter, UPDATE_INTERVAL_MS);
})();

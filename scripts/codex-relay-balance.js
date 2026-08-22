// ==UserScript==
// @name         Codex Relay Balance
// @namespace    codex-plus-plus
// @version      0.3.3
// @description  通用中转站余额与模型用量监控，支持手动配置接口、日期范围、Token 明细和实际扣费倍率。
// @match        app://-/*
// @run-at       document-start
// ==/UserScript==

(() => {
  "use strict";

  const VERSION = "0.3.3";
  const API_KEY = "__codexRelayBalanceScript";
  const ROOT_ID = "codex-relay-balance-script";
  const PANEL_ID = "codex-relay-balance-panel";
  const STYLE_ID = "codex-relay-balance-script-style";
  const POSITION_GAP_PX = 8;
  const FALLBACK_RIGHT_PX = 12;
  const PANEL_GAP_PX = 8;
  const PANEL_MARGIN_PX = 12;
  const CONFIG_STORAGE_KEY = "codex-relay-balance-config-v1";
  const DEFAULT_TIMEZONE = (() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
    } catch (_) {
      return "UTC";
    }
  })();
  const DEFAULT_CONFIG = Object.freeze({
    manualEnabled: false,
    endpoint: "",
    apiKey: "",
    usagePath: "/v1/usage",
    timezone: DEFAULT_TIMEZONE,
    refreshMinutes: 5,
  });

  function clampNumber(value, min, max, fallback) {
    const number = Number(value);
    return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
  }

  function normalizeUsagePath(value) {
    const path = safeText(value) || DEFAULT_CONFIG.usagePath;
    if (/^https?:\/\//i.test(path)) return path;
    return `/${path.replace(/^\/+/, "")}`;
  }

  function isValidTimezone(value) {
    try {
      Intl.DateTimeFormat("en-US", { timeZone: value }).format();
      return true;
    } catch (_) {
      return false;
    }
  }

  function normalizeConfig(value) {
    const source = value && typeof value === "object" ? value : {};
    return {
      manualEnabled: source.manualEnabled === true,
      endpoint: safeText(source.endpoint),
      apiKey: safeText(source.apiKey),
      usagePath: normalizeUsagePath(source.usagePath),
      timezone: isValidTimezone(safeText(source.timezone)) ? safeText(source.timezone) : DEFAULT_TIMEZONE,
      refreshMinutes: clampNumber(source.refreshMinutes, 1, 60, DEFAULT_CONFIG.refreshMinutes),
    };
  }

  function loadConfig() {
    try {
      return normalizeConfig(JSON.parse(window.localStorage?.getItem(CONFIG_STORAGE_KEY) || "{}"));
    } catch (_) {
      return normalizeConfig(DEFAULT_CONFIG);
    }
  }

  function saveConfig(value) {
    const next = normalizeConfig(value);
    try {
      window.localStorage?.setItem(CONFIG_STORAGE_KEY, JSON.stringify(next));
    } catch (_) {
      // Storage may be unavailable in restricted webviews; the current session still works.
    }
    return next;
  }

  let config = loadConfig();

  const previous = window[API_KEY];
  if (previous?.version === VERSION && typeof previous.ensure === "function") {
    previous.ensure();
    return;
  }
  previous?.destroy?.();

  let root = null;
  let panel = null;
  let refreshTimer = null;
  let positionTimer = null;
  let observer = null;
  let destroyed = false;
  let requestPromise = null;
  let modelRequestPromise = null;
  let modelRequestSeq = 0;
  let state = {
    status: "disabled",
    balance: null,
    unit: "USD",
    planName: "",
    message: "",
    panelOpen: false,
    period: "today",
    customStartDate: "",
    customEndDate: "",
    view: "usage",
    settingsError: "",
    settingsMessage: "",
    modelsStatus: "idle",
    models: [],
    modelsKey: "",
    modelsError: "",
    modelsUpdatedAt: 0,
  };

  function safeText(value) {
    return String(value == null ? "" : value).trim();
  }

  function visibleRect(node) {
    const rect = node?.getBoundingClientRect?.();
    return rect && rect.width > 0 && rect.height > 0 ? rect : null;
  }

  function dateString(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function offsetDateString(days) {
    const date = new Date();
    date.setHours(12, 0, 0, 0);
    date.setDate(date.getDate() + days);
    return dateString(date);
  }

  function selectedRange() {
    const today = dateString(new Date());
    let startDate = today;
    let endDate = today;
    let valid = true;
    if (state.period === "yesterday") {
      startDate = offsetDateString(-1);
      endDate = startDate;
    }
    if (state.period === "date") {
      const rawStart = /^\d{4}-\d{2}-\d{2}$/.test(state.customStartDate) ? state.customStartDate : today;
      const rawEnd = /^\d{4}-\d{2}-\d{2}$/.test(state.customEndDate) ? state.customEndDate : today;
      startDate = rawStart > today ? today : rawStart;
      endDate = rawEnd > today ? today : rawEnd;
      valid = startDate <= endDate;
    }
    return { key: `${startDate}:${endDate}`, startDate, endDate, valid };
  }

  function formatMoney(value, unit = state.unit || "USD") {
    const amount = Number(value);
    if (!Number.isFinite(amount)) return "--";
    const normalizedUnit = safeText(unit || "USD").toUpperCase();
    return normalizedUnit === "USD"
      ? `$${amount.toFixed(2)}`
      : `${amount.toFixed(2)} ${normalizedUnit}`;
  }

  function formatMultiplier(value) {
    const amount = Number(value);
    return Number.isFinite(amount) && amount >= 0 ? `${amount.toFixed(2)}x` : "--";
  }

  function formatCount(value) {
    const amount = Number(value);
    if (!Number.isFinite(amount)) return "0";
    return new Intl.NumberFormat("zh-CN").format(Math.max(0, Math.round(amount)));
  }

  function formatCompact(value) {
    const amount = Number(value);
    if (!Number.isFinite(amount)) return "0";
    if (amount >= 1_000_000_000) return `${(amount / 1_000_000_000).toFixed(1)}B`;
    if (amount >= 1_000_000) return `${(amount / 1_000_000).toFixed(1)}M`;
    if (amount >= 1_000) return `${(amount / 1_000).toFixed(1)}K`;
    return formatCount(amount);
  }

  function installStyle() {
    let style = document.getElementById(STYLE_ID);
    if (!style) {
      style = document.createElement("style");
      style.id = STYLE_ID;
      (document.head || document.documentElement)?.appendChild(style);
    }
    style.textContent = `
      #${ROOT_ID} {
        position: fixed;
        top: var(--codex-relay-balance-top, 0);
        left: var(--codex-relay-balance-left, auto);
        right: var(--codex-relay-balance-right, auto);
        z-index: 2147483644;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        box-sizing: border-box;
        height: var(--codex-relay-balance-height, 28px);
        max-width: 170px;
        padding: 0 8px;
        overflow: hidden;
        border: 1px solid rgba(148, 163, 184, .22);
        border-radius: 7px;
        background: rgba(30, 41, 59, .82);
        color: rgba(226, 232, 240, .94);
        font: 12px/1 system-ui, sans-serif;
        white-space: nowrap;
        text-overflow: ellipsis;
        cursor: pointer;
        pointer-events: auto;
        user-select: none;
        -webkit-app-region: no-drag;
      }
      #${ROOT_ID}:hover,
      #${ROOT_ID}[data-panel-open="true"] {
        border-color: rgba(96, 165, 250, .7);
        background: rgba(37, 54, 80, .94);
      }
      #${ROOT_ID}[data-state="loading"] { color: rgba(148, 163, 184, .94); }
      #${ROOT_ID}[data-state="failed"] { color: rgba(248, 113, 113, .94); }
      #${ROOT_ID}[data-state="disabled"] { color: rgba(203, 213, 225, .9); }
      #${PANEL_ID} {
        position: fixed;
        top: var(--codex-relay-panel-top, 0);
        left: var(--codex-relay-panel-left, 12px);
        z-index: 2147483645;
        display: block;
        width: min(430px, calc(100vw - 24px));
        max-height: min(560px, calc(100vh - 72px));
        box-sizing: border-box;
        overflow: auto;
        padding: 12px;
        border: 1px solid rgba(148, 163, 184, .24);
        border-radius: 9px;
        background: rgba(24, 28, 35, .98);
        box-shadow: 0 16px 40px rgba(0, 0, 0, .38);
        color: rgba(226, 232, 240, .95);
        font: 12px/1.35 system-ui, sans-serif;
        pointer-events: auto;
        user-select: text;
        -webkit-app-region: no-drag;
      }
      #${PANEL_ID}[hidden] { display: none; }
      #${PANEL_ID} .codex-relay-panel-header,
      #${PANEL_ID} .codex-relay-panel-row,
      #${PANEL_ID} .codex-relay-panel-summary,
      #${PANEL_ID} .codex-relay-panel-toolbar {
        display: flex;
        align-items: center;
      }
      #${PANEL_ID} .codex-relay-panel-header {
        justify-content: space-between;
        gap: 10px;
        margin-bottom: 10px;
      }
      #${PANEL_ID} .codex-relay-panel-actions {
        display: flex;
        align-items: center;
        gap: 4px;
        flex: 0 0 auto;
      }
      #${PANEL_ID} .codex-relay-panel-title {
        color: rgba(248, 250, 252, .98);
        font-size: 14px;
        font-weight: 650;
      }
      #${PANEL_ID} .codex-relay-panel-subtitle {
        margin-top: 2px;
        color: rgba(148, 163, 184, .9);
        font-size: 11px;
      }
      #${PANEL_ID} .codex-relay-panel-icon {
        width: 26px;
        height: 26px;
        padding: 0;
        border: 0;
        border-radius: 6px;
        background: transparent;
        color: rgba(203, 213, 225, .9);
        cursor: pointer;
        font: 18px/1 system-ui, sans-serif;
      }
      #${PANEL_ID} .codex-relay-panel-icon:hover { background: rgba(148, 163, 184, .14); }
      #${PANEL_ID} .codex-relay-panel-action {
        padding: 5px 7px;
        border: 1px solid rgba(148, 163, 184, .2);
        border-radius: 6px;
        background: rgba(51, 65, 85, .36);
        color: rgba(226, 232, 240, .9);
        cursor: pointer;
        font: inherit;
      }
      #${PANEL_ID} .codex-relay-panel-action:hover { background: rgba(71, 85, 105, .62); }
      #${PANEL_ID} .codex-relay-panel-tabs {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 4px;
        margin-bottom: 8px;
      }
      #${PANEL_ID} .codex-relay-panel-tab {
        min-width: 0;
        padding: 6px 7px;
        border: 1px solid rgba(148, 163, 184, .18);
        border-radius: 6px;
        background: rgba(51, 65, 85, .3);
        color: rgba(203, 213, 225, .86);
        cursor: pointer;
        font: inherit;
      }
      #${PANEL_ID} .codex-relay-panel-tab:hover,
      #${PANEL_ID} .codex-relay-panel-tab[data-active="true"] {
        border-color: rgba(96, 165, 250, .72);
        background: rgba(37, 99, 235, .24);
        color: #f8fafc;
      }
      #${PANEL_ID} .codex-relay-panel-date {
        width: 100%;
        box-sizing: border-box;
        margin: 0;
        padding: 6px 8px;
        border: 1px solid rgba(148, 163, 184, .24);
        border-radius: 6px;
        background: rgba(15, 23, 42, .72);
        color: rgba(226, 232, 240, .95);
        color-scheme: dark;
        font: inherit;
      }
      #${PANEL_ID} .codex-relay-panel-date-range {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 8px;
        margin-bottom: 8px;
      }
      #${PANEL_ID} .codex-relay-panel-date-field { display: grid; gap: 3px; min-width: 0; }
      #${PANEL_ID} .codex-relay-panel-date-label { color: rgba(148, 163, 184, .88); font-size: 10px; }
      #${PANEL_ID} .codex-relay-panel-summary {
        justify-content: space-between;
        gap: 8px;
        margin-bottom: 10px;
        padding: 8px 9px;
        border: 1px solid rgba(148, 163, 184, .14);
        border-radius: 7px;
        background: rgba(15, 23, 42, .52);
      }
      #${PANEL_ID} .codex-relay-panel-summary strong {
        display: block;
        color: #f8fafc;
        font-size: 14px;
      }
      #${PANEL_ID} .codex-relay-panel-muted { color: rgba(148, 163, 184, .88); }
      #${PANEL_ID} .codex-relay-panel-summary-meta { margin-top: 2px; font-size: 10px; }
      #${PANEL_ID} .codex-relay-settings-form { display: grid; gap: 10px; }
      #${PANEL_ID} .codex-relay-settings-hint {
        padding: 8px 9px;
        border: 1px solid rgba(96, 165, 250, .2);
        border-radius: 7px;
        background: rgba(30, 64, 175, .16);
        color: rgba(191, 219, 254, .9);
        font-size: 11px;
      }
      #${PANEL_ID} .codex-relay-settings-check {
        display: flex;
        align-items: flex-start;
        gap: 7px;
        color: rgba(226, 232, 240, .94);
      }
      #${PANEL_ID} .codex-relay-settings-check input { margin-top: 2px; accent-color: #60a5fa; }
      #${PANEL_ID} .codex-relay-settings-field { display: grid; gap: 4px; }
      #${PANEL_ID} .codex-relay-settings-label { color: rgba(203, 213, 225, .88); font-size: 11px; }
      #${PANEL_ID} .codex-relay-settings-input {
        width: 100%;
        box-sizing: border-box;
        padding: 7px 8px;
        border: 1px solid rgba(148, 163, 184, .24);
        border-radius: 6px;
        background: rgba(15, 23, 42, .72);
        color: rgba(226, 232, 240, .95);
        color-scheme: dark;
        font: inherit;
      }
      #${PANEL_ID} .codex-relay-settings-grid {
        display: grid;
        grid-template-columns: minmax(0, 1fr) 112px;
        gap: 8px;
      }
      #${PANEL_ID} .codex-relay-settings-message { color: rgba(134, 239, 172, .9); font-size: 11px; }
      #${PANEL_ID} .codex-relay-settings-error { color: rgba(248, 113, 113, .92); font-size: 11px; }
      #${PANEL_ID} .codex-relay-settings-actions { display: flex; justify-content: flex-end; gap: 6px; }
      #${PANEL_ID} .codex-relay-panel-toolbar {
        justify-content: space-between;
        gap: 8px;
        margin-bottom: 8px;
      }
      #${PANEL_ID} .codex-relay-panel-refresh {
        padding: 5px 8px;
        border: 1px solid rgba(148, 163, 184, .2);
        border-radius: 6px;
        background: rgba(51, 65, 85, .36);
        color: rgba(226, 232, 240, .9);
        cursor: pointer;
        font: inherit;
      }
      #${PANEL_ID} .codex-relay-panel-refresh:hover { background: rgba(71, 85, 105, .62); }
      #${PANEL_ID} table { width: 100%; border-collapse: collapse; table-layout: fixed; }
      #${PANEL_ID} th,
      #${PANEL_ID} td {
        padding: 7px 5px;
        border-bottom: 1px solid rgba(148, 163, 184, .12);
        text-align: right;
        vertical-align: middle;
      }
      #${PANEL_ID} th:first-child,
      #${PANEL_ID} td:first-child { width: 68%; text-align: left; }
      #${PANEL_ID} th:nth-child(2),
      #${PANEL_ID} td:nth-child(2) { width: 14%; }
      #${PANEL_ID} th:last-child,
      #${PANEL_ID} td:last-child { width: 18%; }
      #${PANEL_ID} th { color: rgba(148, 163, 184, .86); font-size: 11px; font-weight: 500; }
      #${PANEL_ID} td { color: rgba(226, 232, 240, .94); }
      #${PANEL_ID} .codex-relay-model-name { overflow: hidden; text-overflow: ellipsis; }
      #${PANEL_ID} .codex-relay-model-main { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 550; }
      #${PANEL_ID} .codex-relay-model-tokens {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 2px 8px;
        margin-top: 3px;
        color: rgba(148, 163, 184, .88);
        font-size: 10px;
        line-height: 1.2;
      }
      #${PANEL_ID} .codex-relay-token-item { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      #${PANEL_ID} .codex-relay-panel-empty,
      #${PANEL_ID} .codex-relay-panel-error {
        padding: 18px 8px;
        color: rgba(148, 163, 184, .9);
        text-align: center;
      }
      #${PANEL_ID} .codex-relay-panel-error { color: rgba(248, 113, 113, .9); }
      @media (max-width: 760px) {
        #${ROOT_ID} { display: none; }
        #${PANEL_ID} { display: none !important; }
      }
    `;
  }

  function installRoot() {
    installStyle();
    root = document.getElementById(ROOT_ID);
    if (!root) {
      root = document.createElement("div");
      root.id = ROOT_ID;
      root.setAttribute("role", "button");
      root.setAttribute("tabindex", "0");
      root.setAttribute("aria-live", "polite");
      root.addEventListener("click", togglePanel);
      root.addEventListener("keydown", onRootKeydown);
      (document.documentElement || document.body).appendChild(root);
    }
    panel = document.getElementById(PANEL_ID);
    if (!panel) {
      panel = document.createElement("div");
      panel.id = PANEL_ID;
      panel.setAttribute("role", "dialog");
      panel.setAttribute("aria-label", "模型消耗");
      panel.addEventListener("click", onPanelClick);
      panel.addEventListener("change", onPanelChange);
      (document.documentElement || document.body).appendChild(panel);
    }
    render();
    updatePosition();
  }

  function findHelpButton() {
    const header = document.querySelector('[class*="ApplicationMenuTopBar"], .app-header-tint');
    const candidates = Array.from(header?.querySelectorAll?.("button, [role='button'], a") || []);
    return candidates.find((button) => {
      const rect = visibleRect(button);
      if (!rect) return false;
      const text = safeText(button.textContent).replace(/\s+/g, "");
      const label = safeText(button.getAttribute?.("aria-label")).replace(/\s+/g, "");
      return /^(帮助|Help)$/i.test(text) || /^(帮助|Help)$/i.test(label);
    });
  }

  function updatePosition() {
    if (!root) return;
    const help = findHelpButton();
    const helpRect = visibleRect(help);
    if (helpRect) {
      root.style.setProperty("--codex-relay-balance-top", `${Math.max(4, helpRect.top)}px`);
      root.style.setProperty("--codex-relay-balance-height", `${Math.max(28, helpRect.height)}px`);
      root.style.setProperty("--codex-relay-balance-left", `${helpRect.right + POSITION_GAP_PX}px`);
      root.style.removeProperty("--codex-relay-balance-right");
    } else {
      const header = document.querySelector('[class*="ApplicationMenuTopBar"], .app-header-tint');
      const headerRect = visibleRect(header);
      if (headerRect) {
        root.style.setProperty("--codex-relay-balance-top", `${headerRect.bottom + PANEL_GAP_PX}px`);
        root.style.setProperty("--codex-relay-balance-height", "30px");
      }
      root.style.removeProperty("--codex-relay-balance-left");
      root.style.setProperty("--codex-relay-balance-right", `${FALLBACK_RIGHT_PX}px`);
    }

    if (!panel || !state.panelOpen) return;
    panel.hidden = false;
    const badgeRect = visibleRect(root);
    const panelRect = panel.getBoundingClientRect();
    if (!badgeRect || !panelRect) return;
    const maxLeft = Math.max(PANEL_MARGIN_PX, window.innerWidth - panelRect.width - PANEL_MARGIN_PX);
    const left = Math.min(Math.max(PANEL_MARGIN_PX, badgeRect.left), maxLeft);
    const maxTop = Math.max(PANEL_MARGIN_PX, window.innerHeight - panelRect.height - PANEL_MARGIN_PX);
    const top = Math.min(Math.max(PANEL_MARGIN_PX, badgeRect.bottom + PANEL_GAP_PX), maxTop);
    panel.style.setProperty("--codex-relay-panel-left", `${left}px`);
    panel.style.setProperty("--codex-relay-panel-top", `${top}px`);
  }

  function formatBalance(next) {
    if (next.status === "loading") return "余额 …";
    if (next.status === "disabled") return "余额 设置";
    if (next.status !== "ok") return "余额 --";
    if (next.unlimited) return "余额 无限";
    const value = Number(next.balance);
    if (!Number.isFinite(value)) return "余额 --";
    const unit = safeText(next.unit || "USD").toUpperCase();
    return unit === "USD" ? `余额 $${value.toFixed(2)}` : `余额 ${value.toFixed(2)} ${unit}`;
  }

  function render() {
    if (!root) return;
    root.dataset.state = state.status;
    root.dataset.panelOpen = String(state.panelOpen);
    root.textContent = formatBalance(state);
    root.title = state.status === "ok" ? "点击查看模型消耗" : state.status === "disabled" ? "点击配置中转站接口" : state.message || "中转站余额";
    root.setAttribute("aria-expanded", String(state.panelOpen));
    root.setAttribute("aria-label", state.status === "ok" ? `${formatBalance(state)}，点击查看模型消耗` : state.status === "disabled" ? "配置中转站接口" : "中转站余额");
    renderPanel();
    updatePosition();
  }

  function setState(next) {
    state = { ...state, ...next };
    render();
  }

  function appendPanelClose(actions, label) {
    const close = document.createElement("button");
    close.className = "codex-relay-panel-icon";
    close.type = "button";
    close.dataset.close = "true";
    close.title = label;
    close.setAttribute("aria-label", label);
    close.textContent = "×";
    actions.appendChild(close);
  }

  function renderSettings() {
    panel.replaceChildren();
    const header = document.createElement("div");
    header.className = "codex-relay-panel-header";
    const titleWrap = document.createElement("div");
    const title = document.createElement("div");
    title.className = "codex-relay-panel-title";
    title.textContent = "余额监控设置";
    const subtitle = document.createElement("div");
    subtitle.className = "codex-relay-panel-subtitle";
    subtitle.textContent = "配置保存在本机，不会写入脚本市场";
    titleWrap.append(title, subtitle);
    const actions = document.createElement("div");
    actions.className = "codex-relay-panel-actions";
    const back = document.createElement("button");
    back.className = "codex-relay-panel-action";
    back.type = "button";
    back.dataset.settingsBack = "true";
    back.textContent = "返回";
    actions.appendChild(back);
    appendPanelClose(actions, "关闭设置");
    header.append(titleWrap, actions);
    panel.appendChild(header);

    const hint = document.createElement("div");
    hint.className = "codex-relay-settings-hint";
    hint.textContent = "默认按 sub2api 的 /v1/usage 格式读取 Codex++ 当前中转站配置。启用手动配置后，将使用下面填写的地址和 API Key；接口仍需返回余额字段以及 model_stats 模型统计字段。";
    panel.appendChild(hint);

    const form = document.createElement("div");
    form.className = "codex-relay-settings-form";
    const checkLabel = document.createElement("label");
    checkLabel.className = "codex-relay-settings-check";
    const manual = document.createElement("input");
    manual.type = "checkbox";
    manual.dataset.configField = "manualEnabled";
    manual.checked = config.manualEnabled;
    const checkText = document.createElement("span");
    checkText.textContent = "使用手动配置，不读取 Codex++ 当前中转站设置";
    checkLabel.append(manual, checkText);
    form.appendChild(checkLabel);

    const field = (labelText, key, type, value, placeholder) => {
      const label = document.createElement("label");
      label.className = "codex-relay-settings-field";
      const caption = document.createElement("span");
      caption.className = "codex-relay-settings-label";
      caption.textContent = labelText;
      const input = document.createElement("input");
      input.className = "codex-relay-settings-input";
      input.type = type;
      input.dataset.configField = key;
      input.value = value;
      input.placeholder = placeholder || "";
      label.append(caption, input);
      form.appendChild(label);
    };

    field("中转站地址", "endpoint", "url", config.endpoint, "https://example.com");
    field("API Key", "apiKey", "password", config.apiKey, "sk-...");
    field("余额接口路径", "usagePath", "text", config.usagePath, "/v1/usage");
    const grid = document.createElement("div");
    grid.className = "codex-relay-settings-grid";
    const timezoneLabel = document.createElement("label");
    timezoneLabel.className = "codex-relay-settings-field";
    const timezoneCaption = document.createElement("span");
    timezoneCaption.className = "codex-relay-settings-label";
    timezoneCaption.textContent = "统计时区";
    const timezoneInput = document.createElement("input");
    timezoneInput.className = "codex-relay-settings-input";
    timezoneInput.type = "text";
    timezoneInput.dataset.configField = "timezone";
    timezoneInput.value = config.timezone;
    timezoneInput.placeholder = DEFAULT_TIMEZONE;
    timezoneLabel.append(timezoneCaption, timezoneInput);
    grid.appendChild(timezoneLabel);
    const refreshLabel = document.createElement("label");
    refreshLabel.className = "codex-relay-settings-field";
    const refreshCaption = document.createElement("span");
    refreshCaption.className = "codex-relay-settings-label";
    refreshCaption.textContent = "刷新间隔（分钟）";
    const refreshInput = document.createElement("input");
    refreshInput.className = "codex-relay-settings-input";
    refreshInput.type = "number";
    refreshInput.min = "1";
    refreshInput.max = "60";
    refreshInput.step = "1";
    refreshInput.dataset.configField = "refreshMinutes";
    refreshInput.value = String(config.refreshMinutes);
    refreshLabel.append(refreshCaption, refreshInput);
    grid.appendChild(refreshLabel);
    form.appendChild(grid);

    if (state.settingsError || state.settingsMessage) {
      const message = document.createElement("div");
      message.className = state.settingsError ? "codex-relay-settings-error" : "codex-relay-settings-message";
      message.textContent = state.settingsError || state.settingsMessage;
      form.appendChild(message);
    }
    const actionsRow = document.createElement("div");
    actionsRow.className = "codex-relay-settings-actions";
    const reset = document.createElement("button");
    reset.className = "codex-relay-panel-action";
    reset.type = "button";
    reset.dataset.resetSettings = "true";
    reset.textContent = "恢复默认";
    const save = document.createElement("button");
    save.className = "codex-relay-panel-refresh";
    save.type = "button";
    save.dataset.saveSettings = "true";
    save.textContent = "保存并刷新";
    actionsRow.append(reset, save);
    form.appendChild(actionsRow);
    panel.appendChild(form);
    updateSettingsFieldAvailability();
  }

  function updateSettingsFieldAvailability() {
    const manual = panel?.querySelector?.('[data-config-field="manualEnabled"]');
    const disabled = !manual?.checked;
    for (const input of panel?.querySelectorAll?.('[data-config-field="endpoint"], [data-config-field="apiKey"], [data-config-field="usagePath"]') || []) {
      input.disabled = disabled;
    }
  }

  function saveSettingsFromPanel() {
    const value = (key) => panel.querySelector(`[data-config-field="${key}"]`)?.value || "";
    const manualEnabled = Boolean(panel.querySelector('[data-config-field="manualEnabled"]')?.checked);
    const next = normalizeConfig({
      manualEnabled,
      endpoint: value("endpoint"),
      apiKey: value("apiKey"),
      usagePath: value("usagePath"),
      timezone: value("timezone"),
      refreshMinutes: value("refreshMinutes"),
    });
    const timezone = value("timezone");
    if (timezone && !isValidTimezone(timezone)) {
      setState({ settingsError: "统计时区无效，请填写有效的 IANA 时区，例如 Asia/Shanghai", settingsMessage: "" });
      return;
    }
    if (manualEnabled && !next.endpoint) {
      setState({ settingsError: "手动配置需要填写中转站地址", settingsMessage: "" });
      return;
    }
    if (manualEnabled && !next.apiKey) {
      setState({ settingsError: "手动配置需要填写 API Key", settingsMessage: "" });
      return;
    }
    config = saveConfig(next);
    resetRefreshTimer();
    setState({ view: "usage", settingsError: "", settingsMessage: "配置已保存", modelsStatus: "idle", models: [], modelsKey: "", modelsError: "" });
    void refresh(true);
    if (state.panelOpen) void loadModelUsage(true);
  }

  function renderPanel() {
    if (!panel) return;
    panel.hidden = !state.panelOpen;
    if (!state.panelOpen) return;

    if (state.view === "settings") {
      renderSettings();
      return;
    }

    const range = selectedRange();
    const rangeLabel = range.startDate === range.endDate ? range.startDate : `${range.startDate} 至 ${range.endDate}`;
    const periodLabel = state.period === "today" ? "今天" : state.period === "yesterday" ? "昨天" : rangeLabel;
    panel.replaceChildren();

    const header = document.createElement("div");
    header.className = "codex-relay-panel-header";
    const titleWrap = document.createElement("div");
    const title = document.createElement("div");
    title.className = "codex-relay-panel-title";
    title.textContent = "模型消耗";
    const subtitle = document.createElement("div");
    subtitle.className = "codex-relay-panel-subtitle";
    subtitle.textContent = `${periodLabel} · ${config.timezone}`;
    titleWrap.append(title, subtitle);
    const actions = document.createElement("div");
    actions.className = "codex-relay-panel-actions";
    const settings = document.createElement("button");
    settings.className = "codex-relay-panel-action";
    settings.type = "button";
    settings.dataset.settings = "true";
    settings.title = "打开余额监控设置";
    settings.textContent = "设置";
    actions.appendChild(settings);
    appendPanelClose(actions, "关闭模型消耗");
    header.append(titleWrap, actions);
    panel.appendChild(header);

    const tabs = document.createElement("div");
    tabs.className = "codex-relay-panel-tabs";
    for (const item of [["today", "今天"], ["yesterday", "昨天"], ["date", "指定范围"]]) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "codex-relay-panel-tab";
      button.dataset.period = item[0];
      button.dataset.active = String(state.period === item[0]);
      button.textContent = item[1];
      tabs.appendChild(button);
    }
    panel.appendChild(tabs);

    if (state.period === "date") {
      const dateRange = document.createElement("div");
      dateRange.className = "codex-relay-panel-date-range";
      const today = dateString(new Date());
      for (const item of [["start", "开始日期", state.customStartDate || today], ["end", "结束日期", state.customEndDate || state.customStartDate || today]]) {
        const field = document.createElement("label");
        field.className = "codex-relay-panel-date-field";
        const label = document.createElement("span");
        label.className = "codex-relay-panel-date-label";
        label.textContent = item[1];
        const dateInput = document.createElement("input");
        dateInput.className = "codex-relay-panel-date";
        dateInput.type = "date";
        dateInput.dataset.dateRange = item[0];
        dateInput.max = today;
        dateInput.value = item[2];
        dateInput.setAttribute("aria-label", item[1]);
        field.append(label, dateInput);
        dateRange.appendChild(field);
      }
      panel.appendChild(dateRange);
    }

    const summary = document.createElement("div");
    summary.className = "codex-relay-panel-summary";
    const summaryLeft = document.createElement("div");
    const summaryTitle = document.createElement("span");
    summaryTitle.className = "codex-relay-panel-muted";
    summaryTitle.textContent = "实际扣除";
    const summaryValue = document.createElement("strong");
    const totalActual = state.models.reduce((sum, item) => sum + Number(item.actualCost || 0), 0);
    const totalCost = state.models.reduce((sum, item) => sum + Number(item.cost || 0), 0);
    const overallMultiplier = totalCost > 0 ? totalActual / totalCost : null;
    summaryValue.textContent = state.modelsStatus === "loading" ? "读取中…" : formatMoney(totalActual);
    const summaryMeta = document.createElement("div");
    summaryMeta.className = "codex-relay-panel-muted codex-relay-panel-summary-meta";
    summaryMeta.textContent = `标准费用 ${formatMoney(totalCost)} · 实际倍率 ${formatMultiplier(overallMultiplier)}`;
    summaryLeft.append(summaryTitle, summaryValue, summaryMeta);
    const summaryRight = document.createElement("div");
    summaryRight.className = "codex-relay-panel-muted";
    const totalRequests = state.models.reduce((sum, item) => sum + Number(item.requests || 0), 0);
    const totalTokens = state.models.reduce((sum, item) => sum + Number(item.totalTokens || 0), 0);
    summaryRight.textContent = `${formatCount(totalRequests)} 次请求 · ${formatCompact(totalTokens)} Token`;
    summaryRight.title = `${formatCount(totalTokens)} tokens`;
    summary.append(summaryLeft, summaryRight);
    panel.appendChild(summary);

    const toolbar = document.createElement("div");
    toolbar.className = "codex-relay-panel-toolbar";
    const rangeText = document.createElement("span");
    rangeText.className = "codex-relay-panel-muted";
    rangeText.textContent = `每个模型独立统计 · ${rangeLabel}`;
    const refresh = document.createElement("button");
    refresh.type = "button";
    refresh.className = "codex-relay-panel-refresh";
    refresh.dataset.refreshModels = "true";
    refresh.textContent = "刷新";
    toolbar.append(rangeText, refresh);
    panel.appendChild(toolbar);

    if (state.modelsStatus === "loading") {
      const loading = document.createElement("div");
      loading.className = "codex-relay-panel-empty";
      loading.textContent = "正在读取模型消耗…";
      panel.appendChild(loading);
      return;
    }
    if (state.modelsStatus === "failed") {
      const error = document.createElement("div");
      error.className = "codex-relay-panel-error";
      error.textContent = state.modelsError || "模型消耗读取失败";
      panel.appendChild(error);
      return;
    }
    if (!state.models.length) {
      const empty = document.createElement("div");
      empty.className = "codex-relay-panel-empty";
      empty.textContent = "这个日期没有模型消耗记录";
      panel.appendChild(empty);
      return;
    }

    const table = document.createElement("table");
    table.innerHTML = "<thead><tr><th>模型 / Token 明细</th><th>请求</th><th>扣除</th></tr></thead><tbody></tbody>";
    const body = table.querySelector("tbody");
    for (const item of state.models) {
      const row = document.createElement("tr");
      const model = document.createElement("td");
      model.className = "codex-relay-model-name";
      const modelMain = document.createElement("div");
      modelMain.className = "codex-relay-model-main";
      modelMain.textContent = item.model;
      model.title = `${item.model} · 标准计费 ${formatMoney(item.cost)}`;
      const tokenDetails = document.createElement("div");
      tokenDetails.className = "codex-relay-model-tokens";
      for (const [label, value] of [
        ["输入", item.inputTokens],
        ["缓存读", item.cacheReadTokens],
        ["缓存写", item.cacheCreationTokens],
        ["输出", item.outputTokens],
        ["总计", item.totalTokens],
        ["实际倍率", item.actualMultiplier],
      ]) {
        const tokenItem = document.createElement("span");
        tokenItem.className = "codex-relay-token-item";
        const displayValue = label === "实际倍率" ? formatMultiplier(value) : formatCompact(value);
        tokenItem.textContent = `${label} ${displayValue}`;
        tokenItem.title = label === "实际倍率" ? `${label} ${displayValue}` : `${label} ${formatCount(value)} tokens`;
        tokenDetails.appendChild(tokenItem);
      }
      model.append(modelMain, tokenDetails);
      const requests = document.createElement("td");
      requests.textContent = formatCount(item.requests);
      requests.title = `${formatCount(item.requests)} 次请求`;
      const actual = document.createElement("td");
      actual.textContent = formatMoney(item.actualCost);
      actual.title = `标准计费 ${formatMoney(item.cost)}，实际扣除 ${formatMoney(item.actualCost)}`;
      row.append(model, requests, actual);
      body?.appendChild(row);
    }
    panel.appendChild(table);
  }

  function onRootKeydown(event) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      togglePanel();
    }
  }

  function togglePanel() {
    if (state.status === "disabled") {
      setState({ panelOpen: true, view: "settings", settingsError: "", settingsMessage: "" });
      return;
    }
    const panelOpen = !state.panelOpen;
    setState({ panelOpen, view: panelOpen ? "usage" : state.view, settingsError: "", settingsMessage: "" });
    if (panelOpen) void loadModelUsage();
  }

  function onPanelClick(event) {
    const target = event.target?.closest?.("button");
    if (!target) return;
    if (target.dataset.close === "true") {
      setState({ panelOpen: false });
      return;
    }
    if (target.dataset.settings === "true") {
      setState({ view: "settings", settingsError: "", settingsMessage: "" });
      return;
    }
    if (target.dataset.settingsBack === "true") {
      setState({ view: "usage", settingsError: "", settingsMessage: "" });
      return;
    }
    if (target.dataset.saveSettings === "true") {
      saveSettingsFromPanel();
      return;
    }
    if (target.dataset.resetSettings === "true") {
      config = saveConfig(DEFAULT_CONFIG);
      resetRefreshTimer();
      setState({ settingsError: "", settingsMessage: "已恢复默认配置" });
      return;
    }
    if (state.view !== "usage") return;
    if (target.dataset.refreshModels === "true") {
      void loadModelUsage(true);
      return;
    }
    if (target.dataset.period) {
      const period = target.dataset.period;
      if (period !== state.period) {
        setState({ period, modelsStatus: "idle", modelsKey: "", modelsError: "" });
        void loadModelUsage(true);
      }
    }
  }

  function onPanelChange(event) {
    const configField = safeText(event.target?.dataset?.configField);
    if (configField === "manualEnabled") {
      updateSettingsFieldAvailability();
      return;
    }
    const field = safeText(event.target?.dataset?.dateRange);
    if (!field) return;
    const value = safeText(event.target.value);
    const nextDate = field === "start" ? { customStartDate: value } : { customEndDate: value };
    setState({ ...nextDate, modelsStatus: "idle", models: [], modelsKey: "", modelsError: "" });
    if (!value) {
      setState({ modelsStatus: "failed", modelsError: "请选择开始日期和结束日期" });
      return;
    }
    if (!selectedRange().valid) {
      setState({ modelsStatus: "failed", modelsError: "结束日期不能早于开始日期" });
      return;
    }
    void loadModelUsage(true);
  }

  function onDocumentClick(event) {
    if (!state.panelOpen) return;
    if (root?.contains?.(event.target) || panel?.contains?.(event.target)) return;
    setState({ panelOpen: false });
  }

  function onDocumentKeydown(event) {
    if (event.key === "Escape" && state.panelOpen) setState({ panelOpen: false });
  }

  function callBridge(path, payload) {
    if (typeof window.__codexSessionDeleteBridge !== "function") {
      return Promise.reject(new Error("Codex++ bridge unavailable"));
    }
    return window.__codexSessionDeleteBridge(path, payload || {});
  }

  function activeRelayConfig(settings) {
    const profiles = Array.isArray(settings?.relayProfiles) ? settings.relayProfiles : [];
    const candidates = [...profiles, settings?.profile].filter(Boolean);
    const activeId = safeText(settings?.activeRelayId);
    const profile = candidates.find((item) => safeText(item?.id) === activeId) || candidates[0] || {};
    const mode = safeText(profile.relayMode || settings?.relayMode).toLowerCase();
    const endpoint = safeText(profile.upstreamBaseUrl || profile.baseUrl || settings?.relayBaseUrl);
    const apiKey = safeText(profile.apiKey || settings?.relayApiKey);
    return { mode, endpoint, apiKey };
  }

  function effectiveRelayConfig(settings) {
    if (config.manualEnabled) {
      return { mode: "manual", endpoint: config.endpoint, apiKey: config.apiKey };
    }
    return activeRelayConfig(settings);
  }

  function usageUrl(endpoint, usagePath, range = null) {
    const base = safeText(endpoint).replace(/\/+$/, "");
    if (!base) return "";
    const path = normalizeUsagePath(usagePath);
    const baseUrl = new URL(`${base}/`);
    const basePath = baseUrl.pathname.replace(/\/+$/, "");
    const url = /^https?:\/\//i.test(path)
      ? new URL(path)
      : /\/usage$/i.test(basePath)
        ? new URL(baseUrl.origin + basePath)
        : /\/v1$/i.test(basePath) && path === "/v1/usage"
          ? new URL(baseUrl.origin + basePath + "/usage")
          : new URL(baseUrl.origin + basePath + path);
    if (range) {
      url.searchParams.set("start_date", range.startDate);
      url.searchParams.set("end_date", range.endDate);
      url.searchParams.set("days", "90");
      url.searchParams.set("timezone", config.timezone || DEFAULT_TIMEZONE);
    }
    return url.toString();
  }

  function parseUsageBalance(payload) {
    const quota = payload?.quota && typeof payload.quota === "object" ? payload.quota : {};
    const raw = payload?.balance ?? payload?.remaining ?? quota.remaining;
    const number = Number(raw);
    if (number === -1) {
      return { balance: null, unit: payload?.unit || quota.unit || "USD", unlimited: true, planName: payload?.planName || payload?.plan_name || "" };
    }
    if (!Number.isFinite(number) || number < 0) throw new Error("余额接口未返回有效余额");
    return {
      balance: number,
      unit: payload?.unit || quota.unit || "USD",
      unlimited: false,
      planName: payload?.planName || payload?.plan_name || "",
    };
  }

  function parseModelStats(payload) {
    const models = Array.isArray(payload?.model_stats) ? payload.model_stats : [];
    return models
      .map((item) => ({
        model: safeText(item?.model || "未知模型"),
        requests: Number(item?.requests || 0),
        inputTokens: Number(item?.input_tokens ?? item?.prompt_tokens ?? 0),
        cacheCreationTokens: Number(item?.cache_creation_tokens ?? item?.cache_creation_input_tokens ?? 0),
        cacheReadTokens: Number(item?.cache_read_tokens ?? item?.cache_read_input_tokens ?? 0),
        outputTokens: Number(item?.output_tokens ?? item?.completion_tokens ?? 0),
        totalTokens: Number(item?.total_tokens || 0),
        cost: Number(item?.cost || 0),
        actualCost: Number(item?.actual_cost ?? item?.cost ?? 0),
        actualMultiplier: Number(item?.cost || 0) > 0
          ? Number(item?.actual_cost ?? item?.cost ?? 0) / Number(item?.cost)
          : null,
      }))
      .filter((item) => item.model)
      .sort((left, right) => right.actualCost - left.actualCost || right.totalTokens - left.totalTokens);
  }

  function formatRemoteError(data, url, status) {
    let payload = null;
    const rawBody = safeText(data?.bodyJsonString).trim();
    if (rawBody) {
      try {
        payload = JSON.parse(rawBody);
      } catch (_) {
        payload = null;
      }
    }
    const nestedError = payload?.error && typeof payload.error === "object" ? payload.error : null;
    const detail = safeText(
      nestedError?.message
      || payload?.message
      || payload?.detail
      || nestedError?.code
      || payload?.code
      || (typeof payload?.error === "string" ? payload.error : "")
      || data?.error,
    ).replace(/\s+/g, " ").trim();
    const fallbackBody = !detail && rawBody && !rawBody.startsWith("{")
      ? rawBody.replace(/\s+/g, " ").trim()
      : "";
    const summary = (detail || fallbackBody).slice(0, 240);
    let path = "";
    try {
      const parsedUrl = new URL(url);
      path = `${parsedUrl.pathname}${parsedUrl.search}`;
    } catch (_) {
      path = "";
    }
    const suffix = summary ? `：${summary}` : "";
    const pathHint = path ? `（请求 ${path}）` : "";
    return new Error(`余额接口请求失败：HTTP ${status || "error"}${suffix}${pathHint}`);
  }

  function fetchViaElectronBridge(url, headers, timeoutMs = 15000) {
    const bridge = window.electronBridge;
    if (!bridge || typeof bridge.sendMessageFromView !== "function") {
      return Promise.reject(new Error("Codex++ network bridge unavailable"));
    }
    const requestId = `codex-relay-balance-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    return new Promise((resolve, reject) => {
      let settled = false;
      const finish = (callback, value) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);
        window.removeEventListener("message", onMessage, true);
        callback(value);
      };
      const consume = (data) => {
        if (!data || data.type !== "fetch-response" || data.requestId !== requestId) return false;
        const status = Number(data.status || 0);
        if (data.responseType === "error" || status < 200 || status >= 300) {
          finish(reject, formatRemoteError(data, url, status));
          return true;
        }
        try {
          finish(resolve, JSON.parse(data.bodyJsonString || "{}"));
        } catch (_) {
          finish(reject, new Error("余额接口返回了无法解析的 JSON"));
        }
        return true;
      };
      const onMessage = (event) => consume(event?.data);
      const timer = window.setTimeout(() => finish(reject, new Error("余额请求超时")), timeoutMs);
      window.addEventListener("message", onMessage, true);
      try {
        Promise.resolve(bridge.sendMessageFromView({ type: "fetch", requestId, method: "GET", url, headers }))
          .then(consume)
          .catch((error) => finish(reject, error));
      } catch (error) {
        finish(reject, error);
      }
    });
  }

  async function fetchUsagePayload(range = null) {
    const settings = config.manualEnabled ? null : await callBridge("/settings/get", {});
    const relayConfig = effectiveRelayConfig(settings);
    if (relayConfig.mode === "aggregate" && !config.manualEnabled) {
      return { disabled: true, payload: null, reason: "当前为聚合模式，不能按 API Key 查询余额" };
    }
    if (!relayConfig.endpoint || !relayConfig.apiKey) {
      return { disabled: true, payload: null, reason: config.manualEnabled ? "请先在设置中填写中转站地址和 API Key" : "未读取到可用的中转站 API 配置" };
    }
    const payload = await fetchViaElectronBridge(usageUrl(relayConfig.endpoint, config.usagePath, range), {
      Accept: "application/json",
      Authorization: `Bearer ${relayConfig.apiKey}`,
      "x-api-key": relayConfig.apiKey,
    });
    return { disabled: false, payload };
  }

  async function fetchBalance() {
    const result = await fetchUsagePayload();
    if (result.disabled) return { status: "disabled", message: result.reason || "未读取到可用的中转站 API 配置" };
    return { status: "ok", ...parseUsageBalance(result.payload), message: "已更新" };
  }

  async function refresh(force = false) {
    if (destroyed) return null;
    if (requestPromise && !force) return requestPromise;
    setState({ status: "loading", message: "正在读取余额" });
    const request = fetchBalance()
      .then((next) => {
        setState(next);
        return next;
      })
      .catch((error) => {
        setState({ status: "failed", balance: null, message: error?.message || String(error) });
        return null;
      })
      .finally(() => {
        if (requestPromise === request) requestPromise = null;
      });
    requestPromise = request;
    return request;
  }

  async function loadModelUsage(force = false) {
    if (destroyed || !state.panelOpen) return null;
    const range = selectedRange();
    if (!range.valid) {
      modelRequestSeq += 1;
      setState({ modelsStatus: "failed", models: [], modelsKey: range.key, modelsError: "结束日期不能早于开始日期" });
      return null;
    }
    if (!force && state.modelsStatus === "ok" && state.modelsKey === range.key) return state.models;
    if (modelRequestPromise && !force) return modelRequestPromise;
    const requestSeq = ++modelRequestSeq;
    setState({ modelsStatus: "loading", modelsError: "", modelsKey: range.key });
    const request = fetchUsagePayload(range)
      .then((result) => {
        if (result.disabled) throw new Error(result.reason || "未读取到可用的中转站 API 配置");
        const models = parseModelStats(result.payload);
        if (requestSeq !== modelRequestSeq) return models;
        setState({ modelsStatus: "ok", models, modelsKey: range.key, modelsUpdatedAt: Date.now(), modelsError: "" });
        return models;
      })
      .catch((error) => {
        if (requestSeq !== modelRequestSeq) return null;
        setState({ modelsStatus: "failed", models: [], modelsError: error?.message || String(error) });
        return null;
      })
      .finally(() => {
        if (modelRequestPromise === request) modelRequestPromise = null;
      });
    modelRequestPromise = request;
    return request;
  }

  function resetRefreshTimer() {
    if (refreshTimer) window.clearInterval(refreshTimer);
    refreshTimer = window.setInterval(() => {
      void refresh();
      if (state.panelOpen && state.view === "usage") void loadModelUsage(true);
    }, config.refreshMinutes * 60 * 1000);
  }

  function destroy() {
    destroyed = true;
    if (refreshTimer) window.clearInterval(refreshTimer);
    if (positionTimer) window.clearInterval(positionTimer);
    observer?.disconnect?.();
    window.removeEventListener("resize", updatePosition);
    window.removeEventListener("focus", onFocus);
    document.removeEventListener("visibilitychange", onVisibilityChange);
    document.removeEventListener("click", onDocumentClick, true);
    document.removeEventListener("keydown", onDocumentKeydown, true);
    root?.remove();
    panel?.remove();
    document.getElementById(STYLE_ID)?.remove();
    if (window[API_KEY]?.version === VERSION) delete window[API_KEY];
  }

  function onFocus() {
    void refresh(true);
    if (state.panelOpen) void loadModelUsage(true);
  }

  function onVisibilityChange() {
    if (document.visibilityState === "visible") {
      void refresh(true);
      if (state.panelOpen) void loadModelUsage(true);
    }
  }

  installRoot();
  document.addEventListener("click", onDocumentClick, true);
  document.addEventListener("keydown", onDocumentKeydown, true);
  observer = new MutationObserver(updatePosition);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener("resize", updatePosition);
  window.addEventListener("focus", onFocus);
  document.addEventListener("visibilitychange", onVisibilityChange);
  positionTimer = window.setInterval(updatePosition, 2000);
  resetRefreshTimer();
  window[API_KEY] = { version: VERSION, ensure: installRoot, refresh, loadModelUsage, destroy };
  void refresh(true);
})();

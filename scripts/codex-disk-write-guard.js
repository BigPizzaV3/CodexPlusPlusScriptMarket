/*
 * Codex++ 用户脚本：修复 Codex Desktop 异常磁盘写入。
 *
 * 该脚本包含两项保护：节流会放大 Sentry scope_v3.json 写入的
 * app-state heartbeat 快照，并将 Git Review 固定为 last-turn-only，
 * 避免大型未跟踪工作区反复生成临时 Git 对象库。
 */

/*
 * Codex++ user script: throttle the large app-state heartbeat breadcrumb.
 *
 * Codex Desktop asks the renderer for an app-state snapshot every 30 seconds.
 * The response is added to the persistent Sentry scope; subsequent breadcrumbs
 * then rewrite scope_v3.json together with that large snapshot.  This patch
 * correlates each requestId with its request reason and allows at most one
 * heartbeat response every ten minutes.  Non-heartbeat diagnostics and all
 * unrelated renderer messages are left unchanged.
 */
(() => {
  "use strict";

  const VERSION = "2026.07.16.3";
  const GLOBAL_KEY = "__codexDiskWriteThrottle";
  const PATCH_MARKER = "__codexDiskWriteThrottleDispatchPatch";
  const SUBSCRIPTION_MARKER = "__codexDiskWriteThrottleRequestSubscription";
  const PREVIOUS_DISPATCH = "__codexDiskWriteThrottlePreviousDispatch";
  const DEFAULT_INTERVAL_MS = 10 * 60 * 1000;
  const MIN_INTERVAL_MS = 30 * 1000;
  const REQUEST_TTL_MS = 2 * 60 * 1000;

  const existing = window[GLOBAL_KEY];
  const state = window[GLOBAL_KEY] = existing && typeof existing === "object"
    ? existing
    : {};

  state.version = VERSION;
  state.enabled = state.enabled !== false;
  state.installed = state.installed === true;
  state.intervalMs = Number.isFinite(state.intervalMs)
    ? Math.max(MIN_INTERVAL_MS, state.intervalMs)
    : DEFAULT_INTERVAL_MS;
  state.requests = state.requests instanceof Map ? state.requests : new Map();
  state.heartbeatResponsesSeen = Number(state.heartbeatResponsesSeen) || 0;
  state.heartbeatResponsesAllowed = Number(state.heartbeatResponsesAllowed) || 0;
  state.heartbeatResponsesDropped = Number(state.heartbeatResponsesDropped) || 0;
  state.nonHeartbeatResponsesPassed = Number(state.nonHeartbeatResponsesPassed) || 0;
  state.unknownResponsesPassed = Number(state.unknownResponsesPassed) || 0;
  state.errors = Array.isArray(state.errors) ? state.errors : [];
  state.lastHeartbeatAllowedAt = Number.isFinite(state.lastHeartbeatAllowedAt)
    ? state.lastHeartbeatAllowedAt
    : null;
  state.lastHeartbeatDroppedAt = Number.isFinite(state.lastHeartbeatDroppedAt)
    ? state.lastHeartbeatDroppedAt
    : null;

  function noteError(error) {
    const message = String(error?.stack || error?.message || error);
    state.errors.push({ at: new Date().toISOString(), message });
    if (state.errors.length > 20) state.errors.shift();
  }

  function pruneRequests(now = Date.now()) {
    for (const [requestId, entry] of state.requests) {
      if (!entry || now - entry.seenAt > REQUEST_TTL_MS) {
        state.requests.delete(requestId);
      }
    }
  }

  function trackSnapshotRequest(message, now = Date.now()) {
    const requestId = typeof message?.requestId === "string" ? message.requestId : "";
    if (!requestId) return;
    pruneRequests(now);
    state.requests.set(requestId, {
      reason: String(message?.reason || ""),
      seenAt: now,
    });
  }

  function shouldDropDispatch(type, payload, now = Date.now()) {
    if (type !== "electron-app-state-snapshot-response") return false;

    pruneRequests(now);
    const requestId = typeof payload?.requestId === "string" ? payload.requestId : "";
    const request = requestId ? state.requests.get(requestId) : null;
    if (requestId) state.requests.delete(requestId);

    if (!request) {
      state.unknownResponsesPassed += 1;
      return false;
    }
    if (request.reason !== "heartbeat") {
      state.nonHeartbeatResponsesPassed += 1;
      return false;
    }

    state.heartbeatResponsesSeen += 1;
    if (!state.enabled) return false;

    const last = state.lastHeartbeatAllowedAt;
    if (last == null || now - last >= state.intervalMs) {
      state.lastHeartbeatAllowedAt = now;
      state.heartbeatResponsesAllowed += 1;
      return false;
    }

    state.lastHeartbeatDroppedAt = now;
    state.heartbeatResponsesDropped += 1;
    return true;
  }

  function assetUrls() {
    const scripts = Array.from(document.scripts || []).map((script) => script.src);
    const links = Array.from(document.querySelectorAll?.("link[href]") || [])
      .map((link) => link.href);
    const resources = typeof performance?.getEntriesByType === "function"
      ? performance.getEntriesByType("resource").map((entry) => entry.name)
      : [];
    return [...scripts, ...links, ...resources].filter(Boolean);
  }

  async function findAssetUrl(namePart) {
    const direct = assetUrls().find((url) =>
      url.includes("/assets/")
      && url.includes(namePart)
      && url.split("?")[0].endsWith(".js")
    );
    if (direct) return direct;

    const escaped = namePart.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const importPattern = new RegExp(
      `["'](\\./(?:assets/)?${escaped}[^"']+\\.js)["']`
    );
    for (const src of Array.from(document.scripts || []).map((script) => script.src).filter(Boolean)) {
      if (!src.split("?")[0].endsWith(".js")) continue;
      try {
        const source = await fetch(src).then((response) => response.ok ? response.text() : "");
        const match = source.match(importPattern);
        if (match) return new URL(match[1], src).href;
      } catch (error) {
        noteError(error);
      }
    }
    return "";
  }

  function dispatcherFromModule(module) {
    const values = module && typeof module === "object" ? Object.values(module) : [];
    const singleton = values.find((candidate) => candidate
      && typeof candidate === "object"
      && typeof candidate.dispatchMessage === "function"
      && typeof candidate.subscribe === "function");
    if (singleton) return singleton;

    const dispatcherClass = values.find((candidate) => typeof candidate === "function"
      && typeof candidate.getInstance === "function"
      && typeof candidate.prototype?.dispatchMessage === "function");
    return dispatcherClass?.getInstance?.() || null;
  }

  async function loadDispatcher() {
    const errors = [];
    for (const prefix of ["vscode-api-", "setting-storage-"]) {
      try {
        const url = await findAssetUrl(prefix);
        if (!url) {
          errors.push(`${prefix}: asset missing`);
          continue;
        }
        const module = await import(url);
        const dispatcher = dispatcherFromModule(module);
        if (dispatcher) return dispatcher;
        errors.push(`${prefix}: dispatcher missing`);
      } catch (error) {
        errors.push(`${prefix}: ${error?.message || error}`);
      }
    }
    throw new Error(errors.join("; "));
  }

  async function installDispatcherPatch() {
    const dispatcher = await loadDispatcher();

    if (!dispatcher[SUBSCRIPTION_MARKER]) {
      const unsubscribe = dispatcher.subscribe(
        "electron-app-state-snapshot-request",
        (message) => window[GLOBAL_KEY]?.trackSnapshotRequest?.(message)
      );
      dispatcher[SUBSCRIPTION_MARKER] = { version: VERSION, unsubscribe };
    } else {
      dispatcher[SUBSCRIPTION_MARKER].version = VERSION;
    }

    if (!dispatcher[PATCH_MARKER]) {
      const previous = dispatcher.dispatchMessage.bind(dispatcher);
      dispatcher[PREVIOUS_DISPATCH] = previous;
      dispatcher.dispatchMessage = (type, payload) => {
        if (window[GLOBAL_KEY]?.shouldDropDispatch?.(type, payload)) return undefined;
        return previous(type, payload);
      };
      dispatcher[PATCH_MARKER] = { version: VERSION };
    } else {
      dispatcher[PATCH_MARKER].version = VERSION;
    }

    state.installed = true;
    state.installedAt = new Date().toISOString();
    document.documentElement?.setAttribute("data-codex-disk-write-throttle", "active");
    return true;
  }

  async function installWithRetry() {
    for (let attempt = 0; attempt < 80; attempt += 1) {
      try {
        if (await installDispatcherPatch()) return;
      } catch (error) {
        if (attempt === 79) noteError(error);
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }

  state.enable = () => {
    state.enabled = true;
    document.documentElement?.setAttribute("data-codex-disk-write-throttle", "active");
    return state.enabled;
  };
  state.disable = () => {
    state.enabled = false;
    document.documentElement?.setAttribute("data-codex-disk-write-throttle", "disabled");
    return state.enabled;
  };
  state.setIntervalMinutes = (minutes) => {
    const value = Number(minutes);
    if (!Number.isFinite(value) || value <= 0) throw new TypeError("minutes must be positive");
    state.intervalMs = Math.max(MIN_INTERVAL_MS, value * 60 * 1000);
    return state.intervalMs;
  };
  state.resetCounters = () => {
    state.heartbeatResponsesSeen = 0;
    state.heartbeatResponsesAllowed = 0;
    state.heartbeatResponsesDropped = 0;
    state.nonHeartbeatResponsesPassed = 0;
    state.unknownResponsesPassed = 0;
    state.lastHeartbeatAllowedAt = null;
    state.lastHeartbeatDroppedAt = null;
  };
  state.status = () => ({
    version: state.version,
    enabled: state.enabled,
    installed: state.installed,
    intervalMinutes: state.intervalMs / 60000,
    pendingRequestReasons: state.requests.size,
    heartbeatResponsesSeen: state.heartbeatResponsesSeen,
    heartbeatResponsesAllowed: state.heartbeatResponsesAllowed,
    heartbeatResponsesDropped: state.heartbeatResponsesDropped,
    nonHeartbeatResponsesPassed: state.nonHeartbeatResponsesPassed,
    unknownResponsesPassed: state.unknownResponsesPassed,
    lastHeartbeatAllowedAt: state.lastHeartbeatAllowedAt == null
      ? null
      : new Date(state.lastHeartbeatAllowedAt).toISOString(),
    lastHeartbeatDroppedAt: state.lastHeartbeatDroppedAt == null
      ? null
      : new Date(state.lastHeartbeatDroppedAt).toISOString(),
    errors: [...state.errors],
  });

  // Exposed for deterministic VM regression tests and manual diagnostics.
  state.trackSnapshotRequest = trackSnapshotRequest;
  state.shouldDropDispatch = shouldDropDispatch;

  if (window.__CODEX_DISK_WRITE_THROTTLE_TEST__ !== true) {
    void installWithRetry();
  }
})();

/*
 * Codex++ user script: prevent full Git Review snapshots from materializing
 * large untracked workspaces in %TEMP%/codex-review-objects-*.
 *
 * The built-in "last-turn-only" mode is a supported Codex setting. It keeps
 * recorded Last Turn review data while disabling Unstaged/Staged/Branch review
 * queries, which are the queries that create temporary Git object stores.
 */
(() => {
  "use strict";

  const VERSION = "2026.07.16.3";
  const GLOBAL_KEY = "__codexGitReviewDiskGuard";
  const PATCH_MARKER = "__codexGitReviewDiskGuardDispatchPatch";
  const PREVIOUS_DISPATCH = "__codexGitReviewDiskGuardPreviousDispatch";
  const SETTING_KEY = "git-review-mode";
  const GUARDED_VALUE = "last-turn-only";

  const existing = window[GLOBAL_KEY];
  const state = window[GLOBAL_KEY] = existing && typeof existing === "object"
    ? existing
    : {};
  state.version = VERSION;
  state.enabled = state.enabled !== false;
  state.installed = state.installed === true;
  state.settingApplied = state.settingApplied === true;
  state.forcedWrites = Number(state.forcedWrites) || 0;
  state.errors = Array.isArray(state.errors) ? state.errors : [];
  state.previousValueCaptured = state.previousValueCaptured === true
    || Object.prototype.hasOwnProperty.call(state, "previousValue");

  function noteError(error) {
    const message = String(error?.stack || error?.message || error);
    state.errors.push({ at: new Date().toISOString(), message });
    if (state.errors.length > 20) state.errors.shift();
  }

  function assetUrls() {
    const scripts = Array.from(document.scripts || []).map((script) => script.src);
    const links = Array.from(document.querySelectorAll?.("link[href]") || [])
      .map((link) => link.href);
    const resources = typeof performance?.getEntriesByType === "function"
      ? performance.getEntriesByType("resource").map((entry) => entry.name)
      : [];
    return [...scripts, ...links, ...resources].filter(Boolean);
  }

  async function findAssetUrl(namePart) {
    const direct = assetUrls().find((url) =>
      url.includes("/assets/")
      && url.includes(namePart)
      && url.split("?")[0].endsWith(".js")
    );
    if (direct) return direct;

    const escaped = namePart.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const importPattern = new RegExp(
      `["'](\\./(?:assets/)?${escaped}[^"']+\\.js)["']`
    );
    for (const src of Array.from(document.scripts || []).map((script) => script.src).filter(Boolean)) {
      if (!src.split("?")[0].endsWith(".js")) continue;
      try {
        const source = await fetch(src).then((response) => response.ok ? response.text() : "");
        const match = source.match(importPattern);
        if (match) return new URL(match[1], src).href;
      } catch (error) {
        noteError(error);
      }
    }
    return "";
  }

  function dispatcherFromModule(module) {
    const values = module && typeof module === "object" ? Object.values(module) : [];
    const singleton = values.find((candidate) => candidate
      && typeof candidate === "object"
      && typeof candidate.dispatchMessage === "function"
      && typeof candidate.subscribe === "function");
    if (singleton) return singleton;

    const dispatcherClass = values.find((candidate) => typeof candidate === "function"
      && typeof candidate.getInstance === "function"
      && typeof candidate.prototype?.dispatchMessage === "function");
    return dispatcherClass?.getInstance?.() || null;
  }

  async function importAsset(namePart) {
    const url = await findAssetUrl(namePart);
    if (!url) throw new Error(`asset missing: ${namePart}`);
    return import(url);
  }

  function forceReviewModeRequest(type, payload) {
    if (!state.enabled || type !== "fetch" || !payload || typeof payload !== "object") {
      return payload;
    }
    if (payload.method !== "POST" || payload.url !== "vscode://codex/set-setting") {
      return payload;
    }
    if (typeof payload.body !== "string") return payload;

    try {
      const body = JSON.parse(payload.body);
      if (body?.params?.key !== SETTING_KEY || body.params.value === GUARDED_VALUE) {
        return payload;
      }
      state.forcedWrites += 1;
      state.lastForcedAt = new Date().toISOString();
      return {
        ...payload,
        body: JSON.stringify({
          ...body,
          params: { ...body.params, value: GUARDED_VALUE },
        }),
      };
    } catch (error) {
      noteError(error);
      return payload;
    }
  }

  async function installDispatcherPatch() {
    const module = await importAsset("vscode-api-");
    const dispatcher = dispatcherFromModule(module);
    if (!dispatcher) throw new Error("Codex dispatcher missing");

    if (!dispatcher[PATCH_MARKER]) {
      const previous = dispatcher.dispatchMessage.bind(dispatcher);
      dispatcher[PREVIOUS_DISPATCH] = previous;
      dispatcher.dispatchMessage = (type, payload) => previous(
        type,
        window[GLOBAL_KEY]?.forceReviewModeRequest?.(type, payload) ?? payload
      );
      dispatcher[PATCH_MARKER] = { version: VERSION };
    } else {
      dispatcher[PATCH_MARKER].version = VERSION;
    }
    state.installed = true;
  }

  async function loadSettingAccess() {
    if (state.settingAccess?.definition
      && typeof state.settingAccess.getter === "function"
      && typeof state.settingAccess.setter === "function") {
      return state.settingAccess;
    }

    const settingsModule = await importAsset("use-reduced-motion-");
    const sourceUrls = assetUrls().filter((url) =>
      url.includes("/assets/src-") && url.split("?")[0].endsWith(".js")
    );
    const fallbackSourceUrl = await findAssetUrl("src-");
    if (fallbackSourceUrl) sourceUrls.push(fallbackSourceUrl);

    let settingsGroup = null;
    for (const url of new Set(sourceUrls)) {
      try {
        const definitionsModule = await import(url);
        settingsGroup = Object.values(definitionsModule).find((value) =>
          value
          && typeof value === "object"
          && value.reviewMode?.key === SETTING_KEY
        ) || null;
        if (settingsGroup) break;
      } catch (error) {
        noteError(error);
      }
    }
    const definition = settingsGroup?.reviewMode;
    if (!definition) throw new Error("git-review-mode definition missing");

    const exportedFunctions = Object.values(settingsModule)
      .filter((value) => typeof value === "function");
    const getter = exportedFunctions.find((fn) =>
      Function.prototype.toString.call(fn).includes("get-setting")
    );
    const setter = exportedFunctions.find((fn) =>
      Function.prototype.toString.call(fn).includes("set-setting")
    );
    if (!getter || !setter) throw new Error("Codex setting accessors missing");

    state.settingAccess = { definition, getter, setter };
    return state.settingAccess;
  }

  async function applyGuardedSetting() {
    const { definition, getter, setter } = await loadSettingAccess();
    const currentValue = await getter(definition);
    if (!state.previousValueCaptured) {
      state.previousValue = currentValue;
      state.previousValueCaptured = true;
    }
    if (state.enabled && currentValue !== GUARDED_VALUE) {
      await setter(definition, GUARDED_VALUE);
      state.settingAppliedAt = new Date().toISOString();
    }
    state.settingApplied = true;
    state.currentValue = state.enabled ? GUARDED_VALUE : currentValue;
  }

  async function restorePreviousSetting() {
    if (!state.previousValueCaptured) return false;
    state.enabled = false;
    document.documentElement?.setAttribute("data-codex-git-review-disk-guard", "disabled");
    const { definition, getter, setter } = await loadSettingAccess();
    const currentValue = await getter(definition);
    const shouldRestore = currentValue === GUARDED_VALUE;
    if (shouldRestore && state.previousValue !== GUARDED_VALUE) {
      await setter(definition, state.previousValue);
    }
    state.currentValue = shouldRestore ? state.previousValue : currentValue;
    state.settingRestoredAt = new Date().toISOString();
    return shouldRestore || currentValue === state.previousValue;
  }

  async function installWithRetry() {
    for (let attempt = 0; attempt < 120; attempt += 1) {
      try {
        await installDispatcherPatch();
        await applyGuardedSetting();
        document.documentElement?.setAttribute("data-codex-git-review-disk-guard", "active");
        state.installedAt = new Date().toISOString();
        return;
      } catch (error) {
        if (attempt === 119) noteError(error);
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }

  state.enable = async () => {
    state.enabled = true;
    await applyGuardedSetting();
    document.documentElement?.setAttribute("data-codex-git-review-disk-guard", "active");
    return state.enabled;
  };
  state.disable = async (options = {}) => {
    state.enabled = false;
    const restored = options?.restore !== false
      ? await restorePreviousSetting()
      : false;
    if (restored) state.previousValueCaptured = false;
    document.documentElement?.setAttribute("data-codex-git-review-disk-guard", "disabled");
    return state.enabled;
  };
  state.status = () => ({
    version: state.version,
    enabled: state.enabled,
    installed: state.installed,
    settingApplied: state.settingApplied,
    currentValue: state.currentValue ?? null,
    previousValue: state.previousValue ?? null,
    previousValueCaptured: state.previousValueCaptured,
    forcedWrites: state.forcedWrites,
    lastForcedAt: state.lastForcedAt ?? null,
    settingRestoredAt: state.settingRestoredAt ?? null,
    errors: [...state.errors],
  });

  // Exposed for deterministic VM regression tests and manual restoration.
  state.forceReviewModeRequest = forceReviewModeRequest;
  state.restorePreviousSetting = restorePreviousSetting;

  if (window.__CODEX_GIT_REVIEW_DISK_GUARD_TEST__ !== true) {
    void installWithRetry();
  }
})();

/*
 * Codex++ 用户脚本：让 Ultra 推理继续使用“完全访问权限”。
 *
 * 适配思路：Codex Desktop 在现有任务切到 Ultra 时，会把内置
 * :danger-full-access 临时降到非完全访问模式。本脚本复用 Codex++ 的
 * dispatcher 注入方式，在发往 app-server 前把 Ultra 任务的权限参数恢复为
 * :danger-full-access / never。
 */
(() => {
  "use strict";

  const VERSION = "2026.07.16.4";
  const GLOBAL_KEY = "__codexUltraFullAccess";
  const PATCH_MARKER = "__codexUltraFullAccessPatchVersion";
  const PREVIOUS_DISPATCH = "__codexUltraFullAccessPreviousDispatch";
  const PERMISSION_BUTTON_SELECTOR = 'button[data-composer-navigation-target="permissions"]';
  const FULL_ACCESS_LABEL = "完全访问权限";
  const MAX_SCAN_DEPTH = 7;
  const PATCHABLE_METHODS = new Set([
    "thread/start",
    "turn/start",
    "update-thread-settings-for-next-turn",
  ]);

  const state = window[GLOBAL_KEY] = window[GLOBAL_KEY] || {
    version: VERSION,
    enabled: true,
    installed: false,
    forcedCount: 0,
    lastForcedAt: null,
    lastMethod: null,
    ultraThreadIds: new Set(),
    errors: [],
  };
  state.version = VERSION;
  state.enabled = state.enabled !== false;
  state.uiLabelPatchedCount = Number(state.uiLabelPatchedCount) || 0;
  if (!(state.ultraThreadIds instanceof Set)) state.ultraThreadIds = new Set();
  if (!Array.isArray(state.errors)) state.errors = [];

  function noteError(error) {
    const text = String(error?.stack || error?.message || error);
    state.errors.push(text);
    if (state.errors.length > 20) state.errors.shift();
  }

  function cloneObject(value) {
    return value && typeof value === "object" && !Array.isArray(value)
      ? { ...value }
      : value;
  }

  function reasoningEffortState(value, depth = 0, seen = new WeakSet()) {
    if (depth >= MAX_SCAN_DEPTH || value == null || typeof value !== "object") {
      return "absent";
    }
    if (seen.has(value)) return "absent";
    seen.add(value);

    for (const key of ["reasoningEffort", "reasoning_effort"]) {
      if (!Object.prototype.hasOwnProperty.call(value, key)) continue;
      return String(value[key] ?? "").toLowerCase() === "ultra"
        ? "ultra"
        : "non-ultra";
    }

    let result = "absent";
    for (const child of Object.values(value)) {
      const childState = reasoningEffortState(child, depth + 1, seen);
      if (childState === "ultra") return childState;
      if (childState === "non-ultra") result = childState;
    }
    return result;
  }

  function findThreadId(value, depth = 0, seen = new WeakSet()) {
    if (depth >= 5 || value == null || typeof value !== "object") return "";
    if (seen.has(value)) return "";
    seen.add(value);

    for (const key of ["conversationId", "threadId", "targetConversationId", "localConversationId"]) {
      const candidate = value[key];
      if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
    }
    for (const child of Object.values(value)) {
      const result = findThreadId(child, depth + 1, seen);
      if (result) return result;
    }
    return "";
  }

  function fullAccessSettings(input) {
    const output = cloneObject(input) || {};
    output.permissions = ":danger-full-access";
    output.approvalPolicy = "never";
    output.approvalsReviewer = "user";

    // 新旧协议字段都清理，避免 profile 与低层 sandbox 参数同时出现。
    delete output.sandbox;
    delete output.sandboxPolicy;
    delete output.sandbox_mode;
    delete output.approval_policy;
    delete output.permissionProfile;
    delete output.useAppServerPermissionDefault;
    return output;
  }

  function patchMethodParams(method, params) {
    const next = cloneObject(params) || {};
    if (method === "update-thread-settings-for-next-turn") {
      if (next.threadSettings && typeof next.threadSettings === "object") {
        next.threadSettings = fullAccessSettings(next.threadSettings);
      } else if (next.thread_settings && typeof next.thread_settings === "object") {
        next.thread_settings = fullAccessSettings(next.thread_settings);
      } else {
        return fullAccessSettings(next);
      }
      return next;
    }
    return fullAccessSettings(next);
  }

  function recordForce(method) {
    state.forcedCount += 1;
    state.lastForcedAt = new Date().toISOString();
    state.lastMethod = method;
    document.documentElement?.setAttribute("data-codex-ultra-full-access", "active");
    syncPermissionLabels();
    showActiveToast();
  }

  function showActiveToast() {
    const id = "codex-ultra-full-access-toast";
    let toast = document.getElementById?.(id);
    if (!toast) {
      toast = document.createElement?.("div");
      if (!toast) return;
      toast.id = id;
      toast.textContent = "Ultra · 完全访问已注入";
      Object.assign(toast.style, {
        position: "fixed",
        right: "16px",
        bottom: "16px",
        zIndex: "2147483647",
        padding: "7px 10px",
        border: "1px solid rgba(52, 211, 153, .45)",
        borderRadius: "8px",
        background: "rgba(6, 78, 59, .92)",
        color: "#ecfdf5",
        font: "12px system-ui, sans-serif",
        boxShadow: "0 8px 28px rgba(0, 0, 0, .3)",
        pointerEvents: "none",
      });
      document.body?.appendChild(toast);
    }
    toast.hidden = false;
    window.clearTimeout(state.toastTimer);
    state.toastTimer = window.setTimeout(() => {
      if (toast?.isConnected) toast.hidden = true;
    }, 2200);
  }

  function activeThreadId() {
    const roots = Array.from(document.querySelectorAll(
      "[data-request-user-input-auto-resolution-conversation-id]"
    ));
    const active = roots.find((element) => element.getClientRects().length > 0) || roots[0];
    return active?.getAttribute("data-request-user-input-auto-resolution-conversation-id") || "";
  }

  function shouldShowFullAccessLabel() {
    const threadId = activeThreadId();
    return state.enabled && threadId !== "" && state.ultraThreadIds.has(threadId);
  }

  function permissionLabelNode(button) {
    return button.querySelector('[data-tooltip-overflow-target="true"]')
      || Array.from(button.querySelectorAll("span"))
        .find((span) => span.children.length === 0 && span.textContent?.trim());
  }

  function syncPermissionLabels() {
    const showFullAccess = shouldShowFullAccessLabel();
    for (const button of document.querySelectorAll(PERMISSION_BUTTON_SELECTOR)) {
      const label = permissionLabelNode(button);
      if (!label) continue;

      if (showFullAccess) {
        if (!button.hasAttribute("data-codex-ultra-original-permission-label")) {
          button.setAttribute(
            "data-codex-ultra-original-permission-label",
            label.textContent?.trim() || ""
          );
        }
        if (label.textContent !== FULL_ACCESS_LABEL) {
          label.textContent = FULL_ACCESS_LABEL;
          state.uiLabelPatchedCount += 1;
        }
        button.setAttribute("data-codex-ultra-full-access-label", "active");
        continue;
      }

      if (button.getAttribute("data-codex-ultra-full-access-label") === "active") {
        const original = button.getAttribute("data-codex-ultra-original-permission-label");
        if (original != null) label.textContent = original;
        button.removeAttribute("data-codex-ultra-original-permission-label");
        button.removeAttribute("data-codex-ultra-full-access-label");
      }
    }
  }

  function installPermissionLabelSync() {
    if (state.permissionLabelTimer != null) {
      window.clearInterval(state.permissionLabelTimer);
    }
    syncPermissionLabels();
    state.permissionLabelTimer = window.setInterval(syncPermissionLabels, 500);
  }

  function shouldForce(message) {
    const threadId = findThreadId(message);
    const effortState = reasoningEffortState(message);
    if (threadId && effortState === "ultra") {
      state.ultraThreadIds.add(threadId);
    } else if (threadId && effortState === "non-ultra") {
      state.ultraThreadIds.delete(threadId);
    }
    return effortState === "ultra"
      || (effortState === "absent" && threadId && state.ultraThreadIds.has(threadId));
  }

  function patchMessage(message) {
    if (!state.enabled || !message || typeof message !== "object" || !shouldForce(message)) {
      return message;
    }

    if (message.type === "send-cli-request-for-host") {
      const method = String(message.method || "");
      if (!PATCHABLE_METHODS.has(method)) return message;
      recordForce(method);
      return { ...message, params: patchMethodParams(method, message.params) };
    }

    if ((message.type === "mcp-request" || message.type === "worker-request")
      && message.request && typeof message.request === "object") {
      const method = String(message.request.method || "");
      if (!PATCHABLE_METHODS.has(method)) return message;
      recordForce(method);
      return {
        ...message,
        request: {
          ...message.request,
          params: patchMethodParams(method, message.request.params),
        },
      };
    }

    if (message.type === "thread-prewarm-start" && message.request && typeof message.request === "object") {
      recordForce("thread/start");
      return {
        ...message,
        request: {
          ...message.request,
          params: patchMethodParams("thread/start", message.request.params),
        },
      };
    }

    if (message.type === "prewarm-thread-start-for-host" && message.params && typeof message.params === "object") {
      recordForce("thread/start");
      return { ...message, params: patchMethodParams("thread/start", message.params) };
    }

    if (message.type === "start-turn-for-host" && message.params && typeof message.params === "object") {
      recordForce("turn/start");
      return { ...message, params: patchMethodParams("turn/start", message.params) };
    }

    if (message.type === "start-conversation" || message.type === "start-thread-for-host") {
      recordForce("thread/start");
      const type = message.type;
      return { ...patchMethodParams("thread/start", message), type };
    }

    return message;
  }

  function assetUrls() {
    return [
      ...Array.from(document.scripts || []).map((script) => script.src),
      ...Array.from(document.querySelectorAll("link[href]") || []).map((link) => link.href),
      ...performance.getEntriesByType("resource").map((entry) => entry.name),
    ].filter(Boolean);
  }

  async function findAssetUrl(namePart) {
    const direct = assetUrls().find((url) =>
      url.includes("/assets/") && url.includes(namePart) && url.split("?")[0].endsWith(".js")
    );
    if (direct) return direct;

    for (const src of Array.from(document.scripts || []).map((script) => script.src).filter(Boolean)) {
      if (!src.includes("/assets/") || !src.split("?")[0].endsWith(".js")) continue;
      try {
        const source = await fetch(src).then((response) => response.ok ? response.text() : "");
        const escaped = namePart.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const match = source.match(new RegExp(`["'](\\./assets/${escaped}[^"']+\\.js)["']`));
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
    for (const prefix of ["setting-storage-", "vscode-api-"]) {
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
    if (dispatcher[PATCH_MARKER]) {
      dispatcher[PATCH_MARKER] = VERSION;
      state.installed = true;
      return true;
    }

    const previous = dispatcher.dispatchMessage.bind(dispatcher);
    dispatcher[PREVIOUS_DISPATCH] = previous;
    dispatcher.dispatchMessage = (type, payload) => {
      const controller = window[GLOBAL_KEY];
      const patched = controller?.patchMessage?.({ ...(payload || {}), type })
        || { ...(payload || {}), type };
      const nextType = patched?.type || type;
      const { type: _type, ...nextPayload } = patched || {};
      return previous(nextType, nextPayload);
    };
    dispatcher[PATCH_MARKER] = VERSION;
    state.installed = true;
    document.documentElement?.setAttribute("data-codex-ultra-full-access", "ready");
    return true;
  }

  async function installWithRetry() {
    for (let attempt = 0; attempt < 40; attempt += 1) {
      try {
        if (await installDispatcherPatch()) return;
      } catch (error) {
        if (attempt === 39) noteError(error);
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }

  state.enable = () => {
    state.enabled = true;
    syncPermissionLabels();
    return state.enabled;
  };
  state.disable = () => {
    state.enabled = false;
    syncPermissionLabels();
    document.documentElement?.setAttribute("data-codex-ultra-full-access", "disabled");
    return state.enabled;
  };
  state.patchMessage = patchMessage;
  state.fullAccessSettings = fullAccessSettings;
  state.syncPermissionLabels = syncPermissionLabels;

  if (window.__CODEX_ULTRA_FULL_ACCESS_TEST__ !== true) {
    installPermissionLabelSync();
    void installWithRetry();
  }
})();

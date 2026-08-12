/*
@codex-plus-script
name: AI.INPUT.IM Status Auto Switch
description: Monitor status.input.im and switch the current Codex session to the first healthy model in priority order.
version: 0.2.0
author: AI.INPUT.IM Status Monitor
*/

(() => {
  "use strict";

  const API_KEY = "__inputStatusAutoSwitch";
  const STYLE_ID = "input-status-auto-switch-style";
  const ROOT_ID = "input-status-auto-switch";
  const STORAGE_KEY = "inputStatusAutoSwitch.v1";
  const SOURCE_URL = "https://status.input.im/api/status";
  const DEFAULT_PRIORITY = [
    "gpt-5.6-sol",
    "gpt-5.6-terra",
    "gpt-5.6-luna",
    "gpt-5.5",
    "gpt-5.4",
    "gpt-5.4-mini"
  ];
  const POLL_MS = 60_000;
  const REQUIRED_CONFIRMATIONS = 2;
  const REACT_KEYS = ["__reactFiber$", "__reactInternalInstance$"];

  function chooseHealthyService(services, priority = DEFAULT_PRIORITY) {
    const byModel = new Map((services || []).map((service) => [service?.model, service]));
    for (const model of priority) {
      const service = byModel.get(model);
      if (service?.last?.ok === true) return service;
    }
    return null;
  }

  function normalizeEffort(value) {
    const effort = typeof value === "string" ? value : value?.reasoningEffort;
    return typeof effort === "string" ? effort.toLowerCase() : "";
  }

  function bridgeFromElement(element) {
    if (!element) return null;
    const key = Object.keys(element).find((name) =>
      REACT_KEYS.some((prefix) => name.startsWith(prefix))
    );
    let fiber = key ? element[key] : null;
    for (let depth = 0; fiber && depth < 100; depth += 1, fiber = fiber.return) {
      const props = fiber.memoizedProps || fiber.pendingProps;
      if (!props || typeof props !== "object") continue;
      if (
        Array.isArray(props.models)
        && typeof props.onSelectModel === "function"
        && typeof props.model === "string"
      ) {
        return {
          models: props.models,
          model: props.model,
          reasoningEffort: props.reasoningEffort,
          onSelectModel: props.onSelectModel
        };
      }
      if (Array.isArray(props.powerSelections) && typeof props.onSelectPower === "function") {
        return {
          powerSelections: props.powerSelections,
          selectedPowerSelection: props.selectedPowerSelection,
          onSelectPower: props.onSelectPower
        };
      }
    }
    return null;
  }

  function discoverBridge() {
    const selectors = [
      "[data-model-picker-model-row]",
      "[data-model-picker-power-slider]",
      "[data-codex-intelligence-trigger]",
      "footer button[aria-haspopup='menu']",
      "[data-codex-composer] button[aria-haspopup='menu']"
    ];
    for (const element of document.querySelectorAll(selectors.join(","))) {
      const bridge = bridgeFromElement(element);
      if (bridge) return bridge;
    }
    return null;
  }

  function nativeMenuInUse() {
    return Boolean(document.querySelector(
      '[role="menu"][data-state="open"],[role="listbox"][data-state="open"]'
    ));
  }

  function currentModel(bridge) {
    return bridge?.model || bridge?.selectedPowerSelection?.model || null;
  }

  function selectWithBridge(bridge, modelId) {
    if (!bridge || !modelId) return false;
    if (bridge.model && typeof bridge.onSelectModel === "function") {
      const model = bridge.models.find((item) => item?.model === modelId);
      if (!model) return false;
      const efforts = (model.supportedReasoningEfforts || [])
        .map(normalizeEffort)
        .filter(Boolean);
      const currentEffort = normalizeEffort(bridge.reasoningEffort);
      const defaultEffort = normalizeEffort(model.defaultReasoningEffort);
      const effort = efforts.includes(currentEffort)
        ? currentEffort
        : efforts.includes(defaultEffort)
          ? defaultEffort
          : efforts[0];
      bridge.onSelectModel(modelId, effort);
      return true;
    }
    const option = bridge.powerSelections?.find((item) => item?.model === modelId);
    if (!option) return false;
    bridge.onSelectPower(option);
    return true;
  }

  if (globalThis.__CODEX_STATUS_TEST__) {
    globalThis.__inputStatusTestHooks = {
      chooseHealthyService,
      nativeMenuInUse,
      selectWithBridge
    };
    return;
  }

  window[API_KEY]?.dispose?.();
  const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
  const state = {
    enabled: saved.enabled !== false,
    collapsed: saved.collapsed !== false,
    priority: Array.isArray(saved.priority) && saved.priority.length
      ? saved.priority
      : [...DEFAULT_PRIORITY],
    candidate: null,
    confirmations: 0,
    activeModel: null,
    targetModel: null,
    lastCheckAt: null,
    lastError: null,
    timer: null,
    disposed: false
  };

  function persist() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      enabled: state.enabled,
      collapsed: state.collapsed,
      priority: state.priority
    }));
  }

  function ensureUi() {
    if (!document.head || !document.body) return null;
    let style = document.getElementById(STYLE_ID);
    if (!style) {
      style = document.createElement("style");
      style.id = STYLE_ID;
      style.textContent = `
        #${ROOT_ID}{position:fixed;right:16px;bottom:16px;z-index:2147482000;width:min(320px,calc(100vw - 32px));font-family:ui-sans-serif,system-ui,sans-serif;color:#f1f4f8}
        #${ROOT_ID}[data-collapsed=true]{width:38px;height:38px}
        #${ROOT_ID} *{box-sizing:border-box}
        #${ROOT_ID} .isw-panel{border:1px solid rgba(255,255,255,.14);border-radius:8px;background:#171a21;box-shadow:0 16px 40px rgba(0,0,0,.35);overflow:hidden}
        #${ROOT_ID} .isw-head,#${ROOT_ID} .isw-actions{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 12px}
        #${ROOT_ID} .isw-head{border-bottom:1px solid rgba(255,255,255,.09)}
        #${ROOT_ID} .isw-title{font-size:12px;font-weight:800}
        #${ROOT_ID} .isw-state{font-size:11px;color:#35d07f}
        #${ROOT_ID} .isw-body{display:grid;gap:5px;padding:10px 12px;font-size:11px;color:#9aa4b2}
        #${ROOT_ID} .isw-body strong{color:#f1f4f8;font-family:ui-monospace,Consolas,monospace;overflow-wrap:anywhere}
        #${ROOT_ID} button{min-height:30px;border:1px solid rgba(255,255,255,.14);border-radius:7px;background:#1e232c;color:#f1f4f8;padding:0 10px;cursor:pointer}
        #${ROOT_ID} button:hover{background:#292f3a}
        #${ROOT_ID} button[data-primary=true]{border-color:rgba(53,208,127,.5);color:#35d07f}
        #${ROOT_ID} .isw-collapse{display:grid;place-items:center;width:28px;min-height:28px;padding:0;font-size:16px;line-height:1}
        #${ROOT_ID} .isw-launcher{display:none;width:38px;height:38px;min-height:38px;padding:0;border-color:rgba(53,208,127,.5);border-radius:8px;background:#171a21;box-shadow:0 8px 22px rgba(0,0,0,.3)}
        #${ROOT_ID} .isw-launcher::before{content:"";width:9px;height:9px;border-radius:50%;background:#35d07f;box-shadow:0 0 0 3px rgba(53,208,127,.16)}
        #${ROOT_ID}[data-enabled=false] .isw-launcher::before{background:#9aa4b2;box-shadow:none}
        #${ROOT_ID}[data-collapsed=true] .isw-panel{display:none}
        #${ROOT_ID}[data-collapsed=true] .isw-launcher{display:grid;place-items:center}
      `;
      document.head.appendChild(style);
    }
    let root = document.getElementById(ROOT_ID);
    if (!root) {
      root = document.createElement("aside");
      root.id = ROOT_ID;
      root.innerHTML = `
        <section class="isw-panel">
          <div class="isw-head"><span class="isw-title">AI.INPUT.IM</span><span class="isw-state"></span><button type="button" class="isw-collapse" data-collapse title="Collapse" aria-label="Collapse">&#8722;</button></div>
          <div class="isw-body">
            <span>Current <strong data-current>--</strong></span>
            <span>Target <strong data-target>--</strong></span>
            <span data-message>Waiting for status</span>
          </div>
          <div class="isw-actions">
            <button type="button" data-toggle data-primary="true"></button>
            <button type="button" data-refresh>Check now</button>
          </div>
        </section>
        <button type="button" class="isw-launcher" data-expand title="AI.INPUT.IM status" aria-label="Open AI.INPUT.IM status"></button>
      `;
      root.querySelector("[data-toggle]").addEventListener("click", () => {
        state.enabled = !state.enabled;
        state.confirmations = 0;
        persist();
        render();
        if (state.enabled) void check();
      });
      root.querySelector("[data-refresh]").addEventListener("click", () => void check(true));
      root.querySelector("[data-collapse]").addEventListener("click", () => {
        state.collapsed = true;
        persist();
        render();
      });
      root.querySelector("[data-expand]").addEventListener("click", () => {
        state.collapsed = false;
        persist();
        render();
      });
      document.body.appendChild(root);
    }
    return root;
  }

  function render(message) {
    const root = ensureUi();
    if (!root) return;
    root.dataset.collapsed = String(state.collapsed);
    root.dataset.enabled = String(state.enabled);
    root.querySelector(".isw-state").textContent = state.enabled ? "AUTO" : "PAUSED";
    root.querySelector("[data-current]").textContent = String(state.activeModel || "--");
    root.querySelector("[data-target]").textContent = String(state.targetModel || "--");
    root.querySelector("[data-toggle]").textContent = state.enabled ? "Pause" : "Resume";
    root.querySelector("[data-message]").textContent = String(
      message || state.lastError || (state.lastCheckAt
        ? `Checked ${new Date(state.lastCheckAt).toLocaleTimeString()}`
        : "Waiting for status")
    );
  }

  async function waitForBridge(timeoutMs = 2500) {
    const immediate = discoverBridge();
    if (immediate) return immediate;
    const trigger = [...document.querySelectorAll(
      "[data-codex-intelligence-trigger],footer button[aria-haspopup='menu'],[data-codex-composer] button[aria-haspopup='menu']"
    )].find((item) => item instanceof HTMLElement && item.offsetParent !== null);
    if (!trigger) return null;
    trigger.click();
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      await new Promise((resolve) => setTimeout(resolve, 50));
      const bridge = discoverBridge();
      if (bridge) {
        document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
        return bridge;
      }
    }
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    return null;
  }

  function requestStatusJson(timeoutMs = 15000) {
    const bridge = window.electronBridge;
    if (typeof bridge?.sendMessageFromView !== "function") {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      return fetch(SOURCE_URL, {
        cache: "no-store",
        mode: "cors",
        credentials: "omit",
        headers: { Accept: "application/json" },
        signal: controller.signal
      }).then(async (response) => {
        clearTimeout(timeout);
        if (!response.ok) throw new Error(`Status API HTTP ${response.status}`);
        return response.json();
      }, (error) => {
        clearTimeout(timeout);
        throw error;
      });
    }

    const requestId = `input-status-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    return new Promise((resolve, reject) => {
      let finished = false;
      const finish = (callback, value) => {
        if (finished) return;
        finished = true;
        window.removeEventListener("message", onMessage);
        clearTimeout(timeout);
        callback(value);
      };
      const onMessage = (event) => {
        const data = event.data;
        if (data?.type !== "fetch-response" || data.requestId !== requestId) return;
        if (data.responseType !== "success") {
          finish(reject, new Error(data.error || "Status request failed"));
          return;
        }
        try {
          if (data.status < 200 || data.status >= 300) {
            throw new Error(`Status API HTTP ${data.status}`);
          }
          finish(resolve, JSON.parse(data.bodyJsonString));
        } catch (error) {
          finish(reject, error);
        }
      };
      const timeout = setTimeout(() => {
        Promise.resolve(bridge.sendMessageFromView({ type: "cancel-fetch", requestId })).catch(() => {});
        finish(reject, new Error("Status request timed out"));
      }, timeoutMs);
      window.addEventListener("message", onMessage);
      Promise.resolve(bridge.sendMessageFromView({
        type: "fetch",
        requestId,
        method: "GET",
        url: SOURCE_URL,
        headers: { accept: "application/json" }
      })).catch((error) => finish(reject, error));
    });
  }
  async function check(manual = false) {
    if (state.disposed || (!state.enabled && !manual)) return;
    try {
      const data = await requestStatusJson();

      const target = chooseHealthyService(data.services, state.priority);
      if (!target) throw new Error("No healthy priority model");
      state.targetModel = target.model;
      state.lastCheckAt = Date.now();
      state.lastError = null;
      if (state.candidate === target.model) state.confirmations += 1;
      else {
        state.candidate = target.model;
        state.confirmations = 1;
      }
      if (nativeMenuInUse()) {
        render("Model menu is in use; switching deferred");
        return;
      }


      const bridge = await waitForBridge();
      if (!bridge) {
        render("Open the native model menu once to enable switching");
        return;
      }
      state.activeModel = currentModel(bridge);
      if (state.activeModel === target.model) {
        state.confirmations = REQUIRED_CONFIRMATIONS;
        render("Current model is healthy");
        return;
      }
      if (!manual && state.confirmations < REQUIRED_CONFIRMATIONS) {
        render(`Confirming ${target.model} (${state.confirmations}/${REQUIRED_CONFIRMATIONS})`);
        return;
      }
      if (!selectWithBridge(bridge, target.model)) {
        throw new Error(`Model is not available in Codex: ${target.model}`);
      }
      render(`Switch requested: ${target.model}; awaiting Codex confirmation`);
    } catch (error) {
      state.lastError = String(error?.message || error);
      state.lastCheckAt = Date.now();
      render();
    }
  }

  function dispose() {
    state.disposed = true;
    if (state.timer) clearInterval(state.timer);
    document.getElementById(ROOT_ID)?.remove();
    document.getElementById(STYLE_ID)?.remove();
    if (window[API_KEY]?.version === "0.2.0") delete window[API_KEY];
  }

  function start() {
    ensureUi();
    void check();
    state.timer = setInterval(() => void check(), POLL_MS);
  }

  window[API_KEY] = {
    version: "0.2.0",
    check: () => check(true),
    getState: () => ({ ...state, timer: undefined }),
    setEnabled(enabled) {
      state.enabled = Boolean(enabled);
      persist();
      render();
    },
    dispose
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
})();

/*
@codex-plus-script
name: Window Model Isolation
description: codex在某个版本之后模型配置快照不再是窗口级，而是全局。回复时一个不注意就会发生在逆向任务的窗口用自己的官key，这非常可怕！这份脚本可以维护对话级别的模型配置快照。
version: 1.0.0
author: tohsakarat
*/

(() => {
  "use strict";

  const API_KEY = "__codexWindowModelIsolation";
  const STORAGE_KEY = "codexPlus.windowModelIsolation.v1";
  const TRIGGER_SELECTOR = '[data-codex-intelligence-trigger="true"]';
  const COMPOSER_SELECTOR = '[data-codex-composer="true"]';
  const ACTIVE_THREAD_SELECTORS = [
    '[aria-current="page"][data-app-action-sidebar-thread-id]',
    '[data-app-action-sidebar-thread-active="true"][data-app-action-sidebar-thread-id]',
    '[aria-selected="true"][data-app-action-sidebar-thread-id]',
  ];
  const EFFORT_RANK = ["none", "minimal", "low", "medium", "high", "xhigh", "max", "ultra"];
  const RESTORE_DELAYS = [0, 80, 240];
  const STYLE_ID = "codex-window-model-isolation-style";
  const TOAST_ID = "codex-window-model-isolation-toast";

  window[API_KEY]?.destroy?.();

  const state = {
    observer: null,
    poll: 0,
    timers: new Set(),
    restoring: false,
    userSelectionUntil: 0,
    lastContextKey: null,
  };

  function normalizeText(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function loadStore() {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return { windowDefault: null, contexts: {} };
    const parsed = JSON.parse(raw);
    return {
      windowDefault: parsed.windowDefault || null,
      contexts: parsed.contexts || {},
    };
  }

  function saveStore(store) {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  }

  function selectedThreadId() {
    for (const selector of ACTIVE_THREAD_SELECTORS) {
      const id = document.querySelector(selector)?.getAttribute("data-app-action-sidebar-thread-id");
      if (id) return id.toLowerCase();
    }

    const meterId = window.__codexContextMeter?.getState?.().activeConversationId;
    return meterId ? String(meterId).toLowerCase() : null;
  }

  function contextKey() {
    return selectedThreadId() || "__draft__";
  }

  function visibleTrigger() {
    return Array.from(document.querySelectorAll(TRIGGER_SELECTOR)).find((element) => {
      const rect = element.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    }) || null;
  }

  function currentSelection() {
    const trigger = visibleTrigger();
    if (!trigger) return null;

    const lines = String(trigger.innerText || "")
      .split(/\r?\n/)
      .map(normalizeText)
      .filter(Boolean);
    const model = lines[0] || "";
    const effort = trigger.getAttribute("data-selected-reasoning-effort") || "";
    return model ? { model, effort } : null;
  }

  function sameSelection(left, right) {
    return !!left && !!right && left.model === right.model && left.effort === right.effort;
  }

  function expectedSelection() {
    const store = loadStore();
    return store.contexts[contextKey()] || store.windowDefault;
  }

  function rememberSelection(selection) {
    if (!selection) return;
    const store = loadStore();
    const key = contextKey();
    store.windowDefault = selection;
    store.contexts[key] = selection;
    saveStore(store);
    updateMismatchMarker();
  }

  function adoptInitialSelection() {
    const selection = currentSelection();
    if (!selection) return false;

    const store = loadStore();
    if (!store.windowDefault) store.windowDefault = selection;
    if (!store.contexts[contextKey()]) store.contexts[contextKey()] = store.windowDefault;
    saveStore(store);
    return true;
  }

  function schedule(callback, delay) {
    const timer = window.setTimeout(() => {
      state.timers.delete(timer);
      callback();
    }, delay);
    state.timers.add(timer);
  }

  function activate(element) {
    for (const type of ["pointerdown", "mousedown", "pointerup", "mouseup", "click"]) {
      const EventType = type.startsWith("pointer") && window.PointerEvent
        ? window.PointerEvent
        : window.MouseEvent;
      element.dispatchEvent(new EventType(type, {
        bubbles: true,
        cancelable: true,
        view: window,
        button: 0,
        buttons: type.includes("down") ? 1 : 0,
      }));
    }
  }

  function waitFor(find, timeout = 1200) {
    const startedAt = Date.now();
    return new Promise((resolve) => {
      const check = () => {
        const value = find();
        if (value || Date.now() - startedAt >= timeout) {
          resolve(value || null);
          return;
        }
        schedule(check, 30);
      };
      check();
    });
  }

  function openMenu() {
    const trigger = visibleTrigger();
    if (!trigger) return false;
    if (trigger.getAttribute("aria-expanded") !== "true") activate(trigger);
    return true;
  }

  function openModelList(menu) {
    const activeList = menu.querySelector('[data-model-picker-view="advanced"] [data-active="true"]');
    if (activeList) return;

    const toggle = menu.querySelector('[data-model-picker-view-toggle="true"]');
    if (toggle) activate(toggle);
  }

  function modelItemName(item) {
    const row = item.querySelector('[data-menu-row-content="true"]') || item;
    return String(row.innerText || "").split(/\r?\n/).map(normalizeText).find(Boolean) || "";
  }

  async function selectModel(model) {
    if (!openMenu()) return false;
    const menu = await waitFor(() => Array.from(document.querySelectorAll('[role="menu"]')).find((element) => {
      const rect = element.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0 && element.querySelector('[data-model-picker-view-toggle="true"]');
    }));
    if (!menu) return false;

    openModelList(menu);
    const item = await waitFor(() => Array.from(menu.querySelectorAll('[role="menuitemradio"]')).find(
      (element) => modelItemName(element) === model,
    ));
    if (!item) return false;

    activate(item);
    await waitFor(() => currentSelection()?.model === model);
    return currentSelection()?.model === model;
  }

  function sendArrow(element, key) {
    for (const type of ["keydown", "keyup"]) {
      element.dispatchEvent(new KeyboardEvent(type, {
        bubbles: true,
        cancelable: true,
        key,
        code: key,
      }));
    }
  }

  async function selectEffort(effort) {
    let current = currentSelection();
    if (!current || !effort || current.effort === effort) return true;

    for (let attempt = 0; attempt < 8; attempt += 1) {
      if (!openMenu()) return false;
      const slider = await waitFor(() => {
        const element = document.querySelector('[data-reasoning-slider="true"]');
        if (!element) return null;
        const rect = element.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0 ? element : null;
      });
      if (!slider) return false;

      current = currentSelection();
      if (current?.effort === effort) return true;
      const currentRank = EFFORT_RANK.indexOf(current?.effort || "");
      const targetRank = EFFORT_RANK.indexOf(effort);
      if (currentRank < 0 || targetRank < 0) return false;

      sendArrow(slider, targetRank < currentRank ? "ArrowLeft" : "ArrowRight");
      await new Promise((resolve) => schedule(resolve, 90));
    }

    return currentSelection()?.effort === effort;
  }

  async function restoreExpected() {
    if (state.restoring || Date.now() < state.userSelectionUntil) return;
    if (!document.hasFocus() || document.visibilityState !== "visible") return;

    const expected = expectedSelection();
    const current = currentSelection();
    if (!expected || !current || sameSelection(expected, current)) {
      updateMismatchMarker();
      return;
    }

    state.restoring = true;
    try {
      if (current.model !== expected.model) await selectModel(expected.model);
      await selectEffort(expected.effort);
    } finally {
      state.restoring = false;
      updateMismatchMarker();
    }
  }

  function scheduleRestore() {
    for (const delay of RESTORE_DELAYS) schedule(restoreExpected, delay);
  }

  function updateMismatchMarker() {
    const trigger = visibleTrigger();
    if (!trigger) return;
    const mismatch = !sameSelection(expectedSelection(), currentSelection());
    trigger.toggleAttribute("data-window-model-isolation-mismatch", mismatch);
  }

  function showBlockedToast() {
    document.getElementById(TOAST_ID)?.remove();
    const toast = document.createElement("div");
    toast.id = TOAST_ID;
    toast.textContent = "已拦截发送：当前模型不是本窗口为此任务记录的模型，正在恢复。";
    document.body.appendChild(toast);
    schedule(() => toast.remove(), 3200);
  }

  function blockIfMismatched(event) {
    const expected = expectedSelection();
    const current = currentSelection();
    if (!expected || sameSelection(expected, current)) return false;

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    showBlockedToast();
    scheduleRestore();
    return true;
  }

  function isSendButton(target) {
    const button = target instanceof Element ? target.closest("button") : null;
    if (!button) return false;
    const label = normalizeText(`${button.getAttribute("aria-label") || ""} ${button.innerText || ""}`);
    return /^(发送|send|run|执行)$/i.test(label);
  }

  function handlePointerUp(event) {
    if (!event.isTrusted || !(event.target instanceof Element)) return;

    const selectionControl = event.target.closest('[role="menuitemradio"], [data-reasoning-slider="true"]');
    if (selectionControl) {
      state.userSelectionUntil = Date.now() + 1000;
      for (const delay of [0, 80, 240, 600]) schedule(() => rememberSelection(currentSelection()), delay);
      return;
    }

    if (isSendButton(event.target)) blockIfMismatched(event);
  }

  function handlePointerDown(event) {
    if (!event.isTrusted || !(event.target instanceof Element)) return;
    if (event.target.closest(`${TRIGGER_SELECTOR}, [role="menu"]`)) {
      state.userSelectionUntil = Date.now() + 1500;
    }
  }

  function handleKeyDown(event) {
    if (!event.isTrusted || event.isComposing) return;
    if (event.key !== "Enter" || event.shiftKey) return;
    if (!(event.target instanceof Element) || !event.target.closest(COMPOSER_SELECTOR)) return;
    blockIfMismatched(event);
  }

  function handleContextChange() {
    const nextKey = contextKey();
    if (nextKey !== state.lastContextKey) {
      state.lastContextKey = nextKey;
      const store = loadStore();
      if (!store.contexts[nextKey] && store.windowDefault) {
        store.contexts[nextKey] = store.windowDefault;
        saveStore(store);
      }
      scheduleRestore();
    }
    updateMismatchMarker();
  }

  function installStyle() {
    document.getElementById(STYLE_ID)?.remove();
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      [data-window-model-isolation-mismatch] {
        outline: 2px solid #d83b3b !important;
        outline-offset: 1px;
      }
      #${TOAST_ID} {
        position: fixed;
        left: 50%;
        bottom: 88px;
        z-index: 2147483647;
        transform: translateX(-50%);
        max-width: min(520px, calc(100vw - 32px));
        padding: 10px 14px;
        border: 1px solid color-mix(in srgb, #d83b3b 70%, transparent);
        border-radius: 8px;
        background: color-mix(in srgb, #211 94%, transparent);
        color: #fff;
        box-shadow: 0 8px 28px rgba(0, 0, 0, 0.35);
        font-size: 13px;
        line-height: 1.45;
      }
    `;
    document.head.appendChild(style);
  }

  installStyle();
  document.addEventListener("pointerdown", handlePointerDown, true);
  document.addEventListener("pointerup", handlePointerUp, true);
  document.addEventListener("click", handlePointerUp, true);
  document.addEventListener("keydown", handleKeyDown, true);
  window.addEventListener("focus", scheduleRestore);
  document.addEventListener("visibilitychange", scheduleRestore);

  state.observer = new MutationObserver(handleContextChange);
  state.observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: [
      "aria-current",
      "aria-selected",
      "data-app-action-sidebar-thread-active",
      "data-app-action-sidebar-thread-id",
      "data-selected-reasoning-effort",
    ],
    childList: true,
    subtree: true,
  });

  state.poll = window.setInterval(() => {
    if (adoptInitialSelection()) handleContextChange();
  }, 500);

  window[API_KEY] = {
    version: "1.0.0",
    getState() {
      return {
        contextKey: contextKey(),
        current: currentSelection(),
        expected: expectedSelection(),
        restoring: state.restoring,
      };
    },
    restore: scheduleRestore,
    resetCurrentContext() {
      const store = loadStore();
      delete store.contexts[contextKey()];
      saveStore(store);
      rememberSelection(currentSelection());
    },
    destroy() {
      state.observer?.disconnect();
      window.clearInterval(state.poll);
      for (const timer of state.timers) window.clearTimeout(timer);
      state.timers.clear();
      document.removeEventListener("pointerdown", handlePointerDown, true);
      document.removeEventListener("pointerup", handlePointerUp, true);
      document.removeEventListener("click", handlePointerUp, true);
      document.removeEventListener("keydown", handleKeyDown, true);
      window.removeEventListener("focus", scheduleRestore);
      document.removeEventListener("visibilitychange", scheduleRestore);
      document.getElementById(STYLE_ID)?.remove();
      document.getElementById(TOAST_ID)?.remove();
      delete window[API_KEY];
    },
  };
})();

/* Model Deck v0.1.0 - Codex++ userscript */
(() => {
  // src/index.js
  var API_KEY = "__codexPlusQuickModelPresets";
  var VERSION = "0.1.0";
  var STORAGE_KEY = "codexpp.quickModelPresets.v1";
  var PREVIEW_ID = "codexpp-qmp-preset-preview";
  var LOADING_MESSAGE = "\u7B49\u5F85\u5B98\u65B9\u6A21\u578B\u6570\u636E\uFF0C\u8BF7\u901A\u8FC7 Codex++ \u91CD\u542F ChatGPT";
  var MENU_SELECTOR = '[role="menu"][data-state="open"], [role="listbox"], [data-radix-menu-content][data-state="open"]';
  var TRIGGER_OWNER_SELECTOR = "[data-codex-composer-root],[data-codex-composer],footer,form";
  var REASONING_LABELS = Object.freeze({
    none: "None",
    minimal: "Minimal",
    low: "Low",
    medium: "Medium",
    high: "High",
    xhigh: "Extra high",
    max: "Max",
    ultra: "Ultra"
  });
  var REASONING_RANK = new Map(
    Object.keys(REASONING_LABELS).map((key, index) => [key, index])
  );
  var LEGACY_MODEL_KEYS = /* @__PURE__ */ new Set(["gpt-5.5", "gpt-5.4", "gpt-5.4-mini"]);
  var REASONING_ALIASES = new Map(
    Object.entries({
      none: "none",
      minimal: "minimal",
      low: "low",
      light: "low",
      "\u8F7B\u5EA6": "low",
      medium: "medium",
      "\u4E2D": "medium",
      high: "high",
      "\u9AD8": "high",
      xhigh: "xhigh",
      "extra high": "xhigh",
      "\u6781\u9AD8": "xhigh",
      max: "max",
      maximum: "max",
      "\u6700\u5927": "max",
      "\u6700\u9AD8": "max",
      ultra: "ultra",
      "\u8D85\u9AD8": "ultra"
    })
  );
  var SECTION_PATTERNS = {
    model: [/^model(?:\s|$)/i, /^模型(?:\s|$)/u],
    reasoning: [/^reasoning(?: effort| level)?(?:\s|$)/i, /^推理强度(?:\s|$)/u],
    speed: [/^speed(?:\s|$)/i, /^速度(?:\s|$)/u]
  };
  var inheritedModelList = null;
  try {
    inheritedModelList = window[API_KEY]?.getModelListCache?.() || null;
  } catch {
  }
  window[API_KEY]?.destroy?.();
  var documentRef = window.document;
  var performanceRef = window.performance;
  var lifetime = new window.AbortController();
  var { signal } = lifetime;
  var timers = /* @__PURE__ */ new Set();
  var destroyed = false;
  var root = null;
  var preview = null;
  var actionMenu = null;
  var actionMenuAnchor = null;
  var resizeObserver = null;
  var mutationObserver = null;
  var triggerLifetimes = /* @__PURE__ */ new Map();
  var boundTrigger = null;
  var openTimer = null;
  var closeTimer = null;
  var previewTimer = null;
  var previewHideTimer = null;
  var visible = false;
  var disarmed = false;
  var nativeSuspended = false;
  var pointerOnTrigger = false;
  var pointerOnPanel = false;
  var holdOpen = false;
  var probe = null;
  var probeQueue = Promise.resolve();
  var scanFrame = 0;
  var operationSequence = 0;
  var pendingIntent = null;
  var pumping = false;
  var activeOperation = null;
  var activeIntentTrigger = null;
  var pendingTarget = null;
  var interaction = "idle";
  var message = LOADING_MESSAGE;
  var snapshotGeneration = 0;
  var snapshot = unavailableSnapshot("loading", LOADING_MESSAGE);
  var modelListCache = Array.isArray(inheritedModelList) ? inheritedModelList : [];
  var inheritedModels = projectModels(modelListCache);
  var capabilityGeneration = inheritedModels.length ? 1 : 0;
  var capabilityFingerprint = inheritedModels.length ? JSON.stringify(inheritedModels) : "";
  var capability = inheritedModels.length ? { status: "ready", generation: 1, models: inheritedModels } : { status: "loading", generation: 0, models: [] };
  var store = readStore();
  var renameId = null;
  var finishRename = null;
  var drag = null;
  var presetClickSuppression = null;
  var presetClickSuppressionTimer = null;
  var legacyExpanded = false;
  var autoExpandedLegacyKey = null;
  function unavailableSnapshot(status, text) {
    return {
      status,
      generation: snapshotGeneration,
      current: null,
      models: [],
      reasoningOrder: [],
      message: text
    };
  }
  function later(fn, delay) {
    const timer = window.setTimeout(() => {
      timers.delete(timer);
      fn();
    }, delay);
    timers.add(timer);
    return timer;
  }
  function clearLater(timer) {
    if (timer == null) return;
    window.clearTimeout(timer);
    timers.delete(timer);
  }
  function clearPresetClickSuppression() {
    clearLater(presetClickSuppressionTimer);
    presetClickSuppressionTimer = null;
    presetClickSuppression = null;
  }
  function armPresetClickSuppression(id, taskBound = false, pointerId = null) {
    clearPresetClickSuppression();
    const token = { id, pointerId };
    presetClickSuppression = token;
    if (!taskBound) return;
    const timer = later(() => {
      if (presetClickSuppressionTimer === timer) presetClickSuppressionTimer = null;
      if (presetClickSuppression === token) presetClickSuppression = null;
    }, 0);
    presetClickSuppressionTimer = timer;
  }
  function abortError() {
    return new window.DOMException("Aborted", "AbortError");
  }
  function checkAbort(localSignal) {
    if (destroyed || signal.aborted || localSignal?.aborted) throw abortError();
  }
  function wait(delay, localSignal) {
    checkAbort(localSignal);
    return new Promise((resolve, reject) => {
      const finish = () => {
        signal.removeEventListener("abort", cancel);
        localSignal?.removeEventListener("abort", cancel);
        resolve();
      };
      const cancel = () => {
        clearLater(timer);
        signal.removeEventListener("abort", cancel);
        localSignal?.removeEventListener("abort", cancel);
        reject(abortError());
      };
      const timer = later(finish, delay);
      signal.addEventListener("abort", cancel, { once: true });
      localSignal?.addEventListener("abort", cancel, { once: true });
    });
  }
  async function waitFor(read, localSignal, timeout = 1500) {
    const started = performanceRef.now();
    while (performanceRef.now() - started < timeout) {
      checkAbort(localSignal);
      const value = read();
      if (value) return value;
      await wait(50, localSignal);
    }
    throw new Error("\u5B98\u65B9\u83DC\u5355\u72B6\u6001\u53D8\u66F4\u8D85\u65F6");
  }
  function canonicalReasoning(value) {
    const raw = String(value ?? "").trim();
    return REASONING_ALIASES.get(raw.toLowerCase()) || raw;
  }
  function reasoningOption(value) {
    const raw = typeof value === "string" ? value : value?.reasoningEffort;
    const key = canonicalReasoning(raw);
    if (!key) return null;
    const officialLabel = typeof value === "object" && value ? value.displayName || value.label || value.name : null;
    return { key, label: REASONING_LABELS[key] || String(officialLabel || raw), enabled: true };
  }
  function tierSupportsFast(tier) {
    if (typeof tier === "string") return ["priority", "fast"].includes(tier.toLowerCase());
    const id = String(tier?.id ?? tier?.key ?? tier?.value ?? tier?.tier ?? "").toLowerCase();
    const name = String(tier?.name ?? tier?.displayName ?? tier?.label ?? "").toLowerCase();
    return id === "priority" || name === "fast";
  }
  function projectModels(records) {
    if (!Array.isArray(records)) return [];
    const used = /* @__PURE__ */ new Set();
    const models = [];
    records.forEach((record) => {
      if (!record || !Array.isArray(record.supportedReasoningEfforts)) return;
      if (!Array.isArray(record.serviceTiers)) return;
      const key = String(record.model ?? "").trim();
      const label = String(record.displayName ?? "").trim();
      if (!key || !label || used.has(key)) return;
      const reasoningOptions = record.supportedReasoningEfforts.map(reasoningOption).filter(Boolean);
      if (!reasoningOptions.length || new Set(reasoningOptions.map((item) => item.key)).size !== reasoningOptions.length) return;
      used.add(key);
      models.push({
        key,
        label,
        reasoningOptions,
        defaultReasoningEffort: canonicalReasoning(record.defaultReasoningEffort),
        fastSupported: record.serviceTiers.some(tierSupportsFast)
      });
    });
    return models;
  }
  var requestIds = /* @__PURE__ */ new Set();
  var originalDispatch = window.dispatchEvent;
  function wrappedDispatch(event) {
    try {
      const detail = event?.detail;
      const request = detail?.request;
      if (event?.type === "codex-message-from-view" && detail?.type === "mcp-request" && request?.method === "model/list" && request?.id != null) {
        requestIds.add(String(request.id));
      }
    } catch {
    }
    return originalDispatch.call(this, event);
  }
  window.dispatchEvent = wrappedDispatch;
  function onBridgeMessage(event) {
    try {
      const data = event?.data;
      if (data?.type !== "mcp-response") return;
      const rpc = data.message ?? data.response;
      const matchingId = String(rpc?.id ?? "");
      if (!matchingId || !requestIds.has(matchingId)) return;
      const records = rpc?.result?.data;
      const models = projectModels(records);
      requestIds.delete(matchingId);
      if (!models.length) return;
      modelListCache = JSON.parse(JSON.stringify(records));
      const fingerprint = JSON.stringify(models);
      if (fingerprint === capabilityFingerprint) return;
      capabilityFingerprint = fingerprint;
      capability = { status: "ready", generation: ++capabilityGeneration, models };
      scheduleScan();
      if (visible) void syncSnapshot();
    } catch {
    }
  }
  window.addEventListener("message", onBridgeMessage, { capture: true, signal });
  function emptyStore() {
    return { schemaVersion: 1, revision: 0, nextSequence: 1, updatedAt: 0, presets: [] };
  }
  function nextPresetName(presets) {
    const occupied = /* @__PURE__ */ new Set();
    presets.forEach((preset) => {
      const name = String(preset?.name ?? "");
      if (!/^\d+$/.test(name)) return;
      const value = Number(name);
      if (Number.isSafeInteger(value) && value > 0) occupied.add(value);
    });
    let candidate = 1;
    while (occupied.has(candidate)) candidate += 1;
    return String(candidate);
  }
  function uuid() {
    return window.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
  function normalizePreset(value, index) {
    if (!value || typeof value !== "object") return null;
    const modelKey = String(value.modelKey ?? "").trim();
    const reasoningKey = String(value.reasoningKey ?? "").trim();
    if (!modelKey || !reasoningKey || typeof value.fastEnabled !== "boolean") return null;
    const now = Date.now();
    return {
      id: String(value.id || uuid()),
      name: String(value.name || index + 1).trim() || String(index + 1),
      modelKey,
      modelLabel: String(value.modelLabel || modelKey),
      reasoningKey,
      reasoningLabel: String(value.reasoningLabel || reasoningKey),
      fastEnabled: value.fastEnabled,
      createdAt: Number(value.createdAt) || now,
      updatedAt: Number(value.updatedAt) || now
    };
  }
  function readStore() {
    try {
      const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "null");
      const source = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.presets) ? parsed.presets : [];
      const presets = source.map(normalizePreset).filter(Boolean);
      const largest = presets.reduce((max, item) => /^\d+$/.test(item.name) ? Math.max(max, Number(item.name)) : max, 0);
      return {
        schemaVersion: 1,
        revision: Number(parsed?.revision) || 0,
        nextSequence: Math.max(Number(parsed?.nextSequence) || 1, largest + 1),
        updatedAt: Number(parsed?.updatedAt) || 0,
        presets
      };
    } catch {
      return emptyStore();
    }
  }
  function updateStore(change) {
    const next = { ...store, presets: store.presets.map((item) => ({ ...item })) };
    change(next);
    next.revision += 1;
    next.updatedAt = Date.now();
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    store = next;
    render();
  }
  function accessibleText(element) {
    return String(element?.getAttribute?.("aria-label") || element?.getAttribute?.("title") || element?.textContent || "").replace(/\s+/g, " ").trim();
  }
  function isVisible(element, requireBox = true) {
    if (!(element instanceof window.HTMLElement) || !element.isConnected) return false;
    const style = window.getComputedStyle(element);
    if (style.display === "none" || style.visibility === "hidden") return false;
    if (!requireBox) return true;
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }
  function normalizeModelLabel(label) {
    return String(label || "").trim().toLowerCase().replace(/^gpt[-\s]*/i, "").replace(/[_-]+/g, " ").replace(/\s+/g, " ");
  }
  function isAutoReviewModel(model) {
    return model.key.toLowerCase() === "codex-auto-review" || normalizeModelLabel(model.label) === "codex auto review";
  }
  function isLegacyModel(model) {
    return LEGACY_MODEL_KEYS.has(model.key.toLowerCase());
  }
  function compactModelLabel(label) {
    return String(label || "").replace(/^GPT[-\s]*/i, "").replace(/-/g, " ").replace(/\b(sol|terra|luna|mini)\b/gi, (word) => word[0].toUpperCase() + word.slice(1).toLowerCase());
  }
  function modelLike(text) {
    return /\b(?:gpt[-\s]*)?\d+(?:\.\d+)+(?:[-\s]+[a-z][\w.-]*)?/i.test(text);
  }
  function triggerScore(element) {
    if (element.closest("[data-codexpp-qmp-root]") || !isVisible(element)) return -Infinity;
    const text = accessibleText(element);
    if (/codex\+\+|microphone|send|stop|attachment|麦克风|发送|停止|附件/i.test(text)) return -Infinity;
    let score = element.getAttribute("aria-haspopup") === "menu" ? 100 : 0;
    if (capability.models.some((model) => normalizeModelLabel(text).includes(normalizeModelLabel(model.label)))) score += 60;
    else if (modelLike(text)) score += 45;
    if ([...REASONING_ALIASES.keys()].some((label) => label && text.toLowerCase().includes(label))) score += 25;
    if (element.closest("[data-codex-composer-root],[data-codex-composer],footer")) score += 20;
    if (element.querySelector("svg")) score += 10;
    return score;
  }
  function findTriggers() {
    const candidates = [...documentRef.querySelectorAll('button[aria-haspopup="menu"],[role="button"][aria-haspopup="menu"]')].map((element) => ({ element, score: triggerScore(element) })).filter((item) => item.score >= 140);
    const groups = /* @__PURE__ */ new Map();
    const unowned = [];
    candidates.forEach((candidate) => {
      const owner = candidate.element.closest(TRIGGER_OWNER_SELECTOR);
      if (!owner) {
        unowned.push(candidate);
        return;
      }
      if (!groups.has(owner)) groups.set(owner, []);
      groups.get(owner).push(candidate);
    });
    const winners = [...groups.values()].map(uniqueTrigger).filter(Boolean);
    if (winners.length) return winners;
    const fallback = uniqueTrigger(unowned);
    return fallback ? [fallback] : [];
  }
  function uniqueTrigger(candidates) {
    const ranked = [...candidates].sort((left, right) => right.score - left.score);
    if (!ranked.length || ranked[0].score === ranked[1]?.score) return null;
    return ranked[0].element;
  }
  function isOwnedUi(element) {
    return Boolean(element?.matches?.("[data-codexpp-qmp-root],[data-codexpp-qmp-preview],[data-codexpp-qmp-actions]") || element?.closest?.("[data-codexpp-qmp-root],[data-codexpp-qmp-preview],[data-codexpp-qmp-actions]"));
  }
  function openMenus() {
    return [...documentRef.querySelectorAll(MENU_SELECTOR)].filter((menu) => isVisible(menu, false) && !isOwnedUi(menu));
  }
  function claimProbeRoots() {
    if (!probe) return [];
    openMenus().forEach((menu) => {
      if (!probe.before.has(menu)) {
        menu.setAttribute("data-codexpp-qmp-probe-root", "true");
        probe.roots.add(menu);
      }
    });
    return [...probe.roots].filter((menu) => menu.isConnected);
  }
  function nativeMenuOpen() {
    return openMenus().some((menu) => menu.getAttribute("data-codexpp-qmp-probe-root") !== "true");
  }
  function yieldProbeToUser() {
    if (!probe) return;
    probe.roots.forEach((menu) => menu.removeAttribute("data-codexpp-qmp-probe-root"));
    probe = null;
    nativeTakeover();
  }
  function sectionRow(rootElement, section) {
    return [...rootElement.querySelectorAll('[role="menuitem"][aria-haspopup="menu"]')].find((item) => {
      const text = accessibleText(item);
      return SECTION_PATTERNS[section].some((pattern) => pattern.test(text));
    });
  }
  function menuItems(menu) {
    return [...menu.querySelectorAll('[role="menuitem"],[role="option"]')].filter(
      (item) => item.getAttribute("aria-disabled") !== "true" && item.getAttribute("aria-haspopup") !== "menu"
    );
  }
  function itemLabel(item) {
    const aria = item.getAttribute("aria-label");
    if (aria) return aria.replace(/\s+/g, " ").trim();
    const leaves = [...item.querySelectorAll("span")].filter((span) => !span.querySelector("span") && span.textContent.trim()).map((span) => span.textContent.replace(/\s+/g, " ").trim());
    return leaves[0] || accessibleText(item);
  }
  function dispatchPointerActivation(element) {
    const pointer = {
      bubbles: true,
      cancelable: true,
      composed: true,
      button: 0,
      pointerType: "mouse",
      isPrimary: true
    };
    element.dispatchEvent(new window.PointerEvent("pointerdown", { ...pointer, buttons: 1 }));
    element.dispatchEvent(new window.PointerEvent("pointerup", { ...pointer, buttons: 0 }));
    element.dispatchEvent(new window.MouseEvent("click", {
      bubbles: true,
      cancelable: true,
      composed: true,
      button: 0,
      buttons: 0,
      detail: 1
    }));
  }
  async function closeProbe(localSignal) {
    const current = probe;
    if (!current) return;
    try {
      const stillOpen = () => openMenus().some((menu) => current.roots.has(menu));
      if (stillOpen() && current.trigger?.isConnected) {
        dispatchPointerActivation(current.trigger);
        await waitFor(() => !stillOpen(), localSignal, 250).catch(() => {
        });
      }
      checkAbort(localSignal);
      if (stillOpen() && documentRef.body) {
        dispatchPointerActivation(documentRef.body);
        await waitFor(() => !stillOpen(), localSignal, 750).catch(() => {
        });
      }
    } finally {
      current.roots.forEach((menu) => menu.removeAttribute("data-codexpp-qmp-probe-root"));
      if (probe === current) probe = null;
    }
  }
  async function openMainMenu(localSignal, trigger) {
    checkAbort(localSignal);
    if (!trigger?.isConnected) throw new Error("\u672A\u627E\u5230\u5B98\u65B9\u6A21\u578B\u6309\u94AE");
    if (nativeMenuOpen()) throw new Error("\u5B98\u65B9\u83DC\u5355\u6B63\u5728\u4F7F\u7528\u4E2D");
    probe = { trigger, before: new Set(openMenus()), roots: /* @__PURE__ */ new Set() };
    dispatchPointerActivation(trigger);
    return waitFor(() => {
      const roots = claimProbeRoots();
      return roots.find((menu) => sectionRow(menu, "model"));
    }, localSignal);
  }
  async function openSubmenu(row, main, localSignal) {
    const before = new Set(openMenus());
    const controlledId = row.getAttribute("aria-controls");
    checkAbort(localSignal);
    dispatchPointerActivation(row);
    return waitFor(() => {
      claimProbeRoots();
      const menus = openMenus().filter((menu) => menu !== main && menuItems(menu).length);
      const expectedId = row.getAttribute("aria-controls") || controlledId;
      if (expectedId) return menus.find((menu) => menu.id === expectedId) || null;
      return menus.find((menu) => !before.has(menu));
    }, localSignal);
  }
  function rowValue(row, section) {
    let value = accessibleText(row);
    const prefixes = {
      model: /^(?:model|模型)\s*/iu,
      reasoning: /^(?:reasoning(?: effort| level)?|推理强度)\s*/iu,
      speed: /^(?:speed|速度)\s*/iu
    };
    value = value.replace(prefixes[section], "").trim();
    return value;
  }
  function matchModel(models, label) {
    const wanted = normalizeModelLabel(label);
    const matches = models.filter(
      (model) => normalizeModelLabel(model.label) === wanted || normalizeModelLabel(compactModelLabel(model.label)) === wanted || normalizeModelLabel(model.key) === wanted
    );
    return matches.length === 1 ? matches[0] : null;
  }
  function reasoningFromRow(rowText, model) {
    if (rowText.trim() === "\u6781\u9AD8" && model.reasoningOptions.filter((option) => ["xhigh", "max", "ultra"].includes(option.key)).length > 1) return null;
    const key = canonicalReasoning(rowText);
    const matches = model.reasoningOptions.filter(
      (option) => option.key === key || option.label.toLowerCase() === rowText.toLowerCase()
    );
    return matches.length === 1 ? matches[0] : null;
  }
  function orderedReasoning(models) {
    const seen = /* @__PURE__ */ new Set();
    const order = [];
    models.forEach((model) => model.reasoningOptions.forEach((option) => {
      if (!seen.has(option.key)) {
        seen.add(option.key);
        order.push(option.key);
      }
    }));
    return order.sort((left, right) => (REASONING_RANK.get(left) ?? Number.MAX_SAFE_INTEGER) - (REASONING_RANK.get(right) ?? Number.MAX_SAFE_INTEGER));
  }
  function queuedProbe(work) {
    const run = probeQueue.then(work, work);
    probeQueue = run.catch(() => {
    });
    return run;
  }
  async function readOfficialSnapshot(localSignal, trigger) {
    checkAbort(localSignal);
    if (capability.status !== "ready") return unavailableSnapshot("loading", LOADING_MESSAGE);
    let main = null;
    try {
      main = await openMainMenu(localSignal, trigger);
      const modelRow = sectionRow(main, "model");
      const reasoningRow = sectionRow(main, "reasoning");
      const speedRow = sectionRow(main, "speed");
      if (!modelRow || !reasoningRow) throw new Error("\u5B98\u65B9\u6A21\u578B\u83DC\u5355\u7ED3\u6784\u4E0D\u53EF\u7528");
      const modelText = rowValue(modelRow, "model");
      const reasoningText = rowValue(reasoningRow, "reasoning");
      const speedText = speedRow ? rowValue(speedRow, "speed") : "";
      const modelMenu = await openSubmenu(modelRow, main, localSignal);
      const visibleLabels = menuItems(modelMenu).map(itemLabel).filter(Boolean);
      const visibleModels = capability.models.filter(
        (model) => visibleLabels.some((label) => matchModel([model], label))
      );
      const currentModel = matchModel(visibleModels, modelText);
      if (!visibleModels.length || !currentModel) throw new Error("\u5B98\u65B9\u6A21\u578B\u8EAB\u4EFD\u65E0\u6CD5\u7CBE\u786E\u5339\u914D");
      const selectableModels = visibleModels.filter((model) => !isAutoReviewModel(model));
      const triggerReasoning = trigger?.getAttribute("data-selected-reasoning-effort");
      const triggerMatches = triggerReasoning == null ? [] : currentModel.reasoningOptions.filter(
        (option) => option.key === canonicalReasoning(triggerReasoning)
      );
      const reasoning = triggerReasoning == null ? reasoningFromRow(reasoningText, currentModel) : triggerMatches.length === 1 ? triggerMatches[0] : null;
      if (!reasoning) throw new Error("\u5B98\u65B9\u63A8\u7406\u5F3A\u5EA6\u65E0\u6CD5\u7CBE\u786E\u5339\u914D");
      let fastEnabled = false;
      if (speedRow) {
        if (/^(?:fast|快速)(?:\s|$)/i.test(speedText)) fastEnabled = true;
        else if (!/^(?:standard|标准)(?:\s|$)/i.test(speedText)) throw new Error("\u5B98\u65B9\u901F\u5EA6\u72B6\u6001\u4E0D\u53EF\u7528");
      } else if (currentModel.fastSupported) {
        throw new Error("\u5B98\u65B9\u901F\u5EA6\u83DC\u5355\u4E0D\u53EF\u7528");
      }
      return {
        status: "ready",
        generation: ++snapshotGeneration,
        current: {
          modelKey: currentModel.key,
          modelLabel: compactModelLabel(currentModel.label),
          reasoningKey: reasoning.key,
          reasoningLabel: reasoning.label,
          fastEnabled
        },
        models: selectableModels.map((model) => ({
          ...model,
          label: compactModelLabel(model.label),
          reasoningOptions: model.reasoningOptions.map((option) => ({ ...option }))
        })),
        reasoningOrder: orderedReasoning(selectableModels),
        message: ""
      };
    } catch (error) {
      if (error?.name === "AbortError") throw error;
      return unavailableSnapshot("unavailable", String(error?.message || error));
    } finally {
      await closeProbe(localSignal).catch(() => {
      });
    }
  }
  async function syncSnapshot(options = {}) {
    if (!boundTrigger?.isConnected) bindTriggers(findTriggers());
    const trigger = options.trigger || boundTrigger;
    const result = await queuedProbe(() => readOfficialSnapshot(options.signal, trigger));
    if (!destroyed && trigger === boundTrigger) {
      snapshot = result;
      if (result.status === "ready") {
        const currentModel = result.models.find((model) => model.key === result.current.modelKey);
        if (currentModel && isLegacyModel(currentModel)) {
          if (autoExpandedLegacyKey !== currentModel.key) {
            legacyExpanded = true;
            autoExpandedLegacyKey = currentModel.key;
          }
        } else if (autoExpandedLegacyKey) {
          legacyExpanded = false;
          autoExpandedLegacyKey = null;
        }
      }
      message = result.message;
      render();
    }
    return result;
  }
  async function openMainMenuWhen(localSignal, trigger, matches, failureMessage) {
    const started = performanceRef.now();
    while (performanceRef.now() - started < 1500) {
      try {
        const main = await openMainMenu(localSignal, trigger);
        if (matches(main)) return main;
      } catch (error) {
        if (error?.name === "AbortError") throw error;
      }
      await closeProbe(localSignal).catch(() => {
      });
      await wait(50, localSignal);
    }
    throw new Error(failureMessage);
  }
  function openMainMenuForModel(model, localSignal, trigger) {
    return openMainMenuWhen(localSignal, trigger, (main) => {
      const row = sectionRow(main, "model");
      return row && matchModel([model], rowValue(row, "model"));
    }, "\u5B98\u65B9\u6A21\u578B\u5207\u6362\u672A\u751F\u6548");
  }
  async function selectCombination(target, localSignal, trigger) {
    return queuedProbe(async () => {
      const model = capability.models.find((item) => item.key === target.modelKey);
      if (!model) throw new Error("\u76EE\u6807\u6A21\u578B\u4E0D\u53EF\u7528");
      let main = null;
      try {
        main = await openMainMenu(localSignal, trigger);
        const modelRow = sectionRow(main, "model");
        const modelMenu = await openSubmenu(modelRow, main, localSignal);
        const modelItem = menuItems(modelMenu).find((item) => matchModel([model], itemLabel(item)));
        if (!modelItem) throw new Error("\u5B98\u65B9\u6A21\u578B\u9009\u9879\u4E0D\u53EF\u7528");
        checkAbort(localSignal);
        dispatchPointerActivation(modelItem);
      } finally {
        await closeProbe(localSignal).catch(() => {
        });
      }
      checkAbort(localSignal);
      try {
        main = await openMainMenuForModel(model, localSignal, trigger);
        const row = sectionRow(main, "reasoning");
        const menu = await openSubmenu(row, main, localSignal);
        const index = model.reasoningOptions.findIndex((item2) => item2.key === target.reasoningKey);
        const items = menuItems(menu);
        if (items.length !== model.reasoningOptions.length) throw new Error("\u5B98\u65B9\u63A8\u7406\u83DC\u5355\u4E0E\u6A21\u578B\u80FD\u529B\u4E0D\u4E00\u81F4");
        const item = items[index];
        if (index < 0 || !item) throw new Error("\u5B98\u65B9\u63A8\u7406\u9009\u9879\u4E0D\u53EF\u7528");
        checkAbort(localSignal);
        dispatchPointerActivation(item);
        await waitFor(
          () => canonicalReasoning(trigger?.getAttribute("data-selected-reasoning-effort")) === target.reasoningKey,
          localSignal
        );
      } finally {
        await closeProbe(localSignal).catch(() => {
        });
      }
    });
  }
  async function selectFast(enabled, localSignal, trigger) {
    return queuedProbe(async () => {
      let main = null;
      const pattern = enabled ? /^(?:fast|快速)(?:\s|$)/i : /^(?:standard|标准)(?:\s|$)/i;
      try {
        main = await openMainMenu(localSignal, trigger);
        const row = sectionRow(main, "speed");
        if (!row) throw new Error("\u5F53\u524D\u6A21\u578B\u4E0D\u652F\u6301 Fast");
        const menu = await openSubmenu(row, main, localSignal);
        const item = menuItems(menu).find((entry) => pattern.test(itemLabel(entry)));
        if (!item) throw new Error("\u5B98\u65B9\u901F\u5EA6\u9009\u9879\u4E0D\u53EF\u7528");
        checkAbort(localSignal);
        dispatchPointerActivation(item);
      } finally {
        await closeProbe(localSignal).catch(() => {
        });
      }
      checkAbort(localSignal);
      try {
        await openMainMenuWhen(localSignal, trigger, (rootElement) => {
          const row = sectionRow(rootElement, "speed");
          return row && pattern.test(rowValue(row, "speed"));
        }, "\u5B98\u65B9\u901F\u5EA6\u5207\u6362\u672A\u751F\u6548");
      } finally {
        await closeProbe(localSignal).catch(() => {
        });
      }
    });
  }
  function configValid(target, source = snapshot) {
    if (source.status !== "ready") return false;
    const model = source.models.find((item) => item.key === target.modelKey);
    return Boolean(
      model && model.reasoningOptions.some((item) => item.key === target.reasoningKey) && (!target.fastEnabled || model.fastSupported)
    );
  }
  function sameConfig(a, b) {
    return Boolean(a && b && a.modelKey === b.modelKey && a.reasoningKey === b.reasoningKey && a.fastEnabled === b.fastEnabled);
  }
  function submitTarget(target) {
    if (!configValid(target)) {
      message = "\u6B64\u914D\u7F6E\u5DF2\u4E0D\u53EF\u7528";
      render();
      return;
    }
    const operationId = ++operationSequence;
    const targetModel = snapshot.models.find((model) => model.key === target.modelKey);
    if (targetModel && isLegacyModel(targetModel)) legacyExpanded = true;
    pendingIntent = { operationId, target: { ...target }, trigger: boundTrigger };
    pendingTarget = { ...target };
    activeOperation?.abort();
    void pumpIntents();
  }
  async function applyIntent(intent, localSignal) {
    let current = await syncSnapshot({ signal: localSignal, trigger: intent.trigger });
    if (!configValid(intent.target, current)) throw new Error("\u76EE\u6807\u914D\u7F6E\u5DF2\u4E0D\u53EF\u7528");
    if (sameConfig(current.current, intent.target)) return current;
    if (current.current.modelKey !== intent.target.modelKey || current.current.reasoningKey !== intent.target.reasoningKey) {
      await selectCombination(intent.target, localSignal, intent.trigger);
      current = await syncSnapshot({ signal: localSignal, trigger: intent.trigger });
      if (current.current?.modelKey !== intent.target.modelKey || current.current?.reasoningKey !== intent.target.reasoningKey) {
        throw new Error("\u6A21\u578B\u6216\u63A8\u7406\u5F3A\u5EA6\u672A\u751F\u6548");
      }
    }
    checkAbort(localSignal);
    if (current.current.fastEnabled !== intent.target.fastEnabled) {
      await selectFast(intent.target.fastEnabled, localSignal, intent.trigger);
      current = await syncSnapshot({ signal: localSignal, trigger: intent.trigger });
    }
    if (!sameConfig(current.current, intent.target)) throw new Error("\u5B98\u65B9\u914D\u7F6E\u6821\u9A8C\u5931\u8D25");
    return current;
  }
  async function pumpIntents() {
    if (pumping) return;
    pumping = true;
    try {
      while (pendingIntent && !destroyed) {
        const intent = pendingIntent;
        pendingIntent = null;
        const controller = new window.AbortController();
        activeOperation = controller;
        activeIntentTrigger = intent.trigger;
        interaction = "applying";
        message = "\u6B63\u5728\u5E94\u7528...";
        render();
        try {
          await applyIntent(intent, controller.signal);
          if (intent.operationId === operationSequence) message = "";
        } catch (error) {
          if (error?.name !== "AbortError" && intent.operationId === operationSequence) {
            const failureMessage = String(error?.message || error);
            await syncSnapshot({ trigger: intent.trigger }).catch(() => {
            });
            message = failureMessage;
            render();
          }
        } finally {
          if (activeOperation === controller) {
            activeOperation = null;
            activeIntentTrigger = null;
          }
          if (intent.operationId === operationSequence) {
            pendingTarget = null;
            interaction = "idle";
            render();
          }
        }
      }
    } finally {
      pumping = false;
      if (pendingIntent) void pumpIntents();
    }
  }
  function cancelIntents() {
    operationSequence += 1;
    pendingIntent = null;
    pendingTarget = null;
    activeOperation?.abort();
    activeIntentTrigger = null;
    interaction = "idle";
  }
  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    })[char]);
  }
  function icon(name, size = 16) {
    const paths = {
      zap: '<path d="M4 14a1 1 0 0 1-.78-1.63l9-11a.5.5 0 0 1 .87.45l-1.7 6.68H20a1 1 0 0 1 .78 1.63l-9 11a.5.5 0 0 1-.87-.45l1.7-6.68Z"/>',
      plus: '<path d="M5 12h14M12 5v14"/>',
      chevron: '<path d="m6 9 6 6 6-6"/>',
      pencil: '<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
      trash: '<path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v5M14 11v5"/>'
    };
    return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name]}</svg>`;
  }
  function presetValidity(preset) {
    if (snapshot.status !== "ready") return { valid: false, reason: "\u5B98\u65B9\u6A21\u578B\u6570\u636E\u5C1A\u672A\u5C31\u7EEA" };
    const model = snapshot.models.find((item) => item.key === preset.modelKey);
    if (!model) return { valid: false, reason: "\u6A21\u578B\u4E0D\u53EF\u7528" };
    if (!model.reasoningOptions.some((item) => item.key === preset.reasoningKey)) return { valid: false, reason: "\u63A8\u7406\u5F3A\u5EA6\u4E0D\u53EF\u7528" };
    if (preset.fastEnabled && !model.fastSupported) return { valid: false, reason: "Fast \u4E0D\u53EF\u7528" };
    return { valid: true, reason: "" };
  }
  function matrixHtml() {
    if (snapshot.status !== "ready") return `<div class="qmp-empty">${escapeHtml(snapshot.message || LOADING_MESSAGE)}</div>`;
    const primaryModels = snapshot.models.filter((model2) => !isLegacyModel(model2));
    const legacyModels = snapshot.models.filter(isLegacyModel);
    const effective = pendingTarget || snapshot.current;
    const revealLegacy = legacyExpanded;
    const displayedModels = revealLegacy ? [...primaryModels, ...legacyModels] : primaryModels;
    const columns = orderedReasoning(displayedModels).map((key) => {
      const option = displayedModels.flatMap((model2) => model2.reasoningOptions).find((item) => item.key === key);
      return { key, label: option?.label || key };
    });
    const model = snapshot.models.find((item) => item.key === snapshot.current.modelKey);
    const fastDisabled = !model?.fastSupported;
    const header = `<button class="qmp-icon qmp-fast" data-action="fast" title="Fast" aria-label="Fast" aria-pressed="${effective.fastEnabled}" ${fastDisabled ? "disabled" : ""}>${icon("zap", 15)}</button>${columns.map((item) => `<div class="qmp-column">${escapeHtml(item.label)}</div>`).join("")}`;
    const rows = (models) => models.map((row) => {
      const options = new Map(row.reasoningOptions.map((item) => [item.key, item]));
      const cells = columns.map((column) => {
        const enabled = options.has(column.key);
        const selected = snapshot.current.modelKey === row.key && snapshot.current.reasoningKey === column.key;
        const pending = pendingTarget?.modelKey === row.key && pendingTarget?.reasoningKey === column.key;
        return `<button class="qmp-cell${selected ? " is-selected" : ""}${pending ? " is-pending" : ""}" role="radio" aria-checked="${selected}" aria-disabled="${!enabled}" ${enabled ? "" : "disabled"} data-model="${escapeHtml(row.key)}" data-reasoning="${escapeHtml(column.key)}" aria-label="${escapeHtml(`${row.label} ${column.label}`)}"><span></span></button>`;
      }).join("");
      return `<div class="qmp-model" title="${escapeHtml(row.label)}">${escapeHtml(row.label)}</div>${cells}`;
    }).join("");
    const disclosure = legacyModels.length ? `<button class="qmp-legacy-toggle" data-action="legacy" aria-controls="codexpp-qmp-legacy-models" aria-expanded="${revealLegacy}">${icon("chevron", 14)}<span>5.5 \u53CA\u4EE5\u4E0B</span></button>` : "";
    const legacyRegion = `<div class="qmp-legacy-models" id="codexpp-qmp-legacy-models">${revealLegacy ? rows(legacyModels) : ""}</div>`;
    const width = 104 + columns.length * 64;
    return `<div class="qmp-matrix-scroll"><div class="qmp-grid" style="--qmp-cols:${columns.length};min-width:${width}px">${header}${rows(primaryModels)}${disclosure}${legacyRegion}</div></div>`;
  }
  function presetHtml(preset) {
    const validity = presetValidity(preset);
    const active = sameConfig(snapshot.current, preset);
    const pending = sameConfig(pendingTarget, preset);
    const invalid = snapshot.status === "ready" && !validity.valid;
    return `<div class="qmp-preset${active ? " is-active" : ""}${pending ? " is-pending" : ""}${invalid ? " is-invalid" : ""}" data-preset-id="${escapeHtml(preset.id)}"><button class="qmp-preset-apply" aria-disabled="${!validity.valid}" aria-busy="${pending}" aria-haspopup="menu">${escapeHtml(preset.name)}</button></div>`;
  }
  function render() {
    if (!root || destroyed) return;
    if (renameId && root.querySelector(".qmp-rename")) {
      hidePreview(true);
      if (visible) positionPanel();
      return;
    }
    const active = documentRef.activeElement;
    const focusedPresetId = root.contains(active) ? active.closest?.(".qmp-preset")?.dataset.presetId || null : null;
    const focusedAdd = root.contains(active) && Boolean(active.closest?.(".qmp-add"));
    hidePreview(true);
    if (actionMenu) closeActionMenu(false);
    const cancelledDrag = Boolean(drag);
    if (drag) {
      drag.wrapper.classList.remove("is-dragging");
      drag = null;
      holdOpen = false;
      if (interaction === "dragging") interaction = activeOperation ? "applying" : "idle";
    }
    const canSave = snapshot.status === "ready" && configValid(snapshot.current);
    root.innerHTML = `<div class="qmp-rail"><div class="qmp-presets">${store.presets.map(presetHtml).join("")}</div><button class="qmp-icon qmp-add" data-action="save" aria-label="\u4FDD\u5B58\u5F53\u524D\u914D\u7F6E" title="\u4FDD\u5B58\u5F53\u524D\u914D\u7F6E" ${canSave ? "" : "disabled"}>${icon("plus", 16)}</button></div>${message && snapshot.status === "ready" ? `<div class="qmp-message">${escapeHtml(message)}</div>` : ""}${matrixHtml()}`;
    if (focusedPresetId || focusedAdd) {
      const wrapper = focusedPresetId ? [...root.querySelectorAll(".qmp-preset")].find((item) => item.dataset.presetId === focusedPresetId) : null;
      const replacement = wrapper?.querySelector(".qmp-preset-apply") || root.querySelector(".qmp-add");
      replacement?.focus({ preventScroll: true });
    }
    if (visible) positionPanel();
    if (cancelledDrag) scheduleClose();
  }
  function positionPanel() {
    if (!root || !boundTrigger || root.hidden) return;
    const anchor = boundTrigger.getBoundingClientRect();
    const preferredWidth = snapshot.status === "ready" ? 560 : 360;
    const width = Math.min(preferredWidth, window.innerWidth - 24);
    root.style.width = `${Math.max(320, width)}px`;
    const rect = root.getBoundingClientRect();
    const left = Math.min(window.innerWidth - rect.width - 12, Math.max(12, anchor.left + anchor.width / 2 - rect.width / 2));
    const top = Math.max(12, anchor.top - rect.height - 8);
    root.style.left = `${left}px`;
    root.style.top = `${top}px`;
  }
  function showPreview(presetId, anchor) {
    clearLater(previewTimer);
    clearLater(previewHideTimer);
    const show = () => {
      const preset = store.presets.find((item) => item.id === presetId);
      if (!preset || !visible) return;
      clearPreview();
      const validity = presetValidity(preset);
      preview = documentRef.createElement("div");
      preview.id = PREVIEW_ID;
      preview.setAttribute("role", "tooltip");
      preview.setAttribute("data-codexpp-qmp-preview", "");
      preview.innerHTML = `<div>${escapeHtml(preset.name)}</div><small>${escapeHtml(validity.valid ? `${preset.modelLabel} \xB7 ${preset.reasoningLabel} \xB7 ${preset.fastEnabled ? "Fast" : "Standard"}` : validity.reason)}</small>`;
      documentRef.body.append(preview);
      const apply = anchor.matches?.(".qmp-preset-apply") ? anchor : anchor.querySelector?.(".qmp-preset-apply");
      apply?.setAttribute("aria-describedby", PREVIEW_ID);
      const anchorRect = anchor.getBoundingClientRect();
      const rect = preview.getBoundingClientRect();
      preview.style.left = `${Math.min(window.innerWidth - rect.width - 8, Math.max(8, anchorRect.left + anchorRect.width / 2 - rect.width / 2))}px`;
      const above = anchorRect.top - rect.height - 8;
      const below = Math.min(window.innerHeight - rect.height - 8, anchorRect.bottom + 8);
      preview.style.top = `${Math.max(8, above >= 8 ? above : below)}px`;
    };
    previewTimer = preview ? later(show, 0) : later(show, 120);
  }
  function clearPreview() {
    root?.querySelectorAll(`[aria-describedby="${PREVIEW_ID}"]`).forEach((element) => {
      element.removeAttribute("aria-describedby");
    });
    preview?.remove();
    preview = null;
  }
  function hidePreview(immediate = false) {
    clearLater(previewTimer);
    clearLater(previewHideTimer);
    if (immediate) clearPreview();
    else previewHideTimer = later(clearPreview, 80);
  }
  function closeActionMenu(shouldSchedule = true, restoreFocus = false) {
    const anchor = actionMenuAnchor;
    actionMenu?.remove();
    actionMenu = null;
    actionMenuAnchor = null;
    if (!renameId && !drag) holdOpen = false;
    if (shouldSchedule && visible && !holdOpen) scheduleClose();
    if (restoreFocus && anchor?.isConnected) anchor.focus({ preventScroll: true });
  }
  function beginRename(id) {
    closeActionMenu(false);
    hidePreview(true);
    const wrapper = [...root.querySelectorAll(".qmp-preset")].find((item) => item.dataset.presetId === id);
    const preset = store.presets.find((item) => item.id === id);
    if (!wrapper || !preset) return;
    renameId = id;
    holdOpen = true;
    wrapper.classList.add("is-renaming");
    const input = documentRef.createElement("input");
    input.className = "qmp-rename";
    input.value = preset.name;
    wrapper.append(input);
    input.focus();
    input.select();
    let finished = false;
    const finish = (commit) => {
      if (finished) return;
      finished = true;
      if (finishRename === finish) finishRename = null;
      const name = input.value.trim();
      renameId = null;
      holdOpen = false;
      if (commit && name) updateStore((next) => {
        const item = next.presets.find((entry) => entry.id === id);
        if (item) {
          item.name = name;
          item.updatedAt = Date.now();
        }
      });
      else render();
      scheduleClose();
    };
    finishRename = finish;
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.stopPropagation();
        finish(true);
      }
      if (event.key === "Escape") {
        event.stopPropagation();
        finish(false);
      }
    });
    input.addEventListener("blur", () => later(() => finish(true), 0), { once: true });
  }
  function focusPreset(id) {
    later(() => {
      const wrapper = id ? [...root?.querySelectorAll(".qmp-preset") || []].find((item) => item.dataset.presetId === id) : null;
      const target = wrapper?.querySelector(".qmp-preset-apply") || root?.querySelector(".qmp-add");
      target?.focus({ preventScroll: true });
    }, 0);
  }
  function openActionMenu(id, anchor, point = null) {
    finishRename?.(true);
    anchor = [...root.querySelectorAll(".qmp-preset")].find((item) => item.dataset.presetId === id)?.querySelector(".qmp-preset-apply");
    if (!anchor) return;
    closeActionMenu(false);
    hidePreview(true);
    clearLater(closeTimer);
    holdOpen = true;
    actionMenuAnchor = anchor;
    actionMenu = documentRef.createElement("div");
    actionMenu.setAttribute("data-codexpp-qmp-actions", "");
    actionMenu.setAttribute("role", "menu");
    actionMenu.innerHTML = `<button role="menuitem" data-menu-action="rename">${icon("pencil", 14)}Rename</button><button role="menuitem" data-menu-action="delete">${icon("trash", 14)}Delete</button>`;
    documentRef.body.append(actionMenu);
    const rect = anchor.getBoundingClientRect();
    const menuRect = actionMenu.getBoundingClientRect();
    const preferredLeft = point ? point.x : rect.left;
    const preferredTop = point ? point.y + 4 : rect.bottom + 4;
    const fallbackTop = (point ? point.y : rect.top) - menuRect.height - 4;
    const maxLeft = Math.max(8, window.innerWidth - menuRect.width - 8);
    const maxTop = Math.max(8, window.innerHeight - menuRect.height - 8);
    actionMenu.style.left = `${Math.min(maxLeft, Math.max(8, preferredLeft))}px`;
    actionMenu.style.top = `${preferredTop <= maxTop ? preferredTop : Math.max(8, fallbackTop)}px`;
    actionMenu.addEventListener("pointerdown", (event) => event.stopPropagation());
    actionMenu.addEventListener("keydown", (event) => {
      const items = [...actionMenu.querySelectorAll('[role="menuitem"]')];
      const current = Math.max(0, items.indexOf(documentRef.activeElement));
      let next = null;
      if (event.key === "ArrowDown") next = (current + 1) % items.length;
      if (event.key === "ArrowUp") next = (current - 1 + items.length) % items.length;
      if (event.key === "Home") next = 0;
      if (event.key === "End") next = items.length - 1;
      if (next != null) {
        event.preventDefault();
        event.stopPropagation();
        items[next]?.focus();
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        closeActionMenu(false, true);
        return;
      }
      if ((event.key === "Enter" || event.key === " ") && event.target.closest?.('[role="menuitem"]')) {
        event.preventDefault();
        event.stopPropagation();
        event.target.closest('[role="menuitem"]').click();
      }
    });
    actionMenu.addEventListener("click", (event) => {
      const action = event.target.closest("[data-menu-action]")?.dataset.menuAction;
      if (action === "rename") beginRename(id);
      if (action === "delete") {
        const index = store.presets.findIndex((item) => item.id === id);
        const focusId = store.presets[index + 1]?.id || store.presets[index - 1]?.id || null;
        closeActionMenu(false);
        updateStore((next) => {
          next.presets = next.presets.filter((item) => item.id !== id);
        });
        focusPreset(focusId);
      }
    });
    actionMenu.querySelector('[role="menuitem"]')?.focus({ preventScroll: true });
  }
  function startDrag(event, apply) {
    if (event.button !== 0 || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return;
    clearPresetClickSuppression();
    const wrapper = apply.closest(".qmp-preset");
    drag = {
      id: wrapper.dataset.presetId,
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      active: false,
      wrapper
    };
    apply.setPointerCapture?.(event.pointerId);
  }
  function moveDrag(event) {
    if (!drag) return;
    if (!drag.active && Math.hypot(event.clientX - drag.x, event.clientY - drag.y) > 5) {
      closeActionMenu(false);
      hidePreview(true);
      drag.active = true;
      holdOpen = true;
      interaction = "dragging";
      drag.wrapper.classList.add("is-dragging");
    }
    if (!drag.active) return;
    event.preventDefault();
    const siblings = [...root.querySelectorAll(".qmp-preset")].filter((item) => item !== drag.wrapper);
    const before = siblings.find((item) => event.clientX < item.getBoundingClientRect().left + item.offsetWidth / 2);
    const rail = root.querySelector(".qmp-presets");
    rail.insertBefore(drag.wrapper, before || null);
    const railRect = rail.getBoundingClientRect();
    if (event.clientX < railRect.left + 24) rail.scrollLeft -= 12;
    if (event.clientX > railRect.right - 24) rail.scrollLeft += 12;
  }
  function finishDrag({ cancelled = false, suppressReleasedClick = false } = {}) {
    if (!drag) return;
    const completed = drag.active;
    const id = drag.id;
    const pointerId = drag.pointerId;
    drag.wrapper.classList.remove("is-dragging");
    drag = null;
    holdOpen = false;
    interaction = "idle";
    if (!cancelled && completed) armPresetClickSuppression(id, true, pointerId);
    else if (suppressReleasedClick) armPresetClickSuppression(id, false, pointerId);
    else clearPresetClickSuppression();
    if (!completed) return;
    if (cancelled) {
      render();
      scheduleClose();
      return;
    }
    const order = [...root.querySelectorAll(".qmp-preset")].map((item) => item.dataset.presetId);
    updateStore((next) => {
      const byId = new Map(next.presets.map((item) => [item.id, item]));
      next.presets = order.map((item) => byId.get(item)).filter(Boolean);
    });
  }
  async function savePreset() {
    const fresh = await syncSnapshot({ trigger: boundTrigger });
    if (fresh.status !== "ready" || !configValid(fresh.current, fresh)) return;
    try {
      updateStore((next) => {
        const now = Date.now();
        const name = nextPresetName(next.presets);
        next.nextSequence = Math.max(Number(next.nextSequence) || 1, Number(name) + 1);
        next.presets.push({
          id: uuid(),
          name,
          modelKey: fresh.current.modelKey,
          modelLabel: fresh.current.modelLabel,
          reasoningKey: fresh.current.reasoningKey,
          reasoningLabel: fresh.current.reasoningLabel,
          fastEnabled: fresh.current.fastEnabled,
          createdAt: now,
          updatedAt: now
        });
      });
      later(() => root?.querySelector(".qmp-preset:last-child")?.scrollIntoView({ block: "nearest", inline: "end" }), 0);
    } catch (error) {
      message = `\u4FDD\u5B58\u5931\u8D25\uFF1A${String(error?.message || error)}`;
      render();
    }
  }
  function handleClick(event) {
    const action = event.target.closest("[data-action]")?.dataset.action;
    if (action === "fast" && snapshot.status === "ready") {
      const effective = pendingTarget || snapshot.current;
      submitTarget({ ...effective, fastEnabled: !effective.fastEnabled });
    }
    if (action === "save") void savePreset();
    if (action === "legacy") {
      legacyExpanded = event.target.closest(".qmp-legacy-toggle").getAttribute("aria-expanded") !== "true";
      render();
      root?.querySelector(".qmp-legacy-toggle")?.focus({ preventScroll: true });
    }
    const cell = event.target.closest(".qmp-cell");
    if (cell && !cell.disabled && snapshot.status === "ready") {
      const row = snapshot.models.find((model) => model.key === cell.dataset.model);
      const fastEnabled = (pendingTarget || snapshot.current).fastEnabled && Boolean(row?.fastSupported);
      submitTarget({ modelKey: cell.dataset.model, reasoningKey: cell.dataset.reasoning, fastEnabled });
    }
    const presetButton = event.target.closest(".qmp-preset-apply");
    if (presetButton) {
      if (event.ctrlKey) return;
      const id = presetButton.closest(".qmp-preset").dataset.presetId;
      if (presetClickSuppression?.id === id) {
        clearPresetClickSuppression();
        return;
      }
      const preset = store.presets.find((item) => item.id === id);
      if (preset && presetValidity(preset).valid) submitTarget(preset);
    }
  }
  function handleContextMenu(event) {
    const apply = event.target.closest?.(".qmp-preset-apply");
    if (!apply || !root?.contains(apply)) return;
    event.preventDefault();
    event.stopPropagation();
    const id = apply.closest(".qmp-preset").dataset.presetId;
    if (drag) finishDrag({ cancelled: true });
    const anchor = [...root.querySelectorAll(".qmp-preset")].find((item) => item.dataset.presetId === id)?.querySelector(".qmp-preset-apply") || apply;
    openActionMenu(id, anchor, { x: event.clientX, y: event.clientY });
  }
  function scheduleClose() {
    clearLater(closeTimer);
    if (holdOpen || pointerOnTrigger || pointerOnPanel) return;
    closeTimer = later(closePanel, 180);
  }
  function showPanel() {
    if (destroyed || disarmed || nativeMenuOpen()) return;
    if (!boundTrigger?.isConnected) bindTriggers(findTriggers());
    if (!boundTrigger || !root) return;
    visible = true;
    root.hidden = false;
    render();
    positionPanel();
    void syncSnapshot({ trigger: boundTrigger });
  }
  function closePanel() {
    clearLater(openTimer);
    clearLater(closeTimer);
    visible = false;
    pointerOnPanel = false;
    if (root) root.hidden = true;
    hidePreview(true);
    closeActionMenu();
  }
  function nativeTakeover() {
    nativeSuspended = true;
    disarmed = true;
    cancelIntents();
    closePanel();
  }
  function attachTrigger(next) {
    const lifetime2 = new window.AbortController();
    triggerLifetimes.set(next, lifetime2);
    const local = lifetime2.signal;
    next.addEventListener("pointerenter", () => {
      const alreadyCurrent = boundTrigger === next && pointerOnTrigger;
      boundTrigger = next;
      pointerOnTrigger = true;
      clearLater(closeTimer);
      if (disarmed || alreadyCurrent) return;
      clearLater(openTimer);
      openTimer = later(showPanel, 300);
    }, { signal: local });
    next.addEventListener("pointerleave", () => {
      if (boundTrigger !== next) return;
      pointerOnTrigger = false;
      disarmed = false;
      clearLater(openTimer);
      scheduleClose();
    }, { signal: local });
    next.addEventListener("pointerdown", (event) => {
      boundTrigger = next;
      if (probe && !event.isTrusted) return;
      if (event.isTrusted && probe) yieldProbeToUser();
      else {
        disarmed = true;
        cancelIntents();
        closePanel();
      }
    }, { capture: true, signal: local });
  }
  function bindTriggers(nextTriggers) {
    const next = new Set(nextTriggers);
    const intentTriggerMissing = [pendingIntent?.trigger, activeIntentTrigger].some((trigger) => trigger && !next.has(trigger));
    triggerLifetimes.forEach((lifetime2, trigger) => {
      if (next.has(trigger)) return;
      lifetime2.abort();
      triggerLifetimes.delete(trigger);
    });
    nextTriggers.forEach((trigger) => {
      if (!triggerLifetimes.has(trigger)) attachTrigger(trigger);
    });
    if (intentTriggerMissing) {
      cancelIntents();
      render();
    }
    if (boundTrigger && !next.has(boundTrigger)) {
      boundTrigger = null;
      pointerOnTrigger = false;
      closePanel();
    }
    if (!boundTrigger && nextTriggers.length === 1) boundTrigger = nextTriggers[0];
  }
  function scheduleScan() {
    if (scanFrame || destroyed) return;
    const scan = () => {
      scanFrame = 0;
      bindTriggers(findTriggers());
      if (probe) claimProbeRoots();
      if (visible && nativeMenuOpen()) nativeTakeover();
    };
    scanFrame = window.requestAnimationFrame ? window.requestAnimationFrame(scan) : later(scan, 16);
  }
  function mount() {
    if (destroyed || root || !documentRef.body) return;
    const style = documentRef.createElement("style");
    style.id = "codexpp-qmp-style";
    style.textContent = `
[data-codexpp-qmp-probe-root="true"]{opacity:0!important;pointer-events:none!important}
[data-codexpp-qmp-root]{position:fixed;z-index:2147483000;box-sizing:border-box;max-width:calc(100vw - 24px);max-height:calc(100vh - 24px);overflow:hidden;border:1px solid color-mix(in srgb,currentColor 13%,transparent);border-radius:7px;background:var(--color-background-elevated-primary-opaque,var(--main-surface-primary,#202020));color:var(--color-text-foreground,var(--text-primary,#f3f3f3));box-shadow:0 10px 28px rgb(0 0 0 / 28%);font:12.5px/1.35 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;letter-spacing:0}
[data-codexpp-qmp-root][hidden]{display:none!important}
[data-codexpp-qmp-root] .qmp-rail{box-sizing:border-box;height:38px;padding:6px 8px;display:flex;align-items:center;gap:0;border-bottom:1px solid color-mix(in srgb,currentColor 9%,transparent);background:color-mix(in srgb,currentColor 1.5%,transparent)}
[data-codexpp-qmp-root] .qmp-presets{min-width:0;flex:1;display:flex;gap:2px;overflow-x:auto;overflow-y:hidden;scrollbar-width:none;white-space:nowrap}
[data-codexpp-qmp-root] .qmp-presets::-webkit-scrollbar{display:none}
[data-codexpp-qmp-root] button{box-sizing:border-box;font:inherit;color:inherit;letter-spacing:0}
[data-codexpp-qmp-root] button:focus-visible{outline:2px solid #4d8dff;outline-offset:-2px}
[data-codexpp-qmp-root] .qmp-icon{width:26px;height:26px;flex:0 0 26px;display:grid;place-items:center;border:0;border-radius:5px;background:transparent;cursor:pointer}
[data-codexpp-qmp-root] .qmp-icon:hover:not(:disabled){background:color-mix(in srgb,currentColor 8%,transparent)}
[data-codexpp-qmp-root] .qmp-icon:disabled{opacity:.34;cursor:not-allowed}
[data-codexpp-qmp-root] .qmp-add{position:relative;margin-left:8px}
[data-codexpp-qmp-root] .qmp-add::before{content:"";position:absolute;left:-8px;top:4px;width:1px;height:18px;background:color-mix(in srgb,currentColor 12%,transparent);pointer-events:none}
[data-codexpp-qmp-root] .qmp-fast[aria-pressed="true"]{color:#78aaff;background:rgb(64 132 255 / 13%)}
[data-codexpp-qmp-root] .qmp-preset{position:relative;width:fit-content;height:26px;min-width:36px;max-width:112px;flex:0 0 auto;border-radius:4px}
[data-codexpp-qmp-root] .qmp-preset-apply{position:relative;width:auto;height:26px;min-width:36px;max-width:112px;padding:0 9px;border:0;border-radius:4px;background:transparent;color:var(--color-text-foreground-secondary,var(--text-secondary,#aaa));overflow:hidden;text-overflow:ellipsis;white-space:nowrap;cursor:pointer}
[data-codexpp-qmp-root] .qmp-preset-apply::after{content:"";position:absolute;left:9px;right:9px;bottom:0;height:2px;border-radius:2px;background:transparent}
[data-codexpp-qmp-root] .qmp-preset:hover .qmp-preset-apply,[data-codexpp-qmp-root] .qmp-preset:focus-within .qmp-preset-apply{background:color-mix(in srgb,currentColor 7%,transparent);color:inherit}
[data-codexpp-qmp-root] .qmp-preset.is-active .qmp-preset-apply{color:inherit}
[data-codexpp-qmp-root] .qmp-preset.is-active .qmp-preset-apply::after{background:#4d8dff}
[data-codexpp-qmp-root] .qmp-preset.is-pending .qmp-preset-apply{color:inherit}
[data-codexpp-qmp-root] .qmp-preset.is-pending .qmp-preset-apply::after{background:rgb(77 141 255 / 55%)}
[data-codexpp-qmp-root] .qmp-preset.is-invalid .qmp-preset-apply{color:color-mix(in srgb,var(--color-text-foreground-secondary,var(--text-secondary,#aaa)) 48%,transparent)}
[data-codexpp-qmp-root] .qmp-preset-apply[aria-disabled="true"]{cursor:not-allowed}
[data-codexpp-qmp-root] .qmp-preset.is-dragging{opacity:.65}
[data-codexpp-qmp-root] .qmp-preset.is-dragging .qmp-preset-apply{background:color-mix(in srgb,currentColor 7%,transparent)}
[data-codexpp-qmp-root] .qmp-preset.is-renaming{width:112px;min-width:112px;max-width:112px}
[data-codexpp-qmp-root] .qmp-preset.is-renaming>button{visibility:hidden}
[data-codexpp-qmp-root] .qmp-rename{box-sizing:border-box;position:absolute;inset:0;width:100%;height:26px;border:1px solid #4d8dff;border-radius:4px;background:var(--color-background-elevated-primary-opaque,var(--main-surface-primary,#202020));color:inherit;padding:0 6px;outline:none}
[data-codexpp-qmp-root] .qmp-message{padding:4px 8px;color:var(--color-text-foreground-secondary,var(--text-secondary,#aaa));font-size:11.5px;border-bottom:1px solid color-mix(in srgb,currentColor 7%,transparent)}
[data-codexpp-qmp-root] .qmp-matrix-scroll{max-height:min(360px,58vh);overflow:auto}
[data-codexpp-qmp-root] .qmp-grid{display:grid;grid-template-columns:104px repeat(var(--qmp-cols),minmax(64px,1fr));align-items:center}
[data-codexpp-qmp-root] .qmp-column{position:sticky;top:0;z-index:2;height:36px;display:grid;place-items:center;padding:0 4px;background:var(--color-background-elevated-primary-opaque,var(--main-surface-primary,#202020));color:var(--color-text-foreground-secondary,var(--text-secondary,#aaa));font-size:11.5px;font-weight:500;text-align:center}
[data-codexpp-qmp-root] .qmp-fast{position:sticky;top:5px;z-index:3;margin:5px 0 5px 7px}
[data-codexpp-qmp-root] .qmp-model{height:40px;display:flex;align-items:center;padding:0 9px;border-top:1px solid color-mix(in srgb,currentColor 7%,transparent);font-size:12.5px;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
[data-codexpp-qmp-root] .qmp-cell{height:40px;display:grid;place-items:center;border:0;border-top:1px solid color-mix(in srgb,currentColor 7%,transparent);background:transparent;cursor:pointer}
[data-codexpp-qmp-root] .qmp-cell:hover:not(:disabled){background:color-mix(in srgb,currentColor 4%,transparent)}
[data-codexpp-qmp-root] .qmp-cell>span{width:14px;height:14px;border:1.5px solid color-mix(in srgb,currentColor 38%,transparent);border-radius:50%;display:grid;place-items:center}
[data-codexpp-qmp-root] .qmp-cell.is-selected{background:rgb(77 141 255 / 6%)}
[data-codexpp-qmp-root] .qmp-cell.is-selected>span:after{content:"";width:5px;height:5px;border-radius:50%;background:#4d8dff}
[data-codexpp-qmp-root] .qmp-cell.is-selected>span{border-color:#4d8dff}
[data-codexpp-qmp-root] .qmp-cell.is-pending>span{box-shadow:0 0 0 3px rgb(77 141 255 / 14%)}
[data-codexpp-qmp-root] .qmp-cell:disabled{opacity:1;cursor:not-allowed}
[data-codexpp-qmp-root] .qmp-cell:disabled>span{width:10px;height:1px;border:0;border-radius:1px;background:var(--color-text-foreground-secondary,var(--text-secondary,#aaa));opacity:.32}
[data-codexpp-qmp-root] .qmp-legacy-toggle{grid-column:1/-1;height:30px;display:flex;align-items:center;justify-content:center;gap:5px;border:0;border-top:1px solid color-mix(in srgb,currentColor 7%,transparent);background:color-mix(in srgb,currentColor 1.5%,transparent);color:var(--color-text-foreground-secondary,var(--text-secondary,#aaa));font-size:11.5px;cursor:pointer}
[data-codexpp-qmp-root] .qmp-legacy-toggle:hover{background:color-mix(in srgb,currentColor 5%,transparent);color:inherit}
[data-codexpp-qmp-root] .qmp-legacy-toggle svg{transition:transform 120ms ease}
[data-codexpp-qmp-root] .qmp-legacy-toggle[aria-expanded="true"] svg{transform:rotate(180deg)}
[data-codexpp-qmp-root] .qmp-legacy-models{display:contents}
[data-codexpp-qmp-root] .qmp-empty{min-height:90px;display:grid;place-items:center;padding:18px;color:var(--color-text-foreground-secondary,var(--text-secondary,#aaa));text-align:center}
[data-codexpp-qmp-preview],[data-codexpp-qmp-actions]{position:fixed;z-index:2147483001;box-sizing:border-box;border:1px solid color-mix(in srgb,currentColor 16%,transparent);border-radius:6px;background:var(--color-background-elevated-primary-opaque,var(--main-surface-primary,#202020));color:var(--color-text-foreground,var(--text-primary,#f3f3f3));box-shadow:0 8px 24px rgb(0 0 0 / 28%);font:13px/18px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;letter-spacing:0}
[data-codexpp-qmp-preview]{max-width:320px;padding:8px 10px;pointer-events:none}
[data-codexpp-qmp-preview] small{display:block;color:var(--color-text-foreground-secondary,var(--text-secondary,#aaa));font-size:12px;line-height:16px;white-space:nowrap}
[data-codexpp-qmp-actions]{min-width:110px;padding:4px}
[data-codexpp-qmp-actions] button{width:100%;height:30px;padding:0 8px;display:flex;align-items:center;gap:7px;border:0;border-radius:4px;background:transparent;color:inherit;font:13px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;text-align:left;cursor:pointer}
[data-codexpp-qmp-actions] svg{flex:0 0 14px}
[data-codexpp-qmp-actions] button:hover{background:color-mix(in srgb,currentColor 10%,transparent)}
@media (prefers-reduced-motion:reduce){[data-codexpp-qmp-root],[data-codexpp-qmp-preview]{transition:none!important}}
`;
    documentRef.head?.append(style);
    root = documentRef.createElement("div");
    root.setAttribute("data-codexpp-qmp-root", "");
    root.hidden = true;
    documentRef.body.append(root);
    root.addEventListener("pointerenter", () => {
      pointerOnPanel = true;
      clearLater(closeTimer);
    }, { signal });
    root.addEventListener("pointerleave", () => {
      pointerOnPanel = false;
      scheduleClose();
    }, { signal });
    root.addEventListener("pointerdown", (event) => {
      event.stopPropagation();
      const apply = event.target.closest(".qmp-preset-apply");
      if (apply) startDrag(event, apply);
    }, { signal });
    root.addEventListener("pointermove", moveDrag, { signal });
    root.addEventListener("pointerup", () => finishDrag(), { signal });
    root.addEventListener("pointercancel", (event) => {
      if (drag) finishDrag({ cancelled: true });
      else if (presetClickSuppression?.pointerId === event.pointerId) clearPresetClickSuppression();
    }, { signal });
    root.addEventListener("click", handleClick, { signal });
    root.addEventListener("contextmenu", handleContextMenu, { signal });
    root.addEventListener("pointerover", (event) => {
      const preset = event.target.closest(".qmp-preset");
      if (preset && !preset.contains(event.relatedTarget)) showPreview(preset.dataset.presetId, preset);
    }, { signal });
    root.addEventListener("pointerout", (event) => {
      const preset = event.target.closest(".qmp-preset");
      if (preset && !preset.contains(event.relatedTarget)) hidePreview();
    }, { signal });
    resizeObserver = window.ResizeObserver ? new window.ResizeObserver(positionPanel) : null;
    resizeObserver?.observe(root);
    render();
    scheduleScan();
  }
  function onDocumentPointerDown(event) {
    if (actionMenu && !actionMenu.contains(event.target)) closeActionMenu();
  }
  function onKeyDown(event) {
    if (probe && !event.isTrusted) return;
    const presetButton = event.target.closest?.(".qmp-preset-apply");
    const opensContextMenu = event.key === "ContextMenu" || event.key === "F10" && event.shiftKey;
    if (presetButton && opensContextMenu) {
      event.preventDefault();
      event.stopPropagation();
      const id = presetButton.closest(".qmp-preset").dataset.presetId;
      openActionMenu(id, presetButton);
      return;
    }
    if (event.key !== "Escape" || !visible) return;
    if (actionMenu) {
      event.preventDefault();
      closeActionMenu(false, true);
    } else if (drag) finishDrag({ cancelled: true, suppressReleasedClick: !drag.active });
    else if (renameId) {
      finishRename?.(false);
    } else {
      closePanel();
      boundTrigger?.focus?.();
    }
  }
  documentRef.addEventListener("pointerdown", onDocumentPointerDown, { capture: true, signal });
  documentRef.addEventListener("keydown", onKeyDown, { signal });
  window.addEventListener("resize", positionPanel, { signal });
  window.addEventListener("blur", () => closeActionMenu(false), { signal });
  window.addEventListener("focus", () => {
    if (visible) void syncSnapshot();
  }, { signal });
  window.addEventListener("storage", (event) => {
    if (event.key === STORAGE_KEY) {
      store = readStore();
      render();
    }
  }, { signal });
  documentRef.addEventListener("visibilitychange", () => {
    if (documentRef.visibilityState === "visible" && visible) void syncSnapshot();
  }, { signal });
  mutationObserver = new window.MutationObserver(() => {
    if (probe) claimProbeRoots();
    const userMenuOpen = nativeMenuOpen();
    if (visible && userMenuOpen) nativeTakeover();
    if (!userMenuOpen && nativeSuspended) {
      nativeSuspended = false;
      disarmed = pointerOnTrigger;
    }
    scheduleScan();
  });
  mutationObserver.observe(documentRef, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ["aria-expanded", "aria-checked", "aria-selected", "data-state"]
  });
  if (documentRef.body) mount();
  else documentRef.addEventListener("DOMContentLoaded", mount, { once: true, signal });
  function publicState() {
    return {
      version: VERSION,
      visible,
      interaction,
      message,
      capability: { status: capability.status, generation: capability.generation },
      modelCount: capability.models.filter((model) => !isAutoReviewModel(model)).length,
      snapshot,
      pendingTarget,
      presets: store.presets
    };
  }
  function destroy() {
    if (destroyed) return;
    destroyed = true;
    cancelIntents();
    lifetime.abort();
    triggerLifetimes.forEach((triggerLifetime) => triggerLifetime.abort());
    triggerLifetimes.clear();
    mutationObserver?.disconnect();
    resizeObserver?.disconnect();
    timers.forEach((timer) => window.clearTimeout(timer));
    timers.clear();
    if (scanFrame) {
      if (window.cancelAnimationFrame) window.cancelAnimationFrame(scanFrame);
      else clearLater(scanFrame);
    }
    if (window.dispatchEvent === wrappedDispatch) window.dispatchEvent = originalDispatch;
    probe?.roots.forEach((menu) => menu.removeAttribute("data-codexpp-qmp-probe-root"));
    documentRef.querySelectorAll("[data-codexpp-qmp-root],[data-codexpp-qmp-preview],[data-codexpp-qmp-actions],#codexpp-qmp-style").forEach((element) => element.remove());
    root = null;
    preview = null;
    actionMenu = null;
    if (window[API_KEY] === api) delete window[API_KEY];
  }
  var api = {
    version: VERSION,
    open() {
      disarmed = false;
      showPanel();
    },
    close: closePanel,
    resync() {
      return syncSnapshot();
    },
    getState() {
      return JSON.parse(JSON.stringify(publicState()));
    },
    getModelListCache() {
      return JSON.parse(JSON.stringify(modelListCache));
    },
    destroy
  };
  window[API_KEY] = api;
})();

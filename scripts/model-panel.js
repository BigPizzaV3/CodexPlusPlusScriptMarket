/* Model Panel v0.1.0 - Codex++ userscript (fork of Model Deck by 0xTotoroX) */
(() => {
  // src/index.js
  var API_KEY = "__codexPlusQuickModelPresets";
  var VERSION = "0.1.0";
  var STORAGE_KEY = "codexpp.quickModelPresets.v1";
  var PREVIEW_ID = "codexpp-qmp-preset-preview";
  var LOADING_MESSAGE = "\u7B49\u5F85\u5B98\u65B9\u6A21\u578B\u6570\u636E\uFF0C\u8BF7\u901A\u8FC7 Codex++ \u91CD\u542F ChatGPT";
  var PANEL_SAFE_MARGIN = 12;
  var PANEL_GAP = 8;
  var PANEL_MIN_WIDTH = 360;
  var PANEL_MAX_WIDTH = 760;
  var DEFAULT_MODEL_COLUMN_WIDTH = 112;
  var MODEL_COLUMN_MIN_WIDTH = 112;
  var MODEL_COLUMN_MAX_WIDTH = 320;
  var REASONING_COLUMN_WIDTH = 68;
  var PANEL_CLOSE_DURATION = 120;
  var FLOATING_CLOSE_DURATION = 110;
  var FAST_FEEDBACK_ON_DURATION = 620;
  var FAST_FEEDBACK_OFF_DURATION = 420;
  var HOST_FONT_SIZE_FALLBACK = 15;
  var HOST_FONT_SIZE_MIN = 12;
  var HOST_FONT_SIZE_MAX = 22;
  var DECK_FONT_RATIO = 9 / 10;
  var DECK_FONT_SIZE_MIN = 12;
  var DECK_FONT_SIZE_MAX = 17;
  var HOST_FONT_FAMILY_FALLBACK = '-apple-system, "system-ui", "Segoe UI", sans-serif';
  var HOST_FONT_WEIGHT_FALLBACK = 400;
  var HOST_FONT_WEIGHT_MIN = 100;
  var HOST_FONT_WEIGHT_MAX = 900;
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
  var VERIFIED_REASONING_CAPABILITIES = Object.freeze({
    "grok-4.5": Object.freeze({
      efforts: Object.freeze(["low", "medium", "high"]),
      defaultEffort: "high",
      sourceLabel: "xAI Docs",
      sourceUrl: "https://docs.x.ai/developers/model-capabilities/text/reasoning",
      verifiedAt: "2026-07-26",
      unavailableReason: "xAI \u5B98\u65B9\uFF1AGrok 4.5 \u4EC5\u652F\u6301 Low / Medium / High"
    })
  });
  var DEFAULT_PINNED_MODEL_KEYS = Object.freeze([
    "gpt-5.6-sol",
    "gpt-5.6-terra",
    "gpt-5.6-luna"
  ]);
  var REASONING_ALIASES = new Map(
    Object.entries({
      none: "none",
      minimal: "minimal",
      low: "low",
      light: "low",
      \u8F7B\u5EA6: "low",
      medium: "medium",
      \u4E2D: "medium",
      high: "high",
      \u9AD8: "high",
      xhigh: "xhigh",
      "extra high": "xhigh",
      \u6781\u9AD8: "xhigh",
      max: "max",
      maximum: "max",
      \u6700\u5927: "max",
      \u6700\u9AD8: "max",
      ultra: "ultra",
      \u8D85\u9AD8: "ultra"
    })
  );
  var SECTION_PATTERNS = {
    model: [/^model(?:\s|$)/i, /^模型(?:\s|$)/u],
    reasoning: [
      /^reasoning(?: effort| level)?(?:\s|$)/i,
      /^推理强度(?:\s|$)/u,
      /^effort(?:\s|$)/i
    ],
    speed: [/^speed(?:\s|$)/i, /^速度(?:\s|$)/u]
  };
  var ROW_PREFIXES = {
    model: /^(?:model|模型)\s*/iu,
    reasoning: /^(?:reasoning(?: effort| level)?|推理强度|effort)\s*/iu,
    speed: /^(?:speed|速度)\s*/iu
  };
  var HTML_ESCAPES = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  };
  var ICON_PATHS = {
    zap: '<path d="M4 14a1 1 0 0 1-.78-1.63l9-11a.5.5 0 0 1 .87.45l-1.7 6.68H20a1 1 0 0 1 .78 1.63l-9 11a.5.5 0 0 1-.87-.45l1.7-6.68Z"/>',
    plus: '<path d="M5 12h14M12 5v14"/>',
    chevron: '<path d="m6 9 6 6 6-6"/>',
    pin: '<path d="M12 17v5"/><path d="M5 17h14"/><path d="M6 3h12l-1 7 3 3v2H4v-2l3-3Z"/>',
    pencil: '<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
    trash: '<path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v5M14 11v5"/>'
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
  var typographyObserver = null;
  var triggerLifetimes = /* @__PURE__ */ new Map();
  var boundTrigger = null;
  var openTimer = null;
  var closeTimer = null;
  var panelHideTimer = null;
  var previewTimer = null;
  var previewHideTimer = null;
  var actionMenuHideTimer = null;
  var fastFeedbackTimer = null;
  var visible = false;
  var disarmed = false;
  var nativeSuspended = false;
  var pointerOnTrigger = false;
  var pointerOnPanel = false;
  var focusOnPanel = false;
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
  var modelColumnWidth = store.modelColumnWidth;
  var renameId = null;
  var finishRename = null;
  var drag = null;
  var modelColumnResize = null;
  var presetClickSuppression = null;
  var presetClickSuppressionTimer = null;
  var otherModelsExpanded = false;
  var autoExpandedOtherKey = null;
  var panelLeftLock = null;
  var fastFeedback = null;
  var hostTypography = fallbackHostTypography();
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
  function clamp(value, minimum, maximum) {
    return Math.min(maximum, Math.max(minimum, value));
  }
  function roundPixel(value) {
    return Math.round(value * 100) / 100;
  }
  function syncFastFeedbackPresentation() {
    if (!root) return;
    if (!fastFeedback) {
      root.removeAttribute("data-fast-feedback");
      root.style.removeProperty("--qmp-fast-feedback-delay");
      return;
    }
    const elapsed = clamp(
      performanceRef.now() - fastFeedback.startedAt,
      0,
      fastFeedback.duration
    );
    root.dataset.fastFeedback = fastFeedback.mode;
    root.style.setProperty(
      "--qmp-fast-feedback-delay",
      `${-roundPixel(elapsed)}ms`
    );
  }
  function startFastFeedback(enabled) {
    clearLater(fastFeedbackTimer);
    fastFeedbackTimer = null;
    if (root) {
      root.removeAttribute("data-fast-feedback");
      root.style.removeProperty("--qmp-fast-feedback-delay");
      root.getBoundingClientRect();
    }
    const duration = enabled ? FAST_FEEDBACK_ON_DURATION : FAST_FEEDBACK_OFF_DURATION;
    fastFeedback = {
      mode: enabled ? "on" : "off",
      startedAt: performanceRef.now(),
      duration
    };
    syncFastFeedbackPresentation();
    fastFeedbackTimer = later(() => {
      fastFeedbackTimer = null;
      fastFeedback = null;
      syncFastFeedbackPresentation();
    }, duration + 40);
  }
  function buildTypography(source, fontFamily, hostFontSizeRaw, hostFontWeightRaw) {
    const hostFontSize = clamp(
      Number.isFinite(hostFontSizeRaw) ? hostFontSizeRaw : HOST_FONT_SIZE_FALLBACK,
      HOST_FONT_SIZE_MIN,
      HOST_FONT_SIZE_MAX
    );
    const hostFontWeight = Math.round(
      clamp(
        Number.isFinite(hostFontWeightRaw) ? hostFontWeightRaw : HOST_FONT_WEIGHT_FALLBACK,
        HOST_FONT_WEIGHT_MIN,
        HOST_FONT_WEIGHT_MAX
      )
    );
    const fontSize = roundPixel(
      clamp(
        hostFontSize * DECK_FONT_RATIO,
        DECK_FONT_SIZE_MIN,
        DECK_FONT_SIZE_MAX
      )
    );
    const smallFontSize = roundPixel(
      clamp(fontSize - 1, DECK_FONT_SIZE_MIN - 1, DECK_FONT_SIZE_MAX - 1)
    );
    return {
      source,
      fontFamily: fontFamily || HOST_FONT_FAMILY_FALLBACK,
      hostFontWeight,
      hostFontSize: roundPixel(hostFontSize),
      fontSize,
      smallFontSize,
      lineHeight: roundPixel(fontSize * 1.4),
      smallLineHeight: roundPixel(smallFontSize * 1.4),
      tightLineHeight: roundPixel(fontSize * 1.36)
    };
  }
  function fallbackHostTypography() {
    return buildTypography("fallback", "", NaN, NaN);
  }
  function hostTypographySource() {
    const trigger = [
      ...documentRef.querySelectorAll("[data-codex-intelligence-trigger]")
    ].find((element) => isVisible(element));
    if (trigger) return { element: trigger, source: "model-trigger" };
    const composer = [
      ...documentRef.querySelectorAll(
        '[data-codex-composer] .ProseMirror, [data-codex-composer] [contenteditable="true"], .ProseMirror'
      )
    ].find((element) => isVisible(element));
    if (composer) return { element: composer, source: "composer" };
    if (documentRef.body) return { element: documentRef.body, source: "body" };
    return { element: documentRef.documentElement, source: "document" };
  }
  function readHostTypography() {
    const { element, source } = hostTypographySource();
    if (!element) return fallbackHostTypography();
    const style = window.getComputedStyle(element);
    return buildTypography(
      source,
      style.fontFamily,
      Number.parseFloat(style.fontSize),
      Number.parseFloat(style.fontWeight)
    );
  }
  function typographyFingerprint(value) {
    return [
      value.source,
      value.fontFamily,
      value.hostFontWeight,
      value.hostFontSize,
      value.fontSize
    ].join("|");
  }
  function applyTypographyVariables(element) {
    if (!(element instanceof window.HTMLElement)) return;
    element.style.setProperty(
      "--qmp-host-font-family",
      hostTypography.fontFamily
    );
    element.style.setProperty(
      "--qmp-host-font-weight",
      String(hostTypography.hostFontWeight)
    );
    setCustomPixelStyle(element, "--qmp-font-size", hostTypography.fontSize);
    setCustomPixelStyle(
      element,
      "--qmp-small-font-size",
      hostTypography.smallFontSize
    );
    setCustomPixelStyle(element, "--qmp-line-height", hostTypography.lineHeight);
    setCustomPixelStyle(
      element,
      "--qmp-small-line-height",
      hostTypography.smallLineHeight
    );
    setCustomPixelStyle(
      element,
      "--qmp-tight-line-height",
      hostTypography.tightLineHeight
    );
  }
  function syncHostTypography(force = false) {
    const next = readHostTypography();
    if (force || typographyFingerprint(next) !== typographyFingerprint(hostTypography)) {
      hostTypography = next;
    }
    [root, preview, actionMenu].forEach(applyTypographyVariables);
  }
  function installTypographyObserver() {
    if (typographyObserver) return;
    typographyObserver = new window.MutationObserver(() => syncHostTypography());
    const options = {
      attributes: true,
      attributeFilter: [
        "class",
        "style",
        "data-theme",
        "data-appearance",
        "data-color-mode"
      ]
    };
    if (documentRef.documentElement)
      typographyObserver.observe(documentRef.documentElement, options);
    if (documentRef.body) typographyObserver.observe(documentRef.body, options);
    window.addEventListener("resize", () => syncHostTypography(), {
      passive: true,
      signal
    });
  }
  function pixels(value) {
    return `${roundPixel(value)}px`;
  }
  function setPixelStyle(element, property, value) {
    const next = pixels(value);
    if (element.style[property] !== next) element.style[property] = next;
  }
  function setCustomPixelStyle(element, property, value) {
    const next = pixels(value);
    if (element.style.getPropertyValue(property) !== next)
      element.style.setProperty(property, next);
  }
  function reducedMotion() {
    return Boolean(
      window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches
    );
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
      if (presetClickSuppressionTimer === timer)
        presetClickSuppressionTimer = null;
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
    return {
      key,
      label: REASONING_LABELS[key] || String(officialLabel || raw),
      enabled: true
    };
  }
  function verifiedReasoningCapability(modelKey) {
    return VERIFIED_REASONING_CAPABILITIES[String(modelKey ?? "").trim().toLowerCase()] || null;
  }
  function tierSupportsFast(tier) {
    if (typeof tier === "string")
      return ["priority", "fast"].includes(tier.toLowerCase());
    const id = String(
      tier?.id ?? tier?.key ?? tier?.value ?? tier?.tier ?? ""
    ).toLowerCase();
    const name = String(
      tier?.name ?? tier?.displayName ?? tier?.label ?? ""
    ).toLowerCase();
    return id === "priority" || name === "fast";
  }
  function projectModels(records) {
    if (!Array.isArray(records)) return [];
    const used = /* @__PURE__ */ new Set();
    const models = [];
    records.forEach((record) => {
      if (!record || !Array.isArray(record.supportedReasoningEfforts)) return;
      const key = String(record.model ?? "").trim();
      const label = String(record.displayName ?? "").trim();
      if (!key || !label || used.has(key)) return;
      const projectedReasoningOptions = record.supportedReasoningEfforts.map(reasoningOption).filter(Boolean);
      const reasoningEvidence = verifiedReasoningCapability(key);
      const reasoningOptions = reasoningEvidence ? projectedReasoningOptions.filter(
        (option) => reasoningEvidence.efforts.includes(option.key)
      ) : projectedReasoningOptions;
      if (!reasoningOptions.length || new Set(reasoningOptions.map((item) => item.key)).size !== reasoningOptions.length)
        return;
      const serviceTiers = Array.isArray(record.serviceTiers) ? record.serviceTiers : [];
      used.add(key);
      models.push({
        key,
        label,
        reasoningOptions,
        defaultReasoningEffort: reasoningEvidence?.defaultEffort || canonicalReasoning(record.defaultReasoningEffort),
        reasoningEvidence: reasoningEvidence ? { ...reasoningEvidence, efforts: [...reasoningEvidence.efforts] } : null,
        fastSupported: serviceTiers.some(tierSupportsFast)
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
      modelListCache = window.structuredClone(records);
      const fingerprint = JSON.stringify(models);
      if (fingerprint === capabilityFingerprint) return;
      capabilityFingerprint = fingerprint;
      capability = {
        status: "ready",
        generation: ++capabilityGeneration,
        models
      };
      scheduleScan();
      if (visible) void syncSnapshot();
    } catch {
    }
  }
  window.addEventListener("message", onBridgeMessage, { capture: true, signal });
  function emptyStore() {
    return {
      schemaVersion: 2,
      revision: 0,
      nextSequence: 1,
      updatedAt: 0,
      presets: [],
      pinnedModelKeys: [...DEFAULT_PINNED_MODEL_KEYS],
      modelColumnWidth: DEFAULT_MODEL_COLUMN_WIDTH
    };
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
    if (!modelKey || !reasoningKey || typeof value.fastEnabled !== "boolean")
      return null;
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
  function normalizePinnedModelKeys(value) {
    if (!Array.isArray(value)) return [...DEFAULT_PINNED_MODEL_KEYS];
    return [
      ...new Set(value.map((key) => String(key ?? "").trim()).filter(Boolean))
    ];
  }
  function normalizeModelColumnWidth(value) {
    const width = Number(value);
    if (!Number.isFinite(width)) return DEFAULT_MODEL_COLUMN_WIDTH;
    return clamp(width, MODEL_COLUMN_MIN_WIDTH, MODEL_COLUMN_MAX_WIDTH);
  }
  function readStore() {
    try {
      const parsed = JSON.parse(
        window.localStorage.getItem(STORAGE_KEY) || "null"
      );
      const source = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.presets) ? parsed.presets : [];
      const presets = source.map(normalizePreset).filter(Boolean);
      const largest = presets.reduce(
        (max, item) => /^\d+$/.test(item.name) ? Math.max(max, Number(item.name)) : max,
        0
      );
      return {
        schemaVersion: 2,
        revision: Number(parsed?.revision) || 0,
        nextSequence: Math.max(Number(parsed?.nextSequence) || 1, largest + 1),
        updatedAt: Number(parsed?.updatedAt) || 0,
        presets,
        pinnedModelKeys: normalizePinnedModelKeys(parsed?.pinnedModelKeys),
        modelColumnWidth: normalizeModelColumnWidth(parsed?.modelColumnWidth)
      };
    } catch {
      return emptyStore();
    }
  }
  function updateStore(change, options = {}) {
    const next = {
      ...store,
      presets: store.presets.map((item) => ({ ...item })),
      pinnedModelKeys: [...store.pinnedModelKeys]
    };
    change(next);
    next.schemaVersion = 2;
    next.pinnedModelKeys = normalizePinnedModelKeys(next.pinnedModelKeys);
    next.modelColumnWidth = normalizeModelColumnWidth(next.modelColumnWidth);
    next.revision += 1;
    next.updatedAt = Date.now();
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    store = next;
    modelColumnWidth = next.modelColumnWidth;
    if (options.render !== false) render();
  }
  function accessibleText(element) {
    return String(
      element?.getAttribute?.("aria-label") || element?.getAttribute?.("title") || element?.textContent || ""
    ).replace(/\s+/g, " ").trim();
  }
  function isVisible(element, requireBox = true) {
    if (!(element instanceof window.HTMLElement) || !element.isConnected)
      return false;
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
  function isPinnedModelKey(modelKey) {
    return store.pinnedModelKeys.includes(modelKey);
  }
  function compactModelLabel(label) {
    return String(label || "").replace(/^GPT[-\s]*/i, "").replace(/-/g, " ").replace(
      /\b(sol|terra|luna|mini)\b/gi,
      (word) => word[0].toUpperCase() + word.slice(1).toLowerCase()
    );
  }
  function modelLike(text) {
    return /\b(?:gpt[-\s]*)?\d+(?:\.\d+)+(?:[-\s]+[a-z][\w.-]*)?/i.test(text);
  }
  function triggerScore(element) {
    if (element.closest("[data-codexpp-qmp-root]") || !isVisible(element))
      return -Infinity;
    const text = accessibleText(element);
    if (/codex\+\+|microphone|send|stop|attachment|麦克风|发送|停止|附件/i.test(
      text
    ))
      return -Infinity;
    let score = element.getAttribute("aria-haspopup") === "menu" ? 100 : 0;
    if (capability.models.some(
      (model) => normalizeModelLabel(text).includes(normalizeModelLabel(model.label))
    ))
      score += 60;
    else if (modelLike(text)) score += 45;
    if ([...REASONING_ALIASES.keys()].some(
      (label) => label && text.toLowerCase().includes(label)
    ))
      score += 25;
    if (element.closest("[data-codex-composer-root],[data-codex-composer],footer"))
      score += 20;
    if (element.querySelector("svg")) score += 10;
    return score;
  }
  function findTriggers() {
    const candidates = [
      ...documentRef.querySelectorAll(
        'button[aria-haspopup="menu"],[role="button"][aria-haspopup="menu"]'
      )
    ].map((element) => ({ element, score: triggerScore(element) })).filter((item) => item.score >= 140);
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
    const ranked = [...candidates].sort(
      (left, right) => right.score - left.score
    );
    if (!ranked.length || ranked[0].score === ranked[1]?.score) return null;
    return ranked[0].element;
  }
  function singleMatchingTrigger(triggers, matches) {
    const candidates = triggers.filter(matches);
    return candidates.length === 1 ? candidates[0] : null;
  }
  function resolveTrigger(preferred) {
    const triggers = findTriggers();
    bindTriggers(triggers);
    const available = (trigger) => Boolean(trigger?.isConnected && triggers.includes(trigger));
    if (available(preferred)) return preferred;
    if (available(boundTrigger)) return boundTrigger;
    const hovered = singleMatchingTrigger(triggers, (trigger) => {
      try {
        return trigger.matches(":hover");
      } catch {
        return false;
      }
    });
    const activeElement = documentRef.activeElement;
    const focused = activeElement && singleMatchingTrigger(
      triggers,
      (trigger) => trigger.closest(TRIGGER_OWNER_SELECTOR)?.contains(activeElement)
    );
    const resolved = hovered || focused || (triggers.length === 1 ? triggers[0] : null);
    if (!boundTrigger && resolved) boundTrigger = resolved;
    return resolved;
  }
  function isOwnedUi(element) {
    return Boolean(
      element?.matches?.(
        "[data-codexpp-qmp-root],[data-codexpp-qmp-preview],[data-codexpp-qmp-actions]"
      ) || element?.closest?.(
        "[data-codexpp-qmp-root],[data-codexpp-qmp-preview],[data-codexpp-qmp-actions]"
      )
    );
  }
  function openMenus() {
    return [...documentRef.querySelectorAll(MENU_SELECTOR)].filter(
      (menu) => isVisible(menu, false) && !isOwnedUi(menu)
    );
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
    return openMenus().some(
      (menu) => menu.getAttribute("data-codexpp-qmp-probe-root") !== "true"
    );
  }
  function yieldProbeToUser() {
    if (!probe) return;
    probe.roots.forEach(
      (menu) => menu.removeAttribute("data-codexpp-qmp-probe-root")
    );
    probe = null;
    nativeTakeover();
  }
  function sectionRow(rootElement, section) {
    return [
      ...rootElement.querySelectorAll('[role="menuitem"][aria-haspopup="menu"]')
    ].find((item) => {
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
    element.dispatchEvent(
      new window.PointerEvent("pointerdown", { ...pointer, buttons: 1 })
    );
    element.dispatchEvent(
      new window.PointerEvent("pointerup", { ...pointer, buttons: 0 })
    );
    element.dispatchEvent(
      new window.MouseEvent("click", {
        bubbles: true,
        cancelable: true,
        composed: true,
        button: 0,
        buttons: 0,
        detail: 1
      })
    );
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
      current.roots.forEach(
        (menu) => menu.removeAttribute("data-codexpp-qmp-probe-root")
      );
      if (probe === current) probe = null;
    }
  }
  async function probing(localSignal, work) {
    try {
      return await work();
    } finally {
      await closeProbe(localSignal).catch(() => {
      });
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
      const menus = openMenus().filter(
        (menu) => menu !== main && menuItems(menu).length
      );
      const expectedId = row.getAttribute("aria-controls") || controlledId;
      if (expectedId) return menus.find((menu) => menu.id === expectedId) || null;
      return menus.find((menu) => !before.has(menu));
    }, localSignal);
  }
  function rowValue(row, section) {
    return accessibleText(row).replace(ROW_PREFIXES[section], "").trim();
  }
  function matchModel(models, label) {
    const wanted = normalizeModelLabel(label);
    const matches = models.filter(
      (model) => normalizeModelLabel(model.label) === wanted || normalizeModelLabel(compactModelLabel(model.label)) === wanted || normalizeModelLabel(model.key) === wanted
    );
    return matches.length === 1 ? matches[0] : null;
  }
  function reasoningFromRow(rowText, model) {
    if (rowText.trim() === "\u6781\u9AD8" && model.reasoningOptions.filter(
      (option) => ["xhigh", "max", "ultra"].includes(option.key)
    ).length > 1)
      return null;
    const key = canonicalReasoning(rowText);
    const matches = model.reasoningOptions.filter(
      (option) => option.key === key || option.label.toLowerCase() === rowText.toLowerCase()
    );
    return matches.length === 1 ? matches[0] : null;
  }
  function orderedReasoning(models) {
    const seen = /* @__PURE__ */ new Set();
    const order = [];
    models.forEach(
      (model) => model.reasoningOptions.forEach((option) => {
        if (!seen.has(option.key)) {
          seen.add(option.key);
          order.push(option.key);
        }
      })
    );
    return order.sort(
      (left, right) => (REASONING_RANK.get(left) ?? Number.MAX_SAFE_INTEGER) - (REASONING_RANK.get(right) ?? Number.MAX_SAFE_INTEGER)
    );
  }
  function queuedProbe(work) {
    const run = probeQueue.then(work, work);
    probeQueue = run.catch(() => {
    });
    return run;
  }
  async function readOfficialSnapshot(localSignal, trigger) {
    checkAbort(localSignal);
    if (capability.status !== "ready")
      return unavailableSnapshot("loading", LOADING_MESSAGE);
    try {
      return await probing(localSignal, async () => {
        const main = await openMainMenu(localSignal, trigger);
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
        if (!visibleModels.length || !currentModel)
          throw new Error("\u5B98\u65B9\u6A21\u578B\u8EAB\u4EFD\u65E0\u6CD5\u7CBE\u786E\u5339\u914D");
        const selectableModels = visibleModels.filter(
          (model) => !isAutoReviewModel(model)
        );
        const triggerReasoning = trigger?.getAttribute(
          "data-selected-reasoning-effort"
        );
        const observedReasoningKey = canonicalReasoning(
          triggerReasoning ?? reasoningText
        );
        const triggerMatches = triggerReasoning == null ? [] : currentModel.reasoningOptions.filter(
          (option) => option.key === observedReasoningKey
        );
        const unsupportedReasoning = currentModel.reasoningEvidence && REASONING_LABELS[observedReasoningKey] && !currentModel.reasoningEvidence.efforts.includes(observedReasoningKey) ? {
          key: observedReasoningKey,
          label: REASONING_LABELS[observedReasoningKey],
          enabled: false,
          unsupported: true
        } : null;
        const reasoning = triggerReasoning == null ? reasoningFromRow(reasoningText, currentModel) || unsupportedReasoning : triggerMatches.length === 1 ? triggerMatches[0] : unsupportedReasoning;
        if (!reasoning) throw new Error("\u5B98\u65B9\u63A8\u7406\u5F3A\u5EA6\u65E0\u6CD5\u7CBE\u786E\u5339\u914D");
        let fastEnabled = false;
        if (speedRow) {
          if (/^(?:fast|快速)(?:\s|$)/i.test(speedText)) fastEnabled = true;
          else if (!/^(?:standard|标准)(?:\s|$)/i.test(speedText))
            throw new Error("\u5B98\u65B9\u901F\u5EA6\u72B6\u6001\u4E0D\u53EF\u7528");
        }
        return {
          status: "ready",
          generation: ++snapshotGeneration,
          current: {
            modelKey: currentModel.key,
            modelLabel: compactModelLabel(currentModel.label),
            reasoningKey: reasoning.key,
            reasoningLabel: reasoning.label,
            reasoningSupported: !reasoning.unsupported,
            fastEnabled
          },
          models: selectableModels.map((model) => ({
            ...model,
            label: compactModelLabel(model.label),
            reasoningOptions: model.reasoningOptions.map((option) => ({
              ...option
            }))
          })),
          reasoningOrder: orderedReasoning(selectableModels),
          message: reasoning.unsupported ? currentModel.reasoningEvidence.unavailableReason : ""
        };
      });
    } catch (error) {
      if (error?.name === "AbortError") throw error;
      return unavailableSnapshot("unavailable", String(error?.message || error));
    }
  }
  async function syncSnapshot(options = {}) {
    const trigger = resolveTrigger(options.trigger);
    const result = await queuedProbe(
      () => readOfficialSnapshot(options.signal, trigger)
    );
    if (!destroyed && trigger && trigger === boundTrigger) {
      if (result.status === "ready") {
        snapshot = result;
        const currentModel = result.models.find(
          (model) => model.key === result.current.modelKey
        );
        if (currentModel && !isPinnedModelKey(currentModel.key)) {
          if (autoExpandedOtherKey !== currentModel.key) {
            otherModelsExpanded = true;
            autoExpandedOtherKey = currentModel.key;
          }
        } else if (autoExpandedOtherKey) {
          otherModelsExpanded = false;
          autoExpandedOtherKey = null;
        }
      } else if (snapshot.status !== "ready") {
        snapshot = result;
      }
      if (options.publishMessage !== false) message = result.message;
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
    return openMainMenuWhen(
      localSignal,
      trigger,
      (main) => {
        const row = sectionRow(main, "model");
        return row && matchModel([model], rowValue(row, "model"));
      },
      "\u5B98\u65B9\u6A21\u578B\u5207\u6362\u672A\u751F\u6548"
    );
  }
  async function selectCombination(target, localSignal, trigger) {
    return queuedProbe(async () => {
      const model = capability.models.find(
        (item) => item.key === target.modelKey
      );
      if (!model) throw new Error("\u76EE\u6807\u6A21\u578B\u4E0D\u53EF\u7528");
      await probing(localSignal, async () => {
        const main = await openMainMenu(localSignal, trigger);
        const modelRow = sectionRow(main, "model");
        const modelMenu = await openSubmenu(modelRow, main, localSignal);
        const modelItem = menuItems(modelMenu).find(
          (item) => matchModel([model], itemLabel(item))
        );
        if (!modelItem) throw new Error("\u5B98\u65B9\u6A21\u578B\u9009\u9879\u4E0D\u53EF\u7528");
        checkAbort(localSignal);
        dispatchPointerActivation(modelItem);
      });
      checkAbort(localSignal);
      await probing(localSignal, async () => {
        const main = await openMainMenuForModel(model, localSignal, trigger);
        const row = sectionRow(main, "reasoning");
        const menu = await openSubmenu(row, main, localSignal);
        const items = menuItems(menu);
        const index = model.reasoningOptions.findIndex(
          (item2) => item2.key === target.reasoningKey
        );
        let item = null;
        if (model.reasoningEvidence) {
          const targetOption = model.reasoningOptions[index];
          item = targetOption ? items.find((entry) => {
            const label = itemLabel(entry);
            return canonicalReasoning(label) === targetOption.key || label.toLowerCase() === targetOption.label.toLowerCase();
          }) : null;
        } else {
          if (items.length !== model.reasoningOptions.length)
            throw new Error("\u5B98\u65B9\u63A8\u7406\u83DC\u5355\u4E0E\u6A21\u578B\u80FD\u529B\u4E0D\u4E00\u81F4");
          item = items[index];
        }
        if (index < 0 || !item) throw new Error("\u5B98\u65B9\u63A8\u7406\u9009\u9879\u4E0D\u53EF\u7528");
        checkAbort(localSignal);
        dispatchPointerActivation(item);
        await waitFor(
          () => canonicalReasoning(
            trigger?.getAttribute("data-selected-reasoning-effort")
          ) === target.reasoningKey,
          localSignal
        );
      });
    });
  }
  async function selectFast(enabled, localSignal, trigger) {
    return queuedProbe(async () => {
      const pattern = enabled ? /^(?:fast|快速)(?:\s|$)/i : /^(?:standard|标准)(?:\s|$)/i;
      await probing(localSignal, async () => {
        const main = await openMainMenu(localSignal, trigger);
        const row = sectionRow(main, "speed");
        if (!row) throw new Error("\u5F53\u524D\u6A21\u578B\u4E0D\u652F\u6301 Fast");
        const menu = await openSubmenu(row, main, localSignal);
        const item = menuItems(menu).find(
          (entry) => pattern.test(itemLabel(entry))
        );
        if (!item) throw new Error("\u5B98\u65B9\u901F\u5EA6\u9009\u9879\u4E0D\u53EF\u7528");
        checkAbort(localSignal);
        dispatchPointerActivation(item);
      });
      checkAbort(localSignal);
      await probing(localSignal, async () => {
        await openMainMenuWhen(
          localSignal,
          trigger,
          (rootElement) => {
            const row = sectionRow(rootElement, "speed");
            return row && pattern.test(rowValue(row, "speed"));
          },
          "\u5B98\u65B9\u901F\u5EA6\u5207\u6362\u672A\u751F\u6548"
        );
      });
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
    return Boolean(
      a && b && a.modelKey === b.modelKey && a.reasoningKey === b.reasoningKey && a.fastEnabled === b.fastEnabled
    );
  }
  function submitTarget(target) {
    if (!configValid(target)) {
      message = "\u6B64\u914D\u7F6E\u5DF2\u4E0D\u53EF\u7528";
      render();
      return;
    }
    const operationId = ++operationSequence;
    if (!isPinnedModelKey(target.modelKey)) otherModelsExpanded = true;
    pendingIntent = { operationId, target: { ...target }, trigger: boundTrigger };
    pendingTarget = { ...target };
    activeOperation?.abort();
    void pumpIntents();
  }
  async function applyIntent(intent, localSignal) {
    let current = await syncSnapshot({
      signal: localSignal,
      trigger: intent.trigger
    });
    if (!configValid(intent.target, current)) throw new Error("\u76EE\u6807\u914D\u7F6E\u5DF2\u4E0D\u53EF\u7528");
    if (sameConfig(current.current, intent.target)) return current;
    if (current.current.modelKey !== intent.target.modelKey || current.current.reasoningKey !== intent.target.reasoningKey) {
      await selectCombination(intent.target, localSignal, intent.trigger);
      current = await syncSnapshot({
        signal: localSignal,
        trigger: intent.trigger
      });
      if (current.current?.modelKey !== intent.target.modelKey || current.current?.reasoningKey !== intent.target.reasoningKey) {
        throw new Error("\u6A21\u578B\u6216\u63A8\u7406\u5F3A\u5EA6\u672A\u751F\u6548");
      }
    }
    checkAbort(localSignal);
    if (current.current.fastEnabled !== intent.target.fastEnabled) {
      await selectFast(intent.target.fastEnabled, localSignal, intent.trigger);
      current = await syncSnapshot({
        signal: localSignal,
        trigger: intent.trigger
      });
    }
    if (!sameConfig(current.current, intent.target))
      throw new Error("\u5B98\u65B9\u914D\u7F6E\u6821\u9A8C\u5931\u8D25");
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
            await syncSnapshot({
              trigger: intent.trigger,
              publishMessage: false
            }).catch(() => {
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
    return String(value ?? "").replace(/[&<>"']/g, (char) => HTML_ESCAPES[char]);
  }
  function icon(name, size = 16) {
    return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON_PATHS[name]}</svg>`;
  }
  function presetValidity(preset) {
    if (snapshot.status !== "ready")
      return { valid: false, reason: "\u5B98\u65B9\u6A21\u578B\u6570\u636E\u5C1A\u672A\u5C31\u7EEA" };
    const model = snapshot.models.find((item) => item.key === preset.modelKey);
    if (!model) return { valid: false, reason: "\u6A21\u578B\u4E0D\u53EF\u7528" };
    if (!model.reasoningOptions.some((item) => item.key === preset.reasoningKey))
      return { valid: false, reason: "\u63A8\u7406\u5F3A\u5EA6\u4E0D\u53EF\u7528" };
    if (preset.fastEnabled && !model.fastSupported)
      return { valid: false, reason: "Fast \u4E0D\u53EF\u7528" };
    return { valid: true, reason: "" };
  }
  function partitionModels(models = snapshot.models) {
    const byKey = new Map(models.map((model) => [model.key, model]));
    const pinnedModels = store.pinnedModelKeys.map((key) => byKey.get(key)).filter(Boolean);
    const pinnedKeys = new Set(pinnedModels.map((model) => model.key));
    const otherModels = models.filter((model) => !pinnedKeys.has(model.key));
    return { pinnedModels, otherModels };
  }
  function togglePinnedModel(modelKey) {
    const wasPinned = isPinnedModelKey(modelKey);
    if (wasPinned) {
      otherModelsExpanded = true;
      if (snapshot.current?.modelKey === modelKey || pendingTarget?.modelKey === modelKey) {
        autoExpandedOtherKey = modelKey;
      }
    } else if (autoExpandedOtherKey === modelKey) {
      otherModelsExpanded = false;
      autoExpandedOtherKey = null;
    }
    updateStore((next) => {
      next.pinnedModelKeys = wasPinned ? next.pinnedModelKeys.filter((key) => key !== modelKey) : [...next.pinnedModelKeys, modelKey];
    });
    const replacement = [...root?.querySelectorAll(".qmp-pin") || []].find(
      (button) => button.dataset.modelKey === modelKey
    );
    replacement?.focus({ preventScroll: true });
  }
  function matrixLayout() {
    const { pinnedModels, otherModels } = partitionModels();
    const revealOthers = otherModelsExpanded || pinnedModels.length === 0;
    const displayedModels = revealOthers ? [...pinnedModels, ...otherModels] : pinnedModels;
    const columns = orderedReasoning(displayedModels).map((key) => {
      const option = displayedModels.flatMap((model) => model.reasoningOptions).find((item) => item.key === key);
      return { key, label: option?.label || key };
    });
    return {
      pinnedModels,
      otherModels,
      revealOthers,
      displayedModels,
      columns,
      gridWidth: modelColumnWidth + columns.length * REASONING_COLUMN_WIDTH
    };
  }
  function preferredPanelWidth() {
    if (snapshot.status !== "ready") return PANEL_MIN_WIDTH;
    return matrixLayout().gridWidth + 2;
  }
  function applyModelColumnWidth(value) {
    modelColumnWidth = normalizeModelColumnWidth(value);
    const grid = root?.querySelector(".qmp-grid");
    const handle = root?.querySelector(".qmp-model-resizer");
    if (grid) {
      setCustomPixelStyle(grid, "--qmp-model-column", modelColumnWidth);
      setPixelStyle(grid, "width", matrixLayout().gridWidth);
    }
    handle?.setAttribute("aria-valuenow", String(modelColumnWidth));
    if (visible) positionPanel();
  }
  function persistModelColumnWidth() {
    updateStore(
      (next) => {
        next.modelColumnWidth = modelColumnWidth;
      },
      { render: false }
    );
  }
  function startModelColumnResize(event, handle) {
    if (event.button !== 0 || modelColumnResize) return;
    event.preventDefault();
    clearLater(closeTimer);
    finishDrag({ cancelled: true });
    hidePreview(true);
    closeActionMenu(false, false, true);
    const rect = root.getBoundingClientRect();
    panelLeftLock = rect.left;
    modelColumnResize = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startWidth: modelColumnWidth,
      handle
    };
    holdOpen = true;
    interaction = "resizing-model-column";
    root.dataset.resizingModelColumn = "true";
    handle.setPointerCapture?.(event.pointerId);
  }
  function moveModelColumnResize(event) {
    if (!modelColumnResize || event.pointerId !== modelColumnResize.pointerId)
      return;
    event.preventDefault();
    applyModelColumnWidth(
      modelColumnResize.startWidth + event.clientX - modelColumnResize.startX
    );
  }
  function finishModelColumnResize({ cancelled = false, schedule = true } = {}) {
    if (!modelColumnResize) return;
    const resize = modelColumnResize;
    modelColumnResize = null;
    if (cancelled) applyModelColumnWidth(resize.startWidth);
    else if (modelColumnWidth !== resize.startWidth) persistModelColumnWidth();
    try {
      if (resize.handle.hasPointerCapture?.(resize.pointerId)) {
        resize.handle.releasePointerCapture(resize.pointerId);
      }
    } catch {
    }
    root?.removeAttribute("data-resizing-model-column");
    holdOpen = false;
    interaction = activeOperation ? "applying" : "idle";
    if (schedule) scheduleClose();
  }
  function setModelColumnWidth(value) {
    applyModelColumnWidth(value);
    persistModelColumnWidth();
  }
  function matrixHtml() {
    if (snapshot.status !== "ready")
      return `<div class="qmp-empty">${escapeHtml(snapshot.message || LOADING_MESSAGE)}</div>`;
    const { pinnedModels, otherModels, revealOthers, columns, gridWidth } = matrixLayout();
    const effective = pendingTarget || snapshot.current;
    const model = snapshot.models.find((item) => item.key === effective.modelKey);
    const fastDisabled = !model?.fastSupported;
    const header = `<div class="qmp-grid-corner" role="columnheader"><button class="qmp-icon qmp-fast" data-action="fast" title="Fast" aria-label="Fast" aria-pressed="${effective.fastEnabled}" ${fastDisabled ? "disabled" : ""}>${icon("zap", 15)}</button><div class="qmp-model-resizer" role="separator" tabindex="0" aria-label="\u8C03\u6574\u540D\u79F0\u5217\u5BBD\u5EA6" aria-orientation="vertical" aria-valuemin="${MODEL_COLUMN_MIN_WIDTH}" aria-valuemax="${MODEL_COLUMN_MAX_WIDTH}" aria-valuenow="${modelColumnWidth}"></div></div>${columns.map((item) => `<div class="qmp-column${effective.reasoningKey === item.key ? " is-active" : ""}" role="columnheader">${escapeHtml(item.label)}</div>`).join("")}`;
    const rows = (models, pinned) => models.map((row) => {
      const options = new Map(
        row.reasoningOptions.map((item) => [item.key, item])
      );
      const currentModel = snapshot.current.modelKey === row.key;
      const pendingModel = pendingTarget?.modelKey === row.key;
      const cells = columns.map((column) => {
        const enabled = options.has(column.key);
        const selected = snapshot.current.modelKey === row.key && snapshot.current.reasoningKey === column.key;
        const unsupportedCurrent = selected && !enabled;
        const pending = pendingTarget?.modelKey === row.key && pendingTarget?.reasoningKey === column.key;
        const unavailableReason = !enabled && row.reasoningEvidence ? row.reasoningEvidence.unavailableReason : "";
        return `<button class="qmp-cell${selected ? " is-selected" : ""}${unsupportedCurrent ? " is-unsupported-current" : ""}${pending ? " is-pending" : ""}" role="radio" aria-checked="${selected}" aria-disabled="${!enabled}" ${enabled ? "" : "disabled"} data-model="${escapeHtml(row.key)}" data-reasoning="${escapeHtml(column.key)}" aria-label="${escapeHtml(`${row.label} ${column.label}${enabled ? "" : " \u4E0D\u53EF\u7528"}`)}"${unavailableReason ? ` title="${escapeHtml(unavailableReason)}"` : ""}><span></span></button>`;
      }).join("");
      const pinLabel = `${pinned ? "\u53D6\u6D88\u7F6E\u9876" : "\u4E00\u952E\u7F6E\u9876"} ${row.label}`;
      return `<div class="qmp-model${currentModel ? " is-current" : ""}${pendingModel ? " is-pending" : ""}" role="rowheader" data-model-key="${escapeHtml(row.key)}" title="${escapeHtml(row.label)}"${currentModel ? ' aria-current="true"' : ""}${pendingModel ? ' aria-busy="true"' : ""}><button class="qmp-pin" data-action="pin-model" data-model-key="${escapeHtml(row.key)}" aria-label="${escapeHtml(pinLabel)}" title="${escapeHtml(pinLabel)}" aria-pressed="${pinned}">${icon("pin", 13)}</button><span class="qmp-model-name">${escapeHtml(row.label)}</span></div>${cells}`;
    }).join("");
    const disclosure = otherModels.length ? `<button class="qmp-other-toggle" data-action="others" aria-controls="codexpp-qmp-other-models" aria-expanded="${revealOthers}" ${pinnedModels.length ? "" : "disabled"}>${icon("chevron", 14)}<span>\u5176\u4ED6\u6A21\u578B</span></button>` : "";
    const pinnedRegion = `<div class="qmp-pinned-models" role="group" aria-label="\u7528\u6237\u7F6E\u9876">${rows(pinnedModels, true)}</div>`;
    const otherRegion = `<div class="qmp-other-models" id="codexpp-qmp-other-models" role="group" aria-label="\u5176\u4ED6\u6A21\u578B">${revealOthers ? rows(otherModels, false) : ""}</div>`;
    return `<div class="qmp-matrix-scroll"><div class="qmp-grid" role="radiogroup" aria-label="\u6A21\u578B\u4E0E\u63A8\u7406\u5F3A\u5EA6" style="--qmp-cols:${columns.length};--qmp-model-column:${modelColumnWidth}px;--qmp-reasoning-column:${REASONING_COLUMN_WIDTH}px;width:${gridWidth}px;min-width:100%">${header}${pinnedRegion}${disclosure}${otherRegion}</div></div>`;
  }
  function presetHtml(preset) {
    const validity = presetValidity(preset);
    const active = sameConfig(snapshot.current, preset);
    const pending = sameConfig(pendingTarget, preset);
    const invalid = snapshot.status === "ready" && !validity.valid;
    return `<div class="qmp-preset${active ? " is-active" : ""}${pending ? " is-pending" : ""}${invalid ? " is-invalid" : ""}" data-preset-id="${escapeHtml(preset.id)}"><button class="qmp-preset-apply" aria-disabled="${!validity.valid}" aria-busy="${pending}" aria-current="${active ? "true" : "false"}" aria-haspopup="menu">${escapeHtml(preset.name)}</button></div>`;
  }
  function render() {
    if (!root || destroyed) return;
    syncFastFeedbackPresentation();
    if (renameId && root.querySelector(".qmp-rename")) {
      hidePreview(true);
      if (visible) positionPanel();
      return;
    }
    const active = documentRef.activeElement;
    const focusedPresetId = root.contains(active) ? active.closest?.(".qmp-preset")?.dataset.presetId || null : null;
    const focusedAdd = root.contains(active) && Boolean(active.closest?.(".qmp-add"));
    hidePreview(true);
    if (actionMenu) closeActionMenu(false, false, true);
    const cancelledDrag = Boolean(drag);
    const cancelledColumnResize = Boolean(modelColumnResize);
    if (modelColumnResize)
      finishModelColumnResize({ cancelled: true, schedule: false });
    if (drag) {
      drag.wrapper.classList.remove("is-dragging");
      drag = null;
      holdOpen = false;
      if (interaction === "dragging")
        interaction = activeOperation ? "applying" : "idle";
    }
    const canSave = snapshot.status === "ready" && configValid(snapshot.current);
    root.innerHTML = `<div class="qmp-rail"><div class="qmp-presets">${store.presets.map(presetHtml).join("")}</div><button class="qmp-icon qmp-add" data-action="save" aria-label="\u4FDD\u5B58\u5F53\u524D\u914D\u7F6E" title="\u4FDD\u5B58\u5F53\u524D\u914D\u7F6E" ${canSave ? "" : "disabled"}>${icon("plus", 16)}</button></div>${message && snapshot.status === "ready" ? `<div class="qmp-message" role="status">${escapeHtml(message)}</div>` : ""}${matrixHtml()}`;
    if (focusedPresetId || focusedAdd) {
      const wrapper = focusedPresetId ? [...root.querySelectorAll(".qmp-preset")].find(
        (item) => item.dataset.presetId === focusedPresetId
      ) : null;
      const replacement = wrapper?.querySelector(".qmp-preset-apply") || root.querySelector(".qmp-add");
      replacement?.focus({ preventScroll: true });
    }
    if (visible) positionPanel();
    if (cancelledDrag || cancelledColumnResize) scheduleClose();
  }
  function positionPanel() {
    if (!root || !boundTrigger || root.hidden || !visible) return;
    const anchor = boundTrigger.getBoundingClientRect();
    const viewportWidth = Math.max(
      0,
      window.innerWidth || documentRef.documentElement?.clientWidth || 0
    );
    const viewportHeight = Math.max(
      0,
      window.innerHeight || documentRef.documentElement?.clientHeight || 0
    );
    const availableWidth = Math.max(0, viewportWidth - PANEL_SAFE_MARGIN * 2);
    if (!availableWidth || !viewportHeight) return;
    const maximumWidth = Math.min(PANEL_MAX_WIDTH, availableWidth);
    const minimumWidth = Math.min(PANEL_MIN_WIDTH, maximumWidth);
    const width = clamp(preferredPanelWidth(), minimumWidth, maximumWidth);
    setPixelStyle(root, "width", width);
    const measured = root.getBoundingClientRect();
    const naturalHeight = Math.max(measured.height, root.scrollHeight || 0);
    const aboveSpace = Math.max(0, anchor.top - PANEL_GAP - PANEL_SAFE_MARGIN);
    const belowSpace = Math.max(
      0,
      viewportHeight - anchor.bottom - PANEL_GAP - PANEL_SAFE_MARGIN
    );
    const placement = aboveSpace >= naturalHeight || aboveSpace >= belowSpace ? "top" : "bottom";
    const panelSpace = Math.max(
      96,
      placement === "top" ? aboveSpace : belowSpace
    );
    setCustomPixelStyle(
      root,
      "--qmp-panel-max-height",
      Math.min(viewportHeight - PANEL_SAFE_MARGIN * 2, panelSpace)
    );
    const rect = root.getBoundingClientRect();
    const maximumLeft = Math.max(
      PANEL_SAFE_MARGIN,
      viewportWidth - rect.width - PANEL_SAFE_MARGIN
    );
    const centeredLeft = anchor.left + anchor.width / 2 - rect.width / 2;
    const left = clamp(
      panelLeftLock ?? centeredLeft,
      PANEL_SAFE_MARGIN,
      maximumLeft
    );
    const preferredTop = placement === "top" ? anchor.top - PANEL_GAP - rect.height : anchor.bottom + PANEL_GAP;
    const maximumTop = Math.max(
      PANEL_SAFE_MARGIN,
      viewportHeight - rect.height - PANEL_SAFE_MARGIN
    );
    const top = clamp(preferredTop, PANEL_SAFE_MARGIN, maximumTop);
    const originX = clamp(
      anchor.left + anchor.width / 2 - left,
      18,
      Math.max(18, rect.width - 18)
    );
    if (root.dataset.placement !== placement) root.dataset.placement = placement;
    setCustomPixelStyle(root, "--qmp-origin-x", originX);
    root.style.setProperty("--qmp-origin-y", placement === "top" ? "100%" : "0%");
    root.style.setProperty("--qmp-enter-y", placement === "top" ? "4px" : "-4px");
    setPixelStyle(root, "left", left);
    setPixelStyle(root, "top", top);
  }
  function showPreview(presetId, anchor) {
    clearLater(previewTimer);
    clearLater(previewHideTimer);
    previewTimer = null;
    previewHideTimer = null;
    const show = () => {
      const preset = store.presets.find((item) => item.id === presetId);
      if (!preset || !visible) return;
      clearPreview();
      const validity = presetValidity(preset);
      preview = documentRef.createElement("div");
      preview.id = PREVIEW_ID;
      preview.setAttribute("role", "tooltip");
      preview.setAttribute("data-codexpp-qmp-preview", "");
      preview.setAttribute("aria-hidden", "true");
      preview.dataset.state = "closed";
      preview.innerHTML = `<div class="qmp-preview-title">${escapeHtml(preset.name)}</div><div class="qmp-preview-detail">${escapeHtml(validity.valid ? `${preset.modelLabel} \xB7 ${preset.reasoningLabel} \xB7 ${preset.fastEnabled ? "Fast" : "Standard"}` : validity.reason)}</div>`;
      documentRef.body.append(preview);
      syncHostTypography();
      const apply = anchor.matches?.(".qmp-preset-apply") ? anchor : anchor.querySelector?.(".qmp-preset-apply");
      apply?.setAttribute("aria-describedby", PREVIEW_ID);
      const anchorRect = anchor.getBoundingClientRect();
      const rect = preview.getBoundingClientRect();
      const maximumLeft = Math.max(8, window.innerWidth - rect.width - 8);
      const left = clamp(
        anchorRect.left + anchorRect.width / 2 - rect.width / 2,
        8,
        maximumLeft
      );
      const originX = clamp(
        anchorRect.left + anchorRect.width / 2 - left,
        12,
        Math.max(12, rect.width - 12)
      );
      setPixelStyle(preview, "left", left);
      const above = anchorRect.top - rect.height - 8;
      const below = Math.min(
        window.innerHeight - rect.height - 8,
        anchorRect.bottom + 8
      );
      const placement = above >= 8 ? "top" : "bottom";
      preview.dataset.placement = placement;
      setCustomPixelStyle(preview, "--qmp-origin-x", originX);
      preview.style.setProperty(
        "--qmp-origin-y",
        placement === "top" ? "100%" : "0%"
      );
      preview.style.setProperty(
        "--qmp-float-y",
        placement === "top" ? "3px" : "-3px"
      );
      setPixelStyle(
        preview,
        "top",
        Math.max(8, placement === "top" ? above : below)
      );
      if (!reducedMotion()) preview.getBoundingClientRect();
      preview.dataset.state = "open";
      preview.setAttribute("aria-hidden", "false");
    };
    previewTimer = preview ? later(show, 0) : later(show, 120);
  }
  function clearPreview(target = preview) {
    root?.querySelectorAll(`[aria-describedby="${PREVIEW_ID}"]`).forEach((element) => {
      element.removeAttribute("aria-describedby");
    });
    target?.remove();
    if (preview === target) preview = null;
  }
  function hidePreview(immediate = false) {
    clearLater(previewTimer);
    clearLater(previewHideTimer);
    previewTimer = null;
    previewHideTimer = null;
    const target = preview;
    if (!target) return;
    root?.querySelectorAll(`[aria-describedby="${PREVIEW_ID}"]`).forEach((element) => {
      element.removeAttribute("aria-describedby");
    });
    if (immediate || reducedMotion()) {
      clearPreview(target);
      return;
    }
    target.dataset.state = "closed";
    target.setAttribute("aria-hidden", "true");
    previewHideTimer = later(() => {
      previewHideTimer = null;
      clearPreview(target);
    }, FLOATING_CLOSE_DURATION);
  }
  function closeActionMenu(shouldSchedule = true, restoreFocus = false, immediate = false) {
    clearLater(actionMenuHideTimer);
    actionMenuHideTimer = null;
    const menu = actionMenu;
    const anchor = actionMenuAnchor;
    if (restoreFocus && anchor?.isConnected)
      anchor.focus({ preventScroll: true });
    if (!menu) return;
    const finish = () => {
      menu.remove();
      if (actionMenu !== menu) return;
      actionMenu = null;
      actionMenuAnchor = null;
      if (!renameId && !drag) holdOpen = false;
      if (shouldSchedule && visible && !holdOpen) scheduleClose();
    };
    if (immediate || reducedMotion()) {
      finish();
      return;
    }
    menu.dataset.state = "closed";
    menu.setAttribute("aria-hidden", "true");
    actionMenuHideTimer = later(() => {
      actionMenuHideTimer = null;
      finish();
    }, FLOATING_CLOSE_DURATION);
  }
  function beginRename(id) {
    closeActionMenu(false, false, true);
    hidePreview(true);
    const wrapper = [...root.querySelectorAll(".qmp-preset")].find(
      (item) => item.dataset.presetId === id
    );
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
      if (commit && name)
        updateStore((next) => {
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
    input.addEventListener("blur", () => later(() => finish(true), 0), {
      once: true
    });
  }
  function focusPreset(id) {
    later(() => {
      const wrapper = id ? [...root?.querySelectorAll(".qmp-preset") || []].find(
        (item) => item.dataset.presetId === id
      ) : null;
      const target = wrapper?.querySelector(".qmp-preset-apply") || root?.querySelector(".qmp-add");
      target?.focus({ preventScroll: true });
    }, 0);
  }
  function openActionMenu(id, anchor, point = null) {
    finishRename?.(true);
    anchor = [...root.querySelectorAll(".qmp-preset")].find((item) => item.dataset.presetId === id)?.querySelector(".qmp-preset-apply");
    if (!anchor) return;
    closeActionMenu(false, false, true);
    hidePreview(true);
    clearLater(closeTimer);
    holdOpen = true;
    actionMenuAnchor = anchor;
    actionMenu = documentRef.createElement("div");
    actionMenu.setAttribute("data-codexpp-qmp-actions", "");
    actionMenu.setAttribute("role", "menu");
    actionMenu.setAttribute("aria-hidden", "true");
    actionMenu.dataset.state = "closed";
    actionMenu.innerHTML = `<button role="menuitem" data-menu-action="rename">${icon("pencil", 14)}Rename</button><button role="menuitem" data-menu-action="delete">${icon("trash", 14)}Delete</button>`;
    documentRef.body.append(actionMenu);
    syncHostTypography();
    const rect = anchor.getBoundingClientRect();
    const menuRect = actionMenu.getBoundingClientRect();
    const preferredLeft = point ? point.x : rect.left;
    const preferredTop = point ? point.y + 4 : rect.bottom + 4;
    const fallbackTop = (point ? point.y : rect.top) - menuRect.height - 4;
    const maxLeft = Math.max(8, window.innerWidth - menuRect.width - 8);
    const maxTop = Math.max(8, window.innerHeight - menuRect.height - 8);
    const left = Math.min(maxLeft, Math.max(8, preferredLeft));
    const placement = preferredTop <= maxTop ? "bottom" : "top";
    const top = placement === "bottom" ? preferredTop : Math.max(8, fallbackTop);
    const anchorX = point ? point.x : rect.left + Math.min(rect.width / 2, 18);
    const originX = clamp(anchorX - left, 12, Math.max(12, menuRect.width - 12));
    actionMenu.dataset.placement = placement;
    setCustomPixelStyle(actionMenu, "--qmp-origin-x", originX);
    actionMenu.style.setProperty(
      "--qmp-origin-y",
      placement === "top" ? "100%" : "0%"
    );
    actionMenu.style.setProperty(
      "--qmp-float-y",
      placement === "top" ? "3px" : "-3px"
    );
    setPixelStyle(actionMenu, "left", left);
    setPixelStyle(actionMenu, "top", top);
    if (!reducedMotion()) actionMenu.getBoundingClientRect();
    actionMenu.dataset.state = "open";
    actionMenu.setAttribute("aria-hidden", "false");
    actionMenu.addEventListener(
      "pointerdown",
      (event) => event.stopPropagation()
    );
    actionMenu.addEventListener("keydown", (event) => {
      const items = [...actionMenu.querySelectorAll('[role="menuitem"]')];
      const current = Math.max(0, items.indexOf(documentRef.activeElement));
      let next = null;
      if (event.key === "ArrowDown") next = (current + 1) % items.length;
      if (event.key === "ArrowUp")
        next = (current - 1 + items.length) % items.length;
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
        closeActionMenu(false, false, true);
        updateStore((next) => {
          next.presets = next.presets.filter((item) => item.id !== id);
        });
        focusPreset(focusId);
      }
    });
    actionMenu.querySelector('[role="menuitem"]')?.focus({ preventScroll: true });
  }
  function startDrag(event, apply) {
    if (event.button !== 0 || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey)
      return;
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
      closeActionMenu(false, false, true);
      hidePreview(true);
      drag.active = true;
      holdOpen = true;
      interaction = "dragging";
      drag.wrapper.classList.add("is-dragging");
    }
    if (!drag.active) return;
    event.preventDefault();
    const siblings = [...root.querySelectorAll(".qmp-preset")].filter(
      (item) => item !== drag.wrapper
    );
    const before = siblings.find(
      (item) => event.clientX < item.getBoundingClientRect().left + item.offsetWidth / 2
    );
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
    else if (suppressReleasedClick)
      armPresetClickSuppression(id, false, pointerId);
    else clearPresetClickSuppression();
    if (!completed) return;
    if (cancelled) {
      render();
      scheduleClose();
      return;
    }
    const order = [...root.querySelectorAll(".qmp-preset")].map(
      (item) => item.dataset.presetId
    );
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
        next.nextSequence = Math.max(
          Number(next.nextSequence) || 1,
          Number(name) + 1
        );
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
      later(
        () => root?.querySelector(".qmp-preset:last-child")?.scrollIntoView({ block: "nearest", inline: "end" }),
        0
      );
    } catch (error) {
      message = `\u4FDD\u5B58\u5931\u8D25\uFF1A${String(error?.message || error)}`;
      render();
    }
  }
  function handleClick(event) {
    const action = event.target.closest("[data-action]")?.dataset.action;
    if (action === "pin-model") {
      togglePinnedModel(event.target.closest(".qmp-pin").dataset.modelKey);
      return;
    }
    if (action === "fast" && snapshot.status === "ready") {
      const effective = pendingTarget || snapshot.current;
      const nextFastEnabled = !effective.fastEnabled;
      submitTarget({ ...effective, fastEnabled: nextFastEnabled });
      startFastFeedback(nextFastEnabled);
      return;
    }
    if (action === "save") void savePreset();
    if (action === "others") {
      otherModelsExpanded = event.target.closest(".qmp-other-toggle").getAttribute("aria-expanded") !== "true";
      render();
      root?.querySelector(".qmp-other-toggle")?.focus({ preventScroll: true });
    }
    const cell = event.target.closest(".qmp-cell");
    if (cell && !cell.disabled && snapshot.status === "ready") {
      const row = snapshot.models.find(
        (model) => model.key === cell.dataset.model
      );
      const fastEnabled = (pendingTarget || snapshot.current).fastEnabled && Boolean(row?.fastSupported);
      submitTarget({
        modelKey: cell.dataset.model,
        reasoningKey: cell.dataset.reasoning,
        fastEnabled
      });
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
    if (holdOpen || pointerOnTrigger || pointerOnPanel || focusOnPanel) return;
    closeTimer = later(closePanel, 180);
  }
  function showPanel(preferredTrigger) {
    if (destroyed || disarmed || nativeMenuOpen()) return;
    const trigger = resolveTrigger(preferredTrigger);
    if (!trigger || !root) return;
    boundTrigger = trigger;
    clearLater(panelHideTimer);
    panelHideTimer = null;
    const wasHidden = root.hidden;
    if (wasHidden) panelLeftLock = null;
    visible = true;
    root.hidden = false;
    root.setAttribute("aria-hidden", "false");
    if (wasHidden) root.dataset.state = "closed";
    render();
    positionPanel();
    if (wasHidden && !reducedMotion()) root.getBoundingClientRect();
    root.dataset.state = "open";
    void syncSnapshot({ trigger });
  }
  function closePanel() {
    clearLater(openTimer);
    clearLater(closeTimer);
    clearLater(panelHideTimer);
    panelHideTimer = null;
    finishModelColumnResize({ cancelled: true, schedule: false });
    panelLeftLock = null;
    visible = false;
    pointerOnPanel = false;
    focusOnPanel = false;
    hidePreview(true);
    closeActionMenu(false, false, true);
    if (!root || root.hidden) return;
    root.setAttribute("aria-hidden", "true");
    if (reducedMotion()) {
      root.dataset.state = "closed";
      root.hidden = true;
      return;
    }
    root.dataset.state = "closing";
    panelHideTimer = later(() => {
      panelHideTimer = null;
      if (!root || visible) return;
      root.hidden = true;
      root.dataset.state = "closed";
    }, PANEL_CLOSE_DURATION);
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
    next.addEventListener(
      "pointerenter",
      () => {
        const alreadyCurrent = boundTrigger === next && pointerOnTrigger;
        boundTrigger = next;
        pointerOnTrigger = true;
        clearLater(closeTimer);
        if (disarmed || alreadyCurrent) return;
        clearLater(openTimer);
        openTimer = later(() => showPanel(next), 300);
      },
      { signal: local }
    );
    next.addEventListener(
      "focus",
      () => {
        boundTrigger = next;
      },
      { signal: local }
    );
    next.addEventListener(
      "pointerleave",
      () => {
        if (boundTrigger !== next) return;
        pointerOnTrigger = false;
        disarmed = false;
        clearLater(openTimer);
        scheduleClose();
      },
      { signal: local }
    );
    next.addEventListener(
      "pointerdown",
      (event) => {
        boundTrigger = next;
        if (probe && !event.isTrusted) return;
        if (event.isTrusted && probe) yieldProbeToUser();
        else {
          disarmed = true;
          cancelIntents();
          closePanel();
        }
      },
      { capture: true, signal: local }
    );
  }
  function bindTriggers(nextTriggers) {
    const next = new Set(nextTriggers);
    const intentTriggerMissing = [
      pendingIntent?.trigger,
      activeIntentTrigger
    ].some((trigger) => trigger && !next.has(trigger));
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
    if (!boundTrigger && nextTriggers.length === 1)
      boundTrigger = nextTriggers[0];
  }
  function scheduleScan() {
    if (scanFrame || destroyed) return;
    const scan = () => {
      scanFrame = 0;
      syncHostTypography();
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
:where([data-codexpp-qmp-root],[data-codexpp-qmp-preview],[data-codexpp-qmp-actions]){--qmp-surface:var(--color-background-elevated-primary-opaque,var(--color-token-dropdown-background,var(--main-surface-primary,#202020)));--qmp-surface-subtle:var(--color-background-elevated-primary,var(--main-surface-primary,var(--qmp-surface)));--qmp-text:var(--color-token-text-primary,var(--color-token-foreground,var(--color-text-foreground,var(--text-primary,#f3f3f3))));--qmp-muted:var(--color-token-text-tertiary,var(--color-token-description-foreground,var(--color-text-foreground-secondary,var(--text-secondary,#aaa))));--qmp-border:var(--color-token-border,var(--border-default,color-mix(in srgb,var(--qmp-text) 12%,transparent)));--qmp-border-strong:color-mix(in srgb,var(--qmp-text) 20%,transparent);--qmp-hover:var(--color-token-list-hover-background,color-mix(in srgb,var(--qmp-text) 7%,transparent));--qmp-accent:var(--color-token-charts-blue,#4d8dff);--qmp-accent-soft:color-mix(in srgb,var(--qmp-accent) 13%,transparent);--qmp-danger:var(--color-text-danger,#ff6b6b);--qmp-focus:color-mix(in srgb,var(--qmp-accent) 82%,white 18%);--qmp-radius-xs:4px;--qmp-radius-sm:6px;--qmp-radius-md:10px;--qmp-shadow-popover:0 8px 24px rgb(0 0 0 / 24%)}
[data-codexpp-qmp-root]{position:fixed;z-index:2147483000;box-sizing:border-box;display:flex;flex-direction:column;max-width:calc(100vw - 24px);max-height:min(calc(100vh - 24px),var(--qmp-panel-max-height,calc(100vh - 24px)));overflow:hidden;isolation:isolate;border:1px solid var(--qmp-border);border-radius:var(--qmp-radius-md);background:var(--qmp-surface);color:var(--qmp-text);box-shadow:var(--qmp-shadow-popover);font-family:var(--qmp-host-font-family,-apple-system,"system-ui","Segoe UI",sans-serif);font-size:var(--qmp-font-size,13.5px);font-weight:var(--qmp-host-font-weight,400);font-optical-sizing:auto;line-height:var(--qmp-line-height,18.9px);letter-spacing:0;transform-origin:var(--qmp-origin-x,50%) var(--qmp-origin-y,100%);will-change:opacity,transform}
[data-codexpp-qmp-root][data-resizing-model-column="true"]{cursor:col-resize;user-select:none}
[data-codexpp-qmp-root][data-state="closed"],[data-codexpp-qmp-root][data-state="closing"]{opacity:0;transform:translate3d(0,var(--qmp-enter-y,4px),0);pointer-events:none;transition:opacity 100ms linear,transform 120ms cubic-bezier(.32,.72,0,1)}
[data-codexpp-qmp-root][data-state="open"]{opacity:1;transform:translate3d(0,0,0);pointer-events:auto;transition:opacity 120ms ease-out,transform 160ms cubic-bezier(.23,1,.32,1)}
[data-codexpp-qmp-root][hidden]{display:none!important}
[data-codexpp-qmp-root] .qmp-rail{box-sizing:border-box;min-height:44px;flex:0 0 44px;padding:7px 8px;display:flex;align-items:center;gap:8px;border-bottom:1px solid var(--qmp-border);background:color-mix(in srgb,var(--qmp-surface-subtle) 78%,var(--qmp-surface))}
[data-codexpp-qmp-root] .qmp-presets{min-width:0;flex:1;display:flex;align-items:center;gap:10px;overflow-x:auto;overflow-y:hidden;overscroll-behavior-inline:contain;scrollbar-width:none;white-space:nowrap}
[data-codexpp-qmp-root] .qmp-presets::-webkit-scrollbar{display:none}
[data-codexpp-qmp-root] button{box-sizing:border-box;font:inherit;color:inherit;letter-spacing:0;-webkit-tap-highlight-color:transparent}
[data-codexpp-qmp-root] button:focus-visible,[data-codexpp-qmp-actions] button:focus-visible{outline:2px solid var(--qmp-focus);outline-offset:-2px}
[data-codexpp-qmp-root] .qmp-icon{width:28px;height:28px;flex:0 0 28px;display:grid;place-items:center;border:0;border-radius:var(--qmp-radius-sm);background:transparent;cursor:pointer;transition:color 100ms ease-out,background-color 100ms ease-out,transform 80ms ease-out}
[data-codexpp-qmp-root] .qmp-icon:active:not(:disabled){transform:scale(.97)}
[data-codexpp-qmp-root] .qmp-icon:disabled{opacity:.36;cursor:not-allowed}
[data-codexpp-qmp-root] .qmp-add{position:relative;margin-left:2px}
[data-codexpp-qmp-root] .qmp-add::before{content:"";position:absolute;left:-5px;top:5px;width:1px;height:18px;background:var(--qmp-border-strong);pointer-events:none}
[data-codexpp-qmp-root] .qmp-fast{position:relative;width:26px;height:26px;flex-basis:26px;overflow:visible;isolation:isolate}
[data-codexpp-qmp-root] .qmp-fast svg{position:relative;z-index:1;transform-origin:50% 50%}
[data-codexpp-qmp-root] .qmp-fast::before{content:"";position:absolute;inset:-2px;z-index:0;border:1px solid transparent;border-top-color:var(--qmp-accent);border-right-color:color-mix(in srgb,var(--qmp-accent) 52%,transparent);border-radius:8px;opacity:0;transform:scale(.72) rotate(-36deg);pointer-events:none}
[data-codexpp-qmp-root] .qmp-fast::after{content:"";position:absolute;inset:3px;border:1px solid var(--qmp-accent);border-radius:var(--qmp-radius-sm);opacity:0;pointer-events:none}
[data-codexpp-qmp-root] .qmp-fast[aria-pressed="true"]{color:var(--qmp-accent);background:var(--qmp-accent-soft)}
[data-codexpp-qmp-root] .qmp-fast[aria-pressed="true"] svg{animation:qmp-fast-charge 2400ms cubic-bezier(.23,1,.32,1) infinite;will-change:transform,filter}
[data-codexpp-qmp-root] .qmp-fast[aria-pressed="true"]::after{animation:qmp-fast-pulse 2400ms ease-out infinite;will-change:transform,opacity}
[data-codexpp-qmp-root][data-fast-feedback="on"] .qmp-fast{color:var(--qmp-accent);background:color-mix(in srgb,var(--qmp-accent) 17%,transparent)}
[data-codexpp-qmp-root][data-fast-feedback="on"] .qmp-fast svg{animation:qmp-fast-engage 620ms cubic-bezier(.16,1,.3,1) var(--qmp-fast-feedback-delay,0ms) both}
[data-codexpp-qmp-root][data-fast-feedback="on"] .qmp-fast::before{animation:qmp-fast-arc 620ms cubic-bezier(.16,1,.3,1) var(--qmp-fast-feedback-delay,0ms) both}
[data-codexpp-qmp-root][data-fast-feedback="on"] .qmp-fast::after{animation:qmp-fast-click-ring 620ms cubic-bezier(.16,1,.3,1) var(--qmp-fast-feedback-delay,0ms) both}
[data-codexpp-qmp-root][data-fast-feedback="off"] .qmp-fast svg{animation:qmp-fast-disengage 420ms cubic-bezier(.32,.72,0,1) var(--qmp-fast-feedback-delay,0ms) both}
[data-codexpp-qmp-root][data-fast-feedback="off"] .qmp-fast::after{animation:qmp-fast-collapse 420ms cubic-bezier(.32,.72,0,1) var(--qmp-fast-feedback-delay,0ms) both}
[data-codexpp-qmp-root] .qmp-preset{position:relative;width:fit-content;height:30px;min-width:42px;max-width:150px;flex:0 0 auto;border-radius:var(--qmp-radius-xs)}
[data-codexpp-qmp-root] .qmp-preset+.qmp-preset::before{content:"";position:absolute;left:-5px;top:8px;bottom:8px;width:1px;background:color-mix(in srgb,var(--qmp-border-strong) 68%,transparent);pointer-events:none}
[data-codexpp-qmp-root] .qmp-preset-apply{position:relative;width:auto;height:30px;min-width:42px;max-width:150px;padding:0 11px;border:0;border-radius:var(--qmp-radius-xs);background:transparent;color:var(--qmp-muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-align:center;cursor:pointer;transition:color 100ms ease-out,background-color 100ms ease-out,transform 80ms ease-out}
[data-codexpp-qmp-root] .qmp-preset-apply:active:not([aria-disabled="true"]){transform:scale(.97)}
[data-codexpp-qmp-root] .qmp-preset-apply::after{content:"";position:absolute;left:11px;right:11px;bottom:1px;height:2px;border-radius:2px;background:transparent}
[data-codexpp-qmp-root] .qmp-preset:focus-within .qmp-preset-apply{background:var(--qmp-hover);color:var(--qmp-text)}
[data-codexpp-qmp-root] .qmp-preset.is-active .qmp-preset-apply{color:var(--qmp-text)}
[data-codexpp-qmp-root] .qmp-preset.is-active .qmp-preset-apply::after{background:var(--qmp-accent)}
[data-codexpp-qmp-root] .qmp-preset.is-pending .qmp-preset-apply{color:var(--qmp-text);background:var(--qmp-accent-soft)}
[data-codexpp-qmp-root] .qmp-preset.is-pending .qmp-preset-apply::after{background:repeating-linear-gradient(90deg,var(--qmp-accent) 0 3px,transparent 3px 5px);background-size:10px 2px;animation:qmp-pending-line .7s linear infinite}
[data-codexpp-qmp-root] .qmp-preset.is-invalid .qmp-preset-apply{color:color-mix(in srgb,var(--qmp-muted) 52%,transparent)}
[data-codexpp-qmp-root] .qmp-preset-apply[aria-disabled="true"]{cursor:not-allowed}
[data-codexpp-qmp-root] .qmp-preset.is-dragging{opacity:.72}
[data-codexpp-qmp-root] .qmp-preset.is-dragging .qmp-preset-apply{background:var(--qmp-hover);transition:none}
[data-codexpp-qmp-root] .qmp-preset.is-renaming{width:150px;min-width:150px;max-width:150px}
[data-codexpp-qmp-root] .qmp-preset.is-renaming>button{visibility:hidden}
[data-codexpp-qmp-root] .qmp-rename{box-sizing:border-box;position:absolute;inset:0;width:100%;height:30px;border:1px solid var(--qmp-accent);border-radius:var(--qmp-radius-sm);background:var(--qmp-surface);color:var(--qmp-text);padding:0 8px;outline:0;box-shadow:0 0 0 2px var(--qmp-accent-soft);font:inherit}
[data-codexpp-qmp-root] .qmp-message{flex:0 0 auto;padding:5px 9px;border-bottom:1px solid var(--qmp-border);color:var(--qmp-muted);font-size:var(--qmp-small-font-size,12.5px);line-height:var(--qmp-small-line-height,17.5px)}
[data-codexpp-qmp-root] .qmp-matrix-scroll{min-height:0;flex:1 1 auto;overflow:auto;overscroll-behavior:contain;scrollbar-color:var(--qmp-border-strong) transparent;scrollbar-width:thin}
[data-codexpp-qmp-root] .qmp-grid{display:grid;grid-template-columns:var(--qmp-model-column) repeat(var(--qmp-cols),minmax(var(--qmp-reasoning-column),1fr));align-items:stretch;background:var(--qmp-surface)}
[data-codexpp-qmp-root] .qmp-grid-corner{position:sticky;top:0;left:0;z-index:5;height:38px;display:grid;place-items:center;overflow:visible;background:var(--qmp-surface);box-shadow:1px 1px 0 var(--qmp-border)}
[data-codexpp-qmp-root] .qmp-model-resizer{position:absolute;top:0;right:-5px;bottom:0;z-index:7;width:10px;cursor:col-resize;touch-action:none;outline:0}
[data-codexpp-qmp-root] .qmp-model-resizer::after{content:"";position:absolute;top:7px;bottom:7px;left:50%;width:2px;border-radius:2px;background:transparent;transform:translateX(-50%);transition:background-color 100ms ease-out}
[data-codexpp-qmp-root] .qmp-model-resizer:focus-visible::after,[data-codexpp-qmp-root][data-resizing-model-column="true"] .qmp-model-resizer::after{background:var(--qmp-accent)}
[data-codexpp-qmp-root] .qmp-column{position:sticky;top:0;z-index:4;height:38px;display:grid;place-items:center;padding:0 4px;background:var(--qmp-surface);box-shadow:0 1px 0 var(--qmp-border);color:var(--qmp-muted);font-size:var(--qmp-small-font-size,12.5px);font-weight:500;line-height:1.2;text-align:center;white-space:nowrap;transition:color 100ms ease-out}
[data-codexpp-qmp-root] .qmp-column.is-active{color:var(--qmp-text);background:var(--qmp-surface)}
[data-codexpp-qmp-root] .qmp-column.is-active::after{content:"";position:absolute;left:50%;bottom:0;width:14px;height:2px;border-radius:2px;background:var(--qmp-accent);transform:translateX(-50%)}
[data-codexpp-qmp-root] .qmp-pinned-models,[data-codexpp-qmp-root] .qmp-other-models{display:contents}
[data-codexpp-qmp-root] .qmp-model{position:sticky;left:0;z-index:2;height:42px;display:flex;align-items:center;gap:5px;padding:0 11px 0 7px;border-top:1px solid var(--qmp-border);background:var(--qmp-surface);box-shadow:1px 0 0 var(--qmp-border);font-size:var(--qmp-font-size,13.5px);font-weight:var(--qmp-host-font-weight,400);white-space:nowrap;transition:box-shadow 100ms ease-out}
[data-codexpp-qmp-root] .qmp-model.is-current{background:var(--qmp-surface);box-shadow:inset 2px 0 0 var(--qmp-accent),1px 0 0 var(--qmp-border)}
[data-codexpp-qmp-root] .qmp-model.is-pending{background:var(--qmp-accent-soft);box-shadow:inset 2px 0 0 var(--qmp-accent),1px 0 0 var(--qmp-border)}
[data-codexpp-qmp-root] .qmp-model-name{min-width:0;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:var(--qmp-host-font-weight,400);font-optical-sizing:auto}
[data-codexpp-qmp-root] .qmp-pin{width:24px;height:24px;flex:0 0 24px;display:grid;place-items:center;border:0;border-radius:var(--qmp-radius-sm);background:transparent;color:var(--qmp-muted);opacity:.58;cursor:pointer;transition:color 100ms ease-out,background-color 100ms ease-out,opacity 100ms ease-out,transform 80ms ease-out}
[data-codexpp-qmp-root] .qmp-pin:active{transform:scale(.94)}
[data-codexpp-qmp-root] .qmp-pin[aria-pressed="true"]{color:color-mix(in srgb,var(--qmp-accent) 64%,transparent);background:color-mix(in srgb,var(--qmp-accent) 6%,transparent);opacity:.9}
[data-codexpp-qmp-root] .qmp-cell{height:42px;display:grid;place-items:center;border:0;border-top:1px solid var(--qmp-border);background:transparent;cursor:pointer}
[data-codexpp-qmp-root] .qmp-cell>span{width:15px;height:15px;border:1.5px solid color-mix(in srgb,var(--qmp-text) 38%,transparent);border-radius:999px;display:grid;place-items:center;transition:border-color 100ms ease-out,background-color 100ms ease-out,transform 80ms ease-out}
[data-codexpp-qmp-root] .qmp-cell:active:not(:disabled)>span{transform:scale(.86)}
[data-codexpp-qmp-root] .qmp-cell.is-selected{background:transparent}
[data-codexpp-qmp-root] .qmp-cell.is-selected>span{border-color:var(--qmp-accent)}
[data-codexpp-qmp-root] .qmp-cell.is-selected>span::after{content:"";width:6px;height:6px;border-radius:999px;background:var(--qmp-accent)}
[data-codexpp-qmp-root] .qmp-cell.is-pending>span{border-color:var(--qmp-accent);border-style:dashed;background:var(--qmp-accent-soft);animation:qmp-pending-ring .72s linear infinite}
[data-codexpp-qmp-root] .qmp-cell:disabled{opacity:1;cursor:not-allowed}
[data-codexpp-qmp-root] .qmp-cell:disabled>span{width:10px;height:2px;border:0;border-radius:999px;background:var(--qmp-muted);opacity:.38;animation:none}
[data-codexpp-qmp-root] .qmp-cell.is-unsupported-current:disabled>span{width:15px;height:15px;border:1.5px dashed var(--qmp-accent);border-radius:999px;background:transparent;opacity:1}
[data-codexpp-qmp-root] .qmp-cell.is-unsupported-current:disabled>span::after{content:"";width:5px;height:5px;border-radius:999px;background:var(--qmp-accent)}
[data-codexpp-qmp-root] .qmp-other-toggle{grid-column:1/-1;height:34px;display:flex;align-items:center;justify-content:center;gap:6px;border:0;border-top:1px solid var(--qmp-border);background:color-mix(in srgb,var(--qmp-surface-subtle) 60%,var(--qmp-surface));color:var(--qmp-muted);font-size:var(--qmp-small-font-size,12.5px);font-weight:500;cursor:pointer;transition:color 100ms ease-out,background-color 100ms ease-out,transform 80ms ease-out}
[data-codexpp-qmp-root] .qmp-other-toggle:active:not(:disabled){transform:scale(.99)}
[data-codexpp-qmp-root] .qmp-other-toggle svg{transition:transform 140ms cubic-bezier(.23,1,.32,1)}
[data-codexpp-qmp-root] .qmp-other-toggle[aria-expanded="true"] svg{transform:rotate(180deg)}
[data-codexpp-qmp-root] .qmp-other-toggle:disabled{cursor:default;opacity:.72}
[data-codexpp-qmp-root] .qmp-empty{min-height:96px;display:grid;place-items:center;padding:20px;color:var(--qmp-muted);text-align:center;text-wrap:balance}
[data-codexpp-qmp-preview],[data-codexpp-qmp-actions]{position:fixed;z-index:2147483001;box-sizing:border-box;border:1px solid var(--qmp-border);background:var(--qmp-surface);color:var(--qmp-text);box-shadow:var(--qmp-shadow-popover);font-family:var(--qmp-host-font-family,-apple-system,"system-ui","Segoe UI",sans-serif);font-size:var(--qmp-font-size,13.5px);font-weight:var(--qmp-host-font-weight,400);font-optical-sizing:auto;line-height:var(--qmp-line-height,18.9px);letter-spacing:0;transform-origin:var(--qmp-origin-x,50%) var(--qmp-origin-y,50%)}
[data-codexpp-qmp-preview][data-state="closed"],[data-codexpp-qmp-actions][data-state="closed"]{opacity:0;transform:translate3d(0,var(--qmp-float-y,3px),0) scale(.98);pointer-events:none;transition:opacity 80ms linear,transform 110ms cubic-bezier(.32,.72,0,1)}
[data-codexpp-qmp-preview][data-state="open"],[data-codexpp-qmp-actions][data-state="open"]{opacity:1;transform:translate3d(0,0,0) scale(1);transition:opacity 100ms ease-out,transform 140ms cubic-bezier(.23,1,.32,1)}
[data-codexpp-qmp-preview]{max-width:min(320px,calc(100vw - 16px));padding:8px 10px;border-radius:var(--qmp-radius-md);pointer-events:none}
[data-codexpp-qmp-preview] .qmp-preview-title{color:var(--qmp-text);font-weight:600;line-height:var(--qmp-tight-line-height,18.4px);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
[data-codexpp-qmp-preview] .qmp-preview-detail{margin-top:1px;color:var(--qmp-muted);font-size:var(--qmp-small-font-size,12.5px);line-height:var(--qmp-small-line-height,17.5px);white-space:nowrap}
[data-codexpp-qmp-actions]{min-width:132px;padding:4px;border-radius:var(--qmp-radius-md)}
[data-codexpp-qmp-actions][data-state="open"]{pointer-events:auto}
[data-codexpp-qmp-actions] button{width:100%;height:32px;padding:0 9px;display:flex;align-items:center;gap:8px;border:0;border-radius:var(--qmp-radius-sm);background:transparent;color:var(--qmp-text);font-family:var(--qmp-host-font-family,-apple-system,"system-ui","Segoe UI",sans-serif);font-size:var(--qmp-font-size,13.5px);font-weight:500;line-height:1;text-align:left;cursor:pointer;transition:color 100ms ease-out,background-color 100ms ease-out,transform 80ms ease-out}
[data-codexpp-qmp-actions] button:active{transform:scale(.98)}
[data-codexpp-qmp-actions] button[data-menu-action="delete"]{color:var(--qmp-danger)}
[data-codexpp-qmp-actions] svg{flex:0 0 14px}
@keyframes qmp-fast-charge{0%,70%,100%{transform:scale(1) rotate(0);filter:drop-shadow(0 0 0 transparent)}76%{transform:scale(1.14) rotate(-5deg);filter:drop-shadow(0 0 4px var(--qmp-accent))}83%{transform:scale(.98) rotate(3deg);filter:drop-shadow(0 0 2px var(--qmp-accent))}90%{transform:scale(1.07) rotate(-2deg);filter:drop-shadow(0 0 3px var(--qmp-accent))}96%{transform:scale(1) rotate(0);filter:drop-shadow(0 0 0 transparent)}}
@keyframes qmp-fast-pulse{0%,70%,100%{opacity:0;transform:scale(.72)}75%{opacity:.5;transform:scale(.82)}94%{opacity:0;transform:scale(1.24)}}
@keyframes qmp-fast-engage{0%{transform:scale(.94) rotate(-3deg);filter:drop-shadow(0 0 0 transparent)}24%{transform:scale(.9) rotate(-6deg);filter:drop-shadow(0 0 1px var(--qmp-accent))}48%{transform:scale(1.08) rotate(2deg);filter:brightness(1.28) drop-shadow(0 0 6px var(--qmp-accent))}72%{transform:scale(1.02) rotate(-1deg);filter:brightness(1.08) drop-shadow(0 0 3px var(--qmp-accent))}100%{transform:scale(1) rotate(0);filter:drop-shadow(0 0 0 transparent)}}
@keyframes qmp-fast-arc{0%{opacity:0;transform:scale(.72) rotate(-36deg)}20%{opacity:.8}70%{opacity:.32}100%{opacity:0;transform:scale(1.26) rotate(112deg)}}
@keyframes qmp-fast-click-ring{0%{opacity:0;transform:scale(.66)}28%{opacity:.72;transform:scale(.82)}100%{opacity:0;transform:scale(1.42)}}
@keyframes qmp-fast-disengage{0%{transform:scale(1);filter:drop-shadow(0 0 4px var(--qmp-accent))}45%{transform:scale(.9) rotate(3deg);filter:drop-shadow(0 0 1px var(--qmp-accent))}100%{transform:scale(1) rotate(0);filter:drop-shadow(0 0 0 transparent)}}
@keyframes qmp-fast-collapse{0%{opacity:.48;transform:scale(1.18)}100%{opacity:0;transform:scale(.72)}}
@keyframes qmp-pending-ring{to{transform:rotate(360deg)}}
@keyframes qmp-pending-line{to{background-position:10px 0}}
@media (hover:hover) and (pointer:fine){[data-codexpp-qmp-root] .qmp-icon:hover:not(:disabled){background:var(--qmp-hover)}[data-codexpp-qmp-root] .qmp-preset:hover .qmp-preset-apply{background:var(--qmp-hover);color:var(--qmp-text)}[data-codexpp-qmp-root] .qmp-cell:hover:not(:disabled){background:var(--qmp-hover)}[data-codexpp-qmp-root] .qmp-cell:hover:not(:disabled)>span{border-color:color-mix(in srgb,var(--qmp-accent) 68%,var(--qmp-text))}[data-codexpp-qmp-root] .qmp-model:hover .qmp-pin,[data-codexpp-qmp-root] .qmp-pin:hover{opacity:1}[data-codexpp-qmp-root] .qmp-pin:hover{background:var(--qmp-hover);color:var(--qmp-text)}[data-codexpp-qmp-root] .qmp-pin[aria-pressed="true"]:hover{color:color-mix(in srgb,var(--qmp-accent) 76%,transparent);background:color-mix(in srgb,var(--qmp-accent) 9%,transparent)}[data-codexpp-qmp-root] .qmp-model-resizer:hover::after{background:var(--qmp-border-strong)}[data-codexpp-qmp-root] .qmp-other-toggle:hover:not(:disabled){background:var(--qmp-hover);color:var(--qmp-text)}[data-codexpp-qmp-actions] button:hover{background:var(--qmp-hover)}}
@media (prefers-reduced-motion:reduce){[data-codexpp-qmp-root],[data-codexpp-qmp-root] *,[data-codexpp-qmp-root] *::before,[data-codexpp-qmp-root] *::after,[data-codexpp-qmp-preview],[data-codexpp-qmp-preview] *,[data-codexpp-qmp-actions],[data-codexpp-qmp-actions] *{scroll-behavior:auto!important;animation:none!important;transition:none!important}}
@media (prefers-reduced-transparency:reduce){[data-codexpp-qmp-root],[data-codexpp-qmp-preview],[data-codexpp-qmp-actions]{background:var(--qmp-surface);backdrop-filter:none}}
@media (prefers-contrast:more){[data-codexpp-qmp-root],[data-codexpp-qmp-preview],[data-codexpp-qmp-actions]{border-color:var(--qmp-border-strong)}[data-codexpp-qmp-root] .qmp-column,[data-codexpp-qmp-root] .qmp-model,[data-codexpp-qmp-root] .qmp-cell,[data-codexpp-qmp-root] .qmp-other-toggle{border-color:var(--qmp-border-strong)}[data-codexpp-qmp-root] .qmp-preset-apply,[data-codexpp-qmp-root] .qmp-column,[data-codexpp-qmp-root] .qmp-message{color:var(--qmp-text)}}
`;
    documentRef.head?.append(style);
    root = documentRef.createElement("div");
    root.setAttribute("data-codexpp-qmp-root", "");
    root.setAttribute("role", "dialog");
    root.setAttribute("aria-label", "\u6A21\u578B\u4E0E\u9884\u8BBE");
    root.setAttribute("aria-hidden", "true");
    root.dataset.state = "closed";
    root.hidden = true;
    documentRef.body.append(root);
    installTypographyObserver();
    syncHostTypography(true);
    root.addEventListener(
      "pointerenter",
      () => {
        pointerOnPanel = true;
        clearLater(closeTimer);
      },
      { signal }
    );
    root.addEventListener(
      "pointerleave",
      () => {
        pointerOnPanel = false;
        scheduleClose();
      },
      { signal }
    );
    root.addEventListener(
      "focusin",
      () => {
        focusOnPanel = true;
        clearLater(closeTimer);
      },
      { signal }
    );
    root.addEventListener(
      "focusout",
      (event) => {
        if (root?.contains(event.relatedTarget)) return;
        focusOnPanel = false;
        scheduleClose();
      },
      { signal }
    );
    root.addEventListener(
      "pointerdown",
      (event) => {
        event.stopPropagation();
        const resizer = event.target.closest(".qmp-model-resizer");
        if (resizer) {
          startModelColumnResize(event, resizer);
          return;
        }
        const apply = event.target.closest(".qmp-preset-apply");
        if (apply) startDrag(event, apply);
      },
      { signal }
    );
    root.addEventListener("pointermove", moveDrag, { signal });
    root.addEventListener("pointerup", () => finishDrag(), { signal });
    root.addEventListener(
      "pointercancel",
      (event) => {
        if (drag) finishDrag({ cancelled: true });
        else if (presetClickSuppression?.pointerId === event.pointerId)
          clearPresetClickSuppression();
      },
      { signal }
    );
    root.addEventListener("click", handleClick, { signal });
    root.addEventListener(
      "dblclick",
      (event) => {
        const resizer = event.target.closest(".qmp-model-resizer");
        if (!resizer) return;
        event.preventDefault();
        setModelColumnWidth(DEFAULT_MODEL_COLUMN_WIDTH);
        resizer.focus({ preventScroll: true });
      },
      { signal }
    );
    root.addEventListener("contextmenu", handleContextMenu, { signal });
    root.addEventListener(
      "pointerover",
      (event) => {
        const preset = event.target.closest(".qmp-preset");
        if (preset && !preset.contains(event.relatedTarget))
          showPreview(preset.dataset.presetId, preset);
      },
      { signal }
    );
    root.addEventListener(
      "pointerout",
      (event) => {
        const preset = event.target.closest(".qmp-preset");
        if (preset && !preset.contains(event.relatedTarget)) hidePreview();
      },
      { signal }
    );
    resizeObserver = window.ResizeObserver ? new window.ResizeObserver(positionPanel) : null;
    resizeObserver?.observe(root);
    render();
    scheduleScan();
  }
  function onDocumentPointerDown(event) {
    if (actionMenu && !actionMenu.contains(event.target)) closeActionMenu();
  }
  function onKeyDown(event) {
    const resizer = event.target.closest?.(".qmp-model-resizer");
    if (resizer) {
      const step = event.shiftKey ? 24 : 8;
      const next = event.key === "ArrowLeft" ? modelColumnWidth - step : event.key === "ArrowRight" ? modelColumnWidth + step : event.key === "Home" ? DEFAULT_MODEL_COLUMN_WIDTH : null;
      if (next != null) {
        event.preventDefault();
        event.stopPropagation();
        setModelColumnWidth(next);
        return;
      }
    }
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
    } else if (modelColumnResize) finishModelColumnResize({ cancelled: true });
    else if (drag)
      finishDrag({ cancelled: true, suppressReleasedClick: !drag.active });
    else if (renameId) {
      finishRename?.(false);
    } else {
      closePanel();
      boundTrigger?.focus?.();
    }
  }
  documentRef.addEventListener("pointerdown", onDocumentPointerDown, {
    capture: true,
    signal
  });
  documentRef.addEventListener("keydown", onKeyDown, { signal });
  window.addEventListener("resize", positionPanel, { signal });
  window.addEventListener("pointermove", moveModelColumnResize, {
    capture: true,
    signal
  });
  window.addEventListener(
    "pointerup",
    (event) => {
      if (modelColumnResize?.pointerId === event.pointerId)
        finishModelColumnResize();
    },
    { capture: true, signal }
  );
  window.addEventListener(
    "pointercancel",
    (event) => {
      if (modelColumnResize?.pointerId === event.pointerId) {
        finishModelColumnResize({ cancelled: true });
      }
    },
    { capture: true, signal }
  );
  window.addEventListener(
    "blur",
    () => {
      closeActionMenu(false, false, true);
      finishModelColumnResize({ cancelled: true });
    },
    { signal }
  );
  window.addEventListener(
    "focus",
    () => {
      if (visible) void syncSnapshot();
    },
    { signal }
  );
  window.addEventListener(
    "storage",
    (event) => {
      if (event.key === STORAGE_KEY) {
        store = readStore();
        modelColumnWidth = store.modelColumnWidth;
        render();
      }
    },
    { signal }
  );
  documentRef.addEventListener(
    "visibilitychange",
    () => {
      if (documentRef.visibilityState === "visible" && visible)
        void syncSnapshot();
    },
    { signal }
  );
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
    attributeFilter: [
      "aria-expanded",
      "aria-checked",
      "aria-selected",
      "data-state"
    ]
  });
  if (documentRef.body) mount();
  else
    documentRef.addEventListener("DOMContentLoaded", mount, {
      once: true,
      signal
    });
  function publicState() {
    return {
      version: VERSION,
      visible,
      interaction,
      message,
      capability: {
        status: capability.status,
        generation: capability.generation
      },
      modelCount: capability.models.filter((model) => !isAutoReviewModel(model)).length,
      snapshot,
      pendingTarget,
      presets: store.presets,
      pinnedModelKeys: store.pinnedModelKeys,
      modelColumnWidth,
      otherModelsExpanded,
      typography: { ...hostTypography }
    };
  }
  function destroy() {
    if (destroyed) return;
    finishModelColumnResize({ cancelled: true, schedule: false });
    destroyed = true;
    cancelIntents();
    lifetime.abort();
    triggerLifetimes.forEach((triggerLifetime) => triggerLifetime.abort());
    triggerLifetimes.clear();
    mutationObserver?.disconnect();
    typographyObserver?.disconnect();
    resizeObserver?.disconnect();
    timers.forEach((timer) => window.clearTimeout(timer));
    timers.clear();
    if (scanFrame) {
      if (window.cancelAnimationFrame) window.cancelAnimationFrame(scanFrame);
      else clearLater(scanFrame);
    }
    if (window.dispatchEvent === wrappedDispatch)
      window.dispatchEvent = originalDispatch;
    probe?.roots.forEach(
      (menu) => menu.removeAttribute("data-codexpp-qmp-probe-root")
    );
    documentRef.querySelectorAll(
      "[data-codexpp-qmp-root],[data-codexpp-qmp-preview],[data-codexpp-qmp-actions],#codexpp-qmp-style"
    ).forEach((element) => element.remove());
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
      return window.structuredClone(publicState());
    },
    getModelListCache() {
      return window.structuredClone(modelListCache);
    },
    destroy
  };
  window[API_KEY] = api;
})();

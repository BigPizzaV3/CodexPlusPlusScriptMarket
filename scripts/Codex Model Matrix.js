/*
@codex-plus-script
name: Codex Model Matrix
description: A compact theme-aware Codex model selector with a snap-drag reasoning slider.
version: 1.0.0
author: Xiazhixuan119748
*/

(() => {
  "use strict";

  const VERSION = "1.0.0";
  const API_KEY = "__codexModelMatrixSelector";
  const STYLE_ID = "codex-model-matrix-style";
  const HOST_ATTR = "data-codex-model-matrix-host";
  const MENU_ATTR = "data-codex-model-matrix-menu";
  const POPUP_ATTR = "data-codex-model-matrix-popup";
  const PICKER_SELECTOR = "[data-model-picker-model-row],[data-model-picker-power-slider]";
  const NORMAL_EFFORTS = ["low", "medium", "high", "xhigh", "max"];
  const OLD_MODEL_EFFORTS = ["low", "medium", "high", "xhigh"];
  const EFFORT_LABELS = { low: "Low", medium: "Mid", high: "High", xhigh: "XHigh", max: "Max" };
  const EFFORT_ALIASES = { light: "low", mid: "medium", "x-high": "xhigh", x_high: "xhigh", extra_high: "xhigh", full: "max" };
  const REACT_KEYS = ["__reactFiber$", "__reactInternalInstance$"];

  window.__codexNativeMatrixSelector?.dispose?.();
  window.__codexModelPickerPolish?.dispose?.();
  window.__codexReasoningDragSliderBuddy?.dispose?.();
  window.__codexReasoningSlider?.dispose?.();
  window[API_KEY]?.dispose?.();

  let observer = null;
  let frame = 0;
  const pendingMenus = new Set();
  const pendingRoots = new Set();
  let fullScanPending = false;
  let cleanupPending = false;
  const mounted = new Map();
  const modelCache = new WeakMap();
  const catalogSignatureCache = new WeakMap();
  const menuRootCache = new WeakMap();
  const reactKeyCache = new WeakMap();
  const bridgeDepthCache = new WeakMap();

  const escapeHtml = (value) => String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

  function reactFiber(element) {
    if (!element) return null;
    const cached = reactKeyCache.get(element);
    if (cached && element[cached]) return element[cached];
    const key = Object.keys(element).find((name) => REACT_KEYS.some((prefix) => name.startsWith(prefix)));
    if (key) reactKeyCache.set(element, key);
    return key ? element[key] : null;
  }

  function bridgeFromFiber(fiber) {
    if (!fiber) return null;
    const props = fiber.memoizedProps || fiber.pendingProps;
    if (!props || typeof props !== "object") return null;
    const complete = Array.isArray(props.models)
      && typeof props.onSelectModel === "function"
      && typeof props.onSelectReasoningEffort === "function"
      && typeof props.model === "string";
    if (!complete) return null;
    return {
      models: props.models,
      model: props.model,
      reasoningEffort: props.reasoningEffort,
      onSelectModel: props.onSelectModel,
      onSelectReasoningEffort: props.onSelectReasoningEffort,
      modelOptionsDisabled: Boolean(props.modelOptionsDisabled),
      reasoningEffortDisabled: Boolean(props.reasoningEffortDisabled),
    };
  }

  function nativeBridge(element) {
    let fiber = reactFiber(element);
    const cachedDepth = bridgeDepthCache.get(element);
    if (Number.isInteger(cachedDepth)) {
      let candidate = fiber;
      for (let depth = 0; candidate && depth < cachedDepth; depth += 1) candidate = candidate.return;
      const cachedBridge = bridgeFromFiber(candidate);
      if (cachedBridge) return cachedBridge;
    }

    for (let depth = 0; fiber && depth < 100; depth += 1, fiber = fiber.return) {
      const bridge = bridgeFromFiber(fiber);
      if (!bridge) continue;
      bridgeDepthCache.set(element, depth);
      return bridge;
    }
    return null;
  }

  function normalizeEffort(item) {
    const value = typeof item === "string" ? item : item?.reasoningEffort;
    if (typeof value !== "string") return "";
    const normalized = value.trim().toLowerCase();
    return EFFORT_ALIASES[normalized] || normalized;
  }

  function gptVersion(modelId) {
    const match = /^gpt-(\d+)(?:\.(\d+))?(?=-|$)/i.exec(modelId || "");
    if (!match) return null;
    return [Number(match[1]), Number(match[2] || 0)];
  }

  function compareVersion(version, major, minor) {
    if (!version) return 0;
    if (version[0] !== major) return version[0] - major;
    return version[1] - minor;
  }

  function isBeforeGpt56(modelId) {
    const version = gptVersion(modelId);
    return Boolean(version && compareVersion(version, 5, 6) < 0);
  }

  function isGpt56Alias(modelId) {
    return /^gpt-5\.6$/i.test(modelId || "");
  }

  function isGpt56Concrete(modelId) {
    return /^gpt-5\.6-/i.test(modelId || "");
  }

  function isUltraModel(modelId) {
    return /^gpt-5\.6-(sol|terra)(?:-|$)/i.test(modelId || "");
  }

  function hasOfficialEffortPolicy(modelId) {
    return isGpt56Alias(modelId) || isGpt56Concrete(modelId) || isBeforeGpt56(modelId);
  }

  function effortPolicyFor(modelId) {
    const efforts = isBeforeGpt56(modelId) ? OLD_MODEL_EFFORTS : NORMAL_EFFORTS;
    return isUltraModel(modelId) ? [...efforts, "ultra"] : efforts;
  }

  function applyEffortPolicy(model) {
    const raw = new Set(model.efforts.filter(Boolean));
    const allowed = effortPolicyFor(model.id);
    let efforts;
    if (hasOfficialEffortPolicy(model.id)) efforts = allowed;
    else if (raw.size) efforts = allowed.filter((effort) => raw.has(effort));
    else efforts = allowed.includes(model.defaultEffort) ? [model.defaultEffort] : ["medium"];
    const defaultEffort = efforts.includes(model.defaultEffort)
      ? model.defaultEffort
      : efforts.includes("medium") ? "medium" : efforts[0] || "";
    return { ...model, efforts, defaultEffort };
  }

  function modelSourceSignature(source) {
    return source.map((item) => [
      item?.model || "",
      item?.displayName || "",
      normalizeEffort(item?.defaultReasoningEffort),
      (item?.supportedReasoningEfforts || []).map(normalizeEffort).join(","),
    ].join(":")).join("|");
  }

  function normalizeModels(bridge) {
    const source = bridge?.models;
    if (!Array.isArray(source)) return [];
    const sourceSignature = modelSourceSignature(source);
    const cached = modelCache.get(source);
    if (cached?.signature === sourceSignature) return cached.models;
    const models = source
      .filter((item) => item && typeof item.model === "string")
      .map((item) => ({
        id: item.model,
        displayName: item.displayName || item.model,
        defaultEffort: normalizeEffort(item.defaultReasoningEffort) || "medium",
        efforts: [...new Set((item.supportedReasoningEfforts || []).map(normalizeEffort).filter(Boolean))],
      }))
      .map(applyEffortPolicy)
      .filter((model) => model.efforts.length);
    modelCache.set(source, { signature: sourceSignature, models });
    return models;
  }

  function displayModelsFor(models) {
    return models;
  }

  function familyFor(modelId) {
    const match = /^gpt-(\d+(?:\.\d+)?)(?:-|$)/i.exec(modelId || "");
    return match ? match[1] : modelId || "Models";
  }

  function familyLabel(family) {
    return /^\d/.test(family) ? `GPT-${family}` : family;
  }

  function variantLabel(model, family, siblings) {
    if ((siblings || []).length <= 1) return model.displayName || familyLabel(family);
    const full = `gpt-${family}`;
    if (model.id.toLowerCase() === full.toLowerCase()) return familyLabel(family);
    const prefix = `${full}-`;
    let displaySuffix = (model.displayName || model.id).replace(/^GPT[- ]?/i, "");
    if (displaySuffix.toLowerCase().startsWith(family.toLowerCase())) {
      displaySuffix = displaySuffix.slice(family.length).replace(/^[- ]+/, "");
    }
    const suffix = model.id.toLowerCase().startsWith(prefix.toLowerCase())
      ? model.id.slice(prefix.length)
      : displaySuffix;
    return suffix.split("-").filter(Boolean).map((part) => part[0]?.toUpperCase() + part.slice(1)).join(" ") || model.displayName;
  }

  function accentFor(modelId) {
    const id = (modelId || "").toLowerCase();
    if (id.includes("-sol")) return "#d89924";
    if (id.includes("-terra")) return "#27a875";
    if (id.includes("-luna")) return "#7c72ee";
    if (id.includes("-mini")) return "#3d8bea";
    if (id.includes("5.5")) return "#e0608c";
    if (id.includes("5.4")) return "#38a4bd";
    if (id.includes("5.2")) return "#8a8f98";
    return "var(--color-token-charts-blue, #2f8ff0)";
  }

  function selectedState(bridge, models = []) {
    const model = models.find((item) => item.id === bridge.model);
    const requestedEffort = normalizeEffort(bridge.reasoningEffort);
    const fallbackEffort = model?.defaultEffort
      || model?.efforts.find((effort) => effort !== "ultra")
      || "medium";
    return {
      model: bridge.model || "",
      effort: !model || model.efforts.includes(requestedEffort) ? requestedEffort || fallbackEffort : fallbackEffort,
    };
  }

  function preferredDisplayModel(models, displayModels, state) {
    const exact = displayModels.find((model) => model.id === state.model);
    if (exact) return exact;
    if (isGpt56Alias(state.model)) {
      return displayModels.find((model) => /gpt-5\.6-terra/i.test(model.id))
        || displayModels.find((model) => /gpt-5\.6-sol/i.test(model.id))
        || displayModels.find((model) => /gpt-5\.6-luna/i.test(model.id))
        || displayModels.find((model) => familyFor(model.id) === "5.6")
        || displayModels[0];
    }
    return displayModels.find((model) => model.id === models[0]?.id) || displayModels[0];
  }

  function normalEffortsFor(modelId) {
    return isBeforeGpt56(modelId) ? OLD_MODEL_EFFORTS : NORMAL_EFFORTS;
  }

  function select(runtime, modelId, effort) {
    const { bridge, models } = runtime || {};
    const model = models?.find((item) => item.id === modelId);
    if (!bridge || !model || !model.efforts.includes(effort)) return;
    const sameModel = modelId === bridge.model;
    const sameEffort = normalizeEffort(bridge.reasoningEffort) === effort;
    if (sameModel && sameEffort) return;
    if (sameModel && bridge.reasoningEffortDisabled) return;
    if (!sameModel && bridge.modelOptionsDisabled) return;
    if (sameModel) bridge.onSelectReasoningEffort(effort);
    else bridge.onSelectModel(modelId, effort);
    schedule(runtime.menu || runtime.host?.parentElement || null);
    if (runtime.host) {
      clearRefreshTimers(runtime.host);
      const delays = sameModel ? [48] : [48, 160, 400];
      runtime.host.__cmmRefreshTimers = delays.map((delay, index) => setTimeout(() => {
        schedule(runtime.menu || runtime.host?.parentElement || null);
        if (index === delays.length - 1) runtime.host.__cmmRefreshTimers = [];
      }, delay));
    }
  }

  function selectModel(runtime, target, currentEffort) {
    if (!target) return;
    const effort = target.efforts.includes(currentEffort)
      ? currentEffort
      : target.efforts.includes(target.defaultEffort)
        ? target.defaultEffort
        : target.efforts.find((item) => item !== "ultra") || target.efforts[0];
    if (effort) select(runtime, target.id, effort);
  }

  function structureSignature(models, displayModels, activeDisplayModel, variants) {
    let catalog = catalogSignatureCache.get(models);
    if (!catalog) {
      catalog = `${models.map((item) => `${item.id}:${item.displayName}:${item.defaultEffort}:${item.efforts.join(",")}`).join(";")}|${displayModels.map((item) => item.id).join(",")}`;
      catalogSignatureCache.set(models, catalog);
    }
    return [
      catalog,
      activeDisplayModel.id,
      variants.map((model) => model.id).join(","),
    ].join("|");
  }

  function patchState(host, runtime, visibleEfforts, activeNormalEfforts, ultraSupported) {
    const { bridge, state } = runtime;
    const normalIndex = state.effort === "ultra"
      ? Math.max(0, activeNormalEfforts.length - 1)
      : Math.max(0, activeNormalEfforts.indexOf(state.effort));
    const selectedEffort = activeNormalEfforts[normalIndex] || activeNormalEfforts[0] || "";
    const scale = host.querySelector(".cmm-row[data-active='true'] .cmm-scale");
    scale?.setAttribute("aria-valuemax", String(Math.max(0, activeNormalEfforts.length - 1)));
    scale?.setAttribute("aria-valuenow", String(normalIndex));
    scale?.setAttribute("aria-valuetext", EFFORT_LABELS[selectedEffort] || selectedEffort);
    scale?.setAttribute("aria-disabled", String(bridge.reasoningEffortDisabled));
    host.querySelectorAll(".cmm-variants [data-model], .cmm-model-name, .cmm-family-button")
      .forEach((button) => button.toggleAttribute("disabled", bridge.modelOptionsDisabled));

    const ultra = host.querySelector(".cmm-ultra");
    if (ultra) {
      ultra.dataset.active = String(state.effort === "ultra");
      ultra.dataset.enabled = String(ultraSupported && !bridge.reasoningEffortDisabled);
      ultra.setAttribute("aria-pressed", String(state.effort === "ultra"));
      ultra.toggleAttribute("disabled", !ultraSupported || bridge.reasoningEffortDisabled);
    }

    host.__cmmSyncEffort?.(state.effort);
  }

  function familyMenu(displayModels, state) {
    const groups = new Map();
    for (const model of displayModels) {
      const family = familyFor(model.id);
      if (!groups.has(family)) groups.set(family, []);
      groups.get(family).push(model);
    }
    return [...groups.entries()].map(([family, items]) => `
      <section class="cmm-family-group">
        <div class="cmm-family-title">${escapeHtml(familyLabel(family))}</div>
        ${items.map((model) => `<button type="button" class="cmm-family-model" data-model="${escapeHtml(model.id)}" data-selected="${model.id === state.model}" style="--cmm-row-accent:${accentFor(model.id)}"><span>${escapeHtml(model.displayName)}</span><i></i></button>`).join("")}
      </section>
    `).join("");
  }

  function clearRefreshTimers(host) {
    for (const timer of host?.__cmmRefreshTimers || []) clearTimeout(timer);
    if (host) host.__cmmRefreshTimers = [];
  }

  function clearHost(host) {
    for (const dispose of host.__cmmDisposers || []) {
      try { dispose(); } catch {}
    }
    host.__cmmDisposers = [];
    host.__cmmSyncEffort = null;
    host.__cmmPositionSlider = null;
  }

  function render(host, bridge) {
    const models = normalizeModels(bridge);
    const displayModels = displayModelsFor(models);
    if (!models.length || !displayModels.length) return false;

    const state = selectedState(bridge, models);
    const activeDisplayModel = preferredDisplayModel(models, displayModels, state);
    if (!activeDisplayModel) return false;

    const activeActionModel = models.find((model) => model.id === state.model) || activeDisplayModel;
    const family = familyFor(activeDisplayModel.id);
    const variants = displayModels.filter((item) => familyFor(item.id) === family);
    const visibleEfforts = normalEffortsFor(activeDisplayModel.id);
    const familyHasUltra = variants.some((model) => model.efforts.includes("ultra"));
    const activeNormalEfforts = visibleEfforts.filter((key) => activeActionModel.efforts.includes(key));
    const ultraSupported = activeActionModel.efforts.includes("ultra");
    const runtime = { bridge, models, displayModels, state, activeDisplayModel, activeActionModel, host, menu: host.parentElement || null };
    host.__cmmRuntime = runtime;
    host.style.setProperty("--cmm-accent", accentFor(activeDisplayModel.id));

    const structure = structureSignature(models, displayModels, activeDisplayModel, variants);
    if (host.dataset.structure === structure) {
      patchState(host, runtime, visibleEfforts, activeNormalEfforts, ultraSupported);
      return true;
    }
    host.dataset.structure = structure;
    clearHost(host);

    host.innerHTML = `
      <div class="cmm-toolbar">
        <div class="cmm-variants" role="tablist" aria-label="Model variants">
          ${variants.map((model) => `<button type="button" role="tab" data-model="${escapeHtml(model.id)}" aria-selected="${model.id === activeDisplayModel.id}" style="--cmm-row-accent:${accentFor(model.id)}">${escapeHtml(variantLabel(model, family, variants))}</button>`).join("")}
        </div>
        <button type="button" class="cmm-family-button" aria-expanded="false" title="Models"><span>${escapeHtml(familyLabel(family))}</span><i></i></button>
      </div>
      <div class="cmm-board" data-ultra="${familyHasUltra}">
        <div class="cmm-effort-labels">${visibleEfforts.map((key, index) => `<span style="--cmm-pos:${(index / Math.max(1, visibleEfforts.length - 1)) * 100}%">${escapeHtml(EFFORT_LABELS[key])}</span>`).join("")}</div>
        ${familyHasUltra ? '<div class="cmm-ultra-label">Ultra</div>' : ""}
        <div class="cmm-rows">
          ${variants.map((model) => {
            const active = model.id === activeDisplayModel.id;
            const rowEffortModel = active ? activeActionModel : model;
            const normal = visibleEfforts.filter((key) => rowEffortModel.efforts.includes(key));
            const selectedIndex = active
              ? state.effort === "ultra" ? Math.max(0, normal.length - 1) : normal.indexOf(state.effort)
              : -1;
            const selectedEffort = selectedIndex < 0 ? null : normal[selectedIndex];
            const fill = selectedEffort == null ? 0 : (visibleEfforts.indexOf(selectedEffort) / Math.max(1, visibleEfforts.length - 1)) * 100;
            const ariaValue = selectedEffort ? EFFORT_LABELS[selectedEffort] : "";
            return `<div class="cmm-row" data-model="${escapeHtml(model.id)}" data-active="${active}" style="--cmm-row-accent:${accentFor(model.id)};--cmm-fill-scale:${fill / 100};--cmm-thumb-left:${fill}%">
              <button type="button" class="cmm-model-name" title="${escapeHtml(model.displayName)}">${escapeHtml(variantLabel(model, family, variants))}</button>
              <div class="cmm-scale" data-draggable="${active}" role="${active ? "slider" : "group"}" ${active ? `tabindex="0" aria-label="Reasoning effort" aria-valuemin="0" aria-valuemax="${Math.max(0, normal.length - 1)}" aria-valuenow="${Math.max(0, selectedIndex)}" aria-valuetext="${escapeHtml(ariaValue)}"` : ""}>
                <div class="cmm-range"></div>
                ${visibleEfforts.map((key, index) => {
                  const supported = normal.includes(key);
                  const pos = (index / Math.max(1, visibleEfforts.length - 1)) * 100;
                  if (!supported) return `<span class="cmm-dot cmm-dot-disabled" style="--cmm-pos:${pos}%"></span>`;
                  return active
                    ? `<span class="cmm-dot" style="--cmm-pos:${pos}%" data-effort="${key}" title="${escapeHtml(EFFORT_LABELS[key])}"></span>`
                    : `<button type="button" class="cmm-dot" style="--cmm-pos:${pos}%" data-effort="${key}" title="${escapeHtml(EFFORT_LABELS[key])}" aria-label="${escapeHtml(`${model.displayName} ${EFFORT_LABELS[key]}`)}"></button>`;
                }).join("")}
                ${active && selectedIndex >= 0 ? '<span class="cmm-thumb" aria-hidden="true"></span>' : ""}
              </div>
            </div>`;
          }).join("")}
        </div>
        ${familyHasUltra ? `<button type="button" class="cmm-ultra" data-active="${state.effort === "ultra"}" data-enabled="${ultraSupported}" aria-pressed="${state.effort === "ultra"}" ${ultraSupported ? "" : "disabled"} title="Ultra"><span></span><i></i></button>` : ""}
      </div>
      <div class="cmm-catalog" hidden></div>
    `;

    bindInteractions(host, visibleEfforts, activeNormalEfforts);
    patchState(host, runtime, visibleEfforts, activeNormalEfforts, ultraSupported);
    return true;
  }

  function bindInteractions(host, visibleEfforts, activeNormalEfforts) {
    const familyButton = host.querySelector(".cmm-family-button");
    const catalog = host.querySelector(".cmm-catalog");
    let documentListening = false;
    const onDocumentPointerDown = (event) => {
      if (!host.contains(event.target)) closeCatalog();
    };
    const setDocumentListening = (enabled) => {
      if (enabled === documentListening) return;
      documentListening = enabled;
      document[enabled ? "addEventListener" : "removeEventListener"]("pointerdown", onDocumentPointerDown, true);
    };
    const renderCatalog = () => {
      const runtime = host.__cmmRuntime;
      if (!catalog || !runtime) return;
      const catalogSig = runtime.models.map((model) => `${model.id}:${model.displayName}:${model.efforts.join(",")}`).join("|");
      if (catalog.dataset.signature === catalogSig) return;
      catalog.innerHTML = familyMenu(runtime.models, runtime.state);
      catalog.dataset.signature = catalogSig;
    };
    const closeCatalog = () => {
      if (!catalog || catalog.hidden) return;
      catalog.hidden = true;
      catalog.innerHTML = "";
      delete catalog.dataset.signature;
      familyButton?.setAttribute("aria-expanded", "false");
      host.closest(`[${POPUP_ATTR}]`)?.style.removeProperty("--cmm-popup-shift");
      setDocumentListening(false);
    };
    const placeCatalog = () => {
      if (!catalog || catalog.hidden) return;
      const hostRect = host.getBoundingClientRect();
      const popup = host.closest(`[${POPUP_ATTR}]`);
      const gap = 7;
      const width = Math.min(188, Math.max(160, window.innerWidth - 16));
      const overflow = hostRect.right + gap + width - (window.innerWidth - 8);
      const shift = overflow > 0 ? Math.max(8 - hostRect.left, -Math.ceil(overflow)) : 0;
      popup?.style.setProperty("--cmm-popup-shift", `${shift}px`);
      catalog.style.width = `${Math.round(width)}px`;
      catalog.style.left = `${Math.round(hostRect.width + gap)}px`;
      catalog.style.top = "1px";
      catalog.dataset.tight = String(shift < 0);
    };

    const onResize = () => {
      host.__cmmPositionSlider?.();
      placeCatalog();
    };
    window.addEventListener("resize", onResize);
    host.__cmmDisposers.push(() => setDocumentListening(false));
    host.__cmmDisposers.push(() => window.removeEventListener("resize", onResize));

    const onHostClick = (event) => {
      const target = event.target instanceof Element ? event.target : null;
      if (!target) return;

      const familyToggle = target.closest(".cmm-family-button");
      if (familyToggle && host.contains(familyToggle)) {
        event.stopPropagation();
        if (!catalog) return;
        if (catalog.hidden) {
          renderCatalog();
          catalog.hidden = false;
          familyButton?.setAttribute("aria-expanded", "true");
          placeCatalog();
          setDocumentListening(true);
        } else {
          closeCatalog();
        }
        return;
      }

      const familyModel = target.closest(".cmm-family-model");
      if (familyModel && host.contains(familyModel)) {
        const runtime = host.__cmmRuntime;
        const model = runtime?.models.find((item) => item.id === familyModel.dataset.model);
        selectModel(runtime, model, runtime?.state.effort);
        closeCatalog();
        event.stopPropagation();
        return;
      }

      const inactiveDot = target.closest(".cmm-row[data-active='false'] .cmm-dot[data-effort]");
      if (inactiveDot && host.contains(inactiveDot)) {
        const runtime = host.__cmmRuntime;
        const row = inactiveDot.closest(".cmm-row");
        select(runtime, row?.dataset.model, inactiveDot.dataset.effort);
        event.stopPropagation();
        return;
      }

      const ultra = target.closest(".cmm-ultra");
      if (ultra && host.contains(ultra)) {
        const runtime = host.__cmmRuntime;
        const actionModel = runtime?.activeActionModel;
        if (!runtime || !actionModel?.efforts.includes("ultra")) return;
        const fallback = activeNormalEfforts.includes(actionModel.defaultEffort)
          ? actionModel.defaultEffort
          : activeNormalEfforts.at(-1);
        select(runtime, actionModel.id, runtime.state.effort === "ultra" ? fallback : "ultra");
        event.stopPropagation();
        return;
      }

      const modelButton = target.closest(".cmm-variants [data-model], .cmm-model-name");
      if (modelButton && host.contains(modelButton)) {
        const runtime = host.__cmmRuntime;
        const row = modelButton.closest("[data-model]");
        const targetId = modelButton.dataset.model || row?.dataset.model;
        const model = runtime?.models.find((item) => item.id === targetId);
        selectModel(runtime, model, runtime?.state.effort);
        event.stopPropagation();
      }
    };

    host.addEventListener("click", onHostClick);
    host.__cmmDisposers.push(() => host.removeEventListener("click", onHostClick));

    const activeScale = host.querySelector(".cmm-row[data-active='true'] .cmm-scale");
    if (activeScale && activeNormalEfforts.length) bindDragSlider(host, activeScale, visibleEfforts, activeNormalEfforts);
  }

  function bindDragSlider(host, activeScale, visibleEfforts, activeNormalEfforts) {
    const row = activeScale.closest(".cmm-row");
    const visibleMax = Math.max(1, visibleEfforts.length - 1);
    const effortPositions = activeNormalEfforts.map((effort) => visibleEfforts.indexOf(effort));
    const indexForEffort = (effort) => effort === "ultra"
      ? Math.max(0, activeNormalEfforts.length - 1)
      : Math.max(0, activeNormalEfforts.indexOf(effort));
    let preview = indexForEffort(host.__cmmRuntime?.state.effort);
    let dragging = false;
    let dragRect = null;
    let lastClientX = 0;
    let dragFrame = 0;
    let lastVisualRatio = -1;
    let pointerId = null;

    const effortToRatio = (effort) => visibleEfforts.indexOf(effort) / visibleMax;
    const nearestIndexForRatio = (ratio) => {
      const targetPosition = ratio * visibleMax;
      let best = 0;
      let bestDistance = Infinity;
      for (let index = 0; index < effortPositions.length; index += 1) {
        const distance = Math.abs(effortPositions[index] - targetPosition);
        if (distance < bestDistance) {
          best = index;
          bestDistance = distance;
        }
      }
      return best;
    };
    const writeRatio = (value) => {
      const ratio = Math.max(0, Math.min(1, value));
      if (Math.abs(ratio - lastVisualRatio) < 0.002) return;
      lastVisualRatio = ratio;
      row.style.setProperty("--cmm-fill-scale", String(ratio <= 0.001 ? 0 : ratio));
      row.style.setProperty("--cmm-thumb-left", `${ratio * 100}%`);
    };
    const previewFromClient = (clientX) => {
      const rect = dragRect || activeScale.getBoundingClientRect();
      const ratio = rect.width ? Math.max(0, Math.min(1, (clientX - rect.left) / rect.width)) : 0;
      writeRatio(ratio);
      return nearestIndexForRatio(ratio);
    };
    const requestPreview = (clientX) => {
      lastClientX = clientX;
      if (dragFrame) return;
      dragFrame = requestAnimationFrame(() => {
        dragFrame = 0;
        preview = previewFromClient(lastClientX);
      });
    };
    const flushPreview = () => {
      if (dragFrame) cancelAnimationFrame(dragFrame);
      dragFrame = 0;
      preview = previewFromClient(lastClientX);
    };
    const snapPreview = () => {
      const effort = activeNormalEfforts[preview];
      const ratio = effortToRatio(effort);
      writeRatio(ratio);
      activeScale.setAttribute("aria-valuenow", String(preview));
      activeScale.setAttribute("aria-valuetext", EFFORT_LABELS[effort] || effort);
    };
    const commit = () => {
      const runtime = host.__cmmRuntime;
      const actionModel = runtime?.activeActionModel;
      if (runtime && actionModel) select(runtime, actionModel.id, activeNormalEfforts[preview]);
    };
    const finish = (shouldCommit) => {
      if (!dragging) return;
      if (shouldCommit) flushPreview();
      else if (dragFrame) cancelAnimationFrame(dragFrame);
      dragFrame = 0;
      dragging = false;
      dragRect = null;
      delete activeScale.dataset.dragging;
      if (shouldCommit) {
        snapPreview();
        commit();
      } else {
        preview = indexForEffort(host.__cmmRuntime?.state.effort);
        snapPreview();
      }
      if (pointerId != null && activeScale.hasPointerCapture?.(pointerId)) {
        activeScale.releasePointerCapture?.(pointerId);
      }
      pointerId = null;
    };

    const onPointerDown = (event) => {
      if (event.button !== 0 || host.__cmmRuntime?.bridge.reasoningEffortDisabled) return;
      dragging = true;
      pointerId = event.pointerId;
      lastClientX = event.clientX;
      dragRect = activeScale.getBoundingClientRect();
      activeScale.dataset.dragging = "true";
      activeScale.setPointerCapture?.(event.pointerId);
      preview = previewFromClient(event.clientX);
      event.preventDefault();
    };
    const onPointerMove = (event) => {
      if (!dragging || event.pointerId !== pointerId) return;
      requestPreview(event.clientX);
      event.preventDefault();
    };
    const onPointerUp = (event) => {
      if (!dragging || event.pointerId !== pointerId) return;
      lastClientX = event.clientX;
      finish(true);
      event.preventDefault();
    };
    const onPointerCancel = () => finish(false);
    const onLostPointerCapture = () => {
      if (!dragging || pointerId == null) return;
      finish(true);
    };
    const onKeyDown = (event) => {
      if (host.__cmmRuntime?.bridge.reasoningEffortDisabled) return;
      if (event.key === "ArrowLeft" || event.key === "ArrowDown") preview = Math.max(0, preview - 1);
      else if (event.key === "ArrowRight" || event.key === "ArrowUp") preview = Math.min(activeNormalEfforts.length - 1, preview + 1);
      else if (event.key === "PageDown") preview = Math.max(0, preview - 1);
      else if (event.key === "PageUp") preview = Math.min(activeNormalEfforts.length - 1, preview + 1);
      else if (event.key === "Home") preview = 0;
      else if (event.key === "End") preview = activeNormalEfforts.length - 1;
      else return;
      snapPreview();
      commit();
      event.preventDefault();
    };

    activeScale.addEventListener("pointerdown", onPointerDown);
    activeScale.addEventListener("pointermove", onPointerMove);
    activeScale.addEventListener("pointerup", onPointerUp);
    activeScale.addEventListener("pointercancel", onPointerCancel);
    activeScale.addEventListener("lostpointercapture", onLostPointerCapture);
    activeScale.addEventListener("keydown", onKeyDown);
    host.__cmmSyncEffort = (effort) => {
      preview = indexForEffort(effort);
      snapPreview();
    };
    host.__cmmPositionSlider = snapPreview;
    snapPreview();
    host.__cmmDisposers.push(() => {
      if (dragFrame) cancelAnimationFrame(dragFrame);
      activeScale.removeEventListener("pointerdown", onPointerDown);
      activeScale.removeEventListener("pointermove", onPointerMove);
      activeScale.removeEventListener("pointerup", onPointerUp);
      activeScale.removeEventListener("pointercancel", onPointerCancel);
      activeScale.removeEventListener("lostpointercapture", onLostPointerCapture);
      activeScale.removeEventListener("keydown", onKeyDown);
    });
  }

  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      [${POPUP_ATTR}] { width:min(272px,calc(100vw - 12px))!important; max-width:272px!important; overflow:visible!important; translate:var(--cmm-popup-shift,0px) 0!important; }
      [${MENU_ATTR}] { width:100%!important; height:auto!important; overflow:visible!important; }
      [${MENU_ATTR}] > [class*='_ViewTrack_'] { display:none!important; }
      [${HOST_ATTR}] {
        --cmm-text:var(--color-token-text-primary,CanvasText);
        --cmm-muted:var(--color-token-text-tertiary,color-mix(in srgb,var(--cmm-text) 55%,transparent));
        --cmm-border:var(--color-token-border-light,color-mix(in srgb,var(--cmm-text) 13%,transparent));
        --cmm-surface:var(--color-token-main-surface-primary,var(--color-token-bg-primary,Canvas));
        --cmm-raised:var(--color-token-main-surface-secondary,var(--color-token-bg-secondary,var(--cmm-surface)));
        --cmm-soft:var(--color-token-list-hover-background,color-mix(in srgb,var(--cmm-text) 7%,transparent));
        position:relative;
        width:100%;
        min-width:0;
        padding:4px 6px 7px;
        color:var(--cmm-text);
        font-size:11px;
        line-height:1.2;
      }
      [${HOST_ATTR}] button { font:inherit; color:inherit; }
      [${HOST_ATTR}] button:disabled { cursor:default; }
      .cmm-toolbar { display:flex; align-items:center; gap:5px; min-height:26px; margin-bottom:0; }
      .cmm-family-button {
        display:flex;
        flex-shrink:0;
        align-items:center;
        gap:5px;
        height:26px;
        padding:0 7px;
        border:1px solid var(--cmm-border);
        border-radius:7px;
        background:linear-gradient(180deg,color-mix(in srgb,var(--cmm-raised) 96%,white 4%),var(--cmm-surface));
        color:var(--cmm-text);
        cursor:pointer;
        white-space:nowrap;
        box-shadow:0 1px 3px rgb(0 0 0 / 7%);
      }
      .cmm-family-button:hover { border-color:color-mix(in srgb,var(--cmm-accent) 38%,var(--cmm-border)); color:var(--cmm-text); }
      .cmm-family-button i {
        width:6px;
        height:6px;
        border-right:1.5px solid currentColor;
        border-bottom:1.5px solid currentColor;
        transform:rotate(45deg) translateY(-2px);
      }
      .cmm-variants {
        display:flex;
        min-width:0;
        flex:1;
        gap:8px;
        align-self:stretch;
        padding:0 3px;
        border:0;
        border-radius:0;
        background:transparent;
      }
      .cmm-variants button {
        position:relative;
        min-width:0;
        flex:0 1 auto;
        height:26px;
        padding:0 2px;
        overflow:hidden;
        border:0;
        border-radius:0;
        background:transparent;
        color:var(--cmm-muted);
        text-overflow:ellipsis;
        white-space:nowrap;
        cursor:pointer;
      }
      .cmm-variants button:hover,.cmm-model-name:hover { color:var(--cmm-text); }
      .cmm-variants button[aria-selected='true'] {
        background:transparent;
        color:var(--cmm-row-accent);
        font-weight:500;
        box-shadow:none;
      }
      .cmm-variants button[aria-selected='true']::after {
        content:"";
        position:absolute;
        left:0;
        right:0;
        bottom:1px;
        height:2px;
        border-radius:2px;
        background:linear-gradient(90deg,transparent,color-mix(in srgb,var(--cmm-row-accent) 92%,white),transparent);
        box-shadow:0 0 9px color-mix(in srgb,var(--cmm-row-accent) 32%,transparent);
      }
      .cmm-board {
        display:grid;
        grid-template-columns:36px minmax(0,1fr) 27px;
        grid-template-rows:15px auto;
        column-gap:5px;
        padding:6px 6px 7px;
        border:1px solid var(--cmm-border);
        border-radius:8px;
        background:
          linear-gradient(180deg,color-mix(in srgb,var(--cmm-raised) 68%,transparent),color-mix(in srgb,var(--cmm-surface) 94%,transparent)),
          color-mix(in srgb,var(--cmm-soft) 58%,transparent);
        box-shadow:inset 0 1px 0 rgb(255 255 255 / 7%),0 3px 9px rgb(0 0 0 / 5%);
      }
      .cmm-board[data-ultra='false'] { grid-template-columns:36px minmax(0,1fr); }
      .cmm-effort-labels {
        grid-column:2;
        position:relative;
        height:15px;
        color:var(--cmm-muted);
        font-size:9.5px;
        font-weight:500;
      }
      .cmm-effort-labels span {
        position:absolute;
        left:clamp(10px,var(--cmm-pos),calc(100% - 10px));
        max-width:30px;
        overflow:hidden;
        transform:translateX(-50%);
        text-align:center;
        text-overflow:ellipsis;
        white-space:nowrap;
      }
      .cmm-ultra-label { grid-column:3; color:var(--cmm-muted); font-size:9px; font-weight:750; letter-spacing:0; text-align:center; text-transform:uppercase; }
      .cmm-rows { grid-column:1 / 3; display:flex; flex-direction:column; gap:3px; min-width:0; }
      .cmm-row { display:grid; grid-template-columns:36px minmax(0,1fr); align-items:center; min-height:22px; }
      .cmm-model-name {
        height:22px;
        padding:0 2px;
        overflow:hidden;
        border:0;
        border-radius:6px;
        background:transparent;
        color:var(--cmm-text);
        text-align:left;
        text-overflow:ellipsis;
        white-space:nowrap;
        cursor:pointer;
      }
      .cmm-row[data-active='true'] .cmm-model-name { color:var(--cmm-row-accent); font-weight:650; }
      .cmm-scale {
        position:relative;
        height:22px;
        border-radius:999px;
        outline:0;
        touch-action:none;
      }
      .cmm-scale::before {
        content:"";
        position:absolute;
        inset:0;
        border-radius:999px;
        background:transparent;
        opacity:0;
        transition:opacity .16s ease;
      }
      .cmm-row[data-active='true'] .cmm-scale {
        background:linear-gradient(90deg,color-mix(in srgb,var(--cmm-row-accent) 16%,var(--cmm-surface)),color-mix(in srgb,var(--cmm-row-accent) 6%,var(--cmm-soft)));
        box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--cmm-row-accent) 14%,transparent),0 2px 7px color-mix(in srgb,var(--cmm-row-accent) 10%,transparent);
        cursor:ew-resize;
      }
      .cmm-row[data-active='true'] .cmm-scale::before {
        opacity:.62;
        box-shadow:inset 0 1px 1px rgb(255 255 255 / 18%),inset 0 -1px 1px rgb(0 0 0 / 5%);
      }
      .cmm-range {
        position:absolute;
        inset:0;
        transform:scaleX(var(--cmm-fill-scale,0));
        transform-origin:left center;
        overflow:hidden;
        border-radius:999px;
        background:
          linear-gradient(90deg,color-mix(in srgb,var(--cmm-row-accent) 72%,white 28%),var(--cmm-row-accent) 62%,color-mix(in srgb,var(--cmm-row-accent) 90%,#c97b00)),
          var(--cmm-row-accent);
        opacity:0;
        transition:transform .18s ease,opacity .16s ease;
      }
      .cmm-row[data-active='true'] .cmm-range { opacity:.98; }
      .cmm-range::before {
        content:"";
        position:absolute;
        inset:0;
        background:
          radial-gradient(circle at 14% 50%,rgb(255 255 255 / 42%) 0 2px,transparent 3px),
          radial-gradient(circle at 47% 50%,rgb(255 255 255 / 35%) 0 2px,transparent 3px),
          radial-gradient(circle at 80% 50%,rgb(255 255 255 / 30%) 0 2px,transparent 3px);
        opacity:.72;
      }
      .cmm-range::after {
        content:"";
        position:absolute;
        inset:-2px -20px;
        background:linear-gradient(105deg,transparent 20%,rgb(255 255 255 / 30%) 43%,transparent 64%);
        transform:translateX(-120%);
        animation:none;
      }
      .cmm-dot {
        position:absolute;
        z-index:1;
        top:0;
        left:clamp(10px,var(--cmm-pos),calc(100% - 10px));
        width:22px;
        height:22px;
        padding:0;
        border:0;
        transform:translateX(-50%);
        background:transparent;
        cursor:pointer;
      }
      .cmm-dot::after {
        content:"";
        display:block;
        width:4px;
        height:4px;
        margin:auto;
        border-radius:50%;
        background:color-mix(in srgb,var(--cmm-text) 28%,transparent);
        box-shadow:0 0 0 1px color-mix(in srgb,var(--cmm-surface) 72%,transparent);
        transition:transform .16s ease,background-color .16s ease,box-shadow .16s ease;
      }
      .cmm-row[data-active='true'] .cmm-dot::after {
        background:color-mix(in srgb,#fff 86%,var(--cmm-row-accent));
        box-shadow:0 0 9px color-mix(in srgb,var(--cmm-row-accent) 34%,transparent);
      }
      .cmm-dot-disabled { opacity:.15; pointer-events:none; }
      .cmm-thumb {
        position:absolute;
        z-index:2;
        top:50%;
        left:clamp(10px,var(--cmm-thumb-left,0%),calc(100% - 10px));
        width:20px;
        height:20px;
        border-radius:50%;
        transform:translate3d(-50%,-50%,0);
        background:
          radial-gradient(circle at 33% 27%,#fff 0 20%,color-mix(in srgb,var(--cmm-surface) 96%,var(--cmm-row-accent)) 58%,color-mix(in srgb,var(--cmm-row-accent) 22%,var(--cmm-surface)) 100%);
        box-shadow:
          0 2px 6px rgb(0 0 0 / 19%),
          0 0 0 1px color-mix(in srgb,var(--cmm-row-accent) 22%,transparent),
          0 0 9px color-mix(in srgb,var(--cmm-row-accent) 16%,transparent);
        pointer-events:none;
        transition:left .15s ease,transform .15s ease;
      }
      .cmm-scale[data-dragging='true'] {
        box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--cmm-row-accent) 22%,transparent),0 0 10px color-mix(in srgb,var(--cmm-row-accent) 16%,transparent);
      }
      .cmm-scale[data-dragging='true']::before { opacity:1; }
      .cmm-scale[data-dragging='true'] .cmm-range,
      .cmm-scale[data-dragging='true'] .cmm-thumb { transition:none; }
      .cmm-scale[data-dragging='true'] .cmm-range::after { animation:cmm-track-flow 1.8s ease-in-out infinite; }
      .cmm-scale[data-dragging='true'] .cmm-thumb {
        will-change:transform;
        transform:translate3d(-50%,-50%,0) scale(1.06);
        box-shadow:
          0 2px 6px rgb(0 0 0 / 24%),
          0 0 0 3px color-mix(in srgb,var(--cmm-row-accent) 21%,transparent),
          0 0 9px color-mix(in srgb,var(--cmm-row-accent) 22%,transparent);
      }
      .cmm-scale[data-dragging='true'] .cmm-dot::after { transform:scale(1.18); }
      .cmm-scale:focus-visible { box-shadow:0 0 0 2px color-mix(in srgb,var(--cmm-row-accent) 42%,transparent); }
      .cmm-ultra {
        grid-column:3;
        grid-row:2;
        position:relative;
        align-self:stretch;
        min-height:72px;
        border:1px solid var(--cmm-border);
        border-radius:999px;
        background:
          linear-gradient(180deg,color-mix(in srgb,var(--cmm-text) 5%,transparent),color-mix(in srgb,var(--cmm-text) 2%,transparent)),
          color-mix(in srgb,var(--cmm-soft) 70%,var(--cmm-surface));
        cursor:pointer;
        box-shadow:inset 0 1px 1px rgb(255 255 255 / 11%),0 2px 6px rgb(0 0 0 / 7%);
      }
      .cmm-ultra:disabled { opacity:.30; cursor:default; }
      .cmm-ultra i {
        position:absolute;
        top:13px;
        bottom:8px;
        left:50%;
        width:4px;
        border-radius:9px;
        transform:translateX(-50%);
        background:
          linear-gradient(180deg,color-mix(in srgb,var(--cmm-text) 40%,transparent),color-mix(in srgb,var(--cmm-text) 22%,transparent)),
          color-mix(in srgb,var(--cmm-text) 18%,transparent);
        opacity:.74;
      }
      .cmm-ultra i::after {
        content:"";
        position:absolute;
        inset:0;
        border-radius:inherit;
        background:linear-gradient(180deg,color-mix(in srgb,#ff4654 82%,var(--cmm-accent)),transparent 78%);
        opacity:0;
        transition:opacity .2s ease;
      }
      .cmm-ultra span {
        position:absolute;
        z-index:1;
        left:50%;
        top:6px;
        width:19px;
        height:19px;
        border-radius:50%;
        transform:translateX(-50%);
        background:
          radial-gradient(circle at 34% 28%,#f5f5f5 0 18%,#9da0a7 56%,#787c84 100%);
        box-shadow:0 3px 7px rgb(0 0 0 / 20%),0 0 0 1px rgb(255 255 255 / 22%) inset;
        transition:background-color .2s ease,box-shadow .2s ease,transform .18s ease;
      }
      .cmm-ultra:hover span { transform:translateX(-50%) scale(1.04); }
      .cmm-ultra[data-active='true'] i::after { opacity:.9; }
      .cmm-ultra[data-active='true'] {
        border-color:color-mix(in srgb,#ff4654 26%,var(--cmm-border));
        box-shadow:inset 0 1px 1px rgb(255 255 255 / 12%),0 0 15px rgb(255 70 84 / 12%);
      }
      .cmm-ultra[data-active='true'] span {
        background:radial-gradient(circle at 34% 28%,#fff 0 17%,#ff8a93 48%,#ff4050 100%);
        box-shadow:0 0 0 3px rgb(255 70 84 / 13%),0 3px 8px rgb(0 0 0 / 22%),0 0 12px rgb(255 70 84 / 20%);
      }
      .cmm-catalog {
        --cmm-text:var(--color-token-text-primary,CanvasText);
        --cmm-muted:var(--color-token-text-tertiary,color-mix(in srgb,var(--cmm-text) 55%,transparent));
        --cmm-border:var(--color-token-border-light,color-mix(in srgb,var(--cmm-text) 13%,transparent));
        --cmm-surface:var(--color-token-main-surface-primary,var(--color-token-bg-primary,Canvas));
        --cmm-raised:var(--color-token-main-surface-secondary,var(--color-token-bg-secondary,var(--cmm-surface)));
        --cmm-soft:var(--color-token-list-hover-background,color-mix(in srgb,var(--cmm-text) 7%,transparent));
        position:absolute;
        z-index:2147483647;
        max-height:258px;
        overflow:auto;
        padding:5px;
        border:1px solid var(--cmm-border);
        border-radius:10px;
        background:
          linear-gradient(180deg,color-mix(in srgb,var(--cmm-raised) 88%,transparent),var(--cmm-surface)),
          var(--cmm-surface);
        color:var(--cmm-text);
        box-shadow:0 16px 38px rgb(0 0 0 / 20%),0 0 0 1px rgb(255 255 255 / 4%) inset;
        font-size:12px;
      }
      .cmm-catalog::before {
        content:"";
        position:absolute;
        left:-5px;
        top:17px;
        width:8px;
        height:8px;
        border-left:1px solid var(--cmm-border);
        border-bottom:1px solid var(--cmm-border);
        background:var(--cmm-raised);
        transform:rotate(45deg);
      }
      .cmm-catalog[data-tight='true']::before { display:none; }
      .cmm-catalog button { color:inherit; font:inherit; }
      .cmm-family-group + .cmm-family-group { margin-top:5px; padding-top:5px; border-top:1px solid var(--cmm-border); }
      .cmm-family-title { padding:4px 8px 5px; color:var(--cmm-muted); font-size:10.5px; font-weight:700; }
      .cmm-family-model {
        display:flex;
        align-items:center;
        justify-content:space-between;
        width:100%;
        min-height:30px;
        gap:6px;
        padding:4px 8px;
        border:0;
        border-radius:8px;
        background:transparent;
        text-align:left;
        cursor:pointer;
      }
      .cmm-family-model span { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
      .cmm-family-model:hover { background:color-mix(in srgb,var(--cmm-row-accent) 10%,var(--cmm-soft)); }
      .cmm-family-model[data-selected='true'] {
        color:var(--cmm-row-accent);
        background:color-mix(in srgb,var(--cmm-row-accent) 11%,transparent);
        font-weight:650;
      }
      .cmm-family-model[data-selected='true'] i {
        flex:0 0 auto;
        width:7px;
        height:4px;
        border-left:1.5px solid currentColor;
        border-bottom:1.5px solid currentColor;
        transform:rotate(-45deg);
      }
      @keyframes cmm-track-flow {
        0%,42% { transform:translateX(-120%); }
        72%,100% { transform:translateX(120%); }
      }
      @media (max-width:260px) {
        [${POPUP_ATTR}] { width:calc(100vw - 8px)!important; }
        [${HOST_ATTR}] { padding-inline:3px; }
        .cmm-board { grid-template-columns:32px minmax(0,1fr) 25px; column-gap:3px; padding-inline:4px; }
        .cmm-board[data-ultra='false'] { grid-template-columns:32px minmax(0,1fr); }
        .cmm-row { grid-template-columns:32px minmax(0,1fr); }
        .cmm-model-name { padding-inline:1px; font-size:9px; }
        .cmm-effort-labels { font-size:8px; }
      }
      @media (forced-colors:active) {
        .cmm-board,.cmm-family-button,.cmm-catalog,.cmm-ultra { border:1px solid CanvasText; }
        .cmm-range,.cmm-dot::after,.cmm-ultra span { background:Highlight; }
      }
      @media (prefers-reduced-motion:reduce) {
        .cmm-ultra span,.cmm-thumb,.cmm-dot::after,.cmm-range { transition:none; }
        .cmm-range::after { animation:none; }
      }
    `;
    document.head.appendChild(style);
  }

  function menuRootFor(element) {
    const cached = menuRootCache.get(element);
    if (cached?.isConnected && cached.contains(element)) return cached;
    let node = element;
    while (node && node !== document.body) {
      if (node.classList) {
        for (const name of node.classList) {
          if (/^_Menu_/.test(name)) {
            menuRootCache.set(element, node);
            return node;
          }
        }
      }
      node = node.parentElement;
    }
    return null;
  }

  function mount(menu, bridge) {
    if (!(menu instanceof HTMLElement) || !bridge) return false;
    const existing = mounted.get(menu);
    const host = existing?.host || document.createElement("div");
    host.setAttribute(HOST_ATTR, "");

    if (!render(host, bridge)) {
      unmount(menu);
      return false;
    }

    if (!host.isConnected) menu.appendChild(host);
    host.__cmmPositionSlider?.();
    if (!menu.hasAttribute(MENU_ATTR)) menu.setAttribute(MENU_ATTR, "");
    const popup = menu.closest("[role='menu']") || menu.parentElement;
    if (popup && !popup.hasAttribute(POPUP_ATTR)) popup.setAttribute(POPUP_ATTR, "");
    if (host.__cmmRuntime) {
      host.__cmmRuntime.menu = menu;
      host.__cmmRuntime.popup = popup || null;
    }
    mounted.set(menu, { host, popup });
    return true;
  }

  function unmount(menu) {
    const entry = mounted.get(menu);
    if (!entry) return;
    clearRefreshTimers(entry.host);
    clearHost(entry.host);
    entry.host.remove();
    menu?.removeAttribute(MENU_ATTR);
    entry.popup?.removeAttribute(POPUP_ATTR);
    entry.popup?.style.removeProperty("--cmm-popup-shift");
    mounted.delete(menu);
  }

  function pickerCandidatesIn(root) {
    if (!root) return [];
    if (root === document) return [...document.querySelectorAll(PICKER_SELECTOR)];
    if (!(root instanceof Element)) return [];
    const candidates = [];
    if (root.matches?.(PICKER_SELECTOR)) candidates.push(root);
    root.querySelectorAll?.(PICKER_SELECTOR).forEach((candidate) => candidates.push(candidate));
    return candidates;
  }

  function cleanupMounted(knownMenus = null) {
    for (const [menu, entry] of [...mounted]) {
      if (!menu.isConnected || !entry.host.isConnected) {
        unmount(menu);
        continue;
      }
      if (knownMenus && !knownMenus.has(menu)) {
        unmount(menu);
        continue;
      }
      if (!menu.querySelector(PICKER_SELECTOR)) unmount(menu);
    }
  }

  function refreshMenu(menu) {
    if (!(menu instanceof HTMLElement)) return;
    ensureStyle();
    if (!menu.isConnected) {
      unmount(menu);
      return;
    }
    const candidate = pickerCandidatesIn(menu).find((node) => nativeBridge(node));
    if (!candidate) {
      unmount(menu);
      return;
    }
    mount(menu, nativeBridge(candidate));
  }

  function scan(root = document) {
    ensureStyle();
    const menus = new Map();
    pickerCandidatesIn(root).forEach((candidate) => {
      const menu = menuRootFor(candidate);
      const bridge = nativeBridge(candidate);
      if (!menu || !bridge) return;
      menus.set(menu, bridge);
    });
    for (const [menu, bridge] of menus) mount(menu, bridge);
    cleanupMounted(root === document ? menus : null);
  }

  function debug() {
    return [...document.querySelectorAll(PICKER_SELECTOR)].map((candidate) => {
      const bridge = nativeBridge(candidate);
      const models = bridge ? normalizeModels(bridge) : [];
      const displayModels = displayModelsFor(models);
      return {
        source: candidate.hasAttribute("data-model-picker-model-row") ? "model-row" : "power-slider",
        bridge: bridge ? "models" : "missing",
        currentModel: bridge?.model || null,
        currentEffort: normalizeEffort(bridge?.reasoningEffort) || null,
        models: models.map((model) => ({ id: model.id, efforts: model.efforts })),
        displayModels: displayModels.map((model) => model.id),
      };
    });
  }

  function requestFrame() {
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      const shouldFullScan = fullScanPending;
      const shouldCleanup = cleanupPending;
      const roots = [...pendingRoots];
      const menus = [...pendingMenus];
      fullScanPending = false;
      cleanupPending = false;
      pendingRoots.clear();
      pendingMenus.clear();

      if (shouldFullScan) {
        scan();
        return;
      }
      for (const root of roots) scan(root);
      for (const menu of menus) refreshMenu(menu);
      if (shouldCleanup) cleanupMounted();
    });
  }

  function schedule(target = null) {
    if (target === document) fullScanPending = true;
    else if (target instanceof HTMLElement && (mounted.has(target) || target.hasAttribute(MENU_ATTR))) pendingMenus.add(target);
    else if (target instanceof Element) pendingRoots.add(target);
    else fullScanPending = true;
    requestFrame();
  }

  function scheduleCleanup() {
    cleanupPending = true;
    requestFrame();
  }

  function handleMutations(records) {
    let foundPicker = false;
    let removedMountedNode = false;
    for (const record of records) {
      for (const node of record.addedNodes) {
        if (!(node instanceof Element)) continue;
        if (node.hasAttribute(HOST_ATTR) || node.closest?.(`[${HOST_ATTR}]`)) continue;
        if (node.matches?.(PICKER_SELECTOR) || node.querySelector?.(PICKER_SELECTOR)) {
          pendingRoots.add(node);
          foundPicker = true;
        }
      }
      for (const node of record.removedNodes) {
        if (!(node instanceof Element)) continue;
        for (const [menu, entry] of mounted) {
          if (node === menu || node === entry.host || node.contains(menu) || node.contains(entry.host)) {
            removedMountedNode = true;
            break;
          }
        }
      }
    }
    if (foundPicker) requestFrame();
    if (removedMountedNode) scheduleCleanup();
  }

  function refreshMountedOnPointerDown(event) {
    const target = event.target instanceof Element ? event.target : null;
    if (!mounted.size || target?.closest(`[${HOST_ATTR}]`)) return;
    for (const menu of mounted.keys()) pendingMenus.add(menu);
    requestFrame();
  }

  function dispose() {
    if (frame) cancelAnimationFrame(frame);
    document.removeEventListener("pointerdown", refreshMountedOnPointerDown, true);
    observer?.disconnect();
    observer = null;
    for (const menu of [...mounted.keys()]) unmount(menu);
    document.querySelectorAll(`[${MENU_ATTR}]`).forEach((node) => node.removeAttribute(MENU_ATTR));
    document.querySelectorAll(`[${POPUP_ATTR}]`).forEach((node) => node.removeAttribute(POPUP_ATTR));
    document.getElementById(STYLE_ID)?.remove();
    if (window[API_KEY]?.version === VERSION) delete window[API_KEY];
  }

  scan();
  document.addEventListener("pointerdown", refreshMountedOnPointerDown, true);
  observer = new MutationObserver((records) => {
    handleMutations(records);
  });
  observer.observe(document.body || document.documentElement, { childList: true, subtree: true });
  window[API_KEY] = { version: VERSION, scan, debug, dispose };
})();

/*
@codex-plus-script
name: Codex Native Matrix Selector
description: A theme-aware model and reasoning matrix backed by Codex's native selector data and handlers.
version: 0.8.0
author: Codex
*/

(() => {
  "use strict";

  const VERSION = "0.8.0";
  const API_KEY = "__codexNativeMatrixSelector";
  const STYLE_ID = "codex-native-matrix-selector-style";
  const HOST_ATTR = "data-codex-native-matrix-host";
  const NATIVE_ATTR = "data-codex-native-matrix-native";
  const MENU_ATTR = "data-codex-native-matrix-menu";
  const POPUP_ATTR = "data-codex-native-matrix-popup";
  const NORMAL_EFFORTS = ["low", "medium", "high", "xhigh", "max"];
  const REACT_KEYS = ["__reactFiber$", "__reactInternalInstance$"];

  window.__codexModelPickerPolish?.dispose?.();
  window.__codexReasoningDragSliderBuddy?.dispose?.();
  window.__codexReasoningSlider?.dispose?.();
  window[API_KEY]?.dispose?.();

  let observer = null;
  let frame = 0;
  const mounted = new Map();

  const escapeHtml = (value) => String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

  function reactFiber(element) {
    if (!element) return null;
    const key = Object.keys(element).find((name) => REACT_KEYS.some((prefix) => name.startsWith(prefix)));
    return key ? element[key] : null;
  }

  function nativeBridge(element) {
    let fiber = reactFiber(element);
    let candidate = null;
    for (let depth = 0; fiber && depth < 100; depth += 1, fiber = fiber.return) {
      const props = fiber.memoizedProps || fiber.pendingProps;
      if (!props || typeof props !== "object") continue;
      const complete = Array.isArray(props.models)
        && typeof props.onSelectModel === "function"
        && typeof props.onSelectReasoningEffort === "function"
        && typeof props.model === "string";
      if (complete) {
        return {
          models: props.models,
          model: props.model,
          reasoningEffort: props.reasoningEffort,
          onSelectModel: props.onSelectModel,
          onSelectReasoningEffort: props.onSelectReasoningEffort,
        };
      }
      if (!candidate && Array.isArray(props.powerSelections) && typeof props.onSelectPower === "function") {
        candidate = {
          powerSelections: props.powerSelections,
          selectedPowerSelection: props.selectedPowerSelection,
          onSelectPower: props.onSelectPower,
        };
      }
    }
    return candidate;
  }

  function normalizeEffort(item) {
    const value = typeof item === "string" ? item : item?.reasoningEffort;
    return typeof value === "string" ? value.toLowerCase() : "";
  }

  function normalizeModels(bridge) {
    if (Array.isArray(bridge.models)) {
      return bridge.models
        .filter((item) => item && typeof item.model === "string" && item.model.toLowerCase() !== "gpt-5.6")
        .map((item) => ({
          id: item.model,
          displayName: item.displayName || item.model,
          defaultEffort: normalizeEffort(item.defaultReasoningEffort) || "medium",
          efforts: [...new Set((item.supportedReasoningEfforts || []).map(normalizeEffort).filter(Boolean))],
        }))
        .map(applyEffortPolicy);
    }

    const byModel = new Map();
    for (const item of bridge.powerSelections || []) {
      if (!item?.model) continue;
      const model = byModel.get(item.model) || {
        id: item.model,
        displayName: item.modelLabel || item.model,
        defaultEffort: "medium",
        efforts: [],
      };
      const effort = normalizeEffort(item.reasoningEffort);
      if (effort && !model.efforts.includes(effort)) model.efforts.push(effort);
      byModel.set(item.model, model);
    }
    return [...byModel.values()]
      .filter((model) => model.id.toLowerCase() !== "gpt-5.6")
      .map(applyEffortPolicy);
  }

  function familyFor(modelId) {
    const match = /^gpt-(\d+(?:\.\d+)?)(?:-|$)/i.exec(modelId || "");
    return match ? match[1] : modelId || "Models";
  }

  function applyEffortPolicy(model) {
    const version = Number.parseFloat(familyFor(model.id));
    const allowed = new Set([...NORMAL_EFFORTS, "ultra"]);
    let efforts = model.efforts.filter((effort) => allowed.has(effort));
    if (Number.isFinite(version) && version < 5.6) {
      efforts = efforts.filter((effort) => effort !== "max" && effort !== "ultra");
    }
    const defaultEffort = efforts.includes(model.defaultEffort)
      ? model.defaultEffort
      : efforts.includes("medium") ? "medium" : efforts[0] || "medium";
    return { ...model, efforts, defaultEffort };
  }

  function familyLabel(family) {
    return /^\d/.test(family) ? `GPT-${family}` : family;
  }

  function variantLabel(model, family) {
    const full = `gpt-${family}`;
    if (model.id.toLowerCase() === full.toLowerCase()) return "Full";
    const prefix = `${full}-`;
    let displaySuffix = model.displayName.replace(/^GPT[- ]?/i, "");
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
    if (id.includes("-sol")) return "#e6a62f";
    if (id.includes("-terra")) return "#35b985";
    if (id.includes("-luna")) return "#8d7cf2";
    if (id.includes("-mini")) return "#4d8fe8";
    if (id.includes("spark")) return "#d45b78";
    return "var(--color-token-charts-blue, #2f8ff0)";
  }

  function effortLabels() {
    return { low: "Low", medium: "Mid", high: "High", xhigh: "XHigh", max: "Max" };
  }

  function selectedState(bridge, models) {
    if (bridge.model) return { model: bridge.model, effort: normalizeEffort(bridge.reasoningEffort) || "medium" };
    const selected = bridge.selectedPowerSelection;
    return {
      model: selected?.model || models[0]?.id || "",
      effort: normalizeEffort(selected?.reasoningEffort) || "medium",
    };
  }

  function select(bridge, models, modelId, effort) {
    const model = models.find((item) => item.id === modelId);
    if (!model || !model.efforts.includes(effort)) return;
    if (bridge.onSelectModel) {
      if (modelId === bridge.model) bridge.onSelectReasoningEffort(effort);
      else bridge.onSelectModel(modelId, effort);
      return;
    }
    const option = bridge.powerSelections?.find((item) => item.model === modelId && normalizeEffort(item.reasoningEffort) === effort);
    if (option) bridge.onSelectPower(option);
  }

  function selectModel(bridge, models, target, currentEffort) {
    const effort = target.efforts.includes(currentEffort)
      ? currentEffort
      : target.efforts.includes(target.defaultEffort)
        ? target.defaultEffort
        : target.efforts.find((item) => item !== "ultra") || target.efforts[0];
    if (effort) select(bridge, models, target.id, effort);
  }

  function signature(bridge, models, state) {
    return JSON.stringify({
      model: state.model,
      effort: state.effort,
      catalog: models.map((item) => [item.id, item.defaultEffort, item.efforts]),
    });
  }

  function familyMenu(models, state) {
    const groups = new Map();
    for (const model of models) {
      const family = familyFor(model.id);
      if (!groups.has(family)) groups.set(family, []);
      groups.get(family).push(model);
    }
    return [...groups.entries()].map(([family, items]) => `
      <section class="cmns-family-group">
        <div class="cmns-family-title">${escapeHtml(familyLabel(family))}</div>
        ${items.map((model) => `<button type="button" class="cmns-family-model" data-model="${escapeHtml(model.id)}" data-selected="${model.id === state.model}"><span>${escapeHtml(model.displayName)}</span><i></i></button>`).join("")}
      </section>
    `).join("");
  }

  function render(host, bridge) {
    const models = normalizeModels(bridge);
    if (!models.length) return false;
    const state = selectedState(bridge, models);
    const activeModel = models.find((item) => item.id === state.model) || models[0];
    const family = familyFor(activeModel.id);
    const variants = models.filter((item) => familyFor(item.id) === family);
    const familyVersion = Number.parseFloat(family);
    const visibleEfforts = Number.isFinite(familyVersion) && familyVersion < 5.6
      ? NORMAL_EFFORTS.slice(0, 4)
      : NORMAL_EFFORTS;
    const familyHasUltra = variants.some((model) => model.efforts.includes("ultra"));
    const labels = effortLabels();
    const sig = signature(bridge, models, state);
    if (host.dataset.signature === sig) return true;
    host.dataset.signature = sig;
    host.style.setProperty("--cmns-accent", accentFor(activeModel.id));
    host.__cmnsCatalog?.remove();

    const activeNormalEfforts = visibleEfforts.filter((key) => activeModel.efforts.includes(key));
    const activeNormal = state.effort === "ultra"
      ? Math.max(0, activeNormalEfforts.length - 1)
      : activeNormalEfforts.indexOf(state.effort);
    const ultraSupported = activeModel.efforts.includes("ultra");

    host.innerHTML = `
      <div class="cmns-toolbar">
        <div class="cmns-variants" role="tablist">
          ${variants.map((model) => `<button type="button" role="tab" data-model="${escapeHtml(model.id)}" aria-selected="${model.id === activeModel.id}">${escapeHtml(variantLabel(model, family))}</button>`).join("")}
        </div>
        <button type="button" class="cmns-family-button" aria-expanded="false"><span>${escapeHtml(familyLabel(family))}</span><i></i></button>
      </div>
      <div class="cmns-board" data-ultra="${familyHasUltra}">
        <div class="cmns-effort-labels">${visibleEfforts.map((key, index) => `<span style="--cmns-pos:${(index / (visibleEfforts.length - 1)) * 100}%">${escapeHtml(labels[key])}</span>`).join("")}</div>
        ${familyHasUltra ? '<div class="cmns-ultra-label">Ultra</div>' : ""}
        <div class="cmns-rows">
          ${variants.map((model) => {
            const active = model.id === activeModel.id;
            const normal = visibleEfforts.filter((key) => model.efforts.includes(key));
            const selectedIndex = active
              ? state.effort === "ultra" ? Math.max(0, normal.length - 1) : normal.indexOf(state.effort)
              : -1;
            const selectedEffort = selectedIndex < 0 ? null : normal[selectedIndex];
            const rowFill = selectedEffort == null ? 0 : (visibleEfforts.indexOf(selectedEffort) / (visibleEfforts.length - 1)) * 100;
            return `<div class="cmns-row" data-model="${escapeHtml(model.id)}" data-active="${active}" style="--cmns-row-accent:${accentFor(model.id)};--cmns-fill:${rowFill}%">
              <button type="button" class="cmns-model-name" title="${escapeHtml(model.displayName)}">${escapeHtml(variantLabel(model, family))}</button>
              <div class="cmns-scale" data-draggable="${active}" role="${active ? "slider" : "group"}" ${active ? `tabindex="0" aria-valuemin="0" aria-valuemax="${Math.max(0, normal.length - 1)}" aria-valuenow="${Math.max(0, selectedIndex)}"` : ""}>
                <div class="cmns-range"></div>
                ${visibleEfforts.map((key, index) => model.efforts.includes(key)
                  ? `<button type="button" class="cmns-dot" style="--cmns-pos:${(index / (visibleEfforts.length - 1)) * 100}%" data-effort="${key}" title="${escapeHtml(labels[key])}" aria-label="${escapeHtml(`${variantLabel(model, family)} ${labels[key]}`)}"></button>`
                  : `<span class="cmns-dot cmns-dot-disabled" style="--cmns-pos:${(index / (visibleEfforts.length - 1)) * 100}%"></span>`).join("")}
                ${active && selectedIndex >= 0 ? '<span class="cmns-thumb" aria-hidden="true"></span>' : ""}
              </div>
            </div>`;
          }).join("")}
        </div>
        ${familyHasUltra ? `<button type="button" class="cmns-ultra" data-active="${state.effort === "ultra"}" data-enabled="${ultraSupported}" ${ultraSupported ? "" : "disabled"} title="Ultra"><span></span><i></i></button>` : ""}
      </div>
      <div class="cmns-catalog" hidden>${familyMenu(models, state)}</div>
    `;

    const familyButton = host.querySelector(".cmns-family-button");
    const catalog = host.querySelector(".cmns-catalog");
    catalog.style.setProperty("--cmns-accent", accentFor(activeModel.id));
    host.__cmnsCatalog = catalog;
    document.body.appendChild(catalog);
    familyButton.addEventListener("click", (event) => {
      event.stopPropagation();
      catalog.hidden = !catalog.hidden;
      familyButton.setAttribute("aria-expanded", String(!catalog.hidden));
      if (!catalog.hidden) {
        const buttonRect = familyButton.getBoundingClientRect();
        const panelRect = host.getBoundingClientRect();
        const width = Math.min(220, Math.max(170, window.innerWidth - 16));
        const left = panelRect.right + 8;
        const top = Math.max(8, Math.min(buttonRect.top, window.innerHeight - 268));
        catalog.style.width = `${width}px`;
        catalog.style.left = `${left}px`;
        catalog.style.top = `${top}px`;
      }
    });
    catalog.addEventListener("pointerdown", (event) => event.stopPropagation());

    host.querySelectorAll(".cmns-variants [data-model], .cmns-model-name").forEach((button) => {
      button.addEventListener("click", () => {
        const row = button.closest("[data-model]");
        const target = models.find((item) => item.id === (button.dataset.model || row?.dataset.model));
        if (target) selectModel(bridge, models, target, state.effort);
      });
    });

    catalog.querySelectorAll(".cmns-family-model").forEach((button) => {
      const chooseModel = () => {
        const target = models.find((item) => item.id === button.dataset.model);
        if (target) selectModel(bridge, models, target, state.effort);
        catalog.hidden = true;
      };
      button.addEventListener("pointerdown", (event) => {
        chooseModel();
        event.preventDefault();
        event.stopPropagation();
      });
      button.addEventListener("click", (event) => {
        if (event.detail === 0) chooseModel();
        event.stopPropagation();
      });
    });

    let suppressDotClick = false;
    host.querySelectorAll(".cmns-dot[data-effort]").forEach((button) => {
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        if (suppressDotClick) {
          event.preventDefault();
          return;
        }
        const row = button.closest(".cmns-row");
        select(bridge, models, row.dataset.model, button.dataset.effort);
      });
    });

    const activeScale = host.querySelector('.cmns-row[data-active="true"] .cmns-scale');
    if (activeScale && activeNormalEfforts.length) {
      let preview = Math.max(0, activeNormal);
      let dragging = false;
      let moved = false;
      let pointerStartX = 0;
      const updatePreview = (clientX, continuous = false) => {
        const rect = activeScale.getBoundingClientRect();
        const ratio = rect.width ? Math.max(0, Math.min(1, (clientX - rect.left) / rect.width)) : 0;
        const targetPosition = ratio * (visibleEfforts.length - 1);
        preview = activeNormalEfforts.reduce((best, effort, index) => {
          const distance = Math.abs(visibleEfforts.indexOf(effort) - targetPosition);
          const bestDistance = Math.abs(visibleEfforts.indexOf(activeNormalEfforts[best]) - targetPosition);
          return distance < bestDistance ? index : best;
        }, 0);
        const canonicalIndex = visibleEfforts.indexOf(activeNormalEfforts[preview]);
        const fill = continuous ? ratio * 100 : (canonicalIndex / (visibleEfforts.length - 1)) * 100;
        activeScale.closest(".cmns-row").style.setProperty("--cmns-fill", `${fill}%`);
      };
      activeScale.addEventListener("pointerdown", (event) => {
        dragging = true;
        moved = false;
        pointerStartX = event.clientX;
        activeScale.dataset.dragging = "true";
        activeScale.setPointerCapture?.(event.pointerId);
        updatePreview(event.clientX, true);
        event.preventDefault();
      });
      activeScale.addEventListener("pointermove", (event) => {
        if (!dragging) return;
        if (Math.abs(event.clientX - pointerStartX) > 3) moved = true;
        updatePreview(event.clientX, true);
        event.preventDefault();
      });
      activeScale.addEventListener("pointerup", (event) => {
        if (!dragging) return;
        dragging = false;
        delete activeScale.dataset.dragging;
        updatePreview(event.clientX, false);
        suppressDotClick = moved;
        if (moved) window.setTimeout(() => { suppressDotClick = false; }, 0);
        select(bridge, models, activeModel.id, activeNormalEfforts[preview]);
        event.preventDefault();
      });
      activeScale.addEventListener("pointercancel", () => {
        dragging = false;
        delete activeScale.dataset.dragging;
      });
      activeScale.addEventListener("keydown", (event) => {
        if (event.key === "ArrowLeft") preview = Math.max(0, preview - 1);
        else if (event.key === "ArrowRight") preview = Math.min(activeNormalEfforts.length - 1, preview + 1);
        else if (event.key === "Home") preview = 0;
        else if (event.key === "End") preview = activeNormalEfforts.length - 1;
        else return;
        select(bridge, models, activeModel.id, activeNormalEfforts[preview]);
        event.preventDefault();
      });
    }

    host.querySelector(".cmns-ultra")?.addEventListener("click", () => {
      if (!ultraSupported) return;
      const fallback = activeNormalEfforts.includes(activeModel.defaultEffort)
        ? activeModel.defaultEffort
        : activeNormalEfforts.at(-1);
      select(bridge, models, activeModel.id, state.effort === "ultra" ? fallback : "ultra");
    });
    return true;
  }

  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      [${POPUP_ATTR}] { width:min(250px,calc(100vw - 12px))!important; max-width:250px!important; }
      [${MENU_ATTR}] { width:100%!important; height:auto!important; overflow:visible!important; }
      [${MENU_ATTR}] > [class*='_ViewTrack_'] { display:none!important; }
      [${NATIVE_ATTR}] { display:none!important; }
      [${HOST_ATTR}] { --cmns-text:var(--color-token-text-primary,CanvasText); --cmns-muted:var(--color-token-text-tertiary,color-mix(in srgb,var(--cmns-text) 56%,transparent)); --cmns-border:var(--color-token-border-light,color-mix(in srgb,var(--cmns-text) 13%,transparent)); --cmns-surface:var(--color-token-main-surface-primary,var(--color-token-bg-primary,Canvas)); --cmns-soft:var(--color-token-list-hover-background,color-mix(in srgb,var(--cmns-text) 7%,transparent)); position:relative; width:100%; min-width:0; padding:5px 6px 7px; color:var(--cmns-text); font-size:11px; }
      [${HOST_ATTR}] button { font:inherit; color:inherit; }
      .cmns-toolbar { display:flex; align-items:center; gap:5px; min-height:27px; margin-bottom:5px; }
      .cmns-family-button { display:flex; flex-shrink:0; align-items:center; gap:5px; height:25px; padding:0 7px; border:1px solid var(--cmns-border); border-radius:7px; background:transparent; color:var(--cmns-muted); cursor:pointer; white-space:nowrap; }
      .cmns-family-button i { width:6px; height:6px; border-right:1.5px solid currentColor; border-bottom:1.5px solid currentColor; transform:rotate(45deg) translateY(-2px); }
      .cmns-variants { display:flex; min-width:0; flex:1; gap:2px; border-bottom:1px solid var(--cmns-border); }
      .cmns-variants button { position:relative; min-width:0; flex:1; height:26px; padding:2px 5px; overflow:hidden; border:0; border-radius:6px 6px 0 0; background:transparent; color:var(--cmns-muted); text-overflow:ellipsis; white-space:nowrap; cursor:pointer; }
      .cmns-variants button:hover,.cmns-family-button:hover,.cmns-model-name:hover { background:var(--cmns-soft); }
      .cmns-variants button[aria-selected='true'] { color:var(--cmns-accent); font-weight:600; }
      .cmns-variants button[aria-selected='true']::after { content:""; position:absolute; height:2px; inset:auto 7px 0; border-radius:2px; background:var(--cmns-accent); }
      .cmns-board { display:grid; grid-template-columns:40px minmax(0,1fr) 32px; grid-template-rows:18px auto; column-gap:5px; padding:6px; border:1px solid var(--cmns-border); border-radius:10px; background:color-mix(in srgb,var(--cmns-soft) 55%,transparent); }
      .cmns-board[data-ultra='false'] { grid-template-columns:40px minmax(0,1fr); }
      .cmns-effort-labels { grid-column:2; position:relative; color:var(--cmns-muted); font-size:8px; }
      .cmns-effort-labels span { position:absolute; top:50%; left:var(--cmns-pos); width:38px; overflow:hidden; transform:translate(-50%,-50%); text-align:center; text-overflow:ellipsis; white-space:nowrap; }
      .cmns-effort-labels span:first-child { transform:translate(0,-50%); text-align:left; }
      .cmns-effort-labels span:last-child { transform:translate(-100%,-50%); text-align:right; }
      .cmns-ultra-label { grid-column:3; color:var(--cmns-muted); font-size:9px; font-weight:650; text-align:center; text-transform:uppercase; }
      .cmns-rows { grid-column:1 / 3; display:flex; flex-direction:column; gap:2px; min-width:0; }
      .cmns-row { display:grid; grid-template-columns:40px minmax(0,1fr); align-items:center; min-height:27px; }
      .cmns-model-name { height:24px; padding:0 4px; overflow:hidden; border:0; border-radius:6px; background:transparent; color:var(--cmns-muted); text-align:left; text-overflow:ellipsis; white-space:nowrap; cursor:pointer; }
      .cmns-row[data-active='true'] .cmns-model-name { color:var(--cmns-row-accent); font-weight:600; }
      .cmns-scale { position:relative; height:25px; border-radius:999px; outline:0; }
      .cmns-row[data-active='true'] .cmns-scale { background:color-mix(in srgb,var(--cmns-row-accent) 12%,var(--cmns-soft)); box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--cmns-row-accent) 14%,transparent),0 2px 8px color-mix(in srgb,var(--cmns-row-accent) 10%,transparent); cursor:ew-resize; touch-action:none; transition:box-shadow .18s ease; }
      .cmns-range { display:none; position:absolute; inset:0 auto 0 0; width:var(--cmns-fill); max-width:100%; overflow:hidden; border-radius:999px; background:linear-gradient(90deg,color-mix(in srgb,var(--cmns-row-accent) 82%,white),var(--cmns-row-accent)); opacity:.94; }
      .cmns-range::after { content:""; position:absolute; inset:0; background:linear-gradient(105deg,transparent 22%,rgb(255 255 255 / 24%) 44%,transparent 66%); transform:translateX(-120%); animation:cmns-track-flow 2.6s ease-in-out infinite; }
      .cmns-row[data-active='true'] .cmns-range { display:block; }
      .cmns-dot { position:absolute; z-index:1; top:0; left:clamp(13px,var(--cmns-pos),calc(100% - 13px)); width:26px; height:25px; padding:0; border:0; transform:translateX(-50%); background:transparent; cursor:pointer; }
      .cmns-dot::after { content:""; display:block; width:4px; height:4px; margin:auto; border-radius:50%; background:color-mix(in srgb,var(--cmns-text) 28%,transparent); transition:transform .16s ease,box-shadow .16s ease; }
      .cmns-row[data-active='true'] .cmns-dot::after { background:color-mix(in srgb,#fff 68%,var(--cmns-row-accent)); }
      .cmns-dot-disabled { opacity:.12; pointer-events:none; }
      .cmns-thumb { position:absolute; z-index:2; top:50%; left:clamp(12px,var(--cmns-fill),calc(100% - 12px)); width:24px; height:24px; border-radius:50%; transform:translate(-50%,-50%); background:radial-gradient(circle at 34% 28%,#fff 0 18%,color-mix(in srgb,var(--cmns-surface) 94%,var(--cmns-row-accent)) 52%); box-shadow:0 2px 7px rgb(0 0 0 / 24%),0 0 0 2px color-mix(in srgb,var(--cmns-row-accent) 20%,transparent),0 0 12px color-mix(in srgb,var(--cmns-row-accent) 22%,transparent); pointer-events:none; transition:box-shadow .16s ease,transform .16s ease; }
      .cmns-scale[data-dragging='true'] { box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--cmns-row-accent) 24%,transparent),0 0 13px color-mix(in srgb,var(--cmns-row-accent) 24%,transparent)!important; }
      .cmns-scale[data-dragging='true'] .cmns-thumb { transform:translate(-50%,-50%) scale(1.08); box-shadow:0 3px 9px rgb(0 0 0 / 27%),0 0 0 3px color-mix(in srgb,var(--cmns-row-accent) 25%,transparent),0 0 17px color-mix(in srgb,var(--cmns-row-accent) 34%,transparent); }
      .cmns-scale[data-dragging='true'] .cmns-dot::after { transform:scale(1.2); box-shadow:0 0 6px color-mix(in srgb,var(--cmns-row-accent) 42%,transparent); }
      .cmns-scale:focus-visible { box-shadow:0 0 0 2px color-mix(in srgb,var(--cmns-row-accent) 40%,transparent); }
      .cmns-ultra { grid-column:3; grid-row:2; position:relative; align-self:stretch; min-height:58px; border:1px solid var(--cmns-border); border-radius:15px; background:color-mix(in srgb,var(--cmns-text) 5%,transparent); cursor:pointer; }
      .cmns-ultra:disabled { opacity:.28; cursor:default; }
      .cmns-ultra i { position:absolute; top:15px; bottom:15px; left:50%; width:4px; border-radius:9px; transform:translateX(-50%); background:color-mix(in srgb,var(--cmns-text) 36%,transparent); }
      .cmns-ultra span { position:absolute; z-index:1; left:50%; bottom:7px; width:20px; height:20px; border-radius:50%; transform:translateX(-50%); background:#8b8b8f; box-shadow:0 2px 6px rgb(0 0 0 / 28%); transition:bottom .2s ease,background-color .2s ease; }
      .cmns-ultra[data-active='true'] span { bottom:calc(100% - 27px); background:#ff4654; box-shadow:0 0 0 3px rgb(255 70 84 / 16%),0 2px 7px rgb(0 0 0 / 30%); }
      .cmns-catalog { --cmns-text:var(--color-token-text-primary,CanvasText); --cmns-muted:var(--color-token-text-tertiary,color-mix(in srgb,var(--cmns-text) 56%,transparent)); --cmns-border:var(--color-token-border-light,color-mix(in srgb,var(--cmns-text) 13%,transparent)); --cmns-surface:var(--color-token-main-surface-primary,var(--color-token-bg-primary,Canvas)); --cmns-soft:var(--color-token-list-hover-background,color-mix(in srgb,var(--cmns-text) 7%,transparent)); position:fixed; z-index:2147483647; max-height:250px; overflow:auto; padding:4px; border:1px solid var(--cmns-border); border-radius:9px; background:var(--cmns-surface); color:var(--cmns-text); box-shadow:0 12px 30px rgb(0 0 0 / 24%); font-size:11px; }
      .cmns-catalog button { color:inherit; font:inherit; }
      .cmns-family-group + .cmns-family-group { margin-top:5px; padding-top:5px; border-top:1px solid var(--cmns-border); }
      .cmns-family-title { padding:3px 7px; color:var(--cmns-muted); font-size:10px; font-weight:650; }
      .cmns-family-model { display:flex; align-items:center; justify-content:space-between; width:100%; min-height:29px; padding:4px 7px; border:0; border-radius:6px; background:transparent; text-align:left; cursor:pointer; }
      .cmns-family-model:hover { background:var(--cmns-soft); } .cmns-family-model[data-selected='true'] { color:var(--cmns-accent); }
      .cmns-family-model[data-selected='true'] i { width:7px; height:4px; border-left:1.5px solid currentColor; border-bottom:1.5px solid currentColor; transform:rotate(-45deg); }
      @keyframes cmns-track-flow { 0%,42% { transform:translateX(-120%); } 72%,100% { transform:translateX(120%); } }
      @media (max-width:260px) { [${POPUP_ATTR}] { width:calc(100vw - 8px)!important; } [${HOST_ATTR}] { padding-inline:3px; } .cmns-board { grid-template-columns:36px minmax(0,1fr) 29px; column-gap:3px; padding-inline:4px; } .cmns-board[data-ultra='false'] { grid-template-columns:36px minmax(0,1fr); } .cmns-row { grid-template-columns:36px minmax(0,1fr); } .cmns-model-name { padding-inline:1px; font-size:9px; } .cmns-effort-labels { font-size:7px; } }
      @media (prefers-reduced-motion:reduce) { .cmns-ultra span,.cmns-thumb,.cmns-dot::after { transition:none; } .cmns-range::after { animation:none; } }
    `;
    document.head.appendChild(style);
  }

  function menuRootFor(element) {
    let node = element;
    while (node && node !== document.body) {
      if ([...node.classList].some((name) => /^_Menu_/.test(name))) return node;
      node = node.parentElement;
    }
    return null;
  }

  function mount(menu, bridge) {
    if (!(menu instanceof HTMLElement) || !bridge) return false;
    let host = menu.querySelector(`:scope > [${HOST_ATTR}]`);
    if (!host) {
      host = document.createElement("div");
      host.setAttribute(HOST_ATTR, "");
      menu.appendChild(host);
    }
    if (!menu.hasAttribute(MENU_ATTR)) menu.setAttribute(MENU_ATTR, "");
    const popup = menu.closest("[role='menu']") || menu.parentElement;
    if (popup && !popup.hasAttribute(POPUP_ATTR)) popup.setAttribute(POPUP_ATTR, "");
    mounted.set(menu, { host, popup });
    return render(host, bridge);
  }

  function patchNativeLowLabels() {
    document.querySelectorAll("button,[role='button']").forEach((element) => {
      if (!(element instanceof HTMLElement)) return;
      if (element.closest(`[${HOST_ATTR}],.cmns-catalog`)) return;
      const text = (element.textContent || "").replace(/\s+/g, " ").trim();
      if (!/(?:5\.6|Sol|Terra|Luna).*\bLight\b/i.test(text)) return;
      const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
      let node = walker.nextNode();
      while (node) {
        if ((node.nodeValue || "").trim() === "Light") {
          node.nodeValue = (node.nodeValue || "").replace("Light", "Low");
        }
        node = walker.nextNode();
      }
    });
  }

  function scan() {
    ensureStyle();
    patchNativeLowLabels();
    const menus = new Map();
    document.querySelectorAll("[data-model-picker-model-row],[data-model-picker-power-slider]").forEach((candidate) => {
      const menu = menuRootFor(candidate);
      const bridge = nativeBridge(candidate);
      if (!menu || !bridge) return;
      const current = menus.get(menu);
      if (!current || (!current.models && bridge.models)) menus.set(menu, bridge);
    });
    for (const [menu, bridge] of menus) mount(menu, bridge);
    for (const [menu, entry] of mounted) {
      if (menu.isConnected && entry.host.isConnected) continue;
      entry.host.__cmnsCatalog?.remove();
      mounted.delete(menu);
    }
  }

  function debug() {
    return [...document.querySelectorAll("[data-model-picker-model-row],[data-model-picker-power-slider]")].map((candidate) => {
      const bridge = nativeBridge(candidate);
      const models = bridge ? normalizeModels(bridge) : [];
      return {
        source: candidate.hasAttribute("data-model-picker-model-row") ? "model-row" : "power-slider",
        bridge: bridge ? (bridge.models ? "catalog" : "powerSelections") : "missing",
        currentModel: bridge?.model || bridge?.selectedPowerSelection?.model || null,
        currentEffort: bridge?.reasoningEffort || bridge?.selectedPowerSelection?.reasoningEffort || null,
        models: models.map((model) => ({ id: model.id, efforts: model.efforts })),
      };
    });
  }

  function schedule() {
    if (frame) return;
    frame = requestAnimationFrame(() => { frame = 0; scan(); });
  }

  function dispose() {
    if (frame) cancelAnimationFrame(frame);
    observer?.disconnect();
    observer = null;
    for (const [menu, { host, popup }] of mounted) {
      menu?.removeAttribute(MENU_ATTR);
      popup?.removeAttribute(POPUP_ATTR);
      host.__cmnsCatalog?.remove();
      host.remove();
    }
    mounted.clear();
    document.querySelectorAll(`[${NATIVE_ATTR}]`).forEach((node) => node.removeAttribute(NATIVE_ATTR));
    document.querySelectorAll(`[${MENU_ATTR}]`).forEach((node) => node.removeAttribute(MENU_ATTR));
    document.querySelectorAll(`[${POPUP_ATTR}]`).forEach((node) => node.removeAttribute(POPUP_ATTR));
    document.getElementById(STYLE_ID)?.remove();
    if (window[API_KEY]?.version === VERSION) delete window[API_KEY];
  }

  scan();
  observer = new MutationObserver(schedule);
  observer.observe(document.body || document.documentElement, { childList: true, subtree: true, attributes: true });
  window[API_KEY] = { version: VERSION, scan, debug, dispose };
})();

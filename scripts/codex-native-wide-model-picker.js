// Codex++ user script: keep the native auto-width trigger, raise its cap,
// and widen only the fixed-width model picker menu.
(() => {
  "use strict";

  const VERSION = 4;
  const PICKER_WIDTH_SCALE = 1.5;
  const TRIGGER_MAX_SCALE = 1.5;
  const VIEWPORT_MARGIN = 8;
  const MIN_MEASURABLE_WIDTH = 80;
  const TRIGGER_SELECTOR = "[data-codex-intelligence-trigger]";
  const OPEN_TRIGGER_SELECTOR =
    '[data-codex-intelligence-trigger][aria-expanded="true"]';
  const TRIGGER_CONTENT_SELECTOR = '[class*="_ModelPickerTriggerContent_"]';
  const ROOT_SELECTOR =
    '[data-model-picker-view]:not([data-model-picker-view="grid"])';
  const MENU_SELECTOR = '[data-radix-menu-content][role="menu"]';

  const previous = window.__codexNativeWideModelPicker;
  if (previous && previous.version === VERSION) return;
  previous?.dispose?.();

  let scanTimer = 0;
  let maintenanceTimer = 0;
  let activeRoot = null;
  let scanning = false;
  let disposed = false;

  function isVisible(element) {
    if (!element || !element.isConnected) return false;
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  function computedPixel(value) {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function visibleTriggers() {
    return [...document.querySelectorAll(TRIGGER_SELECTOR)].filter(
      (element) => isVisible(element) && !element.disabled,
    );
  }

  function visibleOpenTrigger() {
    return (
      [...document.querySelectorAll(OPEN_TRIGGER_SELECTOR)].find(isVisible) ||
      visibleTriggers()[0] ||
      null
    );
  }

  function visiblePickerRoot() {
    return [...document.querySelectorAll(ROOT_SELECTOR)].find(isVisible) || null;
  }

  function pickerMenu(root) {
    return root?.parentElement?.closest(MENU_SELECTOR) || null;
  }

  function raiseTriggerMaxWidth(trigger) {
    const content = trigger.querySelector(TRIGGER_CONTENT_SELECTOR);
    if (!content) return false;

    let baseMax = computedPixel(content.dataset.codexNativeWideTriggerBaseMax);
    if (!baseMax) {
      const previousMax = content.style.maxWidth;
      content.style.removeProperty("max-width");
      const computedMax = getComputedStyle(content).maxWidth;

      if (computedMax === "none") {
        content.style.maxWidth = previousMax;
        return true;
      }

      baseMax =
        computedPixel(computedMax) ||
        computedPixel(getComputedStyle(content).width);
      content.style.maxWidth = previousMax;

      if (baseMax < MIN_MEASURABLE_WIDTH) return false;
      content.dataset.codexNativeWideTriggerBaseMax = String(baseMax);
    }

    const targetMax = `${Math.round(baseMax * TRIGGER_MAX_SCALE)}px`;
    if (content.style.maxWidth !== targetMax) {
      content.style.setProperty("max-width", targetMax, "important");
    }
    return true;
  }

  function raiseTriggerCaps() {
    let ready = true;
    for (const trigger of visibleTriggers()) {
      if (!raiseTriggerMaxWidth(trigger)) ready = false;
    }
    return ready;
  }

  function menuBaseWidth(menu, root) {
    const saved = computedPixel(menu.dataset.codexNativeWideMenuBase);
    if (saved >= MIN_MEASURABLE_WIDTH) return saved;

    const previousMenuWidth = menu.style.width;
    const previousRootWidth = root.style.width;
    menu.style.removeProperty("width");
    root.style.removeProperty("width");

    const naturalWidth =
      computedPixel(getComputedStyle(menu).width) ||
      computedPixel(getComputedStyle(root).width);

    menu.style.width = previousMenuWidth;
    root.style.width = previousRootWidth;

    if (naturalWidth < MIN_MEASURABLE_WIDTH) return 0;
    menu.dataset.codexNativeWideMenuBase = String(naturalWidth);
    return naturalWidth;
  }

  function centerMenu(root, menu, wrapper) {
    if (!root.isConnected || !menu.isConnected || !wrapper.isConnected) return;

    wrapper.style.setProperty("translate", "0px 0px", "important");
    const rootRect = root.getBoundingClientRect();
    const trigger = visibleOpenTrigger();
    const triggerRect = trigger?.getBoundingClientRect();

    let desiredLeft = rootRect.left;
    if (triggerRect && triggerRect.width > 0) {
      const triggerCenter = triggerRect.left + triggerRect.width / 2;
      desiredLeft = triggerCenter - rootRect.width / 2;
    }

    const maxLeft = Math.max(
      VIEWPORT_MARGIN,
      window.innerWidth - rootRect.width - VIEWPORT_MARGIN,
    );
    desiredLeft = Math.min(Math.max(desiredLeft, VIEWPORT_MARGIN), maxLeft);
    const shift = desiredLeft - rootRect.left;
    wrapper.style.setProperty("translate", `${shift}px 0px`, "important");
  }

  function widenPickerMenu() {
    const root = visiblePickerRoot();
    if (!root) {
      activeRoot = null;
      return;
    }

    activeRoot = root;
    const menu = pickerMenu(root);
    const wrapper = menu?.closest("[data-radix-popper-content-wrapper]");
    if (!menu || !wrapper) return;

    const baseWidth = menuBaseWidth(menu, root);
    if (!baseWidth) {
      scanTimer = window.setTimeout(scan, 40);
      return;
    }

    const zoom = computedPixel(getComputedStyle(menu).zoom) || 1;
    const viewportLimit = Math.max(
      220,
      (window.innerWidth - VIEWPORT_MARGIN * 2) / zoom,
    );
    const targetWidth = Math.round(
      Math.min(baseWidth * PICKER_WIDTH_SCALE, viewportLimit),
    );
    const targetValue = `${targetWidth}px`;

    if (
      menu.style.getPropertyValue("width") !== targetValue ||
      root.style.getPropertyValue("width") !== targetValue
    ) {
      menu.style.setProperty("width", targetValue, "important");
      root.style.setProperty("width", targetValue, "important");
    }

    requestAnimationFrame(() => centerMenu(root, menu, wrapper));
    window.setTimeout(() => centerMenu(root, menu, wrapper), 360);
  }

  function scan() {
    if (disposed || scanning) return;
    scanning = true;
    try {
      clearTimeout(scanTimer);
      const triggerReady = raiseTriggerCaps();
      widenPickerMenu();
      if (!triggerReady) scanTimer = window.setTimeout(scan, 80);
    } finally {
      scanning = false;
    }
  }

  function scheduleScan() {
    if (disposed) return;
    // Run now so the first painted menu frame already has the new width.
    scan();
  }

  function containsPicker(node) {
    if (!(node instanceof Element)) return false;
    return node.matches(ROOT_SELECTOR) || !!node.querySelector(ROOT_SELECTOR);
  }

  function containsTrigger(node) {
    if (!(node instanceof Element)) return false;
    return (
      node.matches(TRIGGER_SELECTOR) || !!node.querySelector(TRIGGER_SELECTOR)
    );
  }

  function targetWithinTrigger(node) {
    const element = node instanceof Element ? node : node.parentElement;
    return !!element?.closest(TRIGGER_SELECTOR);
  }

  const observer = new MutationObserver((records) => {
    if (activeRoot?.isConnected) {
      for (const record of records) {
        const target =
          record.target instanceof Element
            ? record.target
            : record.target.parentElement;
        if (
          (target && activeRoot.contains(target)) ||
          [...record.addedNodes].some(containsPicker)
        ) {
          scheduleScan();
          return;
        }
      }
      return;
    }

    for (const record of records) {
      if (targetWithinTrigger(record.target)) {
        scheduleScan();
        return;
      }

      for (const node of record.addedNodes) {
        if (containsPicker(node) || containsTrigger(node)) {
          scheduleScan();
          return;
        }
      }
    }
  });

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    characterData: true,
  });

  // Recover the cap if Codex clears inline styles during an unrelated rerender.
  maintenanceTimer = window.setInterval(raiseTriggerCaps, 500);

  const runtime = {
    version: VERSION,
    refresh: scheduleScan,
    dispose() {
      if (disposed) return;
      disposed = true;
      clearTimeout(scanTimer);
      clearInterval(maintenanceTimer);
      observer.disconnect();

      for (const trigger of document.querySelectorAll(TRIGGER_SELECTOR)) {
        const content = trigger.querySelector(TRIGGER_CONTENT_SELECTOR);
        content?.style.removeProperty("max-width");
        content?.removeAttribute("data-codex-native-wide-trigger-base-max");
      }

      for (const root of document.querySelectorAll(ROOT_SELECTOR)) {
        const menu = pickerMenu(root);
        const wrapper = menu?.closest("[data-radix-popper-content-wrapper]");
        root.style.removeProperty("width");
        menu?.style.removeProperty("width");
        wrapper?.style.removeProperty("translate");
        menu?.removeAttribute("data-codex-native-wide-menu-base");
      }

      delete window.__codexNativeWideModelPicker;
    },
  };

  window.__codexNativeWideModelPicker = runtime;
  scan();
})();

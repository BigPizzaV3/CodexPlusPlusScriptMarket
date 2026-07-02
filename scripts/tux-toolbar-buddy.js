/*
@codex-plus-script
name: Tux Toolbar Buddy
description: Replace the heavy menu trigger with a compact Tux toolbar button and hide status/version clutter.
version: 0.1.0
author: 0xTotoroX
*/

(() => {
  const SCRIPT_VERSION = "0.1.0";
  const STYLE_ID = "tux-toolbar-buddy-style";
  const API_KEY = "__tuxToolbarBuddy";
  const LEGACY_API_KEYS = ["__codexPlusLiteMenuEntry", "__codexPlusMenuEntryLite", "__codexPlusPenguinToolbarButton"];
  const LEGACY_STYLE_IDS = [
    "codex-plus-lite-menu-entry-style",
    "codex-plus-menu-entry-lite-style",
    "codex-plus-penguin-toolbar-button-style",
  ];
  const LABEL = "Codex++";
  const ICON_DATA_URI = [
    "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",
  ].join("");
  const ICON_HTML = `<img class="tux-toolbar-buddy-icon" src="data:image/png;base64,${ICON_DATA_URI}" alt="" draggable="false">`;

  LEGACY_API_KEYS.forEach((key) => {
    window[key]?.dispose?.();
    delete window[key];
  });
  window[API_KEY]?.dispose?.();
  removeLegacyArtifacts();

  let observer = null;
  let frame = 0;
  const touchedButtons = new Map();
  const touchedIndicators = new Map();

  function ensureStyle() {
    let style = document.getElementById(STYLE_ID);
    if (!style) {
      style = document.createElement("style");
      style.id = STYLE_ID;
      document.head.appendChild(style);
    }

    style.textContent = `
      #codex-plus-menu .codex-plus-backend-indicator,
      #codex-plus-menu [data-codex-backend-indicator],
      [data-codex-plus-menu="true"] .codex-plus-backend-indicator,
      [data-codex-plus-menu="true"] [data-codex-backend-indicator] {
        display: none !important;
      }

      #codex-plus-menu button[data-tux-toolbar-buddy="true"],
      [data-codex-plus-menu="true"] button[data-tux-toolbar-buddy="true"] {
        gap: 0 !important;
        width: 32px !important;
        min-width: 32px !important;
        max-width: 32px !important;
        height: 32px !important;
        min-height: 32px !important;
        padding: 0 !important;
        border-color: transparent !important;
        background: transparent !important;
        box-shadow: none !important;
        color: var(--text-primary, currentColor) !important;
        font-size: 0 !important;
        font-weight: 600 !important;
        letter-spacing: 0 !important;
        opacity: .72;
        border-radius: 8px !important;
        overflow: hidden;
      }

      #codex-plus-menu button[data-tux-toolbar-buddy="true"]:hover,
      [data-codex-plus-menu="true"] button[data-tux-toolbar-buddy="true"]:hover {
        background: color-mix(in srgb, currentColor 8%, transparent) !important;
        opacity: 1;
      }

      #codex-plus-menu [data-tux-toolbar-buddy-glyph="true"],
      [data-codex-plus-menu="true"] [data-tux-toolbar-buddy-glyph="true"] {
        position: relative;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 26px;
        height: 26px;
        color: inherit;
      }

      #codex-plus-menu .tux-toolbar-buddy-icon,
      [data-codex-plus-menu="true"] .tux-toolbar-buddy-icon {
        display: block;
        width: 26px;
        height: 26px;
        object-fit: contain;
        object-position: center;
        image-rendering: auto;
        filter: drop-shadow(0 .5px .4px rgb(0 0 0 / 18%));
        overflow: visible;
        pointer-events: none;
        user-select: none;
      }

      #codex-plus-menu [data-codex-plus-trigger-label],
      [data-codex-plus-menu="true"] [data-codex-plus-trigger-label] {
        position: absolute !important;
        width: 1px !important;
        height: 1px !important;
        margin: -1px !important;
        padding: 0 !important;
        overflow: hidden !important;
        clip: rect(0 0 0 0) !important;
        white-space: nowrap !important;
        border: 0 !important;
      }
    `;
  }

  function readAttribute(element, name) {
    return element.hasAttribute(name) ? element.getAttribute(name) : null;
  }

  function restoreAttribute(element, name, value) {
    if (value === null) {
      element.removeAttribute(name);
      return;
    }
    element.setAttribute(name, value);
  }

  function removeLegacyArtifacts(root = document) {
    LEGACY_STYLE_IDS.forEach((id) => document.getElementById(id)?.remove());
    root
      .querySelectorAll?.(
        [
          "[data-codex-plus-lite-glyph]",
          "[data-codex-plus-menu-entry-lite-glyph]",
          "[data-codex-plus-penguin-toolbar-button-glyph]",
        ].join(", "),
      )
      .forEach((glyph) => glyph.remove());
    root
      .querySelectorAll?.(
        [
          "[data-codex-plus-lite-entry]",
          "[data-codex-plus-menu-entry-lite]",
          "[data-codex-plus-penguin-toolbar-button]",
        ].join(", "),
      )
      .forEach((button) => {
        button.removeAttribute("data-codex-plus-lite-entry");
        button.removeAttribute("data-codex-plus-menu-entry-lite");
        button.removeAttribute("data-codex-plus-penguin-toolbar-button");
      });
  }

  function rememberIndicator(indicator) {
    if (!touchedIndicators.has(indicator)) {
      touchedIndicators.set(indicator, readAttribute(indicator, "aria-hidden"));
    }
    indicator.setAttribute("aria-hidden", "true");
  }

  function rememberButton(button) {
    if (touchedButtons.has(button)) return touchedButtons.get(button);

    const label = button.querySelector("[data-codex-plus-trigger-label]");
    const textNode = Array.from(button.childNodes).find(
      (node) => node.nodeType === Node.TEXT_NODE && String(node.textContent || "").includes(LABEL),
    );
    const state = {
      title: readAttribute(button, "title"),
      ariaLabel: readAttribute(button, "aria-label"),
      label,
      labelText: label?.textContent ?? null,
      textNode,
      textText: textNode?.textContent ?? null,
    };
    touchedButtons.set(button, state);
    return state;
  }

  function codexPlusButtons() {
    return Array.from(document.querySelectorAll("#codex-plus-menu button, [data-codex-plus-menu='true'] button"))
      .filter((button) => (button.textContent || "").trim().startsWith(LABEL));
  }

  function normalizeButton(button) {
    const state = rememberButton(button);
    removeLegacyArtifacts(button);
    button.dataset.tuxToolbarBuddy = "true";
    button.title = LABEL;
    button.setAttribute("aria-label", LABEL);

    button
      .querySelectorAll(".codex-plus-backend-indicator, [data-codex-backend-indicator]")
      .forEach(rememberIndicator);

    let glyph = button.querySelector("[data-tux-toolbar-buddy-glyph]");
    if (!glyph) {
      glyph = document.createElement("span");
      glyph.dataset.tuxToolbarBuddyGlyph = "true";
      glyph.setAttribute("aria-hidden", "true");
      button.appendChild(glyph);
    }
    if (glyph.dataset.tuxToolbarBuddyIconVersion !== SCRIPT_VERSION) {
      glyph.innerHTML = ICON_HTML;
      glyph.dataset.tuxToolbarBuddyIconVersion = SCRIPT_VERSION;
    }

    const label = state.label || button.querySelector("[data-codex-plus-trigger-label]");
    if (label) {
      if (label.textContent !== LABEL) label.textContent = LABEL;
      return;
    }

    const textNode = state.textNode || Array.from(button.childNodes).find(
      (node) => node.nodeType === Node.TEXT_NODE && String(node.textContent || "").includes(LABEL),
    );
    if (textNode && textNode.textContent !== LABEL) textNode.textContent = LABEL;
  }

  function normalize() {
    ensureStyle();
    codexPlusButtons().forEach(normalizeButton);
  }

  function scheduleNormalize() {
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      normalize();
    });
  }

  normalize();
  observer = new MutationObserver(scheduleNormalize);
  observer.observe(document.documentElement, {
    subtree: true,
    childList: true,
    characterData: true,
  });

  window[API_KEY] = {
    version: SCRIPT_VERSION,
    normalize,
    dispose() {
      if (frame) cancelAnimationFrame(frame);
      observer?.disconnect();
      frame = 0;
      observer = null;

      document.getElementById(STYLE_ID)?.remove();

      for (const [indicator, ariaHidden] of touchedIndicators) {
        if (indicator.isConnected) restoreAttribute(indicator, "aria-hidden", ariaHidden);
      }
      touchedIndicators.clear();

      for (const [button, state] of touchedButtons) {
        if (!button.isConnected) continue;
        button.removeAttribute("data-tux-toolbar-buddy");
        button.querySelectorAll("[data-tux-toolbar-buddy-glyph]").forEach((glyph) => glyph.remove());
        restoreAttribute(button, "title", state.title);
        restoreAttribute(button, "aria-label", state.ariaLabel);
        if (state.label?.isConnected && state.labelText !== null) state.label.textContent = state.labelText;
        if (state.textNode?.isConnected && state.textText !== null) state.textNode.textContent = state.textText;
      }
      touchedButtons.clear();

      if (window[API_KEY]?.version === SCRIPT_VERSION) delete window[API_KEY];
    },
  };
})();

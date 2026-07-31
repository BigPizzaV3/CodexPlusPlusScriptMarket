(() => {
  if (window.top && window.self && window.top !== window.self) return;

  const API_KEY = "__codexPlusHideUsageAlert";
  const STYLE_ID = "codex-plus-hide-usage-alert-style";
  const HIDDEN_ATTR = "data-codex-plus-hidden-usage-alert";
  const HIDDEN_KIND_ATTR = `${HIDDEN_ATTR}-kind`;
  const HIDDEN_MARKER_SELECTOR = `[${HIDDEN_ATTR}], [${HIDDEN_KIND_ATTR}]`;
  const SCRIPT_VERSION = "0.1.4";
  const PROTECTED_SURFACE_SELECTOR = [
    "[data-codex-composer-root]",
    "[data-codex-composer]",
    "[contenteditable]",
    "textarea",
    "input",
    "form",
  ].join(",");
  const MESSAGE_CONTENT_SELECTOR = [
    "[data-message-author-role]",
    "[data-testid*='message' i]",
    "[data-test-id*='message' i]",
    "[data-thread-find-target]",
    "article",
  ].join(",");
  const CANDIDATE_SELECTOR_GROUPS = [
    "aside",
    '[role="alert"],[role="status"],[aria-live]',
    "header,section,div",
  ];

  const previous = window[API_KEY];
  if (previous && typeof previous.destroy === "function") {
    previous.destroy();
  }

  const state = {
    observer: null,
    timer: 0,
    readyHandler: null,
    pendingRoots: new Set(),
    scans: 0,
    matches: 0,
  };

  const quotaBannerRe =
    /(你的\s*Codex\s*和工作使用额度已用完|你的\s*Codex\s*消息限额已用尽|Codex\s*消息限额已用尽|message\s+limit|usage\s+limit|you['’]?re\s+out\s+of\s+Codex\s+messages|out\s+of\s+Codex\s+messages|你的\s*Codex\s*已用完|你的\s*Codex\s*消息\s*额度|你的\s*速率限制|速率限制\s*(?:将于|重置))/i;
  const quotaResetRe =
    /(额度将于|继续使用\s*Codex|升级至\s*Plus|quota\s+will\s+reset|limit\s+will\s+reset|rate\s+limit\s+resets|resets?\s+on|continue\s+using\s+Codex|start\s+your\s+free\s+trial\s+of\s+Plus|upgrade\s+to\s+plus|速率限制|将于\s*\d|重置)/i;
  const usageCardRe =
    /(剩余\s*\d+%\s*使用量|重置频率|下次重置时间|remaining\s+\d+%\s+usage|usage\s+remaining|reset\s+frequency|next\s+reset)/i;
  const actionTextRe =
    /(升级|Plus|upgrade|pricing|plan|重置|reset|限额|额度|限制|limit|quota)/i;

  function normalizeText(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function isElement(node) {
    return !!node && node.nodeType === Node.ELEMENT_NODE;
  }

  function candidateText(node) {
    if (!isElement(node)) return "";
    return normalizeText(node.textContent || node.innerText || "");
  }

  function isProtectedSurface(node) {
    return isElement(node) && (
      node.matches(PROTECTED_SURFACE_SELECTOR) ||
      !!node.querySelector(PROTECTED_SURFACE_SELECTOR)
    );
  }

  function visibleBox(node) {
    const rect = node.getBoundingClientRect();
    if (!rect || rect.width < 180 || rect.height < 16) return false;
    if (rect.bottom <= 0 || rect.top >= (window.innerHeight || 900)) return false;
    if (rect.right <= 0 || rect.left >= (window.innerWidth || 1200)) return false;
    return true;
  }

  function bannerBox(node) {
    if (!visibleBox(node)) return false;
    const rect = node.getBoundingClientRect();
    if (rect.width < 300 || rect.height < 30 || rect.height > 220) return false;
    return true;
  }

  function usageCardBox(node) {
    if (!visibleBox(node)) return false;
    const rect = node.getBoundingClientRect();
    if (rect.width < 160 || rect.width > 520) return false;
    if (rect.height < 80 || rect.height > 320) return false;
    return true;
  }

  function intersectsConversationContent(node) {
    return isElement(node) && (
      !!node.closest(MESSAGE_CONTENT_SELECTOR) ||
      !!node.querySelector(MESSAGE_CONTENT_SELECTOR)
    );
  }

  function hasAction(node, text) {
    const actions = Array.from(node.querySelectorAll("button, a, [role='button']")).slice(0, 8);
    if (!actions.length) return false;

    const actionableText = normalizeText(
      actions
        .map((item) => item.innerText || item.textContent || item.getAttribute("aria-label") || "")
        .join(" ")
    );

    return actionTextRe.test(`${text} ${actionableText}`);
  }

  function looksLikeQuotaBanner(node) {
    if (isProtectedSurface(node)) return false;
    if (intersectsConversationContent(node)) return false;
    const text = candidateText(node);
    if (text.length < 20 || text.length > 420) return false;
    if (!quotaBannerRe.test(text)) return false;
    if (!quotaResetRe.test(text)) return false;
    if (!hasAction(node, text)) return false;

    return bannerBox(node);
  }

  function looksLikeUsageCard(node) {
    if (isProtectedSurface(node)) return false;
    if (intersectsConversationContent(node)) return false;
    const text = candidateText(node);
    if (text.length < 20 || text.length > 260) return false;
    if (!usageCardRe.test(text)) return false;
    if (!/剩余\s*\d+%\s*使用量|remaining\s+\d+%\s+usage|usage\s+remaining/i.test(text)) return false;
    if (!hasAction(node, text)) return false;

    return usageCardBox(node);
  }

  function hideNode(node, kind) {
    if (!isElement(node) || node === document.body || node === document.documentElement) return false;
    if (node.getAttribute(HIDDEN_ATTR) === "true") return false;
    if (isProtectedSurface(node) || intersectsConversationContent(node)) return false;
    node.setAttribute(HIDDEN_ATTR, "true");
    node.setAttribute(HIDDEN_KIND_ATTR, kind);
    state.matches += 1;
    return true;
  }

  function clearHiddenMarkers(root) {
    const clear = (node) => {
      node.removeAttribute(HIDDEN_ATTR);
      node.removeAttribute(HIDDEN_KIND_ATTR);
    };

    if (isElement(root) && root.matches(HIDDEN_MARKER_SELECTOR)) clear(root);
    for (const node of root.querySelectorAll(HIDDEN_MARKER_SELECTOR)) clear(node);
  }

  function installStyle() {
    if (!document.documentElement) return false;
    if (document.getElementById(STYLE_ID)) return true;

    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      [${HIDDEN_ATTR}="true"] {
        display: none !important;
        visibility: hidden !important;
        pointer-events: none !important;
      }
    `;
    document.documentElement.appendChild(style);
    return true;
  }

  function collectCandidates(root) {
    if (!isElement(root)) return [];

    const candidates = [];
    const seen = new Set();
    const add = (node) => {
      if (!seen.has(node)) {
        seen.add(node);
        candidates.push(node);
      }
    };

    for (const selector of CANDIDATE_SELECTOR_GROUPS) {
      const matches = Array.from(root.querySelectorAll(selector));
      if (root.matches(selector)) matches.unshift(root);
      for (let index = matches.length - 1; index >= 0; index -= 1) add(matches[index]);
    }
    return candidates;
  }

  function classifyCandidate(node) {
    if (!isElement(node)) return false;
    if (node.closest(`[${HIDDEN_ATTR}="true"]`)) return false;
    if (node.querySelector(`[${HIDDEN_ATTR}="true"]`)) return false;

    if (looksLikeQuotaBanner(node)) return hideNode(node, "quota-banner");
    if (looksLikeUsageCard(node)) return hideNode(node, "usage-card");
    return false;
  }

  function scanSubtree(root) {
    if (!isElement(root)) return false;
    state.scans += 1;
    for (const node of collectCandidates(root)) classifyCandidate(node);
    return true;
  }

  function scan(root = document.body || document.documentElement) {
    if (!isElement(root)) return false;
    installStyle();
    return scanSubtree(root);
  }

  function isCandidate(node) {
    return isElement(node) && CANDIDATE_SELECTOR_GROUPS.some((selector) => node.matches(selector));
  }

  function isMutationBoundary(node) {
    if (!isElement(node)) return true;
    if (node === document.body || node === document.documentElement) return true;
    if (node.matches("[data-codex-composer-root]")) return true;
    return node.matches(MESSAGE_CONTENT_SELECTOR);
  }

  function markedMutationRoot(root) {
    for (let node = root; node; node = node.parentElement) {
      const boundary = isMutationBoundary(node);
      if (node.matches(HIDDEN_MARKER_SELECTOR) && (node === root || !boundary)) return node;
      if (boundary) break;
    }
    return root;
  }

  function scanMutationRoot(root) {
    if (!isElement(root) || root === document.documentElement) return;
    const scanRoot = markedMutationRoot(root);
    clearHiddenMarkers(scanRoot);
    scanSubtree(scanRoot);
    if (scanRoot === document.body || scanRoot.matches(MESSAGE_CONTENT_SELECTOR)) return;

    for (let ancestor = scanRoot.parentElement; ancestor; ancestor = ancestor.parentElement) {
      if (isMutationBoundary(ancestor)) break;
      if (isCandidate(ancestor)) classifyCandidate(ancestor);
    }
  }

  function flushPendingRoots() {
    state.timer = 0;
    const roots = new Set(state.pendingRoots);
    state.pendingRoots.clear();
    if (!roots.size) return;

    for (const root of roots) {
      if (!document.documentElement?.contains(root)) continue;
      let parent = root.parentElement;
      while (parent && !roots.has(parent)) parent = parent.parentElement;
      if (!parent) scanMutationRoot(root);
    }
  }

  function queueRoot(root) {
    if (!isElement(root) || root === document.documentElement) return;
    state.pendingRoots.add(root);
    if (!state.timer) state.timer = window.setTimeout(flushPendingRoots, 80);
  }

  function installObserver() {
    const root = document.body || document.documentElement;
    if (!isElement(root)) return false;
    if (state.observer) return true;

    state.observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === "characterData") {
          queueRoot(mutation.target?.parentElement);
          continue;
        }
        if (mutation.type !== "childList") continue;
        for (const added of mutation.addedNodes || []) {
          queueRoot(isElement(added) ? added : added.parentElement);
        }
      }
    });
    state.observer.observe(root, {
      childList: true,
      subtree: true,
      characterData: true,
    });
    return true;
  }

  function start() {
    const root = document.body || document.documentElement;
    if (!document.documentElement || !isElement(root)) return false;

    installStyle();
    scanSubtree(root);
    installObserver();
    return true;
  }

  function destroy() {
    const ownsRuntime = window[API_KEY]?.state === state;
    if (state.timer) window.clearTimeout(state.timer);
    state.timer = 0;
    state.pendingRoots.clear();
    state.observer?.disconnect();
    state.observer = null;
    if (state.readyHandler) {
      document.removeEventListener("DOMContentLoaded", state.readyHandler);
      state.readyHandler = null;
    }
    if (!ownsRuntime) return;
    clearHiddenMarkers(document);
    document.getElementById(STYLE_ID)?.remove();
    if (window[API_KEY]?.version === SCRIPT_VERSION) {
      delete window[API_KEY];
    }
  }

  window[API_KEY] = {
    version: SCRIPT_VERSION,
    state,
    scan,
    destroy,
  };

  if (!start()) {
    state.readyHandler = () => {
      const handler = state.readyHandler;
      state.readyHandler = null;
      if (handler) document.removeEventListener("DOMContentLoaded", handler);
      start();
    };
    document.addEventListener("DOMContentLoaded", state.readyHandler, { once: true });
  }
})();

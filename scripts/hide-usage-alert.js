(() => {
  const API_KEY = "__codexPlusHideUsageAlert";
  const STYLE_ID = "codex-plus-hide-usage-alert-style";
  const HIDDEN_ATTR = "data-codex-plus-hidden-usage-alert";
  const SCRIPT_VERSION = "0.1.2";

  const previous = window[API_KEY];
  if (previous && typeof previous.destroy === "function") {
    previous.destroy();
  }

  const state = {
    observer: null,
    timer: 0,
    hidden: new Set(),
    scans: 0,
    matches: 0,
  };

  const quotaBannerRe =
    /(你的\s*Codex\s*消息限额已用尽|Codex\s*消息限额已用尽|message\s+limit|usage\s+limit|you['’]?re\s+out\s+of\s+Codex\s+messages|out\s+of\s+Codex\s+messages|你的\s*Codex\s*已用完|你的\s*Codex\s*消息\s*额度|你的\s*速率限制|速率限制\s*(?:将于|重置))/i;
  const quotaResetRe =
    /(额度将于|继续使用\s*Codex|升级至\s*Plus|quota\s+will\s+reset|limit\s+will\s+reset|rate\s+limit\s+resets|resets?\s+on|continue\s+using\s+Codex|start\s+your\s+free\s+trial\s+of\s+Plus|upgrade\s+to\s+plus|速率限制|将于\s*\d|重置)/i;
  const usageCardRe =
    /(剩余\s*\d+%\s*使用量|重置频率|下次重置时间|remaining\s+\d+%\s+usage|usage\s+remaining|reset\s+frequency|next\s+reset)/i;
  const actionTextRe =
    /(升级|Plus|upgrade|pricing|plan|重置|reset|限额|limit|quota)/i;

  function normalizeText(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function candidateText(node) {
    if (!node || node.nodeType !== Node.ELEMENT_NODE) return "";
    return normalizeText(node.innerText || node.textContent || "");
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
    if (rect.width < 300 || rect.height < 30 || rect.height > 120) return false;
    return true;
  }

  function usageCardBox(node) {
    if (!visibleBox(node)) return false;
    const rect = node.getBoundingClientRect();
    if (rect.width < 160 || rect.width > 520) return false;
    if (rect.height < 80 || rect.height > 320) return false;
    return true;
  }

  function insideConversationContent(node) {
    return !!node.closest(
      [
        "[data-message-author-role]",
        "[data-testid*='message' i]",
        "[data-test-id*='message' i]",
        "[data-thread-find-target]",
        "article",
      ].join(",")
    );
  }

  function hasAction(node, text) {
    const actionableText = normalizeText(
      Array.from(node.querySelectorAll("button, a, [role='button']"))
        .slice(0, 8)
        .map((item) => item.innerText || item.textContent || item.getAttribute("aria-label") || "")
        .join(" ")
    );

    return actionTextRe.test(`${text} ${actionableText}`);
  }

  function looksLikeQuotaBanner(node) {
    if (insideConversationContent(node)) return false;
    if (!bannerBox(node)) return false;
    const text = candidateText(node);
    if (text.length < 20 || text.length > 420) return false;
    if (!quotaBannerRe.test(text)) return false;
    if (!quotaResetRe.test(text)) return false;

    return hasAction(node, text);
  }

  function looksLikeUsageCard(node) {
    if (insideConversationContent(node)) return false;
    if (!usageCardBox(node)) return false;
    const text = candidateText(node);
    if (text.length < 20 || text.length > 260) return false;
    if (!usageCardRe.test(text)) return false;
    if (!/剩余\s*\d+%\s*使用量|remaining\s+\d+%\s+usage|usage\s+remaining/i.test(text)) return false;

    return hasAction(node, text);
  }

  function quotaBannerRoot(node) {
    const parent = node.parentElement;
    if (!parent || parent === document.body) return node;

    const text = candidateText(parent);
    if (text.length <= 420 && quotaBannerRe.test(text) && quotaResetRe.test(text) && bannerBox(parent)) {
      return parent;
    }

    return node;
  }

  function usageCardRoot(node) {
    if (node.getAttribute("role") === "status" && looksLikeUsageCard(node)) return node;

    const status = node.closest('[role="status"]');
    if (status && looksLikeUsageCard(status)) return status;

    const childStatus = node.querySelector('[role="status"]');
    if (childStatus && looksLikeUsageCard(childStatus)) return childStatus;

    return node;
  }

  function hideNode(node, kind) {
    const root = kind === "usage-card" ? usageCardRoot(node) : quotaBannerRoot(node);
    if (!root || root === document.body || root === document.documentElement) return;
    root.setAttribute(HIDDEN_ATTR, "true");
    root.setAttribute(`${HIDDEN_ATTR}-kind`, kind);
    state.hidden.add(root);
    state.matches += 1;
  }

  function installStyle() {
    if (document.getElementById(STYLE_ID)) return;

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
  }

  function scan() {
    state.timer = 0;
    state.scans += 1;
    installStyle();

    const root = document.body || document.documentElement;
    if (!root) return;

    const selectors = [
      '[role="alert"]',
      '[role="status"]',
      '[aria-live]',
      "header",
      "section",
      "aside",
      "div",
    ].join(",");

    for (const node of root.querySelectorAll(selectors)) {
      if (node.getAttribute(HIDDEN_ATTR) === "true") continue;
      if (looksLikeQuotaBanner(node)) {
        hideNode(node, "quota-banner");
        continue;
      }
      if (looksLikeUsageCard(node)) hideNode(node, "usage-card");
    }
  }

  function scheduleScan(delay = 80) {
    if (state.timer) return;
    state.timer = window.setTimeout(scan, delay);
  }

  function installObserver() {
    const root = document.body || document.documentElement;
    if (!root) return false;

    state.observer = new MutationObserver((mutations) => {
      if (!mutations.some((mutation) => mutation.addedNodes.length || mutation.type === "characterData")) return;
      scheduleScan();
    });
    state.observer.observe(root, {
      childList: true,
      subtree: true,
      characterData: true,
    });
    return true;
  }

  function destroy() {
    if (state.timer) window.clearTimeout(state.timer);
    state.timer = 0;
    state.observer?.disconnect();
    state.observer = null;
    for (const node of state.hidden) {
      node.removeAttribute(HIDDEN_ATTR);
    }
    state.hidden.clear();
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

  installStyle();
  if (!installObserver()) {
    document.addEventListener("DOMContentLoaded", () => {
      installObserver();
      scheduleScan(0);
    }, { once: true });
  }
  scheduleScan(0);
})();

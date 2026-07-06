/* @codex-plus-script
name: CodexRadar IQ Badge
description: Show CodexRadar daily IQ values beside reasoning levels.
version: 0.1.0
author: 38yuanzhao
*/
(() => {
  const INSTALL_KEY = "__codexRadarIqBadgeInstalled";
  const STYLE_ID = "codexradar-iq-badge-style";
  const CACHE_KEY = "codexradar.iqBadge.cache";
  const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
  const REFRESH_WINDOW_TTL_MS = 2 * 60 * 1000;
  const STALE_TTL_MS = 24 * 60 * 60 * 1000;
  const RADAR_URLS = [
    "https://codexradar.com/",
    "https://r.jina.ai/http://r.jina.ai/http://https://codexradar.com/",
  ];

  window.__codexRadarIqBadgeObserver?.disconnect?.();
  if (window.__codexRadarIqBadgeTimer) clearInterval(window.__codexRadarIqBadgeTimer);
  window.__codexRadarIqBadgeQueued = false;
  window[INSTALL_KEY] = true;

  let dataPromise = null;
  let latestData = readCachedData(false);
  let dataLoadedAt = latestData ? Date.now() : 0;
  let lastFetchAt = 0;

  const levelAliases = [
    { key: "xhigh", re: /^(超高|x-?high)$/i },
    { key: "high", re: /^(高|high)$/i },
    { key: "medium", re: /^(中|medium)$/i },
    { key: "low", re: /^(低|low)$/i },
  ];

  function installStyle() {
    const existing = document.getElementById(STYLE_ID);
    if (existing) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      .codexradar-iq-badge {
        margin-left: 8px;
        color: var(--text-secondary, var(--token-text-tertiary, #8e8ea0));
        font: 12px/1 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
        font-variant-numeric: tabular-nums;
        opacity: .9;
        white-space: nowrap;
        pointer-events: none;
      }
    `;
    document.documentElement.appendChild(style);
  }

  function readCachedData(allowStale) {
    try {
      const cached = JSON.parse(localStorage.getItem(CACHE_KEY) || "null");
      if (!cached || !cached.data || !Number.isFinite(cached.fetchedAt)) return null;
    const maxAge = allowStale ? STALE_TTL_MS : cacheTtlMs();
    return Date.now() - cached.fetchedAt <= maxAge ? cached.data : null;
    } catch (_) {
      return null;
    }
  }

  function writeCachedData(data) {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify({ fetchedAt: Date.now(), data }));
    } catch (_) {}
  }

  function getRadarData() {
    const now = Date.now();
    const ttl = cacheTtlMs();
    if (latestData && now - dataLoadedAt <= ttl) return Promise.resolve(latestData);
    if (dataPromise) return dataPromise;
    if (lastFetchAt && now - lastFetchAt <= ttl) return Promise.resolve(latestData || readCachedData(true));
    lastFetchAt = now;
    dataPromise = fetchBridgeData()
      .catch(() => fetchRadarText().then(parseRadarHtml))
      .then((data) => {
        if (!data || !Object.keys(data.models || {}).length) throw new Error("no iq data");
        latestData = data;
        dataLoadedAt = Date.now();
        writeCachedData(data);
        return data;
      })
      .catch(() => {
        latestData = readCachedData(true);
        dataLoadedAt = latestData ? Date.now() : 0;
        return latestData;
      })
      .finally(() => {
        dataPromise = null;
      });
    return dataPromise;
  }

  function cacheTtlMs() {
    const hour = new Date().getHours();
    return (hour >= 7 && hour < 8) || (hour >= 13 && hour < 14) ? REFRESH_WINDOW_TTL_MS : CACHE_TTL_MS;
  }

  function fetchBridgeData() {
    if (!window.__codexSessionDeleteBridge) return Promise.reject(new Error("no bridge"));
    return window.__codexSessionDeleteBridge("/codexradar/iq", {}).then((data) => {
      if (!data || data.status !== "ok" || !data.models) throw new Error("no bridge data");
      return data;
    });
  }

  function fetchRadarText(index = 0) {
    return fetch(RADAR_URLS[index], { cache: "no-store" })
      .then((response) => (response.ok ? response.text() : Promise.reject(new Error("bad status"))))
      .catch((error) => {
        if (index + 1 < RADAR_URLS.length) return fetchRadarText(index + 1);
        throw error;
      });
  }

  function parseRadarHtml(html) {
    const doc = new DOMParser().parseFromString(html, "text/html");
    const text = (doc.body?.innerText || doc.body?.textContent || "").replace(/\r/g, "\n");
    const radarStart = text.search(/降智雷达|IQ\s*曲线/i);
    const source = radarStart >= 0 ? text.slice(radarStart) : text;
    const updatedMatch = /降智雷达\s*([^\n]*?更新)/.exec(source);
    const models = {};
    const pattern = /\b(GPT-\d+(?:\.\d+)?)(?:[-\s]+)(xhigh|high|medium|low)\b[\s\S]{0,80}?\*{0,2}(\d+(?:\.\d+)?)\*{0,2}(?=\s*\$)/gi;
    let match;
    while ((match = pattern.exec(source))) {
      const family = match[1].toUpperCase();
      const level = match[2].toLowerCase();
      const iq = Number(match[3]);
      if (!Number.isFinite(iq)) continue;
      models[family] = models[family] || {};
      models[family][level] = iq;
    }
    return {
      updated_label: updatedMatch ? updatedMatch[1].trim() : "",
      models,
    };
  }

  function isVisible(element) {
    return element instanceof Element && (element.offsetParent !== null || element.getClientRects().length > 0);
  }

  function cleanLabel(element) {
    const clone = element.cloneNode(true);
    clone.querySelectorAll?.(".codexradar-iq-badge").forEach((node) => node.remove());
    return (clone.textContent || "").replace(/\s+/g, " ").trim();
  }

  function levelKeyFor(element) {
    const text = cleanLabel(element);
    const shortText = text.replace(/\bIQ\s*\d+(?:\.\d+)?\b/gi, "").trim();
    const found = levelAliases.find((item) => item.re.test(shortText));
    return found ? found.key : null;
  }

  function closestMenu(element) {
    return (
      element.closest('[role="menu"], [role="listbox"], [data-radix-menu-content], [cmdk-list], [data-testid*="menu" i]') ||
      element.parentElement
    );
  }

  function reasoningMenuRoot() {
    const roots = Array.from(
      document.querySelectorAll('[role="menu"], [role="listbox"], [data-radix-menu-content], [data-radix-popper-content-wrapper], div'),
    )
      .filter(isVisible)
      .filter((element) => {
        const text = (element.innerText || element.textContent || "").replace(/\s+/g, " ").trim();
        if (!/推理/.test(text) || !/低/.test(text) || !/中/.test(text) || !/高/.test(text) || !/超高/.test(text)) return false;
        const rect = element.getBoundingClientRect();
        return rect.width > 120 && rect.width < 520 && rect.height > 120 && rect.height < 620;
      })
      .sort((a, b) => {
        const ar = a.getBoundingClientRect();
        const br = b.getBoundingClientRect();
        return ar.width * ar.height - br.width * br.height;
      });
    return roots[0] || null;
  }

  function findReasoningItems() {
    const root = reasoningMenuRoot();
    const scope = root || document;
    const entries = Array.from(
      scope.querySelectorAll('button, [role^="menuitem"], [role="option"], [cmdk-item], [data-radix-collection-item], div, span'),
    )
      .filter(isVisible)
      .map((element) => ({ element, key: levelKeyFor(element), menu: closestMenu(element) }))
      .filter((entry) => entry.key && entry.menu)
      .filter((entry) => !Array.from(entry.element.children).some((child) => levelKeyFor(child) === entry.key));

    if (root) return entries;
    const byMenu = new Map();
    for (const entry of entries) {
      const group = byMenu.get(entry.menu) || [];
      group.push(entry);
      byMenu.set(entry.menu, group);
    }

    for (const group of byMenu.values()) {
      if (new Set(group.map((entry) => entry.key)).size >= 3) return group;
    }
    return [];
  }

  function readModelFamily(scope) {
    const text = [scope?.textContent || "", document.body?.textContent || ""].join("\n");
    const match = /\bGPT-\d+(?:\.\d+)?\b/i.exec(text);
    return match ? match[0].toUpperCase() : "GPT-5.5";
  }

  function pickModelData(data, family) {
    const models = data?.models || {};
    return models[family] || models["GPT-5.5"] || Object.values(models)[0] || null;
  }

  function setBadge(element, iq, data) {
    let badge = element.querySelector(":scope > .codexradar-iq-badge");
    if (!badge) {
      badge = document.createElement("span");
      badge.className = "codexradar-iq-badge";
      const check = Array.from(element.children).find(
        (child) => child.tagName === "SVG" || child.getAttribute("aria-hidden") === "true",
      );
      if (check) element.insertBefore(badge, check);
      else element.appendChild(badge);
    }
    badge.textContent = `IQ ${Number(iq).toFixed(Number.isInteger(iq) ? 0 : 1)}`;
    badge.title = data?.updated_label ? `CodexRadar ${data.updated_label}` : "CodexRadar";
  }

  function updateMenu(data) {
    if (!data) return;
    const entries = findReasoningItems();
    if (!entries.length) return;
    const family = readModelFamily(entries[0].menu);
    const modelData = pickModelData(data, family);
    if (!modelData) return;
    for (const { element, key } of entries) {
      if (Number.isFinite(modelData[key])) setBadge(element, modelData[key], data);
    }
  }

  function schedule() {
    if (window.__codexRadarIqBadgeQueued) return;
    window.__codexRadarIqBadgeQueued = true;
    setTimeout(() => {
      window.__codexRadarIqBadgeQueued = false;
      installStyle();
      if (latestData) updateMenu(latestData);
      getRadarData().then(updateMenu);
    }, 0);
  }

  schedule();
  window.__codexRadarIqBadgeObserver?.disconnect?.();
  window.__codexRadarIqBadgeObserver = new MutationObserver(schedule);
  window.__codexRadarIqBadgeObserver.observe(document.documentElement, { childList: true, subtree: true });
  window.__codexRadarIqBadgeTimer = setInterval(schedule, 1000);
})();

(() => {
  const TARGET = 500;
  const SCRIPT_KEY = "__codexListPagebuster";
  const STORAGE_KEY = "__codexListPagebusterThreads";
  const PROJECT_LIST_SELECTOR = "[data-app-action-sidebar-project-list-id]";
  const THREAD_SELECTOR = "[data-app-action-sidebar-thread-id]";
  const SUPPLEMENT_SELECTOR = "[data-clpb-history-section]";
  const MANAGED_ROW_SELECTOR = "[data-clpb-managed-row]";
  const PROJECT_SUPPLEMENT_ITEM_SELECTOR = "[data-clpb-project-supplemental-item]";
  const EXPAND_TEXT = /^(?:\u5c55\u5f00\u663e\u793a|\u663e\u793a\u66f4\u591a|Show more|Show all)$/i;
  const KEYWORDS = /(?:thread|threads|session|sessions|history|recent|conversation|project)/i;
  const LIMIT_KEYS = ["limit", "pageSize", "page_size", "first", "take", "perPage", "per_page", "count", "max", "size", "n"];
  const MAX_EXTRA_HISTORY_ROWS = 100;
  const INTERNAL_ACTION_RETRY_MS = 120000;
  const ARCHIVED_IDS_KEY = "__codexListPagebusterArchivedIds";
  const HIDDEN_IDS_KEY = "__codexListPagebusterHiddenIds";
  const COLLAPSED_PROJECTS_KEY = "__codexListPagebusterCollapsedProjects";
  const SIGNALS_MODULE_RE = /(?:\.\/)?assets\/app-server-manager-signals-[A-Za-z0-9_-]+\.js/g;
  const SIGNALS_MODULE_FALLBACKS = [
    "./assets/app-server-manager-signals-Csopz8aM.js",
    "./assets/app-server-manager-signals-zAr_ejg8.js"
  ];

  if (window[SCRIPT_KEY]?.stop) {
    window[SCRIPT_KEY].stop();
  }

  const state = {
    observer: null,
    timers: new Set(),
    clicked: new WeakSet(),
    scheduled: false,
    renderingSupplement: false,
    autoExpandEnabled: true,
    programmaticExpand: false,
    projectClickListener: null,
    userCollapsedProjectRoots: new Set(),
    autoExpandDeadlineMs: Date.now() + 8000,
    lastProjectRoots: new Set(),
    fetchPatched: false,
    xhrPatched: false,
    supplementIds: "",
    promoteInFlight: false,
    promotedKey: "",
    nextPromoteAt: 0,
    keeperStopped: false,
    internalActionModulePromise: null,
    internalActionUnavailableUntil: 0,
    internalActionStatus: "unknown",
    lastInternalActionError: "",
    snapshotRefreshInFlight: false,
    lastSnapshotRefreshAt: 0,
    lastSnapshotRefreshError: "",
    logOnceKeys: new Set(),
    originalFetch: window.fetch,
    originalXhrOpen: XMLHttpRequest.prototype.open,
    originalXhrSend: XMLHttpRequest.prototype.send
  };

  function log(...args) {
    try {
      console.info("[clpb]", ...args);
    } catch {}
  }

  function logOnce(key, ...args) {
    if (state.logOnceKeys.has(key)) return;
    state.logOnceKeys.add(key);
    log(...args);
  }

  function setManagedTimeout(fn, ms) {
    const timer = window.setTimeout(() => {
      state.timers.delete(timer);
      fn();
    }, ms);
    state.timers.add(timer);
  }

  function rewriteUrl(raw) {
    try {
      const url = new URL(raw, window.location.href);
      let changed = false;
      for (const key of LIMIT_KEYS) {
        if (!url.searchParams.has(key)) continue;
        const value = Number.parseInt(url.searchParams.get(key) || "", 10);
        if (Number.isFinite(value) && value > 0 && value <= 50) {
          url.searchParams.set(key, String(TARGET));
          changed = true;
        }
      }
      return changed ? url.toString() : raw;
    } catch {
      return raw;
    }
  }

  function rewriteBody(body) {
    if (typeof body !== "string" || !body) return body;
    let next = body;
    for (const key of LIMIT_KEYS) {
      const re = new RegExp(`(["']?${key}["']?\\s*[:=]\\s*)(\\d+)`, "gi");
      next = next.replace(re, (match, prefix, value) => {
        const n = Number.parseInt(value, 10);
        return Number.isFinite(n) && n > 0 && n <= 50 ? `${prefix}${TARGET}` : match;
      });
    }
    return next;
  }

  function patchRequests() {
    if (!state.fetchPatched && typeof window.fetch === "function") {
      const originalFetch = state.originalFetch.bind(window);
      window.fetch = function patchedFetch(input, init) {
        try {
          const url = typeof input === "string" ? input : input?.url;
          if (typeof url === "string" && KEYWORDS.test(url)) {
            const next = rewriteUrl(url);
            if (next !== url) log("fetch url", url, "->", next);
            if (typeof input === "string") {
              input = next;
            } else if (input instanceof Request && next !== url) {
              input = new Request(next, input);
            }
            if (init && typeof init.body === "string") {
              const nextBody = rewriteBody(init.body);
              if (nextBody !== init.body) log("fetch body patched");
              init = { ...init, body: nextBody };
            }
          }
        } catch (error) {
          log("fetch patch error", String(error));
        }
        return originalFetch(input, init);
      };
      state.fetchPatched = true;
    }

    if (!state.xhrPatched) {
      XMLHttpRequest.prototype.open = function patchedOpen(method, url, ...rest) {
        const next = KEYWORDS.test(String(url)) ? rewriteUrl(String(url)) : url;
        if (next !== url) log("xhr url", url, "->", next);
        return state.originalXhrOpen.call(this, method, next, ...rest);
      };
      XMLHttpRequest.prototype.send = function patchedSend(body) {
        try {
          if (typeof body === "string") {
            const nextBody = rewriteBody(body);
            if (nextBody !== body) log("xhr body patched");
            body = nextBody;
          }
        } catch (error) {
          log("xhr patch error", String(error));
        }
        return state.originalXhrSend.call(this, body);
      };
      state.xhrPatched = true;
    }
  }

  function isExpandButton(button) {
    if (!(button instanceof HTMLButtonElement)) return false;
    if (button.disabled || state.clicked.has(button)) return false;
    return EXPAND_TEXT.test((button.textContent || "").trim());
  }

  function readSnapshotThreads() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const threads = raw ? JSON.parse(raw) : [];
      const archivedIds = readArchivedIds();
      const hiddenIds = readHiddenIds();
      return Array.isArray(threads)
        ? threads.filter((thread) => {
            if (!thread || typeof thread.id !== "string") return false;
            if (archivedIds.has(threadRawId(thread))) return false;
            if (hiddenIds.has(threadRawId(thread))) return false;
            const title = String(thread.title || "").trim();
            const cwd = normalizeCwd(thread.cwd);
            return Boolean(title || cwd);
          })
        : [];
    } catch (error) {
      log("snapshot read failed", String(error));
      return [];
    }
  }

  function readIdSet(key) {
    try {
      const raw = localStorage.getItem(key);
      const ids = raw ? JSON.parse(raw) : [];
      return new Set(Array.isArray(ids) ? ids.map(threadRawId).filter(Boolean) : []);
    } catch {
      return new Set();
    }
  }

  function writeIdSet(key, ids, label) {
    try {
      localStorage.setItem(key, JSON.stringify(Array.from(ids)));
    } catch (error) {
      log(`${label} ids write failed`, String(error));
    }
  }

  function readArchivedIds() {
    return readIdSet(ARCHIVED_IDS_KEY);
  }

  function writeArchivedIds(ids) {
    writeIdSet(ARCHIVED_IDS_KEY, ids, "archived");
  }

  function readHiddenIds() {
    return readIdSet(HIDDEN_IDS_KEY);
  }

  function writeHiddenIds(ids) {
    writeIdSet(HIDDEN_IDS_KEY, ids, "hidden");
  }

  function readCollapsedProjectRoots() {
    try {
      const raw = localStorage.getItem(COLLAPSED_PROJECTS_KEY);
      const roots = raw ? JSON.parse(raw) : [];
      return new Set(Array.isArray(roots) ? roots.map(normalizePathForCompare).filter(Boolean) : []);
    } catch {
      return new Set();
    }
  }

  function writeCollapsedProjectRoots(roots) {
    try {
      localStorage.setItem(COLLAPSED_PROJECTS_KEY, JSON.stringify(Array.from(roots)));
    } catch (error) {
      log("collapsed projects write failed", String(error));
    }
  }

  function threadRawId(threadOrId) {
    const id = typeof threadOrId === "string" ? threadOrId : threadOrId?.id;
    return String(id || "").replace(/^local:/, "");
  }

  function threadDomId(threadOrId) {
    return `local:${threadRawId(threadOrId)}`;
  }

  function normalizeCwd(cwd) {
    return String(cwd || "")
      .replace(/^\\\\\?\\/, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function normalizePathForCompare(path) {
    return normalizeCwd(path)
      .replace(/[\\/]+$/g, "")
      .replaceAll("\\", "/")
      .toLowerCase();
  }

  function basename(path) {
    const normalized = normalizeCwd(path);
    return normalized.split(/[\\/]/).filter(Boolean).pop() || normalized || "unknown";
  }

  function rememberProjectRoots(roots) {
    const next = new Set(state.lastProjectRoots);
    for (const root of roots) {
      if (root) next.add(root);
    }
    state.lastProjectRoots = next;
    return next;
  }

  function collectSnapshotProjectRoots() {
    return new Set(
      readSnapshotThreads()
        .map((thread) => normalizePathForCompare(thread.cwd))
        .filter(Boolean)
    );
  }

  function writeSnapshotThreads(threads) {
    try {
      const archivedIds = readArchivedIds();
      const hiddenIds = readHiddenIds();
      const activeThreads = threads.filter((thread) => {
        const rawId = threadRawId(thread);
        return !archivedIds.has(rawId) && !hiddenIds.has(rawId);
      });
      localStorage.setItem(STORAGE_KEY, JSON.stringify(activeThreads));
    } catch (error) {
      log("snapshot write failed", String(error));
    }
  }

  function pruneSnapshotThreads(idsToRemove) {
    const removeSet = new Set(Array.from(idsToRemove).map(threadRawId).filter(Boolean));
    if (removeSet.size === 0) return 0;
    const threads = readSnapshotThreads();
    const next = threads.filter((thread) => !removeSet.has(threadRawId(thread)));
    if (next.length === threads.length) return 0;
    writeSnapshotThreads(next);
    state.supplementIds = "";
    return threads.length - next.length;
  }

  function rememberArchivedIds(ids) {
    const archivedIds = readArchivedIds();
    let changed = false;
    for (const id of ids) {
      const rawId = threadRawId(id);
      if (!rawId || archivedIds.has(rawId)) continue;
      archivedIds.add(rawId);
      changed = true;
    }
    if (changed) writeArchivedIds(archivedIds);
    return archivedIds;
  }

  function rememberHiddenIds(ids) {
    const hiddenIds = readHiddenIds();
    let changed = false;
    for (const id of ids) {
      const rawId = threadRawId(id);
      if (!rawId || hiddenIds.has(rawId)) continue;
      hiddenIds.add(rawId);
      changed = true;
    }
    if (changed) writeHiddenIds(hiddenIds);
    return hiddenIds;
  }

  function collectSidebarProjectBasenames() {
    const basenames = new Set();
    const add = (value) => {
      const normalized = normalizePathForCompare(value);
      if (!normalized) return;
      const base = normalized.split("/").filter(Boolean).pop() || normalized;
      if (base) basenames.add(base);
    };
    for (const row of document.querySelectorAll("[data-app-action-sidebar-project-id]")) {
      add(row.getAttribute("data-app-action-sidebar-project-id"));
    }
    for (const projectList of document.querySelectorAll(PROJECT_LIST_SELECTOR)) {
      add(projectList.getAttribute("data-app-action-sidebar-project-list-id"));
    }
    return basenames;
  }

  function collectVisibleProjectRoots() {
    const roots = new Set();
    const addRoot = (value) => {
      const root = normalizePathForCompare(value);
      if (root) roots.add(root);
    };

    for (const projectList of document.querySelectorAll(PROJECT_LIST_SELECTOR)) {
      addRoot(projectList.getAttribute("data-app-action-sidebar-project-list-id"));
    }

    const projectIdValues = [];
    for (const row of document.querySelectorAll("[data-app-action-sidebar-project-id]")) {
      const value = row.getAttribute("data-app-action-sidebar-project-id");
      const normalized = normalizePathForCompare(value);
      if (normalized) {
        addRoot(normalized);
        projectIdValues.push(normalized);
      }
    }

    const shortNames = projectIdValues.filter((id) => !/[/:]/.test(id));
    if (shortNames.length > 0) {
      const shortNameSet = new Set(shortNames);
      for (const thread of readSnapshotThreads()) {
        const cwd = normalizePathForCompare(thread.cwd);
        if (!cwd) continue;
        const base = cwd.split("/").filter(Boolean).pop() || "";
        if (base && shortNameSet.has(base)) {
          addRoot(cwd);
        }
      }
    }

    if (roots.size > 0) {
      return rememberProjectRoots(roots);
    }
    if (state.lastProjectRoots.size > 0) {
      return state.lastProjectRoots;
    }
    const snapshotRoots = collectSnapshotProjectRoots();
    if (snapshotRoots.size > 0 && document.querySelector(PROJECT_LIST_SELECTOR)) {
      return rememberProjectRoots(snapshotRoots);
    }
    return snapshotRoots;
  }

  function collectCollapsedProjectRoots() {
    const roots = new Set();
    for (const row of document.querySelectorAll("[data-app-action-sidebar-project-id]")) {
      const collapsed =
        row.getAttribute("data-app-action-sidebar-project-collapsed") === "true" ||
        row.getAttribute("aria-expanded") === "false";
      if (!collapsed) continue;
      const root = normalizePathForCompare(row.getAttribute("data-app-action-sidebar-project-id"));
      if (root) roots.add(root);
    }
    return roots;
  }

  function threadHasVisibleProject(thread, projectRoots) {
    const cwd = normalizePathForCompare(thread?.cwd);
    if (!cwd) return false;
    for (const root of projectRoots) {
      if (!root) continue;
      if (cwd === root || cwd.startsWith(`${root}/`) || cwd.startsWith(`${root}\\`)) {
        return true;
      }
    }
    return false;
  }

  function threadBelongsToAnyProject(thread, projectRoots) {
    const cwd = normalizePathForCompare(thread?.cwd);
    if (!cwd) return false;
    for (const root of projectRoots) {
      if (!root) continue;
      if (cwd === root || cwd.startsWith(`${root}/`) || root.startsWith(`${cwd}/`)) {
        return true;
      }
    }
    return false;
  }

  function isThreadHiddenByCollapsedProject(thread, collapsedRoots) {
    const roots = collapsedRoots || collectCollapsedProjectRoots();
    return threadBelongsToAnyProject(thread, roots);
  }

  function collectMissingNativeThreads(collapsedRoots) {
    const roots = collapsedRoots || collectCollapsedProjectRoots();
    const nativeIds = collectNativeThreadIds();
    return readSnapshotThreads().filter((thread) => {
      if (nativeIds.has(threadDomId(thread))) return false;
      return !isThreadHiddenByCollapsedProject(thread, roots);
    });
  }

  function collectNativeThreadIds() {
    return new Set(
      Array.from(document.querySelectorAll(THREAD_SELECTOR))
        .filter((row) => !row.closest(SUPPLEMENT_SELECTOR) && !row.closest(MANAGED_ROW_SELECTOR))
        .map((row) => row.getAttribute("data-app-action-sidebar-thread-id"))
        .filter(Boolean)
    );
  }

  function callAppAction(action, timeoutMs = 12000) {
    return new Promise((resolve, reject) => {
      const requestId = `clpb-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const timeout = window.setTimeout(() => {
        window.removeEventListener("message", onMessage);
        reject(new Error(`Codex app action timed out: ${action.type}`));
      }, timeoutMs);

      function onMessage(event) {
        const data = event.data;
        if (!data || data.type !== "debug-run-app-action-response" || data.requestId !== requestId) return;
        window.clearTimeout(timeout);
        window.removeEventListener("message", onMessage);
        if (data.ok) {
          resolve(data.result);
        } else {
          reject(new Error(data.errorMessage || `Codex app action failed: ${action.type}`));
        }
      }

      window.addEventListener("message", onMessage);
      const message = { type: "debug-run-app-action-request", requestId, action };
      const bridge = window.electronBridge;
      if (bridge?.sendMessageFromView) {
        bridge.sendMessageFromView(message).catch((error) => {
          window.clearTimeout(timeout);
          window.removeEventListener("message", onMessage);
          reject(error);
        });
      } else {
        window.postMessage(message, "*");
      }
    });
  }

  async function callInternalAction(type, payload) {
    const sendRequest = await loadInternalActionModule();
    return sendRequest(type, payload);
  }

  function isHighLevelConversationHelper(source) {
    return /beforeSendRequest|inheritThreadSettings|turnStartParams|thread-follower-start-turn|getStreamRole|workspaceRoots/.test(source);
  }

  function scoreInternalRequestHelper(key, value, source) {
    if (!/sendRequest/.test(source)) return 0;
    if (isHighLevelConversationHelper(source)) return 0;

    let score = 0;
    if (value.length > 0 && value.length <= 2) score += 20;
    if (/return\s+[$\w]+\.sendRequest\s*\(\s*[$\w]+\s*,\s*[$\w]+\s*\)/.test(source)) score += 100;
    if (/function\s+[$\w]+\s*\(\s*[$\w]+\s*,\s*[$\w]+\s*\)\s*\{\s*return\s+[$\w]+\.sendRequest/.test(source)) score += 50;
    if (/sendRequest\s*=\s*\(\s*[$\w]+\s*,\s*[$\w]+\s*\)\s*=>/.test(source)) score += 40;
    if (/\bdebug-run-app-action-request\b/.test(source)) score += 30;
    if (/\bsendRequest\s*\(\s*[$\w]+\s*,\s*[$\w]+\s*\)/.test(source)) score += 10;
    if (["ts", "It", "ln"].includes(key)) score += 5;
    return score;
  }

  function findInternalRequestHelper(mod) {
    const candidates = [];
    for (const key of Object.keys(mod || {})) {
      const value = mod[key];
      if (typeof value !== "function") continue;
      let source = "";
      try {
        source = Function.prototype.toString.call(value);
      } catch {
        continue;
      }
      const score = scoreInternalRequestHelper(key, value, source);
      if (score > 0) candidates.push({ key, fn: value, score });
    }
    candidates.sort((a, b) => b.score - a.score);
    return candidates[0] || null;
  }

  function normalizeSignalsModulePath(path) {
    if (!path) return "";
    if (/^https?:|^app:|^file:/i.test(path)) return path;
    const relative = path.replace(/^\.\//, "");
    return relative.startsWith("assets/") ? `./${relative}` : "";
  }

  function collectSignalsModuleCandidatesFromText(text) {
    const candidates = [];
    if (typeof text !== "string" || !text) return candidates;
    for (const match of text.matchAll(SIGNALS_MODULE_RE)) {
      const candidate = normalizeSignalsModulePath(match[0]);
      if (candidate) candidates.push(candidate);
    }
    return candidates;
  }

  function collectSignalsModuleCandidatesFromRuntime() {
    const candidates = new Set(SIGNALS_MODULE_FALLBACKS);
    const add = (value) => {
      const candidate = normalizeSignalsModulePath(value);
      if (candidate) candidates.add(candidate);
    };

    collectSignalsModuleCandidatesFromText(document.documentElement?.outerHTML || "").forEach(add);

    for (const script of document.querySelectorAll("script[src]")) {
      add(script.getAttribute("src") || "");
    }

    try {
      for (const entry of performance.getEntriesByType("resource")) {
        const name = String(entry.name || "");
        if (name.includes("app-server-manager-signals-")) add(name);
      }
    } catch {}

    return Array.from(candidates);
  }

  async function discoverSignalsModuleCandidates() {
    const candidates = new Set(collectSignalsModuleCandidatesFromRuntime());
    const scriptsToScan = new Set(
      Array.from(document.querySelectorAll("script[src]"))
        .map((script) => script.getAttribute("src"))
        .filter(Boolean)
    );

    try {
      for (const entry of performance.getEntriesByType("resource")) {
        const name = String(entry.name || "");
        if (/\.js(?:$|\?)/.test(name)) scriptsToScan.add(name);
      }
    } catch {}

    for (const scriptUrl of scriptsToScan) {
      try {
        const response = await fetch(scriptUrl);
        if (!response.ok) continue;
        collectSignalsModuleCandidatesFromText(await response.text()).forEach((candidate) => {
          candidates.add(candidate);
        });
      } catch {}
    }

    return Array.from(candidates);
  }

  async function loadInternalActionModule() {
    if (Date.now() < state.internalActionUnavailableUntil) {
      throw new Error(state.lastInternalActionError || "Codex internal request helper is temporarily unavailable");
    }
    if (!state.internalActionModulePromise) {
      state.internalActionModulePromise = (async () => {
        const candidates = await discoverSignalsModuleCandidates();
        let lastError = null;
        for (const candidate of candidates) {
          try {
            const mod = await import(candidate);
            const helper = findInternalRequestHelper(mod);
            if (helper) {
              log("internal action module", candidate, helper.key);
              state.internalActionStatus = "available";
              state.lastInternalActionError = "";
              state.internalActionUnavailableUntil = 0;
              return helper.fn;
            }
          } catch (error) {
            lastError = error;
          }
        }
        throw lastError || new Error("Codex internal request helper module was not found");
      })().catch((error) => {
        state.internalActionModulePromise = null;
        state.internalActionStatus = "unavailable";
        state.lastInternalActionError = String(error?.message || error);
        state.internalActionUnavailableUntil = Date.now() + INTERNAL_ACTION_RETRY_MS;
        logOnce("internal-action-unavailable", "internal action unavailable; using DOM-only fallback", state.lastInternalActionError);
        throw error;
      });
    }
    return state.internalActionModulePromise;
  }

  function sourceLooksInternal(source) {
    if (source == null) return false;
    if (typeof source === "string") {
      return /(?:guardian|subagent|background|approval|review)/i.test(source);
    }
    if (typeof source !== "object") return false;
    if (source.subagent != null) return true;
    if (source.parentThreadId != null) return true;
    if (source.sourceThreadId != null) return true;
    try {
      return /(?:guardian|subagent|background|approval|review)/i.test(JSON.stringify(source));
    } catch {
      return false;
    }
  }

  function shouldHideThread(thread) {
    if (!thread || typeof thread !== "object") return false;
    if (
      thread.archived === true ||
      thread.archived === 1 ||
      thread.archived === "true" ||
      thread.status === "archived" ||
      thread.status?.type === "archived"
    ) {
      return true;
    }
    const knownPath = String(thread.path || thread.rolloutPath || thread.savedPath || "").replaceAll("\\", "/");
    if (/\/archived_sessions\//i.test(knownPath)) return true;
    if (sourceLooksInternal(thread.source)) return true;
    if (sourceLooksInternal(thread.threadSource)) return true;
    if (sourceLooksInternal(thread.originator)) return true;
    if (typeof thread.agentRole === "string" && /(?:guardian|subagent|background|approval|review)/i.test(thread.agentRole)) return true;
    if (typeof thread.agentNickname === "string" && /(?:guardian|subagent|background|approval|review)/i.test(thread.agentNickname)) return true;
    return false;
  }

  function normalizeListedThread(thread) {
    if (!thread || typeof thread.id !== "string") return null;
    if (shouldHideThread(thread)) return null;
    const cwd = normalizeCwd(thread.cwd);
    const title = String(thread.name || thread.title || thread.preview || "").trim();
    if (!cwd && !title) return null;
    return {
      id: threadRawId(thread.id),
      title: title || thread.id,
      cwd
    };
  }

  function mergeSnapshotThreads(nextThreads) {
    const archivedIds = readArchivedIds();
    const hiddenIds = readHiddenIds();
    const byId = new Map();
    for (const thread of readSnapshotThreads()) {
      const rawId = threadRawId(thread);
      if (!archivedIds.has(rawId) && !hiddenIds.has(rawId)) byId.set(rawId, thread);
    }
    for (const thread of nextThreads) {
      const normalized = normalizeListedThread(thread);
      if (!normalized) continue;
      const rawId = threadRawId(normalized);
      if (archivedIds.has(rawId) || hiddenIds.has(rawId)) continue;
      const existing = byId.get(normalized.id);
      byId.set(normalized.id, {
        ...existing,
        ...normalized
      });
    }
    const merged = Array.from(byId.values()).filter((thread) => threadRawId(thread));
    writeSnapshotThreads(merged);
    return merged.length;
  }

  async function sendCliRequest(method, params, options = {}) {
    if (Date.now() < state.internalActionUnavailableUntil) {
      throw new Error(state.lastInternalActionError || "Codex internal request helper is temporarily unavailable");
    }
    return callInternalAction("send-cli-request-for-host", {
      hostId: "local",
      method,
      params,
      timeoutMs: options.timeoutMs
    });
  }

  async function listThreadsFromCli({ archived, limit = TARGET }) {
    const threads = [];
    let cursor = null;
    for (let page = 0; page < 20 && threads.length < limit; page += 1) {
      const result = await sendCliRequest(
        "thread/list",
        {
          archived,
          cursor,
          limit: 50,
          modelProviders: null,
          sortKey: "updated_at"
        },
        { timeoutMs: 12000 }
      );
      const data = Array.isArray(result?.data) ? result.data : [];
      threads.push(...data);
      cursor = result?.nextCursor || null;
      if (!cursor || data.length === 0) break;
    }
    return threads;
  }

  async function refreshSnapshotFromCli(force = false) {
    const now = Date.now();
    if (state.snapshotRefreshInFlight) return;
    if (!force && now - state.lastSnapshotRefreshAt < 30000) return;
    if (Date.now() < state.internalActionUnavailableUntil) return;
    state.snapshotRefreshInFlight = true;
    state.lastSnapshotRefreshAt = now;
    try {
      const [threads, archivedThreads] = await Promise.all([
        listThreadsFromCli({ archived: false }),
        listThreadsFromCli({ archived: true })
      ]);
      const archivedIds = rememberArchivedIds(archivedThreads.map(threadRawId));
      const hiddenIds = rememberHiddenIds(threads.filter(shouldHideThread).map(threadRawId));
      const idsToRemove = new Set([...archivedIds, ...hiddenIds]);
      const removedArchived = pruneSnapshotThreads(idsToRemove);
      const count = mergeSnapshotThreads(threads);
      log("snapshot refreshed", {
        fetched: threads.length,
        archived: archivedThreads.length,
        hidden: hiddenIds.size,
        removedArchived,
        snapshot: count
      });
      state.supplementIds = "";
      scheduleExpand("snapshot-refresh");
      state.lastSnapshotRefreshError = "";
    } catch (error) {
      state.lastSnapshotRefreshError = String(error?.message || error);
      logOnce("snapshot-refresh-failed", "snapshot refresh failed; keeping existing snapshot", state.lastSnapshotRefreshError);
    } finally {
      state.snapshotRefreshInFlight = false;
    }
  }

  async function loadThreadIntoNativeCache(rawId) {
    await callInternalAction("hydrate-pinned-threads", {
      hostId: "local",
      threadIds: [rawId]
    });
    const result = await sendCliRequest(
      "thread/read",
      {
        threadId: rawId,
        includeTurns: false
      },
      { timeoutMs: 12000 }
    ).catch(() => null);
    const rawThread = result?.thread || result;
    if (rawThread?.archived === true || rawThread?.status?.type === "archived") {
      rememberArchivedIds([rawId]);
      pruneSnapshotThreads([rawId]);
      return false;
    }
    if (shouldHideThread(rawThread)) {
      rememberHiddenIds([rawId]);
      pruneSnapshotThreads([rawId]);
      return false;
    }
    const thread = normalizeListedThread(rawThread);
    if (thread) mergeSnapshotThreads([thread]);
    return waitForNativeThreadRow(threadDomId(rawId), 3000);
  }

  async function validateMissingNativeIds(ids) {
    const nativeIds = collectNativeThreadIds();
    const foundSet = new Set(ids.filter((id) => nativeIds.has(threadDomId(id))));
    const missingIds = ids.filter((id) => !foundSet.has(id));
    const idsToRemove = [];
    for (const id of missingIds) {
      try {
        const result = await sendCliRequest(
          "thread/read",
          {
            threadId: id,
            includeTurns: false
          },
          { timeoutMs: 12000 }
        );
        const rawThread = result?.thread || result;
        if (rawThread?.archived === true || rawThread?.status?.type === "archived") {
          rememberArchivedIds([id]);
          idsToRemove.push(id);
        } else if (shouldHideThread(rawThread)) {
          rememberHiddenIds([id]);
          idsToRemove.push(id);
        } else {
          const thread = normalizeListedThread(rawThread);
          if (thread) mergeSnapshotThreads([thread]);
        }
      } catch (error) {
        log("thread validation failed", id, String(error?.message || error));
      }
    }
    if (idsToRemove.length > 0) {
      const removed = pruneSnapshotThreads(idsToRemove);
      if (removed > 0) {
        log("stale snapshot pruned", {
          removed,
          stale: idsToRemove.length
        });
      }
    }
    log("thread metadata check", {
      requested: ids.length,
      found: foundSet.size,
      pending: missingIds.length,
      removed: idsToRemove.length
    });
    scheduleExpand("metadata-check");
  }

  async function promoteMissingToNative(missing) {
    const ids = Array.from(new Set(missing.map(threadRawId).filter(Boolean)));
    if (ids.length === 0 || state.promoteInFlight) return;
    if (Date.now() < state.internalActionUnavailableUntil) return;
    const key = ids.join("|");
    if (key === state.promotedKey && Date.now() < state.nextPromoteAt) return;
    state.promoteInFlight = true;
    state.promotedKey = key;
    state.nextPromoteAt = Date.now() + 1000;
    try {
      await callInternalAction("hydrate-pinned-threads", {
        hostId: "local",
        threadIds: ids
      });
      setManagedTimeout(() => scheduleExpand("native-hydrate"), 100);
      setManagedTimeout(() => {
        validateMissingNativeIds(ids).catch((error) => {
          log("thread validation failed", String(error?.message || error));
        });
      }, 2500);
      log("native hydrate requested", {
        requested: ids.length
      });
    } catch (error) {
      state.promotedKey = "";
      logOnce("thread-metadata-check-failed", "thread metadata check failed", String(error?.message || error));
    } finally {
      state.promoteInFlight = false;
    }
  }

  function ensureNativeHistory(reason = "keeper") {
    const threads = readSnapshotThreads();
    const missingNative = collectMissingNativeThreads();
    if (missingNative.length > 0) {
      log("native history gap", {
        reason,
        snapshot: threads.length,
        native: collectNativeThreadIds().size,
        missing: missingNative.length
      });
      promoteMissingToNative(missingNative);
    }
  }

  function installNativeHistoryKeeper() {
    const tick = () => {
      if (state.keeperStopped) return;
      ensureNativeHistory("keeper");
      setManagedTimeout(tick, 1000);
    };
    setManagedTimeout(tick, 1000);
  }

  function findNativeThreadRow(localId) {
    return Array.from(document.querySelectorAll(`[data-app-action-sidebar-thread-id="${CSS.escape(localId)}"]`))
      .find((row) => row instanceof HTMLElement && !row.hasAttribute("data-clpb-managed-row") && !row.closest(SUPPLEMENT_SELECTOR));
  }

  function getReactPropsKey(element) {
    return Object.keys(element).find((key) => key.startsWith("__reactProps"));
  }

  function clickNativeThreadRow(localId) {
    const row = findNativeThreadRow(localId);
    if (!row) return false;

    const reactPropsKey = getReactPropsKey(row);
    const onClick = reactPropsKey ? row[reactPropsKey]?.onClick : null;
    if (typeof onClick === "function") {
      const event = {
        currentTarget: row,
        target: row,
        defaultPrevented: false,
        preventDefault() {
          this.defaultPrevented = true;
        },
        stopPropagation() {
          this.propagationStopped = true;
        }
      };
      onClick(event);
      return true;
    }

    row.click();
    return true;
  }

  async function waitForNativeThreadRow(localId, timeoutMs = 5000) {
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeoutMs) {
      if (findNativeThreadRow(localId)) return true;
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
    return false;
  }

  async function openThread(thread) {
    const rawId = threadRawId(thread);
    const localId = `local:${rawId}`;
    const cwd = normalizeCwd(thread.cwd) || "/";

    try {
      const found = await loadThreadIntoNativeCache(rawId);
      log("native cache load", rawId, found);
    } catch (error) {
      log("native cache load failed", rawId, String(error));
    }

    try {
      const cwd = normalizeCwd(thread.cwd) || "/";
      await callInternalAction("maybe-resume-conversation", {
        hostId: "local",
        conversationId: rawId,
        model: null,
        serviceTier: null,
        reasoningEffort: null,
        workspaceRoots: [cwd],
        permissions: null,
        collaborationMode: null,
        showThreadGoalResumeConfirmation: true,
        showPausedGoalResumeConfirmation: true
      });
      log("thread resumed", rawId);
    } catch (error) {
      log("thread resume failed", rawId, String(error));
    }

    try {
      await loadThreadIntoNativeCache(rawId);
    } catch (error) {
      log("native cache reload failed", rawId, String(error));
    }

    scheduleExpand("open-thread");

    if (await waitForNativeThreadRow(localId)) {
      if (clickNativeThreadRow(localId)) {
        log("native row clicked", rawId);
        return;
      }
    }

    try {
      await callAppAction({
        type: "windows.show_thread",
        windowId: "current",
        threadId: rawId
      });
      return;
    } catch (error) {
      log("show thread raw failed", rawId, String(error));
    }

    try {
      await callAppAction({
        type: "windows.show_thread",
        windowId: "current",
        threadId: localId
      });
    } catch (error) {
      log("show thread local failed", localId, String(error));
    }
  }

  function makeSupplementalRow(thread, options = {}) {
    const threadId = threadDomId(thread);
    const titleText = thread.title || "Untitled thread";

    const item = document.createElement("div");
    item.className = "after:block after:h-px after:content-[''] last:after:hidden";
    item.setAttribute("role", "listitem");
    item.setAttribute("data-clpb-supplemental-item", "");
    item.setAttribute("data-clpb-thread-dom-id", threadId);
    if (options.project) item.setAttribute("data-clpb-project-supplemental-item", "");

    const row = document.createElement("div");
    row.className = "group relative min-h-token-nav-row cursor-interaction rounded-lg px-row-x py-row-y text-sm hover:bg-token-list-hover-background focus-visible:outline-offset-[-2px]";
    row.setAttribute("data-app-action-sidebar-thread-host-id", "local");
    row.setAttribute("data-app-action-sidebar-thread-id", threadId);
    row.setAttribute("data-app-action-sidebar-thread-kind", "local");
    row.setAttribute("data-app-action-sidebar-thread-pinned", "false");
    row.setAttribute("data-app-action-sidebar-thread-row", "");
    row.setAttribute("data-app-action-sidebar-thread-title", titleText);
    row.setAttribute("data-clpb-supplemental-row", "true");
    row.setAttribute("data-clpb-managed-row", "true");
    row.setAttribute("role", "button");
    row.setAttribute("tabindex", "0");
    row.setAttribute("data-state", "closed");
    row.title = `${titleText}\n${normalizeCwd(thread.cwd)}`;

    const title = document.createElement("div");
    title.className = "min-w-0 truncate text-token-text-primary";
    title.textContent = titleText;

    const project = document.createElement("div");
    project.className = "min-w-0 truncate text-xs text-token-text-tertiary";
    project.textContent = basename(thread.cwd);

    row.append(title, project);
    row.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      openThread(thread);
    });
    row.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      event.stopPropagation();
      openThread(thread);
    });

    item.appendChild(row);
    return item;
  }

  function getProjectThreadList(projectList) {
    return projectList.querySelector('[role="list"]') || projectList.querySelector(".flex.flex-col") || projectList;
  }

  function projectHasCollapsedThreads(projectList) {
    return Array.from(projectList.querySelectorAll("button")).some(isExpandButton);
  }

  function isUserCollapsedProject(root) {
    return state.userCollapsedProjectRoots.has(root);
  }

  function updateUserCollapsedProject(projectList, root) {
    const collapsed = projectHasCollapsedThreads(projectList);
    const before = state.userCollapsedProjectRoots.size;
    if (collapsed) {
      state.userCollapsedProjectRoots.add(root);
    } else {
      state.userCollapsedProjectRoots.delete(root);
    }
    if (before !== state.userCollapsedProjectRoots.size) {
      writeCollapsedProjectRoots(state.userCollapsedProjectRoots);
      log("project collapsed state", { root, collapsed });
    }
  }

  function renderProjectSupplementalHistory(threads, nativeIds) {
    const sidebarProjectIds = new Set();
    for (const row of document.querySelectorAll("[data-app-action-sidebar-project-id]")) {
      const value = normalizePathForCompare(row.getAttribute("data-app-action-sidebar-project-id"));
      if (value) sidebarProjectIds.add(value);
    }

    let rendered = 0;
    let removed = 0;
    const seen = new Set();
    const desired = new Set();
    for (const projectList of document.querySelectorAll(PROJECT_LIST_SELECTOR)) {
      const root = normalizePathForCompare(projectList.getAttribute("data-app-action-sidebar-project-list-id"));
      if (!root) continue;
      if (isUserCollapsedProject(root)) continue;

      const nestedProjects = [];
      for (const pid of sidebarProjectIds) {
        if (pid !== root && pid.startsWith(`${root}/`)) {
          nestedProjects.push(pid);
        }
      }

      const list = getProjectThreadList(projectList);
      const matches = threads.filter((thread) => {
        const id = threadDomId(thread);
        if (nativeIds.has(id) || seen.has(id)) return false;
        if (!threadHasVisibleProject(thread, new Set([root]))) return false;
        const cwd = normalizePathForCompare(thread?.cwd);
        for (const nested of nestedProjects) {
          if (cwd === nested || cwd.startsWith(`${nested}/`)) return false;
        }
        return true;
      });
      for (const thread of matches) {
        const id = threadDomId(thread);
        seen.add(id);
        desired.add(id);
        const existing = list.querySelector(`[data-clpb-project-supplemental-item][data-clpb-thread-dom-id="${CSS.escape(id)}"]`);
        if (!existing) {
          list.appendChild(makeSupplementalRow(thread, { project: true }));
          rendered += 1;
        }
      }
    }

    for (const item of document.querySelectorAll(PROJECT_SUPPLEMENT_ITEM_SELECTOR)) {
      const id = item.getAttribute("data-clpb-thread-dom-id");
      if (!id || !desired.has(id)) {
        item.remove();
        removed += 1;
      }
    }

    if (rendered > 0 || removed > 0) {
      log("project supplement rendered", { rendered, removed });
    }
    return seen;
  }

  function countExpandButtons() {
    return Array.from(document.querySelectorAll(`${PROJECT_LIST_SELECTOR} button`)).filter(isExpandButton).length;
  }

  function renderSupplementalHistory() {
    if (state.renderingSupplement) return;
    const scroll = document.querySelector("[data-app-action-sidebar-scroll]");
    if (!scroll) return;

    state.renderingSupplement = true;
    try {
      const threads = readSnapshotThreads();
      const nativeIds = collectNativeThreadIds();
      const collapsedRoots = collectCollapsedProjectRoots();
      const projectRoots = collectVisibleProjectRoots();
      const missingNative = threads.filter((thread) => {
        if (nativeIds.has(threadDomId(thread))) return false;
        return !isThreadHiddenByCollapsedProject(thread, collapsedRoots);
      });
      promoteMissingToNative(missingNative);

      const projectSupplementIds = renderProjectSupplementalHistory(missingNative, nativeIds);
      const sidebarBasenames = collectSidebarProjectBasenames();
      const missingAll = missingNative.filter((thread) => {
        if (projectSupplementIds.has(threadDomId(thread))) return false;
        if (threadHasVisibleProject(thread, projectRoots)) return false;
        if (sidebarBasenames.size > 0) {
          const cwdParts = normalizePathForCompare(thread.cwd).split("/").filter(Boolean);
          if (cwdParts.some((part) => sidebarBasenames.has(part))) return false;
        }
        return true;
      });
      const omittedMissing = Math.max(0, missingAll.length - MAX_EXTRA_HISTORY_ROWS);
      const missing = Date.now() >= state.internalActionUnavailableUntil ? [] : missingAll.slice(0, MAX_EXTRA_HISTORY_ROWS);
      const nextIds = missing.map((thread) => threadDomId(thread)).join("|");
      const existing = document.querySelector(SUPPLEMENT_SELECTOR);

      if (missing.length === 0) {
        existing?.remove();
        state.supplementIds = "";
        return;
      }
      if (existing && state.supplementIds === nextIds) return;

      existing?.remove();
      state.supplementIds = nextIds;

      const section = document.createElement("div");
      section.className = "px-row-x";
      section.setAttribute("data-app-action-sidebar-section", "");
      section.setAttribute("data-clpb-history-section", "");

      const heading = document.createElement("div");
      heading.className = "flex h-8 items-center px-2 text-xs font-semibold uppercase text-token-text-tertiary";
      heading.textContent = `Extra history (${missingAll.length}${omittedMissing ? `, showing ${missing.length}` : ""})`;

      const list = document.createElement("div");
      list.className = "flex flex-col gap-px";
      list.setAttribute("role", "list");
      list.setAttribute("aria-label", "Extra history");
      missing.forEach((thread) => list.appendChild(makeSupplementalRow(thread)));

      section.append(heading, list);
      scroll.appendChild(section);
      log("supplement rendered", {
        missing: missing.length,
        omitted: omittedMissing,
        snapshot: threads.length,
        native: nativeIds.size
      });
    } finally {
      state.renderingSupplement = false;
    }
  }

  function expandNativeProjectLists(reason = "scan") {
    let clicked = 0;
    const lists = Array.from(document.querySelectorAll(PROJECT_LIST_SELECTOR));
    state.programmaticExpand = true;
    try {
      for (const list of lists) {
        const buttons = Array.from(list.querySelectorAll("button")).filter(isExpandButton);
        for (const button of buttons) {
          state.clicked.add(button);
          button.click();
          clicked += 1;
        }
      }
    } finally {
      state.programmaticExpand = false;
    }
    if (clicked || reason === "manual") {
      log("native expand", {
        reason,
        clicked,
        projects: lists.length,
        threads: document.querySelectorAll(THREAD_SELECTOR).length,
        remainingExpandButtons: countExpandButtons()
      });
    }
    renderSupplementalHistory();
    return clicked;
  }

  function autoExpandNativeProjectLists(reason) {
    const withinAutoWindow = Date.now() <= state.autoExpandDeadlineMs;
    if (!state.autoExpandEnabled || !withinAutoWindow) {
      renderSupplementalHistory();
      return 0;
    }
    return expandNativeProjectLists(reason);
  }

  function scheduleExpand(reason) {
    if (state.scheduled) return;
    state.scheduled = true;
    requestAnimationFrame(() => {
      state.scheduled = false;
      if (reason !== "manual") {
        const withinAutoWindow = Date.now() <= state.autoExpandDeadlineMs;
        if (state.autoExpandEnabled && withinAutoWindow) {
          autoExpandNativeProjectLists(reason);
          return;
        }
      }
      renderSupplementalHistory();
    });
  }

  function installObserver() {
    state.projectClickListener = (event) => {
      if (state.programmaticExpand) return;
      const target = event.target;
      const button = target instanceof Element ? target.closest(`${PROJECT_LIST_SELECTOR} button`) : null;
      if (button) {
        const projectList = button.closest(PROJECT_LIST_SELECTOR);
        const root = normalizePathForCompare(projectList?.getAttribute("data-app-action-sidebar-project-list-id"));
        state.autoExpandEnabled = false;
        if (projectList && root) {
          for (const ms of [0, 150]) {
            setManagedTimeout(() => {
              updateUserCollapsedProject(projectList, root);
              renderSupplementalHistory();
            }, ms);
          }
        }
      }
    };
    document.addEventListener(
      "click",
      state.projectClickListener,
      true
    );

    state.observer = new MutationObserver(() => {
      if (state.renderingSupplement) return;
      renderSupplementalHistory();
    });
    state.observer.observe(document.documentElement, {
      childList: true,
      subtree: true
    });
  }

  function stop() {
    state.keeperStopped = true;
    if (state.observer) state.observer.disconnect();
    if (state.projectClickListener) {
      document.removeEventListener("click", state.projectClickListener, true);
    }
    for (const timer of state.timers) window.clearTimeout(timer);
    state.timers.clear();
    if (state.fetchPatched) window.fetch = state.originalFetch;
    if (state.xhrPatched) {
      XMLHttpRequest.prototype.open = state.originalXhrOpen;
      XMLHttpRequest.prototype.send = state.originalXhrSend;
    }
    log("stopped");
  }

  window[SCRIPT_KEY] = {
    expand: () => expandNativeProjectLists("manual"),
    open: openThread,
    status: () => ({
      projects: document.querySelectorAll(PROJECT_LIST_SELECTOR).length,
      threads: document.querySelectorAll(`${THREAD_SELECTOR}:not([data-clpb-managed-row])`).length,
      nativeThreads: collectNativeThreadIds().size,
      supplementThreads: document.querySelectorAll("[data-clpb-supplemental-item]:not([hidden]) [data-clpb-supplemental-row]").length,
      projectSupplementRows: document.querySelectorAll(`${PROJECT_SUPPLEMENT_ITEM_SELECTOR}:not([hidden])`).length,
      collapsedProjects: collectCollapsedProjectRoots().size,
      snapshotThreads: readSnapshotThreads().length,
      missingNativeThreads: collectMissingNativeThreads().length,
      extraHistoryRows: document.querySelectorAll("[data-clpb-history-section] [data-clpb-managed-row]").length,
      internalActions: state.internalActionStatus,
      internalActionRetryInMs: Math.max(0, state.internalActionUnavailableUntil - Date.now()),
      lastInternalActionError: state.lastInternalActionError,
      lastSnapshotRefreshError: state.lastSnapshotRefreshError,
      expandButtons: countExpandButtons(),
      href: location.href
    }),
    stop
  };

  state.userCollapsedProjectRoots = readCollapsedProjectRoots();
  patchRequests();
  installObserver();
  installNativeHistoryKeeper();
  log("loaded", window[SCRIPT_KEY].status());
  refreshSnapshotFromCli();
  scheduleExpand("load");
  renderSupplementalHistory();
  [250, 750, 1500, 3000].forEach((ms) => {
    setManagedTimeout(() => autoExpandNativeProjectLists(`timer:${ms}`), ms);
  });
})();

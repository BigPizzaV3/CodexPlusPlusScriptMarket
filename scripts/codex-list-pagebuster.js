(() => {
  const DEFAULT_TARGET = 500;
  const MIN_TARGET = 1;
  const MAX_TARGET = 2000;
  const CLI_PAGE_SIZE = 100;
  const CLI_MAX_PAGES = Math.ceil(MAX_TARGET / CLI_PAGE_SIZE);
  const NATIVE_HYDRATE_BATCH_SIZE = 10;
  const NATIVE_MANAGER_SCAN_LIMIT = 150000;
  const SCRIPT_KEY = "__codexListPagebuster";
  const STORAGE_KEY = "__codexListPagebusterThreads";
  const STORAGE_VERSION_KEY = "__codexListPagebusterStorageVersion";
  const STORAGE_VERSION = "2026-06-01-global-history-v4";
  const TARGET_STORAGE_KEY = "__codexListPagebusterTarget";
  const PROJECT_LIST_SELECTOR = "[data-app-action-sidebar-project-list-id]";
  const THREAD_SELECTOR = "[data-app-action-sidebar-thread-id]";
  const SUPPLEMENT_SELECTOR = "[data-clpb-history-section]";
  const MANAGED_ROW_SELECTOR = "[data-clpb-managed-row]";
  const PROJECT_SUPPLEMENT_ITEM_SELECTOR = "[data-clpb-project-supplemental-item]";
  const EXPAND_TEXT = /^(?:\u5c55\u5f00\u663e\u793a|\u663e\u793a\u66f4\u591a|Show more|Show all)$/i;
  const ARCHIVED_IDS_KEY = "__codexListPagebusterArchivedIds";
  const HIDDEN_IDS_KEY = "__codexListPagebusterHiddenIds";
  const GLOBAL_EXTRA_HISTORY = true;
  const SIGNALS_MODULE_RE = /(?:\.\/)?(?:assets\/)?(?:app-server-manager-signals|app-initial)-[A-Za-z0-9_-]+\.js/g;
  const SIGNALS_MODULE_FALLBACKS = [
    "./assets/app-server-manager-signals-Csopz8aM.js",
    "./assets/app-server-manager-signals-zAr_ejg8.js"
  ];

  if (window[SCRIPT_KEY]?.stop) {
    window[SCRIPT_KEY].stop();
  }

  const state = {
    clicked: new WeakSet(),
    scheduled: false,
    autoExpandEnabled: true,
    programmaticExpand: false,
    projectClickListener: null,
    autoExpandDeadlineMs: Date.now() + 8000,
    lastProjectRoots: new Set(),
    internalActionModulePromise: null,
    snapshotRefreshInFlight: false,
    lastSnapshotRefreshAt: 0,
    lastSnapshotError: "",
    nativeIdsRequested: 0,
    nativeCachedThreads: 0,
    nativeSummaryThreads: 0,
    nativeMissingThreads: 0,
    nativeManager: null,
    nativeManagerPromise: null,
    nativeRuntimeSettings: null,
    nativeOriginalHistoryLimit: null,
    nativeHistoryLimitGetter: null,
    nativeHistoryLimit: DEFAULT_TARGET,
    lastNativeLoadError: ""
  };

  function normalizeTarget(value, fallback = DEFAULT_TARGET) {
    const parsed = Number.parseInt(String(value ?? ""), 10);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.max(MIN_TARGET, Math.min(MAX_TARGET, parsed));
  }

  function readTarget() {
    try {
      return normalizeTarget(localStorage.getItem(TARGET_STORAGE_KEY));
    } catch {
      return DEFAULT_TARGET;
    }
  }

  function writeTarget(value) {
    const target = normalizeTarget(value);
    try {
      localStorage.setItem(TARGET_STORAGE_KEY, String(target));
    } catch {}
    return target;
  }

  function log(...args) {
    try {
      console.info("[clpb]", ...args);
    } catch {}
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

  function migrateStorageForGlobalHistory() {
    try {
      const version = localStorage.getItem(STORAGE_VERSION_KEY);
      if (version === STORAGE_VERSION) return;
      // Earlier builds could keep a current-project-only snapshot or hide
      // old cross-project threads after a failed metadata check. Rebuild from
      // the broad local CLI history on the next refresh.
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(HIDDEN_IDS_KEY);
      localStorage.setItem(STORAGE_VERSION_KEY, STORAGE_VERSION);
      log("global history storage migrated", {
        previousVersion: version || "(none)",
        version: STORAGE_VERSION
      });
    } catch (error) {
      log("global history storage migration failed", String(error));
    }
  }

  function pruneSnapshotThreads(idsToRemove) {
    const removeSet = new Set(Array.from(idsToRemove).map(threadRawId).filter(Boolean));
    if (removeSet.size === 0) return 0;
    const threads = readSnapshotThreads();
    const next = threads.filter((thread) => !removeSet.has(threadRawId(thread)));
    if (next.length === threads.length) return 0;
    writeSnapshotThreads(next);
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

  function snapshotProjectCounts(limit = 12) {
    const counts = new Map();
    for (const thread of readSnapshotThreads()) {
      const label = basename(thread.cwd);
      counts.set(label, (counts.get(label) || 0) + 1);
    }
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, limit)
      .map(([project, count]) => ({ project, count }));
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

  function findInternalRequestHelper(mod) {
    const preferred = ["oht", "ts", "It", "ln"];
    for (const key of preferred) {
      const value = mod?.[key];
      if (typeof value !== "function") continue;
      const source = Function.prototype.toString.call(value);
      if (/sendRequest\s*\(/.test(source)) return { key, fn: value };
    }

    for (const key of Object.keys(mod || {})) {
      const value = mod[key];
      if (typeof value !== "function") continue;
      let source = "";
      try {
        source = Function.prototype.toString.call(value);
      } catch {
        continue;
      }
      if (/sendRequest\s*\(/.test(source)) return { key, fn: value };
    }
    return null;
  }

  function normalizeSignalsModulePath(path) {
    if (!path) return "";
    if (/^https?:|^app:|^file:/i.test(path)) return path;
    const relative = path.replace(/^\.\//, "");
    if (relative.startsWith("assets/")) return `./${relative}`;
    if (/^(?:app-server-manager-signals|app-initial)-[A-Za-z0-9_-]+\.js$/.test(relative)) {
      return `./assets/${relative}`;
    }
    return "";
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
        if (/(?:app-server-manager-signals|app-initial)-/.test(name)) add(name);
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
              return helper.fn;
            }
          } catch (error) {
            lastError = error;
          }
        }
        throw lastError || new Error("Codex internal request helper module was not found");
      })().catch((error) => {
        state.internalActionModulePromise = null;
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

  function mergeSnapshotThreads(nextThreads, limit = readTarget()) {
    const archivedIds = readArchivedIds();
    const hiddenIds = readHiddenIds();
    const byId = new Map();
    for (const thread of nextThreads) {
      const normalized = normalizeListedThread(thread);
      if (!normalized) continue;
      const rawId = threadRawId(normalized);
      if (archivedIds.has(rawId) || hiddenIds.has(rawId)) continue;
      byId.set(normalized.id, normalized);
    }
    const merged = Array.from(byId.values())
      .filter((thread) => threadRawId(thread))
      .slice(0, normalizeTarget(limit));
    writeSnapshotThreads(merged);
    return merged.length;
  }

  async function sendCliRequest(method, params, options = {}) {
    return callInternalAction("send-cli-request-for-host", {
      hostId: "local",
      method,
      params,
      timeoutMs: options.timeoutMs
    });
  }

  function threadListParams({ archived, cursor, global }) {
    const params = {
      archived,
      cursor,
      limit: CLI_PAGE_SIZE,
      sortKey: "updated_at"
    };
    if (global) {
      return {
        ...params,
        modelProviders: [],
        sourceKinds: ["cli", "vscode", "appServer", "unknown"],
        useStateDbOnly: true,
        includeAllWorkspaces: true,
        includeAllProjects: true
      };
    }
    return { ...params, modelProviders: null };
  }

  async function listThreadsFromCliVariant({ archived, limit, global }) {
    const threads = [];
    let cursor = null;
    for (let page = 0; page < CLI_MAX_PAGES && threads.length < limit; page += 1) {
      const result = await sendCliRequest(
        "thread/list",
        threadListParams({ archived, cursor, global }),
        { timeoutMs: 12000 }
      );
      const data = Array.isArray(result?.data) ? result.data : [];
      threads.push(...data);
      cursor = result?.nextCursor || null;
      if (!cursor || data.length === 0) break;
    }
    return threads;
  }

  async function listThreadsFromCli({ archived, limit = readTarget() }) {
    if (!GLOBAL_EXTRA_HISTORY) {
      return listThreadsFromCliVariant({ archived, limit, global: false });
    }
    try {
      return await listThreadsFromCliVariant({ archived, limit, global: true });
    } catch (error) {
      log("global thread/list failed; retrying default scope", String(error));
      return listThreadsFromCliVariant({ archived, limit, global: false });
    }
  }

  async function findNativeConversationManager() {
    if (state.nativeManager) return state.nativeManager;
    if (state.nativeManagerPromise) return state.nativeManagerPromise;

    state.nativeManagerPromise = (async () => {
      const root = document.getElementById("root");
      const containerKey = root && Object.getOwnPropertyNames(root)
        .find((key) => key.startsWith("__reactContainer$"));
      if (!root || !containerKey) return null;

      const queue = [root[containerKey]];
      const seen = new WeakSet();
      let index = 0;
      let visited = 0;

      while (index < queue.length && visited < NATIVE_MANAGER_SCAN_LIMIT) {
        const value = queue[index++];
        if (!value || (typeof value !== "object" && typeof value !== "function") || seen.has(value)) continue;
        seen.add(value);
        visited += 1;

        try {
          if (
            value.threadStore
            && typeof value.refreshRecentConversations === "function"
            && typeof value.getThreadSummaries === "function"
            && typeof value.getConversation === "function"
          ) {
            state.nativeManager = value;
            log("native conversation manager found", { visited, hostId: value.getHostId?.() || "local" });
            return value;
          }
        } catch {}

        let children = [];
        try {
          if (value instanceof Map) {
            children = [...value.keys(), ...value.values()];
          } else if (value instanceof Set) {
            children = [...value.values()];
          } else {
            const keys = Object.getOwnPropertyNames(value);
            if (keys.length <= 300) {
              for (const key of keys) {
                if (["ownerDocument", "parentNode", "parentElement", "previousSibling", "nextSibling", "defaultView", "window", "document"].includes(key)) continue;
                let child;
                try {
                  child = value[key];
                } catch {
                  continue;
                }
                if (child && (typeof child === "object" || typeof child === "function")) children.push(child);
              }
            }
          }
        } catch {}

        for (const child of children) {
          if (!seen.has(child)) queue.push(child);
        }
        if (visited % 3000 === 0) {
          await new Promise((resolve) => window.setTimeout(resolve, 0));
        }
      }

      log("native conversation manager not found", { visited });
      return null;
    })();

    const manager = await state.nativeManagerPromise;
    if (!manager) state.nativeManagerPromise = null;
    return manager;
  }

  function configureNativeHistoryLimit(manager, limit) {
    const runtimeSettings = manager?.runtimeSettings;
    if (!runtimeSettings || typeof runtimeSettings.getRecentConversationDiscoveryLimit !== "function") return;
    state.nativeHistoryLimit = normalizeTarget(limit);
    if (!state.nativeRuntimeSettings) {
      state.nativeRuntimeSettings = runtimeSettings;
      state.nativeOriginalHistoryLimit = runtimeSettings.getRecentConversationDiscoveryLimit;
      state.nativeHistoryLimitGetter = () => state.nativeHistoryLimit;
    }
    runtimeSettings.getRecentConversationDiscoveryLimit = state.nativeHistoryLimitGetter;
  }

  async function loadThroughNativeManager(manager, conversationIds, limit) {
    configureNativeHistoryLimit(manager, limit);
    try {
      await manager.refreshRecentConversations({ mode: "expanded", sortKey: "updated_at" });
    } catch (error) {
      log("native expanded refresh failed; continuing with hydration", String(error));
    }

    const target = normalizeTarget(limit);
    const summaryIds = (manager.getThreadSummaries?.() || [])
      .map((thread) => String(thread?.conversationId || ""))
      .filter(Boolean);
    const desiredIds = [...new Set([...summaryIds, ...conversationIds])].slice(0, target);
    state.nativeSummaryThreads = summaryIds.length;
    state.nativeIdsRequested = desiredIds.length;

    const missingBefore = desiredIds.filter((id) => manager.getConversation(id) == null);
    const failedIds = new Set();
    for (let index = 0; index < missingBefore.length; index += NATIVE_HYDRATE_BATCH_SIZE) {
      const batch = missingBefore.slice(index, index + NATIVE_HYDRATE_BATCH_SIZE);
      try {
        await manager.hydrateBackgroundThreads(batch);
      } catch {
        for (const id of batch) {
          try {
            await manager.hydrateBackgroundThreads([id]);
          } catch {
            failedIds.add(id);
          }
        }
      }
    }

    const availableIds = desiredIds.filter((id) => manager.getConversation(id) != null);
    const threadStore = manager.threadStore;
    threadStore.recentConversationIds = availableIds;
    threadStore.notifyAnyConversationCallbacks?.({ forceAny: true, forceMeta: true });

    state.nativeCachedThreads = availableIds.length;
    state.nativeMissingThreads = desiredIds.length - availableIds.length;
    if (state.nativeMissingThreads > 0) {
      state.lastNativeLoadError = `${state.nativeMissingThreads} conversation(s) could not be hydrated`;
      log("native hydration incomplete", {
        desired: desiredIds.length,
        available: availableIds.length,
        failed: failedIds.size
      });
    }
    return availableIds.length;
  }

  async function loadNativeRecentHistory(threads, limit) {
    const conversationIds = threads
      .map(threadRawId)
      .filter(Boolean)
      .slice(0, normalizeTarget(limit));
    state.nativeIdsRequested = conversationIds.length;
    state.lastNativeLoadError = "";
    if (conversationIds.length === 0) return 0;

    try {
      const manager = await findNativeConversationManager();
      if (manager) return await loadThroughNativeManager(manager, conversationIds, limit);

      const loadedIds = await callInternalAction("load-recent-conversation-ids-for-host", {
        hostId: "local",
        conversationIds
      });
      state.nativeCachedThreads = Array.isArray(loadedIds) ? loadedIds.length : conversationIds.length;
      state.nativeMissingThreads = Math.max(0, conversationIds.length - state.nativeCachedThreads);
      return state.nativeCachedThreads;
    } catch (error) {
      state.lastNativeLoadError = String(error);
      log("native recent id load failed", state.lastNativeLoadError);
      throw error;
    }
  }

  async function refreshSnapshotFromCli(force = false, requestedLimit = readTarget()) {
    const now = Date.now();
    if (state.snapshotRefreshInFlight) return;
    if (!force && now - state.lastSnapshotRefreshAt < 30000) return;
    state.snapshotRefreshInFlight = true;
    state.lastSnapshotRefreshAt = now;
    state.lastSnapshotError = "";
    const limit = normalizeTarget(requestedLimit);
    try {
      const [threads, archivedThreads] = await Promise.all([
        listThreadsFromCli({ archived: false, limit }),
        listThreadsFromCli({ archived: true, limit })
      ]);
      const archivedIds = rememberArchivedIds(archivedThreads.map(threadRawId));
      const hiddenIds = rememberHiddenIds(threads.filter(shouldHideThread).map(threadRawId));
      const idsToRemove = new Set([...archivedIds, ...hiddenIds]);
      const removedArchived = pruneSnapshotThreads(idsToRemove);
      const count = mergeSnapshotThreads(threads, limit);
      const nativeRequested = await loadNativeRecentHistory(threads, limit);
      log("snapshot refreshed", {
        limit,
        fetched: threads.length,
        archived: archivedThreads.length,
        hidden: hiddenIds.size,
        removedArchived,
        snapshot: count,
        nativeRequested
      });
      renderSupplementalHistory();
      return count;
    } catch (error) {
      state.lastSnapshotError = String(error);
      log("snapshot refresh failed", state.lastSnapshotError);
      if (force) throw error;
      return null;
    } finally {
      state.snapshotRefreshInFlight = false;
    }
  }

  async function loadThreadIntoNativeCache(rawId) {
    await callInternalAction("load-recent-conversation-ids-for-host", {
      hostId: "local",
      conversationIds: [rawId]
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
    if (thread) mergeSnapshotThreads([...readSnapshotThreads(), thread]);
    return true;
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

  function countExpandButtons() {
    return Array.from(document.querySelectorAll(`${PROJECT_LIST_SELECTOR} button`)).filter(isExpandButton).length;
  }

  function renderSupplementalHistory() {
    document.querySelectorAll(SUPPLEMENT_SELECTOR).forEach((section) => section.remove());
    document.querySelectorAll(PROJECT_SUPPLEMENT_ITEM_SELECTOR).forEach((item) => item.remove());
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

  function scheduleExpand() {
    renderSupplementalHistory();
  }

  function stop() {
    renderSupplementalHistory();
    if (
      state.nativeRuntimeSettings
      && state.nativeHistoryLimitGetter
      && state.nativeRuntimeSettings.getRecentConversationDiscoveryLimit === state.nativeHistoryLimitGetter
    ) {
      state.nativeRuntimeSettings.getRecentConversationDiscoveryLimit = state.nativeOriginalHistoryLimit;
    }
    log("stopped");
  }

  window[SCRIPT_KEY] = {
    expand: () => expandNativeProjectLists("manual"),
    open: openThread,
    refresh: (limit = readTarget()) => refreshSnapshotFromCli(true, writeTarget(limit)),
    getLimit: readTarget,
    setLimit: writeTarget,
    resetHistory: () => {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(HIDDEN_IDS_KEY);
      localStorage.setItem(STORAGE_VERSION_KEY, STORAGE_VERSION);
      void refreshSnapshotFromCli(true).catch((error) => log("history reset refresh failed", String(error)));
      scheduleExpand("reset-history");
    },
    render: renderSupplementalHistory,
    status: () => ({
      projects: document.querySelectorAll(PROJECT_LIST_SELECTOR).length,
      threads: document.querySelectorAll(THREAD_SELECTOR).length,
      nativeThreads: collectNativeThreadIds().size,
      supplementThreads: document.querySelectorAll("[data-clpb-supplemental-row]").length,
      projectSupplementItems: document.querySelectorAll(PROJECT_SUPPLEMENT_ITEM_SELECTOR).length,
      snapshotThreads: readSnapshotThreads().length,
      snapshotProjects: snapshotProjectCounts(20),
      lastSnapshotRefreshAt: state.lastSnapshotRefreshAt,
      snapshotRefreshInFlight: state.snapshotRefreshInFlight,
      lastSnapshotError: state.lastSnapshotError,
      nativeIdsRequested: state.nativeIdsRequested,
      nativeCachedThreads: state.nativeCachedThreads,
      nativeSummaryThreads: state.nativeSummaryThreads,
      nativeMissingThreads: state.nativeMissingThreads,
      nativeManagerFound: Boolean(state.nativeManager),
      lastNativeLoadError: state.lastNativeLoadError,
      configuredLimit: readTarget(),
      globalExtraHistory: GLOBAL_EXTRA_HISTORY,
      renderer: "codex-native",
      observerScope: "none",
      requestInterceptionEnabled: false,
      expandButtons: countExpandButtons(),
      href: location.href
    }),
    stop
  };

  renderSupplementalHistory();
  migrateStorageForGlobalHistory();
  log("loaded", window[SCRIPT_KEY].status());
})();

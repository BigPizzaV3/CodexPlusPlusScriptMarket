/* Codex++ Environment Injector bundle v0.3.2 */
/* Codex++ Environment Injector v0.3.2 */
(() => {
  "use strict";

  const GLOBAL_KEY = "__codexEnvironmentInjector";
  const LEGACY_GLOBAL_KEY = "__codexPlusProfileSelector";
  const VERSION = "0.3.2";
  const STORAGE_KEY = "codexpp.environmentInjector.v2";
  const LEGACY_SELECTOR_STORAGE_KEY = "codexpp.profileSelector.v1";
  const LEGACY_STUDIO_STORAGE_KEY = "codexpp.profileStudio.v1";
  const STATE_VERSION = 2;
  const WRAPPER_MARK = "__codexEnvironmentInjectorWrapper";
  const INJECTED_PARAMS_MARK = Symbol("codex-environment-injected-params");
  const HOST_ID = "codexpp-environment-injector-host";
  const UPDATE_EVENT = "codexpp-environment-injector-updated";
  const MAX_THREAD_ENTRIES = 160;
  const ENVIRONMENT_BUNDLE = {"schemaVersion":2,"generatorVersion":"0.3.2","generatedAt":"2026-09-04T13:05:54+00:00","profiles":[],"warnings":[],"environment":{"capabilities":{"source":"generated-snapshot","diskRead":true,"diskWrite":false,"bridge":false},"globalAgents":{"exists":false,"name":"AGENTS.md","content":"","hash":null},"memory":{"settings":{"enabled":false},"summary":{"exists":false,"name":"memory_summary.md","content":"","hash":null},"durable":{"exists":false,"name":"MEMORY.md","content":"","hash":null},"files":[]}}};

  window[GLOBAL_KEY]?.destroy?.();
  if (window[LEGACY_GLOBAL_KEY] && window[LEGACY_GLOBAL_KEY] !== window[GLOBAL_KEY]) {
    window[LEGACY_GLOBAL_KEY]?.destroy?.();
  }

  const lifetime = new AbortController();
  const { signal } = lifetime;
  const wrapperToken = {};
  const patchedClients = new Set();
  const environmentControllers = new Set();
  const replayTargets = new WeakSet();
  const modulePromises = new Map();
  const staticProfiles = Array.isArray(ENVIRONMENT_BUNDLE.profiles)
    ? ENVIRONMENT_BUNDLE.profiles
    : [];
  const staticProfileIds = new Set(staticProfiles
    .map((profile) => String(profile?.id || "").trim())
    .filter((id) => /^[A-Za-z0-9_-]+$/.test(id)));
  let profiles = [];
  let profileMap = new Map();

  let destroyed = false;
  let host = null;
  let shadow = null;
  let pill = null;
  let panel = null;
  let dialogCard = null;
  let panelTitle = null;
  let panelSubtitle = null;
  let panelExpandButton = null;
  let dialogExpanded = false;
  let optionsRoot = null;
  let currentRoot = null;
  let selectTab = null;
  let currentTab = null;
  let memoryTab = null;
  let agentsTab = null;
  let tutorialTab = null;
  let memoryRoot = null;
  let agentsRoot = null;
  let tutorialRoot = null;
  let panelFooter = null;
  let panelMode = "select";
  let selectionTitle = "选择环境";
  let currentRenderIdentity = "";
  let promptCheckbox = null;
  let toastNode = null;
  let activeChooser = null;
  let scanTimer = 0;
  let labelTimer = 0;
  let scanInFlight = false;
  let scanAttempts = 0;
  let lastPatchError = "";
  let healedLegacySendRequestShadows = 0;
  const requestTrace = [];
  const disclosureState = new Map();
  let pendingStartBinding = null;
  let pendingThreadObservation = null;
  let bridgeCapabilities = null;
  let bridgeAgents = null;
  let bridgeMemory = null;
  let uiAdapter = null;

  function isObject(value) {
    return !!value && typeof value === "object" && !Array.isArray(value);
  }

  async function bridgeCall(path, payload = {}) {
    if (typeof window.__codexSessionDeleteBridge !== "function") {
      return { status: "unavailable", message: "Codex++ bridge unavailable" };
    }
    try {
      return await window.__codexSessionDeleteBridge(path, payload);
    } catch (error) {
      return { status: "failed", message: String(error?.message || error) };
    }
  }

  async function refreshBridgeState() {
    const capabilities = await bridgeCall("/environment-injector/capabilities", {});
    if (capabilities?.status !== "ok") {
      bridgeCapabilities = null;
      bridgeAgents = null;
      bridgeMemory = null;
      return;
    }
    bridgeCapabilities = capabilities;
    const [agents, memory] = await Promise.all([
      bridgeCall("/environment-injector/agents/get", {}),
      bridgeCall("/environment-injector/memory/get", {}),
    ]);
    bridgeAgents = agents?.status === "ok" ? agents : null;
    bridgeMemory = memory?.status === "ok" ? memory : null;
    if (panelMode === "memory") renderMemoryView();
    if (panelMode === "agents") renderAgentsView();
    updatePill();
  }

  function cloneJson(value, fallback = {}) {
    try { return JSON.parse(JSON.stringify(value)); } catch { return fallback; }
  }

  function defaultEnvironmentStore() {
    return {
      schemaVersion: STATE_VERSION,
      revision: 0,
      profiles: {},
      selection: { pendingProfileId: "", promptOnNewThread: true },
      bindingsByThread: {},
      proofByThread: {},
      migration: { completed: false, sources: [] },
      ui: {},
    };
  }

  function parseStoredJson(key) {
    try {
      const value = JSON.parse(localStorage.getItem(key) || "null");
      return isObject(value) ? value : null;
    } catch {
      return null;
    }
  }

  function normalizeEnvironmentStore(value) {
    const store = isObject(value) ? value : defaultEnvironmentStore();
    store.schemaVersion = STATE_VERSION;
    if (!Number.isFinite(store.revision)) store.revision = 0;
    if (!isObject(store.profiles)) store.profiles = {};
    if (!isObject(store.selection)) store.selection = {};
    if (!isObject(store.bindingsByThread)) store.bindingsByThread = {};
    if (!isObject(store.proofByThread)) store.proofByThread = {};
    if (!isObject(store.migration)) store.migration = { completed: false, sources: [] };
    if (!Array.isArray(store.migration.sources)) store.migration.sources = [];
    if (!isObject(store.ui)) store.ui = {};
    store.selection.pendingProfileId = String(store.selection.pendingProfileId || "");
    store.selection.promptOnNewThread = store.selection.promptOnNewThread !== false;
    return store;
  }

  function migrateLegacyEnvironmentStore() {
    const store = defaultEnvironmentStore();
    const legacyStudio = parseStoredJson(LEGACY_STUDIO_STORAGE_KEY);
    const legacySelector = parseStoredJson(LEGACY_SELECTOR_STORAGE_KEY);
    if (legacyStudio && isObject(legacyStudio.profiles)) {
      store.profiles = cloneJson(legacyStudio.profiles);
      store.migration.sources.push(LEGACY_STUDIO_STORAGE_KEY);
    }
    if (legacySelector) {
      store.selection.pendingProfileId = String(legacySelector.pendingProfileId || "");
      store.selection.promptOnNewThread = legacySelector.promptOnNewThread !== false;
      if (isObject(legacySelector.threadProfiles)) {
        store.bindingsByThread = cloneJson(legacySelector.threadProfiles);
      }
      store.migration.sources.push(LEGACY_SELECTOR_STORAGE_KEY);
    }
    store.migration.completed = true;
    store.migration.migratedAt = new Date().toISOString();
    return store;
  }

  function loadEnvironmentStore() {
    const existing = parseStoredJson(STORAGE_KEY);
    if (existing?.schemaVersion === STATE_VERSION) return normalizeEnvironmentStore(existing);
    const migrated = normalizeEnvironmentStore(migrateLegacyEnvironmentStore());
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated)); } catch {}
    return migrated;
  }

  function saveEnvironmentStore() {
    environmentStore.revision = Number(environmentStore.revision || 0) + 1;
    environmentStore.updatedAt = new Date().toISOString();
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(environmentStore)); } catch {}
    if (typeof CustomEvent === "function") window.dispatchEvent(new CustomEvent(UPDATE_EVENT));
  }

  let environmentStore = loadEnvironmentStore();
  dialogExpanded = environmentStore.ui?.panelExpanded === true;

  function studioProfiles() {
    const values = Object.values(environmentStore.profiles || {});
    return values.slice(0, 60).flatMap((item) => {
      if (!isObject(item)) return [];
      const rawId = String(item.id || "").trim();
      if (!/^[A-Za-z0-9_-]+$/.test(rawId)) return [];
      const instructions = typeof item.developerInstructions === "string"
        ? item.developerInstructions
        : "";
      if (instructions.length > 40000) return [];
      const requestedTarget = String(item.targetProfileId || "").trim();
      const targetProfileId = staticProfileIds.has(requestedTarget) ? requestedTarget : "";
      return [{
        id: targetProfileId || `studio:${rawId}`,
        name: String(item.displayName || item.name || rawId).trim() || rawId,
        model: String(item.model || ""),
        modelProvider: String(item.modelProvider || ""),
        config: isObject(item.config) ? cloneJson(item.config) : {},
        developerInstructions: instructions,
        baseInstructions: typeof item.baseInstructions === "string" ? item.baseInstructions : "",
        approvalPolicy: String(item.approvalPolicy || ""),
        sandbox: String(item.sandbox || ""),
        serviceTier: String(item.serviceTier || ""),
        memoryPolicy: isObject(item.memoryPolicy) ? cloneJson(item.memoryPolicy) : {},
        source: targetProfileId ? "studio-override" : "studio",
        sourceProfileId: targetProfileId,
      }];
    });
  }

  function refreshProfileCatalog() {
    const catalog = [
      { id: "base", name: "Base", model: "", modelProvider: "", config: {}, source: "base" },
      ...staticProfiles.map((profile) => ({ ...profile, source: profile.source || "file" })),
    ];
    const indexes = new Map(catalog.map((profile, index) => [profile.id, index]));
    for (const profile of studioProfiles()) {
      const existingIndex = indexes.get(profile.id);
      if (existingIndex === undefined) {
        indexes.set(profile.id, catalog.length);
        catalog.push(profile);
      } else {
        catalog[existingIndex] = profile;
      }
    }
    profiles = catalog;
    profileMap = new Map(profiles.map((profile) => [profile.id, profile]));
  }

  refreshProfileCatalog();

  function editableStaticProfiles() {
    return staticProfiles.map((profile) => JSON.parse(JSON.stringify({
      ...profile,
      source: profile.source || "file",
      sourceFileName: profile.sourceFileName || `${profile.id}.config.toml`,
    })));
  }

  function validProfileId(value) {
    const id = String(value || "");
    return profileMap.has(id) ? id : "base";
  }

  function profileById(value) {
    return profileMap.get(validProfileId(value)) || profileMap.get("base");
  }

  function defaultState() {
    return {
      version: STATE_VERSION,
      pendingProfileId: "",
      promptOnNewThread: true,
      threadProfiles: {},
      proofByThread: {},
    };
  }

  function loadState() {
    const next = defaultState();
    next.pendingProfileId = environmentStore.selection.pendingProfileId
      ? validProfileId(environmentStore.selection.pendingProfileId)
      : "";
    next.promptOnNewThread = environmentStore.selection.promptOnNewThread !== false;
    next.threadProfiles = isObject(environmentStore.bindingsByThread)
      ? cloneJson(environmentStore.bindingsByThread)
      : {};
    next.proofByThread = isObject(environmentStore.proofByThread)
      ? cloneJson(environmentStore.proofByThread)
      : {};
    return next;
  }

  let state = loadState();

  function saveState() {
    const entries = Object.entries(state.threadProfiles || {})
      .filter(([, item]) => isObject(item) && profileMap.has(String(item.profileId || "")))
      .sort((left, right) => Number(right[1]?.at || 0) - Number(left[1]?.at || 0))
      .slice(0, MAX_THREAD_ENTRIES);
    state.threadProfiles = Object.fromEntries(entries);
    environmentStore.selection = {
      pendingProfileId: state.pendingProfileId,
      promptOnNewThread: state.promptOnNewThread,
    };
    environmentStore.bindingsByThread = cloneJson(state.threadProfiles);
    environmentStore.proofByThread = cloneJson(state.proofByThread || {});
    saveEnvironmentStore();
    updatePill();
  }

  function normalizedThreadId(value) {
    const text = String(value || "").trim();
    if (!text || text.length > 180) return "";
    return text.startsWith("local:") ? text.slice("local:".length) : text;
  }

  function currentThreadId() {
    const direct = [
      document.querySelector('[data-app-action-sidebar-thread-id][aria-current="page"]')?.getAttribute("data-app-action-sidebar-thread-id"),
      document.querySelector('[data-app-action-sidebar-thread-id][data-state="active"]')?.getAttribute("data-app-action-sidebar-thread-id"),
      document.querySelector('[data-app-action-sidebar-thread-id].active')?.getAttribute("data-app-action-sidebar-thread-id"),
    ].map(normalizedThreadId).find(Boolean);
    if (direct) return direct;
    const match = String(location.href).match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
    return normalizedThreadId(match?.[0]);
  }

  function threadProfileEntry(threadId = currentThreadId()) {
    const id = normalizedThreadId(threadId);
    if (!id) return null;
    const entry = state.threadProfiles[id] || state.threadProfiles[`local:${id}`];
    if (!isObject(entry)) return null;
    return { ...entry, profileId: validProfileId(entry.profileId) };
  }

  function threadProfileId(threadId = currentThreadId()) {
    return threadProfileEntry(threadId)?.profileId || "";
  }

  function bindThreadProfile(threadId, profileId, metadata = {}) {
    const id = normalizedThreadId(threadId);
    if (!id) return;
    const entry = {
      profileId: validProfileId(profileId),
      at: Date.now(),
      source: String(metadata.source || "dispatcher"),
    };
    if (metadata.applied === true || metadata.applied === false) entry.applied = metadata.applied;
    if (metadata.proofId) entry.proofId = String(metadata.proofId);
    state.threadProfiles[id] = entry;
    saveState();
  }

  function discardPrewarmedThreads() {
    for (const controller of environmentControllers) {
      const manager = ownValue(controller, "prewarmedThreadManager");
      const discard = callableMember(manager, "discardAllPrewarmedThreads")?.descriptor?.value;
      if (typeof discard !== "function") continue;
      try {
        discard.call(manager);
        traceRequest("prewarmed-threads-discarded", { typeNames: objectTypeNames(controller).slice(0, 2) });
      } catch (error) {
        traceRequest("prewarm-discard-error", { error: String(error?.message || error) });
      }
    }
  }

  function setPendingProfile(profileId) {
    const nextProfileId = validProfileId(profileId);
    if (state.pendingProfileId !== nextProfileId) discardPrewarmedThreads();
    state.pendingProfileId = nextProfileId;
    saveState();
  }

  function consumePendingProfile(profileId) {
    if (state.pendingProfileId === profileId) {
      state.pendingProfileId = "";
      saveState();
    }
  }

  function profileDisplayName(profileId) {
    return String(profileById(profileId)?.name || profileId || "Base");
  }

  function pillLabel() {
    const currentId = currentThreadId();
    const currentProfile = threadProfileId(currentId);
    if (currentId && currentProfile) return `当前环境: ${profileDisplayName(currentProfile)}`;
    if (state.pendingProfileId) return `下次环境: ${profileDisplayName(state.pendingProfileId)}`;
    return "环境: Base";
  }

  function uiSnapshot() {
    const status = publicStatus();
    const currentId = currentThreadId();
    const currentProfileId = threadProfileId(currentId) || "base";
    return cloneJson({
      status,
      profiles,
      currentProfile: profileById(currentProfileId),
      environmentStore,
      environmentSnapshot: ENVIRONMENT_BUNDLE.environment || {},
      bridgeAgents,
      bridgeMemory,
    });
  }

  function notifyUiAdapter() {
    try { uiAdapter?.update?.(uiSnapshot()); } catch {}
  }

  function attachUiAdapter(adapter) {
    if (!adapter || typeof adapter !== "object" || typeof adapter.chooseProfile !== "function") {
      throw new TypeError("Environment Injector UI adapter is invalid");
    }
    if (uiAdapter && uiAdapter !== adapter) {
      try { uiAdapter.destroy?.(); } catch {}
    }
    uiAdapter = adapter;
    if (pill) pill.hidden = true;
    if (panel) panel.hidden = true;
    notifyUiAdapter();
    return () => {
      if (uiAdapter !== adapter) return;
      uiAdapter = null;
      if (pill) pill.hidden = false;
      updatePill();
    };
  }

  function updatePill() {
    if (pill) {
      pill.textContent = pillLabel();
      pill.title = "打开环境注入器：环境、当前会话、Memories 与 AGENTS.md";
    }
    if (panelMode === "current" && panel && !panel.hidden) {
      const threadId = currentThreadId();
      const entry = threadProfileEntry(threadId);
      const identity = [threadId, entry?.profileId || "base", String(entry?.applied), state.pendingProfileId].join("|");
      if (identity !== currentRenderIdentity) renderCurrentProfileView();
    }
    notifyUiAdapter();
  }

  function showToast(message, kind = "info") {
    if (uiAdapter?.showToast) {
      try { uiAdapter.showToast(String(message || ""), kind); } catch {}
      return;
    }
    if (!toastNode) return;
    toastNode.textContent = String(message || "");
    toastNode.dataset.kind = kind;
    toastNode.hidden = false;
    window.clearTimeout(showToast.timer);
    showToast.timer = window.setTimeout(() => {
      if (toastNode) toastNode.hidden = true;
    }, 2600);
  }

  function closeChooser(value = null) {
    if (panel) panel.hidden = true;
    const chooser = activeChooser;
    activeChooser = null;
    chooser?.resolve?.(value);
  }

  function renderProfileOptions() {
    if (!optionsRoot) return;
    optionsRoot.replaceChildren();
    for (const profile of profiles) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "profile-option";
      button.dataset.profileId = profile.id;
      button.dataset.selected = String(state.pendingProfileId === profile.id);
      button.setAttribute("aria-pressed", String(state.pendingProfileId === profile.id));

      const text = document.createElement("span");
      text.className = "profile-option-text";
      const title = document.createElement("strong");
      title.textContent = profile.name;
      const details = document.createElement("small");
      const detailParts = [];
      if (profile.id === "base") detailParts.push("全局基础配置");
      else if (profile.source === "file") detailParts.push("文件 Profile");
      else if (profile.source === "studio-override") detailParts.push("本地覆盖");
      else if (profile.source === "studio") detailParts.push("工坊 Profile");
      if (profile.model) detailParts.push(profile.model);
      if (profile.modelProvider) detailParts.push(profile.modelProvider);
      details.textContent = detailParts.join(" · ") || "会话配置覆盖";
      text.append(title, details);

      const check = document.createElement("span");
      check.className = "profile-check";
      check.textContent = state.pendingProfileId === profile.id ? "✓" : "";
      button.append(text, check);
      button.addEventListener("click", () => closeChooser(profile.id), { signal });
      optionsRoot.append(button);
    }
  }

  function appendMetaRow(root, label, value) {
    const row = document.createElement("div");
    row.className = "current-meta-row";
    const key = document.createElement("span");
    key.textContent = label;
    const data = document.createElement("code");
    data.textContent = String(value || "继承 / 未设置");
    row.append(key, data);
    root.append(row);
  }

  function createDisclosureSection(title, content, options = {}) {
    const key = String(options.key || title);
    const initialOpen = disclosureState.has(key) ? disclosureState.get(key) === true : options.open === true;
    const section = document.createElement("section");
    section.className = `current-section${options.className ? ` ${options.className}` : ""}`;
    section.dataset.open = String(initialOpen);
    const trigger = document.createElement("button");
    trigger.type = "button";
    trigger.className = "current-section-trigger";
    trigger.setAttribute("aria-expanded", String(initialOpen));
    const heading = document.createElement("span");
    heading.className = "current-section-title";
    heading.textContent = title;
    const end = document.createElement("span");
    end.className = "current-section-end";
    const meta = document.createElement("span");
    meta.className = "current-section-meta";
    meta.textContent = String(options.meta || "");
    const chevron = document.createElement("span");
    chevron.className = "current-section-chevron";
    chevron.setAttribute("aria-hidden", "true");
    chevron.textContent = "⌄";
    end.append(meta, chevron);
    trigger.append(heading, end);
    const body = document.createElement("div");
    body.className = "current-section-body";
    body.hidden = !initialOpen;
    body.append(content);
    const setOpen = (open) => {
      disclosureState.set(key, open);
      section.dataset.open = String(open);
      trigger.setAttribute("aria-expanded", String(open));
      body.hidden = !open;
    };
    trigger.addEventListener("click", () => setOpen(trigger.getAttribute("aria-expanded") !== "true"), { signal });
    section.append(trigger, body);
    return section;
  }

  function appendInspectionSection(root, title, text, emptyText, open = false) {
    const value = text ? String(text) : "";
    const body = document.createElement("pre");
    body.textContent = value || emptyText;
    if (!value) body.dataset.empty = "true";
    const meta = value
      ? `${Math.max(1, value.split("\n").length)} 行`
      : "未设置";
    const keyPrefix = root?.className || "inspection";
    root.append(createDisclosureSection(title, body, {
      key: `${keyPrefix}:${title}`,
      open,
      meta,
    }));
  }

  function currentBindingStatus(entry, threadId) {
    if (!threadId) {
      return { kind: "draft", label: "新对话草稿", detail: "尚未创建 thread；可查看下次待选 Profile。" };
    }
    if (!entry) {
      return { kind: "base", label: "未由选择器管理", detail: "该会话没有 Profile 绑定记录，按 Base / Codex 全局配置运行。" };
    }
    if (entry.applied === true) {
      return { kind: "confirmed", label: "已确认注入", detail: "选择器通过兼容的 thread 生命周期通道完成并记录了注入。" };
    }
    if (entry.applied === false) {
      return { kind: "unconfirmed", label: "已选择 · 未确认注入", detail: "当前是 direct-RPC 通道；下方显示计划注入内容，不代表 Codex 最终已采用。" };
    }
    return { kind: "unknown", label: "旧版绑定 · 状态未知", detail: "存在历史 Profile 记录，但旧数据没有保存注入确认状态。" };
  }

  function renderCurrentProfileView() {
    if (!currentRoot) return;
    currentRoot.replaceChildren();
    const threadId = currentThreadId();
    const entry = threadProfileEntry(threadId);
    const profileId = entry?.profileId || "base";
    const profile = profileById(profileId);
    const proof = threadId && isObject(state.proofByThread?.[threadId])
      ? state.proofByThread[threadId]
      : null;
    const status = currentBindingStatus(entry, threadId);
    currentRenderIdentity = [threadId, profileId, String(entry?.applied), proof?.status || "", state.pendingProfileId].join("|");

    const hero = document.createElement("section");
    hero.className = "current-hero";
    hero.dataset.kind = status.kind;
    const heroTop = document.createElement("div");
    heroTop.className = "current-hero-top";
    const heroText = document.createElement("div");
    const eyebrow = document.createElement("span");
    eyebrow.className = "current-eyebrow";
    eyebrow.textContent = threadId ? "当前会话环境" : "当前状态";
    const name = document.createElement("strong");
    name.textContent = profile?.name || profileId || "Base";
    heroText.append(eyebrow, name);
    const badge = document.createElement("span");
    badge.className = "current-status-badge";
    badge.textContent = status.label;
    heroTop.append(heroText, badge);
    const detail = document.createElement("p");
    detail.textContent = status.detail;
    hero.append(heroTop, detail);
    if (threadId) {
      const id = document.createElement("code");
      id.className = "current-thread-id";
      id.textContent = threadId;
      hero.append(id);
    }
    currentRoot.append(hero);

    if (state.pendingProfileId) {
      const pending = document.createElement("section");
      pending.className = "current-pending";
      const pendingLabel = document.createElement("span");
      pendingLabel.textContent = "下个新对话";
      const pendingName = document.createElement("strong");
      pendingName.textContent = profileDisplayName(state.pendingProfileId);
      pending.append(pendingLabel, pendingName);
      currentRoot.append(pending);
    }

    const meta = document.createElement("section");
    meta.className = "current-meta";
    appendMetaRow(meta, "环境 ID", profile?.id || "base");
    appendMetaRow(meta, "模型", profile?.model);
    appendMetaRow(meta, "Provider", profile?.modelProvider);
    appendMetaRow(meta, "推理强度", profile?.config?.model_reasoning_effort);
    appendMetaRow(meta, "审批策略", profile?.approvalPolicy);
    appendMetaRow(meta, "沙箱", profile?.sandbox);
    appendMetaRow(meta, "Service tier", profile?.serviceTier);
    appendMetaRow(meta, "Memory 使用", profile?.memoryPolicy?.use || "继承");
    appendMetaRow(meta, "Memory 生成", profile?.memoryPolicy?.generate || "继承");
    appendMetaRow(meta, "注入证明", proof?.status || (entry ? "无 proof" : "未绑定"));
    appendMetaRow(meta, "传输通道", proof?.transport || entry?.source || "Base");
    currentRoot.append(meta);

    const developerInstructions = typeof profile?.developerInstructions === "string"
      ? profile.developerInstructions
      : "";
    const baseInstructions = typeof profile?.baseInstructions === "string"
      ? profile.baseInstructions
      : "";
    const config = isObject(profile?.config) && Object.keys(profile.config).length
      ? JSON.stringify(profile.config, null, 2)
      : "";
    appendInspectionSection(
      currentRoot,
      `Developer Instructions${developerInstructions ? ` · ${developerInstructions.length} 字符` : ""}`,
      developerInstructions,
      "该 Profile 没有会话级 Developer Instructions。",
      Boolean(developerInstructions),
    );
    appendInspectionSection(
      currentRoot,
      `Base Instructions${baseInstructions ? ` · ${baseInstructions.length} 字符` : ""}`,
      baseInstructions,
      "该 Profile 没有覆盖 Base Instructions。",
    );
    appendInspectionSection(
      currentRoot,
      "环境 Config JSON",
      config,
      "该 Profile 没有额外 config 覆盖。",
    );
    appendInspectionSection(
      currentRoot,
      "Injection Proof",
      proof ? JSON.stringify(proof, null, 2) : "",
      "当前会话没有可验证的注入证明。",
    );

    const note = document.createElement("p");
    note.className = "current-note";
    note.textContent = "这里展示选择器记录和 Profile 计划注入内容；Codex 最终合成的完整系统提示词属于内部运行态，用户脚本无法可靠读取。";
    currentRoot.append(note);
  }

  function createEnvironmentHeading(title, detail) {
    const root = document.createElement("section");
    root.className = "environment-heading";
    const heading = document.createElement("strong");
    heading.textContent = title;
    const description = document.createElement("p");
    description.textContent = detail;
    root.append(heading, description);
    return root;
  }

  function createEnvironmentButton(label, onClick, primary = false) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = primary ? "environment-action primary" : "environment-action";
    button.textContent = label;
    button.addEventListener("click", onClick, { signal });
    return button;
  }

  async function copyEnvironmentText(text, successMessage) {
    try {
      await navigator.clipboard.writeText(String(text || ""));
      showToast(successMessage || "已复制");
    } catch {
      showToast("复制失败，请手动选择文本", "error");
    }
  }

  function downloadEnvironmentText(name, text, type = "text/plain") {
    const blob = new Blob([String(text || "")], { type: `${type};charset=utf-8` });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = name;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function renderMemoryView() {
    if (!memoryRoot) return;
    memoryRoot.replaceChildren();
    const snapshotMemory = ENVIRONMENT_BUNDLE.environment?.memory || {};
    const memory = bridgeMemory ? { ...snapshotMemory, ...bridgeMemory, settings: snapshotMemory.settings || {} } : snapshotMemory;
    const settings = isObject(memory.settings) ? memory.settings : {};
    const bridgeWritable = bridgeCapabilities?.diskWrite === true;
    memoryRoot.append(createEnvironmentHeading(
      "本地 Codex Memories",
      "查看生成时快照、控制策略，并准备经过审核的修正草案。不会静默改写生成记忆。",
    ));
    const meta = document.createElement("section");
    meta.className = "current-meta";
    appendMetaRow(meta, "总开关", settings.enabled === true ? "已开启" : "已关闭");
    appendMetaRow(meta, "读取记忆", settings.use_memories === false ? "关闭" : settings.use_memories === true ? "开启" : "继承");
    appendMetaRow(meta, "生成记忆", settings.generate_memories === false ? "关闭" : settings.generate_memories === true ? "开启" : "继承");
    appendMetaRow(meta, "外部上下文排除", settings.disable_on_external_context === true ? "开启" : "关闭 / 未设置");
    appendMetaRow(meta, "记忆文件", Array.isArray(memory.files) ? `${memory.files.length} 个` : "未知");
    appendMetaRow(meta, "写入能力", bridgeWritable ? "Bridge 可写 · diff/backup" : "只读快照 / 草案");
    memoryRoot.append(meta);
    appendInspectionSection(memoryRoot, "Memory Summary", memory.summary?.content || "", "没有 memory_summary.md 快照。", true);
    appendInspectionSection(memoryRoot, "Durable MEMORY.md", memory.durable?.content || "", "没有 MEMORY.md 快照。");

    const editor = document.createElement("section");
    editor.className = "environment-editor-card";
    const label = document.createElement("strong");
    label.textContent = "记忆修正草案";
    const help = document.createElement("p");
    help.textContent = "建议只写稳定事实和纠正项；角色、模型、Provider 与任务工作流应留在环境 Profile。";
    const textarea = document.createElement("textarea");
    textarea.className = "environment-editor";
    textarea.placeholder = "例如：\n- 稳定偏好：默认使用简体中文。\n- 纠正：领域记忆只在 cwd/任务匹配时使用。\n- 不要把某个 Profile 的角色推广为全局记忆。";
    textarea.value = String(environmentStore.ui?.memoryCorrectionDraft ?? memory.correction?.content ?? "");
    const actions = document.createElement("div");
    actions.className = "environment-actions";
    const previewStatus = document.createElement("p");
    previewStatus.className = "environment-preview-status";
    let preview = null;
    const commitButton = createEnvironmentButton("确认写入修正 Note", async () => {
      if (!preview) return;
      const expectedHash = preview.before?.hash;
      const result = await bridgeCall("/environment-injector/memory/commit-correction", {
        content: textarea.value,
        ...(typeof expectedHash === "string" ? { expectedHash } : {}),
      });
      if (result?.status === "conflict") {
        previewStatus.textContent = "源文件已变化，请重新预览。";
        previewStatus.dataset.kind = "error";
        commitButton.disabled = true;
        preview = null;
        return;
      }
      if (result?.status !== "ok") {
        previewStatus.textContent = result?.message || "写入失败";
        previewStatus.dataset.kind = "error";
        return;
      }
      delete environmentStore.ui.memoryCorrectionDraft;
      saveEnvironmentStore();
      showToast(`Memory 修正 Note 已写入；备份：${result.backup || "新文件"}`);
      await refreshBridgeState();
      renderMemoryView();
    }, true);
    commitButton.disabled = true;
    actions.append(
      createEnvironmentButton("保存草案", () => {
        environmentStore.ui.memoryCorrectionDraft = textarea.value;
        saveEnvironmentStore();
        showToast("记忆修正草案已保存（尚未写入 Memory）");
      }),
      createEnvironmentButton("复制草案", () => { void copyEnvironmentText(textarea.value, "记忆草案已复制"); }),
      createEnvironmentButton("预览写入", async () => {
        const expectedHash = memory.correction?.hash;
        const result = await bridgeCall("/environment-injector/memory/preview-correction", {
          content: textarea.value,
          ...(typeof expectedHash === "string" ? { expectedHash } : {}),
        });
        preview = result?.status === "ok" ? result : null;
        commitButton.disabled = !preview;
        previewStatus.dataset.kind = result?.status === "ok" ? "success" : "error";
        previewStatus.textContent = result?.status === "ok"
          ? `预览完成：+${result.diff?.addedLines || 0} / -${result.diff?.removedLines || 0} 行；确认后会先备份。`
          : result?.message || "预览失败";
      }),
      commitButton,
      createEnvironmentButton("复制 /memories", () => { void copyEnvironmentText("/memories", "已复制 /memories"); }),
    );
    if (!bridgeWritable) {
      for (const button of [actions.children[2], commitButton]) button.disabled = true;
    }
    editor.append(label, help, textarea, actions, previewStatus);
    memoryRoot.append(editor);
    const note = document.createElement("p");
    note.className = "current-note";
    note.textContent = bridgeWritable
      ? "Memory 写入仅限 Environment Injector 的 ad-hoc 修正 Note；必须先预览，并使用 hash 冲突检查、备份和原子写入。不会直接改写 MEMORY.md 或 raw_memories.md。"
      : "官方建议把这些文件视为生成状态。当前只能安全审阅和保存草案；安装原生 Bridge 后才开放受限写入。";
    memoryRoot.append(note);
  }

  function renderAgentsView() {
    if (!agentsRoot) return;
    agentsRoot.replaceChildren();
    const agents = bridgeAgents || ENVIRONMENT_BUNDLE.environment?.globalAgents || {};
    const bridgeWritable = bridgeCapabilities?.diskWrite === true;
    agentsRoot.append(createEnvironmentHeading(
      "全局 AGENTS.md",
      "用于每个仓库都必须稳定遵守的个人工作规则。项目级规则仍应写在项目自己的 AGENTS.md。",
    ));
    const meta = document.createElement("section");
    meta.className = "current-meta";
    appendMetaRow(meta, "文件", agents.name || "AGENTS.md");
    appendMetaRow(meta, "状态", agents.exists ? "已存在" : "未创建");
    appendMetaRow(meta, "大小", Number.isFinite(agents.size) ? `${agents.size} bytes` : "—");
    appendMetaRow(meta, "内容 Hash", agents.hash || "—");
    appendMetaRow(meta, "写入能力", bridgeWritable ? "Bridge 可写 · diff/backup" : "草案 / 导出");
    agentsRoot.append(meta);

    const editor = document.createElement("section");
    editor.className = "environment-editor-card";
    const label = document.createElement("strong");
    label.textContent = "AGENTS.md 草案";
    const help = document.createElement("p");
    help.textContent = "显式任务和选中环境应优先于泛化记忆；Memories 只作为背景事实。";
    const textarea = document.createElement("textarea");
    textarea.className = "environment-editor tall";
    textarea.value = String(environmentStore.ui?.agentsDraft ?? agents.content ?? "");
    const actions = document.createElement("div");
    actions.className = "environment-actions";
    const previewStatus = document.createElement("p");
    previewStatus.className = "environment-preview-status";
    let preview = null;
    const commitButton = createEnvironmentButton("确认写入 AGENTS.md", async () => {
      if (!preview) return;
      const expectedHash = preview.before?.hash;
      const result = await bridgeCall("/environment-injector/agents/commit", {
        content: textarea.value,
        ...(typeof expectedHash === "string" ? { expectedHash } : {}),
      });
      if (result?.status === "conflict") {
        previewStatus.textContent = "AGENTS.md 已被外部修改，请重新预览。";
        previewStatus.dataset.kind = "error";
        commitButton.disabled = true;
        preview = null;
        return;
      }
      if (result?.status !== "ok") {
        previewStatus.textContent = result?.message || "写入失败";
        previewStatus.dataset.kind = "error";
        return;
      }
      delete environmentStore.ui.agentsDraft;
      saveEnvironmentStore();
      showToast(`AGENTS.md 已写入；备份：${result.backup || "新文件"}`);
      await refreshBridgeState();
      renderAgentsView();
    }, true);
    commitButton.disabled = true;
    actions.append(
      createEnvironmentButton("保存草案", () => {
        environmentStore.ui.agentsDraft = textarea.value;
        saveEnvironmentStore();
        showToast("AGENTS.md 草案已保存（尚未写入磁盘）");
      }),
      createEnvironmentButton("复制", () => { void copyEnvironmentText(textarea.value, "AGENTS.md 草案已复制"); }),
      createEnvironmentButton("导出 AGENTS.md", () => downloadEnvironmentText("AGENTS.md", textarea.value, "text/markdown")),
      createEnvironmentButton("预览写入", async () => {
        const expectedHash = agents.hash;
        const result = await bridgeCall("/environment-injector/agents/preview", {
          content: textarea.value,
          ...(typeof expectedHash === "string" ? { expectedHash } : {}),
        });
        preview = result?.status === "ok" ? result : null;
        commitButton.disabled = !preview;
        previewStatus.dataset.kind = result?.status === "ok" ? "success" : "error";
        previewStatus.textContent = result?.status === "ok"
          ? `预览完成：+${result.diff?.addedLines || 0} / -${result.diff?.removedLines || 0} 行；确认后会先备份。`
          : result?.message || "预览失败";
      }),
      commitButton,
      createEnvironmentButton("恢复当前文件", () => {
        textarea.value = String(agents.content || "");
      }),
    );
    if (!bridgeWritable) {
      for (const button of [actions.children[3], commitButton]) button.disabled = true;
    }
    editor.append(label, help, textarea, actions, previewStatus);
    agentsRoot.append(editor);
    const note = document.createElement("p");
    note.className = "current-note";
    note.textContent = bridgeWritable
      ? "写入固定目标 ~/.codex/AGENTS.md；必须先预览，提交时校验 hash，并创建可恢复备份。"
      : "当前无原生 Bridge，不会直接覆盖 ~/.codex/AGENTS.md；可保存草案或导出。";
    agentsRoot.append(note);
  }

  function tutorialSection(title, paragraphs, open = false) {
    const content = document.createElement("div");
    content.className = "tutorial-section-body";
    for (const paragraph of paragraphs) {
      const item = document.createElement("p");
      item.textContent = paragraph;
      content.append(item);
    }
    return createDisclosureSection(title, content, {
      key: `tutorial:${title}`,
      open,
      meta: `${paragraphs.length} 项`,
      className: "tutorial-section",
    });
  }

  function renderTutorialView() {
    if (!tutorialRoot) return;
    tutorialRoot.replaceChildren();
    tutorialRoot.append(createEnvironmentHeading(
      "环境注入器使用教程",
      "从选择环境到检查 proof，再到 Memories、AGENTS 和恢复操作。所有写入都先预览，避免静默修改。",
    ));

    const quick = document.createElement("section");
    quick.className = "tutorial-quick-start";
    const steps = [
      ["1", "点击新对话", "环境选择器会在 Codex 真正创建 thread 前出现。"],
      ["2", "选择环境", "例如 work；只有这次新会话会收到模型、Provider、提示词和策略。"],
      ["3", "发送第一条消息", "环境注入器拦截 prewarm/thread/start 并等待 app-server 确认。"],
      ["4", "查看当前会话", "确认 applied=true、proof=acknowledged、Thread ID 和实际字段。"],
    ];
    for (const [number, title, detail] of steps) {
      const card = document.createElement("article");
      card.className = "tutorial-step";
      const badge = document.createElement("span");
      badge.textContent = number;
      const copy = document.createElement("div");
      const strong = document.createElement("strong");
      strong.textContent = title;
      const paragraph = document.createElement("p");
      paragraph.textContent = detail;
      copy.append(strong, paragraph);
      card.append(badge, copy);
      quick.append(card);
    }
    tutorialRoot.append(quick);

    tutorialRoot.append(
      tutorialSection("如何创建或修改环境", [
        "打开左侧“环境注入器”，选择已有文件环境，或创建新的本地环境。",
        "可配置模型、Provider、推理强度、Developer/Base Instructions、权限、Service Tier 和 Memory 策略。",
        "编辑文件环境时默认保存为本地覆盖，原 .config.toml 不会被直接改写；点击“恢复文件版本”即可撤销。",
      ], true),
      tutorialSection("如何判断注入是否真的生效", [
        "打开“当前会话”，不要只看环境名称。可靠证据必须同时包含当前 Thread ID、applied=true 和 acknowledged proof。",
        "transport 为 prewarm-thread-start-prototype 或 app-server-request-client-prototype，代表请求已通过真实 app-server 通道。",
        "observed-unconfirmed 只表示检测到了新 thread，不能视为注入成功；failed 会显示最近错误。",
      ]),
      tutorialSection("Memories 应该怎么用", [
        "Memories 适合稳定事实和偏好，不适合保存某个环境的角色、模型、Provider 或临时工作流。",
        "环境需要隔离时，将 Memory 读取和生成设为 off；例如可为 work 环境创建这种本地覆盖。",
        "Memory 页面只允许写入 Environment Injector 的 ad-hoc 修正 Note，不会直接重写生成的 MEMORY.md、memory_summary.md 或 raw_memories.md。",
      ]),
      tutorialSection("AGENTS.md、预览和恢复", [
        "AGENTS.md 用于所有项目都应遵守的稳定工作规则；项目特定规则仍写在项目自己的 AGENTS.md。",
        "点击“预览写入”后才会解锁确认按钮。提交时会校验 expected hash、创建备份并原子写入。",
        "如果显示 conflict，说明文件被外部修改；重新加载并再次预览，不要强行覆盖。备份可通过 bridge 的 backup/restore 路由恢复。",
      ]),
      tutorialSection("常见故障", [
        "没有弹出选择器：确认“新对话创建前询问”已开启，并检查旧 Profile 脚本是否仍被启用。",
        "显示未确认注入：重新打开新对话并发送第一条消息；检查 direct-RPC 适配器和 requestTrace。",
        "Memory/AGENTS 只能保存草案：说明原生 Bridge 未加载，应检查 capabilities 中 diskWrite 是否为 true。",
        "遇到 RpcTarget.sendRequest 错误：不要给 RpcTarget 实例赋值；环境注入器应只显示原型级适配器。",
      ]),
    );

    const actions = document.createElement("div");
    actions.className = "environment-actions tutorial-actions";
    actions.append(
      createEnvironmentButton("打开环境编辑器", () => window.__codexEnvironmentStudio?.open?.(), true),
      createEnvironmentButton("查看当前会话", () => setPanelMode("current")),
      createEnvironmentButton("复制诊断 JSON", () => { void copyEnvironmentText(JSON.stringify(publicStatus(), null, 2), "诊断已复制"); }),
    );
    tutorialRoot.append(actions);
  }

  function applyDialogExpanded() {
    if (dialogCard) dialogCard.dataset.expanded = String(dialogExpanded);
    if (panelExpandButton) {
      panelExpandButton.textContent = dialogExpanded ? "↙" : "↗";
      panelExpandButton.setAttribute("aria-label", dialogExpanded ? "恢复面板大小" : "最大化面板");
      panelExpandButton.title = dialogExpanded ? "恢复面板大小" : "最大化面板";
    }
  }

  function toggleDialogExpanded() {
    dialogExpanded = !dialogExpanded;
    environmentStore.ui.panelExpanded = dialogExpanded;
    saveEnvironmentStore();
    applyDialogExpanded();
  }

  function setPanelMode(mode) {
    panelMode = ["current", "memory", "agents", "tutorial"].includes(mode) ? mode : "select";
    if (dialogCard) dialogCard.dataset.mode = panelMode;
    if (selectTab) selectTab.dataset.active = String(panelMode === "select");
    if (currentTab) currentTab.dataset.active = String(panelMode === "current");
    if (memoryTab) memoryTab.dataset.active = String(panelMode === "memory");
    if (agentsTab) agentsTab.dataset.active = String(panelMode === "agents");
    if (tutorialTab) tutorialTab.dataset.active = String(panelMode === "tutorial");
    if (optionsRoot) optionsRoot.hidden = panelMode !== "select";
    if (currentRoot) currentRoot.hidden = panelMode !== "current";
    if (memoryRoot) memoryRoot.hidden = panelMode !== "memory";
    if (agentsRoot) agentsRoot.hidden = panelMode !== "agents";
    if (tutorialRoot) tutorialRoot.hidden = panelMode !== "tutorial";
    if (panelFooter) panelFooter.hidden = panelMode !== "select";
    const titles = {
      select: selectionTitle,
      current: "当前会话环境",
      memory: "Memories",
      agents: "AGENTS.md",
      tutorial: "使用教程",
    };
    const subtitles = {
      select: "选择只影响即将创建的对话",
      current: "查看绑定状态、计划注入与证明",
      memory: "审阅本地记忆策略与修正草案",
      agents: "维护稳定的全局工作规则草案",
      tutorial: "快速上手、证明判定与安全恢复",
    };
    if (panelTitle) panelTitle.textContent = titles[panelMode];
    if (panelSubtitle) panelSubtitle.textContent = subtitles[panelMode];
    if (panelMode === "current") renderCurrentProfileView();
    if (panelMode === "memory") renderMemoryView();
    if (panelMode === "agents") renderAgentsView();
    if (panelMode === "tutorial") renderTutorialView();
  }

  function chooseProfile(title = "选择环境") {
    if (uiAdapter?.chooseProfile) {
      return Promise.resolve(uiAdapter.chooseProfile(title, uiSnapshot()));
    }
    if (activeChooser) return activeChooser.promise;
    selectionTitle = title;
    renderProfileOptions();
    setPanelMode("select");
    if (promptCheckbox) promptCheckbox.checked = state.promptOnNewThread;
    if (panel) panel.hidden = false;
    let resolveChooser;
    const promise = new Promise((resolve) => {
      resolveChooser = resolve;
    });
    activeChooser = { promise, resolve: resolveChooser };
    window.setTimeout(() => {
      const preferred = optionsRoot?.querySelector('.profile-option[data-selected="true"]')
        || optionsRoot?.querySelector(".profile-option");
      preferred?.focus();
    }, 0);
    return promise;
  }

  function openEnvironmentView(mode, focusTarget) {
    if (uiAdapter?.open) {
      uiAdapter.open(mode, uiSnapshot());
      return Promise.resolve(null);
    }
    const alreadyOpen = activeChooser?.promise || null;
    const promise = alreadyOpen || chooseProfile("环境注入器");
    setPanelMode(mode);
    window.setTimeout(() => focusTarget?.focus(), 0);
    if (!alreadyOpen) {
      void promise.then((selected) => {
        if (!selected) return;
        setPendingProfile(selected);
        showToast(`下个新对话：${profileDisplayName(selected)}`);
      });
    }
    return promise;
  }

  function openCurrentProfileView() {
    return openEnvironmentView("current", currentTab);
  }

  function openMemoryView() {
    return openEnvironmentView("memory", memoryTab);
  }

  function openAgentsView() {
    return openEnvironmentView("agents", agentsTab);
  }

  function openTutorialView() {
    return openEnvironmentView("tutorial", tutorialTab);
  }

  function createUi() {
    document.getElementById(HOST_ID)?.remove();
    host = document.createElement("div");
    host.id = HOST_ID;
    host.style.position = "fixed";
    host.style.inset = "0";
    host.style.zIndex = "2147483000";
    host.style.pointerEvents = "none";
    shadow = host.attachShadow({ mode: "open" });

    const style = document.createElement("style");
    style.textContent = `
      :host { all: initial; color-scheme: light dark; }
      * { box-sizing: border-box; }
      .pill { position: fixed; right: 16px; bottom: 16px; z-index: 2; pointer-events: auto; appearance: none; border: 1px solid color-mix(in srgb, CanvasText 16%, transparent); border-radius: 999px; padding: 7px 11px; background: color-mix(in srgb, var(--color-surface, Canvas) 94%, transparent); color: var(--color-text, CanvasText); font: 600 12px/1.2 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; box-shadow: 0 6px 24px rgba(0,0,0,.18); cursor: pointer; backdrop-filter: blur(14px); transition: transform .16s ease, border-color .16s ease, background .16s ease; }
      .pill:hover { border-color: color-mix(in srgb, var(--color-token-primary, #3b82f6) 60%, transparent); transform: translateY(-1px); }
      .panel { position: fixed; inset: 0; z-index: 3; display: grid; place-items: center; padding: 16px; pointer-events: auto; background: rgba(0,0,0,.42); backdrop-filter: blur(3px); animation: cps-backdrop-in .16s ease-out; }
      .panel[hidden], .toast[hidden] { display: none; }
      .dialog { width: min(440px, calc(100vw - 24px)); max-height: min(760px, calc(100vh - 32px)); display: flex; flex-direction: column; overflow: hidden; border: 1px solid color-mix(in srgb, CanvasText 14%, transparent); border-radius: 18px; background: color-mix(in srgb, var(--color-surface, Canvas) 98%, transparent); color: var(--color-text, CanvasText); box-shadow: 0 24px 80px rgba(0,0,0,.38), 0 2px 10px rgba(0,0,0,.18); font: 13px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; animation: cps-dialog-in .18s cubic-bezier(.2,.8,.2,1); transition: width .18s ease, height .18s ease, max-height .18s ease, border-radius .18s ease; }
      .header { display: flex; align-items: flex-start; justify-content: space-between; gap: 14px; padding: 14px 16px 11px; border-bottom: 1px solid color-mix(in srgb, CanvasText 9%, transparent); }
      .header-copy { min-width: 0; }
      .header strong { display: block; font-size: 16px; line-height: 22px; font-weight: 650; letter-spacing: -.01em; }
      .header small { display: block; margin-top: 2px; color: color-mix(in srgb, CanvasText 58%, transparent); font-size: 11px; line-height: 15px; }
      .header-actions { flex: none; display: flex; align-items: center; gap: 4px; }
      .close { width: 28px; height: 28px; flex: none; display: grid; place-items: center; appearance: none; border: 0; border-radius: 8px; background: transparent; color: color-mix(in srgb, CanvasText 68%, transparent); font-size: 20px; line-height: 1; cursor: pointer; }
      .panel-expand { font-size: 16px; font-weight: 700; }
      .close:hover, .close:focus-visible { background: color-mix(in srgb, CanvasText 8%, transparent); color: CanvasText; outline: none; }
      .tabs { display: flex; align-items: center; gap: 3px; padding: 6px 8px 0; }
      .tab { appearance: none; border: 0; border-radius: 8px; padding: 6px 9px; background: transparent; color: color-mix(in srgb, CanvasText 58%, transparent); font: 600 12px/16px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; cursor: pointer; }
      .tab:hover, .tab:focus-visible { background: color-mix(in srgb, CanvasText 6%, transparent); color: CanvasText; outline: none; }
      .tab[data-active="true"] { background: color-mix(in srgb, CanvasText 9%, transparent); color: CanvasText; }
      .dialog:not([data-mode="select"]) { width: min(920px, calc(100vw - 24px)); height: min(820px, calc(100vh - 32px)); }
      .dialog[data-expanded="true"] { width: calc(100vw - 24px) !important; height: calc(100vh - 24px) !important; max-height: none; border-radius: 14px; }
      .options[hidden], .current-view[hidden], .memory-view[hidden], .agents-view[hidden], .tutorial-view[hidden], .footer[hidden] { display: none; }
      .options { min-height: 0; flex: 1 1 auto; display: grid; align-content: start; gap: 5px; padding: 10px; overflow-y: auto; overscroll-behavior: contain; }
      .current-view, .memory-view, .agents-view, .tutorial-view { min-height: 0; flex: 1 1 auto; display: grid; align-content: start; gap: 8px; padding: 10px 12px 12px; overflow-y: auto; overscroll-behavior: contain; }
      .current-view { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .current-view > :not(.current-section) { grid-column: 1 / -1; }
      .current-view > .current-section[data-open="true"] { grid-column: 1 / -1; }
      .environment-heading { display: grid; gap: 4px; padding: 2px 2px 4px; }
      .environment-heading strong { font-size: 14px; line-height: 20px; }
      .environment-heading p, .environment-editor-card p { margin: 0; color: color-mix(in srgb, CanvasText 56%, transparent); font-size: 10px; line-height: 16px; }
      .environment-editor-card { display: grid; gap: 8px; padding: 12px; border: 1px solid color-mix(in srgb, CanvasText 9%, transparent); border-radius: 11px; background: color-mix(in srgb, CanvasText 2.5%, transparent); }
      .environment-editor-card > strong { font-size: 12px; line-height: 17px; }
      .environment-editor { width: 100%; min-height: 130px; resize: vertical; border: 1px solid color-mix(in srgb, CanvasText 12%, transparent); border-radius: 9px; padding: 10px; background: color-mix(in srgb, CanvasText 2%, transparent); color: CanvasText; outline: none; font: 10px/16px ui-monospace, SFMono-Regular, Consolas, monospace; }
      .environment-editor.tall { min-height: clamp(170px, 30vh, 260px); }
      .environment-editor:focus { border-color: color-mix(in srgb, var(--color-token-primary, #3b82f6) 58%, transparent); }
      .environment-actions { display: flex; flex-wrap: wrap; gap: 7px; }
      .environment-action { appearance: none; border: 1px solid color-mix(in srgb, CanvasText 12%, transparent); border-radius: 8px; padding: 6px 9px; background: color-mix(in srgb, CanvasText 4%, transparent); color: CanvasText; font: 600 10px/15px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; cursor: pointer; }
      .environment-action:hover, .environment-action:focus-visible { background: color-mix(in srgb, CanvasText 8%, transparent); outline: none; }
      .environment-action.primary { border-color: color-mix(in srgb, var(--color-token-primary, #3b82f6) 55%, transparent); background: color-mix(in srgb, var(--color-token-primary, #3b82f6) 14%, transparent); }
      .environment-action:disabled { cursor: not-allowed; opacity: .38; }
      .environment-preview-status { min-height: 16px; margin: 0; color: color-mix(in srgb, CanvasText 52%, transparent); font-size: 10px; line-height: 15px; }
      .environment-preview-status[data-kind="success"] { color: #3fbf88; }
      .environment-preview-status[data-kind="error"] { color: #ef6b73; }
      .tutorial-quick-start { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
      .tutorial-step { min-width: 0; display: grid; grid-template-columns: 26px minmax(0, 1fr); gap: 9px; align-items: start; padding: 10px; border: 1px solid color-mix(in srgb, CanvasText 9%, transparent); border-radius: 10px; background: color-mix(in srgb, CanvasText 2.5%, transparent); }
      .tutorial-step > span { width: 24px; height: 24px; display: grid; place-items: center; border-radius: 50%; background: color-mix(in srgb, var(--color-token-primary, #3b82f6) 16%, transparent); color: var(--color-token-primary, #3b82f6); font-size: 11px; font-weight: 750; }
      .tutorial-step > div { min-width: 0; display: grid; gap: 2px; }
      .tutorial-step strong { font-size: 11px; line-height: 16px; }
      .tutorial-step p, .tutorial-section-body p { margin: 0; color: color-mix(in srgb, CanvasText 58%, transparent); font-size: 10px; line-height: 16px; }
      .tutorial-section-body { display: grid; gap: 7px; padding: 10px 11px 11px; }
      .tutorial-actions { position: sticky; bottom: -16px; padding: 10px 0 2px; background: linear-gradient(transparent, color-mix(in srgb, var(--color-surface, Canvas) 98%, transparent) 32%); }
      .current-hero { display: grid; gap: 6px; padding: 10px 12px; border: 1px solid color-mix(in srgb, CanvasText 10%, transparent); border-radius: 12px; background: color-mix(in srgb, CanvasText 3%, transparent); }
      .current-hero-top { display: flex; align-items: flex-start; justify-content: space-between; gap: 14px; }
      .current-hero-top > div { min-width: 0; display: grid; gap: 2px; }
      .current-eyebrow { color: color-mix(in srgb, CanvasText 52%, transparent); font-size: 10px; line-height: 14px; }
      .current-hero strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 15px; line-height: 20px; font-weight: 650; }
      .current-hero p { margin: 0; color: color-mix(in srgb, CanvasText 64%, transparent); font-size: 11px; line-height: 17px; }
      .current-status-badge { flex: none; padding: 3px 7px; border-radius: 999px; background: color-mix(in srgb, CanvasText 7%, transparent); color: color-mix(in srgb, CanvasText 72%, transparent); font-size: 10px; line-height: 15px; font-weight: 650; }
      .current-hero[data-kind="confirmed"] .current-status-badge { background: color-mix(in srgb, #22a06b 15%, transparent); color: #3fbf88; }
      .current-hero[data-kind="unconfirmed"] .current-status-badge, .current-hero[data-kind="unknown"] .current-status-badge { background: color-mix(in srgb, #d99124 16%, transparent); color: #d99124; }
      .current-hero[data-kind="draft"] .current-status-badge { background: color-mix(in srgb, var(--color-token-primary, #3b82f6) 14%, transparent); color: var(--color-token-primary, #3b82f6); }
      .current-thread-id { width: fit-content; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: color-mix(in srgb, CanvasText 54%, transparent); font: 10px/14px ui-monospace, SFMono-Regular, Consolas, monospace; }
      .current-pending { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 9px 11px; border-radius: 10px; background: color-mix(in srgb, var(--color-token-primary, #3b82f6) 8%, transparent); font-size: 11px; }
      .current-pending span { color: color-mix(in srgb, CanvasText 56%, transparent); }
      .current-pending strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .current-meta { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 5px; }
      .current-meta-row { min-width: 0; min-height: 36px; display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 6px 9px; border: 1px solid color-mix(in srgb, CanvasText 8%, transparent); border-radius: 9px; }
      .current-meta-row span { color: color-mix(in srgb, CanvasText 52%, transparent); font-size: 10px; }
      .current-meta-row code { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: CanvasText; font: 10px/14px ui-monospace, SFMono-Regular, Consolas, monospace; }
      .current-section { border: 1px solid color-mix(in srgb, CanvasText 9%, transparent); border-radius: 10px; overflow: hidden; background: color-mix(in srgb, CanvasText 1.5%, transparent); }
      .current-section-trigger { width: 100%; min-height: 38px; display: flex; align-items: center; justify-content: space-between; gap: 12px; appearance: none; border: 0; padding: 9px 11px; color: color-mix(in srgb, CanvasText 78%, transparent); background: color-mix(in srgb, CanvasText 3%, transparent); text-align: left; font: 600 11px/16px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; cursor: pointer; user-select: none; }
      .current-section-trigger:hover, .current-section-trigger:focus-visible { background: color-mix(in srgb, CanvasText 7%, transparent); color: CanvasText; outline: none; }
      .current-section-title { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .current-section-end { flex: none; display: inline-flex; align-items: center; gap: 7px; }
      .current-section-meta { color: color-mix(in srgb, CanvasText 45%, transparent); font-size: 9px; line-height: 14px; font-weight: 500; }
      .current-section-chevron { display: inline-block; color: color-mix(in srgb, CanvasText 58%, transparent); font-size: 15px; line-height: 14px; transform: rotate(-90deg); transform-origin: center; transition: transform .16s ease; }
      .current-section[data-open="true"] .current-section-chevron { transform: rotate(0deg); }
      .current-section-body[hidden] { display: none; }
      .current-section-body { border-top: 1px solid color-mix(in srgb, CanvasText 8%, transparent); animation: cps-disclosure-in .14s ease-out; }
      .current-section pre { max-height: min(42vh, 360px); margin: 0; padding: 11px; overflow: auto; white-space: pre-wrap; overflow-wrap: anywhere; background: color-mix(in srgb, CanvasText 2%, transparent); color: color-mix(in srgb, CanvasText 82%, transparent); font: 10px/16px ui-monospace, SFMono-Regular, Consolas, monospace; }
      .current-section pre[data-empty="true"] { color: color-mix(in srgb, CanvasText 45%, transparent); font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
      .current-note { margin: 0; color: color-mix(in srgb, CanvasText 48%, transparent); font-size: 10px; line-height: 16px; }
      .profile-option { width: 100%; min-height: 58px; display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 10px 12px; appearance: none; border: 1px solid transparent; border-radius: 11px; background: transparent; color: inherit; text-align: left; cursor: pointer; transition: border-color .14s ease, background .14s ease, transform .14s ease; }
      .profile-option:hover, .profile-option:focus-visible { border-color: color-mix(in srgb, CanvasText 11%, transparent); background: color-mix(in srgb, CanvasText 6%, transparent); outline: none; }
      .profile-option:active { transform: scale(.995); }
      .profile-option[data-selected="true"] { border-color: color-mix(in srgb, var(--color-token-primary, #3b82f6) 52%, transparent); background: color-mix(in srgb, var(--color-token-primary, #3b82f6) 11%, transparent); }
      .profile-option-text { min-width: 0; display: grid; gap: 3px; }
      .profile-option-text strong, .profile-option-text small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .profile-option-text strong { font-size: 13px; line-height: 18px; font-weight: 600; }
      .profile-option-text small { color: color-mix(in srgb, CanvasText 58%, transparent); font-size: 11px; line-height: 16px; }
      .profile-check { width: 22px; height: 22px; flex: none; display: grid; place-items: center; border: 1px solid color-mix(in srgb, CanvasText 18%, transparent); border-radius: 50%; color: transparent; font-size: 12px; font-weight: 800; }
      .profile-option[data-selected="true"] .profile-check { border-color: var(--color-token-primary, #3b82f6); background: var(--color-token-primary, #3b82f6); color: white; }
      .footer { display: grid; gap: 8px; padding: 12px 16px 15px; border-top: 1px solid color-mix(in srgb, CanvasText 9%, transparent); background: color-mix(in srgb, CanvasText 2.5%, transparent); }
      .toggle { display: flex; align-items: center; gap: 8px; width: fit-content; color: color-mix(in srgb, CanvasText 78%, transparent); font-size: 12px; cursor: pointer; }
      .toggle input { margin: 0; accent-color: var(--color-token-primary, #3b82f6); }
      .hint { color: color-mix(in srgb, CanvasText 52%, transparent); font-size: 10px; line-height: 15px; }
      .toast { position: fixed; right: 16px; bottom: 56px; z-index: 4; max-width: 340px; padding: 8px 10px; border-radius: 9px; background: #111827; color: #fff; font: 12px/1.35 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; box-shadow: 0 8px 28px rgba(0,0,0,.28); }
      .toast[data-kind="error"] { background: #991b1b; }
      @keyframes cps-backdrop-in { from { opacity: 0; } to { opacity: 1; } }
      @keyframes cps-dialog-in { from { opacity: 0; transform: translateY(8px) scale(.985); } to { opacity: 1; transform: translateY(0) scale(1); } }
      @keyframes cps-disclosure-in { from { opacity: 0; transform: translateY(-3px); } to { opacity: 1; transform: translateY(0); } }
      @media (max-width: 760px) { .current-view { grid-template-columns: 1fr; } .current-view > .current-section { grid-column: 1; } .current-meta { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
      @media (max-width: 560px) { .panel { padding: 8px; } .dialog { width: calc(100vw - 16px); max-height: calc(100vh - 16px); border-radius: 14px; } .dialog:not([data-mode="select"]), .dialog[data-expanded="true"] { width: calc(100vw - 16px) !important; height: calc(100vh - 16px) !important; } .header { padding: 11px 12px 9px; } .tabs { overflow-x: auto; padding-inline: 6px; } .options { padding: 7px; } .current-view, .memory-view, .agents-view, .tutorial-view { padding: 8px; } .current-meta, .tutorial-quick-start { grid-template-columns: 1fr; } }
      @media (prefers-reduced-motion: reduce) { .panel, .dialog, .pill, .profile-option, .current-section-body { animation: none; transition: none; } .current-section-chevron { transition: none; } }
    `;

    pill = document.createElement("button");
    pill.type = "button";
    pill.className = "pill";
    pill.addEventListener("click", async () => {
      const selected = await chooseProfile("下个新对话环境");
      if (!selected) return;
      setPendingProfile(selected);
      showToast(`下个新对话：${profileDisplayName(selected)}`);
    }, { signal });

    panel = document.createElement("div");
    panel.className = "panel";
    panel.hidden = true;
    dialogCard = document.createElement("section");
    dialogCard.className = "dialog";
    dialogCard.setAttribute("role", "dialog");
    dialogCard.setAttribute("aria-modal", "true");
    dialogCard.setAttribute("aria-label", "环境注入器");
    const header = document.createElement("div");
    header.className = "header";
    const headerCopy = document.createElement("div");
    headerCopy.className = "header-copy";
    panelTitle = document.createElement("strong");
    panelTitle.textContent = "环境注入器";
    panelSubtitle = document.createElement("small");
    panelSubtitle.textContent = "选择只影响即将创建的对话";
    headerCopy.append(panelTitle, panelSubtitle);
    const headerActions = document.createElement("div");
    headerActions.className = "header-actions";
    panelExpandButton = document.createElement("button");
    panelExpandButton.type = "button";
    panelExpandButton.className = "close panel-expand";
    panelExpandButton.addEventListener("click", toggleDialogExpanded, { signal });
    const close = document.createElement("button");
    close.type = "button";
    close.className = "close";
    close.textContent = "×";
    close.setAttribute("aria-label", "关闭");
    close.addEventListener("click", () => closeChooser(null), { signal });
    headerActions.append(panelExpandButton, close);
    header.append(headerCopy, headerActions);
    header.addEventListener("dblclick", (event) => {
      if (!(event.target instanceof Element) || !event.target.closest("button")) toggleDialogExpanded();
    }, { signal });
    applyDialogExpanded();

    const tabs = document.createElement("div");
    tabs.className = "tabs";
    selectTab = document.createElement("button");
    selectTab.type = "button";
    selectTab.className = "tab";
    selectTab.textContent = "选择环境";
    selectTab.addEventListener("click", () => setPanelMode("select"), { signal });
    currentTab = document.createElement("button");
    currentTab.type = "button";
    currentTab.className = "tab";
    currentTab.textContent = "当前会话";
    currentTab.addEventListener("click", () => setPanelMode("current"), { signal });
    memoryTab = document.createElement("button");
    memoryTab.type = "button";
    memoryTab.className = "tab";
    memoryTab.textContent = "Memories";
    memoryTab.addEventListener("click", () => setPanelMode("memory"), { signal });
    agentsTab = document.createElement("button");
    agentsTab.type = "button";
    agentsTab.className = "tab";
    agentsTab.textContent = "AGENTS.md";
    agentsTab.addEventListener("click", () => setPanelMode("agents"), { signal });
    tutorialTab = document.createElement("button");
    tutorialTab.type = "button";
    tutorialTab.className = "tab";
    tutorialTab.textContent = "教程";
    tutorialTab.addEventListener("click", () => setPanelMode("tutorial"), { signal });
    tabs.append(selectTab, currentTab, memoryTab, agentsTab, tutorialTab);

    optionsRoot = document.createElement("div");
    optionsRoot.className = "options";
    currentRoot = document.createElement("div");
    currentRoot.className = "current-view";
    currentRoot.hidden = true;
    memoryRoot = document.createElement("div");
    memoryRoot.className = "memory-view";
    memoryRoot.hidden = true;
    agentsRoot = document.createElement("div");
    agentsRoot.className = "agents-view";
    agentsRoot.hidden = true;
    tutorialRoot = document.createElement("div");
    tutorialRoot.className = "tutorial-view";
    tutorialRoot.hidden = true;
    panelFooter = document.createElement("div");
    panelFooter.className = "footer";
    const toggle = document.createElement("label");
    toggle.className = "toggle";
    promptCheckbox = document.createElement("input");
    promptCheckbox.type = "checkbox";
    promptCheckbox.checked = state.promptOnNewThread;
    promptCheckbox.addEventListener("change", () => {
      state.promptOnNewThread = promptCheckbox.checked;
      saveState();
    }, { signal });
    const toggleText = document.createElement("span");
    toggleText.textContent = "新对话创建前询问";
    toggle.append(promptCheckbox, toggleText);
    const hint = document.createElement("div");
    hint.className = "hint";
    hint.textContent = "仅写入本次 thread/start/resume，不修改全局 config.toml。";
    panelFooter.append(toggle, hint);
    dialogCard.append(header, tabs, optionsRoot, currentRoot, memoryRoot, agentsRoot, tutorialRoot, panelFooter);
    setPanelMode("select");
    panel.append(dialogCard);
    panel.addEventListener("pointerdown", (event) => {
      if (event.target === panel) closeChooser(null);
    }, { signal });

    toastNode = document.createElement("div");
    toastNode.className = "toast";
    toastNode.hidden = true;

    shadow.append(style, panel, toastNode, pill);
    document.documentElement.append(host);
    updatePill();
  }

  function newChatTrigger(node) {
    if (!(node instanceof Element) || host?.contains(node) || uiAdapter?.contains?.(node)) return null;
    const target = node.closest('button,a,[role="button"]');
    if (!(target instanceof Element) || host?.contains(target) || uiAdapter?.contains?.(target)) return null;
    const text = [
      target.getAttribute("aria-label"),
      target.getAttribute("title"),
      target.getAttribute("data-testid"),
      target.textContent,
    ].filter(Boolean).join(" ").replace(/\s+/g, " ").trim().toLowerCase();
    if (/(^|\s)(new chat|new thread|new conversation)(\s|$)/i.test(text)) return target;
    if (/(新建对话|新对话|新建会话|新会话)/u.test(text)) return target;
    return null;
  }

  async function interceptNewChat(event) {
    const target = newChatTrigger(event.target);
    if (!target || replayTargets.has(target) || !state.promptOnNewThread) return;
    // A pending Profile is merely the preselected option. Newer direct-RPC
    // Codex builds may retain it across drafts, so it must never suppress the
    // explicit "ask before every new conversation" behavior.
    event.preventDefault();
    event.stopImmediatePropagation();
    const selected = await chooseProfile("为新对话选择环境");
    if (!selected || destroyed) return;
    pendingThreadObservation = {
      profileId: validProfileId(selected),
      previousThreadId: currentThreadId(),
      at: Date.now(),
    };
    setPendingProfile(selected);
    replayTargets.add(target);
    try {
      target.click();
      for (const delay of [0, 250, 900]) {
        window.setTimeout(() => { void scanClients(); }, delay);
      }
    } finally {
      window.setTimeout(() => replayTargets.delete(target), 0);
    }
  }

  function deepMerge(base, overlay) {
    if (!isObject(base)) base = {};
    const result = { ...base };
    for (const [key, value] of Object.entries(overlay || {})) {
      result[key] = isObject(value) && isObject(result[key])
        ? deepMerge(result[key], value)
        : value;
    }
    return result;
  }

  function applyProfileToParams(params, profile) {
    if (!profile || profile.id === "base" || !isObject(params)) return params;
    const next = { ...params };
    if (isObject(profile.config) && Object.keys(profile.config).length > 0) {
      next.config = deepMerge(isObject(next.config) ? next.config : {}, profile.config);
    }
    if (isObject(profile.memoryPolicy)) {
      const memoryOverrides = {};
      if (profile.memoryPolicy.use === "on" || profile.memoryPolicy.use === "off") {
        memoryOverrides.use_memories = profile.memoryPolicy.use === "on";
      }
      if (profile.memoryPolicy.generate === "on" || profile.memoryPolicy.generate === "off") {
        memoryOverrides.generate_memories = profile.memoryPolicy.generate === "on";
      }
      if (Object.keys(memoryOverrides).length) {
        next.config = deepMerge(isObject(next.config) ? next.config : {}, { memories: memoryOverrides });
      }
    }
    if (profile.model) next.model = profile.model;
    if (profile.modelProvider) next.modelProvider = profile.modelProvider;
    if (typeof profile.developerInstructions === "string") {
      next.developerInstructions = profile.developerInstructions;
    }
    if (typeof profile.baseInstructions === "string") {
      next.baseInstructions = profile.baseInstructions;
    }
    const hasUnifiedPermissions = Object.hasOwn(next, "permissions") && next.permissions != null;
    if (profile.approvalPolicy && !hasUnifiedPermissions) next.approvalPolicy = profile.approvalPolicy;
    if (profile.sandbox && !hasUnifiedPermissions) next.sandbox = profile.sandbox;
    if (profile.serviceTier) next.serviceTier = profile.serviceTier;
    return next;
  }

  function markInjectedParams(params) {
    if (!isObject(params)) return params;
    try {
      Object.defineProperty(params, INJECTED_PARAMS_MARK, { value: true, configurable: true });
    } catch {}
    return params;
  }

  function injectedFieldsFromParams(before, after) {
    const fields = [];
    for (const key of [
      "config",
      "model",
      "modelProvider",
      "developerInstructions",
      "baseInstructions",
      "approvalPolicy",
      "sandbox",
      "serviceTier",
    ]) {
      if (!Object.hasOwn(after || {}, key)) continue;
      let same = false;
      try { same = JSON.stringify(before?.[key]) === JSON.stringify(after?.[key]); } catch {}
      if (!same) fields.push(key);
    }
    return fields;
  }

  function canonicalizeForDigest(value) {
    if (Array.isArray(value)) return value.map(canonicalizeForDigest);
    if (!isObject(value)) return value;
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalizeForDigest(value[key])]));
  }

  async function profilePayloadDigest(profile) {
    try {
      const encoded = new TextEncoder().encode(JSON.stringify(canonicalizeForDigest({
        id: profile?.id || "base",
        model: profile?.model || "",
        modelProvider: profile?.modelProvider || "",
        config: profile?.config || {},
        developerInstructions: profile?.developerInstructions || "",
        baseInstructions: profile?.baseInstructions || "",
        approvalPolicy: profile?.approvalPolicy || "",
        sandbox: profile?.sandbox || "",
        serviceTier: profile?.serviceTier || "",
        memoryPolicy: profile?.memoryPolicy || {},
      })));
      const digest = await crypto.subtle.digest("SHA-256", encoded);
      return "sha256:" + Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
    } catch {
      return null;
    }
  }

  function recordThreadProof(threadId, proof) {
    const id = normalizedThreadId(threadId);
    if (!id) return "";
    const proofId = String(proof.proofId || `proof-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`);
    state.proofByThread[id] = {
      proofId,
      profileId: validProfileId(proof.profileId),
      profileRevision: Number(environmentStore.revision || 0),
      status: String(proof.status || "acknowledged"),
      method: String(proof.method || ""),
      transport: String(proof.transport || ""),
      fields: Array.isArray(proof.fields) ? proof.fields.map(String) : [],
      payloadDigest: proof.payloadDigest || null,
      dispatchedAt: proof.dispatchedAt || null,
      acknowledgedAt: proof.acknowledgedAt || null,
    };
    const entries = Object.entries(state.proofByThread)
      .sort((left, right) => String(right[1]?.acknowledgedAt || right[1]?.dispatchedAt || "").localeCompare(String(left[1]?.acknowledgedAt || left[1]?.dispatchedAt || "")))
      .slice(0, MAX_THREAD_ENTRIES);
    state.proofByThread = Object.fromEntries(entries);
    return proofId;
  }

  function requestDescriptor(method, params) {
    const rawMethod = String(method || "");
    if (["thread/start", "thread/resume", "thread/fork"].includes(rawMethod)) {
      return { kind: rawMethod, params, rebuild: (value) => value, prewarm: false };
    }
    if (["start-conversation", "start-thread-for-host"].includes(rawMethod)) {
      return { kind: "thread/start", params, rebuild: (value) => value, prewarm: false };
    }
    if (["thread-prewarm-start", "prewarm-thread-start-for-host"].includes(rawMethod)) {
      return { kind: "thread/start", params, rebuild: (value) => value, prewarm: true };
    }
    if (rawMethod === "send-cli-request-for-host" && isObject(params)) {
      const innerMethod = String(params.method || "");
      if (!["thread/start", "thread/resume", "thread/fork"].includes(innerMethod)) return null;
      if (isObject(params.params)) {
        return {
          kind: innerMethod,
          params: params.params,
          rebuild: (value) => ({ ...params, params: value }),
          prewarm: false,
        };
      }
    }
    return null;
  }

  function dispatcherRequestDescriptor(type, payload) {
    const rawType = String(type || "");
    if (rawType === "fetch") {
      const url = typeof ownValue(payload, "url") === "string" ? ownValue(payload, "url") : "";
      const prefix = "vscode://codex/";
      const body = parsedFetchBody(payload);
      if (url.startsWith(prefix) && body.value) {
        const requestType = url.slice(prefix.length).split(/[?#]/, 1)[0];
        const inner = requestDescriptor(requestType, body.value);
        if (inner) {
          return {
            kind: inner.kind,
            params: inner.params,
            rebuild: (value) => {
              const nextBody = inner.rebuild(value);
              return { ...payload, body: body.wasString ? JSON.stringify(nextBody) : nextBody };
            },
            prewarm: inner.prewarm,
          };
        }
      }
    }
    if (["thread/start", "thread/resume", "thread/fork"].includes(rawType)) {
      return { kind: rawType, params: payload, rebuild: (value) => value, prewarm: false };
    }
    if (["start-conversation", "start-thread-for-host"].includes(rawType)) {
      return { kind: "thread/start", params: payload, rebuild: (value) => value, prewarm: false };
    }
    if (rawType === "prewarm-thread-start-for-host" && isObject(payload?.params)) {
      return { kind: "thread/start", params: payload.params, rebuild: (value) => ({ ...payload, params: value }), prewarm: true };
    }
    if (rawType === "thread-prewarm-start" && isObject(payload?.request?.params)) {
      return {
        kind: "thread/start",
        params: payload.request.params,
        rebuild: (value) => ({ ...payload, request: { ...payload.request, params: value } }),
        prewarm: true,
      };
    }
    if (rawType === "send-cli-request-for-host" && isObject(payload)) {
      const innerMethod = String(payload.method || "");
      if (["thread/start", "thread/resume", "thread/fork"].includes(innerMethod) && isObject(payload.params)) {
        return { kind: innerMethod, params: payload.params, rebuild: (value) => ({ ...payload, params: value }), prewarm: false };
      }
    }
    if (["mcp-request", "worker-request"].includes(rawType) && isObject(payload?.request)) {
      const innerMethod = String(payload.request.method || "");
      if (["thread/start", "thread/resume", "thread/fork"].includes(innerMethod) && isObject(payload.request.params)) {
        return {
          kind: innerMethod,
          params: payload.request.params,
          rebuild: (value) => ({ ...payload, request: { ...payload.request, params: value } }),
          prewarm: false,
        };
      }
    }
    return null;
  }

  function prepareDispatcherRequest(type, payload) {
    const descriptor = dispatcherRequestDescriptor(type, payload);
    if (!descriptor || descriptor.prewarm || descriptor.params?.[INJECTED_PARAMS_MARK] === true) return null;
    let profileId = "";
    if (descriptor.kind === "thread/start") {
      profileId = state.pendingProfileId || "base";
    } else if (descriptor.kind === "thread/resume") {
      profileId = threadProfileId(descriptor.params?.threadId);
      if (!profileId) return null;
    } else if (descriptor.kind === "thread/fork") {
      profileId = threadProfileId(descriptor.params?.threadId) || state.pendingProfileId || "base";
    }
    const profile = profileById(profileId || "base");
    const patchedParams = applyProfileToParams(descriptor.params, profile);
    return {
      descriptor,
      profile,
      payload: descriptor.rebuild(patchedParams),
      bindOnStarted: descriptor.kind === "thread/start" || descriptor.kind === "thread/fork",
    };
  }

  function turnStartThreadId(type, payload) {
    const rawType = String(type || "");
    if (rawType === "turn/start") {
      return normalizedThreadId(ownValue(payload, "threadId") || ownValue(payload, "conversationId"));
    }
    if (["mcp-request", "worker-request"].includes(rawType)) {
      const request = ownValue(payload, "request");
      if (ownValue(request, "method") !== "turn/start") return "";
      const params = ownValue(request, "params");
      return normalizedThreadId(ownValue(params, "threadId") || ownValue(params, "conversationId"));
    }
    return "";
  }

  function observePendingProfileForTurn(type, payload) {
    const pending = pendingThreadObservation;
    if (!pending) return;
    if (Date.now() - pending.at > 2 * 60_000) {
      pendingThreadObservation = null;
      return;
    }
    const threadId = turnStartThreadId(type, payload);
    if (!threadId || threadId === pending.previousThreadId) return;
    pendingThreadObservation = null;
    const existing = threadProfileEntry(threadId);
    if (existing?.profileId === pending.profileId) {
      consumePendingProfile(pending.profileId);
      showToast(existing.applied === true
        ? `环境已确认：${profileDisplayName(pending.profileId)}`
        : `已记录会话环境：${profileDisplayName(pending.profileId)}（未确认注入）`);
      return;
    }
    if (!existing) {
      bindThreadProfile(threadId, pending.profileId, { applied: false, source: "direct-rpc-turn-start" });
      consumePendingProfile(pending.profileId);
      showToast(`已记录会话环境：${profileDisplayName(pending.profileId)}（未确认注入）`);
      traceRequest("direct-rpc-thread-observed", { threadId, profileId: pending.profileId });
    }
  }

  function findThreadId(value) {
    const queue = [{ value, depth: 0 }];
    const seen = new WeakSet();
    while (queue.length) {
      const item = queue.shift();
      const candidate = item?.value;
      if (!candidate || typeof candidate !== "object") continue;
      if (seen.has(candidate)) continue;
      seen.add(candidate);
      const direct = normalizedThreadId(
        candidate.threadId
        || candidate.conversationId
        || candidate.thread?.id
        || candidate.params?.threadId
        || candidate.params?.thread?.id
      );
      if (direct) return direct;
      if (item.depth >= 5) continue;
      for (const key of ["result", "response", "data", "payload", "params", "thread"]) {
        if (candidate[key] && typeof candidate[key] === "object") {
          queue.push({ value: candidate[key], depth: item.depth + 1 });
        }
      }
    }
    return "";
  }

  function handleThreadStarted(payload) {
    const pending = pendingStartBinding;
    if (!pending) return;
    if (Date.now() - pending.at > 60_000) {
      pendingStartBinding = null;
      return;
    }
    const threadId = findThreadId(payload) || findThreadId({ params: payload });
    if (!threadId) return;
    bindThreadProfile(threadId, pending.profileId, { applied: true, source: "dispatcher-thread-started" });
    if (pending.kind === "thread/start") consumePendingProfile(pending.profileId);
    showToast(`会话环境：${pending.profileName}`);
    traceRequest("thread-started", { kind: pending.kind, profileId: pending.profileId, threadId });
    pendingStartBinding = null;
  }

  function traceRequest(stage, details = {}) {
    requestTrace.push({ at: new Date().toISOString(), stage, ...details });
    if (requestTrace.length > 24) requestTrace.splice(0, requestTrace.length - 24);
  }

  function ownDataDescriptor(value, key) {
    if (!value || (typeof value !== "object" && typeof value !== "function")) return null;
    try {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      return descriptor && Object.prototype.hasOwnProperty.call(descriptor, "value")
        ? descriptor
        : null;
    } catch {
      return null;
    }
  }

  function ownDataValues(value, limit = 180) {
    try {
      const descriptors = Object.getOwnPropertyDescriptors(value);
      const values = [];
      for (const key of Reflect.ownKeys(descriptors).slice(0, limit)) {
        const descriptor = descriptors[key];
        if (descriptor && Object.prototype.hasOwnProperty.call(descriptor, "value")) {
          values.push(descriptor.value);
        }
      }
      return values;
    } catch {
      return [];
    }
  }

  function callableMember(value, key) {
    let cursor = value;
    for (let depth = 0; cursor && depth < 7; depth += 1) {
      const descriptor = ownDataDescriptor(cursor, key);
      if (descriptor) {
        return typeof descriptor.value === "function"
          ? { owner: cursor, descriptor, depth }
          : null;
      }
      try {
        cursor = Object.getPrototypeOf(cursor);
      } catch {
        return null;
      }
    }
    return null;
  }

  function callableDescriptor(value, key) {
    return callableMember(value, key)?.descriptor || null;
  }

  function healLegacySendRequestShadow(value) {
    if (!value || typeof value !== "object") return false;
    const own = ownDataDescriptor(value, "sendRequest");
    if (!own || typeof own.value !== "function" || own.configurable !== true || own.enumerable !== true) return false;
    let prototype = null;
    try { prototype = Object.getPrototypeOf(value); } catch { return false; }
    if (!prototype) return false;
    const inherited = callableMember(prototype, "sendRequest");
    if (!inherited || inherited.descriptor.enumerable === true || inherited.descriptor.value !== own.value) return false;
    try {
      if (!Reflect.deleteProperty(value, "sendRequest")) return false;
    } catch {
      return false;
    }
    if (ownDataDescriptor(value, "sendRequest")) return false;
    healedLegacySendRequestShadows += 1;
    traceRequest("legacy-sendRequest-shadow-healed", {
      typeNames: objectTypeNames(value).slice(0, 3),
    });
    return true;
  }

  function objectTypeNames(value) {
    const names = [];
    let cursor = value;
    for (let depth = 0; cursor && depth < 7; depth += 1) {
      let prototype = null;
      try {
        prototype = Object.getPrototypeOf(cursor);
      } catch {
        break;
      }
      if (!prototype) break;
      const constructor = ownDataDescriptor(prototype, "constructor")?.value;
      if (typeof constructor === "function" && constructor.name) names.push(constructor.name);
      cursor = prototype;
    }
    return names;
  }

  function isRpcTargetLike(value) {
    return objectTypeNames(value).some((name) => /rpc.?target/i.test(name));
  }

  function ownValue(value, key) {
    return ownDataDescriptor(value, key)?.value;
  }

  function parsedFetchBody(payload) {
    const rawBody = ownValue(payload, "body");
    if (isObject(rawBody)) return { value: rawBody, wasString: false };
    if (typeof rawBody !== "string" || !rawBody.trim()) return { value: null, wasString: false };
    try {
      const value = JSON.parse(rawBody);
      return { value: isObject(value) ? value : null, wasString: true };
    } catch {
      return { value: null, wasString: true };
    }
  }

  function directRpcPatchTarget(value) {
    if (!value || typeof value !== "object") return null;
    const requestClient = ownValue(value, "requestClient");
    const threadCreation = ownValue(value, "threadCreation");
    if (!requestClient || typeof requestClient !== "object" || !threadCreation || typeof threadCreation !== "object") return null;
    const member = callableMember(requestClient, "sendRequest");
    if (!member || member.owner === requestClient) return null;
    if (member.descriptor.writable === false || member.descriptor.configurable === false) return null;
    let source = "";
    try { source = Function.prototype.toString.call(member.descriptor.value); } catch {}
    if (!source.includes("enqueueRequest") && !source.includes("sendConfigReadRequest")) return null;
    return {
      controller: value,
      client: requestClient,
      owner: member.owner,
      property: "sendRequest",
      descriptor: member.descriptor,
      prewarmMember: callableMember(requestClient, "prewarmThreadStart"),
      strategy: "app-server-request-client-prototype",
    };
  }

  function patchPrewarmThreadStart(target) {
    const member = target.prewarmMember;
    if (!member || member.owner === target.client) return false;
    const descriptor = member.descriptor;
    if (descriptor.writable === false || descriptor.configurable === false) return false;
    if (descriptor.value?.[WRAPPER_MARK] === wrapperToken) return false;
    const previous = descriptor.value;
    const wrapped = async function codexEnvironmentPrewarmThreadStart(request, options) {
      const profileId = state.pendingProfileId;
      if (!profileId) return previous.call(this, request, options);
      const profile = profileById(profileId);
      const patchedRequest = markInjectedParams(applyProfileToParams(request, profile));
      const fields = injectedFieldsFromParams(request, patchedRequest);
      const dispatchedAt = new Date().toISOString();
      const digestPromise = profilePayloadDigest(profile);
      traceRequest("prewarm-environment-dispatched", { profileId: profile.id, fields });
      try {
        const result = await previous.call(this, patchedRequest, options);
        const threadId = findThreadId(result) || findThreadId(patchedRequest);
        const payloadDigest = await digestPromise;
        if (threadId) {
          const acknowledgedAt = new Date().toISOString();
          const proofId = recordThreadProof(threadId, {
            profileId: profile.id,
            status: "acknowledged",
            method: "thread/start",
            transport: "prewarm-thread-start-prototype",
            fields,
            payloadDigest,
            dispatchedAt,
            acknowledgedAt,
          });
          bindThreadProfile(threadId, profile.id, {
            applied: true,
            source: "prewarm-thread-start-prototype",
            proofId,
          });
          showToast(`环境预热完成：${profile.name}`);
          traceRequest("prewarm-environment-acknowledged", { threadId, profileId: profile.id, proofId });
        }
        return result;
      } catch (error) {
        traceRequest("prewarm-environment-error", { profileId: profile.id, error: String(error?.message || error) });
        throw error;
      }
    };
    Object.defineProperty(wrapped, WRAPPER_MARK, { value: wrapperToken });
    try {
      Object.defineProperty(member.owner, "prewarmThreadStart", { ...descriptor, value: wrapped });
    } catch {
      return false;
    }
    if (ownDataDescriptor(member.owner, "prewarmThreadStart")?.value !== wrapped) return false;
    patchedClients.add({
      controller: target.controller,
      client: target.client,
      owner: member.owner,
      property: "prewarmThreadStart",
      descriptor,
      strategy: "prewarm-thread-start-prototype",
      wrapped,
      previous,
    });
    return true;
  }

  function patchDirectRpcTarget(value) {
    const target = directRpcPatchTarget(value);
    if (!target) return false;
    environmentControllers.add(target.controller);
    const prewarmPatched = patchPrewarmThreadStart(target);
    const { client, owner, descriptor } = target;
    if (descriptor.value?.[WRAPPER_MARK] === wrapperToken) return prewarmPatched;
    const previous = descriptor.value;
    const wrapped = async function codexEnvironmentSendRequest(method, params, ...rest) {
      const descriptorInfo = requestDescriptor(method, params);
      if (!descriptorInfo || descriptorInfo.prewarm) {
        return previous.call(this, method, params, ...rest);
      }
      let profileId = "";
      if (descriptorInfo.kind === "thread/start") {
        profileId = state.pendingProfileId || "base";
      } else if (descriptorInfo.kind === "thread/resume") {
        profileId = threadProfileId(descriptorInfo.params?.threadId);
        if (!profileId) return previous.call(this, method, params, ...rest);
      } else if (descriptorInfo.kind === "thread/fork") {
        profileId = threadProfileId(descriptorInfo.params?.threadId) || state.pendingProfileId || "base";
      }
      const profile = profileById(profileId || "base");
      const patchedParams = markInjectedParams(applyProfileToParams(descriptorInfo.params, profile));
      const nextParams = descriptorInfo.rebuild(patchedParams);
      const fields = injectedFieldsFromParams(descriptorInfo.params, patchedParams);
      const dispatchedAt = new Date().toISOString();
      const digestPromise = profilePayloadDigest(profile);
      traceRequest("direct-rpc-dispatched", { method: String(method || ""), profileId: profile.id, fields });
      try {
        const result = await previous.call(this, method, nextParams, ...rest);
        const threadId = findThreadId(result) || findThreadId(patchedParams);
        const payloadDigest = await digestPromise;
        if (threadId) {
          const acknowledgedAt = new Date().toISOString();
          const proofId = recordThreadProof(threadId, {
            profileId: profile.id,
            status: "acknowledged",
            method: descriptorInfo.kind,
            transport: "app-server-request-client-prototype",
            fields,
            payloadDigest,
            dispatchedAt,
            acknowledgedAt,
          });
          bindThreadProfile(threadId, profile.id, {
            applied: true,
            source: "app-server-request-client-prototype",
            proofId,
          });
          if (descriptorInfo.kind === "thread/start") consumePendingProfile(profile.id);
          pendingThreadObservation = null;
          showToast(`环境已注入：${profile.name}`);
          traceRequest("direct-rpc-acknowledged", { threadId, profileId: profile.id, proofId });
        }
        return result;
      } catch (error) {
        traceRequest("direct-rpc-error", { method: String(method || ""), profileId: profile.id, error: String(error?.message || error) });
        throw error;
      }
    };
    Object.defineProperty(wrapped, WRAPPER_MARK, { value: wrapperToken });
    try {
      Object.defineProperty(owner, "sendRequest", { ...descriptor, value: wrapped });
    } catch {
      return prewarmPatched;
    }
    if (ownDataDescriptor(owner, "sendRequest")?.value !== wrapped) return prewarmPatched;
    patchedClients.add({ ...target, client, owner, wrapped, previous, descriptor });
    return true;
  }

  function dispatcherPatchTarget(dispatcher) {
    if (!dispatcher || typeof dispatcher !== "object" || isRpcTargetLike(dispatcher)) return null;
    if (typeof ownValue(dispatcher, "__codexServiceTierOriginalDispatchMessage") !== "function") return null;
    const dispatch = callableMember(dispatcher, "dispatchMessage");
    const subscribe = callableMember(dispatcher, "subscribe");
    if (!dispatch || !subscribe) return null;
    if (dispatch.descriptor.writable === false || dispatch.descriptor.configurable === false) return null;
    return {
      client: dispatcher,
      owner: dispatch.owner,
      property: "dispatchMessage",
      descriptor: dispatch.descriptor,
      subscribe: subscribe.descriptor.value,
      strategy: "dispatcher-message",
    };
  }

  function patchDispatcher(dispatcher) {
    const target = dispatcherPatchTarget(dispatcher);
    if (!target) return false;
    const { client, owner, descriptor } = target;
    if (descriptor.value?.[WRAPPER_MARK] === wrapperToken) return false;
    const previous = descriptor.value;
    const wrapped = function codexProfileSelectorDispatchMessage(type, payload) {
      const rawType = String(type || "");
      observePendingProfileForTurn(type, payload);
      let prepared = null;
      try {
        prepared = prepareDispatcherRequest(type, payload);
      } catch (error) {
        traceRequest("dispatch-prepare-error", { type: rawType, error: String(error?.message || error) });
        throw error;
      }
      if (!prepared) {
        try {
          return previous.call(this, type, payload);
        } catch (error) {
          traceRequest("dispatch-passthrough-error", { type: rawType, error: String(error?.message || error) });
          throw error;
        }
      }
      traceRequest("dispatch-profile-selected", {
        type: String(type || ""),
        kind: prepared.descriptor.kind,
        profileId: prepared.profile.id,
      });
      const priorPending = pendingStartBinding;
      if (prepared.bindOnStarted) {
        pendingStartBinding = {
          at: Date.now(),
          kind: prepared.descriptor.kind,
          profileId: prepared.profile.id,
          profileName: prepared.profile.name,
        };
      }
      try {
        const result = previous.call(this, type, prepared.payload);
        traceRequest("dispatch-forwarded", { type: String(type || ""), kind: prepared.descriptor.kind });
        return result;
      } catch (error) {
        if (prepared.bindOnStarted) pendingStartBinding = priorPending;
        traceRequest("dispatch-error", { type: String(type || ""), error: String(error?.message || error) });
        throw error;
      }
    };
    Object.defineProperty(wrapped, WRAPPER_MARK, { value: wrapperToken });
    try {
      Object.defineProperty(owner, "dispatchMessage", { ...descriptor, value: wrapped });
    } catch {
      return false;
    }
    if (ownDataDescriptor(owner, "dispatchMessage")?.value !== wrapped) return false;
    let unsubscribe = null;
    try {
      unsubscribe = target.subscribe.call(client, "thread/started", handleThreadStarted);
    } catch {
      Object.defineProperty(owner, "dispatchMessage", descriptor);
      return false;
    }
    patchedClients.add({ ...target, client, owner, wrapped, previous, descriptor, unsubscribe });
    return true;
  }

  function patchClient(value) {
    return patchDirectRpcTarget(value) || patchDispatcher(value);
  }

  function patchedClientDiagnostics() {
    return Array.from(patchedClients, (record) => {
      let ownKeys = [];
      try {
        ownKeys = Reflect.ownKeys(Object.getOwnPropertyDescriptors(record.client))
          .filter((key) => typeof key === "string")
          .slice(0, 40);
      } catch {}
      let previousSource = "";
      try { previousSource = Function.prototype.toString.call(record.previous).slice(0, 360); } catch {}
      return {
        strategy: record.strategy || "unknown",
        typeNames: objectTypeNames(record.client),
        ownerIsPrototype: record.owner !== record.client,
        ownKeys,
        property: record.property || "",
        previousName: String(record.previous?.name || ""),
        previousSource,
        descriptor: {
          enumerable: record.descriptor?.enumerable === true,
          configurable: record.descriptor?.configurable === true,
          writable: record.descriptor?.writable === true,
        },
        serviceTierDispatcher: typeof ownValue(record.client, "__codexServiceTierOriginalDispatchMessage") === "function",
      };
    });
  }

  function appAssetUrls() {
    return Array.from(new Set([
      ...Array.from(document.scripts || []).map((script) => script.src),
      ...Array.from(document.querySelectorAll("link[href]") || []).map((link) => link.href),
      ...performance.getEntriesByType("resource").map((entry) => entry.name),
    ].filter((url) => typeof url === "string" && url.includes("/assets/") && url.split("?")[0].endsWith(".js"))));
  }

  function preferredAssetUrls() {
    const urls = appAssetUrls();
    const preferred = urls.filter((url) => {
      const name = (url.split("/").pop() || "").toLowerCase();
      return /use-host-config|app-server-manager-signals|app-initial|setting-storage|vscode-api|app-main|page-|signals|server-manager/.test(name);
    });
    return preferred.slice(0, 20);
  }

  async function importAsset(url) {
    if (!modulePromises.has(url)) {
      modulePromises.set(url, import(url).catch((error) => {
        modulePromises.delete(url);
        throw error;
      }));
    }
    return modulePromises.get(url);
  }

  function moduleCandidates(module) {
    const candidates = [];
    const seen = new Set();
    const push = (value) => {
      if (!value || typeof value !== "object" || seen.has(value)) return;
      seen.add(value);
      candidates.push(value);
    };
    for (const value of ownDataValues(module || {}, 180)) {
      push(value);
      if (!value || typeof value !== "object" || isRpcTargetLike(value)) continue;
      const get = callableDescriptor(value, "get")?.value;
      if (get) {
        try { push(get.call(value)); } catch {}
        try { push(get.call(value, "local")); } catch {}
      }
      for (const nested of ownDataValues(value, 120)) push(nested);
    }
    return candidates;
  }

  function fiberForNode(node) {
    if (!(node instanceof Element)) return null;
    const key = Object.keys(node).find((name) => name.startsWith("__reactFiber$"));
    return key ? node[key] : null;
  }

  function patchFromObjectGraph(rootValue) {
    const queue = [{ value: rootValue, depth: 0 }];
    const seen = new WeakSet();
    let patched = 0;
    while (queue.length) {
      const item = queue.shift();
      const value = item?.value;
      if (!value || typeof value !== "object"
          || (typeof Node !== "undefined" && value instanceof Node)
          || seen.has(value)) continue;
      seen.add(value);
      healLegacySendRequestShadow(value);
      if (patchClient(value)) patched += 1;
      if (isRpcTargetLike(value)) continue;
      if (item.depth >= 6) continue;
      for (const child of ownDataValues(value, 180)) {
        if (child && typeof child === "object") {
          queue.push({ value: child, depth: item.depth + 1 });
        }
      }
    }
    return patched;
  }

  function patchFromReactFibers() {
    let patched = 0;
    const nodes = [
      document.querySelector("[data-codex-composer-root]"),
      document.querySelector("[data-codex-composer]"),
      document.querySelector('[contenteditable="true"]'),
    ].filter(Boolean);
    const seenFibers = new WeakSet();
    for (const node of nodes) {
      let fiber = fiberForNode(node);
      for (let depth = 0; fiber && depth < 90; depth += 1, fiber = fiber.return) {
        for (const candidate of [fiber, fiber.alternate]) {
          if (!candidate || seenFibers.has(candidate)) continue;
          seenFibers.add(candidate);
          patched += patchFromObjectGraph(candidate.memoizedState);
          patched += patchFromObjectGraph(candidate.updateQueue?.memoCache);
        }
      }
    }
    return patched;
  }

  async function scanClients() {
    if (destroyed || scanInFlight) return;
    scanInFlight = true;
    scanAttempts += 1;
    let patched = 0;
    try {
      for (const url of preferredAssetUrls()) {
        try {
          const module = await importAsset(url);
          for (const candidate of moduleCandidates(module)) {
            healLegacySendRequestShadow(candidate);
            if (patchClient(candidate)) patched += 1;
          }
        } catch {}
      }
      patched += patchFromReactFibers();
      lastPatchError = "";
    } catch (error) {
      lastPatchError = String(error?.stack || error?.message || error);
    } finally {
      scanInFlight = false;
      updatePill();
    }
    const delay = patched > 0 || patchedClients.size > 0
      ? 30000
      : Math.min(15000, 500 * Math.max(1, scanAttempts));
    window.clearTimeout(scanTimer);
    scanTimer = window.setTimeout(scanClients, delay);
  }

  function destroy() {
    if (destroyed) return;
    destroyed = true;
    lifetime.abort();
    window.clearTimeout(scanTimer);
    window.clearInterval(labelTimer);
    closeChooser(null);
    for (const record of patchedClients) {
      try { record.unsubscribe?.(); } catch {}
      try {
        if (ownDataDescriptor(record.owner, record.property)?.value === record.wrapped) {
          Object.defineProperty(record.owner, record.property, record.descriptor);
        }
      } catch {}
    }
    patchedClients.clear();
    environmentControllers.clear();
    try { uiAdapter?.destroy?.(); } catch {}
    uiAdapter = null;
    host?.remove();
    const currentApi = window[GLOBAL_KEY];
    if (window[LEGACY_GLOBAL_KEY] === currentApi || window[LEGACY_GLOBAL_KEY]?.version === VERSION) {
      delete window[LEGACY_GLOBAL_KEY];
    }
    if (currentApi?.version === VERSION) delete window[GLOBAL_KEY];
  }

  function publicStatus() {
    const currentId = currentThreadId();
    const currentEntry = threadProfileEntry(currentId);
    const currentProfile = currentEntry?.profileId || "";
    const currentProof = currentId && isObject(state.proofByThread?.[currentId])
      ? state.proofByThread[currentId]
      : null;
    let attachedUi = null;
    try { attachedUi = uiAdapter?.status?.() || null; } catch {}
    return {
      name: "环境注入器",
      version: VERSION,
      generatedAt: ENVIRONMENT_BUNDLE.generatedAt || "",
      profiles: profiles.map(({ id, name, model, modelProvider, source }) => ({ id, name, model, modelProvider, source })),
      currentThreadId: currentId,
      currentProfileId: currentProfile,
      currentProfileBinding: currentEntry ? {
        profileId: currentEntry.profileId,
        applied: currentEntry.applied,
        source: currentEntry.source || "legacy",
        proofId: currentEntry.proofId || null,
        at: currentEntry.at || null,
      } : null,
      currentProof: currentProof ? {
        proofId: currentProof.proofId,
        status: currentProof.status,
        transport: currentProof.transport,
        fields: currentProof.fields,
        payloadDigest: currentProof.payloadDigest,
        acknowledgedAt: currentProof.acknowledgedAt,
      } : null,
      store: {
        schemaVersion: environmentStore.schemaVersion,
        revision: environmentStore.revision,
        migrated: environmentStore.migration?.completed === true,
        migrationSources: environmentStore.migration?.sources || [],
      },
      capabilities: cloneJson(bridgeCapabilities || ENVIRONMENT_BUNDLE.environment?.capabilities || {}),
      memoryEnabled: ENVIRONMENT_BUNDLE.environment?.memory?.settings?.enabled === true,
      pendingProfileId: state.pendingProfileId,
      promptOnNewThread: state.promptOnNewThread,
      chooserOpen: attachedUi ? attachedUi.open === true : !!panel && !panel.hidden,
      panelMode: attachedUi?.mode || panelMode,
      patchedClients: patchedClients.size,
      patchedClientDiagnostics: patchedClientDiagnostics(),
      scanAttempts,
      lastPatchError,
      healedLegacySendRequestShadows,
      requestTrace: requestTrace.slice(),
    };
  }

  function refreshEnvironmentData() {
    environmentStore = loadEnvironmentStore();
    refreshProfileCatalog();
    state = loadState();
    renderProfileOptions();
    updatePill();
    if (panelMode === "current") renderCurrentProfileView();
  }

  if (window.__CODEX_ENVIRONMENT_INJECTOR_TEST__ || window.__CODEX_PROFILE_SELECTOR_TEST__) {
    const testApi = {
      refreshProfiles: () => {
        refreshProfileCatalog();
        return profiles;
      },
      profiles: () => profiles,
      editableProfiles: editableStaticProfiles,
      profileById,
      applyProfileToParams,
      markInjectedParams,
      injectedFieldsFromParams,
      prepareDispatcherRequest,
      requestDescriptor,
      threadProfileEntry,
      bindThreadProfile,
      setPendingProfile,
      currentBindingStatus,
      turnStartThreadId,
      deepMerge,
      patchClient,
      patchFromObjectGraph,
      moduleCandidates,
      ownDataValues,
      healLegacySendRequestShadow,
      isRpcTargetLike,
      patchedClientCount: () => patchedClients.size,
      environmentStore: () => cloneJson(environmentStore),
      environmentBundle: () => cloneJson(ENVIRONMENT_BUNDLE),
      bridgeCall,
      refreshBridgeState,
      bridgeState: () => cloneJson({ bridgeCapabilities, bridgeAgents, bridgeMemory }),
      uiSnapshot,
      attachUiAdapter,
      chooseProfile,
      openEnvironmentView,
      destroy,
    };
    window.__codexEnvironmentInjectorTest = testApi;
    window.__codexPlusProfileSelectorTest = testApi;
    return;
  }

  document.addEventListener("click", interceptNewChat, { capture: true, signal });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && activeChooser) closeChooser(null);
  }, { signal });
  const handleRouteChange = () => {
    updatePill();
    void scanClients();
  };
  window.addEventListener("popstate", handleRouteChange, { signal });
  window.addEventListener("hashchange", handleRouteChange, { signal });
  window.addEventListener(UPDATE_EVENT, refreshEnvironmentData, { signal });
  window.addEventListener("codexpp-profile-studio-updated", refreshEnvironmentData, { signal });
  window.addEventListener("storage", (event) => {
    if (![STORAGE_KEY, LEGACY_STUDIO_STORAGE_KEY, LEGACY_SELECTOR_STORAGE_KEY].includes(event.key)) return;
    refreshEnvironmentData();
  }, { signal });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      updatePill();
      void scanClients();
    }
  }, { signal });

  createUi();
  renderProfileOptions();
  labelTimer = window.setInterval(updatePill, 1000);
  void refreshBridgeState();
  void scanClients();

  const publicApi = {
    version: VERSION,
    status: publicStatus,
    editableProfiles: editableStaticProfiles,
    environmentSnapshot: () => cloneJson(ENVIRONMENT_BUNDLE.environment || {}),
    environmentStore: () => cloneJson(environmentStore),
    uiSnapshot,
    attachUiAdapter,
    bridgeCall,
    refreshBridge: async () => {
      await refreshBridgeState();
      return uiSnapshot();
    },
    replaceEnvironmentStore: (nextStore) => {
      environmentStore = normalizeEnvironmentStore(cloneJson(nextStore));
      saveEnvironmentStore();
      refreshProfileCatalog();
      state = loadState();
      renderProfileOptions();
      updatePill();
      return uiSnapshot();
    },
    updateUiPreferences: (patch) => {
      if (isObject(patch)) Object.assign(environmentStore.ui, cloneJson(patch));
      saveEnvironmentStore();
      notifyUiAdapter();
      return uiSnapshot();
    },
    setPromptOnNewThread: (enabled) => {
      state.promptOnNewThread = enabled !== false;
      saveState();
      return uiSnapshot();
    },
    open: () => chooseProfile("下个新对话环境"),
    viewCurrent: openCurrentProfileView,
    viewMemory: openMemoryView,
    viewAgents: openAgentsView,
    viewTutorial: openTutorialView,
    setNext: (profileId) => {
      setPendingProfile(profileId);
      return publicStatus();
    },
    clearNext: () => {
      state.pendingProfileId = "";
      saveState();
      return publicStatus();
    },
    rescan: () => scanClients(),
    refreshProfiles: () => {
      refreshEnvironmentData();
      return publicStatus();
    },
    destroy,
  };
  window[GLOBAL_KEY] = publicApi;
  window[LEGACY_GLOBAL_KEY] = publicApi;
})();

/* Codex++ Environment Studio v0.3.2 */
(() => {
  "use strict";

  const GLOBAL_KEY = "__codexEnvironmentStudio";
  const LEGACY_GLOBAL_KEY = "__codexPlusProfileStudio";
  const INJECTOR_GLOBAL_KEY = "__codexEnvironmentInjector";
  const VERSION = "0.3.2";
  const STORAGE_KEY = "codexpp.environmentInjector.v2";
  const LEGACY_STORAGE_KEY = "codexpp.profileStudio.v1";
  const STORE_VERSION = 2;
  const UPDATE_EVENT = "codexpp-environment-injector-updated";
  const NAV_ATTR = "data-codex-environment-injector-nav";
  const HOST_ID = "codexpp-environment-studio-host";
  const MAX_PROFILES = 50;
  const MAX_INSTRUCTIONS_CHARS = 40000;

  window[GLOBAL_KEY]?.destroy?.();
  if (window[LEGACY_GLOBAL_KEY] && window[LEGACY_GLOBAL_KEY] !== window[GLOBAL_KEY]) {
    window[LEGACY_GLOBAL_KEY]?.destroy?.();
  }

  const lifetime = new AbortController();
  const { signal } = lifetime;
  let destroyed = false;
  let host = null;
  let shadow = null;
  let dialog = null;
  let navNode = null;
  let observer = null;
  let scanTimer = 0;
  let uiAdapter = null;
  let selectedKey = "";
  let selectedTargetProfileId = "";
  let sourceFileName = "";
  let sourceConfig = {};

  const ui = {};

  function isObject(value) {
    return !!value && typeof value === "object" && !Array.isArray(value);
  }

  function defaultStore() {
    return {
      schemaVersion: STORE_VERSION,
      revision: 0,
      profiles: {},
      selection: { pendingProfileId: "", promptOnNewThread: true },
      bindingsByThread: {},
      proofByThread: {},
      migration: { completed: true, sources: [], migratedAt: new Date().toISOString() },
      ui: {},
    };
  }

  function loadStore() {
    let parsed = null;
    try { parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null"); } catch {}
    if (!isObject(parsed) || parsed.schemaVersion !== STORE_VERSION) {
      let legacy = null;
      try { legacy = JSON.parse(localStorage.getItem(LEGACY_STORAGE_KEY) || "null"); } catch {}
      parsed = defaultStore();
      if (isObject(legacy?.profiles)) {
        parsed.profiles = cloneJson(legacy.profiles);
        parsed.migration.sources.push(LEGACY_STORAGE_KEY);
      }
    }
    if (!isObject(parsed.profiles)) parsed.profiles = {};
    if (!isObject(parsed.selection)) parsed.selection = { pendingProfileId: "", promptOnNewThread: true };
    if (!isObject(parsed.bindingsByThread)) parsed.bindingsByThread = {};
    if (!isObject(parsed.proofByThread)) parsed.proofByThread = {};
    if (!isObject(parsed.ui)) parsed.ui = {};
    return parsed;
  }

  let store = loadStore();

  function saveStore() {
    store.revision = Number(store.revision || 0) + 1;
    store.updatedAt = new Date().toISOString();
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
    } catch (error) {
      throw new Error(`保存环境失败：${error?.message || error}`);
    }
    window.dispatchEvent(new CustomEvent(UPDATE_EVENT));
    window[INJECTOR_GLOBAL_KEY]?.refreshProfiles?.();
    renderProfileList();
  }

  function cloneJson(value, fallback = {}) {
    try {
      return JSON.parse(JSON.stringify(value));
    } catch {
      return fallback;
    }
  }

  function storedProfileEntries() {
    return Object.entries(store.profiles || {}).flatMap(([storageKey, item]) => {
      if (!isObject(item) || !/^[A-Za-z0-9_-]+$/.test(String(item.id || ""))) return [];
      const requestedTarget = String(item.targetProfileId || "").trim();
      const targetProfileId = /^[A-Za-z0-9_-]+$/.test(requestedTarget) ? requestedTarget : "";
      return [{
        ...item,
        targetProfileId,
        storageKey,
        sourceKind: targetProfileId ? "override" : "studio",
      }];
    }).sort((left, right) => Number(right.updatedAt || 0) - Number(left.updatedAt || 0));
  }

  function fileProfileEntries() {
    let values = [];
    try {
      values = window[INJECTOR_GLOBAL_KEY]?.editableProfiles?.() || window.__codexPlusProfileSelector?.editableProfiles?.() || [];
    } catch {}
    if (!Array.isArray(values)) return [];
    return values.flatMap((item) => {
      if (!isObject(item)) return [];
      const id = String(item.id || "").trim();
      if (id === "base" || !/^[A-Za-z0-9_-]+$/.test(id)) return [];
      return [{
        ...cloneJson(item),
        id,
        storageKey: "",
        targetProfileId: id,
        sourceKind: "file",
        sourceFileName: String(item.sourceFileName || `${id}.config.toml`),
      }];
    }).sort((left, right) => String(left.name || left.id).localeCompare(String(right.name || right.id)));
  }

  function profileEntries() {
    const stored = storedProfileEntries();
    const files = fileProfileEntries();
    const fileIds = new Set(files.map((profile) => profile.id));
    const overrides = new Map(stored
      .filter((profile) => profile.targetProfileId && fileIds.has(profile.targetProfileId))
      .map((profile) => [profile.targetProfileId, profile]));
    const fileRows = files.map((profile) => overrides.get(profile.id) || profile);
    const customRows = stored.filter((profile) => !profile.targetProfileId);
    const orphanOverrides = stored
      .filter((profile) => profile.targetProfileId && !fileIds.has(profile.targetProfileId))
      .map((profile) => ({ ...profile, sourceKind: "orphan-override" }));
    return [...fileRows, ...customRows, ...orphanOverrides];
  }

  function selectorProfileId(profile) {
    return profile.targetProfileId || `studio:${profile.id}`;
  }

  function slugify(value) {
    const slug = String(value || "")
      .normalize("NFKD")
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48);
    return slug || `profile-${Date.now().toString(36).slice(-6)}`;
  }

  function titleFromMarkdown(text) {
    const line = String(text || "").split(/\r?\n/)
      .map((item) => item.trim())
      .find((item) => /^#\s+\S/.test(item));
    return line ? line.replace(/^#\s+/, "").trim().slice(0, 80) : "";
  }

  function setStatus(message, kind = "info") {
    if (!ui.status) return;
    ui.status.textContent = String(message || "");
    ui.status.dataset.kind = kind;
  }

  function currentFormProfile() {
    const id = String(ui.id?.value || "").trim();
    const name = String(ui.name?.value || "").trim() || id;
    const instructions = String(ui.instructions?.value || "");
    const reasoning = String(ui.reasoning?.value || "");
    const config = isObject(sourceConfig) ? cloneJson(sourceConfig) : {};
    if (reasoning) config.model_reasoning_effort = reasoning;
    else delete config.model_reasoning_effort;
    const profile = {
      id,
      name,
      sourceFileName,
      model: String(ui.model?.value || "").trim(),
      modelProvider: String(ui.provider?.value || "").trim(),
      developerInstructions: instructions,
      baseInstructions: String(ui.baseInstructions?.value || ""),
      memoryPolicy: {
        use: String(ui.memoryUse?.value || "inherit"),
        generate: String(ui.memoryGenerate?.value || "inherit"),
      },
      origin: selectedTargetProfileId ? "file-override" : "local",
      approvalPolicy: String(ui.approval?.value || ""),
      sandbox: String(ui.sandbox?.value || ""),
      serviceTier: String(ui.serviceTier?.value || "").trim(),
      config,
      createdAt: selectedKey && store.profiles[selectedKey]?.createdAt
        ? store.profiles[selectedKey].createdAt
        : Date.now(),
      updatedAt: Date.now(),
    };
    if (selectedTargetProfileId) profile.targetProfileId = selectedTargetProfileId;
    return profile;
  }

  function likelyContainsSecret(text) {
    const source = String(text || "");
    return [
      /\bsk-[A-Za-z0-9_-]{16,}\b/,
      /\b(?:api[_-]?key|token|password|secret)\s*[:=]\s*["']?[A-Za-z0-9_./+\-=]{12,}/i,
      /\bBearer\s+[A-Za-z0-9_./+\-=]{16,}/i,
    ].some((pattern) => pattern.test(source));
  }

  function likelyContainsSecretValue(value, depth = 0) {
    if (depth > 8) return false;
    if (typeof value === "string") return likelyContainsSecret(value);
    if (Array.isArray(value)) return value.some((item) => likelyContainsSecretValue(item, depth + 1));
    if (!isObject(value)) return false;
    return Object.entries(value).some(([key, item]) =>
      /api[_-]?key|token|password|secret|authorization|bearer|credential|auth_contents/i.test(key)
      || likelyContainsSecretValue(item, depth + 1));
  }

  function storageKeyFor(profile) {
    return profile.targetProfileId ? `override:${profile.targetProfileId}` : profile.id;
  }

  function validateProfile(profile) {
    if (!/^[A-Za-z0-9_-]+$/.test(profile.id)) {
      return "Profile ID 只能包含英文、数字、下划线和减号";
    }
    const hasContent = String(profile.developerInstructions || "").trim()
      || String(profile.baseInstructions || "").trim()
      || (profile.memoryPolicy?.use || "inherit") !== "inherit"
      || (profile.memoryPolicy?.generate || "inherit") !== "inherit"
      || profile.model
      || profile.modelProvider
      || profile.approvalPolicy
      || profile.sandbox
      || profile.serviceTier
      || Object.keys(profile.config || {}).length > 0;
    if (!hasContent) {
      return "请提供 AGENTS.md 内容或至少一项 Profile 设置";
    }
    if (profile.developerInstructions.length > MAX_INSTRUCTIONS_CHARS) {
      return `Developer Instructions 不能超过 ${MAX_INSTRUCTIONS_CHARS} 个字符`;
    }
    if (String(profile.baseInstructions || "").length > MAX_INSTRUCTIONS_CHARS) {
      return `Base Instructions 不能超过 ${MAX_INSTRUCTIONS_CHARS} 个字符`;
    }
    const nextKey = storageKeyFor(profile);
    if (!selectedKey && !store.profiles[nextKey] && storedProfileEntries().length >= MAX_PROFILES) {
      return `最多保存 ${MAX_PROFILES} 个自定义 Profile 或本地覆盖`;
    }
    if (selectedKey !== nextKey && store.profiles[nextKey]) {
      return profile.targetProfileId
        ? `这个文件 Profile 已存在本地覆盖：${profile.targetProfileId}`
        : `Profile ID 已存在：${profile.id}`;
    }
    return "";
  }

  function clearForm() {
    selectedKey = "";
    selectedTargetProfileId = "";
    sourceFileName = "";
    sourceConfig = {};
    ui.id.value = "";
    ui.id.disabled = false;
    ui.name.value = "";
    ui.model.value = "";
    ui.provider.value = "";
    ui.reasoning.value = "";
    ui.approval.value = "";
    ui.sandbox.value = "";
    ui.serviceTier.value = "";
    ui.memoryUse.value = "inherit";
    ui.memoryGenerate.value = "inherit";
    ui.instructions.value = "";
    ui.baseInstructions.value = "";
    ui.fileLabel.textContent = "拖入或选择 AGENTS.md";
    if (ui.saveButton) ui.saveButton.textContent = "打包并保存";
    if (ui.removeButton) {
      ui.removeButton.disabled = true;
      ui.removeButton.textContent = "删除";
    }
    setStatus("可新建 Profile，也可从左侧选择已检测到的文件 Profile 进行覆盖编辑。", "info");
    renderProfileList();
  }

  function fillForm(profile) {
    selectedKey = String(profile.storageKey || "");
    selectedTargetProfileId = String(profile.targetProfileId || "");
    sourceFileName = String(profile.sourceFileName || "");
    sourceConfig = isObject(profile.config) ? cloneJson(profile.config) : {};
    ui.id.value = profile.id;
    ui.id.disabled = Boolean(selectedTargetProfileId);
    ui.name.value = profile.name || profile.id;
    ui.model.value = profile.model || "";
    ui.provider.value = profile.modelProvider || "";
    ui.reasoning.value = profile.config?.model_reasoning_effort || "";
    ui.approval.value = profile.approvalPolicy || "";
    ui.sandbox.value = profile.sandbox || "";
    ui.serviceTier.value = profile.serviceTier || "";
    ui.memoryUse.value = profile.memoryPolicy?.use || "inherit";
    ui.memoryGenerate.value = profile.memoryPolicy?.generate || "inherit";
    ui.instructions.value = profile.developerInstructions || "";
    ui.baseInstructions.value = profile.baseInstructions || "";
    ui.fileLabel.textContent = sourceFileName || (profile.developerInstructions ? "已加载 AGENTS.md" : "未关联 AGENTS.md");
    if (ui.saveButton) ui.saveButton.textContent = selectedTargetProfileId ? "保存本地覆盖" : "保存修改";
    if (ui.removeButton) {
      ui.removeButton.disabled = !selectedKey;
      ui.removeButton.textContent = selectedTargetProfileId ? "恢复文件版本" : "删除";
    }
    if (profile.sourceKind === "file") {
      setStatus(`已检测到文件 Profile：${profile.name || profile.id}。保存后作为会话级本地覆盖，原文件不变。`, "info");
    } else if (profile.sourceKind === "override") {
      setStatus(`正在编辑文件 Profile 的本地覆盖：${profile.name || profile.id}`, "info");
    } else if (profile.sourceKind === "orphan-override") {
      setStatus(`正在编辑本地覆盖；源文件 Profile ${selectedTargetProfileId} 当前未被检测到。`, "error");
    } else {
      setStatus(`正在编辑工坊 Profile：${profile.name || profile.id}`, "info");
    }
    renderProfileList();
  }

  async function loadAgentsFile(file) {
    if (!file) return;
    const fileName = String(file.name || "AGENTS.md");
    if (!/\.md$/i.test(fileName) && file.type && !/text|markdown/i.test(file.type)) {
      setStatus("请选择 Markdown 文本文件", "error");
      return;
    }
    if (file.size > 256 * 1024) {
      setStatus("文件过大；AGENTS.md 最大允许 256 KiB", "error");
      return;
    }
    const text = await file.text();
    if (text.length > MAX_INSTRUCTIONS_CHARS) {
      setStatus(`内容超过 ${MAX_INSTRUCTIONS_CHARS} 字符，请先精简`, "error");
      return;
    }
    sourceFileName = fileName;
    ui.instructions.value = text;
    const title = titleFromMarkdown(text) || fileName.replace(/\.md$/i, "") || "Custom Profile";
    if (!ui.name.value.trim()) ui.name.value = title;
    if (!ui.id.value.trim()) ui.id.value = slugify(title);
    ui.fileLabel.textContent = `${fileName} · ${text.length} 字符`;
    setStatus("AGENTS.md 已载入，点击“打包并保存”。", "success");
  }

  function saveCurrentProfile() {
    const profile = currentFormProfile();
    const error = validateProfile(profile);
    if (error) {
      setStatus(error, "error");
      return;
    }
    if (likelyContainsSecret(profile.developerInstructions)
        || likelyContainsSecret(profile.baseInstructions)
        || likelyContainsSecretValue(profile.config)) {
      if (!window.confirm("环境内容可能包含密钥、Token 或认证字段。仍要保存到 Codex 页面 localStorage 吗？")) {
        return;
      }
    }
    const nextKey = storageKeyFor(profile);
    if (selectedKey && selectedKey !== nextKey) delete store.profiles[selectedKey];
    store.profiles[nextKey] = profile;
    selectedKey = nextKey;
    selectedTargetProfileId = String(profile.targetProfileId || "");
    sourceConfig = cloneJson(profile.config || {});
    saveStore();
    if (ui.useNext.checked) {
      window[INJECTOR_GLOBAL_KEY]?.setNext?.(selectorProfileId(profile));
    }
    fillForm({ ...profile, storageKey: nextKey, sourceKind: profile.targetProfileId ? "override" : "studio" });
    if (profile.targetProfileId) {
      setStatus(`已保存 ${profile.targetProfileId} 的本地覆盖；原 .config.toml 未修改。`, "success");
    } else {
      setStatus(`已打包：${profile.name}。现在可在右下角 Profile 选择器中使用。`, "success");
    }
  }

  function deleteCurrentProfile() {
    if (!selectedKey || !store.profiles[selectedKey]) return;
    const profile = store.profiles[selectedKey];
    const isOverride = Boolean(profile.targetProfileId);
    const prompt = isOverride
      ? `恢复文件 Profile“${profile.targetProfileId}”并删除本地覆盖？`
      : `删除自定义 Profile“${profile.name || profile.id}”？`;
    if (!window.confirm(prompt)) return;
    delete store.profiles[selectedKey];
    saveStore();
    clearForm();
    setStatus(isOverride
      ? `已恢复文件 Profile：${profile.targetProfileId}`
      : "Profile 已删除。已绑定的旧会话将回退到 Base。", "success");
  }

  function tomlString(value) {
    return JSON.stringify(String(value || ""));
  }

  function tomlKey(value) {
    const key = String(value || "");
    return /^[A-Za-z0-9_-]+$/.test(key) ? key : tomlString(key);
  }

  function tomlValue(value) {
    if (typeof value === "string") return tomlString(value);
    if (typeof value === "boolean") return value ? "true" : "false";
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
    if (Array.isArray(value)) return `[${value.map(tomlValue).join(", ")}]`;
    if (isObject(value)) {
      return `{ ${Object.entries(value).map(([key, item]) => `${tomlKey(key)} = ${tomlValue(item)}`).join(", ")} }`;
    }
    throw new Error(`无法导出 TOML 值：${String(value)}`);
  }

  function appendTomlConfig(lines, value, path = []) {
    const entries = Object.entries(value || {});
    const scalars = entries.filter(([, item]) => !isObject(item));
    const tables = entries.filter(([, item]) => isObject(item));
    if (path.length) {
      lines.push("", `[${path.map(tomlKey).join(".")}]`);
    }
    for (const [key, item] of scalars) lines.push(`${tomlKey(key)} = ${tomlValue(item)}`);
    for (const [key, item] of tables) appendTomlConfig(lines, item, [...path, key]);
  }

  function profileToml(profile) {
    const lines = [
      "# Generated by Codex++ Environment Injector",
      `# Source: ${profile.sourceFileName || "AGENTS.md"}`,
      "",
    ];
    if (profile.model) lines.push(`model = ${tomlString(profile.model)}`);
    if (profile.modelProvider) lines.push(`model_provider = ${tomlString(profile.modelProvider)}`);
    if (profile.config?.model_reasoning_effort) {
      lines.push(`model_reasoning_effort = ${tomlString(profile.config.model_reasoning_effort)}`);
    }
    if (profile.approvalPolicy) lines.push(`approval_policy = ${tomlString(profile.approvalPolicy)}`);
    if (profile.sandbox) lines.push(`sandbox_mode = ${tomlString(profile.sandbox)}`);
    if (profile.serviceTier) lines.push(`service_tier = ${tomlString(profile.serviceTier)}`);
    if (profile.developerInstructions) {
      lines.push(`developer_instructions = ${tomlString(profile.developerInstructions)}`);
    }
    if (profile.baseInstructions) {
      lines.push(`base_instructions = ${tomlString(profile.baseInstructions)}`);
    }
    const config = isObject(profile.config) ? cloneJson(profile.config) : {};
    delete config.model_reasoning_effort;
    const memories = {};
    if (profile.memoryPolicy?.use === "on" || profile.memoryPolicy?.use === "off") {
      memories.use_memories = profile.memoryPolicy.use === "on";
    }
    if (profile.memoryPolicy?.generate === "on" || profile.memoryPolicy?.generate === "off") {
      memories.generate_memories = profile.memoryPolicy.generate === "on";
    }
    if (Object.keys(memories).length) config.memories = memories;
    appendTomlConfig(lines, config);
    lines.push("");
    return lines.join("\n");
  }

  function exportCurrentProfile() {
    const profile = currentFormProfile();
    const error = validateProfile(profile);
    if (error) {
      setStatus(error, "error");
      return;
    }
    let content = "";
    try {
      content = profileToml(profile);
    } catch (exportError) {
      setStatus(`导出失败：${exportError?.message || exportError}`, "error");
      return;
    }
    const blob = new Blob([content], { type: "application/toml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${profile.id}.config.toml`;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    setStatus(`已导出：${profile.id}.config.toml`, "success");
  }

  function renderProfileList() {
    if (!ui.profileList) return;
    ui.profileList.replaceChildren();
    const entries = profileEntries();
    if (!entries.length) {
      const empty = document.createElement("div");
      empty.className = "empty";
      empty.textContent = "未检测到文件 Profile，也没有工坊 Profile";
      ui.profileList.append(empty);
      return;
    }
    for (const profile of entries) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "profile-row";
      const active = profile.storageKey
        ? profile.storageKey === selectedKey
        : !selectedKey && profile.sourceKind === "file" && selectedTargetProfileId === profile.id;
      if (active) button.dataset.active = "true";
      const title = document.createElement("strong");
      title.textContent = profile.name || profile.id;
      const detail = document.createElement("small");
      const sourceLabel = profile.sourceKind === "file"
        ? "文件 Profile"
        : profile.sourceKind === "override"
          ? "本地覆盖"
          : profile.sourceKind === "orphan-override"
            ? "源文件未检测到"
            : "工坊 Profile";
      detail.textContent = [sourceLabel, profile.model || "继承模型", profile.modelProvider || "继承 Provider"].join(" · ");
      button.append(title, detail);
      button.addEventListener("click", () => fillForm(profile), { signal });
      ui.profileList.append(button);
    }
  }

  function field(labelText, input) {
    const label = document.createElement("label");
    label.className = "field";
    const text = document.createElement("span");
    text.textContent = labelText;
    label.append(text, input);
    return label;
  }

  function textInput(placeholder = "") {
    const input = document.createElement("input");
    input.type = "text";
    input.placeholder = placeholder;
    return input;
  }

  function selectInput(options) {
    const select = document.createElement("select");
    for (const [value, label] of options) {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = label;
      select.append(option);
    }
    return select;
  }

  function createUi() {
    document.getElementById(HOST_ID)?.remove();
    host = document.createElement("div");
    host.id = HOST_ID;
    host.style.position = "fixed";
    host.style.inset = "0";
    host.style.zIndex = "2147483100";
    host.style.pointerEvents = "none";
    shadow = host.attachShadow({ mode: "open" });

    const style = document.createElement("style");
    style.textContent = `
      :host { all: initial; color-scheme: light dark; }
      * { box-sizing: border-box; }
      .backdrop { position: fixed; inset: 0; display: grid; place-items: center; padding: 24px; background: rgba(0,0,0,.46); pointer-events: auto; }
      .backdrop[hidden] { display: none; }
      .dialog { width: min(920px, 96vw); height: min(700px, 92vh); display: grid; grid-template-rows: auto 1fr; overflow: hidden; border: 1px solid color-mix(in srgb, currentColor 16%, transparent); border-radius: 18px; background: var(--color-surface, Canvas); color: var(--color-text, CanvasText); box-shadow: 0 28px 90px rgba(0,0,0,.38); font: 13px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
      .top { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 14px 16px; border-bottom: 1px solid color-mix(in srgb, currentColor 11%, transparent); }
      .top h2 { margin: 0; font-size: 17px; }
      .top p { margin: 2px 0 0; opacity: .62; font-size: 11px; }
      .top-actions { display: flex; align-items: center; gap: 7px; }
      .tutorial-button { padding: 6px 9px; font-size: 11px; }
      button { font: inherit; }
      .icon-button { appearance: none; border: 0; background: transparent; color: inherit; font-size: 22px; cursor: pointer; opacity: .7; }
      .body { min-height: 0; display: grid; grid-template-columns: 240px minmax(0,1fr); }
      .sidebar { min-height: 0; overflow: auto; padding: 12px; border-right: 1px solid color-mix(in srgb, currentColor 11%, transparent); }
      .new-button, .action { appearance: none; border: 1px solid color-mix(in srgb, currentColor 14%, transparent); border-radius: 9px; padding: 8px 10px; background: color-mix(in srgb, currentColor 5%, transparent); color: inherit; cursor: pointer; }
      .new-button { width: 100%; margin-bottom: 10px; }
      .new-button:hover, .action:hover:not(:disabled) { border-color: color-mix(in srgb, var(--color-token-primary, #3b82f6) 60%, transparent); }
      .action:disabled { cursor: default; opacity: .38; }
      .profile-list { display: grid; gap: 6px; }
      .profile-row { display: grid; gap: 2px; width: 100%; padding: 8px 9px; border: 1px solid transparent; border-radius: 9px; background: transparent; color: inherit; text-align: left; cursor: pointer; }
      .profile-row:hover, .profile-row[data-active="true"] { background: color-mix(in srgb, var(--color-token-primary, #3b82f6) 9%, transparent); border-color: color-mix(in srgb, var(--color-token-primary, #3b82f6) 35%, transparent); }
      .profile-row small { opacity: .6; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .empty { padding: 12px 4px; opacity: .55; font-size: 12px; }
      .editor { min-height: 0; overflow: auto; padding: 15px; display: grid; align-content: start; gap: 12px; }
      .drop { display: grid; place-items: center; min-height: 92px; padding: 14px; border: 1px dashed color-mix(in srgb, currentColor 28%, transparent); border-radius: 12px; background: color-mix(in srgb, currentColor 3%, transparent); cursor: pointer; text-align: center; }
      .drop[data-drag="true"] { border-color: var(--color-token-primary, #3b82f6); background: color-mix(in srgb, var(--color-token-primary, #3b82f6) 9%, transparent); }
      .drop strong { display: block; }
      .drop small { opacity: .58; }
      .grid { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 10px; }
      .field { display: grid; gap: 5px; min-width: 0; }
      .field > span { font-size: 11px; opacity: .7; }
      input, select, textarea { width: 100%; border: 1px solid color-mix(in srgb, currentColor 16%, transparent); border-radius: 8px; padding: 8px 9px; background: color-mix(in srgb, currentColor 4%, transparent); color: inherit; font: inherit; outline: none; }
      input:focus, select:focus, textarea:focus { border-color: var(--color-token-primary, #3b82f6); }
      input:disabled { cursor: not-allowed; opacity: .58; }
      textarea { min-height: 220px; resize: vertical; font: 12px/1.5 ui-monospace, SFMono-Regular, Consolas, monospace; }
      textarea.compact { min-height: 140px; }
      .actions { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
      .primary { background: var(--color-token-primary, #2563eb); color: white; border-color: transparent; font-weight: 650; }
      .danger { color: #ef4444; }
      .check { display: flex; align-items: center; gap: 7px; margin-right: auto; }
      .check input { width: auto; }
      .status { min-height: 20px; font-size: 12px; opacity: .75; }
      .status[data-kind="success"] { color: #16a34a; opacity: 1; }
      .status[data-kind="error"] { color: #ef4444; opacity: 1; }
      @media (max-width: 720px) { .body { grid-template-columns: 1fr; } .sidebar { max-height: 150px; border-right: 0; border-bottom: 1px solid color-mix(in srgb, currentColor 11%, transparent); } .grid { grid-template-columns: 1fr; } }
    `;

    const backdrop = document.createElement("div");
    backdrop.className = "backdrop";
    backdrop.hidden = true;
    dialog = backdrop;
    const box = document.createElement("section");
    box.className = "dialog";
    const top = document.createElement("header");
    top.className = "top";
    const heading = document.createElement("div");
    const title = document.createElement("h2");
    title.textContent = "环境注入器";
    const subtitle = document.createElement("p");
    subtitle.textContent = "环境 Profiles · 提示词 · Memories · 权限";
    heading.append(title, subtitle);
    const topActions = document.createElement("div");
    topActions.className = "top-actions";
    const tutorial = document.createElement("button");
    tutorial.type = "button";
    tutorial.className = "action tutorial-button";
    tutorial.textContent = "使用教程";
    tutorial.addEventListener("click", () => {
      closeStudio();
      window[INJECTOR_GLOBAL_KEY]?.viewTutorial?.();
    }, { signal });
    const close = document.createElement("button");
    close.type = "button";
    close.className = "icon-button";
    close.textContent = "×";
    close.addEventListener("click", closeStudio, { signal });
    topActions.append(tutorial, close);
    top.append(heading, topActions);

    const body = document.createElement("div");
    body.className = "body";
    const sidebar = document.createElement("aside");
    sidebar.className = "sidebar";
    const newButton = document.createElement("button");
    newButton.type = "button";
    newButton.className = "new-button";
    newButton.textContent = "+ 新建环境";
    newButton.addEventListener("click", clearForm, { signal });
    ui.profileList = document.createElement("div");
    ui.profileList.className = "profile-list";
    sidebar.append(newButton, ui.profileList);

    const editor = document.createElement("main");
    editor.className = "editor";
    const fileInput = document.createElement("input");
    fileInput.type = "file";
    fileInput.accept = ".md,text/markdown,text/plain";
    fileInput.hidden = true;
    fileInput.addEventListener("change", () => loadAgentsFile(fileInput.files?.[0]), { signal });
    const drop = document.createElement("div");
    drop.className = "drop";
    drop.tabIndex = 0;
    ui.fileLabel = document.createElement("strong");
    ui.fileLabel.textContent = "拖入或选择 AGENTS.md";
    const dropHint = document.createElement("small");
    dropHint.textContent = "文件内容会成为 developerInstructions";
    drop.append(ui.fileLabel, dropHint, fileInput);
    drop.addEventListener("click", () => fileInput.click(), { signal });
    drop.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") fileInput.click();
    }, { signal });
    for (const name of ["dragenter", "dragover"]) {
      drop.addEventListener(name, (event) => {
        event.preventDefault();
        drop.dataset.drag = "true";
      }, { signal });
    }
    for (const name of ["dragleave", "drop"]) {
      drop.addEventListener(name, (event) => {
        event.preventDefault();
        delete drop.dataset.drag;
      }, { signal });
    }
    drop.addEventListener("drop", (event) => loadAgentsFile(event.dataTransfer?.files?.[0]), { signal });

    ui.id = textInput("例如 my-work");
    ui.name = textInput("显示名称");
    ui.model = textInput("留空继承 Base");
    ui.provider = textInput("留空继承 Base");
    ui.reasoning = selectInput([
      ["", "继承推理强度"], ["low", "Low"], ["medium", "Medium"], ["high", "High"],
      ["xhigh", "Extra high"], ["max", "Max"], ["ultra", "Ultra"],
    ]);
    ui.approval = selectInput([
      ["", "继承审批策略"], ["on-request", "On request"], ["untrusted", "Untrusted"], ["never", "Never"],
    ]);
    ui.sandbox = selectInput([
      ["", "继承沙箱"], ["read-only", "Read only"], ["workspace-write", "Workspace write"], ["danger-full-access", "Full access"],
    ]);
    ui.serviceTier = textInput("留空继承，例如 default / priority");
    ui.memoryUse = selectInput([
      ["inherit", "继承 Memory 读取"], ["on", "使用已有 Memories"], ["off", "禁用已有 Memories"],
    ]);
    ui.memoryGenerate = selectInput([
      ["inherit", "继承 Memory 生成"], ["on", "允许生成未来 Memories"], ["off", "禁止本会话进入 Memories"],
    ]);
    const grid = document.createElement("div");
    grid.className = "grid";
    grid.append(
      field("环境 ID", ui.id), field("显示名称", ui.name),
      field("模型（可选）", ui.model), field("Provider（可选）", ui.provider),
      field("推理强度（可选）", ui.reasoning), field("审批策略（可选）", ui.approval),
      field("沙箱（可选）", ui.sandbox), field("Service tier（可选）", ui.serviceTier),
      field("Memory 读取", ui.memoryUse), field("Memory 生成", ui.memoryGenerate),
    );

    ui.instructions = document.createElement("textarea");
    ui.instructions.placeholder = "环境级 Developer Instructions / AGENTS.md 内容";
    const instructionsField = field("Developer Instructions / AGENTS.md", ui.instructions);
    ui.baseInstructions = document.createElement("textarea");
    ui.baseInstructions.className = "compact";
    ui.baseInstructions.placeholder = "可选：覆盖环境的 Base Instructions；留空继承 Codex 默认。";
    const baseInstructionsField = field("Base Instructions（高级，可选）", ui.baseInstructions);

    const actions = document.createElement("div");
    actions.className = "actions";
    ui.useNext = document.createElement("input");
    ui.useNext.type = "checkbox";
    ui.useNext.checked = true;
    const useNextLabel = document.createElement("label");
    useNextLabel.className = "check";
    const useNextText = document.createElement("span");
    useNextText.textContent = "保存后设为下个对话";
    useNextLabel.append(ui.useNext, useNextText);
    const save = document.createElement("button");
    save.type = "button";
    save.className = "action primary";
    save.textContent = "打包并保存";
    save.addEventListener("click", saveCurrentProfile, { signal });
    ui.saveButton = save;
    const exportButton = document.createElement("button");
    exportButton.type = "button";
    exportButton.className = "action";
    exportButton.textContent = "导出 .config.toml";
    exportButton.addEventListener("click", exportCurrentProfile, { signal });
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "action danger";
    remove.textContent = "删除";
    remove.disabled = true;
    remove.addEventListener("click", deleteCurrentProfile, { signal });
    ui.removeButton = remove;
    actions.append(useNextLabel, save, exportButton, remove);

    ui.status = document.createElement("div");
    ui.status.className = "status";
    editor.append(drop, grid, instructionsField, baseInstructionsField, actions, ui.status);
    body.append(sidebar, editor);
    box.append(top, body);
    backdrop.append(box);
    backdrop.addEventListener("pointerdown", (event) => {
      if (event.target === backdrop) closeStudio();
    }, { signal });
    shadow.append(style, backdrop);
    document.documentElement.append(host);
    clearForm();
  }

  function openStudio() {
    if (uiAdapter?.open) {
      uiAdapter.open();
      return;
    }
    store = loadStore();
    renderProfileList();
    if (dialog) dialog.hidden = false;
    host.style.pointerEvents = "auto";
  }

  function closeStudio() {
    if (uiAdapter?.close) {
      uiAdapter.close();
      return;
    }
    if (dialog) dialog.hidden = true;
    if (host) host.style.pointerEvents = "none";
  }

  function normalizedText(value) {
    return String(value || "").replace(/\s+/g, " ").trim().toLowerCase();
  }

  function findSidebarReference() {
    const roots = Array.from(document.querySelectorAll('nav,aside,[role="navigation"]'));
    const elements = roots.length
      ? roots.flatMap((root) => Array.from(root.querySelectorAll('a,button,[role="button"]')))
      : Array.from(document.querySelectorAll('a,button,[role="button"]'));
    const exact = (element, labels) => {
      const text = normalizedText([
        element.getAttribute("aria-label"),
        element.getAttribute("title"),
        element.textContent,
      ].filter(Boolean).join(" "));
      return labels.some((label) => text === label || text.endsWith(` ${label}`));
    };
    return elements.find((element) => exact(element, ["插件", "plugins"]))
      || elements.find((element) => exact(element, ["已安排", "scheduled"]));
  }

  function replaceNavText(root) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    const target = nodes.find((node) => /^(插件|plugins|已安排|scheduled)$/i.test(String(node.nodeValue || "").trim()));
    if (target) target.nodeValue = "环境注入器";
    else {
      const text = document.createElement("span");
      text.textContent = "环境注入器";
      root.append(text);
    }
  }

  function installSidebarEntry() {
    if (destroyed) return;
    if (document.querySelector(`[${NAV_ATTR}]`)) return;
    const reference = findSidebarReference();
    if (!reference || !reference.parentElement) return;
    const clone = reference.cloneNode(true);
    clone.setAttribute(NAV_ATTR, "true");
    clone.removeAttribute("id");
    clone.removeAttribute("aria-current");
    clone.removeAttribute("data-state");
    if (clone instanceof HTMLAnchorElement) clone.href = "#";
    clone.querySelectorAll("[id]").forEach((node) => node.removeAttribute("id"));
    replaceNavText(clone);
    clone.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      openStudio();
    }, { signal });
    reference.insertAdjacentElement("afterend", clone);
    navNode = clone;
  }

  function scheduleSidebarScan() {
    window.clearTimeout(scanTimer);
    scanTimer = window.setTimeout(() => {
      installSidebarEntry();
    }, 120);
  }

  function attachUiAdapter(adapter) {
    if (!adapter || typeof adapter.open !== "function" || typeof adapter.close !== "function") {
      throw new TypeError("Environment Studio UI adapter is invalid");
    }
    if (uiAdapter && uiAdapter !== adapter) {
      try { uiAdapter.destroy?.(); } catch {}
    }
    uiAdapter = adapter;
    if (dialog) dialog.hidden = true;
    if (host) host.style.pointerEvents = "none";
    return () => {
      if (uiAdapter !== adapter) return;
      uiAdapter = null;
    };
  }

  function destroy() {
    if (destroyed) return;
    destroyed = true;
    lifetime.abort();
    observer?.disconnect();
    window.clearTimeout(scanTimer);
    try { uiAdapter?.destroy?.(); } catch {}
    uiAdapter = null;
    navNode?.remove();
    host?.remove();
    const currentApi = window[GLOBAL_KEY];
    if (window[LEGACY_GLOBAL_KEY] === currentApi || window[LEGACY_GLOBAL_KEY]?.version === VERSION) {
      delete window[LEGACY_GLOBAL_KEY];
    }
    if (currentApi?.version === VERSION) delete window[GLOBAL_KEY];
  }

  if (window.__CODEX_ENVIRONMENT_STUDIO_TEST__ || window.__CODEX_PROFILE_STUDIO_TEST__) {
    const testApi = {
      slugify,
      titleFromMarkdown,
      profileToml,
      likelyContainsSecret,
      validateProfile,
      profileEntries,
      fileProfileEntries,
      storedProfileEntries,
      selectorProfileId,
      storageKeyFor,
      environmentStore: () => cloneJson(store),
    };
    window.__codexEnvironmentStudioTest = testApi;
    window.__codexPlusProfileStudioTest = testApi;
    return;
  }

  createUi();
  installSidebarEntry();
  observer = new MutationObserver(scheduleSidebarScan);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && dialog && !dialog.hidden) closeStudio();
  }, { signal });
  window.addEventListener(UPDATE_EVENT, () => {
    store = loadStore();
    renderProfileList();
  }, { signal });

  const publicApi = {
    version: VERSION,
    open: openStudio,
    close: closeStudio,
    attachUiAdapter,
    list: () => profileEntries().map(({ id, name, model, modelProvider, memoryPolicy, updatedAt, sourceKind, targetProfileId }) => ({ id, name, model, modelProvider, memoryPolicy, updatedAt, sourceKind, targetProfileId })),
    status: () => {
      let adapterStatus = null;
      try { adapterStatus = uiAdapter?.status?.() || null; } catch {}
      return {
        name: "环境注入器",
        version: VERSION,
        profiles: profileEntries().length,
        fileProfiles: fileProfileEntries().length,
        storedProfiles: storedProfileEntries().length,
        storeRevision: Number(store.revision || 0),
        sidebarInstalled: !!document.querySelector(`[${NAV_ATTR}]`),
        open: adapterStatus ? adapterStatus.open === true : !!dialog && !dialog.hidden,
        renderer: adapterStatus ? "react" : "vanilla",
      };
    },
    destroy,
  };
  window[GLOBAL_KEY] = publicApi;
  window[LEGACY_GLOBAL_KEY] = publicApi;
})();

/* Environment Injector React 19 UI */
"use strict";
(() => {
  var __create = Object.create;
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __getProtoOf = Object.getPrototypeOf;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __commonJS = (cb, mod) => function __require() {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
    // If the importer is in node compatibility mode or this is not an ESM
    // file that has been converted to a CommonJS file using a Babel-
    // compatible transform (i.e. "__esModule" has not been set), then set
    // "default" to the CommonJS "module.exports" for node compatibility.
    isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
    mod
  ));

  // node_modules/scheduler/cjs/scheduler.production.js
  var require_scheduler_production = __commonJS({
    "node_modules/scheduler/cjs/scheduler.production.js"(exports) {
      "use strict";
      function push(heap, node) {
        var index = heap.length;
        heap.push(node);
        a: for (; 0 < index; ) {
          var parentIndex = index - 1 >>> 1, parent = heap[parentIndex];
          if (0 < compare(parent, node))
            heap[parentIndex] = node, heap[index] = parent, index = parentIndex;
          else break a;
        }
      }
      function peek(heap) {
        return 0 === heap.length ? null : heap[0];
      }
      function pop(heap) {
        if (0 === heap.length) return null;
        var first = heap[0], last = heap.pop();
        if (last !== first) {
          heap[0] = last;
          a: for (var index = 0, length = heap.length, halfLength = length >>> 1; index < halfLength; ) {
            var leftIndex = 2 * (index + 1) - 1, left = heap[leftIndex], rightIndex = leftIndex + 1, right = heap[rightIndex];
            if (0 > compare(left, last))
              rightIndex < length && 0 > compare(right, left) ? (heap[index] = right, heap[rightIndex] = last, index = rightIndex) : (heap[index] = left, heap[leftIndex] = last, index = leftIndex);
            else if (rightIndex < length && 0 > compare(right, last))
              heap[index] = right, heap[rightIndex] = last, index = rightIndex;
            else break a;
          }
        }
        return first;
      }
      function compare(a, b) {
        var diff = a.sortIndex - b.sortIndex;
        return 0 !== diff ? diff : a.id - b.id;
      }
      exports.unstable_now = void 0;
      if ("object" === typeof performance && "function" === typeof performance.now) {
        localPerformance = performance;
        exports.unstable_now = function() {
          return localPerformance.now();
        };
      } else {
        localDate = Date, initialTime = localDate.now();
        exports.unstable_now = function() {
          return localDate.now() - initialTime;
        };
      }
      var localPerformance;
      var localDate;
      var initialTime;
      var taskQueue = [];
      var timerQueue = [];
      var taskIdCounter = 1;
      var currentTask = null;
      var currentPriorityLevel = 3;
      var isPerformingWork = false;
      var isHostCallbackScheduled = false;
      var isHostTimeoutScheduled = false;
      var needsPaint = false;
      var localSetTimeout = "function" === typeof setTimeout ? setTimeout : null;
      var localClearTimeout = "function" === typeof clearTimeout ? clearTimeout : null;
      var localSetImmediate = "undefined" !== typeof setImmediate ? setImmediate : null;
      function advanceTimers(currentTime) {
        for (var timer = peek(timerQueue); null !== timer; ) {
          if (null === timer.callback) pop(timerQueue);
          else if (timer.startTime <= currentTime)
            pop(timerQueue), timer.sortIndex = timer.expirationTime, push(taskQueue, timer);
          else break;
          timer = peek(timerQueue);
        }
      }
      function handleTimeout(currentTime) {
        isHostTimeoutScheduled = false;
        advanceTimers(currentTime);
        if (!isHostCallbackScheduled)
          if (null !== peek(taskQueue))
            isHostCallbackScheduled = true, isMessageLoopRunning || (isMessageLoopRunning = true, schedulePerformWorkUntilDeadline());
          else {
            var firstTimer = peek(timerQueue);
            null !== firstTimer && requestHostTimeout(handleTimeout, firstTimer.startTime - currentTime);
          }
      }
      var isMessageLoopRunning = false;
      var taskTimeoutID = -1;
      var frameInterval = 5;
      var startTime = -1;
      function shouldYieldToHost() {
        return needsPaint ? true : exports.unstable_now() - startTime < frameInterval ? false : true;
      }
      function performWorkUntilDeadline() {
        needsPaint = false;
        if (isMessageLoopRunning) {
          var currentTime = exports.unstable_now();
          startTime = currentTime;
          var hasMoreWork = true;
          try {
            a: {
              isHostCallbackScheduled = false;
              isHostTimeoutScheduled && (isHostTimeoutScheduled = false, localClearTimeout(taskTimeoutID), taskTimeoutID = -1);
              isPerformingWork = true;
              var previousPriorityLevel = currentPriorityLevel;
              try {
                b: {
                  advanceTimers(currentTime);
                  for (currentTask = peek(taskQueue); null !== currentTask && !(currentTask.expirationTime > currentTime && shouldYieldToHost()); ) {
                    var callback = currentTask.callback;
                    if ("function" === typeof callback) {
                      currentTask.callback = null;
                      currentPriorityLevel = currentTask.priorityLevel;
                      var continuationCallback = callback(
                        currentTask.expirationTime <= currentTime
                      );
                      currentTime = exports.unstable_now();
                      if ("function" === typeof continuationCallback) {
                        currentTask.callback = continuationCallback;
                        advanceTimers(currentTime);
                        hasMoreWork = true;
                        break b;
                      }
                      currentTask === peek(taskQueue) && pop(taskQueue);
                      advanceTimers(currentTime);
                    } else pop(taskQueue);
                    currentTask = peek(taskQueue);
                  }
                  if (null !== currentTask) hasMoreWork = true;
                  else {
                    var firstTimer = peek(timerQueue);
                    null !== firstTimer && requestHostTimeout(
                      handleTimeout,
                      firstTimer.startTime - currentTime
                    );
                    hasMoreWork = false;
                  }
                }
                break a;
              } finally {
                currentTask = null, currentPriorityLevel = previousPriorityLevel, isPerformingWork = false;
              }
              hasMoreWork = void 0;
            }
          } finally {
            hasMoreWork ? schedulePerformWorkUntilDeadline() : isMessageLoopRunning = false;
          }
        }
      }
      var schedulePerformWorkUntilDeadline;
      if ("function" === typeof localSetImmediate)
        schedulePerformWorkUntilDeadline = function() {
          localSetImmediate(performWorkUntilDeadline);
        };
      else if ("undefined" !== typeof MessageChannel) {
        channel = new MessageChannel(), port = channel.port2;
        channel.port1.onmessage = performWorkUntilDeadline;
        schedulePerformWorkUntilDeadline = function() {
          port.postMessage(null);
        };
      } else
        schedulePerformWorkUntilDeadline = function() {
          localSetTimeout(performWorkUntilDeadline, 0);
        };
      var channel;
      var port;
      function requestHostTimeout(callback, ms) {
        taskTimeoutID = localSetTimeout(function() {
          callback(exports.unstable_now());
        }, ms);
      }
      exports.unstable_IdlePriority = 5;
      exports.unstable_ImmediatePriority = 1;
      exports.unstable_LowPriority = 4;
      exports.unstable_NormalPriority = 3;
      exports.unstable_Profiling = null;
      exports.unstable_UserBlockingPriority = 2;
      exports.unstable_cancelCallback = function(task) {
        task.callback = null;
      };
      exports.unstable_forceFrameRate = function(fps) {
        0 > fps || 125 < fps ? console.error(
          "forceFrameRate takes a positive int between 0 and 125, forcing frame rates higher than 125 fps is not supported"
        ) : frameInterval = 0 < fps ? Math.floor(1e3 / fps) : 5;
      };
      exports.unstable_getCurrentPriorityLevel = function() {
        return currentPriorityLevel;
      };
      exports.unstable_next = function(eventHandler) {
        switch (currentPriorityLevel) {
          case 1:
          case 2:
          case 3:
            var priorityLevel = 3;
            break;
          default:
            priorityLevel = currentPriorityLevel;
        }
        var previousPriorityLevel = currentPriorityLevel;
        currentPriorityLevel = priorityLevel;
        try {
          return eventHandler();
        } finally {
          currentPriorityLevel = previousPriorityLevel;
        }
      };
      exports.unstable_requestPaint = function() {
        needsPaint = true;
      };
      exports.unstable_runWithPriority = function(priorityLevel, eventHandler) {
        switch (priorityLevel) {
          case 1:
          case 2:
          case 3:
          case 4:
          case 5:
            break;
          default:
            priorityLevel = 3;
        }
        var previousPriorityLevel = currentPriorityLevel;
        currentPriorityLevel = priorityLevel;
        try {
          return eventHandler();
        } finally {
          currentPriorityLevel = previousPriorityLevel;
        }
      };
      exports.unstable_scheduleCallback = function(priorityLevel, callback, options) {
        var currentTime = exports.unstable_now();
        "object" === typeof options && null !== options ? (options = options.delay, options = "number" === typeof options && 0 < options ? currentTime + options : currentTime) : options = currentTime;
        switch (priorityLevel) {
          case 1:
            var timeout = -1;
            break;
          case 2:
            timeout = 250;
            break;
          case 5:
            timeout = 1073741823;
            break;
          case 4:
            timeout = 1e4;
            break;
          default:
            timeout = 5e3;
        }
        timeout = options + timeout;
        priorityLevel = {
          id: taskIdCounter++,
          callback,
          priorityLevel,
          startTime: options,
          expirationTime: timeout,
          sortIndex: -1
        };
        options > currentTime ? (priorityLevel.sortIndex = options, push(timerQueue, priorityLevel), null === peek(taskQueue) && priorityLevel === peek(timerQueue) && (isHostTimeoutScheduled ? (localClearTimeout(taskTimeoutID), taskTimeoutID = -1) : isHostTimeoutScheduled = true, requestHostTimeout(handleTimeout, options - currentTime))) : (priorityLevel.sortIndex = timeout, push(taskQueue, priorityLevel), isHostCallbackScheduled || isPerformingWork || (isHostCallbackScheduled = true, isMessageLoopRunning || (isMessageLoopRunning = true, schedulePerformWorkUntilDeadline())));
        return priorityLevel;
      };
      exports.unstable_shouldYield = shouldYieldToHost;
      exports.unstable_wrapCallback = function(callback) {
        var parentPriorityLevel = currentPriorityLevel;
        return function() {
          var previousPriorityLevel = currentPriorityLevel;
          currentPriorityLevel = parentPriorityLevel;
          try {
            return callback.apply(this, arguments);
          } finally {
            currentPriorityLevel = previousPriorityLevel;
          }
        };
      };
    }
  });

  // node_modules/scheduler/index.js
  var require_scheduler = __commonJS({
    "node_modules/scheduler/index.js"(exports, module) {
      "use strict";
      if (true) {
        module.exports = require_scheduler_production();
      } else {
        module.exports = null;
      }
    }
  });

  // node_modules/react/cjs/react.production.js
  var require_react_production = __commonJS({
    "node_modules/react/cjs/react.production.js"(exports) {
      "use strict";
      var REACT_ELEMENT_TYPE = Symbol.for("react.transitional.element");
      var REACT_PORTAL_TYPE = Symbol.for("react.portal");
      var REACT_FRAGMENT_TYPE = Symbol.for("react.fragment");
      var REACT_STRICT_MODE_TYPE = Symbol.for("react.strict_mode");
      var REACT_PROFILER_TYPE = Symbol.for("react.profiler");
      var REACT_CONSUMER_TYPE = Symbol.for("react.consumer");
      var REACT_CONTEXT_TYPE = Symbol.for("react.context");
      var REACT_FORWARD_REF_TYPE = Symbol.for("react.forward_ref");
      var REACT_SUSPENSE_TYPE = Symbol.for("react.suspense");
      var REACT_MEMO_TYPE = Symbol.for("react.memo");
      var REACT_LAZY_TYPE = Symbol.for("react.lazy");
      var REACT_ACTIVITY_TYPE = Symbol.for("react.activity");
      var MAYBE_ITERATOR_SYMBOL = Symbol.iterator;
      function getIteratorFn(maybeIterable) {
        if (null === maybeIterable || "object" !== typeof maybeIterable) return null;
        maybeIterable = MAYBE_ITERATOR_SYMBOL && maybeIterable[MAYBE_ITERATOR_SYMBOL] || maybeIterable["@@iterator"];
        return "function" === typeof maybeIterable ? maybeIterable : null;
      }
      var ReactNoopUpdateQueue = {
        isMounted: function() {
          return false;
        },
        enqueueForceUpdate: function() {
        },
        enqueueReplaceState: function() {
        },
        enqueueSetState: function() {
        }
      };
      var assign = Object.assign;
      var emptyObject = {};
      function Component2(props, context, updater) {
        this.props = props;
        this.context = context;
        this.refs = emptyObject;
        this.updater = updater || ReactNoopUpdateQueue;
      }
      Component2.prototype.isReactComponent = {};
      Component2.prototype.setState = function(partialState, callback) {
        if ("object" !== typeof partialState && "function" !== typeof partialState && null != partialState)
          throw Error(
            "takes an object of state variables to update or a function which returns an object of state variables."
          );
        this.updater.enqueueSetState(this, partialState, callback, "setState");
      };
      Component2.prototype.forceUpdate = function(callback) {
        this.updater.enqueueForceUpdate(this, callback, "forceUpdate");
      };
      function ComponentDummy() {
      }
      ComponentDummy.prototype = Component2.prototype;
      function PureComponent(props, context, updater) {
        this.props = props;
        this.context = context;
        this.refs = emptyObject;
        this.updater = updater || ReactNoopUpdateQueue;
      }
      var pureComponentPrototype = PureComponent.prototype = new ComponentDummy();
      pureComponentPrototype.constructor = PureComponent;
      assign(pureComponentPrototype, Component2.prototype);
      pureComponentPrototype.isPureReactComponent = true;
      var isArrayImpl = Array.isArray;
      function noop() {
      }
      var ReactSharedInternals = { H: null, A: null, T: null, S: null };
      var hasOwnProperty = Object.prototype.hasOwnProperty;
      function ReactElement(type, key, props) {
        var refProp = props.ref;
        return {
          $$typeof: REACT_ELEMENT_TYPE,
          type,
          key,
          ref: void 0 !== refProp ? refProp : null,
          props
        };
      }
      function cloneAndReplaceKey(oldElement, newKey) {
        return ReactElement(oldElement.type, newKey, oldElement.props);
      }
      function isValidElement(object) {
        return "object" === typeof object && null !== object && object.$$typeof === REACT_ELEMENT_TYPE;
      }
      function escape(key) {
        var escaperLookup = { "=": "=0", ":": "=2" };
        return "$" + key.replace(/[=:]/g, function(match) {
          return escaperLookup[match];
        });
      }
      var userProvidedKeyEscapeRegex = /\/+/g;
      function getElementKey(element, index) {
        return "object" === typeof element && null !== element && null != element.key ? escape("" + element.key) : index.toString(36);
      }
      function resolveThenable(thenable) {
        switch (thenable.status) {
          case "fulfilled":
            return thenable.value;
          case "rejected":
            throw thenable.reason;
          default:
            switch ("string" === typeof thenable.status ? thenable.then(noop, noop) : (thenable.status = "pending", thenable.then(
              function(fulfilledValue) {
                "pending" === thenable.status && (thenable.status = "fulfilled", thenable.value = fulfilledValue);
              },
              function(error) {
                "pending" === thenable.status && (thenable.status = "rejected", thenable.reason = error);
              }
            )), thenable.status) {
              case "fulfilled":
                return thenable.value;
              case "rejected":
                throw thenable.reason;
            }
        }
        throw thenable;
      }
      function mapIntoArray(children, array, escapedPrefix, nameSoFar, callback) {
        var type = typeof children;
        if ("undefined" === type || "boolean" === type) children = null;
        var invokeCallback = false;
        if (null === children) invokeCallback = true;
        else
          switch (type) {
            case "bigint":
            case "string":
            case "number":
              invokeCallback = true;
              break;
            case "object":
              switch (children.$$typeof) {
                case REACT_ELEMENT_TYPE:
                case REACT_PORTAL_TYPE:
                  invokeCallback = true;
                  break;
                case REACT_LAZY_TYPE:
                  return invokeCallback = children._init, mapIntoArray(
                    invokeCallback(children._payload),
                    array,
                    escapedPrefix,
                    nameSoFar,
                    callback
                  );
              }
          }
        if (invokeCallback)
          return callback = callback(children), invokeCallback = "" === nameSoFar ? "." + getElementKey(children, 0) : nameSoFar, isArrayImpl(callback) ? (escapedPrefix = "", null != invokeCallback && (escapedPrefix = invokeCallback.replace(userProvidedKeyEscapeRegex, "$&/") + "/"), mapIntoArray(callback, array, escapedPrefix, "", function(c) {
            return c;
          })) : null != callback && (isValidElement(callback) && (callback = cloneAndReplaceKey(
            callback,
            escapedPrefix + (null == callback.key || children && children.key === callback.key ? "" : ("" + callback.key).replace(
              userProvidedKeyEscapeRegex,
              "$&/"
            ) + "/") + invokeCallback
          )), array.push(callback)), 1;
        invokeCallback = 0;
        var nextNamePrefix = "" === nameSoFar ? "." : nameSoFar + ":";
        if (isArrayImpl(children))
          for (var i = 0; i < children.length; i++)
            nameSoFar = children[i], type = nextNamePrefix + getElementKey(nameSoFar, i), invokeCallback += mapIntoArray(
              nameSoFar,
              array,
              escapedPrefix,
              type,
              callback
            );
        else if (i = getIteratorFn(children), "function" === typeof i)
          for (children = i.call(children), i = 0; !(nameSoFar = children.next()).done; )
            nameSoFar = nameSoFar.value, type = nextNamePrefix + getElementKey(nameSoFar, i++), invokeCallback += mapIntoArray(
              nameSoFar,
              array,
              escapedPrefix,
              type,
              callback
            );
        else if ("object" === type) {
          if ("function" === typeof children.then)
            return mapIntoArray(
              resolveThenable(children),
              array,
              escapedPrefix,
              nameSoFar,
              callback
            );
          array = String(children);
          throw Error(
            "Objects are not valid as a React child (found: " + ("[object Object]" === array ? "object with keys {" + Object.keys(children).join(", ") + "}" : array) + "). If you meant to render a collection of children, use an array instead."
          );
        }
        return invokeCallback;
      }
      function mapChildren(children, func, context) {
        if (null == children) return children;
        var result = [], count = 0;
        mapIntoArray(children, result, "", "", function(child) {
          return func.call(context, child, count++);
        });
        return result;
      }
      function lazyInitializer(payload) {
        if (-1 === payload._status) {
          var ctor = payload._result;
          ctor = ctor();
          ctor.then(
            function(moduleObject) {
              if (0 === payload._status || -1 === payload._status)
                payload._status = 1, payload._result = moduleObject;
            },
            function(error) {
              if (0 === payload._status || -1 === payload._status)
                payload._status = 2, payload._result = error;
            }
          );
          -1 === payload._status && (payload._status = 0, payload._result = ctor);
        }
        if (1 === payload._status) return payload._result.default;
        throw payload._result;
      }
      var reportGlobalError = "function" === typeof reportError ? reportError : function(error) {
        if ("object" === typeof window && "function" === typeof window.ErrorEvent) {
          var event = new window.ErrorEvent("error", {
            bubbles: true,
            cancelable: true,
            message: "object" === typeof error && null !== error && "string" === typeof error.message ? String(error.message) : String(error),
            error
          });
          if (!window.dispatchEvent(event)) return;
        } else if ("object" === typeof process && "function" === typeof process.emit) {
          process.emit("uncaughtException", error);
          return;
        }
        console.error(error);
      };
      var Children = {
        map: mapChildren,
        forEach: function(children, forEachFunc, forEachContext) {
          mapChildren(
            children,
            function() {
              forEachFunc.apply(this, arguments);
            },
            forEachContext
          );
        },
        count: function(children) {
          var n = 0;
          mapChildren(children, function() {
            n++;
          });
          return n;
        },
        toArray: function(children) {
          return mapChildren(children, function(child) {
            return child;
          }) || [];
        },
        only: function(children) {
          if (!isValidElement(children))
            throw Error(
              "React.Children.only expected to receive a single React element child."
            );
          return children;
        }
      };
      exports.Activity = REACT_ACTIVITY_TYPE;
      exports.Children = Children;
      exports.Component = Component2;
      exports.Fragment = REACT_FRAGMENT_TYPE;
      exports.Profiler = REACT_PROFILER_TYPE;
      exports.PureComponent = PureComponent;
      exports.StrictMode = REACT_STRICT_MODE_TYPE;
      exports.Suspense = REACT_SUSPENSE_TYPE;
      exports.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE = ReactSharedInternals;
      exports.__COMPILER_RUNTIME = {
        __proto__: null,
        c: function(size) {
          return ReactSharedInternals.H.useMemoCache(size);
        }
      };
      exports.cache = function(fn) {
        return function() {
          return fn.apply(null, arguments);
        };
      };
      exports.cacheSignal = function() {
        return null;
      };
      exports.cloneElement = function(element, config, children) {
        if (null === element || void 0 === element)
          throw Error(
            "The argument must be a React element, but you passed " + element + "."
          );
        var props = assign({}, element.props), key = element.key;
        if (null != config)
          for (propName in void 0 !== config.key && (key = "" + config.key), config)
            !hasOwnProperty.call(config, propName) || "key" === propName || "__self" === propName || "__source" === propName || "ref" === propName && void 0 === config.ref || (props[propName] = config[propName]);
        var propName = arguments.length - 2;
        if (1 === propName) props.children = children;
        else if (1 < propName) {
          for (var childArray = Array(propName), i = 0; i < propName; i++)
            childArray[i] = arguments[i + 2];
          props.children = childArray;
        }
        return ReactElement(element.type, key, props);
      };
      exports.createContext = function(defaultValue) {
        defaultValue = {
          $$typeof: REACT_CONTEXT_TYPE,
          _currentValue: defaultValue,
          _currentValue2: defaultValue,
          _threadCount: 0,
          Provider: null,
          Consumer: null
        };
        defaultValue.Provider = defaultValue;
        defaultValue.Consumer = {
          $$typeof: REACT_CONSUMER_TYPE,
          _context: defaultValue
        };
        return defaultValue;
      };
      exports.createElement = function(type, config, children) {
        var propName, props = {}, key = null;
        if (null != config)
          for (propName in void 0 !== config.key && (key = "" + config.key), config)
            hasOwnProperty.call(config, propName) && "key" !== propName && "__self" !== propName && "__source" !== propName && (props[propName] = config[propName]);
        var childrenLength = arguments.length - 2;
        if (1 === childrenLength) props.children = children;
        else if (1 < childrenLength) {
          for (var childArray = Array(childrenLength), i = 0; i < childrenLength; i++)
            childArray[i] = arguments[i + 2];
          props.children = childArray;
        }
        if (type && type.defaultProps)
          for (propName in childrenLength = type.defaultProps, childrenLength)
            void 0 === props[propName] && (props[propName] = childrenLength[propName]);
        return ReactElement(type, key, props);
      };
      exports.createRef = function() {
        return { current: null };
      };
      exports.forwardRef = function(render) {
        return { $$typeof: REACT_FORWARD_REF_TYPE, render };
      };
      exports.isValidElement = isValidElement;
      exports.lazy = function(ctor) {
        return {
          $$typeof: REACT_LAZY_TYPE,
          _payload: { _status: -1, _result: ctor },
          _init: lazyInitializer
        };
      };
      exports.memo = function(type, compare) {
        return {
          $$typeof: REACT_MEMO_TYPE,
          type,
          compare: void 0 === compare ? null : compare
        };
      };
      exports.startTransition = function(scope) {
        var prevTransition = ReactSharedInternals.T, currentTransition = {};
        ReactSharedInternals.T = currentTransition;
        try {
          var returnValue = scope(), onStartTransitionFinish = ReactSharedInternals.S;
          null !== onStartTransitionFinish && onStartTransitionFinish(currentTransition, returnValue);
          "object" === typeof returnValue && null !== returnValue && "function" === typeof returnValue.then && returnValue.then(noop, reportGlobalError);
        } catch (error) {
          reportGlobalError(error);
        } finally {
          null !== prevTransition && null !== currentTransition.types && (prevTransition.types = currentTransition.types), ReactSharedInternals.T = prevTransition;
        }
      };
      exports.unstable_useCacheRefresh = function() {
        return ReactSharedInternals.H.useCacheRefresh();
      };
      exports.use = function(usable) {
        return ReactSharedInternals.H.use(usable);
      };
      exports.useActionState = function(action, initialState, permalink) {
        return ReactSharedInternals.H.useActionState(action, initialState, permalink);
      };
      exports.useCallback = function(callback, deps) {
        return ReactSharedInternals.H.useCallback(callback, deps);
      };
      exports.useContext = function(Context) {
        return ReactSharedInternals.H.useContext(Context);
      };
      exports.useDebugValue = function() {
      };
      exports.useDeferredValue = function(value, initialValue) {
        return ReactSharedInternals.H.useDeferredValue(value, initialValue);
      };
      exports.useEffect = function(create, deps) {
        return ReactSharedInternals.H.useEffect(create, deps);
      };
      exports.useEffectEvent = function(callback) {
        return ReactSharedInternals.H.useEffectEvent(callback);
      };
      exports.useId = function() {
        return ReactSharedInternals.H.useId();
      };
      exports.useImperativeHandle = function(ref, create, deps) {
        return ReactSharedInternals.H.useImperativeHandle(ref, create, deps);
      };
      exports.useInsertionEffect = function(create, deps) {
        return ReactSharedInternals.H.useInsertionEffect(create, deps);
      };
      exports.useLayoutEffect = function(create, deps) {
        return ReactSharedInternals.H.useLayoutEffect(create, deps);
      };
      exports.useMemo = function(create, deps) {
        return ReactSharedInternals.H.useMemo(create, deps);
      };
      exports.useOptimistic = function(passthrough, reducer) {
        return ReactSharedInternals.H.useOptimistic(passthrough, reducer);
      };
      exports.useReducer = function(reducer, initialArg, init) {
        return ReactSharedInternals.H.useReducer(reducer, initialArg, init);
      };
      exports.useRef = function(initialValue) {
        return ReactSharedInternals.H.useRef(initialValue);
      };
      exports.useState = function(initialState) {
        return ReactSharedInternals.H.useState(initialState);
      };
      exports.useSyncExternalStore = function(subscribe, getSnapshot, getServerSnapshot) {
        return ReactSharedInternals.H.useSyncExternalStore(
          subscribe,
          getSnapshot,
          getServerSnapshot
        );
      };
      exports.useTransition = function() {
        return ReactSharedInternals.H.useTransition();
      };
      exports.version = "19.2.8";
    }
  });

  // node_modules/react/index.js
  var require_react = __commonJS({
    "node_modules/react/index.js"(exports, module) {
      "use strict";
      if (true) {
        module.exports = require_react_production();
      } else {
        module.exports = null;
      }
    }
  });

  // node_modules/react-dom/cjs/react-dom.production.js
  var require_react_dom_production = __commonJS({
    "node_modules/react-dom/cjs/react-dom.production.js"(exports) {
      "use strict";
      var React3 = require_react();
      function formatProdErrorMessage(code) {
        var url = "https://react.dev/errors/" + code;
        if (1 < arguments.length) {
          url += "?args[]=" + encodeURIComponent(arguments[1]);
          for (var i = 2; i < arguments.length; i++)
            url += "&args[]=" + encodeURIComponent(arguments[i]);
        }
        return "Minified React error #" + code + "; visit " + url + " for the full message or use the non-minified dev environment for full errors and additional helpful warnings.";
      }
      function noop() {
      }
      var Internals = {
        d: {
          f: noop,
          r: function() {
            throw Error(formatProdErrorMessage(522));
          },
          D: noop,
          C: noop,
          L: noop,
          m: noop,
          X: noop,
          S: noop,
          M: noop
        },
        p: 0,
        findDOMNode: null
      };
      var REACT_PORTAL_TYPE = Symbol.for("react.portal");
      function createPortal$1(children, containerInfo, implementation) {
        var key = 3 < arguments.length && void 0 !== arguments[3] ? arguments[3] : null;
        return {
          $$typeof: REACT_PORTAL_TYPE,
          key: null == key ? null : "" + key,
          children,
          containerInfo,
          implementation
        };
      }
      var ReactSharedInternals = React3.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;
      function getCrossOriginStringAs(as, input) {
        if ("font" === as) return "";
        if ("string" === typeof input)
          return "use-credentials" === input ? input : "";
      }
      exports.__DOM_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE = Internals;
      exports.createPortal = function(children, container) {
        var key = 2 < arguments.length && void 0 !== arguments[2] ? arguments[2] : null;
        if (!container || 1 !== container.nodeType && 9 !== container.nodeType && 11 !== container.nodeType)
          throw Error(formatProdErrorMessage(299));
        return createPortal$1(children, container, null, key);
      };
      exports.flushSync = function(fn) {
        var previousTransition = ReactSharedInternals.T, previousUpdatePriority = Internals.p;
        try {
          if (ReactSharedInternals.T = null, Internals.p = 2, fn) return fn();
        } finally {
          ReactSharedInternals.T = previousTransition, Internals.p = previousUpdatePriority, Internals.d.f();
        }
      };
      exports.preconnect = function(href, options) {
        "string" === typeof href && (options ? (options = options.crossOrigin, options = "string" === typeof options ? "use-credentials" === options ? options : "" : void 0) : options = null, Internals.d.C(href, options));
      };
      exports.prefetchDNS = function(href) {
        "string" === typeof href && Internals.d.D(href);
      };
      exports.preinit = function(href, options) {
        if ("string" === typeof href && options && "string" === typeof options.as) {
          var as = options.as, crossOrigin = getCrossOriginStringAs(as, options.crossOrigin), integrity = "string" === typeof options.integrity ? options.integrity : void 0, fetchPriority = "string" === typeof options.fetchPriority ? options.fetchPriority : void 0;
          "style" === as ? Internals.d.S(
            href,
            "string" === typeof options.precedence ? options.precedence : void 0,
            {
              crossOrigin,
              integrity,
              fetchPriority
            }
          ) : "script" === as && Internals.d.X(href, {
            crossOrigin,
            integrity,
            fetchPriority,
            nonce: "string" === typeof options.nonce ? options.nonce : void 0
          });
        }
      };
      exports.preinitModule = function(href, options) {
        if ("string" === typeof href)
          if ("object" === typeof options && null !== options) {
            if (null == options.as || "script" === options.as) {
              var crossOrigin = getCrossOriginStringAs(
                options.as,
                options.crossOrigin
              );
              Internals.d.M(href, {
                crossOrigin,
                integrity: "string" === typeof options.integrity ? options.integrity : void 0,
                nonce: "string" === typeof options.nonce ? options.nonce : void 0
              });
            }
          } else null == options && Internals.d.M(href);
      };
      exports.preload = function(href, options) {
        if ("string" === typeof href && "object" === typeof options && null !== options && "string" === typeof options.as) {
          var as = options.as, crossOrigin = getCrossOriginStringAs(as, options.crossOrigin);
          Internals.d.L(href, as, {
            crossOrigin,
            integrity: "string" === typeof options.integrity ? options.integrity : void 0,
            nonce: "string" === typeof options.nonce ? options.nonce : void 0,
            type: "string" === typeof options.type ? options.type : void 0,
            fetchPriority: "string" === typeof options.fetchPriority ? options.fetchPriority : void 0,
            referrerPolicy: "string" === typeof options.referrerPolicy ? options.referrerPolicy : void 0,
            imageSrcSet: "string" === typeof options.imageSrcSet ? options.imageSrcSet : void 0,
            imageSizes: "string" === typeof options.imageSizes ? options.imageSizes : void 0,
            media: "string" === typeof options.media ? options.media : void 0
          });
        }
      };
      exports.preloadModule = function(href, options) {
        if ("string" === typeof href)
          if (options) {
            var crossOrigin = getCrossOriginStringAs(options.as, options.crossOrigin);
            Internals.d.m(href, {
              as: "string" === typeof options.as && "script" !== options.as ? options.as : void 0,
              crossOrigin,
              integrity: "string" === typeof options.integrity ? options.integrity : void 0
            });
          } else Internals.d.m(href);
      };
      exports.requestFormReset = function(form) {
        Internals.d.r(form);
      };
      exports.unstable_batchedUpdates = function(fn, a) {
        return fn(a);
      };
      exports.useFormState = function(action, initialState, permalink) {
        return ReactSharedInternals.H.useFormState(action, initialState, permalink);
      };
      exports.useFormStatus = function() {
        return ReactSharedInternals.H.useHostTransitionStatus();
      };
      exports.version = "19.2.8";
    }
  });

  // node_modules/react-dom/index.js
  var require_react_dom = __commonJS({
    "node_modules/react-dom/index.js"(exports, module) {
      "use strict";
      function checkDCE() {
        if (typeof __REACT_DEVTOOLS_GLOBAL_HOOK__ === "undefined" || typeof __REACT_DEVTOOLS_GLOBAL_HOOK__.checkDCE !== "function") {
          return;
        }
        if (false) {
          throw new Error("^_^");
        }
        try {
          __REACT_DEVTOOLS_GLOBAL_HOOK__.checkDCE(checkDCE);
        } catch (err) {
          console.error(err);
        }
      }
      if (true) {
        checkDCE();
        module.exports = require_react_dom_production();
      } else {
        module.exports = null;
      }
    }
  });

  // node_modules/react-dom/cjs/react-dom-client.production.js
  var require_react_dom_client_production = __commonJS({
    "node_modules/react-dom/cjs/react-dom-client.production.js"(exports) {
      "use strict";
      var Scheduler = require_scheduler();
      var React3 = require_react();
      var ReactDOM = require_react_dom();
      function formatProdErrorMessage(code) {
        var url = "https://react.dev/errors/" + code;
        if (1 < arguments.length) {
          url += "?args[]=" + encodeURIComponent(arguments[1]);
          for (var i = 2; i < arguments.length; i++)
            url += "&args[]=" + encodeURIComponent(arguments[i]);
        }
        return "Minified React error #" + code + "; visit " + url + " for the full message or use the non-minified dev environment for full errors and additional helpful warnings.";
      }
      function isValidContainer(node) {
        return !(!node || 1 !== node.nodeType && 9 !== node.nodeType && 11 !== node.nodeType);
      }
      function getNearestMountedFiber(fiber) {
        var node = fiber, nearestMounted = fiber;
        if (fiber.alternate) for (; node.return; ) node = node.return;
        else {
          fiber = node;
          do
            node = fiber, 0 !== (node.flags & 4098) && (nearestMounted = node.return), fiber = node.return;
          while (fiber);
        }
        return 3 === node.tag ? nearestMounted : null;
      }
      function getSuspenseInstanceFromFiber(fiber) {
        if (13 === fiber.tag) {
          var suspenseState = fiber.memoizedState;
          null === suspenseState && (fiber = fiber.alternate, null !== fiber && (suspenseState = fiber.memoizedState));
          if (null !== suspenseState) return suspenseState.dehydrated;
        }
        return null;
      }
      function getActivityInstanceFromFiber(fiber) {
        if (31 === fiber.tag) {
          var activityState = fiber.memoizedState;
          null === activityState && (fiber = fiber.alternate, null !== fiber && (activityState = fiber.memoizedState));
          if (null !== activityState) return activityState.dehydrated;
        }
        return null;
      }
      function assertIsMounted(fiber) {
        if (getNearestMountedFiber(fiber) !== fiber)
          throw Error(formatProdErrorMessage(188));
      }
      function findCurrentFiberUsingSlowPath(fiber) {
        var alternate = fiber.alternate;
        if (!alternate) {
          alternate = getNearestMountedFiber(fiber);
          if (null === alternate) throw Error(formatProdErrorMessage(188));
          return alternate !== fiber ? null : fiber;
        }
        for (var a = fiber, b = alternate; ; ) {
          var parentA = a.return;
          if (null === parentA) break;
          var parentB = parentA.alternate;
          if (null === parentB) {
            b = parentA.return;
            if (null !== b) {
              a = b;
              continue;
            }
            break;
          }
          if (parentA.child === parentB.child) {
            for (parentB = parentA.child; parentB; ) {
              if (parentB === a) return assertIsMounted(parentA), fiber;
              if (parentB === b) return assertIsMounted(parentA), alternate;
              parentB = parentB.sibling;
            }
            throw Error(formatProdErrorMessage(188));
          }
          if (a.return !== b.return) a = parentA, b = parentB;
          else {
            for (var didFindChild = false, child$0 = parentA.child; child$0; ) {
              if (child$0 === a) {
                didFindChild = true;
                a = parentA;
                b = parentB;
                break;
              }
              if (child$0 === b) {
                didFindChild = true;
                b = parentA;
                a = parentB;
                break;
              }
              child$0 = child$0.sibling;
            }
            if (!didFindChild) {
              for (child$0 = parentB.child; child$0; ) {
                if (child$0 === a) {
                  didFindChild = true;
                  a = parentB;
                  b = parentA;
                  break;
                }
                if (child$0 === b) {
                  didFindChild = true;
                  b = parentB;
                  a = parentA;
                  break;
                }
                child$0 = child$0.sibling;
              }
              if (!didFindChild) throw Error(formatProdErrorMessage(189));
            }
          }
          if (a.alternate !== b) throw Error(formatProdErrorMessage(190));
        }
        if (3 !== a.tag) throw Error(formatProdErrorMessage(188));
        return a.stateNode.current === a ? fiber : alternate;
      }
      function findCurrentHostFiberImpl(node) {
        var tag = node.tag;
        if (5 === tag || 26 === tag || 27 === tag || 6 === tag) return node;
        for (node = node.child; null !== node; ) {
          tag = findCurrentHostFiberImpl(node);
          if (null !== tag) return tag;
          node = node.sibling;
        }
        return null;
      }
      var assign = Object.assign;
      var REACT_LEGACY_ELEMENT_TYPE = Symbol.for("react.element");
      var REACT_ELEMENT_TYPE = Symbol.for("react.transitional.element");
      var REACT_PORTAL_TYPE = Symbol.for("react.portal");
      var REACT_FRAGMENT_TYPE = Symbol.for("react.fragment");
      var REACT_STRICT_MODE_TYPE = Symbol.for("react.strict_mode");
      var REACT_PROFILER_TYPE = Symbol.for("react.profiler");
      var REACT_CONSUMER_TYPE = Symbol.for("react.consumer");
      var REACT_CONTEXT_TYPE = Symbol.for("react.context");
      var REACT_FORWARD_REF_TYPE = Symbol.for("react.forward_ref");
      var REACT_SUSPENSE_TYPE = Symbol.for("react.suspense");
      var REACT_SUSPENSE_LIST_TYPE = Symbol.for("react.suspense_list");
      var REACT_MEMO_TYPE = Symbol.for("react.memo");
      var REACT_LAZY_TYPE = Symbol.for("react.lazy");
      Symbol.for("react.scope");
      var REACT_ACTIVITY_TYPE = Symbol.for("react.activity");
      Symbol.for("react.legacy_hidden");
      Symbol.for("react.tracing_marker");
      var REACT_MEMO_CACHE_SENTINEL = Symbol.for("react.memo_cache_sentinel");
      Symbol.for("react.view_transition");
      var MAYBE_ITERATOR_SYMBOL = Symbol.iterator;
      function getIteratorFn(maybeIterable) {
        if (null === maybeIterable || "object" !== typeof maybeIterable) return null;
        maybeIterable = MAYBE_ITERATOR_SYMBOL && maybeIterable[MAYBE_ITERATOR_SYMBOL] || maybeIterable["@@iterator"];
        return "function" === typeof maybeIterable ? maybeIterable : null;
      }
      var REACT_CLIENT_REFERENCE = Symbol.for("react.client.reference");
      function getComponentNameFromType(type) {
        if (null == type) return null;
        if ("function" === typeof type)
          return type.$$typeof === REACT_CLIENT_REFERENCE ? null : type.displayName || type.name || null;
        if ("string" === typeof type) return type;
        switch (type) {
          case REACT_FRAGMENT_TYPE:
            return "Fragment";
          case REACT_PROFILER_TYPE:
            return "Profiler";
          case REACT_STRICT_MODE_TYPE:
            return "StrictMode";
          case REACT_SUSPENSE_TYPE:
            return "Suspense";
          case REACT_SUSPENSE_LIST_TYPE:
            return "SuspenseList";
          case REACT_ACTIVITY_TYPE:
            return "Activity";
        }
        if ("object" === typeof type)
          switch (type.$$typeof) {
            case REACT_PORTAL_TYPE:
              return "Portal";
            case REACT_CONTEXT_TYPE:
              return type.displayName || "Context";
            case REACT_CONSUMER_TYPE:
              return (type._context.displayName || "Context") + ".Consumer";
            case REACT_FORWARD_REF_TYPE:
              var innerType = type.render;
              type = type.displayName;
              type || (type = innerType.displayName || innerType.name || "", type = "" !== type ? "ForwardRef(" + type + ")" : "ForwardRef");
              return type;
            case REACT_MEMO_TYPE:
              return innerType = type.displayName || null, null !== innerType ? innerType : getComponentNameFromType(type.type) || "Memo";
            case REACT_LAZY_TYPE:
              innerType = type._payload;
              type = type._init;
              try {
                return getComponentNameFromType(type(innerType));
              } catch (x) {
              }
          }
        return null;
      }
      var isArrayImpl = Array.isArray;
      var ReactSharedInternals = React3.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;
      var ReactDOMSharedInternals = ReactDOM.__DOM_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;
      var sharedNotPendingObject = {
        pending: false,
        data: null,
        method: null,
        action: null
      };
      var valueStack = [];
      var index = -1;
      function createCursor(defaultValue) {
        return { current: defaultValue };
      }
      function pop(cursor) {
        0 > index || (cursor.current = valueStack[index], valueStack[index] = null, index--);
      }
      function push(cursor, value) {
        index++;
        valueStack[index] = cursor.current;
        cursor.current = value;
      }
      var contextStackCursor = createCursor(null);
      var contextFiberStackCursor = createCursor(null);
      var rootInstanceStackCursor = createCursor(null);
      var hostTransitionProviderCursor = createCursor(null);
      function pushHostContainer(fiber, nextRootInstance) {
        push(rootInstanceStackCursor, nextRootInstance);
        push(contextFiberStackCursor, fiber);
        push(contextStackCursor, null);
        switch (nextRootInstance.nodeType) {
          case 9:
          case 11:
            fiber = (fiber = nextRootInstance.documentElement) ? (fiber = fiber.namespaceURI) ? getOwnHostContext(fiber) : 0 : 0;
            break;
          default:
            if (fiber = nextRootInstance.tagName, nextRootInstance = nextRootInstance.namespaceURI)
              nextRootInstance = getOwnHostContext(nextRootInstance), fiber = getChildHostContextProd(nextRootInstance, fiber);
            else
              switch (fiber) {
                case "svg":
                  fiber = 1;
                  break;
                case "math":
                  fiber = 2;
                  break;
                default:
                  fiber = 0;
              }
        }
        pop(contextStackCursor);
        push(contextStackCursor, fiber);
      }
      function popHostContainer() {
        pop(contextStackCursor);
        pop(contextFiberStackCursor);
        pop(rootInstanceStackCursor);
      }
      function pushHostContext(fiber) {
        null !== fiber.memoizedState && push(hostTransitionProviderCursor, fiber);
        var context = contextStackCursor.current;
        var JSCompiler_inline_result = getChildHostContextProd(context, fiber.type);
        context !== JSCompiler_inline_result && (push(contextFiberStackCursor, fiber), push(contextStackCursor, JSCompiler_inline_result));
      }
      function popHostContext(fiber) {
        contextFiberStackCursor.current === fiber && (pop(contextStackCursor), pop(contextFiberStackCursor));
        hostTransitionProviderCursor.current === fiber && (pop(hostTransitionProviderCursor), HostTransitionContext._currentValue = sharedNotPendingObject);
      }
      var prefix;
      var suffix;
      function describeBuiltInComponentFrame(name) {
        if (void 0 === prefix)
          try {
            throw Error();
          } catch (x) {
            var match = x.stack.trim().match(/\n( *(at )?)/);
            prefix = match && match[1] || "";
            suffix = -1 < x.stack.indexOf("\n    at") ? " (<anonymous>)" : -1 < x.stack.indexOf("@") ? "@unknown:0:0" : "";
          }
        return "\n" + prefix + name + suffix;
      }
      var reentry = false;
      function describeNativeComponentFrame(fn, construct) {
        if (!fn || reentry) return "";
        reentry = true;
        var previousPrepareStackTrace = Error.prepareStackTrace;
        Error.prepareStackTrace = void 0;
        try {
          var RunInRootFrame = {
            DetermineComponentFrameRoot: function() {
              try {
                if (construct) {
                  var Fake = function() {
                    throw Error();
                  };
                  Object.defineProperty(Fake.prototype, "props", {
                    set: function() {
                      throw Error();
                    }
                  });
                  if ("object" === typeof Reflect && Reflect.construct) {
                    try {
                      Reflect.construct(Fake, []);
                    } catch (x) {
                      var control = x;
                    }
                    Reflect.construct(fn, [], Fake);
                  } else {
                    try {
                      Fake.call();
                    } catch (x$1) {
                      control = x$1;
                    }
                    fn.call(Fake.prototype);
                  }
                } else {
                  try {
                    throw Error();
                  } catch (x$2) {
                    control = x$2;
                  }
                  (Fake = fn()) && "function" === typeof Fake.catch && Fake.catch(function() {
                  });
                }
              } catch (sample) {
                if (sample && control && "string" === typeof sample.stack)
                  return [sample.stack, control.stack];
              }
              return [null, null];
            }
          };
          RunInRootFrame.DetermineComponentFrameRoot.displayName = "DetermineComponentFrameRoot";
          var namePropDescriptor = Object.getOwnPropertyDescriptor(
            RunInRootFrame.DetermineComponentFrameRoot,
            "name"
          );
          namePropDescriptor && namePropDescriptor.configurable && Object.defineProperty(
            RunInRootFrame.DetermineComponentFrameRoot,
            "name",
            { value: "DetermineComponentFrameRoot" }
          );
          var _RunInRootFrame$Deter = RunInRootFrame.DetermineComponentFrameRoot(), sampleStack = _RunInRootFrame$Deter[0], controlStack = _RunInRootFrame$Deter[1];
          if (sampleStack && controlStack) {
            var sampleLines = sampleStack.split("\n"), controlLines = controlStack.split("\n");
            for (namePropDescriptor = RunInRootFrame = 0; RunInRootFrame < sampleLines.length && !sampleLines[RunInRootFrame].includes("DetermineComponentFrameRoot"); )
              RunInRootFrame++;
            for (; namePropDescriptor < controlLines.length && !controlLines[namePropDescriptor].includes(
              "DetermineComponentFrameRoot"
            ); )
              namePropDescriptor++;
            if (RunInRootFrame === sampleLines.length || namePropDescriptor === controlLines.length)
              for (RunInRootFrame = sampleLines.length - 1, namePropDescriptor = controlLines.length - 1; 1 <= RunInRootFrame && 0 <= namePropDescriptor && sampleLines[RunInRootFrame] !== controlLines[namePropDescriptor]; )
                namePropDescriptor--;
            for (; 1 <= RunInRootFrame && 0 <= namePropDescriptor; RunInRootFrame--, namePropDescriptor--)
              if (sampleLines[RunInRootFrame] !== controlLines[namePropDescriptor]) {
                if (1 !== RunInRootFrame || 1 !== namePropDescriptor) {
                  do
                    if (RunInRootFrame--, namePropDescriptor--, 0 > namePropDescriptor || sampleLines[RunInRootFrame] !== controlLines[namePropDescriptor]) {
                      var frame = "\n" + sampleLines[RunInRootFrame].replace(" at new ", " at ");
                      fn.displayName && frame.includes("<anonymous>") && (frame = frame.replace("<anonymous>", fn.displayName));
                      return frame;
                    }
                  while (1 <= RunInRootFrame && 0 <= namePropDescriptor);
                }
                break;
              }
          }
        } finally {
          reentry = false, Error.prepareStackTrace = previousPrepareStackTrace;
        }
        return (previousPrepareStackTrace = fn ? fn.displayName || fn.name : "") ? describeBuiltInComponentFrame(previousPrepareStackTrace) : "";
      }
      function describeFiber(fiber, childFiber) {
        switch (fiber.tag) {
          case 26:
          case 27:
          case 5:
            return describeBuiltInComponentFrame(fiber.type);
          case 16:
            return describeBuiltInComponentFrame("Lazy");
          case 13:
            return fiber.child !== childFiber && null !== childFiber ? describeBuiltInComponentFrame("Suspense Fallback") : describeBuiltInComponentFrame("Suspense");
          case 19:
            return describeBuiltInComponentFrame("SuspenseList");
          case 0:
          case 15:
            return describeNativeComponentFrame(fiber.type, false);
          case 11:
            return describeNativeComponentFrame(fiber.type.render, false);
          case 1:
            return describeNativeComponentFrame(fiber.type, true);
          case 31:
            return describeBuiltInComponentFrame("Activity");
          default:
            return "";
        }
      }
      function getStackByFiberInDevAndProd(workInProgress2) {
        try {
          var info = "", previous = null;
          do
            info += describeFiber(workInProgress2, previous), previous = workInProgress2, workInProgress2 = workInProgress2.return;
          while (workInProgress2);
          return info;
        } catch (x) {
          return "\nError generating stack: " + x.message + "\n" + x.stack;
        }
      }
      var hasOwnProperty = Object.prototype.hasOwnProperty;
      var scheduleCallback$3 = Scheduler.unstable_scheduleCallback;
      var cancelCallback$1 = Scheduler.unstable_cancelCallback;
      var shouldYield = Scheduler.unstable_shouldYield;
      var requestPaint = Scheduler.unstable_requestPaint;
      var now = Scheduler.unstable_now;
      var getCurrentPriorityLevel = Scheduler.unstable_getCurrentPriorityLevel;
      var ImmediatePriority = Scheduler.unstable_ImmediatePriority;
      var UserBlockingPriority = Scheduler.unstable_UserBlockingPriority;
      var NormalPriority$1 = Scheduler.unstable_NormalPriority;
      var LowPriority = Scheduler.unstable_LowPriority;
      var IdlePriority = Scheduler.unstable_IdlePriority;
      var log$1 = Scheduler.log;
      var unstable_setDisableYieldValue = Scheduler.unstable_setDisableYieldValue;
      var rendererID = null;
      var injectedHook = null;
      function setIsStrictModeForDevtools(newIsStrictMode) {
        "function" === typeof log$1 && unstable_setDisableYieldValue(newIsStrictMode);
        if (injectedHook && "function" === typeof injectedHook.setStrictMode)
          try {
            injectedHook.setStrictMode(rendererID, newIsStrictMode);
          } catch (err) {
          }
      }
      var clz32 = Math.clz32 ? Math.clz32 : clz32Fallback;
      var log = Math.log;
      var LN2 = Math.LN2;
      function clz32Fallback(x) {
        x >>>= 0;
        return 0 === x ? 32 : 31 - (log(x) / LN2 | 0) | 0;
      }
      var nextTransitionUpdateLane = 256;
      var nextTransitionDeferredLane = 262144;
      var nextRetryLane = 4194304;
      function getHighestPriorityLanes(lanes) {
        var pendingSyncLanes = lanes & 42;
        if (0 !== pendingSyncLanes) return pendingSyncLanes;
        switch (lanes & -lanes) {
          case 1:
            return 1;
          case 2:
            return 2;
          case 4:
            return 4;
          case 8:
            return 8;
          case 16:
            return 16;
          case 32:
            return 32;
          case 64:
            return 64;
          case 128:
            return 128;
          case 256:
          case 512:
          case 1024:
          case 2048:
          case 4096:
          case 8192:
          case 16384:
          case 32768:
          case 65536:
          case 131072:
            return lanes & 261888;
          case 262144:
          case 524288:
          case 1048576:
          case 2097152:
            return lanes & 3932160;
          case 4194304:
          case 8388608:
          case 16777216:
          case 33554432:
            return lanes & 62914560;
          case 67108864:
            return 67108864;
          case 134217728:
            return 134217728;
          case 268435456:
            return 268435456;
          case 536870912:
            return 536870912;
          case 1073741824:
            return 0;
          default:
            return lanes;
        }
      }
      function getNextLanes(root2, wipLanes, rootHasPendingCommit) {
        var pendingLanes = root2.pendingLanes;
        if (0 === pendingLanes) return 0;
        var nextLanes = 0, suspendedLanes = root2.suspendedLanes, pingedLanes = root2.pingedLanes;
        root2 = root2.warmLanes;
        var nonIdlePendingLanes = pendingLanes & 134217727;
        0 !== nonIdlePendingLanes ? (pendingLanes = nonIdlePendingLanes & ~suspendedLanes, 0 !== pendingLanes ? nextLanes = getHighestPriorityLanes(pendingLanes) : (pingedLanes &= nonIdlePendingLanes, 0 !== pingedLanes ? nextLanes = getHighestPriorityLanes(pingedLanes) : rootHasPendingCommit || (rootHasPendingCommit = nonIdlePendingLanes & ~root2, 0 !== rootHasPendingCommit && (nextLanes = getHighestPriorityLanes(rootHasPendingCommit))))) : (nonIdlePendingLanes = pendingLanes & ~suspendedLanes, 0 !== nonIdlePendingLanes ? nextLanes = getHighestPriorityLanes(nonIdlePendingLanes) : 0 !== pingedLanes ? nextLanes = getHighestPriorityLanes(pingedLanes) : rootHasPendingCommit || (rootHasPendingCommit = pendingLanes & ~root2, 0 !== rootHasPendingCommit && (nextLanes = getHighestPriorityLanes(rootHasPendingCommit))));
        return 0 === nextLanes ? 0 : 0 !== wipLanes && wipLanes !== nextLanes && 0 === (wipLanes & suspendedLanes) && (suspendedLanes = nextLanes & -nextLanes, rootHasPendingCommit = wipLanes & -wipLanes, suspendedLanes >= rootHasPendingCommit || 32 === suspendedLanes && 0 !== (rootHasPendingCommit & 4194048)) ? wipLanes : nextLanes;
      }
      function checkIfRootIsPrerendering(root2, renderLanes2) {
        return 0 === (root2.pendingLanes & ~(root2.suspendedLanes & ~root2.pingedLanes) & renderLanes2);
      }
      function computeExpirationTime(lane, currentTime) {
        switch (lane) {
          case 1:
          case 2:
          case 4:
          case 8:
          case 64:
            return currentTime + 250;
          case 16:
          case 32:
          case 128:
          case 256:
          case 512:
          case 1024:
          case 2048:
          case 4096:
          case 8192:
          case 16384:
          case 32768:
          case 65536:
          case 131072:
          case 262144:
          case 524288:
          case 1048576:
          case 2097152:
            return currentTime + 5e3;
          case 4194304:
          case 8388608:
          case 16777216:
          case 33554432:
            return -1;
          case 67108864:
          case 134217728:
          case 268435456:
          case 536870912:
          case 1073741824:
            return -1;
          default:
            return -1;
        }
      }
      function claimNextRetryLane() {
        var lane = nextRetryLane;
        nextRetryLane <<= 1;
        0 === (nextRetryLane & 62914560) && (nextRetryLane = 4194304);
        return lane;
      }
      function createLaneMap(initial) {
        for (var laneMap = [], i = 0; 31 > i; i++) laneMap.push(initial);
        return laneMap;
      }
      function markRootUpdated$1(root2, updateLane) {
        root2.pendingLanes |= updateLane;
        268435456 !== updateLane && (root2.suspendedLanes = 0, root2.pingedLanes = 0, root2.warmLanes = 0);
      }
      function markRootFinished(root2, finishedLanes, remainingLanes, spawnedLane, updatedLanes, suspendedRetryLanes) {
        var previouslyPendingLanes = root2.pendingLanes;
        root2.pendingLanes = remainingLanes;
        root2.suspendedLanes = 0;
        root2.pingedLanes = 0;
        root2.warmLanes = 0;
        root2.expiredLanes &= remainingLanes;
        root2.entangledLanes &= remainingLanes;
        root2.errorRecoveryDisabledLanes &= remainingLanes;
        root2.shellSuspendCounter = 0;
        var entanglements = root2.entanglements, expirationTimes = root2.expirationTimes, hiddenUpdates = root2.hiddenUpdates;
        for (remainingLanes = previouslyPendingLanes & ~remainingLanes; 0 < remainingLanes; ) {
          var index$7 = 31 - clz32(remainingLanes), lane = 1 << index$7;
          entanglements[index$7] = 0;
          expirationTimes[index$7] = -1;
          var hiddenUpdatesForLane = hiddenUpdates[index$7];
          if (null !== hiddenUpdatesForLane)
            for (hiddenUpdates[index$7] = null, index$7 = 0; index$7 < hiddenUpdatesForLane.length; index$7++) {
              var update = hiddenUpdatesForLane[index$7];
              null !== update && (update.lane &= -536870913);
            }
          remainingLanes &= ~lane;
        }
        0 !== spawnedLane && markSpawnedDeferredLane(root2, spawnedLane, 0);
        0 !== suspendedRetryLanes && 0 === updatedLanes && 0 !== root2.tag && (root2.suspendedLanes |= suspendedRetryLanes & ~(previouslyPendingLanes & ~finishedLanes));
      }
      function markSpawnedDeferredLane(root2, spawnedLane, entangledLanes) {
        root2.pendingLanes |= spawnedLane;
        root2.suspendedLanes &= ~spawnedLane;
        var spawnedLaneIndex = 31 - clz32(spawnedLane);
        root2.entangledLanes |= spawnedLane;
        root2.entanglements[spawnedLaneIndex] = root2.entanglements[spawnedLaneIndex] | 1073741824 | entangledLanes & 261930;
      }
      function markRootEntangled(root2, entangledLanes) {
        var rootEntangledLanes = root2.entangledLanes |= entangledLanes;
        for (root2 = root2.entanglements; rootEntangledLanes; ) {
          var index$8 = 31 - clz32(rootEntangledLanes), lane = 1 << index$8;
          lane & entangledLanes | root2[index$8] & entangledLanes && (root2[index$8] |= entangledLanes);
          rootEntangledLanes &= ~lane;
        }
      }
      function getBumpedLaneForHydration(root2, renderLanes2) {
        var renderLane = renderLanes2 & -renderLanes2;
        renderLane = 0 !== (renderLane & 42) ? 1 : getBumpedLaneForHydrationByLane(renderLane);
        return 0 !== (renderLane & (root2.suspendedLanes | renderLanes2)) ? 0 : renderLane;
      }
      function getBumpedLaneForHydrationByLane(lane) {
        switch (lane) {
          case 2:
            lane = 1;
            break;
          case 8:
            lane = 4;
            break;
          case 32:
            lane = 16;
            break;
          case 256:
          case 512:
          case 1024:
          case 2048:
          case 4096:
          case 8192:
          case 16384:
          case 32768:
          case 65536:
          case 131072:
          case 262144:
          case 524288:
          case 1048576:
          case 2097152:
          case 4194304:
          case 8388608:
          case 16777216:
          case 33554432:
            lane = 128;
            break;
          case 268435456:
            lane = 134217728;
            break;
          default:
            lane = 0;
        }
        return lane;
      }
      function lanesToEventPriority(lanes) {
        lanes &= -lanes;
        return 2 < lanes ? 8 < lanes ? 0 !== (lanes & 134217727) ? 32 : 268435456 : 8 : 2;
      }
      function resolveUpdatePriority() {
        var updatePriority = ReactDOMSharedInternals.p;
        if (0 !== updatePriority) return updatePriority;
        updatePriority = window.event;
        return void 0 === updatePriority ? 32 : getEventPriority(updatePriority.type);
      }
      function runWithPriority(priority, fn) {
        var previousPriority = ReactDOMSharedInternals.p;
        try {
          return ReactDOMSharedInternals.p = priority, fn();
        } finally {
          ReactDOMSharedInternals.p = previousPriority;
        }
      }
      var randomKey = Math.random().toString(36).slice(2);
      var internalInstanceKey = "__reactFiber$" + randomKey;
      var internalPropsKey = "__reactProps$" + randomKey;
      var internalContainerInstanceKey = "__reactContainer$" + randomKey;
      var internalEventHandlersKey = "__reactEvents$" + randomKey;
      var internalEventHandlerListenersKey = "__reactListeners$" + randomKey;
      var internalEventHandlesSetKey = "__reactHandles$" + randomKey;
      var internalRootNodeResourcesKey = "__reactResources$" + randomKey;
      var internalHoistableMarker = "__reactMarker$" + randomKey;
      function detachDeletedInstance(node) {
        delete node[internalInstanceKey];
        delete node[internalPropsKey];
        delete node[internalEventHandlersKey];
        delete node[internalEventHandlerListenersKey];
        delete node[internalEventHandlesSetKey];
      }
      function getClosestInstanceFromNode(targetNode) {
        var targetInst = targetNode[internalInstanceKey];
        if (targetInst) return targetInst;
        for (var parentNode = targetNode.parentNode; parentNode; ) {
          if (targetInst = parentNode[internalContainerInstanceKey] || parentNode[internalInstanceKey]) {
            parentNode = targetInst.alternate;
            if (null !== targetInst.child || null !== parentNode && null !== parentNode.child)
              for (targetNode = getParentHydrationBoundary(targetNode); null !== targetNode; ) {
                if (parentNode = targetNode[internalInstanceKey]) return parentNode;
                targetNode = getParentHydrationBoundary(targetNode);
              }
            return targetInst;
          }
          targetNode = parentNode;
          parentNode = targetNode.parentNode;
        }
        return null;
      }
      function getInstanceFromNode(node) {
        if (node = node[internalInstanceKey] || node[internalContainerInstanceKey]) {
          var tag = node.tag;
          if (5 === tag || 6 === tag || 13 === tag || 31 === tag || 26 === tag || 27 === tag || 3 === tag)
            return node;
        }
        return null;
      }
      function getNodeFromInstance(inst) {
        var tag = inst.tag;
        if (5 === tag || 26 === tag || 27 === tag || 6 === tag) return inst.stateNode;
        throw Error(formatProdErrorMessage(33));
      }
      function getResourcesFromRoot(root2) {
        var resources = root2[internalRootNodeResourcesKey];
        resources || (resources = root2[internalRootNodeResourcesKey] = { hoistableStyles: /* @__PURE__ */ new Map(), hoistableScripts: /* @__PURE__ */ new Map() });
        return resources;
      }
      function markNodeAsHoistable(node) {
        node[internalHoistableMarker] = true;
      }
      var allNativeEvents = /* @__PURE__ */ new Set();
      var registrationNameDependencies = {};
      function registerTwoPhaseEvent(registrationName, dependencies) {
        registerDirectEvent(registrationName, dependencies);
        registerDirectEvent(registrationName + "Capture", dependencies);
      }
      function registerDirectEvent(registrationName, dependencies) {
        registrationNameDependencies[registrationName] = dependencies;
        for (registrationName = 0; registrationName < dependencies.length; registrationName++)
          allNativeEvents.add(dependencies[registrationName]);
      }
      var VALID_ATTRIBUTE_NAME_REGEX = RegExp(
        "^[:A-Z_a-z\\u00C0-\\u00D6\\u00D8-\\u00F6\\u00F8-\\u02FF\\u0370-\\u037D\\u037F-\\u1FFF\\u200C-\\u200D\\u2070-\\u218F\\u2C00-\\u2FEF\\u3001-\\uD7FF\\uF900-\\uFDCF\\uFDF0-\\uFFFD][:A-Z_a-z\\u00C0-\\u00D6\\u00D8-\\u00F6\\u00F8-\\u02FF\\u0370-\\u037D\\u037F-\\u1FFF\\u200C-\\u200D\\u2070-\\u218F\\u2C00-\\u2FEF\\u3001-\\uD7FF\\uF900-\\uFDCF\\uFDF0-\\uFFFD\\-.0-9\\u00B7\\u0300-\\u036F\\u203F-\\u2040]*$"
      );
      var illegalAttributeNameCache = {};
      var validatedAttributeNameCache = {};
      function isAttributeNameSafe(attributeName) {
        if (hasOwnProperty.call(validatedAttributeNameCache, attributeName))
          return true;
        if (hasOwnProperty.call(illegalAttributeNameCache, attributeName)) return false;
        if (VALID_ATTRIBUTE_NAME_REGEX.test(attributeName))
          return validatedAttributeNameCache[attributeName] = true;
        illegalAttributeNameCache[attributeName] = true;
        return false;
      }
      function setValueForAttribute(node, name, value) {
        if (isAttributeNameSafe(name))
          if (null === value) node.removeAttribute(name);
          else {
            switch (typeof value) {
              case "undefined":
              case "function":
              case "symbol":
                node.removeAttribute(name);
                return;
              case "boolean":
                var prefix$10 = name.toLowerCase().slice(0, 5);
                if ("data-" !== prefix$10 && "aria-" !== prefix$10) {
                  node.removeAttribute(name);
                  return;
                }
            }
            node.setAttribute(name, "" + value);
          }
      }
      function setValueForKnownAttribute(node, name, value) {
        if (null === value) node.removeAttribute(name);
        else {
          switch (typeof value) {
            case "undefined":
            case "function":
            case "symbol":
            case "boolean":
              node.removeAttribute(name);
              return;
          }
          node.setAttribute(name, "" + value);
        }
      }
      function setValueForNamespacedAttribute(node, namespace, name, value) {
        if (null === value) node.removeAttribute(name);
        else {
          switch (typeof value) {
            case "undefined":
            case "function":
            case "symbol":
            case "boolean":
              node.removeAttribute(name);
              return;
          }
          node.setAttributeNS(namespace, name, "" + value);
        }
      }
      function getToStringValue(value) {
        switch (typeof value) {
          case "bigint":
          case "boolean":
          case "number":
          case "string":
          case "undefined":
            return value;
          case "object":
            return value;
          default:
            return "";
        }
      }
      function isCheckable(elem) {
        var type = elem.type;
        return (elem = elem.nodeName) && "input" === elem.toLowerCase() && ("checkbox" === type || "radio" === type);
      }
      function trackValueOnNode(node, valueField, currentValue) {
        var descriptor = Object.getOwnPropertyDescriptor(
          node.constructor.prototype,
          valueField
        );
        if (!node.hasOwnProperty(valueField) && "undefined" !== typeof descriptor && "function" === typeof descriptor.get && "function" === typeof descriptor.set) {
          var get = descriptor.get, set = descriptor.set;
          Object.defineProperty(node, valueField, {
            configurable: true,
            get: function() {
              return get.call(this);
            },
            set: function(value) {
              currentValue = "" + value;
              set.call(this, value);
            }
          });
          Object.defineProperty(node, valueField, {
            enumerable: descriptor.enumerable
          });
          return {
            getValue: function() {
              return currentValue;
            },
            setValue: function(value) {
              currentValue = "" + value;
            },
            stopTracking: function() {
              node._valueTracker = null;
              delete node[valueField];
            }
          };
        }
      }
      function track(node) {
        if (!node._valueTracker) {
          var valueField = isCheckable(node) ? "checked" : "value";
          node._valueTracker = trackValueOnNode(
            node,
            valueField,
            "" + node[valueField]
          );
        }
      }
      function updateValueIfChanged(node) {
        if (!node) return false;
        var tracker = node._valueTracker;
        if (!tracker) return true;
        var lastValue = tracker.getValue();
        var value = "";
        node && (value = isCheckable(node) ? node.checked ? "true" : "false" : node.value);
        node = value;
        return node !== lastValue ? (tracker.setValue(node), true) : false;
      }
      function getActiveElement(doc) {
        doc = doc || ("undefined" !== typeof document ? document : void 0);
        if ("undefined" === typeof doc) return null;
        try {
          return doc.activeElement || doc.body;
        } catch (e) {
          return doc.body;
        }
      }
      var escapeSelectorAttributeValueInsideDoubleQuotesRegex = /[\n"\\]/g;
      function escapeSelectorAttributeValueInsideDoubleQuotes(value) {
        return value.replace(
          escapeSelectorAttributeValueInsideDoubleQuotesRegex,
          function(ch) {
            return "\\" + ch.charCodeAt(0).toString(16) + " ";
          }
        );
      }
      function updateInput(element, value, defaultValue, lastDefaultValue, checked, defaultChecked, type, name) {
        element.name = "";
        null != type && "function" !== typeof type && "symbol" !== typeof type && "boolean" !== typeof type ? element.type = type : element.removeAttribute("type");
        if (null != value)
          if ("number" === type) {
            if (0 === value && "" === element.value || element.value != value)
              element.value = "" + getToStringValue(value);
          } else
            element.value !== "" + getToStringValue(value) && (element.value = "" + getToStringValue(value));
        else
          "submit" !== type && "reset" !== type || element.removeAttribute("value");
        null != value ? setDefaultValue(element, type, getToStringValue(value)) : null != defaultValue ? setDefaultValue(element, type, getToStringValue(defaultValue)) : null != lastDefaultValue && element.removeAttribute("value");
        null == checked && null != defaultChecked && (element.defaultChecked = !!defaultChecked);
        null != checked && (element.checked = checked && "function" !== typeof checked && "symbol" !== typeof checked);
        null != name && "function" !== typeof name && "symbol" !== typeof name && "boolean" !== typeof name ? element.name = "" + getToStringValue(name) : element.removeAttribute("name");
      }
      function initInput(element, value, defaultValue, checked, defaultChecked, type, name, isHydrating2) {
        null != type && "function" !== typeof type && "symbol" !== typeof type && "boolean" !== typeof type && (element.type = type);
        if (null != value || null != defaultValue) {
          if (!("submit" !== type && "reset" !== type || void 0 !== value && null !== value)) {
            track(element);
            return;
          }
          defaultValue = null != defaultValue ? "" + getToStringValue(defaultValue) : "";
          value = null != value ? "" + getToStringValue(value) : defaultValue;
          isHydrating2 || value === element.value || (element.value = value);
          element.defaultValue = value;
        }
        checked = null != checked ? checked : defaultChecked;
        checked = "function" !== typeof checked && "symbol" !== typeof checked && !!checked;
        element.checked = isHydrating2 ? element.checked : !!checked;
        element.defaultChecked = !!checked;
        null != name && "function" !== typeof name && "symbol" !== typeof name && "boolean" !== typeof name && (element.name = name);
        track(element);
      }
      function setDefaultValue(node, type, value) {
        "number" === type && getActiveElement(node.ownerDocument) === node || node.defaultValue === "" + value || (node.defaultValue = "" + value);
      }
      function updateOptions(node, multiple, propValue, setDefaultSelected) {
        node = node.options;
        if (multiple) {
          multiple = {};
          for (var i = 0; i < propValue.length; i++)
            multiple["$" + propValue[i]] = true;
          for (propValue = 0; propValue < node.length; propValue++)
            i = multiple.hasOwnProperty("$" + node[propValue].value), node[propValue].selected !== i && (node[propValue].selected = i), i && setDefaultSelected && (node[propValue].defaultSelected = true);
        } else {
          propValue = "" + getToStringValue(propValue);
          multiple = null;
          for (i = 0; i < node.length; i++) {
            if (node[i].value === propValue) {
              node[i].selected = true;
              setDefaultSelected && (node[i].defaultSelected = true);
              return;
            }
            null !== multiple || node[i].disabled || (multiple = node[i]);
          }
          null !== multiple && (multiple.selected = true);
        }
      }
      function updateTextarea(element, value, defaultValue) {
        if (null != value && (value = "" + getToStringValue(value), value !== element.value && (element.value = value), null == defaultValue)) {
          element.defaultValue !== value && (element.defaultValue = value);
          return;
        }
        element.defaultValue = null != defaultValue ? "" + getToStringValue(defaultValue) : "";
      }
      function initTextarea(element, value, defaultValue, children) {
        if (null == value) {
          if (null != children) {
            if (null != defaultValue) throw Error(formatProdErrorMessage(92));
            if (isArrayImpl(children)) {
              if (1 < children.length) throw Error(formatProdErrorMessage(93));
              children = children[0];
            }
            defaultValue = children;
          }
          null == defaultValue && (defaultValue = "");
          value = defaultValue;
        }
        defaultValue = getToStringValue(value);
        element.defaultValue = defaultValue;
        children = element.textContent;
        children === defaultValue && "" !== children && null !== children && (element.value = children);
        track(element);
      }
      function setTextContent(node, text) {
        if (text) {
          var firstChild = node.firstChild;
          if (firstChild && firstChild === node.lastChild && 3 === firstChild.nodeType) {
            firstChild.nodeValue = text;
            return;
          }
        }
        node.textContent = text;
      }
      var unitlessNumbers = new Set(
        "animationIterationCount aspectRatio borderImageOutset borderImageSlice borderImageWidth boxFlex boxFlexGroup boxOrdinalGroup columnCount columns flex flexGrow flexPositive flexShrink flexNegative flexOrder gridArea gridRow gridRowEnd gridRowSpan gridRowStart gridColumn gridColumnEnd gridColumnSpan gridColumnStart fontWeight lineClamp lineHeight opacity order orphans scale tabSize widows zIndex zoom fillOpacity floodOpacity stopOpacity strokeDasharray strokeDashoffset strokeMiterlimit strokeOpacity strokeWidth MozAnimationIterationCount MozBoxFlex MozBoxFlexGroup MozLineClamp msAnimationIterationCount msFlex msZoom msFlexGrow msFlexNegative msFlexOrder msFlexPositive msFlexShrink msGridColumn msGridColumnSpan msGridRow msGridRowSpan WebkitAnimationIterationCount WebkitBoxFlex WebKitBoxFlexGroup WebkitBoxOrdinalGroup WebkitColumnCount WebkitColumns WebkitFlex WebkitFlexGrow WebkitFlexPositive WebkitFlexShrink WebkitLineClamp".split(
          " "
        )
      );
      function setValueForStyle(style2, styleName, value) {
        var isCustomProperty = 0 === styleName.indexOf("--");
        null == value || "boolean" === typeof value || "" === value ? isCustomProperty ? style2.setProperty(styleName, "") : "float" === styleName ? style2.cssFloat = "" : style2[styleName] = "" : isCustomProperty ? style2.setProperty(styleName, value) : "number" !== typeof value || 0 === value || unitlessNumbers.has(styleName) ? "float" === styleName ? style2.cssFloat = value : style2[styleName] = ("" + value).trim() : style2[styleName] = value + "px";
      }
      function setValueForStyles(node, styles, prevStyles) {
        if (null != styles && "object" !== typeof styles)
          throw Error(formatProdErrorMessage(62));
        node = node.style;
        if (null != prevStyles) {
          for (var styleName in prevStyles)
            !prevStyles.hasOwnProperty(styleName) || null != styles && styles.hasOwnProperty(styleName) || (0 === styleName.indexOf("--") ? node.setProperty(styleName, "") : "float" === styleName ? node.cssFloat = "" : node[styleName] = "");
          for (var styleName$16 in styles)
            styleName = styles[styleName$16], styles.hasOwnProperty(styleName$16) && prevStyles[styleName$16] !== styleName && setValueForStyle(node, styleName$16, styleName);
        } else
          for (var styleName$17 in styles)
            styles.hasOwnProperty(styleName$17) && setValueForStyle(node, styleName$17, styles[styleName$17]);
      }
      function isCustomElement(tagName) {
        if (-1 === tagName.indexOf("-")) return false;
        switch (tagName) {
          case "annotation-xml":
          case "color-profile":
          case "font-face":
          case "font-face-src":
          case "font-face-uri":
          case "font-face-format":
          case "font-face-name":
          case "missing-glyph":
            return false;
          default:
            return true;
        }
      }
      var aliases = /* @__PURE__ */ new Map([
        ["acceptCharset", "accept-charset"],
        ["htmlFor", "for"],
        ["httpEquiv", "http-equiv"],
        ["crossOrigin", "crossorigin"],
        ["accentHeight", "accent-height"],
        ["alignmentBaseline", "alignment-baseline"],
        ["arabicForm", "arabic-form"],
        ["baselineShift", "baseline-shift"],
        ["capHeight", "cap-height"],
        ["clipPath", "clip-path"],
        ["clipRule", "clip-rule"],
        ["colorInterpolation", "color-interpolation"],
        ["colorInterpolationFilters", "color-interpolation-filters"],
        ["colorProfile", "color-profile"],
        ["colorRendering", "color-rendering"],
        ["dominantBaseline", "dominant-baseline"],
        ["enableBackground", "enable-background"],
        ["fillOpacity", "fill-opacity"],
        ["fillRule", "fill-rule"],
        ["floodColor", "flood-color"],
        ["floodOpacity", "flood-opacity"],
        ["fontFamily", "font-family"],
        ["fontSize", "font-size"],
        ["fontSizeAdjust", "font-size-adjust"],
        ["fontStretch", "font-stretch"],
        ["fontStyle", "font-style"],
        ["fontVariant", "font-variant"],
        ["fontWeight", "font-weight"],
        ["glyphName", "glyph-name"],
        ["glyphOrientationHorizontal", "glyph-orientation-horizontal"],
        ["glyphOrientationVertical", "glyph-orientation-vertical"],
        ["horizAdvX", "horiz-adv-x"],
        ["horizOriginX", "horiz-origin-x"],
        ["imageRendering", "image-rendering"],
        ["letterSpacing", "letter-spacing"],
        ["lightingColor", "lighting-color"],
        ["markerEnd", "marker-end"],
        ["markerMid", "marker-mid"],
        ["markerStart", "marker-start"],
        ["overlinePosition", "overline-position"],
        ["overlineThickness", "overline-thickness"],
        ["paintOrder", "paint-order"],
        ["panose-1", "panose-1"],
        ["pointerEvents", "pointer-events"],
        ["renderingIntent", "rendering-intent"],
        ["shapeRendering", "shape-rendering"],
        ["stopColor", "stop-color"],
        ["stopOpacity", "stop-opacity"],
        ["strikethroughPosition", "strikethrough-position"],
        ["strikethroughThickness", "strikethrough-thickness"],
        ["strokeDasharray", "stroke-dasharray"],
        ["strokeDashoffset", "stroke-dashoffset"],
        ["strokeLinecap", "stroke-linecap"],
        ["strokeLinejoin", "stroke-linejoin"],
        ["strokeMiterlimit", "stroke-miterlimit"],
        ["strokeOpacity", "stroke-opacity"],
        ["strokeWidth", "stroke-width"],
        ["textAnchor", "text-anchor"],
        ["textDecoration", "text-decoration"],
        ["textRendering", "text-rendering"],
        ["transformOrigin", "transform-origin"],
        ["underlinePosition", "underline-position"],
        ["underlineThickness", "underline-thickness"],
        ["unicodeBidi", "unicode-bidi"],
        ["unicodeRange", "unicode-range"],
        ["unitsPerEm", "units-per-em"],
        ["vAlphabetic", "v-alphabetic"],
        ["vHanging", "v-hanging"],
        ["vIdeographic", "v-ideographic"],
        ["vMathematical", "v-mathematical"],
        ["vectorEffect", "vector-effect"],
        ["vertAdvY", "vert-adv-y"],
        ["vertOriginX", "vert-origin-x"],
        ["vertOriginY", "vert-origin-y"],
        ["wordSpacing", "word-spacing"],
        ["writingMode", "writing-mode"],
        ["xmlnsXlink", "xmlns:xlink"],
        ["xHeight", "x-height"]
      ]);
      var isJavaScriptProtocol = /^[\u0000-\u001F ]*j[\r\n\t]*a[\r\n\t]*v[\r\n\t]*a[\r\n\t]*s[\r\n\t]*c[\r\n\t]*r[\r\n\t]*i[\r\n\t]*p[\r\n\t]*t[\r\n\t]*:/i;
      function sanitizeURL(url) {
        return isJavaScriptProtocol.test("" + url) ? "javascript:throw new Error('React has blocked a javascript: URL as a security precaution.')" : url;
      }
      function noop$1() {
      }
      var currentReplayingEvent = null;
      function getEventTarget(nativeEvent) {
        nativeEvent = nativeEvent.target || nativeEvent.srcElement || window;
        nativeEvent.correspondingUseElement && (nativeEvent = nativeEvent.correspondingUseElement);
        return 3 === nativeEvent.nodeType ? nativeEvent.parentNode : nativeEvent;
      }
      var restoreTarget = null;
      var restoreQueue = null;
      function restoreStateOfTarget(target) {
        var internalInstance = getInstanceFromNode(target);
        if (internalInstance && (target = internalInstance.stateNode)) {
          var props = target[internalPropsKey] || null;
          a: switch (target = internalInstance.stateNode, internalInstance.type) {
            case "input":
              updateInput(
                target,
                props.value,
                props.defaultValue,
                props.defaultValue,
                props.checked,
                props.defaultChecked,
                props.type,
                props.name
              );
              internalInstance = props.name;
              if ("radio" === props.type && null != internalInstance) {
                for (props = target; props.parentNode; ) props = props.parentNode;
                props = props.querySelectorAll(
                  'input[name="' + escapeSelectorAttributeValueInsideDoubleQuotes(
                    "" + internalInstance
                  ) + '"][type="radio"]'
                );
                for (internalInstance = 0; internalInstance < props.length; internalInstance++) {
                  var otherNode = props[internalInstance];
                  if (otherNode !== target && otherNode.form === target.form) {
                    var otherProps = otherNode[internalPropsKey] || null;
                    if (!otherProps) throw Error(formatProdErrorMessage(90));
                    updateInput(
                      otherNode,
                      otherProps.value,
                      otherProps.defaultValue,
                      otherProps.defaultValue,
                      otherProps.checked,
                      otherProps.defaultChecked,
                      otherProps.type,
                      otherProps.name
                    );
                  }
                }
                for (internalInstance = 0; internalInstance < props.length; internalInstance++)
                  otherNode = props[internalInstance], otherNode.form === target.form && updateValueIfChanged(otherNode);
              }
              break a;
            case "textarea":
              updateTextarea(target, props.value, props.defaultValue);
              break a;
            case "select":
              internalInstance = props.value, null != internalInstance && updateOptions(target, !!props.multiple, internalInstance, false);
          }
        }
      }
      var isInsideEventHandler = false;
      function batchedUpdates$1(fn, a, b) {
        if (isInsideEventHandler) return fn(a, b);
        isInsideEventHandler = true;
        try {
          var JSCompiler_inline_result = fn(a);
          return JSCompiler_inline_result;
        } finally {
          if (isInsideEventHandler = false, null !== restoreTarget || null !== restoreQueue) {
            if (flushSyncWork$1(), restoreTarget && (a = restoreTarget, fn = restoreQueue, restoreQueue = restoreTarget = null, restoreStateOfTarget(a), fn))
              for (a = 0; a < fn.length; a++) restoreStateOfTarget(fn[a]);
          }
        }
      }
      function getListener(inst, registrationName) {
        var stateNode = inst.stateNode;
        if (null === stateNode) return null;
        var props = stateNode[internalPropsKey] || null;
        if (null === props) return null;
        stateNode = props[registrationName];
        a: switch (registrationName) {
          case "onClick":
          case "onClickCapture":
          case "onDoubleClick":
          case "onDoubleClickCapture":
          case "onMouseDown":
          case "onMouseDownCapture":
          case "onMouseMove":
          case "onMouseMoveCapture":
          case "onMouseUp":
          case "onMouseUpCapture":
          case "onMouseEnter":
            (props = !props.disabled) || (inst = inst.type, props = !("button" === inst || "input" === inst || "select" === inst || "textarea" === inst));
            inst = !props;
            break a;
          default:
            inst = false;
        }
        if (inst) return null;
        if (stateNode && "function" !== typeof stateNode)
          throw Error(
            formatProdErrorMessage(231, registrationName, typeof stateNode)
          );
        return stateNode;
      }
      var canUseDOM = !("undefined" === typeof window || "undefined" === typeof window.document || "undefined" === typeof window.document.createElement);
      var passiveBrowserEventsSupported = false;
      if (canUseDOM)
        try {
          options = {};
          Object.defineProperty(options, "passive", {
            get: function() {
              passiveBrowserEventsSupported = true;
            }
          });
          window.addEventListener("test", options, options);
          window.removeEventListener("test", options, options);
        } catch (e) {
          passiveBrowserEventsSupported = false;
        }
      var options;
      var root = null;
      var startText = null;
      var fallbackText = null;
      function getData() {
        if (fallbackText) return fallbackText;
        var start, startValue = startText, startLength = startValue.length, end, endValue = "value" in root ? root.value : root.textContent, endLength = endValue.length;
        for (start = 0; start < startLength && startValue[start] === endValue[start]; start++) ;
        var minEnd = startLength - start;
        for (end = 1; end <= minEnd && startValue[startLength - end] === endValue[endLength - end]; end++) ;
        return fallbackText = endValue.slice(start, 1 < end ? 1 - end : void 0);
      }
      function getEventCharCode(nativeEvent) {
        var keyCode = nativeEvent.keyCode;
        "charCode" in nativeEvent ? (nativeEvent = nativeEvent.charCode, 0 === nativeEvent && 13 === keyCode && (nativeEvent = 13)) : nativeEvent = keyCode;
        10 === nativeEvent && (nativeEvent = 13);
        return 32 <= nativeEvent || 13 === nativeEvent ? nativeEvent : 0;
      }
      function functionThatReturnsTrue() {
        return true;
      }
      function functionThatReturnsFalse() {
        return false;
      }
      function createSyntheticEvent(Interface) {
        function SyntheticBaseEvent(reactName, reactEventType, targetInst, nativeEvent, nativeEventTarget) {
          this._reactName = reactName;
          this._targetInst = targetInst;
          this.type = reactEventType;
          this.nativeEvent = nativeEvent;
          this.target = nativeEventTarget;
          this.currentTarget = null;
          for (var propName in Interface)
            Interface.hasOwnProperty(propName) && (reactName = Interface[propName], this[propName] = reactName ? reactName(nativeEvent) : nativeEvent[propName]);
          this.isDefaultPrevented = (null != nativeEvent.defaultPrevented ? nativeEvent.defaultPrevented : false === nativeEvent.returnValue) ? functionThatReturnsTrue : functionThatReturnsFalse;
          this.isPropagationStopped = functionThatReturnsFalse;
          return this;
        }
        assign(SyntheticBaseEvent.prototype, {
          preventDefault: function() {
            this.defaultPrevented = true;
            var event = this.nativeEvent;
            event && (event.preventDefault ? event.preventDefault() : "unknown" !== typeof event.returnValue && (event.returnValue = false), this.isDefaultPrevented = functionThatReturnsTrue);
          },
          stopPropagation: function() {
            var event = this.nativeEvent;
            event && (event.stopPropagation ? event.stopPropagation() : "unknown" !== typeof event.cancelBubble && (event.cancelBubble = true), this.isPropagationStopped = functionThatReturnsTrue);
          },
          persist: function() {
          },
          isPersistent: functionThatReturnsTrue
        });
        return SyntheticBaseEvent;
      }
      var EventInterface = {
        eventPhase: 0,
        bubbles: 0,
        cancelable: 0,
        timeStamp: function(event) {
          return event.timeStamp || Date.now();
        },
        defaultPrevented: 0,
        isTrusted: 0
      };
      var SyntheticEvent = createSyntheticEvent(EventInterface);
      var UIEventInterface = assign({}, EventInterface, { view: 0, detail: 0 });
      var SyntheticUIEvent = createSyntheticEvent(UIEventInterface);
      var lastMovementX;
      var lastMovementY;
      var lastMouseEvent;
      var MouseEventInterface = assign({}, UIEventInterface, {
        screenX: 0,
        screenY: 0,
        clientX: 0,
        clientY: 0,
        pageX: 0,
        pageY: 0,
        ctrlKey: 0,
        shiftKey: 0,
        altKey: 0,
        metaKey: 0,
        getModifierState: getEventModifierState,
        button: 0,
        buttons: 0,
        relatedTarget: function(event) {
          return void 0 === event.relatedTarget ? event.fromElement === event.srcElement ? event.toElement : event.fromElement : event.relatedTarget;
        },
        movementX: function(event) {
          if ("movementX" in event) return event.movementX;
          event !== lastMouseEvent && (lastMouseEvent && "mousemove" === event.type ? (lastMovementX = event.screenX - lastMouseEvent.screenX, lastMovementY = event.screenY - lastMouseEvent.screenY) : lastMovementY = lastMovementX = 0, lastMouseEvent = event);
          return lastMovementX;
        },
        movementY: function(event) {
          return "movementY" in event ? event.movementY : lastMovementY;
        }
      });
      var SyntheticMouseEvent = createSyntheticEvent(MouseEventInterface);
      var DragEventInterface = assign({}, MouseEventInterface, { dataTransfer: 0 });
      var SyntheticDragEvent = createSyntheticEvent(DragEventInterface);
      var FocusEventInterface = assign({}, UIEventInterface, { relatedTarget: 0 });
      var SyntheticFocusEvent = createSyntheticEvent(FocusEventInterface);
      var AnimationEventInterface = assign({}, EventInterface, {
        animationName: 0,
        elapsedTime: 0,
        pseudoElement: 0
      });
      var SyntheticAnimationEvent = createSyntheticEvent(AnimationEventInterface);
      var ClipboardEventInterface = assign({}, EventInterface, {
        clipboardData: function(event) {
          return "clipboardData" in event ? event.clipboardData : window.clipboardData;
        }
      });
      var SyntheticClipboardEvent = createSyntheticEvent(ClipboardEventInterface);
      var CompositionEventInterface = assign({}, EventInterface, { data: 0 });
      var SyntheticCompositionEvent = createSyntheticEvent(CompositionEventInterface);
      var normalizeKey = {
        Esc: "Escape",
        Spacebar: " ",
        Left: "ArrowLeft",
        Up: "ArrowUp",
        Right: "ArrowRight",
        Down: "ArrowDown",
        Del: "Delete",
        Win: "OS",
        Menu: "ContextMenu",
        Apps: "ContextMenu",
        Scroll: "ScrollLock",
        MozPrintableKey: "Unidentified"
      };
      var translateToKey = {
        8: "Backspace",
        9: "Tab",
        12: "Clear",
        13: "Enter",
        16: "Shift",
        17: "Control",
        18: "Alt",
        19: "Pause",
        20: "CapsLock",
        27: "Escape",
        32: " ",
        33: "PageUp",
        34: "PageDown",
        35: "End",
        36: "Home",
        37: "ArrowLeft",
        38: "ArrowUp",
        39: "ArrowRight",
        40: "ArrowDown",
        45: "Insert",
        46: "Delete",
        112: "F1",
        113: "F2",
        114: "F3",
        115: "F4",
        116: "F5",
        117: "F6",
        118: "F7",
        119: "F8",
        120: "F9",
        121: "F10",
        122: "F11",
        123: "F12",
        144: "NumLock",
        145: "ScrollLock",
        224: "Meta"
      };
      var modifierKeyToProp = {
        Alt: "altKey",
        Control: "ctrlKey",
        Meta: "metaKey",
        Shift: "shiftKey"
      };
      function modifierStateGetter(keyArg) {
        var nativeEvent = this.nativeEvent;
        return nativeEvent.getModifierState ? nativeEvent.getModifierState(keyArg) : (keyArg = modifierKeyToProp[keyArg]) ? !!nativeEvent[keyArg] : false;
      }
      function getEventModifierState() {
        return modifierStateGetter;
      }
      var KeyboardEventInterface = assign({}, UIEventInterface, {
        key: function(nativeEvent) {
          if (nativeEvent.key) {
            var key = normalizeKey[nativeEvent.key] || nativeEvent.key;
            if ("Unidentified" !== key) return key;
          }
          return "keypress" === nativeEvent.type ? (nativeEvent = getEventCharCode(nativeEvent), 13 === nativeEvent ? "Enter" : String.fromCharCode(nativeEvent)) : "keydown" === nativeEvent.type || "keyup" === nativeEvent.type ? translateToKey[nativeEvent.keyCode] || "Unidentified" : "";
        },
        code: 0,
        location: 0,
        ctrlKey: 0,
        shiftKey: 0,
        altKey: 0,
        metaKey: 0,
        repeat: 0,
        locale: 0,
        getModifierState: getEventModifierState,
        charCode: function(event) {
          return "keypress" === event.type ? getEventCharCode(event) : 0;
        },
        keyCode: function(event) {
          return "keydown" === event.type || "keyup" === event.type ? event.keyCode : 0;
        },
        which: function(event) {
          return "keypress" === event.type ? getEventCharCode(event) : "keydown" === event.type || "keyup" === event.type ? event.keyCode : 0;
        }
      });
      var SyntheticKeyboardEvent = createSyntheticEvent(KeyboardEventInterface);
      var PointerEventInterface = assign({}, MouseEventInterface, {
        pointerId: 0,
        width: 0,
        height: 0,
        pressure: 0,
        tangentialPressure: 0,
        tiltX: 0,
        tiltY: 0,
        twist: 0,
        pointerType: 0,
        isPrimary: 0
      });
      var SyntheticPointerEvent = createSyntheticEvent(PointerEventInterface);
      var TouchEventInterface = assign({}, UIEventInterface, {
        touches: 0,
        targetTouches: 0,
        changedTouches: 0,
        altKey: 0,
        metaKey: 0,
        ctrlKey: 0,
        shiftKey: 0,
        getModifierState: getEventModifierState
      });
      var SyntheticTouchEvent = createSyntheticEvent(TouchEventInterface);
      var TransitionEventInterface = assign({}, EventInterface, {
        propertyName: 0,
        elapsedTime: 0,
        pseudoElement: 0
      });
      var SyntheticTransitionEvent = createSyntheticEvent(TransitionEventInterface);
      var WheelEventInterface = assign({}, MouseEventInterface, {
        deltaX: function(event) {
          return "deltaX" in event ? event.deltaX : "wheelDeltaX" in event ? -event.wheelDeltaX : 0;
        },
        deltaY: function(event) {
          return "deltaY" in event ? event.deltaY : "wheelDeltaY" in event ? -event.wheelDeltaY : "wheelDelta" in event ? -event.wheelDelta : 0;
        },
        deltaZ: 0,
        deltaMode: 0
      });
      var SyntheticWheelEvent = createSyntheticEvent(WheelEventInterface);
      var ToggleEventInterface = assign({}, EventInterface, {
        newState: 0,
        oldState: 0
      });
      var SyntheticToggleEvent = createSyntheticEvent(ToggleEventInterface);
      var END_KEYCODES = [9, 13, 27, 32];
      var canUseCompositionEvent = canUseDOM && "CompositionEvent" in window;
      var documentMode = null;
      canUseDOM && "documentMode" in document && (documentMode = document.documentMode);
      var canUseTextInputEvent = canUseDOM && "TextEvent" in window && !documentMode;
      var useFallbackCompositionData = canUseDOM && (!canUseCompositionEvent || documentMode && 8 < documentMode && 11 >= documentMode);
      var SPACEBAR_CHAR = String.fromCharCode(32);
      var hasSpaceKeypress = false;
      function isFallbackCompositionEnd(domEventName, nativeEvent) {
        switch (domEventName) {
          case "keyup":
            return -1 !== END_KEYCODES.indexOf(nativeEvent.keyCode);
          case "keydown":
            return 229 !== nativeEvent.keyCode;
          case "keypress":
          case "mousedown":
          case "focusout":
            return true;
          default:
            return false;
        }
      }
      function getDataFromCustomEvent(nativeEvent) {
        nativeEvent = nativeEvent.detail;
        return "object" === typeof nativeEvent && "data" in nativeEvent ? nativeEvent.data : null;
      }
      var isComposing = false;
      function getNativeBeforeInputChars(domEventName, nativeEvent) {
        switch (domEventName) {
          case "compositionend":
            return getDataFromCustomEvent(nativeEvent);
          case "keypress":
            if (32 !== nativeEvent.which) return null;
            hasSpaceKeypress = true;
            return SPACEBAR_CHAR;
          case "textInput":
            return domEventName = nativeEvent.data, domEventName === SPACEBAR_CHAR && hasSpaceKeypress ? null : domEventName;
          default:
            return null;
        }
      }
      function getFallbackBeforeInputChars(domEventName, nativeEvent) {
        if (isComposing)
          return "compositionend" === domEventName || !canUseCompositionEvent && isFallbackCompositionEnd(domEventName, nativeEvent) ? (domEventName = getData(), fallbackText = startText = root = null, isComposing = false, domEventName) : null;
        switch (domEventName) {
          case "paste":
            return null;
          case "keypress":
            if (!(nativeEvent.ctrlKey || nativeEvent.altKey || nativeEvent.metaKey) || nativeEvent.ctrlKey && nativeEvent.altKey) {
              if (nativeEvent.char && 1 < nativeEvent.char.length)
                return nativeEvent.char;
              if (nativeEvent.which) return String.fromCharCode(nativeEvent.which);
            }
            return null;
          case "compositionend":
            return useFallbackCompositionData && "ko" !== nativeEvent.locale ? null : nativeEvent.data;
          default:
            return null;
        }
      }
      var supportedInputTypes = {
        color: true,
        date: true,
        datetime: true,
        "datetime-local": true,
        email: true,
        month: true,
        number: true,
        password: true,
        range: true,
        search: true,
        tel: true,
        text: true,
        time: true,
        url: true,
        week: true
      };
      function isTextInputElement(elem) {
        var nodeName = elem && elem.nodeName && elem.nodeName.toLowerCase();
        return "input" === nodeName ? !!supportedInputTypes[elem.type] : "textarea" === nodeName ? true : false;
      }
      function createAndAccumulateChangeEvent(dispatchQueue, inst, nativeEvent, target) {
        restoreTarget ? restoreQueue ? restoreQueue.push(target) : restoreQueue = [target] : restoreTarget = target;
        inst = accumulateTwoPhaseListeners(inst, "onChange");
        0 < inst.length && (nativeEvent = new SyntheticEvent(
          "onChange",
          "change",
          null,
          nativeEvent,
          target
        ), dispatchQueue.push({ event: nativeEvent, listeners: inst }));
      }
      var activeElement$1 = null;
      var activeElementInst$1 = null;
      function runEventInBatch(dispatchQueue) {
        processDispatchQueue(dispatchQueue, 0);
      }
      function getInstIfValueChanged(targetInst) {
        var targetNode = getNodeFromInstance(targetInst);
        if (updateValueIfChanged(targetNode)) return targetInst;
      }
      function getTargetInstForChangeEvent(domEventName, targetInst) {
        if ("change" === domEventName) return targetInst;
      }
      var isInputEventSupported = false;
      if (canUseDOM) {
        if (canUseDOM) {
          isSupported$jscomp$inline_427 = "oninput" in document;
          if (!isSupported$jscomp$inline_427) {
            element$jscomp$inline_428 = document.createElement("div");
            element$jscomp$inline_428.setAttribute("oninput", "return;");
            isSupported$jscomp$inline_427 = "function" === typeof element$jscomp$inline_428.oninput;
          }
          JSCompiler_inline_result$jscomp$286 = isSupported$jscomp$inline_427;
        } else JSCompiler_inline_result$jscomp$286 = false;
        isInputEventSupported = JSCompiler_inline_result$jscomp$286 && (!document.documentMode || 9 < document.documentMode);
      }
      var JSCompiler_inline_result$jscomp$286;
      var isSupported$jscomp$inline_427;
      var element$jscomp$inline_428;
      function stopWatchingForValueChange() {
        activeElement$1 && (activeElement$1.detachEvent("onpropertychange", handlePropertyChange), activeElementInst$1 = activeElement$1 = null);
      }
      function handlePropertyChange(nativeEvent) {
        if ("value" === nativeEvent.propertyName && getInstIfValueChanged(activeElementInst$1)) {
          var dispatchQueue = [];
          createAndAccumulateChangeEvent(
            dispatchQueue,
            activeElementInst$1,
            nativeEvent,
            getEventTarget(nativeEvent)
          );
          batchedUpdates$1(runEventInBatch, dispatchQueue);
        }
      }
      function handleEventsForInputEventPolyfill(domEventName, target, targetInst) {
        "focusin" === domEventName ? (stopWatchingForValueChange(), activeElement$1 = target, activeElementInst$1 = targetInst, activeElement$1.attachEvent("onpropertychange", handlePropertyChange)) : "focusout" === domEventName && stopWatchingForValueChange();
      }
      function getTargetInstForInputEventPolyfill(domEventName) {
        if ("selectionchange" === domEventName || "keyup" === domEventName || "keydown" === domEventName)
          return getInstIfValueChanged(activeElementInst$1);
      }
      function getTargetInstForClickEvent(domEventName, targetInst) {
        if ("click" === domEventName) return getInstIfValueChanged(targetInst);
      }
      function getTargetInstForInputOrChangeEvent(domEventName, targetInst) {
        if ("input" === domEventName || "change" === domEventName)
          return getInstIfValueChanged(targetInst);
      }
      function is(x, y) {
        return x === y && (0 !== x || 1 / x === 1 / y) || x !== x && y !== y;
      }
      var objectIs = "function" === typeof Object.is ? Object.is : is;
      function shallowEqual(objA, objB) {
        if (objectIs(objA, objB)) return true;
        if ("object" !== typeof objA || null === objA || "object" !== typeof objB || null === objB)
          return false;
        var keysA = Object.keys(objA), keysB = Object.keys(objB);
        if (keysA.length !== keysB.length) return false;
        for (keysB = 0; keysB < keysA.length; keysB++) {
          var currentKey = keysA[keysB];
          if (!hasOwnProperty.call(objB, currentKey) || !objectIs(objA[currentKey], objB[currentKey]))
            return false;
        }
        return true;
      }
      function getLeafNode(node) {
        for (; node && node.firstChild; ) node = node.firstChild;
        return node;
      }
      function getNodeForCharacterOffset(root2, offset) {
        var node = getLeafNode(root2);
        root2 = 0;
        for (var nodeEnd; node; ) {
          if (3 === node.nodeType) {
            nodeEnd = root2 + node.textContent.length;
            if (root2 <= offset && nodeEnd >= offset)
              return { node, offset: offset - root2 };
            root2 = nodeEnd;
          }
          a: {
            for (; node; ) {
              if (node.nextSibling) {
                node = node.nextSibling;
                break a;
              }
              node = node.parentNode;
            }
            node = void 0;
          }
          node = getLeafNode(node);
        }
      }
      function containsNode(outerNode, innerNode) {
        return outerNode && innerNode ? outerNode === innerNode ? true : outerNode && 3 === outerNode.nodeType ? false : innerNode && 3 === innerNode.nodeType ? containsNode(outerNode, innerNode.parentNode) : "contains" in outerNode ? outerNode.contains(innerNode) : outerNode.compareDocumentPosition ? !!(outerNode.compareDocumentPosition(innerNode) & 16) : false : false;
      }
      function getActiveElementDeep(containerInfo) {
        containerInfo = null != containerInfo && null != containerInfo.ownerDocument && null != containerInfo.ownerDocument.defaultView ? containerInfo.ownerDocument.defaultView : window;
        for (var element = getActiveElement(containerInfo.document); element instanceof containerInfo.HTMLIFrameElement; ) {
          try {
            var JSCompiler_inline_result = "string" === typeof element.contentWindow.location.href;
          } catch (err) {
            JSCompiler_inline_result = false;
          }
          if (JSCompiler_inline_result) containerInfo = element.contentWindow;
          else break;
          element = getActiveElement(containerInfo.document);
        }
        return element;
      }
      function hasSelectionCapabilities(elem) {
        var nodeName = elem && elem.nodeName && elem.nodeName.toLowerCase();
        return nodeName && ("input" === nodeName && ("text" === elem.type || "search" === elem.type || "tel" === elem.type || "url" === elem.type || "password" === elem.type) || "textarea" === nodeName || "true" === elem.contentEditable);
      }
      var skipSelectionChangeEvent = canUseDOM && "documentMode" in document && 11 >= document.documentMode;
      var activeElement = null;
      var activeElementInst = null;
      var lastSelection = null;
      var mouseDown = false;
      function constructSelectEvent(dispatchQueue, nativeEvent, nativeEventTarget) {
        var doc = nativeEventTarget.window === nativeEventTarget ? nativeEventTarget.document : 9 === nativeEventTarget.nodeType ? nativeEventTarget : nativeEventTarget.ownerDocument;
        mouseDown || null == activeElement || activeElement !== getActiveElement(doc) || (doc = activeElement, "selectionStart" in doc && hasSelectionCapabilities(doc) ? doc = { start: doc.selectionStart, end: doc.selectionEnd } : (doc = (doc.ownerDocument && doc.ownerDocument.defaultView || window).getSelection(), doc = {
          anchorNode: doc.anchorNode,
          anchorOffset: doc.anchorOffset,
          focusNode: doc.focusNode,
          focusOffset: doc.focusOffset
        }), lastSelection && shallowEqual(lastSelection, doc) || (lastSelection = doc, doc = accumulateTwoPhaseListeners(activeElementInst, "onSelect"), 0 < doc.length && (nativeEvent = new SyntheticEvent(
          "onSelect",
          "select",
          null,
          nativeEvent,
          nativeEventTarget
        ), dispatchQueue.push({ event: nativeEvent, listeners: doc }), nativeEvent.target = activeElement)));
      }
      function makePrefixMap(styleProp, eventName) {
        var prefixes = {};
        prefixes[styleProp.toLowerCase()] = eventName.toLowerCase();
        prefixes["Webkit" + styleProp] = "webkit" + eventName;
        prefixes["Moz" + styleProp] = "moz" + eventName;
        return prefixes;
      }
      var vendorPrefixes = {
        animationend: makePrefixMap("Animation", "AnimationEnd"),
        animationiteration: makePrefixMap("Animation", "AnimationIteration"),
        animationstart: makePrefixMap("Animation", "AnimationStart"),
        transitionrun: makePrefixMap("Transition", "TransitionRun"),
        transitionstart: makePrefixMap("Transition", "TransitionStart"),
        transitioncancel: makePrefixMap("Transition", "TransitionCancel"),
        transitionend: makePrefixMap("Transition", "TransitionEnd")
      };
      var prefixedEventNames = {};
      var style = {};
      canUseDOM && (style = document.createElement("div").style, "AnimationEvent" in window || (delete vendorPrefixes.animationend.animation, delete vendorPrefixes.animationiteration.animation, delete vendorPrefixes.animationstart.animation), "TransitionEvent" in window || delete vendorPrefixes.transitionend.transition);
      function getVendorPrefixedEventName(eventName) {
        if (prefixedEventNames[eventName]) return prefixedEventNames[eventName];
        if (!vendorPrefixes[eventName]) return eventName;
        var prefixMap = vendorPrefixes[eventName], styleProp;
        for (styleProp in prefixMap)
          if (prefixMap.hasOwnProperty(styleProp) && styleProp in style)
            return prefixedEventNames[eventName] = prefixMap[styleProp];
        return eventName;
      }
      var ANIMATION_END = getVendorPrefixedEventName("animationend");
      var ANIMATION_ITERATION = getVendorPrefixedEventName("animationiteration");
      var ANIMATION_START = getVendorPrefixedEventName("animationstart");
      var TRANSITION_RUN = getVendorPrefixedEventName("transitionrun");
      var TRANSITION_START = getVendorPrefixedEventName("transitionstart");
      var TRANSITION_CANCEL = getVendorPrefixedEventName("transitioncancel");
      var TRANSITION_END = getVendorPrefixedEventName("transitionend");
      var topLevelEventsToReactNames = /* @__PURE__ */ new Map();
      var simpleEventPluginEvents = "abort auxClick beforeToggle cancel canPlay canPlayThrough click close contextMenu copy cut drag dragEnd dragEnter dragExit dragLeave dragOver dragStart drop durationChange emptied encrypted ended error gotPointerCapture input invalid keyDown keyPress keyUp load loadedData loadedMetadata loadStart lostPointerCapture mouseDown mouseMove mouseOut mouseOver mouseUp paste pause play playing pointerCancel pointerDown pointerMove pointerOut pointerOver pointerUp progress rateChange reset resize seeked seeking stalled submit suspend timeUpdate touchCancel touchEnd touchStart volumeChange scroll toggle touchMove waiting wheel".split(
        " "
      );
      simpleEventPluginEvents.push("scrollEnd");
      function registerSimpleEvent(domEventName, reactName) {
        topLevelEventsToReactNames.set(domEventName, reactName);
        registerTwoPhaseEvent(reactName, [domEventName]);
      }
      var reportGlobalError = "function" === typeof reportError ? reportError : function(error) {
        if ("object" === typeof window && "function" === typeof window.ErrorEvent) {
          var event = new window.ErrorEvent("error", {
            bubbles: true,
            cancelable: true,
            message: "object" === typeof error && null !== error && "string" === typeof error.message ? String(error.message) : String(error),
            error
          });
          if (!window.dispatchEvent(event)) return;
        } else if ("object" === typeof process && "function" === typeof process.emit) {
          process.emit("uncaughtException", error);
          return;
        }
        console.error(error);
      };
      var concurrentQueues = [];
      var concurrentQueuesIndex = 0;
      var concurrentlyUpdatedLanes = 0;
      function finishQueueingConcurrentUpdates() {
        for (var endIndex = concurrentQueuesIndex, i = concurrentlyUpdatedLanes = concurrentQueuesIndex = 0; i < endIndex; ) {
          var fiber = concurrentQueues[i];
          concurrentQueues[i++] = null;
          var queue = concurrentQueues[i];
          concurrentQueues[i++] = null;
          var update = concurrentQueues[i];
          concurrentQueues[i++] = null;
          var lane = concurrentQueues[i];
          concurrentQueues[i++] = null;
          if (null !== queue && null !== update) {
            var pending = queue.pending;
            null === pending ? update.next = update : (update.next = pending.next, pending.next = update);
            queue.pending = update;
          }
          0 !== lane && markUpdateLaneFromFiberToRoot(fiber, update, lane);
        }
      }
      function enqueueUpdate$1(fiber, queue, update, lane) {
        concurrentQueues[concurrentQueuesIndex++] = fiber;
        concurrentQueues[concurrentQueuesIndex++] = queue;
        concurrentQueues[concurrentQueuesIndex++] = update;
        concurrentQueues[concurrentQueuesIndex++] = lane;
        concurrentlyUpdatedLanes |= lane;
        fiber.lanes |= lane;
        fiber = fiber.alternate;
        null !== fiber && (fiber.lanes |= lane);
      }
      function enqueueConcurrentHookUpdate(fiber, queue, update, lane) {
        enqueueUpdate$1(fiber, queue, update, lane);
        return getRootForUpdatedFiber(fiber);
      }
      function enqueueConcurrentRenderForLane(fiber, lane) {
        enqueueUpdate$1(fiber, null, null, lane);
        return getRootForUpdatedFiber(fiber);
      }
      function markUpdateLaneFromFiberToRoot(sourceFiber, update, lane) {
        sourceFiber.lanes |= lane;
        var alternate = sourceFiber.alternate;
        null !== alternate && (alternate.lanes |= lane);
        for (var isHidden = false, parent = sourceFiber.return; null !== parent; )
          parent.childLanes |= lane, alternate = parent.alternate, null !== alternate && (alternate.childLanes |= lane), 22 === parent.tag && (sourceFiber = parent.stateNode, null === sourceFiber || sourceFiber._visibility & 1 || (isHidden = true)), sourceFiber = parent, parent = parent.return;
        return 3 === sourceFiber.tag ? (parent = sourceFiber.stateNode, isHidden && null !== update && (isHidden = 31 - clz32(lane), sourceFiber = parent.hiddenUpdates, alternate = sourceFiber[isHidden], null === alternate ? sourceFiber[isHidden] = [update] : alternate.push(update), update.lane = lane | 536870912), parent) : null;
      }
      function getRootForUpdatedFiber(sourceFiber) {
        if (50 < nestedUpdateCount)
          throw nestedUpdateCount = 0, rootWithNestedUpdates = null, Error(formatProdErrorMessage(185));
        for (var parent = sourceFiber.return; null !== parent; )
          sourceFiber = parent, parent = sourceFiber.return;
        return 3 === sourceFiber.tag ? sourceFiber.stateNode : null;
      }
      var emptyContextObject = {};
      function FiberNode(tag, pendingProps, key, mode) {
        this.tag = tag;
        this.key = key;
        this.sibling = this.child = this.return = this.stateNode = this.type = this.elementType = null;
        this.index = 0;
        this.refCleanup = this.ref = null;
        this.pendingProps = pendingProps;
        this.dependencies = this.memoizedState = this.updateQueue = this.memoizedProps = null;
        this.mode = mode;
        this.subtreeFlags = this.flags = 0;
        this.deletions = null;
        this.childLanes = this.lanes = 0;
        this.alternate = null;
      }
      function createFiberImplClass(tag, pendingProps, key, mode) {
        return new FiberNode(tag, pendingProps, key, mode);
      }
      function shouldConstruct(Component2) {
        Component2 = Component2.prototype;
        return !(!Component2 || !Component2.isReactComponent);
      }
      function createWorkInProgress(current, pendingProps) {
        var workInProgress2 = current.alternate;
        null === workInProgress2 ? (workInProgress2 = createFiberImplClass(
          current.tag,
          pendingProps,
          current.key,
          current.mode
        ), workInProgress2.elementType = current.elementType, workInProgress2.type = current.type, workInProgress2.stateNode = current.stateNode, workInProgress2.alternate = current, current.alternate = workInProgress2) : (workInProgress2.pendingProps = pendingProps, workInProgress2.type = current.type, workInProgress2.flags = 0, workInProgress2.subtreeFlags = 0, workInProgress2.deletions = null);
        workInProgress2.flags = current.flags & 65011712;
        workInProgress2.childLanes = current.childLanes;
        workInProgress2.lanes = current.lanes;
        workInProgress2.child = current.child;
        workInProgress2.memoizedProps = current.memoizedProps;
        workInProgress2.memoizedState = current.memoizedState;
        workInProgress2.updateQueue = current.updateQueue;
        pendingProps = current.dependencies;
        workInProgress2.dependencies = null === pendingProps ? null : { lanes: pendingProps.lanes, firstContext: pendingProps.firstContext };
        workInProgress2.sibling = current.sibling;
        workInProgress2.index = current.index;
        workInProgress2.ref = current.ref;
        workInProgress2.refCleanup = current.refCleanup;
        return workInProgress2;
      }
      function resetWorkInProgress(workInProgress2, renderLanes2) {
        workInProgress2.flags &= 65011714;
        var current = workInProgress2.alternate;
        null === current ? (workInProgress2.childLanes = 0, workInProgress2.lanes = renderLanes2, workInProgress2.child = null, workInProgress2.subtreeFlags = 0, workInProgress2.memoizedProps = null, workInProgress2.memoizedState = null, workInProgress2.updateQueue = null, workInProgress2.dependencies = null, workInProgress2.stateNode = null) : (workInProgress2.childLanes = current.childLanes, workInProgress2.lanes = current.lanes, workInProgress2.child = current.child, workInProgress2.subtreeFlags = 0, workInProgress2.deletions = null, workInProgress2.memoizedProps = current.memoizedProps, workInProgress2.memoizedState = current.memoizedState, workInProgress2.updateQueue = current.updateQueue, workInProgress2.type = current.type, renderLanes2 = current.dependencies, workInProgress2.dependencies = null === renderLanes2 ? null : {
          lanes: renderLanes2.lanes,
          firstContext: renderLanes2.firstContext
        });
        return workInProgress2;
      }
      function createFiberFromTypeAndProps(type, key, pendingProps, owner, mode, lanes) {
        var fiberTag = 0;
        owner = type;
        if ("function" === typeof type) shouldConstruct(type) && (fiberTag = 1);
        else if ("string" === typeof type)
          fiberTag = isHostHoistableType(
            type,
            pendingProps,
            contextStackCursor.current
          ) ? 26 : "html" === type || "head" === type || "body" === type ? 27 : 5;
        else
          a: switch (type) {
            case REACT_ACTIVITY_TYPE:
              return type = createFiberImplClass(31, pendingProps, key, mode), type.elementType = REACT_ACTIVITY_TYPE, type.lanes = lanes, type;
            case REACT_FRAGMENT_TYPE:
              return createFiberFromFragment(pendingProps.children, mode, lanes, key);
            case REACT_STRICT_MODE_TYPE:
              fiberTag = 8;
              mode |= 24;
              break;
            case REACT_PROFILER_TYPE:
              return type = createFiberImplClass(12, pendingProps, key, mode | 2), type.elementType = REACT_PROFILER_TYPE, type.lanes = lanes, type;
            case REACT_SUSPENSE_TYPE:
              return type = createFiberImplClass(13, pendingProps, key, mode), type.elementType = REACT_SUSPENSE_TYPE, type.lanes = lanes, type;
            case REACT_SUSPENSE_LIST_TYPE:
              return type = createFiberImplClass(19, pendingProps, key, mode), type.elementType = REACT_SUSPENSE_LIST_TYPE, type.lanes = lanes, type;
            default:
              if ("object" === typeof type && null !== type)
                switch (type.$$typeof) {
                  case REACT_CONTEXT_TYPE:
                    fiberTag = 10;
                    break a;
                  case REACT_CONSUMER_TYPE:
                    fiberTag = 9;
                    break a;
                  case REACT_FORWARD_REF_TYPE:
                    fiberTag = 11;
                    break a;
                  case REACT_MEMO_TYPE:
                    fiberTag = 14;
                    break a;
                  case REACT_LAZY_TYPE:
                    fiberTag = 16;
                    owner = null;
                    break a;
                }
              fiberTag = 29;
              pendingProps = Error(
                formatProdErrorMessage(130, null === type ? "null" : typeof type, "")
              );
              owner = null;
          }
        key = createFiberImplClass(fiberTag, pendingProps, key, mode);
        key.elementType = type;
        key.type = owner;
        key.lanes = lanes;
        return key;
      }
      function createFiberFromFragment(elements, mode, lanes, key) {
        elements = createFiberImplClass(7, elements, key, mode);
        elements.lanes = lanes;
        return elements;
      }
      function createFiberFromText(content, mode, lanes) {
        content = createFiberImplClass(6, content, null, mode);
        content.lanes = lanes;
        return content;
      }
      function createFiberFromDehydratedFragment(dehydratedNode) {
        var fiber = createFiberImplClass(18, null, null, 0);
        fiber.stateNode = dehydratedNode;
        return fiber;
      }
      function createFiberFromPortal(portal, mode, lanes) {
        mode = createFiberImplClass(
          4,
          null !== portal.children ? portal.children : [],
          portal.key,
          mode
        );
        mode.lanes = lanes;
        mode.stateNode = {
          containerInfo: portal.containerInfo,
          pendingChildren: null,
          implementation: portal.implementation
        };
        return mode;
      }
      var CapturedStacks = /* @__PURE__ */ new WeakMap();
      function createCapturedValueAtFiber(value, source) {
        if ("object" === typeof value && null !== value) {
          var existing = CapturedStacks.get(value);
          if (void 0 !== existing) return existing;
          source = {
            value,
            source,
            stack: getStackByFiberInDevAndProd(source)
          };
          CapturedStacks.set(value, source);
          return source;
        }
        return {
          value,
          source,
          stack: getStackByFiberInDevAndProd(source)
        };
      }
      var forkStack = [];
      var forkStackIndex = 0;
      var treeForkProvider = null;
      var treeForkCount = 0;
      var idStack = [];
      var idStackIndex = 0;
      var treeContextProvider = null;
      var treeContextId = 1;
      var treeContextOverflow = "";
      function pushTreeFork(workInProgress2, totalChildren) {
        forkStack[forkStackIndex++] = treeForkCount;
        forkStack[forkStackIndex++] = treeForkProvider;
        treeForkProvider = workInProgress2;
        treeForkCount = totalChildren;
      }
      function pushTreeId(workInProgress2, totalChildren, index2) {
        idStack[idStackIndex++] = treeContextId;
        idStack[idStackIndex++] = treeContextOverflow;
        idStack[idStackIndex++] = treeContextProvider;
        treeContextProvider = workInProgress2;
        var baseIdWithLeadingBit = treeContextId;
        workInProgress2 = treeContextOverflow;
        var baseLength = 32 - clz32(baseIdWithLeadingBit) - 1;
        baseIdWithLeadingBit &= ~(1 << baseLength);
        index2 += 1;
        var length = 32 - clz32(totalChildren) + baseLength;
        if (30 < length) {
          var numberOfOverflowBits = baseLength - baseLength % 5;
          length = (baseIdWithLeadingBit & (1 << numberOfOverflowBits) - 1).toString(32);
          baseIdWithLeadingBit >>= numberOfOverflowBits;
          baseLength -= numberOfOverflowBits;
          treeContextId = 1 << 32 - clz32(totalChildren) + baseLength | index2 << baseLength | baseIdWithLeadingBit;
          treeContextOverflow = length + workInProgress2;
        } else
          treeContextId = 1 << length | index2 << baseLength | baseIdWithLeadingBit, treeContextOverflow = workInProgress2;
      }
      function pushMaterializedTreeId(workInProgress2) {
        null !== workInProgress2.return && (pushTreeFork(workInProgress2, 1), pushTreeId(workInProgress2, 1, 0));
      }
      function popTreeContext(workInProgress2) {
        for (; workInProgress2 === treeForkProvider; )
          treeForkProvider = forkStack[--forkStackIndex], forkStack[forkStackIndex] = null, treeForkCount = forkStack[--forkStackIndex], forkStack[forkStackIndex] = null;
        for (; workInProgress2 === treeContextProvider; )
          treeContextProvider = idStack[--idStackIndex], idStack[idStackIndex] = null, treeContextOverflow = idStack[--idStackIndex], idStack[idStackIndex] = null, treeContextId = idStack[--idStackIndex], idStack[idStackIndex] = null;
      }
      function restoreSuspendedTreeContext(workInProgress2, suspendedContext) {
        idStack[idStackIndex++] = treeContextId;
        idStack[idStackIndex++] = treeContextOverflow;
        idStack[idStackIndex++] = treeContextProvider;
        treeContextId = suspendedContext.id;
        treeContextOverflow = suspendedContext.overflow;
        treeContextProvider = workInProgress2;
      }
      var hydrationParentFiber = null;
      var nextHydratableInstance = null;
      var isHydrating = false;
      var hydrationErrors = null;
      var rootOrSingletonContext = false;
      var HydrationMismatchException = Error(formatProdErrorMessage(519));
      function throwOnHydrationMismatch(fiber) {
        var error = Error(
          formatProdErrorMessage(
            418,
            1 < arguments.length && void 0 !== arguments[1] && arguments[1] ? "text" : "HTML",
            ""
          )
        );
        queueHydrationError(createCapturedValueAtFiber(error, fiber));
        throw HydrationMismatchException;
      }
      function prepareToHydrateHostInstance(fiber) {
        var instance = fiber.stateNode, type = fiber.type, props = fiber.memoizedProps;
        instance[internalInstanceKey] = fiber;
        instance[internalPropsKey] = props;
        switch (type) {
          case "dialog":
            listenToNonDelegatedEvent("cancel", instance);
            listenToNonDelegatedEvent("close", instance);
            break;
          case "iframe":
          case "object":
          case "embed":
            listenToNonDelegatedEvent("load", instance);
            break;
          case "video":
          case "audio":
            for (type = 0; type < mediaEventTypes.length; type++)
              listenToNonDelegatedEvent(mediaEventTypes[type], instance);
            break;
          case "source":
            listenToNonDelegatedEvent("error", instance);
            break;
          case "img":
          case "image":
          case "link":
            listenToNonDelegatedEvent("error", instance);
            listenToNonDelegatedEvent("load", instance);
            break;
          case "details":
            listenToNonDelegatedEvent("toggle", instance);
            break;
          case "input":
            listenToNonDelegatedEvent("invalid", instance);
            initInput(
              instance,
              props.value,
              props.defaultValue,
              props.checked,
              props.defaultChecked,
              props.type,
              props.name,
              true
            );
            break;
          case "select":
            listenToNonDelegatedEvent("invalid", instance);
            break;
          case "textarea":
            listenToNonDelegatedEvent("invalid", instance), initTextarea(instance, props.value, props.defaultValue, props.children);
        }
        type = props.children;
        "string" !== typeof type && "number" !== typeof type && "bigint" !== typeof type || instance.textContent === "" + type || true === props.suppressHydrationWarning || checkForUnmatchedText(instance.textContent, type) ? (null != props.popover && (listenToNonDelegatedEvent("beforetoggle", instance), listenToNonDelegatedEvent("toggle", instance)), null != props.onScroll && listenToNonDelegatedEvent("scroll", instance), null != props.onScrollEnd && listenToNonDelegatedEvent("scrollend", instance), null != props.onClick && (instance.onclick = noop$1), instance = true) : instance = false;
        instance || throwOnHydrationMismatch(fiber, true);
      }
      function popToNextHostParent(fiber) {
        for (hydrationParentFiber = fiber.return; hydrationParentFiber; )
          switch (hydrationParentFiber.tag) {
            case 5:
            case 31:
            case 13:
              rootOrSingletonContext = false;
              return;
            case 27:
            case 3:
              rootOrSingletonContext = true;
              return;
            default:
              hydrationParentFiber = hydrationParentFiber.return;
          }
      }
      function popHydrationState(fiber) {
        if (fiber !== hydrationParentFiber) return false;
        if (!isHydrating) return popToNextHostParent(fiber), isHydrating = true, false;
        var tag = fiber.tag, JSCompiler_temp;
        if (JSCompiler_temp = 3 !== tag && 27 !== tag) {
          if (JSCompiler_temp = 5 === tag)
            JSCompiler_temp = fiber.type, JSCompiler_temp = !("form" !== JSCompiler_temp && "button" !== JSCompiler_temp) || shouldSetTextContent(fiber.type, fiber.memoizedProps);
          JSCompiler_temp = !JSCompiler_temp;
        }
        JSCompiler_temp && nextHydratableInstance && throwOnHydrationMismatch(fiber);
        popToNextHostParent(fiber);
        if (13 === tag) {
          fiber = fiber.memoizedState;
          fiber = null !== fiber ? fiber.dehydrated : null;
          if (!fiber) throw Error(formatProdErrorMessage(317));
          nextHydratableInstance = getNextHydratableInstanceAfterHydrationBoundary(fiber);
        } else if (31 === tag) {
          fiber = fiber.memoizedState;
          fiber = null !== fiber ? fiber.dehydrated : null;
          if (!fiber) throw Error(formatProdErrorMessage(317));
          nextHydratableInstance = getNextHydratableInstanceAfterHydrationBoundary(fiber);
        } else
          27 === tag ? (tag = nextHydratableInstance, isSingletonScope(fiber.type) ? (fiber = previousHydratableOnEnteringScopedSingleton, previousHydratableOnEnteringScopedSingleton = null, nextHydratableInstance = fiber) : nextHydratableInstance = tag) : nextHydratableInstance = hydrationParentFiber ? getNextHydratable(fiber.stateNode.nextSibling) : null;
        return true;
      }
      function resetHydrationState() {
        nextHydratableInstance = hydrationParentFiber = null;
        isHydrating = false;
      }
      function upgradeHydrationErrorsToRecoverable() {
        var queuedErrors = hydrationErrors;
        null !== queuedErrors && (null === workInProgressRootRecoverableErrors ? workInProgressRootRecoverableErrors = queuedErrors : workInProgressRootRecoverableErrors.push.apply(
          workInProgressRootRecoverableErrors,
          queuedErrors
        ), hydrationErrors = null);
        return queuedErrors;
      }
      function queueHydrationError(error) {
        null === hydrationErrors ? hydrationErrors = [error] : hydrationErrors.push(error);
      }
      var valueCursor = createCursor(null);
      var currentlyRenderingFiber$1 = null;
      var lastContextDependency = null;
      function pushProvider(providerFiber, context, nextValue) {
        push(valueCursor, context._currentValue);
        context._currentValue = nextValue;
      }
      function popProvider(context) {
        context._currentValue = valueCursor.current;
        pop(valueCursor);
      }
      function scheduleContextWorkOnParentPath(parent, renderLanes2, propagationRoot) {
        for (; null !== parent; ) {
          var alternate = parent.alternate;
          (parent.childLanes & renderLanes2) !== renderLanes2 ? (parent.childLanes |= renderLanes2, null !== alternate && (alternate.childLanes |= renderLanes2)) : null !== alternate && (alternate.childLanes & renderLanes2) !== renderLanes2 && (alternate.childLanes |= renderLanes2);
          if (parent === propagationRoot) break;
          parent = parent.return;
        }
      }
      function propagateContextChanges(workInProgress2, contexts, renderLanes2, forcePropagateEntireTree) {
        var fiber = workInProgress2.child;
        null !== fiber && (fiber.return = workInProgress2);
        for (; null !== fiber; ) {
          var list = fiber.dependencies;
          if (null !== list) {
            var nextFiber = fiber.child;
            list = list.firstContext;
            a: for (; null !== list; ) {
              var dependency = list;
              list = fiber;
              for (var i = 0; i < contexts.length; i++)
                if (dependency.context === contexts[i]) {
                  list.lanes |= renderLanes2;
                  dependency = list.alternate;
                  null !== dependency && (dependency.lanes |= renderLanes2);
                  scheduleContextWorkOnParentPath(
                    list.return,
                    renderLanes2,
                    workInProgress2
                  );
                  forcePropagateEntireTree || (nextFiber = null);
                  break a;
                }
              list = dependency.next;
            }
          } else if (18 === fiber.tag) {
            nextFiber = fiber.return;
            if (null === nextFiber) throw Error(formatProdErrorMessage(341));
            nextFiber.lanes |= renderLanes2;
            list = nextFiber.alternate;
            null !== list && (list.lanes |= renderLanes2);
            scheduleContextWorkOnParentPath(nextFiber, renderLanes2, workInProgress2);
            nextFiber = null;
          } else nextFiber = fiber.child;
          if (null !== nextFiber) nextFiber.return = fiber;
          else
            for (nextFiber = fiber; null !== nextFiber; ) {
              if (nextFiber === workInProgress2) {
                nextFiber = null;
                break;
              }
              fiber = nextFiber.sibling;
              if (null !== fiber) {
                fiber.return = nextFiber.return;
                nextFiber = fiber;
                break;
              }
              nextFiber = nextFiber.return;
            }
          fiber = nextFiber;
        }
      }
      function propagateParentContextChanges(current, workInProgress2, renderLanes2, forcePropagateEntireTree) {
        current = null;
        for (var parent = workInProgress2, isInsidePropagationBailout = false; null !== parent; ) {
          if (!isInsidePropagationBailout) {
            if (0 !== (parent.flags & 524288)) isInsidePropagationBailout = true;
            else if (0 !== (parent.flags & 262144)) break;
          }
          if (10 === parent.tag) {
            var currentParent = parent.alternate;
            if (null === currentParent) throw Error(formatProdErrorMessage(387));
            currentParent = currentParent.memoizedProps;
            if (null !== currentParent) {
              var context = parent.type;
              objectIs(parent.pendingProps.value, currentParent.value) || (null !== current ? current.push(context) : current = [context]);
            }
          } else if (parent === hostTransitionProviderCursor.current) {
            currentParent = parent.alternate;
            if (null === currentParent) throw Error(formatProdErrorMessage(387));
            currentParent.memoizedState.memoizedState !== parent.memoizedState.memoizedState && (null !== current ? current.push(HostTransitionContext) : current = [HostTransitionContext]);
          }
          parent = parent.return;
        }
        null !== current && propagateContextChanges(
          workInProgress2,
          current,
          renderLanes2,
          forcePropagateEntireTree
        );
        workInProgress2.flags |= 262144;
      }
      function checkIfContextChanged(currentDependencies) {
        for (currentDependencies = currentDependencies.firstContext; null !== currentDependencies; ) {
          if (!objectIs(
            currentDependencies.context._currentValue,
            currentDependencies.memoizedValue
          ))
            return true;
          currentDependencies = currentDependencies.next;
        }
        return false;
      }
      function prepareToReadContext(workInProgress2) {
        currentlyRenderingFiber$1 = workInProgress2;
        lastContextDependency = null;
        workInProgress2 = workInProgress2.dependencies;
        null !== workInProgress2 && (workInProgress2.firstContext = null);
      }
      function readContext(context) {
        return readContextForConsumer(currentlyRenderingFiber$1, context);
      }
      function readContextDuringReconciliation(consumer, context) {
        null === currentlyRenderingFiber$1 && prepareToReadContext(consumer);
        return readContextForConsumer(consumer, context);
      }
      function readContextForConsumer(consumer, context) {
        var value = context._currentValue;
        context = { context, memoizedValue: value, next: null };
        if (null === lastContextDependency) {
          if (null === consumer) throw Error(formatProdErrorMessage(308));
          lastContextDependency = context;
          consumer.dependencies = { lanes: 0, firstContext: context };
          consumer.flags |= 524288;
        } else lastContextDependency = lastContextDependency.next = context;
        return value;
      }
      var AbortControllerLocal = "undefined" !== typeof AbortController ? AbortController : function() {
        var listeners = [], signal = this.signal = {
          aborted: false,
          addEventListener: function(type, listener) {
            listeners.push(listener);
          }
        };
        this.abort = function() {
          signal.aborted = true;
          listeners.forEach(function(listener) {
            return listener();
          });
        };
      };
      var scheduleCallback$2 = Scheduler.unstable_scheduleCallback;
      var NormalPriority = Scheduler.unstable_NormalPriority;
      var CacheContext = {
        $$typeof: REACT_CONTEXT_TYPE,
        Consumer: null,
        Provider: null,
        _currentValue: null,
        _currentValue2: null,
        _threadCount: 0
      };
      function createCache() {
        return {
          controller: new AbortControllerLocal(),
          data: /* @__PURE__ */ new Map(),
          refCount: 0
        };
      }
      function releaseCache(cache) {
        cache.refCount--;
        0 === cache.refCount && scheduleCallback$2(NormalPriority, function() {
          cache.controller.abort();
        });
      }
      var currentEntangledListeners = null;
      var currentEntangledPendingCount = 0;
      var currentEntangledLane = 0;
      var currentEntangledActionThenable = null;
      function entangleAsyncAction(transition, thenable) {
        if (null === currentEntangledListeners) {
          var entangledListeners = currentEntangledListeners = [];
          currentEntangledPendingCount = 0;
          currentEntangledLane = requestTransitionLane();
          currentEntangledActionThenable = {
            status: "pending",
            value: void 0,
            then: function(resolve) {
              entangledListeners.push(resolve);
            }
          };
        }
        currentEntangledPendingCount++;
        thenable.then(pingEngtangledActionScope, pingEngtangledActionScope);
        return thenable;
      }
      function pingEngtangledActionScope() {
        if (0 === --currentEntangledPendingCount && null !== currentEntangledListeners) {
          null !== currentEntangledActionThenable && (currentEntangledActionThenable.status = "fulfilled");
          var listeners = currentEntangledListeners;
          currentEntangledListeners = null;
          currentEntangledLane = 0;
          currentEntangledActionThenable = null;
          for (var i = 0; i < listeners.length; i++) (0, listeners[i])();
        }
      }
      function chainThenableValue(thenable, result) {
        var listeners = [], thenableWithOverride = {
          status: "pending",
          value: null,
          reason: null,
          then: function(resolve) {
            listeners.push(resolve);
          }
        };
        thenable.then(
          function() {
            thenableWithOverride.status = "fulfilled";
            thenableWithOverride.value = result;
            for (var i = 0; i < listeners.length; i++) (0, listeners[i])(result);
          },
          function(error) {
            thenableWithOverride.status = "rejected";
            thenableWithOverride.reason = error;
            for (error = 0; error < listeners.length; error++)
              (0, listeners[error])(void 0);
          }
        );
        return thenableWithOverride;
      }
      var prevOnStartTransitionFinish = ReactSharedInternals.S;
      ReactSharedInternals.S = function(transition, returnValue) {
        globalMostRecentTransitionTime = now();
        "object" === typeof returnValue && null !== returnValue && "function" === typeof returnValue.then && entangleAsyncAction(transition, returnValue);
        null !== prevOnStartTransitionFinish && prevOnStartTransitionFinish(transition, returnValue);
      };
      var resumedCache = createCursor(null);
      function peekCacheFromPool() {
        var cacheResumedFromPreviousRender = resumedCache.current;
        return null !== cacheResumedFromPreviousRender ? cacheResumedFromPreviousRender : workInProgressRoot.pooledCache;
      }
      function pushTransition(offscreenWorkInProgress, prevCachePool) {
        null === prevCachePool ? push(resumedCache, resumedCache.current) : push(resumedCache, prevCachePool.pool);
      }
      function getSuspendedCache() {
        var cacheFromPool = peekCacheFromPool();
        return null === cacheFromPool ? null : { parent: CacheContext._currentValue, pool: cacheFromPool };
      }
      var SuspenseException = Error(formatProdErrorMessage(460));
      var SuspenseyCommitException = Error(formatProdErrorMessage(474));
      var SuspenseActionException = Error(formatProdErrorMessage(542));
      var noopSuspenseyCommitThenable = { then: function() {
      } };
      function isThenableResolved(thenable) {
        thenable = thenable.status;
        return "fulfilled" === thenable || "rejected" === thenable;
      }
      function trackUsedThenable(thenableState2, thenable, index2) {
        index2 = thenableState2[index2];
        void 0 === index2 ? thenableState2.push(thenable) : index2 !== thenable && (thenable.then(noop$1, noop$1), thenable = index2);
        switch (thenable.status) {
          case "fulfilled":
            return thenable.value;
          case "rejected":
            throw thenableState2 = thenable.reason, checkIfUseWrappedInAsyncCatch(thenableState2), thenableState2;
          default:
            if ("string" === typeof thenable.status) thenable.then(noop$1, noop$1);
            else {
              thenableState2 = workInProgressRoot;
              if (null !== thenableState2 && 100 < thenableState2.shellSuspendCounter)
                throw Error(formatProdErrorMessage(482));
              thenableState2 = thenable;
              thenableState2.status = "pending";
              thenableState2.then(
                function(fulfilledValue) {
                  if ("pending" === thenable.status) {
                    var fulfilledThenable = thenable;
                    fulfilledThenable.status = "fulfilled";
                    fulfilledThenable.value = fulfilledValue;
                  }
                },
                function(error) {
                  if ("pending" === thenable.status) {
                    var rejectedThenable = thenable;
                    rejectedThenable.status = "rejected";
                    rejectedThenable.reason = error;
                  }
                }
              );
            }
            switch (thenable.status) {
              case "fulfilled":
                return thenable.value;
              case "rejected":
                throw thenableState2 = thenable.reason, checkIfUseWrappedInAsyncCatch(thenableState2), thenableState2;
            }
            suspendedThenable = thenable;
            throw SuspenseException;
        }
      }
      function resolveLazy(lazyType) {
        try {
          var init = lazyType._init;
          return init(lazyType._payload);
        } catch (x) {
          if (null !== x && "object" === typeof x && "function" === typeof x.then)
            throw suspendedThenable = x, SuspenseException;
          throw x;
        }
      }
      var suspendedThenable = null;
      function getSuspendedThenable() {
        if (null === suspendedThenable) throw Error(formatProdErrorMessage(459));
        var thenable = suspendedThenable;
        suspendedThenable = null;
        return thenable;
      }
      function checkIfUseWrappedInAsyncCatch(rejectedReason) {
        if (rejectedReason === SuspenseException || rejectedReason === SuspenseActionException)
          throw Error(formatProdErrorMessage(483));
      }
      var thenableState$1 = null;
      var thenableIndexCounter$1 = 0;
      function unwrapThenable(thenable) {
        var index2 = thenableIndexCounter$1;
        thenableIndexCounter$1 += 1;
        null === thenableState$1 && (thenableState$1 = []);
        return trackUsedThenable(thenableState$1, thenable, index2);
      }
      function coerceRef(workInProgress2, element) {
        element = element.props.ref;
        workInProgress2.ref = void 0 !== element ? element : null;
      }
      function throwOnInvalidObjectTypeImpl(returnFiber, newChild) {
        if (newChild.$$typeof === REACT_LEGACY_ELEMENT_TYPE)
          throw Error(formatProdErrorMessage(525));
        returnFiber = Object.prototype.toString.call(newChild);
        throw Error(
          formatProdErrorMessage(
            31,
            "[object Object]" === returnFiber ? "object with keys {" + Object.keys(newChild).join(", ") + "}" : returnFiber
          )
        );
      }
      function createChildReconciler(shouldTrackSideEffects) {
        function deleteChild(returnFiber, childToDelete) {
          if (shouldTrackSideEffects) {
            var deletions = returnFiber.deletions;
            null === deletions ? (returnFiber.deletions = [childToDelete], returnFiber.flags |= 16) : deletions.push(childToDelete);
          }
        }
        function deleteRemainingChildren(returnFiber, currentFirstChild) {
          if (!shouldTrackSideEffects) return null;
          for (; null !== currentFirstChild; )
            deleteChild(returnFiber, currentFirstChild), currentFirstChild = currentFirstChild.sibling;
          return null;
        }
        function mapRemainingChildren(currentFirstChild) {
          for (var existingChildren = /* @__PURE__ */ new Map(); null !== currentFirstChild; )
            null !== currentFirstChild.key ? existingChildren.set(currentFirstChild.key, currentFirstChild) : existingChildren.set(currentFirstChild.index, currentFirstChild), currentFirstChild = currentFirstChild.sibling;
          return existingChildren;
        }
        function useFiber(fiber, pendingProps) {
          fiber = createWorkInProgress(fiber, pendingProps);
          fiber.index = 0;
          fiber.sibling = null;
          return fiber;
        }
        function placeChild(newFiber, lastPlacedIndex, newIndex) {
          newFiber.index = newIndex;
          if (!shouldTrackSideEffects)
            return newFiber.flags |= 1048576, lastPlacedIndex;
          newIndex = newFiber.alternate;
          if (null !== newIndex)
            return newIndex = newIndex.index, newIndex < lastPlacedIndex ? (newFiber.flags |= 67108866, lastPlacedIndex) : newIndex;
          newFiber.flags |= 67108866;
          return lastPlacedIndex;
        }
        function placeSingleChild(newFiber) {
          shouldTrackSideEffects && null === newFiber.alternate && (newFiber.flags |= 67108866);
          return newFiber;
        }
        function updateTextNode(returnFiber, current, textContent, lanes) {
          if (null === current || 6 !== current.tag)
            return current = createFiberFromText(textContent, returnFiber.mode, lanes), current.return = returnFiber, current;
          current = useFiber(current, textContent);
          current.return = returnFiber;
          return current;
        }
        function updateElement(returnFiber, current, element, lanes) {
          var elementType = element.type;
          if (elementType === REACT_FRAGMENT_TYPE)
            return updateFragment(
              returnFiber,
              current,
              element.props.children,
              lanes,
              element.key
            );
          if (null !== current && (current.elementType === elementType || "object" === typeof elementType && null !== elementType && elementType.$$typeof === REACT_LAZY_TYPE && resolveLazy(elementType) === current.type))
            return current = useFiber(current, element.props), coerceRef(current, element), current.return = returnFiber, current;
          current = createFiberFromTypeAndProps(
            element.type,
            element.key,
            element.props,
            null,
            returnFiber.mode,
            lanes
          );
          coerceRef(current, element);
          current.return = returnFiber;
          return current;
        }
        function updatePortal(returnFiber, current, portal, lanes) {
          if (null === current || 4 !== current.tag || current.stateNode.containerInfo !== portal.containerInfo || current.stateNode.implementation !== portal.implementation)
            return current = createFiberFromPortal(portal, returnFiber.mode, lanes), current.return = returnFiber, current;
          current = useFiber(current, portal.children || []);
          current.return = returnFiber;
          return current;
        }
        function updateFragment(returnFiber, current, fragment, lanes, key) {
          if (null === current || 7 !== current.tag)
            return current = createFiberFromFragment(
              fragment,
              returnFiber.mode,
              lanes,
              key
            ), current.return = returnFiber, current;
          current = useFiber(current, fragment);
          current.return = returnFiber;
          return current;
        }
        function createChild(returnFiber, newChild, lanes) {
          if ("string" === typeof newChild && "" !== newChild || "number" === typeof newChild || "bigint" === typeof newChild)
            return newChild = createFiberFromText(
              "" + newChild,
              returnFiber.mode,
              lanes
            ), newChild.return = returnFiber, newChild;
          if ("object" === typeof newChild && null !== newChild) {
            switch (newChild.$$typeof) {
              case REACT_ELEMENT_TYPE:
                return lanes = createFiberFromTypeAndProps(
                  newChild.type,
                  newChild.key,
                  newChild.props,
                  null,
                  returnFiber.mode,
                  lanes
                ), coerceRef(lanes, newChild), lanes.return = returnFiber, lanes;
              case REACT_PORTAL_TYPE:
                return newChild = createFiberFromPortal(
                  newChild,
                  returnFiber.mode,
                  lanes
                ), newChild.return = returnFiber, newChild;
              case REACT_LAZY_TYPE:
                return newChild = resolveLazy(newChild), createChild(returnFiber, newChild, lanes);
            }
            if (isArrayImpl(newChild) || getIteratorFn(newChild))
              return newChild = createFiberFromFragment(
                newChild,
                returnFiber.mode,
                lanes,
                null
              ), newChild.return = returnFiber, newChild;
            if ("function" === typeof newChild.then)
              return createChild(returnFiber, unwrapThenable(newChild), lanes);
            if (newChild.$$typeof === REACT_CONTEXT_TYPE)
              return createChild(
                returnFiber,
                readContextDuringReconciliation(returnFiber, newChild),
                lanes
              );
            throwOnInvalidObjectTypeImpl(returnFiber, newChild);
          }
          return null;
        }
        function updateSlot(returnFiber, oldFiber, newChild, lanes) {
          var key = null !== oldFiber ? oldFiber.key : null;
          if ("string" === typeof newChild && "" !== newChild || "number" === typeof newChild || "bigint" === typeof newChild)
            return null !== key ? null : updateTextNode(returnFiber, oldFiber, "" + newChild, lanes);
          if ("object" === typeof newChild && null !== newChild) {
            switch (newChild.$$typeof) {
              case REACT_ELEMENT_TYPE:
                return newChild.key === key ? updateElement(returnFiber, oldFiber, newChild, lanes) : null;
              case REACT_PORTAL_TYPE:
                return newChild.key === key ? updatePortal(returnFiber, oldFiber, newChild, lanes) : null;
              case REACT_LAZY_TYPE:
                return newChild = resolveLazy(newChild), updateSlot(returnFiber, oldFiber, newChild, lanes);
            }
            if (isArrayImpl(newChild) || getIteratorFn(newChild))
              return null !== key ? null : updateFragment(returnFiber, oldFiber, newChild, lanes, null);
            if ("function" === typeof newChild.then)
              return updateSlot(
                returnFiber,
                oldFiber,
                unwrapThenable(newChild),
                lanes
              );
            if (newChild.$$typeof === REACT_CONTEXT_TYPE)
              return updateSlot(
                returnFiber,
                oldFiber,
                readContextDuringReconciliation(returnFiber, newChild),
                lanes
              );
            throwOnInvalidObjectTypeImpl(returnFiber, newChild);
          }
          return null;
        }
        function updateFromMap(existingChildren, returnFiber, newIdx, newChild, lanes) {
          if ("string" === typeof newChild && "" !== newChild || "number" === typeof newChild || "bigint" === typeof newChild)
            return existingChildren = existingChildren.get(newIdx) || null, updateTextNode(returnFiber, existingChildren, "" + newChild, lanes);
          if ("object" === typeof newChild && null !== newChild) {
            switch (newChild.$$typeof) {
              case REACT_ELEMENT_TYPE:
                return existingChildren = existingChildren.get(
                  null === newChild.key ? newIdx : newChild.key
                ) || null, updateElement(returnFiber, existingChildren, newChild, lanes);
              case REACT_PORTAL_TYPE:
                return existingChildren = existingChildren.get(
                  null === newChild.key ? newIdx : newChild.key
                ) || null, updatePortal(returnFiber, existingChildren, newChild, lanes);
              case REACT_LAZY_TYPE:
                return newChild = resolveLazy(newChild), updateFromMap(
                  existingChildren,
                  returnFiber,
                  newIdx,
                  newChild,
                  lanes
                );
            }
            if (isArrayImpl(newChild) || getIteratorFn(newChild))
              return existingChildren = existingChildren.get(newIdx) || null, updateFragment(returnFiber, existingChildren, newChild, lanes, null);
            if ("function" === typeof newChild.then)
              return updateFromMap(
                existingChildren,
                returnFiber,
                newIdx,
                unwrapThenable(newChild),
                lanes
              );
            if (newChild.$$typeof === REACT_CONTEXT_TYPE)
              return updateFromMap(
                existingChildren,
                returnFiber,
                newIdx,
                readContextDuringReconciliation(returnFiber, newChild),
                lanes
              );
            throwOnInvalidObjectTypeImpl(returnFiber, newChild);
          }
          return null;
        }
        function reconcileChildrenArray(returnFiber, currentFirstChild, newChildren, lanes) {
          for (var resultingFirstChild = null, previousNewFiber = null, oldFiber = currentFirstChild, newIdx = currentFirstChild = 0, nextOldFiber = null; null !== oldFiber && newIdx < newChildren.length; newIdx++) {
            oldFiber.index > newIdx ? (nextOldFiber = oldFiber, oldFiber = null) : nextOldFiber = oldFiber.sibling;
            var newFiber = updateSlot(
              returnFiber,
              oldFiber,
              newChildren[newIdx],
              lanes
            );
            if (null === newFiber) {
              null === oldFiber && (oldFiber = nextOldFiber);
              break;
            }
            shouldTrackSideEffects && oldFiber && null === newFiber.alternate && deleteChild(returnFiber, oldFiber);
            currentFirstChild = placeChild(newFiber, currentFirstChild, newIdx);
            null === previousNewFiber ? resultingFirstChild = newFiber : previousNewFiber.sibling = newFiber;
            previousNewFiber = newFiber;
            oldFiber = nextOldFiber;
          }
          if (newIdx === newChildren.length)
            return deleteRemainingChildren(returnFiber, oldFiber), isHydrating && pushTreeFork(returnFiber, newIdx), resultingFirstChild;
          if (null === oldFiber) {
            for (; newIdx < newChildren.length; newIdx++)
              oldFiber = createChild(returnFiber, newChildren[newIdx], lanes), null !== oldFiber && (currentFirstChild = placeChild(
                oldFiber,
                currentFirstChild,
                newIdx
              ), null === previousNewFiber ? resultingFirstChild = oldFiber : previousNewFiber.sibling = oldFiber, previousNewFiber = oldFiber);
            isHydrating && pushTreeFork(returnFiber, newIdx);
            return resultingFirstChild;
          }
          for (oldFiber = mapRemainingChildren(oldFiber); newIdx < newChildren.length; newIdx++)
            nextOldFiber = updateFromMap(
              oldFiber,
              returnFiber,
              newIdx,
              newChildren[newIdx],
              lanes
            ), null !== nextOldFiber && (shouldTrackSideEffects && null !== nextOldFiber.alternate && oldFiber.delete(
              null === nextOldFiber.key ? newIdx : nextOldFiber.key
            ), currentFirstChild = placeChild(
              nextOldFiber,
              currentFirstChild,
              newIdx
            ), null === previousNewFiber ? resultingFirstChild = nextOldFiber : previousNewFiber.sibling = nextOldFiber, previousNewFiber = nextOldFiber);
          shouldTrackSideEffects && oldFiber.forEach(function(child) {
            return deleteChild(returnFiber, child);
          });
          isHydrating && pushTreeFork(returnFiber, newIdx);
          return resultingFirstChild;
        }
        function reconcileChildrenIterator(returnFiber, currentFirstChild, newChildren, lanes) {
          if (null == newChildren) throw Error(formatProdErrorMessage(151));
          for (var resultingFirstChild = null, previousNewFiber = null, oldFiber = currentFirstChild, newIdx = currentFirstChild = 0, nextOldFiber = null, step = newChildren.next(); null !== oldFiber && !step.done; newIdx++, step = newChildren.next()) {
            oldFiber.index > newIdx ? (nextOldFiber = oldFiber, oldFiber = null) : nextOldFiber = oldFiber.sibling;
            var newFiber = updateSlot(returnFiber, oldFiber, step.value, lanes);
            if (null === newFiber) {
              null === oldFiber && (oldFiber = nextOldFiber);
              break;
            }
            shouldTrackSideEffects && oldFiber && null === newFiber.alternate && deleteChild(returnFiber, oldFiber);
            currentFirstChild = placeChild(newFiber, currentFirstChild, newIdx);
            null === previousNewFiber ? resultingFirstChild = newFiber : previousNewFiber.sibling = newFiber;
            previousNewFiber = newFiber;
            oldFiber = nextOldFiber;
          }
          if (step.done)
            return deleteRemainingChildren(returnFiber, oldFiber), isHydrating && pushTreeFork(returnFiber, newIdx), resultingFirstChild;
          if (null === oldFiber) {
            for (; !step.done; newIdx++, step = newChildren.next())
              step = createChild(returnFiber, step.value, lanes), null !== step && (currentFirstChild = placeChild(step, currentFirstChild, newIdx), null === previousNewFiber ? resultingFirstChild = step : previousNewFiber.sibling = step, previousNewFiber = step);
            isHydrating && pushTreeFork(returnFiber, newIdx);
            return resultingFirstChild;
          }
          for (oldFiber = mapRemainingChildren(oldFiber); !step.done; newIdx++, step = newChildren.next())
            step = updateFromMap(oldFiber, returnFiber, newIdx, step.value, lanes), null !== step && (shouldTrackSideEffects && null !== step.alternate && oldFiber.delete(null === step.key ? newIdx : step.key), currentFirstChild = placeChild(step, currentFirstChild, newIdx), null === previousNewFiber ? resultingFirstChild = step : previousNewFiber.sibling = step, previousNewFiber = step);
          shouldTrackSideEffects && oldFiber.forEach(function(child) {
            return deleteChild(returnFiber, child);
          });
          isHydrating && pushTreeFork(returnFiber, newIdx);
          return resultingFirstChild;
        }
        function reconcileChildFibersImpl(returnFiber, currentFirstChild, newChild, lanes) {
          "object" === typeof newChild && null !== newChild && newChild.type === REACT_FRAGMENT_TYPE && null === newChild.key && (newChild = newChild.props.children);
          if ("object" === typeof newChild && null !== newChild) {
            switch (newChild.$$typeof) {
              case REACT_ELEMENT_TYPE:
                a: {
                  for (var key = newChild.key; null !== currentFirstChild; ) {
                    if (currentFirstChild.key === key) {
                      key = newChild.type;
                      if (key === REACT_FRAGMENT_TYPE) {
                        if (7 === currentFirstChild.tag) {
                          deleteRemainingChildren(
                            returnFiber,
                            currentFirstChild.sibling
                          );
                          lanes = useFiber(
                            currentFirstChild,
                            newChild.props.children
                          );
                          lanes.return = returnFiber;
                          returnFiber = lanes;
                          break a;
                        }
                      } else if (currentFirstChild.elementType === key || "object" === typeof key && null !== key && key.$$typeof === REACT_LAZY_TYPE && resolveLazy(key) === currentFirstChild.type) {
                        deleteRemainingChildren(
                          returnFiber,
                          currentFirstChild.sibling
                        );
                        lanes = useFiber(currentFirstChild, newChild.props);
                        coerceRef(lanes, newChild);
                        lanes.return = returnFiber;
                        returnFiber = lanes;
                        break a;
                      }
                      deleteRemainingChildren(returnFiber, currentFirstChild);
                      break;
                    } else deleteChild(returnFiber, currentFirstChild);
                    currentFirstChild = currentFirstChild.sibling;
                  }
                  newChild.type === REACT_FRAGMENT_TYPE ? (lanes = createFiberFromFragment(
                    newChild.props.children,
                    returnFiber.mode,
                    lanes,
                    newChild.key
                  ), lanes.return = returnFiber, returnFiber = lanes) : (lanes = createFiberFromTypeAndProps(
                    newChild.type,
                    newChild.key,
                    newChild.props,
                    null,
                    returnFiber.mode,
                    lanes
                  ), coerceRef(lanes, newChild), lanes.return = returnFiber, returnFiber = lanes);
                }
                return placeSingleChild(returnFiber);
              case REACT_PORTAL_TYPE:
                a: {
                  for (key = newChild.key; null !== currentFirstChild; ) {
                    if (currentFirstChild.key === key)
                      if (4 === currentFirstChild.tag && currentFirstChild.stateNode.containerInfo === newChild.containerInfo && currentFirstChild.stateNode.implementation === newChild.implementation) {
                        deleteRemainingChildren(
                          returnFiber,
                          currentFirstChild.sibling
                        );
                        lanes = useFiber(currentFirstChild, newChild.children || []);
                        lanes.return = returnFiber;
                        returnFiber = lanes;
                        break a;
                      } else {
                        deleteRemainingChildren(returnFiber, currentFirstChild);
                        break;
                      }
                    else deleteChild(returnFiber, currentFirstChild);
                    currentFirstChild = currentFirstChild.sibling;
                  }
                  lanes = createFiberFromPortal(newChild, returnFiber.mode, lanes);
                  lanes.return = returnFiber;
                  returnFiber = lanes;
                }
                return placeSingleChild(returnFiber);
              case REACT_LAZY_TYPE:
                return newChild = resolveLazy(newChild), reconcileChildFibersImpl(
                  returnFiber,
                  currentFirstChild,
                  newChild,
                  lanes
                );
            }
            if (isArrayImpl(newChild))
              return reconcileChildrenArray(
                returnFiber,
                currentFirstChild,
                newChild,
                lanes
              );
            if (getIteratorFn(newChild)) {
              key = getIteratorFn(newChild);
              if ("function" !== typeof key) throw Error(formatProdErrorMessage(150));
              newChild = key.call(newChild);
              return reconcileChildrenIterator(
                returnFiber,
                currentFirstChild,
                newChild,
                lanes
              );
            }
            if ("function" === typeof newChild.then)
              return reconcileChildFibersImpl(
                returnFiber,
                currentFirstChild,
                unwrapThenable(newChild),
                lanes
              );
            if (newChild.$$typeof === REACT_CONTEXT_TYPE)
              return reconcileChildFibersImpl(
                returnFiber,
                currentFirstChild,
                readContextDuringReconciliation(returnFiber, newChild),
                lanes
              );
            throwOnInvalidObjectTypeImpl(returnFiber, newChild);
          }
          return "string" === typeof newChild && "" !== newChild || "number" === typeof newChild || "bigint" === typeof newChild ? (newChild = "" + newChild, null !== currentFirstChild && 6 === currentFirstChild.tag ? (deleteRemainingChildren(returnFiber, currentFirstChild.sibling), lanes = useFiber(currentFirstChild, newChild), lanes.return = returnFiber, returnFiber = lanes) : (deleteRemainingChildren(returnFiber, currentFirstChild), lanes = createFiberFromText(newChild, returnFiber.mode, lanes), lanes.return = returnFiber, returnFiber = lanes), placeSingleChild(returnFiber)) : deleteRemainingChildren(returnFiber, currentFirstChild);
        }
        return function(returnFiber, currentFirstChild, newChild, lanes) {
          try {
            thenableIndexCounter$1 = 0;
            var firstChildFiber = reconcileChildFibersImpl(
              returnFiber,
              currentFirstChild,
              newChild,
              lanes
            );
            thenableState$1 = null;
            return firstChildFiber;
          } catch (x) {
            if (x === SuspenseException || x === SuspenseActionException) throw x;
            var fiber = createFiberImplClass(29, x, null, returnFiber.mode);
            fiber.lanes = lanes;
            fiber.return = returnFiber;
            return fiber;
          } finally {
          }
        };
      }
      var reconcileChildFibers = createChildReconciler(true);
      var mountChildFibers = createChildReconciler(false);
      var hasForceUpdate = false;
      function initializeUpdateQueue(fiber) {
        fiber.updateQueue = {
          baseState: fiber.memoizedState,
          firstBaseUpdate: null,
          lastBaseUpdate: null,
          shared: { pending: null, lanes: 0, hiddenCallbacks: null },
          callbacks: null
        };
      }
      function cloneUpdateQueue(current, workInProgress2) {
        current = current.updateQueue;
        workInProgress2.updateQueue === current && (workInProgress2.updateQueue = {
          baseState: current.baseState,
          firstBaseUpdate: current.firstBaseUpdate,
          lastBaseUpdate: current.lastBaseUpdate,
          shared: current.shared,
          callbacks: null
        });
      }
      function createUpdate(lane) {
        return { lane, tag: 0, payload: null, callback: null, next: null };
      }
      function enqueueUpdate(fiber, update, lane) {
        var updateQueue = fiber.updateQueue;
        if (null === updateQueue) return null;
        updateQueue = updateQueue.shared;
        if (0 !== (executionContext & 2)) {
          var pending = updateQueue.pending;
          null === pending ? update.next = update : (update.next = pending.next, pending.next = update);
          updateQueue.pending = update;
          update = getRootForUpdatedFiber(fiber);
          markUpdateLaneFromFiberToRoot(fiber, null, lane);
          return update;
        }
        enqueueUpdate$1(fiber, updateQueue, update, lane);
        return getRootForUpdatedFiber(fiber);
      }
      function entangleTransitions(root2, fiber, lane) {
        fiber = fiber.updateQueue;
        if (null !== fiber && (fiber = fiber.shared, 0 !== (lane & 4194048))) {
          var queueLanes = fiber.lanes;
          queueLanes &= root2.pendingLanes;
          lane |= queueLanes;
          fiber.lanes = lane;
          markRootEntangled(root2, lane);
        }
      }
      function enqueueCapturedUpdate(workInProgress2, capturedUpdate) {
        var queue = workInProgress2.updateQueue, current = workInProgress2.alternate;
        if (null !== current && (current = current.updateQueue, queue === current)) {
          var newFirst = null, newLast = null;
          queue = queue.firstBaseUpdate;
          if (null !== queue) {
            do {
              var clone2 = {
                lane: queue.lane,
                tag: queue.tag,
                payload: queue.payload,
                callback: null,
                next: null
              };
              null === newLast ? newFirst = newLast = clone2 : newLast = newLast.next = clone2;
              queue = queue.next;
            } while (null !== queue);
            null === newLast ? newFirst = newLast = capturedUpdate : newLast = newLast.next = capturedUpdate;
          } else newFirst = newLast = capturedUpdate;
          queue = {
            baseState: current.baseState,
            firstBaseUpdate: newFirst,
            lastBaseUpdate: newLast,
            shared: current.shared,
            callbacks: current.callbacks
          };
          workInProgress2.updateQueue = queue;
          return;
        }
        workInProgress2 = queue.lastBaseUpdate;
        null === workInProgress2 ? queue.firstBaseUpdate = capturedUpdate : workInProgress2.next = capturedUpdate;
        queue.lastBaseUpdate = capturedUpdate;
      }
      var didReadFromEntangledAsyncAction = false;
      function suspendIfUpdateReadFromEntangledAsyncAction() {
        if (didReadFromEntangledAsyncAction) {
          var entangledActionThenable = currentEntangledActionThenable;
          if (null !== entangledActionThenable) throw entangledActionThenable;
        }
      }
      function processUpdateQueue(workInProgress$jscomp$0, props, instance$jscomp$0, renderLanes2) {
        didReadFromEntangledAsyncAction = false;
        var queue = workInProgress$jscomp$0.updateQueue;
        hasForceUpdate = false;
        var firstBaseUpdate = queue.firstBaseUpdate, lastBaseUpdate = queue.lastBaseUpdate, pendingQueue = queue.shared.pending;
        if (null !== pendingQueue) {
          queue.shared.pending = null;
          var lastPendingUpdate = pendingQueue, firstPendingUpdate = lastPendingUpdate.next;
          lastPendingUpdate.next = null;
          null === lastBaseUpdate ? firstBaseUpdate = firstPendingUpdate : lastBaseUpdate.next = firstPendingUpdate;
          lastBaseUpdate = lastPendingUpdate;
          var current = workInProgress$jscomp$0.alternate;
          null !== current && (current = current.updateQueue, pendingQueue = current.lastBaseUpdate, pendingQueue !== lastBaseUpdate && (null === pendingQueue ? current.firstBaseUpdate = firstPendingUpdate : pendingQueue.next = firstPendingUpdate, current.lastBaseUpdate = lastPendingUpdate));
        }
        if (null !== firstBaseUpdate) {
          var newState = queue.baseState;
          lastBaseUpdate = 0;
          current = firstPendingUpdate = lastPendingUpdate = null;
          pendingQueue = firstBaseUpdate;
          do {
            var updateLane = pendingQueue.lane & -536870913, isHiddenUpdate = updateLane !== pendingQueue.lane;
            if (isHiddenUpdate ? (workInProgressRootRenderLanes & updateLane) === updateLane : (renderLanes2 & updateLane) === updateLane) {
              0 !== updateLane && updateLane === currentEntangledLane && (didReadFromEntangledAsyncAction = true);
              null !== current && (current = current.next = {
                lane: 0,
                tag: pendingQueue.tag,
                payload: pendingQueue.payload,
                callback: null,
                next: null
              });
              a: {
                var workInProgress2 = workInProgress$jscomp$0, update = pendingQueue;
                updateLane = props;
                var instance = instance$jscomp$0;
                switch (update.tag) {
                  case 1:
                    workInProgress2 = update.payload;
                    if ("function" === typeof workInProgress2) {
                      newState = workInProgress2.call(instance, newState, updateLane);
                      break a;
                    }
                    newState = workInProgress2;
                    break a;
                  case 3:
                    workInProgress2.flags = workInProgress2.flags & -65537 | 128;
                  case 0:
                    workInProgress2 = update.payload;
                    updateLane = "function" === typeof workInProgress2 ? workInProgress2.call(instance, newState, updateLane) : workInProgress2;
                    if (null === updateLane || void 0 === updateLane) break a;
                    newState = assign({}, newState, updateLane);
                    break a;
                  case 2:
                    hasForceUpdate = true;
                }
              }
              updateLane = pendingQueue.callback;
              null !== updateLane && (workInProgress$jscomp$0.flags |= 64, isHiddenUpdate && (workInProgress$jscomp$0.flags |= 8192), isHiddenUpdate = queue.callbacks, null === isHiddenUpdate ? queue.callbacks = [updateLane] : isHiddenUpdate.push(updateLane));
            } else
              isHiddenUpdate = {
                lane: updateLane,
                tag: pendingQueue.tag,
                payload: pendingQueue.payload,
                callback: pendingQueue.callback,
                next: null
              }, null === current ? (firstPendingUpdate = current = isHiddenUpdate, lastPendingUpdate = newState) : current = current.next = isHiddenUpdate, lastBaseUpdate |= updateLane;
            pendingQueue = pendingQueue.next;
            if (null === pendingQueue)
              if (pendingQueue = queue.shared.pending, null === pendingQueue)
                break;
              else
                isHiddenUpdate = pendingQueue, pendingQueue = isHiddenUpdate.next, isHiddenUpdate.next = null, queue.lastBaseUpdate = isHiddenUpdate, queue.shared.pending = null;
          } while (1);
          null === current && (lastPendingUpdate = newState);
          queue.baseState = lastPendingUpdate;
          queue.firstBaseUpdate = firstPendingUpdate;
          queue.lastBaseUpdate = current;
          null === firstBaseUpdate && (queue.shared.lanes = 0);
          workInProgressRootSkippedLanes |= lastBaseUpdate;
          workInProgress$jscomp$0.lanes = lastBaseUpdate;
          workInProgress$jscomp$0.memoizedState = newState;
        }
      }
      function callCallback(callback, context) {
        if ("function" !== typeof callback)
          throw Error(formatProdErrorMessage(191, callback));
        callback.call(context);
      }
      function commitCallbacks(updateQueue, context) {
        var callbacks = updateQueue.callbacks;
        if (null !== callbacks)
          for (updateQueue.callbacks = null, updateQueue = 0; updateQueue < callbacks.length; updateQueue++)
            callCallback(callbacks[updateQueue], context);
      }
      var currentTreeHiddenStackCursor = createCursor(null);
      var prevEntangledRenderLanesCursor = createCursor(0);
      function pushHiddenContext(fiber, context) {
        fiber = entangledRenderLanes;
        push(prevEntangledRenderLanesCursor, fiber);
        push(currentTreeHiddenStackCursor, context);
        entangledRenderLanes = fiber | context.baseLanes;
      }
      function reuseHiddenContextOnStack() {
        push(prevEntangledRenderLanesCursor, entangledRenderLanes);
        push(currentTreeHiddenStackCursor, currentTreeHiddenStackCursor.current);
      }
      function popHiddenContext() {
        entangledRenderLanes = prevEntangledRenderLanesCursor.current;
        pop(currentTreeHiddenStackCursor);
        pop(prevEntangledRenderLanesCursor);
      }
      var suspenseHandlerStackCursor = createCursor(null);
      var shellBoundary = null;
      function pushPrimaryTreeSuspenseHandler(handler) {
        var current = handler.alternate;
        push(suspenseStackCursor, suspenseStackCursor.current & 1);
        push(suspenseHandlerStackCursor, handler);
        null === shellBoundary && (null === current || null !== currentTreeHiddenStackCursor.current ? shellBoundary = handler : null !== current.memoizedState && (shellBoundary = handler));
      }
      function pushDehydratedActivitySuspenseHandler(fiber) {
        push(suspenseStackCursor, suspenseStackCursor.current);
        push(suspenseHandlerStackCursor, fiber);
        null === shellBoundary && (shellBoundary = fiber);
      }
      function pushOffscreenSuspenseHandler(fiber) {
        22 === fiber.tag ? (push(suspenseStackCursor, suspenseStackCursor.current), push(suspenseHandlerStackCursor, fiber), null === shellBoundary && (shellBoundary = fiber)) : reuseSuspenseHandlerOnStack(fiber);
      }
      function reuseSuspenseHandlerOnStack() {
        push(suspenseStackCursor, suspenseStackCursor.current);
        push(suspenseHandlerStackCursor, suspenseHandlerStackCursor.current);
      }
      function popSuspenseHandler(fiber) {
        pop(suspenseHandlerStackCursor);
        shellBoundary === fiber && (shellBoundary = null);
        pop(suspenseStackCursor);
      }
      var suspenseStackCursor = createCursor(0);
      function findFirstSuspended(row) {
        for (var node = row; null !== node; ) {
          if (13 === node.tag) {
            var state = node.memoizedState;
            if (null !== state && (state = state.dehydrated, null === state || isSuspenseInstancePending(state) || isSuspenseInstanceFallback(state)))
              return node;
          } else if (19 === node.tag && ("forwards" === node.memoizedProps.revealOrder || "backwards" === node.memoizedProps.revealOrder || "unstable_legacy-backwards" === node.memoizedProps.revealOrder || "together" === node.memoizedProps.revealOrder)) {
            if (0 !== (node.flags & 128)) return node;
          } else if (null !== node.child) {
            node.child.return = node;
            node = node.child;
            continue;
          }
          if (node === row) break;
          for (; null === node.sibling; ) {
            if (null === node.return || node.return === row) return null;
            node = node.return;
          }
          node.sibling.return = node.return;
          node = node.sibling;
        }
        return null;
      }
      var renderLanes = 0;
      var currentlyRenderingFiber = null;
      var currentHook = null;
      var workInProgressHook = null;
      var didScheduleRenderPhaseUpdate = false;
      var didScheduleRenderPhaseUpdateDuringThisPass = false;
      var shouldDoubleInvokeUserFnsInHooksDEV = false;
      var localIdCounter = 0;
      var thenableIndexCounter = 0;
      var thenableState = null;
      var globalClientIdCounter = 0;
      function throwInvalidHookError() {
        throw Error(formatProdErrorMessage(321));
      }
      function areHookInputsEqual(nextDeps, prevDeps) {
        if (null === prevDeps) return false;
        for (var i = 0; i < prevDeps.length && i < nextDeps.length; i++)
          if (!objectIs(nextDeps[i], prevDeps[i])) return false;
        return true;
      }
      function renderWithHooks(current, workInProgress2, Component2, props, secondArg, nextRenderLanes) {
        renderLanes = nextRenderLanes;
        currentlyRenderingFiber = workInProgress2;
        workInProgress2.memoizedState = null;
        workInProgress2.updateQueue = null;
        workInProgress2.lanes = 0;
        ReactSharedInternals.H = null === current || null === current.memoizedState ? HooksDispatcherOnMount : HooksDispatcherOnUpdate;
        shouldDoubleInvokeUserFnsInHooksDEV = false;
        nextRenderLanes = Component2(props, secondArg);
        shouldDoubleInvokeUserFnsInHooksDEV = false;
        didScheduleRenderPhaseUpdateDuringThisPass && (nextRenderLanes = renderWithHooksAgain(
          workInProgress2,
          Component2,
          props,
          secondArg
        ));
        finishRenderingHooks(current);
        return nextRenderLanes;
      }
      function finishRenderingHooks(current) {
        ReactSharedInternals.H = ContextOnlyDispatcher;
        var didRenderTooFewHooks = null !== currentHook && null !== currentHook.next;
        renderLanes = 0;
        workInProgressHook = currentHook = currentlyRenderingFiber = null;
        didScheduleRenderPhaseUpdate = false;
        thenableIndexCounter = 0;
        thenableState = null;
        if (didRenderTooFewHooks) throw Error(formatProdErrorMessage(300));
        null === current || didReceiveUpdate || (current = current.dependencies, null !== current && checkIfContextChanged(current) && (didReceiveUpdate = true));
      }
      function renderWithHooksAgain(workInProgress2, Component2, props, secondArg) {
        currentlyRenderingFiber = workInProgress2;
        var numberOfReRenders = 0;
        do {
          didScheduleRenderPhaseUpdateDuringThisPass && (thenableState = null);
          thenableIndexCounter = 0;
          didScheduleRenderPhaseUpdateDuringThisPass = false;
          if (25 <= numberOfReRenders) throw Error(formatProdErrorMessage(301));
          numberOfReRenders += 1;
          workInProgressHook = currentHook = null;
          if (null != workInProgress2.updateQueue) {
            var children = workInProgress2.updateQueue;
            children.lastEffect = null;
            children.events = null;
            children.stores = null;
            null != children.memoCache && (children.memoCache.index = 0);
          }
          ReactSharedInternals.H = HooksDispatcherOnRerender;
          children = Component2(props, secondArg);
        } while (didScheduleRenderPhaseUpdateDuringThisPass);
        return children;
      }
      function TransitionAwareHostComponent() {
        var dispatcher = ReactSharedInternals.H, maybeThenable = dispatcher.useState()[0];
        maybeThenable = "function" === typeof maybeThenable.then ? useThenable(maybeThenable) : maybeThenable;
        dispatcher = dispatcher.useState()[0];
        (null !== currentHook ? currentHook.memoizedState : null) !== dispatcher && (currentlyRenderingFiber.flags |= 1024);
        return maybeThenable;
      }
      function checkDidRenderIdHook() {
        var didRenderIdHook = 0 !== localIdCounter;
        localIdCounter = 0;
        return didRenderIdHook;
      }
      function bailoutHooks(current, workInProgress2, lanes) {
        workInProgress2.updateQueue = current.updateQueue;
        workInProgress2.flags &= -2053;
        current.lanes &= ~lanes;
      }
      function resetHooksOnUnwind(workInProgress2) {
        if (didScheduleRenderPhaseUpdate) {
          for (workInProgress2 = workInProgress2.memoizedState; null !== workInProgress2; ) {
            var queue = workInProgress2.queue;
            null !== queue && (queue.pending = null);
            workInProgress2 = workInProgress2.next;
          }
          didScheduleRenderPhaseUpdate = false;
        }
        renderLanes = 0;
        workInProgressHook = currentHook = currentlyRenderingFiber = null;
        didScheduleRenderPhaseUpdateDuringThisPass = false;
        thenableIndexCounter = localIdCounter = 0;
        thenableState = null;
      }
      function mountWorkInProgressHook() {
        var hook = {
          memoizedState: null,
          baseState: null,
          baseQueue: null,
          queue: null,
          next: null
        };
        null === workInProgressHook ? currentlyRenderingFiber.memoizedState = workInProgressHook = hook : workInProgressHook = workInProgressHook.next = hook;
        return workInProgressHook;
      }
      function updateWorkInProgressHook() {
        if (null === currentHook) {
          var nextCurrentHook = currentlyRenderingFiber.alternate;
          nextCurrentHook = null !== nextCurrentHook ? nextCurrentHook.memoizedState : null;
        } else nextCurrentHook = currentHook.next;
        var nextWorkInProgressHook = null === workInProgressHook ? currentlyRenderingFiber.memoizedState : workInProgressHook.next;
        if (null !== nextWorkInProgressHook)
          workInProgressHook = nextWorkInProgressHook, currentHook = nextCurrentHook;
        else {
          if (null === nextCurrentHook) {
            if (null === currentlyRenderingFiber.alternate)
              throw Error(formatProdErrorMessage(467));
            throw Error(formatProdErrorMessage(310));
          }
          currentHook = nextCurrentHook;
          nextCurrentHook = {
            memoizedState: currentHook.memoizedState,
            baseState: currentHook.baseState,
            baseQueue: currentHook.baseQueue,
            queue: currentHook.queue,
            next: null
          };
          null === workInProgressHook ? currentlyRenderingFiber.memoizedState = workInProgressHook = nextCurrentHook : workInProgressHook = workInProgressHook.next = nextCurrentHook;
        }
        return workInProgressHook;
      }
      function createFunctionComponentUpdateQueue() {
        return { lastEffect: null, events: null, stores: null, memoCache: null };
      }
      function useThenable(thenable) {
        var index2 = thenableIndexCounter;
        thenableIndexCounter += 1;
        null === thenableState && (thenableState = []);
        thenable = trackUsedThenable(thenableState, thenable, index2);
        index2 = currentlyRenderingFiber;
        null === (null === workInProgressHook ? index2.memoizedState : workInProgressHook.next) && (index2 = index2.alternate, ReactSharedInternals.H = null === index2 || null === index2.memoizedState ? HooksDispatcherOnMount : HooksDispatcherOnUpdate);
        return thenable;
      }
      function use(usable) {
        if (null !== usable && "object" === typeof usable) {
          if ("function" === typeof usable.then) return useThenable(usable);
          if (usable.$$typeof === REACT_CONTEXT_TYPE) return readContext(usable);
        }
        throw Error(formatProdErrorMessage(438, String(usable)));
      }
      function useMemoCache(size) {
        var memoCache = null, updateQueue = currentlyRenderingFiber.updateQueue;
        null !== updateQueue && (memoCache = updateQueue.memoCache);
        if (null == memoCache) {
          var current = currentlyRenderingFiber.alternate;
          null !== current && (current = current.updateQueue, null !== current && (current = current.memoCache, null != current && (memoCache = {
            data: current.data.map(function(array) {
              return array.slice();
            }),
            index: 0
          })));
        }
        null == memoCache && (memoCache = { data: [], index: 0 });
        null === updateQueue && (updateQueue = createFunctionComponentUpdateQueue(), currentlyRenderingFiber.updateQueue = updateQueue);
        updateQueue.memoCache = memoCache;
        updateQueue = memoCache.data[memoCache.index];
        if (void 0 === updateQueue)
          for (updateQueue = memoCache.data[memoCache.index] = Array(size), current = 0; current < size; current++)
            updateQueue[current] = REACT_MEMO_CACHE_SENTINEL;
        memoCache.index++;
        return updateQueue;
      }
      function basicStateReducer(state, action) {
        return "function" === typeof action ? action(state) : action;
      }
      function updateReducer(reducer) {
        var hook = updateWorkInProgressHook();
        return updateReducerImpl(hook, currentHook, reducer);
      }
      function updateReducerImpl(hook, current, reducer) {
        var queue = hook.queue;
        if (null === queue) throw Error(formatProdErrorMessage(311));
        queue.lastRenderedReducer = reducer;
        var baseQueue = hook.baseQueue, pendingQueue = queue.pending;
        if (null !== pendingQueue) {
          if (null !== baseQueue) {
            var baseFirst = baseQueue.next;
            baseQueue.next = pendingQueue.next;
            pendingQueue.next = baseFirst;
          }
          current.baseQueue = baseQueue = pendingQueue;
          queue.pending = null;
        }
        pendingQueue = hook.baseState;
        if (null === baseQueue) hook.memoizedState = pendingQueue;
        else {
          current = baseQueue.next;
          var newBaseQueueFirst = baseFirst = null, newBaseQueueLast = null, update = current, didReadFromEntangledAsyncAction$60 = false;
          do {
            var updateLane = update.lane & -536870913;
            if (updateLane !== update.lane ? (workInProgressRootRenderLanes & updateLane) === updateLane : (renderLanes & updateLane) === updateLane) {
              var revertLane = update.revertLane;
              if (0 === revertLane)
                null !== newBaseQueueLast && (newBaseQueueLast = newBaseQueueLast.next = {
                  lane: 0,
                  revertLane: 0,
                  gesture: null,
                  action: update.action,
                  hasEagerState: update.hasEagerState,
                  eagerState: update.eagerState,
                  next: null
                }), updateLane === currentEntangledLane && (didReadFromEntangledAsyncAction$60 = true);
              else if ((renderLanes & revertLane) === revertLane) {
                update = update.next;
                revertLane === currentEntangledLane && (didReadFromEntangledAsyncAction$60 = true);
                continue;
              } else
                updateLane = {
                  lane: 0,
                  revertLane: update.revertLane,
                  gesture: null,
                  action: update.action,
                  hasEagerState: update.hasEagerState,
                  eagerState: update.eagerState,
                  next: null
                }, null === newBaseQueueLast ? (newBaseQueueFirst = newBaseQueueLast = updateLane, baseFirst = pendingQueue) : newBaseQueueLast = newBaseQueueLast.next = updateLane, currentlyRenderingFiber.lanes |= revertLane, workInProgressRootSkippedLanes |= revertLane;
              updateLane = update.action;
              shouldDoubleInvokeUserFnsInHooksDEV && reducer(pendingQueue, updateLane);
              pendingQueue = update.hasEagerState ? update.eagerState : reducer(pendingQueue, updateLane);
            } else
              revertLane = {
                lane: updateLane,
                revertLane: update.revertLane,
                gesture: update.gesture,
                action: update.action,
                hasEagerState: update.hasEagerState,
                eagerState: update.eagerState,
                next: null
              }, null === newBaseQueueLast ? (newBaseQueueFirst = newBaseQueueLast = revertLane, baseFirst = pendingQueue) : newBaseQueueLast = newBaseQueueLast.next = revertLane, currentlyRenderingFiber.lanes |= updateLane, workInProgressRootSkippedLanes |= updateLane;
            update = update.next;
          } while (null !== update && update !== current);
          null === newBaseQueueLast ? baseFirst = pendingQueue : newBaseQueueLast.next = newBaseQueueFirst;
          if (!objectIs(pendingQueue, hook.memoizedState) && (didReceiveUpdate = true, didReadFromEntangledAsyncAction$60 && (reducer = currentEntangledActionThenable, null !== reducer)))
            throw reducer;
          hook.memoizedState = pendingQueue;
          hook.baseState = baseFirst;
          hook.baseQueue = newBaseQueueLast;
          queue.lastRenderedState = pendingQueue;
        }
        null === baseQueue && (queue.lanes = 0);
        return [hook.memoizedState, queue.dispatch];
      }
      function rerenderReducer(reducer) {
        var hook = updateWorkInProgressHook(), queue = hook.queue;
        if (null === queue) throw Error(formatProdErrorMessage(311));
        queue.lastRenderedReducer = reducer;
        var dispatch = queue.dispatch, lastRenderPhaseUpdate = queue.pending, newState = hook.memoizedState;
        if (null !== lastRenderPhaseUpdate) {
          queue.pending = null;
          var update = lastRenderPhaseUpdate = lastRenderPhaseUpdate.next;
          do
            newState = reducer(newState, update.action), update = update.next;
          while (update !== lastRenderPhaseUpdate);
          objectIs(newState, hook.memoizedState) || (didReceiveUpdate = true);
          hook.memoizedState = newState;
          null === hook.baseQueue && (hook.baseState = newState);
          queue.lastRenderedState = newState;
        }
        return [newState, dispatch];
      }
      function updateSyncExternalStore(subscribe, getSnapshot, getServerSnapshot) {
        var fiber = currentlyRenderingFiber, hook = updateWorkInProgressHook(), isHydrating$jscomp$0 = isHydrating;
        if (isHydrating$jscomp$0) {
          if (void 0 === getServerSnapshot) throw Error(formatProdErrorMessage(407));
          getServerSnapshot = getServerSnapshot();
        } else getServerSnapshot = getSnapshot();
        var snapshotChanged = !objectIs(
          (currentHook || hook).memoizedState,
          getServerSnapshot
        );
        snapshotChanged && (hook.memoizedState = getServerSnapshot, didReceiveUpdate = true);
        hook = hook.queue;
        updateEffect(subscribeToStore.bind(null, fiber, hook, subscribe), [
          subscribe
        ]);
        if (hook.getSnapshot !== getSnapshot || snapshotChanged || null !== workInProgressHook && workInProgressHook.memoizedState.tag & 1) {
          fiber.flags |= 2048;
          pushSimpleEffect(
            9,
            { destroy: void 0 },
            updateStoreInstance.bind(
              null,
              fiber,
              hook,
              getServerSnapshot,
              getSnapshot
            ),
            null
          );
          if (null === workInProgressRoot) throw Error(formatProdErrorMessage(349));
          isHydrating$jscomp$0 || 0 !== (renderLanes & 127) || pushStoreConsistencyCheck(fiber, getSnapshot, getServerSnapshot);
        }
        return getServerSnapshot;
      }
      function pushStoreConsistencyCheck(fiber, getSnapshot, renderedSnapshot) {
        fiber.flags |= 16384;
        fiber = { getSnapshot, value: renderedSnapshot };
        getSnapshot = currentlyRenderingFiber.updateQueue;
        null === getSnapshot ? (getSnapshot = createFunctionComponentUpdateQueue(), currentlyRenderingFiber.updateQueue = getSnapshot, getSnapshot.stores = [fiber]) : (renderedSnapshot = getSnapshot.stores, null === renderedSnapshot ? getSnapshot.stores = [fiber] : renderedSnapshot.push(fiber));
      }
      function updateStoreInstance(fiber, inst, nextSnapshot, getSnapshot) {
        inst.value = nextSnapshot;
        inst.getSnapshot = getSnapshot;
        checkIfSnapshotChanged(inst) && forceStoreRerender(fiber);
      }
      function subscribeToStore(fiber, inst, subscribe) {
        return subscribe(function() {
          checkIfSnapshotChanged(inst) && forceStoreRerender(fiber);
        });
      }
      function checkIfSnapshotChanged(inst) {
        var latestGetSnapshot = inst.getSnapshot;
        inst = inst.value;
        try {
          var nextValue = latestGetSnapshot();
          return !objectIs(inst, nextValue);
        } catch (error) {
          return true;
        }
      }
      function forceStoreRerender(fiber) {
        var root2 = enqueueConcurrentRenderForLane(fiber, 2);
        null !== root2 && scheduleUpdateOnFiber(root2, fiber, 2);
      }
      function mountStateImpl(initialState) {
        var hook = mountWorkInProgressHook();
        if ("function" === typeof initialState) {
          var initialStateInitializer = initialState;
          initialState = initialStateInitializer();
          if (shouldDoubleInvokeUserFnsInHooksDEV) {
            setIsStrictModeForDevtools(true);
            try {
              initialStateInitializer();
            } finally {
              setIsStrictModeForDevtools(false);
            }
          }
        }
        hook.memoizedState = hook.baseState = initialState;
        hook.queue = {
          pending: null,
          lanes: 0,
          dispatch: null,
          lastRenderedReducer: basicStateReducer,
          lastRenderedState: initialState
        };
        return hook;
      }
      function updateOptimisticImpl(hook, current, passthrough, reducer) {
        hook.baseState = passthrough;
        return updateReducerImpl(
          hook,
          currentHook,
          "function" === typeof reducer ? reducer : basicStateReducer
        );
      }
      function dispatchActionState(fiber, actionQueue, setPendingState, setState, payload) {
        if (isRenderPhaseUpdate(fiber)) throw Error(formatProdErrorMessage(485));
        fiber = actionQueue.action;
        if (null !== fiber) {
          var actionNode = {
            payload,
            action: fiber,
            next: null,
            isTransition: true,
            status: "pending",
            value: null,
            reason: null,
            listeners: [],
            then: function(listener) {
              actionNode.listeners.push(listener);
            }
          };
          null !== ReactSharedInternals.T ? setPendingState(true) : actionNode.isTransition = false;
          setState(actionNode);
          setPendingState = actionQueue.pending;
          null === setPendingState ? (actionNode.next = actionQueue.pending = actionNode, runActionStateAction(actionQueue, actionNode)) : (actionNode.next = setPendingState.next, actionQueue.pending = setPendingState.next = actionNode);
        }
      }
      function runActionStateAction(actionQueue, node) {
        var action = node.action, payload = node.payload, prevState = actionQueue.state;
        if (node.isTransition) {
          var prevTransition = ReactSharedInternals.T, currentTransition = {};
          ReactSharedInternals.T = currentTransition;
          try {
            var returnValue = action(prevState, payload), onStartTransitionFinish = ReactSharedInternals.S;
            null !== onStartTransitionFinish && onStartTransitionFinish(currentTransition, returnValue);
            handleActionReturnValue(actionQueue, node, returnValue);
          } catch (error) {
            onActionError(actionQueue, node, error);
          } finally {
            null !== prevTransition && null !== currentTransition.types && (prevTransition.types = currentTransition.types), ReactSharedInternals.T = prevTransition;
          }
        } else
          try {
            prevTransition = action(prevState, payload), handleActionReturnValue(actionQueue, node, prevTransition);
          } catch (error$66) {
            onActionError(actionQueue, node, error$66);
          }
      }
      function handleActionReturnValue(actionQueue, node, returnValue) {
        null !== returnValue && "object" === typeof returnValue && "function" === typeof returnValue.then ? returnValue.then(
          function(nextState) {
            onActionSuccess(actionQueue, node, nextState);
          },
          function(error) {
            return onActionError(actionQueue, node, error);
          }
        ) : onActionSuccess(actionQueue, node, returnValue);
      }
      function onActionSuccess(actionQueue, actionNode, nextState) {
        actionNode.status = "fulfilled";
        actionNode.value = nextState;
        notifyActionListeners(actionNode);
        actionQueue.state = nextState;
        actionNode = actionQueue.pending;
        null !== actionNode && (nextState = actionNode.next, nextState === actionNode ? actionQueue.pending = null : (nextState = nextState.next, actionNode.next = nextState, runActionStateAction(actionQueue, nextState)));
      }
      function onActionError(actionQueue, actionNode, error) {
        var last = actionQueue.pending;
        actionQueue.pending = null;
        if (null !== last) {
          last = last.next;
          do
            actionNode.status = "rejected", actionNode.reason = error, notifyActionListeners(actionNode), actionNode = actionNode.next;
          while (actionNode !== last);
        }
        actionQueue.action = null;
      }
      function notifyActionListeners(actionNode) {
        actionNode = actionNode.listeners;
        for (var i = 0; i < actionNode.length; i++) (0, actionNode[i])();
      }
      function actionStateReducer(oldState, newState) {
        return newState;
      }
      function mountActionState(action, initialStateProp) {
        if (isHydrating) {
          var ssrFormState = workInProgressRoot.formState;
          if (null !== ssrFormState) {
            a: {
              var JSCompiler_inline_result = currentlyRenderingFiber;
              if (isHydrating) {
                if (nextHydratableInstance) {
                  b: {
                    var JSCompiler_inline_result$jscomp$0 = nextHydratableInstance;
                    for (var inRootOrSingleton = rootOrSingletonContext; 8 !== JSCompiler_inline_result$jscomp$0.nodeType; ) {
                      if (!inRootOrSingleton) {
                        JSCompiler_inline_result$jscomp$0 = null;
                        break b;
                      }
                      JSCompiler_inline_result$jscomp$0 = getNextHydratable(
                        JSCompiler_inline_result$jscomp$0.nextSibling
                      );
                      if (null === JSCompiler_inline_result$jscomp$0) {
                        JSCompiler_inline_result$jscomp$0 = null;
                        break b;
                      }
                    }
                    inRootOrSingleton = JSCompiler_inline_result$jscomp$0.data;
                    JSCompiler_inline_result$jscomp$0 = "F!" === inRootOrSingleton || "F" === inRootOrSingleton ? JSCompiler_inline_result$jscomp$0 : null;
                  }
                  if (JSCompiler_inline_result$jscomp$0) {
                    nextHydratableInstance = getNextHydratable(
                      JSCompiler_inline_result$jscomp$0.nextSibling
                    );
                    JSCompiler_inline_result = "F!" === JSCompiler_inline_result$jscomp$0.data;
                    break a;
                  }
                }
                throwOnHydrationMismatch(JSCompiler_inline_result);
              }
              JSCompiler_inline_result = false;
            }
            JSCompiler_inline_result && (initialStateProp = ssrFormState[0]);
          }
        }
        ssrFormState = mountWorkInProgressHook();
        ssrFormState.memoizedState = ssrFormState.baseState = initialStateProp;
        JSCompiler_inline_result = {
          pending: null,
          lanes: 0,
          dispatch: null,
          lastRenderedReducer: actionStateReducer,
          lastRenderedState: initialStateProp
        };
        ssrFormState.queue = JSCompiler_inline_result;
        ssrFormState = dispatchSetState.bind(
          null,
          currentlyRenderingFiber,
          JSCompiler_inline_result
        );
        JSCompiler_inline_result.dispatch = ssrFormState;
        JSCompiler_inline_result = mountStateImpl(false);
        inRootOrSingleton = dispatchOptimisticSetState.bind(
          null,
          currentlyRenderingFiber,
          false,
          JSCompiler_inline_result.queue
        );
        JSCompiler_inline_result = mountWorkInProgressHook();
        JSCompiler_inline_result$jscomp$0 = {
          state: initialStateProp,
          dispatch: null,
          action,
          pending: null
        };
        JSCompiler_inline_result.queue = JSCompiler_inline_result$jscomp$0;
        ssrFormState = dispatchActionState.bind(
          null,
          currentlyRenderingFiber,
          JSCompiler_inline_result$jscomp$0,
          inRootOrSingleton,
          ssrFormState
        );
        JSCompiler_inline_result$jscomp$0.dispatch = ssrFormState;
        JSCompiler_inline_result.memoizedState = action;
        return [initialStateProp, ssrFormState, false];
      }
      function updateActionState(action) {
        var stateHook = updateWorkInProgressHook();
        return updateActionStateImpl(stateHook, currentHook, action);
      }
      function updateActionStateImpl(stateHook, currentStateHook, action) {
        currentStateHook = updateReducerImpl(
          stateHook,
          currentStateHook,
          actionStateReducer
        )[0];
        stateHook = updateReducer(basicStateReducer)[0];
        if ("object" === typeof currentStateHook && null !== currentStateHook && "function" === typeof currentStateHook.then)
          try {
            var state = useThenable(currentStateHook);
          } catch (x) {
            if (x === SuspenseException) throw SuspenseActionException;
            throw x;
          }
        else state = currentStateHook;
        currentStateHook = updateWorkInProgressHook();
        var actionQueue = currentStateHook.queue, dispatch = actionQueue.dispatch;
        action !== currentStateHook.memoizedState && (currentlyRenderingFiber.flags |= 2048, pushSimpleEffect(
          9,
          { destroy: void 0 },
          actionStateActionEffect.bind(null, actionQueue, action),
          null
        ));
        return [state, dispatch, stateHook];
      }
      function actionStateActionEffect(actionQueue, action) {
        actionQueue.action = action;
      }
      function rerenderActionState(action) {
        var stateHook = updateWorkInProgressHook(), currentStateHook = currentHook;
        if (null !== currentStateHook)
          return updateActionStateImpl(stateHook, currentStateHook, action);
        updateWorkInProgressHook();
        stateHook = stateHook.memoizedState;
        currentStateHook = updateWorkInProgressHook();
        var dispatch = currentStateHook.queue.dispatch;
        currentStateHook.memoizedState = action;
        return [stateHook, dispatch, false];
      }
      function pushSimpleEffect(tag, inst, create, deps) {
        tag = { tag, create, deps, inst, next: null };
        inst = currentlyRenderingFiber.updateQueue;
        null === inst && (inst = createFunctionComponentUpdateQueue(), currentlyRenderingFiber.updateQueue = inst);
        create = inst.lastEffect;
        null === create ? inst.lastEffect = tag.next = tag : (deps = create.next, create.next = tag, tag.next = deps, inst.lastEffect = tag);
        return tag;
      }
      function updateRef() {
        return updateWorkInProgressHook().memoizedState;
      }
      function mountEffectImpl(fiberFlags, hookFlags, create, deps) {
        var hook = mountWorkInProgressHook();
        currentlyRenderingFiber.flags |= fiberFlags;
        hook.memoizedState = pushSimpleEffect(
          1 | hookFlags,
          { destroy: void 0 },
          create,
          void 0 === deps ? null : deps
        );
      }
      function updateEffectImpl(fiberFlags, hookFlags, create, deps) {
        var hook = updateWorkInProgressHook();
        deps = void 0 === deps ? null : deps;
        var inst = hook.memoizedState.inst;
        null !== currentHook && null !== deps && areHookInputsEqual(deps, currentHook.memoizedState.deps) ? hook.memoizedState = pushSimpleEffect(hookFlags, inst, create, deps) : (currentlyRenderingFiber.flags |= fiberFlags, hook.memoizedState = pushSimpleEffect(
          1 | hookFlags,
          inst,
          create,
          deps
        ));
      }
      function mountEffect(create, deps) {
        mountEffectImpl(8390656, 8, create, deps);
      }
      function updateEffect(create, deps) {
        updateEffectImpl(2048, 8, create, deps);
      }
      function useEffectEventImpl(payload) {
        currentlyRenderingFiber.flags |= 4;
        var componentUpdateQueue = currentlyRenderingFiber.updateQueue;
        if (null === componentUpdateQueue)
          componentUpdateQueue = createFunctionComponentUpdateQueue(), currentlyRenderingFiber.updateQueue = componentUpdateQueue, componentUpdateQueue.events = [payload];
        else {
          var events = componentUpdateQueue.events;
          null === events ? componentUpdateQueue.events = [payload] : events.push(payload);
        }
      }
      function updateEvent(callback) {
        var ref = updateWorkInProgressHook().memoizedState;
        useEffectEventImpl({ ref, nextImpl: callback });
        return function() {
          if (0 !== (executionContext & 2)) throw Error(formatProdErrorMessage(440));
          return ref.impl.apply(void 0, arguments);
        };
      }
      function updateInsertionEffect(create, deps) {
        return updateEffectImpl(4, 2, create, deps);
      }
      function updateLayoutEffect(create, deps) {
        return updateEffectImpl(4, 4, create, deps);
      }
      function imperativeHandleEffect(create, ref) {
        if ("function" === typeof ref) {
          create = create();
          var refCleanup = ref(create);
          return function() {
            "function" === typeof refCleanup ? refCleanup() : ref(null);
          };
        }
        if (null !== ref && void 0 !== ref)
          return create = create(), ref.current = create, function() {
            ref.current = null;
          };
      }
      function updateImperativeHandle(ref, create, deps) {
        deps = null !== deps && void 0 !== deps ? deps.concat([ref]) : null;
        updateEffectImpl(4, 4, imperativeHandleEffect.bind(null, create, ref), deps);
      }
      function mountDebugValue() {
      }
      function updateCallback(callback, deps) {
        var hook = updateWorkInProgressHook();
        deps = void 0 === deps ? null : deps;
        var prevState = hook.memoizedState;
        if (null !== deps && areHookInputsEqual(deps, prevState[1]))
          return prevState[0];
        hook.memoizedState = [callback, deps];
        return callback;
      }
      function updateMemo(nextCreate, deps) {
        var hook = updateWorkInProgressHook();
        deps = void 0 === deps ? null : deps;
        var prevState = hook.memoizedState;
        if (null !== deps && areHookInputsEqual(deps, prevState[1]))
          return prevState[0];
        prevState = nextCreate();
        if (shouldDoubleInvokeUserFnsInHooksDEV) {
          setIsStrictModeForDevtools(true);
          try {
            nextCreate();
          } finally {
            setIsStrictModeForDevtools(false);
          }
        }
        hook.memoizedState = [prevState, deps];
        return prevState;
      }
      function mountDeferredValueImpl(hook, value, initialValue) {
        if (void 0 === initialValue || 0 !== (renderLanes & 1073741824) && 0 === (workInProgressRootRenderLanes & 261930))
          return hook.memoizedState = value;
        hook.memoizedState = initialValue;
        hook = requestDeferredLane();
        currentlyRenderingFiber.lanes |= hook;
        workInProgressRootSkippedLanes |= hook;
        return initialValue;
      }
      function updateDeferredValueImpl(hook, prevValue, value, initialValue) {
        if (objectIs(value, prevValue)) return value;
        if (null !== currentTreeHiddenStackCursor.current)
          return hook = mountDeferredValueImpl(hook, value, initialValue), objectIs(hook, prevValue) || (didReceiveUpdate = true), hook;
        if (0 === (renderLanes & 42) || 0 !== (renderLanes & 1073741824) && 0 === (workInProgressRootRenderLanes & 261930))
          return didReceiveUpdate = true, hook.memoizedState = value;
        hook = requestDeferredLane();
        currentlyRenderingFiber.lanes |= hook;
        workInProgressRootSkippedLanes |= hook;
        return prevValue;
      }
      function startTransition(fiber, queue, pendingState, finishedState, callback) {
        var previousPriority = ReactDOMSharedInternals.p;
        ReactDOMSharedInternals.p = 0 !== previousPriority && 8 > previousPriority ? previousPriority : 8;
        var prevTransition = ReactSharedInternals.T, currentTransition = {};
        ReactSharedInternals.T = currentTransition;
        dispatchOptimisticSetState(fiber, false, queue, pendingState);
        try {
          var returnValue = callback(), onStartTransitionFinish = ReactSharedInternals.S;
          null !== onStartTransitionFinish && onStartTransitionFinish(currentTransition, returnValue);
          if (null !== returnValue && "object" === typeof returnValue && "function" === typeof returnValue.then) {
            var thenableForFinishedState = chainThenableValue(
              returnValue,
              finishedState
            );
            dispatchSetStateInternal(
              fiber,
              queue,
              thenableForFinishedState,
              requestUpdateLane(fiber)
            );
          } else
            dispatchSetStateInternal(
              fiber,
              queue,
              finishedState,
              requestUpdateLane(fiber)
            );
        } catch (error) {
          dispatchSetStateInternal(
            fiber,
            queue,
            { then: function() {
            }, status: "rejected", reason: error },
            requestUpdateLane()
          );
        } finally {
          ReactDOMSharedInternals.p = previousPriority, null !== prevTransition && null !== currentTransition.types && (prevTransition.types = currentTransition.types), ReactSharedInternals.T = prevTransition;
        }
      }
      function noop() {
      }
      function startHostTransition(formFiber, pendingState, action, formData) {
        if (5 !== formFiber.tag) throw Error(formatProdErrorMessage(476));
        var queue = ensureFormComponentIsStateful(formFiber).queue;
        startTransition(
          formFiber,
          queue,
          pendingState,
          sharedNotPendingObject,
          null === action ? noop : function() {
            requestFormReset$1(formFiber);
            return action(formData);
          }
        );
      }
      function ensureFormComponentIsStateful(formFiber) {
        var existingStateHook = formFiber.memoizedState;
        if (null !== existingStateHook) return existingStateHook;
        existingStateHook = {
          memoizedState: sharedNotPendingObject,
          baseState: sharedNotPendingObject,
          baseQueue: null,
          queue: {
            pending: null,
            lanes: 0,
            dispatch: null,
            lastRenderedReducer: basicStateReducer,
            lastRenderedState: sharedNotPendingObject
          },
          next: null
        };
        var initialResetState = {};
        existingStateHook.next = {
          memoizedState: initialResetState,
          baseState: initialResetState,
          baseQueue: null,
          queue: {
            pending: null,
            lanes: 0,
            dispatch: null,
            lastRenderedReducer: basicStateReducer,
            lastRenderedState: initialResetState
          },
          next: null
        };
        formFiber.memoizedState = existingStateHook;
        formFiber = formFiber.alternate;
        null !== formFiber && (formFiber.memoizedState = existingStateHook);
        return existingStateHook;
      }
      function requestFormReset$1(formFiber) {
        var stateHook = ensureFormComponentIsStateful(formFiber);
        null === stateHook.next && (stateHook = formFiber.alternate.memoizedState);
        dispatchSetStateInternal(
          formFiber,
          stateHook.next.queue,
          {},
          requestUpdateLane()
        );
      }
      function useHostTransitionStatus() {
        return readContext(HostTransitionContext);
      }
      function updateId() {
        return updateWorkInProgressHook().memoizedState;
      }
      function updateRefresh() {
        return updateWorkInProgressHook().memoizedState;
      }
      function refreshCache(fiber) {
        for (var provider = fiber.return; null !== provider; ) {
          switch (provider.tag) {
            case 24:
            case 3:
              var lane = requestUpdateLane();
              fiber = createUpdate(lane);
              var root$69 = enqueueUpdate(provider, fiber, lane);
              null !== root$69 && (scheduleUpdateOnFiber(root$69, provider, lane), entangleTransitions(root$69, provider, lane));
              provider = { cache: createCache() };
              fiber.payload = provider;
              return;
          }
          provider = provider.return;
        }
      }
      function dispatchReducerAction(fiber, queue, action) {
        var lane = requestUpdateLane();
        action = {
          lane,
          revertLane: 0,
          gesture: null,
          action,
          hasEagerState: false,
          eagerState: null,
          next: null
        };
        isRenderPhaseUpdate(fiber) ? enqueueRenderPhaseUpdate(queue, action) : (action = enqueueConcurrentHookUpdate(fiber, queue, action, lane), null !== action && (scheduleUpdateOnFiber(action, fiber, lane), entangleTransitionUpdate(action, queue, lane)));
      }
      function dispatchSetState(fiber, queue, action) {
        var lane = requestUpdateLane();
        dispatchSetStateInternal(fiber, queue, action, lane);
      }
      function dispatchSetStateInternal(fiber, queue, action, lane) {
        var update = {
          lane,
          revertLane: 0,
          gesture: null,
          action,
          hasEagerState: false,
          eagerState: null,
          next: null
        };
        if (isRenderPhaseUpdate(fiber)) enqueueRenderPhaseUpdate(queue, update);
        else {
          var alternate = fiber.alternate;
          if (0 === fiber.lanes && (null === alternate || 0 === alternate.lanes) && (alternate = queue.lastRenderedReducer, null !== alternate))
            try {
              var currentState = queue.lastRenderedState, eagerState = alternate(currentState, action);
              update.hasEagerState = true;
              update.eagerState = eagerState;
              if (objectIs(eagerState, currentState))
                return enqueueUpdate$1(fiber, queue, update, 0), null === workInProgressRoot && finishQueueingConcurrentUpdates(), false;
            } catch (error) {
            } finally {
            }
          action = enqueueConcurrentHookUpdate(fiber, queue, update, lane);
          if (null !== action)
            return scheduleUpdateOnFiber(action, fiber, lane), entangleTransitionUpdate(action, queue, lane), true;
        }
        return false;
      }
      function dispatchOptimisticSetState(fiber, throwIfDuringRender, queue, action) {
        action = {
          lane: 2,
          revertLane: requestTransitionLane(),
          gesture: null,
          action,
          hasEagerState: false,
          eagerState: null,
          next: null
        };
        if (isRenderPhaseUpdate(fiber)) {
          if (throwIfDuringRender) throw Error(formatProdErrorMessage(479));
        } else
          throwIfDuringRender = enqueueConcurrentHookUpdate(
            fiber,
            queue,
            action,
            2
          ), null !== throwIfDuringRender && scheduleUpdateOnFiber(throwIfDuringRender, fiber, 2);
      }
      function isRenderPhaseUpdate(fiber) {
        var alternate = fiber.alternate;
        return fiber === currentlyRenderingFiber || null !== alternate && alternate === currentlyRenderingFiber;
      }
      function enqueueRenderPhaseUpdate(queue, update) {
        didScheduleRenderPhaseUpdateDuringThisPass = didScheduleRenderPhaseUpdate = true;
        var pending = queue.pending;
        null === pending ? update.next = update : (update.next = pending.next, pending.next = update);
        queue.pending = update;
      }
      function entangleTransitionUpdate(root2, queue, lane) {
        if (0 !== (lane & 4194048)) {
          var queueLanes = queue.lanes;
          queueLanes &= root2.pendingLanes;
          lane |= queueLanes;
          queue.lanes = lane;
          markRootEntangled(root2, lane);
        }
      }
      var ContextOnlyDispatcher = {
        readContext,
        use,
        useCallback: throwInvalidHookError,
        useContext: throwInvalidHookError,
        useEffect: throwInvalidHookError,
        useImperativeHandle: throwInvalidHookError,
        useLayoutEffect: throwInvalidHookError,
        useInsertionEffect: throwInvalidHookError,
        useMemo: throwInvalidHookError,
        useReducer: throwInvalidHookError,
        useRef: throwInvalidHookError,
        useState: throwInvalidHookError,
        useDebugValue: throwInvalidHookError,
        useDeferredValue: throwInvalidHookError,
        useTransition: throwInvalidHookError,
        useSyncExternalStore: throwInvalidHookError,
        useId: throwInvalidHookError,
        useHostTransitionStatus: throwInvalidHookError,
        useFormState: throwInvalidHookError,
        useActionState: throwInvalidHookError,
        useOptimistic: throwInvalidHookError,
        useMemoCache: throwInvalidHookError,
        useCacheRefresh: throwInvalidHookError
      };
      ContextOnlyDispatcher.useEffectEvent = throwInvalidHookError;
      var HooksDispatcherOnMount = {
        readContext,
        use,
        useCallback: function(callback, deps) {
          mountWorkInProgressHook().memoizedState = [
            callback,
            void 0 === deps ? null : deps
          ];
          return callback;
        },
        useContext: readContext,
        useEffect: mountEffect,
        useImperativeHandle: function(ref, create, deps) {
          deps = null !== deps && void 0 !== deps ? deps.concat([ref]) : null;
          mountEffectImpl(
            4194308,
            4,
            imperativeHandleEffect.bind(null, create, ref),
            deps
          );
        },
        useLayoutEffect: function(create, deps) {
          return mountEffectImpl(4194308, 4, create, deps);
        },
        useInsertionEffect: function(create, deps) {
          mountEffectImpl(4, 2, create, deps);
        },
        useMemo: function(nextCreate, deps) {
          var hook = mountWorkInProgressHook();
          deps = void 0 === deps ? null : deps;
          var nextValue = nextCreate();
          if (shouldDoubleInvokeUserFnsInHooksDEV) {
            setIsStrictModeForDevtools(true);
            try {
              nextCreate();
            } finally {
              setIsStrictModeForDevtools(false);
            }
          }
          hook.memoizedState = [nextValue, deps];
          return nextValue;
        },
        useReducer: function(reducer, initialArg, init) {
          var hook = mountWorkInProgressHook();
          if (void 0 !== init) {
            var initialState = init(initialArg);
            if (shouldDoubleInvokeUserFnsInHooksDEV) {
              setIsStrictModeForDevtools(true);
              try {
                init(initialArg);
              } finally {
                setIsStrictModeForDevtools(false);
              }
            }
          } else initialState = initialArg;
          hook.memoizedState = hook.baseState = initialState;
          reducer = {
            pending: null,
            lanes: 0,
            dispatch: null,
            lastRenderedReducer: reducer,
            lastRenderedState: initialState
          };
          hook.queue = reducer;
          reducer = reducer.dispatch = dispatchReducerAction.bind(
            null,
            currentlyRenderingFiber,
            reducer
          );
          return [hook.memoizedState, reducer];
        },
        useRef: function(initialValue) {
          var hook = mountWorkInProgressHook();
          initialValue = { current: initialValue };
          return hook.memoizedState = initialValue;
        },
        useState: function(initialState) {
          initialState = mountStateImpl(initialState);
          var queue = initialState.queue, dispatch = dispatchSetState.bind(null, currentlyRenderingFiber, queue);
          queue.dispatch = dispatch;
          return [initialState.memoizedState, dispatch];
        },
        useDebugValue: mountDebugValue,
        useDeferredValue: function(value, initialValue) {
          var hook = mountWorkInProgressHook();
          return mountDeferredValueImpl(hook, value, initialValue);
        },
        useTransition: function() {
          var stateHook = mountStateImpl(false);
          stateHook = startTransition.bind(
            null,
            currentlyRenderingFiber,
            stateHook.queue,
            true,
            false
          );
          mountWorkInProgressHook().memoizedState = stateHook;
          return [false, stateHook];
        },
        useSyncExternalStore: function(subscribe, getSnapshot, getServerSnapshot) {
          var fiber = currentlyRenderingFiber, hook = mountWorkInProgressHook();
          if (isHydrating) {
            if (void 0 === getServerSnapshot)
              throw Error(formatProdErrorMessage(407));
            getServerSnapshot = getServerSnapshot();
          } else {
            getServerSnapshot = getSnapshot();
            if (null === workInProgressRoot)
              throw Error(formatProdErrorMessage(349));
            0 !== (workInProgressRootRenderLanes & 127) || pushStoreConsistencyCheck(fiber, getSnapshot, getServerSnapshot);
          }
          hook.memoizedState = getServerSnapshot;
          var inst = { value: getServerSnapshot, getSnapshot };
          hook.queue = inst;
          mountEffect(subscribeToStore.bind(null, fiber, inst, subscribe), [
            subscribe
          ]);
          fiber.flags |= 2048;
          pushSimpleEffect(
            9,
            { destroy: void 0 },
            updateStoreInstance.bind(
              null,
              fiber,
              inst,
              getServerSnapshot,
              getSnapshot
            ),
            null
          );
          return getServerSnapshot;
        },
        useId: function() {
          var hook = mountWorkInProgressHook(), identifierPrefix = workInProgressRoot.identifierPrefix;
          if (isHydrating) {
            var JSCompiler_inline_result = treeContextOverflow;
            var idWithLeadingBit = treeContextId;
            JSCompiler_inline_result = (idWithLeadingBit & ~(1 << 32 - clz32(idWithLeadingBit) - 1)).toString(32) + JSCompiler_inline_result;
            identifierPrefix = "_" + identifierPrefix + "R_" + JSCompiler_inline_result;
            JSCompiler_inline_result = localIdCounter++;
            0 < JSCompiler_inline_result && (identifierPrefix += "H" + JSCompiler_inline_result.toString(32));
            identifierPrefix += "_";
          } else
            JSCompiler_inline_result = globalClientIdCounter++, identifierPrefix = "_" + identifierPrefix + "r_" + JSCompiler_inline_result.toString(32) + "_";
          return hook.memoizedState = identifierPrefix;
        },
        useHostTransitionStatus,
        useFormState: mountActionState,
        useActionState: mountActionState,
        useOptimistic: function(passthrough) {
          var hook = mountWorkInProgressHook();
          hook.memoizedState = hook.baseState = passthrough;
          var queue = {
            pending: null,
            lanes: 0,
            dispatch: null,
            lastRenderedReducer: null,
            lastRenderedState: null
          };
          hook.queue = queue;
          hook = dispatchOptimisticSetState.bind(
            null,
            currentlyRenderingFiber,
            true,
            queue
          );
          queue.dispatch = hook;
          return [passthrough, hook];
        },
        useMemoCache,
        useCacheRefresh: function() {
          return mountWorkInProgressHook().memoizedState = refreshCache.bind(
            null,
            currentlyRenderingFiber
          );
        },
        useEffectEvent: function(callback) {
          var hook = mountWorkInProgressHook(), ref = { impl: callback };
          hook.memoizedState = ref;
          return function() {
            if (0 !== (executionContext & 2))
              throw Error(formatProdErrorMessage(440));
            return ref.impl.apply(void 0, arguments);
          };
        }
      };
      var HooksDispatcherOnUpdate = {
        readContext,
        use,
        useCallback: updateCallback,
        useContext: readContext,
        useEffect: updateEffect,
        useImperativeHandle: updateImperativeHandle,
        useInsertionEffect: updateInsertionEffect,
        useLayoutEffect: updateLayoutEffect,
        useMemo: updateMemo,
        useReducer: updateReducer,
        useRef: updateRef,
        useState: function() {
          return updateReducer(basicStateReducer);
        },
        useDebugValue: mountDebugValue,
        useDeferredValue: function(value, initialValue) {
          var hook = updateWorkInProgressHook();
          return updateDeferredValueImpl(
            hook,
            currentHook.memoizedState,
            value,
            initialValue
          );
        },
        useTransition: function() {
          var booleanOrThenable = updateReducer(basicStateReducer)[0], start = updateWorkInProgressHook().memoizedState;
          return [
            "boolean" === typeof booleanOrThenable ? booleanOrThenable : useThenable(booleanOrThenable),
            start
          ];
        },
        useSyncExternalStore: updateSyncExternalStore,
        useId: updateId,
        useHostTransitionStatus,
        useFormState: updateActionState,
        useActionState: updateActionState,
        useOptimistic: function(passthrough, reducer) {
          var hook = updateWorkInProgressHook();
          return updateOptimisticImpl(hook, currentHook, passthrough, reducer);
        },
        useMemoCache,
        useCacheRefresh: updateRefresh
      };
      HooksDispatcherOnUpdate.useEffectEvent = updateEvent;
      var HooksDispatcherOnRerender = {
        readContext,
        use,
        useCallback: updateCallback,
        useContext: readContext,
        useEffect: updateEffect,
        useImperativeHandle: updateImperativeHandle,
        useInsertionEffect: updateInsertionEffect,
        useLayoutEffect: updateLayoutEffect,
        useMemo: updateMemo,
        useReducer: rerenderReducer,
        useRef: updateRef,
        useState: function() {
          return rerenderReducer(basicStateReducer);
        },
        useDebugValue: mountDebugValue,
        useDeferredValue: function(value, initialValue) {
          var hook = updateWorkInProgressHook();
          return null === currentHook ? mountDeferredValueImpl(hook, value, initialValue) : updateDeferredValueImpl(
            hook,
            currentHook.memoizedState,
            value,
            initialValue
          );
        },
        useTransition: function() {
          var booleanOrThenable = rerenderReducer(basicStateReducer)[0], start = updateWorkInProgressHook().memoizedState;
          return [
            "boolean" === typeof booleanOrThenable ? booleanOrThenable : useThenable(booleanOrThenable),
            start
          ];
        },
        useSyncExternalStore: updateSyncExternalStore,
        useId: updateId,
        useHostTransitionStatus,
        useFormState: rerenderActionState,
        useActionState: rerenderActionState,
        useOptimistic: function(passthrough, reducer) {
          var hook = updateWorkInProgressHook();
          if (null !== currentHook)
            return updateOptimisticImpl(hook, currentHook, passthrough, reducer);
          hook.baseState = passthrough;
          return [passthrough, hook.queue.dispatch];
        },
        useMemoCache,
        useCacheRefresh: updateRefresh
      };
      HooksDispatcherOnRerender.useEffectEvent = updateEvent;
      function applyDerivedStateFromProps(workInProgress2, ctor, getDerivedStateFromProps, nextProps) {
        ctor = workInProgress2.memoizedState;
        getDerivedStateFromProps = getDerivedStateFromProps(nextProps, ctor);
        getDerivedStateFromProps = null === getDerivedStateFromProps || void 0 === getDerivedStateFromProps ? ctor : assign({}, ctor, getDerivedStateFromProps);
        workInProgress2.memoizedState = getDerivedStateFromProps;
        0 === workInProgress2.lanes && (workInProgress2.updateQueue.baseState = getDerivedStateFromProps);
      }
      var classComponentUpdater = {
        enqueueSetState: function(inst, payload, callback) {
          inst = inst._reactInternals;
          var lane = requestUpdateLane(), update = createUpdate(lane);
          update.payload = payload;
          void 0 !== callback && null !== callback && (update.callback = callback);
          payload = enqueueUpdate(inst, update, lane);
          null !== payload && (scheduleUpdateOnFiber(payload, inst, lane), entangleTransitions(payload, inst, lane));
        },
        enqueueReplaceState: function(inst, payload, callback) {
          inst = inst._reactInternals;
          var lane = requestUpdateLane(), update = createUpdate(lane);
          update.tag = 1;
          update.payload = payload;
          void 0 !== callback && null !== callback && (update.callback = callback);
          payload = enqueueUpdate(inst, update, lane);
          null !== payload && (scheduleUpdateOnFiber(payload, inst, lane), entangleTransitions(payload, inst, lane));
        },
        enqueueForceUpdate: function(inst, callback) {
          inst = inst._reactInternals;
          var lane = requestUpdateLane(), update = createUpdate(lane);
          update.tag = 2;
          void 0 !== callback && null !== callback && (update.callback = callback);
          callback = enqueueUpdate(inst, update, lane);
          null !== callback && (scheduleUpdateOnFiber(callback, inst, lane), entangleTransitions(callback, inst, lane));
        }
      };
      function checkShouldComponentUpdate(workInProgress2, ctor, oldProps, newProps, oldState, newState, nextContext) {
        workInProgress2 = workInProgress2.stateNode;
        return "function" === typeof workInProgress2.shouldComponentUpdate ? workInProgress2.shouldComponentUpdate(newProps, newState, nextContext) : ctor.prototype && ctor.prototype.isPureReactComponent ? !shallowEqual(oldProps, newProps) || !shallowEqual(oldState, newState) : true;
      }
      function callComponentWillReceiveProps(workInProgress2, instance, newProps, nextContext) {
        workInProgress2 = instance.state;
        "function" === typeof instance.componentWillReceiveProps && instance.componentWillReceiveProps(newProps, nextContext);
        "function" === typeof instance.UNSAFE_componentWillReceiveProps && instance.UNSAFE_componentWillReceiveProps(newProps, nextContext);
        instance.state !== workInProgress2 && classComponentUpdater.enqueueReplaceState(instance, instance.state, null);
      }
      function resolveClassComponentProps(Component2, baseProps) {
        var newProps = baseProps;
        if ("ref" in baseProps) {
          newProps = {};
          for (var propName in baseProps)
            "ref" !== propName && (newProps[propName] = baseProps[propName]);
        }
        if (Component2 = Component2.defaultProps) {
          newProps === baseProps && (newProps = assign({}, newProps));
          for (var propName$73 in Component2)
            void 0 === newProps[propName$73] && (newProps[propName$73] = Component2[propName$73]);
        }
        return newProps;
      }
      function defaultOnUncaughtError(error) {
        reportGlobalError(error);
      }
      function defaultOnCaughtError(error) {
        console.error(error);
      }
      function defaultOnRecoverableError(error) {
        reportGlobalError(error);
      }
      function logUncaughtError(root2, errorInfo) {
        try {
          var onUncaughtError = root2.onUncaughtError;
          onUncaughtError(errorInfo.value, { componentStack: errorInfo.stack });
        } catch (e$74) {
          setTimeout(function() {
            throw e$74;
          });
        }
      }
      function logCaughtError(root2, boundary, errorInfo) {
        try {
          var onCaughtError = root2.onCaughtError;
          onCaughtError(errorInfo.value, {
            componentStack: errorInfo.stack,
            errorBoundary: 1 === boundary.tag ? boundary.stateNode : null
          });
        } catch (e$75) {
          setTimeout(function() {
            throw e$75;
          });
        }
      }
      function createRootErrorUpdate(root2, errorInfo, lane) {
        lane = createUpdate(lane);
        lane.tag = 3;
        lane.payload = { element: null };
        lane.callback = function() {
          logUncaughtError(root2, errorInfo);
        };
        return lane;
      }
      function createClassErrorUpdate(lane) {
        lane = createUpdate(lane);
        lane.tag = 3;
        return lane;
      }
      function initializeClassErrorUpdate(update, root2, fiber, errorInfo) {
        var getDerivedStateFromError = fiber.type.getDerivedStateFromError;
        if ("function" === typeof getDerivedStateFromError) {
          var error = errorInfo.value;
          update.payload = function() {
            return getDerivedStateFromError(error);
          };
          update.callback = function() {
            logCaughtError(root2, fiber, errorInfo);
          };
        }
        var inst = fiber.stateNode;
        null !== inst && "function" === typeof inst.componentDidCatch && (update.callback = function() {
          logCaughtError(root2, fiber, errorInfo);
          "function" !== typeof getDerivedStateFromError && (null === legacyErrorBoundariesThatAlreadyFailed ? legacyErrorBoundariesThatAlreadyFailed = /* @__PURE__ */ new Set([this]) : legacyErrorBoundariesThatAlreadyFailed.add(this));
          var stack = errorInfo.stack;
          this.componentDidCatch(errorInfo.value, {
            componentStack: null !== stack ? stack : ""
          });
        });
      }
      function throwException(root2, returnFiber, sourceFiber, value, rootRenderLanes) {
        sourceFiber.flags |= 32768;
        if (null !== value && "object" === typeof value && "function" === typeof value.then) {
          returnFiber = sourceFiber.alternate;
          null !== returnFiber && propagateParentContextChanges(
            returnFiber,
            sourceFiber,
            rootRenderLanes,
            true
          );
          sourceFiber = suspenseHandlerStackCursor.current;
          if (null !== sourceFiber) {
            switch (sourceFiber.tag) {
              case 31:
              case 13:
                return null === shellBoundary ? renderDidSuspendDelayIfPossible() : null === sourceFiber.alternate && 0 === workInProgressRootExitStatus && (workInProgressRootExitStatus = 3), sourceFiber.flags &= -257, sourceFiber.flags |= 65536, sourceFiber.lanes = rootRenderLanes, value === noopSuspenseyCommitThenable ? sourceFiber.flags |= 16384 : (returnFiber = sourceFiber.updateQueue, null === returnFiber ? sourceFiber.updateQueue = /* @__PURE__ */ new Set([value]) : returnFiber.add(value), attachPingListener(root2, value, rootRenderLanes)), false;
              case 22:
                return sourceFiber.flags |= 65536, value === noopSuspenseyCommitThenable ? sourceFiber.flags |= 16384 : (returnFiber = sourceFiber.updateQueue, null === returnFiber ? (returnFiber = {
                  transitions: null,
                  markerInstances: null,
                  retryQueue: /* @__PURE__ */ new Set([value])
                }, sourceFiber.updateQueue = returnFiber) : (sourceFiber = returnFiber.retryQueue, null === sourceFiber ? returnFiber.retryQueue = /* @__PURE__ */ new Set([value]) : sourceFiber.add(value)), attachPingListener(root2, value, rootRenderLanes)), false;
            }
            throw Error(formatProdErrorMessage(435, sourceFiber.tag));
          }
          attachPingListener(root2, value, rootRenderLanes);
          renderDidSuspendDelayIfPossible();
          return false;
        }
        if (isHydrating)
          return returnFiber = suspenseHandlerStackCursor.current, null !== returnFiber ? (0 === (returnFiber.flags & 65536) && (returnFiber.flags |= 256), returnFiber.flags |= 65536, returnFiber.lanes = rootRenderLanes, value !== HydrationMismatchException && (root2 = Error(formatProdErrorMessage(422), { cause: value }), queueHydrationError(createCapturedValueAtFiber(root2, sourceFiber)))) : (value !== HydrationMismatchException && (returnFiber = Error(formatProdErrorMessage(423), {
            cause: value
          }), queueHydrationError(
            createCapturedValueAtFiber(returnFiber, sourceFiber)
          )), root2 = root2.current.alternate, root2.flags |= 65536, rootRenderLanes &= -rootRenderLanes, root2.lanes |= rootRenderLanes, value = createCapturedValueAtFiber(value, sourceFiber), rootRenderLanes = createRootErrorUpdate(
            root2.stateNode,
            value,
            rootRenderLanes
          ), enqueueCapturedUpdate(root2, rootRenderLanes), 4 !== workInProgressRootExitStatus && (workInProgressRootExitStatus = 2)), false;
        var wrapperError = Error(formatProdErrorMessage(520), { cause: value });
        wrapperError = createCapturedValueAtFiber(wrapperError, sourceFiber);
        null === workInProgressRootConcurrentErrors ? workInProgressRootConcurrentErrors = [wrapperError] : workInProgressRootConcurrentErrors.push(wrapperError);
        4 !== workInProgressRootExitStatus && (workInProgressRootExitStatus = 2);
        if (null === returnFiber) return true;
        value = createCapturedValueAtFiber(value, sourceFiber);
        sourceFiber = returnFiber;
        do {
          switch (sourceFiber.tag) {
            case 3:
              return sourceFiber.flags |= 65536, root2 = rootRenderLanes & -rootRenderLanes, sourceFiber.lanes |= root2, root2 = createRootErrorUpdate(sourceFiber.stateNode, value, root2), enqueueCapturedUpdate(sourceFiber, root2), false;
            case 1:
              if (returnFiber = sourceFiber.type, wrapperError = sourceFiber.stateNode, 0 === (sourceFiber.flags & 128) && ("function" === typeof returnFiber.getDerivedStateFromError || null !== wrapperError && "function" === typeof wrapperError.componentDidCatch && (null === legacyErrorBoundariesThatAlreadyFailed || !legacyErrorBoundariesThatAlreadyFailed.has(wrapperError))))
                return sourceFiber.flags |= 65536, rootRenderLanes &= -rootRenderLanes, sourceFiber.lanes |= rootRenderLanes, rootRenderLanes = createClassErrorUpdate(rootRenderLanes), initializeClassErrorUpdate(
                  rootRenderLanes,
                  root2,
                  sourceFiber,
                  value
                ), enqueueCapturedUpdate(sourceFiber, rootRenderLanes), false;
          }
          sourceFiber = sourceFiber.return;
        } while (null !== sourceFiber);
        return false;
      }
      var SelectiveHydrationException = Error(formatProdErrorMessage(461));
      var didReceiveUpdate = false;
      function reconcileChildren(current, workInProgress2, nextChildren, renderLanes2) {
        workInProgress2.child = null === current ? mountChildFibers(workInProgress2, null, nextChildren, renderLanes2) : reconcileChildFibers(
          workInProgress2,
          current.child,
          nextChildren,
          renderLanes2
        );
      }
      function updateForwardRef(current, workInProgress2, Component2, nextProps, renderLanes2) {
        Component2 = Component2.render;
        var ref = workInProgress2.ref;
        if ("ref" in nextProps) {
          var propsWithoutRef = {};
          for (var key in nextProps)
            "ref" !== key && (propsWithoutRef[key] = nextProps[key]);
        } else propsWithoutRef = nextProps;
        prepareToReadContext(workInProgress2);
        nextProps = renderWithHooks(
          current,
          workInProgress2,
          Component2,
          propsWithoutRef,
          ref,
          renderLanes2
        );
        key = checkDidRenderIdHook();
        if (null !== current && !didReceiveUpdate)
          return bailoutHooks(current, workInProgress2, renderLanes2), bailoutOnAlreadyFinishedWork(current, workInProgress2, renderLanes2);
        isHydrating && key && pushMaterializedTreeId(workInProgress2);
        workInProgress2.flags |= 1;
        reconcileChildren(current, workInProgress2, nextProps, renderLanes2);
        return workInProgress2.child;
      }
      function updateMemoComponent(current, workInProgress2, Component2, nextProps, renderLanes2) {
        if (null === current) {
          var type = Component2.type;
          if ("function" === typeof type && !shouldConstruct(type) && void 0 === type.defaultProps && null === Component2.compare)
            return workInProgress2.tag = 15, workInProgress2.type = type, updateSimpleMemoComponent(
              current,
              workInProgress2,
              type,
              nextProps,
              renderLanes2
            );
          current = createFiberFromTypeAndProps(
            Component2.type,
            null,
            nextProps,
            workInProgress2,
            workInProgress2.mode,
            renderLanes2
          );
          current.ref = workInProgress2.ref;
          current.return = workInProgress2;
          return workInProgress2.child = current;
        }
        type = current.child;
        if (!checkScheduledUpdateOrContext(current, renderLanes2)) {
          var prevProps = type.memoizedProps;
          Component2 = Component2.compare;
          Component2 = null !== Component2 ? Component2 : shallowEqual;
          if (Component2(prevProps, nextProps) && current.ref === workInProgress2.ref)
            return bailoutOnAlreadyFinishedWork(current, workInProgress2, renderLanes2);
        }
        workInProgress2.flags |= 1;
        current = createWorkInProgress(type, nextProps);
        current.ref = workInProgress2.ref;
        current.return = workInProgress2;
        return workInProgress2.child = current;
      }
      function updateSimpleMemoComponent(current, workInProgress2, Component2, nextProps, renderLanes2) {
        if (null !== current) {
          var prevProps = current.memoizedProps;
          if (shallowEqual(prevProps, nextProps) && current.ref === workInProgress2.ref)
            if (didReceiveUpdate = false, workInProgress2.pendingProps = nextProps = prevProps, checkScheduledUpdateOrContext(current, renderLanes2))
              0 !== (current.flags & 131072) && (didReceiveUpdate = true);
            else
              return workInProgress2.lanes = current.lanes, bailoutOnAlreadyFinishedWork(current, workInProgress2, renderLanes2);
        }
        return updateFunctionComponent(
          current,
          workInProgress2,
          Component2,
          nextProps,
          renderLanes2
        );
      }
      function updateOffscreenComponent(current, workInProgress2, renderLanes2, nextProps) {
        var nextChildren = nextProps.children, prevState = null !== current ? current.memoizedState : null;
        null === current && null === workInProgress2.stateNode && (workInProgress2.stateNode = {
          _visibility: 1,
          _pendingMarkers: null,
          _retryCache: null,
          _transitions: null
        });
        if ("hidden" === nextProps.mode) {
          if (0 !== (workInProgress2.flags & 128)) {
            prevState = null !== prevState ? prevState.baseLanes | renderLanes2 : renderLanes2;
            if (null !== current) {
              nextProps = workInProgress2.child = current.child;
              for (nextChildren = 0; null !== nextProps; )
                nextChildren = nextChildren | nextProps.lanes | nextProps.childLanes, nextProps = nextProps.sibling;
              nextProps = nextChildren & ~prevState;
            } else nextProps = 0, workInProgress2.child = null;
            return deferHiddenOffscreenComponent(
              current,
              workInProgress2,
              prevState,
              renderLanes2,
              nextProps
            );
          }
          if (0 !== (renderLanes2 & 536870912))
            workInProgress2.memoizedState = { baseLanes: 0, cachePool: null }, null !== current && pushTransition(
              workInProgress2,
              null !== prevState ? prevState.cachePool : null
            ), null !== prevState ? pushHiddenContext(workInProgress2, prevState) : reuseHiddenContextOnStack(), pushOffscreenSuspenseHandler(workInProgress2);
          else
            return nextProps = workInProgress2.lanes = 536870912, deferHiddenOffscreenComponent(
              current,
              workInProgress2,
              null !== prevState ? prevState.baseLanes | renderLanes2 : renderLanes2,
              renderLanes2,
              nextProps
            );
        } else
          null !== prevState ? (pushTransition(workInProgress2, prevState.cachePool), pushHiddenContext(workInProgress2, prevState), reuseSuspenseHandlerOnStack(workInProgress2), workInProgress2.memoizedState = null) : (null !== current && pushTransition(workInProgress2, null), reuseHiddenContextOnStack(), reuseSuspenseHandlerOnStack(workInProgress2));
        reconcileChildren(current, workInProgress2, nextChildren, renderLanes2);
        return workInProgress2.child;
      }
      function bailoutOffscreenComponent(current, workInProgress2) {
        null !== current && 22 === current.tag || null !== workInProgress2.stateNode || (workInProgress2.stateNode = {
          _visibility: 1,
          _pendingMarkers: null,
          _retryCache: null,
          _transitions: null
        });
        return workInProgress2.sibling;
      }
      function deferHiddenOffscreenComponent(current, workInProgress2, nextBaseLanes, renderLanes2, remainingChildLanes) {
        var JSCompiler_inline_result = peekCacheFromPool();
        JSCompiler_inline_result = null === JSCompiler_inline_result ? null : { parent: CacheContext._currentValue, pool: JSCompiler_inline_result };
        workInProgress2.memoizedState = {
          baseLanes: nextBaseLanes,
          cachePool: JSCompiler_inline_result
        };
        null !== current && pushTransition(workInProgress2, null);
        reuseHiddenContextOnStack();
        pushOffscreenSuspenseHandler(workInProgress2);
        null !== current && propagateParentContextChanges(current, workInProgress2, renderLanes2, true);
        workInProgress2.childLanes = remainingChildLanes;
        return null;
      }
      function mountActivityChildren(workInProgress2, nextProps) {
        nextProps = mountWorkInProgressOffscreenFiber(
          { mode: nextProps.mode, children: nextProps.children },
          workInProgress2.mode
        );
        nextProps.ref = workInProgress2.ref;
        workInProgress2.child = nextProps;
        nextProps.return = workInProgress2;
        return nextProps;
      }
      function retryActivityComponentWithoutHydrating(current, workInProgress2, renderLanes2) {
        reconcileChildFibers(workInProgress2, current.child, null, renderLanes2);
        current = mountActivityChildren(workInProgress2, workInProgress2.pendingProps);
        current.flags |= 2;
        popSuspenseHandler(workInProgress2);
        workInProgress2.memoizedState = null;
        return current;
      }
      function updateActivityComponent(current, workInProgress2, renderLanes2) {
        var nextProps = workInProgress2.pendingProps, didSuspend = 0 !== (workInProgress2.flags & 128);
        workInProgress2.flags &= -129;
        if (null === current) {
          if (isHydrating) {
            if ("hidden" === nextProps.mode)
              return current = mountActivityChildren(workInProgress2, nextProps), workInProgress2.lanes = 536870912, bailoutOffscreenComponent(null, current);
            pushDehydratedActivitySuspenseHandler(workInProgress2);
            (current = nextHydratableInstance) ? (current = canHydrateHydrationBoundary(
              current,
              rootOrSingletonContext
            ), current = null !== current && "&" === current.data ? current : null, null !== current && (workInProgress2.memoizedState = {
              dehydrated: current,
              treeContext: null !== treeContextProvider ? { id: treeContextId, overflow: treeContextOverflow } : null,
              retryLane: 536870912,
              hydrationErrors: null
            }, renderLanes2 = createFiberFromDehydratedFragment(current), renderLanes2.return = workInProgress2, workInProgress2.child = renderLanes2, hydrationParentFiber = workInProgress2, nextHydratableInstance = null)) : current = null;
            if (null === current) throw throwOnHydrationMismatch(workInProgress2);
            workInProgress2.lanes = 536870912;
            return null;
          }
          return mountActivityChildren(workInProgress2, nextProps);
        }
        var prevState = current.memoizedState;
        if (null !== prevState) {
          var dehydrated = prevState.dehydrated;
          pushDehydratedActivitySuspenseHandler(workInProgress2);
          if (didSuspend)
            if (workInProgress2.flags & 256)
              workInProgress2.flags &= -257, workInProgress2 = retryActivityComponentWithoutHydrating(
                current,
                workInProgress2,
                renderLanes2
              );
            else if (null !== workInProgress2.memoizedState)
              workInProgress2.child = current.child, workInProgress2.flags |= 128, workInProgress2 = null;
            else throw Error(formatProdErrorMessage(558));
          else if (didReceiveUpdate || propagateParentContextChanges(current, workInProgress2, renderLanes2, false), didSuspend = 0 !== (renderLanes2 & current.childLanes), didReceiveUpdate || didSuspend) {
            nextProps = workInProgressRoot;
            if (null !== nextProps && (dehydrated = getBumpedLaneForHydration(nextProps, renderLanes2), 0 !== dehydrated && dehydrated !== prevState.retryLane))
              throw prevState.retryLane = dehydrated, enqueueConcurrentRenderForLane(current, dehydrated), scheduleUpdateOnFiber(nextProps, current, dehydrated), SelectiveHydrationException;
            renderDidSuspendDelayIfPossible();
            workInProgress2 = retryActivityComponentWithoutHydrating(
              current,
              workInProgress2,
              renderLanes2
            );
          } else
            current = prevState.treeContext, nextHydratableInstance = getNextHydratable(dehydrated.nextSibling), hydrationParentFiber = workInProgress2, isHydrating = true, hydrationErrors = null, rootOrSingletonContext = false, null !== current && restoreSuspendedTreeContext(workInProgress2, current), workInProgress2 = mountActivityChildren(workInProgress2, nextProps), workInProgress2.flags |= 4096;
          return workInProgress2;
        }
        current = createWorkInProgress(current.child, {
          mode: nextProps.mode,
          children: nextProps.children
        });
        current.ref = workInProgress2.ref;
        workInProgress2.child = current;
        current.return = workInProgress2;
        return current;
      }
      function markRef(current, workInProgress2) {
        var ref = workInProgress2.ref;
        if (null === ref)
          null !== current && null !== current.ref && (workInProgress2.flags |= 4194816);
        else {
          if ("function" !== typeof ref && "object" !== typeof ref)
            throw Error(formatProdErrorMessage(284));
          if (null === current || current.ref !== ref)
            workInProgress2.flags |= 4194816;
        }
      }
      function updateFunctionComponent(current, workInProgress2, Component2, nextProps, renderLanes2) {
        prepareToReadContext(workInProgress2);
        Component2 = renderWithHooks(
          current,
          workInProgress2,
          Component2,
          nextProps,
          void 0,
          renderLanes2
        );
        nextProps = checkDidRenderIdHook();
        if (null !== current && !didReceiveUpdate)
          return bailoutHooks(current, workInProgress2, renderLanes2), bailoutOnAlreadyFinishedWork(current, workInProgress2, renderLanes2);
        isHydrating && nextProps && pushMaterializedTreeId(workInProgress2);
        workInProgress2.flags |= 1;
        reconcileChildren(current, workInProgress2, Component2, renderLanes2);
        return workInProgress2.child;
      }
      function replayFunctionComponent(current, workInProgress2, nextProps, Component2, secondArg, renderLanes2) {
        prepareToReadContext(workInProgress2);
        workInProgress2.updateQueue = null;
        nextProps = renderWithHooksAgain(
          workInProgress2,
          Component2,
          nextProps,
          secondArg
        );
        finishRenderingHooks(current);
        Component2 = checkDidRenderIdHook();
        if (null !== current && !didReceiveUpdate)
          return bailoutHooks(current, workInProgress2, renderLanes2), bailoutOnAlreadyFinishedWork(current, workInProgress2, renderLanes2);
        isHydrating && Component2 && pushMaterializedTreeId(workInProgress2);
        workInProgress2.flags |= 1;
        reconcileChildren(current, workInProgress2, nextProps, renderLanes2);
        return workInProgress2.child;
      }
      function updateClassComponent(current, workInProgress2, Component2, nextProps, renderLanes2) {
        prepareToReadContext(workInProgress2);
        if (null === workInProgress2.stateNode) {
          var context = emptyContextObject, contextType = Component2.contextType;
          "object" === typeof contextType && null !== contextType && (context = readContext(contextType));
          context = new Component2(nextProps, context);
          workInProgress2.memoizedState = null !== context.state && void 0 !== context.state ? context.state : null;
          context.updater = classComponentUpdater;
          workInProgress2.stateNode = context;
          context._reactInternals = workInProgress2;
          context = workInProgress2.stateNode;
          context.props = nextProps;
          context.state = workInProgress2.memoizedState;
          context.refs = {};
          initializeUpdateQueue(workInProgress2);
          contextType = Component2.contextType;
          context.context = "object" === typeof contextType && null !== contextType ? readContext(contextType) : emptyContextObject;
          context.state = workInProgress2.memoizedState;
          contextType = Component2.getDerivedStateFromProps;
          "function" === typeof contextType && (applyDerivedStateFromProps(
            workInProgress2,
            Component2,
            contextType,
            nextProps
          ), context.state = workInProgress2.memoizedState);
          "function" === typeof Component2.getDerivedStateFromProps || "function" === typeof context.getSnapshotBeforeUpdate || "function" !== typeof context.UNSAFE_componentWillMount && "function" !== typeof context.componentWillMount || (contextType = context.state, "function" === typeof context.componentWillMount && context.componentWillMount(), "function" === typeof context.UNSAFE_componentWillMount && context.UNSAFE_componentWillMount(), contextType !== context.state && classComponentUpdater.enqueueReplaceState(context, context.state, null), processUpdateQueue(workInProgress2, nextProps, context, renderLanes2), suspendIfUpdateReadFromEntangledAsyncAction(), context.state = workInProgress2.memoizedState);
          "function" === typeof context.componentDidMount && (workInProgress2.flags |= 4194308);
          nextProps = true;
        } else if (null === current) {
          context = workInProgress2.stateNode;
          var unresolvedOldProps = workInProgress2.memoizedProps, oldProps = resolveClassComponentProps(Component2, unresolvedOldProps);
          context.props = oldProps;
          var oldContext = context.context, contextType$jscomp$0 = Component2.contextType;
          contextType = emptyContextObject;
          "object" === typeof contextType$jscomp$0 && null !== contextType$jscomp$0 && (contextType = readContext(contextType$jscomp$0));
          var getDerivedStateFromProps = Component2.getDerivedStateFromProps;
          contextType$jscomp$0 = "function" === typeof getDerivedStateFromProps || "function" === typeof context.getSnapshotBeforeUpdate;
          unresolvedOldProps = workInProgress2.pendingProps !== unresolvedOldProps;
          contextType$jscomp$0 || "function" !== typeof context.UNSAFE_componentWillReceiveProps && "function" !== typeof context.componentWillReceiveProps || (unresolvedOldProps || oldContext !== contextType) && callComponentWillReceiveProps(
            workInProgress2,
            context,
            nextProps,
            contextType
          );
          hasForceUpdate = false;
          var oldState = workInProgress2.memoizedState;
          context.state = oldState;
          processUpdateQueue(workInProgress2, nextProps, context, renderLanes2);
          suspendIfUpdateReadFromEntangledAsyncAction();
          oldContext = workInProgress2.memoizedState;
          unresolvedOldProps || oldState !== oldContext || hasForceUpdate ? ("function" === typeof getDerivedStateFromProps && (applyDerivedStateFromProps(
            workInProgress2,
            Component2,
            getDerivedStateFromProps,
            nextProps
          ), oldContext = workInProgress2.memoizedState), (oldProps = hasForceUpdate || checkShouldComponentUpdate(
            workInProgress2,
            Component2,
            oldProps,
            nextProps,
            oldState,
            oldContext,
            contextType
          )) ? (contextType$jscomp$0 || "function" !== typeof context.UNSAFE_componentWillMount && "function" !== typeof context.componentWillMount || ("function" === typeof context.componentWillMount && context.componentWillMount(), "function" === typeof context.UNSAFE_componentWillMount && context.UNSAFE_componentWillMount()), "function" === typeof context.componentDidMount && (workInProgress2.flags |= 4194308)) : ("function" === typeof context.componentDidMount && (workInProgress2.flags |= 4194308), workInProgress2.memoizedProps = nextProps, workInProgress2.memoizedState = oldContext), context.props = nextProps, context.state = oldContext, context.context = contextType, nextProps = oldProps) : ("function" === typeof context.componentDidMount && (workInProgress2.flags |= 4194308), nextProps = false);
        } else {
          context = workInProgress2.stateNode;
          cloneUpdateQueue(current, workInProgress2);
          contextType = workInProgress2.memoizedProps;
          contextType$jscomp$0 = resolveClassComponentProps(Component2, contextType);
          context.props = contextType$jscomp$0;
          getDerivedStateFromProps = workInProgress2.pendingProps;
          oldState = context.context;
          oldContext = Component2.contextType;
          oldProps = emptyContextObject;
          "object" === typeof oldContext && null !== oldContext && (oldProps = readContext(oldContext));
          unresolvedOldProps = Component2.getDerivedStateFromProps;
          (oldContext = "function" === typeof unresolvedOldProps || "function" === typeof context.getSnapshotBeforeUpdate) || "function" !== typeof context.UNSAFE_componentWillReceiveProps && "function" !== typeof context.componentWillReceiveProps || (contextType !== getDerivedStateFromProps || oldState !== oldProps) && callComponentWillReceiveProps(
            workInProgress2,
            context,
            nextProps,
            oldProps
          );
          hasForceUpdate = false;
          oldState = workInProgress2.memoizedState;
          context.state = oldState;
          processUpdateQueue(workInProgress2, nextProps, context, renderLanes2);
          suspendIfUpdateReadFromEntangledAsyncAction();
          var newState = workInProgress2.memoizedState;
          contextType !== getDerivedStateFromProps || oldState !== newState || hasForceUpdate || null !== current && null !== current.dependencies && checkIfContextChanged(current.dependencies) ? ("function" === typeof unresolvedOldProps && (applyDerivedStateFromProps(
            workInProgress2,
            Component2,
            unresolvedOldProps,
            nextProps
          ), newState = workInProgress2.memoizedState), (contextType$jscomp$0 = hasForceUpdate || checkShouldComponentUpdate(
            workInProgress2,
            Component2,
            contextType$jscomp$0,
            nextProps,
            oldState,
            newState,
            oldProps
          ) || null !== current && null !== current.dependencies && checkIfContextChanged(current.dependencies)) ? (oldContext || "function" !== typeof context.UNSAFE_componentWillUpdate && "function" !== typeof context.componentWillUpdate || ("function" === typeof context.componentWillUpdate && context.componentWillUpdate(nextProps, newState, oldProps), "function" === typeof context.UNSAFE_componentWillUpdate && context.UNSAFE_componentWillUpdate(
            nextProps,
            newState,
            oldProps
          )), "function" === typeof context.componentDidUpdate && (workInProgress2.flags |= 4), "function" === typeof context.getSnapshotBeforeUpdate && (workInProgress2.flags |= 1024)) : ("function" !== typeof context.componentDidUpdate || contextType === current.memoizedProps && oldState === current.memoizedState || (workInProgress2.flags |= 4), "function" !== typeof context.getSnapshotBeforeUpdate || contextType === current.memoizedProps && oldState === current.memoizedState || (workInProgress2.flags |= 1024), workInProgress2.memoizedProps = nextProps, workInProgress2.memoizedState = newState), context.props = nextProps, context.state = newState, context.context = oldProps, nextProps = contextType$jscomp$0) : ("function" !== typeof context.componentDidUpdate || contextType === current.memoizedProps && oldState === current.memoizedState || (workInProgress2.flags |= 4), "function" !== typeof context.getSnapshotBeforeUpdate || contextType === current.memoizedProps && oldState === current.memoizedState || (workInProgress2.flags |= 1024), nextProps = false);
        }
        context = nextProps;
        markRef(current, workInProgress2);
        nextProps = 0 !== (workInProgress2.flags & 128);
        context || nextProps ? (context = workInProgress2.stateNode, Component2 = nextProps && "function" !== typeof Component2.getDerivedStateFromError ? null : context.render(), workInProgress2.flags |= 1, null !== current && nextProps ? (workInProgress2.child = reconcileChildFibers(
          workInProgress2,
          current.child,
          null,
          renderLanes2
        ), workInProgress2.child = reconcileChildFibers(
          workInProgress2,
          null,
          Component2,
          renderLanes2
        )) : reconcileChildren(current, workInProgress2, Component2, renderLanes2), workInProgress2.memoizedState = context.state, current = workInProgress2.child) : current = bailoutOnAlreadyFinishedWork(
          current,
          workInProgress2,
          renderLanes2
        );
        return current;
      }
      function mountHostRootWithoutHydrating(current, workInProgress2, nextChildren, renderLanes2) {
        resetHydrationState();
        workInProgress2.flags |= 256;
        reconcileChildren(current, workInProgress2, nextChildren, renderLanes2);
        return workInProgress2.child;
      }
      var SUSPENDED_MARKER = {
        dehydrated: null,
        treeContext: null,
        retryLane: 0,
        hydrationErrors: null
      };
      function mountSuspenseOffscreenState(renderLanes2) {
        return { baseLanes: renderLanes2, cachePool: getSuspendedCache() };
      }
      function getRemainingWorkInPrimaryTree(current, primaryTreeDidDefer, renderLanes2) {
        current = null !== current ? current.childLanes & ~renderLanes2 : 0;
        primaryTreeDidDefer && (current |= workInProgressDeferredLane);
        return current;
      }
      function updateSuspenseComponent(current, workInProgress2, renderLanes2) {
        var nextProps = workInProgress2.pendingProps, showFallback = false, didSuspend = 0 !== (workInProgress2.flags & 128), JSCompiler_temp;
        (JSCompiler_temp = didSuspend) || (JSCompiler_temp = null !== current && null === current.memoizedState ? false : 0 !== (suspenseStackCursor.current & 2));
        JSCompiler_temp && (showFallback = true, workInProgress2.flags &= -129);
        JSCompiler_temp = 0 !== (workInProgress2.flags & 32);
        workInProgress2.flags &= -33;
        if (null === current) {
          if (isHydrating) {
            showFallback ? pushPrimaryTreeSuspenseHandler(workInProgress2) : reuseSuspenseHandlerOnStack(workInProgress2);
            (current = nextHydratableInstance) ? (current = canHydrateHydrationBoundary(
              current,
              rootOrSingletonContext
            ), current = null !== current && "&" !== current.data ? current : null, null !== current && (workInProgress2.memoizedState = {
              dehydrated: current,
              treeContext: null !== treeContextProvider ? { id: treeContextId, overflow: treeContextOverflow } : null,
              retryLane: 536870912,
              hydrationErrors: null
            }, renderLanes2 = createFiberFromDehydratedFragment(current), renderLanes2.return = workInProgress2, workInProgress2.child = renderLanes2, hydrationParentFiber = workInProgress2, nextHydratableInstance = null)) : current = null;
            if (null === current) throw throwOnHydrationMismatch(workInProgress2);
            isSuspenseInstanceFallback(current) ? workInProgress2.lanes = 32 : workInProgress2.lanes = 536870912;
            return null;
          }
          var nextPrimaryChildren = nextProps.children;
          nextProps = nextProps.fallback;
          if (showFallback)
            return reuseSuspenseHandlerOnStack(workInProgress2), showFallback = workInProgress2.mode, nextPrimaryChildren = mountWorkInProgressOffscreenFiber(
              { mode: "hidden", children: nextPrimaryChildren },
              showFallback
            ), nextProps = createFiberFromFragment(
              nextProps,
              showFallback,
              renderLanes2,
              null
            ), nextPrimaryChildren.return = workInProgress2, nextProps.return = workInProgress2, nextPrimaryChildren.sibling = nextProps, workInProgress2.child = nextPrimaryChildren, nextProps = workInProgress2.child, nextProps.memoizedState = mountSuspenseOffscreenState(renderLanes2), nextProps.childLanes = getRemainingWorkInPrimaryTree(
              current,
              JSCompiler_temp,
              renderLanes2
            ), workInProgress2.memoizedState = SUSPENDED_MARKER, bailoutOffscreenComponent(null, nextProps);
          pushPrimaryTreeSuspenseHandler(workInProgress2);
          return mountSuspensePrimaryChildren(workInProgress2, nextPrimaryChildren);
        }
        var prevState = current.memoizedState;
        if (null !== prevState && (nextPrimaryChildren = prevState.dehydrated, null !== nextPrimaryChildren)) {
          if (didSuspend)
            workInProgress2.flags & 256 ? (pushPrimaryTreeSuspenseHandler(workInProgress2), workInProgress2.flags &= -257, workInProgress2 = retrySuspenseComponentWithoutHydrating(
              current,
              workInProgress2,
              renderLanes2
            )) : null !== workInProgress2.memoizedState ? (reuseSuspenseHandlerOnStack(workInProgress2), workInProgress2.child = current.child, workInProgress2.flags |= 128, workInProgress2 = null) : (reuseSuspenseHandlerOnStack(workInProgress2), nextPrimaryChildren = nextProps.fallback, showFallback = workInProgress2.mode, nextProps = mountWorkInProgressOffscreenFiber(
              { mode: "visible", children: nextProps.children },
              showFallback
            ), nextPrimaryChildren = createFiberFromFragment(
              nextPrimaryChildren,
              showFallback,
              renderLanes2,
              null
            ), nextPrimaryChildren.flags |= 2, nextProps.return = workInProgress2, nextPrimaryChildren.return = workInProgress2, nextProps.sibling = nextPrimaryChildren, workInProgress2.child = nextProps, reconcileChildFibers(
              workInProgress2,
              current.child,
              null,
              renderLanes2
            ), nextProps = workInProgress2.child, nextProps.memoizedState = mountSuspenseOffscreenState(renderLanes2), nextProps.childLanes = getRemainingWorkInPrimaryTree(
              current,
              JSCompiler_temp,
              renderLanes2
            ), workInProgress2.memoizedState = SUSPENDED_MARKER, workInProgress2 = bailoutOffscreenComponent(null, nextProps));
          else if (pushPrimaryTreeSuspenseHandler(workInProgress2), isSuspenseInstanceFallback(nextPrimaryChildren)) {
            JSCompiler_temp = nextPrimaryChildren.nextSibling && nextPrimaryChildren.nextSibling.dataset;
            if (JSCompiler_temp) var digest = JSCompiler_temp.dgst;
            JSCompiler_temp = digest;
            nextProps = Error(formatProdErrorMessage(419));
            nextProps.stack = "";
            nextProps.digest = JSCompiler_temp;
            queueHydrationError({ value: nextProps, source: null, stack: null });
            workInProgress2 = retrySuspenseComponentWithoutHydrating(
              current,
              workInProgress2,
              renderLanes2
            );
          } else if (didReceiveUpdate || propagateParentContextChanges(current, workInProgress2, renderLanes2, false), JSCompiler_temp = 0 !== (renderLanes2 & current.childLanes), didReceiveUpdate || JSCompiler_temp) {
            JSCompiler_temp = workInProgressRoot;
            if (null !== JSCompiler_temp && (nextProps = getBumpedLaneForHydration(JSCompiler_temp, renderLanes2), 0 !== nextProps && nextProps !== prevState.retryLane))
              throw prevState.retryLane = nextProps, enqueueConcurrentRenderForLane(current, nextProps), scheduleUpdateOnFiber(JSCompiler_temp, current, nextProps), SelectiveHydrationException;
            isSuspenseInstancePending(nextPrimaryChildren) || renderDidSuspendDelayIfPossible();
            workInProgress2 = retrySuspenseComponentWithoutHydrating(
              current,
              workInProgress2,
              renderLanes2
            );
          } else
            isSuspenseInstancePending(nextPrimaryChildren) ? (workInProgress2.flags |= 192, workInProgress2.child = current.child, workInProgress2 = null) : (current = prevState.treeContext, nextHydratableInstance = getNextHydratable(
              nextPrimaryChildren.nextSibling
            ), hydrationParentFiber = workInProgress2, isHydrating = true, hydrationErrors = null, rootOrSingletonContext = false, null !== current && restoreSuspendedTreeContext(workInProgress2, current), workInProgress2 = mountSuspensePrimaryChildren(
              workInProgress2,
              nextProps.children
            ), workInProgress2.flags |= 4096);
          return workInProgress2;
        }
        if (showFallback)
          return reuseSuspenseHandlerOnStack(workInProgress2), nextPrimaryChildren = nextProps.fallback, showFallback = workInProgress2.mode, prevState = current.child, digest = prevState.sibling, nextProps = createWorkInProgress(prevState, {
            mode: "hidden",
            children: nextProps.children
          }), nextProps.subtreeFlags = prevState.subtreeFlags & 65011712, null !== digest ? nextPrimaryChildren = createWorkInProgress(
            digest,
            nextPrimaryChildren
          ) : (nextPrimaryChildren = createFiberFromFragment(
            nextPrimaryChildren,
            showFallback,
            renderLanes2,
            null
          ), nextPrimaryChildren.flags |= 2), nextPrimaryChildren.return = workInProgress2, nextProps.return = workInProgress2, nextProps.sibling = nextPrimaryChildren, workInProgress2.child = nextProps, bailoutOffscreenComponent(null, nextProps), nextProps = workInProgress2.child, nextPrimaryChildren = current.child.memoizedState, null === nextPrimaryChildren ? nextPrimaryChildren = mountSuspenseOffscreenState(renderLanes2) : (showFallback = nextPrimaryChildren.cachePool, null !== showFallback ? (prevState = CacheContext._currentValue, showFallback = showFallback.parent !== prevState ? { parent: prevState, pool: prevState } : showFallback) : showFallback = getSuspendedCache(), nextPrimaryChildren = {
            baseLanes: nextPrimaryChildren.baseLanes | renderLanes2,
            cachePool: showFallback
          }), nextProps.memoizedState = nextPrimaryChildren, nextProps.childLanes = getRemainingWorkInPrimaryTree(
            current,
            JSCompiler_temp,
            renderLanes2
          ), workInProgress2.memoizedState = SUSPENDED_MARKER, bailoutOffscreenComponent(current.child, nextProps);
        pushPrimaryTreeSuspenseHandler(workInProgress2);
        renderLanes2 = current.child;
        current = renderLanes2.sibling;
        renderLanes2 = createWorkInProgress(renderLanes2, {
          mode: "visible",
          children: nextProps.children
        });
        renderLanes2.return = workInProgress2;
        renderLanes2.sibling = null;
        null !== current && (JSCompiler_temp = workInProgress2.deletions, null === JSCompiler_temp ? (workInProgress2.deletions = [current], workInProgress2.flags |= 16) : JSCompiler_temp.push(current));
        workInProgress2.child = renderLanes2;
        workInProgress2.memoizedState = null;
        return renderLanes2;
      }
      function mountSuspensePrimaryChildren(workInProgress2, primaryChildren) {
        primaryChildren = mountWorkInProgressOffscreenFiber(
          { mode: "visible", children: primaryChildren },
          workInProgress2.mode
        );
        primaryChildren.return = workInProgress2;
        return workInProgress2.child = primaryChildren;
      }
      function mountWorkInProgressOffscreenFiber(offscreenProps, mode) {
        offscreenProps = createFiberImplClass(22, offscreenProps, null, mode);
        offscreenProps.lanes = 0;
        return offscreenProps;
      }
      function retrySuspenseComponentWithoutHydrating(current, workInProgress2, renderLanes2) {
        reconcileChildFibers(workInProgress2, current.child, null, renderLanes2);
        current = mountSuspensePrimaryChildren(
          workInProgress2,
          workInProgress2.pendingProps.children
        );
        current.flags |= 2;
        workInProgress2.memoizedState = null;
        return current;
      }
      function scheduleSuspenseWorkOnFiber(fiber, renderLanes2, propagationRoot) {
        fiber.lanes |= renderLanes2;
        var alternate = fiber.alternate;
        null !== alternate && (alternate.lanes |= renderLanes2);
        scheduleContextWorkOnParentPath(fiber.return, renderLanes2, propagationRoot);
      }
      function initSuspenseListRenderState(workInProgress2, isBackwards, tail, lastContentRow, tailMode, treeForkCount2) {
        var renderState = workInProgress2.memoizedState;
        null === renderState ? workInProgress2.memoizedState = {
          isBackwards,
          rendering: null,
          renderingStartTime: 0,
          last: lastContentRow,
          tail,
          tailMode,
          treeForkCount: treeForkCount2
        } : (renderState.isBackwards = isBackwards, renderState.rendering = null, renderState.renderingStartTime = 0, renderState.last = lastContentRow, renderState.tail = tail, renderState.tailMode = tailMode, renderState.treeForkCount = treeForkCount2);
      }
      function updateSuspenseListComponent(current, workInProgress2, renderLanes2) {
        var nextProps = workInProgress2.pendingProps, revealOrder = nextProps.revealOrder, tailMode = nextProps.tail;
        nextProps = nextProps.children;
        var suspenseContext = suspenseStackCursor.current, shouldForceFallback = 0 !== (suspenseContext & 2);
        shouldForceFallback ? (suspenseContext = suspenseContext & 1 | 2, workInProgress2.flags |= 128) : suspenseContext &= 1;
        push(suspenseStackCursor, suspenseContext);
        reconcileChildren(current, workInProgress2, nextProps, renderLanes2);
        nextProps = isHydrating ? treeForkCount : 0;
        if (!shouldForceFallback && null !== current && 0 !== (current.flags & 128))
          a: for (current = workInProgress2.child; null !== current; ) {
            if (13 === current.tag)
              null !== current.memoizedState && scheduleSuspenseWorkOnFiber(current, renderLanes2, workInProgress2);
            else if (19 === current.tag)
              scheduleSuspenseWorkOnFiber(current, renderLanes2, workInProgress2);
            else if (null !== current.child) {
              current.child.return = current;
              current = current.child;
              continue;
            }
            if (current === workInProgress2) break a;
            for (; null === current.sibling; ) {
              if (null === current.return || current.return === workInProgress2)
                break a;
              current = current.return;
            }
            current.sibling.return = current.return;
            current = current.sibling;
          }
        switch (revealOrder) {
          case "forwards":
            renderLanes2 = workInProgress2.child;
            for (revealOrder = null; null !== renderLanes2; )
              current = renderLanes2.alternate, null !== current && null === findFirstSuspended(current) && (revealOrder = renderLanes2), renderLanes2 = renderLanes2.sibling;
            renderLanes2 = revealOrder;
            null === renderLanes2 ? (revealOrder = workInProgress2.child, workInProgress2.child = null) : (revealOrder = renderLanes2.sibling, renderLanes2.sibling = null);
            initSuspenseListRenderState(
              workInProgress2,
              false,
              revealOrder,
              renderLanes2,
              tailMode,
              nextProps
            );
            break;
          case "backwards":
          case "unstable_legacy-backwards":
            renderLanes2 = null;
            revealOrder = workInProgress2.child;
            for (workInProgress2.child = null; null !== revealOrder; ) {
              current = revealOrder.alternate;
              if (null !== current && null === findFirstSuspended(current)) {
                workInProgress2.child = revealOrder;
                break;
              }
              current = revealOrder.sibling;
              revealOrder.sibling = renderLanes2;
              renderLanes2 = revealOrder;
              revealOrder = current;
            }
            initSuspenseListRenderState(
              workInProgress2,
              true,
              renderLanes2,
              null,
              tailMode,
              nextProps
            );
            break;
          case "together":
            initSuspenseListRenderState(
              workInProgress2,
              false,
              null,
              null,
              void 0,
              nextProps
            );
            break;
          default:
            workInProgress2.memoizedState = null;
        }
        return workInProgress2.child;
      }
      function bailoutOnAlreadyFinishedWork(current, workInProgress2, renderLanes2) {
        null !== current && (workInProgress2.dependencies = current.dependencies);
        workInProgressRootSkippedLanes |= workInProgress2.lanes;
        if (0 === (renderLanes2 & workInProgress2.childLanes))
          if (null !== current) {
            if (propagateParentContextChanges(
              current,
              workInProgress2,
              renderLanes2,
              false
            ), 0 === (renderLanes2 & workInProgress2.childLanes))
              return null;
          } else return null;
        if (null !== current && workInProgress2.child !== current.child)
          throw Error(formatProdErrorMessage(153));
        if (null !== workInProgress2.child) {
          current = workInProgress2.child;
          renderLanes2 = createWorkInProgress(current, current.pendingProps);
          workInProgress2.child = renderLanes2;
          for (renderLanes2.return = workInProgress2; null !== current.sibling; )
            current = current.sibling, renderLanes2 = renderLanes2.sibling = createWorkInProgress(current, current.pendingProps), renderLanes2.return = workInProgress2;
          renderLanes2.sibling = null;
        }
        return workInProgress2.child;
      }
      function checkScheduledUpdateOrContext(current, renderLanes2) {
        if (0 !== (current.lanes & renderLanes2)) return true;
        current = current.dependencies;
        return null !== current && checkIfContextChanged(current) ? true : false;
      }
      function attemptEarlyBailoutIfNoScheduledUpdate(current, workInProgress2, renderLanes2) {
        switch (workInProgress2.tag) {
          case 3:
            pushHostContainer(workInProgress2, workInProgress2.stateNode.containerInfo);
            pushProvider(workInProgress2, CacheContext, current.memoizedState.cache);
            resetHydrationState();
            break;
          case 27:
          case 5:
            pushHostContext(workInProgress2);
            break;
          case 4:
            pushHostContainer(workInProgress2, workInProgress2.stateNode.containerInfo);
            break;
          case 10:
            pushProvider(
              workInProgress2,
              workInProgress2.type,
              workInProgress2.memoizedProps.value
            );
            break;
          case 31:
            if (null !== workInProgress2.memoizedState)
              return workInProgress2.flags |= 128, pushDehydratedActivitySuspenseHandler(workInProgress2), null;
            break;
          case 13:
            var state$102 = workInProgress2.memoizedState;
            if (null !== state$102) {
              if (null !== state$102.dehydrated)
                return pushPrimaryTreeSuspenseHandler(workInProgress2), workInProgress2.flags |= 128, null;
              if (0 !== (renderLanes2 & workInProgress2.child.childLanes))
                return updateSuspenseComponent(current, workInProgress2, renderLanes2);
              pushPrimaryTreeSuspenseHandler(workInProgress2);
              current = bailoutOnAlreadyFinishedWork(
                current,
                workInProgress2,
                renderLanes2
              );
              return null !== current ? current.sibling : null;
            }
            pushPrimaryTreeSuspenseHandler(workInProgress2);
            break;
          case 19:
            var didSuspendBefore = 0 !== (current.flags & 128);
            state$102 = 0 !== (renderLanes2 & workInProgress2.childLanes);
            state$102 || (propagateParentContextChanges(
              current,
              workInProgress2,
              renderLanes2,
              false
            ), state$102 = 0 !== (renderLanes2 & workInProgress2.childLanes));
            if (didSuspendBefore) {
              if (state$102)
                return updateSuspenseListComponent(
                  current,
                  workInProgress2,
                  renderLanes2
                );
              workInProgress2.flags |= 128;
            }
            didSuspendBefore = workInProgress2.memoizedState;
            null !== didSuspendBefore && (didSuspendBefore.rendering = null, didSuspendBefore.tail = null, didSuspendBefore.lastEffect = null);
            push(suspenseStackCursor, suspenseStackCursor.current);
            if (state$102) break;
            else return null;
          case 22:
            return workInProgress2.lanes = 0, updateOffscreenComponent(
              current,
              workInProgress2,
              renderLanes2,
              workInProgress2.pendingProps
            );
          case 24:
            pushProvider(workInProgress2, CacheContext, current.memoizedState.cache);
        }
        return bailoutOnAlreadyFinishedWork(current, workInProgress2, renderLanes2);
      }
      function beginWork(current, workInProgress2, renderLanes2) {
        if (null !== current)
          if (current.memoizedProps !== workInProgress2.pendingProps)
            didReceiveUpdate = true;
          else {
            if (!checkScheduledUpdateOrContext(current, renderLanes2) && 0 === (workInProgress2.flags & 128))
              return didReceiveUpdate = false, attemptEarlyBailoutIfNoScheduledUpdate(
                current,
                workInProgress2,
                renderLanes2
              );
            didReceiveUpdate = 0 !== (current.flags & 131072) ? true : false;
          }
        else
          didReceiveUpdate = false, isHydrating && 0 !== (workInProgress2.flags & 1048576) && pushTreeId(workInProgress2, treeForkCount, workInProgress2.index);
        workInProgress2.lanes = 0;
        switch (workInProgress2.tag) {
          case 16:
            a: {
              var props = workInProgress2.pendingProps;
              current = resolveLazy(workInProgress2.elementType);
              workInProgress2.type = current;
              if ("function" === typeof current)
                shouldConstruct(current) ? (props = resolveClassComponentProps(current, props), workInProgress2.tag = 1, workInProgress2 = updateClassComponent(
                  null,
                  workInProgress2,
                  current,
                  props,
                  renderLanes2
                )) : (workInProgress2.tag = 0, workInProgress2 = updateFunctionComponent(
                  null,
                  workInProgress2,
                  current,
                  props,
                  renderLanes2
                ));
              else {
                if (void 0 !== current && null !== current) {
                  var $$typeof = current.$$typeof;
                  if ($$typeof === REACT_FORWARD_REF_TYPE) {
                    workInProgress2.tag = 11;
                    workInProgress2 = updateForwardRef(
                      null,
                      workInProgress2,
                      current,
                      props,
                      renderLanes2
                    );
                    break a;
                  } else if ($$typeof === REACT_MEMO_TYPE) {
                    workInProgress2.tag = 14;
                    workInProgress2 = updateMemoComponent(
                      null,
                      workInProgress2,
                      current,
                      props,
                      renderLanes2
                    );
                    break a;
                  }
                }
                workInProgress2 = getComponentNameFromType(current) || current;
                throw Error(formatProdErrorMessage(306, workInProgress2, ""));
              }
            }
            return workInProgress2;
          case 0:
            return updateFunctionComponent(
              current,
              workInProgress2,
              workInProgress2.type,
              workInProgress2.pendingProps,
              renderLanes2
            );
          case 1:
            return props = workInProgress2.type, $$typeof = resolveClassComponentProps(
              props,
              workInProgress2.pendingProps
            ), updateClassComponent(
              current,
              workInProgress2,
              props,
              $$typeof,
              renderLanes2
            );
          case 3:
            a: {
              pushHostContainer(
                workInProgress2,
                workInProgress2.stateNode.containerInfo
              );
              if (null === current) throw Error(formatProdErrorMessage(387));
              props = workInProgress2.pendingProps;
              var prevState = workInProgress2.memoizedState;
              $$typeof = prevState.element;
              cloneUpdateQueue(current, workInProgress2);
              processUpdateQueue(workInProgress2, props, null, renderLanes2);
              var nextState = workInProgress2.memoizedState;
              props = nextState.cache;
              pushProvider(workInProgress2, CacheContext, props);
              props !== prevState.cache && propagateContextChanges(
                workInProgress2,
                [CacheContext],
                renderLanes2,
                true
              );
              suspendIfUpdateReadFromEntangledAsyncAction();
              props = nextState.element;
              if (prevState.isDehydrated)
                if (prevState = {
                  element: props,
                  isDehydrated: false,
                  cache: nextState.cache
                }, workInProgress2.updateQueue.baseState = prevState, workInProgress2.memoizedState = prevState, workInProgress2.flags & 256) {
                  workInProgress2 = mountHostRootWithoutHydrating(
                    current,
                    workInProgress2,
                    props,
                    renderLanes2
                  );
                  break a;
                } else if (props !== $$typeof) {
                  $$typeof = createCapturedValueAtFiber(
                    Error(formatProdErrorMessage(424)),
                    workInProgress2
                  );
                  queueHydrationError($$typeof);
                  workInProgress2 = mountHostRootWithoutHydrating(
                    current,
                    workInProgress2,
                    props,
                    renderLanes2
                  );
                  break a;
                } else {
                  current = workInProgress2.stateNode.containerInfo;
                  switch (current.nodeType) {
                    case 9:
                      current = current.body;
                      break;
                    default:
                      current = "HTML" === current.nodeName ? current.ownerDocument.body : current;
                  }
                  nextHydratableInstance = getNextHydratable(current.firstChild);
                  hydrationParentFiber = workInProgress2;
                  isHydrating = true;
                  hydrationErrors = null;
                  rootOrSingletonContext = true;
                  renderLanes2 = mountChildFibers(
                    workInProgress2,
                    null,
                    props,
                    renderLanes2
                  );
                  for (workInProgress2.child = renderLanes2; renderLanes2; )
                    renderLanes2.flags = renderLanes2.flags & -3 | 4096, renderLanes2 = renderLanes2.sibling;
                }
              else {
                resetHydrationState();
                if (props === $$typeof) {
                  workInProgress2 = bailoutOnAlreadyFinishedWork(
                    current,
                    workInProgress2,
                    renderLanes2
                  );
                  break a;
                }
                reconcileChildren(current, workInProgress2, props, renderLanes2);
              }
              workInProgress2 = workInProgress2.child;
            }
            return workInProgress2;
          case 26:
            return markRef(current, workInProgress2), null === current ? (renderLanes2 = getResource(
              workInProgress2.type,
              null,
              workInProgress2.pendingProps,
              null
            )) ? workInProgress2.memoizedState = renderLanes2 : isHydrating || (renderLanes2 = workInProgress2.type, current = workInProgress2.pendingProps, props = getOwnerDocumentFromRootContainer(
              rootInstanceStackCursor.current
            ).createElement(renderLanes2), props[internalInstanceKey] = workInProgress2, props[internalPropsKey] = current, setInitialProperties(props, renderLanes2, current), markNodeAsHoistable(props), workInProgress2.stateNode = props) : workInProgress2.memoizedState = getResource(
              workInProgress2.type,
              current.memoizedProps,
              workInProgress2.pendingProps,
              current.memoizedState
            ), null;
          case 27:
            return pushHostContext(workInProgress2), null === current && isHydrating && (props = workInProgress2.stateNode = resolveSingletonInstance(
              workInProgress2.type,
              workInProgress2.pendingProps,
              rootInstanceStackCursor.current
            ), hydrationParentFiber = workInProgress2, rootOrSingletonContext = true, $$typeof = nextHydratableInstance, isSingletonScope(workInProgress2.type) ? (previousHydratableOnEnteringScopedSingleton = $$typeof, nextHydratableInstance = getNextHydratable(props.firstChild)) : nextHydratableInstance = $$typeof), reconcileChildren(
              current,
              workInProgress2,
              workInProgress2.pendingProps.children,
              renderLanes2
            ), markRef(current, workInProgress2), null === current && (workInProgress2.flags |= 4194304), workInProgress2.child;
          case 5:
            if (null === current && isHydrating) {
              if ($$typeof = props = nextHydratableInstance)
                props = canHydrateInstance(
                  props,
                  workInProgress2.type,
                  workInProgress2.pendingProps,
                  rootOrSingletonContext
                ), null !== props ? (workInProgress2.stateNode = props, hydrationParentFiber = workInProgress2, nextHydratableInstance = getNextHydratable(props.firstChild), rootOrSingletonContext = false, $$typeof = true) : $$typeof = false;
              $$typeof || throwOnHydrationMismatch(workInProgress2);
            }
            pushHostContext(workInProgress2);
            $$typeof = workInProgress2.type;
            prevState = workInProgress2.pendingProps;
            nextState = null !== current ? current.memoizedProps : null;
            props = prevState.children;
            shouldSetTextContent($$typeof, prevState) ? props = null : null !== nextState && shouldSetTextContent($$typeof, nextState) && (workInProgress2.flags |= 32);
            null !== workInProgress2.memoizedState && ($$typeof = renderWithHooks(
              current,
              workInProgress2,
              TransitionAwareHostComponent,
              null,
              null,
              renderLanes2
            ), HostTransitionContext._currentValue = $$typeof);
            markRef(current, workInProgress2);
            reconcileChildren(current, workInProgress2, props, renderLanes2);
            return workInProgress2.child;
          case 6:
            if (null === current && isHydrating) {
              if (current = renderLanes2 = nextHydratableInstance)
                renderLanes2 = canHydrateTextInstance(
                  renderLanes2,
                  workInProgress2.pendingProps,
                  rootOrSingletonContext
                ), null !== renderLanes2 ? (workInProgress2.stateNode = renderLanes2, hydrationParentFiber = workInProgress2, nextHydratableInstance = null, current = true) : current = false;
              current || throwOnHydrationMismatch(workInProgress2);
            }
            return null;
          case 13:
            return updateSuspenseComponent(current, workInProgress2, renderLanes2);
          case 4:
            return pushHostContainer(
              workInProgress2,
              workInProgress2.stateNode.containerInfo
            ), props = workInProgress2.pendingProps, null === current ? workInProgress2.child = reconcileChildFibers(
              workInProgress2,
              null,
              props,
              renderLanes2
            ) : reconcileChildren(current, workInProgress2, props, renderLanes2), workInProgress2.child;
          case 11:
            return updateForwardRef(
              current,
              workInProgress2,
              workInProgress2.type,
              workInProgress2.pendingProps,
              renderLanes2
            );
          case 7:
            return reconcileChildren(
              current,
              workInProgress2,
              workInProgress2.pendingProps,
              renderLanes2
            ), workInProgress2.child;
          case 8:
            return reconcileChildren(
              current,
              workInProgress2,
              workInProgress2.pendingProps.children,
              renderLanes2
            ), workInProgress2.child;
          case 12:
            return reconcileChildren(
              current,
              workInProgress2,
              workInProgress2.pendingProps.children,
              renderLanes2
            ), workInProgress2.child;
          case 10:
            return props = workInProgress2.pendingProps, pushProvider(workInProgress2, workInProgress2.type, props.value), reconcileChildren(current, workInProgress2, props.children, renderLanes2), workInProgress2.child;
          case 9:
            return $$typeof = workInProgress2.type._context, props = workInProgress2.pendingProps.children, prepareToReadContext(workInProgress2), $$typeof = readContext($$typeof), props = props($$typeof), workInProgress2.flags |= 1, reconcileChildren(current, workInProgress2, props, renderLanes2), workInProgress2.child;
          case 14:
            return updateMemoComponent(
              current,
              workInProgress2,
              workInProgress2.type,
              workInProgress2.pendingProps,
              renderLanes2
            );
          case 15:
            return updateSimpleMemoComponent(
              current,
              workInProgress2,
              workInProgress2.type,
              workInProgress2.pendingProps,
              renderLanes2
            );
          case 19:
            return updateSuspenseListComponent(current, workInProgress2, renderLanes2);
          case 31:
            return updateActivityComponent(current, workInProgress2, renderLanes2);
          case 22:
            return updateOffscreenComponent(
              current,
              workInProgress2,
              renderLanes2,
              workInProgress2.pendingProps
            );
          case 24:
            return prepareToReadContext(workInProgress2), props = readContext(CacheContext), null === current ? ($$typeof = peekCacheFromPool(), null === $$typeof && ($$typeof = workInProgressRoot, prevState = createCache(), $$typeof.pooledCache = prevState, prevState.refCount++, null !== prevState && ($$typeof.pooledCacheLanes |= renderLanes2), $$typeof = prevState), workInProgress2.memoizedState = { parent: props, cache: $$typeof }, initializeUpdateQueue(workInProgress2), pushProvider(workInProgress2, CacheContext, $$typeof)) : (0 !== (current.lanes & renderLanes2) && (cloneUpdateQueue(current, workInProgress2), processUpdateQueue(workInProgress2, null, null, renderLanes2), suspendIfUpdateReadFromEntangledAsyncAction()), $$typeof = current.memoizedState, prevState = workInProgress2.memoizedState, $$typeof.parent !== props ? ($$typeof = { parent: props, cache: props }, workInProgress2.memoizedState = $$typeof, 0 === workInProgress2.lanes && (workInProgress2.memoizedState = workInProgress2.updateQueue.baseState = $$typeof), pushProvider(workInProgress2, CacheContext, props)) : (props = prevState.cache, pushProvider(workInProgress2, CacheContext, props), props !== $$typeof.cache && propagateContextChanges(
              workInProgress2,
              [CacheContext],
              renderLanes2,
              true
            ))), reconcileChildren(
              current,
              workInProgress2,
              workInProgress2.pendingProps.children,
              renderLanes2
            ), workInProgress2.child;
          case 29:
            throw workInProgress2.pendingProps;
        }
        throw Error(formatProdErrorMessage(156, workInProgress2.tag));
      }
      function markUpdate(workInProgress2) {
        workInProgress2.flags |= 4;
      }
      function preloadInstanceAndSuspendIfNeeded(workInProgress2, type, oldProps, newProps, renderLanes2) {
        if (type = 0 !== (workInProgress2.mode & 32)) type = false;
        if (type) {
          if (workInProgress2.flags |= 16777216, (renderLanes2 & 335544128) === renderLanes2)
            if (workInProgress2.stateNode.complete) workInProgress2.flags |= 8192;
            else if (shouldRemainOnPreviousScreen()) workInProgress2.flags |= 8192;
            else
              throw suspendedThenable = noopSuspenseyCommitThenable, SuspenseyCommitException;
        } else workInProgress2.flags &= -16777217;
      }
      function preloadResourceAndSuspendIfNeeded(workInProgress2, resource) {
        if ("stylesheet" !== resource.type || 0 !== (resource.state.loading & 4))
          workInProgress2.flags &= -16777217;
        else if (workInProgress2.flags |= 16777216, !preloadResource(resource))
          if (shouldRemainOnPreviousScreen()) workInProgress2.flags |= 8192;
          else
            throw suspendedThenable = noopSuspenseyCommitThenable, SuspenseyCommitException;
      }
      function scheduleRetryEffect(workInProgress2, retryQueue) {
        null !== retryQueue && (workInProgress2.flags |= 4);
        workInProgress2.flags & 16384 && (retryQueue = 22 !== workInProgress2.tag ? claimNextRetryLane() : 536870912, workInProgress2.lanes |= retryQueue, workInProgressSuspendedRetryLanes |= retryQueue);
      }
      function cutOffTailIfNeeded(renderState, hasRenderedATailFallback) {
        if (!isHydrating)
          switch (renderState.tailMode) {
            case "hidden":
              hasRenderedATailFallback = renderState.tail;
              for (var lastTailNode = null; null !== hasRenderedATailFallback; )
                null !== hasRenderedATailFallback.alternate && (lastTailNode = hasRenderedATailFallback), hasRenderedATailFallback = hasRenderedATailFallback.sibling;
              null === lastTailNode ? renderState.tail = null : lastTailNode.sibling = null;
              break;
            case "collapsed":
              lastTailNode = renderState.tail;
              for (var lastTailNode$106 = null; null !== lastTailNode; )
                null !== lastTailNode.alternate && (lastTailNode$106 = lastTailNode), lastTailNode = lastTailNode.sibling;
              null === lastTailNode$106 ? hasRenderedATailFallback || null === renderState.tail ? renderState.tail = null : renderState.tail.sibling = null : lastTailNode$106.sibling = null;
          }
      }
      function bubbleProperties(completedWork) {
        var didBailout = null !== completedWork.alternate && completedWork.alternate.child === completedWork.child, newChildLanes = 0, subtreeFlags = 0;
        if (didBailout)
          for (var child$107 = completedWork.child; null !== child$107; )
            newChildLanes |= child$107.lanes | child$107.childLanes, subtreeFlags |= child$107.subtreeFlags & 65011712, subtreeFlags |= child$107.flags & 65011712, child$107.return = completedWork, child$107 = child$107.sibling;
        else
          for (child$107 = completedWork.child; null !== child$107; )
            newChildLanes |= child$107.lanes | child$107.childLanes, subtreeFlags |= child$107.subtreeFlags, subtreeFlags |= child$107.flags, child$107.return = completedWork, child$107 = child$107.sibling;
        completedWork.subtreeFlags |= subtreeFlags;
        completedWork.childLanes = newChildLanes;
        return didBailout;
      }
      function completeWork(current, workInProgress2, renderLanes2) {
        var newProps = workInProgress2.pendingProps;
        popTreeContext(workInProgress2);
        switch (workInProgress2.tag) {
          case 16:
          case 15:
          case 0:
          case 11:
          case 7:
          case 8:
          case 12:
          case 9:
          case 14:
            return bubbleProperties(workInProgress2), null;
          case 1:
            return bubbleProperties(workInProgress2), null;
          case 3:
            renderLanes2 = workInProgress2.stateNode;
            newProps = null;
            null !== current && (newProps = current.memoizedState.cache);
            workInProgress2.memoizedState.cache !== newProps && (workInProgress2.flags |= 2048);
            popProvider(CacheContext);
            popHostContainer();
            renderLanes2.pendingContext && (renderLanes2.context = renderLanes2.pendingContext, renderLanes2.pendingContext = null);
            if (null === current || null === current.child)
              popHydrationState(workInProgress2) ? markUpdate(workInProgress2) : null === current || current.memoizedState.isDehydrated && 0 === (workInProgress2.flags & 256) || (workInProgress2.flags |= 1024, upgradeHydrationErrorsToRecoverable());
            bubbleProperties(workInProgress2);
            return null;
          case 26:
            var type = workInProgress2.type, nextResource = workInProgress2.memoizedState;
            null === current ? (markUpdate(workInProgress2), null !== nextResource ? (bubbleProperties(workInProgress2), preloadResourceAndSuspendIfNeeded(workInProgress2, nextResource)) : (bubbleProperties(workInProgress2), preloadInstanceAndSuspendIfNeeded(
              workInProgress2,
              type,
              null,
              newProps,
              renderLanes2
            ))) : nextResource ? nextResource !== current.memoizedState ? (markUpdate(workInProgress2), bubbleProperties(workInProgress2), preloadResourceAndSuspendIfNeeded(workInProgress2, nextResource)) : (bubbleProperties(workInProgress2), workInProgress2.flags &= -16777217) : (current = current.memoizedProps, current !== newProps && markUpdate(workInProgress2), bubbleProperties(workInProgress2), preloadInstanceAndSuspendIfNeeded(
              workInProgress2,
              type,
              current,
              newProps,
              renderLanes2
            ));
            return null;
          case 27:
            popHostContext(workInProgress2);
            renderLanes2 = rootInstanceStackCursor.current;
            type = workInProgress2.type;
            if (null !== current && null != workInProgress2.stateNode)
              current.memoizedProps !== newProps && markUpdate(workInProgress2);
            else {
              if (!newProps) {
                if (null === workInProgress2.stateNode)
                  throw Error(formatProdErrorMessage(166));
                bubbleProperties(workInProgress2);
                return null;
              }
              current = contextStackCursor.current;
              popHydrationState(workInProgress2) ? prepareToHydrateHostInstance(workInProgress2, current) : (current = resolveSingletonInstance(type, newProps, renderLanes2), workInProgress2.stateNode = current, markUpdate(workInProgress2));
            }
            bubbleProperties(workInProgress2);
            return null;
          case 5:
            popHostContext(workInProgress2);
            type = workInProgress2.type;
            if (null !== current && null != workInProgress2.stateNode)
              current.memoizedProps !== newProps && markUpdate(workInProgress2);
            else {
              if (!newProps) {
                if (null === workInProgress2.stateNode)
                  throw Error(formatProdErrorMessage(166));
                bubbleProperties(workInProgress2);
                return null;
              }
              nextResource = contextStackCursor.current;
              if (popHydrationState(workInProgress2))
                prepareToHydrateHostInstance(workInProgress2, nextResource);
              else {
                var ownerDocument = getOwnerDocumentFromRootContainer(
                  rootInstanceStackCursor.current
                );
                switch (nextResource) {
                  case 1:
                    nextResource = ownerDocument.createElementNS(
                      "http://www.w3.org/2000/svg",
                      type
                    );
                    break;
                  case 2:
                    nextResource = ownerDocument.createElementNS(
                      "http://www.w3.org/1998/Math/MathML",
                      type
                    );
                    break;
                  default:
                    switch (type) {
                      case "svg":
                        nextResource = ownerDocument.createElementNS(
                          "http://www.w3.org/2000/svg",
                          type
                        );
                        break;
                      case "math":
                        nextResource = ownerDocument.createElementNS(
                          "http://www.w3.org/1998/Math/MathML",
                          type
                        );
                        break;
                      case "script":
                        nextResource = ownerDocument.createElement("div");
                        nextResource.innerHTML = "<script><\/script>";
                        nextResource = nextResource.removeChild(
                          nextResource.firstChild
                        );
                        break;
                      case "select":
                        nextResource = "string" === typeof newProps.is ? ownerDocument.createElement("select", {
                          is: newProps.is
                        }) : ownerDocument.createElement("select");
                        newProps.multiple ? nextResource.multiple = true : newProps.size && (nextResource.size = newProps.size);
                        break;
                      default:
                        nextResource = "string" === typeof newProps.is ? ownerDocument.createElement(type, { is: newProps.is }) : ownerDocument.createElement(type);
                    }
                }
                nextResource[internalInstanceKey] = workInProgress2;
                nextResource[internalPropsKey] = newProps;
                a: for (ownerDocument = workInProgress2.child; null !== ownerDocument; ) {
                  if (5 === ownerDocument.tag || 6 === ownerDocument.tag)
                    nextResource.appendChild(ownerDocument.stateNode);
                  else if (4 !== ownerDocument.tag && 27 !== ownerDocument.tag && null !== ownerDocument.child) {
                    ownerDocument.child.return = ownerDocument;
                    ownerDocument = ownerDocument.child;
                    continue;
                  }
                  if (ownerDocument === workInProgress2) break a;
                  for (; null === ownerDocument.sibling; ) {
                    if (null === ownerDocument.return || ownerDocument.return === workInProgress2)
                      break a;
                    ownerDocument = ownerDocument.return;
                  }
                  ownerDocument.sibling.return = ownerDocument.return;
                  ownerDocument = ownerDocument.sibling;
                }
                workInProgress2.stateNode = nextResource;
                a: switch (setInitialProperties(nextResource, type, newProps), type) {
                  case "button":
                  case "input":
                  case "select":
                  case "textarea":
                    newProps = !!newProps.autoFocus;
                    break a;
                  case "img":
                    newProps = true;
                    break a;
                  default:
                    newProps = false;
                }
                newProps && markUpdate(workInProgress2);
              }
            }
            bubbleProperties(workInProgress2);
            preloadInstanceAndSuspendIfNeeded(
              workInProgress2,
              workInProgress2.type,
              null === current ? null : current.memoizedProps,
              workInProgress2.pendingProps,
              renderLanes2
            );
            return null;
          case 6:
            if (current && null != workInProgress2.stateNode)
              current.memoizedProps !== newProps && markUpdate(workInProgress2);
            else {
              if ("string" !== typeof newProps && null === workInProgress2.stateNode)
                throw Error(formatProdErrorMessage(166));
              current = rootInstanceStackCursor.current;
              if (popHydrationState(workInProgress2)) {
                current = workInProgress2.stateNode;
                renderLanes2 = workInProgress2.memoizedProps;
                newProps = null;
                type = hydrationParentFiber;
                if (null !== type)
                  switch (type.tag) {
                    case 27:
                    case 5:
                      newProps = type.memoizedProps;
                  }
                current[internalInstanceKey] = workInProgress2;
                current = current.nodeValue === renderLanes2 || null !== newProps && true === newProps.suppressHydrationWarning || checkForUnmatchedText(current.nodeValue, renderLanes2) ? true : false;
                current || throwOnHydrationMismatch(workInProgress2, true);
              } else
                current = getOwnerDocumentFromRootContainer(current).createTextNode(
                  newProps
                ), current[internalInstanceKey] = workInProgress2, workInProgress2.stateNode = current;
            }
            bubbleProperties(workInProgress2);
            return null;
          case 31:
            renderLanes2 = workInProgress2.memoizedState;
            if (null === current || null !== current.memoizedState) {
              newProps = popHydrationState(workInProgress2);
              if (null !== renderLanes2) {
                if (null === current) {
                  if (!newProps) throw Error(formatProdErrorMessage(318));
                  current = workInProgress2.memoizedState;
                  current = null !== current ? current.dehydrated : null;
                  if (!current) throw Error(formatProdErrorMessage(557));
                  current[internalInstanceKey] = workInProgress2;
                } else
                  resetHydrationState(), 0 === (workInProgress2.flags & 128) && (workInProgress2.memoizedState = null), workInProgress2.flags |= 4;
                bubbleProperties(workInProgress2);
                current = false;
              } else
                renderLanes2 = upgradeHydrationErrorsToRecoverable(), null !== current && null !== current.memoizedState && (current.memoizedState.hydrationErrors = renderLanes2), current = true;
              if (!current) {
                if (workInProgress2.flags & 256)
                  return popSuspenseHandler(workInProgress2), workInProgress2;
                popSuspenseHandler(workInProgress2);
                return null;
              }
              if (0 !== (workInProgress2.flags & 128))
                throw Error(formatProdErrorMessage(558));
            }
            bubbleProperties(workInProgress2);
            return null;
          case 13:
            newProps = workInProgress2.memoizedState;
            if (null === current || null !== current.memoizedState && null !== current.memoizedState.dehydrated) {
              type = popHydrationState(workInProgress2);
              if (null !== newProps && null !== newProps.dehydrated) {
                if (null === current) {
                  if (!type) throw Error(formatProdErrorMessage(318));
                  type = workInProgress2.memoizedState;
                  type = null !== type ? type.dehydrated : null;
                  if (!type) throw Error(formatProdErrorMessage(317));
                  type[internalInstanceKey] = workInProgress2;
                } else
                  resetHydrationState(), 0 === (workInProgress2.flags & 128) && (workInProgress2.memoizedState = null), workInProgress2.flags |= 4;
                bubbleProperties(workInProgress2);
                type = false;
              } else
                type = upgradeHydrationErrorsToRecoverable(), null !== current && null !== current.memoizedState && (current.memoizedState.hydrationErrors = type), type = true;
              if (!type) {
                if (workInProgress2.flags & 256)
                  return popSuspenseHandler(workInProgress2), workInProgress2;
                popSuspenseHandler(workInProgress2);
                return null;
              }
            }
            popSuspenseHandler(workInProgress2);
            if (0 !== (workInProgress2.flags & 128))
              return workInProgress2.lanes = renderLanes2, workInProgress2;
            renderLanes2 = null !== newProps;
            current = null !== current && null !== current.memoizedState;
            renderLanes2 && (newProps = workInProgress2.child, type = null, null !== newProps.alternate && null !== newProps.alternate.memoizedState && null !== newProps.alternate.memoizedState.cachePool && (type = newProps.alternate.memoizedState.cachePool.pool), nextResource = null, null !== newProps.memoizedState && null !== newProps.memoizedState.cachePool && (nextResource = newProps.memoizedState.cachePool.pool), nextResource !== type && (newProps.flags |= 2048));
            renderLanes2 !== current && renderLanes2 && (workInProgress2.child.flags |= 8192);
            scheduleRetryEffect(workInProgress2, workInProgress2.updateQueue);
            bubbleProperties(workInProgress2);
            return null;
          case 4:
            return popHostContainer(), null === current && listenToAllSupportedEvents(workInProgress2.stateNode.containerInfo), bubbleProperties(workInProgress2), null;
          case 10:
            return popProvider(workInProgress2.type), bubbleProperties(workInProgress2), null;
          case 19:
            pop(suspenseStackCursor);
            newProps = workInProgress2.memoizedState;
            if (null === newProps) return bubbleProperties(workInProgress2), null;
            type = 0 !== (workInProgress2.flags & 128);
            nextResource = newProps.rendering;
            if (null === nextResource)
              if (type) cutOffTailIfNeeded(newProps, false);
              else {
                if (0 !== workInProgressRootExitStatus || null !== current && 0 !== (current.flags & 128))
                  for (current = workInProgress2.child; null !== current; ) {
                    nextResource = findFirstSuspended(current);
                    if (null !== nextResource) {
                      workInProgress2.flags |= 128;
                      cutOffTailIfNeeded(newProps, false);
                      current = nextResource.updateQueue;
                      workInProgress2.updateQueue = current;
                      scheduleRetryEffect(workInProgress2, current);
                      workInProgress2.subtreeFlags = 0;
                      current = renderLanes2;
                      for (renderLanes2 = workInProgress2.child; null !== renderLanes2; )
                        resetWorkInProgress(renderLanes2, current), renderLanes2 = renderLanes2.sibling;
                      push(
                        suspenseStackCursor,
                        suspenseStackCursor.current & 1 | 2
                      );
                      isHydrating && pushTreeFork(workInProgress2, newProps.treeForkCount);
                      return workInProgress2.child;
                    }
                    current = current.sibling;
                  }
                null !== newProps.tail && now() > workInProgressRootRenderTargetTime && (workInProgress2.flags |= 128, type = true, cutOffTailIfNeeded(newProps, false), workInProgress2.lanes = 4194304);
              }
            else {
              if (!type)
                if (current = findFirstSuspended(nextResource), null !== current) {
                  if (workInProgress2.flags |= 128, type = true, current = current.updateQueue, workInProgress2.updateQueue = current, scheduleRetryEffect(workInProgress2, current), cutOffTailIfNeeded(newProps, true), null === newProps.tail && "hidden" === newProps.tailMode && !nextResource.alternate && !isHydrating)
                    return bubbleProperties(workInProgress2), null;
                } else
                  2 * now() - newProps.renderingStartTime > workInProgressRootRenderTargetTime && 536870912 !== renderLanes2 && (workInProgress2.flags |= 128, type = true, cutOffTailIfNeeded(newProps, false), workInProgress2.lanes = 4194304);
              newProps.isBackwards ? (nextResource.sibling = workInProgress2.child, workInProgress2.child = nextResource) : (current = newProps.last, null !== current ? current.sibling = nextResource : workInProgress2.child = nextResource, newProps.last = nextResource);
            }
            if (null !== newProps.tail)
              return current = newProps.tail, newProps.rendering = current, newProps.tail = current.sibling, newProps.renderingStartTime = now(), current.sibling = null, renderLanes2 = suspenseStackCursor.current, push(
                suspenseStackCursor,
                type ? renderLanes2 & 1 | 2 : renderLanes2 & 1
              ), isHydrating && pushTreeFork(workInProgress2, newProps.treeForkCount), current;
            bubbleProperties(workInProgress2);
            return null;
          case 22:
          case 23:
            return popSuspenseHandler(workInProgress2), popHiddenContext(), newProps = null !== workInProgress2.memoizedState, null !== current ? null !== current.memoizedState !== newProps && (workInProgress2.flags |= 8192) : newProps && (workInProgress2.flags |= 8192), newProps ? 0 !== (renderLanes2 & 536870912) && 0 === (workInProgress2.flags & 128) && (bubbleProperties(workInProgress2), workInProgress2.subtreeFlags & 6 && (workInProgress2.flags |= 8192)) : bubbleProperties(workInProgress2), renderLanes2 = workInProgress2.updateQueue, null !== renderLanes2 && scheduleRetryEffect(workInProgress2, renderLanes2.retryQueue), renderLanes2 = null, null !== current && null !== current.memoizedState && null !== current.memoizedState.cachePool && (renderLanes2 = current.memoizedState.cachePool.pool), newProps = null, null !== workInProgress2.memoizedState && null !== workInProgress2.memoizedState.cachePool && (newProps = workInProgress2.memoizedState.cachePool.pool), newProps !== renderLanes2 && (workInProgress2.flags |= 2048), null !== current && pop(resumedCache), null;
          case 24:
            return renderLanes2 = null, null !== current && (renderLanes2 = current.memoizedState.cache), workInProgress2.memoizedState.cache !== renderLanes2 && (workInProgress2.flags |= 2048), popProvider(CacheContext), bubbleProperties(workInProgress2), null;
          case 25:
            return null;
          case 30:
            return null;
        }
        throw Error(formatProdErrorMessage(156, workInProgress2.tag));
      }
      function unwindWork(current, workInProgress2) {
        popTreeContext(workInProgress2);
        switch (workInProgress2.tag) {
          case 1:
            return current = workInProgress2.flags, current & 65536 ? (workInProgress2.flags = current & -65537 | 128, workInProgress2) : null;
          case 3:
            return popProvider(CacheContext), popHostContainer(), current = workInProgress2.flags, 0 !== (current & 65536) && 0 === (current & 128) ? (workInProgress2.flags = current & -65537 | 128, workInProgress2) : null;
          case 26:
          case 27:
          case 5:
            return popHostContext(workInProgress2), null;
          case 31:
            if (null !== workInProgress2.memoizedState) {
              popSuspenseHandler(workInProgress2);
              if (null === workInProgress2.alternate)
                throw Error(formatProdErrorMessage(340));
              resetHydrationState();
            }
            current = workInProgress2.flags;
            return current & 65536 ? (workInProgress2.flags = current & -65537 | 128, workInProgress2) : null;
          case 13:
            popSuspenseHandler(workInProgress2);
            current = workInProgress2.memoizedState;
            if (null !== current && null !== current.dehydrated) {
              if (null === workInProgress2.alternate)
                throw Error(formatProdErrorMessage(340));
              resetHydrationState();
            }
            current = workInProgress2.flags;
            return current & 65536 ? (workInProgress2.flags = current & -65537 | 128, workInProgress2) : null;
          case 19:
            return pop(suspenseStackCursor), null;
          case 4:
            return popHostContainer(), null;
          case 10:
            return popProvider(workInProgress2.type), null;
          case 22:
          case 23:
            return popSuspenseHandler(workInProgress2), popHiddenContext(), null !== current && pop(resumedCache), current = workInProgress2.flags, current & 65536 ? (workInProgress2.flags = current & -65537 | 128, workInProgress2) : null;
          case 24:
            return popProvider(CacheContext), null;
          case 25:
            return null;
          default:
            return null;
        }
      }
      function unwindInterruptedWork(current, interruptedWork) {
        popTreeContext(interruptedWork);
        switch (interruptedWork.tag) {
          case 3:
            popProvider(CacheContext);
            popHostContainer();
            break;
          case 26:
          case 27:
          case 5:
            popHostContext(interruptedWork);
            break;
          case 4:
            popHostContainer();
            break;
          case 31:
            null !== interruptedWork.memoizedState && popSuspenseHandler(interruptedWork);
            break;
          case 13:
            popSuspenseHandler(interruptedWork);
            break;
          case 19:
            pop(suspenseStackCursor);
            break;
          case 10:
            popProvider(interruptedWork.type);
            break;
          case 22:
          case 23:
            popSuspenseHandler(interruptedWork);
            popHiddenContext();
            null !== current && pop(resumedCache);
            break;
          case 24:
            popProvider(CacheContext);
        }
      }
      function commitHookEffectListMount(flags, finishedWork) {
        try {
          var updateQueue = finishedWork.updateQueue, lastEffect = null !== updateQueue ? updateQueue.lastEffect : null;
          if (null !== lastEffect) {
            var firstEffect = lastEffect.next;
            updateQueue = firstEffect;
            do {
              if ((updateQueue.tag & flags) === flags) {
                lastEffect = void 0;
                var create = updateQueue.create, inst = updateQueue.inst;
                lastEffect = create();
                inst.destroy = lastEffect;
              }
              updateQueue = updateQueue.next;
            } while (updateQueue !== firstEffect);
          }
        } catch (error) {
          captureCommitPhaseError(finishedWork, finishedWork.return, error);
        }
      }
      function commitHookEffectListUnmount(flags, finishedWork, nearestMountedAncestor$jscomp$0) {
        try {
          var updateQueue = finishedWork.updateQueue, lastEffect = null !== updateQueue ? updateQueue.lastEffect : null;
          if (null !== lastEffect) {
            var firstEffect = lastEffect.next;
            updateQueue = firstEffect;
            do {
              if ((updateQueue.tag & flags) === flags) {
                var inst = updateQueue.inst, destroy = inst.destroy;
                if (void 0 !== destroy) {
                  inst.destroy = void 0;
                  lastEffect = finishedWork;
                  var nearestMountedAncestor = nearestMountedAncestor$jscomp$0, destroy_ = destroy;
                  try {
                    destroy_();
                  } catch (error) {
                    captureCommitPhaseError(
                      lastEffect,
                      nearestMountedAncestor,
                      error
                    );
                  }
                }
              }
              updateQueue = updateQueue.next;
            } while (updateQueue !== firstEffect);
          }
        } catch (error) {
          captureCommitPhaseError(finishedWork, finishedWork.return, error);
        }
      }
      function commitClassCallbacks(finishedWork) {
        var updateQueue = finishedWork.updateQueue;
        if (null !== updateQueue) {
          var instance = finishedWork.stateNode;
          try {
            commitCallbacks(updateQueue, instance);
          } catch (error) {
            captureCommitPhaseError(finishedWork, finishedWork.return, error);
          }
        }
      }
      function safelyCallComponentWillUnmount(current, nearestMountedAncestor, instance) {
        instance.props = resolveClassComponentProps(
          current.type,
          current.memoizedProps
        );
        instance.state = current.memoizedState;
        try {
          instance.componentWillUnmount();
        } catch (error) {
          captureCommitPhaseError(current, nearestMountedAncestor, error);
        }
      }
      function safelyAttachRef(current, nearestMountedAncestor) {
        try {
          var ref = current.ref;
          if (null !== ref) {
            switch (current.tag) {
              case 26:
              case 27:
              case 5:
                var instanceToUse = current.stateNode;
                break;
              case 30:
                instanceToUse = current.stateNode;
                break;
              default:
                instanceToUse = current.stateNode;
            }
            "function" === typeof ref ? current.refCleanup = ref(instanceToUse) : ref.current = instanceToUse;
          }
        } catch (error) {
          captureCommitPhaseError(current, nearestMountedAncestor, error);
        }
      }
      function safelyDetachRef(current, nearestMountedAncestor) {
        var ref = current.ref, refCleanup = current.refCleanup;
        if (null !== ref)
          if ("function" === typeof refCleanup)
            try {
              refCleanup();
            } catch (error) {
              captureCommitPhaseError(current, nearestMountedAncestor, error);
            } finally {
              current.refCleanup = null, current = current.alternate, null != current && (current.refCleanup = null);
            }
          else if ("function" === typeof ref)
            try {
              ref(null);
            } catch (error$140) {
              captureCommitPhaseError(current, nearestMountedAncestor, error$140);
            }
          else ref.current = null;
      }
      function commitHostMount(finishedWork) {
        var type = finishedWork.type, props = finishedWork.memoizedProps, instance = finishedWork.stateNode;
        try {
          a: switch (type) {
            case "button":
            case "input":
            case "select":
            case "textarea":
              props.autoFocus && instance.focus();
              break a;
            case "img":
              props.src ? instance.src = props.src : props.srcSet && (instance.srcset = props.srcSet);
          }
        } catch (error) {
          captureCommitPhaseError(finishedWork, finishedWork.return, error);
        }
      }
      function commitHostUpdate(finishedWork, newProps, oldProps) {
        try {
          var domElement = finishedWork.stateNode;
          updateProperties(domElement, finishedWork.type, oldProps, newProps);
          domElement[internalPropsKey] = newProps;
        } catch (error) {
          captureCommitPhaseError(finishedWork, finishedWork.return, error);
        }
      }
      function isHostParent(fiber) {
        return 5 === fiber.tag || 3 === fiber.tag || 26 === fiber.tag || 27 === fiber.tag && isSingletonScope(fiber.type) || 4 === fiber.tag;
      }
      function getHostSibling(fiber) {
        a: for (; ; ) {
          for (; null === fiber.sibling; ) {
            if (null === fiber.return || isHostParent(fiber.return)) return null;
            fiber = fiber.return;
          }
          fiber.sibling.return = fiber.return;
          for (fiber = fiber.sibling; 5 !== fiber.tag && 6 !== fiber.tag && 18 !== fiber.tag; ) {
            if (27 === fiber.tag && isSingletonScope(fiber.type)) continue a;
            if (fiber.flags & 2) continue a;
            if (null === fiber.child || 4 === fiber.tag) continue a;
            else fiber.child.return = fiber, fiber = fiber.child;
          }
          if (!(fiber.flags & 2)) return fiber.stateNode;
        }
      }
      function insertOrAppendPlacementNodeIntoContainer(node, before, parent) {
        var tag = node.tag;
        if (5 === tag || 6 === tag)
          node = node.stateNode, before ? (9 === parent.nodeType ? parent.body : "HTML" === parent.nodeName ? parent.ownerDocument.body : parent).insertBefore(node, before) : (before = 9 === parent.nodeType ? parent.body : "HTML" === parent.nodeName ? parent.ownerDocument.body : parent, before.appendChild(node), parent = parent._reactRootContainer, null !== parent && void 0 !== parent || null !== before.onclick || (before.onclick = noop$1));
        else if (4 !== tag && (27 === tag && isSingletonScope(node.type) && (parent = node.stateNode, before = null), node = node.child, null !== node))
          for (insertOrAppendPlacementNodeIntoContainer(node, before, parent), node = node.sibling; null !== node; )
            insertOrAppendPlacementNodeIntoContainer(node, before, parent), node = node.sibling;
      }
      function insertOrAppendPlacementNode(node, before, parent) {
        var tag = node.tag;
        if (5 === tag || 6 === tag)
          node = node.stateNode, before ? parent.insertBefore(node, before) : parent.appendChild(node);
        else if (4 !== tag && (27 === tag && isSingletonScope(node.type) && (parent = node.stateNode), node = node.child, null !== node))
          for (insertOrAppendPlacementNode(node, before, parent), node = node.sibling; null !== node; )
            insertOrAppendPlacementNode(node, before, parent), node = node.sibling;
      }
      function commitHostSingletonAcquisition(finishedWork) {
        var singleton = finishedWork.stateNode, props = finishedWork.memoizedProps;
        try {
          for (var type = finishedWork.type, attributes = singleton.attributes; attributes.length; )
            singleton.removeAttributeNode(attributes[0]);
          setInitialProperties(singleton, type, props);
          singleton[internalInstanceKey] = finishedWork;
          singleton[internalPropsKey] = props;
        } catch (error) {
          captureCommitPhaseError(finishedWork, finishedWork.return, error);
        }
      }
      var offscreenSubtreeIsHidden = false;
      var offscreenSubtreeWasHidden = false;
      var needsFormReset = false;
      var PossiblyWeakSet = "function" === typeof WeakSet ? WeakSet : Set;
      var nextEffect = null;
      function commitBeforeMutationEffects(root2, firstChild) {
        root2 = root2.containerInfo;
        eventsEnabled = _enabled;
        root2 = getActiveElementDeep(root2);
        if (hasSelectionCapabilities(root2)) {
          if ("selectionStart" in root2)
            var JSCompiler_temp = {
              start: root2.selectionStart,
              end: root2.selectionEnd
            };
          else
            a: {
              JSCompiler_temp = (JSCompiler_temp = root2.ownerDocument) && JSCompiler_temp.defaultView || window;
              var selection = JSCompiler_temp.getSelection && JSCompiler_temp.getSelection();
              if (selection && 0 !== selection.rangeCount) {
                JSCompiler_temp = selection.anchorNode;
                var anchorOffset = selection.anchorOffset, focusNode = selection.focusNode;
                selection = selection.focusOffset;
                try {
                  JSCompiler_temp.nodeType, focusNode.nodeType;
                } catch (e$20) {
                  JSCompiler_temp = null;
                  break a;
                }
                var length = 0, start = -1, end = -1, indexWithinAnchor = 0, indexWithinFocus = 0, node = root2, parentNode = null;
                b: for (; ; ) {
                  for (var next; ; ) {
                    node !== JSCompiler_temp || 0 !== anchorOffset && 3 !== node.nodeType || (start = length + anchorOffset);
                    node !== focusNode || 0 !== selection && 3 !== node.nodeType || (end = length + selection);
                    3 === node.nodeType && (length += node.nodeValue.length);
                    if (null === (next = node.firstChild)) break;
                    parentNode = node;
                    node = next;
                  }
                  for (; ; ) {
                    if (node === root2) break b;
                    parentNode === JSCompiler_temp && ++indexWithinAnchor === anchorOffset && (start = length);
                    parentNode === focusNode && ++indexWithinFocus === selection && (end = length);
                    if (null !== (next = node.nextSibling)) break;
                    node = parentNode;
                    parentNode = node.parentNode;
                  }
                  node = next;
                }
                JSCompiler_temp = -1 === start || -1 === end ? null : { start, end };
              } else JSCompiler_temp = null;
            }
          JSCompiler_temp = JSCompiler_temp || { start: 0, end: 0 };
        } else JSCompiler_temp = null;
        selectionInformation = { focusedElem: root2, selectionRange: JSCompiler_temp };
        _enabled = false;
        for (nextEffect = firstChild; null !== nextEffect; )
          if (firstChild = nextEffect, root2 = firstChild.child, 0 !== (firstChild.subtreeFlags & 1028) && null !== root2)
            root2.return = firstChild, nextEffect = root2;
          else
            for (; null !== nextEffect; ) {
              firstChild = nextEffect;
              focusNode = firstChild.alternate;
              root2 = firstChild.flags;
              switch (firstChild.tag) {
                case 0:
                  if (0 !== (root2 & 4) && (root2 = firstChild.updateQueue, root2 = null !== root2 ? root2.events : null, null !== root2))
                    for (JSCompiler_temp = 0; JSCompiler_temp < root2.length; JSCompiler_temp++)
                      anchorOffset = root2[JSCompiler_temp], anchorOffset.ref.impl = anchorOffset.nextImpl;
                  break;
                case 11:
                case 15:
                  break;
                case 1:
                  if (0 !== (root2 & 1024) && null !== focusNode) {
                    root2 = void 0;
                    JSCompiler_temp = firstChild;
                    anchorOffset = focusNode.memoizedProps;
                    focusNode = focusNode.memoizedState;
                    selection = JSCompiler_temp.stateNode;
                    try {
                      var resolvedPrevProps = resolveClassComponentProps(
                        JSCompiler_temp.type,
                        anchorOffset
                      );
                      root2 = selection.getSnapshotBeforeUpdate(
                        resolvedPrevProps,
                        focusNode
                      );
                      selection.__reactInternalSnapshotBeforeUpdate = root2;
                    } catch (error) {
                      captureCommitPhaseError(
                        JSCompiler_temp,
                        JSCompiler_temp.return,
                        error
                      );
                    }
                  }
                  break;
                case 3:
                  if (0 !== (root2 & 1024)) {
                    if (root2 = firstChild.stateNode.containerInfo, JSCompiler_temp = root2.nodeType, 9 === JSCompiler_temp)
                      clearContainerSparingly(root2);
                    else if (1 === JSCompiler_temp)
                      switch (root2.nodeName) {
                        case "HEAD":
                        case "HTML":
                        case "BODY":
                          clearContainerSparingly(root2);
                          break;
                        default:
                          root2.textContent = "";
                      }
                  }
                  break;
                case 5:
                case 26:
                case 27:
                case 6:
                case 4:
                case 17:
                  break;
                default:
                  if (0 !== (root2 & 1024)) throw Error(formatProdErrorMessage(163));
              }
              root2 = firstChild.sibling;
              if (null !== root2) {
                root2.return = firstChild.return;
                nextEffect = root2;
                break;
              }
              nextEffect = firstChild.return;
            }
      }
      function commitLayoutEffectOnFiber(finishedRoot, current, finishedWork) {
        var flags = finishedWork.flags;
        switch (finishedWork.tag) {
          case 0:
          case 11:
          case 15:
            recursivelyTraverseLayoutEffects(finishedRoot, finishedWork);
            flags & 4 && commitHookEffectListMount(5, finishedWork);
            break;
          case 1:
            recursivelyTraverseLayoutEffects(finishedRoot, finishedWork);
            if (flags & 4)
              if (finishedRoot = finishedWork.stateNode, null === current)
                try {
                  finishedRoot.componentDidMount();
                } catch (error) {
                  captureCommitPhaseError(finishedWork, finishedWork.return, error);
                }
              else {
                var prevProps = resolveClassComponentProps(
                  finishedWork.type,
                  current.memoizedProps
                );
                current = current.memoizedState;
                try {
                  finishedRoot.componentDidUpdate(
                    prevProps,
                    current,
                    finishedRoot.__reactInternalSnapshotBeforeUpdate
                  );
                } catch (error$139) {
                  captureCommitPhaseError(
                    finishedWork,
                    finishedWork.return,
                    error$139
                  );
                }
              }
            flags & 64 && commitClassCallbacks(finishedWork);
            flags & 512 && safelyAttachRef(finishedWork, finishedWork.return);
            break;
          case 3:
            recursivelyTraverseLayoutEffects(finishedRoot, finishedWork);
            if (flags & 64 && (finishedRoot = finishedWork.updateQueue, null !== finishedRoot)) {
              current = null;
              if (null !== finishedWork.child)
                switch (finishedWork.child.tag) {
                  case 27:
                  case 5:
                    current = finishedWork.child.stateNode;
                    break;
                  case 1:
                    current = finishedWork.child.stateNode;
                }
              try {
                commitCallbacks(finishedRoot, current);
              } catch (error) {
                captureCommitPhaseError(finishedWork, finishedWork.return, error);
              }
            }
            break;
          case 27:
            null === current && flags & 4 && commitHostSingletonAcquisition(finishedWork);
          case 26:
          case 5:
            recursivelyTraverseLayoutEffects(finishedRoot, finishedWork);
            null === current && flags & 4 && commitHostMount(finishedWork);
            flags & 512 && safelyAttachRef(finishedWork, finishedWork.return);
            break;
          case 12:
            recursivelyTraverseLayoutEffects(finishedRoot, finishedWork);
            break;
          case 31:
            recursivelyTraverseLayoutEffects(finishedRoot, finishedWork);
            flags & 4 && commitActivityHydrationCallbacks(finishedRoot, finishedWork);
            break;
          case 13:
            recursivelyTraverseLayoutEffects(finishedRoot, finishedWork);
            flags & 4 && commitSuspenseHydrationCallbacks(finishedRoot, finishedWork);
            flags & 64 && (finishedRoot = finishedWork.memoizedState, null !== finishedRoot && (finishedRoot = finishedRoot.dehydrated, null !== finishedRoot && (finishedWork = retryDehydratedSuspenseBoundary.bind(
              null,
              finishedWork
            ), registerSuspenseInstanceRetry(finishedRoot, finishedWork))));
            break;
          case 22:
            flags = null !== finishedWork.memoizedState || offscreenSubtreeIsHidden;
            if (!flags) {
              current = null !== current && null !== current.memoizedState || offscreenSubtreeWasHidden;
              prevProps = offscreenSubtreeIsHidden;
              var prevOffscreenSubtreeWasHidden = offscreenSubtreeWasHidden;
              offscreenSubtreeIsHidden = flags;
              (offscreenSubtreeWasHidden = current) && !prevOffscreenSubtreeWasHidden ? recursivelyTraverseReappearLayoutEffects(
                finishedRoot,
                finishedWork,
                0 !== (finishedWork.subtreeFlags & 8772)
              ) : recursivelyTraverseLayoutEffects(finishedRoot, finishedWork);
              offscreenSubtreeIsHidden = prevProps;
              offscreenSubtreeWasHidden = prevOffscreenSubtreeWasHidden;
            }
            break;
          case 30:
            break;
          default:
            recursivelyTraverseLayoutEffects(finishedRoot, finishedWork);
        }
      }
      function detachFiberAfterEffects(fiber) {
        var alternate = fiber.alternate;
        null !== alternate && (fiber.alternate = null, detachFiberAfterEffects(alternate));
        fiber.child = null;
        fiber.deletions = null;
        fiber.sibling = null;
        5 === fiber.tag && (alternate = fiber.stateNode, null !== alternate && detachDeletedInstance(alternate));
        fiber.stateNode = null;
        fiber.return = null;
        fiber.dependencies = null;
        fiber.memoizedProps = null;
        fiber.memoizedState = null;
        fiber.pendingProps = null;
        fiber.stateNode = null;
        fiber.updateQueue = null;
      }
      var hostParent = null;
      var hostParentIsContainer = false;
      function recursivelyTraverseDeletionEffects(finishedRoot, nearestMountedAncestor, parent) {
        for (parent = parent.child; null !== parent; )
          commitDeletionEffectsOnFiber(finishedRoot, nearestMountedAncestor, parent), parent = parent.sibling;
      }
      function commitDeletionEffectsOnFiber(finishedRoot, nearestMountedAncestor, deletedFiber) {
        if (injectedHook && "function" === typeof injectedHook.onCommitFiberUnmount)
          try {
            injectedHook.onCommitFiberUnmount(rendererID, deletedFiber);
          } catch (err) {
          }
        switch (deletedFiber.tag) {
          case 26:
            offscreenSubtreeWasHidden || safelyDetachRef(deletedFiber, nearestMountedAncestor);
            recursivelyTraverseDeletionEffects(
              finishedRoot,
              nearestMountedAncestor,
              deletedFiber
            );
            deletedFiber.memoizedState ? deletedFiber.memoizedState.count-- : deletedFiber.stateNode && (deletedFiber = deletedFiber.stateNode, deletedFiber.parentNode.removeChild(deletedFiber));
            break;
          case 27:
            offscreenSubtreeWasHidden || safelyDetachRef(deletedFiber, nearestMountedAncestor);
            var prevHostParent = hostParent, prevHostParentIsContainer = hostParentIsContainer;
            isSingletonScope(deletedFiber.type) && (hostParent = deletedFiber.stateNode, hostParentIsContainer = false);
            recursivelyTraverseDeletionEffects(
              finishedRoot,
              nearestMountedAncestor,
              deletedFiber
            );
            releaseSingletonInstance(deletedFiber.stateNode);
            hostParent = prevHostParent;
            hostParentIsContainer = prevHostParentIsContainer;
            break;
          case 5:
            offscreenSubtreeWasHidden || safelyDetachRef(deletedFiber, nearestMountedAncestor);
          case 6:
            prevHostParent = hostParent;
            prevHostParentIsContainer = hostParentIsContainer;
            hostParent = null;
            recursivelyTraverseDeletionEffects(
              finishedRoot,
              nearestMountedAncestor,
              deletedFiber
            );
            hostParent = prevHostParent;
            hostParentIsContainer = prevHostParentIsContainer;
            if (null !== hostParent)
              if (hostParentIsContainer)
                try {
                  (9 === hostParent.nodeType ? hostParent.body : "HTML" === hostParent.nodeName ? hostParent.ownerDocument.body : hostParent).removeChild(deletedFiber.stateNode);
                } catch (error) {
                  captureCommitPhaseError(
                    deletedFiber,
                    nearestMountedAncestor,
                    error
                  );
                }
              else
                try {
                  hostParent.removeChild(deletedFiber.stateNode);
                } catch (error) {
                  captureCommitPhaseError(
                    deletedFiber,
                    nearestMountedAncestor,
                    error
                  );
                }
            break;
          case 18:
            null !== hostParent && (hostParentIsContainer ? (finishedRoot = hostParent, clearHydrationBoundary(
              9 === finishedRoot.nodeType ? finishedRoot.body : "HTML" === finishedRoot.nodeName ? finishedRoot.ownerDocument.body : finishedRoot,
              deletedFiber.stateNode
            ), retryIfBlockedOn(finishedRoot)) : clearHydrationBoundary(hostParent, deletedFiber.stateNode));
            break;
          case 4:
            prevHostParent = hostParent;
            prevHostParentIsContainer = hostParentIsContainer;
            hostParent = deletedFiber.stateNode.containerInfo;
            hostParentIsContainer = true;
            recursivelyTraverseDeletionEffects(
              finishedRoot,
              nearestMountedAncestor,
              deletedFiber
            );
            hostParent = prevHostParent;
            hostParentIsContainer = prevHostParentIsContainer;
            break;
          case 0:
          case 11:
          case 14:
          case 15:
            commitHookEffectListUnmount(2, deletedFiber, nearestMountedAncestor);
            offscreenSubtreeWasHidden || commitHookEffectListUnmount(4, deletedFiber, nearestMountedAncestor);
            recursivelyTraverseDeletionEffects(
              finishedRoot,
              nearestMountedAncestor,
              deletedFiber
            );
            break;
          case 1:
            offscreenSubtreeWasHidden || (safelyDetachRef(deletedFiber, nearestMountedAncestor), prevHostParent = deletedFiber.stateNode, "function" === typeof prevHostParent.componentWillUnmount && safelyCallComponentWillUnmount(
              deletedFiber,
              nearestMountedAncestor,
              prevHostParent
            ));
            recursivelyTraverseDeletionEffects(
              finishedRoot,
              nearestMountedAncestor,
              deletedFiber
            );
            break;
          case 21:
            recursivelyTraverseDeletionEffects(
              finishedRoot,
              nearestMountedAncestor,
              deletedFiber
            );
            break;
          case 22:
            offscreenSubtreeWasHidden = (prevHostParent = offscreenSubtreeWasHidden) || null !== deletedFiber.memoizedState;
            recursivelyTraverseDeletionEffects(
              finishedRoot,
              nearestMountedAncestor,
              deletedFiber
            );
            offscreenSubtreeWasHidden = prevHostParent;
            break;
          default:
            recursivelyTraverseDeletionEffects(
              finishedRoot,
              nearestMountedAncestor,
              deletedFiber
            );
        }
      }
      function commitActivityHydrationCallbacks(finishedRoot, finishedWork) {
        if (null === finishedWork.memoizedState && (finishedRoot = finishedWork.alternate, null !== finishedRoot && (finishedRoot = finishedRoot.memoizedState, null !== finishedRoot))) {
          finishedRoot = finishedRoot.dehydrated;
          try {
            retryIfBlockedOn(finishedRoot);
          } catch (error) {
            captureCommitPhaseError(finishedWork, finishedWork.return, error);
          }
        }
      }
      function commitSuspenseHydrationCallbacks(finishedRoot, finishedWork) {
        if (null === finishedWork.memoizedState && (finishedRoot = finishedWork.alternate, null !== finishedRoot && (finishedRoot = finishedRoot.memoizedState, null !== finishedRoot && (finishedRoot = finishedRoot.dehydrated, null !== finishedRoot))))
          try {
            retryIfBlockedOn(finishedRoot);
          } catch (error) {
            captureCommitPhaseError(finishedWork, finishedWork.return, error);
          }
      }
      function getRetryCache(finishedWork) {
        switch (finishedWork.tag) {
          case 31:
          case 13:
          case 19:
            var retryCache = finishedWork.stateNode;
            null === retryCache && (retryCache = finishedWork.stateNode = new PossiblyWeakSet());
            return retryCache;
          case 22:
            return finishedWork = finishedWork.stateNode, retryCache = finishedWork._retryCache, null === retryCache && (retryCache = finishedWork._retryCache = new PossiblyWeakSet()), retryCache;
          default:
            throw Error(formatProdErrorMessage(435, finishedWork.tag));
        }
      }
      function attachSuspenseRetryListeners(finishedWork, wakeables) {
        var retryCache = getRetryCache(finishedWork);
        wakeables.forEach(function(wakeable) {
          if (!retryCache.has(wakeable)) {
            retryCache.add(wakeable);
            var retry = resolveRetryWakeable.bind(null, finishedWork, wakeable);
            wakeable.then(retry, retry);
          }
        });
      }
      function recursivelyTraverseMutationEffects(root$jscomp$0, parentFiber) {
        var deletions = parentFiber.deletions;
        if (null !== deletions)
          for (var i = 0; i < deletions.length; i++) {
            var childToDelete = deletions[i], root2 = root$jscomp$0, returnFiber = parentFiber, parent = returnFiber;
            a: for (; null !== parent; ) {
              switch (parent.tag) {
                case 27:
                  if (isSingletonScope(parent.type)) {
                    hostParent = parent.stateNode;
                    hostParentIsContainer = false;
                    break a;
                  }
                  break;
                case 5:
                  hostParent = parent.stateNode;
                  hostParentIsContainer = false;
                  break a;
                case 3:
                case 4:
                  hostParent = parent.stateNode.containerInfo;
                  hostParentIsContainer = true;
                  break a;
              }
              parent = parent.return;
            }
            if (null === hostParent) throw Error(formatProdErrorMessage(160));
            commitDeletionEffectsOnFiber(root2, returnFiber, childToDelete);
            hostParent = null;
            hostParentIsContainer = false;
            root2 = childToDelete.alternate;
            null !== root2 && (root2.return = null);
            childToDelete.return = null;
          }
        if (parentFiber.subtreeFlags & 13886)
          for (parentFiber = parentFiber.child; null !== parentFiber; )
            commitMutationEffectsOnFiber(parentFiber, root$jscomp$0), parentFiber = parentFiber.sibling;
      }
      var currentHoistableRoot = null;
      function commitMutationEffectsOnFiber(finishedWork, root2) {
        var current = finishedWork.alternate, flags = finishedWork.flags;
        switch (finishedWork.tag) {
          case 0:
          case 11:
          case 14:
          case 15:
            recursivelyTraverseMutationEffects(root2, finishedWork);
            commitReconciliationEffects(finishedWork);
            flags & 4 && (commitHookEffectListUnmount(3, finishedWork, finishedWork.return), commitHookEffectListMount(3, finishedWork), commitHookEffectListUnmount(5, finishedWork, finishedWork.return));
            break;
          case 1:
            recursivelyTraverseMutationEffects(root2, finishedWork);
            commitReconciliationEffects(finishedWork);
            flags & 512 && (offscreenSubtreeWasHidden || null === current || safelyDetachRef(current, current.return));
            flags & 64 && offscreenSubtreeIsHidden && (finishedWork = finishedWork.updateQueue, null !== finishedWork && (flags = finishedWork.callbacks, null !== flags && (current = finishedWork.shared.hiddenCallbacks, finishedWork.shared.hiddenCallbacks = null === current ? flags : current.concat(flags))));
            break;
          case 26:
            var hoistableRoot = currentHoistableRoot;
            recursivelyTraverseMutationEffects(root2, finishedWork);
            commitReconciliationEffects(finishedWork);
            flags & 512 && (offscreenSubtreeWasHidden || null === current || safelyDetachRef(current, current.return));
            if (flags & 4) {
              var currentResource = null !== current ? current.memoizedState : null;
              flags = finishedWork.memoizedState;
              if (null === current)
                if (null === flags)
                  if (null === finishedWork.stateNode) {
                    a: {
                      flags = finishedWork.type;
                      current = finishedWork.memoizedProps;
                      hoistableRoot = hoistableRoot.ownerDocument || hoistableRoot;
                      b: switch (flags) {
                        case "title":
                          currentResource = hoistableRoot.getElementsByTagName("title")[0];
                          if (!currentResource || currentResource[internalHoistableMarker] || currentResource[internalInstanceKey] || "http://www.w3.org/2000/svg" === currentResource.namespaceURI || currentResource.hasAttribute("itemprop"))
                            currentResource = hoistableRoot.createElement(flags), hoistableRoot.head.insertBefore(
                              currentResource,
                              hoistableRoot.querySelector("head > title")
                            );
                          setInitialProperties(currentResource, flags, current);
                          currentResource[internalInstanceKey] = finishedWork;
                          markNodeAsHoistable(currentResource);
                          flags = currentResource;
                          break a;
                        case "link":
                          var maybeNodes = getHydratableHoistableCache(
                            "link",
                            "href",
                            hoistableRoot
                          ).get(flags + (current.href || ""));
                          if (maybeNodes) {
                            for (var i = 0; i < maybeNodes.length; i++)
                              if (currentResource = maybeNodes[i], currentResource.getAttribute("href") === (null == current.href || "" === current.href ? null : current.href) && currentResource.getAttribute("rel") === (null == current.rel ? null : current.rel) && currentResource.getAttribute("title") === (null == current.title ? null : current.title) && currentResource.getAttribute("crossorigin") === (null == current.crossOrigin ? null : current.crossOrigin)) {
                                maybeNodes.splice(i, 1);
                                break b;
                              }
                          }
                          currentResource = hoistableRoot.createElement(flags);
                          setInitialProperties(currentResource, flags, current);
                          hoistableRoot.head.appendChild(currentResource);
                          break;
                        case "meta":
                          if (maybeNodes = getHydratableHoistableCache(
                            "meta",
                            "content",
                            hoistableRoot
                          ).get(flags + (current.content || ""))) {
                            for (i = 0; i < maybeNodes.length; i++)
                              if (currentResource = maybeNodes[i], currentResource.getAttribute("content") === (null == current.content ? null : "" + current.content) && currentResource.getAttribute("name") === (null == current.name ? null : current.name) && currentResource.getAttribute("property") === (null == current.property ? null : current.property) && currentResource.getAttribute("http-equiv") === (null == current.httpEquiv ? null : current.httpEquiv) && currentResource.getAttribute("charset") === (null == current.charSet ? null : current.charSet)) {
                                maybeNodes.splice(i, 1);
                                break b;
                              }
                          }
                          currentResource = hoistableRoot.createElement(flags);
                          setInitialProperties(currentResource, flags, current);
                          hoistableRoot.head.appendChild(currentResource);
                          break;
                        default:
                          throw Error(formatProdErrorMessage(468, flags));
                      }
                      currentResource[internalInstanceKey] = finishedWork;
                      markNodeAsHoistable(currentResource);
                      flags = currentResource;
                    }
                    finishedWork.stateNode = flags;
                  } else
                    mountHoistable(
                      hoistableRoot,
                      finishedWork.type,
                      finishedWork.stateNode
                    );
                else
                  finishedWork.stateNode = acquireResource(
                    hoistableRoot,
                    flags,
                    finishedWork.memoizedProps
                  );
              else
                currentResource !== flags ? (null === currentResource ? null !== current.stateNode && (current = current.stateNode, current.parentNode.removeChild(current)) : currentResource.count--, null === flags ? mountHoistable(
                  hoistableRoot,
                  finishedWork.type,
                  finishedWork.stateNode
                ) : acquireResource(
                  hoistableRoot,
                  flags,
                  finishedWork.memoizedProps
                )) : null === flags && null !== finishedWork.stateNode && commitHostUpdate(
                  finishedWork,
                  finishedWork.memoizedProps,
                  current.memoizedProps
                );
            }
            break;
          case 27:
            recursivelyTraverseMutationEffects(root2, finishedWork);
            commitReconciliationEffects(finishedWork);
            flags & 512 && (offscreenSubtreeWasHidden || null === current || safelyDetachRef(current, current.return));
            null !== current && flags & 4 && commitHostUpdate(
              finishedWork,
              finishedWork.memoizedProps,
              current.memoizedProps
            );
            break;
          case 5:
            recursivelyTraverseMutationEffects(root2, finishedWork);
            commitReconciliationEffects(finishedWork);
            flags & 512 && (offscreenSubtreeWasHidden || null === current || safelyDetachRef(current, current.return));
            if (finishedWork.flags & 32) {
              hoistableRoot = finishedWork.stateNode;
              try {
                setTextContent(hoistableRoot, "");
              } catch (error) {
                captureCommitPhaseError(finishedWork, finishedWork.return, error);
              }
            }
            flags & 4 && null != finishedWork.stateNode && (hoistableRoot = finishedWork.memoizedProps, commitHostUpdate(
              finishedWork,
              hoistableRoot,
              null !== current ? current.memoizedProps : hoistableRoot
            ));
            flags & 1024 && (needsFormReset = true);
            break;
          case 6:
            recursivelyTraverseMutationEffects(root2, finishedWork);
            commitReconciliationEffects(finishedWork);
            if (flags & 4) {
              if (null === finishedWork.stateNode)
                throw Error(formatProdErrorMessage(162));
              flags = finishedWork.memoizedProps;
              current = finishedWork.stateNode;
              try {
                current.nodeValue = flags;
              } catch (error) {
                captureCommitPhaseError(finishedWork, finishedWork.return, error);
              }
            }
            break;
          case 3:
            tagCaches = null;
            hoistableRoot = currentHoistableRoot;
            currentHoistableRoot = getHoistableRoot(root2.containerInfo);
            recursivelyTraverseMutationEffects(root2, finishedWork);
            currentHoistableRoot = hoistableRoot;
            commitReconciliationEffects(finishedWork);
            if (flags & 4 && null !== current && current.memoizedState.isDehydrated)
              try {
                retryIfBlockedOn(root2.containerInfo);
              } catch (error) {
                captureCommitPhaseError(finishedWork, finishedWork.return, error);
              }
            needsFormReset && (needsFormReset = false, recursivelyResetForms(finishedWork));
            break;
          case 4:
            flags = currentHoistableRoot;
            currentHoistableRoot = getHoistableRoot(
              finishedWork.stateNode.containerInfo
            );
            recursivelyTraverseMutationEffects(root2, finishedWork);
            commitReconciliationEffects(finishedWork);
            currentHoistableRoot = flags;
            break;
          case 12:
            recursivelyTraverseMutationEffects(root2, finishedWork);
            commitReconciliationEffects(finishedWork);
            break;
          case 31:
            recursivelyTraverseMutationEffects(root2, finishedWork);
            commitReconciliationEffects(finishedWork);
            flags & 4 && (flags = finishedWork.updateQueue, null !== flags && (finishedWork.updateQueue = null, attachSuspenseRetryListeners(finishedWork, flags)));
            break;
          case 13:
            recursivelyTraverseMutationEffects(root2, finishedWork);
            commitReconciliationEffects(finishedWork);
            finishedWork.child.flags & 8192 && null !== finishedWork.memoizedState !== (null !== current && null !== current.memoizedState) && (globalMostRecentFallbackTime = now());
            flags & 4 && (flags = finishedWork.updateQueue, null !== flags && (finishedWork.updateQueue = null, attachSuspenseRetryListeners(finishedWork, flags)));
            break;
          case 22:
            hoistableRoot = null !== finishedWork.memoizedState;
            var wasHidden = null !== current && null !== current.memoizedState, prevOffscreenSubtreeIsHidden = offscreenSubtreeIsHidden, prevOffscreenSubtreeWasHidden = offscreenSubtreeWasHidden;
            offscreenSubtreeIsHidden = prevOffscreenSubtreeIsHidden || hoistableRoot;
            offscreenSubtreeWasHidden = prevOffscreenSubtreeWasHidden || wasHidden;
            recursivelyTraverseMutationEffects(root2, finishedWork);
            offscreenSubtreeWasHidden = prevOffscreenSubtreeWasHidden;
            offscreenSubtreeIsHidden = prevOffscreenSubtreeIsHidden;
            commitReconciliationEffects(finishedWork);
            if (flags & 8192)
              a: for (root2 = finishedWork.stateNode, root2._visibility = hoistableRoot ? root2._visibility & -2 : root2._visibility | 1, hoistableRoot && (null === current || wasHidden || offscreenSubtreeIsHidden || offscreenSubtreeWasHidden || recursivelyTraverseDisappearLayoutEffects(finishedWork)), current = null, root2 = finishedWork; ; ) {
                if (5 === root2.tag || 26 === root2.tag) {
                  if (null === current) {
                    wasHidden = current = root2;
                    try {
                      if (currentResource = wasHidden.stateNode, hoistableRoot)
                        maybeNodes = currentResource.style, "function" === typeof maybeNodes.setProperty ? maybeNodes.setProperty("display", "none", "important") : maybeNodes.display = "none";
                      else {
                        i = wasHidden.stateNode;
                        var styleProp = wasHidden.memoizedProps.style, display = void 0 !== styleProp && null !== styleProp && styleProp.hasOwnProperty("display") ? styleProp.display : null;
                        i.style.display = null == display || "boolean" === typeof display ? "" : ("" + display).trim();
                      }
                    } catch (error) {
                      captureCommitPhaseError(wasHidden, wasHidden.return, error);
                    }
                  }
                } else if (6 === root2.tag) {
                  if (null === current) {
                    wasHidden = root2;
                    try {
                      wasHidden.stateNode.nodeValue = hoistableRoot ? "" : wasHidden.memoizedProps;
                    } catch (error) {
                      captureCommitPhaseError(wasHidden, wasHidden.return, error);
                    }
                  }
                } else if (18 === root2.tag) {
                  if (null === current) {
                    wasHidden = root2;
                    try {
                      var instance = wasHidden.stateNode;
                      hoistableRoot ? hideOrUnhideDehydratedBoundary(instance, true) : hideOrUnhideDehydratedBoundary(wasHidden.stateNode, false);
                    } catch (error) {
                      captureCommitPhaseError(wasHidden, wasHidden.return, error);
                    }
                  }
                } else if ((22 !== root2.tag && 23 !== root2.tag || null === root2.memoizedState || root2 === finishedWork) && null !== root2.child) {
                  root2.child.return = root2;
                  root2 = root2.child;
                  continue;
                }
                if (root2 === finishedWork) break a;
                for (; null === root2.sibling; ) {
                  if (null === root2.return || root2.return === finishedWork) break a;
                  current === root2 && (current = null);
                  root2 = root2.return;
                }
                current === root2 && (current = null);
                root2.sibling.return = root2.return;
                root2 = root2.sibling;
              }
            flags & 4 && (flags = finishedWork.updateQueue, null !== flags && (current = flags.retryQueue, null !== current && (flags.retryQueue = null, attachSuspenseRetryListeners(finishedWork, current))));
            break;
          case 19:
            recursivelyTraverseMutationEffects(root2, finishedWork);
            commitReconciliationEffects(finishedWork);
            flags & 4 && (flags = finishedWork.updateQueue, null !== flags && (finishedWork.updateQueue = null, attachSuspenseRetryListeners(finishedWork, flags)));
            break;
          case 30:
            break;
          case 21:
            break;
          default:
            recursivelyTraverseMutationEffects(root2, finishedWork), commitReconciliationEffects(finishedWork);
        }
      }
      function commitReconciliationEffects(finishedWork) {
        var flags = finishedWork.flags;
        if (flags & 2) {
          try {
            for (var hostParentFiber, parentFiber = finishedWork.return; null !== parentFiber; ) {
              if (isHostParent(parentFiber)) {
                hostParentFiber = parentFiber;
                break;
              }
              parentFiber = parentFiber.return;
            }
            if (null == hostParentFiber) throw Error(formatProdErrorMessage(160));
            switch (hostParentFiber.tag) {
              case 27:
                var parent = hostParentFiber.stateNode, before = getHostSibling(finishedWork);
                insertOrAppendPlacementNode(finishedWork, before, parent);
                break;
              case 5:
                var parent$141 = hostParentFiber.stateNode;
                hostParentFiber.flags & 32 && (setTextContent(parent$141, ""), hostParentFiber.flags &= -33);
                var before$142 = getHostSibling(finishedWork);
                insertOrAppendPlacementNode(finishedWork, before$142, parent$141);
                break;
              case 3:
              case 4:
                var parent$143 = hostParentFiber.stateNode.containerInfo, before$144 = getHostSibling(finishedWork);
                insertOrAppendPlacementNodeIntoContainer(
                  finishedWork,
                  before$144,
                  parent$143
                );
                break;
              default:
                throw Error(formatProdErrorMessage(161));
            }
          } catch (error) {
            captureCommitPhaseError(finishedWork, finishedWork.return, error);
          }
          finishedWork.flags &= -3;
        }
        flags & 4096 && (finishedWork.flags &= -4097);
      }
      function recursivelyResetForms(parentFiber) {
        if (parentFiber.subtreeFlags & 1024)
          for (parentFiber = parentFiber.child; null !== parentFiber; ) {
            var fiber = parentFiber;
            recursivelyResetForms(fiber);
            5 === fiber.tag && fiber.flags & 1024 && fiber.stateNode.reset();
            parentFiber = parentFiber.sibling;
          }
      }
      function recursivelyTraverseLayoutEffects(root2, parentFiber) {
        if (parentFiber.subtreeFlags & 8772)
          for (parentFiber = parentFiber.child; null !== parentFiber; )
            commitLayoutEffectOnFiber(root2, parentFiber.alternate, parentFiber), parentFiber = parentFiber.sibling;
      }
      function recursivelyTraverseDisappearLayoutEffects(parentFiber) {
        for (parentFiber = parentFiber.child; null !== parentFiber; ) {
          var finishedWork = parentFiber;
          switch (finishedWork.tag) {
            case 0:
            case 11:
            case 14:
            case 15:
              commitHookEffectListUnmount(4, finishedWork, finishedWork.return);
              recursivelyTraverseDisappearLayoutEffects(finishedWork);
              break;
            case 1:
              safelyDetachRef(finishedWork, finishedWork.return);
              var instance = finishedWork.stateNode;
              "function" === typeof instance.componentWillUnmount && safelyCallComponentWillUnmount(
                finishedWork,
                finishedWork.return,
                instance
              );
              recursivelyTraverseDisappearLayoutEffects(finishedWork);
              break;
            case 27:
              releaseSingletonInstance(finishedWork.stateNode);
            case 26:
            case 5:
              safelyDetachRef(finishedWork, finishedWork.return);
              recursivelyTraverseDisappearLayoutEffects(finishedWork);
              break;
            case 22:
              null === finishedWork.memoizedState && recursivelyTraverseDisappearLayoutEffects(finishedWork);
              break;
            case 30:
              recursivelyTraverseDisappearLayoutEffects(finishedWork);
              break;
            default:
              recursivelyTraverseDisappearLayoutEffects(finishedWork);
          }
          parentFiber = parentFiber.sibling;
        }
      }
      function recursivelyTraverseReappearLayoutEffects(finishedRoot$jscomp$0, parentFiber, includeWorkInProgressEffects) {
        includeWorkInProgressEffects = includeWorkInProgressEffects && 0 !== (parentFiber.subtreeFlags & 8772);
        for (parentFiber = parentFiber.child; null !== parentFiber; ) {
          var current = parentFiber.alternate, finishedRoot = finishedRoot$jscomp$0, finishedWork = parentFiber, flags = finishedWork.flags;
          switch (finishedWork.tag) {
            case 0:
            case 11:
            case 15:
              recursivelyTraverseReappearLayoutEffects(
                finishedRoot,
                finishedWork,
                includeWorkInProgressEffects
              );
              commitHookEffectListMount(4, finishedWork);
              break;
            case 1:
              recursivelyTraverseReappearLayoutEffects(
                finishedRoot,
                finishedWork,
                includeWorkInProgressEffects
              );
              current = finishedWork;
              finishedRoot = current.stateNode;
              if ("function" === typeof finishedRoot.componentDidMount)
                try {
                  finishedRoot.componentDidMount();
                } catch (error) {
                  captureCommitPhaseError(current, current.return, error);
                }
              current = finishedWork;
              finishedRoot = current.updateQueue;
              if (null !== finishedRoot) {
                var instance = current.stateNode;
                try {
                  var hiddenCallbacks = finishedRoot.shared.hiddenCallbacks;
                  if (null !== hiddenCallbacks)
                    for (finishedRoot.shared.hiddenCallbacks = null, finishedRoot = 0; finishedRoot < hiddenCallbacks.length; finishedRoot++)
                      callCallback(hiddenCallbacks[finishedRoot], instance);
                } catch (error) {
                  captureCommitPhaseError(current, current.return, error);
                }
              }
              includeWorkInProgressEffects && flags & 64 && commitClassCallbacks(finishedWork);
              safelyAttachRef(finishedWork, finishedWork.return);
              break;
            case 27:
              commitHostSingletonAcquisition(finishedWork);
            case 26:
            case 5:
              recursivelyTraverseReappearLayoutEffects(
                finishedRoot,
                finishedWork,
                includeWorkInProgressEffects
              );
              includeWorkInProgressEffects && null === current && flags & 4 && commitHostMount(finishedWork);
              safelyAttachRef(finishedWork, finishedWork.return);
              break;
            case 12:
              recursivelyTraverseReappearLayoutEffects(
                finishedRoot,
                finishedWork,
                includeWorkInProgressEffects
              );
              break;
            case 31:
              recursivelyTraverseReappearLayoutEffects(
                finishedRoot,
                finishedWork,
                includeWorkInProgressEffects
              );
              includeWorkInProgressEffects && flags & 4 && commitActivityHydrationCallbacks(finishedRoot, finishedWork);
              break;
            case 13:
              recursivelyTraverseReappearLayoutEffects(
                finishedRoot,
                finishedWork,
                includeWorkInProgressEffects
              );
              includeWorkInProgressEffects && flags & 4 && commitSuspenseHydrationCallbacks(finishedRoot, finishedWork);
              break;
            case 22:
              null === finishedWork.memoizedState && recursivelyTraverseReappearLayoutEffects(
                finishedRoot,
                finishedWork,
                includeWorkInProgressEffects
              );
              safelyAttachRef(finishedWork, finishedWork.return);
              break;
            case 30:
              break;
            default:
              recursivelyTraverseReappearLayoutEffects(
                finishedRoot,
                finishedWork,
                includeWorkInProgressEffects
              );
          }
          parentFiber = parentFiber.sibling;
        }
      }
      function commitOffscreenPassiveMountEffects(current, finishedWork) {
        var previousCache = null;
        null !== current && null !== current.memoizedState && null !== current.memoizedState.cachePool && (previousCache = current.memoizedState.cachePool.pool);
        current = null;
        null !== finishedWork.memoizedState && null !== finishedWork.memoizedState.cachePool && (current = finishedWork.memoizedState.cachePool.pool);
        current !== previousCache && (null != current && current.refCount++, null != previousCache && releaseCache(previousCache));
      }
      function commitCachePassiveMountEffect(current, finishedWork) {
        current = null;
        null !== finishedWork.alternate && (current = finishedWork.alternate.memoizedState.cache);
        finishedWork = finishedWork.memoizedState.cache;
        finishedWork !== current && (finishedWork.refCount++, null != current && releaseCache(current));
      }
      function recursivelyTraversePassiveMountEffects(root2, parentFiber, committedLanes, committedTransitions) {
        if (parentFiber.subtreeFlags & 10256)
          for (parentFiber = parentFiber.child; null !== parentFiber; )
            commitPassiveMountOnFiber(
              root2,
              parentFiber,
              committedLanes,
              committedTransitions
            ), parentFiber = parentFiber.sibling;
      }
      function commitPassiveMountOnFiber(finishedRoot, finishedWork, committedLanes, committedTransitions) {
        var flags = finishedWork.flags;
        switch (finishedWork.tag) {
          case 0:
          case 11:
          case 15:
            recursivelyTraversePassiveMountEffects(
              finishedRoot,
              finishedWork,
              committedLanes,
              committedTransitions
            );
            flags & 2048 && commitHookEffectListMount(9, finishedWork);
            break;
          case 1:
            recursivelyTraversePassiveMountEffects(
              finishedRoot,
              finishedWork,
              committedLanes,
              committedTransitions
            );
            break;
          case 3:
            recursivelyTraversePassiveMountEffects(
              finishedRoot,
              finishedWork,
              committedLanes,
              committedTransitions
            );
            flags & 2048 && (finishedRoot = null, null !== finishedWork.alternate && (finishedRoot = finishedWork.alternate.memoizedState.cache), finishedWork = finishedWork.memoizedState.cache, finishedWork !== finishedRoot && (finishedWork.refCount++, null != finishedRoot && releaseCache(finishedRoot)));
            break;
          case 12:
            if (flags & 2048) {
              recursivelyTraversePassiveMountEffects(
                finishedRoot,
                finishedWork,
                committedLanes,
                committedTransitions
              );
              finishedRoot = finishedWork.stateNode;
              try {
                var _finishedWork$memoize2 = finishedWork.memoizedProps, id = _finishedWork$memoize2.id, onPostCommit = _finishedWork$memoize2.onPostCommit;
                "function" === typeof onPostCommit && onPostCommit(
                  id,
                  null === finishedWork.alternate ? "mount" : "update",
                  finishedRoot.passiveEffectDuration,
                  -0
                );
              } catch (error) {
                captureCommitPhaseError(finishedWork, finishedWork.return, error);
              }
            } else
              recursivelyTraversePassiveMountEffects(
                finishedRoot,
                finishedWork,
                committedLanes,
                committedTransitions
              );
            break;
          case 31:
            recursivelyTraversePassiveMountEffects(
              finishedRoot,
              finishedWork,
              committedLanes,
              committedTransitions
            );
            break;
          case 13:
            recursivelyTraversePassiveMountEffects(
              finishedRoot,
              finishedWork,
              committedLanes,
              committedTransitions
            );
            break;
          case 23:
            break;
          case 22:
            _finishedWork$memoize2 = finishedWork.stateNode;
            id = finishedWork.alternate;
            null !== finishedWork.memoizedState ? _finishedWork$memoize2._visibility & 2 ? recursivelyTraversePassiveMountEffects(
              finishedRoot,
              finishedWork,
              committedLanes,
              committedTransitions
            ) : recursivelyTraverseAtomicPassiveEffects(finishedRoot, finishedWork) : _finishedWork$memoize2._visibility & 2 ? recursivelyTraversePassiveMountEffects(
              finishedRoot,
              finishedWork,
              committedLanes,
              committedTransitions
            ) : (_finishedWork$memoize2._visibility |= 2, recursivelyTraverseReconnectPassiveEffects(
              finishedRoot,
              finishedWork,
              committedLanes,
              committedTransitions,
              0 !== (finishedWork.subtreeFlags & 10256) || false
            ));
            flags & 2048 && commitOffscreenPassiveMountEffects(id, finishedWork);
            break;
          case 24:
            recursivelyTraversePassiveMountEffects(
              finishedRoot,
              finishedWork,
              committedLanes,
              committedTransitions
            );
            flags & 2048 && commitCachePassiveMountEffect(finishedWork.alternate, finishedWork);
            break;
          default:
            recursivelyTraversePassiveMountEffects(
              finishedRoot,
              finishedWork,
              committedLanes,
              committedTransitions
            );
        }
      }
      function recursivelyTraverseReconnectPassiveEffects(finishedRoot$jscomp$0, parentFiber, committedLanes$jscomp$0, committedTransitions$jscomp$0, includeWorkInProgressEffects) {
        includeWorkInProgressEffects = includeWorkInProgressEffects && (0 !== (parentFiber.subtreeFlags & 10256) || false);
        for (parentFiber = parentFiber.child; null !== parentFiber; ) {
          var finishedRoot = finishedRoot$jscomp$0, finishedWork = parentFiber, committedLanes = committedLanes$jscomp$0, committedTransitions = committedTransitions$jscomp$0, flags = finishedWork.flags;
          switch (finishedWork.tag) {
            case 0:
            case 11:
            case 15:
              recursivelyTraverseReconnectPassiveEffects(
                finishedRoot,
                finishedWork,
                committedLanes,
                committedTransitions,
                includeWorkInProgressEffects
              );
              commitHookEffectListMount(8, finishedWork);
              break;
            case 23:
              break;
            case 22:
              var instance = finishedWork.stateNode;
              null !== finishedWork.memoizedState ? instance._visibility & 2 ? recursivelyTraverseReconnectPassiveEffects(
                finishedRoot,
                finishedWork,
                committedLanes,
                committedTransitions,
                includeWorkInProgressEffects
              ) : recursivelyTraverseAtomicPassiveEffects(
                finishedRoot,
                finishedWork
              ) : (instance._visibility |= 2, recursivelyTraverseReconnectPassiveEffects(
                finishedRoot,
                finishedWork,
                committedLanes,
                committedTransitions,
                includeWorkInProgressEffects
              ));
              includeWorkInProgressEffects && flags & 2048 && commitOffscreenPassiveMountEffects(
                finishedWork.alternate,
                finishedWork
              );
              break;
            case 24:
              recursivelyTraverseReconnectPassiveEffects(
                finishedRoot,
                finishedWork,
                committedLanes,
                committedTransitions,
                includeWorkInProgressEffects
              );
              includeWorkInProgressEffects && flags & 2048 && commitCachePassiveMountEffect(finishedWork.alternate, finishedWork);
              break;
            default:
              recursivelyTraverseReconnectPassiveEffects(
                finishedRoot,
                finishedWork,
                committedLanes,
                committedTransitions,
                includeWorkInProgressEffects
              );
          }
          parentFiber = parentFiber.sibling;
        }
      }
      function recursivelyTraverseAtomicPassiveEffects(finishedRoot$jscomp$0, parentFiber) {
        if (parentFiber.subtreeFlags & 10256)
          for (parentFiber = parentFiber.child; null !== parentFiber; ) {
            var finishedRoot = finishedRoot$jscomp$0, finishedWork = parentFiber, flags = finishedWork.flags;
            switch (finishedWork.tag) {
              case 22:
                recursivelyTraverseAtomicPassiveEffects(finishedRoot, finishedWork);
                flags & 2048 && commitOffscreenPassiveMountEffects(
                  finishedWork.alternate,
                  finishedWork
                );
                break;
              case 24:
                recursivelyTraverseAtomicPassiveEffects(finishedRoot, finishedWork);
                flags & 2048 && commitCachePassiveMountEffect(finishedWork.alternate, finishedWork);
                break;
              default:
                recursivelyTraverseAtomicPassiveEffects(finishedRoot, finishedWork);
            }
            parentFiber = parentFiber.sibling;
          }
      }
      var suspenseyCommitFlag = 8192;
      function recursivelyAccumulateSuspenseyCommit(parentFiber, committedLanes, suspendedState) {
        if (parentFiber.subtreeFlags & suspenseyCommitFlag)
          for (parentFiber = parentFiber.child; null !== parentFiber; )
            accumulateSuspenseyCommitOnFiber(
              parentFiber,
              committedLanes,
              suspendedState
            ), parentFiber = parentFiber.sibling;
      }
      function accumulateSuspenseyCommitOnFiber(fiber, committedLanes, suspendedState) {
        switch (fiber.tag) {
          case 26:
            recursivelyAccumulateSuspenseyCommit(
              fiber,
              committedLanes,
              suspendedState
            );
            fiber.flags & suspenseyCommitFlag && null !== fiber.memoizedState && suspendResource(
              suspendedState,
              currentHoistableRoot,
              fiber.memoizedState,
              fiber.memoizedProps
            );
            break;
          case 5:
            recursivelyAccumulateSuspenseyCommit(
              fiber,
              committedLanes,
              suspendedState
            );
            break;
          case 3:
          case 4:
            var previousHoistableRoot = currentHoistableRoot;
            currentHoistableRoot = getHoistableRoot(fiber.stateNode.containerInfo);
            recursivelyAccumulateSuspenseyCommit(
              fiber,
              committedLanes,
              suspendedState
            );
            currentHoistableRoot = previousHoistableRoot;
            break;
          case 22:
            null === fiber.memoizedState && (previousHoistableRoot = fiber.alternate, null !== previousHoistableRoot && null !== previousHoistableRoot.memoizedState ? (previousHoistableRoot = suspenseyCommitFlag, suspenseyCommitFlag = 16777216, recursivelyAccumulateSuspenseyCommit(
              fiber,
              committedLanes,
              suspendedState
            ), suspenseyCommitFlag = previousHoistableRoot) : recursivelyAccumulateSuspenseyCommit(
              fiber,
              committedLanes,
              suspendedState
            ));
            break;
          default:
            recursivelyAccumulateSuspenseyCommit(
              fiber,
              committedLanes,
              suspendedState
            );
        }
      }
      function detachAlternateSiblings(parentFiber) {
        var previousFiber = parentFiber.alternate;
        if (null !== previousFiber && (parentFiber = previousFiber.child, null !== parentFiber)) {
          previousFiber.child = null;
          do
            previousFiber = parentFiber.sibling, parentFiber.sibling = null, parentFiber = previousFiber;
          while (null !== parentFiber);
        }
      }
      function recursivelyTraversePassiveUnmountEffects(parentFiber) {
        var deletions = parentFiber.deletions;
        if (0 !== (parentFiber.flags & 16)) {
          if (null !== deletions)
            for (var i = 0; i < deletions.length; i++) {
              var childToDelete = deletions[i];
              nextEffect = childToDelete;
              commitPassiveUnmountEffectsInsideOfDeletedTree_begin(
                childToDelete,
                parentFiber
              );
            }
          detachAlternateSiblings(parentFiber);
        }
        if (parentFiber.subtreeFlags & 10256)
          for (parentFiber = parentFiber.child; null !== parentFiber; )
            commitPassiveUnmountOnFiber(parentFiber), parentFiber = parentFiber.sibling;
      }
      function commitPassiveUnmountOnFiber(finishedWork) {
        switch (finishedWork.tag) {
          case 0:
          case 11:
          case 15:
            recursivelyTraversePassiveUnmountEffects(finishedWork);
            finishedWork.flags & 2048 && commitHookEffectListUnmount(9, finishedWork, finishedWork.return);
            break;
          case 3:
            recursivelyTraversePassiveUnmountEffects(finishedWork);
            break;
          case 12:
            recursivelyTraversePassiveUnmountEffects(finishedWork);
            break;
          case 22:
            var instance = finishedWork.stateNode;
            null !== finishedWork.memoizedState && instance._visibility & 2 && (null === finishedWork.return || 13 !== finishedWork.return.tag) ? (instance._visibility &= -3, recursivelyTraverseDisconnectPassiveEffects(finishedWork)) : recursivelyTraversePassiveUnmountEffects(finishedWork);
            break;
          default:
            recursivelyTraversePassiveUnmountEffects(finishedWork);
        }
      }
      function recursivelyTraverseDisconnectPassiveEffects(parentFiber) {
        var deletions = parentFiber.deletions;
        if (0 !== (parentFiber.flags & 16)) {
          if (null !== deletions)
            for (var i = 0; i < deletions.length; i++) {
              var childToDelete = deletions[i];
              nextEffect = childToDelete;
              commitPassiveUnmountEffectsInsideOfDeletedTree_begin(
                childToDelete,
                parentFiber
              );
            }
          detachAlternateSiblings(parentFiber);
        }
        for (parentFiber = parentFiber.child; null !== parentFiber; ) {
          deletions = parentFiber;
          switch (deletions.tag) {
            case 0:
            case 11:
            case 15:
              commitHookEffectListUnmount(8, deletions, deletions.return);
              recursivelyTraverseDisconnectPassiveEffects(deletions);
              break;
            case 22:
              i = deletions.stateNode;
              i._visibility & 2 && (i._visibility &= -3, recursivelyTraverseDisconnectPassiveEffects(deletions));
              break;
            default:
              recursivelyTraverseDisconnectPassiveEffects(deletions);
          }
          parentFiber = parentFiber.sibling;
        }
      }
      function commitPassiveUnmountEffectsInsideOfDeletedTree_begin(deletedSubtreeRoot, nearestMountedAncestor) {
        for (; null !== nextEffect; ) {
          var fiber = nextEffect;
          switch (fiber.tag) {
            case 0:
            case 11:
            case 15:
              commitHookEffectListUnmount(8, fiber, nearestMountedAncestor);
              break;
            case 23:
            case 22:
              if (null !== fiber.memoizedState && null !== fiber.memoizedState.cachePool) {
                var cache = fiber.memoizedState.cachePool.pool;
                null != cache && cache.refCount++;
              }
              break;
            case 24:
              releaseCache(fiber.memoizedState.cache);
          }
          cache = fiber.child;
          if (null !== cache) cache.return = fiber, nextEffect = cache;
          else
            a: for (fiber = deletedSubtreeRoot; null !== nextEffect; ) {
              cache = nextEffect;
              var sibling = cache.sibling, returnFiber = cache.return;
              detachFiberAfterEffects(cache);
              if (cache === fiber) {
                nextEffect = null;
                break a;
              }
              if (null !== sibling) {
                sibling.return = returnFiber;
                nextEffect = sibling;
                break a;
              }
              nextEffect = returnFiber;
            }
        }
      }
      var DefaultAsyncDispatcher = {
        getCacheForType: function(resourceType) {
          var cache = readContext(CacheContext), cacheForType = cache.data.get(resourceType);
          void 0 === cacheForType && (cacheForType = resourceType(), cache.data.set(resourceType, cacheForType));
          return cacheForType;
        },
        cacheSignal: function() {
          return readContext(CacheContext).controller.signal;
        }
      };
      var PossiblyWeakMap = "function" === typeof WeakMap ? WeakMap : Map;
      var executionContext = 0;
      var workInProgressRoot = null;
      var workInProgress = null;
      var workInProgressRootRenderLanes = 0;
      var workInProgressSuspendedReason = 0;
      var workInProgressThrownValue = null;
      var workInProgressRootDidSkipSuspendedSiblings = false;
      var workInProgressRootIsPrerendering = false;
      var workInProgressRootDidAttachPingListener = false;
      var entangledRenderLanes = 0;
      var workInProgressRootExitStatus = 0;
      var workInProgressRootSkippedLanes = 0;
      var workInProgressRootInterleavedUpdatedLanes = 0;
      var workInProgressRootPingedLanes = 0;
      var workInProgressDeferredLane = 0;
      var workInProgressSuspendedRetryLanes = 0;
      var workInProgressRootConcurrentErrors = null;
      var workInProgressRootRecoverableErrors = null;
      var workInProgressRootDidIncludeRecursiveRenderUpdate = false;
      var globalMostRecentFallbackTime = 0;
      var globalMostRecentTransitionTime = 0;
      var workInProgressRootRenderTargetTime = Infinity;
      var workInProgressTransitions = null;
      var legacyErrorBoundariesThatAlreadyFailed = null;
      var pendingEffectsStatus = 0;
      var pendingEffectsRoot = null;
      var pendingFinishedWork = null;
      var pendingEffectsLanes = 0;
      var pendingEffectsRemainingLanes = 0;
      var pendingPassiveTransitions = null;
      var pendingRecoverableErrors = null;
      var nestedUpdateCount = 0;
      var rootWithNestedUpdates = null;
      function requestUpdateLane() {
        return 0 !== (executionContext & 2) && 0 !== workInProgressRootRenderLanes ? workInProgressRootRenderLanes & -workInProgressRootRenderLanes : null !== ReactSharedInternals.T ? requestTransitionLane() : resolveUpdatePriority();
      }
      function requestDeferredLane() {
        if (0 === workInProgressDeferredLane)
          if (0 === (workInProgressRootRenderLanes & 536870912) || isHydrating) {
            var lane = nextTransitionDeferredLane;
            nextTransitionDeferredLane <<= 1;
            0 === (nextTransitionDeferredLane & 3932160) && (nextTransitionDeferredLane = 262144);
            workInProgressDeferredLane = lane;
          } else workInProgressDeferredLane = 536870912;
        lane = suspenseHandlerStackCursor.current;
        null !== lane && (lane.flags |= 32);
        return workInProgressDeferredLane;
      }
      function scheduleUpdateOnFiber(root2, fiber, lane) {
        if (root2 === workInProgressRoot && (2 === workInProgressSuspendedReason || 9 === workInProgressSuspendedReason) || null !== root2.cancelPendingCommit)
          prepareFreshStack(root2, 0), markRootSuspended(
            root2,
            workInProgressRootRenderLanes,
            workInProgressDeferredLane,
            false
          );
        markRootUpdated$1(root2, lane);
        if (0 === (executionContext & 2) || root2 !== workInProgressRoot)
          root2 === workInProgressRoot && (0 === (executionContext & 2) && (workInProgressRootInterleavedUpdatedLanes |= lane), 4 === workInProgressRootExitStatus && markRootSuspended(
            root2,
            workInProgressRootRenderLanes,
            workInProgressDeferredLane,
            false
          )), ensureRootIsScheduled(root2);
      }
      function performWorkOnRoot(root$jscomp$0, lanes, forceSync) {
        if (0 !== (executionContext & 6)) throw Error(formatProdErrorMessage(327));
        var shouldTimeSlice = !forceSync && 0 === (lanes & 127) && 0 === (lanes & root$jscomp$0.expiredLanes) || checkIfRootIsPrerendering(root$jscomp$0, lanes), exitStatus = shouldTimeSlice ? renderRootConcurrent(root$jscomp$0, lanes) : renderRootSync(root$jscomp$0, lanes, true), renderWasConcurrent = shouldTimeSlice;
        do {
          if (0 === exitStatus) {
            workInProgressRootIsPrerendering && !shouldTimeSlice && markRootSuspended(root$jscomp$0, lanes, 0, false);
            break;
          } else {
            forceSync = root$jscomp$0.current.alternate;
            if (renderWasConcurrent && !isRenderConsistentWithExternalStores(forceSync)) {
              exitStatus = renderRootSync(root$jscomp$0, lanes, false);
              renderWasConcurrent = false;
              continue;
            }
            if (2 === exitStatus) {
              renderWasConcurrent = lanes;
              if (root$jscomp$0.errorRecoveryDisabledLanes & renderWasConcurrent)
                var JSCompiler_inline_result = 0;
              else
                JSCompiler_inline_result = root$jscomp$0.pendingLanes & -536870913, JSCompiler_inline_result = 0 !== JSCompiler_inline_result ? JSCompiler_inline_result : JSCompiler_inline_result & 536870912 ? 536870912 : 0;
              if (0 !== JSCompiler_inline_result) {
                lanes = JSCompiler_inline_result;
                a: {
                  var root2 = root$jscomp$0;
                  exitStatus = workInProgressRootConcurrentErrors;
                  var wasRootDehydrated = root2.current.memoizedState.isDehydrated;
                  wasRootDehydrated && (prepareFreshStack(root2, JSCompiler_inline_result).flags |= 256);
                  JSCompiler_inline_result = renderRootSync(
                    root2,
                    JSCompiler_inline_result,
                    false
                  );
                  if (2 !== JSCompiler_inline_result) {
                    if (workInProgressRootDidAttachPingListener && !wasRootDehydrated) {
                      root2.errorRecoveryDisabledLanes |= renderWasConcurrent;
                      workInProgressRootInterleavedUpdatedLanes |= renderWasConcurrent;
                      exitStatus = 4;
                      break a;
                    }
                    renderWasConcurrent = workInProgressRootRecoverableErrors;
                    workInProgressRootRecoverableErrors = exitStatus;
                    null !== renderWasConcurrent && (null === workInProgressRootRecoverableErrors ? workInProgressRootRecoverableErrors = renderWasConcurrent : workInProgressRootRecoverableErrors.push.apply(
                      workInProgressRootRecoverableErrors,
                      renderWasConcurrent
                    ));
                  }
                  exitStatus = JSCompiler_inline_result;
                }
                renderWasConcurrent = false;
                if (2 !== exitStatus) continue;
              }
            }
            if (1 === exitStatus) {
              prepareFreshStack(root$jscomp$0, 0);
              markRootSuspended(root$jscomp$0, lanes, 0, true);
              break;
            }
            a: {
              shouldTimeSlice = root$jscomp$0;
              renderWasConcurrent = exitStatus;
              switch (renderWasConcurrent) {
                case 0:
                case 1:
                  throw Error(formatProdErrorMessage(345));
                case 4:
                  if ((lanes & 4194048) !== lanes) break;
                case 6:
                  markRootSuspended(
                    shouldTimeSlice,
                    lanes,
                    workInProgressDeferredLane,
                    !workInProgressRootDidSkipSuspendedSiblings
                  );
                  break a;
                case 2:
                  workInProgressRootRecoverableErrors = null;
                  break;
                case 3:
                case 5:
                  break;
                default:
                  throw Error(formatProdErrorMessage(329));
              }
              if ((lanes & 62914560) === lanes && (exitStatus = globalMostRecentFallbackTime + 300 - now(), 10 < exitStatus)) {
                markRootSuspended(
                  shouldTimeSlice,
                  lanes,
                  workInProgressDeferredLane,
                  !workInProgressRootDidSkipSuspendedSiblings
                );
                if (0 !== getNextLanes(shouldTimeSlice, 0, true)) break a;
                pendingEffectsLanes = lanes;
                shouldTimeSlice.timeoutHandle = scheduleTimeout(
                  commitRootWhenReady.bind(
                    null,
                    shouldTimeSlice,
                    forceSync,
                    workInProgressRootRecoverableErrors,
                    workInProgressTransitions,
                    workInProgressRootDidIncludeRecursiveRenderUpdate,
                    lanes,
                    workInProgressDeferredLane,
                    workInProgressRootInterleavedUpdatedLanes,
                    workInProgressSuspendedRetryLanes,
                    workInProgressRootDidSkipSuspendedSiblings,
                    renderWasConcurrent,
                    "Throttled",
                    -0,
                    0
                  ),
                  exitStatus
                );
                break a;
              }
              commitRootWhenReady(
                shouldTimeSlice,
                forceSync,
                workInProgressRootRecoverableErrors,
                workInProgressTransitions,
                workInProgressRootDidIncludeRecursiveRenderUpdate,
                lanes,
                workInProgressDeferredLane,
                workInProgressRootInterleavedUpdatedLanes,
                workInProgressSuspendedRetryLanes,
                workInProgressRootDidSkipSuspendedSiblings,
                renderWasConcurrent,
                null,
                -0,
                0
              );
            }
          }
          break;
        } while (1);
        ensureRootIsScheduled(root$jscomp$0);
      }
      function commitRootWhenReady(root2, finishedWork, recoverableErrors, transitions, didIncludeRenderPhaseUpdate, lanes, spawnedLane, updatedLanes, suspendedRetryLanes, didSkipSuspendedSiblings, exitStatus, suspendedCommitReason, completedRenderStartTime, completedRenderEndTime) {
        root2.timeoutHandle = -1;
        suspendedCommitReason = finishedWork.subtreeFlags;
        if (suspendedCommitReason & 8192 || 16785408 === (suspendedCommitReason & 16785408)) {
          suspendedCommitReason = {
            stylesheets: null,
            count: 0,
            imgCount: 0,
            imgBytes: 0,
            suspenseyImages: [],
            waitingForImages: true,
            waitingForViewTransition: false,
            unsuspend: noop$1
          };
          accumulateSuspenseyCommitOnFiber(
            finishedWork,
            lanes,
            suspendedCommitReason
          );
          var timeoutOffset = (lanes & 62914560) === lanes ? globalMostRecentFallbackTime - now() : (lanes & 4194048) === lanes ? globalMostRecentTransitionTime - now() : 0;
          timeoutOffset = waitForCommitToBeReady(
            suspendedCommitReason,
            timeoutOffset
          );
          if (null !== timeoutOffset) {
            pendingEffectsLanes = lanes;
            root2.cancelPendingCommit = timeoutOffset(
              commitRoot.bind(
                null,
                root2,
                finishedWork,
                lanes,
                recoverableErrors,
                transitions,
                didIncludeRenderPhaseUpdate,
                spawnedLane,
                updatedLanes,
                suspendedRetryLanes,
                exitStatus,
                suspendedCommitReason,
                null,
                completedRenderStartTime,
                completedRenderEndTime
              )
            );
            markRootSuspended(root2, lanes, spawnedLane, !didSkipSuspendedSiblings);
            return;
          }
        }
        commitRoot(
          root2,
          finishedWork,
          lanes,
          recoverableErrors,
          transitions,
          didIncludeRenderPhaseUpdate,
          spawnedLane,
          updatedLanes,
          suspendedRetryLanes
        );
      }
      function isRenderConsistentWithExternalStores(finishedWork) {
        for (var node = finishedWork; ; ) {
          var tag = node.tag;
          if ((0 === tag || 11 === tag || 15 === tag) && node.flags & 16384 && (tag = node.updateQueue, null !== tag && (tag = tag.stores, null !== tag)))
            for (var i = 0; i < tag.length; i++) {
              var check = tag[i], getSnapshot = check.getSnapshot;
              check = check.value;
              try {
                if (!objectIs(getSnapshot(), check)) return false;
              } catch (error) {
                return false;
              }
            }
          tag = node.child;
          if (node.subtreeFlags & 16384 && null !== tag)
            tag.return = node, node = tag;
          else {
            if (node === finishedWork) break;
            for (; null === node.sibling; ) {
              if (null === node.return || node.return === finishedWork) return true;
              node = node.return;
            }
            node.sibling.return = node.return;
            node = node.sibling;
          }
        }
        return true;
      }
      function markRootSuspended(root2, suspendedLanes, spawnedLane, didAttemptEntireTree) {
        suspendedLanes &= ~workInProgressRootPingedLanes;
        suspendedLanes &= ~workInProgressRootInterleavedUpdatedLanes;
        root2.suspendedLanes |= suspendedLanes;
        root2.pingedLanes &= ~suspendedLanes;
        didAttemptEntireTree && (root2.warmLanes |= suspendedLanes);
        didAttemptEntireTree = root2.expirationTimes;
        for (var lanes = suspendedLanes; 0 < lanes; ) {
          var index$6 = 31 - clz32(lanes), lane = 1 << index$6;
          didAttemptEntireTree[index$6] = -1;
          lanes &= ~lane;
        }
        0 !== spawnedLane && markSpawnedDeferredLane(root2, spawnedLane, suspendedLanes);
      }
      function flushSyncWork$1() {
        return 0 === (executionContext & 6) ? (flushSyncWorkAcrossRoots_impl(0, false), false) : true;
      }
      function resetWorkInProgressStack() {
        if (null !== workInProgress) {
          if (0 === workInProgressSuspendedReason)
            var interruptedWork = workInProgress.return;
          else
            interruptedWork = workInProgress, lastContextDependency = currentlyRenderingFiber$1 = null, resetHooksOnUnwind(interruptedWork), thenableState$1 = null, thenableIndexCounter$1 = 0, interruptedWork = workInProgress;
          for (; null !== interruptedWork; )
            unwindInterruptedWork(interruptedWork.alternate, interruptedWork), interruptedWork = interruptedWork.return;
          workInProgress = null;
        }
      }
      function prepareFreshStack(root2, lanes) {
        var timeoutHandle = root2.timeoutHandle;
        -1 !== timeoutHandle && (root2.timeoutHandle = -1, cancelTimeout(timeoutHandle));
        timeoutHandle = root2.cancelPendingCommit;
        null !== timeoutHandle && (root2.cancelPendingCommit = null, timeoutHandle());
        pendingEffectsLanes = 0;
        resetWorkInProgressStack();
        workInProgressRoot = root2;
        workInProgress = timeoutHandle = createWorkInProgress(root2.current, null);
        workInProgressRootRenderLanes = lanes;
        workInProgressSuspendedReason = 0;
        workInProgressThrownValue = null;
        workInProgressRootDidSkipSuspendedSiblings = false;
        workInProgressRootIsPrerendering = checkIfRootIsPrerendering(root2, lanes);
        workInProgressRootDidAttachPingListener = false;
        workInProgressSuspendedRetryLanes = workInProgressDeferredLane = workInProgressRootPingedLanes = workInProgressRootInterleavedUpdatedLanes = workInProgressRootSkippedLanes = workInProgressRootExitStatus = 0;
        workInProgressRootRecoverableErrors = workInProgressRootConcurrentErrors = null;
        workInProgressRootDidIncludeRecursiveRenderUpdate = false;
        0 !== (lanes & 8) && (lanes |= lanes & 32);
        var allEntangledLanes = root2.entangledLanes;
        if (0 !== allEntangledLanes)
          for (root2 = root2.entanglements, allEntangledLanes &= lanes; 0 < allEntangledLanes; ) {
            var index$4 = 31 - clz32(allEntangledLanes), lane = 1 << index$4;
            lanes |= root2[index$4];
            allEntangledLanes &= ~lane;
          }
        entangledRenderLanes = lanes;
        finishQueueingConcurrentUpdates();
        return timeoutHandle;
      }
      function handleThrow(root2, thrownValue) {
        currentlyRenderingFiber = null;
        ReactSharedInternals.H = ContextOnlyDispatcher;
        thrownValue === SuspenseException || thrownValue === SuspenseActionException ? (thrownValue = getSuspendedThenable(), workInProgressSuspendedReason = 3) : thrownValue === SuspenseyCommitException ? (thrownValue = getSuspendedThenable(), workInProgressSuspendedReason = 4) : workInProgressSuspendedReason = thrownValue === SelectiveHydrationException ? 8 : null !== thrownValue && "object" === typeof thrownValue && "function" === typeof thrownValue.then ? 6 : 1;
        workInProgressThrownValue = thrownValue;
        null === workInProgress && (workInProgressRootExitStatus = 1, logUncaughtError(
          root2,
          createCapturedValueAtFiber(thrownValue, root2.current)
        ));
      }
      function shouldRemainOnPreviousScreen() {
        var handler = suspenseHandlerStackCursor.current;
        return null === handler ? true : (workInProgressRootRenderLanes & 4194048) === workInProgressRootRenderLanes ? null === shellBoundary ? true : false : (workInProgressRootRenderLanes & 62914560) === workInProgressRootRenderLanes || 0 !== (workInProgressRootRenderLanes & 536870912) ? handler === shellBoundary : false;
      }
      function pushDispatcher() {
        var prevDispatcher = ReactSharedInternals.H;
        ReactSharedInternals.H = ContextOnlyDispatcher;
        return null === prevDispatcher ? ContextOnlyDispatcher : prevDispatcher;
      }
      function pushAsyncDispatcher() {
        var prevAsyncDispatcher = ReactSharedInternals.A;
        ReactSharedInternals.A = DefaultAsyncDispatcher;
        return prevAsyncDispatcher;
      }
      function renderDidSuspendDelayIfPossible() {
        workInProgressRootExitStatus = 4;
        workInProgressRootDidSkipSuspendedSiblings || (workInProgressRootRenderLanes & 4194048) !== workInProgressRootRenderLanes && null !== suspenseHandlerStackCursor.current || (workInProgressRootIsPrerendering = true);
        0 === (workInProgressRootSkippedLanes & 134217727) && 0 === (workInProgressRootInterleavedUpdatedLanes & 134217727) || null === workInProgressRoot || markRootSuspended(
          workInProgressRoot,
          workInProgressRootRenderLanes,
          workInProgressDeferredLane,
          false
        );
      }
      function renderRootSync(root2, lanes, shouldYieldForPrerendering) {
        var prevExecutionContext = executionContext;
        executionContext |= 2;
        var prevDispatcher = pushDispatcher(), prevAsyncDispatcher = pushAsyncDispatcher();
        if (workInProgressRoot !== root2 || workInProgressRootRenderLanes !== lanes)
          workInProgressTransitions = null, prepareFreshStack(root2, lanes);
        lanes = false;
        var exitStatus = workInProgressRootExitStatus;
        a: do
          try {
            if (0 !== workInProgressSuspendedReason && null !== workInProgress) {
              var unitOfWork = workInProgress, thrownValue = workInProgressThrownValue;
              switch (workInProgressSuspendedReason) {
                case 8:
                  resetWorkInProgressStack();
                  exitStatus = 6;
                  break a;
                case 3:
                case 2:
                case 9:
                case 6:
                  null === suspenseHandlerStackCursor.current && (lanes = true);
                  var reason = workInProgressSuspendedReason;
                  workInProgressSuspendedReason = 0;
                  workInProgressThrownValue = null;
                  throwAndUnwindWorkLoop(root2, unitOfWork, thrownValue, reason);
                  if (shouldYieldForPrerendering && workInProgressRootIsPrerendering) {
                    exitStatus = 0;
                    break a;
                  }
                  break;
                default:
                  reason = workInProgressSuspendedReason, workInProgressSuspendedReason = 0, workInProgressThrownValue = null, throwAndUnwindWorkLoop(root2, unitOfWork, thrownValue, reason);
              }
            }
            workLoopSync();
            exitStatus = workInProgressRootExitStatus;
            break;
          } catch (thrownValue$165) {
            handleThrow(root2, thrownValue$165);
          }
        while (1);
        lanes && root2.shellSuspendCounter++;
        lastContextDependency = currentlyRenderingFiber$1 = null;
        executionContext = prevExecutionContext;
        ReactSharedInternals.H = prevDispatcher;
        ReactSharedInternals.A = prevAsyncDispatcher;
        null === workInProgress && (workInProgressRoot = null, workInProgressRootRenderLanes = 0, finishQueueingConcurrentUpdates());
        return exitStatus;
      }
      function workLoopSync() {
        for (; null !== workInProgress; ) performUnitOfWork(workInProgress);
      }
      function renderRootConcurrent(root2, lanes) {
        var prevExecutionContext = executionContext;
        executionContext |= 2;
        var prevDispatcher = pushDispatcher(), prevAsyncDispatcher = pushAsyncDispatcher();
        workInProgressRoot !== root2 || workInProgressRootRenderLanes !== lanes ? (workInProgressTransitions = null, workInProgressRootRenderTargetTime = now() + 500, prepareFreshStack(root2, lanes)) : workInProgressRootIsPrerendering = checkIfRootIsPrerendering(
          root2,
          lanes
        );
        a: do
          try {
            if (0 !== workInProgressSuspendedReason && null !== workInProgress) {
              lanes = workInProgress;
              var thrownValue = workInProgressThrownValue;
              b: switch (workInProgressSuspendedReason) {
                case 1:
                  workInProgressSuspendedReason = 0;
                  workInProgressThrownValue = null;
                  throwAndUnwindWorkLoop(root2, lanes, thrownValue, 1);
                  break;
                case 2:
                case 9:
                  if (isThenableResolved(thrownValue)) {
                    workInProgressSuspendedReason = 0;
                    workInProgressThrownValue = null;
                    replaySuspendedUnitOfWork(lanes);
                    break;
                  }
                  lanes = function() {
                    2 !== workInProgressSuspendedReason && 9 !== workInProgressSuspendedReason || workInProgressRoot !== root2 || (workInProgressSuspendedReason = 7);
                    ensureRootIsScheduled(root2);
                  };
                  thrownValue.then(lanes, lanes);
                  break a;
                case 3:
                  workInProgressSuspendedReason = 7;
                  break a;
                case 4:
                  workInProgressSuspendedReason = 5;
                  break a;
                case 7:
                  isThenableResolved(thrownValue) ? (workInProgressSuspendedReason = 0, workInProgressThrownValue = null, replaySuspendedUnitOfWork(lanes)) : (workInProgressSuspendedReason = 0, workInProgressThrownValue = null, throwAndUnwindWorkLoop(root2, lanes, thrownValue, 7));
                  break;
                case 5:
                  var resource = null;
                  switch (workInProgress.tag) {
                    case 26:
                      resource = workInProgress.memoizedState;
                    case 5:
                    case 27:
                      var hostFiber = workInProgress;
                      if (resource ? preloadResource(resource) : hostFiber.stateNode.complete) {
                        workInProgressSuspendedReason = 0;
                        workInProgressThrownValue = null;
                        var sibling = hostFiber.sibling;
                        if (null !== sibling) workInProgress = sibling;
                        else {
                          var returnFiber = hostFiber.return;
                          null !== returnFiber ? (workInProgress = returnFiber, completeUnitOfWork(returnFiber)) : workInProgress = null;
                        }
                        break b;
                      }
                  }
                  workInProgressSuspendedReason = 0;
                  workInProgressThrownValue = null;
                  throwAndUnwindWorkLoop(root2, lanes, thrownValue, 5);
                  break;
                case 6:
                  workInProgressSuspendedReason = 0;
                  workInProgressThrownValue = null;
                  throwAndUnwindWorkLoop(root2, lanes, thrownValue, 6);
                  break;
                case 8:
                  resetWorkInProgressStack();
                  workInProgressRootExitStatus = 6;
                  break a;
                default:
                  throw Error(formatProdErrorMessage(462));
              }
            }
            workLoopConcurrentByScheduler();
            break;
          } catch (thrownValue$167) {
            handleThrow(root2, thrownValue$167);
          }
        while (1);
        lastContextDependency = currentlyRenderingFiber$1 = null;
        ReactSharedInternals.H = prevDispatcher;
        ReactSharedInternals.A = prevAsyncDispatcher;
        executionContext = prevExecutionContext;
        if (null !== workInProgress) return 0;
        workInProgressRoot = null;
        workInProgressRootRenderLanes = 0;
        finishQueueingConcurrentUpdates();
        return workInProgressRootExitStatus;
      }
      function workLoopConcurrentByScheduler() {
        for (; null !== workInProgress && !shouldYield(); )
          performUnitOfWork(workInProgress);
      }
      function performUnitOfWork(unitOfWork) {
        var next = beginWork(unitOfWork.alternate, unitOfWork, entangledRenderLanes);
        unitOfWork.memoizedProps = unitOfWork.pendingProps;
        null === next ? completeUnitOfWork(unitOfWork) : workInProgress = next;
      }
      function replaySuspendedUnitOfWork(unitOfWork) {
        var next = unitOfWork;
        var current = next.alternate;
        switch (next.tag) {
          case 15:
          case 0:
            next = replayFunctionComponent(
              current,
              next,
              next.pendingProps,
              next.type,
              void 0,
              workInProgressRootRenderLanes
            );
            break;
          case 11:
            next = replayFunctionComponent(
              current,
              next,
              next.pendingProps,
              next.type.render,
              next.ref,
              workInProgressRootRenderLanes
            );
            break;
          case 5:
            resetHooksOnUnwind(next);
          default:
            unwindInterruptedWork(current, next), next = workInProgress = resetWorkInProgress(next, entangledRenderLanes), next = beginWork(current, next, entangledRenderLanes);
        }
        unitOfWork.memoizedProps = unitOfWork.pendingProps;
        null === next ? completeUnitOfWork(unitOfWork) : workInProgress = next;
      }
      function throwAndUnwindWorkLoop(root2, unitOfWork, thrownValue, suspendedReason) {
        lastContextDependency = currentlyRenderingFiber$1 = null;
        resetHooksOnUnwind(unitOfWork);
        thenableState$1 = null;
        thenableIndexCounter$1 = 0;
        var returnFiber = unitOfWork.return;
        try {
          if (throwException(
            root2,
            returnFiber,
            unitOfWork,
            thrownValue,
            workInProgressRootRenderLanes
          )) {
            workInProgressRootExitStatus = 1;
            logUncaughtError(
              root2,
              createCapturedValueAtFiber(thrownValue, root2.current)
            );
            workInProgress = null;
            return;
          }
        } catch (error) {
          if (null !== returnFiber) throw workInProgress = returnFiber, error;
          workInProgressRootExitStatus = 1;
          logUncaughtError(
            root2,
            createCapturedValueAtFiber(thrownValue, root2.current)
          );
          workInProgress = null;
          return;
        }
        if (unitOfWork.flags & 32768) {
          if (isHydrating || 1 === suspendedReason) root2 = true;
          else if (workInProgressRootIsPrerendering || 0 !== (workInProgressRootRenderLanes & 536870912))
            root2 = false;
          else if (workInProgressRootDidSkipSuspendedSiblings = root2 = true, 2 === suspendedReason || 9 === suspendedReason || 3 === suspendedReason || 6 === suspendedReason)
            suspendedReason = suspenseHandlerStackCursor.current, null !== suspendedReason && 13 === suspendedReason.tag && (suspendedReason.flags |= 16384);
          unwindUnitOfWork(unitOfWork, root2);
        } else completeUnitOfWork(unitOfWork);
      }
      function completeUnitOfWork(unitOfWork) {
        var completedWork = unitOfWork;
        do {
          if (0 !== (completedWork.flags & 32768)) {
            unwindUnitOfWork(
              completedWork,
              workInProgressRootDidSkipSuspendedSiblings
            );
            return;
          }
          unitOfWork = completedWork.return;
          var next = completeWork(
            completedWork.alternate,
            completedWork,
            entangledRenderLanes
          );
          if (null !== next) {
            workInProgress = next;
            return;
          }
          completedWork = completedWork.sibling;
          if (null !== completedWork) {
            workInProgress = completedWork;
            return;
          }
          workInProgress = completedWork = unitOfWork;
        } while (null !== completedWork);
        0 === workInProgressRootExitStatus && (workInProgressRootExitStatus = 5);
      }
      function unwindUnitOfWork(unitOfWork, skipSiblings) {
        do {
          var next = unwindWork(unitOfWork.alternate, unitOfWork);
          if (null !== next) {
            next.flags &= 32767;
            workInProgress = next;
            return;
          }
          next = unitOfWork.return;
          null !== next && (next.flags |= 32768, next.subtreeFlags = 0, next.deletions = null);
          if (!skipSiblings && (unitOfWork = unitOfWork.sibling, null !== unitOfWork)) {
            workInProgress = unitOfWork;
            return;
          }
          workInProgress = unitOfWork = next;
        } while (null !== unitOfWork);
        workInProgressRootExitStatus = 6;
        workInProgress = null;
      }
      function commitRoot(root2, finishedWork, lanes, recoverableErrors, transitions, didIncludeRenderPhaseUpdate, spawnedLane, updatedLanes, suspendedRetryLanes) {
        root2.cancelPendingCommit = null;
        do
          flushPendingEffects();
        while (0 !== pendingEffectsStatus);
        if (0 !== (executionContext & 6)) throw Error(formatProdErrorMessage(327));
        if (null !== finishedWork) {
          if (finishedWork === root2.current) throw Error(formatProdErrorMessage(177));
          didIncludeRenderPhaseUpdate = finishedWork.lanes | finishedWork.childLanes;
          didIncludeRenderPhaseUpdate |= concurrentlyUpdatedLanes;
          markRootFinished(
            root2,
            lanes,
            didIncludeRenderPhaseUpdate,
            spawnedLane,
            updatedLanes,
            suspendedRetryLanes
          );
          root2 === workInProgressRoot && (workInProgress = workInProgressRoot = null, workInProgressRootRenderLanes = 0);
          pendingFinishedWork = finishedWork;
          pendingEffectsRoot = root2;
          pendingEffectsLanes = lanes;
          pendingEffectsRemainingLanes = didIncludeRenderPhaseUpdate;
          pendingPassiveTransitions = transitions;
          pendingRecoverableErrors = recoverableErrors;
          0 !== (finishedWork.subtreeFlags & 10256) || 0 !== (finishedWork.flags & 10256) ? (root2.callbackNode = null, root2.callbackPriority = 0, scheduleCallback$1(NormalPriority$1, function() {
            flushPassiveEffects();
            return null;
          })) : (root2.callbackNode = null, root2.callbackPriority = 0);
          recoverableErrors = 0 !== (finishedWork.flags & 13878);
          if (0 !== (finishedWork.subtreeFlags & 13878) || recoverableErrors) {
            recoverableErrors = ReactSharedInternals.T;
            ReactSharedInternals.T = null;
            transitions = ReactDOMSharedInternals.p;
            ReactDOMSharedInternals.p = 2;
            spawnedLane = executionContext;
            executionContext |= 4;
            try {
              commitBeforeMutationEffects(root2, finishedWork, lanes);
            } finally {
              executionContext = spawnedLane, ReactDOMSharedInternals.p = transitions, ReactSharedInternals.T = recoverableErrors;
            }
          }
          pendingEffectsStatus = 1;
          flushMutationEffects();
          flushLayoutEffects();
          flushSpawnedWork();
        }
      }
      function flushMutationEffects() {
        if (1 === pendingEffectsStatus) {
          pendingEffectsStatus = 0;
          var root2 = pendingEffectsRoot, finishedWork = pendingFinishedWork, rootMutationHasEffect = 0 !== (finishedWork.flags & 13878);
          if (0 !== (finishedWork.subtreeFlags & 13878) || rootMutationHasEffect) {
            rootMutationHasEffect = ReactSharedInternals.T;
            ReactSharedInternals.T = null;
            var previousPriority = ReactDOMSharedInternals.p;
            ReactDOMSharedInternals.p = 2;
            var prevExecutionContext = executionContext;
            executionContext |= 4;
            try {
              commitMutationEffectsOnFiber(finishedWork, root2);
              var priorSelectionInformation = selectionInformation, curFocusedElem = getActiveElementDeep(root2.containerInfo), priorFocusedElem = priorSelectionInformation.focusedElem, priorSelectionRange = priorSelectionInformation.selectionRange;
              if (curFocusedElem !== priorFocusedElem && priorFocusedElem && priorFocusedElem.ownerDocument && containsNode(
                priorFocusedElem.ownerDocument.documentElement,
                priorFocusedElem
              )) {
                if (null !== priorSelectionRange && hasSelectionCapabilities(priorFocusedElem)) {
                  var start = priorSelectionRange.start, end = priorSelectionRange.end;
                  void 0 === end && (end = start);
                  if ("selectionStart" in priorFocusedElem)
                    priorFocusedElem.selectionStart = start, priorFocusedElem.selectionEnd = Math.min(
                      end,
                      priorFocusedElem.value.length
                    );
                  else {
                    var doc = priorFocusedElem.ownerDocument || document, win = doc && doc.defaultView || window;
                    if (win.getSelection) {
                      var selection = win.getSelection(), length = priorFocusedElem.textContent.length, start$jscomp$0 = Math.min(priorSelectionRange.start, length), end$jscomp$0 = void 0 === priorSelectionRange.end ? start$jscomp$0 : Math.min(priorSelectionRange.end, length);
                      !selection.extend && start$jscomp$0 > end$jscomp$0 && (curFocusedElem = end$jscomp$0, end$jscomp$0 = start$jscomp$0, start$jscomp$0 = curFocusedElem);
                      var startMarker = getNodeForCharacterOffset(
                        priorFocusedElem,
                        start$jscomp$0
                      ), endMarker = getNodeForCharacterOffset(
                        priorFocusedElem,
                        end$jscomp$0
                      );
                      if (startMarker && endMarker && (1 !== selection.rangeCount || selection.anchorNode !== startMarker.node || selection.anchorOffset !== startMarker.offset || selection.focusNode !== endMarker.node || selection.focusOffset !== endMarker.offset)) {
                        var range = doc.createRange();
                        range.setStart(startMarker.node, startMarker.offset);
                        selection.removeAllRanges();
                        start$jscomp$0 > end$jscomp$0 ? (selection.addRange(range), selection.extend(endMarker.node, endMarker.offset)) : (range.setEnd(endMarker.node, endMarker.offset), selection.addRange(range));
                      }
                    }
                  }
                }
                doc = [];
                for (selection = priorFocusedElem; selection = selection.parentNode; )
                  1 === selection.nodeType && doc.push({
                    element: selection,
                    left: selection.scrollLeft,
                    top: selection.scrollTop
                  });
                "function" === typeof priorFocusedElem.focus && priorFocusedElem.focus();
                for (priorFocusedElem = 0; priorFocusedElem < doc.length; priorFocusedElem++) {
                  var info = doc[priorFocusedElem];
                  info.element.scrollLeft = info.left;
                  info.element.scrollTop = info.top;
                }
              }
              _enabled = !!eventsEnabled;
              selectionInformation = eventsEnabled = null;
            } finally {
              executionContext = prevExecutionContext, ReactDOMSharedInternals.p = previousPriority, ReactSharedInternals.T = rootMutationHasEffect;
            }
          }
          root2.current = finishedWork;
          pendingEffectsStatus = 2;
        }
      }
      function flushLayoutEffects() {
        if (2 === pendingEffectsStatus) {
          pendingEffectsStatus = 0;
          var root2 = pendingEffectsRoot, finishedWork = pendingFinishedWork, rootHasLayoutEffect = 0 !== (finishedWork.flags & 8772);
          if (0 !== (finishedWork.subtreeFlags & 8772) || rootHasLayoutEffect) {
            rootHasLayoutEffect = ReactSharedInternals.T;
            ReactSharedInternals.T = null;
            var previousPriority = ReactDOMSharedInternals.p;
            ReactDOMSharedInternals.p = 2;
            var prevExecutionContext = executionContext;
            executionContext |= 4;
            try {
              commitLayoutEffectOnFiber(root2, finishedWork.alternate, finishedWork);
            } finally {
              executionContext = prevExecutionContext, ReactDOMSharedInternals.p = previousPriority, ReactSharedInternals.T = rootHasLayoutEffect;
            }
          }
          pendingEffectsStatus = 3;
        }
      }
      function flushSpawnedWork() {
        if (4 === pendingEffectsStatus || 3 === pendingEffectsStatus) {
          pendingEffectsStatus = 0;
          requestPaint();
          var root2 = pendingEffectsRoot, finishedWork = pendingFinishedWork, lanes = pendingEffectsLanes, recoverableErrors = pendingRecoverableErrors;
          0 !== (finishedWork.subtreeFlags & 10256) || 0 !== (finishedWork.flags & 10256) ? pendingEffectsStatus = 5 : (pendingEffectsStatus = 0, pendingFinishedWork = pendingEffectsRoot = null, releaseRootPooledCache(root2, root2.pendingLanes));
          var remainingLanes = root2.pendingLanes;
          0 === remainingLanes && (legacyErrorBoundariesThatAlreadyFailed = null);
          lanesToEventPriority(lanes);
          finishedWork = finishedWork.stateNode;
          if (injectedHook && "function" === typeof injectedHook.onCommitFiberRoot)
            try {
              injectedHook.onCommitFiberRoot(
                rendererID,
                finishedWork,
                void 0,
                128 === (finishedWork.current.flags & 128)
              );
            } catch (err) {
            }
          if (null !== recoverableErrors) {
            finishedWork = ReactSharedInternals.T;
            remainingLanes = ReactDOMSharedInternals.p;
            ReactDOMSharedInternals.p = 2;
            ReactSharedInternals.T = null;
            try {
              for (var onRecoverableError = root2.onRecoverableError, i = 0; i < recoverableErrors.length; i++) {
                var recoverableError = recoverableErrors[i];
                onRecoverableError(recoverableError.value, {
                  componentStack: recoverableError.stack
                });
              }
            } finally {
              ReactSharedInternals.T = finishedWork, ReactDOMSharedInternals.p = remainingLanes;
            }
          }
          0 !== (pendingEffectsLanes & 3) && flushPendingEffects();
          ensureRootIsScheduled(root2);
          remainingLanes = root2.pendingLanes;
          0 !== (lanes & 261930) && 0 !== (remainingLanes & 42) ? root2 === rootWithNestedUpdates ? nestedUpdateCount++ : (nestedUpdateCount = 0, rootWithNestedUpdates = root2) : nestedUpdateCount = 0;
          flushSyncWorkAcrossRoots_impl(0, false);
        }
      }
      function releaseRootPooledCache(root2, remainingLanes) {
        0 === (root2.pooledCacheLanes &= remainingLanes) && (remainingLanes = root2.pooledCache, null != remainingLanes && (root2.pooledCache = null, releaseCache(remainingLanes)));
      }
      function flushPendingEffects() {
        flushMutationEffects();
        flushLayoutEffects();
        flushSpawnedWork();
        return flushPassiveEffects();
      }
      function flushPassiveEffects() {
        if (5 !== pendingEffectsStatus) return false;
        var root2 = pendingEffectsRoot, remainingLanes = pendingEffectsRemainingLanes;
        pendingEffectsRemainingLanes = 0;
        var renderPriority = lanesToEventPriority(pendingEffectsLanes), prevTransition = ReactSharedInternals.T, previousPriority = ReactDOMSharedInternals.p;
        try {
          ReactDOMSharedInternals.p = 32 > renderPriority ? 32 : renderPriority;
          ReactSharedInternals.T = null;
          renderPriority = pendingPassiveTransitions;
          pendingPassiveTransitions = null;
          var root$jscomp$0 = pendingEffectsRoot, lanes = pendingEffectsLanes;
          pendingEffectsStatus = 0;
          pendingFinishedWork = pendingEffectsRoot = null;
          pendingEffectsLanes = 0;
          if (0 !== (executionContext & 6)) throw Error(formatProdErrorMessage(331));
          var prevExecutionContext = executionContext;
          executionContext |= 4;
          commitPassiveUnmountOnFiber(root$jscomp$0.current);
          commitPassiveMountOnFiber(
            root$jscomp$0,
            root$jscomp$0.current,
            lanes,
            renderPriority
          );
          executionContext = prevExecutionContext;
          flushSyncWorkAcrossRoots_impl(0, false);
          if (injectedHook && "function" === typeof injectedHook.onPostCommitFiberRoot)
            try {
              injectedHook.onPostCommitFiberRoot(rendererID, root$jscomp$0);
            } catch (err) {
            }
          return true;
        } finally {
          ReactDOMSharedInternals.p = previousPriority, ReactSharedInternals.T = prevTransition, releaseRootPooledCache(root2, remainingLanes);
        }
      }
      function captureCommitPhaseErrorOnRoot(rootFiber, sourceFiber, error) {
        sourceFiber = createCapturedValueAtFiber(error, sourceFiber);
        sourceFiber = createRootErrorUpdate(rootFiber.stateNode, sourceFiber, 2);
        rootFiber = enqueueUpdate(rootFiber, sourceFiber, 2);
        null !== rootFiber && (markRootUpdated$1(rootFiber, 2), ensureRootIsScheduled(rootFiber));
      }
      function captureCommitPhaseError(sourceFiber, nearestMountedAncestor, error) {
        if (3 === sourceFiber.tag)
          captureCommitPhaseErrorOnRoot(sourceFiber, sourceFiber, error);
        else
          for (; null !== nearestMountedAncestor; ) {
            if (3 === nearestMountedAncestor.tag) {
              captureCommitPhaseErrorOnRoot(
                nearestMountedAncestor,
                sourceFiber,
                error
              );
              break;
            } else if (1 === nearestMountedAncestor.tag) {
              var instance = nearestMountedAncestor.stateNode;
              if ("function" === typeof nearestMountedAncestor.type.getDerivedStateFromError || "function" === typeof instance.componentDidCatch && (null === legacyErrorBoundariesThatAlreadyFailed || !legacyErrorBoundariesThatAlreadyFailed.has(instance))) {
                sourceFiber = createCapturedValueAtFiber(error, sourceFiber);
                error = createClassErrorUpdate(2);
                instance = enqueueUpdate(nearestMountedAncestor, error, 2);
                null !== instance && (initializeClassErrorUpdate(
                  error,
                  instance,
                  nearestMountedAncestor,
                  sourceFiber
                ), markRootUpdated$1(instance, 2), ensureRootIsScheduled(instance));
                break;
              }
            }
            nearestMountedAncestor = nearestMountedAncestor.return;
          }
      }
      function attachPingListener(root2, wakeable, lanes) {
        var pingCache = root2.pingCache;
        if (null === pingCache) {
          pingCache = root2.pingCache = new PossiblyWeakMap();
          var threadIDs = /* @__PURE__ */ new Set();
          pingCache.set(wakeable, threadIDs);
        } else
          threadIDs = pingCache.get(wakeable), void 0 === threadIDs && (threadIDs = /* @__PURE__ */ new Set(), pingCache.set(wakeable, threadIDs));
        threadIDs.has(lanes) || (workInProgressRootDidAttachPingListener = true, threadIDs.add(lanes), root2 = pingSuspendedRoot.bind(null, root2, wakeable, lanes), wakeable.then(root2, root2));
      }
      function pingSuspendedRoot(root2, wakeable, pingedLanes) {
        var pingCache = root2.pingCache;
        null !== pingCache && pingCache.delete(wakeable);
        root2.pingedLanes |= root2.suspendedLanes & pingedLanes;
        root2.warmLanes &= ~pingedLanes;
        workInProgressRoot === root2 && (workInProgressRootRenderLanes & pingedLanes) === pingedLanes && (4 === workInProgressRootExitStatus || 3 === workInProgressRootExitStatus && (workInProgressRootRenderLanes & 62914560) === workInProgressRootRenderLanes && 300 > now() - globalMostRecentFallbackTime ? 0 === (executionContext & 2) && prepareFreshStack(root2, 0) : workInProgressRootPingedLanes |= pingedLanes, workInProgressSuspendedRetryLanes === workInProgressRootRenderLanes && (workInProgressSuspendedRetryLanes = 0));
        ensureRootIsScheduled(root2);
      }
      function retryTimedOutBoundary(boundaryFiber, retryLane) {
        0 === retryLane && (retryLane = claimNextRetryLane());
        boundaryFiber = enqueueConcurrentRenderForLane(boundaryFiber, retryLane);
        null !== boundaryFiber && (markRootUpdated$1(boundaryFiber, retryLane), ensureRootIsScheduled(boundaryFiber));
      }
      function retryDehydratedSuspenseBoundary(boundaryFiber) {
        var suspenseState = boundaryFiber.memoizedState, retryLane = 0;
        null !== suspenseState && (retryLane = suspenseState.retryLane);
        retryTimedOutBoundary(boundaryFiber, retryLane);
      }
      function resolveRetryWakeable(boundaryFiber, wakeable) {
        var retryLane = 0;
        switch (boundaryFiber.tag) {
          case 31:
          case 13:
            var retryCache = boundaryFiber.stateNode;
            var suspenseState = boundaryFiber.memoizedState;
            null !== suspenseState && (retryLane = suspenseState.retryLane);
            break;
          case 19:
            retryCache = boundaryFiber.stateNode;
            break;
          case 22:
            retryCache = boundaryFiber.stateNode._retryCache;
            break;
          default:
            throw Error(formatProdErrorMessage(314));
        }
        null !== retryCache && retryCache.delete(wakeable);
        retryTimedOutBoundary(boundaryFiber, retryLane);
      }
      function scheduleCallback$1(priorityLevel, callback) {
        return scheduleCallback$3(priorityLevel, callback);
      }
      var firstScheduledRoot = null;
      var lastScheduledRoot = null;
      var didScheduleMicrotask = false;
      var mightHavePendingSyncWork = false;
      var isFlushingWork = false;
      var currentEventTransitionLane = 0;
      function ensureRootIsScheduled(root2) {
        root2 !== lastScheduledRoot && null === root2.next && (null === lastScheduledRoot ? firstScheduledRoot = lastScheduledRoot = root2 : lastScheduledRoot = lastScheduledRoot.next = root2);
        mightHavePendingSyncWork = true;
        didScheduleMicrotask || (didScheduleMicrotask = true, scheduleImmediateRootScheduleTask());
      }
      function flushSyncWorkAcrossRoots_impl(syncTransitionLanes, onlyLegacy) {
        if (!isFlushingWork && mightHavePendingSyncWork) {
          isFlushingWork = true;
          do {
            var didPerformSomeWork = false;
            for (var root$170 = firstScheduledRoot; null !== root$170; ) {
              if (!onlyLegacy)
                if (0 !== syncTransitionLanes) {
                  var pendingLanes = root$170.pendingLanes;
                  if (0 === pendingLanes) var JSCompiler_inline_result = 0;
                  else {
                    var suspendedLanes = root$170.suspendedLanes, pingedLanes = root$170.pingedLanes;
                    JSCompiler_inline_result = (1 << 31 - clz32(42 | syncTransitionLanes) + 1) - 1;
                    JSCompiler_inline_result &= pendingLanes & ~(suspendedLanes & ~pingedLanes);
                    JSCompiler_inline_result = JSCompiler_inline_result & 201326741 ? JSCompiler_inline_result & 201326741 | 1 : JSCompiler_inline_result ? JSCompiler_inline_result | 2 : 0;
                  }
                  0 !== JSCompiler_inline_result && (didPerformSomeWork = true, performSyncWorkOnRoot(root$170, JSCompiler_inline_result));
                } else
                  JSCompiler_inline_result = workInProgressRootRenderLanes, JSCompiler_inline_result = getNextLanes(
                    root$170,
                    root$170 === workInProgressRoot ? JSCompiler_inline_result : 0,
                    null !== root$170.cancelPendingCommit || -1 !== root$170.timeoutHandle
                  ), 0 === (JSCompiler_inline_result & 3) || checkIfRootIsPrerendering(root$170, JSCompiler_inline_result) || (didPerformSomeWork = true, performSyncWorkOnRoot(root$170, JSCompiler_inline_result));
              root$170 = root$170.next;
            }
          } while (didPerformSomeWork);
          isFlushingWork = false;
        }
      }
      function processRootScheduleInImmediateTask() {
        processRootScheduleInMicrotask();
      }
      function processRootScheduleInMicrotask() {
        mightHavePendingSyncWork = didScheduleMicrotask = false;
        var syncTransitionLanes = 0;
        0 !== currentEventTransitionLane && shouldAttemptEagerTransition() && (syncTransitionLanes = currentEventTransitionLane);
        for (var currentTime = now(), prev = null, root2 = firstScheduledRoot; null !== root2; ) {
          var next = root2.next, nextLanes = scheduleTaskForRootDuringMicrotask(root2, currentTime);
          if (0 === nextLanes)
            root2.next = null, null === prev ? firstScheduledRoot = next : prev.next = next, null === next && (lastScheduledRoot = prev);
          else if (prev = root2, 0 !== syncTransitionLanes || 0 !== (nextLanes & 3))
            mightHavePendingSyncWork = true;
          root2 = next;
        }
        0 !== pendingEffectsStatus && 5 !== pendingEffectsStatus || flushSyncWorkAcrossRoots_impl(syncTransitionLanes, false);
        0 !== currentEventTransitionLane && (currentEventTransitionLane = 0);
      }
      function scheduleTaskForRootDuringMicrotask(root2, currentTime) {
        for (var suspendedLanes = root2.suspendedLanes, pingedLanes = root2.pingedLanes, expirationTimes = root2.expirationTimes, lanes = root2.pendingLanes & -62914561; 0 < lanes; ) {
          var index$5 = 31 - clz32(lanes), lane = 1 << index$5, expirationTime = expirationTimes[index$5];
          if (-1 === expirationTime) {
            if (0 === (lane & suspendedLanes) || 0 !== (lane & pingedLanes))
              expirationTimes[index$5] = computeExpirationTime(lane, currentTime);
          } else expirationTime <= currentTime && (root2.expiredLanes |= lane);
          lanes &= ~lane;
        }
        currentTime = workInProgressRoot;
        suspendedLanes = workInProgressRootRenderLanes;
        suspendedLanes = getNextLanes(
          root2,
          root2 === currentTime ? suspendedLanes : 0,
          null !== root2.cancelPendingCommit || -1 !== root2.timeoutHandle
        );
        pingedLanes = root2.callbackNode;
        if (0 === suspendedLanes || root2 === currentTime && (2 === workInProgressSuspendedReason || 9 === workInProgressSuspendedReason) || null !== root2.cancelPendingCommit)
          return null !== pingedLanes && null !== pingedLanes && cancelCallback$1(pingedLanes), root2.callbackNode = null, root2.callbackPriority = 0;
        if (0 === (suspendedLanes & 3) || checkIfRootIsPrerendering(root2, suspendedLanes)) {
          currentTime = suspendedLanes & -suspendedLanes;
          if (currentTime === root2.callbackPriority) return currentTime;
          null !== pingedLanes && cancelCallback$1(pingedLanes);
          switch (lanesToEventPriority(suspendedLanes)) {
            case 2:
            case 8:
              suspendedLanes = UserBlockingPriority;
              break;
            case 32:
              suspendedLanes = NormalPriority$1;
              break;
            case 268435456:
              suspendedLanes = IdlePriority;
              break;
            default:
              suspendedLanes = NormalPriority$1;
          }
          pingedLanes = performWorkOnRootViaSchedulerTask.bind(null, root2);
          suspendedLanes = scheduleCallback$3(suspendedLanes, pingedLanes);
          root2.callbackPriority = currentTime;
          root2.callbackNode = suspendedLanes;
          return currentTime;
        }
        null !== pingedLanes && null !== pingedLanes && cancelCallback$1(pingedLanes);
        root2.callbackPriority = 2;
        root2.callbackNode = null;
        return 2;
      }
      function performWorkOnRootViaSchedulerTask(root2, didTimeout) {
        if (0 !== pendingEffectsStatus && 5 !== pendingEffectsStatus)
          return root2.callbackNode = null, root2.callbackPriority = 0, null;
        var originalCallbackNode = root2.callbackNode;
        if (flushPendingEffects() && root2.callbackNode !== originalCallbackNode)
          return null;
        var workInProgressRootRenderLanes$jscomp$0 = workInProgressRootRenderLanes;
        workInProgressRootRenderLanes$jscomp$0 = getNextLanes(
          root2,
          root2 === workInProgressRoot ? workInProgressRootRenderLanes$jscomp$0 : 0,
          null !== root2.cancelPendingCommit || -1 !== root2.timeoutHandle
        );
        if (0 === workInProgressRootRenderLanes$jscomp$0) return null;
        performWorkOnRoot(root2, workInProgressRootRenderLanes$jscomp$0, didTimeout);
        scheduleTaskForRootDuringMicrotask(root2, now());
        return null != root2.callbackNode && root2.callbackNode === originalCallbackNode ? performWorkOnRootViaSchedulerTask.bind(null, root2) : null;
      }
      function performSyncWorkOnRoot(root2, lanes) {
        if (flushPendingEffects()) return null;
        performWorkOnRoot(root2, lanes, true);
      }
      function scheduleImmediateRootScheduleTask() {
        scheduleMicrotask(function() {
          0 !== (executionContext & 6) ? scheduleCallback$3(
            ImmediatePriority,
            processRootScheduleInImmediateTask
          ) : processRootScheduleInMicrotask();
        });
      }
      function requestTransitionLane() {
        if (0 === currentEventTransitionLane) {
          var actionScopeLane = currentEntangledLane;
          0 === actionScopeLane && (actionScopeLane = nextTransitionUpdateLane, nextTransitionUpdateLane <<= 1, 0 === (nextTransitionUpdateLane & 261888) && (nextTransitionUpdateLane = 256));
          currentEventTransitionLane = actionScopeLane;
        }
        return currentEventTransitionLane;
      }
      function coerceFormActionProp(actionProp) {
        return null == actionProp || "symbol" === typeof actionProp || "boolean" === typeof actionProp ? null : "function" === typeof actionProp ? actionProp : sanitizeURL("" + actionProp);
      }
      function createFormDataWithSubmitter(form, submitter) {
        var temp = submitter.ownerDocument.createElement("input");
        temp.name = submitter.name;
        temp.value = submitter.value;
        form.id && temp.setAttribute("form", form.id);
        submitter.parentNode.insertBefore(temp, submitter);
        form = new FormData(form);
        temp.parentNode.removeChild(temp);
        return form;
      }
      function extractEvents$1(dispatchQueue, domEventName, maybeTargetInst, nativeEvent, nativeEventTarget) {
        if ("submit" === domEventName && maybeTargetInst && maybeTargetInst.stateNode === nativeEventTarget) {
          var action = coerceFormActionProp(
            (nativeEventTarget[internalPropsKey] || null).action
          ), submitter = nativeEvent.submitter;
          submitter && (domEventName = (domEventName = submitter[internalPropsKey] || null) ? coerceFormActionProp(domEventName.formAction) : submitter.getAttribute("formAction"), null !== domEventName && (action = domEventName, submitter = null));
          var event = new SyntheticEvent(
            "action",
            "action",
            null,
            nativeEvent,
            nativeEventTarget
          );
          dispatchQueue.push({
            event,
            listeners: [
              {
                instance: null,
                listener: function() {
                  if (nativeEvent.defaultPrevented) {
                    if (0 !== currentEventTransitionLane) {
                      var formData = submitter ? createFormDataWithSubmitter(nativeEventTarget, submitter) : new FormData(nativeEventTarget);
                      startHostTransition(
                        maybeTargetInst,
                        {
                          pending: true,
                          data: formData,
                          method: nativeEventTarget.method,
                          action
                        },
                        null,
                        formData
                      );
                    }
                  } else
                    "function" === typeof action && (event.preventDefault(), formData = submitter ? createFormDataWithSubmitter(nativeEventTarget, submitter) : new FormData(nativeEventTarget), startHostTransition(
                      maybeTargetInst,
                      {
                        pending: true,
                        data: formData,
                        method: nativeEventTarget.method,
                        action
                      },
                      action,
                      formData
                    ));
                },
                currentTarget: nativeEventTarget
              }
            ]
          });
        }
      }
      for (i$jscomp$inline_1577 = 0; i$jscomp$inline_1577 < simpleEventPluginEvents.length; i$jscomp$inline_1577++) {
        eventName$jscomp$inline_1578 = simpleEventPluginEvents[i$jscomp$inline_1577], domEventName$jscomp$inline_1579 = eventName$jscomp$inline_1578.toLowerCase(), capitalizedEvent$jscomp$inline_1580 = eventName$jscomp$inline_1578[0].toUpperCase() + eventName$jscomp$inline_1578.slice(1);
        registerSimpleEvent(
          domEventName$jscomp$inline_1579,
          "on" + capitalizedEvent$jscomp$inline_1580
        );
      }
      var eventName$jscomp$inline_1578;
      var domEventName$jscomp$inline_1579;
      var capitalizedEvent$jscomp$inline_1580;
      var i$jscomp$inline_1577;
      registerSimpleEvent(ANIMATION_END, "onAnimationEnd");
      registerSimpleEvent(ANIMATION_ITERATION, "onAnimationIteration");
      registerSimpleEvent(ANIMATION_START, "onAnimationStart");
      registerSimpleEvent("dblclick", "onDoubleClick");
      registerSimpleEvent("focusin", "onFocus");
      registerSimpleEvent("focusout", "onBlur");
      registerSimpleEvent(TRANSITION_RUN, "onTransitionRun");
      registerSimpleEvent(TRANSITION_START, "onTransitionStart");
      registerSimpleEvent(TRANSITION_CANCEL, "onTransitionCancel");
      registerSimpleEvent(TRANSITION_END, "onTransitionEnd");
      registerDirectEvent("onMouseEnter", ["mouseout", "mouseover"]);
      registerDirectEvent("onMouseLeave", ["mouseout", "mouseover"]);
      registerDirectEvent("onPointerEnter", ["pointerout", "pointerover"]);
      registerDirectEvent("onPointerLeave", ["pointerout", "pointerover"]);
      registerTwoPhaseEvent(
        "onChange",
        "change click focusin focusout input keydown keyup selectionchange".split(" ")
      );
      registerTwoPhaseEvent(
        "onSelect",
        "focusout contextmenu dragend focusin keydown keyup mousedown mouseup selectionchange".split(
          " "
        )
      );
      registerTwoPhaseEvent("onBeforeInput", [
        "compositionend",
        "keypress",
        "textInput",
        "paste"
      ]);
      registerTwoPhaseEvent(
        "onCompositionEnd",
        "compositionend focusout keydown keypress keyup mousedown".split(" ")
      );
      registerTwoPhaseEvent(
        "onCompositionStart",
        "compositionstart focusout keydown keypress keyup mousedown".split(" ")
      );
      registerTwoPhaseEvent(
        "onCompositionUpdate",
        "compositionupdate focusout keydown keypress keyup mousedown".split(" ")
      );
      var mediaEventTypes = "abort canplay canplaythrough durationchange emptied encrypted ended error loadeddata loadedmetadata loadstart pause play playing progress ratechange resize seeked seeking stalled suspend timeupdate volumechange waiting".split(
        " "
      );
      var nonDelegatedEvents = new Set(
        "beforetoggle cancel close invalid load scroll scrollend toggle".split(" ").concat(mediaEventTypes)
      );
      function processDispatchQueue(dispatchQueue, eventSystemFlags) {
        eventSystemFlags = 0 !== (eventSystemFlags & 4);
        for (var i = 0; i < dispatchQueue.length; i++) {
          var _dispatchQueue$i = dispatchQueue[i], event = _dispatchQueue$i.event;
          _dispatchQueue$i = _dispatchQueue$i.listeners;
          a: {
            var previousInstance = void 0;
            if (eventSystemFlags)
              for (var i$jscomp$0 = _dispatchQueue$i.length - 1; 0 <= i$jscomp$0; i$jscomp$0--) {
                var _dispatchListeners$i = _dispatchQueue$i[i$jscomp$0], instance = _dispatchListeners$i.instance, currentTarget = _dispatchListeners$i.currentTarget;
                _dispatchListeners$i = _dispatchListeners$i.listener;
                if (instance !== previousInstance && event.isPropagationStopped())
                  break a;
                previousInstance = _dispatchListeners$i;
                event.currentTarget = currentTarget;
                try {
                  previousInstance(event);
                } catch (error) {
                  reportGlobalError(error);
                }
                event.currentTarget = null;
                previousInstance = instance;
              }
            else
              for (i$jscomp$0 = 0; i$jscomp$0 < _dispatchQueue$i.length; i$jscomp$0++) {
                _dispatchListeners$i = _dispatchQueue$i[i$jscomp$0];
                instance = _dispatchListeners$i.instance;
                currentTarget = _dispatchListeners$i.currentTarget;
                _dispatchListeners$i = _dispatchListeners$i.listener;
                if (instance !== previousInstance && event.isPropagationStopped())
                  break a;
                previousInstance = _dispatchListeners$i;
                event.currentTarget = currentTarget;
                try {
                  previousInstance(event);
                } catch (error) {
                  reportGlobalError(error);
                }
                event.currentTarget = null;
                previousInstance = instance;
              }
          }
        }
      }
      function listenToNonDelegatedEvent(domEventName, targetElement) {
        var JSCompiler_inline_result = targetElement[internalEventHandlersKey];
        void 0 === JSCompiler_inline_result && (JSCompiler_inline_result = targetElement[internalEventHandlersKey] = /* @__PURE__ */ new Set());
        var listenerSetKey = domEventName + "__bubble";
        JSCompiler_inline_result.has(listenerSetKey) || (addTrappedEventListener(targetElement, domEventName, 2, false), JSCompiler_inline_result.add(listenerSetKey));
      }
      function listenToNativeEvent(domEventName, isCapturePhaseListener, target) {
        var eventSystemFlags = 0;
        isCapturePhaseListener && (eventSystemFlags |= 4);
        addTrappedEventListener(
          target,
          domEventName,
          eventSystemFlags,
          isCapturePhaseListener
        );
      }
      var listeningMarker = "_reactListening" + Math.random().toString(36).slice(2);
      function listenToAllSupportedEvents(rootContainerElement) {
        if (!rootContainerElement[listeningMarker]) {
          rootContainerElement[listeningMarker] = true;
          allNativeEvents.forEach(function(domEventName) {
            "selectionchange" !== domEventName && (nonDelegatedEvents.has(domEventName) || listenToNativeEvent(domEventName, false, rootContainerElement), listenToNativeEvent(domEventName, true, rootContainerElement));
          });
          var ownerDocument = 9 === rootContainerElement.nodeType ? rootContainerElement : rootContainerElement.ownerDocument;
          null === ownerDocument || ownerDocument[listeningMarker] || (ownerDocument[listeningMarker] = true, listenToNativeEvent("selectionchange", false, ownerDocument));
        }
      }
      function addTrappedEventListener(targetContainer, domEventName, eventSystemFlags, isCapturePhaseListener) {
        switch (getEventPriority(domEventName)) {
          case 2:
            var listenerWrapper = dispatchDiscreteEvent;
            break;
          case 8:
            listenerWrapper = dispatchContinuousEvent;
            break;
          default:
            listenerWrapper = dispatchEvent;
        }
        eventSystemFlags = listenerWrapper.bind(
          null,
          domEventName,
          eventSystemFlags,
          targetContainer
        );
        listenerWrapper = void 0;
        !passiveBrowserEventsSupported || "touchstart" !== domEventName && "touchmove" !== domEventName && "wheel" !== domEventName || (listenerWrapper = true);
        isCapturePhaseListener ? void 0 !== listenerWrapper ? targetContainer.addEventListener(domEventName, eventSystemFlags, {
          capture: true,
          passive: listenerWrapper
        }) : targetContainer.addEventListener(domEventName, eventSystemFlags, true) : void 0 !== listenerWrapper ? targetContainer.addEventListener(domEventName, eventSystemFlags, {
          passive: listenerWrapper
        }) : targetContainer.addEventListener(domEventName, eventSystemFlags, false);
      }
      function dispatchEventForPluginEventSystem(domEventName, eventSystemFlags, nativeEvent, targetInst$jscomp$0, targetContainer) {
        var ancestorInst = targetInst$jscomp$0;
        if (0 === (eventSystemFlags & 1) && 0 === (eventSystemFlags & 2) && null !== targetInst$jscomp$0)
          a: for (; ; ) {
            if (null === targetInst$jscomp$0) return;
            var nodeTag = targetInst$jscomp$0.tag;
            if (3 === nodeTag || 4 === nodeTag) {
              var container = targetInst$jscomp$0.stateNode.containerInfo;
              if (container === targetContainer) break;
              if (4 === nodeTag)
                for (nodeTag = targetInst$jscomp$0.return; null !== nodeTag; ) {
                  var grandTag = nodeTag.tag;
                  if ((3 === grandTag || 4 === grandTag) && nodeTag.stateNode.containerInfo === targetContainer)
                    return;
                  nodeTag = nodeTag.return;
                }
              for (; null !== container; ) {
                nodeTag = getClosestInstanceFromNode(container);
                if (null === nodeTag) return;
                grandTag = nodeTag.tag;
                if (5 === grandTag || 6 === grandTag || 26 === grandTag || 27 === grandTag) {
                  targetInst$jscomp$0 = ancestorInst = nodeTag;
                  continue a;
                }
                container = container.parentNode;
              }
            }
            targetInst$jscomp$0 = targetInst$jscomp$0.return;
          }
        batchedUpdates$1(function() {
          var targetInst = ancestorInst, nativeEventTarget = getEventTarget(nativeEvent), dispatchQueue = [];
          a: {
            var reactName = topLevelEventsToReactNames.get(domEventName);
            if (void 0 !== reactName) {
              var SyntheticEventCtor = SyntheticEvent, reactEventType = domEventName;
              switch (domEventName) {
                case "keypress":
                  if (0 === getEventCharCode(nativeEvent)) break a;
                case "keydown":
                case "keyup":
                  SyntheticEventCtor = SyntheticKeyboardEvent;
                  break;
                case "focusin":
                  reactEventType = "focus";
                  SyntheticEventCtor = SyntheticFocusEvent;
                  break;
                case "focusout":
                  reactEventType = "blur";
                  SyntheticEventCtor = SyntheticFocusEvent;
                  break;
                case "beforeblur":
                case "afterblur":
                  SyntheticEventCtor = SyntheticFocusEvent;
                  break;
                case "click":
                  if (2 === nativeEvent.button) break a;
                case "auxclick":
                case "dblclick":
                case "mousedown":
                case "mousemove":
                case "mouseup":
                case "mouseout":
                case "mouseover":
                case "contextmenu":
                  SyntheticEventCtor = SyntheticMouseEvent;
                  break;
                case "drag":
                case "dragend":
                case "dragenter":
                case "dragexit":
                case "dragleave":
                case "dragover":
                case "dragstart":
                case "drop":
                  SyntheticEventCtor = SyntheticDragEvent;
                  break;
                case "touchcancel":
                case "touchend":
                case "touchmove":
                case "touchstart":
                  SyntheticEventCtor = SyntheticTouchEvent;
                  break;
                case ANIMATION_END:
                case ANIMATION_ITERATION:
                case ANIMATION_START:
                  SyntheticEventCtor = SyntheticAnimationEvent;
                  break;
                case TRANSITION_END:
                  SyntheticEventCtor = SyntheticTransitionEvent;
                  break;
                case "scroll":
                case "scrollend":
                  SyntheticEventCtor = SyntheticUIEvent;
                  break;
                case "wheel":
                  SyntheticEventCtor = SyntheticWheelEvent;
                  break;
                case "copy":
                case "cut":
                case "paste":
                  SyntheticEventCtor = SyntheticClipboardEvent;
                  break;
                case "gotpointercapture":
                case "lostpointercapture":
                case "pointercancel":
                case "pointerdown":
                case "pointermove":
                case "pointerout":
                case "pointerover":
                case "pointerup":
                  SyntheticEventCtor = SyntheticPointerEvent;
                  break;
                case "toggle":
                case "beforetoggle":
                  SyntheticEventCtor = SyntheticToggleEvent;
              }
              var inCapturePhase = 0 !== (eventSystemFlags & 4), accumulateTargetOnly = !inCapturePhase && ("scroll" === domEventName || "scrollend" === domEventName), reactEventName = inCapturePhase ? null !== reactName ? reactName + "Capture" : null : reactName;
              inCapturePhase = [];
              for (var instance = targetInst, lastHostComponent; null !== instance; ) {
                var _instance = instance;
                lastHostComponent = _instance.stateNode;
                _instance = _instance.tag;
                5 !== _instance && 26 !== _instance && 27 !== _instance || null === lastHostComponent || null === reactEventName || (_instance = getListener(instance, reactEventName), null != _instance && inCapturePhase.push(
                  createDispatchListener(instance, _instance, lastHostComponent)
                ));
                if (accumulateTargetOnly) break;
                instance = instance.return;
              }
              0 < inCapturePhase.length && (reactName = new SyntheticEventCtor(
                reactName,
                reactEventType,
                null,
                nativeEvent,
                nativeEventTarget
              ), dispatchQueue.push({ event: reactName, listeners: inCapturePhase }));
            }
          }
          if (0 === (eventSystemFlags & 7)) {
            a: {
              reactName = "mouseover" === domEventName || "pointerover" === domEventName;
              SyntheticEventCtor = "mouseout" === domEventName || "pointerout" === domEventName;
              if (reactName && nativeEvent !== currentReplayingEvent && (reactEventType = nativeEvent.relatedTarget || nativeEvent.fromElement) && (getClosestInstanceFromNode(reactEventType) || reactEventType[internalContainerInstanceKey]))
                break a;
              if (SyntheticEventCtor || reactName) {
                reactName = nativeEventTarget.window === nativeEventTarget ? nativeEventTarget : (reactName = nativeEventTarget.ownerDocument) ? reactName.defaultView || reactName.parentWindow : window;
                if (SyntheticEventCtor) {
                  if (reactEventType = nativeEvent.relatedTarget || nativeEvent.toElement, SyntheticEventCtor = targetInst, reactEventType = reactEventType ? getClosestInstanceFromNode(reactEventType) : null, null !== reactEventType && (accumulateTargetOnly = getNearestMountedFiber(reactEventType), inCapturePhase = reactEventType.tag, reactEventType !== accumulateTargetOnly || 5 !== inCapturePhase && 27 !== inCapturePhase && 6 !== inCapturePhase))
                    reactEventType = null;
                } else SyntheticEventCtor = null, reactEventType = targetInst;
                if (SyntheticEventCtor !== reactEventType) {
                  inCapturePhase = SyntheticMouseEvent;
                  _instance = "onMouseLeave";
                  reactEventName = "onMouseEnter";
                  instance = "mouse";
                  if ("pointerout" === domEventName || "pointerover" === domEventName)
                    inCapturePhase = SyntheticPointerEvent, _instance = "onPointerLeave", reactEventName = "onPointerEnter", instance = "pointer";
                  accumulateTargetOnly = null == SyntheticEventCtor ? reactName : getNodeFromInstance(SyntheticEventCtor);
                  lastHostComponent = null == reactEventType ? reactName : getNodeFromInstance(reactEventType);
                  reactName = new inCapturePhase(
                    _instance,
                    instance + "leave",
                    SyntheticEventCtor,
                    nativeEvent,
                    nativeEventTarget
                  );
                  reactName.target = accumulateTargetOnly;
                  reactName.relatedTarget = lastHostComponent;
                  _instance = null;
                  getClosestInstanceFromNode(nativeEventTarget) === targetInst && (inCapturePhase = new inCapturePhase(
                    reactEventName,
                    instance + "enter",
                    reactEventType,
                    nativeEvent,
                    nativeEventTarget
                  ), inCapturePhase.target = lastHostComponent, inCapturePhase.relatedTarget = accumulateTargetOnly, _instance = inCapturePhase);
                  accumulateTargetOnly = _instance;
                  if (SyntheticEventCtor && reactEventType)
                    b: {
                      inCapturePhase = getParent;
                      reactEventName = SyntheticEventCtor;
                      instance = reactEventType;
                      lastHostComponent = 0;
                      for (_instance = reactEventName; _instance; _instance = inCapturePhase(_instance))
                        lastHostComponent++;
                      _instance = 0;
                      for (var tempB = instance; tempB; tempB = inCapturePhase(tempB))
                        _instance++;
                      for (; 0 < lastHostComponent - _instance; )
                        reactEventName = inCapturePhase(reactEventName), lastHostComponent--;
                      for (; 0 < _instance - lastHostComponent; )
                        instance = inCapturePhase(instance), _instance--;
                      for (; lastHostComponent--; ) {
                        if (reactEventName === instance || null !== instance && reactEventName === instance.alternate) {
                          inCapturePhase = reactEventName;
                          break b;
                        }
                        reactEventName = inCapturePhase(reactEventName);
                        instance = inCapturePhase(instance);
                      }
                      inCapturePhase = null;
                    }
                  else inCapturePhase = null;
                  null !== SyntheticEventCtor && accumulateEnterLeaveListenersForEvent(
                    dispatchQueue,
                    reactName,
                    SyntheticEventCtor,
                    inCapturePhase,
                    false
                  );
                  null !== reactEventType && null !== accumulateTargetOnly && accumulateEnterLeaveListenersForEvent(
                    dispatchQueue,
                    accumulateTargetOnly,
                    reactEventType,
                    inCapturePhase,
                    true
                  );
                }
              }
            }
            a: {
              reactName = targetInst ? getNodeFromInstance(targetInst) : window;
              SyntheticEventCtor = reactName.nodeName && reactName.nodeName.toLowerCase();
              if ("select" === SyntheticEventCtor || "input" === SyntheticEventCtor && "file" === reactName.type)
                var getTargetInstFunc = getTargetInstForChangeEvent;
              else if (isTextInputElement(reactName))
                if (isInputEventSupported)
                  getTargetInstFunc = getTargetInstForInputOrChangeEvent;
                else {
                  getTargetInstFunc = getTargetInstForInputEventPolyfill;
                  var handleEventFunc = handleEventsForInputEventPolyfill;
                }
              else
                SyntheticEventCtor = reactName.nodeName, !SyntheticEventCtor || "input" !== SyntheticEventCtor.toLowerCase() || "checkbox" !== reactName.type && "radio" !== reactName.type ? targetInst && isCustomElement(targetInst.elementType) && (getTargetInstFunc = getTargetInstForChangeEvent) : getTargetInstFunc = getTargetInstForClickEvent;
              if (getTargetInstFunc && (getTargetInstFunc = getTargetInstFunc(domEventName, targetInst))) {
                createAndAccumulateChangeEvent(
                  dispatchQueue,
                  getTargetInstFunc,
                  nativeEvent,
                  nativeEventTarget
                );
                break a;
              }
              handleEventFunc && handleEventFunc(domEventName, reactName, targetInst);
              "focusout" === domEventName && targetInst && "number" === reactName.type && null != targetInst.memoizedProps.value && setDefaultValue(reactName, "number", reactName.value);
            }
            handleEventFunc = targetInst ? getNodeFromInstance(targetInst) : window;
            switch (domEventName) {
              case "focusin":
                if (isTextInputElement(handleEventFunc) || "true" === handleEventFunc.contentEditable)
                  activeElement = handleEventFunc, activeElementInst = targetInst, lastSelection = null;
                break;
              case "focusout":
                lastSelection = activeElementInst = activeElement = null;
                break;
              case "mousedown":
                mouseDown = true;
                break;
              case "contextmenu":
              case "mouseup":
              case "dragend":
                mouseDown = false;
                constructSelectEvent(dispatchQueue, nativeEvent, nativeEventTarget);
                break;
              case "selectionchange":
                if (skipSelectionChangeEvent) break;
              case "keydown":
              case "keyup":
                constructSelectEvent(dispatchQueue, nativeEvent, nativeEventTarget);
            }
            var fallbackData;
            if (canUseCompositionEvent)
              b: {
                switch (domEventName) {
                  case "compositionstart":
                    var eventType = "onCompositionStart";
                    break b;
                  case "compositionend":
                    eventType = "onCompositionEnd";
                    break b;
                  case "compositionupdate":
                    eventType = "onCompositionUpdate";
                    break b;
                }
                eventType = void 0;
              }
            else
              isComposing ? isFallbackCompositionEnd(domEventName, nativeEvent) && (eventType = "onCompositionEnd") : "keydown" === domEventName && 229 === nativeEvent.keyCode && (eventType = "onCompositionStart");
            eventType && (useFallbackCompositionData && "ko" !== nativeEvent.locale && (isComposing || "onCompositionStart" !== eventType ? "onCompositionEnd" === eventType && isComposing && (fallbackData = getData()) : (root = nativeEventTarget, startText = "value" in root ? root.value : root.textContent, isComposing = true)), handleEventFunc = accumulateTwoPhaseListeners(targetInst, eventType), 0 < handleEventFunc.length && (eventType = new SyntheticCompositionEvent(
              eventType,
              domEventName,
              null,
              nativeEvent,
              nativeEventTarget
            ), dispatchQueue.push({ event: eventType, listeners: handleEventFunc }), fallbackData ? eventType.data = fallbackData : (fallbackData = getDataFromCustomEvent(nativeEvent), null !== fallbackData && (eventType.data = fallbackData))));
            if (fallbackData = canUseTextInputEvent ? getNativeBeforeInputChars(domEventName, nativeEvent) : getFallbackBeforeInputChars(domEventName, nativeEvent))
              eventType = accumulateTwoPhaseListeners(targetInst, "onBeforeInput"), 0 < eventType.length && (handleEventFunc = new SyntheticCompositionEvent(
                "onBeforeInput",
                "beforeinput",
                null,
                nativeEvent,
                nativeEventTarget
              ), dispatchQueue.push({
                event: handleEventFunc,
                listeners: eventType
              }), handleEventFunc.data = fallbackData);
            extractEvents$1(
              dispatchQueue,
              domEventName,
              targetInst,
              nativeEvent,
              nativeEventTarget
            );
          }
          processDispatchQueue(dispatchQueue, eventSystemFlags);
        });
      }
      function createDispatchListener(instance, listener, currentTarget) {
        return {
          instance,
          listener,
          currentTarget
        };
      }
      function accumulateTwoPhaseListeners(targetFiber, reactName) {
        for (var captureName = reactName + "Capture", listeners = []; null !== targetFiber; ) {
          var _instance2 = targetFiber, stateNode = _instance2.stateNode;
          _instance2 = _instance2.tag;
          5 !== _instance2 && 26 !== _instance2 && 27 !== _instance2 || null === stateNode || (_instance2 = getListener(targetFiber, captureName), null != _instance2 && listeners.unshift(
            createDispatchListener(targetFiber, _instance2, stateNode)
          ), _instance2 = getListener(targetFiber, reactName), null != _instance2 && listeners.push(
            createDispatchListener(targetFiber, _instance2, stateNode)
          ));
          if (3 === targetFiber.tag) return listeners;
          targetFiber = targetFiber.return;
        }
        return [];
      }
      function getParent(inst) {
        if (null === inst) return null;
        do
          inst = inst.return;
        while (inst && 5 !== inst.tag && 27 !== inst.tag);
        return inst ? inst : null;
      }
      function accumulateEnterLeaveListenersForEvent(dispatchQueue, event, target, common, inCapturePhase) {
        for (var registrationName = event._reactName, listeners = []; null !== target && target !== common; ) {
          var _instance3 = target, alternate = _instance3.alternate, stateNode = _instance3.stateNode;
          _instance3 = _instance3.tag;
          if (null !== alternate && alternate === common) break;
          5 !== _instance3 && 26 !== _instance3 && 27 !== _instance3 || null === stateNode || (alternate = stateNode, inCapturePhase ? (stateNode = getListener(target, registrationName), null != stateNode && listeners.unshift(
            createDispatchListener(target, stateNode, alternate)
          )) : inCapturePhase || (stateNode = getListener(target, registrationName), null != stateNode && listeners.push(
            createDispatchListener(target, stateNode, alternate)
          )));
          target = target.return;
        }
        0 !== listeners.length && dispatchQueue.push({ event, listeners });
      }
      var NORMALIZE_NEWLINES_REGEX = /\r\n?/g;
      var NORMALIZE_NULL_AND_REPLACEMENT_REGEX = /\u0000|\uFFFD/g;
      function normalizeMarkupForTextOrAttribute(markup) {
        return ("string" === typeof markup ? markup : "" + markup).replace(NORMALIZE_NEWLINES_REGEX, "\n").replace(NORMALIZE_NULL_AND_REPLACEMENT_REGEX, "");
      }
      function checkForUnmatchedText(serverText, clientText) {
        clientText = normalizeMarkupForTextOrAttribute(clientText);
        return normalizeMarkupForTextOrAttribute(serverText) === clientText ? true : false;
      }
      function setProp(domElement, tag, key, value, props, prevValue) {
        switch (key) {
          case "children":
            "string" === typeof value ? "body" === tag || "textarea" === tag && "" === value || setTextContent(domElement, value) : ("number" === typeof value || "bigint" === typeof value) && "body" !== tag && setTextContent(domElement, "" + value);
            break;
          case "className":
            setValueForKnownAttribute(domElement, "class", value);
            break;
          case "tabIndex":
            setValueForKnownAttribute(domElement, "tabindex", value);
            break;
          case "dir":
          case "role":
          case "viewBox":
          case "width":
          case "height":
            setValueForKnownAttribute(domElement, key, value);
            break;
          case "style":
            setValueForStyles(domElement, value, prevValue);
            break;
          case "data":
            if ("object" !== tag) {
              setValueForKnownAttribute(domElement, "data", value);
              break;
            }
          case "src":
          case "href":
            if ("" === value && ("a" !== tag || "href" !== key)) {
              domElement.removeAttribute(key);
              break;
            }
            if (null == value || "function" === typeof value || "symbol" === typeof value || "boolean" === typeof value) {
              domElement.removeAttribute(key);
              break;
            }
            value = sanitizeURL("" + value);
            domElement.setAttribute(key, value);
            break;
          case "action":
          case "formAction":
            if ("function" === typeof value) {
              domElement.setAttribute(
                key,
                "javascript:throw new Error('A React form was unexpectedly submitted. If you called form.submit() manually, consider using form.requestSubmit() instead. If you\\'re trying to use event.stopPropagation() in a submit event handler, consider also calling event.preventDefault().')"
              );
              break;
            } else
              "function" === typeof prevValue && ("formAction" === key ? ("input" !== tag && setProp(domElement, tag, "name", props.name, props, null), setProp(
                domElement,
                tag,
                "formEncType",
                props.formEncType,
                props,
                null
              ), setProp(
                domElement,
                tag,
                "formMethod",
                props.formMethod,
                props,
                null
              ), setProp(
                domElement,
                tag,
                "formTarget",
                props.formTarget,
                props,
                null
              )) : (setProp(domElement, tag, "encType", props.encType, props, null), setProp(domElement, tag, "method", props.method, props, null), setProp(domElement, tag, "target", props.target, props, null)));
            if (null == value || "symbol" === typeof value || "boolean" === typeof value) {
              domElement.removeAttribute(key);
              break;
            }
            value = sanitizeURL("" + value);
            domElement.setAttribute(key, value);
            break;
          case "onClick":
            null != value && (domElement.onclick = noop$1);
            break;
          case "onScroll":
            null != value && listenToNonDelegatedEvent("scroll", domElement);
            break;
          case "onScrollEnd":
            null != value && listenToNonDelegatedEvent("scrollend", domElement);
            break;
          case "dangerouslySetInnerHTML":
            if (null != value) {
              if ("object" !== typeof value || !("__html" in value))
                throw Error(formatProdErrorMessage(61));
              key = value.__html;
              if (null != key) {
                if (null != props.children) throw Error(formatProdErrorMessage(60));
                domElement.innerHTML = key;
              }
            }
            break;
          case "multiple":
            domElement.multiple = value && "function" !== typeof value && "symbol" !== typeof value;
            break;
          case "muted":
            domElement.muted = value && "function" !== typeof value && "symbol" !== typeof value;
            break;
          case "suppressContentEditableWarning":
          case "suppressHydrationWarning":
          case "defaultValue":
          case "defaultChecked":
          case "innerHTML":
          case "ref":
            break;
          case "autoFocus":
            break;
          case "xlinkHref":
            if (null == value || "function" === typeof value || "boolean" === typeof value || "symbol" === typeof value) {
              domElement.removeAttribute("xlink:href");
              break;
            }
            key = sanitizeURL("" + value);
            domElement.setAttributeNS(
              "http://www.w3.org/1999/xlink",
              "xlink:href",
              key
            );
            break;
          case "contentEditable":
          case "spellCheck":
          case "draggable":
          case "value":
          case "autoReverse":
          case "externalResourcesRequired":
          case "focusable":
          case "preserveAlpha":
            null != value && "function" !== typeof value && "symbol" !== typeof value ? domElement.setAttribute(key, "" + value) : domElement.removeAttribute(key);
            break;
          case "inert":
          case "allowFullScreen":
          case "async":
          case "autoPlay":
          case "controls":
          case "default":
          case "defer":
          case "disabled":
          case "disablePictureInPicture":
          case "disableRemotePlayback":
          case "formNoValidate":
          case "hidden":
          case "loop":
          case "noModule":
          case "noValidate":
          case "open":
          case "playsInline":
          case "readOnly":
          case "required":
          case "reversed":
          case "scoped":
          case "seamless":
          case "itemScope":
            value && "function" !== typeof value && "symbol" !== typeof value ? domElement.setAttribute(key, "") : domElement.removeAttribute(key);
            break;
          case "capture":
          case "download":
            true === value ? domElement.setAttribute(key, "") : false !== value && null != value && "function" !== typeof value && "symbol" !== typeof value ? domElement.setAttribute(key, value) : domElement.removeAttribute(key);
            break;
          case "cols":
          case "rows":
          case "size":
          case "span":
            null != value && "function" !== typeof value && "symbol" !== typeof value && !isNaN(value) && 1 <= value ? domElement.setAttribute(key, value) : domElement.removeAttribute(key);
            break;
          case "rowSpan":
          case "start":
            null == value || "function" === typeof value || "symbol" === typeof value || isNaN(value) ? domElement.removeAttribute(key) : domElement.setAttribute(key, value);
            break;
          case "popover":
            listenToNonDelegatedEvent("beforetoggle", domElement);
            listenToNonDelegatedEvent("toggle", domElement);
            setValueForAttribute(domElement, "popover", value);
            break;
          case "xlinkActuate":
            setValueForNamespacedAttribute(
              domElement,
              "http://www.w3.org/1999/xlink",
              "xlink:actuate",
              value
            );
            break;
          case "xlinkArcrole":
            setValueForNamespacedAttribute(
              domElement,
              "http://www.w3.org/1999/xlink",
              "xlink:arcrole",
              value
            );
            break;
          case "xlinkRole":
            setValueForNamespacedAttribute(
              domElement,
              "http://www.w3.org/1999/xlink",
              "xlink:role",
              value
            );
            break;
          case "xlinkShow":
            setValueForNamespacedAttribute(
              domElement,
              "http://www.w3.org/1999/xlink",
              "xlink:show",
              value
            );
            break;
          case "xlinkTitle":
            setValueForNamespacedAttribute(
              domElement,
              "http://www.w3.org/1999/xlink",
              "xlink:title",
              value
            );
            break;
          case "xlinkType":
            setValueForNamespacedAttribute(
              domElement,
              "http://www.w3.org/1999/xlink",
              "xlink:type",
              value
            );
            break;
          case "xmlBase":
            setValueForNamespacedAttribute(
              domElement,
              "http://www.w3.org/XML/1998/namespace",
              "xml:base",
              value
            );
            break;
          case "xmlLang":
            setValueForNamespacedAttribute(
              domElement,
              "http://www.w3.org/XML/1998/namespace",
              "xml:lang",
              value
            );
            break;
          case "xmlSpace":
            setValueForNamespacedAttribute(
              domElement,
              "http://www.w3.org/XML/1998/namespace",
              "xml:space",
              value
            );
            break;
          case "is":
            setValueForAttribute(domElement, "is", value);
            break;
          case "innerText":
          case "textContent":
            break;
          default:
            if (!(2 < key.length) || "o" !== key[0] && "O" !== key[0] || "n" !== key[1] && "N" !== key[1])
              key = aliases.get(key) || key, setValueForAttribute(domElement, key, value);
        }
      }
      function setPropOnCustomElement(domElement, tag, key, value, props, prevValue) {
        switch (key) {
          case "style":
            setValueForStyles(domElement, value, prevValue);
            break;
          case "dangerouslySetInnerHTML":
            if (null != value) {
              if ("object" !== typeof value || !("__html" in value))
                throw Error(formatProdErrorMessage(61));
              key = value.__html;
              if (null != key) {
                if (null != props.children) throw Error(formatProdErrorMessage(60));
                domElement.innerHTML = key;
              }
            }
            break;
          case "children":
            "string" === typeof value ? setTextContent(domElement, value) : ("number" === typeof value || "bigint" === typeof value) && setTextContent(domElement, "" + value);
            break;
          case "onScroll":
            null != value && listenToNonDelegatedEvent("scroll", domElement);
            break;
          case "onScrollEnd":
            null != value && listenToNonDelegatedEvent("scrollend", domElement);
            break;
          case "onClick":
            null != value && (domElement.onclick = noop$1);
            break;
          case "suppressContentEditableWarning":
          case "suppressHydrationWarning":
          case "innerHTML":
          case "ref":
            break;
          case "innerText":
          case "textContent":
            break;
          default:
            if (!registrationNameDependencies.hasOwnProperty(key))
              a: {
                if ("o" === key[0] && "n" === key[1] && (props = key.endsWith("Capture"), tag = key.slice(2, props ? key.length - 7 : void 0), prevValue = domElement[internalPropsKey] || null, prevValue = null != prevValue ? prevValue[key] : null, "function" === typeof prevValue && domElement.removeEventListener(tag, prevValue, props), "function" === typeof value)) {
                  "function" !== typeof prevValue && null !== prevValue && (key in domElement ? domElement[key] = null : domElement.hasAttribute(key) && domElement.removeAttribute(key));
                  domElement.addEventListener(tag, value, props);
                  break a;
                }
                key in domElement ? domElement[key] = value : true === value ? domElement.setAttribute(key, "") : setValueForAttribute(domElement, key, value);
              }
        }
      }
      function setInitialProperties(domElement, tag, props) {
        switch (tag) {
          case "div":
          case "span":
          case "svg":
          case "path":
          case "a":
          case "g":
          case "p":
          case "li":
            break;
          case "img":
            listenToNonDelegatedEvent("error", domElement);
            listenToNonDelegatedEvent("load", domElement);
            var hasSrc = false, hasSrcSet = false, propKey;
            for (propKey in props)
              if (props.hasOwnProperty(propKey)) {
                var propValue = props[propKey];
                if (null != propValue)
                  switch (propKey) {
                    case "src":
                      hasSrc = true;
                      break;
                    case "srcSet":
                      hasSrcSet = true;
                      break;
                    case "children":
                    case "dangerouslySetInnerHTML":
                      throw Error(formatProdErrorMessage(137, tag));
                    default:
                      setProp(domElement, tag, propKey, propValue, props, null);
                  }
              }
            hasSrcSet && setProp(domElement, tag, "srcSet", props.srcSet, props, null);
            hasSrc && setProp(domElement, tag, "src", props.src, props, null);
            return;
          case "input":
            listenToNonDelegatedEvent("invalid", domElement);
            var defaultValue = propKey = propValue = hasSrcSet = null, checked = null, defaultChecked = null;
            for (hasSrc in props)
              if (props.hasOwnProperty(hasSrc)) {
                var propValue$184 = props[hasSrc];
                if (null != propValue$184)
                  switch (hasSrc) {
                    case "name":
                      hasSrcSet = propValue$184;
                      break;
                    case "type":
                      propValue = propValue$184;
                      break;
                    case "checked":
                      checked = propValue$184;
                      break;
                    case "defaultChecked":
                      defaultChecked = propValue$184;
                      break;
                    case "value":
                      propKey = propValue$184;
                      break;
                    case "defaultValue":
                      defaultValue = propValue$184;
                      break;
                    case "children":
                    case "dangerouslySetInnerHTML":
                      if (null != propValue$184)
                        throw Error(formatProdErrorMessage(137, tag));
                      break;
                    default:
                      setProp(domElement, tag, hasSrc, propValue$184, props, null);
                  }
              }
            initInput(
              domElement,
              propKey,
              defaultValue,
              checked,
              defaultChecked,
              propValue,
              hasSrcSet,
              false
            );
            return;
          case "select":
            listenToNonDelegatedEvent("invalid", domElement);
            hasSrc = propValue = propKey = null;
            for (hasSrcSet in props)
              if (props.hasOwnProperty(hasSrcSet) && (defaultValue = props[hasSrcSet], null != defaultValue))
                switch (hasSrcSet) {
                  case "value":
                    propKey = defaultValue;
                    break;
                  case "defaultValue":
                    propValue = defaultValue;
                    break;
                  case "multiple":
                    hasSrc = defaultValue;
                  default:
                    setProp(domElement, tag, hasSrcSet, defaultValue, props, null);
                }
            tag = propKey;
            props = propValue;
            domElement.multiple = !!hasSrc;
            null != tag ? updateOptions(domElement, !!hasSrc, tag, false) : null != props && updateOptions(domElement, !!hasSrc, props, true);
            return;
          case "textarea":
            listenToNonDelegatedEvent("invalid", domElement);
            propKey = hasSrcSet = hasSrc = null;
            for (propValue in props)
              if (props.hasOwnProperty(propValue) && (defaultValue = props[propValue], null != defaultValue))
                switch (propValue) {
                  case "value":
                    hasSrc = defaultValue;
                    break;
                  case "defaultValue":
                    hasSrcSet = defaultValue;
                    break;
                  case "children":
                    propKey = defaultValue;
                    break;
                  case "dangerouslySetInnerHTML":
                    if (null != defaultValue) throw Error(formatProdErrorMessage(91));
                    break;
                  default:
                    setProp(domElement, tag, propValue, defaultValue, props, null);
                }
            initTextarea(domElement, hasSrc, hasSrcSet, propKey);
            return;
          case "option":
            for (checked in props)
              if (props.hasOwnProperty(checked) && (hasSrc = props[checked], null != hasSrc))
                switch (checked) {
                  case "selected":
                    domElement.selected = hasSrc && "function" !== typeof hasSrc && "symbol" !== typeof hasSrc;
                    break;
                  default:
                    setProp(domElement, tag, checked, hasSrc, props, null);
                }
            return;
          case "dialog":
            listenToNonDelegatedEvent("beforetoggle", domElement);
            listenToNonDelegatedEvent("toggle", domElement);
            listenToNonDelegatedEvent("cancel", domElement);
            listenToNonDelegatedEvent("close", domElement);
            break;
          case "iframe":
          case "object":
            listenToNonDelegatedEvent("load", domElement);
            break;
          case "video":
          case "audio":
            for (hasSrc = 0; hasSrc < mediaEventTypes.length; hasSrc++)
              listenToNonDelegatedEvent(mediaEventTypes[hasSrc], domElement);
            break;
          case "image":
            listenToNonDelegatedEvent("error", domElement);
            listenToNonDelegatedEvent("load", domElement);
            break;
          case "details":
            listenToNonDelegatedEvent("toggle", domElement);
            break;
          case "embed":
          case "source":
          case "link":
            listenToNonDelegatedEvent("error", domElement), listenToNonDelegatedEvent("load", domElement);
          case "area":
          case "base":
          case "br":
          case "col":
          case "hr":
          case "keygen":
          case "meta":
          case "param":
          case "track":
          case "wbr":
          case "menuitem":
            for (defaultChecked in props)
              if (props.hasOwnProperty(defaultChecked) && (hasSrc = props[defaultChecked], null != hasSrc))
                switch (defaultChecked) {
                  case "children":
                  case "dangerouslySetInnerHTML":
                    throw Error(formatProdErrorMessage(137, tag));
                  default:
                    setProp(domElement, tag, defaultChecked, hasSrc, props, null);
                }
            return;
          default:
            if (isCustomElement(tag)) {
              for (propValue$184 in props)
                props.hasOwnProperty(propValue$184) && (hasSrc = props[propValue$184], void 0 !== hasSrc && setPropOnCustomElement(
                  domElement,
                  tag,
                  propValue$184,
                  hasSrc,
                  props,
                  void 0
                ));
              return;
            }
        }
        for (defaultValue in props)
          props.hasOwnProperty(defaultValue) && (hasSrc = props[defaultValue], null != hasSrc && setProp(domElement, tag, defaultValue, hasSrc, props, null));
      }
      function updateProperties(domElement, tag, lastProps, nextProps) {
        switch (tag) {
          case "div":
          case "span":
          case "svg":
          case "path":
          case "a":
          case "g":
          case "p":
          case "li":
            break;
          case "input":
            var name = null, type = null, value = null, defaultValue = null, lastDefaultValue = null, checked = null, defaultChecked = null;
            for (propKey in lastProps) {
              var lastProp = lastProps[propKey];
              if (lastProps.hasOwnProperty(propKey) && null != lastProp)
                switch (propKey) {
                  case "checked":
                    break;
                  case "value":
                    break;
                  case "defaultValue":
                    lastDefaultValue = lastProp;
                  default:
                    nextProps.hasOwnProperty(propKey) || setProp(domElement, tag, propKey, null, nextProps, lastProp);
                }
            }
            for (var propKey$201 in nextProps) {
              var propKey = nextProps[propKey$201];
              lastProp = lastProps[propKey$201];
              if (nextProps.hasOwnProperty(propKey$201) && (null != propKey || null != lastProp))
                switch (propKey$201) {
                  case "type":
                    type = propKey;
                    break;
                  case "name":
                    name = propKey;
                    break;
                  case "checked":
                    checked = propKey;
                    break;
                  case "defaultChecked":
                    defaultChecked = propKey;
                    break;
                  case "value":
                    value = propKey;
                    break;
                  case "defaultValue":
                    defaultValue = propKey;
                    break;
                  case "children":
                  case "dangerouslySetInnerHTML":
                    if (null != propKey)
                      throw Error(formatProdErrorMessage(137, tag));
                    break;
                  default:
                    propKey !== lastProp && setProp(
                      domElement,
                      tag,
                      propKey$201,
                      propKey,
                      nextProps,
                      lastProp
                    );
                }
            }
            updateInput(
              domElement,
              value,
              defaultValue,
              lastDefaultValue,
              checked,
              defaultChecked,
              type,
              name
            );
            return;
          case "select":
            propKey = value = defaultValue = propKey$201 = null;
            for (type in lastProps)
              if (lastDefaultValue = lastProps[type], lastProps.hasOwnProperty(type) && null != lastDefaultValue)
                switch (type) {
                  case "value":
                    break;
                  case "multiple":
                    propKey = lastDefaultValue;
                  default:
                    nextProps.hasOwnProperty(type) || setProp(
                      domElement,
                      tag,
                      type,
                      null,
                      nextProps,
                      lastDefaultValue
                    );
                }
            for (name in nextProps)
              if (type = nextProps[name], lastDefaultValue = lastProps[name], nextProps.hasOwnProperty(name) && (null != type || null != lastDefaultValue))
                switch (name) {
                  case "value":
                    propKey$201 = type;
                    break;
                  case "defaultValue":
                    defaultValue = type;
                    break;
                  case "multiple":
                    value = type;
                  default:
                    type !== lastDefaultValue && setProp(
                      domElement,
                      tag,
                      name,
                      type,
                      nextProps,
                      lastDefaultValue
                    );
                }
            tag = defaultValue;
            lastProps = value;
            nextProps = propKey;
            null != propKey$201 ? updateOptions(domElement, !!lastProps, propKey$201, false) : !!nextProps !== !!lastProps && (null != tag ? updateOptions(domElement, !!lastProps, tag, true) : updateOptions(domElement, !!lastProps, lastProps ? [] : "", false));
            return;
          case "textarea":
            propKey = propKey$201 = null;
            for (defaultValue in lastProps)
              if (name = lastProps[defaultValue], lastProps.hasOwnProperty(defaultValue) && null != name && !nextProps.hasOwnProperty(defaultValue))
                switch (defaultValue) {
                  case "value":
                    break;
                  case "children":
                    break;
                  default:
                    setProp(domElement, tag, defaultValue, null, nextProps, name);
                }
            for (value in nextProps)
              if (name = nextProps[value], type = lastProps[value], nextProps.hasOwnProperty(value) && (null != name || null != type))
                switch (value) {
                  case "value":
                    propKey$201 = name;
                    break;
                  case "defaultValue":
                    propKey = name;
                    break;
                  case "children":
                    break;
                  case "dangerouslySetInnerHTML":
                    if (null != name) throw Error(formatProdErrorMessage(91));
                    break;
                  default:
                    name !== type && setProp(domElement, tag, value, name, nextProps, type);
                }
            updateTextarea(domElement, propKey$201, propKey);
            return;
          case "option":
            for (var propKey$217 in lastProps)
              if (propKey$201 = lastProps[propKey$217], lastProps.hasOwnProperty(propKey$217) && null != propKey$201 && !nextProps.hasOwnProperty(propKey$217))
                switch (propKey$217) {
                  case "selected":
                    domElement.selected = false;
                    break;
                  default:
                    setProp(
                      domElement,
                      tag,
                      propKey$217,
                      null,
                      nextProps,
                      propKey$201
                    );
                }
            for (lastDefaultValue in nextProps)
              if (propKey$201 = nextProps[lastDefaultValue], propKey = lastProps[lastDefaultValue], nextProps.hasOwnProperty(lastDefaultValue) && propKey$201 !== propKey && (null != propKey$201 || null != propKey))
                switch (lastDefaultValue) {
                  case "selected":
                    domElement.selected = propKey$201 && "function" !== typeof propKey$201 && "symbol" !== typeof propKey$201;
                    break;
                  default:
                    setProp(
                      domElement,
                      tag,
                      lastDefaultValue,
                      propKey$201,
                      nextProps,
                      propKey
                    );
                }
            return;
          case "img":
          case "link":
          case "area":
          case "base":
          case "br":
          case "col":
          case "embed":
          case "hr":
          case "keygen":
          case "meta":
          case "param":
          case "source":
          case "track":
          case "wbr":
          case "menuitem":
            for (var propKey$222 in lastProps)
              propKey$201 = lastProps[propKey$222], lastProps.hasOwnProperty(propKey$222) && null != propKey$201 && !nextProps.hasOwnProperty(propKey$222) && setProp(domElement, tag, propKey$222, null, nextProps, propKey$201);
            for (checked in nextProps)
              if (propKey$201 = nextProps[checked], propKey = lastProps[checked], nextProps.hasOwnProperty(checked) && propKey$201 !== propKey && (null != propKey$201 || null != propKey))
                switch (checked) {
                  case "children":
                  case "dangerouslySetInnerHTML":
                    if (null != propKey$201)
                      throw Error(formatProdErrorMessage(137, tag));
                    break;
                  default:
                    setProp(
                      domElement,
                      tag,
                      checked,
                      propKey$201,
                      nextProps,
                      propKey
                    );
                }
            return;
          default:
            if (isCustomElement(tag)) {
              for (var propKey$227 in lastProps)
                propKey$201 = lastProps[propKey$227], lastProps.hasOwnProperty(propKey$227) && void 0 !== propKey$201 && !nextProps.hasOwnProperty(propKey$227) && setPropOnCustomElement(
                  domElement,
                  tag,
                  propKey$227,
                  void 0,
                  nextProps,
                  propKey$201
                );
              for (defaultChecked in nextProps)
                propKey$201 = nextProps[defaultChecked], propKey = lastProps[defaultChecked], !nextProps.hasOwnProperty(defaultChecked) || propKey$201 === propKey || void 0 === propKey$201 && void 0 === propKey || setPropOnCustomElement(
                  domElement,
                  tag,
                  defaultChecked,
                  propKey$201,
                  nextProps,
                  propKey
                );
              return;
            }
        }
        for (var propKey$232 in lastProps)
          propKey$201 = lastProps[propKey$232], lastProps.hasOwnProperty(propKey$232) && null != propKey$201 && !nextProps.hasOwnProperty(propKey$232) && setProp(domElement, tag, propKey$232, null, nextProps, propKey$201);
        for (lastProp in nextProps)
          propKey$201 = nextProps[lastProp], propKey = lastProps[lastProp], !nextProps.hasOwnProperty(lastProp) || propKey$201 === propKey || null == propKey$201 && null == propKey || setProp(domElement, tag, lastProp, propKey$201, nextProps, propKey);
      }
      function isLikelyStaticResource(initiatorType) {
        switch (initiatorType) {
          case "css":
          case "script":
          case "font":
          case "img":
          case "image":
          case "input":
          case "link":
            return true;
          default:
            return false;
        }
      }
      function estimateBandwidth() {
        if ("function" === typeof performance.getEntriesByType) {
          for (var count = 0, bits = 0, resourceEntries = performance.getEntriesByType("resource"), i = 0; i < resourceEntries.length; i++) {
            var entry = resourceEntries[i], transferSize = entry.transferSize, initiatorType = entry.initiatorType, duration = entry.duration;
            if (transferSize && duration && isLikelyStaticResource(initiatorType)) {
              initiatorType = 0;
              duration = entry.responseEnd;
              for (i += 1; i < resourceEntries.length; i++) {
                var overlapEntry = resourceEntries[i], overlapStartTime = overlapEntry.startTime;
                if (overlapStartTime > duration) break;
                var overlapTransferSize = overlapEntry.transferSize, overlapInitiatorType = overlapEntry.initiatorType;
                overlapTransferSize && isLikelyStaticResource(overlapInitiatorType) && (overlapEntry = overlapEntry.responseEnd, initiatorType += overlapTransferSize * (overlapEntry < duration ? 1 : (duration - overlapStartTime) / (overlapEntry - overlapStartTime)));
              }
              --i;
              bits += 8 * (transferSize + initiatorType) / (entry.duration / 1e3);
              count++;
              if (10 < count) break;
            }
          }
          if (0 < count) return bits / count / 1e6;
        }
        return navigator.connection && (count = navigator.connection.downlink, "number" === typeof count) ? count : 5;
      }
      var eventsEnabled = null;
      var selectionInformation = null;
      function getOwnerDocumentFromRootContainer(rootContainerElement) {
        return 9 === rootContainerElement.nodeType ? rootContainerElement : rootContainerElement.ownerDocument;
      }
      function getOwnHostContext(namespaceURI) {
        switch (namespaceURI) {
          case "http://www.w3.org/2000/svg":
            return 1;
          case "http://www.w3.org/1998/Math/MathML":
            return 2;
          default:
            return 0;
        }
      }
      function getChildHostContextProd(parentNamespace, type) {
        if (0 === parentNamespace)
          switch (type) {
            case "svg":
              return 1;
            case "math":
              return 2;
            default:
              return 0;
          }
        return 1 === parentNamespace && "foreignObject" === type ? 0 : parentNamespace;
      }
      function shouldSetTextContent(type, props) {
        return "textarea" === type || "noscript" === type || "string" === typeof props.children || "number" === typeof props.children || "bigint" === typeof props.children || "object" === typeof props.dangerouslySetInnerHTML && null !== props.dangerouslySetInnerHTML && null != props.dangerouslySetInnerHTML.__html;
      }
      var currentPopstateTransitionEvent = null;
      function shouldAttemptEagerTransition() {
        var event = window.event;
        if (event && "popstate" === event.type) {
          if (event === currentPopstateTransitionEvent) return false;
          currentPopstateTransitionEvent = event;
          return true;
        }
        currentPopstateTransitionEvent = null;
        return false;
      }
      var scheduleTimeout = "function" === typeof setTimeout ? setTimeout : void 0;
      var cancelTimeout = "function" === typeof clearTimeout ? clearTimeout : void 0;
      var localPromise = "function" === typeof Promise ? Promise : void 0;
      var scheduleMicrotask = "function" === typeof queueMicrotask ? queueMicrotask : "undefined" !== typeof localPromise ? function(callback) {
        return localPromise.resolve(null).then(callback).catch(handleErrorInNextTick);
      } : scheduleTimeout;
      function handleErrorInNextTick(error) {
        setTimeout(function() {
          throw error;
        });
      }
      function isSingletonScope(type) {
        return "head" === type;
      }
      function clearHydrationBoundary(parentInstance, hydrationInstance) {
        var node = hydrationInstance, depth = 0;
        do {
          var nextNode = node.nextSibling;
          parentInstance.removeChild(node);
          if (nextNode && 8 === nextNode.nodeType)
            if (node = nextNode.data, "/$" === node || "/&" === node) {
              if (0 === depth) {
                parentInstance.removeChild(nextNode);
                retryIfBlockedOn(hydrationInstance);
                return;
              }
              depth--;
            } else if ("$" === node || "$?" === node || "$~" === node || "$!" === node || "&" === node)
              depth++;
            else if ("html" === node)
              releaseSingletonInstance(parentInstance.ownerDocument.documentElement);
            else if ("head" === node) {
              node = parentInstance.ownerDocument.head;
              releaseSingletonInstance(node);
              for (var node$jscomp$0 = node.firstChild; node$jscomp$0; ) {
                var nextNode$jscomp$0 = node$jscomp$0.nextSibling, nodeName = node$jscomp$0.nodeName;
                node$jscomp$0[internalHoistableMarker] || "SCRIPT" === nodeName || "STYLE" === nodeName || "LINK" === nodeName && "stylesheet" === node$jscomp$0.rel.toLowerCase() || node.removeChild(node$jscomp$0);
                node$jscomp$0 = nextNode$jscomp$0;
              }
            } else
              "body" === node && releaseSingletonInstance(parentInstance.ownerDocument.body);
          node = nextNode;
        } while (node);
        retryIfBlockedOn(hydrationInstance);
      }
      function hideOrUnhideDehydratedBoundary(suspenseInstance, isHidden) {
        var node = suspenseInstance;
        suspenseInstance = 0;
        do {
          var nextNode = node.nextSibling;
          1 === node.nodeType ? isHidden ? (node._stashedDisplay = node.style.display, node.style.display = "none") : (node.style.display = node._stashedDisplay || "", "" === node.getAttribute("style") && node.removeAttribute("style")) : 3 === node.nodeType && (isHidden ? (node._stashedText = node.nodeValue, node.nodeValue = "") : node.nodeValue = node._stashedText || "");
          if (nextNode && 8 === nextNode.nodeType)
            if (node = nextNode.data, "/$" === node)
              if (0 === suspenseInstance) break;
              else suspenseInstance--;
            else
              "$" !== node && "$?" !== node && "$~" !== node && "$!" !== node || suspenseInstance++;
          node = nextNode;
        } while (node);
      }
      function clearContainerSparingly(container) {
        var nextNode = container.firstChild;
        nextNode && 10 === nextNode.nodeType && (nextNode = nextNode.nextSibling);
        for (; nextNode; ) {
          var node = nextNode;
          nextNode = nextNode.nextSibling;
          switch (node.nodeName) {
            case "HTML":
            case "HEAD":
            case "BODY":
              clearContainerSparingly(node);
              detachDeletedInstance(node);
              continue;
            case "SCRIPT":
            case "STYLE":
              continue;
            case "LINK":
              if ("stylesheet" === node.rel.toLowerCase()) continue;
          }
          container.removeChild(node);
        }
      }
      function canHydrateInstance(instance, type, props, inRootOrSingleton) {
        for (; 1 === instance.nodeType; ) {
          var anyProps = props;
          if (instance.nodeName.toLowerCase() !== type.toLowerCase()) {
            if (!inRootOrSingleton && ("INPUT" !== instance.nodeName || "hidden" !== instance.type))
              break;
          } else if (!inRootOrSingleton)
            if ("input" === type && "hidden" === instance.type) {
              var name = null == anyProps.name ? null : "" + anyProps.name;
              if ("hidden" === anyProps.type && instance.getAttribute("name") === name)
                return instance;
            } else return instance;
          else if (!instance[internalHoistableMarker])
            switch (type) {
              case "meta":
                if (!instance.hasAttribute("itemprop")) break;
                return instance;
              case "link":
                name = instance.getAttribute("rel");
                if ("stylesheet" === name && instance.hasAttribute("data-precedence"))
                  break;
                else if (name !== anyProps.rel || instance.getAttribute("href") !== (null == anyProps.href || "" === anyProps.href ? null : anyProps.href) || instance.getAttribute("crossorigin") !== (null == anyProps.crossOrigin ? null : anyProps.crossOrigin) || instance.getAttribute("title") !== (null == anyProps.title ? null : anyProps.title))
                  break;
                return instance;
              case "style":
                if (instance.hasAttribute("data-precedence")) break;
                return instance;
              case "script":
                name = instance.getAttribute("src");
                if ((name !== (null == anyProps.src ? null : anyProps.src) || instance.getAttribute("type") !== (null == anyProps.type ? null : anyProps.type) || instance.getAttribute("crossorigin") !== (null == anyProps.crossOrigin ? null : anyProps.crossOrigin)) && name && instance.hasAttribute("async") && !instance.hasAttribute("itemprop"))
                  break;
                return instance;
              default:
                return instance;
            }
          instance = getNextHydratable(instance.nextSibling);
          if (null === instance) break;
        }
        return null;
      }
      function canHydrateTextInstance(instance, text, inRootOrSingleton) {
        if ("" === text) return null;
        for (; 3 !== instance.nodeType; ) {
          if ((1 !== instance.nodeType || "INPUT" !== instance.nodeName || "hidden" !== instance.type) && !inRootOrSingleton)
            return null;
          instance = getNextHydratable(instance.nextSibling);
          if (null === instance) return null;
        }
        return instance;
      }
      function canHydrateHydrationBoundary(instance, inRootOrSingleton) {
        for (; 8 !== instance.nodeType; ) {
          if ((1 !== instance.nodeType || "INPUT" !== instance.nodeName || "hidden" !== instance.type) && !inRootOrSingleton)
            return null;
          instance = getNextHydratable(instance.nextSibling);
          if (null === instance) return null;
        }
        return instance;
      }
      function isSuspenseInstancePending(instance) {
        return "$?" === instance.data || "$~" === instance.data;
      }
      function isSuspenseInstanceFallback(instance) {
        return "$!" === instance.data || "$?" === instance.data && "loading" !== instance.ownerDocument.readyState;
      }
      function registerSuspenseInstanceRetry(instance, callback) {
        var ownerDocument = instance.ownerDocument;
        if ("$~" === instance.data) instance._reactRetry = callback;
        else if ("$?" !== instance.data || "loading" !== ownerDocument.readyState)
          callback();
        else {
          var listener = function() {
            callback();
            ownerDocument.removeEventListener("DOMContentLoaded", listener);
          };
          ownerDocument.addEventListener("DOMContentLoaded", listener);
          instance._reactRetry = listener;
        }
      }
      function getNextHydratable(node) {
        for (; null != node; node = node.nextSibling) {
          var nodeType = node.nodeType;
          if (1 === nodeType || 3 === nodeType) break;
          if (8 === nodeType) {
            nodeType = node.data;
            if ("$" === nodeType || "$!" === nodeType || "$?" === nodeType || "$~" === nodeType || "&" === nodeType || "F!" === nodeType || "F" === nodeType)
              break;
            if ("/$" === nodeType || "/&" === nodeType) return null;
          }
        }
        return node;
      }
      var previousHydratableOnEnteringScopedSingleton = null;
      function getNextHydratableInstanceAfterHydrationBoundary(hydrationInstance) {
        hydrationInstance = hydrationInstance.nextSibling;
        for (var depth = 0; hydrationInstance; ) {
          if (8 === hydrationInstance.nodeType) {
            var data = hydrationInstance.data;
            if ("/$" === data || "/&" === data) {
              if (0 === depth)
                return getNextHydratable(hydrationInstance.nextSibling);
              depth--;
            } else
              "$" !== data && "$!" !== data && "$?" !== data && "$~" !== data && "&" !== data || depth++;
          }
          hydrationInstance = hydrationInstance.nextSibling;
        }
        return null;
      }
      function getParentHydrationBoundary(targetInstance) {
        targetInstance = targetInstance.previousSibling;
        for (var depth = 0; targetInstance; ) {
          if (8 === targetInstance.nodeType) {
            var data = targetInstance.data;
            if ("$" === data || "$!" === data || "$?" === data || "$~" === data || "&" === data) {
              if (0 === depth) return targetInstance;
              depth--;
            } else "/$" !== data && "/&" !== data || depth++;
          }
          targetInstance = targetInstance.previousSibling;
        }
        return null;
      }
      function resolveSingletonInstance(type, props, rootContainerInstance) {
        props = getOwnerDocumentFromRootContainer(rootContainerInstance);
        switch (type) {
          case "html":
            type = props.documentElement;
            if (!type) throw Error(formatProdErrorMessage(452));
            return type;
          case "head":
            type = props.head;
            if (!type) throw Error(formatProdErrorMessage(453));
            return type;
          case "body":
            type = props.body;
            if (!type) throw Error(formatProdErrorMessage(454));
            return type;
          default:
            throw Error(formatProdErrorMessage(451));
        }
      }
      function releaseSingletonInstance(instance) {
        for (var attributes = instance.attributes; attributes.length; )
          instance.removeAttributeNode(attributes[0]);
        detachDeletedInstance(instance);
      }
      var preloadPropsMap = /* @__PURE__ */ new Map();
      var preconnectsSet = /* @__PURE__ */ new Set();
      function getHoistableRoot(container) {
        return "function" === typeof container.getRootNode ? container.getRootNode() : 9 === container.nodeType ? container : container.ownerDocument;
      }
      var previousDispatcher = ReactDOMSharedInternals.d;
      ReactDOMSharedInternals.d = {
        f: flushSyncWork,
        r: requestFormReset,
        D: prefetchDNS,
        C: preconnect,
        L: preload,
        m: preloadModule,
        X: preinitScript,
        S: preinitStyle,
        M: preinitModuleScript
      };
      function flushSyncWork() {
        var previousWasRendering = previousDispatcher.f(), wasRendering = flushSyncWork$1();
        return previousWasRendering || wasRendering;
      }
      function requestFormReset(form) {
        var formInst = getInstanceFromNode(form);
        null !== formInst && 5 === formInst.tag && "form" === formInst.type ? requestFormReset$1(formInst) : previousDispatcher.r(form);
      }
      var globalDocument = "undefined" === typeof document ? null : document;
      function preconnectAs(rel, href, crossOrigin) {
        var ownerDocument = globalDocument;
        if (ownerDocument && "string" === typeof href && href) {
          var limitedEscapedHref = escapeSelectorAttributeValueInsideDoubleQuotes(href);
          limitedEscapedHref = 'link[rel="' + rel + '"][href="' + limitedEscapedHref + '"]';
          "string" === typeof crossOrigin && (limitedEscapedHref += '[crossorigin="' + crossOrigin + '"]');
          preconnectsSet.has(limitedEscapedHref) || (preconnectsSet.add(limitedEscapedHref), rel = { rel, crossOrigin, href }, null === ownerDocument.querySelector(limitedEscapedHref) && (href = ownerDocument.createElement("link"), setInitialProperties(href, "link", rel), markNodeAsHoistable(href), ownerDocument.head.appendChild(href)));
        }
      }
      function prefetchDNS(href) {
        previousDispatcher.D(href);
        preconnectAs("dns-prefetch", href, null);
      }
      function preconnect(href, crossOrigin) {
        previousDispatcher.C(href, crossOrigin);
        preconnectAs("preconnect", href, crossOrigin);
      }
      function preload(href, as, options2) {
        previousDispatcher.L(href, as, options2);
        var ownerDocument = globalDocument;
        if (ownerDocument && href && as) {
          var preloadSelector = 'link[rel="preload"][as="' + escapeSelectorAttributeValueInsideDoubleQuotes(as) + '"]';
          "image" === as ? options2 && options2.imageSrcSet ? (preloadSelector += '[imagesrcset="' + escapeSelectorAttributeValueInsideDoubleQuotes(
            options2.imageSrcSet
          ) + '"]', "string" === typeof options2.imageSizes && (preloadSelector += '[imagesizes="' + escapeSelectorAttributeValueInsideDoubleQuotes(
            options2.imageSizes
          ) + '"]')) : preloadSelector += '[href="' + escapeSelectorAttributeValueInsideDoubleQuotes(href) + '"]' : preloadSelector += '[href="' + escapeSelectorAttributeValueInsideDoubleQuotes(href) + '"]';
          var key = preloadSelector;
          switch (as) {
            case "style":
              key = getStyleKey(href);
              break;
            case "script":
              key = getScriptKey(href);
          }
          preloadPropsMap.has(key) || (href = assign(
            {
              rel: "preload",
              href: "image" === as && options2 && options2.imageSrcSet ? void 0 : href,
              as
            },
            options2
          ), preloadPropsMap.set(key, href), null !== ownerDocument.querySelector(preloadSelector) || "style" === as && ownerDocument.querySelector(getStylesheetSelectorFromKey(key)) || "script" === as && ownerDocument.querySelector(getScriptSelectorFromKey(key)) || (as = ownerDocument.createElement("link"), setInitialProperties(as, "link", href), markNodeAsHoistable(as), ownerDocument.head.appendChild(as)));
        }
      }
      function preloadModule(href, options2) {
        previousDispatcher.m(href, options2);
        var ownerDocument = globalDocument;
        if (ownerDocument && href) {
          var as = options2 && "string" === typeof options2.as ? options2.as : "script", preloadSelector = 'link[rel="modulepreload"][as="' + escapeSelectorAttributeValueInsideDoubleQuotes(as) + '"][href="' + escapeSelectorAttributeValueInsideDoubleQuotes(href) + '"]', key = preloadSelector;
          switch (as) {
            case "audioworklet":
            case "paintworklet":
            case "serviceworker":
            case "sharedworker":
            case "worker":
            case "script":
              key = getScriptKey(href);
          }
          if (!preloadPropsMap.has(key) && (href = assign({ rel: "modulepreload", href }, options2), preloadPropsMap.set(key, href), null === ownerDocument.querySelector(preloadSelector))) {
            switch (as) {
              case "audioworklet":
              case "paintworklet":
              case "serviceworker":
              case "sharedworker":
              case "worker":
              case "script":
                if (ownerDocument.querySelector(getScriptSelectorFromKey(key)))
                  return;
            }
            as = ownerDocument.createElement("link");
            setInitialProperties(as, "link", href);
            markNodeAsHoistable(as);
            ownerDocument.head.appendChild(as);
          }
        }
      }
      function preinitStyle(href, precedence, options2) {
        previousDispatcher.S(href, precedence, options2);
        var ownerDocument = globalDocument;
        if (ownerDocument && href) {
          var styles = getResourcesFromRoot(ownerDocument).hoistableStyles, key = getStyleKey(href);
          precedence = precedence || "default";
          var resource = styles.get(key);
          if (!resource) {
            var state = { loading: 0, preload: null };
            if (resource = ownerDocument.querySelector(
              getStylesheetSelectorFromKey(key)
            ))
              state.loading = 5;
            else {
              href = assign(
                { rel: "stylesheet", href, "data-precedence": precedence },
                options2
              );
              (options2 = preloadPropsMap.get(key)) && adoptPreloadPropsForStylesheet(href, options2);
              var link = resource = ownerDocument.createElement("link");
              markNodeAsHoistable(link);
              setInitialProperties(link, "link", href);
              link._p = new Promise(function(resolve, reject) {
                link.onload = resolve;
                link.onerror = reject;
              });
              link.addEventListener("load", function() {
                state.loading |= 1;
              });
              link.addEventListener("error", function() {
                state.loading |= 2;
              });
              state.loading |= 4;
              insertStylesheet(resource, precedence, ownerDocument);
            }
            resource = {
              type: "stylesheet",
              instance: resource,
              count: 1,
              state
            };
            styles.set(key, resource);
          }
        }
      }
      function preinitScript(src, options2) {
        previousDispatcher.X(src, options2);
        var ownerDocument = globalDocument;
        if (ownerDocument && src) {
          var scripts = getResourcesFromRoot(ownerDocument).hoistableScripts, key = getScriptKey(src), resource = scripts.get(key);
          resource || (resource = ownerDocument.querySelector(getScriptSelectorFromKey(key)), resource || (src = assign({ src, async: true }, options2), (options2 = preloadPropsMap.get(key)) && adoptPreloadPropsForScript(src, options2), resource = ownerDocument.createElement("script"), markNodeAsHoistable(resource), setInitialProperties(resource, "link", src), ownerDocument.head.appendChild(resource)), resource = {
            type: "script",
            instance: resource,
            count: 1,
            state: null
          }, scripts.set(key, resource));
        }
      }
      function preinitModuleScript(src, options2) {
        previousDispatcher.M(src, options2);
        var ownerDocument = globalDocument;
        if (ownerDocument && src) {
          var scripts = getResourcesFromRoot(ownerDocument).hoistableScripts, key = getScriptKey(src), resource = scripts.get(key);
          resource || (resource = ownerDocument.querySelector(getScriptSelectorFromKey(key)), resource || (src = assign({ src, async: true, type: "module" }, options2), (options2 = preloadPropsMap.get(key)) && adoptPreloadPropsForScript(src, options2), resource = ownerDocument.createElement("script"), markNodeAsHoistable(resource), setInitialProperties(resource, "link", src), ownerDocument.head.appendChild(resource)), resource = {
            type: "script",
            instance: resource,
            count: 1,
            state: null
          }, scripts.set(key, resource));
        }
      }
      function getResource(type, currentProps, pendingProps, currentResource) {
        var JSCompiler_inline_result = (JSCompiler_inline_result = rootInstanceStackCursor.current) ? getHoistableRoot(JSCompiler_inline_result) : null;
        if (!JSCompiler_inline_result) throw Error(formatProdErrorMessage(446));
        switch (type) {
          case "meta":
          case "title":
            return null;
          case "style":
            return "string" === typeof pendingProps.precedence && "string" === typeof pendingProps.href ? (currentProps = getStyleKey(pendingProps.href), pendingProps = getResourcesFromRoot(
              JSCompiler_inline_result
            ).hoistableStyles, currentResource = pendingProps.get(currentProps), currentResource || (currentResource = {
              type: "style",
              instance: null,
              count: 0,
              state: null
            }, pendingProps.set(currentProps, currentResource)), currentResource) : { type: "void", instance: null, count: 0, state: null };
          case "link":
            if ("stylesheet" === pendingProps.rel && "string" === typeof pendingProps.href && "string" === typeof pendingProps.precedence) {
              type = getStyleKey(pendingProps.href);
              var styles$243 = getResourcesFromRoot(
                JSCompiler_inline_result
              ).hoistableStyles, resource$244 = styles$243.get(type);
              resource$244 || (JSCompiler_inline_result = JSCompiler_inline_result.ownerDocument || JSCompiler_inline_result, resource$244 = {
                type: "stylesheet",
                instance: null,
                count: 0,
                state: { loading: 0, preload: null }
              }, styles$243.set(type, resource$244), (styles$243 = JSCompiler_inline_result.querySelector(
                getStylesheetSelectorFromKey(type)
              )) && !styles$243._p && (resource$244.instance = styles$243, resource$244.state.loading = 5), preloadPropsMap.has(type) || (pendingProps = {
                rel: "preload",
                as: "style",
                href: pendingProps.href,
                crossOrigin: pendingProps.crossOrigin,
                integrity: pendingProps.integrity,
                media: pendingProps.media,
                hrefLang: pendingProps.hrefLang,
                referrerPolicy: pendingProps.referrerPolicy
              }, preloadPropsMap.set(type, pendingProps), styles$243 || preloadStylesheet(
                JSCompiler_inline_result,
                type,
                pendingProps,
                resource$244.state
              )));
              if (currentProps && null === currentResource)
                throw Error(formatProdErrorMessage(528, ""));
              return resource$244;
            }
            if (currentProps && null !== currentResource)
              throw Error(formatProdErrorMessage(529, ""));
            return null;
          case "script":
            return currentProps = pendingProps.async, pendingProps = pendingProps.src, "string" === typeof pendingProps && currentProps && "function" !== typeof currentProps && "symbol" !== typeof currentProps ? (currentProps = getScriptKey(pendingProps), pendingProps = getResourcesFromRoot(
              JSCompiler_inline_result
            ).hoistableScripts, currentResource = pendingProps.get(currentProps), currentResource || (currentResource = {
              type: "script",
              instance: null,
              count: 0,
              state: null
            }, pendingProps.set(currentProps, currentResource)), currentResource) : { type: "void", instance: null, count: 0, state: null };
          default:
            throw Error(formatProdErrorMessage(444, type));
        }
      }
      function getStyleKey(href) {
        return 'href="' + escapeSelectorAttributeValueInsideDoubleQuotes(href) + '"';
      }
      function getStylesheetSelectorFromKey(key) {
        return 'link[rel="stylesheet"][' + key + "]";
      }
      function stylesheetPropsFromRawProps(rawProps) {
        return assign({}, rawProps, {
          "data-precedence": rawProps.precedence,
          precedence: null
        });
      }
      function preloadStylesheet(ownerDocument, key, preloadProps, state) {
        ownerDocument.querySelector('link[rel="preload"][as="style"][' + key + "]") ? state.loading = 1 : (key = ownerDocument.createElement("link"), state.preload = key, key.addEventListener("load", function() {
          return state.loading |= 1;
        }), key.addEventListener("error", function() {
          return state.loading |= 2;
        }), setInitialProperties(key, "link", preloadProps), markNodeAsHoistable(key), ownerDocument.head.appendChild(key));
      }
      function getScriptKey(src) {
        return '[src="' + escapeSelectorAttributeValueInsideDoubleQuotes(src) + '"]';
      }
      function getScriptSelectorFromKey(key) {
        return "script[async]" + key;
      }
      function acquireResource(hoistableRoot, resource, props) {
        resource.count++;
        if (null === resource.instance)
          switch (resource.type) {
            case "style":
              var instance = hoistableRoot.querySelector(
                'style[data-href~="' + escapeSelectorAttributeValueInsideDoubleQuotes(props.href) + '"]'
              );
              if (instance)
                return resource.instance = instance, markNodeAsHoistable(instance), instance;
              var styleProps = assign({}, props, {
                "data-href": props.href,
                "data-precedence": props.precedence,
                href: null,
                precedence: null
              });
              instance = (hoistableRoot.ownerDocument || hoistableRoot).createElement(
                "style"
              );
              markNodeAsHoistable(instance);
              setInitialProperties(instance, "style", styleProps);
              insertStylesheet(instance, props.precedence, hoistableRoot);
              return resource.instance = instance;
            case "stylesheet":
              styleProps = getStyleKey(props.href);
              var instance$249 = hoistableRoot.querySelector(
                getStylesheetSelectorFromKey(styleProps)
              );
              if (instance$249)
                return resource.state.loading |= 4, resource.instance = instance$249, markNodeAsHoistable(instance$249), instance$249;
              instance = stylesheetPropsFromRawProps(props);
              (styleProps = preloadPropsMap.get(styleProps)) && adoptPreloadPropsForStylesheet(instance, styleProps);
              instance$249 = (hoistableRoot.ownerDocument || hoistableRoot).createElement("link");
              markNodeAsHoistable(instance$249);
              var linkInstance = instance$249;
              linkInstance._p = new Promise(function(resolve, reject) {
                linkInstance.onload = resolve;
                linkInstance.onerror = reject;
              });
              setInitialProperties(instance$249, "link", instance);
              resource.state.loading |= 4;
              insertStylesheet(instance$249, props.precedence, hoistableRoot);
              return resource.instance = instance$249;
            case "script":
              instance$249 = getScriptKey(props.src);
              if (styleProps = hoistableRoot.querySelector(
                getScriptSelectorFromKey(instance$249)
              ))
                return resource.instance = styleProps, markNodeAsHoistable(styleProps), styleProps;
              instance = props;
              if (styleProps = preloadPropsMap.get(instance$249))
                instance = assign({}, props), adoptPreloadPropsForScript(instance, styleProps);
              hoistableRoot = hoistableRoot.ownerDocument || hoistableRoot;
              styleProps = hoistableRoot.createElement("script");
              markNodeAsHoistable(styleProps);
              setInitialProperties(styleProps, "link", instance);
              hoistableRoot.head.appendChild(styleProps);
              return resource.instance = styleProps;
            case "void":
              return null;
            default:
              throw Error(formatProdErrorMessage(443, resource.type));
          }
        else
          "stylesheet" === resource.type && 0 === (resource.state.loading & 4) && (instance = resource.instance, resource.state.loading |= 4, insertStylesheet(instance, props.precedence, hoistableRoot));
        return resource.instance;
      }
      function insertStylesheet(instance, precedence, root2) {
        for (var nodes = root2.querySelectorAll(
          'link[rel="stylesheet"][data-precedence],style[data-precedence]'
        ), last = nodes.length ? nodes[nodes.length - 1] : null, prior = last, i = 0; i < nodes.length; i++) {
          var node = nodes[i];
          if (node.dataset.precedence === precedence) prior = node;
          else if (prior !== last) break;
        }
        prior ? prior.parentNode.insertBefore(instance, prior.nextSibling) : (precedence = 9 === root2.nodeType ? root2.head : root2, precedence.insertBefore(instance, precedence.firstChild));
      }
      function adoptPreloadPropsForStylesheet(stylesheetProps, preloadProps) {
        null == stylesheetProps.crossOrigin && (stylesheetProps.crossOrigin = preloadProps.crossOrigin);
        null == stylesheetProps.referrerPolicy && (stylesheetProps.referrerPolicy = preloadProps.referrerPolicy);
        null == stylesheetProps.title && (stylesheetProps.title = preloadProps.title);
      }
      function adoptPreloadPropsForScript(scriptProps, preloadProps) {
        null == scriptProps.crossOrigin && (scriptProps.crossOrigin = preloadProps.crossOrigin);
        null == scriptProps.referrerPolicy && (scriptProps.referrerPolicy = preloadProps.referrerPolicy);
        null == scriptProps.integrity && (scriptProps.integrity = preloadProps.integrity);
      }
      var tagCaches = null;
      function getHydratableHoistableCache(type, keyAttribute, ownerDocument) {
        if (null === tagCaches) {
          var cache = /* @__PURE__ */ new Map();
          var caches = tagCaches = /* @__PURE__ */ new Map();
          caches.set(ownerDocument, cache);
        } else
          caches = tagCaches, cache = caches.get(ownerDocument), cache || (cache = /* @__PURE__ */ new Map(), caches.set(ownerDocument, cache));
        if (cache.has(type)) return cache;
        cache.set(type, null);
        ownerDocument = ownerDocument.getElementsByTagName(type);
        for (caches = 0; caches < ownerDocument.length; caches++) {
          var node = ownerDocument[caches];
          if (!(node[internalHoistableMarker] || node[internalInstanceKey] || "link" === type && "stylesheet" === node.getAttribute("rel")) && "http://www.w3.org/2000/svg" !== node.namespaceURI) {
            var nodeKey = node.getAttribute(keyAttribute) || "";
            nodeKey = type + nodeKey;
            var existing = cache.get(nodeKey);
            existing ? existing.push(node) : cache.set(nodeKey, [node]);
          }
        }
        return cache;
      }
      function mountHoistable(hoistableRoot, type, instance) {
        hoistableRoot = hoistableRoot.ownerDocument || hoistableRoot;
        hoistableRoot.head.insertBefore(
          instance,
          "title" === type ? hoistableRoot.querySelector("head > title") : null
        );
      }
      function isHostHoistableType(type, props, hostContext) {
        if (1 === hostContext || null != props.itemProp) return false;
        switch (type) {
          case "meta":
          case "title":
            return true;
          case "style":
            if ("string" !== typeof props.precedence || "string" !== typeof props.href || "" === props.href)
              break;
            return true;
          case "link":
            if ("string" !== typeof props.rel || "string" !== typeof props.href || "" === props.href || props.onLoad || props.onError)
              break;
            switch (props.rel) {
              case "stylesheet":
                return type = props.disabled, "string" === typeof props.precedence && null == type;
              default:
                return true;
            }
          case "script":
            if (props.async && "function" !== typeof props.async && "symbol" !== typeof props.async && !props.onLoad && !props.onError && props.src && "string" === typeof props.src)
              return true;
        }
        return false;
      }
      function preloadResource(resource) {
        return "stylesheet" === resource.type && 0 === (resource.state.loading & 3) ? false : true;
      }
      function suspendResource(state, hoistableRoot, resource, props) {
        if ("stylesheet" === resource.type && ("string" !== typeof props.media || false !== matchMedia(props.media).matches) && 0 === (resource.state.loading & 4)) {
          if (null === resource.instance) {
            var key = getStyleKey(props.href), instance = hoistableRoot.querySelector(
              getStylesheetSelectorFromKey(key)
            );
            if (instance) {
              hoistableRoot = instance._p;
              null !== hoistableRoot && "object" === typeof hoistableRoot && "function" === typeof hoistableRoot.then && (state.count++, state = onUnsuspend.bind(state), hoistableRoot.then(state, state));
              resource.state.loading |= 4;
              resource.instance = instance;
              markNodeAsHoistable(instance);
              return;
            }
            instance = hoistableRoot.ownerDocument || hoistableRoot;
            props = stylesheetPropsFromRawProps(props);
            (key = preloadPropsMap.get(key)) && adoptPreloadPropsForStylesheet(props, key);
            instance = instance.createElement("link");
            markNodeAsHoistable(instance);
            var linkInstance = instance;
            linkInstance._p = new Promise(function(resolve, reject) {
              linkInstance.onload = resolve;
              linkInstance.onerror = reject;
            });
            setInitialProperties(instance, "link", props);
            resource.instance = instance;
          }
          null === state.stylesheets && (state.stylesheets = /* @__PURE__ */ new Map());
          state.stylesheets.set(resource, hoistableRoot);
          (hoistableRoot = resource.state.preload) && 0 === (resource.state.loading & 3) && (state.count++, resource = onUnsuspend.bind(state), hoistableRoot.addEventListener("load", resource), hoistableRoot.addEventListener("error", resource));
        }
      }
      var estimatedBytesWithinLimit = 0;
      function waitForCommitToBeReady(state, timeoutOffset) {
        state.stylesheets && 0 === state.count && insertSuspendedStylesheets(state, state.stylesheets);
        return 0 < state.count || 0 < state.imgCount ? function(commit) {
          var stylesheetTimer = setTimeout(function() {
            state.stylesheets && insertSuspendedStylesheets(state, state.stylesheets);
            if (state.unsuspend) {
              var unsuspend = state.unsuspend;
              state.unsuspend = null;
              unsuspend();
            }
          }, 6e4 + timeoutOffset);
          0 < state.imgBytes && 0 === estimatedBytesWithinLimit && (estimatedBytesWithinLimit = 62500 * estimateBandwidth());
          var imgTimer = setTimeout(
            function() {
              state.waitingForImages = false;
              if (0 === state.count && (state.stylesheets && insertSuspendedStylesheets(state, state.stylesheets), state.unsuspend)) {
                var unsuspend = state.unsuspend;
                state.unsuspend = null;
                unsuspend();
              }
            },
            (state.imgBytes > estimatedBytesWithinLimit ? 50 : 800) + timeoutOffset
          );
          state.unsuspend = commit;
          return function() {
            state.unsuspend = null;
            clearTimeout(stylesheetTimer);
            clearTimeout(imgTimer);
          };
        } : null;
      }
      function onUnsuspend() {
        this.count--;
        if (0 === this.count && (0 === this.imgCount || !this.waitingForImages)) {
          if (this.stylesheets) insertSuspendedStylesheets(this, this.stylesheets);
          else if (this.unsuspend) {
            var unsuspend = this.unsuspend;
            this.unsuspend = null;
            unsuspend();
          }
        }
      }
      var precedencesByRoot = null;
      function insertSuspendedStylesheets(state, resources) {
        state.stylesheets = null;
        null !== state.unsuspend && (state.count++, precedencesByRoot = /* @__PURE__ */ new Map(), resources.forEach(insertStylesheetIntoRoot, state), precedencesByRoot = null, onUnsuspend.call(state));
      }
      function insertStylesheetIntoRoot(root2, resource) {
        if (!(resource.state.loading & 4)) {
          var precedences = precedencesByRoot.get(root2);
          if (precedences) var last = precedences.get(null);
          else {
            precedences = /* @__PURE__ */ new Map();
            precedencesByRoot.set(root2, precedences);
            for (var nodes = root2.querySelectorAll(
              "link[data-precedence],style[data-precedence]"
            ), i = 0; i < nodes.length; i++) {
              var node = nodes[i];
              if ("LINK" === node.nodeName || "not all" !== node.getAttribute("media"))
                precedences.set(node.dataset.precedence, node), last = node;
            }
            last && precedences.set(null, last);
          }
          nodes = resource.instance;
          node = nodes.getAttribute("data-precedence");
          i = precedences.get(node) || last;
          i === last && precedences.set(null, nodes);
          precedences.set(node, nodes);
          this.count++;
          last = onUnsuspend.bind(this);
          nodes.addEventListener("load", last);
          nodes.addEventListener("error", last);
          i ? i.parentNode.insertBefore(nodes, i.nextSibling) : (root2 = 9 === root2.nodeType ? root2.head : root2, root2.insertBefore(nodes, root2.firstChild));
          resource.state.loading |= 4;
        }
      }
      var HostTransitionContext = {
        $$typeof: REACT_CONTEXT_TYPE,
        Provider: null,
        Consumer: null,
        _currentValue: sharedNotPendingObject,
        _currentValue2: sharedNotPendingObject,
        _threadCount: 0
      };
      function FiberRootNode(containerInfo, tag, hydrate, identifierPrefix, onUncaughtError, onCaughtError, onRecoverableError, onDefaultTransitionIndicator, formState) {
        this.tag = 1;
        this.containerInfo = containerInfo;
        this.pingCache = this.current = this.pendingChildren = null;
        this.timeoutHandle = -1;
        this.callbackNode = this.next = this.pendingContext = this.context = this.cancelPendingCommit = null;
        this.callbackPriority = 0;
        this.expirationTimes = createLaneMap(-1);
        this.entangledLanes = this.shellSuspendCounter = this.errorRecoveryDisabledLanes = this.expiredLanes = this.warmLanes = this.pingedLanes = this.suspendedLanes = this.pendingLanes = 0;
        this.entanglements = createLaneMap(0);
        this.hiddenUpdates = createLaneMap(null);
        this.identifierPrefix = identifierPrefix;
        this.onUncaughtError = onUncaughtError;
        this.onCaughtError = onCaughtError;
        this.onRecoverableError = onRecoverableError;
        this.pooledCache = null;
        this.pooledCacheLanes = 0;
        this.formState = formState;
        this.incompleteTransitions = /* @__PURE__ */ new Map();
      }
      function createFiberRoot(containerInfo, tag, hydrate, initialChildren, hydrationCallbacks, isStrictMode, identifierPrefix, formState, onUncaughtError, onCaughtError, onRecoverableError, onDefaultTransitionIndicator) {
        containerInfo = new FiberRootNode(
          containerInfo,
          tag,
          hydrate,
          identifierPrefix,
          onUncaughtError,
          onCaughtError,
          onRecoverableError,
          onDefaultTransitionIndicator,
          formState
        );
        tag = 1;
        true === isStrictMode && (tag |= 24);
        isStrictMode = createFiberImplClass(3, null, null, tag);
        containerInfo.current = isStrictMode;
        isStrictMode.stateNode = containerInfo;
        tag = createCache();
        tag.refCount++;
        containerInfo.pooledCache = tag;
        tag.refCount++;
        isStrictMode.memoizedState = {
          element: initialChildren,
          isDehydrated: hydrate,
          cache: tag
        };
        initializeUpdateQueue(isStrictMode);
        return containerInfo;
      }
      function getContextForSubtree(parentComponent) {
        if (!parentComponent) return emptyContextObject;
        parentComponent = emptyContextObject;
        return parentComponent;
      }
      function updateContainerImpl(rootFiber, lane, element, container, parentComponent, callback) {
        parentComponent = getContextForSubtree(parentComponent);
        null === container.context ? container.context = parentComponent : container.pendingContext = parentComponent;
        container = createUpdate(lane);
        container.payload = { element };
        callback = void 0 === callback ? null : callback;
        null !== callback && (container.callback = callback);
        element = enqueueUpdate(rootFiber, container, lane);
        null !== element && (scheduleUpdateOnFiber(element, rootFiber, lane), entangleTransitions(element, rootFiber, lane));
      }
      function markRetryLaneImpl(fiber, retryLane) {
        fiber = fiber.memoizedState;
        if (null !== fiber && null !== fiber.dehydrated) {
          var a = fiber.retryLane;
          fiber.retryLane = 0 !== a && a < retryLane ? a : retryLane;
        }
      }
      function markRetryLaneIfNotHydrated(fiber, retryLane) {
        markRetryLaneImpl(fiber, retryLane);
        (fiber = fiber.alternate) && markRetryLaneImpl(fiber, retryLane);
      }
      function attemptContinuousHydration(fiber) {
        if (13 === fiber.tag || 31 === fiber.tag) {
          var root2 = enqueueConcurrentRenderForLane(fiber, 67108864);
          null !== root2 && scheduleUpdateOnFiber(root2, fiber, 67108864);
          markRetryLaneIfNotHydrated(fiber, 67108864);
        }
      }
      function attemptHydrationAtCurrentPriority(fiber) {
        if (13 === fiber.tag || 31 === fiber.tag) {
          var lane = requestUpdateLane();
          lane = getBumpedLaneForHydrationByLane(lane);
          var root2 = enqueueConcurrentRenderForLane(fiber, lane);
          null !== root2 && scheduleUpdateOnFiber(root2, fiber, lane);
          markRetryLaneIfNotHydrated(fiber, lane);
        }
      }
      var _enabled = true;
      function dispatchDiscreteEvent(domEventName, eventSystemFlags, container, nativeEvent) {
        var prevTransition = ReactSharedInternals.T;
        ReactSharedInternals.T = null;
        var previousPriority = ReactDOMSharedInternals.p;
        try {
          ReactDOMSharedInternals.p = 2, dispatchEvent(domEventName, eventSystemFlags, container, nativeEvent);
        } finally {
          ReactDOMSharedInternals.p = previousPriority, ReactSharedInternals.T = prevTransition;
        }
      }
      function dispatchContinuousEvent(domEventName, eventSystemFlags, container, nativeEvent) {
        var prevTransition = ReactSharedInternals.T;
        ReactSharedInternals.T = null;
        var previousPriority = ReactDOMSharedInternals.p;
        try {
          ReactDOMSharedInternals.p = 8, dispatchEvent(domEventName, eventSystemFlags, container, nativeEvent);
        } finally {
          ReactDOMSharedInternals.p = previousPriority, ReactSharedInternals.T = prevTransition;
        }
      }
      function dispatchEvent(domEventName, eventSystemFlags, targetContainer, nativeEvent) {
        if (_enabled) {
          var blockedOn = findInstanceBlockingEvent(nativeEvent);
          if (null === blockedOn)
            dispatchEventForPluginEventSystem(
              domEventName,
              eventSystemFlags,
              nativeEvent,
              return_targetInst,
              targetContainer
            ), clearIfContinuousEvent(domEventName, nativeEvent);
          else if (queueIfContinuousEvent(
            blockedOn,
            domEventName,
            eventSystemFlags,
            targetContainer,
            nativeEvent
          ))
            nativeEvent.stopPropagation();
          else if (clearIfContinuousEvent(domEventName, nativeEvent), eventSystemFlags & 4 && -1 < discreteReplayableEvents.indexOf(domEventName)) {
            for (; null !== blockedOn; ) {
              var fiber = getInstanceFromNode(blockedOn);
              if (null !== fiber)
                switch (fiber.tag) {
                  case 3:
                    fiber = fiber.stateNode;
                    if (fiber.current.memoizedState.isDehydrated) {
                      var lanes = getHighestPriorityLanes(fiber.pendingLanes);
                      if (0 !== lanes) {
                        var root2 = fiber;
                        root2.pendingLanes |= 2;
                        for (root2.entangledLanes |= 2; lanes; ) {
                          var lane = 1 << 31 - clz32(lanes);
                          root2.entanglements[1] |= lane;
                          lanes &= ~lane;
                        }
                        ensureRootIsScheduled(fiber);
                        0 === (executionContext & 6) && (workInProgressRootRenderTargetTime = now() + 500, flushSyncWorkAcrossRoots_impl(0, false));
                      }
                    }
                    break;
                  case 31:
                  case 13:
                    root2 = enqueueConcurrentRenderForLane(fiber, 2), null !== root2 && scheduleUpdateOnFiber(root2, fiber, 2), flushSyncWork$1(), markRetryLaneIfNotHydrated(fiber, 2);
                }
              fiber = findInstanceBlockingEvent(nativeEvent);
              null === fiber && dispatchEventForPluginEventSystem(
                domEventName,
                eventSystemFlags,
                nativeEvent,
                return_targetInst,
                targetContainer
              );
              if (fiber === blockedOn) break;
              blockedOn = fiber;
            }
            null !== blockedOn && nativeEvent.stopPropagation();
          } else
            dispatchEventForPluginEventSystem(
              domEventName,
              eventSystemFlags,
              nativeEvent,
              null,
              targetContainer
            );
        }
      }
      function findInstanceBlockingEvent(nativeEvent) {
        nativeEvent = getEventTarget(nativeEvent);
        return findInstanceBlockingTarget(nativeEvent);
      }
      var return_targetInst = null;
      function findInstanceBlockingTarget(targetNode) {
        return_targetInst = null;
        targetNode = getClosestInstanceFromNode(targetNode);
        if (null !== targetNode) {
          var nearestMounted = getNearestMountedFiber(targetNode);
          if (null === nearestMounted) targetNode = null;
          else {
            var tag = nearestMounted.tag;
            if (13 === tag) {
              targetNode = getSuspenseInstanceFromFiber(nearestMounted);
              if (null !== targetNode) return targetNode;
              targetNode = null;
            } else if (31 === tag) {
              targetNode = getActivityInstanceFromFiber(nearestMounted);
              if (null !== targetNode) return targetNode;
              targetNode = null;
            } else if (3 === tag) {
              if (nearestMounted.stateNode.current.memoizedState.isDehydrated)
                return 3 === nearestMounted.tag ? nearestMounted.stateNode.containerInfo : null;
              targetNode = null;
            } else nearestMounted !== targetNode && (targetNode = null);
          }
        }
        return_targetInst = targetNode;
        return null;
      }
      function getEventPriority(domEventName) {
        switch (domEventName) {
          case "beforetoggle":
          case "cancel":
          case "click":
          case "close":
          case "contextmenu":
          case "copy":
          case "cut":
          case "auxclick":
          case "dblclick":
          case "dragend":
          case "dragstart":
          case "drop":
          case "focusin":
          case "focusout":
          case "input":
          case "invalid":
          case "keydown":
          case "keypress":
          case "keyup":
          case "mousedown":
          case "mouseup":
          case "paste":
          case "pause":
          case "play":
          case "pointercancel":
          case "pointerdown":
          case "pointerup":
          case "ratechange":
          case "reset":
          case "resize":
          case "seeked":
          case "submit":
          case "toggle":
          case "touchcancel":
          case "touchend":
          case "touchstart":
          case "volumechange":
          case "change":
          case "selectionchange":
          case "textInput":
          case "compositionstart":
          case "compositionend":
          case "compositionupdate":
          case "beforeblur":
          case "afterblur":
          case "beforeinput":
          case "blur":
          case "fullscreenchange":
          case "focus":
          case "hashchange":
          case "popstate":
          case "select":
          case "selectstart":
            return 2;
          case "drag":
          case "dragenter":
          case "dragexit":
          case "dragleave":
          case "dragover":
          case "mousemove":
          case "mouseout":
          case "mouseover":
          case "pointermove":
          case "pointerout":
          case "pointerover":
          case "scroll":
          case "touchmove":
          case "wheel":
          case "mouseenter":
          case "mouseleave":
          case "pointerenter":
          case "pointerleave":
            return 8;
          case "message":
            switch (getCurrentPriorityLevel()) {
              case ImmediatePriority:
                return 2;
              case UserBlockingPriority:
                return 8;
              case NormalPriority$1:
              case LowPriority:
                return 32;
              case IdlePriority:
                return 268435456;
              default:
                return 32;
            }
          default:
            return 32;
        }
      }
      var hasScheduledReplayAttempt = false;
      var queuedFocus = null;
      var queuedDrag = null;
      var queuedMouse = null;
      var queuedPointers = /* @__PURE__ */ new Map();
      var queuedPointerCaptures = /* @__PURE__ */ new Map();
      var queuedExplicitHydrationTargets = [];
      var discreteReplayableEvents = "mousedown mouseup touchcancel touchend touchstart auxclick dblclick pointercancel pointerdown pointerup dragend dragstart drop compositionend compositionstart keydown keypress keyup input textInput copy cut paste click change contextmenu reset".split(
        " "
      );
      function clearIfContinuousEvent(domEventName, nativeEvent) {
        switch (domEventName) {
          case "focusin":
          case "focusout":
            queuedFocus = null;
            break;
          case "dragenter":
          case "dragleave":
            queuedDrag = null;
            break;
          case "mouseover":
          case "mouseout":
            queuedMouse = null;
            break;
          case "pointerover":
          case "pointerout":
            queuedPointers.delete(nativeEvent.pointerId);
            break;
          case "gotpointercapture":
          case "lostpointercapture":
            queuedPointerCaptures.delete(nativeEvent.pointerId);
        }
      }
      function accumulateOrCreateContinuousQueuedReplayableEvent(existingQueuedEvent, blockedOn, domEventName, eventSystemFlags, targetContainer, nativeEvent) {
        if (null === existingQueuedEvent || existingQueuedEvent.nativeEvent !== nativeEvent)
          return existingQueuedEvent = {
            blockedOn,
            domEventName,
            eventSystemFlags,
            nativeEvent,
            targetContainers: [targetContainer]
          }, null !== blockedOn && (blockedOn = getInstanceFromNode(blockedOn), null !== blockedOn && attemptContinuousHydration(blockedOn)), existingQueuedEvent;
        existingQueuedEvent.eventSystemFlags |= eventSystemFlags;
        blockedOn = existingQueuedEvent.targetContainers;
        null !== targetContainer && -1 === blockedOn.indexOf(targetContainer) && blockedOn.push(targetContainer);
        return existingQueuedEvent;
      }
      function queueIfContinuousEvent(blockedOn, domEventName, eventSystemFlags, targetContainer, nativeEvent) {
        switch (domEventName) {
          case "focusin":
            return queuedFocus = accumulateOrCreateContinuousQueuedReplayableEvent(
              queuedFocus,
              blockedOn,
              domEventName,
              eventSystemFlags,
              targetContainer,
              nativeEvent
            ), true;
          case "dragenter":
            return queuedDrag = accumulateOrCreateContinuousQueuedReplayableEvent(
              queuedDrag,
              blockedOn,
              domEventName,
              eventSystemFlags,
              targetContainer,
              nativeEvent
            ), true;
          case "mouseover":
            return queuedMouse = accumulateOrCreateContinuousQueuedReplayableEvent(
              queuedMouse,
              blockedOn,
              domEventName,
              eventSystemFlags,
              targetContainer,
              nativeEvent
            ), true;
          case "pointerover":
            var pointerId = nativeEvent.pointerId;
            queuedPointers.set(
              pointerId,
              accumulateOrCreateContinuousQueuedReplayableEvent(
                queuedPointers.get(pointerId) || null,
                blockedOn,
                domEventName,
                eventSystemFlags,
                targetContainer,
                nativeEvent
              )
            );
            return true;
          case "gotpointercapture":
            return pointerId = nativeEvent.pointerId, queuedPointerCaptures.set(
              pointerId,
              accumulateOrCreateContinuousQueuedReplayableEvent(
                queuedPointerCaptures.get(pointerId) || null,
                blockedOn,
                domEventName,
                eventSystemFlags,
                targetContainer,
                nativeEvent
              )
            ), true;
        }
        return false;
      }
      function attemptExplicitHydrationTarget(queuedTarget) {
        var targetInst = getClosestInstanceFromNode(queuedTarget.target);
        if (null !== targetInst) {
          var nearestMounted = getNearestMountedFiber(targetInst);
          if (null !== nearestMounted) {
            if (targetInst = nearestMounted.tag, 13 === targetInst) {
              if (targetInst = getSuspenseInstanceFromFiber(nearestMounted), null !== targetInst) {
                queuedTarget.blockedOn = targetInst;
                runWithPriority(queuedTarget.priority, function() {
                  attemptHydrationAtCurrentPriority(nearestMounted);
                });
                return;
              }
            } else if (31 === targetInst) {
              if (targetInst = getActivityInstanceFromFiber(nearestMounted), null !== targetInst) {
                queuedTarget.blockedOn = targetInst;
                runWithPriority(queuedTarget.priority, function() {
                  attemptHydrationAtCurrentPriority(nearestMounted);
                });
                return;
              }
            } else if (3 === targetInst && nearestMounted.stateNode.current.memoizedState.isDehydrated) {
              queuedTarget.blockedOn = 3 === nearestMounted.tag ? nearestMounted.stateNode.containerInfo : null;
              return;
            }
          }
        }
        queuedTarget.blockedOn = null;
      }
      function attemptReplayContinuousQueuedEvent(queuedEvent) {
        if (null !== queuedEvent.blockedOn) return false;
        for (var targetContainers = queuedEvent.targetContainers; 0 < targetContainers.length; ) {
          var nextBlockedOn = findInstanceBlockingEvent(queuedEvent.nativeEvent);
          if (null === nextBlockedOn) {
            nextBlockedOn = queuedEvent.nativeEvent;
            var nativeEventClone = new nextBlockedOn.constructor(
              nextBlockedOn.type,
              nextBlockedOn
            );
            currentReplayingEvent = nativeEventClone;
            nextBlockedOn.target.dispatchEvent(nativeEventClone);
            currentReplayingEvent = null;
          } else
            return targetContainers = getInstanceFromNode(nextBlockedOn), null !== targetContainers && attemptContinuousHydration(targetContainers), queuedEvent.blockedOn = nextBlockedOn, false;
          targetContainers.shift();
        }
        return true;
      }
      function attemptReplayContinuousQueuedEventInMap(queuedEvent, key, map) {
        attemptReplayContinuousQueuedEvent(queuedEvent) && map.delete(key);
      }
      function replayUnblockedEvents() {
        hasScheduledReplayAttempt = false;
        null !== queuedFocus && attemptReplayContinuousQueuedEvent(queuedFocus) && (queuedFocus = null);
        null !== queuedDrag && attemptReplayContinuousQueuedEvent(queuedDrag) && (queuedDrag = null);
        null !== queuedMouse && attemptReplayContinuousQueuedEvent(queuedMouse) && (queuedMouse = null);
        queuedPointers.forEach(attemptReplayContinuousQueuedEventInMap);
        queuedPointerCaptures.forEach(attemptReplayContinuousQueuedEventInMap);
      }
      function scheduleCallbackIfUnblocked(queuedEvent, unblocked) {
        queuedEvent.blockedOn === unblocked && (queuedEvent.blockedOn = null, hasScheduledReplayAttempt || (hasScheduledReplayAttempt = true, Scheduler.unstable_scheduleCallback(
          Scheduler.unstable_NormalPriority,
          replayUnblockedEvents
        )));
      }
      var lastScheduledReplayQueue = null;
      function scheduleReplayQueueIfNeeded(formReplayingQueue) {
        lastScheduledReplayQueue !== formReplayingQueue && (lastScheduledReplayQueue = formReplayingQueue, Scheduler.unstable_scheduleCallback(
          Scheduler.unstable_NormalPriority,
          function() {
            lastScheduledReplayQueue === formReplayingQueue && (lastScheduledReplayQueue = null);
            for (var i = 0; i < formReplayingQueue.length; i += 3) {
              var form = formReplayingQueue[i], submitterOrAction = formReplayingQueue[i + 1], formData = formReplayingQueue[i + 2];
              if ("function" !== typeof submitterOrAction)
                if (null === findInstanceBlockingTarget(submitterOrAction || form))
                  continue;
                else break;
              var formInst = getInstanceFromNode(form);
              null !== formInst && (formReplayingQueue.splice(i, 3), i -= 3, startHostTransition(
                formInst,
                {
                  pending: true,
                  data: formData,
                  method: form.method,
                  action: submitterOrAction
                },
                submitterOrAction,
                formData
              ));
            }
          }
        ));
      }
      function retryIfBlockedOn(unblocked) {
        function unblock(queuedEvent) {
          return scheduleCallbackIfUnblocked(queuedEvent, unblocked);
        }
        null !== queuedFocus && scheduleCallbackIfUnblocked(queuedFocus, unblocked);
        null !== queuedDrag && scheduleCallbackIfUnblocked(queuedDrag, unblocked);
        null !== queuedMouse && scheduleCallbackIfUnblocked(queuedMouse, unblocked);
        queuedPointers.forEach(unblock);
        queuedPointerCaptures.forEach(unblock);
        for (var i = 0; i < queuedExplicitHydrationTargets.length; i++) {
          var queuedTarget = queuedExplicitHydrationTargets[i];
          queuedTarget.blockedOn === unblocked && (queuedTarget.blockedOn = null);
        }
        for (; 0 < queuedExplicitHydrationTargets.length && (i = queuedExplicitHydrationTargets[0], null === i.blockedOn); )
          attemptExplicitHydrationTarget(i), null === i.blockedOn && queuedExplicitHydrationTargets.shift();
        i = (unblocked.ownerDocument || unblocked).$$reactFormReplay;
        if (null != i)
          for (queuedTarget = 0; queuedTarget < i.length; queuedTarget += 3) {
            var form = i[queuedTarget], submitterOrAction = i[queuedTarget + 1], formProps = form[internalPropsKey] || null;
            if ("function" === typeof submitterOrAction)
              formProps || scheduleReplayQueueIfNeeded(i);
            else if (formProps) {
              var action = null;
              if (submitterOrAction && submitterOrAction.hasAttribute("formAction"))
                if (form = submitterOrAction, formProps = submitterOrAction[internalPropsKey] || null)
                  action = formProps.formAction;
                else {
                  if (null !== findInstanceBlockingTarget(form)) continue;
                }
              else action = formProps.action;
              "function" === typeof action ? i[queuedTarget + 1] = action : (i.splice(queuedTarget, 3), queuedTarget -= 3);
              scheduleReplayQueueIfNeeded(i);
            }
          }
      }
      function defaultOnDefaultTransitionIndicator() {
        function handleNavigate(event) {
          event.canIntercept && "react-transition" === event.info && event.intercept({
            handler: function() {
              return new Promise(function(resolve) {
                return pendingResolve = resolve;
              });
            },
            focusReset: "manual",
            scroll: "manual"
          });
        }
        function handleNavigateComplete() {
          null !== pendingResolve && (pendingResolve(), pendingResolve = null);
          isCancelled || setTimeout(startFakeNavigation, 20);
        }
        function startFakeNavigation() {
          if (!isCancelled && !navigation.transition) {
            var currentEntry = navigation.currentEntry;
            currentEntry && null != currentEntry.url && navigation.navigate(currentEntry.url, {
              state: currentEntry.getState(),
              info: "react-transition",
              history: "replace"
            });
          }
        }
        if ("object" === typeof navigation) {
          var isCancelled = false, pendingResolve = null;
          navigation.addEventListener("navigate", handleNavigate);
          navigation.addEventListener("navigatesuccess", handleNavigateComplete);
          navigation.addEventListener("navigateerror", handleNavigateComplete);
          setTimeout(startFakeNavigation, 100);
          return function() {
            isCancelled = true;
            navigation.removeEventListener("navigate", handleNavigate);
            navigation.removeEventListener("navigatesuccess", handleNavigateComplete);
            navigation.removeEventListener("navigateerror", handleNavigateComplete);
            null !== pendingResolve && (pendingResolve(), pendingResolve = null);
          };
        }
      }
      function ReactDOMRoot(internalRoot) {
        this._internalRoot = internalRoot;
      }
      ReactDOMHydrationRoot.prototype.render = ReactDOMRoot.prototype.render = function(children) {
        var root2 = this._internalRoot;
        if (null === root2) throw Error(formatProdErrorMessage(409));
        var current = root2.current, lane = requestUpdateLane();
        updateContainerImpl(current, lane, children, root2, null, null);
      };
      ReactDOMHydrationRoot.prototype.unmount = ReactDOMRoot.prototype.unmount = function() {
        var root2 = this._internalRoot;
        if (null !== root2) {
          this._internalRoot = null;
          var container = root2.containerInfo;
          updateContainerImpl(root2.current, 2, null, root2, null, null);
          flushSyncWork$1();
          container[internalContainerInstanceKey] = null;
        }
      };
      function ReactDOMHydrationRoot(internalRoot) {
        this._internalRoot = internalRoot;
      }
      ReactDOMHydrationRoot.prototype.unstable_scheduleHydration = function(target) {
        if (target) {
          var updatePriority = resolveUpdatePriority();
          target = { blockedOn: null, target, priority: updatePriority };
          for (var i = 0; i < queuedExplicitHydrationTargets.length && 0 !== updatePriority && updatePriority < queuedExplicitHydrationTargets[i].priority; i++) ;
          queuedExplicitHydrationTargets.splice(i, 0, target);
          0 === i && attemptExplicitHydrationTarget(target);
        }
      };
      var isomorphicReactPackageVersion$jscomp$inline_1840 = React3.version;
      if ("19.2.8" !== isomorphicReactPackageVersion$jscomp$inline_1840)
        throw Error(
          formatProdErrorMessage(
            527,
            isomorphicReactPackageVersion$jscomp$inline_1840,
            "19.2.8"
          )
        );
      ReactDOMSharedInternals.findDOMNode = function(componentOrElement) {
        var fiber = componentOrElement._reactInternals;
        if (void 0 === fiber) {
          if ("function" === typeof componentOrElement.render)
            throw Error(formatProdErrorMessage(188));
          componentOrElement = Object.keys(componentOrElement).join(",");
          throw Error(formatProdErrorMessage(268, componentOrElement));
        }
        componentOrElement = findCurrentFiberUsingSlowPath(fiber);
        componentOrElement = null !== componentOrElement ? findCurrentHostFiberImpl(componentOrElement) : null;
        componentOrElement = null === componentOrElement ? null : componentOrElement.stateNode;
        return componentOrElement;
      };
      var internals$jscomp$inline_2347 = {
        bundleType: 0,
        version: "19.2.8",
        rendererPackageName: "react-dom",
        currentDispatcherRef: ReactSharedInternals,
        reconcilerVersion: "19.2.8"
      };
      if ("undefined" !== typeof __REACT_DEVTOOLS_GLOBAL_HOOK__) {
        hook$jscomp$inline_2348 = __REACT_DEVTOOLS_GLOBAL_HOOK__;
        if (!hook$jscomp$inline_2348.isDisabled && hook$jscomp$inline_2348.supportsFiber)
          try {
            rendererID = hook$jscomp$inline_2348.inject(
              internals$jscomp$inline_2347
            ), injectedHook = hook$jscomp$inline_2348;
          } catch (err) {
          }
      }
      var hook$jscomp$inline_2348;
      exports.createRoot = function(container, options2) {
        if (!isValidContainer(container)) throw Error(formatProdErrorMessage(299));
        var isStrictMode = false, identifierPrefix = "", onUncaughtError = defaultOnUncaughtError, onCaughtError = defaultOnCaughtError, onRecoverableError = defaultOnRecoverableError;
        null !== options2 && void 0 !== options2 && (true === options2.unstable_strictMode && (isStrictMode = true), void 0 !== options2.identifierPrefix && (identifierPrefix = options2.identifierPrefix), void 0 !== options2.onUncaughtError && (onUncaughtError = options2.onUncaughtError), void 0 !== options2.onCaughtError && (onCaughtError = options2.onCaughtError), void 0 !== options2.onRecoverableError && (onRecoverableError = options2.onRecoverableError));
        options2 = createFiberRoot(
          container,
          1,
          false,
          null,
          null,
          isStrictMode,
          identifierPrefix,
          null,
          onUncaughtError,
          onCaughtError,
          onRecoverableError,
          defaultOnDefaultTransitionIndicator
        );
        container[internalContainerInstanceKey] = options2.current;
        listenToAllSupportedEvents(container);
        return new ReactDOMRoot(options2);
      };
      exports.hydrateRoot = function(container, initialChildren, options2) {
        if (!isValidContainer(container)) throw Error(formatProdErrorMessage(299));
        var isStrictMode = false, identifierPrefix = "", onUncaughtError = defaultOnUncaughtError, onCaughtError = defaultOnCaughtError, onRecoverableError = defaultOnRecoverableError, formState = null;
        null !== options2 && void 0 !== options2 && (true === options2.unstable_strictMode && (isStrictMode = true), void 0 !== options2.identifierPrefix && (identifierPrefix = options2.identifierPrefix), void 0 !== options2.onUncaughtError && (onUncaughtError = options2.onUncaughtError), void 0 !== options2.onCaughtError && (onCaughtError = options2.onCaughtError), void 0 !== options2.onRecoverableError && (onRecoverableError = options2.onRecoverableError), void 0 !== options2.formState && (formState = options2.formState));
        initialChildren = createFiberRoot(
          container,
          1,
          true,
          initialChildren,
          null != options2 ? options2 : null,
          isStrictMode,
          identifierPrefix,
          formState,
          onUncaughtError,
          onCaughtError,
          onRecoverableError,
          defaultOnDefaultTransitionIndicator
        );
        initialChildren.context = getContextForSubtree(null);
        options2 = initialChildren.current;
        isStrictMode = requestUpdateLane();
        isStrictMode = getBumpedLaneForHydrationByLane(isStrictMode);
        identifierPrefix = createUpdate(isStrictMode);
        identifierPrefix.callback = null;
        enqueueUpdate(options2, identifierPrefix, isStrictMode);
        options2 = isStrictMode;
        initialChildren.current.lanes = options2;
        markRootUpdated$1(initialChildren, options2);
        ensureRootIsScheduled(initialChildren);
        container[internalContainerInstanceKey] = initialChildren.current;
        listenToAllSupportedEvents(container);
        return new ReactDOMHydrationRoot(initialChildren);
      };
      exports.version = "19.2.8";
    }
  });

  // node_modules/react-dom/client.js
  var require_client = __commonJS({
    "node_modules/react-dom/client.js"(exports, module) {
      "use strict";
      function checkDCE() {
        if (typeof __REACT_DEVTOOLS_GLOBAL_HOOK__ === "undefined" || typeof __REACT_DEVTOOLS_GLOBAL_HOOK__.checkDCE !== "function") {
          return;
        }
        if (false) {
          throw new Error("^_^");
        }
        try {
          __REACT_DEVTOOLS_GLOBAL_HOOK__.checkDCE(checkDCE);
        } catch (err) {
          console.error(err);
        }
      }
      if (true) {
        checkDCE();
        module.exports = require_react_dom_client_production();
      } else {
        module.exports = null;
      }
    }
  });

  // node_modules/react/cjs/react-jsx-runtime.production.js
  var require_react_jsx_runtime_production = __commonJS({
    "node_modules/react/cjs/react-jsx-runtime.production.js"(exports) {
      "use strict";
      var REACT_ELEMENT_TYPE = Symbol.for("react.transitional.element");
      var REACT_FRAGMENT_TYPE = Symbol.for("react.fragment");
      function jsxProd(type, config, maybeKey) {
        var key = null;
        void 0 !== maybeKey && (key = "" + maybeKey);
        void 0 !== config.key && (key = "" + config.key);
        if ("key" in config) {
          maybeKey = {};
          for (var propName in config)
            "key" !== propName && (maybeKey[propName] = config[propName]);
        } else maybeKey = config;
        config = maybeKey.ref;
        return {
          $$typeof: REACT_ELEMENT_TYPE,
          type,
          key,
          ref: void 0 !== config ? config : null,
          props: maybeKey
        };
      }
      exports.Fragment = REACT_FRAGMENT_TYPE;
      exports.jsx = jsxProd;
      exports.jsxs = jsxProd;
    }
  });

  // node_modules/react/jsx-runtime.js
  var require_jsx_runtime = __commonJS({
    "node_modules/react/jsx-runtime.js"(exports, module) {
      "use strict";
      if (true) {
        module.exports = require_react_jsx_runtime_production();
      } else {
        module.exports = null;
      }
    }
  });

  // src/react/index.tsx
  var import_client = __toESM(require_client(), 1);

  // src/react/App.tsx
  var import_react2 = __toESM(require_react(), 1);

  // src/react/Studio.tsx
  var import_react = __toESM(require_react(), 1);
  var import_jsx_runtime = __toESM(require_jsx_runtime(), 1);
  var blankForm = () => ({
    id: "",
    name: "",
    targetProfileId: "",
    sourceFileName: "",
    model: "",
    modelProvider: "",
    reasoning: "",
    developerInstructions: "",
    baseInstructions: "",
    approvalPolicy: "",
    sandbox: "",
    serviceTier: "",
    memoryUse: "inherit",
    memoryGenerate: "inherit",
    configText: "{}"
  });
  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }
  function rawProfileId(profile) {
    return profile.id.startsWith("studio:") ? profile.id.slice("studio:".length) : profile.id;
  }
  function profileToForm(profile) {
    const config = clone(profile.config || {});
    const reasoning = String(config.model_reasoning_effort || "");
    delete config.model_reasoning_effort;
    const targetProfileId = profile.source === "file" || profile.source === "studio-override" ? profile.id : "";
    return {
      id: rawProfileId(profile),
      name: profile.name || rawProfileId(profile),
      targetProfileId,
      sourceFileName: profile.sourceFileName || (targetProfileId ? `${targetProfileId}.config.toml` : ""),
      model: profile.model || "",
      modelProvider: profile.modelProvider || "",
      reasoning,
      developerInstructions: profile.developerInstructions || "",
      baseInstructions: profile.baseInstructions || "",
      approvalPolicy: profile.approvalPolicy || "",
      sandbox: profile.sandbox || "",
      serviceTier: profile.serviceTier || "",
      memoryUse: profile.memoryPolicy?.use || "inherit",
      memoryGenerate: profile.memoryPolicy?.generate || "inherit",
      configText: JSON.stringify(config, null, 2)
    };
  }
  function likelySecret(text) {
    return /\bsk-[A-Za-z0-9_-]{16,}\b|\b(?:api[_-]?key|token|password|secret|authorization|bearer|credential)\s*[:=]/i.test(text);
  }
  function tomlString(value) {
    return JSON.stringify(String(value ?? ""));
  }
  function tomlKey(value) {
    const key = String(value ?? "");
    return /^[A-Za-z0-9_-]+$/.test(key) ? key : tomlString(key);
  }
  function tomlValue(value) {
    if (typeof value === "string") return tomlString(value);
    if (typeof value === "boolean") return value ? "true" : "false";
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
    if (Array.isArray(value)) return `[${value.map(tomlValue).join(", ")}]`;
    if (value && typeof value === "object") return `{ ${Object.entries(value).map(([key, item]) => `${tomlKey(key)} = ${tomlValue(item)}`).join(", ")} }`;
    throw new Error(`无法导出 TOML 值：${String(value)}`);
  }
  function appendTomlConfig(lines, value, path = []) {
    const entries = Object.entries(value || {});
    const scalars = entries.filter(([, item]) => !(item && typeof item === "object" && !Array.isArray(item)));
    const tables = entries.filter(([, item]) => item && typeof item === "object" && !Array.isArray(item));
    if (path.length) lines.push("", `[${path.map(tomlKey).join(".")}]`);
    for (const [key, item] of scalars) lines.push(`${tomlKey(key)} = ${tomlValue(item)}`);
    for (const [key, item] of tables) appendTomlConfig(lines, item, [...path, key]);
  }
  function profileToml(form, inputConfig) {
    const lines = ["# Generated by Codex++ Environment Injector React Studio", `# Source: ${form.sourceFileName || "local environment"}`, ""];
    const scalar = [
      ["model", form.model],
      ["model_provider", form.modelProvider],
      ["model_reasoning_effort", form.reasoning],
      ["approval_policy", form.approvalPolicy],
      ["sandbox_mode", form.sandbox],
      ["service_tier", form.serviceTier],
      ["developer_instructions", form.developerInstructions],
      ["base_instructions", form.baseInstructions]
    ];
    for (const [key, value] of scalar) if (value !== "") lines.push(`${key} = ${tomlValue(value)}`);
    const config = clone(inputConfig);
    delete config.model_reasoning_effort;
    const memories = {};
    if (form.memoryUse !== "inherit") memories.use_memories = form.memoryUse === "on";
    if (form.memoryGenerate !== "inherit") memories.generate_memories = form.memoryGenerate === "on";
    if (Object.keys(memories).length) config.memories = memories;
    appendTomlConfig(lines, config);
    lines.push("");
    return lines.join("\n");
  }
  function Field({ label, children, full = false }) {
    return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", { className: `ei-studio-field${full ? " ei-studio-field-full" : ""}`, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: label }),
      children
    ] });
  }
  function TextInput(props) {
    return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", { className: "ei-studio-input", ...props });
  }
  function SelectInput(props) {
    return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("select", { className: "ei-studio-input", ...props });
  }
  function StudioDialog({ api: api2, store, core }) {
    const profiles = (0, import_react.useMemo)(() => core.profiles.filter((profile) => profile.id !== "base"), [core.profiles]);
    const [selectedId, setSelectedId] = (0, import_react.useState)("");
    const [selectedStorageKey, setSelectedStorageKey] = (0, import_react.useState)("");
    const [form, setForm] = (0, import_react.useState)(blankForm);
    const [useNext, setUseNext] = (0, import_react.useState)(true);
    const [editorTab, setEditorTab] = (0, import_react.useState)("basic");
    const [message, setMessage] = (0, import_react.useState)("可新建环境，也可选择文件环境并保存为本地覆盖。");
    const [kind, setKind] = (0, import_react.useState)("info");
    const update = (key, value) => setForm((current) => ({ ...current, [key]: value }));
    const selectProfile = (profile) => {
      const rawId = rawProfileId(profile);
      const target = profile.source === "file" || profile.source === "studio-override" ? profile.id : "";
      setSelectedId(profile.id);
      setSelectedStorageKey(target ? `override:${target}` : rawId);
      setForm(profileToForm(profile));
      setEditorTab("basic");
      setKind("info");
      setMessage(target ? `文件环境 ${profile.name} 将保存为本地覆盖，原文件不变。` : `正在编辑本地环境 ${profile.name}。`);
    };
    const createNew = () => {
      setSelectedId("");
      setSelectedStorageKey("");
      setForm(blankForm());
      setEditorTab("basic");
      setKind("info");
      setMessage("创建新的本地环境。");
    };
    const validate = () => {
      if (!/^[A-Za-z0-9_-]+$/.test(form.id)) return "环境 ID 只能包含英文、数字、下划线和减号";
      if (form.developerInstructions.length > 4e4 || form.baseInstructions.length > 4e4) return "提示词不能超过 40000 个字符";
      try {
        JSON.parse(form.configText || "{}");
      } catch {
        return "Additional Config JSON 格式无效";
      }
      if (![form.model, form.modelProvider, form.developerInstructions, form.baseInstructions, form.approvalPolicy, form.sandbox, form.serviceTier, form.reasoning].some(Boolean) && form.memoryUse === "inherit" && form.memoryGenerate === "inherit" && form.configText.trim() === "{}") return "请至少提供一项环境设置";
      return "";
    };
    const save = () => {
      const error = validate();
      if (error) {
        setKind("error");
        setMessage(error);
        return;
      }
      let config;
      try {
        config = JSON.parse(form.configText || "{}");
      } catch {
        return;
      }
      if (form.reasoning) config.model_reasoning_effort = form.reasoning;
      if ((likelySecret(form.developerInstructions) || likelySecret(form.baseInstructions) || likelySecret(form.configText)) && !window.confirm("环境内容可能包含密钥或认证字段，仍要保存到页面 localStorage 吗？")) return;
      const next = clone(core.environmentStore);
      const storageKey = form.targetProfileId ? `override:${form.targetProfileId}` : form.id;
      if (selectedStorageKey && selectedStorageKey !== storageKey) delete next.profiles[selectedStorageKey];
      const previous = next.profiles[storageKey];
      next.profiles[storageKey] = {
        id: form.id,
        name: form.name.trim() || form.id,
        ...form.targetProfileId ? { targetProfileId: form.targetProfileId, origin: "file-override" } : { origin: "local" },
        sourceFileName: form.sourceFileName,
        model: form.model.trim(),
        modelProvider: form.modelProvider.trim(),
        developerInstructions: form.developerInstructions,
        baseInstructions: form.baseInstructions,
        approvalPolicy: form.approvalPolicy,
        sandbox: form.sandbox,
        serviceTier: form.serviceTier.trim(),
        memoryPolicy: { use: form.memoryUse, generate: form.memoryGenerate },
        config,
        createdAt: previous?.createdAt || Date.now(),
        updatedAt: Date.now()
      };
      api2.replaceEnvironmentStore(next);
      const environmentId = form.targetProfileId || `studio:${form.id}`;
      if (useNext) api2.setNext(environmentId);
      setSelectedId(environmentId);
      setSelectedStorageKey(storageKey);
      setKind("success");
      setMessage(form.targetProfileId ? `已保存 ${form.targetProfileId} 的本地覆盖。` : `已保存环境 ${form.name || form.id}。`);
    };
    const remove = () => {
      if (!selectedStorageKey || !core.environmentStore.profiles[selectedStorageKey]) return;
      const isOverride = Boolean(form.targetProfileId);
      if (!window.confirm(isOverride ? `恢复文件环境“${form.targetProfileId}”并删除本地覆盖？` : `删除环境“${form.name || form.id}”？`)) return;
      const next = clone(core.environmentStore);
      delete next.profiles[selectedStorageKey];
      api2.replaceEnvironmentStore(next);
      createNew();
      setKind("success");
      setMessage(isOverride ? `已恢复文件环境 ${form.targetProfileId}。` : "环境已删除。");
    };
    const exportToml = () => {
      let config = {};
      try {
        config = JSON.parse(form.configText || "{}");
      } catch {
      }
      const blob = new Blob([profileToml(form, config)], { type: "text/plain;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${form.id || "environment"}.config.toml`;
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 1e3);
    };
    const loadAgents = async (file) => {
      if (!file) return;
      if (file.size > 256 * 1024) {
        setKind("error");
        setMessage("AGENTS.md 最大允许 256 KiB");
        return;
      }
      const text = await file.text();
      update("developerInstructions", text.slice(0, 4e4));
      if (!form.name) update("name", file.name.replace(/\.md$/i, ""));
      if (!form.id) update("id", file.name.replace(/\.md$/i, "").toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-|-$/g, ""));
      setKind("success");
      setMessage(`已载入 ${file.name}`);
    };
    return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "ei-backdrop ei-studio-backdrop", onMouseDown: (event) => {
      if (event.target === event.currentTarget) store.closeStudio();
    }, children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", { className: "ei-studio-dialog", role: "dialog", "aria-modal": "true", "aria-label": "环境注入器编辑器", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("header", { className: "ei-header", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "ei-header-copy", children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", { children: "环境注入器" }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { children: "React Studio · 环境、提示词、Memories 与权限" })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "ei-header-actions", children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { className: "ei-button", type: "button", onClick: () => {
            store.closeStudio();
            store.openMode("tutorial");
          }, children: "使用教程" }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { className: "ei-icon-button", type: "button", onClick: () => store.closeStudio(), "aria-label": "关闭", children: "×" })
        ] })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "ei-studio-layout", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("aside", { className: "ei-studio-sidebar", children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ButtonLike, { label: "+ 新建环境", onClick: createNew, primary: true }),
          profiles.map((profile) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", { className: "ei-studio-profile", "data-active": selectedId === profile.id, type: "button", onClick: () => selectProfile(profile), children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("strong", { children: profile.name }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("small", { children: profileDetail(profile) })
          ] }, profile.id))
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("main", { className: "ei-studio-editor", children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "ei-studio-editor-head", children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("strong", { children: form.name || form.id || "新环境" }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: form.targetProfileId ? "文件覆盖" : selectedStorageKey ? "本地环境" : "未保存" })
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("nav", { className: "ei-studio-tabs", "aria-label": "环境编辑区域", children: [["basic", "基础"], ["instructions", "提示词"], ["runtime", "运行策略"], ["advanced", "高级"]].map(([id, label]) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", "aria-selected": editorTab === id, onClick: () => setEditorTab(id), children: label }, id)) })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "ei-studio-content", children: [
            editorTab === "basic" ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "ei-studio-grid ei-studio-grid-compact", children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, { label: "环境 ID", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(TextInput, { value: form.id, disabled: Boolean(form.targetProfileId), onChange: (event) => update("id", event.target.value) }) }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, { label: "名称", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(TextInput, { value: form.name, onChange: (event) => update("name", event.target.value) }) }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, { label: "模型", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(TextInput, { value: form.model, onChange: (event) => update("model", event.target.value) }) }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, { label: "Provider", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(TextInput, { value: form.modelProvider, onChange: (event) => update("modelProvider", event.target.value) }) })
            ] }) : null,
            editorTab === "instructions" ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "ei-studio-section", children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", { className: "ei-studio-import", onDragOver: (event) => event.preventDefault(), onDrop: (event) => {
                event.preventDefault();
                void loadAgents(event.dataTransfer.files?.[0]);
              }, children: [
                "导入 AGENTS.md",
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", { type: "file", accept: ".md,text/markdown,text/plain", onChange: (event) => void loadAgents(event.target.files?.[0]) })
              ] }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, { label: "Developer Instructions", full: true, children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("textarea", { className: "ei-textarea ei-studio-textarea", value: form.developerInstructions, onChange: (event) => update("developerInstructions", event.target.value) }) }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, { label: "Base Instructions", full: true, children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("textarea", { className: "ei-textarea ei-studio-textarea", value: form.baseInstructions, onChange: (event) => update("baseInstructions", event.target.value) }) })
            ] }) : null,
            editorTab === "runtime" ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "ei-studio-grid ei-studio-grid-compact", children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, { label: "推理强度", children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(SelectInput, { value: form.reasoning, onChange: (event) => update("reasoning", event.target.value), children: [
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", { value: "", children: "继承" }),
                ["minimal", "low", "medium", "high", "xhigh"].map((value) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", { children: value }, value))
              ] }) }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, { label: "Service Tier", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(TextInput, { value: form.serviceTier, onChange: (event) => update("serviceTier", event.target.value) }) }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, { label: "审批策略", children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(SelectInput, { value: form.approvalPolicy, onChange: (event) => update("approvalPolicy", event.target.value), children: [
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", { value: "", children: "继承" }),
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", { value: "untrusted", children: "untrusted" }),
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", { value: "on-request", children: "on-request" }),
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", { value: "never", children: "never" })
              ] }) }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, { label: "沙箱", children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(SelectInput, { value: form.sandbox, onChange: (event) => update("sandbox", event.target.value), children: [
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", { value: "", children: "继承" }),
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", { value: "read-only", children: "read-only" }),
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", { value: "workspace-write", children: "workspace-write" }),
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", { value: "danger-full-access", children: "danger-full-access" })
              ] }) }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, { label: "Memory 读取", children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(SelectInput, { value: form.memoryUse, onChange: (event) => update("memoryUse", event.target.value), children: [
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", { value: "inherit", children: "继承" }),
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", { value: "on", children: "开启" }),
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", { value: "off", children: "关闭" })
              ] }) }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, { label: "Memory 生成", children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(SelectInput, { value: form.memoryGenerate, onChange: (event) => update("memoryGenerate", event.target.value), children: [
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", { value: "inherit", children: "继承" }),
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", { value: "on", children: "开启" }),
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", { value: "off", children: "关闭" })
              ] }) })
            ] }) : null,
            editorTab === "advanced" ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "ei-studio-section", children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "ei-help", children: "仅填写经过检查的附加 JSON；模型、提示词和运行策略请使用前面的表单。" }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, { label: "Additional Config JSON", full: true, children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("textarea", { className: "ei-textarea ei-studio-code", value: form.configText, onChange: (event) => update("configText", event.target.value) }) })
            ] }) : null
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("footer", { className: "ei-studio-savebar", children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", { className: "ei-toggle", children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", { type: "checkbox", checked: useNext, onChange: (event) => setUseNext(event.target.checked) }),
              "设为下个对话"
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "ei-studio-spacer" }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ButtonLike, { label: "导出", onClick: exportToml }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ButtonLike, { label: form.targetProfileId ? "恢复" : "删除", onClick: remove, disabled: !selectedStorageKey || !core.environmentStore.profiles[selectedStorageKey] }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ButtonLike, { label: form.targetProfileId ? "保存覆盖" : "保存", onClick: save, primary: true })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "ei-status ei-studio-status", "data-kind": kind, children: message })
        ] })
      ] })
    ] }) });
  }
  function ButtonLike({ label, onClick, primary = false, disabled = false }) {
    return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { className: `ei-button${primary ? " ei-button-primary" : ""}`, type: "button", onClick, disabled, children: label });
  }
  function profileDetail(profile) {
    return [profile.source === "file" ? "文件" : profile.source === "studio-override" ? "本地覆盖" : "本地", profile.model, profile.modelProvider].filter(Boolean).join(" · ");
  }

  // src/react/App.tsx
  var import_jsx_runtime2 = __toESM(require_jsx_runtime(), 1);
  function useUi(store) {
    return (0, import_react2.useSyncExternalStore)(store.subscribe, store.getSnapshot, store.getSnapshot);
  }
  var UiErrorBoundary = class extends import_react2.Component {
    state = { failed: false };
    static getDerivedStateFromError() {
      return { failed: true };
    }
    componentDidCatch(error, info) {
      this.props.onError(`${error.message}
${info.componentStack || ""}`);
    }
    render() {
      if (this.state.failed) {
        return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "ei-card", children: "React UI 加载失败；headless 注入核心仍在运行。重新加载 Userscript 可恢复旧版备用 UI。" });
      }
      return this.props.children;
    }
  };
  function profileDetail2(profile) {
    const parts = [];
    if (profile.id === "base") parts.push("全局基础配置");
    else if (profile.source === "file") parts.push("文件环境");
    else if (profile.source === "studio-override") parts.push("本地覆盖");
    else parts.push("本地环境");
    if (profile.model) parts.push(profile.model);
    if (profile.modelProvider) parts.push(profile.modelProvider);
    return parts.join(" · ");
  }
  function pillLabel(snapshot) {
    const status = snapshot.status;
    if (status.currentThreadId && status.currentProfileId) {
      const profile = snapshot.profiles.find((item) => item.id === status.currentProfileId);
      return `当前环境: ${profile?.name || status.currentProfileId}`;
    }
    if (status.pendingProfileId) {
      const profile = snapshot.profiles.find((item) => item.id === status.pendingProfileId);
      return `下次环境: ${profile?.name || status.pendingProfileId}`;
    }
    return "环境: Base";
  }
  function Button({ children, primary = false, ...props }) {
    return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("button", { className: `ei-button${primary ? " ei-button-primary" : ""}`, type: "button", ...props, children });
  }
  function ScopeHeader({ scope, title, detail }) {
    return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("header", { className: "ei-scope-header", children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { "data-scope": scope, children: scope }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("h3", { children: title }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { children: detail })
      ] })
    ] });
  }
  function MetaGrid({ rows, className = "" }) {
    return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: `ei-meta${className ? ` ${className}` : ""}`, children: rows.map(([label, value]) => /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "ei-meta-row", children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { children: label }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("code", { title: String(value || ""), children: String(value || "继承 / 未设置") })
    ] }, label)) });
  }
  function Disclosure({ title, text, empty = "未设置", defaultOpen = false, children, meta }) {
    const [open, setOpen] = (0, import_react2.useState)(defaultOpen);
    const lines = text ? Math.max(1, text.split("\n").length) : 0;
    const resolvedMeta = meta || (children ? "查看" : lines ? `${lines} 行` : "未设置");
    return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("section", { className: "ei-disclosure", "data-open": open, children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("button", { className: "ei-disclosure-trigger", type: "button", "aria-expanded": open, onClick: () => setOpen((value) => !value), children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { children: title }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("span", { className: "ei-disclosure-end", children: [
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "ei-disclosure-meta", children: resolvedMeta }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "ei-chevron", "aria-hidden": true, children: "⌄" })
        ] })
      ] }),
      open ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "ei-disclosure-body", children: children ?? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("pre", { className: "ei-pre", "data-empty": !text, children: text || empty }) }) : null
    ] });
  }
  function SelectEnvironmentView({ store, core, title }) {
    return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_jsx_runtime2.Fragment, { children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(ScopeHeader, { scope: "会话级", title: title === "选择环境" ? "下个对话" : title, detail: "选择只应用到即将创建的会话，不修改全局配置。" }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "ei-profile-list", children: core.profiles.map((profile) => {
        const selected = core.status.pendingProfileId === profile.id;
        return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("button", { className: "ei-profile", "data-profile-id": profile.id, "data-selected": selected, "aria-pressed": selected, type: "button", onClick: () => store.selectProfile(profile.id), children: [
          /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("span", { className: "ei-profile-copy", children: [
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("strong", { children: profile.name }),
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("small", { children: profileDetail2(profile) })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "ei-check", children: selected ? "✓" : "" })
        ] }, profile.id);
      }) }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("label", { className: "ei-scope-toggle", children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("input", { type: "checkbox", checked: core.status.promptOnNewThread !== false, onChange: (event) => store.setPromptOnNewThread(event.target.checked) }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { children: "每次新对话都询问" })
      ] })
    ] });
  }
  function bindingStatus(core) {
    const status = core.status;
    if (!status.currentThreadId) return { kind: "draft", label: "新对话草稿", detail: "尚未创建 thread；选择环境后发送第一条消息即可验证。" };
    const binding = status.currentProfileBinding;
    if (!binding) return { kind: "base", label: "未由选择器管理", detail: "该会话没有环境绑定记录，按 Base / Codex 全局配置运行。" };
    if (binding.applied === true) return { kind: "confirmed", label: "已确认注入", detail: "环境已通过真实 app-server 生命周期通道确认。" };
    if (binding.applied === false) return { kind: "unconfirmed", label: "已选择 · 未确认", detail: "已观察到会话，但尚无 acknowledged proof。" };
    return { kind: "unknown", label: "旧版绑定", detail: "历史记录没有保存明确注入状态。" };
  }
  function InspectorTabs({ items }) {
    const initial = items.find((item) => item.text)?.id || items[0]?.id || "";
    const [active, setActive] = (0, import_react2.useState)(initial);
    const selected = items.find((item) => item.id === active) || items[0];
    return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("section", { className: "ei-inspector", children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "ei-inspector-tabs", children: items.map((item) => /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("button", { type: "button", "aria-selected": selected?.id === item.id, onClick: () => setActive(item.id), children: [
        item.label,
        item.text ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { children: Math.max(1, item.text.split("\n").length) }) : null
      ] }, item.id)) }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("pre", { className: "ei-pre", "data-empty": !selected?.text, children: selected?.text || selected?.empty || "未设置" })
    ] });
  }
  function CurrentSessionView({ core }) {
    const profile = core.currentProfile || core.profiles[0];
    const status = bindingStatus(core);
    const proof = core.status.currentProof;
    const reasoning = String(profile?.config?.model_reasoning_effort || "");
    const runtimeSummary = [profile?.model, profile?.modelProvider, reasoning, profile?.sandbox].filter(Boolean).join(" · ") || "使用 Codex 全局配置";
    const configText = profile?.config && Object.keys(profile.config).length ? JSON.stringify(profile.config, null, 2) : "";
    const proofText = proof ? JSON.stringify(proof, null, 2) : "";
    return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_jsx_runtime2.Fragment, { children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(ScopeHeader, { scope: "会话级", title: "当前对话", detail: "展示这个 thread 已应用的环境、运行策略和注入证明。" }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("section", { className: "ei-current-summary", children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "ei-current-title", children: [
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "ei-status-dot", "data-kind": status.kind }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("strong", { children: profile?.name || "Base" }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "ei-current-status", children: status.label })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { children: runtimeSummary }),
        core.status.currentThreadId ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("code", { className: "ei-thread", children: core.status.currentThreadId }) : /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "ei-help", children: status.detail })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(Disclosure, { title: "运行详情", meta: "策略与证明", children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(MetaGrid, { className: "ei-meta-flat", rows: [
        ["环境 ID", profile?.id || "base"],
        ["审批", profile?.approvalPolicy || "继承"],
        ["Service tier", profile?.serviceTier || "继承"],
        ["Memory", `${profile?.memoryPolicy?.use || "继承"} / ${profile?.memoryPolicy?.generate || "继承"}`],
        ["Proof", proof?.status || "未绑定"],
        ["Transport", proof?.transport || core.status.currentProfileBinding?.source || "Base"]
      ] }) }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(InspectorTabs, { items: [
        { id: "developer", label: "Developer", text: profile?.developerInstructions || "", empty: "未设置 Developer Instructions" },
        { id: "base", label: "Base", text: profile?.baseInstructions || "", empty: "未设置 Base Instructions" },
        { id: "config", label: "Config", text: configText, empty: "空配置" },
        { id: "proof", label: "Proof", text: proofText, empty: "当前会话没有注入证明" }
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { className: "ei-note", children: "仅展示环境计划与确认记录；Codex 最终合成提示词属于内部运行态。" })
    ] });
  }
  function MemoryView({ api: api2, store, core }) {
    const memory = core.bridgeMemory || core.environmentSnapshot.memory || {};
    const settings = core.environmentSnapshot.memory?.settings || {};
    const correction = memory.correction || {};
    const persistedDraft = core.environmentStore.ui.memoryCorrectionDraft;
    const [draft, setDraft] = (0, import_react2.useState)(String(persistedDraft ?? correction.content ?? ""));
    const [preview, setPreview] = (0, import_react2.useState)(null);
    const [message, setMessage] = (0, import_react2.useState)("");
    const writable = core.status.capabilities?.diskWrite === true;
    (0, import_react2.useEffect)(() => setDraft(String(core.environmentStore.ui.memoryCorrectionDraft ?? correction.content ?? "")), [correction.hash, core.environmentStore.revision]);
    const runPreview = async () => {
      const result = await api2.bridgeCall("/environment-injector/memory/preview-correction", {
        content: draft,
        ...typeof correction.hash === "string" ? { expectedHash: correction.hash } : {}
      });
      setPreview(result.status === "ok" ? result : null);
      setMessage(result.status === "ok" ? `预览完成：+${result.diff?.addedLines || 0} / -${result.diff?.removedLines || 0} 行` : result.message || "预览失败");
    };
    const commit = async () => {
      if (!preview) return;
      const expectedHash = preview.before?.hash;
      const result = await api2.bridgeCall("/environment-injector/memory/commit-correction", {
        content: draft,
        ...typeof expectedHash === "string" ? { expectedHash } : {}
      });
      if (result.status !== "ok") {
        setPreview(null);
        setMessage(result.status === "conflict" ? "源文件已变化，请重新预览。" : result.message || "写入失败");
        return;
      }
      api2.updateUiPreferences({ memoryCorrectionDraft: void 0 });
      await api2.refreshBridge();
      store.showToast(`Memory 修正 Note 已写入；备份：${result.backup || "新文件"}`, "success");
      setPreview(null);
      setMessage("写入完成");
    };
    return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_jsx_runtime2.Fragment, { children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(ScopeHeader, { scope: "全局", title: "Memories", detail: "全局记忆存储；单个环境可覆盖是否读取或生成。" }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(MetaGrid, { rows: [
        ["总开关", settings.enabled === true ? "开启" : "关闭"],
        ["读取记忆", String(settings.use_memories ?? "继承")],
        ["生成记忆", String(settings.generate_memories ?? "继承")],
        ["写入能力", writable ? "Bridge 可写" : "只读 / 草案"],
        ["文件", Array.isArray(memory.files) ? `${memory.files.length} 个` : "未知"]
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(Disclosure, { title: "Memory Summary", text: memory.summary?.content, defaultOpen: true }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(Disclosure, { title: "Durable MEMORY.md", text: memory.durable?.content }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("section", { className: "ei-card", children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("strong", { children: "记忆修正草案" }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { className: "ei-help", children: "只写稳定事实和纠正项；不会直接改写生成的 MEMORY.md。" }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("textarea", { className: "ei-textarea", value: draft, onChange: (event) => {
          setDraft(event.target.value);
          setPreview(null);
        } }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "ei-actions", children: [
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(Button, { onClick: () => {
            api2.updateUiPreferences({ memoryCorrectionDraft: draft });
            store.showToast("草案已保存");
          }, children: "保存草案" }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(Button, { disabled: !writable, onClick: () => void runPreview(), children: "预览写入" }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(Button, { primary: true, disabled: !preview, onClick: () => void commit(), children: "确认写入" })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { className: "ei-status", "data-kind": preview ? "success" : message ? "error" : void 0, children: message })
      ] })
    ] });
  }
  function AgentsView({ api: api2, store, core }) {
    const agents = core.bridgeAgents || core.environmentSnapshot.globalAgents || {};
    const persistedDraft = core.environmentStore.ui.agentsDraft;
    const [draft, setDraft] = (0, import_react2.useState)(String(persistedDraft ?? agents.content ?? ""));
    const [preview, setPreview] = (0, import_react2.useState)(null);
    const [message, setMessage] = (0, import_react2.useState)("");
    const writable = core.status.capabilities?.diskWrite === true;
    (0, import_react2.useEffect)(() => setDraft(String(core.environmentStore.ui.agentsDraft ?? agents.content ?? "")), [agents.hash, core.environmentStore.revision]);
    const runPreview = async () => {
      const result = await api2.bridgeCall("/environment-injector/agents/preview", {
        content: draft,
        ...typeof agents.hash === "string" ? { expectedHash: agents.hash } : {}
      });
      setPreview(result.status === "ok" ? result : null);
      setMessage(result.status === "ok" ? `预览完成：+${result.diff?.addedLines || 0} / -${result.diff?.removedLines || 0} 行` : result.message || "预览失败");
    };
    const commit = async () => {
      if (!preview) return;
      const expectedHash = preview.before?.hash;
      const result = await api2.bridgeCall("/environment-injector/agents/commit", {
        content: draft,
        ...typeof expectedHash === "string" ? { expectedHash } : {}
      });
      if (result.status !== "ok") {
        setPreview(null);
        setMessage(result.status === "conflict" ? "AGENTS.md 已变化，请重新预览。" : result.message || "写入失败");
        return;
      }
      api2.updateUiPreferences({ agentsDraft: void 0 });
      await api2.refreshBridge();
      store.showToast(`AGENTS.md 已写入；备份：${result.backup || "新文件"}`, "success");
      setPreview(null);
      setMessage("写入完成");
    };
    return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_jsx_runtime2.Fragment, { children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(ScopeHeader, { scope: "全局", title: "AGENTS.md", detail: "所有项目共享的稳定规则；项目目录中的 AGENTS.md 优先级更高。" }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(MetaGrid, { rows: [
        ["状态", agents.exists ? "已存在" : "未创建"],
        ["大小", Number.isFinite(agents.size) ? `${agents.size} bytes` : "—"],
        ["Hash", agents.hash || "—"],
        ["写入能力", writable ? "Bridge 可写" : "草案 / 导出"]
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("section", { className: "ei-card", children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("strong", { children: "AGENTS.md 草案" }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("textarea", { className: "ei-textarea ei-textarea-tall", value: draft, onChange: (event) => {
          setDraft(event.target.value);
          setPreview(null);
        } }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "ei-actions", children: [
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(Button, { onClick: () => {
            api2.updateUiPreferences({ agentsDraft: draft });
            store.showToast("AGENTS.md 草案已保存");
          }, children: "保存草案" }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(Button, { onClick: () => navigator.clipboard.writeText(draft).then(() => store.showToast("已复制")), children: "复制" }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(Button, { disabled: !writable, onClick: () => void runPreview(), children: "预览写入" }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(Button, { primary: true, disabled: !preview, onClick: () => void commit(), children: "确认写入" })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { className: "ei-status", "data-kind": preview ? "success" : message ? "error" : void 0, children: message })
      ] })
    ] });
  }
  var tutorialSections = [
    ["如何创建或修改环境", ["打开左侧“环境注入器”编辑文件环境或本地环境。", "文件环境保存为本地覆盖，原文件不变。", "模型、Provider、提示词、权限和 Memory 策略均按环境保存。"]],
    ["如何判断注入是否生效", ["当前会话必须同时有 Thread ID、applied=true 和 acknowledged proof。", "prewarm 或 app-server request client transport 代表真实生命周期通道。", "observed-unconfirmed 不能当作成功。"]],
    ["Memories 应该怎么用", ["Memories 保存稳定事实，不保存环境角色。", "隔离环境时将读取和生成设为 off。", "修正只写 ad-hoc Note，不直接覆盖生成记忆。"]],
    ["AGENTS.md、预览和恢复", ["稳定工作规则放全局 AGENTS.md。", "写入前必须预览并校验 expected hash。", "每次提交先备份，冲突时重新加载。"]],
    ["常见故障", ["没弹选择器：检查“新对话创建前询问”。", "未确认注入：检查 adapter 与 requestTrace。", "Bridge 只读：检查 capabilities.diskWrite。", "RpcTarget 错误：禁止实例属性赋值。"]]
  ];
  function TutorialView({ store }) {
    const steps = [
      ["1", "点击新对话", "在 Codex 创建 thread 前选择环境。"],
      ["2", "选择环境", "模型、Provider 和提示词只影响这次会话。"],
      ["3", "发送消息", "核心拦截 prewarm/thread/start。"],
      ["4", "检查 proof", "确认 applied=true 与 acknowledged。"]
    ];
    return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_jsx_runtime2.Fragment, { children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(ScopeHeader, { scope: "帮助", title: "使用教程", detail: "了解会话环境、全局数据、注入证明和安全恢复。" }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "ei-steps", children: steps.map(([number, title, detail]) => /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("article", { className: "ei-step", children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "ei-step-number", children: number }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { children: [
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("h4", { children: title }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { children: detail })
        ] })
      ] }, number)) }),
      tutorialSections.map(([title, paragraphs], index) => /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(Disclosure, { title, defaultOpen: index === 0, children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "ei-tutorial-copy", children: paragraphs.map((paragraph) => /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { children: paragraph }, paragraph)) }) }, title)),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "ei-actions", children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(Button, { primary: true, onClick: () => store.openStudio(), children: "打开环境编辑器" }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(Button, { onClick: () => store.openMode("current"), children: "查看当前会话" })
      ] })
    ] });
  }
  var navigationGroups = [
    { label: "会话", items: [{ mode: "current", label: "当前对话" }, { mode: "select", label: "下个对话" }] },
    { label: "全局", items: [{ mode: "memory", label: "Memories" }, { mode: "agents", label: "AGENTS.md" }, { label: "环境管理", action: "studio" }] },
    { label: "帮助", items: [{ mode: "tutorial", label: "使用教程" }] }
  ];
  function ScopeNavigation({ mode, store }) {
    return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("aside", { className: "ei-scope-nav", "aria-label": "环境注入器导航", children: navigationGroups.map((group) => /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("section", { className: "ei-scope-nav-group", children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { children: group.label }),
      group.items.map((item) => /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("button", { type: "button", "aria-current": item.mode === mode ? "page" : void 0, onClick: () => item.action === "studio" ? store.openStudio() : item.mode && store.openMode(item.mode), children: item.label }, item.label))
    ] }, group.label)) });
  }
  function InjectorApp({ api: api2, store }) {
    const state = useUi(store);
    const expanded = state.core.environmentStore.ui.panelExpanded === true;
    (0, import_react2.useEffect)(() => {
      const onKey = (event) => {
        if (event.key !== "Escape") return;
        if (state.studioOpen) store.closeStudio();
        else if (state.open) store.close();
      };
      document.addEventListener("keydown", onKey);
      return () => document.removeEventListener("keydown", onKey);
    }, [state.open, state.studioOpen, store]);
    return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(UiErrorBoundary, { onError: (message) => store.showToast(message, "error"), children: /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "ei-shell", children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("button", { className: "ei-pill", type: "button", onClick: () => store.openFromPill(), children: pillLabel(state.core) }),
      state.open ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "ei-backdrop", onMouseDown: (event) => {
        if (event.target === event.currentTarget) store.close();
      }, children: /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("section", { className: "ei-dialog", "data-mode": state.mode, "data-expanded": expanded, role: "dialog", "aria-modal": "true", "aria-label": "环境注入器", children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("header", { className: "ei-header ei-main-header", onDoubleClick: (event) => {
          if (!event.target.closest("button")) store.setExpanded(!expanded);
        }, children: [
          /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "ei-header-copy", children: [
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("h2", { children: "环境注入器" }),
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { children: "会话环境与全局上下文" })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "ei-header-actions", children: [
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("button", { className: "ei-icon-button", type: "button", title: expanded ? "恢复面板大小" : "最大化面板", "aria-label": expanded ? "恢复面板大小" : "最大化面板", onClick: () => store.setExpanded(!expanded), children: expanded ? "↙" : "↗" }),
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("button", { className: "ei-icon-button", type: "button", "aria-label": "关闭", onClick: () => store.close(), children: "×" })
          ] })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "ei-main-layout", children: [
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(ScopeNavigation, { mode: state.mode, store }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("main", { className: `ei-body${state.mode === "current" ? " ei-body-current" : ""}`, children: [
            state.mode === "select" ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(SelectEnvironmentView, { store, core: state.core, title: state.title }) : null,
            state.mode === "current" ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(CurrentSessionView, { core: state.core }) : null,
            state.mode === "memory" ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(MemoryView, { api: api2, store, core: state.core }) : null,
            state.mode === "agents" ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(AgentsView, { api: api2, store, core: state.core }) : null,
            state.mode === "tutorial" ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(TutorialView, { store }) : null
          ] })
        ] })
      ] }) }) : null,
      state.studioOpen ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(StudioDialog, { api: api2, store, core: state.core }) : null,
      state.toast ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "ei-toast", "data-kind": state.toast.kind, children: state.toast.message }, state.toast.nonce) : null
    ] }) });
  }

  // src/react/store.ts
  var ReactUiStore = class {
    constructor(api2, initial) {
      this.api = api2;
      this.state = {
        core: initial,
        open: false,
        studioOpen: false,
        mode: "select",
        title: "选择环境",
        toast: null
      };
    }
    state;
    listeners = /* @__PURE__ */ new Set();
    chooser = null;
    toastTimer = 0;
    destroyed = false;
    onDestroy = null;
    setDestroyCallback(callback) {
      this.onDestroy = callback;
    }
    subscribe = (listener) => {
      this.listeners.add(listener);
      return () => this.listeners.delete(listener);
    };
    getSnapshot = () => this.state;
    emit(next) {
      if (this.destroyed) return;
      this.state = { ...this.state, ...next };
      for (const listener of this.listeners) listener();
    }
    status() {
      return { open: this.state.open, mode: this.state.mode };
    }
    update(snapshot) {
      const pendingProfileId = snapshot.status.pendingProfileId || "";
      if (this.chooser && pendingProfileId && pendingProfileId !== (this.state.core.status.pendingProfileId || "")) {
        const chooser = this.chooser;
        this.chooser = null;
        chooser.resolve(pendingProfileId);
        this.emit({ core: snapshot, open: false });
        return;
      }
      this.emit({ core: snapshot });
    }
    chooseProfile(title, snapshot) {
      if (this.chooser) {
        this.emit({ core: snapshot, open: true, mode: "select", title });
        return this.chooser.promise;
      }
      let resolve;
      const promise = new Promise((done) => {
        resolve = done;
      });
      this.chooser = { promise, resolve };
      this.emit({ core: snapshot, open: true, mode: "select", title });
      return promise;
    }
    open(mode, snapshot) {
      this.emit({ core: snapshot, open: true, mode, title: mode === "select" ? "选择环境" : "环境注入器" });
    }
    openMode(mode) {
      this.emit({ open: true, mode });
    }
    close() {
      const chooser = this.chooser;
      this.chooser = null;
      chooser?.resolve(null);
      this.emit({ open: false });
    }
    selectProfile(profileId) {
      const chooser = this.chooser;
      this.chooser = null;
      if (chooser) {
        chooser.resolve(profileId);
        this.emit({ open: false });
        return;
      }
      this.api.setNext(profileId);
      this.showToast(`下个新对话：${this.profileName(profileId)}`);
      this.emit({ open: false });
    }
    openFromPill() {
      void this.api.open().then((profileId) => {
        if (!profileId) return;
        this.api.setNext(profileId);
        this.showToast(`下个新对话：${this.profileName(profileId)}`);
      });
    }
    setPromptOnNewThread(enabled) {
      this.api.setPromptOnNewThread(enabled);
    }
    setExpanded(expanded) {
      this.api.updateUiPreferences({ panelExpanded: expanded });
    }
    openStudio() {
      this.emit({ open: false, studioOpen: true });
    }
    closeStudio() {
      this.emit({ studioOpen: false });
    }
    showToast(message, kind = "info") {
      window.clearTimeout(this.toastTimer);
      this.emit({ toast: { message, kind, nonce: Date.now() } });
      this.toastTimer = window.setTimeout(() => this.emit({ toast: null }), 2800);
    }
    contains(node) {
      const root = node.getRootNode();
      return root instanceof ShadowRoot && root.host.id === "codexpp-environment-react-host";
    }
    profileName(profileId) {
      return this.state.core.profiles.find((profile) => profile.id === profileId)?.name || profileId || "Base";
    }
    destroy() {
      if (this.destroyed) return;
      this.destroyed = true;
      window.clearTimeout(this.toastTimer);
      const chooser = this.chooser;
      this.chooser = null;
      chooser?.resolve(null);
      this.listeners.clear();
      this.onDestroy?.();
      this.onDestroy = null;
    }
  };

  // src/react/styles.ts
  var REACT_UI_STYLES = `
:host { all: initial; color-scheme: light dark; }
* { box-sizing: border-box; }
button, input, select, textarea { font: inherit; }
.ei-shell { position: fixed; inset: 0; z-index: 2147483200; pointer-events: none; color: var(--color-text, CanvasText); font: 13px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
.ei-pill { position: fixed; right: 16px; bottom: 16px; pointer-events: auto; appearance: none; border: 1px solid color-mix(in srgb, CanvasText 16%, transparent); border-radius: 999px; padding: 8px 12px; background: color-mix(in srgb, var(--color-surface, Canvas) 94%, transparent); color: inherit; box-shadow: 0 6px 24px rgba(0,0,0,.2); cursor: pointer; backdrop-filter: blur(14px); font-size: 12px; font-weight: 650; }
.ei-pill:hover { border-color: color-mix(in srgb, var(--color-token-primary, #3b82f6) 58%, transparent); transform: translateY(-1px); }
.ei-backdrop { position: fixed; inset: 0; display: grid; place-items: center; padding: 16px; pointer-events: auto; background: rgba(0,0,0,.44); backdrop-filter: blur(3px); animation: ei-fade .15s ease-out; }
.ei-dialog { width: min(440px, calc(100vw - 24px)); max-height: min(760px, calc(100vh - 32px)); display: flex; flex-direction: column; overflow: hidden; border: 1px solid color-mix(in srgb, CanvasText 14%, transparent); border-radius:14px; background:color-mix(in srgb,var(--color-surface,Canvas) 98%,transparent); color:inherit; box-shadow:0 16px 48px rgba(0,0,0,.3); animation: ei-dialog .17s cubic-bezier(.2,.8,.2,1); transition: width .18s ease,height .18s ease,border-radius .18s ease; }
.ei-dialog[data-mode="select"] { width:min(700px,calc(100vw - 24px)); }
.ei-dialog:not([data-mode="select"]) { width:min(840px,calc(100vw - 24px)); height:auto; max-height:min(780px,calc(100vh - 24px)); }
.ei-dialog[data-mode="memory"],.ei-dialog[data-mode="agents"] { height:min(760px,calc(100vh - 24px)); }
.ei-dialog[data-expanded="true"] { width: calc(100vw - 24px) !important; height: calc(100vh - 24px) !important; max-height: none; border-radius: 14px; }
.ei-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 14px; padding: 14px 16px 11px; border-bottom: 1px solid color-mix(in srgb, CanvasText 9%, transparent); }
.ei-header-copy { min-width: 0; }
.ei-header h2 { margin: 0; font-size: 17px; line-height: 22px; letter-spacing: -.01em; }
.ei-header p { margin:2px 0 0; color:color-mix(in srgb,CanvasText 58%,transparent); font-size:11px; line-height:15px; }
.ei-main-header { align-items:center; padding:10px 14px 7px; }
.ei-main-header h2 { font-size:15px; }
.ei-main-header p { display:none; }
.ei-header-actions { display: flex; gap: 4px; }
.ei-icon-button { width: 30px; height: 30px; display: grid; place-items: center; appearance: none; border: 0; border-radius: 8px; background: transparent; color: color-mix(in srgb, CanvasText 68%, transparent); cursor: pointer; font-size: 18px; }
.ei-icon-button:hover,.ei-icon-button:focus-visible { background: color-mix(in srgb, CanvasText 8%, transparent); color: CanvasText; outline: none; }
.ei-main-layout { min-height:0; flex:1 1 auto; display:grid; grid-template-columns:145px minmax(0,1fr); overflow:hidden; }
.ei-scope-nav { min-height:0; display:grid; align-content:start; gap:14px; padding:12px 8px; border-right:1px solid color-mix(in srgb,CanvasText 7%,transparent); }
.ei-scope-nav-group { display:grid; gap:2px; }
.ei-scope-nav-group>span { padding:0 8px 4px; color:color-mix(in srgb,CanvasText 38%,transparent); font-size:9px; font-weight:700; letter-spacing:.08em; }
.ei-scope-nav-group button { width:100%; appearance:none; border:0; border-radius:6px; padding:7px 8px; background:transparent; color:color-mix(in srgb,CanvasText 62%,transparent); text-align:left; cursor:pointer; font-size:11px; }
.ei-scope-nav-group button:hover,.ei-scope-nav-group button:focus-visible { background:color-mix(in srgb,CanvasText 5%,transparent); color:CanvasText; outline:none; }
.ei-scope-nav-group button[aria-current="page"] { background:color-mix(in srgb,var(--color-token-primary,#3b82f6) 9%,transparent); color:CanvasText; font-weight:650; box-shadow:inset 2px 0 0 var(--color-token-primary,#3b82f6); }
.ei-scope-header { display:flex; align-items:flex-start; gap:10px; padding:1px 0 8px; border-bottom:1px solid color-mix(in srgb,CanvasText 7%,transparent); }
.ei-scope-header>span { flex:none; margin-top:2px; padding:2px 6px; border-radius:999px; background:color-mix(in srgb,CanvasText 7%,transparent); color:color-mix(in srgb,CanvasText 58%,transparent); font-size:9px; font-weight:700; }
.ei-scope-header>span[data-scope="会话级"] { background:color-mix(in srgb,#3b82f6 12%,transparent); color:#72a7f8; }
.ei-scope-header>span[data-scope="全局"] { background:color-mix(in srgb,#8b5cf6 12%,transparent); color:#a78bfa; }
.ei-scope-header>div { min-width:0; display:grid; gap:2px; }
.ei-scope-header h3 { margin:0; font-size:13px; line-height:18px; }
.ei-scope-header p { margin:0; color:color-mix(in srgb,CanvasText 50%,transparent); font-size:10px; line-height:15px; }
.ei-scope-toggle { display:flex; align-items:center; gap:7px; padding:8px 2px 0; color:color-mix(in srgb,CanvasText 62%,transparent); font-size:11px; cursor:pointer; }
.ei-scope-toggle input { accent-color:var(--color-token-primary,#3b82f6); }
.ei-tabs { display: flex; gap: 3px; padding: 6px 8px 0; overflow-x: auto; }
.ei-tab { flex:none; appearance:none; border:0; border-radius:0; padding:7px 9px 8px; background:transparent; color:color-mix(in srgb,CanvasText 55%,transparent); cursor:pointer; font-size:12px; font-weight:600; }
.ei-tab:hover,.ei-tab:focus-visible { color:CanvasText; outline:none; }
.ei-tab[aria-selected="true"] { color:CanvasText; box-shadow:inset 0 -2px 0 var(--color-token-primary,#3b82f6); }
.ei-body { min-height: 0; flex: 1 1 auto; display: grid; align-content: start; gap: 8px; padding: 10px 12px 12px; overflow: auto; overscroll-behavior: contain; }
.ei-body-current { grid-template-columns:1fr; gap:12px; }
.ei-heading { display: grid; gap: 3px; padding: 2px 2px 4px; }
.ei-heading h3 { margin: 0; font-size: 14px; }
.ei-heading p,.ei-help,.ei-note { margin: 0; color: color-mix(in srgb, CanvasText 55%, transparent); font-size: 10px; line-height: 16px; }
.ei-current-summary { display:grid; gap:5px; padding:4px 2px 10px; border-bottom:1px solid color-mix(in srgb,CanvasText 8%,transparent); }
.ei-current-title { display:flex; align-items:center; gap:8px; min-width:0; }
.ei-current-title strong { font-size:16px; line-height:22px; }
.ei-current-status { color:color-mix(in srgb,CanvasText 58%,transparent); font-size:11px; }
.ei-current-summary p { margin:0; color:color-mix(in srgb,CanvasText 62%,transparent); font-size:11px; }
.ei-status-dot { width:7px; height:7px; flex:none; border-radius:50%; background:#8a8a8a; }
.ei-status-dot[data-kind="confirmed"] { background:#39b77a; box-shadow:0 0 0 3px color-mix(in srgb,#39b77a 12%,transparent); }
.ei-status-dot[data-kind="unconfirmed"],.ei-status-dot[data-kind="unknown"] { background:#d99124; }
.ei-inspector { overflow:hidden; border:1px solid color-mix(in srgb,CanvasText 10%,transparent); border-radius:9px; background:color-mix(in srgb,CanvasText 1.5%,transparent); }
.ei-inspector-tabs { display:flex; gap:2px; overflow-x:auto; padding:5px 6px; border-bottom:1px solid color-mix(in srgb,CanvasText 8%,transparent); }
.ei-inspector-tabs button { display:flex; align-items:center; gap:5px; appearance:none; border:0; border-radius:5px; padding:5px 8px; background:transparent; color:color-mix(in srgb,CanvasText 55%,transparent); cursor:pointer; font-size:10px; }
.ei-inspector-tabs button[aria-selected="true"] { background:color-mix(in srgb,CanvasText 7%,transparent); color:CanvasText; }
.ei-inspector-tabs button span { min-width:15px; padding:0 4px; border-radius:999px; background:color-mix(in srgb,CanvasText 7%,transparent); font-size:8px; text-align:center; }
.ei-inspector>.ei-pre { border:0; }
.ei-hero { display: grid; gap: 6px; padding: 10px 12px; border: 1px solid color-mix(in srgb, CanvasText 10%, transparent); border-radius: 12px; background: color-mix(in srgb, CanvasText 3%, transparent); }
.ei-hero-head { display: flex; justify-content: space-between; gap: 12px; }
.ei-eyebrow { display: block; color: color-mix(in srgb, CanvasText 52%, transparent); font-size: 10px; }
.ei-hero strong { display: block; font-size: 15px; }
.ei-badge { height: fit-content; padding: 3px 8px; border-radius: 999px; background: color-mix(in srgb, CanvasText 8%, transparent); color: color-mix(in srgb, CanvasText 72%, transparent); font-size: 10px; font-weight: 700; }
.ei-badge[data-kind="confirmed"] { background: color-mix(in srgb,#22a06b 15%,transparent); color:#3fbf88; }
.ei-thread { color: color-mix(in srgb, CanvasText 54%, transparent); font: 10px/14px ui-monospace,Consolas,monospace; overflow-wrap:anywhere; }
.ei-meta { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:0 14px; border-block:1px solid color-mix(in srgb,CanvasText 7%,transparent); }
.ei-meta-row { min-width:0; min-height:34px; display:flex; align-items:center; justify-content:space-between; gap:8px; padding:5px 2px; border:0; border-bottom:1px solid color-mix(in srgb,CanvasText 5%,transparent); border-radius:0; }
.ei-meta-row span { color: color-mix(in srgb,CanvasText 52%,transparent); font-size:10px; }
.ei-meta-row code { min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; color:CanvasText; font:10px/14px ui-monospace,Consolas,monospace; }
.ei-meta-flat { padding:6px 8px; border:0; }
.ei-meta-flat .ei-meta-row { min-height:32px; border:0; border-radius:0; padding:5px 8px; }
.ei-disclosure { overflow:hidden; border:0; border-bottom:1px solid color-mix(in srgb,CanvasText 9%,transparent); border-radius:0; background:transparent; }
.ei-disclosure-trigger { width:100%; min-height:38px; display:flex; align-items:center; justify-content:space-between; gap:12px; appearance:none; border:0; padding:8px 2px; color:color-mix(in srgb,CanvasText 76%,transparent); background:transparent; text-align:left; cursor:pointer; font-size:11px; font-weight:620; }
.ei-disclosure-trigger:hover,.ei-disclosure-trigger:focus-visible { color:CanvasText; outline:none; }
.ei-disclosure-end { flex:none; display:flex; align-items:center; gap:7px; }
.ei-disclosure-meta { color:color-mix(in srgb,CanvasText 45%,transparent); font-size:9px; font-weight:500; }
.ei-chevron { font-size:15px; transform:rotate(-90deg); transition:transform .16s ease; }
.ei-disclosure[data-open="true"] .ei-chevron { transform:rotate(0deg); }
.ei-disclosure-body { border-top:1px solid color-mix(in srgb,CanvasText 8%,transparent); animation:ei-reveal .14s ease-out; }
.ei-pre { max-height:min(42vh,360px); margin:0; padding:11px; overflow:auto; white-space:pre-wrap; overflow-wrap:anywhere; color:color-mix(in srgb,CanvasText 82%,transparent); background:color-mix(in srgb,CanvasText 2%,transparent); font:10px/16px ui-monospace,Consolas,monospace; }
.ei-pre[data-empty="true"] { color:color-mix(in srgb,CanvasText 45%,transparent); font-family:inherit; }
.ei-profile-list { display:grid; gap:0; }
.ei-profile { width:100%; min-height:48px; display:flex; align-items:center; justify-content:space-between; gap:12px; padding:8px 6px; appearance:none; border:0; border-bottom:1px solid color-mix(in srgb,CanvasText 7%,transparent); border-radius:0; background:transparent; color:inherit; text-align:left; cursor:pointer; }
.ei-profile:hover,.ei-profile:focus-visible { background:color-mix(in srgb,CanvasText 5%,transparent); outline:none; }
.ei-profile[data-selected="true"] { background:color-mix(in srgb,var(--color-token-primary,#3b82f6) 9%,transparent); box-shadow:inset 2px 0 0 var(--color-token-primary,#3b82f6); }
.ei-profile-copy { min-width:0; display:grid; gap:3px; }
.ei-profile-copy strong,.ei-profile-copy small { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.ei-profile-copy small { color:color-mix(in srgb,CanvasText 58%,transparent); font-size:11px; }
.ei-check { width:22px; height:22px; display:grid; place-items:center; border:1px solid color-mix(in srgb,CanvasText 18%,transparent); border-radius:50%; }
.ei-profile[data-selected="true"] .ei-check { border-color:var(--color-token-primary,#3b82f6); background:var(--color-token-primary,#3b82f6); color:white; }
.ei-footer { display:grid; gap:7px; padding:10px 14px 12px; border-top:1px solid color-mix(in srgb,CanvasText 9%,transparent); background:color-mix(in srgb,CanvasText 2.5%,transparent); }
.ei-toggle { display:flex; align-items:center; gap:8px; width:fit-content; cursor:pointer; font-size:12px; }
.ei-toggle input { accent-color:var(--color-token-primary,#3b82f6); }
.ei-card { display:grid; gap:8px; padding:4px 0 0; border:0; background:transparent; }
.ei-textarea { width:100%; min-height:150px; resize:vertical; border:1px solid color-mix(in srgb,CanvasText 12%,transparent); border-radius:9px; padding:10px; background:color-mix(in srgb,CanvasText 2%,transparent); color:CanvasText; outline:none; font:10px/16px ui-monospace,Consolas,monospace; }
.ei-textarea-tall { min-height:clamp(170px,30vh,270px); }
.ei-actions { display:flex; flex-wrap:wrap; gap:7px; }
.ei-button { appearance:none; border:1px solid color-mix(in srgb,CanvasText 12%,transparent); border-radius:8px; padding:6px 9px; background:color-mix(in srgb,CanvasText 4%,transparent); color:CanvasText; cursor:pointer; font-size:10px; font-weight:650; }
.ei-button:hover:not(:disabled),.ei-button:focus-visible { background:color-mix(in srgb,CanvasText 8%,transparent); outline:none; }
.ei-button-primary { border-color:color-mix(in srgb,var(--color-token-primary,#3b82f6) 55%,transparent); background:color-mix(in srgb,var(--color-token-primary,#3b82f6) 14%,transparent); }
.ei-button:disabled { opacity:.38; cursor:not-allowed; }
.ei-status { min-height:16px; margin:0; color:color-mix(in srgb,CanvasText 52%,transparent); font-size:10px; }
.ei-status[data-kind="success"] { color:#3fbf88; }.ei-status[data-kind="error"] { color:#ef6b73; }
.ei-steps { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:8px; }
.ei-step { display:grid; grid-template-columns:26px minmax(0,1fr); gap:9px; padding:8px 2px; border:0; }
.ei-step-number { width:24px; height:24px; display:grid; place-items:center; border-radius:50%; background:color-mix(in srgb,var(--color-token-primary,#3b82f6) 16%,transparent); color:var(--color-token-primary,#3b82f6); font-size:11px; font-weight:750; }
.ei-step h4,.ei-step p { margin:0; }.ei-step h4 { font-size:11px; }.ei-step p { color:color-mix(in srgb,CanvasText 58%,transparent); font-size:10px; line-height:16px; }
.ei-tutorial-copy { display:grid; gap:7px; padding:10px 11px; }.ei-tutorial-copy p { margin:0; color:color-mix(in srgb,CanvasText 58%,transparent); font-size:10px; line-height:16px; }
.ei-studio-backdrop { z-index:3; }
.ei-studio-dialog { width:min(980px,calc(100vw - 24px)); height:min(680px,calc(100vh - 24px)); display:grid; grid-template-rows:auto minmax(0,1fr); overflow:hidden; border:1px solid color-mix(in srgb,CanvasText 13%,transparent); border-radius:14px; background:color-mix(in srgb,var(--color-surface,Canvas) 98%,transparent); color:inherit; box-shadow:0 18px 56px rgba(0,0,0,.34); }
.ei-studio-layout { min-height:0; display:grid; grid-template-columns:205px minmax(0,1fr); }
.ei-studio-sidebar { min-height:0; display:grid; align-content:start; gap:0; overflow:auto; padding:10px; border-right:1px solid color-mix(in srgb,CanvasText 8%,transparent); }
.ei-studio-profile { width:100%; display:grid; gap:2px; appearance:none; border:0; border-radius:6px; padding:8px 9px; background:transparent; color:inherit; text-align:left; cursor:pointer; }
.ei-studio-profile:hover,.ei-studio-profile[data-active="true"] { background:color-mix(in srgb,var(--color-token-primary,#3b82f6) 8%,transparent); }
.ei-studio-profile[data-active="true"] { box-shadow:inset 2px 0 0 var(--color-token-primary,#3b82f6); }
.ei-studio-profile small { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; color:color-mix(in srgb,CanvasText 55%,transparent); font-size:10px; }
.ei-studio-editor { min-height:0; display:grid; grid-template-rows:auto minmax(0,1fr) auto auto; overflow:hidden; }
.ei-studio-editor-head { display:flex; align-items:center; justify-content:space-between; gap:12px; padding:12px 16px 8px; border-bottom:1px solid color-mix(in srgb,CanvasText 7%,transparent); }
.ei-studio-editor-head>div { min-width:0; display:flex; align-items:baseline; gap:7px; }
.ei-studio-editor-head strong { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-size:13px; }
.ei-studio-editor-head span { color:color-mix(in srgb,CanvasText 50%,transparent); font-size:10px; }
.ei-studio-tabs { display:flex; gap:2px; }
.ei-studio-tabs button { appearance:none; border:0; border-radius:5px; padding:5px 8px; background:transparent; color:color-mix(in srgb,CanvasText 52%,transparent); cursor:pointer; font-size:10px; }
.ei-studio-tabs button[aria-selected="true"] { background:color-mix(in srgb,CanvasText 7%,transparent); color:CanvasText; }
.ei-studio-content { min-height:0; overflow:auto; padding:16px; }
.ei-studio-section { display:grid; gap:12px; }
.ei-studio-grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:12px 14px; }
.ei-studio-grid-compact { max-width:760px; }
.ei-studio-field { min-width:0; display:grid; gap:5px; }
.ei-studio-field>span { color:color-mix(in srgb,CanvasText 60%,transparent); font-size:11px; }
.ei-studio-field-full { grid-column:1 / -1; }
.ei-studio-input { width:100%; min-height:36px; border:1px solid color-mix(in srgb,CanvasText 13%,transparent); border-radius:6px; padding:6px 8px; background:color-mix(in srgb,CanvasText 3%,transparent); color:inherit; outline:none; }
.ei-studio-input:focus,.ei-studio-field .ei-textarea:focus { border-color:var(--color-token-primary,#3b82f6); }
.ei-studio-import { width:fit-content; appearance:none; border:0; border-radius:6px; padding:6px 8px; background:color-mix(in srgb,CanvasText 6%,transparent); color:inherit; cursor:pointer; font-size:10px; font-weight:650; }
.ei-studio-import input { display:none; }
.ei-studio-textarea { min-height:170px; }
.ei-studio-code { min-height:360px; }
.ei-studio-savebar { display:flex; align-items:center; gap:7px; padding:9px 16px; border-top:1px solid color-mix(in srgb,CanvasText 8%,transparent); background:color-mix(in srgb,var(--color-surface,Canvas) 98%,transparent); }
.ei-studio-spacer { flex:1; }
.ei-studio-status { padding:0 16px 8px; }
.ei-toast { position:fixed; right:16px; bottom:58px; max-width:360px; pointer-events:none; padding:8px 11px; border-radius:9px; background:#111827; color:white; box-shadow:0 8px 28px rgba(0,0,0,.3); font-size:12px; }
.ei-toast[data-kind="error"] { background:#991b1b; }.ei-toast[data-kind="success"] { background:#166534; }
@keyframes ei-fade { from{opacity:0} to{opacity:1} } @keyframes ei-dialog { from{opacity:0;transform:translateY(8px) scale(.985)} to{opacity:1;transform:none} } @keyframes ei-reveal { from{opacity:0;transform:translateY(-3px)} to{opacity:1;transform:none} }
@media(max-width:760px){.ei-main-layout{grid-template-columns:1fr}.ei-scope-nav{display:flex;gap:4px;overflow-x:auto;padding:6px;border-right:0;border-bottom:1px solid color-mix(in srgb,CanvasText 7%,transparent)}.ei-scope-nav-group{display:flex;gap:2px}.ei-scope-nav-group>span{display:none}.ei-scope-nav-group button{width:auto;white-space:nowrap}.ei-scope-nav-group button[aria-current="page"]{box-shadow:inset 0 -2px 0 var(--color-token-primary,#3b82f6)}.ei-body-current{grid-template-columns:1fr}.ei-meta{grid-template-columns:repeat(2,minmax(0,1fr))}.ei-studio-layout{grid-template-columns:1fr}.ei-studio-sidebar{max-height:150px;border-right:0;border-bottom:1px solid color-mix(in srgb,CanvasText 10%,transparent)}.ei-studio-editor-head{align-items:stretch;flex-direction:column}.ei-studio-tabs{overflow-x:auto}.ei-studio-grid{grid-template-columns:1fr}.ei-studio-field-full{grid-column:1}.ei-studio-savebar{flex-wrap:wrap}.ei-studio-spacer{display:none}}
@media(max-width:560px){.ei-backdrop{padding:8px}.ei-dialog,.ei-dialog:not([data-mode="select"]),.ei-dialog[data-expanded="true"]{width:calc(100vw - 16px)!important;height:calc(100vh - 16px)!important;max-height:none;border-radius:14px}.ei-meta,.ei-steps{grid-template-columns:1fr}.ei-body{padding:8px}.ei-header{padding:11px 12px 9px}}
@media(prefers-reduced-motion:reduce){.ei-dialog,.ei-backdrop,.ei-disclosure-body,.ei-chevron{animation:none;transition:none}}
`;

  // src/react/index.tsx
  var import_jsx_runtime3 = __toESM(require_jsx_runtime(), 1);
  var REACT_UI_VERSION = "0.3.2";
  var HOST_ID = "codexpp-environment-react-host";
  window.__codexEnvironmentReactUi?.destroy?.();
  var api = window.__codexEnvironmentInjector;
  if (api) {
    document.getElementById(HOST_ID)?.remove();
    const host = document.createElement("div");
    host.id = HOST_ID;
    host.style.position = "fixed";
    host.style.inset = "0";
    host.style.zIndex = "2147483200";
    host.style.pointerEvents = "none";
    const shadow = host.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = REACT_UI_STYLES;
    const container = document.createElement("div");
    container.dataset.reactRoot = "environment-injector";
    shadow.append(style, container);
    document.documentElement.append(host);
    const store = new ReactUiStore(api, api.uiSnapshot());
    const root = (0, import_client.createRoot)(container);
    let detach = null;
    let detachStudio = null;
    let disposed = false;
    const cleanup = () => {
      if (disposed) return;
      disposed = true;
      const release = detach;
      const releaseStudio = detachStudio;
      detach = null;
      detachStudio = null;
      releaseStudio?.();
      release?.();
      queueMicrotask(() => {
        try {
          root.unmount();
        } catch {
        }
        host.remove();
      });
      if (window.__codexEnvironmentReactUi?.version === REACT_UI_VERSION) {
        delete window.__codexEnvironmentReactUi;
      }
    };
    store.setDestroyCallback(cleanup);
    root.render(/* @__PURE__ */ (0, import_jsx_runtime3.jsx)(InjectorApp, { api, store }));
    detach = api.attachUiAdapter(store);
    detachStudio = window.__codexEnvironmentStudio?.attachUiAdapter?.({
      open: () => store.openStudio(),
      close: () => store.closeStudio(),
      status: () => ({ open: store.getSnapshot().studioOpen })
    }) || null;
    window.__codexEnvironmentReactUi = {
      version: REACT_UI_VERSION,
      destroy: () => store.destroy(),
      status: () => ({
        version: REACT_UI_VERSION,
        mounted: host.isConnected,
        open: store.getSnapshot().open,
        studioOpen: store.getSnapshot().studioOpen,
        mode: store.getSnapshot().mode,
        coreVersion: store.getSnapshot().core.status.version
      })
    };
  }
})();

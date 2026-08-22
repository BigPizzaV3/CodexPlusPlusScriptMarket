// ==UserScript==
// @name         Codex 插件翻译器
// @description  为 Codex 插件页面提供 Google Free 双语翻译与可选 DeepSeek 重译，基于 Codex++ 用户脚本运行。
// @version      1.0.0-rc2
// ==/UserScript==

(() => {
  'use strict';

  // Keep the legacy storage identity so existing settings and IndexedDB cache remain compatible.
  const SCRIPT_KEY = 'codex-plugin-market-bilingual-test';
  const CACHE_KEY = `${SCRIPT_KEY}:translations:v2`;
  const MOCK_CACHE_KEY = `${SCRIPT_KEY}:translations:mock-v1`;
  const MODE_KEY = `${SCRIPT_KEY}:detail-mode:v1`;
  const DETAIL_SOURCE_KEY = `${SCRIPT_KEY}:detail-source:v1`;
  const PROVIDER_CONFIG_KEY = `${SCRIPT_KEY}:provider-config:v1`;
  const HELPER_SESSION_KEY = `${SCRIPT_KEY}:helper-session:v1`;
  const HELPER_RELEASES_URL = 'https://github.com/cocoxia123/CodexPluginTranslator/releases';
  const DISCOVERY_PORT = 43_179;
  const TRANSLATION_DB_NAME = 'CodexPluginTranslatorDB';
  const TRANSLATION_DB_VERSION = 1;
  const TRANSLATION_STORE_NAME = 'translations';
  const MAX_HELPER_CARD_REQUESTS = 5;
  const GOOGLE_MAX_CONCURRENCY = 2;
  const GOOGLE_REQUEST_GAP_MS = 200;
  const SOURCE_LANGUAGE = 'en';
  const LANGUAGE = 'zh-CN';
  const MAX_DETAIL_SOURCE_CHARS = 20_000;
  const VALID_MODES = new Set(['bilingual', 'english', 'chinese']);
  const VALID_DETAIL_SOURCES = new Set(['google-free', 'deepseek']);
  window.__codexPluginTranslatorVersion = '1.0.0-rc2';

  const PROVIDER_REGISTRY = Object.freeze({
    'static-test': Object.freeze({ id: 'static-test', label: 'Static Test', type: 'mock', models: [{ id: 'static-test-v1', label: 'Static Test v1' }], supportsThinking: false, supportsTranslation: true, supportsPolish: false }),
    'local-helper-mock': Object.freeze({ id: 'local-helper-mock', label: 'Local Helper Mock', type: 'local-helper', models: [{ id: 'local-helper-mock-v1', label: 'Local Helper Mock v1' }], supportsThinking: false, supportsTranslation: true, supportsPolish: false }),
    'google-free': Object.freeze({ id: 'google-free', label: 'Google Free', type: 'local-helper', models: [{ id: 'google-free-v1', label: 'Google Free' }], supportsThinking: false, supportsTranslation: true, supportsPolish: false }),
    google: Object.freeze({ id: 'google', label: 'Google', type: 'mock', models: [{ id: 'google-cloud-translation', label: 'Google Cloud Translation' }], supportsThinking: false, supportsTranslation: true, supportsPolish: false }),
    openai: Object.freeze({ id: 'openai', label: 'OpenAI', type: 'mock', models: [], supportsThinking: true, supportsTranslation: true, supportsPolish: true }),
    gemini: Object.freeze({ id: 'gemini', label: 'Gemini', type: 'mock', models: [], supportsThinking: true, supportsTranslation: true, supportsPolish: true }),
    claude: Object.freeze({ id: 'claude', label: 'Claude', type: 'mock', models: [], supportsThinking: true, supportsTranslation: true, supportsPolish: true }),
    deepseek: Object.freeze({
      id: 'deepseek', label: 'DeepSeek', type: 'local-helper', supportsThinking: true, supportsTranslation: true, supportsPolish: true,
      models: [
        { id: 'deepseek-v4-flash', label: 'DeepSeek V4-Flash', recommendedFor: ['card', 'detail', 'batch', 'low-latency'] },
        { id: 'deepseek-v4-pro', label: 'DeepSeek V4-Pro', recommendedFor: ['technical-detail', 'retranslation', 'polish'] }
      ]
    }),
    'openai-compatible': Object.freeze({ id: 'openai-compatible', label: 'OpenAI Compatible', type: 'mock', models: [], supportsThinking: true, supportsTranslation: true, supportsPolish: true })
  });

  const DEFAULT_TRANSLATION_PROMPT = '忠实翻译为自然简体中文；保留 Codex、API、MCP、SDK、CLI 等技术名称；Skill 首次出现可译为 Skill（技能），Agent 首次出现可译为 Agent（智能体）；workflow 译为“工作流”，repository 按语境译为“代码仓库”；不翻译代码、命令、URL、文件路径；不扩写原文没有的信息，不把翻译改写成介绍文章。';
  const DEFAULT_POLISH_PROMPT = '结合英文原文，对已有中文翻译进行技术语境润色；保持含义忠实，保留技术名称、代码、命令、URL 和文件路径，不新增原文没有的信息。';

  const DEFAULT_PROVIDER_CONFIG = Object.freeze({
    routing: { card: 'google-free', detail: 'static-test', polish: 'static-test' },
    recommendations: {
      cardBase: { provider: 'google', model: 'google-cloud-translation' },
      detailBase: { provider: 'google', model: 'google-cloud-translation' },
      aiTranslationFallback: { provider: 'deepseek', model: 'deepseek-v4-flash', thinkingMode: 'non-thinking' },
      aiTechnicalPolish: { provider: 'deepseek', model: 'deepseek-v4-pro', thinkingMode: 'non-thinking' }
    },
    providers: {
      deepseek: {
        enabled: false, apiKeyRef: '', baseUrl: 'https://api.deepseek.com', model: 'deepseek-v4-flash',
        thinkingMode: 'non-thinking', temperature: 0.2, timeoutMs: 30000, batchSize: 20,
        translationPrompt: DEFAULT_TRANSLATION_PROMPT, polishPrompt: DEFAULT_POLISH_PROMPT
      }
    }
  });

  const STATIC_TRANSLATIONS = Object.freeze({
    card: Object.freeze({
      'Read and manage Gmail': '阅读和管理 Gmail。',
      'Triage PRs, issues, CI, and publish flows': '分类处理 PR 和议题、排查 CI，并安全发布变更。',
      'Work across Drive, Docs, Sheets, and Slides': '跨 Google Drive、文档、表格和幻灯片协作。',
      'Manage Google Calendar events and schedules': '管理 Google 日历事件和日程安排。',
      'Notion workflows for specs, research, meetings, and knowledge capture': '使用 Notion 管理规格、研究、会议和知识沉淀工作流。',
      'Read and manage Slack': '读取并管理 Slack。',
      'Add your meeting context': '添加你的会议背景信息。',
      'Search meeting transcripts': '搜索会议文字记录。',
      'Manage Microsoft Outlook schedules and meeting changes': '管理 Microsoft Outlook 日程和会议变更。',
      'Retrieve insights from Plaud': '从 Plaud 获取洞察。'
    }),
    detail: Object.freeze({
      'github|Triage PRs, issues, CI, and publish flows': '分类处理 PR 和议题、排查 CI，并安全发布变更。',
      'github|Use GitHub to inspect repositories, review pull requests, address feedback, debug failing Actions checks, and prepare code changes for review through a connector-first workflow with targeted CLI fallbacks.': '使用 GitHub 检查仓库、审查拉取请求、处理反馈、排查失败的 Actions 检查，并通过优先使用连接器、必要时使用针对性 CLI 的工作流准备代码变更以供审查。',
      'github|Access repositories, issues, and pull requests. Required for some features such as Codex': '访问仓库、议题和拉取请求。Codex 等部分功能需要此应用。',
      'github|Workspace-specific GitHub connector for a GitHub Enterprise host.': '面向 GitHub Enterprise 主机的工作区专用 GitHub 连接器。',
      'github|Safely inspect and address PR feedback': '安全检查并处理 PR 反馈。',
      'github|Debug failing GitHub Actions checks': '排查失败的 GitHub Actions 检查。'
    })
  });

  if (window.__codexPluginMarketBilingualTestCleanup) {
    try { window.__codexPluginMarketBilingualTestCleanup(); } catch (_) {}
  }

  let observer = null;
  let scanScheduled = false;
  let scanRunning = false;
  let stopped = false;
  let helperUnavailable = false;
  let autoHelperSession = { port: 0, token: '' };
  let manualHelperSession = { port: 0, token: '' };
  let discoveryInFlight = null;
  let initialDiscoveryAttempted = false;
  let googleActiveRequests = 0;
  let googlePumpScheduled = false;
  let helperPostPairScanScheduled = false;
  let helperPostPairScanCompleted = false;
  const helperUniqueRequestKeys = new Set();
  const helperCompletedKeys = new Set();
  const helperInFlight = new Map();
  const helperWaitingNodes = new Map();
  const googleUniqueRequestKeys = new Set();
  const googleCompletedKeys = new Set();
  const googleInFlight = new Map();
  const googleWaitingNodes = new Map();
  const googleQueuedKeys = new Set();
  const googleFailedKeys = new Set();
  const googleQueue = [];
  const deepSeekInFlight = new Map();
  const deepSeekDetailInFlight = new Map();
  const runtimeTranslationCache = new Map();
  const cacheReadInFlight = new Map();
  const cachePersistAttempted = new Set();
  const detailRenderInFlight = new WeakMap();
  const pendingScanRoots = new Set();
  let translationDatabasePromise = null;

  const normalizeText = (value) => String(value || '').replace(/\s+/g, ' ').trim();
  const pluginSlug = (value) => normalizeText(value).toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'unknown-plugin';

  function mergeProviderConfig(saved = {}) {
    const defaults = JSON.parse(JSON.stringify(DEFAULT_PROVIDER_CONFIG));
    return {
      ...defaults, ...saved,
      routing: { ...defaults.routing, ...(saved.routing || {}) },
      recommendations: { ...defaults.recommendations, ...(saved.recommendations || {}) },
      providers: {
        ...defaults.providers, ...(saved.providers || {}),
        deepseek: { ...defaults.providers.deepseek, ...(saved.providers?.deepseek || {}) }
      }
    };
  }

  function readProviderConfig() {
    try { return mergeProviderConfig(JSON.parse(localStorage.getItem(PROVIDER_CONFIG_KEY) || '{}')); }
    catch (_) { return mergeProviderConfig(); }
  }

  function saveProviderConfig(config) {
    const normalized = mergeProviderConfig(config);
    try { localStorage.setItem(PROVIDER_CONFIG_KEY, JSON.stringify(normalized)); } catch (_) {}
    return normalized;
  }

  function readManualHelperSession() {
    return { ...manualHelperSession };
  }

  function readHelperSession() {
    if (autoHelperSession.port && autoHelperSession.token) return { ...autoHelperSession };
    return readManualHelperSession();
  }

  function saveHelperSession(port, token) {
    const normalized = { port: Number(port), token: String(token || '').trim() };
    manualHelperSession = normalized;
    helperUnavailable = false;
    return normalized;
  }

  function saveAutoHelperSession(port, token) {
    const normalized = { port: Number(port), token: String(token || '').trim() };
    if (!Number.isInteger(normalized.port) || normalized.port < 49152 || normalized.port > 65535 || !/^[A-Fa-f0-9]{64}$/.test(normalized.token))
      return { port: 0, token: '' };
    autoHelperSession = normalized;
    helperUnavailable = false;
    return { ...normalized };
  }

  function clearAutoHelperSession() {
    autoHelperSession = { port: 0, token: '' };
  }

  function setHelperStatus(message) {
    try {
      const status = document.querySelector(`[data-local-helper-status="${SCRIPT_KEY}"]`);
      if (status) status.textContent = message;
      const download = document.querySelector(`[data-local-helper-download="${SCRIPT_KEY}"]`);
      if (download) {
        if (/已连接/.test(message)) download.style.display = 'none';
        else if (/未启动|未运行|尚未配对|配对信息无效|连接失败/.test(message)) download.style.display = 'grid';
      }
    } catch (_) {}
  }

  function providerSelection(kind) {
    const config = readProviderConfig();
    const providerId = config.routing[kind] || 'static-test';
    const provider = PROVIDER_REGISTRY[providerId] || PROVIDER_REGISTRY['static-test'];
    const providerConfig = config.providers[providerId] || {};
    const model = providerConfig.model || provider.models[0]?.id || '';
    return { provider, providerId: provider.id, providerConfig, model };
  }

  async function invokeProvider(operation, request) {
    const kind = operation === 'polish' ? 'polish' : request?.context?.kind === 'card' ? 'card' : 'detail';
    const selection = providerSelection(kind);
    if (selection.providerId === 'static-test') {
      const translatedText = getStaticTranslation(request.sourceText, request.context);
      return { status: translatedText ? 'mock-success' : 'mock-miss', translatedText, provider: 'static-test', model: 'static-test-v1', networkUsed: false };
    }
    if (selection.providerId === 'local-helper-mock' && kind === 'card' && operation === 'translation') {
      return invokeLocalHelperMock(request);
    }
    if (selection.providerId === 'google-free' && kind === 'card' && operation === 'translation') {
      return invokeGoogleFree(request);
    }
    return {
      status: 'not-configured', translatedText: null, provider: selection.providerId, model: selection.model,
      operation, networkUsed: false, message: '当前阶段仅建立翻译来源架构，尚未启用真实 API 调用。'
    };
  }

  async function invokeGoogleFree(request) {
    const session = await ensureHelperPaired();
    if (!session.port || !/^[A-Fa-f0-9]{32,}$/.test(session.token)) {
      return { status: 'not-configured', translatedText: null, provider: 'google-free', model: 'google-free-v1', networkUsed: false };
    }
    try {
      const response = await sendLocalHelperRequest(session.port, session.token, {
        apiVersion: 1, provider: 'google-free', task: 'translate', text: request.sourceText, contentType: 'summary'
      });
      if (!response.ok || response.payload?.success !== true || typeof response.payload.translatedText !== 'string') throw new Error('google_translation_failed');
      return { status: 'success', translatedText: response.payload.translatedText, provider: 'google-free', model: 'google-free-v1', networkUsed: true };
    } catch (error) { throw Object.assign(new Error('google_translation_failed'), { code: error?.code || 'google_translation_failed' }); }
  }

  async function invokeGoogleDetail(sourceText) {
    const session = await ensureHelperPaired({ forceDiscovery: true });
    if (!session.port || !/^[A-Fa-f0-9]{32,}$/.test(session.token)) throw Object.assign(new Error('helper_not_paired'), { code: 'helper_not_paired' });
    const response = await sendLocalHelperHttpRequest(session.port, session.token, '/v1/translate', 'POST', {
      apiVersion: 1, provider: 'google-free', task: 'translate', text: sourceText,
      sourceLanguage: SOURCE_LANGUAGE, targetLanguage: LANGUAGE, contentType: 'detail'
    }, 5500);
    if (!response.ok || response.payload?.success !== true || typeof response.payload.translatedText !== 'string') {
      throw Object.assign(new Error('google_detail_failed'), { code: response.payload?.error?.code || `http_${response.status}` });
    }
    return response.payload.translatedText.trim();
  }

  async function invokeLocalHelperMock(request) {
    const session = await ensureHelperPaired();
    if (!session.port || !/^[A-Fa-f0-9]{32,}$/.test(session.token)) {
      return { status: 'not-configured', translatedText: null, provider: 'local-helper-mock', model: 'local-helper-mock-v1', networkUsed: false, message: '本地 Helper 尚未配对。' };
    }
    if (helperUnavailable) {
      return { status: 'unavailable', translatedText: null, provider: 'local-helper-mock', model: 'local-helper-mock-v1', networkUsed: false, message: '本地 Helper 未运行。' };
    }

    try {
      const response = await sendLocalHelperRequest(session.port, session.token, {
        apiVersion: 1, provider: 'mock', task: 'translate', text: request.sourceText, contentType: 'summary'
      });
      if (!response.ok || response.payload?.success !== true || typeof response.payload.translatedText !== 'string') {
        throw new Error(response.payload?.error?.code || `http_${response.status}`);
      }
      setHelperStatus('本地 Helper 已连接。');
      return { status: 'mock-success', translatedText: response.payload.translatedText, provider: 'local-helper-mock', model: 'local-helper-mock-v1', networkUsed: false };
    } catch (_) {
      helperUnavailable = true;
      setHelperStatus('本地 Helper 未运行；已停止重试并保留英文/测试缓存。');
      return { status: 'unavailable', translatedText: null, provider: 'local-helper-mock', model: 'local-helper-mock-v1', networkUsed: false };
    }
  }

  function sendLocalHelperRequest(port, token, payload) {
    return sendLocalHelperHttpRequest(port, token, '/v1/translate', 'POST', payload, payload?.provider === 'google-free' ? 5500 : 2500);
  }

  function sendLocalHelperHttpRequest(port, token, path, method, payload, timeoutMs = 2500, extraHeaders = {}) {
    return new Promise((resolve, reject) => {
      const bridge = window.electronBridge;
      if (!bridge || typeof bridge.sendMessageFromView !== 'function') {
        reject(new Error('electron_bridge_unavailable')); return;
      }
      const requestId = `${SCRIPT_KEY}:helper:${Date.now()}:${Math.random().toString(16).slice(2)}`;
      const cleanup = () => {
        clearTimeout(timeoutId);
        window.removeEventListener('message', onMessage, true);
      };
      const onMessage = (event) => {
        const data = event?.data;
        if (data?.type !== 'fetch-response' || String(data.requestId) !== requestId) return;
        cleanup();
        let responsePayload = null;
        try { responsePayload = JSON.parse(data.bodyJsonString || 'null'); } catch (_) {}
        const status = Number(data.status || data.statusCode || 0);
        resolve({ status, ok: status >= 200 && status < 300, payload: responsePayload });
      };
      const timeoutId = setTimeout(() => {
        cleanup(); reject(new Error('helper_timeout'));
      }, timeoutMs);
      window.addEventListener('message', onMessage, true);
      try {
        const message = {
          type: 'fetch', requestId,
          url: `http://127.0.0.1:${port}${path}`, method,
          headers: { ...extraHeaders }
        };
        if (token) message.headers['X-Codex-Translator-Token'] = token;
        if (payload !== undefined) {
          message.headers['Content-Type'] = 'application/json';
          message.body = JSON.stringify(payload);
        }
        bridge.sendMessageFromView(message);
      } catch (error) { cleanup(); reject(error); }
    });
  }

  async function discoverLocalHelper({ force = false } = {}) {
    const existing = readHelperSession();
    if (!force && existing.port && existing.token) return { success: true, ...existing, source: autoHelperSession.port ? 'auto' : 'manual' };
    if (discoveryInFlight) return discoveryInFlight;
    discoveryInFlight = (async () => {
      const origin = window.location.origin;
      if (origin !== 'app://-') throw Object.assign(new Error('discovery_origin_unavailable'), { code: 'discovery_origin_unavailable' });
      const headers = { Origin: origin };
      const challengeResponse = await sendLocalHelperHttpRequest(DISCOVERY_PORT, '', '/v1/discovery/challenge', 'GET', undefined, 2000, headers);
      const challenge = challengeResponse.payload?.challenge;
      if (!challengeResponse.ok || !/^[A-Fa-f0-9]{64}$/.test(challenge || '')) throw Object.assign(new Error('helper_not_running'), { code: 'helper_not_running' });
      const pairResponse = await sendLocalHelperHttpRequest(DISCOVERY_PORT, '', '/v1/discovery/pair', 'POST', { challenge }, 2000, headers);
      if (!pairResponse.ok || pairResponse.payload?.success !== true) throw Object.assign(new Error('discovery_pair_failed'), { code: 'discovery_pair_failed' });
      const session = saveAutoHelperSession(pairResponse.payload.currentPort, pairResponse.payload.sessionToken);
      if (!session.port || !session.token) throw Object.assign(new Error('invalid_discovery_response'), { code: 'invalid_discovery_response' });
      const statusResponse = await sendLocalHelperHttpRequest(session.port, session.token, '/v1/status', 'GET', undefined, 2000, headers);
      if (!statusResponse.ok || statusResponse.payload?.status !== 'ok') { clearAutoHelperSession(); throw Object.assign(new Error('helper_validation_failed'), { code: 'helper_validation_failed' }); }
      setHelperStatus('本地翻译服务：已连接');
      resetGoogleFailedAttempts();
      scheduleScan(document);
      return { success: true, ...session, source: 'auto' };
    })().catch((error) => {
      clearAutoHelperSession();
      setHelperStatus('本地翻译服务：未启动');
      throw error;
    }).finally(() => { discoveryInFlight = null; });
    return discoveryInFlight;
  }

  async function ensureHelperPaired({ forceDiscovery = false } = {}) {
    const existing = readHelperSession();
    if (!forceDiscovery && existing.port && existing.token && !helperUnavailable) return existing;
    if (!forceDiscovery && initialDiscoveryAttempted && !discoveryInFlight) return { port: 0, token: '' };
    try {
      const discovered = await discoverLocalHelper({ force: forceDiscovery });
      return { port: discovered.port, token: discovered.token };
    } catch (_) {
      const manual = readManualHelperSession();
      return manual.port && manual.token ? manual : { port: 0, token: '' };
    }
  }

  async function invokeDeepSeekCredential(method, payload) {
    const session = await ensureHelperPaired({ forceDiscovery: true });
    if (!session.port || !/^[A-Fa-f0-9]{32,}$/.test(session.token)) throw new Error('helper_not_paired');
    const suffix = method === 'GET' ? '/status' : '';
    const response = await sendLocalHelperHttpRequest(session.port, session.token, `/v1/credentials/deepseek${suffix}`, method, payload);
    if (!response.ok || response.payload?.success !== true) throw new Error(response.payload?.error?.code || `http_${response.status}`);
    return { success: true, configured: response.payload.configured === true };
  }

  async function invokeDeepSeekManual(sourceText, context = {}) {
    const session = await ensureHelperPaired({ forceDiscovery: context.kind === 'detail' });
    if (!session.port || !/^[A-Fa-f0-9]{32,}$/.test(session.token)) throw Object.assign(new Error('helper_not_paired'), { code: 'helper_not_paired' });
    const config = readProviderConfig();
    const model = config.providers.deepseek.model || 'deepseek-v4-flash';
    const response = await sendLocalHelperHttpRequest(session.port, session.token, '/v1/translate', 'POST', {
      apiVersion: 1, provider: 'deepseek', task: 'translate', text: sourceText,
      sourceLanguage: SOURCE_LANGUAGE, targetLanguage: LANGUAGE, model,
      contentType: context.kind === 'detail' ? 'detail' : 'summary'
    }, 16000);
    if (!response.ok || response.payload?.success !== true || typeof response.payload.translatedText !== 'string') {
      throw Object.assign(new Error('deepseek_failed'), { code: response.payload?.error?.code || `http_${response.status}` });
    }
    return { translatedText: response.payload.translatedText.trim(), model: response.payload.model || model };
  }

  async function testDeepSeekConnection() {
    const session = await ensureHelperPaired({ forceDiscovery: true });
    if (!session.port || !/^[A-Fa-f0-9]{32,}$/.test(session.token)) throw Object.assign(new Error('helper_not_paired'), { code: 'helper_not_paired' });
    const response = await sendLocalHelperHttpRequest(session.port, session.token, '/v1/providers/deepseek/test', 'POST', undefined, 16000);
    if (!response.ok || response.payload?.success !== true) throw Object.assign(new Error('deepseek_test_failed'), { code: response.payload?.error?.code || `http_${response.status}` });
    return true;
  }

  async function runHelperConnectionTest(button, statusNode) {
    button.disabled = true;
    statusNode.textContent = '正在检测本地 Helper…';
    let connected = false;
    try {
      const result = await invokeLocalHelperMock({ sourceText: 'Connection test', context: { kind: 'card', pluginId: 'connection-test' } });
      connected = Boolean(result.translatedText);
      if (connected) schedulePostPairCardScanOnce();
      return connected;
    } catch (_) { return false; }
    finally {
      button.disabled = false;
      setHelperStatus(connected ? '本地 Helper 已连接。' : '本地 Helper 未运行或配对信息无效。');
    }
  }

  window.__codexPluginTranslationProviders = Object.freeze({
    registry: PROVIDER_REGISTRY,
    getConfig: () => readProviderConfig(),
    saveConfig: (config) => saveProviderConfig(config),
    translate: (request) => invokeProvider('translation', request),
    polish: (request) => invokeProvider('polish', request),
    rescan: () => scheduleScan(document)
  });

  function sourceHash(text) {
    let hash = 0x811c9dc5;
    for (const char of String(text || '')) {
      hash ^= char.charCodeAt(0);
      hash = Math.imul(hash, 0x01000193);
    }
    return `fnv1a-${(hash >>> 0).toString(16).padStart(8, '0')}`;
  }

  const contentTypeFor = (context = {}) => context.contentType || (context.kind === 'detail' ? 'detail' : 'summary');

  function cacheRecordKey(text, context = {}) {
    return [
      context.pluginId || 'unknown-plugin', contentTypeFor(context), context.sourceLanguage || SOURCE_LANGUAGE, context.targetLanguage || LANGUAGE,
      context.provider || 'static-test', context.model || 'static-test-v1', sourceHash(text)
    ].join('|');
  }

  function legacyCacheRecordKey(text, context = {}) {
    const provider = context.provider || 'static-test';
    const model = context.model || 'static-test-v1';
    const languageParts = context.sourceLanguage ? [context.sourceLanguage, LANGUAGE] : [LANGUAGE];
    return [context.pluginId || 'unknown-plugin', context.kind || 'unknown', ...languageParts, provider, model, sourceHash(text)].join('|');
  }

  function helperRequestKey(text, context = {}) {
    return ['local-helper-mock', 'local-helper-mock-v1', context.kind || 'card', sourceHash(text)].join('|');
  }

  function googleRequestKey(text, context = {}) {
    return ['google-free', 'google-free-v1', context.kind || 'card', context.pluginId || 'unknown-plugin', SOURCE_LANGUAGE, LANGUAGE, sourceHash(text)].join('|');
  }

  function readCache() {
    try {
      const value = JSON.parse(localStorage.getItem(CACHE_KEY) || '{}');
      return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    } catch (_) { return {}; }
  }

  function idbRequest(request) {
    return new Promise((resolve, reject) => {
      request.addEventListener('success', () => resolve(request.result), { once: true });
      request.addEventListener('error', () => reject(request.error || new Error('indexeddb_request_failed')), { once: true });
    });
  }

  function idbTransactionComplete(transaction) {
    return new Promise((resolve, reject) => {
      transaction.addEventListener('complete', resolve, { once: true });
      transaction.addEventListener('abort', () => reject(transaction.error || new Error('indexeddb_transaction_aborted')), { once: true });
      transaction.addEventListener('error', () => reject(transaction.error || new Error('indexeddb_transaction_failed')), { once: true });
    });
  }

  function getTranslationDatabase() {
    if (translationDatabasePromise) return translationDatabasePromise;
    translationDatabasePromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(TRANSLATION_DB_NAME, TRANSLATION_DB_VERSION);
      let settled = false;
      request.addEventListener('upgradeneeded', () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(TRANSLATION_STORE_NAME)) database.createObjectStore(TRANSLATION_STORE_NAME, { keyPath: 'cacheKey' });
      });
      request.addEventListener('success', () => { settled = true; resolve(request.result); }, { once: true });
      request.addEventListener('error', () => { settled = true; translationDatabasePromise = null; reject(request.error || new Error('indexeddb_open_failed')); }, { once: true });
      request.addEventListener('blocked', () => {
        if (!settled) { settled = true; translationDatabasePromise = null; reject(new Error('indexeddb_open_blocked')); }
      }, { once: true });
    });
    return translationDatabasePromise;
  }

  function buildCacheRecord(text, translatedText, context = {}) {
    const normalizedContext = {
      ...context, contentType: contentTypeFor(context), sourceLanguage: context.sourceLanguage || SOURCE_LANGUAGE,
      targetLanguage: context.targetLanguage || LANGUAGE
    };
    return {
      cacheKey: cacheRecordKey(text, normalizedContext), pluginId: normalizedContext.pluginId || 'unknown-plugin',
      contentType: normalizedContext.contentType, provider: normalizedContext.provider || 'static-test', model: normalizedContext.model || 'static-test-v1',
      sourceLanguage: normalizedContext.sourceLanguage, targetLanguage: normalizedContext.targetLanguage,
      sourceHash: sourceHash(text), sourceText: text, translatedText, updatedAt: new Date().toISOString()
    };
  }

  function validCacheRecord(record, text, context = {}) {
    return record?.cacheKey === cacheRecordKey(text, context) && record?.sourceHash === sourceHash(text) && record?.sourceText === text &&
      record?.sourceLanguage === (context.sourceLanguage || SOURCE_LANGUAGE) && record?.targetLanguage === (context.targetLanguage || LANGUAGE) &&
      typeof record?.translatedText === 'string' && record.translatedText.length > 0;
  }

  async function readIndexedCacheRecord(text, context = {}) {
    const key = cacheRecordKey(text, context);
    if (runtimeTranslationCache.has(key)) return runtimeTranslationCache.get(key);
    const database = await getTranslationDatabase();
    const transaction = database.transaction(TRANSLATION_STORE_NAME, 'readonly');
    const record = await idbRequest(transaction.objectStore(TRANSLATION_STORE_NAME).get(key));
    await idbTransactionComplete(transaction);
    if (!validCacheRecord(record, text, context)) return null;
    runtimeTranslationCache.set(key, record);
    return record;
  }

  function readLegacyCacheRecord(text, context = {}) {
    const legacyContext = { ...context };
    if (legacyContext.kind === 'card' && ['google-free', 'deepseek'].includes(legacyContext.provider)) legacyContext.pluginId = 'shared-card';
    const cached = readCache()[legacyCacheRecordKey(text, legacyContext)];
    if (cached?.source_text !== text || cached?.source_hash !== sourceHash(text) || cached?.language !== LANGUAGE) return null;
    return buildCacheRecord(text, cached.translated_text, {
      ...context, provider: cached.provider || context.provider, model: cached.model || context.model,
      sourceLanguage: cached.source_language || context.sourceLanguage || SOURCE_LANGUAGE, targetLanguage: cached.language || LANGUAGE
    });
  }

  async function persistCacheRecord(record, allowRetry = false) {
    if (!record?.cacheKey) return false;
    runtimeTranslationCache.set(record.cacheKey, record);
    if (!allowRetry && cachePersistAttempted.has(record.cacheKey)) return false;
    cachePersistAttempted.add(record.cacheKey);
    try {
      const database = await getTranslationDatabase();
      const transaction = database.transaction(TRANSLATION_STORE_NAME, 'readwrite');
      transaction.objectStore(TRANSLATION_STORE_NAME).put(record);
      await idbTransactionComplete(transaction);
      return true;
    } catch (error) {
      console.debug(`[${SCRIPT_KEY}] cache=indexeddb persist=false error=${error?.name || error?.message || 'unknown'}`);
      return false;
    }
  }

  async function getCachedRecord(text, context = {}) {
    const key = cacheRecordKey(text, context);
    if (!cacheReadInFlight.has(key)) {
      cacheReadInFlight.set(key, (async () => {
        try {
          const indexed = await readIndexedCacheRecord(text, context);
          if (indexed) return indexed;
        } catch (error) { console.debug(`[${SCRIPT_KEY}] cache=indexeddb read=false error=${error?.name || error?.message || 'unknown'}`); }
        const legacy = readLegacyCacheRecord(text, context);
        if (legacy) void persistCacheRecord(legacy);
        return legacy;
      })().finally(() => cacheReadInFlight.delete(key)));
    }
    return cacheReadInFlight.get(key);
  }

  async function saveCachedTranslation(text, translatedText, context = {}) {
    if (!text || !translatedText) return { record: null, persisted: false };
    const record = buildCacheRecord(text, translatedText, context);
    const persisted = await persistCacheRecord(record);
    return { record, persisted };
  }

  function readMockCache() {
    try {
      const value = JSON.parse(localStorage.getItem(MOCK_CACHE_KEY) || '{}');
      return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    } catch (_) { return {}; }
  }

  function getMockCachedTranslation(text, context = {}) {
    const cacheContext = { ...context, pluginId: context.kind === 'card' ? 'shared-card' : context.pluginId, provider: 'local-helper-mock', model: 'local-helper-mock-v1' };
    const cached = readMockCache()[legacyCacheRecordKey(text, cacheContext)];
    return cached?.source_text === text && cached?.source_hash === sourceHash(text) && cached?.language === LANGUAGE
      ? cached.translated_text || null : null;
  }

  function saveMockCachedTranslation(text, translatedText, context = {}) {
    if (!text || !translatedText) return null;
    const cacheContext = { ...context, pluginId: context.kind === 'card' ? 'shared-card' : context.pluginId, provider: 'local-helper-mock', model: 'local-helper-mock-v1' };
    const cache = readMockCache();
    const key = legacyCacheRecordKey(text, cacheContext);
    cache[key] = {
      plugin_id: context.pluginId || 'unknown-plugin', context: context.kind || 'card',
      source_hash: sourceHash(text), source_text: text, translated_text: translatedText,
      language: LANGUAGE, updated_at: new Date().toISOString(),
      provider: 'local-helper-mock', model: 'local-helper-mock-v1', test_data: true
    };
    try { localStorage.setItem(MOCK_CACHE_KEY, JSON.stringify(cache)); } catch (_) {}
    return cache[key];
  }

  function googleCacheContext(context = {}) {
    return { ...context, kind: 'card', provider: 'google-free', model: 'google-free-v1', sourceLanguage: SOURCE_LANGUAGE, targetLanguage: LANGUAGE };
  }

  async function getGoogleCachedRecord(text, context = {}) {
    return getCachedRecord(text, googleCacheContext(context));
  }

  async function getGoogleCachedTranslation(text, context = {}) {
    return (await getGoogleCachedRecord(text, context))?.translatedText || null;
  }

  function saveGoogleCachedTranslation(text, translatedText, context = {}) {
    return saveCachedTranslation(text, translatedText, googleCacheContext(context));
  }

  function detailCacheContext(context = {}) {
    return { ...context, kind: 'detail', provider: 'google-free', model: 'google-free-v1', sourceLanguage: SOURCE_LANGUAGE };
  }

  function getGoogleDetailCachedRecord(text, context = {}) {
    return getCachedRecord(text, detailCacheContext(context));
  }

  async function getGoogleDetailCachedTranslation(text, context = {}) {
    return (await getGoogleDetailCachedRecord(text, context))?.translatedText || null;
  }

  function saveGoogleDetailCachedTranslation(text, translatedText, context = {}) {
    return saveCachedTranslation(text, translatedText, detailCacheContext(context));
  }

  function detailProviderLabel(record) {
    if (record?.provider === 'google-free' || record?.provider === 'google') return 'Google';
    if (record?.provider === 'deepseek') return 'DeepSeek';
    return null;
  }

  function deepSeekCacheContext(context = {}, model) {
    return { ...context, provider: 'deepseek', model, sourceLanguage: SOURCE_LANGUAGE, targetLanguage: LANGUAGE };
  }

  async function getDeepSeekCachedTranslation(text, context = {}, model) {
    return (await getCachedRecord(text, deepSeekCacheContext(context, model)))?.translatedText || null;
  }

  function saveDeepSeekCachedTranslation(text, translatedText, context = {}, model) {
    return saveCachedTranslation(text, translatedText, deepSeekCacheContext(context, model));
  }

  async function requestDeepSeekTranslation(text, context = {}) {
    const config = readProviderConfig();
    const model = config.providers.deepseek.model || 'deepseek-v4-flash';
    const cached = await getDeepSeekCachedTranslation(text, context, model);
    if (cached) return { translatedText: cached, model, cached: true };
    const key = ['deepseek', model, 'card', context.pluginId || 'unknown-plugin', SOURCE_LANGUAGE, LANGUAGE, sourceHash(text)].join('|');
    if (!deepSeekInFlight.has(key)) {
      deepSeekInFlight.set(key, invokeDeepSeekManual(text, context)
        .then(async (result) => {
          await saveDeepSeekCachedTranslation(text, result.translatedText, context, result.model);
          return { ...result, cached: false };
        })
        .finally(() => deepSeekInFlight.delete(key)));
    }
    return deepSeekInFlight.get(key);
  }

  function getStaticTranslation(text, context = {}) {
    if (context.kind === 'card') return STATIC_TRANSLATIONS.card[text] || null;
    if (context.kind === 'detail') return STATIC_TRANSLATIONS.detail[`${context.pluginId}|${text}`] || null;
    return null;
  }

  async function getCachedTranslation(text, context = {}) {
    const cacheContext = { ...context, provider: context.provider || 'static-test', model: context.model || 'static-test-v1' };
    const cached = await getCachedRecord(text, cacheContext);
    if (cached) return cached.translatedText;
    const staticTranslation = getStaticTranslation(text, context);
    if (!staticTranslation) return null;
    await saveCachedTranslation(text, staticTranslation, cacheContext);
    return staticTranslation;
  }

  function getDisplayMode() {
    try {
      const mode = localStorage.getItem(MODE_KEY) || 'english';
      return VALID_MODES.has(mode) ? mode : 'english';
    } catch (_) { return 'english'; }
  }

  function saveDisplayMode(mode) {
    if (!VALID_MODES.has(mode)) return;
    try { localStorage.setItem(MODE_KEY, mode); } catch (_) {}
  }

  function getDetailSource() {
    try {
      const provider = localStorage.getItem(DETAIL_SOURCE_KEY) || 'google-free';
      return VALID_DETAIL_SOURCES.has(provider) ? provider : 'google-free';
    } catch (_) { return 'google-free'; }
  }

  function saveDetailSource(provider) {
    if (!VALID_DETAIL_SOURCES.has(provider)) return;
    try { localStorage.setItem(DETAIL_SOURCE_KEY, provider); } catch (_) {}
  }

  function detectPluginMarket() {
    try { return Boolean(document.querySelector('#plugins-store-page-search, label[for="plugins-store-page-search"]')); }
    catch (_) { return false; }
  }

  function detectPluginDetail() {
    try {
      const description = document.querySelector('#plugin-description');
      const header = description?.closest('header');
      const title = header?.querySelector('h1');
      const root = header?.parentElement;
      if (!description || !header || !title || !root) return null;
      return { description, header, title, root, pluginName: normalizeText(title.textContent), pluginId: pluginSlug(title.textContent) };
    } catch (_) { return null; }
  }

  function isProtectedTechnicalContent(node, text) {
    try {
      if (!(node instanceof Element)) return true;
      if (node.closest('code, pre, kbd, samp, a, button, [role="button"], [contenteditable="true"]')) return true;
      if (node.querySelector?.('button, input, select, textarea')) return true;
      if (/^(?:https?:\/\/|www\.|mailto:|[a-z]+:\/\/)\S+$/i.test(text)) return true;
      if (/^(?:[A-Z]:\\|[.~]?\/)[\w.\\/-]+$/i.test(text)) return true;
      if (/^(?:npm|npx|pnpm|yarn|pip|cargo|git|curl|wget)\s+[-\w]/i.test(text)) return true;
      if (/^\s*[\[{].*[\]}]\s*$/.test(text) && /[:",]/.test(text)) return true;
      if (/^(?:--?[\w-]+|[A-Z][A-Z0-9_]{2,}|v?\d+(?:\.\d+){1,3})$/.test(text)) return true;
      return false;
    } catch (_) { return true; }
  }

  function classifyDetailNode(node, detail) {
    try {
      const tag = node?.tagName?.toLowerCase?.() || 'unknown';
      if (!(node instanceof Element) || !node.isConnected) return { accepted: false, tag, chars: 0, reason: 'not_connected' };
      if (!detail.root.contains(node) || (detail.header.contains(node) && node !== detail.description)) return { accepted: false, tag, chars: 0, reason: 'outside_detail_body' };
      if (node.closest(`[data-bilingual-ui="${SCRIPT_KEY}"]`)) return { accepted: false, tag, chars: 0, reason: 'bilingual_ui' };
      if (node.closest('nav, aside, footer, form, [role="navigation"], [role="toolbar"], [data-bilingual-detail-translation]')) return { accepted: false, tag, chars: 0, reason: 'excluded_ui_region' };
      const text = normalizeText(node.textContent);
      if (text.length < 4) return { accepted: false, tag, chars: text.length, reason: 'too_short' };
      if (isProtectedTechnicalContent(node, text)) return { accepted: false, tag, chars: text.length, reason: 'technical_only' };
      const latinChars = (text.match(/[A-Za-z]/g) || []).length;
      const hanChars = (text.match(/[\u3400-\u9fff]/g) || []).length;
      if (latinChars < 4) return { accepted: false, tag, chars: text.length, reason: hanChars > 0 ? 'already_chinese' : 'no_english' };
      if (hanChars > 0 && hanChars * 2 >= latinChars) return { accepted: false, tag, chars: text.length, reason: 'predominantly_chinese' };
      return { accepted: true, tag, chars: text.length, reason: '', text, latinChars, hanChars };
    } catch (_) { return { accepted: false, tag: 'unknown', chars: 0, reason: 'classification_error' }; }
  }

  function extractCompleteDetail(detail) {
    const blocks = []; const nodes = []; const entries = []; const diagnostics = []; const acceptedAncestors = [];
    try {
      const candidates = [detail.description, ...detail.root.querySelectorAll('h2, h3, h4, p, li, div, span')];
      const seenText = new Set();
      for (const node of new Set(candidates)) {
        if (acceptedAncestors.some((ancestor) => ancestor !== node && ancestor.contains(node))) continue;
        const tag = node.tagName?.toLowerCase();
        if (['div', 'span'].includes(tag) && node.children.length > 0) continue;
        const result = classifyDetailNode(node, detail);
        diagnostics.push({ tag: result.tag, chars: result.chars, accepted: result.accepted, reason: result.reason || 'accepted' });
        if (!result.accepted || seenText.has(result.text)) continue;
        blocks.push(result.text); nodes.push(node); entries.push({ node, text: result.text, chars: result.chars, tag: result.tag }); seenText.add(result.text); acceptedAncestors.push(node);
      }
    } catch (_) {}
    const text = blocks.join('\n\n').trim();
    const tooLarge = text.length > MAX_DETAIL_SOURCE_CHARS;
    return { text, nodes, entries, blocks, diagnostics, chars: text.length, accepted: text.length >= 4 && !tooLarge, reason: tooLarge ? 'detail_too_large' : text.length < 4 ? 'no_english_detail' : '' };
  }

  function cardContext(description) {
    const card = description.closest('[role="button"]');
    const pluginName = card?.querySelector('img[alt]')?.getAttribute('alt') || '';
    return { card, pluginId: pluginSlug(pluginName), kind: 'card' };
  }

  async function renderCardTranslation(description) {
    try {
      if (!(description instanceof Element) || !description.isConnected) return;
      const text = normalizeText(description.textContent);
      const context = cardContext(description);
      if (!context.card || !context.card.querySelector('button') || !/[A-Za-z]/.test(text)) return;
      const selection = providerSelection('card');
      if (description.getAttribute('data-bilingual-card-state') === 'cache-check') return;
      description.setAttribute('data-bilingual-card-state', 'cache-check');
      const translatedText = selection.providerId === 'local-helper-mock'
        ? getMockCachedTranslation(text, context)
        : selection.providerId === 'google-free' ? await getGoogleCachedTranslation(text, context)
        : selection.providerId === 'static-test' ? await getCachedTranslation(text, context) : null;
      if (!translatedText && selection.providerId === 'local-helper-mock') {
        requestHelperCardTranslation(description, text, context);
        return;
      }
      if (!translatedText && selection.providerId === 'google-free') {
        requestGoogleCardTranslation(description, text, context);
        return;
      }
      if (!translatedText) { description.removeAttribute('data-bilingual-card-state'); return; }
      const existing = description.nextElementSibling;
      if (existing?.getAttribute('data-bilingual-card-translation') === SCRIPT_KEY) {
        description.setAttribute('data-bilingual-card-state', 'cached'); return;
      }
      const translation = document.createElement('div');
      translation.setAttribute('data-bilingual-card-translation', SCRIPT_KEY);
      translation.setAttribute('data-bilingual-ui', SCRIPT_KEY);
      translation.setAttribute('lang', LANGUAGE);
      const translationText = document.createElement('span');
      translationText.setAttribute('data-bilingual-translation-text', 'true');
      translationText.textContent = translatedText;
      const sourceLabel = document.createElement('span');
      sourceLabel.setAttribute('data-bilingual-translation-source', 'true');
      sourceLabel.textContent = selection.providerId === 'google-free' ? 'Google Free' : selection.providerId === 'local-helper-mock' ? 'Mock' : 'Static';
      Object.assign(sourceLabel.style, { marginLeft: '0.45em', opacity: '0.62', fontSize: '0.88em' });
      const deepSeekButton = document.createElement('button');
      deepSeekButton.type = 'button'; deepSeekButton.textContent = 'DeepSeek 重译';
      deepSeekButton.setAttribute('data-bilingual-deepseek-retranslate', 'true');
      Object.assign(deepSeekButton.style, { marginLeft: '0.55em', padding: '0', border: '0', background: 'transparent', color: 'inherit', opacity: '0.68', cursor: 'pointer', font: 'inherit', fontSize: '0.88em' });
      deepSeekButton.addEventListener('click', async (event) => {
        event.preventDefault(); event.stopPropagation();
        deepSeekButton.disabled = true; deepSeekButton.textContent = '重译中…';
        try {
          const result = await requestDeepSeekTranslation(text, context);
          translationText.textContent = result.translatedText;
          sourceLabel.textContent = 'DeepSeek';
          deepSeekButton.textContent = 'DeepSeek 重译';
        } catch (error) {
          const messages = {
            credential_not_configured: '未配置 DeepSeek Key', invalid_api_key: 'DeepSeek Key 无效', insufficient_balance: 'DeepSeek 余额不足',
            rate_limited: 'DeepSeek 请求过于频繁', timeout: 'DeepSeek 翻译超时', network_error: 'DeepSeek 网络错误', service_error: 'DeepSeek 服务暂不可用', helper_not_paired: '本地 Helper 尚未配对'
          };
          deepSeekButton.textContent = messages[error?.code] || 'DeepSeek 翻译失败';
        } finally { deepSeekButton.disabled = false; }
      });
      translation.append(translationText, sourceLabel, deepSeekButton);
      Object.assign(translation.style, { display: 'block', marginTop: '0.25em', font: 'inherit', fontSize: '0.95em', lineHeight: 'inherit', color: 'inherit', opacity: '0.78' });
      description.insertAdjacentElement('afterend', translation);
      description.setAttribute('data-bilingual-card-state', selection.providerId === 'static-test' ? 'translated' : 'cached');
    } catch (error) { console.debug(`[${SCRIPT_KEY}] Card skipped safely.`, error); }
  }

  async function requestHelperCardTranslation(description, text, context) {
    try {
      const key = helperRequestKey(text, context);
      if (helperCompletedKeys.has(key)) { description.setAttribute('data-bilingual-card-state', 'cached'); return; }
      if (helperInFlight.has(key)) {
        description.setAttribute('data-bilingual-card-state', 'pending');
        if (!helperWaitingNodes.has(key)) helperWaitingNodes.set(key, new Set());
        helperWaitingNodes.get(key).add(description);
        return;
      }
      if (helperUnavailable) { description.setAttribute('data-bilingual-card-state', 'failed'); return; }
      if (helperUniqueRequestKeys.has(key) || helperUniqueRequestKeys.size >= MAX_HELPER_CARD_REQUESTS) {
        description.setAttribute('data-bilingual-card-state', helperUniqueRequestKeys.has(key) ? 'failed' : 'limit');
        return;
      }
      const session = await ensureHelperPaired();
      if (!session.port || !session.token) { setHelperStatus('本地 Helper 尚未配对。'); return; }
      if (helperInFlight.has(key)) {
        description.setAttribute('data-bilingual-card-state', 'pending');
        if (!helperWaitingNodes.has(key)) helperWaitingNodes.set(key, new Set());
        helperWaitingNodes.get(key).add(description);
        return;
      }
      if (helperUniqueRequestKeys.has(key) || helperUniqueRequestKeys.size >= MAX_HELPER_CARD_REQUESTS) return;
      helperUniqueRequestKeys.add(key);
      description.setAttribute('data-bilingual-card-state', 'pending');
      helperWaitingNodes.set(key, new Set([description]));
      const pending = invokeProvider('translation', { sourceText: text, context })
        .then((result) => {
          if (result?.translatedText) {
            helperCompletedKeys.add(key);
            saveMockCachedTranslation(text, result.translatedText, context);
            for (const waiting of helperWaitingNodes.get(key) || []) {
              if (waiting.isConnected) renderCardTranslation(waiting);
            }
          } else {
            for (const waiting of helperWaitingNodes.get(key) || []) {
              if (waiting.isConnected) waiting.setAttribute('data-bilingual-card-state', 'failed');
            }
          }
        })
        .catch(() => {
          googleFailedKeys.add(task.key);
          helperUnavailable = true;
          for (const waiting of helperWaitingNodes.get(key) || []) {
            if (waiting.isConnected) waiting.setAttribute('data-bilingual-card-state', 'failed');
          }
          setHelperStatus('本地 Helper 未运行；已停止重试并保留英文/测试缓存。');
        })
        .finally(() => { helperInFlight.delete(key); helperWaitingNodes.delete(key); });
      helperInFlight.set(key, pending);
    } catch (_) { helperUnavailable = true; }
  }

  async function requestGoogleCardTranslation(description, text, context) {
    try {
      const key = googleRequestKey(text, context);
      if (await getGoogleCachedTranslation(text, context)) {
        googleCompletedKeys.add(key); description.setAttribute('data-bilingual-card-state', 'cached'); return;
      }
      if (googleCompletedKeys.has(key)) { description.setAttribute('data-bilingual-card-state', 'cached'); return; }
      if (googleInFlight.has(key) || googleQueuedKeys.has(key)) {
        description.setAttribute('data-bilingual-card-state', googleInFlight.has(key) ? 'pending' : 'queued');
        if (!googleWaitingNodes.has(key)) googleWaitingNodes.set(key, new Set());
        googleWaitingNodes.get(key).add(description);
        return;
      }
      if (googleUniqueRequestKeys.has(key)) { description.setAttribute('data-bilingual-card-state', 'failed'); return; }
      const session = await ensureHelperPaired();
      if (!session.port || !session.token) { setHelperStatus('本地 Helper 尚未配对。'); return; }
      if (googleCompletedKeys.has(key)) { description.setAttribute('data-bilingual-card-state', 'cached'); return; }
      if (googleInFlight.has(key) || googleQueuedKeys.has(key)) {
        description.setAttribute('data-bilingual-card-state', googleInFlight.has(key) ? 'pending' : 'queued');
        if (!googleWaitingNodes.has(key)) googleWaitingNodes.set(key, new Set());
        googleWaitingNodes.get(key).add(description);
        return;
      }
      if (googleUniqueRequestKeys.has(key)) { description.setAttribute('data-bilingual-card-state', 'failed'); return; }
      googleUniqueRequestKeys.add(key);
      googleQueuedKeys.add(key);
      description.setAttribute('data-bilingual-card-state', 'queued');
      googleWaitingNodes.set(key, new Set([description]));
      googleQueue.push({ key, text, context });
      scheduleGooglePump();
    } catch (_) { description.setAttribute('data-bilingual-card-state', 'failed'); }
  }

  function scheduleGooglePump(delayMs = 0) {
    if (stopped || googlePumpScheduled) return;
    googlePumpScheduled = true;
    const run = () => { googlePumpScheduled = false; pumpGoogleQueue(); };
    if (delayMs > 0) setTimeout(run, delayMs); else queueMicrotask(run);
  }

  function pumpGoogleQueue() {
    if (stopped) return;
    while (googleActiveRequests < GOOGLE_MAX_CONCURRENCY && googleQueue.length > 0) {
      const task = googleQueue.shift();
      googleQueuedKeys.delete(task.key);
      googleActiveRequests += 1;
      for (const waiting of googleWaitingNodes.get(task.key) || []) if (waiting.isConnected) waiting.setAttribute('data-bilingual-card-state', 'pending');
      const pending = invokeProvider('translation', { sourceText: task.text, context: task.context })
        .then(async (result) => {
          if (!result?.translatedText) throw new Error('google_empty_translation');
          googleCompletedKeys.add(task.key);
          const saved = await saveGoogleCachedTranslation(task.text, result.translatedText, task.context);
          if (!saved.persisted) for (const waiting of googleWaitingNodes.get(task.key) || []) waiting.setAttribute?.('data-bilingual-cache-persist', 'failed');
          for (const waiting of googleWaitingNodes.get(task.key) || []) if (waiting.isConnected) renderCardTranslation(waiting);
        })
        .catch(() => {
          for (const waiting of googleWaitingNodes.get(task.key) || []) if (waiting.isConnected) waiting.setAttribute('data-bilingual-card-state', 'failed');
          setHelperStatus('部分 Google 简介翻译失败；队列将继续处理其他条目。');
        })
        .finally(() => {
          googleActiveRequests -= 1;
          googleInFlight.delete(task.key);
          googleWaitingNodes.delete(task.key);
          if (googleQueue.length > 0) scheduleGooglePump(GOOGLE_REQUEST_GAP_MS);
        });
      googleInFlight.set(task.key, pending);
    }
  }

  function schedulePostPairCardScanOnce() {
    if (stopped || helperPostPairScanScheduled || helperPostPairScanCompleted) return;
    const providerId = providerSelection('card').providerId;
    if (!detectPluginMarket() || !['local-helper-mock', 'google-free'].includes(providerId)) return;
    helperPostPairScanScheduled = true;
    requestAnimationFrame(() => {
      helperPostPairScanScheduled = false;
      if (stopped || helperPostPairScanCompleted) return;
      helperPostPairScanCompleted = true;
      try {
        for (const container of document.querySelectorAll('.text-codex-description')) {
          for (const candidate of container.children || []) {
            if (providerId === 'local-helper-mock' && helperUniqueRequestKeys.size >= MAX_HELPER_CARD_REQUESTS) return;
            if (candidate.children.length === 0) renderCardTranslation(candidate);
          }
        }
      } catch (error) { console.debug(`[${SCRIPT_KEY}] Post-pair card scan skipped safely.`, error); }
    });
  }

  function refreshCardTranslations() {
    try {
      for (const node of document.querySelectorAll(`[data-bilingual-card-translation="${SCRIPT_KEY}"]`)) node.remove();
      for (const node of document.querySelectorAll('[data-bilingual-card-state]')) node.removeAttribute('data-bilingual-card-state');
      scheduleScan(document);
    } catch (_) {}
  }

  function resetGoogleFailedAttempts() {
    for (const key of googleFailedKeys) googleUniqueRequestKeys.delete(key);
    googleFailedKeys.clear();
  }

  function settingsField(labelText, control) {
    const label = document.createElement('label');
    Object.assign(label.style, { display: 'grid', gap: '0.25rem', minWidth: '12rem', flex: '1 1 14rem' });
    const text = document.createElement('span');
    text.textContent = labelText; text.style.opacity = '0.72';
    label.append(text, control);
    return label;
  }

  function settingsControl(tag = 'input') {
    const control = document.createElement(tag);
    Object.assign(control.style, {
      width: '100%', boxSizing: 'border-box', font: 'inherit', color: 'inherit', background: 'transparent',
      border: '1px solid color-mix(in srgb, currentColor 22%, transparent)', borderRadius: '0.5rem', padding: '0.38rem 0.5rem'
    });
    return control;
  }

  function providerSelect(value) {
    const select = settingsControl('select');
    for (const provider of Object.values(PROVIDER_REGISTRY)) {
      const option = document.createElement('option');
      option.value = provider.id; option.textContent = provider.label; option.selected = provider.id === value;
      select.appendChild(option);
    }
    return select;
  }

  function renderTranslationSettings() {
    if (!detectPluginMarket()) return;
    try {
      if (document.querySelector(`[data-bilingual-provider-settings="${SCRIPT_KEY}"]`)) return;
      const search = document.querySelector('#plugins-store-page-search');
      const sticky = search?.parentElement?.parentElement?.parentElement;
      if (!search || !sticky) return;

      let config = readProviderConfig();
      const details = document.createElement('details');
      details.setAttribute('data-bilingual-provider-settings', SCRIPT_KEY);
      details.setAttribute('data-bilingual-ui', SCRIPT_KEY);
      Object.assign(details.style, {
        margin: '0 auto', width: 'calc(100% - 2 * var(--padding-panel, 1rem))',
        maxWidth: 'var(--thread-content-max-width)', border: '1px solid color-mix(in srgb, currentColor 16%, transparent)',
        borderRadius: '0.75rem', padding: '0.55rem 0.7rem', color: 'inherit', fontSize: '0.9rem'
      });
      const summary = document.createElement('summary');
      summary.textContent = '翻译设置';
      summary.style.cursor = 'pointer';
      details.appendChild(summary);

      const body = document.createElement('div');
      Object.assign(body.style, { display: 'grid', gap: '0.75rem', paddingTop: '0.75rem' });
      const defaultPanel = document.createElement('fieldset');
      Object.assign(defaultPanel.style, { margin: '0', border: '1px solid color-mix(in srgb, currentColor 14%, transparent)', borderRadius: '0.65rem', padding: '0.7rem' });
      const defaultLegend = document.createElement('legend'); defaultLegend.textContent = '默认翻译'; defaultPanel.appendChild(defaultLegend);
      const defaultValue = document.createElement('div'); defaultValue.textContent = 'Google Free';
      const defaultNote = document.createElement('div'); defaultNote.textContent = '免费，无需 API Key'; defaultNote.style.opacity = '0.7';
      defaultPanel.append(defaultValue, defaultNote);
      body.appendChild(defaultPanel);

      const routingRow = document.createElement('div');
      Object.assign(routingRow.style, { display: 'flex', flexWrap: 'wrap', gap: '0.65rem', paddingTop: '0.55rem' });
      const cardSelect = providerSelect(config.routing.card);
      const detailSelect = providerSelect(config.routing.detail);
      const polishSelect = providerSelect(config.routing.polish);
      routingRow.append(
        settingsField('默认简介翻译', cardSelect),
        settingsField('默认详情翻译', detailSelect),
        settingsField('AI 润色', polishSelect)
      );

      const helperPanel = document.createElement('fieldset');
      helperPanel.setAttribute('data-local-helper-settings', 'true');
      Object.assign(helperPanel.style, { margin: '0', border: '1px solid color-mix(in srgb, currentColor 14%, transparent)', borderRadius: '0.65rem', padding: '0.7rem' });
      const helperLegend = document.createElement('legend'); helperLegend.textContent = '本地翻译服务'; helperPanel.appendChild(helperLegend);
      const helperStatus = document.createElement('div');
      helperStatus.setAttribute('data-local-helper-status', SCRIPT_KEY); helperStatus.style.opacity = '0.72';
      const activeSession = readHelperSession();
      helperStatus.textContent = activeSession.port && activeSession.token ? '本地翻译服务：已连接' : '本地翻译服务：未启动';
      const helperDownload = document.createElement('div');
      helperDownload.setAttribute('data-local-helper-download', SCRIPT_KEY);
      Object.assign(helperDownload.style, { display: activeSession.port && activeSession.token ? 'none' : 'grid', gap: '0.3rem', paddingTop: '0.45rem' });
      const helperDownloadNote = document.createElement('div'); helperDownloadNote.textContent = '请下载并运行 Windows Helper。'; helperDownloadNote.style.opacity = '0.78';
      const helperDownloadLink = document.createElement('a'); helperDownloadLink.textContent = '下载 Helper'; helperDownloadLink.href = HELPER_RELEASES_URL; helperDownloadLink.target = '_blank'; helperDownloadLink.rel = 'noopener noreferrer';
      helperDownload.append(helperDownloadNote, helperDownloadLink);
      const reconnectButton = detailButton('重新连接', 'helper-reconnect');
      const advanced = document.createElement('details');
      const advancedSummary = document.createElement('summary'); advancedSummary.textContent = '高级 / 调试'; advancedSummary.style.cursor = 'pointer';
      advanced.appendChild(advancedSummary);
      const helperRow = document.createElement('div');
      Object.assign(helperRow.style, { display: 'flex', flexWrap: 'wrap', gap: '0.65rem', alignItems: 'end', paddingTop: '0.55rem' });
      const helperSession = readManualHelperSession();
      const helperPort = settingsControl(); helperPort.type = 'number'; helperPort.min = '49152'; helperPort.max = '65535'; helperPort.value = helperSession.port ? String(helperSession.port) : ''; helperPort.placeholder = '启动窗口中的端口';
      const helperToken = settingsControl(); helperToken.type = 'password'; helperToken.autocomplete = 'off'; helperToken.value = helperSession.token; helperToken.placeholder = '启动窗口中只显示一次的 Token';
      const helperTest = detailButton('测试连接', 'helper-test');
      helperRow.append(settingsField('随机高位端口', helperPort), settingsField('Session Token', helperToken), helperTest);
      advanced.appendChild(helperRow);
      helperPanel.append(helperStatus, helperDownload, reconnectButton, advanced);
      body.appendChild(helperPanel);

      const deepseekPanel = document.createElement('fieldset');
      deepseekPanel.setAttribute('data-deepseek-settings', 'true');
      Object.assign(deepseekPanel.style, { margin: '0', border: '1px solid color-mix(in srgb, currentColor 14%, transparent)', borderRadius: '0.65rem', padding: '0.7rem' });
      const legend = document.createElement('legend'); legend.textContent = 'DeepSeek'; deepseekPanel.appendChild(legend);
      const deepseekRow = document.createElement('div');
      Object.assign(deepseekRow.style, { display: 'flex', flexWrap: 'wrap', gap: '0.65rem' });

      const enabled = document.createElement('input'); enabled.type = 'checkbox'; enabled.checked = Boolean(config.providers.deepseek.enabled);
      const enabledLabel = document.createElement('label'); enabledLabel.style.alignSelf = 'end'; enabledLabel.append(enabled, document.createTextNode(' 启用 DeepSeek 翻译'));
      const enabledNote = document.createElement('div'); enabledNote.textContent = '可选功能，不启用也不影响 Google 免费翻译。'; enabledNote.style.opacity = '0.7';
      const credentialInput = settingsControl(); credentialInput.type = 'password'; credentialInput.autocomplete = 'new-password'; credentialInput.value = ''; credentialInput.placeholder = '输入后仅发送给本地 Helper';
      const credentialSave = detailButton('保存', 'deepseek-credential-save');
      const credentialDelete = detailButton('删除', 'deepseek-credential-delete');
      const credentialTest = detailButton('测试连接', 'deepseek-credential-test');
      const baseUrl = settingsControl(); baseUrl.value = config.providers.deepseek.baseUrl;
      const model = settingsControl('select');
      for (const item of PROVIDER_REGISTRY.deepseek.models) {
        const option = document.createElement('option'); option.value = item.id; option.textContent = item.label; option.selected = item.id === config.providers.deepseek.model; model.appendChild(option);
      }
      const thinking = settingsControl('select');
      for (const [id, label] of [['non-thinking', 'Non-Thinking'], ['thinking', 'Thinking']]) {
        const option = document.createElement('option'); option.value = id; option.textContent = label; option.selected = id === config.providers.deepseek.thinkingMode; thinking.appendChild(option);
      }
      const temperature = settingsControl(); temperature.type = 'number'; temperature.step = '0.1'; temperature.min = '0'; temperature.max = '2'; temperature.value = String(config.providers.deepseek.temperature);
      const timeout = settingsControl(); timeout.type = 'number'; timeout.min = '1000'; timeout.step = '1000'; timeout.value = String(config.providers.deepseek.timeoutMs);
      const batchSize = settingsControl(); batchSize.type = 'number'; batchSize.min = '1'; batchSize.max = '200'; batchSize.value = String(config.providers.deepseek.batchSize);
      deepseekRow.append(enabledLabel, settingsField('DeepSeek API Key', credentialInput), credentialSave, credentialDelete, credentialTest, settingsField('DeepSeek 模型', model));
      deepseekPanel.append(deepseekRow, enabledNote);

      const promptRow = document.createElement('div');
      Object.assign(promptRow.style, { display: 'flex', flexWrap: 'wrap', gap: '0.65rem', marginTop: '0.65rem' });
      const translationPrompt = settingsControl('textarea'); translationPrompt.rows = 4; translationPrompt.value = config.providers.deepseek.translationPrompt;
      const polishPrompt = settingsControl('textarea'); polishPrompt.rows = 4; polishPrompt.value = config.providers.deepseek.polishPrompt;
      promptRow.append(settingsField('Translation prompt', translationPrompt), settingsField('Polish prompt', polishPrompt));
      const deepseekAdvanced = document.createElement('details');
      deepseekAdvanced.style.marginTop = '0.65rem';
      const deepseekAdvancedSummary = document.createElement('summary'); deepseekAdvancedSummary.textContent = '高级参数'; deepseekAdvancedSummary.style.cursor = 'pointer';
      const technicalRow = document.createElement('div');
      Object.assign(technicalRow.style, { display: 'flex', flexWrap: 'wrap', gap: '0.65rem', paddingTop: '0.55rem' });
      technicalRow.append(settingsField('Base URL', baseUrl), settingsField('模式', thinking), settingsField('Temperature', temperature), settingsField('Timeout（ms）', timeout), settingsField('Batch size', batchSize));
      deepseekAdvanced.append(deepseekAdvancedSummary, technicalRow, promptRow);
      const status = document.createElement('div'); status.setAttribute('data-deepseek-status', 'true'); status.style.marginTop = '0.55rem';
      deepseekPanel.appendChild(status);
      body.appendChild(deepseekPanel);

      const debugProviderPanel = document.createElement('div');
      Object.assign(debugProviderPanel.style, { paddingTop: '0.55rem', display: 'grid', gap: '0.55rem' });
      const debugProviderTitle = document.createElement('div'); debugProviderTitle.textContent = '翻译来源 / Mock 调试'; debugProviderTitle.style.opacity = '0.72';
      debugProviderPanel.append(debugProviderTitle, routingRow);
      advanced.append(debugProviderPanel, deepseekAdvanced);
      const note = document.createElement('div');
      note.textContent = 'Google Free 自动翻译；DeepSeek 仅在用户手动点击重译时调用。';
      note.style.opacity = '0.7'; body.appendChild(note);
      details.appendChild(body);

      const sync = () => {
        config = readProviderConfig();
        config.routing = { card: cardSelect.value, detail: detailSelect.value, polish: polishSelect.value };
        config.providers.deepseek = {
          ...config.providers.deepseek, enabled: enabled.checked, apiKeyRef: '', baseUrl: baseUrl.value.trim(),
          model: model.value, thinkingMode: thinking.value, temperature: Number(temperature.value),
          timeoutMs: Number(timeout.value), batchSize: Number(batchSize.value),
          translationPrompt: translationPrompt.value, polishPrompt: polishPrompt.value
        };
        saveProviderConfig(config);
        helperPanel.hidden = false;
        deepseekPanel.hidden = false;
      };
      for (const control of [cardSelect, detailSelect, polishSelect, enabled, baseUrl, model, thinking, temperature, timeout, batchSize, translationPrompt, polishPrompt]) {
        control.addEventListener('change', sync);
      }
      const setCredentialBusy = (busy) => {
        credentialSave.disabled = busy; credentialDelete.disabled = busy; credentialTest.disabled = busy;
      };
      const checkCredential = async (successMessage = '') => {
        setCredentialBusy(true);
        try {
          const result = await invokeDeepSeekCredential('GET');
          status.textContent = result.configured ? (successMessage || 'DeepSeek：已配置') : 'DeepSeek：未配置';
          return result.configured;
        } catch (_) {
          status.textContent = 'Helper 无法读取凭据。'; return false;
        } finally { setCredentialBusy(false); }
      };
      credentialSave.addEventListener('click', async () => {
        let apiKey = credentialInput.value;
        credentialInput.value = '';
        if (!apiKey.trim()) { status.textContent = '请输入 DeepSeek API Key。'; apiKey = ''; return; }
        setCredentialBusy(true);
        try {
          await invokeDeepSeekCredential('PUT', { apiKey });
          status.textContent = 'DeepSeek：保存成功（已配置）';
        } catch (_) { status.textContent = 'DeepSeek 凭据保存失败。'; }
        finally { apiKey = ''; credentialInput.value = ''; setCredentialBusy(false); }
      });
      credentialDelete.addEventListener('click', async () => {
        credentialInput.value = ''; setCredentialBusy(true);
        try { await invokeDeepSeekCredential('DELETE'); status.textContent = 'DeepSeek：删除成功（未配置）'; }
        catch (_) { status.textContent = 'DeepSeek 凭据删除失败。'; }
        finally { setCredentialBusy(false); }
      });
      credentialTest.addEventListener('click', async () => {
        setCredentialBusy(true); status.textContent = '正在测试 DeepSeek 连接…';
        try { await testDeepSeekConnection(); status.textContent = 'DeepSeek 连接成功'; }
        catch (error) {
          const messages = {
            credential_not_configured: 'DeepSeek：未配置 Key', invalid_api_key: 'DeepSeek：Key 无效', insufficient_balance: 'DeepSeek：余额或额度不足',
            rate_limited: 'DeepSeek：请求过于频繁', timeout: 'DeepSeek：连接超时', network_error: 'DeepSeek：网络错误', service_error: 'DeepSeek：服务端错误', helper_not_paired: '本地 Helper 尚未配对'
          };
          status.textContent = messages[error?.code] || 'DeepSeek 连接测试失败';
        } finally { setCredentialBusy(false); }
      });
      cardSelect.addEventListener('change', () => {
        if (cardSelect.value === 'google-free') resetGoogleFailedAttempts();
        refreshCardTranslations();
      });
      const updateHelperSession = () => {
        saveHelperSession(helperPort.value, helperToken.value);
        helperStatus.textContent = '配对信息仅保存在本次窗口；尚未检测。';
      };
      helperPort.addEventListener('change', updateHelperSession);
      helperToken.addEventListener('change', updateHelperSession);
      helperTest.addEventListener('click', async () => {
        updateHelperSession();
        helperUnavailable = false;
        await runHelperConnectionTest(helperTest, helperStatus);
      });
      reconnectButton.addEventListener('click', async () => {
        reconnectButton.disabled = true; helperStatus.textContent = '本地翻译服务：正在连接…';
        helperUnavailable = false;
        try { await discoverLocalHelper({ force: true }); }
        catch (_) { setHelperStatus('本地翻译服务：连接失败'); }
        finally { reconnectButton.disabled = false; }
      });
      sync();
      void checkCredential();
      sticky.insertAdjacentElement('afterend', details);
    } catch (error) { console.debug(`[${SCRIPT_KEY}] Provider settings skipped safely.`, error); }
  }

  function processPluginCards(root = document) {
    if (!detectPluginMarket()) return;
    try {
      renderTranslationSettings();
      const containers = [];
      if (root instanceof Element && root.matches('.text-codex-description')) containers.push(root);
      for (const container of root.querySelectorAll?.('.text-codex-description') || []) containers.push(container);
      for (const container of new Set(containers)) {
        for (const candidate of container.children || []) {
          if (candidate.children.length === 0) renderCardTranslation(candidate);
        }
      }
    } catch (error) { console.debug(`[${SCRIPT_KEY}] Card scan skipped safely.`, error); }
  }

  function detailButton(label, action, selected = false) {
    const button = document.createElement('button');
    button.type = 'button'; button.textContent = label;
    button.setAttribute('data-bilingual-action', action);
    Object.assign(button.style, {
      font: 'inherit', color: 'inherit', background: selected ? 'color-mix(in srgb, currentColor 12%, transparent)' : 'transparent',
      border: '1px solid color-mix(in srgb, currentColor 24%, transparent)', borderRadius: '0.5rem',
      padding: '0.3rem 0.55rem', cursor: 'pointer'
    });
    return button;
  }

  function detailModel(provider) {
    return provider === 'deepseek' ? (readProviderConfig().providers.deepseek.model || 'deepseek-v4-flash') : 'google-free-v1';
  }

  function detailCacheContextFor(detail, provider) {
    return { kind: 'detail', contentType: 'detail', pluginId: detail.pluginId, provider, model: detailModel(provider), sourceLanguage: SOURCE_LANGUAGE, targetLanguage: LANGUAGE };
  }

  function applyDisplayMode(detail, mode) {
    if (!VALID_MODES.has(mode)) return;
    try {
      const translation = detail.root.querySelector(`[data-bilingual-detail-translation="${SCRIPT_KEY}"]`);
      const hasTranslation = Boolean(translation?.textContent);
      for (const source of detail.root.querySelectorAll('[data-bilingual-detail-source="true"]')) source.hidden = mode === 'chinese' && hasTranslation;
      if (translation) translation.hidden = mode === 'english' || !hasTranslation;
      const controls = detail.root.querySelector(`[data-bilingual-detail-controls="${SCRIPT_KEY}"]`);
      for (const button of controls?.querySelectorAll('[data-bilingual-mode]') || []) {
        const selected = button.getAttribute('data-bilingual-mode') === mode;
        button.setAttribute('aria-pressed', String(selected));
        button.style.background = selected ? 'color-mix(in srgb, currentColor 12%, transparent)' : 'transparent';
      }
    } catch (error) { console.debug(`[${SCRIPT_KEY}] Display mode skipped safely.`, error); }
  }

  function findCompleteDetailAnchor(detail, extraction) {
    const bodyEntries = extraction.entries.filter((entry) => !detail.header.contains(entry.node));
    const candidates = bodyEntries.length > 0 ? bodyEntries : extraction.entries;
    if (candidates.length === 0) return detail.description || null;
    return candidates.reduce((best, current) => current.chars > best.chars ? current : best).node;
  }

  function detailAnchorDiagnostic(detail, anchor) {
    try {
      const media = Array.from(detail.root.querySelectorAll('img, picture, video, iframe')).filter((node) => !node.closest?.(`[data-bilingual-ui="${SCRIPT_KEY}"]`));
      const mediaBeforeAnchor = media.filter((node) => Boolean(anchor.compareDocumentPosition?.(node) & 2)).length;
      const safeId = String(anchor.id || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 64);
      const safeClasses = Array.from(anchor.classList || []).filter((name) => /^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(name)).slice(0, 4);
      return { tag: anchor.tagName?.toLowerCase?.() || 'unknown', id: safeId, classes: safeClasses, mediaBeforeAnchor, mediaCount: media.length };
    } catch (_) { return { tag: anchor?.tagName?.toLowerCase?.() || 'unknown', id: '', classes: [], mediaBeforeAnchor: 0, mediaCount: 0 }; }
  }

  function renderCompleteDetailTranslation(detail, extraction, record, controls) {
    if (!record?.translatedText) return false;
    for (const node of detail.root.querySelectorAll('[data-bilingual-detail-source="true"]')) node.removeAttribute('data-bilingual-detail-source');
    for (const node of extraction.nodes) node.setAttribute('data-bilingual-detail-source', 'true');
    const anchor = findCompleteDetailAnchor(detail, extraction);
    if (!(anchor instanceof Element) || !anchor.isConnected) return false;
    let translation = detail.root.querySelector(`[data-bilingual-detail-translation="${SCRIPT_KEY}"]`);
    if (translation?.getAttribute('data-bilingual-plugin-id') && translation.getAttribute('data-bilingual-plugin-id') !== detail.pluginId) {
      translation.remove(); translation = null;
    }
    if (!translation) {
      translation = document.createElement('section');
      translation.setAttribute('data-bilingual-detail-translation', SCRIPT_KEY);
      translation.setAttribute('data-bilingual-ui', SCRIPT_KEY);
      translation.setAttribute('lang', LANGUAGE);
      Object.assign(translation.style, { margin: '0.65rem var(--detail-page-inline-inset, 0px)', whiteSpace: 'pre-wrap', font: 'inherit', lineHeight: 'inherit', color: 'inherit', opacity: '0.88' });
    }
    anchor.insertAdjacentElement('afterend', translation);
    translation.textContent = record.translatedText;
    translation.setAttribute('data-bilingual-plugin-id', detail.pluginId);
    translation.setAttribute('data-bilingual-source-hash', sourceHash(extraction.text));
    translation.setAttribute('data-bilingual-provider', record.provider);
    translation.setAttribute('data-bilingual-model', record.model || '');
    const anchorInfo = detailAnchorDiagnostic(detail, anchor);
    translation.setAttribute('data-bilingual-anchor-tag', anchorInfo.tag);
    console.debug(`[${SCRIPT_KEY}] detail_anchor plugin=${detail.pluginId} anchor=${JSON.stringify(anchorInfo)} placement=afterend`);
    saveDetailSource(record.provider);
    applyDisplayMode(detail, getDisplayMode());
    return true;
  }

  async function readCompleteDetailCaches(detail, extraction) {
    const google = await getCachedRecord(extraction.text, detailCacheContextFor(detail, 'google-free'));
    const deepseek = await getCachedRecord(extraction.text, detailCacheContextFor(detail, 'deepseek'));
    return { google, deepseek };
  }

  function updateDetailUiState(controls, caches, currentProvider = getDetailSource(), operation = '') {
    const googleStatus = controls.querySelector('[data-detail-cache="google-free"]');
    const deepseekStatus = controls.querySelector('[data-detail-cache="deepseek"]');
    const current = controls.querySelector('[data-detail-current-source]');
    const operationStatus = controls.querySelector('[data-bilingual-status]');
    if (googleStatus) googleStatus.textContent = `Google：${caches.google ? '已缓存' : '未翻译'}`;
    if (deepseekStatus) deepseekStatus.textContent = `DeepSeek：${caches.deepseek ? '已缓存' : '未翻译'}`;
    const activeRecord = currentProvider === 'deepseek' ? caches.deepseek : caches.google;
    if (current) current.textContent = activeRecord ? `当前译文：${currentProvider === 'deepseek' ? 'DeepSeek' : 'Google'}` : '当前译文：无';
    if (operationStatus) operationStatus.textContent = operation;
    for (const button of controls.querySelectorAll('[data-detail-source]')) {
      const selected = button.getAttribute('data-detail-source') === currentProvider;
      button.setAttribute('aria-pressed', String(selected));
      button.style.background = selected ? 'color-mix(in srgb, currentColor 12%, transparent)' : 'transparent';
    }
  }

  async function refreshCompleteDetail(detail, controls) {
    const extraction = extractCompleteDetail(detail);
    controls.setAttribute('data-bilingual-detail-chars', String(extraction.chars));
    if (!controls.hasAttribute('data-bilingual-diagnostics-logged')) {
      controls.setAttribute('data-bilingual-diagnostics-logged', 'true');
      console.debug(`[${SCRIPT_KEY}] detail_extract plugin=${detail.pluginId} chars=${extraction.chars} accepted=${extraction.accepted} reason=${extraction.reason || 'accepted'} nodes=${JSON.stringify(extraction.diagnostics)}`);
    }
    if (!extraction.accepted) {
      updateDetailUiState(controls, { google: null, deepseek: null }, getDetailSource(), extraction.reason === 'detail_too_large' ? `详情正文超过 ${MAX_DETAIL_SOURCE_CHARS} 字符，未发送。` : '没有可翻译的英文详情正文。');
      return { extraction, caches: { google: null, deepseek: null } };
    }
    const caches = await readCompleteDetailCaches(detail, extraction);
    let currentProvider = getDetailSource();
    if (currentProvider === 'google-free' && !caches.google && caches.deepseek) currentProvider = 'deepseek';
    if (currentProvider === 'deepseek' && !caches.deepseek && caches.google) currentProvider = 'google-free';
    const record = currentProvider === 'deepseek' ? caches.deepseek : caches.google;
    if (record) renderCompleteDetailTranslation(detail, extraction, record, controls);
    updateDetailUiState(controls, caches, currentProvider);
    applyDisplayMode(detail, getDisplayMode());
    return { extraction, caches };
  }

  async function translateCompleteDetail(detail, controls, provider, force = false) {
    const extraction = extractCompleteDetail(detail);
    if (!extraction.accepted) {
      updateDetailUiState(controls, { google: null, deepseek: null }, provider, extraction.reason === 'detail_too_large' ? `详情正文超过 ${MAX_DETAIL_SOURCE_CHARS} 字符，未发送。` : '没有可翻译的英文详情正文。');
      return false;
    }
    const context = detailCacheContextFor(detail, provider);
    const cached = await getCachedRecord(extraction.text, context);
    if (cached && !force) {
      saveDetailSource(provider); renderCompleteDetailTranslation(detail, extraction, cached, controls);
      const caches = await readCompleteDetailCaches(detail, extraction);
      updateDetailUiState(controls, caches, provider, `${provider === 'deepseek' ? 'DeepSeek' : 'Google'}：已缓存`);
      return true;
    }
    const key = [provider, context.model, 'detail', detail.pluginId, SOURCE_LANGUAGE, LANGUAGE, sourceHash(extraction.text)].join('|');
    if (!deepSeekDetailInFlight.has(key)) {
      deepSeekDetailInFlight.set(key, (async () => {
        if (provider === 'deepseek') {
          const availability = await checkDeepSeekDetailAvailability();
          if (!availability.ready) throw Object.assign(new Error(availability.status), { code: 'helper_or_credential_unavailable' });
        } else {
          const session = await ensureHelperPaired({ forceDiscovery: true });
          if (!session.port || !session.token) throw Object.assign(new Error('本地翻译服务未启动'), { code: 'helper_not_paired' });
        }
        updateDetailUiState(controls, await readCompleteDetailCaches(detail, extraction), provider, `${provider === 'deepseek' ? 'DeepSeek' : 'Google'} 翻译中…`);
        const result = provider === 'deepseek'
          ? await invokeDeepSeekManual(extraction.text, { kind: 'detail', pluginId: detail.pluginId })
          : { translatedText: await invokeGoogleDetail(extraction.text), model: 'google-free-v1' };
        const saved = await saveCachedTranslation(extraction.text, result.translatedText, { ...context, model: result.model || context.model });
        const record = saved.record;
        saveDetailSource(provider); saveDisplayMode('bilingual'); renderCompleteDetailTranslation(detail, extraction, record, controls);
        const caches = await readCompleteDetailCaches(detail, extraction);
        updateDetailUiState(controls, caches, provider, `${provider === 'deepseek' ? 'DeepSeek' : 'Google'}：翻译完成`);
        return true;
      })().catch(async (error) => {
        const caches = await readCompleteDetailCaches(detail, extraction);
        const message = error?.code === 'helper_not_paired' || error?.code === 'helper_or_credential_unavailable' ? (error.message || '本地翻译服务未启动') : `${provider === 'deepseek' ? 'DeepSeek' : 'Google'} 翻译失败`;
        updateDetailUiState(controls, caches, getDetailSource(), message);
        return false;
      }).finally(() => deepSeekDetailInFlight.delete(key)));
    }
    return deepSeekDetailInFlight.get(key);
  }

  async function checkDeepSeekDetailAvailability() {
    const session = await ensureHelperPaired({ forceDiscovery: true });
    if (!session.port || !session.token) return { ready: false, status: '本地翻译服务未启动' };
    try {
      const credential = await invokeDeepSeekCredential('GET');
      return credential.configured ? { ready: true, status: '' } : { ready: false, status: 'DeepSeek 未配置' };
    } catch (_) { return { ready: false, status: '本地翻译服务未启动' }; }
  }

  async function selectCachedDetailSource(detail, controls, provider) {
    const extraction = extractCompleteDetail(detail);
    if (!extraction.accepted) return false;
    const caches = await readCompleteDetailCaches(detail, extraction);
    const record = provider === 'deepseek' ? caches.deepseek : caches.google;
    saveDetailSource(provider);
    if (record) renderCompleteDetailTranslation(detail, extraction, record, controls);
    else {
      const translation = detail.root.querySelector(`[data-bilingual-detail-translation="${SCRIPT_KEY}"]`);
      if (translation) { translation.textContent = ''; translation.hidden = true; }
    }
    updateDetailUiState(controls, caches, provider, record ? `${provider === 'deepseek' ? 'DeepSeek' : 'Google'}：已缓存` : `${provider === 'deepseek' ? 'DeepSeek' : 'Google'}：未翻译`);
    applyDisplayMode(detail, getDisplayMode());
    return Boolean(record);
  }

  async function renderDetailControls(detail) {
    try {
      const existing = detail.root.querySelector(`[data-bilingual-detail-controls="${SCRIPT_KEY}"]`);
      if (existing?.getAttribute('data-bilingual-plugin-id') === detail.pluginId) { await refreshCompleteDetail(detail, existing); return; }
      if (existing) existing.remove();
      for (const node of detail.root.querySelectorAll(`[data-bilingual-detail-translation="${SCRIPT_KEY}"]`)) node.remove();
      for (const node of detail.root.querySelectorAll('[data-bilingual-detail-source="true"]')) node.removeAttribute('data-bilingual-detail-source');
      const controls = document.createElement('div');
      controls.setAttribute('data-bilingual-detail-controls', SCRIPT_KEY);
      controls.setAttribute('data-bilingual-ui', SCRIPT_KEY);
      controls.setAttribute('data-bilingual-plugin-id', detail.pluginId);
      Object.assign(controls.style, { display: 'grid', gap: '0.45rem', margin: '0 var(--detail-page-inline-inset, 0px)', padding: '0.55rem 0', fontSize: '0.9em', color: 'inherit' });
      const translateRow = document.createElement('div'); Object.assign(translateRow.style, { display: 'flex', flexWrap: 'wrap', gap: '0.4rem', alignItems: 'center' });
      translateRow.append(document.createTextNode('执行翻译：'), detailButton('Google 翻译', 'translate:google-free'), detailButton('DeepSeek 翻译', 'translate:deepseek'), detailButton('重新翻译当前来源', 'retranslate-current'));
      const sourceRow = document.createElement('div'); Object.assign(sourceRow.style, { display: 'flex', flexWrap: 'wrap', gap: '0.4rem', alignItems: 'center' });
      sourceRow.append(document.createTextNode('译文来源：'));
      for (const [provider, label] of [['google-free', 'Google'], ['deepseek', 'DeepSeek']]) {
        const button = detailButton(label, `source:${provider}`, getDetailSource() === provider); button.setAttribute('data-detail-source', provider); sourceRow.appendChild(button);
      }
      const modeRow = document.createElement('div'); Object.assign(modeRow.style, { display: 'flex', flexWrap: 'wrap', gap: '0.4rem', alignItems: 'center' });
      modeRow.append(document.createTextNode('显示模式：'));
      for (const [mode, label] of [['bilingual', '中英双语'], ['chinese', '仅中文'], ['english', '仅英文']]) {
        const button = detailButton(label, `mode:${mode}`, getDisplayMode() === mode); button.setAttribute('data-bilingual-mode', mode); button.setAttribute('aria-pressed', String(getDisplayMode() === mode)); modeRow.appendChild(button);
      }
      const cacheRow = document.createElement('div'); Object.assign(cacheRow.style, { display: 'flex', flexWrap: 'wrap', gap: '0.75rem', opacity: '0.72' });
      for (const provider of ['google-free', 'deepseek']) { const span = document.createElement('span'); span.setAttribute('data-detail-cache', provider); cacheRow.appendChild(span); }
      const current = document.createElement('span'); current.setAttribute('data-detail-current-source', 'true'); cacheRow.appendChild(current);
      const status = document.createElement('span'); status.setAttribute('data-bilingual-status', 'true'); status.setAttribute('aria-live', 'polite'); status.style.opacity = '0.72';
      controls.append(translateRow, sourceRow, modeRow, cacheRow, status);
      controls.addEventListener('click', async (event) => {
        const button = event.target.closest('button[data-bilingual-action]');
        if (!button || !controls.contains(button)) return;
        const action = button.getAttribute('data-bilingual-action');
        if (action?.startsWith('translate:')) {
          button.disabled = true; try { await translateCompleteDetail(detail, controls, action.slice(10), false); } finally { button.disabled = false; }
        } else if (action === 'retranslate-current') {
          button.disabled = true; try { await translateCompleteDetail(detail, controls, getDetailSource(), true); } finally { button.disabled = false; }
        } else if (action?.startsWith('source:')) {
          await selectCachedDetailSource(detail, controls, action.slice(7));
        } else if (action?.startsWith('mode:')) {
          const mode = action.slice(5); if (!VALID_MODES.has(mode)) return; saveDisplayMode(mode); applyDisplayMode(detail, mode);
        }
      });
      detail.header.insertAdjacentElement('afterend', controls);
      await refreshCompleteDetail(detail, controls);
    } catch (error) { console.debug(`[${SCRIPT_KEY}] Detail controls skipped safely.`, error); }
  }

  function processPluginDetail() {
    const detail = detectPluginDetail();
    if (!detail || detailRenderInFlight.has(detail.root)) return;
    const pending = renderDetailControls(detail).finally(() => detailRenderInFlight.delete(detail.root));
    detailRenderInFlight.set(detail.root, pending);
  }

  function removeLegacyTestUi() {
    try {
      for (const node of document.querySelectorAll(`[data-bilingual-card-translation="${SCRIPT_KEY}"]`)) node.remove();
      for (const node of document.querySelectorAll('[data-bilingual-test-translation]')) node.remove();
      for (const node of document.querySelectorAll('[data-bilingual-processed]')) node.removeAttribute('data-bilingual-processed');
      for (const node of document.querySelectorAll('[data-bilingual-card-processed]')) node.removeAttribute('data-bilingual-card-processed');
    } catch (_) {}
  }

  function isOwnUiNode(node) {
    const element = node instanceof Element ? node : node?.parentElement;
    return Boolean(element?.closest?.(`[data-bilingual-ui="${SCRIPT_KEY}"], [data-bilingual-card-translation="${SCRIPT_KEY}"], [data-bilingual-detail-translation="${SCRIPT_KEY}"]`));
  }

  function collectMutationRoots(records) {
    for (const record of records) {
      if (isOwnUiNode(record.target)) continue;
      const changedNodes = [...(record.addedNodes || []), ...(record.removedNodes || [])];
      if (changedNodes.length > 0 && changedNodes.every((node) => isOwnUiNode(node))) continue;
      const targetContainer = record.target instanceof Element ? record.target.closest?.('.text-codex-description') : record.target?.parentElement?.closest?.('.text-codex-description');
      if (targetContainer) pendingScanRoots.add(targetContainer);
      for (const node of record.addedNodes || []) {
        if (!(node instanceof Element) || isOwnUiNode(node)) continue;
        if (node.matches('#plugins-store-page-search, .text-codex-description, #plugin-description') ||
            node.querySelector?.('#plugins-store-page-search, .text-codex-description, #plugin-description')) {
          pendingScanRoots.add(node);
        }
      }
      // Detail pages render their shell before their body. Coalesce later body
      // mutations into the existing RAF scan so cached blocks are restored.
      const activeDetail = detectPluginDetail();
      const mutationTarget = record.target instanceof Element ? record.target : record.target?.parentElement;
      if (activeDetail && mutationTarget && activeDetail.root.contains(mutationTarget)) pendingScanRoots.add(activeDetail.root);
    }
    if (pendingScanRoots.size > 0) scheduleScan();
  }

  function scan() {
    scanScheduled = false;
    if (stopped || scanRunning) return;
    scanRunning = true;
    const roots = pendingScanRoots.size ? Array.from(pendingScanRoots) : [];
    pendingScanRoots.clear();
    try {
      for (const root of roots) processPluginCards(root);
      if (roots.some((root) => root === document || root.querySelector?.('#plugin-description') || root.matches?.('#plugin-description'))) processPluginDetail();
    } catch (error) { console.debug(`[${SCRIPT_KEY}] Scan skipped safely.`, error); }
    finally {
      scanRunning = false;
      if (pendingScanRoots.size > 0) scheduleScan();
    }
  }

  function scheduleScan(root) {
    if (stopped) return;
    if (root) pendingScanRoots.add(root);
    if (scanScheduled || pendingScanRoots.size === 0) return;
    scanScheduled = true; requestAnimationFrame(scan);
  }

  function start() {
    if (stopped) return;
    const root = document.documentElement;
    if (!root) { document.addEventListener('DOMContentLoaded', start, { once: true }); return; }
    try { sessionStorage.removeItem(HELPER_SESSION_KEY); } catch (_) {}
    removeLegacyTestUi(); scheduleScan(document);
    if (!initialDiscoveryAttempted) {
      initialDiscoveryAttempted = true;
      void discoverLocalHelper({ force: true }).catch(() => {});
    }
    try {
      observer = new MutationObserver(collectMutationRoots);
      observer.observe(root, { childList: true, subtree: true });
    } catch (error) { observer = null; console.debug(`[${SCRIPT_KEY}] Observer was not started.`, error); }
  }

  window.__codexPluginMarketBilingualTestCleanup = () => {
    stopped = true; scanScheduled = false; scanRunning = false; helperPostPairScanScheduled = false;
    try { observer?.disconnect(); } catch (_) {}
    observer = null;
    pendingScanRoots.clear();
    googleQueue.length = 0; googleQueuedKeys.clear(); googleWaitingNodes.clear(); googleFailedKeys.clear();
    clearAutoHelperSession(); manualHelperSession = { port: 0, token: '' }; discoveryInFlight = null;
  };

  try { start(); } catch (error) { console.debug(`[${SCRIPT_KEY}] Startup skipped safely.`, error); }
})();

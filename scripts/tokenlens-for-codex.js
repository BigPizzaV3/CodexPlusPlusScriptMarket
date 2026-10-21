// ==UserScript==
// @name         TokenLens for Codex
// @namespace    tokenlens-for-codex
// @version      1.0.1
// @description  Codex++ throughput, tool, token, cache and usage status line.
// @match        app://-/*
// @run-at       document-start
// ==/UserScript==

/* Codex++ external extension: turn token throughput status line. */
(() => {
  const registerCodexPlusExtensionSelector = () => {};
  const visibleElement = (node) => !!node && ((node.getClientRects?.().length || 0) > 0 || node.offsetWidth > 0 || node.offsetHeight > 0);
  const codexPlusBackendSettingsLoaded = true;
  const codexPlusSettings = () => ({ usageStatusLine: true });
  window.__codexPlusUsageStatusLineRuntime?.dispose?.();
  document.getElementById("codex-plus-usage-statusline")?.remove();
  /**
   * 输入框下方吞吐状态栏。
   *
   * 主界面只使用已结算模型调用的输出与耗时，工具执行时间从调用区间中扣除。
   * 数据来自 Codex app-server 的本地通知，不读取会话正文，也不请求服务商：
   * - 首个非空助手或推理增量为首 token 时间；
   * - 助手消息或计划条目完成时结束当前解码区间；
   * - 工具条目开始与完成之间的并集计为工具耗时；
   * - token 用量按线程累计输出增量计入当前轮；
   * - 中途安装时从当前线程 rollout 回填当前轮并去重。
   *
   * 悬停速度值可查看首 token、工具耗时以及本轮 token 用量。
   */
  registerCodexPlusExtensionSelector('[data-codex-plus-ext="user-throughput-statusline"]');
  window.__codexPlusThroughputStatusLineRuntime?.dispose?.();

  const codexPlusUsageStatusLineId = "codex-plus-throughput-statusline";
  const codexPlusUsagePopoverId = "codex-plus-throughput-popover";
  const codexPlusUsageStyleId = "codex-plus-throughput-statusline-style";
  const codexPlusUsageVersion = 20;
  const codexPlusUsageGlobalApiKey = "__codexDailyTokenUsage";
  const codexPlusUsageGlobalRefreshMs = 5 * 60 * 1000;
  const codexPlusUsageActiveTickMs = 1000;
  const codexPlusUsageIdleTickMs = 4000;
  const codexPlusUsageMaxTurns = 32;
  const codexPlusUsageModelItemTypes = new Set([
    "agentmessage", "plan", "reasoning", "usermessage", "hookprompt", "functioncalloutput",
  ]);
  const codexPlusUsageEvents = [
    "turn/started",
    "turn/completed",
    "hook/started",
    "hook/completed",
    "item/started",
    "item/completed",
    "rawResponseItem/completed",
    "item/agentMessage/delta",
    "item/reasoning/textDelta",
    "item/reasoning/summaryTextDelta",
    "thread/tokenUsage/updated",
  ];

  const codexPlusUsageState = {
    disposed: false,
    timer: 0,
    node: null,
    card: null,
    parts: null,
    popover: null,
    popoverParts: null,
    threadId: "",
    turns: new Map(),
    lastFingerprint: "",
    observer: null,
    dispatcher: null,
    unsubscribers: [],
    hideTimer: 0,
    toolExpanded: false,
    tokenExpanded: false,
    range: "task",
    customStart: "",
    customEnd: "",
    historyThreadId: "",
    historySamples: [],
    historyFetchedAt: 0,
    historyLoading: false,
    historyError: "",
    historyPromise: null,
    globalUsageFetchedAt: 0,
    globalUsageLoading: false,
    globalUsageError: "",
    globalUsagePromise: null,
    globalUsageSamples: [],
    globalUsageScanned: false,
    globalAppServicesPromise: null,
    nativeMessageHandler: null,
    nativeViewHandler: null,
    resizeHandler: null,
    scrollHandler: null,
  };

  const codexPlusUsageSvgNs = "http://www.w3.org/2000/svg";
  const codexPlusUsageHitIconPath = "M487.104 113.792c42.688 0 83.84 6.272 122.688 18.048L580.8 186.432a362.688 362.688 0 1 0 255.936 253.696l54.528-28.8a423.104 423.104 0 1 1-404.16-297.472z m0 241.792h4.032l-34.048 64.256a120.96 120.96 0 1 0 148.096 143.104l63.104-33.408 0.128 7.424a181.312 181.312 0 1 1-181.312-181.312zM721.6 79.872a12.8 12.8 0 0 1 5.504 5.632l68.8 140.416 140.288 68.736a12.8 12.8 0 0 1 0.384 22.784L479.104 560a12.8 12.8 0 0 1-17.28-17.28L704.256 85.248a12.8 12.8 0 0 1 17.28-5.312z m-7.744 116.096l-126.08 237.888 237.888-126.08-56.32-27.584-18.624-9.088-9.088-18.56-27.776-56.576z";
  const codexPlusUsageMeterGaugePath = "M992.633263 971.829895a40.421053 40.421053 0 1 1-56.589474-57.344 477.776842 477.776842 0 0 0 141.850948-339.536842 485.052632 485.052632 0 0 0-970.105263 0 477.776842 477.776842 0 0 0 141.904842 339.536842 40.421053 40.421053 0 1 1-57.45179 56.966737A560.613053 560.613053 0 0 1 592.842105 13.473684c310.810947 0 563.469474 250.610526 565.894737 561.475369a557.810526 557.810526 0 0 1-166.103579 396.880842zM67.368421 660.210526a40.421053 40.421053 0 1 1 0-80.842105h80.842105a40.421053 40.421053 0 1 1 0 80.842105h-80.842105z m970.105263 0a40.421053 40.421053 0 1 1 0-80.842105h80.842105a40.421053 40.421053 0 1 1 0 80.842105h-80.842105zM200.380632 244.250947a40.582737 40.582737 0 1 1 57.344-57.344l40.421052 40.421053a40.582737 40.582737 0 1 1-57.344 57.344l-40.421052-40.421053z m687.157894 687.157895a40.582737 40.582737 0 0 1 57.344-57.344l40.421053 40.421053a40.582737 40.582737 0 0 1-57.344 57.344l-40.421053-40.421053z m40.421053-744.501895a40.582737 40.582737 0 1 1 57.344 57.344l-40.421053 40.421053a40.582737 40.582737 0 1 1-57.344-57.344l40.421053-40.421053z m-687.157895 687.157895a40.582737 40.582737 0 0 1 57.344 57.344l-40.421052 40.421053a40.582737 40.582737 0 0 1-57.344-57.344l40.421052-40.421053zM552.421053 94.315789a40.421053 40.421053 0 1 1 80.842105 0v80.842106a40.421053 40.421053 0 1 1-80.842105 0v-80.842106z";
  const codexPlusUsageMeterNeedlePath = "m148.749473 436.924632l-40.421052 10.940632c-29.642105 7.006316-58.745263 16.330105-86.878316 27.917473a52.978526 52.978526 0 0 0-15.36 67.476211 35.947789 35.947789 0 0 0 52.11621 16.976842 837.093053 837.093053 0 0 0 88.549053-94.962526l9.701053-10.940632 20.156631-24.252632-27.863579 6.844632z m-61.44-67.47621l40.421053-10.940632c31.959579-8.084211 65.913263-16.168421 99.866947-23.821474l32.714106-7.653052 12.934736-2.856421a40.421053 40.421053 0 0 1 40.421053 64.673684c0 1.994105-4.042105 5.658947-8.08421 10.13221l-21.396211 26.677895c-22.635789 27.486316-45.271579 54.972632-67.098947 80.842105l-9.701053 11.317895a684.732632 684.732632 0 0 1-106.711579 110.69979 116.789895 116.789895 0 0 1-166.965895-47.696843 133.820632 133.820632 0 0 1 43.654737-173.379368 489.903158 489.903158 0 0 1 109.945263-37.995789z";

  function codexPlusUsageText() {
    const language = (document.documentElement?.lang || navigator.language || "").toLowerCase();
    if (language.startsWith("zh")) {
      return {
        speed: (value) => `${value} tok/s`,
        aria: "吞吐状态栏",
        labels: {
          title: "吞吐速度",
          tool: "工具执行",
          toolKinds: {
            memory: "记忆库",
            skills: "Skills",
            mcp: "MCP",
            hook: "Hook",
            command: "命令执行",
            file: "文件修改",
            imageView: "图像查看",
            imageGeneration: "图像生成",
            webSearch: "网页搜索",
            agent: "智能体",
            dynamic: "工具调用",
            review: "代码审查",
            sleep: "等待",
            contextCompaction: "上下文压缩",
            other: "其他工具",
          },
          toolCalls: (value) => `${value} 次`,
          input: "输入",
          output: "输出",
          cacheRead: "缓存读取",
          hitRate: "缓存命中",
          task: "任务消耗",
          today: "今天消耗",
          threeDay: "近三天消耗",
          week: "近7天消耗",
          custom: "区间消耗",
          start: "起始",
          end: "截止",
          toolEmpty: "暂无工具明细",
          loading: "加载中",
          contextWindow: "上下文窗口",
          context: "上下文",
          samples: "模型调用",
          running: "实时统计",
          completed: "本轮已完成",
          waiting: "等待本次模型调用数据",
        },
        seconds: "秒",
        minutes: "分",
        unavailable: "--",
      };
    }
    return {
      speed: (value) => `${value} tok/s`,
      aria: "Throughput status line",
      labels: {
        title: "Throughput",
        tool: "Tools",
        toolKinds: {
          memory: "Memory",
          skills: "Skills",
          mcp: "MCP",
          hook: "Hook",
          command: "Commands",
          file: "File changes",
          imageView: "Image view",
          imageGeneration: "Image generation",
          webSearch: "Web search",
          agent: "Agents",
          dynamic: "Tool calls",
          review: "Review",
          sleep: "Sleep",
          contextCompaction: "Context compaction",
          other: "Other tools",
        },
        toolCalls: (value) => `${value} call${value === 1 ? "" : "s"}`,
        input: "Input",
        output: "Output",
        cacheRead: "Cache read",
        hitRate: "Cache hit",
        task: "Turn usage",
        today: "Today",
        threeDay: "Last 3 days",
        week: "Last 7 days",
        custom: "Range",
        start: "Start",
        end: "End",
        toolEmpty: "No tool details",
        loading: "Loading",
        contextWindow: "Context window",
        context: "context",
        samples: "Model calls",
        running: "Live",
        completed: "Turn completed",
        waiting: "Waiting for model-call data",
      },
      seconds: "s",
      minutes: "min",
      unavailable: "--",
    };
  }

  function codexPlusUsageInstallStyle() {
    const existing = document.getElementById(codexPlusUsageStyleId);
    if (existing?.dataset.version === String(codexPlusUsageVersion)) return;
    existing?.remove();
    const style = document.createElement("style");
    style.id = codexPlusUsageStyleId;
    style.dataset.version = String(codexPlusUsageVersion);
    style.dataset.codexPlusExt = "user-throughput-statusline";
    style.textContent = `
      #${codexPlusUsageStatusLineId}{display:flex;align-items:center;justify-content:center;box-sizing:border-box;width:100%;margin:6px 0 0;padding:0 10px;font:inherit;font-size:12px;line-height:17px;color:var(--color-token-text-secondary,rgba(205,205,215,.95));color:color-mix(in srgb,var(--color-token-text-primary,#dfdfdf) 82%,transparent);user-select:none}
      #${codexPlusUsageStatusLineId}[data-hidden="true"]{display:none}
      #${codexPlusUsageStatusLineId}[data-placement="composer-footer"]{display:inline-flex;justify-content:flex-start;width:auto;margin:0 0 0 6px;padding:0;vertical-align:middle}
      [data-codex-plus-throughput-footer-host]{display:flex!important;align-items:center;min-width:0}
      #${codexPlusUsageStatusLineId} .codex-plus-usage-speed{display:inline-flex;align-items:center;gap:5px;box-sizing:border-box;max-width:100%;padding:1px 7px;border:0;border-radius:6px;background:transparent;color:inherit;font:inherit;font-variant-numeric:tabular-nums;cursor:pointer;outline:none}
      #${codexPlusUsageStatusLineId} .codex-plus-usage-speed:hover{background:color-mix(in srgb,currentColor 8%,transparent)}
      #${codexPlusUsageStatusLineId} .codex-plus-usage-speed:focus-visible{box-shadow:0 0 0 2px color-mix(in srgb,currentColor 30%,transparent)}
      #${codexPlusUsageStatusLineId} .codex-plus-usage-value,
      #${codexPlusUsageStatusLineId} .codex-plus-usage-hit{font-size:12px;line-height:17px;font-weight:430}
      #${codexPlusUsageStatusLineId} .codex-plus-usage-speed svg{flex:0 0 auto;width:14px;height:13px;opacity:.8}
      #${codexPlusUsageStatusLineId} .codex-plus-usage-speed [data-role="needle"]{transform-box:view-box;transform-origin:592.842105px 575.157895px;transition:transform .3s cubic-bezier(.22,1,.36,1);will-change:transform}
      #${codexPlusUsageStatusLineId} .codex-plus-usage-hit{display:inline-flex;align-items:center;gap:3px;opacity:1;white-space:nowrap}
      #${codexPlusUsageStatusLineId} .codex-plus-usage-hit::before{content:"·";margin-right:5px;opacity:.55}
      #codex-plus-throughput-popover{position:fixed;z-index:2147483400;box-sizing:border-box;width:min(326px,calc(100vw - 24px));max-height:min(76vh,560px);overflow:auto;padding:14px;border:1px solid color-mix(in srgb,var(--color-token-text-primary,#dfdfdf) 12%,transparent);border-radius:8px;background:var(--color-token-bg-primary,#202020);color:var(--color-token-text-primary,#ededed);box-shadow:0 14px 38px rgba(0,0,0,.32);font:12px/1.45 ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;font-variant-numeric:tabular-nums;pointer-events:auto;scrollbar-width:thin}
      #codex-plus-throughput-popover[hidden]{display:none}
      .codex-plus-throughput-popover-head{display:flex;align-items:baseline;justify-content:space-between;gap:16px}
      .codex-plus-throughput-popover-title{font-size:14px;font-weight:600;color:var(--color-token-text-primary,#f3f3f3)}
      .codex-plus-throughput-popover-value{font-size:15px;font-weight:650;color:var(--color-token-text-primary,#f3f3f3);white-space:nowrap}
      .codex-plus-throughput-context{display:flex;align-items:center;gap:9px;margin:12px 0 14px}
      .codex-plus-throughput-context-track{flex:1;height:8px;overflow:hidden;border-radius:999px;background:color-mix(in srgb,currentColor 9%,transparent)}
      .codex-plus-throughput-context-fill{display:block;width:0;height:100%;border-radius:inherit;background:linear-gradient(90deg,#2563eb,#60a5fa,#8aa8ff,#c4b5fd);transition:width .18s ease}
      .codex-plus-throughput-context-value{min-width:68px;color:#8aa8ff;font-size:11px;font-weight:600;text-align:right;white-space:nowrap}
      .codex-plus-throughput-popover-rows{display:grid;gap:7px}
      .codex-plus-throughput-popover-row{display:grid;grid-template-columns:8px minmax(0,1fr) auto;align-items:center;gap:8px;box-sizing:border-box;min-height:22px}
      .codex-plus-throughput-popover-row[data-interactive="true"]{margin:-2px -4px;padding:2px 4px;border:0;border-radius:5px;background:transparent;color:inherit;font:inherit;text-align:left;cursor:pointer}
      .codex-plus-throughput-popover-row[data-interactive="true"]:hover{background:color-mix(in srgb,currentColor 7%,transparent)}
      .codex-plus-throughput-popover-row[data-interactive="true"]:focus-visible{outline:2px solid color-mix(in srgb,currentColor 28%,transparent);outline-offset:0}
      .codex-plus-throughput-popover-row[data-interactive="true"]:disabled{cursor:default;opacity:.72}
      .codex-plus-throughput-popover-row[data-interactive="true"]:disabled:hover{background:transparent}
      .codex-plus-throughput-popover-dot{width:6px;height:6px;border-radius:50%;background:#60a5fa}
      .codex-plus-throughput-popover-row[data-row="tool"] .codex-plus-throughput-popover-dot{background:#93c5fd}
      .codex-plus-throughput-popover-label{min-width:0;color:var(--color-token-text-secondary,rgba(210,210,220,.78));white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .codex-plus-throughput-popover-number-group{display:inline-flex;align-items:center;gap:7px;white-space:nowrap}
      .codex-plus-throughput-popover-number{color:var(--color-token-text-primary,#ededed);font-weight:550;white-space:nowrap}
      .codex-plus-throughput-popover-arrow{width:6px;height:6px;margin-top:-2px;border-right:1.4px solid currentColor;border-bottom:1.4px solid currentColor;transform:rotate(45deg);transition:transform .16s ease;opacity:.62}
      .codex-plus-throughput-popover-row[aria-expanded="true"] .codex-plus-throughput-popover-arrow{margin-top:3px;transform:rotate(225deg)}
      .codex-plus-throughput-popover-rule{height:1px;margin:13px 0 11px;background:color-mix(in srgb,currentColor 10%,transparent)}
      .codex-plus-throughput-popover-panel{display:grid;gap:5px;margin:4px 0 2px 14px;padding:6px 0 2px}
      .codex-plus-throughput-popover-panel[hidden]{display:none}
      .codex-plus-throughput-tool-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:10px;color:var(--color-token-text-tertiary,rgba(200,200,210,.68));font-size:11px}
      .codex-plus-throughput-tool-row span{min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .codex-plus-throughput-tool-row span:last-child{color:var(--color-token-text-secondary,rgba(210,210,220,.86));font-weight:600}
      .codex-plus-throughput-presets{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:3px;padding:2px;border-radius:6px;background:color-mix(in srgb,currentColor 7%,transparent)}
      .codex-plus-throughput-preset{min-width:0;height:24px;padding:0 4px;border:0;border-radius:4px;background:transparent;color:var(--color-token-text-secondary,rgba(210,210,220,.78));font:inherit;font-size:11px;cursor:pointer;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .codex-plus-throughput-preset:hover{background:color-mix(in srgb,currentColor 7%,transparent)}
      .codex-plus-throughput-preset[aria-pressed="true"]{background:color-mix(in srgb,var(--color-token-text-primary,#ededed) 12%,transparent);color:var(--color-token-text-primary,#f3f3f3);font-weight:650}
      .codex-plus-throughput-preset:focus-visible{outline:2px solid color-mix(in srgb,currentColor 28%,transparent);outline-offset:0}
      .codex-plus-throughput-custom{display:grid;gap:4px;margin-top:2px}
      .codex-plus-throughput-time{display:grid;grid-template-columns:30px minmax(0,1fr);align-items:center;gap:5px;color:var(--color-token-text-tertiary,rgba(200,200,210,.68));font-size:10.5px}
      .codex-plus-throughput-time input{box-sizing:border-box;width:100%;min-width:0;height:26px;padding:2px 5px;border:1px solid color-mix(in srgb,currentColor 12%,transparent);border-radius:5px;background:color-mix(in srgb,currentColor 4%,transparent);color:var(--color-token-text-primary,#ededed);font:inherit;font-size:10.5px;color-scheme:dark light}
      .codex-plus-throughput-time input:focus{outline:2px solid color-mix(in srgb,currentColor 28%,transparent);outline-offset:0}
      .codex-plus-throughput-popover-footer{display:flex;align-items:center;justify-content:space-between;gap:14px;color:var(--color-token-text-tertiary,rgba(200,200,210,.62));font-size:11px}
    `;
    document.head?.appendChild(style);
  }

  function codexPlusUsageIcon(shapes) {
    const svg = document.createElementNS(codexPlusUsageSvgNs, "svg");
    svg.setAttribute("viewBox", "0 0 16 16");
    svg.setAttribute("width", "13");
    svg.setAttribute("height", "13");
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-width", "1.4");
    svg.setAttribute("stroke-linecap", "round");
    svg.setAttribute("stroke-linejoin", "round");
    svg.setAttribute("aria-hidden", "true");
    for (const shape of shapes) {
      const node = document.createElementNS(codexPlusUsageSvgNs, shape.tag);
      Object.entries(shape.attrs).forEach(([key, value]) => node.setAttribute(key, value));
      svg.appendChild(node);
    }
    return svg;
  }

  function codexPlusUsageFilledIcon(pathData, viewBox, width, height) {
    const svg = document.createElementNS(codexPlusUsageSvgNs, "svg");
    svg.setAttribute("viewBox", viewBox);
    svg.setAttribute("width", String(width));
    svg.setAttribute("height", String(height));
    svg.setAttribute("fill", "currentColor");
    svg.setAttribute("aria-hidden", "true");
    const path = document.createElementNS(codexPlusUsageSvgNs, "path");
    path.setAttribute("d", pathData);
    svg.appendChild(path);
    return svg;
  }

  function codexPlusUsageMeterIcon() {
    const svg = document.createElementNS(codexPlusUsageSvgNs, "svg");
    svg.setAttribute("viewBox", "0 0 1185 1024");
    svg.setAttribute("width", "14");
    svg.setAttribute("height", "13");
    svg.setAttribute("fill", "currentColor");
    svg.setAttribute("aria-hidden", "true");
    const gauge = document.createElementNS(codexPlusUsageSvgNs, "path");
    gauge.setAttribute("d", codexPlusUsageMeterGaugePath);
    const needle = document.createElementNS(codexPlusUsageSvgNs, "g");
    needle.dataset.role = "needle";
    const pointer = document.createElementNS(codexPlusUsageSvgNs, "path");
    pointer.setAttribute("d", codexPlusUsageMeterNeedlePath);
    pointer.setAttribute("transform", "translate(552.421053 94.315789)");
    needle.appendChild(pointer);
    svg.append(gauge, needle);
    return { svg, needle };
  }

  function codexPlusUsageNumber(value) {
    const number = Number(value);
    return Number.isFinite(number) && number >= 0 ? number : null;
  }

  function codexPlusUsageFieldNumber(source, keys) {
    if (!source || typeof source !== "object") return null;
    for (const key of keys) {
      const value = codexPlusUsageNumber(source[key]);
      if (value != null) return value;
    }
    return null;
  }

  function codexPlusUsageTokenTotals(source) {
    if (!source || typeof source !== "object") return null;
    const input = codexPlusUsageFieldNumber(source, ["inputTokens", "input_tokens", "promptTokens", "prompt_tokens"]);
    const explicitInput = codexPlusUsageFieldNumber(source, ["inputTotalTokens", "input_total_tokens", "promptTotalTokens", "prompt_total_tokens"]);
    const cached = codexPlusUsageFieldNumber(source, [
      "cachedInputTokens", "cached_input_tokens", "cacheReadInputTokens", "cache_read_input_tokens", "cachedTokens", "cached_tokens",
    ]) ?? codexPlusUsageFieldNumber(source.inputTokensDetails, ["cachedTokens", "cached_tokens"])
      ?? codexPlusUsageFieldNumber(source.input_tokens_details, ["cachedTokens", "cached_tokens"])
      ?? codexPlusUsageFieldNumber(source.promptTokensDetails, ["cachedTokens", "cached_tokens"])
      ?? codexPlusUsageFieldNumber(source.prompt_tokens_details, ["cachedTokens", "cached_tokens"]);
    const cacheWrite = codexPlusUsageFieldNumber(source, [
      "cacheWriteInputTokens", "cache_write_input_tokens", "cacheCreationInputTokens", "cache_creation_input_tokens",
    ]);
    const output = codexPlusUsageFieldNumber(source, ["outputTokens", "output_tokens", "completionTokens", "completion_tokens"]);
    const explicitTotal = codexPlusUsageFieldNumber(source, ["totalTokens", "total_tokens"]);
    if ([input, explicitInput, cached, cacheWrite, output, explicitTotal].every((value) => value == null)) return null;
    const inputFromTotal = explicitTotal != null && output != null ? Math.max(0, explicitTotal - output) : null;
    const inputTotal = Math.max(0, ...[input, explicitInput, cached, cacheWrite, inputFromTotal].filter((value) => value != null));
    const total = Math.max(explicitTotal ?? 0, (input ?? 0) + (output ?? 0), (cached ?? 0) + (cacheWrite ?? 0) + (output ?? 0));
    return { input: inputTotal, cached: cached ?? 0, output: output ?? 0, total };
  }

  function codexPlusUsageClamp(value, minimum, maximum) {
    return Math.min(maximum, Math.max(minimum, value));
  }

  function codexPlusUsageNormalizeThreadId(value) {
    const id = String(value || "").replace(/^local:/, "").trim();
    if (!id || id === "__proto__" || id === "prototype" || id === "constructor") return "";
    return /^[A-Za-z0-9_.-]{8,128}$/.test(id) ? id : "";
  }

  function codexPlusUsageEventData(payload) {
    return payload?.method ? (payload.params || {}) : (payload || {});
  }

  function codexPlusUsageEventThreadId(data) {
    return codexPlusUsageNormalizeThreadId(data?.threadId || data?.thread_id);
  }

  function codexPlusUsageEventIsLocal(data) {
    return ![data?.hostId, data?.host_id].some((host) => typeof host === "string" && host !== "local");
  }

  function codexPlusUsageEventTurnId(data) {
    return String(data?.turnId || data?.turn_id || data?.turn?.id || "").trim();
  }

  function codexPlusUsageAcceptsTurnEvent(previous, method, turnId) {
    return method === "turn/started"
      || !previous?.turnId
      || !turnId
      || previous.turnId === turnId;
  }

  function codexPlusUsageItemType(value) {
    return String(value || "").replace(/[_\s-]/g, "").toLowerCase();
  }

  function codexPlusUsageIsToolItem(type) {
    const normalized = codexPlusUsageItemType(type);
    return normalized.length > 0 && !codexPlusUsageModelItemTypes.has(normalized);
  }

  function codexPlusUsageFirstString(source, keys) {
    const value = keys
      .map((key) => source?.[key])
      .find((candidate) => typeof candidate === "string" && candidate.trim());
    return String(value || "").trim();
  }

  function codexPlusUsageBaseName(value) {
    const text = String(value || "").trim().replace(/[?#].*$/, "");
    return text.split(/[\\/]/).filter(Boolean).pop() || text;
  }

  function codexPlusUsageCommandSummary(item) {
    const command = Array.isArray(item?.command)
      ? item.command.join(" ")
      : codexPlusUsageFirstString(item, ["command"]);
    const action = (item?.commandActions || item?.command_actions || [])
      .map((entry) => codexPlusUsageFirstString(entry, ["command", "cmd"]))
      .find(Boolean);
    const firstLine = String(command || action || "").split(/\r?\n/).find((line) => line.trim()) || "";
    return firstLine.replace(/\s+/g, " ").trim().slice(0, 72);
  }

  function codexPlusUsageFileSummary(item) {
    const changes = item?.changes;
    const paths = Array.isArray(changes)
      ? changes.map((entry) => codexPlusUsageFirstString(entry, ["path", "file", "name"]))
      : Object.keys(changes || {});
    const names = [...new Set(paths.map(codexPlusUsageBaseName).filter(Boolean))];
    if (!names.length) return "";
    return names.length > 1 ? `${names[0]} 等 ${names.length} 个文件` : names[0];
  }

  function codexPlusUsageSkillNames(item) {
    const names = new Set();
    for (const entry of item?.content || []) {
      if (entry?.type === "skill") {
        const name = String(entry.name || codexPlusUsageBaseName(entry.path) || "").trim();
        if (name) names.add(name);
      }
      if (entry?.type !== "text" || typeof entry.text !== "string") continue;
      for (const match of entry.text.matchAll(/([A-Za-z0-9_.-]+)[\\/]SKILL\.md/gi)) {
        if (match[1]) names.add(match[1]);
      }
    }
    return [...names];
  }

  function codexPlusUsageCommandKind(turn, item) {
    const skill = String(turn?.activeSkills?.[0] || "").trim();
    if (!skill) return { ...codexPlusUsageToolKind(item), visible: false };
    return {
      key: "skills",
      fallback: "Skills",
      label: `${codexPlusUsageToolLabel("skills", "Skills")} · ${skill}`,
      detail: codexPlusUsageCommandSummary(item),
    };
  }

  function codexPlusUsageToolKind(item) {
    const typeRaw = String(item?.type || "").trim();
    const type = codexPlusUsageItemType(typeRaw);
    const server = codexPlusUsageFirstString(item, ["server", "serverName", "server_name", "mcpServer", "mcp_server"]);
    const tool = codexPlusUsageFirstString(item, ["toolName", "tool_name", "tool", "name"]);
    const namespace = codexPlusUsageFirstString(item, ["namespace"]);
    const plugin = codexPlusUsageFirstString(item, ["pluginId", "plugin_id"]);
    const script = codexPlusUsageFirstString(item, ["scriptPath", "script_path"]);
    const label = codexPlusUsageFirstString(item, ["label", "title"]);
    const command = codexPlusUsageFirstString(item, ["command"]);
    const identity = [typeRaw, server, tool, namespace, plugin, script, label].join(" ").toLowerCase();
    const fallback = (tool || label || namespace || server || typeRaw || "tool").slice(0, 80);
    const detail = [server, tool].filter(Boolean).join(" · ").slice(0, 120);
    const result = (key, name = "") => {
      const parts = [codexPlusUsageToolLabel(key, fallback), String(name || "").trim()].filter(Boolean);
      return { key, fallback, detail, label: parts.join(" · ").slice(0, 120) };
    };

    if (/hindsight|memory|memories|knowledge.?base/.test(identity)
        || /(?:^|[\\/])\.codex[\\/]+memories(?:[\\/]|$)/i.test(command)) {
      return result("memory", [server, tool].filter(Boolean).join(" / "));
    }
    if (/skill\.md|(?:^|[\\/])\.(?:agents|codex)[\\/]+skills(?:[\\/]|$)/i.test(command)
        || /(?:^|[\s:/\\])skills?(?:$|[-_\s:/\\])/.test(identity)) {
      return result("skills", tool || label);
    }
    if (type.startsWith("hook") || /\bhooks?\b/.test(identity)) return result("hook", label || tool);
    if (type === "mcptoolcall" || server) return result("mcp", [server, tool].filter(Boolean).join(" / "));
    if (type === "commandexecution") return result("command", codexPlusUsageCommandSummary(item));
    if (type === "filechange" || type.includes("applypatch") || type.includes("filechange")) {
      return result("file", codexPlusUsageFileSummary(item) || tool || label);
    }
    if (type === "imageview") {
      return result("imageView", codexPlusUsageBaseName(codexPlusUsageFirstString(item, ["path"])));
    }
    if (type === "imagegeneration") {
      return result("imageGeneration", codexPlusUsageFirstString(item, ["revisedPrompt", "revised_prompt", "savedPath", "saved_path"]));
    }
    if (type === "websearch") return result("webSearch", codexPlusUsageFirstString(item, ["query"]));
    if (type === "collabagenttoolcall" || type === "subagentactivity") {
      return result("agent", tool || codexPlusUsageFirstString(item, ["prompt", "agentPath", "agent_path"]));
    }
    if (type === "dynamictoolcall" || type === "functioncalloutput") {
      return result("dynamic", [namespace, tool].filter(Boolean).join(" / "));
    }
    if (type === "enteredreviewmode" || type === "exitedreviewmode") {
      return result("review", codexPlusUsageFirstString(item, ["review"]).split(/\r?\n/)[0]);
    }
    if (type === "sleep") return result("sleep", codexPlusUsageFirstString(item, ["durationMs", "duration_ms"]));
    if (type === "contextcompaction") return result("contextCompaction");

    const key = `tool:${(fallback || "other").toLowerCase()}`.slice(0, 100);
    return { key, fallback, detail, label: fallback || codexPlusUsageToolLabel("other", "tool") };
  }

  function codexPlusUsageToolLabel(categoryKey, fallback) {
    const labels = codexPlusUsageText().labels.toolKinds;
    return labels[categoryKey] || fallback || labels.other;
  }

  function codexPlusUsageMergedDuration(intervals) {
    if (!Array.isArray(intervals) || !intervals.length) return 0;
    const ordered = intervals
      .filter((interval) => Array.isArray(interval) && Number.isFinite(interval[0]) && Number.isFinite(interval[1]))
      .map((interval) => [Math.min(interval[0], interval[1]), Math.max(interval[0], interval[1])])
      .sort((left, right) => left[0] - right[0]);
    if (!ordered.length) return 0;
    let total = 0;
    let [start, end] = ordered[0];
    for (let index = 1; index < ordered.length; index += 1) {
      const [nextStart, nextEnd] = ordered[index];
      if (nextStart <= end) {
        end = Math.max(end, nextEnd);
      } else {
        total += end - start;
        start = nextStart;
        end = nextEnd;
      }
    }
    return total + end - start;
  }

  function codexPlusUsageToolDurationBetween(turn, start, end) {
    if (!(end > start)) return 0;
    const intervals = turn?.toolIntervals?.slice?.() || [];
    for (const tool of turn?.activeTools?.values?.() || []) {
      if (Number.isFinite(tool?.startedAt)) intervals.push([tool.startedAt, end]);
    }
    return codexPlusUsageMergedDuration(intervals
      .filter((interval) => Array.isArray(interval) && interval[1] > start && interval[0] < end)
      .map((interval) => [Math.max(start, interval[0]), Math.min(end, interval[1])]));
  }

  function codexPlusUsageSameTotals(left, right) {
    if (!left || !right) return false;
    return ["input", "cached", "output", "total"].every((key) => left[key] === right[key]);
  }

  function codexPlusUsageCreateTurn(threadId, turnId, startedAt, totalOutputSeen = null, totalUsageSeen = null) {
    return {
      threadId,
      turnId: turnId || "",
      startedAt: Number.isFinite(startedAt) ? startedAt : Date.now(),
      completedAt: null,
      status: "running",
      inputTokens: 0,
      outputTokens: 0,
      cachedInputTokens: 0,
      totalTokens: 0,
      usageSamples: 0,
      totalOutputSeen: Number.isFinite(totalOutputSeen) ? totalOutputSeen : null,
      totalInputSeen: Number.isFinite(totalUsageSeen?.input) ? totalUsageSeen.input : null,
      totalCachedInputSeen: Number.isFinite(totalUsageSeen?.cached) ? totalUsageSeen.cached : null,
      totalTokenSeen: Number.isFinite(totalUsageSeen?.total) ? totalUsageSeen.total : null,
      contextTokens: null,
      contextWindow: null,
      firstTokenAt: null,
      decodeStartedAt: null,
      decodeMs: 0,
      speedSamples: [],
      speedIntervalStartedAt: Number.isFinite(startedAt) ? startedAt : Date.now(),
      activeSkills: [],
      historySeeded: false,
      observedFromStart: false,
      lastHistorySample: null,
      skipMatchingUsage: false,
      toolIntervals: [],
      toolDetails: [],
      activeTools: new Map(),
      lastEventAt: Number.isFinite(startedAt) ? startedAt : Date.now(),
    };
  }

  function codexPlusUsageFlushDecode(turn, at) {
    if (!turn || turn.decodeStartedAt == null) return;
    turn.decodeMs += Math.max(0, at - turn.decodeStartedAt);
    turn.decodeStartedAt = null;
  }

  function codexPlusUsageCloseActiveTools(turn, at) {
    if (!turn?.activeTools?.size) return;
    for (const [id, tool] of turn.activeTools) {
      codexPlusUsageRecordTool(turn, id, tool, tool?.startedAt, at);
    }
    turn.activeTools.clear();
  }

  function codexPlusUsageRecordTool(turn, id, kind, startedAt, endedAt, durationMs = null) {
    if (!turn || !kind) return;
    const duration = codexPlusUsageNumber(durationMs);
    let start = codexPlusUsageNumber(startedAt);
    let end = codexPlusUsageNumber(endedAt);
    if (!(end > start) && duration > 0 && end != null) start = end - duration;
    if (start != null && end > start) turn.toolIntervals.push([start, end]);
    if (kind.visible !== false) {
      turn.toolDetails.push({
        id: String(id || `${kind.key}:${turn.toolDetails.length}`),
        categoryKey: kind.key,
        fallback: kind.fallback,
        label: kind.label,
        detail: kind.detail,
        startedAt: start != null && end > start ? start : null,
        endedAt: start != null && end > start ? end : null,
      });
    }
  }

  function codexPlusUsageApplyEvent(turn, method, payload, now) {
    if (!turn) return turn;
    const at = Number.isFinite(now) ? now : Date.now();
    const data = codexPlusUsageEventData(payload);
    turn.lastEventAt = at;

    if (method === "item/agentMessage/delta"
        || method === "item/reasoning/textDelta"
        || method === "item/reasoning/summaryTextDelta") {
      if (typeof data.delta === "string" && data.delta.length > 0) {
        if (turn.firstTokenAt == null) turn.firstTokenAt = at;
        if (turn.decodeStartedAt == null) turn.decodeStartedAt = at;
      }
      return turn;
    }

    if (method === "hook/started" || method === "hook/completed") {
      const run = data.run || {};
      const id = `hook:${run.id || `${run.eventName || "hook"}:${run.startedAt || at}`}`;
      const hookName = codexPlusUsageFirstString(run, ["eventName", "event_name"]);
      const hookHandler = codexPlusUsageFirstString(run, ["handlerType", "handler_type"]);
      const kind = {
        key: "hook",
        fallback: "Hook",
        label: [codexPlusUsageToolLabel("hook", "Hook"), hookName, hookHandler].filter(Boolean).join(" · "),
        detail: [run.eventName, run.handlerType].filter(Boolean).join(" · "),
      };
      if (method === "hook/started") {
        if (!turn.activeTools.has(id)) turn.activeTools.set(id, { ...kind, startedAt: at });
      } else {
        const active = turn.activeTools.get(id);
        const startedAt = active?.startedAt ?? codexPlusUsageNumber(run.startedAt);
        const completedAt = codexPlusUsageNumber(run.completedAt) ?? at;
        codexPlusUsageRecordTool(turn, id, kind, startedAt, completedAt, run.durationMs ?? run.duration_ms);
        turn.activeTools.delete(id);
      }
      return turn;
    }

    if (method === "rawResponseItem/completed") {
      const item = data.item;
      if (codexPlusUsageItemType(item?.type) === "customtoolcall") {
        const id = item.call_id || item.callId || item.id || `custom:${turn.toolDetails.length}`;
        codexPlusUsageRecordTool(turn, id, codexPlusUsageToolKind({ ...item, type: item.name || item.type }));
      }
      return turn;
    }

    if (method === "item/started") {
      const item = data.item;
      if (item?.id && codexPlusUsageIsToolItem(item.type)) {
        codexPlusUsageFlushDecode(turn, at);
        if (!turn.activeTools.has(item.id)) {
          const kind = codexPlusUsageItemType(item.type) === "commandexecution"
            ? codexPlusUsageCommandKind(turn, item)
            : codexPlusUsageToolKind(item);
          turn.activeTools.set(item.id, { ...kind, startedAt: at });
        }
      }
      return turn;
    }

    if (method === "item/completed") {
      const item = data.item;
      if (item?.id && codexPlusUsageIsToolItem(item.type)) {
        const active = turn.activeTools.get(item.id);
        const kind = codexPlusUsageItemType(item.type) === "commandexecution"
          ? codexPlusUsageCommandKind(turn, item)
          : codexPlusUsageToolKind(item);
        codexPlusUsageRecordTool(
          turn,
          item.id,
          kind,
          active?.startedAt,
          at,
          item.durationMs ?? item.duration_ms,
        );
        turn.activeTools.delete(item.id);
      }
      if (codexPlusUsageItemType(item?.type) === "usermessage") {
        turn.activeSkills = codexPlusUsageSkillNames(item);
      }
      if (codexPlusUsageItemType(item?.type) === "hookprompt") {
        for (const [index, fragment] of (item.fragments || []).entries()) {
          const id = `hook:${fragment.hookRunId || fragment.hook_run_id || `${item.id}:${index}`}`;
          const text = String(fragment.text || "").replace(/\s+/g, " ").trim().slice(0, 48);
          codexPlusUsageRecordTool(turn, id, {
            key: "hook",
            fallback: "Hook",
            label: [codexPlusUsageToolLabel("hook", "Hook"), text].filter(Boolean).join(" · "),
            detail: String(fragment.text || "").slice(0, 120),
          });
        }
      }
      if (["agentmessage", "plan"].includes(codexPlusUsageItemType(item?.type))) codexPlusUsageFlushDecode(turn, at);
      return turn;
    }

    if (method === "thread/tokenUsage/updated") {
      const usage = data.tokenUsage || data.token_usage || {};
      const total = usage.total || usage;
      const last = usage.last || total;
      const current = codexPlusUsageTokenTotals(total);
      if (!current) return turn;
      const previous = codexPlusUsageTokenTotals(last)
        ?? { input: 0, cached: 0, output: 0, total: 0 };
      const contextWindow = codexPlusUsageNumber(usage.modelContextWindow ?? usage.model_context_window);
      if (contextWindow && contextWindow > 0) turn.contextWindow = contextWindow;
      const contextTokens = previous.total ?? current.total;
      if (contextTokens != null) turn.contextTokens = Math.max(turn.contextTokens || 0, contextTokens);
      const samples = [
        ["inputTokens", "totalInputSeen", current.input, previous.input],
        ["cachedInputTokens", "totalCachedInputSeen", current.cached, previous.cached],
        ["outputTokens", "totalOutputSeen", current.output, previous.output],
        ["totalTokens", "totalTokenSeen", current.total, previous.total],
      ];
      const duplicateHistory = turn.skipMatchingUsage
        && codexPlusUsageSameTotals(previous, turn.lastHistorySample);
      if (duplicateHistory) {
        for (const [, seenField, currentValue] of samples) {
          turn[seenField] = currentValue;
        }
        turn.skipMatchingUsage = false;
        turn.lastHistorySample = null;
        turn.speedIntervalStartedAt = at;
        return turn;
      }
      const intervalStartedAt = Number.isFinite(turn.speedIntervalStartedAt)
        ? turn.speedIntervalStartedAt
        : turn.startedAt;
      let changed = false;
      let outputDelta = 0;
      for (const [field, seenField, current, lastValue] of samples) {
        if (current == null) continue;
        if (turn[seenField] == null || current < turn[seenField]) {
          turn[seenField] = Math.max(0, current - lastValue);
        }
        const delta = Math.max(0, current - turn[seenField]);
        if (delta > 0) {
          turn[field] += delta;
          if (field === "outputTokens") outputDelta = delta;
          changed = true;
        }
        turn[seenField] = current;
      }
      if (changed) {
        turn.usageSamples += 1;
        const output = previous.output > 0 ? previous.output : outputDelta;
        const toolMs = codexPlusUsageToolDurationBetween(turn, intervalStartedAt, at);
        const latencyMs = Math.max(0, at - intervalStartedAt - toolMs);
        if (output > 0 && latencyMs >= 250) {
          turn.speedSamples.push({ outputTokens: output, latencyMs });
          if (turn.speedSamples.length > 24) turn.speedSamples.shift();
        }
      }
      turn.skipMatchingUsage = false;
      turn.lastHistorySample = null;
      turn.speedIntervalStartedAt = at;
      return turn;
    }

    if (method === "turn/completed") {
      const completedAt = codexPlusUsageNumber(data.turn?.completedAt);
      const durationMs = codexPlusUsageNumber(data.turn?.durationMs);
      const end = completedAt != null ? completedAt * 1000 : (durationMs != null ? turn.startedAt + durationMs : at);
      codexPlusUsageFlushDecode(turn, end);
      codexPlusUsageCloseActiveTools(turn, end);
      turn.completedAt = Math.max(turn.startedAt, end);
      turn.status = String(data.turn?.status || "completed");
      return turn;
    }

    return turn;
  }

  function codexPlusUsageTurnSnapshot(turn, now) {
    if (!turn) return null;
    const at = Number.isFinite(now) ? now : Date.now();
    const end = turn.completedAt ?? at;
    const turnMs = Math.max(0, end - turn.startedAt);
    let decodeMs = turn.decodeMs;
    if (turn.decodeStartedAt != null) decodeMs += Math.max(0, end - turn.decodeStartedAt);
    const intervals = turn.toolIntervals.slice();
    for (const tool of turn.activeTools.values()) {
      if (Number.isFinite(tool?.startedAt)) intervals.push([tool.startedAt, end]);
    }
    const toolMs = codexPlusUsageMergedDuration(intervals);
    const ttftMs = turn.firstTokenAt == null ? null : codexPlusUsageClamp(turn.firstTokenAt - turn.startedAt, 0, turnMs);
    const otherMs = Math.max(0, turnMs - (ttftMs || 0) - decodeMs - toolMs);
    const speedOutput = turn.speedSamples.reduce((total, sample) => total + sample.outputTokens, 0);
    const speedDuration = turn.speedSamples.reduce((total, sample) => total + sample.latencyMs, 0);
    const toolCalls = new Map();
    const addToolCall = (detail, detailEnd = end) => {
      if (!detail) return;
      const id = String(detail.id || `${detail.categoryKey || "other"}:${toolCalls.size}`);
      const categoryKey = String(detail.categoryKey || "other");
      const fallback = String(detail.fallback || "");
      const label = String(detail.label || codexPlusUsageToolLabel(categoryKey, fallback)).trim();
      const timed = Number.isFinite(detail.startedAt)
        && Number.isFinite(detailEnd)
        && detailEnd > detail.startedAt;
      let call = toolCalls.get(id);
      if (!call) {
        call = { id, categoryKey, fallback, label, intervals: [], details: new Set(), timed: false };
        toolCalls.set(id, call);
      }
      if (!call.label || (timed && !call.timed)) call.label = label || call.label;
      if (timed) {
        call.intervals.push([detail.startedAt, detailEnd]);
        call.timed = true;
      }
      if (detail.detail && call.details.size < 6) call.details.add(String(detail.detail));
    };
    for (const detail of turn.toolDetails) addToolCall(detail, detail.endedAt);
    for (const [id, tool] of turn.activeTools) addToolCall({ ...tool, id }, end);

    const toolGroups = new Map();
    for (const call of toolCalls.values()) {
      const key = `${call.categoryKey}:${call.label}`;
      if (!toolGroups.has(key)) {
        toolGroups.set(key, { ids: new Set(), intervals: [], categoryKey: call.categoryKey, label: call.label, details: new Set() });
      }
      const group = toolGroups.get(key);
      group.ids.add(call.id);
      group.intervals.push(...call.intervals);
      for (const detail of call.details) {
        if (group.details.size < 6) group.details.add(detail);
      }
    }
    const toolDetails = [...toolGroups.values()]
      .map((group) => ({
        categoryKey: group.categoryKey,
        label: group.label,
        detail: [...group.details].join(" / "),
        count: group.ids.size,
        durationMs: codexPlusUsageMergedDuration(group.intervals),
      }))
      .filter((detail) => detail.count > 0 || detail.durationMs > 0)
      .sort((left, right) => right.durationMs - left.durationMs
        || right.count - left.count
        || left.label.localeCompare(right.label));
    const contextPercent = turn.contextWindow > 0 && turn.contextTokens != null
      ? codexPlusUsageClamp(turn.contextTokens / turn.contextWindow * 100, 0, 100)
      : null;
    return {
      speed: speedDuration > 0 && speedOutput > 0 ? speedOutput / (speedDuration / 1000) : null,
      ttftMs,
      decodeMs,
      toolMs,
      otherMs,
      turnMs,
      startedAt: turn.startedAt,
      endedAt: end,
      outputTokens: turn.outputTokens,
      contextPercent,
      contextWindow: turn.contextWindow,
      toolDetails,
      usage: {
        input: turn.inputTokens,
        output: turn.outputTokens,
        cached: turn.cachedInputTokens,
        hitRate: turn.inputTokens > 0 ? Math.min(1, turn.cachedInputTokens / turn.inputTokens) : null,
        total: turn.totalTokens,
      },
      samples: turn.usageSamples,
      completed: turn.completedAt != null,
      status: turn.status,
    };
  }

  function codexPlusUsageHistorySamples(result) {
    const rows = Array.isArray(result?.history) ? result.history : [];
    const samples = [];
    const seen = new Set();
    for (const row of rows) {
      const observedAt = Date.parse(row?.observed_at || row?.observedAt || row?.timestamp || row?.created_at || "");
      const usage = codexPlusUsageTokenTotals(row?.usage || row?.tokenUsage || row?.token_usage || row);
      if (!Number.isFinite(observedAt) || !usage) continue;
      const turnId = String(row?.turn_id || row?.turnId || "");
      const key = [observedAt, turnId, usage.input, usage.cached, usage.output, usage.total].join("|");
      if (seen.has(key)) continue;
      seen.add(key);
      const contextWindow = codexPlusUsageNumber(
        row?.usage?.contextLimit
        ?? row?.usage?.context_limit
        ?? row?.usage?.modelContextWindow
        ?? row?.usage?.model_context_window,
      );
      samples.push({ observedAt, turnId, ...usage, contextTokens: usage.total, contextWindow });
    }
    return samples.sort((left, right) => left.observedAt - right.observedAt);
  }

  function codexPlusUsageSeedHistoryTurn(threadId) {
    const samples = codexPlusUsageState.historySamples;
    if (!threadId || !samples.length) return;
    const live = codexPlusUsageState.turns.get(threadId);
    const turnId = live?.turnId || samples[samples.length - 1]?.turnId;
    const attempts = samples.filter((sample) => sample.turnId === turnId);
    if (!turnId || !attempts.length) return;
    const sums = attempts.reduce((total, sample) => ({
      input: total.input + sample.input,
      cached: total.cached + sample.cached,
      output: total.output + sample.output,
      total: total.total + sample.total,
    }), { input: 0, cached: 0, output: 0, total: 0 });
    const turn = live?.turnId === turnId
      ? live
      : codexPlusUsageCreateTurn(threadId, turnId, attempts[0].observedAt);
    turn.inputTokens = sums.input;
    turn.cachedInputTokens = sums.cached;
    turn.outputTokens = sums.output;
    turn.totalTokens = sums.total;
    turn.usageSamples = attempts.length;
    turn.totalInputSeen = null;
    turn.totalCachedInputSeen = null;
    turn.totalOutputSeen = null;
    turn.totalTokenSeen = null;
    turn.historySeeded = true;
    turn.lastHistorySample = { ...attempts[attempts.length - 1] };
    turn.skipMatchingUsage = true;
    const latest = attempts[attempts.length - 1];
    if (latest.contextTokens != null) turn.contextTokens = latest.contextTokens;
    if (latest.contextWindow && latest.contextWindow > 0) turn.contextWindow = latest.contextWindow;
    if (!live || live.turnId !== turnId) {
      turn.startedAt = attempts[0].observedAt;
      turn.completedAt = attempts[attempts.length - 1].observedAt;
      turn.lastEventAt = turn.completedAt;
      turn.status = "completed";
      turn.speedIntervalStartedAt = turn.completedAt;
    }
    codexPlusUsageRememberTurn(turn);
  }

  function codexPlusUsageBeijingDateTime(value) {
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return "";
    const shifted = new Date(date.getTime() + 8 * 60 * 60 * 1000);
    const pad = (number) => String(number).padStart(2, "0");
    return `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}T${pad(shifted.getUTCHours())}:${pad(shifted.getUTCMinutes())}`;
  }

  function codexPlusUsageBeijingDate(value) {
    if (typeof value !== "string" || !value.trim()) return NaN;
    const normalized = value.length === 16 ? `${value}:00` : value;
    return Date.parse(`${normalized}+08:00`);
  }

  function codexPlusUsageBeijingDayStart(value) {
    const shifted = new Date(value + 8 * 60 * 60 * 1000);
    return Date.UTC(
      shifted.getUTCFullYear(),
      shifted.getUTCMonth(),
      shifted.getUTCDate(),
    ) - 8 * 60 * 60 * 1000;
  }

  function codexPlusUsageRangeBounds(range, now = Date.now()) {
    const dayMs = 24 * 60 * 60 * 1000;
    const today = codexPlusUsageBeijingDayStart(now);
    if (range === "today") return { start: today, end: now };
    if (range === "threeDay") return { start: today - 2 * dayMs, end: now };
    if (range === "week") return { start: today - 6 * dayMs, end: now };
    if (range === "custom") {
      const start = codexPlusUsageBeijingDate(codexPlusUsageState.customStart);
      const end = codexPlusUsageBeijingDate(codexPlusUsageState.customEnd);
      if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return null;
      return { start, end };
    }
    return null;
  }

  function codexPlusUsageIsGlobalRange(range) {
    return range === "today" || range === "threeDay" || range === "week";
  }

  function codexPlusUsageBeijingDateKey(value) {
    const shifted = new Date(value + 8 * 60 * 60 * 1000);
    const pad = (number) => String(number).padStart(2, "0");
    return `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}`;
  }

  function codexPlusUsageAbsoluteUrl(value) {
    try {
      return new URL(String(value || ""), document.baseURI || location.href).href;
    } catch {
      return "";
    }
  }

  function codexPlusUsageLoadedAssetUrls() {
    const urls = new Set();
    for (const node of document.querySelectorAll("script[src],link[href]")) {
      const url = codexPlusUsageAbsoluteUrl(node.src || node.href);
      if (/\/assets\/.+\.js(?:$|\?)/.test(url)) urls.add(url);
    }
    try {
      for (const entry of performance.getEntriesByType?.("resource") || []) {
        const url = codexPlusUsageAbsoluteUrl(entry.name);
        if (/\/assets\/.+\.js(?:$|\?)/.test(url)) urls.add(url);
      }
    } catch {
    }
    return [...urls];
  }

  async function codexPlusUsageResolveAppServices() {
    if (codexPlusUsageState.globalAppServicesPromise) return codexPlusUsageState.globalAppServicesPromise;
    codexPlusUsageState.globalAppServicesPromise = (async () => {
      const urls = codexPlusUsageLoadedAssetUrls().filter((url) => /\/assets\/rpc-[^/]+\.js(?:$|\?)/.test(url));
      for (const url of urls) {
        try {
          const moduleExports = await import(/* @vite-ignore */ url);
          if (moduleExports?.appServices?.localThreadCatalog) return moduleExports.appServices;
        } catch {
        }
      }
      return null;
    })();
    return codexPlusUsageState.globalAppServicesPromise;
  }

  function codexPlusUsageThreadTimestamp(value) {
    if (typeof value === "number") return value < 1e12 ? value * 1000 : value;
    const parsed = Date.parse(String(value || ""));
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function codexPlusUsageUuidTime(value) {
    const compact = String(value || "").replace(/-/g, "");
    if (!/^[0-9a-f]{12}/i.test(compact) || compact[12]?.toLowerCase() !== "7") return 0;
    return Number.parseInt(compact.slice(0, 12), 16) || 0;
  }

  function codexPlusUsageThreadIdentity(entry) {
    return codexPlusUsageNormalizeThreadId(
      entry?.id || entry?.threadId || entry?.thread_id || entry?.conversationId || entry?.conversation_id,
    );
  }

  function codexPlusUsageThreadUpdatedAt(entry) {
    return codexPlusUsageThreadTimestamp(
      entry?.updatedAt
      ?? entry?.updated_at
      ?? entry?.lastUpdatedAt
      ?? entry?.last_updated_at
      ?? entry?.sourceUpdatedAt
      ?? entry?.sourceRecencyAt
      ?? entry?.createdAt
      ?? entry?.created_at,
    ) || codexPlusUsageUuidTime(codexPlusUsageThreadIdentity(entry));
  }

  function codexPlusUsageBootstrapThreadIds(bootstrap) {
    const ids = new Set();
    for (const entry of bootstrap?.catalogEntries || []) {
      const id = codexPlusUsageThreadIdentity(entry);
      if (id) ids.add(id);
    }
    const trackedKeys = new Set(["projectless-thread-ids", "thread-workspace-root-hints", "thread-project-assignments"]);
    for (const entry of bootstrap?.globalStateEntries || []) {
      if (!trackedKeys.has(entry?.key)) continue;
      const values = Array.isArray(entry.value) ? entry.value : Object.keys(entry.value || {});
      for (const value of values) {
        const id = codexPlusUsageNormalizeThreadId(value);
        if (id) ids.add(id);
      }
    }
    return [...ids];
  }

  async function codexPlusUsageRecentThreadIds() {
    const services = await codexPlusUsageResolveAppServices();
    const bootstrap = await window.electronBridge?.getInitialSidebarBootstrap?.();
    if (!services?.localThreadCatalog || !bootstrap) return [];
    const ids = new Set(codexPlusUsageBootstrapThreadIds(bootstrap));
    const entries = new Map();
    for (const entry of bootstrap.catalogEntries || []) {
      const id = codexPlusUsageThreadIdentity(entry);
      if (id) entries.set(id, entry);
    }
    const allIds = [...ids];
    for (let offset = 0; offset < allIds.length; offset += 100) {
      const refs = allIds.slice(offset, offset + 100).map((threadId) => ({ hostId: "local", threadId }));
      try {
        const rows = await services.localThreadCatalog.readEntries(refs);
        for (const entry of rows || []) {
          const id = codexPlusUsageThreadIdentity(entry);
          if (id) {
            ids.add(id);
            entries.set(id, entry);
          }
        }
      } catch {
      }
    }
    const minimum = codexPlusUsageBeijingDayStart(Date.now()) - 6 * 24 * 60 * 60 * 1000;
    return [...ids]
      .map((id) => ({ id, updatedAt: codexPlusUsageThreadUpdatedAt(entries.get(id) || { id }) }))
      .filter((entry) => entry.updatedAt >= minimum)
      .sort((left, right) => right.updatedAt - left.updatedAt)
      .slice(0, 200)
      .map((entry) => entry.id);
  }

  async function codexPlusUsageMapLimit(items, limit, mapper) {
    const results = new Array(items.length);
    let index = 0;
    await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
      while (index < items.length) {
        const current = index;
        index += 1;
        results[current] = await mapper(items[current]);
      }
    }));
    return results;
  }

  async function codexPlusUsageScanGlobalSessions() {
    const threadIds = await codexPlusUsageRecentThreadIds();
    if (!threadIds.length || typeof window.codexPlus?.call !== "function") {
      return { samples: [], threadsRead: 0 };
    }
    let threadsRead = 0;
    const seen = new Set();
    const samples = [];
    const results = await codexPlusUsageMapLimit(threadIds, 2, async (threadId) => {
      try {
        const result = await window.codexPlus.call("/thread-usage-history", { session_id: threadId });
        threadsRead += 1;
        return codexPlusUsageHistorySamples(result).map((sample) => ({ ...sample, threadId }));
      } catch {
        return [];
      }
    });
    for (const threadSamples of results) {
      for (const sample of threadSamples) {
        const key = [sample.threadId, sample.turnId, sample.observedAt, sample.input, sample.cached, sample.output, sample.total].join("|");
        if (seen.has(key)) continue;
        seen.add(key);
        samples.push(sample);
      }
    }
    samples.sort((left, right) => left.observedAt - right.observedAt);
    return { samples, threadsRead };
  }

  function codexPlusUsageGlobalTotal(range, now = Date.now()) {
    const bounds = codexPlusUsageRangeBounds(range, now);
    if (!bounds) return null;
    if (codexPlusUsageState.globalUsageScanned) {
      return codexPlusUsageState.globalUsageSamples
        .filter((sample) => sample.observedAt >= bounds.start && sample.observedAt <= bounds.end)
        .reduce((total, sample) => total + sample.total, 0);
    }
    if (!codexPlusUsageIsGlobalRange(range)) return null;
    const api = window[codexPlusUsageGlobalApiKey];
    if (typeof api?.getSnapshot !== "function") return null;
    const dayMs = 24 * 60 * 60 * 1000;
    const count = range === "today" ? 1 : range === "threeDay" ? 3 : 7;
    const today = codexPlusUsageBeijingDayStart(now);
    let total = 0;
    for (let index = 0; index < count; index += 1) {
      const snapshot = api.getSnapshot(codexPlusUsageBeijingDateKey(today - index * dayMs));
      if (!Number.isFinite(snapshot?.total)) return null;
      total += snapshot.total;
    }
    return total;
  }

  async function codexPlusUsageRefreshGlobalUsage(force = false) {
    if (codexPlusUsageState.globalUsagePromise) return codexPlusUsageState.globalUsagePromise;
    if (!force && Date.now() - codexPlusUsageState.globalUsageFetchedAt < codexPlusUsageGlobalRefreshMs) return null;
    codexPlusUsageState.globalUsageLoading = true;
    codexPlusUsageState.globalUsageError = "";
    codexPlusUsageState.globalUsagePromise = (async () => {
      try {
        const scan = await codexPlusUsageScanGlobalSessions();
        if (!scan.threadsRead) throw new Error("未找到可读取的 Codex 会话");
        codexPlusUsageState.globalUsageSamples = scan.samples;
        codexPlusUsageState.globalUsageScanned = true;
        codexPlusUsageState.globalUsageFetchedAt = Date.now();
      } catch (scanError) {
        const api = window[codexPlusUsageGlobalApiKey];
        if (typeof api?.runHistoryBackfill !== "function") throw scanError;
        await api.runHistoryBackfill();
        codexPlusUsageState.globalUsageSamples = [];
        codexPlusUsageState.globalUsageScanned = false;
        codexPlusUsageState.globalUsageFetchedAt = Date.now();
      }
    })().catch((error) => {
      codexPlusUsageState.globalUsageError = String(error?.message || error);
    }).finally(() => {
      codexPlusUsageState.globalUsageLoading = false;
      codexPlusUsageState.globalUsagePromise = null;
      if (!codexPlusUsageState.disposed) {
        codexPlusUsageRender(codexPlusUsageTurnSnapshot(codexPlusUsageState.turns.get(codexPlusUsageState.threadId), Date.now()));
      }
    });
    return codexPlusUsageState.globalUsagePromise;
  }

  function codexPlusUsageSelectedConsumption(snapshot) {
    const text = codexPlusUsageText();
    if (codexPlusUsageState.range === "task") {
      return { label: text.labels.task, value: snapshot?.usage?.total ?? null };
    }
    const label = text.labels[codexPlusUsageState.range] || text.labels.custom;
    return { label, value: codexPlusUsageGlobalTotal(codexPlusUsageState.range) };
  }

  async function codexPlusUsageLoadHistory(force = false) {
    const threadId = codexPlusUsageState.threadId;
    if (!threadId || typeof window.codexPlus?.call !== "function") return;
    const fresh = codexPlusUsageState.historyThreadId === threadId
      && Date.now() - codexPlusUsageState.historyFetchedAt < 15_000;
    if (!force && fresh) return;
    if (codexPlusUsageState.historyPromise) return codexPlusUsageState.historyPromise;
    codexPlusUsageState.historyLoading = true;
    codexPlusUsageState.historyError = "";
    codexPlusUsageRender(codexPlusUsageTurnSnapshot(codexPlusUsageState.turns.get(threadId), Date.now()));
    codexPlusUsageState.historyPromise = (async () => {
      try {
        const result = await window.codexPlus.call("/thread-usage-history", { session_id: threadId });
        if (codexPlusUsageState.disposed || codexPlusUsageState.threadId !== threadId) return;
        codexPlusUsageState.historyThreadId = threadId;
        codexPlusUsageState.historySamples = codexPlusUsageHistorySamples(result);
        codexPlusUsageState.historyFetchedAt = Date.now();
        codexPlusUsageSeedHistoryTurn(threadId);
      } catch (error) {
        if (codexPlusUsageState.threadId === threadId) {
          codexPlusUsageState.historyError = String(error?.message || error);
        }
      } finally {
        if (!codexPlusUsageState.disposed) {
          codexPlusUsageState.historyLoading = false;
          codexPlusUsageState.historyPromise = null;
          codexPlusUsageRender(codexPlusUsageTurnSnapshot(codexPlusUsageState.turns.get(codexPlusUsageState.threadId), Date.now()));
        }
      }
    })();
    return codexPlusUsageState.historyPromise;
  }

  function codexPlusUsageComposerCard() {
    const cards = [...document.querySelectorAll("[data-composer-surface-variant]")];
    let fallback = null;
    for (const card of cards) {
      if (!visibleElement(card) || card.closest("[data-codex-plus-ext]")) continue;
      fallback = card;
      if (card.querySelector('.ProseMirror[contenteditable="true"], textarea:not(:disabled):not([readonly]), [role="textbox"][contenteditable="true"]')) {
        return card;
      }
    }
    return fallback;
  }

  function codexPlusUsageThreadId(card) {
    const composerRoot = card?.closest("[data-codex-composer-root]");
    const fromComposer = composerRoot
      ?.querySelector("[data-above-composer-conversation-id]")
      ?.getAttribute("data-above-composer-conversation-id");
    const inThread = composerRoot?.getAttribute("data-composer-placement") === "thread";
    const fromSidebar = inThread
      ? document
        .querySelector('[data-app-action-sidebar-thread-selected="true"][data-app-action-sidebar-thread-id]')
        ?.getAttribute("data-app-action-sidebar-thread-id")
      : null;
    const id = String(fromComposer || fromSidebar || "").replace(/^local:/, "").trim();
    if (id.startsWith("client-new-thread:")) return "";
    return codexPlusUsageNormalizeThreadId(id);
  }

  function codexPlusUsageRememberTurn(turn) {
    if (!turn?.threadId) return;
    codexPlusUsageState.turns.delete(turn.threadId);
    codexPlusUsageState.turns.set(turn.threadId, turn);
    if (codexPlusUsageState.turns.size > codexPlusUsageMaxTurns) {
      codexPlusUsageState.turns.delete(codexPlusUsageState.turns.keys().next().value);
    }
  }

  function codexPlusUsageTurnFor(threadId, turnId, startedAt, reset = false) {
    const previous = codexPlusUsageState.turns.get(threadId);
    if (previous && turnId && previous.turnId === turnId) return previous;
    if (!reset && previous && !turnId) return previous;
    const totalOutputSeen = previous?.totalOutputSeen ?? null;
    const totalUsageSeen = previous
      ? { input: previous.totalInputSeen, cached: previous.totalCachedInputSeen, total: previous.totalTokenSeen }
      : null;
    const turn = codexPlusUsageCreateTurn(threadId, turnId, startedAt, totalOutputSeen, totalUsageSeen);
    codexPlusUsageRememberTurn(turn);
    return turn;
  }

  function codexPlusUsageHandleEvent(method, payload) {
    if (codexPlusUsageState.disposed) return;
    const data = codexPlusUsageEventData(payload);
    if (!codexPlusUsageEventIsLocal(data)) return;
    const threadId = codexPlusUsageEventThreadId(data);
    if (!threadId) return;
    const turnId = codexPlusUsageEventTurnId(data);
    const previous = codexPlusUsageState.turns.get(threadId);
    if (!codexPlusUsageAcceptsTurnEvent(previous, method, turnId)) return;
    const startedAt = method === "turn/started"
      ? (codexPlusUsageNumber(data.turn?.startedAt) || 0) * 1000
      : Date.now();
    let turn = method === "turn/started"
      ? codexPlusUsageTurnFor(threadId, turnId, startedAt || Date.now(), true)
      : codexPlusUsageTurnFor(threadId, turnId, startedAt);
    if (method === "turn/started") turn.observedFromStart = true;
    turn = codexPlusUsageApplyEvent(turn, method, data, Date.now());
    codexPlusUsageRememberTurn(turn);
    if (method === "turn/completed" && !turn.observedFromStart && !turn.historySeeded) {
      void codexPlusUsageLoadHistory(true);
    }
    if (codexPlusUsageState.threadId === threadId) {
      codexPlusUsageRender(codexPlusUsageTurnSnapshot(turn, Date.now()));
      codexPlusUsageSchedule(codexPlusUsageActiveTickMs);
    }
  }

  function codexPlusUsageUnsubscribe() {
    for (const unsubscribe of codexPlusUsageState.unsubscribers.splice(0)) {
      try {
        unsubscribe();
      } catch {
      }
    }
    codexPlusUsageState.dispatcher = null;
  }

  function codexPlusUsageEnsureSubscriptions() {
    const dispatcher = window.__codexPlusRemoteSessionRecoveryDispatcher;
    if (!dispatcher || typeof dispatcher.subscribe !== "function") return false;
    if (codexPlusUsageState.dispatcher === dispatcher && codexPlusUsageState.unsubscribers.length) return true;
    codexPlusUsageUnsubscribe();
    codexPlusUsageState.dispatcher = dispatcher;
    for (const method of codexPlusUsageEvents) {
      try {
        const unsubscribe = dispatcher.subscribe(method, (payload) => codexPlusUsageHandleEvent(method, payload));
        if (typeof unsubscribe === "function") codexPlusUsageState.unsubscribers.push(unsubscribe);
      } catch {
      }
    }
    return codexPlusUsageState.unsubscribers.length > 0;
  }

  function codexPlusUsageObserveNativeEnvelope(value, depth = 0) {
    if (!value || typeof value !== "object" || depth > 4) return;
    if ([value.hostId, value.host_id].some((host) => typeof host === "string" && host !== "local")) return;
    const method = typeof value.method === "string" ? value.method : "";
    if (codexPlusUsageEvents.includes(method)) {
      codexPlusUsageHandleEvent(method, value.params || value);
    }
    for (const key of ["message", "request", "payload", "data", "notification"]) {
      codexPlusUsageObserveNativeEnvelope(value[key], depth + 1);
    }
  }

  function codexPlusUsageComposerFooterHost(card) {
    if (!card) return null;
    const marked = card.querySelector("[data-codex-plus-throughput-footer-host]");
    if (marked) return marked;
    const accessPattern = /^(完全访问|full access|always allow)$/i;
    const candidates = [...card.querySelectorAll("div")].filter((node) =>
      visibleElement(node) && accessPattern.test((node.innerText || "").trim()));
    return candidates.sort((left, right) => {
      const score = (node) => (String(node.className || "").includes("col-start-1") ? 2 : 0)
        + (node.children.length > 0 ? 1 : 0);
      return score(right) - score(left) || left.getBoundingClientRect().width - right.getBoundingClientRect().width;
    })[0] || null;
  }

  function codexPlusUsageNodePlaced(node, card, host = codexPlusUsageComposerFooterHost(card)) {
    if (!node?.isConnected) return false;
    return host ? node.parentElement === host : node.previousElementSibling === card;
  }

  function codexPlusUsageEnsureNode(card) {
    const fallbackHost = card?.parentElement;
    if (!fallbackHost) return null;
    const footerHost = codexPlusUsageComposerFooterHost(card);
    codexPlusUsageState.card = card;
    let node = codexPlusUsageState.node;
    if (node && codexPlusUsageNodePlaced(node, card, footerHost)) return node;
    if (!node) {
      node = document.createElement("div");
      node.id = codexPlusUsageStatusLineId;
      node.setAttribute("data-codex-plus-ext", "user-throughput-statusline");
      node.setAttribute("role", "status");
      codexPlusUsageState.node = node;
    }
    document.querySelectorAll("[data-codex-plus-throughput-footer-host]").forEach((host) => {
      if (host !== footerHost) host.removeAttribute("data-codex-plus-throughput-footer-host");
    });
    if (footerHost) {
      footerHost.setAttribute("data-codex-plus-throughput-footer-host", "true");
    }
    node.dataset.placement = footerHost ? "composer-footer" : "below-composer";
    if (footerHost) footerHost.appendChild(node);
    else card.insertAdjacentElement("afterend", node);
    return node;
  }

  function codexPlusUsageBuild(node) {
    node.textContent = "";
    const speed = document.createElement("button");
    speed.type = "button";
    speed.className = "codex-plus-usage-speed";
    speed.dataset.usage = "speed";
    speed.setAttribute("aria-describedby", codexPlusUsagePopoverId);
    const meter = codexPlusUsageMeterIcon();
    speed.appendChild(meter.svg);
    const value = document.createElement("span");
    value.className = "codex-plus-usage-value";
    value.textContent = "-- tok/s";
    speed.appendChild(value);
    const hitRate = document.createElement("span");
    hitRate.className = "codex-plus-usage-hit";
    const hitRateValue = document.createElement("span");
    hitRateValue.textContent = "--";
    hitRate.append(codexPlusUsageFilledIcon(codexPlusUsageHitIconPath, "0 0 1024 1024", 14, 13), hitRateValue);
    hitRate.title = codexPlusUsageText().labels.hitRate;
    speed.appendChild(hitRate);
    node.appendChild(speed);
    const parts = { speed: { item: speed, value, hitRate, hitRateValue, needle: meter.needle } };
    codexPlusUsageState.parts = parts;
    const show = () => codexPlusUsageShowPopover();
    const hide = () => codexPlusUsageHidePopoverSoon();
    speed.addEventListener("pointerenter", show);
    speed.addEventListener("pointerleave", hide);
    speed.addEventListener("focus", show);
    speed.addEventListener("blur", hide);
    speed.addEventListener("click", show);
    return parts;
  }

  function codexPlusUsageBuildPopover() {
    if (codexPlusUsageState.popover) return codexPlusUsageState.popoverParts;
    const popover = document.createElement("div");
    popover.id = codexPlusUsagePopoverId;
    popover.dataset.codexPlusExt = "user-throughput-statusline";
    popover.setAttribute("role", "dialog");
    popover.hidden = true;
    popover.innerHTML = `
      <div class="codex-plus-throughput-popover-head">
        <span class="codex-plus-throughput-popover-title" data-label="title"></span>
        <span class="codex-plus-throughput-popover-value" data-role="value"></span>
      </div>
      <div class="codex-plus-throughput-context">
        <div class="codex-plus-throughput-context-track" aria-hidden="true"><span class="codex-plus-throughput-context-fill" data-role="context-fill"></span></div>
        <span class="codex-plus-throughput-context-value" data-field="context">--</span>
      </div>
      <div class="codex-plus-throughput-popover-rows">
        <button class="codex-plus-throughput-popover-row" type="button" data-row="tool" data-interactive="true" data-role="tool-toggle" aria-expanded="false">
          <span class="codex-plus-throughput-popover-dot"></span>
          <span class="codex-plus-throughput-popover-label" data-label="tool"></span>
          <span class="codex-plus-throughput-popover-number-group"><span class="codex-plus-throughput-popover-number" data-field="tool"></span><span class="codex-plus-throughput-popover-arrow" aria-hidden="true"></span></span>
        </button>
      </div>
      <div class="codex-plus-throughput-popover-panel" data-role="tool-panel" hidden></div>
      <div class="codex-plus-throughput-popover-rule"></div>
      <div class="codex-plus-throughput-popover-rows">
        <div class="codex-plus-throughput-popover-row" data-row="input"><span class="codex-plus-throughput-popover-dot"></span><span class="codex-plus-throughput-popover-label" data-label="input"></span><span class="codex-plus-throughput-popover-number" data-field="input"></span></div>
        <div class="codex-plus-throughput-popover-row" data-row="output"><span class="codex-plus-throughput-popover-dot"></span><span class="codex-plus-throughput-popover-label" data-label="output"></span><span class="codex-plus-throughput-popover-number" data-field="output"></span></div>
        <div class="codex-plus-throughput-popover-row" data-row="cacheRead"><span class="codex-plus-throughput-popover-dot"></span><span class="codex-plus-throughput-popover-label" data-label="cacheRead"></span><span class="codex-plus-throughput-popover-number" data-field="cacheRead"></span></div>
        <div class="codex-plus-throughput-popover-row" data-row="hitRate"><span class="codex-plus-throughput-popover-dot"></span><span class="codex-plus-throughput-popover-label" data-label="hitRate"></span><span class="codex-plus-throughput-popover-number" data-field="hitRate"></span></div>
        <button class="codex-plus-throughput-popover-row" type="button" data-row="consumption" data-interactive="true" data-role="token-toggle" aria-expanded="false">
          <span class="codex-plus-throughput-popover-dot"></span>
          <span class="codex-plus-throughput-popover-label" data-role="consumption-label"></span>
          <span class="codex-plus-throughput-popover-number-group"><span class="codex-plus-throughput-popover-number" data-field="consumption"></span><span class="codex-plus-throughput-popover-arrow" aria-hidden="true"></span></span>
        </button>
      </div>
      <div class="codex-plus-throughput-popover-panel" data-role="range-panel" hidden>
        <div class="codex-plus-throughput-presets">
          <button class="codex-plus-throughput-preset" type="button" data-range="task" data-label="task" aria-pressed="true"></button>
          <button class="codex-plus-throughput-preset" type="button" data-range="today" data-label="today" aria-pressed="false"></button>
          <button class="codex-plus-throughput-preset" type="button" data-range="threeDay" data-label="threeDay" aria-pressed="false"></button>
          <button class="codex-plus-throughput-preset" type="button" data-range="week" data-label="week" aria-pressed="false"></button>
        </div>
        <div class="codex-plus-throughput-custom">
          <label class="codex-plus-throughput-time"><span data-label="start"></span><input type="datetime-local" step="60" data-role="custom-start"></label>
          <label class="codex-plus-throughput-time"><span data-label="end"></span><input type="datetime-local" step="60" data-role="custom-end"></label>
        </div>
      </div>
      <div class="codex-plus-throughput-popover-rule"></div>
      <div class="codex-plus-throughput-popover-footer"><span data-role="status"></span><span data-field="samples"></span></div>
    `;
    document.body.appendChild(popover);
    const labels = popover.querySelectorAll("[data-label]");
    const text = codexPlusUsageText();
    labels.forEach((label) => {
      const key = label.getAttribute("data-label");
      label.textContent = text.labels[key] || key;
    });
    const parts = {
      popover,
      value: popover.querySelector('[data-role="value"]'),
      status: popover.querySelector('[data-role="status"]'),
      contextFill: popover.querySelector('[data-role="context-fill"]'),
      toolToggle: popover.querySelector('[data-role="tool-toggle"]'),
      toolPanel: popover.querySelector('[data-role="tool-panel"]'),
      tokenToggle: popover.querySelector('[data-role="token-toggle"]'),
      tokenPanel: popover.querySelector('[data-role="range-panel"]'),
      consumptionLabel: popover.querySelector('[data-role="consumption-label"]'),
      presets: [...popover.querySelectorAll("[data-range]")],
      customStart: popover.querySelector('[data-role="custom-start"]'),
      customEnd: popover.querySelector('[data-role="custom-end"]'),
      fields: Object.fromEntries([...popover.querySelectorAll("[data-field]")].map((node) => [node.dataset.field, node])),
    };
    const now = new Date();
    now.setMinutes(0, 0, 0);
    const initialStart = new Date(now.getTime() - 4 * 60 * 60 * 1000);
    if (!codexPlusUsageState.customStart) codexPlusUsageState.customStart = codexPlusUsageBeijingDateTime(initialStart);
    if (!codexPlusUsageState.customEnd) codexPlusUsageState.customEnd = codexPlusUsageBeijingDateTime(now);
    parts.customStart.value = codexPlusUsageState.customStart;
    parts.customEnd.value = codexPlusUsageState.customEnd;
    parts.customStart.setAttribute("aria-label", text.labels.start);
    parts.customEnd.setAttribute("aria-label", text.labels.end);
    parts.toolToggle.addEventListener("click", () => {
      codexPlusUsageState.toolExpanded = !codexPlusUsageState.toolExpanded;
      codexPlusUsageUpdatePopover(codexPlusUsageTurnSnapshot(codexPlusUsageState.turns.get(codexPlusUsageState.threadId), Date.now()));
    });
    parts.tokenToggle.addEventListener("click", () => {
      codexPlusUsageState.tokenExpanded = !codexPlusUsageState.tokenExpanded;
      if (codexPlusUsageState.tokenExpanded && codexPlusUsageState.range !== "task") void codexPlusUsageLoadHistory();
      codexPlusUsageUpdatePopover(codexPlusUsageTurnSnapshot(codexPlusUsageState.turns.get(codexPlusUsageState.threadId), Date.now()));
    });
    for (const button of parts.presets) {
      button.addEventListener("click", () => {
        codexPlusUsageState.range = button.dataset.range || "task";
        if (codexPlusUsageIsGlobalRange(codexPlusUsageState.range)) {
          void codexPlusUsageRefreshGlobalUsage();
        }
        codexPlusUsageUpdatePopover(codexPlusUsageTurnSnapshot(codexPlusUsageState.turns.get(codexPlusUsageState.threadId), Date.now()));
      });
    }
    const updateCustomRange = () => {
      codexPlusUsageState.range = "custom";
      codexPlusUsageState.customStart = parts.customStart.value;
      codexPlusUsageState.customEnd = parts.customEnd.value;
      void codexPlusUsageRefreshGlobalUsage();
      codexPlusUsageUpdatePopover(codexPlusUsageTurnSnapshot(codexPlusUsageState.turns.get(codexPlusUsageState.threadId), Date.now()));
    };
    parts.customStart.addEventListener("change", updateCustomRange);
    parts.customEnd.addEventListener("change", updateCustomRange);
    popover.addEventListener("pointerenter", () => clearTimeout(codexPlusUsageState.hideTimer));
    popover.addEventListener("pointerleave", () => codexPlusUsageHidePopoverSoon());
    codexPlusUsageState.popover = popover;
    codexPlusUsageState.popoverParts = parts;
    return parts;
  }

  function codexPlusUsageFormatDuration(value) {
    const text = codexPlusUsageText();
    if (!Number.isFinite(value)) return text.unavailable;
    const seconds = Math.max(0, value) / 1000;
    if (seconds > 0 && seconds < 0.1) return `<0.1 ${text.seconds}`;
    if (seconds < 10) return `${seconds.toFixed(1)} ${text.seconds}`;
    const rounded = Math.round(seconds);
    if (rounded < 60) return `${rounded} ${text.seconds}`;
    const minutes = Math.floor(rounded / 60);
    const remainder = String(rounded % 60).padStart(2, "0");
    return `${minutes} ${text.minutes} ${remainder} ${text.seconds}`;
  }

  function codexPlusUsageFormatCount(value) {
    return Number.isFinite(value) ? Math.max(0, Math.round(value)).toLocaleString() : codexPlusUsageText().unavailable;
  }

  function codexPlusUsageFormatM(value) {
    return Number.isFinite(value) ? `${(Math.max(0, value) / 1_000_000).toFixed(2)} M` : codexPlusUsageText().unavailable;
  }

  function codexPlusUsageFormatPercent(value) {
    return Number.isFinite(value) ? `${(Math.max(0, value) * 100).toFixed(1)}%` : codexPlusUsageText().unavailable;
  }

  function codexPlusUsageFormatContext(value) {
    return Number.isFinite(value) ? `${Math.max(0, value).toFixed(1)}%` : codexPlusUsageText().unavailable;
  }

  function codexPlusUsageRenderToolDetails(snapshot) {
    const parts = codexPlusUsageState.popoverParts;
    if (!parts) return;
    parts.toolPanel.hidden = !codexPlusUsageState.toolExpanded;
    parts.toolToggle.setAttribute("aria-expanded", String(codexPlusUsageState.toolExpanded));
    if (!codexPlusUsageState.toolExpanded) return;
    const text = codexPlusUsageText();
    const details = Array.isArray(snapshot?.toolDetails) ? snapshot.toolDetails : [];
    parts.toolPanel.textContent = "";
    if (!details.length) {
      const empty = document.createElement("div");
      empty.className = "codex-plus-throughput-tool-row";
      empty.textContent = text.labels.toolEmpty;
      parts.toolPanel.appendChild(empty);
      return;
    }
    for (const detail of details.slice(0, 16)) {
      const row = document.createElement("div");
      row.className = "codex-plus-throughput-tool-row";
      const label = document.createElement("span");
      label.textContent = detail.label;
      const duration = document.createElement("span");
      const summary = [
        text.labels.toolCalls(detail.count),
        detail.durationMs > 0 ? codexPlusUsageFormatDuration(detail.durationMs) : "",
      ].filter(Boolean).join(" · ");
      duration.textContent = summary;
      row.title = [detail.label, detail.detail, summary].filter(Boolean).join(" · ");
      row.append(label, duration);
      parts.toolPanel.appendChild(row);
    }
  }

  function codexPlusUsageUpdatePopover(snapshot) {
    const parts = codexPlusUsageState.popoverParts;
    if (!parts) return;
    const text = codexPlusUsageText();
    const unavailable = text.unavailable;
    const value = snapshot?.speed == null
      ? text.speed(unavailable)
      : text.speed(Math.max(0, Math.round(snapshot.speed)));
    parts.value.textContent = value;
    parts.contextFill.style.width = `${snapshot?.contextPercent == null ? 0 : snapshot.contextPercent}%`;
    parts.fields.context.textContent = `${codexPlusUsageFormatContext(snapshot?.contextPercent)} ${text.labels.context}`;
    parts.fields.context.title = snapshot?.contextWindow > 0
      ? `${text.labels.contextWindow} ${codexPlusUsageFormatCount(snapshot.contextWindow)}`
      : "";
    parts.toolToggle.disabled = !snapshot?.toolDetails?.length;
    parts.fields.tool.textContent = codexPlusUsageFormatDuration(snapshot?.toolMs);
    parts.fields.input.textContent = codexPlusUsageFormatM(snapshot?.usage?.input);
    parts.fields.output.textContent = codexPlusUsageFormatM(snapshot?.usage?.output);
    parts.fields.cacheRead.textContent = codexPlusUsageFormatM(snapshot?.usage?.cached);
    parts.fields.hitRate.textContent = codexPlusUsageFormatPercent(snapshot?.usage?.hitRate);
    const consumption = codexPlusUsageSelectedConsumption(snapshot);
    const globalRange = codexPlusUsageState.range !== "task";
    const consumptionLoading = globalRange
      ? codexPlusUsageState.globalUsageLoading && consumption.value == null
      : codexPlusUsageState.range !== "task" && codexPlusUsageState.historyLoading;
    parts.consumptionLabel.textContent = consumption.label;
    parts.fields.consumption.textContent = consumptionLoading
      ? text.labels.loading
      : codexPlusUsageFormatCount(consumption.value);
    parts.fields.consumption.title = globalRange
      ? codexPlusUsageState.globalUsageError
      : codexPlusUsageState.historyError;
    parts.tokenToggle.setAttribute("aria-expanded", String(codexPlusUsageState.tokenExpanded));
    parts.tokenPanel.hidden = !codexPlusUsageState.tokenExpanded;
    for (const button of parts.presets) {
      button.setAttribute("aria-pressed", String(button.dataset.range === codexPlusUsageState.range));
    }
    if (codexPlusUsageState.range !== "custom") {
      const bounds = codexPlusUsageState.range === "task"
        ? (snapshot?.startedAt != null ? { start: snapshot.startedAt, end: snapshot.endedAt } : null)
        : codexPlusUsageRangeBounds(codexPlusUsageState.range);
      if (bounds) {
        codexPlusUsageState.customStart = codexPlusUsageBeijingDateTime(bounds.start);
        codexPlusUsageState.customEnd = codexPlusUsageBeijingDateTime(bounds.end);
      }
    }
    if (document.activeElement !== parts.customStart) parts.customStart.value = codexPlusUsageState.customStart;
    if (document.activeElement !== parts.customEnd) parts.customEnd.value = codexPlusUsageState.customEnd;
    codexPlusUsageRenderToolDetails(snapshot);
    parts.fields.samples.textContent = snapshot
      ? `${text.labels.samples} ${codexPlusUsageFormatCount(snapshot.samples)}`
      : `${text.labels.samples} ${unavailable}`;
    parts.status.textContent = !snapshot
      ? text.labels.waiting
      : (snapshot.completed ? text.labels.completed : text.labels.running);
    parts.popover.setAttribute("aria-label", `${text.labels.title}：${value}，${parts.fields.context.textContent}`);
    if (!parts.popover.hidden) codexPlusUsagePositionPopover();
  }

  function codexPlusUsagePositionPopover() {
    const popover = codexPlusUsageState.popover;
    const anchor = codexPlusUsageState.parts?.speed?.item;
    if (!popover || popover.hidden || !anchor) return;
    const anchorRect = anchor.getBoundingClientRect();
    const cardRect = codexPlusUsageState.card?.getBoundingClientRect();
    const popoverRect = popover.getBoundingClientRect();
    const margin = 8;
    const left = codexPlusUsageClamp(
      anchorRect.left + anchorRect.width / 2 - popoverRect.width / 2,
      12,
      Math.max(12, window.innerWidth - popoverRect.width - 12),
    );
    const aboveComposer = cardRect ? cardRect.top - popoverRect.height - margin : Number.NEGATIVE_INFINITY;
    const rightOfAnchor = anchorRect.right + margin;
    if (aboveComposer >= 12) {
      popover.style.left = `${left}px`;
      popover.style.top = "auto";
      popover.style.bottom = `${Math.max(12, window.innerHeight - cardRect.top + margin)}px`;
      return;
    }
    let top;
    if (rightOfAnchor + popoverRect.width <= window.innerWidth - 12) {
      top = anchorRect.top;
    } else {
      top = anchorRect.top - popoverRect.height - margin;
    }
    if (rightOfAnchor + popoverRect.width <= window.innerWidth - 12 && aboveComposer < 12) {
      popover.style.left = `${rightOfAnchor}px`;
    } else {
      popover.style.left = `${left}px`;
    }
    popover.style.bottom = "auto";
    popover.style.top = `${Math.max(12, top)}px`;
  }

  function codexPlusUsageShowPopover() {
    if (!codexPlusUsageEnabled()) return;
    clearTimeout(codexPlusUsageState.hideTimer);
    if (codexPlusUsageState.historyThreadId !== codexPlusUsageState.threadId) {
      void codexPlusUsageLoadHistory();
    }
    if (codexPlusUsageState.range !== "task") {
      void codexPlusUsageRefreshGlobalUsage();
    }
    const parts = codexPlusUsageBuildPopover();
    codexPlusUsageUpdatePopover(
      codexPlusUsageTurnSnapshot(codexPlusUsageState.turns.get(codexPlusUsageState.threadId), Date.now()),
    );
    parts.popover.hidden = false;
    codexPlusUsagePositionPopover();
  }

  function codexPlusUsageHidePopoverSoon() {
    clearTimeout(codexPlusUsageState.hideTimer);
    codexPlusUsageState.hideTimer = window.setTimeout(() => {
      const popover = codexPlusUsageState.popover;
      if (!popover || popover.hidden) return;
      if (popover.matches(":hover") || popover.contains(document.activeElement)) return;
      popover.hidden = true;
    }, 120);
  }

  function codexPlusUsageHidePopover() {
    clearTimeout(codexPlusUsageState.hideTimer);
    if (codexPlusUsageState.popover) codexPlusUsageState.popover.hidden = true;
  }

  function codexPlusUsageHide() {
    if (codexPlusUsageState.node) codexPlusUsageState.node.dataset.hidden = "true";
    codexPlusUsageHidePopover();
    codexPlusUsageState.lastFingerprint = "";
  }

  function codexPlusUsageShow(node) {
    if (node.dataset.hidden !== "true") return;
    node.dataset.hidden = "false";
    codexPlusUsageState.lastFingerprint = "";
  }

  function codexPlusUsageRender(snapshot) {
    const node = codexPlusUsageState.node;
    if (!node?.isConnected) return;
    const parts = codexPlusUsageState.parts || codexPlusUsageBuild(node);
    const text = codexPlusUsageText();
    const speed = snapshot?.speed == null ? "--" : String(Math.max(0, Math.round(snapshot.speed)));
    const hitRate = codexPlusUsageFormatPercent(snapshot?.usage?.hitRate);
    const consumption = codexPlusUsageSelectedConsumption(snapshot);
    const toolDetails = (snapshot?.toolDetails || []).map((detail) => `${detail.label}:${detail.durationMs}`).join(",");
    const fingerprint = snapshot
      ? [
        speed, snapshot.contextPercent, snapshot.toolMs, toolDetails,
        snapshot.usage?.input, snapshot.usage?.output, snapshot.usage?.cached, snapshot.usage?.hitRate,
        consumption.value, codexPlusUsageState.range, codexPlusUsageState.historyLoading,
        codexPlusUsageState.historyFetchedAt, codexPlusUsageState.toolExpanded,
        codexPlusUsageState.tokenExpanded, snapshot.samples, snapshot.completed,
      ].join("|")
      : "empty";
    if (fingerprint !== codexPlusUsageState.lastFingerprint) {
      codexPlusUsageState.lastFingerprint = fingerprint;
      parts.speed.value.textContent = text.speed(speed);
      parts.speed.hitRateValue.textContent = hitRate;
      const needleRatio = codexPlusUsageClamp((snapshot?.speed || 0) / 300, 0, 1);
      parts.speed.needle.style.transform = `rotate(${-75 + needleRatio * 150}deg)`;
      node.dataset.state = snapshot?.completed ? "completed" : "running";
      node.setAttribute("aria-label", `${text.aria}：${text.speed(speed)}，${text.labels.hitRate} ${hitRate}`);
      codexPlusUsageUpdatePopover(snapshot);
    }
    if (!codexPlusUsageState.popover?.hidden) codexPlusUsagePositionPopover();
  }

  function codexPlusUsageEnabled() {
    return !codexPlusUsageState.disposed
      && codexPlusBackendSettingsLoaded
      && codexPlusSettings().usageStatusLine === true;
  }

  function codexPlusUsageSyncPlacement() {
    const card = codexPlusUsageEnabled() ? codexPlusUsageComposerCard() : null;
    const threadId = codexPlusUsageThreadId(card);
    if (!card || !threadId) {
      codexPlusUsageHide();
      codexPlusUsageState.threadId = "";
      return null;
    }
    const threadChanged = codexPlusUsageState.threadId !== threadId;
    const footerHost = codexPlusUsageComposerFooterHost(card);
    const changed = threadChanged
      || !codexPlusUsageState.node?.isConnected
      || !codexPlusUsageNodePlaced(codexPlusUsageState.node, card, footerHost);
    const node = codexPlusUsageEnsureNode(card);
    if (!node) return null;
    if (changed) {
      codexPlusUsageState.threadId = threadId;
      codexPlusUsageState.lastFingerprint = "";
      if (threadChanged) {
        codexPlusUsageState.toolExpanded = false;
        codexPlusUsageState.tokenExpanded = false;
        codexPlusUsageState.range = "task";
        codexPlusUsageState.historyThreadId = "";
        codexPlusUsageState.historySamples = [];
        codexPlusUsageState.historyFetchedAt = 0;
        codexPlusUsageState.historyLoading = false;
        codexPlusUsageState.historyError = "";
        codexPlusUsageState.historyPromise = null;
      }
    }
    codexPlusUsageShow(node);
    codexPlusUsageRender(codexPlusUsageTurnSnapshot(codexPlusUsageState.turns.get(threadId), Date.now()));
    return { card, threadId, changed };
  }

  function codexPlusUsageObserve() {
    if (!document.body || typeof MutationObserver !== "function") return;
    const selector = "[data-codex-composer-root], [data-composer-surface-variant], [data-above-composer-conversation-id]";
    codexPlusUsageState.observer = new MutationObserver((records) => {
      const relevant = records.some((record) => {
        if (record.target?.closest?.("[data-codex-plus-ext]")) return false;
        if (record.type === "attributes") return true;
        return [...record.addedNodes, ...record.removedNodes].some((node) =>
          node.nodeType === 1 && !node.matches?.("[data-codex-plus-ext]")
          && (node.matches?.(selector) || node.querySelector?.(selector)));
      });
      if (relevant) codexPlusUsageSchedule(0);
    });
    codexPlusUsageState.observer.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: [
        "data-above-composer-conversation-id", "data-composer-placement",
        "data-app-action-sidebar-thread-selected", "data-app-action-sidebar-thread-id",
      ],
    });
  }

  function codexPlusUsageSchedule(delay) {
    if (codexPlusUsageState.disposed) return;
    clearTimeout(codexPlusUsageState.timer);
    codexPlusUsageState.timer = window.setTimeout(codexPlusUsageTick, delay);
  }

  function codexPlusUsageTick() {
    if (codexPlusUsageState.disposed) return;
    if (!codexPlusUsageEnabled()) {
      codexPlusUsageHide();
      codexPlusUsageSchedule(codexPlusUsageIdleTickMs);
      return;
    }
    codexPlusUsageEnsureSubscriptions();
    const placement = codexPlusUsageSyncPlacement();
    const turn = placement ? codexPlusUsageState.turns.get(placement.threadId) : null;
    codexPlusUsageRender(codexPlusUsageTurnSnapshot(turn, Date.now()));
    codexPlusUsageSchedule(turn && turn.completedAt == null && !document.hidden
      ? codexPlusUsageActiveTickMs
      : codexPlusUsageIdleTickMs);
  }

  codexPlusUsageInstallStyle();
  codexPlusUsageObserve();
  codexPlusUsageState.nativeMessageHandler = (event) => {
    const nativeLocal = event?.source == null && !event?.origin
      && event?.data?.type === "mcp-notification" && event.data.hostId === "local";
    if (!nativeLocal && event?.source !== window) return;
    if (event?.origin && event.origin !== "null" && event.origin !== window.location.origin) return;
    codexPlusUsageObserveNativeEnvelope(event?.data);
  };
  codexPlusUsageState.nativeViewHandler = (event) => {
    codexPlusUsageObserveNativeEnvelope(event?.detail);
  };
  window.addEventListener("message", codexPlusUsageState.nativeMessageHandler, true);
  window.addEventListener("codex-message-from-view", codexPlusUsageState.nativeViewHandler, true);
  codexPlusUsageState.resizeHandler = () => {
    if (!codexPlusUsageState.popover?.hidden) codexPlusUsagePositionPopover();
  };
  codexPlusUsageState.scrollHandler = codexPlusUsageState.resizeHandler;
  window.addEventListener("resize", codexPlusUsageState.resizeHandler);
  window.addEventListener("scroll", codexPlusUsageState.scrollHandler, true);
  codexPlusUsageSyncPlacement();
  codexPlusUsageSchedule(300);
  window.__codexPlusThroughputStatusLineRuntime = {
    version: codexPlusUsageVersion,
    sync: () => codexPlusUsageSchedule(0),
    dispose() {
      codexPlusUsageState.disposed = true;
      clearTimeout(codexPlusUsageState.timer);
      clearTimeout(codexPlusUsageState.hideTimer);
      codexPlusUsageState.timer = 0;
      codexPlusUsageState.hideTimer = 0;
      codexPlusUsageState.observer?.disconnect();
      codexPlusUsageUnsubscribe();
      if (codexPlusUsageState.nativeMessageHandler) window.removeEventListener("message", codexPlusUsageState.nativeMessageHandler, true);
      if (codexPlusUsageState.nativeViewHandler) window.removeEventListener("codex-message-from-view", codexPlusUsageState.nativeViewHandler, true);
      if (codexPlusUsageState.resizeHandler) window.removeEventListener("resize", codexPlusUsageState.resizeHandler);
      if (codexPlusUsageState.scrollHandler) window.removeEventListener("scroll", codexPlusUsageState.scrollHandler, true);
      codexPlusUsageState.node?.remove();
      codexPlusUsageState.popover?.remove();
      codexPlusUsageState.turns.clear();
      codexPlusUsageState.node = null;
      codexPlusUsageState.card = null;
      codexPlusUsageState.parts = null;
      codexPlusUsageState.popover = null;
      codexPlusUsageState.popoverParts = null;
      codexPlusUsageState.globalUsageSamples = [];
      codexPlusUsageState.globalUsageScanned = false;
      codexPlusUsageState.globalAppServicesPromise = null;
      codexPlusUsageState.globalUsageFetchedAt = 0;
      codexPlusUsageState.globalUsageLoading = false;
      codexPlusUsageState.globalUsageError = "";
      codexPlusUsageState.globalUsagePromise = null;
      codexPlusUsageState.lastFingerprint = "";
      globalThis.__CODEX_PLUS_THROUGHPUT_STATUSLINE_SYNC__ = undefined;
    },
  };
  globalThis.__CODEX_PLUS_THROUGHPUT_STATUSLINE_SYNC__ = () => codexPlusUsageSchedule(0);

  window.codexPlus?.onCleanup?.(() => window.__codexPlusThroughputStatusLineRuntime?.dispose?.());
})();

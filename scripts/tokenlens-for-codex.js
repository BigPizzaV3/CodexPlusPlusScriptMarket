/* Codex++ external extension: turn token throughput status line. */
(() => {
  const visibleElement = (node) => !!node && ((node.getClientRects?.().length || 0) > 0 || node.offsetWidth > 0 || node.offsetHeight > 0);
  // 宿主「用量状态栏」开关是唯一真值；先按默认值渲染，读回后立即纠正。
  let codexPlusUsageStatusLineEnabled = true;
  const codexPlusSettings = () => ({ usageStatusLine: codexPlusUsageStatusLineEnabled });
  // shortcut: 只在初始化与宿主开关回调时读设置，管理端直接改配置后需刷新页面。
  const codexPlusRefreshUsageStatusLineSetting = () => {
    const bridge = window.__codexSessionDeleteBridge;
    if (typeof bridge !== "function") return;
    Promise.resolve(bridge("/settings/get", {}))
      .then((value) => {
        if (typeof value?.codexAppUsageStatusLine !== "boolean") return;
        if (value.codexAppUsageStatusLine === codexPlusUsageStatusLineEnabled) return;
        codexPlusUsageStatusLineEnabled = value.codexAppUsageStatusLine;
        window.__codexPlusThroughputStatusLineRuntime?.sync?.();
      })
      .catch(() => {});
  };
  // 内置栏要继续活着：宿主的开关回调就是打给它的 sync 全局。
  let codexPlusHostUsageSync = globalThis.__CODEX_PLUS_USAGE_STATUSLINE_SYNC__;
  const codexPlusUsageStatusLineSync = () => {
    codexPlusHostUsageSync?.();
    codexPlusRefreshUsageStatusLineSetting();
  };
  const codexPlusInstallUsageStatusLineSync = () => {
    const current = globalThis.__CODEX_PLUS_USAGE_STATUSLINE_SYNC__;
    if (current === codexPlusUsageStatusLineSync) return;
    codexPlusHostUsageSync = current;
    globalThis.__CODEX_PLUS_USAGE_STATUSLINE_SYNC__ = codexPlusUsageStatusLineSync;
  };
  codexPlusInstallUsageStatusLineSync();
  /**
   * 输入框下方吞吐状态栏。
   *
   * 主指标按自有口径：本轮输出 token 除以扣除首 token 等待与工具执行后的模型窗口。
   * 平均速度按每次已结算调用的速率去掉一个最高、一个最低后再平均。
   * 数据来自 Codex app-server 的本地通知，不读取会话正文，也不请求服务商：
   * - 首个非空助手或推理增量为首 token 时间；
   * - 首个输出 delta 开始解码，工具开始或消息完成时结束解码区间；
   * - token 用量通知与刚结束的解码区间配对结算，通知延迟不计入时长；
   * - 工具条目开始与完成之间的并集计为工具耗时；
   * - token 用量按线程累计输出增量计入当前轮；
   * - 中途安装时从宿主历史接口回填当前轮并去重。
   *
   * 悬停速度值可查看首 token、工具耗时以及本轮 token 用量。
   */
  window.__codexPlusThroughputStatusLineRuntime?.dispose?.();

  const codexPlusUsageStatusLineId = "codex-plus-throughput-statusline";
  const codexPlusUsagePopoverId = "codex-plus-throughput-popover";
  const codexPlusUsageStyleId = "codex-plus-throughput-statusline-style";
  const codexPlusUsageVersion = 43;
  const codexPlusUsageThemeKey = "tokenlens-theme";
  const codexPlusUsageGlobalApiKey = "__codexDailyTokenUsage";
  const codexPlusUsageMagpieUsageUrl = "http://127.0.0.1:3425/v1/magpie/usage/requests?period=7d&agent=codex&limit=1";
  const codexPlusUsageMagpieTodayUsageUrl = "http://127.0.0.1:3425/v1/magpie/usage/requests?period=today&agent=codex&limit=1";
  const codexPlusUsageMagpieTaskUsageUrlPrefix = "http://127.0.0.1:3425/v1/magpie/usage/requests?period=7d&agent=codex&limit=1&q=";
  const codexPlusUsageMagpieRefreshMs = 2000;
  const codexPlusUsageMagpieTimeoutMs = 3000;
  const codexPlusUsageActiveTickMs = 1000;
  const codexPlusUsageIdleTickMs = 4000;
  const codexPlusUsageLiveContextRefreshMs = 2000;
  const codexPlusUsageMaxTurns = 32;
  const codexPlusUsageMaxLiveSamples = 512;
  const codexPlusUsageMaxChartBars = 200;
  // 模型真实峰值约 400 tok/s，仪表盘满偏刻度按此对齐。
  const codexPlusUsageSpeedPeak = 400;
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
    liveContextByThread: new Map(),
    liveContextFetchedAt: new Map(),
    liveContextPromises: new Map(),
    lastFingerprint: "",
    observer: null,
    dispatcher: null,
    unsubscribers: [],
    hideTimer: 0,
    toolExpanded: false,
    tokenExpanded: false,
    theme: codexPlusUsageReadTheme(),
    range: "task",
    customStart: "",
    customEnd: "",
    historyThreadId: "",
    historySamples: [],
    historyFetchedAt: 0,
    historyLoading: false,
    historyError: "",
    historyPromise: null,
    globalUsageLoading: false,
    globalUsageError: "",
    globalUsagePromise: null,
    globalUsageAggregate: null,
    globalUsageCoverage: { available: 0, total: 0 },
    globalUsageSourceCoverage: { magpie: 0, daily: 0 },
    magpieUsage: { fetchedAt: 0, snapshots: new Map(), sessions: new Map() },
    magpieUsageLastAttemptAt: 0,
    magpieUsageMaxAgeMs: 30_000,
    magpieUsagePromise: null,
    magpieUsageError: "",
    appServicesPromise: null,
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
          yesterday: "昨天消耗",
          week: "近7天消耗",
          magpieLive: "Magpie 本地实时源 · 每 2 秒刷新 · Codex 全部任务",
          taskMagpieLive: "当前任务已与 Magpie 请求累计对齐 · 近 7 天 · 每 2 秒刷新",
          localFallback: "本地日报回退",
          presetTask: "任务",
          presetToday: "今天",
          presetYesterday: "昨天",
          presetWeek: "近7天",
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
          themeDark: "切换到亮色主题",
          themeLight: "切换到暗色主题",
          turnCalls: "本轮调用：",
          totalCalls: "总次数",
          averageSpeed: "平均速度",
        },
        calls: (value) => value + "次",
        rounds: (value) => value + "轮",
        wan: (value) => value + "万",
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
        yesterday: "Yesterday",
        week: "Last 7 days",
        magpieLive: "Magpie local live source · refreshes every 2 seconds · all Codex tasks",
        taskMagpieLive: "Current task is aligned to the Magpie request total · last 7 days · refreshes every 2 seconds",
        localFallback: "Local daily fallback",
        presetTask: "Task",
        presetToday: "Today",
        presetYesterday: "Yesterday",
        presetWeek: "7 days",
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
        themeDark: "Switch to light theme",
        themeLight: "Switch to dark theme",
        turnCalls: "Calls this turn: ",
        totalCalls: "Total calls",
        averageSpeed: "avg speed",
      },
      calls: (value) => value + (value === 1 ? " call" : " calls"),
      rounds: (value) => value + (value === 1 ? " turn" : " turns"),
      wan: (value) => (value * 10) + "k",
      seconds: "s",
      minutes: "min",
      unavailable: "--",
    };
  }

  function codexPlusUsageNormalizeTheme(value) {
    return value === "light" ? "light" : "dark";
  }

  function codexPlusUsageReadTheme() {
    try {
      return codexPlusUsageNormalizeTheme(localStorage.getItem(codexPlusUsageThemeKey));
    } catch {
      return "dark";
    }
  }

  function codexPlusUsageWriteTheme(theme) {
    try {
      localStorage.setItem(codexPlusUsageThemeKey, theme);
    } catch {
    }
  }

  function codexPlusUsageApplyTheme(theme) {
    const next = codexPlusUsageNormalizeTheme(theme);
    codexPlusUsageState.theme = next;
    const popover = codexPlusUsageState.popover;
    if (popover) popover.dataset.theme = next;
    const toggle = codexPlusUsageState.popoverParts?.themeToggle;
    if (!toggle) return;
    const light = next === "light";
    const labels = codexPlusUsageText().labels;
    const label = light ? labels.themeLight : labels.themeDark;
    toggle.setAttribute("aria-checked", String(light));
    toggle.setAttribute("aria-label", label);
    toggle.title = label;
  }

  function codexPlusUsageSetTheme(theme) {
    const next = codexPlusUsageNormalizeTheme(theme);
    codexPlusUsageWriteTheme(next);
    codexPlusUsageApplyTheme(next);
  }

  function codexPlusUsageInstallStyle() {
    const existing = document.getElementById(codexPlusUsageStyleId);
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
      #codex-plus-throughput-popover{position:fixed;z-index:2147483400;box-sizing:border-box;width:min(280px,calc(100vw - 24px));max-height:min(76vh,560px);overflow:auto;padding:12px 10px 10px;border:1px solid #28243a;border-radius:4px;background:#181524;color:#e2e8f0;box-shadow:0 14px 38px rgba(0,0,0,.32);font:12px/1.45 ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;font-variant-numeric:tabular-nums;pointer-events:auto;scrollbar-width:thin;color-scheme:dark;transition:background-color .15s ease,border-color .15s ease,color .15s ease}
      #codex-plus-throughput-popover[hidden]{display:none}
      .codex-plus-throughput-popover-head{display:grid;grid-template-columns:auto minmax(0,1fr);align-items:center;gap:10px;min-height:20px;margin-bottom:8px;line-height:normal}
      .codex-plus-throughput-popover-head-left{display:flex;align-items:center;min-width:0;gap:6px}
      .codex-plus-throughput-popover-head-right{display:flex;align-items:baseline;justify-content:flex-start;gap:4px;min-width:0;overflow:hidden;text-align:left;white-space:nowrap}
      .codex-plus-throughput-popover-title{font-size:13px;font-weight:700;color:#f1f5f9}
      .codex-plus-throughput-popover-value{font-size:15px;font-weight:800;color:#fff;white-space:nowrap}
      .codex-plus-throughput-average-separator{color:#6f668d;font-size:12px;font-weight:700}
      .codex-plus-throughput-average-label{color:#8c84a8;font-size:10.5px;font-weight:500}
      .codex-plus-throughput-average-value{color:#fff;font-size:12px;font-weight:700;font-variant-numeric:tabular-nums}
      .codex-plus-throughput-theme-toggle{display:inline-flex;flex:0 0 auto;align-items:center;justify-content:center;width:34px;height:18px;padding:0;border:0;border-radius:9px;background:transparent;color:inherit;cursor:pointer;outline:none}
      .codex-plus-throughput-theme-toggle:focus-visible{outline:2px solid #60a5fa;outline-offset:2px}
      .codex-plus-throughput-theme-track{position:relative;display:flex;box-sizing:border-box;align-items:center;justify-content:space-between;width:34px;height:18px;padding:0 4px;border:1px solid #3c3557;border-radius:9px;background:#211c33;color:#8f86b1;transition:background-color .15s ease,border-color .15s ease}
      .codex-plus-throughput-theme-icon{position:relative;z-index:1;display:flex;width:9px;height:9px}
      .codex-plus-throughput-theme-icon svg{display:block;width:9px;height:9px;stroke:currentColor;stroke-width:2.4;fill:none;stroke-linecap:round;stroke-linejoin:round}
      .codex-plus-throughput-theme-thumb{position:absolute;z-index:0;top:2px;left:2px;width:12px;height:12px;border-radius:50%;background:#38bdf8;box-shadow:0 0 5px rgba(56,189,248,.55);transition:transform .18s ease,background-color .15s ease}
      #codex-plus-throughput-popover[data-theme="dark"] .codex-plus-throughput-theme-moon{color:#e0f2fe}
      #codex-plus-throughput-popover[data-theme="dark"] .codex-plus-throughput-theme-thumb{transform:translateX(16px)}
      #codex-plus-throughput-popover[data-theme="light"] .codex-plus-throughput-theme-sun{color:#1d4ed8}
      .codex-plus-throughput-context{display:flex;align-items:center;gap:7px;margin:8px 0 10px}
      .codex-plus-throughput-context-track{flex:1;height:6px;overflow:hidden;border-radius:2px;background:#2a263c}
      .codex-plus-throughput-context-fill{display:block;width:0;height:100%;border-radius:inherit;background:linear-gradient(90deg,#2563eb,#3b82f6,#818cf8);transition:width .18s ease}
      .codex-plus-throughput-context-value{min-width:68px;color:#60a5fa;font-size:10.5px;font-weight:700;line-height:normal;text-align:right;white-space:nowrap}
      .codex-plus-throughput-popover-rows{display:grid;gap:0}
      .codex-plus-throughput-popover-row{display:grid;grid-template-columns:5px minmax(0,1fr) auto;align-items:center;gap:6px;box-sizing:border-box;width:100%;min-height:23px;padding:3.5px 2px;line-height:normal}
      .codex-plus-throughput-popover-row[data-interactive="true"]{margin:0;border:0;border-radius:2px;background:transparent;color:inherit;font:inherit;line-height:normal;text-align:left;cursor:pointer}
      .codex-plus-throughput-popover-row[data-interactive="true"]:hover{background:color-mix(in srgb,currentColor 7%,transparent)}
      .codex-plus-throughput-popover-row[data-interactive="true"]:focus-visible{outline:2px solid color-mix(in srgb,currentColor 28%,transparent);outline-offset:0}
      .codex-plus-throughput-popover-row[data-interactive="true"]:disabled{cursor:default;opacity:.72}
      .codex-plus-throughput-popover-row[data-interactive="true"]:disabled:hover{background:transparent}
      .codex-plus-throughput-popover-dot{width:5px;height:5px;border-radius:50%;background:#38bdf8;box-shadow:0 0 5px rgba(56,189,248,.85)}
      .codex-plus-throughput-popover-row[data-row="tool"] .codex-plus-throughput-popover-dot{background:#38bdf8}
      .codex-plus-throughput-popover-label{min-width:0;color:#cbd5e1;font-size:12px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .codex-plus-throughput-popover-number-group{display:inline-flex;align-items:center;gap:7px;white-space:nowrap}
      .codex-plus-throughput-popover-number{color:#fff;font-size:12px;font-weight:700;white-space:nowrap}
      .codex-plus-throughput-popover-arrow{width:7px;height:7px;margin-top:-2px;border-right:1.6px solid currentColor;border-bottom:1.6px solid currentColor;transform:rotate(45deg);transition:transform .2s ease;opacity:.72}
      .codex-plus-throughput-popover-row[aria-expanded="true"] .codex-plus-throughput-popover-arrow{margin-top:3px;transform:rotate(225deg)}
      .codex-plus-throughput-popover-rule{height:1px;margin:5px 0;background:#262137}
      .codex-plus-throughput-popover-panel{display:block;box-sizing:border-box;margin:2px 0 4px;padding:5px 6px;border:1px solid #28233d;border-radius:3px;background:#141120;font-size:10.5px;line-height:normal}
      .codex-plus-throughput-popover-panel[hidden]{display:none}
      .codex-plus-throughput-tool-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:10px;padding:2.5px 0;border-bottom:1px dashed rgba(255,255,255,.05);color:#94a3b8;font-size:10.5px;line-height:normal}
      .codex-plus-throughput-tool-row:last-child{border-bottom:0}
      .codex-plus-throughput-tool-row span{min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .codex-plus-throughput-tool-row span:last-child{color:#cbd5e1;font-weight:600}
      .codex-plus-throughput-presets{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:3px;margin-bottom:4px;padding:0;border-radius:0;background:transparent}
      .codex-plus-throughput-preset{min-width:0;height:auto;padding:2.5px 0;border:1px solid #312b4d;border-radius:2px;background:#1f1a32;color:#cbd5e1;font:inherit;font-size:9.5px;line-height:normal;text-align:center;cursor:pointer;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .codex-plus-throughput-preset:hover{background:#27203d}
      .codex-plus-throughput-preset[aria-pressed="true"]{border-color:#60a5fa;background:#3b82f6;color:#fff;font-weight:700}
      .codex-plus-throughput-preset:focus-visible{outline:2px solid color-mix(in srgb,currentColor 28%,transparent);outline-offset:0}
      .codex-plus-throughput-custom{display:grid;gap:3px;margin-top:0}
      .codex-plus-throughput-time{display:grid;grid-template-columns:minmax(0,1fr) 130px;align-items:center;gap:5px;min-height:19px;color:#94a3b8;font-size:9.5px;line-height:normal}
      .codex-plus-throughput-time input{box-sizing:border-box;width:130px;min-width:0;min-height:19px;padding:1.5px 3px;border:1px solid #332d50;border-radius:2px;background:#191528;color:#f1f5f9;font:inherit;font-size:9px;line-height:normal;color-scheme:dark light;outline:none}
      .codex-plus-throughput-time input:focus{outline:2px solid color-mix(in srgb,currentColor 28%,transparent);outline-offset:0}
      .codex-plus-throughput-analytics{box-sizing:border-box;margin-top:6px;padding-top:6px;border-top:1px solid #28233d}
      .codex-plus-throughput-turn-status{display:flex;align-items:center;justify-content:flex-start;gap:10px;width:100%;padding:0 1px 4px;color:#e2e8f0;font-size:11.4px;line-height:1}
      .codex-plus-throughput-turn-left,.codex-plus-throughput-turn-right{display:flex;align-items:baseline;gap:2px}
      .codex-plus-throughput-turn-label{color:#8c84a8;font-weight:500}
      .codex-plus-throughput-turn-call{color:#38bdf8;font-weight:700;font-variant-numeric:tabular-nums}
      .codex-plus-throughput-turn-slash{color:#554e70;margin:0 1px;font-weight:700}
      .codex-plus-throughput-turn-round{color:#cbd5e1;font-weight:700;font-variant-numeric:tabular-nums}
      .codex-plus-throughput-turn-total{color:#fff;font-weight:700;font-variant-numeric:tabular-nums}
      .codex-plus-throughput-top{display:flex;align-items:baseline;justify-content:space-between;width:100%;padding:0 1px 7px;font-size:11.04px;line-height:1;white-space:nowrap}
      .codex-plus-throughput-top-segment{display:flex;align-items:baseline;gap:1.5px;font-variant-numeric:tabular-nums}
      .codex-plus-throughput-top-label{font-weight:700}
      .codex-plus-throughput-top-segment:nth-child(1) .codex-plus-throughput-top-label{color:#fbbf24}
      .codex-plus-throughput-top-segment:nth-child(2) .codex-plus-throughput-top-label{color:#94a3b8}
      .codex-plus-throughput-top-segment:nth-child(3) .codex-plus-throughput-top-label{color:#f59e0b}
      .codex-plus-throughput-top-value{color:#fff;font-weight:700}
      .codex-plus-throughput-top-value[data-field="top1Tokens"]{color:#fde68a}
      .codex-plus-throughput-top-value[data-field="top2Tokens"]{color:#cbd5e1}
      .codex-plus-throughput-top-value[data-field="top3Tokens"]{color:#fca5a5}
      .codex-plus-throughput-chart{display:flex;width:100%;height:78px;position:relative}
      .codex-plus-throughput-axis-y{width:22px;display:flex;flex-direction:column;justify-content:space-between;align-items:flex-start;padding-bottom:11px;color:#b8b2cf;font-size:8.5px;font-weight:700;line-height:normal;font-variant-numeric:tabular-nums;white-space:nowrap;user-select:none}
      .codex-plus-throughput-chart-main{flex:1;min-width:0;height:100%;overflow-x:auto;overflow-y:hidden;scrollbar-width:thin;scrollbar-color:#3b3554 transparent}
      .codex-plus-throughput-chart-main::-webkit-scrollbar{height:3px}
      .codex-plus-throughput-chart-main::-webkit-scrollbar-thumb{border-radius:2px;background:#3b3554}
      .codex-plus-throughput-chart-main::-webkit-scrollbar-track{background:transparent}
      .codex-plus-throughput-chart-track{display:flex;flex-direction:column;box-sizing:border-box;min-width:100%;height:100%}
      .codex-plus-throughput-bars{display:grid;flex:1;grid-template-columns:repeat(var(--chart-count,20),minmax(0,1fr));min-height:0;align-items:end;gap:1.5px;padding:0;position:relative;background:repeating-linear-gradient(0deg,transparent,transparent 16px,rgba(255,255,255,.02) 16px,rgba(255,255,255,.02) 17px)}
      .codex-plus-throughput-bar-col{display:flex;min-width:0;height:100%;flex-direction:column;justify-content:flex-end;align-items:center;position:relative;cursor:pointer}
      .codex-plus-throughput-bar{width:100%;border-radius:1px 1px 0 0;background:linear-gradient(180deg,#38bdf8,#2563eb);transition:filter .12s ease}
      .codex-plus-throughput-bar-col:hover .codex-plus-throughput-bar{filter:brightness(1.35)}
      .codex-plus-throughput-bar-col.is-top1 .codex-plus-throughput-bar{background:linear-gradient(180deg,#f59e0b,#d97706)}
      .codex-plus-throughput-bar-col.is-top2 .codex-plus-throughput-bar{background:linear-gradient(180deg,#94a3b8,#64748b)}
      .codex-plus-throughput-bar-col.is-top3 .codex-plus-throughput-bar{background:linear-gradient(180deg,#d97706,#b45309)}
      .codex-plus-throughput-bar-col.is-current .codex-plus-throughput-bar{background:linear-gradient(180deg,#a855f7,#6366f1)}
      .codex-plus-throughput-bar-tooltip{position:absolute;bottom:calc(100% + 2px);left:50%;transform:translateX(-50%);z-index:20;padding:1.5px 3px;border:1px solid #3d345c;border-radius:2px;background:#090710;color:#38bdf8;font-size:7.5px;font-weight:700;white-space:nowrap;pointer-events:none;opacity:0;visibility:hidden}
      .codex-plus-throughput-bar-col:hover .codex-plus-throughput-bar-tooltip{opacity:1;visibility:visible}
      .codex-plus-throughput-bar-col:nth-child(-n+4) .codex-plus-throughput-bar-tooltip{left:0;transform:none}
      .codex-plus-throughput-bar-col:nth-last-child(-n+4) .codex-plus-throughput-bar-tooltip{left:auto;right:0;transform:none}
      .codex-plus-throughput-bar-col[data-empty="true"]{cursor:default}
      .codex-plus-throughput-bar-col[data-empty="true"] .codex-plus-throughput-bar-tooltip{display:none}
      .codex-plus-throughput-axis-x{display:grid;grid-template-columns:repeat(var(--chart-count,20),minmax(0,1fr));gap:1.5px;height:11px;align-items:center;padding:0}
      .codex-plus-throughput-x-index{min-width:0;text-align:center;color:#b8b2cf;font-size:8.5px;font-weight:700;font-variant-numeric:tabular-nums}
      .codex-plus-throughput-x-index.current{color:#c084fc;font-weight:700}
      .codex-plus-throughput-popover-footer{display:flex;align-items:center;justify-content:space-between;gap:14px;color:var(--color-token-text-tertiary,rgba(200,200,210,.62));font-size:11px}
      #codex-plus-throughput-popover[data-theme="light"]{border-color:#d5dbe6;background:#f7f8fb;color:#1f2937;box-shadow:0 14px 38px rgba(15,23,42,.16);color-scheme:light}
      #codex-plus-throughput-popover[data-theme="light"] .codex-plus-throughput-popover-title{color:#111827}
      #codex-plus-throughput-popover[data-theme="light"] .codex-plus-throughput-popover-value{color:#0f172a}
      #codex-plus-throughput-popover[data-theme="light"] .codex-plus-throughput-average-separator{color:#94a3b8}
      #codex-plus-throughput-popover[data-theme="light"] .codex-plus-throughput-average-label{color:#64748b}
      #codex-plus-throughput-popover[data-theme="light"] .codex-plus-throughput-average-value{color:#0f172a}
      #codex-plus-throughput-popover[data-theme="light"] .codex-plus-throughput-theme-track{border-color:#bfc9d8;background:#e7edf5}
      #codex-plus-throughput-popover[data-theme="light"] .codex-plus-throughput-theme-icon{color:#64748b}
      #codex-plus-throughput-popover[data-theme="light"] .codex-plus-throughput-theme-thumb{background:#2563eb;box-shadow:0 1px 4px rgba(37,99,235,.32)}
      #codex-plus-throughput-popover[data-theme="light"] .codex-plus-throughput-context-track{background:#dfe5ee}
      #codex-plus-throughput-popover[data-theme="light"] .codex-plus-throughput-context-value{color:#2563eb}
      #codex-plus-throughput-popover[data-theme="light"] .codex-plus-throughput-popover-row[data-interactive="true"]:hover{background:rgba(37,99,235,.06)}
      #codex-plus-throughput-popover[data-theme="light"] .codex-plus-throughput-popover-dot{background:#2563eb;box-shadow:none}
      #codex-plus-throughput-popover[data-theme="light"] .codex-plus-throughput-popover-label{color:#475569}
      #codex-plus-throughput-popover[data-theme="light"] .codex-plus-throughput-popover-number{color:#111827}
      #codex-plus-throughput-popover[data-theme="light"] .codex-plus-throughput-popover-rule{background:#e1e6ee}
      #codex-plus-throughput-popover[data-theme="light"] .codex-plus-throughput-popover-panel{border-color:#dbe1ea;background:#fff}
      #codex-plus-throughput-popover[data-theme="light"] .codex-plus-throughput-tool-row{border-bottom-color:rgba(15,23,42,.07);color:#64748b}
      #codex-plus-throughput-popover[data-theme="light"] .codex-plus-throughput-tool-row span:last-child{color:#334155}
      #codex-plus-throughput-popover[data-theme="light"] .codex-plus-throughput-preset{border-color:#cbd5e1;background:#fff;color:#334155}
      #codex-plus-throughput-popover[data-theme="light"] .codex-plus-throughput-preset:hover{background:#eef4fb}
      #codex-plus-throughput-popover[data-theme="light"] .codex-plus-throughput-preset[aria-pressed="true"]{border-color:#2563eb;background:#e8f0fe;color:#1d4ed8}
      #codex-plus-throughput-popover[data-theme="light"] .codex-plus-throughput-time{color:#64748b}
      #codex-plus-throughput-popover[data-theme="light"] .codex-plus-throughput-time input{border-color:#cbd5e1;background:#fff;color:#111827;color-scheme:light}
      #codex-plus-throughput-popover[data-theme="light"] .codex-plus-throughput-analytics{border-top-color:#dfe5ee}
      #codex-plus-throughput-popover[data-theme="light"] .codex-plus-throughput-turn-status{color:#334155}
      #codex-plus-throughput-popover[data-theme="light"] .codex-plus-throughput-turn-label{color:#64748b}
      #codex-plus-throughput-popover[data-theme="light"] .codex-plus-throughput-turn-call{color:#2563eb}
      #codex-plus-throughput-popover[data-theme="light"] .codex-plus-throughput-turn-slash{color:#94a3b8}
      #codex-plus-throughput-popover[data-theme="light"] .codex-plus-throughput-turn-round{color:#334155}
      #codex-plus-throughput-popover[data-theme="light"] .codex-plus-throughput-turn-total{color:#0f172a}
      #codex-plus-throughput-popover[data-theme="light"] .codex-plus-throughput-top-segment:nth-child(1) .codex-plus-throughput-top-label{color:#b45309}
      #codex-plus-throughput-popover[data-theme="light"] .codex-plus-throughput-top-segment:nth-child(2) .codex-plus-throughput-top-label{color:#64748b}
      #codex-plus-throughput-popover[data-theme="light"] .codex-plus-throughput-top-segment:nth-child(3) .codex-plus-throughput-top-label{color:#c2410c}
      #codex-plus-throughput-popover[data-theme="light"] .codex-plus-throughput-top-value{color:#0f172a}
      #codex-plus-throughput-popover[data-theme="light"] .codex-plus-throughput-top-value[data-field="top1Tokens"]{color:#b45309}
      #codex-plus-throughput-popover[data-theme="light"] .codex-plus-throughput-top-value[data-field="top2Tokens"]{color:#475569}
      #codex-plus-throughput-popover[data-theme="light"] .codex-plus-throughput-top-value[data-field="top3Tokens"]{color:#b91c1c}
      #codex-plus-throughput-popover[data-theme="light"] .codex-plus-throughput-axis-y,
      #codex-plus-throughput-popover[data-theme="light"] .codex-plus-throughput-x-index{color:#475569}
      #codex-plus-throughput-popover[data-theme="light"] .codex-plus-throughput-x-index.current{color:#7c3aed}
      #codex-plus-throughput-popover[data-theme="light"] .codex-plus-throughput-bars{background:repeating-linear-gradient(0deg,transparent,transparent 16px,rgba(15,23,42,.055) 16px,rgba(15,23,42,.055) 17px)}
      #codex-plus-throughput-popover[data-theme="light"] .codex-plus-throughput-bar-tooltip{border-color:#cbd5e1;background:#fff;color:#0369a1;box-shadow:0 2px 8px rgba(15,23,42,.12)}
    `;
    document.head?.appendChild(style);
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

  function codexPlusUsageUuidV7Timestamp(value) {
    const compact = String(value || "").replace(/-/g, "");
    if (!/^[0-9a-f]{12}/i.test(compact)) return null;
    const timestamp = Number.parseInt(compact.slice(0, 12), 16);
    return Number.isSafeInteger(timestamp) && timestamp >= 1_000_000_000_000
      ? timestamp
      : null;
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
      lastCallTokens: null,
      totalOutputSeen: Number.isFinite(totalOutputSeen) ? totalOutputSeen : null,
      totalInputSeen: Number.isFinite(totalUsageSeen?.input) ? totalUsageSeen.input : null,
      totalCachedInputSeen: Number.isFinite(totalUsageSeen?.cached) ? totalUsageSeen.cached : null,
      totalTokenSeen: Number.isFinite(totalUsageSeen?.total) ? totalUsageSeen.total : null,
      contextTokens: null,
      contextWindow: null,
      firstTokenAt: null,
      decodeStartedAt: null,
      decodeMs: 0,
      pendingDecodeMs: 0,
      pendingOutput: 0,
      settledCalls: [],
      activeSkills: [],
      historySeeded: false,
      observedFromStart: false,
      lastHistorySample: null,
      skipMatchingUsage: false,
      appliedTotals: new Set(),
      callSamples: [],
      toolIntervals: [],
      toolDetails: [],
      activeTools: new Map(),
      lastEventAt: Number.isFinite(startedAt) ? startedAt : Date.now(),
    };
  }

  function codexPlusUsageFlushDecode(turn, at) {
    if (!turn || turn.decodeStartedAt == null) return;
    const duration = Math.max(0, at - turn.decodeStartedAt);
    turn.decodeMs += duration;
    turn.pendingDecodeMs += duration;
    turn.decodeStartedAt = null;
    codexPlusUsageSettleCall(turn);
  }

  // 输出 token 与它的解码时长要成对结算；用量通知晚于调用结束也不会拉低分母。
  function codexPlusUsageSettleCall(turn) {
    if (!turn || !(turn.pendingDecodeMs > 0) || !(turn.pendingOutput > 0)) return;
    turn.settledCalls.push({ output: turn.pendingOutput, decodeMs: turn.pendingDecodeMs });
    if (turn.settledCalls.length > codexPlusUsageMaxLiveSamples) {
      turn.settledCalls.splice(0, turn.settledCalls.length - codexPlusUsageMaxLiveSamples);
    }
    turn.pendingDecodeMs = 0;
    turn.pendingOutput = 0;
  }

  function codexPlusUsageCloseActiveTools(turn, at) {
    if (!turn?.activeTools?.size) return;
    for (const [id, tool] of turn.activeTools) {
      codexPlusUsageRecordTool(turn, id, tool, tool?.startedAt, at);
    }
    turn.activeTools.clear();
  }

  function codexPlusUsageCallSample(turn, previous, deltas, at, current) {
    const value = (key) => {
      const lastCall = Number(previous?.[key]);
      if (Number.isFinite(lastCall) && lastCall > 0) return lastCall;
      return Math.max(0, Number(deltas?.[key]) || 0);
    };
    const sample = {
      turnId: String(turn?.turnId || ""),
      observedAt: Number.isFinite(at) ? at : Date.now(),
      input: value("input"),
      cached: value("cached"),
      output: value("output"),
      total: value("total"),
      contextTokens: Number(current?.total) > 0 ? current.total : Number(previous?.total) || 0,
    };
    return sample.total > 0 ? sample : null;
  }

  function codexPlusUsageRememberCallSample(turn, sample) {
    if (!turn || !sample) return;
    turn.callSamples.push(sample);
    if (turn.callSamples.length > codexPlusUsageMaxLiveSamples) {
      turn.callSamples.splice(0, turn.callSamples.length - codexPlusUsageMaxLiveSamples);
    }
  }

  function codexPlusUsageRecordTool(turn, id, kind, startedAt, endedAt, durationMs = null) {
    if (!turn || !kind) return;
    const duration = codexPlusUsageNumber(durationMs);
    // Number(null) === 0，必须显式排除空值，否则会把 1970 当成工具起点。
    let start = startedAt == null ? null : codexPlusUsageNumber(startedAt);
    const end = endedAt == null ? null : codexPlusUsageNumber(endedAt);
    // 宿主给出的实测时长最可信：即使有 startedAt 也用它对齐，避免事件间隔充当耗时。
    if (duration > 0 && end != null) start = end - duration;
    // 起点未知则只记可见明细，不把未知跨度算成工具耗时，否则会跨过整段思考时间。
    const valid = start != null && end > start;
    if (valid) turn.toolIntervals.push([start, end]);
    if (kind.visible !== false) {
      turn.toolDetails.push({
        id: String(id || `${kind.key}:${turn.toolDetails.length}`),
        categoryKey: kind.key,
        fallback: kind.fallback,
        label: kind.label,
        detail: kind.detail,
        startedAt: valid ? start : null,
        endedAt: valid ? end : null,
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
      if (contextTokens != null) turn.contextTokens = contextTokens;
      // 同一累计值已经计入过就整条丢弃，重放的旧通知不再重复累加。
      if (current.total != null && turn.appliedTotals?.has(current.total)) {
        return turn;
      }
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
        if (current.total != null) turn.appliedTotals?.add(current.total);
        turn.skipMatchingUsage = false;
        turn.lastHistorySample = null;
        return turn;
      }
      let changed = false;
      let outputDelta = 0;
      const deltas = { input: 0, cached: 0, output: 0, total: 0 };
      for (const [field, seenField, current, lastValue] of samples) {
        if (current == null) continue;
        if (turn[seenField] == null || current < turn[seenField]) {
          turn[seenField] = Math.max(0, current - lastValue);
        }
        const delta = Math.max(0, current - turn[seenField]);
        if (delta > 0) {
          turn[field] += delta;
          deltas[field] += delta;
          if (field === "outputTokens") outputDelta = delta;
          changed = true;
        }
        turn[seenField] = current;
      }
      if (current.total != null && turn.appliedTotals) {
        turn.appliedTotals.add(current.total);
        if (turn.appliedTotals.size > 256) turn.appliedTotals.delete(turn.appliedTotals.values().next().value);
      }
      if (changed) {
        turn.usageSamples += 1;
        codexPlusUsageRememberCallSample(
          turn,
          codexPlusUsageCallSample(turn, previous, deltas, at, current),
        );
        const lastCallTokens = previous.total > 0 ? previous.total : outputDelta;
        if (lastCallTokens > 0) turn.lastCallTokens = lastCallTokens;
        const output = previous.output > 0 ? previous.output : outputDelta;
        if (output > 0) {
          turn.pendingOutput += output;
          codexPlusUsageSettleCall(turn);
        }
      }
      turn.skipMatchingUsage = false;
      turn.lastHistorySample = null;
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

  function codexPlusUsageDecodeSpeed(outputTokens, decodeMs) {
    return outputTokens > 0 && decodeMs > 0 ? outputTokens / (decodeMs / 1000) : null;
  }

  function codexPlusUsageSettledSpeed(calls) {
    let output = 0;
    let decodeMs = 0;
    for (const call of Array.isArray(calls) ? calls : []) {
      const tokens = codexPlusUsageNumber(call?.output);
      const duration = codexPlusUsageNumber(call?.decodeMs);
      if (tokens > 0 && duration > 0) {
        output += tokens;
        decodeMs += duration;
      }
    }
    return codexPlusUsageDecodeSpeed(output, decodeMs);
  }

  // 主指标口径：模型可见窗口吞吐。分母 = 轮时长 − 首 token 等待 − 工具执行，只衡量模型真正在产出的时间。
  function codexPlusUsageModelWindowSpeed(turn, now) {
    if (!turn) return null;
    // 历史回填没有事件时间轴，算出的窗口不可信，直接显示 --。
    if (turn.historySeeded && turn.firstTokenAt == null) return null;
    const end = turn.completedAt ?? (Number.isFinite(now) ? now : Date.now());
    const wallMs = Math.max(0, end - turn.startedAt);
    const ttftMs = turn.firstTokenAt == null
      ? 0
      : codexPlusUsageClamp(turn.firstTokenAt - turn.startedAt, 0, wallMs);
    // 进行中的工具也要扣掉，否则工具跑多久速度就掉多久。
    const intervals = turn.toolIntervals.slice();
    for (const tool of turn.activeTools?.values?.() ?? []) {
      if (Number.isFinite(tool?.startedAt)) intervals.push([tool.startedAt, end]);
    }
    const toolMs = codexPlusUsageMergedDuration(intervals);
    const windowMs = Math.max(0, wallMs - ttftMs - Math.min(toolMs, wallMs - ttftMs));
    // 没有任何窗口数据时退回已结算累计，避免无 delta 会话显示 --。
    const speed = codexPlusUsageDecodeSpeed(turn.outputTokens, windowMs)
      ?? codexPlusUsageSettledSpeed(turn.settledCalls);
    // 统计窗口刚跨过一个工具时可能只剩几毫秒；真实峰值约 400 tok/s，超出即视为分母失真。
    return speed == null ? null : Math.min(speed, codexPlusUsageSpeedPeak);
  }

  function codexPlusUsageAverageSpeed(calls) {
    const rates = (Array.isArray(calls) ? calls : [])
      .map((call) => codexPlusUsageDecodeSpeed(
        codexPlusUsageNumber(call?.output),
        codexPlusUsageNumber(call?.decodeMs),
      ))
      // 超过已知峰值的样本由事件截断产生，不进入平均值。
      .filter((rate) => rate != null && rate <= codexPlusUsageSpeedPeak);
    if (!rates.length) return null;
    if (rates.length <= 2) {
      return rates.reduce((total, rate) => total + rate, 0) / rates.length;
    }
    const sorted = rates.slice().sort((left, right) => left - right);
    const trimmed = sorted.slice(1, -1);
    return trimmed.reduce((total, rate) => total + rate, 0) / trimmed.length;
  }

  function codexPlusUsageFormatSpeed(value) {
    const clamped = Math.max(0, Number(value) || 0);
    return clamped >= 10 ? String(Math.round(clamped)) : String(Math.round(clamped * 10) / 10);
  }

  function codexPlusUsageContextSnapshot(turn, liveContext) {
    const currentWindow = codexPlusUsageNumber(
      liveContext?.contextWindow
      ?? liveContext?.modelContextWindow
      ?? liveContext?.context_window,
    );
    const currentTokens = codexPlusUsageNumber(
      liveContext?.contextTokens
      ?? liveContext?.contextUsed
      ?? liveContext?.context_used
      ?? liveContext?.totalTokens,
    );
    const window = currentWindow > 0 ? currentWindow : turn?.contextWindow;
    const tokens = currentTokens ?? codexPlusUsageNumber(turn?.contextTokens);
    const percent = window > 0 && tokens != null
      ? codexPlusUsageClamp(tokens / window * 100, 0, 100)
      : null;
    return { percent, window, tokens };
  }

  function codexPlusUsageLatestLiveContext(events) {
    if (!Array.isArray(events)) return null;
    let contextTokens = null;
    let contextWindow = null;
    for (const event of events) {
      const tokens = codexPlusUsageNumber(
        event?.total_tokens
        ?? event?.totalTokens
        ?? event?.context_tokens
        ?? event?.contextTokens,
      );
      const window = codexPlusUsageNumber(
        event?.context_window
        ?? event?.contextWindow
        ?? event?.model_context_window
        ?? event?.modelContextWindow,
      );
      if (tokens != null) contextTokens = tokens;
      if (window > 0) contextWindow = window;
    }
    return contextTokens != null || contextWindow != null
      ? { contextTokens, contextWindow }
      : null;
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
    const context = codexPlusUsageContextSnapshot(
      turn,
      codexPlusUsageState.liveContextByThread.get(turn.threadId),
    );
    return {
      speed: codexPlusUsageModelWindowSpeed(turn, end),
      averageSpeed: codexPlusUsageAverageSpeed(turn.settledCalls),
      ttftMs,
      decodeMs,
      toolMs,
      otherMs,
      turnMs,
      startedAt: turn.startedAt,
      endedAt: end,
      outputTokens: turn.outputTokens,
      lastCallTokens: turn.lastCallTokens,
      callSamples: turn.callSamples.slice(-codexPlusUsageMaxLiveSamples),
      contextPercent: context.percent,
      contextWindow: context.window,
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
    const cumulatives = new Set();
    for (const row of rows) {
      const observedAt = Date.parse(row?.observed_at || row?.observedAt || row?.timestamp || row?.created_at || "");
      const usage = codexPlusUsageTokenTotals(row?.usage || row?.tokenUsage || row?.token_usage || row);
      if (!Number.isFinite(observedAt) || !usage) continue;
      const turnId = String(row?.turn_id || row?.turnId || "");
      // 重放或重复的 token_count 会换个时间戳再来一次，认累计值不认时间戳。
      // shortcut: 宿主缺 total_token_usage 时 contextUsed 会退回本次用量，极端情况下会误判重复。
      const cumulative = codexPlusUsageNumber(row?.usage?.contextUsed ?? row?.usage?.context_used);
      if (cumulative != null) {
        if (cumulatives.has(cumulative)) continue;
        cumulatives.add(cumulative);
      }
      const key = [observedAt, turnId, usage.input, usage.cached, usage.output, usage.total].join("|");
      if (seen.has(key)) continue;
      seen.add(key);
      const contextWindow = codexPlusUsageNumber(
        row?.usage?.contextLimit
        ?? row?.usage?.context_limit
        ?? row?.usage?.modelContextWindow
        ?? row?.usage?.model_context_window,
      );
      samples.push({ observedAt, turnId, ...usage, contextTokens: cumulative ?? usage.total, contextWindow });
    }
    return samples.sort((left, right) => left.observedAt - right.observedAt);
  }

  function codexPlusUsageMergeHistorySamples(...collections) {
    const samples = [];
    const seen = new Set();
    for (const collection of collections) {
      for (const sample of Array.isArray(collection) ? collection : []) {
        const turnId = String(sample?.turnId || "");
        const cumulative = codexPlusUsageNumber(sample?.contextTokens ?? sample?.contextUsed);
        const key = cumulative != null
          ? [turnId, cumulative, sample.input, sample.cached, sample.output, sample.total].join("|")
          : [
            turnId,
            Number.isFinite(sample?.observedAt) ? sample.observedAt : "",
            sample?.input,
            sample?.cached,
            sample?.output,
            sample?.total,
          ].join("|");
        if (seen.has(key)) continue;
        seen.add(key);
        samples.push(sample);
      }
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
    if (latest.total > 0) turn.lastCallTokens = latest.total;
    if (latest.contextTokens != null) turn.contextTokens = latest.contextTokens;
    if (latest.contextWindow && latest.contextWindow > 0) turn.contextWindow = latest.contextWindow;
    if (!live || live.turnId !== turnId) {
      turn.startedAt = attempts[0].observedAt;
      turn.completedAt = attempts[attempts.length - 1].observedAt;
      turn.lastEventAt = turn.completedAt;
      turn.status = "completed";
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
    if (range === "yesterday") return { start: today - dayMs, end: today - 1 };
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
    return range === "today" || range === "yesterday" || range === "week" || range === "custom";
  }

  function codexPlusUsageBeijingDateKey(value) {
    const shifted = new Date(value + 8 * 60 * 60 * 1000);
    const pad = (number) => String(number).padStart(2, "0");
    return `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}`;
  }

  function codexPlusUsageMagpieDateKey(value) {
    const timestamp = Date.parse(String(value || ""));
    return Number.isFinite(timestamp) ? codexPlusUsageBeijingDateKey(timestamp) : "";
  }

  function codexPlusUsageMagpieSnapshotFromValues(source, dateKey = "") {
    if (!dateKey || !source || typeof source !== "object") return null;
    const input = codexPlusUsageNumber(source.input) ?? 0;
    const output = codexPlusUsageNumber(source.output) ?? 0;
    const cached = codexPlusUsageNumber(source.cache_read) ?? codexPlusUsageNumber(source.cached) ?? 0;
    return {
      dateKey,
      input,
      output,
      cached,
      reasoning: codexPlusUsageNumber(source.reasoning) ?? 0,
      total: input + cached + output,
      calls: codexPlusUsageNumber(source.calls) ?? 0,
      cost: codexPlusUsageNumber(source.cost) ?? 0,
      source: "magpie",
    };
  }

  function codexPlusUsageMagpieSnapshots(payload) {
    const snapshots = new Map();
    for (const row of Array.isArray(payload?.series) ? payload.series : []) {
      const dateKey = codexPlusUsageMagpieDateKey(row?.time);
      const snapshot = codexPlusUsageMagpieSnapshotFromValues(row, dateKey);
      if (snapshot) snapshots.set(dateKey, snapshot);
    }
    return snapshots;
  }

  function codexPlusUsageMagpieSessions(payload) {
    const sessions = new Map();
    for (const row of Array.isArray(payload?.sessions) ? payload.sessions : []) {
      const id = codexPlusUsageNormalizeThreadId(row?.id);
      if (!id) continue;
      const input = codexPlusUsageNumber(row?.input) ?? 0;
      const output = codexPlusUsageNumber(row?.output) ?? 0;
      const cached = codexPlusUsageNumber(row?.cache_read) ?? codexPlusUsageNumber(row?.cached) ?? 0;
      sessions.set(id, {
        id,
        agent: String(row?.agent || "").trim(),
        input,
        output,
        cached,
        reasoning: codexPlusUsageNumber(row?.reasoning) ?? 0,
        total: input + cached + output,
        calls: codexPlusUsageNumber(row?.calls) ?? 0,
        cost: codexPlusUsageNumber(row?.cost) ?? 0,
        source: "magpie",
      });
    }
    return sessions;
  }

  function codexPlusUsageMagpieTodaySnapshot(payload, now = Date.now()) {
    if (!payload || typeof payload !== "object") return null;
    const dateKey = codexPlusUsageMagpieDateKey(payload.since || payload.time)
      || codexPlusUsageBeijingDateKey(now);
    return codexPlusUsageMagpieSnapshotFromValues(payload, dateKey);
  }

  function codexPlusUsageMagpieTaskSession(payload, threadId) {
    const id = codexPlusUsageNormalizeThreadId(threadId);
    const snapshot = codexPlusUsageMagpieSnapshotFromValues(payload, "task");
    if (!id || !snapshot) return null;
    return {
      id,
      agent: "codex",
      input: snapshot.input,
      output: snapshot.output,
      cached: snapshot.cached,
      reasoning: snapshot.reasoning,
      total: snapshot.total,
      calls: snapshot.calls,
      cost: snapshot.cost,
      source: "magpie",
    };
  }

  function codexPlusUsageAbsoluteUrl(value) {
    if (!value) return "";
    try {
      return new URL(String(value), document.baseURI || location.href).href;
    } catch {
      return "";
    }
  }

  function codexPlusUsageCollectAssetUrls() {
    const urls = new Set();
    const push = (value) => {
      const url = codexPlusUsageAbsoluteUrl(value);
      if (url && /\/assets\/.+\.js(?:$|\?)/.test(url)) urls.add(url);
    };
    try {
      document.querySelectorAll?.("script[src],link[href]")?.forEach((node) => {
        push(node?.getAttribute?.("src") || node?.getAttribute?.("href") || "");
      });
    } catch {
      // 页面 DOM 不可用时仍尝试 performance 资源列表。
    }
    try {
      performance.getEntriesByType?.("resource")?.forEach((entry) => push(entry?.name));
    } catch {
      // 旧宿主可能没有 performance 资源条目。
    }
    return [...urls];
  }

  async function codexPlusUsageResolveAppServices() {
    const state = codexPlusUsageState;
    if (state.appServicesPromise) return state.appServicesPromise;
    const promise = (async () => {
      const urls = codexPlusUsageCollectAssetUrls()
        .filter((url) => /\/assets\/rpc-[^/]+\.js(?:$|\?)/.test(url));
      for (const url of urls) {
        try {
          const moduleExports = await import(/* @vite-ignore */ url);
          const services = moduleExports?.appServices;
          if (services?.httpFetch && typeof services.httpFetch.fetch === "function") {
            return services;
          }
        } catch {
          // 继续尝试下一个已加载的 RPC 资源。
        }
      }
      return null;
    })();
    state.appServicesPromise = promise;
    try {
      const services = await promise;
      if (!services && state.appServicesPromise === promise) state.appServicesPromise = null;
      return services;
    } catch (error) {
      if (state.appServicesPromise === promise) state.appServicesPromise = null;
      throw error;
    }
  }

  async function codexPlusUsageServiceGetJson(services, url) {
    if (!services?.httpFetch || typeof services.httpFetch.fetch !== "function") {
      throw new Error("HTTP fetch service 不可用");
    }
    const requestId = `tokenlens-magpie-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const result = await services.httpFetch.fetch(requestId, {
      url,
      method: "GET",
      headers: {},
      retry: false,
    });
    if (!result?.response) throw new Error(result?.error || "HTTP fetch service 未返回响应");
    if (!result.response.ok) throw new Error(`Magpie 请求失败 (${result.response.status || 0})`);
    try {
      return await result.response.json();
    } finally {
      result?.[Symbol.dispose]?.();
    }
  }

  async function codexPlusUsageBridgeGetJson(url) {
    try {
      const services = await codexPlusUsageResolveAppServices();
      if (services?.httpFetch) return await codexPlusUsageServiceGetJson(services, url);
    } catch {
      // 新宿主优先走官方 HTTP service；旧宿主继续尝试 renderer bridge。
    }
    const bridge = window.electronBridge;
    if (!bridge || typeof bridge.sendMessageFromView !== "function") {
      throw new Error("Electron bridge 不可用");
    }
    const requestId = `tokenlens-magpie-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    return new Promise((resolve, reject) => {
      let settled = false;
      let timer = 0;
      const cleanup = () => {
        if (timer) window.clearTimeout(timer);
        window.removeEventListener?.("message", handler, true);
      };
      const settle = (data) => {
        if (settled || !data || data.requestId !== requestId || data.type !== "fetch-response") return false;
        settled = true;
        cleanup();
        const status = Number(data.status) || 0;
        if (data.responseType !== "success" || status >= 400) {
          reject(new Error(`Magpie 请求失败${status ? ` (${status})` : ""}`));
          return true;
        }
        try {
          const body = data.bodyJsonString ?? data.body ?? data.bodyJson ?? "{}";
          resolve(typeof body === "string" ? JSON.parse(body) : body);
        } catch (error) {
          reject(error);
        }
        return true;
      };
      const handler = (event) => {
        settle(event?.data);
      };
      window.addEventListener?.("message", handler, true);
      timer = window.setTimeout(() => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(new Error("Magpie 请求超时"));
      }, codexPlusUsageMagpieTimeoutMs);
      Promise.resolve(
        bridge.sendMessageFromView({
          type: "fetch",
          method: "GET",
          url,
          requestId,
        }),
      )
        .then(settle)
        .catch((error) => {
          if (settled) return;
          settled = true;
          cleanup();
          reject(error);
        });
    });
  }

  async function codexPlusUsageRefreshMagpieUsage(force = false) {
    const state = codexPlusUsageState;
    if (state.disposed) return { ok: false, changed: false };
    if (state.magpieUsagePromise) return state.magpieUsagePromise;
    const now = Date.now();
    if (!force && now - state.magpieUsageLastAttemptAt < codexPlusUsageMagpieRefreshMs) {
      return { ok: state.magpieUsage.fetchedAt > 0, changed: false };
    }
    state.magpieUsageLastAttemptAt = now;
    state.magpieUsagePromise = (async () => {
      try {
        const taskId = codexPlusUsageNormalizeThreadId(state.threadId);
        const taskUrl = taskId
          ? codexPlusUsageMagpieTaskUsageUrlPrefix + encodeURIComponent(taskId)
          : "";
        const [weekResult, todayResult, taskResult] = await Promise.allSettled([
          codexPlusUsageBridgeGetJson(codexPlusUsageMagpieUsageUrl),
          codexPlusUsageBridgeGetJson(codexPlusUsageMagpieTodayUsageUrl),
          taskUrl ? codexPlusUsageBridgeGetJson(taskUrl) : Promise.resolve(null),
        ]);
        const snapshots = new Map();
        const errors = [];
        if (weekResult.status === "fulfilled") {
          for (const [dateKey, snapshot] of codexPlusUsageMagpieSnapshots(weekResult.value)) {
            snapshots.set(dateKey, snapshot);
          }
        } else {
          errors.push(String(weekResult.reason?.message || weekResult.reason));
        }
        if (todayResult.status === "fulfilled") {
          const today = codexPlusUsageMagpieTodaySnapshot(todayResult.value);
          if (today) snapshots.set(today.dateKey, today);
        } else {
          errors.push(String(todayResult.reason?.message || todayResult.reason));
        }
        const sessions = new Map();
        if (taskResult.status === "fulfilled") {
          const task = codexPlusUsageMagpieTaskSession(taskResult.value, taskId);
          if (task) sessions.set(task.id, task);
        } else {
          errors.push(`当前任务: ${String(taskResult.reason?.message || taskResult.reason)}`);
        }
        if (!snapshots.size) throw new Error(errors.join("；") || "Magpie 未返回可用用量");
        if (state.disposed) return { ok: false, changed: false };
        let changed = state.magpieUsage.snapshots.size !== snapshots.size
          || state.magpieUsage.sessions.size !== sessions.size;
        for (const [dateKey, snapshot] of snapshots) {
          const previous = state.magpieUsage.snapshots.get(dateKey);
          if (
            previous?.total !== snapshot.total
            || previous?.input !== snapshot.input
            || previous?.output !== snapshot.output
            || previous?.cached !== snapshot.cached
            || previous?.calls !== snapshot.calls
          ) {
            changed = true;
          }
        }
        for (const [id, session] of sessions) {
          const previous = state.magpieUsage.sessions.get(id);
          if (
            previous?.total !== session.total
            || previous?.input !== session.input
            || previous?.output !== session.output
            || previous?.cached !== session.cached
            || previous?.calls !== session.calls
          ) {
            changed = true;
          }
        }
        state.magpieUsage = { fetchedAt: Date.now(), snapshots, sessions };
        state.magpieUsageError = "";
        return { ok: true, changed };
      } catch (error) {
        if (!state.disposed) {
          state.magpieUsageError = String(error?.message || error);
        }
        return { ok: false, changed: false, error: state.magpieUsageError };
      } finally {
        state.magpieUsagePromise = null;
      }
    })();
    return state.magpieUsagePromise;
  }

  function codexPlusUsageGlobalDateKeys(startAt, endAt) {
    if (!Number.isFinite(startAt) || !Number.isFinite(endAt) || endAt < startAt) return [];
    const dayMs = 24 * 60 * 60 * 1000;
    let cursor = codexPlusUsageBeijingDayStart(startAt);
    const last = codexPlusUsageBeijingDayStart(endAt);
    const keys = [];
    while (cursor <= last && keys.length < 370) {
      keys.push(codexPlusUsageBeijingDateKey(cursor));
      cursor += dayMs;
    }
    return keys;
  }

  function codexPlusUsageNormalizeGlobalDay(snapshot, source = "daily") {
    if (!snapshot || !Number.isFinite(codexPlusUsageNumber(snapshot.total))) return null;
    const rawInput = codexPlusUsageNumber(snapshot.input) ?? 0;
    const cached = codexPlusUsageNumber(snapshot.cached) ?? codexPlusUsageNumber(snapshot.cache_read) ?? 0;
    const output = codexPlusUsageNumber(snapshot.output) ?? 0;
    const magpie = source === "magpie"
      || snapshot.usageSource === "magpie"
      || snapshot.source === "magpie";
    // Magpie 的 input 是非缓存输入；本地日报的 input 是含缓存的总输入。
    const input = magpie ? rawInput : Math.max(0, rawInput - cached);
    return {
      input,
      cached,
      output,
      inputTotal: input + cached,
      total: codexPlusUsageNumber(snapshot.total),
      calls: codexPlusUsageNumber(snapshot.calls) ?? 0,
    };
  }

  function codexPlusUsageGlobalAggregate(
    range,
    now = Date.now(),
    api = window[codexPlusUsageGlobalApiKey],
    magpieUsage = codexPlusUsageState.magpieUsage,
  ) {
    const bounds = codexPlusUsageRangeBounds(range, now);
    if (!bounds) return null;
    if (!codexPlusUsageIsGlobalRange(range)) return null;
    const keys = codexPlusUsageGlobalDateKeys(bounds.start, bounds.end);
    if (!keys.length) return null;
    const maxAge = Number.isFinite(codexPlusUsageState.magpieUsageMaxAgeMs)
      ? codexPlusUsageState.magpieUsageMaxAgeMs
      : 30_000;
    const magpieFresh = !!magpieUsage?.fetchedAt
      && now >= magpieUsage.fetchedAt
      && now - magpieUsage.fetchedAt <= maxAge
      && typeof magpieUsage.snapshots?.get === "function";
    const dailyAvailable = typeof api?.getSnapshot === "function";
    if (!magpieFresh && !dailyAvailable) return null;
    const aggregate = {
      total: 0,
      input: 0,
      output: 0,
      cached: 0,
      inputTotal: 0,
      calls: 0,
      hitRate: null,
    };
    let available = 0;
    let magpieDays = 0;
    let dailyDays = 0;
    for (const key of keys) {
      const magpieSnapshot = magpieFresh ? magpieUsage.snapshots.get(key) : null;
      const magpieDay = codexPlusUsageNormalizeGlobalDay(magpieSnapshot, "magpie");
      if (magpieDay) {
        available += 1;
        magpieDays += 1;
        aggregate.total += magpieDay.total;
        aggregate.input += magpieDay.input;
        aggregate.output += magpieDay.output;
        aggregate.cached += magpieDay.cached;
        aggregate.inputTotal += magpieDay.inputTotal;
        aggregate.calls += magpieDay.calls;
        continue;
      }
      if (!dailyAvailable) continue;
      const snapshot = api.getSnapshot(key);
      if (snapshot?.dateKey !== key || !Number.isFinite(snapshot?.total)) continue;
      const dailyDay = codexPlusUsageNormalizeGlobalDay(snapshot, "daily");
      if (!dailyDay) continue;
      available += 1;
      const isMagpie = snapshot.usageSource === "magpie" || snapshot.source === "magpie";
      if (isMagpie) magpieDays += 1;
      else dailyDays += 1;
      aggregate.total += dailyDay.total;
      aggregate.input += dailyDay.input;
      aggregate.output += dailyDay.output;
      aggregate.cached += dailyDay.cached;
      aggregate.inputTotal += dailyDay.inputTotal;
      aggregate.calls += dailyDay.calls;
    }
    codexPlusUsageState.globalUsageCoverage = { available, total: keys.length };
    codexPlusUsageState.globalUsageSourceCoverage = { magpie: magpieDays, daily: dailyDays };
    const result = available ? aggregate : null;
    if (result) {
      result.hitRate = result.inputTotal > 0
        ? Math.min(1, result.cached / result.inputTotal)
        : null;
    }
    codexPlusUsageState.globalUsageAggregate = result;
    return result;
  }

  function codexPlusUsageGlobalTotal(...args) {
    return codexPlusUsageGlobalAggregate(...args)?.total ?? null;
  }

  async function codexPlusUsageRefreshGlobalUsage(force = false) {
    if (codexPlusUsageState.globalUsagePromise) return codexPlusUsageState.globalUsagePromise;
    codexPlusUsageState.globalUsageLoading = true;
    codexPlusUsageState.globalUsageError = "";
    codexPlusUsageState.globalUsagePromise = (async () => {
      const magpie = await codexPlusUsageRefreshMagpieUsage(force);
      const aggregate = codexPlusUsageGlobalAggregate(codexPlusUsageState.range);
      if (!aggregate && !magpie.ok) {
        throw new Error(magpie.error
          ? `Magpie 不可用，且没有本地日报：${magpie.error}`
          : "没有可用的每日消耗数据源");
      }
      codexPlusUsageState.globalUsageError = magpie.ok
        ? ""
        : `Magpie 不可用，已回退本地日报：${magpie.error || "未知错误"}`;
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

  function codexPlusUsageTaskUsage(snapshot, now = Date.now()) {
    const local = snapshot?.usage || null;
    const state = codexPlusUsageState;
    const maxAge = Number.isFinite(state.magpieUsageMaxAgeMs)
      ? state.magpieUsageMaxAgeMs
      : 30_000;
    const fresh = !!state.magpieUsage?.fetchedAt
      && now >= state.magpieUsage.fetchedAt
      && now - state.magpieUsage.fetchedAt <= maxAge
      && typeof state.magpieUsage.sessions?.get === "function";
    const session = fresh ? state.magpieUsage.sessions.get(state.threadId) : null;
    if (!local && !session) return null;
    const localCached = codexPlusUsageNumber(local?.cached) ?? 0;
    const localInput = Math.max(0, (codexPlusUsageNumber(local?.input) ?? 0) - localCached);
    const input = Math.max(localInput, codexPlusUsageNumber(session?.input) ?? 0);
    const cached = Math.max(localCached, codexPlusUsageNumber(session?.cached) ?? 0);
    const output = Math.max(
      codexPlusUsageNumber(local?.output) ?? 0,
      codexPlusUsageNumber(session?.output) ?? 0,
    );
    const inputTotal = input + cached;
    return {
      input,
      cached,
      output,
      total: inputTotal + output,
      hitRate: inputTotal > 0 ? Math.min(1, cached / inputTotal) : null,
      calls: Math.max(
        codexPlusUsageNumber(snapshot?.samples) ?? 0,
        codexPlusUsageNumber(session?.calls) ?? 0,
      ),
      source: session ? "magpie" : "local",
    };
  }

  function codexPlusUsageSelectedUsage(snapshot) {
    if (codexPlusUsageState.range === "task") return codexPlusUsageTaskUsage(snapshot);
    return codexPlusUsageGlobalAggregate(codexPlusUsageState.range);
  }

  function codexPlusUsageSelectedConsumption(snapshot) {
    const text = codexPlusUsageText();
    const usage = codexPlusUsageSelectedUsage(snapshot);
    if (codexPlusUsageState.range === "task") {
      return { label: text.labels.task, value: usage?.total ?? null, usage };
    }
    const base = text.labels[codexPlusUsageState.range] || text.labels.custom;
    const coverage = codexPlusUsageState.globalUsageCoverage;
    const coverageLabel = coverage.total > coverage.available
      ? `${base}（${coverage.available}/${coverage.total}）`
      : base;
    return {
      label: coverageLabel,
      value: usage?.total ?? null,
      usage,
    };
  }

  function codexPlusUsageTrimMap(map, maximum, keepKey = "") {
    for (const key of map.keys()) {
      if (map.size <= maximum) break;
      if (key !== keepKey) map.delete(key);
    }
  }

  function codexPlusUsageRefreshLiveContext(threadId, force = false) {
    const id = codexPlusUsageNormalizeThreadId(threadId);
    const bridge = window.__codexSessionDeleteBridge;
    if (!id || typeof bridge !== "function" || codexPlusUsageState.disposed) {
      return Promise.resolve(false);
    }
    const existing = codexPlusUsageState.liveContextPromises.get(id);
    if (existing) return existing;
    const fetchedAt = codexPlusUsageState.liveContextFetchedAt.get(id) || 0;
    if (!force && Date.now() - fetchedAt < codexPlusUsageLiveContextRefreshMs) {
      return Promise.resolve(false);
    }
    codexPlusUsageState.liveContextFetchedAt.set(id, Date.now());
    const promise = Promise.resolve(bridge("/thread-usage-live", { session_id: id }))
      .then((result) => {
        if (codexPlusUsageState.disposed || result?.status !== "ok") return false;
        const live = codexPlusUsageLatestLiveContext(result.events);
        if (!live) return false;
        const previous = codexPlusUsageState.liveContextByThread.get(id) || {};
        codexPlusUsageState.liveContextByThread.set(id, {
          contextTokens: live.contextTokens ?? previous.contextTokens,
          contextWindow: live.contextWindow > 0 ? live.contextWindow : previous.contextWindow,
        });
        codexPlusUsageTrimMap(codexPlusUsageState.liveContextByThread, codexPlusUsageMaxTurns, id);
        codexPlusUsageTrimMap(codexPlusUsageState.liveContextFetchedAt, codexPlusUsageMaxTurns, id);
        const turn = codexPlusUsageState.turns.get(id);
        if (turn) {
          if (live.contextTokens != null) turn.contextTokens = live.contextTokens;
          if (live.contextWindow > 0) turn.contextWindow = live.contextWindow;
        }
        return true;
      })
      .catch(() => false)
      .finally(() => codexPlusUsageState.liveContextPromises.delete(id));
    codexPlusUsageState.liveContextPromises.set(id, promise);
    return promise;
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
        const latestSamples = codexPlusUsageHistorySamples(result);
        codexPlusUsageState.historyThreadId = threadId;
        // shortcut: /thread-usage-history 只返回最新 rollout 分段，完整分段历史需宿主提供接口。
        codexPlusUsageState.historySamples = latestSamples;
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

  function codexPlusUsageEnsureNode(card, footerHost = codexPlusUsageComposerFooterHost(card)) {
    const fallbackHost = card?.parentElement;
    if (!fallbackHost) return null;
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

  function codexPlusUsageEnsureChartColumns(parts, count) {
    const desired = Math.max(20, Math.round(Number(count) || 0));
    while (parts.bars.length < desired) {
      const index = parts.bars.length;
      const col = document.createElement("div");
      col.className = "codex-plus-throughput-bar-col";
      const tooltip = document.createElement("span");
      tooltip.className = "codex-plus-throughput-bar-tooltip";
      const stick = document.createElement("div");
      stick.className = "codex-plus-throughput-bar";
      col.append(tooltip, stick);
      parts.barsHost.appendChild(col);
      parts.bars.push({ col, tooltip, stick });

      const xLabel = document.createElement("div");
      xLabel.className = "codex-plus-throughput-x-index";
      parts.xAxisHost.appendChild(xLabel);
      parts.xLabels.push(xLabel);
    }
    while (parts.bars.length > desired) {
      parts.bars.pop()?.col.remove();
      parts.xLabels.pop()?.remove();
    }
    parts.xLabels.forEach((label, index) => {
      const position = index + 1;
      label.textContent = (position === 1 || position % 5 === 0) ? String(position) : "·";
    });
    parts.chartTrack.style.setProperty("--chart-count", String(desired));
    parts.chartTrack.style.width = `${desired / 20 * 100}%`;
    return desired;
  }

  function codexPlusUsagePinChartToLatest(parts) {
    const scroll = parts?.chartScroll;
    if (!scroll) return;
    scroll.scrollLeft = scroll.scrollWidth;
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
        <div class="codex-plus-throughput-popover-head-left">
          <button class="codex-plus-throughput-theme-toggle" type="button" role="switch" aria-checked="false" data-role="theme-toggle">
            <span class="codex-plus-throughput-theme-track" aria-hidden="true">
              <span class="codex-plus-throughput-theme-icon codex-plus-throughput-theme-sun"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"></circle><path d="M12 2v2M12 20v2M4.93 4.93l1.42 1.42M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"></path></svg></span>
              <span class="codex-plus-throughput-theme-thumb"></span>
              <span class="codex-plus-throughput-theme-icon codex-plus-throughput-theme-moon"><svg viewBox="0 0 24 24"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg></span>
            </span>
          </button>
          <span class="codex-plus-throughput-popover-title" data-label="title"></span>
        </div>
        <div class="codex-plus-throughput-popover-head-right">
          <span class="codex-plus-throughput-popover-value" data-role="value"></span>
          <span class="codex-plus-throughput-average-separator">/</span>
          <span class="codex-plus-throughput-average-label" data-label="averageSpeed"></span>
          <span class="codex-plus-throughput-average-value" data-role="average-value"></span>
        </div>
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
          <button class="codex-plus-throughput-preset" type="button" data-range="task" data-label="presetTask" aria-pressed="true"></button>
          <button class="codex-plus-throughput-preset" type="button" data-range="today" data-label="presetToday" aria-pressed="false"></button>
          <button class="codex-plus-throughput-preset" type="button" data-range="yesterday" data-label="presetYesterday" aria-pressed="false"></button>
          <button class="codex-plus-throughput-preset" type="button" data-range="week" data-label="presetWeek" aria-pressed="false"></button>
        </div>
        <div class="codex-plus-throughput-custom">
          <label class="codex-plus-throughput-time"><span data-label="start"></span><input type="datetime-local" step="60" data-role="custom-start"></label>
          <label class="codex-plus-throughput-time"><span data-label="end"></span><input type="datetime-local" step="60" data-role="custom-end"></label>
        </div>
      </div>
      <div class="codex-plus-throughput-analytics">
        <div class="codex-plus-throughput-turn-status">
          <div class="codex-plus-throughput-turn-left">
            <span class="codex-plus-throughput-turn-label" data-label="turnCalls"></span><span class="codex-plus-throughput-turn-call" data-field="turnCalls"></span>
            <span class="codex-plus-throughput-turn-slash">/</span><span class="codex-plus-throughput-turn-round" data-field="turns"></span>
          </div>
          <div class="codex-plus-throughput-turn-right">
            <span class="codex-plus-throughput-turn-label" data-label="totalCalls"></span><span class="codex-plus-throughput-turn-total" data-field="totalCalls"></span>
          </div>
        </div>
        <div class="codex-plus-throughput-top">
          <span class="codex-plus-throughput-top-segment"><span class="codex-plus-throughput-top-label">top1:</span><span class="codex-plus-throughput-top-value" data-field="top1Tokens"></span></span>
          <span class="codex-plus-throughput-top-segment"><span class="codex-plus-throughput-top-label">top2:</span><span class="codex-plus-throughput-top-value" data-field="top2Tokens"></span></span>
          <span class="codex-plus-throughput-top-segment"><span class="codex-plus-throughput-top-label">top3:</span><span class="codex-plus-throughput-top-value" data-field="top3Tokens"></span></span>
        </div>
        <div class="codex-plus-throughput-chart">
          <div class="codex-plus-throughput-axis-y"><span data-field="yTop"></span><span data-field="yMid"></span><span>0</span></div>
          <div class="codex-plus-throughput-chart-main" data-role="chart-scroll">
            <div class="codex-plus-throughput-chart-track" data-role="chart-track">
              <div class="codex-plus-throughput-bars" data-role="bars"></div>
              <div class="codex-plus-throughput-axis-x" data-role="x-axis"></div>
            </div>
          </div>
        </div>
      </div>
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
      averageValue: popover.querySelector('[data-role="average-value"]'),
      themeToggle: popover.querySelector('[data-role="theme-toggle"]'),
      chartScroll: popover.querySelector('[data-role="chart-scroll"]'),
      chartTrack: popover.querySelector('[data-role="chart-track"]'),
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
      bars: [],
      xLabels: [],
    };
    const barsHost = popover.querySelector('[data-role="bars"]');
    const xAxisHost = popover.querySelector('[data-role="x-axis"]');
    parts.barsHost = barsHost;
    parts.xAxisHost = xAxisHost;
    codexPlusUsageEnsureChartColumns(parts, 20);
    const now = new Date();
    now.setMinutes(0, 0, 0);
    const initialStart = new Date(now.getTime() - 4 * 60 * 60 * 1000);
    if (!codexPlusUsageState.customStart) codexPlusUsageState.customStart = codexPlusUsageBeijingDateTime(initialStart);
    if (!codexPlusUsageState.customEnd) codexPlusUsageState.customEnd = codexPlusUsageBeijingDateTime(now);
    parts.customStart.value = codexPlusUsageState.customStart;
    parts.customEnd.value = codexPlusUsageState.customEnd;
    parts.customStart.setAttribute("aria-label", text.labels.start);
    parts.customEnd.setAttribute("aria-label", text.labels.end);
    parts.themeToggle.addEventListener("click", () => {
      codexPlusUsageSetTheme(codexPlusUsageState.theme === "light" ? "dark" : "light");
    });
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
    codexPlusUsageApplyTheme(codexPlusUsageState.theme);
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
    if (!Number.isFinite(value)) return codexPlusUsageText().unavailable;
    const tokens = Math.max(0, value);
    // 小量保留有效数字，避免 1096 tokens 显示成 0.00 M。
    if (tokens < 10_000) return String(Math.round(tokens));
    return `${(tokens / 1_000_000).toFixed(2)} M`;
  }

  function codexPlusUsageFormatPercent(value) {
    return Number.isFinite(value) ? `${(Math.max(0, value) * 100).toFixed(1)}%` : codexPlusUsageText().unavailable;
  }

  function codexPlusUsageFormatTokenWindow(value) {
    if (!Number.isFinite(value) || value <= 0) return codexPlusUsageText().unavailable;
    if (value >= 1_000_000) {
      return `${Number((value / 1_000_000).toFixed(1))}M`;
    }
    return `${Number((value / 1_000).toFixed(1))}K`;
  }

  function codexPlusUsageFormatContext(percent, window) {
    if (!Number.isFinite(percent)) return codexPlusUsageText().unavailable;
    const percentText = `${Number(Math.max(0, percent).toFixed(1))}%`;
    return window > 0
      ? `${percentText}/${codexPlusUsageFormatTokenWindow(window)}`
      : percentText;
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

  function codexPlusUsageTurnGroups(samples, snapshot, liveTurnId = "", now = Date.now(), aggregation = "sum") {
    const groups = new Map();
    const liveKey = String(liveTurnId || (snapshot ? "live" : ""));
    const maximum = aggregation === "max";
    for (const sample of Array.isArray(samples) ? samples : []) {
      const at = Number.isFinite(sample?.observedAt) ? sample.observedAt : now;
      const key = String(sample?.turnId || ("sample:" + at));
      const group = groups.get(key) || { turnId: key, calls: 0, tokens: 0, lastAt: 0 };
      group.calls += 1;
      const tokens = Number.isFinite(sample?.total) ? sample.total : 0;
      group.tokens = maximum ? Math.max(group.tokens, tokens) : group.tokens + tokens;
      group.lastAt = Math.max(group.lastAt, at);
      groups.set(key, group);
    }
    if (liveKey && snapshot) {
      const current = groups.get(liveKey) || { turnId: liveKey, calls: 0, tokens: 0, lastAt: now };
      current.calls = Math.max(current.calls, Number.isFinite(snapshot.samples) ? snapshot.samples : 0);
      if (maximum && current.tokens <= 0 && (snapshot.samples ?? 0) <= 1) {
        current.tokens = Math.max(0, Number(snapshot.usage?.total) || 0);
      } else if (!maximum) {
        current.tokens = Math.max(current.tokens, Number.isFinite(snapshot.usage?.total) ? snapshot.usage.total : 0);
      }
      current.lastAt = Math.max(current.lastAt, now);
      groups.set(liveKey, current);
    }
    return [...groups.values()].sort((left, right) => left.lastAt - right.lastAt);
  }

  function codexPlusUsageSampleKey(sample, index = 0) {
    const observedAt = Number.isFinite(sample?.observedAt) ? sample.observedAt : "";
    return [
      String(sample?.turnId || ""),
      observedAt,
      sample?.input ?? "",
      sample?.cached ?? "",
      sample?.output ?? "",
      sample?.total ?? "",
    ].join("|") || `sample:${index}`;
  }

  function codexPlusUsageChartCalls(samples, snapshot, liveTurnId = "", now = Date.now()) {
    const mergedSamples = codexPlusUsageMergeHistorySamples(samples, snapshot?.callSamples);
    const calls = mergedSamples
      .map((sample, index) => {
        const tokens = Number(sample?.total);
        if (!Number.isFinite(tokens) || tokens <= 0) return null;
        return {
          id: codexPlusUsageSampleKey(sample, index),
          turnId: String(sample?.turnId || `sample:${index}`),
          tokens,
          observedAt: Number.isFinite(sample?.observedAt) ? sample.observedAt : now,
          isCurrent: false,
        };
      })
      .filter(Boolean)
      .sort((left, right) => left.observedAt - right.observedAt || left.id.localeCompare(right.id));
    if (!snapshot) return calls;

    const liveKey = String(liveTurnId || "live");
    const lastCallTokens = Number.isFinite(snapshot.lastCallTokens) && snapshot.lastCallTokens > 0
      ? snapshot.lastCallTokens
      : (snapshot.samples ?? 0) <= 1 ? Number(snapshot.usage?.total) : null;
    if (!Number.isFinite(lastCallTokens) || lastCallTokens <= 0) return calls;

    let latest = null;
    for (let index = calls.length - 1; index >= 0; index -= 1) {
      if (calls[index].turnId === liveKey) {
        latest = calls[index];
        break;
      }
    }
    if (latest && latest.tokens === lastCallTokens) {
      latest.isCurrent = true;
    } else {
      calls.push({
        id: `live:${liveKey}:${snapshot.samples ?? 0}:${lastCallTokens}`,
        turnId: liveKey,
        tokens: lastCallTokens,
        observedAt: now,
        isCurrent: true,
      });
    }
    return calls.sort((left, right) => left.observedAt - right.observedAt || left.id.localeCompare(right.id));
  }

  function codexPlusUsageChartWindow(calls) {
    // shortcut: 图表最多渲染最近 200 次，TOP 排行仍使用完整样本。
    return (Array.isArray(calls) ? calls : []).slice(-codexPlusUsageMaxChartBars);
  }

  function codexPlusUsageChartScale(value) {
    const base = 100000;
    let top = base;
    const maximum = Number(value);
    while (Number.isFinite(maximum) && maximum > top) top *= 2;
    return { top, mid: top / 2 };
  }

  function codexPlusUsageWanNumber(value) {
    const wan = Math.max(0, value) / 10000;
    return Math.round(wan * (wan >= 10 ? 100 : 10)) / (wan >= 10 ? 100 : 10);
  }

  function codexPlusUsageFormatWan(value) {
    const text = codexPlusUsageText();
    if (!Number.isFinite(value)) return text.unavailable;
    return text.wan(codexPlusUsageWanNumber(value));
  }

  function codexPlusUsageTopCalls(samples, snapshot, liveTurnId = "", now = Date.now()) {
    return codexPlusUsageChartCalls(samples, snapshot, liveTurnId, now)
      .sort((left, right) => right.tokens - left.tokens
        || right.observedAt - left.observedAt
        || left.id.localeCompare(right.id));
  }

  function codexPlusUsageRenderAnalytics(snapshot) {
    const parts = codexPlusUsageState.popoverParts;
    if (!parts?.bars?.length) return;
    const text = codexPlusUsageText();
    const liveTurn = codexPlusUsageState.turns.get(codexPlusUsageState.threadId);
    const groups = codexPlusUsageTurnGroups(
      codexPlusUsageState.historySamples,
      snapshot,
      liveTurn?.turnId || "",
      Date.now(),
      "max",
    );
    const totalCalls = groups.reduce((total, group) => total + group.calls, 0);
    parts.fields.turnCalls.textContent = snapshot ? text.calls(codexPlusUsageFormatCount(snapshot.samples)) : text.unavailable;
    parts.fields.turns.textContent = text.rounds(groups.length);
    parts.fields.totalCalls.textContent = codexPlusUsageFormatCount(totalCalls);
    const rankedCalls = codexPlusUsageTopCalls(
      codexPlusUsageState.historySamples,
      snapshot,
      liveTurn?.turnId || "",
    );
    for (let index = 0; index < 3; index += 1) {
      const item = rankedCalls[index];
      const number = index + 1;
      parts.fields["top" + number + "Tokens"].textContent = item ? codexPlusUsageFormatWan(item.tokens) : text.unavailable;
    }
    const calls = codexPlusUsageChartCalls(
      codexPlusUsageState.historySamples,
      snapshot,
      liveTurn?.turnId || "",
    );
    const renderedCalls = codexPlusUsageChartWindow(calls);
    const renderCount = codexPlusUsageEnsureChartColumns(parts, renderedCalls.length);
    const scale = codexPlusUsageChartScale(
      renderedCalls.reduce((maximum, item) => Math.max(maximum, item.tokens), 0),
    );
    parts.fields.yTop.textContent = codexPlusUsageFormatWan(scale.top);
    parts.fields.yMid.textContent = codexPlusUsageFormatWan(scale.mid);
    const topIds = [rankedCalls[0]?.id, rankedCalls[1]?.id, rankedCalls[2]?.id];
    for (let index = 0; index < renderCount; index += 1) {
      const item = renderedCalls[index] || null;
      const ref = parts.bars[index];
      const height = item && item.tokens > 0
        ? Math.max(2, Math.round(item.tokens / scale.top * 90))
        : 0;
      ref.stick.style.height = height + "%";
      const classes = ["codex-plus-throughput-bar-col"];
      if (item && item.id === topIds[0]) classes.push("is-top1");
      else if (item && item.id === topIds[1]) classes.push("is-top2");
      else if (item && item.id === topIds[2]) classes.push("is-top3");
      if (item?.isCurrent) classes.push("is-current");
      ref.col.className = classes.join(" ");
      ref.col.dataset.empty = item ? "false" : "true";
      const summary = item
        ? codexPlusUsageFormatWan(item.tokens)
        : "";
      ref.tooltip.textContent = summary;
      ref.col.title = summary;
      parts.xLabels[index].classList.toggle("current", !!item?.isCurrent);
    }
    codexPlusUsagePinChartToLatest(parts);
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
    parts.averageValue.textContent = snapshot?.averageSpeed == null
      ? unavailable
      : codexPlusUsageFormatSpeed(snapshot.averageSpeed);
    const context = codexPlusUsageContextSnapshot(
      codexPlusUsageState.turns.get(codexPlusUsageState.threadId),
      codexPlusUsageState.liveContextByThread.get(codexPlusUsageState.threadId),
    );
    parts.contextFill.style.width = `${context.percent == null ? 0 : context.percent}%`;
    parts.fields.context.textContent = codexPlusUsageFormatContext(
      context.percent,
      context.window,
    );
    parts.fields.context.title = context.window > 0
      ? `${text.labels.contextWindow} ${codexPlusUsageFormatCount(context.window)}`
      : "";
    parts.toolToggle.disabled = !snapshot?.toolDetails?.length;
    parts.fields.tool.textContent = codexPlusUsageFormatDuration(snapshot?.toolMs);
    const consumption = codexPlusUsageSelectedConsumption(snapshot);
    const usage = consumption.usage;
    parts.fields.input.textContent = codexPlusUsageFormatM(usage?.input);
    parts.fields.output.textContent = codexPlusUsageFormatM(usage?.output);
    parts.fields.cacheRead.textContent = codexPlusUsageFormatM(usage?.cached);
    parts.fields.hitRate.textContent = codexPlusUsageFormatPercent(usage?.hitRate);
    const globalRange = codexPlusUsageState.range !== "task";
    const consumptionLoading = globalRange
      ? codexPlusUsageState.globalUsageLoading && consumption.value == null
      : codexPlusUsageState.range !== "task" && codexPlusUsageState.historyLoading;
    parts.consumptionLabel.textContent = consumption.label;
    parts.fields.consumption.textContent = consumptionLoading
      ? text.labels.loading
      : codexPlusUsageFormatCount(consumption.value);
    const sources = codexPlusUsageState.globalUsageSourceCoverage;
    parts.fields.consumption.title = globalRange
      ? codexPlusUsageState.magpieUsageError
        || codexPlusUsageState.globalUsageError
        || (sources?.magpie > 0 ? text.labels.magpieLive : "")
      : usage?.source === "magpie"
        ? text.labels.taskMagpieLive
        : codexPlusUsageState.historyError;
    parts.tokenToggle.setAttribute("aria-expanded", String(codexPlusUsageState.tokenExpanded));
    parts.tokenPanel.hidden = !codexPlusUsageState.tokenExpanded;
    for (const button of parts.presets) {
      button.setAttribute("aria-pressed", String(button.dataset.range === codexPlusUsageState.range));
    }
    if (codexPlusUsageState.range !== "custom") {
      const taskStartedAt = codexPlusUsageState.range === "task"
        ? codexPlusUsageUuidV7Timestamp(codexPlusUsageState.threadId) ?? snapshot?.startedAt
        : null;
      const bounds = codexPlusUsageState.range === "task"
        ? (taskStartedAt != null
          ? { start: taskStartedAt, end: snapshot?.endedAt ?? Date.now() }
          : null)
        : codexPlusUsageRangeBounds(codexPlusUsageState.range);
      if (bounds) {
        codexPlusUsageState.customStart = codexPlusUsageBeijingDateTime(bounds.start);
        codexPlusUsageState.customEnd = codexPlusUsageBeijingDateTime(bounds.end);
      }
    }
    if (document.activeElement !== parts.customStart) parts.customStart.value = codexPlusUsageState.customStart;
    if (document.activeElement !== parts.customEnd) parts.customEnd.value = codexPlusUsageState.customEnd;
    codexPlusUsageRenderToolDetails(snapshot);
    codexPlusUsageRenderAnalytics(snapshot);
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
    void codexPlusUsageRefreshGlobalUsage();
    const parts = codexPlusUsageBuildPopover();
    codexPlusUsageUpdatePopover(
      codexPlusUsageTurnSnapshot(codexPlusUsageState.turns.get(codexPlusUsageState.threadId), Date.now()),
    );
    parts.popover.hidden = false;
    codexPlusUsagePinChartToLatest(parts);
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

  function codexPlusUsageRenderFingerprint(snapshot, context) {
    if (!snapshot) {
      const consumption = codexPlusUsageSelectedConsumption(null);
      const usage = consumption.usage;
      return [
        "empty",
        context.percent,
        context.window,
        usage?.input,
        usage?.output,
        usage?.cached,
        usage?.hitRate,
        usage?.source,
        consumption.label,
        consumption.value,
        codexPlusUsageState.range,
        codexPlusUsageState.historyLoading,
        codexPlusUsageState.historyError,
        codexPlusUsageState.globalUsageLoading,
        codexPlusUsageState.globalUsageError,
        codexPlusUsageState.magpieUsageError,
        codexPlusUsageState.globalUsageCoverage.available,
        codexPlusUsageState.globalUsageCoverage.total,
        codexPlusUsageState.globalUsageSourceCoverage.magpie,
        codexPlusUsageState.globalUsageSourceCoverage.daily,
      ].join("|");
    }
    const speed = snapshot.speed == null ? "--" : codexPlusUsageFormatSpeed(snapshot.speed);
    const consumption = codexPlusUsageSelectedConsumption(snapshot);
    const usage = consumption.usage;
    const hitRate = codexPlusUsageFormatPercent(usage?.hitRate);
    const toolDetails = (snapshot.toolDetails || []).map((detail) => `${detail.label}:${detail.durationMs}`).join(",");
    return [
      speed,
      snapshot.averageSpeed,
      snapshot.turnMs,
      context.percent,
      context.window,
      snapshot.toolMs,
      toolDetails,
      usage?.input,
      usage?.output,
      usage?.cached,
      usage?.hitRate,
      usage?.source,
      hitRate,
      consumption.label,
      consumption.value,
      codexPlusUsageState.range,
      codexPlusUsageState.historyLoading,
      codexPlusUsageState.historyError,
      codexPlusUsageState.globalUsageLoading,
      codexPlusUsageState.globalUsageError,
      codexPlusUsageState.magpieUsageError,
      codexPlusUsageState.globalUsageSourceCoverage.magpie,
      codexPlusUsageState.globalUsageSourceCoverage.daily,
      codexPlusUsageState.historyFetchedAt,
      codexPlusUsageState.toolExpanded,
      codexPlusUsageState.tokenExpanded,
      snapshot.samples,
      snapshot.completed,
    ].join("|");
  }

  function codexPlusUsageRender(snapshot) {
    const node = codexPlusUsageState.node;
    if (!node?.isConnected) return;
    const parts = codexPlusUsageState.parts || codexPlusUsageBuild(node);
    const text = codexPlusUsageText();
    const speed = snapshot?.speed == null ? "--" : codexPlusUsageFormatSpeed(snapshot.speed);
    const consumption = codexPlusUsageSelectedConsumption(snapshot);
    const hitRate = codexPlusUsageFormatPercent(consumption.usage?.hitRate);
    const context = codexPlusUsageContextSnapshot(
      codexPlusUsageState.turns.get(codexPlusUsageState.threadId),
      codexPlusUsageState.liveContextByThread.get(codexPlusUsageState.threadId),
    );
    const fingerprint = codexPlusUsageRenderFingerprint(snapshot, context);
    if (fingerprint !== codexPlusUsageState.lastFingerprint) {
      codexPlusUsageState.lastFingerprint = fingerprint;
      parts.speed.value.textContent = text.speed(speed);
      parts.speed.hitRateValue.textContent = hitRate;
      const needleRatio = codexPlusUsageClamp((snapshot?.speed || 0) / codexPlusUsageSpeedPeak, 0, 1);
      parts.speed.needle.style.transform = `rotate(${-75 + needleRatio * 150}deg)`;
      node.dataset.state = snapshot?.completed ? "completed" : "running";
      node.setAttribute("aria-label", `${text.aria}：${text.speed(speed)}，${text.labels.hitRate} ${hitRate}`);
      codexPlusUsageUpdatePopover(snapshot);
    }
    if (!codexPlusUsageState.popover?.hidden) codexPlusUsagePositionPopover();
  }

  function codexPlusUsageEnabled() {
    return !codexPlusUsageState.disposed
      && codexPlusSettings().usageStatusLine === true;
  }

  function codexPlusUsageSyncPlacement() {
    // 宿主重注入会覆盖 sync 全局，这里补挂一次，保证开关仍然能通知到本脚本。
    codexPlusInstallUsageStatusLineSync();
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
    const node = codexPlusUsageEnsureNode(card, footerHost);
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
    return { card, threadId, changed, threadChanged };
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
    if (placement) {
      void codexPlusUsageRefreshLiveContext(placement.threadId, placement.threadChanged).then((updated) => {
        if (!updated || codexPlusUsageState.disposed || codexPlusUsageState.threadId !== placement.threadId) return;
        codexPlusUsageRender(codexPlusUsageTurnSnapshot(
          codexPlusUsageState.turns.get(placement.threadId),
          Date.now(),
        ));
      });
    }
    const liveUsageRange = !codexPlusUsageState.popover?.hidden;
    if (placement && liveUsageRange) void codexPlusUsageRefreshGlobalUsage();
    codexPlusUsageSchedule(liveUsageRange
      ? codexPlusUsageMagpieRefreshMs
      : turn && turn.completedAt == null && !document.hidden
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
      codexPlusUsageState.liveContextByThread.clear();
      codexPlusUsageState.liveContextFetchedAt.clear();
      codexPlusUsageState.liveContextPromises.clear();
      codexPlusUsageState.node = null;
      codexPlusUsageState.card = null;
      codexPlusUsageState.parts = null;
      codexPlusUsageState.popover = null;
      codexPlusUsageState.popoverParts = null;
      codexPlusUsageState.globalUsageLoading = false;
      codexPlusUsageState.globalUsageError = "";
      codexPlusUsageState.globalUsagePromise = null;
      codexPlusUsageState.globalUsageAggregate = null;
      codexPlusUsageState.globalUsageCoverage = { available: 0, total: 0 };
      codexPlusUsageState.globalUsageSourceCoverage = { magpie: 0, daily: 0 };
      codexPlusUsageState.magpieUsage = { fetchedAt: 0, snapshots: new Map(), sessions: new Map() };
      codexPlusUsageState.magpieUsageLastAttemptAt = 0;
      codexPlusUsageState.magpieUsagePromise = null;
      codexPlusUsageState.magpieUsageError = "";
      codexPlusUsageState.appServicesPromise = null;
      codexPlusUsageState.lastFingerprint = "";
      globalThis.__CODEX_PLUS_THROUGHPUT_STATUSLINE_SYNC__ = undefined;
      if (globalThis.__CODEX_PLUS_USAGE_STATUSLINE_SYNC__ === codexPlusUsageStatusLineSync) {
        globalThis.__CODEX_PLUS_USAGE_STATUSLINE_SYNC__ = codexPlusHostUsageSync;
      }
    },
  };
  globalThis.__CODEX_PLUS_THROUGHPUT_STATUSLINE_SYNC__ = () => codexPlusUsageSchedule(0);
  codexPlusRefreshUsageStatusLineSetting();

  window.codexPlus?.onCleanup?.(() => window.__codexPlusThroughputStatusLineRuntime?.dispose?.());
})();

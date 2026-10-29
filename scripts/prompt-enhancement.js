// ==UserScript==
// @name         增强提示词
// @namespace    prompt-enhancement
// @version      1.0.1
// @description  在发送前智能优化 Codex 输入框中的提示词
// @author:      Meowv
// ==/UserScript==

(() => {
  "use strict";
  const SYSTEM_PROMPT = `You are a prompt enhancement assistant. Improve the user prompt while preserving its intent and language.

TASK:
Rewrite the user input into a clearer, more specific prompt for the target AI assistant.

CRITICAL PRIORITY - LANGUAGE CONSISTENCY:
1. You MUST detect the language of the user input above and write the enhanced prompt in that same language.
2. If the user writes in Chinese, the enhanced prompt MUST be entirely in Chinese.
3. If the user writes in English, the enhanced prompt MUST be entirely in English.
4. If the user writes in any other language, the enhanced prompt MUST use that exact same language.
5. If the user mixes languages, keep a natural matching mix. Do not translate the user's intent into a single language.
6. These language rules are behavior instructions only; never include language analysis or language labels in the output.

ENHANCEMENT REQUIREMENTS:
1. Return only the enhanced prompt text; do not add explanations, prefaces, markdown fences, labels, or analysis.
2. Do not include language labels or meta notes such as "User input is in Chinese" or "Response must be in Chinese".
3. Preserve the user's original intent, topic, constraints, and target output type. Do not answer the request.
4. Always make a substantive enhancement when possible: clarify the task, scope, constraints, and expected output.
5. If the original prompt is already clear, lightly polish it instead of returning it unchanged.
6. Keep the enhanced prompt complete and concise. Do not end with an unfinished list, dangling conjunction, or trailing colon.
7. Do not add unrelated requirements, unsupported facts, or unnecessary sections.

EXAMPLES:

User input (Chinese): "请帮我解释这段代码的功能"
Enhanced prompt: "请解释这段代码的主要功能、执行流程和关键逻辑，并指出可能需要注意事项的边界情况。"

User input (English): "Please explain what this code does"
Enhanced prompt: "Explain what this code does, including its main purpose, key control flow, and any important edge cases."

User input (Mixed): "这段代码有 bug，can you help me fix it?"
Enhanced prompt: "请分析这段代码中的 bug，explain the root cause, and provide a minimal fix with necessary verification steps."

BAD OUTPUT EXAMPLE:

User input is in Chinese → Response must be in Chinese.
请解释这段代码的主要功能

GOOD OUTPUT EXAMPLE:

请解释这段代码的主要功能、执行流程和关键逻辑，并指出可能需要注意事项的边界情况。`;
  const NS = "__axPromptEnhancerV1",
    STORE = "ax.promptEnhancer.config.v1";
  const previous = window[NS];
  const drafts = previous?.drafts || new Map();
  previous?.destroy();
  let disposed = false,
    editor = null,
    shell = null,
    panel = null,
    job = null,
    timer = 0,
    version = 0;
  let composing = false,
    writing = false,
    pendingWrite = false,
    writeContext = null,
    testJob = null,
    generation = 0,
    noticeTimer = 0,
    activeLock = null;
  const bindings = [],
    paintWaits = new Map();
  const listen = (target, name, handler, options) => {
    target.addEventListener(name, handler, options);
    bindings.push(() => target.removeEventListener(name, handler, options));
  };
  const norm = (value) => String(value ?? "").replace(/\r\n?/g, "\n");
  const session = () => {
    const active = document.querySelector(
      '[data-app-action-sidebar-thread-active="true"][data-app-action-sidebar-thread-id], [aria-current="page"][data-app-action-sidebar-thread-id], [aria-selected="true"][data-app-action-sidebar-thread-id]',
    );
    return (
      (active?.getAttribute("data-app-action-sidebar-thread-id") || "") +
      "|" +
      location.pathname +
      location.search +
      location.hash
    );
  };
  const text = (node) =>
    norm(
      node?.tagName === "TEXTAREA"
        ? node.value
        : (node?.innerText ?? node?.textContent ?? ""),
    );
  const own = (node) => node?.nodeType === 1 && !!node.closest("[data-axpe]");
  const make = (tag, content, cls) => {
    const node = document.createElement(tag);
    if (content) node.textContent = content;
    if (cls) node.className = cls;
    return node;
  };
  const mark = (node) => {
    node.dataset.axpe = "";
    node.setAttribute("data-codex-plus-ext", "prompt-enhancer");
    return node;
  };
  const button = (label, action) => {
    const node = make("button", label);
    node.type = "button";
    node.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      action();
    });
    return node;
  };
  let config = {};
  try {
    config = normalizeConfig(JSON.parse(localStorage.getItem(STORE) || "{}"));
  } catch {
    /* 使用空配置 */
  }
  function normalizeConfig(value) {
    const input =
      value && typeof value === "object" && !Array.isArray(value) ? value : {};
    return {
      protocol: input.protocol === "anthropic" ? "anthropic" : "openai",
      baseUrl: typeof input.baseUrl === "string" ? input.baseUrl.trim() : "",
      apiKey: typeof input.apiKey === "string" ? input.apiKey.trim() : "",
      model: typeof input.model === "string" ? input.model.trim() : "",
    };
  }
  const configured = () => !!(config.baseUrl && config.apiKey && config.model);
  function endpoint(value, protocol) {
    let url;
    try {
      url = new URL(value.trim());
    } catch {
      throw new Error("请输入有效的 HTTPS API 地址");
    }
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    )
      throw new Error("API 地址须为 HTTPS，且不能包含凭据、查询参数或片段");
    let path = url.pathname.replace(/\/+$/, "");
    const suffix = protocol === "anthropic" ? "/messages" : "/chat/completions";
    if (!path.endsWith(suffix))
      path +=
        (/\/v\d+(?:beta\d*)?$/.test(path) ? "" : path ? "" : "/v1") + suffix;
    url.pathname = path;
    return url.href;
  }
  const OUTPUT_TOKENS = 4096;
  function validate(c) {
    if (!c || !["openai", "anthropic"].includes(c.protocol))
      throw new Error("请选择支持的 API 协议");
    if (
      typeof c.baseUrl !== "string" ||
      typeof c.apiKey !== "string" ||
      typeof c.model !== "string"
    )
      throw new Error("API 配置格式无效，请重新保存配置");
    endpoint(c.baseUrl, c.protocol);
    if (!c.apiKey.trim() || !c.model.trim())
      throw new Error("请填写 API Key 和模型名称");
    return c;
  }
  const abortError = () => new DOMException("已取消请求", "AbortError");
  function raceAbort(promise, signal) {
    if (signal.aborted) return Promise.reject(abortError());
    return new Promise((resolve, reject) => {
      const abort = () => reject(abortError());
      signal.addEventListener("abort", abort, { once: true });
      Promise.resolve(promise)
        .then(resolve, reject)
        .finally(() => signal.removeEventListener("abort", abort));
    });
  }
  function httpError(status) {
    const messages = {
      400: "请求参数不被支持，请检查协议、模型或输出上限",
      401: "API Key 无效",
      403: "API Key 无权限",
      404: "API 路径或模型不存在",
      429: "请求频率或额度受限",
    };
    return new Error(
      messages[status] ||
        (status
          ? `服务返回 HTTP ${status}`
          : "网络请求失败，请检查 API 地址和网络"),
    );
  }
  function decode(result) {
    if (!result || typeof result !== "object")
      throw new Error("请求通道返回了无效响应");
    const status = Number(result.http_status ?? result.status);
    if (
      !(status >= 200 && status < 300) ||
      result.ok === false ||
      result.responseType === "error"
    )
      throw httpError(status);
    if (result.body_json != null) return result.body_json;
    try {
      return JSON.parse(result.body_text ?? result.bodyJsonString ?? "");
    } catch {
      throw new Error("服务返回的内容不是有效 JSON");
    }
  }
  function electronRequest(payload, signal) {
    const bridge = window.electronBridge;
    if (typeof bridge?.sendMessageFromView !== "function")
      throw new Error("当前宿主没有可用的独立 API 请求通道");
    const requestId = `axpe-${Date.now()}-${++generation}-${Math.random().toString(36).slice(2)}`;
    return new Promise((resolve, reject) => {
      const cleanup = () => {
        window.removeEventListener("message", receive);
        signal.removeEventListener("abort", abort);
      };
      let done = false;
      const finish = (fn, value) => {
        if (done) return;
        done = true;
        cleanup();
        fn(value);
      };
      const abort = () => {
        try {
          Promise.resolve(
            bridge.sendMessageFromView({ type: "cancel-fetch", requestId }),
          ).catch(() => {});
        } catch {
          /* 宿主取消尽力执行 */
        }
        finish(reject, abortError());
      };
      const receive = (event) => {
        if (
          event.data?.type !== "fetch-response" ||
          event.data.requestId !== requestId
        )
          return;
        try {
          finish(resolve, decode(event.data));
        } catch (error) {
          finish(reject, error);
        }
      };
      window.addEventListener("message", receive);
      signal.addEventListener("abort", abort, { once: true });
      if (signal.aborted) {
        abort();
        return;
      }
      try {
        Promise.resolve(
          bridge.sendMessageFromView({ type: "fetch", requestId, ...payload }),
        ).catch(() => finish(reject, new Error("Electron 请求通道不可用")));
      } catch {
        finish(reject, new Error("Electron 请求通道不可用"));
      }
    });
  }
  const BRIDGE_PROBE_TIMEOUT = 3000;
  function bridgeFailureText(value, depth = 0) {
    if (depth > 4 || value == null) return "";
    if (typeof value === "string") {
      if (value.length < 4000 && /^\s*[{[]/.test(value)) {
        try {
          return bridgeFailureText(JSON.parse(value), depth + 1);
        } catch {
          /* 普通错误文本 */
        }
      }
      return value;
    }
    if (typeof value !== "object") return "";
    return [value.message, value.error, value.code]
      .map((part) => bridgeFailureText(part, depth + 1))
      .join(" ");
  }
  const unsupportedRoute = (value) =>
    /unknown bridge path|未开放.*路由|未知.*bridge/i.test(
      bridgeFailureText(value),
    );
  async function checkBridge(bridge, signal) {
    if (signal.aborted) throw abortError();
    const probe = new AbortController();
    const abort = () => probe.abort();
    signal.addEventListener("abort", abort, { once: true });
    const timer = setTimeout(abort, BRIDGE_PROBE_TIMEOUT);
    try {
      // 只检查本地桥接连通性；不携带模型地址、密钥或用户提示词。
      const result = await raceAbort(
        Promise.resolve().then(() => {
          if (probe.signal.aborted) throw abortError();
          return bridge.call(window, "/user-scripts/list", {});
        }),
        probe.signal,
      );
      if (signal.aborted) throw abortError();
      const healthy =
        result &&
        typeof result === "object" &&
        !Array.isArray(result) &&
        (result.status === "ok" ||
          (!result.status && Array.isArray(result.scripts))) &&
        !result.error;
      return healthy ? "ready" : "invalid";
    } catch (error) {
      if (signal.aborted) throw abortError();
      return probe.signal.aborted ? "timeout" : "failed";
    } finally {
      clearTimeout(timer);
      signal.removeEventListener("abort", abort);
    }
  }
  async function transport(payload, signal) {
    if (signal.aborted) throw abortError();
    const bridge = window.__codexSessionDeleteBridge;
    if (typeof bridge === "function") {
      const health = await checkBridge(bridge, signal);
      if (signal.aborted) throw abortError();
      if (health === "ready") {
        let result,
          unsupported = false;
        try {
          result = await raceAbort(
            Promise.resolve().then(() => {
              if (signal.aborted) throw abortError();
              return bridge.call(window, "/llm-proxy", {
                ...payload,
                timeout_ms: 60000,
              });
            }),
            signal,
          );
        } catch (error) {
          if (signal.aborted) throw abortError();
          unsupported = unsupportedRoute(error);
          if (!unsupported)
            throw new Error(
              "LLM Bridge 请求失败，未自动重发；请检查宿主连接及网络",
            );
        }
        if (signal.aborted) throw abortError();
        if (!unsupported) {
          if (result?.status === "ok") return decode(result);
          if (!result || typeof result !== "object")
            throw new Error("LLM Bridge 返回了无效响应，未重复发送请求");
          if (Number(result.http_status) > 0)
            throw httpError(Number(result.http_status));
          unsupported = unsupportedRoute(result);
          if (!unsupported)
            throw new Error(
              "LLM Bridge 请求失败，未自动重发；请检查 API 地址及宿主连接",
            );
        }
      } else {
        const reason =
          health === "timeout"
            ? "Codex++ Bridge 检查超时（3 秒）"
            : "Codex++ Bridge 检查未通过";
        if (typeof window.electronBridge?.sendMessageFromView !== "function") {
          throw new Error(
            reason + "，尚未发送模型请求；当前没有可用的 Electron 通道",
          );
        }
      }
    }
    return electronRequest(payload, signal);
  }
  function cleanOutput(value, input = "") {
    if (typeof value !== "string" || !value.trim())
      throw new Error("模型返回为空或格式无效");
    let output = norm(value).trim();
    const lines = output.split("\n");
    // 仅移除可确认的纯文本外层包装，不破坏多段代码块或语言代码围栏。
    if (
      /^```(?:text|markdown)?\s*$/i.test(lines[0]) &&
      /^```\s*$/.test(lines.at(-1)) &&
      lines.filter((line) => /^\s*```/.test(line)).length === 2 &&
      !input.trimStart().startsWith("```")
    ) {
      output = lines.slice(1, -1).join("\n").trim();
    }
    output = output
      .replace(
        /^(?:优化后(?:的)?提示词|增强后(?:的)?提示词|Enhanced prompt)\s*[:：]\s*/i,
        "",
      )
      .trim();
    if (!output) throw new Error("模型返回为空或格式无效");
    if (
      /^<(think|analysis)\b/i.test(output) &&
      !/<(think|analysis)\b/i.test(input)
    )
      throw new Error("模型返回了分析内容，请更换模型或重试");
    return output;
  }
  function responseText(data, anthropic) {
    if (!data || typeof data !== "object" || Array.isArray(data))
      throw new Error("模型响应结构无效");
    const choice = Array.isArray(data.choices) ? data.choices[0] : null;
    const reason = anthropic ? data.stop_reason : choice?.finish_reason;
    if (["max_tokens", "length"].includes(reason))
      throw new Error("结果被输出上限截断，请缩短输入后重试");
    if (
      ["refusal", "content_filter"].includes(reason) ||
      choice?.message?.refusal
    )
      throw new Error("模型拒绝了本次请求，请检查输入或更换模型");
    if (
      ["tool_calls", "function_call", "tool_use", "pause_turn"].includes(reason)
    )
      throw new Error("模型未返回最终提示词，请更换模型或重试");
    const content = anthropic ? data.content : choice?.message?.content;
    if (!anthropic && typeof content === "string") return content;
    if (!Array.isArray(content)) throw new Error("模型响应中的文本结构无效");
    return content
      .filter(
        (part) => part && part.type === "text" && typeof part.text === "string",
      )
      .map((part) => part.text)
      .join("\n");
  }
  async function request(c, input, signal, testing = false) {
    validate(c);
    const anthropic = c.protocol === "anthropic";
    const system = testing ? "Return only OK." : SYSTEM_PROMPT;
    const body = {
      model: c.model,
      messages: [{ role: "user", content: input }],
    };
    if (anthropic) {
      body.system = system;
      body.max_tokens = OUTPUT_TOKENS;
    } else {
      body.messages.unshift({ role: "system", content: system });
    }
    const headers = { "Content-Type": "application/json" };
    if (anthropic) {
      headers["x-api-key"] = c.apiKey;
      headers["anthropic-version"] = "2023-06-01";
    } else headers.Authorization = `Bearer ${c.apiKey}`;
    const data = await transport(
      {
        url: endpoint(c.baseUrl, c.protocol),
        method: "POST",
        headers,
        body: JSON.stringify(body),
      },
      signal,
    );
    return cleanOutput(responseText(data, anthropic), testing ? "" : input);
  }
  function startJob() {
    const controller = new AbortController();
    const current = {
      controller,
      timeout: false,
      cancel: () => controller.abort(),
    };
    current.timer = setTimeout(() => {
      current.timeout = true;
      controller.abort();
    }, 60000);
    return current;
  }
  function errorText(error, current) {
    if (current?.timeout)
      return "请求超时（60 秒），请检查网络及 API 配置；未自动重发";
    return error?.name === "AbortError"
      ? "已取消请求"
      : error?.message || "请求失败";
  }
  let discoveryNeeded = true,
    discoverySession = "";
  const EDITORS =
    '[data-axpe-locked], textarea, .ProseMirror[contenteditable="true"], [contenteditable="true"], [contenteditable=""], [contenteditable="plaintext-only"]';
  const COMPOSERS =
    '[data-testid*="composer"], [data-composer], .composer-surface-chrome';
  const COMPOSER_CONTROLS =
    'button[aria-label*="Send"], button[aria-label*="发送"], button[data-testid*="send"], button[aria-label*="Stop"], button[aria-label*="停止"], button[data-testid*="stop"]';
  function writable(node) {
    return !!(
      node &&
      !node.disabled &&
      (!node.readOnly || activeLock?.owns(node)) &&
      node.matches(EDITORS)
    );
  }
  function candidate(node) {
    // 已确认的绑定不依赖会随输入变化的提示属性、控件或容器高度。
    const retained =
      node === editor &&
      node.isConnected &&
      shell?.isConnected &&
      shell.contains(node) &&
      discoverySession === session();
    if (
      own(node) ||
      (!retained &&
        (node.disabled || (node.readOnly && !activeLock?.owns(node)))) ||
      node.closest(
        'aside, nav, [role="dialog"], [role="search"], [data-sidebar], [inert]',
      )
    )
      return null;
    const rect = node.getBoundingClientRect();
    if (
      !rect.width ||
      !rect.height ||
      getComputedStyle(node).visibility === "hidden"
    )
      return null;
    const hint = [
      "placeholder",
      "aria-label",
      "data-placeholder",
      "data-testid",
    ]
      .map((name) => node.getAttribute(name) || "")
      .join(" ");
    const semantic =
      node.classList.contains("ProseMirror") ||
      /prompt|message|消息|询问|ask|follow.up/i.test(hint);
    // 输入后宿主可能移除占位提示，先通过稳定的输入区结构确认归属。
    let container =
      (retained ? shell : null) ||
      node.parentElement?.closest(".composer-surface-chrome") ||
      node.parentElement?.closest(COMPOSERS);
    if (
      !semantic &&
      !container &&
      !activeLock?.owns(node) &&
      !node.matches('[data-message-input], [data-testid*="composer"]')
    )
      return null;
    if (!container && semantic) {
      for (
        let p = node.parentElement, depth = 0;
        p && p !== document.body && depth < 5;
        p = p.parentElement, depth++
      ) {
        if (p.querySelector(COMPOSER_CONTROLS)) {
          container = p;
          break;
        }
      }
    }
    if (
      !container ||
      container === document.body ||
      (!retained && container.getBoundingClientRect().height > innerHeight * 0.75)
    )
      return null;
    // 已明确识别的 Composer 不依赖发送按钮；运行期间可能只有停止或排队控件。
    return {
      node,
      container,
      score:
        (node === document.activeElement ? 200 : 0) +
        (node.classList.contains("ProseMirror") ? 80 : 0) +
        (rect.bottom / innerHeight) * 20,
    };
  }
  function locate() {
    // 当前 Composer 有效时只检查其局部；失效或存在外部编辑器焦点时才全局发现。
    const focused = document.activeElement;
    const key = session();
    // 输入后的延迟检查先复用仍有效的节点，避免重新筛选导致按钮一闪即消失。
    if (
      discoverySession === key &&
      editor?.isConnected &&
      (own(focused) ||
        !focused?.matches?.(EDITORS) ||
        focused === editor ||
        editor.contains(focused))
    ) {
      const retained = candidate(editor);
      if (retained) return retained;
    }
    const local =
      !discoveryNeeded &&
      discoverySession === key &&
      shell?.isConnected &&
      (!focused?.matches?.(EDITORS) || shell.contains(focused));
    let candidates = [...(local ? shell : document).querySelectorAll(EDITORS)]
      .map(candidate)
      .filter(Boolean);
    if (!local) {
      discoveryNeeded = false;
      discoverySession = key;
    }
    if (!candidates.length && local)
      candidates = [...document.querySelectorAll(EDITORS)]
        .map(candidate)
        .filter(Boolean);
    candidates.sort((a, b) => b.score - a.score);
    if (
      !candidates.length ||
      (candidates.length > 1 &&
        Math.abs(candidates[0].score - candidates[1].score) < 1)
    )
      return null;
    return candidates[0];
  }
  function unsafe(node) {
    if (node.tagName === "TEXTAREA") return false;
    // 只允许明确的纯文本结构。引用、附件、代码块、未知节点均保守降级。
    return [...node.querySelectorAll("*")].some(
      (n) =>
        ![
          "P",
          "BR",
          "DIV",
          "SPAN",
          "STRONG",
          "EM",
          "B",
          "I",
          "U",
          "S",
        ].includes(n.tagName) ||
        n.getAttribute("contenteditable") === "false" ||
        [...n.attributes].some(
          (a) =>
            /mention|attachment|node|file|token/i.test(a.name) ||
            (/^(data-type|data-kind)$/.test(a.name) &&
              /mention|attachment|file|image|token/i.test(a.value)),
        ),
    );
  }
  function attachmentState(container) {
    return [
      ...container.querySelectorAll(
        'img, [data-attachment-id], [data-file-id], [data-mention], [contenteditable="false"]',
      ),
    ]
      .filter((n) => !own(n) && n !== activeLock?.node)
      .map((n) => n.outerHTML)
      .join("\n");
  }
  function protectedTokens(input) {
    // 完整提取并保留重复次数；代码块/行内代码不再拆成重叠 token。
    const matches =
      input.match(
        /```[^\n]*\n[\s\S]*?```|`[^`\n]+`|https?:\/\/[^\s<>"，。；！？）]+|@[\w./\\-]+|(?:[A-Za-z]:\\|~?\/|(?:[\w.@-]+\/)+)[\w.@/\\-]+|\b[\w@.-]+\.(?:js|ts|tsx|jsx|py|cs|vue|json|md|sh|txt)\b|\b[A-Za-z]+(?:[A-Z][a-z0-9]+){1,}\b|\b[a-zA-Z]+_[a-zA-Z_0-9]+\b/g,
      ) || [];
    return matches.map((token) =>
      token.startsWith("`")
        ? token
        : token.replace(/[.,;:!?，。；：！？）)\]}]+$/, ""),
    );
  }
  function preservesTokens(input, output) {
    const counts = (value) => {
      const result = new Map();
      for (const token of protectedTokens(value))
        result.set(token, (result.get(token) || 0) + 1);
      return result;
    };
    const before = counts(input),
      after = counts(output);
    return [...before].every(([token, count]) => after.get(token) === count);
  }
  function outputIssue(input, output) {
    const prose = (value) =>
      value.replace(/```[\s\S]*?```|`[^`]*`|https?:\/\/\S+/g, "");
    const answer = prose(output);
    if (
      /^(?:User input is in|Response must be in|Language(?: analysis)?\s*[:：]|用户输入(?:的语言)?(?:是|为)|语言分析\s*[:：]|Here is (?:the|your) (?:enhanced|optimized) prompt)/i.test(
        answer.trimStart(),
      )
    )
      return "模型返回了语言分析或解释性前缀，请检查结果";
    const source = prose(input);
    const han = (value) => (value.match(/[\u3400-\u9fff]/g) || []).length;
    const latin = (value) => (value.match(/[a-z]/gi) || []).length;
    // 仅拦截明显的单语言冲突，不把混合语言、代码或专有名词强制翻译。
    if (
      (han(source) >= 4 &&
        latin(source) === 0 &&
        han(answer) === 0 &&
        latin(answer) >= 12) ||
      (han(source) === 0 &&
        latin(source) >= 12 &&
        han(answer) >= 6 &&
        latin(answer) === 0)
    )
      return "增强结果与原稿语言明显不一致，请检查结果";
    return "";
  }
  function afterPaint() {
    return new Promise((resolve) => {
      let frame;
      const finish = () => {
        clearTimeout(timer);
        cancelAnimationFrame(frame);
        paintWaits.delete(timer);
        resolve();
      };
      const timer = setTimeout(finish, 100);
      paintWaits.set(timer, finish);
      frame = requestAnimationFrame(() => {
        frame = requestAnimationFrame(finish);
      });
    });
  }
  const sameText = (left, right) =>
    norm(left).trimEnd() === norm(right).trimEnd();
  function notifyEditor(node, value) {
    node.dispatchEvent(
      new InputEvent("input", {
        bubbles: true,
        inputType: "insertReplacementText",
        data: value,
      }),
    );
    node.dispatchEvent(new Event("change", { bubbles: true }));
  }
  async function write(node, value) {
    if (unsafe(node) || !node.isConnected || composing || pendingWrite)
      return { status: "blocked" };
    const original = text(node),
      key = session(),
      container = shell,
      rev = version;
    const attachments = attachmentState(container);
    const context = { key, container, expected: value };
    writing = true;
    pendingWrite = true;
    writeContext = context;
    update();
    let attempted = false;
    try {
      node.focus({ preventScroll: true });
      if (node.tagName === "TEXTAREA") {
        node.select();
        attempted = true;
        if (!document.execCommand("insertText", false, value)) {
          Object.getOwnPropertyDescriptor(
            HTMLTextAreaElement.prototype,
            "value",
          ).set.call(node, value);
        }
      } else {
        const range = document.createRange();
        range.selectNodeContents(node);
        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
        // 保持选区限定在当前编辑器；命令返回值不能代替实际内容校验。
        attempted = true;
        const accepted = document.execCommand("insertText", false, value);
        if (accepted === false && text(node) === original)
          return { status: "unchanged" };
      }
      notifyEditor(node, value);
      writing = false;
      // 宿主可能异步通知、归一化换行或重建节点，等待短时稳定后再判定。
      const started = performance.now();
      let stable = 0;
      while (performance.now() - started < 700) {
        await afterPaint();
        if (disposed || key !== session() || job?.controller.signal.aborted)
          return { status: "cancelled" };
        if (version !== rev) return { status: "unverified" };
        const current = locate();
        if (current?.container !== container) {
          stable = 0;
          continue;
        }
        if (attachmentState(container) !== attachments || unsafe(current.node))
          return { status: "unverified" };
        const actual = text(current.node);
        if (sameText(actual, value)) {
          stable++;
          if (stable >= 2 && performance.now() - started >= 80) {
            activeLock?.targets.add(current.node);
            editor = current.node;
            lastText = actual;
            lastStructure = editor.innerHTML;
            return { status: "applied", actual };
          }
        } else stable = 0;
      }
      const current = locate();
      return {
        status:
          current?.container === container && text(current.node) === original
            ? "unchanged"
            : "unverified",
      };
    } catch {
      return { status: attempted ? "unverified" : "blocked" };
    } finally {
      writing = false;
      pendingWrite = false;
      writeContext = null;
      schedule();
    }
  }
  function writeFallback(output, result, original) {
    if (result.status === "cancelled" || disposed) return;
    const message =
      result.status === "unchanged" || result.status === "blocked"
        ? "未能完成自动回填，请检查当前草稿后复制结果。"
        : "已尝试回填，但未能确认编辑器的最终状态。内容可能已替换，请先检查当前草稿，无需重复粘贴。";
    fallback(
      output,
      message + "\n原稿：\n" + original,
      result.status === "unverified"
        ? "请检查当前草稿，避免重复粘贴"
        : "请检查增强结果",
    );
  }
  const host = mark(make("div", "", "axpe-bar"));
  host.hidden = true;
  const main = button("", () => {
    if (job) job.cancel();
    else enhance();
  });
  const TOOLTIP = "点击增强（右键打开配置）";
  main.setAttribute("aria-describedby", "axpe-tooltip-v1");
  main.setAttribute("aria-label", "增强提示词");
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "1.6");
  svg.setAttribute("aria-hidden", "true");
  const path = document.createElementNS(svg.namespaceURI, "path");
  path.setAttribute(
    "d",
    "m4 20 12-12 4 4L8 24M14 3v4M12 5h4M5 4v6M2 7h6M20 1v4M18 3h4",
  );
  svg.append(path);
  main.append(svg);
  const caption = make("span", "增强提示词", "axpe-caption");
  main.append(caption);
  const restore = button("还原", () => undo());
  host.append(main, restore);
  main.addEventListener("contextmenu", (event) => {
    event.preventDefault();
    event.stopPropagation();
    hideTooltip();
    openSettings();
  });
  const tooltip = mark(make("div", TOOLTIP, "axpe-tooltip"));
  tooltip.id = "axpe-tooltip-v1";
  tooltip.setAttribute("role", "tooltip");
  tooltip.hidden = true;
  function hideTooltip() {
    if (!tooltip.hidden) tooltip.hidden = true;
  }
  function triggerVisible() {
    if (
      disposed ||
      !main.isConnected ||
      !editor?.isConnected ||
      main.closest("[hidden], [inert]")
    )
      return false;
    const rect = main.getBoundingClientRect(),
      style = getComputedStyle(main);
    return (
      rect.width > 0 &&
      rect.height > 0 &&
      style.visibility !== "hidden" &&
      style.display !== "none" &&
      style.opacity !== "0"
    );
  }
  function showTooltip() {
    if (!panel && triggerVisible()) {
      tooltip.hidden = false;
      positionTooltip();
    }
  }
  function positionTooltip() {
    if (tooltip.hidden) return;
    if (!triggerVisible()) {
      hideTooltip();
      return;
    }
    const rect = main.getBoundingClientRect(),
      box = tooltip.getBoundingClientRect();
    // 优先向下；下方不足时向上，并在窗口内限位。
    const preferred =
      rect.bottom + 8 + box.height <= innerHeight - 8
        ? rect.bottom + 8
        : rect.top - box.height - 8;
    const top = Math.max(8, Math.min(preferred, innerHeight - box.height - 8));
    tooltip.style.left = `${Math.max(8, Math.min(rect.left + (rect.width - box.width) / 2, innerWidth - box.width - 8))}px`;
    tooltip.style.top = `${top}px`;
  }
  main.addEventListener("pointerenter", showTooltip);
  main.addEventListener("pointerleave", hideTooltip);
  main.addEventListener("focus", showTooltip);
  main.addEventListener("blur", hideTooltip);
  main.addEventListener("click", hideTooltip);
  host.addEventListener("mousedown", (event) => {
    if (event.target.closest("button")) event.preventDefault();
  });
  const notice = mark(make("div", "", "axpe-notice"));
  notice.setAttribute("role", "status");
  notice.hidden = true;
  function say(message, duration = 1500) {
    clearTimeout(noticeTimer);
    noticeTimer = 0;
    if (disposed) return;
    notice.textContent = message;
    notice.hidden = !message;
    if (message && duration > 0)
      noticeTimer = setTimeout(() => {
        notice.hidden = true;
        noticeTimer = 0;
      }, duration);
  }
  function fallback(output, reason, noticeText = "已保留草稿，请检查增强结果") {
    if (disposed) return;
    say(noticeText);
    openPanel("增强结果");
    panel.append(make("p", reason));
    const result = make("textarea");
    result.value = output;
    result.readOnly = true;
    result.rows = 8;
    result.setAttribute("aria-label", "增强结果");
    const copy = button("复制增强结果", async () => {
      try {
        await navigator.clipboard.writeText(output);
        say("已复制增强结果");
      } catch {
        result.focus();
        result.select();
        say("请按系统复制快捷键复制");
      }
    });
    panel.append(result, copy);
    position();
  }
  function update() {
    // 显隐只取决于草稿内容；增强请求期间保留取消入口。
    host.hidden = !job && !text(editor).trim();
    const record = drafts.get(session());
    const canRestore = !!(
      record &&
      editor &&
      record.result === text(editor) &&
      record.revision === version
    );
    restore.hidden = !canRestore;
    restore.disabled = !!job || pendingWrite;
    caption.textContent = job ? "取消增强" : "增强提示词";
    main.classList.toggle("axpe-loading", !!job);
    main.setAttribute("aria-busy", String(!!job));
    const disabled = String(
      !job &&
        (!writable(editor) || pendingWrite ||
          (configured() && (!editor || !text(editor).trim() || composing))),
    );
    if (
      main.getAttribute("aria-disabled") !== disabled ||
      main.getAttribute("aria-busy") === "true" ||
      !triggerVisible()
    )
      hideTooltip();
    main.setAttribute("aria-disabled", disabled);
    position();
  }
  function lockEditor(node, container) {
    const editable = node.getAttribute("contenteditable"),
      readOnly = node.readOnly;
    const aria = node.getAttribute("aria-readonly");
    let nativeLocked = true,
      released = false;
    const token = `axpe-${Date.now()}-${++generation}`;
    const targets = new Set([node]);
    const owns = (target) => target.getAttribute("data-axpe-locked") === token;
    const lock = { node, container, targets, owns, prepareWrite, release };
    activeLock = lock;
    node.setAttribute("data-axpe-locked", token);
    node.setAttribute("aria-readonly", "true");
    if (node.tagName === "TEXTAREA") node.readOnly = true;
    else node.setAttribute("contenteditable", "false");
    function prepareWrite() {
      if (!nativeLocked) return;
      nativeLocked = false;
      node.removeAttribute("data-axpe-locked");
      if (node.tagName === "TEXTAREA") node.readOnly = readOnly;
      else if (editable === null) node.removeAttribute("contenteditable");
      else node.setAttribute("contenteditable", editable);
    }
    function release() {
      if (released) return;
      released = true;
      for (const candidate of document.querySelectorAll("[data-axpe-locked]")) {
        if (!owns(candidate)) continue;
        targets.add(candidate);
        candidate.removeAttribute("data-axpe-locked");
        if (candidate.tagName === "TEXTAREA") candidate.readOnly = readOnly;
        else if (editable === null)
          candidate.removeAttribute("contenteditable");
        else candidate.setAttribute("contenteditable", editable);
      }
      prepareWrite();
      for (const target of targets) {
        if (aria === null) target.removeAttribute("aria-readonly");
        else target.setAttribute("aria-readonly", aria);
      }
      if (activeLock === lock) activeLock = null;
    }
    return lock;
  }
  function blockLockedInput(event) {
    const lock = activeLock;
    if (!lock || writing) return;
    const target = event.target;
    const belongs =
      target === lock.node ||
      lock.node.contains(target) ||
      (pendingWrite &&
        lock.container.contains(target) &&
        target.closest?.("textarea, [contenteditable]"));
    if (!belongs) return;
    if (
      event.type === "keydown" &&
      !(
        event.key === "Enter" ||
        event.key === "Backspace" ||
        event.key === "Delete" ||
        (event.key.length === 1 &&
          ((!event.ctrlKey && !event.metaKey) || /[vxzy]/i.test(event.key)))
      )
    )
      return;
    event.preventDefault();
    event.stopImmediatePropagation();
  }
  for (const name of ["beforeinput", "paste", "cut", "drop", "keydown"])
    listen(document, name, blockLockedInput, true);
  function rememberDraft(key, record) {
    drafts.delete(key);
    drafts.set(key, record);
    if (drafts.size > 30) drafts.delete(drafts.keys().next().value);
  }
  function beginDraft(current, snapshot, expected) {
    current.snapshot = snapshot;
    current.previousDraft = drafts.get(snapshot.key);
    current.draftRecord = {
      original: snapshot.original,
      result: expected,
      revision: snapshot.rev,
      pending: true,
    };
    rememberDraft(snapshot.key, current.draftRecord);
  }
  function reconcileDraft(current) {
    const record = current?.draftRecord,
      snapshot = current?.snapshot;
    if (!record?.pending || drafts.get(snapshot.key) !== record) return;
    record.pending = false;
    if (session() !== snapshot.key) return;
    const found = locate();
    if (!found || found.container !== snapshot.container) return;
    const actual = text(found.node);
    if (sameText(actual, record.result) && version === snapshot.rev) {
      record.result = actual;
      record.revision = version;
      editor = found.node;
      lastText = actual;
      lastStructure = editor.innerHTML;
    } else if (actual === snapshot.original) {
      if (current.previousDraft)
        rememberDraft(snapshot.key, current.previousDraft);
      else drafts.delete(snapshot.key);
    }
  }
  async function enhance() {
    if (!writable(editor)) return;
    if (!configured()) {
      openSettings();
      return;
    }
    if (!editor || !text(editor).trim() || composing || job || pendingWrite)
      return;
    const node = editor,
      container = shell,
      original = text(node),
      key = session(),
      rev = version;
    const special = unsafe(node),
      structure = node.innerHTML,
      attachmentSnapshot = attachmentState(container);
    const current = startJob();
    job = current;
    const lock = lockEditor(node, container);
    current.controller.signal.addEventListener("abort", lock.release, {
      once: true,
    });
    update();
    say("正在增强，当前输入框暂时只读，可点击取消", 0);
    try {
      const output = await request(config, original, current.controller.signal);
      clearTimeout(current.timer);
      if (disposed || current.controller.signal.aborted || job !== current)
        return;
      const located = locate();
      if (
        key !== session() ||
        node !== located?.node ||
        container !== located?.container ||
        !node.isConnected ||
        version !== rev ||
        text(node) !== original ||
        (node.tagName !== "TEXTAREA" && node.innerHTML !== structure) ||
        attachmentState(container) !== attachmentSnapshot
      ) {
        fallback(
          output,
          "草稿、会话或编辑器已变化，未自动覆盖。请检查后复制。",
        );
        return;
      }
      const issue = outputIssue(original, output);
      if (issue) {
        fallback(output, issue + "，原稿未替换。");
        return;
      }
      if (special || unsafe(node) || !preservesTokens(original, output)) {
        fallback(
          output,
          "包含特殊节点，或模型改变了代码、路径、URL、关键标识符。已保留原稿，请检查后复制。",
        );
        return;
      }
      beginDraft(current, { key, original, rev, container }, output);
      lock.prepareWrite();
      const result = await write(node, output);
      if (result.status !== "applied") {
        if (disposed) return;
        if (current.controller.signal.aborted) {
          if (key === session()) say("增强已取消，请检查当前草稿");
          return;
        }
        writeFallback(output, result, original);
        return;
      }
      version++;
      rememberDraft(key, { original, result: text(editor), revision: version });
      say("增强成功，尚未发送；可还原原文");
    } catch (error) {
      if (!disposed && job === current) say(errorText(error, current));
    } finally {
      reconcileDraft(current);
      current.controller.signal.removeEventListener("abort", lock.release);
      lock.release();
      clearTimeout(current.timer);
      if (job === current) job = null;
      if (!disposed) update();
    }
  }
  async function undo() {
    const key = session(),
      record = drafts.get(key),
      node = editor;
    if (pendingWrite) return;
    if (
      !record ||
      !node ||
      text(node) !== record.result ||
      version !== record.revision ||
      composing
    ) {
      drafts.delete(key);
      update();
      return;
    }
    const result = await write(node, record.original);
    if (result.status === "applied") {
      version++;
      drafts.delete(key);
      say("已还原原文");
    } else writeFallback(record.original, result, record.result);
    update();
  }
  function closePanel() {
    testJob?.cancel();
    panel?.remove();
    panel = null;
    if (editor?.isConnected) editor.focus({ preventScroll: true });
  }
  function openPanel(title) {
    hideTooltip();
    closePanel();
    panel = mark(make("section", "", "axpe-panel"));
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-label", title);
    const heading = make("header");
    heading.append(make("strong", title), button("关闭", closePanel));
    panel.append(heading);
    document.body.append(panel);
    position();
  }
  function position() {
    positionTooltip();
    if (!panel) return;
    const rect = host.getBoundingClientRect(),
      gap = 10;
    const width = Math.max(0, Math.min(410, innerWidth - gap * 2));
    panel.style.width = `${width}px`;
    panel.style.maxHeight = `${Math.max(80, innerHeight - gap * 2)}px`;
    const height = panel.getBoundingClientRect().height;
    panel.style.left = `${Math.max(gap, Math.min(rect.left, innerWidth - width - gap))}px`;
    panel.style.top = `${Math.max(gap, Math.min(rect.top - height - gap, innerHeight - height - gap))}px`;
  }
  function openSettings() {
    openPanel("增强提示词");
    const intro = make(
      "p",
      "配置独立模型服务，在发送前智能优化 Codex 输入框中的提示词。",
    );
    panel.append(intro);
    const fields = {};
    function field(key, label, type, value) {
      const wrapper = make("label", label);
      const input = make(type === "select" ? "select" : "input");
      if (type !== "select") input.type = type;
      if (type === "select") {
        for (const [id, label] of [
          ["openai", "OpenAI 兼容"],
          ["anthropic", "Anthropic"],
        ]) {
          const option = make("option", label);
          option.value = id;
          input.append(option);
        }
      }
      input.value = value;
      input.autocomplete = "off";
      input.spellcheck = false;
      fields[key] = input;
      wrapper.append(input);
      panel.append(wrapper);
      return input;
    }
    const protocol = field(
      "protocol",
      "API 协议",
      "select",
      config.protocol || "openai",
    );
    const address = field(
      "baseUrl",
      "API 地址（HTTPS）",
      "url",
      config.baseUrl || "",
    );
    const updatePlaceholder = () => {
      address.placeholder =
        protocol.value === "anthropic"
          ? "https://api.anthropic.com"
          : "https://api.openai.com/v1";
    };
    protocol.addEventListener("change", updatePlaceholder);
    updatePlaceholder();
    const key = field("apiKey", "API Key", "password", config.apiKey || "");
    const secret = make("div", "", "axpe-secret");
    key.replaceWith(secret);
    secret.append(key);
    const show = button("", () => {
      const visible = key.type === "password";
      key.type = visible ? "text" : "password";
      const label = visible ? "隐藏密钥" : "显示密钥";
      show.setAttribute("aria-label", label);
      show.title = label;
      show.setAttribute("aria-pressed", String(visible));
      slash.toggleAttribute("hidden", !visible);
    });
    show.className = "axpe-eye";
    show.setAttribute("aria-label", "显示密钥");
    show.setAttribute("aria-pressed", "false");
    show.title = "显示密钥";
    const eye = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    eye.setAttribute("viewBox", "0 0 24 24");
    eye.setAttribute("fill", "none");
    eye.setAttribute("stroke", "currentColor");
    eye.setAttribute("stroke-width", "1.6");
    eye.setAttribute("aria-hidden", "true");
    const outline = document.createElementNS(eye.namespaceURI, "path");
    outline.setAttribute(
      "d",
      "M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0",
    );
    const slash = document.createElementNS(eye.namespaceURI, "path");
    slash.setAttribute("d", "M4 4l16 16");
    slash.setAttribute("hidden", "");
    eye.append(outline, slash);
    show.append(eye);
    secret.append(show);
    field("model", "模型名称", "text", config.model || "").placeholder =
      "服务商支持的模型 ID";
    const status = make("p");
    status.setAttribute("role", "status");
    panel.append(status);
    const currentPanel = panel;
    const values = () =>
      validate({
        protocol: fields.protocol.value,
        baseUrl: fields.baseUrl.value.trim(),
        apiKey: key.value.trim(),
        model: fields.model.value.trim(),
      });
    const footer = make("footer");
    const test = button("测试连接", async () => {
      if (testJob) {
        testJob.cancel();
        return;
      }
      let c;
      try {
        c = values();
      } catch (error) {
        status.textContent = error.message;
        return;
      }
      const current = startJob();
      testJob = current;
      test.textContent = "取消测试";
      status.textContent = "正在测试…";
      try {
        await request(c, "OK", current.controller.signal, true);
        if (panel === currentPanel && !current.controller.signal.aborted)
          status.textContent = "连接成功，模型返回正常";
      } catch (error) {
        if (panel === currentPanel)
          status.textContent = errorText(error, current);
      } finally {
        clearTimeout(current.timer);
        if (testJob === current) testJob = null;
        test.textContent = "测试连接";
      }
    });
    const save = button("保存配置", () => {
      try {
        const next = values();
        localStorage.setItem(STORE, JSON.stringify(next));
        config = next;
        closePanel();
        say("配置已保存");
        update();
      } catch (error) {
        status.textContent =
          error.name === "QuotaExceededError" || error.name === "SecurityError"
            ? "本地存储不可用，配置未保存"
            : error.message;
      }
    });
    footer.append(test, save);
    panel.append(footer);
    position();
    fields.baseUrl.focus();
  }
  const style = mark(make("style"));
  style.id = "axpe-style-v1";
  style.textContent = `
.axpe-bar,.axpe-panel,.axpe-notice,.axpe-tooltip{--axpe-bg:var(--codex-plus-bg-elevated,#fff);--axpe-fg:var(--codex-plus-text,#242424);--axpe-line:var(--codex-plus-border,#ddd);color:var(--axpe-fg);font:12px/1.5 system-ui,sans-serif;box-sizing:border-box}
@media(prefers-color-scheme:dark){.axpe-bar,.axpe-panel,.axpe-notice,.axpe-tooltip{--axpe-bg:var(--codex-plus-bg-elevated,#242424);--axpe-fg:var(--codex-plus-text,#eee);--axpe-line:var(--codex-plus-border,#444)}}
.dark .axpe-bar,.dark .axpe-panel,.dark .axpe-notice,.dark .axpe-tooltip{--axpe-bg:var(--codex-plus-bg-elevated,#242424);--axpe-fg:var(--codex-plus-text,#eee);--axpe-line:var(--codex-plus-border,#444)}
.light .axpe-bar,.light .axpe-panel,.light .axpe-notice,.light .axpe-tooltip{--axpe-bg:var(--codex-plus-bg-elevated,#fff);--axpe-fg:var(--codex-plus-text,#242424);--axpe-line:var(--codex-plus-border,#ddd)}
.axpe-bar{display:inline-flex;align-items:center;gap:3px;flex:0 0 auto;max-width:100%}.axpe-bar[hidden],.axpe-bar [hidden],.axpe-notice[hidden],.axpe-tooltip[hidden]{display:none!important}
.axpe-bar button,.axpe-panel button{font:inherit;color:inherit;cursor:pointer;border:1px solid transparent;border-radius:8px;background:transparent;padding:5px 7px;white-space:nowrap;display:inline-flex;gap:5px;align-items:center;justify-content:center}
.axpe-bar button:hover,.axpe-panel button:hover{background:color-mix(in srgb,currentColor 8%,transparent);border-color:var(--axpe-line)}
.axpe-bar button:active,.axpe-panel button:active{transform:translateY(1px)}.axpe-bar button[aria-disabled="true"]{opacity:.4;cursor:default}.axpe-bar button:focus-visible,.axpe-panel :focus-visible{outline:2px solid #7199b3;outline-offset:2px}
.axpe-bar svg{width:16px;height:16px;flex-shrink:0}.axpe-loading svg{animation:axpe-pulse 1s ease-in-out infinite alternate}@keyframes axpe-pulse{to{opacity:.25}}
.axpe-panel{position:fixed;z-index:2147483000;background:var(--axpe-bg);border:1px solid var(--axpe-line);border-radius:15px;box-shadow:0 12px 40px #0003;padding:16px;overflow:auto;overscroll-behavior:contain}
.axpe-panel header,.axpe-panel footer{display:flex;align-items:center;justify-content:space-between;gap:8px}.axpe-panel header strong{font-size:15px}.axpe-panel p{margin:10px 0;white-space:pre-wrap;overflow-wrap:anywhere}.axpe-panel label{display:block;margin:10px 0}.axpe-panel input:not([type=checkbox]),.axpe-panel select,.axpe-panel textarea{box-sizing:border-box;width:100%;display:block;margin-top:5px;border:1px solid var(--axpe-line);border-radius:8px;padding:9px 10px;background:transparent;color:inherit;font:inherit;min-width:0}.axpe-panel select option{background:var(--axpe-bg);color:var(--axpe-fg)}.axpe-panel textarea{resize:vertical}.axpe-panel footer{position:sticky;bottom:-16px;background:var(--axpe-bg);padding:12px 0 2px;border-top:1px solid var(--axpe-line)}.axpe-panel footer button{border-color:var(--axpe-line);flex:1}.axpe-panel footer button:last-child{background:var(--axpe-fg);color:var(--axpe-bg)}
.axpe-panel .axpe-secret{position:relative;margin-top:5px}.axpe-panel .axpe-secret input{margin-top:0;padding-right:42px}.axpe-panel .axpe-eye{position:absolute;right:4px;top:50%;transform:translateY(-50%);padding:6px;height:30px;width:30px}.axpe-panel .axpe-eye:active{transform:translateY(-50%)}.axpe-eye svg{width:18px;height:18px}.axpe-eye [hidden]{display:none}
.axpe-tooltip{position:fixed;z-index:2147483001;background:var(--axpe-fg);color:var(--axpe-bg);border-radius:7px;padding:6px 9px;box-shadow:0 3px 12px #0002;pointer-events:none;white-space:normal;overflow-wrap:anywhere;max-width:calc(100vw - 16px);font-size:12px;box-sizing:border-box}
.axpe-notice{position:fixed;bottom:12px;left:50%;transform:translateX(-50%);max-width:calc(100vw - 24px);z-index:2147482999;background:var(--axpe-bg);border:1px solid var(--axpe-line);border-radius:9px;padding:7px 12px;box-shadow:0 3px 15px #0002;pointer-events:none;overflow-wrap:anywhere}
@media(max-width:700px){.axpe-caption{display:none}.axpe-bar button{padding:4px}}@media(prefers-reduced-motion:reduce){.axpe-loading svg{animation:none}}
`;
  document.head.append(style);
  document.body.append(notice, tooltip);
  let activeSession = session(),
    lastText = "",
    lastStructure = "";
  const resizeObserver = new ResizeObserver(schedule);
  let observedShell = null;
  function mountHost() {
    const footer = shell.querySelector(
      '.composer-footer, [data-testid="composer-footer"], [data-composer-footer]',
    );
    // 沿用 1.0.0 的插入位置和底栏溢出回退；隐藏底栏按无底栏处理。
    if (
      footer &&
      !editor.contains(footer) &&
      !footer.closest("[hidden], [inert]") &&
      footer.getBoundingClientRect().height > 0 &&
      getComputedStyle(footer).visibility !== "hidden"
    ) {
      if (host.parentElement !== footer) footer.prepend(host);
    } else {
      if (host.parentElement !== shell) shell.append(host);
    }
    const row = host.parentElement;
    if (row !== shell && row.scrollWidth > row.clientWidth + 2)
      shell.append(host);
  }
  function ensure() {
    if (disposed) return;
    timer = 0;
    if (pendingWrite) return;
    const found = locate(),
      key = session();
    if (key !== activeSession) {
      job?.cancel();
      hideTooltip();
      activeSession = key;
      closePanel();
      say("");
      version = drafts.get(key)?.revision ?? 0;
    }
    if (found?.node !== editor) {
      hideTooltip();
      job?.cancel();
      editor = found?.node || null;
      shell = found?.container || null;
      if (editor && drafts.get(key)?.result !== text(editor))
        drafts.delete(key);
      else if (editor && drafts.has(key)) version = drafts.get(key).revision;
      lastText = text(editor);
      lastStructure = editor?.innerHTML || "";
    } else if (
      editor &&
      (lastText !== text(editor) || lastStructure !== editor.innerHTML)
    ) {
      // 监听程序性改动和特殊节点变化，编辑后即使恢复相同文本也不复用旧还原。
      if (!writing && drafts.get(key)?.result !== text(editor)) {
        version++;
        drafts.delete(key);
      }
      lastText = text(editor);
      lastStructure = editor.innerHTML;
    }
    shell = found?.container || null;
    if (!editor || !shell) {
      hideTooltip();
      host.remove();
      return;
    }
    mountHost();
    if (observedShell !== shell) {
      resizeObserver.disconnect();
      resizeObserver.observe(shell);
      observedShell = shell;
    }
    update();
  }
  function schedule() {
    if (!disposed && !timer) timer = setTimeout(ensure, 100);
  }
  function affectsComposer(record) {
    if (own(record.target)) return false;
    if (record.type === "attributes")
      return (
        !["style", "class"].includes(record.attributeName) ||
        !!shell?.contains(record.target)
      );
    if (record.type === "characterData")
      return !!shell?.contains(record.target);
    const nodes = [...record.addedNodes, ...record.removedNodes];
    if (nodes.every(own)) return false;
    if (shell?.contains(record.target)) return true;
    const changed = nodes.some(
      (node) =>
        node.nodeType === 1 &&
        (node === shell ||
          node.contains(shell) ||
          node.matches(EDITORS + ", " + COMPOSERS) ||
          node.querySelector(EDITORS + ", " + COMPOSERS)),
    );
    if (changed) discoveryNeeded = true;
    return changed;
  }
  const observer = new MutationObserver((records) => {
    if (
      !tooltip.hidden &&
      records.some(
        (r) => !own(r.target) || r.target === main || r.target === host,
      )
    )
      positionTooltip();
    if (!main.isConnected && !disposed) {
      hideTooltip();
      schedule();
    }
    if (records.some(affectsComposer)) schedule();
  });
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true,
    attributeFilter: [
      "contenteditable",
      "readonly",
      "disabled",
      "data-thread-id",
      "data-app-action-sidebar-thread-active",
      "aria-current",
      "aria-selected",
      "hidden",
      "style",
      "class",
    ],
  });
  listen(
    document,
    "input",
    (event) => {
      if (
        !writing &&
        !own(event.target) &&
        (!editor || !editor.contains(event.target) || !host.isConnected) &&
        event.target.closest?.(EDITORS)
      ) {
        discoveryNeeded = true;
        schedule();
      }
      if (
        editor &&
        (event.target === editor || editor.contains(event.target)) &&
        !writing
      ) {
        // 写入期间的宿主异步通知不等同于用户编辑；锁定时以最终内容和附件快照验证。
        if (
          pendingWrite &&
          !event.isTrusted &&
          writeContext?.key === session() &&
          writeContext.container.contains(event.target) &&
          (activeLock || sameText(text(editor), writeContext.expected))
        )
          return;
        hideTooltip();
        version++;
        drafts.delete(session());
        lastText = text(editor);
        lastStructure = editor.innerHTML;
        update();
        schedule();
      }
    },
    true,
  );
  listen(
    document,
    "compositionstart",
    (event) => {
      if (event.target === editor) {
        hideTooltip();
        composing = true;
        update();
      }
    },
    true,
  );
  listen(
    document,
    "compositionend",
    () => {
      composing = false;
      update();
    },
    true,
  );
  listen(document, "focusin", (event) => {
    if (!own(event.target)) schedule();
  });
  listen(window, "popstate", () => {
    hideTooltip();
    schedule();
  });
  listen(window, "hashchange", () => {
    hideTooltip();
    schedule();
  });
  listen(window, "blur", hideTooltip);
  listen(window, "resize", () => {
    position();
    schedule();
  });
  listen(document, "scroll", position, true);
  listen(
    document,
    "pointerdown",
    (event) => {
      if (
        panel &&
        !panel.contains(event.target) &&
        !host.contains(event.target)
      )
        closePanel();
    },
    true,
  );
  listen(
    document,
    "keydown",
    (event) => {
      if (event.key === "Escape") hideTooltip();
      if (event.key === "Escape" && panel) {
        event.preventDefault();
        event.stopPropagation();
        closePanel();
      }
    },
    true,
  );
  function destroy() {
    if (disposed) return;
    reconcileDraft(job);
    disposed = true;
    job?.cancel();
    activeLock?.release();
    testJob?.cancel();
    clearTimeout(job?.timer);
    clearTimeout(testJob?.timer);
    clearTimeout(timer);
    clearTimeout(noticeTimer);
    observer.disconnect();
    resizeObserver.disconnect();
    [...paintWaits.values()].forEach((finish) => finish());
    bindings.splice(0).forEach((unbind) => unbind());
    host.remove();
    panel?.remove();
    notice.remove();
    tooltip.remove();
    style.remove();
  }
  function inspect() {
    const box = (node) => {
      if (!node) return null;
      const rect = node.getBoundingClientRect();
      const style = getComputedStyle(node);
      return {
        connected: node.isConnected,
        width: rect.width,
        height: rect.height,
        top: rect.top,
        display: style.display,
        visibility: style.visibility,
        opacity: style.opacity,
      };
    };
    // 仅报告结构和状态，不包含草稿正文、会话标识或 API 配置。
    return JSON.stringify({
      version: "1.0.1",
      editor: box(editor),
      shell: box(shell),
      button: box(main),
      hidden: host.hidden,
      pendingWrite,
      composing,
      editors: [...document.querySelectorAll(EDITORS)].filter((node) => !own(node)).map((node) => ({
        tag: node.tagName,
        className: node.className,
        editable: node.getAttribute("contenteditable"),
        disabled: !!node.disabled,
        readOnly: !!node.readOnly,
        textLength: text(node).trim().length,
        accepted: !!candidate(node),
        excluded: !!node.closest('aside, nav, [role="dialog"], [role="search"], [data-sidebar], [inert]'),
        box: box(node),
      })),
    }, null, 2);
  }
  window[NS] = { destroy, ensure, inspect, drafts, version: "1.0.1" };
  window.codexPlus?.onCleanup?.(destroy);
  listen(window, "pagehide", destroy);
  ensure();
})();

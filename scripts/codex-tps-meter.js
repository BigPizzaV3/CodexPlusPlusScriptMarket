/* @codex-plus-script
name: Codex TPS Meter
description: 按会话和轮次统计 TPS 及估算的首字返回时间，多次 API 调用显示首字耗时的最大、最小、平均值。
version: 2.1.0
author: tohsakarat
*/

(() => {
  "use strict";

  const API_KEY = "__codexTpsMeter";
  // v1 混入了其他会话的累计量和工具输出，旧记录没有数据可用于修正，停止展示。
  // 原始 v1 存储保留不动；v2 单独存储从轮次开始到结束的完整记录。
  const STORAGE_KEY = "codexPlus.tpsMeter.v2";
  const STYLE_ID = "codex-tps-meter-style";
  const BADGE_ATTR = "data-codex-tps-badge";
  const TURN_SELECTOR = "div.contents[data-content-search-turn-key]";
  const WINDOW_MS = 1000;
  const TOOL_ITEM_TYPES = new Set([
    "commandExecution", "fileChange", "mcpToolCall", "dynamicToolCall", "webSearch",
  ]);

  window[API_KEY]?.destroy?.();
  document.getElementById("codex-tps-meter")?.remove();

  const records = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
  const totals = new Map();
  const turns = new Map();
  let timer = 0;

  function threadKey(host, thread) {
    return JSON.stringify([host, thread]);
  }

  function turnKey(host, thread, turn) {
    return JSON.stringify([host, thread, turn]);
  }

  function startTurn(host, params) {
    const threadId = params.threadId;
    const turnId = params.turn.id;
    const key = turnKey(host, threadId, turnId);
    if (turns.has(key)) return;
    const now = Date.now();
    turns.set(key, {
      host,
      threadId,
      turnId,
      startedAt: params.turn.startedAt ? params.turn.startedAt * 1000 : now,
      baseline: totals.get(threadKey(host, threadId)) ?? null,
      output: null,
      items: new Map(),
      buckets: new Map(),
      firstOutputDelaysMs: [],
      // 页面没有上游 API 发出事件。首个请求从轮次开始估算，后续请求从
      // 上一个请求的用量更新、或最后一个并行工具结束时估算，不包含工具执行时间。
      callReadyAt: now,
      awaitingFirstOutput: true,
      lastCallUsageTotal: null,
      activeTools: new Set(),
    });
  }

  function observeFirstOutput(turn, delta) {
    if (!delta || !turn.awaitingFirstOutput || turn.callReadyAt === null) return;
    turn.firstOutputDelaysMs.push(Date.now() - turn.callReadyAt);
    // 思考、摘要、正文可能属于同一次调用；首个增量只记一次。
    turn.awaitingFirstOutput = false;
  }

  function observeTool(turn, method, item) {
    if (!TOOL_ITEM_TYPES.has(item.type)) return;
    if (method === "item/started") {
      turn.activeTools.add(item.id);
      turn.callReadyAt = null;
      turn.awaitingFirstOutput = true;
    } else {
      turn.activeTools.delete(item.id);
      if (turn.activeTools.size === 0 && turn.awaitingFirstOutput) {
        turn.callReadyAt = Date.now();
      }
    }
  }

  // 页面里的工具结果、DOM 折叠和历史加载都不会进入此处，只计算真实模型增量。
  // 粗估时中文字符按约 1 token、其他字符按约 4 字符/token；这是估算而非 tokenizer。
  function estimateText(text) {
    const cjk = (text.match(/[\u3400-\u9fff\uf900-\ufaff]/g) || []).length;
    return cjk + (text.length - cjk) / 4;
  }

  function addDelta(turn, method, params) {
    const itemId = params.itemId;
    let item = turn.items.get(itemId);
    if (!item) {
      item = { text: 0, raw: 0, summary: 0 };
      turn.items.set(itemId, item);
    }
    const bucket = Math.floor((Date.now() - turn.startedAt) / WINDOW_MS);
    let samples = turn.buckets.get(bucket);
    if (!samples) {
      samples = new Map();
      turn.buckets.set(bucket, samples);
    }
    let sample = samples.get(itemId);
    if (!sample) {
      sample = { text: 0, raw: 0, summary: 0 };
      samples.set(itemId, sample);
    }
    const field = method === "item/agentMessage/delta" ? "text"
      : method === "item/reasoning/textDelta" ? "raw" : "summary";
    const estimate = estimateText(params.delta);
    item[field] += estimate;
    sample[field] += estimate;
  }

  function observeUsage(host, params) {
    const total = params.tokenUsage.total.outputTokens;
    const key = threadKey(host, params.threadId);
    const turn = turns.get(turnKey(host, params.threadId, params.turnId));
    if (turn) {
      // 没有上一轮基准时，用首个请求的 last 值拆出历史总量。
      // 绝不能把首次收到的整个会话累计值当成这一秒的产量。
      if (turn.baseline === null) {
        turn.baseline = total - params.tokenUsage.last.outputTokens;
      }
      // outputTokens 本身包含 reasoningOutputTokens，不再次相加。
      turn.output = total - turn.baseline;
      // 用量更新标识一次模型调用结束；重复的用量快照不产生新调用。
      if (total !== turn.lastCallUsageTotal) {
        turn.lastCallUsageTotal = total;
        turn.awaitingFirstOutput = true;
        turn.callReadyAt = turn.activeTools.size === 0 ? Date.now() : null;
      }
    }
    totals.set(key, total);
  }

  function estimatedOutput(turn) {
    let count = 0;
    for (const item of turn.items.values()) {
      // 同一个 reasoning item 的正文与摘要是同一份思考的不同展示，不能加两遍。
      count += item.text + (item.raw > 0 ? item.raw : item.summary);
    }
    return count;
  }

  function bucketRate(turn, samples) {
    let count = 0;
    for (const [id, sample] of samples) {
      count += sample.text + (turn.items.get(id).raw > 0 ? sample.raw : sample.summary);
    }
    return count;
  }

  function snapshot(turn, durationMs) {
    const rates = [...turn.buckets.values()].map(samples => bucketRate(turn, samples))
      .filter(rate => rate > 0);
    const exact = turn.output !== null;
    const output = exact ? turn.output : estimatedOutput(turn);
    const delays = turn.firstOutputDelaysMs;
    return {
      host: turn.host,
      threadId: turn.threadId,
      turnId: turn.turnId,
      avg: durationMs > 0 ? output * 1000 / durationMs : 0,
      peak: rates.length ? Math.max(...rates) : null,
      low: rates.length ? Math.min(...rates) : null,
      output,
      durationMs,
      exact,
      firstOutput: delays.length ? {
        count: delays.length,
        minMs: Math.min(...delays),
        maxMs: Math.max(...delays),
        avgMs: delays.reduce((sum, value) => sum + value, 0) / delays.length,
      } : null,
    };
  }

  function completeTurn(key, turn, info) {
    // 均速是整轮输出 token / 整轮耗时，包含工具等待；不是非零采样值的平均。
    const durationMs = info.durationMs ?? (info.completedAt
      ? info.completedAt * 1000 - turn.startedAt : Date.now() - turn.startedAt);
    records[key] = { ...snapshot(turn, durationMs), completedAt: Date.now() };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
    turns.delete(key);
    render();
  }

  function onMessage(event) {
    const message = event.data;
    if (message?.type !== "mcp-notification") return;
    const { method, params } = message;
    const host = message.hostId;

    if (method === "turn/started") {
      startTurn(host, params);
      return;
    }
    if (method === "thread/tokenUsage/updated") {
      observeUsage(host, params);
      return;
    }

    const turnId = params?.turnId ?? params?.turn?.id;
    const key = turnKey(host, params?.threadId, turnId);
    const turn = turns.get(key);
    // 中途安装、历史加载不建轮次，不把不完整的采样当作完整整轮统计。
    if (!turn) return;
    if (method === "item/agentMessage/delta" || method === "item/reasoning/textDelta"
      || method === "item/reasoning/summaryTextDelta") {
      observeFirstOutput(turn, params.delta);
      addDelta(turn, method, params);
    } else if (method === "item/started" || method === "item/completed") {
      observeTool(turn, method, params.item);
    } else if (method === "turn/completed") {
      completeTurn(key, turn, params.turn);
    }
  }

  function nodeThreadId(node) {
    const marker = node.querySelector("[data-response-annotation-conversation]");
    if (marker) return marker.getAttribute("data-response-annotation-conversation");
    const root = node.closest(".thread-scroll-container");
    const above = root?.querySelector("[data-above-composer-conversation-id]");
    if (above) return above.getAttribute("data-above-composer-conversation-id");
    const active = document.querySelector("[data-app-action-sidebar-thread-active='true']"
      + "[data-app-action-sidebar-thread-id]");
    return active?.getAttribute("data-app-action-sidebar-thread-id");
  }

  function rateText(rate) {
    return rate === null ? "—" : rate.toFixed(1);
  }

  function firstOutputText(stats) {
    // 老记录没有首字时间，保留其原有 TPS，不回填虚构的耗时。
    if (!stats) return "";
    const seconds = ms => `${(ms / 1000).toFixed(2)} s`;
    if (stats.count === 1) return ` · 首字约 ${seconds(stats.avgMs)}`;
    return ` · 首字约：最大 ${seconds(stats.maxMs)} · 最小 ${seconds(stats.minMs)}`
      + ` · 平均 ${seconds(stats.avgMs)}（${stats.count} 次）`;
  }

  function render() {
    const now = Date.now();
    const active = [...turns.values()];
    const saved = Object.values(records);
    for (const node of document.querySelectorAll(TURN_SELECTOR)) {
      const turnId = node.getAttribute("data-content-search-turn-key");
      const threadId = nodeThreadId(node);
      const live = active.find(turn => turn.turnId === turnId && turn.threadId === threadId);
      const record = live ? snapshot(live, now - live.startedAt)
        : saved.find(item => item.turnId === turnId && item.threadId === threadId);
      let badge = node.querySelector(`[${BADGE_ATTR}]`);
      if (!record) {
        badge?.remove();
        continue;
      }
      if (!badge) {
        badge = document.createElement("div");
        badge.setAttribute(BADGE_ATTR, "true");
        node.appendChild(badge);
      }
      const prefix = live ? "生成中 · " : "";
      const text = `${prefix}均速${record.exact ? " " : "约 "}${rateText(record.avg)} t/s`
        + ` · 峰值约 ${rateText(record.peak)} t/s · 最低约 ${rateText(record.low)} t/s`
        + firstOutputText(record.firstOutput);
      if (badge.textContent !== text) badge.textContent = text;
      badge.title = "均速：本轮输出 token（包含思考）÷ 整轮耗时，包含工具等待。"
        + "峰值/最低：模型文本和思考流的每秒估算，忽略无输出的窗口；工具输出不计入。"
        + "首字：首个思考或正文增量到达时间，按轮次开始或上次调用/工具完成时间估算。"
        + "并行工具以最后一个结束时间为起点；没有可观察文本增量的调用不计样本。"
        + (record.exact ? "" : "本轮没有收到 token 用量，均速也为文本估算；未公开的思考无法估算。");
    }
  }

  function mount() {
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `[${BADGE_ATTR}] { display: block; width: 100%; margin: 2px 0 10px;`
      + "font-size: 11px; line-height: 1.4; font-variant-numeric: tabular-nums;"
      + "color: var(--text-secondary, #9aa0a6); }";
    document.head.appendChild(style);
    timer = window.setInterval(render, WINDOW_MS);
    render();
  }

  function destroy() {
    window.removeEventListener("message", onMessage, true);
    document.removeEventListener("DOMContentLoaded", mount);
    clearInterval(timer);
    document.getElementById(STYLE_ID)?.remove();
    document.querySelectorAll(`[${BADGE_ATTR}]`).forEach(node => node.remove());
    turns.clear();
  }

  window[API_KEY] = { version: "2.1.0", destroy, records };
  window.addEventListener("message", onMessage, true);
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mount, { once: true });
  } else {
    mount();
  }
})();

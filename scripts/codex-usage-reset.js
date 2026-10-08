// ==UserScript==
// @name         Codex Usage & Resets
// @namespace    codex-plus-plus
// @version      1.1.2
// @description  顶栏仅显示 5 小时剩余用量及重置时间，点击展开用量与重置卡片菜单。
// @match        app://-/*
// @run-at       document-start
// ==/UserScript==

(() => {
  "use strict";
  const KEY = "__codexUsageReset";
  const ID = "codex-usage-reset";
  const VERSION = "1.1.2";
  const USAGE = "/wham/usage";
  const CREDITS = "/wham/rate-limit-reset-credits";

  const number = (v) => v == null || v === "" || typeof v === "boolean" ? null :
    Number.isFinite(Number(v)) ? Number(v) : null;
  function timestamp(value) {
    if (value == null || value === "") return null;
    const n = number(value);
    const ms = n == null ? Date.parse(value) : n < 1e12 ? n * 1000 : n;
    return Number.isFinite(ms) && ms > 0 ? ms : null;
  }
  function windowValue(w) {
    if (!w) return null;
    const used = number(w.used_percent ?? w.usedPercent);
    if (used == null) return null;
    return { remaining: Math.min(100, Math.max(0, 100 - used)),
      resetsAt: timestamp(w.reset_at ?? w.resetsAt) };
  }
  function normalizeUsage(raw) {
    // Only the core account bucket; additional model/review limits are separate.
    const rate = raw?.rate_limit ?? raw?.rateLimits ?? null;
    const windows = [rate?.primary_window ?? rate?.primary, rate?.secondary_window ?? rate?.secondary].filter(Boolean);
    const duration = (w) => number(w.limit_window_seconds) ??
      (number(w.windowDurationMins) == null ? null : number(w.windowDurationMins) * 60);
    return {
      five: windowValue(windows.find((w) => duration(w) === 18000)),
      week: windowValue(windows.find((w) => duration(w) === 604800)),
      accountId: raw?.account_id ?? null,
    };
  }
  function normalizeCredits(raw, now = Date.now()) {
    const count = number(raw?.available_count);
    if (!raw || count == null || count < 0 || !Number.isInteger(count)) throw Error("重置接口未返回有效的 available_count");
    const all = Array.isArray(raw.credits) ? raw.credits : [];
    const available = all.filter((c) => c?.status === "available" &&
      (timestamp(c.expires_at) == null || timestamp(c.expires_at) > now))
      .map((c) => ({ id: typeof c.id === "string" ? c.id : null,
        title: c.title || "用量重置", expiresAt: timestamp(c.expires_at), resetType: c.reset_type ?? null }))
      .sort((a, b) => (a.expiresAt ?? Infinity) - (b.expiresAt ?? Infinity));
    // Detailed responses can contain a credit which expired since the last fetch.
    const expired = all.filter((c) => c?.status === "available" && timestamp(c.expires_at) != null && timestamp(c.expires_at) <= now).length;
    return { count: Math.max(0, count - expired), available };
  }
  function resetResult(response, retry) {
    if (response?.code === "reset" || retry && response?.code === "already_redeemed") return true;
    const reasons = { already_redeemed: "该重置已经使用", no_credit: "没有可用的重置次数",
      nothing_to_reset: "当前用量不需要重置" };
    throw Error(reasons[response?.code] || `重置未完成：${response?.code || "未知响应"}`);
  }
  if (typeof window === "undefined") {
    if (typeof module !== "undefined") module.exports = { timestamp, normalizeUsage, normalizeCredits, resetResult };
    return;
  }
  if (window.top !== window || !/^app:\/\/-\//.test(location.href)) return;
  window[KEY]?.destroy?.();

  let disposed = false, root, panel, style, observer, timer, frame = 0;
  let usage = null, credits = null, usageAt = 0, creditsAt = 0;
  let usageError = "", creditsError = "", feedback = "", loading = false, resetting = false;
  let services = null, refreshPromise = null, transportAttempt = null;
  let confirmingCreditId = null;
  const pending = new Set();

  function text(el, value) { if (el.textContent !== value) el.textContent = value; }
  function element(tag, className, value) {
    const el = document.createElement(tag); el.className = className || "";
    if (value != null) el.textContent = value;
    return el;
  }
  function button(label, fn) {
    const el = element("button", "", label); el.type = "button";
    el.addEventListener("click", fn); return el;
  }
  function formatTime(ms, day = false) {
    return ms == null ? "未知" : new Intl.DateTimeFormat("zh-CN", {
      ...(day ? { month: "2-digit", day: "2-digit" } : {}), hour: "2-digit", minute: "2-digit", hour12: false,
    }).format(ms);
  }
  function fullTime(ms) {
    return ms == null ? "未知" : new Date(ms).toLocaleString("zh-CN", { hour12: false });
  }
  function percent(w) { return w ? `${Math.round(w.remaining)}%` : "—"; }
  function fresh(at) { return at > 0 && Date.now() - at <= 120000; }

  async function findServices() {
    if (services) return services;
    const urls = new Set(Array.from(document.querySelectorAll('script[src],link[rel="modulepreload"]'))
      .map((n) => n.src || n.href));
    for (const entry of performance.getEntriesByType("resource")) urls.add(entry.name);
    for (const url of urls) {
      if (!/\/assets\/rpc-[^/]+\.js(?:$|\?)/.test(url)) continue;
      try {
        const mod = await import(/* @vite-ignore */ url);
        if (mod.appServices?.httpFetch) { services = mod.appServices; return services; }
      } catch { /* Older versions use the renderer message bridge below. */ }
    }
    return null;
  }
  function disposeResource(resource) { resource?.[Symbol.dispose]?.(); }
  async function serviceRequest(service, path, method, body) {
    const requestId = crypto.randomUUID();
    const request = { url: path, method, headers: { "Content-Type": "application/json" }, retry: false };
    if (body != null) request.body = JSON.stringify(body);
    let call, result, timeout;
    const controller = new AbortController();
    const cancel = () => { controller.abort(); Promise.resolve(service.cancel(requestId)).catch(() => {}); };
    pending.add(cancel);
    try {
      call = service.fetch(requestId, request);
      const expired = new Promise((_, reject) => {
        timeout = setTimeout(() => { cancel(); reject(Error("请求超时")); }, 15000);
        controller.signal.addEventListener("abort", () => reject(Error("请求已取消或超时")), { once: true });
      });
      return await Promise.race([(async () => {
        result = await call;
        if (controller.signal.aborted) { disposeResource(result); throw Error("请求已取消或超时"); }
        if (!result?.response) throw Error(result?.error || "请求失败");
        const response = result.response;
        if (!response.ok) throw Error(`HTTP ${response.status}`);
        return await response.json();
      })(), expired]);
    } finally {
      clearTimeout(timeout); pending.delete(cancel);
      disposeResource(result); disposeResource(call);
    }
  }
  function bridgeRequest(path, method, body) {
    const bridge = window.electronBridge;
    if (typeof bridge?.sendMessageFromView !== "function") throw Error("未找到 Codex 请求通道");
    const requestId = `codex-usage-reset-${crypto.randomUUID()}`;
    return new Promise((resolve, reject) => {
      let timeout;
      const cleanup = () => { clearTimeout(timeout); window.removeEventListener("message", receive); pending.delete(cancel); };
      const fail = (err) => { cleanup(); reject(err); };
      const cancel = () => { Promise.resolve(bridge.sendMessageFromView({ type: "cancel-fetch", requestId })).catch(() => {}); fail(Error("请求已取消或超时")); };
      const receive = (event) => {
        const data = event.data;
        if (data?.type !== "fetch-response" || data.requestId !== requestId) return;
        cleanup();
        if (data.responseType !== "success" || data.status < 200 || data.status >= 300) {
          reject(Error(data.error || `HTTP ${data.status}`)); return;
        }
        try { resolve(JSON.parse(data.bodyJsonString)); } catch { reject(Error("响应不是有效 JSON")); }
      };
      window.addEventListener("message", receive); pending.add(cancel);
      timeout = setTimeout(cancel, 15000);
      const message = { type: "fetch", requestId, hostId: new URL(location.href).searchParams.get("hostId") || "local", method, url: path };
      if (body != null) { message.body = JSON.stringify(body); message.headers = { "Content-Type": "application/json" }; }
      try { Promise.resolve(bridge.sendMessageFromView(message)).catch(fail); } catch (e) { fail(e); }
    });
  }
  async function request(path, method = "GET", body) {
    const api = await findServices();
    if (disposed) throw Error("脚本已停止");
    // Select one transport before sending. Never re-submit a POST via another transport.
    return api?.httpFetch ? serviceRequest(api.httpFetch, path, method, body) : bridgeRequest(path, method, body);
  }

  async function refresh() {
    if (disposed) return;
    if (refreshPromise) return refreshPromise;
    loading = true; render();
    refreshPromise = (async () => {
      const results = await Promise.allSettled([request(USAGE), request(CREDITS)]);
      if (disposed) return;
      if (results[0].status === "fulfilled") {
        usage = normalizeUsage(results[0].value); usageAt = Date.now();
        usageError = usage.five || usage.week ? "" : "接口未提供 5 小时/1 周用量（请确认登录官方账号）";
      } else usageError = results[0].reason.message;
      if (results[1].status === "fulfilled") {
        try { credits = normalizeCredits(results[1].value); creditsAt = Date.now(); creditsError = ""; }
        catch (e) { creditsError = e.message; }
      } else creditsError = results[1].reason.message;
    })().finally(() => { refreshPromise = null; loading = false; render(); });
    return refreshPromise;
  }

  async function consume(credit) {
    if (resetting || disposed) return;
    confirmingCreditId = null;
    resetting = true; feedback = "正在核对可用重置…"; render();
    try {
      // A retry is the exact same logical attempt, even if the first request already consumed the last credit.
      if (!transportAttempt) {
        const raw = await request(CREDITS);
        credits = normalizeCredits(raw); creditsAt = Date.now(); creditsError = "";
        if (credits.count === 0) throw Error("没有可用的重置次数");
        if (credit.id && !credits.available.some((c) => c.id === credit.id)) throw Error("该重置已失效，请刷新后重新选择");
        transportAttempt = { creditId: credit.id, requestId: crypto.randomUUID(), retry: false };
      }
      const attempt = transportAttempt;
      feedback = "正在使用重置…"; render();
      let response;
      try {
        response = await request(`${CREDITS}/consume`, "POST", {
          ...(attempt.creditId ? { credit_id: attempt.creditId } : {}), redeem_request_id: attempt.requestId,
        });
      } catch (e) {
        attempt.retry = true;
        throw Error(`结果未确认：${e.message}。点击“重试同一次重置”核实。`);
      }
      transportAttempt = null;
      resetResult(response, attempt.retry);
      usage = null; credits = null; usageAt = 0; creditsAt = 0;
      feedback = "用量已重置，正在更新…";
      await refresh();
      feedback = "用量已重置";
    } catch (e) { feedback = e.message; }
    finally { resetting = false; render(); }
  }

  let fiveButton, refreshButton, fiveCard, weekCard, resetCount, resetExpiry, status, list;
  function usageCard(label, kind) {
    const card = element("div", `usage-card ${kind}`);
    const heading = element("div", "card-label", label);
    const values = element("div", "card-values");
    const remaining = element("strong", "remaining");
    const time = element("span", "reset-time");
    values.append(remaining, element("span", "separator", "|"), time);
    const track = element("div", "track"); const bar = element("div", "bar"); track.append(bar);
    const resetDate = element("div", "reset-date");
    card.append(heading, values, track, resetDate);
    return { node: card, remaining, time, bar, resetDate };
  }
  function renderCard(card, value, at, day) {
    text(card.remaining, percent(value)); text(card.time, formatTime(value?.resetsAt, day));
    card.bar.style.width = `${value?.remaining ?? 0}%`;
    card.node.dataset.low = String(value != null && value.remaining <= 10);
    card.node.dataset.stale = String(!fresh(at) || !!usageError);
    text(card.resetDate, `重置时间：${fullTime(value?.resetsAt)}`);
  }
  function build() {
    style = element("style"); style.id = `${ID}-style`;
    style.textContent = `
      #${ID},#${ID}-panel{font:12px/1.4 var(--font-sans,system-ui,sans-serif);color:var(--color-token-foreground,#222);-webkit-app-region:no-drag;box-sizing:border-box}
      #${ID}{position:fixed;top:2px;right:140px;z-index:2147483000;display:flex;align-items:center;height:31px;max-width:calc(100vw - 16px);font-family:ui-sans-serif,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
        --usage-button-border:var(--color-border,rgba(127,127,127,.24));--usage-button-border-strong:var(--color-border-strong,rgba(127,127,127,.38));
        --usage-button-foreground:var(--color-text-foreground,#202020);--usage-button-background:var(--color-background-control,var(--color-background-surface,rgba(127,127,127,.08)));--usage-button-hover:var(--color-background-control-hover,rgba(127,127,127,.15))}
      #${ID} button,#${ID}-panel button{font:inherit;color:inherit;border:1px solid transparent;border-radius:6px;background:transparent;cursor:pointer;padding:4px 6px;white-space:nowrap;-webkit-app-region:no-drag}
      #${ID} button:hover,#${ID}-panel button:hover{background:color-mix(in srgb,currentColor 8%,transparent)}
      #${ID} button:focus-visible,#${ID}-panel button:focus-visible{outline:2px solid #5389ea;outline-offset:1px}
      #${ID} [data-low=true]{color:#dc702b} #${ID} [data-stale=true]{opacity:.55}
      #${ID}-panel{position:fixed;z-index:2147483001;width:350px;max-width:calc(100vw - 24px);max-height:calc(100vh - 60px);overflow:auto;padding:14px;border:1px solid color-mix(in srgb,currentColor 18%,transparent);border-radius:12px;background:var(--color-token-main-surface-primary,#fff);box-shadow:0 8px 30px #0003}
      #${ID}-panel[hidden]{display:none}
      #${ID}-panel .menu-header{display:flex;align-items:center;justify-content:space-between;gap:8px;padding-bottom:12px;margin-bottom:12px;border-bottom:1px solid color-mix(in srgb,currentColor 16%,transparent)}
      #${ID}-panel .heading{font-size:14px;font-weight:650} #${ID}-panel .menu-actions{display:flex;gap:4px}
      #${ID}-panel .usage-card,#${ID}-panel .resets-card{padding:12px;margin-bottom:10px;border:1px solid color-mix(in srgb,currentColor 17%,transparent);border-radius:10px;background:color-mix(in srgb,currentColor 4%,transparent)}
      #${ID}-panel .card-label{font-weight:600;color:var(--color-token-foreground-secondary,#777)}
      #${ID}-panel .card-values{display:flex;align-items:baseline;gap:10px;margin:8px 0;font-variant-numeric:tabular-nums}
      #${ID}-panel .remaining{font-size:27px;line-height:1.2;letter-spacing:-.7px} #${ID}-panel .separator{opacity:.35}
      #${ID}-panel .reset-time{font-size:14px;font-weight:500} #${ID}-panel .reset-date{font-size:11px;opacity:.65;margin-top:7px}
      #${ID}-panel .track{height:5px;border-radius:5px;overflow:hidden;background:color-mix(in srgb,currentColor 10%,transparent)}
      #${ID}-panel .bar{height:100%;border-radius:5px;background:#349cec;transition:width .2s ease} #${ID}-panel .weekly .bar{background:#8b76ff}
      #${ID}-panel .usage-card[data-low=true] .remaining{color:#dc702b} #${ID}-panel .usage-card[data-stale=true] .card-values{opacity:.55}
      #${ID}-panel .reset-summary{display:flex;align-items:center;justify-content:space-between;gap:12px}
      #${ID}-panel .reset-count{font-weight:600;font-size:12px;padding:3px 9px;border-radius:6px;color:#349cec;background:#349cec14}
      #${ID}-panel .reset-expiry{font-size:11px;opacity:.65;margin:7px 0 10px}
      #${ID}-panel .status{color:var(--color-token-foreground-secondary,#777);font-size:11px;white-space:pre-line;margin-top:12px;padding-top:10px;border-top:1px solid color-mix(in srgb,currentColor 16%,transparent);overflow-wrap:anywhere}
      #${ID}-panel .credit{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 0;border-top:1px solid color-mix(in srgb,currentColor 12%,transparent)}
      #${ID}-panel .credit-info{min-width:0;overflow-wrap:anywhere} #${ID}-panel .expires{font-size:11px;opacity:.7;margin-top:3px}
      #${ID}-panel .use{border-color:color-mix(in srgb,currentColor 20%,transparent);padding:5px 9px;background:color-mix(in srgb,currentColor 4%,transparent)}
      #${ID}-panel .empty{font-size:12px;opacity:.6;padding:4px 0}
      #${ID}-panel button:disabled{opacity:.45;cursor:default}
      html.electron-dark #${ID},html.electron-dark #${ID}-panel,html[data-theme=dark] #${ID},html[data-theme=dark] #${ID}-panel{color:var(--color-token-foreground,#eee);background:var(--color-token-main-surface-primary,#202023)}
      @media(prefers-color-scheme:dark){html:not([data-theme=light]) #${ID},html:not([data-theme=light]) #${ID}-panel{color:var(--color-token-foreground,#eee);background:var(--color-token-main-surface-primary,#202023)}}
      @media(prefers-color-scheme:dark){html:not([data-theme=light]) #${ID}{--usage-button-border:rgba(255,255,255,.16);--usage-button-border-strong:rgba(255,255,255,.28);--usage-button-foreground:#f2f2f2;--usage-button-background:rgba(255,255,255,.055);--usage-button-hover:rgba(255,255,255,.11)}}
      html.electron-dark #${ID},html[data-theme=dark] #${ID}{--usage-button-border:rgba(255,255,255,.16);--usage-button-border-strong:rgba(255,255,255,.28);--usage-button-foreground:#f2f2f2;--usage-button-background:rgba(255,255,255,.055);--usage-button-hover:rgba(255,255,255,.11)}
      #${ID},html.electron-dark #${ID},html[data-theme=dark] #${ID}{background:transparent}
      @media(prefers-color-scheme:dark){html:not([data-theme=light]) #${ID}{background:transparent}}
      #${ID} .window-button{box-sizing:border-box;height:31px;min-width:94px;display:inline-flex;align-items:center;justify-content:center;gap:6px;padding:0 10px;border:1px solid var(--usage-button-border);border-radius:9px;color:var(--usage-button-foreground);background:var(--usage-button-background);box-shadow:none;cursor:default;font:inherit;font-size:12px;line-height:1;white-space:nowrap;user-select:none;outline:none;transition:background 120ms ease,border-color 120ms ease,transform 120ms ease}
      #${ID} .window-button:hover,#${ID} .window-button:focus-visible,#${ID} .window-button[aria-expanded=true]{background:var(--usage-button-hover);border-color:var(--usage-button-border-strong)}
      #${ID} .window-button .cur-time{font-variant-numeric:tabular-nums;font-weight:600;letter-spacing:.01em}
    `;
    document.head.appendChild(style);
    root = element("div"); root.id = ID; root.setAttribute("role", "group"); root.setAttribute("aria-label", "Codex 剩余用量及重置");
    fiveButton = button("", toggle); fiveButton.className = "window-button";
    fiveButton.setAttribute("aria-controls", `${ID}-panel`);
    fiveButton.setAttribute("aria-haspopup", "dialog");
    root.append(fiveButton);
    panel = element("section"); panel.id = `${ID}-panel`; panel.hidden = true; panel.setAttribute("aria-label", "Codex 用量与可用重置详情");
    panel.setAttribute("role", "dialog");
    const header = element("div", "menu-header"); const actions = element("div", "menu-actions");
    refreshButton = button("↻", () => void refresh()); refreshButton.title = "刷新用量"; refreshButton.setAttribute("aria-label", "刷新用量");
    const closeButton = button("×", close); closeButton.title = "关闭"; closeButton.setAttribute("aria-label", "关闭");
    actions.append(refreshButton, closeButton); header.append(element("div", "heading", "用量与重置"), actions);
    fiveCard = usageCard("5 小时剩余用量", "five-hour"); weekCard = usageCard("1 周剩余用量", "weekly");
    const resetsCard = element("div", "resets-card"); const summary = element("div", "reset-summary");
    resetCount = element("span", "reset-count"); resetExpiry = element("div", "reset-expiry");
    summary.append(element("span", "card-label", "可用重置"), resetCount);
    list = element("div"); resetsCard.append(summary, resetExpiry, list);
    status = element("div", "status"); status.setAttribute("role", "status");
    panel.append(header, fiveCard.node, weekCard.node, resetsCard, status);
    document.body.append(root, panel);
    document.addEventListener("pointerdown", outside); document.addEventListener("keydown", keydown);
    window.addEventListener("resize", scheduleLayout); window.addEventListener("focus", focusRefresh);
    document.addEventListener("visibilitychange", focusRefresh);
    observer = new MutationObserver((records) => {
      if (records.some((r) => !root.contains(r.target) && !panel.contains(r.target))) scheduleLayout();
    });
    observer.observe(document.body, { childList: true, subtree: true });
    timer = setInterval(() => { render(); if (!document.hidden && !resetting) void refresh(); }, 60000);
    render(); void refresh();
  }
  function toggle() { if (panel.hidden) { panel.hidden = false; render(); void refresh(); } else close(); }
  function close() { if (!resetting) { panel.hidden = true; confirmingCreditId = null; list.dataset.signature = ""; fiveButton.focus(); } }
  function outside(event) { if (!panel.hidden && !root.contains(event.target) && !panel.contains(event.target)) close(); }
  function keydown(event) { if (event.key === "Escape" && !panel.hidden) close(); }
  function focusRefresh() { if (!document.hidden && !resetting && !fresh(usageAt)) void refresh(); }
  function labelWindow(button, title, value, at, error, day) {
    const label = `${title} ${percent(value)}`;
    if (!button.firstChild) button.append(element("span"), element("span", "cur-time"));
    text(button.children[0], label); text(button.children[1], ` | ${formatTime(value?.resetsAt, day)}`);
    button.dataset.low = String(value != null && value.remaining <= 10);
    button.dataset.stale = String(!fresh(at) || !!error);
    button.title = `${title} 剩余 ${percent(value)}；重置：${fullTime(value?.resetsAt)}${error ? `；${error}` : ""}${!fresh(at) ? "；数据待刷新" : ""}`;
  }
  function render() {
    if (!root || disposed) return;
    labelWindow(fiveButton, "5小时", usage?.five, usageAt, usageError, false);
    const usable = credits?.available.filter((c) => c.expiresAt == null || c.expiresAt > Date.now()) || [];
    const count = credits ? Math.max(0, credits.count - (credits.available.length - usable.length)) : null;
    if (confirmingCreditId != null && (count === 0 ||
      confirmingCreditId !== "automatic" && !usable.some((c) => c.id === confirmingCreditId))) confirmingCreditId = null;
    const first = usable[0];
    fiveButton.setAttribute("aria-expanded", String(!panel.hidden));
    refreshButton.disabled = loading || resetting;
    if (!panel.hidden) {
      renderCard(fiveCard, usage?.five, usageAt, false); renderCard(weekCard, usage?.week, usageAt, true);
      text(resetCount, `${count ?? "—"} 次`);
      text(resetExpiry, count === 0 ? "当前没有可用重置" : `最近到期：${fullTime(first?.expiresAt)}`);
      text(status, [feedback, usageError && `用量：${usageError}`, creditsError && `重置：${creditsError}`,
        loading ? "正在刷新…" : usageAt ? `更新于 ${formatTime(usageAt)}（本机时区）` : "等待用量数据"].filter(Boolean).join("\n"));
      // Preserve confirmation and keyboard focus across timer/layout refreshes.
      const signature = JSON.stringify([usable, count, resetting, !!transportAttempt, confirmingCreditId, fresh(creditsAt), creditsError]);
      if (list.dataset.signature !== signature) {
        list.dataset.signature = signature; list.replaceChildren();
        if (transportAttempt) {
          const retry = button("重试同一次重置", () => void consume({ id: transportAttempt.creditId })); retry.disabled = resetting; list.append(retry);
        } else {
          const rows = usable.length ? usable : count > 0 ? [{ id: null, title: "使用一个可用重置", expiresAt: null }] : [];
          if (!rows.length) list.append(element("div", "empty", count === 0 ? "暂无可用重置" : "等待重置数据…"));
          for (const credit of rows) {
            const row = element("div", "credit"); const info = element("div", "credit-info");
            info.append(element("div", "", credit.title), element("div", "expires", `到期：${fullTime(credit.expiresAt)}`));
            const creditKey = credit.id ?? "automatic";
            const use = button(confirmingCreditId === creditKey ? "确认使用1次" : "使用重置", () => {
              if (confirmingCreditId !== creditKey) {
                confirmingCreditId = creditKey; render();
                const selected = Array.from(list.querySelectorAll("button[data-credit-key]")).find((b) => b.dataset.creditKey === creditKey);
                selected?.focus(); return;
              }
              void consume(credit);
            });
            use.dataset.creditKey = creditKey;
            if (confirmingCreditId === creditKey) use.title = "再次点击使用这一重置";
            use.className = "use"; use.disabled = resetting || !fresh(creditsAt) || !!creditsError;
            row.append(info, use); list.append(row);
          }
        }
      }
    }
    scheduleLayout();
  }
  function scheduleLayout() { if (!disposed && !frame) frame = requestAnimationFrame(layout); }
  function layout() {
    frame = 0; if (disposed || !root) return;
    if (!root.isConnected) document.body.appendChild(root);
    if (!panel.isConnected) document.body.appendChild(panel);
    // Same 31px title-bar band as Daily Token Usage; fit around existing buttons.
    const obstacles = Array.from(document.querySelectorAll('button,[role="button"],#codex-plus-menu,#codex-daily-token-usage'))
      .filter((n) => !root.contains(n) && !panel.contains(n))
      .map((n) => n.getBoundingClientRect())
      .filter((r) => r.width > 0 && r.height > 0 && r.top < 32 && r.bottom > 2)
      .map((r) => ({ left: Math.max(8, r.left - 6), right: Math.min(innerWidth - 132, r.right + 6) }))
      .filter((r) => r.right > r.left).sort((a, b) => a.left - b.left);
    const gaps = []; let start = 8; const end = Math.max(8, innerWidth - 140);
    for (const r of obstacles) { if (r.left > start) gaps.push({ left: start, right: r.left }); start = Math.max(start, r.right); }
    if (end > start) gaps.push({ left: start, right: end });
    let chosen = null;
    for (const mode of ["full"]) {
      root.dataset.mode = mode;
      const width = root.getBoundingClientRect().width;
      const gap = gaps.map((g) => ({ left: g.left, right: Math.min(end, g.right) }))
        .filter((g) => g.right - g.left >= width).at(-1);
      if (gap) { chosen = { left: gap.right - width, top: 2 }; break; }
    }
    if (!chosen) chosen = { left: Math.max(8, innerWidth - root.getBoundingClientRect().width - 12), top: 36 };
    root.style.left = `${Math.round(chosen.left)}px`; root.style.right = "auto"; root.style.top = `${chosen.top}px`;
    if (!panel.hidden) {
      const r = root.getBoundingClientRect();
      panel.style.left = `${Math.max(12, Math.min(r.right - panel.offsetWidth, innerWidth - panel.offsetWidth - 12))}px`;
      panel.style.top = `${r.bottom + 8}px`;
    }
  }
  function destroy() {
    disposed = true; clearInterval(timer); cancelAnimationFrame(frame); observer?.disconnect();
    document.removeEventListener("DOMContentLoaded", build);
    document.removeEventListener("pointerdown", outside); document.removeEventListener("keydown", keydown);
    window.removeEventListener("resize", scheduleLayout); window.removeEventListener("focus", focusRefresh);
    document.removeEventListener("visibilitychange", focusRefresh);
    for (const cancel of [...pending]) cancel();
    root?.remove(); panel?.remove(); style?.remove();
    if (window[KEY]?.destroy === destroy) delete window[KEY];
  }
  window[KEY] = { version: VERSION, refresh, destroy };
  const runtime = window.__codexPlusUserScripts;
  if (runtime?.currentKey && runtime.scripts?.[runtime.currentKey] && typeof runtime.registerCleanup === "function") {
    runtime.registerCleanup(destroy);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", build, { once: true });
  else build();
})();

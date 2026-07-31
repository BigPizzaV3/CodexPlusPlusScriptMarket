(() => {
  "use strict";

  const ROOT_ID = "codex-provider-guard-root";
  const STYLE_ID = "codex-provider-guard-style";
  const existing = document.getElementById(ROOT_ID);
  if (existing) existing.remove();

  const style = document.getElementById(STYLE_ID) || document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    #${ROOT_ID} { position: fixed; right: 18px; bottom: 18px; z-index: 2147483000; font-family: ui-sans-serif, system-ui, sans-serif; color: #e5e7eb; }
    #${ROOT_ID} * { box-sizing: border-box; }
    #${ROOT_ID} .cpg-launcher { border: 1px solid #374151; border-radius: 999px; background: #111827; color: #f9fafb; padding: 9px 14px; cursor: pointer; box-shadow: 0 8px 24px rgba(0,0,0,.3); }
    #${ROOT_ID} .cpg-panel { width: min(390px, calc(100vw - 32px)); margin-bottom: 10px; border: 1px solid #374151; border-radius: 14px; background: #111827; box-shadow: 0 18px 50px rgba(0,0,0,.42); overflow: hidden; }
    #${ROOT_ID} .cpg-hidden { display: none; }
    #${ROOT_ID} .cpg-head, #${ROOT_ID} .cpg-actions { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 12px 14px; }
    #${ROOT_ID} .cpg-head { border-bottom: 1px solid #263244; }
    #${ROOT_ID} .cpg-body { padding: 14px; display: grid; gap: 10px; }
    #${ROOT_ID} .cpg-title { font-weight: 700; }
    #${ROOT_ID} .cpg-badge { border-radius: 999px; padding: 3px 9px; font-size: 12px; background: #374151; }
    #${ROOT_ID} .cpg-badge[data-level="ok"] { background: #064e3b; color: #a7f3d0; }
    #${ROOT_ID} .cpg-badge[data-level="warning"] { background: #78350f; color: #fde68a; }
    #${ROOT_ID} .cpg-badge[data-level="critical"] { background: #7f1d1d; color: #fecaca; }
    #${ROOT_ID} .cpg-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
    #${ROOT_ID} .cpg-metric { border: 1px solid #263244; border-radius: 10px; padding: 9px; background: #0b1220; }
    #${ROOT_ID} .cpg-label { display: block; color: #9ca3af; font-size: 11px; margin-bottom: 4px; }
    #${ROOT_ID} .cpg-value { font-size: 13px; overflow-wrap: anywhere; }
    #${ROOT_ID} .cpg-findings { display: grid; gap: 7px; max-height: 190px; overflow: auto; }
    #${ROOT_ID} .cpg-finding { border-left: 3px solid #d97706; padding: 7px 9px; background: #1f2937; border-radius: 6px; font-size: 12px; line-height: 1.45; }
    #${ROOT_ID} .cpg-finding[data-level="critical"] { border-left-color: #ef4444; }
    #${ROOT_ID} .cpg-safe { color: #a7f3d0; font-size: 12px; }
    #${ROOT_ID} button { border: 1px solid #4b5563; border-radius: 8px; background: #1f2937; color: #f9fafb; padding: 7px 10px; cursor: pointer; }
    #${ROOT_ID} button:hover { background: #374151; }
    #${ROOT_ID} button:disabled { cursor: wait; opacity: .6; }
    #${ROOT_ID} .cpg-note { color: #9ca3af; font-size: 11px; line-height: 1.45; }
  `;
  if (!style.parentNode) document.head.appendChild(style);

  const root = element("div", { id: ROOT_ID });
  const panel = element("section", { className: "cpg-panel cpg-hidden", ariaLabel: "Provider Guard" });
  const badge = element("span", { className: "cpg-badge", textContent: "未检查" });
  const head = element("div", { className: "cpg-head" }, [
    element("span", { className: "cpg-title", textContent: "Provider Guard" }),
    badge,
  ]);
  const body = element("div", { className: "cpg-body" });
  const metrics = element("div", { className: "cpg-grid" });
  const findings = element("div", { className: "cpg-findings" });
  const note = element("div", {
    className: "cpg-note",
    textContent: "此市场脚本只有只读检查权限。修复必须在 Codex++ 原生管理器中确认执行。",
  });
  const refreshButton = element("button", { type: "button", textContent: "重新检查" });
  const managerButton = element("button", { type: "button", textContent: "打开 Codex++ 管理器" });
  const actions = element("div", { className: "cpg-actions" }, [refreshButton, managerButton]);
  const launcher = element("button", { className: "cpg-launcher", type: "button", textContent: "会话保护" });
  body.append(metrics, findings, note);
  panel.append(head, body, actions);
  root.append(panel, launcher);
  document.body.appendChild(root);

  let lastThreadCount = null;
  let checking = false;

  launcher.addEventListener("click", () => {
    panel.classList.toggle("cpg-hidden");
    if (!panel.classList.contains("cpg-hidden")) void refresh();
  });
  refreshButton.addEventListener("click", () => void refresh());
  managerButton.addEventListener("click", async () => {
    try {
      await callBridge("/manager/open", {});
    } catch (error) {
      renderError(error);
    }
  });

  async function refresh() {
    if (checking) return;
    checking = true;
    refreshButton.disabled = true;
    badge.textContent = "检查中";
    badge.dataset.level = "";
    try {
      const status = await callBridge("/provider-guard/status", {});
      if (!status || typeof status !== "object" || !["ok", "warning", "critical"].includes(status.level)) {
        throw new Error(safeText(status && status.message) || "Provider Guard backend is unavailable");
      }
      renderStatus(status && typeof status === "object" ? status : {});
    } catch (error) {
      const fallback = await loadCompatibilityStatus(error).catch(() => null);
      if (fallback) renderStatus(fallback);
      else renderError(error);
    } finally {
      checking = false;
      refreshButton.disabled = false;
    }
  }

  function renderStatus(status) {
    const level = ["ok", "warning", "critical"].includes(status.level) ? status.level : "warning";
    badge.dataset.level = level;
    badge.textContent = level === "ok" ? "安全" : level === "critical" ? "高风险" : "需注意";
    metrics.replaceChildren(
      metric("当前 provider", safeText(status.currentProvider)),
      metric("稳定 provider", safeText(status.stableProvider || "custom")),
      metric("索引会话", safeNumber(status.totalThreads)),
      metric("接口", endpointText(status.endpoint)),
    );

    const items = Array.isArray(status.findings) ? status.findings.slice(0, 20) : [];
    if (lastThreadCount !== null && Number.isFinite(status.totalThreads) && status.totalThreads < lastThreadCount * 0.5) {
      items.unshift({
        code: "thread_count_drop",
        severity: "critical",
        message: `索引会话从 ${lastThreadCount} 降至 ${status.totalThreads}，请暂停切换供应商并在管理器中检查备份。`,
      });
    }
    if (Number.isFinite(status.totalThreads)) lastThreadCount = status.totalThreads;

    findings.replaceChildren();
    if (!items.length) {
      findings.appendChild(element("div", { className: "cpg-safe", textContent: "配置和会话分桶保持稳定。" }));
      return;
    }
    for (const item of items) {
      findings.appendChild(
        element("div", {
          className: "cpg-finding",
          textContent: safeText(item.message),
          dataset: { level: item.severity === "critical" ? "critical" : "warning" },
        }),
      );
    }
  }

  function renderError(error) {
    badge.dataset.level = "critical";
    badge.textContent = "不可用";
    metrics.replaceChildren();
    findings.replaceChildren(
      element("div", {
        className: "cpg-finding",
        textContent: `Provider Guard 后端不可用：${safeText(error && (error.message || error))}。请更新并重启 Codex++。`,
        dataset: { level: "critical" },
      }),
    );
  }

  async function loadCompatibilityStatus(originalError) {
    const [catalog, backend] = await Promise.all([
      callBridge("/codex-model-catalog", {}),
      callBridge("/backend/status", {}).catch(() => ({})),
    ]);
    const currentProvider = safeText(catalog && catalog.model_provider);
    const stable = currentProvider === "custom";
    return {
      level: stable ? "warning" : "critical",
      currentProvider: currentProvider || "unknown",
      stableProvider: "custom",
      totalThreads: null,
      endpoint: { kind: "compatibility", port: null },
      providerBuckets: [],
      findings: [
        {
          code: "compatibility_mode",
          severity: "warning",
          message: `当前 Codex++ ${safeText(backend && backend.version) || "版本"} 尚未提供完整 Provider Guard 后端；现在只检查 model_provider，不读取 SQLite。`,
        },
        ...(stable
          ? []
          : [{
              code: "unstable_current_provider",
              severity: "critical",
              message: `当前 model_provider 为 ${currentProvider || "unknown"}，建议保持为 custom 以避免会话被供应商筛选隐藏。`,
            }]),
        {
          code: "backend_upgrade_required",
          severity: "warning",
          message: `完整会话分桶检查需要升级后的 Codex++ 后端。原始状态接口错误：${safeText(originalError && (originalError.message || originalError))}`,
        },
      ],
    };
  }

  function callBridge(path, payload, timeoutMs = 3000) {
    if (typeof window.__codexSessionDeleteBridge !== "function") {
      return Promise.reject(new Error("Codex++ bridge unavailable"));
    }
    return new Promise((resolve, reject) => {
      const timer = window.setTimeout(() => reject(new Error(`Bridge request timed out: ${path}`)), timeoutMs);
      window.__codexSessionDeleteBridge(path, payload).then(
        (result) => {
          window.clearTimeout(timer);
          resolve(result);
        },
        (error) => {
          window.clearTimeout(timer);
          reject(error);
        },
      );
    });
  }

  function metric(label, value) {
    return element("div", { className: "cpg-metric" }, [
      element("span", { className: "cpg-label", textContent: label }),
      element("span", { className: "cpg-value", textContent: value }),
    ]);
  }

  function endpointText(endpoint) {
    if (!endpoint || typeof endpoint !== "object") return "unknown";
    const kind = safeText(endpoint.kind || "unknown");
    const port = Number.isInteger(endpoint.port) ? `:${endpoint.port}` : "";
    return `${kind}${port}`;
  }

  function safeNumber(value) {
    return Number.isFinite(value) && value >= 0 ? String(Math.trunc(value)) : "-";
  }

  function safeText(value) {
    return typeof value === "string" ? value.slice(0, 500) : String(value ?? "").slice(0, 500);
  }

  function element(tag, props = {}, children = []) {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(props)) {
      if (key === "textContent") node.textContent = safeText(value);
      else if (key === "dataset" && value && typeof value === "object") {
        for (const [dataKey, dataValue] of Object.entries(value)) node.dataset[dataKey] = safeText(dataValue);
      } else if (key === "ariaLabel") node.setAttribute("aria-label", safeText(value));
      else if (key in node) node[key] = value;
    }
    for (const child of children) node.appendChild(child);
    return node;
  }
})();

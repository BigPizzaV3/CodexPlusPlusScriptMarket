// ==UserScript==
// @name Codex 原生导航与中文补全
// @description 开启 Codex 内置侧边栏导航功能，以及启用和补全中文界面；补全跟随应用语言，仅在简体中文界面生效。
// @version 3.2.0
// ==/UserScript==
(() => {
  "use strict";

  const gates = new Set(["3085093835", "4039078146", "800596598", "717035860"]);
  const patched = new Map();
  const edits = new Map();
  const marker = "[data-settings-panel-slug]";
  const excluded = 'pre, code, script, style, textarea, input, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"], [data-codex-plus-ext], [data-message-id], [data-turn-id], [data-codex-composer-root], [data-thread-id], [data-app-action-sidebar-thread-id]';
  // 只补设置界面的已核对漏译，不翻译用户内容，也不接管应用的语言选择。
  const translations = new Map(Object.entries({
    "Archived chats": "已归档聊天",
    "Worktrees": "工作树",
    "Launch at login": "登录时启动",
    "Open Startup Apps": "打开启动应用",
    "Couldn't open Startup Apps": "无法打开启动应用",
    "Startup status unavailable": "无法获取启动状态",
    "Checking startup status…": "正在检查启动状态…",
    "Could not save follow-up behavior": "无法保存跟进处理方式",
    "Dictation unavailable": "听写不可用",
    "Dictation is not available in your current configuration": "当前配置不支持听写",
    "The original Codex companion.": "经典的 Codex 伙伴。",
    "A calm companion for focused workspace days": "陪你专注工作的安静伙伴",
    "Hot path energy for fast iteration.": "为快速迭代注入活力。",
    "A sharp-eyed owl for polished work in a blink.": "眼光敏锐的猫头鹰，助你迅速打磨作品。",
    "A steady rock when the diff gets large.": "改动再多，也有沉稳的磐石相伴。",
    "Small green shoots for new ideas.": "让新想法萌发的绿色嫩芽。",
    "A balanced stack for deep work.": "稳稳堆叠，陪你投入深度工作。",
    "A tiny blue-screen gremlin.": "一只小小的蓝屏精灵。",
    "Quiet signal from the void.": "来自虚空的安静信号。",
    "Mouse Back": "鼠标后退键",
    "Mouse Forward": "鼠标前进键",
    "Build editable figures in draw.io, PowerPoint, or WPS.": "在 draw.io、PowerPoint 或 WPS 中制作可编辑的图形。",
    "Review and manage GitHub pull requests": "审查和管理 GitHub 拉取请求",
    "Create interactive visuals": "创建交互式可视化内容",
  }));
  const panelTranslations = {
    storage: new Map(Object.entries({
      "This device": "此设备",
      "Manage chats and worktrees stored on this computer": "管理存储在此电脑上的聊天和工作树",
      "Refresh": "刷新",
      "Chats": "聊天",
      "Subagents": "子智能体",
      "Unclassified chats": "未分类聊天",
      "Other": "其他",
      "Clean up old chats": "清理旧聊天",
      "Review chats and their subagents before permanently deleting them": "永久删除前审查聊天及其子智能体",
      "Review": "审查",
      "Manage worktrees": "管理工作树",
      "Review working copies and choose how many old worktrees to keep": "查看工作副本并选择保留的旧工作树数量",
      "Manage": "管理",
      "Restore or delete individual archived chats": "恢复或删除单个已归档聊天",
      "Measuring storage": "正在测量存储空间",
      "Updating…": "正在更新…",
      "Couldn't measure storage. Try refreshing.": "无法测量存储空间，请尝试刷新。",
      "This computer": "此电脑",
      "Codex home": "Codex 主目录",
    })),
    "browser-use": new Map(Object.entries({
      "Site tools": "站点工具",
      "Enabled": "已启用",
      "Disabled": "已禁用",
    })),
    "keyboard-shortcuts": new Map(Object.entries({
      "New project": "新建项目",
      "Create a project": "创建项目",
    })),
  };
  const read = (node, key) => key === "text" ? node.nodeValue : node.getAttribute(key);
  const write = (node, key, value) => {
    if (key === "text") node.nodeValue = value;
    else node.setAttribute(key, value);
  };
  const chinese = () => /^zh(?:-cn|-hans(?:-[a-z]+)?)?$/i.test(document.documentElement.lang);
  const restore = () => {
    for (const [node, records] of edits) {
      for (const [key, { original, translated }] of records) {
        // React 或其他脚本已更新的值归宿主管理，不用旧快照覆盖。
        if (read(node, key) === translated) write(node, key, original);
      }
    }
    edits.clear();
  };
  const prune = () => {
    for (const node of edits.keys()) if (!node.isConnected) edits.delete(node);
  };
  let roots = [];
  let frame = 0;
  let stopped = false;
  let enabled = chinese();
  let activePanel = "";
  const pending = new Set();
  const withinSettings = element => roots.some(root => root.contains(element));
  const refreshRoots = () => {
    const entries = [...document.querySelectorAll(marker)];
    // 侧栏项目和设置主内容分处不同区域；仅在设置导航存在时处理主内容。
    roots = entries.length ? [...entries, ...document.querySelectorAll("main")] : [];
  };
  const translateValue = (node, key, element) => {
    const value = read(node, key);
    if (!value) return;
    const word = value.trim();
    if (activePanel !== "storage" && (word === "Worktrees" || word === "Archived chats") &&
        !element.closest(`${marker}, h1, h2, h3`)) return;
    let replacement = translations.get(word);
    if (!replacement) replacement = panelTranslations[activePanel]?.get(word);
    if (!replacement && activePanel === "storage") {
      const usage = word.match(/^([\d.,\s]+(?:B|kB|KB|MB|GB|TB|字节)) used by Codex$/);
      if (usage) replacement = `Codex 已使用 ${usage[1]}`;
      const measured = word.match(/^(.+) measured so far$/);
      if (measured) replacement = `目前已测量 ${measured[1]}`;
      const status = word.match(/^(.+) · (Incomplete|Updating…)$/);
      if (status) replacement = `${status[1]} · ${status[2] === "Incomplete" ? "未完成" : "正在更新…"}`;
    }
    if (!replacement && (word === "On" || word === "Off")) {
      const row = element.closest('[class~="@container/settings-row"]');
      // On/Off 只用于已确认的登录启动行，不能全局替换用户值。
      if (row && /Launch at login|登录时启动/.test(row.textContent)) {
        replacement = word === "On" ? "开启" : "关闭";
      }
    }
    if (!replacement) return;
    const translated = value.replace(word, replacement);
    let records = edits.get(node);
    if (!records) edits.set(node, records = new Map());
    records.set(key, { original: value, translated });
    write(node, key, translated);
  };
  const scan = root => {
    const element = root.nodeType === Node.ELEMENT_NODE ? root : root.parentElement;
    if (!element || !root.isConnected || !withinSettings(element) || element.closest(excluded)) return;
    if (root.nodeType === Node.TEXT_NODE) {
      translateValue(root, "text", element);
      return;
    }
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        return node.nodeType === Node.ELEMENT_NODE && node.matches(excluded)
          ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT;
      },
    });
    const visit = node => {
      if (node.nodeType === Node.TEXT_NODE) translateValue(node, "text", node.parentElement);
      else for (const key of ["aria-label", "title"]) translateValue(node, key, node);
    };
    visit(root);
    while (walker.nextNode()) visit(walker.currentNode);
  };
  const flush = () => {
    frame = 0;
    if (stopped) return;
    prune();
    if (!enabled) { pending.clear(); return; }
    activePanel = document.querySelector(`${marker}[aria-current="page"]`)?.getAttribute("data-settings-panel-slug") || "";
    const nodes = [...pending];
    pending.clear();
    // 父节点已排队时不用重复遍历后代，脚本自己的写入也在 observer 中跳过。
    for (const node of nodes) {
      if (!nodes.some(other => other !== node && other.contains(node))) scan(node);
    }
  };
  const queue = node => {
    pending.add(node);
    if (!frame) frame = requestAnimationFrame(flush);
  };
  const rescan = () => {
    refreshRoots();
    for (const root of roots) queue(root);
  };
  const isOwnEdit = (node, key) => {
    const record = edits.get(node)?.get(key);
    return record && read(node, key) === record.translated;
  };
  const observer = new MutationObserver(records => {
    let structureChanged = false;
    const current = chinese();
    if (current !== enabled) {
      enabled = current;
      restore();
      pending.clear();
      if (enabled) rescan();
    }
    for (const record of records) {
      if (record.type === "attributes" && record.target === document.documentElement) continue;
      if (record.type === "attributes" && record.attributeName === "aria-current" &&
          record.target.matches(marker)) {
        structureChanged = true;
        continue;
      }
      if (record.type === "childList") {
        if (record.removedNodes.length) prune();
        for (const node of record.addedNodes) {
          if (node.nodeType === Node.ELEMENT_NODE && (node.matches(marker) || node.querySelector(marker))) {
            structureChanged = true;
          }
          if (node.nodeType === Node.ELEMENT_NODE && roots.length &&
              (node.matches("main") || node.querySelector("main"))) structureChanged = true;
          if (enabled && withinSettings(node)) queue(node);
        }
        if (roots.some(root => !root.isConnected)) structureChanged = true;
      } else if (enabled) {
        const key = record.type === "characterData" ? "text" : record.attributeName;
        if (!isOwnEdit(record.target, key) && withinSettings(record.target)) queue(record.target);
      }
    }
    if (structureChanged) {
      if (enabled) rescan();
      else refreshRoots();
    }
  });
  observer.observe(document.documentElement, {
    subtree: true, childList: true, characterData: true, attributes: true,
    attributeFilter: ["lang", "aria-label", "title", "aria-current"],
  });
  const notify = client => client.$emt?.({ name: "values_updated", status: "Ready", values: {} });
  const apply = () => {
    const root = window.__STATSIG__;
    if (!root) return;
    for (const client of new Set([root.firstInstance, ...Object.values(root.instances || {})])) {
      if (!client || patched.has(client)) continue;
      const originals = {};
      if (typeof client.getFeatureGate === "function") {
        originals.gate = client.getFeatureGate;
        originals.gateWrapper = function(name, options) {
          const result = originals.gate.call(this, name, options);
          return !stopped && gates.has(String(name))
            ? { ...result, value: true, details: { ...result.details, reason: "LocalOverride" } } : result;
        };
        client.getFeatureGate = originals.gateWrapper;
      }
      if (typeof client.getLayer === "function") {
        originals.layer = client.getLayer;
        originals.layerWrapper = function(name, options) {
          const result = originals.layer.call(this, name, options);
          if (stopped || String(name) !== "72216192") return result;
          return { ...result, get: (key, fallback) =>
            key === "enable_i18n" ? true : result.get(key, fallback) };
        };
        client.getLayer = originals.layerWrapper;
      }
      if (!originals.gate && !originals.layer) continue;
      patched.set(client, originals);
      notify(client);
    }
  };
  rescan();
  apply();
  // 仅检查可能迟到或重建的 Statsig 客户端，不再定时扫描 DOM。
  const interval = setInterval(apply, 3000);
  window.__codexPlusUserScripts.registerCleanup(() => {
    stopped = true;
    clearInterval(interval);
    cancelAnimationFrame(frame);
    observer.disconnect();
    pending.clear();
    restore();
    roots = [];
    for (const [client, originals] of patched) {
      if (client.getFeatureGate === originals.gateWrapper) client.getFeatureGate = originals.gate;
      if (client.getLayer === originals.layerWrapper) client.getLayer = originals.layer;
      notify(client);
    }
    patched.clear();
  });
})();

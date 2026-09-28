// ==UserScript==
// @name         Codex 简体中文界面汉化
// @namespace    codex-plus-plus
// @version      1.0.0
// @description  把 Codex 桌面版界面上的英文文案替换为简体中文（顶部菜单、左侧导航、按钮、工具提示、状态提示）。纯渲染层 DOM 替换，不改动 Codex 任何安装文件，因此不会被 Codex 更新覆盖。
// @author       aliuz
// @match        app://-/*
// @run-at       document-start
// ==/UserScript==

/*
 * 维护说明
 * --------
 * 1. 词条字典在最下方 DICT / PATTERNS 两处，加词只需在此追加，不必改动逻辑。
 * 2. 只替换"整段文本完全等于词条"的节点，不做句内模糊替换，避免把用户消息改坏。
 * 3. 输入框、代码块、可编辑区域、对话正文一律跳过。
 * 4. Codex 官方中文包只覆盖约 209 条（codex.command.* / electron.* / desktop.* 等），
 *    侧栏与主工作区没有条目，所以需要本脚本补齐。
 */

(() => {
  'use strict';

  const VERSION = '1.0.0';
  const STATE_KEY = '__codexZhCnUi__';
  if (window[STATE_KEY]) return;
  window[STATE_KEY] = { version: VERSION };

  // ---------------------------------------------------------------------------
  // 跳过规则
  // ---------------------------------------------------------------------------
  const SKIP_TAGS = new Set([
    'SCRIPT', 'STYLE', 'NOSCRIPT', 'CODE', 'PRE', 'KBD', 'SAMP',
    'SVG', 'PATH', 'CANVAS', 'IFRAME', 'TEXTAREA', 'INPUT', 'SELECT', 'OPTION',
  ]);

  // 属性翻译的跳过集合：输入框/文本域的 placeholder 需要翻译，所以这里不含 INPUT/TEXTAREA
  const SKIP_ATTR_TAGS = new Set([
    'SCRIPT', 'STYLE', 'NOSCRIPT', 'CODE', 'PRE', 'KBD', 'SAMP',
    'SVG', 'PATH', 'CANVAS', 'IFRAME',
  ]);

  const ATTRS = ['aria-label', 'title', 'placeholder', 'data-tooltip', 'alt'];

  const MAX_TEXT_LEN = 60;

  // ---------------------------------------------------------------------------
  // 翻译核心
  // ---------------------------------------------------------------------------
  function translate(raw) {
    if (typeof raw !== 'string') return null;
    const text = raw.replace(/\s+/g, ' ').trim();
    if (!text || text.length > MAX_TEXT_LEN) return null;

    // 已经包含中文的文案不再处理，避免二次翻译和与官方中文包打架
    if (/[\u4e00-\u9fff]/.test(text)) return null;

    if (Object.prototype.hasOwnProperty.call(DICT, text)) {
      return DICT[text];
    }
    for (let i = 0; i < PATTERNS.length; i += 1) {
      const [re, replacement] = PATTERNS[i];
      if (re.test(text)) return text.replace(re, replacement);
    }
    return null;
  }

  function isInsideEditable(el) {
    for (let node = el; node && node.nodeType === 1; node = node.parentElement) {
      if (node.isContentEditable) return true;
      const tag = node.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return true;
    }
    return false;
  }

  function patchTextNode(node) {
    const parent = node.parentElement;
    if (!parent) return;
    if (SKIP_TAGS.has(parent.tagName)) return;
    if (isInsideEditable(parent)) return;

    const next = translate(node.nodeValue);
    if (next !== null && next !== node.nodeValue) {
      node.nodeValue = next;
    }
  }

  function patchAttrs(el) {
    if (!el.getAttribute) return;
    if (SKIP_ATTR_TAGS.has(el.tagName)) return;
    // 属性（aria-label / title / placeholder）只是提示文案，翻译它们不会影响可编辑内容，
    // 所以这里不判断 contenteditable，否则输入框上的提示会漏翻。
    for (let i = 0; i < ATTRS.length; i += 1) {
      const name = ATTRS[i];
      const value = el.getAttribute(name);
      if (!value) continue;
      const next = translate(value);
      if (next !== null && next !== value) {
        el.setAttribute(name, next);
      }
    }
  }

  function patchElement(el) {
    patchAttrs(el);
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, null);
    let current = walker.currentNode;
    while (current) {
      if (current.nodeType === Node.TEXT_NODE) {
        patchTextNode(current);
      } else if (current.nodeType === Node.ELEMENT_NODE) {
        patchAttrs(current);
      }
      current = walker.nextNode();
    }
  }

  // ---------------------------------------------------------------------------
  // 调度：合并同一帧内的多次变更
  // ---------------------------------------------------------------------------
  const queue = new Set();
  let scheduled = false;

  function flush() {
    scheduled = false;
    const items = Array.from(queue);
    queue.clear();
    pause();
    try {
      for (let i = 0; i < items.length; i += 1) {
        const node = items[i];
        if (!node || !node.isConnected) continue;
        if (node.nodeType === Node.TEXT_NODE) patchTextNode(node);
        else if (node.nodeType === Node.ELEMENT_NODE) patchElement(node);
      }
    } finally {
      resume();
    }
  }

  function schedule(node) {
    if (!node) return;
    queue.add(node);
    if (scheduled) return;
    scheduled = true;
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(flush);
    else setTimeout(flush, 16);
  }

  // ---------------------------------------------------------------------------
  // 观察器
  // ---------------------------------------------------------------------------
  let observer = null;

  function pause() {
    if (observer) observer.disconnect();
  }

  function resume() {
    if (!observer) return;
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ATTRS,
    });
  }

  function start() {
    observer = new MutationObserver((records) => {
      for (let i = 0; i < records.length; i += 1) {
        const record = records[i];
        if (record.type === 'characterData') {
          schedule(record.target);
        } else if (record.type === 'attributes') {
          schedule(record.target);
        } else {
          const added = record.addedNodes;
          for (let j = 0; j < added.length; j += 1) schedule(added[j]);
        }
      }
    });

    if (document.documentElement) {
      resume();
      patchElement(document.documentElement);
    } else {
      document.addEventListener('DOMContentLoaded', () => {
        resume();
        patchElement(document.documentElement);
      }, { once: true });
    }
  }

  window.__codexZhCnUiVersion = VERSION;

  // ---------------------------------------------------------------------------
  // 词条字典：整段文本精确匹配
  // ---------------------------------------------------------------------------
  const DICT = Object.freeze({
    // ---- 顶部菜单栏 ----
    'File': '文件',
    'Edit': '编辑',
    'View': '视图',
    'Help': '帮助',
    'Window': '窗口',

    // ---- 左侧导航 ----
    'New chat': '新建对话',
    'New Chat': '新建对话',
    'New thread': '新建对话',
    'Scheduled': '定时任务',
    'Plugins': '插件',
    'Explore': '探索',
    'Projects': '项目',
    'Recents': '最近',
    'Recent': '最近',
    'No projects': '暂无项目',
    'Search': '搜索',
    'Settings': '设置',
    'History': '历史记录',

    // ---- 会话与输入区 ----
    'Send': '发送',
    'Stop': '停止',
    'Full access': '完全访问',
    'Read only': '只读',
    'Low': '低',
    'Medium': '中等',
    'High': '高',
    'Latest response': '最新回复',
    'Reconnecting': '正在重连',
    'Connected': '已连接',
    'Disconnected': '已断开',
    'Loading': '加载中',
    'Loading...': '加载中…',

    // ---- 对话标记 ----
    'You said:': '你说：',
    'ChatGPT said:': 'ChatGPT 说：',
    'Edited files': '已编辑文件',
    'Ran commands': '已执行命令',
    'ran commands': '执行了命令',

    // ---- 通用操作 ----
    'Add': '添加',
    'Remove': '移除',
    'Delete': '删除',
    'Rename': '重命名',
    'Save': '保存',
    'Cancel': '取消',
    'Close': '关闭',
    'Open': '打开',
    'Copy': '复制',
    'Paste': '粘贴',
    'Cut': '剪切',
    'Undo': '撤销',
    'Redo': '重做',
    'Retry': '重试',
    'Refresh': '刷新',
    'Confirm': '确认',
    'Apply': '应用',
    'Reset': '重置',
    'Done': '完成',
    'Next': '下一步',
    'Back': '返回',
    'Previous': '上一步',
    'Continue': '继续',
    'Skip': '跳过',
    'Clear': '清空',
    'Select all': '全选',
    'Yes': '是',
    'No': '否',
    'OK': '确定',

    // ---- 账号 ----
    'Sign in': '登录',
    'Sign out': '退出登录',
    'Sign up': '注册',
    'Log in': '登录',
    'Log out': '退出登录',
    'Account': '账户',
    'Profile': '个人资料',

    // ---- 设置项 ----
    'Appearance': '外观',
    'General': '通用',
    'Light': '浅色',
    'Dark': '深色',
    'System': '跟随系统',
    'Language': '语言',
    'Notifications': '通知',
    'Model': '模型',
    'Permissions': '权限',
    'Advanced': '高级',
    'About': '关于',
    'Version': '版本',

    // ---- 工具提示与无障碍标签 ----
    'Add files and more': '添加文件等',
    'Application menu': '应用菜单',
    'Change permissions': '更改权限',
    'Chat actions': '对话操作',
    'Chat history': '对话历史',
    'Copy message': '复制消息',
    'Do anything': '输入任何内容',
    'Edit message': '编辑消息',
    'Forward': '转发',
    'Hide sidebar': '隐藏侧边栏',
    'Show sidebar': '显示侧边栏',
    'Toggle sidebar': '切换侧边栏',
    'Toggle side panel': '切换侧边面板',
    'Toggle summary': '切换摘要',
    'Open help menu': '打开帮助菜单',
    'Open profile menu': '打开个人资料菜单',
    'Scroll to bottom': '滚动到底部',
    'User messages': '用户消息',
    'Send message': '发送消息',
    'Attach files': '添加附件',
    'More options': '更多选项',
    'New project': '新建项目',
    'Open folder': '打开文件夹',

    // ---- 状态与空态 ----
    'GitHub account source unavailable': 'GitHub 账号源不可用',
    'No results': '无结果',
    'Nothing here yet': '这里还是空的',
    'Search conversations': '搜索对话',
    'Thinking': '思考中',
    'Working': '处理中',

    // ---- 实测补充：来自 Codex 26.924 界面实时抓取 ----
    'Create a file or site': '创建文件或站点',
    'Outputs': '输出',
    'Add new project': '新建项目',
    'Archive chat': '归档对话',
    'Chat sidebar options': '对话侧边栏选项',
    'Project sidebar options': '项目侧边栏选项',
    'Fork chat from here': '从此处派生对话',
    'Pin chat': '固定对话',
    'custom': '自定义',
    'Choose project': '选择项目',
    'Composer utility bar': '输入工具栏',
    'Dictate': '语音输入',
  });

  // ---------------------------------------------------------------------------
  // 词条正则：处理带变量的动态文案
  // ---------------------------------------------------------------------------
  const PATTERNS = [
    [/^Jump to user message (\d+)$/, '跳转到用户消息 $1'],
    [/^Switch mode, current mode: (.+)$/, '切换模式，当前模式：$1'],
    [/^Worked for (.+)$/, '已工作 $1'],
    [/^(\d+) files? changed$/, '$1 个文件已更改'],
    [/^Edited files\s*ran commands$/i, '已编辑文件并执行命令'],
  ];

  // 字典与正则定义完成后再启动，避免 const 暂时性死区
  start();
})();

// ==UserScript==
// @name         Codex RTL Text
// @description  让阿拉伯语、希伯来语、波斯语等从右往左书写的文字在对话和输入框里按段落自动右对齐；代码保持从左往右。
// @version      0.1.0
// ==/UserScript==
(() => {
  "use strict";
  if (window.top && window.self && window.top !== window.self) return;

  const API_KEY = "__codexPlusRtlText";
  const STYLE_ID = "codex-plus-rtl-text-style";
  // 自己加的 dir 属性打标记，停用时只撤自己加的，不动页面原有的 dir。
  const MARK_ATTR = "data-codex-plus-rtl-dir";

  window[API_KEY]?.destroy?.();

  // 对话里的每一轮、用户气泡、输入框（ProseMirror）。
  const SCOPES = ["[data-content-search-unit-key]", "[data-user-message-bubble]", ".ProseMirror"];
  const within = (selector) => SCOPES.map((scope) => `${scope} ${selector}`).join(",\n");
  const BLOCKS = ":is(p, li, h1, h2, h3, h4, h5, h6, blockquote, td, th, dd, dt, figcaption)";

  // unicode-bidi: plaintext 让每个段落按自己的第一个强方向字符决定方向，
  // 中英文段落保持原样，RTL 段落自动从右往左并靠右对齐。
  const CSS = `
${within(BLOCKS)},
[data-user-message-bubble] {
  unicode-bidi: plaintext;
  text-align: start;
}
${within("pre")} {
  direction: ltr;
  unicode-bidi: isolate;
  text-align: left;
}
${within("code")} {
  unicode-bidi: isolate;
}
`;

  // 列表符号和表格列顺序由容器的 direction 决定，CSS 的 plaintext 管不到，
  // 这里给列表与表格补 dir="auto"：按内容第一个强方向字符决定整块方向。
  const CONTAINERS = within(":is(ul, ol, table)");

  let frame = 0;
  let stopped = false;

  function markContainers(root) {
    if (stopped || !root || root.nodeType !== Node.ELEMENT_NODE) return;
    const nodes = root.matches(CONTAINERS) ? [root] : [];
    nodes.push(...root.querySelectorAll(CONTAINERS));
    for (const node of nodes) {
      if (node.hasAttribute("dir") || node.closest("pre")) continue;
      node.setAttribute("dir", "auto");
      node.setAttribute(MARK_ATTR, "");
    }
  }

  const pending = new Set();
  function flush() {
    frame = 0;
    const roots = [...pending];
    pending.clear();
    for (const root of roots) {
      if (root.isConnected) markContainers(root);
    }
  }

  const observer = new MutationObserver((records) => {
    for (const record of records) {
      for (const node of record.addedNodes) {
        if (node.nodeType === Node.ELEMENT_NODE) pending.add(node);
      }
    }
    if (pending.size && !frame) frame = requestAnimationFrame(flush);
  });

  function install() {
    if (!document.getElementById(STYLE_ID)) {
      const style = document.createElement("style");
      style.id = STYLE_ID;
      style.dataset.codexPlusExt = "rtl-text";
      style.textContent = CSS;
      (document.head || document.documentElement).appendChild(style);
    }
    if (document.body) {
      markContainers(document.body);
      observer.observe(document.body, { childList: true, subtree: true });
    }
  }

  function destroy() {
    stopped = true;
    observer.disconnect();
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    pending.clear();
    document.getElementById(STYLE_ID)?.remove();
    for (const node of document.querySelectorAll(`[${MARK_ATTR}]`)) {
      node.removeAttribute("dir");
      node.removeAttribute(MARK_ATTR);
    }
    if (window[API_KEY]?.destroy === destroy) delete window[API_KEY];
  }

  window[API_KEY] = { destroy, version: "0.1.0" };
  window.__codexPlusUserScripts?.registerCleanup?.(destroy);

  if (document.body) install();
  else document.addEventListener("DOMContentLoaded", install, { once: true });
})();

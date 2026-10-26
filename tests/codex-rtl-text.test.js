"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "../scripts/codex-rtl-text.js"), "utf8");

// 最小 DOM：只覆盖脚本用到的接口，验证样式注入、列表打标与停用清理。
function createDom() {
  const ELEMENT_NODE = 1;
  class Element {
    constructor(tag, attrs = {}) {
      this.tagName = tag.toUpperCase();
      this.nodeType = ELEMENT_NODE;
      this.attrs = { ...attrs };
      this.children = [];
      this.dataset = {};
      this.parent = null;
      this.isConnected = true;
    }
    get id() { return this.attrs.id || ""; }
    set id(value) { this.attrs.id = value; }
    hasAttribute(name) { return name in this.attrs; }
    getAttribute(name) { return name in this.attrs ? this.attrs[name] : null; }
    setAttribute(name, value) { this.attrs[name] = String(value); }
    removeAttribute(name) { delete this.attrs[name]; }
    appendChild(node) { node.parent = this; this.children.push(node); return node; }
    remove() { if (this.parent) this.parent.children = this.parent.children.filter((n) => n !== this); }
    descendants() { return this.children.flatMap((c) => [c, ...c.descendants()]); }
    closest(selector) {
      for (let node = this; node; node = node.parent) if (node.matchesSimple(selector)) return node;
      return null;
    }
    matchesSimple(selector) { return selector === this.tagName.toLowerCase(); }
    // 列表 / 表格且位于对话范围内才算命中 CONTAINERS。
    matches(selector) {
      if (/^\[[^\]\s]+\]$/.test(selector)) return this.hasAttribute(selector.slice(1, -1));
      const tag = this.tagName.toLowerCase();
      if (!["ul", "ol", "table"].includes(tag)) return false;
      for (let node = this.parent; node; node = node.parent) {
        if (node.hasAttribute("data-content-search-unit-key")) return true;
      }
      return false;
    }
    querySelectorAll(selector) { return this.descendants().filter((n) => n.matches(selector)); }
  }
  const html = new Element("html");
  const head = html.appendChild(new Element("head"));
  const body = html.appendChild(new Element("body"));
  const document = {
    documentElement: html, head, body,
    createElement: (tag) => new Element(tag),
    getElementById: (id) => html.descendants().find((n) => n.id === id) || null,
    querySelectorAll: (selector) => html.querySelectorAll(selector),
    addEventListener() {},
  };
  return { Element, document, body, ELEMENT_NODE };
}

test("注入限定在对话与输入框范围内的样式，并给列表补 dir=auto", () => {
  const { Element, document, body, ELEMENT_NODE } = createDom();
  const turn = body.appendChild(new Element("div", { "data-content-search-unit-key": "a1" }));
  const list = turn.appendChild(new Element("ul"));
  const ownDir = turn.appendChild(new Element("ol", { dir: "ltr" }));
  const outside = body.appendChild(new Element("ul"));
  const cleanups = [];
  const window = { __codexPlusUserScripts: { registerCleanup: (fn) => cleanups.push(fn) } };
  window.top = window;
  window.self = window;
  class MutationObserver { observe() {} disconnect() {} }
  vm.runInNewContext(source, {
    window, document, MutationObserver, Node: { ELEMENT_NODE },
    requestAnimationFrame: () => 1, cancelAnimationFrame() {},
  });

  const style = document.getElementById("codex-plus-rtl-text-style");
  assert.ok(style, "style should be injected");
  assert.equal(style.dataset.codexPlusExt, "rtl-text");
  assert.match(style.textContent, /unicode-bidi: plaintext/);
  // 每条选择器都必须落在对话 / 气泡 / 输入框范围内，不能影响整个界面。
  const splitTopLevel = (text) => {
    const parts = [];
    let depth = 0;
    let current = "";
    for (const char of text) {
      if (char === "(") depth += 1;
      if (char === ")") depth -= 1;
      if (char === "," && depth === 0) { parts.push(current); current = ""; } else current += char;
    }
    return [...parts, current];
  };
  const selectors = style.textContent.split("{").slice(0, -1).flatMap((block) => splitTopLevel(block.split("}").pop()));
  for (const selector of selectors.map((s) => s.trim()).filter(Boolean)) {
    assert.match(selector, /^(\[data-content-search-unit-key\]|\[data-user-message-bubble\]|\.ProseMirror)/, selector);
  }

  assert.equal(list.getAttribute("dir"), "auto");
  assert.equal(ownDir.getAttribute("dir"), "ltr", "existing dir is kept");
  assert.equal(outside.getAttribute("dir"), null, "lists outside the thread are untouched");

  assert.equal(cleanups.length, 1);
  cleanups[0]();
  assert.equal(document.getElementById("codex-plus-rtl-text-style"), null);
  assert.equal(list.getAttribute("dir"), null);
  assert.equal(ownDir.getAttribute("dir"), "ltr");
  assert.equal(window.__codexPlusRtlText, undefined);
});

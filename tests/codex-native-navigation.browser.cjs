"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");
const source = fs.readFileSync(path.join(__dirname, "../scripts/codex-native-navigation.js"), "utf8");

(async () => {
  const browser = await chromium.launch({ channel: "msedge", headless: true });
  try {
    const page = await browser.newPage();
    await page.route("http://navigation.test/**", route => route.fulfill({
      contentType: "text/html; charset=utf-8",
      body: `<html lang="zh-CN"><body>
        <aside><button data-settings-panel-slug="archived-chats" aria-label="Archived chats">Archived chats</button></aside>
        <main><h1>Worktrees</h1><div class="@container/settings-row"><span>Launch at login</span><small>Off</small><button>Open Startup Apps</button></div>
        <span id="spaces">  Mouse Back  </span><span id="dynamic">Worktrees</span><p id="chat-title">Worktrees</p>
        <input value="Worktrees"><textarea>Worktrees</textarea><pre>Worktrees</pre><code>Worktrees</code>
        <div contenteditable><span>Worktrees</span></div><select><option>Worktrees</option></select>
        <div data-codex-plus-ext><span>Worktrees</span></div><span id="official">官方中文</span></main>
        <article id="chat">Worktrees</article><span id="outside" title="Mouse Back">Archived chats</span>
      </body></html>`,
    }));
    await page.goto("http://navigation.test/");
    await page.evaluate(() => {
      window.cleanup = [];
      window.__codexPlusUserScripts = { registerCleanup: fn => cleanup.push(fn) };
      const client = {
        getFeatureGate(name) { return { value: false, name }; },
        getLayer(name) { return { name, get: (key, fallback) => ({ enable_i18n: false, locale_source: "FIRST_AVAILABLE", other: "preserved" })[key] ?? fallback }; },
        $emt() {},
      };
      window.originalGate = client.getFeatureGate;
      window.originalLayer = client.getLayer;
      window.__STATSIG__ = { firstInstance: client, instances: { one: client } };
      window.walks = 0;
      const create = document.createTreeWalker.bind(document);
      document.createTreeWalker = (...args) => { walks++; return create(...args); };
      window.intervalCallbacks = [];
      window.setInterval = fn => { intervalCallbacks.push(fn); return intervalCallbacks.length; };
    });
    await page.evaluate(source);
    await page.waitForFunction(() => document.querySelector("h1").textContent === "工作树");
    assert.equal(await page.locator("[data-settings-panel-slug]").getAttribute("aria-label"), "已归档聊天");
    assert.equal(await page.locator("small").innerText(), "关闭");
    assert.equal(await page.locator("#spaces").textContent(), "  鼠标后退键  ");
    assert.equal(await page.locator("#chat").innerText(), "Worktrees");
    assert.equal(await page.locator("#chat-title").innerText(), "Worktrees", "user titles are not settings headings");
    assert.equal(await page.locator("#outside").getAttribute("title"), "Mouse Back");
    for (const selector of ["textarea", "pre", "code", "[contenteditable]", "select", "[data-codex-plus-ext]"]) {
      assert.equal(await page.locator(selector).textContent(), "Worktrees", selector);
    }
    assert.equal(await page.locator("input").inputValue(), "Worktrees");
    assert.deepEqual(await page.evaluate(() => {
      const c = __STATSIG__.firstInstance;
      return [c.getFeatureGate("3085093835").value, c.getFeatureGate("unrelated").value,
        c.getLayer("72216192").get("enable_i18n"), c.getLayer("72216192").get("locale_source"),
        c.getLayer("72216192").get("other"), c.getLayer("other").get("enable_i18n")];
    }), [true, false, true, "FIRST_AVAILABLE", "preserved", false]);

    await page.evaluate(() => { document.documentElement.lang = "en-US"; });
    await page.waitForFunction(() => document.querySelector("h1").textContent === "Worktrees");
    assert.equal(await page.locator("small").innerText(), "Off");
    assert.equal(await page.locator("#official").innerText(), "官方中文");
    assert.equal(await page.locator("[data-settings-panel-slug]").getAttribute("aria-label"), "Archived chats");
    await page.evaluate(() => {
      document.querySelector("#dynamic").textContent = "Launch at login";
      document.querySelector("main").insertAdjacentHTML("beforeend", '<h2 id="late">Archived chats</h2>');
    });
    await page.waitForTimeout(80);
    assert.equal(await page.locator("#late").innerText(), "Archived chats");
    await page.evaluate(() => { document.documentElement.lang = "zh-TW"; });
    await page.waitForTimeout(80);
    assert.equal(await page.locator("#late").innerText(), "Archived chats", "do not inject simplified Chinese into traditional Chinese");
    await page.evaluate(() => { document.documentElement.lang = "zh-Hans"; });
    await page.waitForFunction(() => document.querySelector("#late").textContent === "已归档聊天");
    await page.evaluate(() => {
      const text = document.querySelector("#dynamic").firstChild;
      text.nodeValue = "Mouse Forward";
      document.querySelector("#late").setAttribute("title", "Mouse Back");
    });
    await page.waitForFunction(() => document.querySelector("#dynamic").textContent === "鼠标前进键");
    await page.waitForFunction(() => document.querySelector("#late").title === "鼠标后退键");
    await page.evaluate(() => {
      const entry = document.querySelector("[data-settings-panel-slug]");
      entry.setAttribute("data-settings-panel-slug", "storage");
      entry.setAttribute("aria-current", "page");
      document.querySelector("main").insertAdjacentHTML("beforeend",
        '<section id="storage"><h2>This device</h2><p>476 MB used by Codex</p><button>Refresh</button><span>Subagents</span></section>');
    });
    await page.waitForFunction(() => document.querySelector("#storage p").textContent === "Codex 已使用 476 MB");
    assert.equal(await page.locator("#storage button").innerText(), "刷新");
    await page.evaluate(() => {
      document.querySelector("[data-settings-panel-slug]").setAttribute("data-settings-panel-slug", "browser-use");
      document.querySelector("main").insertAdjacentHTML("beforeend", '<section id="site"><h2>Site tools</h2><span>Enabled</span></section>');
    });
    await page.waitForFunction(() => document.querySelector("#site span").textContent === "已启用");
    await page.evaluate(() => {
      document.querySelector("main").insertAdjacentHTML("beforeend", '<span id="zero">0字节 used by Codex</span>');
    });
    await page.waitForTimeout(80);
    assert.equal(await page.locator("#zero").innerText(), "0字节 used by Codex");
    await page.evaluate(() => {
      const entry = document.querySelector("[data-settings-panel-slug]");
      entry.removeAttribute("aria-current");
      entry.setAttribute("data-settings-panel-slug", "storage");
      entry.setAttribute("aria-current", "page");
    });
    await page.waitForFunction(() => document.querySelector("#zero").textContent === "Codex 已使用 0字节");

    // 无关聊天变化和 Statsig 重试不能触发设置全文遍历。
    await page.waitForTimeout(100);
    const walks = await page.evaluate(() => window.walks);
    await page.evaluate(() => {
      for (let i = 0; i < 1000; i++) document.querySelector("#chat").append(document.createTextNode("Worktrees"));
      for (let i = 0; i < 10; i++) intervalCallbacks.forEach(fn => fn());
    });
    await page.waitForTimeout(100);
    assert.equal(await page.evaluate(() => window.walks), walks);
    await page.evaluate(() => { document.querySelector("#dynamic").firstChild.nodeValue = "宿主新值"; });
    await page.waitForTimeout(80);
    await page.evaluate(() => cleanup.forEach(fn => fn()));
    assert.equal(await page.locator("#dynamic").innerText(), "宿主新值");
    assert.equal(await page.locator("#late").innerText(), "Archived chats");
    assert.equal(await page.locator("#late").getAttribute("title"), "Mouse Back");
    assert.equal(await page.evaluate(() => __STATSIG__.firstInstance.getFeatureGate === originalGate &&
      __STATSIG__.firstInstance.getLayer === originalLayer), true);
    console.log("PASS: locale switches, reversible text/attributes, native config, protected content, storage/browser labels, dynamic updates, no idle/chat scans, cleanup");
    await page.close();
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });

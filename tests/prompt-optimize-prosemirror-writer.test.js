"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const scriptPath = path.join(__dirname, "..", "scripts", "prompt-optimize.js");

function extractFunction(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `${name} was not found`);

  return extractFunctionAt(source, start);
}

function extractFunctionAt(source, start, bodyStart = source.indexOf("{", start)) {
  let depth = 0;
  let quote = null;
  let escaped = false;
  let lineComment = false;
  let blockComment = false;
  let regex = false;
  let regexClass = false;

  for (let index = bodyStart; index < source.length; index += 1) {
    const char = source[index];
    const next = source[index + 1];

    if (lineComment) {
      if (char === "\n") lineComment = false;
      continue;
    }
    if (blockComment) {
      if (char === "*" && next === "/") {
        blockComment = false;
        index += 1;
      }
      continue;
    }
    if (regex) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === "[") {
        regexClass = true;
      } else if (char === "]") {
        regexClass = false;
      } else if (char === "/" && !regexClass) {
        regex = false;
      }
      continue;
    }
    if (quote) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === quote) {
        quote = null;
      }
      continue;
    }
    if (char === "/" && next === "/") {
      lineComment = true;
      index += 1;
      continue;
    }
    if (char === "/" && next === "*") {
      blockComment = true;
      index += 1;
      continue;
    }
    if (char === "/") {
      const prefix = source.slice(bodyStart, index).trimEnd();
      const previous = prefix[prefix.length - 1] || "";
      if (!previous || /[({[=,:;!&|?]/.test(previous)) {
        regex = true;
        regexClass = false;
        continue;
      }
    }
    if (char === '"' || char === "'" || char === "`") {
      quote = char;
      continue;
    }
    if (char === "{") depth += 1;
    if (char === "}") depth -= 1;
    if (depth === 0) return source.slice(start, index + 1);
  }
  throw new Error("Could not extract function body");
}

function extractAsyncFunction(source, name) {
  const start = source.indexOf(`async function ${name}(`);
  assert.notEqual(start, -1, `${name} was not found`);
  const parametersEnd = source.indexOf(")", start);
  assert.notEqual(parametersEnd, -1, `${name} parameters were not closed`);
  return extractFunctionAt(source, start, source.indexOf("{", parametersEnd));
}

function createWriter(execCommandResults) {
  const source = fs.readFileSync(scriptPath, "utf8");
  const functionSource = extractFunction(source, "writeComposerText");
  const calls = [];

  class HTMLElement {
    constructor() {
      this.isConnected = true;
      this.dispatchCount = 0;
    }

    focus() {}
  }

  class HTMLTextAreaElement extends HTMLElement {}
  class HTMLInputElement extends HTMLElement {}
  const input = new HTMLElement();
  const context = {
    HTMLElement,
    HTMLInputElement,
    HTMLTextAreaElement,
    document: {
      createRange() {
        return { selectNodeContents() {} };
      },
      execCommand(command, _showUi, value) {
        calls.push({ command, value });
        return execCommandResults[command];
      },
    },
    dispatchInputEvents(element) {
      element.dispatchCount += 1;
    },
    findComposerInput() {
      return input;
    },
    normalizeText(value) {
      return String(value);
    },
    runtime: { writeToken: 0 },
    window: {
      getSelection() {
        return { addRange() {}, removeAllRanges() {} };
      },
    },
  };
  const writer = vm.runInNewContext(`(${functionSource})`, context);
  return { calls, input, writer };
}

test("ProseMirror writer tries insertText when selectAll reports false", () => {
  const { calls, input, writer } = createWriter({ insertText: true, selectAll: false });

  const result = writer("optimized prompt", input);

  assert.equal(result.ok, true);
  assert.deepEqual(calls.map(({ command }) => command), ["selectAll", "insertText"]);
  assert.equal(input.dispatchCount, 1);
});

test("ProseMirror writer does not claim success when insertText fails", () => {
  const { calls, input, writer } = createWriter({ insertText: false, selectAll: false });

  const result = writer("optimized prompt", input);

  assert.equal(result.ok, false);
  assert.equal(result.reason, "editor-write-unsupported");
  assert.deepEqual(calls.map(({ command }) => command), ["selectAll", "insertText"]);
  assert.equal(input.dispatchCount, 0);
});

test("reinjection preserves an active optimizer instead of cancelling it", () => {
  const source = fs.readFileSync(scriptPath, "utf8");
  const calls = { destroy: 0, ensure: 0 };
  const existing = {
    isOptimizing: () => true,
    destroy() {
      calls.destroy += 1;
    },
    ensure() {
      calls.ensure += 1;
    },
  };
  const context = { window: { __codexPlusPromptOptimize: existing } };

  vm.runInNewContext(source, context);

  assert.equal(calls.ensure, 1);
  assert.equal(calls.destroy, 0);
  assert.equal(context.window.__codexPlusPromptOptimize, existing);
});

test("same-version reinjection reuses an idle optimizer without rebuilding it", () => {
  const source = fs.readFileSync(scriptPath, "utf8");
  const revision = source.match(/const INSTANCE_REVISION = "([^"]+)"/)[1];
  const calls = { destroy: 0, ensure: 0 };
  const existing = {
    version: "1.0.3",
    instanceRevision: revision,
    isOptimizing: () => false,
    destroy() {
      calls.destroy += 1;
    },
    ensure() {
      calls.ensure += 1;
    },
  };
  const context = { window: { __codexPlusPromptOptimize: existing } };

  vm.runInNewContext(source, context);

  assert.equal(calls.ensure, 1);
  assert.equal(calls.destroy, 0);
  assert.equal(context.window.__codexPlusPromptOptimize, existing);
});

test("release revision isolates its DOM ownership from legacy selectors", () => {
  const source = fs.readFileSync(scriptPath, "utf8");

  assert.match(source, /version:\s*1\.0\.5/);
  assert.match(source, /const SCRIPT_VERSION = "1\.0\.5"/);
  assert.match(source, /const OWNER_TOKEN = "v1-0-5-anchor-follow"/);
  assert.match(source, /const BUTTON_ATTR = `data-codex-prompt-optimize-\$\{OWNER_TOKEN\}`/);
  assert.match(source, /const STYLE_ID = `codex-plus-prompt-optimize-style-\$\{OWNER_TOKEN\}`/);
  assert.doesNotMatch(source, /Node\.prototype/);
  assert.doesNotMatch(source, /insertBefore/);
});

test("market index lists the released script version and checksum", () => {
  const source = fs.readFileSync(scriptPath);
  const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "index.json"), "utf8"));
  const entry = manifest.scripts.find((script) => script.id === "prompt-optimize");

  assert.equal(entry.version, "1.0.5");
  assert.equal(entry.sha256, require("node:crypto").createHash("sha256").update(source).digest("hex"));
});

test("anchor revision repositions after a resize without leaving a global listener", () => {
  const source = fs.readFileSync(scriptPath, "utf8");

  assert.match(source, /window\.addEventListener\("resize", runtime\.resizeHandler\)/);
  assert.match(source, /window\.removeEventListener\("resize", runtime\.resizeHandler\)/);
  assert.match(source, /runtime\.resizeHandler = \(\) => scheduleEnsure\(\)/);
  assert.match(source, /function anchorButtonToModel\(button, modelItem, strategy\)/);
  assert.match(source, /const nextLeft = `\$\{left\}px`/);
  assert.match(source, /const nextTop = `\$\{Math\.round\(modelRect\.top \+ \(modelRect\.height - height\) \/ 2\)\}px`/);
});

function createAnchorFollower() {
  const source = fs.readFileSync(scriptPath, "utf8");
  const frames = [];
  const calls = { ensure: 0 };

  class HTMLElement {}
  const host = new HTMLElement();
  host.style = { left: "auto", top: "auto", right: "18px", bottom: "18px" };
  host.hasAttribute = () => true;
  const button = {
    isConnected: true,
    parentElement: host,
    getBoundingClientRect: () => ({ width: 28, height: 28 }),
  };
  const modelRect = { left: 660, top: 225, width: 120, height: 28 };
  const modelItem = { isConnected: true, getBoundingClientRect: () => ({ ...modelRect }) };
  const runtime = { disposed: false, repositionFrame: 0, anchor: { button, modelItem } };
  const context = {
    HTMLElement,
    FLOAT_HOST_ATTR: "data-float",
    runtime,
    ensureSparkleButton() {
      calls.ensure += 1;
    },
    window: {
      requestAnimationFrame(callback) {
        frames.push(callback);
        return frames.length;
      },
    },
  };
  const names = ["positionAnchorHost", "scheduleReposition", "repositionAnchoredButton"];
  const fns = vm.runInNewContext(
    `${names.map((name) => extractFunction(source, name)).join("\n")}\n({ ${names.join(", ")} })`,
    context,
  );
  const flush = () => {
    let count = 0;
    while (frames.length && count < 20) {
      frames.shift()();
      count += 1;
    }
    return count;
  };
  return { calls, flush, fns, host, modelItem, modelRect, runtime };
}

test("anchored ✨ follows the model chip on the next frame when the composer shifts (#3199)", () => {
  const { calls, flush, fns, host, modelRect } = createAnchorFollower();

  fns.scheduleReposition();
  flush();
  assert.equal(host.style.left, "630px");
  assert.equal(host.style.top, "225px");

  // Composer moves up 6px while the transcript keeps streaming.
  modelRect.top = 219;
  fns.scheduleReposition();
  fns.scheduleReposition();
  const frameCount = flush();
  assert.equal(host.style.top, "219px");
  // One frame for the move plus one confirming the position settled.
  assert.equal(frameCount, 2);
  assert.equal(calls.ensure, 0);
});

test("anchor follower falls back to a full ensure when the model chip is replaced", () => {
  const { calls, flush, fns, modelItem, runtime } = createAnchorFollower();

  modelItem.isConnected = false;
  fns.scheduleReposition();
  flush();
  assert.equal(calls.ensure, 1);
  assert.equal(runtime.anchor, null);
});

test("continuous mutations cannot postpone the full ensure past the max wait", () => {
  const source = fs.readFileSync(scriptPath, "utf8");
  const timers = new Map();
  let now = 0;
  let nextId = 1;
  const calls = { ensure: 0, reposition: 0 };
  const context = {
    Date: { now: () => now },
    Math,
    MUTATION_DEBOUNCE_MS: 120,
    MUTATION_MAX_WAIT_MS: 500,
    runtime: { disposed: false, mutationTimer: 0, mutationFirstAt: 0 },
    ensureSparkleButton() {
      calls.ensure += 1;
    },
    maybeDetachOnEdit() {},
    scheduleReposition() {
      calls.reposition += 1;
    },
    window: {
      setTimeout(callback, delay) {
        const id = nextId++;
        timers.set(id, { at: now + delay, callback });
        return id;
      },
      clearTimeout(id) {
        timers.delete(id);
      },
    },
  };
  const scheduleEnsure = vm.runInNewContext(`(${extractFunction(source, "scheduleEnsure")})`, context);
  const advanceTo = (time) => {
    for (;;) {
      const due = [...timers].filter(([, timer]) => timer.at <= time).sort((a, b) => a[1].at - b[1].at)[0];
      if (!due) break;
      timers.delete(due[0]);
      now = due[1].at;
      due[1].callback();
    }
    now = time;
  };

  // A mutation every 50ms for 2s, as while a reply streams.
  for (let time = 0; time < 2000; time += 50) {
    advanceTo(time);
    scheduleEnsure();
  }
  advanceTo(2000);

  assert.ok(calls.ensure >= 3, `expected the max wait to force ensures, got ${calls.ensure}`);
  assert.equal(calls.reposition, 40);
});

test("right-click stays local and opens the settings panel without optimizing", () => {
  const source = fs.readFileSync(scriptPath, "utf8");
  const functionSource = extractFunction(source, "onButtonContextMenu");
  const calls = { preventDefault: 0, stopPropagation: 0, openSettings: 0 };
  const onButtonContextMenu = vm.runInNewContext(`(${functionSource})`, {
    openSettingsPanel() {
      calls.openSettings += 1;
    },
  });

  onButtonContextMenu({
    preventDefault() {
      calls.preventDefault += 1;
    },
    stopPropagation() {
      calls.stopPropagation += 1;
    },
  });

  assert.deepEqual(calls, { preventDefault: 1, stopPropagation: 1, openSettings: 1 });
});

test("LLM Bridge is preferred over the legacy native fetch envelope", async () => {
  const source = fs.readFileSync(scriptPath, "utf8");
  const functionSource = extractAsyncFunction(source, "requestJson");
  const calls = { native: 0, bridge: 0 };
  const requestJson = vm.runInNewContext(`(${functionSource})`, {
    hasElectronFetchBridge: () => true,
    electronFetchJson: async (options) => {
      calls.native += 1;
      return { transport: "native", options };
    },
    hasCodexPlusBridge: () => true,
    requestJsonViaCodexBridge: async () => {
      calls.bridge += 1;
      return { transport: "bridge" };
    },
  });

  const result = await requestJson({ upstreamUrl: "https://example.invalid/v1/chat/completions" });

  assert.equal(result.transport, "bridge");
  assert.equal(calls.native, 0);
  assert.equal(calls.bridge, 1);
});

test("native fetch remains a fallback when the LLM Bridge route is unsupported", async () => {
  const source = fs.readFileSync(scriptPath, "utf8");
  const functionSource = extractAsyncFunction(source, "requestJson");
  const calls = { native: 0, bridge: 0 };
  const requestJson = vm.runInNewContext(`(${functionSource})`, {
    hasElectronFetchBridge: () => true,
    electronFetchJson: async () => {
      calls.native += 1;
      return { transport: "native" };
    },
    hasCodexPlusBridge: () => true,
    isBridgeUnsupportedError(error) {
      return error?.code === "CPO_BRIDGE_UNSUPPORTED";
    },
    debugLog() {},
    requestJsonViaCodexBridge: async () => {
      calls.bridge += 1;
      const error = new Error("当前 Codex++ 的 LLM Bridge 路由不可用");
      error.code = "CPO_BRIDGE_UNSUPPORTED";
      throw error;
    },
  });

  const result = await requestJson({ upstreamUrl: "https://example.invalid/v1/chat/completions" });

  assert.equal(result.transport, "native");
  assert.equal(calls.native, 1);
  assert.equal(calls.bridge, 1);
});

test("native fetch service rejection is surfaced when no bridge is available", async () => {
  const source = fs.readFileSync(scriptPath, "utf8");
  const functionSource = extractAsyncFunction(source, "requestJson");
  const calls = { native: 0, bridge: 0 };
  const requestJson = vm.runInNewContext(`(${functionSource})`, {
    hasElectronFetchBridge: () => true,
    electronFetchJson: async () => {
      calls.native += 1;
      throw new Error("Error invoking remote method: HTTP requests must use the HTTP fetch service.");
    },
    hasCodexPlusBridge: () => false,
  });

  await assert.rejects(
    requestJson({ upstreamUrl: "https://example.invalid/v1/chat/completions" }),
    /HTTP requests must use the HTTP fetch service/,
  );
  assert.equal(calls.native, 1);
  assert.equal(calls.bridge, 0);
});

test("LLM bridge errors redact bearer tokens before display", async () => {
  const source = fs.readFileSync(scriptPath, "utf8");
  const responseErrorMessage = vm.runInNewContext(`(${extractFunction(source, "responseErrorMessage")})`, {
    collapseWs(value) {
      return String(value || "").replace(/\s+/g, " ").trim();
    },
  });
  const functionSource = extractAsyncFunction(source, "requestJsonViaCodexBridge");
  const requestJsonViaCodexBridge = vm.runInNewContext(`(${functionSource})`, {
    normalizeBaseUrl(value) {
      return value;
    },
    debugLog() {},
    REQUEST_TIMEOUT_MS: 60_000,
    bridgeJson: async () => ({
      status: "failed",
      message: "Authorization: Bearer secret-value token=also-secret",
    }),
    responseErrorMessage,
  });

  await assert.rejects(
    requestJsonViaCodexBridge({ upstreamUrl: "https://example.invalid/v1/chat/completions" }),
    (error) => {
      assert.match(error.message, /Authorization=\[REDACTED\]|Bearer \[REDACTED\]/i);
      assert.match(error.message, /token=\[REDACTED\]/i);
      assert.doesNotMatch(error.message, /secret-value|also-secret/);
      return true;
    },
  );
});

test("upstream error messages redact bearer tokens before display", () => {
  const source = fs.readFileSync(scriptPath, "utf8");
  const functionSource = extractFunction(source, "responseErrorMessage");
  const responseErrorMessage = vm.runInNewContext(`(${functionSource})`, {
    collapseWs(value) {
      return String(value || "").replace(/\s+/g, " ").trim();
    },
  });

  const message = responseErrorMessage('{"error":{"message":"Authorization: Bearer secret-value token=also-secret"}}', "fallback");

  assert.match(message, /Authorization=\[REDACTED\]|Bearer \[REDACTED\]/i);
  assert.match(message, /token=\[REDACTED\]/i);
  assert.doesNotMatch(message, /secret-value|also-secret/);
});

test("optimization uses a bounded timeout and gives immediate plus slow-request feedback", () => {
  const source = fs.readFileSync(scriptPath, "utf8");

  assert.match(source, /const REQUEST_TIMEOUT_MS = 120000/);
  assert.match(source, /const SLOW_REQUEST_NOTICE_MS = 15000/);
  assert.match(source, /const VERY_SLOW_REQUEST_NOTICE_MS = 45000/);
  assert.match(source, /const LONG_REQUEST_NOTICE_MS = 90000/);
  assert.match(source, /runtime\.loading = true;\s+refreshButtonAppearance\(\);\s+showToast\("正在优化，可再次点击取消", "info"\);/);
  assert.match(source, /仍在等待 gpt-5\.5 响应，可再次点击取消/);
  assert.match(source, /gpt-5\.5 响应较慢，仍可再次点击取消/);
});

test("write verification rechecks the current composer after ProseMirror replaces the node", () => {
  const source = fs.readFileSync(scriptPath, "utf8");

  assert.match(source, /const verificationInput =/);
  assert.match(source, /result\.input\.isConnected/);
  assert.match(source, /findComposerInput\(\)/);
  assert.match(source, /inputReplaced: verificationInput !== result\.input/);
});

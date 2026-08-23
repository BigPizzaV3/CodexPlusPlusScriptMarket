"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const scriptPath = path.join(__dirname, "..", "scripts", "codex-daily-token-usage.js");
const source = fs.readFileSync(scriptPath, "utf8");

function extractFunction(name) {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `${name} was not found`);
  const bodyStart = source.indexOf("{", start);
  let depth = 0;
  let quote = null;
  let escaped = false;
  let lineComment = false;
  let blockComment = false;

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
    if (quote) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === quote) quote = null;
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
    if (char === '"' || char === "'" || char === "`") {
      quote = char;
      continue;
    }
    if (char === "{") depth += 1;
    if (char === "}") depth -= 1;
    if (depth === 0) return source.slice(start, index + 1);
  }
  throw new Error(`Could not extract ${name}`);
}

function numericConstant(name) {
  const match = source.match(new RegExp(`const ${name} = (\\d+);`));
  assert.ok(match, `${name} was not found`);
  return Number(match[1]);
}

function visibleNode(rect) {
  return {
    getBoundingClientRect() {
      return rect;
    },
  };
}

test("selects the application menu top bar instead of a conversation header", () => {
  const appHeader = visibleNode({ left: 0, top: 0, right: 1708, bottom: 36 });
  const conversationHeader = visibleNode({ left: 308, top: 36, right: 1708, bottom: 82 });
  const queried = [];
  const context = {
    APP_HEADER_SELECTOR: '[class*="ApplicationMenuTopBar"], .app-header-tint',
    FLOATING_SCAN_TOP: numericConstant("FLOATING_SCAN_TOP"),
    document: {
      querySelector(selector) {
        queried.push(selector);
        if (selector === context.APP_HEADER_SELECTOR) return appHeader;
        if (selector === "header") return conversationHeader;
        return null;
      },
    },
    getComputedStyle() {
      return { display: "flex", visibility: "visible", opacity: "1" };
    },
  };
  const findAppHeaderElement = vm.runInNewContext(
    `${extractFunction("normalizeRect")}\n${extractFunction("visibleTopRect")}\n${extractFunction("findAppHeaderElement")}\nfindAppHeaderElement`,
    context,
  );

  assert.equal(findAppHeaderElement(), appHeader);
  assert.doesNotMatch(extractFunction("findAppHeaderElement"), /querySelector\(["']header["']\)/);
  assert.deepEqual(queried, [context.APP_HEADER_SELECTOR]);
});

test("falls back to the application menu bar without selecting a conversation header", () => {
  const appHeader = visibleNode({ left: 0, top: 0, right: 1708, bottom: 36 });
  const menuBar = {
    closest(selector) {
      assert.equal(selector, '[class*="ApplicationMenuTopBar"]');
      return appHeader;
    },
  };
  const context = {
    APP_HEADER_SELECTOR: '[class*="ApplicationMenuTopBar"], .app-header-tint',
    FLOATING_SCAN_TOP: numericConstant("FLOATING_SCAN_TOP"),
    document: {
      querySelector(selector) {
        if (selector === context.APP_HEADER_SELECTOR) return null;
        if (selector === '[role="menubar"]') return menuBar;
        if (selector === "header") throw new Error("conversation header must not be queried");
        return null;
      },
    },
    getComputedStyle() {
      return { display: "flex", visibility: "visible", opacity: "1" };
    },
  };
  const findAppHeaderElement = vm.runInNewContext(
    `${extractFunction("normalizeRect")}\n${extractFunction("visibleTopRect")}\n${extractFunction("findAppHeaderElement")}\nfindAppHeaderElement`,
    context,
  );

  assert.equal(findAppHeaderElement(), appHeader);
});

test("keeps the daily trigger in the window title bar when no toolbar anchor exists", () => {
  assert.match(
    source,
    /const FLOATING_DEFAULT_RIGHT = WINDOW_BUTTON_SAFE_RIGHT;/,
    "the fallback position must reserve only the native window controls",
  );

  const context = {
    FLOATING_COMPACT_WIDTH: numericConstant("FLOATING_COMPACT_WIDTH"),
    FLOATING_DEFAULT_RIGHT: numericConstant("WINDOW_BUTTON_SAFE_RIGHT"),
    FLOATING_HEIGHT: numericConstant("FLOATING_HEIGHT"),
    FLOATING_MIN_WIDTH: numericConstant("FLOATING_MIN_WIDTH"),
    FLOATING_SAFE_GAP: numericConstant("FLOATING_SAFE_GAP"),
    FLOATING_TOP: numericConstant("FLOATING_TOP"),
    PANEL_MARGIN: numericConstant("PANEL_MARGIN"),
  };
  const resolveFloatingLayout = vm.runInNewContext(
    [
      extractFunction("normalizeRect"),
      extractFunction("rectsOverlap"),
      extractFunction("candidateRectFromRight"),
      extractFunction("normalizeFloatingAnchor"),
      extractFunction("resolveFloatingLayout"),
      "resolveFloatingLayout",
    ].join("\n"),
    context,
  );

  const layout = resolveFloatingLayout(108, 31, 1708, 1020, [], []);

  assert.deepEqual(
    JSON.parse(JSON.stringify(layout)),
    { top: 2, right: 132, left: 1468, width: 108, compact: false },
  );
});

test("publishes matching script version and checksum metadata", () => {
  const index = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "index.json"), "utf8"));
  const entry = index.scripts.find((script) => script.id === "codex-daily-token-usage");
  const version = source.match(/const VERSION = "([^"]+)";/)?.[1];
  const sha256 = crypto.createHash("sha256").update(fs.readFileSync(scriptPath)).digest("hex");

  assert.equal(entry.version, version);
  assert.equal(entry.sha256, sha256);
});

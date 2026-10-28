"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");

test("TokenLens market entry matches the published script", () => {
  const scriptPath = path.join(root, "scripts", "tokenlens-for-codex.js");
  const source = fs.readFileSync(scriptPath, "utf8");
  const manifest = JSON.parse(fs.readFileSync(path.join(root, "index.json"), "utf8"));
  const entries = manifest.scripts.filter((script) => script.id === "tokenlens-for-codex");

  assert.equal(entries.length, 1);
  const entry = entries[0];
  assert.equal(entry.version, "1.0.4");
  assert.equal(entry.author, "LingYingNX");
  assert.equal(entry.homepage, "https://github.com/LingYingNX/TokenLens-for-Codex");
  assert.equal(
    entry.script_url,
    "https://raw.githubusercontent.com/BigPizzaV3/CodexPlusPlusScriptMarket/main/scripts/tokenlens-for-codex.js",
  );
  assert.equal(entry.sha256, crypto.createHash("sha256").update(source).digest("hex"));
  assert.match(source, /usage\/requests\?period=7d&agent=codex&limit=1/);
  assert.match(source, /usage\/requests\?period=today&agent=codex&limit=1/);
  assert.match(source, /label:\s*kind\.label/);
  assert.match(source, /right\.durationMs - left\.durationMs/);
  assert.match(source, /activeSkills/);
  assert.match(source, /visible:\s*false/);
  assert.match(source, /__codexDailyTokenUsage/);
  assert.doesNotMatch(source, /getMagpieUsage|runHistoryBackfill/);
  assert.match(source, /codexPlusUsageMaxChartBars\s*=\s*200/);
  assert.match(source, /const base = 100000/);
  assert.match(source, /codexPlusUsageAverageSpeed/);
  assert.doesNotMatch(source, /__codexPlusUsageStatusLineRuntime\?\.dispose/);
  assert.doesNotMatch(source, /workspaceFiles/);
  assert.match(source, /\/settings\/get/);
  assert.doesNotMatch(source, /[A-Z]:\\Users\\/i);
  assert.doesNotThrow(() => new Function(source));
});

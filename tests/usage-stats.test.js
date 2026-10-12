"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

test("usage stats parses arguments and aggregates a session record", async () => {
  const { collect, parseArgs } = await import("../tools/usage-stats.mjs");
  const options = parseArgs(["--days", "30", "--no-balance", "--top", "3"]);
  assert.equal(options.days, 30);
  assert.equal(options.balance, false);
  assert.equal(options.top, 3);

  const codexHome = fs.mkdtempSync(path.join(os.tmpdir(), "codexpp-usage-stats-"));
  const sessionDir = path.join(codexHome, "sessions", "2026", "10", "08");
  fs.mkdirSync(sessionDir, { recursive: true });
  const file = path.join(sessionDir, "rollout-test.jsonl");
  const timestamp = new Date(2026, 9, 8, 12, 0, 0).toISOString();
  fs.writeFileSync(
    file,
    [
      JSON.stringify({ type: "turn_context", payload: { model: "deepseek-v4-pro" } }),
      JSON.stringify({
        type: "token_usage_record",
        timestamp,
        payload: {
          thread_id: "thread-1",
          usage: {
            input_tokens: 1000,
            cached_input_tokens: 200,
            output_tokens: 300,
            reasoning_output_tokens: 100,
            total_tokens: 1300,
          },
        },
      }),
    ].join("\n") + "\n",
  );

  const stats = await collect({
    days: 1,
    since: "2026-10-08",
    until: "2026-10-08",
    top: 8,
    balance: false,
    model: "",
    codexHome,
    root: codexHome,
  });
  assert.equal(stats.records, 1);
  assert.equal(stats.total.requests, 1);
  assert.equal(stats.total.input, 1000);
  assert.equal(stats.total.cached, 200);
  assert.equal(stats.total.output, 300);
  assert.equal(stats.models[0].model, "deepseek-v4-pro");
  assert.equal(stats.topThreads[0].id, "thread-1");
  assert.ok(stats.total.cost > 0);
});

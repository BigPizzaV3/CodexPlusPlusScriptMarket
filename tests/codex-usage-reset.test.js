"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { timestamp, normalizeUsage, normalizeCredits, resetResult } = require("../scripts/codex-usage-reset.js");
test("usage selects windows by duration and clamps remaining values", () => {
 const r=normalizeUsage({rate_limit:{primary_window:{limit_window_seconds:604800,used_percent:110},secondary_window:{limit_window_seconds:18000,used_percent:25,reset_at:1700000000}}});
 assert.equal(r.five.remaining,75);assert.equal(r.five.resetsAt,1700000000000);assert.equal(r.week.remaining,0);
 assert.equal(normalizeUsage({}).five,null);
});
test("credits exclude expired and redeemed entries and sort by expiry", () => {
 const r=normalizeCredits({available_count:3,credits:[{id:"late",status:"available",expires_at:1700000300},{id:"expired",status:"available",expires_at:1699999999},{id:"early",status:"available",expires_at:1700000100},{id:"used",status:"redeemed"}]},1700000000000);
 assert.equal(r.count,2);assert.deepEqual(r.available.map(c=>c.id),["early","late"]);
 assert.throws(()=>normalizeCredits({available_count:-1}));assert.throws(()=>normalizeCredits({}));
});
test("only a retry accepts already redeemed as confirmation", () => {
 assert.equal(resetResult({code:"reset"},false),true);
 assert.equal(resetResult({code:"already_redeemed"},true),true);
 assert.throws(()=>resetResult({code:"already_redeemed"},false));
 assert.throws(()=>resetResult({code:"no_credit"},true));
 assert.equal(timestamp(1700000000),1700000000000);assert.equal(timestamp("invalid"),null);
});

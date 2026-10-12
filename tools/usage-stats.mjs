#!/usr/bin/env node
/*
 * 低开支版用量统计：只读文件，不碰界面。
 *
 * 数据来源是 Codex 自己写在本机的会话文件：
 *   ~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl → 每行 type=token_usage_record
 *   （payload.usage 是这一次模型调用的用量；turn_context 里带 model）
 * 所以这条路不打 CDP、不注入脚本、不常驻进程，CPU 占用是 0 —— 卡顿的机器上用它替代
 * 面板统计，需要看图时再让它生成一份 HTML 报告。
 *
 * 用法：
 *   node tools/usage-stats.mjs                     近 7 天 + 今天/昨天/本月
 *   node tools/usage-stats.mjs --days 30           近 30 天
 *   node tools/usage-stats.mjs --since 2026-10-01 --until 2026-10-09
 *   node tools/usage-stats.mjs --json              JSON（接别的脚本）
 *   node tools/usage-stats.mjs --html report.html  生成自包含 HTML 报告
 *   node tools/usage-stats.mjs --top 10 --no-balance
 *
 * 费率优先读本仓库 config.json 的 rates/peak_hours，读不到就用内置表（DeepSeek 官方价，
 * 峰谷价：工作日 09:00–12:00、14:00–18:00 为峰）。余额读本机 balance.log（共享账号，
 * 数字只作参考）。
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';

const SELF = fileURLToPath(import.meta.url);
const DAY_MS = 86400000;
const BUILTIN_RATES = {
  'deepseek-flash': { hit: [0.02, 0.04], miss: [1, 2], output: [4, 8] },
  'deepseek-v4-flash': { hit: [0.02, 0.04], miss: [1, 2], output: [4, 8] },
  'deepseek-chat': { hit: [0.02, 0.04], miss: [1, 2], output: [4, 8] },
  'deepseek-v4-flash-vision-exp': { hit: [0.02, 0.04], miss: [1, 2], output: [4, 8] },
  'deepseek-v4-pro': { hit: [0.15, 0.3], miss: [4.5, 9], output: [13.5, 27] },
  'deepseek-reasoner': { hit: [0.15, 0.3], miss: [4.5, 9], output: [13.5, 27] },
};
const DEFAULT_PEAK = { weekdays: [1, 2, 3, 4, 5], slots: [['09:00', '12:00'], ['14:00', '18:00']] };

/* ---------- 参数 ---------- */

function parseArgs(argv) {
  const opts = {
    days: 7,
    since: '',
    until: '',
    json: false,
    html: '',
    top: 8,
    balance: true,
    model: '',
    codexHome: process.env.CODEX_HOME || path.join(os.homedir(), '.codex'),
    root: path.resolve(path.dirname(SELF), '..'),
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = () => argv[++i];
    if (arg === '--days') opts.days = Number(next()) || opts.days;
    else if (arg === '--since') opts.since = next();
    else if (arg === '--until') opts.until = next();
    else if (arg === '--json') opts.json = true;
    else if (arg === '--html') opts.html = next() || 'usage-report.html';
    else if (arg === '--top') opts.top = Number(next()) || opts.top;
    else if (arg === '--model') opts.model = next();
    else if (arg === '--no-balance') opts.balance = false;
    else if (arg === '--help' || arg === '-h') opts.help = true;
  }
  return opts;
}

/* ---------- 时间/日期（按本机时区，和 Codex 的本地日期一致） ---------- */

function dayKey(ms) {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function dayStartMs(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d, 0, 0, 0, 0).getTime();
}

function todayKey() {
  return dayKey(Date.now());
}

function shiftDay(key, delta) {
  return dayKey(dayStartMs(key) + delta * DAY_MS);
}

function hm(ms) {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/* ---------- 费率 ---------- */

function loadRates(opts) {
  const candidates = [
    path.join(opts.root, 'config.json'),
    path.join(opts.root, 'market-pr', 'CodexPlusPlusScriptMarket', 'index.json'),
    path.join(os.homedir(), 'Documents', 'Codex', 'deepseek-proxy', 'usage-rates.json'),
  ];
  for (const file of candidates) {
    try {
      if (!fs.existsSync(file)) continue;
      const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (!raw.rates) continue;
      const table = {};
      for (const [model, rate] of Object.entries(raw.rates)) {
        if (rate.hit) {
          table[model] = rate;
        } else {
          table[model] = {
            hit: [rate.cache_hit_offpeak, rate.cache_hit_peak],
            miss: [rate.cache_miss_offpeak, rate.cache_miss_peak],
            output: [rate.output_offpeak, rate.output_peak],
          };
        }
      }
      return { table, peak: raw.peak_hours || DEFAULT_PEAK, source: file };
    } catch {
      /* 换下一个候选 */
    }
  }
  return { table: BUILTIN_RATES, peak: DEFAULT_PEAK, source: '内置费率表' };
}

function isPeak(ms, peak) {
  const d = new Date(ms);
  const weekday = d.getDay();
  if (!(peak.weekdays || []).includes(weekday)) return false;
  const minutes = d.getHours() * 60 + d.getMinutes();
  return (peak.slots || []).some(([from, to]) => {
    const [fh, fm] = from.split(':').map(Number);
    const [th, tm] = to.split(':').map(Number);
    return minutes >= fh * 60 + fm && minutes < th * 60 + tm;
  });
}

function rateFor(rates, model) {
  return rates.table[model] || rates.table['deepseek-flash'] || BUILTIN_RATES['deepseek-flash'];
}

function costOf(rates, model, usage, ms) {
  const rate = rateFor(rates, model);
  const index = isPeak(ms, rates.peak) ? 1 : 0;
  const miss = Math.max(0, usage.input_tokens - usage.cached_input_tokens - (usage.cache_write_input_tokens || 0));
  return (
    (usage.cached_input_tokens / 1e6) * rate.hit[index] +
    (miss / 1e6) * rate.miss[index] +
    (usage.output_tokens / 1e6) * rate.output[index]
  );
}

/* ---------- 扫描会话文件 ---------- */

function listRolloutFiles(root, sinceMs) {
  const out = [];
  const walk = (dir) => {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.jsonl')) {
        try {
          const stat = fs.statSync(full);
          if (stat.mtimeMs >= sinceMs) out.push({ file: full, mtime: stat.mtimeMs });
        } catch {
          /* 读不到就跳过 */
        }
      }
    }
  };
  walk(root);
  return out;
}

function emptyBucket() {
  return { requests: 0, input: 0, cached: 0, miss: 0, output: 0, reasoning: 0, total: 0, cost: 0 };
}

function addTo(bucket, usage, cost) {
  bucket.requests += 1;
  bucket.input += usage.input_tokens || 0;
  bucket.cached += usage.cached_input_tokens || 0;
  bucket.miss += Math.max(0, (usage.input_tokens || 0) - (usage.cached_input_tokens || 0) - (usage.cache_write_input_tokens || 0));
  bucket.output += usage.output_tokens || 0;
  bucket.reasoning += usage.reasoning_output_tokens || 0;
  bucket.total += usage.total_tokens || 0;
  bucket.cost += cost;
}

/* 把一个已经算好的桶并进另一个桶（按天汇总、按会话汇总都用它）。 */
function mergeBucket(target, item) {
  target.requests += item.requests || 0;
  target.input += item.input || 0;
  target.cached += item.cached || 0;
  target.miss += item.miss || 0;
  target.output += item.output || 0;
  target.reasoning += item.reasoning || 0;
  target.total += item.total || 0;
  target.cost += item.cost || 0;
}

async function collect(opts) {
  const rates = loadRates(opts);
  const until = opts.until || todayKey();
  const since = opts.since || shiftDay(until, -(opts.days - 1));
  const sinceMs = dayStartMs(since);
  const untilMs = dayStartMs(until) + DAY_MS;

  const sessionsRoot = path.join(opts.codexHome, 'sessions');
  const files = listRolloutFiles(sessionsRoot, sinceMs);
  const days = new Map();
  const threads = new Map();
  const models = new Map();
  let records = 0;
  let skippedOld = 0;

  for (const { file } of files) {
    const stream = fs.createReadStream(file, { encoding: 'utf8' });
    const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
    let currentModel = opts.model || 'deepseek-flash';
    let threadId = '';
    for await (const line of rl) {
      if (!line.includes('token_usage_record') && !line.includes('turn_context')) continue;
      let rec;
      try {
        rec = JSON.parse(line);
      } catch {
        continue;
      }
      if (rec.type === 'turn_context') {
        if (rec.payload && rec.payload.model) currentModel = opts.model || rec.payload.model;
        continue;
      }
      if (rec.type !== 'token_usage_record') continue;
      const payload = rec.payload || {};
      const usage = payload.usage;
      if (!usage || !Number.isFinite(usage.input_tokens)) continue;
      const at = Date.parse(rec.timestamp);
      if (!Number.isFinite(at)) continue;
      if (at < sinceMs || at >= untilMs) {
        skippedOld += 1;
        continue;
      }
      records += 1;
      threadId = payload.thread_id || threadId;
      const cost = costOf(rates, currentModel, usage, at);
      const key = dayKey(at);
      if (!days.has(key)) days.set(key, emptyBucket());
      addTo(days.get(key), usage, cost);
      if (!threads.has(threadId)) {
        threads.set(threadId, { ...emptyBucket(), first: at, last: at, model: currentModel });
      }
      const thread = threads.get(threadId);
      addTo(thread, usage, cost);
      thread.first = Math.min(thread.first, at);
      thread.last = Math.max(thread.last, at);
      if (!models.has(currentModel)) models.set(currentModel, emptyBucket());
      addTo(models.get(currentModel), usage, cost);
    }
    rl.close();
    stream.close();
  }

  const dayList = [...days.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([day, bucket]) => ({ day, ...bucket }));
  const total = emptyBucket();
  for (const item of dayList) mergeBucket(total, item);

  const dayBucket = (key) => dayList.find((item) => item.day === key) || { day: key, ...emptyBucket() };
  const monthPrefix = until.slice(0, 7);
  const month = emptyBucket();
  for (const item of dayList.filter((d) => d.day.startsWith(monthPrefix))) mergeBucket(month, item);

  const topThreads = [...threads.entries()]
    .map(([id, item]) => ({ id, ...item }))
    .sort((a, b) => b.cost - a.cost)
    .slice(0, opts.top);

  const balance = opts.balance ? readBalance() : null;

  return {
    range: { since, until, days: dayList.length },
    files: files.length,
    records,
    skippedOld,
    rateSource: rates.source,
    today: dayBucket(todayKey()),
    yesterday: dayBucket(shiftDay(todayKey(), -1)),
    month,
    total,
    dayList,
    topThreads,
    models: [...models.entries()].map(([model, item]) => ({ model, ...item })),
    balance,
  };
}

/* ---------- 余额（可选，读本机日志） ---------- */

function readBalance() {
  const files = [
    path.join(process.env.LOCALAPPDATA || '', 'Codex++', 'dstu-helper', 'balance.log'),
    path.join(os.homedir(), 'Desktop', 'balance', 'balance.log'),
    path.join(os.homedir(), 'OneDrive', 'Desktop', 'balance', 'balance.log'),
  ].filter((file) => file && fs.existsSync(file));
  const points = [];
  for (const file of files) {
    for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})\s*,\s*([0-9]+(?:\.[0-9]+)?)/);
      if (!m) continue;
      const at = new Date(`${m[1]}T${m[2]}`).getTime();
      const value = Number(m[3]);
      if (Number.isFinite(at) && Number.isFinite(value) && value > 0) points.push({ at, value, file });
    }
  }
  if (!points.length) return null;
  points.sort((a, b) => a.at - b.at);
  const latest = points[points.length - 1];
  const today = dayKey(Date.now());
  const todayPoints = points.filter((p) => dayKey(p.at) === today);
  const dayStart = todayPoints[0] || null;
  return {
    latest,
    todaySpend: dayStart ? Number((dayStart.value - latest.value).toFixed(6)) : null,
    sources: [...new Set(points.map((p) => p.file))],
  };
}

/* ---------- 输出 ---------- */

const nf = new Intl.NumberFormat('zh-CN');

function yuan(value) {
  return `¥${Number(value || 0).toFixed(4)}`;
}

function lineOf(label, bucket) {
  return (
    `${label.padEnd(6)} 请求 ${String(bucket.requests).padStart(4)}  ` +
    `输入 ${nf.format(bucket.input).padStart(12)}（缓存 ${nf.format(bucket.cached)} / 未命中 ${nf.format(bucket.miss)}）  ` +
    `输出 ${nf.format(bucket.output).padStart(9)}  思考 ${nf.format(bucket.reasoning).padStart(8)}  ${yuan(bucket.cost)}`
  );
}

function renderText(stats) {
  const out = [];
  out.push(`DeepSeek 用量统计（本机会话文件，零注入）  ${stats.range.since} ~ ${stats.range.until}`);
  out.push(`扫描 ${stats.files} 个会话文件 / ${nf.format(stats.records)} 条调用记录 · 费率：${stats.rateSource}`);
  out.push('');
  out.push(lineOf('今天', stats.today));
  out.push(lineOf('昨天', stats.yesterday));
  out.push(lineOf('本月', stats.month));
  out.push(lineOf('区间', stats.total));
  out.push('');
  out.push('按天');
  out.push('日期         请求      输入        缓存命中      未命中       输出      思考          费用');
  for (const item of stats.dayList) {
    out.push(
      `${item.day}  ${String(item.requests).padStart(4)}  ${nf.format(item.input).padStart(11)}  ` +
        `${nf.format(item.cached).padStart(11)}  ${nf.format(item.miss).padStart(9)}  ` +
        `${nf.format(item.output).padStart(9)}  ${nf.format(item.reasoning).padStart(8)}  ${yuan(item.cost).padStart(11)}`
    );
  }
  if (stats.topThreads.length) {
    out.push('');
    out.push(`会话 Top ${stats.topThreads.length}（按费用）`);
    for (const item of stats.topThreads) {
      out.push(
        `${item.id.slice(0, 8)}  ${nf.format(item.total).padStart(12)} tokens  ${yuan(item.cost).padStart(10)}  ` +
          `${new Date(item.first).toLocaleString('zh-CN', { hour12: false })} ~ ${new Date(item.last).toLocaleTimeString('zh-CN', { hour12: false })}`
      );
    }
  }
  if (stats.models.length > 1) {
    out.push('');
    out.push('按模型');
    for (const item of stats.models) out.push(`${item.model.padEnd(24)} ${nf.format(item.total).padStart(12)} tokens  ${yuan(item.cost)}`);
  }
  if (stats.balance) {
    const { latest, todaySpend } = stats.balance;
    out.push('');
    out.push(
      `账户余额 ${yuan(latest.value)}（${new Date(latest.at).toLocaleString('zh-CN', { hour12: false })}，` +
        `${path.basename(path.dirname(latest.file))}/balance.log）` +
        (todaySpend === null ? '' : ` · 今日账户消耗 ${yuan(todaySpend)}（共享账号，含其他人）`)
    );
  }
  return out.join('\n');
}

function renderHtml(stats) {
  const maxTokens = Math.max(1, ...stats.dayList.map((d) => d.cached + d.miss + d.output));
  const maxCost = Math.max(0.000001, ...stats.dayList.map((d) => d.cost));
  const bars = stats.dayList
    .map((item) => {
      const total = item.cached + item.miss + item.output || 1;
      const scale = (value) => Math.max(0, Math.round((value / maxTokens) * 160));
      const costX = Math.round((item.cost / maxCost) * 100);
      return (
        `<div class="col" title="${item.day}\n缓存 ${nf.format(item.cached)}\n未命中 ${nf.format(item.miss)}\n输出 ${nf.format(item.output)}\n费用 ${yuan(item.cost)}">` +
        `<div class="stack">` +
        `<div class="seg out" style="height:${scale(item.output)}px"></div>` +
        `<div class="seg miss" style="height:${scale(item.miss)}px"></div>` +
        `<div class="seg hit" style="height:${scale(item.cached)}px"></div>` +
        `</div>` +
        `<div class="cost" style="height:${costX}%"></div>` +
        `<div class="day">${item.day.slice(5)}</div>` +
        `</div>`
      );
    })
    .join('\n');
  const rows = stats.dayList
    .map(
      (item) =>
        `<tr><td>${item.day}</td><td>${nf.format(item.requests)}</td><td>${nf.format(item.input)}</td>` +
        `<td>${nf.format(item.cached)}</td><td>${nf.format(item.miss)}</td><td>${nf.format(item.output)}</td>` +
        `<td>${nf.format(item.reasoning)}</td><td>${yuan(item.cost)}</td></tr>`
    )
    .join('\n');
  const threads = stats.topThreads
    .map(
      (item) =>
        `<tr><td>${item.id.slice(0, 8)}</td><td>${nf.format(item.total)}</td><td>${yuan(item.cost)}</td>` +
        `<td>${new Date(item.first).toLocaleString('zh-CN', { hour12: false })}</td></tr>`
    )
    .join('\n');
  return `<!doctype html>
<meta charset="utf-8">
<title>DeepSeek 用量报告 ${stats.range.since} ~ ${stats.range.until}</title>
<style>
  :root { color-scheme: dark; }
  body { margin: 0; padding: 24px; background: #0e131b; color: #cbd5e1; font: 13px/1.5 "Segoe UI", system-ui, sans-serif; }
  h1 { font-size: 16px; margin: 0 0 4px; color: #e2e8f0; }
  .sub { color: #64748b; margin-bottom: 16px; }
  .cards { display: flex; gap: 12px; flex-wrap: wrap; margin-bottom: 18px; }
  .card { background: #131a24; border: 1px solid #1f2937; border-radius: 8px; padding: 10px 14px; min-width: 190px; }
  .card span { color: #64748b; display: block; font-size: 11px; }
  .card b { font-size: 15px; color: #e2e8f0; }
  .chart { display: flex; gap: 4px; align-items: flex-end; height: 200px; padding: 8px 0 22px; border-bottom: 1px solid #1f2937; }
  .col { position: relative; flex: 1; display: flex; flex-direction: column; justify-content: flex-end; align-items: center; }
  .stack { width: 100%; display: flex; flex-direction: column-reverse; align-items: stretch; }
  .seg { width: 100%; }
  .seg.hit { background: #38bdf8; }
  .seg.miss { background: #f97316; }
  .seg.out { background: #4ade80; }
  .cost { position: absolute; bottom: 0; left: 0; width: 100%; background: rgba(250, 204, 21, .18); border-top: 2px solid #facc15; }
  .day { position: absolute; bottom: -18px; color: #64748b; font-size: 10px; }
  table { width: 100%; border-collapse: collapse; margin-top: 18px; font-size: 12px; }
  th, td { text-align: right; padding: 5px 6px; border-bottom: 1px solid #1b2330; }
  th:first-child, td:first-child { text-align: left; }
  th { color: #64748b; font-weight: 500; }
  h2 { font-size: 13px; color: #94a3b8; margin: 22px 0 0; font-weight: 500; }
  .note { color: #64748b; margin-top: 14px; font-size: 11px; }
</style>
<h1>DeepSeek 用量报告</h1>
<div class="sub">${stats.range.since} ~ ${stats.range.until} · ${nf.format(stats.records)} 条调用 · 数据来自本机会话文件（零注入）</div>
<div class="cards">
  <div class="card"><span>今天</span><b>${nf.format(stats.today.total)} tokens · ${yuan(stats.today.cost)}</b></div>
  <div class="card"><span>昨天</span><b>${nf.format(stats.yesterday.total)} tokens · ${yuan(stats.yesterday.cost)}</b></div>
  <div class="card"><span>本月</span><b>${nf.format(stats.month.total)} tokens · ${yuan(stats.month.cost)}</b></div>
  <div class="card"><span>区间合计</span><b>${nf.format(stats.total.total)} tokens · ${yuan(stats.total.cost)}</b></div>
  ${
    stats.balance
      ? `<div class="card"><span>账户余额（共享）</span><b>${yuan(stats.balance.latest.value)}</b></div>`
      : ''
  }
</div>
<div class="chart">${bars}</div>
<h2>按天</h2>
<table><thead><tr><th>日期</th><th>请求</th><th>输入</th><th>缓存命中</th><th>未命中</th><th>输出</th><th>思考</th><th>费用</th></tr></thead>
<tbody>${rows}</tbody></table>
<h2>会话 Top ${stats.topThreads.length}</h2>
<table><thead><tr><th>会话</th><th>tokens</th><th>费用</th><th>最近活动</th></tr></thead><tbody>${threads}</tbody></table>
<div class="note">图表：蓝=缓存命中、橙=缓存未命中、绿=输出；黄色折线区域=当日费用。费用按 ${stats.rateSource} 估算，峰时段为工作日 09:00–12:00 / 14:00–18:00。</div>
`;
}

/* ---------- 入口 ---------- */

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    console.log(
      '用法：node tools/usage-stats.mjs [--days N] [--since YYYY-MM-DD] [--until YYYY-MM-DD] [--json] [--html file] [--top N] [--model name] [--no-balance]'
    );
    return;
  }
  const stats = await collect(opts);
  if (opts.json) {
    console.log(JSON.stringify(stats, null, 2));
    return;
  }
  console.log(renderText(stats));
  if (opts.html) {
    const target = path.resolve(opts.html);
    fs.writeFileSync(target, renderHtml(stats));
    console.log(`\nHTML 报告已写入：${target}`);
  }
}

export { collect, parseArgs, renderText, renderHtml, loadRates, costOf, isPeak, dayKey };

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(SELF)) {
  main().catch((error) => {
    console.error('统计失败：', error && error.message ? error.message : error);
    process.exit(1);
  });
}

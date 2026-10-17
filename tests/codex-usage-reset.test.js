"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
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

test("confirmation survives stale/refreshed list rebuild and clears on close", async () => {
 // Minimal renderer DOM: exercise the real script and its message bridge without dependencies.
 class Element {
  constructor(tag) { this.tag=tag;this.children=[];this.dataset={};this.style={};this.listeners={};this.hidden=false;this.disabled=false;this.value=""; }
  append(...nodes) { for(const n of nodes){n.parent=this;this.children.push(n);} }
  appendChild(n) { this.append(n);return n; }
  replaceChildren(...nodes) { this.children=[];this.value="";this.append(...nodes); }
  get firstChild(){return this.children[0];}
  get textContent(){return this.value+this.children.map(n=>n.textContent).join("");}
  set textContent(v){this.value=v;this.children=[];}
  setAttribute(k,v){this[k]=v;}
  addEventListener(k,fn){this.listeners[k]=fn;}
  click(){if(!this.disabled)this.listeners.click?.();}
  focus(){}
  remove(){if(this.parent)this.parent.children=this.parent.children.filter(n=>n!==this);}
  contains(n){return this===n||this.children.some(c=>c.contains(n));}
  querySelectorAll(selector){const all=this.children.flatMap(c=>[c,...c.querySelectorAll("*")]);return selector==="button[data-credit-key]"?all.filter(n=>n.tag==="button"&&n.dataset.creditKey!=null):all;}
 }
 const body=new Element("body"),head=new Element("head"),listeners=new Map();
 const document={body,head,readyState:"complete",hidden:false,createElement:tag=>new Element(tag),querySelectorAll:()=>[],addEventListener(){},removeEventListener(){}};
 let now=1700000000000,requests=0;
 class Clock extends Date { static now(){return now;} }
 const window={addEventListener:(name,fn)=>{if(!listeners.has(name))listeners.set(name,new Set());listeners.get(name).add(fn);},removeEventListener:(name,fn)=>listeners.get(name)?.delete(fn)};
 window.top=window;
 window.electronBridge={sendMessageFromView:async req=>{
  assert.equal(req.method,"GET","confirmation and refresh must never consume a credit");requests++;
  const data=req.url==="/wham/usage"?{rate_limit:{primary_window:{used_percent:25,limit_window_seconds:18000}}}:{available_count:1,credits:[{id:"credit-a",title:"Test reset",status:"available",expires_at:1700010000}]};
  queueMicrotask(()=>{for(const fn of listeners.get("message")||[])fn({data:{type:"fetch-response",responseType:"success",requestId:req.requestId,status:200,bodyJsonString:JSON.stringify(data)}});});
 }};
 const context=vm.createContext({window,document,location:{href:"app://-/test"},performance:{getEntriesByType:()=>[]},crypto:require("node:crypto").webcrypto,Date:Clock,URL,Intl,AbortController,Symbol,setTimeout,clearTimeout,setInterval:()=>1,clearInterval(){},requestAnimationFrame:()=>1,cancelAnimationFrame(){},MutationObserver:class{observe(){}disconnect(){}}});
 const source=fs.readFileSync(path.join(__dirname,"../scripts/codex-usage-reset.js"),"utf8");
 vm.runInContext(source,context);
 const api=window.__codexUsageReset;
 try {
  await api.refresh();
  const root=body.children.find(n=>n.id==="codex-usage-reset"),panel=body.children.find(n=>n.id==="codex-usage-reset-panel");
  const uses=()=>panel.querySelectorAll("*").filter(n=>n.className==="use");
  root.children[0].click();await api.refresh();
  uses()[0].click();assert.equal(uses()[0].textContent,"确认使用1次");
  now+=180000;
  const refreshing=api.refresh();
  assert.equal(uses()[0].textContent,"确认使用1次");
  assert.equal(uses()[0].disabled,true);
  await refreshing;
  assert.equal(uses()[0].textContent,"确认使用1次");
  assert.equal(uses()[0].disabled,false);
  root.children[0].click();root.children[0].click();await api.refresh();
  assert.equal(uses()[0].textContent,"使用重置");
  assert.ok(requests>0);
 } finally {api.destroy();}
 assert.equal(window.__codexUsageReset,undefined);
 assert.equal(body.children.length,0);
 assert.equal(head.children.length,0);
});

// ==UserScript==
// @name         Codex Live Token Cost
// @namespace    codex-plus-plus
// @version      0.7.2
// @description  在 Codex 输入框上方显示 Token 与金额，解锁官方个人资料页并替换为本地统计；通过设置按钮管理价格和伪装资料。
// @match        app://-/*
// @run-at       document-start
// ==/UserScript==

(() => {
  "use strict";

  const VERSION = "0.7.2";
  const ROOT_ID = "codex-live-token-cost";
  const SETTINGS_BUTTON_ID = "codex-live-token-cost-settings";
  const STYLE_ID = "codex-live-token-cost-style";
  const CODEX_PLUS_MENU_ID = "codex-plus-menu";
  const OFFICIAL_MODEL_TRIGGER_SELECTOR = "[data-codex-intelligence-trigger='true']";
  const PRICE_OVERRIDES_KEY = "__codexLiveTokenCostPriceOverridesV1";
  const HIDDEN_PRICE_MODELS_KEY = "__codexLiveTokenCostHiddenPriceModelsV1";
  const PRICE_MIGRATION_KEY = "__codexLiveTokenCostPriceMigrationV1";
  const PRICE_MIGRATION_VERSION = "official-prices-2026-07-10-v2";
  const DAILY_USAGE_KEY = "__codexLiveTokenCostDailyUsageV1";
  const LOCAL_USAGE_KEY = "__codexLiveTokenCostLocalUsageV1";
  const ANALYTICS_ROLLUP_KEY = "__codexLiveTokenCostAnalyticsRollupV1";
  const ANALYTICS_MAX_DAYS = 365;
  const RUNTIME_SESSION_BINDING_TTL_MS = 5 * 60 * 1000;
  const OFFICIAL_RUNTIME_STATE_TTL_MS = 10 * 60 * 1000;
  const PROFILE_PREFS_KEY = "__codexLiveTokenCostProfilePrefsV1";
  const PROFILE_OVERRIDES_KEY = "__codexLiveTokenCostProfileOverridesV1";
  const PROFILE_DEFAULTS_KEY = "__codexLiveTokenCostProfileDefaultsV1";
  const HUB_VISIBLE_KEY = "__codexLiveTokenCostHubVisibleV1";
  const PROJECT_CONTEXT_ROW_SELECTOR =
    "[data-codex-composer-root] [data-composer-utility-bar-scroll-area] [data-composer-navigation-target='workspace-project']";
  const PROFILE_GATE_ID = "2478676115";
  const PROFILE_USAGE_QUERY_KEY = ["profile", "usage"];
  const PROFILE_ACCOUNTS_CHECK_QUERY_KEY = ["accounts", "check"];
  const LOCAL_PROFILE_ACCOUNT_ID = "local-profile-account";
  const LOCAL_PROFILE_USER_ID = "local-profile-user";
  const LOCAL_PROFILE_PLAN = "pro_20x";
  const LOCAL_PROFILE_EMAIL = "sama@openai.com";
  const PROFILE_PLAN_OPTIONS = [
    { value: "free", label: "Free" },
    { value: "go", label: "Go" },
    { value: "plus", label: "Plus" },
    { value: "pro_5x", label: "Pro 5x" },
    { value: "pro_20x", label: "Pro 20x" },
    { value: "business", label: "Business" },
    { value: "enterprise", label: "Enterprise" },
    { value: "edu", label: "Edu" },
    { value: "staff", label: "Staff" },
    { value: "founder", label: "Founder" },
  ];
  const PROFILE_IMAGE_MAX_LENGTH = 8_000_000;
  const PROFILE_HEATMAP_BASE_START = "2025-07-13";
  const PROFILE_HEATMAP_MAX_COLUMNS = 52;
  const LOCAL_LEDGER_LIMIT = 2000;
  const LOCAL_LIVE_TURN_RESTORE_MAX_AGE_MS = 15 * 60 * 1000;
  const UNKNOWN_MODEL = "未知";
  const FAST_MODE_ICON_PATH =
    "M11.9125 21.4125C11.5292 21.8625 11.0292 22.0958 10.4125 22.1125C9.79586 22.1291 9.29586 21.9208 8.91252 21.4875C8.53752 21.0541 8.45836 20.4541 8.67503 19.6875L9.68752 16H4.57502C4.00836 16 3.56669 15.8375 3.25002 15.5125C2.93336 15.1791 2.77502 14.7791 2.77502 14.3125C2.77502 13.8375 2.92919 13.4125 3.23752 13.0375L12.1375 2.47497C12.5209 2.02497 13.0209 1.79164 13.6375 1.77497C14.2542 1.75831 14.75 1.96664 15.125 2.39997C15.5084 2.83331 15.5917 3.43331 15.375 4.19997L14.3125 7.99998H19.425C19.9917 7.99998 20.4334 8.16664 20.75 8.49997C21.075 8.83331 21.2375 9.23748 21.2375 9.71247C21.2375 10.1791 21.0792 10.5958 20.7625 10.9625L11.9125 21.4125Z";
  const LEGACY_FAST_MODE_ICON_PATH_PREFIX = "M9.80999 17.8302C9.49666 18.1969";
  const RENDER_THROTTLE_MS = 250;
  const SETTINGS_MODAL_EXIT_MS = 160;
  const PROFILE_SAVE_STATUS_DURATION_MS = 1800;
  const HELPER_STATS_URL = "http://127.0.0.1:17888/stats";
  const HELPER_STATS_REFRESH_URL = `${HELPER_STATS_URL}?refresh=1`;
  const CC_SWITCH_TURNS_URL = "http://127.0.0.1:17888/cc-switch/turns";
  const CC_SWITCH_TURNS_REFRESH_URL = `${CC_SWITCH_TURNS_URL}?refresh=1`;
  const PROFILE_DATA_REFRESH_MIN_INTERVAL_MS = 60000;
  const HELPER_REFRESH_POLL_INTERVAL_MS = 500;
  const HELPER_REFRESH_MAX_POLLS = 60;
  const HELPER_BRIDGE_RETRY_DELAYS_MS = [0, 250, 1000];
  const HELPER_THREAD_CONTENT_URL = "http://127.0.0.1:17888/codex/thread-content";
  const HELPER_GITHUB_URL = "https://github.com/Tianzora/codex-token-cost/blob/main/scripts/codex-local-usage-helper.cjs";
  const HELPER_STATUS_DEFAULT = "Helper 可选：未连接时使用本地捕获数据；CC Switch 同步、Codex SQLite 线程数、技能/插件统计会不可用。";
  const HELPER_STATUS_CONNECTED = "Helper 已连接：CC Switch 同步、Codex SQLite 线程数、技能/插件统计可用。";
  const HELPER_STATUS_DEGRADED = "Helper 未运行：已降级为本地捕获数据；CC Switch 同步、Codex SQLite 线程数、技能/插件统计不可用。";
  const HELPER_STATUS_CC_SWITCH_DEGRADED = "Helper 未运行：无法同步 CC Switch；今日统计仅使用本地捕获与已有本地记录。";
  const SHIMMER_ACTIVE_MS = 1000;
  const SHIMMER_INTERVAL_MS = 4000;
  const FAST_MODE_COST_MULTIPLIERS = [
    { pattern: /^gpt-5\.6(?:$|[-_.])/, multiplier: 2 },
    { pattern: /^gpt-5\.5(?:$|[-_.])/, multiplier: 2.5 },
    { pattern: /^gpt-5\.4(?:$|[-_.])/, multiplier: 2 },
  ];
  const PRICE_DATA_SOURCE_KEY = "__CODEX_LIVE_TOKEN_COST_PRICES__";
  /*
   * Flatpickr 4.6.13 + zh locale
   * Copyright (c) 2017 Gregory Petrosyan
   *
   * Permission is hereby granted, free of charge, to any person obtaining a copy
   * of this software and associated documentation files (the "Software"), to deal
   * in the Software without restriction, including without limitation the rights
   * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
   * copies of the Software, and to permit persons to whom the Software is
   * furnished to do so, subject to the following conditions:
   *
   * The above copyright notice and this permission notice shall be included in all
   * copies or substantial portions of the Software.
   *
   * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
   * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
   * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
   * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
   * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
   * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
   * SOFTWARE.
   */
  function installBundledFlatpickr() {
    if (typeof window.flatpickr === "function") return window.flatpickr;
    const exports = undefined;
    const module = undefined;
    const define = undefined;
/* flatpickr v4.6.13,, @license MIT */
!function(e,n){"object"==typeof exports&&"undefined"!=typeof module?module.exports=n():"function"==typeof define&&define.amd?define(n):(e="undefined"!=typeof globalThis?globalThis:e||self).flatpickr=n()}(this,(function(){"use strict";var e=function(){return(e=Object.assign||function(e){for(var n,t=1,a=arguments.length;t<a;t++)for(var i in n=arguments[t])Object.prototype.hasOwnProperty.call(n,i)&&(e[i]=n[i]);return e}).apply(this,arguments)};function n(){for(var e=0,n=0,t=arguments.length;n<t;n++)e+=arguments[n].length;var a=Array(e),i=0;for(n=0;n<t;n++)for(var o=arguments[n],r=0,l=o.length;r<l;r++,i++)a[i]=o[r];return a}var t=["onChange","onClose","onDayCreate","onDestroy","onKeyDown","onMonthChange","onOpen","onParseConfig","onReady","onValueUpdate","onYearChange","onPreCalendarPosition"],a={_disable:[],allowInput:!1,allowInvalidPreload:!1,altFormat:"F j, Y",altInput:!1,altInputClass:"form-control input",animate:"object"==typeof window&&-1===window.navigator.userAgent.indexOf("MSIE"),ariaDateFormat:"F j, Y",autoFillDefaultTime:!0,clickOpens:!0,closeOnSelect:!0,conjunction:", ",dateFormat:"Y-m-d",defaultHour:12,defaultMinute:0,defaultSeconds:0,disable:[],disableMobile:!1,enableSeconds:!1,enableTime:!1,errorHandler:function(e){return"undefined"!=typeof console&&console.warn(e)},getWeek:function(e){var n=new Date(e.getTime());n.setHours(0,0,0,0),n.setDate(n.getDate()+3-(n.getDay()+6)%7);var t=new Date(n.getFullYear(),0,4);return 1+Math.round(((n.getTime()-t.getTime())/864e5-3+(t.getDay()+6)%7)/7)},hourIncrement:1,ignoredFocusElements:[],inline:!1,locale:"default",minuteIncrement:5,mode:"single",monthSelectorType:"dropdown",nextArrow:"<svg version='1.1' xmlns='http://www.w3.org/2000/svg' xmlns:xlink='http://www.w3.org/1999/xlink' viewBox='0 0 17 17'><g></g><path d='M13.207 8.472l-7.854 7.854-0.707-0.707 7.146-7.146-7.146-7.148 0.707-0.707 7.854 7.854z' /></svg>",noCalendar:!1,now:new Date,onChange:[],onClose:[],onDayCreate:[],onDestroy:[],onKeyDown:[],onMonthChange:[],onOpen:[],onParseConfig:[],onReady:[],onValueUpdate:[],onYearChange:[],onPreCalendarPosition:[],plugins:[],position:"auto",positionElement:void 0,prevArrow:"<svg version='1.1' xmlns='http://www.w3.org/2000/svg' xmlns:xlink='http://www.w3.org/1999/xlink' viewBox='0 0 17 17'><g></g><path d='M5.207 8.471l7.146 7.147-0.707 0.707-7.853-7.854 7.854-7.853 0.707 0.707-7.147 7.146z' /></svg>",shorthandCurrentMonth:!1,showMonths:1,static:!1,time_24hr:!1,weekNumbers:!1,wrap:!1},i={weekdays:{shorthand:["Sun","Mon","Tue","Wed","Thu","Fri","Sat"],longhand:["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"]},months:{shorthand:["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"],longhand:["January","February","March","April","May","June","July","August","September","October","November","December"]},daysInMonth:[31,28,31,30,31,30,31,31,30,31,30,31],firstDayOfWeek:0,ordinal:function(e){var n=e%100;if(n>3&&n<21)return"th";switch(n%10){case 1:return"st";case 2:return"nd";case 3:return"rd";default:return"th"}},rangeSeparator:" to ",weekAbbreviation:"Wk",scrollTitle:"Scroll to increment",toggleTitle:"Click to toggle",amPM:["AM","PM"],yearAriaLabel:"Year",monthAriaLabel:"Month",hourAriaLabel:"Hour",minuteAriaLabel:"Minute",time_24hr:!1},o=function(e,n){return void 0===n&&(n=2),("000"+e).slice(-1*n)},r=function(e){return!0===e?1:0};function l(e,n){var t;return function(){var a=this,i=arguments;clearTimeout(t),t=setTimeout((function(){return e.apply(a,i)}),n)}}var c=function(e){return e instanceof Array?e:[e]};function s(e,n,t){if(!0===t)return e.classList.add(n);e.classList.remove(n)}function d(e,n,t){var a=window.document.createElement(e);return n=n||"",t=t||"",a.className=n,void 0!==t&&(a.textContent=t),a}function u(e){for(;e.firstChild;)e.removeChild(e.firstChild)}function f(e,n){return n(e)?e:e.parentNode?f(e.parentNode,n):void 0}function m(e,n){var t=d("div","numInputWrapper"),a=d("input","numInput "+e),i=d("span","arrowUp"),o=d("span","arrowDown");if(-1===navigator.userAgent.indexOf("MSIE 9.0")?a.type="number":(a.type="text",a.pattern="\\d*"),void 0!==n)for(var r in n)a.setAttribute(r,n[r]);return t.appendChild(a),t.appendChild(i),t.appendChild(o),t}function g(e){try{return"function"==typeof e.composedPath?e.composedPath()[0]:e.target}catch(n){return e.target}}var p=function(){},h=function(e,n,t){return t.months[n?"shorthand":"longhand"][e]},v={D:p,F:function(e,n,t){e.setMonth(t.months.longhand.indexOf(n))},G:function(e,n){e.setHours((e.getHours()>=12?12:0)+parseFloat(n))},H:function(e,n){e.setHours(parseFloat(n))},J:function(e,n){e.setDate(parseFloat(n))},K:function(e,n,t){e.setHours(e.getHours()%12+12*r(new RegExp(t.amPM[1],"i").test(n)))},M:function(e,n,t){e.setMonth(t.months.shorthand.indexOf(n))},S:function(e,n){e.setSeconds(parseFloat(n))},U:function(e,n){return new Date(1e3*parseFloat(n))},W:function(e,n,t){var a=parseInt(n),i=new Date(e.getFullYear(),0,2+7*(a-1),0,0,0,0);return i.setDate(i.getDate()-i.getDay()+t.firstDayOfWeek),i},Y:function(e,n){e.setFullYear(parseFloat(n))},Z:function(e,n){return new Date(n)},d:function(e,n){e.setDate(parseFloat(n))},h:function(e,n){e.setHours((e.getHours()>=12?12:0)+parseFloat(n))},i:function(e,n){e.setMinutes(parseFloat(n))},j:function(e,n){e.setDate(parseFloat(n))},l:p,m:function(e,n){e.setMonth(parseFloat(n)-1)},n:function(e,n){e.setMonth(parseFloat(n)-1)},s:function(e,n){e.setSeconds(parseFloat(n))},u:function(e,n){return new Date(parseFloat(n))},w:p,y:function(e,n){e.setFullYear(2e3+parseFloat(n))}},D={D:"",F:"",G:"(\\d\\d|\\d)",H:"(\\d\\d|\\d)",J:"(\\d\\d|\\d)\\w+",K:"",M:"",S:"(\\d\\d|\\d)",U:"(.+)",W:"(\\d\\d|\\d)",Y:"(\\d{4})",Z:"(.+)",d:"(\\d\\d|\\d)",h:"(\\d\\d|\\d)",i:"(\\d\\d|\\d)",j:"(\\d\\d|\\d)",l:"",m:"(\\d\\d|\\d)",n:"(\\d\\d|\\d)",s:"(\\d\\d|\\d)",u:"(.+)",w:"(\\d\\d|\\d)",y:"(\\d{2})"},w={Z:function(e){return e.toISOString()},D:function(e,n,t){return n.weekdays.shorthand[w.w(e,n,t)]},F:function(e,n,t){return h(w.n(e,n,t)-1,!1,n)},G:function(e,n,t){return o(w.h(e,n,t))},H:function(e){return o(e.getHours())},J:function(e,n){return void 0!==n.ordinal?e.getDate()+n.ordinal(e.getDate()):e.getDate()},K:function(e,n){return n.amPM[r(e.getHours()>11)]},M:function(e,n){return h(e.getMonth(),!0,n)},S:function(e){return o(e.getSeconds())},U:function(e){return e.getTime()/1e3},W:function(e,n,t){return t.getWeek(e)},Y:function(e){return o(e.getFullYear(),4)},d:function(e){return o(e.getDate())},h:function(e){return e.getHours()%12?e.getHours()%12:12},i:function(e){return o(e.getMinutes())},j:function(e){return e.getDate()},l:function(e,n){return n.weekdays.longhand[e.getDay()]},m:function(e){return o(e.getMonth()+1)},n:function(e){return e.getMonth()+1},s:function(e){return e.getSeconds()},u:function(e){return e.getTime()},w:function(e){return e.getDay()},y:function(e){return String(e.getFullYear()).substring(2)}},b=function(e){var n=e.config,t=void 0===n?a:n,o=e.l10n,r=void 0===o?i:o,l=e.isMobile,c=void 0!==l&&l;return function(e,n,a){var i=a||r;return void 0===t.formatDate||c?n.split("").map((function(n,a,o){return w[n]&&"\\"!==o[a-1]?w[n](e,i,t):"\\"!==n?n:""})).join(""):t.formatDate(e,n,i)}},C=function(e){var n=e.config,t=void 0===n?a:n,o=e.l10n,r=void 0===o?i:o;return function(e,n,i,o){if(0===e||e){var l,c=o||r,s=e;if(e instanceof Date)l=new Date(e.getTime());else if("string"!=typeof e&&void 0!==e.toFixed)l=new Date(e);else if("string"==typeof e){var d=n||(t||a).dateFormat,u=String(e).trim();if("today"===u)l=new Date,i=!0;else if(t&&t.parseDate)l=t.parseDate(e,d);else if(/Z$/.test(u)||/GMT$/.test(u))l=new Date(e);else{for(var f=void 0,m=[],g=0,p=0,h="";g<d.length;g++){var w=d[g],b="\\"===w,C="\\"===d[g-1]||b;if(D[w]&&!C){h+=D[w];var M=new RegExp(h).exec(e);M&&(f=!0)&&m["Y"!==w?"push":"unshift"]({fn:v[w],val:M[++p]})}else b||(h+=".")}l=t&&t.noCalendar?new Date((new Date).setHours(0,0,0,0)):new Date((new Date).getFullYear(),0,1,0,0,0,0),m.forEach((function(e){var n=e.fn,t=e.val;return l=n(l,t,c)||l})),l=f?l:void 0}}if(l instanceof Date&&!isNaN(l.getTime()))return!0===i&&l.setHours(0,0,0,0),l;t.errorHandler(new Error("Invalid date provided: "+s))}}};function M(e,n,t){return void 0===t&&(t=!0),!1!==t?new Date(e.getTime()).setHours(0,0,0,0)-new Date(n.getTime()).setHours(0,0,0,0):e.getTime()-n.getTime()}var y=function(e,n,t){return 3600*e+60*n+t},x=864e5;function E(e){var n=e.defaultHour,t=e.defaultMinute,a=e.defaultSeconds;if(void 0!==e.minDate){var i=e.minDate.getHours(),o=e.minDate.getMinutes(),r=e.minDate.getSeconds();n<i&&(n=i),n===i&&t<o&&(t=o),n===i&&t===o&&a<r&&(a=e.minDate.getSeconds())}if(void 0!==e.maxDate){var l=e.maxDate.getHours(),c=e.maxDate.getMinutes();(n=Math.min(n,l))===l&&(t=Math.min(c,t)),n===l&&t===c&&(a=e.maxDate.getSeconds())}return{hours:n,minutes:t,seconds:a}}"function"!=typeof Object.assign&&(Object.assign=function(e){for(var n=[],t=1;t<arguments.length;t++)n[t-1]=arguments[t];if(!e)throw TypeError("Cannot convert undefined or null to object");for(var a=function(n){n&&Object.keys(n).forEach((function(t){return e[t]=n[t]}))},i=0,o=n;i<o.length;i++){var r=o[i];a(r)}return e});function k(p,v){var w={config:e(e({},a),I.defaultConfig),l10n:i};function k(){var e;return(null===(e=w.calendarContainer)||void 0===e?void 0:e.getRootNode()).activeElement||document.activeElement}function T(e){return e.bind(w)}function S(){var e=w.config;!1===e.weekNumbers&&1===e.showMonths||!0!==e.noCalendar&&window.requestAnimationFrame((function(){if(void 0!==w.calendarContainer&&(w.calendarContainer.style.visibility="hidden",w.calendarContainer.style.display="block"),void 0!==w.daysContainer){var n=(w.days.offsetWidth+1)*e.showMonths;w.daysContainer.style.width=n+"px",w.calendarContainer.style.width=n+(void 0!==w.weekWrapper?w.weekWrapper.offsetWidth:0)+"px",w.calendarContainer.style.removeProperty("visibility"),w.calendarContainer.style.removeProperty("display")}}))}function _(e){if(0===w.selectedDates.length){var n=void 0===w.config.minDate||M(new Date,w.config.minDate)>=0?new Date:new Date(w.config.minDate.getTime()),t=E(w.config);n.setHours(t.hours,t.minutes,t.seconds,n.getMilliseconds()),w.selectedDates=[n],w.latestSelectedDateObj=n}void 0!==e&&"blur"!==e.type&&function(e){e.preventDefault();var n="keydown"===e.type,t=g(e),a=t;void 0!==w.amPM&&t===w.amPM&&(w.amPM.textContent=w.l10n.amPM[r(w.amPM.textContent===w.l10n.amPM[0])]);var i=parseFloat(a.getAttribute("min")),l=parseFloat(a.getAttribute("max")),c=parseFloat(a.getAttribute("step")),s=parseInt(a.value,10),d=e.delta||(n?38===e.which?1:-1:0),u=s+c*d;if(void 0!==a.value&&2===a.value.length){var f=a===w.hourElement,m=a===w.minuteElement;u<i?(u=l+u+r(!f)+(r(f)&&r(!w.amPM)),m&&L(void 0,-1,w.hourElement)):u>l&&(u=a===w.hourElement?u-l-r(!w.amPM):i,m&&L(void 0,1,w.hourElement)),w.amPM&&f&&(1===c?u+s===23:Math.abs(u-s)>c)&&(w.amPM.textContent=w.l10n.amPM[r(w.amPM.textContent===w.l10n.amPM[0])]),a.value=o(u)}}(e);var a=w._input.value;O(),ye(),w._input.value!==a&&w._debouncedChange()}function O(){if(void 0!==w.hourElement&&void 0!==w.minuteElement){var e,n,t=(parseInt(w.hourElement.value.slice(-2),10)||0)%24,a=(parseInt(w.minuteElement.value,10)||0)%60,i=void 0!==w.secondElement?(parseInt(w.secondElement.value,10)||0)%60:0;void 0!==w.amPM&&(e=t,n=w.amPM.textContent,t=e%12+12*r(n===w.l10n.amPM[1]));var o=void 0!==w.config.minTime||w.config.minDate&&w.minDateHasTime&&w.latestSelectedDateObj&&0===M(w.latestSelectedDateObj,w.config.minDate,!0),l=void 0!==w.config.maxTime||w.config.maxDate&&w.maxDateHasTime&&w.latestSelectedDateObj&&0===M(w.latestSelectedDateObj,w.config.maxDate,!0);if(void 0!==w.config.maxTime&&void 0!==w.config.minTime&&w.config.minTime>w.config.maxTime){var c=y(w.config.minTime.getHours(),w.config.minTime.getMinutes(),w.config.minTime.getSeconds()),s=y(w.config.maxTime.getHours(),w.config.maxTime.getMinutes(),w.config.maxTime.getSeconds()),d=y(t,a,i);if(d>s&&d<c){var u=function(e){var n=Math.floor(e/3600),t=(e-3600*n)/60;return[n,t,e-3600*n-60*t]}(c);t=u[0],a=u[1],i=u[2]}}else{if(l){var f=void 0!==w.config.maxTime?w.config.maxTime:w.config.maxDate;(t=Math.min(t,f.getHours()))===f.getHours()&&(a=Math.min(a,f.getMinutes())),a===f.getMinutes()&&(i=Math.min(i,f.getSeconds()))}if(o){var m=void 0!==w.config.minTime?w.config.minTime:w.config.minDate;(t=Math.max(t,m.getHours()))===m.getHours()&&a<m.getMinutes()&&(a=m.getMinutes()),a===m.getMinutes()&&(i=Math.max(i,m.getSeconds()))}}A(t,a,i)}}function F(e){var n=e||w.latestSelectedDateObj;n&&n instanceof Date&&A(n.getHours(),n.getMinutes(),n.getSeconds())}function A(e,n,t){void 0!==w.latestSelectedDateObj&&w.latestSelectedDateObj.setHours(e%24,n,t||0,0),w.hourElement&&w.minuteElement&&!w.isMobile&&(w.hourElement.value=o(w.config.time_24hr?e:(12+e)%12+12*r(e%12==0)),w.minuteElement.value=o(n),void 0!==w.amPM&&(w.amPM.textContent=w.l10n.amPM[r(e>=12)]),void 0!==w.secondElement&&(w.secondElement.value=o(t)))}function N(e){var n=g(e),t=parseInt(n.value)+(e.delta||0);(t/1e3>1||"Enter"===e.key&&!/[^\d]/.test(t.toString()))&&ee(t)}function P(e,n,t,a){return n instanceof Array?n.forEach((function(n){return P(e,n,t,a)})):e instanceof Array?e.forEach((function(e){return P(e,n,t,a)})):(e.addEventListener(n,t,a),void w._handlers.push({remove:function(){return e.removeEventListener(n,t,a)}}))}function Y(){De("onChange")}function j(e,n){var t=void 0!==e?w.parseDate(e):w.latestSelectedDateObj||(w.config.minDate&&w.config.minDate>w.now?w.config.minDate:w.config.maxDate&&w.config.maxDate<w.now?w.config.maxDate:w.now),a=w.currentYear,i=w.currentMonth;try{void 0!==t&&(w.currentYear=t.getFullYear(),w.currentMonth=t.getMonth())}catch(e){e.message="Invalid date supplied: "+t,w.config.errorHandler(e)}n&&w.currentYear!==a&&(De("onYearChange"),q()),!n||w.currentYear===a&&w.currentMonth===i||De("onMonthChange"),w.redraw()}function H(e){var n=g(e);~n.className.indexOf("arrow")&&L(e,n.classList.contains("arrowUp")?1:-1)}function L(e,n,t){var a=e&&g(e),i=t||a&&a.parentNode&&a.parentNode.firstChild,o=we("increment");o.delta=n,i&&i.dispatchEvent(o)}function R(e,n,t,a){var i=ne(n,!0),o=d("span",e,n.getDate().toString());return o.dateObj=n,o.$i=a,o.setAttribute("aria-label",w.formatDate(n,w.config.ariaDateFormat)),-1===e.indexOf("hidden")&&0===M(n,w.now)&&(w.todayDateElem=o,o.classList.add("today"),o.setAttribute("aria-current","date")),i?(o.tabIndex=-1,be(n)&&(o.classList.add("selected"),w.selectedDateElem=o,"range"===w.config.mode&&(s(o,"startRange",w.selectedDates[0]&&0===M(n,w.selectedDates[0],!0)),s(o,"endRange",w.selectedDates[1]&&0===M(n,w.selectedDates[1],!0)),"nextMonthDay"===e&&o.classList.add("inRange")))):o.classList.add("flatpickr-disabled"),"range"===w.config.mode&&function(e){return!("range"!==w.config.mode||w.selectedDates.length<2)&&(M(e,w.selectedDates[0])>=0&&M(e,w.selectedDates[1])<=0)}(n)&&!be(n)&&o.classList.add("inRange"),w.weekNumbers&&1===w.config.showMonths&&"prevMonthDay"!==e&&a%7==6&&w.weekNumbers.insertAdjacentHTML("beforeend","<span class='flatpickr-day'>"+w.config.getWeek(n)+"</span>"),De("onDayCreate",o),o}function W(e){e.focus(),"range"===w.config.mode&&oe(e)}function B(e){for(var n=e>0?0:w.config.showMonths-1,t=e>0?w.config.showMonths:-1,a=n;a!=t;a+=e)for(var i=w.daysContainer.children[a],o=e>0?0:i.children.length-1,r=e>0?i.children.length:-1,l=o;l!=r;l+=e){var c=i.children[l];if(-1===c.className.indexOf("hidden")&&ne(c.dateObj))return c}}function J(e,n){var t=k(),a=te(t||document.body),i=void 0!==e?e:a?t:void 0!==w.selectedDateElem&&te(w.selectedDateElem)?w.selectedDateElem:void 0!==w.todayDateElem&&te(w.todayDateElem)?w.todayDateElem:B(n>0?1:-1);void 0===i?w._input.focus():a?function(e,n){for(var t=-1===e.className.indexOf("Month")?e.dateObj.getMonth():w.currentMonth,a=n>0?w.config.showMonths:-1,i=n>0?1:-1,o=t-w.currentMonth;o!=a;o+=i)for(var r=w.daysContainer.children[o],l=t-w.currentMonth===o?e.$i+n:n<0?r.children.length-1:0,c=r.children.length,s=l;s>=0&&s<c&&s!=(n>0?c:-1);s+=i){var d=r.children[s];if(-1===d.className.indexOf("hidden")&&ne(d.dateObj)&&Math.abs(e.$i-s)>=Math.abs(n))return W(d)}w.changeMonth(i),J(B(i),0)}(i,n):W(i)}function K(e,n){for(var t=(new Date(e,n,1).getDay()-w.l10n.firstDayOfWeek+7)%7,a=w.utils.getDaysInMonth((n-1+12)%12,e),i=w.utils.getDaysInMonth(n,e),o=window.document.createDocumentFragment(),r=w.config.showMonths>1,l=r?"prevMonthDay hidden":"prevMonthDay",c=r?"nextMonthDay hidden":"nextMonthDay",s=a+1-t,u=0;s<=a;s++,u++)o.appendChild(R("flatpickr-day "+l,new Date(e,n-1,s),0,u));for(s=1;s<=i;s++,u++)o.appendChild(R("flatpickr-day",new Date(e,n,s),0,u));for(var f=i+1;f<=42-t&&(1===w.config.showMonths||u%7!=0);f++,u++)o.appendChild(R("flatpickr-day "+c,new Date(e,n+1,f%i),0,u));var m=d("div","dayContainer");return m.appendChild(o),m}function U(){if(void 0!==w.daysContainer){u(w.daysContainer),w.weekNumbers&&u(w.weekNumbers);for(var e=document.createDocumentFragment(),n=0;n<w.config.showMonths;n++){var t=new Date(w.currentYear,w.currentMonth,1);t.setMonth(w.currentMonth+n),e.appendChild(K(t.getFullYear(),t.getMonth()))}w.daysContainer.appendChild(e),w.days=w.daysContainer.firstChild,"range"===w.config.mode&&1===w.selectedDates.length&&oe()}}function q(){if(!(w.config.showMonths>1||"dropdown"!==w.config.monthSelectorType)){var e=function(e){return!(void 0!==w.config.minDate&&w.currentYear===w.config.minDate.getFullYear()&&e<w.config.minDate.getMonth())&&!(void 0!==w.config.maxDate&&w.currentYear===w.config.maxDate.getFullYear()&&e>w.config.maxDate.getMonth())};w.monthsDropdownContainer.tabIndex=-1,w.monthsDropdownContainer.innerHTML="";for(var n=0;n<12;n++)if(e(n)){var t=d("option","flatpickr-monthDropdown-month");t.value=new Date(w.currentYear,n).getMonth().toString(),t.textContent=h(n,w.config.shorthandCurrentMonth,w.l10n),t.tabIndex=-1,w.currentMonth===n&&(t.selected=!0),w.monthsDropdownContainer.appendChild(t)}}}function $(){var e,n=d("div","flatpickr-month"),t=window.document.createDocumentFragment();w.config.showMonths>1||"static"===w.config.monthSelectorType?e=d("span","cur-month"):(w.monthsDropdownContainer=d("select","flatpickr-monthDropdown-months"),w.monthsDropdownContainer.setAttribute("aria-label",w.l10n.monthAriaLabel),P(w.monthsDropdownContainer,"change",(function(e){var n=g(e),t=parseInt(n.value,10);w.changeMonth(t-w.currentMonth),De("onMonthChange")})),q(),e=w.monthsDropdownContainer);var a=m("cur-year",{tabindex:"-1"}),i=a.getElementsByTagName("input")[0];i.setAttribute("aria-label",w.l10n.yearAriaLabel),w.config.minDate&&i.setAttribute("min",w.config.minDate.getFullYear().toString()),w.config.maxDate&&(i.setAttribute("max",w.config.maxDate.getFullYear().toString()),i.disabled=!!w.config.minDate&&w.config.minDate.getFullYear()===w.config.maxDate.getFullYear());var o=d("div","flatpickr-current-month");return o.appendChild(e),o.appendChild(a),t.appendChild(o),n.appendChild(t),{container:n,yearElement:i,monthElement:e}}function V(){u(w.monthNav),w.monthNav.appendChild(w.prevMonthNav),w.config.showMonths&&(w.yearElements=[],w.monthElements=[]);for(var e=w.config.showMonths;e--;){var n=$();w.yearElements.push(n.yearElement),w.monthElements.push(n.monthElement),w.monthNav.appendChild(n.container)}w.monthNav.appendChild(w.nextMonthNav)}function z(){w.weekdayContainer?u(w.weekdayContainer):w.weekdayContainer=d("div","flatpickr-weekdays");for(var e=w.config.showMonths;e--;){var n=d("div","flatpickr-weekdaycontainer");w.weekdayContainer.appendChild(n)}return G(),w.weekdayContainer}function G(){if(w.weekdayContainer){var e=w.l10n.firstDayOfWeek,t=n(w.l10n.weekdays.shorthand);e>0&&e<t.length&&(t=n(t.splice(e,t.length),t.splice(0,e)));for(var a=w.config.showMonths;a--;)w.weekdayContainer.children[a].innerHTML="\n      <span class='flatpickr-weekday'>\n        "+t.join("</span><span class='flatpickr-weekday'>")+"\n      </span>\n      "}}function Z(e,n){void 0===n&&(n=!0);var t=n?e:e-w.currentMonth;t<0&&!0===w._hidePrevMonthArrow||t>0&&!0===w._hideNextMonthArrow||(w.currentMonth+=t,(w.currentMonth<0||w.currentMonth>11)&&(w.currentYear+=w.currentMonth>11?1:-1,w.currentMonth=(w.currentMonth+12)%12,De("onYearChange"),q()),U(),De("onMonthChange"),Ce())}function Q(e){return w.calendarContainer.contains(e)}function X(e){if(w.isOpen&&!w.config.inline){var n=g(e),t=Q(n),a=!(n===w.input||n===w.altInput||w.element.contains(n)||e.path&&e.path.indexOf&&(~e.path.indexOf(w.input)||~e.path.indexOf(w.altInput)))&&!t&&!Q(e.relatedTarget),i=!w.config.ignoredFocusElements.some((function(e){return e.contains(n)}));a&&i&&(w.config.allowInput&&w.setDate(w._input.value,!1,w.config.altInput?w.config.altFormat:w.config.dateFormat),void 0!==w.timeContainer&&void 0!==w.minuteElement&&void 0!==w.hourElement&&""!==w.input.value&&void 0!==w.input.value&&_(),w.close(),w.config&&"range"===w.config.mode&&1===w.selectedDates.length&&w.clear(!1))}}function ee(e){if(!(!e||w.config.minDate&&e<w.config.minDate.getFullYear()||w.config.maxDate&&e>w.config.maxDate.getFullYear())){var n=e,t=w.currentYear!==n;w.currentYear=n||w.currentYear,w.config.maxDate&&w.currentYear===w.config.maxDate.getFullYear()?w.currentMonth=Math.min(w.config.maxDate.getMonth(),w.currentMonth):w.config.minDate&&w.currentYear===w.config.minDate.getFullYear()&&(w.currentMonth=Math.max(w.config.minDate.getMonth(),w.currentMonth)),t&&(w.redraw(),De("onYearChange"),q())}}function ne(e,n){var t;void 0===n&&(n=!0);var a=w.parseDate(e,void 0,n);if(w.config.minDate&&a&&M(a,w.config.minDate,void 0!==n?n:!w.minDateHasTime)<0||w.config.maxDate&&a&&M(a,w.config.maxDate,void 0!==n?n:!w.maxDateHasTime)>0)return!1;if(!w.config.enable&&0===w.config.disable.length)return!0;if(void 0===a)return!1;for(var i=!!w.config.enable,o=null!==(t=w.config.enable)&&void 0!==t?t:w.config.disable,r=0,l=void 0;r<o.length;r++){if("function"==typeof(l=o[r])&&l(a))return i;if(l instanceof Date&&void 0!==a&&l.getTime()===a.getTime())return i;if("string"==typeof l){var c=w.parseDate(l,void 0,!0);return c&&c.getTime()===a.getTime()?i:!i}if("object"==typeof l&&void 0!==a&&l.from&&l.to&&a.getTime()>=l.from.getTime()&&a.getTime()<=l.to.getTime())return i}return!i}function te(e){return void 0!==w.daysContainer&&(-1===e.className.indexOf("hidden")&&-1===e.className.indexOf("flatpickr-disabled")&&w.daysContainer.contains(e))}function ae(e){var n=e.target===w._input,t=w._input.value.trimEnd()!==Me();!n||!t||e.relatedTarget&&Q(e.relatedTarget)||w.setDate(w._input.value,!0,e.target===w.altInput?w.config.altFormat:w.config.dateFormat)}function ie(e){var n=g(e),t=w.config.wrap?p.contains(n):n===w._input,a=w.config.allowInput,i=w.isOpen&&(!a||!t),o=w.config.inline&&t&&!a;if(13===e.keyCode&&t){if(a)return w.setDate(w._input.value,!0,n===w.altInput?w.config.altFormat:w.config.dateFormat),w.close(),n.blur();w.open()}else if(Q(n)||i||o){var r=!!w.timeContainer&&w.timeContainer.contains(n);switch(e.keyCode){case 13:r?(e.preventDefault(),_(),fe()):me(e);break;case 27:e.preventDefault(),fe();break;case 8:case 46:t&&!w.config.allowInput&&(e.preventDefault(),w.clear());break;case 37:case 39:if(r||t)w.hourElement&&w.hourElement.focus();else{e.preventDefault();var l=k();if(void 0!==w.daysContainer&&(!1===a||l&&te(l))){var c=39===e.keyCode?1:-1;e.ctrlKey?(e.stopPropagation(),Z(c),J(B(1),0)):J(void 0,c)}}break;case 38:case 40:e.preventDefault();var s=40===e.keyCode?1:-1;w.daysContainer&&void 0!==n.$i||n===w.input||n===w.altInput?e.ctrlKey?(e.stopPropagation(),ee(w.currentYear-s),J(B(1),0)):r||J(void 0,7*s):n===w.currentYearElement?ee(w.currentYear-s):w.config.enableTime&&(!r&&w.hourElement&&w.hourElement.focus(),_(e),w._debouncedChange());break;case 9:if(r){var d=[w.hourElement,w.minuteElement,w.secondElement,w.amPM].concat(w.pluginElements).filter((function(e){return e})),u=d.indexOf(n);if(-1!==u){var f=d[u+(e.shiftKey?-1:1)];e.preventDefault(),(f||w._input).focus()}}else!w.config.noCalendar&&w.daysContainer&&w.daysContainer.contains(n)&&e.shiftKey&&(e.preventDefault(),w._input.focus())}}if(void 0!==w.amPM&&n===w.amPM)switch(e.key){case w.l10n.amPM[0].charAt(0):case w.l10n.amPM[0].charAt(0).toLowerCase():w.amPM.textContent=w.l10n.amPM[0],O(),ye();break;case w.l10n.amPM[1].charAt(0):case w.l10n.amPM[1].charAt(0).toLowerCase():w.amPM.textContent=w.l10n.amPM[1],O(),ye()}(t||Q(n))&&De("onKeyDown",e)}function oe(e,n){if(void 0===n&&(n="flatpickr-day"),1===w.selectedDates.length&&(!e||e.classList.contains(n)&&!e.classList.contains("flatpickr-disabled"))){for(var t=e?e.dateObj.getTime():w.days.firstElementChild.dateObj.getTime(),a=w.parseDate(w.selectedDates[0],void 0,!0).getTime(),i=Math.min(t,w.selectedDates[0].getTime()),o=Math.max(t,w.selectedDates[0].getTime()),r=!1,l=0,c=0,s=i;s<o;s+=x)ne(new Date(s),!0)||(r=r||s>i&&s<o,s<a&&(!l||s>l)?l=s:s>a&&(!c||s<c)&&(c=s));Array.from(w.rContainer.querySelectorAll("*:nth-child(-n+"+w.config.showMonths+") > ."+n)).forEach((function(n){var i,o,s,d=n.dateObj.getTime(),u=l>0&&d<l||c>0&&d>c;if(u)return n.classList.add("notAllowed"),void["inRange","startRange","endRange"].forEach((function(e){n.classList.remove(e)}));r&&!u||(["startRange","inRange","endRange","notAllowed"].forEach((function(e){n.classList.remove(e)})),void 0!==e&&(e.classList.add(t<=w.selectedDates[0].getTime()?"startRange":"endRange"),a<t&&d===a?n.classList.add("startRange"):a>t&&d===a&&n.classList.add("endRange"),d>=l&&(0===c||d<=c)&&(o=a,s=t,(i=d)>Math.min(o,s)&&i<Math.max(o,s))&&n.classList.add("inRange")))}))}}function re(){!w.isOpen||w.config.static||w.config.inline||de()}function le(e){return function(n){var t=w.config["_"+e+"Date"]=w.parseDate(n,w.config.dateFormat),a=w.config["_"+("min"===e?"max":"min")+"Date"];void 0!==t&&(w["min"===e?"minDateHasTime":"maxDateHasTime"]=t.getHours()>0||t.getMinutes()>0||t.getSeconds()>0),w.selectedDates&&(w.selectedDates=w.selectedDates.filter((function(e){return ne(e)})),w.selectedDates.length||"min"!==e||F(t),ye()),w.daysContainer&&(ue(),void 0!==t?w.currentYearElement[e]=t.getFullYear().toString():w.currentYearElement.removeAttribute(e),w.currentYearElement.disabled=!!a&&void 0!==t&&a.getFullYear()===t.getFullYear())}}function ce(){return w.config.wrap?p.querySelector("[data-input]"):p}function se(){"object"!=typeof w.config.locale&&void 0===I.l10ns[w.config.locale]&&w.config.errorHandler(new Error("flatpickr: invalid locale "+w.config.locale)),w.l10n=e(e({},I.l10ns.default),"object"==typeof w.config.locale?w.config.locale:"default"!==w.config.locale?I.l10ns[w.config.locale]:void 0),D.D="("+w.l10n.weekdays.shorthand.join("|")+")",D.l="("+w.l10n.weekdays.longhand.join("|")+")",D.M="("+w.l10n.months.shorthand.join("|")+")",D.F="("+w.l10n.months.longhand.join("|")+")",D.K="("+w.l10n.amPM[0]+"|"+w.l10n.amPM[1]+"|"+w.l10n.amPM[0].toLowerCase()+"|"+w.l10n.amPM[1].toLowerCase()+")",void 0===e(e({},v),JSON.parse(JSON.stringify(p.dataset||{}))).time_24hr&&void 0===I.defaultConfig.time_24hr&&(w.config.time_24hr=w.l10n.time_24hr),w.formatDate=b(w),w.parseDate=C({config:w.config,l10n:w.l10n})}function de(e){if("function"!=typeof w.config.position){if(void 0!==w.calendarContainer){De("onPreCalendarPosition");var n=e||w._positionElement,t=Array.prototype.reduce.call(w.calendarContainer.children,(function(e,n){return e+n.offsetHeight}),0),a=w.calendarContainer.offsetWidth,i=w.config.position.split(" "),o=i[0],r=i.length>1?i[1]:null,l=n.getBoundingClientRect(),c=window.innerHeight-l.bottom,d="above"===o||"below"!==o&&c<t&&l.top>t,u=window.pageYOffset+l.top+(d?-t-2:n.offsetHeight+2);if(s(w.calendarContainer,"arrowTop",!d),s(w.calendarContainer,"arrowBottom",d),!w.config.inline){var f=window.pageXOffset+l.left,m=!1,g=!1;"center"===r?(f-=(a-l.width)/2,m=!0):"right"===r&&(f-=a-l.width,g=!0),s(w.calendarContainer,"arrowLeft",!m&&!g),s(w.calendarContainer,"arrowCenter",m),s(w.calendarContainer,"arrowRight",g);var p=window.document.body.offsetWidth-(window.pageXOffset+l.right),h=f+a>window.document.body.offsetWidth,v=p+a>window.document.body.offsetWidth;if(s(w.calendarContainer,"rightMost",h),!w.config.static)if(w.calendarContainer.style.top=u+"px",h)if(v){var D=function(){for(var e=null,n=0;n<document.styleSheets.length;n++){var t=document.styleSheets[n];if(t.cssRules){try{t.cssRules}catch(e){continue}e=t;break}}return null!=e?e:(a=document.createElement("style"),document.head.appendChild(a),a.sheet);var a}();if(void 0===D)return;var b=window.document.body.offsetWidth,C=Math.max(0,b/2-a/2),M=D.cssRules.length,y="{left:"+l.left+"px;right:auto;}";s(w.calendarContainer,"rightMost",!1),s(w.calendarContainer,"centerMost",!0),D.insertRule(".flatpickr-calendar.centerMost:before,.flatpickr-calendar.centerMost:after"+y,M),w.calendarContainer.style.left=C+"px",w.calendarContainer.style.right="auto"}else w.calendarContainer.style.left="auto",w.calendarContainer.style.right=p+"px";else w.calendarContainer.style.left=f+"px",w.calendarContainer.style.right="auto"}}}else w.config.position(w,e)}function ue(){w.config.noCalendar||w.isMobile||(q(),Ce(),U())}function fe(){w._input.focus(),-1!==window.navigator.userAgent.indexOf("MSIE")||void 0!==navigator.msMaxTouchPoints?setTimeout(w.close,0):w.close()}function me(e){e.preventDefault(),e.stopPropagation();var n=f(g(e),(function(e){return e.classList&&e.classList.contains("flatpickr-day")&&!e.classList.contains("flatpickr-disabled")&&!e.classList.contains("notAllowed")}));if(void 0!==n){var t=n,a=w.latestSelectedDateObj=new Date(t.dateObj.getTime()),i=(a.getMonth()<w.currentMonth||a.getMonth()>w.currentMonth+w.config.showMonths-1)&&"range"!==w.config.mode;if(w.selectedDateElem=t,"single"===w.config.mode)w.selectedDates=[a];else if("multiple"===w.config.mode){var o=be(a);o?w.selectedDates.splice(parseInt(o),1):w.selectedDates.push(a)}else"range"===w.config.mode&&(2===w.selectedDates.length&&w.clear(!1,!1),w.latestSelectedDateObj=a,w.selectedDates.push(a),0!==M(a,w.selectedDates[0],!0)&&w.selectedDates.sort((function(e,n){return e.getTime()-n.getTime()})));if(O(),i){var r=w.currentYear!==a.getFullYear();w.currentYear=a.getFullYear(),w.currentMonth=a.getMonth(),r&&(De("onYearChange"),q()),De("onMonthChange")}if(Ce(),U(),ye(),i||"range"===w.config.mode||1!==w.config.showMonths?void 0!==w.selectedDateElem&&void 0===w.hourElement&&w.selectedDateElem&&w.selectedDateElem.focus():W(t),void 0!==w.hourElement&&void 0!==w.hourElement&&w.hourElement.focus(),w.config.closeOnSelect){var l="single"===w.config.mode&&!w.config.enableTime,c="range"===w.config.mode&&2===w.selectedDates.length&&!w.config.enableTime;(l||c)&&fe()}Y()}}w.parseDate=C({config:w.config,l10n:w.l10n}),w._handlers=[],w.pluginElements=[],w.loadedPlugins=[],w._bind=P,w._setHoursFromDate=F,w._positionCalendar=de,w.changeMonth=Z,w.changeYear=ee,w.clear=function(e,n){void 0===e&&(e=!0);void 0===n&&(n=!0);w.input.value="",void 0!==w.altInput&&(w.altInput.value="");void 0!==w.mobileInput&&(w.mobileInput.value="");w.selectedDates=[],w.latestSelectedDateObj=void 0,!0===n&&(w.currentYear=w._initialDate.getFullYear(),w.currentMonth=w._initialDate.getMonth());if(!0===w.config.enableTime){var t=E(w.config),a=t.hours,i=t.minutes,o=t.seconds;A(a,i,o)}w.redraw(),e&&De("onChange")},w.close=function(){w.isOpen=!1,w.isMobile||(void 0!==w.calendarContainer&&w.calendarContainer.classList.remove("open"),void 0!==w._input&&w._input.classList.remove("active"));De("onClose")},w.onMouseOver=oe,w._createElement=d,w.createDay=R,w.destroy=function(){void 0!==w.config&&De("onDestroy");for(var e=w._handlers.length;e--;)w._handlers[e].remove();if(w._handlers=[],w.mobileInput)w.mobileInput.parentNode&&w.mobileInput.parentNode.removeChild(w.mobileInput),w.mobileInput=void 0;else if(w.calendarContainer&&w.calendarContainer.parentNode)if(w.config.static&&w.calendarContainer.parentNode){var n=w.calendarContainer.parentNode;if(n.lastChild&&n.removeChild(n.lastChild),n.parentNode){for(;n.firstChild;)n.parentNode.insertBefore(n.firstChild,n);n.parentNode.removeChild(n)}}else w.calendarContainer.parentNode.removeChild(w.calendarContainer);w.altInput&&(w.input.type="text",w.altInput.parentNode&&w.altInput.parentNode.removeChild(w.altInput),delete w.altInput);w.input&&(w.input.type=w.input._type,w.input.classList.remove("flatpickr-input"),w.input.removeAttribute("readonly"));["_showTimeInput","latestSelectedDateObj","_hideNextMonthArrow","_hidePrevMonthArrow","__hideNextMonthArrow","__hidePrevMonthArrow","isMobile","isOpen","selectedDateElem","minDateHasTime","maxDateHasTime","days","daysContainer","_input","_positionElement","innerContainer","rContainer","monthNav","todayDateElem","calendarContainer","weekdayContainer","prevMonthNav","nextMonthNav","monthsDropdownContainer","currentMonthElement","currentYearElement","navigationCurrentMonth","selectedDateElem","config"].forEach((function(e){try{delete w[e]}catch(e){}}))},w.isEnabled=ne,w.jumpToDate=j,w.updateValue=ye,w.open=function(e,n){void 0===n&&(n=w._positionElement);if(!0===w.isMobile){if(e){e.preventDefault();var t=g(e);t&&t.blur()}return void 0!==w.mobileInput&&(w.mobileInput.focus(),w.mobileInput.click()),void De("onOpen")}if(w._input.disabled||w.config.inline)return;var a=w.isOpen;w.isOpen=!0,a||(w.calendarContainer.classList.add("open"),w._input.classList.add("active"),De("onOpen"),de(n));!0===w.config.enableTime&&!0===w.config.noCalendar&&(!1!==w.config.allowInput||void 0!==e&&w.timeContainer.contains(e.relatedTarget)||setTimeout((function(){return w.hourElement.select()}),50))},w.redraw=ue,w.set=function(e,n){if(null!==e&&"object"==typeof e)for(var a in Object.assign(w.config,e),e)void 0!==ge[a]&&ge[a].forEach((function(e){return e()}));else w.config[e]=n,void 0!==ge[e]?ge[e].forEach((function(e){return e()})):t.indexOf(e)>-1&&(w.config[e]=c(n));w.redraw(),ye(!0)},w.setDate=function(e,n,t){void 0===n&&(n=!1);void 0===t&&(t=w.config.dateFormat);if(0!==e&&!e||e instanceof Array&&0===e.length)return w.clear(n);pe(e,t),w.latestSelectedDateObj=w.selectedDates[w.selectedDates.length-1],w.redraw(),j(void 0,n),F(),0===w.selectedDates.length&&w.clear(!1);ye(n),n&&De("onChange")},w.toggle=function(e){if(!0===w.isOpen)return w.close();w.open(e)};var ge={locale:[se,G],showMonths:[V,S,z],minDate:[j],maxDate:[j],positionElement:[ve],clickOpens:[function(){!0===w.config.clickOpens?(P(w._input,"focus",w.open),P(w._input,"click",w.open)):(w._input.removeEventListener("focus",w.open),w._input.removeEventListener("click",w.open))}]};function pe(e,n){var t=[];if(e instanceof Array)t=e.map((function(e){return w.parseDate(e,n)}));else if(e instanceof Date||"number"==typeof e)t=[w.parseDate(e,n)];else if("string"==typeof e)switch(w.config.mode){case"single":case"time":t=[w.parseDate(e,n)];break;case"multiple":t=e.split(w.config.conjunction).map((function(e){return w.parseDate(e,n)}));break;case"range":t=e.split(w.l10n.rangeSeparator).map((function(e){return w.parseDate(e,n)}))}else w.config.errorHandler(new Error("Invalid date supplied: "+JSON.stringify(e)));w.selectedDates=w.config.allowInvalidPreload?t:t.filter((function(e){return e instanceof Date&&ne(e,!1)})),"range"===w.config.mode&&w.selectedDates.sort((function(e,n){return e.getTime()-n.getTime()}))}function he(e){return e.slice().map((function(e){return"string"==typeof e||"number"==typeof e||e instanceof Date?w.parseDate(e,void 0,!0):e&&"object"==typeof e&&e.from&&e.to?{from:w.parseDate(e.from,void 0),to:w.parseDate(e.to,void 0)}:e})).filter((function(e){return e}))}function ve(){w._positionElement=w.config.positionElement||w._input}function De(e,n){if(void 0!==w.config){var t=w.config[e];if(void 0!==t&&t.length>0)for(var a=0;t[a]&&a<t.length;a++)t[a](w.selectedDates,w.input.value,w,n);"onChange"===e&&(w.input.dispatchEvent(we("change")),w.input.dispatchEvent(we("input")))}}function we(e){var n=document.createEvent("Event");return n.initEvent(e,!0,!0),n}function be(e){for(var n=0;n<w.selectedDates.length;n++){var t=w.selectedDates[n];if(t instanceof Date&&0===M(t,e))return""+n}return!1}function Ce(){w.config.noCalendar||w.isMobile||!w.monthNav||(w.yearElements.forEach((function(e,n){var t=new Date(w.currentYear,w.currentMonth,1);t.setMonth(w.currentMonth+n),w.config.showMonths>1||"static"===w.config.monthSelectorType?w.monthElements[n].textContent=h(t.getMonth(),w.config.shorthandCurrentMonth,w.l10n)+" ":w.monthsDropdownContainer.value=t.getMonth().toString(),e.value=t.getFullYear().toString()})),w._hidePrevMonthArrow=void 0!==w.config.minDate&&(w.currentYear===w.config.minDate.getFullYear()?w.currentMonth<=w.config.minDate.getMonth():w.currentYear<w.config.minDate.getFullYear()),w._hideNextMonthArrow=void 0!==w.config.maxDate&&(w.currentYear===w.config.maxDate.getFullYear()?w.currentMonth+1>w.config.maxDate.getMonth():w.currentYear>w.config.maxDate.getFullYear()))}function Me(e){var n=e||(w.config.altInput?w.config.altFormat:w.config.dateFormat);return w.selectedDates.map((function(e){return w.formatDate(e,n)})).filter((function(e,n,t){return"range"!==w.config.mode||w.config.enableTime||t.indexOf(e)===n})).join("range"!==w.config.mode?w.config.conjunction:w.l10n.rangeSeparator)}function ye(e){void 0===e&&(e=!0),void 0!==w.mobileInput&&w.mobileFormatStr&&(w.mobileInput.value=void 0!==w.latestSelectedDateObj?w.formatDate(w.latestSelectedDateObj,w.mobileFormatStr):""),w.input.value=Me(w.config.dateFormat),void 0!==w.altInput&&(w.altInput.value=Me(w.config.altFormat)),!1!==e&&De("onValueUpdate")}function xe(e){var n=g(e),t=w.prevMonthNav.contains(n),a=w.nextMonthNav.contains(n);t||a?Z(t?-1:1):w.yearElements.indexOf(n)>=0?n.select():n.classList.contains("arrowUp")?w.changeYear(w.currentYear+1):n.classList.contains("arrowDown")&&w.changeYear(w.currentYear-1)}return function(){w.element=w.input=p,w.isOpen=!1,function(){var n=["wrap","weekNumbers","allowInput","allowInvalidPreload","clickOpens","time_24hr","enableTime","noCalendar","altInput","shorthandCurrentMonth","inline","static","enableSeconds","disableMobile"],i=e(e({},JSON.parse(JSON.stringify(p.dataset||{}))),v),o={};w.config.parseDate=i.parseDate,w.config.formatDate=i.formatDate,Object.defineProperty(w.config,"enable",{get:function(){return w.config._enable},set:function(e){w.config._enable=he(e)}}),Object.defineProperty(w.config,"disable",{get:function(){return w.config._disable},set:function(e){w.config._disable=he(e)}});var r="time"===i.mode;if(!i.dateFormat&&(i.enableTime||r)){var l=I.defaultConfig.dateFormat||a.dateFormat;o.dateFormat=i.noCalendar||r?"H:i"+(i.enableSeconds?":S":""):l+" H:i"+(i.enableSeconds?":S":"")}if(i.altInput&&(i.enableTime||r)&&!i.altFormat){var s=I.defaultConfig.altFormat||a.altFormat;o.altFormat=i.noCalendar||r?"h:i"+(i.enableSeconds?":S K":" K"):s+" h:i"+(i.enableSeconds?":S":"")+" K"}Object.defineProperty(w.config,"minDate",{get:function(){return w.config._minDate},set:le("min")}),Object.defineProperty(w.config,"maxDate",{get:function(){return w.config._maxDate},set:le("max")});var d=function(e){return function(n){w.config["min"===e?"_minTime":"_maxTime"]=w.parseDate(n,"H:i:S")}};Object.defineProperty(w.config,"minTime",{get:function(){return w.config._minTime},set:d("min")}),Object.defineProperty(w.config,"maxTime",{get:function(){return w.config._maxTime},set:d("max")}),"time"===i.mode&&(w.config.noCalendar=!0,w.config.enableTime=!0);Object.assign(w.config,o,i);for(var u=0;u<n.length;u++)w.config[n[u]]=!0===w.config[n[u]]||"true"===w.config[n[u]];t.filter((function(e){return void 0!==w.config[e]})).forEach((function(e){w.config[e]=c(w.config[e]||[]).map(T)})),w.isMobile=!w.config.disableMobile&&!w.config.inline&&"single"===w.config.mode&&!w.config.disable.length&&!w.config.enable&&!w.config.weekNumbers&&/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);for(u=0;u<w.config.plugins.length;u++){var f=w.config.plugins[u](w)||{};for(var m in f)t.indexOf(m)>-1?w.config[m]=c(f[m]).map(T).concat(w.config[m]):void 0===i[m]&&(w.config[m]=f[m])}i.altInputClass||(w.config.altInputClass=ce().className+" "+w.config.altInputClass);De("onParseConfig")}(),se(),function(){if(w.input=ce(),!w.input)return void w.config.errorHandler(new Error("Invalid input element specified"));w.input._type=w.input.type,w.input.type="text",w.input.classList.add("flatpickr-input"),w._input=w.input,w.config.altInput&&(w.altInput=d(w.input.nodeName,w.config.altInputClass),w._input=w.altInput,w.altInput.placeholder=w.input.placeholder,w.altInput.disabled=w.input.disabled,w.altInput.required=w.input.required,w.altInput.tabIndex=w.input.tabIndex,w.altInput.type="text",w.input.setAttribute("type","hidden"),!w.config.static&&w.input.parentNode&&w.input.parentNode.insertBefore(w.altInput,w.input.nextSibling));w.config.allowInput||w._input.setAttribute("readonly","readonly");ve()}(),function(){w.selectedDates=[],w.now=w.parseDate(w.config.now)||new Date;var e=w.config.defaultDate||("INPUT"!==w.input.nodeName&&"TEXTAREA"!==w.input.nodeName||!w.input.placeholder||w.input.value!==w.input.placeholder?w.input.value:null);e&&pe(e,w.config.dateFormat);w._initialDate=w.selectedDates.length>0?w.selectedDates[0]:w.config.minDate&&w.config.minDate.getTime()>w.now.getTime()?w.config.minDate:w.config.maxDate&&w.config.maxDate.getTime()<w.now.getTime()?w.config.maxDate:w.now,w.currentYear=w._initialDate.getFullYear(),w.currentMonth=w._initialDate.getMonth(),w.selectedDates.length>0&&(w.latestSelectedDateObj=w.selectedDates[0]);void 0!==w.config.minTime&&(w.config.minTime=w.parseDate(w.config.minTime,"H:i"));void 0!==w.config.maxTime&&(w.config.maxTime=w.parseDate(w.config.maxTime,"H:i"));w.minDateHasTime=!!w.config.minDate&&(w.config.minDate.getHours()>0||w.config.minDate.getMinutes()>0||w.config.minDate.getSeconds()>0),w.maxDateHasTime=!!w.config.maxDate&&(w.config.maxDate.getHours()>0||w.config.maxDate.getMinutes()>0||w.config.maxDate.getSeconds()>0)}(),w.utils={getDaysInMonth:function(e,n){return void 0===e&&(e=w.currentMonth),void 0===n&&(n=w.currentYear),1===e&&(n%4==0&&n%100!=0||n%400==0)?29:w.l10n.daysInMonth[e]}},w.isMobile||function(){var e=window.document.createDocumentFragment();if(w.calendarContainer=d("div","flatpickr-calendar"),w.calendarContainer.tabIndex=-1,!w.config.noCalendar){if(e.appendChild((w.monthNav=d("div","flatpickr-months"),w.yearElements=[],w.monthElements=[],w.prevMonthNav=d("span","flatpickr-prev-month"),w.prevMonthNav.innerHTML=w.config.prevArrow,w.nextMonthNav=d("span","flatpickr-next-month"),w.nextMonthNav.innerHTML=w.config.nextArrow,V(),Object.defineProperty(w,"_hidePrevMonthArrow",{get:function(){return w.__hidePrevMonthArrow},set:function(e){w.__hidePrevMonthArrow!==e&&(s(w.prevMonthNav,"flatpickr-disabled",e),w.__hidePrevMonthArrow=e)}}),Object.defineProperty(w,"_hideNextMonthArrow",{get:function(){return w.__hideNextMonthArrow},set:function(e){w.__hideNextMonthArrow!==e&&(s(w.nextMonthNav,"flatpickr-disabled",e),w.__hideNextMonthArrow=e)}}),w.currentYearElement=w.yearElements[0],Ce(),w.monthNav)),w.innerContainer=d("div","flatpickr-innerContainer"),w.config.weekNumbers){var n=function(){w.calendarContainer.classList.add("hasWeeks");var e=d("div","flatpickr-weekwrapper");e.appendChild(d("span","flatpickr-weekday",w.l10n.weekAbbreviation));var n=d("div","flatpickr-weeks");return e.appendChild(n),{weekWrapper:e,weekNumbers:n}}(),t=n.weekWrapper,a=n.weekNumbers;w.innerContainer.appendChild(t),w.weekNumbers=a,w.weekWrapper=t}w.rContainer=d("div","flatpickr-rContainer"),w.rContainer.appendChild(z()),w.daysContainer||(w.daysContainer=d("div","flatpickr-days"),w.daysContainer.tabIndex=-1),U(),w.rContainer.appendChild(w.daysContainer),w.innerContainer.appendChild(w.rContainer),e.appendChild(w.innerContainer)}w.config.enableTime&&e.appendChild(function(){w.calendarContainer.classList.add("hasTime"),w.config.noCalendar&&w.calendarContainer.classList.add("noCalendar");var e=E(w.config);w.timeContainer=d("div","flatpickr-time"),w.timeContainer.tabIndex=-1;var n=d("span","flatpickr-time-separator",":"),t=m("flatpickr-hour",{"aria-label":w.l10n.hourAriaLabel});w.hourElement=t.getElementsByTagName("input")[0];var a=m("flatpickr-minute",{"aria-label":w.l10n.minuteAriaLabel});w.minuteElement=a.getElementsByTagName("input")[0],w.hourElement.tabIndex=w.minuteElement.tabIndex=-1,w.hourElement.value=o(w.latestSelectedDateObj?w.latestSelectedDateObj.getHours():w.config.time_24hr?e.hours:function(e){switch(e%24){case 0:case 12:return 12;default:return e%12}}(e.hours)),w.minuteElement.value=o(w.latestSelectedDateObj?w.latestSelectedDateObj.getMinutes():e.minutes),w.hourElement.setAttribute("step",w.config.hourIncrement.toString()),w.minuteElement.setAttribute("step",w.config.minuteIncrement.toString()),w.hourElement.setAttribute("min",w.config.time_24hr?"0":"1"),w.hourElement.setAttribute("max",w.config.time_24hr?"23":"12"),w.hourElement.setAttribute("maxlength","2"),w.minuteElement.setAttribute("min","0"),w.minuteElement.setAttribute("max","59"),w.minuteElement.setAttribute("maxlength","2"),w.timeContainer.appendChild(t),w.timeContainer.appendChild(n),w.timeContainer.appendChild(a),w.config.time_24hr&&w.timeContainer.classList.add("time24hr");if(w.config.enableSeconds){w.timeContainer.classList.add("hasSeconds");var i=m("flatpickr-second");w.secondElement=i.getElementsByTagName("input")[0],w.secondElement.value=o(w.latestSelectedDateObj?w.latestSelectedDateObj.getSeconds():e.seconds),w.secondElement.setAttribute("step",w.minuteElement.getAttribute("step")),w.secondElement.setAttribute("min","0"),w.secondElement.setAttribute("max","59"),w.secondElement.setAttribute("maxlength","2"),w.timeContainer.appendChild(d("span","flatpickr-time-separator",":")),w.timeContainer.appendChild(i)}w.config.time_24hr||(w.amPM=d("span","flatpickr-am-pm",w.l10n.amPM[r((w.latestSelectedDateObj?w.hourElement.value:w.config.defaultHour)>11)]),w.amPM.title=w.l10n.toggleTitle,w.amPM.tabIndex=-1,w.timeContainer.appendChild(w.amPM));return w.timeContainer}());s(w.calendarContainer,"rangeMode","range"===w.config.mode),s(w.calendarContainer,"animate",!0===w.config.animate),s(w.calendarContainer,"multiMonth",w.config.showMonths>1),w.calendarContainer.appendChild(e);var i=void 0!==w.config.appendTo&&void 0!==w.config.appendTo.nodeType;if((w.config.inline||w.config.static)&&(w.calendarContainer.classList.add(w.config.inline?"inline":"static"),w.config.inline&&(!i&&w.element.parentNode?w.element.parentNode.insertBefore(w.calendarContainer,w._input.nextSibling):void 0!==w.config.appendTo&&w.config.appendTo.appendChild(w.calendarContainer)),w.config.static)){var l=d("div","flatpickr-wrapper");w.element.parentNode&&w.element.parentNode.insertBefore(l,w.element),l.appendChild(w.element),w.altInput&&l.appendChild(w.altInput),l.appendChild(w.calendarContainer)}w.config.static||w.config.inline||(void 0!==w.config.appendTo?w.config.appendTo:window.document.body).appendChild(w.calendarContainer)}(),function(){w.config.wrap&&["open","close","toggle","clear"].forEach((function(e){Array.prototype.forEach.call(w.element.querySelectorAll("[data-"+e+"]"),(function(n){return P(n,"click",w[e])}))}));if(w.isMobile)return void function(){var e=w.config.enableTime?w.config.noCalendar?"time":"datetime-local":"date";w.mobileInput=d("input",w.input.className+" flatpickr-mobile"),w.mobileInput.tabIndex=1,w.mobileInput.type=e,w.mobileInput.disabled=w.input.disabled,w.mobileInput.required=w.input.required,w.mobileInput.placeholder=w.input.placeholder,w.mobileFormatStr="datetime-local"===e?"Y-m-d\\TH:i:S":"date"===e?"Y-m-d":"H:i:S",w.selectedDates.length>0&&(w.mobileInput.defaultValue=w.mobileInput.value=w.formatDate(w.selectedDates[0],w.mobileFormatStr));w.config.minDate&&(w.mobileInput.min=w.formatDate(w.config.minDate,"Y-m-d"));w.config.maxDate&&(w.mobileInput.max=w.formatDate(w.config.maxDate,"Y-m-d"));w.input.getAttribute("step")&&(w.mobileInput.step=String(w.input.getAttribute("step")));w.input.type="hidden",void 0!==w.altInput&&(w.altInput.type="hidden");try{w.input.parentNode&&w.input.parentNode.insertBefore(w.mobileInput,w.input.nextSibling)}catch(e){}P(w.mobileInput,"change",(function(e){w.setDate(g(e).value,!1,w.mobileFormatStr),De("onChange"),De("onClose")}))}();var e=l(re,50);w._debouncedChange=l(Y,300),w.daysContainer&&!/iPhone|iPad|iPod/i.test(navigator.userAgent)&&P(w.daysContainer,"mouseover",(function(e){"range"===w.config.mode&&oe(g(e))}));P(w._input,"keydown",ie),void 0!==w.calendarContainer&&P(w.calendarContainer,"keydown",ie);w.config.inline||w.config.static||P(window,"resize",e);void 0!==window.ontouchstart?P(window.document,"touchstart",X):P(window.document,"mousedown",X);P(window.document,"focus",X,{capture:!0}),!0===w.config.clickOpens&&(P(w._input,"focus",w.open),P(w._input,"click",w.open));void 0!==w.daysContainer&&(P(w.monthNav,"click",xe),P(w.monthNav,["keyup","increment"],N),P(w.daysContainer,"click",me));if(void 0!==w.timeContainer&&void 0!==w.minuteElement&&void 0!==w.hourElement){var n=function(e){return g(e).select()};P(w.timeContainer,["increment"],_),P(w.timeContainer,"blur",_,{capture:!0}),P(w.timeContainer,"click",H),P([w.hourElement,w.minuteElement],["focus","click"],n),void 0!==w.secondElement&&P(w.secondElement,"focus",(function(){return w.secondElement&&w.secondElement.select()})),void 0!==w.amPM&&P(w.amPM,"click",(function(e){_(e)}))}w.config.allowInput&&P(w._input,"blur",ae)}(),(w.selectedDates.length||w.config.noCalendar)&&(w.config.enableTime&&F(w.config.noCalendar?w.latestSelectedDateObj:void 0),ye(!1)),S();var n=/^((?!chrome|android).)*safari/i.test(navigator.userAgent);!w.isMobile&&n&&de(),De("onReady")}(),w}function T(e,n){for(var t=Array.prototype.slice.call(e).filter((function(e){return e instanceof HTMLElement})),a=[],i=0;i<t.length;i++){var o=t[i];try{if(null!==o.getAttribute("data-fp-omit"))continue;void 0!==o._flatpickr&&(o._flatpickr.destroy(),o._flatpickr=void 0),o._flatpickr=k(o,n||{}),a.push(o._flatpickr)}catch(e){console.error(e)}}return 1===a.length?a[0]:a}"undefined"!=typeof HTMLElement&&"undefined"!=typeof HTMLCollection&&"undefined"!=typeof NodeList&&(HTMLCollection.prototype.flatpickr=NodeList.prototype.flatpickr=function(e){return T(this,e)},HTMLElement.prototype.flatpickr=function(e){return T([this],e)});var I=function(e,n){return"string"==typeof e?T(window.document.querySelectorAll(e),n):e instanceof Node?T([e],n):T(e,n)};return I.defaultConfig={},I.l10ns={en:e({},i),default:e({},i)},I.localize=function(n){I.l10ns.default=e(e({},I.l10ns.default),n)},I.setDefaults=function(n){I.defaultConfig=e(e({},I.defaultConfig),n)},I.parseDate=C({}),I.formatDate=b({}),I.compareDates=M,"undefined"!=typeof jQuery&&void 0!==jQuery.fn&&(jQuery.fn.flatpickr=function(e){return T(this,e)}),Date.prototype.fp_incr=function(e){return new Date(this.getFullYear(),this.getMonth(),this.getDate()+("string"==typeof e?parseInt(e,10):e))},"undefined"!=typeof window&&(window.flatpickr=I),I}));
(function (global, factory) {
  typeof exports === 'object' && typeof module !== 'undefined' ? factory(exports) :
  typeof define === 'function' && define.amd ? define(['exports'], factory) :
  (global = typeof globalThis !== 'undefined' ? globalThis : global || self, factory(global.zh = {}));
}(this, (function (exports) { 'use strict';

  var fp = typeof window !== "undefined" && window.flatpickr !== undefined
      ? window.flatpickr
      : {
          l10ns: {},
      };
  var Mandarin = {
      weekdays: {
          shorthand: ["周日", "周一", "周二", "周三", "周四", "周五", "周六"],
          longhand: [
              "星期日",
              "星期一",
              "星期二",
              "星期三",
              "星期四",
              "星期五",
              "星期六",
          ],
      },
      months: {
          shorthand: [
              "一月",
              "二月",
              "三月",
              "四月",
              "五月",
              "六月",
              "七月",
              "八月",
              "九月",
              "十月",
              "十一月",
              "十二月",
          ],
          longhand: [
              "一月",
              "二月",
              "三月",
              "四月",
              "五月",
              "六月",
              "七月",
              "八月",
              "九月",
              "十月",
              "十一月",
              "十二月",
          ],
      },
      rangeSeparator: " 至 ",
      weekAbbreviation: "周",
      scrollTitle: "滚动切换",
      toggleTitle: "点击切换 12/24 小时时制",
  };
  fp.l10ns.zh = Mandarin;
  var zh = fp.l10ns;

  exports.Mandarin = Mandarin;
  exports.default = zh;

  Object.defineProperty(exports, '__esModule', { value: true });

})));

    return window.flatpickr;
  }
  const FLATPICKR_CSS_GZIP_BASE64 = "H4sIAAAAAAACCtUby5LbuPHur2DW5VrLFrXUazQjXjaxK1V78GWzqT1s9kCR4IgZimSR1DzM0r+n8SLxFiV7korl0ohAo9Hd6Bca4CzNo7bK4ofaj6McFUlUd7sofrivy2ORbNs6KpoqqlHRhmUVxVn7sg3CJGuqPHrZFmWBwhY9t36UZ/fFNgYwVIePWZPtshzD7rMkQUVYRUmSFfcw1H9Cu4cMBhTZIWqzsqBIlMckq1FMHvO2DndlnaAaBqdl0fpN9hVt56vqOcyzAvl7lN3v2+0CN1BAv46S7Nhs19BSlU1G8ES7psyPLQqfsqTdb5fBZna7wRCcoF35jFFjKhkaaAnNrf6h8dvyGO/9iFJ5APqrY044CO09gmDfpmkqz72PkvJpO6+evQA+b9EN/kx9tSHwaMvw7KsNS3ie46/6fhe9D6bkMwtuJ+F/a6LTTFerWVmhYmrqyAq8kh3Xr3l4iJ75ut6sAlgkQaPIzxxZZ+i4clKs/i4v44fwq58VCXre3uF/xrFUAxHFoWtpWv09StAvxefyqfCWQXBovPi4y2J/h75mqH4/Wyyn8+lsuZjOJ+F1w04O2XCmKDe9VtcIa9YjGGFZbRfVsxFF0wJM3OmmgAcBVPx+HgTvvI8eIJg4MFDRCJIMJaqMIw/HvM2+gNnuPaE7iV4abwbfn6AnAv7qLUD48T7Lk/fFx/lEAQYp/BoV90iA2hQfN5POYEDYf3h/yQ5VWbcReC171/cjeDGO4LmRYH+hGN5afg4vgDWx5M32UfM7Qg8KB1Mb7G/ZAcmgXe/72rY8gCOWnv0aWyr3umpnjtKh7xL6+KQYgXnkQOzQ18Jzx3wHcR0MC9Z17L5A9bPEJa5ZUX4aiT86tqUJxXaH0rJGJgFvoxQipMEWVQPPcCT10SNE1IbGRBYFKQNiXI5BYvB3++OPISMsYFEuCInwFjbPQBbuS9m0DopnUV2XT78SvA6oARXh8BwmKgZCHZZiWNMgbiOUjPxEsouzpDIwYYZ18I5NAL8cC8Y1jgoPJweHqL7Pii2EvrWZMjaNNHAlDVy5WPoNtPIcPxiGz0LMD3vrMShlq/XjMi/rrUvztekMwyFtsY/9GyXwHEcMjM5CDNPJkYS1G+x5LEfSdPpwC0fbtIyPTVceWxyAZQf0VEdVJZpxH4dNyYc48oAjS9OHcyEchGpbmiOhETJO3CAC4mcdt6e22NJ5yr6Uud1NwjTLc62RuZWlmnTPDcm/LhPO0LEBwTcoh8yeejSg76uptdEbtYbyEdVpDiGR7TDEwIoFA7SJgsSPTITwk/5xy66q0SNtnjrhCiwBKuhXYZRIOEFxWQv7o/hYN7B4LEyE5tQukNaNb8HmOCjyJG55gRaMFZeYCWVNBLl6MlaChqGduNccS4KXjZ3Ry3QjvoLRy5XFOLj76cMbj/z76UPd5uDycBAB4wLH9+EnmggpIOCreoCTc/gbx8g3l7M8sHIFy4LROGmmUft/y/N2j33NWCYpdMdiy936DkV3p4tm8prH+8tmwyM6YrJv05vVZrUZbScXTEUmoQkOKb7wEKDkN+em86povMb0A3rXSgIYNVfMsDebN6GpjUgjK/aozmCfVxwPvxTVsf3dGreljF4B9zL8MNWaIZCaqw0WDFx6JNkxQmxJnI9zBEU42e/ZwJlYIEvBYaPKCn93hGynmJ4bkRWFPKLjKetQooNxEcg2RhYiiAD02FNLe5C5GHwCb0U2rItBgXByLuYU+HmoNCqBju2Bho0ciVHrzZT+D2bz9eSaip6ZN2bLQv4khURcsTEOw6W/R2Qdt7COIxmqvBPkm7sfftCjvBkNTXr/WXU0B1C27u4xcpJMAs6ql7WYPPJKK91nu0DYxCvrkt1MaPXq5p2LNlxAIxytg7Nwr8AFnvksCysbaYLvZD7J7XD4GOr79GRsrWvQGV0NrEOoFfe1V2krdKyxDFigForvy7Vss5wpAvLEks4gYMkl77XV4jcYG16k+WIGP7mv2MxWt6y6FSi7DjGvNZZ79W2JFEBgI3mgeyHgFS0TKqZJ6Oq0CoYqHzSJckqjQ5a/GAWz0QRjZIG6Y6q9s3W8H3zoWErGqIQNkxYy6VLdAB1s0eL9v4Kz2103UofrkYoOjo3I6Al0vzCUAEbjJzGUCPgF2c/JrjlRkhWCRT2sxULoxB+iCX2kNirOYKeS9jk0EpuqyZwFHzWcwclnbEEIKgZnA1HOzC0rwMaj3JREYHbSDOUJ3Q8be0yNY9fDVbFxjfuD7zX/nF48gtmY4BshuzNtqiEvsaiLodbr0HAlcf5clxUcDBS8sCTI74CKY541rW1etqJCbVks4Y9WUp6aXad2ooqZVJCpen84GYR8eQndBuPQc/szGmo54tX1txeoqr59B3WN2rHAJStIlXh69XCWe4pSup6WbwkgbtRn+oU5mY+WLiIYVUAq0MJxEj6zs7loPT9Q64nDXi38bsVaSeWM2Qlp9LMWHZq+iyGTBxgA+UWIW3lDzkXh6W1xf9T2OiyOrcOSKK1R1zEHk6A0gkNZwcHcwaKML2qvVxMlfezjp64G8ubrCmYkD7crc/AnJ+uxK+a06frKLPdxJ+Xk2VCvUNX1NXUUTv/r1qiiRC9Zt6ymtNECq1zBUdnV47h0LDzcJeohxIXECbN2yecAmbTWBpdMvsdlIGMS5hLz6DWS1oPIDx88bfFXqDz24jc0wdbuYfvvY9Nm6UuPjj37vL4ABhQjPyIWFTo7v3knFQqbTXFl4QaKvNKmyxJzx+WIuf0yBPYngssQD9TnztIAzYjm6+BK7WCF4OUd/hhzpid+WWGomM0Wt+vNfLV8J6/+LmqyRu7u17hGKYL4m/DrcQOMZaig/ndDNY78Fr0laXBvOOwnflgkRPuUMKfqlxrqxDEWWM11n8w3cKZKM65Gk+s9n+0wuAB9DqYtx07ihJSmckHqpxDqRGYIcQIjhJ5waoiNEBJi6rEV7R7cs3jvsbdbYiLWI/xexp0MqZ+o9JBmAdAuSqAJlUQcazLfDMDY6MmsfKJJ2nFgM64wHDkZ2zkmm2YMGG0QHLMVA5vBvH4DfnM/x24ZzXEbZS7gNvb3uM2juWREJXSIxwXWy8iJi08o6rRjQhdYP6EIJIaet+ubuzTdhJari+p9RUEXFZuheGwK6tBIgZPzaiuAdMr16oCFW/zDSoZV/QcibCA9CfyHQgCdmX4FI+SA84te84qyfa/ezpyMktTlaAyyPI/EnP1wmXMtcnWOEMmY5blkpQywBq2xhGp1eU0m4q8vuCy7Hn9ZFpPhvrdihjgfll1xU+sr27/msKvTZx563MgHMMn/CNti4dhqOXHXBg2lF3lP/v0kyHMHYACyOsJBaCZaviePceJddK/clykRNZTp2mFVZ2BVYuh+vNNegTnNaqzjX8oEKXfF2cE7v6Gs1m74XUPY7Uct2d1aIDxrYQHe5Fio2xfjSyCO90NGTor5oZSS4CVU0aSXdW6tfHpKMSiRldwNyXRJLuIINAx7HiG0jrcKpSAlFNBFZsjNik9aaU2pC3zXOs3YzahSNRKpNlAsb/K0N7guul6hXKA31F/7zYIssP5Gu6g/5GK/8JLQ6trd+auV0VSO2dGjcJuDQ7fYC4bkzg9Q1u7VkfpR7DVVSXYzHWxAFJnZpxhnHXtWyyodl+BzHc1a0OE3M/4Bd2KLpLEdVZP7JMoo/LVY7WvbmNWdNoZd3Rpz1OtI4q2np7oh9LWWweKUMzHTOZlcZlLek3QXaEa/9Pg6J7qDkIXGfXlkh6pCJf3sKKjywq2S6TmwhihOpxTfzNjVWnS/krqCy88wC+hI1Jb11AEZHfzq0Km3aHqrHLvUgpCYpS/evc61e/kUAHpSrXiHy/2mwyoB+HRWJIPAWfi+facWT3XTGbeiWsZupMACJijFeRSs6CQWv5CSKgC2P2oEjqLIX/5UCminn7m0H9BLWkcH1Hji+6RdWpeHbrgrea4w7y/A57uK8xzg1JbCy7jffnPq9PP/OwP/ATTgCv4mPwAA";

  // Standard short-context USD / 1M tokens, synced from official pricing on 2026-07-10.
  const FALLBACK_DEFAULT_PRICES = {
    "gpt-5.6-sol": { input: 5, cachedInput: 0.5, cacheWrite: 6.25, output: 30 },
    "gpt-5.6-terra": { input: 2.5, cachedInput: 0.25, cacheWrite: 3.125, output: 15 },
    "gpt-5.6-luna": { input: 1, cachedInput: 0.1, cacheWrite: 1.25, output: 6 },
    "gpt-5.3-codex": { input: 1.75, cachedInput: 0.175, output: 14 },
    "gpt-5.4": { input: 2.5, cachedInput: 0.25, output: 15 },
    "gpt-5.4-mini": { input: 0.75, cachedInput: 0.075, output: 4.5 },
    "gpt-5.4-nano": { input: 0.2, cachedInput: 0.02, output: 1.25 },
    "gpt-5.4-pro": { input: 30, cachedInput: null, output: 180 },
    "gpt-5.5": { input: 5, cachedInput: 0.5, output: 30 },
    "gpt-5.5-pro": { input: 30, cachedInput: null, output: 180 },
  };
  const DEFAULT_PRICES = loadDefaultPrices();

  if (window.__codexLiveTokenCostVersion && window.__codexLiveTokenCostVersion !== VERSION) {
    try {
      window.__codexLiveTokenCost?.destroy?.();
    } catch {
      // A stale userscript should not block the new version from loading.
    }
  }
  if (window.__codexLiveTokenCostVersion === VERSION) return;
  window.__codexLiveTokenCostVersion = VERSION;

  const state = {
    root: null,
    settingsButton: null,
    settingsOverlay: null,
    settingsOverlayCloseTimer: 0,
    started: false,
    startedAt: Date.now(),
    renderTimer: 0,
    lastRenderAt: 0,
    mainEditable: null,
    mainEditableAt: 0,
    running: false,
    lastExactTurnId: "",
    lastClickedSidebarThreadKey: "",
    lastClickedSidebarThreadAt: 0,
    userSelectedSidebarThreadKey: "",
    userSelectedSidebarThreadAt: 0,
    detectedSessionKey: "",
    detectedSessionKeyAt: 0,
    newConversationSessionKey: "",
    newConversationSessionKeyAt: 0,
    startupSessionKey: `new:startup:${Date.now().toString(36)}`,
    localLedger: [],
    localUsageArchive: { version: 1, updatedAt: 0, days: {} },
    localLedgerLoaded: false,
    localLast: null,
    localCurrentTurn: null,
    localCurrentTurns: new Map(),
    localTurnTimer: 0,
    localTurnTimers: new Map(),
    localTurnSeq: 0,
    localSeenUsage: new Map(),
    localPersistedUsage: new Map(),
    legacySessionMigrations: new Set(),
    sessionAliases: new Map(),
    localMessageHandler: null,
    profileRequestIds: new Map(),
    codexModulePromises: new Map(),
    detectedModel: "",
    detectedEffort: "",
    detectedFastMode: false,
    priceEditorOpen: false,
    priceEditorModel: "",
    settingsPanel: "profile",
    analyticsPreset: "today",
    analyticsMetric: "tokens",
    analyticsCustomStart: "",
    analyticsCustomEnd: "",
    analyticsModel: "",
    analyticsModelsExpanded: false,
    analyticsRollup: null,
    analyticsRollupLoaded: false,
    analyticsTimer: 0,
    analyticsCalendar: null,
    flatpickrPromise: null,
    badProfileImageUrl: "",
    profilePrefs: null,
    profileSaveStatus: "",
    profileSaveStatusTone: "",
    profileSaveStatusTimer: 0,
    profileQueryClient: null,
    profileAccountsRefreshPromise: null,
    profileIdentitySyncTimer: 0,
    profileIdentityObserver: null,
    profileUsageRefreshTimer: 0,
    profileUsageRefreshRequests: 0,
    hubVisibilityTimer: 0,
    hubVisibilityObserver: null,
    profileAvatarSourceUrl: "",
    profileAvatarRenderUrl: "",
    officialModelObserver: null,
    officialModelRootObserver: null,
    officialModelTrigger: null,
    taskRunningObserver: null,
    taskRunningDom: false,
    helperStats: null,
    helperStatsSignature: "",
    helperStatsAt: 0,
    profileDataRefreshAttemptAt: 0,
    profileDataRefreshAt: 0,
    profileDataRefreshPromise: null,
    helperStatus: HELPER_STATUS_DEFAULT,
    helperUnavailable: false,
    helperCheckedAt: 0,
    helperPollInFlight: false,
    helperPollPromise: null,
    helperThreadContent: new Map(),
    helperThreadContentInFlight: new Set(),
    ccSwitchSyncInFlight: false,
    ccSwitchSyncPromise: null,
    ccSwitchStartupSyncStarted: false,
    ccSwitchSyncStatus: "",
    settingsStatusPulseFrame: 0,
    settingsFocusFrame: 0,
    analyticsRangeSwitchFrame: 0,
    analyticsRangeSwitchTimer: 0,
    hubValueCache: new Map(),
    hubSkeletonVersion: "",
    shimmerDelayTimer: 0,
    shimmerIntervalTimer: 0,
    shimmerActiveTimer: 0,
    shimmerActiveStartedAt: 0,
    shimmerActiveUntil: 0,
    shimmerRunning: false,
    turnShimmerRunning: false,
    turnShimmerStartedAt: 0,
    turnShimmerOutputStartedAt: 0,
    turnShimmerSessions: new Map(),
    officialThreadRuntimeStates: new Map(),
    runtimeSessionBindings: new Map(),
  };

  function toCount(value) {
    const n = Number(value);
    return Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
  }

  function toTimestampMs(value) {
    if (value == null || value === "") return 0;
    const n = Number(value);
    if (Number.isFinite(n) && n > 0) return Math.round(n < 10_000_000_000 ? n * 1000 : n);
    const parsed = Date.parse(String(value));
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  }

  function firstTimestampMs(...values) {
    for (const value of values) {
      const timestamp = toTimestampMs(value);
      if (timestamp) return timestamp;
    }
    return 0;
  }

  function fmtCount(value) {
    const n = toCount(value);
    for (const [unit, suffix] of [
      [1_000_000_000, "B"],
      [1_000_000, "M"],
      [1_000, "K"],
    ]) {
      if (n >= unit) {
        return `${(n / unit).toFixed(n < unit * 10 ? 1 : 0).replace(/\\.0$/, "")}${suffix}`;
      }
    }
    return String(n);
  }

  function fmtMoney(value) {
    const n = Number(value);
    if (!Number.isFinite(n) || n <= 0) return "$0.00";
    return `$${n.toFixed(2)}`;
  }

  function fmtPercent(numerator, denominator) {
    const total = toCount(denominator);
    return total ? `${Math.round((toCount(numerator) / total) * 100)}%` : "0%";
  }

  function loadJson(key, fallback) {
    try {
      const parsed = JSON.parse(localStorage.getItem(key) || "null");
      return parsed && typeof parsed === "object" ? parsed : fallback;
    } catch {
      return fallback;
    }
  }

  function loadJsonFromString(value, fallback) {
    try {
      const parsed = JSON.parse(String(value || "null"));
      return parsed && typeof parsed === "object" ? parsed : fallback;
    } catch {
      return fallback;
    }
  }

  function loadDefaultPrices() {
    return { ...FALLBACK_DEFAULT_PRICES, ...normalizePriceTable(globalThis?.[PRICE_DATA_SOURCE_KEY]) };
  }

  function normalizePriceTable(source) {
    if (!source || typeof source !== "object" || Array.isArray(source)) return {};
    return Object.fromEntries(
      Object.entries(source)
        .map(([model, price]) => [normalizeText(model, 120), normalizePrice(price)])
        .filter(([model, price]) => model && price),
    );
  }

  function hubVisible() {
    try {
      return localStorage.getItem(HUB_VISIBLE_KEY) !== "false";
    } catch {
      return true;
    }
  }

  function saveHubVisible(value) {
    try {
      localStorage.setItem(HUB_VISIBLE_KEY, value ? "true" : "false");
    } catch {
      // Keep the setting best-effort; DOM sync can still use the default.
    }
    return value;
  }

  function hasCodexProjectContextRow(doc = document) {
    return Boolean(doc?.querySelector?.(PROJECT_CONTEXT_ROW_SELECTOR));
  }

  function syncHubVisibility(root = state.root, doc = document) {
    const projectContextRow = hasCodexProjectContextRow(doc);
    const visible = hubVisible() && !projectContextRow;
    const target = root?.style ? root : state.root;
    if (!target?.style) return visible;
    target.dataset.cltcHubVisible = String(visible);
    target.dataset.cltcProjectContextRow = String(projectContextRow);
    target.setAttribute?.("aria-hidden", String(!visible));
    if (visible) {
      if (target.style.removeProperty) target.style.removeProperty("display");
      else target.style.display = "";
    } else if (target.style.setProperty) {
      target.style.setProperty("display", "none", "important");
    } else {
      target.style.display = "none";
    }
    return visible;
  }

  function scheduleHubVisibilitySync(delay = 50) {
    if (state.hubVisibilityTimer) return;
    state.hubVisibilityTimer = window.setTimeout(() => {
      state.hubVisibilityTimer = 0;
      syncHubVisibility();
    }, delay);
  }

  function installHubVisibilityObserver() {
    syncHubVisibility();
    if (state.hubVisibilityObserver || window.__CODEX_LIVE_TOKEN_COST_TEST__ || typeof MutationObserver !== "function") return;
    const target = document.body || document.documentElement;
    if (!target) return;
    state.hubVisibilityObserver = new MutationObserver(() => scheduleHubVisibilitySync());
    state.hubVisibilityObserver.observe(target, { childList: true, subtree: true });
  }

  function localDateKey(time = Date.now()) {
    const date = new Date(time);
    if (!Number.isFinite(date.getTime())) return "";
    const mm = String(date.getMonth() + 1).padStart(2, "0");
    const dd = String(date.getDate()).padStart(2, "0");
    return `${date.getFullYear()}-${mm}-${dd}`;
  }

  function todayKey(time = Date.now()) {
    return localDateKey(time);
  }

  function isoDateUtc(time = Date.now()) {
    const date = new Date(time);
    return Number.isFinite(date.getTime()) ? date.toISOString().slice(0, 10) : todayKey();
  }

  function binaryStringToBase64(value) {
    const text = String(value || "");
    const chunkSize = 0x6000;
    let out = "";
    for (let i = 0; i < text.length; i += chunkSize) out += btoa(text.slice(i, i + chunkSize));
    return out;
  }

  function repairLegacyChunkedProfileImageUrl(value) {
    const text = String(value || "");
    const match = text.match(/^(data:image\/[^;,]+;base64,)([\s\S]+)$/i);
    if (!match) return text;
    const prefix = match[1];
    const body = match[2].replace(/\s/g, "");
    if (!body.slice(0, -2).includes("=")) return text;
    const oldChunkChars = Math.ceil(0x8000 / 3) * 4;
    let binary = "";
    try {
      for (let i = 0; i < body.length; i += oldChunkChars) binary += atob(body.slice(i, i + oldChunkChars));
    } catch {
      return text;
    }
    return `${prefix}${binaryStringToBase64(binary)}`;
  }

  function normalizeProfileImageUrl(value) {
    const text = normalizeText(value, PROFILE_IMAGE_MAX_LENGTH);
    if (!text) return null;
    return repairLegacyChunkedProfileImageUrl(text);
  }

  function isoDateAddDays(dateIso, days) {
    const date = new Date(`${dateIso}T00:00:00.000Z`);
    if (!Number.isFinite(date.getTime())) return isoDateUtc();
    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString().slice(0, 10);
  }

  function isoWeekStartUtc(dateIso) {
    const date = new Date(`${dateIso}T00:00:00.000Z`);
    if (!Number.isFinite(date.getTime())) return isoWeekStartUtc(isoDateUtc());
    date.setUTCDate(date.getUTCDate() - date.getUTCDay());
    return date.toISOString().slice(0, 10);
  }

  function profileHeatmapColumnCount(todayIso = isoDateUtc()) {
    const currentWeek = new Date(`${isoWeekStartUtc(todayIso)}T00:00:00.000Z`).getTime();
    const baseWeek = new Date(`${PROFILE_HEATMAP_BASE_START}T00:00:00.000Z`).getTime();
    const weeks = Math.floor((currentWeek - baseWeek) / (7 * 24 * 60 * 60 * 1000));
    return Math.min(PROFILE_HEATMAP_MAX_COLUMNS, Math.max(1, weeks + 1));
  }

  function profileHeatmapStartDate(todayIso = isoDateUtc()) {
    return isoDateAddDays(isoWeekStartUtc(todayIso), -(profileHeatmapColumnCount(todayIso) - 1) * 7);
  }

  function localProfileDailyUsageBuckets(days, todayIso = isoDateUtc()) {
    const byDate = new Map(days.map((day) => [day.date, day]));
    const buckets = [];
    for (let date = profileHeatmapStartDate(todayIso); date <= todayIso; date = isoDateAddDays(date, 1)) {
      const day = byDate.get(date);
      buckets.push({
        start_date: date,
        tokens: toCount(day?.tokens),
        input_tokens: toCount(day?.input),
        output_tokens: toCount(day?.output),
        cached_tokens: toCount(day?.cached),
        requests: toCount(day?.requests),
        cost: Number(day?.cost || 0),
      });
    }
    return buckets;
  }

  function localProfileStreakStats(days, todayIso = isoDateUtc()) {
    const usageDates = new Set(days.filter((day) => toCount(day.tokens) > 0).map((day) => day.date));
    let current = 0;
    for (let date = todayIso; usageDates.has(date); date = isoDateAddDays(date, -1)) current++;

    let longest = 0;
    let running = 0;
    let previous = "";
    for (const date of Array.from(usageDates).sort()) {
      running = previous && isoDateAddDays(previous, 1) === date ? running + 1 : 1;
      longest = Math.max(longest, running);
      previous = date;
    }
    return { current, longest };
  }


  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function normalizeText(value, max = 120) {
    if (typeof value !== "string") return "";
    const text = value.trim();
    if (!text || text.length > max || /^(null|undefined|default)$/i.test(text)) return "";
    return text;
  }

  function isTransientSessionKey(value) {
    return normalizeText(value, 240).startsWith("new:");
  }

  function stripProfileUsername(value) {
    return String(value || "").trim().replace(/^@+/, "").replace(/\s/g, "").slice(0, 20);
  }

  function profileUsernameAllowed(value) {
    const username = stripProfileUsername(value);
    return username.length >= 3 && username.length <= 20 && /^[A-Za-z0-9._-]+$/.test(username);
  }

  function validProfileEmail(value) {
    const email = normalizeText(value, 128);
    return email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : "";
  }

  function profileDefaultEmail() {
    return validProfileEmail(loadJson(PROFILE_DEFAULTS_KEY, {}).email) || LOCAL_PROFILE_EMAIL;
  }

  function saveProfileDefaultEmail(email) {
    const normalized = validProfileEmail(email);
    if (!normalized) return false;
    const defaults = loadJson(PROFILE_DEFAULTS_KEY, {});
    localStorage.setItem(PROFILE_DEFAULTS_KEY, JSON.stringify({ ...defaults, email: normalized }));
    return true;
  }

  function normalizeProfileEmail(value, fallback = profileDefaultEmail()) {
    return validProfileEmail(value) || fallback || LOCAL_PROFILE_EMAIL;
  }

  function normalizeProfileAccountStructure(value) {
    const text = normalizeText(value, 32).toLowerCase();
    return text === "workspace" ? "workspace" : "personal";
  }

  function normalizeProfileWorkspaceName(value, fallback = "Codex Workspace") {
    return normalizeText(value, 64) || fallback;
  }

  function profilePlanOption(value) {
    const text = normalizeText(value, 64).toLowerCase();
    if (!text) return null;
    return PROFILE_PLAN_OPTIONS.find((option) => option.value.toLowerCase() === text || option.label.toLowerCase() === text) || null;
  }

  function normalizeProfilePlan(planType, planLabel) {
    const option = profilePlanOption(planType) || profilePlanOption(planLabel);
    if (option) return { planType: option.value, planLabel: option.label };
    const rawPlanType = normalizeText(planType, 64);
    const rawPlanLabel = normalizeText(planLabel, 64);
    const fallback = profilePlanOption(LOCAL_PROFILE_PLAN) || { value: LOCAL_PROFILE_PLAN, label: "Pro 20x" };
    const label = rawPlanLabel || rawPlanType || fallback.label;
    return { planType: rawPlanType || (rawPlanLabel ? rawPlanLabel : fallback.value), planLabel: label };
  }

  function localProfileIdentityFields(source = {}) {
    const prefs = localProfilePrefs();
    const displayName = prefs.displayName || prefs.username || "Local Usage";
    const imageUrl = prefs.imageUrl || source.imageUrl || source.profilePictureUrl || source.profile_picture_url || source.avatarUrl || source.avatar_url || null;
    return {
      email: prefs.email,
      name: displayName,
      accountName: displayName,
      displayName,
      display_name: displayName,
      username: prefs.username || source.username,
      image: imageUrl,
      imageUrl,
      avatar: imageUrl,
      profilePictureUrl: imageUrl,
      profileImageUrl: imageUrl,
      profilePhotoUrl: imageUrl,
      photoUrl: imageUrl,
      profile_picture_url: imageUrl,
      avatarUrl: imageUrl,
      avatar_url: imageUrl,
      picture: imageUrl,
    };
  }

  function localProfileAccount(source = {}) {
    const prefs = localProfilePrefs();
    const structure = normalizeProfileAccountStructure(prefs.accountStructure ?? source.structure);
    const workspaceName = structure === "workspace" ? normalizeProfileWorkspaceName(prefs.workspaceName ?? source.name) : null;
    return {
      ...source,
      ...localProfileIdentityFields(source),
      id: source.id || LOCAL_PROFILE_ACCOUNT_ID,
      ...(workspaceName ? { name: workspaceName, accountName: workspaceName } : {}),
      type: "chatgpt",
      structure,
      planType: prefs.planType,
      plan_type: prefs.planType,
    };
  }

  function spoofProfileAccountPayload(value) {
    if (!value || typeof value !== "object" || !value.account || typeof value.account !== "object") return value;
    const type = value.account.type;
    if (type !== "apiKey" && type !== "amazonBedrock" && type !== "chatgpt") return value;
    return {
      ...value,
      requiresOpenaiAuth: false,
      account: localProfileAccount(value.account),
    };
  }

  function isProfileAccountsCheckPayload(value) {
    if (!value || typeof value !== "object" || !Array.isArray(value.accounts)) return false;
    return value.accounts.some((account) => account && typeof account === "object" && account.type === "chatgpt");
  }

  function spoofProfileAccountsCheckPayload(value) {
    if (!isProfileAccountsCheckPayload(value)) return value;
    const account = localProfileAccount(value.accounts.find((item) => item && typeof item === "object") || {});
    return {
      ...value,
      account_ordering: [account.id],
      accounts: [account],
    };
  }

  function localProfileAccountsCheckResponse() {
    return spoofProfileAccountsCheckPayload({ account_ordering: [LOCAL_PROFILE_ACCOUNT_ID], accounts: [localProfileAccount()] });
  }

  function isProfileAccountPayload(value) {
    if (!value || typeof value !== "object" || !value.account || typeof value.account !== "object") return false;
    const type = value.account.type;
    return type === "apiKey" || type === "amazonBedrock" || type === "chatgpt";
  }

  function spoofProfileAuthContextValue(value) {
    const source = value && typeof value === "object" ? value : {};
    if (source.__codexLiveTokenCostProfileAuthLocal === VERSION) return source;
    const account = localProfileAccount(source.account && typeof source.account === "object" ? source.account : {});
    const identity = localProfileIdentityFields(source);
    return {
      ...source,
      ...identity,
      __codexLiveTokenCostProfileAuthLocal: VERSION,
      openAIAuth: "chatgpt",
      authMethod: "chatgpt",
      requiresAuth: true,
      planAtLogin: account.planType,
      account,
      accountId: source.accountId || LOCAL_PROFILE_ACCOUNT_ID,
      userId: source.userId || LOCAL_PROFILE_USER_ID,
      computeResidency: source.computeResidency ?? null,
      isLoading: false,
      isCopilotApiAvailable: source.isCopilotApiAvailable ?? false,
      setAuthMethod: typeof source.setAuthMethod === "function" ? source.setAuthMethod : () => {},
    };
  }

  function isProfileQueryClient(value) {
    return Boolean(value && typeof value.invalidateQueries === "function" && typeof value.getQueryCache === "function");
  }

  function rememberProfileQueryClient(value) {
    if (isProfileQueryClient(value)) state.profileQueryClient = value;
    return value;
  }

  function profileQueryClientFromFiberNode(node) {
    if (!node || typeof node !== "object") return null;
    const fiberKey = Object.keys(node).find((key) => key.startsWith("__reactFiber$") || key.startsWith("__reactInternalInstance$"));
    for (let fiber = fiberKey ? node[fiberKey] : null; fiber; fiber = fiber.return) {
      const queryClient = fiber.memoizedProps?.value;
      if (isProfileQueryClient(queryClient)) return queryClient;
    }
    return null;
  }

  function patchProfileReactAuthContext(react, authContext) {
    if (!react || typeof react.useContext !== "function" || !authContext) return false;
    if (react.useContext.__codexLiveTokenCostProfileAuthPatch === VERSION) return true;
    const originalUseContext = react.__codexLiveTokenCostOriginalUseContext || react.useContext.bind(react);
    react.useContext = function codexLiveTokenCostProfileUseContext(context) {
      const value = originalUseContext(context);
      rememberProfileQueryClient(value);
      if (context === authContext) return spoofProfileAuthContextValue(value);
      return value;
    };
    react.useContext.__codexLiveTokenCostProfileAuthPatch = VERSION;
    react.__codexLiveTokenCostOriginalUseContext = originalUseContext;
    return true;
  }

  function profileReactAssetUrl(urls = codexAppAssetUrls()) {
    return (
      urls.find((url) => {
        const file = String(url || "").split("?")[0].split("/").pop() || "";
        return file.startsWith("react-") && !file.startsWith("react-dom-") && file.endsWith(".js");
      }) || ""
    );
  }

  function profileReactFromModule(module) {
    for (const value of Object.values(module || {})) {
      if (value && typeof value === "object" && typeof value.useContext === "function") return value;
      if (typeof value !== "function") continue;
      try {
        const candidate = value();
        if (candidate && typeof candidate.useContext === "function") return candidate;
      } catch {
        // Ignore non-factory exports.
      }
    }
    return null;
  }

  function isReactContext(value) {
    return Boolean(value && typeof value === "object" && value.Provider && value.Consumer && "_currentValue" in value);
  }

  function profileAuthContextFromModule(module) {
    for (const key of ["c", "l"]) {
      if (isReactContext(module?.[key])) return module[key];
    }
    const contexts = Object.values(module || {}).filter(isReactContext);
    return contexts.find((context) => context._currentValue === undefined && context._currentValue2 === undefined) || contexts[0] || null;
  }

  function isSettingsSectionsArray(value) {
    return (
      Array.isArray(value) &&
      value.some((item) => item?.slug === "general-settings") &&
      value.some((item) => item?.slug === "profile")
    );
  }

  function profileUnlockedSettingsSections(source, visible) {
    if (!isSettingsSectionsArray(source) || !Array.isArray(visible) || visible.some((item) => item?.slug === "profile")) return visible;
    const profile = source.find((item) => item?.slug === "profile");
    if (!profile) return visible;
    const next = visible.slice();
    const generalIndex = next.findIndex((item) => item?.slug === "general-settings");
    next.splice(generalIndex >= 0 ? generalIndex + 1 : 0, 0, profile);
    return next;
  }

  function parseModelEffortText(value) {
    const text = normalizeText(value, 500);
    const raw = text.match(/\b(gpt-[a-z0-9._-]+|o\d[a-z0-9._-]*)\b/i)?.[1] || "";
    if (!raw) return { model: "", effort: "" };
    const split = raw.match(/^(.*?)[._\s-]+(minimal|low|medium|high|xhigh|ultra|max)$/i);
    if (split) return { model: split[1], effort: split[2].toLowerCase() };
    return { model: raw, effort: "" };
  }

  function normalizeOfficialEffort(value) {
    const text = normalizeText(String(value ?? ""), 80);
    if (!text) return "";
    const lower = text.toLowerCase().replace(/[\s-]+/g, "_");
    const mapped = {
      高: "high",
      中: "medium",
      低: "low",
      最小: "minimal",
      无: "none",
      快速: "low",
      none: "none",
      minimal: "minimal",
      low: "low",
      medium: "medium",
      high: "high",
      extra_high: "xhigh",
      xhigh: "xhigh",
      max: "max",
      maximum: "max",
      ultra: "ultra",
    }[text] || {
      none: "none",
      minimal: "minimal",
      low: "low",
      medium: "medium",
      high: "high",
      extra_high: "xhigh",
      xhigh: "xhigh",
      max: "max",
      maximum: "max",
      ultra: "ultra",
    }[lower];
    return mapped || "";
  }

  function officialVersionedModelFromText(textValue) {
    const text = normalizeText(String(textValue ?? ""), 500);
    const match = text.match(/\b(?:gpt[._\s-]?)?(\d+(?:\.\d+)+)(?:[._\s-]?(codex|mini|nano|pro|sol|terra|luna))?\b/i);
    if (!match) return "";
    const suffix = match[2] ? `-${match[2].toLowerCase()}` : "";
    return `gpt-${match[1]}${suffix}`;
  }

  function officialModelInfoFromText(textValue, effortValue = "") {
    const text = normalizeText(String(textValue ?? ""), 500);
    const parsed = parseModelEffortText(text);
    let model = officialVersionedModelFromText(text) || parsed.model;
    if (!model) {
      const candidate =
        text
          .split(/\r?\n/)
          .map((line) => normalizeText(line, 120))
          .find((line) => line && !normalizeOfficialEffort(line)) || text;
      const custom = candidate.match(/\b[a-z][a-z0-9._-]*(?:[._-][a-z0-9]+)+\b/i)?.[0] || candidate.match(/\b[a-z][a-z0-9._-]*\d[a-z0-9._-]*\b/i)?.[0] || "";
      if (custom && !normalizeOfficialEffort(custom)) model = custom.toLowerCase();
    }
    const effort = normalizeOfficialEffort(effortValue) || parsed.effort || normalizeOfficialEffort(text.match(/(高|中|低|最小|无|\bminimal\b|\blow\b|\bmedium\b|\bhigh\b|\bxhigh\b|\bultra\b|\bmax\b)/i)?.[1]);
    return { model, effort };
  }

  function officialFastModeIconHtml() {
    return `<svg class="cltc-fast-mode-icon" data-cltc-fast-mode-icon="true" hidden width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="${FAST_MODE_ICON_PATH}" fill="currentColor"></path></svg>`;
  }

  function officialTriggerFastMode(trigger) {
    if (!trigger || state.root?.contains?.(trigger) || state.settingsOverlay?.contains?.(trigger)) return false;
    const paths = Array.from(trigger.querySelectorAll?.("svg path") || []);
    return paths.some((path) => {
      const svg = path.closest?.("svg");
      const pathData = path.getAttribute?.("d") || "";
      const className = String(svg?.className?.baseVal || svg?.className || "");
      const isFastIcon =
        pathData === FAST_MODE_ICON_PATH ||
        pathData.startsWith(LEGACY_FAST_MODE_ICON_PATH_PREFIX) ||
        /(?:^|_)WorkTriggerInlineFastIcon(?:_|$)/.test(className);
      if (!isFastIcon) return false;
      if (!svg || svg.hidden || svg.hasAttribute?.("hidden") || svg.closest?.("[hidden]")) return false;
      const rect = svg.getBoundingClientRect?.();
      const style = typeof getComputedStyle === "function" ? getComputedStyle(svg) : null;
      return (!rect || (rect.width > 0 && rect.height > 0)) && style?.display !== "none" && style?.visibility !== "hidden" && style?.opacity !== "0";
    });
  }

  function officialModelTriggerInfo(trigger) {
    if (!trigger || state.root?.contains?.(trigger) || state.settingsOverlay?.contains?.(trigger)) {
      return { model: "", effort: "", fastMode: false };
    }
    const info = officialModelInfoFromText(trigger.innerText || trigger.textContent || "", trigger.getAttribute?.("data-selected-reasoning-effort") || "");
    return { ...info, fastMode: officialTriggerFastMode(trigger) };
  }

  function readOfficialModelTrigger(trigger = null) {
    const node = trigger || document.querySelector?.(OFFICIAL_MODEL_TRIGGER_SELECTOR);
    const info = officialModelTriggerInfo(node);
    let changed = false;
    if (info.model && info.model !== state.detectedModel) {
      state.detectedModel = info.model;
      changed = true;
    }
    if (info.effort && info.effort !== state.detectedEffort) {
      state.detectedEffort = info.effort;
      changed = true;
    }
    if (info.fastMode !== state.detectedFastMode) {
      state.detectedFastMode = info.fastMode;
      changed = true;
    }
    return changed;
  }

  function modelName(ledgerModel = null) {
    const recentModel = ledgerModel === null ? recentLedgerModel() : ledgerModel;
    return state.detectedModel || recentModel || UNKNOWN_MODEL;
  }

  function activeModelInfo() {
    const ledgerModel = recentLedgerModel();
    return {
      model: modelName(ledgerModel),
      effort: state.detectedEffort || "",
      manual: false,
    };
  }

  function priceUsable(price) {
    return Boolean(price && [price.input, price.cachedInput, price.cacheWrite, price.output].some((value) => Number(value) > 0));
  }

  function priceFor(model) {
    const overrides = loadJson(PRICE_OVERRIDES_KEY, {});
    const key = priceModelKey(model, overrides);
    if (!key || priceModelHidden(key)) return null;
    const override = normalizePrice(overrides[key]);
    if (override) return priceUsable(override) ? override : null;
    const fallback = DEFAULT_PRICES[key] || null;
    return priceUsable(fallback) ? fallback : null;
  }

  function priceModelKey(model, overrides = loadJson(PRICE_OVERRIDES_KEY, {})) {
    const name = normalizeText(model, 120);
    if (!name || name === UNKNOWN_MODEL) return "";
    if (Object.hasOwn(overrides, name) || Object.hasOwn(DEFAULT_PRICES, name)) return name;
    const lower = name.toLowerCase();
    const overrideKey = Object.keys(overrides).find((key) => normalizeText(key, 120).toLowerCase() === lower);
    if (overrideKey) return overrideKey;
    const defaultKey = Object.keys(DEFAULT_PRICES).find((key) => key.toLowerCase() === lower);
    return defaultKey || name;
  }

  function priceModelHidden(model) {
    const name = normalizeText(model, 120);
    const lower = name.toLowerCase();
    const hidden = hiddenPriceModels();
    return hidden.has(name) || Array.from(hidden).some((item) => item.toLowerCase() === lower);
  }

  function hiddenPriceModels() {
    const hidden = loadJson(HIDDEN_PRICE_MODELS_KEY, []);
    return new Set(Array.isArray(hidden) ? hidden.map((item) => normalizeText(item)).filter(Boolean) : []);
  }

  function saveHiddenPriceModels(hidden) {
    const list = Array.from(hidden).map((item) => normalizeText(item)).filter(Boolean).sort((a, b) => a.localeCompare(b));
    localStorage.setItem(HIDDEN_PRICE_MODELS_KEY, JSON.stringify(list));
  }

  function visibleDefaultPrices() {
    const hidden = hiddenPriceModels();
    return Object.fromEntries(Object.entries(DEFAULT_PRICES).filter(([model]) => !hidden.has(model)));
  }

  function visiblePrices() {
    const overrides = loadJson(PRICE_OVERRIDES_KEY, {});
    const visibleOverrides = Object.fromEntries(Object.entries(overrides).filter(([model]) => !priceModelHidden(model)));
    return { ...visibleDefaultPrices(), ...visibleOverrides };
  }

  function priceListModels(extraModel = "") {
    ensureLocalLedgerLoaded();
    const names = [
      ...Object.keys(visiblePrices()),
      extraModel,
      state.detectedModel,
      state.localLast?.model,
      ...state.localLedger.map((turn) => turn?.model),
    ];
    return Array.from(new Set(names.map((name) => normalizeText(name, 120)).filter((name) => name && name !== UNKNOWN_MODEL && !priceModelHidden(name)))).sort(
      (a, b) => a.localeCompare(b),
    );
  }

  function priceListModelLabel(model) {
    const name = normalizeText(model, 120);
    return priceFor(name) ? name : `${name} · 未定价`;
  }

  function normalizePrice(price) {
    if (!price || typeof price !== "object") return null;
    const input = Number(price.input);
    const output = Number(price.output);
    if (!Number.isFinite(input) && !Number.isFinite(output)) return null;
    const cachedInput = price.cachedInput == null || price.cachedInput === "" ? null : Number(price.cachedInput);
    const cacheWrite = price.cacheWrite == null || price.cacheWrite === "" ? null : Number(price.cacheWrite);
    return {
      input: Number.isFinite(input) && input >= 0 ? input : 0,
      cachedInput: Number.isFinite(cachedInput) && cachedInput >= 0 ? cachedInput : null,
      cacheWrite: Number.isFinite(cacheWrite) && cacheWrite >= 0 ? cacheWrite : null,
      output: Number.isFinite(output) && output >= 0 ? output : 0,
    };
  }

  function normalizeUsage(raw) {
    const u = raw && typeof raw === "object" ? raw : {};
    const rawInput = toCount(u.inputTokens ?? u.input_tokens ?? u.prompt_tokens ?? u.promptTokens);
    const explicitInputTotal = toCount(u.input ?? u.inputTotalTokens ?? u.input_total_tokens ?? u.prompt_total_tokens ?? u.promptTotalTokens);
    const output = toCount(
      u.output ?? u.outputTotalTokens ?? u.output_total_tokens ?? u.outputTokens ?? u.output_tokens ?? u.completion_tokens,
    );
    const cachedTokens = toCount(
      u.cached ??
        u.cachedTokens ??
        u.cached_tokens ??
        u.cachedInputTokens ??
        u.cached_input_tokens ??
        u.inputTokensDetails?.cachedTokens ??
        u.input_tokens_details?.cached_tokens ??
        u.promptTokensDetails?.cachedTokens ??
        u.prompt_tokens_details?.cached_tokens,
    );
    const cacheReadTokens = toCount(
      u.cachedReadTokens ?? u.cached_read_tokens ?? u.cacheReadTokens ?? u.cache_read_tokens ?? u.cacheReadInputTokens ?? u.cache_read_input_tokens,
    );
    const cacheCreationTokens = toCount(u.cacheCreationTokens ?? u.cache_creation_tokens ?? u.cacheCreationInputTokens ?? u.cache_creation_input_tokens);
    const cacheWriteTokens =
      toCount(
        u.cacheWriteTokens ??
          u.cache_write_tokens ??
          u.inputTokensDetails?.cacheWriteTokens ??
          u.inputTokensDetails?.cache_write_tokens ??
          u.input_tokens_details?.cacheWriteTokens ??
          u.input_tokens_details?.cache_write_tokens ??
          u.promptTokensDetails?.cacheWriteTokens ??
          u.promptTokensDetails?.cache_write_tokens ??
          u.prompt_tokens_details?.cacheWriteTokens ??
          u.prompt_tokens_details?.cache_write_tokens,
      ) || cacheCreationTokens;
    const cachedReadTokens = cacheReadTokens || cachedTokens;
    const explicitTotal = toCount(u.total ?? u.requestTotalTokens ?? u.totalTokens ?? u.total_tokens);
    const contextUsed = toCount(u.contextUsed ?? u.context_used ?? u.usedTokens ?? u.used_tokens ?? u.used);
    const contextLimit = toCount(
      u.contextLimit ?? u.context_limit ?? u.modelContextWindow ?? u.model_context_window ?? u.contextWindow ?? u.context_window ?? u.limit,
    );
    const inputFromTotal = explicitTotal && output && explicitTotal > output ? explicitTotal - output : 0;
    const inputBase = Math.max(explicitInputTotal, rawInput, inputFromTotal);
    const hasSeparateCacheTokens = cacheReadTokens > 0 || cacheCreationTokens > 0;
    const baseForSeparateCache = rawInput || explicitInputTotal || inputFromTotal;
    let input = inputBase;
    if (hasSeparateCacheTokens) input = Math.max(inputBase, baseForSeparateCache + cacheReadTokens + cacheCreationTokens);
    const total = explicitTotal || input + output;
    const cached = cachedReadTokens;
    const hasTokenBreakdown = input > 0 || output > 0 || cached > 0 || cacheCreationTokens > 0 || explicitTotal > 0;
    const exact = hasTokenBreakdown;
    const normalized = { input, output, cached, total, exact };
    if (rawInput && rawInput !== input) normalized.inputTokens = rawInput;
    if (input && rawInput && input !== rawInput) normalized.inputTotalTokens = input;
    if (cachedTokens && cachedTokens !== cached) normalized.cachedTokens = cachedTokens;
    if (cacheReadTokens) normalized.cacheReadTokens = cacheReadTokens;
    if (cachedReadTokens && cachedReadTokens !== cached) normalized.cachedReadTokens = cachedReadTokens;
    if (cacheWriteTokens) normalized.cacheWriteTokens = cacheWriteTokens;
    if (cacheCreationTokens) normalized.cacheCreationTokens = cacheCreationTokens;
    if (explicitTotal && explicitTotal !== total) normalized.requestTotalTokens = explicitTotal;
    if (contextUsed) normalized.contextUsed = contextUsed;
    if (contextLimit) normalized.contextLimit = contextLimit;
    return normalized;
  }

  function calcCost(usage, price, options = {}) {
    if (!price) return { value: 0, priced: false };
    const input = toCount(usage.input);
    const output = toCount(usage.output);
    const cached = Math.min(input, toCount(usage.cached));
    const fresh = Math.max(0, input - cached);
    const cacheWrite = Math.min(fresh, toCount(usage.cacheWriteTokens ?? usage.cacheCreationTokens));
    const uncached = Math.max(0, fresh - cacheWrite);
    const cachedRate = price.cachedInput ?? price.input;
    const cacheWriteRate = price.cacheWrite ?? price.input;
    const multiplier = options.fastMode === true ? fastModeCostMultiplier(options.model) : 1;
    return {
      value: ((uncached * price.input + cached * cachedRate + cacheWrite * cacheWriteRate + output * price.output) / 1_000_000) * multiplier,
      priced: true,
    };
  }

  function fastModeCostMultiplier(model) {
    const name = normalizeText(model, 120).toLowerCase();
    return FAST_MODE_COST_MULTIPLIERS.find((item) => item.pattern.test(name))?.multiplier || 1;
  }

  function costForModelUsage(usage, model, options = {}) {
    const overrides = loadJson(PRICE_OVERRIDES_KEY, {});
    const key = priceModelKey(model, overrides);
    if (key && priceModelHidden(key)) return { value: 0, priced: true, hidden: true };
    return calcCost(usage, priceFor(model), { ...options, model });
  }

  function addUsage(a, b) {
    const result = {
      input: toCount(a.input) + toCount(b.input),
      output: toCount(a.output) + toCount(b.output),
      cached: toCount(a.cached) + toCount(b.cached),
      total: toCount(a.total) + toCount(b.total),
    };
    const inputTokens = toCount(a.inputTokens) + toCount(b.inputTokens);
    const inputTotalTokens = toCount(a.inputTotalTokens) + toCount(b.inputTotalTokens);
    const cachedTokens = toCount(a.cachedTokens) + toCount(b.cachedTokens);
    const cacheReadTokens = toCount(a.cacheReadTokens) + toCount(b.cacheReadTokens);
    const cachedReadTokens = toCount(a.cachedReadTokens) + toCount(b.cachedReadTokens);
    const cacheWriteTokens = toCount(a.cacheWriteTokens ?? a.cacheCreationTokens) + toCount(b.cacheWriteTokens ?? b.cacheCreationTokens);
    const cacheCreationTokens = toCount(a.cacheCreationTokens) + toCount(b.cacheCreationTokens);
    if (inputTokens) result.inputTokens = inputTokens;
    if (inputTotalTokens) result.inputTotalTokens = inputTotalTokens;
    if (cachedTokens) result.cachedTokens = cachedTokens;
    if (cacheReadTokens) result.cacheReadTokens = cacheReadTokens;
    if (cachedReadTokens) result.cachedReadTokens = cachedReadTokens;
    if (cacheWriteTokens) result.cacheWriteTokens = cacheWriteTokens;
    if (cacheCreationTokens) result.cacheCreationTokens = cacheCreationTokens;
    if (a.exact || b.exact) result.exact = true;
    return result;
  }

  function aggregateTurnUsage(turn) {
    return (Array.isArray(turn?.calls) ? turn.calls : []).reduce((sum, call) => addUsage(sum, normalizeUsage(call?.usage)), {
      input: 0,
      output: 0,
      cached: 0,
      total: 0,
      exact: true,
    });
  }

  function usageHasCostData(usage) {
    const u = normalizeUsage(usage);
    return toCount(u.total) > 0 || toCount(u.input) > 0 || toCount(u.output) > 0 || toCount(u.cached) > 0;
  }

  function costPricedLabel(cost, usage) {
    return !cost?.hidden && cost?.priced === false && usageHasCostData(usage) ? " 未定价" : "";
  }

  function usageKey(usage) {
    return [
      usage.input,
      usage.output,
      usage.cached,
      usage.total,
      usage.inputTokens || 0,
      usage.inputTotalTokens || 0,
      usage.cachedTokens || 0,
      usage.cacheReadTokens || 0,
      usage.cachedReadTokens || 0,
      usage.cacheWriteTokens || usage.cacheCreationTokens || 0,
    ].join(":");
  }

  function pricedModelUsable(model) {
    return priceUsable(priceFor(model));
  }

  function recentLedgerModel() {
    ensureLocalLedgerLoaded();
    const sessionKey = currentSessionKey();
    for (let i = state.localLedger.length - 1; i >= 0; i -= 1) {
      const turn = state.localLedger[i];
      if (turnSessionKey(turn) !== sessionKey) continue;
      const model = normalizeText(turn?.model, 120);
      if (model && model !== UNKNOWN_MODEL && pricedModelUsable(model)) return model;
    }
    return "";
  }

  function cleanupAutoZeroPriceModels() {
    try {
      if (localStorage.getItem(PRICE_MIGRATION_KEY) === PRICE_MIGRATION_VERSION) return false;
    } catch {
      return false;
    }
    const autoZeroModels = ["gpt-5.4-nano"];
    const overrides = loadJson(PRICE_OVERRIDES_KEY, {});
    const hidden = hiddenPriceModels();
    let changed = false;
    for (const model of autoZeroModels) {
      const key = Object.keys(overrides).find((item) => item.toLowerCase() === model.toLowerCase());
      const price = normalizePrice(key ? overrides[key] : null);
      if (key && price && !priceUsable(price)) {
        delete overrides[key];
        changed = true;
      }
      for (const hiddenModel of Array.from(hidden)) {
        if (hiddenModel.toLowerCase() !== model.toLowerCase()) continue;
        hidden.delete(hiddenModel);
        changed = true;
      }
    }
    const staleSolKey = priceModelKey("gpt-5.6-sol", overrides);
    const staleSolPrice = normalizePrice(overrides[staleSolKey]);
    if (
      staleSolKey &&
      staleSolPrice?.input === 5 &&
      staleSolPrice.cachedInput === 0.5 &&
      staleSolPrice.cacheWrite === 6 &&
      staleSolPrice.output === 30
    ) {
      delete overrides[staleSolKey];
      changed = true;
    }
    try {
      if (changed) {
        localStorage.setItem(PRICE_OVERRIDES_KEY, JSON.stringify(overrides));
        saveHiddenPriceModels(hidden);
      }
      localStorage.setItem(PRICE_MIGRATION_KEY, PRICE_MIGRATION_VERSION);
    } catch {
      return false;
    }
    return changed;
  }

  function metricUsageKey(metric) {
    return usageKey(normalizeUsage(metric?.usage));
  }

  function locationSessionKey() {
    const href = String(location?.href || "");
    try {
      const url = new URL(href || "app://-/");
      return `${url.pathname || "/"}${url.search || ""}${url.hash || ""}`;
    } catch {
      return String(location?.pathname || "/") || "/";
    }
  }

  function activeSidebarThreadKey(doc = document) {
    if (recentNewConversationSessionKey()) return "";
    const activeElementKey = sidebarThreadKeyFromNode(doc?.activeElement);
    if (activeElementKey) {
      state.lastClickedSidebarThreadKey = resolveSessionKey(activeElementKey);
      state.lastClickedSidebarThreadAt = Date.now();
      return state.lastClickedSidebarThreadKey;
    }
    const selectors = [
      "[data-app-action-sidebar-thread-active='true'][data-app-action-sidebar-thread-id]",
      "[aria-current='page'][data-app-action-sidebar-thread-id]",
      "[aria-selected='true'][data-app-action-sidebar-thread-id]",
      "[data-state='active'][data-app-action-sidebar-thread-id]",
      "[data-active='true'][data-app-action-sidebar-thread-id]",
      "[data-selected='true'][data-app-action-sidebar-thread-id]",
    ];
    for (const selector of selectors) {
      const node = doc?.querySelector?.(selector);
      const id = sidebarThreadKeyFromNode(node);
      if (id) return resolveSessionKey(id);
    }
    if (state.lastClickedSidebarThreadKey && Date.now() - state.lastClickedSidebarThreadAt < 30000) return state.lastClickedSidebarThreadKey;
    return "";
  }

  function hasActiveSidebarThreadDom(doc = document) {
    const selectors = [
      "[data-app-action-sidebar-thread-active='true'][data-app-action-sidebar-thread-id]",
      "[aria-current='page'][data-app-action-sidebar-thread-id]",
      "[aria-selected='true'][data-app-action-sidebar-thread-id]",
      "[data-state='active'][data-app-action-sidebar-thread-id]",
      "[data-active='true'][data-app-action-sidebar-thread-id]",
      "[data-selected='true'][data-app-action-sidebar-thread-id]",
    ];
    return selectors.some((selector) => Boolean(sidebarThreadKeyFromNode(doc?.querySelector?.(selector))));
  }

  function sidebarThreadKeyFromNode(node) {
    const target = node?.closest?.("[data-app-action-sidebar-thread-id]") || node;
    return normalizeText(target?.getAttribute?.("data-app-action-sidebar-thread-id"), 240);
  }

  function resolveSessionKey(value) {
    const key = normalizeText(value, 240);
    if (!key) return "";
    const alias = state.sessionAliases.get(key.replace(/^local:/, ""));
    if (alias) return alias;
    ensureLocalLedgerLoaded();
    const known = new Set(state.localLedger.map(turnSessionKey).filter(Boolean));
    if (known.has(key)) return key;
    if (key.startsWith("local:")) {
      const stripped = key.slice("local:".length);
      if (known.has(stripped)) return stripped;
    } else {
      const localKey = `local:${key}`;
      if (known.has(localKey)) return localKey;
    }
    return key;
  }

  function isClientNewThreadKey(value) {
    return /^local:client-new-thread:|^client-new-thread:/i.test(normalizeText(value, 240));
  }

  function rememberSessionAlias(sourceValue, targetValue) {
    const sourceKey = normalizeText(sourceValue, 240);
    const targetKey = normalizeText(targetValue, 240);
    if (!isClientNewThreadKey(sourceKey) || !targetKey || isClientNewThreadKey(targetKey) || sameSessionKey(sourceKey, targetKey)) return false;
    state.sessionAliases.set(sourceKey.replace(/^local:/, ""), targetKey);
    ensureLocalLedgerLoaded();
    for (const turn of state.localLedger) {
      if (!sameSessionKey(turnSessionKey(turn), sourceKey)) continue;
      turn.sessionKey = targetKey;
      turn.threadKey = targetKey;
    }
    if (sameSessionKey(turnSessionKey(state.localLast), sourceKey)) {
      state.localLast.sessionKey = targetKey;
      state.localLast.threadKey = targetKey;
    }
    for (const [candidateKey, turn] of state.localCurrentTurns.entries()) {
      if (!sameSessionKey(candidateKey, sourceKey)) continue;
      state.localCurrentTurns.delete(candidateKey);
      turn.sessionKey = targetKey;
      state.localCurrentTurns.set(targetKey, turn);
    }
    for (const map of [state.turnShimmerSessions, state.localTurnTimers, state.officialThreadRuntimeStates]) {
      for (const [candidateKey, item] of map.entries()) {
        if (!sameSessionKey(candidateKey, sourceKey)) continue;
        map.delete(candidateKey);
        if (!map.has(targetKey)) map.set(targetKey, item);
      }
    }
    if (sameSessionKey(state.lastClickedSidebarThreadKey, sourceKey)) state.lastClickedSidebarThreadKey = targetKey;
    if (sameSessionKey(state.userSelectedSidebarThreadKey, sourceKey)) state.userSelectedSidebarThreadKey = targetKey;
    saveLocalLedger();
    syncActiveLocalCurrentTurn();
    syncActiveTurnShimmerState();
    return true;
  }

  function recentDetectedSessionKey() {
    return state.detectedSessionKey && Date.now() - state.detectedSessionKeyAt < 10 * 60 * 1000 ? state.detectedSessionKey : "";
  }

  function recentNewConversationSessionKey() {
    return state.newConversationSessionKey && Date.now() - state.newConversationSessionKeyAt < 10 * 60 * 1000 ? state.newConversationSessionKey : "";
  }

  function recentUserSelectedSidebarThreadKey(doc = document) {
    const activeKey = activeSidebarThreadKey(doc);
    if (activeKey && !sameSessionKey(activeKey, state.userSelectedSidebarThreadKey)) {
      state.userSelectedSidebarThreadKey = activeKey;
      state.userSelectedSidebarThreadAt = Date.now();
      return activeKey;
    }
    if (state.userSelectedSidebarThreadKey && isStructurallyBlankConversationDom(doc) && !hasRunningConversationState([state.userSelectedSidebarThreadKey])) return "";
    return state.userSelectedSidebarThreadKey || "";
  }

  function isRunningConversationState(sessionKey) {
    const key = localStateSessionKey(sessionKey);
    if (!key || isTransientSessionKey(key)) return false;
    const turn = state.localCurrentTurns.get(key);
    if (turn) return true;
    const shimmer = state.turnShimmerSessions.get(key);
    if (shimmer?.running) return true;
    const official = state.officialThreadRuntimeStates.get(key);
    return Boolean(official?.running);
  }

  function hasRunningConversationState(sessionKeys = null) {
    if (Array.isArray(sessionKeys)) {
      const keys = sessionKeys.map(localStateSessionKey).filter((key) => key && !isTransientSessionKey(key));
      if (keys.length) return keys.some(isRunningConversationState);
    }
    for (const [sessionKey, turn] of state.localCurrentTurns.entries()) {
      if (turn && !isTransientSessionKey(sessionKey)) return true;
    }
    for (const [sessionKey, item] of state.turnShimmerSessions.entries()) {
      if (item?.running && !isTransientSessionKey(sessionKey)) return true;
    }
    for (const [sessionKey, item] of state.officialThreadRuntimeStates.entries()) {
      if (item?.running && !isTransientSessionKey(sessionKey)) return true;
    }
    return false;
  }

  function helperThreadContentKey(sessionKey) {
    return normalizeText(sessionKey, 240).replace(/^local:/, "");
  }

  function normalizeHelperThreadContentPayload(payload) {
    if (!payload?.ok) return null;
    const threadId = normalizeText(payload.threadId || payload.thread_id, 240);
    const key = helperThreadContentKey(threadId);
    if (!key) return null;
    return {
      threadId,
      key,
      exists: Boolean(payload.exists),
      hasMessages: Boolean(payload.hasMessages || payload.has_messages),
      hasUsage: Boolean(payload.hasUsage || payload.has_usage),
      hasContent: Boolean(payload.hasContent || payload.has_content || payload.hasMessages || payload.has_messages || payload.hasUsage || payload.has_usage),
      lastEventAt: normalizeText(payload.lastEventAt || payload.last_event_at, 80),
      observedAt: Date.now(),
    };
  }

  function mergeHelperThreadContent(payload) {
    const normalized = normalizeHelperThreadContentPayload(payload);
    if (!normalized) return false;
    const previous = state.helperThreadContent.get(normalized.key);
    const changed =
      !previous ||
      previous.exists !== normalized.exists ||
      previous.hasMessages !== normalized.hasMessages ||
      previous.hasUsage !== normalized.hasUsage ||
      previous.hasContent !== normalized.hasContent ||
      previous.lastEventAt !== normalized.lastEventAt;
    state.helperThreadContent.set(normalized.key, normalized);
    if (changed) scheduleRender(0);
    return true;
  }

  function hasLocalThreadContentEvidence(sessionKey) {
    const key = localStateSessionKey(sessionKey);
    if (!key || isTransientSessionKey(key)) return false;
    if (localCurrentTurn(key) || isTurnShimmerRunning(key) || isOfficialThreadRunning(key)) return true;
    return currentSessionTurns(state.localLedger, key).length > 0;
  }

  function conversationContentState(sessionKey, doc = document) {
    const key = localStateSessionKey(sessionKey);
    if (!key || isTransientSessionKey(key)) return { state: "unknown", sessionKey: key, source: "none" };
    if (hasLocalThreadContentEvidence(key)) return { state: "non_empty", sessionKey: key, source: "local" };
    if (hasConversationTranscriptDom(doc)) return { state: "non_empty", sessionKey: key, source: "dom" };
    const helper = state.helperThreadContent.get(helperThreadContentKey(key));
    if (helper?.hasContent) return { state: "non_empty", sessionKey: key, source: "helper", helper };
    if (helper?.exists && !helper.hasContent) return { state: "empty", sessionKey: key, source: "helper", helper };
    return { state: "unknown", sessionKey: key, source: helper ? "helper" : "none", helper: helper || null };
  }

  function hasStartupComposerSurface(doc = document) {
    const main = doc?.querySelector?.("main");
    if (!main) return false;
    return Boolean(
      main.querySelector?.(
        [
          "[data-codex-composer]",
          ".ProseMirror[contenteditable='true']",
          "[role='textbox'][contenteditable='true']",
          "textarea",
        ].join(","),
      ),
    );
  }

  function hasConversationTranscriptDom(doc = document) {
    const main = doc?.querySelector?.("main");
    if (!main) return false;
    return Boolean(
      main.querySelector?.(
        [
          "article",
          "[data-message-author-role]",
          "[data-turn-id]",
          "[data-thread-id]",
          "[data-response-item-id]",
          "[data-codex-turn]",
          "[data-codex-message]",
          "[data-testid*='conversation-turn']",
          "[data-testid*='message-row']",
          "[data-testid*='chat-message']",
        ].join(","),
      ),
    );
  }

  function isStructurallyBlankConversationDom(doc = document) {
    const main = doc?.querySelector?.("main");
    if (!main) return false;
    if (hasActiveSidebarThreadDom(doc)) return false;
    if (!hasStartupComposerSurface(doc)) return false;
    if (hasConversationTranscriptDom(doc)) return false;
    return true;
  }

  function startupBlankConversationSessionKey(doc = document) {
    const main = doc?.querySelector?.("main");
    if (!main) return "";
    const detectedKey = recentDetectedSessionKey();
    const selectedKey = state.userSelectedSidebarThreadKey || "";
    const runningCandidates = [detectedKey, selectedKey].filter(Boolean);
    if (hasRunningConversationState(runningCandidates.length ? runningCandidates : null)) return "";
    if (!isStructurallyBlankConversationDom(doc)) return "";
    if (detectedKey && conversationContentState(detectedKey, doc).state === "unknown") requestHelperThreadContent(detectedKey);
    return "new:auto";
  }

  function startupResetSessionKey() {
    if (state.localCurrentTurn) return "";
    if (recentDetectedSessionKey() || recentNewConversationSessionKey()) return "";
    if (hasActiveSidebarThreadDom()) return "";
    if (state.lastClickedSidebarThreadKey && Date.now() - state.lastClickedSidebarThreadAt < 30000) return "";
    return state.startupSessionKey;
  }

  function currentSessionKey() {
    return (
      recentNewConversationSessionKey() ||
      startupBlankConversationSessionKey() ||
      recentUserSelectedSidebarThreadKey() ||
      recentDetectedSessionKey() ||
      startupResetSessionKey() ||
      activeSidebarThreadKey() ||
      locationSessionKey()
    );
  }

  function localStateSessionKey(sessionKey = currentSessionKey()) {
    const key = normalizeText(sessionKey, 240) || locationSessionKey();
    return state.sessionAliases.get(key.replace(/^local:/, "")) || key;
  }

  function isActiveLocalStateSession(sessionKey = currentSessionKey()) {
    return sameSessionKey(localStateSessionKey(sessionKey), currentSessionKey());
  }

  function localCurrentTurn(sessionKey = currentSessionKey()) {
    const key = localStateSessionKey(sessionKey);
    const exact = state.localCurrentTurns.get(key);
    if (exact) return exact;
    for (const [candidateKey, turn] of state.localCurrentTurns.entries()) {
      if (sameSessionKey(candidateKey, key)) return turn;
    }
    return null;
  }

  function syncActiveLocalCurrentTurn() {
    state.localCurrentTurn = localCurrentTurn(currentSessionKey());
    return state.localCurrentTurn;
  }

  function setLocalCurrentTurn(turn, sessionKey = turn?.sessionKey || currentSessionKey()) {
    const key = localStateSessionKey(sessionKey);
    if (turn) {
      turn.sessionKey = key;
      turn.threadKey = localStateSessionKey(turn.threadKey || key);
      state.localCurrentTurns.set(key, turn);
    } else {
      state.localCurrentTurns.delete(key);
      if (sameSessionKey(state.localCurrentTurn?.sessionKey, key)) state.localCurrentTurn = null;
    }
    syncActiveLocalCurrentTurn();
    return turn || null;
  }

  function migrateLegacyLocationSessionTurns(sessionKey = currentSessionKey()) {
    const targetKey = normalizeText(sessionKey, 240);
    const legacyKey = normalizeText(locationSessionKey(), 240);
    if (targetKey.startsWith("new:")) return 0;
    if (!targetKey || !legacyKey || targetKey === legacyKey || state.legacySessionMigrations.has(targetKey)) return 0;
    state.legacySessionMigrations.add(targetKey);
    ensureLocalLedgerLoaded();
    if (state.localLedger.some((turn) => turnSessionKey(turn) === targetKey)) return 0;
    let migrated = 0;
    for (const turn of state.localLedger) {
      if (turn?.source !== "codex-live-token-cost" || turnSessionKey(turn) !== legacyKey) continue;
      turn.sessionKey = targetKey;
      turn.threadKey = targetKey;
      migrated += 1;
    }
    if (state.localLast?.source === "codex-live-token-cost" && turnSessionKey(state.localLast) === legacyKey) {
      state.localLast.sessionKey = targetKey;
      state.localLast.threadKey = targetKey;
    }
    const legacyCurrentTurn = localCurrentTurn(legacyKey);
    if (legacyCurrentTurn) {
      setLocalCurrentTurn(null, legacyKey);
      setLocalCurrentTurn(legacyCurrentTurn, targetKey);
    }
    if (migrated > 0) saveLocalLedger();
    return migrated;
  }

  function turnSessionKey(turn) {
    return normalizeText(turn?.threadKey || turn?.sessionKey || turn?.conversationKey || turn?.threadId || turn?.conversationId, 240);
  }

  function sameSessionKey(left, right) {
    const a = normalizeText(left, 240);
    const b = normalizeText(right, 240);
    if (!a || !b) return false;
    if (a === b) return true;
    return a.replace(/^local:/, "") === b.replace(/^local:/, "");
  }

  function currentSessionTurns(turns, key = currentSessionKey()) {
    const sessionKey = normalizeText(key, 240);
    if (isTransientSessionKey(sessionKey)) return [];
    return (Array.isArray(turns) ? turns : []).filter((turn) => sameSessionKey(turnSessionKey(turn), sessionKey));
  }

  function loadDailyLedger() {
    const date = todayKey();
    const saved = loadJson(DAILY_USAGE_KEY, null);
    if (saved?.date === date && Array.isArray(saved.items)) {
      return { date, items: saved.items.slice(-500) };
    }
    return { date, items: [] };
  }

  function saveDailyLedger(ledger) {
    try {
      localStorage.setItem(DAILY_USAGE_KEY, JSON.stringify({ date: ledger.date, items: ledger.items.slice(-500) }));
    } catch {
      // Ignore quota or privacy-mode failures.
    }
  }

  function loadLocalLedger() {
    const saved = loadJson(LOCAL_USAGE_KEY, null);
    state.localLedgerLoaded = true;
    if (!Array.isArray(saved?.turns)) return;
    const valid = saved.turns.filter((item) => normalizeUsage(item?.usage).exact);
    const compacted = compactLocalLedger(saved.turns, saved.archive);
    const removedEntries = compacted.turns.length !== valid.length;
    state.localLedger = compacted.turns;
    state.localUsageArchive = compacted.archive;
    state.localLast = state.localLedger[state.localLedger.length - 1] || null;
    state.localTurnSeq = toCount(saved.seq);
    for (const [sourceKey, targetKey] of Object.entries(saved.sessionAliases || {})) {
      if (!isClientNewThreadKey(sourceKey) || !targetKey || isClientNewThreadKey(targetKey)) continue;
      state.sessionAliases.set(sourceKey.replace(/^local:/, ""), normalizeText(targetKey, 240));
    }
    if (removedEntries || isTransientSessionKey(turnSessionKey(saved.last))) saveLocalLedger();
  }

  function ensureLocalLedgerLoaded() {
    if (!state.localLedgerLoaded) loadLocalLedger();
  }

  function saveLocalLedger() {
    try {
      const compacted = compactLocalLedger(state.localLedger, state.localUsageArchive);
      state.localLedger = compacted.turns;
      state.localUsageArchive = compacted.archive;
      if (isTransientSessionKey(turnSessionKey(state.localLast))) state.localLast = state.localLedger[state.localLedger.length - 1] || null;
      localStorage.setItem(
        LOCAL_USAGE_KEY,
        JSON.stringify({
          turns: state.localLedger,
          archive: state.localUsageArchive,
          last: state.localLast,
          seq: state.localTurnSeq,
          sessionAliases: Object.fromEntries(state.sessionAliases),
        }),
      );
      refreshAnalyticsRollupDates([...compacted.dates, localDateKey(turnTimestampMs(state.localLast))]);
    } catch {
      // Ignore quota or privacy-mode failures.
    }
  }

  function normalizedDurationMs(raw, startedAt = 0, finishedAt = 0) {
    const explicitMs = Number(raw?.durationMs ?? raw?.duration_ms ?? raw?.elapsedMs ?? raw?.elapsed_ms ?? raw?.latencyMs ?? raw?.latency_ms);
    if (Number.isFinite(explicitMs) && explicitMs >= 0) return Math.round(explicitMs);
    const explicitSec = Number(raw?.durationSec ?? raw?.duration_sec ?? raw?.elapsedSec ?? raw?.elapsed_sec);
    if (Number.isFinite(explicitSec) && explicitSec >= 0) return Math.round(explicitSec * 1000);
    const start = toCount(startedAt);
    const finish = toCount(finishedAt);
    return start && finish >= start ? finish - start : 0;
  }

  function normalizeImportedUsageTurn(raw, index = 0, options = {}) {
    if (!raw || typeof raw !== "object") return null;
    const usage = normalizeUsage(raw.usage || raw);
    if (!usage.exact) return null;
    const createdAt = normalizeText(raw.createdAt || raw.created_at || raw.date, 40);
    const date = new Date(createdAt || Date.now());
    const observedAt = toCount(raw.observedAt || raw.observed_at || date.getTime());
    const startedAt = toCount(raw.startedAt || raw.started_at || raw.startTime || raw.start_time || date.getTime()) || observedAt || Date.now();
    const finishedAt = toCount(raw.finishedAt || raw.finished_at || raw.completedAt || raw.completed_at || raw.endTime || raw.end_time || observedAt) || startedAt;
    const durationMs = normalizedDurationMs(raw, startedAt, finishedAt);
    const sessionKey = resolveSessionKey(raw.sessionKey || raw.session_key || raw.threadId || raw.thread_id || raw.conversationId || raw.conversation_id || raw.sessionId || raw.session_id);
    const threadKey = resolveSessionKey(raw.threadKey || raw.thread_key || raw.threadId || raw.thread_id || raw.conversationId || raw.conversation_id || sessionKey);
    if (isTransientSessionKey(sessionKey)) return null;
    const turnId =
      normalizeText(raw.turnId || raw.turn_id || raw.request_id, 240) ||
      `import:${isoDateUtc(date.getTime())}:${normalizeText(raw.model, 120) || UNKNOWN_MODEL}:${usageKey(usage)}:${index}`;
    const costUsd = Number(raw.costUsd ?? raw.cost_usd ?? raw.totalCostUsd ?? raw.total_cost_usd);
    return {
      usage,
      turnId,
      source: normalizeText(raw.source, 80) || "import",
      ...(sessionKey ? { sessionKey } : {}),
      ...(threadKey ? { threadKey } : {}),
      callCount: toCount(raw.callCount ?? raw.call_count ?? raw.requestCount ?? raw.request_count) || 1,
      model: normalizeText(raw.model || raw.request_model || raw.pricing_model, 120) || UNKNOWN_MODEL,
      effort: normalizeReasoningEffort(raw.effort),
      fastMode: typeof raw.fastMode === "boolean" ? raw.fastMode : null,
      invocations: Array.isArray(raw.invocations) ? raw.invocations.map(normalizeProfileInvocation).filter(Boolean) : [],
      createdAt: Number.isFinite(date.getTime()) ? date.toISOString() : new Date().toISOString(),
      observedAt: observedAt || Date.now(),
      ...(toCount(raw.importedAt || raw.imported_at || options.importedAt) ? { importedAt: toCount(raw.importedAt || raw.imported_at || options.importedAt) } : {}),
      startedAt: new Date(startedAt).toISOString(),
      finishedAt: new Date(finishedAt).toISOString(),
      durationMs,
      durationSec: Math.round(durationMs / 1000),
      ...(raw.timeGranularity === "hour" || raw.time_granularity === "hour"
        ? { timeGranularity: "hour" }
        : raw.timeGranularity === "day" || raw.time_granularity === "day"
          ? { timeGranularity: "day" }
          : {}),
      ...(raw.cacheWriteAvailable === true || raw.cache_write_available === true ? { cacheWriteAvailable: true } : {}),
      ...(Number.isFinite(costUsd) && costUsd >= 0 ? { costUsd } : {}),
      ...(normalizeText(raw.importSource, 80) ? { importSource: normalizeText(raw.importSource, 80) } : {}),
    };
  }

  function trimLocalLedger(turns) {
    const exact = (Array.isArray(turns) ? turns : [])
      .filter((item) => normalizeUsage(item?.usage).exact && !isTransientSessionKey(turnSessionKey(item)));
    const local = exact.filter((turn) => {
      const source = normalizeText(turn?.source, 80);
      const importSource = normalizeText(turn?.importSource, 80);
      return source !== "cc-switch" && importSource !== "cc-switch";
    });
    const retainedLocal = new Set(local.slice(-LOCAL_LEDGER_LIMIT));
    return exact.filter((turn) => {
      const source = normalizeText(turn?.source, 80);
      const importSource = normalizeText(turn?.importSource, 80);
      return source === "cc-switch" || importSource === "cc-switch" || retainedLocal.has(turn);
    });
  }

  function normalizeLocalUsageArchive(raw) {
    return raw?.version === 1 && raw.days && typeof raw.days === "object"
      ? { version: 1, updatedAt: toCount(raw.updatedAt), days: raw.days }
      : { version: 1, updatedAt: 0, days: {} };
  }

  function localUsageArchiveTurns(archive = state.localUsageArchive, dates = null) {
    const source = normalizeLocalUsageArchive(archive);
    const targets = dates ? new Set(Array.from(dates).map((date) => normalizeText(date, 10)).filter(Boolean)) : null;
    const rollup = targets
      ? { ...source, days: Object.fromEntries(Object.entries(source.days).filter(([date]) => targets.has(date))) }
      : source;
    return analyticsTurnsFromRollup(rollup).map((turn) => ({
      ...turn,
      turnId: turn.turnId.replace(/^analytics:/, "local-archive:"),
      source: "local-usage-archive",
    }));
  }

  function mergeLocalUsageArchive(archive, turns) {
    const items = Array.isArray(turns) ? turns : [];
    if (!items.length) return normalizeLocalUsageArchive(archive);
    const rollup = buildAnalyticsRollup([...localUsageArchiveTurns(archive), ...items]);
    return { version: 1, updatedAt: Date.now(), days: rollup.days };
  }

  function compactLocalLedger(turns, archive = null) {
    const exact = (Array.isArray(turns) ? turns : [])
      .filter((item) => normalizeUsage(item?.usage).exact && !isTransientSessionKey(turnSessionKey(item)));
    const retained = trimLocalLedger(exact);
    const retainedSet = new Set(retained);
    const evicted = exact.filter((turn) => {
      const source = normalizeText(turn?.source, 80);
      const importSource = normalizeText(turn?.importSource, 80);
      return source !== "cc-switch" && importSource !== "cc-switch" && !retainedSet.has(turn);
    });
    return {
      turns: retained,
      archive: mergeLocalUsageArchive(archive, evicted),
      evicted: evicted.length,
      archived: evicted.length,
      dates: Array.from(new Set(evicted.map((turn) => localDateKey(turnTimestampMs(turn))).filter(Boolean))),
    };
  }

  function importLocalUsageTurns(rows, options = {}) {
    ensureLocalLedgerLoaded();
    const items = Array.isArray(rows) ? rows : [];
    const replaceSource = normalizeText(options.replaceSource, 80);
    const importedAt = toCount(options.importedAt) || Date.now();
    const existing = replaceSource ? state.localLedger.filter((turn) => turn.importSource !== replaceSource && turn.source !== replaceSource) : state.localLedger.slice();
    const byId = new Map(existing.map((turn) => [turn.turnId, turn]));
    let imported = 0;
    let skipped = 0;
    items.forEach((row, index) => {
      const turn = normalizeImportedUsageTurn(row, index, { importedAt });
      if (!turn) {
        skipped++;
        return;
      }
      byId.set(turn.turnId, turn);
      imported++;
    });
    state.localLedger = Array.from(byId.values()).sort(
      (a, b) => String(a.createdAt || "").localeCompare(String(b.createdAt || "")) || String(a.turnId || "").localeCompare(String(b.turnId || "")),
    );
    state.localLast = state.localLedger[state.localLedger.length - 1] || null;
    saveLocalLedger();
    if (replaceSource) rebuildAnalyticsRollup();
    scheduleProfileUsageRefresh();
    scheduleRender();
    return { imported, skipped, total: state.localLedger.length };
  }

  function rememberDailyUsage(metric) {
    const usage = normalizeUsage(metric?.usage);
    if (!usage.exact) return;
    const key = metricUsageKey(metric);
    const now = Date.now();
    const ledger = loadDailyLedger();
    const turnId = normalizeText(metric?.turnId, 120);
    const model = modelName();
    if (turnId) {
      const index = ledger.items.findIndex((item) => item.turnId === turnId);
      if (index >= 0) {
        ledger.items[index] = {
          ...ledger.items[index],
          key,
          turnId,
          usage,
          model,
          fastMode: typeof metric.fastMode === "boolean" ? metric.fastMode : ledger.items[index].fastMode,
          observedAt: now,
        };
        saveDailyLedger(ledger);
        return;
      }
    }
    if (ledger.items.some((item) => item.key === key && now - toCount(item.observedAt) < 10000)) return;
    ledger.items.push({
      key,
      turnId,
      usage,
      model,
      fastMode: typeof metric.fastMode === "boolean" ? metric.fastMode : null,
      observedAt: now,
    });
    saveDailyLedger(ledger);
  }

  function todayCost() {
    const localBucket = localDailyUsage().get(todayKey());
    if (toCount(localBucket?.tokens) > 0) return { value: Number(localBucket.cost) || 0, priced: localBucket?.priced !== false };
    const ledger = loadDailyLedger();
    return ledger.items.reduce(
      (sum, item) => {
        const cost = costForModelUsage(normalizeUsage(item.usage), item.model, { fastMode: item.fastMode === true });
        sum.value += cost.value;
        sum.priced = sum.priced && cost.priced;
        return sum;
      },
      { value: 0, priced: true },
    );
  }

  function isCodexApiUrl(url) {
    const text = String(url || "");
    return /\/(responses|chat\/completions|conversation|thread|api)\b/i.test(text) || /codex/i.test(text);
  }

  function isProfileUsageUrl(url) {
    return /\/wham\/profiles\/me(?:[?#].*)?$/i.test(String(url || ""));
  }

  function isProfilePhotoUrl(url) {
    return /\/wham\/profiles\/me\/photo(?:[?#].*)?$/i.test(String(url || ""));
  }

  function isProfileAccountsCheckUrl(url) {
    return /\/wham\/accounts\/check(?:[?#].*)?$/i.test(String(url || ""));
  }

  function requestUrl(input) {
    if (typeof input === "string") return input;
    return input?.url || String(input || "");
  }

  function requestMethod(input, init) {
    return String(init?.method || input?.method || "GET").toUpperCase();
  }

  function extractSessionKeyFromUrl(value) {
    const text = normalizeText(String(value || ""), 1000);
    if (!text) return "";
    try {
      const url = new URL(text, "app://-/");
      for (const key of ["threadId", "thread_id", "conversationId", "conversation_id", "sessionId", "session_id", "chatId", "chat_id"]) {
        const candidate = normalizeText(url.searchParams.get(key), 240);
        if (candidate) return candidate;
      }
      const path = decodeURIComponent(url.pathname || "");
      const pathMatch = path.match(/\/(?:c|chat|chats|conversation|conversations|thread|threads|session|sessions)\/([^/?#]+)/i);
      if (pathMatch?.[1]) return normalizeText(pathMatch[1], 240);
    } catch {
      // Fall through to regex parsing below.
    }
    const regexMatch = text.match(/[?&](?:threadId|thread_id|conversationId|conversation_id|sessionId|session_id|chatId|chat_id)=([^&#]+)/i);
    if (regexMatch?.[1]) return normalizeText(decodeURIComponent(regexMatch[1]), 240);
    return "";
  }

  function emptySessionIdentity() {
    return { threadKey: "", conversationKey: "", runtimeSessionKey: "", turnId: "", requestId: "", streamId: "" };
  }

  function mergeSessionIdentity(left = {}, right = {}) {
    const merged = emptySessionIdentity();
    for (const field of ["threadKey", "conversationKey", "runtimeSessionKey", "turnId", "requestId", "streamId"]) {
      merged[field] = normalizeText(left[field] || right[field], 240);
    }
    return merged;
  }

  function extractSessionIdentityFromUrl(value) {
    const text = String(value || "").trim();
    if (!text) return emptySessionIdentity();
    const identity = emptySessionIdentity();
    const assignQueryKey = (name, candidate) => {
      const key = normalizeText(candidate, 240);
      if (!key) return;
      if (/thread/i.test(name)) identity.threadKey ||= key;
      else if (/conversation|chat/i.test(name)) identity.conversationKey ||= key;
      else if (/session/i.test(name)) identity.runtimeSessionKey ||= key;
    };
    try {
      const url = new URL(text, location?.href || "app://-/");
      for (const name of ["threadId", "thread_id", "conversationId", "conversation_id", "sessionId", "session_id", "chatId", "chat_id"]) {
        assignQueryKey(name, url.searchParams.get(name));
      }
      const path = decodeURIComponent(url.pathname || "");
      const pathMatch = path.match(/\/(thread|threads|conversation|conversations|chat|chats|session|sessions)\/([^/?#]+)/i);
      if (pathMatch?.[2]) {
        const kind = pathMatch[1].toLowerCase();
        const key = normalizeText(pathMatch[2], 240);
        if (/^thread/.test(kind)) identity.threadKey ||= key;
        else if (/^conversation|^chat/.test(kind)) identity.conversationKey ||= key;
        else identity.runtimeSessionKey ||= key;
      }
    } catch {
      // Fall through to regex parsing below.
    }
    for (const match of text.matchAll(/[?&](threadId|thread_id|conversationId|conversation_id|sessionId|session_id|chatId|chat_id)=([^&#]+)/gi)) {
      try {
        assignQueryKey(match[1], decodeURIComponent(match[2]));
      } catch {
        assignQueryKey(match[1], match[2]);
      }
    }
    return identity;
  }

  function extractSessionIdentity(value, depth = 0, seen = new WeakSet()) {
    if (!value || depth > 8) return emptySessionIdentity();
    if (typeof value === "string") {
      const parsed = parseMaybeJson(value);
      return parsed ? extractSessionIdentity(parsed, depth + 1, seen) : extractSessionIdentityFromUrl(value);
    }
    if (Array.isArray(value)) {
      let identity = emptySessionIdentity();
      for (const item of value) identity = mergeSessionIdentity(identity, extractSessionIdentity(item, depth + 1, seen));
      return identity;
    }
    if (typeof value !== "object" || seen.has(value)) return emptySessionIdentity();
    seen.add(value);

    let identity = {
      threadKey: normalizeText(
        value.threadId ?? value.thread_id ?? value.currentThreadId ?? value.current_thread_id ?? value.thread?.id ?? value.thread?.threadId ?? value.thread?.thread_id ?? value.turn?.threadId ?? value.turn?.thread_id,
        240,
      ),
      conversationKey: normalizeText(
        value.conversationId ?? value.conversation_id ?? value.currentConversationId ?? value.current_conversation_id ?? value.chatId ?? value.chat_id ?? value.conversation?.id ?? value.turn?.conversationId ?? value.turn?.conversation_id,
        240,
      ),
      runtimeSessionKey: normalizeText(
        value.sessionId ?? value.session_id ?? value.runtimeSessionId ?? value.runtime_session_id ?? value.session?.id ?? value.runtimeSession?.id ?? value.runtime_session?.id,
        240,
      ),
      turnId: normalizeText(value.turnId ?? value.turn_id ?? value.turn?.id, 240),
      requestId: normalizeText(value.requestId ?? value.request_id ?? value.request?.requestId ?? value.request?.request_id ?? value.request?.id, 240),
      streamId: normalizeText(value.streamId ?? value.stream_id ?? value.stream?.id ?? value.response?.streamId ?? value.response?.stream_id, 240),
    };
    for (const key of [
      "url",
      "href",
      "request",
      "params",
      "data",
      "payload",
      "message",
      "thread",
      "conversation",
      "session",
      "runtimeSession",
      "runtime_session",
      "turn",
      "stream",
      "body",
      "bodyJsonString",
      "result",
      "response",
    ]) {
      if (key in value) identity = mergeSessionIdentity(identity, extractSessionIdentity(value[key], depth + 1, seen));
    }
    return identity;
  }

  function extractSessionInfo(value) {
    const identity = extractSessionIdentity(value);
    return identity.threadKey || identity.conversationKey || identity.runtimeSessionKey;
  }

  function sessionIdentityHasSessionReference(identity) {
    return Boolean(identity?.threadKey || identity?.conversationKey || identity?.runtimeSessionKey);
  }

  function sessionIdentityCorrelationFields(identity) {
    return ["turnId", "requestId", "streamId"].filter((field) => Boolean(normalizeText(identity?.[field], 240)));
  }

  function pruneRuntimeSessionBindings(now = Date.now()) {
    for (const [key, binding] of state.runtimeSessionBindings.entries()) {
      if (!binding?.expiresAt || binding.expiresAt <= now) state.runtimeSessionBindings.delete(key);
    }
  }

  function runtimeSessionBindingKey(identity) {
    return JSON.stringify([
      normalizeText(identity?.runtimeSessionKey, 240),
      normalizeText(identity?.turnId, 240),
      normalizeText(identity?.requestId, 240),
      normalizeText(identity?.streamId, 240),
    ]);
  }

  function bindRuntimeSessionToThread(identity, threadKey, now = Date.now()) {
    const runtimeSessionKey = normalizeText(identity?.runtimeSessionKey, 240);
    const resolvedThreadKey = normalizeText(threadKey, 240);
    if (!runtimeSessionKey || !resolvedThreadKey || !sessionIdentityCorrelationFields(identity).length) return false;
    pruneRuntimeSessionBindings(now);
    const key = runtimeSessionBindingKey(identity);
    const previous = state.runtimeSessionBindings.get(key);
    if (previous?.ambiguous || (previous?.threadKey && !sameSessionKey(previous.threadKey, resolvedThreadKey))) {
      state.runtimeSessionBindings.set(key, {
        ...previous,
        runtimeSessionKey,
        threadKey: previous.threadKey || resolvedThreadKey,
        ambiguous: true,
        observedAt: now,
        expiresAt: now + RUNTIME_SESSION_BINDING_TTL_MS,
      });
      return false;
    }
    state.runtimeSessionBindings.set(key, {
      runtimeSessionKey,
      threadKey: resolvedThreadKey,
      turnId: normalizeText(identity.turnId, 240),
      requestId: normalizeText(identity.requestId, 240),
      streamId: normalizeText(identity.streamId, 240),
      ambiguous: false,
      observedAt: now,
      expiresAt: now + RUNTIME_SESSION_BINDING_TTL_MS,
    });
    return true;
  }

  function resolveRuntimeSessionBinding(identity, now = Date.now()) {
    const runtimeSessionKey = normalizeText(identity?.runtimeSessionKey, 240);
    const correlationFields = sessionIdentityCorrelationFields(identity);
    if (!runtimeSessionKey || !correlationFields.length) return "";
    pruneRuntimeSessionBindings(now);
    const matches = [];
    for (const binding of state.runtimeSessionBindings.values()) {
      if (binding?.ambiguous || normalizeText(binding?.runtimeSessionKey, 240) !== runtimeSessionKey) continue;
      if (!correlationFields.every((field) => normalizeText(binding?.[field], 240) === normalizeText(identity?.[field], 240))) continue;
      matches.push(binding);
    }
    const threadKeys = [...new Set(matches.map((binding) => normalizeText(binding.threadKey, 240)).filter(Boolean))];
    return threadKeys.length === 1 ? threadKeys[0] : "";
  }

  function resolveSessionIdentity(valueOrIdentity) {
    const identity = valueOrIdentity && typeof valueOrIdentity === "object" && !Array.isArray(valueOrIdentity) && "threadKey" in valueOrIdentity ? valueOrIdentity : extractSessionIdentity(valueOrIdentity);
    const directKey = resolveSessionKey(identity.threadKey || identity.conversationKey);
    if (directKey) {
      const key = localStateSessionKey(directKey);
      if (identity.runtimeSessionKey) bindRuntimeSessionToThread(identity, key);
      return { identity, sessionKey: key, reliable: true, unresolved: false };
    }
    const boundKey = resolveRuntimeSessionBinding(identity);
    if (boundKey) return { identity, sessionKey: localStateSessionKey(boundKey), reliable: true, unresolved: false };
    return { identity, sessionKey: "", reliable: false, unresolved: Boolean(identity.runtimeSessionKey) };
  }

  function observeSessionInfo(value) {
    const resolved = resolveSessionIdentity(value);
    let key = resolved.sessionKey;
    if (!key) return false;
    const activeKey = activeSidebarThreadKey();
    if (rememberSessionAlias(activeKey, key)) key = resolveSessionKey(key);
    state.detectedSessionKey = key;
    state.detectedSessionKeyAt = Date.now();
    state.newConversationSessionKey = "";
    state.newConversationSessionKeyAt = 0;
    syncActiveLocalCurrentTurn();
    syncActiveTurnShimmerState();
    return true;
  }

  function shouldPersistUsagePayload(payload, source) {
    const text = String(source || "");
    if (/body|websocket/i.test(text)) return false;
    if (/^(fetch|xhr)$/i.test(text)) return true;
    if (/message/i.test(text)) {
      const status = toCount(payload?.status);
      return payload?.type === "fetch-response" && (!status || (status >= 200 && status < 300));
    }
    return true;
  }

  function isTokenCountPayload(payload, depth = 0) {
    if (!payload || depth > 2) return false;
    if (typeof payload === "string") {
      try {
        return isTokenCountPayload(JSON.parse(payload), depth + 1);
      } catch {
        return false;
      }
    }
    if (typeof payload !== "object") return false;
    const item = payload?.payload?.type === "token_count" ? payload.payload : payload;
    return item?.type === "token_count" && item.info && typeof item.info === "object";
  }

  function isTaskCompletePayload(payload, depth = 0, seen = new WeakSet()) {
    if (!payload || depth > 8) return false;
    if (typeof payload === "string") {
      try {
        return isTaskCompletePayload(JSON.parse(payload), depth + 1, seen);
      } catch {
        for (const fragment of extractJsonFragmentsFromSse(payload)) {
          try {
            if (isTaskCompletePayload(JSON.parse(fragment), depth + 1, seen)) return true;
          } catch {
            // Ignore malformed stream fragments.
          }
        }
        return false;
      }
    }
    if (Array.isArray(payload)) return payload.some((item) => isTaskCompletePayload(item, depth + 1, seen));
    if (typeof payload !== "object" || seen.has(payload)) return false;
    seen.add(payload);
    if (payload.type === "task_complete" || payload.event === "task_complete") return true;
    if (payload.method === "turn/completed") {
      const status = normalizeText(payload.params?.turn?.status || payload.params?.status, 40);
      if (!status || status === "completed") return true;
    }
    for (const key of ["payload", "data", "body", "message", "result", "params", "bodyJsonString"]) {
      if (key in payload && isTaskCompletePayload(payload[key], depth + 1, seen)) return true;
    }
    return false;
  }

  function normalizeOfficialRuntimeStatus(value) {
    const raw = normalizeText(value?.type ?? value?.status ?? value?.state ?? value, 80).toLowerCase().replace(/[\s-]+/g, "_");
    if (!raw) return "";
    if (["active", "running", "in_progress", "inprogress", "resuming", "working"].includes(raw)) return "running";
    if (["idle", "complete", "completed", "failed", "interrupted", "stopped", "cancelled", "canceled", "aborted", "error"].includes(raw)) return "idle";
    return "";
  }

  function officialRuntimeTimingFromPayload(payload) {
    const candidates = [
      payload?.params?.turn,
      payload?.turn,
      payload?.mcpTurn,
      payload?.params?.mcpTurn,
      payload?.payload?.turn,
      payload?.data?.turn,
      payload?.params,
      payload,
    ].filter((item) => item && typeof item === "object");
    const pick = (...keys) => {
      for (const item of candidates) {
        for (const key of keys) {
          if (key in item) return item[key];
        }
      }
      return undefined;
    };
    const startedAtMs = firstTimestampMs(
      pick("turnStartedAtMs", "turn_started_at_ms"),
      pick("startedAtMs", "started_at_ms", "startedAt", "started_at", "startTime", "start_time", "createdAt", "created_at"),
    );
    const workStartedAtMs = firstTimestampMs(pick("firstTurnWorkItemStartedAtMs", "first_turn_work_item_started_at_ms", "workedStartedAtMs", "worked_started_at_ms"));
    let completedAtMs = firstTimestampMs(
      pick("completedAtMs", "completed_at_ms", "finishedAtMs", "finished_at_ms", "completedAt", "completed_at", "finishedAt", "finished_at", "endTime", "end_time"),
      pick("finalAssistantStartedAtMs", "final_assistant_started_at_ms"),
    );
    let durationMs = normalizedDurationMs({
      durationMs: pick("durationMs", "duration_ms", "elapsedMs", "elapsed_ms"),
      durationSec: pick("durationSec", "duration_sec", "elapsedSec", "elapsed_sec"),
    });
    if (!durationMs && startedAtMs && completedAtMs >= startedAtMs) durationMs = completedAtMs - startedAtMs;
    if (!completedAtMs && startedAtMs && durationMs) completedAtMs = startedAtMs + durationMs;
    return {
      ...(startedAtMs ? { startedAtMs } : {}),
      ...(workStartedAtMs ? { workStartedAtMs } : {}),
      ...(completedAtMs ? { completedAtMs } : {}),
      ...(durationMs ? { durationMs } : {}),
    };
  }

  function officialRuntimeSignalFromPayload(payload, depth = 0, seen = new WeakSet()) {
    if (!payload || depth > 8) return null;
    if (typeof payload === "string") {
      try {
        return officialRuntimeSignalFromPayload(JSON.parse(payload), depth + 1, seen);
      } catch {
        for (const fragment of extractJsonFragmentsFromSse(payload)) {
          try {
            const found = officialRuntimeSignalFromPayload(JSON.parse(fragment), depth + 1, seen);
            if (found) return found;
          } catch {
            // Ignore malformed stream fragments.
          }
        }
        return null;
      }
    }
    if (Array.isArray(payload)) {
      for (const item of payload) {
        const found = officialRuntimeSignalFromPayload(item, depth + 1, seen);
        if (found) return found;
      }
      return null;
    }
    if (typeof payload !== "object" || seen.has(payload)) return null;
    seen.add(payload);

    const method = normalizeText(payload.method, 160);
    const type = normalizeText(payload.type, 160);
    const event = normalizeText(payload.event, 160);
    const descriptor = normalizeText(method || event || type, 160).toLowerCase().replace(/[\s-]+/g, "_");
    const identity = extractSessionIdentity(payload);
    const sessionKey = resolveSessionIdentity(identity).sessionKey;
    const turnId = normalizeText(identity.turnId, 120);
    const timing = officialRuntimeTimingFromPayload(payload);

    if (method === "turn/started" || descriptor === "turn_started" || descriptor === "codex/event/task_started") {
      return { sessionKey, turnId, running: true, status: "running", reason: method || event || type, ...timing };
    }
    if (
      method === "turn/completed" ||
      descriptor === "turn_completed" ||
      descriptor === "codex/event/task_complete" ||
      descriptor === "codex/event/turn_aborted" ||
      type === "task_complete" ||
      event === "task_complete"
    ) {
      const status = normalizeText(payload.params?.turn?.status || payload.params?.status || payload.turn?.status || payload.status || "completed", 80);
      return { sessionKey, turnId, running: false, status: status || "completed", reason: method || event || type, ...timing };
    }
    if (method === "thread/status/changed") {
      const statusValue = payload.params?.status ?? payload.status;
      const status = normalizeOfficialRuntimeStatus(statusValue);
      if (status) return { sessionKey, turnId, running: status === "running", status, reason: method, ...timing };
    }

    for (const key of ["payload", "data", "body", "message", "result", "params", "bodyJsonString"]) {
      if (key in payload) {
        const found = officialRuntimeSignalFromPayload(payload[key], depth + 1, seen);
        if (found) return found;
      }
    }
    return null;
  }

  function applyOfficialTurnTiming(turn, details = {}) {
    if (!turn || typeof turn !== "object") return turn;
    const turnId = normalizeText(details.turnId, 120);
    if (turnId) turn.id = turnId;
    const timing = officialRuntimeTimingFromPayload(details);
    const startedAt = toTimestampMs(timing.startedAtMs || details.startedAtMs || details.startedAt);
    if (startedAt) turn.startedAt = startedAt;
    const previous = turn.officialTiming && typeof turn.officialTiming === "object" ? turn.officialTiming : {};
    turn.officialTiming = {
      ...previous,
      ...timing,
      ...(startedAt ? { startedAtMs: startedAt } : {}),
    };
    return turn;
  }

  function pruneOfficialThreadRuntimeStates(now = Date.now()) {
    for (const [key, item] of state.officialThreadRuntimeStates.entries()) {
      if (!item?.observedAt || now - item.observedAt > OFFICIAL_RUNTIME_STATE_TTL_MS) state.officialThreadRuntimeStates.delete(key);
    }
  }

  function officialRuntimeRunningCount() {
    pruneOfficialThreadRuntimeStates();
    const running = new Set();
    for (const [sessionKey, item] of state.officialThreadRuntimeStates.entries()) {
      if (!item?.running) continue;
      running.add(localStateSessionKey(sessionKey).replace(/^local:/, ""));
    }
    return running.size;
  }

  function turnCompletionMatchesCurrent(sessionKey, turnId, options = {}) {
    const current = localCurrentTurn(sessionKey);
    if (!current) return true;
    const expectedTurnId = normalizeText(current.id, 120);
    const completedTurnId = normalizeText(turnId, 120);
    if (!completedTurnId && options.allowTurnless) return true;
    return Boolean(completedTurnId && expectedTurnId && completedTurnId === expectedTurnId);
  }

  function setOfficialThreadRuntime(sessionKey, running, details = {}) {
    pruneOfficialThreadRuntimeStates();
    const resolvedSessionKey = resolveSessionKey(sessionKey) || sessionKey;
    if (!resolvedSessionKey) return false;
    const key = localStateSessionKey(resolvedSessionKey);
    if (!key) return false;
    const previous = state.officialThreadRuntimeStates.get(key);
    const turnId = normalizeText(details.turnId, 120);
    if (!running) {
      const allowTurnlessCompletion = details.reason === "thread/status/changed" && !previous?.turnId;
      if (previous?.turnId && turnId && previous.turnId !== turnId) return false;
      if (!turnCompletionMatchesCurrent(key, turnId, { allowTurnless: allowTurnlessCompletion })) return false;
    }
    const status = normalizeText(details.status, 80) || (running ? "running" : "idle");
    const reason = normalizeText(details.reason, 120);
    const changed = !previous || previous.running !== Boolean(running) || previous.turnId !== turnId || previous.status !== status;
    const timing = officialRuntimeTimingFromPayload(details);
    state.officialThreadRuntimeStates.set(key, { running: Boolean(running), turnId, status, reason, observedAt: Date.now(), ...timing });
    if (running) {
      applyOfficialTurnTiming(beginLocalTurn({ sessionKey: key, turnId, startedAt: timing.startedAtMs }), { turnId, ...timing });
      startTurnShimmer({ sessionKey: key });
    } else {
      clearLocalTurnTimer(key);
      if (localCurrentTurn(key)) {
        applyOfficialTurnTiming(localCurrentTurn(key), { turnId, ...timing });
        persistLocalCurrentTurn("complete", key);
        setLocalCurrentTurn(null, key);
      }
      stopTurnShimmer({ finishActive: true, sessionKey: key });
    }
    if (changed) scheduleRender(0);
    return changed;
  }

  function observeOfficialRuntimePayload(payload, source) {
    void source;
    const signal = officialRuntimeSignalFromPayload(payload);
    if (!signal) return false;
    const sessionKey = resolveSessionKey(signal.sessionKey) || signal.sessionKey;
    if (!sessionKey) return false;
    return setOfficialThreadRuntime(sessionKey, signal.running, signal);
  }

  function isGenericTaskCompletePayload(payload, depth = 0, seen = new WeakSet()) {
    if (!payload || depth > 8) return false;
    if (typeof payload === "string") {
      try {
        return isGenericTaskCompletePayload(JSON.parse(payload), depth + 1, seen);
      } catch {
        for (const fragment of extractJsonFragmentsFromSse(payload)) {
          try {
            if (isGenericTaskCompletePayload(JSON.parse(fragment), depth + 1, seen)) return true;
          } catch {
            // Ignore malformed stream fragments.
          }
        }
        return false;
      }
    }
    if (Array.isArray(payload)) return payload.some((item) => isGenericTaskCompletePayload(item, depth + 1, seen));
    if (typeof payload !== "object" || seen.has(payload)) return false;
    seen.add(payload);
    if (payload.type === "task_complete" || payload.event === "task_complete") return true;
    for (const key of ["payload", "data", "body", "message", "result", "params", "bodyJsonString"]) {
      if (key in payload && isGenericTaskCompletePayload(payload[key], depth + 1, seen)) return true;
    }
    return false;
  }

  function isOfficialThreadRunning(sessionKey = currentSessionKey()) {
    pruneOfficialThreadRuntimeStates();
    const key = localStateSessionKey(resolveSessionKey(sessionKey) || sessionKey);
    let stateForKey = state.officialThreadRuntimeStates.get(key) || null;
    for (const [runtimeKey, item] of state.officialThreadRuntimeStates.entries()) {
      if (!sameSessionKey(runtimeKey, key)) continue;
      if (!stateForKey || toCount(item?.observedAt) >= toCount(stateForKey?.observedAt)) stateForKey = item;
    }
    return Boolean(stateForKey?.running);
  }

  function uniqueOfficialRunningSessionKey() {
    pruneOfficialThreadRuntimeStates();
    const running = [];
    const seen = new Set();
    for (const [sessionKey, item] of state.officialThreadRuntimeStates.entries()) {
      if (!item?.running) continue;
      const key = localStateSessionKey(sessionKey);
      const comparable = key.replace(/^local:/, "");
      if (seen.has(comparable)) continue;
      seen.add(comparable);
      running.push(key);
    }
    return running.length === 1 ? running[0] : "";
  }

  function sessionlessUsageRuntimeSessionKey(payload) {
    if (sessionIdentityHasSessionReference(extractSessionIdentity(payload))) return "";
    if (!isTokenCountPayload(payload) && collectUsages(payload).length <= 0) return "";
    return uniqueOfficialRunningSessionKey();
  }

  function extractJsonFragmentsFromSse(text) {
    return String(text || "")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trim())
      .filter((line) => line && line !== "[DONE]");
  }

  function collectUsages(value, depth = 0, out = [], seen = new WeakSet()) {
    if (!value || depth > 8) return out;
    if (typeof value === "string") {
      try {
        collectUsages(JSON.parse(value), depth + 1, out, seen);
      } catch {
        for (const fragment of extractJsonFragmentsFromSse(value)) {
          try {
            collectUsages(JSON.parse(fragment), depth + 1, out, seen);
          } catch {
            // Ignore malformed stream fragments.
          }
        }
      }
      return out;
    }
    if (Array.isArray(value)) {
      value.forEach((item) => collectUsages(item, depth + 1, out, seen));
      return out;
    }
    if (typeof value !== "object" || seen.has(value)) return out;
    seen.add(value);

    for (const key of ["usage", "last", "lastUsage", "last_usage", "lastTokenUsage", "last_token_usage"]) {
      const usage = normalizeUsage(value[key]);
      if (usage.exact) out.push(usage);
    }
    const self = normalizeUsage(value);
    if (self.exact) {
      out.push(self);
      return out;
    }
    for (const key of [
      "response",
      "payload",
      "info",
      "data",
      "body",
      "bodyJsonString",
      "body_json_string",
      "bodyText",
      "body_text",
      "responseText",
      "response_text",
      "message",
      "result",
      "event",
      "params",
      "tokenUsage",
      "token_usage",
      "contextUsage",
      "context_usage",
      "response_metadata",
    ]) {
      collectUsages(value[key], depth + 1, out, seen);
    }
    return out;
  }

  function sourceMayContainAssistantResult(source) {
    return !/body/i.test(String(source || ""));
  }

  function textLooksBlockedForResult(text) {
    return /\b(reasoning|thinking|thought|analysis|tool|function|command|usage|context|status|progress|heartbeat|ping)\b/i.test(String(text || ""));
  }

  function textLooksLikeResultCarrier(text) {
    return /\b(output_text|output\.text|content|message|assistant_message|text_delta|content_delta|final_answer|answer)\b/i.test(String(text || ""));
  }

  function hasAssistantResultOutputStarted(value, source = "", depth = 0, seen = new WeakSet(), context = {}) {
    if (!sourceMayContainAssistantResult(source) || !value || depth > 8) return false;
    if (typeof value === "string") {
      try {
        return hasAssistantResultOutputStarted(JSON.parse(value), source, depth + 1, seen, context);
      } catch {
        for (const fragment of extractJsonFragmentsFromSse(value)) {
          try {
            if (hasAssistantResultOutputStarted(JSON.parse(fragment), source, depth + 1, seen, context)) return true;
          } catch {
            // Ignore malformed stream fragments.
          }
        }
        return false;
      }
    }
    if (Array.isArray(value)) {
      return value.some((item) => hasAssistantResultOutputStarted(item, source, depth + 1, seen, context));
    }
    if (typeof value !== "object" || seen.has(value)) return false;
    seen.add(value);

    const descriptor = normalizeText(
      [
        value.type,
        value.event,
        value.name,
        value.kind,
        value.role,
        value.author?.role,
        value.message?.role,
        value.delta?.role,
      ]
        .filter(Boolean)
        .join(" "),
      400,
    ).toLowerCase();
    const blocked = Boolean(context.blocked || textLooksBlockedForResult(descriptor) || (/\b(user|system)\b/i.test(descriptor) && !/\bassistant\b/i.test(descriptor)));
    const assistant = Boolean(context.assistant || /\bassistant\b/i.test(descriptor));
    const resultCarrier = Boolean(context.resultCarrier || textLooksLikeResultCarrier(descriptor));
    const directTextKeys = ["delta", "text", "content", "output_text", "outputText", "markdown", "value"];

    if ((assistant || resultCarrier) && !blocked) {
      for (const key of directTextKeys) {
        if (typeof value[key] === "string" && normalizeText(value[key], 2000)) return true;
      }
    }

    for (const [key, child] of Object.entries(value)) {
      const keyText = String(key || "");
      const nextContext = {
        assistant,
        resultCarrier: resultCarrier || /^(output|outputs|message|messages|content|delta|response|result)$/i.test(keyText),
        blocked: blocked || textLooksBlockedForResult(keyText),
      };
      if (hasAssistantResultOutputStarted(child, source, depth + 1, seen, nextContext)) return true;
    }
    return false;
  }

  function parseMaybeJson(value) {
    if (!value) return null;
    if (typeof value === "object") return value;
    if (typeof value !== "string") return null;
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  }

  function isComposerDraftPayload(value, depth = 0, seen = new WeakSet()) {
    if (!value || depth > 5) return false;
    if (typeof value === "string") {
      const parsed = parseMaybeJson(value);
      return parsed ? isComposerDraftPayload(parsed, depth + 1, seen) : false;
    }
    if (Array.isArray(value)) return value.some((item) => isComposerDraftPayload(item, depth + 1, seen));
    if (typeof value !== "object" || seen.has(value)) return false;
    seen.add(value);
    const type = normalizeText(value.type, 120);
    const key = normalizeText(value.key, 160);
    if (type === "persisted-atom-updated" && /^composer-prompt-drafts-v\d+$/i.test(key)) return true;
    return ["payload", "message", "data", "body"].some((field) => isComposerDraftPayload(value[field], depth + 1, seen));
  }

  function isBackgroundCodexPayload(value, depth = 0, seen = new WeakSet()) {
    if (!value || depth > 4) return false;
    if (typeof value === "string") {
      const parsed = parseMaybeJson(value);
      return parsed ? isBackgroundCodexPayload(parsed, depth + 1, seen) : false;
    }
    if (Array.isArray(value)) return value.some((item) => isBackgroundCodexPayload(item, depth + 1, seen));
    if (typeof value !== "object" || seen.has(value)) return false;
    seen.add(value);
    const descriptor = [
      value.type,
      value.action,
      value.method,
      value.name,
      value.operation,
      value.op,
      value.key,
      value.url,
      value.path,
      value.endpoint,
    ]
      .map((item) => normalizeText(item, 160).toLowerCase())
      .filter(Boolean)
      .join(" ");
    if (/(composer-prompt-drafts|draft|title|summary|summariz|profile|sentry|telemetry)/i.test(descriptor)) return true;
    return ["request", "params", "data", "payload", "message", "body"].some((field) => isBackgroundCodexPayload(value[field], depth + 1, seen));
  }

  function hasUserTurnContent(value) {
    if (!value || typeof value !== "object") return false;
    for (const key of ["input", "prompt", "messages", "message", "user_message", "userMessage", "userInput", "content", "items"]) {
      if (!Object.hasOwn(value, key)) continue;
      const item = value[key];
      if (Array.isArray(item) ? item.length > 0 : item != null && item !== "") return true;
    }
    return false;
  }

  function shouldStartTurnFromRequestPayload(value, depth = 0, seen = new WeakSet()) {
    if (!value || depth > 6) return false;
    if (isComposerDraftPayload(value) || isBackgroundCodexPayload(value)) return false;
    if (typeof value === "string") {
      const parsed = parseMaybeJson(value);
      return parsed ? shouldStartTurnFromRequestPayload(parsed, depth + 1, seen) : false;
    }
    if (Array.isArray(value)) return value.some((item) => shouldStartTurnFromRequestPayload(item, depth + 1, seen));
    if (typeof value !== "object" || seen.has(value)) return false;
    seen.add(value);

    const type = normalizeText(value.type ?? value.event ?? value.action ?? value.method, 160).toLowerCase().replace(/[\s-]+/g, "_");
    if (/(^|_)(user_message|submit_message|send_message|create_turn|start_turn|turn_start|conversation_turn|codex_turn)(_|$)/i.test(type)) return true;
    if (hasUserTurnContent(value) && (extractSessionInfo(value) || extractModelInfo(value).model || extractFastMode(value) !== null)) return true;

    for (const key of ["request", "params", "data", "payload", "message", "turn", "body", "bodyJsonString"]) {
      if (shouldStartTurnFromRequestPayload(value[key], depth + 1, seen)) return true;
    }
    return false;
  }

  function extractModelInfo(value, depth = 0, seen = new WeakSet()) {
    if (!value || depth > 7) return { model: "", effort: "" };
    if (typeof value === "string") {
      const parsed = extractModelInfo(parseMaybeJson(value), depth + 1, seen);
      return parsed.model || parsed.effort ? parsed : { model: "", effort: "" };
    }
    if (Array.isArray(value)) {
      for (const item of value) {
        const info = extractModelInfo(item, depth + 1, seen);
        if (info.model || info.effort) return info;
      }
      return { model: "", effort: "" };
    }
    if (typeof value !== "object" || seen.has(value)) return { model: "", effort: "" };
    seen.add(value);

    const body = parseMaybeJson(value.body);
    if (body && body !== value) {
      const info = extractModelInfo(body, depth + 1, seen);
      if (info.model || info.effort) return info;
    }

    const model = normalizeText(
      value.model ??
        value.modelId ??
        value.model_id ??
        value.toModel ??
        value.threadSettings?.model ??
        value.settings?.model ??
        value.collaborationMode?.settings?.model ??
        value.params?.model ??
        value.params?.threadSettings?.model ??
        value.params?.settings?.model ??
        value.params?.collaborationMode?.settings?.model ??
        value.request?.params?.model ??
        value.body?.model,
    );
    const effort = normalizeText(
      value.reasoning_effort ??
        value.reasoningEffort ??
        value.effort ??
        value.thinking?.type ??
        value.threadSettings?.reasoning_effort ??
        value.threadSettings?.effort ??
        value.settings?.reasoning_effort ??
        value.settings?.effort ??
        value.params?.reasoning_effort ??
        value.params?.effort ??
        value.params?.threadSettings?.effort ??
        value.request?.params?.reasoning_effort ??
        value.request?.params?.effort,
      60,
    );
    if (model || effort) return { model, effort };

    for (const key of ["request", "params", "data", "payload", "message", "threadSettings", "settings", "collaborationMode"]) {
      const info = extractModelInfo(value[key], depth + 1, seen);
      if (info.model || info.effort) return info;
    }
    return { model: "", effort: "" };
  }

  function todayUsage() {
    const localBucket = localDailyUsage().get(todayKey());
    if (toCount(localBucket?.tokens) > 0) {
      return {
        input: toCount(localBucket.input),
        output: toCount(localBucket.output),
        cached: toCount(localBucket.cached),
        total: toCount(localBucket.tokens),
        exact: true,
      };
    }
    const ledger = loadDailyLedger();
    return ledger.items.reduce((sum, item) => addUsage(sum, normalizeUsage(item.usage)), { input: 0, output: 0, cached: 0, total: 0, exact: true });
  }

  function normalizeReasoningEffort(value) {
    const text = normalizeText(String(value ?? ""), 60).toLowerCase().replace(/[\s-]+/g, "_");
    if (!text) return "";
    if (text === "extra_high" || text === "extra" || text === "very_high") return "xhigh";
    if (text === "maximum") return "max";
    if (["none", "minimal", "low", "medium", "high", "xhigh", "max", "ultra"].includes(text)) return text;
    return text.slice(0, 60);
  }

  function extractFastMode(value, depth = 0, seen = new WeakSet()) {
    if (!value || depth > 7) return null;
    if (typeof value === "string") {
      const parsed = parseMaybeJson(value);
      if (parsed) return extractFastMode(parsed, depth + 1, seen);
      return null;
    }
    if (Array.isArray(value)) {
      for (const item of value) {
        const detected = extractFastMode(item, depth + 1, seen);
        if (detected !== null) return detected;
      }
      return null;
    }
    if (typeof value !== "object" || seen.has(value)) return null;
    seen.add(value);

    for (const key of ["fast_mode", "fastMode", "isFastMode", "useFastMode"]) {
      if (typeof value[key] === "boolean") return value[key];
    }
    for (const key of ["serviceTier", "service_tier", "speedTier", "speed_tier"]) {
      if (!Object.hasOwn(value, key)) continue;
      const raw = value[key];
      if (raw == null || raw === "") return false;
      const text = normalizeText(String(raw), 80).toLowerCase().replace(/[\s-]+/g, "_");
      if (text === "fast" || text === "fast_mode" || text === "priority") return true;
      if (["standard", "normal", "regular", "default"].includes(text)) return false;
    }
    for (const key of ["request", "params", "data", "payload", "message", "turnStartParams", "body"]) {
      const detected = extractFastMode(value[key], depth + 1, seen);
      if (detected !== null) return detected;
    }
    return null;
  }

  function countsTowardFastModeUsage(turn) {
    const usage = normalizeUsage(turn?.usage);
    return turn?.source === "codex-live-token-cost" && usage.exact && toCount(usage.total) > 0;
  }

  function normalizeProfileInvocation(value) {
    if (!value || typeof value !== "object") return null;
    const type = normalizeText(String(value.type ?? value.kind ?? ""), 30).toLowerCase();
    const pluginName = normalizeText(value.plugin_name ?? value.pluginName ?? (type === "plugin" ? value.name : ""), 80).replace(/^\$+/, "");
    const skillName = normalizeText(value.skill_name ?? value.skillName ?? (type === "skill" ? value.name : ""), 80);
    const pluginId = normalizeText(value.plugin_id ?? value.pluginId, 120).replace(/^\$+/, "");
    const skillId = normalizeText(value.skill_id ?? value.skillId, 120);
    if (pluginName || pluginId) {
      return { type: "plugin", ...(pluginId ? { plugin_id: pluginId } : {}), ...(pluginName ? { plugin_name: pluginName } : {}) };
    }
    if (skillName || skillId) {
      return { type: "skill", ...(skillId ? { skill_id: skillId } : {}), ...(skillName ? { skill_name: skillName } : {}) };
    }
    return null;
  }

  function collectProfileInvocations(value, depth = 0, out = [], seen = new WeakSet()) {
    if (!value || depth > 7) return out;
    if (typeof value === "string") {
      const parsed = parseMaybeJson(value);
      if (parsed) collectProfileInvocations(parsed, depth + 1, out, seen);
      return out;
    }
    if (Array.isArray(value)) {
      value.forEach((item) => collectProfileInvocations(item, depth + 1, out, seen));
      return out;
    }
    if (typeof value !== "object" || seen.has(value)) return out;
    seen.add(value);

    const invocation = normalizeProfileInvocation(value);
    if (invocation) out.push(invocation);
    for (const key of ["tool_invocations", "toolInvocations", "tool_calls", "toolCalls", "invocations", "plugins", "skills", "tools", "request", "params", "data", "payload", "message", "result", "body"]) {
      collectProfileInvocations(value[key], depth + 1, out, seen);
    }
    return out;
  }

  function profileInvocationKey(invocation) {
    return [invocation.type, invocation.plugin_id || "", invocation.plugin_name || "", invocation.skill_id || "", invocation.skill_name || ""].join("\u0001");
  }

  function localProfileActivityStats(turns) {
    const effortCounts = new Map();
    let effortTotal = 0;
    let fastTotal = 0;
    let fastCount = 0;
    const skillKeys = new Set();
    let totalSkillsUsed = 0;
    const pluginKeys = new Set();
    let totalPluginsUsed = 0;
    let longestRunningTurnSec = 0;
    const invocationCounts = new Map();

    for (const turn of turns) {
      const effort = normalizeReasoningEffort(turn?.effort);
      if (effort) {
        effortCounts.set(effort, (effortCounts.get(effort) || 0) + 1);
        effortTotal++;
      }
      if (countsTowardFastModeUsage(turn)) {
        const tokens = toCount(normalizeUsage(turn.usage).total);
        fastTotal += tokens;
        if (turn.fastMode === true) fastCount += tokens;
      }
      const durationMs = normalizedDurationMs(turn);
      if (durationMs > 0) longestRunningTurnSec = Math.max(longestRunningTurnSec, Math.round(durationMs / 1000));
      const invocations = Array.isArray(turn?.invocations) ? turn.invocations : [];
      for (const rawInvocation of invocations) {
        const invocation = normalizeProfileInvocation(rawInvocation);
        if (!invocation) continue;
        if (invocation.type === "skill") {
          totalSkillsUsed++;
          const skillKey = normalizeText(invocation.skill_id || invocation.skill_name, 120);
          if (skillKey) skillKeys.add(skillKey);
        }
        if (invocation.type === "plugin") {
          totalPluginsUsed++;
          const pluginKey = normalizeText(invocation.plugin_id || invocation.plugin_name, 120);
          if (pluginKey) pluginKeys.add(pluginKey);
        }
        const key = profileInvocationKey(invocation);
        const item = invocationCounts.get(key) || { ...invocation, usage_count: 0 };
        item.usage_count++;
        invocationCounts.set(key, item);
      }
    }

    let topEffort = null;
    let topEffortCount = 0;
    for (const [effort, count] of effortCounts) {
      if (count > topEffortCount || (count === topEffortCount && effort < String(topEffort || ""))) {
        topEffort = effort;
        topEffortCount = count;
      }
    }

    return {
      fastModePercent: fastTotal ? Math.round((fastCount / fastTotal) * 100) : null,
      fastModeCount: fastCount,
      fastModeTotal: fastTotal,
      longestRunningTurnSec,
      reasoningEffort: topEffort,
      reasoningEffortPercent: effortTotal && topEffortCount ? Math.round((topEffortCount / effortTotal) * 100) : null,
      uniqueSkillsUsed: skillKeys.size,
      totalSkillsUsed,
      uniquePluginsUsed: pluginKeys.size,
      totalPluginsUsed,
      topInvocations: Array.from(invocationCounts.values())
        .sort((left, right) => right.usage_count - left.usage_count || profileInvocationKey(left).localeCompare(profileInvocationKey(right)))
        .slice(0, 5),
      topPlugins: Array.from(invocationCounts.values())
        .filter((item) => item.type === "plugin")
        .sort((left, right) => right.usage_count - left.usage_count || profileInvocationKey(left).localeCompare(profileInvocationKey(right)))
        .slice(0, 5),
    };
  }

  function normalizeHelperStatsPayload(payload) {
    const stats = payload?.stats && typeof payload.stats === "object" ? payload.stats : payload;
    if (!stats || typeof stats !== "object") return null;
    const normalizeInvocations = (items) =>
      (Array.isArray(items) ? items : [])
      .map((item) => {
        const invocation = normalizeProfileInvocation(item);
        const usageCount = toCount(item?.usage_count ?? item?.usageCount ?? item?.count);
        return invocation && usageCount ? { ...invocation, usage_count: usageCount } : null;
      })
      .filter(Boolean)
      .sort((left, right) => right.usage_count - left.usage_count || profileInvocationKey(left).localeCompare(profileInvocationKey(right)))
      .slice(0, 5);
    const rawInvocations = Array.isArray(stats.top_invocations) ? stats.top_invocations : Array.isArray(stats.topInvocations) ? stats.topInvocations : [];
    const rawPlugins = Array.isArray(stats.top_plugins) ? stats.top_plugins : Array.isArray(stats.topPlugins) ? stats.topPlugins : [];
    const topInvocations = normalizeInvocations(rawInvocations);
    const topPlugins = normalizeInvocations(rawPlugins).filter((item) => item.type === "plugin");
    return {
      uniqueSkillsUsed: toCount(stats.unique_skills_used ?? stats.uniqueSkillsUsed),
      totalSkillsUsed: toCount(stats.total_skills_used ?? stats.totalSkillsUsed),
      uniquePluginsUsed: toCount(stats.unique_plugins_used ?? stats.uniquePluginsUsed),
      totalPluginsUsed: toCount(stats.total_plugins_used ?? stats.totalPluginsUsed),
      totalThreads: toCount(stats.total_threads ?? stats.totalThreads ?? stats.codex_total_threads ?? stats.codexThreadCount ?? stats.codex_threads?.total_threads),
      codexThreads: stats.codex_threads && typeof stats.codex_threads === "object" ? stats.codex_threads : null,
      topInvocations,
      topPlugins,
      source: normalizeText(payload?.source || stats.source || "local-helper", 80),
      updatedAt: normalizeText(payload?.updated_at || payload?.updatedAt || stats.updated_at || stats.updatedAt, 40),
    };
  }

  function helperStatsSignature(stats) {
    return JSON.stringify({
      uniqueSkillsUsed: toCount(stats?.uniqueSkillsUsed),
      totalSkillsUsed: toCount(stats?.totalSkillsUsed),
      uniquePluginsUsed: toCount(stats?.uniquePluginsUsed),
      totalPluginsUsed: toCount(stats?.totalPluginsUsed),
      totalThreads: toCount(stats?.totalThreads),
      topInvocations: Array.isArray(stats?.topInvocations) ? stats.topInvocations : [],
      topPlugins: Array.isArray(stats?.topPlugins) ? stats.topPlugins : [],
      updatedAt: normalizeText(stats?.updatedAt, 40),
    });
  }

  function mergeHelperStats(payload) {
    const normalized = normalizeHelperStatsPayload(payload);
    if (!normalized) return false;
    const signature = helperStatsSignature(normalized);
    const changed = signature !== state.helperStatsSignature;
    state.helperStats = normalized;
    state.helperStatsSignature = signature;
    state.helperStatsAt = Date.now();
    setHelperStatus(HELPER_STATUS_CONNECTED, false);
    scheduleRender();
    if (changed) scheduleProfileUsageRefresh(0);
    return true;
  }

  function helperStatusText() {
    return state.helperStatus || HELPER_STATUS_DEFAULT;
  }

  function setHelperStatus(message, unavailable = false) {
    state.helperStatus = normalizeText(message, 220) || HELPER_STATUS_DEFAULT;
    state.helperUnavailable = Boolean(unavailable);
    state.helperCheckedAt = Date.now();
    const status = settingsEditorRoot()?.querySelector("[data-field='helper-status']");
    if (status) {
      status.textContent = helperStatusText();
      status.setAttribute("data-helper-unavailable", state.helperUnavailable ? "true" : "false");
    }
    scheduleRender();
  }

  function mergeActivityWithHelperStats(activity) {
    const helper = state.helperStats;
    if (!helper) return activity;
    return {
      ...activity,
      uniqueSkillsUsed: helper.uniqueSkillsUsed || activity.uniqueSkillsUsed,
      totalSkillsUsed: helper.totalSkillsUsed || activity.totalSkillsUsed,
      uniquePluginsUsed: helper.uniquePluginsUsed || activity.uniquePluginsUsed,
      totalPluginsUsed: helper.totalPluginsUsed || activity.totalPluginsUsed,
      topInvocations: helper.topInvocations.length ? helper.topInvocations : activity.topInvocations,
      topPlugins: helper.topPlugins.length ? helper.topPlugins : activity.topPlugins,
    };
  }

  function observeModelInfo(payload) {
    const info = extractModelInfo(payload);
    let changed = false;
    if (info.model && info.model !== state.detectedModel) {
      state.detectedModel = info.model;
      changed = true;
    }
    if (info.effort && info.effort !== state.detectedEffort) {
      state.detectedEffort = info.effort;
      changed = true;
    }
    return changed;
  }

  function setLocalTurnTimer(sessionKey, timer) {
    const key = localStateSessionKey(sessionKey);
    if (timer) state.localTurnTimers.set(key, timer);
    else state.localTurnTimers.delete(key);
    state.localTurnTimer = isActiveLocalStateSession(key) ? timer || 0 : state.localTurnTimer;
  }

  function clearLocalTurnTimer(sessionKey = currentSessionKey()) {
    const key = localStateSessionKey(sessionKey);
    const timer = state.localTurnTimers.get(key) || (isActiveLocalStateSession(key) ? state.localTurnTimer : 0);
    if (!timer) return;
    try {
      window.clearTimeout?.(timer);
    } catch {
      // Timer cleanup is best effort.
    }
    state.localTurnTimers.delete(key);
    if (isActiveLocalStateSession(key)) state.localTurnTimer = 0;
  }

  function turnShimmerState(sessionKey = currentSessionKey()) {
    const key = localStateSessionKey(sessionKey);
    return state.turnShimmerSessions.get(key) || { running: false, startedAt: 0, outputStartedAt: 0 };
  }

  function syncActiveTurnShimmerState() {
    const item = turnShimmerState(currentSessionKey());
    state.turnShimmerRunning = Boolean(item.running);
    state.turnShimmerStartedAt = toCount(item.startedAt);
    state.turnShimmerOutputStartedAt = toCount(item.outputStartedAt);
    return item;
  }

  function setTurnShimmerState(sessionKey, item) {
    const key = localStateSessionKey(sessionKey);
    state.turnShimmerSessions.set(key, item);
    syncActiveTurnShimmerState();
    return item;
  }

  function isTurnShimmerRunning(sessionKey = currentSessionKey()) {
    return Boolean(turnShimmerState(sessionKey).running);
  }

  function startTurnShimmer(options = {}) {
    const sessionKey = localStateSessionKey(options.sessionKey || currentSessionKey());
    const item = turnShimmerState(sessionKey);
    if (item.running) return false;
    setTurnShimmerState(sessionKey, { running: true, startedAt: Date.now(), outputStartedAt: 0 });
    scheduleRender(0);
    return true;
  }

  function stopTurnShimmer(options = {}) {
    const sessionKey = localStateSessionKey(options.sessionKey || currentSessionKey());
    const item = turnShimmerState(sessionKey);
    if (!item.running) return false;
    setTurnShimmerState(sessionKey, { ...item, running: false, outputStartedAt: Date.now() });
    if (isActiveLocalStateSession(sessionKey)) stopCadencedShimmer({ finishActive: options.finishActive !== false });
    scheduleRender(0);
    return true;
  }

  function isVisibleElement(node) {
    try {
      const style = window.getComputedStyle?.(node);
      const rect = node.getBoundingClientRect?.();
      if (style && (style.display === "none" || style.visibility === "hidden" || style.opacity === "0")) return false;
      if (rect && (rect.width <= 0 || rect.height <= 0)) return false;
      return true;
    } catch {
      return false;
    }
  }

  function isCodexComposerCompleteDom() {
    return false;
  }

  function isCodexTaskRunningDom() {
    const sessionKey = localStateSessionKey(currentSessionKey());
    return Boolean(localCurrentTurn(sessionKey) || isTurnShimmerRunning(sessionKey) || isOfficialThreadRunning(sessionKey));
  }

  function finishActiveTurnFromDomIfStopped() {
    const running = isCodexTaskRunningDom();
    if (running !== state.taskRunningDom) {
      state.taskRunningDom = running;
      scheduleRender(0);
    }
    return false;
  }

  function installTaskRunningObserver() {
    state.taskRunningDom = isCodexTaskRunningDom();
  }

  function restoreRunningCurrentTurnFromLast(sessionKey = currentSessionKey(), now = Date.now()) {
    const key = localStateSessionKey(sessionKey);
    if (localCurrentTurn(key)) return false;
    const last = state.localLast;
    if (!last || last.source !== "codex-live-token-cost" || last.persistReason !== "live") return false;
    if (!sameSessionKey(turnSessionKey(last), key)) return false;
    const observedAt = firstTimestampMs(last.observedAt, last.finishedAt, last.createdAt);
    if (!observedAt || Math.abs(toTimestampMs(now) - observedAt) > LOCAL_LIVE_TURN_RESTORE_MAX_AGE_MS) return false;
    const usage = normalizeUsage(last.usage);
    if (!usage.exact) return false;
    setLocalCurrentTurn({
      id: normalizeText(last.turnId, 120) || `${Date.now()}-${++state.localTurnSeq}`,
      sessionKey: key,
      startedAt: toCount(Date.parse(last.startedAt || last.createdAt)) || Date.now(),
      calls: [{ usage, source: "restored-live", observedAt: toCount(last.observedAt) || Date.now() }],
      context: {
        effort: normalizeReasoningEffort(last.effort),
        fastMode: typeof last.fastMode === "boolean" ? last.fastMode : null,
        invocations: Array.isArray(last.invocations) ? last.invocations : [],
      },
    }, key);
    startTurnShimmer({ sessionKey: key });
    return true;
  }

  function finishLocalTurn(delay = 0, options = {}) {
    const sessionKey = localStateSessionKey(options.sessionKey || currentSessionKey());
    clearLocalTurnTimer(sessionKey);
    if (!localCurrentTurn(sessionKey)) return;
    const reason = normalizeText(options.reason || "complete", 40) || "complete";
    void delay;
    persistLocalCurrentTurn(reason, sessionKey);
    setLocalCurrentTurn(null, sessionKey);
    stopTurnShimmer({ finishActive: true, sessionKey });
    scheduleRender();
  }

  function scheduleLocalTurnCompletionCheck(delay = 0, options = {}) {
    const sessionKey = localStateSessionKey(options.sessionKey || currentSessionKey());
    clearLocalTurnTimer(sessionKey);
    if (!localCurrentTurn(sessionKey)) return;
    persistLocalCurrentTurn("live", sessionKey);
    if (!isActiveLocalStateSession(sessionKey)) {
      scheduleRender();
      return;
    }
    state.taskRunningDom = isCodexTaskRunningDom();
    scheduleRender();
  }

  function beginLocalTurn(options = {}) {
    const sessionKey = localStateSessionKey(options.sessionKey || currentSessionKey());
    const forceNewIfUsed = Boolean(options?.forceNewIfUsed);
    clearLocalTurnTimer(sessionKey);
    const current = localCurrentTurn(sessionKey);
    if (current) {
      if (!forceNewIfUsed || !current.calls?.length) return current;
      persistLocalCurrentTurn("interrupted", sessionKey);
      setLocalCurrentTurn(null, sessionKey);
    }
    const turn = {
      id: normalizeText(options.turnId, 120) || `${Date.now()}-${++state.localTurnSeq}`,
      sessionKey,
      startedAt: toTimestampMs(options.startedAtMs ?? options.startedAt) || Date.now(),
      calls: [],
      context: { effort: "", fastMode: null, invocations: [] },
    };
    setLocalCurrentTurn(turn, sessionKey);
    startTurnShimmer({ sessionKey });
    return turn;
  }

  function beginLocalRequestTurn(options = {}) {
    const sessionKey = localStateSessionKey(options.sessionKey || currentSessionKey());
    const current = localCurrentTurn(sessionKey);
    const shimmer = turnShimmerState(sessionKey);
    const forceNewIfUsed = Boolean(current?.calls?.length && shimmer.outputStartedAt && !shimmer.running);
    return beginLocalTurn({ ...options, sessionKey, forceNewIfUsed });
  }

  function normalizeProfileContext(context = {}) {
    return {
      effort: normalizeReasoningEffort(context.effort),
      fastMode: typeof context.fastMode === "boolean" ? context.fastMode : null,
      invocations: Array.isArray(context.invocations) ? context.invocations.map(normalizeProfileInvocation).filter(Boolean) : [],
    };
  }

  function hasProfileContext(context = {}) {
    const normalized = normalizeProfileContext(context);
    return Boolean(normalized.effort || typeof normalized.fastMode === "boolean" || normalized.invocations.length);
  }

  function mergeProfileContext(base = {}, next = {}) {
    const left = normalizeProfileContext(base);
    const right = normalizeProfileContext(next);
    const seen = new Set();
    const invocations = [];
    for (const invocation of [...left.invocations, ...right.invocations]) {
      const key = profileInvocationKey(invocation);
      if (seen.has(key)) continue;
      seen.add(key);
      invocations.push(invocation);
    }
    return {
      effort: right.effort || left.effort,
      fastMode: typeof right.fastMode === "boolean" ? right.fastMode : left.fastMode,
      invocations,
    };
  }

  function localTurnMetric(turn, now = Date.now()) {
    if (!turn?.calls?.length) return null;
    const aggregate = aggregateTurnUsage(turn);
    if (!normalizeUsage(aggregate).exact) return null;
    const officialTiming = turn.officialTiming && typeof turn.officialTiming === "object" ? turn.officialTiming : {};
    const startedAt = toTimestampMs(officialTiming.startedAtMs || turn.startedAt) || now;
    const finishedAt = toTimestampMs(officialTiming.completedAtMs || officialTiming.finishedAtMs) || now;
    const explicitDurationMs = normalizedDurationMs(officialTiming, startedAt, finishedAt);
    const durationMs = explicitDurationMs || Math.max(0, finishedAt - startedAt);
    return {
      usage: aggregate,
      turnId: turn.id,
      sessionKey: turn.sessionKey,
      threadKey: turn.threadKey || turn.sessionKey,
      source: "codex-live-token-cost",
      callCount: turn.calls.length,
      model: modelName(),
      effort: normalizeReasoningEffort(turn.context?.effort || activeModelInfo().effort),
      fastMode: typeof turn.context?.fastMode === "boolean" ? turn.context.fastMode : null,
      invocations: Array.isArray(turn.context?.invocations) ? turn.context.invocations : [],
      createdAt: new Date(startedAt).toISOString(),
      observedAt: now,
      startedAt: new Date(startedAt).toISOString(),
      finishedAt: new Date(now).toISOString(),
      durationMs,
      durationSec: Math.round(durationMs / 1000),
    };
  }

  function persistLocalCurrentTurn(reason = "persist", sessionKey = currentSessionKey()) {
    const key = localStateSessionKey(sessionKey);
    if (isTransientSessionKey(key)) return false;
    const metric = localTurnMetric(localCurrentTurn(key));
    if (!metric) return false;
    state.localLast = { ...metric, persistReason: reason };
    state.localLedger = state.localLedger.filter((item) => item.turnId !== metric.turnId).concat(state.localLast);
    state.localPersistedUsage.set(usageKey(metric.usage), Date.now());
    saveLocalLedger();
    rememberDailyUsage(metric);
    scheduleProfileUsageRefresh();
    return true;
  }

  function rememberLocalUsage(rawUsage, source = "network", context = {}, options = {}) {
    const usage = normalizeUsage(rawUsage);
    if (!usage.exact) return false;
    const sessionKey = localStateSessionKey(options.sessionKey || currentSessionKey());
    const now = Date.now();
    const key = usageKey(usage);
    const persist = options.persist ?? shouldPersistUsagePayload(null, source);
    const previousAt = state.localSeenUsage.get(key) || 0;
    if (!persist && now - previousAt < 3000) return false;
    state.localSeenUsage.set(key, now);
    for (const [seenKey, seenAt] of state.localSeenUsage) {
      if (now - seenAt > 10000) state.localSeenUsage.delete(seenKey);
    }
    if (persist) {
      const persistedAt = state.localPersistedUsage.get(key) || 0;
      if (now - persistedAt < 10000) return false;
      state.localPersistedUsage.set(key, now);
      for (const [seenKey, seenAt] of state.localPersistedUsage) {
        if (now - seenAt > 30000) state.localPersistedUsage.delete(seenKey);
      }
    }
    const turn = beginLocalTurn({ sessionKey });
    turn.context = mergeProfileContext(turn.context, context);
    const existing = turn.calls.find((call) => usageKey(call.usage) === key);
    if (existing) {
      existing.source = source;
      existing.observedAt = now;
      existing.usage = usage;
    } else {
      turn.calls.push({ usage, source, observedAt: now });
    }
    const metric = localTurnMetric(turn, now);
    if (!metric) return false;
    scheduleProfileUsageRefresh();
    if (!persist) return true;
    persistLocalCurrentTurn("final", sessionKey);
    scheduleRender();
    return true;
  }

  function inspectLocalPayload(payload, source) {
    if (isComposerDraftPayload(payload)) return false;
    const identity = extractSessionIdentity(payload);
    const resolvedSession = resolveSessionIdentity(identity);
    const payloadSessionKey = resolvedSession.sessionKey;
    const hasSessionReference = sessionIdentityHasSessionReference(identity);
    const unresolvedSessionIdentity = hasSessionReference && !payloadSessionKey;
    const fallbackRuntimeSessionKey = hasSessionReference ? "" : sessionlessUsageRuntimeSessionKey(payload);
    const sessionKey = localStateSessionKey(payloadSessionKey || fallbackRuntimeSessionKey || currentSessionKey());
    const hasReliableSessionKey = Boolean(payloadSessionKey || fallbackRuntimeSessionKey);
    const sessionChanged = observeSessionInfo(payload);
    const info = extractModelInfo(payload);
    const modelChanged = observeModelInfo(payload);
    const resultOutputStarted = hasAssistantResultOutputStarted(payload, source);
    const tokenCountPayload = isTokenCountPayload(payload);
    const taskCompletePayload = isTaskCompletePayload(payload);
    const fastMode = extractFastMode(payload);
    const invocations = collectProfileInvocations(payload);
    const explicitContext = normalizeProfileContext({
      effort: info.effort,
      fastMode,
      invocations,
    });
    const requestStart = /body/i.test(String(source || "")) && shouldStartTurnFromRequestPayload(payload);
    const canStartRequest = requestStart && !unresolvedSessionIdentity;
    if (canStartRequest) beginLocalRequestTurn({ sessionKey });
    const canUseSessionlessCurrentTurn = !hasSessionReference && officialRuntimeRunningCount() <= 1;
    const canUseCurrentSessionForUsage = Boolean(hasReliableSessionKey || canStartRequest || (!unresolvedSessionIdentity && canUseSessionlessCurrentTurn && localCurrentTurn(sessionKey)));
    if (hasProfileContext(explicitContext) && /body|websocket/i.test(String(source || ""))) {
      const turn = localCurrentTurn(sessionKey) || (canStartRequest ? beginLocalRequestTurn({ sessionKey }) : null);
      if (turn) turn.context = mergeProfileContext(turn.context, explicitContext);
    }
    const turnContext = localCurrentTurn(sessionKey)?.context || {};
    const context = normalizeProfileContext({
      effort: info.effort || turnContext.effort || state.detectedEffort || activeModelInfo().effort,
      fastMode: typeof fastMode === "boolean" ? fastMode : turnContext.fastMode,
      invocations: invocations.length ? invocations : turnContext.invocations,
    });
    let changed = false;
    const persistUsage = shouldPersistUsagePayload(payload, source);
    if (canUseCurrentSessionForUsage) {
      for (const usage of collectUsages(payload)) {
        changed = rememberLocalUsage(usage, source, context, { persist: persistUsage, sessionKey }) || changed;
      }
    }
    const genericTaskCompleteWithoutSession = !hasSessionReference && isGenericTaskCompletePayload(payload);
    const taskCompleteSessionKey = payloadSessionKey || "";
    const taskCompleteHandled = Boolean(taskCompletePayload && taskCompleteSessionKey && turnCompletionMatchesCurrent(taskCompleteSessionKey, identity.turnId));
    const officialRuntimeChanged = observeOfficialRuntimePayload(payload, source);
    if (taskCompleteHandled) {
      clearLocalTurnTimer(taskCompleteSessionKey);
      if (localCurrentTurn(taskCompleteSessionKey)) {
        persistLocalCurrentTurn("complete", taskCompleteSessionKey);
        setLocalCurrentTurn(null, taskCompleteSessionKey);
      }
      stopTurnShimmer({ finishActive: true, sessionKey: taskCompleteSessionKey });
    } else if (taskCompletePayload && genericTaskCompleteWithoutSession) {
      stopTurnShimmer({ finishActive: true, sessionKey });
    } else if (changed && !persistUsage && tokenCountPayload) persistLocalCurrentTurn("live", sessionKey);
    else if (changed && !persistUsage) scheduleLocalTurnCompletionCheck(0, { sessionKey });
    const taskCompleteVisibleHandled = taskCompleteHandled || genericTaskCompleteWithoutSession;
    if (changed || modelChanged || sessionChanged || resultOutputStarted || taskCompleteVisibleHandled || officialRuntimeChanged) scheduleRender();
    return changed || modelChanged || sessionChanged || resultOutputStarted || taskCompleteVisibleHandled || officialRuntimeChanged;
  }

  function localUsageExport() {
    const current = localCurrentTurn(currentSessionKey());
    const officialTiming = current?.officialTiming && typeof current.officialTiming === "object" ? current.officialTiming : {};
    const currentStartedAt = toTimestampMs(officialTiming.startedAtMs || current?.startedAt);
    const currentFinishedAt = toTimestampMs(officialTiming.completedAtMs || officialTiming.finishedAtMs) || Date.now();
    const currentDurationMs = normalizedDurationMs(officialTiming, currentStartedAt, currentFinishedAt) || Math.max(0, currentFinishedAt - currentStartedAt);
    return {
      turns: state.localLedger.slice(),
      last: state.localLast,
      currentTurn: current
        ? {
            id: current.id,
            turnId: current.id,
            sessionKey: current.sessionKey,
            threadKey: current.threadKey || current.sessionKey,
            startedAt: current.startedAt,
            callCount: current.calls.length,
            durationMs: currentDurationMs,
            usage: aggregateTurnUsage(current),
            model: modelName(),
            effort: normalizeReasoningEffort(current.context?.effort || activeModelInfo().effort),
            fastMode: typeof current.context?.fastMode === "boolean" ? current.context.fastMode : null,
            invocations: Array.isArray(current.context?.invocations) ? current.context.invocations : [],
          }
        : null,
    };
  }

  function debugSessionState() {
    ensureLocalLedgerLoaded();
    const counts = new Map();
    for (const turn of state.localLedger) {
      const key = turnSessionKey(turn) || "(none)";
      const usage = normalizeUsage(turn?.usage);
      const current = counts.get(key) || { sessionKey: key, turns: 0, total: 0, cached: 0 };
      current.turns += 1;
      current.total += toCount(usage.total);
      current.cached += toCount(usage.cached);
      counts.set(key, current);
    }
    return {
      version: VERSION,
      currentSessionKey: currentSessionKey(),
      activeSidebarThreadKey: activeSidebarThreadKey(),
      detectedSessionKey: recentDetectedSessionKey(),
      detectedModel: state.detectedModel,
      detectedEffort: state.detectedEffort,
      detectedFastMode: state.detectedFastMode,
      newConversationSessionKey: recentNewConversationSessionKey(),
      startupBlankConversationSessionKey: startupBlankConversationSessionKey(),
      lastClickedSidebarThreadKey: state.lastClickedSidebarThreadKey,
      officialThreadRuntime: Array.from(state.officialThreadRuntimeStates.entries()).map(([sessionKey, item]) => ({ sessionKey, ...item })),
      helperThreadContent: Array.from(state.helperThreadContent.values()),
      ledgerSessions: Array.from(counts.values()).sort((a, b) => b.total - a.total || a.sessionKey.localeCompare(b.sessionKey)).slice(0, 20),
    };
  }

  function readTokenUsage() {
    return localUsageExport();
  }

  function sessionUsage(turns) {
    return turns.reduce((sum, turn) => addUsage(sum, normalizeUsage(turn?.usage)), {
      input: 0,
      output: 0,
      cached: 0,
      total: 0,
    });
  }

  function storedTurnCost(turn) {
    const value = Number(turn?.costUsd ?? turn?.totalCostUsd ?? turn?.total_cost_usd);
    return Number.isFinite(value) && value > 0 ? value : null;
  }

  function turnCost(turn, fallbackModel = modelName()) {
    const usage = normalizeUsage(turn?.usage);
    if (!usage.exact) return { value: 0, priced: true };
    const storedCost = storedTurnCost(turn);
    if (storedCost != null) return { value: storedCost, priced: true };
    return costForModelUsage(usage, turn?.model || fallbackModel, { fastMode: turn?.fastMode === true });
  }

  function startOfLocalDay(time) {
    const date = new Date(time);
    return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  }

  function endOfLocalDay(time) {
    const date = new Date(time);
    return new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1).getTime() - 1;
  }

  function analyticsRangeForPreset(preset = "today", now = Date.now(), custom = {}) {
    const endMs = toTimestampMs(now) || Date.now();
    const dayStart = startOfLocalDay(endMs);
    if (preset === "custom") {
      const rawStart = toTimestampMs(custom.startMs ?? custom.start);
      const rawEnd = toTimestampMs(custom.endMs ?? custom.end);
      const startMs = rawStart ? startOfLocalDay(rawStart) : dayStart;
      const customEnd = rawEnd ? endOfLocalDay(rawEnd) : endOfLocalDay(endMs);
      return { preset, startMs: Math.min(startMs, customEnd), endMs: Math.min(Math.max(startMs, customEnd), endMs) };
    }
    const days = preset === "30d" ? 30 : preset === "7d" ? 7 : 1;
    const start = new Date(dayStart);
    start.setDate(start.getDate() - (days - 1));
    return { preset: days === 1 ? "today" : preset, startMs: start.getTime(), endMs };
  }

  function analyticsComparisonRange(range, preset = range?.preset || "custom") {
    const startMs = toTimestampMs(range?.startMs);
    const endMs = toTimestampMs(range?.endMs);
    if (!startMs || !endMs || endMs < startMs) return { startMs: 0, endMs: 0 };
    if (preset === "today") {
      const previousStart = new Date(startMs);
      previousStart.setDate(previousStart.getDate() - 1);
      return { startMs: previousStart.getTime(), endMs: previousStart.getTime() + (endMs - startMs) };
    }
    const duration = endMs - startMs;
    const previousEnd = startMs - 1;
    return { startMs: previousEnd - duration, endMs: previousEnd };
  }

  function analyticsVisibleTurns(turns) {
    const items = (Array.isArray(turns) ? turns : []).filter((turn) => normalizeUsage(turn?.usage).exact);
    const groups = new Map();
    for (const turn of items) {
      const date = localDateKey(turnTimestampMs(turn));
      const model = normalizeText(turn?.model, 120) || UNKNOWN_MODEL;
      const key = `${date}\u0001${model}`;
      const source = normalizeText(turn?.source, 80);
      const importSource = normalizeText(turn?.importSource, 80);
      const isCcSwitch = source === "cc-switch" || importSource === "cc-switch";
      const group = groups.get(key) || {
        local: [],
        ccSwitch: [],
        localBucket: emptyDailyUsageBucket(date),
        ccBucket: emptyDailyUsageBucket(date),
      };
      if (isCcSwitch) {
        group.ccSwitch.push(turn);
        addTurnToDailyBucket(group.ccBucket, turn, normalizeUsage(turn.usage));
      } else {
        group.local.push(turn);
        addTurnToDailyBucket(group.localBucket, turn, normalizeUsage(turn.usage));
      }
      groups.set(key, group);
    }
    const visible = items.slice(0, 0);
    for (const group of groups.values()) {
      if (group.ccSwitch.length && group.local.length) {
        visible.push(...(group.ccBucket.tokens >= group.localBucket.tokens ? group.ccSwitch : group.local));
      } else {
        visible.push(...group.ccSwitch, ...group.local);
      }
    }
    return visible;
  }

  function analyticsTurnTimestampMs(turn) {
    const timestamp = turnTimestampMs(turn);
    const source = normalizeText(turn?.source, 80);
    const importSource = normalizeText(turn?.importSource, 80);
    const isCcSwitch = source === "cc-switch" || importSource === "cc-switch";
    return isCcSwitch && turn?.timeGranularity !== "hour" ? startOfLocalDay(timestamp) : timestamp;
  }

  function emptyUsageAnalytics() {
    return {
      totalTokens: 0,
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      cacheWriteAvailable: false,
      regularInput: 0,
      calls: 0,
      cost: 0,
      priced: true,
      cacheHitRate: null,
      models: [],
    };
  }

  function aggregateUsageAnalytics(turns, range = {}) {
    const startMs = toTimestampMs(range.startMs) || 0;
    const endMs = toTimestampMs(range.endMs) || Number.MAX_SAFE_INTEGER;
    const totals = emptyUsageAnalytics();
    const models = new Map();
    for (const turn of Array.isArray(turns) ? turns : []) {
      const timestamp = analyticsTurnTimestampMs(turn);
      if (!timestamp || timestamp < startMs || timestamp > endMs) continue;
      const usage = normalizeUsage(turn?.usage);
      if (!usage.exact) continue;
      const cacheRead = Math.min(toCount(usage.input), toCount(usage.cached));
      const cacheWrite = Math.min(Math.max(0, toCount(usage.input) - cacheRead), toCount(usage.cacheWriteTokens ?? usage.cacheCreationTokens));
      const model = normalizeText(turn?.model, 120) || UNKNOWN_MODEL;
      const cost = turnCost(turn, model);
      const item =
        models.get(model) ||
        {
          model,
          usage: { input: 0, output: 0, cached: 0, cacheWriteTokens: 0, total: 0, exact: true },
          calls: 0,
          cost: 0,
          priced: true,
        };
      item.usage = addUsage(item.usage, usage);
      item.calls += toCount(turn?.callCount) || 1;
      item.cost += cost.value;
      item.priced = item.priced && cost.priced;
      models.set(model, item);
      totals.totalTokens += toCount(usage.total || usage.input + usage.output);
      totals.input += toCount(usage.input);
      totals.output += toCount(usage.output);
      totals.cacheRead += cacheRead;
      totals.cacheWrite += cacheWrite;
      totals.cacheWriteAvailable = totals.cacheWriteAvailable || turn?.cacheWriteAvailable === true || cacheWrite > 0;
      totals.regularInput += Math.max(0, toCount(usage.input) - cacheRead - cacheWrite);
      totals.calls += toCount(turn?.callCount) || 1;
      totals.cost += cost.value;
      totals.priced = totals.priced && cost.priced;
    }
    totals.cacheHitRate = totals.input ? Math.round((totals.cacheRead / totals.input) * 100) : null;
    totals.models = Array.from(models.values())
      .map((item) => ({
        ...item,
        tokens: toCount(item.usage.total || item.usage.input + item.usage.output),
        share: totals.totalTokens ? (toCount(item.usage.total || item.usage.input + item.usage.output) / totals.totalTokens) * 100 : 0,
      }))
      .sort((left, right) => right.cost - left.cost || right.tokens - left.tokens || left.model.localeCompare(right.model));
    return totals;
  }

  function buildAnalyticsRollup(turns) {
    const rollup = { version: 1, updatedAt: Date.now(), days: {} };
    for (const turn of analyticsVisibleTurns(turns)) {
      const usage = normalizeUsage(turn?.usage);
      const date = localDateKey(turnTimestampMs(turn));
      if (!usage.exact || !date) continue;
      const model = normalizeText(turn?.model, 120) || UNKNOWN_MODEL;
      const day = (rollup.days[date] ||= { models: {} });
      const item = (day.models[model] ||= {
        usage: { input: 0, output: 0, cached: 0, cacheWriteTokens: 0, total: 0, exact: true },
        calls: 0,
        storedCostUsd: 0,
        storedCostCount: 0,
      });
      item.usage = addUsage(item.usage, usage);
      item.calls += toCount(turn?.callCount) || 1;
      const storedCost = storedTurnCost(turn);
      if (storedCost != null) {
        item.storedCostUsd += storedCost;
        item.storedCostCount++;
      }
    }
    return rollup;
  }

  function pruneAnalyticsRollup(rollup, now = Date.now()) {
    const source = rollup && typeof rollup === "object" ? rollup : { version: 1, updatedAt: Date.now(), days: {} };
    const cutoff = new Date(startOfLocalDay(now));
    cutoff.setDate(cutoff.getDate() - (ANALYTICS_MAX_DAYS - 1));
    const days = {};
    for (const [date, value] of Object.entries(source.days || {})) {
      const timestamp = Date.parse(`${date}T00:00:00`);
      if (!Number.isFinite(timestamp) || timestamp < cutoff.getTime()) continue;
      days[date] = value;
    }
    return { version: 1, updatedAt: Date.now(), days };
  }

  function loadAnalyticsRollup() {
    if (state.analyticsRollupLoaded) return state.analyticsRollup || { version: 1, updatedAt: Date.now(), days: {} };
    state.analyticsRollupLoaded = true;
    const saved = loadJson(ANALYTICS_ROLLUP_KEY, null);
    state.analyticsRollup = saved?.version === 1 && saved.days && typeof saved.days === "object" ? pruneAnalyticsRollup(saved) : null;
    if (!state.analyticsRollup) {
      ensureLocalLedgerLoaded();
      state.analyticsRollup = pruneAnalyticsRollup(buildAnalyticsRollup([...localUsageArchiveTurns(), ...state.localLedger]));
      saveAnalyticsRollup(state.analyticsRollup);
    }
    return state.analyticsRollup;
  }

  function saveAnalyticsRollup(rollup) {
    const next = pruneAnalyticsRollup(rollup);
    state.analyticsRollup = next;
    state.analyticsRollupLoaded = true;
    try {
      localStorage.setItem(ANALYTICS_ROLLUP_KEY, JSON.stringify(next));
      return true;
    } catch {
      return false;
    }
  }

  function rebuildAnalyticsRollup() {
    ensureLocalLedgerLoaded();
    return saveAnalyticsRollup(buildAnalyticsRollup([...localUsageArchiveTurns(), ...state.localLedger]));
  }

  function refreshAnalyticsRollupDates(dates) {
    if (!state.analyticsRollupLoaded) return false;
    const targets = new Set((Array.isArray(dates) ? dates : [dates]).map((date) => normalizeText(date, 10)).filter(Boolean));
    if (!targets.size) return false;
    const next = loadAnalyticsRollup();
    const partial = buildAnalyticsRollup(
      [...localUsageArchiveTurns(state.localUsageArchive, targets), ...state.localLedger].filter((turn) => targets.has(localDateKey(turnTimestampMs(turn)))),
    );
    for (const date of targets) {
      if (partial.days[date]) next.days[date] = partial.days[date];
      else delete next.days[date];
    }
    return saveAnalyticsRollup(next);
  }

  function analyticsTurnsFromRollup(rollup = loadAnalyticsRollup()) {
    const turns = [];
    for (const [date, day] of Object.entries(rollup?.days || {})) {
      for (const [model, item] of Object.entries(day?.models || {})) {
        turns.push({
          turnId: `analytics:${date}:${model}`,
          source: "analytics-rollup",
          createdAt: `${date}T12:00:00`,
          model,
          callCount: toCount(item?.calls) || 1,
          usage: normalizeUsage(item?.usage),
          ...(toCount(item?.storedCostCount) && Number(item?.storedCostUsd) > 0 ? { costUsd: Number(item.storedCostUsd) } : {}),
        });
      }
    }
    return turns;
  }

  function parseLocalDateInput(value) {
    const match = normalizeText(value, 20).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return 0;
    const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    return Number.isFinite(date.getTime()) ? date.getTime() : 0;
  }

  function analyticsComparisonText(current, previous, options = {}) {
    if (options.disabled) return "部分统计";
    const value = Number(current);
    const before = Number(previous);
    if (!Number.isFinite(value) || !Number.isFinite(before)) return "暂无对比";
    if (!before) return value ? "较上期新增" : "与上期持平";
    const percent = Math.round(((value - before) / before) * 100);
    if (!percent) return "与上期持平";
    return `较上期 ${percent > 0 ? "+" : ""}${percent}%`;
  }

  function analyticsChartBuckets(turns, range, metric = "tokens") {
    const startMs = toTimestampMs(range?.startMs);
    const endMs = toTimestampMs(range?.endMs);
    if (!startMs || !endMs || endMs < startMs) return [];
    const daySpan = Math.max(1, Math.ceil((endOfLocalDay(endMs) - startOfLocalDay(startMs) + 1) / 86_400_000));
    const mode = daySpan === 1 ? "hour" : daySpan <= 90 ? "day" : "week";
    const buckets = [];
    const bucketMap = new Map();
    if (mode === "hour") {
      for (let hour = 0; hour < 24; hour += 1) {
        const timestamp = startOfLocalDay(startMs) + hour * 3_600_000;
        const item = { key: `hour:${hour}`, label: `${String(hour).padStart(2, "0")}:00`, value: 0, timestamp };
        buckets.push(item);
        bucketMap.set(item.key, item);
      }
    } else {
      const cursor = new Date(startOfLocalDay(startMs));
      while (cursor.getTime() <= endMs) {
        const date = localDateKey(cursor.getTime());
        const weekIndex = Math.floor((cursor.getTime() - startOfLocalDay(startMs)) / (7 * 86_400_000));
        const key = mode === "week" ? `week:${weekIndex}` : `day:${date}`;
        if (!bucketMap.has(key)) {
          const item = { key, label: mode === "week" ? `${date} 起` : date.slice(5), value: 0, timestamp: cursor.getTime() };
          buckets.push(item);
          bucketMap.set(key, item);
        }
        cursor.setDate(cursor.getDate() + 1);
      }
    }
    for (const turn of Array.isArray(turns) ? turns : []) {
      const timestamp = analyticsTurnTimestampMs(turn);
      if (!timestamp || timestamp < startMs || timestamp > endMs) continue;
      const date = new Date(timestamp);
      const key =
        mode === "hour"
          ? `hour:${date.getHours()}`
          : mode === "week"
            ? `week:${Math.floor((startOfLocalDay(timestamp) - startOfLocalDay(startMs)) / (7 * 86_400_000))}`
            : `day:${localDateKey(timestamp)}`;
      const bucket = bucketMap.get(key);
      if (!bucket) continue;
      const usage = normalizeUsage(turn?.usage);
      bucket.value += metric === "cost" ? turnCost(turn, turn?.model).value : toCount(usage.total || usage.input + usage.output);
    }
    return buckets;
  }

  function analyticsChartSvg(turns, range, metric = "tokens") {
    const buckets = analyticsChartBuckets(turns, range, metric);
    const width = 720;
    const height = 230;
    const inset = { top: 36, right: 10, bottom: 34, left: 10 };
    const chartHeight = height - inset.top - inset.bottom;
    const max = Math.max(1, ...buckets.map((item) => item.value));
    const gap = buckets.length > 60 ? 1 : buckets.length > 30 ? 2 : 4;
    const stagger = buckets.length > 60 ? 18 : buckets.length > 30 ? 24 : 32;
    const barWidth = Math.max(2, (width - inset.left - inset.right - gap * Math.max(0, buckets.length - 1)) / Math.max(1, buckets.length));
    const labelEvery = Math.max(1, Math.ceil(buckets.length / 7));
    const bars = buckets
      .map((item, index) => {
        const barHeight = item.value ? Math.max(2, (item.value / max) * chartHeight) : 1;
        const x = inset.left + index * (barWidth + gap);
        const y = inset.top + chartHeight - barHeight;
        const display = metric === "cost" ? fmtMoney(item.value) : fmtCount(item.value);
        const tooltipWidth = Math.max(44, display.length * 7 + 12);
        const tooltipX = Math.max(2, Math.min(width - tooltipWidth - 2, x + barWidth / 2 - tooltipWidth / 2));
        const tooltipY = Math.max(2, y - 25);
        const label = index % labelEvery === 0 || index === buckets.length - 1 ? `<text x="${x + barWidth / 2}" y="${height - 10}" text-anchor="middle">${escapeHtml(item.label)}</text>` : "";
        return `<g class="cltc-analytics-bar">
          <rect tabindex="0" role="graphics-symbol" aria-label="${escapeHtml(`${item.label}，${display}`)}" data-chart-index="${index}" style="--cltc-chart-bar-delay:${index * stagger}ms" x="${x}" y="${y}" width="${barWidth}" height="${barHeight}" rx="2"><title>${escapeHtml(`${item.label} · ${display}`)}</title></rect>
          <g class="cltc-analytics-tooltip" aria-hidden="true">
            <rect x="${tooltipX}" y="${tooltipY}" width="${tooltipWidth}" height="20" rx="5"></rect>
            <text x="${tooltipX + tooltipWidth / 2}" y="${tooltipY + 14}" text-anchor="middle">${escapeHtml(display)}</text>
          </g>
          ${label}
        </g>`;
      })
      .join("");
    return `<svg class="cltc-analytics-chart" data-analytics-chart="true" viewBox="0 0 ${width} ${height}" role="graphics-document" aria-label="${metric === "cost" ? "花费趋势" : "Token 趋势"}">${bars}</svg>`;
  }

  function usageAnalyticsHtml(options = {}) {
    ensureLocalLedgerLoaded();
    const now = toTimestampMs(options.now) || Date.now();
    const preset = ["today", "7d", "30d", "custom"].includes(options.preset) ? options.preset : state.analyticsPreset;
    const customStart = options.customStart || state.analyticsCustomStart;
    const customEnd = options.customEnd || state.analyticsCustomEnd;
    const range = analyticsRangeForPreset(preset, now, { start: parseLocalDateInput(customStart), end: parseLocalDateInput(customEnd) });
    const previousRange = analyticsComparisonRange(range, preset);
    const sourceTurns =
      Array.isArray(options.turns)
        ? options.turns
        : preset === "today"
          ? [...localUsageArchiveTurns(state.localUsageArchive, [localDateKey(now)]), ...state.localLedger]
          : analyticsTurnsFromRollup(loadAnalyticsRollup());
    const turns = analyticsVisibleTurns(sourceTurns);
    const model = options.model ?? state.analyticsModel;
    const filtered = model ? turns.filter((turn) => normalizeText(turn?.model, 120) === model) : turns;
    const current = aggregateUsageAnalytics(filtered, range);
    const previous = aggregateUsageAnalytics(filtered, previousRange);
    const metric = options.metric === "cost" || state.analyticsMetric === "cost" ? "cost" : "tokens";
    const metricRow = (label, value, comparison, incomplete = false) => `
      <div class="cltc-analytics-metric">
        <span>${label}</span>
        <strong>${value}</strong>
        <small>${analyticsComparisonText(comparison.current, comparison.previous, { disabled: incomplete })}</small>
      </div>`;
    const composition = [
      ["常规输入", current.regularInput, "neutral", true],
      ["输出", current.output, "green", true],
      ["读缓存", current.cacheRead, "blue", true],
      ["写缓存", current.cacheWrite, "purple", current.cacheWriteAvailable],
    ];
    const compositionTotal = composition.reduce((sum, item) => sum + (item[3] ? item[1] : 0), 0);
    const modelRows = current.models
      .slice()
      .sort((left, right) => (left.model === UNKNOWN_MODEL) - (right.model === UNKNOWN_MODEL) || right.cost - left.cost || right.tokens - left.tokens)
      .map(
        (item, index) => `<button type="button" class="cltc-analytics-model-row" data-analytics-model="${escapeHtml(item.model)}" data-hidden="${String(index >= 10 && !state.analyticsModelsExpanded)}">
          <span title="${escapeHtml(item.model)}">${escapeHtml(item.model)}</span>
          <span>${fmtCount(item.tokens)}</span>
          <span>${fmtCount(item.calls)}</span>
          <span>${item.priced ? fmtMoney(item.cost) : `${fmtMoney(item.cost)} · 部分`}</span>
          <span>${Math.round(item.share)}%</span>
        </button>`,
      )
      .join("");
    return `
      <section class="cltc-settings-section cltc-analytics" data-analytics-preset="${preset}" data-analytics-model-filter="${escapeHtml(model)}">
        <div class="cltc-settings-section-heading cltc-analytics-heading">
          <div><h2>使用统计</h2><p>基于 HUD、Profile 与 CC Switch 相同的本地去重口径。</p></div>
          ${model ? `<button type="button" class="cltc-analytics-filter" data-action="clear-analytics-model">${escapeHtml(model)} ×</button>` : ""}
        </div>
        <div class="cltc-analytics-toolbar">
          <div class="cltc-segmented" role="group" aria-label="统计时间范围">
            <button type="button" data-analytics-preset="today" data-active="${String(preset === "today")}">今日</button>
            <button type="button" data-analytics-preset="7d" data-active="${String(preset === "7d")}">7 天</button>
            <button type="button" data-analytics-preset="30d" data-active="${String(preset === "30d")}">30 天</button>
            <button type="button" data-analytics-preset="custom" data-active="${String(preset === "custom")}">自定义</button>
          </div>
          <button type="button" class="cltc-date-range-trigger" data-action="open-analytics-calendar"${preset === "custom" ? "" : " hidden"}>
            ${customStart && customEnd ? `${escapeHtml(customStart)} – ${escapeHtml(customEnd)}` : "选择日期范围"}
          </button>
          <input class="cltc-analytics-date-input" data-analytics-date-input type="text" tabindex="-1" aria-hidden="true">
        </div>
        ${state.helperUnavailable ? `<button type="button" class="cltc-analytics-degraded" data-settings-panel="general">Helper 未运行，部分历史来源不可用 · 前往数据与显示</button>` : ""}
        <div class="cltc-analytics-metrics">
          ${metricRow("总 Token", fmtCount(current.totalTokens), { current: current.totalTokens, previous: previous.totalTokens })}
          ${metricRow("总花费", current.priced ? fmtMoney(current.cost) : `${fmtMoney(current.cost)} · 部分统计`, { current: current.cost, previous: previous.cost }, !current.priced || !previous.priced)}
          ${metricRow("模型调用", fmtCount(current.calls), { current: current.calls, previous: previous.calls })}
          ${metricRow("缓存命中率", current.cacheHitRate == null ? "—" : `${current.cacheHitRate}%`, { current: current.cacheHitRate, previous: previous.cacheHitRate })}
        </div>
        <div class="cltc-analytics-section">
          <div class="cltc-analytics-section-head">
            <div><h3>趋势</h3><p>${preset === "today" ? "按小时" : Math.ceil((range.endMs - range.startMs) / 86_400_000) + 1 > 90 ? "按周" : "按日"}</p></div>
            <div class="cltc-segmented cltc-segmented-compact" role="group" aria-label="趋势指标">
              <button type="button" data-analytics-metric="tokens" data-active="${String(metric === "tokens")}">Token</button>
              <button type="button" data-analytics-metric="cost" data-active="${String(metric === "cost")}">花费</button>
            </div>
          </div>
          ${analyticsChartSvg(filtered, range, metric)}
        </div>
        <div class="cltc-analytics-section">
          <div class="cltc-analytics-section-head"><div><h3>Token 构成</h3><p>输入构成互斥计算</p></div><strong>${fmtCount(compositionTotal)}</strong></div>
          <div class="cltc-composition-bar" aria-label="Token 构成">
            ${composition
              .filter((item) => item[3])
              .map(([label, value, tone]) => `<span data-tone="${tone}" style="flex-grow:${value}" title="${label} · ${fmtCount(value)}"></span>`)
              .join("")}
          </div>
          <div class="cltc-composition-legend">
            ${composition.map(([label, value, tone, available]) => `<span><i data-tone="${tone}"></i>${label}<strong>${available ? fmtCount(value) : "未提供"}</strong></span>`).join("")}
          </div>
        </div>
        <div class="cltc-analytics-section">
          <div class="cltc-analytics-section-head"><div><h3>模型明细</h3><p>点击模型可联动筛选整页</p></div></div>
          <div class="cltc-analytics-model-head"><span>模型</span><span>Token</span><span>模型调用</span><span>花费</span><span>占比</span></div>
          <div class="cltc-analytics-models">${modelRows || `<div class="cltc-analytics-empty">当前范围内暂无真实模型调用。</div>`}</div>
          ${current.models.length > 10 ? `<button type="button" class="cltc-analytics-expand" data-action="toggle-analytics-models">${state.analyticsModelsExpanded ? "收起" : `查看全部 ${current.models.length} 个模型`}</button>` : ""}
        </div>
      </section>
    `;
  }

  function turnListCost(turns, fallbackUsage, fallbackModel = modelName()) {
    const items = Array.isArray(turns) ? turns : [];
    if (!items.length) return costForModelUsage(fallbackUsage, fallbackModel);
    return items.reduce(
      (sum, turn) => {
        const cost = turnCost(turn, fallbackModel);
        sum.value += cost.value;
        sum.priced = sum.priced && cost.priced;
        return sum;
      },
      { value: 0, priced: true },
    );
  }

  function mainEditable() {
    const now = Date.now();
    if (state.mainEditable && now - state.mainEditableAt < 1000 && state.mainEditable.isConnected !== false) return state.mainEditable;
    let nodes = [];
    try {
      nodes = Array.from(document.querySelectorAll("textarea,[contenteditable='true']"));
    } catch {
      nodes = [];
    }
    const height = window.innerHeight || document.documentElement?.clientHeight || 1000;
    const candidates = nodes
      .filter((node) => !state.root?.contains?.(node))
      .map((node) => ({ node, rect: node.getBoundingClientRect?.() || { width: 0, height: 0, bottom: 0, top: 0 } }))
      .filter(({ rect }) => rect.width >= 240 && rect.height >= 20 && rect.bottom > 0 && rect.top < height)
      .sort((a, b) => b.rect.bottom - a.rect.bottom);
    state.mainEditable = candidates[0]?.node || null;
    state.mainEditableAt = now;
    return state.mainEditable;
  }

  function isEditableTarget(target) {
    const editable = mainEditable();
    const closest = target?.closest?.("textarea,[contenteditable='true']");
    return Boolean(editable && (target === editable || closest === editable || editable.contains?.(target)));
  }

  function isMainComposerSurfaceTarget(target) {
    const editable = mainEditable();
    if (!editable || !target) return false;
    if (target === editable || editable.contains?.(target) || target.contains?.(editable)) return true;
    const form = editable.closest?.("form");
    if (form?.contains?.(target)) return true;
    const explicitSurface = editable.closest?.(".composer-surface-chrome,[data-codex-composer-surface],[data-testid*='composer']");
    if (explicitSurface?.contains?.(target)) return true;
    let node = editable.parentElement;
    for (let depth = 0; node && depth < 8; depth++) {
      if (node === document.body || node === document.documentElement || String(node.tagName || "").toUpperCase() === "MAIN") return false;
      if (node.contains?.(target)) return true;
      node = node.parentElement;
    }
    return false;
  }

  function rememberPendingInput(event) {
    void event;
    return false;
  }

  function rememberSidebarThreadClick(event) {
    if (event?.type !== "click") return;
    const threadKey = sidebarThreadKeyFromNode(event.target);
    if (!threadKey) return;
    state.newConversationSessionKey = "";
    state.newConversationSessionKeyAt = 0;
    state.lastClickedSidebarThreadKey = resolveSessionKey(threadKey);
    state.lastClickedSidebarThreadAt = Date.now();
    state.userSelectedSidebarThreadKey = state.lastClickedSidebarThreadKey;
    state.userSelectedSidebarThreadAt = state.lastClickedSidebarThreadAt;
    syncActiveLocalCurrentTurn();
    syncActiveTurnShimmerState();
    scheduleRender(0);
  }

  function rememberNewConversationClick(event) {
    if (event?.type !== "click") return false;
    const target = event.target?.closest?.("button,a,[role='button'],[aria-label],[title]") || event.target;
    const label = normalizeText(`${target?.getAttribute?.("aria-label") || ""} ${target?.getAttribute?.("title") || ""} ${target?.textContent || target?.innerText || ""}`, 160);
    if (!/(new\s*(chat|conversation|thread|task)|新建|新对话|新会话|新任务|新的对话|新的会话)/i.test(label)) return false;
    state.lastClickedSidebarThreadKey = "";
    state.lastClickedSidebarThreadAt = 0;
    state.userSelectedSidebarThreadKey = "";
    state.userSelectedSidebarThreadAt = 0;
    state.detectedSessionKey = "";
    state.detectedSessionKeyAt = 0;
    state.newConversationSessionKey = `new:${Date.now().toString(36)}`;
    state.newConversationSessionKeyAt = Date.now();
    scheduleRender(0);
    return true;
  }

  function handleDocumentClick(event) {
    if (rememberNewConversationClick(event)) return;
    rememberSidebarThreadClick(event);
    rememberPendingInput(event);
  }

  function liveSnapshot() {
    const sessionKey = currentSessionKey();
    syncActiveLocalCurrentTurn();
    syncActiveTurnShimmerState();
    migrateLegacyLocationSessionTurns(sessionKey);
    if (!localCurrentTurn(sessionKey)) restoreRunningCurrentTurnFromLast(sessionKey);
    const source = readTokenUsage();
    const turns = currentSessionTurns(source.turns, sessionKey);
    const lastTurn = sameSessionKey(turnSessionKey(source.last), sessionKey) ? source.last : turns[turns.length - 1] || null;
    const currentTurn = sameSessionKey(source.currentTurn?.sessionKey, sessionKey) ? source.currentTurn : null;
    const modelInfo = activeModelInfo();
    const model = modelInfo.model;
    const price = priceFor(model);
    const currentTurnUsage = normalizeUsage(currentTurn?.usage);
    const exactLast = normalizeUsage(lastTurn?.usage);
    const exactTurnId = lastTurn?.turnId || "";
    const hasNewExact = exactLast.exact && exactTurnId && exactTurnId !== state.lastExactTurnId;
    if (hasNewExact) state.lastExactTurnId = exactTurnId;

    const running = isTurnShimmerRunning(sessionKey) || isOfficialThreadRunning(sessionKey);
    state.running = running;

    const zeroCurrent = { input: 0, output: 0, cached: 0, total: 0, exact: true };
    const current = currentTurnUsage.exact ? currentTurnUsage : running && !hasNewExact ? zeroCurrent : exactLast.exact ? exactLast : zeroCurrent;
    const confidence = "exact";

    const session = sessionUsage(turns);
    const lastIsInTurns = current.exact && turns.some((turn) => metricUsageKey(turn) === usageKey(current));
    const accountedSession = current.exact && !lastIsInTurns ? addUsage(session, current) : session;
    const displaySession = accountedSession;
    const sessionCostTurns = current.exact && currentTurn && !lastIsInTurns ? [...turns, currentTurn] : turns;
    const sessionCost = turnListCost(sessionCostTurns, displaySession, model);
    const dayCost = todayCost();
    const dayUsage = todayUsage();
    const fastMode = state.detectedFastMode === true;
    return { current, session: displaySession, turns: turns.length, sessionKey, model, modelInfo, price, sessionCost, dayCost, dayUsage, confidence, running, fastMode };
  }

  function emptyDailyUsageBucket(date = "") {
    return { date, tokens: 0, input: 0, output: 0, cached: 0, requests: 0, cost: 0, priced: true };
  }

  function addTurnToDailyBucket(bucket, turn, usage) {
    const model = turn.model || modelName();
    const cost = calcCost(usage, priceFor(model), { fastMode: turn.fastMode === true, model });
    const storedCost = storedTurnCost(turn);
    const hasStoredCost = storedCost != null;
    bucket.tokens += toCount(usage.total || usage.input + usage.output);
    bucket.input += toCount(usage.input);
    bucket.output += toCount(usage.output);
    bucket.cached += toCount(usage.cached);
    bucket.requests += toCount(turn.callCount) || 1;
    bucket.cost += hasStoredCost ? storedCost : cost.value;
    bucket.priced = bucket.priced !== false && (hasStoredCost || cost.priced);
    return bucket;
  }

  function addDailyBucket(target, source) {
    target.tokens += toCount(source?.tokens);
    target.input += toCount(source?.input);
    target.output += toCount(source?.output);
    target.cached += toCount(source?.cached);
    target.requests += toCount(source?.requests);
    target.cost += Number(source?.cost) || 0;
    target.priced = target.priced !== false && source?.priced !== false;
    return target;
  }

  function maxDailyBucket(target, source) {
    const targetHasUsage = toCount(target?.tokens) > 0 || toCount(target?.input) > 0 || toCount(target?.output) > 0 || toCount(target?.cached) > 0;
    const sourceWins = !targetHasUsage || toCount(source?.tokens) > toCount(target?.tokens) || Number(source?.cost) > Number(target?.cost);
    target.tokens = Math.max(toCount(target.tokens), toCount(source?.tokens));
    target.input = Math.max(toCount(target.input), toCount(source?.input));
    target.output = Math.max(toCount(target.output), toCount(source?.output));
    target.cached = Math.max(toCount(target.cached), toCount(source?.cached));
    target.requests = Math.max(toCount(target.requests), toCount(source?.requests));
    target.cost = Math.max(Number(target.cost) || 0, Number(source?.cost) || 0);
    target.priced = sourceWins ? source?.priced !== false : target.priced !== false;
    return target;
  }

  function turnTimestampMs(turn) {
    const direct = toCount(turn?.observedAt || turn?.startedAt || turn?.finishedAt || turn?.createdAt);
    if (direct) return direct;
    const parsed = Date.parse(turn?.observedAt || turn?.startedAt || turn?.finishedAt || turn?.createdAt || "");
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function localDailyUsage(options = {}) {
    ensureLocalLedgerLoaded();
    const byDayModel = new Map();
    const ledgerTurnIds = new Set();
    for (const turn of [...localUsageArchiveTurns(), ...state.localLedger]) {
      const usage = normalizeUsage(turn?.usage);
      if (!usage.exact) continue;
      const turnId = normalizeText(turn?.turnId || turn?.id, 120);
      if (turnId) ledgerTurnIds.add(turnId);
      const date = localDateKey(turnTimestampMs(turn) || Date.now());
      const key = date;
      const source = normalizeText(turn.source, 80);
      const importSource = normalizeText(turn.importSource, 80);
      const isCcSwitch = source === "cc-switch" || importSource === "cc-switch";
      const group = byDayModel.get(key) || {
        date,
        local: emptyDailyUsageBucket(date),
        ccSwitch: emptyDailyUsageBucket(date),
      };
      if (isCcSwitch) addTurnToDailyBucket(group.ccSwitch, turn, usage);
      else addTurnToDailyBucket(group.local, turn, usage);
      byDayModel.set(key, group);
    }

    const currentMetric = localTurnMetric(localCurrentTurn(currentSessionKey()));
    if (currentMetric && !ledgerTurnIds.has(currentMetric.turnId)) {
      const date = localDateKey(turnTimestampMs(currentMetric) || Date.now());
      const key = date;
      const group = byDayModel.get(key) || {
        date,
        local: emptyDailyUsageBucket(date),
        ccSwitch: emptyDailyUsageBucket(date),
      };
      addTurnToDailyBucket(group.local, currentMetric, normalizeUsage(currentMetric.usage));
      byDayModel.set(key, group);
    }

    const days = new Map();
    for (const group of byDayModel.values()) {
      const prev = days.get(group.date) || emptyDailyUsageBucket(group.date);
      const merged = emptyDailyUsageBucket(group.date);
      maxDailyBucket(merged, group.local);
      maxDailyBucket(merged, group.ccSwitch);
      addDailyBucket(prev, merged);
      days.set(group.date, prev);
    }
    return days;
  }

  function localProfileThreadCount() {
    ensureLocalLedgerLoaded();
    const keys = new Set();
    for (const turn of state.localLedger) {
      const usage = normalizeUsage(turn?.usage);
      if (!usage.exact) continue;
      const source = normalizeText(turn?.source, 80);
      const importSource = normalizeText(turn?.importSource, 80);
      if (source === "cc-switch" || importSource === "cc-switch") continue;
      const key = turnSessionKey(turn);
      if (!key || key.startsWith("new:")) continue;
      keys.add(key);
    }
    return keys.size;
  }

  function localProfilePrefs() {
    if (state.profilePrefs) return state.profilePrefs;
    const saved = loadJson(PROFILE_PREFS_KEY, {});
    const overrides = loadJson(PROFILE_OVERRIDES_KEY, {});
    const overrideEmail = validProfileEmail(overrides.email);
    if (overrideEmail && !validProfileEmail(loadJson(PROFILE_DEFAULTS_KEY, {}).email)) saveProfileDefaultEmail(overrideEmail);
    const defaultEmail = profileDefaultEmail();
    const username = profileUsernameAllowed(saved.username) ? stripProfileUsername(saved.username) : "codex-local-usage";
    const plan = normalizeProfilePlan(saved.planType ?? saved.plan, saved.planLabel);
    const rawImageUrl = normalizeText(saved.imageUrl, PROFILE_IMAGE_MAX_LENGTH);
    const imageUrl = normalizeProfileImageUrl(rawImageUrl);
    const savedEmail = validProfileEmail(saved.email);
    if (savedEmail && savedEmail !== LOCAL_PROFILE_EMAIL && defaultEmail === LOCAL_PROFILE_EMAIL) saveProfileDefaultEmail(savedEmail);
    const email = savedEmail && !(savedEmail === LOCAL_PROFILE_EMAIL && defaultEmail !== LOCAL_PROFILE_EMAIL) ? savedEmail : defaultEmail;
    if (rawImageUrl && imageUrl && imageUrl !== rawImageUrl) {
      try {
        localStorage.setItem(PROFILE_PREFS_KEY, JSON.stringify({ ...saved, imageUrl }));
      } catch {
        // Keep the repaired value in memory even if persistence fails.
      }
    }
    state.profilePrefs = {
      displayName: normalizeText(saved.displayName, 64) || "Local Usage",
      username,
      email,
      accountStructure: normalizeProfileAccountStructure(saved.accountStructure ?? saved.structure),
      workspaceName: normalizeProfileWorkspaceName(saved.workspaceName),
      planType: plan.planType,
      planLabel: plan.planLabel,
      imageUrl,
    };
    if (saved.email !== email) {
      try {
        localStorage.setItem(PROFILE_PREFS_KEY, JSON.stringify({ ...saved, email }));
      } catch {
        // Keep default-backed email active in memory even if repair fails.
      }
    }
    return state.profilePrefs;
  }

  function saveLocalProfilePrefs(prefs, options = {}) {
    const plan = normalizeProfilePlan(prefs?.planType ?? prefs?.plan, prefs?.planLabel);
    const next = {
      displayName: normalizeText(prefs?.displayName, 64) || "Local Usage",
      username: profileUsernameAllowed(prefs?.username) ? stripProfileUsername(prefs.username) : "codex-local-usage",
      email: normalizeProfileEmail(prefs?.email, profileDefaultEmail()),
      accountStructure: normalizeProfileAccountStructure(prefs?.accountStructure ?? prefs?.structure),
      workspaceName: normalizeProfileWorkspaceName(prefs?.workspaceName),
      planType: plan.planType,
      planLabel: plan.planLabel,
      imageUrl: normalizeProfileImageUrl(prefs?.imageUrl),
    };
    localStorage.setItem(PROFILE_PREFS_KEY, JSON.stringify(next));
    if (options.profileEditor) saveProfileDefaultEmail(next.email);
    state.profilePrefs = next;
    state.badProfileImageUrl = "";
    scheduleProfileIdentitySync(0);
    void scheduleProfileAccountsCheckRefresh();
    return next;
  }

  function extractProfilePhotoDataUrl(uploadBody) {
    if (!uploadBody) return "";
    let multipart = "";
    try {
      multipart = atob(String(uploadBody));
    } catch {
      multipart = String(uploadBody);
    }
    const headerEnd = multipart.indexOf("\r\n\r\n");
    if (headerEnd < 0) return "";
    const headers = multipart.slice(0, headerEnd);
    const contentType = headers.match(/Content-Type:\s*([^\r\n;]+)/i)?.[1]?.trim() || "image/jpeg";
    if (!/^image\//i.test(contentType)) return "";
    const bodyStart = headerEnd + 4;
    const bodyEnd = multipart.indexOf("\r\n--", bodyStart);
    const fileBinary = multipart.slice(bodyStart, bodyEnd >= 0 ? bodyEnd : undefined);
    return fileBinary ? `data:${contentType};base64,${binaryStringToBase64(fileBinary)}` : "";
  }

  function applyLocalProfilePhotoUpload(uploadBody) {
    const imageUrl = extractProfilePhotoDataUrl(uploadBody);
    if (!imageUrl) return localProfilePrefs();
    const prefs = localProfilePrefs();
    prefs.imageUrl = imageUrl;
    return saveLocalProfilePrefs(prefs);
  }

  function normalizeProfilePatchPayload(rawPatch) {
    const raw = typeof rawPatch === "string" ? loadJsonFromString(rawPatch, {}) : rawPatch || {};
    let patch = raw;
    if (typeof patch.bodyJsonString === "string") patch = loadJsonFromString(patch.bodyJsonString, {});
    if (patch && typeof patch === "object" && Object.prototype.hasOwnProperty.call(patch, "body")) {
      patch = typeof patch.body === "string" ? loadJsonFromString(patch.body, {}) : patch.body || {};
    }
    if (patch && typeof patch === "object" && Object.prototype.hasOwnProperty.call(patch, "requestBody")) {
      patch = typeof patch.requestBody === "string" ? loadJsonFromString(patch.requestBody, {}) : patch.requestBody || {};
    }
    if (patch?.profile && typeof patch.profile === "object") patch = patch.profile;
    return patch && typeof patch === "object" ? patch : {};
  }

  function applyLocalProfilePatch(rawPatch) {
    const patch = normalizeProfilePatchPayload(rawPatch);
    const prefs = localProfilePrefs();
    const has = (key) => Object.prototype.hasOwnProperty.call(patch, key);
    if (has("display_name") || has("displayName") || has("name")) {
      prefs.displayName = normalizeText(patch.display_name ?? patch.displayName ?? patch.name, 64) || "Local Usage";
    }
    if (has("username") || has("handle")) {
      const username = stripProfileUsername(patch.username ?? patch.handle);
      if (!profileUsernameAllowed(username)) throw new Error("Invalid username");
      prefs.username = username;
    }
    if (has("profile_picture_url") || has("profilePictureUrl") || has("avatar_url") || has("avatarUrl")) {
      prefs.imageUrl = normalizeProfileImageUrl(patch.profile_picture_url ?? patch.profilePictureUrl ?? patch.avatar_url ?? patch.avatarUrl);
    }
    if (has("email")) {
      const incomingEmail = validProfileEmail(patch.email);
      const defaultEmail = profileDefaultEmail();
      if (incomingEmail === LOCAL_PROFILE_EMAIL && validProfileEmail(prefs.email) && prefs.email !== LOCAL_PROFILE_EMAIL) {
        saveProfileDefaultEmail(prefs.email);
      } else if (incomingEmail && (incomingEmail !== LOCAL_PROFILE_EMAIL || defaultEmail === LOCAL_PROFILE_EMAIL)) {
        prefs.email = incomingEmail;
        if (incomingEmail !== LOCAL_PROFILE_EMAIL) saveProfileDefaultEmail(incomingEmail);
      } else {
        prefs.email = defaultEmail;
      }
    }
    if (has("plan_type") || has("planType") || has("plan") || has("planLabel")) {
      const plan = normalizeProfilePlan(patch.plan_type ?? patch.planType ?? patch.plan, patch.planLabel);
      prefs.planType = plan.planType;
      prefs.planLabel = plan.planLabel;
    }
    return saveLocalProfilePrefs(prefs);
  }

  function localProfilePlanLabel(prefs = localProfilePrefs()) {
    return prefs.planLabel || profilePlanOption(prefs.planType)?.label || prefs.planType || "Pro 20x";
  }

  function profileFallbackInitial(displayName) {
    return String(displayName || "Local Usage").trim().slice(0, 1) || "L";
  }

  function profileIdentitySignature(displayName, imageUrl) {
    const image = String(imageUrl || "");
    return `${VERSION}:${profileFallbackInitial(displayName)}:${image.length}:${image.slice(0, 48)}`;
  }

  function profileAvatarDisplayUrl(imageUrl) {
    const source = String(imageUrl || "");
    if (!source) return "";
    if (state.profileAvatarSourceUrl === source && state.profileAvatarRenderUrl) return state.profileAvatarRenderUrl;
    if (state.profileAvatarRenderUrl?.startsWith?.("blob:")) {
      try {
        URL.revokeObjectURL(state.profileAvatarRenderUrl);
      } catch {
        // Object URL cleanup is best-effort.
      }
    }
    state.profileAvatarSourceUrl = source;
    state.profileAvatarRenderUrl = source;
    if (!source.startsWith("data:image/") || typeof Blob !== "function" || typeof URL === "undefined" || typeof URL.createObjectURL !== "function") return source;
    try {
      const [header, body] = source.split(",", 2);
      const contentType = header.match(/^data:([^;]+);base64$/i)?.[1] || "image/jpeg";
      const binary = atob(body || "");
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
      state.profileAvatarRenderUrl = URL.createObjectURL(new Blob([bytes], { type: contentType }));
    } catch {
      state.profileAvatarRenderUrl = source;
    }
    return state.profileAvatarRenderUrl;
  }

  function syncProfileAvatarElement(avatar, imageUrl, displayName) {
    if (!avatar || !imageUrl || state.badProfileImageUrl === imageUrl) return false;
    const renderUrl = profileAvatarDisplayUrl(imageUrl);
    const signature = profileIdentitySignature(displayName, imageUrl);
    const img = avatar.querySelector?.("img[data-cltc-profile-avatar]") || avatar.querySelector?.("img");
    if (!img) return false;
    if (
      (avatar.__codexLiveTokenCostProfileSig === signature || avatar.getAttribute?.("data-cltc-profile-sig") === signature) &&
      (img.getAttribute?.("src") === renderUrl || img.src === renderUrl) &&
      (!img.complete || img.naturalWidth > 0)
    ) {
      return true;
    }
    img.onerror = () => {
      if (img.src === renderUrl || img.getAttribute?.("src") === renderUrl) state.badProfileImageUrl = imageUrl;
    };
    img.onload = () => {
      if (img.naturalWidth > 0) state.badProfileImageUrl = "";
    };
    if (img.getAttribute?.("src") !== renderUrl && img.src !== renderUrl) img.src = renderUrl;
    const alt = profileFallbackInitial(displayName);
    if (img.alt !== alt) img.alt = alt;
    avatar.__codexLiveTokenCostProfileSig = signature;
    avatar.setAttribute?.("data-cltc-profile-sig", signature);
    return true;
  }

  function findSidebarProfileButton(doc = document) {
    const direct = doc.querySelector?.(
      "button[aria-label='打开个人资料菜单'], button[aria-label='Open profile menu'], button[aria-label='Open profile menu and settings']",
    );
    if (!direct) return null;
    const rect = direct.getBoundingClientRect?.() || { width: 0, height: 0 };
    return rect.width !== 0 && rect.height !== 0 ? direct : null;
  }

  function syncSidebarProfileIdentity(doc = document) {
    const prefs = localProfilePrefs();
    const displayName = prefs.displayName || prefs.username || "Local Usage";
    const button = findSidebarProfileButton(doc);
    if (!button || !prefs.imageUrl) return false;
    return syncProfileAvatarElement(button, prefs.imageUrl, displayName);
  }

  function syncVisibleProfilePhotoIdentity(doc = document) {
    const prefs = localProfilePrefs();
    if (!prefs.imageUrl) return false;
    const displayName = prefs.displayName || prefs.username || "Local Usage";
    const nodes = Array.from(doc.querySelectorAll?.("label,div,span") || []);
    let synced = false;
    for (const node of nodes) {
      const className = String(node.className || "");
      if (!/rounded-full/.test(className)) continue;
      if (!/(size-20|size-32|h-20|w-20|h-32|w-32|text-\[28px\]|text-\[40px\])/.test(className)) continue;
      const label = node.closest?.("label") || (node.tagName === "LABEL" ? node : null);
      if (!label?.querySelector?.("input[type='file'][accept*='image'],input[type=\"file\"][accept*=\"image\"],input[type='file'],input[type=\"file\"]")) continue;
      if (node === label) continue;
      const rect = node.getBoundingClientRect?.() || { width: 0, height: 0 };
      if (rect.width < 64 || rect.height < 64 || rect.width > 160 || rect.height > 160) continue;
      const text = normalizeText(node.textContent || "", 16);
      const hasImg = Boolean(node.querySelector?.("img"));
      if (!hasImg && text && text.length > 2) continue;
      synced = syncProfileAvatarElement(node, prefs.imageUrl, displayName, doc) || synced;
    }
    return synced;
  }

  function syncProfileIdentity(doc = document) {
    return Boolean(syncSidebarProfileIdentity(doc) || syncVisibleProfilePhotoIdentity(doc));
  }

  function scheduleProfileIdentitySync(delay = 80) {
    if (state.profileIdentitySyncTimer || typeof window === "undefined" || typeof window.setTimeout !== "function") return;
    state.profileIdentitySyncTimer = window.setTimeout(() => {
      state.profileIdentitySyncTimer = 0;
      syncProfileIdentity();
    }, delay);
  }

  function installProfileIdentityObserver() {
    if (state.profileIdentityObserver || window.__CODEX_LIVE_TOKEN_COST_TEST__ || typeof MutationObserver !== "function") return;
    const target = document.body || document.documentElement;
    if (!target) return;
    state.profileIdentityObserver = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes || []) {
          if (node.nodeType !== 1) continue;
          const element = node;
          const text = normalizeText(element.textContent || "", 120);
          const className = String(element.className || "");
          if (
            element.matches?.("aside,aside *,label,input[type='file']") ||
            element.querySelector?.("aside button,label input[type='file'],input[type='file']") ||
            /rounded-full|size-7|size-20|size-32/.test(className) ||
            /设置|settings|Free|Go|Plus|Pro|Business|Enterprise|Edu|Local Usage/i.test(text)
          ) {
            scheduleProfileIdentitySync(0);
            return;
          }
        }
      }
    });
    state.profileIdentityObserver.observe(target, { childList: true, subtree: true });
  }

  function bindOfficialModelTrigger() {
    const trigger = document.querySelector?.(OFFICIAL_MODEL_TRIGGER_SELECTOR);
    if (trigger && trigger === state.officialModelTrigger) return readOfficialModelTrigger(trigger);
    state.officialModelObserver?.disconnect?.();
    state.officialModelObserver = null;
    state.officialModelTrigger = trigger || null;
    if (!trigger || typeof MutationObserver !== "function") {
      const changed = readOfficialModelTrigger(null);
      if (changed) scheduleRender(0);
      return changed;
    }
    const changed = readOfficialModelTrigger(trigger);
    state.officialModelObserver = new MutationObserver(() => {
      if (readOfficialModelTrigger(trigger)) scheduleRender(0);
    });
    state.officialModelObserver.observe(trigger, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ["data-selected-reasoning-effort", "aria-label", "title", "data-state", "class", "style", "hidden", "aria-hidden"],
    });
    if (changed) scheduleRender(0);
    return changed;
  }

  function mutationTouchesOfficialModelTrigger(mutation) {
    const target = mutation?.target;
    if (target?.nodeType === 1 && (target.matches?.(OFFICIAL_MODEL_TRIGGER_SELECTOR) || target.closest?.(OFFICIAL_MODEL_TRIGGER_SELECTOR))) return true;
    for (const node of Array.from(mutation?.addedNodes || [])) {
      if (node.nodeType === 1 && (node.matches?.(OFFICIAL_MODEL_TRIGGER_SELECTOR) || node.querySelector?.(OFFICIAL_MODEL_TRIGGER_SELECTOR))) return true;
    }
    for (const node of Array.from(mutation?.removedNodes || [])) {
      if (node === state.officialModelTrigger || (node.nodeType === 1 && node.contains?.(state.officialModelTrigger))) return true;
    }
    return false;
  }

  function installOfficialModelObserver() {
    if (window.__CODEX_LIVE_TOKEN_COST_TEST__) return;
    bindOfficialModelTrigger();
    if (state.officialModelRootObserver || typeof MutationObserver !== "function") return;
    const target = document.body || document.documentElement;
    if (!target) return;
    state.officialModelRootObserver = new MutationObserver((mutations) => {
      if (mutations.some(mutationTouchesOfficialModelTrigger)) bindOfficialModelTrigger();
    });
    state.officialModelRootObserver.observe(target, { childList: true, subtree: true });
  }

  function localProfileResponse() {
    const days = Array.from(localDailyUsage().values()).sort((a, b) => a.date.localeCompare(b.date));
    const totalTokens = days.reduce((sum, day) => sum + day.tokens, 0);
    const peak = days.reduce((max, day) => Math.max(max, day.tokens), 0);
    const streak = localProfileStreakStats(days);
    const activity = mergeActivityWithHelperStats(localProfileActivityStats(state.localLedger));
    const totalThreads = toCount(state.helperStats?.totalThreads) || localProfileThreadCount();
    const topPlugin = activity.topPlugins?.[0] || null;
    const prefs = localProfilePrefs();
    const fastModePercent = activity.fastModePercent ?? 0;
    return {
      profile: {
        display_name: prefs.displayName,
        username: prefs.username,
        email: prefs.email,
        plan_type: prefs.planType,
        plan_label: prefs.planLabel,
        profile_picture_url: prefs.imageUrl,
      },
      metadata: { stats_error: "" },
      stats: {
        daily_usage_buckets: localProfileDailyUsageBuckets(days),
        lifetime_tokens: totalTokens,
        peak_daily_tokens: peak,
        current_streak_days: streak.current,
        longest_streak_days: streak.longest,
        longest_running_turn_sec: activity.longestRunningTurnSec || 0,
        fast_mode_usage_percentage: fastModePercent,
        top_invocations: activity.topInvocations,
        top_plugins: activity.topPlugins,
        most_used_plugin: topPlugin ? topPlugin.plugin_name || topPlugin.plugin_id || null : null,
        most_used_plugin_usage_count: toCount(topPlugin?.usage_count),
        most_used_reasoning_effort: activity.reasoningEffort || activeModelInfo().effort || null,
        most_used_reasoning_effort_percentage: activity.reasoningEffortPercent,
        unique_skills_used: activity.uniqueSkillsUsed,
        total_skills_used: activity.totalSkillsUsed,
        unique_plugins_used: activity.uniquePluginsUsed,
        total_plugins_used: activity.totalPluginsUsed,
        total_threads: totalThreads,
      },
    };
  }

  function statsigClients() {
    const root = window.__STATSIG__ || globalThis.__STATSIG__;
    if (!root || typeof root !== "object") return [];
    const clients = [root.firstInstance, typeof root.instance === "function" ? root.instance() : null];
    if (root.instances && typeof root.instances === "object") clients.push(...Object.values(root.instances));
    return clients.filter((client, index, all) => client && typeof client === "object" && all.indexOf(client) === index);
  }

  function patchProfileStatsigClient(client) {
    if (!client || typeof client !== "object" || client.__codexLiveTokenCostProfileGatePatched === VERSION) return;
    if (typeof client.checkGate === "function") {
      const originalCheckGate = client.__codexLiveTokenCostOriginalCheckGate || client.checkGate.bind(client);
      client.checkGate = (name, options) => (name === PROFILE_GATE_ID ? true : originalCheckGate(name, options));
      client.__codexLiveTokenCostOriginalCheckGate = originalCheckGate;
    }
    if (typeof client.getFeatureGate === "function") {
      const originalGetFeatureGate = client.__codexLiveTokenCostOriginalGetFeatureGate || client.getFeatureGate.bind(client);
      client.getFeatureGate = (name, options) => {
        const gate = originalGetFeatureGate(name, options);
        if (name !== PROFILE_GATE_ID) return gate;
        return gate && typeof gate === "object" ? { ...gate, value: true } : gate;
      };
      client.__codexLiveTokenCostOriginalGetFeatureGate = originalGetFeatureGate;
    }
    client.__codexLiveTokenCostProfileGatePatched = VERSION;
    try {
      if (typeof client.$emt === "function") client.$emt({ name: "values_updated" });
    } catch {
      // Statsig event emission is best-effort.
    }
  }

  function patchProfileStatsigGate() {
    statsigClients().forEach(patchProfileStatsigClient);
  }

  function installProfileUsernameUppercaseUnlock() {
    const originalTest = RegExp.prototype.__codexLiveTokenCostOriginalTest || RegExp.prototype.test;
    if (RegExp.prototype.test.__codexLiveTokenCostProfileUnlock === VERSION) return;
    const patchedTest = function codexLiveTokenCostProfileUsernameTest(value) {
      if (this?.source === "^[a-z0-9._-]+$" && this?.flags === "") return /^[A-Za-z0-9._-]+$/.test(String(value || ""));
      return originalTest.call(this, value);
    };
    patchedTest.__codexLiveTokenCostProfileUnlock = VERSION;
    RegExp.prototype.__codexLiveTokenCostOriginalTest = originalTest;
    RegExp.prototype.test = patchedTest;
  }

  function profileFetchBody(method, body, url) {
    if (isProfileAccountsCheckUrl(url)) return localProfileAccountsCheckResponse();
    if (method === "PATCH") applyLocalProfilePatch(body);
    if (method === "POST") {
      applyLocalProfilePhotoUpload(body);
      return { asset_pointer: "local-profile-photo" };
    }
    return localProfileResponse();
  }

  function profileFetchBodyWithHelperRefresh(method, body, url) {
    if (isProfileAccountsCheckUrl(url)) return profileFetchBody(method, body, url);
    if (String(method || "GET").toUpperCase() !== "GET" || typeof window.fetch !== "function") return profileFetchBody(method, body, url);
    void refreshProfileData();
    return profileFetchBody(method, body, url);
  }

  async function profileFetchBodyAsync(method, body, url) {
    return profileFetchBodyWithHelperRefresh(method, body, url);
  }

  function codexAppAssetUrls() {
    const scripts = Array.from(document.scripts || []).map((script) => script.src);
    const links = Array.from(document.querySelectorAll?.("link[href]") || []).map((link) => link.href);
    const resources = typeof performance?.getEntriesByType === "function" ? performance.getEntriesByType("resource").map((entry) => entry.name) : [];
    return Array.from(new Set([...scripts, ...links, ...resources].filter(Boolean).filter((url) => url.includes("/assets/") && url.split("?")[0].endsWith(".js"))));
  }

  function assetReferenceFromText(text, baseUrl, namePart) {
    const escaped = namePart.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const match = String(text || "").match(new RegExp(`["'](\\./(?:assets/)?${escaped}[^"']+\\.js)["']`));
    return match ? new URL(match[1], baseUrl).href : "";
  }

  async function codexAppAssetUrl(namePart) {
    const urls = codexAppAssetUrls();
    const direct = urls.find((url) => url.split("/").pop()?.startsWith(namePart));
    if (direct) return direct;
    for (const src of urls) {
      try {
        const text = await fetch(src).then((response) => (response.ok ? response.text() : ""));
        const found = assetReferenceFromText(text, src, namePart);
        if (found) return found;
      } catch {
        // Asset discovery is best-effort across Codex desktop versions.
      }
    }
    if (namePart === "request-") {
      const profileQueriesUrl = await codexAppAssetUrl("profile-queries-");
      if (profileQueriesUrl) {
        try {
          const text = await fetch(profileQueriesUrl).then((response) => (response.ok ? response.text() : ""));
          return assetReferenceFromText(text, profileQueriesUrl, "request-");
        } catch {
          return "";
        }
      }
    }
    return "";
  }

  async function loadCodexAppModule(namePart) {
    if (!state.codexModulePromises.has(namePart)) {
      const promise = Promise.resolve()
        .then(async () => {
          const url = await codexAppAssetUrl(namePart);
          if (!url) throw new Error(`Codex app asset not found: ${namePart}`);
          return import(url);
        })
        .catch((error) => {
          state.codexModulePromises.delete(namePart);
          throw error;
        });
      state.codexModulePromises.set(namePart, promise);
    }
    return state.codexModulePromises.get(namePart);
  }

  async function invalidateProfileQuery(queryKey) {
    if (window.__CODEX_LIVE_TOKEN_COST_TEST__) return false;
    if (!state.profileQueryClient) {
      rememberProfileQueryClient(profileQueryClientFromFiberNode(findSidebarProfileButton(document)));
    }
    let invalidatedLocally = false;
    try {
      invalidatedLocally = await invalidateProfileQueryWithClient(state.profileQueryClient, queryKey);
    } catch {
      // Keep the broadcast fallback available when the local query client is unavailable.
    }
    try {
      const module = await loadCodexAppModule("vscode-api-");
      const dispatcher = Object.values(module || {}).find((value) => value && typeof value.dispatchMessage === "function");
      if (!dispatcher) return invalidatedLocally;
      dispatcher.dispatchMessage("query-cache-invalidate", { queryKey: queryKey.slice() });
      return true;
    } catch {
      return invalidatedLocally;
    }
  }

  function invalidateProfileUsageQuery() {
    return invalidateProfileQuery(PROFILE_USAGE_QUERY_KEY);
  }

  function chainProfileQueryRefresh(previous, refresh) {
    return Promise.resolve(previous).catch(() => undefined).then(refresh);
  }

  async function invalidateProfileQueryWithClient(queryClient, queryKey) {
    if (!isProfileQueryClient(queryClient)) return false;
    await queryClient.invalidateQueries({ queryKey: queryKey.slice() });
    return true;
  }

  function invalidateProfileAccountsCheckQuery() {
    return invalidateProfileQuery(PROFILE_ACCOUNTS_CHECK_QUERY_KEY);
  }

  function scheduleProfileAccountsCheckRefresh() {
    const next = chainProfileQueryRefresh(state.profileAccountsRefreshPromise, invalidateProfileAccountsCheckQuery);
    state.profileAccountsRefreshPromise = next.catch(() => false);
    return state.profileAccountsRefreshPromise;
  }

  function scheduleProfileUsageRefresh(delay = 1000) {
    state.profileUsageRefreshRequests += 1;
    if (window.__CODEX_LIVE_TOKEN_COST_TEST__ || state.profileUsageRefreshTimer || typeof window.setTimeout !== "function") return;
    state.profileUsageRefreshTimer = window.setTimeout(() => {
      state.profileUsageRefreshTimer = 0;
      void invalidateProfileUsageQuery();
    }, delay);
  }

  function patchProfileRequestClient(client) {
    if (!client || typeof client !== "object") return false;
    if (client.__codexLiveTokenCostProfileRequestPatch === VERSION) return true;
    if (typeof client.safeGet !== "function" && typeof client.safePatch !== "function") return false;
    const originalSafeGet = client.__codexLiveTokenCostOriginalSafeGet || client.safeGet?.bind(client);
    const originalSafePatch = client.__codexLiveTokenCostOriginalSafePatch || client.safePatch?.bind(client);
    if (typeof originalSafeGet === "function") {
      client.safeGet = async function codexLiveTokenCostProfileSafeGet(url, ...args) {
        if (isProfileUsageUrl(url) || isProfileAccountsCheckUrl(url)) return profileFetchBodyAsync("GET", null, url);
        return originalSafeGet(url, ...args);
      };
      client.__codexLiveTokenCostOriginalSafeGet = originalSafeGet;
    }
    if (typeof originalSafePatch === "function") {
      client.safePatch = async function codexLiveTokenCostProfileSafePatch(url, options, ...args) {
        if (isProfileUsageUrl(url)) {
          applyLocalProfilePatch(options);
          return localProfileResponse();
        }
        return originalSafePatch(url, options, ...args);
      };
      client.__codexLiveTokenCostOriginalSafePatch = originalSafePatch;
    }
    client.__codexLiveTokenCostProfileRequestPatch = VERSION;
    return true;
  }

  function patchProfilePhotoUploadClient(client) {
    if (!client || typeof client !== "object" || typeof client.post !== "function") return false;
    if (client.__codexLiveTokenCostProfilePhotoPatch === VERSION) return true;
    const originalPost = client.__codexLiveTokenCostOriginalPost || client.post.bind(client);
    client.post = async function codexLiveTokenCostProfilePhotoPost(url, body, headers, ...args) {
      if (isProfilePhotoUrl(url)) {
        applyLocalProfilePhotoUpload(body);
        return { status: 200, body: { asset_pointer: "local-profile-photo" }, headers: { "content-type": "application/json" } };
      }
      return originalPost(url, body, headers, ...args);
    };
    client.__codexLiveTokenCostOriginalPost = originalPost;
    client.__codexLiveTokenCostProfilePhotoPatch = VERSION;
    return true;
  }

  async function installProfileRequestClientPatch() {
    if (window.__CODEX_LIVE_TOKEN_COST_TEST__) return;
    try {
      const module = await loadCodexAppModule("request-");
      let patched = 0;
      for (const value of Object.values(module || {})) {
        if (patchProfileRequestClient(value)) patched += 1;
      }
      window.__codexLiveTokenCostProfileRequestPatch = patched > 0 ? VERSION : "not-found";
    } catch (error) {
      window.__codexLiveTokenCostProfileRequestPatch = "error";
      window.__codexLiveTokenCostProfileRequestPatchError = error?.message || String(error);
    }
  }

  async function installProfilePhotoUploadPatch() {
    if (window.__CODEX_LIVE_TOKEN_COST_TEST__) return;
    try {
      const module = await loadCodexAppModule("vscode-api-");
      let patched = 0;
      for (const value of Object.values(module || {})) {
        try {
          const client = typeof value?.getInstance === "function" ? value.getInstance() : value;
          if (patchProfilePhotoUploadClient(client)) patched += 1;
        } catch {
          // Ignore non-client exports.
        }
      }
      window.__codexLiveTokenCostProfilePhotoPatch = patched > 0 ? VERSION : "not-found";
    } catch (error) {
      window.__codexLiveTokenCostProfilePhotoPatch = "error";
      window.__codexLiveTokenCostProfilePhotoPatchError = error?.message || String(error);
    }
  }

  async function installProfileAuthContextPatch() {
    if (window.__CODEX_LIVE_TOKEN_COST_TEST__) return;
    try {
      const reactUrl = profileReactAssetUrl();
      const [reactModule, authModule] = await Promise.all([
        reactUrl ? import(reactUrl) : loadCodexAppModule("jsx-runtime-"),
        loadCodexAppModule("use-auth-"),
      ]);
      const patched = patchProfileReactAuthContext(profileReactFromModule(reactModule), profileAuthContextFromModule(authModule));
      window.__codexLiveTokenCostProfileAuthPatch = patched ? VERSION : "not-found";
    } catch (error) {
      window.__codexLiveTokenCostProfileAuthPatch = "error";
      window.__codexLiveTokenCostProfileAuthPatchError = error?.message || String(error);
    }
  }

  function isProfileFetchMessage(message) {
    return message?.type === "fetch" && (isProfileUsageUrl(message.url) || isProfilePhotoUrl(message.url) || isProfileAccountsCheckUrl(message.url));
  }

  function rememberProfileRequestId(requestId) {
    if (requestId == null || requestId === "") return;
    const now = Date.now();
    state.profileRequestIds.set(String(requestId), now);
    for (const [key, seenAt] of state.profileRequestIds) {
      if (now - seenAt > 30000) state.profileRequestIds.delete(key);
    }
  }

  function isRememberedProfileRequestId(requestId) {
    if (requestId == null || requestId === "") return false;
    return state.profileRequestIds.has(String(requestId));
  }

  function emitProfileFetchResponse(requestId, method, body, url) {
    rememberProfileRequestId(requestId);
    const sendPayload = (payload) => {
      const message = {
      type: "fetch-response",
      __codexLiveTokenCostProfileLocal: true,
      requestId,
      responseType: "success",
      status: 200,
      headers: { "content-type": "application/json" },
      bodyJsonString: JSON.stringify(payload),
      };
      if (typeof window.postMessage === "function") {
        window.postMessage(message, location.origin || "*");
        return;
      }
      window.dispatchEvent(new MessageEvent("message", { data: message, origin: location.origin, source: window }));
    };
    const payload = profileFetchBodyWithHelperRefresh(method, body, url);
    if (payload && typeof payload.then === "function") {
      payload.then(sendPayload);
      return;
    }
    sendPayload(payload);
  }

  function handleProfileFetchEvent(event) {
    const message = event?.detail;
    if (!isProfileFetchMessage(message)) return;
    rememberProfileRequestId(message.requestId);
    event.preventDefault?.();
    event.stopImmediatePropagation?.();
    window.setTimeout(() => {
      void emitProfileFetchResponse(message.requestId, String(message.method || "GET").toUpperCase(), message.body, message.url);
    }, 0);
  }

  function handleProfileFetchResponseEvent(event) {
    const data = event?.data;
    if (data?.type !== "fetch-response" || !isRememberedProfileRequestId(data.requestId)) return;
    if (data.__codexLiveTokenCostProfileLocal) return;
    event.preventDefault?.();
    event.stopImmediatePropagation?.();
  }

  function profileBridgeSendMessage(originalSend) {
    const patchedSend = (message) => {
      if (isProfileFetchMessage(message)) {
        rememberProfileRequestId(message.requestId);
        window.setTimeout(() => {
          void emitProfileFetchResponse(message.requestId, String(message.method || "GET").toUpperCase(), message.body, message.url);
        }, 0);
        return Promise.resolve();
      }
      return originalSend(message);
    };
    patchedSend.__codexLiveTokenCostProfileUnlock = VERSION;
    return patchedSend;
  }

  function patchProfileElectronBridge() {
    const bridge = window.electronBridge;
    if (!bridge || typeof bridge.sendMessageFromView !== "function" || bridge.sendMessageFromView.__codexLiveTokenCostProfileUnlock === VERSION) {
      return Boolean(bridge?.sendMessageFromView?.__codexLiveTokenCostProfileUnlock === VERSION);
    }
    const originalSend = bridge.__codexLiveTokenCostOriginalSendMessageFromView || bridge.sendMessageFromView.bind(bridge);
    const patchedSend = profileBridgeSendMessage(originalSend);
    try {
      bridge.sendMessageFromView = patchedSend;
      bridge.__codexLiveTokenCostOriginalSendMessageFromView = originalSend;
      return bridge.sendMessageFromView === patchedSend || bridge.sendMessageFromView.__codexLiveTokenCostProfileUnlock === VERSION;
    } catch {
      return false;
    }
  }

  function profileBridgeProxy(bridge) {
    if (!bridge || typeof bridge.sendMessageFromView !== "function" || typeof Proxy !== "function") return bridge;
    if (bridge.__codexLiveTokenCostProfileProxy === VERSION) return bridge;
    const originalSend = bridge.__codexLiveTokenCostOriginalSendMessageFromView || bridge.sendMessageFromView.bind(bridge);
    const patchedSend = profileBridgeSendMessage(originalSend);
    const proxy = new Proxy(
      {},
      {
        get(_target, prop, receiver) {
        if (prop === "sendMessageFromView") return patchedSend;
        if (prop === "__codexLiveTokenCostOriginalSendMessageFromView") return originalSend;
        if (prop === "__codexLiveTokenCostProfileProxy") return VERSION;
        return Reflect.get(bridge, prop, receiver);
      },
        set(_target, prop, value, receiver) {
          return Reflect.set(bridge, prop, value, receiver);
        },
        has(_target, prop) {
          return prop in bridge;
        },
        ownKeys() {
          return Reflect.ownKeys(bridge);
        },
        getOwnPropertyDescriptor(_target, prop) {
          const descriptor = Reflect.getOwnPropertyDescriptor(bridge, prop);
          return descriptor ? { ...descriptor, configurable: true } : undefined;
        },
      },
    );
    return proxy;
  }

  function installElectronBridgeHook() {
    if (window.__codexLiveTokenCostBridgeHook === VERSION) return;
    window.__codexLiveTokenCostBridgeHook = VERSION;
    patchProfileElectronBridge();
    let current = profileBridgeProxy(window.electronBridge);
    try {
      const descriptor = Object.getOwnPropertyDescriptor(window, "electronBridge");
      if (descriptor?.configurable === false) return;
      Object.defineProperty(window, "electronBridge", {
        configurable: true,
        enumerable: true,
        get() {
          return current;
        },
        set(value) {
          current = profileBridgeProxy(value);
          window.setTimeout(patchProfileElectronBridge, 0);
        },
      });
      if (current) window.setTimeout(patchProfileElectronBridge, 0);
    } catch {
      // If the preload owns a non-configurable bridge, the interval fallback still tries.
    }
  }

  function installProfileMessageIntercept() {
    if (window.__codexLiveTokenCostProfileMessageIntercept === VERSION) return;
    window.addEventListener("codex-message-from-view", handleProfileFetchEvent, true);
    window.addEventListener("message", handleProfileFetchResponseEvent, true);
    window.__codexLiveTokenCostProfileMessageIntercept = VERSION;
  }

  function installOfficialProfileUnlock() {
    const originalFilter = Array.prototype.__codexLiveTokenCostOriginalFilter || Array.prototype.filter;
    if (Array.prototype.filter.__codexLiveTokenCostProfileUnlock !== VERSION) {
      const patchedFilter = function codexLiveTokenCostProfileFilter(callback, thisArg) {
        const visible = originalFilter.call(this, callback, thisArg);
        return isSettingsSectionsArray(this) ? profileUnlockedSettingsSections(this, visible) : visible;
      };
      patchedFilter.__codexLiveTokenCostProfileUnlock = VERSION;
      Array.prototype.__codexLiveTokenCostOriginalFilter = originalFilter;
      Array.prototype.filter = patchedFilter;
    }

    const originalThen = Promise.prototype.__codexLiveTokenCostOriginalThen || Promise.prototype.then;
    if (Promise.prototype.then.__codexLiveTokenCostProfileUnlock !== VERSION) {
      const patchedThen = function codexLiveTokenCostProfileThen(onFulfilled, onRejected) {
        const wrappedFulfilled =
          typeof onFulfilled === "function"
            ? function codexLiveTokenCostProfileFulfilled(value) {
                const spoofedValue = isProfileAccountPayload(value)
                  ? spoofProfileAccountPayload(value)
                  : isProfileAccountsCheckPayload(value)
                    ? spoofProfileAccountsCheckPayload(value)
                    : value;
                return onFulfilled.call(this, spoofedValue);
              }
            : onFulfilled;
        return originalThen.call(this, wrappedFulfilled, onRejected);
      };
      patchedThen.__codexLiveTokenCostProfileUnlock = VERSION;
      Promise.prototype.__codexLiveTokenCostOriginalThen = originalThen;
      Promise.prototype.then = patchedThen;
    }

    installProfileUsernameUppercaseUnlock();
    installProfileMessageIntercept();
    installElectronBridgeHook();
    void installProfileRequestClientPatch();
    void installProfilePhotoUploadPatch();
    void installProfileAuthContextPatch();
    patchProfileElectronBridge();
    patchProfileStatsigGate();
  }

  function findComposerBox() {
    const editable = mainEditable();
    if (!editable) return null;
    let node = editable;
    let candidate = editable.parentElement || editable;
    for (let depth = 0; node?.parentElement && depth < 8; depth += 1, node = node.parentElement) {
      const rect = node.getBoundingClientRect();
      const style = getComputedStyle(node);
      if (rect.width >= 320 && rect.height >= 36 && rect.height <= 260 && style.display !== "contents") candidate = node;
    }
    return candidate;
  }

  function isCodexPlusText(value) {
    return /(^|[\s([{<])Codex\+\+(?=$|[\s)\]}>:：·|/-])/i.test(normalizeText(value, 240));
  }

  function findCodexPlusMenu(doc = document) {
    const byId = doc.getElementById?.(CODEX_PLUS_MENU_ID);
    if (byId) return byId;
    const candidates = Array.from(
      doc.querySelectorAll?.("button,[role='button'],a,header *,nav *,.app-header-tint *,[id*='codex-plus'],[class*='codex-plus']") || [],
    );
    return (
      candidates.find((node) => {
        const text = normalizeText(`${node.getAttribute?.("aria-label") || ""} ${node.textContent || ""}`, 160);
        return isCodexPlusText(text);
      }) || null
    );
  }

  function openSettingsEditor() {
    state.priceEditorOpen = true;
    state.priceEditorModel = modelName();
    void pollLocalHelperStats();
    render(true);
    const focusModal = () => state.settingsOverlay?.querySelector("[data-action='close-price']")?.focus?.();
    if (typeof window.requestAnimationFrame === "function") window.requestAnimationFrame(focusModal);
    else focusModal();
    if (state.settingsPanel === "usage") void refreshUsageAnalyticsFromHelper();
  }

  function closeSettingsEditor() {
    state.priceEditorOpen = false;
    state.analyticsModel = "";
    state.analyticsModelsExpanded = false;
    render(true);
  }

  function headerSettingsLabel(snap = null) {
    const usage = snap?.dayUsage || todayUsage();
    return `今日 ${fmtCount(usage.total)}`;
  }

  function updateHeaderSettingsButton(snap = null) {
    if (!state.settingsButton) return;
    const label = headerSettingsLabel(snap);
    state.settingsButton.textContent = label;
    state.settingsButton.title = `${label} · Codex Token Cost 设置`;
    state.settingsButton.setAttribute("aria-label", `${label}，打开 Codex Token Cost 设置`);
  }

  function ensureHeaderSettingsButton(doc = document) {
    ensureStyle();
    const existingButton = doc.getElementById?.(SETTINGS_BUTTON_ID);
    if (!state.settingsButton && existingButton?.id === SETTINGS_BUTTON_ID) state.settingsButton = existingButton;
    if (state.settingsButton && state.settingsButton.id !== SETTINGS_BUTTON_ID) state.settingsButton = null;
    const menu = findCodexPlusMenu(doc);
    if (!menu?.parentElement) {
      return state.settingsButton || (existingButton?.id === SETTINGS_BUTTON_ID ? existingButton : null);
    }
    if (existingButton && existingButton !== state.settingsButton) existingButton.remove?.();
    if (!state.settingsButton) {
      const button = doc.createElement("button");
      button.id = SETTINGS_BUTTON_ID;
      button.className = "cltc-header-settings no-drag cursor-interaction text-token-text-tertiary";
      button.type = "button";
      button.textContent = headerSettingsLabel();
      button.title = "Codex Token Cost 设置";
      button.setAttribute("aria-label", "打开 Codex Token Cost 设置");
      button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        openSettingsEditor();
      });
      state.settingsButton = button;
    }
    if (!state.settingsButton.style) state.settingsButton.style = {};
    const menuRect = menu.getBoundingClientRect?.();
    const floating = menu.parentElement === doc.documentElement || menu.parentElement === doc.body || /codex-plus-menu-floating/i.test(String(menu.className || ""));
    const setFloating = (value) => {
      if (state.settingsButton.dataset) state.settingsButton.dataset.floating = value;
      else state.settingsButton.setAttribute?.("data-floating", value);
    };
    if (floating && menuRect) {
      const parent = doc.body || doc.documentElement;
      if (state.settingsButton.parentElement !== parent) parent.appendChild(state.settingsButton);
      const gap = 4;
      setFloating("true");
      const buttonRect = state.settingsButton.getBoundingClientRect?.();
      const width = buttonRect?.width || 96;
      const height = buttonRect?.height || 30;
      const left = Math.max(gap, menuRect.left - width - gap);
      state.settingsButton.style.left = `${Math.round(left)}px`;
      state.settingsButton.style.top = `${Math.round(menuRect.top + (menuRect.height - height) / 2)}px`;
    } else {
      const parent = menu.parentElement;
      setFloating("false");
      state.settingsButton.style.left = "";
      state.settingsButton.style.top = "";
      if (state.settingsButton.parentElement !== parent || menu.nextSibling !== state.settingsButton) {
        parent.insertBefore(state.settingsButton, menu.nextSibling);
      }
    }
    return state.settingsButton;
  }

  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      #${ROOT_ID} {
        --cltc-text: var(--color-token-text-primary, light-dark(#111827, #f4f4f5));
        --cltc-muted: var(--color-token-text-tertiary, light-dark(#6b7280, #a1a1aa));
        --cltc-border: var(--color-token-border-light, light-dark(#d1d5db, #3f3f46));
        --cltc-border-subtle: var(--color-token-border-light, light-dark(#e5e7eb, #323238));
        --cltc-surface: var(--color-token-main-surface-primary, light-dark(#ffffff, #18181b));
        --cltc-surface-secondary: var(--color-token-main-surface-secondary, light-dark(#f3f4f6, #27272a));
        --cltc-popover: var(--color-token-dropdown-background, var(--color-token-main-surface-primary, light-dark(#ffffff, #18181b)));
        --cltc-input: var(--color-token-input-background, var(--color-token-main-surface-primary, light-dark(#ffffff, #18181b)));
        --cltc-hover: var(--color-token-list-hover-background, light-dark(rgba(0, 0, 0, .06), rgba(255, 255, 255, .08)));
        --cltc-shadow: light-dark(rgba(0, 0, 0, .18), rgba(0, 0, 0, .48));
        --cltc-primary: var(--color-token-text-primary, light-dark(#171717, #f4f4f5));
        --cltc-primary-text: var(--color-token-main-surface-primary, light-dark(#ffffff, #18181b));
        --cltc-danger: light-dark(#b42318, #f97066);
        --cltc-arc-bg: light-dark(rgb(246, 246, 246), rgba(255, 255, 255, .08));
        --cltc-arc-radius: var(--radius-2xl, 20px);
        --cltc-shimmer-contrast: #fff;
        --cltc-ease-out: cubic-bezier(0.23, 1, 0.32, 1);
        --cltc-ease-in-out: cubic-bezier(0.77, 0, 0.175, 1);
        --cltc-duration-press: 160ms;
        --cltc-duration-tooltip: 125ms;
        --cltc-duration-popover: 180ms;
        --cltc-duration-modal: 200ms;
        --cltc-duration-data: 160ms;
        box-sizing: border-box;
        color-scheme: light dark;
        position: relative;
        display: grid;
        grid-template-columns: minmax(0, 1.55fr) minmax(0, .70fr) minmax(0, 1fr) minmax(0, .82fr) minmax(0, .82fr) minmax(0, 1.51fr);
        align-items: center;
        gap: 0;
        width: min(100%, 760px);
        height: 61px;
        margin: 0 auto -18px;
        padding: 8px 10px 25px;
        border-radius: var(--cltc-arc-radius) var(--cltc-arc-radius) 0 0;
        background: var(--cltc-arc-bg);
        color: var(--cltc-muted);
        font: 12px/1.35 ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        letter-spacing: 0;
        z-index: 0;
      }
      @supports (corner-shape: superellipse(1.5)) {
        #${ROOT_ID} {
          corner-shape: var(--codex-corner-shape, round);
        }
      }
      #${ROOT_ID} .cltc-pill {
        box-sizing: border-box;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 3px;
        position: relative;
        width: 100%;
        min-width: 0;
        min-height: 28px;
        max-width: 100%;
        padding: 0 8px;
        border: 0;
        border-radius: 0;
        background: transparent;
        overflow: hidden;
        text-align: center;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      #${ROOT_ID} .cltc-pill + .cltc-pill::before {
        content: "";
        position: absolute;
        left: 0;
        top: 50%;
        display: block;
        width: 1px;
        height: 11px;
        margin: 0;
        background: color-mix(in srgb, var(--cltc-muted) 30%, transparent);
        transform: translateY(-50%);
      }
      #${ROOT_ID} .cltc-current-flow {
        display: inline-flex;
        align-items: center;
        gap: 3px;
      }
      #${ROOT_ID} .cltc-model-label {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 3px;
        min-width: 0;
        max-width: 100%;
      }
      #${ROOT_ID} .cltc-model-text {
        display: inline-flex;
        align-items: center;
        min-width: 0;
        max-width: 100%;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      #${ROOT_ID} .cltc-model-effort {
        flex: 0 0 auto;
        color: var(--cltc-muted);
      }
      #${ROOT_ID} .cltc-model-effort:not(:empty)::before {
        content: " · ";
        color: var(--cltc-muted);
      }
      #${ROOT_ID} .cltc-model-effort[data-effort="ultra"] {
        color: var(--color-token-charts-purple, rgb(146, 79, 247));
      }
      #${ROOT_ID} .cltc-fast-mode-icon {
        display: inline-block;
        flex: 0 0 auto;
        width: 14px;
        height: 14px;
        color: var(--color-token-link-foreground, currentColor);
      }
      #${ROOT_ID} .cltc-fast-mode-icon[hidden] {
        display: none;
      }
      #${ROOT_ID} .cltc-cadenced-shimmer {
        --cltc-shimmer-text-primary: var(--cltc-muted);
        --cltc-shimmer-text-secondary: var(--cltc-shimmer-text-primary);
        position: relative;
        display: inline-block;
        color: var(--cltc-shimmer-text-secondary);
        -webkit-text-fill-color: currentColor;
        text-fill-color: currentColor;
        background: transparent;
        -webkit-background-clip: border-box;
        background-clip: border-box;
        animation: none;
      }
      #${ROOT_ID} .cltc-cadenced-shimmer-sweep {
        position: absolute;
        inset: 0 auto 0 0;
        width: 100%;
        overflow: hidden;
        pointer-events: none;
        transform: translate(-50%);
        -webkit-mask-image: linear-gradient(90deg, transparent 0%, #000 20% 30%, transparent 50% 100%);
        mask-image: linear-gradient(90deg, transparent 0%, #000 20% 30%, transparent 50% 100%);
      }
      #${ROOT_ID} .cltc-cadenced-shimmer-highlight {
        display: block;
        width: 100%;
        color: var(--cltc-shimmer-contrast);
        -webkit-text-fill-color: currentColor;
        text-fill-color: currentColor;
        transform: translate(50%);
      }
      #${ROOT_ID} .cltc-cadenced-shimmer-active .cltc-cadenced-shimmer-sweep,
      #${ROOT_ID} .cltc-cadenced-shimmer-active .cltc-cadenced-shimmer-highlight {
        animation-duration: 1s;
        animation-timing-function: steps(48, end);
        animation-iteration-count: 1;
        animation-delay: var(--cltc-shimmer-active-delay, 0ms);
        animation-fill-mode: both;
      }
      #${ROOT_ID} .cltc-cadenced-shimmer-active .cltc-cadenced-shimmer-sweep {
        animation-name: cltc-cadenced-shimmer-sweep;
      }
      #${ROOT_ID} .cltc-cadenced-shimmer-active .cltc-cadenced-shimmer-highlight {
        animation-name: cltc-cadenced-shimmer-highlight;
      }
      #${ROOT_ID} .cltc-muted {
        opacity: .68;
      }
      #${ROOT_ID} .cltc-roll {
        --cltc-roll-row: 16px;
        display: inline-flex;
        align-items: center;
        height: var(--cltc-roll-row);
        line-height: var(--cltc-roll-row);
        font-variant-numeric: tabular-nums;
        white-space: nowrap;
      }
      #${ROOT_ID} .cltc-roll::before {
        content: "0";
        flex: 0 0 0;
        width: 0;
        height: var(--cltc-roll-row);
        line-height: var(--cltc-roll-row);
        overflow: hidden;
        visibility: hidden;
      }
      #${ROOT_ID} .cltc-roll-separator {
        display: inline-block;
        height: var(--cltc-roll-row);
        line-height: var(--cltc-roll-row);
      }
      #${ROOT_ID} .cltc-roll-digit-column {
        position: relative;
        display: inline-block;
        width: 1ch;
        height: var(--cltc-roll-row);
        line-height: var(--cltc-roll-row);
        contain: layout paint style;
      }
      #${ROOT_ID} .cltc-roll-digit-column::before {
        content: "0";
        visibility: hidden;
      }
      #${ROOT_ID} .cltc-roll-digit-clip {
        position: absolute;
        inset: 0;
        overflow: hidden;
      }
      #${ROOT_ID} .cltc-roll-digit-stack {
        display: flex;
        flex-direction: column;
        height: var(--cltc-roll-row);
        contain: layout size style;
        transform: translateY(var(--cltc-roll-to-y, 0px));
        transition: transform var(--cltc-duration-data) var(--cltc-ease-out);
      }
      #${ROOT_ID} .cltc-roll-digit-stack > span {
        flex: 0 0 var(--cltc-roll-row);
        display: block;
        height: var(--cltc-roll-row);
        line-height: var(--cltc-roll-row);
      }
      #${ROOT_ID} .cltc-roll-digit-stack[data-animate="true"] {
        transform: translateY(var(--cltc-roll-from-y, var(--cltc-roll-to-y, 0px)));
      }
      @keyframes cltc-cadenced-shimmer-sweep {
        0% { transform: translate(-50%); }
        to { transform: translate(125%); }
      }
      @keyframes cltc-cadenced-shimmer-highlight {
        0% { transform: translate(50%); }
        to { transform: translate(-125%); }
      }
      @media (prefers-reduced-motion: reduce) {
        #${ROOT_ID} .cltc-roll-digit-stack,
        #${ROOT_ID} .cltc-roll-digit-stack[data-animate="true"],
        #${ROOT_ID} .cltc-cadenced-shimmer-active .cltc-cadenced-shimmer-sweep,
        #${ROOT_ID} .cltc-cadenced-shimmer-active .cltc-cadenced-shimmer-highlight {
          animation: none;
          transition: none;
        }
      }
      @media (prefers-color-scheme: light) {
        #${ROOT_ID} {
          color-scheme: light;
          --cltc-text: #111827;
          --cltc-muted: rgba(26, 28, 31, .494);
          --cltc-border: #d1d5db;
          --cltc-surface: #ffffff;
          --cltc-arc-bg: rgb(246, 246, 246);
          --cltc-shimmer-contrast: #fff;
        }
      }
      @media (prefers-color-scheme: dark) {
        #${ROOT_ID} {
          color-scheme: dark;
          --cltc-text: #d4d4d8;
          --cltc-muted: rgba(255, 255, 255, .498);
          --cltc-border: #3f3f46;
          --cltc-surface: #2d2d2d;
          --cltc-input: #2d2d2d;
          --cltc-arc-bg: rgb(31, 31, 31);
          --cltc-shimmer-contrast: #fff;
        }
      }
      html.electron-dark #${ROOT_ID} {
        color-scheme: dark;
        --cltc-text: #d4d4d8;
        --cltc-muted: rgba(255, 255, 255, .498);
        --cltc-border: #3f3f46;
        --cltc-surface: #2d2d2d;
        --cltc-input: #2d2d2d;
        --cltc-arc-bg: rgb(31, 31, 31);
        --cltc-shimmer-contrast: #fff;
      }
      .cltc-settings-overlay {
        --cltc-text: var(--color-token-text-primary, light-dark(#111827, #f4f4f5));
        --cltc-muted: var(--color-token-text-tertiary, light-dark(#6b7280, #a1a1aa));
        --cltc-border: var(--color-token-border-light, light-dark(#d1d5db, #3f3f46));
        --cltc-border-subtle: var(--color-token-border-light, light-dark(#e5e7eb, #323238));
        --cltc-surface: var(--color-token-main-surface-primary, light-dark(#ffffff, #18181b));
        --cltc-surface-secondary: var(--color-token-main-surface-secondary, light-dark(#f3f4f6, #27272a));
        --cltc-popover: var(--color-token-dropdown-background, var(--color-token-main-surface-primary, light-dark(#ffffff, #18181b)));
        --cltc-input: var(--color-token-input-background, var(--color-token-main-surface-primary, light-dark(#ffffff, #18181b)));
        --cltc-hover: var(--color-token-list-hover-background, light-dark(rgba(0, 0, 0, .06), rgba(255, 255, 255, .08)));
        --cltc-shadow: light-dark(rgba(0, 0, 0, .18), rgba(0, 0, 0, .48));
        --cltc-primary: var(--color-token-text-primary, light-dark(#171717, #f4f4f5));
        --cltc-primary-text: var(--color-token-main-surface-primary, light-dark(#ffffff, #18181b));
        --cltc-danger: light-dark(#b42318, #f97066);
        --cltc-ease-out: cubic-bezier(0.23, 1, 0.32, 1);
        --cltc-ease-in-out: cubic-bezier(0.77, 0, 0.175, 1);
        --cltc-duration-press: 160ms;
        --cltc-duration-tooltip: 125ms;
        --cltc-duration-popover: 180ms;
        --cltc-duration-modal: 200ms;
        --cltc-duration-data: 160ms;
        position: fixed;
        inset: 0;
        z-index: 2147483647;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 48px 20px;
        background: transparent;
        color: var(--cltc-text);
        color-scheme: light dark;
        -webkit-app-region: no-drag;
      }
      html.electron-dark .cltc-settings-overlay {
        --cltc-text: #f4f4f5;
        --cltc-muted: #a1a1aa;
        --cltc-border: #3f3f46;
        --cltc-border-subtle: #323238;
        --cltc-surface: #18181b;
        --cltc-surface-secondary: #27272a;
        --cltc-popover: #18181b;
        --cltc-input: #18181b;
        --cltc-hover: rgba(255, 255, 255, .08);
        --cltc-shadow: rgba(0, 0, 0, .48);
        --cltc-primary: #f4f4f5;
        --cltc-primary-text: #18181b;
        --cltc-danger: #f97066;
        color-scheme: dark;
      }
      .cltc-settings-modal {
        position: relative;
        display: grid;
        grid-template-rows: auto minmax(0, 1fr);
        width: min(920px, calc(100vw - 40px));
        height: min(620px, calc(100vh - 96px));
        max-height: calc(100vh - 96px);
        overflow: hidden;
        padding: 0;
        border: 1px solid var(--cltc-border);
        border-radius: 12px;
        background: var(--cltc-popover);
        box-shadow: 0 18px 55px var(--cltc-shadow);
        color: var(--cltc-text);
        opacity: 1;
        transform: translateY(0) scale(1);
        transition: opacity var(--cltc-duration-modal) var(--cltc-ease-out),
          transform var(--cltc-duration-modal) var(--cltc-ease-out);
      }
      .cltc-settings-overlay[data-cltc-entering="true"] .cltc-settings-modal {
        opacity: 0;
        transform: translateY(4px) scale(.97);
      }
      .cltc-settings-overlay[data-cltc-closing="true"] {
        pointer-events: none;
      }
      .cltc-settings-overlay[data-cltc-closing="true"] .cltc-settings-modal {
        opacity: 0;
        transform: translateY(2px) scale(.98);
        transition: opacity var(--cltc-duration-press) var(--cltc-ease-out),
          transform var(--cltc-duration-press) var(--cltc-ease-out);
      }
      .cltc-settings-overlay .cltc-settings-content {
        transition: opacity var(--cltc-duration-popover) var(--cltc-ease-out),
          transform var(--cltc-duration-popover) var(--cltc-ease-out);
      }
      .cltc-settings-overlay .cltc-settings-content[data-cltc-switching="true"] {
        opacity: .45;
        transform: translateY(4px);
      }
      @media (prefers-reduced-motion: reduce) {
        .cltc-settings-modal {
          transform: none;
          transition: opacity var(--cltc-duration-press) var(--cltc-ease-out);
        }
        .cltc-settings-overlay[data-cltc-entering="true"] .cltc-settings-modal {
          transform: none;
        }
        .cltc-settings-overlay[data-cltc-closing="true"] .cltc-settings-modal {
          transform: none;
          transition: opacity var(--cltc-duration-press) var(--cltc-ease-out);
        }
        .cltc-settings-overlay .cltc-settings-content {
          transition: opacity var(--cltc-duration-press) var(--cltc-ease-out);
        }
        .cltc-settings-overlay .cltc-settings-content[data-cltc-switching="true"] {
          transform: none;
        }
      }
      .cltc-settings-overlay .cltc-settings-content::-webkit-scrollbar,
      .cltc-settings-overlay .cltc-price-list::-webkit-scrollbar {
        width: 6px;
        height: 6px;
      }
      .cltc-settings-overlay .cltc-settings-content::-webkit-scrollbar-track,
      .cltc-settings-overlay .cltc-price-list::-webkit-scrollbar-track {
        background: transparent;
      }
      .cltc-settings-overlay .cltc-settings-content::-webkit-scrollbar-thumb,
      .cltc-settings-overlay .cltc-price-list::-webkit-scrollbar-thumb {
        border-radius: 999px;
        background: color-mix(in srgb, var(--cltc-muted) 35%, transparent);
      }
      #${ROOT_ID} .cltc-price-head,
      .cltc-settings-overlay .cltc-price-head {
        display: flex;
        justify-content: space-between;
        gap: 10px;
        align-items: center;
        min-height: 54px;
        padding: 10px 14px 10px 18px;
        border-bottom: 1px solid var(--cltc-border-subtle);
      }
      #${ROOT_ID} .cltc-price-title,
      .cltc-settings-overlay .cltc-price-title {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        font-size: 15px;
        font-weight: 600;
      }
      #${ROOT_ID} .cltc-price-head button,
      .cltc-settings-overlay .cltc-price-head button {
        width: 30px;
        height: 30px;
        border: 0;
        border-radius: 8px;
        background: transparent;
        color: var(--cltc-muted);
        cursor: pointer;
        font: 20px/1 ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      #${ROOT_ID} .cltc-price-head button:focus-visible,
      .cltc-settings-overlay .cltc-price-head button:focus-visible {
        background: var(--cltc-hover);
        outline: none;
      }
      #${ROOT_ID} .cltc-button,
      #${ROOT_ID} .cltc-price-head button,
      #${ROOT_ID} .cltc-price-actions button,
      .cltc-settings-overlay button,
      .cltc-header-settings {
        transition: transform var(--cltc-duration-press) var(--cltc-ease-out),
          background var(--cltc-duration-press) var(--cltc-ease-out),
          color var(--cltc-duration-press) var(--cltc-ease-out),
          border-color var(--cltc-duration-press) var(--cltc-ease-out);
      }
      .cltc-settings-overlay .cltc-settings-nav button,
      .cltc-settings-overlay .cltc-price-row {
        transition: transform var(--cltc-duration-press) var(--cltc-ease-out),
          background var(--cltc-duration-press) var(--cltc-ease-out),
          color var(--cltc-duration-press) var(--cltc-ease-out),
          border-color var(--cltc-duration-press) var(--cltc-ease-out);
      }
      .cltc-settings-overlay .cltc-profile-select,
      .cltc-settings-overlay .cltc-price-input {
        transition: background var(--cltc-duration-press) var(--cltc-ease-out),
          color var(--cltc-duration-press) var(--cltc-ease-out),
          border-color var(--cltc-duration-press) var(--cltc-ease-out);
      }
      #${ROOT_ID} .cltc-button:active,
      #${ROOT_ID} .cltc-price-head button:active,
      #${ROOT_ID} .cltc-price-actions button:active,
      .cltc-settings-overlay button:active,
      .cltc-header-settings:active {
        transform: scale(.97);
      }
      .cltc-settings-overlay .cltc-settings-shell {
        display: grid;
        grid-template-columns: 176px minmax(0, 1fr);
        min-height: 0;
        overflow: hidden;
      }
      .cltc-settings-overlay .cltc-settings-sidebar {
        display: flex;
        flex-direction: column;
        min-width: 0;
        padding: 18px 10px;
        border-right: 1px solid var(--cltc-border-subtle);
        background: color-mix(in srgb, var(--cltc-surface-secondary) 62%, var(--cltc-popover));
      }
      .cltc-settings-overlay .cltc-settings-footer {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        margin-top: auto;
        padding: 12px 10px 0;
        color: var(--cltc-muted);
        font-size: 11px;
      }
      .cltc-settings-overlay .cltc-settings-version {
        opacity: .68;
      }
      .cltc-settings-overlay .cltc-settings-footer span + span {
        margin-left: 8px;
      }
      .cltc-settings-overlay .cltc-settings-nav {
        display: grid;
        gap: 2px;
      }
      .cltc-settings-overlay .cltc-settings-nav button {
        width: 100%;
        min-height: 34px;
        padding: 7px 10px;
        border: 0;
        border-radius: 8px;
        background: transparent;
        color: var(--cltc-muted);
        cursor: pointer;
        font: inherit;
        text-align: left;
      }
      .cltc-settings-overlay .cltc-settings-nav button:focus-visible,
      .cltc-settings-overlay .cltc-settings-nav button[data-active="true"] {
        background: var(--cltc-hover);
        color: var(--cltc-text);
        outline: none;
      }
      .cltc-settings-overlay .cltc-settings-nav button[data-active="true"] {
        font-weight: 600;
      }
      .cltc-settings-overlay .cltc-settings-content {
        min-width: 0;
        overflow: auto;
        padding: 26px 30px 30px;
        scrollbar-width: thin;
        scrollbar-color: color-mix(in srgb, var(--cltc-muted) 35%, transparent) transparent;
      }
      #${ROOT_ID} .cltc-price-list,
      .cltc-settings-overlay .cltc-price-list {
        display: grid;
        max-height: 210px;
        overflow: auto;
        border: 1px solid var(--cltc-border-subtle);
        border-radius: 8px;
        scrollbar-width: thin;
        scrollbar-color: color-mix(in srgb, var(--cltc-muted) 35%, transparent) transparent;
      }
      #${ROOT_ID} .cltc-settings-section,
      .cltc-settings-overlay .cltc-settings-section {
        display: grid;
        gap: 20px;
      }
      .cltc-settings-overlay .cltc-settings-section-heading {
        display: grid;
        gap: 4px;
      }
      .cltc-settings-overlay .cltc-settings-section-heading h2 {
        margin: 0;
        font-size: 20px;
        font-weight: 600;
        line-height: 28px;
      }
      .cltc-settings-overlay .cltc-settings-section-heading p {
        margin: 0;
        color: var(--cltc-muted);
        font-size: 13px;
        line-height: 19px;
      }
      .cltc-settings-overlay .cltc-settings-row {
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto;
        align-items: center;
        gap: 18px;
        min-height: 66px;
        padding: 14px 0;
        border-top: 1px solid var(--cltc-border-subtle);
      }
      .cltc-settings-overlay .cltc-settings-row strong,
      .cltc-settings-overlay .cltc-toggle-field strong {
        display: block;
        font-weight: 500;
      }
      .cltc-settings-overlay .cltc-toggle-field small {
        display: block;
        margin-top: 2px;
        color: var(--cltc-muted);
        font-size: 12px;
        line-height: 17px;
      }
      #${ROOT_ID} .cltc-sync-status,
      .cltc-settings-overlay .cltc-sync-status {
        margin-top: 3px;
        color: var(--cltc-muted);
        font-size: 12px;
        line-height: 17px;
      }
      #${ROOT_ID} .cltc-sync-status[data-helper-unavailable="true"],
      .cltc-settings-overlay .cltc-sync-status[data-helper-unavailable="true"] {
        color: color-mix(in srgb, #b45309 75%, var(--cltc-text));
      }
      .cltc-settings-overlay .cltc-sync-status {
        transition: opacity var(--cltc-duration-tooltip) var(--cltc-ease-out);
      }
      .cltc-settings-overlay .cltc-sync-status[data-cltc-status-pulse="true"] {
        opacity: .48;
      }
      .cltc-settings-overlay .cltc-profile-save-toast {
        position: fixed;
        top: max(18px, env(safe-area-inset-top));
        left: 50%;
        z-index: 2;
        display: block;
        max-width: min(420px, calc(100vw - 32px));
        padding: 10px 14px;
        border: 1px solid var(--cltc-border);
        border-radius: 8px;
        background: var(--cltc-popover);
        box-shadow: 0 10px 28px var(--cltc-shadow);
        color: var(--cltc-text);
        font-size: 13px;
        line-height: 18px;
        overflow-wrap: anywhere;
        text-align: center;
        opacity: 0;
        pointer-events: none;
        transform: translate(-50%, -8px);
        visibility: hidden;
        transition: opacity var(--cltc-duration-popover) var(--cltc-ease-out), transform var(--cltc-duration-popover) var(--cltc-ease-out), visibility 0s linear var(--cltc-duration-popover);
      }
      .cltc-settings-overlay .cltc-profile-save-toast[data-visible="true"] {
        opacity: 1;
        transform: translate(-50%, 0);
        visibility: visible;
        transition-delay: 0s;
      }
      .cltc-settings-overlay .cltc-profile-save-toast[data-tone="success"] {
        border-color: color-mix(in srgb, #10a37f 42%, var(--cltc-border));
        color: color-mix(in srgb, #10a37f 78%, var(--cltc-text));
      }
      .cltc-settings-overlay .cltc-profile-save-toast[data-tone="error"] {
        border-color: color-mix(in srgb, var(--cltc-danger) 52%, var(--cltc-border));
        color: var(--cltc-danger);
      }
      #${ROOT_ID} .cltc-price-row,
      .cltc-settings-overlay .cltc-price-row {
        display: grid;
        grid-template-columns: minmax(120px, 1fr) repeat(4, minmax(44px, .45fr));
        gap: 6px;
        align-items: center;
        width: 100%;
        min-height: 34px;
        padding: 7px 9px;
        border: 0;
        border-bottom: 1px solid var(--cltc-border-subtle);
        background: transparent;
        color: inherit;
        font: inherit;
        text-align: left;
      }
      #${ROOT_ID} .cltc-price-row[data-active="true"],
      .cltc-settings-overlay .cltc-price-row[data-active="true"] {
        background: var(--cltc-hover);
        font-weight: 650;
      }
      .cltc-settings-overlay .cltc-price-table-head {
        min-height: 30px;
        padding-top: 4px;
        padding-bottom: 4px;
        color: var(--cltc-muted);
        font-size: 11px;
        font-weight: 500;
      }
      .cltc-settings-overlay .cltc-price-meta {
        margin-top: -12px;
        color: var(--cltc-muted);
        font-size: 12px;
      }
      .cltc-settings-overlay .cltc-price-editor {
        display: grid;
        gap: 14px;
        padding-top: 20px;
        border-top: 1px solid var(--cltc-border-subtle);
      }
      #${ROOT_ID} .cltc-price-row span,
      .cltc-settings-overlay .cltc-price-row span {
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      #${ROOT_ID} .cltc-price-grid,
      .cltc-settings-overlay .cltc-price-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 14px 12px;
      }
      #${ROOT_ID} .cltc-price-field-full,
      .cltc-settings-overlay .cltc-price-field-full {
        grid-column: 1 / -1;
      }
      #${ROOT_ID} .cltc-price-field,
      .cltc-settings-overlay .cltc-price-field {
        display: grid;
        gap: 6px;
      }
      .cltc-settings-overlay .cltc-profile-field-note {
        margin-top: -2px;
        color: var(--cltc-muted);
        font-size: 11px;
        line-height: 16px;
      }
      #${ROOT_ID} .cltc-toggle-field,
      .cltc-settings-overlay .cltc-toggle-field {
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto;
        align-items: center;
        gap: 18px;
        min-height: 66px;
        padding: 14px 0;
        border-top: 1px solid var(--cltc-border-subtle);
        color: var(--cltc-text);
        cursor: pointer;
      }
      #${ROOT_ID} .cltc-toggle-field input,
      .cltc-settings-overlay .cltc-toggle-field input {
        appearance: none;
        position: relative;
        width: 34px;
        height: 20px;
        margin: 0;
        border: 1px solid var(--cltc-border);
        border-radius: 999px;
        background: var(--cltc-surface-secondary);
        cursor: pointer;
        transition: transform var(--cltc-duration-press) var(--cltc-ease-out),
          background var(--cltc-duration-press) var(--cltc-ease-out),
          border-color var(--cltc-duration-press) var(--cltc-ease-out);
      }
      #${ROOT_ID} .cltc-toggle-field input::after,
      .cltc-settings-overlay .cltc-toggle-field input::after {
        content: "";
        position: absolute;
        top: 2px;
        left: 2px;
        width: 14px;
        height: 14px;
        border-radius: 50%;
        background: var(--cltc-surface);
        box-shadow: 0 1px 3px rgba(0, 0, 0, .22);
        transition: transform var(--cltc-duration-press) var(--cltc-ease-out);
      }
      #${ROOT_ID} .cltc-toggle-field input:checked,
      .cltc-settings-overlay .cltc-toggle-field input:checked {
        border-color: var(--cltc-text);
        background: var(--cltc-text);
      }
      #${ROOT_ID} .cltc-toggle-field input:checked::after,
      .cltc-settings-overlay .cltc-toggle-field input:checked::after {
        transform: translateX(14px);
      }
      #${ROOT_ID} .cltc-toggle-field input:active,
      .cltc-settings-overlay .cltc-toggle-field input:active {
        transform: scale(.97);
      }
      #${ROOT_ID} .cltc-toggle-field input:focus-visible,
      .cltc-settings-overlay .cltc-toggle-field input:focus-visible {
        outline: 2px solid var(--cltc-muted);
        outline-offset: 2px;
      }
      #${ROOT_ID} .cltc-price-field span,
      .cltc-settings-overlay .cltc-price-field span {
        padding: 0;
        border: 0;
        background: transparent;
        color: var(--cltc-muted);
        font-size: 12px;
      }
      #${ROOT_ID} .cltc-price-input,
      #${ROOT_ID} .cltc-profile-select,
      .cltc-settings-overlay .cltc-price-input,
      .cltc-settings-overlay .cltc-profile-select {
        min-width: 0;
        height: 36px;
        padding: 7px 10px;
        border: 1px solid var(--cltc-border);
        border-radius: 8px;
        background: var(--cltc-input);
        color: var(--cltc-text);
        font: inherit;
        outline: none;
      }
      #${ROOT_ID} .cltc-profile-select,
      .cltc-settings-overlay .cltc-profile-select {
        appearance: base-select;
        cursor: pointer;
      }
      #${ROOT_ID} .cltc-profile-select::picker(select),
      .cltc-settings-overlay .cltc-profile-select::picker(select) {
        appearance: base-select;
        margin-top: 5px;
        padding: 5px;
        border: 1px solid var(--cltc-border);
        border-radius: 10px;
        background: var(--cltc-popover);
        box-shadow: 0 12px 32px var(--cltc-shadow);
        color: var(--cltc-text);
      }
      #${ROOT_ID} .cltc-profile-select::picker-icon,
      .cltc-settings-overlay .cltc-profile-select::picker-icon {
        color: var(--cltc-muted);
        transition: rotate var(--cltc-duration-press) var(--cltc-ease-in-out);
      }
      #${ROOT_ID} .cltc-profile-select:open::picker-icon,
      .cltc-settings-overlay .cltc-profile-select:open::picker-icon {
        rotate: 180deg;
      }
      #${ROOT_ID} .cltc-profile-select:open,
      .cltc-settings-overlay .cltc-profile-select:open {
        border-color: color-mix(in srgb, var(--cltc-text) 52%, var(--cltc-border));
        background: color-mix(in srgb, var(--cltc-surface-secondary) 70%, var(--cltc-input));
      }
      #${ROOT_ID} .cltc-profile-select option,
      .cltc-settings-overlay .cltc-profile-select option {
        min-height: 32px;
        padding: 7px 9px;
        border-radius: 6px;
        background: var(--cltc-popover);
        color: var(--cltc-text);
      }
      #${ROOT_ID} .cltc-profile-select option:focus,
      #${ROOT_ID} .cltc-profile-select option:checked,
      .cltc-settings-overlay .cltc-profile-select option:focus,
      .cltc-settings-overlay .cltc-profile-select option:checked {
        background: var(--cltc-hover);
      }
      #${ROOT_ID} .cltc-profile-select option::checkmark,
      .cltc-settings-overlay .cltc-profile-select option::checkmark {
        display: none;
      }
      #${ROOT_ID} .cltc-price-input:focus,
      #${ROOT_ID} .cltc-profile-select:focus,
      .cltc-settings-overlay .cltc-price-input:focus,
      .cltc-settings-overlay .cltc-profile-select:focus {
        border-color: color-mix(in srgb, var(--cltc-text) 58%, var(--cltc-border));
        box-shadow: 0 0 0 2px color-mix(in srgb, var(--cltc-text) 10%, transparent);
      }
      #${ROOT_ID} .cltc-price-actions,
      .cltc-settings-overlay .cltc-price-actions {
        display: flex;
        gap: 8px;
        justify-content: flex-end;
      }
      #${ROOT_ID} .cltc-price-actions-left,
      .cltc-settings-overlay .cltc-price-actions-left {
        justify-content: flex-start;
      }
      #${ROOT_ID} .cltc-price-actions button,
      #${ROOT_ID} .cltc-price-actions .cltc-link-button,
      .cltc-settings-overlay .cltc-price-actions button,
      .cltc-settings-overlay .cltc-price-actions .cltc-link-button,
      .cltc-settings-overlay .cltc-settings-row button,
      .cltc-settings-overlay .cltc-settings-row .cltc-link-button {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-height: 32px;
        padding: 6px 10px;
        border: 1px solid var(--cltc-border);
        border-radius: 8px;
        background: transparent;
        color: inherit;
        font: inherit;
        text-decoration: none;
      }
      .cltc-settings-overlay button[data-variant="primary"] {
        border-color: var(--cltc-primary);
        background: var(--cltc-primary);
        color: var(--cltc-primary-text);
      }
      .cltc-settings-overlay button[data-variant="danger"] {
        color: var(--cltc-danger);
      }
      .cltc-settings-overlay .cltc-analytics {
        gap: 26px;
      }
      .cltc-settings-overlay .cltc-analytics-heading {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 18px;
      }
      .cltc-settings-overlay .cltc-analytics-heading > div {
        min-width: 0;
      }
      .cltc-settings-overlay .cltc-analytics-toolbar,
      .cltc-settings-overlay .cltc-analytics-section-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 14px;
      }
      .cltc-settings-overlay .cltc-segmented {
        display: inline-flex;
        align-items: center;
        gap: 2px;
        padding: 3px;
        border-radius: 8px;
        background: var(--cltc-surface-secondary);
      }
      .cltc-settings-overlay .cltc-segmented button,
      .cltc-settings-overlay .cltc-date-range-trigger,
      .cltc-settings-overlay .cltc-analytics-filter,
      .cltc-settings-overlay .cltc-analytics-expand,
      .cltc-settings-overlay .cltc-analytics-degraded {
        min-height: 30px;
        padding: 5px 9px;
        border: 0;
        border-radius: 6px;
        background: transparent;
        color: var(--cltc-muted);
        cursor: pointer;
        font: inherit;
      }
      .cltc-settings-overlay .cltc-segmented button {
        transition: transform var(--cltc-duration-press) var(--cltc-ease-out),
          opacity var(--cltc-duration-press) var(--cltc-ease-out),
          background var(--cltc-duration-press) var(--cltc-ease-out),
          color var(--cltc-duration-press) var(--cltc-ease-out);
      }
      .cltc-settings-overlay .cltc-segmented button:focus-visible,
      .cltc-settings-overlay .cltc-segmented button[data-active="true"],
      .cltc-settings-overlay .cltc-date-range-trigger:focus-visible {
        background: var(--cltc-popover);
        color: var(--cltc-text);
        outline: none;
        box-shadow: 0 1px 2px color-mix(in srgb, var(--cltc-shadow) 34%, transparent);
      }
      .cltc-settings-overlay .cltc-segmented button[data-active="true"] {
        font-weight: 600;
      }
      .cltc-settings-overlay .cltc-segmented[data-cltc-range-switching="true"] button[data-active="true"] {
        opacity: .72;
        transform: translateY(2px);
      }
      .cltc-settings-overlay .cltc-segmented-compact button {
        min-width: 52px;
      }
      .cltc-settings-overlay .cltc-date-range-trigger {
        border: 1px solid var(--cltc-border);
        color: var(--cltc-text);
      }
      .cltc-settings-overlay .cltc-date-range-trigger[hidden] {
        display: none;
      }
      .cltc-settings-overlay .cltc-analytics-date-input {
        position: fixed;
        width: 1px;
        height: 1px;
        padding: 0;
        border: 0;
        opacity: 0;
        pointer-events: none;
      }
      .cltc-settings-overlay .cltc-analytics-filter {
        flex: 0 1 auto;
        max-width: 230px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        background: var(--cltc-surface-secondary);
        color: var(--cltc-text);
      }
      .cltc-settings-overlay .cltc-analytics-degraded {
        width: 100%;
        min-height: 34px;
        padding: 8px 10px;
        color: var(--cltc-muted);
        text-align: left;
        background: color-mix(in srgb, #b45309 8%, transparent);
      }
      .cltc-settings-overlay .cltc-analytics-metrics {
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        border-top: 1px solid var(--cltc-border-subtle);
        border-bottom: 1px solid var(--cltc-border-subtle);
      }
      .cltc-settings-overlay .cltc-analytics-metric {
        display: grid;
        min-width: 0;
        gap: 4px;
        padding: 16px 14px;
        border-right: 1px solid var(--cltc-border-subtle);
      }
      .cltc-settings-overlay .cltc-analytics-metric:first-child {
        padding-left: 0;
      }
      .cltc-settings-overlay .cltc-analytics-metric:last-child {
        border-right: 0;
      }
      .cltc-settings-overlay .cltc-analytics-metric > span,
      .cltc-settings-overlay .cltc-analytics-metric small {
        overflow: hidden;
        color: var(--cltc-muted);
        font-size: 11px;
        line-height: 16px;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .cltc-settings-overlay .cltc-analytics-metric strong {
        overflow: hidden;
        font-size: 18px;
        font-weight: 600;
        line-height: 24px;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .cltc-settings-overlay .cltc-analytics-section {
        display: grid;
        gap: 14px;
        padding-top: 22px;
        border-top: 1px solid var(--cltc-border-subtle);
      }
      .cltc-settings-overlay .cltc-analytics-section-head h3 {
        margin: 0;
        font-size: 14px;
        font-weight: 600;
      }
      .cltc-settings-overlay .cltc-analytics-section-head p {
        margin: 2px 0 0;
        color: var(--cltc-muted);
        font-size: 11px;
      }
      .cltc-settings-overlay .cltc-analytics-chart {
        display: block;
        width: 100%;
        min-height: 190px;
        overflow: visible;
      }
      .cltc-settings-overlay .cltc-analytics-chart rect[data-chart-index] {
        fill: color-mix(in srgb, var(--cltc-text) 78%, transparent);
        stroke: transparent !important;
        stroke-width: 2px;
        vector-effect: non-scaling-stroke;
        outline: none !important;
        transform-box: fill-box;
        transform-origin: center bottom;
        animation: cltc-analytics-bar-grow 720ms cubic-bezier(.16, 1, .3, 1) var(--cltc-chart-bar-delay, 0ms) both;
        transition: opacity var(--cltc-duration-tooltip) var(--cltc-ease-out);
      }
      @keyframes cltc-analytics-bar-grow {
        from { transform: scaleY(0); }
        to { transform: scaleY(1); }
      }
      .cltc-settings-overlay .cltc-analytics-chart rect[data-chart-index]:focus-visible {
        opacity: .66;
        outline: none !important;
      }
      .cltc-settings-overlay .cltc-analytics-chart rect[data-chart-index]:focus,
      .cltc-settings-overlay .cltc-analytics-chart rect[data-chart-index]:focus-visible {
        stroke: rgb(76, 78, 80) !important;
      }
      .cltc-settings-overlay .cltc-analytics-chart text {
        fill: var(--cltc-muted);
        font-size: 9px;
      }
      .cltc-settings-overlay .cltc-analytics-tooltip {
        opacity: 0;
        pointer-events: none;
        transition: opacity var(--cltc-duration-tooltip) var(--cltc-ease-out);
      }
      .cltc-settings-overlay .cltc-analytics-bar:focus-within .cltc-analytics-tooltip {
        opacity: 1;
      }
      @media (hover: hover) and (pointer: fine) {
        .cltc-settings-overlay .cltc-analytics-chart rect[data-chart-index]:hover {
          opacity: .66;
          outline: none !important;
        }
        .cltc-settings-overlay .cltc-analytics-bar:hover .cltc-analytics-tooltip {
          opacity: 1;
        }
      }
      .cltc-settings-overlay .cltc-analytics-tooltip rect {
        fill: var(--cltc-text);
      }
      .cltc-settings-overlay .cltc-analytics-tooltip text {
        fill: var(--cltc-popover);
        font-size: 10px;
        font-weight: 600;
      }
      .cltc-settings-overlay .cltc-composition-bar {
        display: flex;
        gap: 2px;
        width: 100%;
        height: 10px;
        overflow: hidden;
        border-radius: 5px;
        background: var(--cltc-surface-secondary);
      }
      .cltc-settings-overlay .cltc-composition-bar span {
        min-width: 0;
      }
      .cltc-settings-overlay [data-tone="neutral"] { background: #8e8e93; }
      .cltc-settings-overlay [data-tone="green"] { background: #10a37f; }
      .cltc-settings-overlay [data-tone="blue"] { background: #3b82f6; }
      .cltc-settings-overlay [data-tone="purple"] { background: #8b5cf6; }
      .cltc-settings-overlay .cltc-composition-legend {
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: 8px 16px;
      }
      .cltc-settings-overlay .cltc-composition-legend span {
        display: grid;
        grid-template-columns: 8px minmax(0, 1fr) auto;
        align-items: center;
        gap: 7px;
        min-width: 0;
        color: var(--cltc-muted);
        font-size: 11px;
      }
      .cltc-settings-overlay .cltc-composition-legend i {
        width: 7px;
        height: 7px;
        border-radius: 2px;
      }
      .cltc-settings-overlay .cltc-composition-legend strong {
        color: var(--cltc-text);
        font-weight: 500;
      }
      .cltc-settings-overlay .cltc-analytics-model-head,
      .cltc-settings-overlay .cltc-analytics-model-row {
        display: grid;
        grid-template-columns: minmax(150px, 1.45fr) repeat(4, minmax(72px, .7fr));
        gap: 10px;
        align-items: center;
      }
      .cltc-settings-overlay .cltc-analytics-model-head {
        padding: 0 9px;
        color: var(--cltc-muted);
        font-size: 10px;
      }
      .cltc-settings-overlay .cltc-analytics-models {
        max-height: 320px;
        overflow: auto;
        border-top: 1px solid var(--cltc-border-subtle);
        border-bottom: 1px solid var(--cltc-border-subtle);
      }
      .cltc-settings-overlay .cltc-analytics-model-row {
        width: 100%;
        min-height: 38px;
        padding: 7px 9px;
        border: 0;
        border-bottom: 1px solid var(--cltc-border-subtle);
        background: transparent;
        color: inherit;
        cursor: pointer;
        font: inherit;
        text-align: left;
      }
      .cltc-settings-overlay .cltc-analytics-model-row:focus-visible {
        background: var(--cltc-hover);
        outline: none;
      }
      .cltc-settings-overlay .cltc-analytics-model-row[data-hidden="true"] {
        display: none;
      }
      .cltc-settings-overlay .cltc-analytics-model-row span {
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        font-size: 11px;
      }
      .cltc-settings-overlay .cltc-analytics-expand {
        justify-self: start;
        padding-left: 0;
        color: var(--cltc-text);
      }
      .cltc-settings-overlay .cltc-analytics-empty {
        padding: 24px 10px;
        color: var(--cltc-muted);
        font-size: 12px;
        text-align: center;
      }
      @media (hover: hover) and (pointer: fine) {
        #${ROOT_ID} .cltc-price-head button:hover,
        .cltc-settings-overlay .cltc-price-head button:hover,
        #${ROOT_ID} .cltc-price-actions button:hover,
        #${ROOT_ID} .cltc-price-actions .cltc-link-button:hover,
        #${ROOT_ID} .cltc-price-row:hover,
        .cltc-settings-overlay .cltc-price-actions button:hover,
        .cltc-settings-overlay .cltc-price-actions .cltc-link-button:hover,
        .cltc-settings-overlay .cltc-settings-row button:hover,
        .cltc-settings-overlay .cltc-settings-row .cltc-link-button:hover,
        .cltc-settings-overlay .cltc-price-row:hover,
        .cltc-settings-overlay .cltc-analytics-model-row:hover,
        .cltc-header-settings:hover {
          background: var(--cltc-hover);
        }
        .cltc-settings-overlay .cltc-settings-nav button:hover {
          background: var(--cltc-hover);
          color: var(--cltc-text);
          outline: none;
        }
        #${ROOT_ID} .cltc-profile-select:hover,
        .cltc-settings-overlay .cltc-profile-select:hover {
          border-color: color-mix(in srgb, var(--cltc-text) 52%, var(--cltc-border));
          background: color-mix(in srgb, var(--cltc-surface-secondary) 70%, var(--cltc-input));
        }
        #${ROOT_ID} .cltc-profile-select option:hover,
        .cltc-settings-overlay .cltc-profile-select option:hover {
          background: var(--cltc-hover);
        }
        .cltc-settings-overlay button[data-variant="primary"]:hover {
          background: color-mix(in srgb, var(--cltc-primary) 88%, transparent);
        }
        .cltc-settings-overlay .cltc-segmented button:hover,
        .cltc-settings-overlay .cltc-date-range-trigger:hover {
          background: var(--cltc-popover);
          color: var(--cltc-text);
          outline: none;
          box-shadow: 0 1px 2px color-mix(in srgb, var(--cltc-shadow) 34%, transparent);
        }
      }
      @media (max-width: 680px) {
        .cltc-settings-overlay {
          align-items: stretch;
          padding: 12px;
        }
        .cltc-settings-modal {
          width: 100%;
          height: calc(100vh - 24px);
          max-height: none;
        }
        .cltc-settings-overlay .cltc-settings-shell {
          grid-template-columns: minmax(0, 1fr);
          grid-template-rows: auto minmax(0, 1fr);
        }
        .cltc-settings-overlay .cltc-settings-sidebar {
          display: block;
          padding: 8px 10px;
          border-right: 0;
          border-bottom: 1px solid var(--cltc-border-subtle);
          overflow-x: auto;
        }
        .cltc-settings-overlay .cltc-settings-footer {
          display: none;
        }
        .cltc-settings-overlay .cltc-settings-nav {
          display: flex;
          min-width: max-content;
        }
        .cltc-settings-overlay .cltc-settings-nav button {
          width: auto;
          white-space: nowrap;
        }
        .cltc-settings-overlay .cltc-settings-content {
          padding: 22px 18px 26px;
        }
        .cltc-settings-overlay .cltc-price-grid {
          grid-template-columns: minmax(0, 1fr);
        }
        .cltc-settings-overlay .cltc-price-row {
          grid-template-columns: minmax(112px, 1fr) repeat(4, minmax(42px, .45fr));
          font-size: 11px;
        }
        .cltc-settings-overlay .cltc-analytics-toolbar,
        .cltc-settings-overlay .cltc-analytics-section-head {
          align-items: flex-start;
          flex-wrap: wrap;
        }
        .cltc-settings-overlay .cltc-analytics-metrics {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }
        .cltc-settings-overlay .cltc-analytics-metric:nth-child(2) {
          border-right: 0;
        }
        .cltc-settings-overlay .cltc-analytics-metric:nth-child(-n + 2) {
          border-bottom: 1px solid var(--cltc-border-subtle);
        }
        .cltc-settings-overlay .cltc-analytics-metric:nth-child(3) {
          padding-left: 0;
        }
        .cltc-settings-overlay .cltc-composition-legend {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }
        .cltc-settings-overlay .cltc-analytics-model-head,
        .cltc-settings-overlay .cltc-analytics-model-row {
          grid-template-columns: minmax(126px, 1.4fr) repeat(4, minmax(62px, .65fr));
        }
        .cltc-settings-overlay .cltc-analytics-models {
          overflow-x: auto;
        }
      }
      @media (prefers-reduced-motion: reduce) {
        #${ROOT_ID} .cltc-button,
        #${ROOT_ID} .cltc-price-head button,
        #${ROOT_ID} .cltc-price-actions button,
        .cltc-settings-overlay button,
        .cltc-header-settings,
        #${ROOT_ID} .cltc-button:active,
        #${ROOT_ID} .cltc-price-head button:active,
        #${ROOT_ID} .cltc-price-actions button:active,
        .cltc-settings-overlay button:active,
        .cltc-header-settings:active {
          transition: none;
          transform: none;
        }
        .cltc-settings-overlay .cltc-analytics-chart rect[data-chart-index] {
          animation: none;
          transform: scaleY(1);
          transition: opacity var(--cltc-duration-tooltip) var(--cltc-ease-out);
        }
        .cltc-settings-overlay .cltc-sync-status,
        .cltc-settings-overlay .cltc-sync-status[data-cltc-status-pulse="true"] {
          transition: none;
          opacity: 1;
        }
        .cltc-settings-overlay .cltc-segmented[data-cltc-range-switching="true"] button[data-active="true"] {
          transition: none;
          opacity: 1;
          transform: none;
        }
        .cltc-settings-overlay .cltc-toggle-field input,
        .cltc-settings-overlay .cltc-toggle-field input:active,
        .cltc-settings-overlay .cltc-toggle-field input::after,
        .cltc-settings-overlay .cltc-profile-select,
        .cltc-settings-overlay .cltc-price-input,
        .cltc-settings-overlay .cltc-profile-select::picker-icon {
          transition: none;
          transform: none;
        }
        .cltc-settings-overlay .cltc-profile-save-toast {
          transform: translate(-50%, 0);
          transition: opacity var(--cltc-duration-press) var(--cltc-ease-out), visibility 0s linear var(--cltc-duration-press);
        }
      }
      .cltc-header-settings {
        --cltc-ease-out: cubic-bezier(0.23, 1, 0.32, 1);
        --cltc-duration-press: 160ms;
        --cltc-muted: var(--color-token-text-tertiary, light-dark(#6b7280, #a1a1aa));
        --cltc-hover: var(--color-token-list-hover-background, light-dark(rgba(0, 0, 0, .06), rgba(255, 255, 255, .08)));
        box-sizing: border-box;
        color-scheme: light dark;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-width: 72px;
        height: 30px;
        margin-left: 4px;
        padding: 0 8px;
        border: 0;
        border-radius: 7px;
        background: transparent;
        color: var(--cltc-muted);
        cursor: pointer;
        pointer-events: auto;
        -webkit-app-region: no-drag;
        white-space: nowrap;
        font: 13px/18px ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        letter-spacing: 0;
      }
      .cltc-header-settings[data-floating="true"] {
        position: fixed;
        z-index: 2147483647;
        margin-left: 0;
      }
      .cltc-header-settings:focus-visible {
        background: var(--cltc-hover);
        outline: none;
      }
    `;
    document.head?.appendChild(style);
  }

  function ensureRoot() {
    ensureStyle();
    cleanupDuplicateRoots();
    const composer = findComposerBox();
    if (!composer?.parentElement) {
      state.root?.remove();
      cleanupDuplicateRoots();
      return null;
    }
    if (!state.root) {
      state.root = document.createElement("div");
      state.root.id = ROOT_ID;
      state.root.addEventListener("click", (event) => {
        handleSettingsClick(event);
      });
    }
    state.root.dataset.cltcVersion = VERSION;
    if (state.root.parentElement !== composer.parentElement || state.root.nextElementSibling !== composer) {
      composer.parentElement.insertBefore(state.root, composer);
    }
    cleanupDuplicateRoots(state.root);
    return state.root;
  }

  function cleanupDuplicateRoots(keep = state.root) {
    for (const node of Array.from(document.querySelectorAll?.(`#${ROOT_ID}`) || [])) {
      if (node !== keep) node.remove?.();
    }
  }

  function handleSettingsClick(event) {
    if (event.target?.classList?.contains("cltc-settings-overlay")) {
      closeSettingsEditor();
      return;
    }
    const panelButton = event.target.closest?.("[data-settings-panel]");
    if (panelButton) {
      const panel = panelButton.getAttribute("data-settings-panel") || "";
      if (["profile", "general", "usage", "pricing"].includes(panel)) {
        state.settingsPanel = panel;
        renderSettingsOverlay(liveSnapshot(), { animate: true });
        if (panel === "usage") void refreshUsageAnalyticsFromHelper();
      }
      return;
    }
    const presetButton = event.target.closest?.("button[data-analytics-preset]");
    if (presetButton) {
      state.analyticsPreset = presetButton.getAttribute("data-analytics-preset") || "today";
      renderSettingsOverlay(liveSnapshot(), { animate: true, analyticsRange: true });
      return;
    }
    if (event.target.closest?.("[data-action='open-analytics-calendar']")) {
      void openAnalyticsCalendar();
      return;
    }
    const metricButton = event.target.closest?.("[data-analytics-metric]");
    if (metricButton) {
      state.analyticsMetric = metricButton.getAttribute("data-analytics-metric") === "cost" ? "cost" : "tokens";
      renderSettingsOverlay(liveSnapshot(), { animate: true });
      return;
    }
    const modelButton = event.target.closest?.("[data-analytics-model]");
    if (modelButton) {
      state.analyticsModel = modelButton.getAttribute("data-analytics-model") || "";
      renderSettingsOverlay(liveSnapshot(), { animate: true });
      return;
    }
    if (event.target.closest?.("[data-action='clear-analytics-model']")) {
      state.analyticsModel = "";
      renderSettingsOverlay(liveSnapshot(), { animate: true });
      return;
    }
    if (event.target.closest?.("[data-action='toggle-analytics-models']")) {
      state.analyticsModelsExpanded = !state.analyticsModelsExpanded;
      renderSettingsOverlay(liveSnapshot(), { animate: true });
      return;
    }
    const picked = event.target.closest?.("[data-price-pick]");
    if (event.target.closest?.("[data-action='save-price']")) {
      savePriceFromEditor();
      return;
    }
    if (event.target.closest?.("[data-action='delete-price']")) {
      deletePriceForModel(rootPriceModel());
      return;
    }
    if (picked) {
      state.priceEditorModel = picked.getAttribute("data-price-pick") || "";
      renderSettingsOverlay(liveSnapshot(), { animate: true });
      return;
    }
    if (event.target.closest?.("[data-action='save-profile']")) {
      saveProfilePrefsFromEditor();
      return;
    }
    if (event.target.closest?.("[data-action='sync-cc-switch']")) {
      void syncCcSwitchFromSettings();
      return;
    }
    const hubToggle = event.target.closest?.("[data-misc-field='hubVisible']");
    if (hubToggle) {
      saveHubVisible(Boolean(hubToggle.checked));
      syncHubVisibility();
      return;
    }
    if (event.target.closest?.("[data-action='reset-price']")) {
      restoreDefaultPrices();
      renderSettingsOverlay(liveSnapshot(), { animate: true });
      return;
    }
    if (event.target.closest?.("[data-action='new-price']")) {
      startNewPriceModel();
      return;
    }
    if (event.target.closest?.("[data-action='close-price']")) {
      closeSettingsEditor();
      return;
    }
  }

  function settingsEditorRoot() {
    return state.settingsOverlay || state.root;
  }

  function rootPriceModel() {
    const root = settingsEditorRoot();
    return (
      normalizeText(root?.querySelector("[data-price-field='model']")?.value) ||
      normalizeText(root?.querySelector("[data-price-model]")?.getAttribute("data-price-model"))
    );
  }

  function restoreDefaultPrices() {
    const overrides = loadJson(PRICE_OVERRIDES_KEY, {});
    for (const model of Object.keys(DEFAULT_PRICES)) delete overrides[model];
    localStorage.setItem(PRICE_OVERRIDES_KEY, JSON.stringify(overrides));
    const hidden = hiddenPriceModels();
    for (const model of Object.keys(DEFAULT_PRICES)) hidden.delete(model);
    saveHiddenPriceModels(hidden);
    state.priceEditorModel = nextPriceEditorModel(modelName());
    return true;
  }

  function nextPriceEditorModel(preferred = "") {
    const models = priceListModels(preferred);
    return models.includes(preferred) ? preferred : models[0] || preferred || newPriceModelName();
  }

  function deletePriceForModel(model) {
    const name = normalizeText(model);
    if (!name) return false;
    const overrides = loadJson(PRICE_OVERRIDES_KEY, {});
    delete overrides[name];
    localStorage.setItem(PRICE_OVERRIDES_KEY, JSON.stringify(overrides));
    const hidden = hiddenPriceModels();
    hidden.add(name);
    saveHiddenPriceModels(hidden);
    state.priceEditorModel = nextPriceEditorModel(modelName());
    renderSettingsOverlay(liveSnapshot(), { animate: true });
    return true;
  }

  function newPriceModelName() {
    const prices = visiblePrices();
    let name = "new-model";
    let index = 2;
    while (prices[name]) {
      name = `new-model-${index}`;
      index += 1;
    }
    return name;
  }

  function startNewPriceModel() {
    state.priceEditorModel = newPriceModelName();
    renderSettingsOverlay(liveSnapshot(), { animate: true });
  }

  function savePriceFromEditor() {
    const root = settingsEditorRoot();
    const model = rootPriceModel();
    if (!model) return false;
    const input = root.querySelector("[data-price-field='input']")?.value;
    const cachedInput = root.querySelector("[data-price-field='cachedInput']")?.value;
    const cacheWrite = root.querySelector("[data-price-field='cacheWrite']")?.value;
    const output = root.querySelector("[data-price-field='output']")?.value;
    const saved = window.__codexLiveTokenCost.setModelPrice(model, { input, cachedInput, cacheWrite, output });
    if (saved) {
      state.priceEditorModel = model;
      renderSettingsOverlay(liveSnapshot());
    } else {
      render();
    }
    return saved;
  }

  function profileSaveToastHtml() {
    const visible = Boolean(state.profileSaveStatus);
    const tone = state.profileSaveStatusTone === "error" ? "error" : visible ? "success" : "neutral";
    return `<div class="cltc-profile-save-toast" data-field="profile-save-status" data-visible="${String(visible)}" data-tone="${tone}" role="status" aria-live="polite">${escapeHtml(state.profileSaveStatus || "")}</div>`;
  }

  function renderProfileSaveToast() {
    const toast = state.settingsOverlay?.querySelector?.("[data-field='profile-save-status']");
    if (!toast) return false;
    const visible = Boolean(state.profileSaveStatus);
    toast.textContent = state.profileSaveStatus || "";
    toast.dataset.visible = String(visible);
    toast.dataset.tone = state.profileSaveStatusTone || "neutral";
    return true;
  }

  function setProfileSaveStatus(message, tone) {
    if (state.profileSaveStatusTimer) window.clearTimeout(state.profileSaveStatusTimer);
    state.profileSaveStatus = normalizeText(message, 160);
    state.profileSaveStatusTone = tone === "error" ? "error" : "success";
    state.profileSaveStatusTimer = window.setTimeout(() => {
      state.profileSaveStatusTimer = 0;
      state.profileSaveStatus = "";
      state.profileSaveStatusTone = "";
      if (!renderProfileSaveToast()) render();
    }, PROFILE_SAVE_STATUS_DURATION_MS);
  }

  function syncProfileSaveStatus(options = {}) {
    if (options.render === false) return;
    if (!renderProfileSaveToast()) render();
  }

  function saveProfilePrefsFromEditor(rootOverride, options = {}) {
    const root = rootOverride || settingsEditorRoot();
    if (!root) return false;
    const emailField = root.querySelector("[data-profile-field='email']");
    if (!emailField) return false;
    const email = normalizeText(emailField.value, 128);
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setProfileSaveStatus("邮箱格式无效", "error");
      syncProfileSaveStatus(options);
      return false;
    }
    const planType = root.querySelector("[data-profile-field='planType']")?.value;
    const planCustom = root.querySelector("[data-profile-field='planCustom']")?.value;
    const accountStructure = root.querySelector("[data-profile-field='accountStructure']")?.value;
    const workspaceName = root.querySelector("[data-profile-field='workspaceName']")?.value;
    const selectedPlan = planType === "custom" ? planCustom : planType;
    const plan = normalizeProfilePlan(selectedPlan, planCustom);
    saveLocalProfilePrefs({
      ...localProfilePrefs(),
      email,
      accountStructure,
      workspaceName,
      planType: plan.planType,
      planLabel: plan.planLabel,
    }, { profileEditor: true });
    setProfileSaveStatus("已保存", "success");
    syncProfileSaveStatus(options);
    return true;
  }

  function setCcSwitchSyncStatus(message) {
    state.ccSwitchSyncStatus = normalizeText(message, 160);
    const status = settingsEditorRoot()?.querySelector("[data-field='cc-switch-sync-status']");
    if (!status) return;
    status.textContent = state.ccSwitchSyncStatus;
    pulseSettingsStatus(status);
  }

  function pulseSettingsStatus(node) {
    if (!node) return;
    if (state.settingsStatusPulseFrame) {
      if (typeof window.cancelAnimationFrame === "function") window.cancelAnimationFrame(state.settingsStatusPulseFrame);
      state.settingsStatusPulseFrame = 0;
    }
    node.dataset.cltcStatusPulse = "true";
    void node.offsetWidth;
    if (typeof window.requestAnimationFrame !== "function") {
      node.removeAttribute?.("data-cltc-status-pulse");
      return;
    }
    state.settingsStatusPulseFrame = window.requestAnimationFrame(() => {
      state.settingsStatusPulseFrame = 0;
      node.removeAttribute?.("data-cltc-status-pulse");
    });
  }

  async function syncCcSwitchFromSettings() {
    const button = settingsEditorRoot()?.querySelector("[data-action='sync-cc-switch']");
    if (button) button.disabled = true;
    setCcSwitchSyncStatus("正在同步 CC Switch...");
    const result = await syncCcSwitchUsageFromHelper({ refresh: true });
    if (result.ok) {
      const imported = toCount(result.imported);
      const total = toCount(result.total ?? result.seen ?? result.rows);
      const suffix = total ? ` / ${fmtCount(total)} 条` : "";
      renderSettingsOverlay(liveSnapshot());
      setCcSwitchSyncStatus(`已同步 ${fmtCount(imported)} 条${suffix}`);
    } else if (result.skipped) {
      setCcSwitchSyncStatus(result.helperUnavailable ? "同步已跳过：helper 不可用，本地统计继续可用" : "同步已跳过：已有同步任务正在执行");
    } else if (result.helperUnavailable) {
      setCcSwitchSyncStatus("同步失败：helper 未运行，今日统计仅使用本地捕获数据");
    } else {
      setCcSwitchSyncStatus(`同步失败：${normalizeText(result.error, 100) || "helper 不可用"}`);
    }
    if (button) button.disabled = false;
    return result;
  }

  function ccSwitchSettingsHtml() {
    return `
      <section class="cltc-settings-section">
        <div class="cltc-settings-section-heading">
          <h2>数据与显示</h2>
          <p>管理 HUD 显示、本地 helper 与 CC Switch 数据同步。</p>
        </div>
        <label class="cltc-toggle-field">
          <span>
            <strong>显示 HUB</strong>
            <small>在输入框上方显示本轮、会话与今日统计。</small>
          </span>
          <input type="checkbox" data-misc-field="hubVisible"${hubVisible() ? " checked" : ""}>
        </label>
        <div class="cltc-settings-row">
          <div>
            <strong>本地 helper</strong>
            <div class="cltc-sync-status" data-field="helper-status" data-helper-unavailable="${state.helperUnavailable ? "true" : "false"}">${escapeHtml(helperStatusText())}</div>
          </div>
          <a class="cltc-link-button" href="${escapeHtml(HELPER_GITHUB_URL)}" target="_blank" rel="noreferrer">查看脚本</a>
        </div>
        <div class="cltc-settings-row">
          <div>
            <strong>CC Switch 数据</strong>
            <div class="cltc-sync-status" data-field="cc-switch-sync-status">${escapeHtml(state.ccSwitchSyncStatus || "按需同步本地历史统计。")}</div>
          </div>
          <button type="button" data-action="sync-cc-switch">立即同步</button>
        </div>
      </section>
    `;
  }

  function profileSettingsHtml() {
    const prefs = localProfilePrefs();
    const selectedOption = profilePlanOption(prefs.planType);
    const selectedValue = selectedOption?.value || "custom";
    const customValue = selectedOption ? "" : prefs.planLabel || prefs.planType;
    const optionHtml = PROFILE_PLAN_OPTIONS.map(
      (option) => `<option value="${escapeHtml(option.value)}"${option.value === selectedValue ? " selected" : ""}>${escapeHtml(option.label)}</option>`,
    ).join("");
    return `
      <section class="cltc-settings-section">
        <div class="cltc-settings-section-heading">
          <h2>个人资料</h2>
          <p>这些资料只保存在本地，用于 Codex 个人资料与账号菜单。</p>
        </div>
        <div class="cltc-price-grid">
          <label class="cltc-price-field cltc-price-field-full">
            <span>邮箱</span>
            <input class="cltc-price-input" data-profile-field="email" type="email" value="${escapeHtml(prefs.email)}">
            <small class="cltc-profile-field-note">官方新版本的账号菜单不再显示邮箱；这里修改的是本地伪装资料。</small>
          </label>
          <label class="cltc-price-field">
            <span>账号类型</span>
            <select class="cltc-profile-select" data-profile-field="accountStructure">
              <option value="personal"${prefs.accountStructure === "personal" ? " selected" : ""}>个人账户</option>
              <option value="workspace"${prefs.accountStructure === "workspace" ? " selected" : ""}>工作区账户</option>
            </select>
          </label>
          <label class="cltc-price-field">
            <span>空间名称</span>
            <input class="cltc-price-input" data-profile-field="workspaceName" type="text" value="${escapeHtml(prefs.workspaceName)}" placeholder="Codex Workspace">
          </label>
          <label class="cltc-price-field">
            <span>Plan 类型</span>
            <select class="cltc-profile-select" data-profile-field="planType">
              ${optionHtml}
              <option value="custom"${selectedValue === "custom" ? " selected" : ""}>自定义</option>
            </select>
          </label>
          <label class="cltc-price-field">
            <span>自定义</span>
            <input class="cltc-price-input" data-profile-field="planCustom" type="text" value="${escapeHtml(customValue)}" placeholder="Team Enterprise">
          </label>
        </div>
        <div class="cltc-price-actions">
          <button type="button" data-action="save-profile" data-variant="primary">保存更改</button>
        </div>
      </section>
    `;
  }

  function pricePopoverHtml(snap) {
    if (!state.priceEditorOpen) return "";
    const overrides = loadJson(PRICE_OVERRIDES_KEY, {});
    const model = normalizeText(state.priceEditorModel) || snap.model;
    const models = priceListModels(model);
    const price = priceFor(model) || { input: "", cachedInput: "", output: "" };
    const value = (field) => (price[field] == null ? "" : String(price[field]));
    const source = !price ? "未定价" : priceUsable(normalizePrice(overrides[model])) ? "自定义" : DEFAULT_PRICES[model] ? "默认" : "自定义";
    const panel = ["profile", "general", "usage", "pricing"].includes(state.settingsPanel) ? state.settingsPanel : "profile";
    const row = (name) => {
      const item = priceFor(name);
      const cell = (field) => (item?.[field] == null ? "-" : String(item[field]));
      return `
        <button class="cltc-price-row" type="button" data-price-pick="${escapeHtml(name)}" data-active="${String(name === model)}">
          <span title="${escapeHtml(priceListModelLabel(name))}">${escapeHtml(priceListModelLabel(name))}</span>
          <span>${escapeHtml(cell("input"))}</span>
          <span>${escapeHtml(cell("cachedInput"))}</span>
          <span>${escapeHtml(cell("cacheWrite"))}</span>
          <span>${escapeHtml(cell("output"))}</span>
        </button>
      `;
    };
    const pricingHtml = `
      <section class="cltc-settings-section">
        <div class="cltc-settings-section-heading">
          <h2>模型价格</h2>
          <p>按 USD / 1M tokens 设置输入、缓存与输出价格。</p>
        </div>
        <div class="cltc-price-meta">${escapeHtml(model)} · ${source}</div>
        <div class="cltc-price-row cltc-price-table-head" aria-hidden="true">
          <span>模型</span><span>输入</span><span>读缓存</span><span>写缓存</span><span>输出</span>
        </div>
        <div class="cltc-price-list">
          ${models.map(row).join("")}
        </div>
        <div class="cltc-price-editor">
          <div class="cltc-price-grid">
            <label class="cltc-price-field cltc-price-field-full">
              <span>模型名</span>
              <input class="cltc-price-input" data-price-field="model" type="text" value="${escapeHtml(model)}">
            </label>
            <label class="cltc-price-field">
              <span>输入</span>
              <input class="cltc-price-input" data-price-field="input" type="number" min="0" step="0.000001" value="${escapeHtml(value("input"))}">
            </label>
            <label class="cltc-price-field">
              <span>读缓存</span>
              <input class="cltc-price-input" data-price-field="cachedInput" type="number" min="0" step="0.000001" value="${escapeHtml(value("cachedInput"))}">
            </label>
            <label class="cltc-price-field">
              <span>写缓存</span>
              <input class="cltc-price-input" data-price-field="cacheWrite" type="number" min="0" step="0.000001" value="${escapeHtml(value("cacheWrite"))}">
            </label>
            <label class="cltc-price-field">
              <span>输出</span>
              <input class="cltc-price-input" data-price-field="output" type="number" min="0" step="0.000001" value="${escapeHtml(value("output"))}">
            </label>
          </div>
          <div class="cltc-price-actions">
            <button type="button" data-action="reset-price">恢复默认</button>
            <button type="button" data-action="new-price">新建</button>
            <button type="button" data-action="delete-price" data-variant="danger">删除</button>
            <button type="button" data-action="save-price" data-variant="primary">保存</button>
          </div>
        </div>
      </section>
    `;
    const content =
      panel === "profile" ? profileSettingsHtml() : panel === "general" ? ccSwitchSettingsHtml() : panel === "usage" ? usageAnalyticsHtml() : pricingHtml;
    return `
      <div class="cltc-settings-modal" role="dialog" aria-modal="true" aria-label="Codex Token Cost 设置" data-price-model="${escapeHtml(model)}" data-settings-active="${panel}">
        <div class="cltc-price-head">
          <span class="cltc-price-title">Codex Token Cost</span>
          <button type="button" data-action="close-price" aria-label="关闭">×</button>
        </div>
        <div class="cltc-settings-shell">
          <aside class="cltc-settings-sidebar">
            <nav class="cltc-settings-nav" aria-label="设置分组">
              <button type="button" data-settings-panel="profile" data-active="${String(panel === "profile")}">个人资料</button>
              <button type="button" data-settings-panel="general" data-active="${String(panel === "general")}">数据与显示</button>
              <button type="button" data-settings-panel="usage" data-active="${String(panel === "usage")}">使用统计</button>
              <button type="button" data-settings-panel="pricing" data-active="${String(panel === "pricing")}">模型价格</button>
            </nav>
            <div class="cltc-settings-footer">
              <span>Tianzora</span>
              <span class="cltc-settings-version">v${VERSION}</span>
            </div>
          </aside>
          <div class="cltc-settings-content" role="region" aria-live="polite">
            ${content}
          </div>
        </div>
      </div>
      ${profileSaveToastHtml()}
    `;
  }

  function stopAnalyticsTimer() {
    if (!state.analyticsTimer) return;
    window.clearInterval(state.analyticsTimer);
    state.analyticsTimer = 0;
  }

  function destroyAnalyticsCalendar() {
    state.analyticsCalendar?.destroy?.();
    state.analyticsCalendar = null;
  }

  async function ungzipBase64Text(value) {
    const binary = window.atob(value);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
    return new Response(stream).text();
  }

  function ensureFlatpickrTheme() {
    const style = document.getElementById("codex-live-token-cost-flatpickr-style") || document.createElement("style");
    style.id ||= "codex-live-token-cost-flatpickr-style";
    style.textContent = `
      .flatpickr-calendar {
        --cltc-calendar-accent: rgb(76, 78, 80);
        z-index: 2147483647 !important;
        border: 1px solid var(--color-token-border-light, #d1d5db) !important;
        border-radius: 12px !important;
        background: var(--color-token-dropdown-background, #fff) !important;
        box-shadow: 0 18px 46px rgba(0, 0, 0, .18) !important;
        color: var(--color-token-text-primary, #171717) !important;
        font: 13px/1.4 ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif !important;
        overflow: hidden;
      }
      .flatpickr-calendar.arrowTop::before,
      .flatpickr-calendar.arrowTop::after,
      .flatpickr-calendar.arrowBottom::before,
      .flatpickr-calendar.arrowBottom::after {
        display: none !important;
      }
      .flatpickr-calendar.multiMonth {
        width: 672px !important;
      }
      html.electron-dark .flatpickr-calendar {
        border-color: #3f3f46 !important;
        background: #18181b !important;
        color: #f4f4f5 !important;
      }
      .flatpickr-months {
        min-height: 52px !important;
        padding: 8px 10px 2px !important;
      }
      .flatpickr-months .flatpickr-prev-month,
      .flatpickr-months .flatpickr-next-month {
        top: 8px !important;
        width: 36px !important;
        height: 36px !important;
        padding: 10px !important;
        border-radius: 7px;
        fill: currentColor !important;
        color: var(--color-token-text-secondary, #52525b) !important;
      }
      .flatpickr-months .flatpickr-prev-month:hover,
      .flatpickr-months .flatpickr-next-month:hover {
        background: var(--color-token-list-hover-background, rgba(0, 0, 0, .06));
      }
      .flatpickr-months .flatpickr-month {
        height: 42px !important;
      }
      .flatpickr-months .flatpickr-month,
      .flatpickr-current-month .flatpickr-monthDropdown-months,
      .flatpickr-current-month input.cur-year,
      span.flatpickr-weekday {
        background: transparent !important;
        color: inherit !important;
      }
      .flatpickr-current-month {
        height: 42px !important;
        padding-top: 8px !important;
        font-size: 15px !important;
      }
      .flatpickr-current-month .flatpickr-monthDropdown-months,
      .flatpickr-current-month input.cur-year {
        font-weight: 600 !important;
      }
      .flatpickr-weekdays {
        height: 36px !important;
        padding: 0 8px !important;
      }
      span.flatpickr-weekday {
        line-height: 36px !important;
        font-size: 12px !important;
        font-weight: 600 !important;
      }
      .flatpickr-calendar.multiMonth .flatpickr-innerContainer,
      .flatpickr-calendar.multiMonth .flatpickr-rContainer,
      .flatpickr-calendar.multiMonth .flatpickr-days {
        width: 672px !important;
      }
      .flatpickr-calendar.multiMonth .dayContainer {
        width: 336px !important;
        min-width: 336px !important;
        max-width: 336px !important;
        padding: 2px 10px 16px !important;
      }
      .flatpickr-calendar.multiMonth .dayContainer + .dayContainer {
        border-left: 1px solid var(--color-token-border-light, #e5e7eb);
      }
      .flatpickr-day {
        position: relative;
        isolation: isolate;
        width: 14.2857143% !important;
        max-width: none !important;
        height: 42px !important;
        line-height: 42px !important;
        border-width: 0 !important;
        border-radius: 7px !important;
        color: inherit !important;
      }
      .flatpickr-day:hover,
      .flatpickr-day:focus {
        border-color: transparent !important;
        background: color-mix(in srgb, var(--cltc-calendar-accent) 9%, transparent) !important;
        outline: none !important;
      }
      html.electron-dark .flatpickr-day:hover,
      html.electron-dark .flatpickr-day:focus {
        background: color-mix(in srgb, var(--cltc-calendar-accent) 34%, transparent) !important;
      }
      .flatpickr-day.selected,
      .flatpickr-day.startRange,
      .flatpickr-day.endRange {
        border-color: transparent !important;
        background: transparent !important;
        color: #fff !important;
        box-shadow: none !important;
      }
      .flatpickr-day.inRange:not(.startRange):not(.endRange) {
        border-color: transparent !important;
        border-radius: 0 !important;
        background: transparent !important;
        box-shadow: none !important;
      }
      .flatpickr-day.inRange::before,
      .flatpickr-day.startRange::before,
      .flatpickr-day.endRange::before {
        content: "";
        position: absolute;
        z-index: -2;
        top: 5px;
        right: 0;
        bottom: 5px;
        left: 0;
        background: color-mix(in srgb, var(--cltc-calendar-accent) 12%, transparent);
        pointer-events: none;
      }
      .flatpickr-day.startRange:not(.endRange)::before {
        left: 50%;
      }
      .flatpickr-day.endRange:not(.startRange)::before {
        right: 50%;
      }
      .flatpickr-day.startRange.endRange::before {
        display: none;
      }
      .flatpickr-day.inRange:nth-child(7n + 1)::before {
        border-radius: 7px 0 0 7px;
      }
      .flatpickr-day.inRange:nth-child(7n)::before {
        border-radius: 0 7px 7px 0;
      }
      .flatpickr-day.selected::after,
      .flatpickr-day.startRange::after,
      .flatpickr-day.endRange::after {
        content: "";
        position: absolute;
        z-index: -1;
        top: 50%;
        left: 50%;
        width: 34px;
        height: 34px;
        border-radius: 8px;
        background: var(--cltc-calendar-accent);
        transform: translate(-50%, -50%);
        pointer-events: none;
      }
      .flatpickr-day:focus-visible {
        outline: 2px solid color-mix(in srgb, var(--cltc-calendar-accent) 34%, transparent) !important;
        outline-offset: -4px;
      }
      .flatpickr-day.selected:focus-visible,
      .flatpickr-day.startRange:focus-visible,
      .flatpickr-day.endRange:focus-visible {
        outline: none !important;
      }
      .flatpickr-day:focus-visible::after {
        box-shadow: 0 0 0 2px color-mix(in srgb, var(--cltc-calendar-accent) 34%, transparent);
      }
      .flatpickr-day.flatpickr-disabled {
        color: var(--color-token-text-tertiary, #9ca3af) !important;
        opacity: .42;
      }
      @media (max-width: 680px) {
        .flatpickr-calendar,
        .flatpickr-calendar.multiMonth {
          width: min(307.875px, calc(100vw - 28px)) !important;
          max-width: calc(100vw - 28px) !important;
        }
        .flatpickr-months {
          min-height: 48px !important;
          padding-top: 6px !important;
        }
        .flatpickr-calendar .flatpickr-innerContainer,
        .flatpickr-calendar .flatpickr-rContainer,
        .flatpickr-calendar .flatpickr-days,
        .flatpickr-calendar .dayContainer {
          width: 100% !important;
          min-width: 0 !important;
          max-width: 100% !important;
        }
        .flatpickr-calendar .dayContainer {
          padding: 0 8px 12px !important;
        }
        .flatpickr-day {
          height: 38px !important;
          line-height: 38px !important;
        }
      }
    `;
    if (!style.isConnected) document.head?.appendChild(style);
  }

  async function ensureFlatpickr() {
    if (typeof window.flatpickr === "function" && document.getElementById("codex-live-token-cost-flatpickr-base-style")) {
      ensureFlatpickrTheme();
      return window.flatpickr;
    }
    if (state.flatpickrPromise) return state.flatpickrPromise;
    state.flatpickrPromise = (async () => {
      if (typeof DecompressionStream !== "function") throw new Error("当前运行环境不支持本地日历解压");
      const cssText = await ungzipBase64Text(FLATPICKR_CSS_GZIP_BASE64);
      if (!document.getElementById("codex-live-token-cost-flatpickr-base-style")) {
        const style = document.createElement("style");
        style.id = "codex-live-token-cost-flatpickr-base-style";
        style.textContent = cssText;
        document.head?.appendChild(style);
      }
      if (typeof window.flatpickr !== "function") installBundledFlatpickr();
      ensureFlatpickrTheme();
      if (typeof window.flatpickr !== "function") throw new Error("Flatpickr 初始化失败");
      return window.flatpickr;
    })().catch((error) => {
      state.flatpickrPromise = null;
      throw error;
    });
    return state.flatpickrPromise;
  }

  async function openAnalyticsCalendar() {
    destroyAnalyticsCalendar();
    const input = state.settingsOverlay?.querySelector?.("[data-analytics-date-input]");
    if (!input) return false;
    try {
      const flatpickr = await ensureFlatpickr();
      const now = new Date();
      const minDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      minDate.setDate(minDate.getDate() - (ANALYTICS_MAX_DAYS - 1));
      const locale = { ...(flatpickr.l10ns.zh || flatpickr.l10ns.default), firstDayOfWeek: 1 };
      const defaultStart = parseLocalDateInput(state.analyticsCustomStart) || startOfLocalDay(Date.now());
      const defaultEnd = parseLocalDateInput(state.analyticsCustomEnd) || defaultStart;
      state.analyticsCalendar = flatpickr(input, {
        mode: "range",
        dateFormat: "Y-m-d",
        locale,
        defaultDate: [new Date(defaultStart), new Date(defaultEnd)],
        minDate,
        maxDate: new Date(),
        showMonths: window.matchMedia?.("(max-width: 680px)")?.matches ? 1 : 2,
        disableMobile: true,
        allowInput: false,
        appendTo: state.settingsOverlay,
        onChange(selectedDates) {
          if (selectedDates.length !== 2) return;
          state.analyticsCustomStart = localDateKey(selectedDates[0]);
          state.analyticsCustomEnd = localDateKey(selectedDates[1]);
          state.analyticsPreset = "custom";
        },
        onClose(selectedDates) {
          const complete = selectedDates.length === 2;
          window.setTimeout(() => {
            destroyAnalyticsCalendar();
            if (complete && state.priceEditorOpen) renderSettingsOverlay(liveSnapshot());
          }, 0);
        },
      });
      state.analyticsCalendar.open();
      return true;
    } catch (error) {
      const trigger = state.settingsOverlay?.querySelector?.("[data-action='open-analytics-calendar']");
      const message = normalizeText(error?.message || error, 160) || "日期选择器不可用";
      if (trigger) {
        trigger.textContent = message;
        trigger.dataset.error = normalizeText(error?.stack || message, 1000);
      }
      return false;
    }
  }

  function syncAnalyticsTimer() {
    if (!state.priceEditorOpen || state.settingsPanel !== "usage") {
      stopAnalyticsTimer();
      return;
    }
    if (state.analyticsTimer) return;
    state.analyticsTimer = window.setInterval(() => {
      if (state.priceEditorOpen && state.settingsPanel === "usage") void refreshUsageAnalyticsFromHelper();
      else stopAnalyticsTimer();
    }, 60_000);
  }

  function handleAnalyticsKeydown(event) {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    const bar = event.target?.closest?.("[data-chart-index]");
    if (!bar) return;
    const bars = Array.from(state.settingsOverlay?.querySelectorAll?.("[data-chart-index]") || []);
    const index = bars.indexOf(bar);
    if (index < 0) return;
    event.preventDefault?.();
    const next = bars[Math.max(0, Math.min(bars.length - 1, index + (event.key === "ArrowRight" ? 1 : -1)))];
    next?.focus?.();
  }

  function handleSettingsKeydown(event) {
    if (event.key === "Escape") {
      event.preventDefault?.();
      closeSettingsEditor();
      return;
    }
    handleAnalyticsKeydown(event);
  }

  const SETTINGS_FOCUS_ATTRIBUTES = [
    "data-settings-panel",
    "data-price-pick",
    "data-action",
    "data-profile-field",
    "data-price-field",
    "data-analytics-preset",
    "data-analytics-metric",
    "data-analytics-model",
    "data-chart-index",
  ];
  const SETTINGS_FOCUS_SELECTOR = SETTINGS_FOCUS_ATTRIBUTES.map((attribute) => `[${attribute}]`).join(",");

  function settingsFocusKey(node, root) {
    if (!node || !root?.contains?.(node)) return null;
    const focusable = node.getAttribute ? node : node.closest?.(SETTINGS_FOCUS_SELECTOR);
    if (!focusable) return null;
    for (const attribute of SETTINGS_FOCUS_ATTRIBUTES) {
      const value = focusable.getAttribute?.(attribute);
      if (value != null) return { attribute, value };
    }
    return null;
  }

  function isSettingsFocusable(node) {
    if (!node || node.disabled) return false;
    const tabIndex = node.getAttribute?.("tabindex");
    if (tabIndex != null) return Number(tabIndex) >= 0;
    return /^(A|BUTTON|INPUT|SELECT|TEXTAREA)$/.test(String(node.tagName || ""));
  }

  function restoreSettingsFocus(root, key) {
    if (!root || !key) return;
    const target = Array.from(root.querySelectorAll?.(SETTINGS_FOCUS_SELECTOR) || []).find(
      (node) => node.getAttribute?.(key.attribute) === key.value && isSettingsFocusable(node),
    );
    target?.focus?.();
  }

  function cancelSettingsFocusFrame() {
    if (state.settingsFocusFrame && typeof window.cancelAnimationFrame === "function") {
      window.cancelAnimationFrame(state.settingsFocusFrame);
    }
    state.settingsFocusFrame = 0;
  }

  function renderSettingsOverlay(snap, options = {}) {
    const animate = options.animate === true;
    const animateAnalyticsRange = options.analyticsRange === true;
    if (state.analyticsRangeSwitchFrame) {
      if (typeof window.cancelAnimationFrame === "function") window.cancelAnimationFrame(state.analyticsRangeSwitchFrame);
      state.analyticsRangeSwitchFrame = 0;
    }
    if (state.analyticsRangeSwitchTimer) {
      window.clearTimeout(state.analyticsRangeSwitchTimer);
      state.analyticsRangeSwitchTimer = 0;
    }
    if (!state.priceEditorOpen) {
      cancelSettingsFocusFrame();
      destroyAnalyticsCalendar();
      stopAnalyticsTimer();
      const overlay = state.settingsOverlay;
      if (!overlay) return;
      if (overlay.dataset.cltcClosing === "true") return;
      const modal = overlay.querySelector?.(".cltc-settings-modal");
      if (!modal) {
        overlay.remove?.();
        state.settingsOverlay = null;
        return;
      }
      overlay.dataset.cltcClosing = "true";
      const remove = () => {
        state.settingsOverlayCloseTimer = 0;
        if (state.priceEditorOpen || state.settingsOverlay !== overlay) return;
        overlay.remove?.();
        state.settingsOverlay = null;
        state.settingsButton?.focus?.();
      };
      state.settingsOverlayCloseTimer = window.setTimeout(remove, SETTINGS_MODAL_EXIT_MS);
      return;
    }
    if (state.settingsOverlayCloseTimer) {
      window.clearTimeout(state.settingsOverlayCloseTimer);
      state.settingsOverlayCloseTimer = 0;
    }
    state.settingsOverlay?.removeAttribute?.("data-cltc-closing");
    let entering = false;
    if (!state.settingsOverlay) {
      entering = true;
      for (const node of Array.from(document.querySelectorAll?.(".cltc-settings-overlay") || [])) node.remove?.();
      state.settingsOverlay = document.createElement("div");
      state.settingsOverlay.className = "cltc-settings-overlay";
      state.settingsOverlay.dataset.cltcEntering = "true";
      state.settingsOverlay.addEventListener("click", handleSettingsClick);
      state.settingsOverlay.addEventListener("change", handleSettingsChange);
      state.settingsOverlay.addEventListener("keydown", handleSettingsKeydown);
    }
    for (const node of Array.from(document.querySelectorAll?.(".cltc-settings-overlay") || [])) {
      if (node !== state.settingsOverlay) node.remove?.();
    }
    if (!state.settingsOverlay.isConnected) (document.body || document.documentElement)?.appendChild(state.settingsOverlay);
    if (entering) {
      const overlay = state.settingsOverlay;
      const settle = () => overlay?.removeAttribute("data-cltc-entering");
      if (typeof window.requestAnimationFrame === "function") window.requestAnimationFrame(settle);
      else settle();
    }
    if (state.analyticsCalendar?.isOpen) return;
    const focusKey = settingsFocusKey(document.activeElement, state.settingsOverlay);
    const contentScrollTop = state.settingsOverlay.querySelector(".cltc-settings-content")?.scrollTop || 0;
    const listScrollTop = state.settingsOverlay.querySelector(".cltc-price-list")?.scrollTop || 0;
    state.settingsOverlay.innerHTML = pricePopoverHtml(snap);
    const content = state.settingsOverlay.querySelector(".cltc-settings-content");
    const list = state.settingsOverlay.querySelector(".cltc-price-list");
    if (content) content.scrollTop = contentScrollTop;
    if (list) list.scrollTop = listScrollTop;
    if (focusKey) cancelSettingsFocusFrame();
    else if (
      state.settingsFocusFrame &&
      document.activeElement !== document.body &&
      !state.settingsOverlay.contains?.(document.activeElement)
    ) {
      cancelSettingsFocusFrame();
    }
    restoreSettingsFocus(state.settingsOverlay, focusKey);
    if (focusKey) {
      const focusRoot = state.settingsOverlay;
      const restoreFocus = () => {
        state.settingsFocusFrame = 0;
        if (state.settingsOverlay === focusRoot && focusRoot?.isConnected) restoreSettingsFocus(focusRoot, focusKey);
      };
      if (typeof window.requestAnimationFrame === "function") state.settingsFocusFrame = window.requestAnimationFrame(restoreFocus);
      else restoreFocus();
    }
    if (animateAnalyticsRange) {
      const rangeGroup = state.settingsOverlay.querySelector(".cltc-analytics-toolbar .cltc-segmented");
      if (rangeGroup) {
        const settle = () => {
          state.analyticsRangeSwitchTimer = 0;
          rangeGroup.removeAttribute("data-cltc-range-switching");
        };
        const activate = () => {
          state.analyticsRangeSwitchFrame = 0;
          rangeGroup.dataset.cltcRangeSwitching = "true";
          void rangeGroup.offsetWidth;
          state.analyticsRangeSwitchTimer = window.setTimeout(settle, SETTINGS_MODAL_EXIT_MS);
        };
        if (typeof window.requestAnimationFrame === "function") state.analyticsRangeSwitchFrame = window.requestAnimationFrame(activate);
        else activate();
      }
    }
    if (animate && content) {
      content.dataset.cltcSwitching = "true";
      const settle = () => content.removeAttribute("data-cltc-switching");
      if (typeof window.requestAnimationFrame === "function") window.requestAnimationFrame(settle);
      else settle();
    }
    syncAnalyticsTimer();
  }

  function rollComparableValue(text) {
    const value = normalizeText(text, 80).replace(/,/g, "");
    const match = value.match(/-?\d+(?:\.\d+)?/);
    if (!match) return null;
    const unit = value.slice(match.index + match[0].length).trim().toUpperCase();
    let multiplier = 1;
    if (unit.startsWith("K")) multiplier = 1_000;
    else if (unit.startsWith("M")) multiplier = 1_000_000;
    else if (unit.startsWith("B")) multiplier = 1_000_000_000;
    return Number(match[0]) * multiplier;
  }

  function rollTrend(previous, next) {
    const before = rollComparableValue(previous);
    const after = rollComparableValue(next);
    if (before == null || after == null || before === after) return "same";
    return after > before ? "up" : "down";
  }

  function digitChars(text) {
    return Array.from(normalizeText(text, 80));
  }

  function previousDigitByPosition(previous, digitPositionFromRight) {
    if (!previous) return null;
    let position = 0;
    const chars = digitChars(previous);
    for (let index = chars.length - 1; index >= 0; index -= 1) {
      const char = chars[index];
      if (!/\d/.test(char)) continue;
      if (position === digitPositionFromRight) return char;
      position += 1;
    }
    return null;
  }

  function rollingTokens(text) {
    let digitPosition = digitChars(text).filter((char) => /\d/.test(char)).length;
    return digitChars(text).map((char, index) => {
      if (!/\d/.test(char)) return { type: "separator", char, index };
      digitPosition -= 1;
      return { type: "digit", char, digitPosition };
    });
  }

  function createRollingDigitColumn() {
    const column = document.createElement("span");
    column.className = "cltc-roll-digit-column";
    column.setAttribute("aria-hidden", "true");
    column.dataset.cltcTokenType = "digit";
    const clip = document.createElement("span");
    clip.className = "cltc-roll-digit-clip";
    const stack = document.createElement("span");
    stack.className = "cltc-roll-digit-stack";
    stack.dataset.animate = "false";
    "0123456789".split("").forEach((digit) => {
      const row = document.createElement("span");
      row.textContent = digit;
      stack.append(row);
    });
    clip.append(stack);
    column.append(clip);
    return column;
  }

  function updateRollingDigitColumn(column, char, shouldAnimate) {
    const to = Number(char);
    const toY = `-${to * 16}px`;
    const stack = column.querySelector(".cltc-roll-digit-stack");
    if (!stack) return;
    stack.style.setProperty("--cltc-roll-to", String(to));
    stack.style.setProperty("--cltc-roll-to-y", toY);
    stack.dataset.animate = shouldAnimate ? "true" : "false";
    if (!shouldAnimate) {
      stack.style.transform = `translateY(${toY})`;
      stack.style.willChange = "";
      stack.dataset.animate = "false";
      return;
    }
    stack.style.willChange = "transform";
    const settle = () => {
      stack.style.transform = `translateY(${toY})`;
      stack.style.willChange = "";
      stack.dataset.animate = "false";
    };
    if (typeof window.requestAnimationFrame === "function") window.requestAnimationFrame(settle);
    else settle();
  }

  function createRollingSeparator(char) {
    const separator = document.createElement("span");
    separator.className = "cltc-roll-separator";
    separator.setAttribute("aria-hidden", "true");
    separator.dataset.cltcTokenType = "separator";
    separator.textContent = char;
    return separator;
  }

  function updateRollingValueSlot(slot, key, value) {
    const cacheKey = normalizeText(key, 80);
    const text = normalizeText(value, 80);
    const previous = state.hubValueCache.get(cacheKey);
    const animate = Boolean(previous && previous !== text);
    let roll = slot.firstElementChild;
    if (!roll || !roll.classList?.contains("cltc-roll") || roll.dataset.rollKey !== cacheKey) {
      roll = document.createElement("span");
      roll.className = "cltc-roll";
      roll.dataset.rollKey = cacheKey;
      slot.replaceChildren(roll);
    }
    roll.setAttribute("aria-label", text);
    const oldDigits = new Map();
    Array.from(roll.querySelectorAll(".cltc-roll-digit-column")).forEach((column) => {
      oldDigits.set(column.dataset.cltcDigitPosition || "", column);
    });
    const oldSeparators = Array.from(roll.querySelectorAll(".cltc-roll-separator"));
    let separatorIndex = 0;
    const nodes = rollingTokens(text).map((token) => {
      if (token.type === "separator") {
        const separator = oldSeparators[separatorIndex++] || createRollingSeparator(token.char);
        separator.textContent = token.char;
        return separator;
      }
      const positionKey = String(token.digitPosition);
      const column = oldDigits.get(positionKey) || createRollingDigitColumn();
      const previousChar = previousDigitByPosition(previous, token.digitPosition);
      column.dataset.cltcDigitPosition = positionKey;
      updateRollingDigitColumn(column, token.char, animate && previousChar !== token.char);
      return column;
    });
    roll.replaceChildren(...nodes);
    state.hubValueCache.set(cacheKey, text);
  }

  function cadencedShimmerText(text) {
    const safe = escapeHtml(text);
    return `<span class="cltc-cadenced-shimmer">${safe}<span class="cltc-cadenced-shimmer-sweep" aria-hidden="true"><span class="cltc-cadenced-shimmer-highlight">${safe}</span></span></span>`;
  }

  function cadencedShimmerHtml(html) {
    return `<span class="cltc-cadenced-shimmer">${html}<span class="cltc-cadenced-shimmer-sweep" aria-hidden="true"><span class="cltc-cadenced-shimmer-highlight">${html}</span></span></span>`;
  }

  function prefersReducedMotion() {
    try {
      return Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches);
    } catch {
      return false;
    }
  }

  function applyCadencedShimmerActive(active) {
    const nodes = state.root?.querySelectorAll?.(".cltc-cadenced-shimmer");
    if (!nodes) return;
    const elapsed = active && state.shimmerActiveStartedAt ? Math.max(0, Math.min(Date.now() - state.shimmerActiveStartedAt, SHIMMER_ACTIVE_MS)) : 0;
    nodes.forEach((node) => {
      const isActive = node.classList.contains("cltc-cadenced-shimmer-active");
      if (active) {
        if (!isActive) {
          node.style.setProperty("--cltc-shimmer-active-delay", `-${elapsed}ms`);
          node.classList.add("cltc-cadenced-shimmer-active");
        }
      } else if (isActive) {
        node.style.removeProperty("--cltc-shimmer-active-delay");
        node.classList.remove("cltc-cadenced-shimmer-active");
      }
    });
  }

  function clearCadencedShimmerTimers(options = {}) {
    const clearActive = options.clearActive !== false;
    if (state.shimmerDelayTimer) {
      window.clearTimeout(state.shimmerDelayTimer);
      state.shimmerDelayTimer = 0;
    }
    if (state.shimmerIntervalTimer) {
      window.clearInterval(state.shimmerIntervalTimer);
      state.shimmerIntervalTimer = 0;
    }
    if (clearActive && state.shimmerActiveTimer) {
      window.clearTimeout(state.shimmerActiveTimer);
      state.shimmerActiveTimer = 0;
    }
  }

  function pulseCadencedShimmer() {
    if (!state.shimmerRunning || prefersReducedMotion()) return;
    if (state.shimmerActiveTimer) {
      window.clearTimeout(state.shimmerActiveTimer);
      state.shimmerActiveTimer = 0;
    }
    applyCadencedShimmerActive(false);
    void state.root?.offsetWidth;
    state.shimmerActiveStartedAt = Date.now();
    state.shimmerActiveUntil = Date.now() + SHIMMER_ACTIVE_MS;
    applyCadencedShimmerActive(true);
    state.shimmerActiveTimer = window.setTimeout(() => {
      state.shimmerActiveTimer = 0;
      state.shimmerActiveStartedAt = 0;
      state.shimmerActiveUntil = 0;
      applyCadencedShimmerActive(false);
    }, SHIMMER_ACTIVE_MS);
  }

  function stopCadencedShimmer(options = {}) {
    const finishActive = Boolean(options.finishActive);
    state.shimmerRunning = false;
    const remaining = Math.max(0, (state.shimmerActiveUntil || 0) - Date.now());
    clearCadencedShimmerTimers({ clearActive: !finishActive });
    if (finishActive && remaining > 0) {
      applyCadencedShimmerActive(true);
      if (!state.shimmerActiveTimer) {
        state.shimmerActiveTimer = window.setTimeout(() => {
          state.shimmerActiveTimer = 0;
          state.shimmerActiveStartedAt = 0;
          state.shimmerActiveUntil = 0;
          applyCadencedShimmerActive(false);
        }, remaining);
      }
      return;
    }
    state.shimmerActiveStartedAt = 0;
    state.shimmerActiveUntil = 0;
    applyCadencedShimmerActive(false);
  }

  function syncCadencedShimmer(running) {
    if (!running) {
      if (state.shimmerRunning || state.shimmerActiveUntil) stopCadencedShimmer({ finishActive: true });
      return;
    }
    if (state.shimmerRunning) {
      applyCadencedShimmerActive(state.shimmerActiveUntil > Date.now());
      return;
    }
    state.shimmerRunning = true;
    if (prefersReducedMotion()) return;
    pulseCadencedShimmer();
    state.shimmerIntervalTimer = window.setInterval(pulseCadencedShimmer, SHIMMER_INTERVAL_MS);
  }

  function valueSlot(key) {
    return `<span class="cltc-value-slot" data-cltc-value-key="${escapeHtml(key)}"></span>`;
  }

  function textSlot(key) {
    return `<span class="cltc-text-slot" data-cltc-text-key="${escapeHtml(key)}"></span>`;
  }

  function currentFlowSkeleton() {
    return `本轮 输入 ${valueSlot("current-input")}<span class="cltc-current-spacer" aria-hidden="true">&nbsp;&nbsp;</span>输出 ${valueSlot("current-output")}`;
  }

  function hubSkeletonHtml() {
    const currentFlow = currentFlowSkeleton();
    return `
      <span class="cltc-pill cltc-current-pill"><span class="cltc-current-flow">${cadencedShimmerHtml(currentFlow)}</span></span>
      <span class="cltc-pill">会话 ${valueSlot("session-total")}</span>
      <span class="cltc-pill">缓存 ${valueSlot("session-cached")} (${valueSlot("session-cache-percent")})</span>
      <span class="cltc-pill">花费 ${valueSlot("session-cost")}${textSlot("session-priced-label")}</span>
      <span class="cltc-pill">今日 ${valueSlot("day-cost")}${textSlot("day-priced-label")}</span>
      <span class="cltc-pill" data-cltc-model-pill="true"><span class="cltc-model-label">${officialFastModeIconHtml()}<span class="cltc-model-text">${textSlot("model")}<span class="cltc-model-effort" data-cltc-model-effort="true" data-cltc-text-key="model-effort"></span></span></span></span>
    `;
  }

  function ensureHubSkeleton(root) {
    if (root.dataset.cltcSkeletonVersion === VERSION && root.querySelector?.("[data-cltc-value-key='current-input']")) return;
    root.innerHTML = hubSkeletonHtml();
    root.dataset.cltcSkeletonVersion = VERSION;
  }

  function updateValueSlot(root, key, value) {
    root.querySelectorAll?.("[data-cltc-value-key]").forEach((slot) => {
      if (slot.dataset.cltcValueKey !== key) return;
      updateRollingValueSlot(slot, key, value);
    });
  }

  function updateTextSlot(root, key, value) {
    const text = String(value ?? "");
    root.querySelectorAll?.("[data-cltc-text-key]").forEach((slot) => {
      if (slot.dataset.cltcTextKey !== key) return;
      if (slot.textContent !== text) slot.textContent = text;
    });
  }

  function updateHubContent(root, snap, sessionPricedLabel, dayPricedLabel) {
    updateValueSlot(root, "current-input", fmtCount(snap.current.input));
    updateValueSlot(root, "current-output", fmtCount(snap.current.output));
    updateValueSlot(root, "session-total", fmtCount(snap.session.total));
    updateValueSlot(root, "session-cached", fmtCount(snap.session.cached));
    updateValueSlot(root, "session-cache-percent", fmtPercent(snap.session.cached, snap.session.input));
    updateValueSlot(root, "session-cost", fmtMoney(snap.sessionCost.value));
    updateValueSlot(root, "day-cost", fmtMoney(snap.dayCost.value));
    updateTextSlot(root, "session-priced-label", sessionPricedLabel);
    updateTextSlot(root, "day-priced-label", dayPricedLabel);
    updateTextSlot(root, "model", snap.model);
    updateTextSlot(root, "model-effort", snap.modelInfo.effort || "");
    const effortNode = root.querySelector?.("[data-cltc-model-effort='true']");
    if (effortNode) effortNode.dataset.effort = snap.modelInfo.effort || "";
    const modelPill = root.querySelector?.("[data-cltc-model-pill='true']");
    if (modelPill) modelPill.removeAttribute("title");
    const fastIcon = root.querySelector?.("[data-cltc-fast-mode-icon='true']");
    if (fastIcon) {
      fastIcon.hidden = !snap.fastMode;
      if (snap.fastMode) fastIcon.removeAttribute?.("hidden");
      else fastIcon.setAttribute?.("hidden", "");
    }
  }

  function render(force = false) {
    if (!force && state.priceEditorOpen && state.settingsOverlay?.contains(document.activeElement) && document.activeElement?.closest?.(".cltc-settings-modal")) {
      return;
    }
    state.lastRenderAt = Date.now();
    ensureHeaderSettingsButton();
    const root = ensureRoot();
    if (!root) return;
    const snap = liveSnapshot();
    updateHeaderSettingsButton(snap);
    const sessionPricedLabel = costPricedLabel(snap.sessionCost, snap.session);
    const dayPricedLabel = costPricedLabel(snap.dayCost, snap.dayUsage);
    root.dataset.running = String(snap.running);
    ensureHubSkeleton(root);
    updateHubContent(root, snap, sessionPricedLabel, dayPricedLabel);
      syncCadencedShimmer(snap.running);
      syncHubVisibility(root);
      if (!state.settingsOverlay?.isConnected || !state.priceEditorOpen) renderSettingsOverlay(snap);
    }

  function scheduleRender(delay = 0) {
    if (state.renderTimer) return;
    const wait = Math.max(delay, RENDER_THROTTLE_MS - (Date.now() - state.lastRenderAt), 0);
    state.renderTimer = window.setTimeout(() => {
      state.renderTimer = 0;
      render();
    }, wait);
  }

  function handleSettingsChange(event) {
    const hubToggle = event.target?.closest?.("[data-misc-field='hubVisible']");
    if (hubToggle) {
      saveHubVisible(Boolean(hubToggle.checked));
      syncHubVisibility();
      scheduleHubVisibilitySync(0);
      return;
    }
  }

  function handleDocumentPointerDown(event) {
    if (state.priceEditorOpen && !state.root?.contains(event.target) && !state.settingsOverlay?.contains(event.target)) {
      state.priceEditorOpen = false;
      state.analyticsModel = "";
      state.analyticsModelsExpanded = false;
      render();
    }
  }

  function installLocalFetchCapture() {
    if (typeof window.fetch !== "function" || window.fetch.__codexLiveTokenCostWrapped === VERSION) return;
    const originalFetch = window.fetch.__codexLiveTokenCostOriginal || window.fetch;
    async function wrappedFetch(input, init) {
      const url = requestUrl(input);
      const method = requestMethod(input, init);
      if (isProfileUsageUrl(url) || isProfilePhotoUrl(url)) {
        return new Response(JSON.stringify(await profileFetchBodyAsync(method, init?.body)), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      const isCodexApi = isCodexApiUrl(url);
      if (isCodexApi) {
        observeSessionInfo(url);
        try {
          inspectLocalPayload(init?.body, "fetch-body");
        } catch {
          // Keep page fetch behavior untouched.
        }
      }
      const response = await originalFetch.call(this, input, init);
      if (response?.clone && isCodexApi) {
        response.clone().text().then((text) => inspectLocalPayload(text, "fetch")).catch(() => {});
      }
      return response;
    }
    wrappedFetch.__codexLiveTokenCostWrapped = VERSION;
    wrappedFetch.__codexLiveTokenCostOriginal = originalFetch;
    window.fetch = wrappedFetch;
  }

  function installLocalXhrCapture() {
    const Xhr = window.XMLHttpRequest;
    if (!Xhr?.prototype || Xhr.prototype.__codexLiveTokenCostWrapped === VERSION) return;
    const originalOpen = Xhr.prototype.__codexLiveTokenCostOriginalOpen || Xhr.prototype.open;
    const originalSend = Xhr.prototype.__codexLiveTokenCostOriginalSend || Xhr.prototype.send;
    Xhr.prototype.open = function open(method, url, ...rest) {
      this.__codexLiveTokenCostUrl = url;
      return originalOpen.call(this, method, url, ...rest);
    };
    Xhr.prototype.send = function send(...args) {
      const url = this.__codexLiveTokenCostUrl || "";
      const isCodexApi = isCodexApiUrl(url);
      if (isCodexApi) {
        observeSessionInfo(url);
        try {
          inspectLocalPayload(args[0], "xhr-body");
        } catch {
          // Keep XHR behavior untouched.
        }
      }
      this.addEventListener?.("loadend", () => {
        if (!isCodexApiUrl(this.__codexLiveTokenCostUrl)) return;
        try {
          inspectLocalPayload(this.responseText || "", "xhr");
        } catch {
          // Ignore unreadable XHR bodies.
        }
      });
      return originalSend.apply(this, args);
    };
    Xhr.prototype.__codexLiveTokenCostOriginalOpen = originalOpen;
    Xhr.prototype.__codexLiveTokenCostOriginalSend = originalSend;
    Xhr.prototype.__codexLiveTokenCostWrapped = VERSION;
  }

  function installLocalWebSocketCapture() {
    if (typeof window.WebSocket !== "function" || window.WebSocket.__codexLiveTokenCostWrapped === VERSION) return;
    const NativeWebSocket = window.WebSocket.__codexLiveTokenCostOriginal || window.WebSocket;
    function WrappedWebSocket(...args) {
      const socket = new NativeWebSocket(...args);
      socket.addEventListener?.("message", (event) => {
        try {
          if (typeof event.data === "string") inspectLocalPayload(event.data, "websocket");
          else if (event.data instanceof Blob && event.data.size <= 512000) {
            event.data.text().then((text) => inspectLocalPayload(text, "websocket")).catch(() => {});
          }
        } catch {
          // Keep socket delivery untouched.
        }
      });
      return socket;
    }
    try {
      WrappedWebSocket.prototype = NativeWebSocket.prototype;
      Object.defineProperty(WrappedWebSocket, "CONNECTING", { value: NativeWebSocket.CONNECTING });
      Object.defineProperty(WrappedWebSocket, "OPEN", { value: NativeWebSocket.OPEN });
      Object.defineProperty(WrappedWebSocket, "CLOSING", { value: NativeWebSocket.CLOSING });
      Object.defineProperty(WrappedWebSocket, "CLOSED", { value: NativeWebSocket.CLOSED });
    } catch {
      // Best-effort compatibility.
    }
    WrappedWebSocket.__codexLiveTokenCostWrapped = VERSION;
    WrappedWebSocket.__codexLiveTokenCostOriginal = NativeWebSocket;
    window.WebSocket = WrappedWebSocket;
  }

  function installLocalMessageCapture() {
    if (state.localMessageHandler) return;
    const previous = window.__codexLiveTokenCostMessageHandler;
    if (typeof previous === "function") window.removeEventListener?.("message", previous, true);
    const handler = (event) => inspectLocalPayload(event.data, "message");
    state.localMessageHandler = handler;
    window.__codexLiveTokenCostMessageHandler = handler;
    window.addEventListener?.("message", handler, true);
    window.__codexLiveTokenCostMessageCapture = VERSION;
  }

  function uninstallLocalMessageCapture() {
    const handlers = new Set([state.localMessageHandler, window.__codexLiveTokenCostMessageHandler].filter((handler) => typeof handler === "function"));
    for (const handler of handlers) window.removeEventListener?.("message", handler, true);
    if (handlers.has(window.__codexLiveTokenCostMessageHandler)) delete window.__codexLiveTokenCostMessageHandler;
    state.localMessageHandler = null;
    delete window.__codexLiveTokenCostMessageCapture;
  }

  function helperJsonViaBridge(url) {
    const bridge = window.electronBridge;
    if (!bridge || typeof bridge.sendMessageFromView !== "function") return Promise.reject(new Error("electronBridge unavailable"));
    const requestId = `cltc-helper-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    return new Promise((resolve, reject) => {
      let timer = 0;
      const cleanup = () => {
        if (timer) window.clearTimeout(timer);
        window.removeEventListener?.("message", handler, true);
      };
      const settle = (data) => {
        if (!data || data.requestId !== requestId || data.type !== "fetch-response") return false;
        cleanup();
        if (data.responseType !== "success" || toCount(data.status) >= 400) {
          reject(new Error(`helper bridge fetch failed: ${data.status || data.responseType || "unknown"}`));
          return true;
        }
        try {
          resolve(JSON.parse(data.bodyJsonString || "{}"));
        } catch (error) {
          reject(error);
        }
        return true;
      };
      const handler = (event) => {
        settle(event?.data);
      };
      window.addEventListener?.("message", handler, true);
      timer = window.setTimeout(() => {
        cleanup();
        reject(new Error("helper bridge fetch timeout"));
      }, 3000);
      Promise.resolve(bridge.sendMessageFromView({ type: "fetch", method: "GET", url, requestId }))
        .then(settle)
        .catch((error) => {
          cleanup();
          reject(error);
        });
    });
  }

  async function helperJsonViaBridgeWithRetry(url) {
    let lastError = null;
    for (const delay of HELPER_BRIDGE_RETRY_DELAYS_MS) {
      if (delay > 0) await new Promise((resolve) => window.setTimeout(resolve, delay));
      try {
        return await helperJsonViaBridge(url);
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError || new Error("helper bridge unavailable");
  }

  function isCodexAppDocument() {
    const protocol = String(window.location?.protocol || "").toLowerCase();
    const href = String(window.location?.href || "").toLowerCase();
    return protocol === "app:" || href.startsWith("app://");
  }

  async function helperJson(url) {
    try {
      return await helperJsonViaBridgeWithRetry(url);
    } catch (error) {
      if (isCodexAppDocument()) throw new Error("helper bridge unavailable in app document");
      const response = await window.fetch(url, { cache: "no-store" });
      if (!response?.ok) throw new Error(`helper fetch failed: ${response?.status || 0}`);
      return response.json();
    }
  }

  function helperThreadContentUrl(sessionKey) {
    return `${HELPER_THREAD_CONTENT_URL}?threadId=${encodeURIComponent(helperThreadContentKey(sessionKey))}`;
  }

  async function requestHelperThreadContent(sessionKey) {
    const key = helperThreadContentKey(sessionKey);
    if (!key || state.helperThreadContentInFlight.has(key)) return false;
    if (state.helperThreadContent.has(key) && Date.now() - toCount(state.helperThreadContent.get(key)?.observedAt) < 5000) return false;
    state.helperThreadContentInFlight.add(key);
    try {
      return mergeHelperThreadContent(await helperJson(helperThreadContentUrl(key)));
    } catch {
      return false;
    } finally {
      state.helperThreadContentInFlight.delete(key);
    }
  }

  function helperRefreshDelay(options = {}) {
    const value = Number(options.pollIntervalMs);
    return Number.isFinite(value) && value >= 0 ? value : HELPER_REFRESH_POLL_INTERVAL_MS;
  }

  function waitForHelperRefresh(options = {}) {
    return new Promise((resolve) => window.setTimeout(resolve, helperRefreshDelay(options)));
  }

  async function helperJsonUntilReady(requestUrl, readyUrl, options = {}) {
    let payload = await helperJson(requestUrl);
    const maxPollsValue = Number(options.maxPolls);
    const maxPolls = Number.isFinite(maxPollsValue) ? Math.max(0, Math.round(maxPollsValue)) : HELPER_REFRESH_MAX_POLLS;
    for (let attempt = 0; payload?.refreshing && attempt < maxPolls; attempt += 1) {
      await waitForHelperRefresh(options);
      payload = await helperJson(readyUrl);
    }
    return payload;
  }

  async function pollLocalHelperStats(options = {}) {
    if (state.helperPollInFlight) return state.helperPollPromise;
    if (typeof window.fetch !== "function") {
      setHelperStatus(HELPER_STATUS_DEGRADED, true);
      return false;
    }
    state.helperPollInFlight = true;
    state.helperPollPromise = (async () => {
      try {
        const payload = await helperJsonUntilReady(
          options.refresh ? HELPER_STATS_REFRESH_URL : HELPER_STATS_URL,
          HELPER_STATS_URL,
          options,
        );
        if (payload?.refreshing) return false;
        return mergeHelperStats(payload);
      } catch {
        // Helper is optional. Missing helper must not break Codex.
        setHelperStatus(HELPER_STATUS_DEGRADED, true);
        return false;
      } finally {
        state.helperPollInFlight = false;
        state.helperPollPromise = null;
      }
    })();
    return state.helperPollPromise;
  }

  async function syncCcSwitchUsageFromHelper(options = {}) {
    if (state.ccSwitchSyncInFlight) {
      if (!options.refresh) return state.ccSwitchSyncPromise || { ok: false, skipped: true };
      const inFlightPromise = state.ccSwitchSyncPromise;
      if (inFlightPromise) await inFlightPromise;
      if (state.ccSwitchSyncInFlight) return { ok: false, skipped: true, refreshing: true };
    }
    if (typeof window.fetch !== "function") {
      setHelperStatus(HELPER_STATUS_CC_SWITCH_DEGRADED, true);
      return { ok: false, skipped: true, helperUnavailable: true };
    }
    state.ccSwitchSyncInFlight = true;
    state.ccSwitchSyncPromise = (async () => {
      try {
        const payload = await helperJsonUntilReady(
          options.refresh ? CC_SWITCH_TURNS_REFRESH_URL : CC_SWITCH_TURNS_URL,
          CC_SWITCH_TURNS_URL,
          options,
        );
        if (payload?.refreshing) return { ok: false, skipped: true, refreshing: true };
        const turns = Array.isArray(payload?.turns) ? payload.turns : [];
        const result = importLocalUsageTurns(turns, { replaceSource: "cc-switch" });
        setHelperStatus(HELPER_STATUS_CONNECTED, false);
        return { ok: true, ...result };
      } catch (error) {
        setHelperStatus(HELPER_STATUS_CC_SWITCH_DEGRADED, true);
        return { ok: false, helperUnavailable: true, error: error?.message || String(error) };
      }
    })();
    try {
      return await state.ccSwitchSyncPromise;
    } finally {
      state.ccSwitchSyncInFlight = false;
      state.ccSwitchSyncPromise = null;
    }
  }

  function refreshProfileData(options = {}) {
    if (state.profileDataRefreshPromise) return state.profileDataRefreshPromise;
    const attemptedAt = toCount(state.profileDataRefreshAttemptAt);
    if (!options.force && attemptedAt && Date.now() - attemptedAt < PROFILE_DATA_REFRESH_MIN_INTERVAL_MS) {
      return Promise.resolve({ ok: false, skipped: true });
    }
    state.profileDataRefreshAttemptAt = Date.now();
    const refreshOptions = { ...options, refresh: true };
    state.profileDataRefreshPromise = Promise.all([
      pollLocalHelperStats(refreshOptions),
      syncCcSwitchUsageFromHelper(refreshOptions),
    ])
      .then(([helperStats, ccSwitch]) => {
        const ok = helperStats === true && ccSwitch?.ok === true && !ccSwitch?.error;
        if (ok) state.profileDataRefreshAt = Date.now();
        return { ok, helperStats, ccSwitch };
      })
      .catch((error) => ({ ok: false, error: error?.message || String(error) }))
      .finally(() => {
        state.profileDataRefreshPromise = null;
      });
    return state.profileDataRefreshPromise;
  }

  async function refreshUsageAnalyticsFromHelper() {
    if (!state.priceEditorOpen || state.settingsPanel !== "usage") return { ok: false, skipped: true };
    return syncCcSwitchUsageFromHelper();
  }

  function refreshLocalHelperStatsOnStart() {
    if (window.__CODEX_LIVE_TOKEN_COST_TEST__ || typeof window.fetch !== "function") return;
    void pollLocalHelperStats();
  }

  function startCcSwitchStartupSync() {
    if (window.__CODEX_LIVE_TOKEN_COST_TEST__ || state.ccSwitchStartupSyncStarted || typeof window.fetch !== "function") return;
    state.ccSwitchStartupSyncStarted = true;
    window.setTimeout(() => {
      void syncCcSwitchUsageFromHelper().then((result) => {
        if (!result?.ok) return;
        const imported = toCount(result.imported);
        state.ccSwitchSyncStatus = imported ? `启动时已同步 ${fmtCount(imported)} 条 CC Switch 统计数据` : "启动时已检查 CC Switch 统计数据";
        scheduleRender();
      });
    }, 1500);
  }

  function installLocalCapture() {
    installLocalFetchCapture();
    installLocalXhrCapture();
    installLocalWebSocketCapture();
    installLocalMessageCapture();
  }

  function start() {
    if (state.started) return;
    state.started = true;
    loadLocalLedger();
    cleanupAutoZeroPriceModels();
    installLocalCapture();
    document.addEventListener("keydown", rememberPendingInput, true);
    document.addEventListener("click", handleDocumentClick, true);
    document.addEventListener("submit", rememberPendingInput, true);
    document.addEventListener("pointerdown", handleDocumentPointerDown, true);
    installOfficialModelObserver();
    installTaskRunningObserver();
    installProfileIdentityObserver();
    installHubVisibilityObserver();
    scheduleProfileIdentitySync(0);
    refreshLocalHelperStatsOnStart();
    startCcSwitchStartupSync();
    render();
  }

  function scheduleStart() {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
    else start();
    if (!window.__CODEX_LIVE_TOKEN_COST_TEST__) window.setTimeout(start, 1200);
  }

  function destroy() {
    state.started = false;
    if (state.renderTimer) window.clearTimeout(state.renderTimer);
    if (state.profileSaveStatusTimer) window.clearTimeout(state.profileSaveStatusTimer);
    if (state.settingsOverlayCloseTimer) window.clearTimeout(state.settingsOverlayCloseTimer);
    if (state.settingsStatusPulseFrame && typeof window.cancelAnimationFrame === "function") {
      window.cancelAnimationFrame(state.settingsStatusPulseFrame);
    }
    cancelSettingsFocusFrame();
    if (state.analyticsRangeSwitchFrame && typeof window.cancelAnimationFrame === "function") {
      window.cancelAnimationFrame(state.analyticsRangeSwitchFrame);
    }
    if (state.analyticsRangeSwitchTimer) window.clearTimeout(state.analyticsRangeSwitchTimer);
    if (state.profileIdentitySyncTimer) window.clearTimeout(state.profileIdentitySyncTimer);
    if (state.profileUsageRefreshTimer) window.clearTimeout(state.profileUsageRefreshTimer);
    if (state.hubVisibilityTimer) window.clearTimeout(state.hubVisibilityTimer);
    state.profileSaveStatusTimer = 0;
    state.settingsOverlayCloseTimer = 0;
    state.settingsStatusPulseFrame = 0;
    state.analyticsRangeSwitchFrame = 0;
    state.analyticsRangeSwitchTimer = 0;
    stopAnalyticsTimer();
    destroyAnalyticsCalendar();
    state.hubVisibilityObserver?.disconnect?.();
    state.officialModelObserver?.disconnect?.();
    state.officialModelRootObserver?.disconnect?.();
    state.taskRunningObserver?.disconnect?.();
    state.profileIdentityObserver?.disconnect?.();
    state.officialModelObserver = null;
    state.officialModelRootObserver = null;
    state.officialModelTrigger = null;
    state.taskRunningObserver = null;
    state.hubVisibilityObserver = null;
    state.profileQueryClient = null;
    state.profileAccountsRefreshPromise = null;
    state.profileDataRefreshAttemptAt = 0;
    state.profileDataRefreshAt = 0;
    state.profileDataRefreshPromise = null;
    state.ccSwitchSyncPromise = null;
    if (state.profileAvatarRenderUrl?.startsWith?.("blob:")) {
      try {
        URL.revokeObjectURL(state.profileAvatarRenderUrl);
      } catch {
        // Ignore object URL cleanup failures during script teardown.
      }
    }
    if (Array.prototype.filter.__codexLiveTokenCostProfileUnlock === VERSION) {
      Array.prototype.filter = Array.prototype.__codexLiveTokenCostOriginalFilter;
    }
    if (Promise.prototype.then.__codexLiveTokenCostProfileUnlock === VERSION) {
      Promise.prototype.then = Promise.prototype.__codexLiveTokenCostOriginalThen;
    }
    if (RegExp.prototype.test.__codexLiveTokenCostProfileUnlock === VERSION) {
      RegExp.prototype.test = RegExp.prototype.__codexLiveTokenCostOriginalTest;
    }
    if (window.electronBridge?.sendMessageFromView?.__codexLiveTokenCostProfileUnlock === VERSION) {
      try {
        window.electronBridge.sendMessageFromView = window.electronBridge.__codexLiveTokenCostOriginalSendMessageFromView;
      } catch {
        // Read-only preload bridges cannot be restored by assignment.
      }
    }
    if (window.__codexLiveTokenCostProfileMessageIntercept === VERSION) {
      window.removeEventListener("codex-message-from-view", handleProfileFetchEvent, true);
      window.removeEventListener("message", handleProfileFetchResponseEvent, true);
      delete window.__codexLiveTokenCostProfileMessageIntercept;
    }
    uninstallLocalMessageCapture();
    state.profileRequestIds.clear();
    state.codexModulePromises.clear();
    state.officialThreadRuntimeStates.clear();
    state.runtimeSessionBindings.clear();
    if (window.__codexLiveTokenCostBridgeHook === VERSION) delete window.__codexLiveTokenCostBridgeHook;
    if (window.__codexLiveTokenCostProfileRequestPatch === VERSION) delete window.__codexLiveTokenCostProfileRequestPatch;
    if (window.__codexLiveTokenCostProfilePhotoPatch === VERSION) delete window.__codexLiveTokenCostProfilePhotoPatch;
    if (window.__codexLiveTokenCostProfileAuthPatch === VERSION) delete window.__codexLiveTokenCostProfileAuthPatch;
    if (window.fetch?.__codexLiveTokenCostWrapped === VERSION) window.fetch = window.fetch.__codexLiveTokenCostOriginal;
    if (window.WebSocket?.__codexLiveTokenCostWrapped === VERSION) window.WebSocket = window.WebSocket.__codexLiveTokenCostOriginal;
    const Xhr = window.XMLHttpRequest;
    if (Xhr?.prototype?.__codexLiveTokenCostWrapped === VERSION) {
      Xhr.prototype.open = Xhr.prototype.__codexLiveTokenCostOriginalOpen;
      Xhr.prototype.send = Xhr.prototype.__codexLiveTokenCostOriginalSend;
      delete Xhr.prototype.__codexLiveTokenCostWrapped;
    }
    document.removeEventListener("keydown", rememberPendingInput, true);
    document.removeEventListener("click", handleDocumentClick, true);
    document.removeEventListener("submit", rememberPendingInput, true);
    document.removeEventListener("pointerdown", handleDocumentPointerDown, true);
    for (const sessionKey of Array.from(state.localTurnTimers.keys())) clearLocalTurnTimer(sessionKey);
    clearLocalTurnTimer();
    stopCadencedShimmer();
    state.root?.remove();
    state.settingsButton?.remove?.();
    state.settingsOverlay?.remove?.();
    state.settingsOverlay = null;
    document.getElementById(STYLE_ID)?.remove();
    delete window.__codexLiveTokenCost;
    if (window.__codexLiveTokenCostVersion === VERSION) delete window.__codexLiveTokenCostVersion;
  }

  window.__codexLiveTokenCost = {
    version: VERSION,
    render,
    destroy,
    prices: visiblePrices,
    modelInfo: activeModelInfo,
    setModelPrice(model, price) {
      const name = String(model || "").trim();
      const normalized = normalizePrice(price);
      if (!name || !normalized || !priceUsable(normalized)) return false;
      const overrides = loadJson(PRICE_OVERRIDES_KEY, {});
      overrides[name] = normalized;
      localStorage.setItem(PRICE_OVERRIDES_KEY, JSON.stringify(overrides));
      const hidden = hiddenPriceModels();
      hidden.delete(name);
      saveHiddenPriceModels(hidden);
      render();
      return true;
    },
    usage: localUsageExport,
    importLocalUsageTurns,
    syncCcSwitchUsageFromHelper,
    refreshProfileData,
    mergeHelperStats,
    debugSessionState,
    openAnalyticsCalendar,
  };

  if (window.__CODEX_LIVE_TOKEN_COST_TEST__) {
    window.__codexLiveTokenCostTest = {
      normalizeUsage,
      calcCost,
      costForModelUsage,
      addUsage,
      aggregateTurnUsage,
      usageHasCostData,
      costPricedLabel,
      shouldPersistUsagePayload,
      isComposerDraftPayload,
      shouldStartTurnFromRequestPayload,
      isTokenCountPayload,
      isTaskCompletePayload,
      officialRuntimeSignalFromPayload,
      observeOfficialRuntimePayload,
      isOfficialThreadRunning,
      collectUsages,
      hasAssistantResultOutputStarted,
      fmtCount,
      fmtMoney,
      fmtPercent,
      rollComparableValue,
      rollTrend,
      parseModelEffortText,
      officialModelInfoFromText,
      officialModelTriggerInfo,
      readOfficialModelTrigger,
      bindOfficialModelTrigger,
      extractModelInfo,
      extractFastMode,
      countsTowardFastModeUsage,
      collectProfileInvocations,
      localProfileActivityStats,
      observeModelInfo,
      mainEditable,
      isMainComposerSurfaceTarget,
      findComposerBox,
      isCodexPlusText,
      findCodexPlusMenu,
      ensureHeaderSettingsButton,
      readTokenUsage,
      liveSnapshot,
      locationSessionKey,
      activeSidebarThreadKey,
      extractSessionKeyFromUrl,
      extractSessionInfo,
      extractSessionIdentity,
      observeSessionInfo,
      currentSessionKey,
      conversationContentState,
      mergeHelperThreadContent,
      requestHelperThreadContent,
      startupBlankConversationSessionKey,
      rememberSidebarThreadClick,
      rememberNewConversationClick,
      migrateLegacyLocationSessionTurns,
      currentSessionTurns,
      localProfileThreadCount,
      trimLocalLedger,
      compactLocalLedger,
      localUsageArchiveTurns,
      localDailyUsage,
      localDateKey,
      analyticsRangeForPreset,
      analyticsComparisonRange,
      analyticsVisibleTurns,
      aggregateUsageAnalytics,
      buildAnalyticsRollup,
      analyticsTurnsFromRollup,
      loadAnalyticsRollup,
      saveAnalyticsRollup,
      usageAnalyticsHtml,
      analyticsChartBuckets,
      refreshUsageAnalyticsFromHelper,
      todayUsage,
      todayCost,
      inspectLocalPayload,
      beginLocalTurn,
      beginLocalRequestTurn,
      finishLocalTurn,
      scheduleLocalTurnCompletionCheck,
      restoreRunningCurrentTurnFromLast,
      setLocalCurrentTurn,
      finishActiveTurnFromDomIfStopped,
      isCodexComposerCompleteDom,
      isCodexTaskRunningDom,
      rememberPendingInput,
      startTurnShimmer,
      stopTurnShimmer,
      updateValueSlot,
      rememberLocalUsage,
      persistLocalCurrentTurn,
      importLocalUsageTurns,
      syncCcSwitchUsageFromHelper,
      refreshProfileData,
      helperJson,
      mergeHelperStats,
      normalizeHelperStatsPayload,
      saveProfilePrefsFromEditor,
      profileSaveToastHtml,
      syncCcSwitchFromSettings,
      ccSwitchSettingsHtml,
      helperStatusText,
      profileUsageRefreshRequests: () => state.profileUsageRefreshRequests,
      hubVisible,
      saveHubVisible,
      hasCodexProjectContextRow,
      syncHubVisibility,
      profileSettingsHtml,
      pricePopoverHtml,
      newPriceModelName,
      startNewPriceModel,
      restoreDefaultPrices,
      deletePriceForModel,
      visiblePrices,
      priceListModels,
      priceListModelLabel,
      priceFor,
      priceModelKey,
      recentLedgerModel,
      cleanupAutoZeroPriceModels,
      emptyDailyUsageBucket,
      addTurnToDailyBucket,
      turnCost,
      localUsageExport,
      debugSessionState,
      activeModelInfo,
      spoofProfileAccountPayload,
      spoofProfileAccountsCheckPayload,
      localProfileAccountsCheckResponse,
      spoofProfileAuthContextValue,
      patchProfileReactAuthContext,
      profileReactAssetUrl,
      profileReactFromModule,
      profileAuthContextFromModule,
      isProfileQueryClient,
      profileQueryClientFromFiberNode,
      chainProfileQueryRefresh,
      invalidateProfileQueryWithClient,
      profileUnlockedSettingsSections,
      profileUsernameAllowed,
      applyLocalProfilePatch,
      patchProfileRequestClient,
      patchProfilePhotoUploadClient,
      extractProfilePhotoDataUrl,
      applyLocalProfilePhotoUpload,
      localProfileResponse,
      isProfileFetchMessage,
      syncSidebarProfileIdentity,
      syncVisibleProfilePhotoIdentity,
      syncProfileIdentity,
      installLocalMessageCapture,
      localMessageHandler: () => state.localMessageHandler,
    };
  }

  installOfficialProfileUnlock();

  scheduleStart();
})();

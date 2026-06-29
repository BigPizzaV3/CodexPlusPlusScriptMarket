/*
 * Bennett UI Improvements for BigPizzaV3 Codex++
 *
 * Source project: https://github.com/b-nnett/codex-plusplus-bennett-ui
 * Original tweak id: co.bennett.ui-improvements
 * Original author: bennett
 * Original license: MIT License, Copyright (c) 2026 Bennett
 *
 * This file is a compatibility migration from the b-nnett Codex++ tweak
 * runtime to the BigPizzaV3 Codex++ renderer-only user script runtime.
 * The UI implementation below is not original work by the migrator; the
 * wrapper only adapts storage/logging/renderer lifecycle assumptions.
 *
 * MIT permission notice from the source project applies: permission is
 * granted to use, copy, modify, merge, publish, distribute, sublicense,
 * and/or sell copies, provided the copyright notice and permission notice
 * are included in all copies or substantial portions of the Software.
 */

(() => {
  "use strict";

  const INSTALL_KEY = "__bennettUiImprovementsBigPizza";
  const VERSION = "1.0.5-bigpizza.1";
  const previous = window[INSTALL_KEY];
  if (previous && typeof previous.stop === "function") {
    try {
      previous.stop();
    } catch (error) {
      console.warn("[Bennett UI/BigPizza] previous stop failed", error);
    }
  }

  const module = { exports: {} };
  const exports = module.exports;
/**
 * Bennett's UI Improvements
 *
 * A bag of small, individually-toggleable UI tweaks for Codex. Settings
 * live on a dedicated sidebar entry under the "Tweaks" group.
 *
 * Features
 * --------
 *  • hide-upgrade-prompts  Hides the sidebar "Upgrade" pill and the
 *                          top-bar "Get Plus" button. Pure DOM filter,
 *                          fully reversible.
 *  • show-usage-in-sidebar (experimental) Renders a single usage box where
 *                          the upgrade pill was. Click toggles between
 *                          5h and Weekly; hover replaces content with
 *                          "Resets: HH:MM" or "Resets: Wed, HH:MM".
 *                          Red when <15% remaining.
 *                          Sources data from Codex's authenticated
 *                          /wham/usage app-server endpoint.
 *  • square-sidebar        Flatten the rounded seam between sidebar and
 *                          main content panel.
 *  • settings-search       Adds a small search field to Codex Settings.
 *  • match-sidebar-width   Force the settings page sidebar to match the
 *                          main UI sidebar's width, eliminating the
 *                          layout jump when opening/closing Settings.
 *  • sidebar-action-grid   Render the four main sidebar actions as a 2x2
 *                          grid of filled buttons.
 *  • sidebar-project-backgrounds  Add subtle grouped backgrounds behind
 *                                 project rows in the main sidebar.
 *  • sidebar-chat-multi-select  Cmd/Ctrl-click sidebar chats to select
 *                               multiple rows and run batch actions.
 *  • show-pinned-chat-project-names  Shows a small project name under
 *                                    pinned sidebar chats.
 *  • show-message-metrics-on-hover  Shows Codex token metrics beside
 *                                   assistant messages on hover.
 *  • slash-menu-polish  Tightens the composer slash menu with denser rows,
 *                       clearer active state, and calmer section headers.
 *
 * Authoring notes
 * ---------------
 *  • Renderer + main; main reads local Codex session JSONL for metrics.
 *  • Each feature returns a `dispose()` so toggling off is clean.
 *  • Match-by-text-content for resilience: Codex's main shell has no
 *    stable testids/aria-labels for these widgets.
 */

/** @type {import("@codex-plusplus/sdk").Tweak} */
module.exports = {
  start(api) {
    if (api.process === "main") {
      startMainMetricsProvider(api);
      startMainUsageProvider(api);
      startMainProjectLabelProvider(api);
      startMainSidebarBatchMenuProvider(api);
      startMainSlashMenuShortcutBridge(api);
      return;
    }

    const state = {
      api,
      features: new Map(/* id -> { dispose } */),
      defaults: {
        "hide-upgrade-prompts": true,
        "show-usage-in-sidebar": true,
        "show-message-metrics-on-hover": false,
        "square-sidebar": false,
        "settings-search": true,
        "match-sidebar-width": true,
        "sidebar-action-grid": true,
        "sidebar-project-backgrounds": true,
        "sidebar-chat-multi-select": false,
        "show-pinned-chat-project-names": false,
        "slash-menu-polish": true,
      },
    };
    this._state = state;

    // ── settings page ──────────────────────────────────────────────────
    // We require `registerPage`. The older `register()` API would render
    // these toggles as a *nested section* inside Codex++'s built-in
    // "Tweaks" page — that's misleading, since this tweak is supposed to
    // own its own sidebar entry. If the runtime is too old we just log
    // and skip the UI; the features themselves still activate below.
    if (typeof api.settings?.registerPage !== "function") {
      api.log.warn(
        "registerPage unavailable — Codex++ runtime is too old. " +
          "Restart Codex to pick up the latest preload. Settings UI not mounted.",
      );
    } else {
      this._pageHandle = api.settings.registerPage({
        id: "main",
        title: "UI Improvements",
        description: "Bennett's small quality-of-life tweaks.",
        iconSvg:
          '<svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" class="icon-sm inline-block align-middle" aria-hidden="true">' +
          '<path d="M4 6h12M4 10h8M4 14h12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>' +
          '<circle cx="14" cy="10" r="1.6" fill="currentColor"/>' +
          "</svg>",
        render: (root) => renderSettings(root, state),
      });
    }

    // ── activate features per stored prefs ─────────────────────────────
    for (const id of Object.keys(state.defaults)) {
      const enabled = readFlag(api, id, state.defaults[id]);
      if (enabled && FEATURES[id]) activateFeature(state, id);
    }
  },

  stop() {
    const s = this._state;
    if (!s) return;
    for (const [, f] of s.features) {
      try {
        f.dispose?.();
      } catch (e) {
        s.api.log.warn("dispose failed", e);
      }
    }
    s.features.clear();
    this._pageHandle?.unregister();
  },
};

// ─────────────────────────────────────────────────────────── settings UI ──

/**
 * Render the dedicated page. Mirrors Codex's standard form: one
 * `flex flex-col gap-2` section per group, rounded card with rows.
 */
function renderSettings(root, state) {
  const features = [
    {
      id: "hide-upgrade-prompts",
      title: "Hide upgrade prompts",
      description:
        'Hide the "Upgrade" pill in the app sidebar and the "Get Plus" button in the top bar.',
    },
    {
      id: "show-usage-in-sidebar",
      title: "Show usage in sidebar (experimental)",
      description:
        "Render 5-hour and weekly rate limits where the upgrade button was. Open the rate-limits breakdown (account menu → Rate limits) at least once to seed the values.",
    },
    {
      id: "show-message-metrics-on-hover",
      title: "Show message metrics on hover",
      description:
        "Show per-turn token usage beside assistant messages.",
    },
    {
      id: "square-sidebar",
      title: "Square sidebar corners",
      description:
        "Remove the rounded inner corners on the main content panel so it sits flush against the sidebar.",
    },
    {
      id: "settings-search",
      title: "Settings search",
      description:
        "Add a search field above the Settings tabs so sections can be filtered quickly.",
    },
    {
      id: "match-sidebar-width",
      title: "Match settings sidebar width",
      description:
        "Stop the layout jump when opening Settings: the settings sidebar (fixed at 300px) is forced to match the main UI sidebar's current width.",
    },
    {
      id: "sidebar-action-grid",
      title: "Sidebar action grid",
      description:
        "Render New chat, Search, Plugins, and Automations as a compact 2x2 grid of filled buttons.",
    },
    {
      id: "sidebar-project-backgrounds",
      title: "Sidebar project backgrounds",
      description:
        "Add subtle grouped backgrounds behind project rows so adjacent projects are easier to scan.",
    },
    {
      id: "sidebar-chat-multi-select",
      title: "Multi-select sidebar chats",
      description:
        "Cmd/Ctrl-click sidebar chats to select multiple rows, then right-click for batch actions.",
    },
    {
      id: "show-pinned-chat-project-names",
      title: "Show project label for pinned chats",
      description:
        "Show a smaller, subdued project label under pinned chats, and under all chats in chronological list mode.",
    },
    {
      id: "slash-menu-polish",
      title: "Slash menu polish",
      description:
        "Tighten the composer slash menu with denser rows, clearer active state, and calmer section headers.",
    },
  ];

  const section = el("section", "flex flex-col gap-2");
  section.appendChild(sectionTitle("Features"));

  const card = roundedCard();
  for (const f of features) {
    card.appendChild(featureRow(state, f));
  }
  section.appendChild(card);
  root.appendChild(section);
}

/**
 * Heuristic sidebar finder. Codex's left rail is typically a flex column
 * pinned to x=0 with substantial height. We rank candidates by:
 *   • bounding-rect.left near 0
 *   • height > 60% of viewport
 *   • narrow-ish width (< 360px) for collapsed/expanded sidebars
 *   • presence of `nav` or aria-label="Primary"
 * and pick the best. Returns the chosen element + a few selector hints.
 *
 * Currently unused — kept around for ad-hoc DOM debugging during tweak
 * development. Wire it up to a temporary button if needed.
 */
// eslint-disable-next-line no-unused-vars
async function dumpSidebar(api) {
  const candidates = [];
  const all = document.querySelectorAll(
    'aside, nav, [role="navigation"], [data-testid*="sidebar" i], div',
  );
  const vh = window.innerHeight;
  for (const el of all) {
    const r = el.getBoundingClientRect();
    if (r.left > 8) continue;
    if (r.height < vh * 0.6) continue;
    if (r.width < 40 || r.width > 420) continue;
    let score = 0;
    if (el.tagName === "ASIDE" || el.tagName === "NAV") score += 5;
    if (el.getAttribute("role") === "navigation") score += 3;
    if (el.querySelector("nav")) score += 1;
    if (/sidebar/i.test(el.getAttribute("data-testid") || "")) score += 4;
    if (/rounded/.test(el.className || "")) score += 2;
    score += Math.max(0, 200 - r.width) / 100; // prefer narrower
    candidates.push({ el, score, rect: r });
  }
  candidates.sort((a, b) => b.score - a.score);
  const top = candidates[0];
  if (!top) return { ok: false, reason: "no candidate" };

  const html = top.el.outerHTML;
  const summary = candidates.slice(0, 5).map((c) => ({
    tag: c.el.tagName.toLowerCase(),
    classes: c.el.className,
    rect: {
      x: Math.round(c.rect.left),
      y: Math.round(c.rect.top),
      w: Math.round(c.rect.width),
      h: Math.round(c.rect.height),
    },
    score: c.score,
  }));

  const payload =
    `<!-- top candidates (best first) -->\n` +
    summary.map((s) => "<!-- " + JSON.stringify(s) + " -->").join("\n") +
    `\n\n<!-- chosen element outerHTML -->\n` +
    html;

  let wrotePath = null;
  try {
    if (typeof api.fs?.write === "function") {
      await api.fs.write("sidebar-dump.html", payload);
      wrotePath = "sidebar-dump.html (in tweak data dir)";
    }
  } catch (e) {
    api.log.warn("fs.write failed", e);
  }

  let copied = false;
  try {
    await navigator.clipboard.writeText(payload);
    copied = true;
  } catch (e) {
    api.log.warn("clipboard write failed", e);
  }

  return { ok: true, copied, wrotePath, summary };
}

function featureRow(state, f) {
  const row = el("div", "flex items-center justify-between gap-4 p-3");

  const left = el("div", "flex min-w-0 flex-col gap-1");
  const label = el("div", "min-w-0 text-sm text-token-text-primary");
  label.textContent = f.title;
  left.appendChild(label);
  if (f.description) {
    const desc = el("div", "text-token-text-secondary min-w-0 text-sm");
    desc.textContent = f.description;
    left.appendChild(desc);
  }
  row.appendChild(left);

  const initial = readFlag(state.api, f.id, state.defaults[f.id]);
  const sw = switchControl(initial, async (next) => {
    writeFlag(state.api, f.id, next);
    window.dispatchEvent(new CustomEvent("codexpp-ui-improvements-setting-changed", {
      detail: { id: f.id, value: next },
    }));
    if (next) activateFeature(state, f.id);
    else deactivateFeature(state, f.id);
  });
  row.appendChild(sw);
  return row;
}

// ─────────────────────────────────────────────────────────── feature reg ──

function activateFeature(state, id) {
  if (state.features.has(id)) return;
  const fn = FEATURES[id];
  if (!fn) {
    state.api.log.warn("unknown feature", id);
    return;
  }
  try {
    const dispose = fn(state.api);
    state.features.set(id, { dispose });
    state.api.log.info("activated", id);
  } catch (e) {
    state.api.log.error("activate failed", id, e);
  }
}

function deactivateFeature(state, id) {
  const f = state.features.get(id);
  if (!f) return;
  try {
    f.dispose?.();
  } finally {
    state.features.delete(id);
    state.api.log.info("deactivated", id);
  }
}

// ─────────────────────────────────────────────────────────────── features ──

const FEATURES = {
  /**
   * Hide the "Upgrade" / "Get Plus" buttons. We match by visible text
   * across the document, skipping anything inside Codex's settings shell
   * or our own injected panels. Hidden via inline `display:none` so we
   * can restore it cleanly on dispose.
   */
  "hide-upgrade-prompts"(api) {
    // Two matcher tiers:
    //  • EXACT: short pill labels we trust (case-insensitive, exact match).
    //  • CONTAINS: longer phrases that may appear with trailing icons/arrows
    //    or wrapped in extra spans. We substring-match (case-insensitive).
    const EXACT = new Set([
      "upgrade",
      "get plus",
      "get chatgpt plus",
      "upgrade plan",
      "upgrade your plan",
      "upgrade to plus",
    ]);
    const CONTAINS = ["upgrade for higher limits"];
    const hidden = new Set(/* HTMLElement */);

    const isInsideOurShell = (el) => {
      let n = el;
      while (n) {
        if (n instanceof HTMLElement && n.dataset?.codexpp) return true;
        n = n.parentElement;
      }
      return false;
    };

    // Codex sometimes splits the label across icon + text spans, so we use
    // textContent and collapse whitespace.
    const normText = (el) =>
      (el.textContent || "").replace(/\s+/g, " ").trim().toLowerCase();

    const matches = (text) => {
      if (!text) return false;
      if (EXACT.has(text)) return true;
      for (const c of CONTAINS) if (text.includes(c)) return true;
      return false;
    };

    const scan = () => {
      const candidates = document.querySelectorAll(
        'button, a, [role="button"], [role="menuitem"]',
      );
      for (const el of candidates) {
        if (hidden.has(el)) continue;
        if (isInsideOurShell(el)) continue;
        const t = normText(el);
        if (t.length === 0 || t.length > 80) continue;
        if (!matches(t)) continue;
        const host = el.closest('[class*="rounded"], [class*="badge"]') || el;
        if (!(host instanceof HTMLElement)) continue;
        host.dataset.codexppPrevDisplay = host.style.display || "";
        host.style.display = "none";
        hidden.add(host);
        api.log.info("hid upgrade element", { text: t });
      }
    };

    scan();
    const obs = new MutationObserver(scan);
    obs.observe(document.documentElement, { childList: true, subtree: true });

    return () => {
      obs.disconnect();
      for (const el of hidden) {
        if ("codexppPrevDisplay" in el.dataset) {
          el.style.display = el.dataset.codexppPrevDisplay;
          delete el.dataset.codexppPrevDisplay;
        }
      }
      hidden.clear();
    };
  },

  /**
   * Surface 5h + Weekly rate limits in the sidebar slot where the "Upgrade"
   * pill lives. Sources its data from Codex's authenticated app-server usage
   * endpoint, with Codex's rendered rate-limit UI as a fallback.
   *
   * Strategy
   * --------
   *  1. Fetch `/wham/usage` through Codex's existing renderer fetch bridge.
   *  2. Parse the expanded/compact rendered labels only when the bridge is
   *     unavailable or the request fails.
   *  3. Persist the latest snapshot and refresh the mounted sidebar box in
   *     place. Re-mount only when Codex replaces the sidebar subtree.
   */
  "show-usage-in-sidebar"(api) {
    /**
     * Persisted snapshot:
     *   { fiveHour:{label,pct,resetAt} | null,
     *     weekly:  {label,pct,resetAt} | null,
     *     at:number }
     * `pct` is REMAINING (Codex displays remaining %, e.g. "100%").
     * `resetAt` is whatever Codex shows verbatim (typically "HH:MM",
     * or "Wed, HH:MM" for weekly API data).
     */
    let snapshot = null; // Do not render persisted quota data before this page fetches fresh usage.
    let mounted = null; // HTMLElement currently rendered in the sidebar
    let directUsageAvailable = false;
    let directUsageInFlight = false;
    let directUsageLastAttemptAt = 0;
    let directUsageFailureLogged = false;
    let directUsageSuccessLogged = false;
    let usageBridgeReadyLogged = false;
    let usageBridgeScriptInjected = false;
    let bridgeRequestSeq = 0;
    let lastMountedMode = null;
    let accountMode = "unknown"; // "official" | "api" | "unknown"
    let accountModeInFlight = false;
    let accountModeLastCheckedAt = 0;
    let accountModeLogged = false;

    const log = (...a) => api.log.info("[usage]", ...a);
    const ASIDE_SELECTOR = [
      "aside.pointer-events-auto.relative.flex.overflow-hidden",
      "aside.pointer-events-auto.relative.flex.overflow-visible",
      "aside.pointer-events-auto.relative.flex",
    ].join(", ");

    // ── parsing ────────────────────────────────────────────────────────
    const isVisibleElement = (node) => {
      if (!(node instanceof HTMLElement) || !node.isConnected) return false;
      if (node.closest("[hidden], [inert], [aria-hidden='true']")) return false;
      const style = window.getComputedStyle(node);
      if (
        style.display === "none" ||
        style.visibility === "hidden" ||
        style.opacity === "0"
      ) {
        return false;
      }
      const rect = node.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    };

    const applySnapshot = (partial, source) => {
      if (!partial?.fiveHour && !partial?.weekly) return false;
      if (accountMode === "api") return false;
      const next = {
        fiveHour: partial.fiveHour || snapshot?.fiveHour || null,
        weekly: partial.weekly || snapshot?.weekly || null,
        at: Date.now(),
      };
      const changed =
        JSON.stringify(next.fiveHour) !== JSON.stringify(snapshot?.fiveHour) ||
        JSON.stringify(next.weekly) !== JSON.stringify(snapshot?.weekly);
      snapshot = next;
      writeSnapshot(api, snapshot);
      if (changed) {
        log(`parsed snapshot from ${source}`, snapshot);
        ensureMounted();
      }
      return changed;
    };

    const ensureUsageBridgeScript = () => {
      if (usageBridgeScriptInjected) return;
      usageBridgeScriptInjected = true;
      window.addEventListener(
        "codexpp-usage-bridge-ready",
        (event) => {
          if (usageBridgeReadyLogged) return;
          usageBridgeReadyLogged = true;
          api.log.info("[usage] bridge ready", event.detail);
        },
        { once: true },
      );
      const script = document.createElement("script");
      script.dataset.codexppUsageBridge = "true";
      script.textContent = `(() => {
        if (window.__codexppUsageBridgeInstalled) return;
        window.__codexppUsageBridgeInstalled = true;
        const pending = new Set();
        window.dispatchEvent(new CustomEvent("codexpp-usage-bridge-ready", {
          detail: {
            hasElectronBridge: typeof window.electronBridge?.sendMessageFromView === "function",
          },
        }));
        window.addEventListener("codexpp-usage-request", (event) => {
          const message = event.detail;
          if (!message || typeof message !== "object" || !message.requestId) return;
          pending.add(message.requestId);
          let forwarded = false;
          const bridge = window.electronBridge;
          if (typeof bridge?.sendMessageFromView === "function") {
            forwarded = true;
            bridge.sendMessageFromView(message).catch(() => {});
          }
          const forwardedEvent = new CustomEvent("codex-message-from-view", {
            detail: message,
          });
          if (forwarded) forwardedEvent.__codexForwardedViaBridge = true;
          window.dispatchEvent(forwardedEvent);
        });
        window.addEventListener("message", (event) => {
          const data = event.data;
          if (
            !data ||
            typeof data !== "object" ||
            data.type !== "fetch-response" ||
            !pending.has(data.requestId)
          ) {
            return;
          }
          pending.delete(data.requestId);
          window.dispatchEvent(new CustomEvent("codexpp-usage-response", {
            detail: data,
          }));
          window.postMessage({
            type: "codexpp-usage-response",
            detail: data,
          }, "*");
        });
      })();`;
      (document.head || document.documentElement).appendChild(script);
      script.remove();
    };

    const dispatchCodexViewMessage = (message) => {
      ensureUsageBridgeScript();
      window.dispatchEvent(
        new CustomEvent("codexpp-usage-request", { detail: message }),
      );

      let forwarded = false;
      const bridge = window.electronBridge;
      if (typeof bridge?.sendMessageFromView === "function") {
        forwarded = true;
        bridge.sendMessageFromView(message).catch((e) => {
          if (!directUsageFailureLogged) {
            directUsageFailureLogged = true;
            api.log.warn("[usage] bridge send failed", e);
          }
        });
      }
      const event = new CustomEvent("codex-message-from-view", {
        detail: message,
      });
      if (forwarded) event.__codexForwardedViaBridge = true;
      window.dispatchEvent(event);
    };

    const fetchCodexAppServerJson = async (url, timeoutMs = 10_000) => {
      try {
        return await api.ipc.invoke("usage-fetch", url);
      } catch {
        // Older runtimes or a failed main-webview probe fall through to the
        // renderer bridge attempt below.
      }

      const hostId =
        new URL(window.location.href).searchParams.get("hostId")?.trim() ||
        "local";
      const requestId = `codexpp-usage-${Date.now()}-${++bridgeRequestSeq}`;

      return new Promise((resolve, reject) => {
        let done = false;
        const cleanup = () => {
          done = true;
          window.removeEventListener("message", onMessage);
          window.removeEventListener("codexpp-usage-response", onBridgeResponse);
          window.clearTimeout(timer);
        };
        const finish = (fn, value) => {
          if (done) return;
          cleanup();
          fn(value);
        };
        const onMessage = (event) => {
          const data =
            event.data?.type === "codexpp-usage-response"
              ? event.data.detail
              : event.data;
          handleResponse(data);
        };
        const onBridgeResponse = (event) => {
          handleResponse(event.detail);
        };
        const handleResponse = (data) => {
          if (
            !data ||
            typeof data !== "object" ||
            data.type !== "fetch-response" ||
            data.requestId !== requestId
          ) {
            return;
          }
          if (data.responseType === "success") {
            try {
              const body = JSON.parse(data.bodyJsonString);
              if (data.status >= 200 && data.status < 300) {
                finish(resolve, body);
              } else {
                finish(reject, new Error(`HTTP ${data.status}`));
              }
            } catch (e) {
              finish(reject, e);
            }
          } else {
            finish(reject, new Error(data.error || "fetch failed"));
          }
        };
        const timer = window.setTimeout(() => {
          dispatchCodexViewMessage({ type: "cancel-fetch", requestId });
          finish(reject, new Error("usage request timed out"));
        }, timeoutMs);
        window.addEventListener("message", onMessage);
        window.addEventListener("codexpp-usage-response", onBridgeResponse);
        dispatchCodexViewMessage({
          type: "fetch",
          hostId,
          requestId,
          method: "GET",
          url,
        });
      });
    };

    const bridgePostJson = async (path, payload = {}, timeoutMs = 2_500) => {
      const bridge = window.__codexSessionDeleteBridge;
      if (typeof bridge !== "function") return null;
      return await Promise.race([
        bridge(path, payload),
        new Promise((resolve) => window.setTimeout(() => resolve(null), timeoutMs)),
      ]);
    };

    const activeRelayProfile = (settings) => {
      if (!settings || typeof settings !== "object") return null;
      const profiles = Array.isArray(settings.relayProfiles) ? settings.relayProfiles : [];
      const activeId =
        typeof settings.activeRelayId === "string" && settings.activeRelayId.trim()
          ? settings.activeRelayId
          : "default";
      return profiles.find((profile) => profile?.id === activeId) || profiles[0] || null;
    };

    const fieldValue = (object, ...keys) => {
      if (!object || typeof object !== "object") return undefined;
      for (const key of keys) {
        if (Object.prototype.hasOwnProperty.call(object, key)) return object[key];
      }
      return undefined;
    };

    const catalogLooksLikeApiMode = (catalog) => {
      if (!catalog || typeof catalog !== "object") return false;
      const provider = String(catalog.model_provider || catalog.provider_name || "").toLowerCase();
      if (!provider) return false;
      return !["openai", "chatgpt"].includes(provider);
    };

    const refreshAccountMode = async (force = false) => {
      if (accountModeInFlight) return accountMode;
      const now = Date.now();
      if (!force && accountModeLastCheckedAt && now - accountModeLastCheckedAt < 10_000) {
        return accountMode;
      }
      accountModeLastCheckedAt = now;
      accountModeInFlight = true;
      try {
        let nextMode = "unknown";
        let settingsMode = "unknown";
        const settings = await bridgePostJson("/settings/get", {});
        const profile = activeRelayProfile(settings);
        const relayMode = fieldValue(profile, "relayMode", "relay_mode");
        const officialMixApiKey = !!fieldValue(profile, "officialMixApiKey", "official_mix_api_key");
        const legacyApiConfigured = !!(
          String(fieldValue(settings, "relayApiKey", "relay_api_key") || "").trim() ||
          String(fieldValue(settings, "relayBaseUrl", "relay_base_url") || "").trim()
        );
        if (relayMode === "official" && !officialMixApiKey) {
          nextMode = "official";
        } else if (relayMode === "pureApi" || relayMode === "pure_api") {
          nextMode = "api";
        } else if (relayMode === "mixedApi" || relayMode === "mixed_api" || officialMixApiKey) {
          nextMode = "api";
        } else if (!relayMode && legacyApiConfigured) {
          nextMode = "api";
        }

        if (nextMode === "unknown") {
          const catalog = await bridgePostJson("/codex-model-catalog", {});
          if (catalogLooksLikeApiMode(catalog)) nextMode = "api";
          else if (catalog?.model_provider === "openai" || catalog?.provider_name === "openai") {
            nextMode = "official";
          }
        }
        if (nextMode === "unknown") nextMode = settingsMode;

        if (nextMode !== "unknown" && nextMode !== accountMode) {
          accountMode = nextMode;
          if (accountMode === "api") {
            snapshot = {
              fiveHour: { label: "API", pct: null, resetAt: null, apiMode: true },
              weekly: null,
              at: Date.now(),
              apiMode: true,
            };
          } else if (snapshot?.apiMode) {
            snapshot = null;
          }
          ensureMounted(true);
        }
        if (!accountModeLogged && accountMode !== "unknown") {
          accountModeLogged = true;
          log("account mode", accountMode);
        }
        return accountMode;
      } catch (e) {
        return accountMode;
      } finally {
        accountModeInFlight = false;
      }
    };

    const remainingPercent = (usedPercent) => {
      const used = Number(usedPercent);
      if (!Number.isFinite(used)) return null;
      return Math.round(Math.min(Math.max(100 - used, 0), 100));
    };

    const formatResetAt = (epochSeconds, includeDay = false) => {
      const seconds = Number(epochSeconds);
      if (!Number.isFinite(seconds)) return null;
      const date = new Date(seconds * 1000);
      if (!Number.isFinite(date.getTime())) return null;
      return date.toLocaleTimeString(undefined, {
        ...(includeDay ? { weekday: "short" } : {}),
        hour: "numeric",
        minute: "2-digit",
      });
    };

    const normalizeUsageWindow = (window, label) => {
      if (!window || typeof window !== "object") return null;
      const pct = remainingPercent(window.used_percent);
      if (pct == null) return null;
      const minutes = Number(window.limit_window_seconds) / 60;
      const includeResetDay = Number.isFinite(minutes) && minutes >= 1440;
      return {
        label,
        pct,
        resetAt: formatResetAt(window.reset_at, includeResetDay),
      };
    };

    const pickClosestWindow = (windows, targetMinutes, predicate) => {
      let best = null;
      let bestDistance = Infinity;
      for (const window of windows) {
        const minutes = Number(window?.limit_window_seconds) / 60;
        if (!Number.isFinite(minutes) || !predicate(minutes)) continue;
        const distance = Math.abs(minutes - targetMinutes);
        if (
          !best ||
          distance < bestDistance ||
          (distance === bestDistance &&
            minutes > Number(best.limit_window_seconds) / 60)
        ) {
          best = window;
          bestDistance = distance;
        }
      }
      return best;
    };

    const snapshotFromUsageStatus = (status) => {
      const limits = [];
      const pushLimit = (rateLimit) => {
        if (!rateLimit || typeof rateLimit !== "object") return;
        if (rateLimit.primary_window) limits.push(rateLimit.primary_window);
        if (rateLimit.secondary_window) limits.push(rateLimit.secondary_window);
      };

      pushLimit(status?.rate_limit);
      if (Array.isArray(status?.additional_rate_limits)) {
        for (const item of status.additional_rate_limits) {
          pushLimit(item?.rate_limit);
        }
      }

      const five = pickClosestWindow(
        limits,
        300,
        (minutes) => minutes > 0 && minutes < 1440,
      );
      const weekly = pickClosestWindow(
        limits,
        7 * 24 * 60,
        (minutes) => minutes >= 1440,
      );

      return {
        fiveHour: normalizeUsageWindow(five, "5h"),
        weekly: normalizeUsageWindow(weekly, "Weekly"),
      };
    };

    const collectUsageWindows = (value, out = [], seen = new WeakSet()) => {
      if (!value || typeof value !== "object") return out;
      if (seen.has(value)) return out;
      seen.add(value);
      if (
        "used_percent" in value &&
        "limit_window_seconds" in value &&
        "reset_at" in value
      ) {
        out.push(value);
      }
      if (Array.isArray(value)) {
        for (const item of value) collectUsageWindows(item, out, seen);
      } else {
        for (const item of Object.values(value)) {
          collectUsageWindows(item, out, seen);
        }
      }
      return out;
    };

    const snapshotFromUsageWindows = (windows) => {
      const five = pickClosestWindow(
        windows,
        300,
        (minutes) => minutes > 0 && minutes < 1440,
      );
      const weekly = pickClosestWindow(
        windows,
        7 * 24 * 60,
        (minutes) => minutes >= 1440,
      );
      return {
        fiveHour: normalizeUsageWindow(five, "5h"),
        weekly: normalizeUsageWindow(weekly, "Weekly"),
      };
    };

    const applyUsageEvent = (message) => {
      if (!message || typeof message !== "object") return false;
      const windows = collectUsageWindows(message);
      if (!windows.length) return false;
      const partial = snapshotFromUsageWindows(windows);
      if (!partial.fiveHour && !partial.weekly) return false;
      directUsageAvailable = true;
      applySnapshot(partial, "rate-limit-event");
      return true;
    };

    const onUsageMessage = (event) => {
      const data = event.data;
      if (!data || typeof data !== "object") return;
      applyUsageEvent(data);
    };

    const refreshUsageFromApi = async () => {
      if ((await refreshAccountMode()) !== "official") return false;
      if (directUsageInFlight) return false;
      const now = Date.now();
      if (directUsageLastAttemptAt && now - directUsageLastAttemptAt < 15_000) {
        return false;
      }
      directUsageLastAttemptAt = now;
      directUsageInFlight = true;
      try {
        const status = await fetchCodexAppServerJson("/wham/usage");
        const partial = snapshotFromUsageStatus(status);
        if (partial.fiveHour || partial.weekly) {
          directUsageAvailable = true;
          directUsageFailureLogged = false;
          if (!directUsageSuccessLogged) {
            directUsageSuccessLogged = true;
            log("api active", partial);
          }
          applySnapshot(partial, "api");
          return true;
        }
        return false;
      } catch (e) {
        if (!directUsageFailureLogged) {
          directUsageFailureLogged = true;
          api.log.warn("[usage] /wham/usage unavailable; falling back to DOM", e);
        }
        return false;
      } finally {
        directUsageInFlight = false;
      }
    };

    /**
     * Codex's expanded breakdown is a 2-column CSS grid: label in col-1,
     * value in col-2. We locate the grid by its unique class signature,
     * then walk children pairwise.
     *
     * Returns the breakdown grid element, or null.
     */
    const findBreakdownGrid = () => {
      // The full class string is long and may shift; we anchor on the
      // distinctive `grid-cols-[minmax(0,1fr)_auto]` token.
      const grids = document.querySelectorAll(
        'div[class*="grid-cols-[minmax(0,1fr)_auto]"]',
      );
      for (const g of grids) {
        if (!isVisibleElement(g)) continue;
        const txt = (g.textContent || "").toLowerCase();
        if (
          (txt.includes("5h") || txt.includes("hourly")) &&
          txt.includes("week")
        )
          return g;
      }
      return null;
    };

    /**
     * Parse a value span (e.g. "100%·16:19") into `{ pct, resetAt }`.
     * Falls back to `null` fields when a piece is missing.
     */
    const parseValueText = (txt, root) => {
      const pctMatch = txt.match(/(\d{1,3})\s*%/);
      const pct = pctMatch ? Math.max(0, Math.min(100, +pctMatch[1])) : null;
      // Prefer the inner [title="HH:MM"] attribute, else regex the text.
      const titled = root?.querySelector?.("[title]");
      let resetAt = titled ? titled.getAttribute("title") : null;
      if (!resetAt) {
        const tMatch =
          txt.match(/\b(\d{1,2}:\d{2})\b/) ||
          txt.match(/\b(\d+\s*(?:m|h|d))\b/i);
        resetAt = tMatch ? tMatch[1] : null;
      }
      return { pct, resetAt };
    };

    const parseValue = (span) => {
      const txt = (span.textContent || "").replace(/\s+/g, " ").trim();
      return parseValueText(txt, span);
    };

    const scanBreakdown = (grid) => {
      const kids = Array.from(grid.children);
      let five = null;
      let week = null;
      // Pair (label, value) — col-1 then col-2 in DOM order.
      for (let i = 0; i + 1 < kids.length; i += 2) {
        const labelTxt = (kids[i].textContent || "")
          .replace(/\s+/g, " ")
          .trim();
        const value = parseValue(kids[i + 1]);
        const lower = labelTxt.toLowerCase();
        if (!five && (lower === "5h" || lower.startsWith("hourly"))) {
          five = { label: labelTxt, ...value };
        } else if (!week && lower.startsWith("week")) {
          week = { label: labelTxt, ...value };
        }
      }
      if (!five && !week) return false;
      applySnapshot({ fiveHour: five, weekly: week }, "breakdown");
      return true;
    };

    const parseCompactUsageNode = (node) => {
      if (!(node instanceof HTMLElement)) return null;
      if (node.closest('[data-codexpp="usage-box"]')) return null;
      if (!isVisibleElement(node)) return null;
      const text = (node.textContent || "").replace(/\s+/g, " ").trim();
      if (!text || text.length > 160 || !/%/.test(text)) return null;
      const lower = text.toLowerCase();
      const hasFive = /\b(5h|5\s*hour|hourly)\b/.test(lower);
      const hasWeek = /\b(weekly|week)\b/.test(lower);
      if (!hasFive && !hasWeek) return null;

      const value = parseValueText(text, node);
      if (value.pct == null) return null;
      const label = hasFive && !hasWeek ? "5h" : hasWeek && !hasFive ? "Weekly" : null;
      if (!label) return null;
      return label === "5h"
        ? { fiveHour: { label, ...value } }
        : { weekly: { label, ...value } };
    };

    const scanCompactUsage = () => {
      const candidates = document.querySelectorAll(
        'button, [role="button"], [role="status"], [aria-label], [title], span',
      );
      for (const node of candidates) {
        const partial = parseCompactUsageNode(node);
        if (partial) applySnapshot(partial, "compact");
      }
    };

    // ── sidebar mount ─────────────────────────────────────────────────
    /**
     * Find the sidebar slot for the upgrade pill. The pill itself is
     * hidden by `hide-upgrade-prompts`, so we mount as a sibling that
     * replaces its visual footprint. We anchor on the parent of any
     * button/link with text "Upgrade" (case-insensitive), or fall back
     * to the bottom of the sidebar group.
     *
     * Returns the parent element to mount into, or null if not found.
     */
    const compactSidebarText = (node) =>
      (node?.textContent || "").replace(/\s+/g, " ").trim().toLowerCase();

    const looksLikeSettingsSidebar = (sidebar) => {
      if (!(sidebar instanceof HTMLElement)) return false;
      if (
        sidebar.matches(".window-fx-sidebar-surface.w-token-sidebar") ||
        sidebar.closest(".window-fx-sidebar-surface.w-token-sidebar") ||
        sidebar.querySelector("[data-codexpp-settings-search]")
      ) {
        return true;
      }
      const text = compactSidebarText(sidebar);
      const englishSettings =
        text.includes("general") &&
        text.includes("appearance") &&
        (text.includes("account") || text.includes("configuration"));
      const chineseSettings =
        text.includes("常规") &&
        text.includes("外观") &&
        (
          text.includes("配置") ||
          text.includes("个性化") ||
          text.includes("键盘快捷键") ||
          text.includes("mcp 服务器") ||
          text.includes("钩子") ||
          text.includes("连接") ||
          text.includes("环境") ||
          text.includes("工作树") ||
          text.includes("已归档")
        );
      return englishSettings || chineseSettings;
    };

    const looksLikeMainAppSidebar = (sidebar) => {
      const text = compactSidebarText(sidebar);
      const hasNewChat = /\bnew chat\b|\bquick chat\b|新建|新对话/.test(text);
      const hasSearch = /\bsearch\b|搜索/.test(text);
      const hasProjectOrHistory =
        /\bprojects?\b|\bhistory\b|\bchats?\b|项目|历史|会话/.test(text);
      return (hasNewChat && hasSearch) || (hasSearch && hasProjectOrHistory);
    };

    const findUsageSidebar = () => {
      const candidates = Array.from(document.querySelectorAll(ASIDE_SELECTOR))
        .filter((node) => node instanceof HTMLElement && isVisibleElement(node))
        .filter((sidebar) => {
          const rect = sidebar.getBoundingClientRect();
          return rect.width >= 180 && !looksLikeSettingsSidebar(sidebar);
        });
      return candidates.find(looksLikeMainAppSidebar) || null;
    };

    const controlText = (node) =>
      [
        node.getAttribute?.("aria-label"),
        node.getAttribute?.("title"),
        node.textContent,
      ]
        .filter(Boolean)
        .join(" ")
        .replace(/\s+/g, " ")
        .trim()
        .toLowerCase();

    const isSettingsOrDeviceButton = (button) => {
      const text = controlText(button);
      return (
        /\bsettings?\b|preferences?|设置|偏好/.test(text) ||
        /\bmobile\b|\bphone\b|\bdevice\b|手机|移动|设备|连接/.test(text)
      );
    };

    const nearestControlRow = (sidebar, button) => {
      const sidebarRect = sidebar.getBoundingClientRect();
      let row = button.parentElement;
      while (row && row !== document.body && row !== sidebar.parentElement) {
        if (!(row instanceof HTMLElement)) break;
        const rect = row.getBoundingClientRect();
        const style = window.getComputedStyle(row);
        const buttonCount = row.querySelectorAll('button, a, [role="button"]').length;
        const insideSidebar =
          rect.left >= sidebarRect.left - 8 &&
          rect.right <= sidebarRect.right + 8;
        const looksLikeControlLayer =
          insideSidebar &&
          rect.height > 0 &&
          rect.height <= 88 &&
          (style.display === "flex" || style.display === "grid" || buttonCount >= 2);
        if (looksLikeControlLayer) return row;
        row = row.parentElement;
      }
      return button.parentElement instanceof HTMLElement ? button.parentElement : null;
    };

    const createInlineSlot = (row, anchor) => {
      const existing = row.querySelector(':scope > [data-codexpp="usage-slot"]');
      if (existing instanceof HTMLElement) return existing;
      const slot = document.createElement("div");
      slot.dataset.codexpp = "usage-slot";
      slot.dataset.codexppUsageSlot = "controls-inline";
      slot.className = "flex shrink-0 items-center";
      if (anchor?.parentElement === row) row.insertBefore(slot, anchor);
      else row.appendChild(slot);
      return slot;
    };

    const findSidebarSlot = () => {
      const sidebar = findUsageSidebar();
      if (!sidebar) return null;
      const existingSlot = sidebar.querySelector('[data-codexpp="usage-slot"]');
      if (existingSlot instanceof HTMLElement) return existingSlot;

      const controls = Array.from(sidebar.querySelectorAll('button, a, [role="button"]'))
        .filter((button) => button instanceof HTMLElement && isVisibleElement(button));
      const preferredControls = controls.filter(isSettingsOrDeviceButton);
      const ordered = (preferredControls.length ? preferredControls : controls).sort((a, b) => {
        const ar = a.getBoundingClientRect();
        const br = b.getBoundingClientRect();
        return br.bottom - ar.bottom;
      });

      for (const button of ordered) {
        const row = nearestControlRow(sidebar, button);
        if (row) return createInlineSlot(row, button);
      }

      return null;
    };

    const displaySnapshot = () =>
      accountMode === "api"
        ? {
            fiveHour: { label: "API", pct: null, resetAt: null, apiMode: true },
            weekly: null,
            at: Date.now(),
            apiMode: true,
          }
        :
      snapshot && (snapshot.fiveHour || snapshot.weekly)
        ? snapshot
        : {
            fiveHour: { label: "5h", pct: null, resetAt: null },
            weekly: { label: "Weekly", pct: null, resetAt: null },
            at: 0,
          };

    const ensureMounted = (forceRebuild = false) => {
      const visibleSnapshot = displaySnapshot();
      const slot = findSidebarSlot();
      document.querySelectorAll('[data-codexpp="usage-floating-slot"]').forEach((node) => node.remove());
      if (!slot) {
        if (mounted) {
          mounted.remove();
          mounted = null;
        }
        for (const stale of document.querySelectorAll(
          '[data-codexpp="usage-box"], [data-codexpp="usage-boxes"]',
        )) {
          stale.remove();
        }
        if (!ensureMounted._warned) {
          log("ensureMounted: no sidebar slot found yet");
          ensureMounted._warned = true;
        }
        return;
      }

      // Defensive: remove any stale boxes left by a previous mount cycle
      // (hot-reload, stop() race, or an older shape of this tweak that
      // used `data-codexpp="usage-boxes"`).
      for (const stale of document.querySelectorAll(
        '[data-codexpp="usage-box"], [data-codexpp="usage-boxes"]',
      )) {
        if (stale !== mounted) stale.remove();
      }

      if (mounted && slot.contains(mounted) && !forceRebuild) {
        mounted._refresh?.(visibleSnapshot);
        return;
      }
      if (mounted) mounted.remove();
      mounted = renderUsageBox(api, visibleSnapshot);
      mounted.dataset.codexpp = "usage-box";
      slot.appendChild(mounted);
      lastMountedMode = slot.dataset.codexppUsageSlot || "unknown";
      mounted.style.flex = "0 1 auto";
      mounted.style.width = "auto";
      mounted.style.minWidth = "4.75rem";
      mounted.style.maxWidth = "8.5rem";
      if (slot.dataset.codexppUsageSlot === "settings-inline-windows" || slot.dataset.codexppUsageSlot === "controls-inline") {
        mounted.style.width = "auto";
        mounted.style.minWidth = "4.75rem";
      }
      log("mounted usage box", {
        mode: lastMountedMode,
        slotTag: slot.tagName,
        slotClass: slot.className,
      });
    };

    // Initial render from persisted snapshot (so first paint isn't empty
    // even before the user opens the popover).
    ensureMounted(true);

    // ── observers ─────────────────────────────────────────────────────
    // We throttle to one tick per animation frame so a flood of React
    // re-renders can't tank the renderer (Codex mutates the DOM heavily
    // while typing). Coalesces N onMutate() calls into one scan.
    let scheduled = false;
    const onMutate = () => {
      if (scheduled) return;
      scheduled = true;
      requestAnimationFrame(() => {
        scheduled = false;
        refreshAccountMode().then((mode) => {
          if (mode === "official") refreshUsageFromApi();
        });
        if (accountMode === "official" && !directUsageAvailable) {
          const grid = findBreakdownGrid();
          if (grid) scanBreakdown(grid);
          scanCompactUsage();
        }
        ensureMounted();
      });
    };

    onMutate();
    const obs = new MutationObserver(onMutate);
    obs.observe(document.documentElement, { childList: true, subtree: true });
    const interval = window.setInterval(onMutate, 15_000);
    window.addEventListener("focus", onMutate);
    window.addEventListener("message", onUsageMessage);
    document.addEventListener("visibilitychange", onMutate);

    log("active", { snapshot });

    return () => {
      obs.disconnect();
      window.clearInterval(interval);
      window.removeEventListener("focus", onMutate);
      window.removeEventListener("message", onUsageMessage);
      document.removeEventListener("visibilitychange", onMutate);
      if (mounted) {
        mounted.remove();
        mounted = null;
      }
      for (const slot of document.querySelectorAll('[data-codexpp="usage-slot"]')) {
        if (slot instanceof HTMLElement && slot.children.length === 0) slot.remove();
      }
      for (const slot of document.querySelectorAll('[data-codexpp="usage-floating-slot"]')) {
        slot.remove();
      }
    };
  },

  /**
   * Square sidebar: the visual "rounded sidebar" is actually the main
   * content panel — `<main class="main-surface ... rounded-s-2xl">` —
   * which has `border-radius: 12.5px 0 0 12.5px` (TL+BL via Tailwind's
   * logical `rounded-s-2xl`). Its rounded left edge curves into the
   * sidebar, making the sidebar's TR+BR corners *appear* rounded.
   * Flattening `.main-surface`'s left side squares the seam.
   */
  "square-sidebar"() {
    const STYLE_ID = "codexpp-square-sidebar";
    document.getElementById(STYLE_ID)?.remove();

    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      /* Flatten the main panel's left (logical-start) corners.
         Codex applies these via Tailwind's rounded-s-2xl utility. */
      .main-surface {
        border-start-start-radius: 0 !important;
        border-end-start-radius: 0 !important;
      }
    `;
    document.head.appendChild(style);

    return () => {
      style.remove();
    };
  },

  /**
   * Refine the composer slash menu by lightly annotating the live DOM.
   *
   * Live DOM shape captured via Electron CDP:
   *   [data-composer-overlay-floating-ui] > slash panel
   *   slash panel [data-list-navigation-item="true"]
   *   slash panel .sticky.top-0          section headers
   */
  "slash-menu-polish"() {
    const STYLE_ID = "codexpp-slash-menu-polish";
    const MENU_ATTR = "data-codexpp-slash-menu";
    const OVERLAY_ATTR = "data-codexpp-slash-overlay";
    const TOPBAR_ATTR = "data-codexpp-slash-topbar";
    const SECTION_ATTR = "data-codexpp-slash-section";
    const SECTION_EMPTY_ATTR = "data-codexpp-slash-section-empty";
    const SECTION_TITLE_ATTR = "data-codexpp-slash-section-title";
    const SECTION_ICON_ATTR = "data-codexpp-slash-section-icon";
    const INPUT_MODE_ATTR = "data-codexpp-slash-input-mode";
    const PROGRAM_SCROLL_ATTR = "data-codexpp-slash-programmatic-scroll";
    const HOVER_SUPPRESS_ATTR = "data-codexpp-slash-hover-suppressed";
    const OVERLAY_NOISE_ATTR = "data-codexpp-slash-overlay-noise";
    const FAVORITES_GROUP_ATTR = "data-codexpp-slash-favorites";
    const FAVORITE_KEY_ATTR = "data-codexpp-slash-favorite-key";
    const FAVORITE_CLONE_ATTR = "data-codexpp-slash-favorite-clone";
    const FAVORITE_SOURCE_SECTION_ATTR = "data-codexpp-slash-favorite-source-section";
    const FAVORITE_DUPLICATE_HIDDEN_ATTR =
      "data-codexpp-slash-favorite-duplicate-hidden";
    const FAVORITES_STORAGE_KEY = "codexpp.slashMenuFavorites.v1";
    const FAVORITE_BUTTON_CLASS = "codexpp-slash-favorite-button";
    const SKILL_COPY_CLASS = "codexpp-slash-skill-copy";
    document.getElementById(STYLE_ID)?.remove();

    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      [data-composer-overlay-floating-ui="true"] {
        isolation: isolate;
      }

      [data-composer-overlay-floating-ui="true"][${OVERLAY_ATTR}="true"]
        > :not([${MENU_ATTR}="true"]) {
        display: none !important;
      }

      [data-composer-overlay-floating-ui="true"]
        > [${OVERLAY_NOISE_ATTR}="true"] {
        display: none !important;
      }

      [data-composer-overlay-floating-ui="true"]
        [data-codexpp="nav-group"],
      [data-composer-overlay-floating-ui="true"]
        [data-codexpp="pages-group"],
      [data-composer-overlay-floating-ui="true"]
        [data-codexpp="nav-config"],
      [data-composer-overlay-floating-ui="true"]
        [data-codexpp="nav-tweaks"],
      [data-composer-overlay-floating-ui="true"]
        [data-codexpp^="nav-page-"] {
        display: none !important;
        height: 0 !important;
        min-height: 0 !important;
        margin: 0 !important;
        padding: 0 !important;
        border: 0 !important;
        overflow: hidden !important;
        pointer-events: none !important;
      }

      [class*="[container-name:home-main-content]"]
        [data-codexpp="nav-group"],
      [class*="[container-name:home-main-content]"]
        [data-codexpp="pages-group"],
      [class*="[container-name:home-main-content]"]
        [data-codexpp="nav-config"],
      [class*="[container-name:home-main-content]"]
        [data-codexpp="nav-tweaks"],
      [class*="[container-name:home-main-content]"]
        [data-codexpp^="nav-tweak"],
      [class*="[container-name:home-main-content]"]
        [data-codexpp^="nav-page-"] {
        display: none !important;
        height: 0 !important;
        min-height: 0 !important;
        margin: 0 !important;
        padding: 0 !important;
        border: 0 !important;
        overflow: hidden !important;
        pointer-events: none !important;
      }

      [data-composer-overlay-floating-ui="true"]
        > [${MENU_ATTR}="true"] {
        width: min(100%, calc(100vw - 1rem)) !important;
        max-width: calc(100vw - 1rem) !important;
        border-color: color-mix(in srgb, currentColor 13%, transparent) !important;
        background-color: var(--color-token-dropdown-background) !important;
        background-color: color-mix(
          in srgb,
          var(--color-token-dropdown-background) 94%,
          var(--color-token-main-surface-primary) 6%
        ) !important;
        box-shadow:
          0 18px 48px rgb(0 0 0 / 0.28),
          0 1px 0 rgb(255 255 255 / 0.06) inset !important;
        padding: 0.375rem !important;
        backdrop-filter: blur(16px) saturate(130%) !important;
        overflow-x: hidden !important;
      }

      [data-composer-overlay-floating-ui="true"]
        [${MENU_ATTR}="true"]
        .vertical-scroll-fade-mask {
        gap: 0.125rem !important;
        overflow-x: hidden !important;
        overscroll-behavior-x: none !important;
        padding-top: 0.5rem !important;
      }

      [data-composer-overlay-floating-ui="true"]
        [${MENU_ATTR}="true"]
        .vertical-scroll-fade-mask
        > div:not([${TOPBAR_ATTR}]) {
        display: flex !important;
        flex: 0 0 auto !important;
        flex-direction: column !important;
        height: auto !important;
        min-width: 0 !important;
        max-width: 100% !important;
        overflow-x: hidden !important;
        overflow-y: visible !important;
      }

      [data-composer-overlay-floating-ui="true"]
        [${MENU_ATTR}="true"]
        .vertical-scroll-fade-mask
        > div[${SECTION_ATTR}]:not(:first-child) {
        border-top: 1px solid color-mix(in srgb, currentColor 14%, transparent) !important;
        margin-top: 0.25rem !important;
        padding-top: 0.25rem !important;
      }

      [data-composer-overlay-floating-ui="true"]
        [${MENU_ATTR}="true"]
        .vertical-scroll-fade-mask
        > div[${SECTION_EMPTY_ATTR}="true"] {
        display: none !important;
        margin: 0 !important;
        padding: 0 !important;
        border: 0 !important;
      }

      [data-composer-overlay-floating-ui="true"]
        [${MENU_ATTR}="true"]
        [${TOPBAR_ATTR}="true"] {
        display: flex !important;
        flex: none !important;
        min-width: 0 !important;
        align-items: center !important;
        justify-content: space-between !important;
        gap: 0.75rem !important;
        margin: -0.375rem -0.375rem 0 !important;
        border-bottom: 1px solid color-mix(in srgb, currentColor 10%, transparent) !important;
        background-color: var(--color-token-dropdown-background) !important;
        background-image: linear-gradient(
          to bottom,
          color-mix(in srgb, var(--color-token-dropdown-background) 98%, transparent),
          color-mix(in srgb, var(--color-token-dropdown-background) 90%, transparent)
        ) !important;
        padding: 0.375rem 0.5rem 0.375rem 0.625rem !important;
        color: var(--color-token-text-primary) !important;
        backdrop-filter: blur(16px) saturate(130%) !important;
      }

      [data-composer-overlay-floating-ui="true"]
        [${MENU_ATTR}="true"]
        [${SECTION_TITLE_ATTR}] {
        min-width: 0 !important;
        overflow: hidden !important;
        text-overflow: ellipsis !important;
        white-space: nowrap !important;
        font-size: 0.75rem !important;
        font-weight: 600 !important;
        letter-spacing: 0 !important;
        line-height: 1rem !important;
        text-transform: none !important;
      }

      [data-composer-overlay-floating-ui="true"]
        [${MENU_ATTR}="true"]
        [${SECTION_TITLE_ATTR}][data-changing="true"] {
        animation: codexpp-slash-title-change 180ms ease !important;
      }

      @keyframes codexpp-slash-title-change {
        0% {
          opacity: 0;
          transform: translateY(0.25rem);
        }
        100% {
          opacity: 1;
          transform: translateY(0);
        }
      }

      [data-composer-overlay-floating-ui="true"]
        [${MENU_ATTR}="true"]
        .codexpp-slash-section-icons {
        display: flex !important;
        flex: none !important;
        align-items: center !important;
        gap: 0.125rem !important;
      }

      [data-composer-overlay-floating-ui="true"]
        [${MENU_ATTR}="true"]
        [${SECTION_ICON_ATTR}] {
        display: inline-flex !important;
        position: relative !important;
        width: 1.5rem !important;
        height: 1.5rem !important;
        flex: none !important;
        align-items: center !important;
        justify-content: center !important;
        border: 0 !important;
        border-radius: 999px !important;
        background: transparent !important;
        color: var(--color-token-text-secondary) !important;
        font-weight: 800 !important;
        opacity: 0.78 !important;
        overflow: hidden !important;
        transition:
          color 140ms ease,
          opacity 140ms ease,
          transform 140ms ease !important;
      }

      [data-composer-overlay-floating-ui="true"]
        [${MENU_ATTR}="true"]
        [${SECTION_ICON_ATTR}]::before {
        content: "" !important;
        position: absolute !important;
        inset: 0 !important;
        border-radius: inherit !important;
        background: var(--codexpp-section-color, var(--color-token-text-primary)) !important;
        box-shadow: 0 0 0 1px color-mix(in srgb, #fff 24%, transparent) inset !important;
        opacity: 0 !important;
        transform: scale(0.62) !important;
        transition:
          opacity 160ms ease,
          transform 180ms cubic-bezier(0.2, 0.8, 0.2, 1) !important;
      }

      [data-composer-overlay-floating-ui="true"]
        [${MENU_ATTR}="true"]
        [${SECTION_ICON_ATTR}][data-active="true"] {
        color: #fff !important;
        font-weight: 900 !important;
        opacity: 1 !important;
      }

      [data-composer-overlay-floating-ui="true"]
        [${MENU_ATTR}="true"]
        [${SECTION_ICON_ATTR}][data-active="true"]::before {
        opacity: 1 !important;
        transform: scale(1) !important;
      }

      [data-composer-overlay-floating-ui="true"]
        [${MENU_ATTR}="true"]
        [${SECTION_ICON_ATTR}]:hover:not([data-active="true"]) {
        background: color-mix(in srgb, currentColor 8%, transparent) !important;
        opacity: 1 !important;
      }

      [data-composer-overlay-floating-ui="true"]
        [${MENU_ATTR}="true"]
        [${SECTION_ICON_ATTR}][data-active="true"]:hover {
        color: #fff !important;
      }

      [data-composer-overlay-floating-ui="true"]
        [${MENU_ATTR}="true"]
        [${SECTION_ICON_ATTR}]
        svg {
        position: relative !important;
        z-index: 1 !important;
        width: 0.9375rem !important;
        height: 0.9375rem !important;
      }

      [data-composer-overlay-floating-ui="true"]
        [${MENU_ATTR}="true"]
        [${SECTION_ICON_ATTR}][data-active="true"]
        svg path {
        stroke-width: 1.8 !important;
      }

      [data-composer-overlay-floating-ui="true"]
        [${MENU_ATTR}="true"]
        [data-list-navigation-item="true"][${FAVORITE_DUPLICATE_HIDDEN_ATTR}="true"] {
        display: none !important;
      }

      [data-composer-overlay-floating-ui="true"]
        [${MENU_ATTR}="true"]
        [data-list-navigation-item="true"] {
        box-sizing: border-box !important;
        position: relative !important;
        width: 100% !important;
        min-height: 1.75rem !important;
        height: 1.75rem !important;
        padding: 0 0.625rem !important;
        color: var(--color-token-text-primary) !important;
        opacity: 0.9 !important;
        max-width: 100% !important;
        min-width: 0 !important;
        overflow-x: hidden !important;
        transition:
          background-color 120ms ease,
          color 120ms ease,
          opacity 120ms ease !important;
      }

      [data-composer-overlay-floating-ui="true"]
        [${MENU_ATTR}="true"]
        [data-list-navigation-item="true"]
        > div {
        min-height: 1.25rem !important;
        gap: 0.625rem !important;
        min-width: 0 !important;
        max-width: 100% !important;
        overflow-x: hidden !important;
      }

      [data-composer-overlay-floating-ui="true"]
        [${MENU_ATTR}="true"]
        [data-list-navigation-item="true"]
        svg {
        width: 1rem !important;
        height: 1rem !important;
        color: var(--color-token-description-foreground) !important;
      }

      [data-composer-overlay-floating-ui="true"]
        [${MENU_ATTR}="true"]
        [data-list-navigation-item="true"]:hover,
      [data-composer-overlay-floating-ui="true"]
        [${MENU_ATTR}="true"]
        [data-list-navigation-item="true"]:focus-visible {
        background-color: color-mix(in srgb, currentColor 7%, transparent) !important;
        opacity: 1 !important;
      }

      [data-composer-overlay-floating-ui="true"]
        [${MENU_ATTR}="true"]
        [data-list-navigation-item="true"][aria-selected="true"] {
        background-color: color-mix(
          in srgb,
          var(--color-token-text-primary, currentColor) 11%,
          transparent
        ) !important;
        color: var(--color-token-text-primary) !important;
        opacity: 1 !important;
      }

      [data-composer-overlay-floating-ui="true"]
        [${MENU_ATTR}="true"]
        [data-list-navigation-item="true"][${FAVORITE_CLONE_ATTR}="true"]:hover,
      [data-composer-overlay-floating-ui="true"]
        [${MENU_ATTR}="true"]
        [data-list-navigation-item="true"][${FAVORITE_CLONE_ATTR}="true"][aria-selected="true"] {
        background-color: color-mix(
          in srgb,
          var(--color-token-text-primary, currentColor) 10%,
          transparent
        ) !important;
        opacity: 1 !important;
      }

      [data-composer-overlay-floating-ui="true"]
        [${MENU_ATTR}="true"]
        [data-list-navigation-item="true"][aria-selected="true"]
        svg {
        color: var(--color-token-text-primary) !important;
      }

      [data-composer-overlay-floating-ui="true"]
        [${MENU_ATTR}="true"][${INPUT_MODE_ATTR}="keyboard"]
        [data-list-navigation-item="true"]:hover:not([aria-selected="true"]) {
        background-color: transparent !important;
        opacity: 0.9 !important;
      }

      [data-composer-overlay-floating-ui="true"]
        [${MENU_ATTR}="true"][${PROGRAM_SCROLL_ATTR}="true"]
        .vertical-scroll-fade-mask
        [data-list-navigation-item="true"],
      [data-composer-overlay-floating-ui="true"]
        [${MENU_ATTR}="true"][${HOVER_SUPPRESS_ATTR}="true"]
        .vertical-scroll-fade-mask
        [data-list-navigation-item="true"] {
        pointer-events: none !important;
      }

      [data-composer-overlay-floating-ui="true"]
        [${MENU_ATTR}="true"][${HOVER_SUPPRESS_ATTR}="true"]
        [data-list-navigation-item="true"]:hover:not([aria-selected="true"]),
      [data-composer-overlay-floating-ui="true"]
        [${MENU_ATTR}="true"][${HOVER_SUPPRESS_ATTR}="true"]
        [data-list-navigation-item="true"]:focus-visible:not([aria-selected="true"]) {
        background-color: transparent !important;
        opacity: 0.9 !important;
      }

      [data-composer-overlay-floating-ui="true"]
        [${MENU_ATTR}="true"]
        [data-list-navigation-item="true"]
        div,
      [data-composer-overlay-floating-ui="true"]
        [${MENU_ATTR}="true"]
        [data-list-navigation-item="true"]
        span {
        min-width: 0 !important;
      }

      [data-composer-overlay-floating-ui="true"]
        [${MENU_ATTR}="true"]
        [data-list-navigation-item="true"]
        .text-token-description-foreground,
      [data-composer-overlay-floating-ui="true"]
        [${MENU_ATTR}="true"]
        [data-list-navigation-item="true"]
        span[class*="text-token-description-foreground"] {
        color: var(--color-token-text-secondary) !important;
      }

      [data-composer-overlay-floating-ui="true"]
        [${MENU_ATTR}="true"]
        [data-list-navigation-item="true"]
        span.ml-auto {
        max-width: 40% !important;
        overflow: hidden !important;
        text-overflow: ellipsis !important;
        white-space: nowrap !important;
        border: 1px solid color-mix(in srgb, currentColor 12%, transparent) !important;
        border-radius: 999px !important;
        padding: 0 0.375rem !important;
        font-size: 0.6875rem !important;
        line-height: 1rem !important;
        color: var(--color-token-text-secondary) !important;
        background-color: color-mix(in srgb, currentColor 5%, transparent) !important;
      }

      [data-composer-overlay-floating-ui="true"]
        [${MENU_ATTR}="true"]
        .${FAVORITE_BUTTON_CLASS} {
        display: inline-flex !important;
        width: 1.25rem !important;
        height: 1.25rem !important;
        flex: 0 0 1.25rem !important;
        align-items: center !important;
        justify-content: center !important;
        border: 0 !important;
        border-radius: 999px !important;
        background: transparent !important;
        color: var(--color-token-text-secondary) !important;
        cursor: pointer !important;
        opacity: 0 !important;
        transform: scale(0.92) !important;
        transition:
          color 120ms ease,
          opacity 120ms ease,
          transform 120ms ease !important;
      }

      [data-composer-overlay-floating-ui="true"]
        [${MENU_ATTR}="true"]
        [data-list-navigation-item="true"]:hover
        .${FAVORITE_BUTTON_CLASS},
      [data-composer-overlay-floating-ui="true"]
        [${MENU_ATTR}="true"]
        [data-list-navigation-item="true"][aria-selected="true"]
        .${FAVORITE_BUTTON_CLASS},
      [data-composer-overlay-floating-ui="true"]
        [${MENU_ATTR}="true"]
        .${FAVORITE_BUTTON_CLASS}[data-favorite="true"] {
        opacity: 1 !important;
        transform: scale(1) !important;
      }

      [data-composer-overlay-floating-ui="true"]
        [${MENU_ATTR}="true"][${HOVER_SUPPRESS_ATTR}="true"]
        [data-list-navigation-item="true"]:hover
        .${FAVORITE_BUTTON_CLASS}:not([data-favorite="true"]) {
        opacity: 0 !important;
        transform: scale(0.92) !important;
      }

      [data-composer-overlay-floating-ui="true"]
        [${MENU_ATTR}="true"]
        .${FAVORITE_BUTTON_CLASS}[data-favorite="true"] {
        color: #f4c95d !important;
      }

      [data-composer-overlay-floating-ui="true"]
        [${MENU_ATTR}="true"]
        .${FAVORITE_BUTTON_CLASS}:hover {
        color: #ffd76a !important;
      }

      [data-composer-overlay-floating-ui="true"]
        [${MENU_ATTR}="true"]
        .${FAVORITE_BUTTON_CLASS}
        svg {
        width: 0.875rem !important;
        height: 0.875rem !important;
        color: currentColor !important;
        stroke-width: 2 !important;
      }

      [data-composer-overlay-floating-ui="true"]
        [${MENU_ATTR}="true"]
        .sticky.top-0 {
        position: static !important;
        height: 0 !important;
        margin: 0 !important;
        overflow: hidden !important;
        padding: 0 !important;
        border: 0 !important;
        opacity: 0 !important;
        pointer-events: none !important;
      }

      [data-composer-overlay-floating-ui="true"]
        [${MENU_ATTR}="true"]
        [data-list-navigation-item="true"][${SECTION_ATTR}="skills"],
      [data-composer-overlay-floating-ui="true"]
        [${MENU_ATTR}="true"]
        [data-list-navigation-item="true"][${FAVORITE_SOURCE_SECTION_ATTR}="skills"] {
        height: auto !important;
        min-height: 2.875rem !important;
        padding-top: 0.3125rem !important;
        padding-bottom: 0.3125rem !important;
      }

      [data-composer-overlay-floating-ui="true"]
        [${MENU_ATTR}="true"]
        [data-list-navigation-item="true"][${SECTION_ATTR}="skills"]
        > div,
      [data-composer-overlay-floating-ui="true"]
        [${MENU_ATTR}="true"]
        [data-list-navigation-item="true"][${FAVORITE_SOURCE_SECTION_ATTR}="skills"]
        > div {
        align-items: center !important;
      }

      [data-composer-overlay-floating-ui="true"]
        [${MENU_ATTR}="true"]
        .${SKILL_COPY_CLASS} {
        display: flex !important;
        min-width: 0 !important;
        flex: 1 1 auto !important;
        flex-direction: column !important;
        gap: 0.0625rem !important;
        overflow: hidden !important;
      }

      [data-composer-overlay-floating-ui="true"]
        [${MENU_ATTR}="true"]
        .${SKILL_COPY_CLASS}
        > div {
        max-width: 100% !important;
        flex: none !important;
        overflow: hidden !important;
        text-overflow: ellipsis !important;
        white-space: nowrap !important;
        line-height: 1rem !important;
      }

      [data-composer-overlay-floating-ui="true"]
        [${MENU_ATTR}="true"]
        .${SKILL_COPY_CLASS}
        > span {
        max-width: 100% !important;
        flex: none !important;
        overflow: hidden !important;
        text-overflow: ellipsis !important;
        white-space: nowrap !important;
        color: var(--color-token-text-secondary) !important;
        font-size: 0.75rem !important;
        line-height: 1rem !important;
      }
    `;
    document.head.appendChild(style);

    const scrollHandlers = new Map();
    const pointerHandlers = new Map();
    const hoverGuardHandlers = new Map();
    const wheelHandlers = new Map();
    const hoverScrollStates = new WeakMap();
    const hoverSuppressStates = new WeakMap();
    const scrollAnimations = new Map();
    const titleTimers = new Map();
    const HOVER_GUARD_EVENTS = [
      "pointermove",
      "pointerover",
      "pointerenter",
      "mousemove",
      "mouseover",
      "mouseenter",
    ];
    const NAV_NOISE_SELECTOR = [
      '[data-codexpp="nav-group"]',
      '[data-codexpp="pages-group"]',
      '[data-codexpp="nav-config"]',
      '[data-codexpp="nav-tweaks"]',
      '[data-codexpp^="nav-tweak"]',
      '[data-codexpp^="nav-page-"]',
    ].join(", ");
    const OBSERVER_OPTIONS = {
      characterData: true,
      childList: true,
      subtree: true,
    };
    let scanFrame = 0;
    let scanTimer = 0;
    let homePruneFrame = 0;
    let hardPruneTimer = 0;
    let disposed = false;
    let observer = null;
    let documentHoverGuard = null;
    let slashRowScrollAllowedUntil = 0;
    const nativeScrollIntoView = Element.prototype.scrollIntoView;

    const normText = (node) =>
      String(node?.textContent || "").replace(/\s+/g, " ").trim();

    const isOverlayNoise = (node) => {
      if (node instanceof HTMLElement) {
        const codexpp = node.getAttribute("data-codexpp") || "";
        if (
          codexpp === "nav-group" ||
          codexpp === "pages-group" ||
          codexpp.startsWith("nav-page-") ||
          codexpp === "nav-config" ||
          codexpp === "nav-tweaks"
        ) {
          return true;
        }
      }
      const text = normText(node);
      return (
        /^Codex\+\+\b/.test(text) ||
        /^Tweaks\b/.test(text) ||
        /\bTweak Store\b/.test(text) ||
        /Better TerminalKeyboard ShortcutsDatabase Explorer/.test(text)
      );
    };

    const stopHoverSelectionEvent = (menu, event) => {
      if (!(menu instanceof HTMLElement)) return;
      trackPointerPosition(menu, event);
      if (shouldBlockSuppressedHover(menu, event)) {
        event.stopPropagation();
        event.stopImmediatePropagation?.();
        return;
      }
      freezeHoverScroll(menu);
      event.stopPropagation();
      event.stopImmediatePropagation?.();
    };

    const installDocumentHoverGuard = () => {
      if (documentHoverGuard) return;
      documentHoverGuard = (event) => {
        const target = event.target;
        if (!(target instanceof Element)) return;
        stopHoverSelectionEvent(target.closest(`[${MENU_ATTR}="true"]`), event);
      };
      HOVER_GUARD_EVENTS.forEach((type) =>
        window.addEventListener(type, documentHoverGuard, true),
      );
      HOVER_GUARD_EVENTS.forEach((type) =>
        document.addEventListener(type, documentHoverGuard, true),
      );
    };

    const allowSlashRowScrollIntoView = (duration = 220) => {
      slashRowScrollAllowedUntil = Math.max(
        slashRowScrollAllowedUntil,
        performance.now() + duration,
      );
    };

    const isSlashMenuRow = (node) =>
      node instanceof HTMLElement &&
      node.matches('[data-list-navigation-item="true"]') &&
      !!node.closest(`[${MENU_ATTR}="true"]`);

    const hoverSuppressStateFor = (menu) => {
      let state = hoverSuppressStates.get(menu);
      if (!state) {
        state = {
          active: false,
          pointerX: null,
          pointerY: null,
          releaseAfter: 0,
        };
        hoverSuppressStates.set(menu, state);
      }
      return state;
    };

    const eventPointerPosition = (event) => {
      if (!event || typeof event.clientX !== "number" || typeof event.clientY !== "number") {
        return null;
      }
      return { x: event.clientX, y: event.clientY };
    };

    const trackPointerPosition = (menu, event) => {
      const point = eventPointerPosition(event);
      if (!point) return;
      const state = hoverSuppressStateFor(menu);
      if (!state.active) {
        state.pointerX = point.x;
        state.pointerY = point.y;
      }
    };

    const clearHoverSelection = (menu) => {
      const state = hoverSuppressStateFor(menu);
      const pointerTarget =
        typeof state.pointerX === "number" && typeof state.pointerY === "number"
          ? document.elementFromPoint(state.pointerX, state.pointerY)
          : null;
      const rows = new Set(
        Array.from(menu.querySelectorAll('[data-list-navigation-item="true"]:hover')),
      );
      const pointerRow = pointerTarget?.closest?.('[data-list-navigation-item="true"]');
      if (pointerRow instanceof HTMLElement && menu.contains(pointerRow)) {
        rows.add(pointerRow);
      }
      menu
        .querySelectorAll('[data-list-navigation-item="true"][aria-selected="true"]')
        .forEach((row) => {
          if (!(row instanceof HTMLElement)) return;
          rows.add(row);
          const rect = row.getBoundingClientRect();
          if (
            typeof state.pointerX === "number" &&
            typeof state.pointerY === "number" &&
            state.pointerX >= rect.left &&
            state.pointerX <= rect.right &&
            state.pointerY >= rect.top &&
            state.pointerY <= rect.bottom
          ) {
            rows.add(row);
          }
        });
      rows.forEach((row) => {
        if (!(row instanceof HTMLElement)) return;
        row.setAttribute("aria-selected", "false");
        row.blur();
      });
    };

    const suppressHoverUntilPointerMoves = (menu, duration = 900) => {
      if (!(menu instanceof HTMLElement)) return;
      const state = hoverSuppressStateFor(menu);
      state.active = true;
      state.releaseAfter = performance.now() + duration;
      menu.setAttribute(HOVER_SUPPRESS_ATTR, "true");
      clearHoverSelection(menu);
      [0, 80, 240].forEach((delay) => {
        window.setTimeout(() => {
          if (menu.hasAttribute(HOVER_SUPPRESS_ATTR)) clearHoverSelection(menu);
        }, delay);
      });
    };

    const clearHoverSuppression = (menu) => {
      if (!(menu instanceof HTMLElement)) return;
      const state = hoverSuppressStateFor(menu);
      state.active = false;
      state.releaseAfter = 0;
      menu.removeAttribute(HOVER_SUPPRESS_ATTR);
      if (!menu.hasAttribute(PROGRAM_SCROLL_ATTR)) {
        menu.setAttribute(INPUT_MODE_ATTR, "pointer");
      }
    };

    const shouldBlockSuppressedHover = (menu, event) => {
      const state = hoverSuppressStateFor(menu);
      if (!state.active) return false;
      const point = eventPointerPosition(event);
      const now = performance.now();
      const scroller = menu.querySelector(".vertical-scroll-fade-mask");
      const programmatic =
        menu.hasAttribute(PROGRAM_SCROLL_ATTR) ||
        (scroller instanceof HTMLElement &&
          typeof hoverScrollStateFor(scroller).programmaticTarget === "number" &&
          now < hoverScrollStateFor(scroller).programmaticUntil);

      if (!point) return true;
      if (state.pointerX === null || state.pointerY === null) {
        if (!programmatic && now >= state.releaseAfter - 450) {
          clearHoverSuppression(menu);
          state.pointerX = point.x;
          state.pointerY = point.y;
          return false;
        }
        state.pointerX = point.x;
        state.pointerY = point.y;
        return true;
      }
      const moved = Math.hypot(point.x - state.pointerX, point.y - state.pointerY);
      if (moved >= 5 && !programmatic && now >= state.releaseAfter - 450) {
        clearHoverSuppression(menu);
        state.pointerX = point.x;
        state.pointerY = point.y;
        return false;
      }
      return true;
    };

    const hoverScrollStateFor = (scroller) => {
      let state = hoverScrollStates.get(scroller);
      if (!state) {
        state = {
          freezeTop: scroller.scrollTop,
          freezeUntil: 0,
          lastTop: scroller.scrollTop,
          programmaticTarget: null,
          programmaticUntil: 0,
          restoreFrame: 0,
        };
        hoverScrollStates.set(scroller, state);
      }
      return state;
    };

    const enforceHoverScrollFreeze = (scroller) => {
      const state = hoverScrollStateFor(scroller);
      const now = performance.now();
      const currentTop = scroller.scrollTop;
      const programmaticActive =
        typeof state.programmaticTarget === "number" && now < state.programmaticUntil;
      const programmaticDown = programmaticActive && state.programmaticTarget >= state.lastTop;

      if (now <= state.freezeUntil && (!programmaticActive || programmaticDown)) {
        if (currentTop < state.freezeTop - 1) {
          scroller.scrollTop = state.freezeTop;
          state.lastTop = state.freezeTop;
          return true;
        }
        state.freezeTop = Math.max(state.freezeTop, currentTop);
      }

      state.lastTop = scroller.scrollTop;
      return false;
    };

    const requestHoverScrollFreezeFrame = (scroller) => {
      const state = hoverScrollStateFor(scroller);
      if (state.restoreFrame) return;
      const tick = () => {
        state.restoreFrame = 0;
        enforceHoverScrollFreeze(scroller);
        if (performance.now() <= state.freezeUntil) {
          state.restoreFrame = requestAnimationFrame(tick);
        }
      };
      state.restoreFrame = requestAnimationFrame(tick);
    };

    const queueHoverScrollFreezeChecks = (scroller) => {
      [0, 16, 80, 180, 360].forEach((delay) => {
        window.setTimeout(() => enforceHoverScrollFreeze(scroller), delay);
      });
    };

    const freezeHoverScroll = (menu) => {
      const scroller = menu.querySelector(".vertical-scroll-fade-mask");
      if (!(scroller instanceof HTMLElement)) return;
      const state = hoverScrollStateFor(scroller);
      const now = performance.now();
      if (
        typeof state.programmaticTarget === "number" &&
        now < state.programmaticUntil &&
        state.programmaticTarget < scroller.scrollTop - 1
      ) {
        state.freezeUntil = 0;
        state.freezeTop = scroller.scrollTop;
        state.lastTop = scroller.scrollTop;
        return;
      }
      const stableTop = Math.max(state.lastTop, scroller.scrollTop);
      state.freezeTop = Math.max(state.freezeTop, stableTop);
      state.freezeUntil = Math.max(state.freezeUntil, now + 450);
      requestHoverScrollFreezeFrame(scroller);
      queueHoverScrollFreezeChecks(scroller);
    };

    const clearHoverScrollFreeze = (scroller) => {
      const state = hoverScrollStateFor(scroller);
      state.freezeUntil = 0;
      state.freezeTop = scroller.scrollTop;
      state.lastTop = scroller.scrollTop;
    };

    const allowProgrammaticScroll = (scroller, targetTop, duration = 900) => {
      const state = hoverScrollStateFor(scroller);
      if (targetTop < scroller.scrollTop - 1) {
        state.freezeUntil = 0;
        state.freezeTop = targetTop;
      }
      state.programmaticTarget = targetTop;
      state.programmaticUntil = performance.now() + duration;
    };

    const patchedScrollIntoView = function (...args) {
      if (isSlashMenuRow(this) && performance.now() > slashRowScrollAllowedUntil) {
        return;
      }
      return nativeScrollIntoView.apply(this, args);
    };

    const looksLikeSlashPanel = (node) => {
      if (!(node instanceof HTMLElement)) return false;
      if (node.hasAttribute(MENU_ATTR)) return true;
      if (/^No commands$/i.test(normText(node))) return true;
      const scroller = node.querySelector(".vertical-scroll-fade-mask");
      return (
        scroller instanceof HTMLElement &&
        node.querySelector('[data-list-navigation-item="true"]')
      );
    };

    const isOverlaySlashActive = (overlay) =>
      isSlashQueryActive() ||
      Array.from(overlay.children).some((child) => looksLikeSlashPanel(child));

    const markOverlayNoise = (overlay) => {
      const active = isOverlaySlashActive(overlay);
      Array.from(overlay.children).forEach((child) => {
        if (!(child instanceof HTMLElement)) return;
        if (active && !looksLikeSlashPanel(child) && isOverlayNoise(child)) {
          child.setAttribute(OVERLAY_NOISE_ATTR, "true");
        } else {
          child.removeAttribute(OVERLAY_NOISE_ATTR);
        }
      });
    };

    const pruneOverlayNoise = (overlay) => {
      if (!isOverlaySlashActive(overlay)) return;
      Array.from(overlay.children).forEach((child) => {
        if (!(child instanceof HTMLElement)) return;
        if (looksLikeSlashPanel(child) || !isOverlayNoise(child)) return;
        child.remove();
      });
    };

    const pruneMenuNoise = (menu) => {
      menu.querySelectorAll(NAV_NOISE_SELECTOR).forEach((node) => node.remove());
    };

    const pruneHomeContentNoise = () => {
      document
        .querySelectorAll(
          [
            '[class*="[container-name:home-main-content]"] [data-codexpp="nav-group"]',
            '[class*="[container-name:home-main-content]"] [data-codexpp="pages-group"]',
            '[class*="[container-name:home-main-content]"] [data-codexpp="nav-config"]',
            '[class*="[container-name:home-main-content]"] [data-codexpp="nav-tweaks"]',
            '[class*="[container-name:home-main-content]"] [data-codexpp^="nav-tweak"]',
            '[class*="[container-name:home-main-content]"] [data-codexpp^="nav-page-"]',
          ].join(", "),
        )
        .forEach((node) => node.remove());
    };

    const shouldPruneHomeContentNoise = () =>
      isSlashQueryActive() ||
      !!document.querySelector(
        '[data-composer-overlay-floating-ui="true"], [data-codexpp-slash-menu="true"]',
      );

    const scheduleHomeContentPrune = () => {
      if (homePruneFrame) return;
      homePruneFrame = requestAnimationFrame(() => {
        homePruneFrame = 0;
        if (shouldPruneHomeContentNoise()) pruneHomeContentNoise();
      });
    };

    const hardPruneNoise = () => {
      try {
        pruneHomeContentNoise();
        document
          .querySelectorAll(`[${MENU_ATTR}="true"]`)
          .forEach((menu) => {
            if (menu instanceof HTMLElement) pruneMenuNoise(menu);
          });
      } catch {
        // Ignore transient DOM shapes while Codex is replacing the slash panel.
      }
    };

    const scheduleHardPruneNoise = () => {
      if (hardPruneTimer || disposed) return;
      hardPruneTimer = window.setTimeout(() => {
        hardPruneTimer = 0;
        if (disposed || !shouldPruneHomeContentNoise()) return;
        observer?.disconnect();
        hardPruneNoise();
        requestAnimationFrame(() => {
          if (!disposed) {
            observer?.observe(document.body, OBSERVER_OPTIONS);
            scheduleScan();
          }
        });
      }, 60);
    };

    const sectionKey = (title) =>
      String(title || "General")
        .replace(/\s+/g, "-")
        .replace(/[^a-z0-9-]/gi, "")
        .toLowerCase() || "general";

    const sectionColor = (key, index) => {
      const known = {
        favorites: "#f4c95d",
        general: "#8ab4ff",
        skills: "#7dd3a8",
        mcp: "#f0b86a",
        tools: "#c4a7ff",
      };
      return known[key] || ["#8ab4ff", "#7dd3a8", "#f0b86a", "#c4a7ff"][index % 4];
    };

    const sectionIconSvg = (key) => {
      if (key === "favorites") {
        return (
          '<svg viewBox="0 0 20 20" fill="none" aria-hidden="true">' +
          '<path d="m10 2.75 2.14 4.35 4.8.7-3.47 3.38.82 4.77L10 13.7l-4.29 2.25.82-4.77L3.06 7.8l4.8-.7L10 2.75Z" fill="currentColor"/>' +
          "</svg>"
        );
      }
      if (key === "skills") {
        return (
          '<svg viewBox="0 0 20 20" fill="none" aria-hidden="true">' +
          '<path d="M10 2.25 16.5 6v8L10 17.75 3.5 14V6L10 2.25Zm0 1.5L5.1 6.58 10 9.42l4.9-2.84L10 3.75Zm-5.2 4v5.5l4.55 2.62v-5.5L4.8 7.75Zm10.4 0-4.55 2.62v5.5l4.55-2.62v-5.5Z" fill="currentColor"/>' +
          "</svg>"
        );
      }
      return (
        '<svg viewBox="0 0 20 20" fill="none" aria-hidden="true">' +
        '<path d="M4.25 5.25h11.5M4.25 10h11.5M4.25 14.75h11.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>' +
        "</svg>"
      );
    };

    const starIconSvg = (filled) =>
      filled
        ? '<svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="m10 2.75 2.14 4.35 4.8.7-3.47 3.38.82 4.77L10 13.7l-4.29 2.25.82-4.77L3.06 7.8l4.8-.7L10 2.75Z" fill="currentColor"/></svg>'
        : '<svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="m10 3.5 1.85 3.75 4.14.6-3 2.92.71 4.12L10 12.94l-3.7 1.95.71-4.12-3-2.92 4.14-.6L10 3.5Z" stroke="currentColor" stroke-linejoin="round"/></svg>';

    const readFavorites = () => {
      try {
        const raw = window.localStorage?.getItem(FAVORITES_STORAGE_KEY);
        const values = JSON.parse(raw || "[]");
        return new Set(Array.isArray(values) ? values.filter(Boolean) : []);
      } catch {
        return new Set();
      }
    };

    const writeFavorites = (favorites) => {
      try {
        window.localStorage?.setItem(
          FAVORITES_STORAGE_KEY,
          JSON.stringify(Array.from(favorites).sort()),
        );
      } catch {
        // Ignore storage failures; the row controls still update for this render.
      }
    };

    const rowFavoriteKey = (button, fallbackSectionKey) => {
      const section = fallbackSectionKey || button.getAttribute(SECTION_ATTR) || "general";
      const text = normText(button)
        .replace(/\s+/g, " ")
        .trim()
        .toLowerCase();
      return text ? `${section}:${text}` : "";
    };

    const isSlashSearchActive = () =>
      Array.from(document.querySelectorAll('.ProseMirror[contenteditable="true"]')).some(
        (editor) => {
          if (!(editor instanceof HTMLElement)) return false;
          const text = normText(editor);
          return text.startsWith("/") && text.length > 1;
        },
      );

    const refreshFavoriteViews = () => {
      document
        .querySelectorAll(`[${MENU_ATTR}="true"] .vertical-scroll-fade-mask`)
        .forEach((scroller) => {
          if (!(scroller instanceof HTMLElement)) return;
          syncFavoriteControls(scroller);
          syncFavoritesSection(scroller);
          const sections = groupSections(scroller);
          const topbar = scroller.previousElementSibling;
          if (topbar instanceof HTMLElement) renderTopbarIcons(topbar, sections);
          updateTopbar(scroller, sections);
        });
    };

    const toggleFavorite = (key) => {
      if (!key) return;
      const favorites = readFavorites();
      if (favorites.has(key)) favorites.delete(key);
      else favorites.add(key);
      writeFavorites(favorites);
      refreshFavoriteViews();
      scheduleScan();
    };

    const stripNativeCommandState = (row) => {
      if (!(row instanceof HTMLElement)) return;
      const stripNode = (node) => {
        if (!(node instanceof HTMLElement)) return;
        node.removeAttribute(FAVORITE_DUPLICATE_HIDDEN_ATTR);
        for (const attr of Array.from(node.attributes)) {
          if (
            attr.name === "cmdk-item" ||
            attr.name === "data-value" ||
            (attr.name.startsWith("data-codexpp-") &&
              !attr.name.startsWith("data-codexpp-slash-"))
          ) {
            node.removeAttribute(attr.name);
          }
        }
      };
      stripNode(row);
      row.querySelectorAll("*").forEach(stripNode);
    };

    const ensureFavoriteControl = (button, key, favorites = readFavorites()) => {
      if (!key) return;
      button.setAttribute(FAVORITE_KEY_ATTR, key);
      const inner = button.firstElementChild instanceof HTMLElement ? button.firstElementChild : button;
      let control = button.querySelector(`:scope .${FAVORITE_BUTTON_CLASS}`);
      if (!(control instanceof HTMLElement)) {
        control = document.createElement("span");
        control.setAttribute("role", "button");
        control.setAttribute("tabindex", "-1");
        control.className = FAVORITE_BUTTON_CLASS;
        control.addEventListener("pointerdown", (event) => {
          event.preventDefault();
          event.stopPropagation();
        });
        control.addEventListener("mousedown", (event) => {
          event.preventDefault();
          event.stopPropagation();
        });
        control.addEventListener("pointerup", (event) => {
          event.preventDefault();
          event.stopPropagation();
          toggleFavorite(button.getAttribute(FAVORITE_KEY_ATTR) || key);
        });
        control.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
        });
        const shortcut = inner.querySelector("span.ml-auto");
        if (shortcut instanceof HTMLElement) inner.insertBefore(control, shortcut);
        else inner.appendChild(control);
      }
      const active = favorites.has(key);
      control.dataset.favorite = active ? "true" : "false";
      control.setAttribute("aria-label", active ? "Remove from favorites" : "Add to favorites");
      control.innerHTML = starIconSvg(active);
    };

    const unwrapSkillRow = (button) => {
      const copy = button.querySelector(`.${SKILL_COPY_CLASS}`);
      if (!copy || !copy.parentElement) return;
      while (copy.firstChild) copy.parentElement.insertBefore(copy.firstChild, copy);
      copy.remove();
    };

    const wrapSkillRow = (button) => {
      const inner = button.firstElementChild;
      if (!(inner instanceof HTMLElement)) return;
      if (inner.querySelector(`.${SKILL_COPY_CLASS}`)) return;
      const children = Array.from(inner.children);
      const title = children.find(
        (node) =>
          node instanceof HTMLElement &&
          node.tagName === "DIV" &&
          normText(node).length > 0,
      );
      const description = children.find(
        (node) =>
          node instanceof HTMLElement &&
          node.tagName === "SPAN" &&
          String(node.className).includes("text-token-description-foreground"),
      );
      if (!title || !description) return;
      const copy = document.createElement("div");
      copy.className = SKILL_COPY_CLASS;
      inner.insertBefore(copy, title);
      copy.appendChild(title);
      copy.appendChild(description);
    };

    const sourceCommandRows = (scroller) =>
      Array.from(scroller.querySelectorAll('[data-list-navigation-item="true"]')).filter(
        (row) =>
          row instanceof HTMLElement &&
          !row.closest(`[${FAVORITES_GROUP_ATTR}="true"]`) &&
          !row.hasAttribute(FAVORITE_CLONE_ATTR),
      );

    const syncSectionVisibility = (scroller) => {
      Array.from(scroller.children).forEach((group) => {
        if (!(group instanceof HTMLElement) || group.hasAttribute(TOPBAR_ATTR)) return;
        const rows = Array.from(
          group.querySelectorAll('[data-list-navigation-item="true"]'),
        ).filter((row) => row instanceof HTMLElement);
        const hasVisibleRows = rows.some(
          (row) => !row.hasAttribute(FAVORITE_DUPLICATE_HIDDEN_ATTR),
        );
        group.setAttribute(SECTION_EMPTY_ATTR, hasVisibleRows ? "false" : "true");
      });
    };

    const syncFavoriteSourceVisibility = (scroller, favoriteKeys = new Set()) => {
      const hideDuplicates = isSlashSearchActive() && favoriteKeys.size > 0;
      let hiddenSelectedKey = "";
      sourceCommandRows(scroller).forEach((row) => {
        const key = row.getAttribute(FAVORITE_KEY_ATTR) || rowFavoriteKey(row);
        if (hideDuplicates && key && favoriteKeys.has(key)) {
          if (row.getAttribute("aria-selected") === "true") hiddenSelectedKey = key;
          row.setAttribute(FAVORITE_DUPLICATE_HIDDEN_ATTR, "true");
        } else {
          row.removeAttribute(FAVORITE_DUPLICATE_HIDDEN_ATTR);
        }
      });
      syncSectionVisibility(scroller);
      if (!hiddenSelectedKey) return;
      const favorite = favoriteRows(scroller).find(
        (row) => row.getAttribute(FAVORITE_KEY_ATTR) === hiddenSelectedKey,
      );
      if (favorite instanceof HTMLElement) selectNavigationRow(scroller, favorite);
    };

    const syncFavoriteControls = (scroller) => {
      const favorites = readFavorites();
      sourceCommandRows(scroller).forEach((row) => {
        const key = row.getAttribute(FAVORITE_KEY_ATTR) || rowFavoriteKey(row);
        ensureFavoriteControl(row, key, favorites);
      });
      scroller
        .querySelectorAll(`[${FAVORITE_CLONE_ATTR}="true"]`)
        .forEach((row) => {
          if (!(row instanceof HTMLElement)) return;
          stripNativeCommandState(row);
          const key = row.getAttribute(FAVORITE_KEY_ATTR) || rowFavoriteKey(row, "favorites");
          ensureFavoriteControl(row, key, favorites);
        });
    };

    const removeFavoriteSection = (scroller) => {
      scroller
        .querySelectorAll(`:scope > [${FAVORITES_GROUP_ATTR}="true"]`)
        .forEach((group) => group.remove());
      syncFavoriteSourceVisibility(scroller);
      syncSectionVisibility(scroller);
      delete scroller.dataset.codexppSlashFavoriteSelectionReady;
      delete scroller.dataset.codexppSlashFavoriteSelectionTouched;
    };

    const syncFavoritesSection = (scroller) => {
      const favorites = readFavorites();
      const rowsByKey = new Map();
      sourceCommandRows(scroller).forEach((row) => {
        const key = row.getAttribute(FAVORITE_KEY_ATTR) || rowFavoriteKey(row);
        if (key && favorites.has(key) && !rowsByKey.has(key)) rowsByKey.set(key, row);
      });
      const entries = Array.from(rowsByKey.entries());
      if (entries.length === 0) {
        removeFavoriteSection(scroller);
        return;
      }
      const entryKeys = new Set(entries.map(([key]) => key));
      syncFavoriteSourceVisibility(scroller, entryKeys);

      let group = scroller.querySelector(`:scope > [${FAVORITES_GROUP_ATTR}="true"]`);
      if (!(group instanceof HTMLElement)) {
        group = document.createElement("div");
        group.setAttribute(FAVORITES_GROUP_ATTR, "true");
        scroller.insertBefore(group, scroller.firstElementChild);
      } else if (group !== scroller.firstElementChild) {
        scroller.insertBefore(group, scroller.firstElementChild);
      }

      const signature = entries.map(([key]) => key).join("|");
      if (group.dataset.signature === signature) return;
      group.dataset.signature = signature;
      delete scroller.dataset.codexppSlashFavoriteSelectionReady;
      delete scroller.dataset.codexppSlashFavoriteSelectionTouched;
      group.replaceChildren();

      const header = document.createElement("div");
      header.className = "sticky top-0";
      header.textContent = "Favorites";
      group.appendChild(header);

      entries.forEach(([key, sourceRow]) => {
        const clone = sourceRow.cloneNode(true);
        if (!(clone instanceof HTMLElement)) return;
        clone.setAttribute(FAVORITE_CLONE_ATTR, "true");
        clone.setAttribute(FAVORITE_KEY_ATTR, key);
        clone.setAttribute(
          FAVORITE_SOURCE_SECTION_ATTR,
          sourceRow.getAttribute(SECTION_ATTR) || "",
        );
        stripNativeCommandState(clone);
        clone.removeAttribute("aria-selected");
        clone.querySelectorAll(`.${FAVORITE_BUTTON_CLASS}`).forEach((node) => node.remove());
        ["pointermove", "mousemove", "mouseover"].forEach((type) => {
          clone.addEventListener(type, (event) => {
            event.stopPropagation();
          });
        });
        clone.addEventListener("click", (event) => {
          if (event.target instanceof HTMLElement && event.target.closest(`.${FAVORITE_BUTTON_CLASS}`)) {
            return;
          }
          event.preventDefault();
          event.stopPropagation();
          sourceRow.click();
        });
        clone.addEventListener("keydown", (event) => {
          if (event.key !== "Enter" && event.key !== " ") return;
          event.preventDefault();
          event.stopPropagation();
          sourceRow.click();
        });
        group.appendChild(clone);
      });
    };

    const navigationRows = (scroller) =>
      Array.from(scroller.querySelectorAll('[data-list-navigation-item="true"]')).filter(
        (row) => row instanceof HTMLElement && row.offsetParent !== null,
      );

    const favoriteRows = (scroller) =>
      Array.from(
        scroller.querySelectorAll(
          `[${FAVORITES_GROUP_ATTR}="true"] [data-list-navigation-item="true"]`,
        ),
      ).filter((row) => row instanceof HTMLElement && row.offsetParent !== null);

    const selectedNavigationRow = (scroller) =>
      navigationRows(scroller).find(
        (row) => row.getAttribute("aria-selected") === "true",
      );

    const reconcileFavoriteSelection = (scroller) => {
      const rows = navigationRows(scroller);
      const selected = rows.filter((row) => row.getAttribute("aria-selected") === "true");
      if (selected.length <= 1) return;
      const favoriteSelected =
        selected.find((row) => row.hasAttribute(FAVORITE_CLONE_ATTR)) || selected[0];
      rows.forEach((row) =>
        row.setAttribute("aria-selected", row === favoriteSelected ? "true" : "false"),
      );
    };

    const selectNavigationRow = (scroller, row, options = {}) => {
      if (!(row instanceof HTMLElement)) return;
      const menu = scroller.closest(`[${MENU_ATTR}="true"]`);
      if (options.inputMode !== false) {
        menu?.setAttribute(INPUT_MODE_ATTR, options.inputMode || "keyboard");
      }
      navigationRows(scroller).forEach((item) =>
        item.setAttribute("aria-selected", item === row ? "true" : "false"),
      );
      allowSlashRowScrollIntoView();
      row.scrollIntoView({ block: "nearest" });
      updateTopbar(scroller);
    };

    const ensureInitialFavoriteSelection = (scroller) => {
      if (scroller.dataset.codexppSlashFavoriteSelectionReady === "true") return;
      if (scroller.closest(`[${MENU_ATTR}="true"]`)?.hasAttribute(HOVER_SUPPRESS_ATTR)) return;
      const firstFavorite = favoriteRows(scroller)[0];
      if (!(firstFavorite instanceof HTMLElement)) return;
      selectNavigationRow(scroller, firstFavorite, { inputMode: false });
      scroller.dataset.codexppSlashFavoriteSelectionReady = "true";
      const keepFavoriteSelected = () => {
        if (!scroller.isConnected) return;
        if (scroller.closest(`[${MENU_ATTR}="true"]`)?.hasAttribute(HOVER_SUPPRESS_ATTR)) return;
        if (scroller.dataset.codexppSlashFavoriteSelectionTouched === "true") return;
        const nextFirstFavorite = favoriteRows(scroller)[0];
        if (!(nextFirstFavorite instanceof HTMLElement)) return;
        if (selectedNavigationRow(scroller) !== nextFirstFavorite) {
          selectNavigationRow(scroller, nextFirstFavorite);
        }
      };
      requestAnimationFrame(keepFavoriteSelected);
      window.setTimeout(keepFavoriteSelected, 80);
    };

    const handleFavoriteNavigationKey = (event, scroller) => {
      const rows = navigationRows(scroller);
      const favs = favoriteRows(scroller);
      if (rows.length === 0 || favs.length === 0) return false;

      if (event.key === "Enter") {
        const selected = selectedNavigationRow(scroller);
        if (!(selected instanceof HTMLElement)) return false;
        scroller.dataset.codexppSlashFavoriteSelectionTouched = "true";
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation?.();
        selected.click();
        return true;
      }

      if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return false;
      scroller.dataset.codexppSlashFavoriteSelectionTouched = "true";
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation?.();

      const selected = selectedNavigationRow(scroller);
      const currentIndex = selected instanceof HTMLElement ? rows.indexOf(selected) : -1;
      const fallbackIndex = event.key === "ArrowDown" ? 0 : rows.length - 1;
      const nextIndex =
        currentIndex < 0
          ? fallbackIndex
          : event.key === "ArrowDown"
            ? Math.min(rows.length - 1, currentIndex + 1)
            : Math.max(0, currentIndex - 1);
      selectNavigationRow(scroller, rows[nextIndex]);
      return true;
    };

    const cleanupMenu = (menu) => {
      const overlay = menu.closest('[data-composer-overlay-floating-ui="true"]');
      const scroller = menu.querySelector(".vertical-scroll-fade-mask");
      if (scroller instanceof HTMLElement) {
        const scrollHandler = scrollHandlers.get(scroller);
        if (scrollHandler) {
          scroller.removeEventListener("scroll", scrollHandler);
          scrollHandlers.delete(scroller);
        }
        const animation = scrollAnimations.get(scroller);
        if (animation) {
          cancelScrollAnimation(scroller);
        }
        const pointerHandler = pointerHandlers.get(scroller);
        if (pointerHandler) {
          scroller.removeEventListener("pointermove", pointerHandler);
          scroller.removeEventListener("pointerdown", pointerHandler);
          pointerHandlers.delete(scroller);
        }
        const wheelHandler = wheelHandlers.get(scroller);
        if (wheelHandler) {
          scroller.removeEventListener("wheel", wheelHandler);
          wheelHandlers.delete(scroller);
        }
        const hoverGuardHandler = hoverGuardHandlers.get(scroller);
        if (hoverGuardHandler) {
          HOVER_GUARD_EVENTS.forEach((type) =>
            scroller.removeEventListener(type, hoverGuardHandler, true),
          );
          hoverGuardHandlers.delete(scroller);
        }
      }
      if (scroller instanceof HTMLElement) removeFavoriteSection(scroller);
      menu.removeAttribute(MENU_ATTR);
      menu.removeAttribute(INPUT_MODE_ATTR);
      menu.removeAttribute(PROGRAM_SCROLL_ATTR);
      menu.removeAttribute(HOVER_SUPPRESS_ATTR);
      menu.querySelectorAll(`[${TOPBAR_ATTR}]`).forEach((node) => node.remove());
      menu.querySelectorAll(`.${FAVORITE_BUTTON_CLASS}`).forEach((node) => node.remove());
      menu.querySelectorAll(`.${SKILL_COPY_CLASS}`).forEach((copy) => {
        if (!(copy instanceof HTMLElement) || !copy.parentElement) return;
        while (copy.firstChild) copy.parentElement.insertBefore(copy.firstChild, copy);
        copy.remove();
      });
      menu
        .querySelectorAll(
          `[${FAVORITE_KEY_ATTR}], [${FAVORITE_CLONE_ATTR}], [${FAVORITE_SOURCE_SECTION_ATTR}], [${FAVORITE_DUPLICATE_HIDDEN_ATTR}]`,
        )
        .forEach((node) => {
          node.removeAttribute(FAVORITE_KEY_ATTR);
          node.removeAttribute(FAVORITE_CLONE_ATTR);
          node.removeAttribute(FAVORITE_SOURCE_SECTION_ATTR);
          node.removeAttribute(FAVORITE_DUPLICATE_HIDDEN_ATTR);
        });
      menu
        .querySelectorAll(`[${SECTION_ATTR}]`)
        .forEach((node) => {
          node.removeAttribute(SECTION_ATTR);
          node.removeAttribute(SECTION_EMPTY_ATTR);
        });
      if (overlay && !overlay.querySelector(`[${MENU_ATTR}="true"]`)) {
        overlay.removeAttribute(OVERLAY_ATTR);
        markOverlayNoise(overlay);
      }
    };

    const isSlashMenu = (menu) => {
      if (!menu.closest('[data-composer-overlay-floating-ui="true"]')) return false;
      if (isEmptySlashMenu(menu)) return true;
      const scroller = menu.querySelector(".vertical-scroll-fade-mask");
      if (!(scroller instanceof HTMLElement)) return false;
      if (
        isSlashQueryActive() &&
        menu.querySelectorAll('[data-list-navigation-item="true"]').length > 0
      ) {
        return true;
      }
      return Array.from(scroller.children).some((group) => {
        if (!(group instanceof HTMLElement)) return false;
        const rows = group.querySelectorAll('[data-list-navigation-item="true"]');
        if (rows.length < 2) return false;
        const header = group.querySelector(":scope > .sticky.top-0");
        const headerText = normText(header);
        if (!/^Skills\b/i.test(headerText)) return false;
        return Array.from(rows).some((row) =>
          row.querySelector(
            '.text-token-description-foreground, span[class*="text-token-description-foreground"]',
          ),
        );
      });
    };

    const isSlashQueryActive = () =>
      Array.from(document.querySelectorAll('.ProseMirror[contenteditable="true"]')).some(
        (editor) => editor instanceof HTMLElement && normText(editor).startsWith("/"),
      );

    const isEmptySlashMenu = (menu) =>
      isSlashQueryActive() &&
      menu.querySelectorAll('[data-list-navigation-item="true"]').length === 0 &&
      /^No commands$/i.test(normText(menu));

    const buildTopbar = (menu, scroller) => {
      let topbar = menu.querySelector(`:scope > [${TOPBAR_ATTR}="true"]`);
      if (topbar instanceof HTMLElement) return topbar;
      topbar = document.createElement("div");
      topbar.setAttribute(TOPBAR_ATTR, "true");
      topbar.innerHTML =
        `<div ${SECTION_TITLE_ATTR}="true">General</div>` +
        '<div class="codexpp-slash-section-icons"></div>';
      menu.insertBefore(topbar, scroller);
      return topbar;
    };

    const setTopbarTitle = (title, text) => {
      if (!(title instanceof HTMLElement) || title.textContent === text) return;
      title.textContent = text;
      title.setAttribute("data-changing", "true");
      const previousTimer = titleTimers.get(title);
      if (previousTimer) window.clearTimeout(previousTimer);
      const timer = window.setTimeout(() => {
        title.removeAttribute("data-changing");
        titleTimers.delete(title);
      }, 190);
      titleTimers.set(title, timer);
    };

    const groupSections = (scroller) =>
      Array.from(scroller.children)
        .filter(
          (node) =>
            node instanceof HTMLElement &&
            !node.hasAttribute(TOPBAR_ATTR) &&
            node.getAttribute(SECTION_EMPTY_ATTR) !== "true" &&
            node.querySelector('[data-list-navigation-item="true"]'),
        )
        .map((group, index) => {
          const header = group.querySelector(":scope > .sticky.top-0");
          const isFavorites = group.hasAttribute(FAVORITES_GROUP_ATTR);
          const title = isFavorites ? "Favorites" : normText(header) || "General";
          const key = sectionKey(title);
          const color = sectionColor(key, index);
          const favorites = readFavorites();
          group.setAttribute(SECTION_ATTR, key);
          group.dataset.codexppSlashSectionTitle = title;
          group.style.setProperty("--codexpp-section-color", color);
          group.querySelectorAll('[data-list-navigation-item="true"]').forEach((button) => {
            if (!(button instanceof HTMLElement)) return;
            if (button.hasAttribute(FAVORITE_CLONE_ATTR)) stripNativeCommandState(button);
            button.setAttribute(SECTION_ATTR, key);
            button.style.setProperty("--codexpp-section-color", color);
            const visualKey =
              button.getAttribute(FAVORITE_SOURCE_SECTION_ATTR) ||
              button.getAttribute(SECTION_ATTR) ||
              key;
            if (visualKey === "skills") wrapSkillRow(button);
            else unwrapSkillRow(button);
            const favoriteKey =
              button.getAttribute(FAVORITE_KEY_ATTR) || rowFavoriteKey(button, key);
            ensureFavoriteControl(button, favoriteKey, favorites);
          });
          return { group, title, key, color };
        });

    const renderTopbarIcons = (topbar, sections) => {
      const icons = topbar.querySelector(".codexpp-slash-section-icons");
      if (!(icons instanceof HTMLElement)) return;
      const signature = sections.map((s) => `${s.key}:${s.title}`).join("|");
      if (icons.dataset.signature === signature) return;
      icons.dataset.signature = signature;
      icons.replaceChildren();
      for (const section of sections) {
        const button = document.createElement("button");
        button.type = "button";
        button.setAttribute(SECTION_ICON_ATTR, section.key);
        button.setAttribute("aria-label", section.title);
        button.style.setProperty("--codexpp-section-color", section.color);
        button.innerHTML = sectionIconSvg(section.key);
        button.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          const scroller = topbar.nextElementSibling;
          if (!(scroller instanceof HTMLElement)) return;
          scrollToSection(scroller, section, sections);
          updateTopbar(scroller, sections);
        });
        icons.appendChild(button);
      }
    };

    const scrollToSection = (scroller, section, sections = groupSections(scroller)) => {
      const menu = scroller.closest(`[${MENU_ATTR}="true"]`);
      menu?.setAttribute(INPUT_MODE_ATTR, "keyboard");
      menu?.setAttribute(PROGRAM_SCROLL_ATTR, "true");
      if (menu instanceof HTMLElement) suppressHoverUntilPointerMoves(menu);
      scroller.dataset.codexppSlashFavoriteSelectionTouched = "true";
      scroller.scrollLeft = 0;
      const targetTop = sectionTop(scroller, section.group);
      const adjustedTop =
        sections.indexOf(section) > 0
          ? Math.min(targetTop + 1, scroller.scrollHeight - scroller.clientHeight)
          : targetTop;
      allowProgrammaticScroll(scroller, adjustedTop);
      const topbar = scroller.previousElementSibling;
      if (topbar instanceof HTMLElement) {
        topbar.dataset.forcedActiveSection = section.key;
      }
      updateTopbar(scroller, sections);
      animateScrollTop(
        scroller,
        adjustedTop,
        () => updateTopbar(scroller, sections),
        () => {
          menu?.removeAttribute(PROGRAM_SCROLL_ATTR);
          if (topbar instanceof HTMLElement) delete topbar.dataset.forcedActiveSection;
          updateTopbar(scroller, sections);
        },
      );
      updateTopbar(scroller, sections);
    };

    const sectionTop = (scroller, group) => {
      const target =
        scroller.scrollTop +
        group.getBoundingClientRect().top -
        scroller.getBoundingClientRect().top;
      return Math.max(0, Math.min(target, scroller.scrollHeight - scroller.clientHeight));
    };

    const cancelScrollAnimation = (scroller) => {
      const animation = scrollAnimations.get(scroller);
      if (!animation) return;
      cancelAnimationFrame(animation.frame);
      window.clearTimeout(animation.timer);
      scrollAnimations.delete(scroller);
    };

    const animateScrollTop = (scroller, targetTop, onStep, onDone) => {
      cancelScrollAnimation(scroller);
      const startTop = scroller.scrollTop;
      const delta = targetTop - startTop;
      if (Math.abs(delta) < 1) {
        scroller.scrollTop = targetTop;
        onStep?.();
        onDone?.();
        return;
      }
      const start = performance.now();
      const duration = 260;
      const scheduleTick = () => {
        const animation = { frame: 0, timer: 0 };
        const run = (now = performance.now()) => {
          if (scrollAnimations.get(scroller) !== animation) return;
          cancelAnimationFrame(animation.frame);
          window.clearTimeout(animation.timer);
          tick(now);
        };
        animation.frame = requestAnimationFrame(run);
        animation.timer = window.setTimeout(() => run(performance.now()), 16);
        scrollAnimations.set(scroller, animation);
      };
      const tick = (now) => {
        const progress = Math.min(1, (now - start) / duration);
        const eased = 1 - Math.pow(1 - progress, 3);
        scroller.scrollTop = startTop + delta * eased;
        onStep?.();
        if (progress < 1) {
          scheduleTick();
        } else {
          scrollAnimations.delete(scroller);
          onDone?.();
        }
      };
      scheduleTick();
    };

    const updateTopbar = (scroller, sections = groupSections(scroller)) => {
      const topbar = scroller.previousElementSibling;
      if (!(topbar instanceof HTMLElement) || !topbar.hasAttribute(TOPBAR_ATTR)) return;
      if (!(topbar instanceof HTMLElement) || sections.length === 0) return;
      const threshold = scroller.scrollTop + 4;
      let active = sections[0];
      for (const section of sections) {
        if (sectionTop(scroller, section.group) <= threshold) active = section;
      }
      if (topbar.dataset.forcedActiveSection) {
        active =
          sections.find((section) => section.key === topbar.dataset.forcedActiveSection) ||
          active;
      }
      const title = topbar.querySelector(`[${SECTION_TITLE_ATTR}]`);
      setTopbarTitle(title, active.title);
      topbar.dataset.activeSection = active.key;
      topbar.style.setProperty("--codexpp-section-color", active.color);
      topbar
        .querySelectorAll(`[${SECTION_ICON_ATTR}]`)
        .forEach((button) =>
          button.setAttribute(
            "data-active",
            button.getAttribute(SECTION_ICON_ATTR) === active.key ? "true" : "false",
          ),
        );
    };

    const enhanceMenu = (menu) => {
      if (!isSlashMenu(menu)) {
        cleanupMenu(menu);
        return;
      }
      menu.setAttribute(MENU_ATTR, "true");
      menu.closest('[data-composer-overlay-floating-ui="true"]')?.setAttribute(OVERLAY_ATTR, "true");
      pruneMenuNoise(menu);
      if (isEmptySlashMenu(menu)) {
        menu.querySelectorAll(`[${TOPBAR_ATTR}]`).forEach((node) => node.remove());
        return;
      }
      const scroller = menu.querySelector(".vertical-scroll-fade-mask");
      if (!(scroller instanceof HTMLElement)) {
        menu.querySelectorAll(`[${TOPBAR_ATTR}]`).forEach((node) => node.remove());
        return;
      }
      scroller.scrollLeft = 0;
      const topbar = buildTopbar(menu, scroller);
      groupSections(scroller);
      syncFavoritesSection(scroller);
      const sections = groupSections(scroller);
      renderTopbarIcons(topbar, sections);
      updateTopbar(scroller, sections);
      ensureInitialFavoriteSelection(scroller);
      reconcileFavoriteSelection(scroller);
      if (!scrollHandlers.has(scroller)) {
        const handler = () => {
          enforceHoverScrollFreeze(scroller);
          updateTopbar(scroller);
        };
        scroller.addEventListener("scroll", handler, { passive: true });
        scrollHandlers.set(scroller, handler);
      }
      hoverScrollStateFor(scroller).lastTop = scroller.scrollTop;
      if (!pointerHandlers.has(scroller)) {
        const handler = (event) => {
          if (menu.hasAttribute(PROGRAM_SCROLL_ATTR)) return;
          if (event.type === "pointermove") {
            if (!menu.hasAttribute(HOVER_SUPPRESS_ATTR)) {
              menu.setAttribute(INPUT_MODE_ATTR, "pointer");
            }
            return;
          }
          menu.setAttribute(INPUT_MODE_ATTR, "pointer");
        };
        scroller.addEventListener("pointermove", handler, { passive: true });
        scroller.addEventListener("pointerdown", handler, { passive: true });
        pointerHandlers.set(scroller, handler);
      }
      if (!wheelHandlers.has(scroller)) {
        const handler = () => clearHoverScrollFreeze(scroller);
        scroller.addEventListener("wheel", handler, { passive: true });
        wheelHandlers.set(scroller, handler);
      }
      if (!hoverGuardHandlers.has(scroller)) {
        const handler = (event) => {
          stopHoverSelectionEvent(menu, event);
        };
        HOVER_GUARD_EVENTS.forEach((type) => scroller.addEventListener(type, handler, true));
        hoverGuardHandlers.set(scroller, handler);
      }
    };

    const activeSlashMenu = () =>
      Array.from(document.querySelectorAll(`[${MENU_ATTR}="true"]`)).find(
        (menu) =>
          menu instanceof HTMLElement &&
          menu.isConnected &&
          menu.querySelector(".vertical-scroll-fade-mask"),
      );

    installDocumentHoverGuard();
    Element.prototype.scrollIntoView = patchedScrollIntoView;

    const keyDigit = (event) => {
      const key = String(event.key || "");
      if (/^[1-9]$/.test(key)) return Number(key);
      const code = String(event.code || "");
      const match = /^(?:Digit|Numpad)([1-9])$/.exec(code);
      return match ? Number(match[1]) : 0;
    };

    const onSectionShortcut = (event) => {
      const menu = activeSlashMenu();
      if (!(menu instanceof HTMLElement)) return;
      const scroller = menu.querySelector(".vertical-scroll-fade-mask");
      if (!(scroller instanceof HTMLElement)) return;

      if (handleFavoriteNavigationKey(event, scroller)) return;

      if (
        event.key === "ArrowDown" ||
        event.key === "ArrowUp" ||
        event.key === "Home" ||
        event.key === "End" ||
        event.key === "PageDown" ||
        event.key === "PageUp"
      ) {
        allowSlashRowScrollIntoView();
        menu.setAttribute(INPUT_MODE_ATTR, "keyboard");
        return;
      }

      if (!(event.metaKey || event.ctrlKey) || event.altKey || event.shiftKey) return;
      const digit = keyDigit(event);
      activateSectionByDigit(scroller, digit, event);
    };

    const onSectionShortcutBridge = (event) => {
      const menu = activeSlashMenu();
      if (!(menu instanceof HTMLElement)) return;
      const scroller = menu.querySelector(".vertical-scroll-fade-mask");
      if (!(scroller instanceof HTMLElement)) return;
      activateSectionByDigit(scroller, Number(event.detail?.digit) || 0, event);
    };

    const activateSectionByDigit = (scroller, digit, event) => {
      if (!digit) return;
      const sections = groupSections(scroller);
      const section = sections[digit - 1];
      if (!section) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation?.();
      scrollToSection(scroller, section, sections);
    };

    const scan = () => {
      scanFrame = 0;
      try {
        pruneHomeContentNoise();
      } catch {
        // Ignore transient DOM shapes while Codex is replacing the slash panel.
      }
      document
        .querySelectorAll('[data-composer-overlay-floating-ui="true"]')
        .forEach((overlay) => {
          if (!(overlay instanceof HTMLElement)) return;
          try {
            pruneOverlayNoise(overlay);
            markOverlayNoise(overlay);
          } catch {
            // Keep the observer alive if Codex swaps the overlay mid-scan.
          }
        });
      document
        .querySelectorAll('[data-composer-overlay-floating-ui="true"] > *')
        .forEach((menu) => {
          if (!(menu instanceof HTMLElement)) return;
          try {
            enhanceMenu(menu);
          } catch {
            // Keep scanning other candidates.
          }
        });
    };

    const scheduleScan = () => {
      if (scanFrame || scanTimer) return;
      const run = () => {
        if (scanFrame) cancelAnimationFrame(scanFrame);
        if (scanTimer) window.clearTimeout(scanTimer);
        scanFrame = 0;
        scanTimer = 0;
        scan();
      };
      scanFrame = requestAnimationFrame(run);
      scanTimer = window.setTimeout(run, 60);
    };

    const scheduleSlashWork = () => {
      scheduleHomeContentPrune();
      scheduleHardPruneNoise();
      scheduleScan();
    };

    scan();
    observer = new MutationObserver(scheduleSlashWork);
    observer.observe(document.body, OBSERVER_OPTIONS);
    document.addEventListener("input", scheduleSlashWork, true);
    document.addEventListener("keyup", scheduleSlashWork, true);
    window.addEventListener("codexpp-slash-section-shortcut", onSectionShortcutBridge);
    window.addEventListener("keydown", onSectionShortcut, true);
    document.addEventListener("keydown", onSectionShortcut, true);
    const activeSlashInterval = window.setInterval(() => {
      if (isSlashQueryActive()) scheduleSlashWork();
    }, 250);

    return () => {
      disposed = true;
      observer.disconnect();
      window.clearInterval(activeSlashInterval);
      if (scanFrame) cancelAnimationFrame(scanFrame);
      if (scanTimer) window.clearTimeout(scanTimer);
      if (homePruneFrame) cancelAnimationFrame(homePruneFrame);
      if (hardPruneTimer) window.clearTimeout(hardPruneTimer);
      document.removeEventListener("input", scheduleSlashWork, true);
      document.removeEventListener("keyup", scheduleSlashWork, true);
      window.removeEventListener("codexpp-slash-section-shortcut", onSectionShortcutBridge);
      window.removeEventListener("keydown", onSectionShortcut, true);
      document.removeEventListener("keydown", onSectionShortcut, true);
      for (const [scroller, handler] of scrollHandlers) {
        scroller.removeEventListener("scroll", handler);
      }
      scrollHandlers.clear();
      for (const [scroller, handler] of pointerHandlers) {
        scroller.removeEventListener("pointermove", handler);
        scroller.removeEventListener("pointerdown", handler);
      }
      pointerHandlers.clear();
      for (const [scroller, handler] of wheelHandlers) {
        scroller.removeEventListener("wheel", handler);
      }
      wheelHandlers.clear();
      for (const [scroller, handler] of hoverGuardHandlers) {
        HOVER_GUARD_EVENTS.forEach((type) =>
          scroller.removeEventListener(type, handler, true),
        );
      }
      hoverGuardHandlers.clear();
      if (documentHoverGuard) {
        HOVER_GUARD_EVENTS.forEach((type) =>
          window.removeEventListener(type, documentHoverGuard, true),
        );
        HOVER_GUARD_EVENTS.forEach((type) =>
          document.removeEventListener(type, documentHoverGuard, true),
        );
        documentHoverGuard = null;
      }
      if (Element.prototype.scrollIntoView === patchedScrollIntoView) {
        Element.prototype.scrollIntoView = nativeScrollIntoView;
      }
      for (const animation of scrollAnimations.values()) {
        cancelAnimationFrame(animation.frame);
        window.clearTimeout(animation.timer);
      }
      scrollAnimations.clear();
      for (const timer of titleTimers.values()) window.clearTimeout(timer);
      titleTimers.clear();
      document
        .querySelectorAll(`[${FAVORITES_GROUP_ATTR}]`)
        .forEach((node) => node.remove());
      document.querySelectorAll(`.${FAVORITE_BUTTON_CLASS}`).forEach((node) => node.remove());
      document.querySelectorAll(`.${SKILL_COPY_CLASS}`).forEach((copy) => {
        if (!(copy instanceof HTMLElement) || !copy.parentElement) return;
        while (copy.firstChild) copy.parentElement.insertBefore(copy.firstChild, copy);
        copy.remove();
      });
      document.querySelectorAll(`[${TOPBAR_ATTR}]`).forEach((node) => node.remove());
      document
        .querySelectorAll(`[${MENU_ATTR}]`)
        .forEach((node) => node.removeAttribute(MENU_ATTR));
      document
        .querySelectorAll(`[${INPUT_MODE_ATTR}]`)
        .forEach((node) => node.removeAttribute(INPUT_MODE_ATTR));
      document
        .querySelectorAll(`[${PROGRAM_SCROLL_ATTR}]`)
        .forEach((node) => node.removeAttribute(PROGRAM_SCROLL_ATTR));
      document
        .querySelectorAll(`[${HOVER_SUPPRESS_ATTR}]`)
        .forEach((node) => node.removeAttribute(HOVER_SUPPRESS_ATTR));
      document
        .querySelectorAll(`[${OVERLAY_ATTR}]`)
        .forEach((node) => node.removeAttribute(OVERLAY_ATTR));
      document
        .querySelectorAll(`[${OVERLAY_NOISE_ATTR}]`)
        .forEach((node) => node.removeAttribute(OVERLAY_NOISE_ATTR));
      document
        .querySelectorAll(`[${SECTION_ATTR}]`)
        .forEach((node) => {
          node.removeAttribute(SECTION_ATTR);
          node.removeAttribute(SECTION_EMPTY_ATTR);
        });
      document
        .querySelectorAll(
          `[${FAVORITE_KEY_ATTR}], [${FAVORITE_CLONE_ATTR}], [${FAVORITE_SOURCE_SECTION_ATTR}], [${FAVORITE_DUPLICATE_HIDDEN_ATTR}]`,
        )
        .forEach((node) => {
          node.removeAttribute(FAVORITE_KEY_ATTR);
          node.removeAttribute(FAVORITE_CLONE_ATTR);
          node.removeAttribute(FAVORITE_SOURCE_SECTION_ATTR);
          node.removeAttribute(FAVORITE_DUPLICATE_HIDDEN_ATTR);
        });
      style.remove();
    };
  },

  /**
   * Add a compact search field to the Settings sidebar and filter the
   * visible settings tabs in place. This is deliberately a tweak, not core
   * Codex++, because it is a reversible UI convenience layer.
   */
  "settings-search"(api) {
    const STYLE_ID = "codexpp-settings-search-style";
    const ROOT_ATTR = "data-codexpp-settings-search";
    const HIDDEN_ATTR = "data-codexpp-settings-search-hidden";
    const PREV_DISPLAY_ATTR = "codexppSettingsSearchPrevDisplay";
    const SIDEBAR_SELECTOR = ".window-fx-sidebar-surface.w-token-sidebar";

    document.getElementById(STYLE_ID)?.remove();
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      [${ROOT_ATTR}] {
        padding: 0.75rem 0 0.5rem;
      }

      [${ROOT_ATTR}] .codexpp-settings-search-box {
        position: relative;
        display: flex;
        align-items: center;
      }

      [${ROOT_ATTR}] svg {
        position: absolute;
        left: 0.625rem;
        height: 1rem;
        width: 1rem;
        color: var(--color-token-text-secondary);
        pointer-events: none;
      }

      [${ROOT_ATTR}] input {
        width: 100%;
        height: 2rem;
        min-width: 0;
        border-radius: var(--radius-md, 0.375rem);
        border: 1px solid color-mix(in srgb, currentColor 13%, transparent);
        background: color-mix(in srgb, currentColor 4%, transparent);
        color: var(--color-token-text-primary);
        font-size: 0.875rem;
        line-height: 1.25rem;
        padding: 0 0.625rem 0 2rem;
        outline: none;
      }

      [${ROOT_ATTR}] input::placeholder {
        color: var(--color-token-text-secondary);
      }

      [${ROOT_ATTR}] input:focus {
        border-color: color-mix(in srgb, currentColor 18%, transparent);
        box-shadow: none;
      }

      [${ROOT_ATTR}] .codexpp-settings-search-empty {
        display: none;
        padding-top: 1.25rem;
        color: var(--color-token-text-secondary);
        font-size: 0.75rem;
        line-height: 1rem;
        text-align: center;
      }

      [${ROOT_ATTR}][data-empty="true"] .codexpp-settings-search-empty {
        display: block;
      }

      [${ROOT_ATTR}] .codexpp-settings-search-results {
        display: none;
        flex-direction: column;
        gap: 0.125rem;
        padding-top: 0.375rem;
      }

      [${ROOT_ATTR}][data-has-results="true"] .codexpp-settings-search-results {
        display: flex;
      }

      [${ROOT_ATTR}] .codexpp-settings-search-result {
        display: flex;
        min-width: 0;
        width: 100%;
        align-items: center;
        justify-content: space-between;
        gap: 0.375rem;
        border-radius: var(--radius-md, 0.375rem);
        padding: 0.25rem 0.5rem;
        color: var(--color-token-text-secondary);
        font-size: 0.75rem;
        line-height: 1rem;
        text-align: left;
      }

      [${ROOT_ATTR}] .codexpp-settings-search-result:hover,
      [${ROOT_ATTR}] .codexpp-settings-search-result:focus-visible {
        background: color-mix(in srgb, currentColor 8%, transparent);
        color: var(--color-token-text-primary);
        outline: none;
      }

      [${ROOT_ATTR}] .codexpp-settings-search-result span {
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      [data-codexpp-settings-search-highlight="true"] {
        outline: 2px solid var(--color-token-focus-border, var(--color-token-border));
        outline-offset: 5px;
        border-radius: var(--radius-md, 0.375rem);
        transition:
          outline-color 220ms ease,
          outline-offset 220ms ease;
      }

      [data-codexpp-settings-search-highlight="fading"] {
        outline: 2px solid transparent;
        outline-offset: 9px;
        border-radius: var(--radius-md, 0.375rem);
        transition:
          outline-color 420ms ease,
          outline-offset 420ms ease;
      }
    `;
    document.head.appendChild(style);

    const root = document.createElement("div");
    root.setAttribute(ROOT_ATTR, "true");

    const box = document.createElement("div");
    box.className = "codexpp-settings-search-box";
    box.innerHTML =
      '<svg viewBox="0 0 20 20" fill="none" aria-hidden="true">' +
      '<path d="m14.5 14.5 3 3M8.5 15a6.5 6.5 0 1 1 0-13 6.5 6.5 0 0 1 0 13Z" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>' +
      "</svg>";

    const input = document.createElement("input");
    input.type = "search";
    input.placeholder = "Search settings";
    input.autocomplete = "off";
    input.spellcheck = false;
    input.setAttribute("aria-label", "Search settings");
    box.appendChild(input);
    root.appendChild(box);

    const empty = document.createElement("div");
    empty.className = "codexpp-settings-search-empty";
    empty.textContent = "No matching settings";
    root.appendChild(empty);

    const results = document.createElement("div");
    results.className = "codexpp-settings-search-results";
    root.appendChild(results);

    let scheduled = false;
    let disposed = false;
    let lastSidebar = null;
    let highlightTimer = null;
    const revealTimers = new Set();
    const pageIndex = new Map();

    const compact = (value) =>
      String(value || "").replace(/\s+/g, " ").trim().toLowerCase();

    const knownContent = [
      {
        page: "General",
        title: "Work mode",
        text: "work mode coding everyday technical detail",
      },
      {
        page: "General",
        title: "Permissions",
        text: "permissions default permissions auto-review full access",
      },
      {
        page: "General",
        title: "General",
        text: "general default open destination language show in menu bar prevent sleep follow-up behavior import other agent setup",
      },
      {
        page: "General",
        title: "Dictation",
        text: "dictation hold-to-dictate hotkey toggle dictation hotkey dictation dictionary recent dictations",
      },
      {
        page: "General",
        title: "Dictation dictionary",
        text: "dictation dictionary words phrases dictation should recognize",
      },
      {
        page: "General",
        title: "Notifications",
        text: "notifications turn completion notifications permission notifications alerts",
      },
    ].map((item) => ({
      ...item,
      text: compact(`${item.title} ${item.text}`),
      node: null,
    }));

    const labelFor = (node) =>
      compact(
        [
          node.getAttribute?.("aria-label"),
          node.getAttribute?.("title"),
          node.textContent,
        ]
          .filter(Boolean)
          .join(" "),
      );

    const visibleLabelFor = (node) => compact(node?.textContent || "");
    const displayLabelFor = (node) =>
      String(node?.textContent || "").replace(/\s+/g, " ").trim();

    const findSettingsSidebar = () => {
      const exact = document.querySelector(SIDEBAR_SELECTOR);
      if (exact instanceof HTMLElement) return exact;
      const candidates = Array.from(document.querySelectorAll("div")).filter(
        (node) => {
          if (!(node instanceof HTMLElement)) return false;
          const rect = node.getBoundingClientRect();
          if (rect.width < 180 || rect.width > 420 || rect.height < 240) return false;
          const text = compact(node.textContent);
          return (
            text.includes("general") &&
            text.includes("appearance") &&
            (text.includes("configuration") || text.includes("account"))
          );
        },
      );
      return candidates[0] instanceof HTMLElement ? candidates[0] : null;
    };

    const findMount = (sidebar) => {
      const groups = Array.from(sidebar.querySelectorAll("div")).filter(
        (node) =>
          node instanceof HTMLElement &&
          node.classList.contains("flex") &&
          node.classList.contains("flex-col") &&
          node.classList.contains("gap-px") &&
          Array.from(node.children).some(
            (child) =>
              child instanceof HTMLElement &&
              child.matches("button, a") &&
              visibleLabelFor(child) === "general",
          ),
      );
      const itemsGroup = groups[0];
      const outer = itemsGroup?.parentElement;
      if (itemsGroup instanceof HTMLElement && outer instanceof HTMLElement) {
        const header = Array.from(outer.children).find(
          (child) =>
            child instanceof HTMLElement &&
            child !== root &&
            !child.querySelector("button, a") &&
            visibleLabelFor(child) === "general",
        );
        return {
          parent: outer,
          before: header instanceof HTMLElement ? header : itemsGroup,
        };
      }
      const nav = sidebar.querySelector("nav");
      return {
        parent: nav instanceof HTMLElement ? nav : sidebar,
        before: nav instanceof HTMLElement ? nav.firstElementChild : sidebar.firstElementChild,
      };
    };

    const hide = (node, hidden) => {
      if (!(node instanceof HTMLElement) || root.contains(node)) return;
      if (hidden) {
        if (node.getAttribute(HIDDEN_ATTR) === "true") return;
        node.dataset[PREV_DISPLAY_ATTR] = node.style.display || "";
        node.style.display = "none";
        node.setAttribute(HIDDEN_ATTR, "true");
      } else if (node.getAttribute(HIDDEN_ATTR) === "true") {
        node.style.display = node.dataset[PREV_DISPLAY_ATTR] || "";
        delete node.dataset[PREV_DISPLAY_ATTR];
        node.removeAttribute(HIDDEN_ATTR);
      }
    };

    const navigateToPage = (sidebar, page) => {
      const nav = navForPage(sidebar, page);
      if (!(nav instanceof HTMLElement)) return false;
      hide(nav, false);
      nav.click();
      return true;
    };

    const restoreHidden = (scope = document) => {
      scope.querySelectorAll(`[${HIDDEN_ATTR}="true"]`).forEach((node) => {
        hide(node, false);
      });
    };

    const visibleControlsIn = (node) =>
      Array.from(node.querySelectorAll("button, a")).filter(
        (control) =>
          control instanceof HTMLElement &&
          !root.contains(control) &&
          control.getAttribute(HIDDEN_ATTR) !== "true",
      );

    const navControls = (sidebar) =>
      Array.from(sidebar.querySelectorAll("button, a")).filter(
        (node) => node instanceof HTMLElement && !root.contains(node),
      );

    const activePageLabel = (sidebar) => {
      const active = navControls(sidebar).find((node) => {
        const className = String(node.className || "");
        return (
          node.getAttribute("aria-current") === "page" ||
          node.getAttribute("data-state") === "active" ||
          className.includes("active") ||
          className.includes("selection")
        );
      });
      const activeLabel = displayLabelFor(active);
      if (activeLabel) return titleCaseLabel(activeLabel);

      const heading = document.querySelector(
        ".main-surface .heading-base, .main-surface .electron\\:heading-lg, .main-surface [role='heading']",
      );
      const headingLabel = displayLabelFor(heading);
      return headingLabel ? titleCaseLabel(headingLabel) : "Settings";
    };

    const titleCaseLabel = (value) => {
      const raw = String(value || "").replace(/\s+/g, " ").trim();
      return raw || "Settings";
    };

    const mainSurface = () => {
      const surface = document.querySelector(".main-surface");
      return surface instanceof HTMLElement ? surface : null;
    };

    const shortText = (node) =>
      String(node?.textContent || "")
        .replace(/\s+/g, " ")
        .trim();

    const sectionTitleFor = (node) => {
      const candidates = [
        ":scope > div:first-child .text-base",
        ":scope > div:first-child [class*='heading']",
        ":scope > div:first-child [role='heading']",
        ".text-base.font-medium",
        ".min-w-0.text-sm.text-token-text-primary",
        ".text-sm.text-token-text-primary",
        "button .text-sm",
        "button span",
      ];
      for (const selector of candidates) {
        const found = node.querySelector(selector);
        const text = shortText(found);
        if (text && text.length <= 80) return text;
      }
      const text = shortText(node);
      return text.slice(0, 80);
    };

    const contentCandidates = () => {
      const surface = mainSurface();
      if (!surface) return [];
      const nodes = Array.from(
        surface.querySelectorAll(
          "section, [class*='p-3'], button[class*='p-3'], button.flex.w-full",
        ),
      ).filter((node) => node instanceof HTMLElement);
      return nodes.filter((node) => {
        if (root.contains(node)) return false;
        const rect = node.getBoundingClientRect();
        if (rect.width < 120 || rect.height < 18) return false;
        const text = shortText(node);
        if (!text || text.length < 2) return false;
        return !nodes.some(
          (other) =>
            other !== node &&
            other instanceof HTMLElement &&
            node.contains(other) &&
            shortText(other) === text,
        );
      });
    };

    const updateCurrentPageIndex = (sidebar) => {
      const page = activePageLabel(sidebar);
      const items = [];
      const seen = new Set();
      for (const node of contentCandidates()) {
        const title = sectionTitleFor(node);
        const text = shortText(node);
        const key = compact(title);
        if (!title || seen.has(key)) continue;
        seen.add(key);
        items.push({ page, title, text: compact(`${title} ${text}`), node });
      }
      if (items.length > 0) pageIndex.set(page, items);
    };

    const contentMatches = (query) => {
      if (!query) return [];
      const matches = [];
      const seen = new Set();
      for (const item of knownContent) {
        const key = `${item.page}:${item.title}`;
        if (!item.text.includes(query) || seen.has(key)) continue;
        seen.add(key);
        matches.push(item);
      }
      for (const [page, items] of pageIndex.entries()) {
        for (const item of items) {
          const key = `${page}:${item.title}`;
          if (!item.text.includes(query) || seen.has(key)) continue;
          seen.add(key);
          matches.push({ ...item, page });
          if (matches.length >= 8) return matches;
        }
      }
      return matches;
    };

    const navForPage = (sidebar, page) =>
      navControls(sidebar).find((node) => visibleLabelFor(node) === compact(page));

    const clearHighlight = () => {
      document
        .querySelectorAll("[data-codexpp-settings-search-highlight]")
        .forEach((node) => node.removeAttribute("data-codexpp-settings-search-highlight"));
      if (highlightTimer) {
        window.clearTimeout(highlightTimer);
        highlightTimer = null;
      }
    };

    const fadeHighlight = (target) => {
      if (target.getAttribute("data-codexpp-settings-search-highlight") !== "true") return;
      target.setAttribute("data-codexpp-settings-search-highlight", "fading");
      highlightTimer = window.setTimeout(clearHighlight, 450);
    };

    const findContentTarget = (match) => {
      if (match.node instanceof HTMLElement && document.contains(match.node)) {
        return match.node;
      }
      const title = compact(match.title);
      const candidates = contentCandidates();
      return (
        candidates.find((node) => compact(sectionTitleFor(node)) === title) ||
        candidates.find((node) => compact(shortText(node)).includes(title)) ||
        null
      );
    };

    const scrollToMatch = (match) => {
      const target = findContentTarget(match);
      if (!(target instanceof HTMLElement)) return false;
      clearHighlight();
      target.setAttribute("data-codexpp-settings-search-highlight", "true");
      target.scrollIntoView({ block: "center", behavior: "smooth" });
      highlightTimer = window.setTimeout(() => fadeHighlight(target), 3000);
      return true;
    };

    const clearRevealTimers = () => {
      for (const timer of revealTimers) window.clearTimeout(timer);
      revealTimers.clear();
    };

    const revealMatch = (match, attempts = 12) => {
      if (disposed) return;
      if (lastSidebar) updateCurrentPageIndex(lastSidebar);
      if (scrollToMatch(match)) return;
      if (attempts <= 0) return;
      const timer = window.setTimeout(() => {
        revealTimers.delete(timer);
        revealMatch(match, attempts - 1);
      }, 125);
      revealTimers.add(timer);
    };

    const renderResults = (sidebar, matches) => {
      results.replaceChildren();
      for (const match of matches.slice(0, 5)) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "codexpp-settings-search-result cursor-interaction";
        button.title = `Reveal ${match.page} > ${match.title}`;
        const label = document.createElement("span");
        label.textContent = `${match.page} > ${match.title}`;
        button.appendChild(label);
        const reveal = (event) => {
          event.preventDefault();
          event.stopImmediatePropagation();
          clearRevealTimers();
          const currentSidebar = findSettingsSidebar() || sidebar;
          navigateToPage(currentSidebar, match.page);
          window.setTimeout(() => revealMatch(match), 0);
        };
        button.addEventListener("pointerdown", reveal);
        button.addEventListener("click", reveal);
        button.addEventListener("keydown", (event) => {
          if (event.key !== "Enter" && event.key !== " ") return;
          reveal(event);
        });
        results.appendChild(button);
      }
      root.dataset.hasResults = matches.length > 0 ? "true" : "false";
    };

    const syncGroupVisibility = (parent, query) => {
      const children = Array.from(parent.children).filter(
        (child) => child instanceof HTMLElement && child !== root,
      );

      for (const child of children) {
        if (!(child instanceof HTMLElement)) continue;
        if (child.querySelector("button, a")) {
          const hasVisibleControl = visibleControlsIn(child).length > 0;
          const groupLabelMatches = compact(child.textContent).includes(query);
          hide(child, !hasVisibleControl && !groupLabelMatches);
        }
      }

      for (let i = 0; i < children.length; i++) {
        const child = children[i];
        if (!(child instanceof HTMLElement) || child.querySelector("button, a")) continue;
        const labelMatches = compact(child.textContent).includes(query);
        const nextGroup = children
          .slice(i + 1)
          .find((candidate) => candidate instanceof HTMLElement && candidate.querySelector("button, a"));
        const nextVisible =
          nextGroup instanceof HTMLElement &&
          nextGroup.getAttribute(HIDDEN_ATTR) !== "true" &&
          visibleControlsIn(nextGroup).length > 0;
        hide(child, !labelMatches && !nextVisible);
      }
    };

    const applyFilter = () => {
      scheduled = false;
      if (disposed) return;

      const sidebar = findSettingsSidebar();
      if (!sidebar) {
        root.remove();
        restoreHidden(document);
        return;
      }
      lastSidebar = sidebar;

      const mount = findMount(sidebar);
      if (!root.isConnected || root.parentElement !== mount.parent) {
        mount.parent.insertBefore(root, mount.before);
      } else if (root.nextElementSibling !== mount.before && mount.before !== root) {
        mount.parent.insertBefore(root, mount.before);
      }

      updateCurrentPageIndex(sidebar);
      restoreHidden(sidebar);
      const query = compact(input.value);
      root.dataset.empty = "false";
      root.dataset.hasResults = "false";
      results.replaceChildren();
      if (!query) return;

      const matches = contentMatches(query);
      const matchingPages = new Set(matches.map((match) => compact(match.page)));

      const controls = navControls(sidebar);
      let visibleCount = 0;
      for (const control of controls) {
        const matchesNav =
          labelFor(control).includes(query) || matchingPages.has(visibleLabelFor(control));
        hide(control, !matchesNav);
        if (matchesNav) visibleCount++;
      }

      if (root.parentElement instanceof HTMLElement) {
        syncGroupVisibility(root.parentElement, query);
      }
      renderResults(sidebar, matches);
      root.dataset.empty = visibleCount === 0 && matches.length === 0 ? "true" : "false";
    };

    const schedule = () => {
      if (scheduled || disposed) return;
      scheduled = true;
      requestAnimationFrame(applyFilter);
    };

    input.addEventListener("input", schedule);
    input.addEventListener("keydown", (event) => {
      if (event.key !== "Escape") return;
      if (input.value) {
        input.value = "";
        schedule();
      } else {
        input.blur();
      }
      event.stopPropagation();
    });

    const onDocumentKeydown = (event) => {
      if (event.key.toLowerCase() !== "f" || (!event.metaKey && !event.ctrlKey)) return;
      const sidebar = findSettingsSidebar();
      if (!sidebar || !document.contains(sidebar)) return;
      event.preventDefault();
      event.stopPropagation();
      if (document.activeElement === input) {
        input.blur();
        return;
      }
      schedule();
      window.setTimeout(() => {
        input.focus();
        input.select();
      }, 0);
    };

    const observer = new MutationObserver(schedule);
    observer.observe(document.documentElement, { childList: true, subtree: true });
    document.addEventListener("keydown", onDocumentKeydown, true);
    window.addEventListener("codexpp:settings-surface", schedule);
    schedule();

    api.log.info("settings search active");

    return () => {
      disposed = true;
      observer.disconnect();
      document.removeEventListener("keydown", onDocumentKeydown, true);
      window.removeEventListener("codexpp:settings-surface", schedule);
      clearRevealTimers();
      clearHighlight();
      restoreHidden(document);
      root.remove();
      style.remove();
    };
  },

  /**
   * Match settings sidebar width to the main UI sidebar.
   *
   * Codex's main UI sidebar is `<aside class="pointer-events-auto relative
   * flex overflow-hidden">` — JS-controlled, user-resizable, width set via
   * inline `style="width: NNNpx"`. The settings page sidebar is a separate
   * element `<div class="window-fx-sidebar-surface ... w-token-sidebar">`
   * which uses Tailwind class `w-token-sidebar` → `width:
   * var(--spacing-token-sidebar)` ≈ 300px regardless of the main UI's
   * current width. That mismatch causes a visible layout jump every time
   * Settings opens or closes.
   *
   * Strategy: watch the main UI aside via ResizeObserver, persist the
   * latest pixel width to `api.storage`, and apply it to the settings
   * sidebar via an injected stylesheet. We seed from storage on start so
   * the very first paint of the settings page is already correct, before
   * the user has visited the main UI in this session.
   */
  "match-sidebar-width"(api) {
    const STYLE_ID = "codexpp-match-sidebar-width";
    const STORAGE_KEY = "match-sidebar-width:last";
    const ASIDE_SELECTOR = [
      "aside.pointer-events-auto.relative.flex.overflow-hidden",
      "aside.pointer-events-auto.relative.flex.overflow-visible",
      "aside.pointer-events-auto.relative.flex",
    ].join(", ");
    const SETTINGS_SIDEBAR_SELECTOR =
      ".window-fx-sidebar-surface.w-token-sidebar";
    const MIN_EXPANDED_WIDTH = 240;
    const DEFAULT_EXPANDED_WIDTH = 300;

    document.getElementById(STYLE_ID)?.remove();
    const style = document.createElement("style");
    style.id = STYLE_ID;
    document.head.appendChild(style);

    function validExpandedWidth(px) {
      // Sanity-clamp; ignore zero/negative/absurd values that could be
      // observed mid-mount or during a transition. Widths below Codex's
      // native sidebar minimum are the collapsed rail, not the width
      // Settings should inherit when opened via keyboard shortcut.
      return Number.isFinite(px) && px >= MIN_EXPANDED_WIDTH && px <= 900;
    }

    function applyWidth(px) {
      if (!validExpandedWidth(px)) return;
      // Override only the settings page sidebar. Main UI's <aside> sets
      // its own inline width — we mustn't touch it. Use !important to win
      // against the `w-token-sidebar` utility.
      style.textContent =
        `${SETTINGS_SIDEBAR_SELECTOR} { width: ${px}px !important; }`;
    }

    function rememberWidth(px) {
      if (!validExpandedWidth(px)) return;
      const width = Math.max(px, nativeSidebarWidth());
      api.storage.set(STORAGE_KEY, width);
      applyWidth(width);
    }

    function nativeSidebarWidth() {
      const probe = document.createElement("div");
      probe.style.cssText =
        "position:fixed;left:-9999px;top:-9999px;width:var(--spacing-token-sidebar);height:1px;pointer-events:none;";
      document.body.appendChild(probe);
      const width = Math.round(probe.getBoundingClientRect().width);
      probe.remove();
      return validExpandedWidth(width) ? width : DEFAULT_EXPANDED_WIDTH;
    }

    // Seed from last-known so the first settings-page paint matches.
    const seeded = Number(api.storage.get(STORAGE_KEY, NaN));
    rememberWidth(validExpandedWidth(seeded) ? seeded : nativeSidebarWidth());

    let resizeObs = null;
    let observed = null;

    function track(aside) {
      if (observed === aside) return;
      if (resizeObs) {
        resizeObs.disconnect();
        resizeObs = null;
      }
      observed = aside;
      if (!aside) return;
      // Pick up the current width immediately, then observe.
      const initial = Math.round(aside.getBoundingClientRect().width);
      rememberWidth(initial);
      resizeObs = new ResizeObserver((entries) => {
        const entry = entries[0];
        if (!entry) return;
        const w = Math.round(
          entry.contentRect?.width ?? aside.getBoundingClientRect().width,
        );
        rememberWidth(w);
      });
      resizeObs.observe(aside);
    }

    // Settings and main UI are mutually exclusive — when navigating
    // between them, the aside is mounted/unmounted. Watch the body for
    // structural changes and re-bind whenever a new aside appears.
    track(document.querySelector(ASIDE_SELECTOR));
    const mut = new MutationObserver(() => {
      const a = document.querySelector(ASIDE_SELECTOR);
      if (a !== observed) track(a);
    });
    mut.observe(document.body, { childList: true, subtree: true });

    return () => {
      mut.disconnect();
      if (resizeObs) resizeObs.disconnect();
      style.remove();
    };
  },

  /**
   * Render the four primary sidebar actions as a compact 2x2 grid.
   *
   * We keep the native buttons and click handlers intact, hide them, and
   * render proxy buttons that forward clicks to the originals. This avoids
   * inheriting the narrow icon-button constraints Codex applies to the
   * existing action row.
   */
  "sidebar-action-grid"(api) {
    const STYLE_ID = "codexpp-sidebar-action-grid";
    const ATTR = "data-codexpp-sidebar-action-grid";
    const WRAPPER_CLASS = "grid grid-cols-2 gap-2 w-full px-row-x";
    const BUTTON_CLASS =
      "flex min-w-0 flex-col items-start justify-center gap-1 rounded-lg " +
      "border border-token-border bg-token-foreground/5 ps-3.5 pe-3.5 py-3 text-left " +
      "text-sm text-token-text-primary hover:bg-token-foreground/10 " +
      "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 " +
      "focus-visible:outline-token-border cursor-interaction";
    const actions = [
      { key: "new chat", aliases: ["new chat", "quick chat"], label: "New chat" },
      { key: "search", aliases: ["search"], label: "Search" },
      { key: "plugins", aliases: ["plugin", "plugins"], label: "Plugins" },
      { key: "automations", aliases: ["automation", "automations"], label: "Automations" },
    ];

    document.getElementById(STYLE_ID)?.remove();
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      [${ATTR}="group"] {
        width: 100% !important;
        grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
        column-gap: var(--spacing-2, 0.5rem) !important;
        row-gap: var(--spacing-2, 0.5rem) !important;
      }

      [${ATTR}="button"] {
        display: flex !important;
        width: 100% !important;
        min-width: 0 !important;
        min-height: calc(var(--spacing-token-button-composer, 2rem) * 2.15) !important;
        padding: var(--spacing-3, 0.75rem) var(--spacing-3_5, 0.875rem) !important;
        color: var(--color-token-text-primary) !important;
        border: 1px solid color-mix(in srgb, currentColor 14%, transparent) !important;
        border-radius: var(--radius-lg, 0.5rem) !important;
        background-color: color-mix(in srgb, currentColor 5%, transparent) !important;
        align-items: flex-start !important;
        justify-content: center !important;
        flex-direction: column !important;
        text-align: left !important;
        gap: var(--spacing-1, 0.25rem) !important;
        overflow: hidden !important;
      }

      [${ATTR}="button"]:hover {
        background-color: color-mix(in srgb, currentColor 9%, transparent) !important;
      }

      [${ATTR}="button"] > * {
        min-width: 0;
      }

      [${ATTR}="button"] svg {
        flex-shrink: 0;
      }

      [${ATTR}="badge"] {
        display: inline-flex !important;
        position: absolute !important;
        top: var(--spacing-2, 0.5rem) !important;
        right: var(--spacing-2, 0.5rem) !important;
        translate: none !important;
        transform: none !important;
        pointer-events: none !important;
      }

      [${ATTR}="label"] {
        display: block !important;
        max-width: 100%;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      [${ATTR}="button"] kbd,
      [${ATTR}="button"] [class*="shortcut" i] {
        display: none !important;
      }

      [${ATTR}="original"] {
        display: none !important;
      }
    `;
    document.head.appendChild(style);

    const marked = new Set();
    let wrapper = null;
    let activeOriginals = [];

    const clearStaleNodes = () => {
      document.querySelectorAll(`[${ATTR}="group"]`).forEach((node) => {
        if (node.dataset.codexppSidebarActionOwned === "true") {
          node.remove();
        }
      });
      document.querySelectorAll(`[${ATTR}]`).forEach((node) => {
        if (node.dataset.codexppSidebarActionOwned === "true") {
          node.remove();
          return;
        }
        node.removeAttribute(ATTR);
        if (node.dataset.codexppSidebarActionPrevClass !== undefined) {
          node.className = node.dataset.codexppSidebarActionPrevClass;
          delete node.dataset.codexppSidebarActionPrevClass;
        }
        if (node.dataset.codexppSidebarActionPrevStyle !== undefined) {
          node.style.cssText = node.dataset.codexppSidebarActionPrevStyle;
          delete node.dataset.codexppSidebarActionPrevStyle;
        }
      });
    };

    const cleanupMarks = () => {
      for (const node of marked) {
        node.removeAttribute(ATTR);
        if (node.dataset.codexppSidebarActionPrevClass !== undefined) {
          node.className = node.dataset.codexppSidebarActionPrevClass;
          delete node.dataset.codexppSidebarActionPrevClass;
        }
        if (node.dataset.codexppSidebarActionPrevStyle !== undefined) {
          node.style.cssText = node.dataset.codexppSidebarActionPrevStyle;
          delete node.dataset.codexppSidebarActionPrevStyle;
        }
      }
      marked.clear();
    };

    const removeWrapper = () => {
      wrapper?.remove();
      wrapper = null;
      activeOriginals = [];
    };

    const normalize = (value) =>
      (value || "").replace(/\s+/g, " ").trim().toLowerCase();

    const isShortcutNode = (node) => {
      if (!(node instanceof HTMLElement)) return false;
      if (node.tagName === "KBD") return true;
      const text = normalize(node.textContent || "");
      const className = String(node.className || "");
      return (
        /\bshortcut\b/i.test(className) ||
        /^[⌘⇧⌥⌃^]*(?:[a-z0-9]|space|enter|tab|esc)$/i.test(text) ||
        /^(?:ctrl|control|alt|option|shift|cmd|command)\+/.test(text)
      );
    };

    const isBadgeNode = (node) => {
      if (!(node instanceof HTMLElement)) return false;
      const className = String(node.className || "");
      return (
        /\bbadge\b/i.test(className) ||
        /\bdisambiguated-digits\b/i.test(className) ||
        (/\babsolute\b/.test(className) && /^\d+$/.test(normalize(node.textContent || "")))
      );
    };

    const nodeLabelText = (node) => {
      if (!(node instanceof HTMLElement)) return "";
      const childLabels = Array.from(node.children)
        .filter(
          (child) =>
            child instanceof HTMLElement &&
            !isShortcutNode(child) &&
            !isBadgeNode(child) &&
            child.getAttribute(ATTR) !== "badge",
        )
        .map((child) => nodeLabelText(child))
        .filter(Boolean);
      if (childLabels.length) return childLabels.join(" ");
      return normalize(node.textContent || "");
    };

    const buttonLabel = (node) =>
      normalize(node.getAttribute("aria-label") || nodeLabelText(node))
        .replace(/\s*(?:[⌘⇧⌥⌃^]|ctrl|control|alt|option|shift|cmd|command)\+?.*$/i, "")
        .trim();

    const isCompositeActionText = (node) => {
      const text = normalize(node.textContent || "");
      let count = 0;
      for (const action of actions) {
        if (action.aliases.some((alias) => text.includes(alias))) count += 1;
      }
      return count > 1;
    };

    const findMainSidebar = () => {
      const aside = document.querySelector(
        [
          "aside.pointer-events-auto.relative.flex.overflow-hidden",
          "aside.pointer-events-auto.relative.flex.overflow-visible",
          "aside.pointer-events-auto.relative.flex",
        ].join(", "),
      );
      if (aside instanceof HTMLElement) return aside;
      return null;
    };

    const findActionButtons = (options = {}) => {
      const sidebar = findMainSidebar();
      if (!sidebar) return null;
      const sidebarRect = sidebar.getBoundingClientRect();
      const candidates = Array.from(sidebar.querySelectorAll("button, a"))
        .filter(
          (node) => {
            if (!(node instanceof HTMLElement)) return false;
            if (
              node.getAttribute(ATTR) === "original" ||
              node.getAttribute(ATTR) === "source-original" ||
              node.getAttribute(ATTR) === "overlay" ||
              isCompositeActionText(node)
            ) {
              return false;
            }
            const rect = node.getBoundingClientRect();
            if (rect.width <= 0 || rect.height <= 0) return false;
            return rect.top - sidebarRect.top < 260;
          },
        )
        .sort((a, b) => {
          const ar = a.getBoundingClientRect();
          const br = b.getBoundingClientRect();
          return ar.top - br.top || ar.left - br.left;
        });
      const byLabel = new Map();
      for (const node of candidates) {
        const label = buttonLabel(node);
        const action = actions.find((item) => item.aliases.includes(label));
        if (action && !byLabel.has(action.key)) {
          byLabel.set(action.key, node);
        }
      }
      if (actions.some((action) => !byLabel.has(action.key))) return null;
      return actions.map((action) => ({
        ...action,
        original: byLabel.get(action.key),
      }));
    };

    const commonAncestor = (nodes) => {
      if (!nodes.length) return null;
      const chain = [];
      for (let node = nodes[0]; node; node = node.parentElement) {
        chain.push(node);
      }
      return chain.find((node) => nodes.every((target) => node.contains(target)));
    };

    const markNode = (node, value) => {
      if (!marked.has(node)) {
        if (node.dataset.codexppSidebarActionPrevClass === undefined) {
          node.dataset.codexppSidebarActionPrevClass = node.className || "";
        }
        if (node.dataset.codexppSidebarActionPrevStyle === undefined) {
          node.dataset.codexppSidebarActionPrevStyle = node.style.cssText || "";
        }
        marked.add(node);
      }
      if (node.getAttribute(ATTR) !== value) node.setAttribute(ATTR, value);
    };

    const addClasses = (node, classes) => {
      const missing = classes.filter((className) => !node.classList.contains(className));
      if (missing.length) node.classList.add(...missing);
    };

    const setImportantStyle = (node, property, value) => {
      if (node.style.getPropertyValue(property) === value &&
          node.style.getPropertyPriority(property) === "important") {
        return;
      }
      node.style.setProperty(property, value, "important");
    };

    const findFullWidthMount = (sidebar, originals) => {
      const common = commonAncestor(originals);
      if (!(common instanceof HTMLElement)) return sidebar;

      const sidebarWidth = sidebar.getBoundingClientRect().width;
      let mount = common;
      while (
        mount.parentElement &&
        mount.parentElement !== sidebar &&
        mount.getBoundingClientRect().width < sidebarWidth * 0.7
      ) {
        mount = mount.parentElement;
      }
      return mount;
    };

    const createProxyButton = (action) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = `${BUTTON_CLASS.replace(/\bflex\b/g, "").trim()} relative`;
      btn.setAttribute(ATTR, "button");
      btn.setAttribute("aria-label", action.label);
      btn.style.setProperty("display", "block", "important");
      btn.style.setProperty("width", "100%", "important");
      btn.style.setProperty("text-align", "left", "important");

      const iconWrap = document.createElement("div");
      iconWrap.className = "mb-1 h-5 w-5 text-token-text-secondary";
      iconWrap.style.setProperty("display", "block", "important");
      iconWrap.style.setProperty("width", "1.25rem", "important");
      iconWrap.style.setProperty("height", "1.25rem", "important");

      const icon = action.original.querySelector("svg")?.cloneNode(true);
      if (icon instanceof SVGElement) {
        icon.classList.add("icon-sm", "shrink-0", "text-token-text-secondary");
        icon.setAttribute("aria-hidden", "true");
        icon.removeAttribute("aria-label");
        icon.style.setProperty("display", "block", "important");
        iconWrap.appendChild(icon);
      }

      const text = document.createElement("div");
      text.setAttribute(ATTR, "label");
      text.className = "min-w-0 max-w-full truncate leading-tight";
      text.style.setProperty("display", "block", "important");
      text.style.setProperty("width", "100%", "important");
      text.textContent = action.label;
      btn.append(iconWrap, text);

      btn.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        const live = findActionButtons({ includeHiddenSource: true })
          ?.find((candidate) => candidate.key === action.key)
          ?.original;
        activateOriginal(live || action.original);
      });

      return btn;
    };

    const activateOriginal = (original) => {
      if (!(original instanceof HTMLElement)) return;
      original.click();
      original.dispatchEvent(
        new PointerEvent("pointerdown", { bubbles: true, cancelable: true }),
      );
      original.dispatchEvent(
        new MouseEvent("mousedown", { bubbles: true, cancelable: true }),
      );
      original.dispatchEvent(
        new PointerEvent("pointerup", { bubbles: true, cancelable: true }),
      );
      original.dispatchEvent(
        new MouseEvent("mouseup", { bubbles: true, cancelable: true }),
      );
      original.dispatchEvent(
        new MouseEvent("click", { bubbles: true, cancelable: true }),
      );
    };

    const sourceHideTarget = (original) => {
      let node = original;
      while (
        node.parentElement &&
        node.parentElement !== wrapper &&
        node.parentElement.childElementCount === 1
      ) {
        node = node.parentElement;
      }
      return node;
    };

    const hideOriginals = (originals) => {
      for (const original of originals) {
        const target = sourceHideTarget(original);
        markNode(target, "source-original");
        target.style.setProperty("display", "none", "important");
      }
    };

    const stackOriginalButtonContent = (button) => {
      for (const node of button.querySelectorAll("kbd")) {
        if (node instanceof HTMLElement) {
          markNode(node, "shortcut");
          setImportantStyle(node, "display", "none");
        }
      }

      const content =
        Array.from(button.children).find(
          (child) =>
            child instanceof HTMLElement &&
            child.querySelector("svg") &&
            normalize(child.textContent || ""),
        ) || button;

      if (content instanceof HTMLElement) {
        if (content !== button) markNode(content, "content");
        setImportantStyle(content, "display", "flex");
        setImportantStyle(content, "flex-direction", "column");
        setImportantStyle(content, "align-items", "flex-start");
        setImportantStyle(content, "justify-content", "center");
        setImportantStyle(content, "gap", "var(--spacing-1, 0.25rem)");
        setImportantStyle(content, "width", "100%");
        setImportantStyle(content, "min-width", "0");
        setImportantStyle(content, "text-align", "left");
      }

      const icon = button.querySelector("svg");
      if (icon instanceof SVGElement) {
        setImportantStyle(icon, "display", "block");
        setImportantStyle(icon, "flex-shrink", "0");
      }

      for (const node of button.querySelectorAll("span, div")) {
        if (isBadgeNode(node)) {
          markNode(node, "badge");
        }
      }
    };

    const apply = () => {
      const sidebar = findMainSidebar();
      if (!sidebar) return;

      const actionButtons = findActionButtons();
      if (!actionButtons) {
        cleanupMarks();
        return;
      }
      const originals = actionButtons.map((action) => action.original);

      const group = commonAncestor(originals);
      if (!(group instanceof HTMLElement)) return;
      const groupText = normalize(group.textContent || "");
      const groupRect = group.getBoundingClientRect();
      const sidebarRect = sidebar.getBoundingClientRect();
      if (
        group.children.length > 8 ||
        groupRect.top - sidebarRect.top > 260 ||
        /\bpinned\b|\bprojects?\b/.test(groupText)
      ) {
        cleanupMarks();
        return;
      }

      markNode(group, "group");
      addClasses(group, WRAPPER_CLASS.split(/\s+/).filter(Boolean));

      for (const action of actionButtons) {
        const original = action.original;
        markNode(original, "button");
        addClasses(
          original,
          BUTTON_CLASS.replace(/\brelative\b/g, "")
            .split(/\s+/)
            .filter(Boolean),
        );
        setImportantStyle(original, "display", "flex");
        setImportantStyle(
          original,
          "border",
          "1px solid color-mix(in srgb, currentColor 14%, transparent)",
        );
        setImportantStyle(
          original,
          "background-color",
          "color-mix(in srgb, currentColor 5%, transparent)",
        );
        setImportantStyle(original, "flex-direction", "column");
        setImportantStyle(original, "align-items", "flex-start");
        setImportantStyle(original, "justify-content", "center");
        stackOriginalButtonContent(original);
      }
      activeOriginals = originals;
    };

    let scheduled = false;
    const scheduleApply = () => {
      if (scheduled) return;
      scheduled = true;
      requestAnimationFrame(() => {
        scheduled = false;
        apply();
      });
    };

    clearStaleNodes();
    apply();
    const obs = new MutationObserver(scheduleApply);
    obs.observe(document.body, { childList: true, subtree: true });

    api.log.info("sidebar action grid active");

    return () => {
      obs.disconnect();
      removeWrapper();
      cleanupMarks();
      style.remove();
    };
  },

  /**
   * Let sidebar chat rows be multi-selected with Cmd/Ctrl-click, then expose
   * batch actions from a right-click menu. We deliberately call Codex's native
   * controls for the actual actions so the app owns persistence and side
   * effects.
   */
  "sidebar-chat-multi-select"(api) {
    const STYLE_ID = "codexpp-sidebar-chat-multi-select";
    const ROW_ATTR = "data-codexpp-sidebar-chat-selectable";
    const SELECTED_ATTR = "data-codexpp-sidebar-chat-selected";
    const TARGET_ATTR = "data-codexpp-sidebar-chat-selected-target";
    const MENU_ATTR = "data-codexpp-sidebar-chat-multi-select-menu";
    const ASIDE_SELECTOR = [
      "aside.pointer-events-auto.relative.flex.overflow-hidden",
      "aside.pointer-events-auto.relative.flex.overflow-visible",
      "aside.pointer-events-auto.relative.flex",
    ].join(", ");
    const THREAD_SELECTOR = [
      "[data-app-action-sidebar-thread-row]",
      "[data-app-action-sidebar-thread-id]",
      "[data-app-action-sidebar-task-id]",
      "[data-sidebar-thread-id]",
      "[data-app-action-sidebar-thread-pinned]",
      "[data-app-action-sidebar-task-pinned]",
      "[data-sidebar-thread-pinned]",
    ].join(", ");
    const selectedIds = new Set();
    let disposed = false;
    let lastAnchorId = null;
    let actionInProgress = false;

    document.getElementById(STYLE_ID)?.remove();
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      [${ROW_ATTR}="true"] {
        user-select: none !important;
      }

      [${TARGET_ATTR}="true"] {
        background-color: var(--color-token-list-hover-background, color-mix(in srgb, currentColor 8%, transparent)) !important;
        box-shadow: inset 0 0 0 1px color-mix(in srgb, currentColor 38%, transparent) !important;
      }

      [${MENU_ATTR}="item"][disabled] {
        cursor: default !important;
        opacity: 0.45 !important;
      }

      [${MENU_ATTR}="label"] {
        flex: 1 1 auto !important;
        min-width: 0 !important;
      }
    `;
    document.head.appendChild(style);

    const normalizeThreadId = (value) =>
      String(value || "")
        .trim()
        .replace(/^(local|remote|pending-worktree):/, "");

    const attrValue = (node, names) => {
      if (!(node instanceof HTMLElement)) return null;
      for (const name of names) {
        const value = node.getAttribute(name);
        if (value != null && value !== "") return value;
      }
      const suffixes = new Set(names.map((name) => name.split("-").at(-1)));
      for (const attr of Array.from(node.attributes || [])) {
        const name = attr.name.toLowerCase();
        if (!name.includes("sidebar") || !name.includes("thread")) continue;
        if (
          names.some((expected) => name.endsWith(expected.replace(/^data-/, ""))) ||
          Array.from(suffixes).some((suffix) => name.endsWith(`-${suffix}`))
        ) {
          return attr.value;
        }
      }
      return null;
    };

    const threadMeta = (node) => {
      if (!(node instanceof HTMLElement)) return null;
      const id = attrValue(node, [
        "data-app-action-sidebar-thread-id",
        "data-app-action-sidebar-task-id",
        "data-sidebar-thread-id",
      ]);
      const kind = attrValue(node, [
        "data-app-action-sidebar-thread-kind",
        "data-app-action-sidebar-task-kind",
        "data-sidebar-thread-kind",
      ]);
      if (!id || (kind && kind !== "local")) return null;
      return { id: normalizeThreadId(id) };
    };

    const mainSidebar = () => {
      const aside = document.querySelector(ASIDE_SELECTOR);
      return aside instanceof HTMLElement ? aside : null;
    };

    const interactiveTargetFor = (host, row) => {
      const interactive = host?.closest?.(
        [
          "[role='button']",
          "a",
          "button",
          "[class*='hover:bg-token-list-hover-background']",
          "[class*='bg-token-list-selected-background']",
          "[class*='bg-token-list-hover-background']",
        ].join(", "),
      );
      if (interactive instanceof HTMLElement && row?.contains?.(interactive)) {
        return interactive;
      }
      return host instanceof HTMLElement ? host : row;
    };

    const threadRows = () => {
      const sidebar = mainSidebar();
      if (!sidebar) return [];
      const rows = new Map();
      const candidates = sidebar.querySelectorAll(`${THREAD_SELECTOR}, [role='listitem']`);
      for (const node of candidates) {
        if (!(node instanceof HTMLElement)) continue;
        const source = threadMeta(node) ? node : node.querySelector?.(THREAD_SELECTOR);
        const meta = threadMeta(source);
        if (!meta?.id) continue;
        const row = source.closest("[role='listitem']") || source;
        const host = source instanceof HTMLElement ? source : row;
        if (!(row instanceof HTMLElement) || !(host instanceof HTMLElement)) continue;
        rows.set(meta.id, {
          id: meta.id,
          row,
          host,
          target: interactiveTargetFor(host, row),
        });
      }
      return Array.from(rows.values());
    };

    const rowRecordFromTarget = (target) => {
      if (!(target instanceof Element)) return null;
      const source =
        target.closest?.(THREAD_SELECTOR) ||
        target.closest?.("[role='listitem']")?.querySelector?.(THREAD_SELECTOR);
      const row = source?.closest?.("[role='listitem']");
      if (!(source instanceof HTMLElement) || !(row instanceof HTMLElement)) return null;
      const meta = threadMeta(source);
      if (!meta?.id) return null;
      return {
        id: meta.id,
        row,
        host: source,
        target: interactiveTargetFor(source, row),
      };
    };

    const selectedRecords = () => {
      const rows = threadRows();
      return Array.from(selectedIds)
        .map((id) => rows.find((row) => row.id === id))
        .filter(Boolean);
    };

    const clearSelection = () => {
      selectedIds.clear();
      lastAnchorId = null;
      closeNativeMenu();
      applySelection();
    };

    const toggleSelection = (id) => {
      if (selectedIds.has(id)) selectedIds.delete(id);
      else selectedIds.add(id);
      lastAnchorId = id;
      applySelection();
    };

    const selectOnly = (id) => {
      selectedIds.clear();
      selectedIds.add(id);
      lastAnchorId = id;
      applySelection();
    };

    const selectRangeTo = (id) => {
      const rows = threadRows();
      const start = rows.findIndex((row) => row.id === lastAnchorId);
      const end = rows.findIndex((row) => row.id === id);
      if (start < 0 || end < 0) {
        toggleSelection(id);
        return;
      }
      const [from, to] = start < end ? [start, end] : [end, start];
      for (const row of rows.slice(from, to + 1)) selectedIds.add(row.id);
      applySelection();
    };

    const applySelection = () => {
      const rows = threadRows();
      const visibleIds = new Set(rows.map((row) => row.id));
      for (const id of Array.from(selectedIds)) {
        if (!visibleIds.has(id)) selectedIds.delete(id);
      }
      document
        .querySelectorAll(`[${ROW_ATTR}], [${SELECTED_ATTR}], [${TARGET_ATTR}]`)
        .forEach((node) => {
          node.removeAttribute?.(ROW_ATTR);
          node.removeAttribute?.(SELECTED_ATTR);
          node.removeAttribute?.(TARGET_ATTR);
        });
      for (const record of rows) {
        record.row.setAttribute(ROW_ATTR, "true");
        if (!selectedIds.has(record.id)) continue;
        record.row.setAttribute(SELECTED_ATTR, "true");
        record.target?.setAttribute?.(TARGET_ATTR, "true");
      }
    };

    const isNativeActionClick = (target) =>
      Boolean(target?.closest?.("button, input, textarea, select, [contenteditable='true']"));

    const onClick = (event) => {
      if (disposed || actionInProgress) return;
      const record = rowRecordFromTarget(event.target);
      if (!record) {
        if (selectedIds.size && !event.target?.closest?.('[role="menu"]')) clearSelection();
        return;
      }
      if (isNativeActionClick(event.target)) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation?.();
        if (event.shiftKey) selectRangeTo(record.id);
        else toggleSelection(record.id);
        return;
      }
      if (selectedIds.size) {
        clearSelection();
      }
    };

    const onContextMenu = (event) => {
      if (disposed || actionInProgress) return;
      const record = rowRecordFromTarget(event.target);
      if (selectedIds.size <= 1) return;
      if (record && !selectedIds.has(record.id)) {
        return;
      }
      if (!record && !mainSidebar()?.contains?.(event.target)) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation?.();
      void openNativeBatchMenu(event.clientX, event.clientY);
    };

    const onPointerDown = (event) => {
      if (disposed || actionInProgress || event.button !== 2) return;
      const record = rowRecordFromTarget(event.target);
      if (selectedIds.size <= 1) return;
      if (record && !selectedIds.has(record.id)) return;
      if (!record && !mainSidebar()?.contains?.(event.target)) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation?.();
      void openNativeBatchMenu(event.clientX, event.clientY);
    };

    const onKeyDown = (event) => {
      if (event.key === "Escape" && selectedIds.size) {
        event.preventDefault();
        clearSelection();
      }
    };

    const wait = (ms) => new Promise((resolve) => window.setTimeout(resolve, ms));

    const clickElement = (node) => {
      if (!(node instanceof HTMLElement)) return false;
      node.dispatchEvent(new MouseEvent("pointerdown", {
        bubbles: true,
        cancelable: true,
        view: window,
        button: 0,
      }));
      node.dispatchEvent(new MouseEvent("mousedown", {
        bubbles: true,
        cancelable: true,
        view: window,
        button: 0,
      }));
      node.dispatchEvent(new MouseEvent("pointerup", {
        bubbles: true,
        cancelable: true,
        view: window,
        button: 0,
      }));
      node.dispatchEvent(new MouseEvent("mouseup", {
        bubbles: true,
        cancelable: true,
        view: window,
        button: 0,
      }));
      node.click();
      return true;
    };

    const buttonByAria = (row, label) =>
      Array.from(row.querySelectorAll("button"))
        .find((button) => button instanceof HTMLElement && button.getAttribute("aria-label") === label) || null;

    const runRowButtonAction = async (label) => {
      const records = selectedRecords();
      closeNativeMenu();
      actionInProgress = true;
      try {
        for (const record of records) {
          const button = buttonByAria(record.row, label);
          if (!button) continue;
          clickElement(button);
          await wait(90);
        }
      } finally {
        actionInProgress = false;
        clearSelection();
      }
    };

    const findChatActionsButton = () =>
      Array.from(document.querySelectorAll("button, [role='button']"))
        .find((node) => node instanceof HTMLElement && node.getAttribute("aria-label") === "Chat actions") || null;

    const findOpenMiniWindowItem = () =>
      Array.from(document.querySelectorAll('[role="menu"][data-state="open"] [role="menuitem"], [role="menu"] [role="menuitem"]'))
        .find((item) => item instanceof HTMLElement && item.textContent?.trim().includes("Open in mini window")) || null;

    const openHeaderActionsMenu = async () => {
      const button = findChatActionsButton();
      if (!button) return false;
      clickElement(button);
      for (let i = 0; i < 8; i += 1) {
        await wait(80);
        if (findOpenMiniWindowItem()) return true;
      }
      return false;
    };

    const openRowsInMiniWindows = async () => {
      const ids = Array.from(selectedIds);
      closeNativeMenu();
      actionInProgress = true;
      try {
        for (const id of ids) {
          const record = threadRows().find((row) => row.id === id);
          if (!record) continue;
          clickElement(record.target || record.host);
          await wait(450);
          const hasMenu = await openHeaderActionsMenu();
          if (!hasMenu) {
            api.log.warn("[sidebar-chat-multi-select] chat actions menu unavailable", { id });
            continue;
          }
          const item = findOpenMiniWindowItem();
          if (!item) {
            api.log.warn("[sidebar-chat-multi-select] open mini window item unavailable", { id });
            continue;
          }
          clickElement(item);
          await wait(300);
        }
      } finally {
        actionInProgress = false;
        clearSelection();
      }
    };

    const actionAvailability = () => {
      const records = selectedRecords();
      return {
        count: selectedIds.size || records.length,
        canPin: records.some((record) => buttonByAria(record.row, "Pin chat")),
        canArchive: records.some((record) => buttonByAria(record.row, "Archive chat")),
      };
    };

    const openNativeBatchMenu = async (x, y) => {
      const { count, canPin, canArchive } = actionAvailability();
      if (!count) return;
      if (openNativeBatchMenu._open) return;
      openNativeBatchMenu._open = true;
      let action = null;
      try {
        action =
          (await api.ipc.invoke("sidebar-chat-batch-menu", {
            x,
            y,
            count,
            canPin,
            canArchive,
          })) || null;
      } catch (e) {
        api.log.warn("[sidebar-chat-multi-select] native batch menu unavailable", e);
        return;
      } finally {
        openNativeBatchMenu._open = false;
      }
      if (action === "pin") await runRowButtonAction("Pin chat");
      else if (action === "archive") await runRowButtonAction("Archive chat");
      else if (action === "mini-window") await openRowsInMiniWindows();
    };

    const closeNativeMenu = () => {
      document.dispatchEvent(new KeyboardEvent("keydown", {
        key: "Escape",
        bubbles: true,
        cancelable: true,
      }));
    };

    let scheduled = false;
    const scheduleApply = () => {
      if (scheduled || disposed) return;
      scheduled = true;
      requestAnimationFrame(() => {
        scheduled = false;
        applySelection();
      });
    };

    applySelection();
    const observer = new MutationObserver(scheduleApply);
    observer.observe(document.body, { childList: true, subtree: true });
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("mousedown", onPointerDown, true);
    document.addEventListener("click", onClick, true);
    document.addEventListener("contextmenu", onContextMenu, true);
    document.addEventListener("keydown", onKeyDown, true);

    api.log.info("sidebar chat multi-select active");

    return () => {
      disposed = true;
      observer.disconnect();
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("mousedown", onPointerDown, true);
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("contextmenu", onContextMenu, true);
      document.removeEventListener("keydown", onKeyDown, true);
      closeNativeMenu();
      selectedIds.clear();
      document
        .querySelectorAll(`[${ROW_ATTR}], [${SELECTED_ATTR}], [${TARGET_ATTR}]`)
        .forEach((node) => {
          node.removeAttribute?.(ROW_ATTR);
          node.removeAttribute?.(SELECTED_ATTR);
          node.removeAttribute?.(TARGET_ATTR);
        });
      style.remove();
    };
  },

  /**
   * Show a small project label under pinned sidebar chats. When Codex's
   * sidebar is organized as a chronological list, show it under every local
   * chat because project grouping is no longer visible.
   */
  "show-pinned-chat-project-names"(api) {
    const STYLE_ID = "codexpp-pinned-chat-project-names";
    const ATTR = "data-codexpp-pinned-chat-project-name";
    const ROW_ATTR = "data-codexpp-pinned-chat-project-name-row";
    const CONTENT_ATTR = "data-codexpp-pinned-chat-project-name-content";
    const COMPACT_ATTR = "data-codexpp-pinned-chat-project-name-compact-row";
    const COLOR_STORAGE_KEY = "sidebar-project-backgrounds:colors";
    const ORGANIZE_MODE_KEY = "codex:persisted-atom:sidebar-organize-mode-v1";
    const ASIDE_SELECTOR = [
      "aside.pointer-events-auto.relative.flex.overflow-hidden",
      "aside.pointer-events-auto.relative.flex.overflow-visible",
      "aside.pointer-events-auto.relative.flex",
    ].join(", ");
    const labels = new Map();
    let disposed = false;
    let refreshInFlight = false;
    let lastRefreshAt = 0;

    document.getElementById(STYLE_ID)?.remove();
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      [${ATTR}="label"] {
        display: flex !important;
        align-items: center !important;
        gap: 0 !important;
        position: absolute !important;
        left: var(--codexpp-pinned-chat-project-label-left, 2rem) !important;
        right: var(--codexpp-pinned-chat-project-label-right, 2rem) !important;
        bottom: 0.1875rem !important;
        max-width: none !important;
        min-width: 0 !important;
        overflow: visible !important;
        color: var(--color-token-text-secondary, currentColor) !important;
        font-size: 0.6875rem !important;
        line-height: 0.875rem !important;
        opacity: 0.75 !important;
        pointer-events: none !important;
      }

      [${ATTR}="dot"] {
        width: 0.375rem !important;
        height: 0.375rem !important;
        border-radius: 9999px !important;
        flex: 0 0 auto !important;
        margin-left: 1px !important;
        background-color: var(--codexpp-pinned-chat-project-color, currentColor) !important;
      }

      [${ATTR}="label"]:has([${ATTR}="dot"]) {
        gap: 0.375rem !important;
      }

      [${ATTR}="label-text"] {
        display: block !important;
        min-width: 0 !important;
        max-width: 100% !important;
        overflow: hidden !important;
        text-overflow: ellipsis !important;
        white-space: nowrap !important;
      }

      [${CONTENT_ATTR}="true"] {
        position: relative !important;
        transform: translateY(-0.3125rem) !important;
      }

      [${COMPACT_ATTR}="true"] [${CONTENT_ATTR}="true"] > .w-4:first-child {
        align-items: center !important;
        display: flex !important;
        height: 100% !important;
        justify-content: center !important;
        position: absolute !important;
        left: -0.25rem !important;
        top: 0.3125rem !important;
        width: 1.5rem !important;
        z-index: 20 !important;
        transform: none !important;
      }

      [${COMPACT_ATTR}="true"] [${CONTENT_ATTR}="true"] > .w-4:first-child button {
        align-items: center !important;
        border: 1px solid transparent !important;
        border-radius: 9999px !important;
        color: var(--color-token-muted-foreground, currentColor) !important;
        cursor: var(--cursor-interaction, pointer) !important;
        display: flex !important;
        gap: 0.25rem !important;
        height: 1.25rem !important;
        justify-content: center !important;
        opacity: 0.5 !important;
        padding: 0 !important;
        pointer-events: auto !important;
        user-select: none !important;
        white-space: nowrap !important;
        width: 1.25rem !important;
      }

      [${COMPACT_ATTR}="true"] [${CONTENT_ATTR}="true"] > .w-4:first-child button:hover,
      [${COMPACT_ATTR}="true"] [${CONTENT_ATTR}="true"] > .w-4:first-child button:focus-visible {
        color: var(--color-token-foreground, currentColor) !important;
        opacity: 1 !important;
      }

      [${COMPACT_ATTR}="true"] [${CONTENT_ATTR}="true"] > .w-4:first-child button > svg {
        height: 1rem !important;
        width: 1rem !important;
      }

      [${COMPACT_ATTR}="true"] [${CONTENT_ATTR}="true"] > .w-4:first-child + div {
        margin-left: 0.125rem !important;
        padding-left: 0 !important;
      }

      [${COMPACT_ATTR}="true"] [${CONTENT_ATTR}="true"] > .w-4:first-child + div > div {
        padding-right: 0.75rem !important;
      }

      [${COMPACT_ATTR}="true"]:hover [${CONTENT_ATTR}="true"] > .w-4:first-child + div > div,
      [${COMPACT_ATTR}="true"]:focus-within [${CONTENT_ATTR}="true"] > .w-4:first-child + div > div {
        -webkit-mask-image: linear-gradient(to right, transparent 0, transparent 21px, black 26px) !important;
        mask-image: linear-gradient(to right, transparent 0, transparent 21px, black 26px) !important;
      }

      [${COMPACT_ATTR}="true"]:hover > [${ATTR}="label"],
      [${COMPACT_ATTR}="true"]:focus-within > [${ATTR}="label"] {
        -webkit-mask-image: linear-gradient(to right, transparent 0, transparent 21px, black 26px) !important;
        mask-image: linear-gradient(to right, transparent 0, transparent 21px, black 26px) !important;
      }

      [${ROW_ATTR}="true"] {
        --padding-row-y: 0 !important;
        box-sizing: border-box !important;
        height: 2.375rem !important;
        min-height: 2.375rem !important;
        padding-top: 0 !important;
        padding-bottom: 0 !important;
      }
    `;
    document.head.appendChild(style);

    const mainSidebar = () => {
      const aside = document.querySelector(ASIDE_SELECTOR);
      return aside instanceof HTMLElement ? aside : null;
    };

    const normalizeThreadId = (value) =>
      String(value || "")
        .trim()
        .replace(/^(local|remote|pending-worktree):/, "");

    const normalizeProjectName = (value) =>
      String(value || "").replace(/\s+/g, " ").trim().toLowerCase();

    const normalizeProjectPath = (value) =>
      String(value || "")
        .replace(/^file:\/\//, "")
        .replace(/[\\/]+$/, "")
        .toLowerCase();

    const sidebarOrganizeMode = () => {
      try {
        const raw = window.localStorage?.getItem(ORGANIZE_MODE_KEY);
        if (!raw) return null;
        try {
          return JSON.parse(raw);
        } catch {
          return raw;
        }
      } catch {
        return null;
      }
    };

    const hasVisibleProjectRows = (sidebar) =>
      Array.from(sidebar.querySelectorAll(
        "[data-app-action-sidebar-project-row], div[role='listitem'].group\\/cwd",
      )).some((node) => node instanceof HTMLElement && node.getBoundingClientRect().height > 0);

    const hasThreadRows = (sidebar) =>
      Boolean(sidebar.querySelector(
        [
          "[data-app-action-sidebar-thread-row]",
          "[data-app-action-sidebar-thread-id]",
          "[data-app-action-sidebar-task-id]",
          "[data-sidebar-thread-id]",
        ].join(", "),
      ));

    const hasAllChatsSection = (sidebar) =>
      Boolean(sidebar.querySelector('[data-app-action-sidebar-section-heading="All chats"]'));

    const isChronologicalList = (sidebar = mainSidebar()) => {
      if (sidebar && hasAllChatsSection(sidebar)) return true;
      const mode = sidebarOrganizeMode();
      if (mode === "all") return true;
      if (mode === "project") return false;
      return Boolean(sidebar && hasThreadRows(sidebar) && !hasVisibleProjectRows(sidebar));
    };

    const projectInfoFor = (record) => {
      const fallbackLabel = typeof record === "string" ? record : record?.label;
      const cwd = typeof record?.cwd === "string" ? record.cwd : "";
      const live = liveProjectInfoFor(fallbackLabel, cwd);
      return {
        label: live.label || fallbackLabel || "",
        color: live.color || projectColorFor(live.label || fallbackLabel || ""),
      };
    };

    const projectColorFor = (label) => {
      const key = normalizeProjectName(label);
      const storedPrefs = api.storage.get(COLOR_STORAGE_KEY, {});
      const prefs = {
        ...(storedPrefs && typeof storedPrefs === "object" && !Array.isArray(storedPrefs)
          ? storedPrefs
          : {}),
        ...(window.__codexppSidebarProjectColorPrefs || {}),
      };
      const colors = {
        blue: "var(--color-token-charts-blue, var(--color-token-text-link-foreground))",
        green: "var(--color-token-charts-green, var(--color-token-text-secondary))",
        yellow: "var(--color-token-charts-yellow, var(--color-token-text-secondary))",
        red: "var(--color-token-charts-red, var(--color-token-text-secondary))",
        pink: "var(--pink-400, var(--color-token-charts-purple, var(--color-token-text-link-foreground)))",
        purple: "var(--color-token-charts-purple, var(--color-token-text-link-foreground))",
        gray: "var(--color-token-text-secondary)",
      };
      if (colors[prefs[key]]) return colors[prefs[key]];

      const auto = ["blue", "green", "yellow", "red"];
      let hash = 0;
      for (let i = 0; i < key.length; i += 1) {
        hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
      }
      return colors[auto[hash % auto.length]];
    };

    const liveProjectInfoFor = (label, cwd) => {
      const key = normalizeProjectName(label);
      const pathKey = normalizeProjectPath(cwd);
      const rows = document.querySelectorAll('[data-codexpp-sidebar-project-backgrounds="row"]');
      for (const row of rows) {
        if (!(row instanceof HTMLElement)) continue;
        const action = row.querySelector("[data-app-action-sidebar-project-id]");
        const projectPath = action instanceof HTMLElement
          ? normalizeProjectPath(action.getAttribute("data-app-action-sidebar-project-id"))
          : "";
        const rowLabelText =
          row.getAttribute("aria-label") ||
            row.getAttribute("title") ||
            "";
        const rowLabel = normalizeProjectName(rowLabelText);
        const pathMatches = pathKey && projectPath && (
          pathKey === projectPath ||
          pathKey.startsWith(`${projectPath}/`) ||
          projectPath.startsWith(`${pathKey}/`)
        );
        if (!pathMatches && (!key || rowLabel !== key)) continue;
        const color =
          row.style.getPropertyValue("--codexpp-project-tint").trim() ||
          window.getComputedStyle(row).getPropertyValue("--codexpp-project-tint").trim();
        return { label: rowLabelText, color };
      }
      return { label: "", color: "" };
    };

    const attrValue = (node, names) => {
      for (const name of names) {
        const value = node.getAttribute(name);
        if (value != null && value !== "") return value;
      }
      const suffixes = new Set(names.map((name) => name.split("-").at(-1)));
      for (const attr of Array.from(node.attributes || [])) {
        const name = attr.name.toLowerCase();
        if (!name.includes("sidebar") || !name.includes("thread")) continue;
        if (
          names.some((expected) => name.endsWith(expected.replace(/^data-/, ""))) ||
          Array.from(suffixes).some((suffix) => name.endsWith(`-${suffix}`))
        ) {
          return attr.value;
        }
      }
      return null;
    };

    const threadMeta = (node) => {
      if (!(node instanceof HTMLElement)) return null;
      const id = attrValue(node, [
        "data-app-action-sidebar-thread-id",
        "data-app-action-sidebar-task-id",
        "data-sidebar-thread-id",
      ]);
      const pinned = attrValue(node, [
        "data-app-action-sidebar-thread-pinned",
        "data-app-action-sidebar-task-pinned",
        "data-sidebar-thread-pinned",
      ]);
      const kind = attrValue(node, [
        "data-app-action-sidebar-thread-kind",
        "data-app-action-sidebar-task-kind",
        "data-sidebar-thread-kind",
      ]);
      const isPinned = String(pinned) === "true";
      if (!id || (kind && kind !== "local")) {
        return null;
      }
      return { id: normalizeThreadId(id), pinned: isPinned };
    };

    const threadRows = () => {
      const sidebar = mainSidebar();
      if (!sidebar) return [];
      const includeAllLocalChats = isChronologicalList(sidebar);
      const rows = new Map();
      const candidates = sidebar.querySelectorAll(
        [
          "[data-app-action-sidebar-thread-row]",
          "[data-app-action-sidebar-thread-id]",
          "[data-app-action-sidebar-task-id]",
          "[data-sidebar-thread-id]",
          "[data-app-action-sidebar-thread-pinned]",
          "[data-app-action-sidebar-task-pinned]",
          "[data-sidebar-thread-pinned]",
          "[role='listitem']",
        ].join(", "),
      );
      for (const node of candidates) {
        if (!(node instanceof HTMLElement)) continue;
        const source = threadMeta(node) ? node : node.querySelector?.(
          [
            "[data-app-action-sidebar-thread-row]",
            "[data-app-action-sidebar-thread-id]",
            "[data-app-action-sidebar-task-id]",
            "[data-sidebar-thread-id]",
            "[data-app-action-sidebar-thread-pinned]",
            "[data-app-action-sidebar-task-pinned]",
            "[data-sidebar-thread-pinned]",
          ].join(", "),
        );
        const meta = threadMeta(source);
        if (!meta?.id) continue;
        if (!meta.pinned && !includeAllLocalChats) continue;
        const row = source.closest("[role='listitem']") || source;
        const host = source instanceof HTMLElement ? source : row;
        if (row instanceof HTMLElement && host instanceof HTMLElement) {
          const title = findThreadTitle(host, row);
          rows.set(meta.id, { row, host, title, id: meta.id, pinned: meta.pinned });
        }
      }
      return Array.from(rows.values());
    };

    const findThreadTitle = (host, row) => {
      const selectors = [
        "[data-thread-title]",
        "[data-app-action-sidebar-thread-title]",
        "[data-app-action-sidebar-task-title]",
      ];
      for (const selector of selectors) {
        const node = host.querySelector(selector) || row.querySelector(selector);
        if (node instanceof HTMLElement) return node;
      }

      const title = attrValue(host, [
        "data-app-action-sidebar-thread-title",
        "data-app-action-sidebar-task-title",
        "data-sidebar-thread-title",
      ]);
      if (!title) return null;
      return Array.from(host.querySelectorAll("span, div"))
        .filter((node) => node instanceof HTMLElement)
        .find((node) => compactText(node.textContent) === compactText(title)) || null;
    };

    const backgroundTargetsFor = (host, row) => {
      const interactive = host?.closest?.(
        [
          "[role='button']",
          "a",
          "button",
          "[class*='hover:bg-token-list-hover-background']",
          "[class*='bg-token-list-selected-background']",
          "[class*='bg-token-list-hover-background']",
        ].join(", "),
      );
      if (interactive instanceof HTMLElement && row?.contains?.(interactive)) {
        return [interactive];
      }
      return host instanceof HTMLElement ? [host] : [];
    };

    const reconcileRowPaddingTargets = (row, targets) => {
      const active = new Set(targets);
      const marked = [
        row,
        ...Array.from(row?.querySelectorAll?.(`[${ROW_ATTR}="true"]`) || []),
      ];
      for (const node of marked) {
        if (node instanceof HTMLElement && !active.has(node)) {
          node.removeAttribute(ROW_ATTR);
        }
      }
    };

    const contentTargetFor = (host, title) => {
      if (!(host instanceof HTMLElement)) return null;
      if (title instanceof HTMLElement) {
        for (const child of Array.from(host.children)) {
          if (child instanceof HTMLElement && child.contains(title)) return child;
        }
        return title.parentElement instanceof HTMLElement ? title.parentElement : null;
      }
      return host.firstElementChild instanceof HTMLElement ? host.firstElementChild : null;
    };

    const setLabelInlinePosition = (node, host, title) => {
      if (!(node instanceof HTMLElement) || !(host instanceof HTMLElement)) return;
      const anchor = title instanceof HTMLElement ? title : host;
      const hostRect = host.getBoundingClientRect();
      const anchorRect = anchor.getBoundingClientRect();
      const left = Math.max(0, anchorRect.left - hostRect.left);
      const right = Math.max(0, hostRect.right - anchorRect.right);
      node.style.setProperty("--codexpp-pinned-chat-project-label-left", `${left}px`);
      node.style.setProperty("--codexpp-pinned-chat-project-label-right", `${right}px`);
    };

    const removeStaleLabels = (activeRows) => {
      const active = new Set(activeRows.map((item) => item.row));
      document.querySelectorAll(`[${ATTR}="label"]`).forEach((node) => {
        const row = node.closest("[role='listitem']");
        if (!row || !active.has(row)) node.remove();
      });
      document.querySelectorAll(`[${ATTR}="title-stack"], [${ATTR}="title"]`)
        .forEach((node) => node.removeAttribute(ATTR));
      document.querySelectorAll(`[${CONTENT_ATTR}="true"]`)
        .forEach((node) => {
          const row = node.closest("[role='listitem']");
          if (!row || !active.has(row)) {
            node.removeAttribute(CONTENT_ATTR);
          }
        });
      document.querySelectorAll(`[${COMPACT_ATTR}="true"]`).forEach((node) => {
        const row = node.closest("[role='listitem']");
        if (!row || !active.has(row)) node.removeAttribute(COMPACT_ATTR);
      });
      document.querySelectorAll(`[${ROW_ATTR}="true"]`).forEach((node) => {
        const row = node.closest("[role='listitem']");
        if (!row || !active.has(row)) node.removeAttribute(ROW_ATTR);
      });
    };

    const renderLabels = () => {
      const rows = threadRows();
      const showAllLocalChats = isChronologicalList();
      removeStaleLabels(rows);
      for (const { row, host, title, id, pinned } of rows) {
        const record = labels.get(id);
        const info = projectInfoFor(record);
        const label = info.label;
        const target = host instanceof HTMLElement ? host : row;
        const existing = target.querySelector(`[${ATTR}="label"]`);
        const contentTarget = contentTargetFor(target, title);
        if (!label) {
          existing?.remove();
          title?.removeAttribute(ATTR);
          target.removeAttribute(ATTR);
          contentTarget?.removeAttribute(CONTENT_ATTR);
          target.removeAttribute(COMPACT_ATTR);
          reconcileRowPaddingTargets(row, []);
          continue;
        }
        const paddingTargets = backgroundTargetsFor(host, row);
        reconcileRowPaddingTargets(row, paddingTargets);
        paddingTargets.forEach((node) =>
          node.setAttribute(ROW_ATTR, "true"),
        );
        title?.removeAttribute(ATTR);
        target.removeAttribute(ATTR);
        if (showAllLocalChats && !pinned) {
          target.setAttribute(COMPACT_ATTR, "true");
        } else {
          target.removeAttribute(COMPACT_ATTR);
        }
        contentTarget?.setAttribute(CONTENT_ATTR, "true");
        const node = existing instanceof HTMLElement
          ? existing
          : document.createElement("div");
        node.setAttribute(ATTR, "label");
        setLabelInlinePosition(node, target, title);
        node.style.setProperty("--codexpp-pinned-chat-project-color", info.color);
        const showDot = readFlag(api, "sidebar-project-backgrounds", true) && !showAllLocalChats;
        let dot = node.querySelector(`[${ATTR}="dot"]`);
        if (!showDot) {
          dot?.remove();
          dot = null;
        } else if (!(dot instanceof HTMLElement)) {
          dot = document.createElement("span");
          dot.setAttribute(ATTR, "dot");
        }
        let text = node.querySelector(`[${ATTR}="label-text"]`);
        if (!(text instanceof HTMLElement)) {
          text = document.createElement("span");
          text.setAttribute(ATTR, "label-text");
        }
        if (text.textContent !== label) text.textContent = label;
        if (showDot && dot && (dot.parentElement !== node || text.parentElement !== node)) {
          node.replaceChildren(dot, text);
        } else if (!showDot && (text.parentElement !== node || node.children.length !== 1)) {
          node.replaceChildren(text);
        }
        if (!node.parentElement) target.appendChild(node);
      }
    };

    const refreshLabels = async (force = false) => {
      const rows = threadRows();
      const ids = rows.map((row) => row.id);
      if (ids.length === 0) {
        removeStaleLabels([]);
        return;
      }
      const now = Date.now();
      if (!force && (refreshInFlight || now - lastRefreshAt < 10_000)) {
        renderLabels();
        return;
      }
      refreshInFlight = true;
      lastRefreshAt = now;
      try {
        const next = await api.ipc.invoke("pinned-chat-project-labels", ids);
        if (next && typeof next === "object") {
          labels.clear();
          for (const [id, value] of Object.entries(next)) {
            if (typeof value === "string" && value.trim()) {
              labels.set(normalizeThreadId(id), { label: value.trim(), cwd: "" });
            } else if (value && typeof value === "object") {
              const label = typeof value.label === "string" ? value.label.trim() : "";
              const cwd = typeof value.cwd === "string" ? value.cwd : "";
              if (label) labels.set(normalizeThreadId(id), { label, cwd });
            }
          }
        }
      } catch (e) {
        api.log.warn("[pinned-chat-project-names] labels unavailable", e);
      } finally {
        refreshInFlight = false;
        if (!disposed) renderLabels();
      }
    };

    let scheduled = false;
    const scheduleApply = () => {
      if (scheduled || disposed) return;
      scheduled = true;
      requestAnimationFrame(() => {
        scheduled = false;
        refreshLabels();
      });
    };

    refreshLabels(true);
    const observer = new MutationObserver(scheduleApply);
    observer.observe(document.body, { childList: true, subtree: true });
    const interval = window.setInterval(() => refreshLabels(true), 60_000);
    window.addEventListener("focus", scheduleApply);
    window.addEventListener("storage", scheduleApply);
    window.addEventListener("codexpp-ui-improvements-setting-changed", scheduleApply);
    document.addEventListener("visibilitychange", scheduleApply);

    api.log.info("pinned chat project names active");

    return () => {
      disposed = true;
      observer.disconnect();
      window.clearInterval(interval);
      window.removeEventListener("focus", scheduleApply);
      window.removeEventListener("storage", scheduleApply);
      window.removeEventListener("codexpp-ui-improvements-setting-changed", scheduleApply);
      document.removeEventListener("visibilitychange", scheduleApply);
      document.querySelectorAll(`[${ATTR}="label"]`).forEach((node) => node.remove());
      document.querySelectorAll(`[${ATTR}], [${ROW_ATTR}="true"], [${CONTENT_ATTR}="true"], [${COMPACT_ATTR}="true"]`).forEach((node) => {
        node.removeAttribute?.(ATTR);
        node.removeAttribute?.(ROW_ATTR);
        node.removeAttribute?.(CONTENT_ATTR);
        node.removeAttribute?.(COMPACT_ATTR);
      });
      style.remove();
    };
  },

  /**
   * Add subtle grouped backgrounds behind project rows in the main sidebar.
   *
   * Codex's sidebar project rows are `div[role="listitem"]` nodes with
   * class `group/cwd` and an aria-label matching the child folder button.
   * We mark that row directly, then color the folder icon/title and any
   * unread indicator with the row's project theme.
   *
   * We only mark existing nodes and inject token-based CSS. No wrapping,
   * no synthetic click targets, and cleanup restores the original DOM.
   */
  "sidebar-project-backgrounds"(api) {
    const STYLE_ID = "codexpp-sidebar-project-backgrounds";
    const ATTR = "data-codexpp-sidebar-project-backgrounds";
    const MENU_ATTR = "data-codexpp-sidebar-project-color-menu";
    const COLOR_STORAGE_KEY = "sidebar-project-backgrounds:colors";
    const ASIDE_SELECTOR = [
      "aside.pointer-events-auto.relative.flex.overflow-hidden",
      "aside.pointer-events-auto.relative.flex.overflow-visible",
      "aside.pointer-events-auto.relative.flex",
    ].join(", ");
    const EXCLUDED_LABELS = new Set([
      "account",
      "automations",
      "get plus",
      "help",
      "new chat",
      "add new project",
      "collapse all",
      "filter sidebar chats",
      "performance boost",
      "pinned",
      "plugins",
      "projects",
      "rate limits",
      "search",
      "settings",
      "subway surfers",
      "ui improvements",
      "upgrade",
      "upgrade plan",
    ]);
    const PALETTE = [
      {
        id: "blue",
        label: "Blue",
        value: "var(--color-token-charts-blue, var(--color-token-text-link-foreground))",
        textValue: "var(--codexpp-project-blue-text)",
      },
      {
        id: "green",
        label: "Green",
        value: "var(--color-token-charts-green, var(--color-token-text-secondary))",
        textValue: "var(--codexpp-project-green-text)",
      },
      {
        id: "yellow",
        label: "Yellow",
        value: "var(--color-token-charts-yellow, var(--color-token-text-secondary))",
        textValue: "var(--codexpp-project-yellow-text)",
      },
      {
        id: "red",
        label: "Red",
        value: "var(--color-token-charts-red, var(--color-token-text-secondary))",
        textValue: "var(--codexpp-project-red-text)",
      },
      {
        id: "pink",
        label: "Pink",
        value: "var(--pink-400, var(--color-token-charts-purple, var(--color-token-text-link-foreground)))",
        textValue: "var(--codexpp-project-pink-text)",
      },
      {
        id: "purple",
        label: "Purple",
        value: "var(--color-token-charts-purple, var(--color-token-text-link-foreground))",
        textValue: "var(--codexpp-project-purple-text)",
      },
      {
        id: "gray",
        label: "Gray",
        value: "var(--color-token-text-secondary)",
        textValue: "var(--codexpp-project-gray-text)",
      },
    ];
    const colorPrefsCacheKey = "__codexppSidebarProjectColorPrefs";
    let colorPrefs = readColorPrefs();
    window[colorPrefsCacheKey] = colorPrefs;
    let pendingContextMenu = null;
    let menu = null;
    let disposed = false;

    document.getElementById(STYLE_ID)?.remove();
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      :root {
        --codexpp-project-blue-text: var(--color-token-charts-blue, var(--color-token-text-link-foreground));
        --codexpp-project-green-text: color-mix(in srgb, var(--color-token-charts-green, currentColor) 72%, black);
        --codexpp-project-yellow-text: color-mix(in srgb, var(--color-token-charts-yellow, currentColor) 42%, black);
        --codexpp-project-red-text: color-mix(in srgb, var(--color-token-charts-red, currentColor) 82%, black);
        --codexpp-project-pink-text: color-mix(in srgb, var(--pink-400, var(--color-token-charts-purple, currentColor)) 68%, black);
        --codexpp-project-purple-text: color-mix(in srgb, var(--color-token-charts-purple, currentColor) 82%, black);
        --codexpp-project-gray-text: color-mix(in srgb, var(--color-token-text-primary, currentColor) 25%, black);
      }

      .electron-dark {
        --codexpp-project-blue-text: var(--color-token-text-link-foreground, var(--color-token-charts-blue));
        --codexpp-project-green-text: var(--color-token-charts-green, var(--color-token-text-primary));
        --codexpp-project-yellow-text: var(--color-token-charts-yellow, var(--color-token-text-primary));
        --codexpp-project-red-text: color-mix(in srgb, var(--color-token-charts-red, currentColor) 86%, white);
        --codexpp-project-pink-text: var(--pink-400, var(--color-token-charts-purple, var(--color-token-text-primary)));
        --codexpp-project-purple-text: color-mix(in srgb, var(--color-token-charts-purple, currentColor) 88%, white);
        --codexpp-project-gray-text: var(--color-token-text-secondary);
      }

      [${ATTR}="row"] {
        position: relative !important;
        border-radius: var(--radius-md, 0.375rem) !important;
        background-color: color-mix(
          in srgb,
          var(--codexpp-project-tint, var(--color-token-text-secondary)) 7%,
          transparent
        ) !important;
        box-shadow:
          inset 0 0 0 1px color-mix(
            in srgb,
            var(--codexpp-project-text-color, var(--codexpp-project-tint, var(--color-token-text-secondary))) 30%,
            transparent
          ) !important;
      }

      .electron-dark [${ATTR}="row"] {
        box-shadow:
          inset 0 0 0 1px color-mix(
            in srgb,
            var(--codexpp-project-text-color, var(--codexpp-project-tint, var(--color-token-text-secondary))) 22%,
            transparent
          ) !important;
      }

      [${ATTR}="row"][style*="--codexpp-project-blue-token-override"] {
        --color-accent-blue: var(--codexpp-project-blue-token-override);
        --color-token-charts-blue: var(--codexpp-project-blue-token-override);
        --vscode-charts-blue: var(--codexpp-project-blue-token-override);
        --vscode-terminal-ansiBlue: var(--codexpp-project-blue-token-override);
        --vscode-terminal-ansiBrightBlue: var(--codexpp-project-blue-token-override);
      }

      [${ATTR}="row"][style*="--codexpp-project-link-token-override"] {
        --color-token-text-link-foreground: var(--codexpp-project-link-token-override);
        --color-token-text-link-active-foreground: var(--codexpp-project-link-token-override);
        --vscode-textLink-foreground: var(--codexpp-project-link-token-override);
        --vscode-textLink-activeForeground: var(--codexpp-project-link-token-override);
      }

      [${ATTR}="project-list"] {
        display: flex !important;
        flex-direction: column !important;
        gap: 4px !important;
      }

      [${ATTR}="row"]:hover {
        background-color: color-mix(
          in srgb,
          var(--codexpp-project-tint, var(--color-token-text-secondary)) 10%,
          transparent
        ) !important;
      }

      [${ATTR}="icon"],
      [${ATTR}="title"] {
        color: var(--codexpp-project-text-color, var(--codexpp-project-tint, currentColor)) !important;
      }

      [${ATTR}="unread"] {
        background-color: var(--codexpp-project-tint, currentColor) !important;
        color: var(--codexpp-project-tint, currentColor) !important;
        fill: var(--codexpp-project-tint, currentColor) !important;
        stroke: var(--codexpp-project-tint, currentColor) !important;
      }

      [${ATTR}="row"] [class*="bg-token-charts-blue"],
      [${ATTR}="row"] [class*="bg-token-accent"],
      [${ATTR}="row"] [class*="bg-token-link"],
      [${ATTR}="row"] [data-testid*="unread" i],
      [${ATTR}="row"] [aria-label*="unread" i] {
        background-color: var(--codexpp-project-tint, currentColor) !important;
      }

      [${ATTR}="row"] [class*="text-token-charts-blue"],
      [${ATTR}="row"] [class*="text-token-accent"],
      [${ATTR}="row"] [class*="text-token-link"],
      [${ATTR}="row"] [data-testid*="unread" i],
      [${ATTR}="row"] [aria-label*="unread" i] {
        color: var(--codexpp-project-tint, currentColor) !important;
        fill: var(--codexpp-project-tint, currentColor) !important;
        stroke: var(--codexpp-project-tint, currentColor) !important;
      }

      aside.pointer-events-auto.relative.flex.overflow-hidden
        [role="button"].hover\\:bg-token-list-hover-background:not(.group\\/folder-row),
      aside.pointer-events-auto.relative.flex.overflow-visible
        [role="button"].hover\\:bg-token-list-hover-background:not(.group\\/folder-row) {
        margin-inline: 4px !important;
        width: calc(100% - 8px) !important;
      }

      [${MENU_ATTR}="root"] {
        position: fixed;
        z-index: 2147483647;
        min-width: 180px;
        border: 1px solid var(--color-token-border, var(--color-border)) !important;
        border-radius: var(--radius-lg, 0.5rem);
        background: var(--color-background-panel, var(--color-token-bg-fog));
        box-shadow: var(--shadow-lg, 0 10px 24px rgb(0 0 0 / 0.16));
        padding: var(--spacing-1, 0.25rem);
      }

      [${MENU_ATTR}="item"] {
        width: 100%;
        border-radius: var(--radius-md, 0.375rem);
      }

      [${MENU_ATTR}="swatch"] {
        background-color: var(--codexpp-project-menu-color, currentColor);
      }

      [${MENU_ATTR}="trigger"] {
        color: var(--color-token-foreground);
      }
    `;
    document.head.appendChild(style);

    const normalize = (value) =>
      String(value || "").replace(/\s+/g, " ").trim().toLowerCase();

    const visible = (node) => {
      if (!(node instanceof HTMLElement) || !node.isConnected) return false;
      if (node.closest("[hidden], [inert], [aria-hidden='true']")) return false;
      const style = window.getComputedStyle(node);
      if (
        style.display === "none" ||
        style.visibility === "hidden" ||
        style.opacity === "0"
      ) {
        return false;
      }
      const rect = node.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    };

    const mainSidebar = () => {
      const aside = document.querySelector(ASIDE_SELECTOR);
      return aside instanceof HTMLElement ? aside : null;
    };

    const labelFor = (node) =>
      normalize(
        node.getAttribute("aria-label") ||
          node.getAttribute("title") ||
          node.textContent ||
          "",
      ).replace(/\s*[⌘⇧⌥⌃^].*$/, "");

    const isProjectRow = (node) => {
      if (!(node instanceof HTMLElement)) return false;
      if (!visible(node)) return false;
      if (node.getAttribute("role") !== "listitem") return false;
      if (!node.classList.contains("group/cwd")) return false;

      const text = labelFor(node);
      if (!text || text.length < 2 || text.length > 80) return false;
      if (EXCLUDED_LABELS.has(text)) return false;

      const action = node.querySelector("[role='button'][aria-label]");
      return action instanceof HTMLElement && labelFor(action) === text;
    };

    const candidateRows = (sidebar) =>
      Array.from(sidebar.querySelectorAll("div[role='listitem'][aria-label]"))
        .filter(isProjectRow)
        .filter((node, index, rows) => rows.indexOf(node) === index);

    const clearMarks = () => {
      document.querySelectorAll(`[${ATTR}]`).forEach((node) => {
        if (!(node instanceof Element)) return;
        node.removeAttribute(ATTR);
        node.removeAttribute("data-codexpp-sidebar-project-expanded");
        if ("style" in node) {
          node.style.removeProperty("--codexpp-project-tint");
          node.style.removeProperty("--codexpp-project-text-color");
          node.style.removeProperty("--codexpp-project-blue-token-override");
          node.style.removeProperty("--codexpp-project-link-token-override");
        }
      });
    };

    const paletteFor = (text) => {
      const stored = colorPrefs[projectKey(text)];
      const match = PALETTE.find((color) => color.id === stored);
      if (match) return match;

      let hash = 0;
      for (let i = 0; i < text.length; i += 1) {
        hash = (hash * 31 + text.charCodeAt(i)) >>> 0;
      }
      return PALETTE[hash % 4];
    };

    const tintFor = (text) => paletteFor(text).value;

    const textColorFor = (text) => {
      const color = paletteFor(text);
      return color.textValue || color.value;
    };

    const blueTokenOverrideFor = (text) => {
      const color = paletteFor(text);
      return color.id === "blue" ? "" : color.value;
    };

    const linkTokenOverrideFor = (text) => {
      const color = paletteFor(text);
      return color.id === "blue" ? "" : textColorFor(text);
    };

    const markRows = (rows) => {
      reconcileProjectLists(rows);
      for (const row of rows) {
        if (!(row instanceof HTMLElement)) continue;
        const label = labelFor(row);
        setAttr(row, ATTR, "row");
        setAttr(row, "data-codexpp-sidebar-project-expanded", String(isExpandedProject(row)));
        setStyleVar(row, "--codexpp-project-tint", tintFor(label));
        setStyleVar(row, "--codexpp-project-text-color", textColorFor(label));
        setOptionalStyleVar(row, "--codexpp-project-blue-token-override", blueTokenOverrideFor(label));
        setOptionalStyleVar(row, "--codexpp-project-link-token-override", linkTokenOverrideFor(label));
        markProjectParts(row, label);
      }
    };

    const reconcileProjectLists = (rows) => {
      const parents = new Set(
        rows
          .map((row) => row.parentElement)
          .filter((node) => node instanceof HTMLElement),
      );
      document.querySelectorAll(`[${ATTR}="project-list"]`).forEach((node) => {
        if (!parents.has(node)) node.removeAttribute(ATTR);
      });
      for (const parent of parents) {
        setAttr(parent, ATTR, "project-list");
      }
    };

    const projectKey = (label) => normalize(label);

    function readColorPrefs() {
      const value = api.storage.get(COLOR_STORAGE_KEY, {});
      const stored = value && typeof value === "object" && !Array.isArray(value) ? value : {};
      const cached = window[colorPrefsCacheKey];
      return cached && typeof cached === "object" && !Array.isArray(cached)
        ? { ...stored, ...cached }
        : stored;
    }

    const writeColorPrefs = () => {
      colorPrefs = { ...colorPrefs };
      window[colorPrefsCacheKey] = colorPrefs;
      return api.storage.set(COLOR_STORAGE_KEY, colorPrefs);
    };

    const isExpandedProject = (row) => {
      if (row.getBoundingClientRect().height > 40) return true;
      return Boolean(row.querySelector('[role="list"][aria-label]'));
    };

    const markProjectParts = (row, label) => {
      const header = Array.from(row.querySelectorAll("[role='button'][aria-label]"))
        .find((node) => node instanceof HTMLElement && labelFor(node) === label);
      const target = header instanceof HTMLElement ? header : row.querySelector("[role='button'][aria-label]");
      if (!(target instanceof HTMLElement)) return;

      target.querySelectorAll("svg").forEach((node) => {
        if (node instanceof SVGElement) setAttr(node, ATTR, "icon");
      });

      const title = Array.from(target.querySelectorAll("span"))
        .filter((node) => node instanceof HTMLElement && normalize(node.textContent) === normalize(label))
        .sort((a, b) => b.getBoundingClientRect().width - a.getBoundingClientRect().width)[0];
      if (title instanceof HTMLElement) setAttr(title, ATTR, "title");

      row.querySelectorAll(
        [
          '[class*="bg-token-charts-blue"]',
          '[class*="bg-token-accent"]',
          '[class*="bg-token-link"]',
          '[class*="text-token-charts-blue"]',
          '[class*="text-token-accent"]',
          '[class*="text-token-link"]',
          '[class*="unread" i]',
          '[data-testid*="unread" i]',
          '[aria-label*="unread" i]',
        ].join(", "),
      )
        .forEach((node) => {
          if (node instanceof HTMLElement) setAttr(node, ATTR, "unread");
        });
    };

    const projectPathForRow = (row) => {
      const action = row?.querySelector?.("[data-app-action-sidebar-project-id]");
      const value = action instanceof HTMLElement
        ? action.getAttribute("data-app-action-sidebar-project-id")
        : null;
      return value || null;
    };

    const numberOrClient = (value, fallback) =>
      typeof value === "number" && Number.isFinite(value) ? value : fallback;

    const seedProjectMenu = (label, event, anchor, row) => {
      const anchorRect = anchor?.getBoundingClientRect?.();
      pendingContextMenu = {
        label,
        projectPath: projectPathForRow(row),
        x: numberOrClient(event?.clientX, anchorRect?.right ?? anchorRect?.left ?? 0),
        y: numberOrClient(event?.clientY, anchorRect?.top ?? 0),
        at: Date.now(),
      };
      [0, 50, 150, 350].forEach((delay) =>
        window.setTimeout(injectColorMenuIntoNativeMenu, delay),
      );
    };

    const findProjectOverflowButton = (row, label) =>
      Array.from(row.querySelectorAll("button, [role='button']"))
        .filter((node) => isProjectOverflowButton(row, label, node))
        .sort((a, b) => b.getBoundingClientRect().right - a.getBoundingClientRect().right)[0] || null;

    const isProjectOverflowButton = (row, label, button) => {
      if (!(button instanceof HTMLElement) || !row.contains(button) || !visible(button)) {
        return false;
      }
      if (labelFor(button) === label) return false;
      const rect = button.getBoundingClientRect();
      if (rect.width > 52 || rect.height > 52) return false;
      const text = normalize(button.textContent || "");
      const aria = normalize(button.getAttribute("aria-label") || "");
      return (
        !text ||
        aria.includes("more") ||
        aria.includes("menu") ||
        button.getAttribute("aria-haspopup") === "menu" ||
        Boolean(button.querySelector("svg"))
      );
    };

    const onProjectOverflowTrigger = (event) => {
      const button = event.target?.closest?.("button, [role='button']");
      if (!(button instanceof HTMLElement)) return;
      const row = button.closest("div[role='listitem'][aria-label]");
      if (!isProjectRow(row)) return;
      const label = labelFor(row);
      if (!isProjectOverflowButton(row, label, button)) return;
      seedProjectMenu(label, event, button, row);
    };

    const onProjectContextMenu = (event) => {
      const row = event.target?.closest?.("div[role='listitem'][aria-label]");
      if (!isProjectRow(row)) return;
      seedProjectMenu(labelFor(row), event, row, row);
    };

    const openColorMenu = (label, x, y, anchor) => {
      closeMenu();
      const selected = colorPrefs[projectKey(label)] || "auto";
      menu = document.createElement("div");
      menu.setAttribute(MENU_ATTR, "root");
      menu.className = "flex flex-col gap-0.5";

      const title = document.createElement("div");
      title.className = "px-2 py-1 text-xs text-token-text-secondary";
      title.textContent = "Project color";
      menu.appendChild(title);

      const options = [
        { id: "auto", label: "Auto", value: "var(--color-token-text-secondary)" },
        ...PALETTE,
      ];
      for (const option of options) {
        const item = document.createElement("button");
        item.type = "button";
        item.setAttribute(MENU_ATTR, "item");
        item.setAttribute("data-color-id", option.id);
        item.className =
          "flex h-token-button-composer items-center gap-2 px-2 text-left text-sm " +
          "text-token-text-primary hover:bg-token-foreground/10 cursor-interaction";
        item.setAttribute("aria-pressed", String(selected === option.id));

        const swatch = document.createElement("span");
        swatch.setAttribute(MENU_ATTR, "swatch");
        swatch.className = "size-3 shrink-0 rounded-full border border-token-border";
        swatch.style.setProperty("--codexpp-project-menu-color", option.value);

        const text = document.createElement("span");
        text.className = "min-w-0 flex-1 truncate";
        text.textContent = option.label;

        const check = document.createElement("span");
        check.setAttribute(MENU_ATTR, "check");
        check.className = "text-token-text-secondary";
        check.textContent = selected === option.id ? "✓" : "";

        item.append(swatch, text, check);
        item.addEventListener("click", async (event) => {
          event.preventDefault();
          event.stopPropagation();
          if (option.id === "auto") delete colorPrefs[projectKey(label)];
          else colorPrefs[projectKey(label)] = option.id;
          applyColorToCurrentRows(label);
          syncNativeMenuChecks(label);
          try {
            await writeColorPrefs();
          } catch (e) {
            api.log.warn("sidebar project color write failed", e);
          }
          applyColorToCurrentRows(label);
          closeMenu();
          scheduleApply();
        });
        menu.appendChild(item);
      }

      document.body.appendChild(menu);
      const rect = menu.getBoundingClientRect();
      const anchorRect = anchor?.getBoundingClientRect?.();
      const left = anchorRect ? anchorRect.right + 4 : x;
      const top = anchorRect ? anchorRect.top : y;
      menu.style.left = `${Math.max(8, Math.min(left, window.innerWidth - rect.width - 8))}px`;
      menu.style.top = `${Math.max(8, Math.min(top, window.innerHeight - rect.height - 8))}px`;

      window.setTimeout(() => {
        document.addEventListener("pointerdown", closeMenuOnOutside, true);
        document.addEventListener("keydown", closeMenuOnKey, true);
      }, 0);
    };

    function closeMenu() {
      document.removeEventListener("pointerdown", closeMenuOnOutside, true);
      document.removeEventListener("keydown", closeMenuOnKey, true);
      menu?.remove();
      menu = null;
    }

    function closeMenuOnOutside(event) {
      if (menu?.contains(event.target)) return;
      closeMenu();
    }

    function closeMenuOnKey(event) {
      if (event.key === "Escape") closeMenu();
    }

    const injectColorMenuIntoNativeMenu = () => {
      if (!pendingContextMenu || Date.now() - pendingContextMenu.at > 1500) return;
      const nativeMenu = findNativeContextMenu(pendingContextMenu.x, pendingContextMenu.y);
      if (!nativeMenu || nativeMenu.querySelector(`[${MENU_ATTR}="trigger"]`)) return;

      const nativeItem = nativeMenu.querySelector('[role="menuitem"]');
      const copyPathItem = createNativeMenuItem({
        nativeItem,
        attr: "copy-path",
        label: "Copy folder path",
        icon: copyPathIcon(),
        onActivate: async (event) => {
          event?.preventDefault?.();
          event?.stopPropagation?.();
          const projectPath = pendingContextMenu?.projectPath;
          if (!projectPath) return;
          try {
            await copyText(projectPath);
          } catch (e) {
            api.log.warn("copy project path failed", e);
          }
          nativeMenu.remove();
        },
      });

      const trigger = document.createElement("div");
      trigger.setAttribute("role", "menuitem");
      trigger.setAttribute("tabindex", "-1");
      trigger.setAttribute("data-orientation", "vertical");
      trigger.setAttribute(MENU_ATTR, "trigger");
      trigger.className =
        nativeItem instanceof HTMLElement && nativeItem.className
          ? nativeItem.className
          : "text-token-foreground outline-hidden rounded-lg px-[var(--padding-row-x)] " +
            "py-[var(--padding-row-y)] text-sm electron:text-base flex w-full items-center " +
            "group hover:bg-token-list-hover-background focus:bg-token-list-hover-background " +
            "cursor-interaction";
      trigger.classList.remove("w-full", "items-center", "gap-2");
      trigger.classList.add("flex", "flex-col");

      const row = document.createElement("div");
      row.className = "flex w-full items-center gap-1.5";

      const label = document.createElement("span");
      label.className = "flex-1 min-w-0 truncate";
      label.textContent = "Project color";

      const chevron = document.createElement("span");
      chevron.className = "text-token-text-secondary";
      chevron.textContent = "›";

      row.append(projectColorIcon(), label, chevron);
      trigger.appendChild(row);
      const open = (event) => {
        event?.preventDefault?.();
        event?.stopPropagation?.();
        openColorMenu(pendingContextMenu.label, pendingContextMenu.x, pendingContextMenu.y, trigger);
      };
      trigger.addEventListener("pointerenter", open);
      trigger.addEventListener("focus", open);
      trigger.addEventListener("click", open);
      const removeItem = findRemoveMenuItem(nativeMenu);
      nativeMenu.insertBefore(copyPathItem, removeItem);
      nativeMenu.insertBefore(trigger, removeItem);
    };

    const createNativeMenuItem = ({ nativeItem, attr, label, icon, onActivate }) => {
      const item = document.createElement("div");
      item.setAttribute("role", "menuitem");
      item.setAttribute("tabindex", "-1");
      item.setAttribute("data-orientation", "vertical");
      item.setAttribute(MENU_ATTR, attr);
      item.className =
        nativeItem instanceof HTMLElement && nativeItem.className
          ? nativeItem.className
          : "text-token-foreground outline-hidden rounded-lg px-[var(--padding-row-x)] " +
            "py-[var(--padding-row-y)] text-sm electron:text-base flex flex-col " +
            "group hover:bg-token-list-hover-background focus:bg-token-list-hover-background " +
            "cursor-interaction";
      item.classList.remove("w-full", "items-center", "gap-2");
      item.classList.add("flex", "flex-col");

      const row = document.createElement("div");
      row.className = "flex w-full items-center gap-1.5";

      const text = document.createElement("span");
      text.className = "flex-1 min-w-0 truncate";
      text.textContent = label;

      row.append(icon, text);
      item.appendChild(row);
      item.addEventListener("click", onActivate);
      return item;
    };

    const copyText = async (text) => {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        return;
      }
      const input = document.createElement("textarea");
      input.value = text;
      input.setAttribute("readonly", "");
      input.style.cssText = "position:fixed;left:-9999px;top:-9999px;";
      document.body.appendChild(input);
      input.select();
      document.execCommand("copy");
      input.remove();
    };

    const copyPathIcon = () => {
      const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      icon.setAttribute("width", "20");
      icon.setAttribute("height", "20");
      icon.setAttribute("viewBox", "0 0 20 20");
      icon.setAttribute("fill", "none");
      icon.setAttribute("aria-hidden", "true");
      icon.classList.add(
        "icon-xs",
        "shrink-0",
        "opacity-75",
        "group-focus:opacity-100",
        "group-hover:opacity-100",
      );

      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute(
        "d",
        "M7.5 5.5V4.75C7.5 3.78 8.28 3 9.25 3H14C14.97 3 15.75 3.78 15.75 4.75V11.5C15.75 12.47 14.97 13.25 14 13.25H13.25M6 6.75H10.75C11.72 6.75 12.5 7.53 12.5 8.5V15.25C12.5 16.22 11.72 17 10.75 17H6C5.03 17 4.25 16.22 4.25 15.25V8.5C4.25 7.53 5.03 6.75 6 6.75Z",
      );
      path.setAttribute("stroke", "currentColor");
      path.setAttribute("stroke-width", "1.35");
      path.setAttribute("stroke-linecap", "round");
      path.setAttribute("stroke-linejoin", "round");
      icon.appendChild(path);
      return icon;
    };

    const projectColorIcon = () => {
      const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      icon.setAttribute("width", "16");
      icon.setAttribute("height", "16");
      icon.setAttribute("viewBox", "0 0 16 16");
      icon.setAttribute("fill", "none");
      icon.setAttribute("aria-hidden", "true");
      icon.classList.add(
        "icon-xs",
        "shrink-0",
        "opacity-75",
        "group-focus:opacity-100",
        "group-hover:opacity-100",
      );

      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute(
        "d",
        "M8 2.25C4.82 2.25 2.25 4.59 2.25 7.47C2.25 10.16 4.34 12.08 6.86 12.08H7.7C8.22 12.08 8.59 12.58 8.44 13.08C8.27 13.67 8.7 14.25 9.31 14.25C11.83 14.25 13.75 11.61 13.75 8.18C13.75 4.91 11.17 2.25 8 2.25Z M5.05 7.25H5.06 M6.4 5.05H6.41 M9.05 4.85H9.06 M10.95 7.05H10.96",
      );
      path.setAttribute("stroke", "currentColor");
      path.setAttribute("stroke-width", "1.45");
      path.setAttribute("stroke-linecap", "round");
      path.setAttribute("stroke-linejoin", "round");
      icon.appendChild(path);
      return icon;
    };

    const findRemoveMenuItem = (nativeMenu) =>
      Array.from(nativeMenu.querySelectorAll('[role="menuitem"]')).find((item) => {
        const text = normalize(item.textContent || "");
        return text === "remove" || text === "delete" || text.includes("remove from");
      }) || null;

    const findNativeContextMenu = (x, y) => {
      const menus = Array.from(document.querySelectorAll('[role="menu"][data-state="open"]'))
        .filter((node) => node instanceof HTMLElement && !node.hasAttribute(MENU_ATTR));
      return menus
        .map((node) => ({ node, rect: node.getBoundingClientRect() }))
        .filter(({ rect }) => rect.width > 0 && rect.height > 0)
        .sort((a, b) => {
          const da = Math.abs(a.rect.left - x) + Math.abs(a.rect.top - y);
          const db = Math.abs(b.rect.left - x) + Math.abs(b.rect.top - y);
          return da - db;
        })[0]?.node || null;
    };

    const syncNativeMenuChecks = (label) => {
      const selected = colorPrefs[projectKey(label)] || "auto";
      menu?.querySelectorAll(`[${MENU_ATTR}="item"]`).forEach((item) => {
        const id = item.getAttribute("data-color-id");
        item.setAttribute("aria-pressed", String(id === selected));
        const check = item.querySelector(`[${MENU_ATTR}="check"]`);
        if (check) check.textContent = id === selected ? "✓" : "";
      });
    };

    const applyColorToCurrentRows = (label) => {
      const sidebar = mainSidebar();
      if (!sidebar) return;
      const rows = candidateRows(sidebar).filter((row) => labelFor(row) === projectKey(label));
      markRows(rows);
    };


    const apply = () => {
      const sidebar = mainSidebar();
      if (!sidebar) {
        return;
      }

      let rows = candidateRows(sidebar);
      rows = rows.filter((node, index) => rows.indexOf(node) === index);
      const seenLabels = new Set();
      rows = rows.filter((node) => {
        const label = labelFor(node);
        if (!label || seenLabels.has(label)) return false;
        seenLabels.add(label);
        return true;
      });
      if (!rows.length) {
        return;
      }

      reconcileMarkedRows(rows);
      markRows(rows);
      if (apply._lastCount !== rows.length) {
        apply._lastCount = rows.length;
        api.log.info("sidebar project backgrounds marked rows", {
          count: rows.length,
          labels: rows.slice(0, 8).map(labelFor),
        });
      }
    };

    const reconcileMarkedRows = (rows) => {
      const active = new Set(rows);
      document.querySelectorAll(`[${ATTR}="row"]`).forEach((row) => {
        if (!(row instanceof HTMLElement)) return;
        if (active.has(row) && row.isConnected) return;
        clearRowMarks(row);
      });
    };

    const clearRowMarks = (row) => {
      row.removeAttribute(ATTR);
      row.removeAttribute("data-codexpp-sidebar-project-expanded");
      row.style.removeProperty("--codexpp-project-tint");
      row.style.removeProperty("--codexpp-project-text-color");
      row.style.removeProperty("--codexpp-project-blue-token-override");
      row.style.removeProperty("--codexpp-project-link-token-override");
      row.querySelectorAll(`[${ATTR}]`).forEach((node) => node.removeAttribute(ATTR));
    };

    const setAttr = (node, name, value) => {
      if (node.getAttribute(name) !== value) node.setAttribute(name, value);
    };

    const setStyleVar = (node, name, value) => {
      if (node.style.getPropertyValue(name) !== value) node.style.setProperty(name, value);
    };

    const setOptionalStyleVar = (node, name, value) => {
      if (value) setStyleVar(node, name, value);
      else if (node.style.getPropertyValue(name)) node.style.removeProperty(name);
    };

    let scheduled = false;
    let scheduleFrame = 0;
    let scheduleTimer = 0;
    const runScheduledApply = () => {
      if (!scheduled) return;
      scheduled = false;
      if (scheduleFrame) {
        cancelAnimationFrame(scheduleFrame);
        scheduleFrame = 0;
      }
      if (scheduleTimer) {
        window.clearTimeout(scheduleTimer);
        scheduleTimer = 0;
      }
      if (disposed) return;
      apply();
    };

    const scheduleApply = () => {
      if (scheduled || disposed) return;
      scheduled = true;
      scheduleFrame = requestAnimationFrame(runScheduledApply);
      scheduleTimer = window.setTimeout(runScheduledApply, 80);
    };

    let childListFrame = 0;
    const scheduleApplySoon = () => {
      if (disposed || childListFrame) return;
      childListFrame = requestAnimationFrame(() => {
        childListFrame = 0;
        scheduleApply();
      });
    };

    apply();
    scheduleApply();
    const retryTimers = [250, 1000, 2500].map((delay) =>
      window.setTimeout(scheduleApply, delay),
    );
    const observer = new MutationObserver(scheduleApplySoon);
    observer.observe(document.body, {
      attributes: true,
      attributeFilter: [
        "aria-label",
        "class",
        "data-app-action-sidebar-project-collapsed",
        "data-app-action-sidebar-project-id",
        "data-app-action-sidebar-project-label",
        "data-app-action-sidebar-project-row",
        "data-codexpp-sidebar-project-expanded",
        ATTR,
        "role",
        "style",
      ],
      childList: true,
      subtree: true,
    });
    document.addEventListener("contextmenu", onProjectContextMenu, true);
    document.addEventListener("pointerdown", onProjectOverflowTrigger, true);
    document.addEventListener("click", onProjectOverflowTrigger, true);
    window.addEventListener("focus", scheduleApply);
    document.addEventListener("visibilitychange", scheduleApply);

    api.log.info("sidebar project backgrounds active");

    return () => {
      disposed = true;
      observer.disconnect();
      if (childListFrame) cancelAnimationFrame(childListFrame);
      if (scheduleFrame) cancelAnimationFrame(scheduleFrame);
      if (scheduleTimer) window.clearTimeout(scheduleTimer);
      retryTimers.forEach((timer) => window.clearTimeout(timer));
      document.removeEventListener("contextmenu", onProjectContextMenu, true);
      document.removeEventListener("pointerdown", onProjectOverflowTrigger, true);
      document.removeEventListener("click", onProjectOverflowTrigger, true);
      window.removeEventListener("focus", scheduleApply);
      document.removeEventListener("visibilitychange", scheduleApply);
      closeMenu();
      clearMarks();
      style.remove();
    };
  },

  /**
   * Add a Codex-native hover line to assistant messages with turn metrics.
   * Metrics are read from the main process, which parses Codex's local
   * `token_count` + `task_complete` JSONL events.
   */
  "show-message-metrics-on-hover"(api) {
    const mounted = new Map();
    const streamStats = new WeakMap();
    let metrics = [];
    let disposed = false;
    let scanScheduled = false;
    let scanTimer = 0;
    let lastScanAt = 0;
    const SCAN_THROTTLE_MS = 500;

    const refreshMetrics = async () => {
      try {
        const next = await api.ipc.invoke("message-metrics");
        if (Array.isArray(next)) {
          metrics = next;
          scheduleScan();
        }
      } catch (e) {
        api.log.warn("[message-metrics] metrics unavailable", e);
      }
    };

    const scheduleScan = () => {
      if (scanScheduled || disposed) return;
      scanScheduled = true;
      const delay = Math.max(0, SCAN_THROTTLE_MS - (Date.now() - lastScanAt));
      const run = () => {
        scanTimer = 0;
        requestAnimationFrame(() => {
          scanScheduled = false;
          lastScanAt = Date.now();
          scanMessages();
        });
      };
      if (delay > 0) scanTimer = window.setTimeout(run, delay);
      else run();
    };

    const scanMessages = () => {
      if (disposed || metrics.length === 0) return;
      pruneMountedMessageMetrics();
      const nodes = document.querySelectorAll("div.group.flex.min-w-0.flex-col");
      for (const node of nodes) {
        if (!(node instanceof HTMLElement)) continue;
        const markdown = node.querySelector("._markdownContent_1rhk1_42");
        if (!markdown) continue;
        const rawText = markdown.textContent || "";
        trackVisibleStream(streamStats, markdown, rawText);
        const text = cleanMetricText(markdown.textContent || "");
        if (text.length < 12) continue;
        const match = findMetricForText(metrics, text);
        if (!match) continue;
        const displayMetric = addObservedTps(match, streamStats.get(markdown));
        let line = node.querySelector("[data-codexpp-message-metrics]");
        if (!line) {
          line = renderMessageMetricLine(displayMetric);
          node.appendChild(line);
        } else {
          updateMessageMetricLine(line, displayMetric);
        }
        mounted.set(node, line);
      }
    };

    const pruneMountedMessageMetrics = () => {
      for (const [node, line] of Array.from(mounted.entries())) {
        if (node.isConnected && line.isConnected) continue;
        line.remove();
        mounted.delete(node);
      }
    };

    const observer = new MutationObserver(scheduleScan);
    observer.observe(document.documentElement, { childList: true, subtree: true });

    refreshMetrics();
    const timer = window.setInterval(refreshMetrics, 5_000);

    return () => {
      disposed = true;
      observer.disconnect();
      window.clearInterval(timer);
      if (scanTimer) window.clearTimeout(scanTimer);
      for (const [, line] of mounted) line.remove();
      mounted.clear();
    };
  },

};

// ─────────────────────────────────────────────────────────────── helpers ──

// ── message metrics ───────────────────────────────────────────────────────
const METRICS_GLOBAL_KEY = "__bennettUiImprovementsMessageMetrics";
const METRICS_HANDLER_KEY = "__bennettUiImprovementsMessageMetricsHandler";
const USAGE_GLOBAL_KEY = "__bennettUiImprovementsUsageService";
const USAGE_HANDLER_KEY = "__bennettUiImprovementsUsageHandler";
const PROJECT_LABEL_GLOBAL_KEY = "__bennettUiImprovementsProjectLabels";
const PROJECT_LABEL_HANDLER_KEY = "__bennettUiImprovementsProjectLabelsHandler";
const SIDEBAR_BATCH_MENU_GLOBAL_KEY = "__bennettUiImprovementsSidebarBatchMenu";
const SIDEBAR_BATCH_MENU_HANDLER_KEY =
  "__bennettUiImprovementsSidebarBatchMenuHandler";
const SLASH_MENU_SHORTCUT_BRIDGE_KEY =
  "__bennettUiImprovementsSlashMenuShortcutBridge";

function startMainMetricsProvider(api) {
  const service = createMetricsService(api);
  globalThis[METRICS_GLOBAL_KEY] = service;

  // Codex++ currently exposes `handle()` without a matching removeHandler().
  // Keep the registered IPC handler stable across hot reloads and swap the
  // service behind it instead.
  if (!globalThis[METRICS_HANDLER_KEY]) {
    api.ipc.handle("message-metrics", () => {
      const active = globalThis[METRICS_GLOBAL_KEY];
      return active?.getMetrics?.() || [];
    });
    globalThis[METRICS_HANDLER_KEY] = true;
  }

  api.log.info("[message-metrics] main provider active");
}

function startMainUsageProvider(api) {
  const service = createUsageService(api);
  globalThis[USAGE_GLOBAL_KEY] = service;

  if (!globalThis[USAGE_HANDLER_KEY]) {
    api.ipc.handle("usage-fetch", (_url = "/wham/usage") => {
      const active = globalThis[USAGE_GLOBAL_KEY];
      return active?.fetchUsage?.() || null;
    });
    globalThis[USAGE_HANDLER_KEY] = true;
  }

  api.log.info("[usage] main provider active");
}

function startMainProjectLabelProvider(api) {
  const service = createProjectLabelService(api);
  globalThis[PROJECT_LABEL_GLOBAL_KEY] = service;

  if (!globalThis[PROJECT_LABEL_HANDLER_KEY]) {
    api.ipc.handle("pinned-chat-project-labels", (_ids = []) => {
      const active = globalThis[PROJECT_LABEL_GLOBAL_KEY];
      return active?.getLabels?.(_ids) || {};
    });
    globalThis[PROJECT_LABEL_HANDLER_KEY] = true;
  }

  api.log.info("[pinned-chat-project-names] main provider active");
}

function startMainSidebarBatchMenuProvider(api) {
  globalThis[SIDEBAR_BATCH_MENU_GLOBAL_KEY] = {
    show: showSidebarBatchMenu,
  };

  if (!globalThis[SIDEBAR_BATCH_MENU_HANDLER_KEY]) {
    api.ipc.handle("sidebar-chat-batch-menu", (payload = {}) => {
      const active = globalThis[SIDEBAR_BATCH_MENU_GLOBAL_KEY];
      return active?.show?.(payload) || null;
    });
    globalThis[SIDEBAR_BATCH_MENU_HANDLER_KEY] = true;
  }

  api.log.info("[sidebar-chat-multi-select] main menu provider active");
}

function startMainSlashMenuShortcutBridge(api) {
  const { app, webContents } = require("electron");
  const state =
    globalThis[SLASH_MENU_SHORTCUT_BRIDGE_KEY] || {
      attached: new WeakSet(),
      listenerRegistered: false,
    };
  globalThis[SLASH_MENU_SHORTCUT_BRIDGE_KEY] = state;

  state.attach = (wc) => {
    if (!wc || wc.isDestroyed?.() || state.attached.has(wc)) return;
    state.attached.add(wc);
    wc.on("before-input-event", (event, input = {}) => {
      const digit = slashMenuShortcutDigit(input);
      if (!digit) return;
      const url = wc.getURL?.() || "";
      if (!url.startsWith("app://") && !url.includes("codex")) return;
      event.preventDefault();
      wc.executeJavaScript(dispatchSlashMenuShortcutScript(digit), true).catch(() => {});
    });
  };

  for (const wc of webContents.getAllWebContents()) state.attach(wc);

  if (!state.listenerRegistered) {
    app.on("web-contents-created", (_event, wc) => {
      globalThis[SLASH_MENU_SHORTCUT_BRIDGE_KEY]?.attach?.(wc);
    });
    state.listenerRegistered = true;
  }

  api.log.info("[slash-menu-polish] main shortcut bridge active");
}

function slashMenuShortcutDigit(input = {}) {
  if (input.type !== "keyDown" && input.type !== "rawKeyDown") return 0;
  if (!(input.meta || input.control || input.command) || input.alt || input.shift) return 0;
  const key = String(input.key || input.keyCode || "");
  if (/^[1-9]$/.test(key)) return Number(key);
  const code = String(input.code || "");
  const match = /^(?:Digit|Numpad)([1-9])$/.exec(code);
  return match ? Number(match[1]) : 0;
}

function dispatchSlashMenuShortcutScript(digit) {
  return `
    (() => {
      const digit = ${Number(digit) || 0};
      const activeMenu = () =>
        Array.from(document.querySelectorAll('[data-codexpp-slash-menu="true"]')).find(
          (menu) =>
            menu instanceof HTMLElement &&
            menu.isConnected &&
            menu.querySelector(".vertical-scroll-fade-mask"),
        );
      const menu = activeMenu();
      const scroller = menu?.querySelector(".vertical-scroll-fade-mask");
      const before = scroller instanceof HTMLElement ? scroller.scrollTop : null;
      const shortcutEvent = new CustomEvent("codexpp-slash-section-shortcut", {
        detail: { digit },
        cancelable: true,
      });
      window.dispatchEvent(shortcutEvent);

      window.setTimeout(() => {
        const currentMenu = activeMenu();
        const currentScroller = currentMenu?.querySelector(".vertical-scroll-fade-mask");
        if (!(currentScroller instanceof HTMLElement)) return;
        if (before !== null && Math.abs(currentScroller.scrollTop - before) > 1) return;
        const sections = Array.from(currentScroller.children).filter(
          (node) =>
            node instanceof HTMLElement &&
            node.getAttribute("data-codexpp-slash-section") &&
            node.getAttribute("data-codexpp-slash-section-empty") !== "true" &&
            node.querySelector('[data-list-navigation-item="true"]'),
        );
        const target = sections[digit - 1];
        if (!(target instanceof HTMLElement)) return;
        const rawTop =
          currentScroller.scrollTop +
          target.getBoundingClientRect().top -
          currentScroller.getBoundingClientRect().top;
        const adjustedTop =
          digit > 1
            ? Math.min(rawTop + 1, currentScroller.scrollHeight - currentScroller.clientHeight)
            : rawTop;
        currentMenu.setAttribute("data-codexpp-slash-input-mode", "keyboard");
        currentMenu.setAttribute("data-codexpp-slash-programmatic-scroll", "true");
        currentMenu.setAttribute("data-codexpp-slash-hover-suppressed", "true");
        currentScroller.scrollLeft = 0;
        currentScroller.scrollTo({
          top: Math.max(
            0,
            Math.min(adjustedTop, currentScroller.scrollHeight - currentScroller.clientHeight),
          ),
          behavior: "smooth",
        });
        window.setTimeout(
          () => currentMenu.removeAttribute("data-codexpp-slash-programmatic-scroll"),
          320,
        );
      }, 120);

      return shortcutEvent.defaultPrevented;
    })()
  `;
}

function showSidebarBatchMenu(payload) {
  const { BrowserWindow, Menu } = require("electron");
  const count = Math.max(0, Number(payload?.count) || 0);
  if (!count) return null;

  const win = BrowserWindow.getFocusedWindow();
  if (!win || win.isDestroyed()) return null;

  const x = Math.max(0, Math.round(Number(payload?.x) || 0));
  const y = Math.max(0, Math.round(Number(payload?.y) || 0));
  const canPin = payload?.canPin !== false;
  const canArchive = payload?.canArchive !== false;
  const suffix = count === 1 ? "" : "s";

  return new Promise((resolve) => {
    let settled = false;
    const finish = (action) => {
      if (settled) return;
      settled = true;
      resolve(action);
    };

    const menu = Menu.buildFromTemplate([
      {
        label: `Pin ${count} chat${suffix}`,
        enabled: canPin,
        click: () => finish("pin"),
      },
      {
        label: `Archive ${count} chat${suffix}`,
        enabled: canArchive,
        click: () => finish("archive"),
      },
      {
        label: `Open ${count} mini window${suffix}`,
        click: () => finish("mini-window"),
      },
    ]);

    menu.popup({
      window: win,
      x,
      y,
      callback: () => finish(null),
    });
  });
}

function createProjectLabelService(api) {
  let cache = { at: 0, labels: new Map() };
  const TTL_MS = 30_000;

  return {
    getLabels(ids) {
      const requested = Array.isArray(ids)
        ? ids.map(normalizeConversationId).filter(Boolean)
        : [];
      if (requested.length === 0) return {};
      const now = Date.now();
      if (now - cache.at > TTL_MS) {
        try {
          cache = { at: now, labels: readConversationProjectLabels() };
        } catch (e) {
          api.log.warn("[pinned-chat-project-names] scan failed", e);
          cache = { at: now, labels: new Map() };
        }
      }
      const out = {};
      for (const id of requested) {
        const record = cache.labels.get(id);
        if (record) out[id] = record;
      }
      return out;
    },
  };
}

function readConversationProjectLabels() {
  const fs = require("node:fs");
  const path = require("node:path");
  const home = process.env.HOME || require("node:os").homedir();
  const roots = [
    path.join(home, ".codex", "sessions"),
    path.join(home, ".codex", "archived_sessions"),
  ];
  const files = [];
  for (const root of roots) collectJsonlFiles(fs, root, files);
  files.sort((a, b) => b.mtimeMs - a.mtimeMs);

  const labels = new Map();
  for (const file of files.slice(0, 5000)) {
    const meta = readSessionMeta(fs, file.path);
    const id = normalizeConversationId(meta?.id);
    const cwd = typeof meta?.cwd === "string" ? meta.cwd : null;
    if (!id || !cwd || labels.has(id)) continue;
    const label = projectLabelForPath(path, cwd);
    if (label) labels.set(id, { label, cwd });
  }
  return labels;
}

function readSessionMeta(fs, file) {
  let fd = null;
  try {
    fd = fs.openSync(file, "r");
    const buffer = Buffer.alloc(64 * 1024);
    const bytes = fs.readSync(fd, buffer, 0, buffer.length, 0);
    const firstLine = buffer.toString("utf8", 0, bytes).split("\n")[0];
    if (!firstLine) return null;
    const row = JSON.parse(firstLine);
    return row?.type === "session_meta" ? row.payload : null;
  } catch {
    return null;
  } finally {
    if (fd != null) {
      try {
        fs.closeSync(fd);
      } catch {
        // Ignore close errors during best-effort sidebar labeling.
      }
    }
  }
}

function projectLabelForPath(path, cwd) {
  const normalized = String(cwd || "").replace(/[\\/]+$/, "");
  if (!normalized || normalized === "~") return null;
  return path.basename(normalized) || normalized;
}

function normalizeConversationId(value) {
  const text = String(value || "").trim();
  if (!text) return null;
  return text.replace(/^(local|remote|pending-worktree):/, "");
}

function createUsageService(api) {
  let cache = { at: 0, value: null };
  const TTL_MS = 10_000;

  return {
    async fetchUsage() {
      const now = Date.now();
      if (cache.value && now - cache.at < TTL_MS) return cache.value;
      const value = await fetchUsageInCodexWebview();
      cache = { at: Date.now(), value };
      return value;
    },
  };

  async function fetchUsageInCodexWebview() {
    const { webContents } = require("electron");
    const candidates = webContents
      .getAllWebContents()
      .filter((wc) => {
        const url = wc.getURL();
        return !wc.isDestroyed() && (url.startsWith("app://") || url.includes("codex"));
      });

    let lastError = null;
    for (const wc of candidates) {
      try {
        return await wc.executeJavaScript(usageFetchScript(), true);
      } catch (e) {
        lastError = e;
      }
    }
    throw lastError || new Error("no Codex webview available for usage fetch");
  }

  function usageFetchScript() {
    return `(() => new Promise((resolve, reject) => {
      const bridge = window.electronBridge;
      if (typeof bridge?.sendMessageFromView !== "function") {
        reject(new Error("electronBridge unavailable"));
        return;
      }
      const hostId = new URL(window.location.href).searchParams.get("hostId")?.trim() || "local";
      const requestId = "codexpp-main-usage-" + Date.now() + "-" + Math.random().toString(36).slice(2);
      let done = false;
      const cleanup = () => {
        done = true;
        window.removeEventListener("message", onMessage);
        window.clearTimeout(timer);
      };
      const finish = (fn, value) => {
        if (done) return;
        cleanup();
        fn(value);
      };
      const onMessage = (event) => {
        const data = event.data;
        if (!data || typeof data !== "object" || data.type !== "fetch-response" || data.requestId !== requestId) return;
        if (data.responseType === "success") {
          try {
            const body = JSON.parse(data.bodyJsonString);
            if (data.status >= 200 && data.status < 300) finish(resolve, body);
            else finish(reject, new Error("HTTP " + data.status));
          } catch (error) {
            finish(reject, error);
          }
        } else {
          finish(reject, new Error(data.error || "fetch failed"));
        }
      };
      const timer = window.setTimeout(() => {
        bridge.sendMessageFromView({ type: "cancel-fetch", requestId }).catch(() => {});
        finish(reject, new Error("usage request timed out"));
      }, 10000);
      window.addEventListener("message", onMessage);
      bridge.sendMessageFromView({
        type: "fetch",
        hostId,
        requestId,
        method: "GET",
        url: "/wham/usage",
      }).catch((error) => finish(reject, error));
    }))();`;
  }
}

function createMetricsService(api) {
  let cache = { at: 0, items: [] };
  const TTL_MS = 2_000;

  return {
    getMetrics() {
      const now = Date.now();
      if (now - cache.at < TTL_MS) return cache.items;
      try {
        cache = { at: now, items: readRecentMessageMetrics() };
      } catch (e) {
        api.log.warn("[message-metrics] scan failed", e);
        cache = { at: now, items: [] };
      }
      return cache.items;
    },
  };
}

function readRecentMessageMetrics() {
  const fs = require("node:fs");
  const path = require("node:path");
  const home = process.env.HOME || require("node:os").homedir();
  const roots = [
    path.join(home, ".codex", "sessions"),
    path.join(home, ".codex", "archived_sessions"),
  ];
  const files = [];
  for (const root of roots) collectJsonlFiles(fs, root, files);

  files.sort((a, b) => b.mtimeMs - a.mtimeMs);

  const byKey = new Map();
  for (const file of files.slice(0, 20)) {
    // Some long-running archived rollouts can be huge; recent visible
    // conversations are covered by the smaller active session files.
    if (file.size > 12 * 1024 * 1024) continue;
    for (const item of parseMetricsFile(fs, file.path)) {
      const key = item.turnId || `${item.completedAt}:${item.clean.slice(0, 80)}`;
      if (!byKey.has(key)) byKey.set(key, item);
    }
    if (byKey.size >= 300) break;
  }

  return Array.from(byKey.values())
    .sort((a, b) => (b.completedAt || 0) - (a.completedAt || 0))
    .slice(0, 300);
}

function collectJsonlFiles(fs, dir, out) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    const full = `${dir}/${entry.name}`;
    if (entry.isDirectory()) {
      collectJsonlFiles(fs, full, out);
    } else if (entry.isFile() && entry.name.endsWith(".jsonl")) {
      try {
        const stat = fs.statSync(full);
        out.push({ path: full, mtimeMs: stat.mtimeMs, size: stat.size });
      } catch {
        // Ignore files that vanish during traversal.
      }
    }
  }
}

function parseMetricsFile(fs, file) {
  let text;
  try {
    text = fs.readFileSync(file, "utf8");
  } catch {
    return [];
  }

  const items = [];
  let lastUsage = null;
  for (const line of text.split("\n")) {
    if (!line.includes('"type":"token_count"') && !line.includes('"type":"task_complete"')) {
      continue;
    }
    let row;
    try {
      row = JSON.parse(line);
    } catch {
      continue;
    }
    const payload = row?.payload;
    if (payload?.type === "token_count") {
      lastUsage = payload.info || null;
      continue;
    }
    if (payload?.type !== "task_complete" || !payload.last_agent_message) {
      continue;
    }

    const clean = cleanMetricText(payload.last_agent_message);
    if (!clean) continue;
    const usage = lastUsage?.last_token_usage || null;

    items.push({
      turnId: payload.turn_id || null,
      clean,
      completedAt: numberOrNull(payload.completed_at),
      usage,
      contextWindow: numberOrNull(lastUsage?.model_context_window),
    });
  }
  return items;
}

function renderMessageMetricLine(metric) {
  const line = document.createElement("div");
  line.dataset.codexppMessageMetrics = "true";
  line.className =
    "mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs " +
    "text-token-text-secondary opacity-0 transition-opacity duration-150 " +
    "group-hover:opacity-100";
  updateMessageMetricLine(line, metric);
  return line;
}

function updateMessageMetricLine(line, metric) {
  const usage = metric.usage || {};
  const parts = [];
  if (typeof usage.input_tokens === "number") {
    parts.push(`${formatCount(usage.input_tokens)} in`);
  }
  if (typeof usage.output_tokens === "number") {
    parts.push(`${formatCount(usage.output_tokens)} out`);
  }
  if (typeof usage.reasoning_output_tokens === "number" && usage.reasoning_output_tokens > 0) {
    parts.push(`${formatCount(usage.reasoning_output_tokens)} reasoning`);
  }
  if (typeof metric.observedTps === "number" && Number.isFinite(metric.observedTps)) {
    parts.push(`${formatTps(metric.observedTps)} tok/s`);
  }
  const text = parts.join(" · ");
  const title = messageMetricTitle(metric);
  if (line.textContent !== text) line.textContent = text;
  if (line.title !== title) line.title = title;
}

function trackVisibleStream(streamStats, markdown, rawText) {
  const now = performance.now();
  const text = String(rawText || "");
  const previous = streamStats.get(markdown);
  if (!previous) {
    streamStats.set(markdown, {
      firstAt: now,
      lastAt: now,
      lastText: text,
      frozenTps: null,
    });
    return;
  }
  if (previous.lastText === text) return;
  if (!previous.lastText && text) previous.firstAt = now;
  previous.lastAt = now;
  previous.lastText = text;
}

function addObservedTps(metric, stat) {
  if (!stat) return metric;
  if (typeof stat.frozenTps === "number") {
    return { ...metric, observedTps: stat.frozenTps };
  }
  const outputTokens = numberOrNull(metric.usage?.output_tokens);
  const elapsedMs = stat.lastAt - stat.firstAt;
  if (outputTokens == null || elapsedMs < 500) return metric;
  stat.frozenTps = outputTokens / (elapsedMs / 1000);
  return { ...metric, observedTps: stat.frozenTps };
}

function findMetricForText(metrics, visibleText) {
  const clean = cleanMetricText(visibleText);
  if (!clean) return null;
  for (const metric of metrics) {
    const candidate = metric.clean || "";
    if (!candidate) continue;
    const head = candidate.slice(0, Math.min(120, candidate.length));
    const tail = candidate.slice(Math.max(0, candidate.length - 80));
    if (head.length >= 30 && clean.includes(head)) return metric;
    if (clean.length >= 80 && candidate.includes(clean.slice(0, 120))) return metric;
    if (head.length >= 30 && tail.length >= 30 && clean.includes(head) && clean.includes(tail)) {
      return metric;
    }
  }
  return null;
}

function cleanMetricText(text) {
  return String(text || "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/`+/g, "")
    .replace(/[*_~#>[\](){}|]/g, " ")
    .replace(/https?:\/\/\S+/g, " ")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function compactText(text) {
  return String(text || "").replace(/\s+/g, " ").trim();
}

function messageMetricTitle(metric) {
  const usage = metric.usage || {};
  const lines = [
    `Input tokens: ${formatRaw(usage.input_tokens)}`,
    `Cached input: ${formatRaw(usage.cached_input_tokens)}`,
    `Output tokens: ${formatRaw(usage.output_tokens)}`,
    `Reasoning output: ${formatRaw(usage.reasoning_output_tokens)}`,
    `Total tokens: ${formatRaw(usage.total_tokens)}`,
  ];
  if (typeof metric.observedTps === "number") {
    lines.push(`Observed stream rate: ${formatTps(metric.observedTps)} tok/s`);
  }
  return lines.join("\n");
}

function formatCount(n) {
  if (typeof n !== "number" || !Number.isFinite(n)) return "—";
  if (Math.abs(n) >= 1000000) return `${(n / 1000000).toFixed(1)}m`;
  if (Math.abs(n) >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

function formatRaw(n) {
  return typeof n === "number" && Number.isFinite(n) ? String(n) : "—";
}

function formatTps(n) {
  if (typeof n !== "number" || !Number.isFinite(n)) return "—";
  return n >= 10 ? String(Math.round(n)) : n.toFixed(1);
}

function numberOrNull(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

// ── usage snapshot persistence ────────────────────────────────────────────
// Stored under storage["usage:snapshot"]; survives reloads. Schema:
//   { fiveHour:{kind,pct,raw} | null, weekly:{kind,pct,raw} | null, at:number }
function readSnapshot(api) {
  const v = api.storage.get("usage:snapshot", null);
  if (!v || typeof v !== "object") return null;
  return v;
}
function writeSnapshot(api, snap) {
  api.storage.set("usage:snapshot", snap);
}

/**
 * Render a single rotating usage box. Click toggles between 5h and Weekly;
 * hover replaces the content with "Resets: HH:MM" for 5h or
 * "Resets: Wed, HH:MM" for weekly. The currently-selected kind is persisted
 * to storage so it survives reloads.
 *
 * The returned element exposes `_refresh(snapshot)` so callers can update
 * values in place without unmount/remount.
 */
function renderUsageBox(api, snapshot) {
  const ORDER = ["5h", "weekly"]; // toggle order
  let kind = api.storage.get("usage:visible-kind", "5h");
  if (!ORDER.includes(kind)) kind = "5h";

  const btn = document.createElement("button");
  btn.type = "button";
  // Keep alignment consistent with the row that hosted the upgrade pill.
  btn.className =
    "flex w-auto min-w-0 shrink-0 items-center justify-between gap-2 rounded-md border border-token-border " +
    "px-2 py-1 text-xs cursor-interaction transition-colors " +
    "hover:bg-token-foreground/10";

  const left = document.createElement("span");
  left.className = "min-w-0 truncate";
  const right = document.createElement("span");
  right.className = "shrink-0 tabular-nums flex items-center gap-1";

  btn.append(left, right);

  const setText = (node, text) => {
    if (node.textContent !== text) node.textContent = text;
  };
  const setClass = (node, className) => {
    if (node.className !== className) node.className = className;
  };
  const singleRightSpan = () => {
    let child = right.firstElementChild;
    if (!(child instanceof HTMLSpanElement)) {
      child = document.createElement("span");
      right.replaceChildren(child);
      return child;
    }
    while (child.nextSibling) child.nextSibling.remove();
    return child;
  };

  /** Pull the entry for `kind` out of the live snapshot. */
  const entryFor = (snap, k) => (k === "5h" ? snap.fiveHour : snap.weekly);
  const isApiSnapshot = (snap) => !!snap?.apiMode || snap?.fiveHour?.apiMode;

  /** Apply colors + text for the *value* state (i.e. not hover). */
  const applyValueState = (snap) => {
    if (isApiSnapshot(snap)) {
      btn.classList.remove("bg-token-charts-red/10", "text-token-charts-red");
      btn.classList.add("bg-token-foreground/5", "text-token-text-primary");
      setText(left, "API");
      setClass(left, "truncate");
      right.replaceChildren();
      return;
    }
    const entry = entryFor(snap, kind);
    const pct = entry?.pct;
    const remaining = typeof pct === "number" ? pct : null;
    const lowEnergy = typeof remaining === "number" && remaining < 15;

    btn.classList.toggle("bg-token-charts-red/10", lowEnergy);
    btn.classList.toggle("text-token-charts-red", lowEnergy);
    btn.classList.toggle("bg-token-foreground/5", !lowEnergy);
    btn.classList.toggle("text-token-text-primary", !lowEnergy);

    setText(left, entry?.label || (kind === "5h" ? "5h" : "Weekly"));

    const pctEl = singleRightSpan();
    setText(pctEl, remaining == null ? "—" : `${remaining}%`);
    setClass(pctEl, lowEnergy ? "font-medium" : "text-token-text-secondary");
  };

  /** Replace the entire box content with the reset label. */
  const applyHoverState = (snap) => {
    if (isApiSnapshot(snap)) {
      applyValueState(snap);
      return;
    }
    const entry = entryFor(snap, kind);
    setText(left, "Resets:");
    setClass(left, "truncate text-token-text-secondary");
    const t = singleRightSpan();
    setClass(t, "tabular-nums");
    setText(t, entry?.resetAt || "—");
  };

  // Bind hover with a snapshot getter so handlers always see the latest.
  let currentSnap = snapshot;
  // While true, the cursor is *inside* the box but the user has clicked
  // since their last mouseleave — we suppress hover state until they
  // physically leave the element so the click's value state is sticky.
  let suppressHover = false;

  btn.addEventListener("mouseenter", () => {
    suppressHover = false;
    applyHoverState(currentSnap);
  });
  btn.addEventListener("mouseleave", () => {
    suppressHover = false;
    setClass(left, "truncate");
    applyValueState(currentSnap);
  });
  btn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (isApiSnapshot(currentSnap)) {
      suppressHover = true;
      applyValueState(currentSnap);
      return;
    }
    const i = ORDER.indexOf(kind);
    kind = ORDER[(i + 1) % ORDER.length];
    api.storage.set("usage:visible-kind", kind);
    // Per the design: clicking shows the OTHER kind's value, even if the
    // cursor is still over the box.
    suppressHover = true;
    setClass(left, "truncate");
    applyValueState(currentSnap);
  });

  // Initial paint.
  applyValueState(currentSnap);

  // Allow the parent to push fresh data without remounting us. We honour
  // the click-guard so refreshes don't reintroduce hover state mid-click.
  btn._refresh = (next) => {
    if (next === currentSnap) return;
    currentSnap = next;
    if (btn.matches(":hover") && !suppressHover) applyHoverState(currentSnap);
    else applyValueState(currentSnap);
  };

  return btn;
}

function readFlag(api, id, fallback) {
  const v = api.storage.get(`feature:${id}`, undefined);
  return typeof v === "boolean" ? v : !!fallback;
}
function writeFlag(api, id, on) {
  api.storage.set(`feature:${id}`, !!on);
}

function el(tag, className) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  return node;
}

function sectionTitle(text) {
  const titleRow = el(
    "div",
    "flex h-toolbar items-center justify-between gap-2 px-0 py-0",
  );
  const inner = el("div", "flex min-w-0 flex-1 flex-col gap-1");
  const t = el("div", "text-base font-medium text-token-text-primary");
  t.textContent = text;
  inner.appendChild(t);
  titleRow.appendChild(inner);
  return titleRow;
}

function roundedCard() {
  const card = el(
    "div",
    "border-token-border flex flex-col divide-y-[0.5px] divide-token-border rounded-lg border",
  );
  card.style.backgroundColor =
    "var(--color-background-panel, var(--color-token-bg-fog))";
  return card;
}

/** Codex-native toggle (lifted verbatim from tweaks/AGENTS.md §4). */
function switchControl(initial, onChange) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.setAttribute("role", "switch");
  const pill = document.createElement("span");
  const knob = document.createElement("span");
  knob.className =
    "rounded-full border border-[color:var(--gray-0)] bg-[color:var(--gray-0)] " +
    "shadow-sm transition-transform duration-200 ease-out h-4 w-4";
  pill.appendChild(knob);
  const apply = (on) => {
    btn.setAttribute("aria-checked", String(on));
    btn.dataset.state = on ? "checked" : "unchecked";
    btn.className =
      "inline-flex items-center text-sm focus-visible:outline-none focus-visible:ring-2 " +
      "focus-visible:ring-token-focus-border focus-visible:rounded-full cursor-interaction";
    pill.className =
      "relative inline-flex shrink-0 items-center rounded-full transition-colors " +
      "duration-200 ease-out h-5 w-8 " +
      (on ? "bg-token-charts-blue" : "bg-token-foreground/20");
    pill.dataset.state = on ? "checked" : "unchecked";
    knob.dataset.state = on ? "checked" : "unchecked";
    knob.style.transform = on ? "translateX(14px)" : "translateX(2px)";
  };
  apply(initial);
  btn.appendChild(pill);
  btn.addEventListener("click", async (e) => {
    e.preventDefault();
    e.stopPropagation();
    const next = btn.getAttribute("aria-checked") !== "true";
    apply(next);
    btn.disabled = true;
    try {
      await onChange?.(next);
    } finally {
      btn.disabled = false;
    }
  });
  return btn;
}

  const tweak = module.exports;
  const api = createBigPizzaRendererApi();
  if (!tweak || typeof tweak.start !== "function") {
    throw new Error("Bennett UI tweak entrypoint was not found");
  }

  tweak.start.call(tweak, api);
  const features = [
    "hide-upgrade-prompts",
    "show-usage-in-sidebar",
    "square-sidebar",
    "settings-search",
    "match-sidebar-width",
    "sidebar-action-grid",
    "sidebar-project-backgrounds",
    "slash-menu-polish",
    "show-message-metrics-on-hover",
    "sidebar-chat-multi-select",
    "show-pinned-chat-project-names",
  ];
  const featureInfo = [
    {
      id: "hide-upgrade-prompts",
      title: "隐藏升级提示",
      detail: "隐藏侧栏和顶部栏中的 Upgrade / Get Plus 提示。",
      defaultEnabled: true,
      status: "可用",
    },
    {
      id: "show-usage-in-sidebar",
      title: "5 小时 / 周额度",
      detail: "优先通过 Codex renderer fetch bridge 读取 /wham/usage，失败时再解析页面里的额度 UI。点击可在 5h 和 Weekly 之间切换。",
      defaultEnabled: true,
      status: "当前页面暴露额度信号时可用",
    },
    {
      id: "square-sidebar",
      title: "侧栏方角",
      detail: "去掉侧栏与主内容之间的圆角。",
      defaultEnabled: false,
      status: "可用",
    },
    {
      id: "settings-search",
      title: "设置搜索",
      detail: "给 Codex 设置页增加搜索框。",
      defaultEnabled: true,
      status: "可用",
    },
    {
      id: "match-sidebar-width",
      title: "匹配设置页侧栏宽度",
      detail: "让设置页侧栏宽度与主侧栏对齐。",
      defaultEnabled: true,
      status: "可用",
    },
    {
      id: "sidebar-action-grid",
      title: "侧栏动作网格",
      detail: "把主要侧栏动作整理成紧凑网格。",
      defaultEnabled: true,
      status: "可用",
    },
    {
      id: "sidebar-project-backgrounds",
      title: "项目背景和颜色",
      detail: "为项目行增加分组背景，并保留旧的项目颜色偏好。",
      defaultEnabled: true,
      status: "可用",
    },
    {
      id: "slash-menu-polish",
      title: "斜杠菜单优化",
      detail: "压缩斜杠菜单行距，并强化选中状态。",
      defaultEnabled: true,
      status: "可用",
    },
    {
      id: "show-message-metrics-on-hover",
      title: "消息 token 指标",
      detail: "旧实现需要从 main process 读取本地 Codex JSONL，而 BigPizzaV3 用户脚本无法访问这一层。",
      defaultEnabled: false,
      status: "当前运行环境不支持",
      disabled: true,
    },
    {
      id: "sidebar-chat-multi-select",
      title: "侧栏会话多选",
      detail: "选择界面可以部分运行，但批量 Pin / Archive / mini window 操作依赖旧的 Electron IPC。",
      defaultEnabled: false,
      status: "部分支持，默认关闭",
    },
    {
      id: "show-pinned-chat-project-names",
      title: "固定会话项目名",
      detail: "旧实现需要从 main process 扫描本地会话文件。",
      defaultEnabled: false,
      status: "当前运行环境不支持",
      disabled: true,
    },
  ];
  const settingsObserver = new MutationObserver(installSettingsPanel);
  settingsObserver.observe(document.documentElement, { childList: true, subtree: true });
  installSettingsPanel();

  function featureDefault(id) {
    return featureInfo.find((item) => item.id === id)?.defaultEnabled ?? false;
  }

  function featureEnabled(id) {
    const meta = featureInfo.find((item) => item.id === id);
    if (meta?.disabled) return false;
    return !!api.storage.get(`feature:${id}`, featureDefault(id));
  }

  function setFeatureEnabled(id, enabled) {
    if (!features.includes(id)) {
      throw new Error(`Unknown Bennett UI feature: ${id}`);
    }
    api.storage.set(`feature:${id}`, !!enabled);
    const state = tweak._state;
    if (state && typeof activateFeature === "function" && typeof deactivateFeature === "function") {
      if (enabled) activateFeature(state, id);
      else deactivateFeature(state, id);
    }
    refreshSettingsPanel();
  }

  function installSettingsPanel() {
    const modal = document.querySelector(".codex-plus-modal-content");
    if (!modal || modal.dataset.bennettUiSettingsVersion === VERSION) return;
    const tabs = modal.querySelector(".codex-plus-tabs");
    const body = modal.querySelector(".codex-plus-modal-body");
    if (!tabs || !body) return;
    modal.dataset.bennettUiSettingsVersion = VERSION;

    tabs.querySelector('[data-codex-plus-tab="bennettUi"]')?.remove();
    body.querySelector('[data-codex-plus-panel="bennettUi"]')?.remove();

    const tab = document.createElement("button");
    tab.type = "button";
    tab.className = "codex-plus-tab-button";
    tab.dataset.codexPlusTab = "bennettUi";
    tab.dataset.active = "false";
    tab.textContent = "Bennett UI 设置";
    tabs.appendChild(tab);

    const panel = document.createElement("div");
    panel.className = "codex-plus-panel";
    panel.dataset.codexPlusPanel = "bennettUi";
    panel.hidden = true;
    panel.innerHTML = settingsPanelHtml();
    panel.addEventListener("click", (event) => {
      const target = event.target instanceof Element ? event.target : event.target?.parentElement;
      const toggle = target?.closest("[data-bennett-ui-feature]");
      if (!toggle) return;
      event.preventDefault();
      event.stopPropagation();
      const id = toggle.getAttribute("data-bennett-ui-feature");
      const meta = featureInfo.find((item) => item.id === id);
      if (!id || meta?.disabled) return;
      setFeatureEnabled(id, !featureEnabled(id));
    }, true);
    body.appendChild(panel);
    ensureSettingsStyle();
    refreshSettingsPanel();
  }

  function settingsPanelHtml() {
    return `
      <div class="codex-plus-row bennett-ui-settings-head">
        <div>
          <div class="codex-plus-row-title">Bennett UI Improvements</div>
          <div class="codex-plus-row-description">来源：b-nnett/codex-plusplus-bennett-ui。此迁移只保留能够在 BigPizzaV3 renderer-only 用户脚本环境中运行的功能。</div>
          <div class="bennett-ui-settings-note">切换会尽量立即生效。如果 Codex DOM 变动导致残留，可重新加载用户脚本或重启 Codex++。</div>
        </div>
      </div>
      ${featureInfo.map((item) => `
        <div class="codex-plus-row bennett-ui-feature-row" data-bennett-ui-row="${escapeAttr(item.id)}">
          <div>
            <div class="codex-plus-row-title">${escapeHtmlLocal(item.title)}</div>
            <div class="codex-plus-row-description">${escapeHtmlLocal(item.detail)}</div>
            <div class="bennett-ui-feature-status">${escapeHtmlLocal(item.status)}</div>
          </div>
          <button type="button" class="codex-plus-toggle bennett-ui-toggle" data-bennett-ui-feature="${escapeAttr(item.id)}" ${item.disabled ? "disabled" : ""}><span></span></button>
        </div>
      `).join("")}
    `;
  }

  function refreshSettingsPanel() {
    for (const item of featureInfo) {
      const row = document.querySelector(`[data-bennett-ui-row="${cssEscape(item.id)}"]`);
      const toggle = row?.querySelector("[data-bennett-ui-feature]");
      if (!toggle) continue;
      toggle.dataset.enabled = String(featureEnabled(item.id));
      toggle.dataset.support = item.disabled ? "unsupported" : "supported";
      row.dataset.enabled = String(featureEnabled(item.id));
    }
  }

  function ensureSettingsStyle() {
    if (document.getElementById("bennett-ui-settings-style")) return;
    const style = document.createElement("style");
    style.id = "bennett-ui-settings-style";
    style.textContent = `
      .bennett-ui-settings-note,
      .bennett-ui-feature-status {
        margin-top: 6px;
        color: var(--text-secondary, var(--color-token-text-secondary, #8b8b8b));
        font-size: 12px;
        line-height: 1.35;
      }
      .bennett-ui-feature-row[data-enabled="true"] .bennett-ui-feature-status {
        color: var(--text-primary, var(--color-token-text-primary, #f5f5f5));
      }
      .bennett-ui-toggle[disabled] {
        cursor: not-allowed;
        opacity: 0.45;
      }
      .bennett-ui-toggle[data-enabled="true"] span {
        transform: translateX(14px);
      }
    `;
    document.head.appendChild(style);
  }

  function escapeHtmlLocal(value) {
    return String(value ?? "").replace(/[&<>"']/g, (ch) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    })[ch]);
  }

  function escapeAttr(value) {
    return escapeHtmlLocal(value);
  }

  function cssEscape(value) {
    if (window.CSS && typeof window.CSS.escape === "function") return window.CSS.escape(value);
    return String(value).replace(/["\\]/g, "\\$&");
  }

  window[INSTALL_KEY] = {
    version: VERSION,
    api,
    features,
    featureInfo,
    setFeature(id, enabled, reload = true) {
      setFeatureEnabled(id, enabled);
      if (reload) window.location.reload();
    },
    stop() {
      settingsObserver.disconnect();
      document.querySelector('[data-codex-plus-tab="bennettUi"]')?.remove();
      document.querySelector('[data-codex-plus-panel="bennettUi"]')?.remove();
      if (typeof tweak.stop === "function") {
        tweak.stop.call(tweak);
      }
    },
  };

  function createBigPizzaRendererApi() {
    const storagePrefix = "bennett-ui-improvements:";
    const blockedFeatureKeys = new Set([
      "feature:show-message-metrics-on-hover",
      "feature:show-pinned-chat-project-names",
    ]);
    const noop = () => {};
    const logWith = (level) => (...args) => {
      const fn = console[level] || console.log || noop;
      fn.call(console, "[Bennett UI/BigPizza]", ...args);
    };

    const storage = {
      get(key, fallback) {
        if (blockedFeatureKeys.has(key)) return false;
        try {
          const raw = window.localStorage.getItem(storagePrefix + key);
          return raw == null ? fallback : JSON.parse(raw);
        } catch {
          return fallback;
        }
      },
      set(key, value) {
        try {
          window.localStorage.setItem(storagePrefix + key, JSON.stringify(value));
        } catch {
          // localStorage can be disabled; UI tweaks should still run.
        }
        return value;
      },
      delete(key) {
        try {
          window.localStorage.removeItem(storagePrefix + key);
        } catch {
          // Ignore storage failures.
        }
      },
    };

    return {
      process: "renderer",
      storage,
      settings: null,
      fs: null,
      log: {
        debug: logWith("debug"),
        info: logWith("info"),
        warn: logWith("warn"),
        error: logWith("error"),
      },
      ipc: {
        invoke(channel) {
          return Promise.reject(
            new Error(`BigPizza Codex++ user scripts do not expose b-nnett IPC channel: ${channel}`),
          );
        },
        handle: noop,
      },
    };
  }
})();

(() => {
  "use strict";

  if (window.top && window.self && window.top !== window.self) return;

  const API_NAME = "__codexRemoteControlWindows";
  const VERSION = "0.1.0";
  const OVERRIDES = new Map([
    ["782640499", false],
    ["2055603567", true],
  ]);

  const previous = window[API_NAME];
  if (previous && typeof previous.stop === "function") {
    previous.stop();
  }

  const state = {
    clients: new WeakSet(),
    records: [],
    scans: 0,
    timer: 0,
  };

  function gateOverride(name) {
    const key = typeof name === "string" || typeof name === "number"
      ? String(name)
      : "";
    return OVERRIDES.has(key) ? OVERRIDES.get(key) : undefined;
  }

  function forceGateObject(result, value) {
    if (!result || (typeof result !== "object" && typeof result !== "function")) {
      return value;
    }

    try {
      const descriptors = Object.getOwnPropertyDescriptors(result);
      const old = descriptors.value;
      descriptors.value = {
        configurable: old?.configurable ?? true,
        enumerable: old?.enumerable ?? true,
        value,
        writable: old?.writable ?? true,
      };
      return Object.create(Object.getPrototypeOf(result), descriptors);
    } catch {
      return { ...result, value };
    }
  }

  function installMethod(client, methodName, kind) {
    const original = client?.[methodName];
    if (typeof original !== "function") return false;

    const ownDescriptor = Object.getOwnPropertyDescriptor(client, methodName);
    const wrapper = function codexRemoteControlGateOverride(...args) {
      const forced = gateOverride(args[0]);
      if (forced === undefined) {
        return Reflect.apply(original, this, args);
      }
      if (kind === "boolean") return forced;

      const result = Reflect.apply(original, this, args);
      if (result && typeof result.then === "function") {
        return result.then((value) => forceGateObject(value, forced));
      }
      return forceGateObject(result, forced);
    };

    try {
      Object.defineProperty(client, methodName, {
        configurable: true,
        enumerable: ownDescriptor?.enumerable ?? false,
        value: wrapper,
        writable: true,
      });
    } catch {
      return false;
    }

    state.records.push({
      client,
      hadOwnProperty: Boolean(ownDescriptor),
      methodName,
      ownDescriptor,
      wrapper,
    });
    return true;
  }

  function notifyValuesChanged(client) {
    try {
      if (typeof client.$emt === "function") {
        client.$emt({ name: "values_updated", status: "Ready", values: {} });
      }
    } catch {
      // The wrappers are already active; notification is only for an immediate UI refresh.
    }
  }

  function installClient(client) {
    if (!client || (typeof client !== "object" && typeof client !== "function")) return false;
    if (state.clients.has(client)) return false;

    const checkInstalled = installMethod(client, "checkGate", "boolean");
    const featureInstalled = installMethod(client, "getFeatureGate", "object");
    if (!checkInstalled && !featureInstalled) return false;

    state.clients.add(client);
    notifyValuesChanged(client);
    return true;
  }

  function collectClients() {
    const statsig = window.__STATSIG__;
    if (!statsig || (typeof statsig !== "object" && typeof statsig !== "function")) return [];

    const clients = [];
    const add = (candidate) => {
      if (!candidate || clients.includes(candidate)) return;
      if (typeof candidate.checkGate === "function" || typeof candidate.getFeatureGate === "function") {
        clients.push(candidate);
      }
    };

    add(statsig.firstInstance);
    if (statsig.instances && typeof statsig.instances === "object") {
      for (const client of Object.values(statsig.instances)) add(client);
    }
    try {
      if (typeof statsig.instance === "function") add(statsig.instance());
    } catch {
      // No default instance is available yet; the next scan will retry.
    }
    return clients;
  }

  function scan() {
    state.scans += 1;
    let installed = 0;
    for (const client of collectClients()) {
      if (installClient(client)) installed += 1;
    }
    return { installed, ...probe() };
  }

  function probe() {
    const active = state.records.filter((record) => {
      try {
        return record.client[record.methodName] === record.wrapper;
      } catch {
        return false;
      }
    });
    const checkRecord = active.find((record) => record.methodName === "checkGate");
    let controlOtherDevices = null;
    let clientEnvironments = null;
    if (checkRecord) {
      try {
        controlOtherDevices = checkRecord.wrapper.call(checkRecord.client, "782640499");
        clientEnvironments = checkRecord.wrapper.call(checkRecord.client, "2055603567");
      } catch {
        // Report an inconclusive probe instead of disturbing the app.
      }
    }
    return {
      activeMethods: active.length,
      clientEnvironments,
      controlOtherDevices,
      ready: controlOtherDevices === false && clientEnvironments === true,
      scans: state.scans,
      version: VERSION,
    };
  }

  function stop() {
    if (state.timer) window.clearInterval(state.timer);
    state.timer = 0;

    for (const record of [...state.records].reverse()) {
      try {
        if (record.client[record.methodName] !== record.wrapper) continue;
        if (record.hadOwnProperty) {
          Object.defineProperty(record.client, record.methodName, record.ownDescriptor);
        } else {
          delete record.client[record.methodName];
        }
      } catch {
        // A Codex reload can dispose objects before this cleanup runs.
      }
    }
    state.records.length = 0;
    if (window[API_NAME]?.state === state) delete window[API_NAME];
  }

  window[API_NAME] = Object.freeze({
    probe,
    scan,
    state,
    stop,
    version: VERSION,
  });

  scan();
  state.timer = window.setInterval(scan, 250);
})();

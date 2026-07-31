(() => {
  const SCRIPT_ID = "__codexBundledPluginDoctor";
  if (window[SCRIPT_ID]?.destroy) {
    window[SCRIPT_ID].destroy();
  }

  const STYLE_ID = `${SCRIPT_ID}Style`;
  const PANEL_ID = `${SCRIPT_ID}Panel`;
  const BUTTON_ID = `${SCRIPT_ID}Button`;
  const VERSION = "0.1.0";

  const state = {
    panel: null,
    button: null,
    log: null,
    summary: null,
    details: null,
    lastReport: null
  };

  function getRequire() {
    try {
      if (typeof window.require === "function") return window.require;
    } catch {}
    try {
      if (typeof globalThis.require === "function") return globalThis.require;
    } catch {}
    try {
      if (typeof globalThis.__non_webpack_require__ === "function") {
        return globalThis.__non_webpack_require__;
      }
    } catch {}
    return null;
  }

  function formatTime() {
    try {
      return new Date().toLocaleTimeString("zh-CN", { hour12: false });
    } catch {
      return new Date().toISOString();
    }
  }

  function appendLog(message, kind = "info") {
    if (!state.log) return;
    const line = document.createElement("div");
    line.className = `cbpd-log cbpd-log-${kind}`;
    line.textContent = `[${formatTime()}] ${message}`;
    state.log.prepend(line);
  }

  function setSummary(text) {
    if (state.summary) state.summary.textContent = text;
  }

  function renderDetails(report) {
    state.lastReport = report;
    if (!state.details) return;

    const lines = [];
    lines.push(`状态: ${report.status || "unknown"}`);
    if (report.issueType) lines.push(`判定: ${report.issueType}`);
    if (report.message) lines.push(`说明: ${report.message}`);
    if (report.backupDir) lines.push(`备份: ${report.backupDir}`);
    if (Array.isArray(report.evidence) && report.evidence.length) {
      lines.push("");
      lines.push("证据:");
      for (const item of report.evidence) lines.push(`- ${item}`);
    }
    if (Array.isArray(report.modifiedPaths) && report.modifiedPaths.length) {
      lines.push("");
      lines.push("改动:");
      for (const item of report.modifiedPaths) lines.push(`- ${item}`);
    }
    if (Array.isArray(report.verification) && report.verification.length) {
      lines.push("");
      lines.push("验证:");
      for (const item of report.verification) lines.push(`- ${item}`);
    }
    if (report.error) {
      lines.push("");
      lines.push(`错误: ${report.error}`);
    }
    state.details.textContent = lines.join("\n");
  }

  function escapeForSingleQuotedPs(text) {
    return String(text).replace(/'/g, "''");
  }

  function getPowerShellPayload() {
    return String.raw`
param(
  [ValidateSet('Diagnose', 'Repair')]
  [string]$Mode = 'Diagnose'
)

$ErrorActionPreference = 'Stop'

function Copy-TreeByteStream([string]$SourceRoot, [string]$DestinationRoot) {
  if (Test-Path -LiteralPath $DestinationRoot) {
    Remove-Item -LiteralPath $DestinationRoot -Recurse -Force
  }
  New-Item -ItemType Directory -Force -Path $DestinationRoot | Out-Null
  $srcRoot = (Get-Item -LiteralPath $SourceRoot -Force).FullName
  foreach ($dir in Get-ChildItem -LiteralPath $SourceRoot -Directory -Recurse -Force) {
    $relative = $dir.FullName.Substring($srcRoot.Length).TrimStart('\')
    $targetDir = Join-Path $DestinationRoot $relative
    New-Item -ItemType Directory -Force -Path $targetDir | Out-Null
  }
  foreach ($file in Get-ChildItem -LiteralPath $SourceRoot -File -Recurse -Force) {
    $relative = $file.FullName.Substring($srcRoot.Length).TrimStart('\')
    $targetFile = Join-Path $DestinationRoot $relative
    $targetParent = Split-Path -Parent $targetFile
    if (-not (Test-Path -LiteralPath $targetParent)) {
      New-Item -ItemType Directory -Force -Path $targetParent | Out-Null
    }
    [System.IO.File]::WriteAllBytes($targetFile, [System.IO.File]::ReadAllBytes($file.FullName))
  }
}

function Reset-Latest([string]$LatestPath, [string]$TargetPath) {
  if (Test-Path -LiteralPath $LatestPath) {
    Remove-Item -LiteralPath $LatestPath -Recurse -Force
  }
  cmd /c mklink /J "$LatestPath" "$TargetPath" | Out-Null
  if (-not (Test-Path -LiteralPath $LatestPath)) {
    Copy-Item -LiteralPath $TargetPath -Destination $LatestPath -Recurse -Force
  }
}

function Ensure-MarketplaceMapping([string]$ConfigPath, [string]$MarketplaceRoot) {
  if (-not (Test-Path -LiteralPath $ConfigPath)) {
    return $false
  }
  $raw = Get-Content -LiteralPath $ConfigPath -Raw
  if ($raw -match '(?m)^\[marketplaces\.openai-bundled\]$') {
    return $false
  }
  $block = @"

[marketplaces.openai-bundled]
source_type = "local"
source = '\\?\$MarketplaceRoot'
"@
  Add-Content -LiteralPath $ConfigPath -Value $block
  return $true
}

function Get-PluginVersion([string]$PluginDir) {
  $pluginJson = Join-Path $PluginDir '.codex-plugin\plugin.json'
  $json = Get-Content -LiteralPath $pluginJson -Raw | ConvertFrom-Json
  return [string]$json.version
}

function New-Report([string]$Status, [string]$IssueType, [string]$Message) {
  [ordered]@{
    status = $Status
    issueType = $IssueType
    message = $Message
    evidence = @()
    modifiedPaths = @()
    verification = @()
    backupDir = $null
    error = $null
  }
}

try {
  $CodexHome = Join-Path $env:USERPROFILE '.codex'
  $BackupRoot = Join-Path $env:USERPROFILE 'codex-plugin-backups'
  $OpenAILocal = Join-Path $env:LOCALAPPDATA 'OpenAI'
  $CodexLocal = Join-Path $OpenAILocal 'Codex'
  $ExtensionManifest = Join-Path $OpenAILocal 'extension\com.openai.codexextension.json'
  $BundledTmpParent = Join-Path $CodexHome '.tmp\bundled-marketplaces'
  $BundledTmpRoot = Join-Path $BundledTmpParent 'openai-bundled'
  $BundledMarketplaceJson = Join-Path $BundledTmpRoot '.agents\plugins\marketplace.json'
  $PluginCacheRoot = Join-Path $CodexHome 'plugins\cache\openai-bundled'
  $ChromeCacheRoot = Join-Path $PluginCacheRoot 'chrome'
  $ComputerUseCacheRoot = Join-Path $PluginCacheRoot 'computer-use'
  $ChromeLatest = Join-Path $ChromeCacheRoot 'latest'
  $ComputerUseLatest = Join-Path $ComputerUseCacheRoot 'latest'
  $ConfigPath = Join-Path $CodexHome 'config.toml'
  $StagingDirs = @(Get-ChildItem -LiteralPath $BundledTmpParent -Directory -Force -ErrorAction SilentlyContinue | Where-Object { $_.Name -like 'openai-bundled.staging-*' })
  $PackageRoot = Get-ChildItem -LiteralPath (Join-Path $env:ProgramFiles 'WindowsApps') -Directory -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -like 'OpenAI.Codex_*_x64__2p2nqsd0c76g0' } |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 1
  $BundledSource = $null
  if ($PackageRoot) {
    $candidate = Join-Path $PackageRoot.FullName 'app\resources\plugins\openai-bundled'
    if (Test-Path -LiteralPath (Join-Path $candidate '.agents\plugins\marketplace.json')) {
      $BundledSource = $candidate
    }
  }

  $missingMarketplace = -not (Test-Path -LiteralPath $BundledMarketplaceJson)
  $missingChromeLatest = -not (Test-Path -LiteralPath (Join-Path $ChromeLatest 'scripts\browser-client.mjs'))
  $missingComputerUseLatest = -not (Test-Path -LiteralPath (Join-Path $ComputerUseLatest 'scripts\computer-use-client.mjs'))
  $missingMarketplaceMapping = $true
  if (Test-Path -LiteralPath $ConfigPath) {
    $missingMarketplaceMapping = -not ((Get-Content -LiteralPath $ConfigPath -Raw) -match '(?m)^\[marketplaces\.openai-bundled\]$')
  }

  $issueType = 'healthy'
  if ($missingMarketplace -or $missingChromeLatest -or $missingComputerUseLatest -or $missingMarketplaceMapping) {
    $issueType = 'bundled-marketplace-missing-or-broken'
  }
  if (-not $BundledSource) {
    $issueType = 'windowsapps-source-missing'
  }

  if ($Mode -eq 'Diagnose') {
    $report = New-Report 'ok' $issueType '诊断完成。'
    $report.evidence += "marketplace.json exists: $(-not $missingMarketplace)"
    $report.evidence += "chrome latest exists: $(-not $missingChromeLatest)"
    $report.evidence += "computer-use latest exists: $(-not $missingComputerUseLatest)"
    $report.evidence += "config mapping exists: $(-not $missingMarketplaceMapping)"
    $report.evidence += "staging leftovers: $($StagingDirs.Count)"
    $report.evidence += "windowsapps source exists: $([bool]$BundledSource)"
    if ($ExtensionManifest -and (Test-Path -LiteralPath $ExtensionManifest)) {
      $report.evidence += "extension manifest present: True"
    }
    $report | ConvertTo-Json -Depth 8
    exit 0
  }

  if (-not $BundledSource) {
    throw '找不到 WindowsApps 中的 openai-bundled 源目录。'
  }

  $report = New-Report 'ok' $issueType '修复完成。'
  $Stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
  $BackupDir = Join-Path $BackupRoot "openai-bundled-lock-repair-$Stamp"
  New-Item -ItemType Directory -Force -Path $BackupDir | Out-Null
  $report.backupDir = $BackupDir

  foreach ($file in @($ConfigPath, $ExtensionManifest)) {
    if (Test-Path -LiteralPath $file) {
      Copy-Item -LiteralPath $file -Destination $BackupDir -Force
    }
  }

  Get-Process extension-host -ErrorAction SilentlyContinue | Stop-Process -Force
  Get-Process codex-computer-use -ErrorAction SilentlyContinue | Stop-Process -Force
  Start-Sleep -Seconds 2

  Copy-TreeByteStream $BundledSource $BundledTmpRoot
  $report.modifiedPaths += $BundledTmpRoot

  $ChromeSource = Join-Path $BundledTmpRoot 'plugins\chrome'
  $ComputerUseSource = Join-Path $BundledTmpRoot 'plugins\computer-use'
  $ChromeVersion = Get-PluginVersion $ChromeSource
  $ComputerUseVersion = Get-PluginVersion $ComputerUseSource
  $ChromeVersionDir = Join-Path $ChromeCacheRoot $ChromeVersion
  $ComputerUseVersionDir = Join-Path $ComputerUseCacheRoot $ComputerUseVersion

  New-Item -ItemType Directory -Force -Path $ChromeCacheRoot | Out-Null
  New-Item -ItemType Directory -Force -Path $ComputerUseCacheRoot | Out-Null
  if (Test-Path -LiteralPath $ChromeVersionDir) { Remove-Item -LiteralPath $ChromeVersionDir -Recurse -Force }
  if (Test-Path -LiteralPath $ComputerUseVersionDir) { Remove-Item -LiteralPath $ComputerUseVersionDir -Recurse -Force }
  Copy-Item -LiteralPath $ChromeSource -Destination $ChromeVersionDir -Recurse -Force
  Copy-Item -LiteralPath $ComputerUseSource -Destination $ComputerUseVersionDir -Recurse -Force
  Reset-Latest (Join-Path $ChromeCacheRoot 'latest') $ChromeVersionDir
  Reset-Latest (Join-Path $ComputerUseCacheRoot 'latest') $ComputerUseVersionDir
  $report.modifiedPaths += $ChromeVersionDir
  $report.modifiedPaths += $ComputerUseVersionDir

  if (Ensure-MarketplaceMapping $ConfigPath $BundledTmpRoot) {
    $report.modifiedPaths += $ConfigPath
  }

  foreach ($path in @(
    $BundledMarketplaceJson,
    (Join-Path $BundledTmpRoot 'plugins\chrome\assets\google-chrome.png'),
    (Join-Path $BundledTmpRoot 'plugins\computer-use\assets\app-icon.png'),
    (Join-Path $ChromeCacheRoot 'latest\scripts\browser-client.mjs'),
    (Join-Path $ChromeCacheRoot 'latest\extension-host\windows\x64\extension-host.exe'),
    (Join-Path $ComputerUseCacheRoot 'latest\scripts\computer-use-client.mjs')
  )) {
    $report.verification += "$path => $(Test-Path -LiteralPath $path)"
  }

  $report.evidence += "staging leftovers before repair: $($StagingDirs.Count)"
  $report.evidence += "windowsapps source: $BundledSource"
  $report | ConvertTo-Json -Depth 8
} catch {
  $report = New-Report 'error' 'repair-failed' '执行失败。'
  $report.error = $_.Exception.Message
  $report | ConvertTo-Json -Depth 8
  exit 1
}
`;
  }

  function getNode() {
    const localRequire = getRequire();
    if (!localRequire) {
      throw new Error("当前 Codex++ 脚本环境没有开放 Node/Electron 能力。");
    }
    return {
      fs: localRequire("fs"),
      os: localRequire("os"),
      path: localRequire("path"),
      crypto: localRequire("crypto"),
      childProcess: localRequire("child_process")
    };
  }

  function writeTempScript(node) {
    const { fs, os, path, crypto } = node;
    const dir = path.join(os.tmpdir(), "codex-bundled-plugin-doctor");
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(
      dir,
      `codex-bundled-plugin-doctor-${crypto.randomBytes(6).toString("hex")}.ps1`
    );
    fs.writeFileSync(file, getPowerShellPayload(), "utf8");
    return file;
  }

  function runPowerShell(mode) {
    const node = getNode();
    const { childProcess, fs } = node;
    const scriptPath = writeTempScript(node);
    return new Promise((resolve, reject) => {
      const child = childProcess.spawn(
        "powershell.exe",
        [
          "-NoProfile",
          "-ExecutionPolicy",
          "Bypass",
          "-File",
          scriptPath,
          "-Mode",
          mode
        ],
        { windowsHide: true }
      );

      let stdout = "";
      let stderr = "";

      child.stdout.on("data", (chunk) => {
        stdout += chunk.toString();
      });
      child.stderr.on("data", (chunk) => {
        stderr += chunk.toString();
      });
      child.on("error", (error) => {
        reject(error);
      });
      child.on("close", (code) => {
        try {
          fs.unlinkSync(scriptPath);
        } catch {}
        const trimmed = stdout.trim();
        let parsed = null;
        if (trimmed) {
          try {
            parsed = JSON.parse(trimmed);
          } catch (error) {
            parsed = {
              status: code === 0 ? "ok" : "error",
              issueType: "non-json-output",
              message: "PowerShell 返回了非 JSON 输出。",
              evidence: [trimmed],
              modifiedPaths: [],
              verification: [],
              backupDir: null,
              error: stderr.trim() || String(error)
            };
          }
        }
        if (code !== 0 && !parsed) {
          reject(new Error(stderr.trim() || `PowerShell exited with code ${code}`));
          return;
        }
        if (parsed) {
          if (stderr.trim()) {
            parsed.evidence = Array.isArray(parsed.evidence) ? parsed.evidence : [];
            parsed.evidence.push(`stderr: ${stderr.trim()}`);
          }
          resolve(parsed);
          return;
        }
        resolve({
          status: "ok",
          issueType: "empty-output",
          message: "PowerShell 已执行，但没有返回额外内容。",
          evidence: [],
          modifiedPaths: [],
          verification: [],
          backupDir: null,
          error: null
        });
      });
    });
  }

  async function exportPowerShell() {
    const node = getNode();
    const { fs, os, path } = node;
    const desktop = path.join(os.homedir(), "Desktop");
    const target = path.join(desktop, "codex-bundled-plugin-doctor.ps1");
    fs.writeFileSync(target, getPowerShellPayload(), "utf8");
    appendLog(`已导出 PowerShell 脚本到桌面: ${target}`);
    setSummary("已导出可独立运行的 PowerShell 修复脚本。");
  }

  async function copyReport() {
    if (!state.lastReport) {
      appendLog("还没有可复制的报告。", "warn");
      return;
    }
    const text = state.details ? state.details.textContent : JSON.stringify(state.lastReport, null, 2);
    await navigator.clipboard.writeText(text);
    appendLog("报告已复制到剪贴板。");
  }

  async function perform(mode) {
    const actionLabel = mode === "Diagnose" ? "诊断" : "修复";
    appendLog(`开始${actionLabel} bundled 插件异常...`);
    setSummary(`正在${actionLabel}，请稍候...`);
    try {
      const report = await runPowerShell(mode);
      renderDetails(report);
      if (report.status === "error") {
        appendLog(`${actionLabel}失败: ${report.error || report.message}`, "error");
        setSummary(`${actionLabel}失败：${report.error || report.message}`);
      } else {
        appendLog(`${actionLabel}完成: ${report.issueType || report.status}`);
        setSummary(report.message || `${actionLabel}完成。`);
      }
    } catch (error) {
      appendLog(`${actionLabel}失败: ${error.message}`, "error");
      setSummary(`${actionLabel}失败：${error.message}`);
      renderDetails({
        status: "error",
        issueType: "runtime-error",
        message: `${actionLabel}失败。`,
        evidence: [],
        modifiedPaths: [],
        verification: [],
        backupDir: null,
        error: error.message
      });
    }
  }

  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      #${BUTTON_ID} {
        position: fixed;
        right: 20px;
        bottom: 20px;
        z-index: 999999;
        border: 0;
        border-radius: 999px;
        padding: 10px 14px;
        background: #15803d;
        color: #fff;
        font: 600 13px/1 system-ui, sans-serif;
        box-shadow: 0 10px 30px rgba(0,0,0,.25);
        cursor: pointer;
      }
      #${PANEL_ID} {
        position: fixed;
        right: 20px;
        bottom: 68px;
        width: 420px;
        max-width: calc(100vw - 32px);
        max-height: 70vh;
        z-index: 999999;
        border: 1px solid rgba(255,255,255,.12);
        border-radius: 10px;
        background: #111827;
        color: #e5e7eb;
        box-shadow: 0 20px 50px rgba(0,0,0,.45);
        overflow: hidden;
      }
      #${PANEL_ID}[hidden] { display: none; }
      .cbpd-head {
        padding: 14px 16px 10px;
        border-bottom: 1px solid rgba(255,255,255,.08);
      }
      .cbpd-title { font: 700 15px/1.3 system-ui, sans-serif; }
      .cbpd-subtitle {
        margin-top: 6px;
        color: #9ca3af;
        font: 12px/1.5 system-ui, sans-serif;
      }
      .cbpd-body { padding: 12px 16px 16px; }
      .cbpd-actions {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        margin-bottom: 12px;
      }
      .cbpd-actions button {
        border: 0;
        border-radius: 8px;
        padding: 8px 12px;
        background: #1f2937;
        color: #e5e7eb;
        font: 600 12px/1 system-ui, sans-serif;
        cursor: pointer;
      }
      .cbpd-actions button.cbpd-primary { background: #2563eb; }
      .cbpd-summary {
        margin-bottom: 10px;
        color: #d1d5db;
        font: 13px/1.5 system-ui, sans-serif;
      }
      .cbpd-details, .cbpd-logbox {
        border-radius: 8px;
        background: #0b1220;
        border: 1px solid rgba(255,255,255,.06);
      }
      .cbpd-details {
        white-space: pre-wrap;
        padding: 12px;
        color: #cbd5e1;
        font: 12px/1.55 ui-monospace, Consolas, monospace;
        max-height: 230px;
        overflow: auto;
      }
      .cbpd-logbox {
        margin-top: 10px;
        padding: 8px 10px;
        max-height: 160px;
        overflow: auto;
      }
      .cbpd-log {
        font: 12px/1.45 ui-monospace, Consolas, monospace;
        color: #cbd5e1;
        margin: 4px 0;
      }
      .cbpd-log-warn { color: #fbbf24; }
      .cbpd-log-error { color: #fca5a5; }
    `;
    document.head.appendChild(style);
  }

  function buildUi() {
    ensureStyle();

    const button = document.createElement("button");
    button.id = BUTTON_ID;
    button.textContent = "Bundled插件";

    const panel = document.createElement("div");
    panel.id = PANEL_ID;
    panel.hidden = true;
    panel.innerHTML = `
      <div class="cbpd-head">
        <div class="cbpd-title">Codex Bundled Plugin Doctor</div>
        <div class="cbpd-subtitle">诊断并修复 Codex Desktop 的 bundled 插件异常，如 Chrome / Computer Use 消失、marketplace.json 缺失、设置页 unavailable。</div>
      </div>
      <div class="cbpd-body">
        <div class="cbpd-actions">
          <button class="cbpd-primary" data-action="diagnose">诊断</button>
          <button data-action="repair">修复</button>
          <button data-action="copy">复制报告</button>
          <button data-action="export">导出PS1</button>
        </div>
        <div class="cbpd-summary">准备就绪。先点“诊断”更稳。</div>
        <div class="cbpd-details">这里会显示 diagnose / repair 的结果，以及 openai-bundled / marketplace.json 的关键状态。</div>
        <div class="cbpd-logbox"></div>
      </div>
    `;

    const summary = panel.querySelector(".cbpd-summary");
    const details = panel.querySelector(".cbpd-details");
    const log = panel.querySelector(".cbpd-logbox");

    panel.addEventListener("click", async (event) => {
      const action = event.target?.getAttribute?.("data-action");
      if (!action) return;
      if (action === "diagnose") await perform("Diagnose");
      if (action === "repair") await perform("Repair");
      if (action === "copy") await copyReport();
      if (action === "export") await exportPowerShell();
    });

    button.addEventListener("click", () => {
      panel.hidden = !panel.hidden;
    });

    document.body.append(panel, button);

    state.panel = panel;
    state.button = button;
    state.summary = summary;
    state.details = details;
    state.log = log;
    appendLog(`脚本已加载 v${VERSION}`);
  }

  function destroy() {
    state.panel?.remove();
    state.button?.remove();
    document.getElementById(STYLE_ID)?.remove();
  }

  window[SCRIPT_ID] = {
    version: VERSION,
    diagnose: () => perform("Diagnose"),
    repair: () => perform("Repair"),
    exportPowerShell,
    destroy
  };

  buildUi();
})();

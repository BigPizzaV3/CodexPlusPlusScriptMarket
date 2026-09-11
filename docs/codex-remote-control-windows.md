# Codex Remote Control Windows

部分 Windows 版 Codex 已包含远程控制功能，但没有显示对应入口。本脚本通过 Codex++ 打开 **设置 → 连接 → 控制其他设备**，让用户使用客户端已有的功能。

版本：`0.1.0`。适用于已具备远程控制原生实现、但入口被功能开关隐藏的 Windows 版 Codex。

## 安装

市场收录后，在 Codex++ 的“脚本市场”搜索 **Codex Remote Control Windows** 并安装。

手动安装时，将 `scripts/codex-remote-control-windows.js` 复制到：

```text
%APPDATA%\Codex++\user_scripts\codex-remote-control-windows.js
```

在 Codex++ 中启用用户脚本，通过 Codex++ 启动或重新加载 Codex，再进入 **设置 → 连接 → 控制其他设备**。

如果已安装同名本地脚本，请只保留一份启用的实例，避免与市场版本重复加载。

## 实现

脚本查找渲染页的 `window.__STATSIG__`，包装客户端的 `checkGate()` 和 `getFeatureGate()`，仅覆盖下面两个开关：

| 功能开关 | 返回值 | 对应作用 |
| --- | --- | --- |
| `782640499` | `false` | 对应适配版本使用反向判断，返回 false 才显示“控制其他设备” |
| `2055603567` | `true` | 启用远程控制客户端环境相关流程 |

其他开关继续调用原方法。脚本每 250 毫秒检查新客户端，并在安装后尝试发送 `values_updated` 刷新界面。重复注入会先停止上一份实例。

脚本不修改 Codex 安装文件、不读取账号令牌或设备私钥，也不自行建立远程连接；设备配对、签名和连接由 Codex 自身处理。

## 检查与停用

在 Codex 渲染页开发者控制台运行：

```js
window.__codexRemoteControlWindows?.probe()
```

当 `ready: true`、`controlOtherDevices: false`、`clientEnvironments: true` 时，表示脚本的开关覆盖已生效。`ready` 不代表设备已完成配对或实际连接成功。

临时恢复原方法并停止扫描：

```js
window.__codexRemoteControlWindows?.stop()
```

长期停用请在 Codex++ 中禁用或删除该脚本，然后重启 Codex。

## 适用范围

- 本脚本面向“客户端已有功能，但入口未打开”的情况，不能补齐缺失的原生功能。
- 账号权限、服务端支持及网络条件仍需满足 Codex 的要求。
- Codex 更新后，Statsig 对象、开关编号或界面判断可能变化，需要重新适配。
- 本次投稿保留本地 `0.1.0` 脚本内容。提交前完成语法和模拟客户端检查；实际设备配对、跨设备连接不属于本次投稿验证范围。

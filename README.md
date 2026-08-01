# Codex++ Script Market

Codex++ 用户脚本市场静态清单仓库。

## 清单

Codex++ 默认读取：

```text
https://raw.githubusercontent.com/BigPizzaV3/CodexPlusPlusScriptMarket/main/index.json
```

脚本文件放在 `scripts/` 目录，`index.json` 记录脚本元数据、raw 下载地址和 SHA-256。

## Codex List Pagebuster

`Codex List Pagebuster` 用于按需扩展 Codex 原生近期会话缓存，解决账号切换或本地历史较多时，部分会话未进入当前侧栏索引的问题。

- 手动加载，数量可设置为 1–2000 条，默认 500 条。
- 合并 CLI 会话索引与 renderer 已知摘要，并按会话 ID 去重。
- 分批补齐缺失摘要，然后交由 Codex 原生会话管理器更新侧栏。
- 不创建插件会话行，不拦截请求，不持续监听整个页面；滚动和输入仍使用 Codex 原生虚拟化路径。
- 可作为独立脚本使用，也可通过 `window.__codexListPagebuster` 调试接口手动调用。Bennett UI Improvements 1.2.1 及以上版本已内置同一加载器，不需要再单独安装 Pagebuster。

该脚本只改变当前运行时加载到原生缓存中的会话范围，不搬迁或复制本地会话文件。使用 cc-switch 统一会话目录时，CLI 索引和 renderer 摘要仍是同一存储的两种运行时视图。

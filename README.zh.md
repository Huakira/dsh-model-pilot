# dsh-model-pilot · 模型领航

> DeepSeek Harness（DSH）的智能模型配置插件。填一个网关 baseURL + key，拉取上游模型列表，按模型自动匹配**协议 / 上下文窗口 / 多模态能力 / 思考强度**，静默写入官方 Models 页；一键刷新、逐模型覆盖、备份回滚。

> 个人自用插件，AI 辅助编写，使用前请先备份配置。

[English](./README.md) · 兼容矩阵与接缝自检见 [docs/compatibility-notes.md](./docs/compatibility-notes.md)

## 它解决什么

手写 DSH 的 `cordis.patch.yml` 模型配置很容易出错：

- 上下文/输出上限**虚标**（比如把 131072 写成 384000）；
- 思考档位写了上游**不存在**的档（如 medium），被网关静默拟合；
- `thinkingFormat` 缺失或写错，思考内容透传不正常；
- 模型 id 变了、上游下架了，配置里还留着**死条目**；
- 多模态能力（image/video/pdf）漏标，视觉模型被当纯文本用。

dsh-model-pilot 把这些交给一个**多源能力匹配器**：以 pi-ai 内置目录为主源、models.dev 为次源、家族默认兜底，对每个标准模型 id 给出带**置信度与来源标注**的能力，再写进官方配置。你只管填 baseURL 和 key。

## 功能

- **提供商管理**：添加/编辑/删除网关 route（baseURL、显示名、协议、key）。key 存进 DSH 凭据库，配置里只留引用，**绝不进浏览器**。
- **一键刷新**：拉上游 `/models`（或 Gemini 原生 listing）→ 匹配能力 → 整段写入 `llm-pi-ai.providers.<route>`。官方模型选择器立即可见。
- **智能匹配**：
  - 协议：route 配置优先；无配置时按家族启发式（claude→anthropic、gemini→gemini、gpt/grok→responses、其余→completions）。
  - 能力：pi-ai 目录（1600+ 模型，含 thinkingLevelMap/compat）> models.dev > 家族默认。
  - 思考强度：从目录 thinkingLevelMap 推导 offered 档位；`thinkingFormat` 按家族（deepseek/zai/qwen/openai）。
- **逐模型覆盖**：任意模型的上下文/上限/模态/档位/thinkingFormat 都能手动改，刷新时保留。
- **安全写入**：写前自动备份、revision 乐观锁冲突重试、按已装 schema 剥离未知 compat 键、写后回读校验。
- **备份回滚**：保留最近 N 次快照，一键恢复。
- **可达性探测**（opt-in）：每协议发一个 max_tokens=1 的最小请求，测网关可达性。
- **独立设置页**：注册进官方设置面板（`settings.section` slot），**不做 DOM 注入**，中英双语。

## 安装

从 GitHub 直装（推荐）：

```bash
dsh plugin --profile web add @huakirax/dsh-model-pilot
```

或指定版本：

```bash
dsh plugin --profile web add @huakirax/dsh-model-pilot@0.1.0
```

装完重启 DSH，在 **设置 → 模型领航** 打开页面。

> 依赖 DSH ≥ 0.2.2-rc.1。插件启动时做接缝自检，缺接缝会降级并在页面顶部提示，不会让 profile 崩溃。详见兼容矩阵。

## 使用

1. **添加提供商**：填 route id（如 `completions`）、baseURL（如 `https://your-gateway/v1`）、协议、API key。
2. **刷新**：点提供商卡上的「刷新」或顶部「全部刷新」。插件拉上游模型列表、匹配能力、写入配置。
3. **查看/覆盖**：展开模型表，看每个模型的上下文/上限/模态/档位/thinkingFormat；点「覆盖」手动修正。
4. **选项**：是否删除上游已下架的模型（默认关，只标 stale）、自动刷新间隔、保留备份数。
5. **回滚**：写坏了就在「备份」里恢复上一个快照。

## 工作原理

```
设置页(baseURL+key)
  → host 代理拉上游列表（pi-ai discoverModels：completions/responses/anthropic；Gemini 自写）
  → 能力匹配（pi-ai 目录 > models.dev > 家族默认；带置信度/来源）
  → 协议分流（route.api 优先，家族启发式兜底）
  → 静默写入 ctx.settings.replace("llm-pi-ai", {providers})
      写前备份 + revision 重试 + 剥未知 compat 键 + 写后回读
  → 官方模型选择器生效
```

- **写入目标**是官方 `llm-pi-ai.providers.<route>`，所以官方 Models 页/选择器原生可见，重启不丢。
- **能力匹配绝不改 baseURL/端点**——协议是 route 的属性，目录里同一模型在不同 provider 下可能标不同协议，插件只取模型内禀能力（窗口/上限/模态/档位），端点以你的 route 为准。
- **标准 id 假设**：插件按标准模型 id 精确匹配（trim/大小写归一化 + 剥 `auto/` 等路由前缀）。请在网关侧把 id 对齐成标准名，匹配最准。

## 安全与隐私

- API key 经 DSH 凭据库（`ctx.credentials`）存储与解析，配置只留 `apiKeyEnv` 引用；设置页只显示「已设/未设」，不回显 key。
- 所有上游请求在 **host 侧**发出，浏览器只调本机同源 `/api/dsh-model-pilot/*`（owner-only 鉴权）。
- 每次写入前快照 `providers`，保留最近 N 份（默认 10），可一键回滚。
- models.dev 缓存只含公开能力数据，不含任何密钥。

## 版本兼容

DSH 接缝会随版本漂移。插件用**动态探测 + 启动自检**应对：

- 协议列表从已装适配器的 schema 实时读取（**0.2.2-rc.1 只有 3 协议，无 gemini**；Gemini 已实现，待 DSH 支持即自动启用）。
- 未知 compat 键按 live schema 剥离后再写，避免被 schema 拒绝。
- 目录从已装 `dsh-llm-pi-ai` 的 node_modules 解析，始终与适配器版本一致。

完整兼容矩阵、接缝清单与自检说明见 [docs/compatibility-notes.md](./docs/compatibility-notes.md)。

## 开发

```bash
pnpm install
pnpm test          # vitest：单测 + 集成（集成用真实 pi-ai 目录）
pnpm typecheck     # tsc --noEmit
pnpm build         # esbuild 双构建 -> lib/index.js（host）+ lib/client.js（browser）
```

- host：`src/index.ts`（apply + 6 个 fetch 端点）+ `catalog/matcher/protocol/writer/fetchers/modelsdev`。
- client：`src/client/*`（独立设置页，仅依赖 `slots`，自带 i18n）。
- 测试：`test/core.test.ts`（匹配/协议/目录/schema 门控）、`test/integration.test.ts`（mock 接缝跑通 add→refresh→write→rollback）、`test/m2.test.ts`（Gemini/models.dev/协议探测/probe）。

## 许可

MIT © Huakira
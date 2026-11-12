# 兼容矩阵与接缝自检 · dsh-model-pilot

本插件依赖 DSH 的若干内部接缝（seam）。DSH 仍在快速迭代，接缝会漂移。本文记录**已验证的接缝、版本边界、以及插件如何在漂移时降级而非崩溃**。恢复开发或升级 DSH 后先读这里。

验证基线：**DSH 0.2.2-rc.1**（Linux，web profile），2026-11-11。

## 1. 依赖的接缝清单

| 接缝 | 访问方式 | 用途 | 0.2.2-rc.1 出处 |
|---|---|---|---|
| 配置读写 | `ctx.settings`（`SettingsForms`，`inject:["settings"]`） | `describe()` 读 ns/value/revision/schema；`replace(ns,section,rev)` 整段写；`update(ns,patch,rev)` 合并写 | `dsh-settings/lib/index.js:413/470/479`；类型 `types/index.d.ts:96/102/108` |
| 模型发现 | `ctx.llm.discoverModels(ns, request, signal)` | 拉上游列表（3 协议） | `dsh-llm/lib/index.js:1999`；pi-ai 实现 `dsh-llm-pi-ai/lib/index.js:2427` |
| 凭据 | `ctx.credentials`（`resolve/set/unset/describe`） | key 落库与解析，配置只留引用 | `dsh-credentials/lib/types/index.d.ts` |
| host 代理路由 | `ctx.connection.fetch.register({path,methods,requestBody,fetch})` | 浏览器同源调 host，key 不进浏览器 | `dsh-client-connection/lib/index.js:732/840`；类型 `types/rpc.d.ts:119` |
| 客户端 slot | `ctx.slots.register({name:"settings.section",…}, Component)` | 独立设置页 | `dsh-client-ui-renderer`；契约 `dsh-client-ui-settings/lib/types/client/contract/slots.d.ts:73` |
| pi-ai 目录 | `@earendil-works/pi-ai` 的 `dist/providers/all.js`（`getBuiltinProviders/getBuiltinModels`） | 能力主源 | 文件系统直探 dist 文件，锚定 DSH 安装前缀（见 §5.3） |

### 关键约束（实测）

- **settings 的 ns 是 profile entry id**：pi-ai 的就是字符串 `"llm-pi-ai"`（cordis.patch.yml 里 `- id: llm-pi-ai`）。
- **只有 volatile 字段可经 settings 写**：pi-ai 的 `providers` 是 `.volatile()`（`dsh-llm-pi-ai/lib/index.js:1086`），整棵子树可写。
- **合并语义**：`update` 深合并、**数组整体替换**；`replace` 重置 volatile 段再设。本插件用 `replace` 写完整 providers（才能删除 route）。
- **乐观锁**：`expectedRevision` 不符抛 `SettingsConflictError{code:"SETTINGS_CONFLICT",expected,actual}`，插件重新 describe 重试（默认 3 次）。
- **schema 校验**：写入触发 pi-ai `Config(raw)` + `assertServiceable`（`dsh-llm-pi-ai/lib/index.js:2927`）。**未知 compat 键被拒**——插件写前按 live schema 剥离（`extractCompatKeys`）。
- **connection.fetch 路由**：path **必须在 `/api/` 下**，段名匹配 `^[A-Za-z0-9_$.-]+$`；methods 仅 `GET/HEAD/POST`（**无 DELETE**，删除走 POST action）；`requestBody:"buffered"|"streaming"`；**owner-only**（非 owner principal 直接 403）。
- **目录语义**：route 配了 `models[]` 就**替换**整个服务目录；`modelOverrides` 仅用于「目录 route」（route 名=内置 provider id）且不能与 models 并存。自定义网关 route 必须用 models[] 写全。

## 2. 协议兼容矩阵

协议集合**不是写死的**——插件用 `extractSupportedProtocols(schema)` 从已装适配器 schema 的 `api` union 实时读取。

| 协议 | 0.2.2-rc.1 | listing 来源 | 备注 |
|---|---|---|---|
| openai-completions | ✅ | `ctx.llm.discoverModels` | `{base}/models`，Bearer |
| openai-responses | ✅ | `ctx.llm.discoverModels` | `{base}/models`，Bearer |
| anthropic-messages | ✅ | `ctx.llm.discoverModels` | `{root}/v1/models?limit=1000`，x-api-key + anthropic-version |
| gemini | ❌ **适配器未暴露** | 插件自写 `fetchGeminiListing` | 已实现，schema 门控；DSH 加入 gemini 后自动启用 |

- pi-ai 的 `LISTABLE_PROTOCOLS`（`dsh-llm-pi-ai/lib/index.js:2281`）只含前 3 个；`PROTOCOLS`（`:1053` 的 `supportedProtocols()`）同样只有 3 个。**写 `api:"gemini"` 会被 schema 拒绝**，插件在 provider upsert 时先校验并给出明确错误。
- pi-ai listing 解析器（`readListing :2374`）同时认 `data[]` 数组与 `models{}` map（newapi/one-api 风格），从多种字段别名取 contextWindow/maxTokens；**端点 listing 不返回模态**，模态靠目录/models.dev 补。

## 3. 能力源优先级

`pi-ai 目录 > models.dev > 端点 listing > 家族默认`（matcher 按此顺序 overlay，高优先级覆盖低优先级）。

- **pi-ai 目录**：本机 1643 模型 / 43 provider，含 `thinkingLevelMap`/`compat`/`input`/`cost`。从已装适配器 node_modules 解析，版本始终一致。跨 provider 按标准 id 匹配。
- **models.dev**：`https://models.dev/api.json`（provider→models），取 `limit.context/output`、`modalities.input`、`reasoning_options`。24h TTL 磁盘缓存，断网回退 stale。**绝不读 api/端点字段**。
- **端点 listing**：主要给 id + 少量能力（实测某网关 18 个模型里只有 1 个带能力字段）。
- **家族默认**：protocol.ts 的 `defaultEfforts`/`compatFor`/`thinkingFormatFor`，兜底，置信度最低。

> 为什么目录优先：models.dev 同一 id 在不同 provider 下能力可能不一致甚至虚标（实测 deepseek-v4.1-flash-1017 的 maxTokens 有 provider 标 1048576，而 pi-ai 目录标 384000）。目录优先 + 用户可覆盖，避免虚标。

## 4. 启动自检与降级

`apply()` 逐项探测接缝，结果记入 `seams` 并在设置页顶部显示：

```
settings      = typeof ctx.settings.update/describe === function
llmDiscovery  = typeof ctx.llm.discoverModels === function
credentials   = typeof ctx.credentials.resolve === function
connectionFetch = typeof ctx.connection.fetch.register === function
catalog       = pi-ai 目录是否加载成功
```

降级行为：
- **缺 connectionFetch**：不注册后端端点，设置页不可用，日志告警；**不抛异常**（不会拖垮 profile）。
- **缺 catalog**：回退 models.dev + 家族默认，置信度下降，页面标注。
- **缺 models.dev**（断网且无缓存）：仅目录 + 家族默认。
- **缺 settings/llm/credentials**：相应功能报错并提示，其余只读功能仍可用。

## 5. 版本门控机制

1. **协议动态探测**：`extractSupportedProtocols` 读 schema api union；UI 下拉与 upsert 校验都用它。
2. **compat 键剥离**：`extractCompatKeys` 走 schemastery ref 图，收集所有含 `thinkingFormat` 的 object 节点的 dict 键；写前剥掉不在集合里的 compat 键（`stripUnknownCompat`），避免被新/旧 schema 拒绝。
3. **目录同源解析**：`resolvePiAiCatalogPath` 按可靠度顺序锚定候选根，文件系统直探 `dist/providers/all.js`，再 `import()` 具体文件；保证目录与适配器同版本。详见 §5.3。
4. **peer 范围**：`@deepseek-ai/schemastery ^3.18.0`、`react ^18||^19`；DSH 本体 ≥ 0.2.2-rc.1（安装器校验）。

### 5.3 目录解析的两个实测坑（0.1.1 修复）

0.1.0 在全局安装的 DSH 上 `catalog:false`（静默降级到 models.dev+家族默认）。根因有二，均已修复并加回归测试 `test/catalog-resolve.test.ts`：

1. **node 二进制不在 DSH 前缀里**。全局安装时 node 常在 `/usr/bin/node`，而 DSH 在 `/opt/dsh`。旧逻辑用 `dirname(process.execPath)/../lib/node_modules` 推全局前缀，得到 `/usr/lib/node_modules`（无目录）。**修复**：优先用启动脚本 `process.argv[1]`（`= <prefix>/bin/dsh`）推 `<prefix>/lib/node_modules`，与 node 位置无关；execPath 前缀降为次选锚点。
2. **pi-ai 是 ESM-only，exports 无 `require` 条件**。pi-ai 1.5.2 的 `exports` 含 `.` 与 `./providers/*`，但只在 `import`/`types` 条件下映射，没有 `require`/`default`。`createRequire(...).resolve("@earendil-works/pi-ai/providers/all")` 必抛 `ERR_PACKAGE_PATH_NOT_EXPORTED`（连包根都解析不了）。**修复**：不再 require.resolve 目录子路径，改为文件系统直探 `dist/providers/all.js`，再 `import()` 该具体文件（绕过 exports 映射）。适配器包本身可 resolve，故仍可从适配器目录上溯定位 pi-ai（`catalogNearAdapter`，兼容 hoist 到任意祖先 node_modules 的布局）。

锚点顺序：① `argv[1]` 安装前缀（含 `@deepseek-ai/dsh/node_modules` 嵌套）→ ② execPath 全局前缀 → ③ `DSH_HOME/profiles/*/node_modules` → ④ 插件自身 require 根（dev/test）。每个根都试 hoist/嵌套直探 + 适配器上溯。

> 运行时实测布局（nyc，DSH 0.2.2-rc.1）：目录在 `/opt/dsh/lib/node_modules/@deepseek-ai/dsh/node_modules/@earendil-works/pi-ai/dist/providers/all.js`，是适配器的**同级**（不在适配器自己的 node_modules 里）。修复后 `catalog:true`，43 provider / 1643 模型。

## 6. 升级 DSH 后的回归清单

升级 DSH（或 pi-ai 适配器）后，按此快速回归：

1. `pnpm test`：`catalog-resolve.test.ts` 用合成安装树锁定解析锚点；`integration.test.ts` 用 fixture 目录测编排（构建项目不装适配器，故其 seam catalog 为 false 属正常）。
2. 启动看日志 `adapter protocols: …` 与 `host applied (seams: …)`——**catalog 必须为 true**；若 false 看 `pi-ai catalog unavailable`，按 §5.3 排查锚点/布局漂移。真实目录加载成功时 `loadPiAiCatalog` 返回 43 provider / 1643 模型（数量突变即漂移信号）。
3. 设置页顶部 seams 全绿、catalog/models.dev 状态正常。
4. 对一个测试 route 刷新 → 展开模型表核对窗口/上限/档位 → 覆盖一个字段 → 回滚。
5. 若 schema 拒绝写入：看日志 `stripped unsupported compat keys`；新键需要时更新 `compatFor`/matcher。

## 7. 已知限制

- **Gemini 在 0.2.2-rc.1 不可用**（适配器未暴露），见 §2。
- **端点 listing 无模态**：纯靠 listing 的未知模型模态默认 `["text"]`，视觉模型需目录/models.dev 命中或手动覆盖。
- **单 baseURL 自动拆多协议 route** 未实现（若网关已按协议分好 route，逐条刷新即可）；如需要可后续加。
- **探测只证可达**：归一化网关上 max_tokens=1 探测不能证明协议保真，保真靠目录/知识库。
- **models.dev 跨 provider 取值**：同一 id 多 provider 时按文档插入序首个非空值生效（次源，目录优先已纠偏）。

## 8. 文件地图

```
src/
  index.ts        apply + 6 个 /api/dsh-model-pilot/* 端点 + 刷新编排 + 自检
  catalog.ts      pi-ai 目录解析/索引/能力提取
  matcher.ts      多源 overlay + 置信度/来源
  protocol.ts     家族→协议/thinkingFormat/默认档位
  writer.ts       settings.replace 安全写 + 备份/回滚 + schema 门控
  fetchers.ts     Gemini listing + 最小 probe
  modelsdev.ts    models.dev 次源（TTL 缓存 + 断网回退）
  types.ts        共享类型 + 接缝结构接口
  client/         独立设置页（api/i18n/PilotSection/index）
test/             core / integration / m2
docs/             本文
```

## 9. 版本变更记录

- **0.1.5**（2026-11-11）修「reasoningEfforts 档位键被 schema 拒绝」，并建立真实数据自调试：
  - **根因**：pi-ai 的 `reasoningEfforts: union(false, dict)`，dict 的 `sKey` 是枚举 union（`off/minimal/low/medium/high/xhigh/max`，适配器 `lib/index.js` model 对象 node146→reasoningEfforts node142→dict node128{sKey:113,inner:112}），`inner` 为 `union(string, null)`。pi-ai 目录的 `thinkingLevelMap` 经 `effortsFromLevelMap` 会原样产出含 `none` 的映射（如 kimi-k2.8-preview `{off:null,none:"none",…}`），多余键 `none` 被严格校验拒绝：`$.providers.<route>.models[N].reasoningEfforts expected false | { [key: "off"|…|"max"]: … } but got {…"none":…}`。值 string/null 本身合法，问题只在键。
  - **修复**：writer 新增 `extractReasoningEffortKeys(schema)`（object.reasoningEfforts→union→dict.sKey→union consts 动态读允许档位，随 DSH 版本自适应）+ `sanitizeReasoningEfforts(providers,allowed)`，在 `writeProviders` 过滤每个 `model.reasoningEfforts` 的键到允许集合、值限 string|null；`false`/缺省不动，全被剥则留空 map（schema 合法）。与 input/compat 门控并列，覆盖所有写入路径。剥离写日志 `stripped unsupported reasoningEffort levels: …`。
  - **自调试方法**（`scripts/selfdebug.ts` + `run-selfdebug.mjs`，不随包发布）：用真实适配器 `Config.toJSON()` 提取门控、真实 pi-ai 目录（1643 模型）、真实网关 listing（axonhub 18 模型），跑插件实际 `matchModel`+净化，再以真实 `Config` 校验整段 payload，并断言 `resolveRouteModels` 不变量（非空 models、api/baseURL 齐全、contextWindow/maxTokens 正整数）。在用户实际数据上精确复现 kimi-k2.8-preview/glm-5.3-flash:fast 的越界字段，净化后 **ALL PASS**。
  - 回归测试 +5（合成 schema 提取 / 未来加档位自适应 / 不可 introspect 回退 / 净化保留 false 与空 map / Writer 端到端），共 45 通过。
- **0.1.4**（2026-11-11）修「input 模态被 schema 拒绝」：
  - **根因**：pi-ai 的 `input: z.array(z.union(MODALITIES))`，`MODALITIES = Object.keys({text:true,image:true})`（适配器 `lib/index.js:282/1040`），**只接受 text/image**。能力次源 models.dev 会带 `video`/`audio`/`pdf`，匹配器原样写入 → 严格校验报 `$.providers.<route>.models[N].input[K] expected "text" | "image" but got "video"`。
  - **修复**：writer 新增 `extractInputModalities(schema)`（从 model 对象 `input` 字段按 array→union→const 动态读允许模态，随 DSH 版本自适应）+ `sanitizeInput(providers,allowed)`，在 `writeProviders` 统一 choke point 过滤每个 `model.input` 与 `route.defaultInput`，剥掉不支持的模态；过滤后为空则回退 `text`。覆盖添加/刷新/覆盖/回滚所有写入路径。剥离时写日志 `stripped unsupported input modalities: …`。
  - 回归测试 +5（合成 schema 提取 / 未来加 video 自适应 / 不可 introspect 回退 / 净化与回退 / Writer 端到端），共 40 通过。
- **0.1.3**（2026-11-11）修复「添加 provider 报错」并新增协议智能匹配：
  - **根因**：pi-ai 写入即严格校验，`resolveRouteModels`（`dsh-llm-pi-ai/lib/index.js:679`）对**自定义网关 route**（route 名不在内置目录）要求 `models[]` 非空，否则抛 `resolves no models; the installed catalog does not describe this route, so its models must be listed in configuration`。旧版「先加空 route 再刷新」在添加这一步就被拒。
  - **修复**：provider upsert 改为**添加即填充**——同一步内拉上游 listing + `buildModels` 后再写，绝不写空 route；listing 为空且非内置目录 route 时返回明确 400 错误且不落盘。
  - **协议智能匹配**：新增 `detectProtocol(baseURL,apiKey,signal)`，依次试 openai-completions→anthropic-messages→openai-responses（completions/responses 共用 `{base}/models` listing，故 OpenAI 风格默认 completions），取首个返回模型的协议。客户端协议下拉新增「智能匹配（自动探测）」并设为新 provider 默认；upsert 收 `api:"auto"`/空即探测，写入具体协议。
  - **refresh 守护**：某 route 刷新后 models 为空且非内置目录 route 时保留旧 models 并记 perRoute 错误，避免整段写入失败。
  - **probe 文案**：按钮改「连通性测试 / Test reachability」（含义：发一个 max_tokens=1 的最小请求验证模型可达，不证明协议保真）；guard 捕获错误时写 warn 日志便于排查。
  - 回归测试 +3（auto 探测即填充 / 空列表拒绝 / anthropic 自动识别），共 35 通过。
- **0.1.2**：host applied 日志改异步（等 sourcesReady settle），避免快照 catalog:false 误导。
- **0.1.1**：修 pi-ai 目录解析（全局安装 node 在 /usr/bin，ESM-only 包 exports 无 require 条件）；改用 process.argv[1] 锚定安装前缀 + 文件系统直探。
- **0.1.0**：首版。
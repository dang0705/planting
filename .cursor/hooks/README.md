# Project Cursor hooks

这套 Hook 的职责不是“用规则替代 TDD 语义判断”，而是机械锁住可无歧义验证的事实：**成功 Test First 证据、产品/闸门写入的人类授权、Shell 防绕过、回合结束的全量 UT**。

> 当前 Cursor 官方 Hooks 文档说明：`preToolUse` 的 schema 虽接受 `permission: "ask"`，但 `ask` 目前不会真正执行。因此本实现**不再依赖 ask 确认卡**，改成 `deny → 用户精确路径令牌 → allow`。

## 必须接入的事件

项目 `.cursor/hooks.json` 请合并 [`hooks-json.fragment.json`](hooks-json.fragment.json)。核心事件：

| Script | Event | 作用 |
| --- | --- | --- |
| `scripts/matrix-gate/record-prompt-waiver.mjs` | `beforeSubmitPrompt` | 开启 generation；记录 Test First 豁免和用户精确写入授权 |
| `scripts/matrix-gate/ask-before-product-source.mjs` | `preToolUse` | 测试写入挂 pending；产品先过 Test First，再检查一次性用户授权；闸门文件也需授权 |
| `scripts/matrix-gate/record-tool-result.mjs` | `postToolUse` | 成功工具执行后：确认测试实际变化、消费写入授权、记录明确测试命令产生的 RED |
| `scripts/matrix-gate/record-tool-failure.mjs` | `postToolUseFailure` | 工具失败时释放 pending，不产生证据、不消费授权 |
| `scripts/matrix-gate/shell-product-guard.mjs` | `beforeShellExecution` | Shell 改产品或闸门一律 deny |
| `scripts/ut-stop-gate.mjs` | `stop` | 对所有受影响且有 runner 的 package 跑全量 UT |
| `scripts/check-test-matrix-gate.mjs` | CLI | Hook 自测入口 |

权限型 hook 建议 `failClosed: true`。项目 Hook 从仓库根执行，路径应写成 `.cursor/hooks/...`。

## `config.json`

| 字段 | 含义 | 示例 |
| --- | --- | --- |
| `appPackage` | 主应用包，相对仓库根；`"."` = 根包 | `src-taro` |
| `productRoots` | 相对 `appPackage` 的产品源码根 | `['src/']` |
| `skipListFile` | **仅 runner** 的 test exclude 来源；不再获得 Test First 旁路 | `test-exclude.json` |
| `testFirstBypassFile` | **仅 Test First** 旁路清单，JSON 形状 `{ "bypass": [] }` | `test-first-bypass.json` |
| `gateControlFiles` | 其它可影响测试/闸门的配置 | `['vitest.config.mts']` |
| `importAliases` | 测试 import 别名 → 应用包路径 | `{ '@/': 'src/' }` |
| `candidatePackages` | stop gate 扫描的具体包或一层 workspace 容器 | `['src-taro','packages','apps']` |
| `codeExtensions` | 产品源码扩展名 | `['.ts','.tsx','.js','.jsx','.mjs','.cjs','.vue']` |
| `tddEnforcement` | 仓库级 Test First 机械开关；成熟仓为 `true` | `true` |
| `testCommands` | stop gate 的包相对路径 → 明确测试命令；存在时覆盖 runner 自动推断 | `{ "packages/lib": "npm run test:unit" }` |

`testFirstBypassFile` 缺失时视为空清单（偏严）。模板见 `templates/test-first-bypass.json`。

## Test First：什么才算证据

### 1. 新写/修改代表性测试

`preToolUse` **只登记 pending**，不会立即解锁产品。只有 `postToolUse` 确认：

1. 工具执行成功；
2. 测试文件存在；
3. 文件内容相对 pre 快照确实发生变化；

才记录为 Test First evidence。

因此下面两种都不会解锁：

- StrReplace/Write 最终失败；
- 对已有测试做 no-op / 内容完全未变。

### 2. 已有代表性测试

不要求为过闸去 touch 已有测试。若已有测试已经准确表达独立 Expected，可以先显式执行它得到 RED。

机器只接受较窄的 RED 证据：

- `postToolUse` 的 `Shell` 结果有明确非 0 exit code；
- 命令可识别为测试 runner；
- 命令里显式出现具体 `*.test.*` / `*.spec.*` 测试路径；
- 该测试文件实际存在。

为避免“多个测试一起跑，只因另一个测试失败就给目标测试记 RED”，生产入口只应把**恰好一个显式测试文件**的失败当作可消费的 RED 顺序证据；更宽的失败只能留给 Skill 做语义判断。

整仓 `npm test` 失败但没有指明代表性测试，不会自动解锁产品。

### 3. generation 边界

普通用户消息会开启新 generation，Test First evidence 默认不继承。

唯一例外是**授权握手**：产品因为缺少人类授权被拦后，用户下一条消息给出精确 `#approve-product-write ...` 时，会把上一 generation 已经形成的 `tests/redTests` 继承进新 generation。否则会形成“测试已先行，但一回复授权证据就被清空”的死锁。

## 产品与闸门写入授权

Cursor 当前不能依赖 `preToolUse: ask` 做真实确认，所以使用用户消息中的精确路径令牌。

### 产品文件

```text
#approve-product-write src/foo.ts
```

路径是**相对 `appPackage`**。授权只对应该路径的一次成功工具写入：

- preToolUse 先 reserve；
- 工具成功后 postToolUse 消费；
- 工具失败则 postToolUseFailure 释放，不消费；
- 再写同一文件需再次取得用户授权。

### 闸门文件

```text
#approve-gate-write .cursor/hooks/scripts/config.json
```

路径是**仓库相对路径**，同样只授权一次成功写入。

`#skip-test-first` 只表示“本 generation 跳过 Test First 顺序闸”，**不等于产品授权，也不允许 Shell 改产品**。

## TDD readiness 与机器闸

Skill 可以判定仓库尚处脚手架期；Hook 不做语义猜测。两者通过 `config.tddEnforcement` 对齐：

- 成熟仓：`true`；
- 明确未就绪仓：仓库所有者初始化为 `false`；
- 代理不得自行修改该开关；它属于 gate-control；
- 若单轮确需例外，用户可显式给 `#skip-test-first`。

这样不会用脆弱的“源码文件数阈值”伪装成 TDD readiness 判断。

## Shell 防绕过

`beforeShellExecution` 对常见写法做静态拦截：`sed -i`、`cp/mv/rm`、重定向、`git restore/checkout/apply`、Python/Node 写文件 API、heredoc 等。命中产品源码或闸门配置直接 deny。

此外直接执行/导入 `record-prompt-waiver.mjs`、`record-tool-result.mjs`、`ledger-store.mjs` 等授权台账入口会被拦截，避免用 Hook 自己伪造用户授权/测试证据。

动态拼接、临时脚本再间接改状态等同权限进程行为仍无法靠命令文本形成形式化证明，因此 Skill 层仍禁止代理绕闸；这套 Hook 是高强度工程闸，不是 OS 沙箱或独立安全域。

## Stop 全量 UT 闸

新版不再“先选一个最高分 package”。流程是：

1. 真正读取 `config.candidatePackages`；
2. 找出所有有测试依赖 + 测试文件的包；
3. 把 dirty path 分配给最深的对应 package，避免根包和子包重复；
4. **所有受影响 package 都执行**各自的测试命令；
5. runner 命令可用 `config.testCommands` 精确覆盖；未配置时按依赖 + `packageManager` / lockfile 自动识别 `npm`、`yarn`、`pnpm`、`bun`；
6. 每包独立记状态。

### 指纹

不再只用“dirty 路径列表”。当前 fingerprint 是：

```text
SHA-256(
  每个 dirty path
  + 当前文件 mode/size
  + 当前文件内容
  + 删除标记
)
```

因此：

- 同一批路径且内容没变 → 上次已绿可跳过；
- **同一路径再次修改** → hash 改变，必须重跑；
- 删除文件 → 指纹也变化。

## 自测

```bash
node .cursor/hooks/scripts/check-test-matrix-gate.mjs
```

当前自测覆盖至少包括：

- pending test 不解锁；
- no-op test 不解锁；
- 成功 test write 解锁；
- 已有测试 RED 解锁；
- 授权握手跨 generation 继承 Test First evidence；
- 一次性产品授权消费；
- Shell 防绕过；
- `test.exclude` 与 Test First bypass 分离；
- `.vue` 等源码扩展配置；
- `candidatePackages` 真正生效；
- monorepo 多包同时受影响；
- 同路径内容变化导致新 fingerprint。

# Codex TDD Hooks v3（Test Matrix 运行时硬闸）

这套 Hook 只把**机器能无歧义验证**的 Test Matrix 约束落到 Codex 生命周期：

- Test First：测试真实落盘后才形成顺序证据；
- 已有代表性测试可以“显式单测 RED”作为顺序证据；
- 所有受管 package 的产品源码 / 闸门文件都需要**仓库相对、精确路径、一次性用户授权**；
- `Bash` / `apply_patch` / 可识别本地或 MCP 写工具进入硬闸；
- Shell 常见直接写、opaque patch、`git stash` 隐藏状态、可识别的外部脚本间接写入和授权台账伪造被阻断；
- `UserPromptSubmit` 捕获 turn-start baseline，`Stop` 以**回合起点与最终文件状态差异**决定受影响 package，因此中途 `git commit` 不能洗掉全量 UT；
- monorepo 中 `appPackage`、`candidatePackages` 发现出的包共用同一套产品边界。

Hook 不尝试用正则证明 Expected 独立性、RED 失败原因、Mutation 语义有效性；这些仍由 Skill 负责。

## 1. 安装

解压到 Git 仓库根：

```text
<repo>/
└── .codex/
    ├── hooks.json
    └── hooks/
        ├── README.md
        ├── scripts/
        ├── state/
        └── templates/
```

项目级非托管 Hook 必须在 Codex 中通过 `/hooks` 审核并信任，否则不会执行。

本实现依赖 Git 根定位与 Node.js。

## 2. 生命周期

| Codex 事件 | 脚本 | 作用 |
| --- | --- | --- |
| `UserPromptSubmit` | `codex-user-prompt-submit.mjs` | 建立当前 turn 台账；记录精确授权 / `#skip-test-first`；捕获 turn-start baseline |
| `PreToolUse` | `codex-pre-tool-use.mjs` | Test First、精确授权、Shell 防绕、可识别写工具路径检查 |
| `PostToolUse` | `codex-post-tool-use.mjs` | 比较真实文件前后状态，提交测试证据 / 消费授权；记录窄 RED |
| `Stop` | `ut-stop-gate.mjs` | 按 turn baseline 找出受影响 package，运行各包全量 UT；失败时 continuation，带循环保护 |

正常放行时 Hook **不返回 `permissionDecision: "allow"`**，避免替用户跳过 Codex 原生权限 / sandbox 审批；只有违规时返回 `deny`。

## 3. 用户授权

产品与闸门路径都以**仓库相对路径**表达：

```text
#approve-product-write packages/lib/src/a.ts
#approve-gate-write .codex/hooks/scripts/config.json
```

授权只允许该精确路径的一次真实成功变化：

```text
PreToolUse
→ reserve 授权
→ 工具执行
→ PostToolUse 比较 before/after

真实变化 → 消费
失败/no-op → 不消费
```

`#skip-test-first` 只跳过当前 turn 的 Test First 顺序，不授权产品写入，也不能授权 Shell 绕写。

## 4. Test First

### 新写 / 修改测试

`PreToolUse` 只记录 pending；`PostToolUse` 看到文件真实改变后才形成证据。

因此以下都不能解锁产品：

- apply_patch 失败；
- patch 未命中；
- no-op；
- 同一个 `apply_patch` 同时写测试 + 产品，试图自举解锁产品。

### 已有测试 RED

无需为了过闸 touch 测试。机器层只接受窄证据：

- Bash 可识别为测试 runner；
- 命令恰好显式包含一个 `*.test.*` / `*.spec.*`；
- 文件属于某个受管 package 且真实存在；
- `PostToolUse.tool_response` 能证明退出码非 0。

Hook 只证明“RED 发生”，不证明 RED 的业务原因正确。

## 5. Monorepo 产品边界

`config.json` 的：

```json
{
  "appPackage": "src-taro",
  "candidatePackages": ["src-taro", "packages", "apps"],
  "productRoots": ["src/"]
}
```

会形成共享的受管 package 集合。`packages` / `apps` 既可以指具体 package，也可以指一层 workspace 容器。

因此：

```text
src-taro/src/a.ts       → product
packages/lib/src/a.ts   → product
apps/admin/src/a.ts     → product
```

不会再出现“Stop 知道子包，但产品写入硬闸只保护 appPackage”的语义漂移。

## 6. Shell 防绕

`PreToolUse(Bash)` 会阻断常见直接 / 间接写入：

- `sed -i`、`tee`、`cp`、`mv`、`rm`、`truncate`、重定向；
- `bash -c` / `eval` 等包装；
- Python / Node / Perl 常见写文件 API；
- `git apply` / `patch` 落盘形式（补丁内容可隐藏真实目标）；
- `git stash` 会改变工作区可审计状态的形式；
- 直接执行 / 动态导入会修改授权台账的 Hook；
- 可读取的小型外部脚本若明确包含“写 API + 受管产品/闸门路径”，也会拒绝执行。

只读形式保持允许：

```text
git apply --check ...
patch --dry-run ...
git stash list
git stash show
git diff / rg / cat
```

它仍是工程强闸，不是 OS 沙箱。同一用户权限下的动态生成路径、不可解析二进制副作用等无法靠命令文本形成形式化不可绕证明。

## 7. Stop：turn-start baseline

旧模型只看最终 `git status`，存在：

```text
改产品 → git commit → working tree clean → Stop 误跳过
```

v3 在 `UserPromptSubmit` 捕获当前回合 relevant manifest；Stop 比较：

```text
turn-start manifest
        ↓
最终 manifest
        ↓
diff paths
        ↓
最深 owning package
        ↓
对应 package 全量 UT
```

所以中途 commit 不会洗掉测试义务。

如果 baseline 无法取得，才兼容性退回 `git status --porcelain`，日志会明确标注 fallback。

Stop continuation 后即使新 prompt 重置 baseline，上一轮失败 package 仍保存在 state 中并强制复测；同一失败指纹连续达到上限后返回 `continue:false`，避免无限循环。

## 8. 配置

| 字段 | 含义 |
| --- | --- |
| `appPackage` | 主应用包，同时也是显式受管 package |
| `candidatePackages` | 其它受管 package 或一层 workspace 容器 |
| `productRoots` | 每个受管 package 内的产品源码根 |
| `testFirstBypassFile` | Test First 独立旁路清单 |
| `skipListFile` | runner exclude；不等于 Test First bypass |
| `gateControlFiles` | 会影响测试 / 闸门行为的包内配置 |
| `importAliases` | 测试 import alias |
| `codeExtensions` | 被视作产品/测试代码的扩展名 |
| `tddEnforcement` | 仓库级 Test First 开关 |
| `testCommands` | package 相对路径 → 明确全量 UT 命令 |

## 9. 自测

```bash
node .codex/hooks/scripts/check-test-matrix-gate.mjs
```

本版本回归覆盖：

- pending / no-op 不解锁；
- 成功测试变化；
- existing RED；
- 精确一次性授权与失败不消费；
- 同 patch 测试+产品不自举；
- 所有受管 package 产品硬闸；
- `git apply` / `patch`、stash 与外部解释器脚本旁路；
- monorepo affected packages；
- 内容 fingerprint；
- commit 后 working tree clean 仍被 baseline 捕获；
- Codex Stop continuation 循环保护。

## 10. 可审计边界

Hook 机械证明：写入顺序、文件真实变化、精确授权、已知 Shell 绕法、窄 RED、受影响 package 全量 UT。

Skill 语义证明：Expected 独立性、Truth Source、RED 原因、Real Path、Mutation / 执行反写、Scope / 产品安全。

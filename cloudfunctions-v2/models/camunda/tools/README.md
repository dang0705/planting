# Camunda 模型生成器

本目录生成上级目录中的 5 个 Camunda 模型（Camunda Modeler 可直接打开），只用 Node.js 内置模块，不安装依赖、不访问网络或数据库。生成产物只是**只读可视化**：未接入任何规则引擎，修改它们不改变线上行为。

| 文件 | 职责 |
|---|---|
| `dmn-specs.mjs` | DMN 语义：决策表输入/输出/规则、输入数据、知识源及其 DRD 网格位置（`col`/`row`）。规则取自 `cloudfunctions-v2/src/care/**` 与 `models/care/mvp-watering-policy-release.v2.json` |
| `bpmn-specs.mjs` | BPMN 语义：泳道、节点（所在泳道、列 `col`、相对主线行 `row`）、连线与错误结束事件 |
| `dmn-build.mjs` / `bpmn-build.mjs` | 把网格位置换算成坐标，调用布线器，输出 XML（含 DMNDI / BPMNDI） |
| `lib.mjs` | 正交 A* 布线（网格 10px；已布连线占用的网格点对后续连线封锁，因此不交叉、不共用线段；节点外扩 10px 为禁行区；泳道边界禁止横向走线）、标签避让、SVG 预览 |
| `generate.mjs` | 入口 |

## 用法

```sh
cd cloudfunctions-v2/models/camunda
node tools/generate.mjs                       # 重新生成并写回本目录 5 个文件
node verify-layout.mjs                        # 独立校验：引用、正交、不交叉、不穿节点、标签、间距
node tools/generate.mjs --out /tmp/camunda-check && for f in *.bpmn *.dmn; do cmp "$f" "/tmp/camunda-check/$f"; done   # 确认入库文件可由生成器复现
node tools/generate.mjs --preview /tmp/camunda-preview   # 另出 SVG 预览，仅本地查看
```

## 修改约定

1. 先改 `*-specs.mjs` 的语义，再重新生成；不要手改生成出的 `.bpmn` / `.dmn`，否则下次生成会被覆盖。
2. 布局只通过 `col`、`row`（以及 BPMN 的 `routeLast`：最后布线的连线）调整。主流程从左到右，分支放在主线上下（`row` ±1、±2），汇合网关回到主线。
3. 生成后必须执行 `node verify-layout.mjs` 且全部 PASS；DMN 另按 `tools/care-model-validation` 的 dmnlint 做结构校验。
4. 若生成器报“无法布线”，说明当前网格位置下不存在无交叉路径：调整节点位置或布线顺序，不要放宽校验。
5. 模型变化不等于行为验收：决策表与 TypeScript 的同场景一致性、FEEL 执行与 Modeler 往返均需另行验证。

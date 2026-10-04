# 养护决策模型

本目录承接统一重构计划的 E04 回放与比较阶段。当前是**未行为验收的离线草案**：没有接入线上执行，也不证明对应 TypeScript 数值用例已实现。

四个可编辑源是 `light.dmn`、`pot.dmn`、`dry-cycle.dmn`、`watering.dmn`。`care-models.dmn` 是合成总图，禁止单独编辑。修改源后运行：

```sh
python3 scripts/backend-v2/compose-care-models.py
```

模型使用决策模型与标记（DMN）1.3。决策标识、变量和输出名为英文；名称、规则说明及依据为中文。清单 `manifest.json` 保存输入类型、稳定决策标识、输出名和 SHA-256。

| 编辑源 | 决策责任 | 后端计算输入 |
| --- | --- | --- |
| 光照 | 户外／室内准入、现场校准资格及能力状态 | 窗面几何、位置传播、直射／散射、PPFD／Lux／DLI 区间 |
| 盆器 | 实际内盆、尺寸、排水安全及保水准入 | 有效体积、基质分类与保水区间 |
| 干湿循环 | 可靠历史循环、条件变化、版本与残差资格 | 不含个体校准的预测残差及校准候选 |
| 浇水 | 基线与进度资格、盆土安全门及建议 | 生长状态所选基线、并列环境派生、环境需求及时间积分 |

光合光子通量密度（PPFD）、日光积分（DLI）和空气水汽压亏缺（VPD）在后台使用；用户侧继续表达为光照与空气干燥程度。物理计算作为明确的输入数据节点，不虚构友好表达式语言（FEEL）函数。输入快照、策略发布及类型校验由后端负责。

合成器把光照、盆器、历史校准三项输入重新连接到对应上游决策，保留其余外部输入。它检查引用、标识、依赖无环及表格列数，不执行 FEEL。历史反馈跨计算轮次发生。

`UNIQUE` 表表示互斥分区；盆土安全门与最终建议采用 `FIRST`，按规则顺序执行。预测超窗只要求检查；可靠湿土优先暂停浇水。缺浇水起点不补零进度，未批准参数不补默认，建议不写计划或事实。

当前验收证据：五个文件通过 [OMG DMN 1.3 官方 XML Schema](https://www.omg.org/spec/DMN/1.3)；局部引用、依赖无环及确定性合成检查通过。尚未执行 `dmnlint`、Camunda 兼容引擎、Desktop Modeler 保存后重新打开或 TypeScript 同场景一致性验证。不得以 XML 校验代替这些验收；未经模型与后端双侧一致性证明，不得发布规则。

离线计算叶节点 `src/care/light/integrate-ppfd-intervals.ts` 已实现区间平均 PPFD 积分，内部合同见 `light-interval-contract.md`。20 个独立场景及 Node.js 22 验证通过，已记录单位换算突变失败与恢复成功。它只覆盖时间积分，不代表传播、衰减、正式光照发布或 DMN 与后端完整一致性已验收。

离线计算叶节点 `src/care/light/project-window-direct.ts` 已实现同刻瞬时 DNI 到无遮挡窗面外侧的直射投影，内部合同见 `window-direct-contract.md`。太阳位置由独立上游提供；它不计算散射、玻璃或植物位置传播，也不把单时刻投影解释成区间平均值。该节点对应光照模型的外部物理计算输入，尚未接入生产发布或证明完整 DMN 一致性。

`src/care/light/trace-direct-through-window.ts` 使用植物位置、垂直离窗距离和多个真实透光矩形判断直射射线是否到达目标位置，见 `direct-reach-contract.md`。它保留窗框边界状态和连窗墙体间隔，仅判断给定竖窗几何，不代表其他遮挡不存在，也不输出植物位置辐照度。光照模型的物理输入仍须结合已准入的散射、传播和光谱转换计算。

`src/care/light/normalize-open-meteo-radiation.ts` 使用 AJV 验证已取得的真实 Provider 制品，保留前一时段辐射均值与 UTC 时间，见 `radiation-interval-contract.md`。回放制品保留来源元数据与 SHA-256；真实响应不等于现场测量。小时／15分钟平均值不能直接接入仅消费瞬时辐射的窗面用例，时间近似、完整当地日期请求覆盖、缓存与发布策略仍须单独准入。

`src/care/application/replay-window-direct-radiation.ts` 已串联真实制品归一化与同一完整时段的窗面直射界限，合同见 `window-mean-direct-contract.md`。所有几何输入均显式给定并按窗面、区间匹配；缺几何、缺DNI、重复及未使用时段分别处理。普适[0,1]投影包络仅证明物理范围，不等于真实太阳位置算法、植物位置光照或正式模型发布。此离线用例没有网络、数据库或事件写入。

`src/care/application/project-window-direct-at-location.ts` 已接通显式地点与UTC时刻→NOAA近似太阳方向→同刻瞬时窗面投影；来源与边界见 `solar-direction-contract.md`。均值辐射拒绝进入此入口；天顶/天底方位未定义时保留特定状态。此增量不提供完整区间几何界限、现场精度保证或正式发布资格。

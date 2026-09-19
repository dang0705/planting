# P1 配置冻结范围裁决

- 裁决日期：2026-09-20
- 事实源：`docs/backend-v2/phases/P1-contracts-identity-foundation.md`、各后续 Phase 入口、`configuration-variable-catalog.json`
- 目的：落实“P1 实现依赖项全部冻结”，同时禁止把后续业务实现和真实集成参数伪装成 P1 已验证。

## 裁决规则

1. P1 直接消费的合同、Schema、配置发布护栏、HTTP 基础护栏和凭证解析器合同必须在 P1 冻结。
2. 只会在 P2-P4 业务实现中首次消费的参数，保持 `pending` 和失败关闭，但改挂到首次消费它的 Phase 与 ClickUp ticket；进入该实现前必须冻结。
3. 必须依赖真实供应商、真实流量、支付沙箱、容量或法务分类才能决定的参数，保持 `pending` 并改挂 P5；不得用旧实现或行业常见值冒充真实验收。
4. 改挂 Phase 只改变冻结时间点，不解除 `blockingScope`，也不允许目录外默认值。

## P1 必须冻结

- 用户植物最低有效档案：`user-plant-profile/v1`。
- 四级主体能力目录：`subscription-capability-catalog/v1`，精确登记十个能力代码，未知能力拒绝。
- 配置最近有效版本、缓存、紧急关闭、快照保留、审批和快速回滚护栏。
- CloudBase 受控凭证解析器合同引用；它不代表真实凭证或真实调用已验收。
- 通用幂等保留期和内部 API 请求体上限。
- 植物百科展示内容 Schema、诊断模型输出 Schema、诊断 Prompt release、Qwen 3.5 Flash 精确模型代码。

## 改挂后续阶段

| 首次消费阶段 | 待冻结范围 | 对应 ticket |
|---|---|---|
| P3 | AI 预占时长、百度候选阈值、CMS 补全队列/背压/恢复预算、百度 Provider、上传规格、游客防滥用、可靠事件运行参数 | `[P3] 游客、试用、会员和奖励闭环` |
| P4 | 盆土证据、天气新鲜度、四类养护阈值/提醒、诊断图片/题包/路由/补拍/恢复、和风 Provider、生成式动作成本策略 | 对应 care 或 diagnosis P4 ticket |
| P5 | 微信支付超时、支付与业务审计物理清理策略 | `[P5] 真实 MySQL/API/安全/性能验收` |

## 失败关闭

- 后续阶段变量保持 `P1_PENDING` 时，对应 `blockingScope` 仍为 STOP。
- P1 退出只证明本阶段直接消费项已冻结，不证明 P2-P5 功能、真实 Provider、真实 CloudBase 或法务保留策略完成。
- 任一 pending 变量在错误 Phase 被提前消费，配置测试和阶段退出门必须失败。

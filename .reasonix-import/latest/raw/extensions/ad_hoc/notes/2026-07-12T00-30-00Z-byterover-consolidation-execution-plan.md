# ByteRover consolidation execution plan for planting

Date: 2026-07-12

Status: cloud write blocked. `record.mjs` returned
`cloud-capability-expired`; do not retry until the user renews or restores the
ByteRover cloud capability.

## Create after cloud capability is restored

Record this one replacement Topic. It supersedes the four stale terminal-state
topics listed below, but does not link to them because they are deletion
candidates.

```html
<bv-topic path="architecture/diagnosis/mode_specific_question_package_contract"
          title="按模式区分的固定问诊题包契约"
          summary="黄叶与枯萎发蔫使用各自独立的固定题包，题数和题目主题不能套用全局四题假设。"
          keywords="question package,固定题包,黄叶,yellow leaf,枯萎发蔫,wilting droop,mode specific,4题,5题"
          tags="diagnosis,product-contract,question-package">
  <bv-reason>旧记忆把不同症状模式压缩为全局固定四题，容易让后续修改错误复用黄叶题包约束。此 Topic 只保留跨模块、面向产品行为的模式差异契约。</bv-reason>
  <bv-task>记录诊断固定题包按症状模式分别定义题数和主题的当前契约。</bv-task>
  <bv-decision id="d-mode-specific-packages">固定问诊题包按症状模式独立配置，不共享全局题数。</bv-decision>
  <bv-structure><ul><li>黄叶模式：固定题包为 4 题，覆盖浇水频率、光照变化、施肥生长和通风湿度。</li><li>枯萎/发蔫模式：固定题包为 5 题，覆盖浇水频率、形态、环境节律、近期应激和高危异常。</li></ul></bv-structure>
  <bv-rule severity="must" id="r-question-count-by-mode">新增或修改固定题包时，必须按其模式的独立题数和主题处理，不得套用黄叶四题约束。</bv-rule>
  <bv-fact subject="mode_specific_question_packages" category="project" value="yellow_leaf and wilting_droop">当前固定问诊题包至少区分黄叶和枯萎/发蔫两个症状模式。</bv-fact>
  <bv-fact subject="yellow_leaf_question_count" category="project" value="4">黄叶固定题包当前为 4 题。</bv-fact>
  <bv-fact subject="wilting_droop_question_count" category="project" value="5">枯萎/发蔫固定题包当前为 5 题。</bv-fact>
  <bv-fact subject="global_question_count_assumption" category="project" value="invalid">不存在可供所有诊断模式复用的全局固定四题假设。</bv-fact>
  <bv-files><li>cloudfunctions/diagnose-http/app/question-package-response.js</li><li>cloudfunctions/diagnose-http/app/wilting-droop-question-package.js</li></bv-files>
  <bv-timestamp>2026-07-12</bv-timestamp>
</bv-topic>
```

Verified sources:

- `cloudfunctions/diagnose-http/app/question-package-response.js` defines
  yellow-leaf as a 4-question package and keeps a separate config for
  `wilting_droop`.
- `cloudfunctions/diagnose-http/app/wilting-droop-question-package.js`
  defines `WILTING_DROOP_PACKAGE_QUESTION_COUNT = 5`.

## Delete in ByteRover Desktop

These Topics are not merge candidates:

- `architecture/backend/source_verified_backend_facts.html`: code entrypoint
  inventory, not durable business or architecture knowledge.
- `architecture/backend/source_verified_backend_facts/source_verified_backend_facts.html`:
  malformed concatenation of multiple topics and prohibited QA/workflow rules.
- `tooling/runtime-first-automation-truth-gate.html`: prohibited QA/Skill
  policy duplicate.
- `tooling/wechat-runtime-first-evidence-policy.html`: prohibited QA/Skill
  policy duplicate.

After creating the replacement topic, delete these stale duplicates:

- `architecture/diagnosis-main-chain-terminal-state-governance.html`
- `architecture/question-package-terminal-state-governance.html`
- `architecture/terminal-state-governance-for-diagnosis-main-chain.html`
- `architecture/terminal-state-governance-for-diagnostic-lifecycle.html`

## Registry reconciliation

When the memory registry is next reconciled, apply the canonical V3/V4 rule
block from `2026-07-12T00-20-00Z-byterover-governance-canonical-rule-block.md`
and replace the statement at `MEMORY.md:1003`. It must say only that the
named `.brv/context-tree` update was historical V3 evidence; it must not say
that `npm run check:brv-v4-boundary` confirms topic-content correctness.

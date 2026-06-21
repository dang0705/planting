# Knowledge Hygiene Policy

## Purpose

This policy replaces blanket documentation synchronization.

The repository now follows:

外置模板/规范片段：`../assets/templates/knowledge-hygiene.md`（template_id: `knowledge-hygiene-policy-01`）。

## Phase integration

After implementation and main-agent code review, main agent must create a Sync Packet before deciding whether to call `docs_keeper`.

### Sync Packet

外置模板/规范片段：`../assets/templates/knowledge-hygiene.md`（template_id: `knowledge-hygiene-policy-02`）。

## Trigger matrix

| Change type | docs_keeper action |
|---|---|
| Pure internal refactor, no public behavior/contract change | usually no-op |
| Public API / frontend-visible response fields | patch `docs/ACTIVE_CONTRACTS.md` |
| Schema/env routing / CloudBase environment / SQL table contract | patch active contracts and BRV index |
| Deploy/local-debug/runbook behavior | patch `docs/RUNBOOK.md` |
| AI workflow / dispatch / agent roles / context packs | patch `AGENTS.md`, `.codex/context-packs.yml`, `docs/KNOWLEDGE_GOVERNANCE.md` |
| Old doc contradicts code | mark stale/superseded; do not rewrite old blueprint |
| New source-verified reusable fact | add/update `.brv/context-tree/facts-index.yml` with source and invalidation |
| Large architecture rewrite | require explicit audit mode |

## Active docs

Only these are synchronized as current docs:

外置模板/规范片段：`../assets/templates/knowledge-hygiene.md`（template_id: `knowledge-hygiene-policy-03`）。

## Archive-only docs

The following are not synchronized as current facts:

外置模板/规范片段：`../assets/templates/knowledge-hygiene.md`（template_id: `knowledge-hygiene-policy-04`）。

## BRV rule

BRV entries must be compact index records:

外置模板/规范片段：`../assets/templates/knowledge-hygiene.md`（template_id: `knowledge-hygiene-policy-05`）。

No BRV entry may cite archived blueprints as current facts.


## Skill metadata hygiene

不得把仅供某个 skill 内部引用的长参考资料伪装成可独立触发的 SKILL.md。

迁移原则：

1. 真正需要用户或 agent 直接触发的能力保留 SKILL.md。
2. 仅作为主 skill 参考资料的内容应放入 references/。
3. 不在 dispatch-task 运行中清理其它 skill 的目录结构；这类迁移必须单独执行。
4. 迁移前必须确认不会破坏现有 skill discovery。

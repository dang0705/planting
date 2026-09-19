# Phase 1 植物身份准确性审计

## 目标

证明进入 v2 active release 的植物身份在分类层级、科属父链、接受名/异名、别名和来源上可追溯，而不是把当前测试表直接搬入新系统。

## 审计终态

```text
REUSE_AS_IS / TRANSFORM / MERGE / SPLIT / REBUILD / REJECT / QUARANTINE
```

不得存在 `PENDING`。`QUARANTINE` 不进入运行时。

## 必查内容

- 科、属、种、亚种、变种、变型、杂交种、栽培品种和物种组。
- `spp.` 是否错误落入 species。
- 中文名、商品名和科学名是否混用。
- 重复科学名是否为别名、重复产品身份或错误数据。
- 权威来源稳定 ID、版本、父链、获取时间和证据哈希。
- 从输入快照到 v2 种子数据的可重复生成。

## Go/Stop

GO：所有拟发布身份有权威证据、父链一致、taxon key 唯一、强别名无歧义、空库导入与读回通过。

STOP：任何 active 身份的关键父链无法证明、来源未固定、重复键未解释或混合分类仍被当作 species。


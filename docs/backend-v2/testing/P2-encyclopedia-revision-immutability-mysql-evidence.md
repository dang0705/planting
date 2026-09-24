# P2 展示百科修订不可改稿：本地 MySQL 证据

- 对应任务：[P2 CMS 分类、百科和发布](https://app.clickup.com/t/z8v0kmr971)。
- Expected：[CMS 展示百科补全 Worker](../implementation/cms-enrichment-worker.md) 中“草稿修订与审核的内容边界”；审核绑定确切修订后，改稿必须新建修订，原地修改内容、摘要、来源或归属必须由数据库拒绝。
- 层次：`unit_real_data`。真实 MySQL 8.4、真实 001/002/012 DDL；无 CloudBase、CMS、HTTP、Qwen 或发布服务调用。

## RED 与 GREEN

- RED：在 001/002 建表后绑定 `cms_review_items.draft_revision_internal_id`，更新同一修订的 `display_content_json + content_hash` 以及单独更新 `content_hash` 均被 MySQL 接受；目标测试 2 失败、1 通过，证实原外键不能防止审核后改稿。
- GREEN：按 manifest 执行 `012_plant_encyclopedia_revision_immutability.sql` 后，原地改稿、只改摘要、只改来源均被 MySQL 拒绝；仅推进修订审核状态仍可成功。目标测试 3/3 通过。
- 全量空库 MySQL 测试：16 个文件、58 个测试通过；默认非 MySQL 测试：83 个文件、473 个测试通过；TypeScript 类型检查通过。数据库迁移清单逐文件 SHA 校验仍由总 DDL 和空库测试覆盖。

## 验收边界

这只证明修订行的内容不可原地改写，不证明 CMS 审核人身份可信、审核状态写入受授权、内容摘要计算正确、发布事务及活动指针切换、贡献奖励发放、CloudBase MySQL 或真实用户 API 已完成。正式发布仍受植物身份 active release 的准入门约束。

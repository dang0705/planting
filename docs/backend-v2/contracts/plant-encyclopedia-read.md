# 植物百科 SQL 公开读取合同

- 合同版本：`plant-encyclopedia-read/v1`
- 负责域：plant-knowledge
- 票据：`z8v0kmr971` 的 E02 公开读取子项
- 来源：用户批准整体计划 §3.2；OpenViking 已确认的学名 slug 规则；测试库 information_schema 与龟背竹展示行只读核验。+
## 入口与定位

`GET /api/v2/plant-knowledge/encyclopedia/{scientificNameSlug}?catalogTaxonRef=...`

公开、只读、无个性化、无需幂等键。目录引用必须为非空字符串，最长 512 个 Unicode 码点（对应来源列）；slug 为非空字符串，最长 512 个码点。不裁剪分类引用，不把它当作身份或 API ID。+
以分类引用精确查询可搜索的 `plant_search_documents`，按 `taxon_id` 关联 `tropicals_species_encyclopedia_ref`。服务端从百科行的 `scientific_name` 推导 slug 并与路径严格比较。+
推导规则：学名做 NFC 规范化；保留文字、数字、组合标记和空白，移除引号、标点及符号；裁剪首尾空白，将连续空白折为一个连字符，转为小写。例：`Monstera deliciosa 'Thai Constellation'` → `monstera-deliciosa-thai-constellation`。不假设 slug 全局唯一。+
## 成功 DTO

响应为 `{ data: PlantEncyclopediaResponse }`，只含下列字段：+
| 字段 | 来源与类型 |
|---|---|
| catalogTaxonRef | taxon_id，字符串 |
| scientificNameSlug | 服务端推导，字符串 |
| displayName | name，非空字符串 |
| scientificName | scientific_name，非空字符串 |
| additionalNames | additional_names_json，字符串数组 |
| taxonomy | rank、order、family、genus，分别来自 taxon_rank、order_name、family、genus；可空字符串 |
| description | description，可空字符串 |
| sections | morphology、distribution、varieties、habitat、propagation、commercial、pests，分别来自七个 bio_* 展示列；可空字符串 |
| careDisplay | difficulty、temperatureRange、humidityRange、lightRequirement，分别来自对应展示列；可空字符串，仅供展示 |
| coverImage | 首版为 null；没有逐图核验许可的准入策略，不输出来源 URL |
| attribution | name=`Tropicals.cn`、sourceUrl=`https://tropicals.cn/datasets`、licenseUrl=`https://creativecommons.org/licenses/by/4.0/` |

文本按 Tropicals 官方数据集的 CC BY 4.0 条款署名；文本许可不推定图片许可。来源：<https://tropicals.cn/datasets>。+
缺 nameEn、COL、价格、内部身份不阻断展示。没有内部身份发布也可以读取百科。禁止返回数据库 id、原始来源 JSON、性状审核证据、模型内容、平台标识。展示文字不进入 Care、Diagnosis 或 Safety。+
## 错误与边界

- 参数缺失、长度非法或分类引用与路径 slug 不匹配：400 `VALIDATION_FAILED`，`请求参数不合法`。
- 不存在可搜索目录或关联百科行：404 `NOT_FOUND`，`植物百科不存在`。
- 数据库异常、重复定位、必填展示列损坏或别名 JSON 非字符串数组：500 `INTERNAL_ERROR`，`服务暂时不可用`。
- 空值保留为 null；不把 null 转为零、不填假英文名或价格。
- 不请求 Tropicals 实时 API，不确认身份，不写植物、养护、诊断或同步数据。

## Expected 与验收

L3 `unit_fake` 验证真实 HTTP、输入校验、严格白名单、空值、错误、公开安全边界；数据库替身不证明 SQL 关联。
独立 MySQL→HTTP 验证参数化精确分类引用、非唯一 slug、不可搜索行与未发布身份隔离；不冒充生产网关或全量迁移验收。

# 和风逐小时温湿度证据标准化

归属 E04／`z8v0kmr973`，当前入口只处理已有天气适配器使用的 `/v7/weather/24h` 公制响应。它是室内估算的上游数据整理，不是室内估算器；不执行网络、缓存、重试、持久化或正式建议。

## 权威字段与时间含义

来源：[v7逐小时预报](https://dev.qweather.com/docs/api/weather/weather-hourly-forecast-webapi-v7/)、[单位](https://dev.qweather.com/docs/resource/unit/)、[时间与地点词汇表](https://dev.qweather.com/docs/resource/glossary/)。

| 来源 | 标准化含义 |
|---|---|
| 显式请求 `unit=m` + `hourly.temp` | 摄氏温度；数字字符串，缺失不得变成0 |
| `hourly.humidity` | 相对湿度百分数；不自动乘100 |
| `hourly.fxTime` | 预报有效时刻；保留原带偏移时间并解析为UTC |
| `updateTime` | Provider最近更新时间；不等于气象数据源发布时间 |
| 本地捕获时刻 | 实际何时取得这份制品；与预报有效时刻分别记录 |
| 请求 `location` | 城市／POI LocationID或经度在前的坐标查询值；不表示植物位置或室内实测点 |

响应未包含足以判定温湿度是瞬时量还是前／后一小时均值的元数据，输出 `aggregation=unspecified`；不生成一小时平均区间或积分结果。后续按时间配对、插值或积分需有独立明确合同。天气始终 `spatialScope=outdoor`、`evidenceKind=forecast`。

## 硬规则与缺失处理

- 请求端点与公制标志必须显式提供；不默认单位、不把新v1或网格接口当本合同。新接口的湿度0～1不能套用旧百分数口径。
- 根响应必须为成功的v7对象；非成功码、缺更新时间、无效时间、空时序、重复／倒序有效时刻、非对象时序项整份拒绝。重复按UTC时刻判断，不按原字符串比较。
- 时间必须有显式偏移或Z，接受官方带冒号或不带冒号的偏移格式；不存在的日期不得被Date自动滚到下月。零时差也是明确时区。
- 温湿度缺失、空串、错误类型、非有限数或非法数字文本保留为null并附字段原因；有效0°C和0%RH必须保留。温度不能低于绝对零度，相对湿度不能超出0～100；不裁剪非法值。
- 缺小时保留为缺段，不补值、不自动生成预测区间；不因字段缺失而删掉相应有效时刻。
- 保存原始制品的SHA-256、捕获时刻、请求地点及来源类型，只输出允许的温湿度字段。来源类型明确区分真实Provider响应与官方文档示例。原始响应、凭证、URL和未使用字段不进入输出。
- 不作新鲜度或生产准入判断。配置目录中的和风Provider、超时、缓存新鲜度仍为pending，本能力不提供隐式值，也不解锁网络调用。

## Expected与验收

`fixtures/qweather-v7-hourly-documentation.json`只截取官方示例的code、updateTime及前两个小时的fxTime/temp/humidity，数值未改。它是 `provider_documentation_fixture`，不是实时API记录，不能充当真实和风验收。

Vitest L1：官方示例映射、时区等价／日界／非法日期、0与空值、部分缺失保留、重复与倒序拒绝、新旧接口和单位隔离、输入不变与重复运行一致。Expected来自上述官方字段合同及本计划的outdoor／缺失／来源硬边界。未覆盖真实HTTP、Provider认证、时效策略、室内场景误差及浇水模型。

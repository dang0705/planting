# Open-Meteo 辐射区间归一化内部合同

状态：E04 真实制品离线回放；原票 `z8v0kmr973`。不启用正式 Provider、不定义缓存、重试或成本参数。

依据 [Open-Meteo 官方参数定义](https://open-meteo.com/en/docs)：`hourly` 辐射均值属于标签时刻之前一小时，`minutely_15` 属于之前15分钟。`timeformat=unixtime` 返回 UTC Unix 秒；不得再次加 `utc_offset_seconds`。该偏移与 IANA 地点时区只作为地点来源元数据保留。

输入必须明确选择一个序列，提供已取得响应、非空来源引用与获取毫秒时刻。响应必须有有效地点时区、整数 UTC 偏移、`time=unixtime` 和三个辐射单位 `W/m²`，以及等长的时间、GHI、DNI、DHI 数组。分别映射 `shortwave_radiation`、`direct_normal_irradiance`、`diffuse_radiation`；不混用水平面 direct_radiation 或 `*_instant`。

AJV（JSON Schema 校验器）拒绝结构、单位、非法数值；额外 Provider 字段允许存在，但不消费。每条时间为安全整数 Unix 秒，转换后的时间及区间边界必须可安全表示。非负有限数值与明确 `null` 分别保留；数值字符串、缺数组或负辐射拒绝。

输出区间 `intervalEndMs=标签秒×1000`，`intervalStartMs=intervalEndMs−序列时长`，语义固定 `interval_mean`。三个辐射分量有独立参考平面：GHI/DHI 为户外水平面，DNI 为太阳法向。保留序列分辨率、来源、获取时刻、地点时区和偏移，标明 `model_estimate_or_forecast`，不能把过去时段称为现场观测。

按结束时刻排序；完全相同样本去重，同时间不同值或其他区间重叠拒绝。缺时间标签保留实际缺段，不延长相邻样本，不补零。不同时读小时与15分钟序列混算。中国地区15分钟值可能由小时值插值，分辨率不能作为测量精度证明。

例如地点一天的00:00标签覆盖的是前一天23:00至00:00；若最后标签是当日23:00，则没有当日23:00至24:00这一段。请求覆盖范围由后续已发布 Provider 策略负责，本用例不宣称这样的响应已经完整覆盖当地一天。

本用例只解析已取得制品，不联网、不写数据库或建议。不能将区间平均 DNI 直接输入仅消费瞬时辐射的窗面投影用例；时间步近似及误差仍需单独准入。

# 室内温湿度候选：UCI 固定样本离线验证

本验证使用 [UCI 家电能耗预测数据集](https://archive.ics.uci.edu/dataset/374/appliances%2Benergy%2Bprediction)，许可为[署名 4.0 国际（CC BY 4.0）](https://creativecommons.org/licenses/by/4.0/)。署名：Candanedo, L.（2017），Appliances Energy Prediction，DOI：10.24432/C5VC8G；作者论文为 Candanedo、Feldheim、Deramaix（2017），《低能耗住宅家电能耗的数据驱动预测模型》，Energy and Buildings 140，81–97，DOI：10.1016/j.enbuild.2017.01.083。[作者仓库](https://github.com/LuisM78/Appliances-energy-prediction-data)提供数据与论文署名要求。

原始制品可从 [UCI 压缩包](https://archive.ics.uci.edu/static/public/374/appliances%2Benergy%2Bprediction.zip)或[作者 CSV](https://raw.githubusercontent.com/LuisM78/Appliances-energy-prediction-data/master/energydata_complete.csv)获取。本次取用的 [UCI 原始 CSV](https://archive.ics.uci.edu/ml/machine-learning-databases/00374/energydata_complete.csv) 的 SHA-256 为 `2820bf712ad0275cb18b85a05250926100d8e65ebb9f4d2d016ca91ea152a25d`。本仓库仅筛选日期和字段，保留数值文本并统一换行为 LF；[固定子集](./fixtures/uci-living-room-winter.csv)含 6049 条数据及表头，731967 字节，SHA-256 为 `268be2fc6e8367cd0c8c9530db148a7735991ef16543968da47df116960ed965`。

## 字段与观测边界

字段含义以[作者字段说明](https://github.com/LuisM78/Appliances-energy-prediction-data/blob/master/variables%20description.txt)为依据。

| 字段 | 本次用途与单位 |
| --- | --- |
| `date` | 原记录日期时间；只按相对秒推进，不宣称原始采集时区已证实为 UTC |
| `T2`、`RH_2` | 客厅温度（°C）与相对湿度（%） |
| `T_out`、`RH_out` | 比利时 Chièvres 机场室外温度（°C）与相对湿度（%） |
| `Press_mm_hg` | 机场压力（mmHg）；未证实其为站点压力还是海平面修正压力 |

室内传感器节点约每 3.3 分钟上传数据并归并为 10 分钟均值；机场小时天气插值后与记录时间合并。本实验暂将均值视为记录时刻的状态，将每段起点机场天气视为该 600 秒内的常边界。压力按 `mmHg × 0.1333224` 换算为 kPa，依据 [NIST 单位换算表](https://nvlpubs.nist.gov/nistpubs/Legacy/SP/nistspecialpublication811e2008.pdf)。水汽压亏缺（VPD）参考值由记录的温湿度均值计算，并非直接测得的 VPD，也不等于该时段 VPD 的平均值。

数据来自一栋低能耗住宅，机场天气不能证明房屋外墙附近的实际天气。数据缺少太阳辐射与明确的空调运行状态、设定值，因此拟合得到的常数净热源和净湿源不能解释为真实房屋物理参数，也不能移作中国住宅通用值。

## 固定验证设计

固定窗口为 `2016-01-12 00:00:00` 至 `2016-02-23 00:00:00`（含两端），相邻记录间隔均为 600 秒。校准只使用早于 `2016-02-09 00:00:00` 的 4032 行、4031 个推进区间；验证使用从该时刻起的 2017 行、2016 个推进区间。两部分不共享训练行，拟合不读取验证结果。

验证只使用首条室内温湿度作为一次初态锚点，随后递推温度与含湿比（水蒸气质量/干空气质量），不回灌后续室内真值。每段采用起点室外边界；终点含湿比按终点记录压力转换成相对湿度和 VPD。机场天气与压力来自已知历史记录，因此这是回顾性离线验证，不是真实未来天气预报验收。

同一验证窗口比较候选、训练室内均值、室外直接作为室内三种输出。后两项仅为诊断对照，不是产品降级策略。拟合系数只属于这一实验，不是生产默认；算法发布（`algorithm_release`）仍待确认，生产准入为 `false`。

## 固定样本结果

完整结果以 [结果 JSON](./indoor-climate-real-data-results.json)为准。三组均产生全部 2016 个验证输出。下表为平均绝对误差（MAE），相对湿度误差单位为百分点。

| 方法 | 温度（°C） | 相对湿度（百分点） | VPD（kPa） |
| --- | ---: | ---: | ---: |
| 一阶热湿候选 | 1.049398 | 1.402966 | 0.111475 |
| 训练室内均值 | 0.937968 | 2.916328 | 0.087541 |
| 室外直接作为室内 | 15.664005 | 47.776109 | 1.266615 |

候选的温度与 VPD 误差高于训练均值对照。本样本不能证明候选比简单对照更有用，不构成发布资格或真实预报验收。

## 复现

在 `cloudfunctions-v2` 目录使用已锁定的 TypeScript 编译器和 Node.js 22 执行；结果写入临时目录，不覆盖仓库制品。

```sh
node_modules/.bin/tsc scripts/replay-indoor-climate-benchmark.ts \
  --module node16 --moduleResolution node16 --target ES2022 \
  --strict --skipLibCheck --outDir /tmp/planting-indoor-climate-benchmark
node /tmp/planting-indoor-climate-benchmark/scripts/replay-indoor-climate-benchmark.js \
  models/care/fixtures/uci-living-room-winter.csv \
  /tmp/planting-indoor-climate-real-data-results.json
```

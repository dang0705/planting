/** NOAA固定公式对年内角的赤纬导数绝对值上界，不是运营参数。 */
const declinationDerivative = 0.399912 + 0.070257 + 2 * 0.006758 + 2 * 0.000907 + 3 * 0.002697 + 3 * 0.00148
/** 时间方程对年内角的导数绝对值上界，单位分钟每弧度。 */
const equationDerivative = 229.18 * (0.001868 + 0.032077 + 2 * 0.014615 + 2 * 0.040849)
/** 平年年内角变化更快，取其上界同时覆盖闰年，单位弧度每秒。 */
const gammaRate = 2 * Math.PI / (365 * 86400)

/**
 * 太阳单位方向向量导数范数上界，每秒；含赤纬及太阳时两种旋转变化。
 * 仅在同一UTC年内适用；年界切换须分段。依据solar-interval-bound-contract.md。
 * 数学公式覆盖近似模型自身，不包含现场模型误差或浮点运算认证。
 */
export const solarDirectionMaxRatePerSecond = declinationDerivative * gammaRate + 2 * Math.PI / 86400 + Math.PI / 720 * equationDerivative * gammaRate

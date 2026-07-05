export const SUBSTRATE_LABEL_MAP = {
  general: '田园土',
  coco: '椰糠',
  ceramsite: '陶粒',
  peat: '泥炭土',
  perlite: '珍珠岩',
  bark: '树皮',
  sphagnum: '水苔',
  gritty: '颗粒土',
  coarse_sand: '粗砂'
}

export const REASON_CODE_LABEL_MAP = {
  OVERWATERING_RISK_WARNING: '可能浇多了',
  CHECK_SOIL_BEFORE_WATERING: '先检查土壤',
  INCREASE_WATERING_FREQUENCY: '该浇水了',
  RECENT_THOROUGH_WATERING: '最近刚浇透',
  STRONG_WET_ENVIRONMENT: '最近天气很湿',
  HOT_DRY_FORECAST: '接下来又热又干',
  NO_RECENT_WATERING: '有一阵没浇了',
  BASELINE_INTERVAL: '按正常节奏来',
  MIST_DOES_NOT_OFFSET_DRY: '喷一下不够，要浇透',
  NO_DRAINAGE_NARROW_BOTTOM: '盆没孔要少浇',
  DRY_SUPPRESSED_BY_WET_ENVIRONMENT: '天气湿，先别急着浇',
  AMOUNT_ML_CONFLICTS_WITH_AMOUNT_LABEL: '上次浇水量记录有出入',
  WET_ENVIRONMENT_AMOUNT_REDUCED: '天气湿，少浇点',
  USER_DOSE_ANCHORED: '参考了你平时的浇水量'
}

export function todayStr() {
  const date = new Date()
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0')
  ].join('-')
}

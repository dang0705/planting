/** 固定研究子集中的一盆；原表行号用于追溯，不是产品植物标识。 */
export interface PotMassRecord {
  readonly sourceRow: number
  /** 四次连续观察的盆重，单位克；不假设相邻观察严格相隔24小时。 */
  readonly weightsG: readonly number[]
}

/**
 * 从前两次观察作固定起点预测，后两次只用于评分。
 * 保持重量与延续最近重量差均为离线对照，不是缺数据时的生产降级策略。
 * 未知浇水史不参与本实验；研究数据也不构成盆土安全门或施水量依据。
 */
export function compareMassForecasts(records: readonly PotMassRecord[]) {
  if (!Array.isArray(records) || records.length === 0) { throw new RangeError('称重研究记录为空') }
  const seen = new Set<number>()
  for (const row of records) {
    if (!row || !Number.isSafeInteger(row.sourceRow) || row.sourceRow < 1 || seen.has(row.sourceRow)) {
      throw new RangeError('研究行号缺失、非法或重复')
    }
    seen.add(row.sourceRow)
    if (!Array.isArray(row.weightsG) || row.weightsG.length !== 4 ||
        Array.from(row.weightsG).some(value => typeof value !== 'number' || !Number.isFinite(value) || value < 0)) {
      throw new RangeError('四次称重必须完整且为非负有限数，缺失不能补零')
    }
  }
  const predictions = records.map(row => {
    const previous = row.weightsG[0]!
    const current = row.weightsG[1]!
    const loss = previous - current
    const recentLossG = [current - loss, current - 2 * loss]
    if (recentLossG.some(value => !Number.isFinite(value))) { throw new RangeError('预测数值溢出') }
    // 不钳制负预测，也不把观察到的重量增加改成零失水，避免隐藏对照方法失效。
    return { sourceRow: row.sourceRow, persistenceG: [current, current], recentLossG }
  })
  /** 按观察步汇总，偏差正值表示预测重量偏高。 */
  const score = (model: 'persistenceG' | 'recentLossG', step: number) => {
    const errors = predictions.map((prediction, index) => prediction[model][step]! - records[index]!.weightsG[step + 2]!)
    return {
      observationStep: step + 1,
      count: errors.length,
      maeG: errors.reduce((sum, value) => sum + Math.abs(value), 0) / errors.length,
      biasG: errors.reduce((sum, value) => sum + value, 0) / errors.length,
      negativePredictions: predictions.filter(prediction => prediction[model][step]! < 0).length,
    }
  }
  const comparisons = [0, 1].map(step => {
    let persistenceBetter = 0
    let recentLossBetter = 0
    let ties = 0
    for (const [index, prediction] of predictions.entries()) {
      const actual = records[index]!.weightsG[step + 2]!
      const persistenceError = Math.abs(prediction.persistenceG[step]! - actual)
      const recentLossError = Math.abs(prediction.recentLossG[step]! - actual)
      if (persistenceError < recentLossError) { persistenceBetter++ }
      else if (recentLossError < persistenceError) { recentLossBetter++ }
      else { ties++ }
    }
    return { observationStep: step + 1, persistenceBetter, recentLossBetter, ties }
  })
  return {
    scope: 'arabidopsis_fixed_origin_mass_comparison',
    productionAdmission: false as const,
    unit: 'g',
    horizonBasis: 'observation_step',
    predictions,
    scores: {
      persistence: [0, 1].map(step => score('persistenceG', step)),
      recentLoss: [0, 1].map(step => score('recentLossG', step)),
    },
    comparisons,
  }
}

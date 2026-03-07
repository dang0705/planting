/**
 * 天气服务配置
 */
export const WEATHER_CONFIG = {
  /**
   * 🔴 缓存开关（一键控制前后端缓存）
   *
   * true  - 启用缓存（次日0点过期，节省API调用）
   * false - 禁用缓存（每次调用API，实时数据）
   *
   * 修改此值后，前后端缓存策略会同步生效
   */
  USE_CACHE: true, // 🔴 当前：禁用缓存（测试模式）

  /**
   * 默认位置（上海）
   */
  DEFAULT_LOCATION: {}
}

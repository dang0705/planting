/**
 * 判断当前 active 用户植物数量是否已经到达请求级能力快照规定的上限。
 *
 * @param currentActiveCount 在同一用户行锁保护下从 Repository 读取的 active 数量；归档植物不计入。
 * @param activeUserPlantLimit subscription 域请求级不可变能力快照中的数量上限，不得自行提供默认值。
 * @returns 当前数量大于或等于快照上限时返回 `true`，调用方必须拒绝创建或重新激活。
 * @remarks 调用前由领域/Repository 校验两项均为非负安全整数；本函数不访问数据库或配置。
 */
export function isUserPlantCapacityReached(
  currentActiveCount: number,
  activeUserPlantLimit: number
): boolean {
  return currentActiveCount >= activeUserPlantLimit
}
